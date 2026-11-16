import "server-only";
import { createHash } from "node:crypto";
import { bannerKind, type BannerKind } from "@/lib/access";
import { getClubData } from "@/lib/club-data";
import { parseMoment } from "@/lib/dates";
import { cleanNickname, type ClubPeer } from "@/lib/little-club";
import type { RadioState } from "@/lib/radio";
import type { MyStamp } from "@/lib/stamps";
import type { ClubEvent, Enrollment } from "@/lib/types";
import { viewerAccess } from "./auth/access";
import { readSession } from "./auth/session";
import { getViewer, type Viewer } from "./auth/viewer";
import type { Member } from "./domain/model";
import { clubProfileOf, GUEST_KEY_PREFIX, littleClubVerdict, myBubbleOf, peersOf, type ClubBlock, type ClubProfile } from "./domain/little-club";
import { memberStamps } from "./domain/stamps";
import { loadProblemList } from "./problems";
import { loadRadio } from "./radio";
import { readTables } from "./store";
import { LITTLE_CLUB_TABLES, STAMP_TABLES, type Tables } from "./store/schema";

/**
 * THE LITTLE CLUB on the server: the gate every screen and action goes through,
 * and the data the page hands to the game. Everything here is about the signed-in
 * person only; nobody else's nickname, MBTI or stamps ever leave the server.
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

/** What the browser gets to tell people apart: an opaque id per person (not the member id or email). */
const peerId = (key: string) => createHash("sha256").update(`little-club-peer:${key}`).digest("hex").slice(0, 12);

function toPeers(tables: Tables, selfKey: string, now: number): ClubPeer[] {
  return peersOf(tables, selfKey, now).map(({ key, ...p }) => ({ id: peerId(key), ...p }));
}

/** Profiles and presence, each read on its own (a database without the presence table yet must not break profiles). */
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
    const t = await readTables(["ClubPresence"], { fresh: true });
    if (t.ClubPresence !== undefined) {
      tables.ClubPresence = t.ClubPresence;
      presenceReady = profilesReady;
    }
  } catch (error) {
    console.error("[little-club] presence read failed", error);
  }
  return { tables, profilesReady, presenceReady };
}

/** Who else is here right now (for the browser's light refresh). */
export async function loadPeers(profileKey: string, now: number): Promise<{ ready: boolean; peers: ClubPeer[] }> {
  const { tables, presenceReady } = await readClubTables();
  return { ready: presenceReady, peers: presenceReady ? toPeers(tables, profileKey, now) : [] };
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
  /** false until the database has the presence table (then the club is "just me"). */
  presenceReady: boolean;
  /** The others here right now (visible ones only). */
  peers: ClubPeer[];
  /** My one current bubble (kept on the server, so it follows me outside and across devices). */
  myBubble: string;
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
      peers: presenceReady ? toPeers(tables, profileKey, now) : [],
      myBubble: presenceReady ? myBubbleOf(tables, profileKey, now) : "",
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
    peers: profile.peers,
    myBubble: profile.myBubble,
    stamps,
    problems,
    radio,
    calendar,
    now,
    ...clubNotices(viewer, member, now),
  };
}
