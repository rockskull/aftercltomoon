import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowRight, buttonPrimaryOnDark, cn, NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { loadProblemList, problemViewer } from "@/server/problems";
import { storeMode } from "@/server/store";
import { gradeLabel } from "@/lib/problems";
import { GradeBadge, ProblemCardView } from "./problem-ui";

export const metadata: Metadata = {
  title: "Moon Problems",
  description: "SET BY US. CLIMBED BY US. AFTER CL TO MOON의 벽에서 만든 볼더링 문제와 멤버들의 기록.",
};

export default function ProblemsPage({ searchParams }: PageProps<"/problems">) {
  return (
    <>
      <SiteHeader current="problems" />
      <main className="flex-1">
        <header className="night text-cream">
          <div className="mx-auto max-w-6xl px-4 pb-10 pt-10 md:px-6 md:pt-14">
            <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-butter">Moon problems</p>
            <h1 className="mt-2 font-display text-[46px] font-extrabold uppercase leading-[0.88] md:text-[72px]">
              Set by us.
              <br />
              Climbed by us.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-cream/75">
              문제는 벽에서 만들고, 기록은 여기에 남겨요. 운영진이 완성된 문제를 정리하고, 멤버들은 각자의 경험을 더해요.
            </p>
            <Suspense fallback={null}>
              <CrewButton />
            </Suspense>
          </div>
        </header>
        <section className="paper min-h-[40vh]">
          <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
            <Suspense fallback={<ListSkeleton />}>
              <ProblemList searchParams={searchParams} />
            </Suspense>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

async function CrewButton() {
  if (storeMode() === "unconfigured") return null;
  await requestNow();
  try {
    if (!(await problemViewer()).operator) return null;
  } catch {
    return null;
  }
  return (
    <Link href="/problems/new" className={`${buttonPrimaryOnDark} mt-6 w-full sm:w-auto`}>
      + New problem
      <ArrowRight />
    </Link>
  );
}

async function ProblemList({ searchParams }: { searchParams: PageProps<"/problems">["searchParams"] }) {
  if (storeMode() === "unconfigured") return <NotReady />;
  await requestNow();
  const sp = await searchParams;
  const grade = typeof sp.grade === "string" ? sp.grade : "";
  let list;
  try {
    list = await loadProblemList();
  } catch (error) {
    console.error("[problems] load failed", error);
    return <p className="text-[15px] text-ink-soft">문제 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  const shown = grade ? list.problems.filter((p) => p.grade === grade) : list.problems;

  return (
    <div className="flex flex-col gap-6">
      {list.grades.length > 0 && (
        <nav aria-label="난이도 필터" className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-soft">Grade</span>
          {["", ...list.grades].map((g) => {
            const on = g === grade;
            return (
              <Link
                key={g || "all"}
                href={g ? `/problems?grade=${encodeURIComponent(g)}` : "/problems"}
                aria-current={on ? "true" : undefined}
                title={g ? gradeLabel(g) : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-md border-2 px-3 text-[13px] font-semibold",
                  on ? "border-midnight bg-butter text-midnight shadow-[2px_2px_0_0_var(--color-midnight)]" : "border-midnight/25 bg-ivory text-midnight hover:border-midnight",
                )}
              >
                {g ? <GradeBadge grade={g} yds={false} /> : <span className="font-mono">ALL</span>}
              </Link>
            );
          })}
        </nav>
      )}

      {shown.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-midnight/30 bg-ivory/70 px-5 py-10 text-center">
          <p className="font-display text-[30px] font-extrabold uppercase leading-none text-midnight">{grade ? "No problems" : "Coming soon"}</p>
          <p className="mt-2 text-[14px] text-ink-soft">{grade ? `${gradeLabel(grade)} 문제가 아직 없어요.` : "아직 등록된 문제가 없어요. 벽에서 문제가 완성되면 운영진이 여기에 올려요."}</p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id}>
              <ProblemCardView problem={p} />
            </li>
          ))}
        </ul>
      )}

      {list.deleted.length > 0 && (
        <details className="rounded-lg border-2 border-dashed border-brown/40 bg-ivory/70 p-4">
          <summary className="cursor-pointer text-[14px] font-bold text-brown">삭제한 문제 {list.deleted.length}개 (운영진만 보여요)</summary>
          <ul className="mt-3 flex flex-col gap-2 text-[14px]">
            {list.deleted.map((p) => (
              <li key={p.id}>
                <Link href={`/problems/${p.no}`} className="font-medium text-midnight underline underline-offset-4">
                  {p.code} — {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="문제를 불러오는 중">
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-[220px] animate-pulse rounded-lg border-2 border-midnight/20 bg-ivory/60" />
      ))}
    </ul>
  );
}
