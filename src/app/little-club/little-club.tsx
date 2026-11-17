"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ClubCalendar } from "@/components/calendar/club-calendar";
import { BANNER_COPY } from "@/components/member-banner-client";
import { buttonPrimary, cn } from "@/components/ui";
import { toDateKey } from "@/lib/dates";
import { BUBBLE_MAX, cleanBubble, cleanNickname, MBTI_MOTIONS, MBTI_TYPES, nameTag, NICKNAME_MAX, SYNC_BACKOFF_MS, type ClubMember, type ClubSyncResponse, type Mbti } from "@/lib/little-club";
import { gradeInfo, gradeLabel } from "@/lib/problems";
import type { ClubProfile } from "@/server/domain/little-club";
import type { ClubNotice, ClubNotices, LittleClubData, StatusResult } from "@/server/little-club";
import { markAllRead } from "../me/actions";
import { RadioStation } from "../radio/radio-station";
import { refreshClubNotices, saveClubProfile } from "./actions";
import { BGM_TITLES, ClubBgm, type BgmTrack } from "./bgm";
import {
  clampToFloor,
  depthScale,
  drawBubble,
  drawDay,
  drawDogA,
  drawDogB,
  drawIndoor,
  drawNameTag,
  drawNight,
  drawOutdoor,
  drawRabbit,
  drawRabbitTile,
  drawTable,
  bubbleSize,
  tagSize,
  type TagState,
  H,
  SPOTS,
  spotAt,
  TABLE_DEPTH,
  W,
  wallPoint,
  type Pose,
  type SceneId,
  type SpotId,
} from "./scene";

/**
 * THE LITTLE CLUB — the game screen. The server already decided this person may be here; nothing in
 * the browser grants access. Rabbits with a name tag are the other people in the club (everyone with
 * a rabbit is shown; their status line and ON/OFF come from the one 30-second sync); where they stand and how they move is
 * decided here in the browser only. Untagged rabbits and the two dogs are scenery.
 */

type ModalId = "profile" | "problems" | "stamps" | "calendar" | "notices" | null;

const START: Record<SceneId, [number, number]> = { indoor: [220, 290], outdoor: [62, 272] };

const hash = (seed: string) => {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0;
  return h;
};

/** Where I appear in a scene: near the door, nudged by my nickname. */
function spawnAt(scene: SceneId, seed: string): [number, number] {
  const h = hash(seed);
  const [x, y] = START[scene];
  return clampToFloor(scene, x + (scene === "indoor" ? (h % 81) - 40 : h % 70), y + ((h >> 8) % 21) - 10);
}

/**
 * Where the others stand (chosen in this browser, never sent by the server): spread over the
 * floor, away from the hot spots and the door. Each person keeps their spot while the page is open.
 */
const MEMBER_SLOTS: Record<SceneId, Array<[number, number]>> = {
  indoor: [
    [190, 172], [300, 178], [236, 222], [338, 212], [128, 252], [408, 262], [160, 200],
    [286, 236], [86, 288], [470, 296], [48, 192], [372, 190], [200, 262], [440, 240],
  ],
  outdoor: [
    [336, 262], [150, 238], [420, 264], [110, 292], [470, 284], [250, 298], [360, 296], [190, 226], [440, 300], [230, 282],
  ],
};

/** A per-browser seed, so each browser arranges people its own (stable) way. */
function browserSeed(): string {
  try {
    let seed = localStorage.getItem("acm-little-club-seed");
    if (!seed) {
      seed = Math.random().toString(36).slice(2, 10);
      localStorage.setItem("acm-little-club-seed", seed);
    }
    return seed;
  } catch {
    return "local";
  }
}

/** Gives every newcomer a free spot (people already placed never move). */
function placeMembers(placed: Map<string, [number, number]>, ids: string[], scene: SceneId, seed: string) {
  const present = new Set(ids);
  for (const id of [...placed.keys()]) if (!present.has(id)) placed.delete(id);
  const slots = MEMBER_SLOTS[scene];
  const used = new Set([...placed.values()].map(([x, y]) => `${x},${y}`));
  for (const id of ids) {
    if (placed.has(id)) continue;
    const h = hash(`${seed}:${scene}:${id}`);
    let spot: [number, number] | null = null;
    for (let k = 0; k < slots.length; k++) {
      const s = slots[(h + k) % slots.length];
      if (!used.has(`${s[0]},${s[1]}`)) {
        spot = s;
        break;
      }
    }
    // More people than spots: next to one, nudged.
    spot ??= clampToFloor(scene, slots[h % slots.length][0] + ((h >> 5) % 41) - 20, slots[h % slots.length][1] + ((h >> 11) % 17) - 8);
    used.add(`${spot[0]},${spot[1]}`);
    placed.set(id, spot);
  }
}

/** Decorative rabbits (not members): type, x, y, pose. */
const EXTRAS: Record<SceneId, Array<[Mbti, number, number, Pose]>> = {
  indoor: [
    ["ISTP", 454, 268, "stand"],
    ["ENFP", 372, 238, "stand"],
    ["ISFP", 256, 134, "sit"],
    ["ESTP", 52, 226, "stand"],
    ["ESFJ", 150, 270, "stand"],
    ["INTJ", 262, 290, "stand"],
  ],
  outdoor: [
    ["ENFJ", 118, 262, "stand"],
    ["INFJ", 172, 284, "stand"],
    ["ISFJ", 330, 266, "sit"],
  ],
};

const SPOT_TEXT: Record<SpotId, { label: string; hint: string; going: string }> = {
  wall: { label: "볼더링 벽", hint: "MOON PROBLEMS 보기", going: "오른쪽 볼더링 벽으로 가는 중…" },
  calendar: { label: "클럽 캘린더", hint: "우리 일정 보기", going: "벽에 걸린 캘린더로 가는 중…" },
  workout: { label: "워크아웃", hint: "줄넘기 한 세트", going: "왼쪽 워크아웃 코너로 가는 중…" },
  sofa: { label: "라운지 소파", hint: "잠깐 앉아 쉬기", going: "안쪽 라운지 소파로 가는 중…" },
  records: { label: "레코드 · 라디오", hint: "AFTER HOURS RADIO 열기", going: "레코드 플레이어로 가는 중…" },
  table: { label: "낮은 테이블", hint: "테이블에 앉기", going: "벽 앞 테이블로 가는 중…" },
  outside: { label: "밖으로", hint: "모닥불 캠프로", going: "문 쪽으로 가는 중…" },
  fire: { label: "모닥불", hint: "불 앞에 앉기", going: "모닥불 쪽으로 가는 중…" },
  inside: { label: "실내로", hint: "클럽 안으로 돌아가기", going: "다시 안으로…" },
};

const PRESETS = ["오늘은 슬랩 연습", "쉬는 중 ☕", "같이 볼더링?", "불멍 중", "다음엔 같이 올라요"];

async function postJson<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  return (await res.json()) as T;
}

/** This page load's tab id (each tab and each reload is its own session for ON/OFF). */
function newSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

interface GameState {
  scene: SceneId;
  night: boolean;
  x: number;
  y: number;
  target: { x: number; y: number; spot: SpotId | null } | null;
  pose: Pose;
  poseUntil: number;
  climbStart: number;
  keys: Set<string>;
  bubble: string;
  tag: string;
  mbti: Mbti;
  dirty: boolean;
  /** The wall calendar's month and today. */
  cal: { month: string; day: number };
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function wallCalendar(now: number) {
  const key = toDateKey(now);
  return { month: MONTHS[Number(key.slice(5, 7)) - 1] ?? "", day: Number(key.slice(8, 10)) };
}

// A short two-note chime (B5 → E5, the soundtrack's motif notes) for in-game notices.
let chimeCtx: AudioContext | null = null;
async function chime(): Promise<boolean> {
  try {
    // Before the member has tapped anything, browsers keep audio locked (and resume() may never settle).
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
    chimeCtx ??= new AudioContext();
    if (chimeCtx.state !== "running") await Promise.race([chimeCtx.resume(), new Promise((r) => setTimeout(r, 300))]);
    if (chimeCtx.state !== "running") return false;
    const ctx = chimeCtx;
    const t0 = ctx.currentTime + 0.02;
    for (const [freq, delay] of [[987.77, 0], [659.25, 0.16]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + delay);
      gain.gain.exponentialRampToValueAtTime(0.2, t0 + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.7);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + 0.75);
    }
    return true;
  } catch {
    return false;
  }
}

type Toast = { title: string; body: string; url: string | null; open?: ModalId };

/** Rings now, or — when the browser wants a tap before any sound — on the member's next tap or key. */
function playChime() {
  void chime().then((ok) => {
    if (ok) return;
    const once = () => {
      void chime();
      window.removeEventListener("pointerdown", once);
      window.removeEventListener("keydown", once);
    };
    window.addEventListener("pointerdown", once, { once: true });
    window.addEventListener("keydown", once, { once: true });
  });
}

export function LittleClub({ data }: { data: LittleClubData }) {
  const reduced = usePrefersReducedMotion();
  const [profile, setProfile] = useState<ClubProfile | null>(data.profile);
  const [modal, setModal] = useState<ModalId>(data.profile ? null : "profile");
  const [scene, setScene] = useState<SceneId>("indoor");
  const [night, setNight] = useState(false);
  const [status, setStatus] = useState<{ main: string; sub?: string }>({ main: "어서 와요. 하고 싶은 걸 골라 보세요.", sub: "장면을 누르거나 아래 버튼으로 움직일 수 있어요." });
  // My one status line (the bubble), the same inside and outside, kept on the server until I change it.
  const [bubble, setBubbleState] = useState(data.profile?.status ?? "");
  const [draft, setDraft] = useState("");
  const [savingBubble, setSavingBubble] = useState(false);
  const [radio, setRadio] = useState<{ mounted: boolean; open: boolean }>({ mounted: false, open: false });
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [bgmOn, setBgmOn] = useState(false);
  const [volume, setVolume] = useState(0.6);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgmRef = useRef<ClubBgm | null>(null);
  const game = useRef<GameState>({
    scene: "indoor",
    night: false,
    x: spawnAt("indoor", profile?.nickname ?? "")[0],
    y: spawnAt("indoor", profile?.nickname ?? "")[1],
    target: null,
    pose: "stand",
    poseUntil: 0,
    climbStart: 0,
    keys: new Set(),
    bubble: data.profile?.status ?? "",
    tag: profile ? nameTag(profile.nickname, profile.mbti) : "",
    mbti: profile?.mbti ?? "INFP",
    dirty: true,
    cal: wallCalendar(data.now),
  });

  // ---- membership notices: the in-game bell ----
  const [notices, setNotices] = useState<ClubNotices>({ notices: data.notices, banner: data.banner });
  // On arrival: the newest unread membership notice, or the renewal banner.
  const [toast, setToast] = useState<Toast | null>(() => {
    const first: ClubNotice | undefined = data.notices[0];
    if (first) return { title: first.title, body: first.body, url: first.url };
    if (data.banner) return { title: BANNER_COPY[data.banner].eyebrow, body: BANNER_COPY[data.banner].body, url: BANNER_COPY[data.banner].href };
    return null;
  });
  const seen = useRef(new Set(data.notices.map((n) => n.id)));
  const ring = useCallback((t: Toast) => {
    setToast(t);
    playChime();
  }, []);
  const arrivedWithNotice = useRef(toast !== null);
  useEffect(() => {
    if (arrivedWithNotice.current) playChime();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 9000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    // New notices: when the member comes back to the tab, or when a push arrives (no polling).
    const refresh = async () => {
      try {
        const res = await refreshClubNotices();
        if (!res.ok) return;
        setNotices({ notices: res.notices, banner: res.banner });
        const fresh = res.notices.filter((n) => !seen.current.has(n.id));
        fresh.forEach((n) => seen.current.add(n.id));
        if (fresh[0]) ring({ title: fresh[0].title, body: fresh[0].body, url: fresh[0].url });
      } catch {}
    };
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; title?: string; body?: string; url?: string } | null;
      if (d?.type !== "acm-push") return;
      const url = typeof d.url === "string" && d.url.startsWith("/") && !d.url.startsWith("//") ? d.url : null;
      ring({ title: String(d.title ?? "알림"), body: String(d.body ?? ""), url });
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [ring]);
  const bellCount = notices.notices.length + (notices.banner ? 1 : 0);

  // ---- the others + the one periodic sync (v7) ----
  // Everyone who opted in, ON or OFF, with their status line. Their spots and motions are local.
  const membersRef = useRef<Map<string, ClubMember>>(new Map(data.members.map((m) => [m.id, m])));
  const placedRef = useRef<Record<SceneId, Map<string, [number, number]>>>({ indoor: new Map(), outdoor: new Map() });
  const seedRef = useRef("local");
  // The same people as text, for screen readers (the canvas itself is one picture).
  const [roster, setRoster] = useState<ClubMember[]>(data.members);
  const onlineCount = roster.filter((m) => m.isOnline).length;
  const [presenceReady, setPresenceReady] = useState(data.presenceReady);
  const syncOn = data.profileStoreReady && profile !== null;
  /** Bumped by every status save (and true while one is on its way), so a sync answer can't undo it. */
  const statusSeq = useRef(0);
  const statusSaving = useRef(false);
  useEffect(() => {
    seedRef.current = browserSeed();
    game.current.dirty = true;
  }, []);
  const applySync = useCallback((res: Extract<ClubSyncResponse, { ok: true }>, seqAtStart: number) => {
    const prev = membersRef.current;
    const next = new Map<string, ClubMember>();
    for (const m of res.members) next.set(m.id, m);
    // Only what changed is swapped in; spots never move because of a sync.
    let changed = next.size !== prev.size;
    for (const [id, m] of next) {
      const old = prev.get(id);
      if (!old || old.statusText !== m.statusText || old.isOnline !== m.isOnline || old.nickname !== m.nickname || old.mbti !== m.mbti) changed = true;
    }
    if (changed) {
      membersRef.current = next;
      game.current.dirty = true;
      setRoster(res.members);
    }
    setPresenceReady(res.presence);
    // My own line changed on another device.
    if (res.me && seqAtStart === statusSeq.current && !statusSaving.current) setBubbleState(res.me.statusText ?? "");
  }, []);
  useEffect(() => {
    if (!syncOn) return;
    // One timer for the whole game (scene changes, moving, the radio never add requests).
    const sessionId = newSessionId();
    let timer = 0;
    let inFlight = false;
    let again = false;
    let failures = 0;
    let stopped = false;
    let left = true;
    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      if (!stopped && !document.hidden) timer = window.setTimeout(run, ms);
    };
    async function run() {
      if (stopped || document.hidden) return;
      if (inFlight) {
        again = true; // asked again while one is on its way: one more right after, never two at once
        return;
      }
      window.clearTimeout(timer);
      inFlight = true;
      left = false;
      const seq = statusSeq.current;
      let ok = false;
      try {
        const res = await postJson<ClubSyncResponse>("/api/little-club/sync", "POST", { sessionId });
        if (res.ok) {
          ok = true;
          if (!stopped) applySync(res, seq);
        } else if (res.reason === "login" || res.reason === "suspended") {
          stopped = true;
        }
      } catch {}
      inFlight = false;
      failures = ok ? 0 : Math.min(failures + 1, SYNC_BACKOFF_MS.length - 1);
      if (again && ok) {
        again = false;
        void run();
      } else {
        again = false;
        schedule(SYNC_BACKOFF_MS[failures]);
      }
    }
    /** Best effort: this tab's entry only. If it's lost, the 75 s window turns the tab OFF anyway. */
    const leave = () => {
      window.clearTimeout(timer);
      if (left) return;
      left = true;
      const body = JSON.stringify({ sessionId });
      try {
        void fetch("/api/little-club/presence/leave", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body }).catch(() => {});
      } catch {
        navigator.sendBeacon?.("/api/little-club/presence/leave", body);
      }
    };
    const onVisibility = () => {
      if (document.hidden) leave();
      else void run();
    };
    const onPageHide = () => leave();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && !document.hidden) void run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    void run(); // right away on entry
    return () => {
      stopped = true;
      leave();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [syncOn, applySync]);
  useEffect(() => {
    game.current.bubble = bubble;
    game.current.dirty = true;
  }, [bubble]);

  useEffect(() => {
    const g = game.current;
    g.tag = profile ? nameTag(profile.nickname, profile.mbti) : "";
    g.mbti = profile?.mbti ?? "INFP";
    g.dirty = true;
  }, [profile]);

  // ---- music ----
  const track: BgmTrack = scene === "outdoor" ? "campfire" : night ? "midnight" : "room";
  useEffect(() => () => bgmRef.current?.dispose(), []);
  useEffect(() => {
    if (bgmOn) bgmRef.current?.set(track, scene === "outdoor");
  }, [bgmOn, track, scene]);
  useEffect(() => {
    bgmRef.current?.setVolume(volume);
  }, [volume]);
  useEffect(() => {
    const update = () => bgmRef.current?.setQuiet(radioPlaying || document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [radioPlaying]);

  async function toggleBgm() {
    if (bgmOn) {
      bgmRef.current?.stop();
      setBgmOn(false);
      return;
    }
    bgmRef.current ??= new ClubBgm();
    bgmRef.current.setVolume(volume);
    bgmRef.current.setQuiet(radioPlaying || document.hidden);
    setBgmOn(true);
    await bgmRef.current.start(track, scene === "outdoor");
  }

  // ---- actions ----
  const say = useCallback((main: string, sub?: string) => setStatus({ main, sub }), []);

  const changeScene = useCallback(
    (next: SceneId) => {
      const g = game.current;
      g.scene = next;
      [g.x, g.y] = spawnAt(next, g.tag);
      g.target = null;
      g.pose = "stand";
      g.dirty = true;
      setScene(next); // local only: no request
    },
    [],
  );

  const openRadio = useCallback(() => {
    setRadio({ mounted: true, open: true });
  }, []);

  const arrive = useCallback(
    (spot: SpotId) => {
      const g = game.current;
      const now = performance.now();
      g.target = null;
      g.dirty = true;
      switch (spot) {
        case "calendar":
          setModal("calendar");
          say("클럽 캘린더 앞이에요.", "홈과 같은 우리 일정이에요. 이벤트를 누르면 자세히 볼 수 있어요.");
          break;
        case "wall":
          setModal("problems");
          say("볼더링 벽 앞이에요.", "벽의 홀드는 장식이고, 실제 문제는 MOON PROBLEMS 목록에 있어요.");
          break;
        case "workout":
          g.pose = "workout";
          g.poseUntil = now + 3600;
          say("줄넘기 한 세트!", "게임 속 운동은 기록이나 스탬프에 남지 않아요.");
          break;
        case "sofa":
          g.pose = "sit";
          g.poseUntil = Infinity;
          [g.x, g.y] = [222, 136];
          say("라운지 소파에 앉았어요.", "움직이면 다시 일어나요.");
          break;
        case "records":
          openRadio();
          say("레코드 플레이어 앞이에요.", "AFTER HOURS RADIO를 열었어요. 재생은 라디오에서 직접 시작해 주세요.");
          break;
        case "table":
          g.pose = "sit";
          g.poseUntil = Infinity;
          [g.x, g.y] = [300, 266];
          say("벽 앞 낮은 테이블에 앉았어요.");
          break;
        case "outside":
          changeScene("outdoor");
          say("달빛 아래 캠프파이어에 왔어요.", "이 캠프는 상상 속 장소예요. 모닥불 앞에 앉거나 말풍선을 띄워 보세요.");
          break;
        case "fire":
          g.pose = "sit";
          g.poseUntil = Infinity;
          [g.x, g.y] = [214, 260];
          say("모닥불 앞에 앉았어요.", "타닥타닥.");
          break;
        case "inside":
          changeScene("indoor");
          say("다시 클럽 안이에요.");
          break;
      }
    },
    [changeScene, openRadio, say],
  );

  const walkTo = useCallback(
    (spot: SpotId) => {
      const g = game.current;
      const s = SPOTS[g.scene].find((p) => p.id === spot);
      if (!s) return;
      g.pose = "stand";
      g.target = { x: s.x, y: s.y, spot };
      g.dirty = true;
      say(SPOT_TEXT[spot].going);
    },
    [say],
  );

  const interact = useCallback(() => {
    const g = game.current;
    let best: SpotId | null = null;
    let dist = Infinity;
    for (const s of SPOTS[g.scene]) {
      const d = Math.hypot(g.x - s.x, g.y - s.y);
      if (d < dist) {
        dist = d;
        best = s.id;
      }
    }
    if (best && dist < 70) arrive(best);
    else say("조금 더 가까이 가 보세요.", "장면을 누르거나 오른쪽 버튼을 써도 돼요.");
  }, [arrive, say]);

  function startClimb() {
    const g = game.current;
    setModal(null);
    g.pose = "climb";
    g.climbStart = performance.now();
    g.poseUntil = g.climbStart + 4200;
    g.dirty = true;
    say("벽을 살짝 올라가 보는 중…", "게임 연출이에요. 실제 완등 기록이나 스탬프와는 관계없어요.");
  }

  // ---- my status line (saved only on 저장 / 삭제) ----
  async function saveBubble(text: string) {
    const clean = cleanBubble(text);
    const before = bubble;
    statusSeq.current++;
    setBubbleState(clean); // shows at once; others see it with their next sync
    if (!data.profileStoreReady) {
      setDraft("");
      say(clean ? "말풍선을 띄웠어요." : "말풍선을 지웠어요.", "저장소 준비 전이라 이 화면에서만 보여요.");
      return;
    }
    setSavingBubble(true);
    statusSaving.current = true;
    try {
      const res = await postJson<StatusResult>("/api/little-club/status", "PATCH", { statusText: clean || null });
      statusSeq.current++;
      if (res.ok) {
        setBubbleState(res.statusText ?? "");
        setDraft("");
        say(
          res.statusText ? "말풍선을 저장했어요." : "말풍선을 지웠어요.",
          res.statusText ? "안팎 어디서나 그대로이고, 다른 멤버 화면에는 30초 안에 바뀌어요. 지우기 전까지 남아요." : undefined,
        );
      } else {
        setBubbleState(before);
        say("말풍선을 저장하지 못했어요.", res.message);
      }
    } catch {
      statusSeq.current++;
      setBubbleState(before);
      say("말풍선을 저장하지 못했어요.", "잠시 후 다시 시도해 주세요.");
    } finally {
      statusSaving.current = false;
      setSavingBubble(false);
    }
  }

  // ---- the game loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g2 = canvas.getContext("2d", { alpha: false });
    if (!g2) return;
    // The scene is laid out in 512 × 320 units but drawn at 2–4× (the screen's real pixels),
    // so the pixel art stays blocky while Korean text in tags, bubbles and the sign stays sharp.
    let scale = 0;
    const resize = () => {
      const cssWidth = canvas.getBoundingClientRect().width || W;
      const next = Math.max(2, Math.min(4, Math.round((cssWidth * (window.devicePixelRatio || 1)) / W)));
      if (next === scale) return;
      scale = next;
      canvas.width = W * scale;
      canvas.height = H * scale;
      game.current.dirty = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    let raf = 0;
    let last = performance.now();
    let visible = true;
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      game.current.dirty = true;
    });
    io.observe(canvas);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = game.current;
      if (document.hidden || !visible) return;

      // movement
      let dx = 0;
      let dy = 0;
      if (g.keys.has("ArrowLeft") || g.keys.has("a")) dx--;
      if (g.keys.has("ArrowRight") || g.keys.has("d")) dx++;
      if (g.keys.has("ArrowUp") || g.keys.has("w")) dy--;
      if (g.keys.has("ArrowDown") || g.keys.has("s")) dy++;
      let moving = false;
      if (g.pose === "climb") {
        if (now > g.poseUntil) {
          g.pose = "stand";
          [g.x, g.y] = [392, 230];
          g.dirty = true;
        }
      } else if (dx || dy) {
        const l = Math.hypot(dx, dy);
        const speed = 120 * dt;
        g.pose = "stand";
        g.target = null;
        [g.x, g.y] = clampToFloor(g.scene, g.x + (dx / l) * speed, g.y + (dy / l) * speed * 0.8);
        moving = true;
      } else if (g.target) {
        const d = Math.hypot(g.target.x - g.x, g.target.y - g.y);
        if (d < 4) {
          const spot = g.target.spot;
          g.target = null;
          if (spot) arrive(spot);
        } else {
          const speed = Math.min(d, 150 * dt);
          [g.x, g.y] = clampToFloor(g.scene, g.x + ((g.target.x - g.x) / d) * speed, g.y + ((g.target.y - g.y) / d) * speed);
          moving = true;
        }
      }
      if (g.pose === "workout" && now > g.poseUntil) {
        g.pose = "stand";
        g.dirty = true;
      }
      // the others: a spot each, picked here (moving never sends anything)
      const members = [...membersRef.current.values()];
      const placed = placedRef.current[g.scene];
      if (placed.size !== members.length || members.some((m) => !placed.has(m.id))) placeMembers(placed, members.map((m) => m.id), g.scene, seedRef.current);

      // reduced motion: draw only when something changed (no idle animation)
      if (reduced && !moving && !g.dirty && g.pose !== "climb") return;
      g.dirty = false;
      const t = reduced ? 0 : now / 16.67;
      g2.setTransform(scale, 0, 0, scale, 0, 0);
      render(g2, g, t, now, moving, reduced, members, placed);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [arrive, reduced]);

  // ---- input ----
  useEffect(() => {
    const MOVE = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"]);
    const typing = (el: EventTarget | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (modal || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (radio.open && (e.target as HTMLElement | null)?.closest?.("[data-radio-dock]")) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (MOVE.has(key)) {
        e.preventDefault();
        game.current.keys.add(key);
      } else if (key === "e") {
        e.preventDefault();
        interact();
      }
    };
    const up = (e: KeyboardEvent) => game.current.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const clear = () => game.current.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [interact, modal, radio.open]);

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (modal) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    const g = game.current;
    const spot = spotAt(g.scene, x, y);
    if (spot) {
      walkTo(spot.id);
      return;
    }
    const [tx, ty] = clampToFloor(g.scene, x, y);
    g.pose = "stand";
    g.target = { x: tx, y: ty, spot: null };
    g.dirty = true;
    say("클럽을 둘러보는 중…", "가고 싶은 곳을 누르면 그쪽으로 가요.");
  }

  const pad = (key: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      game.current.keys.add(key);
    },
    onPointerUp: () => game.current.keys.delete(key),
    onPointerCancel: () => game.current.keys.delete(key),
    onLostPointerCapture: () => game.current.keys.delete(key),
  });

  // From the home page's "아지트 들어가기" (#play): straight to the game.
  useEffect(() => {
    if (window.location.hash === "#play") document.getElementById("play")?.scrollIntoView({ block: "start" });
  }, []);

  const spots = SPOTS[scene];
  const earned = data.stamps ?? [];

  return (
    <div id="play" className="mx-auto max-w-6xl scroll-mt-2 px-4 pb-24 md:px-6">
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <ToolButton onClick={() => setModal("profile")} label="내 토끼 설정">
          ☾ {profile ? nameTag(profile.nickname, profile.mbti) : "MY RABBIT"}
        </ToolButton>
        {bellCount > 0 && (
          <ToolButton onClick={() => setModal("notices")} label={`회원권 알림 ${bellCount}개`} active>
            🔔 알림 · {bellCount}
          </ToolButton>
        )}
        <ToolButton onClick={() => setModal("stamps")} label="내 정보와 스탬프">
          MY STAMPS · {earned.length}
        </ToolButton>
        <ToolButton onClick={openRadio} label="AFTER HOURS RADIO 열기" active={radio.open}>
          ◉ RADIO
        </ToolButton>
        {scene === "indoor" && (
          <ToolButton
            onClick={() => {
              setNight((n) => {
                game.current.night = !n;
                game.current.dirty = true;
                return !n;
              });
            }}
            label={night ? "낮 조명으로" : "나이트 조명으로"}
            active={night}
          >
            {night ? "☀ DAY" : "✦ NIGHT"}
          </ToolButton>
        )}
        <ToolButton onClick={toggleBgm} label={bgmOn ? "배경음악 끄기" : "배경음악 켜기"} active={bgmOn}>
          ♫ BGM {bgmOn ? "ON" : "OFF"}
        </ToolButton>
        {bgmOn && (
          <label className="flex items-center gap-2 font-label text-[10px] uppercase tracking-[0.16em] text-cream/60">
            <span className="hidden sm:inline">{radioPlaying ? "Radio on air" : BGM_TITLES[track]}</span>
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="배경음악 볼륨" className="w-20 accent-[var(--color-butter)]" />
          </label>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-md border-2 border-cream/30 bg-[#091324] shadow-[0_10px_0_#08111b]">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              onClick={onCanvasClick}
              role="img"
              aria-label={
                scene === "indoor"
                  ? "픽셀아트 클럽 실내: 왼쪽 워크아웃, 오른쪽 볼더링 벽과 매트, 벽 앞 낮은 테이블, 안쪽 라운지. 아래 버튼과 방향키로 움직일 수 있어요."
                  : "상상 속 모닥불 캠프 장면. 아래 버튼과 방향키로 움직일 수 있어요."
              }
              className="block aspect-[512/320] w-full cursor-pointer [image-rendering:pixelated] [touch-action:manipulation]"
            />
            <span className="pointer-events-none absolute left-2 top-2 rounded-sm bg-midnight/75 px-2 py-1 font-label text-[9px] font-semibold uppercase tracking-[0.2em] text-cream/85">
              {scene === "indoor" ? (night ? "Inside · Night lights" : "Inside the club") : "The campfire"}
              {onlineCount > 0 && <span className="ml-1.5 text-[#8fe3b0]">· ON {onlineCount}</span>}
            </span>
            <ul className="sr-only" aria-label="클럽의 다른 멤버">
              {roster.map((m) => (
                <li key={m.id}>
                  {nameTag(m.nickname, m.mbti, m.isOnline)}
                  {m.statusText ? `, 말풍선: ${m.statusText}` : ""}
                </li>
              ))}
            </ul>
            {toast && (
              <div role="status" className="absolute inset-x-2 top-9 mx-auto flex max-w-md items-start gap-2 rounded-md border-2 border-butter bg-midnight/95 p-2.5 text-cream shadow-[4px_4px_0_#05090f] sm:top-10">
                <span aria-hidden="true" className="text-[18px] leading-none">🔔</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold leading-snug">{toast.title}</p>
                  {toast.body && <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-cream/75">{toast.body}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button type="button" onClick={() => { setModal(toast.open ?? "notices"); setToast(null); }} className="rounded-sm bg-butter px-2 py-1 text-[11px] font-bold text-midnight">
                    보기
                  </button>
                  <button type="button" onClick={() => setToast(null)} aria-label="알림 닫기" className="px-1 text-[11px] text-cream/60">
                    닫기
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
            <p aria-live="polite" className="min-h-10 text-[13px] leading-snug text-cream">
              {status.main}
              {status.sub && <small className="mt-0.5 block text-[11px] text-cream/60">{status.sub}</small>}
            </p>
            <p className="hidden font-label text-[10px] uppercase tracking-[0.14em] text-cream/50 md:block">← ↑ ↓ → / WASD 이동 · E 상호작용</p>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 md:hidden" aria-label="이동 버튼">
            {(
              [
                ["ArrowLeft", "←", "왼쪽으로"],
                ["ArrowUp", "↑", "위로"],
                ["ArrowDown", "↓", "아래로"],
                ["ArrowRight", "→", "오른쪽으로"],
              ] as const
            ).map(([key, sym, name]) => (
              <button key={key} type="button" aria-label={`${name} 이동`} {...pad(key)} className="h-11 w-12 select-none rounded-md border border-cream/40 bg-midnight-700 text-[17px] text-cream [touch-action:none] active:bg-midnight-500">
                {sym}
              </button>
            ))}
            <button type="button" onClick={interact} aria-label="가까운 곳과 상호작용" className="h-11 w-12 rounded-md border border-butter bg-[#53452f] font-label text-[13px] font-semibold text-butter">
              E
            </button>
          </div>
        </div>

        <aside aria-label="할 수 있는 일" className="rounded-md border border-cream/20 bg-midnight-800 p-4">
          <p className="font-label text-[10px] font-semibold uppercase tracking-[0.2em] text-butter">{scene === "indoor" ? "Inside · what to do" : "Outside · campfire"}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
            {spots.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => walkTo(s.id)}
                className={cn(
                  "flex flex-col items-start rounded-md border px-3 py-2.5 text-left transition-colors",
                  s.id === "outside" || s.id === "inside" ? "border-butter/70 bg-[#53452f] hover:bg-[#655238]" : "border-cream/25 bg-midnight-700 hover:bg-midnight-500",
                )}
              >
                <span className="text-[13px] font-bold text-cream">{SPOT_TEXT[s.id].label}</span>
                <span className="text-[11px] text-cream/60">{SPOT_TEXT[s.id].hint}</span>
              </button>
            ))}
          </div>

          <form
            className="mt-4 border-t border-cream/15 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) void saveBubble(draft);
            }}
          >
            <label htmlFor="bubble" className="font-label text-[10px] font-semibold uppercase tracking-[0.2em] text-butter">
              말풍선 · 지금 하는 일
            </label>
            <div className="mt-2 flex gap-1.5">
              <input
                id="bubble"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={BUBBLE_MAX}
                autoComplete="off"
                placeholder={bubble || "한 줄로 짧게"}
                className="min-w-0 flex-1 rounded-sm border border-cream/40 bg-midnight px-2 py-2 text-[13px] text-cream placeholder:text-cream/40"
              />
              <button type="submit" disabled={savingBubble || !draft.trim()} className="rounded-sm bg-butter px-3 text-[12px] font-bold text-midnight disabled:opacity-50">
                {savingBubble ? "저장 중" : "저장"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setDraft(p);
                    document.getElementById("bubble")?.focus();
                  }}
                  className="rounded-sm border border-cream/25 px-2 py-1 text-[11px] text-cream/75 hover:text-cream"
                >
                  {p}
                </button>
              ))}
              {bubble && (
                <button type="button" disabled={savingBubble} onClick={() => void saveBubble("")} className="rounded-sm border border-[#d9826d]/60 px-2 py-1 text-[11px] text-[#f0b3a4] hover:text-cream">
                  삭제
                </button>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-cream/50">
              {bubble ? <>지금 말풍선: <b className="text-cream/80">{bubble}</b>. </> : null}
              하나만, 지금 것만 남아요. 안팎 어디서나 같고, 지우기 전까지 남아요(게임을 나가도). 다른 멤버에게도 보여요. 대화 기록은 없어요.
            </p>
          </form>

          <p className="mt-4 border-t border-cream/15 pt-3 text-[11px] leading-relaxed text-cream/50">
            이름표가 있는 토끼는 리틀 클럽에 들어온 다른 멤버예요. <b className="text-[#8fe3b0]">ON</b>은 지금 이 게임 화면을 보고 있다는 뜻이고(약 30초마다 갱신), 실제로 암장에 있다는 뜻은 아니에요. 자리와 동작은 각자 화면에서 정해져요.{!presenceReady && " (ON/OFF는 준비 중이라 지금은 모두 OFF로 보여요.)"} 이름표 없는 토끼와 강아지 두 마리는 장면을 꾸미는 캐릭터예요. 게임 속 행동은 회원 기록·스탬프에 반영되지 않아요.
          </p>
        </aside>
      </div>

      {modal === "profile" && (
        <ProfileModal
          initial={profile}
          defaultNickname={data.defaultNickname}
          storeReady={data.profileStoreReady}
          reduced={reduced}
          closable={profile !== null}
          onClose={() => setModal(null)}
          onSaved={(p, saved) => {
            setProfile((prev) => ({ ...p, status: prev?.status ?? p.status }));
            setModal(null);
            say(`${nameTag(p.nickname, p.mbti)} 달토끼로 들어왔어요.`, saved ? `${MBTI_MOTIONS[p.mbti]} 모션 · 다음에 와도 그대로예요.` : "저장소 준비 전이라 이번 방문에만 쓰여요.");
          }}
        />
      )}
      {modal === "problems" && <ProblemsModal problems={data.problems} onClose={() => setModal(null)} onClimb={startClimb} />}
      {modal === "stamps" && <StampsModal profile={profile} stamps={data.stamps} onClose={() => setModal(null)} />}
      {modal === "calendar" && (
        <Modal kicker="Club calendar" title="Our calendar." wide onClose={() => setModal(null)}>
          <div className="mt-3">
            {data.calendar ? (
              <ClubCalendar events={data.calendar.events} enrollments={data.calendar.enrollments} now={data.calendar.now} />
            ) : (
              <p className="rounded-sm bg-plywood-200 px-3 py-2 text-[13px]">일정을 불러오지 못했어요. 홈 화면의 캘린더에서 확인해 주세요.</p>
            )}
          </div>
        </Modal>
      )}
      {modal === "notices" && (
        <NoticesModal
          notices={notices}
          onClose={() => setModal(null)}
          onRead={async () => {
            await markAllRead();
            setNotices((n) => ({ ...n, notices: [] }));
            setModal(null);
            say("알림을 확인했어요.");
          }}
        />
      )}

      {radio.mounted && (
        <section
          data-radio-dock
          aria-label="AFTER HOURS RADIO"
          className="fixed bottom-2 right-2 z-40 w-[min(440px,calc(100vw-16px))] rounded-md border-2 border-butter bg-midnight shadow-[6px_7px_0_#05090f] sm:bottom-4 sm:right-4"
        >
          <div className="flex items-center justify-between gap-2 bg-midnight-700 px-3 py-2">
            <div>
              <p className="font-label text-[11px] font-semibold uppercase tracking-[0.18em] text-butter">◉ After hours radio</p>
              <p className="text-[10px] text-cream/60">{radioPlaying ? "재생 중 · 장면을 바꿔도 계속돼요" : "기존 라디오 플레이어 그대로예요"}</p>
            </div>
            <button
              type="button"
              onClick={() => setRadio((r) => ({ ...r, open: !r.open }))}
              aria-expanded={radio.open}
              className="rounded-sm border border-cream/40 px-2.5 py-1 text-[12px] text-cream"
            >
              {radio.open ? "접기" : "펼치기"}
            </button>
          </div>
          {/* Collapsed, the player stays mounted (and keeps playing); it's only out of sight. */}
          <div className={cn("overflow-y-auto text-cream", radio.open ? "max-h-[60vh] py-4" : "h-0 overflow-hidden")} aria-hidden={!radio.open}>
            {data.radio ? (
              <RadioStation initial={data.radio} onPlayingChange={setRadioPlaying} />
            ) : (
              <p className="px-4 text-[13px] text-cream/75">
                라디오를 불러오지 못했어요.{" "}
                <Link href="/radio" className="underline">
                  라디오 화면에서 열기
                </Link>
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawing one frame
// ---------------------------------------------------------------------------

function render(g: CanvasRenderingContext2D, s: GameState, t: number, now: number, moving: boolean, reduced: boolean, members: ClubMember[], placed: Map<string, [number, number]>) {
  const indoor = s.scene === "indoor";
  if (indoor) drawIndoor(g, s.cal);
  else drawOutdoor(g, t);

  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  // Scenery rabbits make way as real people arrive.
  const taken = members.map((m) => placed.get(m.id)).filter((p): p is [number, number] => p !== undefined);
  EXTRAS[s.scene].slice(0, Math.max(0, EXTRAS[s.scene].length - members.length)).forEach(([type, x, y, pose], i) => {
    if (Math.hypot(s.x - x, s.y - y) < 18 || taken.some(([mx, my]) => Math.hypot(mx - x, my - y) < 24)) return;
    items.push({ y, draw: () => drawRabbit(g, x, y, type, t + i * 37, depthScale(s.scene, y) * 0.8, { pose }) });
  });
  if (indoor) {
    items.push({ y: 160, draw: () => drawDogA(g, 252, 160, t, depthScale("indoor", 160) * 0.9, "lie", reduced) });
    items.push({ y: 300, draw: () => drawDogB(g, 370, 300, t, depthScale("indoor", 300) * 0.85, reduced) });
    items.push({ y: TABLE_DEPTH, draw: () => drawTable(g) });
  } else {
    items.push({ y: 280, draw: () => drawDogA(g, 300, 280, t, 1, "sit", reduced) });
    items.push({ y: 294, draw: () => drawDogB(g, 196, 294, t, 0.95, reduced) });
  }

  // the player (on the wall while climbing)
  let px = s.x;
  let py = s.y;
  let scale = depthScale(s.scene, s.y);
  if (s.pose === "climb") {
    const k = Math.min(1, (now - s.climbStart) / 4200);
    const v = k < 0.55 ? (k / 0.55) * 0.5 : 0.5 - ((k - 0.55) / 0.45) * 0.5;
    [px, py] = wallPoint(0.62, v);
    px -= 14;
    scale = depthScale("indoor", 230);
  }
  // The others: their own MBTI motion at their spot. OFF = resting, a little faded (status line kept).
  const labels: Array<{ x: number; y: number; scale: number; tag: string; state: TagState; bubble: string }> = [];
  for (const m of members) {
    const spot = placed.get(m.id);
    if (!spot) continue;
    const [mx, my] = spot;
    const ms = depthScale(s.scene, my);
    const phase = hash(m.id) % 997;
    items.push({
      y: my,
      draw: () => {
        g.save();
        if (!m.isOnline) g.globalAlpha = 0.6;
        drawRabbit(g, mx, my, m.mbti, t + phase, ms, { pose: m.isOnline ? "stand" : "sit" });
        g.restore();
      },
    });
    labels.push({ x: mx, y: my, scale: ms, tag: nameTag(m.nickname, m.mbti), state: m.isOnline ? "ON" : "OFF", bubble: m.statusText ?? "" });
  }
  // ON people get the nearer label places; OFF labels move up out of their way.
  labels.sort((a, b) => Number(b.state === "ON") - Number(a.state === "ON"));

  const playerY = s.pose === "climb" ? 400 : s.pose === "sit" && indoor && s.y < 150 ? 140 : s.y;
  items.push({ y: playerY, draw: () => drawRabbit(g, px, py, s.mbti, t, scale, { player: true, walking: moving, pose: s.pose }) });

  items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());

  if (indoor) {
    if (s.night) drawNight(g, t, reduced);
    else drawDay(g);
  }

  // Tags and bubbles stay readable at night. Mine keeps its place; a nearby label moves up
  // out of the way instead of covering another (so a bubble is never read as someone else's).
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  const fit = (x: number, top: number, w: number, h: number) => {
    for (let k = 0; k < 8; k++) {
      const hit = boxes.find((b) => Math.abs(b.x - x) < (b.w + w) / 2 && top < b.y + b.h && top + h > b.y);
      if (!hit) break;
      top = hit.y - h - 1;
    }
    boxes.push({ x, y: top, w, h });
    return top;
  };
  const drawLabel = (x: number, footY: number, sc: number, tag: string, state: TagState | undefined, bubble: string) => {
    if (!tag) return;
    const ts = tagSize(g, tag, state);
    const tagTop = fit(x, footY - 44 * sc - 10, ts.w, ts.h);
    drawNameTag(g, x, tagTop + 10, tag, state);
    if (!bubble) return;
    const bs = bubbleSize(g, bubble);
    const bubbleTop = fit(x, tagTop - bs.h - 1, bs.w, bs.h);
    drawBubble(g, x, bubbleTop + 26, bubble);
  };
  drawLabel(px, py, scale, s.tag, "ON", s.bubble);
  for (const l of labels) drawLabel(l.x, l.y, l.scale, l.tag, l.state, l.bubble);
}

// ---------------------------------------------------------------------------
// UI pieces
// ---------------------------------------------------------------------------

function ToolButton({ onClick, label, active, children }: { onClick: () => void; label: string; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "rounded-sm border px-3 py-2 font-label text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors",
        active ? "border-butter bg-[#53452f] text-butter" : "border-cream/35 bg-midnight-700 text-cream hover:bg-midnight-500",
      )}
    >
      {children}
    </button>
  );
}

function Modal({ kicker, title, closable = true, wide = false, onClose, children }: { kicker: string; title: string; closable?: boolean; wide?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const before = document.activeElement as HTMLElement | null;
    const focusables = () =>
      [...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute("disabled"));
    (focusables()[0] ?? root).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closable) {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "Tab") {
        const list = focusables();
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [closable]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#08101fcc] p-3 backdrop-blur-sm"
      onClick={(e) => {
        if (closable && e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="club-modal-title" tabIndex={-1} className={cn("max-h-[calc(100dvh-24px)] w-full overflow-y-auto", wide ? "max-w-3xl" : "max-w-lg", " rounded-md border-4 border-midnight-700 bg-ivory p-4 text-midnight shadow-[10px_10px_0_#05090f] sm:p-5")}>
        <div className="flex items-center justify-between gap-2 border-b-2 border-plywood-400 pb-2">
          <span className="font-label text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">{kicker}</span>
          {closable && (
            <button type="button" onClick={onClose} aria-label="닫기" className="px-1 text-[24px] leading-none text-midnight">
              ×
            </button>
          )}
        </div>
        <h2 id="club-modal-title" className="mt-3 font-display text-[28px] font-extrabold uppercase leading-none">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function RabbitTile({ type, reduced }: { type: Mbti; reduced: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!g) return;
    g.imageSmoothingEnabled = false;
    if (reduced) {
      drawRabbitTile(g, type, 0);
      return;
    }
    let raf = 0;
    const loop = (now: number) => {
      drawRabbitTile(g, type, now / 16.67);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [type, reduced]);
  return <canvas ref={ref} width={64} height={64} aria-hidden="true" className="mx-auto block h-14 w-14 [image-rendering:pixelated]" />;
}

function ProfileModal({
  initial,
  defaultNickname,
  storeReady,
  reduced,
  closable,
  onClose,
  onSaved,
}: {
  initial: ClubProfile | null;
  defaultNickname: string;
  storeReady: boolean;
  reduced: boolean;
  closable: boolean;
  onClose: () => void;
  onSaved: (p: ClubProfile, saved: boolean) => void;
}) {
  const [nickname, setNickname] = useState(initial?.nickname ?? defaultNickname);
  const [mbti, setMbti] = useState<Mbti | null>(initial?.mbti ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = cleanNickname(nickname);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clean) return setError(`별명은 1~${NICKNAME_MAX}자로, 글자·숫자·띄어쓰기 위주로 적어 주세요.`);
    if (!mbti) return setError("MBTI 달토끼를 하나 골라 주세요.");
    if (!storeReady) return onSaved({ nickname: clean, mbti, status: "" }, false);
    setBusy(true);
    setError(null);
    try {
      const res = await saveClubProfile({ nickname: clean, mbti });
      if (res.ok) onSaved(res.profile, true);
      else setError(res.message);
    } catch {
      setError("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal kicker="My moon rabbit" title={initial ? "Edit your rabbit." : "Choose your moon rabbit."} closable={closable} onClose={onClose}>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <p className="text-[13px] leading-relaxed text-ink-soft">
          게임 속 내 토끼 위에 <b className="text-midnight">별명 · MBTI</b>가 보여요. 모두 같은 달토끼이고, MBTI마다 하는 행동이 달라요. 놀이용 설정일 뿐 성격 판정이 아니에요.
        </p>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          별명 ({NICKNAME_MAX}자까지)
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX * 2}
            required
            autoComplete="nickname"
            className="rounded-sm border-2 border-midnight/40 bg-white px-3 py-2 text-[15px] text-midnight"
          />
        </label>
        <fieldset>
          <legend className="text-[12px] font-semibold text-ink-soft">MBTI 달토끼</legend>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {MBTI_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setMbti(type)}
                aria-pressed={mbti === type}
                aria-label={`${type}: ${MBTI_MOTIONS[type]}`}
                className={cn("min-w-0 rounded-sm border-2 px-0.5 py-1.5 text-center", mbti === type ? "border-brown bg-butter-200 shadow-[inset_0_0_0_2px_#fcf0cb]" : "border-plywood-400 bg-plywood-200")}
              >
                <RabbitTile type={type} reduced={reduced} />
                <span className="block text-[11px] font-bold">{type}</span>
                <span className="block break-keep text-[9px] leading-tight text-ink-soft">{MBTI_MOTIONS[type]}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <p className="rounded-sm border-2 border-plywood-400 bg-plywood-200 px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
          리틀 클럽에 들어온 다른 멤버에게 내 토끼와 <b className="text-midnight">별명 · MBTI · 말풍선 · ON/OFF</b>(지금 게임 화면을 보고 있는지)가 보여요. 내 위치·접속 시각·회원 정보는 보내지 않아요.
        </p>
        {!storeReady && <p className="rounded-sm bg-plywood-200 px-3 py-2 text-[12px] text-brown">프로필 저장소가 아직 준비 중이에요. 지금 고른 토끼는 이번 방문에만 쓰여요.</p>}
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-[#b8402e]">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={cn(buttonPrimary, "w-full")}>
          {busy ? "저장하는 중…" : initial ? "저장하기" : "이 토끼로 들어가기"}
        </button>
      </form>
    </Modal>
  );
}

function ProblemsModal({ problems, onClose, onClimb }: { problems: LittleClubData["problems"]; onClose: () => void; onClimb: () => void }) {
  return (
    <Modal kicker="Bouldering wall · MOON PROBLEMS" title="On the wall tonight." onClose={onClose}>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">게임 속 벽의 홀드는 장식이에요. 아래는 운영진이 클럽 벽에 실제로 만든 문제예요. 누르면 문제 화면으로 가요.</p>
      {problems === null ? (
        <p className="mt-3 rounded-sm bg-plywood-200 px-3 py-2 text-[13px]">문제 목록을 불러오지 못했어요.</p>
      ) : problems.length === 0 ? (
        <p className="mt-3 rounded-sm bg-plywood-200 px-3 py-2 text-[13px]">아직 등록된 문제가 없어요.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {problems.map((p) => {
            const info = gradeInfo(p.grade);
            return (
              <li key={p.no}>
                <Link href={`/problems/${p.no}`} className="flex items-center gap-3 rounded-sm border-2 border-plywood-400 bg-plywood-200 px-3 py-2 hover:border-midnight">
                  <span aria-hidden="true" className="h-8 w-2 shrink-0 rounded-sm border border-midnight/30" style={{ background: info?.swatch ?? "#a88d64" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[11px] text-brown">
                      {p.code} · {gradeLabel(p.grade)}
                      {p.wall ? ` · ${p.wall}` : ""}
                    </span>
                    <span className="block truncate text-[15px] font-bold">{p.title}</span>
                    <span className="block text-[11px] text-ink-soft">
                      {p.setterName ? `Setter ${p.setterName} · ` : ""}완등 {p.sends}명{p.funAverage !== null ? ` · 재미 ${p.funAverage.toFixed(1)}` : ""}
                    </span>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onClimb} className="rounded-sm border-2 border-midnight/40 px-3 py-2 text-[12px] font-bold">
          잠깐 올라가 보기 (게임 연출)
        </button>
        <Link href="/problems" className="text-[13px] font-bold underline">
          전체 문제 보기
        </Link>
      </div>
    </Modal>
  );
}

function StampsModal({ profile, stamps, onClose }: { profile: ClubProfile | null; stamps: LittleClubData["stamps"]; onClose: () => void }) {
  return (
    <Modal kicker="Your corner · profile" title="My stamp archive." onClose={onClose}>
      <p className="mt-2 font-mono text-[12px] text-brown">{profile ? `${nameTag(profile.nickname, profile.mbti)} · ${MBTI_MOTIONS[profile.mbti]}` : "아직 토끼를 고르지 않았어요"}</p>
      {stamps === null ? (
        <p className="mt-3 rounded-sm bg-plywood-200 px-3 py-2 text-[13px]">스탬프를 불러오지 못했어요. MY 화면에서 확인해 주세요.</p>
      ) : stamps.length === 0 ? (
        <p className="mt-3 rounded-sm bg-plywood-200 px-3 py-2 text-[13px]">아직 받은 스탬프가 없어요.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {stamps.map((s) => (
            <li key={s.id} className="rounded-sm border-2 border-plywood-400 bg-plywood-200 p-2 text-center">
              <Image src={s.imageSrc} alt="" width={96} height={96} className="mx-auto h-auto w-full max-w-[88px]" />
              <span className="mt-1 block font-display text-[15px] font-extrabold uppercase leading-none">{s.name}</span>
              <span className="mt-1 block font-mono text-[10px] text-brown">{s.awardedAt ? s.awardedAt.replace(/-/g, ".") : "받음"}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 rounded-sm bg-plywood-200 px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
        여기에는 운영진이 실제로 발급한 스탬프만 보여요. 게임 속 등반·운동·캠핑으로는 스탬프가 생기지 않아요.
      </p>
      <Link href="/me" className="mt-3 inline-block text-[13px] font-bold underline">
        MY에서 스탬프 공유하기
      </Link>
    </Modal>
  );
}

function NoticesModal({ notices, onClose, onRead }: { notices: ClubNotices; onClose: () => void; onRead: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const banner = notices.banner ? BANNER_COPY[notices.banner] : null;
  return (
    <Modal kicker="Membership · notices" title="For you." onClose={onClose}>
      <div className="mt-3 flex flex-col gap-2">
        {banner && (
          <Link href={banner.href} className="block rounded-sm border-2 border-butter bg-butter-200/70 px-3 py-2 hover:border-midnight">
            <span className="block font-label text-[10px] font-semibold uppercase tracking-[0.18em] text-brown">{banner.eyebrow}</span>
            <span className="mt-0.5 block text-[14px] leading-snug">{banner.body}</span>
            <span className="mt-1 block text-[12px] font-bold underline">{banner.cta}</span>
          </Link>
        )}
        {notices.notices.map((n) => (
          <Link key={n.id} href={n.url} className="block rounded-sm border-2 border-plywood-400 bg-plywood-200 px-3 py-2 hover:border-midnight">
            <span className="block text-[14px] font-bold">{n.title}</span>
            {n.body && <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">{n.body}</span>}
          </Link>
        ))}
        {!banner && notices.notices.length === 0 && <p className="rounded-sm bg-plywood-200 px-3 py-2 text-[13px]">새 회원권 알림이 없어요.</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/notifications" className="text-[13px] font-bold underline">
          알림 목록 · 알림 설정
        </Link>
        {notices.notices.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRead();
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-sm border-2 border-midnight/40 px-3 py-2 text-[12px] font-bold"
          >
            {busy ? "처리 중…" : "모두 확인했어요"}
          </button>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">게임 중에도 새 알림이 오면 종이 울려요. 휴대폰 푸시는 알림 설정에서 켤 수 있어요.</p>
    </Modal>
  );
}
