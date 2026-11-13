import "server-only";
import { memberAccess } from "@/lib/access";
import { toDateKey } from "@/lib/dates";
import { watchUrl, type RadioState } from "@/lib/radio";
import { readSession } from "./auth/session";
import { toMembership, toPayment, toSettings } from "./domain/model";
import { activeTracks, isRadioAdmin, memberByEmail, toPublic } from "./domain/radio";
import { readTables, storeMode } from "./store";
import { RADIO_TABLES } from "./store/schema";

/**
 * The radio as one visitor sees it. Who may add or delete is worked out here on
 * the server from the session + member data (never from anything the browser sends),
 * with the same member-state rule as every other member feature (src/lib/access.ts).
 */
export async function loadRadio(): Promise<RadioState> {
  const session = await readSession();
  const empty: RadioState = { ready: false, tracks: [], playerEnabled: false, signedIn: Boolean(session), canAdd: false, canDelete: false, myName: null, blockReason: null };
  if (storeMode() === "unconfigured") return empty;
  const tables = await readTables(RADIO_TABLES, { radio: true });
  const member = session ? memberByEmail(tables, session.email) : null;
  const access = session
    ? memberAccess({
        member,
        memberships: (tables.Memberships ?? []).map(toMembership),
        payments: (tables.Payments ?? []).map(toPayment),
        todayKey: toDateKey(Date.now()),
      })
    : null;
  const canAdd = Boolean(access?.canParticipate);
  return {
    // An older Apps Script deployment leaves unknown tabs out of the read entirely.
    ready: tables.RadioTracks !== undefined,
    // Names and stories stay visible to signed-in members even after a membership ends (records are never hidden).
    tracks: toPublic(activeTracks(tables), Boolean(member && member.status !== "inactive")),
    playerEnabled: toSettings(tables.Settings).radioPlayer,
    signedIn: Boolean(session),
    canAdd,
    canDelete: isRadioAdmin(member),
    myName: canAdd ? member?.name || session?.name || "" : null,
    blockReason: access && !access.canParticipate ? access.blockReason : null,
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
