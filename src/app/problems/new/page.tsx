import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { requireOperator } from "@/server/auth/viewer";
import { storeMode } from "@/server/store";
import { ProblemForm } from "../problem-form";

export const metadata: Metadata = { title: "New problem", robots: { index: false } };

/** Crew only (others get a 404, like the admin area). */
export default function NewProblemPage() {
  return (
    <>
      <SiteHeader current="problems" />
      <main className="paper flex-1">
        <div className="mx-auto max-w-2xl px-4 py-8 md:px-6 md:py-12">
          <Link href="/problems" className="font-label text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-soft hover:text-midnight">
            ← All problems
          </Link>
          <p className="mt-4 font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">Moon problems · crew</p>
          <h1 className="mt-1 font-display text-[44px] font-extrabold uppercase leading-[0.9] text-midnight">New problem</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">벽에서 완성된 문제의 정보만 등록해요. 사진·홀드 표시는 받지 않아요.</p>
          <div className="mt-6 rounded-lg border-2 border-midnight bg-ivory p-4 shadow-[4px_4px_0_0_var(--color-midnight)] md:p-6">
            <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-white/40" />}>
              <NewForm />
            </Suspense>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function NewForm() {
  if (storeMode() === "unconfigured") return <NotReady />;
  await requestNow();
  await requireOperator("/problems/new");
  return <ProblemForm values={{ title: "", grade: "", wall: "", setterName: "", setterNote: "", beta: "" }} />;
}
