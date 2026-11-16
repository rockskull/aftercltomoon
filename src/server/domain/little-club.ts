import { BUBBLE_TTL_MS, cleanBubble, cleanNickname, isClubScene, isMbti, PRESENCE_TTL_MS, type ClubScene, type Mbti } from "@/lib/little-club";
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
  /** Shown to the others in the club (name tag, scene, bubble). Rows from before the setting count as shown. */
  visible: boolean;
}

const isFalse = (v: unknown) => ["false", "no", "0", "off"].includes(cellText(v as string).trim().toLowerCase());

/** The member's own profile, or null before the first save (a row with an unknown MBTI counts as none). */
export function clubProfileOf(tables: Tables, memberId: string): ClubProfile | null {
  const row = (tables.ClubProfiles ?? []).find((r) => cellText(r.member_id) === memberId);
  if (!row) return null;
  const mbti = cellText(row.mbti).trim().toUpperCase();
  const nickname = cleanNickname(cellText(row.nickname));
  return nickname && isMbti(mbti) ? { nickname, mbti, visible: !isFalse(row.visible) } : null;
}

/** Shown when the database doesn't have the profile table yet (deployed before the schema update). */
export const CLUB_TABLE_MISSING = "리틀 클럽 프로필 저장소가 아직 준비되지 않았어요. 운영진이 DB 업데이트를 마치면 저장할 수 있어요.";

/** Save (first time) or change the member's nickname + MBTI. Only ever touches that member's own row. */
export function planClubProfileSave(
  data: Tables,
  ctx: { now: number; memberId: string; nickname: string; mbti: string; visible?: boolean },
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
  const visible = ctx.visible ?? (current ? !isFalse(current.visible) : true);
  const shown = visible ? "true" : "false";
  if (current && cellText(current.nickname) === nickname && cellText(current.mbti) === mbti && !isFalse(current.visible) === visible) return { noop: true };
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
    const before = { nickname: cellText(current.nickname), mbti: cellText(current.mbti), visible: cellText(current.visible) };
    return {
      commit: {
        id: commitId,
        checks: [{ type: "exists", table: "ClubProfiles", id: ctx.memberId, fields: before }],
        ops: [{ type: "update", table: "ClubProfiles", id: ctx.memberId, set: { nickname, mbti, visible: shown, updated_at: at } }, audit(before, { nickname, mbti, visible: shown })],
      },
      result: { nickname, mbti, visible },
    };
  }
  const row = { member_id: ctx.memberId, nickname, mbti, created_at: at, updated_at: at, visible: shown };
  return {
    commit: {
      id: commitId,
      checks: [
        ...(guest ? [] : [{ type: "exists" as const, table: "Members" as const, id: ctx.memberId }]),
        // Two tabs saving the first profile at once: only one row ever lands.
        { type: "absent", table: "ClubProfiles", where: { member_id: ctx.memberId } },
      ],
      ops: [{ type: "append", table: "ClubProfiles", row }, audit(null, { nickname, mbti, visible: shown })],
    },
    result: { nickname, mbti, visible },
  };
}

// ---------------------------------------------------------------------------
// Presence: who is in the club right now (no history; one row per person)
// ---------------------------------------------------------------------------

const ms = (v: unknown) => {
  const t = Date.parse(cellText(v as string));
  return Number.isFinite(t) ? t : 0;
};

/**
 * Record where this person is (and, when given, their one current bubble). Only someone
 * with a saved rabbit takes part. Overwrites the single row; no audit trail (it is not a record).
 */
export function planPresence(
  data: Tables,
  ctx: { now: number; key: string; scene: string; x: number; y: number; bubble?: string },
): Planned {
  if (data.ClubPresence === undefined || data.ClubProfiles === undefined) return { refuse: CLUB_TABLE_MISSING };
  if (!clubProfileOf(data, ctx.key)) return { refuse: "먼저 내 토끼를 골라 주세요." };
  if (!isClubScene(ctx.scene)) return { refuse: "장면을 확인해 주세요." };
  const at = seoulIso(ctx.now);
  const x = Math.round(Math.max(0, Math.min(512, Number(ctx.x) || 0)));
  const y = Math.round(Math.max(0, Math.min(320, Number(ctx.y) || 0)));
  const set: Record<string, string | number> = { scene: ctx.scene, x, y, seen_at: at };
  if (ctx.bubble !== undefined) {
    set.bubble = cleanBubble(ctx.bubble);
    set.bubble_at = set.bubble ? at : "";
  }
  const exists = data.ClubPresence.some((r) => cellText(r.member_id) === ctx.key);
  return {
    commit: {
      id: newId("C", ctx.now, 8),
      checks: exists ? [{ type: "exists", table: "ClubPresence", id: ctx.key }] : [{ type: "absent", table: "ClubPresence", where: { member_id: ctx.key } }],
      ops: exists
        ? [{ type: "update", table: "ClubPresence", id: ctx.key, set }]
        : [{ type: "append", table: "ClubPresence", row: { member_id: ctx.key, bubble: "", bubble_at: "", ...set } }],
    },
  };
}

/** The bubble this person left (still fresh), so it is there again after a reload or on another device. */
export function myBubbleOf(data: Tables, key: string, now: number): string {
  const row = (data.ClubPresence ?? []).find((r) => cellText(r.member_id) === key);
  if (!row || now - ms(row.bubble_at) > BUBBLE_TTL_MS) return "";
  return cleanBubble(cellText(row.bubble));
}

/**
 * The others in the club right now: refreshed within the presence window, with a saved rabbit
 * they chose to show. Never the person asking. Keys stay on the server (the caller maps them).
 */
export function peersOf(data: Tables, selfKey: string, now: number): Array<{ key: string; nickname: string; mbti: Mbti; scene: ClubScene; x: number; y: number; bubble: string }> {
  const out: Array<{ key: string; nickname: string; mbti: Mbti; scene: ClubScene; x: number; y: number; bubble: string }> = [];
  for (const row of data.ClubPresence ?? []) {
    const key = cellText(row.member_id);
    if (!key || key === selfKey || now - ms(row.seen_at) > PRESENCE_TTL_MS) continue;
    const profile = clubProfileOf(data, key);
    const scene = cellText(row.scene);
    if (!profile || !profile.visible || !isClubScene(scene)) continue;
    out.push({
      key,
      nickname: profile.nickname,
      mbti: profile.mbti,
      scene,
      x: Number(cellText(row.x)) || 0,
      y: Number(cellText(row.y)) || 0,
      bubble: now - ms(row.bubble_at) > BUBBLE_TTL_MS ? "" : cleanBubble(cellText(row.bubble)),
    });
  }
  return out.slice(0, 40);
}
