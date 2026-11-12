/**
 * Canvas helpers for brand images (event posters, the invitation card).
 * Browser-only: fonts are the site's own next/font faces, the logo is the
 * official file. No server, no image API — "design once, generate anytime".
 */

export const BRAND = {
  midnight: "#0c1620",
  midnight2: "#142131",
  cream: "#f4e7cf",
  ivory: "#fbf5e8",
  butter: "#edc360",
  plywood: "#e6d5b5",
  plywoodDeep: "#d6c19c",
  brown: "#6f4626",
  orange: "#c9773f",
  inkSoft: "#46505c",
} as const;

export interface BrandFonts {
  display: string;
  label: string;
  sans: string;
  mono: string;
}

/** The families next/font registered on <html> (falls back to generic families). */
export function brandFonts(): BrandFonts {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    display: v("--font-big-shoulders", "sans-serif"),
    label: v("--font-jost", "sans-serif"),
    sans: v("--font-noto-kr", "sans-serif"),
    mono: v("--font-plex-mono", "monospace"),
  };
}

/**
 * Canvas draws with whatever is loaded *now*, so load every face/weight with
 * the exact text first (Korean glyphs come in unicode-range slices).
 */
export async function ensureFonts(specs: Array<[font: string, text: string]>): Promise<void> {
  await Promise.all(specs.map(([font, text]) => document.fonts.load(font, text || "A").catch(() => [])));
  await document.fonts.ready;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

/** Deterministic print grain (same output every time). */
export function grain(ctx: CanvasRenderingContext2D, w: number, h: number, rgb: [number, number, number], alpha: number, seed = 7) {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 256;
  const t = tile.getContext("2d")!;
  const img = t.createImageData(256, 256);
  let s = seed >>> 0;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    img.data[i] = rgb[0];
    img.data[i + 1] = rgb[1];
    img.data[i + 2] = rgb[2];
    img.data[i + 3] = (s >>> 24) < 70 ? Math.round(255 * alpha * ((s >>> 16) & 255) / 255) : 0;
  }
  t.putImageData(img, 0, 0);
  ctx.save();
  ctx.fillStyle = ctx.createPattern(tile, "repeat")!;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Text with letter spacing, drawn glyph by glyph (works in every browser). */
export function spacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: "left" | "center" | "right" = "left",
): number {
  const chars = [...text];
  const width = chars.reduce((w, c) => w + ctx.measureText(c).width, 0) + spacing * Math.max(0, chars.length - 1);
  let cx = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
  ctx.textAlign = prev;
  return width;
}

/** Word wrap that keeps Korean words whole when possible and breaks very long words by character. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (ctx.measureText(word).width <= maxWidth) {
        line = word;
        continue;
      }
      // A single word longer than the line: break it by character.
      line = "";
      for (const ch of word) {
        if (ctx.measureText(line + ch).width > maxWidth && line) {
          lines.push(line);
          line = ch;
        } else line += ch;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

/** A crescent moon motif (a disc minus an offset disc), on its own layer. */
export function crescent(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha: number) {
  const size = Math.ceil(r * 2 + 4);
  const layer = document.createElement("canvas");
  layer.width = layer.height = size;
  const l = layer.getContext("2d")!;
  l.fillStyle = color;
  l.beginPath();
  l.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  l.fill();
  l.globalCompositeOperation = "destination-out";
  l.beginPath();
  l.arc(size / 2 - r * 0.42, size / 2 - r * 0.12, r * 0.92, 0, Math.PI * 2);
  l.fill();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer, cx - size / 2, cy - size / 2);
  ctx.restore();
}

/**
 * The official logo, untouched. Its near-black background is composited with
 * "lighten" so it melts into a midnight surface (same trick as the website).
 */
export function drawLogo(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, top: number, width: number): number {
  const height = (width * img.naturalHeight) / img.naturalWidth;
  ctx.save();
  ctx.globalCompositeOperation = "lighten";
  ctx.drawImage(img, cx - width / 2, top, width, height);
  ctx.restore();
  return height;
}

/** Dashed rule like a ticket perforation. */
export function dashedRule(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string, dash = 14, gap = 10, width = 3) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([dash, gap]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
}

/**
 * Save a generated image. On phones that can share files (iOS/Android), the
 * share sheet offers "이미지 저장"; elsewhere a normal download.
 */
export async function saveImage(blob: Blob, filename: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
