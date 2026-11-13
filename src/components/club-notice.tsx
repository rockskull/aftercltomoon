import { cn } from "./ui";

/**
 * CLUB NOTICE. Deliberately no door code and no account number or amount here:
 * the door code is shared in the members' chat only, fees in the consent form/chat.
 */
const NOTICES = [
  {
    n: "01",
    title: "회비 납부",
    lines: ["매월 말일까지 다음 달 회비를 납부해 주세요.", "예: 1월 회비는 12월 31일까지 납부", "선납도 가능합니다."],
  },
  {
    n: "02",
    title: "출입 비밀번호",
    lines: ["아지트 출입 비밀번호는 주기적으로 변경하며, 변경 시 회원 단체 채팅방에 안내합니다.", "비밀번호는 외부에 공유하지 말아 주세요."],
  },
  {
    n: "03",
    title: "회원 단체 채팅방",
    lines: [
      "보안 관리를 위해 이용 기간이 유효한 회원만 단체 채팅방에 참여할 수 있습니다.",
      "회원권이 종료되고 연장 등록이 없는 경우 단체 채팅방에서 제외되며, 재등록 시 다시 초대해 드립니다.",
    ],
  },
];

export function ClubNotice({ className, headingId = "notice-title" }: { className?: string; headingId?: string }) {
  return (
    <section aria-labelledby={headingId} className={cn("rounded-lg border-2 border-midnight bg-ivory p-5 md:p-6", className)}>
      <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">Club notice</p>
      <h2 id={headingId} className="mt-1 font-display text-[30px] font-extrabold uppercase leading-none text-midnight">
        아지트 공지
      </h2>
      <ol className="mt-4 flex flex-col divide-y divide-dashed divide-midnight/20">
        {NOTICES.map((notice) => (
          <li key={notice.n} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span className="w-7 shrink-0 font-mono text-[13px] font-semibold text-brown">{notice.n}</span>
            <div className="min-w-0">
              <p className="text-[16px] font-bold text-midnight">{notice.title}</p>
              {notice.lines.map((line) => (
                <p key={line} className="mt-0.5 text-[14px] leading-relaxed text-ink-soft">
                  {line}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
