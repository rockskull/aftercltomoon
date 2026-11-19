"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { clockText } from "@/lib/little-club";

/**
 * THE LITTLE CLUB after the 4 minutes: the wait before coming back (10 minutes, decided on the
 * server). With `shot` it is the moment the game sent the person out — the only time a screenshot
 * of the game is made by itself; coming back during the wait shows the countdown only.
 */
export function ClubWait({ until, serverNow, shot }: { until: number; serverNow: number; shot?: { url: string; filename: string } | null }) {
  const [left, setLeft] = useState(until - serverNow);
  useEffect(() => {
    // Count on this device's clock from the server's numbers (the server still decides at the door).
    const deadline = Date.now() + (until - serverNow);
    const id = window.setInterval(() => setLeft(deadline - Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until, serverNow]);
  const open = left <= 0;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 md:px-6">
      <div className="rounded-md border-2 border-cream/25 bg-midnight-800 p-5 text-cream sm:p-6">
        <p className="font-label text-[11px] font-semibold uppercase tracking-[0.24em] text-butter">{shot ? "Time's up · 4 minutes" : "Resting · back soon"}</p>
        <h2 className="mt-2 font-display text-[32px] font-extrabold uppercase leading-none sm:text-[40px]">{shot ? "오늘은 여기까지." : "잠깐 쉬는 중."}</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-cream/80">
          {shot ? "4분이 다 돼서 리틀 클럽에서 나왔어요. 방금 화면을 PNG로 남겼어요." : "리틀 클럽은 한 번에 4분, 끝나면 10분 쉬었다가 다시 들어올 수 있어요."}
        </p>

        {shot && (
          <figure className="mt-4">
            <Image src={shot.url} alt="4분이 끝날 때의 리틀 클럽 화면" width={1024} height={640} unoptimized className="h-auto w-full rounded-sm border border-cream/25 [image-rendering:pixelated]" />
            <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-cream/60">
              <span>이 기기에 저장됐어요. 안 보이면 다시 저장하거나, 휴대폰에서는 사진을 길게 눌러 저장해 주세요.</span>
              <a href={shot.url} download={shot.filename} className="rounded-sm bg-butter px-3 py-1.5 text-[12px] font-bold text-midnight">
                PNG 다시 저장
              </a>
            </figcaption>
          </figure>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-cream/15 pt-4">
          {open ? (
            // A full page load, so the server checks the wait again at the door.
            <a href="/little-club#play" className="rounded-sm bg-butter px-4 py-2 text-[13px] font-bold text-midnight">
              다시 들어가기
            </a>
          ) : (
            <p className="font-mono text-[15px] text-cream" aria-live="polite">
              다시 들어오기까지 <b className="text-butter">{clockText(left)}</b>
            </p>
          )}
          <Link href="/problems" className="text-[13px] text-cream/75 underline">
            MOON PROBLEMS 보기
          </Link>
          <Link href="/" className="text-[13px] text-cream/75 underline">
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
