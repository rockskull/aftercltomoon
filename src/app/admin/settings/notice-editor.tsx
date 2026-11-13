"use client";

import { useState } from "react";
import { ClubNoticeView } from "@/components/club-notice-view";
import { DEFAULT_NOTICES, normalizeNotices, NOTICE_LIMITS, noticeProblem, type NoticeItem } from "@/lib/club-notice";
import { saveSettings } from "../actions";
import { ActionForm } from "../admin-ui";
import { smallButton, smallInput, smallPrimary } from "../shared";

const label = "flex flex-col gap-1 text-[12px] font-medium text-ink-soft";
const tiny = "inline-flex h-8 items-center rounded-md border border-midnight/30 px-2 text-[12px] font-bold text-midnight hover:border-midnight disabled:opacity-30";

/**
 * 아지트 공지 editor (admin): items in order, each a title and a few lines.
 * The preview is exactly what the home page shows. Saving goes through the same
 * settings save (admin re-checked, audited); the server repeats the checks below.
 */
export function NoticeEditor({ initial }: { initial: NoticeItem[] }) {
  const [items, setItems] = useState<NoticeItem[]>(initial);
  const clean = normalizeNotices(items);
  const problem = noticeProblem(clean);
  const update = (i: number, patch: Partial<NoticeItem>) => setItems((cur) => cur.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) =>
    setItems((cur) => {
      const next = [...cur];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ActionForm action={saveSettings} className="flex flex-col gap-3">
        <input type="hidden" name="club_notice" value={JSON.stringify(clean)} />
        <ol className="flex flex-col gap-3">
          {items.map((it, i) => (
            <li key={i} className="rounded-md border border-midnight/20 bg-white/50 p-3" data-notice-item={i}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-mono text-[13px] font-semibold text-brown">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex gap-1">
                  <button type="button" className={tiny} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${i + 1}번 위로`}>
                    ▲
                  </button>
                  <button type="button" className={tiny} onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`${i + 1}번 아래로`}>
                    ▼
                  </button>
                  <button type="button" className={tiny} onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))} disabled={items.length <= 1}>
                    삭제
                  </button>
                </span>
              </div>
              <label className={label}>
                제목
                <input value={it.title} onChange={(e) => update(i, { title: e.target.value })} maxLength={NOTICE_LIMITS.title} className={smallInput} data-notice-title />
              </label>
              <label className={`${label} mt-2`}>
                내용 (줄바꿈하면 한 줄씩 보여요)
                <textarea
                  value={it.body}
                  onChange={(e) => update(i, { body: e.target.value })}
                  maxLength={NOTICE_LIMITS.body}
                  rows={3}
                  className={`${smallInput} h-auto py-2`}
                  data-notice-body
                />
              </label>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={smallButton} onClick={() => setItems((cur) => [...cur, { title: "", body: "" }])} disabled={items.length >= NOTICE_LIMITS.items}>
            + 항목 추가
          </button>
          <button
            type="button"
            className={smallButton}
            onClick={() => {
              if (window.confirm("처음 기본 문구로 되돌릴까요? (저장해야 반영돼요)")) setItems(DEFAULT_NOTICES.map((n) => ({ ...n })));
            }}
          >
            기본 문구로
          </button>
        </div>
        <p className="rounded-md border border-dashed border-brown/50 bg-ivory px-3 py-2 text-[12px] leading-relaxed text-brown">
          누구나 보는 공지예요(홈·MY). <strong>출입 비밀번호, 계좌번호, 전화번호, 회비 금액은 넣지 마세요.</strong> 계좌번호·전화번호처럼 보이는 숫자와 금액은 저장되지 않아요.
        </p>
        {problem && (
          <p role="alert" className="text-[13px] font-medium text-brown" data-notice-problem>
            {problem}
          </p>
        )}
        <div>
          <button type="submit" className={smallPrimary} disabled={Boolean(problem)}>
            공지 저장
          </button>
        </div>
      </ActionForm>
      <div>
        <p className="mb-2 font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-soft">미리보기 (홈에 보이는 모습)</p>
        <ClubNoticeView items={clean.length ? clean : [{ title: "(제목)", body: "(내용)" }]} headingId="notice-preview-title" />
      </div>
    </div>
  );
}
