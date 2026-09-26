// A BAR IS STEEL — the collider a handrail never had.
//
// The player's sentence was "I cannot ride through any wall, ledge, rail or
// prop", and three of those four were already true. A wall, a ledge and a prop
// are all `Solid`s — yawed boxes with a top profile — so `blocked()` covers the
// lot of them with one rule and `advance()` refuses to step anywhere it answers.
// A bar is not in that list and cannot be: `spot.ts`'s own `bar()` says so in
// its comment ("A round bar on posts. **Not a surface.**"), and it is right —
// a 9 cm tube standing on posts is not a box with a top you can stand on, and
// writing it as one would either wall off the ground under it or hand the ride
// a rideable ledge in mid-air. So SIX bars — the six-stair handrail, the flat
// bar and the three-stair rail in map 1, the chute bar, the ledge-run bar and
// the outfall bar in map 2 — were drawn, grindable, and made of nothing. You
// rode through them at speed. (`tools/collide-sweep.mjs --list` prints them.)
//
// THIS IS WHERE THE FIX BELONGS, and that is a claim about the vocabulary
// rather than about who owns which file. `Solid` cannot express a tube; the
// only description of a bar that exists anywhere is its `GrindLine`, which the
// surface contract already hands out through `rails()`. So the ride reads the
// same line it grinds, and there is no second set of coordinates to drift.
//
// WHICH BARS ARE STEEL, and it is the geometry that decides rather than a flag:
// a bar with air under it stands on posts and is a fence; a bar lying on what it
// runs over is bolted to it and is a lip you roll across. That is exactly the
// test both mesh builders already make before they draw posts —
// `props.ts` `BOLTED_ON` and `map2/dressing.ts`'s inline 0.25 — so a bar drawn
// WITH posts is a bar you hit, and a bar drawn without them is not. The coping
// bolted along map 1's quarter-pipe lip clears 0.03 m and the three handrails
// clear 0.35–0.85 m, so nothing about the marquee launch changes; map 2's bowl
// and chute copings clear 0.03 m the same way, and its chute bar clears 0.52.
//
// HOW HIGH THE FENCE IS — and this number is not chosen either. `blocked()`'s
// rule for everything else is "the top here is above the board's probe", so the
// bar's rule is the same sentence with the bar's own top in it: the tube's axis
// is the grind line (that is where the trucks sit) and the steel is `TUBE_R`
// proud of it. Which means the band a board is stopped in runs from the floor up
// to `line.y + TUBE_R - WALL_PROBE` — a quarter of a metre BELOW the line — and
// everything above that passes. That is what keeps a grind a grind: a board
// coming down onto the steel to lock on is never inside the fence, because the
// trucks arrive at the line and the probe reaches 0.30 m over the board while
// the steel stands 0.045 m over the line. A board arriving a quarter of a metre
// low was never landing on the rail; it was flying into the posts.
//
// AND THE TEST IS SWEPT, not sampled. `blocked()` is a point predicate and
// `advance()` walks its frame in 5 cm pieces so that a point predicate can
// speak for a whole step — that works because nothing in the spot is thinner
// than a piece. A 9 cm tube IS thinner than a piece the moment you take it at
// an angle, so this asks the question a point predicate cannot: did the step
// from here to there CROSS the bar's line while the board was under its steel?
// Segment against segment, exact, and it costs the same answer at 30 fps and at
// 144.

import type { GrindLine, SurfaceProvider } from "../world/surface";

/**
 * Radius of the tube every bar in the game is drawn with.
 *
 * Not a physics number of my own: `props.ts` `buildRails` and
 * `map2/dressing.ts` `buildSteel` both emit `CylinderGeometry(0.045, 0.045, …)`
 * centred on the grind line, so this is the steel the player can see. A third
 * copy of a number two files already agree on is a smell — see the note in this
 * lane's report about giving the world lane a `steelOf(line)` to own.
 */
export const TUBE_R = 0.045;

/**
 * Under this much air beneath it, a bar is bolted to what it runs over and is
 * not a fence. Same value and same reasoning as both mesh builders' post test —
 * a bar with nothing holding it up is not standing in your way.
 */
export const BOLTED_ON = 0.25;

/** How many points along a bar the clearance test reads. Five, as the mesh does. */
const CLEAR_SAMPLES = 5;

/** One bar, pre-solved into the numbers the per-step test wants. */
export interface SteelBar {
  readonly line: GrindLine;
  /** Ground-plane start. */
  readonly ax: number;
  readonly az: number;
  /** …and the ground-plane run to the other end (NOT normalised). */
  readonly dx: number;
  readonly dz: number;
  /** Height of the axis at each end — the steel top is this plus `TUBE_R`. */
  readonly ay: number;
  readonly by: number;
  /** Unit direction along the bar in the ground plane, for the slide. */
  readonly ux: number;
  readonly uz: number;
}

/**
 * Which of a provider's rails are steel you can hit.
 *
 * Cached per provider, because the answer is a fact about the map: `rails()`
 * hands back a module constant in both worlds and the clearance under a bar is
 * fixed geometry. A `WeakMap` rather than a field on the model so that swapping
 * `SkateModel.surface` — which the harnesses and the map change both do — picks
 * the new world's bars up with no wiring at all.
 */
const CACHE = new WeakMap<SurfaceProvider, readonly SteelBar[]>();

export function steelBars(surface: SurfaceProvider): readonly SteelBar[] {
  const had = CACHE.get(surface);
  if (had) return had;
  const out: SteelBar[] = [];
  for (const line of surface.rails()) {
    if (line.kind !== "rail") continue;
    let clear = 0;
    for (let i = 0; i < CLEAR_SAMPLES; i++) {
      const t = i / (CLEAR_SAMPLES - 1);
      const x = line.a.x + (line.b.x - line.a.x) * t;
      const y = line.a.y + (line.b.y - line.a.y) * t;
      const z = line.a.z + (line.b.z - line.a.z) * t;
      clear = Math.max(clear, y - surface.height(x, z, y));
    }
    if (clear < BOLTED_ON) continue;
    const dx = line.b.x - line.a.x;
    const dz = line.b.z - line.a.z;
    const len = Math.hypot(dx, dz);
    // A bar with no ground-plane run at all is a post, and a post is a solid.
    if (len < 1e-6) continue;
    out.push({
      line,
      ax: line.a.x,
      az: line.a.z,
      dx,
      dz,
      ay: line.a.y,
      by: line.b.y,
      ux: dx / len,
      uz: dz / len,
    });
  }
  CACHE.set(surface, out);
  return out;
}

/** Where a step ran into steel. */
export interface SteelHit {
  readonly bar: SteelBar;
  /** How far along the step the contact is, 0…1. */
  readonly s: number;
  /** …and how far along the bar, 0…1 — the height comes off this. */
  readonly t: number;
  /** Top of the steel at the contact point. */
  readonly top: number;
}

/**
 * Top of a bar's steel over a point on its own run, given the along parameter.
 * Sloped handrails are just a line whose ends differ in y, so this is a lerp.
 */
export function steelTopAt(bar: SteelBar, t: number): number {
  return bar.ay + (bar.by - bar.ay) * t + TUBE_R;
}

/**
 * Does a step cross a bar it may not pass?
 *
 * `probe` is the point the ride tests solidity at — the board plus
 * `WALL_PROBE`, exactly as `advanceStep` computes it for `blocked()`. Returns
 * the FIRST bar the step crosses under the steel, or null.
 *
 * CROSSING THE AXIS IS THE WHOLE TEST, and the tube's own 4.5 cm of thickness
 * is deliberately NOT part of it. A version that also refused any step ending
 * within `TUBE_R` of the axis was built and measured, and it bought nothing the
 * player could see while costing something he could: no board can reach the far
 * side of a bar without crossing its axis, so the crossing test alone is already
 * the whole of "you cannot ride through a rail" — and a board that creeps up to
 * the axis and stops is by this rule at least `WALL_PROBE - TUBE_R` = 0.26 m
 * BELOW it, which is a board standing under a handrail and not a board inside
 * one. What the thickness test cost was the ends: approaching a bar head-on
 * along its own line crosses from off-the-end to alongside-it, so the head of
 * the six-stair rail became a wall — measured on `tools/integration-check.mjs`,
 * 4 of 99 ollies at the six-stair stopped dead at z = −14.2, which is the rail's
 * top end, and the one x you cannot take that set from was the rail's own line.
 * A handrail's head is a thing you ride up to.
 *
 * `skip` is the line currently being ground, which the geometry already lets
 * through (the trucks sit on the axis, so the probe is a clear 0.25 m over the
 * steel) but which is named anyway: a boardslide crosses its own line at right
 * angles, and a rule that depends on a tolerance staying wider than a tube is a
 * rule waiting to be re-tuned into a bug.
 */
export function meetSteel(
  bars: readonly SteelBar[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  probe: number,
  skip: string | null = null,
): SteelHit | null {
  const px = x1 - x0;
  const pz = z1 - z0;
  let best: SteelHit | null = null;
  for (const bar of bars) {
    if (skip !== null && bar.line.id === skip) continue;
    // Segment against segment in the ground plane. `den` is the 2D cross of the
    // two directions; parallel means no crossing — a board running ALONG a bar
    // is riding beside it or grinding it, and neither is a wall.
    const den = px * bar.dz - pz * bar.dx;
    if (Math.abs(den) < 1e-12) continue;
    const rx = bar.ax - x0;
    const rz = bar.az - z0;
    const s = (rx * bar.dz - rz * bar.dx) / den;
    if (s < 0 || s > 1) continue;
    const t = (rx * pz - rz * px) / den;
    if (t < 0 || t > 1) continue;
    // …and it only counts if he was UNDER the steel when he got there. Above it
    // he is stepping over a rail, which is the whole of ollieing one.
    const top = steelTopAt(bar, t);
    if (probe >= top) continue;
    if (!best || s < best.s) best = { bar, s, t, top };
  }
  return best;
}
