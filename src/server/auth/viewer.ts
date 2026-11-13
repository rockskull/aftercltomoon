import "server-only";
import { notFound, redirect } from "next/navigation";
import { can, type Capability } from "@/lib/permissions";
import { parsePrivate, type ClubPrivate, type Member } from "../domain/model";
import { ADMIN_TABLES, PRIVATE_TABLES, type TableName, type Tables } from "../store/schema";
import { readTables, storeMode, StoreUnavailableError } from "../store";
import { googleConfigured } from "./google";
import { readSession, type SessionClaims } from "./session";

export interface Viewer {
  session: SessionClaims;
  /** null = signed in with Google but not (yet) in the Members sheet. */
  member: Member | null;
  club: ClubPrivate;
  /** The raw tables from the same read (admin pages use Proposals, Events, Ledger). */
  tables: Tables;
}

async function loadViewer(tables: TableName[], opts: { fresh?: boolean; admin?: boolean }): Promise<Viewer | null> {
  const session = await readSession();
  if (!session) return null;
  const data = await readTables(tables, opts);
  const club = parsePrivate(data);
  const member = club.members.find((m) => m.email === session.email.toLowerCase()) ?? null;
  return { session, member, club, tables: data };
}

export function loginAvailable(): { google: boolean; demo: boolean } {
  return { google: googleConfigured(), demo: storeMode() === "demo" };
}

/**
 * Who is looking, resolved against the Members sheet on every request.
 * Returns null when signed out. Authorization never trusts the cookie alone.
 */
export async function getViewer(opts: { fresh?: boolean } = {}): Promise<Viewer | null> {
  return loadViewer(PRIVATE_TABLES, opts);
}

/** For pages: signed-in viewer or a redirect to /login. */
export async function requireViewer(returnTo: string, opts: { fresh?: boolean } = {}): Promise<Viewer> {
  const viewer = await getViewer(opts);
  if (!viewer) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  return viewer;
}

export function isOperator(member: Member | null): member is Member {
  return Boolean(member && member.status === "active" && (member.role === "operator" || member.role === "admin"));
}

/**
 * For admin pages: an active operator/admin. Everyone else gets a 404, so the area's existence isn't revealed.
 * One read of ADMIN_TABLES, shared by every admin tab through the short-lived admin cache, so switching
 * tabs doesn't wait on Apps Script each time. The role shown here can lag a direct sheet edit by up to a
 * minute; every action re-checks it against the live sheet (operatorForAction).
 */
export async function requireOperator(returnTo = "/admin"): Promise<Viewer & { member: Member }> {
  const viewer = await loadViewer(ADMIN_TABLES, { admin: true });
  if (!viewer) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  if (!isOperator(viewer.member)) notFound();
  return viewer as Viewer & { member: Member };
}

/** For server actions: re-checks the role against the live sheet; null when not allowed. */
export async function operatorForAction(): Promise<(Viewer & { member: Member }) | null> {
  const viewer = await getViewer({ fresh: true });
  return viewer && isOperator(viewer.member) ? (viewer as Viewer & { member: Member }) : null;
}

/** For server actions limited by src/lib/permissions.ts (e.g. "money" → admins only); null when not allowed. */
export async function crewForAction(cap: Capability): Promise<(Viewer & { member: Member }) | null> {
  const op = await operatorForAction();
  return op && can(op.member, cap) ? op : null;
}

/** For admin pages that are admin-only (deposits, statement, ledger): operators get the same 404 as everyone else. */
export async function requireCapability(returnTo: string, cap: Capability): Promise<Viewer & { member: Member }> {
  const viewer = await requireOperator(returnTo);
  if (!can(viewer.member, cap)) notFound();
  return viewer;
}

export { StoreUnavailableError };
