import type { BlockReason, MemberAccess } from "@/lib/access";
import { cleanNickname, isMbti, type Mbti } from "@/lib/little-club";
import type { Planned } from "../store";
import { newId, seoulIso } from "../store/ids";
import { cellText, type Tables } from "../store/schema";

/**
 * THE LITTLE CLUB: who may enter, and the one profile row per member.
 *
 * Entry is stricter than the other member features: an `active` account with a
 * membership in effect TODAY. Staff get no pass of their own (an operator or
 * admin without a running membership stays outside, as agreed for the club),
 * and applicants, suspended accounts, ended, not-yet-started or pending
 * memberships are all turned away.
 */

export type ClubBlock = "login" | "applicant" | BlockReason;

export type ClubVerdict = { ok: true } | { ok: false; reason: ClubBlock };

export function littleClubVerdict(member: { status: string } | null, access: MemberAccess | null): ClubVerdict {
  if (!member || !access) return { ok: false, reason: "not_member" };
  if (member.status === "inactive") return { ok: false, reason: "suspended" };
  if (member.status !== "active") return { ok: false, reason: "applicant" };
  // validUntil is set only while a confirmed membership covers today (never for staff alone).
  if (access.validUntil) return { ok: true };
  if (access.pending) return { ok: false, reason: "pending" };
  if (access.startsOn) return { ok: false, reason: "not_started" };
  return { ok: false, reason: "expired" };
}

export interface ClubProfile {
  nickname: string;
  mbti: Mbti;
}

/** The member's own profile, or null before the first save (a row with an unknown MBTI counts as none). */
export function clubProfileOf(tables: Tables, memberId: string): ClubProfile | null {
  const row = (tables.ClubProfiles ?? []).find((r) => cellText(r.member_id) === memberId);
  if (!row) return null;
  const mbti = cellText(row.mbti).trim().toUpperCase();
  const nickname = cleanNickname(cellText(row.nickname));
  return nickname && isMbti(mbti) ? { nickname, mbti } : null;
}

/** Shown when the database doesn't have the profile table yet (deployed before the schema update). */
export const CLUB_TABLE_MISSING = "리틀 클럽 프로필 저장소가 아직 준비되지 않았어요. 운영진이 DB 업데이트를 마치면 저장할 수 있어요.";

/** Save (first time) or change the member's nickname + MBTI. Only ever touches that member's own row. */
export function planClubProfileSave(
  data: Tables,
  ctx: { now: number; memberId: string; nickname: string; mbti: string },
): Planned {
  if (data.ClubProfiles === undefined) return { refuse: CLUB_TABLE_MISSING };
  const nickname = cleanNickname(ctx.nickname);
  if (!nickname) return { refuse: "별명은 1~12자로, 글자·숫자·띄어쓰기와 . _ - ~ ! ? · ♡ ☆ ★ 만 쓸 수 있어요." };
  const mbti = ctx.mbti.trim().toUpperCase();
  if (!isMbti(mbti)) return { refuse: "MBTI를 16가지 중에서 골라 주세요." };
  if (!(data.Members ?? []).some((r) => cellText(r.member_id) === ctx.memberId)) return { refuse: "회원을 찾을 수 없어요." };

  const rows = data.ClubProfiles.filter((r) => cellText(r.member_id) === ctx.memberId);
  const at = seoulIso(ctx.now);
  const commitId = newId("C", ctx.now, 8);
  const current = rows[0];
  if (current && cellText(current.nickname) === nickname && cellText(current.mbti) === mbti) return { noop: true };
  const audit = (before: unknown, after: unknown) => ({
    type: "append" as const,
    table: "AuditLog" as const,
    row: {
      log_id: newId("LOG", ctx.now, 6),
      commit_id: commitId,
      actor_id: ctx.memberId,
      action: "little_club.profile",
      target_id: ctx.memberId,
      before_value: before ? JSON.stringify(before) : "",
      after_value: JSON.stringify(after),
      created_at: at,
    },
  });
  if (current) {
    const before = { nickname: cellText(current.nickname), mbti: cellText(current.mbti) };
    return {
      commit: {
        id: commitId,
        checks: [{ type: "exists", table: "ClubProfiles", id: ctx.memberId, fields: before }],
        ops: [{ type: "update", table: "ClubProfiles", id: ctx.memberId, set: { nickname, mbti, updated_at: at } }, audit(before, { nickname, mbti })],
      },
      result: { nickname, mbti },
    };
  }
  const row = { member_id: ctx.memberId, nickname, mbti, created_at: at, updated_at: at };
  return {
    commit: {
      id: commitId,
      checks: [
        { type: "exists", table: "Members", id: ctx.memberId },
        // Two tabs saving the first profile at once: only one row ever lands.
        { type: "absent", table: "ClubProfiles", where: { member_id: ctx.memberId } },
      ],
      ops: [{ type: "append", table: "ClubProfiles", row }, audit(null, { nickname, mbti })],
    },
    result: { nickname, mbti },
  };
}
