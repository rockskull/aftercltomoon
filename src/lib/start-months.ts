/**
 * The club's first membership month. No new membership starts before it:
 * the member's 시작 월 list, the crew's approval / direct-registration month
 * pickers and the automatic start all begin here (2026-11-13: "26년 12월부터").
 * Existing rows are untouched — editing an existing membership's dates and every
 * history / detail view still show whatever months they have.
 */
export const FIRST_START_MONTH = "2026-12";
export const FIRST_START_DAY = `${FIRST_START_MONTH}-01`;

/** Refusal when a start before the first month is sent anyway (stale or hand-made form). */
export const START_TOO_EARLY = "회원권은 2026년 12월부터 시작할 수 있어요. 시작 월을 다시 골라 주세요.";

/** Earliest start a member can ask for: this month or the club's first month, whichever is later ("YYYY-MM-01"). */
export function earliestStart(todayKey: string): string {
  const thisMonth = `${todayKey.slice(0, 7)}-01`;
  return thisMonth > FIRST_START_DAY ? thisMonth : FIRST_START_DAY;
}

/** Four months from the earliest allowed start, as the 1st of each month ("YYYY-MM-01"). */
export function startMonths(today: string): Array<{ value: string; label: string }> {
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7));
  const first = earliestStart(today);
  const fy = Number(first.slice(0, 4));
  const fm = Number(first.slice(5, 7));
  return [0, 1, 2, 3].map((i) => {
    const year = fy + Math.floor((fm - 1 + i) / 12);
    const month = ((fm - 1 + i) % 12) + 1;
    const fromToday = (year - ty) * 12 + (month - tm);
    return {
      value: `${year}-${String(month).padStart(2, "0")}-01`,
      label: `${year}년 ${month}월${fromToday === 0 ? " (이번 달)" : fromToday === 1 ? " (다음 달)" : ""}`,
    };
  });
}
