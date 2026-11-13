import { describe, expect, it } from "vitest";
import type { Row, Tables } from "../store/schema";
import { MAX_OPEN_FIRST_APPLICATIONS, MEMBERSHIP_REQUIRED_REFUSAL, participantCheck, planApplication, planProposal } from "./operations";

/** Every member write uses the same rule (src/lib/access.ts) — proposals here, radio in radio.test.ts. */
const NOW = Date.parse("2026-11-13T12:00:00+09:00");

function tables(): Tables {
  const m = (id: string, email: string, role = "member", status = "active"): Row => ({ member_id: id, name: id, email, role, status });
  const ms = (memberId: string, start: string, end: string, status = "active"): Row => ({ membership_id: `MS-${memberId}-${start}`, member_id: memberId, plan_id: "1M", start_date: start, end_date: end, status });
  return {
    Members: [m("ACT", "act@x.dev"), m("EXP", "exp@x.dev"), m("NEXT", "next@x.dev"), m("CAN", "can@x.dev"), m("OP", "op@x.dev", "operator"), m("SUS", "sus@x.dev", "member", "inactive")],
    Memberships: [
      ms("ACT", "2026-09-01", "2027-03-31"), // 6+1 months
      ms("EXP", "2026-09-01", "2026-10-31"),
      ms("NEXT", "2026-12-01", "2026-12-31"), // confirmed, starts next month
      ms("CAN", "2026-11-01", "2026-11-30", "canceled"),
      ms("SUS", "2026-11-01", "2026-11-30"),
    ],
    Notifications: [],
    AuditLog: [],
  };
}

const propose = (email: string) => planProposal(tables(), { now: NOW, actorId: email, email, payload: { event_title: "LP 나잇", proposer: "x", contact: "x" } });

describe("non-members: the membership application is the only thing they can submit", () => {
  const apply = (data: Tables, email: string) =>
    planApplication(data, {
      now: NOW,
      actorId: "",
      email,
      input: { name: "새 사람", depositorName: "새", planId: "1M", requestedStart: null, consentConfirmed: true },
    });
  const withPlans = (): Tables => ({
    ...tables(),
    Plans: [{ plan_id: "1M", name: "1개월", price: 80000, first_price: 100000, duration_months: 1, bonus_months: 0, active: true, sort_order: 1 }],
    Payments: [],
  });

  it("a stranger can apply (creating an applicant and a pending payment)", () => {
    expect(apply(withPlans(), "someone@gmail.com")).toHaveProperty("commit");
  });

  it("a flood of new accounts stops at the cap; existing members can still renew", () => {
    const data = withPlans();
    for (let i = 0; i < MAX_OPEN_FIRST_APPLICATIONS; i++) {
      data.Members!.push({ member_id: `APP${i}`, name: "x", email: `bot${i}@gmail.com`, role: "member", status: "applicant" });
      data.Payments!.push({ payment_id: `P${i}`, member_id: `APP${i}`, amount: 100000, plan_id: "1M", status: "pending" });
    }
    expect(apply(data, "one-more@gmail.com")).toHaveProperty("refuse");
    expect(apply(data, "exp@x.dev")).toHaveProperty("commit"); // an existing (expired) member re-registering
  });

  it("proposals and radio requests are closed to accounts that aren't members", () => {
    expect(propose("someone@gmail.com")).toEqual({ refuse: MEMBERSHIP_REQUIRED_REFUSAL });
  });
});

describe("member writes need a membership in effect", () => {
  it("event proposals: allowed for a member in effect and for active staff", () => {
    expect(propose("act@x.dev")).toHaveProperty("commit");
    expect(propose("op@x.dev")).toHaveProperty("commit");
  });

  it("event proposals: refused for expired, not-yet-started, canceled, suspended and unknown accounts", () => {
    for (const email of ["exp@x.dev", "next@x.dev", "can@x.dev", "sus@x.dev", "nobody@x.dev"]) {
      expect(propose(email), email).toEqual({ refuse: MEMBERSHIP_REQUIRED_REFUSAL });
    }
  });

  it("the check reads the email case-insensitively and opens on the start date", () => {
    expect(participantCheck(tables(), "ACT@X.DEV", NOW)).toBeNull();
    expect(participantCheck(tables(), "next@x.dev", Date.parse("2026-12-01T00:00:00+09:00"))).toBeNull();
  });
});
