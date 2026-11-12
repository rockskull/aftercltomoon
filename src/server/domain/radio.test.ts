import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { guessTrack, RADIO_SEED, youtubeVideoId } from "@/lib/radio";
import { applyCommit } from "../store/commit";
import { demoTables, MemoryStore } from "../store/memory";
import type { Row, Tables } from "../store/schema";
import { activeTracks, planAddTrack, planDeleteTrack, RADIO_TAB_MISSING, seedRows, toPublic } from "./radio";

const NOW = Date.parse("2026-11-12T21:00:00+09:00");

function tables(): Tables {
  const member = (id: string, email: string, role = "member", status = "active"): Row => ({ member_id: id, name: id.toLowerCase(), email, role, status });
  return {
    Members: [
      member("ADMIN", "admin@x.dev", "admin"),
      member("OPER", "oper@x.dev", "operator"),
      member("AMY", "amy@x.dev"),
      member("NEW", "new@x.dev", "member", "applicant"),
      member("GONE", "gone@x.dev", "member", "inactive"),
    ],
    RadioTracks: seedRows(RADIO_SEED, "2026-11-12T20:00:00+09:00"),
    AuditLog: [],
  };
}

const add = (data: Tables, email: string, videoId = "cpU7Yrl-AwM", message = "") =>
  planAddTrack(data, { now: NOW, email, sessionName: "Google 이름", input: { videoId, title: "Show Me How (garage session)", artist: "Men I Trust", message } });

describe("YouTube links", () => {
  it("reads the video id from the usual link shapes", () => {
    const id = "OZRYzH0Q0pU";
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&list=RD${id}&t=42s`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}&si=abc`,
      `https://youtu.be/${id}?si=xyz`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
      `  https://youtu.be/${id}  `,
    ]) {
      expect(youtubeVideoId(url), url).toBe(id);
    }
  });

  it("refuses anything that isn't a YouTube video link", () => {
    for (const bad of ["", "OZRYzH0Q0pU", "https://www.youtube.com/results?search_query=peg", "https://vimeo.com/123", "https://evil.com/watch?v=OZRYzH0Q0pU", "javascript:alert(1)", "https://youtu.be/short"]) {
      expect(youtubeVideoId(bad), bad).toBeNull();
    }
  });

  it("guesses title and artist from the video title", () => {
    expect(guessTrack("Khruangbin - Friday Morning (Official Video)", "Night Time Stories")).toEqual({ artist: "Khruangbin", title: "Friday Morning" });
    expect(guessTrack("AIR - La femme d'argent (from Moon Safari - Official Audio)", "AIRfrenchbandofficial")).toEqual({ artist: "AIR", title: "La femme d'argent" });
    expect(guessTrack("Peg", "Steely Dan - Topic")).toEqual({ artist: "Steely Dan", title: "Peg" });
  });
});

describe("seed list", () => {
  it("is the 14 tracks of the handoff, in order", () => {
    expect(RADIO_SEED).toHaveLength(14);
    expect(RADIO_SEED[0]).toMatchObject({ artist: "Khruangbin", title: "Friday Morning" });
    expect(RADIO_SEED[13]).toMatchObject({ artist: "Sigur Rós", title: "Hoppípolla" });
    expect(new Set(RADIO_SEED.map((t) => t.videoId)).size).toBe(14);
  });

  it("is the same list Apps Script seeds", () => {
    const source = readFileSync(join(process.cwd(), "apps-script", "Code.gs"), "utf8");
    const block = /var RADIO_SEED = (\[[\s\S]*?\n\]);/.exec(source)![1];
    const gs = new Function(`return ${block}`)() as string[][];
    expect(gs.map(([artist, title, videoId]) => ({ artist, title, videoId }))).toEqual([...RADIO_SEED]);
  });

  it("seeds are marked as the club's own", () => {
    const rows = seedRows(RADIO_SEED, "2026-11-12T20:00:00+09:00");
    expect(rows[0]).toMatchObject({ track_id: "RT-SEED-01", requested_by: "AFTER CL TO MOON", source: "seed", sort_order: 1, status: "active" });
  });
});

describe("the list", () => {
  it("keeps seeds first, then requests in order, and hides deleted tracks", () => {
    const data = tables();
    data.RadioTracks!.push(
      { track_id: "RT-B", title: "B", artist: "b", youtube_video_id: "bbbbbbbbbbb", source: "member", sort_order: 16, created_at: "2026-11-12T10:00:00+09:00", status: "active" },
      { track_id: "RT-A", title: "A", artist: "a", youtube_video_id: "aaaaaaaaaaa", source: "member", sort_order: 15, created_at: "2026-11-12T09:00:00+09:00", status: "active" },
      { track_id: "RT-X", title: "X", artist: "x", youtube_video_id: "xxxxxxxxxxx", source: "member", sort_order: 17, created_at: "2026-11-12T11:00:00+09:00", status: "deleted" },
    );
    const ids = activeTracks(data).map((t) => t.id);
    expect(ids.slice(0, 2)).toEqual(["RT-SEED-01", "RT-SEED-02"]);
    expect(ids.slice(14)).toEqual(["RT-A", "RT-B"]);
    expect(ids).not.toContain("RT-X");
  });

  it("shows requesters and messages only to members, and never member ids", () => {
    const data = tables();
    const planned = add(data, "amy@x.dev", "cpU7Yrl-AwM", "세팅할 때 듣기 좋아요");
    if ("refuse" in planned) throw new Error(planned.refuse);
    applyCommit(data, planned.commit);
    const visitor = toPublic(activeTracks(data), false).at(-1)!;
    expect(visitor).toMatchObject({ displayName: null, message: null, source: "member" });
    expect(toPublic(activeTracks(data), false)[0].displayName).toBe("AFTER CL TO MOON");
    const member = toPublic(activeTracks(data), true).at(-1)!;
    expect(member).toMatchObject({ displayName: "amy", message: "세팅할 때 듣기 좋아요" });
    expect(JSON.stringify(toPublic(activeTracks(data), true))).not.toContain("AMY");
  });
});

describe("adding a track", () => {
  it("appends a member's request to the end right away", () => {
    const data = tables();
    const planned = add(data, "AMY@x.dev");
    if ("refuse" in planned) throw new Error(planned.refuse);
    expect(planned.result.position).toBe(15);
    expect(applyCommit(data, planned.commit)).toEqual({ ok: true });
    expect(data.RadioTracks!.at(-1)).toMatchObject({ requested_by: "AMY", display_name: "amy", source: "member", sort_order: 15, status: "active", youtube_url: "https://www.youtube.com/watch?v=cpU7Yrl-AwM" });
    expect(data.AuditLog!.at(-1)).toMatchObject({ action: "radio.add", actor_id: "AMY" });
  });

  it("is for club members only (an applicant may, a suspended account or a stranger may not)", () => {
    expect(add(tables(), "new@x.dev")).not.toHaveProperty("refuse");
    expect(add(tables(), "gone@x.dev")).toHaveProperty("refuse");
    expect(add(tables(), "stranger@gmail.com")).toHaveProperty("refuse");
  });

  it("refuses a video that is already on the list, naming the track", () => {
    expect(add(tables(), "amy@x.dev", "MXupeS9hv70")).toEqual({ refuse: "이미 목록에 있는 곡이에요: #3 Steely Dan — Peg" });
  });

  it("lets a deleted track be requested again", () => {
    const data = tables();
    const del = planDeleteTrack(data, { now: NOW, email: "admin@x.dev", trackId: "RT-SEED-03" });
    if ("refuse" in del) throw new Error(del.refuse);
    applyCommit(data, del.commit);
    expect(add(data, "amy@x.dev", "MXupeS9hv70")).not.toHaveProperty("refuse");
  });

  it("two people adding the same video at once: only one lands", () => {
    const data = tables();
    const a = add(data, "amy@x.dev");
    const b = add(data, "new@x.dev");
    if ("refuse" in a || "refuse" in b) throw new Error("refused");
    expect(applyCommit(data, a.commit).ok).toBe(true);
    expect(applyCommit(data, b.commit)).toMatchObject({ ok: false, error: "conflict" });
  });

  it("checks the text fields", () => {
    const data = tables();
    const input = (over: object) =>
      planAddTrack(data, { now: NOW, email: "amy@x.dev", sessionName: "", input: { videoId: "cpU7Yrl-AwM", title: "t", artist: "a", message: "", ...over } });
    expect(input({ title: " " })).toHaveProperty("refuse");
    expect(input({ artist: "" })).toHaveProperty("refuse");
    expect(input({ message: "가".repeat(151) })).toHaveProperty("refuse");
    expect(input({ message: "가".repeat(150) })).not.toHaveProperty("refuse");
    expect(input({ videoId: "not-an-id" })).toHaveProperty("refuse");
  });

  it("explains what to do when the deployed Apps Script doesn't know the tab yet", () => {
    const data = tables();
    delete data.RadioTracks;
    expect(add(data, "amy@x.dev")).toEqual({ refuse: RADIO_TAB_MISSING });
  });
});

describe("deleting a track", () => {
  it("only an admin can, and it is a soft delete", () => {
    const data = tables();
    for (const email of ["amy@x.dev", "oper@x.dev", "stranger@gmail.com"]) {
      expect(planDeleteTrack(data, { now: NOW, email, trackId: "RT-SEED-01" })).toEqual({ refuse: "곡 삭제는 ADMIN만 할 수 있어요." });
    }
    const planned = planDeleteTrack(data, { now: NOW, email: "admin@x.dev", trackId: "RT-SEED-01" });
    if ("refuse" in planned) throw new Error(planned.refuse);
    expect(applyCommit(data, planned.commit)).toEqual({ ok: true });
    expect(data.RadioTracks![0]).toMatchObject({ track_id: "RT-SEED-01", status: "deleted", deleted_by: "ADMIN" });
    expect(data.RadioTracks).toHaveLength(14); // the row stays
    expect(activeTracks(data).map((t) => t.id)).not.toContain("RT-SEED-01");
    expect(planDeleteTrack(data, { now: NOW, email: "admin@x.dev", trackId: "RT-SEED-01" })).toHaveProperty("refuse");
  });

  it("works end to end on the demo store", async () => {
    const store = new MemoryStore(demoTables(NOW));
    const data = await store.read(["Members", "RadioTracks"]);
    expect(activeTracks(data)).toHaveLength(15); // 14 seeds + one request (the deleted one is hidden)
    const planned = planDeleteTrack(data, { now: NOW, email: "admin@aftermoon.dev", trackId: "RT-DEMO-1" });
    if ("refuse" in planned) throw new Error(planned.refuse);
    expect((await store.commit(planned.commit)).ok).toBe(true);
    expect(activeTracks(await store.read(["RadioTracks"]))).toHaveLength(14);
  });
});
