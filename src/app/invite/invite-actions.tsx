"use client";

import { useState } from "react";
import { buttonPrimary, buttonSecondary, cn } from "@/components/ui";
import { brandFonts, canvasToPng, loadImage, saveImage } from "@/lib/canvas/brand";
import { drawInvitation, INVITATION_SIZE, prepareInvitationFonts } from "@/lib/canvas/invitation";
import { INVITATION_SHARE } from "@/lib/invitation";

type Notice = { kind: "ok" | "error"; text: string } | { kind: "manual"; url: string };

/** SHARE INVITATION (share sheet → link copy → manual copy) and SAVE IMAGE (canvas PNG). */
export function InviteActions({ logoSrc }: { logoSrc: string }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);

  async function share() {
    setNotice(null);
    const url = new URL("/invite", window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ ...INVITATION_SHARE, url });
        return;
      } catch (error) {
        // Closing the share sheet is not an error; anything else falls back to copying.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice({ kind: "ok", text: "초대장 링크를 복사했어요. 전하고 싶은 사람에게 붙여넣어 보내 주세요." });
    } catch {
      setNotice({ kind: "manual", url });
    }
  }

  async function save() {
    setNotice(null);
    setSaving(true);
    try {
      const fonts = brandFonts();
      const [logo] = await Promise.all([loadImage(logoSrc), prepareInvitationFonts(fonts)]);
      const canvas = document.createElement("canvas");
      drawInvitation(canvas, { logo }, fonts);
      const { w, h } = INVITATION_SIZE;
      const result = await saveImage(await canvasToPng(canvas), `aftercltomoon-invitation-${w}x${h}.png`);
      if (result === "downloaded") setNotice({ kind: "ok", text: "초대장 이미지를 저장했어요." });
    } catch (error) {
      console.error("[invite] image failed", error);
      setNotice({ kind: "error", text: "이미지를 만들지 못했어요. 링크 공유를 이용해 주세요." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-3">
      <button type="button" onClick={share} className={cn(buttonPrimary, "w-full")}>
        Share invitation
      </button>
      <button type="button" onClick={save} disabled={saving} className={cn(buttonSecondary, "w-full disabled:opacity-50")}>
        {saving ? "Saving…" : "Save image"}
      </button>
      <div aria-live="polite" className="empty:hidden">
        {notice?.kind === "manual" ? (
          <label className="block text-[13px] text-ink-soft">
            이 링크를 길게 눌러 복사해 주세요.
            <input
              readOnly
              value={notice.url}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-1.5 h-11 w-full rounded-md border-2 border-midnight/30 bg-ivory px-3 font-mono text-[14px] text-midnight"
            />
          </label>
        ) : notice ? (
          <p role="status" className={cn("text-center text-[13px]", notice.kind === "error" ? "font-medium text-brown" : "text-ink-soft")}>
            {notice.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
