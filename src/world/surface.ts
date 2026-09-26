// The ground, as a contract.
//
// The ride never collides with anything — it ASKS the world how high the floor
// is under the board and rides that answer. On the grass field that question
// has one sine function behind it. A street spot is not a sine field: it has
// flat plaza, banks, quarter-pipe transitions, ledges you roll along the TOP
// of, stairs and walls. So the question moves behind this interface, the world
// lane implements it, and the skate model never learns which world it is on.
//
// `yHint` is the whole reason this is an interface and not three loose
// functions. A ledge has TWO valid heights at one (x, z): the pavement beside
// it and its top face, half a metre up. Passing the board's own y disambiguates
// — a provider answers with the highest surface AT OR BELOW the hint — and that
// single argument is what lets a skater roll along the top of a ledge on one
// run and roll past its base on the next. Omit it and you get the topmost
// surface there is, which is what a body falling out of the sky wants.

import * as THREE from "three";
import { FIELD_SOFT_EDGE, groundHeight, groundNormal, slopeAlong } from "./terrain";

/** What the wheels are on. Drives the roll sound, the grind sound and the grip. */
export type SurfaceKind = "asphalt" | "concrete" | "metal" | "wood" | "grass";

export interface SurfaceSample {
  height: number;
  normal: THREE.Vector3;
  kind: SurfaceKind;
}

/**
 * A rail or a ledge edge, as the segment the board actually locks onto.
 *
 * `a.y`/`b.y` are the GRIND height — where the trucks sit, not the floor under
 * the rail — so a sloped handrail is just a segment whose ends differ in y.
 */
export interface GrindLine {
  id: string;
  a: THREE.Vector3;
  b: THREE.Vector3;
  kind: "rail" | "ledge";
  surface: SurfaceKind;
  /** How close the board has to pass for this line to catch, metres. */
  radius: number;
}

export interface SurfaceProvider {
  /** Top surface at or below `yHint` — this is what makes ledges work. */
  height(x: number, z: number, yHint?: number): number;
  normal(x: number, z: number, out?: THREE.Vector3): THREE.Vector3;
  /** Height, normal and material in one query — cheaper than three. */
  sample(x: number, z: number, yHint?: number, out?: SurfaceSample): SurfaceSample;
  /**
   * Height change per metre travelled along (dirX, dirZ); positive is uphill.
   *
   * Difference over a SHORT lookahead — 0.2 m or so. The field's version looks
   * 1.5 m ahead, which is fine for a hill and useless on a quarter pipe: a
   * 0.5 m lookahead measured an 80° transition as an 11° ramp in the harness,
   * because the difference straddles the lip. The ride is written not to depend
   * on this for the launch test, but it does drive how a climb costs speed.
   */
  slopeAlong(x: number, z: number, dirX: number, dirZ: number, yHint?: number): number;
  rails(): readonly GrindLine[];
  /** true where a wall blocks the board at this height — lateral stop, no bounce */
  blocked(x: number, z: number, y: number): boolean;
  /** where a fresh run starts, and which way it faces */
  spawn(): { x: number; z: number; heading: number };
  /**
   * Optional: distance from the origin past which the ride steers itself back
   * toward the middle. The open field is bounded by nothing you can hit, so it
   * needs one; a street spot is bounded by its own walls and leaves this unset
   * so `blocked` does the work.
   */
  readonly softEdge?: number;
}

/** A reusable sample, so a per-frame query allocates nothing. */
export function makeSample(): SurfaceSample {
  return { height: 0, normal: new THREE.Vector3(0, 1, 0), kind: "concrete" };
}

/**
 * The grass field, wearing the new contract. Nothing here knows about ledges or
 * rails — it is the sine field milestones 1–6 shipped on, kept so the game
 * still boots the instant the spine changes hands. The world lane replaces it
 * with the street spot.
 */
export class FieldSurface implements SurfaceProvider {
  readonly softEdge = FIELD_SOFT_EDGE;
  private static readonly NO_RAILS: readonly GrindLine[] = [];

  height(x: number, z: number): number {
    return groundHeight(x, z);
  }

  normal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    return groundNormal(x, z, out);
  }

  sample(x: number, z: number, _yHint?: number, out = makeSample()): SurfaceSample {
    out.height = groundHeight(x, z);
    groundNormal(x, z, out.normal);
    out.kind = "grass";
    return out;
  }

  slopeAlong(x: number, z: number, dirX: number, dirZ: number): number {
    return slopeAlong(x, z, dirX, dirZ);
  }

  rails(): readonly GrindLine[] {
    return FieldSurface.NO_RAILS;
  }

  blocked(): boolean {
    return false;
  }

  spawn(): { x: number; z: number; heading: number } {
    return { x: 0, z: 0, heading: 0 };
  }
}

/** The default world — swap `SkateModel.surface` for the street spot. */
export const FIELD_SURFACE: SurfaceProvider = new FieldSurface();

/** Result of dropping a point onto a grind line. */
export interface LineHit {
  /** 0 at `a`, 1 at `b`. Already clamped to the segment. */
  t: number;
  /** Distance from the query point to the closest point on the segment. */
  distance: number;
  /** …and where that closest point is. */
  point: THREE.Vector3;
}

const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();

/**
 * Closest point on a grind line to (x, y, z). Every lock-on test and every
 * "am I still on it" test wants exactly this, so it lives with the type rather
 * than being written twice.
 */
export function projectOnLine(
  line: GrindLine,
  x: number,
  y: number,
  z: number,
  out: LineHit = { t: 0, distance: 0, point: new THREE.Vector3() },
): LineHit {
  _ab.subVectors(line.b, line.a);
  _ap.set(x - line.a.x, y - line.a.y, z - line.a.z);
  const len2 = _ab.lengthSq();
  out.t = len2 < 1e-6 ? 0 : THREE.MathUtils.clamp(_ap.dot(_ab) / len2, 0, 1);
  out.point.copy(line.a).addScaledVector(_ab, out.t);
  out.distance = out.point.distanceTo(_ap.set(x, y, z));
  return out;
}

/**
 * Heading that rides this line from `a` toward `b`, in the model's convention
 * (forward is `(sin h, 0, cos h)`). Grinding the other way is this plus π.
 */
export function lineHeading(line: GrindLine): number {
  return Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
}
