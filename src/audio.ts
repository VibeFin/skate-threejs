// Sound. Plain HTMLAudioElements — this game has no positional audio to sell,
// and the ride loops need to track speed continuously, which is a volume + rate
// ramp, not a 3D pan.
//
// Browsers refuse to start audio before a gesture, so nothing plays until the
// player's first key or tap; `unlock()` is wired to that, and DROP IN is the
// gesture it is wired to on purpose — a mouse-only player rolled off the title
// screen in silence once already.
//
// WHAT THIS FILE OWNS, and where the rest of it lives:
//   audio/catalog.ts   every clip, with its MEASURED level and its loop window
//   audio/mixer.ts     how loud everything is, and the arithmetic behind it
//   audio/loops.ts     a bed that repeats without a seam in it
//   audio/settings.ts  the two volumes, between sessions
//   this file          what happens when — the events, and the state machine
//
// THE SHAPE OF THE MIX. There are three continuous layers and they are always
// in a different relationship to each other:
//
//   THE BED — wheels (grass or concrete, whichever he is on) or the grind
//   (steel or waxed edge, whichever he caught). Exactly one is ever up, and
//   they hand over by fading, never by cutting — a rail that clacks and then
//   swells is the difference between locking on and teleporting.
//
//   WIND — over the top of the bed, and answering the same speed on a much
//   later curve, so it is only there when he is genuinely moving. It is what
//   makes 18 m/s sound different from 8 rather than just faster.
//
//   MUSIC AND AIR — a track per map, and map 2's own ambience under it. These
//   are the layers the moments push out of the way: a grind holds them down for
//   as long as the trucks are on the rail, and a bail, a slam or the horn digs
//   a hole and lets them climb back out of it. Nothing in here sits at one flat
//   level, which was the whole complaint.
//
// Everything else is a one-shot out of a small voice pool, so a flip landing on
// a rail doesn't cut its own pop.
//
// THE HEARTBEAT. Loop splices, the music level and the duck envelopes run on a
// 20 Hz interval this module owns rather than on the render frame, for two
// reasons: the music has to keep looping behind the pause screen (the frame
// loop stops calling in there), and a fixed period makes the crossfade and the
// wind's ramp frame-rate independent.
//
// WHAT IT WATCHES — a pull, not a push, and that is the correction this round.
// Two things the mix has to know are carried by no sound event: which spot is
// mounted, and whether the minute is running. The first version of this file
// offered `setMap`/`runStart`/`runEnd` for the boot to call and the boot never
// called them, so map 2's whole soundtrack — its own track, its canyon air, its
// heavier wind — sat behind a call nobody made, and riding The Spillway played
// the street's music. The push entries are still here, but the FIRST way is now
// `watch({ map, run })`: hand this module two getters at boot and it reads them
// off its own heartbeat. A wire that is one line and reads state the game
// already keeps is a wire that does not get forgotten.
//
// Every sound degrades to silence on its own: a URL that 404s marks its element
// dead the first time the browser complains and is never touched again. And
// nothing at all is fetched before the unlocking gesture — the boot window,
// while the scene's geometry and textures are decoding, is exactly where a
// phone gets killed, and it is also a window in which no sound can play.

import { LOOPS, SHOTS, TRACKS, type ShotName, type TrackName } from "./audio/catalog";
import { dead, makeAudio, seek, start } from "./audio/element";
import { ManagedLoop } from "./audio/loops";
import {
  AMBIENCE_GAIN,
  CONTEXT_GAIN,
  CURVES,
  DEFAULT_MUSIC,
  DEFAULT_SFX,
  GRIND_DUCK_MUSIC,
  GRIND_DUCK_WIND,
  MOMENTS,
  musicTrim,
  WIND,
  WIND_AIRBORNE,
  WIND_BY_MAP,
  type MixContext,
  type Moment,
} from "./audio/mixer";
import { flushNow, loadAccount, persist, readDevice, type AudioLevels } from "./audio/settings";
import { detectTier, type QualityTier } from "./controllers/quality/tier";
import type { GrindKind } from "./skate/contracts";
import type { SurfaceKind } from "./world/surface";

/** The surface beds. Exactly one is audible at a time; the rest are fading out. */
type Bed = "grass" | "street" | "metal" | "ledge";
const BEDS: readonly Bed[] = ["grass", "street", "metal", "ledge"];

/** Which map's bed is up. Mirrors `MapId` in `world/maps.ts` without importing
 *  it — the audio layer has no business holding a handle on the map registry. */
export type AudioMapId = TrackName;

/** Where the minute is. Mirrors `RunPhase` in `game/run.ts`, same argument. */
export type AudioRunState = "free" | "running" | "over";

/**
 * The two pieces of game state the mix reads for itself, once per heartbeat.
 *
 * Getters rather than values because both change under the boot's feet — the
 * spot is re-mounted on a `let`, and the run is an object built after this one
 * — and getters rather than events because a poll cannot be forgotten halfway:
 * there is one place to wire, not four (start, end, cancel, map).
 *
 * Cheap by construction: two property reads at 20 Hz, and neither does anything
 * unless the answer CHANGED.
 */
export interface AudioWatch {
  /** The mounted spot — `() => world.map.id`. */
  map?: () => AudioMapId;
  /** The one-minute run — `() => runGame.run.phase`. */
  run?: () => AudioRunState;
}

/**
 * Loose props the physics can send skittering. Only two samples exist — light
 * plastic and heavy metal — so this vocabulary (which mirrors `spot.ts`'s
 * `PropKind`) collapses onto those two here rather than at the call site.
 */
export type LoosePropKind = "cone" | "bin" | "dumpster" | "bench" | "lamp" | "hydrant";

export type { MixContext };

/**
 * How many copies of a one-shot may exist, so rapid hits don't cut each other.
 * Sized by how fast the game can actually fire them: a flip can follow a pop
 * inside a frame, a cone can be clipped three times crossing a plaza, but you
 * only slam once and the minute only starts once.
 *
 * This is a CEILING, not an allocation. Each pool starts at one element and
 * grows only when a sound is asked for while the copy it was going to reuse is
 * still ringing — so a session that never chains anything never builds them.
 */
const VOICE_CAP: Record<ShotName, number> = {
  pop: 3,
  land: 3,
  whoosh: 3,
  cone: 3,
  bail: 2,
  body: 2,
  lock: 2,
  coping: 2,
  bin: 2,
  horn: 1,
  buzzer: 1,
};

/**
 * The one-shots that pull the music and the wind down with them.
 *
 * Read inside `play` rather than by the callers, because the boot fires the
 * bail and the landing through `play` directly — a duck that only worked when
 * somebody remembered to ask for it would not be in the game. The ones whose
 * depth depends on how hard the hit was (`bodyImpact`, `wallHit`, `propHit`)
 * scale their own and are not in here.
 */
const SHOT_MOMENT: Partial<Record<ShotName, (volume: number) => Moment | null>> = {
  bail: () => MOMENTS.bail,
  // Only the ones that actually thumped: the boot passes 0.8 + slam × 0.05, so
  // 0.95 is a three-metre drop rather than rolling off a kerb.
  land: (v) => (v >= 0.95 ? MOMENTS.landing : null),
  horn: () => MOMENTS.whistle,
  buzzer: () => MOMENTS.whistle,
};

/** Heartbeat period. 20 Hz is far finer than any envelope in the mix and far
 *  coarser than a render frame — it costs nothing and it never has to be right
 *  about the frame rate. */
const TICK_MS = 50;
const TICK_S = TICK_MS / 1000;

/** Time constant for a music level change — a map swap, a duck, DROP IN. Half a
 *  second is a musical fade rather than a cut, and short enough that dropping
 *  in feels like the track came up to meet you. */
const MUSIC_TAU = 0.5;

/** Splice grade per tier: desktops crossfade a bed's ends together over this
 *  many seconds, phones jump the playhead instead. See `audio/loops.ts`. */
const CROSSFADE_DESKTOP = 0.3;
const CROSSFADE_PHONE = 0;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class GameAudio {
  /** Fires when levels change from anywhere but the setter — i.e. when the
   *  account's stored values land after boot. A settings slider should redraw
   *  from this rather than assume the value it rendered is still current. */
  onLevels: ((levels: Readonly<AudioLevels>) => void) | null = null;

  private levels: AudioLevels;
  private beds: Record<Bed, ManagedLoop>;
  private wind: ManagedLoop;
  private ambience: ManagedLoop;
  private tracks: Record<TrackName, ManagedLoop>;
  private pools: Record<ShotName, HTMLAudioElement[]>;
  private cursor: Record<ShotName, number>;
  private line: HTMLAudioElement | null = null;
  private caps: Record<ShotName, number>;

  private sources: AudioWatch = {};
  /** The run phase as of the last poll, so the horn and the buzzer fire on the
   *  EDGE. Starts `free`, which is where a boot starts, so nothing sounds for
   *  a state the player was already in. */
  private runState: AudioRunState = "free";

  private unlocked = false;
  private muted = false;
  private ducked = false;
  /** Has the game ever been un-ducked? Until it has, a duck is the TITLE
   *  SCREEN and not a pause, and the two want different music levels. Inferred
   *  rather than asked for, so the menu gets its own level with no change to
   *  the boot; `setContext` overrides it for anyone who wants to be explicit. */
  private played = false;
  private map: AudioMapId = "street";

  /** Speed and airborne-ness as of the last frame, for the wind curve. */
  private rideSpeed = 0;
  private airborne = false;

  /** The moment envelope: where it is now, how long it stays there, and the
   *  time constant it climbs back on. */
  private duckLevel = 1;
  private duckHold = 0;
  private duckRelease: number = MOMENTS.landing.release;

  private beat: ReturnType<typeof setInterval> | null = null;

  /**
   * The grind bed that owns the mix, with the colour this particular grind
   * gives it — null whenever the wheels have it back.
   */
  private grind: { bed: Bed; gain: number; rate: number } | null = null;

  /**
   * `tier` decides how many live decoders this layer is allowed. Pass the one
   * the boot already detected; without it this detects its own, which is
   * correct but re-runs a WebGL probe the boot has already paid for.
   *
   * `watch` is the map and the run — see `AudioWatch`. It can equally be handed
   * over later with `watch()`, which is usually easier, because the run object
   * is built further down the boot than this one.
   */
  constructor(tier?: QualityTier, watch?: AudioWatch) {
    const t = tier ?? detectTier();
    const phone = t.name === "phone" || t.name === "phone-low";
    const xfade = phone ? CROSSFADE_PHONE : CROSSFADE_DESKTOP;

    // The device's own stored levels, read synchronously so there is never a
    // frame at the wrong volume. The account's copy arrives later and only
    // wins on a device that has never been set — see `audio/settings.ts`.
    const stored = readDevice();
    this.levels = {
      music: stored?.music ?? DEFAULT_MUSIC,
      sfx: stored?.sfx ?? DEFAULT_SFX,
    };
    if (!stored) void this.adoptAccountLevels();

    this.beds = {
      grass: new ManagedLoop(LOOPS.grass, { name: "roll-grass", pitched: true, crossfade: xfade }),
      street: new ManagedLoop(LOOPS.street, { name: "roll-street", pitched: true, crossfade: xfade }),
      metal: new ManagedLoop(LOOPS.metal, { name: "grind-metal", pitched: true, crossfade: xfade }),
      ledge: new ManagedLoop(LOOPS.ledge, { name: "grind-ledge", pitched: true, crossfade: xfade }),
    };
    this.wind = new ManagedLoop(LOOPS.wind, { name: "wind", pitched: true, crossfade: xfade });
    this.ambience = new ManagedLoop(LOOPS.canyon, { name: "ambience", crossfade: xfade });

    // Music crossfades on EVERY tier, phones included. The other beds can take
    // the cheap splice because their two ends measure within a couple of dB of
    // each other on broadband material; a music track cannot — both of these
    // fade to silence over their last few seconds despite being prompted for a
    // seamless loop, so the join has to be a real overlap. It costs a second
    // decoder for 300 ms once every ninety seconds, and the element that does
    // it is not built until the first approach to the loop point, which is a
    // minute and a half after the boot window where a phone actually dies.
    this.tracks = {
      street: new ManagedLoop(TRACKS.street, { name: "music-street", crossfade: CROSSFADE_DESKTOP }),
      spillway: new ManagedLoop(TRACKS.spillway, {
        name: "music-spillway",
        crossfade: CROSSFADE_DESKTOP,
      }),
    };

    this.caps = {} as Record<ShotName, number>;
    this.pools = {} as Record<ShotName, HTMLAudioElement[]>;
    this.cursor = {} as Record<ShotName, number>;
    for (const name of Object.keys(VOICE_CAP) as ShotName[]) {
      // Phones get half the polyphony, floored at one. It is the peak number of
      // simultaneous decoders that kills them, and this is the only knob in the
      // file that moves it.
      this.caps[name] = phone ? Math.max(1, Math.ceil(VOICE_CAP[name] / 2)) : VOICE_CAP[name];
      // EMPTY. Nothing is fetched here — see `unlock`.
      this.pools[name] = [];
      this.cursor[name] = 0;
    }
    if (watch) this.sources = { ...watch };

    // A tab going away mid-drag would otherwise lose the setting it was moved
    // to; the device copy is already written, this pushes the account's.
    addEventListener("pagehide", flushNow);
  }

  // --- what the player controls ---------------------------------------------

  /** 0–1. The player's own level, before this file's own trim. */
  get musicVolume(): number {
    return this.levels.music;
  }
  set musicVolume(v: number) {
    this.setLevels({ ...this.levels, music: clamp01(v) });
  }

  get sfxVolume(): number {
    return this.levels.sfx;
  }
  set sfxVolume(v: number) {
    this.setLevels({ ...this.levels, sfx: clamp01(v) });
  }

  /** Both at once — what a settings screen reads to draw its knobs. */
  get volumes(): Readonly<AudioLevels> {
    return this.levels;
  }

  /** Where the mix thinks the game is. */
  get context(): MixContext {
    return this.ducked ? (this.played ? "paused" : "menu") : "play";
  }

  /** Which map's music and air are up. */
  get mapId(): AudioMapId {
    return this.map;
  }

  private setLevels(next: AudioLevels, fromPlayer = true): void {
    this.levels = next;
    // One-shots read the master at play time, but everything continuous is
    // riding toward a target computed from it — so nudge the heartbeat rather
    // than wait up to 50 ms for a slider to do anything.
    this.tick();
    if (fromPlayer) persist(next);
    else this.onLevels?.(next);
  }

  /**
   * The account's stored levels, applied only on a device that has none — and
   * deliberately NOT written to this device on the way in, so a laptop stays
   * "never set" until somebody actually moves a slider on it. The second check
   * is not redundant: the player can reach the settings screen while this is
   * still in flight, and the value they just chose has to win.
   */
  private async adoptAccountLevels(): Promise<void> {
    const remote = await loadAccount();
    if (!remote || readDevice()) return;
    this.setLevels(
      { music: remote.music ?? this.levels.music, sfx: remote.sfx ?? this.levels.sfx },
      false,
    );
  }

  // --- lifecycle ------------------------------------------------------------

  /**
   * Hand over the map and the run. Merges, so the two can be wired from
   * different places; ticks, so a source given after the game is already
   * running takes effect this instant rather than up to 50 ms later.
   *
   * A source, once wired, is the AUTHORITY: the next heartbeat overwrites
   * anything `setMap` pushed. Pick one direction per fact and stay in it.
   */
  watch(sources: AudioWatch): void {
    this.sources = { ...this.sources, ...sources };
    this.tick();
  }

  /**
   * Call from the first real user gesture. Safe to call repeatedly.
   *
   * This is also where every one-shot is BUILT — eleven elements, one fetch
   * each, none of them before now. The boot is the wrong moment for them twice
   * over: it is the window where a phone's memory actually runs out, with the
   * scene's own geometry and textures decoding, and it is a window in which no
   * sound is allowed to play anyway. DROP IN is past all of that, and the
   * earliest sound a player can make after it — a pop — is a push and a wind-up
   * away, which is seconds on a CDN that answers in tens of milliseconds.
   */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    for (const name of Object.keys(VOICE_CAP) as ShotName[]) this.takeVoice(name);
    // An unwired mix is silent in a way that looks like it is working: map 2
    // simply plays map 1's music and the minute simply has no horn, and nobody
    // notices for a week. This is the one thing this layer cannot check for
    // itself, so it says so, once, the way any library says an integration is
    // missing. It is a report, not a mode — there is no flag behind it and no
    // behaviour on the other side of it.
    if (!this.sources.map) {
      console.warn("[audio] no map source — see GameAudio.watch(); map 2 will play map 1's track");
    }
    this.beat = setInterval(() => this.tick(), TICK_MS);
    // Synchronously, inside the gesture's own task: the very first `play()` is
    // the one the autoplay policy is actually watching.
    this.tick();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.hush();
    this.tick();
  }

  /**
   * Which block he is on. Changes the track and the air under it, crossfaded
   * over half a second rather than cut, because a map change already tears the
   * whole scene down and an audio cut on top of it reads as a bug.
   *
   * Map 1 keeps the track that shipped with it; map 2 gets the fast one,
   * because map 2 is the fast map. See `audio/catalog.ts`.
   *
   * THE SECOND WAY to say this — `watch({ map })` is the first, and if one is
   * wired this is overwritten by the next heartbeat.
   */
  setMap(id: AudioMapId): void {
    if (id === this.map) return;
    this.map = id;
    this.tick();
  }

  /**
   * Say outright where the game is, instead of letting `duck` infer it. The
   * inference is right for this boot — a duck before the first un-duck is the
   * title screen — but it cannot survive a game that returns to its menu.
   */
  setContext(context: MixContext): void {
    this.ducked = context !== "play";
    this.played = context !== "menu";
    if (this.ducked) this.hush();
    this.tick();
  }

  /**
   * Ducks the music while a menu or the pause screen is up — and kills the ride
   * beds outright, because the frame loop stops calling `setRolling` behind a
   * pause and a wheel loop left at its last volume drones under the modal.
   */
  duck(on: boolean): void {
    this.ducked = on;
    if (!on) this.played = true;
    if (on) this.hush();
    this.tick();
  }

  /** Stop everything and let go of the interval. */
  dispose(): void {
    if (this.beat !== null) clearInterval(this.beat);
    this.beat = null;
    this.hush();
    for (const track of Object.values(this.tracks)) track.silence();
    this.ambience.silence();
    removeEventListener("pagehide", flushNow);
    flushNow();
  }

  // --- one-shots ------------------------------------------------------------

  play(name: ShotName, volume = 1, rate = 1): void {
    if (!this.unlocked || this.muted) return;
    const el = this.takeVoice(name);
    if (!el) return;
    el.volume = clamp01(volume * this.levels.sfx);
    el.playbackRate = rate;
    // From the onset, not from zero. Three of these clips open with dead air —
    // the cone's is 300 ms, which at 12 m/s is four metres behind him.
    seek(el, SHOTS[name].onset ?? 0);
    start(el);
    const moment = SHOT_MOMENT[name]?.(volume);
    if (moment) this.moment(moment);
  }

  /**
   * The whole ride mix, once a frame: wheels or grind, whichever he is on, and
   * the wind over the top of it. `speed` may be signed (fakie is negative) —
   * only how fast matters here. `kind` is the surface under the board; a grind
   * overrides it, because what you can hear on a rail is the rail.
   */
  setRolling(speed: number, grounded: boolean, kind: SurfaceKind = "grass"): void {
    if (!this.unlocked || this.muted || this.ducked) {
      this.hush();
      return;
    }
    const s = Math.abs(speed);
    // Handed to the heartbeat rather than ridden here: the wind's ramp is the
    // slowest in the mix and a per-frame share would mean something different
    // on a 30 fps phone than on a 144 Hz monitor.
    this.rideSpeed = s;
    this.airborne = !grounded;

    const wheels: Bed = kind === "grass" ? "grass" : "street";
    for (const bed of BEDS) {
      const c = CURVES[bed];
      const live = this.grind ? bed === this.grind.bed : grounded && bed === wheels;
      if (!live) {
        this.beds[bed].fade(c.fall);
        continue;
      }
      const t = Math.min(1, s / c.full);
      const loud = Math.pow(t, c.shape);
      const colour = this.grind;
      this.beds[bed].ride(
        loud * c.gain * (colour ? colour.gain : 1) * this.levels.sfx,
        (c.rate + t * c.rateSpan) * (colour ? colour.rate : 1),
        c.rise,
      );
    }
  }

  /**
   * The trucks found the line. `kind` colours it — a deck laid across a rail is
   * a bigger, duller contact patch than two steel trucks in a groove — and
   * `surface` decides which bed plays at all. The loop itself comes up on the
   * next `setRolling`, under the clack. From here until `endGrind` the music
   * and the wind are held down: a grind is a STATE, and the rail owns it.
   */
  startGrind(kind: GrindKind, surface: SurfaceKind = "metal"): void {
    const deckOn = kind === "boardslide" || kind === "tailslide";
    const steel = surface === "metal";
    this.grind = {
      bed: steel ? "metal" : "ledge",
      gain: deckOn ? 1.08 : 1,
      rate: deckOn ? 0.88 : 1,
    };
    this.play("lock", steel ? 0.9 : 0.6, steel ? 1 : 1.15);
  }

  /**
   * …and left it. A clean exit chirps on the way out; a bail doesn't, because
   * the board clatter and the body hitting the floor are already speaking.
   */
  endGrind(bailed = false): void {
    this.grind = null;
    if (!bailed) this.play("lock", 0.45, 1.3);
  }

  /**
   * A body landing on concrete. `speed` is the impact velocity's magnitude —
   * a slow slide-out and a full-speed slam are not the same sound, so it drives
   * how loud the hit is, how sharp, and how far it pushes everything else out
   * of the way.
   */
  bodyImpact(speed: number): void {
    const k = clamp01((speed - 2) / 12);
    this.play("body", 0.4 + 0.6 * k, 0.92 + 0.22 * k);
    const m = MOMENTS.slam;
    this.moment({ depth: m.depth * (0.4 + 0.6 * k), hold: m.hold * k, release: m.release });
  }

  /**
   * Trucks and deck into a kerb, a ledge or a brick wall. `speed` is the part of
   * his velocity that went straight INTO the face — a scuff starts around 2 m/s
   * and anything past 10 is a crash, which fires the bail clatter and the body
   * behind this rather than instead of it.
   *
   * It is the landing slap, pitched DOWN rather than up: nothing was generated
   * for hitting a wall, and what a board does edge-on into concrete is the same
   * slap it makes flat-on with more of the deck's length behind it. Falling
   * pitch is what makes a kerb clip read smaller than a wall — the opposite of
   * every other curve in this file, and deliberate.
   *
   * TWO LAYERS since the coping clack landed. The slap is the deck; the clack
   * is the TRUCKS, and a wall hit is trucks into a hard edge every bit as much
   * as a lip stall is — that is what the clip is a recording of. It comes in
   * only past a scuff (3.5 m/s), it is pitched up rather than down because a
   * kerb is a smaller, harder edge than a ramp's lip, and it tops out 1.4 dB
   * under the slap: the deck is the body of the sound and the clack is the edge
   * on it, not a second event.
   */
  wallHit(speed: number): void {
    const k = clamp01((speed - 2) / 10);
    this.play("land", 0.34 + 0.5 * k, 0.86 - 0.16 * k);
    if (k > 0.15) this.play("coping", 0.18 + 0.27 * k, 1.06 + 0.12 * k);
    if (k > 0.35) {
      const m = MOMENTS.wall;
      this.moment({ depth: m.depth * k, hold: m.hold, release: m.release });
    }
  }

  /**
   * The board coming round. Detuned per call so a run of flips reads as several
   * flips rather than one sample fired six times.
   */
  flipWhoosh(volume = 0.5): void {
    this.play("whoosh", volume, 0.94 + Math.random() * 0.14);
  }

  /**
   * Trucks onto the lip of a transition. `speed` is how hard he arrived; a
   * stall at walking pace is a tap and a full-speed axle stall is a bang, and
   * the same clip covers both because the difference is level and pitch.
   */
  copingClack(speed: number): void {
    const k = clamp01((Math.abs(speed) - 1) / 9);
    this.play("coping", 0.35 + 0.5 * k, 0.94 + 0.12 * k);
  }

  /**
   * A loose prop taking a hit — a cone sent skittering, a bin going over.
   * `speed` is the closing speed. Two samples cover the whole vocabulary: the
   * cone is the only light plastic thing out there, everything else is metal or
   * timber and lands on the bin.
   *
   * The cone clip was generated 15 dB quieter than the bin, so its own curve
   * starts far higher — matched levels out of unmatched files.
   */
  propHit(kind: LoosePropKind, speed: number): void {
    const k = clamp01((Math.abs(speed) - 1.5) / 8);
    const jitter = 0.92 + Math.random() * 0.16;
    if (kind === "cone") {
      this.play("cone", 0.55 + 0.45 * k, jitter);
      return;
    }
    this.play("bin", 0.3 + 0.4 * k, jitter);
    // Only a real hit gets out of the music's way; nudging a bin at a crawl
    // should not dent the soundtrack.
    if (k > 0.4) this.moment(MOMENTS.landing);
  }

  /** The minute is on. Fired for you by `watch({ run })`; public for a boot
   *  that would rather push. */
  runStart(): void {
    this.play("horn", 0.9);
  }

  /** …and it is over. Under the horn by four dB, because a start is an
   *  invitation and an ending is a fact. */
  runEnd(): void {
    this.play("buzzer", 1);
  }

  /**
   * A spoken line — the NPC who starts a run. It goes through this rather than
   * an element of his own so it obeys the mute, the pause and the sfx level,
   * and so the music gets out of the way for the length of it: the line was
   * generated at −24.5 dBFS, within a dB of a body hitting concrete, and the
   * music bed sits at −24.
   */
  voice(url: string): void {
    if (!this.unlocked || this.muted) return;
    const el = (this.line ??= makeAudio(url, "voice"));
    if (dead.has(el)) return;
    if (el.src !== url) el.src = url;
    el.volume = clamp01(this.levels.sfx);
    seek(el, 0);
    start(el);
    this.moment(MOMENTS.speech);
  }

  // --- the mix itself -------------------------------------------------------

  /**
   * Push the music and the wind down and let them climb back. A deeper moment
   * takes over from a shallower one; a shallower one arriving under a deep one
   * is ignored, so a landing inside a bail does not shorten the bail.
   */
  private moment(m: Moment): void {
    const floor = 1 - m.depth;
    if (floor >= this.duckLevel) return;
    this.duckLevel = floor;
    this.duckHold = m.hold;
    this.duckRelease = m.release;
  }

  /**
   * Where the music BELONGS — everything slow. The grind pull is in here on
   * purpose: a grind is a state, so it wants the same half-second ramp a map
   * change gets, not the snap a bail gets. The moment envelope is deliberately
   * NOT here; it goes in as the un-smoothed `duck` argument.
   */
  private musicTarget(track: TrackName): number {
    if (this.muted || track !== this.map) return 0;
    return (
      this.levels.music *
      musicTrim(TRACKS[track]) *
      CONTEXT_GAIN[this.context] *
      (this.grind ? GRIND_DUCK_MUSIC : 1)
    );
  }

  private windTarget(): number {
    if (this.muted || this.ducked) return 0;
    const t = clamp01((this.rideSpeed - WIND.floor) / (WIND.full - WIND.floor));
    if (t <= 0) return 0;
    return (
      Math.pow(t, WIND.shape) *
      WIND.gain *
      WIND_BY_MAP[this.map] *
      (this.airborne ? WIND_AIRBORNE : 1) *
      this.levels.sfx *
      (this.grind ? GRIND_DUCK_WIND : 1)
    );
  }

  /**
   * Read the game. Both answers are compared with what this module already
   * believes, so a spot that has not changed and a clock that has not started
   * cost two property reads and nothing else.
   *
   * The run is an EDGE, not a state: a horn on the way into `running`, a buzzer
   * on the way out of it into `over`. `running` → `free` is the third way a
   * minute can end — a spot change throws it away — and it is deliberately
   * silent, because a run nobody finished has nothing to announce.
   */
  private poll(): void {
    const map = this.sources.map?.();
    if (map && map !== this.map) this.map = map;

    const run = this.sources.run?.();
    if (!run || run === this.runState) return;
    const was = this.runState;
    this.runState = run;
    if (run === "running") this.runStart();
    else if (was === "running" && run === "over") this.runEnd();
  }

  /**
   * The heartbeat. The game first, then envelopes, the music, the air, the
   * wind, and every bed's own loop splice — in that order, because the splice
   * wants the level the rest of this pass just decided, and the music level
   * wants the map this pass just read.
   */
  private tick(): void {
    if (!this.unlocked) return;
    this.poll();

    if (this.duckHold > 0) {
      this.duckHold = Math.max(0, this.duckHold - TICK_S);
    } else if (this.duckLevel < 1) {
      this.duckLevel += (1 - this.duckLevel) * (1 - Math.exp(-TICK_S / this.duckRelease));
      if (this.duckLevel > 0.999) this.duckLevel = 1;
    }

    const musicK = 1 - Math.exp(-TICK_S / MUSIC_TAU);
    for (const name of Object.keys(this.tracks) as TrackName[]) {
      const track = this.tracks[name];
      const target = this.musicTarget(name);
      // An inactive track is never built at all: `ride` only makes an element
      // once it is asked for a level above nothing, so a session that stays on
      // map 1 never decodes map 2's track.
      if (target <= 0 && !track.built) continue;
      track.ride(target, 1, musicK, this.duckLevel);
    }

    // The air is already 30 dB below everything else (see `catalog.ts`); there
    // is nothing there for a bail to get out of the way of.
    const air =
      this.muted || this.ducked || this.map !== "spillway" ? 0 : AMBIENCE_GAIN * this.levels.sfx;
    if (air > 0 || this.ambience.built) this.ambience.ride(air, 1, musicK);

    const windGoal = this.windTarget();
    const wt = clamp01((this.rideSpeed - WIND.floor) / (WIND.full - WIND.floor));
    if (windGoal > 0 || this.wind.built) {
      this.wind.ride(
        windGoal,
        WIND.rate + wt * WIND.rateSpan,
        windGoal > 0 ? WIND.rise : WIND.fall,
        this.duckLevel,
      );
    }

    for (const bed of BEDS) this.beds[bed].tick(TICK_S);
    this.wind.tick(TICK_S);
    this.ambience.tick(TICK_S);
    for (const track of Object.values(this.tracks)) track.tick(TICK_S);
  }

  /** Everything that answers to the frame loop, off. The music and the map's
   *  air are not in here: they carry across a pause on purpose. */
  private hush(): void {
    for (const bed of BEDS) this.beds[bed].silence();
    this.rideSpeed = 0;
    this.airborne = false;
    this.wind.silence();
  }

  /**
   * The next copy of a one-shot to fire. Round-robin through what exists; grow
   * the pool only when the copy about to be reused is still sounding and the
   * tier's ceiling allows another.
   *
   * The first call for a sound BUILDS it. `unlock` calls this once per sound to
   * get that out of the way at the gesture, but the path stands on its own — a
   * sound whose warm-up never happened still plays, one fetch late.
   */
  private takeVoice(name: ShotName): HTMLAudioElement | null {
    const pool = this.pools[name];
    if (pool.length === 0) {
      const first = makeAudio(SHOTS[name].url, name, true);
      pool.push(first);
      this.cursor[name] = 0;
      return dead.has(first) ? null : first;
    }
    const next = this.cursor[name] % pool.length;
    let el = pool[next];
    if (!el.paused && pool.length < this.caps[name]) {
      el = makeAudio(SHOTS[name].url, name, true);
      pool.push(el);
      this.cursor[name] = pool.length;
    } else {
      this.cursor[name] = next + 1;
    }
    return dead.has(el) ? null : el;
  }
}
