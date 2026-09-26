// A bed that repeats without a seam in it.
//
// THE PROBLEM, stated once. `el.loop = true` restarts the file at sample zero,
// and a generated clip's two ends do not meet: there is the mp3 encoder's own
// inserted silence at the head and partial frame at the tail (`loop` trims
// neither — this is the gap everyone hears and blames on the recording), and
// on top of that the generator's own shape. The wind clip's last quarter-second
// is a gust six dB over the body of it. The grass clip fades in from −44 dBFS
// and out to −64. Repeat either whole and you hear the clip END, every cycle,
// which is worse than having no wind at all.
//
// THE FIX, in two grades, because they cost different amounts of decoder:
//
//   CROSSFADE (two elements). The follower is started at the window's in-point
//   a beat before the leader reaches its out-point, and the two are equal-power
//   crossfaded across that beat; then they swap roles. The splice is spread
//   over 300 ms of two different moments of the same recording, which is
//   inaudible. Costs a second decoder for as long as the bed is up.
//
//   SPLICE (one element). At the out-point the playhead jumps back to the
//   in-point. There is still a step, but the window was chosen so the two ends
//   measure within a couple of dB of each other, and on broadband material —
//   wind, wheels, distant air, which is all of them — a 2 dB step is not a
//   seam, it is weather.
//
// Phones get the splice, desktops get the crossfade. Both grades read the same
// from outside; only the element count differs, and that is the point.
//
// Neither grade uses `el.loop`. Whoever reads this graph live will see
// `loop === false` on every bed and a `currentTime` that never leaves the
// window in `catalog.ts` — that is the invariant.

import type { LoopClip } from "./catalog";
import { dead, makeAudio, seek, start } from "./element";

export interface LoopOptions {
  /** `data-sound` on the elements, so the live graph names itself. */
  name: string;
  /** Rate rides speed as PITCH. False for anything musical. */
  pitched?: boolean;
  /**
   * Seconds of overlap at the splice. 0 selects the one-element grade — the
   * phone tier's setting, and the setting for anything whose ends already
   * measure within a dB.
   */
  crossfade: number;
}

/**
 * How close to the out-point a splice may be scheduled. Below this the tick
 * that would have scheduled it can be skipped by one long frame and the leader
 * runs off the end of the file instead.
 */
const MIN_LEAD = 0.08;

export class ManagedLoop {
  private clip: LoopClip;
  private opts: LoopOptions;
  /** The element currently carrying the bed. Built on first use, never at boot. */
  private lead: HTMLAudioElement | null = null;
  /** Its crossfade partner. Built on the first approach to the out-point, which
   *  on the music tracks is a minute and a half into the session — long past
   *  the boot window where a phone actually gets killed. */
  private partner: HTMLAudioElement | null = null;
  /** Mixed level, before the crossfade split. Smoothed by `ride`. */
  private level = 0;
  /**
   * A multiplier applied on top of `level` WITHOUT being smoothed — how the
   * moment ducks get out of the way instantly instead of being swallowed by
   * the bed's own ramp. Measured before this existed: a bail asked the music
   * for a 7.5 dB dip and, filtered through a half-second time constant, the
   * music gave it 1.8 dB and started recovering before it ever arrived. The
   * envelope on the other end of this is already shaped (attack, hold,
   * release); smoothing it twice is what killed it.
   */
  private duck = 1;
  private rate = 1;
  /** Position through the splice, 0 = no splice in progress. */
  private xf = 0;
  private running = false;

  constructor(clip: LoopClip, opts: LoopOptions) {
    this.clip = clip;
    this.opts = opts;
  }

  /** Whether any of this bed's elements exist yet. */
  get built(): boolean {
    return this.lead !== null;
  }

  /** Where the mix currently has it, 0–1. The elements carry the split. */
  get gain(): number {
    return this.level;
  }

  /**
   * Close `k` of the gap to `volume` this frame, and ride the rate with it.
   * `duck` is applied straight through — see the field.
   *
   * It starts itself the first time it is asked for volume and pauses again
   * once it has faded all the way out — a decoder running under a silent
   * element is battery a phone does not have. Resuming keeps the playhead where
   * it stopped, so nothing clicks.
   *
   * The park test below reads the SMOOTHED level, never the ducked one: a bail
   * that took the music to a fifth of its volume must not be read as "this bed
   * is finished" and stop the track.
   */
  ride(volume: number, rate: number, k: number, duck = 1): void {
    this.level += (volume - this.level) * k;
    this.duck = duck;
    this.rate = rate;
    // Inaudible AND not on its way up: park the decoder. The second half of
    // that test matters — a bed climbing from nothing toward a quiet target
    // would otherwise be reset to zero every frame and never arrive.
    if (this.level < 0.002 && volume <= this.level) {
      this.silence();
      return;
    }
    this.resume();
    this.apply();
  }

  /** Fade toward silence without touching the pitch — the tail keeps its speed. */
  fade(k: number): void {
    this.ride(0, this.rate, k);
  }

  silence(): void {
    this.level = 0;
    this.xf = 0;
    if (!this.running) return;
    this.running = false;
    for (const el of [this.lead, this.partner]) {
      if (!el) continue;
      el.volume = 0;
      el.pause();
    }
  }

  /**
   * The splice scheduler. Driven by the mixer's own heartbeat rather than the
   * render frame, because a bed has to keep looping while the game is paused
   * (the music does) and because a fixed-period tick makes the crossfade's own
   * ramp frame-rate independent.
   */
  tick(dt: number): void {
    const lead = this.lead;
    if (!this.running || !lead || dead.has(lead)) return;

    // Mid-splice: ramp across, then hand over.
    if (this.xf > 0 && this.partner) {
      this.xf += dt / this.opts.crossfade;
      if (this.xf >= 1) {
        lead.pause();
        // Zeroed on the way out so a paused element never sits in the graph
        // carrying the level it had when it stopped being audible.
        lead.volume = 0;
        this.lead = this.partner;
        this.partner = lead;
        this.xf = 0;
      }
      this.apply();
      return;
    }

    // A tab that slept, or media that ran past the window while the tick was
    // throttled: put it back inside rather than letting the file end.
    if (lead.ended) {
      seek(lead, this.clip.start);
      start(lead);
      return;
    }

    const t = lead.currentTime;
    if (t < this.clip.start - 0.5) {
      // Something outside this class moved the playhead (a `src` reload, a
      // browser restoring state). Snap it back into the window.
      seek(lead, this.clip.start);
      return;
    }

    const xfLen = this.opts.crossfade;
    if (xfLen < MIN_LEAD) {
      if (t >= this.clip.end) seek(lead, this.clip.start);
      return;
    }

    // Time until the out-point AT THE CURRENT PITCH — a bed at rate 1.4 eats
    // the lead-in 40% faster, and scheduling on wall-clock seconds would let
    // fast wheels run off the end of the window.
    const remaining = (this.clip.end - t) / Math.max(0.25, lead.playbackRate);
    if (remaining > xfLen) return;

    const partner = this.makePartner();
    if (!partner) {
      if (t >= this.clip.end) seek(lead, this.clip.start);
      return;
    }
    seek(partner, this.clip.start);
    partner.playbackRate = lead.playbackRate;
    partner.volume = 0;
    start(partner);
    // Non-zero so the branch above owns the next tick; the audible ramp starts
    // from silence regardless, because `apply` weights by sqrt(xf).
    this.xf = 1e-4;
    this.apply();
  }

  private resume(): void {
    const lead = this.makeLead();
    if (!lead || this.running) return;
    this.running = true;
    if (lead.currentTime < this.clip.start || lead.currentTime > this.clip.end) {
      seek(lead, this.clip.start);
    }
    start(lead);
  }

  private apply(): void {
    const lead = this.lead;
    if (!lead) return;
    const v = Math.min(1, Math.max(0, this.level * this.duck));
    // EQUAL POWER, not equal gain. The two elements are the same recording at
    // different offsets, i.e. uncorrelated material — summing two uncorrelated
    // sources at half amplitude each is 3 dB DOWN, so a linear crossfade digs a
    // hole in the middle of the splice and you hear the hole instead of the
    // seam you removed.
    const x = this.xf;
    lead.volume = x > 0 ? v * Math.sqrt(1 - x) : v;
    lead.playbackRate = this.rate;
    const partner = this.partner;
    if (partner && x > 0 && !dead.has(partner)) {
      partner.volume = v * Math.sqrt(x);
      partner.playbackRate = this.rate;
    }
  }

  private makeLead(): HTMLAudioElement | null {
    if (!this.lead) {
      this.lead = makeAudio(this.clip.url, this.opts.name, this.opts.pitched ?? false);
      this.lead.loop = false; // the window is ours, not the browser's
      this.lead.volume = 0;
      seek(this.lead, this.clip.start);
    }
    return dead.has(this.lead) ? null : this.lead;
  }

  private makePartner(): HTMLAudioElement | null {
    if (!this.partner) {
      this.partner = makeAudio(this.clip.url, `${this.opts.name}-b`, this.opts.pitched ?? false);
      this.partner.loop = false;
      this.partner.volume = 0;
    }
    return dead.has(this.partner) ? null : this.partner;
  }
}
