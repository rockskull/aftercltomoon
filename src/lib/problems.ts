/** MOON PROBLEMS: the shared, browser-safe bits (limits and value sets). Rules live in src/server/domain/problems.ts. */

export type ProblemStatus = "active" | "archived" | "deleted";
export type ReviewStatus = "active" | "deleted" | "hidden";
export type Feel = "easy" | "fair" | "hard";
export type SendStatus = "sent" | "projecting";

export const FEELS: readonly Feel[] = ["easy", "fair", "hard"];
export const SEND_STATUSES: readonly SendStatus[] = ["sent", "projecting"];
export const LIMITS = { title: 40, grade: 12, wall: 30, setter: 30, note: 500, beta: 1000, comment: 200 } as const;
