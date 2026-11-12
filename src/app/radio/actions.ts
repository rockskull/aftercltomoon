"use server";

import { updateTag } from "next/cache";
import { guessTrack, youtubeVideoId, type RadioTrack } from "@/lib/radio";
import { readSession } from "@/server/auth/session";
import { NEEDS } from "@/server/domain/operations";
import { activeTracks, planAddTrack, planDeleteTrack, toPublic } from "@/server/domain/radio";
import { checkVideo, loadRadio } from "@/server/radio";
import { RADIO_TAG, runCommit } from "@/server/store";

export type LookupResult =
  | { ok: true; videoId: string; title: string; artist: string; playable: boolean; duplicate: string | null }
  | { ok: false; message: string };

const LOGIN_NEEDED = "로그인한 멤버만 곡을 신청할 수 있어요.";

/** Fills in title and artist from the link (members fix them if the guess is off). */
export async function lookupTrack(url: string): Promise<LookupResult> {
  if (!(await readSession())) return { ok: false, message: LOGIN_NEEDED };
  const videoId = youtubeVideoId(String(url ?? ""));
  if (!videoId) return { ok: false, message: "YouTube 영상 링크를 붙여넣어 주세요. (youtube.com/watch?v=… 또는 youtu.be/…)" };

  const [video, radio] = await Promise.all([checkVideo(videoId), loadRadio()]);
  if (video.status === "not_found") return { ok: false, message: "영상을 찾을 수 없어요. 비공개이거나 삭제된 영상인지 확인해 주세요." };
  const index = radio.tracks.findIndex((t) => t.videoId === videoId);
  const duplicate = index === -1 ? null : `#${index + 1} ${radio.tracks[index].artist} — ${radio.tracks[index].title}`;
  const guess = video.status === "ok" ? guessTrack(video.title, video.channel) : { title: "", artist: "" };
  return { ok: true, videoId, ...guess, playable: video.status !== "not_embeddable", duplicate };
}

export type AddResult = { ok: true; track: RadioTrack; position: number } | { ok: false; message: string };

/** ADD TO RADIO: straight to the end of the list (no approval). The server checks the login and membership itself. */
export async function addTrack(input: { url: string; title: string; artist: string; message: string; displayName: string }): Promise<AddResult> {
  const session = await readSession();
  if (!session) return { ok: false, message: LOGIN_NEEDED };
  const videoId = youtubeVideoId(String(input?.url ?? ""));
  if (!videoId) return { ok: false, message: "YouTube 영상 링크를 확인해 주세요." };
  if ((await checkVideo(videoId)).status === "not_found") {
    return { ok: false, message: "영상을 찾을 수 없어요. 비공개이거나 삭제된 영상인지 확인해 주세요." };
  }

  const outcome = await runCommit<{ track: ReturnType<typeof activeTracks>[number]; position: number }>(NEEDS.radio, (data) =>
    planAddTrack(data, {
      now: Date.now(),
      email: session.email,
      sessionName: session.name,
      input: {
        videoId,
        title: String(input.title ?? ""),
        artist: String(input.artist ?? ""),
        message: String(input.message ?? ""),
        displayName: String(input.displayName ?? ""),
      },
    }),
  );
  if (!outcome.ok) return { ok: false, message: outcome.message };
  updateTag(RADIO_TAG);
  if (!outcome.result) return { ok: false, message: "이미 추가된 신청이에요. 목록을 새로고침해 주세요." };
  return { ok: true, track: toPublic([outcome.result.track], true)[0], position: outcome.result.position };
}

/** DELETE TRACK (admins only, re-checked against the live Members tab). Soft delete: the row stays in the sheet. */
export async function deleteTrack(trackId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await readSession();
  if (!session) return { ok: false, message: "곡 삭제는 ADMIN만 할 수 있어요." };
  const outcome = await runCommit(NEEDS.radio, (data) =>
    planDeleteTrack(data, { now: Date.now(), email: session.email, trackId: String(trackId ?? "") }),
  );
  if (!outcome.ok) return { ok: false, message: outcome.message };
  updateTag(RADIO_TAG);
  return { ok: true };
}
