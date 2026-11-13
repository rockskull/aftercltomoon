/** MOON PROBLEMS: the shared, browser-safe bits (limits and value sets). Rules live in src/server/domain/problems.ts. */

export type ProblemStatus = "active" | "archived" | "deleted";
export type ReviewStatus = "active" | "deleted" | "hidden";
export type Feel = "easy" | "fair" | "hard";
export type SendStatus = "sent" | "projecting";

export const FEELS: readonly Feel[] = ["easy", "fair", "hard"];
export const SEND_STATUSES: readonly SendStatus[] = ["sent", "projecting"];
export const LIMITS = { title: 40, grade: 12, wall: 30, setter: 30, note: 500, beta: 1000, comment: 200 } as const;

/**
 * The club's grades: Korean bouldering gym colours, easiest first, with the YDS
 * range in brackets. Stored as the colour name ("초록"); shown as "초록 (5.10b ~ 5.10c)".
 */
export const GRADES = [
  { name: "빨강", yds: "5.0", level: "입문", swatch: "#d63a2f" },
  { name: "주황", yds: "5.9", level: "초급", swatch: "#ef8a22" },
  { name: "노랑", yds: "5.10a", level: "초중급", swatch: "#f1c232" },
  { name: "초록", yds: "5.10b ~ 5.10c", level: "중급", swatch: "#2f9d5a" },
  { name: "파랑", yds: "5.10d ~ 5.11a", level: "중상급", swatch: "#2f6fd6" },
  { name: "보라", yds: "5.11a ~ 5.11c", level: "상급", swatch: "#7a4fc8" },
  { name: "검정", yds: "5.12+", level: "고급~엘리트", swatch: "#151515" },
] as const;

export type GradeName = (typeof GRADES)[number]["name"];

export function gradeInfo(grade: string): (typeof GRADES)[number] | null {
  return GRADES.find((g) => g.name === grade.trim()) ?? null;
}

/** "초록 (5.10b ~ 5.10c)"; anything outside the colour set is shown as stored. */
export function gradeLabel(grade: string): string {
  const g = gradeInfo(grade);
  return g ? `${g.name} (${g.yds})` : grade;
}

/** Colour order (빨강 → 검정); anything else after them. */
export function compareGrades(a: string, b: string): number {
  const ia = GRADES.findIndex((g) => g.name === a.trim());
  const ib = GRADES.findIndex((g) => g.name === b.trim());
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a.localeCompare(b, "ko");
}
