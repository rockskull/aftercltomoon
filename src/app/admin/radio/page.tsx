import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { ARTIST_MAX, MESSAGE_MAX, TITLE_MAX } from "@/lib/radio";
import { can } from "@/lib/permissions";
import { requireOperator } from "@/server/auth/viewer";
import { activeTracks, deletedTracks, DISPLAY_NAME_MAX, RADIO_TAB_MISSING, type StoredTrack } from "@/server/domain/radio";
import { readTables, storeMode } from "@/server/store";
import { deleteRadioTrack, editRadioTrack, moveRadioTrack, restoreRadioTrack } from "../actions";
import { ActionForm } from "../admin-ui";
import { AdminFrame, AdminSkeleton, Box, Pill, smallButton, smallInput, smallPrimary } from "../shared";

export const metadata: Metadata = { title: "라디오 관리", robots: { index: false } };

export default function AdminRadioPage() {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <RadioAdmin />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const dotted = (iso: string) => iso.slice(0, 10).replace(/-/g, ".");

async function RadioAdmin() {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  await requestNow();
  const viewer = await requireOperator("/admin/radio");
  // Operators and admins both manage the radio (src/lib/permissions.ts).
  const isAdmin = can(viewer.member, "radio");
  const tables = await readTables(["RadioTracks"], { admin: true });
  const nameOf = (id: string) => viewer.club.members.find((m) => m.id === id)?.name || id;

  if (storeMode() === "sheets" && tables.RadioTracks === undefined) {
    return (
      <AdminFrame tab="radio" title="Radio" who={viewer.member}>
        <Box title="아직 준비 중">
          <p className="text-[14px] text-brown">{RADIO_TAB_MISSING}</p>
        </Box>
      </AdminFrame>
    );
  }

  const active = activeTracks(tables);
  const deleted = deletedTracks(tables);

  return (
    <AdminFrame tab="radio" title="Radio" who={viewer.member}>
      <div className="flex flex-col gap-6">
        <p className="text-[14px] leading-relaxed text-ink-soft">
          AFTER HOURS RADIO의 재생 순서와 곡 정보를 관리해요. 표시 이름과 메모(사연)는{" "}
          <Link href="/radio" className="font-semibold text-midnight underline underline-offset-4">
            라디오 목록
          </Link>
          에 그대로 보여요. 멤버 신청곡의 표시 이름·메모는 로그인한 회원에게만, 기본곡의 메모는 모두에게 보여요.
          {!isAdmin && <span className="mt-1 block font-semibold text-brown">수정·순서 변경·삭제·복원은 운영진만 할 수 있어요. 지금은 보기만 가능해요.</span>}
        </p>

        <Box title={`재생 순서 · ${active.length}곡`}>
          <ol className="flex flex-col gap-2">
            {active.map((t, i) => (
              <TrackRow key={t.id} track={t} n={i + 1} first={i === 0} last={i === active.length - 1} isAdmin={isAdmin} requester={nameOf(t.requestedBy)} />
            ))}
          </ol>
        </Box>

        <Box title={`삭제된 곡 · ${deleted.length}곡`}>
          {deleted.length === 0 ? (
            <p className="text-[14px] text-ink-soft">삭제된 곡이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {deleted.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-midnight/25 px-3 py-2.5">
                  <span className="min-w-0 text-[14px]">
                    <strong className="text-midnight">{t.title}</strong> <span className="text-ink-soft">· {t.artist}</span>
                    <span className="block text-[12px] text-ink-soft">
                      삭제 {t.deletedAt ? dotted(t.deletedAt) : "—"}
                      {t.deletedBy && ` · ${nameOf(t.deletedBy)}`}
                    </span>
                  </span>
                  {isAdmin && (
                    <ActionForm action={restoreRadioTrack}>
                      <input type="hidden" name="track_id" value={t.id} />
                      <button type="submit" className={smallButton}>
                        되돌리기
                      </button>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>
    </AdminFrame>
  );
}

function TrackRow({ track: t, n, first, last, isAdmin, requester }: { track: StoredTrack; n: number; first: boolean; last: boolean; isAdmin: boolean; requester: string }) {
  return (
    <li className="rounded-md border border-midnight/20 bg-white/40 p-3">
      <div className="flex items-start gap-3">
        <span className="w-7 shrink-0 pt-0.5 font-mono text-[12px] text-ink-soft">{String(n).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-midnight">
            <span className="break-words">{t.title}</span>
            {t.source === "seed" ? <Pill tone="muted">기본곡</Pill> : <Pill>신청곡</Pill>}
          </p>
          <p className="text-[13px] text-ink-soft">{t.artist}</p>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            표시 이름 <strong className="text-midnight">{t.displayName || "—"}</strong>
            {t.source === "member" && ` · 신청 ${requester} · ${dotted(t.createdAt)}`}
          </p>
          {t.message && <p className="mt-1 break-words text-[13px] text-midnight">“{t.message}”</p>}
          <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-ink-soft underline underline-offset-2 hover:text-midnight">
            YouTube에서 열기
          </a>
        </div>
        {isAdmin && (
          <div className="flex shrink-0 flex-col gap-1">
            <MoveButton id={t.id} direction="up" disabled={first} />
            <MoveButton id={t.id} direction="down" disabled={last} />
          </div>
        )}
      </div>

      {isAdmin && (
        <details className="mt-2 border-t border-dashed border-midnight/20 pt-2">
          <summary className="cursor-pointer text-[13px] font-bold text-midnight">수정 · 삭제</summary>
          <ActionForm action={editRadioTrack} className="mt-2 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="track_id" value={t.id} />
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
              곡명
              <input name="title" defaultValue={t.title} required maxLength={TITLE_MAX} className={smallInput} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
              아티스트
              <input name="artist" defaultValue={t.artist} required maxLength={ARTIST_MAX} className={smallInput} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
              표시 이름 (목록에 보이는 신청자 이름)
              <input name="display_name" defaultValue={t.displayName} maxLength={DISPLAY_NAME_MAX} className={smallInput} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft sm:col-span-2">
              메모 · 사연 (목록에 보여요, {MESSAGE_MAX}자까지)
              <textarea name="message" defaultValue={t.message} maxLength={MESSAGE_MAX} rows={2} className={`${smallInput} h-auto py-2`} />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={smallPrimary}>
                저장
              </button>
            </div>
          </ActionForm>
          <ActionForm action={deleteRadioTrack} className="mt-3" confirmText={`‘${t.title}’을(를) 라디오에서 삭제할까요? 목록과 재생 순서에서 빠지고, 여기 '삭제된 곡'에서 되돌릴 수 있어요.`}>
            <input type="hidden" name="track_id" value={t.id} />
            <button type="submit" className={`${smallButton} border-brown text-brown hover:bg-brown hover:text-ivory`}>
              Delete track
            </button>
          </ActionForm>
        </details>
      )}
    </li>
  );
}

function MoveButton({ id, direction, disabled }: { id: string; direction: "up" | "down"; disabled: boolean }) {
  return (
    <ActionForm action={moveRadioTrack}>
      <input type="hidden" name="track_id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={direction === "up" ? "한 칸 위로" : "한 칸 아래로"}
        className="grid size-9 place-items-center rounded-md border-2 border-midnight/30 text-[13px] text-midnight hover:border-midnight disabled:opacity-30"
      >
        {direction === "up" ? "▲" : "▼"}
      </button>
    </ActionForm>
  );
}
