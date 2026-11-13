/**
 * Google Sheets layout: one spreadsheet, one tab per table, header row first.
 * apps-script/Code.gs mirrors these names (setupSheets creates the tabs).
 * The first column is the table's id column.
 */
export const TABLES = {
  Members: [
    "member_id",
    "name",
    "email",
    "depositor_name",
    "role",
    "status",
    "applied_at",
    "joined_at",
    "member_consent_at",
    "memo",
  ],
  /** first_price: price for someone's very first membership (empty = same as price). */
  Plans: ["plan_id", "name", "price", "first_price", "duration_months", "bonus_months", "active", "sort_order", "description"],
  Payments: [
    "payment_id",
    "member_id",
    "depositor_name",
    "amount",
    "plan_id",
    "status",
    "requested_at",
    "requested_start",
    "deposited_at",
    "bank_transaction_id",
    "approved_by",
    "approved_at",
    "note",
    /** MEMBERSHIP REGISTRATION (admin, v1.6): {"months":[…],"start":"YYYY-MM-DD","fee":n}; empty for ordinary applications. */
    "registration",
  ],
  Memberships: [
    "membership_id",
    "member_id",
    "plan_id",
    "start_date",
    "end_date",
    "status",
    "source_payment_id",
    "created_at",
    "updated_at",
    "note",
  ],
  Notifications: [
    "notification_id",
    "member_id",
    "type",
    "title",
    "body",
    "url",
    "scheduled_at",
    "sent_at",
    "status",
    "attempts",
    "last_error",
    "deduplication_key",
    "created_at",
    "read_at",
  ],
  PushSubscriptions: [
    "subscription_id",
    "member_id",
    "endpoint",
    "p256dh",
    "auth",
    "user_agent",
    "status",
    "created_at",
    "last_success_at",
    "failure_count",
  ],
  NotificationPrefs: ["member_id", "membership", "events", "operator", "updated_at"],
  EventWatch: ["event_id", "fingerprint", "status", "first_seen_at", "updated_at"],
  /** Club money: everything except membership deposits (those come from Payments). */
  Ledger: [
    "entry_id",
    "date",
    "category",
    "description",
    "amount",
    "person",
    "method",
    "receipt_url",
    "memo",
    "status",
    "created_by",
    "created_at",
    "updated_at",
  ],
  /** MOON STAMPS: the six stamps (artwork is static; see src/lib/stamps.ts). */
  StampDefinitions: ["stamp_id", "name", "description", "image_key", "active"],
  /** Who received which stamp. Private: only the member themself and operators see it; `note` is operators-only. */
  StampAwards: ["award_id", "member_id", "stamp_id", "awarded_at", "awarded_by", "note"],
  /** AFTER HOURS RADIO. Never deleted: admins mark a track `deleted` (soft delete). */
  RadioTracks: [
    "track_id",
    "title",
    "artist",
    "youtube_url",
    "youtube_video_id",
    "requested_by",
    "display_name",
    "message",
    "source",
    "sort_order",
    "created_at",
    "status",
    "deleted_at",
    "deleted_by",
  ],
  AuditLog: ["log_id", "commit_id", "actor_id", "action", "target_id", "before_value", "after_value", "created_at"],
  Settings: ["key", "value", "description"],
  // v0.1 tables (read by the public feed / written by the proposal form)
  /** Member enrollment periods shown as bars on the calendar. */
  Enrollment: ["enrollment_id", "title", "start_date", "end_date", "description", "application_url", "status"],
  Events: [
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
    "updated_at",
  ],
  Proposals: [
    "proposal_id",
    "submitted_at",
    "proposer",
    "contact",
    "event_title",
    "description",
    "experience",
    "preferred_date",
    "date_flexible",
    "estimated_duration",
    "audience",
    "expected_attendance",
    "free_ok",
    "desired_fee",
    "fee_unit",
    "estimated_cost",
    "requirements",
    "staff_support",
    "other_requests",
    "review_status",
    "review_notes",
  ],
} as const;

export type TableName = keyof typeof TABLES;
export type Cell = string | number | boolean;
export type Row = Record<string, Cell>;
export type Tables = Partial<Record<TableName, Row[]>>;

export function idColumn(table: TableName): string {
  return TABLES[table][0];
}

// ---------------------------------------------------------------------------
// Postgres (Neon) layout: one table per tab, the same columns, every value as text,
// plus `_seq` for row order (like rows in a sheet). Kept import-free so the
// scripts in scripts/db can load this file directly with Node.
// ---------------------------------------------------------------------------

/** "PushSubscriptions" → "push_subscriptions". */
export function sqlTableName(table: TableName): string {
  return table.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

/** Columns the sheet held as numbers / checkboxes; they come back from the DB with the same types. */
const NUMBER_COLUMNS: Partial<Record<TableName, readonly string[]>> = {
  Plans: ["price", "first_price", "duration_months", "bonus_months", "sort_order"],
  Payments: ["amount"],
  Notifications: ["attempts"],
  PushSubscriptions: ["failure_count"],
  Ledger: ["amount"],
  Events: ["capacity", "public_fee"],
  Proposals: ["desired_fee"],
  RadioTracks: ["sort_order"],
};
const BOOLEAN_COLUMNS: Partial<Record<TableName, readonly string[]>> = {
  Plans: ["active"],
  NotificationPrefs: ["membership", "events", "operator"],
  StampDefinitions: ["active"],
};

export function fromDbValue(table: TableName, column: string, value: string | null | undefined): Cell {
  const s = value ?? "";
  if (NUMBER_COLUMNS[table]?.includes(column) && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (BOOLEAN_COLUMNS[table]?.includes(column) && /^(true|false)$/i.test(s)) return s.toLowerCase() === "true";
  return s;
}

export function toDbValue(value: Cell | null | undefined): string {
  return value === undefined || value === null ? "" : String(value);
}

/** Every value is compared as a string, exactly like Apps Script does. */
export function cellText(v: Cell | undefined | null): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

/** Tables the private member/admin area reads. */
export const PRIVATE_TABLES: TableName[] = [
  "Members",
  "Plans",
  "Payments",
  "Memberships",
  "Notifications",
  "PushSubscriptions",
  "NotificationPrefs",
  "Settings",
];

/**
 * Every table the admin pages show, read in ONE gateway call shared by all admin
 * tabs (see readTables `admin`). Apps Script costs ~1.6 s per call plus ~0.3 s per
 * tab, so one call with only what the screens use beats several smaller ones.
 * The notification tables are left out: no admin screen shows them.
 */
export const ADMIN_TABLES: TableName[] = [
  "Members",
  "Plans",
  "Payments",
  "Memberships",
  "Settings",
  "Proposals",
  "Events",
  "Ledger",
];

/**
 * MOON STAMPS are read on their own (only /me and the admin member page need
 * them), so other screens don't pay for two more tabs, and a sheet that has not
 * been set up for stamps yet can never break them.
 */
export const STAMP_TABLES: TableName[] = ["StampDefinitions", "StampAwards"];

/** AFTER HOURS RADIO page: tracks, who may add/delete, and the player switch — one gateway call. */
export const RADIO_TABLES: TableName[] = ["Members", "Memberships", "Payments", "RadioTracks", "Settings"];
