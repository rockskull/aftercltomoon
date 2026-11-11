import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { formatDateTimeKo, parseMoment, toDateKey } from "@/lib/dates";
import { requireOperator } from "@/server/auth/viewer";
import { isPublicEvent } from "@/server/domain/event-input";
import { cellText } from "@/server/store/schema";
import { storeMode } from "@/server/store";
import { editEvent } from "../../actions";
import { ActionForm } from "../../admin-ui";
import { AdminFrame, AdminSkeleton, Box, Pill, smallPrimary } from "../../shared";
import { EventFields, STATUS_LABEL, usedCategories } from "../event-fields";

export const metadata: Metadata = { title: "이벤트 수정", robots: { index: false } };

export default function EventEditPage({ params }: PageProps<"/admin/events/[id]">) {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <EventEdit params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function EventEdit({ params }: Pick<PageProps<"/admin/events/[id]">, "params">) {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  const { id: rawId } = await params;
  const now = await requestNow();
  const { tables } = await requireOperator(`/admin/events/${rawId}`);
  const id = decodeURIComponent(rawId);
  const rows = (tables.Events ?? []).filter((r) => cellText(r.event_id));
  const row = rows.find((r) => cellText(r.event_id) === id);
  if (!row) notFound();

  const status = cellText(row.status).trim().toLowerCase();
  const shown = isPublicEvent(cellText(row.visibility).trim().toLowerCase(), status);
  const updated = parseMoment(cellText(row.updated_at));

  return (
    <AdminFrame tab="events" title={cellText(row.title) || id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/admin/events" className="text-[13px] font-bold text-ink-soft hover:text-midnight">
          ← 이벤트 목록
        </Link>
        <span className="flex items-center gap-2">
          <Pill tone={status === "published" ? "ok" : status === "canceled" ? "warn" : "muted"}>{STATUS_LABEL[status] ?? (status || "?")}</Pill>
          {shown ? (
            <Link href={`/events/${encodeURIComponent(id)}`} className="text-[13px] font-bold text-midnight underline underline-offset-4">
              사이트에서 보기
            </Link>
          ) : (
            <span className="text-[13px] text-ink-soft">사이트에 안 보임</span>
          )}
        </span>
      </div>

      <Box title="이벤트 수정" className="mt-4">
        <ActionForm action={editEvent} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="event_id" value={id} />
          {/* The version this form was opened with; a newer change elsewhere makes the save stop and reload. */}
          <input type="hidden" name="base" value={cellText(row.updated_at)} />
          <EventFields row={row} categories={usedCategories(rows)} today={toDateKey(now)} />
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" className={smallPrimary}>
              저장
            </button>
            <p className="text-[12px] text-ink-soft">
              공개된 이벤트의 시간을 바꾸거나 취소하면 다음 알림 때 회원들에게 알림이 가요. 지우는 대신 &lsquo;취소&rsquo;나 &lsquo;초안&rsquo;으로 바꿔 주세요.
            </p>
          </div>
        </ActionForm>
        <p className="mt-3 font-mono text-[11px] text-ink-soft">
          {id}
          {updated && ` · 마지막 수정 ${formatDateTimeKo(updated.ms)}`}
        </p>
      </Box>
    </AdminFrame>
  );
}
