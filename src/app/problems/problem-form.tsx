"use client";

import { useActionState } from "react";
import { buttonPrimary, cn } from "@/components/ui";
import { LIMITS } from "@/lib/problems";
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
 * server. Grade is free text: the club's own system, nothing is forced (V-grades are
 * only suggestions).
 */
export function ProblemForm({ values, grades }: { values: ProblemFormValues; grades: string[] }) {
  const editing = Boolean(values.id);
  const [state, action, pending] = useActionState<ProblemState, FormData>(editing ? updateProblem : createProblem, { status: "idle" });
  const suggestions = [...new Set([...grades, ...Array.from({ length: 11 }, (_, i) => `V${i}`)])];

  return (
    <form action={action} className="flex flex-col gap-5">
      {values.id && <input type="hidden" name="problem_id" value={values.id} />}
      <label className={label}>
        문제명 <span className={hint}>필수 · {LIMITS.title}자까지</span>
        <input name="title" required maxLength={LIMITS.title} defaultValue={values.title} className={input} placeholder="예: 퇴근 후의 중력" />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className={label}>
          난이도 <span className={hint}>필수 · 클럽에서 쓰는 표기 그대로</span>
          <input name="grade" required maxLength={LIMITS.grade} defaultValue={values.grade} className={input} list="grade-suggestions" placeholder="예: V3" />
          <datalist id="grade-suggestions">
            {suggestions.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        <label className={label}>
          벽 구역 <span className={hint}>선택</span>
          <input name="wall" maxLength={LIMITS.wall} defaultValue={values.wall} className={input} placeholder="예: 메인 벽 왼쪽" />
        </label>
      </div>
      <label className={label}>
        Setter 이름 <span className={hint}>필수</span>
        <input name="setter_name" required maxLength={LIMITS.setter} defaultValue={values.setterName} className={input} />
      </label>
      <label className={label}>
        Setter&apos;s note <span className={hint}>선택 · 문제의 의도나 특징 · {LIMITS.note}자까지</span>
        <textarea name="setter_note" rows={3} maxLength={LIMITS.note} defaultValue={values.setterNote} className={input} placeholder="예: 오른발을 잘 활용하면 생각보다 쉽게 풀리는 문제입니다." />
      </label>
      <label className={label}>
        Beta / Tips <span className={hint}>선택 · 상세 화면에서 REVEAL BETA를 눌러야 보여요 · {LIMITS.beta}자까지</span>
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
