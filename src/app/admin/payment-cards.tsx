import Link from "next/link";
import { dotDate } from "@/components/membership-card";
import { formatDateTimeKo, parseMoment } from "@/lib/dates";
import { nextMembershipPeriod, totalMonths } from "@/lib/membership";
import { quoteRegistration } from "@/lib/registration";
import { FIRST_START_DAY, FIRST_START_MONTH } from "@/lib/start-months";
import { formatWon, type ClubPrivate, type Payment } from "@/server/domain/model";
import { approvePayment, cancelApproval, refundPayment, rejectPayment } from "./actions";
import { ActionForm } from "./admin-ui";
import { MonthSelect } from "./month-select";
import { RegistrationLines } from "./registration-lines";
import { Pill, smallButton, smallInput, smallPrimary } from "./shared";

const monthLabel = (key: string) => `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월`;

const when = (iso: string) => {
  const m = parseMoment(iso);
  return m ? formatDateTimeKo(m.ms) : iso;
};

/**
 * A deposit waiting for the crew: shows the period that approval will create, then approve or reject.
 * A MEMBERSHIP REGISTRATION charge shows its month-by-month breakdown instead and is confirmed by an admin only.
 */
export function PendingPaymentCard({
  payment,
  club,
  todayKey,
  canConfirmRegistration = false,
}: {
  payment: Payment;
  club: ClubPrivate;
  todayKey: string;
  /** The viewer is an admin (registration charges are confirmed by admins only; the server checks too). */
  canConfirmRegistration?: boolean;
}) {
  const member = club.members.find((m) => m.id === payment.memberId);
  const plan = club.plans.find((p) => p.id === payment.planId);
  const quote = payment.registration ? quoteRegistration(payment.registration) : null;
  const registration = quote && !("error" in quote) ? quote : null;
  if (payment.registration) {
    return (
      <article className="rounded-lg border-2 border-midnight bg-white/60 p-4" data-registration-charge={payment.id}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-brown">Membership registration</p>
            <p className="text-[16px] font-bold text-midnight">
              <Link href={`/admin/members/${encodeURIComponent(payment.memberId)}`} className="underline-offset-4 hover:underline">
                {member?.name ?? payment.memberId}
              </Link>
              <span className="ml-2 text-[13px] font-medium text-ink-soft">입금자명 {payment.depositorName}</span>
            </p>
            <p className="font-mono text-[11px] text-ink-soft">
              {payment.id} · 청구 {when(payment.requestedAt)}
            </p>
          </div>
          <span className="flex flex-wrap items-center gap-1.5">
            <Pill tone={payment.status === "matched" ? "ok" : "warn"}>{payment.status === "matched" ? "거래내역 매칭됨" : "입금 확인 대기"}</Pill>
          </span>
        </div>
        <div className="mt-3">
          {registration ? (
            <RegistrationLines quote={registration} />
          ) : (
            <p className="text-[13px] font-medium text-brown">청구 내용을 읽지 못했어요. 반려하고 다시 만들어 주세요.</p>
          )}
          <p className="mt-2 font-label text-[13px] font-bold tracking-[0.08em] text-midnight">
            AMOUNT TO COLLECT: <span className="font-mono">{payment.amount.toLocaleString("ko-KR")} KRW</span>
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">입금이 확인되기 전에는 회원권이 생기지 않아요. 확정하면 위 기간대로 바로 반영돼요.</p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <ActionForm
            action={approvePayment}
            className="flex flex-wrap items-end gap-2"
            confirmText={`${member?.name ?? ""}님의 입금 ${formatWon(payment.amount)}을 확인했나요? 등록을 확정하면 회원권이 바로 생겨요.`}
          >
            <input type="hidden" name="payment_id" value={payment.id} />
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
              입금일
              <input type="date" name="deposited_at" defaultValue={todayKey} className={smallInput} required />
            </label>
            <button type="submit" className={smallPrimary} disabled={!canConfirmRegistration || !registration}>
              CONFIRM REGISTRATION · 등록 확정
            </button>
            {!canConfirmRegistration && <span className="w-full text-[12px] text-brown">등록 확정은 admin만 할 수 있어요.</span>}
          </ActionForm>
          <ActionForm action={rejectPayment} className="flex items-end gap-2" confirmText="이 청구를 취소(반려)할까요? 기록은 남아요.">
            <input type="hidden" name="payment_id" value={payment.id} />
            <input name="reason" placeholder="취소 사유" maxLength={200} className={`${smallInput} w-36`} />
            <button type="submit" className={smallButton}>
              청구 취소
            </button>
          </ActionForm>
        </div>
      </article>
    );
  }
  const preview = plan
    ? nextMembershipPeriod({
        existing: club.memberships.filter((m) => m.memberId === payment.memberId),
        plan,
        todayKey,
        requestedStart: payment.requestedStart || null,
        earliestStart: FIRST_START_DAY,
      })
    : null;

  return (
    <article className="rounded-lg border-2 border-midnight/25 bg-white/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[16px] font-bold text-midnight">
            <Link href={`/admin/members/${encodeURIComponent(payment.memberId)}`} className="underline-offset-4 hover:underline">
              {member?.name ?? payment.memberId}
            </Link>
            {member?.status === "applicant" && <span className="ml-2 align-middle"><Pill tone="warn">신규</Pill></span>}
          </p>
          <p className="text-[13px] text-ink-soft">
            입금자명 <strong className="text-midnight">{payment.depositorName}</strong> · {plan?.name ?? payment.planId} ·{" "}
            <span className="font-mono font-semibold text-midnight">{formatWon(payment.amount)}</span>
            {payment.firstJoin && <span> (첫 등록 가격)</span>}
          </p>
          <p className="font-mono text-[11px] text-ink-soft">
            {payment.id} · 신청 {when(payment.requestedAt)}
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-1.5">
          {member?.consentAt ? <Pill tone="ok">동의서 ✓</Pill> : <Pill tone="warn">동의서 미확인</Pill>}
          <Pill tone={payment.status === "matched" ? "ok" : "default"}>{payment.status}</Pill>
        </span>
      </div>
      {member?.consentAt ? (
        <p className="mt-1 text-[12px] text-ink-soft">
          회원 등록 동의서 제출 확인 {when(member.consentAt)} · 실제 응답은 Google Forms 응답 탭에서 성함·연락처로 대조할 수 있어요.
        </p>
      ) : (
        <p className="mt-1 text-[12px] font-medium text-brown">회원 등록 동의서 제출이 확인되지 않았어요. 승인 전에 확인해 주세요.</p>
      )}

      {preview && plan && (
        <p className="mt-3 rounded-md bg-butter-200/60 px-3 py-2 text-[13px] text-midnight">
          승인하면 <strong className="font-mono">{dotDate(preview.startDate)} – {dotDate(preview.endDate)}</strong> ({totalMonths(plan)}개월)
          {preview.extendsExisting ? " · 기존 회원권에 이어서 연장" : ""}
          {payment.requestedStart ? ` · 희망 시작 ${monthLabel(payment.requestedStart)}` : ""}
        </p>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
        <ActionForm action={approvePayment} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="payment_id" value={payment.id} />
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
            입금일
            <input type="date" name="deposited_at" defaultValue={todayKey} className={smallInput} required />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
            시작 월 (바꿀 때만)
            <MonthSelect
              name="start_month"
              todayKey={todayKey}
              from={FIRST_START_MONTH}
              emptyLabel={preview ? `자동 (${monthLabel(preview.startDate)})` : "자동"}
              describedBy={`start-${payment.id}`}
            />
          </label>
          <button type="submit" className={smallPrimary}>
            입금 확인 · 승인
          </button>
          <span id={`start-${payment.id}`} className="sr-only">
            회원권은 1일에 시작해 말일에 끝나요. 비워 두면 {preview ? dotDate(preview.startDate) : "자동 계산된 날짜"}부터 시작해요.
          </span>
        </ActionForm>
        <ActionForm action={rejectPayment} className="flex items-end gap-2" confirmText="이 신청을 반려할까요?">
          <input type="hidden" name="payment_id" value={payment.id} />
          <input name="reason" placeholder="반려 사유" maxLength={200} className={`${smallInput} w-36`} />
          <button type="submit" className={smallButton}>
            반려
          </button>
        </ActionForm>
      </div>
    </article>
  );
}

/** An approved payment: undo a mistaken approval, or record a refund. */
export function ApprovedPaymentRow({ payment, club }: { payment: Payment; club: ClubPrivate }) {
  const member = club.members.find((m) => m.id === payment.memberId);
  const memberships = club.memberships.filter((m) => m.sourcePaymentId === payment.id && m.status === "active");
  const approver = club.members.find((m) => m.id === payment.approvedBy);
  const label = payment.registration ? `월 단위 등록 ${payment.registration.months.length}개월` : club.plans.find((p) => p.id === payment.planId)?.name;
  return (
    <details className="group rounded-md border border-midnight/20 bg-white/40 px-3 py-2.5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
        <span className="text-[14px]">
          <strong className="text-midnight">{member?.name ?? payment.memberId}</strong>{" "}
          <span className="text-ink-soft">
            {label} · {formatWon(payment.amount)}
            {payment.firstJoin && " (첫 등록)"}
          </span>
        </span>
        <span className="font-mono text-[12px] text-ink-soft">
          {payment.depositedAt && dotDate(payment.depositedAt)}{" "}
          {memberships.length > 0 && `→ ${memberships.map((m) => `${dotDate(m.startDate)}–${dotDate(m.endDate)}`).join(", ")}`}
          <span className="ml-2">{approver ? `by ${approver.name}` : ""}</span>
        </span>
      </summary>
      <div className="mt-3 grid gap-3 border-t border-dashed border-midnight/20 pt-3 md:grid-cols-2">
        <ActionForm action={cancelApproval} className="flex flex-wrap items-end gap-2" confirmText="승인을 취소할까요? 회원권이 무효 처리되고 입금은 확인 대기로 돌아가요.">
          <input type="hidden" name="payment_id" value={payment.id} />
          <input name="reason" required placeholder="승인 취소 사유" maxLength={200} className={`${smallInput} flex-1`} />
          <button type="submit" className={smallButton}>
            승인 취소
          </button>
        </ActionForm>
        <ActionForm action={refundPayment} className="flex flex-wrap items-end gap-2" confirmText="환불 처리할까요? 회원권이 환불 상태로 바뀌어요.">
          <input type="hidden" name="payment_id" value={payment.id} />
          <input name="reason" required placeholder="환불 사유" maxLength={200} className={`${smallInput} flex-1`} />
          <button type="submit" className={smallButton}>
            환불
          </button>
        </ActionForm>
      </div>
    </details>
  );
}
