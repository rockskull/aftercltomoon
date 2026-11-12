import { ARTIST_MAX, isVideoId, MESSAGE_MAX, TITLE_MAX, watchUrl, type RadioTrack } from "@/lib/radio";
import type { Check, Op } from "../store/commit";
import { newId, seoulIso } from "../store/ids";
import { cellText, type Row, type Tables } from "../store/schema";
import { normalizeEmail, toMember, type Member } from "./model";

/**
 * AFTER HOURS RADIO rules. Signed-in members add tracks straight to the end of
 * the list (no approval); only admins remove them, and only by marking them
 * deleted, so the history stays in the sheet.
 */

export interface StoredTrack {
  id: string;
  title: string;
  artist: string;
  videoId: string;
  url: string;
  requestedBy: string;
  displayName: string;
  message: string;
  source: "seed" | "member";
  sortOrder: number;
  createdAt: string;
  status: "active" | "deleted";
  deletedAt: string;
  deletedBy: string;
}

export const DISPLAY_NAME_MAX = 40;

export const RADIO_TAB_MISSING =
  "사이트가 쓰는 Apps Script 배포가 아직 이전 버전이라 라디오 목록을 읽지 못해요. Apps Script에서 setupSheets를 실행한 뒤 배포 관리 → 기존 배포 수정(연필) → 버전: 새 버전 → 배포를 해 주세요.";

function toTrack(r: Row): StoredTrack | null {
  const videoId = cellText(r.youtube_video_id).trim();
  const id = cellText(r.track_id).trim();
  if (!id || !isVideoId(videoId)) return null;
  const order = Number(cellText(r.sort_order));
  return {
    id,
    title: cellText(r.title).trim() || "(제목 없음)",
    artist: cellText(r.artist).trim(),
    videoId,
    url: watchUrl(videoId),
    requestedBy: cellText(r.requested_by).trim(),
    displayName: cellText(r.display_name).trim(),
    message: cellText(r.message).trim(),
    source: cellText(r.source).trim().toLowerCase() === "seed" ? "seed" : "member",
    sortOrder: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER,
    createdAt: cellText(r.created_at).trim(),
    status: cellText(r.status).trim().toLowerCase() === "deleted" ? "deleted" : "active",
    deletedAt: cellText(r.deleted_at).trim(),
    deletedBy: cellText(r.deleted_by).trim(),
  };
}

const byOrder = (a: StoredTrack, b: StoredTrack) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** Playable tracks in list order: the 14 seeds first, then requests in the order they came in. */
export function activeTracks(tables: Tables): StoredTrack[] {
  return (tables.RadioTracks ?? [])
    .map(toTrack)
    .filter((t): t is StoredTrack => t !== null && t.status === "active")
    .sort(byOrder);
}

/** Admin view: deleted tracks too (most recently deleted first). */
export function deletedTracks(tables: Tables): StoredTrack[] {
  return (tables.RadioTracks ?? [])
    .map(toTrack)
    .filter((t): t is StoredTrack => t !== null && t.status === "deleted")
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/**
 * What the browser gets. A member's name and story only go to signed-in members;
 * the club's own lines (seed tracks) are shown to everyone. Member ids never leave.
 */
export function toPublic(tracks: StoredTrack[], showPeople: boolean): RadioTrack[] {
  return tracks.map((t) => {
    const visible = showPeople || t.source === "seed";
    return {
      id: t.id,
      title: t.title,
      artist: t.artist,
      videoId: t.videoId,
      url: t.url,
      source: t.source,
      displayName: visible ? t.displayName || null : null,
      message: visible ? t.message || null : null,
      createdAt: t.createdAt.slice(0, 10),
    };
  });
}

export function memberByEmail(tables: Tables, email: string): Member | null {
  const target = normalizeEmail(email);
  return (tables.Members ?? []).map(toMember).find((m) => m.email === target) ?? null;
}

/** Club members (Members tab) may add tracks; a suspended account may not. */
export function canAddTrack(member: Member | null): member is Member {
  return Boolean(member && (member.status === "active" || member.status === "applicant"));
}

export function isRadioAdmin(member: Member | null): member is Member {
  return Boolean(member && member.status === "active" && member.role === "admin");
}

export interface TrackInput {
  videoId: string;
  title: string;
  artist: string;
  message: string;
}

type Planned<R> = { commit: { id: string; checks: Check[]; ops: Op[] }; result: R } | { refuse: string };

function audit(now: number, commitId: string, actorId: string, action: string, targetId: string, before: unknown, after: unknown): Op {
  return {
    type: "append",
    table: "AuditLog",
    row: {
      log_id: newId("LOG", now, 6),
      commit_id: commitId,
      actor_id: actorId,
      action,
      target_id: targetId,
      before_value: before ? JSON.stringify(before) : "",
      after_value: after ? JSON.stringify(after) : "",
      created_at: seoulIso(now),
    },
  };
}

/** Member: add a track to the end of the list (no approval). One entry per video. */
export function planAddTrack(
  data: Tables,
  ctx: { now: number; email: string; sessionName: string; input: TrackInput },
): Planned<{ track: StoredTrack; position: number }> {
  if (data.RadioTracks === undefined) return { refuse: RADIO_TAB_MISSING };
  const member = memberByEmail(data, ctx.email);
  if (!canAddTrack(member)) return { refuse: "곡 신청은 클럽 회원만 할 수 있어요. 회원권을 신청하면 함께할 수 있어요." };

  const title = ctx.input.title.trim();
  const artist = ctx.input.artist.trim();
  const message = ctx.input.message.trim().replace(/\s+/g, " ");
  if (!isVideoId(ctx.input.videoId)) return { refuse: "YouTube 영상 링크를 확인해 주세요." };
  if (!title || title.length > TITLE_MAX) return { refuse: `곡명을 ${TITLE_MAX}자 이내로 적어 주세요.` };
  if (!artist || artist.length > ARTIST_MAX) return { refuse: `아티스트를 ${ARTIST_MAX}자 이내로 적어 주세요.` };
  if (message.length > MESSAGE_MAX) return { refuse: `사연은 ${MESSAGE_MAX}자까지 쓸 수 있어요.` };

  const list = activeTracks(data);
  const index = list.findIndex((t) => t.videoId === ctx.input.videoId);
  if (index !== -1) {
    const t = list[index];
    return { refuse: `이미 목록에 있는 곡이에요: #${index + 1} ${t.artist} — ${t.title}` };
  }

  const orders = (data.RadioTracks ?? []).map((r) => Number(cellText(r.sort_order))).filter(Number.isFinite);
  const sortOrder = Math.max(0, ...orders) + 1;
  const commitId = newId("C", ctx.now, 8);
  const row: Row = {
    track_id: newId("RT", ctx.now),
    title,
    artist,
    youtube_url: watchUrl(ctx.input.videoId),
    youtube_video_id: ctx.input.videoId,
    requested_by: member.id,
    display_name: member.name || ctx.sessionName,
    message,
    source: "member",
    sort_order: sortOrder,
    created_at: seoulIso(ctx.now),
    status: "active",
    deleted_at: "",
    deleted_by: "",
  };
  return {
    commit: {
      id: commitId,
      checks: [
        { type: "exists", table: "Members", id: member.id, fields: { status: ["active", "applicant"] } },
        // Two people adding the same video at once: only the first lands.
        { type: "absent", table: "RadioTracks", where: { youtube_video_id: ctx.input.videoId, status: "active" } },
      ],
      ops: [{ type: "append", table: "RadioTracks", row }, audit(ctx.now, commitId, member.id, "radio.add", cellText(row.track_id), null, row)],
    },
    result: { track: toTrack(row)!, position: list.length + 1 },
  };
}

/** Admin: take a track off the list (status = deleted). The row and its history stay in the sheet. */
export function planDeleteTrack(data: Tables, ctx: { now: number; email: string; trackId: string }): Planned<{ trackId: string }> {
  if (data.RadioTracks === undefined) return { refuse: RADIO_TAB_MISSING };
  const member = memberByEmail(data, ctx.email);
  if (!isRadioAdmin(member)) return { refuse: "곡 삭제는 ADMIN만 할 수 있어요." };
  const row = (data.RadioTracks ?? []).find((r) => cellText(r.track_id) === ctx.trackId);
  if (!row || cellText(row.status).trim().toLowerCase() === "deleted") return { refuse: "이미 삭제됐거나 없는 곡이에요." };
  const commitId = newId("C", ctx.now, 8);
  const set: Row = { status: "deleted", deleted_at: seoulIso(ctx.now), deleted_by: member.id };
  return {
    commit: {
      id: commitId,
      checks: [
        { type: "exists", table: "Members", id: member.id, fields: { role: "admin", status: "active" } },
        { type: "exists", table: "RadioTracks", id: ctx.trackId, fields: { status: cellText(row.status) } },
      ],
      ops: [
        { type: "update", table: "RadioTracks", id: ctx.trackId, set },
        audit(ctx.now, commitId, member.id, "radio.delete", ctx.trackId, { status: cellText(row.status), title: cellText(row.title) }, set),
      ],
    },
    result: { trackId: ctx.trackId },
  };
}

const ADMIN_ONLY = "라디오 트랙 관리는 ADMIN만 할 수 있어요.";

function adminAndRow(data: Tables, email: string, trackId: string): { refuse: string } | { member: Member; row: Row } {
  if (data.RadioTracks === undefined) return { refuse: RADIO_TAB_MISSING };
  const member = memberByEmail(data, email);
  if (!isRadioAdmin(member)) return { refuse: ADMIN_ONLY };
  const row = (data.RadioTracks ?? []).find((r) => cellText(r.track_id) === trackId);
  if (!row) return { refuse: "곡을 찾을 수 없어요." };
  return { member, row };
}

const adminCheck = (member: Member): Check => ({ type: "exists", table: "Members", id: member.id, fields: { role: "admin", status: "active" } });

/**
 * Admin: fix a track's title/artist, the name shown for it (display_name) and its
 * line (message — a requester's story, or a note from the crew on any track).
 */
export function planEditTrack(
  data: Tables,
  ctx: { now: number; email: string; trackId: string; set: { title: string; artist: string; displayName: string; message: string } },
): Planned<{ trackId: string }> {
  const found = adminAndRow(data, ctx.email, ctx.trackId);
  if ("refuse" in found) return { refuse: found.refuse };
  const { member, row } = found;
  const next: Row = {
    title: ctx.set.title.trim(),
    artist: ctx.set.artist.trim(),
    display_name: ctx.set.displayName.trim(),
    message: ctx.set.message.trim().replace(/\s+/g, " "),
  };
  if (!next.title || String(next.title).length > TITLE_MAX) return { refuse: `곡명을 ${TITLE_MAX}자 이내로 적어 주세요.` };
  if (!next.artist || String(next.artist).length > ARTIST_MAX) return { refuse: `아티스트를 ${ARTIST_MAX}자 이내로 적어 주세요.` };
  if (String(next.display_name).length > DISPLAY_NAME_MAX) return { refuse: `표시 이름은 ${DISPLAY_NAME_MAX}자까지 쓸 수 있어요.` };
  if (String(next.message).length > MESSAGE_MAX) return { refuse: `메모는 ${MESSAGE_MAX}자까지 쓸 수 있어요.` };
  const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => cellText(row[k]).trim() !== v)) as Row;
  const fields = Object.keys(changed);
  if (!fields.length) return { refuse: "바뀐 내용이 없어요." };
  const commitId = newId("C", ctx.now, 8);
  const before = Object.fromEntries(fields.map((f) => [f, cellText(row[f])]));
  return {
    commit: {
      id: commitId,
      checks: [adminCheck(member), { type: "exists", table: "RadioTracks", id: ctx.trackId, fields: before }],
      ops: [
        { type: "update", table: "RadioTracks", id: ctx.trackId, set: changed },
        audit(ctx.now, commitId, member.id, "radio.edit", ctx.trackId, before, changed),
      ],
    },
    result: { trackId: ctx.trackId },
  };
}

/** Admin: move a track one place up or down in the play order (swaps sort_order with its neighbour). */
export function planMoveTrack(
  data: Tables,
  ctx: { now: number; email: string; trackId: string; direction: "up" | "down" },
): Planned<{ trackId: string }> {
  const found = adminAndRow(data, ctx.email, ctx.trackId);
  if ("refuse" in found) return { refuse: found.refuse };
  const list = activeTracks(data);
  const i = list.findIndex((t) => t.id === ctx.trackId);
  if (i === -1) return { refuse: "삭제된 곡은 순서를 바꿀 수 없어요." };
  const j = ctx.direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return { refuse: ctx.direction === "up" ? "이미 맨 위예요." : "이미 맨 아래예요." };
  const a = list[i];
  const b = list[j];
  // Ties (two requests saved at the same moment) get pulled apart by half a step.
  const newA = a.sortOrder === b.sortOrder ? b.sortOrder + (ctx.direction === "up" ? -0.5 : 0.5) : b.sortOrder;
  const newB = a.sortOrder;
  const commitId = newId("C", ctx.now, 8);
  const rowOf = (id: string) => (data.RadioTracks ?? []).find((r) => cellText(r.track_id) === id)!;
  return {
    commit: {
      id: commitId,
      checks: [
        adminCheck(found.member),
        { type: "exists", table: "RadioTracks", id: a.id, fields: { sort_order: cellText(rowOf(a.id).sort_order), status: "active" } },
        { type: "exists", table: "RadioTracks", id: b.id, fields: { sort_order: cellText(rowOf(b.id).sort_order), status: "active" } },
      ],
      ops: [
        { type: "update", table: "RadioTracks", id: a.id, set: { sort_order: newA } },
        ...(a.sortOrder === b.sortOrder ? [] : [{ type: "update" as const, table: "RadioTracks" as const, id: b.id, set: { sort_order: newB } }]),
        audit(ctx.now, commitId, found.member.id, "radio.move", a.id, { sort_order: a.sortOrder }, { sort_order: newA, direction: ctx.direction }),
      ],
    },
    result: { trackId: a.id },
  };
}

/** Admin: put a deleted track back where it was. */
export function planRestoreTrack(data: Tables, ctx: { now: number; email: string; trackId: string }): Planned<{ trackId: string }> {
  const found = adminAndRow(data, ctx.email, ctx.trackId);
  if ("refuse" in found) return { refuse: found.refuse };
  const { member, row } = found;
  if (cellText(row.status).trim().toLowerCase() !== "deleted") return { refuse: "삭제된 곡이 아니에요." };
  const videoId = cellText(row.youtube_video_id).trim();
  const list = activeTracks(data);
  const dup = list.findIndex((t) => t.videoId === videoId);
  if (dup !== -1) return { refuse: `같은 영상이 이미 목록에 있어요: #${dup + 1} ${list[dup].artist} — ${list[dup].title}` };
  const commitId = newId("C", ctx.now, 8);
  const set: Row = { status: "active", deleted_at: "", deleted_by: "" };
  return {
    commit: {
      id: commitId,
      checks: [
        adminCheck(member),
        { type: "exists", table: "RadioTracks", id: ctx.trackId, fields: { status: cellText(row.status) } },
        { type: "absent", table: "RadioTracks", where: { youtube_video_id: videoId, status: "active" } },
      ],
      ops: [
        { type: "update", table: "RadioTracks", id: ctx.trackId, set },
        audit(ctx.now, commitId, member.id, "radio.restore", ctx.trackId, { status: "deleted" }, set),
      ],
    },
    result: { trackId: ctx.trackId },
  };
}

/** The seed rows, as setupSheets writes them once (also used for the demo and the sheet template). */
export function seedRows(seed: ReadonlyArray<{ artist: string; title: string; videoId: string }>, createdAt: string): Row[] {
  return seed.map((t, i) => ({
    track_id: `RT-SEED-${String(i + 1).padStart(2, "0")}`,
    title: t.title,
    artist: t.artist,
    youtube_url: watchUrl(t.videoId),
    youtube_video_id: t.videoId,
    requested_by: "AFTER CL TO MOON",
    display_name: "AFTER CL TO MOON",
    message: "",
    source: "seed",
    sort_order: i + 1,
    created_at: createdAt,
    status: "active",
    deleted_at: "",
    deleted_by: "",
  }));
}
