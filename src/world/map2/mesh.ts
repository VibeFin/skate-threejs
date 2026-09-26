// THE CHANNEL, DRAWN — the second reader of `channel.ts`, and the only other one.
//
// Map 1's discipline is that `topOf()` answers the height query and
// `meshSolid()` walks the SAME profile to emit triangles, so neither knows a
// number the other does not. This is that, for a field instead of for a pile of
// boxes: every vertex below comes out of `crossY` and `floorY`, and every normal
// out of `channelGradient` — the same three calls `surface.ts` makes. There is
// no second description of the spillway anywhere in this map.
//
// HOW IT IS CUT UP. Rows run down the channel at a fixed spacing; columns run
// across it and are placed at the SECTION'S OWN BREAKPOINTS rather than evenly,
// so the toe of a transition, the top of a wall and the lip of a walkway are
// each a real edge in the mesh instead of something a uniform grid smears over.
// The column COUNT is the same for every row — only the metres they sit at
// change — which is what lets a row be stitched to the next one without a
// search, and it is why a coping rolled to zero radius simply collapses its
// three crest columns onto each other rather than needing a case of its own.
//
// The two drop structures get a row on each side of themselves a millimetre
// apart, and the quad between those two rows IS the face. It is the one place
// in this file that does not take its normal from `channelGradient`: a gradient
// read across a 3.4 m step is not a slope, it is a division by nothing.

import * as THREE from "three";
import type { QualityTier } from "../../controllers/quality/tier";
import {
  CHANNEL_Z0,
  CHANNEL_Z1,
  HILL_REACH,
  STEPS,
  centreX,
  channelGradient,
  crossY,
  floorY,
  makeMarks,
  makeSection,
  marksOf,
  sectionAt,
  type Marks,
} from "./channel";
import { TILE, buffers, meshFeature, quad, type Buffers, type Map2Look } from "./features";
import { BUILT } from "./layout";
import { BOUND_INSET } from "./surface";

/** How far past the profile's own ends the ground is still drawn. */
const OVERRUN = 14;

/** How finely each band of the cross-section is cut, per tier. */
interface Detail {
  dz: number;
  floor: number;
  arc: number;
  wall: number;
  crest: number;
  apron: number;
  cut: number;
  hill: number;
}

function detailFor(tier: QualityTier): Detail {
  const phone = tier.name === "phone" || tier.name === "phone-low";
  return phone
    ? { dz: 3.5, floor: 3, arc: 4, wall: 1, crest: 2, apron: 1, cut: 2, hill: 2 }
    : { dz: 2, floor: 5, arc: 7, wall: 2, crest: 3, apron: 2, cut: 3, hill: 4 };
}

/** The stations the mesh is cut at, with the drop structures split in two. */
function rows(dz: number): { z: number; face: boolean }[] {
  const out: { z: number; face: boolean }[] = [];
  const z0 = CHANNEL_Z0 - OVERRUN;
  const z1 = CHANNEL_Z1 + OVERRUN;
  let next = 0;
  for (let z = z0; z <= z1 + 1e-6; z += dz) {
    while (next < STEPS.length && STEPS[next].z < z) {
      // A millimetre either side of the lip: `floorY` answers with the LOWER
      // floor exactly on it, so the upper row has to be taken from just short.
      out.push({ z: STEPS[next].z - 0.001, face: true });
      out.push({ z: STEPS[next].z + 0.001, face: false });
      next += 1;
    }
    out.push({ z, face: false });
  }
  return out;
}

/**
 * Where the columns sit across the section, as distances from the centreline —
 * negative on the west bank, positive on the east. The breakpoints come out of
 * `marksOf`, which is the same set `crossY` switches on, so a column boundary
 * and a shape boundary are the same thing by construction.
 */
function columnsOf(m: Marks, d: Detail, out: number[]): void {
  out.length = 0;
  const half: number[] = [];
  const span = (from: number, to: number, n: number): void => {
    for (let i = 1; i <= n; i++) half.push(from + ((to - from) * i) / n);
  };
  half.push(0);
  span(0, m.floor, d.floor);
  span(m.floor, m.arc, d.arc);
  span(m.arc, m.wall, d.wall);
  span(m.wall, m.crest, d.crest);
  // The freeboard apron and the parapet. The parapet gets ONE column, because
  // it is a plane — 84° of flat concrete — and cutting a plane finely buys
  // nothing but triangles. The apron gets two, because it is the piece the
  // rider is actually looking at from the top of a carve.
  span(m.crest, m.apron, d.apron);
  half.push(m.parapet);
  // The walkway's outer edge is where the fence stands, so it gets a column of
  // its own — otherwise the one line in the section a player is asked to notice
  // falls between two vertices.
  half.push(m.deck - BOUND_INSET);
  half.push(m.deck);
  span(m.deck, m.deck + 1.5, d.cut);
  span(m.deck + 1.5, m.deck + HILL_REACH, d.hill);
  for (let i = half.length - 1; i >= 1; i--) out.push(-half[i]);
  for (const v of half) out.push(v);
}

/** Which material a column belongs to — the concrete stops at the walkway's edge. */
function lookOfColumn(d: number, m: Marks): Map2Look {
  return Math.abs(d) <= m.deck + 1e-6 ? "flume" : "hill";
}

interface RowData {
  z: number;
  face: boolean;
  /** Where each column sits across the section — kept so the look is read off
   *  the row it belongs to rather than off whichever row was built last. */
  u: number[];
  /** World position of every column. */
  x: number[];
  y: number[];
  /** Analytic normal at every column. */
  nx: number[];
  ny: number[];
  nz: number[];
  /** Cross-section arc length from the centreline, for the UVs. */
  arc: number[];
  /** The section's breakpoints at this row — the column looks read them. */
  marks: Marks;
}

const _grad = { gx: 0, gz: 0 };

function rowAt(z: number, face: boolean, d: Detail, cols: number[]): RowData {
  const sec = sectionAt(z, makeSection());
  const marks = marksOf(sec, makeMarks());
  columnsOf(marks, d, cols);
  const cx = centreX(z);
  const base = floorY(z);
  const row: RowData = {
    z,
    face,
    u: cols.slice(),
    x: [],
    y: [],
    nx: [],
    ny: [],
    nz: [],
    arc: [],
    marks,
  };
  let run = 0;
  for (let i = 0; i < cols.length; i++) {
    const u = cols[i];
    const x = cx + u;
    const y = base + crossY(Math.abs(u), sec, marks);
    if (i > 0) run += Math.hypot(x - row.x[i - 1], y - row.y[i - 1]);
    row.x.push(x);
    row.y.push(y);
    // The arc length is measured from the WEST edge and then rebased, so a
    // texture running across a 50 m section never stretches on the walls.
    row.arc.push(run);
    channelGradient(x, z, _grad);
    const inv = 1 / Math.hypot(_grad.gx, 1, _grad.gz);
    row.nx.push(-_grad.gx * inv);
    row.ny.push(inv);
    row.nz.push(-_grad.gz * inv);
  }
  return row;
}

const _q = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _n = new THREE.Vector3();

/**
 * The channel, as two batches: the concrete and the ground behind it.
 *
 * Rather than one normal per quad, each vertex carries the analytic normal of
 * the surface AT that vertex — a 9 m transition cut into seven columns is
 * faceted under flat shading and smooth under this, and the difference is
 * visible from anywhere in the bowl.
 */
export function buildChannelGeometry(tier: QualityTier): Map<Map2Look, THREE.BufferGeometry> {
  const d = detailFor(tier);
  const list = rows(d.dz);
  const cols: number[] = [];
  const byLook = new Map<Map2Look, Buffers>();
  const take = (look: Map2Look): Buffers => {
    let b = byLook.get(look);
    if (!b) byLook.set(look, (b = buffers()));
    return b;
  };

  let prev = rowAt(list[0].z, list[0].face, d, cols);
  for (let r = 1; r < list.length; r++) {
    const cur = rowAt(list[r].z, list[r].face, d, cols);
    const stepFace = prev.face;
    for (let i = 0; i < prev.x.length - 1; i++) {
      const look = lookOfColumn(prev.u[i], prev.marks);
      const m = take(look);
      const tile = TILE[look];
      _q[0].set(prev.x[i], prev.y[i], prev.z);
      _q[1].set(cur.x[i], cur.y[i], cur.z);
      _q[2].set(cur.x[i + 1], cur.y[i + 1], cur.z);
      _q[3].set(prev.x[i + 1], prev.y[i + 1], prev.z);
      const uv = [
        prev.arc[i] / tile,
        prev.z / tile,
        cur.arc[i] / tile,
        cur.z / tile,
        cur.arc[i + 1] / tile,
        cur.z / tile,
        prev.arc[i + 1] / tile,
        prev.z / tile,
      ];
      if (stepFace) {
        // The drop's own face. It is the downstream end of the slab above, so
        // it looks DOWN the channel — at the rider who has just flown off it —
        // and its UVs run down the wall rather than along the floor, so the
        // formwork on a 3.4 m face reads as 3.4 m of formwork.
        const vTop = prev.y[i] / tile;
        const vBot = cur.y[i] / tile;
        quad(m, _q[0], _q[1], _q[2], _q[3], _n.set(0, 0, 1), [
          prev.arc[i] / tile,
          vTop,
          cur.arc[i] / tile,
          vBot,
          cur.arc[i + 1] / tile,
          vBot,
          prev.arc[i + 1] / tile,
          vTop,
        ]);
        continue;
      }
      // Two triangles, each vertex with its own normal — `quad` writes one
      // normal for the whole face, so the strip is emitted by hand here.
      pushSmooth(m, prev, cur, i, uv);
    }
    prev = cur;
  }

  const out = new Map<Map2Look, THREE.BufferGeometry>();
  for (const [look, b] of byLook) out.set(look, toGeometry(b));
  return out;
}

/** One quad of the channel, with per-vertex analytic normals. */
function pushSmooth(m: Buffers, a: RowData, b: RowData, i: number, uv: readonly number[]): void {
  const v = [
    { r: a, c: i, u: 0 },
    { r: b, c: i, u: 1 },
    { r: b, c: i + 1, u: 2 },
    { r: a, c: i, u: 0 },
    { r: b, c: i + 1, u: 2 },
    { r: a, c: i + 1, u: 3 },
  ];
  for (const p of v) {
    m.pos.push(p.r.x[p.c], p.r.y[p.c], p.r.z);
    m.nor.push(p.r.nx[p.c], p.r.ny[p.c], p.r.nz[p.c]);
    m.uv.push(uv[p.u * 2], uv[p.u * 2 + 1]);
  }
}

function toGeometry(b: Buffers): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

/** Everything standing in the channel, batched by material. */
export function buildFeatureGeometry(): Map<Map2Look, THREE.BufferGeometry> {
  // BUILT, not FEATURES: the furniture's colliders are drawn by their own
  // procedural models, and meshing them here would stand a grey box inside
  // every barricade on the walkway.
  const byLook = new Map<Map2Look, Buffers>();
  for (const f of BUILT) {
    let b = byLook.get(f.look);
    if (!b) byLook.set(f.look, (b = buffers()));
    meshFeature(f, b);
  }
  const out = new Map<Map2Look, THREE.BufferGeometry>();
  for (const [look, b] of byLook) out.set(look, toGeometry(b));
  return out;
}

// ---------------------------------------------------------------------------
// the fence line
// ---------------------------------------------------------------------------

/** How high the chain link stands off the walkway. */
export const FENCE_HEIGHT = 2.2;
/** …and how far apart its posts are. */
export const FENCE_POST_PITCH = 3.4;

/**
 * The chain link, as one strip per bank, standing exactly on the line
 * `blocked()` stops you at.
 *
 * That is the whole reason it is generated here off `boundAt`'s own numbers
 * rather than laid out by eye: a fence you can ride through, or an invisible
 * wall a metre in front of the fence, are the same bug — two descriptions of
 * one edge — and the way not to have it is to only ever write the edge down
 * once.
 */
export function buildFenceGeometry(tier: QualityTier, side: 1 | -1): THREE.BufferGeometry {
  const d = detailFor(tier);
  const b = buffers();
  const tile = TILE.fence;
  const sec = makeSection();
  const marks = makeMarks();
  const at = (z: number, out: THREE.Vector3): THREE.Vector3 => {
    const m = marksOf(sectionAt(z, sec), marks);
    return out.set(centreX(z) + side * (m.deck - BOUND_INSET), floorY(z) + m.topH, z);
  };
  const step = Math.max(2, d.dz);
  let run = 0;
  for (let z = CHANNEL_Z0 - OVERRUN; z < CHANNEL_Z1 + OVERRUN; z += step) {
    at(z, _q[0]);
    at(Math.min(z + step, CHANNEL_Z1 + OVERRUN), _q[1]);
    const len = Math.hypot(_q[1].x - _q[0].x, _q[1].z - _q[0].z);
    _q[3].set(_q[0].x, _q[0].y + FENCE_HEIGHT, _q[0].z);
    _q[2].set(_q[1].x, _q[1].y + FENCE_HEIGHT, _q[1].z);
    _n.set(-side, 0, 0);
    quad(b, _q[0], _q[1], _q[2], _q[3], _n, [
      run / tile,
      0,
      (run + len) / tile,
      0,
      (run + len) / tile,
      FENCE_HEIGHT / tile,
      run / tile,
      FENCE_HEIGHT / tile,
    ]);
    run += len;
  }
  return toGeometry(b);
}

/** Where every fence post stands, so the steel can be instanced onto them. */
export function fencePosts(side: 1 | -1): { x: number; y: number; z: number }[] {
  const sec = makeSection();
  const marks = makeMarks();
  const out: { x: number; y: number; z: number }[] = [];
  for (let z = CHANNEL_Z0 - OVERRUN; z < CHANNEL_Z1 + OVERRUN; z += FENCE_POST_PITCH) {
    const m = marksOf(sectionAt(z, sec), marks);
    out.push({ x: centreX(z) + side * (m.deck - BOUND_INSET), y: floorY(z) + m.topH, z });
  }
  return out;
}
