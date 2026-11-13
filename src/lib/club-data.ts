import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { storeMode } from "@/server/store";
import { readFromDb } from "@/server/store/postgres";
import { publicFeed } from "@/server/store/public-feed";
import { normalizeFeed } from "./normalize";
import { buildSampleData } from "./sample-data";
import type { ClubData } from "./types";

/** Cache tag of the public schedule feed; editing an event in the admin clears it. */
export const CLUB_FEED_TAG = "club-feed";

/**
 * The current time for this request. Statuses (OPEN, CLOSED, …) depend on it,
 * so it opts the caller into request-time rendering instead of the static shell.
 */
export async function requestNow(): Promise<number> {
  await connection();
  // Demo-only test hook: DEMO_TODAY=YYYY-MM-DD shows the screens as on that day (e.g. the month-end
  // renewal notice). Ignored whenever real data is connected.
  const fake = process.env.DEMO_TODAY;
  if (fake && storeMode() === "demo" && /^\d{4}-\d{2}-\d{2}$/.test(fake)) return Date.parse(`${fake}T12:00:00+09:00`);
  return Date.now();
}

/**
 * Club schedule for the public site.
 *
 * Source of truth: the crew's Google Sheet, exposed by the Apps Script web app
 * at CLUB_API_URL (see apps-script/Code.gs). That feed only ever contains
 * public, published rows and public columns.
 *
 * Call this at request time (after `connection()`): statuses depend on "now",
 * and the sample data is generated relative to today.
 */
export async function getClubData(): Promise<ClubData> {
  if (storeMode() === "postgres") {
    try {
      return { source: "sheets", ...normalizeFeed(await fetchClubFeedFromDb()) };
    } catch (error) {
      console.error("[club-data] could not load the schedule from the database:", error);
      return { source: "error", events: [], enrollments: [] };
    }
  }
  const url = process.env.CLUB_API_URL;
  if (!url) {
    return { source: "sample", ...buildSampleData(Date.now()) };
  }

  try {
    const feed = await fetchClubFeed(url);
    return { source: "sheets", ...normalizeFeed(feed) };
  } catch (error) {
    console.error("[club-data] could not load the club feed:", error);
    return { source: "error", events: [], enrollments: [] };
  }
}

/**
 * The public schedule straight from the database: the same filter the Apps
 * Script GET applied — public, published/closed/canceled events and
 * published/closed enrollment periods, public columns only, empty cells left out.
 * Cached like the sheet feed; any event change in the admin clears it (CLUB_FEED_TAG).
 */
async function fetchClubFeedFromDb(): Promise<unknown> {
  "use cache: remote";
  cacheLife({ stale: 60, revalidate: 60, expire: 60 * 60 });
  cacheTag(CLUB_FEED_TAG);
  const tables = await readFromDb(["Events", "Enrollment"]);
  return publicFeed(tables.Events ?? [], tables.Enrollment ?? []);
}

/**
 * Apps Script is slow (often 1–2 s), so the raw feed is kept in the shared
 * remote cache for a minute: sheet edits show up within about 1–2 minutes.
 * Errors are thrown, never cached.
 */
async function fetchClubFeed(url: string): Promise<unknown> {
  "use cache: remote";
  cacheLife({ stale: 60, revalidate: 60, expire: 60 * 60 });
  cacheTag(CLUB_FEED_TAG);

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`club feed responded with HTTP ${res.status}`);

  const body: unknown = await res.json();
  if (typeof body !== "object" || body === null || (body as { ok?: unknown }).ok !== true) {
    throw new Error("club feed returned an error payload");
  }
  return body;
}
