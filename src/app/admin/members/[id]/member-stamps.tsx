import Image from "next/image";
import { dotDate } from "@/components/membership-card";
import { stampImageSrc } from "@/lib/stamps";
import type { Member } from "@/server/domain/model";
import { STAMP_TABS_MISSING, stampAwards, stampDefinitions } from "@/server/domain/stamps";
import { readTables, storeMode } from "@/server/store";
import { STAMP_TABLES } from "@/server/store/schema";
import { awardStamp, revokeStamp } from "../../actions";
import { ActionForm } from "../../admin-ui";
import { Box, Pill, smallButton, smallInput, smallPrimary } from "../../shared";

/**
 * MOON STAMPS for one member. Operators issue a stamp after checking the moment
 * themselves; there is no automatic judging or attendance tracking.
 */
export async function MemberStamps({ member, members, todayKey }: { member: Member; members: Member[]; todayKey: string }) {
  let tables;
  try {
    tables = await readTables(STAMP_TABLES, { admin: true });
  } catch (error) {
    console.error("[stamps] admin read failed", error);
    return (
      <Box title="Moon stamps">
        <p className="text-[14px] text-brown">스탬프 기록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>
      </Box>
    );
  }
  // An older Apps Script leaves unknown tabs out of the read entirely.
  if (storeMode() === "sheets" && tables.StampAwards === undefined) {
    return (
      <Box title="Moon stamps">
        <p className="text-[14px] text-brown">{STAMP_TABS_MISSING}</p>
      </Box>
    );
  }

  const awards = new Map(stampAwards(tables).filter((a) => a.memberId === member.id).map((a) => [a.stampId, a]));
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || id;

  return (
    <Box title="Moon stamps">
      <p className="mb-3 text-[13px] leading-relaxed text-ink-soft">
        활동을 직접 확인한 뒤 발급해 주세요. 종류별로 한 번만 발급돼요. 메모는 운영진만 보고, 회원 화면과 카드에는 나오지 않아요.
      </p>
      <ul className="flex flex-col gap-3">
        {stampDefinitions(tables).map((d) => {
          const award = awards.get(d.id);
          return (
            <li key={d.id} className="flex flex-wrap items-start gap-3 rounded-md border border-midnight/20 bg-white/40 p-3">
              <Image src={stampImageSrc(d.imageKey, d.id)} alt="" width={64} height={64} className={award ? "" : "opacity-40 grayscale"} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-midnight">
                  {d.name}
                  <span className="font-mono text-[11px] font-normal text-ink-soft">{d.id}</span>
                  {award ? <Pill tone="ok">발급됨</Pill> : !d.active && <Pill tone="muted">사용 안 함</Pill>}
                </p>
                <p className="text-[13px] text-ink-soft">{d.description}</p>
                {award ? (
                  <>
                    <p className="mt-1 text-[13px] text-midnight">
                      <span className="font-mono">{award.awardedAt ? dotDate(award.awardedAt) : "날짜 없음"}</span>
                      {award.awardedBy && <span className="text-ink-soft"> · 확인 {nameOf(award.awardedBy)}</span>}
                      {award.note && <span className="block text-[12px] text-ink-soft">메모: {award.note}</span>}
                    </p>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[12px] font-bold text-ink-soft">발급 취소</summary>
                      <ActionForm action={revokeStamp} className="mt-1 flex flex-wrap items-end gap-2" confirmText={`${d.name} 스탬프 발급을 취소할까요? 회원 화면에서 사라지고 기록은 남아요.`}>
                        <input type="hidden" name="member_id" value={member.id} />
                        <input type="hidden" name="stamp_id" value={d.id} />
                        <input name="reason" required maxLength={100} placeholder="취소 사유" className={`${smallInput} min-w-40 flex-1`} />
                        <button type="submit" className={smallButton}>
                          취소하기
                        </button>
                      </ActionForm>
                    </details>
                  </>
                ) : (
                  <ActionForm action={awardStamp} className="mt-2 flex flex-wrap items-end gap-2" confirmText={`${member.name || member.id}님에게 ${d.name} 스탬프를 발급할까요?`}>
                    <input type="hidden" name="member_id" value={member.id} />
                    <input type="hidden" name="stamp_id" value={d.id} />
                    <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
                      발급일
                      <input type="date" name="awarded_at" defaultValue={todayKey} max={todayKey} required className={smallInput} />
                    </label>
                    <label className="flex min-w-40 flex-1 flex-col gap-1 text-[12px] font-medium text-ink-soft">
                      메모 (운영진만, 선택)
                      <input name="note" maxLength={200} placeholder="예: 노란 V1 완등 확인" className={smallInput} />
                    </label>
                    <button type="submit" className={smallPrimary}>
                      스탬프 발급
                    </button>
                  </ActionForm>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12px] text-ink-soft">잘못 발급했다면 &lsquo;발급 취소&rsquo;로 되돌릴 수 있어요. 기록은 남고, 다시 발급할 수 있어요.</p>
    </Box>
  );
}
