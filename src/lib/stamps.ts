/**
 * MOON STAMPS — exactly four, fixed. The artwork is a finished static asset
 * per stamp (public/stamps/*.svg, made once by scripts/stamps/build-stamps.mjs);
 * the sheet only records who received which stamp and when.
 */

export const STAMP_IDS = ["ST-01", "ST-02", "ST-03", "ST-04"] as const;
export type StampId = (typeof STAMP_IDS)[number];

export interface StampInfo {
  id: StampId;
  name: string;
  /** What earns it (shown to members). */
  description: string;
  /** Static artwork key → /stamps/<key>.svg */
  imageKey: string;
}

/** Defaults; the StampDefinitions tab may reword the name/description or turn a stamp off. */
export const STAMP_CATALOG: readonly StampInfo[] = [
  { id: "ST-01", name: "FIRST MOON", description: "첫 클럽 방문", imageKey: "st-01" },
  { id: "ST-02", name: "FIRST TOP", description: "클럽에서 첫 볼더링 완등", imageKey: "st-02" },
  { id: "ST-03", name: "NIGHT OWL", description: "퇴근 후 클럽 세션 참여", imageKey: "st-03" },
  { id: "ST-04", name: "MOON HOST", description: "직접 이벤트 개최", imageKey: "st-04" },
];

const IMAGE_KEYS = new Set(STAMP_CATALOG.map((s) => s.imageKey));

export function isStampId(value: string): value is StampId {
  return (STAMP_IDS as readonly string[]).includes(value);
}

/** Only the four bundled artworks can ever be referenced (a sheet typo falls back to the stamp's own). */
export function stampImageSrc(imageKey: string, id: StampId): string {
  const key = IMAGE_KEYS.has(imageKey) ? imageKey : STAMP_CATALOG.find((s) => s.id === id)!.imageKey;
  return `/stamps/${key}.svg`;
}

/** One stamp as a member sees it: no award id, no operator, no private note. */
export interface MyStamp {
  id: StampId;
  name: string;
  description: string;
  imageSrc: string;
  /** "YYYY-MM-DD", "" when the sheet has no valid date, null when not received. */
  awardedAt: string | null;
}
