import { describe, expect, it } from "vitest";
import { cleanBubble, cleanNickname, COOLDOWN_MS, nameTag, parseWallNumbers, PLAY_MS, playPhase } from "@/lib/little-club";
import { applyCommit } from "../store/commit";
import type { Row, Tables } from "../store/schema";
import { CLUB_TABLE_MISSING, clubMembersOf, clubProfileOf, COOLDOWN_REFUSAL, GUEST_KEY_PREFIX, isOnline, littleClubVerdict, planClubProfileSave, planClubStatus, planSessionSignal, playStateOf, sessionsOf } from "./little-club";

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

  it("tags the rabbit as 별명 · MBTI (· ON/OFF in the game)", () => {
    expect(nameTag("달토끼", "INFP")).toBe("달토끼 · INFP");
    expect(nameTag("달토끼", "INFP", true)).toBe("달토끼 · INFP · ON");
    expect(nameTag("달토끼", "INFP", false)).toBe("달토끼 · INFP · OFF");
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

describe("v7: status lines and ON/OFF", () => {
  const m = (id: string, status = "active"): Row => ({ member_id: id, name: id, email: `${id}@x.dev`, role: "member", status });
  /** A: me. B: ON in one tab. C: ON (an old "only me" row — everyone is shown now). D: last signal 80 s ago. E: no line. S: suspended. */
  function club(): Tables {
    return {
      Members: [m("A"), m("B"), m("C"), m("D"), m("E"), m("S", "inactive")],
      ClubProfiles: [
        { member_id: "A", nickname: "에이", mbti: "INFP", status: "" },
        { member_id: "B", nickname: "비", mbti: "ESTP", status: "불멍 중" },
        { member_id: "C", nickname: "씨", mbti: "ISFJ", visible: "false", status: "슬랩 중" },
        { member_id: "D", nickname: "디", mbti: "ENFJ", status: "다음엔 같이 올라요" },
        { member_id: "E", nickname: "이", mbti: "INTP", status: "" },
        { member_id: "S", nickname: "에스", mbti: "ISTP", status: "정지됨" },
        { member_id: "Z", nickname: "", mbti: "NOPE", status: "" }, // not a usable rabbit
      ],
      ClubSessions: [
        { member_id: "B", sessions: JSON.stringify({ aaaaaaaaaa: NOW - 20_000 }), updated_at: "" },
        { member_id: "C", sessions: JSON.stringify({ cccccccccc: NOW - 1_000 }), updated_at: "" },
        { member_id: "D", sessions: JSON.stringify({ dddddddddd: NOW - 80_000 }), updated_at: "" },
      ],
      AuditLog: [],
    };
  }
  /** As the server decides it: on the member list and not suspended. */
  const allowed = (data: Tables) => (key: string) => {
    const row = (data.Members ?? []).find((r) => r.member_id === key);
    return row !== undefined && littleClubVerdict({ status: String(row.status) }).ok;
  };
  const apply = (data: Tables, planned: ReturnType<typeof planSessionSignal>) => {
    if (!("commit" in planned)) throw new Error(JSON.stringify(planned));
    expect(applyCommit(data, planned.commit)).toEqual({ ok: true });
  };

  it("hands over everyone with a rabbit — ON or OFF — with nickname, MBTI, status line and ON/OFF only", () => {
    const data = club();
    const list = clubMembersOf(data, "A", NOW, allowed(data));
    expect(list).toEqual([
      { key: "B", nickname: "비", mbti: "ESTP", statusText: "불멍 중", isOnline: true },
      { key: "C", nickname: "씨", mbti: "ISFJ", statusText: "슬랩 중", isOnline: true }, // no "only me" any more
      { key: "D", nickname: "디", mbti: "ENFJ", statusText: "다음엔 같이 올라요", isOnline: false }, // OFF, line kept
      { key: "E", nickname: "이", mbti: "INTP", statusText: null, isOnline: false },
    ]);
    // never me; S is suspended; Z has no usable rabbit
    expect(list.map((p) => p.key)).not.toContain("A");
    expect(Object.keys(list[0]).sort()).toEqual(["isOnline", "key", "mbti", "nickname", "statusText"]);
  });

  it("is ON within 75 s of a tab's last signal, OFF after", () => {
    const data = club();
    expect(isOnline(data, "B", NOW)).toBe(true);
    expect(isOnline(data, "B", NOW + 54_000)).toBe(true); // 74 s after the signal
    expect(isOnline(data, "B", NOW + 56_000)).toBe(false); // 76 s
    expect(isOnline(data, "D", NOW)).toBe(false);
    expect(isOnline(data, "NOBODY", NOW)).toBe(false);
  });

  it("a signal touches only my own row and my own tab, with no audit trail", () => {
    const data = club();
    apply(data, planSessionSignal(data, { now: NOW, key: "A", session: "1111111111" }));
    expect(isOnline(data, "A", NOW)).toBe(true);
    expect(data.ClubSessions!.filter((r) => r.member_id === "A")).toHaveLength(1);
    expect(sessionsOf(data.ClubSessions!.find((r) => r.member_id === "B"))).toEqual({ aaaaaaaaaa: NOW - 20_000 }); // untouched
    expect(data.AuditLog).toHaveLength(0);
    // nothing about places or scenes is stored
    expect(Object.keys(data.ClubSessions!.find((r) => r.member_id === "A")!).sort()).toEqual(["member_id", "play_started_at", "sessions", "updated_at"]);
  });

  it("two tabs: closing one keeps me ON; closing both turns me OFF", () => {
    const data = club();
    apply(data, planSessionSignal(data, { now: NOW, key: "A", session: "1111111111" }));
    apply(data, planSessionSignal(data, { now: NOW + 1000, key: "A", session: "2222222222" }));
    apply(data, planSessionSignal(data, { now: NOW + 2000, key: "A", session: "1111111111", leave: true }));
    expect(isOnline(data, "A", NOW + 2000)).toBe(true);
    expect(Object.keys(sessionsOf(data.ClubSessions!.find((r) => r.member_id === "A")))).toEqual(["2222222222"]);
    apply(data, planSessionSignal(data, { now: NOW + 3000, key: "A", session: "2222222222", leave: true }));
    expect(isOnline(data, "A", NOW + 3000)).toBe(false);
  });

  it("a tab that never says goodbye drops out after the window, and old entries are pruned on the next write", () => {
    const data = club();
    apply(data, planSessionSignal(data, { now: NOW, key: "A", session: "1111111111" }));
    expect(isOnline(data, "A", NOW + 76_000)).toBe(false);
    apply(data, planSessionSignal(data, { now: NOW + 200_000, key: "A", session: "3333333333" }));
    expect(Object.keys(sessionsOf(data.ClubSessions!.find((r) => r.member_id === "A")))).toEqual(["3333333333"]);
  });

  it("anyone with a rabbit signals ON; someone without one keeps no entry", () => {
    const data = club();
    apply(data, planSessionSignal(data, { now: NOW, key: "E", session: "4444444444" }));
    expect(isOnline(data, "E", NOW)).toBe(true);
    expect(planSessionSignal(data, { now: NOW, key: "NOBODY", session: "5555555555" })).toEqual({ noop: true }); // no row made
  });

  it("two tabs signalling at once: the second re-reads instead of overwriting", () => {
    const data = club();
    apply(data, planSessionSignal(data, { now: NOW, key: "A", session: "1111111111" }));
    const one = planSessionSignal(data, { now: NOW + 10, key: "A", session: "1111111111" });
    const two = planSessionSignal(data, { now: NOW + 20, key: "A", session: "2222222222" });
    if (!("commit" in one) || !("commit" in two)) throw new Error("refused");
    expect(applyCommit(data, one.commit).ok).toBe(true);
    expect(applyCommit(data, two.commit)).toMatchObject({ ok: false, error: "conflict" });
  });

  it("ignores junk in the stored map and refuses a bad tab key or a missing table", () => {
    expect(sessionsOf({ sessions: "not json" })).toEqual({});
    expect(sessionsOf({ sessions: JSON.stringify({ "bad key!": 1, abcdef1234: "x", abcdef5678: 5 }) })).toEqual({ abcdef5678: 5 });
    const data = club();
    expect(planSessionSignal(data, { now: NOW, key: "A", session: "<script>" })).toHaveProperty("refuse");
    delete data.ClubSessions;
    expect(planSessionSignal(data, { now: NOW, key: "A", session: "1111111111" })).toEqual({ refuse: CLUB_TABLE_MISSING });
  });

  it("keeps one status line per person until they change or clear it (no history, no audit)", () => {
    const data = club();
    const set = planClubStatus(data, { now: NOW, key: "A", status: "  오늘은   슬랩 " });
    if (!("commit" in set)) throw new Error("refused");
    expect(set.result).toEqual({ statusText: "오늘은 슬랩" });
    applyCommit(data, set.commit);
    expect(clubProfileOf(data, "A")!.status).toBe("오늘은 슬랩");
    expect(planClubStatus(data, { now: NOW, key: "A", status: "오늘은 슬랩" })).toEqual({ noop: true });
    const cleared = planClubStatus(data, { now: NOW + 1, key: "A", status: "" });
    if (!("commit" in cleared)) throw new Error("refused");
    expect(cleared.result).toEqual({ statusText: null });
    applyCommit(data, cleared.commit);
    expect(clubProfileOf(data, "A")!.status).toBe("");
    expect(data.ClubProfiles!.find((r) => r.member_id === "B")!.status).toBe("불멍 중"); // untouched
    expect(data.AuditLog).toHaveLength(0);
    // no rabbit yet → nothing to attach a line to
    expect(planClubStatus(data, { now: NOW, key: "NOBODY", status: "hi" })).toHaveProperty("refuse");
  });

  it("is shown to the others as soon as the rabbit is saved; renaming keeps the status line", () => {
    const data: Tables = { Members: [m("A"), m("B")], ClubProfiles: [], AuditLog: [] };
    const made = planClubProfileSave(data, { now: NOW, memberId: "A", nickname: "에이", mbti: "INFP" });
    if (!("commit" in made)) throw new Error("refused");
    applyCommit(data, made.commit);
    expect(clubMembersOf(data, "B", NOW, () => true).map((p) => p.key)).toEqual(["A"]);
    data.ClubProfiles![0].status = "쉬는 중";
    const renamed = planClubProfileSave(data, { now: NOW, memberId: "A", nickname: "에이에이", mbti: "INFP" });
    if (!("commit" in renamed)) throw new Error("refused");
    applyCommit(data, renamed.commit);
    expect(clubProfileOf(data, "A")).toEqual({ nickname: "에이에이", mbti: "INFP", status: "쉬는 중" });
  });
});

describe("4 minutes in the club, then 10 minutes' wait", () => {
  const m = (id: string): Row => ({ member_id: id, name: id, email: `${id}@x.dev`, role: "member", status: "active" });
  function club(): Tables {
    return {
      Members: [m("A"), m("B")],
      ClubProfiles: [
        { member_id: "A", nickname: "에이", mbti: "INFP", status: "" },
        { member_id: "B", nickname: "비", mbti: "ESTP", status: "" },
      ],
      ClubSessions: [],
      AuditLog: [],
    };
  }
  const signal = (data: Tables, at: number, session = "1111111111", key = "A", leave = false) => {
    const planned = planSessionSignal(data, { now: at, key, session, leave });
    if ("commit" in planned) expect(applyCommit(data, planned.commit)).toEqual({ ok: true });
    return "commit" in planned ? planned.result : "noop" in planned ? playStateOf(data, key, at) : planned;
  };

  it("tells the phase from the start time", () => {
    expect(playPhase(0, NOW)).toEqual({ phase: "fresh" });
    expect(playPhase(NOW, NOW + PLAY_MS - 1)).toEqual({ phase: "playing", endsAt: NOW + PLAY_MS });
    expect(playPhase(NOW, NOW + PLAY_MS)).toEqual({ phase: "cooldown", until: NOW + PLAY_MS + COOLDOWN_MS });
    expect(playPhase(NOW, NOW + PLAY_MS + COOLDOWN_MS)).toEqual({ phase: "fresh" });
  });

  it("the first signal starts the window; tabs share it; leaving and coming back never resets it", () => {
    const data = club();
    expect(signal(data, NOW)).toEqual({ phase: "playing", endsAt: NOW + PLAY_MS });
    expect(signal(data, NOW + 30_000, "2222222222")).toEqual({ phase: "playing", endsAt: NOW + PLAY_MS }); // another tab
    signal(data, NOW + 40_000, "1111111111", "A", true); // a problem page / closed tab
    expect(signal(data, NOW + 90_000, "3333333333")).toEqual({ phase: "playing", endsAt: NOW + PLAY_MS }); // back: same window
    expect(data.ClubSessions!.filter((r) => r.member_id === "A")).toHaveLength(1);
    expect(data.ClubSessions!.find((r) => r.member_id === "A")!.play_started_at).toBe(String(NOW));
  });

  it("after 4 minutes the signal is refused (cooldown), the tab goes OFF, and nothing new starts until 10 minutes later", () => {
    const data = club();
    signal(data, NOW);
    expect(signal(data, NOW + PLAY_MS + 1000)).toEqual({ phase: "cooldown", until: NOW + PLAY_MS + COOLDOWN_MS });
    expect(isOnline(data, "A", NOW + PLAY_MS + 1000)).toBe(false);
    // a new tab or a reload during the wait doesn't open a new window
    expect(signal(data, NOW + PLAY_MS + 5 * 60_000, "4444444444")).toEqual({ phase: "cooldown", until: NOW + PLAY_MS + COOLDOWN_MS });
    expect(data.ClubSessions!.find((r) => r.member_id === "A")!.play_started_at).toBe(String(NOW));
    // after the wait: a fresh window
    const later = NOW + PLAY_MS + COOLDOWN_MS + 1;
    expect(signal(data, later, "5555555555")).toEqual({ phase: "playing", endsAt: later + PLAY_MS });
  });

  it("one person's window is theirs only", () => {
    const data = club();
    signal(data, NOW);
    expect(signal(data, NOW + PLAY_MS + 1000, "bbbbbbbbbb", "B")).toEqual({ phase: "playing", endsAt: NOW + PLAY_MS + 1000 + PLAY_MS });
  });

  it("no status line changes during the wait", () => {
    const data = club();
    signal(data, NOW);
    expect(planClubStatus(data, { now: NOW + PLAY_MS + 1, key: "A", status: "다시 왔어요" })).toEqual({ refuse: COOLDOWN_REFUSAL });
    expect(planClubStatus(data, { now: NOW + 60_000, key: "A", status: "벽 앞" })).toHaveProperty("commit");
  });

  it("two tabs starting at once: only one window", () => {
    const data = club();
    const one = planSessionSignal(data, { now: NOW, key: "A", session: "1111111111" });
    const two = planSessionSignal(data, { now: NOW + 5, key: "A", session: "2222222222" });
    if (!("commit" in one) || !("commit" in two)) throw new Error("refused");
    expect(applyCommit(data, one.commit).ok).toBe(true);
    expect(applyCommit(data, two.commit)).toMatchObject({ ok: false, error: "conflict" });
  });
});

describe("THE LIVING CLUB wall numbers", () => {
  it("reads up to three MOON numbers", () => {
    expect(parseWallNumbers("")).toEqual([]);
    expect(parseWallNumbers("1, 4, 7")).toEqual([1, 4, 7]);
    expect(parseWallNumbers("MOON 001 / MOON 012")).toEqual([1, 12]);
    expect(parseWallNumbers("3 3 3")).toEqual([3]);
    expect(parseWallNumbers("1, 2, 3, 4")).toBeNull();
    expect(parseWallNumbers("코")).toBeNull();
    expect(parseWallNumbers("0")).toBeNull();
  });
});
