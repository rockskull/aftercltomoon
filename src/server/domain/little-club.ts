import { cleanBubble, cleanNickname, isMbti, MAX_SESSIONS, ONLINE_TTL_MS, playPhase, type ClubPlay, type Mbti } from "@/lib/little-club";
import type { Planned } from "../store";
import { newId, seoulIso } from "../store/ids";
import { cellText, type Row, type Tables } from "../store/schema";

/**
 * THE LITTLE CLUB: who may enter, and the one profile row per person.
 *
 * Anyone signed in may enter (decided 2026-11-16, wider than the handoff's
 * "membership holders only"): members with or without a running membership,
 * applicants, staff, and people who signed in but aren't on the member list.
 * Only accounts the crew suspended (`inactive`) stay out. Signing in itself is
 * checked by the caller (src/server/little-club.ts).
 */

export type ClubBlock = "login" | "suspended";

export type ClubVerdict = { ok: true } | { ok: false; reason: ClubBlock };

export function littleClubVerdict(member: { status: string } | null): ClubVerdict {
  if (member?.status === "inactive") return { ok: false, reason: "suspended" };
  return { ok: true };
}

/**
 * Profile rows are keyed by the member id; a signed-in visitor who isn't on the
 * member list gets an opaque key derived on the server from their sign-in email
 * ("GUEST-…"; the email itself is never stored).
 */
export const GUEST_KEY_PREFIX = "GUEST-";
export const isGuestKey = (key: string) => key.startsWith(GUEST_KEY_PREFIX);

/**
 * Everyone who saved a rabbit is shown to the others in the club (name tag, status line, ON/OFF) —
 * there is no "only me" choice (decided 2026-11-17, instead of the v7 handoff's opt-in).
 */
export interface ClubProfile {
  nickname: string;
  mbti: Mbti;
  /** The person's current status line (the speech bubble); "" = none. */
  status: string;
}

/** The member's own profile, or null before the first save (a row with an unknown MBTI counts as none). */
export function clubProfileOf(tables: Tables, memberId: string): ClubProfile | null {
  const row = (tables.ClubProfiles ?? []).find((r) => cellText(r.member_id) === memberId);
  if (!row) return null;
  const mbti = cellText(row.mbti).trim().toUpperCase();
  const nickname = cleanNickname(cellText(row.nickname));
  return nickname && isMbti(mbti) ? { nickname, mbti, status: cleanBubble(cellText(row.status)) } : null;
}

/** Shown when the database doesn't have the profile table yet (deployed before the schema update). */
export const CLUB_TABLE_MISSING = "리틀 클럽 프로필 저장소가 아직 준비되지 않았어요. 운영진이 DB 업데이트를 마치면 저장할 수 있어요.";

/** Save (first time) or change the member's nickname + MBTI. Only ever touches that member's own row. */
export function planClubProfileSave(
  data: Tables,
  ctx: { now: number; memberId: string; nickname: string; mbti: string },
): Planned {
  if (data.ClubProfiles === undefined) return { refuse: CLUB_TABLE_MISSING };
  const nickname = cleanNickname(ctx.nickname);
  if (!nickname) return { refuse: "별명은 1~12자로, 글자·숫자·띄어쓰기와 . _ - ~ ! ? · ♡ ☆ ★ 만 쓸 수 있어요." };
  const mbti = ctx.mbti.trim().toUpperCase();
  if (!isMbti(mbti)) return { refuse: "MBTI를 16가지 중에서 골라 주세요." };
  const guest = isGuestKey(ctx.memberId);
  if (!guest && !(data.Members ?? []).some((r) => cellText(r.member_id) === ctx.memberId)) return { refuse: "회원을 찾을 수 없어요." };

  const rows = data.ClubProfiles.filter((r) => cellText(r.member_id) === ctx.memberId);
  const at = seoulIso(ctx.now);
  const commitId = newId("C", ctx.now, 8);
  const current = rows[0];
  const status = current ? cleanBubble(cellText(current.status)) : "";
  if (current && cellText(current.nickname) === nickname && cellText(current.mbti) === mbti) return { noop: true };
  const audit = (before: unknown, after: unknown) => ({
    type: "append" as const,
    table: "AuditLog" as const,
    row: {
      log_id: newId("LOG", ctx.now, 6),
      commit_id: commitId,
      actor_id: ctx.memberId,
      action: "little_club.profile",
      target_id: ctx.memberId,
      before_value: before ? JSON.stringify(before) : "",
      after_value: JSON.stringify(after),
      created_at: at,
    },
  });
  if (current) {
    const before = { nickname: cellText(current.nickname), mbti: cellText(current.mbti) };
    return {
      commit: {
        id: commitId,
        checks: [{ type: "exists", table: "ClubProfiles", id: ctx.memberId, fields: before }],
        ops: [{ type: "update", table: "ClubProfiles", id: ctx.memberId, set: { nickname, mbti, updated_at: at } }, audit(before, { nickname, mbti })],
      },
      result: { nickname, mbti, status },
    };
  }
  const row = { member_id: ctx.memberId, nickname, mbti, created_at: at, updated_at: at, status: "" };
  return {
    commit: {
      id: commitId,
      checks: [
        ...(guest ? [] : [{ type: "exists" as const, table: "Members" as const, id: ctx.memberId }]),
        // Two tabs saving the first profile at once: only one row ever lands.
        { type: "absent", table: "ClubProfiles", where: { member_id: ctx.memberId } },
      ],
      ops: [{ type: "append", table: "ClubProfiles", row }, audit(null, { nickname, mbti })],
    },
    result: { nickname, mbti, status: "" },
  };
}

// ---------------------------------------------------------------------------
// The status line: the latest one only, saved when the person presses save / clear
// ---------------------------------------------------------------------------

/**
 * Set (or clear, with "") the person's one status line. Only ever their own row; no history and no
 * audit trail (it is not a record). Kept until they change it, also while they are OFF.
 */
export function planClubStatus(data: Tables, ctx: { now: number; key: string; status: string }): Planned {
  if (data.ClubProfiles === undefined) return { refuse: CLUB_TABLE_MISSING };
  const row = data.ClubProfiles.find((r) => cellText(r.member_id) === ctx.key);
  if (!row || !clubProfileOf(data, ctx.key)) return { refuse: "먼저 내 토끼를 골라 주세요." };
  if (playStateOf(data, ctx.key, ctx.now).phase === "cooldown") return { refuse: COOLDOWN_REFUSAL };
  const status = cleanBubble(ctx.status);
  if (cellText(row.status) === status) return { noop: true };
  return {
    commit: {
      id: newId("C", ctx.now, 8),
      checks: [{ type: "exists", table: "ClubProfiles", id: ctx.key }],
      ops: [{ type: "update", table: "ClubProfiles", id: ctx.key, set: { status } }],
    },
    result: { statusText: status || null },
  };
}

// ---------------------------------------------------------------------------
// ON / OFF: each open game tab signals with the periodic sync. One row per person holds a
// tiny map of their tabs' last signals; ON = any tab signalled within ONLINE_TTL_MS.
// ---------------------------------------------------------------------------

/** Server-made tab key (a hash of the person + the tab's random id), as stored in the map. */
const SESSION_KEY = /^[a-f0-9]{8,40}$/;

/** A person's tabs → last signal (epoch ms). Anything unreadable counts as no tabs. */
export function sessionsOf(row: Row | undefined): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(cellText(row?.sessions) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) if (SESSION_KEY.test(k) && typeof v === "number" && Number.isFinite(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** Tabs still counted as open at `now` (a signal from the future is ignored too). */
function liveSessions(sessions: Record<string, number>, now: number): Record<string, number> {
  return Object.fromEntries(Object.entries(sessions).filter(([, t]) => now - t <= ONLINE_TTL_MS && t - now <= 60_000));
}

/** Shown when a game request comes in while the person is waiting to come back. */
export const COOLDOWN_REFUSAL = "리틀 클럽은 잠시 쉬는 중이에요. 10분 뒤에 다시 들어올 수 있어요.";

/** The person's play window (4 minutes from entering, then a 10-minute wait), from the server's record. */
export function playStateOf(data: Tables, key: string, now: number): ClubPlay {
  const row = (data.ClubSessions ?? []).find((r) => cellText(r.member_id) === key);
  return playPhase(Number(cellText(row?.play_started_at)) || 0, now);
}

export function isOnline(data: Tables, key: string, now: number): boolean {
  const row = (data.ClubSessions ?? []).find((r) => cellText(r.member_id) === key);
  return Object.keys(liveSessions(sessionsOf(row), now)).length > 0;
}

/**
 * This tab says "I'm here" (or, with `leave`, "this tab is closing"). Only the caller's own row, and
 * only this tab's entry; other tabs of the same person stay ON. Someone without a rabbit yet keeps no
 * entries. Expired entries are dropped on every write, so no clean-up job is needed.
 *
 * The first signal with a rabbit starts the 4-minute play window (play_started_at). While a window is
 * running every tab shares it; once it is over, signals are refused (cooldown: the tab's entry is
 * dropped, nothing else changes) until 10 minutes later, when the next signal starts a new window.
 * A leave never touches the window, so going away and coming back can't reset or extend it.
 * The result is the play state after this signal (a noop answers from `playStateOf`).
 */
export function planSessionSignal(data: Tables, ctx: { now: number; key: string; session: string; leave?: boolean }): Planned {
  if (data.ClubSessions === undefined || data.ClubProfiles === undefined) return { refuse: CLUB_TABLE_MISSING };
  if (!SESSION_KEY.test(ctx.session)) return { refuse: "잘못된 요청이에요." };
  const profile = clubProfileOf(data, ctx.key);
  const row = data.ClubSessions.find((r) => cellText(r.member_id) === ctx.key);
  const before = playStateOf(data, ctx.key, ctx.now);
  // A new window starts with the first signal after the last one (and its wait) is over.
  const starts = !ctx.leave && profile !== null && before.phase === "fresh";
  const play: ClubPlay = starts ? playPhase(ctx.now, ctx.now) : before;
  let next = liveSessions(sessionsOf(row), ctx.now);
  delete next[ctx.session];
  if (!ctx.leave && profile && play.phase === "playing") next[ctx.session] = ctx.now;
  next = Object.fromEntries(Object.entries(next).sort((a, b) => b[1] - a[1]).slice(0, MAX_SESSIONS));
  const sessions = Object.keys(next).length ? JSON.stringify(next) : "";
  const current = cellText(row?.sessions);
  if (current === sessions && !starts) return { noop: true };
  if (!row && !sessions && !starts) return { noop: true };
  const at = seoulIso(ctx.now);
  const set: Row = { sessions, updated_at: at };
  if (starts) set.play_started_at = String(ctx.now);
  return {
    commit: {
      id: newId("C", ctx.now, 8),
      // Two tabs of the same person signalling at once: the second re-reads and re-plans (so only one starts the window).
      checks: row
        ? [{ type: "exists", table: "ClubSessions", id: ctx.key, fields: { sessions: current, play_started_at: cellText(row.play_started_at) } }]
        : [{ type: "absent", table: "ClubSessions", where: { member_id: ctx.key } }],
      ops: row ? [{ type: "update", table: "ClubSessions", id: ctx.key, set }] : [{ type: "append", table: "ClubSessions", row: { member_id: ctx.key, play_started_at: "", ...set } }],
    },
    result: play,
  };
}

/** One person as the sync hands them over (the caller swaps the key for an opaque id). */
export interface ClubMemberRow {
  key: string;
  nickname: string;
  mbti: Mbti;
  statusText: string | null;
  isOnline: boolean;
}

/**
 * Everyone in the club, ON or OFF, never the person asking: a saved rabbit and still allowed in
 * (`allowed`: not suspended). Nickname, MBTI, status line and ON/OFF only; no times, no tabs, no
 * places. ON people first, at most 40.
 */
export function clubMembersOf(data: Tables, selfKey: string, now: number, allowed: (key: string) => boolean): ClubMemberRow[] {
  const out: ClubMemberRow[] = [];
  for (const row of data.ClubProfiles ?? []) {
    const key = cellText(row.member_id);
    if (!key || key === selfKey || !allowed(key)) continue;
    const profile = clubProfileOf(data, key);
    if (!profile) continue;
    out.push({ key, nickname: profile.nickname, mbti: profile.mbti, statusText: profile.status || null, isOnline: isOnline(data, key, now) });
  }
  return out.sort((a, b) => Number(b.isOnline) - Number(a.isOnline)).slice(0, 40);
}
