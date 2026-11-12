import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STAMP_CATALOG } from "@/lib/stamps";
import { applyCommit } from "../store/commit";
import { MemoryStore, demoTables } from "../store/memory";
import { TABLES, type Row, type Tables } from "../store/schema";
import { memberStamps, planStampAward, STAMP_TABS_MISSING, stampAwards, stampDefinitions } from "./stamps";

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
  it("has exactly the four stamps, and the sheet can't add more", () => {
    expect(STAMP_CATALOG.map((s) => s.id)).toEqual(["ST-01", "ST-02", "ST-03", "ST-04"]);
    const defs = stampDefinitions({
      StampDefinitions: [
        { stamp_id: "ST-05", name: "ON AIR", description: "", image_key: "st-05", active: true },
        { stamp_id: "st-02", name: "", description: "첫 완등!", image_key: "../../etc", active: "FALSE" },
      ],
    });
    expect(defs.map((d) => d.id)).toEqual(["ST-01", "ST-02", "ST-03", "ST-04"]);
    const top = defs[1];
    expect(top.name).toBe("FIRST TOP"); // empty cell → default
    expect(top.description).toBe("첫 완등!");
    expect(top.active).toBe(false);
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
    expect(memberStamps(data, "A").map((s) => s.id)).toEqual(["ST-01", "ST-02", "ST-03"]);
    expect(memberStamps(data, "B").map((s) => s.id)).toEqual(["ST-02", "ST-03"]);
  });

  it("works before the sheet has stamp tabs (nothing received yet)", () => {
    const stamps = memberStamps({}, "A");
    expect(stamps).toHaveLength(4);
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
    expect(award(data, { stampId: "ST-05" })).toHaveProperty("refuse");
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

describe("Apps Script schema", () => {
  it("Code.gs has exactly the same tabs and columns as schema.ts", () => {
    const source = readFileSync(join(process.cwd(), "apps-script", "Code.gs"), "utf8");
    const block = /var TABLES = \{([\s\S]*?)\n\};/.exec(source)![1];
    const gs: Record<string, string[]> = {};
    for (const m of block.matchAll(/(\w+): \[([\s\S]*?)\]/g)) gs[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    for (const [name, columns] of Object.entries(TABLES)) expect(gs[name], name).toEqual([...columns]);
  });
});
