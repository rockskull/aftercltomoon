"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { MEMBERSHIP_REQUIRED } from "@/lib/access";
import { requireParticipant } from "@/server/auth/access";
import { operatorForAction } from "@/server/auth/viewer";
import { MEMBERSHIP_REQUIRED_REFUSAL, NEEDS } from "@/server/domain/operations";
import {
  planProblemCreate,
  planProblemEdit,
  planProblemStatus,
  planReviewDelete,
  planReviewModerate,
  planReviewSave,
  type ProblemInput,
} from "@/server/domain/problems";
import { PROBLEMS_TAG, runCommit } from "@/server/store";

/** Same shape as the admin forms' state, so the crew forms can reuse ActionForm. */
export interface ProblemState {
  status: "idle" | "success" | "error";
  message?: string;
  /** MEMBERSHIP_REQUIRED / LOGIN_REQUIRED for member writes. */
  code?: string;
}

const field = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const CREW_ONLY: ProblemState = { status: "error", message: "운영진만 할 수 있어요." };

function changed(message: string): ProblemState {
  updateTag(PROBLEMS_TAG);
  refresh();
  return { status: "success", message };
}

function problemInput(fd: FormData): ProblemInput {
  return {
    title: field(fd, "title"),
    grade: field(fd, "grade"),
    wall: field(fd, "wall"),
    setterName: field(fd, "setter_name"),
    setterNote: String(fd.get("setter_note") ?? ""),
    beta: String(fd.get("beta") ?? ""),
  };
}

// --- Crew (operators / admins; re-checked against the live Members data) -----------------

export async function createProblem(_prev: ProblemState, fd: FormData): Promise<ProblemState> {
  const op = await operatorForAction();
  if (!op) return CREW_ONLY;
  const outcome = await runCommit<{ no: number }>(NEEDS.problems, (data) => planProblemCreate(data, { now: Date.now(), actorId: op.member.id, input: problemInput(fd) }));
  if (!outcome.ok) return { status: "error", message: outcome.message };
  updateTag(PROBLEMS_TAG);
  redirect(`/problems/${outcome.result?.no ?? ""}`);
}

export async function updateProblem(_prev: ProblemState, fd: FormData): Promise<ProblemState> {
  const op = await operatorForAction();
  if (!op) return CREW_ONLY;
  const outcome = await runCommit(NEEDS.problems, (data) =>
    planProblemEdit(data, { now: Date.now(), actorId: op.member.id, problemId: field(fd, "problem_id"), input: problemInput(fd) }),
  );
  return outcome.ok ? changed("저장했어요.") : { status: "error", message: outcome.message };
}

export async function setProblemStatus(_prev: ProblemState, fd: FormData): Promise<ProblemState> {
  const op = await operatorForAction();
  if (!op) return CREW_ONLY;
  const status = field(fd, "status");
  const outcome = await runCommit(NEEDS.problems, (data) =>
    planProblemStatus(data, { now: Date.now(), actorId: op.member.id, problemId: field(fd, "problem_id"), status }),
  );
  if (!outcome.ok) return { status: "error", message: outcome.message };
  return changed({ active: "ACTIVE로 바꿨어요.", archived: "보관(ARCHIVED)했어요. 기록은 그대로예요.", deleted: "삭제했어요. 운영진은 목록 아래에서 되살릴 수 있어요." }[status] ?? "바꿨어요.");
}

export async function moderateReview(_prev: ProblemState, fd: FormData): Promise<ProblemState> {
  const op = await operatorForAction();
  if (!op) return CREW_ONLY;
  const hide = field(fd, "hide") === "1";
  const outcome = await runCommit(NEEDS.problemModeration, (data) =>
    planReviewModerate(data, { now: Date.now(), actorId: op.member.id, reviewId: field(fd, "review_id"), hide }),
  );
  return outcome.ok ? changed(hide ? "후기를 숨겼어요." : "후기를 다시 보이게 했어요.") : { status: "error", message: outcome.message };
}

// --- Members (ACTIVE MEMBERS ONLY: the same gate as every member write) ------------------

export async function saveReview(_prev: ProblemState, fd: FormData): Promise<ProblemState> {
  const gate = await requireParticipant();
  if (!gate.ok) return { status: "error", message: gate.message, code: gate.code };
  const session = gate.viewer.session;
  const outcome = await runCommit<{ created: boolean }>(NEEDS.problemReview, (data) =>
    planReviewSave(data, {
      now: Date.now(),
      email: session.email,
      sessionName: session.name,
      problemId: field(fd, "problem_id"),
      input: { fun: Number(field(fd, "fun")), feel: field(fd, "feel"), send: field(fd, "send"), comment: field(fd, "comment") },
    }),
  );
  if (!outcome.ok) {
    return { status: "error", message: outcome.message, ...(outcome.message === MEMBERSHIP_REQUIRED_REFUSAL ? { code: MEMBERSHIP_REQUIRED } : {}) };
  }
  return changed(outcome.result?.created === false ? "평가를 수정했어요." : "평가를 남겼어요. 고마워요!");
}

export async function deleteReview(_prev: ProblemState, fd: FormData): Promise<ProblemState> {
  const gate = await requireParticipant();
  if (!gate.ok) return { status: "error", message: gate.message, code: gate.code };
  const outcome = await runCommit(NEEDS.problemReview, (data) =>
    planReviewDelete(data, { now: Date.now(), email: gate.viewer.session.email, reviewId: field(fd, "review_id") }),
  );
  return outcome.ok ? changed("평가를 지웠어요.") : { status: "error", message: outcome.message };
}
