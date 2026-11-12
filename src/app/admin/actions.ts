"use server";

import { refresh, updateTag } from "next/cache";
import { after } from "next/server";
import { toDateKey } from "@/lib/dates";
import { monthBounds } from "@/lib/membership";
import { deliverDue } from "@/server/notify";
import { operatorForAction } from "@/server/auth/viewer";
import { matchDeposits, parseBankFile, type DepositMatch } from "@/server/domain/bank";
import { parsePrivate, type Membership, type Role } from "@/server/domain/model";
import { CLUB_FEED_TAG } from "@/lib/club-data";
import { AUTO_INCOME_CATEGORIES, kindOf, METHODS } from "@/lib/ledger";
import { isPublicEvent, parseEventForm } from "@/server/domain/event-input";
import { planStampAward } from "@/server/domain/stamps";
import {
  EVENT_CHANGED,
  NEEDS,
  planApproval,
  planCancelApproval,
  planEventCreate,
  planEventEdit,
  planLedgerAdd,
  planLedgerEdit,
  planLedgerVoid,
  planMemberEdit,
  planMembershipEdit,
  planProposalReview,
  planRefund,
  planRejection,
  type LedgerInput,
} from "@/server/domain/operations";
import { PRIVATE_TAG, readTables, runCommit } from "@/server/store";

export interface AdminState {
  status: "idle" | "success" | "error";
  message?: string;
}

const DENIED: AdminState = { status: "error", message: "운영진만 할 수 있어요." };
const field = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function done(message: string): AdminState {
  updateTag(PRIVATE_TAG);
  refresh();
  return { status: "success", message };
}

/** Push the member's notification right after the response instead of waiting for the scheduler. */
function sendSoon() {
  after(() => deliverDue(Date.now()).catch((e) => console.error("[notify] immediate delivery failed", e)));
}

export async function approvePayment(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  // The start is chosen by month (memberships always run from the 1st to the last day of a month).
  const startMonth = field(fd, "start_month");
  const startOverride = startMonth ? monthBounds(startMonth)?.start : null;
  const depositedAt = field(fd, "deposited_at");
  if ((startMonth && !startOverride) || (depositedAt && !isDay(depositedAt))) {
    return { status: "error", message: "날짜 형식을 확인해 주세요." };
  }
  const outcome = await runCommit<{ startDate: string; endDate: string }>(NEEDS.approval, (data) =>
    planApproval(data, {
      now: Date.now(),
      actorId: op.member.id,
      paymentId: field(fd, "payment_id"),
      startOverride: startOverride || null,
      depositedAt: depositedAt || null,
      bankTransactionId: field(fd, "bank_transaction_id") || null,
    }),
  );
  if (!outcome.ok) return { status: "error", message: outcome.message };
  const r = outcome.result;
  sendSoon();
  return done(outcome.duplicate ? "이미 반영된 승인이에요." : `승인했어요. ${r ? `${r.startDate} – ${r.endDate}` : ""}`);
}

export async function rejectPayment(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const reason = field(fd, "reason");
  const outcome = await runCommit(NEEDS.payments, (data) =>
    planRejection(data, { now: Date.now(), actorId: op.member.id, paymentId: field(fd, "payment_id"), reason }),
  );
  if (!outcome.ok) return { status: "error", message: outcome.message };
  sendSoon();
  return done("반려했어요.");
}

export async function cancelApproval(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const reason = field(fd, "reason");
  if (!reason) return { status: "error", message: "취소 사유를 적어 주세요." };
  const outcome = await runCommit(NEEDS.payments, (data) =>
    planCancelApproval(data, { now: Date.now(), actorId: op.member.id, paymentId: field(fd, "payment_id"), reason }),
  );
  return outcome.ok ? done("승인을 취소했어요. 입금은 다시 확인 대기 상태예요.") : { status: "error", message: outcome.message };
}

export async function refundPayment(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const reason = field(fd, "reason");
  if (!reason) return { status: "error", message: "환불 사유를 적어 주세요." };
  const outcome = await runCommit(NEEDS.payments, (data) =>
    planRefund(data, { now: Date.now(), actorId: op.member.id, paymentId: field(fd, "payment_id"), reason }),
  );
  return outcome.ok ? done("환불 처리했어요.") : { status: "error", message: outcome.message };
}

export async function editMembership(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const startMonth = field(fd, "start_month");
  const endMonth = field(fd, "end_month");
  const status = field(fd, "status") as Membership["status"];
  if (!monthBounds(startMonth) || !monthBounds(endMonth)) return { status: "error", message: "시작 월과 종료 월을 골라 주세요." };
  if (!["active", "canceled", "refunded"].includes(status)) return { status: "error", message: "상태를 골라 주세요." };
  const outcome = await runCommit(NEEDS.membership, (data) =>
    planMembershipEdit(data, {
      now: Date.now(),
      actorId: op.member.id,
      membershipId: field(fd, "membership_id"),
      startMonth,
      endMonth,
      status,
      reason: field(fd, "reason"),
    }),
  );
  return outcome.ok ? done("회원권을 수정했어요.") : { status: "error", message: outcome.message };
}

export async function editMember(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const role = field(fd, "role") as Role;
  const status = field(fd, "status");
  if (role && !["member", "operator", "admin"].includes(role)) return { status: "error", message: "권한 값을 확인해 주세요." };
  if (status && !["applicant", "active", "inactive"].includes(status)) return { status: "error", message: "상태 값을 확인해 주세요." };
  const outcome = await runCommit(NEEDS.member, (data) =>
    planMemberEdit(data, {
      now: Date.now(),
      actorId: op.member.id,
      actorRole: op.member.role,
      memberId: field(fd, "member_id"),
      set: {
        name: field(fd, "name") || undefined,
        depositor_name: field(fd, "depositor_name") || undefined,
        status: status || undefined,
        memo: fd.has("memo") ? field(fd, "memo") : undefined,
        role: role || undefined,
      },
    }),
  );
  return outcome.ok ? done("회원 정보를 저장했어요.") : { status: "error", message: outcome.message };
}

/** MOON STAMPS: an operator records a stamp after checking the moment themselves (no automatic checks). */
export async function awardStamp(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const awardedAt = field(fd, "awarded_at");
  if (!isDay(awardedAt)) return { status: "error", message: "발급일을 골라 주세요." };
  const outcome = await runCommit(NEEDS.stamps, (data) =>
    planStampAward(data, {
      now: Date.now(),
      actorId: op.member.id,
      memberId: field(fd, "member_id"),
      stampId: field(fd, "stamp_id"),
      awardedAt,
      note: field(fd, "note"),
    }),
  );
  if (!outcome.ok) return { status: "error", message: outcome.message };
  return done(outcome.duplicate ? "이미 반영된 발급이에요." : "스탬프를 발급했어요. 회원의 MY 화면에 바로 보여요.");
}

export async function reviewProposal(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const status = field(fd, "review_status");
  if (!["new", "reviewing", "accepted", "declined"].includes(status)) return { status: "error", message: "상태를 골라 주세요." };
  const outcome = await runCommit(NEEDS.proposals, (data) =>
    planProposalReview(data, {
      now: Date.now(),
      actorId: op.member.id,
      proposalId: field(fd, "proposal_id"),
      status,
      notes: field(fd, "review_notes").slice(0, 1000),
    }),
  );
  return outcome.ok ? done("저장했어요.") : { status: "error", message: outcome.message };
}

// ---------------------------------------------------------------------------
// Club money (Ledger)
// ---------------------------------------------------------------------------

const MAX_AMOUNT = 1_000_000_000;

function parseLedgerInput(fd: FormData): { ok: true; input: LedgerInput } | { ok: false; message: string } {
  const date = field(fd, "date");
  const category = field(fd, "category");
  const description = field(fd, "description").slice(0, 200);
  const amount = Number(field(fd, "amount").replace(/[,\s원]/g, ""));
  const receiptUrl = field(fd, "receipt_url");
  if (!isDay(date)) return { ok: false, message: "날짜를 확인해 주세요." };
  if (!kindOf(category) || (AUTO_INCOME_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, message: "항목을 골라 주세요." };
  }
  if (!description) return { ok: false, message: "내용을 적어 주세요." };
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return { ok: false, message: "금액은 1원 이상의 숫자로 적어 주세요." };
  if (receiptUrl && !/^https:\/\//i.test(receiptUrl)) return { ok: false, message: "영수증 링크는 https:// 로 시작해야 해요." };
  return {
    ok: true,
    input: {
      date,
      category,
      description,
      amount,
      person: field(fd, "person").slice(0, 40),
      method: (METHODS as readonly string[]).includes(field(fd, "method")) ? field(fd, "method") : "모임통장",
      receiptUrl: receiptUrl.slice(0, 500),
      memo: field(fd, "memo").slice(0, 300),
    },
  };
}

export async function addLedgerEntry(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const parsed = parseLedgerInput(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message };
  const outcome = await runCommit(NEEDS.ledger, (data) => planLedgerAdd(data, { now: Date.now(), actorId: op.member.id, input: parsed.input }));
  if (!outcome.ok) return { status: "error", message: outcome.message };
  const sign = kindOf(parsed.input.category) === "income" ? "+" : "−";
  return done(`기록했어요. ${parsed.input.description} ${sign}${parsed.input.amount.toLocaleString("ko-KR")}원`);
}

export async function editLedgerEntry(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const parsed = parseLedgerInput(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message };
  const outcome = await runCommit(NEEDS.ledger, (data) =>
    planLedgerEdit(data, {
      now: Date.now(),
      actorId: op.member.id,
      entryId: field(fd, "entry_id"),
      input: parsed.input,
      reason: field(fd, "reason"),
    }),
  );
  return outcome.ok ? done("장부를 고쳤어요.") : { status: "error", message: outcome.message };
}

export async function voidLedgerEntry(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const outcome = await runCommit(NEEDS.ledger, (data) =>
    planLedgerVoid(data, { now: Date.now(), actorId: op.member.id, entryId: field(fd, "entry_id"), reason: field(fd, "reason") }),
  );
  return outcome.ok ? done("무효 처리했어요. 기록은 시트와 변경 이력에 남아요.") : { status: "error", message: outcome.message };
}

// ---------------------------------------------------------------------------
// Events (calendar)
// ---------------------------------------------------------------------------

/** Also clears the public schedule cache so the calendar shows the change right away. */
function eventDone(message: string): AdminState {
  updateTag(CLUB_FEED_TAG);
  return done(message);
}

export async function createEvent(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const parsed = parseEventForm((name) => field(fd, name));
  if (!parsed.ok) return { status: "error", message: parsed.message };
  // Set when the form was opened from an accepted proposal (ADMIN → 제안 → 이벤트로 옮기기).
  const fromProposal = field(fd, "proposal_id") || undefined;
  const outcome = await runCommit(fromProposal ? NEEDS.eventFromProposal : NEEDS.events, (data) =>
    planEventCreate(data, { now: Date.now(), actorId: op.member.id, input: parsed.input, fromProposal }),
  );
  if (!outcome.ok) return { status: "error", message: outcome.message };
  const shown = isPublicEvent(String(parsed.input.visibility), String(parsed.input.status));
  const what = fromProposal ? "제안을 이벤트로 옮겼어요." : "등록했어요.";
  return eventDone(shown ? `${what} 사이트 캘린더에 보여요: ${parsed.input.title}` : `${what} 아직 사이트에는 보이지 않아요: ${parsed.input.title}`);
}

export async function editEvent(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const parsed = parseEventForm((name) => field(fd, name));
  if (!parsed.ok) return { status: "error", message: parsed.message };
  const outcome = await runCommit(NEEDS.events, (data) =>
    planEventEdit(data, { now: Date.now(), actorId: op.member.id, eventId: field(fd, "event_id"), base: field(fd, "base"), input: parsed.input }),
  );
  if (!outcome.ok) {
    // The form was based on an older version: drop the cached view so the page reloads the latest.
    if (outcome.message === EVENT_CHANGED) {
      updateTag(PRIVATE_TAG);
      refresh();
    }
    return { status: "error", message: outcome.message };
  }
  return eventDone("이벤트를 고쳤어요.");
}

export interface BankState {
  status: "idle" | "success" | "error";
  message?: string;
  matches?: DepositMatch[];
  fileName?: string;
}

const MAX_BANK_FILE = 4 * 1024 * 1024;

/**
 * Reads an uploaded KakaoBank statement in memory and proposes matches.
 * The file itself is never stored; only approvals the operator confirms are
 * written (with the transaction key, which blocks re-applying it later).
 */
export async function analyzeBankFile(_prev: BankState, fd: FormData): Promise<BankState> {
  const op = await operatorForAction();
  if (!op) return { status: "error", message: DENIED.message };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "거래내역 파일을 골라 주세요." };
  if (file.size > MAX_BANK_FILE) return { status: "error", message: "파일이 너무 커요. (최대 4MB)" };

  try {
    const deposits = parseBankFile(new Uint8Array(await file.arrayBuffer()));
    if (deposits.length === 0) return { status: "error", message: "입금 거래를 찾지 못했어요. 파일 형식을 확인해 주세요." };
    const club = parsePrivate(await readTables(NEEDS.approval, { fresh: true }));
    const matches = matchDeposits(deposits, club, toDateKey(Date.now()));
    return { status: "success", matches, fileName: file.name };
  } catch (error) {
    console.error("[bank] could not parse statement:", error);
    return {
      status: "error",
      message: error instanceof Error && error.message.startsWith("BANK:") ? error.message.slice(5) : "파일을 읽지 못했어요.",
    };
  }
}
