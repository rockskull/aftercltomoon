import { describe, expect, it } from "vitest";
import { chatHint, memberAccess } from "./access";

type M = { id: string; memberId: string; startDate: string; endDate: string; status: "active" | "canceled" | "refunded" };
const member = (over: Partial<{ role: string; status: string }> = {}) => ({ id: "A", role: over.role ?? "member", status: over.status ?? "active" });
const ms = (startDate: string, endDate: string, status: M["status"] = "active", id = `${startDate}`): M => ({ id, memberId: "A", startDate, endDate, status });
const access = (memberships: M[], todayKey: string, opts: { pending?: boolean; role?: string; status?: string } = {}) =>
  memberAccess({
    member: member({ role: opts.role, status: opts.status }),
    memberships,
    payments: opts.pending ? [{ memberId: "A", status: "pending" }] : [],
    todayKey,
  });

describe("member state", () => {
  const november = [ms("2026-11-01", "2026-11-30")];

  it("ACTIVE inside a confirmed month; the renewal notice only in the last 7 days", () => {
    expect(access(november, "2026-11-13")).toMatchObject({ status: "ACTIVE", canParticipate: true, renewalWindow: false });
    expect(access(november, "2026-11-23")).toMatchObject({ status: "ACTIVE", renewalWindow: false });
    expect(access(november, "2026-11-24")).toMatchObject({ status: "RENEWAL_DUE", canParticipate: true, renewalWindow: true });
    expect(access(november, "2026-11-30")).toMatchObject({ status: "RENEWAL_DUE", canParticipate: true });
    // 31-day and February months
    expect(access([ms("2026-12-01", "2026-12-31")], "2026-12-24")).toMatchObject({ status: "ACTIVE" });
    expect(access([ms("2026-12-01", "2026-12-31")], "2026-12-25")).toMatchObject({ status: "RENEWAL_DUE" });
    expect(access([ms("2027-02-01", "2027-02-28")], "2027-02-22")).toMatchObject({ status: "RENEWAL_DUE" });
    expect(access([ms("2028-02-01", "2028-02-29")], "2028-02-22")).toMatchObject({ status: "ACTIVE" });
  });

  it("no notice when next month is already registered (prepaid) or covered by a long membership", () => {
    expect(access([...november, ms("2026-12-01", "2026-12-31")], "2026-11-28")).toMatchObject({ status: "ACTIVE", nextMonthCovered: true, validUntil: "2026-12-31" });
    // 6+1 months: Sep–Mar, only the last week of March asks
    const long = [ms("2026-09-01", "2027-03-31")];
    expect(access(long, "2026-11-28")).toMatchObject({ status: "ACTIVE", validUntil: "2027-03-31" });
    expect(access(long, "2027-03-26")).toMatchObject({ status: "RENEWAL_DUE" });
  });

  it("a renewal deposit waiting for the crew shows as PENDING but the current month keeps working", () => {
    expect(access(november, "2026-11-27", { pending: true })).toMatchObject({ status: "PENDING", canParticipate: true });
    expect(access(november, "2026-11-10", { pending: true })).toMatchObject({ status: "ACTIVE", canParticipate: true, pending: true });
  });

  it("EXPIRED blocks member features; a pending deposit alone does not open them", () => {
    expect(access(november, "2026-12-01")).toMatchObject({ status: "EXPIRED", canParticipate: false, blockReason: "expired", lastEnded: "2026-11-30" });
    expect(access(november, "2026-12-03", { pending: true })).toMatchObject({ status: "PENDING", canParticipate: false, blockReason: "pending" });
    expect(access([], "2026-11-13")).toMatchObject({ status: "EXPIRED", canParticipate: false, blockReason: "expired" });
  });

  it("re-registration restores access from its start date", () => {
    const later = [ms("2026-08-01", "2026-08-31"), ms("2026-12-01", "2026-12-31")];
    expect(access(later, "2026-11-20")).toMatchObject({ status: "EXPIRED", canParticipate: false, blockReason: "not_started", startsOn: "2026-12-01" });
    expect(access(later, "2026-12-01")).toMatchObject({ status: "ACTIVE", canParticipate: true });
  });

  it("canceled or refunded memberships don't count", () => {
    expect(access([ms("2026-11-01", "2026-11-30", "canceled")], "2026-11-13")).toMatchObject({ status: "EXPIRED", canParticipate: false });
    expect(access([ms("2026-11-01", "2026-11-30", "refunded")], "2026-11-13")).toMatchObject({ canParticipate: false });
  });

  it("strangers and suspended accounts are blocked; active staff keep their access", () => {
    expect(memberAccess({ member: null, memberships: [], payments: [], todayKey: "2026-11-13" })).toMatchObject({ canParticipate: false, blockReason: "not_member" });
    expect(access(november, "2026-11-13", { status: "inactive" })).toMatchObject({ canParticipate: false, blockReason: "suspended" });
    expect(access([], "2026-11-13", { role: "operator" })).toMatchObject({ canParticipate: true, staff: true });
    expect(access([], "2026-11-13", { role: "admin", status: "inactive" })).toMatchObject({ canParticipate: false });
  });
});

describe("group chat hints", () => {
  const hint = (memberships: M[], todayKey: string) => chatHint({ access: access(memberships, todayKey), memberships, memberId: "A", todayKey });

  it("expired → check removal; first month → invite; back after a gap → re-invite; continuous → nothing", () => {
    expect(hint([ms("2026-10-01", "2026-10-31")], "2026-11-13")).toBe("remove");
    expect(hint([ms("2026-11-01", "2026-11-30")], "2026-11-13")).toBe("invite");
    expect(hint([ms("2026-08-01", "2026-08-31"), ms("2026-11-01", "2026-11-30")], "2026-11-13")).toBe("reinvite");
    expect(hint([ms("2026-10-01", "2026-10-31"), ms("2026-11-01", "2026-11-30")], "2026-11-13")).toBeNull();
    expect(hint([ms("2026-08-01", "2026-08-31"), ms("2026-12-01", "2026-12-31")], "2026-11-20")).toBe("reinvite"); // confirmed, starts soon
    expect(hint([], "2026-11-13")).toBeNull(); // never a member
  });
});
