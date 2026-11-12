"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, buttonPrimary, buttonSecondary, cn } from "@/components/ui";
import { ARTIST_MAX, DISPLAY_NAME_MAX, MESSAGE_MAX, TITLE_MAX, youtubeVideoId, type RadioState, type RadioTrack } from "@/lib/radio";
import { loadYouTube, YT_STATE, type YTPlayer } from "@/lib/youtube-player";
import { addTrack, deleteTrack, lookupTrack, type LookupResult } from "./actions";

const SAVED_KEY = "acm:radio:current";
const SHUFFLE_KEY = "acm:radio:shuffle";
const POLL_MS = 20_000;
const dotted = (key: string) => key.replace(/-/g, ".");
type Notice = { text: string; url?: string } | null;

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * AFTER HOURS RADIO. The list is the main thing: everyone can browse it, signed-in
 * members add to it, admins remove from it. The player (when the crew has turned it
 * on) plays the list in order on whatever device opens the page — at the clubhouse,
 * one shared device. Nothing here controls another person's player.
 */
export function RadioStation({ initial }: { initial: RadioState }) {
  const [state, setState] = useState(initial);
  const tracks = state.tracks;
  const [currentId, setCurrentId] = useState<string | null>(initial.tracks[0]?.id ?? null);
  const [playing, setPlaying] = useState(false);
  const [repeatOne, setRepeatOne] = useState(false);
  // Shuffle: every track once in a random order (queue), then a new round. `history` lets ⏮ go back.
  const [shuffle, setShuffle] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const history = useRef<string[]>([]);
  const [playerReady, setPlayerReady] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const found = tracks.findIndex((t) => t.id === currentId);
  const index = found === -1 ? 0 : found;
  const current = tracks[index] ?? null;

  const playerRef = useRef<YTPlayer | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const errorsInRow = useRef(0);
  // Latest values for the YouTube callbacks and the poller (they outlive renders).
  const live = useRef({ state, index, currentId, playing, repeatOne, shuffle, queue });
  useEffect(() => {
    live.current = { state, index, currentId, playing, repeatOne, shuffle, queue };
  });

  const setQueueNow = useCallback((next: string[]) => {
    live.current.queue = next;
    setQueue(next);
  }, []);

  const play = useCallback((id: string, autoplay: boolean) => {
    const track = live.current.state.tracks.find((t) => t.id === id);
    if (!track) return;
    setCurrentId(id);
    live.current.currentId = id;
    try {
      localStorage.setItem(SAVED_KEY, id);
    } catch {}
    const player = playerRef.current;
    if (!player) return;
    if (autoplay) player.loadVideoById(track.videoId);
    else player.cueVideoById(track.videoId);
  }, []);

  /** A track picked by hand: in shuffle it leaves the queue and the one before it is remembered for ⏮. */
  const pick = useCallback(
    (id: string) => {
      const { shuffle: on, currentId: cur, queue: q } = live.current;
      if (on) {
        if (cur && cur !== id) history.current.push(cur);
        setQueueNow(q.filter((x) => x !== id));
      }
      play(id, true);
    },
    [play, setQueueNow],
  );

  const step = useCallback(
    (delta: number) => {
      const { state: s, index: i, shuffle: on, queue: q, currentId: cur } = live.current;
      if (!s.tracks.length) return;
      const exists = (id: string) => s.tracks.some((t) => t.id === id);
      if (on && delta > 0) {
        let upcoming = q.filter(exists);
        if (!upcoming.length) upcoming = shuffled(s.tracks.map((t) => t.id).filter((id) => id !== cur)); // a new round
        if (!upcoming.length) return play(cur ?? s.tracks[0].id, true);
        const [nextId, ...rest] = upcoming;
        if (cur) history.current.push(cur);
        setQueueNow(rest);
        return play(nextId, true);
      }
      if (on && delta < 0) {
        let back = history.current.pop();
        while (back && !exists(back)) back = history.current.pop();
        if (back) {
          if (cur) setQueueNow([cur, ...q]);
          return play(back, true);
        }
      }
      play(s.tracks[(i + delta + s.tracks.length) % s.tracks.length].id, true);
    },
    [play, setQueueNow],
  );

  function toggleShuffle() {
    const on = !live.current.shuffle;
    setShuffle(on);
    live.current.shuffle = on;
    history.current = [];
    setQueueNow(on ? shuffled(live.current.state.tracks.map((t) => t.id).filter((id) => id !== live.current.currentId)) : []);
    try {
      localStorage.setItem(SHUFFLE_KEY, on ? "1" : "0");
    } catch {}
  }

  /** New list from the server or a local change. If the track on air was removed, the next one takes over. */
  const applyState = useCallback(
    (next: RadioState) => {
      const { state: before, currentId: cur, playing: wasPlaying, shuffle: on, queue: q } = live.current;
      live.current.state = next;
      setState(next);
      if (on) {
        // Newly added tracks join the current shuffle round at random spots; removed ones leave it.
        const known = new Set(before.tracks.map((t) => t.id));
        const upcoming = q.filter((id) => next.tracks.some((t) => t.id === id));
        for (const t of next.tracks) {
          if (!known.has(t.id)) upcoming.splice(Math.floor(Math.random() * (upcoming.length + 1)), 0, t.id);
        }
        setQueueNow(upcoming);
      }
      if (cur && !next.tracks.some((t) => t.id === cur) && next.tracks.length) {
        if (on && live.current.queue.length) {
          const [nextId, ...rest] = live.current.queue;
          setQueueNow(rest);
          play(nextId, wasPlaying);
        } else {
          const oldIndex = Math.max(0, before.tracks.findIndex((t) => t.id === cur));
          play(next.tracks[Math.min(oldIndex, next.tracks.length - 1)].id, wasPlaying);
        }
        if (wasPlaying) setNotice({ text: "지금 곡이 목록에서 삭제돼서 다음 곡으로 넘어갔어요." });
      }
    },
    [play, setQueueNow],
  );

  // YouTube player events, always seeing the latest state.
  const handlers = useRef<{ state: (s: number) => void; error: (code: number) => void }>({ state: () => {}, error: () => {} });
  useEffect(() => {
    handlers.current = {
      state: (s) => {
        if (s === YT_STATE.PLAYING) {
          errorsInRow.current = 0;
          setPlaying(true);
        } else if (s === YT_STATE.PAUSED) setPlaying(false);
        else if (s === YT_STATE.ENDED) {
          if (live.current.repeatOne) {
            playerRef.current?.seekTo(0, true);
            playerRef.current?.playVideo();
          } else step(1);
        }
      },
      error: () => {
        const { state: s, index: i } = live.current;
        const track = s.tracks[i];
        errorsInRow.current += 1;
        if (errorsInRow.current >= s.tracks.length) {
          setPlaying(false);
          setNotice({ text: "지금은 재생할 수 있는 곡이 없어요. 곡마다 있는 YouTube 링크로 들어 주세요." });
          return;
        }
        setNotice({ text: `‘${track?.title ?? "이 곡"}’은 여기서 재생할 수 없어서 다음 곡으로 넘어가요.`, url: track?.url });
        setTimeout(() => step(1), 2500);
      },
    };
  });

  // The player (only when the crew turned it on). Resumes where this device left off, without autoplay.
  useEffect(() => {
    if (!state.playerEnabled) return;
    let cancelled = false;
    let player: YTPlayer | null = null;
    loadYouTube()
      .then((YT) => {
        const host = hostRef.current;
        if (cancelled || !host) return;
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(SAVED_KEY);
        } catch {}
        const list = live.current.state.tracks;
        const start = list.find((t) => t.id === saved) ?? list[live.current.index] ?? list[0];
        if (start) {
          setCurrentId(start.id);
          live.current.currentId = start.id;
        }
        let shuffleOn = false;
        try {
          shuffleOn = localStorage.getItem(SHUFFLE_KEY) === "1";
        } catch {}
        if (shuffleOn) {
          setShuffle(true);
          live.current.shuffle = true;
          setQueueNow(shuffled(list.map((t) => t.id).filter((id) => id !== start?.id)));
        }
        // The API replaces the element it is given, so it gets its own child (React keeps `host`).
        const mount = document.createElement("div");
        host.replaceChildren(mount);
        player = new YT.Player(mount, {
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          videoId: start?.videoId,
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: () => {
              playerRef.current = player;
              setPlayerReady(true);
            },
            onStateChange: (e) => handlers.current.state(e.data),
            onError: (e) => handlers.current.error(e.data),
          },
        });
      })
      .catch(() => {
        if (!cancelled) setNotice({ text: "YouTube 플레이어를 불러오지 못했어요. 곡마다 있는 YouTube 링크로 들어 주세요." });
      });
    return () => {
      cancelled = true;
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {}
    };
  }, [state.playerEnabled, setQueueNow]);

  // Keep the list fresh (~20 s). A new request never interrupts the song on air.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden && !live.current.playing) return;
      try {
        const res = await fetch("/api/radio", { cache: "no-store" });
        if (res.ok) applyState((await res.json()) as RadioState);
      } catch {}
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [applyState]);

  function onAdded(track: RadioTrack) {
    const s = live.current.state;
    if (s.tracks.some((t) => t.id === track.id)) return;
    applyState({ ...s, tracks: [...s.tracks, track] });
  }

  async function onDelete(track: RadioTrack) {
    if (!window.confirm(`‘${track.title}’을(를) 라디오에서 삭제할까요?\n목록과 재생 순서에서 빠지고, 기록은 시트에 남아요.`)) return;
    const result = await deleteTrack(track.id);
    if (!result.ok) {
      setNotice({ text: result.message });
      return;
    }
    const s = live.current.state;
    applyState({ ...s, tracks: s.tracks.filter((t) => t.id !== track.id) });
  }

  const upNext = shuffle
    ? queue.map((id) => tracks.find((t) => t.id === id)).filter((t): t is RadioTrack => Boolean(t)).slice(0, 4)
    : tracks.length > 1
      ? Array.from({ length: Math.min(4, tracks.length - 1) }, (_, k) => tracks[(index + 1 + k) % tracks.length])
      : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 pb-20 md:px-6">
      {!state.ready && (
        <p className="rounded-lg border border-butter/50 px-4 py-3 text-[14px] leading-relaxed text-cream/85">
          라디오를 준비하고 있어요. 곧 열려요.
          {state.canDelete && (
            <span className="mt-1 block text-[13px] text-butter">
              운영진 안내: Apps Script에서 setupSheets를 실행한 뒤 기존 배포를 새 버전으로 배포하면 열려요.
            </span>
          )}
        </p>
      )}

      {state.ready && <AddTrack state={state} onAdded={onAdded} />}

      {state.ready && (
        <section aria-labelledby="onair-title">
          <SectionLabel id="onair-title" eyebrow="Now playing" title={state.playerEnabled ? "On air" : "On air soon"} />
          <div className="mt-4 rounded-xl border border-cream/15 bg-white/[0.04] p-4 md:p-5">
            <Tuner index={index} count={tracks.length} />
            {current ? (
              <div className="mt-4">
                <p className="text-[20px] font-extrabold leading-snug text-cream">{current.title}</p>
                <p className="text-[14px] text-cream/75">{current.artist}</p>
                <Requester track={current} className="mt-1" />
              </div>
            ) : (
              <p className="mt-4 text-[14px] text-cream/70">아직 목록에 곡이 없어요.</p>
            )}

            {state.playerEnabled ? (
              <>
                <div className="mt-4 aspect-video w-full overflow-hidden rounded-md bg-black">
                  <div ref={hostRef} className="h-full w-full" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <ControlButton label="이전 곡" onClick={() => step(-1)} disabled={!playerReady || tracks.length < 2}>
                    <path d="M6 5h2v14H6zM20 5v14L9 12z" />
                  </ControlButton>
                  <button
                    type="button"
                    onClick={() => (playing ? playerRef.current?.pauseVideo() : playerRef.current?.playVideo())}
                    disabled={!playerReady || !current}
                    className={cn(buttonPrimary, "h-12 min-w-[132px] disabled:opacity-50")}
                  >
                    {playing ? "Pause" : "Play"}
                  </button>
                  <ControlButton label="다음 곡" onClick={() => step(1)} disabled={!playerReady || tracks.length < 2}>
                    <path d="M16 5h2v14h-2zM4 5l11 7-11 7z" />
                  </ControlButton>
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      aria-pressed={shuffle}
                      onClick={toggleShuffle}
                      className={cn(
                        "h-11 rounded-md border px-3 font-label text-[11px] font-semibold uppercase tracking-[0.16em]",
                        shuffle ? "border-butter bg-butter text-midnight" : "border-cream/30 text-cream hover:border-cream",
                      )}
                    >
                      {shuffle ? "셔플 켜짐" : "셔플"}
                    </button>
                    <button
                      type="button"
                      aria-pressed={repeatOne}
                      onClick={() => setRepeatOne((v) => !v)}
                      className="h-11 rounded-md border border-cream/30 px-3 font-label text-[11px] font-semibold uppercase tracking-[0.16em] text-cream hover:border-cream"
                    >
                      {repeatOne ? "반복: 한 곡" : "반복: 전체"}
                    </button>
                  </div>
                </div>
                {!playerReady && <p className="mt-2 text-[12px] text-cream/60">플레이어를 불러오는 중…</p>}
              </>
            ) : (
              <p className="mt-4 rounded-md border border-dashed border-cream/30 px-3 py-3 text-[13px] leading-relaxed text-cream/80">
                아지트 플레이어는 음악 이용 권한을 확인한 뒤 운영진이 켜요. 그 전에는 곡마다 있는 YouTube 링크로 들어 주세요.
                {state.canDelete && <span className="mt-1 block text-butter">운영진 안내: 시트 Settings 탭의 radio_player를 on으로 바꾸면 켜져요.</span>}
              </p>
            )}
            <div aria-live="polite" className="empty:hidden">
              {notice && (
                <p className="mt-3 text-[13px] text-butter">
                  {notice.text}{" "}
                  {notice.url && (
                    <a href={notice.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                      YouTube에서 열기
                    </a>
                  )}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {state.ready && state.playerEnabled && upNext.length > 0 && (
        <section aria-labelledby="next-title">
          <SectionLabel id="next-title" eyebrow={shuffle ? "Up next · shuffle" : "Up next"} title="다음 곡" />
          <ol className="mt-4 flex flex-col gap-1.5">
            {upNext.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => pick(t.id)}
                  disabled={!playerReady}
                  className="flex w-full items-baseline gap-3 rounded-md px-3 py-2.5 text-left hover:bg-white/[0.06] disabled:cursor-default"
                >
                  <span className="w-7 shrink-0 font-mono text-[12px] text-cream/50">{String(tracks.indexOf(t) + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-cream">{t.title}</span>
                    <span className="block truncate text-[13px] text-cream/65">{t.artist}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {state.ready && (
        <section aria-labelledby="all-title">
          <div className="flex items-end justify-between gap-3">
            <SectionLabel id="all-title" eyebrow="All tracks" title={`전체 ${tracks.length}곡`} />
            {state.canDelete && (
              <Link href="/admin/radio" className="mb-1 font-label text-[11px] font-semibold uppercase tracking-[0.16em] text-butter underline underline-offset-4">
                트랙 관리
              </Link>
            )}
          </div>
          <ol className="mt-4 flex flex-col gap-2">
            {tracks.map((t, i) => {
              const onAir = t.id === current?.id && state.playerEnabled;
              return (
                <li key={t.id} className={cn("flex gap-3 rounded-lg px-3 py-3", onAir ? "bg-butter/15 ring-1 ring-butter/60" : "bg-white/[0.04]")}>
                  <span className="w-7 shrink-0 pt-0.5 font-mono text-[12px] text-cream/50">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[15px] font-bold text-cream">
                      {t.title}
                      {onAir && (
                        <span className="ml-2 rounded-sm bg-butter px-1.5 py-0.5 align-middle font-label text-[10px] font-semibold uppercase tracking-[0.16em] text-midnight">
                          On air
                        </span>
                      )}
                    </p>
                    <p className="break-words text-[13px] text-cream/70">{t.artist}</p>
                    <Requester track={t} className="mt-1" />
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {state.playerEnabled && (
                        <button
                          type="button"
                          onClick={() => pick(t.id)}
                          disabled={!playerReady}
                          className="inline-flex h-9 items-center font-label text-[11px] font-semibold uppercase tracking-[0.16em] text-butter disabled:opacity-40"
                        >
                          ▶ Play
                        </button>
                      )}
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-1 font-label text-[11px] font-semibold uppercase tracking-[0.16em] text-cream/80 hover:text-cream"
                      >
                        YouTube <ArrowUpRight className="size-3" />
                        <span className="sr-only">(새 창에서 {t.title} 열기)</span>
                      </a>
                      {state.canDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete(t)}
                          className="inline-flex h-9 items-center font-label text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e9a27a] hover:text-[#f3c1a3]"
                        >
                          Delete track
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function SectionLabel({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-butter">{eyebrow}</p>
      <h2 id={id} className="mt-1 font-display text-[30px] font-extrabold uppercase leading-none text-cream">
        {title}
      </h2>
    </div>
  );
}

function Requester({ track, className }: { track: RadioTrack; className?: string }) {
  const who = track.displayName ?? (track.source === "seed" ? "AFTER CL TO MOON" : "멤버 신청");
  return (
    <div className={className}>
      <p className="text-[12px] text-cream/55">
        {who}
        {track.source === "member" && track.createdAt && <span className="font-mono"> · {dotted(track.createdAt)}</span>}
      </p>
      {track.message && <p className="mt-1 break-words text-[13px] leading-relaxed text-cream/85">“{track.message}”</p>}
    </div>
  );
}

/** An analog tuner dial; the butter needle moves along the list as songs go by. */
function Tuner({ index, count }: { index: number; count: number }) {
  const pos = count > 1 ? index / (count - 1) : 0;
  const freq = (88 + pos * 20).toFixed(1);
  return (
    <div aria-hidden="true">
      <div className="flex items-baseline justify-between font-mono text-[11px] text-cream/60">
        <span>FM {freq}</span>
        <span>
          {count ? String(index + 1).padStart(2, "0") : "00"} / {String(count).padStart(2, "0")}
        </span>
      </div>
      <div
        className="relative mt-1.5 h-12 overflow-hidden rounded-md border border-cream/20 bg-midnight"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(244,231,207,0.35) 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, rgba(244,231,207,0.6) 0 1px, transparent 1px 60px)",
          backgroundSize: "100% 40%, 100% 65%",
          backgroundPosition: "0 100%, 0 100%",
          backgroundRepeat: "repeat-x",
        }}
      >
        <div className="absolute inset-x-3 top-1.5 flex justify-between font-mono text-[9px] text-cream/50">
          {[88, 92, 96, 100, 104, 108].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        <div
          className="absolute inset-y-1 w-[3px] rounded-full bg-butter shadow-[0_0_10px_rgba(237,195,96,0.8)] transition-[left] duration-700"
          style={{ left: `calc(${(pos * 100).toFixed(2)}% * 0.96 + 2%)` }}
        />
      </div>
    </div>
  );
}

function ControlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-12 place-items-center rounded-md border border-cream/30 text-cream hover:border-cream disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

const field =
  "block w-full rounded-md border-2 border-midnight/25 bg-white/70 px-3 py-2.5 text-[16px] text-midnight focus:border-midnight focus:outline-none";

/** ADD A TRACK: paste a YouTube link → title/artist filled in (editable) → optional one-line story → ADD TO RADIO. */
function AddTrack({ state, onAdded }: { state: RadioState; onAdded: (track: RadioTrack) => void }) {
  const [url, setUrl] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [looking, setLooking] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [message, setMessage] = useState("");
  const [displayName, setDisplayName] = useState(state.myName ?? "");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = useRef("");
  const videoId = youtubeVideoId(url);

  function changeUrl(value: string) {
    setUrl(value);
    latest.current = value;
    setResult(null);
    const id = youtubeVideoId(value);
    if (!id) {
      setLookup(null);
      return;
    }
    if (lookup?.ok && lookup.videoId === id) return;
    setLooking(true);
    lookupTrack(value)
      .then((r) => {
        if (youtubeVideoId(latest.current) !== id) return;
        setLookup(r);
        if (r.ok) {
          setTitle(r.title);
          setArtist(r.artist);
        }
      })
      .catch(() => setLookup({ ok: true, videoId: id, title: "", artist: "", playable: true, duplicate: null }))
      .finally(() => setLooking(false));
  }

  async function paste() {
    try {
      changeUrl((await navigator.clipboard.readText()).trim());
    } catch {
      document.getElementById("track-url")?.focus();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const r = await addTrack({ url, title, artist, message, displayName });
      if (r.ok) {
        onAdded(r.track);
        setResult({ ok: true, text: `목록 맨 끝, ${r.position}번째 곡으로 추가했어요. 지금 나오는 곡은 그대로 이어져요.` });
        setUrl("");
        latest.current = "";
        setLookup(null);
        setTitle("");
        setArtist("");
        setMessage("");
      } else setResult({ ok: false, text: r.message });
    });
  }

  return (
    <section aria-labelledby="add-title" className="rounded-xl border-2 border-midnight bg-ivory p-4 text-midnight shadow-[4px_4px_0_0_var(--color-butter)] md:p-5">
      <p className="font-label text-[11px] font-semibold uppercase tracking-[0.28em] text-brown">Add a track</p>
      <h2 id="add-title" className="mt-1 text-[19px] font-extrabold">
        듣고 싶은 곡을 보태 주세요
      </h2>

      {!state.signedIn ? (
        <div className="mt-3">
          <p className="text-[14px] leading-relaxed text-ink-soft">로그인한 멤버는 YouTube 링크로 곡을 신청할 수 있어요. 신청하면 바로 목록 끝에 추가돼요.</p>
          <Link href="/login?returnTo=/radio" className={cn(buttonPrimary, "mt-3 w-full sm:w-auto")}>
            Log in to add a track
          </Link>
        </div>
      ) : !state.canAdd ? (
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
          곡 신청은 클럽 회원만 할 수 있어요.{" "}
          <Link href="/me" className="font-semibold text-midnight underline underline-offset-4">
            회원권 신청하기
          </Link>
        </p>
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
          <div>
            <label htmlFor="track-url" className="text-[13px] font-semibold">
              YouTube 링크
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="track-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                required
                placeholder="https://youtu.be/…"
                value={url}
                onChange={(e) => changeUrl(e.target.value)}
                className={field}
              />
              <button type="button" onClick={paste} className={cn(buttonSecondary, "h-auto shrink-0 px-3 text-[12px]")}>
                붙여넣기
              </button>
            </div>
            {url && !videoId && <p className="mt-1 text-[12px] text-brown">YouTube 영상 링크(youtube.com/watch?v=… 또는 youtu.be/…)를 넣어 주세요.</p>}
            {looking && <p className="mt-1 text-[12px] text-ink-soft">곡 정보를 찾는 중…</p>}
            {lookup && !lookup.ok && <p className="mt-1 text-[12px] font-medium text-brown">{lookup.message}</p>}
          </div>

          {videoId && lookup?.ok && (
            <>
              <div className="flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail for the pasted link */}
                <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" width={120} height={68} className="h-[68px] w-[120px] shrink-0 rounded object-cover" />
                <p className="text-[13px] leading-relaxed text-ink-soft">
                  {lookup.duplicate ? (
                    <span className="font-semibold text-brown">이미 목록에 있는 곡이에요: {lookup.duplicate}</span>
                  ) : lookup.title ? (
                    "곡명과 아티스트가 맞는지 확인해 주세요. 틀리면 고쳐서 보내면 돼요."
                  ) : (
                    "곡 정보를 가져오지 못했어요. 곡명과 아티스트를 직접 적어 주세요."
                  )}
                  {!lookup.playable && <span className="mt-1 block">이 영상은 다른 사이트 재생이 막혀 있어서 플레이어에서는 건너뛰고, YouTube 링크로만 들을 수 있어요.</span>}
                </p>
              </div>
              {!lookup.duplicate && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-[13px] font-semibold">
                      곡명
                      <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={TITLE_MAX} className={cn(field, "mt-1")} />
                    </label>
                    <label className="text-[13px] font-semibold">
                      아티스트
                      <input value={artist} onChange={(e) => setArtist(e.target.value)} required maxLength={ARTIST_MAX} className={cn(field, "mt-1")} />
                    </label>
                  </div>
                  <label className="text-[13px] font-semibold">
                    이름 <span className="font-normal text-ink-soft">(목록에 신청자로 보여요)</span>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={DISPLAY_NAME_MAX}
                      placeholder={state.myName ?? ""}
                      className={cn(field, "mt-1")}
                    />
                  </label>
                  <label className="text-[13px] font-semibold">
                    메모 · 한 줄 사연 <span className="font-normal text-ink-soft">(선택)</span>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      maxLength={MESSAGE_MAX}
                      rows={2}
                      placeholder="이 곡을 고른 이유나 듣고 싶은 때를 한 줄로"
                      className={cn(field, "mt-1 resize-none")}
                    />
                    <span className="mt-0.5 block text-right font-mono text-[11px] font-normal text-ink-soft">
                      {message.length}/{MESSAGE_MAX}
                    </span>
                  </label>
                  <button type="submit" disabled={pending} className={cn(buttonPrimary, "w-full disabled:opacity-60 sm:w-auto")}>
                    {pending ? "Adding…" : "Add to radio"}
                  </button>
                </>
              )}
            </>
          )}
        </form>
      )}

      <div aria-live="polite" className="empty:hidden">
        {result && <p className={cn("mt-3 text-[14px] font-medium", result.ok ? "text-midnight" : "text-brown")}>{result.text}</p>}
      </div>
    </section>
  );
}
