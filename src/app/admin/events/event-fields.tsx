import { cellText, type Row } from "@/server/store/schema";
import { splitMoment } from "@/server/domain/event-input";
import { smallInput } from "../shared";

const label = "flex flex-col gap-1 text-[12px] font-medium text-ink-soft";
const hint = "text-[11px] font-normal text-ink-soft/80";

export const STATUS_LABEL: Record<string, string> = {
  draft: "초안",
  published: "공개",
  closed: "신청 마감",
  canceled: "취소",
};

export const VISIBILITY_LABEL: Record<string, string> = {
  public: "사이트",
  private: "운영진만",
};

const DEFAULT_CATEGORIES = ["community", "climbing", "workshop", "social", "film", "music"];

/** Event categories already used in the sheet, for the form's suggestions. */
export function usedCategories(rows: Row[]): string[] {
  return [...new Set(rows.map((r) => cellText(r.category).trim()).filter(Boolean))];
}

/**
 * Inputs for one event, shared by the "new" and "edit" forms. Field names are
 * read by parseEventForm (src/server/domain/event-input.ts).
 */
export function EventFields({ row, categories, today }: { row?: Row; categories: string[]; today: string }) {
  const v = (k: string) => (row ? cellText(row[k]) : "");
  const start = splitMoment(v("start_at"));
  const end = splitMoment(v("end_at"));
  const regOpen = splitMoment(v("registration_open"));
  const regClose = splitMoment(v("registration_close"));
  const listId = row ? `event-categories-${v("event_id")}` : "event-categories-new";
  const options = [...new Set([...categories, ...DEFAULT_CATEGORIES].filter(Boolean))];

  return (
    <>
      <label className={`${label} sm:col-span-2`}>
        제목
        <input name="title" required maxLength={80} defaultValue={v("title")} placeholder="예: 개관식" className={smallInput} />
      </label>

      <label className={label}>
        날짜
        <input type="date" name="start_date" required defaultValue={start.date || (row ? "" : today)} className={smallInput} />
      </label>
      <label className={label}>
        <span>
          시작 시간 <span className={hint}>비우면 종일 일정</span>
        </span>
        <input type="time" name="start_time" defaultValue={start.time} className={smallInput} />
      </label>
      <label className={label}>
        <span>
          끝나는 날짜 <span className={hint}>여러 날이면</span>
        </span>
        <input type="date" name="end_date" defaultValue={end.date} className={smallInput} />
      </label>
      <label className={label}>
        <span>
          끝나는 시간 <span className={hint}>선택</span>
        </span>
        <input type="time" name="end_time" defaultValue={end.time} className={smallInput} />
      </label>

      <label className={label}>
        장소
        <input name="location" maxLength={120} defaultValue={v("location")} placeholder="예: 크루 공간" className={smallInput} />
      </label>
      <label className={label}>
        주최
        <input name="host" maxLength={60} defaultValue={v("host") || (row ? "" : "운영진")} className={smallInput} />
      </label>
      <label className={label}>
        대상
        <input name="audience" maxLength={80} defaultValue={v("audience")} placeholder="예: 멤버 누구나" className={smallInput} />
      </label>
      <label className={label}>
        분류
        <input name="category" maxLength={30} list={listId} defaultValue={v("category")} placeholder="예: community" className={smallInput} />
        <datalist id={listId}>
          {options.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label className={`${label} sm:col-span-2`}>
        설명 (사이트에 공개)
        <textarea
          name="description"
          rows={4}
          maxLength={2000}
          defaultValue={v("description")}
          className={`${smallInput} h-auto py-2 leading-relaxed`}
        />
      </label>

      <label className={label}>
        사이트 공개
        <select name="visibility" defaultValue={v("visibility") || "public"} className={smallInput}>
          <option value="public">사이트에 공개</option>
          <option value="private">운영진만 (사이트에 안 보임)</option>
        </select>
      </label>
      <label className={label}>
        상태
        <select name="status" defaultValue={v("status") || "published"} className={smallInput}>
          <option value="published">공개 (캘린더에 표시)</option>
          <option value="draft">초안 (준비 중, 안 보임)</option>
          <option value="closed">신청 마감</option>
          <option value="canceled">취소</option>
        </select>
      </label>

      <details className="rounded-md border border-midnight/20 bg-white/40 p-3 sm:col-span-2" open={Boolean(row && (v("registration_open") || v("registration_close") || v("capacity") || v("public_fee") || v("registration_url") || v("notes") || v("short_title")))}>
        <summary className="cursor-pointer text-[13px] font-bold text-midnight">신청 기간 · 정원 · 참가비 · 링크 (선택)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            신청 시작 날짜
            <input type="date" name="reg_open_date" defaultValue={regOpen.date} className={smallInput} />
          </label>
          <label className={label}>
            <span>
              신청 시작 시간 <span className={hint}>비우면 0시</span>
            </span>
            <input type="time" name="reg_open_time" defaultValue={regOpen.time} className={smallInput} />
          </label>
          <label className={label}>
            신청 마감 날짜
            <input type="date" name="reg_close_date" defaultValue={regClose.date} className={smallInput} />
          </label>
          <label className={label}>
            <span>
              신청 마감 시간 <span className={hint}>비우면 그날 끝까지</span>
            </span>
            <input type="time" name="reg_close_time" defaultValue={regClose.time} className={smallInput} />
          </label>
          <label className={label}>
            정원 (명)
            <input name="capacity" inputMode="numeric" pattern="[0-9,]*" maxLength={6} defaultValue={v("capacity")} className={smallInput} />
          </label>
          <label className={label}>
            <span>
              참가비 <span className={hint}>숫자면 원 단위, 0은 무료</span>
            </span>
            <input name="public_fee" maxLength={40} defaultValue={v("public_fee")} placeholder="예: 10000" className={smallInput} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            신청 링크
            <input name="registration_url" type="url" maxLength={500} defaultValue={v("registration_url")} placeholder="https://" className={smallInput} />
          </label>
          <label className={label}>
            <span>
              짧은 제목 <span className={hint}>캘린더 칸용, 비우면 제목</span>
            </span>
            <input name="short_title" maxLength={20} defaultValue={v("short_title")} className={smallInput} />
          </label>
          <label className={label}>
            안내 (사이트에 공개)
            <input name="notes" maxLength={500} defaultValue={v("notes")} placeholder="예: 편한 복장으로 오세요" className={smallInput} />
          </label>
        </div>
      </details>
    </>
  );
}
