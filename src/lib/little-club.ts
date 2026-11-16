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

/** A status bubble: one short line, no control characters. "" clears it. */
export function cleanBubble(input: string): string {
  return [...input.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim()].slice(0, BUBBLE_MAX).join("");
}

/** Someone counts as "here" while their presence was refreshed within this window. */
export const PRESENCE_TTL_MS = 2 * 60_000;
/** A speech bubble fades after this long. */
export const BUBBLE_TTL_MS = 30 * 60_000;

export type ClubScene = "indoor" | "outdoor";
export const isClubScene = (value: string): value is ClubScene => value === "indoor" || value === "outdoor";

/** Another person in the club, as the browser receives it (an opaque id, never a member id or email). */
export interface ClubPeer {
  id: string;
  nickname: string;
  mbti: Mbti;
  scene: ClubScene;
  x: number;
  y: number;
  bubble: string;
}

/** The tag over the player's rabbit: "별명 · MBTI". */
export const nameTag = (nickname: string, mbti: string) => `${nickname} · ${mbti}`;
