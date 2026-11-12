import "server-only";
import { watchUrl, type RadioState } from "@/lib/radio";
import { readSession } from "./auth/session";
import { toSettings } from "./domain/model";
import { activeTracks, canAddTrack, isRadioAdmin, memberByEmail, toPublic } from "./domain/radio";
import { readTables, storeMode } from "./store";
import { RADIO_TABLES } from "./store/schema";

/**
 * The radio as one visitor sees it. Who may add or delete is worked out here on
 * the server from the session + Members tab (never from anything the browser sends).
 */
export async function loadRadio(): Promise<RadioState> {
  const session = await readSession();
  const empty: RadioState = { ready: false, tracks: [], playerEnabled: false, signedIn: Boolean(session), canAdd: false, canDelete: false };
  if (storeMode() === "unconfigured") return empty;
  const tables = await readTables(RADIO_TABLES, { radio: true });
  const member = session ? memberByEmail(tables, session.email) : null;
  const isMember = canAddTrack(member);
  return {
    // An older Apps Script deployment leaves unknown tabs out of the read entirely.
    ready: tables.RadioTracks !== undefined,
    tracks: toPublic(activeTracks(tables), isMember),
    playerEnabled: toSettings(tables.Settings).radioPlayer,
    signedIn: Boolean(session),
    canAdd: isMember,
    canDelete: isRadioAdmin(member),
  };
}

export type VideoCheck =
  | { status: "ok"; title: string; channel: string }
  | { status: "not_embeddable" }
  | { status: "not_found" }
  | { status: "unknown" };

/** YouTube's public oEmbed endpoint (no API key): does the video exist, may it be embedded, what is it called. */
export async function checkVideo(videoId: string): Promise<VideoCheck> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(videoId))}`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (res.status === 200) {
      const body = (await res.json()) as { title?: unknown; author_name?: unknown };
      return { status: "ok", title: String(body.title ?? ""), channel: String(body.author_name ?? "") };
    }
    if (res.status === 401 || res.status === 403) return { status: "not_embeddable" };
    if (res.status === 400 || res.status === 404) return { status: "not_found" };
    return { status: "unknown" };
  } catch {
    return { status: "unknown" };
  }
}
