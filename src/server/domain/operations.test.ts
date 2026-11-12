import { describe, expect, it } from "vitest";
import { applyCommit, type Commit } from "../store/commit";
import { MemoryStore } from "../store/memory";
import type { Row, Tables } from "../store/schema";
import type { EventInput } from "./event-input";
import { parsePrivate } from "./model";
import {
  EVENT_CHANGED,
  PROPOSAL_ALREADY_EVENT,
  planApplication,
  planApproval,
  planCancelApproval,
  planEventCreate,
  planEventEdit,
  planLedgerAdd,
  planLedgerEdit,
  planLedgerVoid,
  planMemberConsent,
  planMembershipEdit,
} from "./operations";

const NOW = Date.parse("2026-11-11T12:00:00+09:00");

function baseTables(): Tables {
  const member = (id: string, email: string, status = "active", role = "member"): Row => ({
    member_id: id,
    name: id,
    email,
    depositor_name: id,
    role,
    status,
    applied_at: "",
    joined_at: status === "active" ? "2026-01-01" : "",
    memo: "",
  });
  const payment = (id: string, memberId: string, planId: string, amount: number, status = "pending"): Row => ({
    payment_id: id,
    member_id: memberId,
    depositor_name: memberId,
    amount,
    plan_id: planId,
    status,
    requested_at: "",
    requested_start: "",
    deposited_at: "",
    bank_transaction_id: "",
    approved_by: "",
    approved_at: "",
    note: "",
  });
  return {
    Members: [member("OP", "op@x.dev", "active", "operator"), member("NEW", "new@x.dev", "applicant"), member("OLD", "old@x.dev")],
    Plans: [
      // 1개월: 100,000 the very first time, 80,000 after that. 6개월 has no first-time price.
      { plan_id: "1M", name: "1개월", price: 80000, first_price: 100000, duration_months: 1, bonus_months: 0, active: true, sort_order: 1, description: "" },
      { plan_id: "6M", name: "6개월", price: 500000, first_price: "", duration_months: 6, bonus_months: 1, active: true, sort_order: 2, description: "" },
    ],
    Payments: [payment("P-NEW", "NEW", "1M", 80000), payment("P-OLD-A", "OLD", "1M", 80000), payment("P-OLD-B", "OLD", "6M", 500000)],
    Memberships: [
      {
        membership_id: "MS-OLD",
        member_id: "OLD",
        plan_id: "1M",
        start_date: "2026-11-01",
        end_date: "2026-11-30",
        status: "active",
        source_payment_id: "P-OLD-0",
        created_at: "",
        updated_at: "",
        note: "",
      },
    ],
    Notifications: [],
    AuditLog: [],
  };
}

function commitOf(planned: ReturnType<typeof planApproval>): Commit {
  if ("refuse" in planned) throw new Error(`refused: ${planned.refuse}`);
  return planned.commit;
}

describe("payment approval", () => {
  it("activates a new member for the whole current month and records everything", () => {
    const t = baseTables();
    expect(applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW" })))).toEqual({ ok: true });

    const club = parsePrivate(t);
    const ms = club.memberships.find((m) => m.sourcePaymentId === "P-NEW")!;
    expect([ms.startDate, ms.endDate, ms.status]).toEqual(["2026-11-01", "2026-11-30", "active"]);
    expect(club.payments.find((p) => p.id === "P-NEW")).toMatchObject({ status: "approved", approvedBy: "OP", depositedAt: "2026-11-11" });
    expect(club.members.find((m) => m.id === "NEW")).toMatchObject({ status: "active", joinedAt: "2026-11-01" });
    expect(club.notifications.map((n) => n.type)).toEqual(["payment_approved"]);
    expect(t.AuditLog).toHaveLength(1);
    expect(t.AuditLog![0]).toMatchObject({ actor_id: "OP", action: "payment.approve", target_id: "P-NEW" });
  });

  it("is never active before approval", () => {
    const club = parsePrivate(baseTables());
    expect(club.memberships.some((m) => m.memberId === "NEW")).toBe(false);
  });

  it("extension keeps the remaining days", () => {
    const t = baseTables();
    applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-OLD-B" })));
    const ms = parsePrivate(t).memberships.find((m) => m.sourcePaymentId === "P-OLD-B")!;
    // existing ends 11/30 → 6+1 months from 12/01
    expect([ms.startDate, ms.endDate]).toEqual(["2026-12-01", "2027-06-30"]);
  });

  it("refuses a second approval of the same payment", () => {
    const t = baseTables();
    applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW" })));
    expect(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW" })).toEqual({ refuse: "이미 승인된 입금이에요." });
  });

  it("two operators approving the same payment at once: only one lands", () => {
    const t = baseTables();
    const a = commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW" }));
    const b = commitOf(planApproval(t, { now: NOW + 1000, actorId: "OP", paymentId: "P-NEW" }));
    expect(applyCommit(t, a)).toEqual({ ok: true });
    expect(applyCommit(t, b)).toMatchObject({ ok: false, error: "conflict" });
    expect(parsePrivate(t).memberships.filter((m) => m.sourcePaymentId === "P-NEW")).toHaveLength(1);
  });

  it("two payments of one member approved at once: the second is re-planned and chains after the first", () => {
    const t = baseTables();
    const a = commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-OLD-A" }));
    const stale = commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-OLD-B" }));
    expect(applyCommit(t, a)).toEqual({ ok: true });
    // Planned from the old snapshot, it would overlap — the snapshot check stops it.
    expect(applyCommit(t, stale)).toMatchObject({ ok: false, error: "conflict" });
    // Re-planning from fresh data chains correctly.
    expect(applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-OLD-B" })))).toEqual({ ok: true });
    const dates = parsePrivate(t)
      .memberships.filter((m) => m.memberId === "OLD")
      .map((m) => [m.startDate, m.endDate]);
    expect(dates).toEqual([
      ["2026-11-01", "2026-11-30"],
      ["2026-12-01", "2026-12-31"],
      ["2027-01-01", "2027-07-31"],
    ]);
  });

  it("a retried commit (same id) is applied only once", () => {
    const t = baseTables();
    const c = commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW" }));
    expect(applyCommit(t, c)).toEqual({ ok: true });
    expect(applyCommit(t, c)).toEqual({ ok: true, duplicate: true });
    expect(t.Memberships!.filter((r) => r.source_payment_id === "P-NEW")).toHaveLength(1);
  });

  it("one bank transaction can only settle one payment", () => {
    const t = baseTables();
    applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW", bankTransactionId: "TX-1" })));
    expect(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-OLD-A", bankTransactionId: "TX-1" })).toEqual({
      refuse: "이 거래는 이미 다른 입금에 반영됐어요.",
    });
  });

  it("cancel approval voids the membership but keeps it for history, and allows re-approval", () => {
    const t = baseTables();
    applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW" })));
    applyCommit(t, commitOf(planCancelApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW", reason: "잘못 승인" })));
    let club = parsePrivate(t);
    expect(club.payments.find((p) => p.id === "P-NEW")!.status).toBe("pending");
    expect(club.memberships.filter((m) => m.memberId === "NEW").map((m) => m.status)).toEqual(["canceled"]);

    // Re-approve with the right start date.
    const again = planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW", startOverride: "2026-12-01" });
    expect(applyCommit(t, commitOf(again))).toEqual({ ok: true });
    club = parsePrivate(t);
    expect(club.memberships.filter((m) => m.memberId === "NEW").map((m) => [m.status, m.startDate, m.endDate])).toEqual([
      ["canceled", "2026-11-01", "2026-11-30"],
      ["active", "2026-12-01", "2026-12-31"],
    ]);
    expect(t.AuditLog!.map((r) => r.action)).toEqual(["payment.approve", "payment.cancel_approval", "payment.approve"]);
  });

  it("membership edits must not overlap and are audited", () => {
    const t = baseTables();
    applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-OLD-A" })));
    const second = parsePrivate(t).memberships.find((m) => m.sourcePaymentId === "P-OLD-A")!;
    expect(
      planMembershipEdit(t, { now: NOW, actorId: "OP", membershipId: second.id, startMonth: "2026-11", endMonth: "2026-12", status: "active", reason: "조정" }),
    ).toEqual({ refuse: "같은 회원의 다른 회원권과 기간이 겹쳐요." });
    const ok = planMembershipEdit(t, { now: NOW, actorId: "OP", membershipId: second.id, startMonth: "2026-12", endMonth: "2027-01", status: "active", reason: "부상 연장" });
    expect(applyCommit(t, commitOf(ok))).toEqual({ ok: true });
    expect(parsePrivate(t).memberships.find((m) => m.id === second.id)).toMatchObject({ startDate: "2026-12-01", endDate: "2027-01-31" });
    expect(t.AuditLog!.at(-1)).toMatchObject({ action: "membership.edit", target_id: second.id });
  });

  it("editing only the status of an older mid-month membership keeps its dates", () => {
    const t = baseTables();
    t.Memberships!.push({ membership_id: "MS-LEGACY", member_id: "NEW", plan_id: "1M", start_date: "2026-10-11", end_date: "2026-11-10", status: "active" });
    const edit = planMembershipEdit(t, { now: NOW, actorId: "OP", membershipId: "MS-LEGACY", startMonth: "2026-10", endMonth: "2026-11", status: "canceled", reason: "중복" });
    expect(applyCommit(t, commitOf(edit))).toEqual({ ok: true });
    expect(parsePrivate(t).memberships.find((m) => m.id === "MS-LEGACY")).toMatchObject({ startDate: "2026-10-11", endDate: "2026-11-10", status: "canceled" });
  });

  it("the deposit date is free: past or future, it never moves the period", () => {
    for (const depositedAt of ["2026-09-03", "2026-11-28", "2027-01-15"]) {
      const t = baseTables();
      expect(applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW", depositedAt })))).toEqual({ ok: true });
      const club = parsePrivate(t);
      expect(club.payments.find((p) => p.id === "P-NEW")!.depositedAt).toBe(depositedAt);
      expect(club.memberships.find((m) => m.sourcePaymentId === "P-NEW")).toMatchObject({ startDate: "2026-11-01", endDate: "2026-11-30" });
    }
  });
});

describe("application", () => {
  const input = (consentConfirmed: boolean) => ({ name: "새 회원", depositorName: "김새회원", planId: "1M", requestedStart: null, consentConfirmed });

  it("registers a new Google account as an applicant with a pending payment and alerts operators", async () => {
    const store = new MemoryStore(baseTables());
    const data = await store.read(["Members", "Plans", "Payments", "Notifications"]);
    const planned = planApplication(data, { now: NOW, actorId: "", email: "Fresh@X.dev", input: input(true) });
    if ("refuse" in planned) throw new Error(planned.refuse);
    expect(await store.commit(planned.commit)).toEqual({ ok: true });

    const club = parsePrivate(store.tables);
    const fresh = club.members.find((m) => m.email === "fresh@x.dev")!;
    expect(fresh.status).toBe("applicant");
    expect(fresh.consentAt).toBe("2026-11-11T12:00:00+09:00");
    // First membership: the 1개월 first-time price (100,000), not 80,000 + a fee.
    expect(club.payments.find((p) => p.memberId === fresh.id)).toMatchObject({ status: "pending", amount: 100000, firstJoin: true });
    expect(club.notifications.filter((n) => n.type === "op_payment_pending").map((n) => n.memberId)).toEqual(["OP"]);

    const again = planApplication(store.tables, { now: NOW, actorId: "", email: "fresh@x.dev", input: input(true) });
    expect(again).toEqual({ refuse: "이미 입금 확인을 기다리는 신청이 있어요." });
  });

  it("requires the member registration consent form the first time", () => {
    const t = baseTables();
    expect(planApplication(t, { now: NOW, actorId: "", email: "fresh@x.dev", input: input(false) })).toEqual({
      refuse: "회원 등록 동의서를 먼저 작성하고, 제출했다고 체크해 주세요.",
    });
  });

  it("does not ask again once confirmed, and lets existing members confirm on their own", () => {
    const t = baseTables();
    t.Payments = [];
    // OLD registered before the site: no consent yet → must confirm first.
    expect("refuse" in planApplication(t, { now: NOW, actorId: "OLD", email: "old@x.dev", input: input(false) })).toBe(true);
    const confirm = planMemberConsent(t, { now: NOW, actorId: "OLD", memberId: "OLD" });
    if ("refuse" in confirm) throw new Error(confirm.refuse);
    expect(applyCommit(t, confirm.commit)).toEqual({ ok: true });
    expect(t.AuditLog!.at(-1)).toMatchObject({ action: "member.consent", target_id: "OLD" });
    // Now an extension goes through without the checkbox, at the regular price.
    const ext = planApplication(t, { now: NOW, actorId: "OLD", email: "old@x.dev", input: input(false) });
    if (!("commit" in ext)) throw new Error("expected a commit");
    expect(ext.result).toMatchObject({ amount: 80000, firstPriceApplied: false });
    expect(planMemberConsent(t, { now: NOW, actorId: "OLD", memberId: "OLD" })).toEqual({ refuse: "이미 제출을 확인했어요." });
  });
});

describe("ledger", () => {
  const input = { date: "2026-11-10", category: "소모품", description: "테이프", amount: 16950, person: "", method: "모임통장", receiptUrl: "", memo: "" };
  const commit = (p: ReturnType<typeof planLedgerAdd>) => {
    if (!("commit" in p)) throw new Error("refused" in p ? p.refuse : "noop");
    return p.commit;
  };

  it("adds, edits with a reason, and voids without deleting — all audited", () => {
    const t = baseTables();
    t.Ledger = [];
    const add = planLedgerAdd(t, { now: NOW, actorId: "OP", input });
    expect(applyCommit(t, commit(add))).toEqual({ ok: true });
    const id = String(t.Ledger[0].entry_id);

    expect(planLedgerEdit(t, { now: NOW, actorId: "OP", entryId: id, input, reason: " " })).toEqual({ refuse: "수정 사유를 적어 주세요." });
    expect(applyCommit(t, commit(planLedgerEdit(t, { now: NOW, actorId: "OP", entryId: id, input: { ...input, amount: 15950 }, reason: "영수증 확인" })))).toEqual({ ok: true });
    expect(t.Ledger[0].amount).toBe(15950);

    expect(applyCommit(t, commit(planLedgerVoid(t, { now: NOW, actorId: "OP", entryId: id, reason: "중복" })))).toEqual({ ok: true });
    expect(t.Ledger).toHaveLength(1);
    expect(t.Ledger[0]).toMatchObject({ status: "void", memo: "무효: 중복" });
    expect(planLedgerEdit(t, { now: NOW, actorId: "OP", entryId: id, input, reason: "x" })).toEqual({ refuse: "무효 처리된 기록은 고칠 수 없어요." });
    expect(t.AuditLog!.map((r) => r.action)).toEqual(["ledger.add", "ledger.edit", "ledger.void"]);
  });

  it("an edit planned from stale data is rejected under the lock", () => {
    const t = baseTables();
    t.Ledger = [];
    applyCommit(t, commit(planLedgerAdd(t, { now: NOW, actorId: "OP", input })));
    const id = String(t.Ledger[0].entry_id);
    const stale = commit(planLedgerEdit(t, { now: NOW, actorId: "OP", entryId: id, input: { ...input, amount: 1 }, reason: "a" }));
    applyCommit(t, commit(planLedgerEdit(t, { now: NOW, actorId: "OP", entryId: id, input: { ...input, amount: 2 }, reason: "b" })));
    expect(applyCommit(t, stale)).toMatchObject({ ok: false, error: "conflict" });
  });
});

describe("first-time price", () => {
  const result = (t: Tables, email: string, planId: string) => {
    const planned = planApplication(t, {
      now: NOW,
      actorId: "",
      email,
      input: { name: "회원", depositorName: "입금자", planId, requestedStart: null, consentConfirmed: true },
    });
    if (!("commit" in planned)) throw new Error("refused" in planned ? planned.refuse : "no commit");
    return planned.result as { amount: number; firstPriceApplied: boolean };
  };

  it("first 1개월 is 100,000; a plan without a first-time price keeps its price", () => {
    const t = baseTables();
    expect(result(t, "first@x.dev", "1M")).toEqual(expect.objectContaining({ amount: 100000, firstPriceApplied: true }));
    expect(result(baseTables(), "first6@x.dev", "6M")).toEqual(expect.objectContaining({ amount: 500000, firstPriceApplied: false }));
  });

  it("still applies to someone never approved (e.g. an earlier request was rejected)", () => {
    const t = baseTables();
    t.Payments = t.Payments!.map((p) => (p.payment_id === "P-NEW" ? { ...p, status: "rejected" } : p));
    t.Members = t.Members!.map((m) => (m.member_id === "NEW" ? { ...m, member_consent_at: "2026-11-10T10:00:00+09:00" } : m));
    expect(result(t, "new@x.dev", "1M")).toEqual(expect.objectContaining({ amount: 100000, firstPriceApplied: true }));
  });

  it("from the second membership on, 1개월 is 80,000 — also for members who joined before the site", () => {
    const t = baseTables();
    t.Payments = [];
    t.Members = [
      { member_id: "L1", name: "L1", email: "l1@x", status: "active", role: "member", joined_at: "2025-03-01", member_consent_at: "x" },
      { member_id: "L2", name: "L2", email: "l2@x", status: "active", role: "member", joined_at: "", member_consent_at: "x" },
    ];
    t.Memberships = [{ membership_id: "ML2", member_id: "L2", plan_id: "1M", start_date: "2026-01-01", end_date: "2026-01-31", status: "active" }];
    expect(result(t, "l1@x", "1M")).toEqual(expect.objectContaining({ amount: 80000, firstPriceApplied: false }));
    expect(result(t, "l2@x", "1M")).toEqual(expect.objectContaining({ amount: 80000, firstPriceApplied: false }));
  });

  it("works on a sheet set up before first_price existed: regular price, and only existing Payments columns are written", () => {
    const t = baseTables();
    t.Plans = t.Plans!.map(({ first_price: _drop, ...rest }) => (void _drop, rest));
    const planned = planApplication(t, {
      now: NOW,
      actorId: "",
      email: "old-sheet@x.dev",
      input: { name: "회원", depositorName: "입금자", planId: "1M", requestedStart: null, consentConfirmed: true },
    });
    if (!("commit" in planned)) throw new Error("no commit");
    expect(planned.result).toMatchObject({ amount: 80000, firstPriceApplied: false });
    // The live sheet's Payments header (2026-11-11). Writing any other column would be refused by Apps Script.
    const liveColumns = ["payment_id", "member_id", "depositor_name", "amount", "plan_id", "status", "requested_at", "requested_start", "deposited_at", "bank_transaction_id", "approved_by", "approved_at", "note"];
    const paymentRow = planned.commit.ops.find((o) => o.type === "append" && o.table === "Payments");
    expect(paymentRow && "row" in paymentRow && Object.keys(paymentRow.row).every((k) => liveColumns.includes(k))).toBe(true);
  });

  it("after the first approval, the next 1개월 is 80,000", () => {
    const t = baseTables();
    const first = planApplication(t, {
      now: NOW,
      actorId: "",
      email: "fresh@x.dev",
      input: { name: "새 회원", depositorName: "새", planId: "1M", requestedStart: null, consentConfirmed: true },
    });
    if (!("commit" in first)) throw new Error("no commit");
    applyCommit(t, first.commit);
    const paymentId = (first.result as { paymentId: string }).paymentId;
    applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId })));
    expect(result(t, "fresh@x.dev", "1M")).toEqual(expect.objectContaining({ amount: 80000, firstPriceApplied: false }));
  });
});

describe("events", () => {
  const input: EventInput = {
    title: "개관식", short_title: "", description: "", category: "community", start_at: "2026-11-21T16:00:00+09:00", end_at: "",
    registration_open: "", registration_close: "", capacity: "", public_fee: "", registration_url: "", host: "운영진",
    audience: "", location: "", notes: "", visibility: "public", status: "published",
  };
  const commit = (p: ReturnType<typeof planEventCreate>) => {
    if (!("commit" in p)) throw new Error("refuse" in p ? p.refuse : "noop");
    return p.commit;
  };
  const created = () => {
    const t = baseTables();
    t.Events = [];
    expect(applyCommit(t, commit(planEventCreate(t, { now: NOW, actorId: "OP", input })))).toEqual({ ok: true });
    return { t, id: String(t.Events[0].event_id), base: String(t.Events[0].updated_at) };
  };

  it("creates a row with an id and version, and edits only what changed — all audited", () => {
    const { t, id, base } = created();
    expect(id).toMatch(/^EV-261111-/);
    expect(t.Events![0]).toMatchObject({ title: "개관식", updated_at: "2026-11-11T12:00:00+09:00" });

    const later = NOW + 60_000;
    const edit = commit(planEventEdit(t, { now: later, actorId: "OP", eventId: id, base, input: { ...input, location: "크루 공간" } }));
    expect(edit.ops[0]).toEqual({
      type: "update",
      table: "Events",
      id,
      set: { location: "크루 공간", updated_at: "2026-11-11T12:01:00+09:00" },
    });
    expect(applyCommit(t, edit)).toEqual({ ok: true });
    expect(planEventEdit(t, { now: later, actorId: "OP", eventId: id, base: "2026-11-11T12:01:00+09:00", input: { ...input, location: "크루 공간" } })).toEqual({
      refuse: "바뀐 내용이 없어요.",
    });
    expect(t.AuditLog!.map((r) => r.action)).toEqual(["event.create", "event.edit"]);
  });

  it("refuses a form opened before someone else's change (no silent overwrite)", () => {
    const { t, id, base } = created();
    // Someone edits the row in the sheet: the onEdit trigger bumps updated_at.
    t.Events![0].host = "세팅 팀";
    t.Events![0].updated_at = "2026-11-11T12:05:00+09:00";
    expect(planEventEdit(t, { now: NOW, actorId: "OP", eventId: id, base, input: { ...input, title: "개관 파티" } })).toEqual({ refuse: EVENT_CHANGED });
  });

  it("an edit planned before a concurrent save is rejected under the lock", () => {
    const { t, id, base } = created();
    const stale = commit(planEventEdit(t, { now: NOW + 1000, actorId: "OP", eventId: id, base, input: { ...input, title: "A" } }));
    applyCommit(t, commit(planEventEdit(t, { now: NOW + 2000, actorId: "OP", eventId: id, base, input: { ...input, title: "B" } })));
    expect(applyCommit(t, stale)).toMatchObject({ ok: false, error: "conflict" });
    expect(t.Events![0].title).toBe("B");
  });
});

describe("event from a proposal", () => {
  const input: EventInput = {
    title: "LP 감상회", short_title: "", description: "", category: "music", start_at: "2026-12-13T19:00:00+09:00", end_at: "",
    registration_open: "", registration_close: "", capacity: "", public_fee: "", registration_url: "", host: "멤버 제안 · 지민",
    audience: "", location: "", notes: "", visibility: "public", status: "published",
  };
  const withProposal = () => {
    const t = baseTables();
    t.Events = [];
    t.Proposals = [{ proposal_id: "PR-1", event_title: "LP 감상회", review_status: "accepted" }];
    return t;
  };

  it("uses the proposal's id, and the same proposal can't become two events", () => {
    const t = withProposal();
    const first = planEventCreate(t, { now: NOW, actorId: "OP", input, fromProposal: "PR-1" });
    if (!("commit" in first)) throw new Error("expected a commit");
    expect(applyCommit(t, first.commit)).toEqual({ ok: true });
    expect(t.Events![0].event_id).toBe("EV-PR-1");
    expect(JSON.parse(String(t.AuditLog!.at(-1)!.after_value))).toMatchObject({ from_proposal: "PR-1" });
    expect(planEventCreate(t, { now: NOW, actorId: "OP", input, fromProposal: "PR-1" })).toEqual({ refuse: PROPOSAL_ALREADY_EVENT });
  });

  it("two operators converting at once: the second is stopped under the lock", () => {
    const t = withProposal();
    const a = planEventCreate(t, { now: NOW, actorId: "OP", input, fromProposal: "PR-1" });
    const b = planEventCreate(t, { now: NOW, actorId: "OP2", input, fromProposal: "PR-1" });
    if (!("commit" in a) || !("commit" in b)) throw new Error("expected commits");
    expect(applyCommit(t, a.commit)).toEqual({ ok: true });
    expect(applyCommit(t, b.commit)).toMatchObject({ ok: false, error: "conflict" });
    expect(t.Events).toHaveLength(1);
  });

  it("refuses an unknown proposal", () => {
    expect(planEventCreate(withProposal(), { now: NOW, actorId: "OP", input, fromProposal: "PR-404" })).toEqual({ refuse: "제안을 찾을 수 없어요." });
  });
});
