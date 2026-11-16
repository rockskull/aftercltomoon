/**
 * THE LITTLE CLUB — canvas drawing (512 × 320, scaled up with pixelated rendering).
 *
 * The room as the members described it, seen from the entrance:
 *   LEFT   workout corner (dumbbell rack, plyo boxes, jump rope, bands)
 *   RIGHT  the main bouldering wall, running from the front of the room to the back,
 *          plywood with holds and volumes, blue/grey mats along its base
 *   FRONT  a low table in front of the wall
 *   BACK   the lounge beyond the wall's far end (sofa, records, the "매달려야 산다" sign)
 * A simplified pixel reading — not a survey or a floor plan. Night mode borrows the
 * purple/blue/teal ceiling projections of the real night lighting.
 *
 * The holds on this wall are scenery. Real problems live in MOON PROBLEMS.
 */

import { MBTI_TYPES, type Mbti } from "@/lib/little-club";

export const W = 512;
export const H = 320;

type G = CanvasRenderingContext2D;
export type SceneId = "indoor" | "outdoor";
export type Pose = "stand" | "sit" | "climb" | "workout";

const C = {
  ink: "#0f1a28",
  cream: "#f3ebda",
  butter: "#f2d37d",
  orange: "#e8895a",
  wood: "#c8a97e",
  woodDark: "#9c7f5c",
  floor: "#a6845d",
  floorDark: "#8f7150",
  matBlue: "#3f6b9e",
  matGrey: "#7d8a96",
};

function px(g: G, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function poly(g: G, pts: Array<[number, number]>, c: string) {
  g.fillStyle = c;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
}

function oval(g: G, x: number, y: number, rx: number, ry: number, c: string) {
  g.fillStyle = c;
  g.beginPath();
  g.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function label(g: G, s: string, x: number, y: number, color: string, size = 8, align: CanvasTextAlign = "center", weight = "bold") {
  g.fillStyle = color;
  g.textAlign = align;
  g.font = `${weight} ${size}px ui-monospace, "IBM Plex Mono", monospace`;
  g.fillText(s, x, y);
  g.textAlign = "left";
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Korean text on the canvas: the system's Korean faces render crisply at every size. */
const KFONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Noto Sans CJK KR", sans-serif';

// ---------------------------------------------------------------------------
// Room geometry (one-point perspective, vanishing point above the back wall)
// ---------------------------------------------------------------------------

const BACK = { x0: 24, x1: 318, top: 22, bottom: 132 };
const VP: [number, number] = [156, 33];
/** The climbing wall: u = depth (0 back corner → 1 front edge of the screen), v = height (0 floor → 1 top). */
const WALL = { x0: 318, x1: 512, top0: 22, top1: 9, bot0: 132, bot1: 250 };

export function wallPoint(u: number, v: number): [number, number] {
  const top = lerp(WALL.top0, WALL.top1, u);
  const bot = lerp(WALL.bot0, WALL.bot1, u);
  return [lerp(WALL.x0, WALL.x1, u), bot - (bot - top) * v];
}

/** The inner edge of the mats (towards the room), at depth u. */
function matEdge(u: number): [number, number] {
  return [lerp(292, 392, u), lerp(134, 320, u)];
}

/** Where a rabbit may stand: the floor in front of the walls (mats included). */
export function clampToFloor(scene: SceneId, x: number, y: number): [number, number] {
  if (scene === "outdoor") return [Math.max(14, Math.min(498, x)), Math.max(206, Math.min(300, y))];
  const cy = Math.max(146, Math.min(304, y));
  const maxX = WALL.x0 + ((cy - WALL.bot0) / (WALL.bot1 - WALL.bot0)) * (WALL.x1 - WALL.x0) - 12;
  const minX = cy < 150 ? 170 : 10; // the back strip is the lounge; the left corner of it is the workout wall
  return [Math.max(minX, Math.min(maxX, x)), cy];
}

/** Things further back are drawn smaller. */
export function depthScale(scene: SceneId, y: number): number {
  return scene === "indoor" ? 0.62 + ((y - 140) / 170) * 0.45 : 0.85 + ((y - 206) / 100) * 0.2;
}

// ---------------------------------------------------------------------------
// Interaction spots
// ---------------------------------------------------------------------------

export type SpotId = "workout" | "calendar" | "wall" | "sofa" | "records" | "table" | "outside" | "fire" | "inside";

export interface Spot {
  id: SpotId;
  /** Where the rabbit walks to. */
  x: number;
  y: number;
  /** Click radius around the hot area. */
  hx: number;
  hy: number;
  r: number;
}

export const SPOTS: Record<SceneId, Spot[]> = {
  indoor: [
    { id: "workout", x: 92, y: 214, hx: 84, hy: 196, r: 62 },
    { id: "calendar", x: 80, y: 156, hx: 78, hy: 109, r: 24 },
    { id: "wall", x: 392, y: 226, hx: 430, hy: 150, r: 78 },
    { id: "sofa", x: 228, y: 150, hx: 228, hy: 126, r: 40 },
    { id: "records", x: 290, y: 150, hx: 295, hy: 118, r: 26 },
    { id: "table", x: 300, y: 262, hx: 312, hy: 276, r: 34 },
    { id: "outside", x: 220, y: 300, hx: 220, hy: 310, r: 30 },
  ],
  outdoor: [
    { id: "fire", x: 232, y: 250, hx: 270, hy: 222, r: 70 },
    { id: "inside", x: 40, y: 270, hx: 26, hy: 270, r: 48 },
  ],
};

export function spotAt(scene: SceneId, x: number, y: number): Spot | null {
  let best: Spot | null = null;
  let dist = Infinity;
  for (const s of SPOTS[scene]) {
    const d = Math.hypot(x - s.hx, y - s.hy);
    if (d < s.r && d < dist) {
      best = s;
      dist = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Indoor
// ---------------------------------------------------------------------------

/** Wall holds in the gym's colours (u, v, colour, size). Scenery only. */
const HOLDS: Array<[number, number, string, number]> = [
  [0.08, 0.2, "#d63a2f", 5], [0.12, 0.52, "#ef8a22", 4], [0.15, 0.78, "#f1c232", 4],
  [0.22, 0.35, "#2f9d5a", 5], [0.27, 0.62, "#2f6fd6", 4], [0.31, 0.14, "#7a4fc8", 5],
  [0.38, 0.45, "#ffffff", 4], [0.42, 0.72, "#d63a2f", 5], [0.47, 0.24, "#f1c232", 6],
  [0.53, 0.58, "#2f9d5a", 5], [0.6, 0.84, "#ef8a22", 5], [0.64, 0.36, "#2f6fd6", 6],
  [0.7, 0.16, "#7a4fc8", 6], [0.74, 0.66, "#d63a2f", 6], [0.81, 0.44, "#ffffff", 6],
  [0.86, 0.22, "#2f9d5a", 7], [0.9, 0.76, "#f1c232", 7], [0.95, 0.52, "#2f6fd6", 7],
];

/** Volumes on the wall: triangles in (u, v), lighter face + shaded side. */
const VOLUMES: Array<{ pts: Array<[number, number]>; face: string; side: string }> = [
  { pts: [[0.33, 0.52], [0.45, 0.6], [0.36, 0.78]], face: "#6c8aa3", side: "#4d677e" },
  { pts: [[0.58, 0.2], [0.74, 0.3], [0.6, 0.46]], face: "#9aa7b0", side: "#717e88" },
  { pts: [[0.8, 0.58], [0.96, 0.66], [0.84, 0.86]], face: "#c9a15b", side: "#9c7a3f" },
];

function hold(g: G, x: number, y: number, color: string, s: number) {
  px(g, x - s, y - s * 0.4, s * 2, s * 1.3, "#00000040");
  px(g, x - s * 0.9, y - s * 0.8, s * 1.8, s * 1.3, color);
  px(g, x - s * 0.4, y - s * 1.1, s * 1.1, s * 0.6, color);
  px(g, x - s * 0.3, y - s * 0.6, Math.max(1, s * 0.4), Math.max(1, s * 0.3), "#ffffff70");
}

/** The vintage lit sign over the lounge sofa. Its words never change; it is not the club logo. */
function drawSign(g: G, lit: boolean) {
  px(g, 182, 38, 112, 26, "#5b3d2a");
  px(g, 185, 41, 106, 20, lit ? "#ffe7b0" : "#f1dfb2");
  g.fillStyle = lit ? "#c2452c" : "#9b3b26";
  g.textAlign = "center";
  g.font = `bold 13px ${KFONT}`;
  g.fillText("매달려야 산다", 238, 56);
  g.textAlign = "left";
  for (const x of [186, 288]) px(g, x, 39, 2, 2, lit ? "#fff3c4" : "#e8c27a");
}

function drawCeiling(g: G) {
  poly(g, [[0, 0], [W, 0], [W, WALL.top1], [BACK.x1, BACK.top], [BACK.x0, BACK.top], [0, 20]], "#2c333c");
  // exposed pipes along the ceiling
  px(g, 0, 8, BACK.x1, 3, "#7b858e");
  px(g, 0, 11, BACK.x1, 1, "#4f575f");
  px(g, 0, 15, BACK.x1, 2, "#5f6870");
  g.strokeStyle = "#7b858e";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(BACK.x1, 9);
  g.lineTo(W, 1);
  g.stroke();
  // pendant lamps
  for (const x of [92, 206, 290]) {
    px(g, x, 0, 1, 14, "#1d2229");
    px(g, x - 5, 14, 11, 4, "#d9b36a");
    px(g, x - 3, 18, 7, 2, C.butter);
  }
}

/** The club calendar on the wall (this month, today marked). Clicking it opens the real club calendar. */
function drawWallCalendar(g: G, month: string, day: number) {
  px(g, 76, 91, 2, 3, "#5b5f66"); // nail
  px(g, 61, 96, 36, 29, "#00000026");
  px(g, 59, 94, 36, 29, "#fbf5e8");
  px(g, 59, 94, 36, 8, "#c9573f");
  label(g, month, 77, 101, "#fbf5e8", 6);
  const today = Math.max(0, Math.min(27, day - 1));
  for (let i = 0; i < 28; i++) {
    const x = 61 + (i % 7) * 4.7;
    const y = 104 + Math.floor(i / 7) * 4.6;
    px(g, x, y, 3, 3, i === today ? "#e8895a" : "#d6c9b1");
  }
}

function drawBackWall(g: G, cal: { month: string; day: number }) {
  px(g, BACK.x0, BACK.top, BACK.x1 - BACK.x0, BACK.bottom - BACK.top, "#d8d0c2");
  px(g, BACK.x0, BACK.bottom - 6, BACK.x1 - BACK.x0, 6, "#b9ad9a"); // skirting
  // left side wall (a sliver)
  poly(g, [[0, 20], [BACK.x0, BACK.top], [BACK.x0, BACK.bottom], [0, 150]], "#c4bbab");

  // workout corner: a rail of bands and a jump rope on hooks
  px(g, 36, 50, 120, 3, "#5b5f66");
  const bands = ["#d63a2f", "#2f9d5a", "#2f6fd6", "#24282d"];
  bands.forEach((c, i) => {
    const x = 46 + i * 22;
    px(g, x, 53, 2, 36, c);
    px(g, x + 8, 53, 2, 36, c);
    px(g, x, 88, 10, 2, c);
  });
  px(g, 138, 53, 2, 4, "#5b5f66");
  px(g, 134, 57, 3, 8, "#e8895a");
  px(g, 142, 57, 3, 8, "#e8895a");
  g.strokeStyle = "#3a3f46";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(135.5, 65);
  g.quadraticCurveTo(139, 104, 143.5, 65);
  g.stroke();
  label(g, "WORKOUT", 96, 40, "#6b6255", 7);
  drawWallCalendar(g, cal.month, cal.day);

  drawSign(g, false);

  // floor lamp, sofa, record cabinet
  px(g, 176, 74, 1, 60, "#6e5a44");
  poly(g, [[170, 74], [184, 74], [181, 64], [173, 64]], "#e2c37f");
  px(g, 172, 133, 9, 2, "#4a3a2c");

  px(g, 188, 104, 82, 18, "#5f7b7a"); // backrest
  px(g, 186, 118, 86, 14, "#7c9693"); // seat
  px(g, 184, 112, 7, 22, "#55706f");
  px(g, 267, 112, 7, 22, "#55706f");
  px(g, 198, 108, 16, 10, "#c9a15b"); // cushions
  px(g, 244, 108, 16, 10, "#d6d1c4");
  px(g, 190, 132, 4, 3, "#3b3027");
  px(g, 264, 132, 4, 3, "#3b3027");

  px(g, 278, 104, 36, 30, "#6b4a35");
  px(g, 280, 106, 32, 3, "#82593f");
  px(g, 281, 112, 9, 20, "#d6a35a"); // records in the shelf
  px(g, 291, 112, 9, 20, "#4f7f9b");
  px(g, 301, 112, 9, 20, "#b8564a");
  px(g, 282, 98, 30, 7, "#2b2f36"); // turntable
  oval(g, 293, 101, 7, 2.5, "#151a20");
  px(g, 292, 100, 2, 2, C.orange);
  px(g, 304, 97, 1, 5, "#c9ccd1");
  label(g, "LOUNGE", 228, 98, "#6b6255", 7);
}

function drawFloor(g: G) {
  const floor: Array<[number, number]> = [[BACK.x0, BACK.bottom], [BACK.x1, BACK.bottom], [W, WALL.bot1], [W, H], [0, H], [0, 150]];
  poly(g, floor, C.floor);
  g.save();
  g.beginPath();
  floor.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.clip();
  g.strokeStyle = C.floorDark;
  g.lineWidth = 1;
  for (let xb = -260; xb < 760; xb += 46) {
    const k = (BACK.bottom - VP[1]) / (H - VP[1]);
    g.beginPath();
    g.moveTo(VP[0] + (xb - VP[0]) * k, BACK.bottom);
    g.lineTo(xb, H);
    g.stroke();
  }
  for (let i = 1; i < 9; i++) {
    const y = BACK.bottom + (H - BACK.bottom) * (i / 9) ** 1.35;
    px(g, 0, y, W, 1, "#97785499");
  }
  g.restore();

  // workout floor: rubber tiles, dumbbell rack, plyo boxes
  poly(g, [[18, 156], [156, 156], [168, 238], [0, 238], [0, 166]], "#30353a");
  px(g, 30, 168, 76, 4, "#4a5058");
  px(g, 30, 184, 76, 4, "#4a5058");
  px(g, 32, 172, 3, 22, "#4a5058");
  px(g, 101, 172, 3, 22, "#4a5058");
  const db = ["#c94f3d", "#3f6fb0", "#e0b440", "#2f9d5a"];
  db.forEach((c, i) => {
    const x = 39 + i * 16;
    px(g, x, 163, 4, 6, c);
    px(g, x + 4, 165, 5, 2, "#9aa1a8");
    px(g, x + 9, 163, 4, 6, c);
    px(g, x, 179, 4, 6, db[(i + 2) % 4]);
    px(g, x + 4, 181, 5, 2, "#9aa1a8");
    px(g, x + 9, 179, 4, 6, db[(i + 2) % 4]);
  });
  // plyo boxes
  poly(g, [[112, 198], [150, 198], [158, 192], [120, 192]], "#ddb47c");
  px(g, 112, 198, 38, 30, "#c49a63");
  poly(g, [[150, 198], [158, 192], [158, 222], [150, 228]], "#a47e4e");
  px(g, 124, 208, 14, 3, "#8e6a40");
  poly(g, [[60, 214], [88, 214], [94, 210], [66, 210]], "#ddb47c");
  px(g, 60, 214, 28, 18, "#c49a63");
  poly(g, [[88, 214], [94, 210], [94, 228], [88, 232]], "#a47e4e");

  // lounge rug in front of the sofa
  poly(g, [[180, 138], [282, 138], [294, 160], [168, 160]], "#b98a5e");
  for (let i = 0; i < 6; i++) px(g, 184 + i * 18, 142, 8, 16, "#c79a6d");

  // the way out (towards the viewer)
  px(g, 196, 304, 48, 14, "#5d4636");
  px(g, 198, 306, 44, 10, "#7a5c45");
  label(g, "OUT ▼", 220, 314, C.butter, 7);
}

function drawClimbingWall(g: G) {
  const corners: Array<[number, number]> = [wallPoint(0, 0), wallPoint(1, 0), wallPoint(1, 1), wallPoint(0, 1)];
  poly(g, corners, C.wood);
  // top trim
  poly(g, [wallPoint(0, 1), wallPoint(1, 1), wallPoint(1, 0.965), wallPoint(0, 0.965)], "#e6c895");
  g.strokeStyle = C.woodDark;
  g.lineWidth = 1;
  for (const u of [0.18, 0.37, 0.57, 0.78]) {
    const [x1, y1] = wallPoint(u, 0);
    const [x2, y2] = wallPoint(u, 1);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }
  for (const v of [0.34, 0.67]) {
    const [x1, y1] = wallPoint(0, v);
    const [x2, y2] = wallPoint(1, v);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }
  for (let u = 0.05; u < 0.97; u += 0.09) {
    for (let v = 0.08; v < 0.95; v += 0.11) {
      const [x, y] = wallPoint(u, v);
      px(g, x, y, 1, 1, "#8d714f");
    }
  }
  for (const vol of VOLUMES) {
    const pts = vol.pts.map(([u, v]) => wallPoint(u, v));
    poly(g, pts, vol.face);
    const [a, b, c] = pts;
    poly(g, [b, c, [c[0] + 3, c[1] + 2], [b[0] + 3, b[1] + 1]], vol.side);
    void a;
  }
  for (const [u, v, color, s] of HOLDS) {
    const [x, y] = wallPoint(u, v);
    hold(g, x, y, color, s * (0.55 + 0.6 * u));
  }
  // wall base shadow and the mats
  const segs = [0, 0.22, 0.44, 0.66, 1];
  for (let i = 0; i < segs.length - 1; i++) {
    const [u0, u1] = [segs[i], segs[i + 1]];
    poly(g, [wallPoint(u0, 0), wallPoint(u1, 0), matEdge(u1), matEdge(u0)], i % 2 ? C.matGrey : C.matBlue);
  }
  g.strokeStyle = "#2c4766";
  g.beginPath();
  g.moveTo(...matEdge(0));
  g.lineTo(...matEdge(1));
  g.stroke();
  label(g, "BOULDERING", 440, 34, "#5d4a35", 7);
}

/** The low table in front of the wall (drawn in depth order with the characters). */
export function drawTable(g: G) {
  oval(g, 314, 286, 36, 5, "#00000033");
  poly(g, [[282, 270], [346, 270], [352, 278], [276, 278]], "#c9a87a");
  px(g, 276, 278, 76, 4, "#9c7f5c");
  px(g, 282, 282, 4, 6, "#7a6248");
  px(g, 342, 282, 4, 6, "#7a6248");
  px(g, 300, 266, 6, 5, "#f3ebda"); // mugs
  px(g, 306, 268, 2, 2, "#f3ebda");
  px(g, 322, 267, 10, 3, "#e8895a"); // a book
}

export const TABLE_DEPTH = 278;

export function drawIndoor(g: G, cal: { month: string; day: number }) {
  px(g, 0, 0, W, H, "#1a2230");
  drawCeiling(g);
  drawBackWall(g, cal);
  drawFloor(g);
  drawClimbingWall(g);
}

// ---------------------------------------------------------------------------
// Outdoor: an imagined little campfire (not part of the real building)
// ---------------------------------------------------------------------------

function pine(g: G, x: number, y: number, s = 1) {
  px(g, x - 3 * s, y + 12 * s, 6 * s, 22 * s, "#493c36");
  for (let i = 0; i < 4; i++) {
    const k = i * 8 * s;
    px(g, x - (18 - i * 2) * s, y - (35 - i * 5) * s + k, (36 - i * 4) * s, 10 * s, i % 2 ? "#28505a" : "#315b62");
  }
}

export function drawOutdoor(g: G, t: number) {
  px(g, 0, 0, W, H, "#152739");
  oval(g, 424, 57, 25, 25, C.butter);
  oval(g, 435, 51, 21, 21, "#152739");
  const stars: Array<[number, number]> = [[50, 67], [110, 35], [173, 75], [217, 39], [313, 78], [358, 29], [468, 113], [25, 110], [146, 105], [255, 91], [381, 103], [487, 48]];
  stars.forEach(([x, y], i) => px(g, x, y, i % 3 ? 2 : 3, i % 2 ? 2 : 3, i % 3 ? "#a0b4b7" : C.butter));
  poly(g, [[0, 160], [0, 127], [68, 75], [136, 143], [196, 97], [279, 162], [356, 101], [428, 158], [512, 111], [512, 196]], "#1a3242");
  poly(g, [[0, 211], [0, 176], [73, 136], [142, 188], [232, 144], [307, 202], [420, 139], [512, 186], [512, 258]], "#254351");
  px(g, 0, 206, W, 114, "#344e49");
  for (let i = 0; i < 36; i++) px(g, (i * 87 + 39) % 512, 216 + ((i * 39) % 98), 8, 2, i % 2 ? "#3e6255" : "#527060");
  pine(g, 85, 152, 1.6);
  pine(g, 486, 158, 1.35);
  pine(g, 170, 196, 0.75);
  // tent
  poly(g, [[352, 236], [408, 156], [468, 237]], "#c89a6c");
  poly(g, [[408, 156], [422, 238], [353, 236]], "#d2b17f");
  poly(g, [[412, 196], [436, 237], [390, 237]], "#3c5351");
  // fire ring, logs and the fire
  oval(g, 270, 229, 73, 40, "#8d6c4766");
  for (let i = 0; i < 8; i++) {
    const a = i * 0.785;
    oval(g, 270 + 30 * Math.cos(a), 229 + 18 * Math.sin(a), 8, 4, "#7a7770");
  }
  px(g, 252, 228, 38, 5, "#513f31");
  px(g, 258, 223, 28, 6, "#9f6946");
  const f1 = Math.sin(t * 0.011);
  const f2 = Math.sin(t * 0.018 + 3);
  px(g, 262 + f1 * 2, 206, 18, 22, "#df743d");
  px(g, 265 + f2 * 2, 197, 12, 27, "#ffaf49");
  px(g, 268 + f1 * 2, 204, 7, 18, "#f9d985");
  for (let i = 0; i < 5; i++) {
    px(g, 254 + i * 7 + Math.sin(t * 0.006 + i) * 3, 190 + (i % 3) * 4 - Math.abs(Math.sin(t * 0.008 + i)) * 14, 2, 2, i % 2 ? C.butter : C.orange);
  }
  // log benches
  px(g, 186, 262, 56, 7, "#937551");
  px(g, 300, 262, 56, 7, "#937551");
  // the way back in
  px(g, 0, 222, 46, 98, "#6c5947");
  px(g, 8, 232, 30, 80, "#8d7660");
  px(g, 15, 246, 15, 52, "#3a4450");
  px(g, 25, 270, 3, 3, C.butter);
  label(g, "INSIDE", 23, 216, C.butter, 8);
  label(g, "NIGHT CAMP", 256, 44, C.cream, 11);
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

/** Night mode indoors: dim the room, then the purple / blue / teal ceiling projections and the warm sign. */
export function drawNight(g: G, t: number, reduced: boolean) {
  g.save();
  g.globalCompositeOperation = "multiply";
  px(g, 0, 0, W, H, "#4f5590");
  g.globalCompositeOperation = "source-over";
  drawSign(g, true); // the sign is lit, it doesn't dim with the room
  g.globalCompositeOperation = "lighter";
  const drift = reduced ? 0 : Math.sin(t * 0.004) * 10;
  const glow = (x: number, y: number, r: number, color: string) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  glow(120 + drift, 26, 130, "rgba(122,79,200,0.75)"); // purple
  glow(300 - drift, 18, 120, "rgba(47,111,214,0.7)"); // blue
  glow(440, 70 + drift, 140, "rgba(43,179,168,0.6)"); // teal on the climbing wall
  glow(238, 51, 64, "rgba(242,180,90,0.35)"); // the sign's halo
  glow(177, 72, 30, "rgba(242,211,125,0.45)"); // floor lamp
  g.restore();
}

export function drawDay(g: G) {
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const x of [92, 206, 290]) {
    const grad = g.createRadialGradient(x, 26, 0, x, 26, 70);
    grad.addColorStop(0, "rgba(242,211,125,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - 70, 0, 140, 110);
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Moon rabbits: 16 MBTI rabbits, all the same kind of rabbit, each with its own
// idle action and prop (never just a colour change). Playful, not a personality test.
// ---------------------------------------------------------------------------

export function drawRabbit(
  g: G,
  x: number,
  y: number,
  type: Mbti,
  t: number,
  scale: number,
  opts: { walking?: boolean; player?: boolean; pose?: Pose } = {},
) {
  const sn = Math.sin;
  const cs = Math.cos;
  const ph = t * 0.054;
  const pose = opts.pose ?? "stand";
  const walking = Boolean(opts.walking);
  const hop = pose === "workout" ? Math.abs(sn(ph * 2.4)) * 5 : type === "ENFP" && !walking ? Math.abs(sn(ph * 1.2)) * 3 : 0;
  const sway = type === "ESFP" ? sn(ph * 1.3) * 2.5 : type === "ESFJ" ? sn(ph * 0.6) * 1.5 : 0;
  const bob = (walking ? Math.abs(sn(ph * 1.4)) * 2 : 0) + hop;
  g.save();
  g.translate(Math.round(x + (walking ? 0 : sway)), Math.round(y - bob));
  g.scale(scale, scale);
  const P = (a: number, b: number, w: number, h: number, c: string) => px(g, a, b, w, h, c);
  const fur = opts.player ? "#f6f1e6" : "#ded8cd";
  const shade = opts.player ? "#cbc1b2" : "#bcb3a8";
  const inner = "#c28d8f";
  const eye = "#2b343c";
  oval(g, 0, 17 + bob / scale, 11, 3, "#0f1a2855");
  const sitting = pose === "sit";
  if (!sitting) {
    const stride = walking ? sn(ph * 1.6) * 2 : 0;
    P(-7, 12, 6, 5 + Math.max(0, stride), shade);
    P(1, 12, 6, 5 + Math.max(0, -stride), shade);
  } else {
    P(-10, 13, 8, 4, shade);
    P(2, 13, 8, 4, shade);
  }
  oval(g, -10, 6, 4, 4, fur);
  const squeeze = type === "INFP" ? sn(ph * 0.7) * 0.8 : 0;
  oval(g, 0, 3 + (sitting ? 2 : 0), 11 + squeeze, 13 - squeeze, fur);
  oval(g, 1, 5 + (sitting ? 2 : 0), 7, 9, "#f4e9dc");
  const lively = type === "ENFP" || type === "ESFP" || type === "ENFJ";
  const earWave = sn(ph * 0.5) * (lively ? 3 : 1.5);
  const look = type === "INFJ" ? -2 : 0; // looking up at the moon
  g.save();
  g.translate(-5, -14 + look);
  g.rotate(((earWave - 1 + (type === "INFJ" ? -6 : 0)) * Math.PI) / 180);
  P(-3, -14, 6, 16, fur);
  P(-1, -12, 3, 11, inner);
  g.restore();
  g.save();
  g.translate(5, -14 + look);
  g.rotate(((-earWave + 1 + (type === "INFJ" ? -6 : 0)) * Math.PI) / 180);
  P(-3, -16, 6, 18, fur);
  P(-1, -14, 3, 12, inner);
  g.restore();
  const headBob = type === "ISFP" ? sn(ph) * 1.5 : type === "INTP" ? sn(ph * 0.4) : type === "INTJ" ? sn(ph * 0.25) * 0.8 : 0;
  const hy = -10 + headBob + look;
  oval(g, 0, hy, 11, 10, fur);
  P(-10, hy - 3, 20, 6, fur);
  const blink = Math.floor(t / 155) % 5 === 0 && t % 155 < 5;
  if (blink || pose === "sit") {
    P(-5, hy, 3, 1, eye);
    P(4, hy, 3, 1, eye);
  } else {
    P(-5, hy - 2, 2, 3, eye);
    P(4, hy - 2, 2, 3, eye);
  }
  P(0, hy + 3, 2, 2, inner);
  P(-7, hy + 4, 3, 2, "#ddb5aa");
  P(7, hy + 4, 3, 2, "#ddb5aa");

  // arms: each type has its own gesture
  let L = 0;
  let R = 0;
  const slow = sn(ph * 0.5);
  switch (type) {
    case "ENFJ":
    case "ESFP":
      L = -5 - Math.abs(sn(ph)) * 6;
      R = -4 - Math.abs(cs(ph)) * 7;
      break;
    case "ENFP":
      L = -4 - Math.abs(sn(ph * 1.2)) * 6;
      break;
    case "ENTJ":
      R = -8 - Math.abs(sn(ph * 0.7)) * 2;
      break;
    case "ESTJ":
      R = -3 + (Math.floor(t / 40) % 2) * -2;
      break;
    case "ENTP":
      L = -5 - sn(ph) * 5;
      R = -7 - cs(ph) * 5;
      break;
    case "INFJ":
      R = -6 + sn(ph * 0.35) * 3;
      break;
    case "ISFP":
      L = sn(ph * 0.6) * 2;
      R = -sn(ph * 0.5) * 2;
      break;
    case "ISTP":
      R = sn(ph * 3.2) * 3;
      break;
    case "INTP":
      R = -4 + sn(ph * 0.8) * 1.5;
      break;
    case "ISTJ":
      L = R = -2 + slow * 3;
      break;
    case "ESTP":
      R = -Math.abs(sn(ph * 1.1)) * 9;
      break;
    case "ISFJ":
      R = -2 - Math.max(0, sn(ph * 0.4)) * 6;
      break;
    case "INTJ":
      L = -2;
      R = -2;
      break;
    case "INFP":
      L = R = 1;
      break;
    case "ESFJ":
      L = R = -3;
      break;
  }
  if (pose === "climb") {
    L = -14 + sn(ph * 2) * 3;
    R = -14 - sn(ph * 2) * 3;
  }
  if (pose === "workout") {
    L = -3;
    R = -3;
  }
  P(-13, -1 + L, 6, 7, fur);
  P(8, -1 + R, 6, 7, fur);

  if (pose === "workout") {
    // jump rope swinging around
    const a = ph * 2.4;
    g.strokeStyle = "#e8895a";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-12, 3 + L);
    g.quadraticCurveTo(0, cs(a) > 0 ? 24 : -40, 12, 3 + R);
    g.stroke();
  } else if (pose !== "climb") {
    switch (type) {
      case "INTJ": // a route notebook, pages turning
        P(-8, 0, 16, 10, "#4d6374");
        P(-7, 1, 6, 8, "#e9e2cf");
        P(1, 1, 6, 8, "#e9e2cf");
        if (Math.floor(t / 70) % 3 === 0) P(-1, 1, 3, 8, "#cfc6b0");
        P(-6, 3, 4, 1, "#7d8aa0");
        P(2, 5, 4, 1, "#7d8aa0");
        break;
      case "INTP": // magnifier over a hold
        P(9, 1 + R, 7, 7, "#7e907b");
        P(11, 3 + R, 3, 3, "#d7e3e8");
        P(15, 7 + R, 3, 2, "#6a5a48");
        if (Math.floor(t / 90) % 2) label(g, "?", 15, -22, "#f2d37d", 8);
        break;
      case "ENTJ": // pointing the way with a little flag
        P(13, -9 + R, 12, 2, "#e1c07b");
        P(22, -13 + R, 3, 7, "#b99464");
        break;
      case "ENTP": // talking it over
        P(-19, -24, 12, 8, "#f3ebda");
        P(-16, -21, 2, 2, eye);
        P(-13, -21, 2, 2, eye);
        P(-10, -21, 2, 2, Math.floor(t / 20) % 2 ? eye : "#f3ebda");
        break;
      case "INFJ": // stars over the moon-gazer
        P(12, -26 + sn(ph) * 2, 2, 2, "#f1d475");
        P(17, -31, 2, 2, Math.floor(t / 30) % 2 ? "#f1d475" : "#a0b4b7");
        P(7, -33, 1, 1, "#f1d475");
        break;
      case "INFP": { // hugging a cushion, a small heart drifting up
        P(-7 - squeeze, 0, 15 + squeeze * 2, 11, "#7c8da3");
        P(-3, 2, 7, 3, "#b6bfca");
        const h = (t % 160) / 160;
        if (h < 0.6) {
          const yy = -20 - h * 18;
          P(8, yy, 2, 2, "#e07a8a");
          P(11, yy, 2, 2, "#e07a8a");
          P(9, yy + 2, 3, 2, "#e07a8a");
        }
        break;
      }
      case "ENFJ": // pom-poms
        P(-16, -14 + L, 5, 5, "#f1d475");
        P(12, -13 + R, 5, 5, "#f1d475");
        break;
      case "ENFP": // waving, a sparkle
        P(-17, -12 + L, 3, 3, "#eed386");
        break;
      case "ISTJ": // lifting and stacking a gear box
        P(-9, 4 + L, 18, 9, "#5c6c71");
        P(-5, 7 + L, 10, 2, "#d1b375");
        break;
      case "ISFJ": { // tea, raised now and then, steam rising
        P(9, 2 + R, 8, 7, "#dcbb84");
        P(16, 4 + R, 3, 3, "#dcbb84");
        const s = (t % 60) / 60;
        P(11 + sn(ph) * 1, -2 + R - s * 6, 1, 3, "#e4dccc");
        break;
      }
      case "ESTJ": // clipboard, ticking things off
        P(10, -2, 11, 13, "#9d805c");
        P(12, 0, 7, 9, "#eee4d0");
        for (let i = 0; i < 3; i++) P(13, 2 + i * 3, 1, 1, i <= Math.floor(t / 40) % 4 - 1 ? "#2f9d5a" : "#b9ad9a");
        break;
      case "ESFJ": // a tray of snacks
        P(-12, 1 + sn(ph * 1.2), 25, 3, "#b48d5f");
        P(-7, -3 + sn(ph * 1.2), 5, 4, "#e3ba79");
        P(2, -3 + sn(ph * 1.2), 5, 4, "#e07a5a");
        break;
      case "ISTP": // brushing chalk off a hold
        P(10, 1 + R, 9, 3, "#8c9597");
        P(17, -1 + R, 3, 6, "#f1e3ce");
        if (Math.floor(t / 6) % 3 === 0) P(21, -2 + R, 1, 1, "#f3ebda");
        break;
      case "ISFP": // headphones, humming
        P(-12, -15 + headBob, 4, 9, "#c6ad70");
        P(8, -15 + headBob, 4, 9, "#c6ad70");
        P(-9, -19 + headBob, 18, 3, "#647b89");
        if (Math.floor(t / 50) % 2) label(g, "♪", 16, -22, "#a4ceae", 8);
        break;
      case "ESTP": // dumbbell curls
        P(9, -3 + R, 8, 3, "#9aa1a8");
        P(7, -5 + R, 3, 7, "#c94f3d");
        P(16, -5 + R, 3, 7, "#c94f3d");
        break;
      case "ESFP": // dancing with maracas
        P(-17, -18 + L, 5, 5, "#e5af83");
        P(12, -19 + R, 5, 5, "#e5af83");
        break;
    }
  }
  if (opts.player) P(-2, -38 + look, 5, 3, C.butter);
  g.restore();
}

/** One preview tile of a rabbit (the picker). */
export function drawRabbitTile(g: G, type: Mbti, t: number) {
  const w = g.canvas.width;
  const h = g.canvas.height;
  px(g, 0, 0, w, h, "#e7dcc6");
  px(g, 0, h - 14, w, 14, "#cdbf9f");
  drawRabbit(g, w / 2, h - 28, type, t, 1.25, {});
}

export const ALL_TYPES = MBTI_TYPES;

// ---------------------------------------------------------------------------
// The two club dogs (from the members' description; photo check still pending):
//  A — sable & white, long fluffy coat (sheltie-like), mostly lying about
//  B — black & white, short coat, pricked pointy ears, stretches now and then
// No names, no MBTI.
// ---------------------------------------------------------------------------

export function drawDogA(g: G, x: number, y: number, t: number, scale: number, pose: "lie" | "sit", reduced: boolean) {
  const P = (a: number, b: number, w: number, h: number, c: string) => px(g, a, b, w, h, c);
  const sable = "#b8742f";
  const sableDark = "#8e5622";
  const white = "#f3ede0";
  const cycle = reduced ? 0 : t % 600;
  const lookUp = cycle > 380 && cycle < 470; // lifts and turns the head now and then
  const wag = reduced ? 0 : cycle > 470 && cycle < 560 ? Math.sin(t * 0.4) * 2 : 0;
  const breath = reduced ? 0 : Math.sin(t * 0.05) > 0.6 ? 1 : 0;
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.scale(scale, scale);
  oval(g, 0, 3, 18, 3, "#0f1a2840");
  if (pose === "lie") {
    P(-12, -7 - breath, 24, 9 + breath, sable); // body, low and long
    P(-6, -9 - breath, 14, 3, "#c98a45"); // fluffy back
    P(-16, -9, 8, 10, white); // ruff and chest
    P(-22, -3, 9, 3, white); // front paws stretched out
    P(10, -1, 5, 3, white);
    P(12, -4 + wag, 9, 4, sable); // fluffy tail
    P(19, -4 + wag, 4, 4, white);
    const hy = lookUp ? -19 : -16;
    P(-21, hy, 10, 8, sable);
    P(-19, hy + 1, 2, 7, white); // blaze
    P(-26, hy + 4, 6, 4, "#c98a45"); // long snout
    P(-27, hy + 4, 2, 2, "#1a1a1a");
    P(-20, hy - 3, 3, 4, sableDark);
    P(-15, hy - 3, 3, 4, sableDark);
    P(-20, hy - 4, 2, 2, sableDark);
    P(-23, hy + 2, 1, 1, "#1a1a1a");
  } else {
    P(-6, -14, 13, 16, sable);
    P(-7, -16, 9, 12, white); // ruff
    P(-6, 0, 4, 3, white);
    P(3, 0, 4, 3, white);
    P(6, -2 + wag, 9, 4, sable);
    P(13, -2 + wag, 3, 4, white);
    const hy = lookUp ? -26 : -24;
    P(-9, hy, 11, 9, sable);
    P(-6, hy + 1, 2, 8, white);
    P(-14, hy + 4, 6, 4, "#c98a45");
    P(-15, hy + 4, 2, 2, "#1a1a1a");
    P(-8, hy - 4, 3, 5, sableDark);
    P(-2, hy - 4, 3, 5, sableDark);
    P(-11, hy + 2, 1, 1, "#1a1a1a");
  }
  g.restore();
}

export function drawDogB(g: G, x: number, y: number, t: number, scale: number, reduced: boolean) {
  const P = (a: number, b: number, w: number, h: number, c: string) => px(g, a, b, w, h, c);
  const black = "#1f2329";
  const white = "#f1efe9";
  const cycle = reduced ? 0 : t % 520;
  const stretching = cycle > 420 && cycle < 500; // a long play-bow stretch, like the photo
  const wag = reduced ? 0 : Math.sin(t * (stretching ? 0.1 : 0.35)) * 3;
  const tilt = !reduced && cycle > 200 && cycle < 260 ? 1 : 0; // a head tilt
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.scale(scale, scale);
  oval(g, 0, 2, 16, 3, "#0f1a2840");
  if (stretching) {
    // chest down, front legs reaching forward, rear up
    P(6, -3, 12, 3, white); // front legs flat
    P(-12, -8, 3, 9, black); // rear legs up
    P(-6, -8, 3, 9, black);
    P(-12, -1, 3, 2, white);
    P(-6, -1, 3, 2, white);
    g.save();
    g.translate(-10, -12);
    g.rotate(0.32);
    P(0, 0, 24, 8, black);
    P(17, 2, 6, 6, white);
    g.restore();
    P(16, -9, 9, 7, black);
    P(20, -9, 2, 7, white);
    P(23, -6, 5, 4, white);
    P(27, -6, 2, 2, "#111");
    P(17, -14, 3, 5, black);
    P(21, -14, 3, 5, black);
    P(-15, -19 + wag, 3, 7, black);
  } else {
    P(-10, -6, 3, 8, black);
    P(-5, -6, 3, 8, black);
    P(5, -6, 3, 8, black);
    P(10, -6, 3, 8, black);
    for (const lx of [-10, -5, 5, 10]) P(lx, 0, 3, 2, white); // white socks
    P(-12, -14, 25, 9, black);
    P(8, -13, 5, 8, white); // chest
    const hy = -22 - tilt;
    P(10, hy, 9, 8, black);
    P(14, hy, 2, 8, white); // blaze
    P(17, hy + 4, 5, 4, white); // muzzle
    P(21, hy + 4, 2, 2, "#111");
    P(11, hy - 5, 3, 5, black); // pricked, pointy ears
    P(16, hy - 5 - tilt, 3, 5, black);
    P(12, hy - 6, 1, 1, black);
    P(17, hy - 6 - tilt, 1, 1, black);
    P(15, hy + 2, 1, 1, "#e9e3d5");
    g.save();
    g.translate(-12, -13);
    g.rotate(-0.6 + wag * 0.08);
    P(-2, -8, 3, 9, black);
    P(-2, -9, 3, 2, white);
    g.restore();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Tags and bubbles (drawn last, never dimmed by the night overlay)
// ---------------------------------------------------------------------------

export function drawNameTag(g: G, x: number, y: number, text: string) {
  g.font = `bold 9px ${KFONT}`;
  const w = Math.ceil(g.measureText(text).width) + 10;
  const left = Math.max(2, Math.min(W - w - 2, x - w / 2));
  px(g, left, y - 10, w, 13, "#0f1a28dd");
  px(g, left, y + 3, w, 1, C.butter);
  g.fillStyle = C.butter;
  g.textAlign = "center";
  g.fillText(text, left + w / 2, y);
  g.textAlign = "left";
}

export function drawBubble(g: G, x: number, y: number, text: string) {
  g.font = `bold 11px ${KFONT}`;
  const w = Math.min(250, Math.max(60, Math.ceil(g.measureText(text).width) + 16));
  const left = Math.max(4, Math.min(W - w - 4, x - w / 2));
  const top = Math.max(2, y - 26);
  px(g, left, top, w, 21, "#2b3a4f");
  px(g, left + 1, top + 1, w - 2, 19, "#f7eddb");
  px(g, Math.max(left + 4, Math.min(left + w - 10, x - 3)), top + 20, 7, 4, "#f7eddb");
  g.fillStyle = "#243449";
  g.textAlign = "center";
  g.fillText(text, left + w / 2, top + 15, w - 8);
  g.textAlign = "left";
}
