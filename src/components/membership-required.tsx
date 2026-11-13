import Link from "next/link";
import { blockedMessage, type BlockReason } from "@/lib/access";
import { ArrowRight, buttonPrimary, buttonSecondary, cn } from "./ui";

/**
 * MEMBERSHIP REQUIRED — the one message every member feature shows when the
 * account has no membership in effect (same wording on every screen).
 */
export function MembershipRequired({ reason, tone = "light", className }: { reason: BlockReason; tone?: "light" | "dark"; className?: string }) {
  const { title, body, action } = blockedMessage(reason);
  const dark = tone === "dark";
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border-2 p-5",
        dark ? "border-butter/60 bg-white/[0.04] text-cream" : "border-midnight bg-ivory text-midnight shadow-[4px_4px_0_0_var(--color-midnight)]",
        className,
      )}
    >
      <p className={cn("font-label text-[12px] font-semibold uppercase tracking-[0.24em]", dark ? "text-butter" : "text-brown")}>{title}</p>
      <p className={cn("mt-2 text-[15px] leading-relaxed", dark ? "text-cream/85" : "text-midnight")}>{body}</p>
      {action && (
        <Link href={action === "register" ? "/me#apply" : "/me"} className={cn(action === "register" ? buttonPrimary : buttonSecondary, "mt-4 w-full sm:w-auto", dark && action !== "register" && "border-cream text-cream")}>
          {action === "register" ? "Register membership" : "View membership"}
          <ArrowRight />
        </Link>
      )}
    </div>
  );
}
