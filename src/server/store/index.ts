import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Commit, CommitResult } from "./commit";
import { demoStore } from "./memory";
import { commitToDb, readFromDb } from "./postgres";
import type { TableName, Tables } from "./schema";

/** Cache tag for private club data; invalidated after every successful commit. */
export const PRIVATE_TAG = "club-private";

export type StoreMode = "postgres" | "sheets" | "demo" | "unconfigured";

/**
 * - postgres:     DATABASE_URL → the club database (Neon). The source of truth.
 * - sheets:       CLUB_API_URL + CLUB_API_SECRET → the old spreadsheet via Apps Script
 *                 (before the move to the database; still used once to copy the data over)
 * - demo:         nothing connected → in-memory demo data with demo logins
 *                 (member and admin screens can be tried; nothing real is stored)
 * - unconfigured: DEMO_MODE=false without a data store → member features show "준비 중"
 */
export function storeMode(): StoreMode {
  if (process.env.DATABASE_URL) return "postgres";
  if (process.env.CLUB_API_URL && process.env.CLUB_API_SECRET) return "sheets";
  if (process.env.DEMO_MODE === "false") return "unconfigured";
  return "demo";
}

export class StoreUnavailableError extends Error {
  constructor() {
    super("Member data is not configured (CLUB_API_URL / CLUB_API_SECRET).");
  }
}

export class GatewayError extends Error {}

async function callGateway<T>(action: string, payload: Record<string, unknown>, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(process.env.CLUB_API_URL!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, secret: process.env.CLUB_API_SECRET, ...payload }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
  if (!res.ok || !body) throw new GatewayError(`Apps Script ${action} failed (HTTP ${res.status})`);
  if (body.ok === false && body.error !== "conflict" && body.error !== "invalid") {
    throw new GatewayError(`Apps Script ${action} error: ${body.error ?? "unknown"}`);
  }
  return body;
}

async function readFromSheets(tables: TableName[]): Promise<Tables> {
  const body = await callGateway<{ tables: Tables }>("read", { tables });
  return body.tables;
}

/** The live store: the database once it is connected, otherwise the sheet. */
function readSource(tables: TableName[]): Promise<Tables> {
  return storeMode() === "postgres" ? readFromDb(tables) : readFromSheets(tables);
}

/** Shared, short-lived cache of private tables (server-side only, never sent to other users). */
async function readFromSheetsCached(key: string): Promise<Tables> {
  "use cache: remote";
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  cacheTag(PRIVATE_TAG);
  return readSource(key.split(",") as TableName[]);
}

/**
 * Admin screens. Shorter-lived than the member cache so edits made directly in
 * the sheet show up within about a minute; every write through the site clears
 * it at once (PRIVATE_TAG). Approvals and other actions never rely on it: they
 * re-check the operator and re-read the live sheet (operatorForAction, runCommit).
 */
async function readAdminCached(key: string): Promise<Tables> {
  "use cache: remote";
  cacheLife({ stale: 30, revalidate: 30, expire: 60 });
  cacheTag(PRIVATE_TAG);
  return readSource(key.split(",") as TableName[]);
}

/** Cache tag of the radio playlist; adding or deleting a track clears it. */
export const RADIO_TAG = "club-radio";

/** The radio page polls every ~20 s, so its shared cache turns over quickly (one sheet read per 15 s at most). */
async function readRadioCached(key: string): Promise<Tables> {
  "use cache: remote";
  cacheLife({ stale: 15, revalidate: 15, expire: 120 });
  cacheTag(RADIO_TAG, PRIVATE_TAG);
  return readSource(key.split(",") as TableName[]);
}

/** Cache tag of MOON PROBLEMS (problems + reviews); every problem/review write clears it. */
export const PROBLEMS_TAG = "club-problems";

async function readProblemsCached(key: string): Promise<Tables> {
  "use cache: remote";
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  cacheTag(PROBLEMS_TAG, PRIVATE_TAG);
  return readSource(key.split(",") as TableName[]);
}

/**
 * Reads whole tables.
 * - `fresh: true` reads the live sheet; use it for anything an operator acts on.
 *   Mutations re-verify against the live sheet regardless.
 * - `admin: true` uses the short-lived admin cache (page views only).
 * - `radio: true` uses the radio playlist cache.
 * - `problems: true` uses the MOON PROBLEMS cache.
 */
export async function readTables(
  tables: TableName[],
  opts: { fresh?: boolean; admin?: boolean; radio?: boolean; problems?: boolean } = {},
): Promise<Tables> {
  switch (storeMode()) {
    case "demo":
      return demoStore().read(tables);
    case "unconfigured":
      throw new StoreUnavailableError();
    case "postgres":
    case "sheets": {
      if (opts.fresh) return readSource(tables);
      const key = [...tables].sort().join(",");
      if (opts.radio) return readRadioCached(key);
      if (opts.problems) return readProblemsCached(key);
      return opts.admin ? readAdminCached(key) : readFromSheetsCached(key);
    }
  }
}

async function sendCommit(commit: Commit): Promise<CommitResult> {
  switch (storeMode()) {
    case "demo":
      return demoStore().commit(commit);
    case "unconfigured":
      throw new StoreUnavailableError();
    case "postgres":
      return commitToDb(commit);
    case "sheets":
      return callGateway<CommitResult>("commit", { commit }, 30_000);
  }
}

export type Planned = { commit: Commit; result?: unknown } | { refuse: string } | { noop: true };
export type CommitOutcome<R = unknown> = { ok: true; result?: R; duplicate?: boolean } | { ok: false; message: string };

/**
 * Optimistic transaction loop:
 *  read fresh → plan (business rules) → commit with checks under the sheet lock.
 *  - conflict (someone else changed the data): re-read and re-plan, up to 3 times
 *  - network failure: resend the same commit once; its id makes the retry a no-op
 *    if the first attempt actually landed
 */
export async function runCommit<R = unknown>(
  tables: TableName[],
  plan: (data: Tables) => Planned,
): Promise<CommitOutcome<R>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = await readTables(tables, { fresh: true });
    const planned = plan(data);
    if ("noop" in planned) return { ok: true };
    if ("refuse" in planned) return { ok: false, message: planned.refuse };

    let result: CommitResult;
    try {
      result = await sendCommit(planned.commit);
    } catch (error) {
      console.error("[store] commit failed, retrying once with the same id", error);
      try {
        result = await sendCommit(planned.commit);
      } catch (retryError) {
        console.error("[store] commit retry failed", retryError);
        return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
      }
    }

    if (result.ok) return { ok: true, result: planned.result as R, duplicate: result.duplicate };
    if (result.error === "invalid") {
      console.error("[store] invalid commit", result.detail, planned.commit);
      return { ok: false, message: "저장할 수 없는 변경이에요. 운영진에게 알려 주세요." };
    }
    console.warn(`[store] conflict (attempt ${attempt + 1}): ${result.detail}`);
  }
  return { ok: false, message: "다른 변경과 겹쳤어요. 새로고침 후 다시 시도해 주세요." };
}
