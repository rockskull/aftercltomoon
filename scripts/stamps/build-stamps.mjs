// Builds the six MOON STAMPS artworks → public/stamps/st-0N.svg (run once; commit the SVGs).
// Each stamp has its own seed, so changing one design never moves another's pixels.
//
//   npm run stamps:build
//
// The stamps are finished, static design assets. This script only exists so the
// design lives in code and can be adjusted later: same seed, same output.
// Lettering uses the site's own fonts (Jost, Big Shoulders) converted to outlines,
// so the SVGs render identically everywhere (img tags, canvas) with no font loading.
// Fonts are downloaded from Google Fonts into node_modules/.cache on first run.

import opentype from "opentype.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "public", "stamps");
const CACHE = join(ROOT, "node_modules", ".cache", "stamp-fonts");

const C = { navy: "#0c1620", butter: "#edc360", cream: "#f4e7cf", paper: "#fbf5e8" };
const CX = 500;
const CY = 500;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

async function loadFont(family) {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${family.replace(/[^A-Za-z0-9]+/g, "-")}.ttf`);
  if (!existsSync(file)) {
    // An old user agent makes Google Fonts serve plain TTF files.
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}`, { headers: { "user-agent": "Mozilla/4.0" } })).text();
    const url = /url\((https:[^)]+\.ttf)\)/.exec(css)?.[1];
    if (!url) throw new Error(`no TTF for ${family}`);
    writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  const buf = readFileSync(file);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

// ---------------------------------------------------------------------------
// Geometry: hand-drawn edges come from smooth, seeded wobble along each outline
// ---------------------------------------------------------------------------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.05) out.pop();
  return out;
}

function resample(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const k = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
    for (let j = 0; j < k; j++) out.push([x1 + ((x2 - x1) * j) / k, y1 + ((y2 - y1) * j) / k]);
  }
  return out;
}

/** Displaces a closed outline along its normals by a seamless low-frequency wobble plus a little grit. */
function roughen(pts, rnd, { amp = 1.6, grit = 0.35, step = 4 } = {}) {
  const p = resample(dedupe(pts), step);
  const n = p.length;
  let perimeter = 0;
  for (let i = 0; i < n; i++) perimeter += Math.hypot(p[(i + 1) % n][0] - p[i][0], p[(i + 1) % n][1] - p[i][1]);
  const waves = [
    [170, 0.55],
    [60, 0.3],
    [18, 0.15],
  ].map(([wavelength, weight]) => ({
    k: Math.max(1, Math.round(perimeter / (wavelength * (0.7 + rnd() * 0.6)))),
    w: weight,
    phase: rnd() * TAU,
  }));
  const out = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    const prev = p[(i - 1 + n) % n];
    const next = p[(i + 1) % n];
    let nx = -(next[1] - prev[1]);
    let ny = next[0] - prev[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const t = (s / perimeter) * TAU;
    const d = amp * waves.reduce((acc, w) => acc + w.w * Math.sin(w.k * t + w.phase), 0) + grit * (rnd() * 2 - 1);
    out.push([p[i][0] + nx * d, p[i][1] + ny * d]);
  }
  return out;
}

const circle = (cx, cy, r, step = 5) => {
  const n = Math.max(14, Math.ceil((TAU * r) / step));
  return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * TAU), cy + r * Math.sin((i / n) * TAU)]);
};

const ellipse = (cx, cy, rx, ry, rotDeg = 0, step = 5) => {
  const n = Math.max(14, Math.ceil((TAU * Math.max(rx, ry)) / step));
  const a = (rotDeg * Math.PI) / 180;
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)];
  });
};

/** A stroke with round ends from (x1,y1) to (x2,y2). */
function capsule(x1, y1, x2, y2, w) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const r = w / 2;
  const pts = [];
  const n = Math.max(6, Math.ceil((Math.PI * r) / 3));
  for (let i = 0; i <= n; i++) {
    const t = a - Math.PI / 2 + (i / n) * Math.PI;
    pts.push([x2 + r * Math.cos(t), y2 + r * Math.sin(t)]);
  }
  for (let i = 0; i <= n; i++) {
    const t = a + Math.PI / 2 + (i / n) * Math.PI;
    pts.push([x1 + r * Math.cos(t), y1 + r * Math.sin(t)]);
  }
  return pts;
}

/** Circle 1 minus circle 2. */
function crescent(c1x, c1y, r1, c2x, c2y, r2) {
  const outside = circle(c1x, c1y, r1, 2).filter(([x, y]) => Math.hypot(x - c2x, y - c2y) >= r2);
  const inside = circle(c2x, c2y, r2, 2).filter(([x, y]) => Math.hypot(x - c1x, y - c1y) <= r1);
  const arc = (pts, cx, cy) => {
    // order by angle, starting right after the largest angular gap (so the arc is contiguous)
    const withA = pts.map((p) => [Math.atan2(p[1] - cy, p[0] - cx), p]).sort((a, b) => a[0] - b[0]);
    let gapAt = 0;
    let gap = -1;
    for (let i = 0; i < withA.length; i++) {
      const next = i + 1 < withA.length ? withA[i + 1][0] : withA[0][0] + TAU;
      if (next - withA[i][0] > gap) {
        gap = next - withA[i][0];
        gapAt = i + 1;
      }
    }
    return [...withA.slice(gapAt), ...withA.slice(0, gapAt)].map((x) => x[1]);
  };
  const outer = arc(outside, c1x, c1y);
  let inner = arc(inside, c2x, c2y);
  const end = outer[outer.length - 1];
  const d = (p) => Math.hypot(p[0] - end[0], p[1] - end[1]);
  if (d(inner[inner.length - 1]) < d(inner[0])) inner = inner.reverse();
  return [...outer, ...inner];
}

function star(cx, cy, r, points = 5, inner = 0.44, rotDeg = -90) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const t = ((rotDeg + (i * 180) / points) * Math.PI) / 180;
    pts.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]);
  }
  return pts;
}

/** Four-point sparkle with concave sides. */
function sparkle(cx, cy, r) {
  const pts = [];
  for (let q = 0; q < 4; q++) {
    const a0 = (q * Math.PI) / 2 - Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      const a = a0 + (t * Math.PI) / 2;
      const rr = r * (0.16 + 0.84 * Math.abs(Math.cos(t * Math.PI)) ** 2.4);
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
  }
  return pts;
}

/** Irregular blob (a climbing hold). */
function blob(cx, cy, rx, ry, rnd, wobble = 0.12) {
  const p1 = rnd() * TAU;
  const p2 = rnd() * TAU;
  return Array.from({ length: 120 }, (_, i) => {
    const t = (i / 120) * TAU;
    const k = 1 + wobble * Math.sin(3 * t + p1) + wobble * 0.6 * Math.sin(5 * t + p2);
    return [cx + rx * k * Math.cos(t), cy + ry * k * Math.sin(t)];
  });
}

// ---------------------------------------------------------------------------
// Lettering on a circle
// ---------------------------------------------------------------------------

function glyphContours(font, ch, size) {
  const contours = [];
  let cur = null;
  let last = [0, 0];
  for (const c of font.getPath(ch, 0, 0, size).commands) {
    if (c.type === "M") {
      cur = [[c.x, c.y]];
      contours.push(cur);
      last = [c.x, c.y];
    } else if (c.type === "L") {
      cur.push([c.x, c.y]);
      last = [c.x, c.y];
    } else if (c.type === "Q") {
      for (let i = 1; i <= 6; i++) {
        const u = i / 6;
        cur.push([(1 - u) ** 2 * last[0] + 2 * (1 - u) * u * c.x1 + u * u * c.x, (1 - u) ** 2 * last[1] + 2 * (1 - u) * u * c.y1 + u * u * c.y]);
      }
      last = [c.x, c.y];
    } else if (c.type === "C") {
      for (let i = 1; i <= 8; i++) {
        const u = i / 8;
        const v = 1 - u;
        cur.push([
          v ** 3 * last[0] + 3 * v * v * u * c.x1 + 3 * v * u * u * c.x2 + u ** 3 * c.x,
          v ** 3 * last[1] + 3 * v * v * u * c.y1 + 3 * v * u * u * c.y2 + u ** 3 * c.y,
        ]);
      }
      last = [c.x, c.y];
    }
  }
  return contours.filter((c) => c.length > 2);
}

/**
 * Text along the band. "top": reads clockwise, letters point outward.
 * "bottom": reads left to right, letters point to the centre (upright).
 * Letter spacing stretches so the text spans `arcDeg`.
 */
function arcText(font, text, { size, r, arcDeg, mode, minSpacing = 3, maxSpacing = 34 }) {
  const chars = [...text];
  const adv = chars.map((ch) => font.getAdvanceWidth(ch, size));
  const total = adv.reduce((a, b) => a + b, 0);
  const spacing = Math.min(maxSpacing, Math.max(minSpacing, ((arcDeg * Math.PI) / 180 * r - total) / (chars.length - 1)));
  const theta = (total + spacing * (chars.length - 1)) / r;
  const center = mode === "top" ? -Math.PI / 2 : Math.PI / 2;
  const contours = [];
  let x = 0;
  chars.forEach((ch, i) => {
    const mid = x + adv[i] / 2;
    const a = mode === "top" ? center - theta / 2 + mid / r : center + theta / 2 - mid / r;
    const rho = mode === "top" ? a + Math.PI / 2 : a - Math.PI / 2;
    const base = mode === "top" ? -r : r;
    const cos = Math.cos(rho);
    const sin = Math.sin(rho);
    for (const contour of glyphContours(font, ch, size)) {
      contours.push(
        contour.map(([gx, gy]) => {
          const lx = gx - adv[i] / 2;
          const ly = base + gy;
          return [CX + lx * cos - ly * sin, CY + lx * sin + ly * cos];
        }),
      );
    }
    x += adv[i] + spacing;
  });
  return { contours, halfDeg: (theta / 2) * (180 / Math.PI) };
}

/**
 * Straight text centred on (cx, cy) by its real outline bounds, `width` wide.
 * Returns one contour list per character so parts can take different colours.
 */
function blockText(font, text, { width, cx, cy, tracking = 0 }) {
  const chars = [...text];
  const unit = chars.reduce((a, ch) => a + font.getAdvanceWidth(ch, 100), 0) / 100;
  const size = (width - tracking * (chars.length - 1)) / unit;
  let x = 0;
  const glyphs = chars.map((ch) => {
    const g = glyphContours(font, ch, size).map((c) => c.map(([gx, gy]) => [x + gx, gy]));
    x += font.getAdvanceWidth(ch, size) + tracking;
    return g;
  });
  const all = glyphs.flat(2);
  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const dx = cx - (minX + maxX) / 2;
  const dy = cy - (minY + maxY) / 2;
  return glyphs.map((g) => g.map((c) => c.map(([px, py]) => [px + dx, py + dy])));
}

/**
 * The lit part of a moon. `phase` runs 0 → 1 over one cycle: 0 new, 0.5 full;
 * waxing is lit on the right, waning on the left.
 */
function moonLit(cx, cy, r, phase) {
  const waxing = phase <= 0.5;
  const side = waxing ? 1 : -1;
  const k = Math.cos(phase * TAU); // where the terminator sits, as a share of the limb
  const n = 40;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push([cx + side * r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  for (let i = n - 1; i >= 1; i--) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push([cx + side * k * r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Short dashes along a circular arc (an orbit drawn by hand). */
function dashedArc(cx, cy, r, fromDeg, toDeg, { dash = 16, gap = 13, w = 4.5 } = {}) {
  const out = [];
  const len = ((toDeg - fromDeg) * Math.PI * r) / 180;
  for (let s = 0; s + dash <= len; s += dash + gap) {
    const a1 = (fromDeg * Math.PI) / 180 + s / r;
    const a2 = a1 + dash / r;
    out.push(capsule(cx + r * Math.cos(a1), cy + r * Math.sin(a1), cx + r * Math.cos(a2), cy + r * Math.sin(a2), w));
  }
  return out;
}

// ---------------------------------------------------------------------------
// SVG output
// ---------------------------------------------------------------------------

const fmt = (n, digits) => {
  const s = n.toFixed(digits);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};
/** Same winding for every shape of a layer, so overlapping parts add up instead of cancelling into holes. */
const signedArea = (c) => c.reduce((a, p, i) => a + p[0] * c[(i + 1) % c.length][1] - c[(i + 1) % c.length][0] * p[1], 0);
const oriented = (contours) => contours.map((c) => (signedArea(c) < 0 ? [...c].reverse() : c));
const pathOf = (contours, digits = 0) =>
  contours.map((c) => `M${c.map(([x, y]) => `${fmt(x, digits)} ${fmt(y, digits)}`).join("L")}Z`).join("");

function stampSvg(spec, fonts) {
  const rnd = rng(spec.seed);
  const layers = []; // [fill, d, extra attrs]
  const add = (fill, contours, opts = {}) => layers.push({ fill, d: pathOf(contours, opts.digits ?? 0), rule: opts.rule, opacity: opts.opacity });
  const rough = (pts, o) => roughen(pts, rnd, o);
  const ring = (r, w, o = {}) => [rough(circle(CX, CY, r + w / 2), o), rough(circle(CX, CY, r - w / 2), o)];

  // Badge frame: thick outer ring, thin rings around the lettering band, the dark centre field.
  add(C.navy, ring(457, 24, { amp: 2.4, grit: 0.5, step: 6 }), { rule: "evenodd" });
  add(C.navy, ring(432, 5, { amp: 1.4, grit: 0.3, step: 6 }), { rule: "evenodd" });
  add(C.navy, ring(340, 5, { amp: 1.4, grit: 0.3, step: 6 }), { rule: "evenodd" });
  add(C.navy, [rough(circle(CX, CY, 330), { amp: 2, grit: 0.4, step: 6 })]);

  // Lettering: the club on top, the stamp's name below.
  const top = arcText(fonts.jost, "AFTER CL TO MOON", { size: 52, r: 368, arcDeg: 150, mode: "top" });
  const bottom = arcText(fonts.shoulders, spec.name, { size: 80, r: 412, arcDeg: 92, mode: "bottom" });
  add(C.navy, top.contours.map((c) => roughen(c, rnd, { amp: 0.55, grit: 0.3, step: 2.5 })), { digits: 1 });
  add(C.navy, bottom.contours.map((c) => roughen(c, rnd, { amp: 0.7, grit: 0.35, step: 2.5 })), { digits: 1 });

  // Separator stars in the gaps between the two lines of lettering.
  const gapMid = ((-90 + top.halfDeg + (90 - bottom.halfDeg)) / 2) * (Math.PI / 180);
  for (const a of [gapMid, Math.PI - gapMid]) {
    const x = CX + 386 * Math.cos(a);
    const y = CY + 386 * Math.sin(a);
    add(C.navy, [rough(star(x, y, 24), { amp: 0.6, grit: 0.3, step: 2 })], { digits: 1 });
    add(C.butter, [rough(star(x, y, 15), { amp: 0.4, grit: 0.2, step: 2 })], { digits: 1 });
  }

  // A ring of small dots just inside the field.
  const dots = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    dots.push(rough(circle(CX + 308 * Math.cos(a), CY + 308 * Math.sin(a), 3.4, 1.5), { amp: 0.3, grit: 0.25, step: 1.5 }));
  }
  add(C.cream, dots, { digits: 1, opacity: 0.55 });

  // The illustration, clipped to the field.
  const art = [];
  spec.draw({
    fill: (color, contours, o = {}) => art.push({ fill: color, d: pathOf(oriented(contours), o.digits ?? 1), rule: o.rule, opacity: o.opacity }),
    rough: (pts, o) => roughen(pts, rnd, { amp: 1.3, grit: 0.35, step: 3, ...o }),
    rnd,
    fonts,
  });

  // Ink texture: specks of paper showing through, more of them on the worn rim.
  const specks = [];
  for (let i = 0; i < 700; i++) {
    const r = 470 * Math.sqrt(rnd());
    const a = rnd() * TAU;
    specks.push(`<circle cx="${fmt(CX + r * Math.cos(a), 1)}" cy="${fmt(CY + r * Math.sin(a), 1)}" r="${fmt(0.6 + rnd() * 1.4, 1)}"/>`);
  }
  for (let i = 0; i < 160; i++) {
    const r = 430 + rnd() * 42;
    const a = rnd() * TAU;
    specks.push(`<circle cx="${fmt(CX + r * Math.cos(a), 1)}" cy="${fmt(CY + r * Math.sin(a), 1)}" r="${fmt(1.2 + rnd() * 2.6, 1)}"/>`);
  }

  const el = (l) =>
    `<path fill="${l.fill}"${l.rule ? ` fill-rule="${l.rule}"` : ""}${l.opacity ? ` fill-opacity="${l.opacity}"` : ""} d="${l.d}"/>`;
  const base = pathOf([roughen(circle(CX, CY, 480), rnd, { amp: 1.5, grit: 0.3, step: 6 })]);
  const field = pathOf([circle(CX, CY, 329, 6)]);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">`,
    `<title>${spec.id} ${spec.name} · AFTER CL TO MOON</title>`,
    `<defs>`,
    `<mask id="ink" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000"><rect width="1000" height="1000" fill="#fff"/><g fill="#000">${specks.join("")}</g></mask>`,
    `<clipPath id="field"><path d="${field}"/></clipPath>`,
    `</defs>`,
    `<path fill="${C.paper}" d="${base}"/>`,
    `<g mask="url(#ink)">`,
    ...layers.map(el),
    `<g clip-path="url(#field)">`,
    ...art.map(el),
    `</g>`,
    `</g>`,
    `</svg>`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The six stamps
// ---------------------------------------------------------------------------

const speck = (rough, [x, y, r]) => rough(circle(x, y, r, 1.5), { amp: 0.3, grit: 0.2, step: 1.5 });
const rotate = (pts, cx, cy, deg) => {
  const a = (deg * Math.PI) / 180;
  return pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
};
const polar = (r, deg) => [CX + r * Math.cos((deg * Math.PI) / 180), CY + r * Math.sin((deg * Math.PI) / 180)];
const text = (fill, rough, color, glyphs) =>
  fill(color, glyphs.flat().map((c) => rough(c, { amp: 0.8, grit: 0.3, step: 2.5 })), { rule: "evenodd" });

/** One moon on an orbit: a navy gap so the orbit line stops short of it, the dim disc, the lit part. */
function phaseMoon(fill, rough, x, y, r, phase) {
  fill(C.navy, [circle(x, y, r + 10, 2)]);
  fill(C.cream, [rough(circle(x, y, r, 2), { amp: 0.6, grit: 0.25, step: 2 })], { opacity: 0.17 });
  fill(C.cream, [rough(moonLit(x, y, r, phase), { amp: 0.55, grit: 0.25, step: 2 })]);
}

/** A bonus month: a full butter moon with a couple of faint craters. */
function bonusMoon(fill, rough, x, y, r) {
  fill(C.navy, [circle(x, y, r + 10, 2)]);
  fill(C.butter, [rough(circle(x, y, r, 2), { amp: 0.8, grit: 0.25, step: 2 })]);
  fill(C.navy, [
    [x - r * 0.3, y - r * 0.25, r * 0.22],
    [x + r * 0.32, y + r * 0.22, r * 0.15],
  ].map(([cx, cy, cr]) => rough(circle(cx, cy, cr, 1.5), { amp: 0.3, grit: 0.2, step: 1.5 })), { opacity: 0.16 });
}

const STAMPS = [
  {
    id: "ST-01",
    file: "st-01",
    name: "FIRST MOON",
    seed: 101,
    // A crescent and a few small stars: the first visit.
    draw({ fill, rough }) {
      fill(C.butter, [rough(crescent(478, 494, 168, 552, 446, 150), { amp: 1.8 })]);
      // a star held in the crescent's curve, and a few more around it
      fill(C.cream, [rough(sparkle(588, 470, 42), { amp: 0.6, grit: 0.25, step: 2 })]);
      fill(C.cream, [rough(sparkle(684, 336, 22), { amp: 0.4, grit: 0.2, step: 1.5 })]);
      fill(C.cream, [rough(sparkle(350, 318, 20), { amp: 0.4, grit: 0.2, step: 1.5 })]);
      fill(C.butter, [rough(star(690, 572, 17), { amp: 0.4, grit: 0.2, step: 1.5 })]);
      fill(C.cream, [
        [395, 668, 6],
        [690, 318, 5],
        [298, 470, 4.5],
        [590, 700, 5],
        [462, 270, 4],
        [318, 600, 3.5],
      ].map(([x, y, r]) => rough(circle(x, y, r, 1.5), { amp: 0.3, grit: 0.2, step: 1.5 })));
    },
  },
  {
    id: "ST-02",
    file: "st-02",
    name: "100 HOLDS",
    seed: 212,
    // One long route of same-colour holds looping around a big "100": the
    // designated 100-hold endurance problem, climbed in one go.
    draw({ fill, rough, rnd, fonts }) {
      const FROM = 122; // start, bottom left
      const SWEEP = 274; // along the bottom, up the right, over the top → finish upper left
      const R = 236;
      const along = (t) => FROM - t * SWEEP;
      const holds = [];
      const N = 23;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const last = i === N - 1;
        const [x, y] = polar(R + (i % 2 ? 13 : -11) + (rnd() - 0.5) * 6, along(t));
        const s = last ? 28 : i === 0 ? 21 : 14.5 + rnd() * 8.5;
        holds.push({ x, y, s, last, rx: s * (1 + rnd() * 0.35), ry: s * (0.68 + rnd() * 0.25), rot: rnd() * 180 });
      }
      // the climber's line, a dotted trail that steps around the holds
      const trail = [];
      const len = (SWEEP * Math.PI * R) / 180;
      for (let s = 0; s <= len; s += 13) {
        const [x, y] = polar(R, along(s / len));
        if (holds.every((h) => Math.hypot(h.x - x, h.y - y) > h.s * 1.25 + 7)) trail.push(rough(circle(x, y, 2.6, 1), { amp: 0.25, grit: 0.15, step: 1 }));
      }
      fill(C.cream, trail, { opacity: 0.62 });
      // start tape under the first hold
      const first = holds[0];
      fill(C.cream, [
        capsule(first.x - 14, first.y + 26, first.x + 4, first.y + 30, 6),
        capsule(first.x + 10, first.y + 28, first.x + 28, first.y + 22, 6),
      ].map((c) => rough(c, { amp: 0.3, grit: 0.2, step: 1.5 })), { opacity: 0.85 });
      // the holds: one colour, like a set route
      fill(C.butter, holds.map((h) => rough(rotate(blob(h.x, h.y, h.rx, h.ry, rnd, 0.14), h.x, h.y, h.rot), { amp: 0.7, grit: 0.25, step: 2 })));
      fill(C.navy, holds.filter((h) => h.s > 17).map((h) => speck(rough, [h.x + 1, h.y - 1, h.last ? 5 : 3.6])), { opacity: 0.8 });
      // the finish: sparkle over the last hold
      const top = holds[N - 1];
      fill(C.cream, [rough(sparkle(top.x + 8, top.y - 58, 22), { amp: 0.4, grit: 0.2, step: 1.5 })]);
      // the number
      text(fill, rough, C.butter, blockText(fonts.shoulders, "100", { width: 300, cx: 500, cy: 474, tracking: 12 }));
      text(fill, rough, C.cream, blockText(fonts.jost, "ENDURANCE", { width: 236, cx: 500, cy: 606, tracking: 9 }));
      // chalk in the open side
      fill(C.cream, [[270, 560, 4.5], [298, 610, 3.2], [252, 498, 3.4], [316, 662, 2.8]].map((d) => speck(rough, d)), { opacity: 0.85 });
    },
  },
  {
    id: "ST-03",
    file: "st-03",
    name: "NIGHT OWL",
    seed: 303,
    // An owl on a branch in front of the moon: the after-work session.
    draw({ fill, rough }) {
      fill(C.butter, [rough(circle(500, 405, 168, 4), { amp: 1.8 })]);
      fill(C.navy, [
        [432, 300, 17],
        [584, 292, 11],
        [612, 362, 8],
      ].map(([x, y, r]) => rough(circle(x, y, r, 2), { amp: 0.6, grit: 0.25, step: 2 })), { opacity: 0.16 });
      // branch (behind the feet)
      fill(C.cream, [
        rough(capsule(300, 672, 708, 656, 16), { amp: 1 }),
        rough(capsule(612, 662, 660, 628, 9), { amp: 0.6 }),
        rough(ellipse(684, 612, 22, 10, -35, 2), { amp: 0.6, grit: 0.25, step: 2 }),
      ]);
      // owl: cream outline first, then the dark body on top
      const tufts = (grow) => [
        [[418 - grow, 436], [456, 404 - grow * 0.3], [412 - grow * 0.6, 348 - grow]],
        [[582 + grow, 436], [544, 404 - grow * 0.3], [588 + grow * 0.6, 348 - grow]],
      ];
      const owl = (grow) => [
        ellipse(500, 548, 92 + grow, 116 + grow),
        ellipse(500, 452, 98 + grow, 76 + grow),
        ...tufts(grow),
      ];
      fill(C.cream, owl(9).map((p) => rough(p, { amp: 1 })));
      fill(C.navy, owl(0).map((p) => rough(p, { amp: 1 })));
      // eyes, beak
      for (const x of [462, 538]) {
        fill(C.butter, [rough(circle(x, 455, 34, 2), { amp: 0.7 })]);
        fill(C.navy, [rough(circle(x + 2, 458, 15, 1.5), { amp: 0.4, grit: 0.2, step: 1.5 })]);
        fill(C.cream, [rough(circle(x - 6, 450, 5, 1), { amp: 0.2, grit: 0.15, step: 1 })]);
      }
      fill(C.butter, [rough([[488, 484], [512, 484], [500, 510]], { amp: 0.5, grit: 0.2, step: 1.5 })]);
      // chest feathers and wings
      const vee = (x, y) => [capsule(x - 11, y - 6, x, y + 4, 5), capsule(x, y + 4, x + 11, y - 6, 5)];
      fill(C.cream, [
        ...vee(480, 556),
        ...vee(520, 556),
        ...vee(500, 586),
        ...vee(470, 614),
        ...vee(530, 614),
      ].map((c) => rough(c, { amp: 0.3, grit: 0.15, step: 1.5 })), { opacity: 0.85 });
      fill(C.cream, [
        capsule(424, 512, 430, 566, 6),
        capsule(430, 566, 448, 618, 6),
        capsule(576, 512, 570, 566, 6),
        capsule(570, 566, 552, 618, 6),
      ].map((c) => rough(c, { amp: 0.3, grit: 0.2, step: 1.5 })));
      // feet on the branch
      fill(C.butter, [capsule(478, 648, 476, 668, 10), capsule(522, 648, 524, 668, 10)].map((c) => rough(c, { amp: 0.3, grit: 0.15, step: 1.5 })));
      // stars
      fill(C.cream, [rough(sparkle(332, 330, 24), { amp: 0.4, grit: 0.2, step: 1.5 }), rough(sparkle(680, 252, 16), { amp: 0.3, grit: 0.2, step: 1.2 })]);
      fill(C.cream, [
        [300, 420, 4.5],
        [706, 380, 4],
        [360, 250, 3.5],
        [700, 520, 3.5],
      ].map(([x, y, r]) => rough(circle(x, y, r, 1.5), { amp: 0.3, grit: 0.2, step: 1.5 })));
    },
  },
  {
    id: "ST-04",
    file: "st-04",
    name: "MOON HOST",
    seed: 404,
    // A small flag planted on a boulder: the one who hosted.
    draw({ fill, rough, rnd }) {
      // boulder
      fill(C.cream, [
        rough(
          [[318, 860], [330, 700], [362, 604], [424, 562], [520, 546], [604, 572], [664, 642], [684, 724], [694, 860]],
          { amp: 1.6 },
        ),
      ]);
      fill(C.navy, [
        capsule(398, 646, 440, 612, 6),
        capsule(560, 600, 602, 642, 6),
        capsule(468, 702, 522, 664, 6),
        capsule(620, 720, 646, 760, 5),
      ].map((c) => rough(c, { amp: 0.3, grit: 0.2, step: 1.5 })));
      fill(C.butter, [rough(blob(452, 742, 16, 11, rnd, 0.1), { amp: 0.5 }), rough(blob(596, 690, 13, 9, rnd, 0.1), { amp: 0.4 })]);
      // pole
      fill(C.cream, [rough(capsule(505, 560, 505, 256, 12), { amp: 0.6 })]);
      fill(C.butter, [rough(circle(505, 248, 13, 1.5), { amp: 0.4, grit: 0.2, step: 1.5 })]);
      // swallowtail pennant
      fill(C.butter, [
        rough(
          [
            [511, 266], [560, 258], [612, 272], [662, 286], [704, 280],
            [652, 326],
            [708, 374], [658, 378], [606, 366], [560, 378], [511, 382],
          ],
          { amp: 1.1 },
        ),
      ]);
      fill(C.navy, [rough(crescent(580, 322, 30, 594, 312, 26), { amp: 0.4, grit: 0.2, step: 1.5 })]);
      // stars
      fill(C.cream, [rough(sparkle(376, 336, 28), { amp: 0.5, grit: 0.2, step: 1.5 }), rough(sparkle(410, 252, 14), { amp: 0.3, grit: 0.2, step: 1.2 })]);
      fill(C.cream, [
        [706, 470, 5],
        [326, 486, 4],
        [300, 570, 3.5],
        [640, 450, 3],
      ].map(([x, y, r]) => rough(circle(x, y, r, 1.5), { amp: 0.3, grit: 0.2, step: 1.5 })));
    },
  },
  {
    id: "ST-05",
    file: "st-05",
    name: "SIX MOONS",
    seed: 505,
    // Half an orbit (half a year): six moon phases, then one bonus full moon. 6 + 1.
    draw({ fill, rough, fonts }) {
      const R = 224;
      fill(C.cream, dashedArc(CX, CY, R, 183, 357).map((c) => rough(c, { amp: 0.3, grit: 0.2, step: 1.5 })), { opacity: 0.45 });
      for (let i = 0; i < 7; i++) {
        const [x, y] = polar(R, 180 + (180 * (i + 0.5)) / 7);
        if (i < 6) phaseMoon(fill, rough, x, y, 33, (i + 1) / 7);
        else {
          bonusMoon(fill, rough, x, y, 38);
          fill(C.cream, [rough(sparkle(x + 30, y - 46, 15), { amp: 0.3, grit: 0.2, step: 1.2 })]);
        }
      }
      const [six, plus, one] = blockText(fonts.shoulders, "6+1", { width: 276, cx: 500, cy: 540, tracking: 14 });
      text(fill, rough, C.cream, [six]);
      text(fill, rough, C.butter, [plus, one]);
      text(fill, rough, C.cream, blockText(fonts.jost, "MONTHS", { width: 180, cx: 500, cy: 676, tracking: 10 }));
      fill(C.cream, [rough(sparkle(336, 700, 14), { amp: 0.3, grit: 0.2, step: 1.2 }), rough(sparkle(668, 704, 11), { amp: 0.3, grit: 0.2, step: 1.2 })]);
      fill(C.cream, [[392, 752, 3.5], [612, 760, 3], [300, 620, 3], [700, 612, 3.5]].map((d) => speck(rough, d)));
    },
  },
  {
    id: "ST-06",
    file: "st-06",
    name: "TWELVE MOONS",
    seed: 606,
    // A full orbit (a year and then some): twelve moon phases, then two bonus
    // full moons meeting at the top. 12 + 2. The pair of SIX MOONS.
    draw({ fill, rough, fonts }) {
      const R = 236;
      const n = 14;
      const step = 360 / n;
      const start = -90 - 12.5 * step; // puts the two bonus moons either side of the top
      fill(C.cream, dashedArc(CX, CY, R, 0, 360, { dash: 14, gap: 12 }).map((c) => rough(c, { amp: 0.3, grit: 0.2, step: 1.5 })), { opacity: 0.45 });
      for (let i = 0; i < n; i++) {
        const [x, y] = polar(R, start + i * step);
        if (i < 12) phaseMoon(fill, rough, x, y, 25, (i + 1) / 13);
        else bonusMoon(fill, rough, x, y, 28);
      }
      fill(C.cream, [rough(sparkle(500, 222, 13), { amp: 0.3, grit: 0.2, step: 1.2 })]);
      const [one, two, plus, bonus] = blockText(fonts.shoulders, "12+2", { width: 300, cx: 500, cy: 478, tracking: 12 });
      text(fill, rough, C.cream, [one, two]);
      text(fill, rough, C.butter, [plus, bonus]);
      text(fill, rough, C.cream, blockText(fonts.jost, "MONTHS", { width: 168, cx: 500, cy: 604, tracking: 10 }));
    },
  },
];

const fonts = { jost: await loadFont("Jost:wght@700"), shoulders: await loadFont("Big+Shoulders:wght@800") };
mkdirSync(OUT, { recursive: true });
for (const spec of STAMPS) {
  const svg = stampSvg(spec, fonts);
  writeFileSync(join(OUT, `${spec.file}.svg`), svg);
  console.log(`${spec.file}.svg  ${(svg.length / 1024).toFixed(1)} KB`);
}
