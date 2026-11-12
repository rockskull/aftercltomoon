import { INVITATION } from "@/lib/invitation";
import { cn, Logo } from "./ui";

/**
 * The invitation as a 3:4 paper card / gig ticket. Everything inside is sized
 * in card-width units (cqw), so the card keeps its 3:4 shape at any width like
 * a printed card; on a phone the body text is still ~14px. If text ever needs
 * more room the card grows taller instead of cutting it (no overflow clipping).
 * The saved PNG (lib/canvas/invitation.ts) is exactly 1080×1440.
 */
export function InvitationCard({ className }: { className?: string }) {
  return (
    <article
      aria-label="AFTER CL TO MOON 초대장"
      className={cn(
        "@container relative mx-auto flex aspect-[3/4] w-full max-w-[440px] flex-col rounded-[10px] border-[3px] border-midnight bg-ivory shadow-[6px_6px_0_0_var(--color-midnight)]",
        className,
      )}
    >
      <div className="flex justify-center rounded-t-[7px] bg-midnight px-[8cqw] pb-[4cqw] pt-[5cqw]">
        <Logo className="logo-blend h-auto w-[48%]" sizes="220px" />
      </div>

      <div className="flex flex-1 flex-col px-[7cqw] pb-[5cqw] pt-[5.5cqw]">
        <p className="font-display text-[11.5cqw] font-extrabold uppercase leading-[0.9] text-midnight">{INVITATION.headline}</p>
        <p className="mt-[1.8cqw] font-label text-[2.9cqw] font-semibold uppercase leading-[1.35] tracking-[0.22em] text-brown">
          {INVITATION.tagline}
        </p>
        <p className="mt-[3cqw] text-[4.4cqw] font-bold leading-[1.4] text-midnight">{INVITATION.lead}</p>
        <p className="mt-[1.2cqw] text-[3.9cqw] leading-[1.45] text-ink-soft">
          {INVITATION.body.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>

        {/* Ticket perforation with notches cut into both edges */}
        <div aria-hidden="true" className="relative -mx-[7cqw] my-[3cqw] h-[6cqw] overflow-hidden">
          <div className="absolute inset-x-[7cqw] top-1/2 -translate-y-1/2 border-t-[2.5px] border-dashed border-midnight/30" />
          <span className="absolute -left-[3cqw] top-0 size-[6cqw] rounded-full border-[3px] border-midnight bg-plywood" />
          <span className="absolute -right-[3cqw] top-0 size-[6cqw] rounded-full border-[3px] border-midnight bg-plywood" />
        </div>

        <p className="font-display text-[8cqw] font-extrabold uppercase leading-none text-midnight">{INVITATION.bringTitle}</p>
        <ul className="mt-[2.5cqw] flex flex-col gap-[1cqw] text-[3.9cqw] font-medium leading-[1.4] text-midnight">
          {INVITATION.bring.map((item) => (
            <li key={item} className="flex items-start gap-[2.4cqw]">
              <span aria-hidden="true" className="mt-[1.5cqw] size-[2.6cqw] shrink-0 border-[1.5px] border-midnight bg-butter" />
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-end justify-between gap-3 pt-[2cqw] font-mono text-[3cqw] leading-[1.4]">
          <span className="font-medium text-brown">{INVITATION.hashtag}</span>
          <span className="text-ink-soft">{INVITATION.site}</span>
        </div>
      </div>
    </article>
  );
}
