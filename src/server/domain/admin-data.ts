import { isStampId } from "@/lib/stamps";
import { pickText, type Check, type Op } from "../store/commit";
import { newId, seoulIso } from "../store/ids";
import { cellText, type Row, type Tables } from "../store/schema";
import { normalizeEmail, toMember, type Role } from "./model";

/**
 * Things the crew used to type straight into the sheet, now done on admin screens
 * (the database has no sheet to edit): members, plans, site settings, stamp names,
 * enrollment periods. Same commit rules as everything else: checked, audited.
 */

type Planned = { commit: { id: string; checks: Check[]; ops: Op[] }; result?: unknown } | { refuse: string };
interface Ctx {
  now: number;
  actorId: string;
  actorRole: Role;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ADMIN_ONLY = "이 설정은 admin만 바꿀 수 있어요.";

function audit(ctx: Ctx, commitId: string, action: string, targetId: string, before: unknown, after: unknown): Op {
  return {
    type: "append",
    table: "AuditLog",
    row: {
      log_id: newId("LOG", ctx.now, 6),
      commit_id: commitId,
      actor_id: ctx.actorId,
      action,
      target_id: targetId,
      before_value: before ? JSON.stringify(before) : "",
      after_value: after ? JSON.stringify(after) : "",
      created_at: seoulIso(ctx.now),
    },
  };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Fields of `next` that differ from `row`, as text. */
function changes(row: Row, next: Row): Row {
  return Object.fromEntries(Object.entries(next).filter(([k, v]) => cellText(row[k]) !== cellText(v))) as Row;
}

// ---------------------------------------------------------------------------
// Members: add someone by hand (the first operators, members from before the site)
// ---------------------------------------------------------------------------

export interface MemberInput {
  name: string;
  email: string;
  depositorName: string;
  role: string;
  status: string;
  joinedAt: string;
  memo: string;
}

export function planMemberAdd(data: Tables, ctx: Ctx & { input: MemberInput }): Planned {
  const name = ctx.input.name.trim();
  const email = normalizeEmail(ctx.input.email);
  const role = ctx.input.role || "member";
  const status = ctx.input.status || "active";
  const joinedAt = ctx.input.joinedAt.trim();
  if (!name || name.length > 40) return { refuse: "이름을 40자 이내로 적어 주세요." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { refuse: "Google 로그인 메일 주소를 확인해 주세요." };
  if (!["member", "operator", "admin"].includes(role)) return { refuse: "권한을 골라 주세요." };
  if (role !== "member" && ctx.actorRole !== "admin") return { refuse: "운영진(operator/admin)은 admin만 추가할 수 있어요." };
  if (!["applicant", "active", "inactive"].includes(status)) return { refuse: "상태를 골라 주세요." };
  if (joinedAt && !DAY.test(joinedAt)) return { refuse: "가입일 형식을 확인해 주세요." };
  if ((data.Members ?? []).map(toMember).some((m) => m.email === email)) return { refuse: "이미 등록된 메일이에요." };

  const commitId = newId("C", ctx.now, 8);
  const memberId = newId("M", ctx.now);
  const row: Row = {
    member_id: memberId,
    name,
    email,
    depositor_name: ctx.input.depositorName.trim() || name,
    role,
    status,
    applied_at: "",
    joined_at: joinedAt,
    member_consent_at: "",
    memo: ctx.input.memo.trim().slice(0, 300),
  };
  return {
    commit: {
      id: commitId,
      checks: [{ type: "absent", table: "Members", where: { email } }],
      ops: [{ type: "append", table: "Members", row }, audit(ctx, commitId, "member.add", memberId, null, row)],
    },
    result: { memberId },
  };
}

// ---------------------------------------------------------------------------
// Plans (membership products and prices) — admins
// ---------------------------------------------------------------------------

export interface PlanInput {
  name: string;
  price: string;
  firstPrice: string;
  durationMonths: string;
  bonusMonths: string;
  active: boolean;
  sortOrder: string;
  description: string;
}

const won = (v: string) => Number(v.replace(/[,\s원]/g, ""));

export function planPlanSave(data: Tables, ctx: Ctx & { planId: string | null; input: PlanInput }): Planned {
  if (ctx.actorRole !== "admin") return { refuse: ADMIN_ONLY };
  const i = ctx.input;
  const price = won(i.price);
  const firstPrice = i.firstPrice.trim() ? won(i.firstPrice) : null;
  const duration = Number(i.durationMonths);
  const bonus = Number(i.bonusMonths || "0");
  const sortOrder = Number(i.sortOrder || "0");
  if (!i.name.trim() || i.name.trim().length > 30) return { refuse: "상품 이름을 30자 이내로 적어 주세요." };
  if (!Number.isInteger(price) || price < 0) return { refuse: "가격을 숫자로 적어 주세요." };
  if (firstPrice !== null && (!Number.isInteger(firstPrice) || firstPrice < 0)) return { refuse: "첫 등록 가격을 숫자로 적거나 비워 주세요." };
  if (!Number.isInteger(duration) || duration < 1 || duration > 36) return { refuse: "기간(개월)을 1~36 사이로 적어 주세요." };
  if (!Number.isInteger(bonus) || bonus < 0 || bonus > 12) return { refuse: "보너스(개월)를 0~12 사이로 적어 주세요." };
  if (!Number.isFinite(sortOrder)) return { refuse: "순서를 숫자로 적어 주세요." };

  const next: Row = {
    name: i.name.trim(),
    price,
    first_price: firstPrice ?? "",
    duration_months: duration,
    bonus_months: bonus,
    active: i.active,
    sort_order: sortOrder,
    description: i.description.trim().slice(0, 100),
  };
  const commitId = newId("C", ctx.now, 8);
  if (!ctx.planId) {
    const planId = newId("PLAN", ctx.now);
    const row = { plan_id: planId, ...next };
    return {
      commit: { id: commitId, checks: [], ops: [{ type: "append", table: "Plans", row }, audit(ctx, commitId, "plan.add", planId, null, row)] },
      result: { planId },
    };
  }
  const row = (data.Plans ?? []).find((r) => cellText(r.plan_id) === ctx.planId);
  if (!row) return { refuse: "상품을 찾을 수 없어요." };
  const set = changes(row, next);
  if (!Object.keys(set).length) return { refuse: "바뀐 내용이 없어요." };
  return {
    commit: {
      id: commitId,
      checks: [{ type: "exists", table: "Plans", id: ctx.planId, fields: pickText(row, Object.keys(set)) }],
      ops: [{ type: "update", table: "Plans", id: ctx.planId, set }, audit(ctx, commitId, "plan.edit", ctx.planId, pickText(row, Object.keys(set)), set)],
    },
    result: { planId: ctx.planId },
  };
}

// ---------------------------------------------------------------------------
// Site settings — admins
// ---------------------------------------------------------------------------

export const SETTING_KEYS = {
  apply_notice: "회원권 신청 후 안내 문구 (계좌번호·금액은 넣지 않기)",
  consent_daily_url: "일일 이용 동의서 (Google 설문)",
  consent_member_url: "회원 등록 동의서 (Google 설문)",
  radio_player: "AFTER HOURS RADIO 아지트 플레이어 (on/off)",
} as const;
export type SettingKey = keyof typeof SETTING_KEYS;

export function planSettingsSave(data: Tables, ctx: Ctx & { values: Partial<Record<SettingKey, string>> }): Planned {
  if (ctx.actorRole !== "admin") return { refuse: ADMIN_ONLY };
  const values = Object.fromEntries(Object.entries(ctx.values).map(([k, v]) => [k, (v ?? "").trim()])) as Partial<Record<SettingKey, string>>;
  if (values.apply_notice !== undefined && values.apply_notice.length > 500) return { refuse: "안내 문구는 500자까지 쓸 수 있어요." };
  for (const key of ["consent_daily_url", "consent_member_url"] as const) {
    if (values[key] !== undefined && !isHttpsUrl(values[key]!)) return { refuse: "동의서 링크는 https:// 로 시작하는 주소여야 해요." };
  }
  if (values.radio_player !== undefined && !["on", "off"].includes(values.radio_player)) return { refuse: "라디오 플레이어는 on 또는 off예요." };

  const rows = data.Settings ?? [];
  const commitId = newId("C", ctx.now, 8);
  const checks: Check[] = [];
  const ops: Op[] = [];
  const changed: Record<string, string> = {};
  for (const [key, value] of Object.entries(values) as Array<[SettingKey, string]>) {
    if (!(key in SETTING_KEYS)) continue;
    const row = rows.find((r) => cellText(r.key).trim() === key);
    if (row) {
      if (cellText(row.value) === value) continue;
      checks.push({ type: "exists", table: "Settings", id: key, fields: { value: cellText(row.value) } });
      ops.push({ type: "update", table: "Settings", id: key, set: { value } });
    } else {
      checks.push({ type: "absent", table: "Settings", where: { key } });
      ops.push({ type: "append", table: "Settings", row: { key, value, description: SETTING_KEYS[key] } });
    }
    changed[key] = value;
  }
  if (!ops.length) return { refuse: "바뀐 내용이 없어요." };
  ops.push(audit(ctx, commitId, "settings.edit", Object.keys(changed).join(","), null, changed));
  return { commit: { id: commitId, checks, ops } };
}

// ---------------------------------------------------------------------------
// MOON STAMPS: names/descriptions (admins) and revoking a mistaken award (operators)
// ---------------------------------------------------------------------------

export function planStampDefinitionSave(
  data: Tables,
  ctx: Ctx & { stampId: string; name: string; description: string; active: boolean; imageKey: string },
): Planned {
  if (ctx.actorRole !== "admin") return { refuse: ADMIN_ONLY };
  if (!isStampId(ctx.stampId)) return { refuse: "스탬프를 찾을 수 없어요." };
  const next: Row = { name: ctx.name.trim(), description: ctx.description.trim(), active: ctx.active };
  if (!next.name || String(next.name).length > 30) return { refuse: "스탬프 이름을 30자 이내로 적어 주세요." };
  if (String(next.description).length > 60) return { refuse: "설명은 60자까지 쓸 수 있어요." };
  const commitId = newId("C", ctx.now, 8);
  const row = (data.StampDefinitions ?? []).find((r) => cellText(r.stamp_id).trim().toUpperCase() === ctx.stampId);
  if (!row) {
    const appended = { stamp_id: ctx.stampId, ...next, image_key: ctx.imageKey };
    return {
      commit: {
        id: commitId,
        checks: [{ type: "absent", table: "StampDefinitions", where: { stamp_id: ctx.stampId } }],
        ops: [{ type: "append", table: "StampDefinitions", row: appended }, audit(ctx, commitId, "stamp.definition", ctx.stampId, null, appended)],
      },
    };
  }
  const set = changes(row, next);
  if (!Object.keys(set).length) return { refuse: "바뀐 내용이 없어요." };
  const id = cellText(row.stamp_id);
  return {
    commit: {
      id: commitId,
      checks: [{ type: "exists", table: "StampDefinitions", id, fields: pickText(row, Object.keys(set)) }],
      ops: [{ type: "update", table: "StampDefinitions", id, set }, audit(ctx, commitId, "stamp.definition", id, pickText(row, Object.keys(set)), set)],
    },
  };
}

/**
 * Takes back a stamp given by mistake. The record stays (history): its stamp_id
 * becomes "revoked:ST-0N", which the collection ignores, and the reason is noted.
 */
export function planStampRevoke(data: Tables, ctx: Ctx & { memberId: string; stampId: string; reason: string }): Planned {
  const rows = (data.StampAwards ?? []).filter(
    (r) => cellText(r.member_id).trim() === ctx.memberId && cellText(r.stamp_id).trim().toUpperCase() === ctx.stampId,
  );
  if (!rows.length) return { refuse: "취소할 발급 기록이 없어요." };
  if (!ctx.reason.trim()) return { refuse: "취소 사유를 적어 주세요." };
  if (rows.some((r) => !cellText(r.award_id).trim())) return { refuse: "발급 기록에 ID가 없어 여기서 취소할 수 없어요." };
  const commitId = newId("C", ctx.now, 8);
  const checks: Check[] = [];
  const ops: Op[] = [];
  for (const r of rows) {
    const id = cellText(r.award_id);
    const note = [cellText(r.note), `발급 취소: ${ctx.reason.trim()}`].filter(Boolean).join(" / ").slice(0, 300);
    checks.push({ type: "exists", table: "StampAwards", id, fields: { stamp_id: cellText(r.stamp_id) } });
    ops.push({ type: "update", table: "StampAwards", id, set: { stamp_id: `revoked:${ctx.stampId}`, note } });
  }
  ops.push(audit(ctx, commitId, "stamp.revoke", `${ctx.memberId}:${ctx.stampId}`, null, { reason: ctx.reason.trim() }));
  return { commit: { id: commitId, checks, ops } };
}

// ---------------------------------------------------------------------------
// Enrollment periods (bars on the calendar) — operators
// ---------------------------------------------------------------------------

export interface EnrollmentInput {
  title: string;
  startDate: string;
  endDate: string;
  description: string;
  applicationUrl: string;
  status: string;
}

export function planEnrollmentSave(data: Tables, ctx: Ctx & { enrollmentId: string | null; input: EnrollmentInput }): Planned {
  const i = ctx.input;
  const next: Row = {
    title: i.title.trim(),
    start_date: i.startDate.trim(),
    end_date: i.endDate.trim(),
    description: i.description.trim().slice(0, 300),
    application_url: i.applicationUrl.trim(),
    status: i.status,
  };
  if (!next.title || String(next.title).length > 60) return { refuse: "제목을 60자 이내로 적어 주세요." };
  if (!DAY.test(String(next.start_date))) return { refuse: "시작일을 골라 주세요." };
  if (next.end_date && (!DAY.test(String(next.end_date)) || String(next.end_date) < String(next.start_date))) return { refuse: "종료일을 확인해 주세요." };
  if (next.application_url && !isHttpsUrl(String(next.application_url))) return { refuse: "신청 링크는 https:// 로 시작하는 주소여야 해요." };
  if (!["draft", "published", "closed"].includes(String(next.status))) return { refuse: "상태를 골라 주세요." };
  const commitId = newId("C", ctx.now, 8);
  if (!ctx.enrollmentId) {
    const enrollmentId = newId("EN", ctx.now);
    const row = { enrollment_id: enrollmentId, ...next };
    return {
      commit: { id: commitId, checks: [], ops: [{ type: "append", table: "Enrollment", row }, audit(ctx, commitId, "enrollment.add", enrollmentId, null, row)] },
      result: { enrollmentId },
    };
  }
  const row = (data.Enrollment ?? []).find((r) => cellText(r.enrollment_id) === ctx.enrollmentId);
  if (!row) return { refuse: "등록 기간을 찾을 수 없어요." };
  const set = changes(row, next);
  if (!Object.keys(set).length) return { refuse: "바뀐 내용이 없어요." };
  return {
    commit: {
      id: commitId,
      checks: [{ type: "exists", table: "Enrollment", id: ctx.enrollmentId, fields: pickText(row, Object.keys(set)) }],
      ops: [
        { type: "update", table: "Enrollment", id: ctx.enrollmentId, set },
        audit(ctx, commitId, "enrollment.edit", ctx.enrollmentId, pickText(row, Object.keys(set)), set),
      ],
    },
  };
}
