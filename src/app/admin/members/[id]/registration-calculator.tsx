"use client";

import { useMemo, useState } from "react";
import { cn } from "@/components/ui";
import { daysInMonth } from "@/lib/dates";
import { nextMembershipPeriod, type MembershipPeriod } from "@/lib/membership";
import { formatWonPlain, quoteRegistration } from "@/lib/registration";
import { FIRST_START_DAY } from "@/lib/start-months";
import { createRegistration } from "../../actions";
import { ActionForm } from "../../admin-ui";
import { RegistrationLines } from "../../registration-lines";
import { smallInput, smallPrimary } from "../../shared";

export interface CalculatorMonth {
  /** "YYYY-MM" */
  ym: string;
  /** Already covered by one of this member's valid memberships. */
  taken: boolean;
}

export interface CalculatorPlan {
  id: string;
  name: string;
  totalMonths: number;
  /** What this member would pay (first-time price applied by the server's own rule). */
  amount: number;
  firstPriceApplied: boolean;
}

const dot = (key: string) => key.replace(/-/g, ".");
const pad = (n: number) => String(n).padStart(2, "0");
const monthText = (ym: string) => `${ym.slice(0, 4)}.${ym.slice(5)}`;

/**
 * MEMBERSHIP REGISTRATION (admin): pick months, adjust the first day, see the
 * amount to collect update immediately. "청구 만들기" only creates a pending
 * charge — the server recomputes the amount from the months and the plan price,
 * and nothing is activated until the deposit is confirmed.
 */
export function RegistrationCalculator({
  memberId,
  memberName,
  depositorName,
  fee,
  feePlanName,
  firstJoinNote,
  months,
  longPlans,
  existing,
  todayKey,
  requestId,
}: {
  memberId: string;
  memberName: string;
  depositorName: string;
  /** Monthly fee (the 1개월 plan's regular price); null when there is no such plan. */
  fee: number | null;
  feePlanName: string;
  /** Set when this member has never been a member and the 1개월 plan has a first-time price. */
  firstJoinNote: string | null;
  months: CalculatorMonth[];
  longPlans: CalculatorPlan[];
  existing: MembershipPeriod[];
  todayKey: string;
  requestId: string;
}) {
  const [kind, setKind] = useState<string>(fee ? "monthly" : (longPlans[0]?.id ?? "monthly"));
  const [picked, setPicked] = useState<string[]>([]);
  const [startPick, setStartPick] = useState<{ month: string; day: number } | null>(null);
  const free = months.filter((m) => !m.taken);
  const [planStart, setPlanStart] = useState(free[0]?.ym ?? months[0]?.ym ?? "");

  const selected = useMemo(() => [...picked].sort(), [picked]);
  const first = selected[0] ?? null;
  const firstDays = first ? daysInMonth(Number(first.slice(0, 4)), Number(first.slice(5, 7))) : 31;
  // The first day applies to the first selected month only; a different first month starts on the 1st again.
  const startDay = startPick && startPick.month === first ? Math.min(startPick.day, firstDays) : 1;
  const start = first ? `${first}-${pad(startDay)}` : "";
  const quote = useMemo(() => {
    if (!fee || !first) return null;
    const q = quoteRegistration({ months: selected, start, fee });
    return "error" in q ? null : q;
  }, [fee, first, selected, start]);

  const plan = longPlans.find((p) => p.id === kind) ?? null;
  const planPeriod = plan
    ? nextMembershipPeriod({
        existing,
        plan: { durationMonths: plan.totalMonths, bonusMonths: 0 },
        todayKey,
        requestedStart: planStart ? `${planStart}-01` : null,
        earliestStart: FIRST_START_DAY,
      })
    : null;

  const toggle = (ym: string) => setPicked((cur) => (cur.includes(ym) ? cur.filter((m) => m !== ym) : [...cur, ym]));
  const total = kind === "monthly" ? (quote?.total ?? 0) : (plan?.amount ?? 0);
  const ready = kind === "monthly" ? Boolean(quote) : Boolean(plan && planStart);

  return (
    <div className="flex flex-col gap-4" data-registration-calculator>
      <fieldset className="flex flex-wrap gap-2" aria-label="등록 방식">
        {fee && (
          <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border-2 px-3 py-2 text-[13px] font-bold", kind === "monthly" ? "border-midnight bg-butter" : "border-midnight/25")}>
            <input type="radio" name="kind-choice" value="monthly" checked={kind === "monthly"} onChange={() => setKind("monthly")} className="accent-midnight" />
            월 단위 (첫 달 일할)
          </label>
        )}
        {longPlans.map((p) => (
          <label key={p.id} className={cn("flex cursor-pointer items-center gap-2 rounded-md border-2 px-3 py-2 text-[13px] font-bold", kind === p.id ? "border-midnight bg-butter" : "border-midnight/25")}>
            <input type="radio" name="kind-choice" value={p.id} checked={kind === p.id} onChange={() => setKind(p.id)} className="accent-midnight" />
            {p.name} 상품 ({p.totalMonths}개월)
          </label>
        ))}
      </fieldset>

      {kind === "monthly" ? (
        <>
          <p className="text-[13px] text-ink-soft">
            월 회비 <strong className="font-mono text-midnight">{formatWonPlain(fee ?? 0)}</strong> ({feePlanName} 상품 가격). 첫 등록월만 실제 달력 일수로 나눠 계산하고, 이후 달은 한 달씩 같은 금액이에요. 6+1·12+2 같은 보너스 달은 붙지 않아요.
          </p>
          {firstJoinNote && <p className="rounded border border-dashed border-brown/50 px-2.5 py-1.5 text-[12px] text-brown">{firstJoinNote}</p>}
          <fieldset>
            <legend className="mb-1.5 text-[12px] font-medium text-ink-soft">등록월 (여러 달 선택)</legend>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
              {months.map((m) => {
                const on = picked.includes(m.ym);
                return (
                  <label
                    key={m.ym}
                    className={cn(
                      "flex h-11 items-center justify-center gap-1.5 rounded-md border-2 font-mono text-[13px]",
                      m.taken ? "cursor-not-allowed border-dashed border-midnight/20 text-ink-soft/70" : "cursor-pointer",
                      on ? "border-midnight bg-butter font-bold text-midnight" : !m.taken && "border-midnight/25 text-midnight hover:border-midnight",
                    )}
                    title={m.taken ? "이미 등록된 달이에요" : undefined}
                  >
                    <input type="checkbox" value={m.ym} checked={on} disabled={m.taken} onChange={() => toggle(m.ym)} className="sr-only" data-month={m.ym} />
                    {monthText(m.ym)}
                    {m.taken && <span className="font-sans text-[10px]">등록됨</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {first && (
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft sm:w-64">
              첫 등록월 시작일 ({monthText(first)})
              <select
                value={startDay}
                onChange={(e) => setStartPick({ month: first, day: Number(e.target.value) })}
                className={smallInput}
                data-start-day
              >
                {Array.from({ length: firstDays }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {dot(`${first}-${pad(d)}`)}
                    {d === 1 ? " (기본)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {quote ? <RegistrationLines quote={quote} /> : <p className="text-[13px] text-ink-soft">등록할 달을 고르면 금액이 바로 계산돼요.</p>}
        </>
      ) : (
        plan && (
          <>
            <p className="text-[13px] text-ink-soft">
              {plan.name} 상품은 정해진 금액과 기간을 그대로 써요(일할·보너스 조정 없음). 1일 시작 · 말일 종료.
            </p>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft sm:w-64">
              시작 월
              <select value={planStart} onChange={(e) => setPlanStart(e.target.value)} className={smallInput}>
                {months.map((m) => (
                  <option key={m.ym} value={m.ym}>
                    {monthText(m.ym)}
                  </option>
                ))}
              </select>
            </label>
            {planPeriod && (
              <p className="rounded-md bg-butter-200/60 px-3 py-2 text-[13px] text-midnight">
                확정하면 <strong className="font-mono">{dot(planPeriod.startDate)} – {dot(planPeriod.endDate)}</strong> ({plan.totalMonths}개월)
                {planPeriod.extendsExisting ? " · 기존 회원권에 이어서" : ""} · <strong className="font-mono">{formatWonPlain(plan.amount)}</strong>
                {plan.firstPriceApplied ? " (첫 등록 가격)" : ""}
              </p>
            )}
          </>
        )
      )}

      <div className="rounded-md border-2 border-midnight bg-white/70 px-3 py-2.5">
        <p className="font-label text-[12px] font-bold uppercase tracking-[0.14em] text-brown">Amount to collect</p>
        <p className="font-mono text-[22px] font-bold text-midnight" data-amount-to-collect={total}>
          {total.toLocaleString("ko-KR")} KRW
        </p>
        <p className="text-[12px] text-ink-soft">미리보기예요. 아직 아무것도 저장되지 않았어요.</p>
      </div>

      <ActionForm
        action={createRegistration}
        className="flex flex-wrap items-end gap-2"
        confirmText={`${memberName}님에게 ${total.toLocaleString("ko-KR")}원 청구를 만들까요? 입금 확인 후 '등록 확정'을 눌러야 회원권이 생겨요.`}
      >
        <input type="hidden" name="member_id" value={memberId} />
        <input type="hidden" name="request_id" value={requestId} />
        <input type="hidden" name="kind" value={kind === "monthly" ? "monthly" : "plan"} />
        {kind === "monthly" ? (
          <>
            {selected.map((m) => (
              <input key={m} type="hidden" name="months" value={m} />
            ))}
            <input type="hidden" name="start" value={start} />
          </>
        ) : (
          <>
            <input type="hidden" name="plan_id" value={kind} />
            <input type="hidden" name="start_month" value={planStart} />
          </>
        )}
        <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
          입금자명
          <input name="depositor_name" defaultValue={depositorName} maxLength={20} className={smallInput} />
        </label>
        <button type="submit" disabled={!ready} className={smallPrimary}>
          청구 만들기 (입금 확인 대기)
        </button>
        <p className="w-full text-[12px] text-ink-soft">
          청구를 만들어도 회원권은 생기지 않아요. 회원에게 금액을 안내하고, 입금을 확인한 뒤 <strong>CONFIRM REGISTRATION</strong>을 눌러야 반영돼요. 금액은 서버에서 다시 계산해요.
        </p>
      </ActionForm>
    </div>
  );
}
