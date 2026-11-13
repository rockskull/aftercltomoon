/**
 * CLUB NOTICE (아지트 공지): numbered items, each a title and a few lines.
 * Admins edit it in 설정 → 아지트 공지; it is stored as JSON in Settings
 * `club_notice`. Nothing stored (or unreadable) → the defaults below.
 *
 * The notice is public (home page), so it must never carry the door code, an
 * account number or a fee amount — those go to the members' chat / consent form.
 * The save is refused when something looks like one of them.
 */

export interface NoticeItem {
  title: string;
  /** One or more lines (newline-separated). */
  body: string;
}

export const NOTICE_LIMITS = { items: 8, title: 40, body: 400 } as const;

export const DEFAULT_NOTICES: readonly NoticeItem[] = [
  { title: "회비 납부", body: "매월 말일까지 다음 달 회비를 납부해 주세요.\n예: 1월 회비는 12월 31일까지 납부\n선납도 가능합니다." },
  { title: "출입 비밀번호", body: "아지트 출입 비밀번호는 주기적으로 변경하며, 변경 시 회원 단체 채팅방에 안내합니다.\n비밀번호는 외부에 공유하지 말아 주세요." },
  {
    title: "회원 단체 채팅방",
    body: "보안 관리를 위해 이용 기간이 유효한 회원만 단체 채팅방에 참여할 수 있습니다.\n회원권이 종료되고 연장 등록이 없는 경우 단체 채팅방에서 제외되며, 재등록 시 다시 초대해 드립니다.",
  },
];

const tidy = (s: unknown, multiline: boolean) =>
  String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, multiline ? "" : " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, all) => line || (i > 0 && all[i - 1]))
    .join("\n")
    .trim();

/** Cleans what came from the editor: trims, drops empty items. */
export function normalizeNotices(items: Array<Partial<NoticeItem>>): NoticeItem[] {
  return items.map((i) => ({ title: tidy(i.title, false), body: tidy(i.body, true) })).filter((i) => i.title || i.body);
}

/** Stored value → items; empty or unreadable → the defaults (the site never shows an empty notice by accident). */
export function parseNotices(value: string | null | undefined): NoticeItem[] {
  if (!value || !value.trim()) return DEFAULT_NOTICES.map((n) => ({ ...n }));
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not a list");
    const items = normalizeNotices(parsed as Array<Partial<NoticeItem>>);
    return items.length ? items : DEFAULT_NOTICES.map((n) => ({ ...n }));
  } catch {
    return DEFAULT_NOTICES.map((n) => ({ ...n }));
  }
}

export function serializeNotices(items: NoticeItem[]): string {
  return JSON.stringify(items.map((i) => ({ title: i.title, body: i.body })));
}

// Things that must not go on a public page.
const ACCOUNT_OR_PHONE = /\d{2,6}\s*-\s*\d{2,6}\s*-\s*\d{2,8}/;
const LONG_NUMBER = /\d{10,}/;
const AMOUNT = /\d[\d,]*\s*원|\d+\s*만\s*원/;

/** Why these items can't be published (null when they're fine). */
export function noticeProblem(items: NoticeItem[]): string | null {
  if (!items.length) return "공지 항목이 하나 이상 있어야 해요.";
  if (items.length > NOTICE_LIMITS.items) return `공지는 ${NOTICE_LIMITS.items}개까지 넣을 수 있어요.`;
  for (const [i, item] of items.entries()) {
    const n = String(i + 1).padStart(2, "0");
    if (!item.title) return `${n}번 항목의 제목을 적어 주세요.`;
    if (item.title.length > NOTICE_LIMITS.title) return `${n}번 항목의 제목은 ${NOTICE_LIMITS.title}자까지예요.`;
    if (!item.body) return `${n}번 항목의 내용을 적어 주세요.`;
    if (item.body.length > NOTICE_LIMITS.body) return `${n}번 항목의 내용은 ${NOTICE_LIMITS.body}자까지예요.`;
    const text = `${item.title}\n${item.body}`;
    if (ACCOUNT_OR_PHONE.test(text) || LONG_NUMBER.test(text)) {
      return `${n}번 항목에 계좌번호·전화번호처럼 보이는 숫자가 있어요. 공지는 누구나 보는 화면이라 넣을 수 없어요(단톡방·동의서로 안내해 주세요).`;
    }
    if (AMOUNT.test(text)) return `${n}번 항목에 금액이 있어요. 회비 금액은 공지에 넣지 않아요(동의서·단톡방으로 안내).`;
  }
  return null;
}
