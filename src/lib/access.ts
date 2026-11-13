import { addDays } from "./dates";
import { monthEnd, type MembershipPeriod } from "./membership";

/**
 * ACTIVE MEMBERS ONLY — the one place that decides a member's state and whether
 * they may use member features (radio requests, event proposals, …). Every
 * screen and every server action uses this; nothing computes its own version.
 * Pure function on Seoul day keys.
 *
 *  ACTIVE       today is inside a confirmed membership
 *  RENEWAL_DUE  still valid, but in the last 7 days of the month the 1st of next
 *               month isn't covered by a confirmed membership
 *  PENDING      a deposit/application is waiting for the crew (never grants access
 *               on its own; a membership still in effect keeps working)
 *  EXPIRED      no membership in effect and nothing confirmed to continue it
 *
 * Long memberships (6+1, 12+2) and prepaid months count by their real dates.
 */

export const MEMBERSHIP_REQUIRED = "MEMBERSHIP_REQUIRED" as const;
export const RENEWAL_WINDOW_DAYS = 7;

export type AccessStatus = "ACTIVE" | "RENEWAL_DUE" | "PENDING" | "EXPIRED";
/** Why member features are closed. */
export type BlockReason = "not_member" | "suspended" | "pending" | "not_started" | "expired";

export interface AccessMember {
  id: string;
  role: string;
  status: string;
}

export interface MemberAccess {
  status: AccessStatus;
  /** May use member features. Staff (active operator/admin) always may. */
  canParticipate: boolean;
  /** Set when canParticipate is false. */
  blockReason: BlockReason | null;
  /** Last day of the confirmed memberships running on from today (null when none is in effect). */
  validUntil: string | null;
  /** Earliest confirmed start in the future, when nothing is in effect today. */
  startsOn: string | null;
  /** Last day of the most recent confirmed membership that has ended (null when none). */
  lastEnded: string | null;
  /** The 1st of next month is covered by a confirmed membership. */
  nextMonthCovered: boolean;
  /** Today is within the last 7 days of the month. */
  renewalWindow: boolean;
  /** A deposit/application is waiting for the crew. */
  pending: boolean;
  staff: boolean;
}

export function memberAccess(args: {
  member: AccessMember | null;
  memberships: Array<MembershipPeriod & { memberId: string }>;
  payments: Array<{ memberId: string; status: string }>;
  todayKey: string;
}): MemberAccess {
  const today = args.todayKey;
  const lastDay = monthEnd(today);
  const renewalWindow = today >= addDays(lastDay, -(RENEWAL_WINDOW_DAYS - 1));
  const nextMonthStart = addDays(lastDay, 1);
  const base = { validUntil: null, startsOn: null, lastEnded: null, nextMonthCovered: false, renewalWindow, pending: false, staff: false };

  const member = args.member;
  if (!member) return { ...base, status: "EXPIRED", canParticipate: false, blockReason: "not_member" };

  const mine = args.memberships.filter((m) => m.memberId === member.id && m.status === "active");
  const covers = (day: string) => mine.some((m) => m.startDate <= day && day <= m.endDate);
  const pending = args.payments.some((p) => p.memberId === member.id && (p.status === "pending" || p.status === "matched"));
  const staff = member.status === "active" && (member.role === "operator" || member.role === "admin");
  const nextMonthCovered = covers(nextMonthStart);
  const ended = mine.filter((m) => m.endDate < today).map((m) => m.endDate).sort();
  const lastEnded = ended.at(-1) ?? null;
  const facts = { ...base, nextMonthCovered, pending, staff, lastEnded };

  if (member.status === "inactive") return { ...facts, status: "EXPIRED", canParticipate: false, blockReason: "suspended" };

  if (covers(today)) {
    // Follow back-to-back memberships to the real last day.
    let validUntil = today;
    for (;;) {
      const next = mine.filter((m) => m.startDate <= validUntil && m.endDate >= validUntil).map((m) => m.endDate).sort().at(-1)!;
      if (!covers(addDays(next, 1))) {
        validUntil = next;
        break;
      }
      validUntil = addDays(next, 1);
    }
    const due = renewalWindow && !nextMonthCovered;
    return { ...facts, status: due ? (pending ? "PENDING" : "RENEWAL_DUE") : "ACTIVE", canParticipate: true, blockReason: null, validUntil };
  }

  const startsOn = mine.filter((m) => m.startDate > today).map((m) => m.startDate).sort()[0] ?? null;
  const status: AccessStatus = pending ? "PENDING" : "EXPIRED";
  if (staff) return { ...facts, status, startsOn, canParticipate: true, blockReason: null };
  return { ...facts, status, startsOn, canParticipate: false, blockReason: pending ? "pending" : startsOn ? "not_started" : "expired" };
}

/** What the crew should check in the members' group chat (a hint only — nothing is done automatically). */
export type ChatHint = "remove" | "invite" | "reinvite" | null;

export function chatHint(args: {
  access: MemberAccess;
  memberships: Array<MembershipPeriod & { memberId: string }>;
  memberId: string;
  todayKey: string;
}): ChatHint {
  const { access } = args;
  if (access.staff) return null;
  // Ended and not continued: the crew checks whether they should leave the chat.
  if (!access.validUntil && !access.startsOn && access.lastEnded) return "remove";
  // Just started (or about to): first-timers get an invite, returners a re-invite.
  const mine = args.memberships
    .filter((m) => m.memberId === args.memberId && m.status === "active")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const runningOrNext = mine.find((m) => m.endDate >= args.todayKey);
  if (!runningOrNext || runningOrNext.startDate < addDays(args.todayKey, -31)) return null;
  const before = mine.filter((m) => m.endDate < runningOrNext.startDate);
  if (!before.length) return "invite";
  const lastBefore = before.map((m) => m.endDate).sort().at(-1)!;
  return addDays(lastBefore, 1) < runningOrNext.startDate ? "reinvite" : null;
}

/** The notice a signed-in member sees at the top of the site (null = none). */
export type BannerKind = "renew" | "renew_pending" | "expired" | "pending" | "starts";

export function bannerKind(access: MemberAccess): BannerKind | null {
  if (access.canParticipate) {
    if (access.status === "RENEWAL_DUE") return "renew";
    if (access.status === "PENDING") return "renew_pending";
    return null; // in effect and next month covered (or staff): nothing to say
  }
  switch (access.blockReason) {
    case "expired":
      return "expired";
    case "pending":
      return "pending";
    case "not_started":
      return "starts";
    default:
      return null; // not a member / suspended: the membership page explains
  }
}

/** The standard wording for a closed member feature (same everywhere). */
export function blockedMessage(reason: BlockReason): { title: string; body: string; action: "register" | "membership" | null } {
  switch (reason) {
    case "pending":
      return { title: "MEMBERSHIP PENDING", body: "입금·등록을 운영진이 확인하고 있어요. 확인되면 클럽 참여 기능을 이용할 수 있어요.", action: "membership" };
    case "not_started":
      return { title: "MEMBERSHIP STARTS SOON", body: "회원권 이용 시작일 전이에요. 이용 기간이 시작되면 클럽 참여 기능을 이용할 수 있어요.", action: "membership" };
    case "suspended":
      return { title: "MEMBERSHIP REQUIRED", body: "이용이 중지된 계정이에요. 운영진에게 문의해 주세요.", action: null };
    default:
      return {
        title: "MEMBERSHIP REQUIRED",
        body: "현재 이용 등록이 확인되지 않았습니다. 클럽 참여 기능을 이용하려면 회원권을 먼저 등록해 주세요.",
        action: "register",
      };
  }
}
