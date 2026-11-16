import { cleanNickname, isMbti, type Mbti } from "@/lib/little-club";
import type { Planned } from "../store";
import { newId, seoulIso } from "../store/ids";
import { cellText, type Tables } from "../store/schema";

/**
 * THE LITTLE CLUB: who may enter, and the one profile row per person.
 *
 * Anyone signed in may enter (decided 2026-11-16, wider than the handoff's
 * "membership holders only"): members with or without a running membership,
 * applicants, staff, and people who signed in but aren't on the member list.
 * Only accounts the crew suspended (`inactive`) stay out. Signing in itself is
 * checked by the caller (src/server/little-club.ts).
 */

export type ClubBlock = "login" | "suspended";

export type ClubVerdict = { ok: true } | { ok: false; reason: ClubBlock };

export function littleClubVerdict(member: { status: string } | null): ClubVerdict {
  if (member?.status === "inactive") return { ok: false, reason: "suspended" };
  return { ok: true };
}

/**
 * Profile rows are keyed by the member id; a signed-in visitor who isn't on the
 * member list gets an opaque key derived on the server from their sign-in email
 * ("GUEST-…"; the email itself is never stored).
 */
export const GUEST_KEY_PREFIX = "GUEST-";
export const isGuestKey = (key: string) => key.startsWith(GUEST_KEY_PREFIX);

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
  const guest = isGuestKey(ctx.memberId);
  if (!guest && !(data.Members ?? []).some((r) => cellText(r.member_id) === ctx.memberId)) return { refuse: "회원을 찾을 수 없어요." };

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
        ...(guest ? [] : [{ type: "exists" as const, table: "Members" as const, id: ctx.memberId }]),
        // Two tabs saving the first profile at once: only one row ever lands.
        { type: "absent", table: "ClubProfiles", where: { member_id: ctx.memberId } },
      ],
      ops: [{ type: "append", table: "ClubProfiles", row }, audit(null, { nickname, mbti })],
    },
    result: { nickname, mbti },
  };
}
