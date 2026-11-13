import { toDateKey } from "@/lib/dates";
import { isStampId, STAMP_CATALOG, STAMP_PLAN_TERMS, stampImageSrc, type MyStamp, type StampId, type StampInfo } from "@/lib/stamps";
import type { Membership, Plan } from "./model";
import type { Check, Op } from "../store/commit";
import { newId, seoulIso } from "../store/ids";
import { cellText, type Row, type Tables } from "../store/schema";

/**
 * MOON STAMPS: six fixed stamps, issued by hand by operators (no automatic
 * checks, no attendance or hold counting, no auto-issue on membership). One
 * stamp of each kind per member.
 */

export interface StampDefinition extends StampInfo {
  active: boolean;
}

export interface StampAward {
  awardId: string;
  memberId: string;
  stampId: StampId;
  /** "YYYY-MM-DD" or "" when the cell holds no valid date. */
  awardedAt: string;
  awardedBy: string;
  /** Operators only. Never sent to the member's screen. */
  note: string;
}

const DAY = /^(\d{4}-\d{2}-\d{2})/;

function dayOf(value: unknown): string {
  return DAY.exec(cellText(value as string))?.[1] ?? "";
}

function isFalse(value: unknown): boolean {
  return ["false", "no", "n", "0", "off", "아니오"].includes(cellText(value as string).trim().toLowerCase());
}

/**
 * Exactly the six stamps, in order. The StampDefinitions table can reword the
 * name/description or switch a stamp off; anything else in it is ignored
 * (unknown ids, ST-07, …). A missing row simply means the defaults.
 */
export function stampDefinitions(tables: Tables): StampDefinition[] {
  const rows = tables.StampDefinitions ?? [];
  return STAMP_CATALOG.map((base) => {
    const row = rows.find((r) => cellText(r.stamp_id).trim().toUpperCase() === base.id);
    return {
      ...base,
      name: cellText(row?.name).trim() || base.name,
      description: cellText(row?.description).trim() || base.description,
      imageKey: cellText(row?.image_key).trim().toLowerCase() || base.imageKey,
      active: row ? !isFalse(row.active) : true,
    };
  });
}

/**
 * Awards as recorded. Rows added by hand in the sheet are welcome; if the same
 * member got the same stamp twice, the earliest record counts.
 */
export function stampAwards(tables: Tables): StampAward[] {
  const best = new Map<string, StampAward>();
  for (const row of tables.StampAwards ?? []) {
    const stampId = cellText(row.stamp_id).trim().toUpperCase();
    const memberId = cellText(row.member_id).trim();
    if (!memberId || !isStampId(stampId)) continue;
    const award: StampAward = {
      awardId: cellText(row.award_id).trim(),
      memberId,
      stampId,
      awardedAt: dayOf(row.awarded_at),
      awardedBy: cellText(row.awarded_by).trim(),
      note: cellText(row.note).trim(),
    };
    const key = `${memberId}|${stampId}`;
    const current = best.get(key);
    if (!current || (award.awardedAt && (!current.awardedAt || award.awardedAt < current.awardedAt))) best.set(key, award);
  }
  return [...best.values()];
}

/**
 * The collection a member sees. `memberId` must come from the signed-in
 * session (resolved against the Members tab), never from the request.
 * Switched-off stamps stay visible only if this member already has them.
 */
export function memberStamps(tables: Tables, memberId: string): MyStamp[] {
  const mine = new Map(stampAwards(tables).filter((a) => a.memberId === memberId).map((a) => [a.stampId, a]));
  return stampDefinitions(tables)
    .filter((d) => d.active || mine.has(d.id))
    .map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      subtitle: d.subtitle ?? null,
      motto: d.motto ?? null,
      imageSrc: stampImageSrc(d.imageKey, d.id),
      awardedAt: mine.has(d.id) ? mine.get(d.id)!.awardedAt : null,
    }));
}

/**
 * For the crew only, next to ST-05 SIX MOONS / ST-06 TWELVE MOONS: this member's
 * registrations on a plan with the matching terms (6 + 1 / 12 + 2 months).
 * Reference, not a rule — nothing is issued automatically, and the plan's
 * current terms are used (a plan edited later would read differently).
 * Canceled/refunded registrations don't count. Other stamps: always [].
 */
export function stampPlanEvidence(
  stampId: StampId,
  memberId: string,
  memberships: Membership[],
  plans: Plan[],
): Array<{ membershipId: string; planName: string; startDate: string; endDate: string }> {
  const terms = STAMP_PLAN_TERMS[stampId];
  if (!terms) return [];
  return memberships
    .filter((m) => m.memberId === memberId && m.status === "active")
    .flatMap((m) => {
      const plan = plans.find((p) => p.id === m.planId);
      if (!plan || plan.durationMonths !== terms.durationMonths || plan.bonusMonths !== terms.bonusMonths) return [];
      return [{ membershipId: m.id, planName: plan.name || plan.id, startDate: m.startDate, endDate: m.endDate }];
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Shown when the deployed Apps Script version predates the stamp tabs (it leaves them out of reads). */
export const STAMP_TABS_MISSING =
  "사이트가 쓰는 Apps Script 배포가 아직 이전 버전이라 스탬프 탭을 읽지 못해요. Apps Script에서 setupSheets를 실행한 뒤 배포 관리 → 기존 배포 수정(연필) → 버전: 새 버전 → 배포를 해 주세요.";

/** Operator: record that a member earned a stamp (checked by a person, not automatically). */
export function planStampAward(
  data: Tables,
  ctx: { now: number; actorId: string; memberId: string; stampId: string; awardedAt: string; note: string },
): { commit: { id: string; checks: Check[]; ops: Op[] }; result: { awardId: string } } | { refuse: string } {
  // An older gateway leaves unknown tabs out of the read entirely.
  if (data.StampAwards === undefined) return { refuse: STAMP_TABS_MISSING };
  if (!isStampId(ctx.stampId)) return { refuse: "스탬프 종류를 확인해 주세요." };
  const member = (data.Members ?? []).find((r) => cellText(r.member_id) === ctx.memberId);
  if (!member) return { refuse: "회원을 찾을 수 없어요." };
  if (!DAY.test(ctx.awardedAt) || ctx.awardedAt.length !== 10) return { refuse: "발급일을 확인해 주세요." };
  if (ctx.awardedAt > toDateKey(ctx.now)) return { refuse: "발급일은 오늘이나 지난 날짜만 고를 수 있어요." };
  if (stampAwards(data).some((a) => a.memberId === ctx.memberId && a.stampId === ctx.stampId)) {
    return { refuse: "이미 받은 스탬프예요. 스탬프는 종류별로 한 번만 발급돼요." };
  }

  const commitId = newId("C", ctx.now, 8);
  const awardId = newId("SA", ctx.now);
  const row: Row = {
    award_id: awardId,
    member_id: ctx.memberId,
    stamp_id: ctx.stampId,
    awarded_at: ctx.awardedAt,
    awarded_by: ctx.actorId,
    note: ctx.note.slice(0, 200),
  };
  return {
    commit: {
      id: commitId,
      checks: [
        { type: "exists", table: "Members", id: ctx.memberId },
        // Two operators issuing the same stamp at once: only the first one lands.
        { type: "absent", table: "StampAwards", where: { member_id: ctx.memberId, stamp_id: ctx.stampId } },
      ],
      ops: [
        { type: "append", table: "StampAwards", row },
        {
          type: "append",
          table: "AuditLog",
          row: {
            log_id: newId("LOG", ctx.now, 6),
            commit_id: commitId,
            actor_id: ctx.actorId,
            action: "stamp.award",
            target_id: awardId,
            before_value: "",
            after_value: JSON.stringify(row),
            created_at: seoulIso(ctx.now),
          },
        },
      ],
    },
    result: { awardId },
  };
}
