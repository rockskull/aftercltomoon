"use server";

import { refresh } from "next/cache";
import { cleanNickname } from "@/lib/little-club";
import type { ClubBlock, ClubProfile } from "@/server/domain/little-club";
import { CLUB_TABLE_MISSING, planClubProfileSave, planPresence } from "@/server/domain/little-club";
import type { ClubPeer } from "@/lib/little-club";
import { clubNotices, littleClubGate, loadPeers, type ClubNotices } from "@/server/little-club";
import { runCommit } from "@/server/store";
import { LITTLE_CLUB_TABLES, PRESENCE_TABLES } from "@/server/store/schema";

export type SaveProfileResult = { ok: true; profile: ClubProfile } | { ok: false; message: string; reason?: ClubBlock };

/**
 * Save the signed-in member's nickname + MBTI. The member comes from the session
 * (re-checked against the live data), never from the request: there is no way to
 * name another member here.
 */
export async function saveClubProfile(input: { nickname: string; mbti: string; visible?: boolean }): Promise<SaveProfileResult> {
  const gate = await littleClubGate({ fresh: true });
  if (!gate.ok) return { ok: false, reason: gate.reason, message: gate.reason === "login" ? "로그인이 필요해요." : "이용이 중지된 계정이에요. 운영진에게 문의해 주세요." };
  const memberId = gate.profileKey;
  const nickname = typeof input?.nickname === "string" ? input.nickname : "";
  const mbti = typeof input?.mbti === "string" ? input.mbti : "";
  let outcome;
  try {
    outcome = await runCommit<ClubProfile>(["Members", ...LITTLE_CLUB_TABLES], (data) => planClubProfileSave(data, { now: Date.now(), memberId, nickname, mbti, visible: typeof input?.visible === "boolean" ? input.visible : undefined }));
  } catch (error) {
    // e.g. the profile table doesn't exist yet in the database
    console.error("[little-club] profile save failed", error);
    return { ok: false, message: CLUB_TABLE_MISSING };
  }
  if (!outcome.ok) return { ok: false, message: outcome.message };
  refresh();
  // noop (nothing changed) has no result: echo the cleaned values back.
  return { ok: true, profile: outcome.result ?? { nickname: cleanNickname(nickname) ?? nickname, mbti: mbti.trim().toUpperCase() as ClubProfile["mbti"], visible: input?.visible ?? true } };
}

/** The bell, re-read when the member comes back to the tab or a push arrives (no polling). Only their own notices. */
export async function refreshClubNotices(): Promise<({ ok: true } & ClubNotices) | { ok: false }> {
  const gate = await littleClubGate({ fresh: true });
  if (!gate.ok) return { ok: false };
  return { ok: true, ...clubNotices(gate.viewer, gate.member, Date.now()) };
}

export type PresenceResult = { ok: true; peers: ClubPeer[] } | { ok: false };

/**
 * Where I am in the club (sent when I stop, change scene or change my bubble; and now and
 * then to stay "here"), answered with who else is around. Only my own row is written.
 */
export async function syncPresence(input: { scene: string; x: number; y: number; bubble?: string }): Promise<PresenceResult> {
  const gate = await littleClubGate();
  if (!gate.ok) return { ok: false };
  const key = gate.profileKey;
  const now = Date.now();
  try {
    const outcome = await runCommit(PRESENCE_TABLES, (data) =>
      planPresence(data, { now, key, scene: String(input?.scene ?? ""), x: Number(input?.x), y: Number(input?.y), bubble: typeof input?.bubble === "string" ? input.bubble : undefined }),
    );
    if (!outcome.ok) return { ok: false };
  } catch (error) {
    console.error("[little-club] presence write failed", error);
    return { ok: false };
  }
  const { ready, peers } = await loadPeers(key, now);
  return ready ? { ok: true, peers } : { ok: false };
}

/** Who else is around (read only), every few seconds while the club is open on screen. */
export async function peekPresence(): Promise<PresenceResult> {
  const gate = await littleClubGate();
  if (!gate.ok) return { ok: false };
  const { ready, peers } = await loadPeers(gate.profileKey, Date.now());
  return ready ? { ok: true, peers } : { ok: false };
}
