/**
 * THE LITTLE CLUB: the browser-safe bits (value sets and input rules). Who may
 * enter is decided on the server (src/server/domain/little-club.ts).
 *
 * MBTI here is a playful choice of how your moon rabbit moves, never an
 * assessment of anyone.
 */

export const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const;
export type Mbti = (typeof MBTI_TYPES)[number];

/** What each rabbit does while idle (shown in the picker and the status line). */
export const MBTI_MOTIONS: Record<Mbti, string> = {
  INTJ: "루트 노트 넘기기",
  INTP: "홀드 관찰",
  ENTJ: "동선 지휘",
  ENTP: "즉흥 토론",
  INFJ: "달 구경",
  INFP: "쿠션 꼭 안기",
  ENFJ: "응원",
  ENFP: "신나게 인사",
  ISTJ: "장비 상자 정리",
  ISFJ: "차 나눔",
  ESTJ: "체크리스트",
  ESFJ: "간식 배달",
  ISTP: "초크 솔질",
  ISFP: "음악 감상",
  ESTP: "덤벨 컬",
  ESFP: "리듬 타기",
};

export const NICKNAME_MAX = 12;
export const BUBBLE_MAX = 30;

export function isMbti(value: string): value is Mbti {
  return (MBTI_TYPES as readonly string[]).includes(value);
}

/**
 * A nickname as shown on the rabbit's tag: trimmed, inner spaces collapsed,
 * 1–12 characters, letters/numbers/spaces and a few marks only (no angle
 * brackets, quotes or control characters). Returns null when it can't be used.
 */
export function cleanNickname(input: string): string | null {
  const value = input.normalize("NFC").replace(/\s+/g, " ").trim();
  const length = [...value].length;
  if (length < 1 || length > NICKNAME_MAX) return null;
  if (!/^[\p{L}\p{N} ._\-~!?·♡☆★]+$/u.test(value)) return null;
  return value;
}

/** A status line (the speech bubble): one short line, no control characters. "" clears it. */
export function cleanBubble(input: string): string {
  return [...input.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim()].slice(0, BUBBLE_MAX).join("");
}

// ---------------------------------------------------------------------------
// The one periodic sync (v7): while the game is on screen, one request every 30 s both says
// "this tab is here" and fetches everyone's latest status line and ON/OFF. Nothing else is
// polled; positions and motions never leave the browser.
// ---------------------------------------------------------------------------

/** How often an open, visible game syncs. */
export const SYNC_INTERVAL_MS = 30_000;
/** After failures the next try waits longer (30 → 60 → 120 s), and goes back to 30 s on success. */
export const SYNC_BACKOFF_MS = [30_000, 60_000, 120_000] as const;
/** Someone is ON while one of their game tabs signalled within this window. */
export const ONLINE_TTL_MS = 75_000;
/** Open tabs remembered per person (a cap, so the row stays tiny). */
export const MAX_SESSIONS = 6;

/** A tab's own random id (made in the browser for this page load only). */
export const isSessionId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value);

/**
 * Another person as the browser receives it: an opaque id (never the member id or email),
 * their rabbit, their current status line and ON/OFF.
 */
export interface ClubMember {
  id: string;
  nickname: string;
  mbti: Mbti;
  statusText: string | null;
  isOnline: boolean;
}

/** What POST /api/little-club/sync answers. */
export type ClubSyncResponse =
  | {
      ok: true;
      members: ClubMember[];
      /** My own line, so a change made on another device shows here too. */
      me: { statusText: string | null } | null;
      /** false while the database has no session table yet (everyone then shows OFF). */
      presence: boolean;
    }
  | { ok: false; reason: "login" | "suspended" | "unavailable" | "bad-request" };

/** The tag over a rabbit: "별명 · MBTI", or "별명 · MBTI · ON/OFF" in the game. */
export const nameTag = (nickname: string, mbti: string, online?: boolean) =>
  `${nickname} · ${mbti}${online === undefined ? "" : online ? " · ON" : " · OFF"}`;
