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
      /** My play window (server clock), or null when it can't be told (no session table yet). */
      play: { endsAt: number } | null;
      /** Server time of this answer, so the browser can count down without trusting its own clock. */
      now: number;
    }
  /** The play window is over: the game ends (the 4-minute kick) and re-entry waits until `until`. */
  | { ok: false; reason: "cooldown"; until: number; now: number }
  | { ok: false; reason: "login" | "suspended" | "unavailable" | "bad-request" };

// ---------------------------------------------------------------------------
// Time in the club (decided 2026-11-19): one play window is 4 minutes from entering, kept on the
// server, and it keeps running while you are away (a problem page, another tab, closing the tab).
// When it ends the game sends you out (the only moment a screenshot PNG is made by itself), and you
// can come back 10 minutes after that.
// ---------------------------------------------------------------------------

export const PLAY_MS = 4 * 60_000;
export const COOLDOWN_MS = 10 * 60_000;

/** fresh = may start a new window · playing = inside one · cooldown = waiting to come back. */
export type ClubPlay = { phase: "fresh" } | { phase: "playing"; endsAt: number } | { phase: "cooldown"; until: number };

/** The window that started at `startedAt` (epoch ms; 0 = never), as of `now`. */
export function playPhase(startedAt: number, now: number): ClubPlay {
  if (!startedAt || startedAt > now + 60_000) return { phase: "fresh" };
  if (now < startedAt + PLAY_MS) return { phase: "playing", endsAt: startedAt + PLAY_MS };
  if (now < startedAt + PLAY_MS + COOLDOWN_MS) return { phase: "cooldown", until: startedAt + PLAY_MS + COOLDOWN_MS };
  return { phase: "fresh" };
}

/** "3:07" */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// THE LIVING CLUB (MVP 01): three real MOON PROBLEMS to find on the wall
// ---------------------------------------------------------------------------

export const WALL_FINDS = 3;
export const DEFAULT_WALL_MESSAGE = "THE WALL REMEMBERS. DO YOU?";
export const WALL_MESSAGE_MAX = 60;

/**
 * The crew's pick, as typed in the settings ("1, 4, 7" or "MOON 001 / 004"): MOON numbers, at
 * most three, no repeats. "" → [] (then the newest active problems are used). null = not a list.
 */
export function parseWallNumbers(input: string): number[] | null {
  const text = input.replace(/moon/gi, " ").trim();
  if (!text) return [];
  const parts = text.split(/[\s,/·]+/).filter(Boolean);
  if (!parts.every((p) => /^\d{1,4}$/.test(p))) return null;
  const numbers = [...new Set(parts.map(Number).filter((n) => n > 0))];
  return numbers.length && numbers.length <= WALL_FINDS ? numbers : null;
}

/** A wall card: only what the problem page itself shows everyone (never the hidden Tips). */
export interface WallProblem {
  no: number;
  code: string;
  title: string;
  grade: string;
  wall: string;
  setterName: string;
  setterNote: string;
  /** Real reactions only (0 / null when there are none yet). */
  reviews: number;
  sends: number;
  funAverage: number | null;
}

/** The tag over a rabbit: "별명 · MBTI", or "별명 · MBTI · ON/OFF" in the game. */
export const nameTag = (nickname: string, mbti: string, online?: boolean) =>
  `${nickname} · ${mbti}${online === undefined ? "" : online ? " · ON" : " · OFF"}`;
