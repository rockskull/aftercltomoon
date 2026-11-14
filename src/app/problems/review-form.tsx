"use client";

import { useActionState, useState } from "react";
import { MembershipRequired } from "@/components/membership-required";
import { buttonPrimary, buttonSecondary, cn } from "@/components/ui";
import { MEMBERSHIP_REQUIRED } from "@/lib/access";
import { FEELS, LIMITS, SEND_STATUSES, type Feel, type SendStatus } from "@/lib/problems";
import { deleteReview, saveReview, type ProblemState } from "./actions";
import { FEEL_LABEL, FUN_LABEL, SEND_LABEL } from "./problem-ui";

const chip =
  "flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-midnight/25 bg-ivory px-2 py-2 text-center text-midnight transition-colors hover:border-midnight has-[:checked]:border-midnight has-[:checked]:bg-butter has-[:checked]:shadow-[2px_2px_0_0_var(--color-midnight)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-midnight";

export interface MyReview {
  id: string;
  fun: number;
  feel: Feel;
  send: SendStatus;
  comment: string;
}

/**
 * RATE THIS PROBLEM — one review per member per problem: saving again updates it
 * (PROJECTING → SENT included). Self-reported; nothing to prove. The server checks the
 * login and the membership on every save, whatever this form shows.
 */
export function ReviewForm({ problemId, mine, version }: { problemId: string; mine: MyReview | null; version: string }) {
  type Stamped = ProblemState & { at: number };
  const stamp = (fn: typeof saveReview) => async (prev: Stamped, fd: FormData): Promise<Stamped> => ({ ...(await fn(prev, fd)), at: Date.now() });
  const [state, action, pending] = useActionState<Stamped, FormData>(stamp(saveReview), { status: "idle", at: 0 });
  const [del, delAction, deleting] = useActionState<Stamped, FormData>(stamp(deleteReview), { status: "idle", at: 0 });
  const [count, setCount] = useState<{ version: string; n: number } | null>(null);
  const chars = count && count.version === version ? count.n : (mine?.comment.length ?? 0);
  // The result line outlives the refresh that follows a save or delete (the inputs below reset to the saved review).
  const latest = del.at > state.at ? del : state;

  if (state.code === MEMBERSHIP_REQUIRED || del.code === MEMBERSHIP_REQUIRED) return <MembershipRequired reason="expired" />;

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-5" data-review-form>
        <input type="hidden" name="problem_id" value={problemId} />
        <div key={version} className="contents">
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-midnight">① 재미 평가</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={chip}>
                <input type="radio" name="fun" value={n} defaultChecked={mine?.fun === n} required className="sr-only" />
                <span className="font-mono text-[18px] font-bold leading-none">{n}</span>
                <span className="mt-1 text-[10.5px] leading-tight text-ink-soft">{FUN_LABEL[n]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-midnight">② 체감 난이도 (등록된 난이도와 비교)</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {FEELS.map((f) => (
              <label key={f} className={chip}>
                <input type="radio" name="feel" value={f} defaultChecked={(mine?.feel ?? "fair") === f} required className="sr-only" />
                <span className="font-label text-[13px] font-bold tracking-[0.1em]">{FEEL_LABEL[f].en}</span>
                <span className="mt-0.5 text-[11px] text-ink-soft">{FEEL_LABEL[f].ko}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-midnight">③ 완등 여부</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {SEND_STATUSES.map((s) => (
              <label key={s} className={chip}>
                <input type="radio" name="send" value={s} defaultChecked={(mine?.send ?? "sent") === s} required className="sr-only" />
                <span className="font-label text-[13px] font-bold tracking-[0.1em]">{SEND_LABEL[s].en}</span>
                <span className="mt-0.5 text-[11px] text-ink-soft">{SEND_LABEL[s].ko}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-midnight">
          ④ 한 줄 후기 <span className="text-[12px] font-normal text-ink-soft">선택 · {LIMITS.comment}자까지</span>
          <input
            name="comment"
            maxLength={LIMITS.comment}
            defaultValue={mine?.comment ?? ""}
            onChange={(e) => setCount({ version, n: e.target.value.length })}
            placeholder="예: 마지막 무브가 정말 재미있었어요."
            className="block w-full rounded-md border-2 border-midnight/25 bg-ivory px-3 py-2.5 text-[16px] text-midnight focus:border-midnight focus:outline-none"
          />
          <span className="self-end font-mono text-[11px] font-normal text-ink-soft">
            {chars}/{LIMITS.comment}
          </span>
        </label>
        </div>
        <button type="submit" disabled={pending} className={cn(buttonPrimary, "w-full sm:w-64 disabled:opacity-60")}>
          {pending ? "Saving…" : mine ? "Update my review" : "Rate this problem"}
        </button>
      </form>
      {mine && (
        <form
          action={delAction}
          onSubmit={(e) => {
            if (!window.confirm("내 평가를 지울까요?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="review_id" value={mine.id} />
          <button type="submit" disabled={deleting} className={cn(buttonSecondary, "h-10 w-full text-[11px] sm:w-64 disabled:opacity-60")}>
            Delete my review
          </button>
        </form>
      )}
      {latest.status === "error" && latest.message && (
        <p role="alert" className="rounded-md border-2 border-brown bg-ivory px-3 py-2 text-[14px] font-medium text-brown">
          {latest.message}
        </p>
      )}
      {latest.status === "success" && latest.message && (
        <p role="status" className="text-[14px] font-medium text-midnight" data-review-result>
          {latest.message}
        </p>
      )}
    </div>
  );
}

/** TIPS stay hidden until asked for (no spoilers). */
export function BetaReveal({ beta }: { beta: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn(buttonSecondary, "w-full sm:w-auto")} aria-expanded={false} data-reveal-beta>
        Show tips
      </button>
    );
  }
  return (
    <p className="whitespace-pre-line rounded-md border-2 border-dashed border-midnight/30 bg-butter-200/50 px-4 py-3 text-[15px] leading-relaxed text-midnight" data-beta>
      {beta}
    </p>
  );
}
