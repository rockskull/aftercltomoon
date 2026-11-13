import { addDays, daysInMonth, makeDateKey } from "./dates";

/**
 * Membership period engine. Pure functions on Seoul day keys ("YYYY-MM-DD").
 *
 * Club rule: memberships run in whole calendar months. Every membership starts
 * on the 1st and ends on the last day of a month (1개월 → 11.01–11.30,
 * 6개월 + 보너스 1개월 → 12.01–06.30), whatever day the fee was paid.
 * nextMembershipPeriod and the operator forms only ever produce such periods.
 *
 * membershipEndDate keeps the general period rule below; for a start on the
 * 1st it is exactly the last day of the final month.
 *
 * Period rule (Korean Civil Act art. 160, counting the first day):
 *  - the start day is included, the end day is included;
 *  - a period of N months ends the day before the same day-of-month N months
 *    later (2026-11-11 + 1 month → 2026-12-10);
 *  - if that day does not exist in the final month, the period ends on the last
 *    day of that month (2026-01-31 + 1 month → 2026-02-28; leap years handled).
 */
export function membershipEndDate(startKey: string, months: number): string {
  if (!Number.isInteger(months) || months < 1) throw new RangeError(`months must be a positive integer, got ${months}`);
  const [y, m, d] = startKey.split("-").map(Number);
  const targetMonthIndex = m - 1 + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = (targetMonthIndex % 12) + 1;
  if (d > daysInMonth(ty, tm)) return makeDateKey(ty, tm, daysInMonth(ty, tm));
  return addDays(makeDateKey(ty, tm, d), -1);
}

/** First day of the month that contains `key`. */
export function monthStart(key: string): string {
  return `${key.slice(0, 8)}01`;
}

/** Last day of the month that contains `key`. */
export function monthEnd(key: string): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return makeDateKey(y, m, daysInMonth(y, m));
}

export function isMonthStart(key: string): boolean {
  return key.slice(8) === "01";
}

export function isMonthEnd(key: string): boolean {
  return key === monthEnd(key);
}

/** The 1st of a month on or after `key` (a mid-month day moves to the next month's 1st). */
export function monthStartOnOrAfter(key: string): string {
  return isMonthStart(key) ? key : addDays(monthEnd(key), 1);
}

/** A month input value ("YYYY-MM") → its first and last day; null when malformed. */
export function monthBounds(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const start = `${month}-01`;
  return { start, end: monthEnd(start) };
}

/** Inclusive number of days in [start, end]. */
export function inclusiveDays(startKey: string, endKey: string): number {
  return Math.round((Date.parse(`${endKey}T00:00:00Z`) - Date.parse(`${startKey}T00:00:00Z`)) / 86_400_000) + 1;
}

export interface PlanTerms {
  durationMonths: number;
  bonusMonths: number;
}

export function totalMonths(plan: PlanTerms): number {
  return plan.durationMonths + plan.bonusMonths;
}

/** Stored state of a membership row. Validity (active/expired) is derived from dates. */
export type MembershipRecordStatus = "active" | "canceled" | "refunded";
export type MembershipPhase = "scheduled" | "active" | "expired" | "canceled" | "refunded";

export interface MembershipPeriod {
  id: string;
  startDate: string;
  endDate: string;
  status: MembershipRecordStatus;
}

export function membershipPhase(m: MembershipPeriod, todayKey: string): MembershipPhase {
  if (m.status !== "active") return m.status;
  if (todayKey < m.startDate) return "scheduled";
  if (todayKey > m.endDate) return "expired";
  return "active";
}

/** Only rows that still grant access (not canceled/refunded). */
function valid<T extends MembershipPeriod>(memberships: T[]): T[] {
  return memberships.filter((m) => m.status === "active");
}

/**
 * The membership to show the member: the one in effect today, else the next
 * scheduled one, else the most recently ended one.
 */
export function currentMembership<T extends MembershipPeriod>(memberships: T[], todayKey: string): T | null {
  const rows = valid(memberships);
  const inEffect = rows.filter((m) => m.startDate <= todayKey && todayKey <= m.endDate);
  if (inEffect.length) return inEffect.sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const upcoming = rows.filter((m) => m.startDate > todayKey).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (upcoming.length) return upcoming[0];
  const past = rows.sort((a, b) => b.endDate.localeCompare(a.endDate));
  return past[0] ?? null;
}

/** Last day of access across all valid memberships (null if none reaches today). */
export function accessUntil(memberships: MembershipPeriod[], todayKey: string): string | null {
  const ends = valid(memberships)
    .filter((m) => m.endDate >= todayKey)
    .map((m) => m.endDate)
    .sort();
  return ends.at(-1) ?? null;
}

/**
 * Last day of uninterrupted access starting at `fromKey` (which must be covered):
 * follows back-to-back memberships and stops at the first gap, so a registration
 * of 12월 + 1월 + 3월 reads "until 01.31", not "until 03.31". null when `fromKey`
 * itself isn't covered.
 */
export function continuousUntil(memberships: MembershipPeriod[], fromKey: string): string | null {
  const rows = valid(memberships);
  const covers = (day: string) => rows.some((m) => m.startDate <= day && day <= m.endDate);
  if (!covers(fromKey)) return null;
  let day = fromKey;
  for (;;) {
    const end = rows.filter((m) => m.startDate <= day && m.endDate >= day).map((m) => m.endDate).sort().at(-1)!;
    if (!covers(addDays(end, 1))) return end;
    day = addDays(end, 1);
  }
}

/** Days of access left including today (today = last day → 1). 0 when not in effect. */
export function daysLeft(m: MembershipPeriod, todayKey: string): number {
  if (membershipPhase(m, todayKey) !== "active") return 0;
  return inclusiveDays(todayKey, m.endDate);
}

export interface NextPeriod {
  startDate: string;
  endDate: string;
  /** true when chained after an existing membership, so remaining days are kept. */
  extendsExisting: boolean;
}

/**
 * Period for a newly approved payment: always from the 1st of a month to the
 * last day of a month. The deposit date plays no part.
 *  - Member still has access (now or scheduled): starts on the 1st right after
 *    the last valid end date, so no paid month is lost. (Site-made memberships
 *    end on a month's last day, so this is simply the next day; an older row
 *    ending mid-month moves to the following 1st instead of overlapping.)
 *  - Otherwise (new or expired member): the month the member asked for, if it
 *    is this month or later, else this month.
 * An explicit `startOverride` from the crew always wins (moved to its month's 1st).
 * `earliestStart` ("YYYY-MM-01", the club's first membership month) keeps an
 * automatically chosen start from falling before it; an override is checked by
 * the caller instead.
 */
export function nextMembershipPeriod(args: {
  existing: MembershipPeriod[];
  plan: PlanTerms;
  todayKey: string;
  requestedStart?: string | null;
  startOverride?: string | null;
  earliestStart?: string | null;
}): NextPeriod {
  const months = totalMonths(args.plan);
  const lastEnd = accessUntil(args.existing, args.todayKey);
  const chained = lastEnd ? monthStartOnOrAfter(addDays(lastEnd, 1)) : null;

  let startDate: string;
  if (args.startOverride) startDate = monthStart(args.startOverride);
  else if (chained) startDate = chained;
  else {
    const thisMonth = monthStart(args.todayKey);
    const requested = args.requestedStart ? monthStart(args.requestedStart) : null;
    startDate = requested && requested > thisMonth ? requested : thisMonth;
  }
  if (!args.startOverride && args.earliestStart && startDate < monthStart(args.earliestStart)) startDate = monthStart(args.earliestStart);
  return { startDate, endDate: membershipEndDate(startDate, months), extendsExisting: chained !== null && startDate === chained };
}

/** Valid memberships whose dates overlap [start, end]; used to warn the crew before saving. */
export function overlapping<T extends MembershipPeriod>(memberships: T[], startKey: string, endKey: string, ignoreId?: string): T[] {
  return valid(memberships).filter((m) => m.id !== ignoreId && m.startDate <= endKey && startKey <= m.endDate);
}
