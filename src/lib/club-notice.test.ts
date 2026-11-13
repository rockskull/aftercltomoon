import { describe, expect, it } from "vitest";
import { DEFAULT_NOTICES, normalizeNotices, noticeProblem, parseNotices, serializeNotices } from "./club-notice";

describe("club notice", () => {
  it("falls back to the defaults when nothing (or something unreadable) is stored", () => {
    expect(parseNotices("")).toEqual(DEFAULT_NOTICES);
    expect(parseNotices(undefined)).toEqual(DEFAULT_NOTICES);
    expect(parseNotices("{not json")).toEqual(DEFAULT_NOTICES);
    expect(parseNotices("[]")).toEqual(DEFAULT_NOTICES);
    expect(parseNotices('{"title":"x"}')).toEqual(DEFAULT_NOTICES);
  });

  it("round-trips edited items, trimming and dropping empty ones", () => {
    const items = normalizeNotices([
      { title: "  청소 당번 ", body: "  매주 금요일\r\n\r\n\r\n 마지막 사람이 정리해요  " },
      { title: "", body: "" },
    ]);
    expect(items).toEqual([{ title: "청소 당번", body: "매주 금요일\n\n마지막 사람이 정리해요" }]);
    expect(parseNotices(serializeNotices(items))).toEqual(items);
  });

  it("the defaults are publishable", () => {
    expect(noticeProblem([...DEFAULT_NOTICES])).toBeNull();
  });

  it("refuses account/phone numbers, long digit runs and fee amounts (public page)", () => {
    const item = (body: string) => [{ title: "회비 납부", body }];
    expect(noticeProblem(item("카카오뱅크 3333-01-1234567로 보내 주세요."))).toContain("계좌번호");
    expect(noticeProblem(item("문의 010-1234-5678"))).toContain("전화번호");
    expect(noticeProblem(item("계좌 33330112345678"))).toContain("계좌번호");
    expect(noticeProblem(item("월 회비는 80,000원이에요."))).toContain("금액");
    expect(noticeProblem(item("8만원"))).toContain("금액");
    expect(noticeProblem(item("1월 회비는 12월 31일까지 납부"))).toBeNull();
  });

  it("checks titles, bodies and the item count", () => {
    expect(noticeProblem([])).not.toBeNull();
    expect(noticeProblem([{ title: "", body: "내용" }])).toContain("제목");
    expect(noticeProblem([{ title: "제목", body: "" }])).toContain("내용");
    expect(noticeProblem([{ title: "가".repeat(41), body: "내용" }])).toContain("40자");
    expect(noticeProblem(Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, body: "b" })))).toContain("8개");
  });
});
