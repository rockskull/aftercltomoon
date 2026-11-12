"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { buttonPrimary, cn } from "@/components/ui";
import { brandFonts, canvasToPng, loadImage, saveImage } from "@/lib/canvas/brand";
import { drawStampCard, prepareStampCardFonts, STAMP_CARD_SIZE } from "@/lib/canvas/stamp-card";
import type { MyStamp, StampId } from "@/lib/stamps";

const dotted = (key: string) => key.replace(/-/g, ".");

/**
 * MY MOON STAMPS: the four stamps, received ones in colour (with the date),
 * the rest faded. Picking a received stamp makes the keepsake card in the
 * browser; SAVE STAMP saves it as a PNG.
 */
export function MoonStamps({ stamps, logoSrc }: { stamps: MyStamp[]; logoSrc: string }) {
  const earned = stamps.filter((s) => s.awardedAt !== null);
  const [selectedId, setSelectedId] = useState<StampId | null>(earned[0]?.id ?? null);
  const selected = earned.find((s) => s.id === selectedId) ?? null;
  const [preview, setPreview] = useState<{ id: StampId; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const id = selected?.id;
  const name = selected?.name;
  const description = selected?.description;
  const awardedAt = selected?.awardedAt;
  const imageSrc = selected?.imageSrc;

  useEffect(() => {
    if (!id || !name || !imageSrc) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const fonts = brandFonts();
        const card = { id, name, description: description ?? "", awardedAt: awardedAt ?? "" };
        const [logo, stamp] = await Promise.all([loadImage(logoSrc), loadImage(imageSrc), prepareStampCardFonts(card, fonts)]);
        if (cancelled) return;
        const canvas = (canvasRef.current ??= document.createElement("canvas"));
        drawStampCard(canvas, card, { logo, stamp }, fonts);
        const blob = await canvasToPng(canvas);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ id, url: objectUrl });
        setFailed(false);
      } catch (error) {
        console.error("[stamps] card failed", error);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, name, description, awardedAt, imageSrc, logoSrc]);

  const ready = preview !== null && preview.id === id && !failed;

  async function save() {
    if (!canvasRef.current || !ready || !id) return;
    const { w, h } = STAMP_CARD_SIZE;
    const result = await saveImage(await canvasToPng(canvasRef.current), `aftercltomoon-${id.toLowerCase()}-${w}x${h}.png`);
    setMessage(result === "downloaded" ? "스탬프 카드를 저장했어요." : null);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[14px] leading-relaxed text-ink-soft">
        클럽에서의 작은 첫 순간들을 스탬프로 남겨요. 운영진이 확인하면 찍어 드려요.
      </p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stamps.map((s) => {
          const got = s.awardedAt !== null;
          const active = got && s.id === selectedId;
          const body = (
            <>
              <Image
                src={s.imageSrc}
                alt=""
                width={240}
                height={240}
                className={cn("mx-auto h-auto w-full max-w-[150px]", !got && "opacity-30 grayscale")}
              />
              <span className={cn("mt-2 block font-display text-[19px] font-extrabold uppercase leading-none", got ? "text-midnight" : "text-ink-soft/70")}>
                {s.name}
              </span>
              <span className="mt-1 block text-[12px] leading-snug text-ink-soft">{s.description}</span>
              <span className={cn("mt-1.5 block font-mono text-[11px]", got ? "font-semibold text-brown" : "text-ink-soft/70")}>
                {got ? (s.awardedAt ? dotted(s.awardedAt) : "받음") : "아직"}
              </span>
            </>
          );
          return (
            <li key={s.id}>
              {got ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(s.id);
                    setMessage(null);
                  }}
                  aria-pressed={active}
                  aria-label={`${s.name} 스탬프 카드 보기${s.awardedAt ? ` (${dotted(s.awardedAt)} 받음)` : ""}`}
                  className={cn(
                    "block h-full w-full rounded-lg border-2 bg-ivory p-3 text-center transition-colors",
                    active ? "border-midnight bg-butter-200/60 shadow-[3px_3px_0_0_var(--color-midnight)]" : "border-midnight/20 hover:border-midnight/60",
                  )}
                >
                  {body}
                </button>
              ) : (
                <div className="h-full rounded-lg border-2 border-dashed border-midnight/15 p-3 text-center" aria-label={`${s.name} — 아직 받지 않은 스탬프`}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {earned.length === 0 ? (
        <p className="rounded-md border border-dashed border-midnight/30 px-4 py-3 text-center text-[14px] text-ink-soft">
          아직 받은 스탬프가 없어요. 첫 방문, 첫 완등처럼 클럽에서의 첫 순간이 생기면 운영진이 찍어 드려요.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-full max-w-[340px] overflow-hidden rounded-md border-2 border-midnight bg-ivory shadow-[4px_4px_0_0_var(--color-midnight)]" style={{ aspectRatio: "3 / 4" }}>
            {ready && preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- a generated blob: URL, not an optimizable asset
              <img src={preview.url} alt={`${selected?.name} 스탬프 카드 미리보기`} className="h-full w-full" />
            ) : (
              <p className="absolute inset-0 grid place-items-center text-[14px] text-ink-soft" aria-live="polite">
                {failed ? "카드를 만들지 못했어요. 새로고침해 주세요." : "카드를 만드는 중…"}
              </p>
            )}
          </div>
          <button type="button" onClick={save} disabled={!ready} className={cn(buttonPrimary, "w-full max-w-[340px] disabled:opacity-50")}>
            Save stamp
          </button>
          {message && (
            <p role="status" className="text-[13px] text-ink-soft">
              {message}
            </p>
          )}
          <p className="max-w-[340px] text-center text-[12px] leading-relaxed text-ink-soft">
            카드에는 이름이나 회원 정보가 들어가지 않아요. 휴대폰에서는 공유 화면의 &lsquo;이미지 저장&rsquo;으로 사진첩에 저장할 수 있어요.
          </p>
        </div>
      )}
    </div>
  );
}
