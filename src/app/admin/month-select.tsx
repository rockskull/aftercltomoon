import { smallInput } from "./shared";

/** "YYYY-MM" months from `back` months before `around` to `ahead` months after it. */
function monthsAround(around: string, back: number, ahead: number): string[] {
  const y = Number(around.slice(0, 4));
  const m = Number(around.slice(5, 7)) - 1;
  return Array.from({ length: back + ahead + 1 }, (_, i) => {
    const idx = m - back + i;
    const year = y + Math.floor(idx / 12);
    const month = ((idx % 12) + 12) % 12;
    return `${year}-${String(month + 1).padStart(2, "0")}`;
  });
}

const label = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;

/**
 * Month picker for memberships (they always run from the 1st to the last day of a month).
 * A select instead of <input type="month">, which some desktop browsers show as a plain text box.
 */
export function MonthSelect({
  name,
  todayKey,
  defaultValue = "",
  emptyLabel,
  required = false,
  describedBy,
  from,
}: {
  name: string;
  todayKey: string;
  /** "YYYY-MM" */
  defaultValue?: string;
  /** Adds a first, empty option (e.g. "자동"). */
  emptyLabel?: string;
  required?: boolean;
  describedBy?: string;
  /** "YYYY-MM": no month before this one is offered (new memberships start from the club's first month). */
  from?: string;
}) {
  const months = monthsAround(todayKey, 24, 24).filter((ym) => !from || ym >= from);
  if (defaultValue && !months.includes(defaultValue) && (!from || defaultValue >= from)) months.push(defaultValue);
  months.sort();
  return (
    <select name={name} defaultValue={defaultValue} required={required} aria-describedby={describedBy} className={smallInput}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {months.map((ym) => (
        <option key={ym} value={ym}>
          {label(ym)}
        </option>
      ))}
    </select>
  );
}
