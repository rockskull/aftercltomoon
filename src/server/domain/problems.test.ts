import { describe, expect, it } from "vitest";
import { gradeLabel, GRADES } from "@/lib/problems";
import { applyCommit } from "../store/commit";
import type { Row, Tables } from "../store/schema";
import { MEMBERSHIP_REQUIRED_REFUSAL } from "./operations";
import {
  compareGrades,
  planProblemCreate,
  planProblemEdit,
  planProblemStatus,
  planReviewDelete,
  planReviewModerate,
  planReviewSave,
  problemCode,
  problemsOf,
  problemStats,
  reviewsOf,
  type ProblemInput,
} from "./problems";

const NOW = Date.parse("2026-12-10T20:00:00+09:00");

function tables(): Tables {
  const member = (id: string, role: string, email = `${id.toLowerCase()}@x.dev`): Row => ({ member_id: id, name: `${id}name`, email, role, status: "active" });
  const ms = (id: string, memberId: string, start: string, end: string): Row => ({ membership_id: id, member_id: memberId, plan_id: "1M", start_date: start, end_date: end, status: "active" });
  return {
    Members: [member("OP", "operator"), member("ADM", "admin"), member("A", "member"), member("B", "member"), member("OLD", "member")],
    Memberships: [ms("MS-A", "A", "2026-12-01", "2026-12-31"), ms("MS-B", "B", "2026-12-01", "2027-02-28"), ms("MS-OLD", "OLD", "2026-10-01", "2026-10-31")],
    Problems: [],
    ProblemReviews: [],
    AuditLog: [],
  };
}

const input = (over: Partial<ProblemInput> = {}): ProblemInput => ({ title: "퇴근 후의 중력", grade: "노랑", wall: "메인 벽", setterName: "현우", setterNote: "", beta: "", ...over });
function ok<T extends object>(planned: T): Exclude<T, { refuse: string }> {
  if ("refuse" in planned) throw new Error(`refused: ${(planned as { refuse: string }).refuse}`);
  return planned as Exclude<T, { refuse: string }>;
}
function withProblem(data = tables()) {
  applyCommit(data, ok(planProblemCreate(data, { now: NOW, actorId: "OP", input: input() })).commit);
  return { data, problemId: problemsOf(data)[0].id };
}
const review = (data: Tables, problemId: string, email: string, over: Partial<{ fun: number; feel: string; send: string; comment: string }> = {}) =>
  planReviewSave(data, { now: NOW, email, sessionName: "", problemId, input: { fun: 4, feel: "fair", send: "sent", comment: "좋아요", ...over } });

describe("problems (crew)", () => {
  it("only operators/admins register; numbers count up and are never reused", () => {
    const data = tables();
    expect(planProblemCreate(data, { now: NOW, actorId: "A", input: input() })).toHaveProperty("refuse");
    applyCommit(data, ok(planProblemCreate(data, { now: NOW, actorId: "OP", input: input() })).commit);
    applyCommit(data, ok(planProblemCreate(data, { now: NOW, actorId: "ADM", input: input({ title: "두 번째" }) })).commit);
    const [first, second] = problemsOf(data);
    expect([first.no, second.no]).toEqual([1, 2]);
    expect(problemCode(first.no)).toBe("MOON 001");
    expect(first).toMatchObject({ status: "active", grade: "노랑", wall: "메인 벽", setterName: "현우" });
    // Deleting #2 doesn't free its number.
    applyCommit(data, ok(planProblemStatus(data, { now: NOW, actorId: "OP", problemId: second.id, status: "deleted" })).commit);
    applyCommit(data, ok(planProblemCreate(data, { now: NOW, actorId: "OP", input: input({ title: "세 번째" }) })).commit);
    expect(problemsOf(data).map((p) => p.no)).toEqual([1, 2, 3]);
    expect(data.AuditLog!.map((r) => r.action)).toEqual(["problem.create", "problem.create", "problem.status", "problem.create"]);
  });

  it("two operators registering at once can't get the same number", () => {
    const data = tables();
    const a = ok(planProblemCreate(data, { now: NOW, actorId: "OP", input: input() }));
    const b = ok(planProblemCreate(data, { now: NOW + 1, actorId: "ADM", input: input({ title: "동시" }) }));
    expect(applyCommit(data, a.commit)).toEqual({ ok: true });
    expect(applyCommit(data, b.commit)).toMatchObject({ ok: false, error: "conflict" });
  });

  it("validates the fields; the grade must be one of the club's colours", () => {
    const data = tables();
    expect(planProblemCreate(data, { now: NOW, actorId: "OP", input: input({ title: "" }) })).toHaveProperty("refuse");
    expect(planProblemCreate(data, { now: NOW, actorId: "OP", input: input({ grade: "" }) })).toHaveProperty("refuse");
    expect(planProblemCreate(data, { now: NOW, actorId: "OP", input: input({ grade: "V3" }) })).toEqual({ refuse: expect.stringContaining("빨강 · 주황 · 노랑 · 초록 · 파랑 · 보라 · 흰색") });
    expect(planProblemCreate(data, { now: NOW, actorId: "OP", input: input({ grade: "분홍" }) })).toHaveProperty("refuse");
    expect(planProblemCreate(data, { now: NOW, actorId: "OP", input: input({ grade: "검정" }) })).toHaveProperty("refuse"); // replaced by 흰색
    expect(planProblemCreate(data, { now: NOW, actorId: "OP", input: input({ setterName: " " }) })).toHaveProperty("refuse");
    expect(planProblemCreate(data, { now: NOW, actorId: "OP", input: input({ beta: "x".repeat(1001) }) })).toHaveProperty("refuse");
    for (const grade of ["빨강", "주황", "노랑", "초록", "파랑", "보라", "흰색"]) {
      expect(planProblemCreate(data, { now: NOW, actorId: "OP", input: input({ grade }) })).not.toHaveProperty("refuse");
    }
    applyCommit(data, ok(planProblemCreate(data, { now: NOW, actorId: "OP", input: input({ grade: "흰색", title: "  줄\u0007바꿈 " }) })).commit);
    expect(problemsOf(data)[0]).toMatchObject({ grade: "흰색", title: "줄 바꿈" });
  });

  it("operators edit info and beta; members can't", () => {
    const { data, problemId } = withProblem();
    expect(planProblemEdit(data, { now: NOW, actorId: "A", problemId, input: input({ beta: "x" }) })).toHaveProperty("refuse");
    expect(planProblemEdit(data, { now: NOW, actorId: "OP", problemId, input: input() })).toEqual({ refuse: "바뀐 내용이 없어요." });
    applyCommit(data, ok(planProblemEdit(data, { now: NOW, actorId: "OP", problemId, input: input({ beta: "두 번째 홀드에서 몸을 오른쪽으로", setterNote: "오른발" }) })).commit);
    expect(problemsOf(data)[0]).toMatchObject({ beta: "두 번째 홀드에서 몸을 오른쪽으로", setterNote: "오른발", title: "퇴근 후의 중력" });
  });

  it("sorts and labels grades in colour order (빨강 → 흰색) with YDS", () => {
    expect(["흰색", "노랑", "빨강", "보라", "주황", "초록", "파랑"].sort(compareGrades)).toEqual(["빨강", "주황", "노랑", "초록", "파랑", "보라", "흰색"]);
    expect(["V3", "파랑", "빨강"].sort(compareGrades)).toEqual(["빨강", "파랑", "V3"]); // anything else goes last
    expect(gradeLabel("빨강")).toBe("빨강 (B)");
    expect(gradeLabel("초록")).toBe("초록 (5.10b ~ 5.10c)");
    expect(gradeLabel("흰색")).toBe("흰색 (5.12+)");
    expect(GRADES.map((g) => `${g.name}:${g.yds}:${g.level}`)).toEqual([
      "빨강:B:입문",
      "주황:5.9:초급",
      "노랑:5.10a:초중급",
      "초록:5.10b ~ 5.10c:중급",
      "파랑:5.10d:중상급",
      "보라:5.11a:상급",
      "흰색:5.12+:고급~엘리트",
    ]);
  });

  it("an edit can change the grade only to another colour", () => {
    const { data, problemId } = withProblem();
    expect(planProblemEdit(data, { now: NOW, actorId: "OP", problemId, input: input({ grade: "V5" }) })).toHaveProperty("refuse");
    applyCommit(data, ok(planProblemEdit(data, { now: NOW, actorId: "OP", problemId, input: input({ grade: "초록" }) })).commit);
    expect(problemsOf(data)[0].grade).toBe("초록");
  });
});

describe("reviews (members)", () => {
  it("one review per member per problem: a second save updates it, never adds a row", () => {
    const { data, problemId } = withProblem();
    applyCommit(data, ok(review(data, problemId, "a@x.dev", { send: "projecting", fun: 3 })).commit);
    applyCommit(data, ok(review(data, problemId, "a@x.dev", { send: "sent", fun: 5, comment: "발을 바꾸니까 해결!" })).commit);
    const mine = reviewsOf(data).filter((r) => r.memberId === "A");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ send: "sent", fun: 5, comment: "발을 바꾸니까 해결!", displayName: "Aname", status: "active" });
  });

  it("two tabs saving the first review at once: only one row lands", () => {
    const { data, problemId } = withProblem();
    const a = ok(review(data, problemId, "a@x.dev"));
    const b = ok(review(data, problemId, "a@x.dev", { fun: 2 }));
    expect(applyCommit(data, a.commit)).toEqual({ ok: true });
    expect(applyCommit(data, b.commit)).toMatchObject({ ok: false, error: "conflict" });
    expect(reviewsOf(data).filter((r) => r.memberId === "A")).toHaveLength(1);
  });

  it("only members with a membership in effect can write (an expired one can't)", () => {
    const { data, problemId } = withProblem();
    expect(review(data, problemId, "old@x.dev")).toEqual({ refuse: MEMBERSHIP_REQUIRED_REFUSAL });
    expect(review(data, problemId, "nobody@x.dev")).toEqual({ refuse: MEMBERSHIP_REQUIRED_REFUSAL });
    expect(review(data, problemId, "op@x.dev")).not.toHaveProperty("refuse"); // staff
  });

  it("validates the rating, feel, status and the 200-character line", () => {
    const { data, problemId } = withProblem();
    expect(review(data, problemId, "a@x.dev", { fun: 0 })).toHaveProperty("refuse");
    expect(review(data, problemId, "a@x.dev", { fun: 6 })).toHaveProperty("refuse");
    expect(review(data, problemId, "a@x.dev", { feel: "brutal" })).toHaveProperty("refuse");
    expect(review(data, problemId, "a@x.dev", { send: "flashed" })).toHaveProperty("refuse");
    expect(review(data, problemId, "a@x.dev", { comment: "가".repeat(201) })).toHaveProperty("refuse");
    expect(review(data, problemId, "a@x.dev", { comment: "가".repeat(200) })).not.toHaveProperty("refuse");
  });

  it("the author deletes their review; writing again reuses the same row", () => {
    const { data, problemId } = withProblem();
    applyCommit(data, ok(review(data, problemId, "a@x.dev")).commit);
    const id = reviewsOf(data)[0].id;
    expect(planReviewDelete(data, { now: NOW, email: "b@x.dev", reviewId: id })).toHaveProperty("refuse"); // not B's
    applyCommit(data, ok(planReviewDelete(data, { now: NOW, email: "a@x.dev", reviewId: id })).commit);
    expect(reviewsOf(data)[0].status).toBe("deleted");
    applyCommit(data, ok(review(data, problemId, "a@x.dev", { fun: 2 })).commit);
    expect(reviewsOf(data)).toHaveLength(1);
    expect(reviewsOf(data)[0]).toMatchObject({ id, status: "active", fun: 2 });
  });

  it("stats: sends count SENT only, the average uses real ratings, and nothing → null (not 0)", () => {
    const { data, problemId } = withProblem();
    expect(problemStats(reviewsOf(data), problemId)).toEqual({ reviews: 0, sends: 0, funAverage: null, feel: { easy: 0, fair: 0, hard: 0 } });
    applyCommit(data, ok(review(data, problemId, "a@x.dev", { fun: 5, feel: "easy", send: "sent" })).commit);
    applyCommit(data, ok(review(data, problemId, "b@x.dev", { fun: 4, feel: "hard", send: "projecting" })).commit);
    applyCommit(data, ok(review(data, problemId, "op@x.dev", { fun: 4, feel: "hard", send: "sent" })).commit);
    expect(problemStats(reviewsOf(data), problemId)).toEqual({ reviews: 3, sends: 2, funAverage: 4.3, feel: { easy: 1, fair: 0, hard: 2 } });
    // PROJECTING → SENT updates the count; a deleted review drops out.
    applyCommit(data, ok(review(data, problemId, "b@x.dev", { fun: 4, feel: "hard", send: "sent" })).commit);
    const opReview = reviewsOf(data).find((r) => r.memberId === "OP")!;
    applyCommit(data, ok(planReviewDelete(data, { now: NOW, email: "op@x.dev", reviewId: opReview.id })).commit);
    expect(problemStats(reviewsOf(data), problemId)).toEqual({ reviews: 2, sends: 2, funAverage: 4.5, feel: { easy: 1, fair: 0, hard: 1 } });
  });

  it("the crew hides an inappropriate review (out of the stats; the author can't revive it) and can show it again", () => {
    const { data, problemId } = withProblem();
    applyCommit(data, ok(review(data, problemId, "a@x.dev", { fun: 1 })).commit);
    const id = reviewsOf(data)[0].id;
    expect(planReviewModerate(data, { now: NOW, actorId: "B", reviewId: id, hide: true })).toHaveProperty("refuse");
    applyCommit(data, ok(planReviewModerate(data, { now: NOW, actorId: "OP", reviewId: id, hide: true })).commit);
    expect(problemStats(reviewsOf(data), problemId).reviews).toBe(0);
    expect(review(data, problemId, "a@x.dev", { fun: 5 })).toHaveProperty("refuse");
    applyCommit(data, ok(planReviewModerate(data, { now: NOW, actorId: "OP", reviewId: id, hide: false })).commit);
    expect(problemStats(reviewsOf(data), problemId).reviews).toBe(1);
  });

  it("archiving keeps every review; new reviews are closed until it's active again", () => {
    const { data, problemId } = withProblem();
    applyCommit(data, ok(review(data, problemId, "a@x.dev")).commit);
    applyCommit(data, ok(planProblemStatus(data, { now: NOW, actorId: "OP", problemId, status: "archived" })).commit);
    expect(problemStats(reviewsOf(data), problemId).reviews).toBe(1);
    expect(review(data, problemId, "b@x.dev")).toEqual({ refuse: expect.stringContaining("보관된 문제") });
    applyCommit(data, ok(planProblemStatus(data, { now: NOW, actorId: "OP", problemId, status: "active" })).commit);
    expect(review(data, problemId, "b@x.dev")).not.toHaveProperty("refuse");
    // Soft delete: the row stays.
    applyCommit(data, ok(planProblemStatus(data, { now: NOW, actorId: "OP", problemId, status: "deleted" })).commit);
    expect(problemsOf(data)[0].status).toBe("deleted");
    expect(reviewsOf(data)).toHaveLength(1);
  });
});
