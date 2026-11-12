import { CONSENT_DEFAULTS, consentUrl, type ConsentLinks } from "@/lib/consent";
import { parseMoment, toDateKey } from "@/lib/dates";
import { kindOf, type MoneyEntry } from "@/lib/ledger";
import type { MembershipPeriod, MembershipRecordStatus } from "@/lib/membership";
import { cellText, type Cell, type Row, type Tables } from "../store/schema";

/** Typed views over sheet rows. Every parser tolerates hand-edited cells. */

export type Role = "member" | "operator" | "admin";
export type MemberStatus = "applicant" | "active" | "inactive";
export type PaymentStatus = "pending" | "matched" | "approved" | "rejected" | "refunded";

export interface Member {
  id: string;
  name: string;
  email: string;
  depositorName: string;
  role: Role;
  status: MemberStatus;
  appliedAt: string;
  joinedAt: string;
  /** When the member confirmed submitting the 회원 등록 동의서 ("" = not yet). */
  consentAt: string;
  memo: string;
  raw: Row;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  /** Price for a person's very first membership; 0 = same as `price`. */
  firstPrice: number;
  durationMonths: number;
  bonusMonths: number;
  active: boolean;
  sortOrder: number;
  description: string;
}

export interface Payment {
  id: string;
  memberId: string;
  depositorName: string;
  /** Amount expected for this membership. */
  amount: number;
  /**
   * Charged at the plan's first-membership price. Derived (amount = Plans.first_price),
   * not stored, so the sheet needs no extra Payments column. Display only.
   */
  firstJoin: boolean;
  planId: string;
  status: PaymentStatus;
  requestedAt: string;
  requestedStart: string;
  depositedAt: string;
  bankTransactionId: string;
  approvedBy: string;
  approvedAt: string;
  note: string;
  raw: Row;
}

export interface Membership extends MembershipPeriod {
  memberId: string;
  planId: string;
  sourcePaymentId: string;
  createdAt: string;
  updatedAt: string;
  note: string;
  raw: Row;
}

/**
 * pending → sending (claimed by one delivery run) → sent (pushed) | inapp (list only: no device / push off)
 *                                                  → failed (retried, max 3) → dead
 */
export type NotificationStatus = "pending" | "sending" | "sent" | "inapp" | "failed" | "dead";

export interface AppNotification {
  id: string;
  memberId: string;
  type: string;
  title: string;
  body: string;
  url: string;
  scheduledAt: string;
  sentAt: string;
  status: NotificationStatus;
  attempts: number;
  lastError: string;
  dedupKey: string;
  createdAt: string;
  readAt: string;
  raw: Row;
}

export interface PushSubscriptionRecord {
  id: string;
  memberId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
  status: "active" | "revoked" | "expired";
  failureCount: number;
  raw: Row;
}

export interface NotificationPrefs {
  memberId: string;
  membership: boolean;
  events: boolean;
  operator: boolean;
  exists: boolean;
}

export interface ClubSettings {
  /**
   * Shown to a member after applying. The site never shows an account number or
   * an amount to members: fees are announced in the crew chat / consent form.
   */
  applyNotice: string;
  sheetUrl: string;
  consent: ConsentLinks;
  /** AFTER HOURS RADIO player (Settings radio_player): off until the crew has checked music rights. */
  radioPlayer: boolean;
}

export const DEFAULT_APPLY_NOTICE =
  "회비와 납부 방법은 회원 등록 동의서와 크루 단톡방 안내를 확인해 주세요. 운영진이 확인하면 회원권이 시작되고 알림을 보내드려요.";

const text = (v: Cell | undefined) => cellText(v).trim();

function num(v: Cell | undefined): number {
  if (typeof v === "number") return v;
  const n = Number(text(v).replace(/[,\s원]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function bool(v: Cell | undefined, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  const s = text(v).toLowerCase();
  if (!s) return fallback;
  return ["true", "1", "y", "yes", "o", "on", "예", "사용"].includes(s);
}

/** Sheet date cell (date-only or datetime, any common format) → Seoul day key. */
export function dayKey(v: Cell | undefined): string {
  const parsed = parseMoment(text(v));
  return parsed ? toDateKey(parsed.ms) : "";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function oneOf<T extends string>(v: Cell | undefined, allowed: readonly T[], fallback: T): T {
  const s = text(v).toLowerCase() as T;
  return allowed.includes(s) ? s : fallback;
}

export function toMember(r: Row): Member {
  return {
    id: text(r.member_id),
    name: text(r.name),
    email: normalizeEmail(text(r.email)),
    depositorName: text(r.depositor_name),
    role: oneOf(r.role, ["member", "operator", "admin"] as const, "member"),
    status: oneOf(r.status, ["applicant", "active", "inactive"] as const, "applicant"),
    appliedAt: text(r.applied_at),
    joinedAt: dayKey(r.joined_at),
    consentAt: text(r.member_consent_at),
    memo: text(r.memo),
    raw: r,
  };
}

export function toPlan(r: Row): Plan {
  return {
    id: text(r.plan_id),
    name: text(r.name),
    price: num(r.price),
    firstPrice: Math.max(0, num(r.first_price)),
    durationMonths: Math.max(0, Math.round(num(r.duration_months))),
    bonusMonths: Math.max(0, Math.round(num(r.bonus_months))),
    active: bool(r.active, true),
    sortOrder: num(r.sort_order),
    description: text(r.description),
  };
}

export function toPayment(r: Row): Payment {
  return {
    id: text(r.payment_id),
    memberId: text(r.member_id),
    depositorName: text(r.depositor_name),
    amount: num(r.amount),
    firstJoin: false, // filled in by parsePrivate, which knows the plans
    planId: text(r.plan_id),
    status: oneOf(r.status, ["pending", "matched", "approved", "rejected", "refunded"] as const, "pending"),
    requestedAt: text(r.requested_at),
    requestedStart: dayKey(r.requested_start),
    depositedAt: dayKey(r.deposited_at),
    bankTransactionId: text(r.bank_transaction_id),
    approvedBy: text(r.approved_by),
    approvedAt: text(r.approved_at),
    note: text(r.note),
    raw: r,
  };
}

export function toMembership(r: Row): Membership {
  return {
    id: text(r.membership_id),
    memberId: text(r.member_id),
    planId: text(r.plan_id),
    startDate: dayKey(r.start_date),
    endDate: dayKey(r.end_date),
    status: oneOf<MembershipRecordStatus>(r.status, ["active", "canceled", "refunded"], "active"),
    sourcePaymentId: text(r.source_payment_id),
    createdAt: text(r.created_at),
    updatedAt: text(r.updated_at),
    note: text(r.note),
    raw: r,
  };
}

export function toNotification(r: Row): AppNotification {
  return {
    id: text(r.notification_id),
    memberId: text(r.member_id),
    type: text(r.type),
    title: text(r.title),
    body: text(r.body),
    url: text(r.url),
    scheduledAt: text(r.scheduled_at),
    sentAt: text(r.sent_at),
    status: oneOf(r.status, ["pending", "sending", "sent", "inapp", "failed", "dead"] as const, "pending"),
    attempts: num(r.attempts),
    lastError: text(r.last_error),
    dedupKey: text(r.deduplication_key),
    createdAt: text(r.created_at),
    readAt: text(r.read_at),
    raw: r,
  };
}

export function toSubscription(r: Row): PushSubscriptionRecord {
  return {
    id: text(r.subscription_id),
    memberId: text(r.member_id),
    endpoint: text(r.endpoint),
    p256dh: text(r.p256dh),
    auth: text(r.auth),
    userAgent: text(r.user_agent),
    status: oneOf(r.status, ["active", "revoked", "expired"] as const, "active"),
    failureCount: num(r.failure_count),
    raw: r,
  };
}

/** A Ledger row as a money entry; rows with an unknown category or no amount are skipped. */
export function toLedgerEntry(r: Row): MoneyEntry | null {
  const category = text(r.category);
  const kind = kindOf(category);
  const amount = Math.abs(num(r.amount));
  const date = dayKey(r.date);
  if (!text(r.entry_id) || !kind || !amount || !date) return null;
  return {
    id: text(r.entry_id),
    date,
    kind,
    category,
    description: text(r.description),
    amount,
    person: text(r.person),
    method: text(r.method),
    receiptUrl: text(r.receipt_url),
    memo: text(r.memo),
    source: "ledger",
    voided: text(r.status).toLowerCase() === "void",
  };
}

export function prefsFor(rows: Row[] | undefined, memberId: string): NotificationPrefs {
  const r = (rows ?? []).find((row) => text(row.member_id) === memberId);
  return {
    memberId,
    membership: bool(r?.membership, true),
    events: bool(r?.events, true),
    operator: bool(r?.operator, true),
    exists: Boolean(r),
  };
}

export function toSettings(rows: Row[] | undefined): ClubSettings {
  const map = new Map((rows ?? []).map((r) => [text(r.key), text(r.value)]));
  return {
    applyNotice: map.get("apply_notice") || DEFAULT_APPLY_NOTICE,
    sheetUrl: map.get("sheet_url") || "",
    consent: {
      daily: consentUrl(map.get("consent_daily_url"), CONSENT_DEFAULTS.daily),
      member: consentUrl(map.get("consent_member_url"), CONSENT_DEFAULTS.member),
    },
    radioPlayer: ["on", "true", "yes", "1", "켜기"].includes((map.get("radio_player") ?? "").trim().toLowerCase()),
  };
}

/**
 * True until the person has ever been a member: no join date, no approved
 * payment and no valid membership. Members registered before the site only
 * need a joined_at in the sheet to never get the first-membership price.
 */
/**
 * What a membership costs. Someone's first membership uses the plan's
 * first_price when it has one (e.g. 1개월: first time 100,000, after that 80,000).
 */
export function priceFor(plan: Pick<Plan, "price" | "firstPrice">, firstJoin: boolean): { amount: number; firstPriceApplied: boolean } {
  if (firstJoin && plan.firstPrice > 0) return { amount: plan.firstPrice, firstPriceApplied: true };
  return { amount: plan.price, firstPriceApplied: false };
}

export function isFirstJoin(club: Pick<ClubPrivate, "payments" | "memberships">, member: Member | null | undefined): boolean {
  if (!member) return true;
  if (member.joinedAt) return false;
  if (club.payments.some((p) => p.memberId === member.id && p.status === "approved")) return false;
  return !club.memberships.some((m) => m.memberId === member.id && m.status === "active");
}

/** Everything the member area and admin need, parsed once. */
export interface ClubPrivate {
  members: Member[];
  plans: Plan[];
  payments: Payment[];
  memberships: Membership[];
  notifications: AppNotification[];
  subscriptions: PushSubscriptionRecord[];
  prefRows: Row[];
  settings: ClubSettings;
}

export function parsePrivate(tables: Tables): ClubPrivate {
  const plans = (tables.Plans ?? [])
    .map(toPlan)
    .filter((p) => p.id && p.durationMonths + p.bonusMonths > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price);
  const firstPrice = new Map(plans.filter((p) => p.firstPrice > 0 && p.firstPrice !== p.price).map((p) => [p.id, p.firstPrice]));
  return {
    members: (tables.Members ?? []).map(toMember).filter((m) => m.id),
    plans,
    payments: (tables.Payments ?? [])
      .map(toPayment)
      .filter((p) => p.id)
      .map((p) => ({ ...p, firstJoin: firstPrice.get(p.planId) === p.amount })),
    memberships: (tables.Memberships ?? []).map(toMembership).filter((m) => m.id && m.startDate && m.endDate),
    notifications: (tables.Notifications ?? []).map(toNotification).filter((n) => n.id),
    subscriptions: (tables.PushSubscriptions ?? []).map(toSubscription).filter((s) => s.id && s.endpoint),
    prefRows: tables.NotificationPrefs ?? [],
    settings: toSettings(tables.Settings),
  };
}

export function formatWon(n: number): string {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}
