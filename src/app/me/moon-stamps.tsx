"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { buttonPrimary, buttonSecondary, cn } from "@/components/ui";
import { brandFonts, canShareFiles, canvasToPng, downloadBlob, loadImage, shareFile } from "@/lib/canvas/brand";
import { drawStampShare, prepareStampShareFonts, SHARE_FORMATS, shareFileName, type ShareFormat } from "@/lib/canvas/stamp-share";
import type { MyStamp, StampId } from "@/lib/stamps";
import { stampForShare } from "./actions";

const dotted = (key: string) => key.replace(/-/g, ".");

type ShareState =
  | { step: "idle" }
  | { step: "choose" }
  | { step: "making"; format: ShareFormat }
  | { step: "ready"; format: ShareFormat; url: string; file: File; canShare: boolean }
  | { step: "error"; format: ShareFormat | null; message: string };

type Note = { tone: "ok" | "info" | "warn"; text: string } | null;

/**
 * MY MOON STAMPS: the six stamps, received ones in colour (with the date), the
 * rest faded and inert. Picking a received stamp opens its detail; SHARE THIS
 * STAMP → STORY or FEED draws an Instagram-sized PNG in the browser (after the
 * server confirms the stamp is really this member's), then hands it to the OS
 * share sheet where supported, or saves it as a PNG.
 */
export function MoonStamps({ stamps, logoSrc }: { stamps: MyStamp[]; logoSrc: string }) {
  const earned = stamps.filter((s) => s.awardedAt !== null);
  const [selectedId, setSelectedId] = useState<StampId | null>(earned[0]?.id ?? null);
  const selected = earned.find((s) => s.id === selectedId) ?? null;
  const [share, setShare] = useState<ShareState>({ step: "idle" });
  const [note, setNote] = useState<Note>(null);
  const urlRef = useRef<string | null>(null);
  const runRef = useRef(0);

  /** Forget the current image (and ignore any image still being drawn). */
  const dropImage = () => {
    runRef.current++;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };
  useEffect(() => {
    const urls = urlRef;
    return () => {
      if (urls.current) URL.revokeObjectURL(urls.current);
    };
  }, []);

  function pick(id: StampId) {
    if (id === selectedId) return;
    dropImage();
    setSelectedId(id);
    setShare({ step: "idle" });
    setNote(null);
  }

  async function make(format: ShareFormat) {
    if (!selected) return;
    dropImage();
    const run = runRef.current;
    setShare({ step: "making", format });
    setNote(null);
    try {
      const check = await stampForShare(selected.id);
      if (run !== runRef.current) return;
      if (!check.ok) {
        setShare({ step: "error", format, message: check.message });
        return;
      }
      const s = check.stamp;
      const data = { id: s.id, name: s.name, subtitle: s.subtitle ?? "", motto: s.motto ?? "", description: s.description, awardedAt: s.awardedAt ?? "" };
      const fonts = brandFonts();
      const [logo, art] = await Promise.all([loadImage(logoSrc), loadImage(s.imageSrc), prepareStampShareFonts(data, fonts)]);
      const canvas = document.createElement("canvas");
      drawStampShare(canvas, format, data, { logo, stamp: art }, fonts);
      const blob = await canvasToPng(canvas);
      if (run !== runRef.current) return;
      const file = new File([blob], shareFileName(s.id, format), { type: "image/png" });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setShare({ step: "ready", format, url, file, canShare: canShareFiles(file) });
    } catch (error) {
      console.error("[stamps] share image failed", error);
      if (run === runRef.current) setShare({ step: "error", format, message: "이미지를 만들지 못했어요. 새로고침한 뒤 다시 시도해 주세요." });
    }
  }

  async function send() {
    if (share.step !== "ready") return;
    const outcome = await shareFile(share.file);
    if (outcome === "shared") setNote({ tone: "ok", text: "공유 화면으로 이미지를 넘겼어요. 게시는 고른 앱(Instagram 등)에서 직접 마무리해 주세요." });
    else if (outcome === "canceled") setNote({ tone: "info", text: "공유를 취소했어요. 다시 공유하거나 PNG로 저장할 수 있어요." });
    else setNote({ tone: "warn", text: "이 브라우저에서는 공유하지 못했어요. PNG로 저장한 뒤 Instagram 앱에서 올려 주세요." });
  }

  function save() {
    if (share.step !== "ready") return;
    downloadBlob(share.file, share.file.name);
    setNote({ tone: "ok", text: "PNG 저장을 시작했어요. 다운로드 폴더(휴대폰은 파일 앱)에서 확인해 주세요." });
  }

  const format = "format" in share ? share.format : null;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[14px] leading-relaxed text-ink-soft">
        클럽에서의 순간들을 스탬프로 남겨요. 운영진이 확인하면 찍어 드려요. 받은 스탬프는 Instagram 스토리·피드용 이미지로 공유할 수 있어요.
      </p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                className={cn("mx-auto h-auto w-full max-w-[140px]", !got && "opacity-30 grayscale")}
              />
              <span className={cn("mt-2 block font-display text-[18px] font-extrabold uppercase leading-none", got ? "text-midnight" : "text-ink-soft/70")}>
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
                  onClick={() => pick(s.id)}
                  aria-pressed={active}
                  aria-label={`${s.name} 스탬프 보기${s.awardedAt ? ` (${dotted(s.awardedAt)} 받음)` : ""}`}
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

      {!selected ? (
        <p className="rounded-md border border-dashed border-midnight/30 px-4 py-3 text-center text-[14px] text-ink-soft">
          아직 받은 스탬프가 없어요. 첫 방문, 100홀드 완등처럼 클럽에서의 순간이 생기면 운영진이 찍어 드려요.
        </p>
      ) : (
        <section aria-labelledby="stamp-detail-title" data-stamp={selected.id} className="rounded-lg border-2 border-midnight bg-ivory p-4 shadow-[4px_4px_0_0_var(--color-midnight)] sm:p-5">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <Image src={selected.imageSrc} alt={`${selected.name} 스탬프`} width={320} height={320} className="h-auto w-40 shrink-0 sm:w-44" />
            <div className="min-w-0 text-center sm:text-left">
              <p className="font-mono text-[11px] text-brown">{selected.id}</p>
              <h3 id="stamp-detail-title" className="font-display text-[30px] font-extrabold uppercase leading-none text-midnight">
                {selected.name}
              </h3>
              {selected.subtitle && <p className="mt-1 font-label text-[13px] font-semibold uppercase tracking-[0.2em] text-brown">{selected.subtitle}</p>}
              {selected.motto && <p className="mt-2 font-label text-[12px] font-semibold uppercase leading-snug tracking-[0.08em] text-ink-soft">{selected.motto}</p>}
              <p className="mt-1.5 text-[14px] text-ink">{selected.description}</p>
              <p className="mt-2 font-mono text-[12px] font-semibold text-brown">{selected.awardedAt ? `${dotted(selected.awardedAt)} 받음` : "받음"}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col items-center gap-4 border-t-2 border-dashed border-midnight/20 pt-5">
            {share.step === "idle" ? (
              <button type="button" onClick={() => setShare({ step: "choose" })} className={cn(buttonPrimary, "w-full max-w-[340px]")}>
                Share this stamp
              </button>
            ) : (
              <>
                <fieldset className="w-full max-w-[340px]">
                  <legend className="mb-2 w-full text-center font-label text-[12px] font-semibold uppercase tracking-[0.2em] text-brown">Share as</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(SHARE_FORMATS) as ShareFormat[]).map((key) => {
                      const spec = SHARE_FORMATS[key];
                      const on = format === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => make(key)}
                          aria-pressed={on}
                          disabled={share.step === "making"}
                          className={cn(
                            "flex items-center justify-center gap-2.5 rounded-md border-2 px-3 py-2.5 text-left transition-colors disabled:opacity-60",
                            on ? "border-midnight bg-butter text-midnight shadow-[3px_3px_0_0_var(--color-midnight)]" : "border-midnight/30 bg-ivory text-midnight hover:border-midnight",
                          )}
                        >
                          <span aria-hidden className={cn("block shrink-0 rounded-[3px] border-2 border-current", key === "story" ? "h-8 w-[18px]" : "h-8 w-6")} />
                          <span>
                            <span className="block font-label text-[14px] font-bold tracking-[0.12em]">{spec.label}</span>
                            <span className="block font-mono text-[11px] font-semibold leading-tight">{spec.ratio}</span>
                            <span className="block font-mono text-[10.5px] leading-tight text-ink-soft">
                              {spec.w}×{spec.h}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {share.step === "choose" && <p className="text-[13px] text-ink-soft">스토리 또는 피드를 고르면 그 규격으로 이미지를 만들어요.</p>}
                {share.step === "making" && (
                  <p className="text-[13px] text-ink-soft" aria-live="polite">
                    스탬프 기록을 확인하고 이미지를 만드는 중…
                  </p>
                )}
                {share.step === "error" && (
                  <p role="alert" className="max-w-[340px] rounded-md border-2 border-brown bg-ivory px-3 py-2 text-center text-[13px] font-medium text-brown">
                    {share.message}
                  </p>
                )}
                {share.step === "ready" && (
                  <>
                    <div
                      className={cn("w-full overflow-hidden rounded-md border-2 border-midnight bg-midnight shadow-[4px_4px_0_0_var(--color-midnight)]", share.format === "story" ? "max-w-[240px]" : "max-w-[300px]")}
                      style={{ aspectRatio: `${SHARE_FORMATS[share.format].w} / ${SHARE_FORMATS[share.format].h}` }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- a generated blob: URL, not an optimizable asset */}
                      <img
                        src={share.url}
                        alt={`${selected.name} 스탬프 ${SHARE_FORMATS[share.format].label} 공유 이미지 미리보기`}
                        data-share-preview={share.format}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="flex w-full max-w-[340px] flex-col gap-2">
                      {share.canShare && (
                        <button type="button" onClick={send} className={buttonPrimary}>
                          공유하기
                        </button>
                      )}
                      <button type="button" onClick={save} className={share.canShare ? buttonSecondary : buttonPrimary}>
                        PNG 저장
                      </button>
                    </div>
                    {!share.canShare && (
                      <p className="max-w-[340px] text-center text-[12px] leading-relaxed text-ink-soft">
                        이 브라우저는 이미지 바로 공유를 지원하지 않아요. PNG로 저장한 뒤 Instagram 앱에서 올려 주세요.
                      </p>
                    )}
                  </>
                )}
                {note && (
                  <p
                    role="status"
                    className={cn("max-w-[340px] text-center text-[13px]", note.tone === "warn" ? "font-medium text-brown" : note.tone === "ok" ? "font-medium text-midnight" : "text-ink-soft")}
                  >
                    {note.text}
                  </p>
                )}
              </>
            )}
            <p className="max-w-[340px] text-center text-[12px] leading-relaxed text-ink-soft">
              공유 이미지에는 이름·이메일·회원번호가 들어가지 않아요. 공유 화면에서 Instagram을 고르면 스토리나 피드로 올릴 수 있고, 실제 게시는 Instagram 앱에서 직접 해요.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
