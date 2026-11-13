import { describe, expect, it } from "vitest";
import { START_TOO_EARLY } from "@/lib/start-months";
import { applyCommit } from "../store/commit";
import type { Row, Tables } from "../store/schema";
import {
  planEnrollmentSave,
  planMemberAdd,
  planMembershipGrant,
  planPlanSave,
  planSettingsSave,
  planStampDefinitionSave,
  planStampRevoke,
} from "./admin-data";
import { toSettings } from "./model";
import { memberStamps, planStampAward } from "./stamps";

const NOW = Date.parse("2026-11-13T12:00:00+09:00");
const admin = { now: NOW, actorId: "ADM", actorRole: "admin" as const };
const operator = { now: NOW, actorId: "OPR", actorRole: "operator" as const };

function tables(): Tables {
  const m = (id: string, email: string, role = "member"): Row => ({ member_id: id, name: id, email, role, status: "active" });
  return {
    Members: [m("ADM", "adm@x.dev", "admin"), m("OPR", "opr@x.dev", "operator"), m("A", "Amy@X.dev")],
    Plans: [{ plan_id: "PLAN-1M", name: "1개월", price: 80000, first_price: 100000, duration_months: 1, bonus_months: 0, active: true, sort_order: 1, description: "" }],
    Settings: [{ key: "apply_notice", value: "안내", description: "" }],
    StampDefinitions: [{ stamp_id: "ST-01", name: "FIRST MOON", description: "첫 클럽 방문", image_key: "st-01", active: true }],
    StampAwards: [],
    Enrollment: [],
    AuditLog: [],
  };
}

function apply(data: Tables, planned: ReturnType<typeof planMemberAdd>) {
  if ("refuse" in planned) throw new Error(planned.refuse);
  return applyCommit(data, planned.commit);
}

const member = { name: "새 멤버", email: "New@Gmail.com ", depositorName: "", role: "member", status: "active", joinedAt: "2026-03-01", memo: "" };

describe("adding members by hand", () => {
  it("adds a member with a normalized email", () => {
    const data = tables();
    expect(apply(data, planMemberAdd(data, { ...operator, input: member }))).toEqual({ ok: true });
    expect(data.Members!.at(-1)).toMatchObject({ name: "새 멤버", email: "new@gmail.com", depositor_name: "새 멤버", role: "member", status: "active", joined_at: "2026-03-01" });
    expect(data.AuditLog!.at(-1)).toMatchObject({ action: "member.add", actor_id: "OPR" });
  });

  it("refuses a duplicate email (any case) and bad input", () => {
    const data = tables();
    expect(planMemberAdd(data, { ...operator, input: { ...member, email: "amy@x.dev" } })).toEqual({ refuse: "이미 등록된 메일이에요." });
    expect(planMemberAdd(data, { ...operator, input: { ...member, email: "not-an-email" } })).toHaveProperty("refuse");
    expect(planMemberAdd(data, { ...operator, input: { ...member, joinedAt: "3월 1일" } })).toHaveProperty("refuse");
  });

  it("only an admin adds operators or admins", () => {
    const data = tables();
    expect(planMemberAdd(data, { ...operator, input: { ...member, role: "operator" } })).toHaveProperty("refuse");
    expect(apply(data, planMemberAdd(data, { ...admin, input: { ...member, role: "operator" } }))).toEqual({ ok: true });
  });
});

describe("recording a membership by hand", () => {
  const grant = (data: Tables, over: Partial<{ memberId: string; startMonth: string; endMonth: string; reason: string }> = {}) =>
    planMembershipGrant(data, { ...operator, memberId: "A", planId: "PLAN-1M", startMonth: "2026-12", endMonth: "2027-01", reason: "사이트 이전 회원권", ...over });

  it("adds whole months without a payment, so it never counts as fee income", () => {
    const data = { ...tables(), Memberships: [], Payments: [] };
    const planned = grant(data);
    if ("refuse" in planned) throw new Error(planned.refuse);
    expect(applyCommit(data, planned.commit)).toEqual({ ok: true });
    expect(data.Memberships![0]).toMatchObject({ member_id: "A", start_date: "2026-12-01", end_date: "2027-01-31", status: "active", source_payment_id: "" });
    expect(data.Payments).toHaveLength(0);
    expect(data.AuditLog!.at(-1)).toMatchObject({ action: "membership.grant" });
  });

  it("refuses overlaps, missing reasons and unknown members", () => {
    const data = { ...tables(), Memberships: [{ membership_id: "MS-1", member_id: "A", plan_id: "PLAN-1M", start_date: "2026-12-01", end_date: "2026-12-31", status: "active" }] };
    expect(grant(data)).toEqual({ refuse: "같은 회원의 다른 회원권과 기간이 겹쳐요." });
    expect(grant(data, { startMonth: "2027-01", endMonth: "2027-01", reason: " " })).toHaveProperty("refuse");
    expect(grant(data, { memberId: "NOPE" })).toHaveProperty("refuse");
    expect(grant(data, { startMonth: "2027-01", endMonth: "2027-01" })).not.toHaveProperty("refuse");
  });

  it("never starts before 2026년 12월", () => {
    const data = { ...tables(), Memberships: [], Payments: [] };
    expect(grant(data, { startMonth: "2026-11", endMonth: "2026-12" })).toEqual({ refuse: START_TOO_EARLY });
    expect(grant(data, { startMonth: "2025-06", endMonth: "2027-01" })).toEqual({ refuse: START_TOO_EARLY });
  });
});

describe("plans", () => {
  const input = { name: "1개월", price: "85,000", firstPrice: "100000", durationMonths: "1", bonusMonths: "0", active: true, sortOrder: "1", description: "한 달" };

  it("admins edit prices; only changed fields are written", () => {
    const data = tables();
    const planned = planPlanSave(data, { ...admin, planId: "PLAN-1M", input });
    if ("refuse" in planned) throw new Error(planned.refuse);
    expect(planned.commit.ops[0]).toMatchObject({ type: "update", set: { price: 85000, description: "한 달" } });
    applyCommit(data, planned.commit);
    expect(data.Plans![0]).toMatchObject({ price: 85000, first_price: 100000 });
  });

  it("adds a plan, clears a first-time price, and checks the numbers", () => {
    const data = tables();
    const added = planPlanSave(data, { ...admin, planId: null, input: { ...input, name: "3개월", price: "230000", firstPrice: "", durationMonths: "3" } });
    if ("refuse" in added) throw new Error(added.refuse);
    applyCommit(data, added.commit);
    expect(data.Plans!.at(-1)).toMatchObject({ name: "3개월", price: 230000, first_price: "", duration_months: 3 });
    expect(planPlanSave(data, { ...admin, planId: null, input: { ...input, durationMonths: "0" } })).toHaveProperty("refuse");
    expect(planPlanSave(data, { ...admin, planId: null, input: { ...input, price: "팔만" } })).toHaveProperty("refuse");
    expect(planPlanSave(data, { ...operator, planId: "PLAN-1M", input })).toHaveProperty("refuse");
  });
});

describe("site settings", () => {
  it("updates existing keys, adds missing ones, and the site reads them", () => {
    const data = tables();
    const planned = planSettingsSave(data, { ...admin, values: { apply_notice: "새 안내", radio_player: "on", consent_daily_url: "https://forms.gle/new" } });
    if ("refuse" in planned) throw new Error(planned.refuse);
    expect(applyCommit(data, planned.commit)).toEqual({ ok: true });
    const s = toSettings(data.Settings);
    expect(s).toMatchObject({ applyNotice: "새 안내", radioPlayer: true });
    expect(s.consent.daily).toBe("https://forms.gle/new");
  });

  it("refuses non-https links, operators, and no-op saves", () => {
    const data = tables();
    expect(planSettingsSave(data, { ...admin, values: { consent_member_url: "http://x.dev" } })).toHaveProperty("refuse");
    expect(planSettingsSave(data, { ...operator, values: { apply_notice: "x" } })).toHaveProperty("refuse");
    expect(planSettingsSave(data, { ...admin, values: { apply_notice: "안내" } })).toEqual({ refuse: "바뀐 내용이 없어요." });
  });
});

describe("stamps", () => {
  it("admins rename a stamp or turn it off", () => {
    const data = tables();
    const planned = planStampDefinitionSave(data, { ...admin, stampId: "ST-01", name: "FIRST MOON", description: "아지트 첫 방문", active: false, imageKey: "st-01" });
    if ("refuse" in planned) throw new Error(planned.refuse);
    applyCommit(data, planned.commit);
    expect(data.StampDefinitions![0]).toMatchObject({ description: "아지트 첫 방문", active: false });
    expect(planStampDefinitionSave(data, { ...admin, stampId: "ST-07", name: "ON AIR", description: "", active: true, imageKey: "" })).toHaveProperty("refuse");
    // The v1.4 stamps have no row yet; saving one adds it.
    const six = planStampDefinitionSave(data, { ...admin, stampId: "ST-05", name: "SIX MOONS", description: "6+1개월 회원권 등록", active: true, imageKey: "st-05" });
    if ("refuse" in six) throw new Error(six.refuse);
    applyCommit(data, six.commit);
    expect(data.StampDefinitions!.find((r) => r.stamp_id === "ST-05")).toMatchObject({ name: "SIX MOONS", image_key: "st-05" });
  });

  it("revoking keeps the record but takes the stamp off the collection; it can be given again", () => {
    const data = tables();
    const award = () => planStampAward(data, { now: NOW, actorId: "OPR", memberId: "A", stampId: "ST-01", awardedAt: "2026-11-13", note: "" });
    const first = award();
    if ("refuse" in first) throw new Error(first.refuse);
    applyCommit(data, first.commit);
    expect(memberStamps(data, "A").find((s) => s.id === "ST-01")!.awardedAt).toBe("2026-11-13");

    expect(planStampRevoke(data, { ...operator, memberId: "A", stampId: "ST-01", reason: "" })).toHaveProperty("refuse");
    const revoke = planStampRevoke(data, { ...operator, memberId: "A", stampId: "ST-01", reason: "다른 회원에게 줄 걸 잘못 눌렀어요" });
    if ("refuse" in revoke) throw new Error(revoke.refuse);
    applyCommit(data, revoke.commit);
    expect(data.StampAwards).toHaveLength(1);
    expect(data.StampAwards![0]).toMatchObject({ stamp_id: "revoked:ST-01" });
    expect(String(data.StampAwards![0].note)).toContain("발급 취소");
    expect(memberStamps(data, "A").find((s) => s.id === "ST-01")!.awardedAt).toBeNull();
    expect(award()).not.toHaveProperty("refuse");
  });
});

describe("enrollment periods", () => {
  const input = { title: "12월 신규 등록", startDate: "2026-11-20", endDate: "2026-11-30", description: "", applicationUrl: "", status: "published" };

  it("adds and edits a period", () => {
    const data = tables();
    const added = planEnrollmentSave(data, { ...operator, enrollmentId: null, input });
    if ("refuse" in added) throw new Error(added.refuse);
    applyCommit(data, added.commit);
    const id = String(data.Enrollment![0].enrollment_id);
    const edited = planEnrollmentSave(data, { ...operator, enrollmentId: id, input: { ...input, status: "closed" } });
    if ("refuse" in edited) throw new Error(edited.refuse);
    applyCommit(data, edited.commit);
    expect(data.Enrollment![0]).toMatchObject({ title: "12월 신규 등록", status: "closed", start_date: "2026-11-20" });
  });

  it("checks dates, links and status", () => {
    const data = tables();
    const bad = (over: object) => planEnrollmentSave(data, { ...operator, enrollmentId: null, input: { ...input, ...over } });
    expect(bad({ startDate: "" })).toHaveProperty("refuse");
    expect(bad({ endDate: "2026-11-01" })).toHaveProperty("refuse");
    expect(bad({ applicationUrl: "javascript:alert(1)" })).toHaveProperty("refuse");
    expect(bad({ status: "deleted" })).toHaveProperty("refuse");
  });
});
