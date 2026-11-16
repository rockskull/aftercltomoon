import "server-only";
import { bannerKind, type BannerKind } from "@/lib/access";
import { getClubData } from "@/lib/club-data";
import { parseMoment } from "@/lib/dates";
import { cleanNickname } from "@/lib/little-club";
import type { RadioState } from "@/lib/radio";
import type { MyStamp } from "@/lib/stamps";
import type { ClubEvent, Enrollment } from "@/lib/types";
import { viewerAccess } from "./auth/access";
import { readSession } from "./auth/session";
import { getViewer, type Viewer } from "./auth/viewer";
import type { Member } from "./domain/model";
import { clubProfileOf, littleClubVerdict, type ClubBlock, type ClubProfile } from "./domain/little-club";
import { memberStamps } from "./domain/stamps";
import { loadProblemList } from "./problems";
import { loadRadio } from "./radio";
import { readTables } from "./store";
import { LITTLE_CLUB_TABLES, STAMP_TABLES } from "./store/schema";

/**
 * THE LITTLE CLUB on the server: the gate every screen and action goes through,
 * and the data the page hands to the game. Everything here is about the signed-in
 * member only; nobody else's nickname, MBTI or stamps ever leave the server.
 */

export type ClubGate = { ok: true; viewer: Viewer; member: Member } | { ok: false; reason: ClubBlock };

/** `fresh: true` for writes (re-reads the live data, like requireParticipant). */
export async function littleClubGate(opts: { fresh?: boolean; now?: number } = {}): Promise<ClubGate> {
  if (!(await readSession())) return { ok: false, reason: "login" };
  const viewer = await getViewer({ fresh: opts.fresh });
  if (!viewer) return { ok: false, reason: "login" };
  const verdict = littleClubVerdict(viewer.member, viewer.member ? viewerAccess(viewer, opts.now) : null);
  if (!verdict.ok) return verdict;
  return { ok: true, viewer, member: viewer.member! };
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

export function clubNotices(viewer: Viewer, member: Member, now: number): ClubNotices {
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
  /** Request time (server), so the wall calendar shows the same day. */
  now: number;
  /** The club calendar (the same public schedule as the home page). */
  calendar: { events: ClubEvent[]; enrollments: Enrollment[]; now: number } | null;
}

export async function loadLittleClub(viewer: Viewer, member: Member, now: number): Promise<LittleClubData> {
  const [profile, stamps, problems, radio, calendar] = await Promise.all([
    readTables(LITTLE_CLUB_TABLES, { fresh: true })
      .then((t) => (t.ClubProfiles === undefined ? { ready: false, profile: null } : { ready: true, profile: clubProfileOf(t, member.id) }))
      .catch((error) => {
        console.error("[little-club] profile read failed", error);
        return { ready: false, profile: null };
      }),
    readTables(STAMP_TABLES)
      .then((t) => memberStamps(t, member.id).filter((s) => s.awardedAt !== null))
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
    defaultNickname: cleanNickname(member.name) ?? "",
    profileStoreReady: profile.ready,
    stamps,
    problems,
    radio,
    calendar,
    now,
    ...clubNotices(viewer, member, now),
  };
}
