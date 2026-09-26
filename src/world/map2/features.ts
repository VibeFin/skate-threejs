// WHAT IS BUILT IN THE CHANNEL — the obstacle vocabulary, in flume space.
//
// `channel.ts` is the ground. This is everything standing on it, and the two
// halves of the map are deliberately different kinds of thing: the ground is a
// field with no seams, the obstacles are discrete boxes with edges you grind.
//
// Every feature is declared in the CHANNEL'S OWN FRAME — `s` down the flume and
// `u` across it, never world x — so the meander carries the whole level with it
// and a block cannot drift off the concrete it was cast on. The world is one
// subtraction away (`u = x − centreX(z)`), which is the whole reason the section
// is measured perpendicular to z; see the note at the top of `channel.ts`.
//
// A feature's top is measured ABOVE THE FLOOR DATUM, not above the surface it
// sits on. That is the difference between a concrete block cast in a sloping
// channel — level across, following the grade down — and a block that has been
// bent to match the drainage dish it happens to be standing in. The skirts
// still drop to the real surface, so nothing floats.
//
// TWO RULES CARRIED STRAIGHT OVER FROM MAP 1, because they are the ride's and
// not the map's:
//
// · **`STEP_FLOOR`.** The ride resolves what it can reach with `yHint = y+0.15`
//   and refuses to walk into anything over `y+0.30`. A flat top between those
//   two is resolved by neither and the board rides straight THROUGH it — map
//   1's manual pad shipped at 0.28 and did exactly that. Every flat top here
//   clears 0.34.
//
// · **`CORNER_HOLD`.** `lipDecision` rides any convex break whose chord turns
//   under 0.35 rad over the board's own half-metre bridge, and throws the board
//   off anything sharper, at any speed. That single number is what splits this
//   vocabulary in two: `bank` and `roller` are eased at both ends and are
//   ALWAYS ridden, `wedge` and `spine` end on a real edge and ALWAYS fly you.
//   There is no third category and no speed at which one becomes the other,
//   which is what makes an obstacle at 20 m/s something a player can aim at.
//
// AND ONE RULE THIS MAP ADDS, which map 1 never needed because a plaza is not
// crossed at 24 m/s: **nothing here presents a square face to a carving rider.**
// A carve in this ride is a heading change that does not come back, so every
// obstacle is met from the side by somebody who cannot help it. `wedge` tapers
// to nothing at both ends of its own footprint; `pad` and `bank` take a
// `Chamfer` down the side the channel is on. What is left square is the handful
// of things that are meant to be walls and stand over head height where you can
// see them: the bridge piers, the intake, the trash rack.

import * as THREE from "three";
import type { SurfaceKind } from "../surface";
import { centreX, centreSlope, channelGradient, channelY, floorGrade, floorY } from "./channel";

/** The materials map 2 draws with. `surface.ts` never reads this. */
export type Map2Look =
  /** The channel itself: floor, transitions, walls, walkways. */
  | "flume"
  /** Everything skated: blocks, ledges, kickers, pads. Power-trowelled and waxed. */
  | "pad"
  /** Galvanised bar and posts. */
  | "steel"
  /** The bridge deck. */
  | "road"
  /** Old brick — the headworks and the outfall structures. */
  | "brick"
  /** The hillsides. */
  | "hill"
  /** Chain link. */
  | "fence";

export interface Buffers {
  pos: number[];
  nor: number[];
  uv: number[];
}

export function buffers(): Buffers {
  return { pos: [], nor: [], uv: [] };
}

export interface Feature {
  id: string;
  /** Footprint in the channel's frame: `s` down it, `u` across it. */
  s0: number;
  s1: number;
  u0: number;
  u1: number;
  /**
   * What the top is measured from. `floor` is the channel's centreline datum —
   * a thing cast on the floor. `surface` is whatever concrete is actually at
   * that point, which is what a fence post or a bin standing on the walkway
   * needs.
   */
  base: "floor" | "surface";
  look: Map2Look;
  surface: SurfaceKind;
  /**
   * Does `yHint` cap this?
   *
   * True for anything that is a STACKED FLOOR — a block, a ledge, a wall — so
   * the board can roll past its base on one run and along its top on the next.
   * False for anything reached from its own toe: a kicker rejected by its own
   * hint half way up is a ramp that hands back the floor underneath it, which
   * is a launch off a surface the ride is standing on. Map 1 keys this off the
   * profile's shape; naming it directly is the same rule with the reason in it.
   */
  capped: boolean;
  /** Height above the base at (a, b), both running 0→1 across the footprint. */
  h(a: number, b: number): number;
  /** ∂h/∂a and ∂h/∂b, per unit of a and b — analytic, never a difference. */
  ha(a: number, b: number): number;
  hb(a: number, b: number): number;
  /** Mesh resolution. Curved tops ask for more. */
  rows: number;
  cols: number;
  /** World-space footprint bound — the cheap reject every query starts on. */
  aabb: { x0: number; x1: number; z0: number; z1: number };
}

interface Box {
  s0: number;
  s1: number;
  u0: number;
  u1: number;
}

interface Common {
  look?: Map2Look;
  surface?: SurfaceKind;
  base?: "floor" | "surface";
  rows?: number;
  cols?: number;
}

/**
 * How far a `pad`'s two long sides are chamfered off, in metres: `[u0, u1]`.
 *
 * The other half of the square-face rule, and the more expensive half, because
 * it is not about crashing at all — it is about `WALL_RUB`. The ride charges a
 * face it is leaning on 3 m/s² for as long as the lean lasts, and a carve is a
 * heading change that does not come back, so a rider who meets the side of an
 * eighteen-metre ledge stays against it for eighteen metres. Measured on this
 * map with the banks already fixed: one 0.35 s press at 15 m/s put the board
 * against the centre island's east face and the ledge took it from 54 km/h to
 * 21 without ever hitting anything harder than a scuff. The bank had given
 * everything back and a kerb spent it.
 *
 * So a long ledge in the channel has a ramp down its side instead of a wall, at
 * `height/chamfer`. That slope is deliberately allowed OVER `CORNER_HOLD` — a
 * 0.6 m ledge chamfered at 1.2 m is 0.5, which turns 0.46 rad and pops you as
 * you cross it. Riding onto a ledge sideways and getting a little air out of it
 * is a thing to do; leaning on it for eighteen metres is not. What the chamfer
 * removes is the arris, so anything with one carries its grind line at the top
 * of the ramp (`RAILS`) rather than at the pad's declared edge.
 *
 * Short faces keep their corners. Nothing under about six metres is worth the
 * width it costs — the rub over a 5 m block at 14 m/s is 1.1 m/s, which is what
 * clipping a kerb should feel like.
 */
type Chamfer = readonly [number, number];

/**
 * A feature's world AABB.
 *
 * The footprint is a rectangle in the channel's frame, and the channel bends,
 * so in world x it is a rectangle SHEARED by however far the centreline moves
 * over the feature's own length. Sampled rather than solved: sixteen points
 * across a footprint that is never longer than 30 m, against a centreline whose
 * slope is bounded at 0.23, bounds the truth to under a centimetre — and the
 * box is padded by that centimetre so the reject can only ever be generous.
 */
function boundsOf(box: Box): { x0: number; x1: number; z0: number; z1: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= 16; i++) {
    const c = centreX(box.s0 + ((box.s1 - box.s0) * i) / 16);
    lo = Math.min(lo, c);
    hi = Math.max(hi, c);
  }
  return { x0: lo + box.u0 - 0.02, x1: hi + box.u1 + 0.02, z0: box.s0, z1: box.s1 };
}

function feature(
  id: string,
  box: Box,
  capped: boolean,
  h: (a: number, b: number) => number,
  ha: (a: number, b: number) => number,
  hb: (a: number, b: number) => number,
  c: Common,
): Feature {
  return {
    id,
    s0: box.s0,
    s1: box.s1,
    u0: box.u0,
    u1: box.u1,
    base: c.base ?? "floor",
    look: c.look ?? "pad",
    surface: c.surface ?? "concrete",
    capped,
    h,
    ha,
    hb,
    rows: c.rows ?? 6,
    cols: c.cols ?? 2,
    aabb: boundsOf(box),
  };
}

const zero = (): number => 0;

// ---------------------------------------------------------------------------
// the vocabulary
// ---------------------------------------------------------------------------

/**
 * The chamfer, as a pair of functions of `b`: the scale to multiply a height by,
 * and its own slope. Shared by everything in the channel that has sides, so
 * "this shape has no wall on it" is one implementation and not four.
 *
 * `edge` is 0 at a chamfered edge and 1 across the middle, in the footprint's
 * own 0→1 coordinate — which is the frame `hb` is expected in, so a caller just
 * multiplies. A zero chamfer answers 1 everywhere, which is a square face, and
 * `Infinity` is how that is said without a branch inside the hot loop.
 */
function chamferOf(
  box: Box,
  chamfer: Chamfer | undefined,
): { edge: (b: number) => number; slope: (b: number) => number } {
  const span = box.u1 - box.u0;
  const c0 = (chamfer?.[0] ?? 0) / span;
  const c1 = (chamfer?.[1] ?? 0) / span;
  return {
    edge: (b) => Math.min(1, c0 > 0 ? b / c0 : Infinity, c1 > 0 ? (1 - b) / c1 : Infinity),
    slope: (b) => (c0 > 0 && b < c0 ? 1 / c0 : c1 > 0 && b > 1 - c1 ? -1 / c1 : 0),
  };
}

/**
 * A flat-topped block: a ledge, a manual pad, a plinth. `y1` slopes the top
 * down the channel — that is a hubba, and it is still a stacked floor, so it is
 * still capped. `chamfer` ramps its two long sides — see `Chamfer`.
 */
export function pad(
  id: string,
  box: Box,
  y0: number,
  y1 = y0,
  c: Common & { chamfer?: Chamfer } = {},
): Feature {
  const d = y1 - y0;
  const { edge, slope } = chamferOf(box, c.chamfer);
  return feature(
    id,
    box,
    true,
    (a, b) => (y0 + d * a) * edge(b),
    (_a, b) => d * edge(b),
    (a, b) => (y0 + d * a) * slope(b),
    c,
  );
}

/** 6t⁵−15t⁴+10t³ and its slope — zero gradient AND curvature at both ends. */
function smoother(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function smootherSlope(t: number): number {
  return 30 * t * t * (t - 1) * (t - 1);
}

/**
 * A ramp eased at BOTH ends — a roll-on bank, the way onto a pad, the shoulder
 * of a hip. Never launches anybody at any speed: the crest's chord turns
 * `1.5·H/L` over the board's bridge, which for everything in this map is under
 * a tenth of `CORNER_HOLD`.
 *
 * It takes the same `chamfer` its pad does, and it needs it for the same
 * reason: the top of a lead-in ramp is exactly as tall as the ledge it leads
 * onto, so an unchamfered one is a wall standing in the channel with a ramp
 * behind it. Measured before this argument existed — a 0.6 m bank's own side at
 * u = 4.6 took an 83 km/h run to a dead stop in one frame, `into` 21.6, and the
 * board never moved again: both axes were blocked at once, which is the one
 * case `settleWall` pins at zero rather than scrubbing.
 */
export function bank(
  id: string,
  box: Box,
  height: number,
  up = true,
  c: Common & { chamfer?: Chamfer } = {},
): Feature {
  const { edge, slope } = chamferOf(box, c.chamfer);
  return feature(
    id,
    box,
    false,
    (a, b) => height * smoother(up ? a : 1 - a) * edge(b),
    (a, b) => height * smootherSlope(up ? a : 1 - a) * (up ? 1 : -1) * edge(b),
    (a, b) => height * smoother(up ? a : 1 - a) * slope(b),
    { rows: 10, ...c },
  );
}

/**
 * A WEDGE — the map's one launcher, and the only thing in the channel that is
 * meant to put a board in the air.
 *
 * `H·a²` up the ramp, and not `H·a`: a straight wedge meets the floor at its
 * full angle, so a board arriving at 20 m/s takes the whole break in one frame
 * and the deck snaps; a square law starts flat and reaches its steepest AT the
 * lip, which is both what a plywood launch ramp is shaped like and what makes
 * the lip angle — `2H/L` — the only number that decides where you go.
 *
 * **`lipDeg` is measured against the HORIZON, not against the floor**, and that
 * is the whole reason this signature takes an angle rather than a height. A
 * feature's top is cast off the floor DATUM, and this map's floor is falling at
 * 0.14 to 0.26 — so a ramp whose own rise is `2H/L` leaves the board on a
 * tangent of `2H/L − |floorGrade|`, and the difference is not a rounding. The
 * first cut of this map wrote 0.9 m over 5 m and called it "a 20° lip"; over a
 * floor falling at 0.227 it is 10°, and measured on the real ride at 77 km/h it
 * gave **0.21 m of rise**. The map's biggest launcher was a bump. Ask for the
 * angle you want and let `kickerHeight` find the ramp:
 *
 *   `H = L·(tan(lipDeg) + |floorGrade|) / 2`
 *
 * …and **the ends taper into the floor**, which is the shape rule the whole map
 * is now written to. `advance` slides a board along whatever it is up against
 * and charges it `1 − along²` of its speed, so a 2 m ramp with vertical sides
 * standing where riders arrive at 24 m/s is a pair of 2 m walls — over
 * `WALL_HEAD`, so a square hit past `WALL_SLAM` is not a stop, it is a ragdoll.
 * Measured on the first cut of this map, one 0.3 s press of the carve key at
 * eight stations put six of them into a wall. A wedge has no face on it
 * anywhere: come at it square and it launches you, clip a shoulder mid-carve
 * and it throws you sideways, cross it at the very edge and you ride over it.
 *
 * The shoulders are STRAIGHT rather than eased, deliberately. An eased shoulder
 * needs 5.5·H of run to keep its own crest under `CORNER_HOLD` and this channel
 * does not have 11 m to give one; a straight shoulder at `H/flare` over 0.36 is
 * a hip, it says so by looking like one, and being thrown off a hip you carved
 * across is the thing to aim at rather than the thing to survive.
 */
export function wedge(
  id: string,
  box: Box,
  lipDeg: number,
  flare: number,
  c: Common = {},
): Feature {
  const height = kickerHeight(box, lipDeg);
  // Floored rather than allowed to reach zero: `flare = 0` would be a plain
  // kicker with two vertical ends, which is the shape this function exists to
  // make unspellable.
  const run = Math.max(0.02, flare);
  const { edge, slope } = chamferOf(box, [run, run]);
  return feature(
    id,
    box,
    false,
    (a, b) => height * a * a * edge(b),
    (a, b) => 2 * height * a * edge(b),
    (a, b) => height * a * a * slope(b),
    { rows: 8, cols: 10, ...c },
  );
}

/** The rise a wedge needs for `lipDeg` above the horizon at its own station. */
export function kickerHeight(box: Box, lipDeg: number): number {
  const len = box.s1 - box.s0;
  return (len * (Math.tan((lipDeg * Math.PI) / 180) + Math.abs(floorGrade(box.s1)))) / 2;
}

/**
 * A ROLLER: eased up, eased down. It is not a jump and it is not meant to be.
 *
 * `lipDecision` returns on any crest whose chord turns under `CORNER_HOLD`, at
 * every speed — so a roller compresses, gives the legs something to do and lets
 * a rider pump, and never once puts the board in the air by surprise. A
 * spillway is full of these: sediment bars, check dams, the ridge over a buried
 * pipe. They are the map's texture, and the map's AIR is on the kickers.
 */
export function roller(
  id: string,
  box: Box,
  height: number,
  c: Common & { chamfer?: Chamfer } = {},
): Feature {
  const { edge, slope } = chamferOf(box, c.chamfer);
  return feature(
    id,
    box,
    false,
    (a, b) => height * Math.sin(Math.PI * a) ** 2 * edge(b),
    (a, b) => height * Math.PI * Math.sin(2 * Math.PI * a) * edge(b),
    (a, b) => height * Math.sin(Math.PI * a) ** 2 * slope(b),
    // The one shape here that stands on the SURFACE rather than being cast off
    // the floor datum, and it is the difference between a sill and a wall. A
    // sill runs the whole width of the channel and dies into both banks, so it
    // has to follow the drainage dish and the trickle groove or its own toe is
    // a step where the floor is lowest. Everything else in this vocabulary is a
    // block cast on the floor and is level across itself, which is what a block
    // is and what a manual needs.
    { rows: 12, base: "surface", ...c },
  );
}

/**
 * A SPINE: two banks meeting on a coping, across the channel.
 *
 * Triangular on purpose. A rounded ridge is a roller and gets ridden; the whole
 * point of a spine is that the crest is an EDGE, so it throws you off the
 * tangent you climbed it on — `1.6 m over 5 m` each side is 33°, and 15 m/s at
 * the top of it is 1.7 m of air and 10 m of distance.
 */
export function spine(id: string, box: Box, height: number, c: Common = {}): Feature {
  return feature(
    id,
    box,
    false,
    (a) => height * (1 - Math.abs(2 * a - 1)),
    (a) => (a < 0.5 ? 2 : -2) * height,
    zero,
    { rows: 4, ...c },
  );
}

/**
 * Something tall standing on whatever is under it — a bridge pier, a fence, a
 * headwall, the end of the world. `blocked()` is one rule for everything here,
 * exactly as it is in map 1: the top is above the board's probe, so you stop.
 */
export function block(id: string, box: Box, height: number, c: Common = {}): Feature {
  return feature(id, box, true, () => height, zero, zero, { base: "surface", ...c });
}

// ---------------------------------------------------------------------------
// the query
// ---------------------------------------------------------------------------

/** Where a feature's base is, and how it is tilted. */
function baseOf(f: Feature, x: number, z: number, out: { y: number; gx: number; gz: number }): void {
  if (f.base === "floor") {
    out.y = floorY(z);
    out.gx = 0;
    out.gz = floorGrade(z);
    return;
  }
  out.y = channelY(x, z);
  channelGradient(x, z, _grad);
  out.gx = _grad.gx;
  out.gz = _grad.gz;
}

const _grad = { gx: 0, gz: 0 };
const _base = { y: 0, gx: 0, gz: 0 };

/** Where in this feature's own footprint a world point falls, or null if outside. */
function localOf(f: Feature, x: number, z: number): { a: number; b: number } | null {
  if (z < f.s0 - SEAM || z > f.s1 + SEAM) return null;
  const u = x - centreX(z);
  if (u < f.u0 - SEAM || u > f.u1 + SEAM) return null;
  return {
    a: clamp01((z - f.s0) / (f.s1 - f.s0)),
    b: clamp01((u - f.u0) / (f.u1 - f.u0)),
  };
}

/**
 * How far outside its own footprint a feature still answers.
 *
 * The same micron map 1's `SEAM` is, and for the same reason: two things
 * declared to meet on a line have a query that lands one float outside both of
 * them, and what answers then is whatever is underneath. Four orders under
 * anything the ride or the eye can resolve.
 */
const SEAM = 1e-6;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Top of this feature at a world point, or null if the point is off it. */
export function topOfFeature(f: Feature, x: number, z: number): number | null {
  const l = localOf(f, x, z);
  if (!l) return null;
  baseOf(f, x, z, _base);
  return _base.y + f.h(l.a, l.b);
}

/** …and the surface normal on its top there. */
export function normalOfFeature(f: Feature, x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const l = localOf(f, x, z);
  if (!l) return out.set(0, 1, 0);
  baseOf(f, x, z, _base);
  // a runs with z and b runs with u, and u itself moves with z through the
  // meander — so the z gradient picks up the cross term the same way the
  // channel's own does.
  const dhds = f.ha(l.a, l.b) / (f.s1 - f.s0);
  const dhdu = f.hb(l.a, l.b) / (f.u1 - f.u0);
  const gx = _base.gx + dhdu;
  const gz = _base.gz + dhds - dhdu * centreSlope(z);
  return out.set(-gx, 1, -gz).normalize();
}

// ---------------------------------------------------------------------------
// the mesh — the same functions, walked instead of sampled
// ---------------------------------------------------------------------------

const _p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _n = new THREE.Vector3();

/** a→b→c→d, wound so the given normal is the front face. Shared with `mesh.ts`. */
export function quad(
  m: Buffers,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  n: THREE.Vector3,
  uv: readonly number[],
): void {
  const order = [a, b, c, a, c, d];
  const uvOrder = [0, 1, 2, 3, 4, 5, 0, 1, 4, 5, 6, 7];
  for (let i = 0; i < 6; i++) {
    m.pos.push(order[i].x, order[i].y, order[i].z);
    m.nor.push(n.x, n.y, n.z);
  }
  for (let i = 0; i < 6; i++) m.uv.push(uv[uvOrder[i * 2]], uv[uvOrder[i * 2 + 1]]);
}

/**
 * World metres per texture tile, per look. Never hand-picked per mesh — and
 * sized against what the generated image ALREADY contains rather than against
 * what looks busy at one distance.
 *
 * The spillway basecolor is a four-by-four grid of form-work bays, so at 12 m a
 * bay is 3 m, which is a real one and puts a horizontal joint at about the
 * height a rider's eye passes it. The skatepark basecolor is a four-by-four
 * grid of trowelled panels, so at 4 m a panel is a metre. Getting these two
 * from the image instead of from a slider is what stops the two concretes
 * reading as the same grey at two different scales.
 */
export const TILE: Record<Map2Look, number> = {
  flume: 12,
  pad: 4,
  steel: 2,
  road: 6,
  brick: 5,
  // Ten-odd rocks to the tile, so 5 m puts a shale flake at about 40 cm.
  hill: 5,
  // Six diamonds to the tile — 9 cm links, which is what chain link measures.
  fence: 0.55,
};

/**
 * Emit one feature: the top, walked on the same grid the query is evaluated on,
 * and four skirts dropped to the concrete it stands on. Every vertex comes out
 * of `h()` — the function `topOfFeature` reads — which is the whole discipline
 * this map and map 1 share.
 */
export function meshFeature(f: Feature, m: Buffers): void {
  const tile = TILE[f.look];
  const at = (a: number, b: number, out: THREE.Vector3): THREE.Vector3 => {
    const z = f.s0 + (f.s1 - f.s0) * a;
    const u = f.u0 + (f.u1 - f.u0) * b;
    const x = centreX(z) + u;
    baseOf(f, x, z, _base);
    return out.set(x, _base.y + f.h(a, b), z);
  };
  const sLen = f.s1 - f.s0;
  const uLen = f.u1 - f.u0;

  for (let i = 0; i < f.rows; i++) {
    const a0 = i / f.rows;
    const a1 = (i + 1) / f.rows;
    for (let k = 0; k < f.cols; k++) {
      const b0 = k / f.cols;
      const b1 = (k + 1) / f.cols;
      at(a0, b0, _p[0]);
      at(a1, b0, _p[1]);
      at(a1, b1, _p[2]);
      at(a0, b1, _p[3]);
      normalOfFeature(f, (_p[0].x + _p[2].x) / 2, (_p[0].z + _p[2].z) / 2, _n);
      const s0 = (f.s0 + sLen * a0) / tile;
      const s1 = (f.s0 + sLen * a1) / tile;
      const t0 = (f.u0 + uLen * b0) / tile;
      const t1 = (f.u0 + uLen * b1) / tile;
      quad(m, _p[0], _p[1], _p[2], _p[3], _n, [t0, s0, t0, s1, t1, s1, t1, s0]);
    }
  }

  // The skirts. They drop to the CHANNEL — never to the floor datum — so a
  // block standing where the floor dishes up has no gap under its downhill
  // corner and no wedge of concrete buried under its uphill one.
  const skirt = (
    a0: number,
    b0: number,
    a1: number,
    b1: number,
    n: THREE.Vector3,
    steps: number,
  ): void => {
    for (let i = 0; i < steps; i++) {
      const ta = i / steps;
      const tb = (i + 1) / steps;
      at(a0 + (a1 - a0) * ta, b0 + (b1 - b0) * ta, _p[0]);
      at(a0 + (a1 - a0) * tb, b0 + (b1 - b0) * tb, _p[1]);
      _p[2].set(_p[1].x, channelY(_p[1].x, _p[1].z) - 0.06, _p[1].z);
      _p[3].set(_p[0].x, channelY(_p[0].x, _p[0].z) - 0.06, _p[0].z);
      const run = (Math.hypot(_p[1].x - _p[0].x, _p[1].z - _p[0].z) * i) / tile;
      const runNext = run + Math.hypot(_p[1].x - _p[0].x, _p[1].z - _p[0].z) / tile;
      quad(m, _p[0], _p[1], _p[2], _p[3], n, [
        run,
        _p[0].y / tile,
        runNext,
        _p[1].y / tile,
        runNext,
        _p[2].y / tile,
        run,
        _p[3].y / tile,
      ]);
    }
  };
  // Wound so each face looks outward. The channel's +u is world +x wherever the
  // meander is flat and within 13° of it wherever it is not, which is inside
  // what a normal has to be right about for a face this size.
  skirt(0, 1, 1, 1, _nx.set(1, 0, 0), f.rows);
  skirt(1, 0, 0, 0, _nx2.set(-1, 0, 0), f.rows);
  skirt(0, 0, 0, 1, _nz.set(0, 0, -1), f.cols);
  skirt(1, 1, 1, 0, _nz2.set(0, 0, 1), f.cols);
}

const _nx = new THREE.Vector3();
const _nx2 = new THREE.Vector3();
const _nz = new THREE.Vector3();
const _nz2 = new THREE.Vector3();
