// Locking onto rails and ledges.
//
// A grind is the one place where the ride stops being a ride. The board is
// CONSTRAINED to a line, and everything the model normally integrates — where
// he is, which way he points, how fast he is going — falls out of that
// constraint instead. So this file is the only thing that moves the board while
// the state is "grind": the model hands over at `catch` and takes it back the
// frame `update` says the line is done with him.
//
// The division of labour: the model owns the STATE MACHINE (when you are in a
// grind, what popping out does, what a bail costs). This file owns everything
// INSIDE a grind — which line, which way round the deck sits, how fast it
// scrubs, how the balance drifts, and when it is over.
//
// Nothing here touches the scene, the mixer or the audio. The lock-on is
// announced by the model's own `onGrindStart(kind, line)`, which is where the
// ring of a rail, the callout and the HUD hang — `line.surface` is what tells
// them metal from concrete.

import * as THREE from "three";
import type { GrindLine, SurfaceKind } from "../world/surface";
import { lineHeading } from "../world/surface";
import type { GrindKind, GrindState, Stance } from "./contracts";

// ---------------------------------------------------------------------------
// Feel constants
// ---------------------------------------------------------------------------

// --- catching ---------------------------------------------------------------
/**
 * How generous each sort of line is about being caught, and it is not the same
 * generosity twice.
 *
 * A `rail` is a bar standing on posts. There is nothing else at its height, so
 * anything near it was aimed at it, and it can afford to be magnetic — THPS3's
 * rails read that way and that generosity is what turns "hit the rail" into
 * "aim at the gap and trust it". A `ledge` is the EDGE OF A FLOOR, and the
 * floor is still there beside it: every metre of slack given to a ledge is a
 * metre of ordinary plaza that grabs the board. So a ledge is caught tight.
 *
 * · `reach` — slack on the line's own radius.
 * · `above` / `below` — the vertical window around the line the board has to be
 *   in. Generous above a rail, because the top of an ollie onto a handrail is
 *   genuinely above it and still on its way to it.
 * · `along` / `square` — where the board's TRAVEL has to point, as cos of its
 *   angle to the line. TWO bands, because two different things bring a board to
 *   a line on purpose: riding DOWN it, and dropping SQUARE across it, which is
 *   what a boardslide is when the deck and the travel are the same vector. On a
 *   ledge, in between — call it 45° to 70° across — is nobody's trick; it is a
 *   board cutting a corner over the plaza, and it is where the second-to-last
 *   accidental lock-on lived (11.7 m/s, 60° across a kerb, on the way down). A
 *   bar is a thing in mid-air that nothing reaches by accident, so its two
 *   bands MEET at 45° and it takes any angle at all — but which side of that
 *   meeting point you arrived on still decides whether a RISING board may be
 *   offered it, and that is `RISE_SLOPE` and the square rule below.
 * · `crest` — how far above THIS LINE the top of the current air got. This is
 *   the one that separates an ollie onto a ledge from a board that rolled off
 *   something and drifted over one, and it is deliberately a HEIGHT DIFFERENCE
 *   BETWEEN TWO PLACES rather than anything measured over a frame.
 *
 *   It used to be two tests that disagreed with each other: how far above the
 *   line the board was on the PREVIOUS frame, and how far it had fallen out of
 *   its arc by THIS one. Both are one frame's worth of gravity, so both move
 *   with the refresh rate — measured by flying the same ballistic arc at a
 *   ledge, the lowest ollie the line would still take was 0.66 m of apex at
 *   30 fps, 0.74 at 60, 0.77 at 90 and 0.78 at 144. The constant said 0.70 and
 *   no machine agreed with it: a 12 cm band of pop height where the same trick
 *   caught on one monitor and was silently refused on another, across every
 *   ledge in the spot at once. Asking instead where the TOP of the air was
 *   relative to where the line is answers the same question — did he come from
 *   above, and from far enough above to have meant it — with a number no clock
 *   appears in.
 *
 *   The figures are the ones the old test was aiming at. An ollie is 1.57 m of
 *   air, so it reaches a ledge from 1.02 m above it (`ledge-long`) or 1.45 m
 *   (a kerb). A board rolling off the end of `ledge-long`, off a stair nosing
 *   onto the hubba, or off the angled ledge crests 0.00, 0.18 and 0.49 m above
 *   the line it then drifts over — because it never went up. 0.70 m sits in
 *   that gap with room either side, and now it sits there at every frame rate.
 *   A rail asks for none of it: rising to a handrail off the platform beside it
 *   is exactly what an ollie onto a handrail is.
 */
interface CatchWindow {
  reach: number;
  above: number;
  below: number;
  along: number;
  square: number;
  crest: number;
}
const CATCH: Record<GrindLine["kind"], CatchWindow> = {
  rail: {
    reach: 0.3,
    above: 0.55,
    below: 0.06,
    along: Math.cos((45 * Math.PI) / 180),
    square: Math.cos((45 * Math.PI) / 180),
    crest: 0,
  },
  ledge: {
    reach: 0.1,
    above: 0.35,
    below: 0.06,
    along: Math.cos((45 * Math.PI) / 180),
    square: Math.cos((70 * Math.PI) / 180),
    crest: 0.7,
  },
};
/**
 * How steep a RISING board's flight may be and still be shopping for a line —
 * climb over ground covered, so 1 is 45°.
 *
 * A rising board has to be offered rails at all: an ollie onto the 3.78 m
 * headline handrail crosses its height on the way UP, about 0.7 m in, and is
 * never over it again, so a descent-only question caught 4 m/s and nothing
 * above it. What that generosity also caught, twice in two rounds, was the
 * quarter pipe — a board riding UP a transition passes through the coping's
 * height by definition, and the lock-on turned the spot's marquee launch into
 * a coping stall.
 *
 * Neither is a question about which frame it is; both are a question about how
 * steeply he is flying, and that is a RATIO of the two halves of one step, so
 * it reads the same at 30 fps and at 144. Measured, the two populations do not
 * touch:
 *
 *     ollie rising to the handrail   42°–54°   (slope 0.89–1.36)
 *     riding up through the coping   71°–83°   (slope 2.87–7.70)
 *
 * — over 4 to 6 m/s of approach for the first (above that he is over the rail
 * before he is level with it and the falling catch has him) and 12 to 18 m/s
 * with and without a pop at the lip for the second, at 30, 60 and 144 fps.
 * 60° splits them with a third of the gap either side. Steeper than this and
 * he is going UP something rather than across to something, and the line he is
 * passing is scenery.
 */
const RISE_SLOPE = Math.tan((60 * Math.PI) / 180);
/**
 * How fast you have to be going. A rail does not take you at a crawl, and
 * without this every roll past a ledge ends stuck on top of it.
 */
const MIN_CATCH_SPEED = 1.8;
/**
 * How far the board has to get from where it left a line before that line may
 * take it again — horizontally OR upward. Running off the end leaves the board
 * sitting exactly on the end point at rail height, which is a perfect catch;
 * without this the last metre of every rail is a stutter loop. Popping out
 * clears it on the vertical test inside two frames.
 */
const RECATCH_CLEAR = 0.7;
/**
 * …and a line with less than this much of it left to ride is not offered at
 * all. Clipping the last handspan of a rail is not a grind, but it would still
 * fire a lock-on, a callout and a score before releasing on the next frame.
 */
const MIN_LINE_AHEAD = 0.5;
/**
 * How far the height we last answered at may sit from the height this step
 * began at and still be the SAME step, metres.
 *
 * The ride does not ask on every frame, and the frames it skips are not a
 * detail — they are whole seconds. A grind is asked nothing between the lock-on
 * and the pop out of it; an air the ride did not create with a pop is asked
 * nothing while it climbs; a ragdoll is asked nothing at all. The horizontal
 * half of the step is remembered HERE, so across any of those the remembered
 * "step" quietly becomes the whole grind, or the whole climb, and every line
 * anywhere near several metres of it is offered a board that is nowhere near
 * it. Measured, popping out of `handrail-3` and coming back down: the line took
 * him from **2.72 m away** and then dragged him onto it — 1.28 m in the frame
 * after the catch at 30 fps against a 0.34 m flight step, 0.29 m of the same
 * move at 144, which is why it read as a low-frame-rate bug rather than as a
 * missing question.
 *
 * `q.yPrev` is the one thing that cannot go stale: the ride reads it fresh at
 * the top of every frame it asks. So the height we answered at LAST time is the
 * receipt — if it is where this step began, the two calls are neighbours and
 * the remembered horizontal is a real step. If it is not, frames went by
 * unasked, we do not know what happened in them, and the honest answer is the
 * one we already give on the first frame after a respawn: judge him where he
 * is, and let the next step sweep from here.
 */
const STEP_JOIN = 1e-3;

// --- which grind ------------------------------------------------------------
// The board's yaw against the line is ONE signed number, and all five grinds
// come out of it: how far across tells you how much deck is on the rail, and
// which way tells you which end of it is. Measured as sin(nose − line), so a
// board riding the line backwards classifies the same as one riding it forwards
// — a deck turned end for end is the same deck on the rail.
/** Inside 25° of the line the trucks are simply on it: a 50-50. */
const FIFTY_CROSS = Math.sin((25 * Math.PI) / 180);
/** Past 60° the deck is across the rail rather than along it, and it slides. */
const SIDE_CROSS = Math.sin((60 * Math.PI) / 180);

// --- locking on -------------------------------------------------------------
/**
 * Seconds the board takes to settle onto the line — position, heading and deck
 * angle all eased over the same window. A grind that teleports the board reads
 * as a bug however right the physics after it is, and this is short enough that
 * the lock still feels like a lock and not a magnet dragging you in.
 */
const SNAP_TIME = 0.13;
/**
 * Below this much of your travel lying along the line, "which way am I going
 * down it" is a coin flip — a 90° boardslide entry is 89° or 91° depending on
 * one frame of steer, and getting it backwards slides you away from everything
 * you were aiming at. Inside the deadzone the answer comes from the line
 * instead: you go down whichever half of it is longer.
 */
const PERP_TIE = 0.25;
/**
 * The share of your speed a dead-sideways lock-on keeps. Slapping the deck
 * across a rail costs you something; landing along it costs you nothing.
 */
const ENTRY_KEEP = 0.75;
// --- sliding ----------------------------------------------------------------
/**
 * Constant scrub per surface, m/s². Metal is the fast one and it is why rails
 * ring; waxed concrete drags about four times as hard, which is what makes a
 * ledge a shorter, more deliberate trick than a handrail.
 */
const SURFACE_SCRUB: Record<SurfaceKind, number> = {
  metal: 0.5,
  wood: 1.3,
  concrete: 1.9,
  asphalt: 2.8,
  grass: 6,
};
/**
 * …times how much of the deck is actually touching. A boardslide has the whole
 * underside of the plank on the rail; a 50-50 has two trucks; a nosegrind has
 * one. That ordering is the whole reason a sideways grind is a short, showy
 * trick and a 50-50 carries you the length of the plaza.
 */
const KIND_SCRUB: Record<GrindKind, number> = {
  fifty: 1,
  nosegrind: 0.85,
  smith: 0.9,
  boardslide: 1.7,
  tailslide: 1.65,
};
/** Proportional loss on top, so a fast grind bleeds faster than a slow one. */
const SLIDE_DRAG = 0.1;
/** Gravity along a sloped handrail — the model's, so a rail and a bank agree. */
const GRIND_GRAVITY = 17;
/** Below this you have stalled out and step off; you do not stand on a rail. */
const MIN_GRIND_SPEED = 1.1;

// --- balance ----------------------------------------------------------------
// Deliberately forgiving: this is a flow game. Measured hands-off on a line with
// no end to it, a rail holds him 6.0–8.3 s and a ledge 10.3–14.4 s, and almost no
// grind in a real line runs that long — the meter exists so a LONG grind is a
// decision, not so every grind is a minigame. One tap of A or D at any point
// resets the whole argument.
/** How hard the wander pushes, in balance units per second squared. */
const DRIFT_ACCEL = 1.8;
/** The wander starts at this share of full strength… */
const DRIFT_START = 0.35;
/** …and reaches full over this many seconds on the line. */
const DRIFT_FULL = 3;
/** Inverted pendulum: the further over you already are, the harder it pulls. */
const TIP_GAIN = 0.9;
/** What A/D is worth against all that. Comfortably more than the drift. */
const CORRECT_RATE = 3.4;
/** Bleed on the balance rate, so a correction settles instead of ringing. */
const BALANCE_DAMP = 2.6;
/** A round rail is twitchier than the flat top of a ledge. */
const LINE_TWITCH: Record<GrindLine["kind"], number> = { rail: 1, ledge: 0.78 };
/** …and a grind on one truck is twitchier than one on two. */
const KIND_TWITCH: Record<GrindKind, number> = {
  fifty: 1,
  boardslide: 1.15,
  tailslide: 1.15,
  nosegrind: 1.35,
  smith: 1.3,
};
/**
 * …and a grind ridden switch is twitchier than the same grind ridden regular.
 * Your back foot is on the nose and none of it is where your body expects it —
 * which is the whole reason a switch trick counts for more everywhere else in
 * this game. It is the only thing the stance changes about a grind: WHICH grind
 * you are doing is read off the deck's yaw against the line, and a deck turned
 * end for end sits on the rail exactly the same way whichever way you face.
 */
const SWITCH_TWITCH = 1.18;

// --- bringing it round ------------------------------------------------------
/**
 * How fast steering pulls a sideways deck back square, rad/s — dead across to
 * along the line in 0.26 s under a full input.
 *
 * A boardslide you cannot bring round is not a trick, it is a countdown: the
 * deck locked across the line and stayed there, so every sideways grind that
 * reached the end of its line above `EXIT_BAIL_SPEED` was a guaranteed ragdoll.
 * Rolling away is the whole reward of a boardslide and it has to be earnable.
 *
 * The rail this is measured against is the 3.78 m headline handrail, and the
 * first version of this number did not actually survive it. Two things were
 * wrong. The rail is under the board for LESS than the 3.78 / 14 = 0.27 s the
 * old note quoted, because it drops 1.15 m over its length and hands that back
 * as speed — measured, 0.27 s from the very top and 0.17 s from a catch 40% of
 * the way down. And the lock-on ate the first 0.13 s of it, because `squareDeck`
 * used to sit out the whole `SNAP_TIME`. So of a 0.20 s ride the player got
 * 0.07 s, and 4 rad/s needs 0.17 s to bring the deck from dead across to inside
 * `SIDE_EXIT` — every fast boardslide on that rail was a guaranteed bail.
 *
 * With the input working from the entry frame, 6 rad/s clears the last 40° in
 * 0.116 s and the whole 90° in 0.26 s, and every catch point on that rail at 8,
 * 11 and 14 m/s now rolls away. What it costs is measured as the reaction you
 * are allowed, in frames, before the deck runs out of rail:
 *
 *          caught at   top    ¼ down   ⅖ down   ⅗ down
 *     8 m/s              19       13       10        6
 *    11 m/s              13        8        6        3
 *    14 m/s               9        5        3        1
 *
 * — which is the difficulty curve a boardslide should have. Fast, late and deep
 * is one frame of slack; a mistake there is meant to be a bail.
 */
const DECK_TURN = 6;
/**
 * What that costs. There is ONE steering axis on a rail and the balance already
 * spends it, so pulling the plank round has to be paid for somewhere: while the
 * deck is coming round, the same input is worth this much less against the
 * wander. Full price at dead sideways, free once the deck is square.
 */
const SQUARE_TAX = 0.55;

// --- leaving ----------------------------------------------------------------
/**
 * Run off the end with the deck this far across the line and the trucks catch
 * the ground sideways. That is a bail, and it is the one thing that makes a
 * boardslide a commitment: you have to bring it back round before the rail ends.
 */
const SIDE_EXIT = Math.sin((50 * Math.PI) / 180);
/** …and only if you are carrying enough to fall over. A crawl just steps off. */
const EXIT_BAIL_SPEED = 4;

/** Everything the catch test knows about the board at the moment it lands. */
export interface GrindQuery {
  x: number;
  y: number;
  z: number;
  /**
   * How high the board was when this step began. A catch is a CROSSING and not
   * a proximity test — the board sweeps from here to `y` while it sweeps from
   * wherever it was to (x, z), and the whole test is asked of that sweep, so a
   * fast drop cannot fall straight through a rail and a slow machine cannot
   * step over one. The horizontal half of the step the Grinder remembers for
   * itself; this half the ride already had.
   */
  yPrev: number;
  /** Where the DECK's nose points. Which grind this is comes out of this. */
  heading: number;
  /**
   * Where the board is actually GOING, if that is not where it is pointing.
   *
   * The two came apart the moment the ride started carrying a velocity through
   * the air instead of a heading: a 180 in the air used to curl the flight path
   * round with it, and now the board spins under a straight arc — which is the
   * whole of a boardslide, a deck turned across a line the momentum is still
   * running down. `along` has to be asked of the momentum and `boardAngle` of
   * the deck, so they cannot be the same number. Optional, and absent falls back
   * to the nose (turned round for a fakie roll), which is what it was when
   * heading and travel were the same thing.
   */
  course?: number;
  /** Along-ground speed at touchdown, m/s. Too slow and a rail will not take. */
  speed: number;
  stance: Stance;
  /**
   * True when the wheels are already down and the model is asking whether the
   * line under them takes him.
   *
   * The answer is always no, and that is not a threshold that got tightened —
   * it is the rule. A grind starts when the board leaves the floor. Every
   * ledge line in this plaza lies flush on the top face of the thing it is the
   * edge of, so a board rolling anywhere near one is level with it and there is
   * no measurement that separates "the trucks are on the kerb" from "the wheels
   * are on the pavement beside it": 237 of 576 straight twelve-second rolls
   * with nothing pressed ended locked onto a line, most of them kerbs. You
   * ollie onto an edge. Absent reads as a landing, which is the generous case.
   */
  grounded?: boolean;
}

/**
 * What a grind frame did.
 * - `on`   — still riding it.
 * - `off`  — ran out of line, or popped off the end. Clean; the model drops him
 *            back into the air and lets the normal landing rules take over.
 * - `bail` — lost the balance. The model turns this into a ragdoll.
 */
export type GrindTick = "on" | "off" | "bail";

/** Shortest signed representation of an angle, radians. */
function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Bleed `amount` off a signed value without pushing it past zero. */
function towardZero(value: number, amount: number): number {
  return Math.abs(value) <= amount ? 0 : value - Math.sign(value) * amount;
}

/**
 * Where a line passes the board's STEP, measured in the GROUND PLANE —
 * deliberately not `projectOnLine`. A catch is two separate questions ("is the
 * board over this line" and "is it arriving at its height") and a 3D distance
 * folds them into one number that answers neither: a board a metre above a rail
 * is not a metre off it, it is dead on line and about to land.
 *
 * The step and not the point, because a point is whatever the refresh rate
 * happened to sample. At 14 m/s the board covers 0.47 m of ground per frame at
 * 30 fps and 0.10 m at 144, while a ledge's whole catch corridor is 0.52 m
 * wide — so a slow machine steps clean over lines a fast one rides through, and
 * the same approach caught on one monitor and missed on the other. Closest
 * approach of the step to the line is the answer the frame rate was
 * approximating all along, and every rate gets it exactly.
 *
 * What it does NOT answer is where to PUT the board. That is the one thing a
 * closest approach must not be used for: it is a point on a step the board has
 * already walked past, and locking on there drags it backwards. `tNow` is where
 * the board is; `y` and `s` describe the crossing and are only ever compared
 * against other things measured over the same step.
 */
interface RailHit {
  /** Distance from the board to the line at that moment, ignoring height. */
  flat: number;
  /** The line's own height where it passes — what the board's y is judged against. */
  y: number;
  /**
   * …and WHEN in the step that was: 0 at its start, 1 at its end.
   *
   * Not for placing the board — see above — but for the one question that has to
   * be answered about the moment the trucks arrived rather than about the frame
   * they arrived in. See `Grinder.crossedAt`.
   */
  s: number;
  /**
   * Where the board is NOW along the line — `raw` before the line's own ends are
   * applied to it, `tNow` after — and how high the line is at `tNow`.
   *
   * The PAIR is the whole of "is he alongside this line, or off the end of it",
   * and that question needs asking because `flat` cannot answer it. Closest
   * approach to a SEGMENT rounds the segment's ends off into balls: a board
   * short of a handrail's head measures its distance to the head itself, so it
   * sits inside `radius + reach` — 0.68 m on the six-stair rail — while being
   * nowhere near the steel. See the reach test in `catch`.
   */
  raw: number;
  tNow: number;
  yNow: number;
}

const _hit: RailHit = { flat: 0, y: 0, s: 0, raw: 0, tNow: 0, yNow: 0 };

/**
 * Closest approach between the board's step (x0, z0) → (x1, z1) and the line,
 * both flattened. Two clamped segments, so either end may be the answer.
 */
function nearest(
  line: GrindLine,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  out: RailHit,
): RailHit {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const ex = line.b.x - line.a.x;
  const ez = line.b.z - line.a.z;
  const rx = x0 - line.a.x;
  const rz = z0 - line.a.z;
  const stepLen = dx * dx + dz * dz;
  const lineLen = ex * ex + ez * ez;
  const f = ex * rx + ez * rz;
  let s = 0;
  let t = 0;
  if (stepLen < 1e-12) {
    // Standing still, or a frame whose step we were not shown: a point query,
    // and the one moment it can be talking about is this one.
    s = 1;
    t = lineLen < 1e-12 ? 0 : THREE.MathUtils.clamp(f / lineLen, 0, 1);
  } else {
    const c = dx * rx + dz * rz;
    if (lineLen < 1e-12) {
      s = THREE.MathUtils.clamp(-c / stepLen, 0, 1);
    } else {
      const b = dx * ex + dz * ez;
      const denom = stepLen * lineLen - b * b;
      s = denom > 1e-12 ? THREE.MathUtils.clamp((b * f - c * lineLen) / denom, 0, 1) : 0;
      t = (b * s + f) / lineLen;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / stepLen, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / stepLen, 0, 1);
      }
    }
  }
  out.flat = Math.hypot(x0 + dx * s - (line.a.x + ex * t), z0 + dz * s - (line.a.z + ez * t));
  out.y = line.a.y + (line.b.y - line.a.y) * t;
  out.s = s;
  out.raw = lineLen < 1e-12 ? 0 : (ex * (x1 - line.a.x) + ez * (z1 - line.a.z)) / lineLen;
  out.tNow = THREE.MathUtils.clamp(out.raw, 0, 1);
  out.yNow = line.a.y + (line.b.y - line.a.y) * out.tNow;
  return out;
}

function lineLength(line: GrindLine): number {
  return Math.max(0.01, line.a.distanceTo(line.b));
}

/**
 * Which part of the step is inside `r` sideways of the line — as a span of the
 * step, 0 at its start and 1 at its end. Empty spans come back `lo > hi`.
 *
 * The horizontal and vertical questions are asked of the same span for a
 * reason. Answered over the whole step each, they say "the board was over this
 * line at SOME point and at its height at SOME point" — which at 30 fps and
 * 14 m/s is half a metre of ground apart and takes lines the board flew a metre
 * over. Asked of the overlap, they say what a player would say: it was over the
 * line AND at its height at the same moment.
 */
const _span = { lo: 0, hi: 0 };
function corridor(
  line: GrindLine,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  r: number,
): { lo: number; hi: number } {
  const ex = line.b.x - line.a.x;
  const ez = line.b.z - line.a.z;
  const len = Math.hypot(ex, ez);
  if (len < 1e-6) {
    _span.lo = 0;
    _span.hi = 1;
    return _span;
  }
  // Sideways offset from the line, signed — linear along a straight step.
  const nx = ez / len;
  const nz = -ex / len;
  const d0 = nx * (x0 - line.a.x) + nz * (z0 - line.a.z);
  const d1 = nx * (x1 - line.a.x) + nz * (z1 - line.a.z);
  const swing = d1 - d0;
  if (Math.abs(swing) < 1e-9) {
    _span.lo = 0;
    _span.hi = Math.abs(d0) <= r ? 1 : -1;
    return _span;
  }
  const sa = (r - d0) / swing;
  const sb = (-r - d0) / swing;
  _span.lo = Math.max(0, Math.min(sa, sb));
  _span.hi = Math.min(1, Math.max(sa, sb));
  return _span;
}

/**
 * A stable per-line wander phase, so two rails in the same plaza do not drift
 * you the same way and the same rail always does. Seeded rather than random
 * because a balance you cannot reproduce is a balance you cannot tune.
 */
function phaseOf(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1009;
  return (h / 1009) * Math.PI * 2;
}

export class Grinder {
  /**
   * The grind this Grinder is riding, or null. One Grinder rides one board —
   * the lock-on ease and the balance rate live out here rather than in
   * `GrindState` because they are this lane's business and nothing else reads
   * them.
   */
  private live: GrindState | null = null;
  /**
   * How far the board sits ACROSS the line and above it at the moment it
   * caught, worked off over `SNAP_TIME`. Across and vertical only — the gap
   * ALONG the line is `lead`, and the two are paid for in different currencies.
   */
  private readonly offset = new THREE.Vector3();
  /** How much of that offset is still owed: 1 at the catch, 0 once he is on the line. */
  private ease = 0;
  /**
   * …and how far short of the line he still is ALONG it, metres — 0 the moment
   * the trucks reach it.
   *
   * A catch is allowed to fire before he gets there, and on the short rails that
   * generosity IS the catch: closest approach to a SEGMENT rounds the segment's
   * ends into balls of `radius + reach`, so a rising board is offered a rail
   * from up to 0.68 m off its head. Take that away and `handrail-3` — 1.93 m of
   * steel — cannot be caught at 8 m/s at any frame rate, because one step later
   * he is climbing and already outside the 0.55 m window over it. The head of a
   * rail is a thing the rail reaches out for.
   *
   * What must not pay for that gap is `ease`, and that is the whole of this
   * field. `ease` runs on a CLOCK — smoothstep over `SNAP_TIME` — so a metre of
   * ALONG the line handed to it is a metre covered in 0.13 s whatever the board
   * is travelling at. Measured on the six-stair handrail at 10 m/s: caught
   * 0.567 m short of the head with `t` already reading 0.000, then dragged to
   * 1.303 m down the rail inside 0.133 s — 16.2 m/s of ground under a grind
   * riding at 10.0. Over both maps 207 of 1977 catches carried a gap like that,
   * median 0.441 m and worst 0.676 m, which is a 5 to 8 m/s lurch forward on
   * the frame the line takes you. That is the deck shooting onto the rail
   * rather than settling onto it.
   *
   * So the gap is paid the way every other metre of a line is paid: by RIDING
   * it, at his own speed, before `t` starts moving. It costs at most
   * `(radius + reach) / speed` — 85 ms at 8 m/s, 49 ms at 14 — it needs no rate
   * of its own, and being a distance spent at a speed it reads the same at
   * 30 fps and at 144.
   */
  private lead = 0;
  /** Seconds of lock-on ease left. */
  private snapT = 0;
  /** Heading and deck angle at the moment of the catch, and where they are going. */
  private headOff = 0;
  private angleOff = 0;
  private lockHeading = 0;
  private lockAngle = 0;
  private phase = 0;
  private balanceVel = 0;
  /** Which way round he was standing when the line took him — see `SWITCH_TWITCH`. */
  private stance: Stance = "regular";
  /** The line he just left, and the point he left it at — see `RECATCH_CLEAR`. */
  private spent: string | null = null;
  private readonly spentAt = new THREE.Vector3();
  /**
   * The top of the air he is in — the highest the board has been since the
   * wheels last touched down. `crest` is measured off this.
   *
   * Kept here rather than asked of the model because it is a height and not a
   * rate: a fall of 0.7 m is 0.7 m at 30 fps and at 144, where "how fast is he
   * dropping" is one frame's worth of gravity and reads four times bigger on
   * the slow machine. Grounded frames still come through `catch` — the ride
   * asks on every rolling frame — so this resets itself.
   *
   * Sampling it per frame costs nothing, because an arc is FLAT at its top:
   * whichever two samples straddle the apex, the higher of them is inside
   * g·dt²/8 of it — 2.4 mm at 30 fps, 0.1 mm at 144.
   */
  private airPeak: number | null = null;
  /**
   * Where the board was the last time we were asked, so a step is a vector
   * rather than a height. Only its SHAPE is used — climb against ground
   * covered — which is why it needs no `dt`: both halves scale with the frame
   * and the ratio does not.
   *
   * `prevY` is not used as a height at all — it is the receipt that says the
   * last answer and this question are one frame apart. See `STEP_JOIN`.
   */
  private prevX = 0;
  private prevY = 0;
  private prevZ = 0;
  private stepped = false;
  /**
   * How far into the last caught step the trucks actually met the line — 0 at
   * its start, 1 at its end. Read it straight after a `catch` that returned a
   * state; it means nothing otherwise.
   *
   * This exists for the ride's one sub-frame question. A rail is a landing
   * surface and it asks the landing's first question — is the board CAUGHT? —
   * but `flip` is advanced a whole frame at a time, so asking it at the END of
   * the frame the trucks arrived in asks it up to 33 ms late at 30 fps and 7 ms
   * late at 144. Measured across 3520 approaches at five rates, that is where
   * the last of the grind/BAIL disagreements live: a 90° kickflip at the
   * 3.78 m handrail at 14 m/s grinds at 30 fps and slams at 45 and above, off
   * the same trick flown down the same arc. Where the board is when it meets a
   * line is a question about the step, not about the frame, and the step is the
   * only thing this file knows that the ride does not.
   */
  crossedAt = 1;
  /**
   * Whether the line the last `catch` handed over was met ACROSS rather than
   * ridden ALONG — the deck dropped square onto the steel instead of running
   * down it. Read it straight after a `catch` that returned a state; it means
   * nothing otherwise, exactly like `crossedAt`.
   *
   * It is a REPORT and not a rule. Both entries are real grinds and this file
   * takes them both, on the same `square` band the candidate loop already
   * decides them with. What it exists for is the ride's one question that no
   * geometry can answer: a square-across ollie at a bar and an ollie OVER that
   * bar to get past it are the same approach, the same arc and the same frame,
   * and only the player knows which he meant. Measured on
   * `tools/grind-auto.mjs`, over 1432 hops taken at 65° and 90° across every
   * line in the spot with the run-up swept over the whole arc, **165 come back
   * as a catch** — while the same lines ridden along their length report a
   * crossing share of zero. So the ride offers an ALONG entry on its own and
   * asks for the slide key before it takes a square one. See
   * `SkateModel.tryCatchGrind`.
   */
  squareEntry = false;

  /**
   * "Is there a line to catch here?" — asked on EVERY airborne frame, before
   * the ground test, because a rail sits above the floor it stands on.
   *
   * EVERY frame, not only the falling ones: an ollie onto a handrail RISES to
   * it off the platform beside it, crosses its height about a metre in, and is
   * never anywhere near it again — a descent-only question can only catch a
   * rail the hang time happens to end on top of, which on the 3.78 m headline
   * rail meant 4 m/s and nothing above it.
   *
   * Returns null to decline. Returning a state hands the ride over: the model
   * takes `heading` and `speed` from it and stops integrating position itself.
   */
  catch(q: GrindQuery, rails: readonly GrindLine[]): GrindState | null {
    // Being asked at all means we are airborne, so anything still marked live
    // was ended by the model without us — Space popped him out of it. Remember
    // where, so the rail underneath does not immediately take him back.
    if (this.live) this.retire(this.live);
    // Where the board came FROM in the ground plane — the vertical half of the
    // step is `q.yPrev`, which the ride already keeps; only the horizontal half
    // had nowhere to live. Taken before anything can return early, or a frame
    // we declined would make the next step read as a leap.
    //
    // …and only if the two halves are the SAME step. `STEP_JOIN` is the whole
    // of that test: the ride skips whole grinds, whole climbs and whole
    // ragdolls without asking, and a remembered horizontal from before one of
    // those is not a step, it is a chord across a minute of play.
    const joined = this.stepped && Math.abs(this.prevY - q.yPrev) < STEP_JOIN;
    const fromX = joined ? this.prevX : q.x;
    const fromZ = joined ? this.prevZ : q.z;
    this.prevX = q.x;
    this.prevY = q.y;
    this.prevZ = q.z;
    this.stepped = true;
    const climb = q.y - q.yPrev;
    const run = Math.hypot(q.x - fromX, q.z - fromZ);
    // The top of this air, before anything else: a grounded frame IS the top of
    // the air that has not started yet, and a board higher than the peak so far
    // is the new peak.
    if (this.airPeak === null || q.grounded || q.y > this.airPeak) this.airPeak = q.y;
    if (q.grounded) return null;
    if (Math.abs(q.speed) < MIN_CATCH_SPEED) return null;
    // Is he still going up, and if so is he flying at a line or climbing past
    // one? See `RISE_SLOPE`. A dead-vertical step covers no ground at all, so
    // it is steep by definition and the guard needs no special case for it.
    // Climbing past a line is not arriving at one, whatever else is true.
    const rising = climb > 0;
    if (rising && climb > RISE_SLOPE * run) return null;

    // Where he is actually going, which is not where he is pointing once a spin
    // has turned the deck under him or a transition has rolled him back down it
    // fakie.
    const travel = q.course ?? (q.speed < 0 ? q.heading + Math.PI : q.heading);
    let line: GrindLine | null = null;
    // Nothing but the closest approach and its moment survive the loop. WHERE
    // the step met the line is deliberately not among them — see the note below.
    let bestFlat = Infinity;
    let bestS = 1;
    let bestT = 0;
    let bestDir: 1 | -1 = 1;
    let bestAlong = 1;
    for (const candidate of rails) {
      const w = CATCH[candidate.kind];
      nearest(candidate, fromX, fromZ, q.x, q.z, _hit);
      if (_hit.flat > candidate.radius + w.reach) continue;
      if (_hit.flat >= bestFlat) continue;
      // …and it has to have come from far enough above THIS line. See `crest`.
      // Asked about the line UNDER HIM, not about the line under the crossing:
      // on the hubba, which drops 0.31 m for every metre of its length, the
      // closest approach of the step sits 0.14 m further down the slope at
      // 30 fps than at 144, and the crest test is a comparison against 0.70 m
      // flat. Rolling off the top of the 6-stair measures 0.70 m of crest over
      // the hubba almost exactly, so that 0.14 m was the whole answer: the same
      // roll caught at 144 fps and was refused at 30. Where he is has no clock
      // in it.
      if (this.airPeak - _hit.yNow < w.crest) continue;
      // Is he riding this line, dropping the deck square across it, or just
      // cutting a corner over it? On a ledge the third one is a board crossing a
      // kerb on its way over the road, and it is declined.
      const axis = lineHeading(candidate);
      const along = Math.cos(travel - axis);
      const lie = Math.abs(along);
      if (lie < w.along && lie > w.square) continue;
      const crossing = lie <= w.square;
      // A line you are riding straight AT is not a grind; a line you are
      // falling onto across is. Square to a transition's coping, RISING, from
      // below, is the single most ordinary thing anyone does on a quarter pipe
      // — 28 of 70 approaches used to come back as a coping slide instead of an
      // air — so a deck put across a line has to be on its way down onto it.
      if (crossing && rising) continue;
      // Was the board inside this line's vertical window WHILE it was over the
      // line? Height sweeps linearly along the step, so the piece of it spent
      // in the corridor is one comparison — and it has to be a piece of the
      // step and not its end, for the same reason the horizontal test sweeps. A
      // board falling 7 m/s crosses a ledge's 0.41 m window in 0.06 s, which is
      // one and a half frames at 30 fps: sampling the ends alone drops the line
      // on a slow machine and takes it on a fast one. This also subsumes the
      // old straddle test outright — a board falling three metres in one step
      // spans the window rather than skipping it.
      const span = corridor(candidate, fromX, fromZ, q.x, q.z, candidate.radius + w.reach);
      if (span.lo > span.hi) continue;
      const dyIn = q.yPrev + climb * span.lo - _hit.y;
      const dyOut = q.yPrev + climb * span.hi - _hit.y;
      if (Math.min(dyIn, dyOut) > w.above || Math.max(dyIn, dyOut) < -w.below) continue;
      if (candidate.id === this.spent && !this.cleared(q)) continue;
      // Down the line the way he is already going — except when he is crossing
      // it near enough to square that the sign is noise, and then down the
      // longer half of it, which is the one worth sliding.
      const dir: 1 | -1 =
        Math.abs(along) >= PERP_TIE ? (along > 0 ? 1 : -1) : _hit.tNow < 0.5 ? 1 : -1;
      // …and how much of it is left to ride, asked from where he IS. This is a
      // refusal of the CANDIDATE and not of the catch, which is what
      // `MIN_LINE_AHEAD` says in words ("not offered at all") and is the whole
      // difference on a chained line. Map 2 builds its ledges, copings, pipes
      // and rails as collinear segments that meet end to end — `island-w-0/1/2`,
      // `bowl-coping-w-0…4`, `service-pipe-0/1/2`, `apron-rail-e-0…3` — so at
      // every joint the nearest line is a tie, the tie goes to whichever came
      // first out of `rails()`, and if that is the one ENDING there the catch
      // used to be dropped outright while 5.6 m of the next segment sat under
      // the trucks. Measured down the `island-w` chain, that was a hole at each
      // joint that took the whole catch with it. Skipping the candidate lets the
      // segment he is actually riding onto answer instead.
      if ((dir === 1 ? 1 - _hit.tNow : _hit.tNow) * lineLength(candidate) < MIN_LINE_AHEAD)
        continue;
      line = candidate;
      bestFlat = _hit.flat;
      bestS = _hit.s;
      bestT = _hit.tNow;
      bestDir = dir;
      bestAlong = along;
    }
    if (!line) return null;

    // Where he is NOW along the line, which is not where the step crossed it.
    //
    // The sweep above is a DETECTION — did this step meet this line — and the
    // crossing it finds is where in the STEP that happened, which at 30 fps and
    // 14 m/s is most of half a metre behind him and at 144 fps a centimetre. Riding
    // from there means the lock-on walks him BACKWARDS down the rail for the
    // whole of `SNAP_TIME`, by however much of the step was left when he
    // crossed: measured off a pop out of `handrail-3`, 1.28 m in the frame
    // after the catch at 30 fps against a 0.34 m flight step, 0.91 at 45, and
    // 0.29 at 144 — the same trick moving four times as far on the slow
    // machine. He rides from where he IS. Only the offset the ease works off is
    // allowed to be a measurement, and that is now purely the gap ACROSS the
    // line: a settle sideways onto it, never a haul along it. `raw` is what makes
    // that true rather than hoped for — inside the line's own ends it says `t` is
    // his foot of perpendicular and there is no along-component to work off; off
    // them it says exactly how much there is, and that much goes to `lead` to be
    // ridden rather than to `ease` to be timed out.
    //
    // …and how much line is left was asked the same way, of the same `t`, back
    // in the loop where the candidate could still be swapped for a better one.
    // The crossing is up to a whole step back up the rail, which is the slack
    // `MIN_LINE_AHEAD` exists to close: measured at 14 m/s down `ledge-long-e`,
    // the crossing said 0.64 m of ledge left where there were 0.17 m, and the
    // ride paid out a grind that was over in one frame.
    const t = bestT;
    const axis = lineHeading(line);
    const along = bestAlong;
    const dir = bestDir;
    const heading = dir === 1 ? axis : wrap(axis + Math.PI);

    // The deck's yaw against the direction of travel down the line. Everything
    // about which grind this is comes out of this one signed number.
    const rel = wrap(q.heading - heading);
    const cross = Math.sin(rel);
    const kind = classify(cross);

    this.live = {
      kind,
      line,
      t,
      dir,
      // Heading and deck angle both start where the board actually was and are
      // eased onto the line below. Their SUM is the nose's world direction, and
      // that sum is what must not jump.
      heading: travel,
      boardAngle: wrap(q.heading - travel),
      speed: Math.abs(q.speed) * (ENTRY_KEEP + (1 - ENTRY_KEEP) * Math.abs(along)),
      balance: 0,
      elapsed: 0,
    };
    this.lockHeading = heading;
    this.lockAngle = settleAngle(kind, rel);
    // Both wrapped: the deck takes the SHORT way round to where it settles, or
    // a fakie entry — whose deck angle is already ±π — spins a whole turn on
    // the way in.
    this.headOff = wrap(this.live.heading - this.lockHeading);
    this.angleOff = wrap(this.live.boardAngle - this.lockAngle);
    this.snapT = SNAP_TIME;
    this.ease = 1;
    this.phase = phaseOf(line.id);
    this.balanceVel = 0;
    this.stance = q.stance;
    this.spent = null;
    this.crossedAt = bestS;
    // Along or across — read off the same `along` the winner was chosen with,
    // against the same band the loop used, so this cannot disagree with the test
    // that let the line in. (The loop throws out everything BETWEEN the two
    // bands, so what survives is one or the other and there is no third case.)
    this.squareEntry = Math.abs(along) <= CATCH[line.kind].square;
    // The board is left exactly where it landed and walked onto the line from
    // there. `place` adds this back, so the lock-on frame moves nothing at all.
    //
    // `wide` is now a pure ACROSS measurement and cannot be anything else: the
    // catch refuses a line he is off the end of, so `t` is his own foot of
    // perpendicular and `q − line(t)` is square to the line by construction. It
    // used to carry the along-line overhang as well, and easing THAT off is what
    // the deck scrubbing forward onto a rail was.
    //
    // …up to the window the line caught him through, and no further. The
    // vertical test is a SWEEP — a board falling fast enough passes clean
    // through a rail inside one frame and is caught for it, which is the whole
    // point of sweeping — so the frame it is caught ON can end metres below the
    // thing it just caught. Handing that back as an offset parks the deck under
    // the rail for the length of the ease. The catch window is exactly how far
    // outside a line the ride is willing to call it a catch, so it is also how
    // far outside one the board may be put.
    const w = CATCH[line.kind];
    const onX = line.a.x + (line.b.x - line.a.x) * t;
    const onZ = line.a.z + (line.b.z - line.a.z) * t;
    const onY = line.a.y + (line.b.y - line.a.y) * t;
    // The ground-plane gap, split in the LINE's own frame, because its two
    // halves are not the same kind of thing. ACROSS is a settle and the ease
    // owns it. ALONG is ground he has not covered yet, and the only honest way
    // to cover ground is to ride it — see `lead`.
    const ux = Math.sin(axis);
    const uz = Math.cos(axis);
    const gapX = q.x - onX;
    const gapZ = q.z - onZ;
    const gapAlong = gapX * ux + gapZ * uz;
    // Behind him it would be a haul BACK up the line, and there is none to be
    // had: `t` is clamped to the line's own ends, so a non-zero along-gap means
    // he is off an end, and `MIN_LINE_AHEAD` has already refused the end he is
    // riding AWAY from. Clamped anyway, because a lead that could go negative is
    // a board the line drags backwards.
    this.lead = Math.max(0, -dir * gapAlong);
    const sideX = gapX - gapAlong * ux;
    const sideZ = gapZ - gapAlong * uz;
    const wide = Math.hypot(sideX, sideZ);
    const keep = wide > 1e-6 ? Math.min(1, (line.radius + w.reach) / wide) : 0;
    this.offset.set(
      sideX * keep,
      THREE.MathUtils.clamp(q.y - onY, -w.below, w.above),
      sideZ * keep,
    );
    return this.live;
  }

  /**
   * One frame of a grind: settle the lock-on, scrub the speed for what the deck
   * is on, walk `t` down the line, and let the balance wander while A/D fights
   * it.
   */
  update(state: GrindState, steer: number, dt: number): GrindTick {
    const line = state.line;
    const len = lineLength(line);

    // --- bringing the deck round ---------------------------------------------
    // How much plank is still lying across the line. It decides the scrub, the
    // twitch, what the steering costs, and whether running off the end is a
    // roll-away or a bail — so it is measured once, before the input moves it.
    const across = Math.abs(Math.sin(state.boardAngle));
    // Steering moves where the deck is SETTLING, not the eased angle on screen.
    // Two writers on one number is this project's oldest bug, and the lock-on
    // is already writing `boardAngle` — so the input goes to the target and the
    // ease still carries the entry discontinuity off on top of it. That is also
    // what stops the first 0.13 s of a rail being dead: on the 3.78 m headline
    // handrail at 14 m/s the whole ride is 0.20–0.27 s, so a lock-on that ate
    // the first half of it made every fast boardslide a guaranteed bail.
    const squaring = this.squareDeck(steer, dt);

    // --- the lock-on, easing off ---------------------------------------------
    if (this.snapT > 0) {
      this.snapT = Math.max(0, this.snapT - dt);
      const k = this.snapT / SNAP_TIME;
      this.ease = k * k * (3 - 2 * k); // 1 at the catch → 0 once he is on it
      state.heading = wrap(this.lockHeading + this.headOff * this.ease);
    } else {
      this.ease = 0;
      state.heading = this.lockHeading;
    }
    state.boardAngle = this.lockAngle + this.angleOff * this.ease;

    // --- speed ---------------------------------------------------------------
    // A handrail that drops a metre over its length is a free metre of speed,
    // for the same reason a bank is.
    const rise = ((line.b.y - line.a.y) / len) * state.dir;
    state.speed -= GRIND_GRAVITY * (rise / Math.hypot(1, rise)) * dt;
    state.speed = towardZero(
      state.speed,
      SURFACE_SCRUB[line.surface] * byDeck(state.kind, KIND_SCRUB, across) * dt,
    );
    state.speed -= state.speed * SLIDE_DRAG * dt;
    if (state.speed < MIN_GRIND_SPEED) return this.leave(state, "off");

    // --- balance -------------------------------------------------------------
    // Two sines that never line up, so the push wanders instead of ticking, and
    // it grows with time on the line: the first second of any grind is free.
    const w = state.elapsed;
    const ramp = Math.min(1, DRIFT_START + w / DRIFT_FULL);
    const twitch =
      LINE_TWITCH[line.kind] *
      byDeck(state.kind, KIND_TWITCH, across) *
      (this.stance === "switch" ? SWITCH_TWITCH : 1);
    const drift =
      DRIFT_ACCEL *
      ramp *
      twitch *
      (Math.sin(1.7 * w + this.phase) + 0.6 * Math.sin(2.9 * w + 2.1 * this.phase));
    // A/D corrects the way it steers: press left and the board comes back left.
    // Same sign as the ride's own lean channel, which is what the model then
    // shows the balance through. Whatever share of it went into hauling the
    // plank round is not also available to fight the wander.
    const correct = CORRECT_RATE * (1 - (squaring === 0 ? 0 : SQUARE_TAX * across));
    this.balanceVel += (drift + TIP_GAIN * twitch * state.balance + steer * correct) * dt;
    this.balanceVel *= Math.exp(-BALANCE_DAMP * dt);
    state.balance = THREE.MathUtils.clamp(state.balance + this.balanceVel * dt, -1, 1);
    if (Math.abs(state.balance) >= 1) return this.leave(state, "bail");

    // --- down the line -------------------------------------------------------
    // The last few centimetres UP TO the line come first and are bought with the
    // same metres — a line caught off its own end is a line he has not reached,
    // and `t` does not move until he has. See `lead`.
    let step = state.speed * dt;
    if (this.lead > 0) {
      const paid = Math.min(this.lead, step);
      this.lead -= paid;
      step -= paid;
    }
    state.t += (state.dir * step) / len;
    // …and the end test waits for him too, or a catch at `t` 0 riding towards 1
    // would run off the line on the frame it caught, before he ever reached it.
    if (this.lead <= 0 && (state.t <= 0 || state.t >= 1)) {
      state.t = THREE.MathUtils.clamp(state.t, 0, 1);
      // Off the end with the deck still across it and the trucks land sideways.
      const caught = Math.abs(Math.sin(state.boardAngle)) > SIDE_EXIT && state.speed > EXIT_BAIL_SPEED;
      return this.leave(state, caught ? "bail" : "off");
    }
    return "on";
  }

  /**
   * Where the board's contact point is this frame, in world space: down the
   * line at `t`, short of it by whatever of the lead-in is unridden, and out to
   * the side by whatever of the entry offset is still owed.
   */
  place(state: GrindState, out: THREE.Vector3): THREE.Vector3 {
    out.copy(state.line.a).lerp(state.line.b, state.t).addScaledVector(this.offset, this.ease);
    if (this.lead > 0) {
      const axis = lineHeading(state.line);
      out.x -= Math.sin(axis) * state.dir * this.lead;
      out.z -= Math.cos(axis) * state.dir * this.lead;
    }
    return out;
  }

  /**
   * The board's yaw for the visual: the line's heading plus however far round
   * the deck is sitting on it. Straight is a 50-50, square across is a
   * boardslide, and everything the animation layer mirrors reads off this.
   */
  boardHeading(state: GrindState): number {
    return state.heading + state.boardAngle;
  }

  /**
   * Steering while the deck lies across the line hauls it back round, and the
   * amount it moved this frame is returned so the balance knows what that cost.
   *
   * You press the way the NOSE has to swing, which is the same thing A and D
   * mean everywhere else in this game. Screen-right is DECREASING heading (the
   * ride's own derivation, `forward = (sin h, 0, cos h)` with the camera
   * behind), and the deck's world heading is `heading + boardAngle` — so a
   * boardslide, which settles at `+π/2`, has its nose off to the screen-LEFT of
   * the line, and D swings it back. A tailslide settles at `−π/2`, nose off to
   * the screen-RIGHT, and A brings that one round. The other key is still a
   * full balance correction and moves the deck not at all — the rail is under
   * the plank and it does not let you screw yourself further across it. That
   * asymmetry is the commitment: there is ONE stick on a rail, and a wander
   * that wants the other way makes coming round a decision about when rather
   * than a formality.
   */
  private squareDeck(steer: number, dt: number): number {
    if (steer === 0) return 0;
    const a = this.lockAngle;
    // The square the nose is nearer to. Dead sideways is the same distance from
    // both, and the tie goes to nose-forward: you roll away out of a boardslide
    // the way you went into it, not fakie.
    const target = Math.abs(a) <= Math.PI / 2 ? 0 : Math.sign(a) * Math.PI;
    const off = a - target;
    if (Math.abs(off) < 1e-3) return 0; // already along the line
    const step = -steer * DECK_TURN * dt;
    if (Math.sign(step) !== -Math.sign(off)) return 0;
    const moved = Math.sign(step) * Math.min(Math.abs(step), Math.abs(off));
    this.lockAngle = a + moved;
    return moved;
  }

  /** Forget the line he was on. The model's `reset()` wants this. */
  reset(): void {
    this.live = null;
    this.spent = null;
    this.ease = 0;
    this.snapT = 0;
    this.lead = 0;
    this.airPeak = null;
    // A respawn teleports him; the step across that jump is not a flight path.
    this.stepped = false;
  }

  private leave(state: GrindState, tick: GrindTick): GrindTick {
    this.retire(state);
    return tick;
  }

  /** Remember the line and the spot, so it cannot take him again on the spot. */
  private retire(state: GrindState): void {
    // Read the spot BEFORE the lead-in is dropped: where he left the line is
    // where the board actually was, lead and all, and `RECATCH_CLEAR` is
    // measured from it.
    this.place(state, this.spentAt);
    this.spent = state.line.id;
    this.live = null;
    this.ease = 0;
    this.snapT = 0;
    this.lead = 0;
  }

  /** Has he got far enough from where he left that line for it to count again? */
  private cleared(q: GrindQuery): boolean {
    return (
      Math.hypot(q.x - this.spentAt.x, q.z - this.spentAt.z) > RECATCH_CLEAR ||
      q.y - this.spentAt.y > RECATCH_CLEAR
    );
  }
}

/**
 * A per-grind number that follows the DECK rather than the name of the trick.
 *
 * Only the sideways grinds have anything to follow: a boardslide is worth 1.7
 * of scrub because the whole underside of the plank is on the rail, and a
 * boardslide the player has hauled back square is not — it is two trucks on a
 * rail wearing a boardslide's name. The straight grinds settle along the line
 * and stay there, so they are their own constant.
 */
function byDeck(kind: GrindKind, table: Record<GrindKind, number>, across: number): number {
  if (kind !== "boardslide" && kind !== "tailslide") return table[kind];
  return table.fifty + (table[kind] - table.fifty) * across;
}

/**
 * Which grind, from one signed number: how far the deck sits across the line of
 * travel, `sin(nose − line)`.
 *
 * Measuring it as a sine rather than an angle is what makes it stance-blind and
 * fakie-blind — a deck turned end for end is the same deck on the rail, and it
 * classifies the same. The MAGNITUDE says how much plank is touching: along the
 * rail the trucks are on it, across it the underside is. The SIGN says which
 * way the deck is twisted, and that is what decides which end of it the rail
 * has: twisted one way the weight is over the nose, the other way it is over
 * the tail. Nose and tail, at both magnitudes, are the four grinds either side
 * of the 50-50.
 */
function classify(cross: number): GrindKind {
  const across = Math.abs(cross);
  if (across <= FIFTY_CROSS) return "fifty";
  if (across <= SIDE_CROSS) return cross > 0 ? "nosegrind" : "smith";
  return cross > 0 ? "boardslide" : "tailslide";
}

/**
 * Where the deck settles once it is locked on. The straight grinds lie along
 * the line — whichever way round it already is, so a fakie 50-50 keeps its nose
 * where the nose was — and the sideways ones square up across it.
 */
function settleAngle(kind: GrindKind, rel: number): number {
  if (kind === "boardslide") return Math.PI / 2;
  if (kind === "tailslide") return -Math.PI / 2;
  return Math.abs(rel) <= Math.PI / 2 ? 0 : Math.sign(rel) * Math.PI;
}
