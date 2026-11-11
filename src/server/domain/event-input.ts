import { DAY_MS, formatTime, parseMoment, toDateKey } from "@/lib/dates";
import { safeUrl } from "@/lib/normalize";
import { cellText, type Row } from "../store/schema";

/**
 * The admin event form ↔ the Events sheet row. Pure, so it is unit-tested.
 * Values use the same formats the sheet feed already understands (see
 * normalizeEvent): "2026-11-21" for a whole day, "2026-11-21T16:00:00+09:00"
 * for a time, both read as Seoul time.
 */

export const EVENT_STATUSES = ["draft", "published", "closed", "canceled"] as const;
export const EVENT_VISIBILITIES = ["public", "private"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

/** Columns an operator edits; event_id and updated_at are managed by the site. */
export const EVENT_FIELDS = [
  "title",
  "short_title",
  "description",
  "category",
  "start_at",
  "end_at",
  "registration_open",
  "registration_close",
  "capacity",
  "public_fee",
  "registration_url",
  "host",
  "audience",
  "location",
  "notes",
  "visibility",
  "status",
] as const;
export type EventField = (typeof EVENT_FIELDS)[number];
export type EventInput = Record<EventField, string | number>;

/**
 * An event made from a proposal takes an id derived from it ("PR-…" → "EV-PR-…"),
 * so the proposal list can link to it and the same proposal can't become two events.
 */
export function eventIdForProposal(proposalId: string): string {
  return `EV-${proposalId}`;
}

/**
 * A proposal → starting values for the new-event form. The operator reviews
 * them before saving: "희망 날짜" is free text ("12/13(토) 저녁"), so the date is
 * only filled in when it is a plain date, and the fee is left for the crew to set.
 */
export function eventDraftFromProposal(p: Row): Row {
  const t = (k: string) => cellText(p[k]).trim();
  const date = parseMoment(t("preferred_date"));
  return {
    title: t("event_title").slice(0, 80),
    description: t("description").slice(0, 2000),
    host: (t("proposer") ? `멤버 제안 · ${t("proposer")}` : "멤버 제안").slice(0, 60),
    audience: t("audience").slice(0, 80),
    start_at: date ? (date.dateOnly ? toDateKey(date.ms) : t("preferred_date")) : "",
  };
}

/** Shown on the public calendar: public and not a draft. */
export function isPublicEvent(visibility: string, status: string): boolean {
  return visibility === "public" && status !== "draft" && (EVENT_STATUSES as readonly string[]).includes(status);
}

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && parseMoment(v) !== null;
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** "2026-11-21" + "16:00" → "2026-11-21T16:00:00+09:00"; without a time → "2026-11-21". */
export function joinMoment(date: string, time: string): string {
  if (!date) return "";
  return time ? `${date}T${time}:00+09:00` : date;
}

/** A sheet value → the form's date and time inputs (Seoul). Unreadable values come back empty. */
export function splitMoment(value: unknown): { date: string; time: string } {
  const m = parseMoment(typeof value === "number" ? String(value) : value);
  if (!m) return { date: "", time: "" };
  return { date: toDateKey(m.ms), time: m.dateOnly ? "" : formatTime(m.ms) };
}

/** When a moment ends: a date-only value covers that whole day. */
function endMs(value: string): number {
  const m = parseMoment(value)!;
  return m.ms + (m.dateOnly ? DAY_MS : 0);
}

export type EventParse = { ok: true; input: EventInput } | { ok: false; message: string };

/** Reads the admin event form (`get` returns a trimmed field value, "" when missing). */
export function parseEventForm(get: (name: string) => string): EventParse {
  const fail = (message: string): EventParse => ({ ok: false, message });

  const title = get("title");
  if (!title) return fail("제목을 적어 주세요.");
  if (title.length > 80) return fail("제목은 80자까지 적을 수 있어요.");

  const startDate = get("start_date");
  const startTime = get("start_time");
  let endDate = get("end_date");
  const endTime = get("end_time");
  if (!isDay(startDate)) return fail("시작 날짜를 골라 주세요.");
  for (const t of [startTime, endTime, get("reg_open_time"), get("reg_close_time")]) {
    if (t && !isTime(t)) return fail("시간 형식을 확인해 주세요. (예: 16:00)");
  }
  if (endTime && !endDate) endDate = startDate;
  if (endDate && !isDay(endDate)) return fail("끝나는 날짜를 확인해 주세요.");
  // A date-only end on the start day says nothing more ("until the end of that day"): leave it out.
  if (endDate === startDate && !endTime) endDate = "";

  const start = joinMoment(startDate, startTime);
  const end = joinMoment(endDate, endTime);
  if (end && endMs(end) <= parseMoment(start)!.ms) return fail("끝나는 시간은 시작보다 뒤여야 해요.");

  const regOpenDate = get("reg_open_date");
  const regCloseDate = get("reg_close_date");
  if ((regOpenDate && !isDay(regOpenDate)) || (regCloseDate && !isDay(regCloseDate))) return fail("신청 기간 날짜를 확인해 주세요.");
  if ((get("reg_open_time") && !regOpenDate) || (get("reg_close_time") && !regCloseDate)) return fail("신청 기간은 날짜도 함께 골라 주세요.");
  const regOpen = joinMoment(regOpenDate, get("reg_open_time"));
  const regClose = joinMoment(regCloseDate, get("reg_close_time"));
  if (regOpen && regClose && endMs(regClose) <= parseMoment(regOpen)!.ms) return fail("신청 마감은 신청 시작보다 뒤여야 해요.");

  const capacityText = get("capacity").replace(/[,\s명]/g, "");
  const capacity = capacityText ? Number(capacityText) : "";
  if (capacity !== "" && (!Number.isInteger(capacity) || capacity <= 0 || capacity > 10_000)) return fail("정원은 1 이상의 숫자로 적어 주세요.");

  // "10000" / "10,000" → 10000 (shown as 10,000원), "0" → 0 (shown as 무료); other text is kept as typed.
  const feeText = get("public_fee");
  if (feeText.length > 40) return fail("참가비는 40자까지 적을 수 있어요.");
  const publicFee = /^\d[\d,]*$/.test(feeText) ? Number(feeText.replace(/,/g, "")) : feeText;

  const urlText = get("registration_url");
  const registrationUrl = urlText ? safeUrl(urlText) : "";
  if (registrationUrl === null || registrationUrl.length > 500) return fail("신청 링크는 https:// 로 시작하는 주소로 적어 주세요.");

  const visibility = (EVENT_VISIBILITIES as readonly string[]).includes(get("visibility")) ? get("visibility") : "private";
  const status = (EVENT_STATUSES as readonly string[]).includes(get("status")) ? get("status") : "draft";

  return {
    ok: true,
    input: {
      title,
      short_title: get("short_title").slice(0, 20),
      description: get("description").slice(0, 2000),
      category: get("category").slice(0, 30),
      start_at: start,
      end_at: end,
      registration_open: regOpen,
      registration_close: regClose,
      capacity,
      public_fee: publicFee,
      registration_url: registrationUrl,
      host: get("host").slice(0, 60),
      audience: get("audience").slice(0, 80),
      location: get("location").slice(0, 120),
      notes: get("notes").slice(0, 500),
      visibility,
      status,
    },
  };
}
