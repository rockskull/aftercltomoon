import { daysInMonth } from "./dates";
import { FIRST_START_MONTH } from "./start-months";

/**
 * MEMBERSHIP REGISTRATION (admin, v1.6): several months registered at once,
 * the first month optionally from a later day, charged by calendar days.
 *
 *   first month  = round(fee × (days in month − start day + 1) ÷ days in month)
 *   every other  = fee
 *   total        = sum of the lines (won, rounded half up; ties can't occur
 *                  for 80,000 over 28–31 days anyway)
 *
 * Selected months that aren't next to each other stay separate periods — the
 * gap is never covered. Pure and shared: the admin screen previews with it and
 * the server recomputes with it (the client's numbers are never trusted).
 */

export interface RegistrationSpec {
  /** "YYYY-MM", ascending, no duplicates. */
  months: string[];
  /** "YYYY-MM-DD" inside the first month (day 1 = the whole month). */
  start: string;
  /** Monthly fee in won at the time the charge was made. */
  fee: number;
}

export interface RegistrationLine {
  month: string;
  start: string;
  end: string;
  /** Days used in this month / days in the month. */
  days: number;
  monthDays: number;
  amount: number;
  prorated: boolean;
}

export interface RegistrationQuote extends RegistrationSpec {
  lines: RegistrationLine[];
  total: number;
  /** Continuous stretches of access, one membership row each. */
  periods: Array<{ start: string; end: string }>;
}

export const MAX_REGISTRATION_MONTHS = 24;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");
const ymParts = (ym: string) => [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))] as const;
const lastDay = (ym: string) => daysInMonth(...ymParts(ym));
const monthIndex = (ym: string) => ymParts(ym)[0] * 12 + ymParts(ym)[1] - 1;

export function addMonths(ym: string, n: number): string {
  const i = monthIndex(ym) + n;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
}

/** Sorted, de-duplicated months (the same month can't be picked twice). */
export function normalizeMonths(months: string[]): string[] {
  return [...new Set(months.map((m) => m.trim()))].sort();
}

export function quoteRegistration(spec: RegistrationSpec): RegistrationQuote | { error: string } {
  const months = normalizeMonths(spec.months);
  if (!months.length) return { error: "등록월을 하나 이상 골라 주세요." };
  if (months.length > MAX_REGISTRATION_MONTHS) return { error: `한 번에 ${MAX_REGISTRATION_MONTHS}개월까지 등록할 수 있어요.` };
  if (months.some((m) => !MONTH.test(m))) return { error: "등록월 형식을 확인해 주세요." };
  if (months[0] < FIRST_START_MONTH) return { error: "회원권은 2026년 12월부터 등록할 수 있어요." };
  if (!Number.isInteger(spec.fee) || spec.fee <= 0) return { error: "월 회비를 확인해 주세요." };
  const startMatch = DAY.exec(spec.start);
  if (!startMatch || spec.start.slice(0, 7) !== months[0]) return { error: "시작일은 첫 등록월 안의 날짜여야 해요." };
  const startDay = Number(startMatch[3]);
  const firstDays = lastDay(months[0]);
  if (startDay < 1 || startDay > firstDays) return { error: "시작일을 확인해 주세요." };

  const lines: RegistrationLine[] = months.map((m, i) => {
    const monthDays = lastDay(m);
    const from = i === 0 ? startDay : 1;
    const days = monthDays - from + 1;
    const prorated = days !== monthDays;
    return {
      month: m,
      start: `${m}-${pad(from)}`,
      end: `${m}-${pad(monthDays)}`,
      days,
      monthDays,
      amount: prorated ? Math.round((spec.fee * days) / monthDays) : spec.fee,
      prorated,
    };
  });

  const periods: Array<{ start: string; end: string }> = [];
  lines.forEach((line, i) => {
    const prev = months[i - 1];
    if (i > 0 && monthIndex(line.month) === monthIndex(prev) + 1) periods[periods.length - 1].end = line.end;
    else periods.push({ start: line.start, end: line.end });
  });

  return { months, start: spec.start, fee: spec.fee, lines, total: lines.reduce((a, l) => a + l.amount, 0), periods };
}

/** Stored on Payments.registration (empty for ordinary applications). */
export function serializeRegistration(spec: RegistrationSpec): string {
  return JSON.stringify({ months: normalizeMonths(spec.months), start: spec.start, fee: spec.fee });
}

export function parseRegistration(text: string | null | undefined): RegistrationSpec | null {
  if (!text || !text.trim()) return null;
  try {
    const v = JSON.parse(text) as Partial<RegistrationSpec>;
    if (!Array.isArray(v.months) || typeof v.start !== "string" || typeof v.fee !== "number") return null;
    return { months: v.months.map(String), start: v.start, fee: v.fee };
  } catch {
    return null;
  }
}

const dot = (key: string) => key.replace(/-/g, ".");

/** "12.15 – 02.28 · 3개월" style label, gaps shown as separate ranges. */
export function registrationLabel(spec: RegistrationSpec): string {
  const q = quoteRegistration(spec);
  if ("error" in q) return `월 단위 등록 ${spec.months.length}개월`;
  const ranges = q.periods.map((p) => `${dot(p.start)} – ${dot(p.end)}`).join(", ");
  return `월 단위 등록 ${q.months.length}개월 (${ranges})`;
}

/** Whole-month "YYYY-MM" range [from, to] inclusive. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export const formatWonPlain = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
