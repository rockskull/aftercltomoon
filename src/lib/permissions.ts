/**
 * Who on the crew may do what — the one table every admin screen, server action
 * and crew notification follows.
 *
 *  admin     everything.
 *  operator  the club's activities only: events (incl. enrollment periods),
 *            proposals, AFTER HOURS RADIO, MOON PROBLEMS, the club notice
 *            (설정 → 아지트 공지) and issuing/revoking MOON STAMPS. May look at
 *            the member list and member states (for the group chat), but never
 *            money (deposits, statement, ledger, registrations, membership
 *            periods), member records, plans or other settings.
 *
 * Screens hide what isn't allowed; the server checks it again on every write.
 */

export type Capability =
  | "money" // deposits, approvals, refunds, bank statement, ledger, membership periods, registrations
  | "members" // add / edit member records and roles
  | "settings" // plans, site settings, stamp definitions
  | "events"
  | "proposals"
  | "radio"
  | "problems"
  | "notice"
  | "stamps";

const OPERATOR_CAN: ReadonlySet<Capability> = new Set<Capability>(["events", "proposals", "radio", "problems", "notice", "stamps"]);

export function can(member: { role: string; status: string } | null | undefined, cap: Capability): boolean {
  if (!member || member.status !== "active") return false;
  if (member.role === "admin") return true;
  if (member.role === "operator") return OPERATOR_CAN.has(cap);
  return false;
}

export const ADMIN_ONLY_ACTION = "admin만 할 수 있어요. 운영자 권한으로는 회비·회계·회원권·회원 정보·설정을 바꿀 수 없어요.";
