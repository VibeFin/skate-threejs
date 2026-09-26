// SKELETON → TRIANGLES, at whichever level of detail is asked for.
//
// The ring-and-segment walk is adapted from ez-tree's `#meshBranch` (MIT,
// Copyright (c) 2024 Daniel Greenheck — see NOTICE.md), including the two
// details in it that are easy to get wrong: duplicating the first vertex of
// each ring so the UV seam closes instead of smearing the whole texture across
// one segment, and always keeping the FIRST and LAST ring when striding, so a
// coarser level of detail still starts and ends where the branch does.
//
// Everything about foliage is this library's own. ez-tree meshes a leaf per
// leaf; here a branch carries a handful of crossed SPRAY cards and the alpha
// channel carries the needles. Three things stop those cards reading as the
// cardboard the brief forbids, and all three are in `spray()` below:
//
//   1. **Crossed, not flat.** Two planes at ninety degrees per card at full
//      detail. A single plane is invisible edge-on, and a chase camera swings
//      through edge-on constantly — a canopy built from single planes flickers
//      between full and gone as you carve.
//   2. **Rolled about the branch axis.** Every card gets its own roll, so the
//      crossed pairs in one canopy do not all share two planes. Without it a
//      tree has exactly two flat faces and you can see both of them.
//   3. **Rounded normals** — ez-tree's trick, and the single biggest one. Each
//      corner's normal is the card's own normal bent out toward that corner, so
//      a flat quad shades like a piece of a sphere and the canopy has a lit
//      side and a shaded side instead of being one value. (The material has to
//      stop three flipping it on back faces for this to survive; see atlas.ts.)

import * as THREE from "three";
import { cellUv } from "./atlas";
import type { Limb, Skeleton, Spray } from "./grow";
import type { TreeProfile } from "./species";

/** How coarsely to mesh a skeleton. See `detailFor()` for the three in use. */
export interface Detail {
  name: string;
  /** Sample every Nth ring of a limb. */
  ringStride: number;
  /** Multiplier on radial segments; 3 is the floor (a triangular prism). */
  segmentScale: number;
  /** Highest limb level meshed. 0 = trunk only, no branch sticks at all. */
  limbLevels: number;
  /** Planes per spray card. */
  sprayPlanes: 1 | 2;
  /** Keep every Nth spray. */
  spraySkip: number;
  /** Size multiplier on the kept sprays, to hold the canopy's coverage up. */
  sprayScale: number;
}

/**
 * The three levels, and the reasoning behind each cut.
 *
 * `near` is the whole tree. `mid` throws away the branch STICKS and keeps every
 * spray: at sixty metres a 4 cm branch is a third of a pixel and the canopy is
 * a hundred per cent of what you can see, so spending the budget the other way
 * round would be spending it on nothing. `far` is not in this table — it is a
 * pair of crossed cards, built by `buildImposterGeometry`.
 */
export const DETAIL: Record<"near" | "mid" | "midLimbs", Detail> = {
  near: { name: "near", ringStride: 1, segmentScale: 1, limbLevels: 2, sprayPlanes: 2, spraySkip: 1, sprayScale: 1 },
  mid: { name: "mid", ringStride: 2, segmentScale: 0.6, limbLevels: 0, sprayPlanes: 1, spraySkip: 1, sprayScale: 1.2 },
  // A broadleaf keeps its primaries at mid range. Its limbs are 20 cm thick and
  // 5 m long and the canopy sits at the ENDS of them, so dropping them leaves a
  // shell of leaves floating over a bare pole — the one case where the conifer
  // cut is visibly wrong.
  midLimbs: { name: "mid+limbs", ringStride: 2, segmentScale: 0.5, limbLevels: 1, sprayPlanes: 1, spraySkip: 1, sprayScale: 1.2 },
};

/** Which detail a species uses at the middle band. */
export function detailFor(profile: TreeProfile, band: "near" | "mid"): Detail {
  if (band === "near") return DETAIL.near;
  return profile.levels === 2 ? DETAIL.midLimbs : DETAIL.mid;
}

interface Buf {
  pos: number[];
  nor: number[];
  uv: number[];
  sway: number[];
  idx: number[];
}

const buf = (): Buf => ({ pos: [], nor: [], uv: [], sway: [], idx: [] });

function toGeometry(b: Buf): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute("aSway", new THREE.Float32BufferAttribute(b.sway, 1));
  g.setIndex(b.idx);
  g.computeBoundingSphere();
  return g;
}

/** Metres of trunk one wrap of the bark map covers. */
const BARK_TILE = 0.8;

function meshLimb(b: Buf, limb: Limb, detail: Detail): void {
  const stride = Math.max(1, Math.floor(detail.ringStride));
  const segments = Math.max(3, Math.round(limb.segments * detail.segmentScale));
  const rings: typeof limb.rings = [];
  for (let i = 0; i < limb.rings.length; i += stride) rings.push(limb.rings[i]);
  if ((limb.rings.length - 1) % stride !== 0) rings.push(limb.rings[limb.rings.length - 1]);
  if (rings.length < 2) return;

  // How many times the bark map goes round. Held constant for the whole limb —
  // a per-ring wrap count computed off the tapering radius twists the texture
  // longitudinally, which on a trunk reads as a barber's pole.
  const wraps = Math.max(1, Math.round((2 * Math.PI * limb.rings[0].r) / BARK_TILE));
  const base = b.pos.length / 3;
  const N = segments + 1;
  let run = 0;
  const axis = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const pt = new THREE.Vector3();

  for (let k = 0; k < rings.length; k++) {
    const ring = rings[k];
    if (k > 0) run += ring.p.distanceTo(rings[k - 1].p);
    const t = k / (rings.length - 1);
    // The trunk barely moves in the wind and a branch tip moves a lot. Squared
    // on the trunk so the bottom three metres are effectively rigid — a tree
    // whose base slides is the tell that the sway is a shader and not a tree.
    const sway = limb.level === 0 ? 0.22 * t * t : 0.28 + 0.5 * t;
    for (let j = 0; j <= segments; j++) {
      const a = (2 * Math.PI * (j % segments)) / segments;
      axis.set(Math.cos(a), 0, Math.sin(a)).applyQuaternion(ring.q);
      pt.copy(axis).multiplyScalar(ring.r).add(ring.p);
      nrm.copy(axis).normalize();
      b.pos.push(pt.x, pt.y, pt.z);
      b.nor.push(nrm.x, nrm.y, nrm.z);
      // The duplicated last vertex takes u = wraps rather than 0, which is the
      // same texel (wraps is an integer) reached from the other side — that is
      // what closes the seam.
      b.uv.push((j / segments) * wraps, run / BARK_TILE);
      b.sway.push(sway);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const v1 = base + i * N + j;
      const v2 = base + i * N + j + 1;
      b.idx.push(v1, v1 + N, v2, v2, v1 + N, v2 + N);
    }
  }
}

const CARD_X = new THREE.Vector3();
const CARD_N = new THREE.Vector3();
const CARD_V = new THREE.Vector3();

function meshSpray(b: Buf, spray: Spray, profile: TreeProfile, detail: Detail): void {
  const cell = cellUv(profile.cells[spray.cell]);
  const size = spray.size * detail.sprayScale;
  const half = size * 0.5;
  const plane = (roll: number): void => {
    const q = spray.q.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll),
    );
    CARD_X.set(1, 0, 0).applyQuaternion(q);
    const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    CARD_N.set(0, 0, 1).applyQuaternion(q);
    const i0 = b.pos.length / 3;
    // Corners: base-left, base-right, tip-right, tip-left. The card grows from
    // the branch outward along the branch's own axis, so a drooping branch
    // droops its foliage with it.
    const corners: [number, number][] = [
      [-half, 0],
      [half, 0],
      [half, size],
      [-half, size],
    ];
    const uvs: [number, number][] = [
      [cell.u0, cell.v0],
      [cell.u1, cell.v0],
      [cell.u1, cell.v1],
      [cell.u0, cell.v1],
    ];
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = corners[i];
      CARD_V.copy(spray.p).addScaledVector(CARD_X, cx).addScaledVector(upv, cy);
      b.pos.push(CARD_V.x, CARD_V.y, CARD_V.z);
      // Rounded normal: the card's normal bent out toward this corner. See the
      // header — this is what stops a canopy being one flat value.
      const n = CARD_N.clone().add(CARD_V.clone().sub(spray.p).normalize()).normalize();
      b.nor.push(n.x, n.y, n.z);
      b.uv.push(uvs[i][0], uvs[i][1]);
      b.sway.push(cy === 0 ? 0.55 : 1);
    }
    b.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  };
  plane(spray.roll);
  if (detail.sprayPlanes === 2) plane(spray.roll + Math.PI / 2);
}

export interface TreeMesh {
  /** Trunk and branch sticks — opaque, the `bark` material. */
  bark: THREE.BufferGeometry;
  /** Spray cards — alpha-tested, the `foliage` material. */
  foliage: THREE.BufferGeometry;
  triangles: number;
  height: number;
  spread: number;
}

export function buildTreeMesh(profile: TreeProfile, skeleton: Skeleton, detail: Detail): TreeMesh {
  const barkBuf = buf();
  const foliageBuf = buf();
  for (const limb of skeleton.limbs) {
    if (limb.level > detail.limbLevels) continue;
    meshLimb(barkBuf, limb, detail);
  }
  for (let i = 0; i < skeleton.sprays.length; i += detail.spraySkip) {
    meshSpray(foliageBuf, skeleton.sprays[i], profile, detail);
  }
  const bark = toGeometry(barkBuf);
  const foliage = toGeometry(foliageBuf);
  return {
    bark,
    foliage,
    triangles: (barkBuf.idx.length + foliageBuf.idx.length) / 3,
    height: skeleton.height,
    spread: skeleton.spread,
  };
}

/**
 * The far card: two crossed quads carrying a picture of this very tree.
 *
 * Crossed and STATIC rather than camera-facing, on purpose. A billboard that
 * turns has to be turned — every frame, on the CPU, for every instance — and at
 * the distance this level is used the difference between a turned card and a
 * fixed cross is a pixel or two of width. A cross also never rotates under a
 * carving camera, which a turning billboard visibly does when you sweep past a
 * hillside of them.
 *
 * The quad is SQUARE and the texture is square, so nothing about the tree is
 * stretched: a narrow spruce simply leaves more of its card transparent, which
 * the alpha test throws away before it shades anything.
 */
/**
 * How big the card has to be to hold this tree.
 *
 * The card is square, so it is sized by whichever of the tree's own dimensions
 * is larger. Sizing it by height alone is the bug this exists to prevent: the
 * broadleaf measures 15.6 m tall and 15.2 m across, and a card 15.6 m wide has
 * two centimetres of margin on each side — one seed with a longer limb and the
 * outer sprays walk off the edge of their own texture.
 */
export function imposterSize(skeleton: Skeleton): number {
  return Math.max(skeleton.height, 2.15 * skeleton.spread);
}

export function buildImposterMesh(size: number): THREE.BufferGeometry {
  const b = buf();
  const half = size * 0.5;
  const height = size;
  const plane = (yaw: number): void => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const i0 = b.pos.length / 3;
    const corners: [number, number][] = [
      [-half, 0],
      [half, 0],
      [half, height],
      [-half, height],
    ];
    const uvs: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (let i = 0; i < 4; i++) {
      const [x, y] = corners[i];
      const px = x * c;
      const pz = x * s;
      b.pos.push(px, y, pz);
      // Normals lean OUT and UP rather than sitting flat on the quad: a distant
      // tree lit purely by its card's own normal is either fully lit or fully
      // dark depending which way the cross happens to face, and a hillside of
      // those alternates light and dark in stripes. Blending toward vertical
      // makes the far stand read as one mass under one sky, which is what a
      // hazed hillside actually does.
      const n = new THREE.Vector3(px, half * 0.9, pz).normalize();
      b.nor.push(n.x, n.y, n.z);
      b.uv.push(uvs[i][0], uvs[i][1]);
      b.sway.push(0);
    }
    b.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  };
  plane(0);
  plane(Math.PI / 2);
  return toGeometry(b);
}

/**
 * The sprays of a skeleton, flattened onto the imposter card's plane.
 *
 * Returned in the card's own [0,1]² space with y up, ready for
 * `imposterTexture()`. Because these are the SAME sprays the near mesh builds,
 * the card and the tree are one drawing at two resolutions — which is the only
 * way a level-of-detail swap goes unnoticed.
 */
export function imposterMarks(
  skeleton: Skeleton,
): { marks: { x: number; y: number; size: number; angle: number }[]; trunk: { width: number; top: number } } {
  const h = imposterSize(skeleton);
  const dir = new THREE.Vector3();
  const marks = skeleton.sprays.map((s, i) => {
    dir.set(0, 1, 0).applyQuaternion(s.q);
    // UNFOLDED, not projected — and this is the difference between a card that
    // reads as a fir and one that reads as a stick with eight leaves on it.
    //
    // A straight orthographic projection is what a photograph of the tree would
    // give, and it fails at this branch count: a conifer's branches go out
    // radially, so the two thirds of them pointing toward or away from the
    // camera collapse onto the trunk and only the handful lying in the view
    // plane make any outline at all. The review page caught it — 153 sprays
    // drawn, twelve lobes visible. Each spray is placed at its true RADIAL
    // distance from the trunk instead, on the side it was already on, so every
    // branch contributes its full length to the silhouette. It is a lie about
    // where any one spray is; it is the truth about the shape of the tree, and
    // at a hundred and thirty metres that is the only thing being asked.
    const radial = Math.hypot(s.p.x, s.p.z);
    const side = s.p.x !== 0 ? Math.sign(s.p.x) : i % 2 ? 1 : -1;
    const horiz = Math.hypot(dir.x, dir.z) * side;
    return {
      x: 0.5 + (side * radial) / h,
      y: s.p.y / h,
      size: s.size / h,
      // Canvas rotates clockwise (y is down), and the painters grow toward
      // canvas −y, so this is the angle that lands the drawn spray along the
      // branch's own direction. Derived, not guessed — see the note in
      // atlas.ts. The horizontal component is the unfolded one, to match.
      angle: Math.atan2(horiz, dir.y),
    };
  });
  const trunkRings = skeleton.limbs[0].rings;
  return {
    marks,
    trunk: {
      width: (2 * trunkRings[0].r) / h,
      top: trunkRings[trunkRings.length - 1].p.y / h,
    },
  };
}
