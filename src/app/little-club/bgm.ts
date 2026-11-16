/**
 * THE LITTLE CLUB background music: the club's own original 8-bit soundtrack
 * ("The Little Club OST", phase 1 loops), one track per scene:
 *   indoor (day)    The Little Room
 *   indoor (night)  After Midnight
 *   outdoor         Campfire Static + the campfire ambience as its own quieter layer
 *
 * Off until the member turns it on (a tap is needed to start audio anyway).
 * Tracks cross-fade through Web Audio gains (iOS ignores <audio>.volume), every
 * element is unlocked during that first tap so later scene changes may start it.
 * It goes quiet while AFTER HOURS RADIO plays and while the tab is hidden.
 */

export type BgmTrack = "room" | "midnight" | "campfire";

export const BGM_TITLES: Record<BgmTrack, string> = {
  room: "The Little Room",
  midnight: "After Midnight",
  campfire: "Campfire Static",
};

const SRC: Record<BgmTrack | "ambience", string> = {
  room: "/little-club/audio/the-little-room.mp3",
  midnight: "/little-club/audio/after-midnight.mp3",
  campfire: "/little-club/audio/campfire-static.mp3",
  ambience: "/little-club/audio/campfire.mp3",
};

const FADE = 1.2; // seconds
const AMBIENCE_LEVEL = 0.55; // relative to the music volume

type Key = BgmTrack | "ambience";

interface Voice {
  el: HTMLAudioElement;
  gain: GainNode | null;
  stopTimer: number | null;
}

export class ClubBgm {
  private ctx: AudioContext | null = null;
  private voices = new Map<Key, Voice>();
  private track: BgmTrack | null = null;
  private ambience = false;
  private quiet = false;
  private volume = 0.6;
  private started = false;

  /** Call from the tap that turns the music on. */
  async start(track: BgmTrack, ambience: boolean) {
    if (!this.ctx) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        this.ctx = Ctx ? new Ctx() : null;
      } catch {
        this.ctx = null;
      }
    }
    try {
      await this.ctx?.resume();
    } catch {}
    // Unlock every element inside this gesture (play → pause), so later scene changes can start them.
    for (const key of Object.keys(SRC) as Key[]) {
      const v = this.voice(key);
      const wanted = key === track || (key === "ambience" && ambience);
      v.el.play().then(
        () => {
          if (!wanted && !this.isWanted(key)) v.el.pause();
        },
        () => {},
      );
    }
    this.started = true;
    this.set(track, ambience);
  }

  /** The scene's track (null = silence). */
  set(track: BgmTrack | null, ambience: boolean) {
    this.track = track;
    this.ambience = ambience;
    if (this.started) this.apply();
  }

  /** Quiet while the radio plays or the page is hidden. */
  setQuiet(quiet: boolean) {
    if (this.quiet === quiet) return;
    this.quiet = quiet;
    if (this.started) this.apply();
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.started) this.apply(0.15);
  }

  stop() {
    this.track = null;
    this.ambience = false;
    if (this.started) this.apply();
  }

  dispose() {
    for (const v of this.voices.values()) {
      if (v.stopTimer) window.clearTimeout(v.stopTimer);
      v.el.pause();
      v.el.removeAttribute("src");
      v.el.load();
    }
    this.voices.clear();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.started = false;
  }

  private isWanted(key: Key): boolean {
    if (this.quiet) return false;
    return key === "ambience" ? this.ambience && this.track !== null : key === this.track;
  }

  private voice(key: Key): Voice {
    let v = this.voices.get(key);
    if (v) return v;
    const el = new Audio(SRC[key]);
    el.loop = true;
    el.preload = "auto";
    let gain: GainNode | null = null;
    if (this.ctx) {
      try {
        const source = this.ctx.createMediaElementSource(el);
        gain = this.ctx.createGain();
        gain.gain.value = 0;
        source.connect(gain).connect(this.ctx.destination);
      } catch {
        gain = null;
      }
    }
    if (!gain) el.volume = 0;
    v = { el, gain, stopTimer: null };
    this.voices.set(key, v);
    return v;
  }

  private apply(fade = FADE) {
    for (const key of Object.keys(SRC) as Key[]) {
      const wanted = this.isWanted(key);
      const level = wanted ? this.volume * (key === "ambience" ? AMBIENCE_LEVEL : 1) : 0;
      if (!wanted && !this.voices.has(key)) continue;
      const v = this.voice(key);
      if (v.stopTimer) {
        window.clearTimeout(v.stopTimer);
        v.stopTimer = null;
      }
      if (wanted && v.el.paused) v.el.play().catch(() => {});
      if (v.gain && this.ctx) {
        const now = this.ctx.currentTime;
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(level, now + fade);
      } else {
        v.el.volume = level; // no Web Audio: no fade
      }
      if (!wanted) v.stopTimer = window.setTimeout(() => v.el.pause(), fade * 1000 + 50);
    }
  }
}
