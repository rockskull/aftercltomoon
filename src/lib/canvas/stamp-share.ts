import { BRAND, dashedRule, drawLogo, ellipsize, ensureFonts, grain, spacedText, wrapLines, type BrandFonts } from "./brand";

/**
 * Instagram share images for one earned stamp, drawn in the browser (no server,
 * no image API). Two separate layouts — not one picture stretched or cropped:
 *
 *   STORY 1080×1920 (9:16) — everything sits inside the band Instagram leaves
 *                            clear of its own top bar and reply field.
 *   FEED  1080×1440 (3:4)
 *
 * Only stamp facts go in: the official logo, the stamp artwork, its name and
 * lines, "EARNED AT AFTER CL TO MOON", the date it was received (when there is
 * one) and #afterc2m. Never a name, e-mail or member number.
 */

export type ShareFormat = "story" | "feed";

export const SHARE_FORMATS: Record<ShareFormat, { w: number; h: number; label: string; ratio: string }> = {
  story: { w: 1080, h: 1920, label: "STORY", ratio: "9:16" },
  feed: { w: 1080, h: 1440, label: "FEED", ratio: "3:4" },
};

export interface StampShareData {
  id: string;
  name: string;
  /** "6 + 1 MONTHS"; "" when the stamp has none. */
  subtitle: string;
  /** English line; "" when the stamp has none. */
  motto: string;
  /** Korean description. */
  description: string;
  /** "YYYY-MM-DD", or "" when the record has no date (the date line is then left out). */
  awardedAt: string;
}

export const EARNED_LINE = "EARNED AT AFTER CL TO MOON";
export const HASHTAG = "#afterc2m";

const dotted = (key: string) => key.replace(/-/g, ".");

export function shareFileName(id: string, format: ShareFormat): string {
  const { w, h } = SHARE_FORMATS[format];
  return `aftercltomoon-${id.toLowerCase()}-${format}-${w}x${h}.png`;
}

export async function prepareStampShareFonts(d: StampShareData, f: BrandFonts) {
  const latin = `${d.subtitle}${d.motto}${EARNED_LINE}MOON STAMPS · ${d.id}`;
  await ensureFonts([
    [`800 120px ${f.display}`, d.name],
    [`600 30px ${f.label}`, latin],
    [`500 36px ${f.sans}`, d.description],
    [`500 30px ${f.mono}`, `${dotted(d.awardedAt)}${HASHTAG}`],
  ]);
}

// ---------------------------------------------------------------------------

interface Item {
  h: number;
  draw: (y: number) => void;
}

const gap = (h: number): Item => ({ h, draw: () => {} });

/** Lays the items top to bottom, centred in [top, bottom]. */
function stack(items: Item[], top: number, bottom: number) {
  const total = items.reduce((a, i) => a + i.h, 0);
  let y = top + Math.max(0, (bottom - top - total) / 2);
  for (const item of items) {
    item.draw(y);
    y += item.h;
  }
}

/** Width of a line drawn with letter spacing. */
function spacedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number) {
  const chars = [...text];
  return chars.reduce((w, c) => w + ctx.measureText(c).width, 0) + spacing * Math.max(0, chars.length - 1);
}

/** Centred lines of one style. */
function lines(ctx: CanvasRenderingContext2D, cx: number, font: string, color: string, rows: string[], lh: number, spacing = 0): Item {
  return {
    h: rows.length * lh,
    draw: (y) => {
      ctx.font = font;
      ctx.fillStyle = color;
      rows.forEach((row, i) => spacedText(ctx, row, cx, y + lh * i + lh / 2, spacing, "center"));
    },
  };
}

/** Wraps `text` to `maxWidth` (letter spacing included), at most `maxRows` rows. */
function wrap(ctx: CanvasRenderingContext2D, font: string, text: string, maxWidth: number, spacing: number, maxRows: number): string[] {
  if (!text) return [];
  ctx.font = font;
  // wrapLines measures without letter spacing; shrink the limit by the same share.
  const plain = ctx.measureText(text).width;
  const limit = plain > 0 ? (maxWidth * plain) / spacedWidth(ctx, text, spacing) : maxWidth;
  const rows = wrapLines(ctx, text, limit);
  if (rows.length <= maxRows) return rows;
  const kept = rows.slice(0, maxRows);
  kept[maxRows - 1] = ellipsize(ctx, rows.slice(maxRows - 1).join(" "), limit);
  return kept;
}

/** The stamp's name: as large as fits on one line. */
function nameItem(ctx: CanvasRenderingContext2D, cx: number, f: BrandFonts, name: string, maxSize: number, maxWidth: number): Item {
  const spacing = Math.round(maxSize * 0.03);
  let size = maxSize;
  for (; size > 56; size -= 4) {
    ctx.font = `800 ${size}px ${f.display}`;
    if (spacedWidth(ctx, name, spacing) <= maxWidth) break;
  }
  ctx.font = `800 ${size}px ${f.display}`;
  const text = spacedWidth(ctx, name, spacing) <= maxWidth ? name : ellipsize(ctx, name, maxWidth - spacing * name.length);
  return lines(ctx, cx, `800 ${size}px ${f.display}`, BRAND.ivory, [text], Math.round(size * 1.02), spacing);
}

/** The stamp, pressed on slightly crooked, floating on a faint orbit. */
function stampItem(ctx: CanvasRenderingContext2D, cx: number, size: number, stamp: HTMLImageElement): Item {
  return {
    h: size,
    draw: (y) => {
      const cy = y + size / 2;
      ctx.save();
      ctx.strokeStyle = "rgba(244,231,207,0.13)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([16, 14]);
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.56, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((-4 * Math.PI) / 180);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = size * 0.05;
      ctx.shadowOffsetY = size * 0.018;
      ctx.drawImage(stamp, -size / 2, -size / 2, size, size);
      ctx.restore();
    },
  };
}

/** Midnight paper, print grain, a double frame and a few stars (same every time). */
function background(ctx: CanvasRenderingContext2D, w: number, h: number, inset: number) {
  ctx.fillStyle = BRAND.midnight;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, h * 0.6);
  glow.addColorStop(0, "rgba(20,33,49,0.9)");
  glow.addColorStop(1, "rgba(12,22,32,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, [244, 231, 207], 0.05, 23);

  let s = 0x5eed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  ctx.fillStyle = BRAND.cream;
  for (let i = 0; i < 46; i++) {
    const x = inset + rnd() * (w - inset * 2);
    const y = inset + rnd() * (h - inset * 2);
    ctx.globalAlpha = 0.18 + rnd() * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + rnd() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(230,213,181,0.42)";
  ctx.lineWidth = 3;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.strokeStyle = "rgba(230,213,181,0.22)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(inset + 12, inset + 12, w - (inset + 12) * 2, h - (inset + 12) * 2);
}

function logoItem(ctx: CanvasRenderingContext2D, cx: number, logo: HTMLImageElement, width: number): Item {
  return { h: (width * logo.naturalHeight) / logo.naturalWidth, draw: (y) => drawLogo(ctx, logo, cx, y, width) };
}

// ---------------------------------------------------------------------------

export function drawStampShare(
  canvas: HTMLCanvasElement,
  format: ShareFormat,
  d: StampShareData,
  assets: { logo: HTMLImageElement; stamp: HTMLImageElement },
  f: BrandFonts,
) {
  const { w, h } = SHARE_FORMATS[format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "middle";
  const cx = w / 2;
  if (format === "story") drawStory(ctx, w, h, cx, d, assets, f);
  else drawFeed(ctx, w, h, cx, d, assets, f);
  ctx.textBaseline = "alphabetic";
}

/** 9:16 — a tall poster; all content between y≈240 and y≈1620 (clear of Instagram's own UI). */
function drawStory(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  d: StampShareData,
  assets: { logo: HTMLImageElement; stamp: HTMLImageElement },
  f: BrandFonts,
) {
  background(ctx, w, h, 40);
  const textW = 860;
  const label = `MOON STAMPS · ${d.id}`;
  const motto = wrap(ctx, `600 30px ${f.label}`, d.motto, textW, 3, 2);
  const desc = wrap(ctx, `500 38px ${f.sans}`, d.description, textW, 0, 2);

  const text: Item[] = [
    nameItem(ctx, cx, f, d.name, 132, textW),
    ...(d.subtitle ? [gap(6), lines(ctx, cx, `600 34px ${f.label}`, BRAND.butter, [d.subtitle], 46, 9)] : []),
    ...(motto.length ? [gap(18), lines(ctx, cx, `600 30px ${f.label}`, BRAND.cream, motto, 44, 3)] : []),
    ...(desc.length ? [gap(motto.length ? 10 : 18), lines(ctx, cx, `500 38px ${f.sans}`, BRAND.plywood, desc, 56)] : []),
    gap(40),
    { h: 4, draw: (y) => dashedRule(ctx, cx - 300, cx + 300, y + 2, "rgba(230,213,181,0.45)", 14, 10, 3) },
    gap(40),
    lines(ctx, cx, `600 28px ${f.label}`, BRAND.butter, [EARNED_LINE], 40, 8),
    ...(d.awardedAt ? [gap(8), lines(ctx, cx, `500 30px ${f.mono}`, BRAND.cream, [dotted(d.awardedAt)], 42, 2)] : []),
    gap(22),
    lines(ctx, cx, `500 32px ${f.mono}`, BRAND.butter, [HASHTAG], 44, 1),
  ];
  const head: Item[] = [logoItem(ctx, cx, assets.logo, 470), gap(34), lines(ctx, cx, `600 26px ${f.label}`, BRAND.plywood, [label], 36, 10), gap(40)];

  const top = 240;
  const bottom = 1620;
  const fixed = [...head, gap(46), ...text].reduce((a, i) => a + i.h, 0);
  const size = Math.max(460, Math.min(720, bottom - top - fixed));
  stack([...head, stampItem(ctx, cx, size, assets.stamp), gap(46), ...text], top, bottom);
}

/** 3:4 — a squarer poster: logo, the stamp, its lines, and a footer row. */
function drawFeed(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  d: StampShareData,
  assets: { logo: HTMLImageElement; stamp: HTMLImageElement },
  f: BrandFonts,
) {
  background(ctx, w, h, 34);
  const textW = 880;
  const label = `MOON STAMPS · ${d.id}`;
  const motto = wrap(ctx, `600 26px ${f.label}`, d.motto, textW, 3, 2);
  const desc = wrap(ctx, `500 32px ${f.sans}`, d.description, textW, 0, 2);
  const left = 96;
  const right = w - 96;

  const footer: Item = {
    h: d.awardedAt ? 74 : 40,
    draw: (y) => {
      ctx.font = `600 24px ${f.label}`;
      ctx.fillStyle = BRAND.butter;
      spacedText(ctx, EARNED_LINE, left, y + 18, 6, "left");
      if (d.awardedAt) {
        ctx.font = `500 26px ${f.mono}`;
        ctx.fillStyle = BRAND.cream;
        spacedText(ctx, dotted(d.awardedAt), left, y + 56, 2, "left");
      }
      ctx.font = `500 30px ${f.mono}`;
      ctx.fillStyle = BRAND.butter;
      spacedText(ctx, HASHTAG, right, y + (d.awardedAt ? 37 : 18), 1, "right");
    },
  };

  const text: Item[] = [
    nameItem(ctx, cx, f, d.name, 104, textW),
    ...(d.subtitle ? [gap(2), lines(ctx, cx, `600 28px ${f.label}`, BRAND.butter, [d.subtitle], 38, 8)] : []),
    ...(motto.length ? [gap(10), lines(ctx, cx, `600 26px ${f.label}`, BRAND.cream, motto, 36, 3)] : []),
    ...(desc.length ? [gap(motto.length ? 6 : 12), lines(ctx, cx, `500 32px ${f.sans}`, BRAND.plywood, desc, 46)] : []),
    gap(30),
    { h: 4, draw: (y) => dashedRule(ctx, left, right, y + 2, "rgba(230,213,181,0.4)", 14, 10, 3) },
    gap(26),
    footer,
  ];
  const head: Item[] = [logoItem(ctx, cx, assets.logo, 330), gap(18), lines(ctx, cx, `600 22px ${f.label}`, BRAND.plywood, [label], 30, 9), gap(22)];

  const top = 74;
  const bottom = h - 70;
  const fixed = [...head, gap(26), ...text].reduce((a, i) => a + i.h, 0);
  const size = Math.max(380, Math.min(560, bottom - top - fixed));
  stack([...head, stampItem(ctx, cx, size, assets.stamp), gap(26), ...text], top, bottom);
}
