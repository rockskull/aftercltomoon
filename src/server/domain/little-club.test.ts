import { describe, expect, it } from "vitest";
import { cleanBubble, cleanNickname, nameTag } from "@/lib/little-club";
import { applyCommit } from "../store/commit";
import type { Row, Tables } from "../store/schema";
import { CLUB_TABLE_MISSING, clubProfileOf, GUEST_KEY_PREFIX, littleClubVerdict, myBubbleOf, peersOf, planClubProfileSave, planPresence } from "./little-club";

const TODAY = "2026-12-10";
const NOW = Date.parse(`${TODAY}T12:00:00+09:00`);

describe("who may enter THE LITTLE CLUB", () => {
  it("lets in anyone signed in, member or not, membership or not", () => {
    expect(littleClubVerdict(null)).toEqual({ ok: true }); // signed in, not on the member list
    for (const status of ["active", "applicant"]) expect(littleClubVerdict({ status })).toEqual({ ok: true });
  });

  it("keeps out only accounts the crew suspended", () => {
    expect(littleClubVerdict({ status: "inactive" })).toEqual({ ok: false, reason: "suspended" });
  });
});

describe("nickname and bubble input", () => {
  it("keeps nicknames short and plain", () => {
    expect(cleanNickname("  달  토끼  ")).toBe("달 토끼");
    expect(cleanNickname("moon_01!")).toBe("moon_01!");
    expect(cleanNickname("")).toBeNull();
    expect(cleanNickname("   ")).toBeNull();
    expect(cleanNickname("열세글자열세글자열세글자열")).toBeNull();
    expect(cleanNickname("<script>")).toBeNull();
    expect(cleanNickname('a"b')).toBeNull();
    expect(cleanNickname("tab\there")).toBe("tab here");
  });

  it("keeps one short bubble line", () => {
    expect(cleanBubble("  지금   쉬는 중  ")).toBe("지금 쉬는 중");
    expect([...cleanBubble("가".repeat(50))]).toHaveLength(30);
    expect(cleanBubble("a\u0000b​c")).toBe("abc");
  });

  it("tags the rabbit as 별명 · MBTI", () => {
    expect(nameTag("달토끼", "INFP")).toBe("달토끼 · INFP");
  });
});

describe("saving the profile", () => {
  function tables(): Tables {
    const m = (id: string): Row => ({ member_id: id, name: id, email: `${id}@x.dev`, role: "member", status: "active" });
    return { Members: [m("A"), m("B")], ClubProfiles: [], AuditLog: [] };
  }
  const save = (data: Tables, over: Partial<{ memberId: string; nickname: string; mbti: string }> = {}) =>
    planClubProfileSave(data, { now: NOW, memberId: "A", nickname: "달토끼", mbti: "infp", ...over });

  it("creates the member's row on the first save, then updates it", () => {
    const data = tables();
    const first = save(data);
    if (!("commit" in first)) throw new Error("refused");
    expect(applyCommit(data, first.commit)).toEqual({ ok: true });
    expect(data.ClubProfiles).toHaveLength(1);
    expect(clubProfileOf(data, "A")).toMatchObject({ nickname: "달토끼", mbti: "INFP" });
    expect(data.AuditLog![0]).toMatchObject({ action: "little_club.profile", actor_id: "A", target_id: "A" });

    const second = save(data, { nickname: "밤토끼", mbti: "ESTP" });
    if (!("commit" in second)) throw new Error("refused");
    expect(applyCommit(data, second.commit)).toEqual({ ok: true });
    expect(data.ClubProfiles).toHaveLength(1);
    expect(clubProfileOf(data, "A")).toMatchObject({ nickname: "밤토끼", mbti: "ESTP" });
  });

  it("never touches another member's row", () => {
    const data = tables();
    const b = save(data, { memberId: "B", nickname: "비", mbti: "ENFJ" });
    if (!("commit" in b)) throw new Error("refused");
    applyCommit(data, b.commit);
    const a = save(data);
    if (!("commit" in a)) throw new Error("refused");
    applyCommit(data, a.commit);
    expect(clubProfileOf(data, "B")).toMatchObject({ nickname: "비", mbti: "ENFJ" });
    expect(clubProfileOf(data, "A")).toMatchObject({ nickname: "달토끼", mbti: "INFP" });
    expect(clubProfileOf(data, "C")).toBeNull();
  });

  it("lets only one of two first saves land", () => {
    const data = tables();
    const one = save(data);
    const two = save(data, { nickname: "둘" });
    if (!("commit" in one) || !("commit" in two)) throw new Error("refused");
    expect(applyCommit(data, one.commit).ok).toBe(true);
    expect(applyCommit(data, two.commit)).toMatchObject({ ok: false, error: "conflict" });
    expect(data.ClubProfiles).toHaveLength(1);
  });

  it("refuses bad input, unknown members, and a missing table", () => {
    expect(save(tables(), { nickname: "" })).toHaveProperty("refuse");
    expect(save(tables(), { nickname: "<b>hi</b>" })).toHaveProperty("refuse");
    expect(save(tables(), { mbti: "ABCD" })).toHaveProperty("refuse");
    expect(save(tables(), { memberId: "NOPE" })).toHaveProperty("refuse");
    const noTable = tables();
    delete noTable.ClubProfiles;
    expect(save(noTable)).toEqual({ refuse: CLUB_TABLE_MISSING });
  });

  it("saves a profile for a signed-in visitor who isn't on the member list (opaque key)", () => {
    const data = tables();
    const key = GUEST_KEY_PREFIX + "0123456789abcdef01234567";
    const guest = save(data, { memberId: key, nickname: "손님토끼", mbti: "ISFP" });
    if (!("commit" in guest)) throw new Error("refused");
    expect(applyCommit(data, guest.commit)).toEqual({ ok: true });
    expect(clubProfileOf(data, key)).toMatchObject({ nickname: "손님토끼", mbti: "ISFP" });
    // members untouched, and a made-up member id is still refused
    expect(clubProfileOf(data, "A")).toBeNull();
    expect(save(data, { memberId: "M-MADE-UP" })).toHaveProperty("refuse");
  });

  it("does nothing when nothing changed", () => {
    const data = tables();
    const first = save(data);
    if (!("commit" in first)) throw new Error("refused");
    applyCommit(data, first.commit);
    expect(save(data)).toEqual({ noop: true });
  });
});

describe("who is in the club right now", () => {
  const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000 + 9 * 3600_000).toISOString().slice(0, 19) + "+09:00";
  function club(): Tables {
    const m = (id: string): Row => ({ member_id: id, name: id, email: `${id}@x.dev`, role: "member", status: "active" });
    return {
      Members: [m("A"), m("B"), m("C"), m("D")],
      ClubProfiles: [
        { member_id: "A", nickname: "에이", mbti: "INFP", visible: "true" },
        { member_id: "B", nickname: "비", mbti: "ESTP", visible: "" }, // from before the setting → shown
        { member_id: "C", nickname: "씨", mbti: "ISFJ", visible: "false" }, // chose "only me"
        { member_id: "D", nickname: "디", mbti: "ENFJ", visible: "true" },
      ],
      ClubPresence: [
        { member_id: "B", scene: "outdoor", x: 200, y: 260, bubble: "불멍 중", bubble_at: at(5), seen_at: at(1) },
        { member_id: "C", scene: "indoor", x: 100, y: 200, bubble: "", bubble_at: "", seen_at: at(0) },
        { member_id: "D", scene: "indoor", x: 300, y: 250, bubble: "옛날 말풍선", bubble_at: at(45), seen_at: at(10) }, // left
      ],
      AuditLog: [],
    };
  }

  it("shows the others who are here and chose to be seen, never me", () => {
    const peers = peersOf(club(), "A", NOW);
    expect(peers.map((p) => p.key)).toEqual(["B"]); // C hid, D left 10 min ago
    expect(peers[0]).toMatchObject({ nickname: "비", mbti: "ESTP", scene: "outdoor", x: 200, y: 260, bubble: "불멍 중" });
    expect(peersOf(club(), "B", NOW).map((p) => p.key)).toEqual([]);
  });

  it("records only my own row, with one bubble that stays until I change it", () => {
    const data = club();
    const first = planPresence(data, { now: NOW, key: "A", scene: "indoor", x: 120.6, y: 999, bubble: "  오늘은   슬랩 " });
    if (!("commit" in first)) throw new Error("refused");
    applyCommit(data, first.commit);
    expect(data.ClubPresence!.find((r) => r.member_id === "A")).toMatchObject({ scene: "indoor", x: 121, y: 320, bubble: "오늘은 슬랩" });
    // moving outside without a new bubble keeps it
    const moved = planPresence(data, { now: NOW + 1000, key: "A", scene: "outdoor", x: 60, y: 270 });
    if (!("commit" in moved)) throw new Error("refused");
    applyCommit(data, moved.commit);
    expect(myBubbleOf(data, "A", NOW + 1000)).toBe("오늘은 슬랩");
    expect(data.ClubPresence!.filter((r) => r.member_id === "A")).toHaveLength(1);
    expect(data.ClubPresence!.find((r) => r.member_id === "B")).toMatchObject({ scene: "outdoor", bubble: "불멍 중" }); // untouched
    expect(data.AuditLog).toHaveLength(0); // presence is not a record
  });

  it("lets a bubble fade after 30 minutes", () => {
    expect(myBubbleOf(club(), "D", NOW)).toBe("");
    expect(myBubbleOf(club(), "B", NOW)).toBe("불멍 중");
  });

  it("needs a saved rabbit, a real scene, and the table", () => {
    const data = club();
    expect(planPresence(data, { now: NOW, key: "NOBODY", scene: "indoor", x: 1, y: 1 })).toHaveProperty("refuse");
    expect(planPresence(data, { now: NOW, key: "A", scene: "rooftop", x: 1, y: 1 })).toHaveProperty("refuse");
    delete data.ClubPresence;
    expect(planPresence(data, { now: NOW, key: "A", scene: "indoor", x: 1, y: 1 })).toEqual({ refuse: CLUB_TABLE_MISSING });
  });

  it("saves the show-to-others choice with the profile (shown by default)", () => {
    const data: Tables = { Members: [{ member_id: "A", name: "A", email: "a@x.dev", role: "member", status: "active" }], ClubProfiles: [], AuditLog: [] };
    const made = planClubProfileSave(data, { now: NOW, memberId: "A", nickname: "에이", mbti: "INFP" });
    if (!("commit" in made)) throw new Error("refused");
    applyCommit(data, made.commit);
    expect(clubProfileOf(data, "A")!.visible).toBe(true);
    const hidden = planClubProfileSave(data, { now: NOW, memberId: "A", nickname: "에이", mbti: "INFP", visible: false });
    if (!("commit" in hidden)) throw new Error("refused");
    applyCommit(data, hidden.commit);
    expect(clubProfileOf(data, "A")!.visible).toBe(false);
    // changing only the nickname keeps the choice
    const renamed = planClubProfileSave(data, { now: NOW, memberId: "A", nickname: "에이에이", mbti: "INFP" });
    if (!("commit" in renamed)) throw new Error("refused");
    applyCommit(data, renamed.commit);
    expect(clubProfileOf(data, "A")).toEqual({ nickname: "에이에이", mbti: "INFP", visible: false });
  });
});
