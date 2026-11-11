import { describe, expect, it } from "vitest";
import { normalizeEvent } from "@/lib/normalize";
import { eventDraftFromProposal, eventIdForProposal, isPublicEvent, joinMoment, parseEventForm, splitMoment } from "./event-input";

const form = (values: Record<string, string>) => parseEventForm((name) => (values[name] ?? "").trim());
const base = { title: "개관식", start_date: "2026-11-21", visibility: "public", status: "published" };

describe("event form", () => {
  it("a date without a time is an all-day event; a time is stored as Seoul time", () => {
    const allDay = form(base);
    expect(allDay).toMatchObject({ ok: true, input: { start_at: "2026-11-21", end_at: "" } });
    const timed = form({ ...base, start_time: "16:00", end_time: "18:30" });
    expect(timed).toMatchObject({ ok: true, input: { start_at: "2026-11-21T16:00:00+09:00", end_at: "2026-11-21T18:30:00+09:00" } });
  });

  it("produces rows the public feed reads back the same way", () => {
    const parsed = form({ ...base, start_time: "16:00", location: "크루 공간", public_fee: "10,000", capacity: "30" });
    if (!parsed.ok) throw new Error(parsed.message);
    const event = normalizeEvent({ event_id: "EV-1", ...parsed.input });
    expect(event).toMatchObject({
      title: "개관식",
      start: Date.parse("2026-11-21T16:00:00+09:00"),
      allDay: false,
      location: "크루 공간",
      fee: "10,000원",
      capacity: 30,
    });
    expect(normalizeEvent({ event_id: "EV-1", ...parsed.input, status: "draft" })).toBeNull();
  });

  it("refuses an end before the start and a bad link", () => {
    expect(form({ ...base, start_time: "16:00", end_time: "15:00" })).toEqual({ ok: false, message: "끝나는 시간은 시작보다 뒤여야 해요." });
    expect(form({ ...base, end_date: "2026-11-20" })).toEqual({ ok: false, message: "끝나는 시간은 시작보다 뒤여야 해요." });
    expect(form({ ...base, registration_url: "javascript:alert(1)" })).toMatchObject({ ok: false });
    expect(form({ ...base, title: "" })).toEqual({ ok: false, message: "제목을 적어 주세요." });
    expect(form({ ...base, start_date: "" })).toEqual({ ok: false, message: "시작 날짜를 골라 주세요." });
    expect(form({ ...base, capacity: "많이" })).toMatchObject({ ok: false });
  });

  it("drops a same-day date-only end, keeps a multi-day end", () => {
    expect(form({ ...base, end_date: "2026-11-21" })).toMatchObject({ ok: true, input: { end_at: "" } });
    expect(form({ ...base, end_date: "2026-11-22" })).toMatchObject({ ok: true, input: { end_at: "2026-11-22" } });
  });

  it("keeps fee text as typed, numbers as numbers (0 = 무료)", () => {
    expect(form({ ...base, public_fee: "0" })).toMatchObject({ ok: true, input: { public_fee: 0 } });
    expect(form({ ...base, public_fee: "현장 결제" })).toMatchObject({ ok: true, input: { public_fee: "현장 결제" } });
  });

  it("checks the registration window", () => {
    expect(form({ ...base, reg_open_date: "2026-11-10", reg_close_date: "2026-11-09" })).toEqual({ ok: false, message: "신청 마감은 신청 시작보다 뒤여야 해요." });
    expect(form({ ...base, reg_close_time: "18:00" })).toEqual({ ok: false, message: "신청 기간은 날짜도 함께 골라 주세요." });
    expect(form({ ...base, reg_open_date: "2026-11-10", reg_close_date: "2026-11-10" })).toMatchObject({
      ok: true,
      input: { registration_open: "2026-11-10", registration_close: "2026-11-10" },
    });
  });

  it("splits sheet values back into the form's date and time", () => {
    expect(splitMoment("2026-11-21T16:00:00+09:00")).toEqual({ date: "2026-11-21", time: "16:00" });
    expect(splitMoment("2026-11-21")).toEqual({ date: "2026-11-21", time: "" });
    expect(splitMoment("")).toEqual({ date: "", time: "" });
    expect(joinMoment("2026-11-21", "09:05")).toBe("2026-11-21T09:05:00+09:00");
  });

  it("only public, non-draft events show on the site", () => {
    expect(isPublicEvent("public", "published")).toBe(true);
    expect(isPublicEvent("public", "canceled")).toBe(true);
    expect(isPublicEvent("public", "draft")).toBe(false);
    expect(isPublicEvent("private", "published")).toBe(false);
  });
});

describe("event from a proposal", () => {
  const proposal = {
    proposal_id: "PR-261111-ABCDE", proposer: "지민", contact: "카톡 jimin", event_title: "LP 감상회",
    description: "각자 LP 한 장씩", preferred_date: "12/13(토) 저녁", audience: "멤버 누구나", expected_attendance: "6~8명",
  };

  it("pre-fills title, description, host and audience; leaves free-text dates for the operator", () => {
    expect(eventDraftFromProposal(proposal)).toEqual({
      title: "LP 감상회",
      description: "각자 LP 한 장씩",
      host: "멤버 제안 · 지민",
      audience: "멤버 누구나",
      start_at: "",
    });
    expect(eventDraftFromProposal({ ...proposal, preferred_date: "2026-12-13" }).start_at).toBe("2026-12-13");
  });

  it("derives the event id from the proposal id", () => {
    expect(eventIdForProposal("PR-261111-ABCDE")).toBe("EV-PR-261111-ABCDE");
  });
});
