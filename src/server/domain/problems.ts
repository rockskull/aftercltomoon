import { compareGrades, FEELS, gradeInfo, GRADES, LIMITS, SEND_STATUSES, type Feel, type ProblemStatus, type ReviewStatus, type SendStatus } from "@/lib/problems";
import type { Check, Op } from "../store/commit";
import { newId, seoulIso } from "../store/ids";
import { cellText, type Row, type Tables } from "../store/schema";
import { normalizeEmail, toMember, type Member } from "./model";
import { participantCheck } from "./operations";

/**
 * MOON PROBLEMS — SET BY US. CLIMBED BY US.
 * Problems are made on the wall; the crew records the finished ones here
 * (text only: no photos, hold markers or online setting). Members review them:
 * how fun, how hard it felt, sent or still projecting, and one line.
 *
 *  - Problems: operators/admins create, edit (incl. the beta), archive, delete (soft).
 *  - Reviews:  one per member per problem (the row is reused after a delete; a unique
 *              index on problem_id + member_id backs this up in the database).
 *              Members with a membership in effect only (same rule as every member write).
 *  - Stats:    from active reviews only; "sends" counts members who marked SENT (self-reported).
 */

export type { Feel, ProblemStatus, ReviewStatus, SendStatus };
export { FEELS, LIMITS, SEND_STATUSES };

export interface Problem {
  id: string;
  no: number;
  title: string;
  grade: string;
  wall: string;
  setterName: string;
  setterNote: string;
  beta: string;
  status: ProblemStatus;
  createdAt: string;
  updatedAt: string;
  raw: Row;
}

export interface ProblemReview {
  id: string;
  problemId: string;
  memberId: string;
  displayName: string;
  fun: number;
  feel: Feel;
  send: SendStatus;
  comment: string;
  createdAt: string;
  updatedAt: string;
  status: ReviewStatus;
  raw: Row;
}

export interface ProblemStats {
  reviews: number;
  sends: number;
  /** Mean fun rating of the active reviews, 1 decimal; null when nobody has rated yet. */
  funAverage: number | null;
  feel: Record<Feel, number>;
}

const one = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  const v = cellText(value as string).trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
};

export function toProblem(r: Row): Problem {
  return {
    id: cellText(r.problem_id).trim(),
    no: Number(r.problem_no) || 0,
    title: cellText(r.title),
    grade: cellText(r.grade),
    wall: cellText(r.wall),
    setterName: cellText(r.setter_name),
    setterNote: cellText(r.setter_note),
    beta: cellText(r.beta),
    status: one(r.status, ["active", "archived", "deleted"] as const, "active"),
    createdAt: cellText(r.created_at),
    updatedAt: cellText(r.updated_at),
    raw: r,
  };
}

export function toReview(r: Row): ProblemReview {
  const fun = Math.round(Number(r.fun_rating));
  return {
    id: cellText(r.review_id).trim(),
    problemId: cellText(r.problem_id).trim(),
    memberId: cellText(r.member_id).trim(),
    displayName: cellText(r.display_name),
    fun: fun >= 1 && fun <= 5 ? fun : 0,
    feel: one(r.difficulty_feel, FEELS, "fair"),
    send: one(r.send_status, SEND_STATUSES, "projecting"),
    comment: cellText(r.comment),
    createdAt: cellText(r.created_at),
    updatedAt: cellText(r.updated_at),
    status: one(r.status, ["active", "deleted", "hidden"] as const, "active"),
    raw: r,
  };
}

export const problemCode = (no: number) => `MOON ${String(no).padStart(3, "0")}`;

export function problemsOf(data: Tables): Problem[] {
  return (data.Problems ?? []).map(toProblem).filter((p) => p.id && p.no > 0);
}

export function reviewsOf(data: Tables): ProblemReview[] {
  return (data.ProblemReviews ?? []).map(toReview).filter((r) => r.id && r.problemId && r.memberId);
}

/** Problem statistics from the active reviews only (deleted and hidden ones don't count). */
export function problemStats(reviews: ProblemReview[], problemId: string): ProblemStats {
  const mine = reviews.filter((r) => r.problemId === problemId && r.status === "active" && r.fun > 0);
  const feel: Record<Feel, number> = { easy: 0, fair: 0, hard: 0 };
  for (const r of mine) feel[r.feel] += 1;
  return {
    reviews: mine.length,
    sends: mine.filter((r) => r.send === "sent").length,
    funAverage: mine.length ? Math.round((mine.reduce((a, r) => a + r.fun, 0) / mine.length) * 10) / 10 : null,
    feel,
  };
}

export { compareGrades };

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

type Planned = { commit: { id: string; checks: Check[]; ops: Op[] }; result?: unknown } | { refuse: string };

const OPERATORS_ONLY = "문제 등록·수정은 운영진만 할 수 있어요.";

/** One line or a short paragraph: control characters out, spaces tidied, length capped by the caller's check. */
function clean(value: unknown, multiline = false): string {
  const s = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, multiline ? "" : " ")
    .replace(/[ \t]+/g, " ");
  return (multiline ? s.replace(/\n{3,}/g, "\n\n") : s).trim();
}

function audit(actorId: string, now: number, commitId: string, action: string, targetId: string, before: unknown, after: unknown): Op {
  return {
    type: "append",
    table: "AuditLog",
    row: {
      log_id: newId("LOG", now, 6),
      commit_id: commitId,
      actor_id: actorId,
      action,
      target_id: targetId,
      before_value: before ? JSON.stringify(before) : "",
      after_value: after ? JSON.stringify(after) : "",
      created_at: seoulIso(now),
    },
  };
}

/** The acting operator, re-checked on the freshly read data. */
function operatorOf(data: Tables, actorId: string): Member | null {
  const m = (data.Members ?? []).map(toMember).find((x) => x.id === actorId);
  return m && m.status === "active" && (m.role === "operator" || m.role === "admin") ? m : null;
}
const operatorCheck = (m: Member): Check => ({ type: "exists", table: "Members", id: m.id, fields: { role: ["operator", "admin"], status: "active" } });

export interface ProblemInput {
  title: string;
  grade: string;
  wall: string;
  setterName: string;
  setterNote: string;
  beta: string;
}

function problemFields(input: ProblemInput): { row: Row } | { refuse: string } {
  const row = {
    title: clean(input.title),
    grade: clean(input.grade),
    wall: clean(input.wall),
    setter_name: clean(input.setterName),
    setter_note: clean(input.setterNote, true),
    beta: clean(input.beta, true),
  };
  if (!row.title || row.title.length > LIMITS.title) return { refuse: `문제명을 ${LIMITS.title}자 이내로 적어 주세요.` };
  // The club's colour grades only (빨강 → 흰색).
  if (!gradeInfo(row.grade)) return { refuse: `난이도를 골라 주세요. (${GRADES.map((g) => g.name).join(" · ")})` };
  if (row.wall.length > LIMITS.wall) return { refuse: `벽 구역은 ${LIMITS.wall}자까지 쓸 수 있어요.` };
  if (!row.setter_name || row.setter_name.length > LIMITS.setter) return { refuse: `Setter 이름을 ${LIMITS.setter}자 이내로 적어 주세요.` };
  if (row.setter_note.length > LIMITS.note) return { refuse: `Setter's Note는 ${LIMITS.note}자까지 쓸 수 있어요.` };
  if (row.beta.length > LIMITS.beta) return { refuse: `Tips는 ${LIMITS.beta}자까지 쓸 수 있어요.` };
  return { row };
}

/** A finished problem from the wall. The number is the next one (never reused, unique in the database). */
export function planProblemCreate(data: Tables, ctx: { now: number; actorId: string; input: ProblemInput }): Planned {
  const op = operatorOf(data, ctx.actorId);
  if (!op) return { refuse: OPERATORS_ONLY };
  const fields = problemFields(ctx.input);
  if ("refuse" in fields) return fields;
  const no = problemsOf(data).reduce((max, p) => Math.max(max, p.no), 0) + 1;
  const commitId = newId("C", ctx.now, 8);
  const problemId = newId("PR", ctx.now);
  const at = seoulIso(ctx.now);
  const row: Row = { problem_id: problemId, problem_no: no, ...fields.row, status: "active", created_at: at, updated_at: at };
  return {
    commit: {
      id: commitId,
      checks: [operatorCheck(op), { type: "absent", table: "Problems", where: { problem_no: String(no) } }],
      ops: [{ type: "append", table: "Problems", row }, audit(op.id, ctx.now, commitId, "problem.create", problemId, null, row)],
    },
    result: { problemId, no },
  };
}

/** Edit the info, the setter's note and the beta. Only changed fields are written. */
export function planProblemEdit(data: Tables, ctx: { now: number; actorId: string; problemId: string; input: ProblemInput }): Planned {
  const op = operatorOf(data, ctx.actorId);
  if (!op) return { refuse: OPERATORS_ONLY };
  const problem = problemsOf(data).find((p) => p.id === ctx.problemId);
  if (!problem) return { refuse: "문제를 찾을 수 없어요." };
  const fields = problemFields(ctx.input);
  if ("refuse" in fields) return fields;
  const set = Object.fromEntries(Object.entries(fields.row).filter(([k, v]) => cellText(problem.raw[k]) !== cellText(v))) as Row;
  if (!Object.keys(set).length) return { refuse: "바뀐 내용이 없어요." };
  const before = Object.fromEntries(Object.keys(set).map((k) => [k, cellText(problem.raw[k])]));
  const commitId = newId("C", ctx.now, 8);
  const full = { ...set, updated_at: seoulIso(ctx.now) };
  return {
    commit: {
      id: commitId,
      // Someone else editing the same fields in the meantime → conflict, re-planned on fresh data.
      checks: [operatorCheck(op), { type: "exists", table: "Problems", id: problem.id, fields: before }],
      ops: [{ type: "update", table: "Problems", id: problem.id, set: full }, audit(op.id, ctx.now, commitId, "problem.edit", problem.id, before, full)],
    },
    result: { no: problem.no },
  };
}

/** ACTIVE ↔ ARCHIVED, delete (soft: the row and its reviews stay) and restore. */
export function planProblemStatus(data: Tables, ctx: { now: number; actorId: string; problemId: string; status: string }): Planned {
  const op = operatorOf(data, ctx.actorId);
  if (!op) return { refuse: OPERATORS_ONLY };
  const problem = problemsOf(data).find((p) => p.id === ctx.problemId);
  if (!problem) return { refuse: "문제를 찾을 수 없어요." };
  if (!["active", "archived", "deleted"].includes(ctx.status)) return { refuse: "상태 값을 확인해 주세요." };
  if (problem.status === ctx.status) return { refuse: "이미 그 상태예요." };
  const commitId = newId("C", ctx.now, 8);
  const set = { status: ctx.status, updated_at: seoulIso(ctx.now) };
  return {
    commit: {
      id: commitId,
      checks: [operatorCheck(op), { type: "exists", table: "Problems", id: problem.id, fields: { status: problem.status } }],
      ops: [
        { type: "update", table: "Problems", id: problem.id, set },
        audit(op.id, ctx.now, commitId, "problem.status", problem.id, { status: problem.status }, set),
      ],
    },
    result: { no: problem.no },
  };
}

export interface ReviewInput {
  fun: number;
  feel: string;
  send: string;
  comment: string;
}

function memberByEmail(data: Tables, email: string): Member | null {
  const target = normalizeEmail(email);
  return (data.Members ?? []).map(toMember).find((m) => m.email === target) ?? null;
}

/**
 * RATE THIS PROBLEM: create or update the member's one review. Self-reported (no proof needed);
 * PROJECTING → SENT is just an update. A review hidden by the crew can't be brought back by its author.
 */
export function planReviewSave(data: Tables, ctx: { now: number; email: string; sessionName: string; problemId: string; input: ReviewInput }): Planned {
  const blocked = participantCheck(data, ctx.email, ctx.now);
  if (blocked) return { refuse: blocked };
  const member = memberByEmail(data, ctx.email)!;
  const problem = problemsOf(data).find((p) => p.id === ctx.problemId);
  if (!problem || problem.status === "deleted") return { refuse: "문제를 찾을 수 없어요." };
  if (problem.status !== "active") return { refuse: "보관된 문제라 새 평가를 남길 수 없어요." };
  const fun = Number(ctx.input.fun);
  if (!Number.isInteger(fun) || fun < 1 || fun > 5) return { refuse: "재미 평가를 1~5점 중에서 골라 주세요." };
  if (!(FEELS as readonly string[]).includes(ctx.input.feel)) return { refuse: "체감 난이도를 골라 주세요." };
  if (!(SEND_STATUSES as readonly string[]).includes(ctx.input.send)) return { refuse: "완등 여부를 골라 주세요." };
  const comment = clean(ctx.input.comment);
  if (comment.length > LIMITS.comment) return { refuse: `한 줄 후기는 ${LIMITS.comment}자까지 쓸 수 있어요.` };

  const at = seoulIso(ctx.now);
  const values = {
    display_name: (member.name || ctx.sessionName || "Member").slice(0, 40),
    fun_rating: fun,
    difficulty_feel: ctx.input.feel,
    send_status: ctx.input.send,
    comment,
    updated_at: at,
    status: "active",
  };
  const commitId = newId("C", ctx.now, 8);
  const existing = reviewsOf(data).find((r) => r.problemId === problem.id && r.memberId === member.id);
  if (existing?.status === "hidden") return { refuse: "운영진이 숨긴 후기라 수정할 수 없어요. 운영진에게 문의해 주세요." };
  const problemCheck: Check = { type: "exists", table: "Problems", id: problem.id, fields: { status: "active" } };
  if (existing) {
    return {
      commit: {
        id: commitId,
        checks: [problemCheck, { type: "exists", table: "ProblemReviews", id: existing.id, fields: { status: existing.status, updated_at: cellText(existing.raw.updated_at) } }],
        ops: [
          { type: "update", table: "ProblemReviews", id: existing.id, set: values },
          audit(member.id, ctx.now, commitId, "problem.review.update", existing.id, { status: existing.status }, values),
        ],
      },
      result: { reviewId: existing.id, created: existing.status !== "active" },
    };
  }
  const reviewId = newId("RV", ctx.now);
  const row: Row = { review_id: reviewId, problem_id: problem.id, member_id: member.id, created_at: at, ...values };
  return {
    commit: {
      id: commitId,
      // One review per member per problem, even with two tabs submitting at once.
      checks: [problemCheck, { type: "absent", table: "ProblemReviews", where: { problem_id: problem.id, member_id: member.id } }],
      ops: [{ type: "append", table: "ProblemReviews", row }, audit(member.id, ctx.now, commitId, "problem.review.create", reviewId, null, row)],
    },
    result: { reviewId, created: true },
  };
}

/** The author removes their review (kept as `deleted` for the record; writing again reuses the row). */
export function planReviewDelete(data: Tables, ctx: { now: number; email: string; reviewId: string }): Planned {
  const blocked = participantCheck(data, ctx.email, ctx.now);
  if (blocked) return { refuse: blocked };
  const member = memberByEmail(data, ctx.email)!;
  const review = reviewsOf(data).find((r) => r.id === ctx.reviewId);
  if (!review || review.memberId !== member.id || review.status !== "active") return { refuse: "지울 수 있는 내 평가가 없어요." };
  const commitId = newId("C", ctx.now, 8);
  const set = { status: "deleted", updated_at: seoulIso(ctx.now) };
  return {
    commit: {
      id: commitId,
      checks: [{ type: "exists", table: "ProblemReviews", id: review.id, fields: { member_id: member.id, status: "active" } }],
      ops: [{ type: "update", table: "ProblemReviews", id: review.id, set }, audit(member.id, ctx.now, commitId, "problem.review.delete", review.id, { status: "active" }, set)],
    },
  };
}

/** The crew hides an inappropriate review (or shows it again). Hidden reviews don't count in the stats. */
export function planReviewModerate(data: Tables, ctx: { now: number; actorId: string; reviewId: string; hide: boolean }): Planned {
  const op = operatorOf(data, ctx.actorId);
  if (!op) return { refuse: "후기 관리는 운영진만 할 수 있어요." };
  const review = reviewsOf(data).find((r) => r.id === ctx.reviewId);
  const from = ctx.hide ? "active" : "hidden";
  if (!review || review.status !== from) return { refuse: ctx.hide ? "숨길 수 있는 후기가 아니에요." : "숨긴 후기가 아니에요." };
  const commitId = newId("C", ctx.now, 8);
  const set = { status: ctx.hide ? "hidden" : "active" };
  return {
    commit: {
      id: commitId,
      checks: [operatorCheck(op), { type: "exists", table: "ProblemReviews", id: review.id, fields: { status: from } }],
      ops: [
        { type: "update", table: "ProblemReviews", id: review.id, set },
        audit(op.id, ctx.now, commitId, ctx.hide ? "problem.review.hide" : "problem.review.unhide", review.id, { status: from }, set),
      ],
    },
  };
}
