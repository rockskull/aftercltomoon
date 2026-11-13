import { describe, expect, it } from "vitest";
import { parseRegistration, quoteRegistration, registrationLabel, serializeRegistration, type RegistrationQuote } from "./registration";

const FEE = 80000;
const quote = (months: string[], start: string, fee = FEE) => {
  const q = quoteRegistration({ months, start, fee });
  if ("error" in q) throw new Error(q.error);
  return q as RegistrationQuote;
};

describe("registration fee (handoff v1.6 examples)", () => {
  it.each([
    [["2026-12"], "2026-12-01", 80000, 80000],
    [["2026-12"], "2026-12-15", 43871, 43871],
    [["2026-12", "2027-01"], "2026-12-15", 43871, 123871],
    [["2026-12", "2027-01", "2027-02"], "2026-12-15", 43871, 203871],
    [["2027-02"], "2027-02-15", 40000, 40000],
  ])("%j from %s → first %i, total %i", (months, start, first, total) => {
    const q = quote(months, start);
    expect(q.lines[0].amount).toBe(first);
    expect(q.total).toBe(total);
    expect(q.lines.reduce((a, l) => a + l.amount, 0)).toBe(q.total);
  });

  it("counts real calendar days: 31, 30, 28 and a leap February (29)", () => {
    expect(quote(["2026-12"], "2026-12-15").lines[0]).toMatchObject({ days: 17, monthDays: 31 }); // 80000×17/31
    expect(quote(["2027-04"], "2027-04-16").lines[0]).toMatchObject({ days: 15, monthDays: 30, amount: 40000 });
    expect(quote(["2027-02"], "2027-02-01").lines[0]).toMatchObject({ days: 28, monthDays: 28, amount: 80000, prorated: false });
    expect(quote(["2028-02"], "2028-02-15").lines[0]).toMatchObject({ days: 15, monthDays: 29, amount: 41379 }); // 41,379.31
    expect(quote(["2027-01"], "2027-01-31").lines[0]).toMatchObject({ days: 1, amount: 2581 }); // 2,580.65
  });

  it("only the first month is prorated; later months are the full fee", () => {
    const q = quote(["2026-12", "2027-01", "2027-02"], "2026-12-15");
    expect(q.lines.map((l) => [l.start, l.end, l.amount])).toEqual([
      ["2026-12-15", "2026-12-31", 43871],
      ["2027-01-01", "2027-01-31", 80000],
      ["2027-02-01", "2027-02-28", 80000],
    ]);
  });

  it("sorts, drops duplicates, and keeps gaps as separate periods", () => {
    const q = quote(["2027-03", "2026-12", "2027-01", "2026-12"], "2026-12-10");
    expect(q.months).toEqual(["2026-12", "2027-01", "2027-03"]);
    expect(q.periods).toEqual([
      { start: "2026-12-10", end: "2027-01-31" },
      { start: "2027-03-01", end: "2027-03-31" }, // February stays uncovered
    ]);
    // across a year end
    expect(quote(["2027-12", "2028-01"], "2027-12-01").periods).toEqual([{ start: "2027-12-01", end: "2028-01-31" }]);
  });

  it("refuses bad input", () => {
    expect(quoteRegistration({ months: [], start: "2026-12-01", fee: FEE })).toHaveProperty("error");
    expect(quoteRegistration({ months: ["2026-11"], start: "2026-11-01", fee: FEE })).toHaveProperty("error"); // before the first month
    expect(quoteRegistration({ months: ["2026-12"], start: "2027-01-01", fee: FEE })).toHaveProperty("error"); // start outside the first month
    expect(quoteRegistration({ months: ["2027-02"], start: "2027-02-29", fee: FEE })).toHaveProperty("error");
    expect(quoteRegistration({ months: ["2026-13"], start: "2026-13-01", fee: FEE })).toHaveProperty("error");
    expect(quoteRegistration({ months: ["2026-12"], start: "2026-12-01", fee: 0 })).toHaveProperty("error");
  });

  it("round-trips through the stored form and labels the ranges", () => {
    const spec = { months: ["2027-01", "2026-12"], start: "2026-12-15", fee: FEE };
    expect(parseRegistration(serializeRegistration(spec))).toEqual({ months: ["2026-12", "2027-01"], start: "2026-12-15", fee: FEE });
    expect(parseRegistration("")).toBeNull();
    expect(parseRegistration("{bad")).toBeNull();
    expect(registrationLabel({ months: ["2026-12", "2027-02"], start: "2026-12-15", fee: FEE })).toBe("월 단위 등록 2개월 (2026.12.15 – 2026.12.31, 2027.02.01 – 2027.02.28)");
  });
});
