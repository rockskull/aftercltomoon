/**
 * MOON STAMPS — six, fixed. The artwork is a finished static asset per stamp
 * (public/stamps/*.svg, made once by scripts/stamps/build-stamps.mjs); the
 * database only records who received which stamp and when. Every stamp is
 * issued by hand by the crew (no automatic judging).
 *
 * ST-02 is "100 HOLDS" (one designated 100-hold endurance problem, topped once —
 * not 100 tops, not 100 problems, not holds added up over time). ST-05 SIX MOONS
 * and ST-06 TWELVE MOONS mark registering a 6+1 / 12+2 membership (not simply
 * being a member for that long). ST-05 is new — not the dropped "ON AIR".
 */

export const STAMP_IDS = ["ST-01", "ST-02", "ST-03", "ST-04", "ST-05", "ST-06"] as const;
export type StampId = (typeof STAMP_IDS)[number];

export interface StampInfo {
  id: StampId;
  name: string;
  /** What earns it (shown to members, Korean). */
  description: string;
  /** Static artwork key → /stamps/<key>.svg */
  imageKey: string;
  /** Small line under the name ("6 + 1 MONTHS"). */
  subtitle?: string;
  /** English line for the share image. */
  motto?: string;
}

/** Defaults; the StampDefinitions table may reword the name/description or turn a stamp off. */
export const STAMP_CATALOG: readonly StampInfo[] = [
  { id: "ST-01", name: "FIRST MOON", description: "첫 클럽 방문", imageKey: "st-01" },
  { id: "ST-02", name: "100 HOLDS", description: "100홀드 지구력 문제 완등", imageKey: "st-02", motto: "COMPLETE THE 100-HOLD ENDURANCE CHALLENGE." },
  { id: "ST-03", name: "NIGHT OWL", description: "퇴근 후 클럽 세션 참여", imageKey: "st-03" },
  { id: "ST-04", name: "MOON HOST", description: "직접 이벤트 개최", imageKey: "st-04" },
  { id: "ST-05", name: "SIX MOONS", description: "6+1개월 회원권 등록", imageKey: "st-05", subtitle: "6 + 1 MONTHS", motto: "SIX MONTHS IN. ONE MORE ON THE MOON." },
  { id: "ST-06", name: "TWELVE MOONS", description: "12+2개월 회원권 등록", imageKey: "st-06", subtitle: "12 + 2 MONTHS", motto: "TWELVE MONTHS IN. TWO MORE ON THE MOON." },
];

/** The membership a long-registration stamp stands for (duration + bonus months), for the crew's reference. */
export const STAMP_PLAN_TERMS: Partial<Record<StampId, { durationMonths: number; bonusMonths: number }>> = {
  "ST-05": { durationMonths: 6, bonusMonths: 1 },
  "ST-06": { durationMonths: 12, bonusMonths: 2 },
};

const IMAGE_KEYS = new Set(STAMP_CATALOG.map((s) => s.imageKey));

export function isStampId(value: string): value is StampId {
  return (STAMP_IDS as readonly string[]).includes(value);
}

/** Only the bundled artworks can ever be referenced (a typo falls back to the stamp's own). */
export function stampImageSrc(imageKey: string, id: StampId): string {
  const key = IMAGE_KEYS.has(imageKey) ? imageKey : STAMP_CATALOG.find((s) => s.id === id)!.imageKey;
  return `/stamps/${key}.svg`;
}

/** One stamp as a member sees it: no award id, no operator, no private note. */
export interface MyStamp {
  id: StampId;
  name: string;
  description: string;
  subtitle: string | null;
  motto: string | null;
  imageSrc: string;
  /** "YYYY-MM-DD", "" when the sheet has no valid date, null when not received. */
  awardedAt: string | null;
}
