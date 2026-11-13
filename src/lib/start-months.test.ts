import { describe, expect, it } from "vitest";
import { startMonths } from "./start-months";

describe("membership form start months", () => {
  it("leaves out only 2026년 11월", () => {
    expect(startMonths("2026-11-13").map((m) => m.value)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01"]);
    expect(startMonths("2026-10-20").map((m) => m.value)).toEqual(["2026-10-01", "2026-12-01", "2027-01-01"]);
    expect(startMonths("2026-08-02").map((m) => m.value)).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
  });

  it("keeps every other month and the relative labels", () => {
    expect(startMonths("2026-12-01")).toEqual([
      { value: "2026-12-01", label: "2026년 12월 (이번 달)" },
      { value: "2027-01-01", label: "2027년 1월 (다음 달)" },
      { value: "2027-02-01", label: "2027년 2월" },
      { value: "2027-03-01", label: "2027년 3월" },
    ]);
    // 2026-12 is "다음 달" in November even though 11월 itself is hidden.
    expect(startMonths("2026-11-30")[0]).toEqual({ value: "2026-12-01", label: "2026년 12월 (다음 달)" });
    // Other years' November is still offered.
    expect(startMonths("2027-11-05")[0].value).toBe("2027-11-01");
  });
});
