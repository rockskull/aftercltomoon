import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { requireOperator } from "@/server/auth/viewer";
import { loadProblem, loadProblemList } from "@/server/problems";
import { storeMode } from "@/server/store";
import { ProblemForm } from "../../problem-form";

export const metadata: Metadata = { title: "Edit problem", robots: { index: false } };

/** Crew only: the problem's info, the setter's note and the beta / tips. */
export default function EditProblemPage({ params }: PageProps<"/problems/[id]/edit">) {
  return (
    <>
      <SiteHeader />
      <main className="paper flex-1">
        <div className="mx-auto max-w-2xl px-4 py-8 md:px-6 md:py-12">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-ivory/60" />}>
            <EditForm params={params} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function EditForm({ params }: Pick<PageProps<"/problems/[id]/edit">, "params">) {
  if (storeMode() === "unconfigured") return <NotReady />;
  const { id } = await params;
  await requestNow();
  await requireOperator(`/problems/${id}/edit`);
  const [loaded, list] = await Promise.all([loadProblem(decodeURIComponent(id)), loadProblemList()]);
  if (!loaded) notFound();
  const p = loaded.problem;
  return (
    <>
      <Link href={`/problems/${p.no}`} className="font-label text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-soft hover:text-midnight">
        ← {p.code}
      </Link>
      <p className="mt-4 font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">Moon problems · crew</p>
      <h1 className="mt-1 font-display text-[44px] font-extrabold uppercase leading-[0.9] text-midnight">Edit {p.code}</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">번호와 등록일은 바뀌지 않아요. 상태(보관·삭제)는 문제 화면의 Crew 버튼으로 바꿔요.</p>
      <div className="mt-6 rounded-lg border-2 border-midnight bg-ivory p-4 shadow-[4px_4px_0_0_var(--color-midnight)] md:p-6">
        <ProblemForm
          values={{ id: p.id, title: p.title, grade: p.grade, wall: p.wall, setterName: p.setterName, setterNote: p.setterNote, beta: p.beta }}
          grades={list.grades}
        />
      </div>
    </>
  );
}
