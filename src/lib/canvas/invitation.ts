import { INVITATION } from "@/lib/invitation";
import { BRAND, dashedRule, drawLogo, ensureFonts, grain, spacedText, type BrandFonts } from "./brand";

/** The invitation card as a 1080×1440 (3:4) PNG — same layout as the on-page card. */
export const INVITATION_SIZE = { w: 1080, h: 1440 } as const;

export async function prepareInvitationFonts(f: BrandFonts) {
  const korean = [INVITATION.lead, ...INVITATION.body, ...INVITATION.bring].join(" ");
  await ensureFonts([
    [`800 120px ${f.display}`, `${INVITATION.headline}${INVITATION.bringTitle}`],
    [`600 28px ${f.label}`, INVITATION.tagline],
    [`700 46px ${f.sans}`, korean],
    [`400 38px ${f.sans}`, korean],
    [`500 38px ${f.sans}`, korean],
    [`500 30px ${f.mono}`, `${INVITATION.hashtag} ${INVITATION.site}`],
  ]);
}

export function drawInvitation(canvas: HTMLCanvasElement, assets: { logo: HTMLImageElement }, f: BrandFonts) {
  const { w, h } = INVITATION_SIZE;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const left = 96;

  // Ivory paper with a little print grain.
  ctx.fillStyle = BRAND.ivory;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, [111, 70, 38], 0.06, 5);

  // Midnight band with the official logo.
  const bandH = 410;
  ctx.fillStyle = BRAND.midnight;
  ctx.fillRect(0, 0, w, bandH);
  grain(ctx, w, bandH, [244, 231, 207], 0.05, 9);
  const logoW = 640;
  drawLogo(ctx, assets.logo, w / 2, (bandH - (logoW * assets.logo.naturalHeight) / assets.logo.naturalWidth) / 2, logoW);

  // Headline and tagline.
  ctx.fillStyle = BRAND.midnight;
  ctx.font = `800 124px ${f.display}`;
  ctx.fillText(INVITATION.headline, left, 552);
  ctx.fillStyle = BRAND.brown;
  ctx.font = `600 27px ${f.label}`;
  spacedText(ctx, INVITATION.tagline, left + 4, 610, 7);

  // Lead and body.
  ctx.fillStyle = BRAND.midnight;
  ctx.font = `700 46px ${f.sans}`;
  ctx.fillText(INVITATION.lead, left, 708);
  ctx.fillStyle = BRAND.inkSoft;
  ctx.font = `400 38px ${f.sans}`;
  INVITATION.body.forEach((line, i) => ctx.fillText(line, left, 778 + i * 58));

  // Ticket perforation with side notches.
  const perfY = 980;
  dashedRule(ctx, 70, w - 70, perfY, "rgba(12,22,32,0.35)", 16, 12, 3);
  ctx.fillStyle = BRAND.plywood;
  for (const x of [0, w]) {
    ctx.beginPath();
    ctx.arc(x, perfY, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  // BRING A FRIEND.
  ctx.fillStyle = BRAND.midnight;
  ctx.font = `800 80px ${f.display}`;
  ctx.fillText(INVITATION.bringTitle, left, 1088);
  ctx.font = `500 38px ${f.sans}`;
  INVITATION.bring.forEach((line, i) => {
    const y = 1158 + i * 60;
    ctx.fillStyle = BRAND.butter;
    ctx.fillRect(left, y - 24, 16, 16);
    ctx.strokeStyle = BRAND.midnight;
    ctx.lineWidth = 2;
    ctx.strokeRect(left, y - 24, 16, 16);
    ctx.fillStyle = BRAND.midnight;
    ctx.fillText(line, left + 36, y);
  });

  // Footer.
  ctx.fillStyle = BRAND.brown;
  ctx.font = `500 30px ${f.mono}`;
  ctx.fillText(INVITATION.hashtag, left, 1376);
  ctx.fillStyle = BRAND.inkSoft;
  ctx.font = `500 26px ${f.mono}`;
  ctx.textAlign = "right";
  ctx.fillText(INVITATION.site, w - left, 1376);
  ctx.textAlign = "left";

  // Card edge.
  ctx.strokeStyle = BRAND.midnight;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);
}
