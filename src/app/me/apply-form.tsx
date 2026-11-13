"use client";

import { useActionState, useState } from "react";
import { ArrowUpRight, buttonPrimary, cn } from "@/components/ui";
import { startMonths } from "@/lib/start-months";
import { applyMembership, confirmMemberConsent, type ActionState } from "./actions";

/** Plans are shown by period only: fees are announced off-site (crew chat / consent form). */
export interface PlanOption {
  id: string;
  name: string;
  totalMonths: number;
  bonusMonths: number;
  description: string;
}

const input =
  "block w-full rounded-md border-2 border-midnight/25 bg-ivory px-3.5 py-3 text-[16px] text-midnight focus:border-midnight focus:outline-none";

export function ApplyForm({
  plans,
  isExtension,
  defaultName,
  defaultDepositor,
  needsName,
  today,
  consentUrl,
}: {
  plans: PlanOption[];
  isExtension: boolean;
  defaultName: string;
  defaultDepositor: string;
  needsName: boolean;
  today: string;
  /** Set when the member still has to submit the 회원 등록 동의서. */
  consentUrl: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(applyMembership, { status: "idle" });
  const values = state.values ?? {};
  const [planId, setPlanId] = useState(values.plan_id ?? plans[0]?.id ?? "");
  const months = startMonths(today);

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.status === "error" && (
        <p role="alert" className="rounded-md border-2 border-brown bg-ivory px-4 py-3 text-[14px] font-medium text-brown">
          {state.message}
        </p>
      )}

      {consentUrl && <ConsentStep url={consentUrl} defaultChecked={values.consent === "on"} />}

      <fieldset>
        <legend className="text-[15px] font-semibold text-midnight">회원권</legend>
        <div className="mt-2 grid gap-2">
          {plans.map((plan) => (
            <label
              key={plan.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border-2 bg-ivory px-4 py-3.5 transition-colors",
                planId === plan.id ? "border-midnight bg-butter-200/60" : "border-midnight/20",
              )}
            >
              <input
                type="radio"
                name="plan_id"
                value={plan.id}
                checked={planId === plan.id}
                onChange={() => setPlanId(plan.id)}
                className="size-[18px] accent-midnight"
              />
              <span className="flex-1">
                <span className="block text-[16px] font-bold text-midnight">{plan.name}</span>
                {plan.description && <span className="block text-[13px] text-ink-soft">{plan.description}</span>}
              </span>
              <span className="whitespace-nowrap text-right font-mono text-[14px] font-semibold text-midnight">총 {plan.totalMonths}개월</span>
            </label>
          ))}
        </div>
      </fieldset>

      {needsName && (
        <div>
          <label htmlFor="name" className="text-[15px] font-semibold text-midnight">
            이름 또는 닉네임
          </label>
          <input id="name" name="name" required maxLength={40} defaultValue={values.name ?? defaultName} className={cn(input, "mt-2")} />
        </div>
      )}

      <div>
        <label htmlFor="depositor_name" className="text-[15px] font-semibold text-midnight">
          입금자명
        </label>
        <p id="depositor-hint" className="mt-1 text-[13px] text-ink-soft">
          회비를 낼 때 쓰는 이름이에요. 운영진이 확인할 때 이 이름으로 찾아요.
        </p>
        <input
          id="depositor_name"
          name="depositor_name"
          required
          maxLength={20}
          aria-describedby="depositor-hint"
          defaultValue={values.depositor_name ?? defaultDepositor}
          className={cn(input, "mt-2")}
        />
      </div>

      {isExtension ? (
        <p className="rounded-md border border-dashed border-midnight/30 px-4 py-3 text-[14px] leading-relaxed text-ink-soft">
          회원권은 매월 1일에 시작해 말일에 끝나요. 연장분은 지금 회원권이 끝난 다음 달 1일부터 이어지고, 남은 기간은 그대로 유지돼요.
        </p>
      ) : (
        <div>
          <label htmlFor="requested_start" className="text-[15px] font-semibold text-midnight">
            시작 월
          </label>
          <p id="start-hint" className="mt-1 text-[13px] text-ink-soft">
            회원권은 고른 달 1일에 시작해 마지막 달 말일에 끝나요. 입금한 날짜와는 상관없어요.
          </p>
          <select
            id="requested_start"
            name="requested_start"
            aria-describedby="start-hint"
            defaultValue={values.requested_start ?? months[0].value}
            className={cn(input, "mt-2")}
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <button type="submit" disabled={pending || !planId} className={cn(buttonPrimary, "w-full disabled:opacity-60 sm:w-72")}>
        {pending ? "Sending…" : isExtension ? "Extend membership" : "Apply"}
      </button>
    </form>
  );
}

/** Step 1 of a first registration: the Google Form, then a required confirmation. */
export function ConsentStep({ url, defaultChecked = false }: { url: string; defaultChecked?: boolean }) {
  return (
    <div className="rounded-lg border-2 border-midnight bg-butter-200/50 p-4">
      <p className="font-label text-[11px] font-semibold uppercase tracking-[0.24em] text-brown">Step 1 · 동의서</p>
      <p className="mt-1 text-[16px] font-bold text-midnight">회원 등록 동의서를 먼저 제출해 주세요</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
        개인정보 수집·이용, 이용 규칙, 홈캠 안내에 대한 동의서예요. Google 설문에 성함과 연락처를 적어 제출한 뒤 아래에 체크해 주세요.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-[6px] border-2 border-midnight bg-ivory px-4 text-[14px] font-bold text-midnight hover:bg-midnight hover:text-cream"
      >
        동의서 작성하기
        <ArrowUpRight />
        <span className="sr-only">(새 창)</span>
      </a>
      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[15px] font-semibold text-midnight">
        <input type="checkbox" name="consent" required defaultChecked={defaultChecked} className="mt-0.5 size-5 shrink-0 accent-midnight" />
        회원 등록 동의서를 제출했어요
      </label>
    </div>
  );
}

/** For members registered before the site: confirm the consent form once. */
export function ConsentConfirm({ url }: { url: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(confirmMemberConsent, { status: "idle" });
  if (state.status === "success") {
    return <p className="rounded-md border-2 border-midnight bg-ivory px-4 py-3 text-[14px] font-medium text-midnight">{state.message}</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <ConsentStep url={url} />
      {state.status === "error" && <p className="text-[13px] font-medium text-brown">{state.message}</p>}
      <button type="submit" disabled={pending} className={cn(buttonPrimary, "w-full disabled:opacity-60 sm:w-72")}>
        {pending ? "Saving…" : "Confirm"}
      </button>
    </form>
  );
}
