import "server-only";
import { createHash } from "node:crypto";
import { bannerKind, type BannerKind } from "@/lib/access";
import { getClubData } from "@/lib/club-data";
import { parseMoment } from "@/lib/dates";
import { cleanBubble, cleanNickname, type ClubMember, type ClubSyncResponse } from "@/lib/little-club";
import type { RadioState } from "@/lib/radio";
import type { MyStamp } from "@/lib/stamps";
import type { ClubEvent, Enrollment } from "@/lib/types";
import { viewerAccess } from "./auth/access";
import { readSession } from "./auth/session";
import { getViewer, type Viewer } from "./auth/viewer";
import type { Member } from "./domain/model";
import { CLUB_TABLE_MISSING, clubMembersOf, clubProfileOf, GUEST_KEY_PREFIX, isGuestKey, littleClubVerdict, planClubStatus, planSessionSignal, type ClubBlock, type ClubProfile } from "./domain/little-club";
import { memberStamps } from "./domain/stamps";
import { loadProblemList } from "./problems";
import { loadRadio } from "./radio";
import { readTables, runCommit } from "./store";
import { LITTLE_CLUB_TABLES, STAMP_TABLES, SYNC_TABLES, type Tables } from "./store/schema";

/**
 * THE LITTLE CLUB on the server: the gate every screen and action goes through,
 * and the data the page hands to the game. Everything here is about the signed-in
 * person, plus — for everyone else in the club — only their nickname, MBTI, status line and ON/OFF
 * (behind an opaque id). Nobody's stamps, member id, email, times or places leave the server.
 */

/** null member = signed in with Google but not on the member list. */
export type ClubGate = { ok: true; viewer: Viewer; member: Member | null; profileKey: string } | { ok: false; reason: ClubBlock };

/** The profile row's key: the member id, or an opaque key from the sign-in email for someone not on the list. */
function profileKeyFor(email: string, member: Member | null): string {
  if (member) return member.id;
  return GUEST_KEY_PREFIX + createHash("sha256").update(`little-club:${email.trim().toLowerCase()}`).digest("hex").slice(0, 24);
}

/** `fresh: true` for writes (re-reads the live data, like requireParticipant). */
export async function littleClubGate(opts: { fresh?: boolean } = {}): Promise<ClubGate> {
  if (!(await readSession())) return { ok: false, reason: "login" };
  const viewer = await getViewer({ fresh: opts.fresh });
  if (!viewer) return { ok: false, reason: "login" };
  const verdict = littleClubVerdict(viewer.member);
  if (!verdict.ok) return verdict;
  return { ok: true, viewer, member: viewer.member, profileKey: profileKeyFor(viewer.session.email, viewer.member) };
}

type OpenGate = Extract<ClubGate, { ok: true }>;

/** What the browser gets to tell people apart: an opaque id per person (not the member id or email). */
const peerId = (key: string) => createHash("sha256").update(`little-club-peer:${key}`).digest("hex").slice(0, 12);

/** A tab's key in the person's session map: bound to the signed-in person here, so a tab id alone can never touch another row. */
const tabKey = (profileKey: string, sessionId: string) => createHash("sha256").update(`little-club-tab:${profileKey}:${sessionId}`).digest("hex").slice(0, 20);

/** Who may still be shown to the others: anyone not suspended (keys that aren't member ids belong to signed-in guests). */
function allowedIn(viewer: Viewer): (key: string) => boolean {
  const byId = new Map(viewer.club.members.map((m) => [m.id, m]));
  return (key) => {
    if (isGuestKey(key)) return true;
    const member = byId.get(key);
    return member !== undefined && littleClubVerdict(member).ok;
  };
}

function toMembers(tables: Tables, selfKey: string, now: number, allowed: (key: string) => boolean): ClubMember[] {
  return clubMembersOf(tables, selfKey, now, allowed).map(({ key, ...m }) => ({ id: peerId(key), ...m }));
}

function meOf(tables: Tables, key: string): { statusText: string | null } | null {
  const profile = clubProfileOf(tables, key);
  return profile ? { statusText: profile.status || null } : null;
}

/** Profiles and sessions, each read on its own (a database without the session table yet must not break profiles). */
async function readClubTables(): Promise<{ tables: Tables; profilesReady: boolean; presenceReady: boolean }> {
  const tables: Tables = {};
  let profilesReady = false;
  let presenceReady = false;
  try {
    const t = await readTables(LITTLE_CLUB_TABLES, { fresh: true });
    if (t.ClubProfiles !== undefined) {
      tables.ClubProfiles = t.ClubProfiles;
      profilesReady = true;
    }
  } catch (error) {
    console.error("[little-club] profile read failed", error);
  }
  try {
    const t = await readTables(["ClubSessions"], { fresh: true });
    if (t.ClubSessions !== undefined) {
      tables.ClubSessions = t.ClubSessions;
      presenceReady = profilesReady;
    }
  } catch (error) {
    console.error("[little-club] session read failed", error);
  }
  return { tables, profilesReady, presenceReady };
}

/**
 * The one periodic request (every 30 s while the game is on screen): this tab is here, and here is
 * everyone's latest status line and ON/OFF. One read + at most one small write of the caller's own row.
 */
export async function syncClub(gate: OpenGate, sessionId: string, now: number): Promise<ClubSyncResponse> {
  const key = gate.profileKey;
  const allowed = allowedIn(gate.viewer);
  const seen: { data?: Tables } = {};
  try {
    const outcome = await runCommit(SYNC_TABLES, (data) => {
      seen.data = data;
      return planSessionSignal(data, { now, key, session: tabKey(key, sessionId) });
    });
    if (!outcome.ok && outcome.message !== CLUB_TABLE_MISSING) console.warn("[little-club] sync signal not saved:", outcome.message);
  } catch (error) {
    console.error("[little-club] sync failed", error); // e.g. no session table yet
    seen.data = undefined;
  }
  if (seen.data?.ClubProfiles !== undefined && seen.data.ClubSessions !== undefined) {
    return { ok: true, presence: true, members: toMembers(seen.data, key, now, allowed), me: meOf(seen.data, key) };
  }
  // Without the session table: status lines still come through, everyone shows OFF.
  const { tables, profilesReady } = await readClubTables();
  if (!profilesReady) return { ok: false, reason: "unavailable" };
  return { ok: true, presence: false, members: toMembers({ ClubProfiles: tables.ClubProfiles }, key, now, allowed), me: meOf(tables, key) };
}

/** Best effort when a tab is hidden or closed: drop that tab's own entry (other tabs stay ON; the TTL covers a lost request). */
export async function leaveClub(gate: OpenGate, sessionId: string, now: number): Promise<void> {
  const key = gate.profileKey;
  try {
    await runCommit(SYNC_TABLES, (data) => planSessionSignal(data, { now, key, session: tabKey(key, sessionId), leave: true }));
  } catch (error) {
    console.error("[little-club] leave failed", error);
  }
}

export type StatusResult = { ok: true; statusText: string | null } | { ok: false; message: string };

/** Save or clear the caller's own status line (on the save / clear button only). */
export async function saveClubStatus(gate: OpenGate, status: string, now: number): Promise<StatusResult> {
  try {
    const outcome = await runCommit<{ statusText: string | null }>(LITTLE_CLUB_TABLES, (data) => planClubStatus(data, { now, key: gate.profileKey, status }));
    if (!outcome.ok) return { ok: false, message: outcome.message };
    // noop (unchanged) has no result: the line is already what was sent.
    return { ok: true, statusText: outcome.result ? outcome.result.statusText : cleanBubble(status) || null };
  } catch (error) {
    console.error("[little-club] status save failed", error);
    return { ok: false, message: CLUB_TABLE_MISSING };
  }
}

/**
 * Same-site requests only for the club's API (the session cookie is SameSite=Lax already; this
 * also refuses a request another site's page makes in the background).
 */
export function fromThisSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export interface ClubProblem {
  no: number;
  code: string;
  title: string;
  grade: string;
  wall: string;
  setterName: string;
  sends: number;
  funAverage: number | null;
}

/** A membership notice for the in-game bell (the member's own, unread). */
export interface ClubNotice {
  id: string;
  title: string;
  body: string;
  /** Same-site path only. */
  url: string;
  at: string;
}

export interface ClubNotices {
  notices: ClubNotice[];
  /** The site's membership banner while it applies (renewal due / deposit being checked). */
  banner: BannerKind | null;
}

/** Membership notifications only (expiry reminders, deposit approved / rejected), as on /notifications. */
const MEMBERSHIP_NOTICE_TYPES = new Set(["membership_d7", "membership_d1", "payment_approved", "payment_rejected"]);

export function clubNotices(viewer: Viewer, member: Member | null, now: number): ClubNotices {
  if (!member) return { notices: [], banner: null };
  const notices = viewer.club.notifications
    .filter((n) => n.memberId === member.id && ["sent", "inapp"].includes(n.status) && !n.readAt && MEMBERSHIP_NOTICE_TYPES.has(n.type))
    .filter((n) => (parseMoment(n.scheduledAt)?.ms ?? 0) <= now)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .slice(0, 5)
    .map((n) => ({ id: n.id, title: n.title, body: n.body, url: n.url.startsWith("/") && !n.url.startsWith("//") ? n.url : "/notifications", at: n.scheduledAt }));
  const kind = bannerKind(viewerAccess(viewer, now));
  return { notices, banner: kind === "renew" || kind === "renew_pending" ? kind : null };
}

export interface LittleClubData extends ClubNotices {
  profile: ClubProfile | null;
  /** Prefill for the first visit (the member's name when it fits the nickname rule). */
  defaultNickname: string;
  /** false when the database doesn't have the profile table yet. */
  profileStoreReady: boolean;
  /** Stamps the member has really received (nothing is ever issued by the game). */
  stamps: MyStamp[] | null;
  /** Active MOON PROBLEMS (null when they couldn't be read). */
  problems: ClubProblem[] | null;
  radio: RadioState | null;
  /** false until the database has the session table (then everyone shows OFF). */
  presenceReady: boolean;
  /** Everyone else in the club, ON or OFF, with their status line (the first sync refreshes it). */
  members: ClubMember[];
  /** Request time (server), so the wall calendar shows the same day. */
  now: number;
  /** The club calendar (the same public schedule as the home page). */
  calendar: { events: ClubEvent[]; enrollments: Enrollment[]; now: number } | null;
}

export async function loadLittleClub(viewer: Viewer, member: Member | null, profileKey: string, now: number): Promise<LittleClubData> {
  const [profile, stamps, problems, radio, calendar] = await Promise.all([
    readClubTables().then(({ tables, profilesReady, presenceReady }) => ({
      ready: profilesReady,
      profile: profilesReady ? clubProfileOf(tables, profileKey) : null,
      presenceReady,
      members: profilesReady ? toMembers(tables, profileKey, now, allowedIn(viewer)) : [],
    })),
    (member ? readTables(STAMP_TABLES) : Promise.resolve(null))
      .then((t) => (t && member ? memberStamps(t, member.id).filter((s) => s.awardedAt !== null) : []))
      .catch((error) => {
        console.error("[little-club] stamps read failed", error);
        return null;
      }),
    loadProblemList()
      .then((list) =>
        list.ready
          ? list.problems
              .filter((p) => p.status === "active")
              .map((p) => ({ no: p.no, code: p.code, title: p.title, grade: p.grade, wall: p.wall, setterName: p.setterName, sends: p.stats.sends, funAverage: p.stats.funAverage }))
          : null,
      )
      .catch((error) => {
        console.error("[little-club] problems read failed", error);
        return null;
      }),
    loadRadio().catch((error) => {
      console.error("[little-club] radio read failed", error);
      return null;
    }),
    getClubData()
      .then((d) => (d.source === "error" ? null : { events: d.events, enrollments: d.enrollments, now }))
      .catch(() => null),
  ]);
  return {
    profile: profile.profile,
    defaultNickname: cleanNickname(member?.name || viewer.session.name || "") ?? "",
    profileStoreReady: profile.ready,
    presenceReady: profile.presenceReady,
    members: profile.members,
    stamps,
    problems,
    radio,
    calendar,
    now,
    ...clubNotices(viewer, member, now),
  };
}
