import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STAMP_CATALOG } from "@/lib/stamps";
import { applyCommit } from "../store/commit";
import { MemoryStore, demoTables } from "../store/memory";
import { TABLES, type Row, type Tables } from "../store/schema";
import type { Membership, Plan } from "./model";
import { memberStamps, planStampAward, STAMP_TABS_MISSING, stampAwards, stampDefinitions, stampPlanEvidence } from "./stamps";

const NOW = Date.parse("2026-11-12T12:00:00+09:00");

function tables(): Tables {
  const member = (id: string, role = "member"): Row => ({ member_id: id, name: id, email: `${id}@x.dev`, role, status: "active" });
  return {
    Members: [member("M-OPER-77", "operator"), member("A"), member("B")],
    StampDefinitions: [],
    StampAwards: [
      { award_id: "SA-1", member_id: "A", stamp_id: "ST-01", awarded_at: "2026-11-01", awarded_by: "M-OPER-77", note: "비공개 메모" },
    ],
    AuditLog: [],
  };
}

const award = (data: Tables, over: Partial<{ memberId: string; stampId: string; awardedAt: string; note: string }> = {}) =>
  planStampAward(data, { now: NOW, actorId: "M-OPER-77", memberId: "B", stampId: "ST-02", awardedAt: "2026-11-12", note: "", ...over });

describe("stamp catalog", () => {
  it("has exactly the six stamps, and the table can't add more", () => {
    const six = ["ST-01", "ST-02", "ST-03", "ST-04", "ST-05", "ST-06"];
    expect(STAMP_CATALOG.map((s) => s.id)).toEqual(six);
    const defs = stampDefinitions({
      StampDefinitions: [
        { stamp_id: "ST-07", name: "ON AIR", description: "", image_key: "st-07", active: true },
        { stamp_id: "st-02", name: "", description: "지구력!", image_key: "../../etc", active: "FALSE" },
      ],
    });
    expect(defs.map((d) => d.id)).toEqual(six);
    const holds = defs[1];
    expect(holds.name).toBe("100 HOLDS"); // empty cell → default
    expect(holds.description).toBe("지구력!");
    expect(holds.active).toBe(false);
  });

  it("names the v1.4 stamps as handed over", () => {
    const byId = Object.fromEntries(STAMP_CATALOG.map((s) => [s.id, s]));
    expect(byId["ST-02"]).toMatchObject({ name: "100 HOLDS", description: "100홀드 지구력 문제 완등", motto: "COMPLETE THE 100-HOLD ENDURANCE CHALLENGE." });
    expect(byId["ST-05"]).toMatchObject({ name: "SIX MOONS", subtitle: "6 + 1 MONTHS", motto: "SIX MONTHS IN. ONE MORE ON THE MOON." });
    expect(byId["ST-06"]).toMatchObject({ name: "TWELVE MOONS", subtitle: "12 + 2 MONTHS", motto: "TWELVE MONTHS IN. TWO MORE ON THE MOON." });
    // ST-01/03/04 are untouched.
    expect(byId["ST-01"].name).toBe("FIRST MOON");
    expect(byId["ST-03"].name).toBe("NIGHT OWL");
    expect(byId["ST-04"].name).toBe("MOON HOST");
  });

  it("only ever points at the bundled artwork", () => {
    const stamps = memberStamps(
      { StampDefinitions: [{ stamp_id: "ST-03", image_key: "https://evil.example/x" }], StampAwards: [] },
      "A",
    );
    expect(stamps.find((s) => s.id === "ST-03")!.imageSrc).toMatch(/^\/stamps\/st-03\.svg/);
  });
});

describe("member collection", () => {
  it("shows only the member's own stamps, without notes or who issued them", () => {
    const data = tables();
    const a = memberStamps(data, "A");
    expect(a.find((s) => s.id === "ST-01")!.awardedAt).toBe("2026-11-01");
    expect(a.filter((s) => s.awardedAt !== null)).toHaveLength(1);
    expect(JSON.stringify(a)).not.toContain("비공개");
    expect(JSON.stringify(a)).not.toContain("M-OPER-77");
    expect(memberStamps(data, "B").every((s) => s.awardedAt === null)).toBe(true);
  });

  it("keeps the earliest of duplicate rows typed into the sheet", () => {
    const data = tables();
    data.StampAwards!.push({ award_id: "SA-2", member_id: "A", stamp_id: "ST-01", awarded_at: "2026-10-20", awarded_by: "M-OPER-77", note: "" });
    expect(stampAwards(data)).toHaveLength(1);
    expect(memberStamps(data, "A")[0].awardedAt).toBe("2026-10-20");
  });

  it("hides a switched-off stamp unless the member already has it", () => {
    const data = tables();
    data.StampDefinitions = [
      { stamp_id: "ST-01", active: false },
      { stamp_id: "ST-04", active: false },
    ];
    expect(memberStamps(data, "A").map((s) => s.id)).toEqual(["ST-01", "ST-02", "ST-03", "ST-05", "ST-06"]);
    expect(memberStamps(data, "B").map((s) => s.id)).toEqual(["ST-02", "ST-03", "ST-05", "ST-06"]);
  });

  it("works before any stamp rows exist (nothing received yet)", () => {
    const stamps = memberStamps({}, "A");
    expect(stamps).toHaveLength(6);
    expect(stamps.every((s) => s.awardedAt === null)).toBe(true);
  });
});

describe("issuing a stamp", () => {
  it("appends one award and an audit row", () => {
    const data = tables();
    const planned = award(data, { note: "V2 완등 확인" });
    if ("refuse" in planned) throw new Error(planned.refuse);
    expect(applyCommit(data, planned.commit)).toEqual({ ok: true });
    expect(data.StampAwards).toHaveLength(2);
    expect(data.StampAwards![1]).toMatchObject({ member_id: "B", stamp_id: "ST-02", awarded_at: "2026-11-12", awarded_by: "M-OPER-77", note: "V2 완등 확인" });
    expect(data.AuditLog![0]).toMatchObject({ action: "stamp.award", actor_id: "M-OPER-77" });
  });

  it("refuses a second stamp of the same kind", () => {
    expect(award(tables(), { memberId: "A", stampId: "ST-01" })).toEqual({ refuse: expect.stringContaining("이미 받은") });
  });

  it("lets only the first of two simultaneous awards land", () => {
    const data = tables();
    const first = award(data);
    const second = award(data);
    if ("refuse" in first || "refuse" in second) throw new Error("refused");
    expect(applyCommit(data, first.commit).ok).toBe(true);
    expect(applyCommit(data, second.commit)).toMatchObject({ ok: false, error: "conflict" });
    expect(data.StampAwards!.filter((r) => r.member_id === "B")).toHaveLength(1);
  });

  it("checks the stamp, the member and the date", () => {
    const data = tables();
    expect(award(data, { stampId: "ST-07" })).toHaveProperty("refuse");
    expect(award(data, { stampId: "ST-05" })).not.toHaveProperty("refuse");
    expect(award(data, { stampId: "ST-06" })).not.toHaveProperty("refuse");
    expect(award(data, { memberId: "NOPE" })).toHaveProperty("refuse");
    expect(award(data, { awardedAt: "2026-11-13" })).toHaveProperty("refuse"); // tomorrow
    expect(award(data, { awardedAt: "11/12" })).toHaveProperty("refuse");
    expect(award(data, { awardedAt: "2026-11-01" })).not.toHaveProperty("refuse");
  });

  it("explains what to do when the sheet has no stamp tabs yet", () => {
    const data = tables();
    delete data.StampAwards; // an older Code.gs leaves unknown tabs out of the read
    expect(award(data)).toEqual({ refuse: STAMP_TABS_MISSING });
  });

  it("works end to end on the demo store", async () => {
    const store = new MemoryStore(demoTables(NOW));
    const data = await store.read(["Members", "StampAwards"]);
    const planned = planStampAward(data, { now: NOW, actorId: "M-DEMO-ADMIN", memberId: "M-DEMO-SUA", stampId: "ST-01", awardedAt: "2026-11-12", note: "" });
    if ("refuse" in planned) throw new Error(planned.refuse);
    expect((await store.commit(planned.commit)).ok).toBe(true);
    const after = await store.read(["StampDefinitions", "StampAwards"]);
    expect(memberStamps(after, "M-DEMO-SUA").find((s) => s.id === "ST-01")!.awardedAt).toBe("2026-11-12");
  });
});

describe("long-registration stamps (reference for the crew)", () => {
  const plan = (id: string, durationMonths: number, bonusMonths: number): Plan => ({
    id, name: id, price: 0, firstPrice: 0, durationMonths, bonusMonths, active: true, sortOrder: 0, description: "",
  });
  const plans = [plan("PLAN-1M", 1, 0), plan("PLAN-6M", 6, 1), plan("PLAN-12M", 12, 2), plan("PLAN-6M-OLD", 6, 0)];
  const ms = (id: string, memberId: string, planId: string, status = "active"): Membership =>
    ({ id, memberId, planId, startDate: "2026-12-01", endDate: "2027-06-30", status, sourcePaymentId: "", createdAt: "", updatedAt: "", note: "", raw: {} }) as Membership;

  it("lists only the member's own, still-valid registrations on matching terms", () => {
    const memberships = [
      ms("MS-1", "A", "PLAN-6M"),
      ms("MS-2", "A", "PLAN-12M"),
      ms("MS-3", "A", "PLAN-6M-OLD"), // 6 months but no bonus: not SIX MOONS
      ms("MS-4", "A", "PLAN-12M", "refunded"),
      ms("MS-5", "B", "PLAN-6M"),
      ms("MS-6", "A", "PLAN-1M"),
    ];
    expect(stampPlanEvidence("ST-05", "A", memberships, plans).map((e) => e.membershipId)).toEqual(["MS-1"]);
    expect(stampPlanEvidence("ST-06", "A", memberships, plans).map((e) => e.membershipId)).toEqual(["MS-2"]);
    expect(stampPlanEvidence("ST-02", "A", memberships, plans)).toEqual([]);
    expect(stampPlanEvidence("ST-05", "C", memberships, plans)).toEqual([]);
  });
});

describe("Apps Script schema", () => {
  it("Code.gs has exactly the same tabs and columns as schema.ts", () => {
    const source = readFileSync(join(process.cwd(), "apps-script", "Code.gs"), "utf8");
    const block = /var TABLES = \{([\s\S]*?)\n\};/.exec(source)![1];
    const gs: Record<string, string[]> = {};
    for (const m of block.matchAll(/(\w+): \[([\s\S]*?)\]/g)) gs[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    for (const [name, columns] of Object.entries(TABLES)) expect(gs[name], name).toEqual([...columns]);
  });
});
