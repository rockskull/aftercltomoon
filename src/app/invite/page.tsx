import type { Metadata } from "next";
import { Suspense } from "react";
import logo from "@/assets/brand/logo.jpg";
import { InvitationCard } from "@/components/invitation-card";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowUpRight, buttonPrimary, cn } from "@/components/ui";
import { CONSENT_DEFAULTS } from "@/lib/consent";
import { INVITATION, INVITATION_SHARE } from "@/lib/invitation";
import { getConsentLinks } from "@/server/consent";
import { InviteActions } from "./invite-actions";

const description = `${INVITATION.lead} ${INVITATION.body.join(" ")}`;

export const metadata: Metadata = {
  title: "Invitation",
  description,
  openGraph: { title: INVITATION_SHARE.title, description },
};

/**
 * A static, public invitation. Nothing is issued or recorded: no invite codes,
 * no sign-up, no data. Anyone with the link can open it without logging in.
 */
export default function InvitePage() {
  return (
    <>
      <SiteHeader />
      <main className="paper flex-1">
        <div className="mx-auto max-w-3xl px-4 pb-14 pt-8 md:px-6 md:pb-20 md:pt-12">
          <div className="mx-auto max-w-[440px]">
            <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">Invitation</p>
            <h1 className="mt-1.5 font-display text-[44px] font-extrabold uppercase leading-[0.9] text-midnight">Pass it on.</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">함께하고 싶은 사람에게 이 초대장을 전해 주세요.</p>
          </div>

          <InvitationCard className="mt-7" />

          <div className="mt-8">
            <InviteActions logoSrc={logo.src} />
          </div>

          {/* Defaults render instantly; a form link changed in the Settings tab replaces them. */}
          <Suspense fallback={<BeforeYouVisit dailyUrl={CONSENT_DEFAULTS.daily} />}>
            <BeforeYouVisitFromSettings />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function BeforeYouVisitFromSettings() {
  return <BeforeYouVisit dailyUrl={(await getConsentLinks()).daily} />;
}

const STEPS = [
  {
    title: "방문할 날을 먼저 정해요",
    body: "초대해 준 멤버나 운영진과 이야기해서 오실 날짜와 시간을 정해 주세요. 작은 공간이라 미리 약속한 분만 맞이하고 있어요.",
  },
  {
    title: "일일 이용 동의서에 동의해 주세요",
    body: "초대에 응하시려면 일일 이용 동의서에 꼭 동의해 주셔야 해요. 개인정보 수집·이용, 시설 이용과 안전수칙, 홈캠 안내가 담겨 있고, 방문하는 날마다 작성해요.",
  },
  {
    title: "이용 조건은 운영진이 알려 드려요",
    body: "체험비 같은 자세한 이용 조건은 운영진이 따로 안내해 드려요. 궁금한 건 초대해 준 멤버에게 편하게 물어보세요.",
  },
];

/** What to do before coming: it's an introduction, not a ticket; the daily consent form is required. */
function BeforeYouVisit({ dailyUrl }: { dailyUrl: string }) {
  return (
    <section
      aria-labelledby="visit-title"
      className="mx-auto mt-8 max-w-[440px] rounded-lg border-2 border-midnight bg-ivory p-5 shadow-[4px_4px_0_0_var(--color-midnight)]"
    >
      <p className="font-label text-[11px] font-semibold uppercase tracking-[0.28em] text-brown">Before you visit</p>
      <h2 id="visit-title" className="mt-1 text-[20px] font-extrabold text-midnight">
        초대에 응하기 전에 확인해 주세요
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        이 초대장은 우리 클럽을 소개하는 안내장이에요. 입장권이나 이용 확정은 아니니, 오고 싶다면 아래 순서대로 준비해 주세요.
      </p>

      <ol className="mt-4 flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-midnight bg-butter font-mono text-[13px] font-bold text-midnight"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-midnight">{step.title}</p>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-soft">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <a
        href={dailyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonPrimary, "mt-5 w-full normal-case tracking-normal")}
      >
        <span className="font-sans text-[15px] font-bold">일일 이용 동의서 작성</span>
        <ArrowUpRight />
        <span className="sr-only">(새 창에서 Google 설문 열기)</span>
      </a>
      <p className="mt-2 text-center text-[12px] leading-relaxed text-ink-soft">
        Google 설문이라 로그인 없이 작성할 수 있고, 응답은 운영진만 볼 수 있어요.
      </p>
      <p className="mt-4 border-t border-dashed border-midnight/25 pt-3 text-center text-[13px] font-medium text-midnight">
        준비가 끝나면, 아지트에서 만나요!
      </p>
    </section>
  );
}
