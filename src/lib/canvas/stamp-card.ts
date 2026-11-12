import { BRAND, dashedRule, drawLogo, ensureFonts, grain, spacedText, type BrandFonts } from "./brand";

/** A member's keepsake card for one stamp: 1080×1440 PNG. No name, no member id. */
export const STAMP_CARD_SIZE = { w: 1080, h: 1440 } as const;

export interface StampCardData {
  id: string;
  name: string;
  description: string;
  /** "YYYY-MM-DD" or "" when unknown (then the date line is left out). */
  awardedAt: string;
}

const TAGLINE = "LITTLE MOMENTS WORTH KEEPING.";
const dotted = (key: string) => key.replace(/-/g, ".");

export async function prepareStampCardFonts(d: StampCardData, f: BrandFonts) {
  await ensureFonts([
    [`800 112px ${f.display}`, d.name],
    [`600 26px ${f.label}`, `MOON STAMPS${TAGLINE}`],
    [`500 36px ${f.sans}`, d.description],
    [`500 28px ${f.mono}`, `${d.id} AWARDED ${dotted(d.awardedAt)} #afterc2m`],
  ]);
}

export function drawStampCard(
  canvas: HTMLCanvasElement,
  d: StampCardData,
  assets: { logo: HTMLImageElement; stamp: HTMLImageElement },
  f: BrandFonts,
) {
  const { w, h } = STAMP_CARD_SIZE;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Ivory paper, a midnight band with the official logo.
  ctx.fillStyle = BRAND.ivory;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, [111, 70, 38], 0.06, 17);
  const bandH = 300;
  ctx.fillStyle = BRAND.midnight;
  ctx.fillRect(0, 0, w, bandH);
  grain(ctx, w, bandH, [244, 231, 207], 0.05, 19);
  const logoW = 460;
  drawLogo(ctx, assets.logo, w / 2, (bandH - (logoW * assets.logo.naturalHeight) / assets.logo.naturalWidth) / 2, logoW);

  ctx.textAlign = "center";
  ctx.fillStyle = BRAND.brown;
  ctx.font = `600 26px ${f.label}`;
  spacedText(ctx, "MOON STAMPS", w / 2, 378, 12, "center");
  ctx.fillStyle = BRAND.inkSoft;
  ctx.font = `600 20px ${f.label}`;
  spacedText(ctx, TAGLINE, w / 2, 418, 6, "center");

  // The stamp, pressed on slightly crooked like a real one.
  const size = 640;
  const cy = 790;
  ctx.save();
  ctx.translate(w / 2, cy);
  ctx.rotate((-5 * Math.PI) / 180);
  ctx.drawImage(assets.stamp, -size / 2, -size / 2, size, size);
  ctx.restore();

  // Name and what it marks.
  ctx.fillStyle = BRAND.midnight;
  ctx.font = `800 112px ${f.display}`;
  ctx.fillText(d.name, w / 2, 1222);
  ctx.fillStyle = BRAND.inkSoft;
  ctx.font = `500 36px ${f.sans}`;
  ctx.fillText(d.description, w / 2, 1280);
  ctx.textAlign = "left";

  dashedRule(ctx, 96, w - 96, 1318, "rgba(12,22,32,0.3)", 14, 10, 3);
  ctx.fillStyle = BRAND.brown;
  ctx.font = `500 28px ${f.mono}`;
  ctx.fillText(d.awardedAt ? `${d.id} · AWARDED ${dotted(d.awardedAt)}` : d.id, 96, 1378);
  ctx.textAlign = "right";
  ctx.fillText("#afterc2m", w - 96, 1378);
  ctx.textAlign = "left";

  ctx.strokeStyle = BRAND.midnight;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);
}
