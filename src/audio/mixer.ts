// HOW LOUD EVERYTHING IS, and the arithmetic that got it there.
//
// Every number below is derived from a measurement in `catalog.ts` and lands at
// a stated target, because a mix nobody can hear has to be checkable on paper.
// The convention throughout: a target is the level a sound reaches AT FULL
// EXPRESSION — a bed at top speed, a one-shot at its hardest hit — with both
// player volumes at their defaults, in dBFS RMS.
//
// THE ANCHOR is the concrete roll bed at full speed: a −22.35 dBFS file at gain
// 0.62 under an sfx master of 0.85 lands at −27.9 dBFS. That number was tuned
// by ear across milestones 4 and 7 and shipped, so it is not up for
// re-derivation — everything new is placed AGAINST it:
//
//   grind, steel rail, full        −19.7   the trick owns the mix, 8 dB up
//   run-start horn                 −13.5   the loudest thing in the game
//   run-end buzzer                 −17.4   under the horn, over the grind
//   music bed                      −24.1   under the wheels' loud moments
//   wind, flat out                 −26.0   just under the wheels
//   WHEELS ON CONCRETE, FULL       −27.9   ← the anchor
//   grind, waxed ledge, full       −28.0
//   body slam, full speed          −26.2
//   NPC line                       −25.9
//   wheels on grass, full          −32.1
//   map 2 ambience                 −55.3   see below; the clip is broken
//
// The spread from the horn to the wheels is 14 dB and from the horn to the
// ambience is 42, which is a mix with a shape rather than a pile of sounds all
// at 0.8.
//
// THE ONE PLACE THIS FAILS. The canyon ambience was generated at −53.9 dBFS
// RMS. An HTMLAudioElement's volume caps at 1.0, so the loudest this game can
// possibly play it is −55.3 dBFS after the sfx master — around 30 dB below
// where a background bed belongs. It is wired at the ceiling and it will be
// barely there. The fix is a hotter clip, not more code.

import { VOICE_LINE, type Clip } from "./catalog";

/** dB → linear amplitude. */
export function dbGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * The element volume that puts `clip` at `target` dBFS, before the player's own
 * master. Clamped at 1 because an element cannot amplify — when this clamps,
 * the clip was generated too quiet and no amount of mixing will fix it.
 */
export function trimTo(clip: Clip, target: number, master: number): number {
  return Math.min(1, dbGain(target - clip.rms) / master);
}

/**
 * The levels a player starts with. `sfx` is the value milestone 4 shipped.
 *
 * `DEFAULT_MUSIC` is 0.30 as of 2026-07-29, at the player's word — *"lets
 * regenerate a bg music, make it 30% volume, i wanna something more chill."*
 * It USED to be 0.60 and it used to be TWO things at once, which is the trap
 * this pair of constants exists to defuse: it was both the slider a new player
 * starts on AND the master `musicTrim` divides by. Lowering the one number
 * would therefore have changed nothing at all — halving the slider doubles the
 * per-track trim, and the bed comes out at exactly the volume it started.
 * Verified before splitting them, not assumed.
 *
 * So the calibration keeps its own name below. This constant is now only the
 * starting slider, and moving it genuinely moves the volume: the bed lands at
 * element volume ~0.155 instead of ~0.31.
 */
export const DEFAULT_MUSIC = 0.3;
export const DEFAULT_SFX = 0.85;

/** Where a music bed belongs, dBFS RMS: four dB under the wheels at speed. */
export const MUSIC_TARGET = -24.1;

/**
 * The slider position each track's trim is CALIBRATED against — deliberately
 * still 0.60, the value the trim was derived at. It is a property of the
 * normalisation, not a preference: it answers "at what slider should a bed sit
 * at `MUSIC_TARGET`", and that answer does not change because the player wants
 * to start quieter. A player who drags the slider back up to 0.60 hears exactly
 * the mix this trim was measured for.
 */
export const MUSIC_TRIM_REFERENCE = 0.6;

/**
 * Each track's own trim, computed from its own measured level rather than
 * shared — which is what level-MATCHES them. The two happen to be within
 * 0.2 dB of each other today, so this buys nothing right now and buys
 * everything the first time a track comes back mastered somewhere else.
 *
 * At the CALIBRATION volume this puts both at element volume 0.31 — the same
 * place `$genex-ai-music`'s 0.30 convention puts a bed, arrived at from the
 * file rather than copied off the page. The player now STARTS at half that
 * slider, so what he actually hears out of the box is ~0.155, which is the
 * quieter bed he asked for; dragging the slider to 0.60 restores this mix.
 */
export function musicTrim(track: Clip): number {
  return trimTo(track, MUSIC_TARGET, MUSIC_TRIM_REFERENCE);
}

/**
 * What the music is worth in each of the three places the game can be.
 *
 * `menu` is 0.55 of play, which puts the title screen at element volume 0.17 —
 * the skill's menu convention, and quiet enough that a wordmark animation reads
 * over it. `paused` is deeper still, because a pause screen is someone doing
 * something else.
 */
export const CONTEXT_GAIN = { play: 1, menu: 0.55, paused: 0.3 } as const;
export type MixContext = keyof typeof CONTEXT_GAIN;

/** How a bed answers speed. Silent at rest, louder and higher as it goes. */
export interface RideCurve {
  /** Speed below which this bed is not there at all, m/s. */
  floor: number;
  /** Speed that counts as flat out, m/s. */
  full: number;
  /**
   * Curve on the loudness. 1 is linear; below 1 the sound arrives early, which
   * is what a bed needs when the thing it represents is loud from the first
   * inch — urethane on pavement, and any grind at all. Above 1 it arrives late,
   * which is what wind does.
   */
  shape: number;
  /** Loudness at `full`, before the master sfx volume. */
  gain: number;
  /** Playback rate at rest… */
  rate: number;
  /** …and how much it climbs by `full`. */
  rateSpan: number;
  /**
   * Share of the gap this bed closes per frame coming in, and going out. The
   * wheels ease both ways; a rail ARRIVES — the trucks are either on it or they
   * are not — and then rings off slowly, so leaving one has a tail.
   */
  rise: number;
  fall: number;
}

/**
 * The surface beds. Levels untouched from milestone 4 and 7 — this mix was
 * tuned on the field, then on the street, and shipped.
 *
 * ONE number moved, and only to keep a level that did not. Re-windowing the
 * ledge clip (catalog.ts) trimmed its near-silent head and tail, which leaves
 * the part that actually repeats 1.3 dB hotter than the whole file the target
 * below was derived from. So the gain comes down by the same 1.3 dB — 0.62 →
 * 0.53 — and the bed still lands at −28.0 dBFS. A window change that moved a
 * level would be a mix change smuggled in as a loop fix.
 */
export const CURVES = {
  grass: { floor: 0, full: 14, shape: 1, gain: 0.55, rate: 0.8, rateSpan: 0.55, rise: 0.12, fall: 0.12 },
  // Pavement is a louder, brighter surface than grass and it starts talking the
  // moment the wheels turn, so it comes in earlier and finishes higher.
  street: { floor: 0, full: 14, shape: 0.65, gain: 0.62, rate: 0.85, rateSpan: 0.6, rise: 0.12, fall: 0.12 },
  // A grind is the trick — it has to be heard at a crawl, and it reaches its
  // full voice well before the board is at street speed.
  metal: { floor: 0, full: 10, shape: 0.45, gain: 0.78, rate: 0.92, rateSpan: 0.42, rise: 0.35, fall: 0.1 },
  ledge: { floor: 0, full: 10, shape: 0.5, gain: 0.53, rate: 0.88, rateSpan: 0.32, rise: 0.35, fall: 0.1 },
} as const satisfies Record<string, RideCurve>;

/**
 * Wind. The one bed with a FLOOR and a shape above 1, and both are the point:
 * wind is not a thing that happens when you are moving, it is a thing that
 * happens when you are moving FAST.
 *
 * The two speeds are the game's own, not round numbers: DESIGN.md's tuning
 * calls 12–15 m/s the coasting band and treats 16 as the top of what the street
 * gives you, so `full` sits at 17 — wind matches the wheels at 16 and is flat
 * out just past it, and map 2's downhill can push beyond. Nothing at all below
 * 6, which is a push and a half. The shape above 1 puts the halfway speed at a
 * third of full loudness rather than half, which is the difference between
 * "moving" and "moving fast".
 *
 * −17.55 dBFS file at gain 0.44 under the 0.85 master lands at −26.0, a couple
 * of dB under the wheels: it colours the ride rather than covering it.
 *
 * The rise and fall are deliberately the slowest in the file — and they are the
 * only two that are per TICK of the mixer's 20 Hz heartbeat rather than per
 * rendered frame, so 0.09 here is worth about 0.03 a frame at 60 fps, a quarter
 * of the wheels' 0.12, and it means the same thing on a 30 fps phone as on a
 * 144 Hz monitor. Wind has weight; a gust that tracks a carve frame-for-frame
 * reads as a synthesiser sweep.
 */
export const WIND: RideCurve = {
  floor: 6,
  full: 17,
  shape: 1.6,
  gain: 0.44,
  rate: 0.9,
  rateSpan: 0.35,
  rise: 0.09,
  fall: 0.14,
};

/**
 * Airborne, there is nothing between him and the air — no wheel noise under it
 * and no ground shadowing it — so the same speed reads windier off the ground.
 */
export const WIND_AIRBORNE = 1.3;

/**
 * Per-map wind weighting. A flood channel between hillsides funnels air; a
 * downtown block at golden hour does not. This is also the honest half of "map
 * 2 must not sound like a city" for as long as the ambience clip is unusable:
 * map 2 breathes at speeds where map 1 is still quiet.
 */
export const WIND_BY_MAP = { street: 1, spillway: 1.2 } as const;

/** Map 2's ambience runs at the element ceiling. See the header. */
export const AMBIENCE_GAIN = 1;

/**
 * How hard each moment pushes the music and the wind out of its way, and for
 * how long. `depth` is how much is taken away, `hold` is seconds at the bottom,
 * `release` is the time constant coming back.
 *
 * This is the difference between a soundtrack and a mix. A bail with the music
 * still at full level is a bail that did not happen to anybody.
 */
export interface Moment {
  depth: number;
  hold: number;
  release: number;
}

export const MOMENTS = {
  /** The board gone, the body down. The deepest hole in the game. */
  bail: { depth: 0.58, hold: 0.25, release: 0.9 },
  /** A full-speed slam. Deep, but it recovers while he is still sliding. */
  slam: { depth: 0.45, hold: 0.12, release: 0.6 },
  /** Wheels back down off something big. */
  landing: { depth: 0.3, hold: 0.05, release: 0.35 },
  /** Trucks or deck into a wall. */
  wall: { depth: 0.3, hold: 0.05, release: 0.4 },
  /** The horn, and the buzzer. Both own the second they are in. */
  whistle: { depth: 0.5, hold: 0.3, release: 0.7 },
  /** Somebody is talking. Held for the MEASURED length of the line plus a
   *  breath, not a moment — this is the one duck whose duration is a fact
   *  about the file rather than a taste decision. */
  speech: { depth: 0.55, hold: VOICE_LINE.seconds + 0.2, release: 0.6 },
} satisfies Record<string, Moment>;

/**
 * A grind is not a moment, it is a STATE — so it is a flat pull on the music
 * and the wind for as long as the trucks are on the rail, rather than an
 * envelope that decays out from under it. The rail is already 8 dB over the
 * wheels; these take the two things that would fight it down another 2–3.
 */
export const GRIND_DUCK_MUSIC = 0.75;
export const GRIND_DUCK_WIND = 0.7;
