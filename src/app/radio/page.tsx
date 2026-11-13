import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { loadRadio } from "@/server/radio";
import { storeMode } from "@/server/store";
import { RadioStation } from "./radio-station";

export const metadata: Metadata = {
  title: "After Hours Radio",
  description: "A little radio for our little club. 멤버들이 한 곡씩 보태며 쌓아 가는 AFTER CL TO MOON의 음악 목록.",
};

export default function RadioPage() {
  return (
    <>
      <SiteHeader current="radio" />
      <main className="flex-1 bg-midnight text-cream">
        <header className="mx-auto max-w-3xl px-4 pb-8 pt-10 md:px-6 md:pt-14">
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-butter">After hours radio</p>
          <h1 className="mt-2 font-display text-[44px] font-extrabold uppercase leading-[0.9] md:text-[64px]">
            A little radio
            <br />
            for our little club.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-cream/75">
            멤버들이 한 곡씩 보태며 쌓아 가는 우리 클럽의 음악 목록이에요. 시간이 지나면 이 목록이 곧 클럽의 취향이 돼요.
          </p>
          <p className="mt-3 font-label text-[11px] font-semibold uppercase tracking-[0.28em] text-cream/50">Every member has a song.</p>
        </header>
        <Suspense fallback={<RadioSkeleton />}>
          <Station />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Station() {
  if (storeMode() === "unconfigured") {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 text-midnight md:px-6">
        <NotReady />
      </div>
    );
  }
  // Per request (it depends on who is looking); outside the try so prerendering can postpone it.
  await requestNow();
  let state;
  try {
    state = await loadRadio();
  } catch (error) {
    console.error("[radio] load failed", error);
    return <p className="mx-auto max-w-3xl px-4 pb-16 text-[15px] text-cream/75 md:px-6">라디오 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  return <RadioStation initial={state} />;
}

function RadioSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-16 md:px-6" aria-busy="true" aria-label="라디오를 불러오는 중">
      <div className="h-40 animate-pulse rounded-xl bg-white/10" />
      <div className="h-64 animate-pulse rounded-xl bg-white/5" />
      <div className="h-96 animate-pulse rounded-xl bg-white/5" />
    </div>
  );
}
