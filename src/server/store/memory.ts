import { addDays, toDateKey } from "@/lib/dates";
import { membershipEndDate, monthStart } from "@/lib/membership";
import { RADIO_SEED } from "@/lib/radio";
import { seedRows } from "../domain/radio";
import { applyCommit, type Commit, type CommitResult } from "./commit";
import type { Row, TableName, Tables } from "./schema";

/**
 * In-memory stand-in for the Google Sheet. Used for local development and
 * DEMO_MODE previews when CLUB_API_URL is not configured, and in tests.
 * Applies commits with exactly the same rules as the Apps Script gateway.
 */
export class MemoryStore {
  readonly kind = "memory" as const;
  constructor(public tables: Tables) {}

  async read(names: TableName[]): Promise<Tables> {
    return structuredClone(Object.fromEntries(names.map((n) => [n, this.tables[n] ?? []]))) as Tables;
  }

  async commit(commit: Commit): Promise<CommitResult> {
    return applyCommit(this.tables, structuredClone(commit));
  }
}

export const DEMO_ACCOUNTS = [
  { email: "admin@aftermoon.dev", label: "운영진 (admin)" },
  { email: "operator@aftermoon.dev", label: "운영진 (operator)" },
  { email: "hyunwoo@aftermoon.dev", label: "회원 · 이용 중" },
  { email: "jimin@aftermoon.dev", label: "회원 · 곧 만료" },
  { email: "taeo@aftermoon.dev", label: "회원 · 만료됨" },
  { email: "sua@aftermoon.dev", label: "신청자 · 입금 대기" },
  { email: "newbie@aftermoon.dev", label: "미등록 Google 계정" },
] as const;

/** Demo data relative to today so every state is visible. */
export function demoTables(now = Date.now()): Tables {
  const today = toDateKey(now);
  const day = (n: number) => addDays(today, n);
  const at = (n: number, time = "10:00") => `${day(n)}T${time}:00+09:00`;

  const member = (id: string, name: string, email: string, depositor: string, role: string, status: string, joined: string): Row => ({
    member_id: id,
    name,
    email,
    depositor_name: depositor,
    role,
    status,
    applied_at: joined ? `${joined}T09:00:00+09:00` : at(-2),
    joined_at: joined,
    // Everyone in the demo confirmed the consent form when they applied, except Taeo (registered before the site).
    member_consent_at: id === "M-DEMO-TAEO" ? "" : joined ? `${joined}T09:00:00+09:00` : at(-1, "21:05"),
    memo: "",
  });

  const membership = (id: string, memberId: string, planId: string, paidOn: string, months: number, paymentId: string): Row => ({
    membership_id: id,
    member_id: memberId,
    plan_id: planId,
    // From the 1st of the month it was paid in, to the last day of the final month.
    start_date: monthStart(paidOn),
    end_date: membershipEndDate(monthStart(paidOn), months),
    status: "active",
    source_payment_id: paymentId,
    created_at: `${paidOn}T10:00:00+09:00`,
    updated_at: `${paidOn}T10:00:00+09:00`,
    note: "",
  });

  const approved = (id: string, memberId: string, depositor: string, amount: number, planId: string, date: string): Row => ({
    payment_id: id,
    member_id: memberId,
    depositor_name: depositor,
    amount,
    plan_id: planId,
    status: "approved",
    requested_at: `${date}T09:00:00+09:00`,
    requested_start: "",
    deposited_at: date,
    bank_transaction_id: "",
    approved_by: "M-DEMO-ADMIN",
    approved_at: `${date}T12:00:00+09:00`,
    note: "",
  });

  const ledger = (id: string, date: string, category: string, description: string, amount: number, person = "", method = "모임통장"): Row => ({
    entry_id: id,
    date,
    category,
    description,
    amount,
    person,
    method,
    receipt_url: "",
    memo: "",
    status: "active",
    created_by: "M-DEMO-ADMIN",
    created_at: `${date}T20:00:00+09:00`,
    updated_at: `${date}T20:00:00+09:00`,
  });

  // Memberships run in whole calendar months. Jimin has this month's 1-month pass (ends on the
  // last day of this month); Hyunwoo is mid-way through 14 months; Taeo's ended a month or two ago.
  const jiminStart = monthStart(today);

  return {
    Members: [
      member("M-DEMO-ADMIN", "문 운영", "admin@aftermoon.dev", "문운영", "admin", "active", "2026-01-05"),
      member("M-DEMO-OPER", "지호", "operator@aftermoon.dev", "박지호", "operator", "active", "2026-02-01"),
      member("M-DEMO-HYUNWOO", "현우", "hyunwoo@aftermoon.dev", "최현우", "member", "active", day(-120)),
      member("M-DEMO-JIMIN", "지민", "jimin@aftermoon.dev", "이지민", "member", "active", jiminStart),
      member("M-DEMO-TAEO", "태오", "taeo@aftermoon.dev", "정태오", "member", "active", day(-70)),
      member("M-DEMO-SUA", "수아", "sua@aftermoon.dev", "김수아", "member", "applicant", ""),
    ],
    Plans: [
      { plan_id: "PLAN-1M", name: "1개월", price: 80000, first_price: 100000, duration_months: 1, bonus_months: 0, active: true, sort_order: 1, description: "한 달 동안 이용" },
      { plan_id: "PLAN-6M", name: "6개월", price: 500000, first_price: "", duration_months: 6, bonus_months: 1, active: true, sort_order: 2, description: "6개월 + 보너스 1개월" },
      { plan_id: "PLAN-12M", name: "12개월", price: 1000000, first_price: "", duration_months: 12, bonus_months: 2, active: true, sort_order: 3, description: "12개월 + 보너스 2개월" },
    ],
    Payments: [
      approved("PAY-DEMO-ADMIN", "M-DEMO-ADMIN", "문운영", 1000000, "PLAN-12M", "2026-01-05"),
      approved("PAY-DEMO-OPER", "M-DEMO-OPER", "박지호", 1000000, "PLAN-12M", "2026-02-01"),
      approved("PAY-DEMO-HYUNWOO", "M-DEMO-HYUNWOO", "최현우", 1000000, "PLAN-12M", day(-120)),
      approved("PAY-DEMO-JIMIN", "M-DEMO-JIMIN", "이지민", 80000, "PLAN-1M", jiminStart),
      approved("PAY-DEMO-TAEO", "M-DEMO-TAEO", "정태오", 80000, "PLAN-1M", day(-70)),
      {
        payment_id: "PAY-DEMO-SUA",
        member_id: "M-DEMO-SUA",
        depositor_name: "김수아",
        amount: 100000, // first membership: 1개월 first-time price (80,000 from the second time)
        plan_id: "PLAN-1M",
        status: "pending",
        requested_at: at(-1, "21:10"),
        requested_start: "",
        deposited_at: "",
        bank_transaction_id: "",
        approved_by: "",
        approved_at: "",
        note: "",
      },
    ],
    Memberships: [
      membership("MS-DEMO-ADMIN", "M-DEMO-ADMIN", "PLAN-12M", "2026-01-05", 14, "PAY-DEMO-ADMIN"),
      membership("MS-DEMO-OPER", "M-DEMO-OPER", "PLAN-12M", "2026-02-01", 14, "PAY-DEMO-OPER"),
      membership("MS-DEMO-HYUNWOO", "M-DEMO-HYUNWOO", "PLAN-12M", day(-120), 14, "PAY-DEMO-HYUNWOO"),
      membership("MS-DEMO-JIMIN", "M-DEMO-JIMIN", "PLAN-1M", jiminStart, 1, "PAY-DEMO-JIMIN"),
      membership("MS-DEMO-TAEO", "M-DEMO-TAEO", "PLAN-1M", day(-70), 1, "PAY-DEMO-TAEO"),
    ],
    Notifications: [
      {
        notification_id: "N-DEMO-1",
        member_id: "M-DEMO-HYUNWOO",
        type: "event_new",
        title: "새 이벤트: LP 들으며 쉬는 밤",
        body: "신청은 곧 열려요. 일정을 확인해 보세요.",
        url: "/events/sample-vinyl-night",
        scheduled_at: at(-1, "09:00"),
        sent_at: at(-1, "09:00"),
        status: "inapp",
        attempts: 0,
        last_error: "",
        deduplication_key: "event_new:sample-vinyl-night:M-DEMO-HYUNWOO",
        created_at: at(-1, "09:00"),
        read_at: "",
      },
    ],
    PushSubscriptions: [],
    NotificationPrefs: [],
    EventWatch: [],
    AuditLog: [],
    // Fictional bookkeeping (the demo is public; never real names or amounts here).
    Ledger: [
      ...["크루 A", "크루 B", "크루 C", "크루 D"].map((person, i) => ledger(`LG-DEMO-IN${i}`, day(-40), "출자금", "초기 출자", 3_000_000, person)),
      ledger("LG-DEMO-1", day(-38), "보증금", "아지트 보증금", 10_000_000),
      ledger("LG-DEMO-2", day(-36), "수수료", "중개수수료", 500_000),
      ledger("LG-DEMO-3", day(-35), "임대료·관리비", "월세 + 관리비", 480_000),
      ledger("LG-DEMO-4", day(-30), "시설·공사", "벽 설치", 1_200_000),
      ledger("LG-DEMO-5", day(-28), "운송", "용달", 40_000),
      ledger("LG-DEMO-6", day(-20), "장비·용품", "매트", 900_000, "크루 B", "개인 결제"),
      ledger("LG-DEMO-7", day(-15), "소모품", "청소용품", 23_400),
      ledger("LG-DEMO-8", day(-5), "임대료·관리비", "월세 + 관리비", 480_000),
      ledger("LG-DEMO-9", day(-3), "일일 이용료", "게스트 일일 이용 2명", 20_000),
      ledger("LG-DEMO-10", day(-2), "식음료", "생수", 12_000),
    ],
    Settings: [
      {
        key: "apply_notice",
        value: "회비와 납부 방법은 회원 등록 동의서와 크루 단톡방 안내를 확인해 주세요. 운영진이 확인하면 회원권이 시작되고 알림을 보내드려요.",
        description: "회원권 신청 후 안내 문구 (계좌번호·금액은 넣지 않기)",
      },
      { key: "sheet_url", value: "", description: "운영진용 스프레드시트 링크" },
      { key: "consent_daily_url", value: "https://forms.gle/voZyWWAKs8gUAv949", description: "일일 이용 동의서 (Google 설문)" },
      { key: "consent_member_url", value: "https://forms.gle/m1ZoK1xUvmktA1kT7", description: "회원 등록 동의서 (Google 설문)" },
      // On in the demo so the player can be tried; the real sheet starts "off" until music rights are checked.
      { key: "radio_player", value: "on", description: "AFTER HOURS RADIO 아지트 플레이어" },
    ],
    // The 14 seeds, one member request, and one request an admin removed (hidden from the list).
    RadioTracks: [
      ...seedRows(RADIO_SEED, at(-30, "20:00")),
      {
        track_id: "RT-DEMO-1",
        title: "Show Me How (garage session)",
        artist: "Men I Trust",
        youtube_url: "https://www.youtube.com/watch?v=cpU7Yrl-AwM",
        youtube_video_id: "cpU7Yrl-AwM",
        requested_by: "M-DEMO-HYUNWOO",
        display_name: "현우",
        message: "벽 새로 세팅할 때 틀어 두면 딱 좋아요",
        source: "member",
        sort_order: 15,
        created_at: at(-3, "22:10"),
        status: "active",
        deleted_at: "",
        deleted_by: "",
      },
      {
        track_id: "RT-DEMO-2",
        title: "Friday Morning (Live at Sydney Opera House)",
        artist: "Khruangbin",
        youtube_url: "https://www.youtube.com/watch?v=RlCFsZMWYpI",
        youtube_video_id: "RlCFsZMWYpI",
        requested_by: "M-DEMO-JIMIN",
        display_name: "지민",
        message: "라이브 버전도!",
        source: "member",
        sort_order: 16,
        created_at: at(-2, "21:00"),
        status: "deleted",
        deleted_at: at(-1, "10:00"),
        deleted_by: "M-DEMO-ADMIN",
      },
    ],
    Proposals: [
      {
        proposal_id: "PR-DEMO-1",
        submitted_at: at(-2, "22:15"),
        proposer: "지민",
        contact: "카톡 jimin",
        event_title: "비 오는 날 LP 감상회",
        description: "각자 LP 한 장씩 가져와서 돌려 듣기",
        experience: "",
        preferred_date: "다음 달 둘째 주 금요일",
        date_flexible: "협의 가능",
        estimated_duration: "3시간",
        audience: "멤버 누구나",
        expected_attendance: "8명",
        free_ok: "가능",
        desired_fee: 5000,
        fee_unit: "1인당",
        estimated_cost: "음료",
        requirements: "턴테이블, 스피커",
        staff_support: "",
        other_requests: "",
        review_status: "new",
        review_notes: "",
      },
    ],
    Events: [],
    StampDefinitions: [
      { stamp_id: "ST-01", name: "FIRST MOON", description: "첫 클럽 방문", image_key: "st-01", active: true },
      { stamp_id: "ST-02", name: "100 HOLDS", description: "100홀드 지구력 문제 완등", image_key: "st-02", active: true },
      { stamp_id: "ST-03", name: "NIGHT OWL", description: "퇴근 후 클럽 세션 참여", image_key: "st-03", active: true },
      { stamp_id: "ST-04", name: "MOON HOST", description: "직접 이벤트 개최", image_key: "st-04", active: true },
      { stamp_id: "ST-05", name: "SIX MOONS", description: "6+1개월 회원권 등록", image_key: "st-05", active: true },
      { stamp_id: "ST-06", name: "TWELVE MOONS", description: "12+2개월 회원권 등록", image_key: "st-06", active: true },
    ],
    // Hyunwoo has four (incl. TWELVE MOONS for his 12+2 pass), Jimin and Taeo one each, Sua none yet.
    StampAwards: [
      stampAward("SA-DEMO-1", "M-DEMO-HYUNWOO", "ST-01", day(-120), "M-DEMO-ADMIN", ""),
      stampAward("SA-DEMO-2", "M-DEMO-HYUNWOO", "ST-02", day(-104), "M-DEMO-OPER", "지정 100홀드 지구력 문제, 세 번째 시도에 완등"),
      stampAward("SA-DEMO-3", "M-DEMO-HYUNWOO", "ST-03", day(-12), "M-DEMO-OPER", ""),
      stampAward("SA-DEMO-7", "M-DEMO-HYUNWOO", "ST-06", day(-118), "M-DEMO-ADMIN", "12+2개월 회원권 등록 확인"),
      stampAward("SA-DEMO-4", "M-DEMO-JIMIN", "ST-01", jiminStart, "M-DEMO-ADMIN", ""),
      stampAward("SA-DEMO-5", "M-DEMO-TAEO", "ST-01", day(-70), "M-DEMO-ADMIN", ""),
      stampAward("SA-DEMO-6", "M-DEMO-OPER", "ST-04", day(-20), "M-DEMO-ADMIN", "개관 준비 세션 진행"),
    ],
  };
}

function stampAward(id: string, memberId: string, stampId: string, date: string, by: string, note: string): Row {
  return { award_id: id, member_id: memberId, stamp_id: stampId, awarded_at: date, awarded_by: by, note };
}

/** Shared across hot reloads in development. */
export function demoStore(): MemoryStore {
  const g = globalThis as typeof globalThis & { __afterMoonDemoStore?: MemoryStore };
  g.__afterMoonDemoStore ??= new MemoryStore(demoTables());
  return g.__afterMoonDemoStore;
}
