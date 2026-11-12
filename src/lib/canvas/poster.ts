import { MONTH_EN, WEEKDAY_EN, formatKeyKo, formatTime, seoulParts, toDateKey } from "@/lib/dates";
import {
  BRAND,
  crescent,
  dashedRule,
  drawLogo,
  ellipsize,
  ensureFonts,
  grain,
  spacedText,
  wrapLines,
  type BrandFonts,
} from "./brand";

/** Public event data the poster shows. Missing fields are simply left out. */
export interface PosterData {
  title: string;
  category: string | null;
  start: number;
  end: number | null;
  allDay: boolean;
  location: string | null;
  fee: string | null;
  notes: string | null;
  canceled: boolean;
}

export type PosterFormat = "feed" | "story";
export const POSTER_SIZES: Record<PosterFormat, { w: number; h: number; label: string }> = {
  feed: { w: 1080, h: 1440, label: "FEED 3:4" },
  story: { w: 1080, h: 1920, label: "STORY 9:16" },
};

interface Layout {
  logoTop: number;
  logoWidth: number;
  categoryY: number;
  dateTop: number;
  daySize: number;
  moon: { x: number; y: number; r: number };
  /** Title + details share the band between the date and the footer. */
  contentTop: number;
  infoBottom: number;
  titleStart: number;
  titleMin: number;
  titleLines: number;
  notesLines: number;
  footerY: number;
}

// Each format has its own composition (no cropping/scaling of the other one).
// STORY keeps ~250px clear at the top and ~270px at the bottom for Instagram's UI.
const LAYOUTS: Record<PosterFormat, Layout> = {
  feed: {
    logoTop: 78, logoWidth: 500, categoryY: 418,
    dateTop: 470, daySize: 300, moon: { x: 905, y: 610, r: 230 },
    contentTop: 790, infoBottom: 1316, titleStart: 92, titleMin: 52, titleLines: 3,
    notesLines: 1, footerY: 1372,
  },
  story: {
    logoTop: 250, logoWidth: 560, categoryY: 604,
    dateTop: 654, daySize: 340, moon: { x: 900, y: 830, r: 260 },
    contentTop: 1010, infoBottom: 1590, titleStart: 104, titleMin: 56, titleLines: 3,
    notesLines: 2, footerY: 1650,
  },
};

// Detail rows (PLACE / FEE / BRING) metrics.
const INFO = { first: 58, line: 46, gap: 18, tail: 14, labelX: 80, valueX: 232, right: 80, size: 34 } as const;
const TITLE_GAP = 56; // between the title block and the dashed rule
const TITLE_LINE = 1.22;

interface InfoRow {
  label: string;
  lines: string[];
}

function infoHeight(rows: InfoRow[]): number {
  if (!rows.length) return 0;
  const lines = rows.reduce((n, r) => n + r.lines.length, 0);
  return INFO.first + (lines - 1) * INFO.line + (rows.length - 1) * INFO.gap + INFO.tail;
}

/** Wraps a value to at most `maxLines`; only the optional BRING text is ever shortened (with "…"). */
function infoRows(ctx: CanvasRenderingContext2D, d: PosterData, f: BrandFonts, notesLines: number): InfoRow[] {
  ctx.font = `500 ${INFO.size}px ${f.sans}`;
  const maxW = 1080 - INFO.valueX - INFO.right;
  const rows: InfoRow[] = [];
  if (d.location) rows.push({ label: "PLACE", lines: wrapLines(ctx, d.location, maxW) });
  if (d.fee) rows.push({ label: "FEE", lines: wrapLines(ctx, d.fee, maxW) });
  if (d.notes && notesLines > 0) {
    const wrapped = wrapLines(ctx, d.notes.replace(/\s+/g, " "), maxW);
    const shown = wrapped.slice(0, notesLines);
    if (wrapped.length > notesLines) {
      shown[notesLines - 1] = ellipsize(ctx, `${shown[notesLines - 1]} ${wrapped.slice(notesLines).join(" ")}`, maxW);
    }
    rows.push({ label: "BRING", lines: shown });
  }
  return rows;
}

/**
 * Picks the title size and the detail rows together so nothing overlaps:
 * the title is never cut (it shrinks, then may take one more line); if space
 * is still short, the optional BRING row shortens and then steps aside.
 */
function planContent(ctx: CanvasRenderingContext2D, d: PosterData, L: Layout, f: BrandFonts) {
  const titleFont = (size: number) => `800 ${size}px ${f.sans}`;
  const maxW = 1080 - 160;
  const blockH = (size: number, n: number) => size * 1.08 + (n - 1) * size * TITLE_LINE;
  const notesOptions = d.notes ? [...new Set([L.notesLines, 1, 0])] : [0];
  let last: { size: number; lines: string[]; rows: InfoRow[] } | null = null;

  for (const maxLines of [L.titleLines, L.titleLines + 1]) {
    for (const notesLines of notesOptions) {
      const rows = infoRows(ctx, d, f, notesLines);
      const room = L.infoBottom - L.contentTop - infoHeight(rows) - (rows.length ? TITLE_GAP : 0);
      for (let size = L.titleStart; size >= L.titleMin; size -= 4) {
        ctx.font = titleFont(size);
        const lines = wrapLines(ctx, d.title, maxW);
        last = { size, lines, rows };
        if (lines.length <= maxLines && blockH(size, lines.length) <= room) return { ...last, blockH: blockH(size, lines.length) };
      }
    }
  }
  // Not reachable for real titles (≤ 80 chars); draw at the minimum size rather than cut anything.
  return { ...last!, blockH: blockH(last!.size, last!.lines.length) };
}

const isLatin = (s: string) => /^[\x20-\x7E]+$/.test(s);

function timeLine(d: PosterData): string {
  const firstDay = toDateKey(d.start);
  if (d.allDay) {
    const lastDay = d.end ? toDateKey(d.end - 1) : firstDay;
    return lastDay > firstDay ? `${formatKeyKo(firstDay)} – ${formatKeyKo(lastDay)}` : "ALL DAY";
  }
  return d.end && toDateKey(d.end - 1) === firstDay ? `${formatTime(d.start)} – ${formatTime(d.end)}` : formatTime(d.start);
}

/** Loads every face/weight the poster uses, with the exact strings, before drawing. */
export async function preparePosterFonts(d: PosterData, f: BrandFonts) {
  const p = seoulParts(d.start);
  const latin = `${p.day}${MONTH_EN[p.month - 1]}${WEEKDAY_EN[p.weekday]}CANCELEDPLACEFEEBRINGPRIVATE#afterc2m${d.category ?? ""}`;
  const info = [d.title, d.location, d.fee, d.notes, d.category, timeLine(d)].filter(Boolean).join(" ");
  await ensureFonts([
    [`800 300px ${f.display}`, `${latin}0123456789`],
    [`600 40px ${f.label}`, latin],
    [`800 90px ${f.sans}`, d.title],
    [`500 34px ${f.sans}`, info],
    [`700 34px ${f.sans}`, info],
    [`500 40px ${f.mono}`, `${timeLine(d)} aftercltomoon.vercel.app #afterc2m`],
  ]);
}

export function drawPoster(
  canvas: HTMLCanvasElement,
  d: PosterData,
  format: PosterFormat,
  assets: { logo: HTMLImageElement },
  f: BrandFonts,
) {
  const { w, h } = POSTER_SIZES[format];
  const L = LAYOUTS[format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  // Paper: midnight stock, printed grain, a thin frame.
  ctx.fillStyle = BRAND.midnight;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, [244, 231, 207], 0.07, 11);
  ctx.strokeStyle = "rgba(244,231,207,0.28)";
  ctx.lineWidth = 2;
  ctx.strokeRect(34, 34, w - 68, h - 68);

  // Moon motif behind the date.
  crescent(ctx, L.moon.x, L.moon.y, L.moon.r, BRAND.butter, 0.14);

  // Official logo (includes "PRIVATE BOULDERING CLUB").
  drawLogo(ctx, assets.logo, w / 2, L.logoTop, L.logoWidth);

  // Category label between rules.
  if (d.category) {
    const label = isLatin(d.category) ? d.category.toUpperCase() : d.category;
    ctx.fillStyle = BRAND.butter;
    ctx.font = isLatin(label) ? `600 30px ${f.label}` : `700 30px ${f.sans}`;
    const tw = spacedText(ctx, label, w / 2, L.categoryY, isLatin(label) ? 9 : 4, "center");
    ctx.fillRect(w / 2 - tw / 2 - 110, L.categoryY - 11, 80, 2);
    ctx.fillRect(w / 2 + tw / 2 + 30, L.categoryY - 11, 80, 2);
  }

  // Big date: day number + month / weekday / time stacked beside it.
  const p = seoulParts(d.start);
  const day = String(p.day);
  ctx.font = `800 ${L.daySize}px ${f.display}`;
  const dayW = ctx.measureText(day).width;
  const month = MONTH_EN[p.month - 1].slice(0, 3);
  const monthSize = Math.round(L.daySize * 0.36);
  ctx.font = `800 ${monthSize}px ${f.display}`;
  const monthW = ctx.measureText(month).width;
  const time = timeLine(d);
  const timeSize = Math.round(L.daySize * 0.15);
  ctx.font = `500 ${timeSize}px ${isLatin(time) ? f.mono : f.sans}`;
  const timeW = ctx.measureText(time).width;
  const gapX = 34;
  const colW = Math.max(monthW, timeW, 160);
  const groupX = (w - (dayW + gapX + colW)) / 2;
  const baseline = L.dateTop + L.daySize * 0.82;

  ctx.fillStyle = BRAND.butter;
  ctx.font = `800 ${L.daySize}px ${f.display}`;
  ctx.fillText(day, groupX, baseline);
  const colX = groupX + dayW + gapX;
  ctx.fillStyle = BRAND.cream;
  ctx.font = `800 ${monthSize}px ${f.display}`;
  ctx.fillText(month, colX, L.dateTop + monthSize * 0.98);
  ctx.fillStyle = BRAND.butter;
  ctx.font = `600 ${Math.round(L.daySize * 0.13)}px ${f.label}`;
  spacedText(ctx, WEEKDAY_EN[p.weekday], colX + 2, L.dateTop + monthSize + L.daySize * 0.2, 8);
  ctx.fillStyle = BRAND.cream;
  ctx.font = `500 ${timeSize}px ${isLatin(time) ? f.mono : f.sans}`;
  ctx.fillText(time, colX, baseline);

  // Title (largest size that fits, never cut) and the details (only what the event has),
  // planned together. Details sit on the footer; the title is centred in the space above them.
  const plan = planContent(ctx, d, L, f);
  const infoTop = L.infoBottom - infoHeight(plan.rows);
  const titleBottom = plan.rows.length ? infoTop - TITLE_GAP : L.infoBottom;
  const titleTop = L.contentTop + Math.max(0, (titleBottom - L.contentTop - plan.blockH) / 2);
  ctx.font = `800 ${plan.size}px ${f.sans}`;
  ctx.fillStyle = BRAND.cream;
  ctx.textAlign = "center";
  plan.lines.forEach((line, i) => ctx.fillText(line, w / 2, titleTop + plan.size * 0.92 + i * plan.size * TITLE_LINE));
  ctx.textAlign = "left";

  if (plan.rows.length) {
    dashedRule(ctx, INFO.labelX, w - INFO.right, infoTop, "rgba(244,231,207,0.45)", 12, 10, 2);
    let y = infoTop + INFO.first;
    for (const row of plan.rows) {
      ctx.fillStyle = BRAND.butter;
      ctx.font = `600 24px ${f.label}`;
      spacedText(ctx, row.label, INFO.labelX, y, 6);
      ctx.fillStyle = BRAND.cream;
      ctx.font = `500 ${INFO.size}px ${f.sans}`;
      row.lines.forEach((line, i) => ctx.fillText(line, INFO.valueX, y + i * INFO.line));
      y += row.lines.length * INFO.line + INFO.gap;
    }
  }

  // Footer.
  ctx.fillStyle = BRAND.butter;
  ctx.font = `500 30px ${f.mono}`;
  ctx.fillText("#afterc2m", 80, L.footerY);
  ctx.fillStyle = "rgba(244,231,207,0.7)";
  ctx.font = `500 26px ${f.mono}`;
  ctx.textAlign = "right";
  ctx.fillText("aftercltomoon.vercel.app", w - 80, L.footerY);
  ctx.textAlign = "left";

  // A canceled event, if one is ever rendered, is marked unmistakably.
  if (d.canceled) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.22);
    ctx.strokeStyle = BRAND.orange;
    ctx.lineWidth = 8;
    ctx.strokeRect(-330, -95, 660, 150);
    ctx.fillStyle = BRAND.orange;
    ctx.font = `800 120px ${f.display}`;
    ctx.textAlign = "center";
    ctx.fillText("CANCELED", 0, 25);
    ctx.restore();
  }
}
