import type { Metadata } from "next";
import Image from "next/image";
import { Suspense, type ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { stampImageSrc } from "@/lib/stamps";
import { requireOperator } from "@/server/auth/viewer";
import { formatWon, toSettings } from "@/server/domain/model";
import { stampDefinitions } from "@/server/domain/stamps";
import { readTables, storeMode } from "@/server/store";
import { cellText, type Row } from "@/server/store/schema";
import { savePlan, saveSettings, saveStampDefinition } from "../actions";
import { ActionForm } from "../admin-ui";
import { AdminFrame, AdminSkeleton, Box, Pill, smallInput, smallPrimary } from "../shared";

export const metadata: Metadata = { title: "설정", robots: { index: false } };

export default function AdminSettingsPage() {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <Settings />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const label = "flex flex-col gap-1 text-[12px] font-medium text-ink-soft";
const STORE_LABEL = { postgres: "데이터베이스 (Neon)", sheets: "Google 시트 (Apps Script)", demo: "데모 (서버 메모리)", unconfigured: "연결 안 됨" } as const;

async function Settings() {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  await requestNow();
  const viewer = await requireOperator("/admin/settings");
  const isAdmin = viewer.member.role === "admin";
  const tables = await readTables(["Plans", "Settings", "StampDefinitions"], { admin: true });
  const settings = toSettings(tables.Settings);
  const plans = [...(tables.Plans ?? [])].sort((a, b) => Number(cellText(a.sort_order)) - Number(cellText(b.sort_order)));

  return (
    <AdminFrame tab="settings" title="Settings">
      <div className="flex flex-col gap-6">
        {!isAdmin && <p className="text-[14px] font-semibold text-brown">이 화면의 설정은 admin만 바꿀 수 있어요. 지금은 보기만 가능해요.</p>}

        <Box title="회원권 상품">
          <p className="mb-3 text-[13px] text-ink-soft">
            가격은 운영진 화면에서만 쓰여요(회원 화면에는 금액이 나오지 않아요). 첫 등록 가격은 처음 등록하는 사람에게만 적용되고, 비우면 평소 가격이에요.
            바꾼 가격은 새 신청부터 적용돼요.
          </p>
          <ul className="flex flex-col gap-2">
            {plans.map((p) => (
              <li key={cellText(p.plan_id)} className="rounded-md border border-midnight/20 bg-white/40 p-3">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-midnight">
                  {cellText(p.name)}
                  {String(p.active) === "false" || p.active === false ? <Pill tone="muted">판매 안 함</Pill> : <Pill tone="ok">판매 중</Pill>}
                </p>
                <p className="text-[13px] text-ink-soft">
                  {formatWon(Number(cellText(p.price)))}
                  {cellText(p.first_price) && ` · 첫 등록 ${formatWon(Number(cellText(p.first_price)))}`} · {cellText(p.duration_months)}개월
                  {Number(cellText(p.bonus_months)) > 0 && ` + 보너스 ${cellText(p.bonus_months)}개월`}
                  {cellText(p.description) && ` · ${cellText(p.description)}`}
                </p>
                {isAdmin && (
                  <Editable summary="수정">
                    <PlanForm plan={p} />
                  </Editable>
                )}
              </li>
            ))}
          </ul>
          {isAdmin && (
            <Editable summary="+ 새 상품 추가">
              <PlanForm plan={null} />
            </Editable>
          )}
        </Box>

        <Box title="사이트 설정">
          {isAdmin ? (
            <ActionForm action={saveSettings} className="grid gap-3">
              <label className={label}>
                회원권 신청 후 안내 문구 (계좌번호·금액은 넣지 않기)
                <textarea name="apply_notice" defaultValue={settings.applyNotice} maxLength={500} rows={3} className={`${smallInput} h-auto py-2`} />
              </label>
              <label className={label}>
                일일 이용 동의서 링크 (Google 설문)
                <input name="consent_daily_url" type="url" defaultValue={settings.consent.daily} required className={smallInput} />
              </label>
              <label className={label}>
                회원 등록 동의서 링크 (Google 설문)
                <input name="consent_member_url" type="url" defaultValue={settings.consent.member} required className={smallInput} />
              </label>
              <label className={label}>
                AFTER HOURS RADIO 아지트 플레이어 (음악 이용 권한을 확인한 뒤 켜기)
                <select name="radio_player" defaultValue={settings.radioPlayer ? "on" : "off"} className={smallInput}>
                  <option value="off">꺼짐 (목록·신청·YouTube 링크만)</option>
                  <option value="on">켜짐 (페이지에서 바로 재생)</option>
                </select>
              </label>
              <div>
                <button type="submit" className={smallPrimary}>
                  저장
                </button>
              </div>
            </ActionForm>
          ) : (
            <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
              <dt className="text-ink-soft">신청 후 안내</dt>
              <dd className="text-midnight">{settings.applyNotice}</dd>
              <dt className="text-ink-soft">일일 이용 동의서</dt>
              <dd className="break-all text-midnight">{settings.consent.daily}</dd>
              <dt className="text-ink-soft">회원 등록 동의서</dt>
              <dd className="break-all text-midnight">{settings.consent.member}</dd>
              <dt className="text-ink-soft">라디오 플레이어</dt>
              <dd className="text-midnight">{settings.radioPlayer ? "켜짐" : "꺼짐"}</dd>
            </dl>
          )}
        </Box>

        <Box title="MOON STAMPS">
          <p className="mb-3 text-[13px] text-ink-soft">스탬프는 4종으로 고정이에요. 그림 속 글자는 바뀌지 않고, 이름과 설명(발급 조건)은 목록과 카드에 쓰여요. 끄면 아직 받지 않은 회원에게는 보이지 않아요.</p>
          <ul className="flex flex-col gap-2">
            {stampDefinitions(tables).map((s) => (
              <li key={s.id} className="flex flex-wrap items-start gap-3 rounded-md border border-midnight/20 bg-white/40 p-3">
                <Image src={stampImageSrc(s.imageKey, s.id)} alt="" width={56} height={56} className={s.active ? "" : "opacity-40 grayscale"} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-midnight">
                    {s.name} <span className="font-mono text-[11px] font-normal text-ink-soft">{s.id}</span> {!s.active && <Pill tone="muted">꺼짐</Pill>}
                  </p>
                  <p className="text-[13px] text-ink-soft">{s.description}</p>
                  {isAdmin && (
                    <Editable summary="수정">
                      <ActionForm action={saveStampDefinition} className="grid gap-2 sm:grid-cols-2">
                        <input type="hidden" name="stamp_id" value={s.id} />
                        <label className={label}>
                          이름
                          <input name="name" defaultValue={s.name} required maxLength={30} className={smallInput} />
                        </label>
                        <label className={label}>
                          설명 (발급 조건)
                          <input name="description" defaultValue={s.description} maxLength={60} className={smallInput} />
                        </label>
                        <label className="flex items-center gap-2 text-[13px] font-medium text-midnight">
                          <input type="checkbox" name="active" defaultChecked={s.active} className="size-4 accent-midnight" />
                          사용
                        </label>
                        <div>
                          <button type="submit" className={smallPrimary}>
                            저장
                          </button>
                        </div>
                      </ActionForm>
                    </Editable>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Box>

        <Box title="데이터">
          <p className="text-[14px] text-midnight">
            저장소: <strong>{STORE_LABEL[storeMode()]}</strong>
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">모든 변경은 서버에서 다시 확인한 뒤 저장되고, 누가 언제 무엇을 바꿨는지 변경 이력(AuditLog)에 남아요.</p>
        </Box>
      </div>
    </AdminFrame>
  );
}

function Editable({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="mt-2 border-t border-dashed border-midnight/20 pt-2">
      <summary className="cursor-pointer text-[13px] font-bold text-midnight">{summary}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function PlanForm({ plan }: { plan: Row | null }) {
  const v = (k: string) => (plan ? cellText(plan[k]) : "");
  const active = plan ? !(plan.active === false || String(plan.active).toLowerCase() === "false") : true;
  return (
    <ActionForm action={savePlan} className="grid gap-2 sm:grid-cols-3">
      {plan && <input type="hidden" name="plan_id" value={cellText(plan.plan_id)} />}
      <label className={label}>
        이름
        <input name="name" defaultValue={v("name")} required maxLength={30} placeholder="예: 3개월" className={smallInput} />
      </label>
      <label className={label}>
        가격 (원)
        <input name="price" defaultValue={v("price")} required inputMode="numeric" className={smallInput} />
      </label>
      <label className={label}>
        첫 등록 가격 (원, 없으면 비우기)
        <input name="first_price" defaultValue={v("first_price")} inputMode="numeric" className={smallInput} />
      </label>
      <label className={label}>
        기간 (개월)
        <input name="duration_months" defaultValue={v("duration_months") || "1"} required inputMode="numeric" className={smallInput} />
      </label>
      <label className={label}>
        보너스 (개월)
        <input name="bonus_months" defaultValue={v("bonus_months") || "0"} inputMode="numeric" className={smallInput} />
      </label>
      <label className={label}>
        순서
        <input name="sort_order" defaultValue={v("sort_order") || "9"} inputMode="numeric" className={smallInput} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        설명
        <input name="description" defaultValue={v("description")} maxLength={100} className={smallInput} />
      </label>
      <label className="flex items-center gap-2 text-[13px] font-medium text-midnight">
        <input type="checkbox" name="active" defaultChecked={active} className="size-4 accent-midnight" />
        판매 중 (신청 화면에 보임)
      </label>
      <div className="sm:col-span-3">
        <button type="submit" className={smallPrimary}>
          {plan ? "저장" : "추가"}
        </button>
      </div>
    </ActionForm>
  );
}
