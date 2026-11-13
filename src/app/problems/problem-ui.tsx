import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { gradeInfo, type Feel, type ProblemStatus, type SendStatus } from "@/lib/problems";
import type { ProblemStats } from "@/server/domain/problems";
import type { ProblemCard } from "@/server/problems";

/** VINTAGE CLIMBING LOGBOOK pieces: text only, no photos needed. */

export const dotDay = (key: string) => key.replace(/-/g, ".");

export const FEEL_LABEL: Record<Feel, { en: string; ko: string }> = {
  easy: { en: "EASY", ko: "예상보다 쉬움" },
  fair: { en: "FAIR", ko: "적절함" },
  hard: { en: "HARD", ko: "예상보다 어려움" },
};
export const SEND_LABEL: Record<SendStatus, { en: string; ko: string }> = {
  sent: { en: "SENT", ko: "완등" },
  projecting: { en: "PROJECTING", ko: "아직 도전 중" },
};
export const FUN_LABEL = ["", "별로", "아쉬움", "보통", "재미있음", "매우 재미있음"];

/** Faint ruled lines, like a logbook page. */
export const ruled =
  "bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_27px,rgba(12,22,32,0.07)_27px,rgba(12,22,32,0.07)_28px)]";

/** The colour grade with its swatch: "● 노랑 (5.10b ~ 5.10d)". `yds={false}` shows the colour only. */
export function GradeBadge({ grade, yds = true, className }: { grade: string; yds?: boolean; className?: string }) {
  const g = gradeInfo(grade);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} data-grade={grade}>
      {g && <span aria-hidden className="inline-block size-3 shrink-0 rounded-full border border-current/60" style={{ backgroundColor: g.swatch }} />}
      <span>
        {g ? g.name : grade}
        {g && yds && <span className="font-mono text-[0.85em] font-medium opacity-80"> ({g.yds})</span>}
      </span>
    </span>
  );
}

export function StatusPill({ status, onDark = false }: { status: ProblemStatus; onDark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-[4px] border px-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide",
        status === "active" && (onDark ? "border-butter text-butter" : "border-midnight bg-butter text-midnight"),
        status === "archived" && (onDark ? "border-cream/50 text-cream/70" : "border-midnight/40 text-ink-soft"),
        status === "deleted" && "border-brown text-brown",
      )}
    >
      {status}
    </span>
  );
}

/** "4.5 / 5" with five little moons; or a plain "no ratings yet" (never a fake 0). */
export function FunMeter({ value, size = "sm" }: { value: number | null; size?: "sm" | "lg" }) {
  if (value === null) return <span className="text-ink-soft">아직 평가가 없습니다</span>;
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`재미 ${value} / 5`}>
      <span aria-hidden className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={cn("inline-block rounded-full border border-midnight", size === "lg" ? "size-3.5" : "size-2.5", value >= i - 0.25 ? "bg-butter" : value >= i - 0.75 ? "bg-butter/45" : "bg-transparent")}
          />
        ))}
      </span>
      <span className={cn("font-mono font-semibold text-midnight", size === "lg" && "text-[20px]")}>{value.toFixed(1)}</span>
      <span className="font-mono text-ink-soft">/ 5</span>
    </span>
  );
}

export function FeelBars({ stats }: { stats: ProblemStats }) {
  const max = Math.max(1, ...Object.values(stats.feel));
  return (
    <ul className="flex flex-col gap-1.5" aria-label="체감 난이도 분포">
      {(["easy", "fair", "hard"] as const).map((f) => (
        <li key={f} className="grid grid-cols-[48px_minmax(0,1fr)_28px] items-center gap-2 text-[12px]">
          <span className="font-mono font-semibold text-midnight">{FEEL_LABEL[f].en}</span>
          <span className="h-3 overflow-hidden rounded-sm border border-midnight/30 bg-white/50">
            <span className="block h-full bg-butter" style={{ width: `${(stats.feel[f] / max) * 100}%` }} />
          </span>
          <span className="text-right font-mono text-midnight" data-feel={f}>
            {stats.feel[f]}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, children, mono = true }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="font-label text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">{label}</dt>
      <dd className={cn("truncate text-[13px] font-semibold text-midnight", mono && "font-mono")}>{children}</dd>
    </div>
  );
}

/** A problem as a logbook card: the number up top, then title, grade, setter, sends, fun. */
export function ProblemCardView({ problem }: { problem: ProblemCard }) {
  const p = problem;
  return (
    <Link
      href={`/problems/${p.no}`}
      data-problem={p.no}
      className={cn(
        "group flex h-full flex-col rounded-lg border-2 border-midnight bg-ivory shadow-[4px_4px_0_0_var(--color-midnight)] transition-transform hover:-translate-y-0.5",
        p.status !== "active" && "opacity-75",
      )}
    >
      <div className="flex items-center justify-between gap-2 rounded-t-[6px] bg-midnight px-4 py-2.5">
        <span className="font-display text-[28px] font-extrabold leading-none tracking-wide text-butter">{p.code}</span>
        <StatusPill status={p.status} onDark />
      </div>
      <div className={cn("flex flex-1 flex-col px-4 pb-3 pt-3", ruled)}>
        <h3 className="text-[18px] font-extrabold leading-snug text-midnight group-hover:underline group-hover:decoration-butter group-hover:decoration-2 group-hover:underline-offset-4">
          {p.title}
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
          <div className="col-span-2 min-w-0">
            <dt className="font-label text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Grade</dt>
            <dd className="text-[14px] font-semibold text-midnight">
              <GradeBadge grade={p.grade} />
            </dd>
          </div>
          <Stat label="Setter" mono={false}>
            {p.setterName}
          </Stat>
          <Stat label="Sends">{p.stats.sends}</Stat>
          <div className="col-span-2 min-w-0">
            <dt className="font-label text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Fun</dt>
            <dd className="text-[12px]">
              <FunMeter value={p.stats.funAverage} />
            </dd>
          </div>
        </dl>
        <p className="mt-auto border-t border-dashed border-midnight/25 pt-2 text-[12px] text-ink-soft">
          <span className="font-mono text-[11px]">{dotDay(p.createdOn)}</span>
          {p.wall && ` · ${p.wall}`}
        </p>
      </div>
    </Link>
  );
}

/** "01. PROBLEM INFO" style section heading. */
export function LogHeading({ no, title, id }: { no: string; title: string; id?: string }) {
  return (
    <h2 id={id} className="flex items-baseline gap-2 border-b-2 border-midnight pb-1.5">
      <span className="font-mono text-[13px] font-semibold text-brown">{no}.</span>
      <span className="font-label text-[13px] font-bold uppercase tracking-[0.22em] text-midnight">{title}</span>
    </h2>
  );
}
