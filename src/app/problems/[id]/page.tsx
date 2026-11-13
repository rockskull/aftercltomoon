import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MembershipRequired } from "@/components/membership-required";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowRight, buttonPrimary, cn, NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { loadProblem, type ProblemViewer, type PublicReview } from "@/server/problems";
import { storeMode } from "@/server/store";
import { ActionForm } from "../../admin/admin-ui";
import { moderateReview, setProblemStatus } from "../actions";
import { dotDay, FEEL_LABEL, FeelBars, FUN_LABEL, FunMeter, LogHeading, ruled, SEND_LABEL, StatusPill } from "../problem-ui";
import { BetaReveal, ReviewForm } from "../review-form";

export const metadata: Metadata = { title: "Moon Problem" };

export default function ProblemPage({ params }: PageProps<"/problems/[id]">) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Suspense fallback={<DetailSkeleton />}>
          <ProblemDetail params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function ProblemDetail({ params }: Pick<PageProps<"/problems/[id]">, "params">) {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  const { id } = await params;
  await requestNow();
  let loaded;
  try {
    loaded = await loadProblem(decodeURIComponent(id));
  } catch (error) {
    console.error("[problems] detail failed", error);
    return <p className="mx-auto max-w-3xl px-4 py-10 text-[15px] text-ink-soft">문제를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  if (!loaded) notFound();
  const { problem: p, viewer, myReview } = loaded;
  const s = p.stats;

  return (
    <>
      <header className="night text-cream">
        <div className="mx-auto max-w-3xl px-4 pb-8 pt-8 md:px-6 md:pt-12">
          <Link href="/problems" className="font-label text-[11px] font-semibold uppercase tracking-[0.24em] text-cream/70 hover:text-cream">
            ← All problems
          </Link>
          <p className="mt-4 font-display text-[56px] font-extrabold leading-[0.85] text-butter md:text-[80px]">{p.code}</p>
          <h1 className="mt-2 text-[26px] font-extrabold leading-snug md:text-[32px]">{p.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 items-center rounded-[4px] border border-butter px-2 font-mono text-[14px] font-bold text-butter">{p.grade}</span>
            <StatusPill status={p.status} onDark />
          </div>
        </div>
      </header>

      <div className="paper">
        <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-8 md:px-6 md:py-12">
          {viewer.operator && <CrewPanel id={p.id} no={p.no} status={p.status} />}

          <section aria-labelledby="info-title">
            <LogHeading no="01" title="Problem info" id="info-title" />
            <dl className={cn("mt-3 grid grid-cols-[96px_minmax(0,1fr)] gap-y-0 text-[15px]", ruled)}>
              {(
                [
                  ["번호", p.code, true],
                  ["난이도", p.grade, true],
                  ["벽 구역", p.wall || "—", false],
                  ["Setter", p.setterName, false],
                  ["등록일", dotDay(p.createdOn), true],
                  ["상태", p.status.toUpperCase(), true],
                ] as const
              ).map(([k, v, mono]) => (
                <div key={k} className="contents">
                  <dt className="py-1 text-[13px] font-medium leading-[20px] text-ink-soft">{k}</dt>
                  <dd className={cn("py-1 leading-[20px] text-midnight", mono && "font-mono")}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="note-title">
            <LogHeading no="02" title="Setter's note" id="note-title" />
            {p.setterNote ? (
              <blockquote className="mt-3 whitespace-pre-line border-l-4 border-butter pl-4 text-[15px] leading-relaxed text-midnight">
                {p.setterNote}
                <footer className="mt-2 font-mono text-[12px] text-ink-soft">— {p.setterName}</footer>
              </blockquote>
            ) : (
              <p className="mt-3 text-[14px] text-ink-soft">출제자 노트가 아직 없어요.</p>
            )}
          </section>

          <section aria-labelledby="beta-title">
            <LogHeading no="03" title="Beta / Tips" id="beta-title" />
            <div className="mt-3">{p.beta ? <BetaReveal beta={p.beta} /> : <p className="text-[14px] text-ink-soft">아직 등록된 팁이 없어요.</p>}</div>
          </section>

          <section aria-labelledby="reviews-title">
            <LogHeading no="04" title="Member reviews" id="reviews-title" />
            <div className="mt-4 rounded-lg border-2 border-midnight bg-ivory p-4 shadow-[4px_4px_0_0_var(--color-midnight)] md:p-5">
              <p className="mb-4 font-label text-[12px] font-bold uppercase tracking-[0.24em] text-brown">Rate this problem</p>
              <RateArea viewer={viewer} problemId={p.id} active={p.status === "active"} myReview={myReview} returnTo={`/problems/${p.no}`} />
            </div>
            {p.reviews.length === 0 ? (
              <p className="mt-4 text-[14px] text-ink-soft">아직 평가가 없습니다. 첫 기록을 남겨 주세요.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {p.reviews.map((r) => (
                  <ReviewItem key={r.id} review={r} operator={viewer.operator} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="summary-title">
            <LogHeading no="05" title="Problem summary" id="summary-title" />
            {s.reviews === 0 ? (
              <p className="mt-3 text-[14px] text-ink-soft">아직 평가가 없습니다.</p>
            ) : (
              <div className="mt-3 grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-1">
                  <div>
                    <dt className="font-label text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-soft">Sends</dt>
                    <dd className="font-display text-[40px] font-extrabold leading-none text-midnight" data-sends={s.sends}>
                      {s.sends}
                      <span className="ml-1 font-sans text-[13px] font-medium text-ink-soft">명 완등</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="font-label text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-soft">Fun</dt>
                    <dd data-fun={s.funAverage ?? ""}>
                      <FunMeter value={s.funAverage} size="lg" />
                    </dd>
                  </div>
                </dl>
                <div>
                  <p className="mb-2 font-label text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-soft">체감 난이도 · 평가 {s.reviews}개</p>
                  <FeelBars stats={s} />
                </div>
              </div>
            )}
          </section>

          <Link href="/problems" className="inline-flex h-11 items-center gap-2 self-start font-label text-[12px] font-semibold uppercase tracking-[0.2em] text-midnight underline decoration-butter decoration-2 underline-offset-[6px]">
            All problems
            <ArrowRight />
          </Link>
        </div>
      </div>
    </>
  );
}

function RateArea({
  viewer,
  problemId,
  active,
  myReview,
  returnTo,
}: {
  viewer: ProblemViewer;
  problemId: string;
  active: boolean;
  myReview: PublicReview | null;
  returnTo: string;
}) {
  if (!viewer.signedIn) {
    return (
      <div>
        <p className="text-[14px] text-ink-soft">평가는 로그인한 클럽 회원만 남길 수 있어요.</p>
        <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className={cn(buttonPrimary, "mt-3 w-full sm:w-auto")}>
          Login to rate
          <ArrowRight />
        </Link>
      </div>
    );
  }
  if (!viewer.canReview) return <MembershipRequired reason={viewer.blockReason ?? "expired"} />;
  if (myReview?.hidden) return <p className="text-[14px] text-brown">운영진이 내 후기를 숨겼어요. 궁금한 점은 운영진에게 문의해 주세요.</p>;
  if (!active) return <p className="text-[14px] text-ink-soft">보관된 문제예요. 기존 기록은 그대로 남아 있고, 새 평가는 받지 않아요.</p>;
  return (
    <ReviewForm
      version={myReview ? `${myReview.id}:${myReview.on}:${myReview.fun}:${myReview.send}:${myReview.feel}:${myReview.comment}` : "new"}
      problemId={problemId}
      mine={myReview ? { id: myReview.id, fun: myReview.fun, feel: myReview.feel, send: myReview.send, comment: myReview.comment } : null}
    />
  );
}

function ReviewItem({ review: r, operator }: { review: PublicReview; operator: boolean }) {
  return (
    <li className={cn("rounded-lg border-2 bg-ivory px-4 py-3", r.mine ? "border-midnight" : "border-midnight/20", r.hidden && "border-dashed opacity-70")} data-review={r.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-bold text-midnight">
          {r.displayName}
          {r.mine && <span className="ml-2 align-middle font-mono text-[11px] font-semibold text-brown">내 평가</span>}
          {r.hidden && <span className="ml-2 align-middle font-mono text-[11px] font-semibold text-brown">숨김</span>}
        </p>
        <span className="font-mono text-[11px] text-ink-soft">{dotDay(r.on)}</span>
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <span
          className={cn(
            "inline-flex h-6 items-center rounded-[4px] border px-1.5 font-mono text-[11px] font-semibold",
            r.send === "sent" ? "border-midnight bg-butter text-midnight" : "border-midnight/40 text-ink-soft",
          )}
        >
          {SEND_LABEL[r.send].en}
        </span>
        <span className="font-mono text-midnight">
          FUN {r.fun}/5 <span className="font-sans text-ink-soft">{FUN_LABEL[r.fun]}</span>
        </span>
        <span className="font-mono text-midnight">
          {FEEL_LABEL[r.feel].en} <span className="font-sans text-ink-soft">{FEEL_LABEL[r.feel].ko}</span>
        </span>
      </p>
      {r.comment && <p className="mt-2 text-[15px] leading-relaxed text-midnight">“{r.comment}”</p>}
      {operator && (
        <ActionForm action={moderateReview} className="mt-2 flex justify-end" confirmText={r.hidden ? "이 후기를 다시 보이게 할까요?" : "이 후기를 숨길까요? 통계에서도 빠져요."}>
          <input type="hidden" name="review_id" value={r.id} />
          <input type="hidden" name="hide" value={r.hidden ? "0" : "1"} />
          <button type="submit" className="h-9 rounded-md border border-midnight/40 px-3 text-[12px] font-bold text-ink-soft hover:border-midnight hover:text-midnight">
            {r.hidden ? "다시 보이기" : "숨기기"}
          </button>
        </ActionForm>
      )}
    </li>
  );
}

function CrewPanel({ id, no, status }: { id: string; no: number; status: "active" | "archived" | "deleted" }) {
  const next: Array<{ to: "active" | "archived" | "deleted"; label: string; confirm: string }> = [
    ...(status === "active" ? [{ to: "archived" as const, label: "Archive", confirm: "보관(ARCHIVED)할까요? 기록은 그대로 남고 새 평가는 받지 않아요." }] : []),
    ...(status !== "active" ? [{ to: "active" as const, label: status === "deleted" ? "Restore" : "Set active", confirm: "ACTIVE로 되돌릴까요?" }] : []),
    ...(status !== "deleted" ? [{ to: "deleted" as const, label: "Delete", confirm: "이 문제를 삭제할까요? 목록에서 사라지지만 기록은 보존돼요(운영진은 되살릴 수 있어요)." }] : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-dashed border-midnight/40 bg-ivory/80 p-3" aria-label="운영진 관리">
      <span className="mr-1 font-label text-[11px] font-bold uppercase tracking-[0.2em] text-brown">Crew</span>
      <Link href={`/problems/${no}/edit`} className="inline-flex h-10 items-center rounded-md border-2 border-midnight bg-butter px-3.5 text-[13px] font-bold text-midnight">
        Edit problem / beta
      </Link>
      {next.map((n) => (
        <ActionForm key={n.to} action={setProblemStatus} confirmText={n.confirm}>
          <input type="hidden" name="problem_id" value={id} />
          <input type="hidden" name="status" value={n.to} />
          <button type="submit" className="inline-flex h-10 items-center rounded-md border-2 border-midnight px-3.5 text-[13px] font-bold text-midnight hover:bg-midnight hover:text-cream">
            {n.label}
          </button>
        </ActionForm>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="문제를 불러오는 중">
      <div className="night h-56" />
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-ivory/60" />
        ))}
      </div>
    </div>
  );
}
