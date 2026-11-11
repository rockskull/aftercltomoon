import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { formatDateKo, formatDateTimeKo, formatTime, parseMoment, toDateKey } from "@/lib/dates";
import { requireOperator } from "@/server/auth/viewer";
import { eventDraftFromProposal, eventIdForProposal, isPublicEvent } from "@/server/domain/event-input";
import { cellText, type Row } from "@/server/store/schema";
import { storeMode } from "@/server/store";
import { createEvent } from "../actions";
import { ActionForm } from "../admin-ui";
import { AdminFrame, AdminSkeleton, Box, Pill, smallPrimary } from "../shared";
import { EventFields, STATUS_LABEL, usedCategories, VISIBILITY_LABEL } from "./event-fields";

export const metadata: Metadata = { title: "이벤트", robots: { index: false } };

export default function EventsAdminPage({ searchParams }: PageProps<"/admin/events">) {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <Events searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

interface Listed {
  row: Row;
  id: string;
  start: number | null;
  allDay: boolean;
}

async function Events({ searchParams }: Pick<PageProps<"/admin/events">, "searchParams">) {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  const now = await requestNow();
  const { club, tables } = await requireOperator("/admin/events");
  const params = await searchParams;
  const today = toDateKey(now);
  const todayStart = parseMoment(today)!.ms;

  const rows = (tables.Events ?? []).filter((r) => cellText(r.event_id));
  const categories = usedCategories(rows);
  const listed: Listed[] = rows.map((row) => {
    const m = parseMoment(cellText(row.start_at));
    return { row, id: cellText(row.event_id), start: m ? m.ms : null, allDay: m ? m.dateOnly : false };
  });
  // Upcoming = starts today or later (plus rows whose date can't be read, so they get fixed).
  const upcoming = listed.filter((e) => e.start === null || e.start >= todayStart).sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const past = listed
    .filter((e) => e.start !== null && e.start < todayStart)
    .sort((a, b) => b.start! - a.start!)
    .slice(0, 30);

  // ?from=PR-… opens the form pre-filled from an accepted proposal (ADMIN → 제안 → 이벤트로 옮기기).
  const from = typeof params.from === "string" ? params.from : "";
  const proposal = from ? (tables.Proposals ?? []).find((r) => cellText(r.proposal_id) === from) : undefined;
  const madeFrom = proposal && rows.some((r) => cellText(r.event_id) === eventIdForProposal(from)) ? eventIdForProposal(from) : null;

  return (
    <AdminFrame tab="events" title="Events">
      <div className="flex flex-col gap-6">
        <div id="new">
          {proposal && madeFrom ? (
            <Box title="이미 이벤트로 옮긴 제안이에요">
              <p className="text-[14px] text-midnight">
                &lsquo;{cellText(proposal.event_title)}&rsquo; 제안으로 만든 이벤트가 있어요.{" "}
                <Link href={`/admin/events/${encodeURIComponent(madeFrom)}`} className="font-bold underline underline-offset-4">
                  이벤트 보기
                </Link>
              </p>
            </Box>
          ) : proposal ? (
            <Box title="제안에서 이벤트 만들기" action={<Link href="/admin/events" className="text-[13px] font-bold text-ink-soft hover:text-midnight">취소</Link>}>
              <ProposalContext p={proposal} />
              <ActionForm action={createEvent} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="proposal_id" value={from} />
                <EventFields row={eventDraftFromProposal(proposal)} categories={categories} today={today} />
                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  <button type="submit" className={smallPrimary}>
                    이벤트로 등록
                  </button>
                  <p className="text-[12px] text-ink-soft">
                    제목·설명·주최·대상은 사이트에 공개돼요. 제안자 이름과 내용을 그대로 공개해도 되는지 확인하고 고쳐 주세요.
                  </p>
                </div>
              </ActionForm>
            </Box>
          ) : (
            <Box title="새 이벤트">
              {from && <p className="mb-3 text-[13px] text-brown">제안({from})을 찾을 수 없어요. 아래에서 새로 등록해 주세요.</p>}
              <ActionForm action={createEvent} className="grid gap-3 sm:grid-cols-2">
                <EventFields categories={categories} today={today} />
                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  <button type="submit" className={smallPrimary}>
                    이벤트 등록
                  </button>
                  <p className="text-[12px] text-ink-soft">
                    &lsquo;사이트에 공개 · 공개&rsquo;면 캘린더에 바로 보이고, 다음 알림 때 회원들에게 새 이벤트 알림이 가요. 준비 중이면 초안으로 저장하세요.
                  </p>
                </div>
              </ActionForm>
            </Box>
          )}
        </div>

        <Box
          title={`다가오는 이벤트 ${upcoming.length}건`}
          action={
            club.settings.sheetUrl ? (
              <a href={club.settings.sheetUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-midnight underline underline-offset-4">
                시트에서 보기
              </a>
            ) : undefined
          }
        >
          <EventList items={upcoming} empty="예정된 이벤트가 없어요." />
        </Box>

        {past.length > 0 && (
          <Box title="지난 이벤트">
            <EventList items={past} empty="" />
          </Box>
        )}
      </div>
    </AdminFrame>
  );
}

/** What the proposer asked for, next to the form (operators only; not copied to the event). */
function ProposalContext({ p }: { p: Row }) {
  const t = (k: string) => cellText(p[k]).trim();
  const fee = t("desired_fee") ? `${t("desired_fee")}원 ${t("fee_unit")}`.trim() : t("free_ok") ? "무료 가능" : "";
  const items: Array<[string, string]> = [
    ["제안자", [t("proposer"), t("contact")].filter(Boolean).join(" · ")],
    ["희망 날짜", [t("preferred_date"), t("date_flexible") && `(${t("date_flexible") === "no" ? "이 날짜만" : t("date_flexible") === "yes" ? "협의 가능" : t("date_flexible")})`].filter(Boolean).join(" ")],
    ["소요 시간", t("estimated_duration")],
    ["희망 인원", t("expected_attendance")],
    ["희망 참가비", fee],
    ["비용 근거", t("estimated_cost")],
    ["필요한 것", [t("requirements"), t("staff_support"), t("other_requests")].filter(Boolean).join(" / ")],
    ["검토 메모", t("review_notes")],
  ];
  return (
    <div className="rounded-md border border-dashed border-midnight/30 bg-white/40 p-3">
      <p className="text-[12px] font-bold text-ink-soft">제안 내용 (운영진만 보임 · 날짜와 시간은 이걸 보고 정해 주세요)</p>
      <dl className="mt-1.5 grid grid-cols-[88px_1fr] gap-x-2 gap-y-0.5 text-[13px]">
        {items
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-soft">{k}</dt>
              <dd className="text-midnight">{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

/** "11.21 (토) 16:00", "11.21 (토) 종일 – 11.22 (일)", "11.21 (토) 16:00 – 18:00". */
function when(e: Listed): string {
  if (e.start === null) return "날짜 확인 필요";
  const startLabel = e.allDay ? `${formatDateKo(e.start)} 종일` : formatDateTimeKo(e.start);
  const end = parseMoment(cellText(e.row.end_at));
  if (!end) return startLabel;
  if (end.dateOnly) return `${startLabel} – ${formatDateKo(end.ms)}`;
  return `${startLabel} – ${toDateKey(end.ms) === toDateKey(e.start) ? formatTime(end.ms) : formatDateTimeKo(end.ms)}`;
}

function EventList({ items, empty }: { items: Listed[]; empty: string }) {
  if (items.length === 0) return <p className="text-[14px] text-ink-soft">{empty}</p>;
  return (
    <ul className="divide-y divide-plywood-400">
      {items.map((e) => {
        const visibility = cellText(e.row.visibility).trim().toLowerCase();
        const status = cellText(e.row.status).trim().toLowerCase();
        const shown = isPublicEvent(visibility, status);
        return (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <Link href={`/admin/events/${encodeURIComponent(e.id)}`} className="min-w-0 flex-1 hover:underline">
              <span className="block font-mono text-[12px] text-ink-soft">{when(e)}</span>
              <strong className="text-[15px] text-midnight">{cellText(e.row.title) || "(제목 없음)"}</strong>
              {cellText(e.row.location) && <span className="ml-2 text-[13px] text-ink-soft">{cellText(e.row.location)}</span>}
            </Link>
            <span className="flex items-center gap-1">
              {e.id.startsWith("EV-PR-") && <Pill tone="muted">제안</Pill>}
              <Pill tone={status === "published" ? "ok" : status === "canceled" ? "warn" : "muted"}>{STATUS_LABEL[status] ?? (status || "?")}</Pill>
              <Pill tone={shown ? "default" : "muted"}>{shown ? "사이트 표시" : (VISIBILITY_LABEL[visibility] ?? "안 보임")}</Pill>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
