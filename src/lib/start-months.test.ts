import { describe, expect, it } from "vitest";
import { earliestStart, startMonths } from "./start-months";

describe("membership form start months", () => {
  it("starts at 2026년 12월 — nothing earlier", () => {
    expect(startMonths("2026-11-13")).toEqual([
      { value: "2026-12-01", label: "2026년 12월 (다음 달)" },
      { value: "2027-01-01", label: "2027년 1월" },
      { value: "2027-02-01", label: "2027년 2월" },
      { value: "2027-03-01", label: "2027년 3월" },
    ]);
    expect(startMonths("2026-08-02").map((m) => m.value)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"]);
    expect(startMonths("2026-08-02")[0].label).toBe("2026년 12월");
  });

  it("from December on, this month and the next three (no past months)", () => {
    expect(startMonths("2026-12-01")).toEqual([
      { value: "2026-12-01", label: "2026년 12월 (이번 달)" },
      { value: "2027-01-01", label: "2027년 1월 (다음 달)" },
      { value: "2027-02-01", label: "2027년 2월" },
      { value: "2027-03-01", label: "2027년 3월" },
    ]);
    expect(startMonths("2027-11-05").map((m) => m.value)).toEqual(["2027-11-01", "2027-12-01", "2028-01-01", "2028-02-01"]);
  });

  it("earliest start", () => {
    expect(earliestStart("2026-11-13")).toBe("2026-12-01");
    expect(earliestStart("2026-12-31")).toBe("2026-12-01");
    expect(earliestStart("2027-03-02")).toBe("2027-03-01");
  });
});
