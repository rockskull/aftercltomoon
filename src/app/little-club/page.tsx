import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MembershipRequired } from "@/components/membership-required";
import { SiteFooter, SiteHeader } from "@/components/site";
import { Logo, NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { littleClubGate, loadLittleClub } from "@/server/little-club";
import { storeMode } from "@/server/store";
import { ClubWait } from "./club-wait";
import { LittleClub } from "./little-club";

export const metadata: Metadata = {
  title: "The Little Club",
  description: "AFTER HOURS — 로그인하면 들어오는 작은 픽셀 아지트.",
  robots: { index: false, follow: false },
};

/**
 * THE LITTLE CLUB (anyone signed in, except suspended accounts). The gate runs
 * here on the server before anything of the game or the visitor's data is sent;
 * the profile save re-checks it against the live data. Within the 10-minute wait
 * after a 4-minute play window the page shows the wait instead of the game.
 */
export default function LittleClubPage() {
  return (
    <>
      <SiteHeader current="me" />
      <main className="flex-1 bg-midnight text-cream">
        <header className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 pb-6 pt-8 md:px-6 md:pt-10">
          <div>
            <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-butter">After hours · our little club</p>
            <h1 className="mt-2 font-display text-[44px] font-extrabold uppercase leading-[0.9] md:text-[60px]">
              The Little Club<span className="text-butter">.</span>
            </h1>
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-cream/75">올라가고, 음악을 고르고, 잠시 머물고. 밤이 되면 모닥불 앞으로.</p>
          </div>
          <Logo className="logo-blend hidden h-16 w-auto sm:block" sizes="128px" />
        </header>
        <Suspense fallback={<ClubSkeleton />}>
          <Club />
        </Suspense>
        <p className="mx-auto max-w-6xl px-4 pb-10 text-[11px] leading-relaxed text-cream/45 md:px-6">
          실제 공간을 모티프로 한 픽셀아트 해석이에요. 시공 도면이나 실측 배치가 아니에요. 배경음악: The Little Club OST (오리지널 8-bit).
        </p>
      </main>
      <SiteFooter />
    </>
  );
}

async function Club() {
  if (storeMode() === "unconfigured") {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 text-midnight md:px-6">
        <NotReady />
      </div>
    );
  }
  const now = await requestNow();
  const gate = await littleClubGate();
  if (!gate.ok) {
    if (gate.reason === "login") redirect("/login?returnTo=%2Flittle-club");
    return (
      <div className="mx-auto max-w-xl px-4 pb-16 md:px-6">
        <MembershipRequired reason="suspended" tone="dark" />
      </div>
    );
  }
  const data = await loadLittleClub(gate.viewer, gate.member, gate.profileKey, now);
  // Back within the 10 minutes after a play window: the wait, not the game (the APIs refuse too).
  if (data.play.phase === "cooldown") return <ClubWait until={data.play.until} serverNow={now} />;
  return <LittleClub data={data} />;
}

function ClubSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 pb-16 md:px-6 lg:grid-cols-[minmax(0,1fr)_280px]" aria-busy="true" aria-label="리틀 클럽을 여는 중">
      <div className="aspect-[512/320] w-full animate-pulse rounded-md bg-white/10" />
      <div className="h-80 animate-pulse rounded-md bg-white/5" />
    </div>
  );
}
