import { describe, expect, it } from "vitest";
import { memberAccess } from "@/lib/access";
import { entriesFromPayments } from "@/lib/ledger";
import { applyCommit } from "../store/commit";
import type { Row, Tables } from "../store/schema";
import { planRegistration, REGISTRATION_ADMIN_ONLY, type RegistrationRequest } from "./admin-data";
import { parsePrivate, type Role } from "./model";
import { planApproval, planCancelApproval } from "./operations";

/** MEMBERSHIP REGISTRATION (v1.6): calculate → pending charge → admin confirms after the deposit. */

const NOW = Date.parse("2026-11-13T12:00:00+09:00");
const at = (day: string) => Date.parse(`${day}T12:00:00+09:00`);

function tables(): Tables {
  const member = (id: string, role: Role, status = "active", joined = ""): Row => ({
    member_id: id, name: id, email: `${id.toLowerCase()}@x.dev`, depositor_name: `${id}입금`, role, status, joined_at: joined, member_consent_at: "x",
  });
  return {
    Members: [member("ADMIN", "admin", "active", "2026-01-01"), member("OPER", "operator", "active", "2026-01-01"), member("A", "member", "applicant")],
    Plans: [
      { plan_id: "1M", name: "1개월", price: 80000, first_price: 100000, duration_months: 1, bonus_months: 0, active: true, sort_order: 1, description: "" },
      { plan_id: "6M", name: "6개월", price: 500000, first_price: "", duration_months: 6, bonus_months: 1, active: true, sort_order: 2, description: "" },
    ],
    Payments: [],
    Memberships: [],
    Notifications: [],
    AuditLog: [],
  };
}

const monthly = (months: string[], start: string): RegistrationRequest => ({ kind: "monthly", months, start });
const register = (data: Tables, request: RegistrationRequest, over: Partial<{ role: Role; memberId: string; requestId: string; now: number }> = {}) =>
  planRegistration(data, {
    now: over.now ?? NOW,
    actorId: over.role === "operator" ? "OPER" : "ADMIN",
    actorRole: over.role ?? "admin",
    memberId: over.memberId ?? "A",
    depositorName: "",
    requestId: over.requestId ?? "req-0001-abcd",
    request,
  });
function ok<T extends object>(planned: T): Exclude<T, { refuse: string }> {
  if ("refuse" in planned) throw new Error(`refused: ${(planned as { refuse: string }).refuse}`);
  return planned as Exclude<T, { refuse: string }>;
}
const approve = (data: Tables, role: Role, over: Partial<{ startOverride: string; now: number }> = {}) =>
  planApproval(data, {
    now: over.now ?? NOW,
    actorId: role === "admin" ? "ADMIN" : "OPER",
    actorRole: role,
    paymentId: parsePrivate(data).payments[0].id,
    depositedAt: "2026-11-20",
    startOverride: over.startOverride ?? null,
  });
const accessOf = (data: Tables, todayKey: string) => {
  const club = parsePrivate(data);
  return memberAccess({ member: club.members.find((m) => m.id === "A")!, memberships: club.memberships, payments: club.payments, todayKey });
};

describe("making a charge", () => {
  it("recomputes the amount on the server and only creates a pending charge", () => {
    const data = tables();
    const planned = ok(register(data, monthly(["2027-02", "2026-12", "2027-01"], "2026-12-15")));
    expect(planned.result).toEqual({ paymentId: expect.any(String), amount: 203871 });
    expect(applyCommit(data, planned.commit)).toEqual({ ok: true });
    const p = parsePrivate(data).payments[0];
    expect(p).toMatchObject({ status: "pending", amount: 203871, planId: "1M", requestedStart: "2026-12-15", firstJoin: false });
    expect(p.registration).toEqual({ months: ["2026-12", "2027-01", "2027-02"], start: "2026-12-15", fee: 80000 });
    expect(data.Memberships).toHaveLength(0); // nothing active before the deposit is confirmed
    expect(accessOf(data, "2026-12-20")).toMatchObject({ status: "PENDING", canParticipate: false });
    expect(data.AuditLog!.at(-1)).toMatchObject({ action: "registration.create", actor_id: "ADMIN" });
  });

  it("is admin only", () => {
    expect(register(tables(), monthly(["2026-12"], "2026-12-01"), { role: "operator" })).toEqual({ refuse: REGISTRATION_ADMIN_ONLY });
    expect(register(tables(), monthly(["2026-12"], "2026-12-01"), { role: "member" })).toEqual({ refuse: REGISTRATION_ADMIN_ONLY });
  });

  it("never bills twice: one open charge per member, and a repeated submit is the same commit", () => {
    const data = tables();
    const first = ok(register(data, monthly(["2026-12"], "2026-12-01")));
    const again = ok(register(data, monthly(["2026-12"], "2026-12-01"))); // same request id, planned before the first landed
    expect(applyCommit(data, first.commit)).toEqual({ ok: true });
    expect(applyCommit(data, again.commit)).toEqual({ ok: true, duplicate: true });
    expect(data.Payments).toHaveLength(1);
    expect(register(data, monthly(["2027-01"], "2027-01-01"), { requestId: "req-0002-abcd" })).toHaveProperty("refuse");
  });

  it("refuses months already covered, past months, 2026-11 and a price changed meanwhile", () => {
    const data = tables();
    data.Memberships!.push({ membership_id: "MS-1", member_id: "A", plan_id: "1M", start_date: "2027-01-01", end_date: "2027-01-31", status: "active" });
    expect(register(data, monthly(["2026-12", "2027-01"], "2026-12-01"))).toEqual({ refuse: expect.stringContaining("2027년 1월") });
    expect(register(data, monthly(["2026-11"], "2026-11-01"))).toHaveProperty("refuse");
    expect(register(data, monthly(["2026-12"], "2026-12-01"), { now: at("2027-01-10") })).toHaveProperty("refuse"); // December is past by then
    // Gaps are fine: December and February around the January membership.
    const planned = ok(register(data, monthly(["2026-12", "2027-02"], "2026-12-01")));
    data.Plans = data.Plans!.map((p) => (p.plan_id === "1M" ? { ...p, price: 85000 } : p));
    expect(applyCommit(data, planned.commit)).toMatchObject({ ok: false, error: "conflict" });
  });

  it("keeps a long plan's own price and period (no proration, no combining)", () => {
    const data = tables();
    const planned = ok(register(data, { kind: "plan", planId: "6M", startMonth: "2026-12" }));
    applyCommit(data, planned.commit);
    expect(parsePrivate(data).payments[0]).toMatchObject({ amount: 500000, planId: "6M", requestedStart: "2026-12-01", registration: null });
    // An ordinary plan payment: operators may approve it, and it runs 6 + 1 whole months.
    applyCommit(data, ok(approve(data, "operator")).commit);
    expect(parsePrivate(data).memberships.map((m) => [m.startDate, m.endDate])).toEqual([["2026-12-01", "2027-06-30"]]);
  });
});

describe("confirming after the deposit", () => {
  it("only an admin confirms; then each continuous stretch becomes a membership and the gap stays closed", () => {
    const data = tables();
    applyCommit(data, ok(register(data, monthly(["2026-12", "2027-01", "2027-03"], "2026-12-15"))).commit);
    expect(approve(data, "operator")).toHaveProperty("refuse");
    expect(approve(data, "admin", { startOverride: "2027-01-01" })).toHaveProperty("refuse");

    const confirmed = ok(approve(data, "admin"));
    expect(applyCommit(data, confirmed.commit)).toEqual({ ok: true });
    const club = parsePrivate(data);
    expect(club.payments[0]).toMatchObject({ status: "approved", approvedBy: "ADMIN", depositedAt: "2026-11-20" });
    expect(club.memberships.map((m) => [m.startDate, m.endDate, m.sourcePaymentId === club.payments[0].id])).toEqual([
      ["2026-12-15", "2027-01-31", true],
      ["2027-03-01", "2027-03-31", true],
    ]);
    expect(club.members.find((m) => m.id === "A")).toMatchObject({ status: "active", joinedAt: "2026-12-15" });

    expect(accessOf(data, "2026-12-14").canParticipate).toBe(false); // before the adjusted first day
    expect(accessOf(data, "2026-12-15")).toMatchObject({ status: "ACTIVE", canParticipate: true });
    expect(accessOf(data, "2027-02-10")).toMatchObject({ status: "EXPIRED", canParticipate: false }); // February was not registered
    expect(accessOf(data, "2027-03-02").canParticipate).toBe(true);

    // Income is the whole amount collected, once.
    const income = entriesFromPayments(club.payments, { member: (id) => id, plan: () => "1개월" });
    expect(income.map((e) => e.amount)).toEqual([43871 + 80000 + 80000]);
    // A second confirmation does nothing.
    expect(approve(data, "admin")).toEqual({ refuse: "이미 승인된 입금이에요." });
  });

  it("refuses a charge whose amount no longer matches its months (edited by hand)", () => {
    const data = tables();
    applyCommit(data, ok(register(data, monthly(["2026-12"], "2026-12-15"))).commit);
    data.Payments![0].amount = 40000;
    expect(approve(data, "admin")).toEqual({ refuse: expect.stringContaining("계산과 맞지 않아요") });
  });

  it("cancelling the approval voids every stretch; confirming again recreates them", () => {
    const data = tables();
    applyCommit(data, ok(register(data, monthly(["2026-12", "2027-02"], "2026-12-01"))).commit);
    applyCommit(data, ok(approve(data, "admin")).commit);
    const paymentId = parsePrivate(data).payments[0].id;
    applyCommit(data, ok(planCancelApproval(data, { now: NOW, actorId: "ADMIN", paymentId, reason: "금액 확인 다시" })).commit);
    expect(parsePrivate(data).memberships.map((m) => m.status)).toEqual(["canceled", "canceled"]);
    applyCommit(data, ok(approve(data, "admin")).commit);
    expect(parsePrivate(data).memberships.filter((m) => m.status === "active").map((m) => m.startDate)).toEqual(["2026-12-01", "2027-02-01"]);
  });
});
