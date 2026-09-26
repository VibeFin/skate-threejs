// How a prop is put together — the small builder every factory in here uses.
//
// Two rules run this file, and both of them are budget rules the ticket set.
//
// **A part is placed into the geometry, not into the scene graph.** Every
// helper below takes where it goes and bakes that transform into the vertices,
// so a finished prop is a handful of merged meshes rather than thirty Object3Ds
// with thirty matrices. A bollard is 2 draw calls; a traffic light is 4. Placed
// forty times across a map that is the difference between ~100 draw calls and
// ~600, and 600 is a phone dropping frames on street furniture.
//
// **Except for the parts that have to move.** `pivot()` gives a real named
// group with its own transform — the wheelie bin's lid, the meter's head — so
// the hierarchy the img2threejs pipeline asks for (animation-ready, hinges at
// hinges, base pivots on upright props) survives where it is worth anything.
// What is given up is per-part picking on the static parts; each merged mesh
// carries the list of what went into it in `userData.parts` instead, and that
// is enough to answer "what is this made of" without paying for it every frame.
//
// UVs are BOX-PROJECTED at a stated tiles-per-metre, not taken from the
// primitive. A BoxGeometry hands every face a 0→1 UV whatever size the face is,
// so a 2 m cabinet door and a 0.1 m hinge would wear the same grain at twenty
// times the scale — which is the single most common way procedural props end up
// looking like toys. Anything printed opts out and keeps its atlas UVs.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Rand } from "./rng";

export type Vec3 = readonly [number, number, number];

/** Where a part goes, in the prop's own frame. Rotations are applied X→Y→Z. */
export interface At {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

/** Tiles per metre for the wear map, or `"keep"` for anything printed. */
export type UvMode = number | "keep";

/** A line on this instance that a skater could realistically lock onto. */
export interface GrindLine {
  a: Vec3;
  b: Vec3;
  /** Round bar reads as a rail; a cast edge or a rim reads as a ledge. */
  kind: "rail" | "ledge";
}

/**
 * A box the ride can be stopped by — the same three numbers `spot.ts` turns
 * into a Solid, plus the one that says what they MEAN.
 *
 * It lives here rather than in `index.ts` because it is the factories that
 * declare it: a collider is a statement about geometry, and the only place that
 * knows the geometry is the file that draws it. Each factory file therefore
 * exports its family's block as a `const` built from the same frozen record its
 * factory builds from — see `index.ts`, contract point 3, for why there is only
 * one of these per family and why every seed has to fit it.
 */
export interface PropBlock {
  /** Half-extents about the prop's own origin. */
  hx: number;
  hz: number;
  /** The height a board rests at, in prop space. */
  top: number;
  /**
   * Whether `top` is a SURFACE or a CEILING.
   *
   * `true` — a cabinet roof, a planter rim, a pallet deck, a bin lid: real flat
   * matter at that height that the ride is meant to land on, and the review page
   * proves it with a ray probe over the footprint.
   *
   * `false` — a bollard, a sign post, a signal pole, a tree trunk. The number is
   * only there so the query has something to stop against; nobody lands on a
   * 4.6 m pole, and no probe expects a surface up there.
   */
  ride: boolean;
}

export interface Sculpt {
  /** A part that never moves. Merged into its material's batch at `done()`. */
  part(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, hex: number, at?: At, uv?: UvMode): void;
  /** A part that has to move later — its own named group, hinged where it is. */
  pivot(name: string, at?: At): Sculpt;
  /** Declare a grindable line, in the prop's own frame. */
  grind(line: GrindLine): void;
  /** Merge, name, shadow, and hand back the root. */
  done(): THREE.Group;
}

const DEFAULT_UV = 2.2;

/**
 * The transform, baked into the vertices.
 *
 * The order is **YXZ**, which is to say the part is leaned (`rz`), then tipped
 * (`rx`), and finally turned (`ry`) about the prop's own upright. That is the
 * order these objects are actually built in on a street: a signal visor is a
 * tube tipped forward and then the whole head is turned to face the traffic; a
 * bollard leans where it was hit and then stands at whatever angle it was set.
 * The default XYZ order turns a part about its own already-tipped axis, which
 * for a tube of revolution does nothing at all — the yaw silently vanishes.
 */
function place(geo: THREE.BufferGeometry, at: At | undefined): THREE.BufferGeometry {
  if (!at) return geo;
  const m = new THREE.Matrix4();
  m.makeRotationFromEuler(new THREE.Euler(at.rx ?? 0, at.ry ?? 0, at.rz ?? 0, "YXZ"));
  m.setPosition(at.x ?? 0, at.y ?? 0, at.z ?? 0);
  geo.applyMatrix4(m);
  return geo;
}

/**
 * Box projection off the vertex's own normal — the cheap standby, and the right
 * one here: every prop in this library is hard-surface, so every face is close
 * enough to axis-aligned that the seams land on real edges.
 */
function boxUv(geo: THREE.BufferGeometry, perMetre: number): void {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u * perMetre;
    uv[i * 2 + 1] = v * perMetre;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/**
 * The paint, as a vertex attribute — see `mats.ts`. Every geometry gets one,
 * including the printed ones (white): the batches are merged, and
 * `mergeGeometries` refuses a set whose attributes do not match.
 */
function tint(geo: THREE.BufferGeometry, hex: number): void {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

interface Batch {
  geos: THREE.BufferGeometry[];
  parts: string[];
}

interface Node {
  group: THREE.Group;
  batches: Map<THREE.Material, Batch>;
  kids: Node[];
}

function makeNode(name: string, at?: At): Node {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(at?.x ?? 0, at?.y ?? 0, at?.z ?? 0);
  // The SAME order `place()` bakes into a static part — see there for why. A
  // hinge group whose Euler order disagreed with the one every part around it
  // was built with would swing about a subtly different axis, and a wheelie bin
  // whose lid opens 3° out of plane is a bug nobody can find by reading.
  group.rotation.order = "YXZ";
  group.rotation.set(at?.rx ?? 0, at?.ry ?? 0, at?.rz ?? 0);
  return { group, batches: new Map(), kids: [] };
}

function flush(node: Node): void {
  for (const [mat, batch] of node.batches) {
    // Indexed and non-indexed geometries cannot be merged together, and the
    // primitives disagree — PolyhedronGeometry (the canopy blobs) is
    // non-indexed while every other built-in is indexed. Normalising to
    // non-indexed costs vertices, never triangles, and at 100–300 triangles a
    // prop that is a few kilobytes.
    const geos = batch.geos.map((g) => {
      if (!g.index) return g;
      const flat = g.toNonIndexed();
      g.dispose();
      return flat;
    });
    const merged =
      geos.length === 1 ? geos[0] : (mergeGeometries(geos) as THREE.BufferGeometry | null);
    if (!merged) {
      // Never silently drop geometry: an unmergeable batch still has to appear,
      // as its own meshes, at the cost of the draw calls the merge would have
      // saved. Named so a scene dump says which batch fell back.
      for (const g of geos) {
        node.group.add(shadowed(new THREE.Mesh(g, mat), `${node.group.name}:${mat.name}-unmerged`));
      }
      continue;
    }
    if (geos.length > 1) for (const g of geos) g.dispose();
    const mesh = shadowed(new THREE.Mesh(merged, mat), `${node.group.name}:${mat.name || "mat"}`);
    mesh.userData.parts = batch.parts;
    node.group.add(mesh);
  }
  node.batches.clear();
  for (const kid of node.kids) flush(kid);
}

function shadowed(mesh: THREE.Mesh, name: string): THREE.Mesh {
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function sculpt(name: string): Sculpt {
  const root = makeNode(name);
  const lines: GrindLine[] = [];

  const face = (node: Node): Sculpt => ({
    part(part, geo, mat, hex, at, uv = DEFAULT_UV) {
      place(geo, at);
      if (uv !== "keep") boxUv(geo, uv);
      tint(geo, hex);
      let batch = node.batches.get(mat);
      if (!batch) {
        batch = { geos: [], parts: [] };
        node.batches.set(mat, batch);
      }
      batch.geos.push(geo);
      batch.parts.push(part);
    },
    pivot(pivotName, at) {
      const kid = makeNode(pivotName, at);
      node.kids.push(kid);
      node.group.add(kid.group);
      return face(kid);
    },
    grind(line) {
      lines.push(line);
    },
    done() {
      flush(root);
      root.group.userData.grindLines = lines;
      return root.group;
    },
  });

  return face(root);
}

// ---------------------------------------------------------------------------
// the primitives, named for what they are on a street
// ---------------------------------------------------------------------------

/** A box. `w` runs x, `h` runs y, `d` runs z — a prop faces +Z. */
export const slab = (w: number, h: number, d: number): THREE.BoxGeometry =>
  new THREE.BoxGeometry(w, h, d);

/** A post, a bar, a pipe. Open-ended where the ends are buried or capped. */
export const pipe = (r: number, h: number, seg = 8, open = true): THREE.CylinderGeometry =>
  new THREE.CylinderGeometry(r, r, h, seg, 1, open);

/** How far apart two points are — the length a spanned part has to be built. */
export const span = (a: Vec3, b: Vec3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

/**
 * Stand a Y-axis part on the line from `a` to `b`. The geometry must already be
 * `span(a, b)` long and centred on the origin — a tapered trunk, a braced arm.
 *
 * Orienting one of these with Euler angles is how a mast arm gets its droop the
 * wrong way round and how a leaning trunk digs its own base into the pavement;
 * two endpoints cannot be misread. Same trick `props.ts` uses to lay the
 * plaza's own rails on their lines.
 */
export function spanned(geo: THREE.BufferGeometry, a: Vec3, b: Vec3): THREE.BufferGeometry {
  const from = new THREE.Vector3(a[0], a[1], a[2]);
  const to = new THREE.Vector3(b[0], b[1], b[2]);
  const dir = to.clone().sub(from).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  m.setPosition(from.add(to).multiplyScalar(0.5));
  geo.applyMatrix4(m);
  return geo;
}

/** A round bar between two points — a mast arm, a brace, a hoop leg, a chain. */
export const bar = (r: number, a: Vec3, b: Vec3, seg = 8): THREE.BufferGeometry =>
  spanned(new THREE.CylinderGeometry(r, r, span(a, b), seg, 1, true), a, b);

/** A tint, darker or lighter — an inside face, a second lobe of a canopy. */
export function shade(hex: number, k: number): number {
  const ch = (shift: number): number =>
    Math.min(255, Math.round(((hex >> shift) & 255) * k)) << shift;
  return ch(16) | ch(8) | ch(0);
}

/** A taper — a bin body, a bollard sleeve, a trunk. */
export const cone = (rTop: number, rBase: number, h: number, seg = 8, open = false): THREE.CylinderGeometry =>
  new THREE.CylinderGeometry(rTop, rBase, h, seg, 1, open);

/**
 * A box that tapers to its base — a wheelie bin, a planter, a meter head, a
 * litter bin. Built as a four-sided cylinder turned an eighth of a turn, which
 * is the cheapest way to get a tapered rectangular prism in three.js and costs
 * four triangles more than a `BoxGeometry`. `taper` is the base's share of the
 * top: 1 is a plain box, 0.8 is a bin.
 *
 * `open` drops both caps, and it is not a micro-optimisation — it is the
 * difference between a container and a block. The crates shipped once as a
 * capped taper with a dark panel drawn down inside them: the cap sealed the
 * mouth, the panel could never be reached by a single ray from above, and a
 * stack of open-lattice crates rendered as solid tubs with lids on. Anything
 * you are meant to see INTO is built from open bands and gets its inside from a
 * separate part, never from a cap you then try to draw over.
 */
export function taperBox(w: number, d: number, h: number, taper = 0.85, open = false): THREE.BufferGeometry {
  const rTop = 0.5 / Math.SQRT1_2;
  const geo = new THREE.CylinderGeometry(rTop, rTop * taper, h, 4, 1, open);
  geo.rotateY(Math.PI / 4);
  geo.scale(w, 1, d);
  return geo;
}

/** A domed cap. Two rings is plenty at 1 m; the silhouette is the whole job. */
export const dome = (r: number, seg = 10): THREE.SphereGeometry =>
  new THREE.SphereGeometry(r, seg, 2, 0, Math.PI * 2, 0, Math.PI / 2);

/**
 * A flat face with `seg` sides — and the reason the signs in here are cheap.
 * 8 is a stop sign's octagon, 4 turned an eighth of a turn is a warning
 * diamond, 3 is a yield, 24 is a disc. Eight triangles for a legible sign.
 */
export const disc = (r: number, seg = 16): THREE.CircleGeometry =>
  new THREE.CircleGeometry(r, seg);

/** A flat ring — a grille bezel, a base collar, a flange. */
export const ring = (r0: number, r1: number, seg = 12): THREE.RingGeometry =>
  new THREE.RingGeometry(r0, r1, seg);

/** A printed panel, a poster, a sign blade. */
export const panel = (w: number, h: number): THREE.PlaneGeometry =>
  new THREE.PlaneGeometry(w, h);

/** A hoop — a bike-rack bend, a tree guard, a chain swag. */
export const bend = (r: number, tube: number, arc: number, seg = 8, side = 5): THREE.TorusGeometry =>
  new THREE.TorusGeometry(r, tube, side, seg, arc);

/**
 * An ORGANIC mass — foliage, a heap. Twenty triangles, and none of them show.
 *
 * A bare `IcosahedronGeometry(r, 0)` is not one, and the reason is a three.js
 * detail worth stating because it cost this library a whole round.
 * `PolyhedronGeometry` treats `detail === 0` as the flat branch and calls
 * `computeVertexNormals()` on a non-indexed hull, so the mass ships as twenty
 * HARD facets. On a 2.3 m canopy under a 15°-elevation key that is twenty flat
 * tones with straight edges between them: sunward facets near-white, the ones
 * beside them near-black, and a silhouette that is a clean polygon whichever
 * way you walk round it. A critic reading these at chase distance called the
 * result faceted rock and the planter's shrub two ochre boulders, and both were
 * fair — nothing else in the frame bands like that, because nothing else in the
 * frame is flat-shaded.
 *
 * So a mass is a hull with two things done to it, neither of which costs a
 * triangle:
 *
 * - **the twelve corners are pulled in and out**, keyed off each corner's own
 *   position so that all five copies of it in a non-indexed hull take the same
 *   pull and the surface stays closed. That is what breaks the straight-line
 *   silhouette — an outline foliage lives or dies on.
 * - **the normals are re-derived radially** off the squashed ellipsoid, so the
 *   thing shades as a round mass rather than as a cut gem. Leaves have no
 *   facets; a canopy lit as though it had is the loudest possible statement
 *   that it is a solid.
 *
 * `rough` is the fraction of the radius a corner may move — 0.2 is a canopy
 * lobe, and past about 0.3 the hull starts folding through itself.
 */
export function mass(rad: number, squashY: number, rough: number, r: Rand): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(rad, 0);
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const pulls = new Map<string, number>();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
    let pull = pulls.get(key);
    if (pull === undefined) {
      pull = 1 + r.about(0, rough);
      pulls.set(key, pull);
    }
    pos.setXYZ(i, v.x * pull, v.y * squashY * pull, v.z * pull);
  }
  // The ellipsoid normal, not the facet's: (x, y/s², z) normalised. The pulls
  // make it an approximation, and a smooth approximation on a lumpy mass is
  // exactly what low-poly foliage has always been shaded with.
  const inv = 1 / (squashY * squashY);
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i) * inv, pos.getZ(i)).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  return geo;
}

/** Squash a mass along its axes without touching the caller's placement. */
export function squash(geo: THREE.BufferGeometry, sx: number, sy: number, sz: number): THREE.BufferGeometry {
  geo.scale(sx, sy, sz);
  return geo;
}
