// THE SPILLWAY, as the ride sees it.
//
// The ride never collides with this map — it asks it how high the floor is and
// rides the answer, exactly as it does on the street. So everything the ride is
// ever told about map 2 comes out of the two descriptions next door: the
// channel's own closed form (`channel.ts`) and the features standing on it
// (`features.ts` / `layout.ts`). Nothing here holds a coordinate of its own.
//
// WHAT IS DIFFERENT FROM MAP 1, and why it matters to the ride:
//
// · **There is ground under every query, everywhere in the world.** Map 1's
//   floors have to be run a metre and a half in under the walls that bound them
//   (`WALL_TUCK`) because a plaza described as boxes has NO answer outside the
//   boxes, and "no floor" is a hole the ride's own lookahead reads as a cliff to
//   launch from. A field has no outside. `height()` here can never fall through
//   and there is no "inside solid matter" branch to get wrong.
//
// · **`blocked()` is one analytic test, not a list.** The world is bounded by
//   the outer edge of the walkway on each bank — chain link on the city side,
//   the rock cut on the hill side — and that edge is a function of z the
//   section already carries. So the bound cannot drift away from the fence
//   drawn on it, and it costs one subtraction rather than forty AABB rejects on
//   every one of the ~400 probes the ride walks per frame.
//
// · **The two drop structures bound themselves.** A 3.4 m step is a wall from
//   below and nothing at all from above, and both of those fall straight out of
//   the same height function — which is why you can ride off one and cannot
//   ride back up it, without anything here knowing they exist.

import * as THREE from "three";
import {
  centreX,
  channelBand,
  channelGradient,
  channelY,
  flumeSurfaceY,
  makeMarks,
  makeSection,
  marksOf,
  sectionAt,
} from "./channel";
import { normalOfFeature, topOfFeature, type Feature } from "./features";
import { FEATURES, RAILS, spawnPoint } from "./layout";
import {
  makeSample,
  type GrindLine,
  type SurfaceProvider,
  type SurfaceSample,
} from "../surface";

/**
 * How far short of the walkway's outer edge the world stops.
 *
 * The fence posts stand 0.35 m in from the edge on a real channel and that is
 * where the mesh puts them, so this is the fence line rather than a margin
 * invented here. `dressing.ts` reads the same number.
 */
export const BOUND_INSET = 0.35;
/**
 * How high the chain link stands, for the mesh that draws it. 2.6 m is a fence
 * with its barbed arm on, and it is also the height of the rock cut opposite,
 * so one number covers both banks honestly.
 *
 * The BOUND itself ignores it, and that is a change this round made on purpose.
 * It used to be height-aware so that a boost out of the bowl was not stopped in
 * mid-flight over a fence it had already cleared — which was the right call
 * while the freeboard below was a wall, because then nothing could ever get up
 * there on its wheels. Now that the whole bank is rideable to the walkway (see
 * `PARAPET_SLOPE`), a rider carving hard can climb the lot, and the ground
 * BEHIND the fence is a hillside rising at 0.58: it is over the fence's own
 * 2.6 m four and a half metres out, so a height-aware bound had a gap in it and
 * a hard carve out of the long straight ended twelve metres up a hill with the
 * channel out of sight. The line is the fence and it holds at every height.
 */
export const BOUND_HEIGHT = 2.6;

const _sec = makeSection();
const _marks = makeMarks();
const _grad = { gx: 0, gz: 0 };
const _bound = { parapet: 0, fence: 0, y: 0 };

/**
 * Where the freeboard wall stands at this station, where the fence behind it
 * does, and how high the walkway is UNDER THE FENCE — which is not `topH`,
 * because the walkway is graded back toward the channel (see `DECK_FALL`), so
 * the fence line is the highest concrete in the section rather than the lowest.
 */
export function boundAt(
  z: number,
  out: { parapet: number; fence: number; y: number },
): { parapet: number; fence: number; y: number } {
  const m = marksOf(sectionAt(z, _sec), _marks);
  out.parapet = m.apron;
  out.fence = m.deck - BOUND_INSET;
  out.y = flumeSurfaceY(out.fence, z);
  return out;
}

/**
 * Scratch for `resolve` — one query at a time, the same idiom as map 1's
 * `_hit`. `feature` is null when the answer is the channel itself, which is the
 * common case and the reason the channel is the value it starts from.
 */
const _hit = { feature: null as Feature | null, y: 0 };
const _slopeN = new THREE.Vector3();

class Spillway implements SurfaceProvider {
  private readonly features = FEATURES;

  /**
   * What is under this point, and how high.
   *
   * The channel is the floor of last resort and it always answers, so this can
   * never fail — the loop is only ever looking for something STANDING on it.
   *
   * The cap rule is map 1's, named rather than inferred from a profile shape: a
   * `capped` feature is a stacked floor and `yHint` chooses between it and the
   * concrete underneath, an uncapped one is reached from its own toe and
   * ignores the hint outright. Left capped, a kicker rejects ITSELF the moment
   * it climbs past the hint's own clearance and hands back the floor it is
   * standing on — a ramp the ride then reads as a hole and launches off.
   *
   * On a TIE the later feature wins, the same tie-break map 1 makes for a solid
   * declared last: a bank meets the pad it feeds at exactly the pad's height,
   * and taking the pad's level top there hands back a flat normal for one frame
   * at the top of every roll-on.
   */
  private resolve(x: number, z: number, yHint: number): void {
    _hit.feature = null;
    _hit.y = channelY(x, z);
    for (const f of this.features) {
      if (x < f.aabb.x0 || x > f.aabb.x1 || z < f.aabb.z0 || z > f.aabb.z1) continue;
      const top = topOfFeature(f, x, z);
      if (top === null) continue;
      if (f.capped && top > yHint) continue;
      if (top < _hit.y) continue;
      _hit.feature = f;
      _hit.y = top;
    }
  }

  /** The normal of whatever `resolve` just landed on. */
  private normalOfHit(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    if (_hit.feature) return normalOfFeature(_hit.feature, x, z, out);
    channelGradient(x, z, _grad);
    return out.set(-_grad.gx, 1, -_grad.gz).normalize();
  }

  height(x: number, z: number, yHint = Infinity): number {
    this.resolve(x, z, yHint);
    return _hit.y;
  }

  normal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    // No hint, for the same reason map 1's `normal` takes none: a normal is
    // asked for by things that want the surface itself, and with the cap lifted
    // a point can never be inside anything.
    this.resolve(x, z, Infinity);
    return this.normalOfHit(x, z, out);
  }

  sample(x: number, z: number, yHint = Infinity, out: SurfaceSample = makeSample()): SurfaceSample {
    this.resolve(x, z, yHint);
    out.height = _hit.y;
    this.normalOfHit(x, z, out.normal);
    // Dirt and shale have no entry in `SurfaceKind`, and grass is the closest
    // thing the roll sound has to them — a hillside should hiss, not ring.
    out.kind = _hit.feature
      ? _hit.feature.surface
      : channelBand(x, z) === "hill"
        ? "grass"
        : "concrete";
    return out;
  }

  /**
   * Grade along a direction, taken from the ANALYTIC normal of whatever is
   * under the board — never by differencing two heights. A finite difference
   * has to pick a lookahead and every lookahead is wrong somewhere, and on this
   * map the somewhere is the two drop structures: a difference across one of
   * those reads a 3.4 m cliff as a slope worth 30 m/s.
   */
  slopeAlong(x: number, z: number, dirX: number, dirZ: number, yHint = Infinity): number {
    this.resolve(x, z, yHint);
    this.normalOfHit(x, z, _slopeN);
    // Height gradient of a plane with normal n is (-n.x/n.y, -n.z/n.y).
    return -(_slopeN.x * dirX + _slopeN.z * dirZ) / Math.max(1e-4, _slopeN.y);
  }

  rails(): readonly GrindLine[] {
    return RAILS;
  }

  /**
   * One rule, three times: is anything here standing over the board's probe.
   *
   * The features are asked exactly as map 1 asks its solids. The CHANNEL is
   * asked as well, and that second test does more work than it looks like — it
   * is what makes a drop structure one-way. A 3.4 m step is 3.4 m of floor
   * standing over the probe when you come at it from below and nothing at all
   * when you arrive from above, and neither case needed a rule of its own.
   *
   * Nothing in the RIDEABLE section can trip it: the steepest thing under the
   * bank's crest is a 50° wall, which is 6 cm of rise over the ride's own 5 cm
   * probe against a 30 cm threshold — so every transition stays rideable at
   * every angle and at every speed. The parapet above the freeboard apron is
   * the opposite by construction, and that is what stops you leaving.
   */
  blocked(x: number, z: number, y: number): boolean {
    boundAt(z, _bound);
    const d = Math.abs(x - centreX(z));
    // The fence, and it is the ONLY hard bound on either bank.
    //
    // The freeboard wall below it used to be one too, and taking that out is
    // most of what makes a carve worth taking now — see `PARAPET_SLOPE` in
    // channel.ts. A rider who climbs the whole bank climbs the freeboard as
    // well, runs out of speed on it inside a board's length, and is handed the
    // lot back on the way down; nothing catches him and nothing rubs. The
    // walkway above is graded back toward the flume for the same reason, so the
    // fence is what a rider meets only in the air, which is what `BOUND_HEIGHT`
    // was written about in the first place.
    if (d >= _bound.fence) return true;
    if (channelY(x, z) > y) return true;
    for (const f of this.features) {
      if (x < f.aabb.x0 || x > f.aabb.x1 || z < f.aabb.z0 || z > f.aabb.z1) continue;
      const top = topOfFeature(f, x, z);
      if (top !== null && top > y) return true;
    }
    return false;
  }

  spawn(): { x: number; z: number; heading: number } {
    return spawnPoint();
  }
  // No `softEdge`: the banks are the bound, and they are geometry you can see.
}

/** The world map 2 rides on. */
export const SPILLWAY_SURFACE: SurfaceProvider = new Spillway();
