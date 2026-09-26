// Genex adaptive-quality: the runtime governor (mobile-readiness program).
// Tiers pick the START; the governor owns the RUNTIME knobs forever — phones
// thermally throttle after minutes, so a game that benched fine at 0:30
// degrades at 8:00. Feed it a frame time every frame; wire the callbacks to
// the runtime-changeable knobs only (DPR, post passes, draw distance, frame
// cap — NEVER context-creation flags like antialias, those are fixed).
//
// Step-down ladder on sustained slowness: DPR ×0.8 → shadows reduced →
// DPR ×0.65 → draw distance down → post off → 30fps cap. Step-up is slow
// (hysteresis) and a step whose recovery failed twice is never re-attempted.
// It also self-reports renderer.info counts and the rung it is standing on to
// window.__GENEX_QUALITY__ — the crash watchdog attaches them to its beacons,
// which is how the field data that calibrates the whole program gets its
// memory signal.
//
// THREE THINGS WERE MEASURED AND FIXED HERE, in a 2026-07-29 session driving
// the real game in a real Chrome on an M2 Max (see DESIGN.md):
//
// 1. THE BUDGET SAT INSIDE THE VSYNC DEAD ZONE. It was `1000/60 + 8` = 24.7 ms,
//    i.e. 40 fps. A display can only hand out WHOLE vsync intervals: at 60 Hz a
//    frame is 16.7 ms or 33.3 ms and never anything between. So a game that
//    misses 60 and paces at a rock-solid 30 reported 33.3 ms — over budget on
//    EVERY SINGLE FRAME — and walked the whole ladder while looking fine. The
//    budget now sits one whole dropped-vsync rung BELOW the target plus slack,
//    so a stable half-rate is not read as failing and only a machine genuinely
//    under ~27 fps is rescued.
//
// 2. ONE FAST FRAME RESET EVERYTHING, so the trigger was a lottery rather than
//    a measurement: a measured run at 38.6 fps never stepped down (its slow
//    frames were interleaved) while a FASTER run at 42.6 fps did (its slow
//    frames happened to cluster). Judging is now an EWMA of the frame time,
//    which a single frame in either direction cannot swing.
//
// 3. THE LADDER WAS SPENT BEFORE GAMEPLAY. The governor judges frames from the
//    first rendered frame — loader, title screen, world mount, shader compiles.
//    Measured: rung 1 fired 2.2 s BEFORE the player clicked DROP IN, so his
//    first sustained-slow stretch in the actual run landed on rung 2. Now there
//    is a warm-up, and one-off hitches (a compile, a texture upload, a tab
//    coming back) are rejected as outliers instead of counted as load.
//
// And one ordering change, which is the player-facing half: POST OFF used to be
// the SECOND thing tried. It is the single most visible thing in the ladder —
// the whole grade, the bloom, the AO and the metering leave at once, which
// reads as "the lighting switched off" — and it was being spent before two
// rungs nobody can see. It is now second from last, and it is skipped outright
// when the player has chosen a graphics preset by hand: a governor may rescue a
// machine, but it may not silently overrule a choice the player made on a
// settings screen.
import type { QualityTier } from './tier.ts';

export interface GovernorCallbacks {
  /** Apply a DPR multiplier (1 = tier cap). E.g. renderer.setPixelRatio(Math.min(realDpr, tier.dprCap * m)). */
  setDprScale?: (multiplier: number) => void;
  /** Toggle the post stack between the tier's level and 'off'. */
  setPostEnabled?: (enabled: boolean) => void;
  /** Reduce shadow quality — 'reduced' = halve the map (realloc) and/or
   *  freeze autoUpdate; 'off' = shadows disabled; 'full' = the tier's budget.
   *  Shadows are one of the two big fixed costs the governor previously
   *  couldn't touch (the other, context MSAA, is unfixable at runtime —
   *  see tier.rendererAntialias). */
  setShadowQuality?: (level: 'full' | 'reduced' | 'off') => void;
  /** Apply a draw-distance multiplier (1 = tier scale). */
  setDrawDistanceScale?: (multiplier: number) => void;
  /** Apply a frame cap (0 = uncapped). Pace to a STABLE 30 over a stuttery 45. */
  setFrameCap?: (fps: number) => void;
}

export interface GovernorOptions {
  /**
   * Read live, not captured: "has the player picked a graphics preset by hand
   * on the settings screen, rather than leaving it on Auto?" When it answers
   * true the post rung is skipped — the governor keeps every rung the player
   * cannot see, and stops short of the one that rewrites the picture he chose.
   * Leave it out (or return false) and the ladder is complete, which is what
   * Auto means and what a phone gets.
   */
  postIsPlayerChoice?: () => boolean;
}

interface RendererInfoLike {
  info?: { memory?: { textures?: number; geometries?: number } };
}

const SLOW_WINDOW_MS = 4000; // sustained, not spikes — shader compiles must not trigger steps
const RECOVER_WINDOW_MS = 20000; // step up slowly (hysteresis)
const MEM_REPORT_MS = 5000;
/**
 * No step-down inside the first few seconds of frames. Boot renders the loader,
 * the title screen and the first frames of the world, and those frames are slow
 * for reasons that have nothing to do with what the machine can sustain —
 * shader compilation, texture upload, the first shadow-map rasterisation. Rung
 * 1 was measured firing 2.2 s before the player had even pressed play.
 */
const WARMUP_MS = 6000;
/**
 * A frame is a HITCH — an asset landing, a shader compiling, a tab restored —
 * rather than evidence of load when it is both long in absolute terms and a
 * wild outlier against its own neighbourhood. Both halves are needed: a machine
 * sitting steadily at 8 fps must still be rescued, and it is, because there its
 * 120 ms frames are not outliers against a 120 ms average.
 */
const HITCH_FLOOR_MS = 80;
const HITCH_RATIO = 3;
/**
 * THE SECOND SIGNAL — the one an average cannot carry.
 *
 * The EWMA above answers "is this machine slow". It cannot answer "is this
 * machine STUTTERING", and on a phone those are different failures with the
 * same name: measured at phone tier, runs whose MEAN frame was 2.1 ms threw
 * single frames of 114.8, 274.0 and 45.8 ms. An average of 2.1 ms is a machine
 * in perfect health; a 274 ms stall is the player's board freezing mid-air.
 * Worse, every one of those frames was DISCARDED as an outlier and used to
 * reset both clocks with it — so a device hitching more often than every 4 s
 * could never accumulate the sustained window a step-down needs, and was
 * measured sitting on rung 'none' with its own average at 13x budget.
 *
 * So hitches are still kept out of the average (they are events, not load), but
 * they are now COUNTED, and enough of them inside one window is a verdict of
 * its own. Deliberately NOT a looser budget and NOT a shorter window: the two
 * constants above and SLOW_WINDOW_MS below record real measurements, and
 * loosening either steps quality down on machines that are fine. This adds a
 * failure the old rule could not see rather than lowering the bar of the one it
 * could.
 *
 * Four qualifying hitches in four seconds is >=320 ms of stall per 4 s window —
 * 8% of wall-clock time spent in frames that are each both over 80 ms AND three
 * times their own neighbourhood — plus every frame they drop around them. One
 * texture landing, one shader compiling, one tab restored cannot reach it; a
 * machine that is genuinely coming apart reaches it in one window.
 */
const STUTTER_WINDOW_MS = 4000;
const STUTTER_COUNT = 4;
/** ~1 s of memory at 60 fps. One frame cannot swing it; a slow machine holds it high. */
const EWMA_ALPHA = 0.016;

export class QualityGovernor {
  private tier: QualityTier;
  private steps: Array<{
    name: string;
    apply: () => void;
    revert: () => void;
    failures: number;
    pendingRecovery?: boolean;
    skipped?: boolean;
    /** True → this rung is not the governor's to spend right now. */
    skip?: () => boolean;
  }>;
  private applied = 0;
  private slowSince: number | null = null;
  private goodSince: number | null = null;
  private lastMemReport = 0;
  private paused = false;
  private startedAt = 0;
  private ewmaMs = 0;
  /** Timestamps of the recent discarded outliers — the stutter signal's window. */
  private hitchTimes: number[] = [];

  constructor(
    tier: QualityTier,
    callbacks: GovernorCallbacks,
    renderer?: RendererInfoLike,
    options: GovernorOptions = {},
  ) {
    this.tier = tier;
    this.rendererRef = renderer;
    const c = callbacks;
    const playerChose = options.postIsPlayerChoice;
    // ORDER IS THE POINT: cheapest to the eye first. Two resolution steps and a
    // halved shadow map are things a player has to be told about to notice; the
    // post chain leaving is the thing he writes in to complain about. So the
    // visible cliff goes as late as it can while still being a real rescue.
    this.steps = [
      {
        name: 'dpr-0.8',
        apply: () => c.setDprScale?.(0.8),
        revert: () => c.setDprScale?.(1),
        failures: 0,
      },
      {
        name: 'shadows-reduced',
        apply: () => c.setShadowQuality?.('reduced'),
        revert: () => c.setShadowQuality?.('full'),
        failures: 0,
      },
      {
        // Second resolution step — one ×0.8 was often not enough on weak
        // desktops; 0.65 of the tier cap is still readable everywhere.
        name: 'dpr-0.65',
        apply: () => c.setDprScale?.(0.65),
        revert: () => c.setDprScale?.(0.8),
        failures: 0,
      },
      {
        name: 'draw-distance',
        apply: () => c.setDrawDistanceScale?.(0.6),
        revert: () => c.setDrawDistanceScale?.(1),
        failures: 0,
      },
      {
        // THE VISIBLE CLIFF. Everything above this is a resolution or a radius;
        // this is the grade, the bloom, the AO and the exposure metering all
        // leaving in one frame. It is still here because on a phone that is
        // genuinely melting it is the biggest single saving in the ladder — but
        // it is reached last-but-one, and never at all against an explicit
        // choice on the settings screen.
        name: 'post-off',
        apply: () => c.setPostEnabled?.(false),
        revert: () => c.setPostEnabled?.(true),
        failures: 0,
        skip: playerChose ? () => playerChose() === true : undefined,
      },
      {
        name: 'framecap-30',
        apply: () => c.setFrameCap?.(30),
        revert: () => c.setFrameCap?.(this.tier.frameCap),
        failures: 0,
      },
    ];
    // Visibility lifecycle: a backgrounded game must stop burning GPU/audio on
    // exactly the thermally-constrained device class. The game's loop should
    // also pause itself; the governor at minimum stops judging frames.
    // Seeded from the CURRENT state, not assumed visible: a page that boots in
    // a background tab never fires the event, and used to be judged on frames
    // the compositor was starving.
    try {
      this.paused = document.visibilityState !== 'visible';
      document.addEventListener('visibilitychange', () => {
        this.paused = document.visibilityState !== 'visible';
        this.slowSince = null;
        this.goodSince = null;
        // Coming back from a background tab, the first frames are a cold
        // pipeline. Judge them against nothing.
        this.ewmaMs = 0;
        this.startedAt = 0;
        this.hitchTimes.length = 0;
      });
    } catch {
      /* non-DOM context */
    }
  }

  private rendererRef?: RendererInfoLike;

  /**
   * The frame time above which the machine is genuinely failing, in ms.
   *
   * NOT `target + a few ms`. Under vsync the only frame times a display can
   * produce are whole multiples of its interval, so the honest question is
   * "how many intervals is it missing", and the answer that means trouble is
   * "more than one". At a 60 Hz-class target that is 33.3 ms plus slack — a
   * stable 30 fps passes, a machine under ~27 fps does not.
   */
  private get budgetMs(): number {
    const targetMs = 1000 / Math.min(this.tier.frameCap, 60);
    // Capped at the 60 Hz cadence: a tier that ASKS for 30 fps is still being
    // shown on a 60 Hz-or-better panel, and the panel's physics set the rungs.
    return Math.min(targetMs * 2, 1000 / 30) + 3.5;
  }

  /** Call once per frame with the frame delta in ms (performance.now() based). */
  frame(deltaMs: number): void {
    if (this.paused) return;
    const now = performance.now();
    if (this.startedAt === 0) this.startedAt = now;
    const budgetMs = this.budgetMs;

    // Outlier rejection BEFORE anything else. A hitch is an event, not a load,
    // and it must not feed the average. It IS counted, though — see
    // STUTTER_WINDOW_MS: enough events inside one window stop being events.
    const isHitch =
      this.ewmaMs > 0 && deltaMs > Math.max(HITCH_FLOOR_MS, this.ewmaMs * HITCH_RATIO);
    if (isHitch) {
      // NOT `slowSince = null` any more, and that one deleted line is half of
      // the stutter fix. A hitch must not feed the AVERAGE — it is an event, not
      // load — but erasing the slow clock with it meant an unrelated texture
      // upload could wipe out three and a half seconds of honestly measured
      // slowness, over and over, on exactly the devices that hitch most. The
      // clock is safe to keep: it only survives while the next judged frame
      // still finds the average over budget, and the `else` branch below clears
      // it the moment the average recovers.
      //
      // `goodSince` is still cleared, because it is the opposite claim: a game
      // that just stalled for 274 ms has not been smooth for twenty seconds,
      // whatever its average says, and must not step UP on the strength of one.
      this.goodSince = null;
      this.noteHitch(now);
      this.reportMemory(now);
      return;
    }

    this.ewmaMs = this.ewmaMs === 0 ? deltaMs : this.ewmaMs + (deltaMs - this.ewmaMs) * EWMA_ALPHA;

    // Warm-up: watch, average, but do not act. Boot frames are not a verdict.
    if (now - this.startedAt < WARMUP_MS) {
      this.slowSince = null;
      this.goodSince = null;
      this.reportMemory(now);
      return;
    }

    // The AVERAGE decides, not the frame. One frame over budget is a gust; one
    // frame under it is not an acquittal.
    if (this.ewmaMs > budgetMs) {
      this.goodSince = null;
      if (this.slowSince == null) this.slowSince = now;
      else if (now - this.slowSince > SLOW_WINDOW_MS) {
        this.stepDown();
        this.slowSince = null;
      }
    } else {
      this.slowSince = null;
      if (this.goodSince == null) this.goodSince = now;
      else if (now - this.goodSince > RECOVER_WINDOW_MS) {
        this.stepUp();
        this.goodSince = null;
      }
    }

    this.reportMemory(now);
  }

  /**
   * Record one discarded outlier, and step down if they have stopped being
   * outliers and become the experience. See STUTTER_WINDOW_MS.
   *
   * It respects the same two guards the average path does — the warm-up (boot
   * compiles and first texture uploads are hitches by construction, and this
   * signal would otherwise spend the whole ladder before DROP IN) and the
   * window itself, which is emptied on every step so the next rung has to be
   * earned by a fresh four seconds rather than by the same stalls counted twice.
   */
  private noteHitch(now: number): void {
    this.hitchTimes.push(now);
    const cutoff = now - STUTTER_WINDOW_MS;
    while (this.hitchTimes.length > 0 && this.hitchTimes[0]! < cutoff) this.hitchTimes.shift();
    if (now - this.startedAt < WARMUP_MS) {
      this.hitchTimes.length = 0;
      return;
    }
    if (this.hitchTimes.length < STUTTER_COUNT) return;
    this.hitchTimes.length = 0;
    this.slowSince = null;
    this.stepDown();
  }

  /** Memory self-report for the crash watchdog's beacons (field calibration). */
  private reportMemory(now: number): void {
    if (now - this.lastMemReport <= MEM_REPORT_MS) return;
    this.lastMemReport = now;
    try {
      const mem = this.rendererRef?.info?.memory;
      const w = window as Window & {
        __GENEX_QUALITY__?: {
          tex?: number;
          geo?: number;
          step?: number;
          rung?: string;
          ms?: number;
          hitch?: number;
        };
      };
      w.__GENEX_QUALITY__ = {
        tex: mem?.textures ?? 0,
        geo: mem?.geometries ?? 0,
        // The second signal, reported alongside the average for the same reason
        // the rung is: a beacon carrying "ms: 2.1" and nothing else says the
        // machine was healthy, when what the player felt was four 200 ms stalls
        // in the last four seconds.
        hitch: this.hitchTimes.length,
        // Which rung the ladder is standing on, and the average frame it is
        // standing there because of. A beacon that says "textures: 113" and
        // nothing else cannot tell a memory problem from a governor decision.
        step: this.applied,
        rung: this.applied === 0 ? 'none' : (this.steps[this.applied - 1]?.name ?? 'none'),
        ms: Math.round(this.ewmaMs * 10) / 10,
      };
    } catch {
      /* observational only */
    }
  }

  private stepDown(): void {
    // Walk past any rung that is not the governor's to spend — a skipped rung
    // costs no time, so the ladder does not stall in front of it.
    while (this.applied < this.steps.length) {
      const step = this.steps[this.applied]!;
      if (step.skip?.()) {
        step.skipped = true;
        this.applied++;
        continue;
      }
      step.skipped = false;
      // A re-application of a rung whose recovery is still pending means the
      // revert did NOT hold — that's the failure being counted, never the
      // successful revert itself.
      if (step.pendingRecovery) {
        step.pendingRecovery = false;
        step.failures++;
      }
      step.apply();
      this.applied++;
      return;
    }
  }

  private stepUp(): void {
    while (this.applied > 0) {
      const step = this.steps[this.applied - 1]!;
      if (step.skipped) {
        // Never applied, so there is nothing to give back — keep walking.
        step.skipped = false;
        this.applied--;
        continue;
      }
      // Never re-attempt a knob whose recovery failed twice (reverting it put
      // the game back over budget both times) — it stays applied for the session.
      if (step.failures >= 2) return;
      step.pendingRecovery = true;
      step.revert();
      this.applied--;
      return;
    }
  }
}
