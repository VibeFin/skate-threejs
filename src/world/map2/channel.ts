// THE FLUME — map 2's ground, as one closed-form surface.
//
// Map 1 is a plaza, and a plaza is a pile of yawed boxes: `spot.ts` describes it
// as ~30 solids and answers a height query by asking every one of them. That is
// the right shape for a place made of separate objects, and it is the wrong
// shape for a drainage channel, which is ONE object 400 m long that never stops
// being itself. Described as boxes a flume is four hundred slabs whose seams the
// board can find; described as a FIELD it is three functions of z and one
// cross-section, it has no seams at all, and there is ground under every query
// anywhere in the world — which is the bug class `WALL_TUCK` exists to paper
// over in map 1 and which simply cannot be written here.
//
// So the discipline is map 1's — one description, read by the mesh AND by the
// surface query, never two — and the vocabulary is this map's own:
//
//   world (x, z)  →  s = z,  u = x − centreX(z)          (exact, no search)
//   y(x, z)       =  floorY(s) + cross(|u|, section(s))
//
// `centreX` is the channel's meander in plan, `floorY` its fall, and `cross` its
// shape from the middle out: dished floor, trickle groove, transition, wall,
// crest, freeboard apron, parapet, walkway, rock cut, hillside. Every one of
// them is C1 in its own variable, which is not a tidiness point — it is the
// whole reason a player who never touches W ends up fast. See `THE GRADIENT
// DOES THE PUSHING`, and then `THE BANK IS A THING YOU USE`, which is the half
// of the ticket the first cut of this file got wrong.
//
// The cross-section is measured PERPENDICULAR TO Z rather than perpendicular to
// the meandering centreline. Over the bends this file actually uses (|dx/dz| ≤
// 0.23) that is a shear of at most 2.6% on the section's width, which is under
// the width of a coping — and it buys an exact inverse instead of an iterative
// one, which is what makes `blocked()` cheap enough to be walked in 5 cm pieces
// four hundred times a frame.

/**
 * THE GRADIENT DOES THE PUSHING — and these are the numbers it is built on.
 *
 * The ride's own force balance (`skate-model.ts`) settles a coasting board at
 * `g·sinθ = ROLL_DRAG·v + ROLL_FRICTION`, i.e. `v = (17·sinθ − 0.55) / 0.16`.
 * So:
 *
 *   grade 0.10 →  7.2 m/s      grade 0.18 → 15.7 m/s
 *   grade 0.14 → 11.4 m/s      grade 0.24 → 20.4 m/s
 *   grade 0.16 → 13.6 m/s      grade 0.26 → 21.8 m/s
 *
 * `MAX_SPEED` — the fastest a player can PUSH himself — is 17. Everything at or
 * over 0.20 therefore hands a rider who never touches the throttle more speed
 * than the throttle can give him, which is the ticket's ask stated as a
 * measurement rather than as an intention. The chute at the top is 0.26 and 50 m
 * long: it is not a hill, it is the map's engine.
 *
 * The other half of that ask is that the ride must not FIGHT the gradient, and
 * that is a fact about curvature rather than about slope. `lipDecision` throws
 * the board off any convex break whose tangent turns more than `CORNER_HOLD`
 * (0.35 rad) across the board's own 0.5 m bridge — so a grade change is safe
 * exactly while its radius stays over ~0.7 m, and every blend in `PROFILE`
 * below is spread over ten metres or more, which is a radius of fifty. The
 * floor never throws anybody. Everything in this map that flies does it off a
 * FEATURE that was put there to fly you (`features.ts`), or off one of the two
 * drop structures, and those are the only two kinds of thing that do.
 */

/**
 * THE BANK IS A THING YOU USE — and this is the half of the ticket the first
 * cut of this map wrote in prose and did not build.
 *
 * The claim was "a carve up a 46° transition and back down is worth what it
 * cost, because `fall()` is energy-conserving". `fall()` is; the SHAPE was not.
 * Measured on the real ride over the real surface, one 0.35 s press of the
 * carve key at twelve stations down the channel: 55 → 18, 49 → 25, 47 → 0,
 * 88 → 7, 86 → 59, 79 → 43-riding-backwards. At 0.7 s, eleven of twelve runs
 * ended at or under 16 km/h. So the number to design against is not the
 * transition's angle at all. It is these three facts about the ride:
 *
 *  1. **A carve is a heading change that never comes back.** One 0.35 s press
 *     at 14 m/s swings the deck 31° and leaves it there — nothing in the ride
 *     steers a board back down a bank, because a board goes exactly where its
 *     nose points. So every carve is a rider crossing the channel at a fixed
 *     angle until he does something else, and whatever is at the far side of
 *     that crossing is what the carve is worth.
 *  2. **Height is charged as energy, and only height.** Climbing `h` costs
 *     `sqrt(2·17·h)` off the top of your speed whatever the wall's angle is —
 *     a 46° ramp and a vert wall bill the same metre identically. A 5.4 m bank
 *     is therefore a 13.5 m/s toll gate: it eats a 50 km/h run whole, and what
 *     comes back down comes back down the way it went up, which is UPSTREAM.
 *  3. **What runs out of speed reverses.** `roll()` puts a board that cannot
 *     finish a climb back where it started and sends it down fakie. That is
 *     correct for a quarter pipe and it is the end of a run in a flume, because
 *     the only engine this map has is downhill.
 *
 * So the bank is bounded rather than tall. The RIDEABLE part of it — `bank`
 * below — is 2.0 to 3.4 m, sized per reach at about 45% of the kinetic head
 * (`v²/2g`) the reach's own coasting speed carries, so that a full-commitment
 * carve reaches the crest with two thirds of its speed still on and a light one
 * turns round half way up and gets all of it back. Above that height the wall
 * stops being a ramp:
 *
 *   · **the crest is ROLLED**, at 1.7 m or more, everywhere except the bowl.
 *     `lipDecision` rides any convex break turning under 0.35 rad over the
 *     board's own half-metre bridge, and 0.5/0.35 = 1.43 m is the radius that
 *     buys that at every speed. A rolled crest cannot throw you out of the
 *     ditch however fast you take it.
 *   · **behind the crest is the FREEBOARD APRON**, three to six metres of
 *     concrete rising OUTWARD at 0.18 to 0.34. It is what a real channel has
 *     above its design flow and it is the piece that does the work: a rider who
 *     tops the transition rolls onto ground that tips back into the flume, so
 *     he is returned rather than parked. Nothing in this map's cross-section is
 *     flat except the walkway, and the walkway is behind a wall.
 *   · **behind the apron is the PARAPET**, 1.4 to 2.6 m of near-vertical
 *     freeboard wall with the fence on top. At `PARAPET_SLOPE` it rises 0.48 m
 *     across the ride's own 5 cm wall step against a 30 cm probe, so `blocked()`
 *     stops the board on it — you cannot leave the channel, in the air or on the
 *     wheels, anywhere in 450 m. It is also the best graffiti wall in the map,
 *     which is not a coincidence: it is the only big flat face in a section made
 *     of curves.
 *
 * The BOWL is the one exception and it is the exception on purpose — see
 * `SECTIONS`. Its coping is sharp, so carrying enough speed up its 46° wall
 * boosts you out over the coping, and its apron is six and a half metres wide
 * because that is how far a 12 m/s boost off a 46° lip actually travels.
 */

/** A station on the long profile: the fall in metres per metre from here on. */
interface Station {
  z: number;
  /** Drop per metre travelled downstream. Interpolated LINEARLY to the next. */
  grade: number;
  /**
   * …and a drop structure AT this station: the whole section steps down by this
   * much, instantly. The one deliberate break in an otherwise C1 floor — see
   * `STEPS` and the note on `floorY`.
   */
  drop?: number;
}

/**
 * The long profile, top to bottom. Read it as the map's script.
 *
 * Grade is interpolated linearly between stations, so the FLOOR is piecewise
 * quadratic and C1 everywhere except at the two drops. Blends are never shorter
 * than 8 m: over 8 m the sharpest change here (0.16 → 0.42 at the first
 * landing) is a radius of 46 m, sixty times the radius the ride lets go of.
 */
const PROFILE: readonly Station[] = [
  // --- the headworks: the apron under the road, where a run starts ----------
  //
  // 0.09 and not flat, and that is the ticket's own ask taken literally. The
  // ride only starts rolling when gravity beats `ROLL_FRICTION` — `g·sinθ >
  // 0.55`, i.e. a grade over 0.033 — so a level apron is a start line a player
  // who never touches the throttle never leaves. At 0.09 the apron drains the
  // way a real headworks does and hands you about 5 m/s at the mouth, which is
  // exactly enough that the chute has something to work on.
  { z: -34, grade: 0.09 },
  { z: -6, grade: 0.09 },
  // --- THE CHUTE: narrow, steep, and the whole reason this map exists --------
  { z: 6, grade: 0.26 },
  { z: 52, grade: 0.26 },
  // --- THE LEDGE RUN: it opens out and the obstacles start -------------------
  { z: 66, grade: 0.14 },
  { z: 118, grade: 0.14 },
  // --- THE BOWL: wide, big transitions — the carving room -------------------
  //
  // 0.16, and the first two cuts were 0.085 and 0.13. Measured coasting from
  // the top with no throttle at all, 0.13 arrived in the bowl at 48 km/h and
  // left it at 37 — the widest, best-looking reach in the map was the one place
  // you slowed down, and it is the reach whose whole job is to be carved, which
  // costs speed by definition. 0.16 holds a coasting run at 14 m/s the whole way
  // through, which is what pays for the 3.0 m banks either side of it.
  { z: 130, grade: 0.16 },
  { z: 168, grade: 0.16 },
  // --- THE DROP REACH: it narrows and steepens into the first drop -----------
  { z: 182, grade: 0.24 },
  // THE FIRST DROP. You arrive at ~19 m/s and there is 3.4 m of nothing:
  // `lipDecision` releases you on the floor's own descending tangent, so this
  // is a step you ride OFF rather than a lip that throws you — and where you
  // come down is then a fact about the LANDING and not about the lip.
  //
  // Measured against the ride's own arithmetic, at a 19 m/s arrival: 21.6 m of
  // air, 16.8 m of drop, arriving at 52.7° onto a 31.8° bank — 20.9° of
  // mismatch, `into` 10.9, which is 1.9 m/s over `LAND_ABSORB` and costs 18% of
  // the roll speed. On a level deck the same arrival is 52.7° of mismatch and
  // keeps almost nothing. THAT is what the 0.62 below is for, and it is the same
  // ruling map 1's quarter pipe was rebuilt on, applied to a twenty-metre air
  // instead of a four-metre one.
  { z: 200, grade: 0.24, drop: 3.4 },
  { z: 205, grade: 0.62 },
  { z: 224, grade: 0.62 },
  { z: 240, grade: 0.17 },
  // --- THE LONG STRAIGHT: the fastest sustained stretch, and the bridge ------
  // THE SECOND DROP, and it is smaller on purpose: 12 m out and 9 m down at the
  // 14 m/s this reach settles at, arriving 25° off a 26.6° bank. Two identical
  // drops would be one drop twice; this one is the one you take with the
  // barriers still in your hands.
  { z: 276, grade: 0.17, drop: 2.6 },
  { z: 281, grade: 0.5 },
  { z: 296, grade: 0.5 },
  // --- THE LAST CHUTE: narrow again, and the finale wedge at 316 ------------
  { z: 308, grade: 0.18 },
  // …and the floor STEEPENS under the finale's landing rather than flattening.
  // A kicker whose landing runs away from the arc is a kicker you ride out of.
  { z: 330, grade: 0.26 },
  { z: 348, grade: 0.18 },
  // --- THE OUTFALL: it flattens out into the apron --------------------------
  { z: 362, grade: 0.02 },
  { z: 374, grade: 0.02 },
  // …and ENDS IN A BANK, not in a wall. Map 1 learned this the expensive way:
  // a run that comes down the last chute at 18 m/s and meets concrete ends in a
  // ragdoll at the end of every clean lap.
  //
  // And the bank has to be long enough to actually do it, which is the thing
  // the first cut got wrong: 22 m at −0.42 is 4.4 m of climb and a 16 m/s
  // arrival buys 7.5, so it went straight over the top. Watched in a capture —
  // the run ended against the debris screen at 58 km/h every time. 36 m at an
  // average of 0.17 is 6.1 m and it keeps rising past the last station, so
  // everything the last chute can deliver runs out of climb and comes back
  // down pointing at the flume.
  { z: 410, grade: -0.36 },
];

/** The drop structures, extracted so the mesher can draw their faces. */
export const STEPS: readonly { z: number; drop: number }[] = PROFILE.filter(
  (s): s is Station & { drop: number } => s.drop !== undefined,
).map((s) => ({ z: s.z, drop: s.drop }));

export const CHANNEL_Z0 = PROFILE[0].z;
export const CHANNEL_Z1 = PROFILE[PROFILE.length - 1].z;

/**
 * Cumulative floor height at each station, precomputed once.
 *
 * `Y_AT[i]` is the floor ARRIVING at station i — before its own drop is taken.
 * `Y_FROM[i]` is the floor LEAVING it. They differ only at a drop structure,
 * and keeping both is what lets the mesher draw the face between them without a
 * second description of where the step is.
 */
const Y_AT: number[] = [];
const Y_FROM: number[] = [];
{
  let y = 0;
  for (let i = 0; i < PROFILE.length; i++) {
    if (i > 0) {
      const a = PROFILE[i - 1];
      const b = PROFILE[i];
      const len = b.z - a.z;
      // ∫ of a linear grade over the segment — exact, so the floor never drifts.
      y -= ((a.grade + b.grade) / 2) * len;
    }
    Y_AT.push(y);
    y -= PROFILE[i].drop ?? 0;
    Y_FROM.push(y);
  }
}

/** Which segment `z` falls in. Short table, so a scan beats a search. */
function segmentAt(z: number): number {
  for (let i = PROFILE.length - 2; i > 0; i--) {
    if (z >= PROFILE[i].z) return i;
  }
  return 0;
}

/**
 * The floor's height on the CENTRELINE at `z` — the datum everything else in
 * this map is measured off.
 *
 * At a drop station the answer is the LOWER floor: a query exactly on the lip
 * belongs to the ground you are landing on, which is the same tie-break map 1's
 * `resolve` makes for a solid declared last. The face itself is not a surface
 * at all — it is vertical, nothing stands on it, and `blocked()` is what stops
 * you riding back UP a drop structure.
 */
export function floorY(z: number): number {
  if (z <= PROFILE[0].z) return Y_FROM[0];
  const last = PROFILE.length - 1;
  if (z >= PROFILE[last].z) return Y_FROM[last] - PROFILE[last].grade * (z - PROFILE[last].z);
  const i = segmentAt(z);
  const a = PROFILE[i];
  const b = PROFILE[i + 1];
  const len = b.z - a.z;
  const t = z - a.z;
  return Y_FROM[i] - (a.grade * t + ((b.grade - a.grade) * t * t) / (2 * len));
}

/** dy/dz on the centreline — negative running downhill. Analytic, never a difference. */
export function floorGrade(z: number): number {
  if (z <= PROFILE[0].z) return -PROFILE[0].grade;
  const last = PROFILE.length - 1;
  if (z >= PROFILE[last].z) return -PROFILE[last].grade;
  const i = segmentAt(z);
  const a = PROFILE[i];
  const b = PROFILE[i + 1];
  return -(a.grade + ((b.grade - a.grade) * (z - a.z)) / (b.z - a.z));
}

// ---------------------------------------------------------------------------
// the meander
// ---------------------------------------------------------------------------

/**
 * Where the channel's middle is, in world x.
 *
 * A straight 400 m trench is a corridor; a channel that swings is a place. The
 * control points are interpolated with a SMOOTHERSTEP rather than a line, so
 * the plan is C1 at every one of them — a kink in plan is a wall that jumps
 * sideways under a rider doing 20 m/s, and `blocked()` would report it as a
 * face out of nowhere.
 *
 * A smootherstep's slope peaks at `1.875·Δx/L`, and every leg below is sized so
 * that peak lands under 0.15 — 8.5° of sweep, down from 13° in the first cut.
 * That is a carve-symmetry number rather than a hydrology one: on a left-hand
 * bend the right-hand carve is the OUTSIDE one, and it spends its whole crossing
 * being pushed further up a wall that is itself swinging toward it. Measured at
 * 13° of sweep, the same 0.35 s press cost 12% one way and 35% the other in the
 * same reach. At 8.5° the two directions are within a few points of each other
 * and the channel still visibly bends. That is what keeps the
 * perpendicular-to-z section honest (see the file header, where the shear it
 * costs is 2.6% of the section's width) and is also about as hard as a real
 * flood channel ever bends.
 */
const PLAN: readonly { z: number; x: number }[] = [
  { z: -34, x: 0 },
  { z: 18, x: 0 },
  { z: 100, x: -6 },
  { z: 176, x: -1 },
  // Dead straight through the bridge, because a bridge crosses a channel square
  // and a pier standing at an angle to the flow is a pier somebody built wrong.
  { z: 244, x: -1 },
  { z: 320, x: -7 },
  { z: 400, x: -3 },
];

/** 6t⁵−15t⁴+10t³ — zero first AND second derivative at both ends. */
function smoother(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function smootherSlope(t: number): number {
  return 30 * t * t * (t - 1) * (t - 1);
}

export function centreX(z: number): number {
  if (z <= PLAN[0].z) return PLAN[0].x;
  const last = PLAN.length - 1;
  if (z >= PLAN[last].z) return PLAN[last].x;
  for (let i = PLAN.length - 2; i >= 0; i--) {
    if (z < PLAN[i].z) continue;
    const a = PLAN[i];
    const b = PLAN[i + 1];
    return a.x + (b.x - a.x) * smoother((z - a.z) / (b.z - a.z));
  }
  return PLAN[0].x;
}

/** dx/dz of the centreline. The cross-section's own shear, and the normal reads it. */
export function centreSlope(z: number): number {
  if (z <= PLAN[0].z || z >= PLAN[PLAN.length - 1].z) return 0;
  for (let i = PLAN.length - 2; i >= 0; i--) {
    if (z < PLAN[i].z) continue;
    const a = PLAN[i];
    const b = PLAN[i + 1];
    const len = b.z - a.z;
    return ((b.x - a.x) / len) * smootherSlope((z - a.z) / len);
  }
  return 0;
}

/** Lateral position in the channel's own frame: 0 on the centreline. */
export function flumeU(x: number, z: number): number {
  return x - centreX(z);
}

// ---------------------------------------------------------------------------
// the cross-section
// ---------------------------------------------------------------------------

export interface Section {
  /** Half-width of the dished floor. */
  floor: number;
  /** Radius of the transition that stands off the floor's edge. */
  radius: number;
  /** …and how far round it goes before the wall goes straight, radians. */
  wall: number;
  /**
   * **The height of the RIDEABLE bank** — floor datum to the top of the crest.
   *
   * The one number in this table the ticket is actually about. Climbing it
   * costs `sqrt(2·17·bank)` off the top of a run whatever the wall's angle is,
   * so it is sized per reach at about 45% of the kinetic head the reach's own
   * coasting speed carries: at 14 m/s that head is 5.7 m and the bank is 2.6,
   * so a full-commitment carve arrives at the crest with 10.2 m/s of the 14 it
   * started with and a light one turns round half way up for nothing. See
   * `THE BANK IS A THING YOU USE`.
   */
  bank: number;
  /**
   * Radius the crest is rolled over with — and 0 means a SHARP COPING, which is
   * a gameplay decision and not a modelling one.
   *
   * `lipDecision` rides any convex break whose chord turns less than 0.35 rad
   * over the board's own half-metre, so a crest rolled at `LIP_PIVOT/CORNER_HOLD`
   * = 1.43 m or more is ALWAYS ridden however fast you take it: you carve up the
   * bank, over the top, and onto the freeboard apron on your wheels, and the
   * apron tips you back in. That is forgiving and it is all of this map but one
   * reach. Set to 0 the wall meets the apron at its full angle — 46° of turn —
   * and the same carve BOOSTS you out over the coping. Both are real spillway
   * construction; the bowl is where this map says the boost is the reward.
   */
  coping: number;
  /**
   * Width of the freeboard apron behind the crest, and the slope it LEAVES the
   * crest at. It does not keep that slope: see `APRON_CURVE`.
   *
   * The apron is the piece that makes a carve survivable. It is concrete, it is
   * outside the design flow, it tips back INTO the channel — the way anything
   * cast above a flood channel is graded — and it is therefore ground that hands
   * a rider who topped the transition back down the way he came instead of
   * parking him. Wide enough to catch a boost out of the bowl (see `SECTIONS`),
   * never wide enough to be somewhere you stop.
   */
  apron: number;
  rise: number;
  /** Height of the parapet standing at the apron's outer edge. */
  freeboard: number;
  /** Width of the flat walkway along the top of each bank, behind the parapet. */
  deck: number;
  /** How much higher the floor's edge is than its middle — the drainage dish. */
  dish: number;
  /** Depth of the low-flow groove down the very middle. 0 turns it off. */
  trickle: number;
}

interface SectionStation extends Section {
  z: number;
}

/**
 * The channel's shape, station by station. Interpolated with the same
 * smootherstep the plan uses, so every field is C1 in z — a floor that widens
 * with a kink in it is a wall that steps sideways.
 *
 * The FLOOR is narrower than the first cut's by a third, everywhere, and that
 * is the same finding as the bank height. A carve is a heading change that does
 * not come back, so the width of the floor is how long the player spends
 * committed before anything happens: at 24 m of floor and 29° off the line, one
 * press of the carve key was four seconds of crossing an empty pan before the
 * far bank answered. Twelve is half a second, which is a move rather than a
 * decision you regret. It is also what the bar's own flume looks like — you are
 * never more than a board's length from a wall you could be using.
 */
const SECTIONS: readonly SectionStation[] = [
  // The headworks: wide, shallow, open, so the opening frame reads as a place
  // you walked into rather than as the mouth of a pipe.
  { z: -34, floor: 10.0, radius: 3.0, wall: rad(34), bank: 1.6, coping: 1.9, apron: 4.0, rise: 0.2, freeboard: 1.6, deck: 4.5, dish: 0.0, trickle: 0 },
  { z: -6, floor: 8.4, radius: 3.2, wall: rad(38), bank: 2.0, coping: 1.8, apron: 3.8, rise: 0.24, freeboard: 1.6, deck: 4.2, dish: 0.06, trickle: 0 },
  // THE CHUTE. 8.4 m of floor between two banks whose transitions stand only
  // 4 m out from its edge: the narrowest the map gets, and the fastest. Narrow
  // is the point — at 21 m/s a 30 m wide channel reads as an aerodrome and a
  // 12 m one reads as a canyon going past your ears. The apron is steep here
  // (0.34) because the FLOOR is: a rider who tops this bank at 29° off the line
  // is still going downhill along the channel, and the apron has to out-climb
  // the flume's own 0.26 to turn him round at all.
  { z: 6, floor: 4.2, radius: 3.6, wall: rad(50), bank: 2.6, coping: 1.7, apron: 5.0, rise: 0.32, freeboard: 2.6, deck: 3.0, dish: 0.16, trickle: 0.18 },
  { z: 50, floor: 4.4, radius: 3.8, wall: rad(50), bank: 2.7, coping: 1.7, apron: 5.0, rise: 0.32, freeboard: 2.6, deck: 3.0, dish: 0.18, trickle: 0.18 },
  // THE LEDGE RUN — it opens out, the walls lie back, and there is room either
  // side of the line for the blocks to sit without being in it.
  //
  // AND THE TRICKLE GROOVE STOPS HERE, which is a gameplay decision wearing a
  // hydrology hat. A feature's top is cast off the FLOOR DATUM so a block is
  // level across itself, and a 0.16 m groove under a bank's toe is therefore a
  // 0.16 m step — under the ride's 0.30 m wall probe and over its 0.15 m hint
  // lift, which is the exact band map 1's manual pad shipped inside and got
  // ridden straight through. Every reach that carries a block or a kicker runs
  // dry; the bare ones — the chute, the drop reach, the apron — keep it.
  { z: 68, floor: 6.0, radius: 4.0, wall: rad(48), bank: 2.5, coping: 1.7, apron: 5.2, rise: 0.28, freeboard: 2.4, deck: 3.2, dish: 0.20, trickle: 0 },
  { z: 118, floor: 6.8, radius: 4.4, wall: rad(46), bank: 2.7, coping: 1.8, apron: 5.4, rise: 0.27, freeboard: 2.3, deck: 3.4, dish: 0.22, trickle: 0 },
  // THE BOWL, and the one reach in the map with a SHARP COPING.
  //
  // 3.0 m of bank at the 14 m/s this reach now carries is 60% of the kinetic
  // head, so reaching the coping is a commitment: you arrive at it with 9 m/s
  // and 46° of wall under you, and `lipDecision` boosts you out over the lip
  // rather than rolling you over it. What catches you is the apron, and 6.5 m
  // is not a round number — a 9 m/s launch off a 46° lip covers `v²sin2θ/g` =
  // 4.7 m of ground and a 12 m/s one covers 8.5, and the apron rising at 0.24
  // under the arc brings both of those down inside six and a half metres. This
  // is the one place in the map where the wall is a jump.
  { z: 132, floor: 8.0, radius: 4.6, wall: rad(46), bank: 3.0, coping: 0, apron: 6.2, rise: 0.26, freeboard: 2.2, deck: 3.8, dish: 0.24, trickle: 0 },
  { z: 166, floor: 8.2, radius: 4.8, wall: rad(46), bank: 3.0, coping: 0, apron: 6.2, rise: 0.26, freeboard: 2.2, deck: 3.8, dish: 0.24, trickle: 0 },
  // THE DROP REACH — it squeezes back down, which is what makes the drop feel
  // like something the channel is doing to you rather than something built.
  { z: 184, floor: 6.2, radius: 4.0, wall: rad(50), bank: 2.7, coping: 1.7, apron: 5.0, rise: 0.32, freeboard: 2.6, deck: 3.2, dish: 0.22, trickle: 0.16 },
  { z: 214, floor: 6.4, radius: 4.2, wall: rad(48), bank: 2.8, coping: 1.7, apron: 5.2, rise: 0.31, freeboard: 2.7, deck: 3.2, dish: 0.22, trickle: 0.16 },
  // Under the bridge. The banks are the tallest in the map here because the
  // speed is: a run off the first drop crosses this reach at 23 to 24 m/s, and
  // 3.4 m is still only a fifth of the head that carries.
  { z: 250, floor: 7.0, radius: 5.0, wall: rad(46), bank: 3.4, coping: 1.9, apron: 5.6, rise: 0.28, freeboard: 2.8, deck: 3.6, dish: 0.24, trickle: 0.08 },
  { z: 274, floor: 6.8, radius: 5.0, wall: rad(46), bank: 3.4, coping: 1.9, apron: 5.6, rise: 0.28, freeboard: 2.8, deck: 3.4, dish: 0.24, trickle: 0.08 },
  { z: 292, floor: 5.8, radius: 4.6, wall: rad(50), bank: 3.2, coping: 1.8, apron: 5.4, rise: 0.31, freeboard: 2.7, deck: 3.2, dish: 0.22, trickle: 0 },
  { z: 326, floor: 6.4, radius: 4.8, wall: rad(48), bank: 3.4, coping: 1.9, apron: 5.4, rise: 0.29, freeboard: 2.6, deck: 3.4, dish: 0.22, trickle: 0 },
  // The outfall apron: it opens right out and the walls drop away, so the run
  // ends somewhere you can see the sky from.
  { z: 352, floor: 9.0, radius: 4.0, wall: rad(40), bank: 2.6, coping: 1.9, apron: 4.8, rise: 0.2, freeboard: 1.8, deck: 5.0, dish: 0.1, trickle: 0.1 },
  { z: 400, floor: 10.0, radius: 3.4, wall: rad(34), bank: 2.0, coping: 2.0, apron: 4.8, rise: 0.16, freeboard: 1.5, deck: 5.5, dish: 0.06, trickle: 0 },
];

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Width of the low-flow groove, as the σ of the gaussian that cuts it. */
const TRICKLE_SIGMA = 1.15;
/**
 * How steep the freeboard wall is, as a GRADIENT — and it is deliberately just
 * UNDER the angle at which the ride would call it a wall.
 *
 * `blocked()` is true where the surface stands over the board's probe, which is
 * `WALL_PROBE` (0.30 m) up, and the ride walks its step in `WALL_STEP` (0.05 m)
 * pieces. So a face blocks exactly while it rises more than 0.30 m in 0.05 m of
 * run — a gradient over 6.0, which is 80.5°. **4.5 is 77.5°, and it rises
 * 0.225 m across one piece: rideable, with a quarter of the probe to spare.**
 *
 * That one number is the difference between the two ways this map's bank can
 * end, and the first cut of the fix picked the wrong one. At 9.5 the freeboard
 * was a wall, and a wall is where a run dies: `settleWall` scales the speed by
 * the fraction that survived the contact, latches, and then charges `WALL_RUB`
 * for as long as the lean lasts — and when both axes block at once it pins the
 * speed at zero outright. Measured with a blocking parapet: a 0.7 s carve out of
 * the chute climbed the whole bank, met the freeboard at 4.9 m with `into` 7,
 * and was still sitting there at 2 km/h four seconds later, with the 12 m/s the
 * climb had cost him left in the concrete.
 *
 * Under the threshold the same carve CLIMBS it. Five metres of rise per metre of
 * ground is a wall in every sense except the ride's, so the climb ends in about
 * a board's length — and then `fall()` hands every joule of it back on the way
 * down, which is what the bank was supposed to do all along. Nothing on the
 * inside of this channel is a face: there is only bank, the bank gets steeper
 * until it gives up, and everything drains back to the flume.
 *
 * What stops you LEAVING is then the arithmetic rather than a barrier — the
 * walkway above rises outward too (`DECK_FALL`), and the fence behind it is the
 * one hard bound, for the airborne case `BOUND_HEIGHT` is written about.
 */
export const PARAPET_SLOPE = 4.5;
/**
 * …and the walkway is not flat either. It falls INTO the channel at 0.30 — the
 * way a maintenance bench beside a flood channel is graded, and the way every
 * other surface in this section is.
 *
 * The one flat thing in the first cut of this map was the walkway, and it was
 * where runs went to die: a rider thrown over the crest landed on 3.4 m of level
 * concrete with the flume below him and coasted to a stop. There is nowhere
 * level in this cross-section now, from the trickle groove to the rock cut.
 *
 * 0.30 and not the 0.14 it was first cut at, and the difference is what the
 * walkway is FOR. A rider who has climbed the whole bank arrives up here with
 * almost nothing left, and 0.14 is 2.4 m/s² of return — thirty seconds of
 * shuffling before the flume has him again. 0.30 is 5.1, which turns him round
 * and posts him back over the freeboard inside a couple of seconds, and it is
 * still a grade you could push a wheelbarrow along.
 */
const DECK_FALL = 0.30;
/**
 * How much steeper the apron is at the parapet than at the crest.
 *
 * The apron is a CURVE and not a ramp, and the reason is what a carve does when
 * it runs out of room. Its slope is `rise·(1 + APRON_CURVE·t²)` across its own
 * width, so it leaves the crest exactly tangent to the crest roll — the whole
 * bank stays C1 — and arrives at the parapet three times as steep.
 *
 * A straight apron spends its height evenly, so a rider crossing it at 65° off
 * the line covers the last metre as cheaply as the first and meets the parapet
 * with speed still on: measured, a 0.7 s carve out of the chute reached the
 * freeboard wall at 4.8 m with `into` 7 and the run ended leaning on concrete.
 * A curve spends it back-loaded — half the climb is in the outer third — so the
 * same carve runs out of climb ON THE APRON and is turned round by the shape
 * rather than stopped by the wall, which is the difference between a bank you
 * used and a bank you hit. `2` puts the top of the apron at 28–44° depending on
 * the reach, which is under the transition below it: the section still opens
 * out on the way up, so nothing anywhere in it is convex except the bowl's own
 * coping.
 */
const APRON_CURVE = 2;
/**
 * The rock cut behind each walkway, and the hillside behind THAT.
 *
 * Everything past the parapet is scenery the ride cannot reach, and it still
 * has to answer a height, which is why it is part of this function rather than
 * part of the dressing: a lookahead that runs off the end of the world reads
 * the hole as a drop and launches. There are no holes in this map anywhere.
 */
const CUT_HEIGHT = 3.2;
const CUT_RUN = 1.5;
const HILL_GRADE = 0.58;
/** …and where the hillside stops being drawn. Past here it is the skybox's job. */
export const HILL_REACH = 34;

/**
 * A caller's own section/marks pair.
 *
 * Both `sectionAt` and `marksOf` write into a record you hand them, and the
 * default is a SHARED one — the same idiom as map 1's `_local`, and the same
 * rule: one query at a time. Anything that holds an answer across a second
 * query takes a pair of these instead. `tools/` and the mesher both do.
 */
export function makeSection(): Section {
  return {
    floor: 0,
    radius: 0,
    wall: 0,
    bank: 0,
    coping: 0,
    apron: 0,
    rise: 0,
    freeboard: 0,
    deck: 0,
    dish: 0,
    trickle: 0,
  };
}
export function makeMarks(): Marks {
  return {
    floor: 0,
    arc: 0,
    wall: 0,
    crest: 0,
    apron: 0,
    parapet: 0,
    deck: 0,
    arcH: 0,
    wallH: 0,
    crestH: 0,
    apronH: 0,
    topH: 0,
    sinPhi0: 0,
    cosPhi0: 1,
    sinPhiA: 0,
    cosPhiA: 1,
  };
}

const _sec = makeSection();

/** The section at `z`, into a shared scratch — one query at a time, like `_local`. */
export function sectionAt(z: number, out: Section = _sec): Section {
  const last = SECTIONS.length - 1;
  let a = SECTIONS[0];
  let b = SECTIONS[0];
  let t = 0;
  if (z >= SECTIONS[last].z) {
    a = b = SECTIONS[last];
  } else if (z > SECTIONS[0].z) {
    for (let i = last - 1; i >= 0; i--) {
      if (z < SECTIONS[i].z) continue;
      a = SECTIONS[i];
      b = SECTIONS[i + 1];
      t = smoother((z - a.z) / (b.z - a.z));
      break;
    }
  }
  out.floor = a.floor + (b.floor - a.floor) * t;
  out.radius = a.radius + (b.radius - a.radius) * t;
  out.wall = a.wall + (b.wall - a.wall) * t;
  out.bank = a.bank + (b.bank - a.bank) * t;
  out.coping = a.coping + (b.coping - a.coping) * t;
  out.apron = a.apron + (b.apron - a.apron) * t;
  out.rise = a.rise + (b.rise - a.rise) * t;
  out.freeboard = a.freeboard + (b.freeboard - a.freeboard) * t;
  out.deck = a.deck + (b.deck - a.deck) * t;
  out.dish = a.dish + (b.dish - a.dish) * t;
  out.trickle = a.trickle + (b.trickle - a.trickle) * t;
  return out;
}

/** Which band of the section a point is in. Drives the material and the sound. */
export type Band = "floor" | "trans" | "wall" | "apron" | "parapet" | "deck" | "hill";

/**
 * The section's breakpoints, in metres out from the centreline. Everything else
 * in this file — the height, the slope, the mesh's own columns — is expressed
 * against these numbers, so a shape change is one edit and not four.
 */
export interface Marks {
  /** |u| where the floor ends and the transition starts. */
  floor: number;
  /** …where the transition's arc gives way to the straight wall. */
  arc: number;
  /** …where the wall gives way to the crest roll. */
  wall: number;
  /** …where the crest roll reaches the freeboard apron. */
  crest: number;
  /** …where the apron ends and the parapet stands. */
  apron: number;
  /** …where the parapet reaches walkway level. */
  parapet: number;
  /** …where the walkway ends and the rock cut begins. */
  deck: number;
  /** Height of the arc, of the straight wall above it, and of the crest roll. */
  arcH: number;
  wallH: number;
  crestH: number;
  /** …and of the apron, which climbs OUTWARD. */
  apronH: number;
  /**
   * The walkway's own height above the floor datum — DERIVED, not authored.
   *
   * `bank + apronH + freeboard` and nothing else, so the fence cannot end up
   * standing at a height the parapet under it does not reach. Everything that
   * used to read `Section.top` reads this.
   */
  topH: number;
  /**
   * Where the transition's arc STARTS, as sin/cos of its own angle — and it is
   * not zero.
   *
   * The dished floor is already climbing at `2·dish/floor` (about 3°) by the
   * time it reaches the transition's toe, so an arc starting flat leaves a 3°
   * CONVEX crease down both sides of the fastest part of the map. Nothing would
   * be thrown off it — `lipDecision` refuses a far face that bends back, and
   * the arc bends back — but "nothing is thrown off it" is an argument about a
   * guard, and the shape itself should not need one. Starting the arc at the
   * angle the floor arrives on makes the join exactly tangent instead.
   */
  sinPhi0: number;
  cosPhi0: number;
  /**
   * …and where the CREST roll stops, which is the apron's own angle for exactly
   * the same reason.
   *
   * The first cut rolled the crest to horizontal and then started the apron at
   * its own rise, which left a convex break of `atan(rise)` — up to 0.33 rad
   * with the steep aprons this map wants — sitting a hand's width under 0.35,
   * i.e. a lip that is ridden today and throws you the day somebody edits a
   * number. Rolling from the wall's angle down to the APRON'S makes the whole
   * bank C1 from the trickle groove to the parapet's toe, and the only convex
   * break left anywhere in the section is the bowl's coping, which is 0 on
   * purpose.
   */
  sinPhiA: number;
  cosPhiA: number;
}

const _marks = makeMarks();

export function marksOf(s: Section, out: Marks = _marks): Marks {
  const sin = Math.sin(s.wall);
  const cos = Math.cos(s.wall);
  const tan = sin / cos;
  const phi0 = Math.atan((2 * s.dish) / Math.max(1e-6, s.floor));
  const sin0 = Math.sin(phi0);
  const cos0 = Math.cos(phi0);
  // The apron's own angle — where the crest roll stops turning.
  const phiA = Math.atan(s.rise);
  const sinA = Math.sin(phiA);
  const cosA = Math.cos(phiA);
  const arcRun = s.radius * (sin - sin0);
  const arcH = s.radius * (cos0 - cos);
  // The crest roll is the transition's arc run backwards: a circle of radius
  // `coping` tangent to the wall where it starts and tangent to the APRON where
  // it stops. At coping 0 both of these are zero and the wall meets the apron at
  // its full angle, which is a sharp coping and is the bowl.
  const crestRun = s.coping * (sin - sinA);
  const crestH = s.coping * (cosA - cos);
  // What is left for the straight wall between the arc and the crest roll. It
  // is clamped at zero rather than allowed to go negative: a section whose bank
  // is lower than its own transition is a table typo, and the honest reading of
  // one is "no straight wall", not a wall that runs backwards.
  const wallH = Math.max(0, s.bank - s.dish - arcH - crestH);
  const wallRun = wallH / tan;
  // ∫ rise·(1 + APRON_CURVE·t²) dt over the apron's own width.
  const apronH = s.rise * s.apron * (1 + APRON_CURVE / 3);
  out.floor = s.floor;
  out.arc = s.floor + arcRun;
  out.wall = out.arc + wallRun;
  out.crest = out.wall + crestRun;
  out.apron = out.crest + s.apron;
  out.parapet = out.apron + s.freeboard / PARAPET_SLOPE;
  out.deck = out.parapet + s.deck;
  out.arcH = arcH;
  out.wallH = wallH;
  out.crestH = crestH;
  out.apronH = apronH;
  out.topH = s.bank + apronH + s.freeboard;
  out.sinPhi0 = sin0;
  out.cosPhi0 = cos0;
  out.sinPhiA = sinA;
  out.cosPhiA = cosA;
  return out;
}

/**
 * Height above the floor datum, `d` metres out from the centreline.
 *
 * The whole cross-section in one function, and every join in it is C1 except
 * two. The first is the floor's dish meeting the transition's toe, which is a
 * 3° CONCAVE crease and is the kind the ride never throws you off
 * (`lipDecision` returns on a far face that bends back). The second is the
 * BOWL'S COPING, where `Section.coping` is 0 on purpose and the wall meets the
 * apron at 46°: that one is convex, it is a launch, and it is the only one.
 */
export function crossY(d: number, s: Section, m: Marks): number {
  if (d <= m.floor) {
    const q = d / Math.max(1e-6, m.floor);
    return s.dish * q * q - s.trickle * Math.exp(-((d / TRICKLE_SIGMA) ** 2));
  }
  if (d <= m.arc) {
    // On the arc, `sin φ` runs linearly with the ground covered: the toe is at
    // φ0 (the angle the floor arrives on) and the lip is at the wall's own.
    const sinPhi = m.sinPhi0 + (d - m.floor) / s.radius;
    return s.dish + s.radius * (m.cosPhi0 - Math.sqrt(Math.max(0, 1 - sinPhi * sinPhi)));
  }
  if (d <= m.wall) {
    return s.dish + m.arcH + (d - m.arc) * Math.tan(s.wall);
  }
  if (d <= m.crest) {
    // The crest roll: the transition's arc run the other way. `sin φ` falls
    // linearly with the ground covered, from the wall's angle down to the
    // apron's, so it is tangent to both.
    const sinPhi = Math.sin(s.wall) - (d - m.wall) / Math.max(1e-6, s.coping);
    return (
      s.bank - s.coping * (m.cosPhiA - Math.sqrt(Math.max(0, 1 - sinPhi * sinPhi)))
    );
  }
  if (d <= m.apron) {
    const t = (d - m.crest) / Math.max(1e-6, s.apron);
    return s.bank + s.rise * s.apron * t * (1 + (APRON_CURVE * t * t) / 3);
  }
  if (d <= m.parapet) return s.bank + m.apronH + PARAPET_SLOPE * (d - m.apron);
  if (d <= m.deck) return m.topH + DECK_FALL * (d - m.parapet);
  // The rock cut, then the hillside. Smoothstepped up the cut so the walkway's
  // outer edge is flat where it meets it — a vertical face here would be a
  // wall the ride reads as a launch when a lookahead crosses it.
  const e = d - m.deck;
  const cut = CUT_HEIGHT * smoother(Math.min(1, e / CUT_RUN));
  return m.topH + DECK_FALL * s.deck + cut + HILL_GRADE * Math.max(0, e - CUT_RUN);
}

/** …and its slope, dh/dd. Analytic for the same reason map 1's `normalOf` is. */
export function crossSlope(d: number, s: Section, m: Marks): number {
  if (d <= m.floor) {
    const w = Math.max(1e-6, m.floor);
    const groove = (2 * d * s.trickle * Math.exp(-((d / TRICKLE_SIGMA) ** 2))) / (TRICKLE_SIGMA ** 2);
    return (2 * s.dish * d) / (w * w) + groove;
  }
  if (d <= m.arc) {
    const sinPhi = m.sinPhi0 + (d - m.floor) / s.radius;
    return sinPhi / Math.sqrt(Math.max(1e-6, 1 - sinPhi * sinPhi));
  }
  if (d <= m.wall) return Math.tan(s.wall);
  if (d <= m.crest) {
    const sinPhi = Math.sin(s.wall) - (d - m.wall) / Math.max(1e-6, s.coping);
    return sinPhi / Math.sqrt(Math.max(1e-6, 1 - sinPhi * sinPhi));
  }
  if (d <= m.apron) {
    const t = (d - m.crest) / Math.max(1e-6, s.apron);
    return s.rise * (1 + APRON_CURVE * t * t);
  }
  if (d <= m.parapet) return PARAPET_SLOPE;
  if (d <= m.deck) return DECK_FALL;
  const e = d - m.deck;
  if (e >= CUT_RUN) return HILL_GRADE;
  return (CUT_HEIGHT * smootherSlope(e / CUT_RUN)) / CUT_RUN;
}

/** Which band `d` is in — for the material, the mesh batch and the roll sound. */
export function bandAt(d: number, m: Marks): Band {
  if (d <= m.floor) return "floor";
  if (d <= m.arc) return "trans";
  if (d <= m.crest) return "wall";
  if (d <= m.apron) return "apron";
  if (d <= m.parapet) return "parapet";
  if (d <= m.deck) return "deck";
  return "hill";
}

// ---------------------------------------------------------------------------
// the surface itself
// ---------------------------------------------------------------------------

const _ySec = makeSection();
const _yMarks = makeMarks();

/** The channel's height at a world point. Defined EVERYWHERE — there are no holes. */
export function channelY(x: number, z: number): number {
  const s = sectionAt(z, _ySec);
  return floorY(z) + crossY(Math.abs(x - centreX(z)), s, marksOf(s, _yMarks));
}

/**
 * ∂y/∂x and ∂y/∂z of the channel, as a height gradient.
 *
 * The x half is exact — the cross-section's own slope, signed by which bank you
 * are on. The z half is the floor's own grade, plus the chain rule through two
 * things that both move with z: the section's shape and the centreline's
 * position. The first is taken as a difference over ±0.4 m and the second
 * analytically, and the split is the point: the SECTION changes over tens of
 * metres and has no step in it anywhere, so a difference across it is honest,
 * while the FLOOR has two 3 m drops in it and a difference across one of those
 * would read a cliff as a ramp and launch a rider standing still on it.
 */
export function channelGradient(x: number, z: number, out: { gx: number; gz: number }): void {
  const u = x - centreX(z);
  const d = Math.abs(u);
  const slope = crossSlope(d, sectionAt(z, _gSec), marksOf(_gSec, _gMarks));
  out.gx = u < 0 ? -slope : slope;
  const e = 0.4;
  const hBack = crossY(d, sectionAt(z - e, _gSec), marksOf(_gSec, _gMarks));
  const hFwd = crossY(d, sectionAt(z + e, _gSec), marksOf(_gSec, _gMarks));
  out.gz = floorGrade(z) + (hFwd - hBack) / (2 * e) - out.gx * centreSlope(z);
}

/**
 * The gradient's OWN scratch, and it is not an optimisation.
 *
 * `sectionAt` and `marksOf` both write a shared record, the same idiom as map
 * 1's `_local` — one query at a time. This function makes three of those
 * queries in a row, so borrowing the shared pair would hand its own first
 * answer back aliased to its third. Every caller that nests gets its own, and
 * that rule is why they take an `out`.
 */
const _gSec = makeSection();
const _gMarks = makeMarks();

/** The band under a world point, for the material and the roll sound. */
export function channelBand(x: number, z: number): Band {
  return bandAt(Math.abs(x - centreX(z)), marksOf(sectionAt(z, _bSec), _bMarks));
}
const _bSec = makeSection();
const _bMarks = makeMarks();

/** …and the same for a point ON the surface: the concrete at (u, z). */
export function flumeSurfaceY(u: number, z: number): number {
  const s = sectionAt(z, _fSec);
  return floorY(z) + crossY(Math.abs(u), s, marksOf(s, _fMarks));
}
const _fSec = makeSection();
const _fMarks = makeMarks();

/**
 * The height of the bank's crest at a station — the top of the RIDEABLE wall.
 *
 * Read by the coping rails and by anything that needs to stand something on the
 * lip, so that "the top of the bank" is one number in one place rather than a
 * sum reassembled at four call sites.
 */
export function crestY(z: number): number {
  return floorY(z) + sectionAt(z, _cSec).bank;
}
const _cSec = makeSection();
