import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { InstallHint } from "@/components/client-bits";
import { ClubNotice } from "@/components/club-notice";
import { MemberBanner } from "@/components/member-banner";
import { dotDate, MembershipCard, summarizeMembership } from "@/components/membership-card";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowRight, cn, NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { toDateKey } from "@/lib/dates";
import { membershipPhase, totalMonths } from "@/lib/membership";
import { isOperator, requireViewer } from "@/server/auth/viewer";
import type { Payment } from "@/server/domain/model";
import { memberStamps } from "@/server/domain/stamps";
import { readTables, storeMode } from "@/server/store";
import { STAMP_TABLES } from "@/server/store/schema";
import logo from "@/assets/brand/logo.jpg";
import { ApplyForm, ConsentConfirm } from "./apply-form";
import { MoonStamps } from "./moon-stamps";

export const metadata: Metadata = { title: "My membership", robots: { index: false } };

export default function MePage() {
  return (
    <>
      <SiteHeader current="me" />
      <main className="paper flex-1">
        <Suspense fallback={null}>
          <MemberBanner />
        </Suspense>
        <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
          <Suspense fallback={<MeSkeleton />}>
            <MyMembership />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

const PAYMENT_LABEL: Record<Payment["status"], string> = {
  pending: "입금 확인 대기",
  matched: "입금 확인 중",
  approved: "승인 완료",
  rejected: "반려",
  refunded: "환불",
};

async function MyMembership() {
  if (storeMode() === "unconfigured") return <NotReady />;
  const now = await requestNow();
  const viewer = await requireViewer("/me");
  const { member, club, session } = viewer;
  const todayKey = toDateKey(now);

  const summary = summarizeMembership({
    memberId: member?.id ?? null,
    memberships: club.memberships,
    payments: club.payments,
    plans: club.plans,
    todayKey,
  });
  const myPayments = club.payments
    .filter((p) => p.memberId === member?.id)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const myMemberships = club.memberships
    .filter((m) => m.memberId === member?.id)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const planName = (id: string) => club.plans.find((p) => p.id === id)?.name ?? id;
  const activePlans = club.plans.filter((p) => p.active);
  const inactive = member?.status === "inactive";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">My membership</p>
          <h1 className="mt-1 text-[24px] font-extrabold text-midnight">{member?.name ?? session.name}님</h1>
          <p className="font-mono text-[12px] text-ink-soft">{session.email}</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="h-10 font-label text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft underline underline-offset-4 hover:text-midnight">
            Logout
          </button>
        </form>
      </div>

      <MembershipCard member={member} summary={summary} />

      {summary.pending && (
        <ApplicationReceived payment={summary.pending} planName={planName(summary.pending.planId)} notice={club.settings.applyNotice} />
      )}

      {member && summary.current && (
        <Panel title="이용 정보">
          <dl className="divide-y divide-plywood-400 text-[15px]">
            <Row label="회원권">{planName(summary.current.planId)}</Row>
            <Row label="이용 시작일">
              <span className="font-mono">{dotDate(summary.current.startDate)}</span>
            </Row>
            <Row label="만료일">
              <span className="font-mono">{dotDate(summary.validUntil ?? summary.current.endDate)}</span>
              {summary.validUntil && summary.validUntil !== summary.current.endDate && (
                <span className="ml-2 text-[13px] text-ink-soft">(연장분 포함)</span>
              )}
            </Row>
            <Row label="남은 이용일">
              <span className="font-mono">{summary.phase === "active" ? `${summary.daysLeft}일` : "—"}</span>
            </Row>
            <Row label="회비 납부">{myPayments[0] ? PAYMENT_LABEL[myPayments[0].status] : "—"}</Row>
          </dl>
        </Panel>
      )}

      {member && !member.consentAt && !inactive && (
        // Registration starts here for members without a confirmed consent form (REGISTER MEMBERSHIP → /me#apply).
        <div id="apply" className="scroll-mt-4">
        <Panel title="회원 등록 동의서">
          <p className="mb-4 text-[14px] leading-relaxed text-ink-soft">
            아직 회원 등록 동의서 제출이 확인되지 않았어요. 동의서를 제출하고 확인해 주세요. 확인 후 회원권을 신청·연장할 수 있어요.
          </p>
          <ConsentConfirm url={club.settings.consent.member} />
        </Panel>
        </div>
      )}

      {inactive ? (
        <p className="rounded-md border-2 border-brown bg-ivory px-4 py-3 text-[14px] text-brown">
          이용이 중지된 계정이에요. 운영진에게 문의해 주세요.
        </p>
      ) : (
        !summary.pending &&
        activePlans.length > 0 &&
        (!member || member.consentAt) && (
          <div id="apply" className="scroll-mt-4">
          <Panel title={summary.phase === "active" || summary.phase === "scheduled" ? "회원권 연장 신청" : "회원권 신청"}>
            <p className="mb-5 text-[14px] leading-relaxed text-ink-soft">
              신청하면 운영진에게 전달돼요. 회비와 납부 방법은 회원 등록 동의서와 크루 단톡방 안내를 따라 주세요. 운영진이 확인하면
              회원권이 시작되고 알림을 보내드려요.
            </p>
            <ApplyForm
              plans={activePlans.map((p) => ({
                id: p.id,
                name: p.name,
                totalMonths: totalMonths(p),
                bonusMonths: p.bonusMonths,
                description: p.description,
              }))}
              isExtension={summary.phase === "active" || summary.phase === "scheduled"}
              defaultName={session.name}
              defaultDepositor={member?.depositorName || member?.name || session.name}
              needsName={!member}
              today={todayKey}
              consentUrl={member ? null : club.settings.consent.member}
            />
          </Panel>
          </div>
        )
      )}

      <ClubNotice headingId="me-notice-title" />


      {(myMemberships.length > 0 || myPayments.length > 0) && (
        <Panel title="기록">
          <ul className="flex flex-col gap-2 text-[14px]">
            {myMemberships.map((m) => (
              <li key={m.id} className={cn("flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-ivory px-3 py-2.5", m.status !== "active" && "opacity-60")}>
                <span className="font-medium">
                  {planName(m.planId)} 회원권
                  <span className="ml-2 font-mono text-[11px] uppercase text-ink-soft">{membershipPhase(m, todayKey)}</span>
                </span>
                <span className="font-mono text-[13px] text-ink-soft">
                  {dotDate(m.startDate)} – {dotDate(m.endDate)}
                </span>
              </li>
            ))}
            {myPayments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-dashed border-midnight/20 px-3 py-2.5">
                <span>{planName(p.planId)} 회원권 신청</span>
                <span className="text-[13px] text-ink-soft">
                  {PAYMENT_LABEL[p.status]}
                  {p.depositedAt && <span className="ml-1.5 font-mono">{dotDate(p.depositedAt)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {member && (
        <Suspense fallback={<Panel title="My Moon Stamps"><div className="h-40 animate-pulse rounded-md bg-ivory/60" /></Panel>}>
          <MyMoonStamps memberId={member.id} />
        </Suspense>
      )}

      <InstallHint />

      <nav aria-label="회원 메뉴" className="flex flex-col divide-y divide-plywood-400 rounded-lg border-2 border-midnight bg-ivory">
        <MenuLink href="/notifications">알림 목록 · 알림 설정</MenuLink>
        {isOperator(member) && <MenuLink href="/admin">운영진 관리 화면</MenuLink>}
      </nav>
    </div>
  );
}

/**
 * MY MOON STAMPS. `memberId` comes from the signed-in session resolved against the
 * Members tab (never from the request), and only this member's stamps leave the
 * server — without the award ids, who issued them, or the operators' notes.
 */
async function MyMoonStamps({ memberId }: { memberId: string }) {
  let stamps;
  try {
    stamps = memberStamps(await readTables(STAMP_TABLES), memberId);
  } catch (error) {
    console.error("[stamps] could not load", error);
    return null;
  }
  return (
    <Panel title="My Moon Stamps">
      <MoonStamps stamps={stamps} logoSrc={logo.src} />
    </Panel>
  );
}

/**
 * Shown after applying. Deliberately no account number and no amount: fees are
 * announced in the crew chat / consent form, not requested on the site.
 */
function ApplicationReceived({ payment, planName, notice }: { payment: Payment; planName: string; notice: string }) {
  return (
    <section aria-labelledby="applied-title" className="rounded-lg border-2 border-midnight bg-butter-200/70 p-5 shadow-[4px_4px_0_0_var(--color-midnight)]">
      <p className="font-label text-[11px] font-semibold uppercase tracking-[0.28em] text-brown">Application</p>
      <h2 id="applied-title" className="mt-1 text-[19px] font-extrabold text-midnight">
        회원권 신청이 접수됐어요
      </h2>
      <dl className="mt-4 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[15px]">
        <dt className="text-ink-soft">회원권</dt>
        <dd className="font-semibold text-midnight">{planName}</dd>
        <dt className="text-ink-soft">확인용 이름</dt>
        <dd className="font-semibold text-midnight">{payment.depositorName}</dd>
        <dt className="text-ink-soft">상태</dt>
        <dd className="text-midnight">{PAYMENT_LABEL[payment.status]}</dd>
      </dl>
      {notice && <p className="mt-4 text-[13px] leading-relaxed text-brown">{notice}</p>}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border-2 border-midnight bg-ivory/80 p-5">
      <h2 className="mb-4 border-b-2 border-midnight pb-2 text-[18px] font-extrabold text-midnight">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-2.5">
      <dt className="text-[13px] font-medium text-ink-soft">{label}</dt>
      <dd className="text-midnight">{children}</dd>
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex h-14 items-center justify-between px-4 text-[15px] font-semibold text-midnight hover:bg-butter-200/50">
      {children}
      <ArrowRight className="size-4" />
    </Link>
  );
}

function MeSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="회원 정보를 불러오는 중">
      <div className="h-16 w-48 animate-pulse rounded bg-ivory/60" />
      <div className="h-[260px] animate-pulse rounded-xl bg-midnight/80" />
      <div className="h-40 animate-pulse rounded-lg bg-ivory/60" />
    </div>
  );
}
