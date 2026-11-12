"use client";

import { useEffect, useRef, useState } from "react";
import { buttonPrimary, cn } from "@/components/ui";
import { brandFonts, canvasToPng, loadImage, saveImage } from "@/lib/canvas/brand";
import { drawPoster, POSTER_SIZES, preparePosterFonts, type PosterData, type PosterFormat } from "@/lib/canvas/poster";

/**
 * MAKE A POSTER: the event's current public data → fixed brand template →
 * canvas at the exact pixel size → PNG. Everything happens in the browser.
 */
export function PosterStudio({ data, fileBase, logoSrc }: { data: PosterData; fileBase: string; logoSrc: string }) {
  const [format, setFormat] = useState<PosterFormat>("feed");
  const [preview, setPreview] = useState<{ format: PosterFormat; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const fonts = brandFonts();
        const [logo] = await Promise.all([loadImage(logoSrc), preparePosterFonts(data, fonts)]);
        if (cancelled) return;
        const canvas = (canvasRef.current ??= document.createElement("canvas"));
        drawPoster(canvas, data, format, { logo }, fonts);
        const blob = await canvasToPng(canvas);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ format, url: objectUrl });
        setFailed(false);
      } catch (error) {
        console.error("[poster] render failed", error);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [data, format, logoSrc]);

  const ready = preview?.format === format && !failed;
  const size = POSTER_SIZES[format];

  async function save() {
    if (!canvasRef.current || !ready) return;
    const result = await saveImage(await canvasToPng(canvasRef.current), `${fileBase}-${format}-${size.w}x${size.h}.png`);
    setMessage(result === "downloaded" ? "PNG를 저장했어요." : null);
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div role="radiogroup" aria-label="출력 규격" className="flex w-full max-w-md gap-2">
        {(Object.keys(POSTER_SIZES) as PosterFormat[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={format === key}
            onClick={() => {
              setFormat(key);
              setMessage(null);
            }}
            className={cn(
              "flex h-14 flex-1 flex-col items-center justify-center rounded-md border-2 font-label text-[13px] font-semibold uppercase tracking-[0.14em]",
              format === key ? "border-midnight bg-midnight text-cream" : "border-midnight/30 bg-ivory text-midnight",
            )}
          >
            {POSTER_SIZES[key].label}
            <span className="font-mono text-[11px] font-medium normal-case tracking-normal opacity-80">
              {POSTER_SIZES[key].w} × {POSTER_SIZES[key].h}
            </span>
          </button>
        ))}
      </div>

      <div
        className="relative w-full max-w-[420px] overflow-hidden rounded-md border-2 border-midnight bg-midnight shadow-[4px_4px_0_0_var(--color-midnight)]"
        style={{ aspectRatio: `${size.w} / ${size.h}` }}
      >
        {ready ? (
          // eslint-disable-next-line @next/next/no-img-element -- a generated blob: URL, not an optimizable asset
          <img src={preview!.url} alt={`포스터 미리보기 (${size.label})`} className="h-full w-full" />
        ) : (
          <p className="absolute inset-0 grid place-items-center text-[14px] text-cream/70" aria-live="polite">
            {failed ? "포스터를 그리지 못했어요. 새로고침해 주세요." : "포스터를 만드는 중…"}
          </p>
        )}
      </div>

      {data.canceled ? (
        <p className="max-w-md text-center text-[14px] font-medium text-brown">
          취소된 이벤트라 포스터 저장은 막아 두었어요. 미리보기에 취소 표시가 들어가요.
        </p>
      ) : (
        <button type="button" onClick={save} disabled={!ready} className={cn(buttonPrimary, "w-full max-w-md disabled:opacity-50")}>
          Save PNG
        </button>
      )}
      {message && (
        <p role="status" className="text-[13px] text-ink-soft">
          {message}
        </p>
      )}
      <p className="max-w-md text-center text-[12px] leading-relaxed text-ink-soft">
        이벤트 정보를 고친 뒤 이 화면을 다시 열면 최신 정보로 새로 만들어져요. 휴대폰에서는 공유 화면의 &lsquo;이미지 저장&rsquo;으로
        사진첩에 저장할 수 있어요.
      </p>
    </div>
  );
}
