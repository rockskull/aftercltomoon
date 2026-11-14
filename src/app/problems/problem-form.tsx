"use client";

import { useActionState } from "react";
import { buttonPrimary, cn } from "@/components/ui";
import { GRADES, LIMITS } from "@/lib/problems";
import { createProblem, updateProblem, type ProblemState } from "./actions";

const input =
  "block w-full rounded-md border-2 border-midnight/25 bg-ivory px-3 py-2.5 text-[16px] text-midnight focus:border-midnight focus:outline-none";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold text-midnight";
const hint = "text-[12px] font-normal text-ink-soft";

export interface ProblemFormValues {
  id?: string;
  title: string;
  grade: string;
  wall: string;
  setterName: string;
  setterNote: string;
  beta: string;
}

/**
 * The crew's problem form (register / edit). The number and the date are set by the
 * server. Grade is one of the club's colours (빨강 → 흰색, YDS in brackets).
 */
export function ProblemForm({ values }: { values: ProblemFormValues }) {
  const editing = Boolean(values.id);
  const [state, action, pending] = useActionState<ProblemState, FormData>(editing ? updateProblem : createProblem, { status: "idle" });

  return (
    <form action={action} className="flex flex-col gap-5">
      {values.id && <input type="hidden" name="problem_id" value={values.id} />}
      <label className={label}>
        문제명 <span className={hint}>필수 · {LIMITS.title}자까지</span>
        <input name="title" required maxLength={LIMITS.title} defaultValue={values.title} className={input} placeholder="예: 퇴근 후의 중력" />
      </label>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-semibold text-midnight">
          난이도 <span className={hint}>필수 · 쉬운 색부터 (YDS)</span>
        </legend>
        <div className="grid gap-1.5 sm:grid-cols-2" data-grade-choices>
          {GRADES.map((g) => (
            <label
              key={g.name}
              className="flex cursor-pointer items-center gap-3 rounded-md border-2 border-midnight/25 bg-ivory px-3 py-2 hover:border-midnight has-[:checked]:border-midnight has-[:checked]:bg-butter-200/70 has-[:checked]:shadow-[2px_2px_0_0_var(--color-midnight)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-midnight"
            >
              <input type="radio" name="grade" value={g.name} defaultChecked={values.grade === g.name} required className="sr-only" />
              <span aria-hidden className="size-5 shrink-0 rounded-full border-2 border-midnight/70" style={{ backgroundColor: g.swatch }} />
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-midnight">
                  {g.name} <span className="font-mono text-[13px] font-semibold">({g.yds})</span>
                </span>
                <span className="block text-[12px] text-ink-soft">{g.level}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className={label}>
        벽 구역 <span className={hint}>선택</span>
        <input name="wall" maxLength={LIMITS.wall} defaultValue={values.wall} className={input} placeholder="예: 메인 벽 왼쪽" />
      </label>
      <label className={label}>
        Setter 이름 <span className={hint}>필수</span>
        <input name="setter_name" required maxLength={LIMITS.setter} defaultValue={values.setterName} className={input} />
      </label>
      <label className={label}>
        Setter&apos;s note <span className={hint}>선택 · 문제의 의도나 특징 · {LIMITS.note}자까지</span>
        <textarea name="setter_note" rows={3} maxLength={LIMITS.note} defaultValue={values.setterNote} className={input} placeholder="예: 오른발을 잘 활용하면 생각보다 쉽게 풀리는 문제입니다." />
      </label>
      <label className={label}>
        Tips <span className={hint}>선택 · 상세 화면에서 SHOW TIPS를 눌러야 보여요 · {LIMITS.beta}자까지</span>
        <textarea name="beta" rows={4} maxLength={LIMITS.beta} defaultValue={values.beta} className={input} placeholder="예: 두 번째 홀드에서 몸을 오른쪽으로 돌려보세요." />
      </label>
      {state.status === "error" && state.message && (
        <p role="alert" className="rounded-md border-2 border-brown bg-ivory px-3 py-2 text-[14px] font-medium text-brown">
          {state.message}
        </p>
      )}
      {state.status === "success" && state.message && (
        <p role="status" className="text-[14px] font-medium text-midnight">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={cn(buttonPrimary, "w-full sm:w-64 disabled:opacity-60")}>
        {pending ? "Saving…" : editing ? "Save changes" : "Register problem"}
      </button>
      {!editing && <p className={hint}>번호(MOON 001…)와 등록일은 자동으로 붙어요. 상태는 ACTIVE로 시작해요.</p>}
    </form>
  );
}
