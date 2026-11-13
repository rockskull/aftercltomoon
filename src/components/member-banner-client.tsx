"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { BannerKind } from "@/lib/access";
import { ArrowRight } from "./ui";

const COPY: Record<BannerKind, { eyebrow: string; body: string; cta: string; href: string }> = {
  renew: {
    eyebrow: "Renew your moon",
    body: "다음 달 이용 등록이 아직 확인되지 않았습니다. 이번 달 말일까지 다음 달 회비를 납부해 주세요.",
    cta: "View membership",
    href: "/me",
  },
  renew_pending: {
    eyebrow: "Checking your deposit",
    body: "다음 달 회비 입금을 운영진이 확인하고 있어요. 확인되면 이 안내는 사라져요.",
    cta: "View membership",
    href: "/me",
  },
  expired: {
    eyebrow: "Membership required",
    body: "현재 이용 등록이 확인되지 않았습니다. 클럽 참여 기능을 이용하려면 회원권을 먼저 등록해 주세요.",
    cta: "Register membership",
    href: "/me#apply",
  },
  pending: {
    eyebrow: "Checking your deposit",
    body: "입금·등록을 운영진이 확인하고 있어요. 확인되면 클럽 참여 기능을 이용할 수 있어요.",
    cta: "View membership",
    href: "/me",
  },
  starts: {
    eyebrow: "See you soon",
    body: "회원권 이용 시작일 전이에요. 시작일부터 클럽 참여 기능을 이용할 수 있어요.",
    cta: "View membership",
    href: "/me",
  },
};

const EVENT = "acm-banner";
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
};
const isDismissed = (key: string) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

/**
 * A notice that can be closed — not a popup. Closing it hides this kind of
 * notice for the rest of the month on this device; next month it can return.
 */
export function MemberBannerView({ kind, monthKey, startsOn }: { kind: BannerKind; monthKey: string; startsOn: string | null }) {
  const key = `acm:banner:${kind}:${monthKey}`;
  const dismissed = useSyncExternalStore(subscribe, () => isDismissed(key), () => false);
  if (dismissed) return null;
  const copy = COPY[kind];
  const body = kind === "starts" && startsOn ? `회원권이 ${Number(startsOn.slice(5, 7))}월 ${Number(startsOn.slice(8, 10))}일부터 시작돼요. 그날부터 클럽 참여 기능을 이용할 수 있어요.` : copy.body;
  const urgent = kind === "expired";

  return (
    <aside aria-label="회원권 안내" className={urgent ? "border-b-2 border-midnight bg-[#f3c1a3] text-midnight" : "border-b-2 border-midnight bg-butter text-midnight"}>
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 md:px-6">
        <div className="min-w-0 flex-1">
          <p className="font-label text-[11px] font-semibold uppercase tracking-[0.24em]">{copy.eyebrow}</p>
          <p className="mt-0.5 text-[14px] font-medium leading-snug">{body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={copy.href}
            className="inline-flex h-10 items-center gap-1.5 rounded-[6px] border-2 border-midnight bg-ivory px-3.5 font-label text-[12px] font-semibold uppercase tracking-[0.14em] hover:bg-midnight hover:text-cream"
          >
            {copy.cta}
            <ArrowRight />
          </Link>
          <button
            type="button"
            aria-label="안내 닫기 (이번 달 동안)"
            onClick={() => {
              try {
                localStorage.setItem(key, "1");
              } catch {}
              window.dispatchEvent(new Event(EVENT));
            }}
            className="grid size-10 place-items-center rounded-[6px] border-2 border-midnight/40 text-[18px] leading-none hover:border-midnight"
          >
            ×
          </button>
        </div>
      </div>
    </aside>
  );
}
