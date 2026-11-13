import { cellText, type Row } from "./schema";

/**
 * The public schedule, exactly what the old Apps Script GET sent: nothing private
 * ever leaves through it. Shared by the database store and tests.
 */
export const PUBLIC_EVENT_FIELDS = [
  "event_id",
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
const PUBLIC_EVENT_STATUSES = ["published", "closed", "canceled"];
export const PUBLIC_ENROLLMENT_FIELDS = ["enrollment_id", "title", "start_date", "end_date", "description", "application_url", "status"] as const;
const PUBLIC_ENROLLMENT_STATUSES = ["published", "closed"];

const lower = (v: unknown) => cellText(v as string).trim().toLowerCase();

function pick(row: Row, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (row[f] !== undefined && row[f] !== "") out[f] = row[f];
  return out;
}

export function publicFeed(events: Row[], enrollments: Row[]) {
  return {
    ok: true,
    events: events
      .filter((r) => lower(r.visibility) === "public" && PUBLIC_EVENT_STATUSES.includes(lower(r.status)) && r.event_id !== "" && r.title !== "" && r.start_at !== "")
      .map((r) => pick(r, PUBLIC_EVENT_FIELDS)),
    enrollments: enrollments
      .filter((r) => PUBLIC_ENROLLMENT_STATUSES.includes(lower(r.status)) && r.enrollment_id !== "" && r.title !== "" && r.start_date !== "")
      .map((r) => pick(r, PUBLIC_ENROLLMENT_FIELDS)),
  };
}
