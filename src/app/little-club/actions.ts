"use server";

import { refresh } from "next/cache";
import { cleanNickname } from "@/lib/little-club";
import type { ClubBlock, ClubProfile } from "@/server/domain/little-club";
import { CLUB_TABLE_MISSING, planClubProfileSave } from "@/server/domain/little-club";
import { clubNotices, littleClubGate, type ClubNotices } from "@/server/little-club";
import { runCommit } from "@/server/store";
import { LITTLE_CLUB_TABLES } from "@/server/store/schema";

export type SaveProfileResult = { ok: true; profile: ClubProfile } | { ok: false; message: string; reason?: ClubBlock };

/**
 * Save the signed-in member's nickname + MBTI. The member comes from the session
 * (re-checked against the live data), never from the request: there is no way to
 * name another member here.
 */
export async function saveClubProfile(input: { nickname: string; mbti: string }): Promise<SaveProfileResult> {
  const gate = await littleClubGate({ fresh: true });
  if (!gate.ok) return { ok: false, reason: gate.reason, message: gate.reason === "login" ? "로그인이 필요해요." : "이용이 중지된 계정이에요. 운영진에게 문의해 주세요." };
  const memberId = gate.profileKey;
  const nickname = typeof input?.nickname === "string" ? input.nickname : "";
  const mbti = typeof input?.mbti === "string" ? input.mbti : "";
  let outcome;
  try {
    outcome = await runCommit<ClubProfile>(["Members", ...LITTLE_CLUB_TABLES], (data) => planClubProfileSave(data, { now: Date.now(), memberId, nickname, mbti }));
  } catch (error) {
    // e.g. the profile table doesn't exist yet in the database
    console.error("[little-club] profile save failed", error);
    return { ok: false, message: CLUB_TABLE_MISSING };
  }
  if (!outcome.ok) return { ok: false, message: outcome.message };
  refresh();
  // noop (nothing changed) has no result: echo the cleaned values back.
  return { ok: true, profile: outcome.result ?? { nickname: cleanNickname(nickname) ?? nickname, mbti: mbti.trim().toUpperCase() as ClubProfile["mbti"] } };
}

/** The bell, re-read when the member comes back to the tab or a push arrives (no polling). Only their own notices. */
export async function refreshClubNotices(): Promise<({ ok: true } & ClubNotices) | { ok: false }> {
  const gate = await littleClubGate({ fresh: true });
  if (!gate.ok) return { ok: false };
  return { ok: true, ...clubNotices(gate.viewer, gate.member, Date.now()) };
}
