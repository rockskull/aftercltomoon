/**
 * Months the crew has taken off the membership form's 시작 월 list (v1.4:
 * 2026년 11월). Only the choice disappears from that form — existing
 * memberships, their dates, fees and the membership rules are untouched, and
 * 2026-11 still shows everywhere else (member details, history, admin).
 */
export const HIDDEN_START_MONTHS: ReadonlySet<string> = new Set(["2026-11"]);

/** This month and the next three, as the 1st of each month ("YYYY-MM-01"), minus the hidden ones. */
export function startMonths(today: string): Array<{ value: string; label: string }> {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return [0, 1, 2, 3]
    .map((i) => {
      const year = y + Math.floor((m - 1 + i) / 12);
      const month = ((m - 1 + i) % 12) + 1;
      return {
        value: `${year}-${String(month).padStart(2, "0")}-01`,
        label: `${year}년 ${month}월${i === 0 ? " (이번 달)" : i === 1 ? " (다음 달)" : ""}`,
      };
    })
    .filter((option) => !HIDDEN_START_MONTHS.has(option.value.slice(0, 7)));
}
