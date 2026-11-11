import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { formatDateKo, formatDateTimeKo, formatTime, parseMoment, toDateKey } from "@/lib/dates";
import { requireOperator } from "@/server/auth/viewer";
import { isPublicEvent } from "@/server/domain/event-input";
import { cellText, type Row } from "@/server/store/schema";
import { storeMode } from "@/server/store";
import { createEvent } from "../actions";
import { ActionForm } from "../admin-ui";
import { AdminFrame, AdminSkeleton, Box, Pill, smallPrimary } from "../shared";
import { EventFields, STATUS_LABEL, usedCategories, VISIBILITY_LABEL } from "./event-fields";

export const metadata: Metadata = { title: "이벤트", robots: { index: false } };

export default function EventsAdminPage() {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <Events />
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

async function Events() {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  const now = await requestNow();
  const { club, tables } = await requireOperator("/admin/events");
  const today = toDateKey(now);
  const todayStart = parseMoment(today)!.ms;

  const rows = (tables.Events ?? []).filter((r) => cellText(r.event_id));
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

  return (
    <AdminFrame tab="events" title="Events">
      <div className="flex flex-col gap-6">
        <Box title="새 이벤트">
          <ActionForm action={createEvent} className="grid gap-3 sm:grid-cols-2">
            <EventFields categories={usedCategories(rows)} today={today} />
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
              <Pill tone={status === "published" ? "ok" : status === "canceled" ? "warn" : "muted"}>{STATUS_LABEL[status] ?? (status || "?")}</Pill>
              <Pill tone={shown ? "default" : "muted"}>{shown ? "사이트 표시" : (VISIBILITY_LABEL[visibility] ?? "안 보임")}</Pill>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
