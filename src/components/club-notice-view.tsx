import type { NoticeItem } from "@/lib/club-notice";
import { cn } from "./ui";

/** The CLUB NOTICE box (plain markup: used on the public pages and as the admin editor's live preview). */
export function ClubNoticeView({ items, className, headingId = "notice-title" }: { items: NoticeItem[]; className?: string; headingId?: string }) {
  return (
    <section aria-labelledby={headingId} className={cn("rounded-lg border-2 border-midnight bg-ivory p-5 md:p-6", className)} data-club-notice>
      <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">Club notice</p>
      <h2 id={headingId} className="mt-1 font-display text-[30px] font-extrabold uppercase leading-none text-midnight">
        아지트 공지
      </h2>
      <ol className="mt-4 flex flex-col divide-y divide-dashed divide-midnight/20">
        {items.map((notice, i) => (
          <li key={`${i}-${notice.title}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span className="w-7 shrink-0 font-mono text-[13px] font-semibold text-brown">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <p className="text-[16px] font-bold text-midnight">{notice.title}</p>
              {notice.body.split("\n").map((line, j) =>
                line ? (
                  <p key={j} className="mt-0.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-ink-soft">
                    {line}
                  </p>
                ) : (
                  <div key={j} className="h-2" aria-hidden />
                ),
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
