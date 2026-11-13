import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { dotDate } from "@/components/membership-card";
import { SiteFooter, SiteHeader } from "@/components/site";
import { cn, NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { toDateKey } from "@/lib/dates";
import { chatHint, memberAccess, type ChatHint, type MemberAccess } from "@/lib/access";
import { accessUntil } from "@/lib/membership";
import { can } from "@/lib/permissions";
import { requireOperator } from "@/server/auth/viewer";
import { daysUntil } from "@/server/domain/operations";
import { storeMode } from "@/server/store";
import { addMember } from "../actions";
import { ActionForm } from "../admin-ui";
import { AdminFrame, AdminSkeleton, Pill, smallInput, smallPrimary } from "../shared";

export const metadata: Metadata = { title: "회원", robots: { index: false } };

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "active", label: "이용 중" },
  { key: "expiring", label: "만료 예정" },
  { key: "expired", label: "만료" },
  { key: "applicant", label: "신청자" },
  { key: "renewal", label: "갱신 예정" },
  { key: "chat", label: "단톡방 확인" },
  { key: "staff", label: "운영진" },
] as const;

/** One label per member, from the same rule the site uses for access (src/lib/access.ts). */
function stateLabel(a: MemberAccess): { text: string; tone: "ok" | "warn" | "muted" | "default" } {
  if (a.blockReason === "suspended") return { text: "이용 중지", tone: "muted" };
  if (a.validUntil) {
    if (a.status === "RENEWAL_DUE") return { text: "갱신 예정", tone: "warn" };
    if (a.status === "PENDING") return { text: "이용 중 · 다음 달 입금 확인 중", tone: "default" };
    return { text: "이용 중", tone: "ok" };
  }
  if (a.status === "PENDING") return { text: a.lastEnded ? "재등록 확인 대기" : "등록 확인 대기", tone: "warn" };
  if (a.startsOn) return { text: `시작 전 · ${dotDate(a.startsOn)}`, tone: "default" };
  if (a.lastEnded) return { text: "만료", tone: "muted" };
  return { text: "회원권 없음", tone: "muted" };
}

const CHAT_LABEL: Record<Exclude<ChatHint, null>, string> = {
  remove: "단톡방 정리 확인",
  invite: "단톡방 초대 확인",
  reinvite: "단톡방 재초대 확인",
};

export default function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <Members searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Members({ searchParams }: Pick<PageProps<"/admin/members">, "searchParams">) {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  const now = await requestNow();
  const { club, member: me } = await requireOperator("/admin/members");
  const isAdmin = me.role === "admin";
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().toLowerCase();
  const filter = typeof params.filter === "string" ? params.filter : "all";
  const todayKey = toDateKey(now);

  const rows = club.members
    .map((member) => {
      const until = accessUntil(club.memberships.filter((m) => m.memberId === member.id), todayKey);
      const lastEnd = club.memberships
        .filter((m) => m.memberId === member.id && m.status === "active")
        .map((m) => m.endDate)
        .sort()
        .at(-1);
      const pending = club.payments.some((p) => p.memberId === member.id && (p.status === "pending" || p.status === "matched"));
      const access = memberAccess({ member, memberships: club.memberships, payments: club.payments, todayKey });
      const chat = chatHint({ access, memberships: club.memberships, memberId: member.id, todayKey });
      return { member, until, lastEnd, pending, left: until ? daysUntil(todayKey, until) : null, access, chat };
    })
    .filter(({ member, until, left, access, chat }) => {
      if (q && ![member.name, member.email, member.depositorName, member.id].some((v) => v.toLowerCase().includes(q))) return false;
      switch (filter) {
        case "active":
          return until !== null;
        case "expiring":
          return left !== null && left <= 14;
        case "expired":
          return until === null && member.status === "active";
        case "applicant":
          return member.status === "applicant";
        case "renewal":
          return access.status === "RENEWAL_DUE" || access.status === "PENDING";
        case "chat":
          return chat !== null;
        case "staff":
          return member.role !== "member";
        default:
          return true;
      }
    })
    .sort((a, b) => (a.until ?? "9999").localeCompare(b.until ?? "9999") || a.member.name.localeCompare(b.member.name));

  return (
    <AdminFrame tab="members" title="Members" who={me}>
      <form className="flex flex-wrap items-center gap-2" role="search">
        <input type="hidden" name="filter" value={filter} />
        <input name="q" defaultValue={q} placeholder="이름, 이메일, 입금자명" aria-label="회원 검색" className={cn(smallInput, "min-w-0 flex-1 sm:max-w-xs")} />
        <button type="submit" className="h-10 rounded-md border-2 border-midnight px-3.5 text-[13px] font-bold">
          검색
        </button>
      </form>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <li key={f.key}>
            <Link
              href={`/admin/members?filter=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              aria-current={filter === f.key ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-full border-2 px-3 text-[13px] font-bold",
                filter === f.key ? "border-midnight bg-midnight text-cream" : "border-midnight/25 text-midnight",
              )}
            >
              {f.label}
            </Link>
          </li>
        ))}
      </ul>

      {!can(me, "members") && (
        <p className="mt-4 text-[13px] text-ink-soft">회원 상태 확인과 스탬프 발급은 운영자도 할 수 있어요. 회원 추가·정보 수정·회원권·회비는 admin이 맡아요.</p>
      )}
      {can(me, "members") && (
      <details className="mt-4 rounded-lg border-2 border-dashed border-midnight/30 bg-ivory/70 p-3">
        <summary className="cursor-pointer text-[14px] font-bold text-midnight">+ 회원 직접 추가 (사이트 이전부터 있던 회원, 운영진)</summary>
        <p className="mt-2 text-[12px] text-ink-soft">
          메일은 그 사람이 로그인할 <strong>Google 계정 메일</strong>이어야 해요. 기존 회원은 가입일을 꼭 넣어 주세요(비어 있으면 첫 신청 때 첫 등록 가격이 적용돼요).
          새로 오는 사람은 직접 추가하지 않아도 MY 화면에서 신청하면 자동으로 등록돼요.
        </p>
        <ActionForm action={addMember} className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
            이름
            <input name="name" required maxLength={40} className={smallInput} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
            Google 로그인 메일
            <input name="email" type="email" required className={smallInput} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
            입금자명 (비우면 이름)
            <input name="depositor_name" maxLength={20} className={smallInput} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
            권한 {isAdmin ? "" : "(운영진 지정은 admin만)"}
            <select name="role" defaultValue="member" className={smallInput}>
              <option value="member">member</option>
              {isAdmin && <option value="operator">operator (운영진)</option>}
              {isAdmin && <option value="admin">admin</option>}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
            상태
            <select name="status" defaultValue="active" className={smallInput}>
              <option value="active">active (회원)</option>
              <option value="applicant">applicant (신청자)</option>
              <option value="inactive">inactive (이용 중지)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
            가입일
            <input name="joined_at" type="date" className={smallInput} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft sm:col-span-3">
            운영 메모 (회원에게 보이지 않음)
            <input name="memo" maxLength={300} className={smallInput} />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" className={smallPrimary}>
              추가
            </button>
          </div>
        </ActionForm>
      </details>
      )}

      <p className="mt-4 text-[13px] text-ink-soft">{rows.length}명</p>
      {filter === "chat" && (
        <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
          회원 단체 채팅방에서 확인할 사람들이에요. 초대·내보내기는 자동으로 되지 않아요 — 운영진이 직접 처리해 주세요. 이 표시는 할 일 안내일 뿐, 실제로 채팅방에서 나갔는지는 알 수 없어요.
        </p>
      )}
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map(({ member, until, lastEnd, pending, left, access, chat }) => (
          <li key={member.id}>
            <Link
              href={`/admin/members/${encodeURIComponent(member.id)}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-midnight/20 bg-ivory px-4 py-3 hover:border-midnight"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-midnight">
                  {member.name}
                  <Pill tone={stateLabel(access).tone}>{stateLabel(access).text}</Pill>
                  {chat && <Pill tone="warn">{CHAT_LABEL[chat]}</Pill>}
                  {member.role !== "member" && <Pill tone="ok">{member.role}</Pill>}
                  {member.status !== "active" && <Pill tone="warn">{member.status}</Pill>}
                  {pending && can(me, "money") && <Pill>입금 대기</Pill>}
                  {!member.consentAt && member.status !== "inactive" && <Pill tone="warn">동의서 미확인</Pill>}
                </span>
                <span className="block truncate font-mono text-[12px] text-ink-soft">
                  {member.email} · {member.depositorName}
                </span>
              </span>
              <span className="text-right text-[13px]">
                {until ? (
                  <>
                    <span className="font-mono text-midnight">~{dotDate(until)}</span>
                    <span className={cn("ml-2 font-mono", left !== null && left <= 7 ? "font-bold text-brown" : "text-ink-soft")}>D-{left}</span>
                  </>
                ) : lastEnd ? (
                  <span className="font-mono text-ink-soft">만료 {dotDate(lastEnd)}</span>
                ) : (
                  <span className="text-ink-soft">회원권 없음</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AdminFrame>
  );
}
