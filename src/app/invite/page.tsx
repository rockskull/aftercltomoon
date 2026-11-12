import type { Metadata } from "next";
import Link from "next/link";
import logo from "@/assets/brand/logo.jpg";
import { InvitationCard } from "@/components/invitation-card";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowRight } from "@/components/ui";
import { INVITATION, INVITATION_SHARE } from "@/lib/invitation";
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

          <section
            aria-labelledby="visit-title"
            className="mx-auto mt-8 max-w-[440px] rounded-lg border border-dashed border-midnight/35 bg-ivory/60 px-4 py-4"
          >
            <h2 id="visit-title" className="font-label text-[11px] font-semibold uppercase tracking-[0.28em] text-brown">
              Before you visit
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-midnight">
              초대장은 입장권이나 이용 확정이 아니에요. 방문하기 전에 초대해 준 멤버나 운영진과 꼭 먼저 이야기해 주세요. 체험비 등
              이용 조건은 운영진이 안내해 드려요.
            </p>
            <Link
              href="/consent"
              className="mt-3 inline-flex h-10 items-center gap-1.5 text-[14px] font-bold text-midnight underline underline-offset-4"
            >
              방문 전 · 일일 이용 동의서
              <ArrowRight />
            </Link>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
