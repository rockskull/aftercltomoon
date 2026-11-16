import { describe, expect, it } from "vitest";
import { memberAccess } from "@/lib/access";
import { cleanBubble, cleanNickname, nameTag } from "@/lib/little-club";
import { applyCommit } from "../store/commit";
import type { Row, Tables } from "../store/schema";
import { CLUB_TABLE_MISSING, clubProfileOf, littleClubVerdict, planClubProfileSave } from "./little-club";

const TODAY = "2026-12-10";
const NOW = Date.parse(`${TODAY}T12:00:00+09:00`);

type M = { id: string; role: string; status: string };
const ms = (memberId: string, startDate: string, endDate: string, status: "active" | "canceled" | "refunded" = "active") => ({ id: `MS-${memberId}-${startDate}`, memberId, startDate, endDate, status });

function verdict(member: M | null, memberships: ReturnType<typeof ms>[] = [], payments: Array<{ memberId: string; status: string }> = []) {
  const access = member ? memberAccess({ member, memberships, payments, todayKey: TODAY }) : null;
  return littleClubVerdict(member, access);
}

describe("who may enter THE LITTLE CLUB", () => {
  const member = (role = "member", status = "active"): M => ({ id: "A", role, status });
  const running = [ms("A", "2026-12-01", "2026-12-31")];

  it("lets in an active member with a membership in effect today", () => {
    expect(verdict(member(), running)).toEqual({ ok: true });
    // 6+1 / 12+2 count by their real dates
    expect(verdict(member(), [ms("A", "2026-12-01", "2027-06-30")])).toEqual({ ok: true });
  });

  it("turns away everyone else", () => {
    expect(verdict(null)).toEqual({ ok: false, reason: "not_member" });
    expect(verdict(member(), [])).toEqual({ ok: false, reason: "expired" });
    expect(verdict(member(), [ms("A", "2026-11-01", "2026-11-30")])).toEqual({ ok: false, reason: "expired" });
    expect(verdict(member(), [ms("A", "2027-01-01", "2027-01-31")])).toEqual({ ok: false, reason: "not_started" });
    expect(verdict(member(), [], [{ memberId: "A", status: "pending" }])).toEqual({ ok: false, reason: "pending" });
    expect(verdict(member("member", "inactive"), running)).toEqual({ ok: false, reason: "suspended" });
    expect(verdict(member("member", "applicant"), running)).toEqual({ ok: false, reason: "applicant" });
    // a canceled or refunded membership doesn't count
    expect(verdict(member(), [ms("A", "2026-12-01", "2026-12-31", "canceled")])).toEqual({ ok: false, reason: "expired" });
  });

  it("gives staff no pass of their own", () => {
    expect(verdict(member("operator"), [])).toEqual({ ok: false, reason: "expired" });
    expect(verdict(member("admin"), [])).toEqual({ ok: false, reason: "expired" });
    expect(verdict(member("admin"), running)).toEqual({ ok: true });
  });

  it("doesn't count someone else's membership", () => {
    expect(verdict(member(), [ms("B", "2026-12-01", "2026-12-31")])).toEqual({ ok: false, reason: "expired" });
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
    expect(clubProfileOf(data, "A")).toEqual({ nickname: "달토끼", mbti: "INFP" });
    expect(data.AuditLog![0]).toMatchObject({ action: "little_club.profile", actor_id: "A", target_id: "A" });

    const second = save(data, { nickname: "밤토끼", mbti: "ESTP" });
    if (!("commit" in second)) throw new Error("refused");
    expect(applyCommit(data, second.commit)).toEqual({ ok: true });
    expect(data.ClubProfiles).toHaveLength(1);
    expect(clubProfileOf(data, "A")).toEqual({ nickname: "밤토끼", mbti: "ESTP" });
  });

  it("never touches another member's row", () => {
    const data = tables();
    const b = save(data, { memberId: "B", nickname: "비", mbti: "ENFJ" });
    if (!("commit" in b)) throw new Error("refused");
    applyCommit(data, b.commit);
    const a = save(data);
    if (!("commit" in a)) throw new Error("refused");
    applyCommit(data, a.commit);
    expect(clubProfileOf(data, "B")).toEqual({ nickname: "비", mbti: "ENFJ" });
    expect(clubProfileOf(data, "A")).toEqual({ nickname: "달토끼", mbti: "INFP" });
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

  it("does nothing when nothing changed", () => {
    const data = tables();
    const first = save(data);
    if (!("commit" in first)) throw new Error("refused");
    applyCommit(data, first.commit);
    expect(save(data)).toEqual({ noop: true });
  });
});
