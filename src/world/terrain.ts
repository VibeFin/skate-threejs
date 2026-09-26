// The grass field's shape, as pure math — milestones 1-6's world.
//
// The game rides the street spot now (spot.ts), and this file no longer draws
// anything. It stays because `FieldSurface` in surface.ts is still the boot
// default and the fallback world, and because the discipline it established is
// the one spot.ts inherited: the mesh and the physics read the same function,
// so the board can never float above or sink through what it is rolling on.
// Gentle rolling hills: broad swells you can carve across, small ripples so the
// horizon never reads as a flat sheet.

import * as THREE from "three";

/** Half-extent of the playable field, metres. The field spans -SIZE..+SIZE. */
export const FIELD_HALF = 150;

/** Where the invisible turn-back begins (a little inside the visible edge). */
export const FIELD_SOFT_EDGE = FIELD_HALF - 18;

export function groundHeight(x: number, z: number): number {
  return (
    1.35 * Math.sin(x * 0.0165) * Math.cos(z * 0.0143) +
    0.55 * Math.sin(x * 0.041 + 1.7) * Math.sin(z * 0.037 - 0.6) +
    0.22 * Math.sin((x + z) * 0.083 + 2.4)
  );
}

const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();

/** Surface normal at (x, z), by central difference. */
export function groundNormal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const d = 0.6;
  const hL = groundHeight(x - d, z);
  const hR = groundHeight(x + d, z);
  const hD = groundHeight(x, z - d);
  const hU = groundHeight(x, z + d);
  _e1.set(2 * d, hR - hL, 0);
  _e2.set(0, hU - hD, 2 * d);
  return out.crossVectors(_e2, _e1).normalize();
}

/**
 * Height change per metre travelled along a horizontal direction — positive is
 * uphill. This is what makes the field ride: gravity pulls speed out of a climb
 * and pours it back on the way down.
 */
export function slopeAlong(x: number, z: number, dirX: number, dirZ: number): number {
  const d = 1.5;
  const here = groundHeight(x, z);
  const ahead = groundHeight(x + dirX * d, z + dirZ * d);
  return (ahead - here) / d;
}
