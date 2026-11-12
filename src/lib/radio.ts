/**
 * AFTER HOURS RADIO — a playlist the members build together (YouTube links).
 * Shared by the server and the browser: seed list, URL parsing, display types.
 */

export const RADIO_SEED_BY = "AFTER CL TO MOON";

/**
 * The 14 seed tracks, in order. Each link was checked against the title and
 * artist, official uploads first, and played through the YouTube IFrame player
 * (2026-11-12). RIDE ON TIME has no official full upload on YouTube, so it uses
 * the most-watched fan upload (replace or delete it in the sheet any time).
 * Apps Script seeds the same list once (apps-script/Code.gs RADIO_SEED); a test
 * keeps the two in sync.
 */
export const RADIO_SEED: ReadonlyArray<{ artist: string; title: string; videoId: string }> = [
  { artist: "Khruangbin", title: "Friday Morning", videoId: "KjQSSYOTXzk" }, // Night Time Stories (label), official video
  { artist: "Men I Trust", title: "Show Me How", videoId: "OZRYzH0Q0pU" }, // Men I Trust
  { artist: "Steely Dan", title: "Peg", videoId: "MXupeS9hv70" }, // Steely Dan - Topic, album "Aja"
  { artist: "Tatsuro Yamashita", title: "SPARKLE", videoId: "pqobRu9aR3M" }, // official channel, music video (2023)
  { artist: "Nujabes", title: "Aruarian Dance", videoId: "qYcoJpqCha4" }, // Nujabes
  { artist: "BADBADNOTGOOD", title: "Time Moves Slow", videoId: "GpSWv71IsVw" }, // Innovative Leisure (label)
  { artist: "Radiohead", title: "Weird Fishes/Arpeggi", videoId: "TNRCvG9YtYI" }, // Radiohead, video by Tobias Stretch
  { artist: "toe", title: "Goodbye (feat. Toki Asako)", videoId: "aVLviSRNeLw" }, // Topshelf Records (label), album version
  { artist: "Tatsuro Yamashita", title: "RIDE ON TIME", videoId: "3yWSSB-TIew" }, // fan upload (no official one exists)
  { artist: "Steely Dan", title: "Aja", videoId: "CYZwVf07tHA" }, // Steely Dan - Topic, album "Aja"
  { artist: "Khruangbin", title: "Time (You and I)", videoId: "oc50wHexbwg" }, // Khruangbin, official video
  { artist: "Radiohead", title: "Reckoner", videoId: "_uofQD-N6UI" }, // Radiohead, video by Clement Picon
  { artist: "Air", title: "La femme d'argent", videoId: "YUX8fUrKRNU" }, // AIR, official audio
  { artist: "Sigur Rós", title: "Hoppípolla", videoId: "JAYb8ZyjzD0" }, // Sigur Rós, official music video
];

export const TITLE_MAX = 120;
export const ARTIST_MAX = 80;
export const MESSAGE_MAX = 150;
export const DISPLAY_NAME_MAX = 40;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** The 11-character video id from any usual YouTube link (watch, youtu.be, shorts, music, embed, live). */
export function youtubeVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = /^\/(?:shorts|embed|live|v)\/([^/]+)/.exec(url.pathname)?.[1] ?? null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

export function isVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

/** The link stored and shown: always the plain watch URL (tracking parameters dropped). */
export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

const BRACKETS = /\s*[(\[【「]([^)\]】」]*)[)\]】」]/g;
/** Words that mark a bracket as upload noise ("(Official Video)", "[MV]"); "(Live at …)" or "(feat. …)" stay. */
const NOISE = /official|공식|lyric|audio|video|\bmv\b|m\/v|visuali[sz]er|\bhd\b|\bhq\b|\b4k\b|remaster|full\s*album/i;

/** A best guess of title and artist from a YouTube video title and channel name; members can correct it. */
export function guessTrack(videoTitle: string, channel: string): { title: string; artist: string } {
  const cleaned = videoTitle
    .replace(BRACKETS, (whole, inner: string) => (NOISE.test(inner) ? "" : whole))
    .replace(/\s{2,}/g, " ")
    .trim();
  const split = /^(.+?)\s+[-–—|]\s+(.+)$/.exec(cleaned);
  if (split) return { artist: split[1].trim(), title: split[2].trim().replace(/^["'“]+|["'”]+$/g, "") };
  const artist = channel.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").replace(/\s+official$/i, "").trim();
  return { artist, title: cleaned };
}

/** One track as the page shows it. `displayName`/`message` are null for visitors who aren't signed-in members. */
export interface RadioTrack {
  id: string;
  title: string;
  artist: string;
  videoId: string;
  url: string;
  source: "seed" | "member";
  displayName: string | null;
  message: string | null;
  /** "YYYY-MM-DD" */
  createdAt: string;
}

export interface RadioState {
  /** False until the deployed Apps Script knows the RadioTracks tab. */
  ready: boolean;
  tracks: RadioTrack[];
  /** Settings radio_player = on (turned on by the crew after checking music rights). */
  playerEnabled: boolean;
  signedIn: boolean;
  /** A signed-in club member (Members tab, not suspended). */
  canAdd: boolean;
  /** That member's own name, to prefill the name shown with a request (null for everyone else). */
  myName: string | null;
  /** An active admin. */
  canDelete: boolean;
}
