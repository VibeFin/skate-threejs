// The street spot — one description, read twice.
//
// terrain.ts made the field's mesh and the field's physics read the same sine
// function, and that is the only reason the board never floated over the grass.
// A plaza is not a sine function, so the same discipline needs a different
// shape: every piece of this place is a SOLID — a yawed rectangle with a top
// profile (flat, ramp, stairs, or a quarter-pipe arc). `topOf()` answers the
// height query; `meshSolid()` walks the SAME profile to emit triangles. Neither
// knows a number the other does not.
//
// Two consequences worth stating, because they are what makes the ride work:
//
// · Solids OVERLAP freely. The ledge sits on the plaza, the platform sits on
//   the plaza, the stairs sit against the platform. `height()` takes the
//   highest top at or below the board's `yHint`, so a ledge is genuinely two
//   surfaces at one (x, z) — roll past its base on one run, roll along its top
//   on the next. Nothing is cut out of anything.
//
// · `blocked()` is one rule for everything: the highest top here is above the
//   board's probe. A 0.18 m kerb passes (you hop it), a 0.45 m ledge stops you
//   (you ollie it), a bank passes at its toe and stops you at its side, a wall
//   always stops you. There is no separate wall list and no per-solid flag to
//   get out of step with the geometry.
//
// · …which is also why the STREET FURNITURE is here and not only in props.ts.
//   A dumpster you ride through is broken, and it was: `PLACEMENTS` drew
//   thirty-five props and fed the query none of them. The placements now live
//   in this file, next to the architecture, and each kind says whether it is
//   matter or scenery. One list, read twice — the same discipline the mesh and
//   the height query already run on.

import * as THREE from "three";
import type { GrindLine, SurfaceKind, SurfaceProvider, SurfaceSample } from "./surface";
import { makeSample } from "./surface";
// `/index` spelled out, not the bare directory: the headless harnesses resolve
// TypeScript through `tools/ts-resolve.mjs`, which is a thin extension-adding
// hook over node's own resolver and has no idea that a folder can mean its
// index. A bare `./procedural` compiles, bundles, and takes every check in
// `tools/` down with ERR_UNSUPPORTED_DIR_IMPORT.
import { STREET_PROPS, type StreetPropId } from "./procedural/index";

/**
 * Which material a solid is drawn with. The query never reads this.
 *
 * FOUR ground materials, not one, and that is the fix for the complaint this
 * spot has carried since round 3: measured off the opening frame, 82% of the
 * floor was ONE tiled image. A real block is never one pour — the carriageway
 * is asphalt, the footway is small scored panels, the plaza is big poured
 * slabs, and anything you actually skate is power-trowelled and glassy. Those
 * are four different surfaces in life and they are four here, so the break
 * between them falls where a real kerb line falls instead of nowhere.
 */
export type LookKey =
  /** The plaza's own slabs — big poured bays with expansion joints. */
  | "concrete"
  /** The footway: small scored panels, gum, a different pour entirely. */
  | "sidewalk"
  | "asphalt"
  /**
   * Power-trowelled skatepark concrete — every transition, bank and deck.
   *
   * The ramps had no material of their own at all: the quarter pipe took the
   * plaza's slab texture (a bay grid wrapped round a 65° curve) and the deck
   * behind it took plywood, so the marquee obstacle read as a tan shape with a
   * floor pattern on it and a wooden shelf behind. A transition is troweled
   * smooth and waxed at the lip, which is a surface, and it is this one.
   */
  | "park"
  /** Precast blocks — ledges, hubbas, anything with a waxed arris. */
  | "ledge"
  /** The warm block — south and west. */
  | "brick"
  /** …and the bleached, painted one opposite it, so the plaza has sides. */
  | "brick2"
  | "metal"
  | "fence";

/**
 * The top of a solid, as a function of how far along its local +z you are.
 * `ramp`, `stairs` and `arc` all run from the -z edge to the +z edge, so a
 * descending set is just `y0 > y1` — there is no direction flag to get wrong.
 */
export type Profile =
  | { shape: "flat"; y: number }
  | { shape: "ramp"; y0: number; y1: number }
  | { shape: "stairs"; y0: number; y1: number; steps: number }
  /**
   * Quarter pipe: a circular transition rising from flat at -z to `height`.
   *
   * …and, with `panel`, A BOX RAMP'S FACE: one flat inclined plane whose top
   * curls up to the lip. It is the SAME circle — a plane at grade g is the
   * circle's own tangent where the arc reaches g — so this shape is "the arc,
   * with everything below the tangent point replaced by the straight line that
   * touches it there". The panel is one segment with ONE normal, which is the
   * whole point of it; see `BACK_FACE_ANGLE`.
   *
   * One profile and not two solids, and that is deliberate: a seam in the middle
   * of a ride face is a seam the height query, the mesh, the wear layer and the
   * ride's own lip test all have to agree about at the steepest place on the
   * ramp, and `props.ts` anchors a transition's wax band to the ends of ONE arc
   * solid (see its `oriented`) — a face chopped into a chain would draw that band
   * once per piece.
   */
  | {
      shape: "arc";
      radius: number;
      height: number;
      /**
       * The flat panel under the kick: its grade, and how much of `height` it
       * climbs. Absent on a pure quarter-pipe arc, where the tangent point is
       * the toe and the whole face is curve.
       */
      panel?: { grade: number; rise: number };
      /**
       * …and how much of `height` the STRAIGHT LIP above the curl climbs — the
       * couple of inches of vert a real transition has under its coping.
       *
       * It is not decoration and it is not for the eye: the ride reads the
       * tangent it launches on `LIP_EDGE` = 1 cm back along the surface, and on a
       * tight curl a centimetre is degrees. See `BACK_VERT` for the measurement
       * and for what it was worth.
       */
      vert?: number;
    }
  /**
   * A ramp that also falls ACROSS itself — the driveway apron, and the only
   * shape in this file whose top depends on where you are along its width.
   *
   * Three rounds went into the aprons and every one of them MOVED the upstand
   * rather than removing it, because the step at an apron's long side is not a
   * placement mistake: it is the apron's own depth at that z, and a solid whose
   * top is a function of v alone cannot be any other height there. Measured on
   * the last version: 0.317 m proud at z = -4.4 and 0.348 m at z = -4.2, over
   * the ride's 0.30 m probe, so a board crossing the pavement fell into the
   * apron and was stopped by the far side of it.
   *
   * `flare` is how far in from each long side the fall is eased back to zero,
   * so the apron meets the pavement at pavement level along its whole length
   * and the only thing left at the sides is a cross-slope you ride over. That
   * is also what a real dropped kerb is: flush in the middle, splayed at the
   * ends. The gutter is untouched — the splay lives on the footway side of the
   * kerb line, which is where the apron's footprint already was.
   */
  | { shape: "apron"; y0: number; y1: number; flare: number };

/** How much of an apron's fall applies at `u` — 1 in the middle, 0 at the sides. */
function flareAt(p: { flare: number }, u: number, hx: number): number {
  return Math.min(1, Math.max(0, (hx - Math.abs(u)) / p.flare));
}

/**
 * An apron's top, eased back toward its PAVEMENT end at the sides. Which end
 * that is falls out of the numbers rather than out of a flag: an apron is
 * always a cut down out of the footway, so the pavement is whichever end is
 * higher.
 *
 * That freedom is real and it is also how the north three shipped BACKWARDS
 * for a round. `t` runs from a solid's -z edge to its +z edge, so on the south
 * footway t = 0 is the pavement and t = 1 is the kerb, and on the north footway
 * it is the other way round — the declaration has to say which end is which,
 * and all six said `y0: 0, y1: -ROAD_DROP`. Measured across the mouth of each
 * one: the south three were flush over 3.35–5.35 m of their width and the north
 * three stood **0.372–0.380 m proud over every centimetre of theirs**, so all
 * three northbound crossings were kerbs with a ramp drawn on the wrong side of
 * them. They are declared from the kerb UP now, and the mouths measure the same.
 */
function apronY(p: { y0: number; y1: number; flare: number }, t: number, u: number, hx: number): number {
  const high = Math.max(p.y0, p.y1);
  const fall = -Math.abs(p.y1 - p.y0) * (p.y1 < p.y0 ? t : 1 - t);
  return high + fall * flareAt(p, u, hx);
}

export interface Solid {
  id: string;
  /** Footprint centre and half-extents in the solid's own frame. */
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  /** Rotation about +Y, radians. */
  yaw: number;
  profile: Profile;
  surface: SurfaceKind;
  look: LookKey;
  /** Where the side skirts run down to — the thing it is standing on. */
  base: number;
  /** Cached for the footprint reject: world-space AABB of the footprint. */
  readonly aabb: { x0: number; x1: number; z0: number; z1: number };
}

// ---------------------------------------------------------------------------
// the profile, evaluated
// ---------------------------------------------------------------------------

/**
 * Height of a profile at `t`, the 0→1 run from the solid's -z edge to its +z.
 * `u` and `hx` are only read by the cross-falling apron; every other shape is a
 * function of `t` alone and ignores them.
 */
function profileY(p: Profile, t: number, u = 0, hx = 1): number {
  switch (p.shape) {
    case "flat":
      return p.y;
    case "ramp":
      return p.y0 + (p.y1 - p.y0) * t;
    case "apron":
      return apronY(p, t, u, hx);
    case "stairs":
      // A stair set RIDES on its nosings, and this is the one place in the file
      // where the query and the mesh are deliberately not the same surface.
      //
      // Stepping the query the way the mesh is stepped makes a stair set a
      // catapult. A 0.192 m riser crossed in one frame is 11.5 m/s of vertical
      // and the launch test — which cannot tell a riser from a lip — fired:
      // measured, riding UP the 6-stair at 14 m/s put the skater 2.86 m in the
      // air and 26 m down the plaza. Raising the risers past the wall probe
      // would fix it and would also mean a three-step set with 0.38 m treads,
      // which is not a stair set.
      //
      // The nosings are the truth anyway: a board bridges them, it does not
      // drop into every tread, and the plane through them is exactly this
      // ramp — nosing i sits at y0 + (y1-y0)·(i+1)/steps, which is on the line.
      // The cost is bounded and known: the board floats at most one riser over
      // the BACK of a tread and is flush at every nosing. `tools/spot-map.html`
      // measures that gap against the riser height rather than expecting zero.
      return p.y0 + (p.y1 - p.y0) * t;
    case "arc": {
      const d = t * arcRun(p);
      if (p.panel) {
        const k = kickOf(p.radius, p.height, p.panel, p.vert);
        // Under the tangent point the face IS the tangent — a plane, and the
        // reason this shape exists. Read `BACK_FACE_ANGLE`.
        if (d <= k.run) return d * p.panel.grade;
        // …then the curl, and then the straight lip under the coping.
        if (d <= k.curl) {
          const a = d - k.cv;
          return k.cy - Math.sqrt(Math.max(0, p.radius * p.radius - a * a));
        }
        // …read off the top of the curl rather than back off `height`, so the two
        // pieces meet at the circle's own last point to the last bit.
        return k.cy - p.radius * k.cosLip + (d - k.curl) * k.lipGrade;
      }
      return p.radius - Math.sqrt(Math.max(0, p.radius * p.radius - d * d));
    }
  }
}

/**
 * A kicked bank, solved: where its flat panel ends, where the centre of its curl
 * sits and where that curl gives way to the straight lip — all in the solid's own
 * (v, y) plane with the toe at (0, 0).
 *
 * The circle is tangent to the panel at the panel's own top, so its centre is
 * `radius` off that point along the panel's normal — which is what makes the two
 * pieces one surface rather than two that meet at a crease. Everything else about
 * the shape falls out of it: the lip angle is where the arc has climbed the rest
 * of `height` (`cos θ_lip = cos θ_panel − curl/radius`, with `vert` held back for
 * the straight bit above it), and it is derived for exactly the reason every
 * other number in this file is — a typed lip angle and a typed panel could
 * disagree by a degree and nothing would say so.
 */
function kickOf(
  radius: number,
  height: number,
  panel: { grade: number; rise: number },
  vert = 0,
): {
  run: number;
  curl: number;
  cv: number;
  cy: number;
  cosIn: number;
  sinIn: number;
  cosLip: number;
  sinLip: number;
  lipGrade: number;
  vertRun: number;
} {
  const cosIn = 1 / Math.hypot(1, panel.grade);
  const sinIn = panel.grade * cosIn;
  const run = panel.rise / panel.grade;
  const cosLip = cosIn - (height - panel.rise - vert) / radius;
  const sinLip = Math.sqrt(Math.max(0, 1 - cosLip * cosLip));
  return {
    run,
    curl: run + radius * (sinLip - sinIn),
    cv: run - radius * sinIn,
    cy: panel.rise + radius * cosIn,
    cosIn,
    sinIn,
    cosLip,
    sinLip,
    lipGrade: sinLip / cosLip,
    vertRun: (vert * cosLip) / sinLip,
  };
}

/**
 * Horizontal run of a transition — the depth its footprint must have.
 *
 * A kicked bank's is its panel, its curl and the sliver its straight lip spends.
 * The pure arc's line below IS this with the panel absent (cos θ_panel = 1 puts
 * the tangent point at the toe, and `cosLip` is then the same `1 − height/radius`);
 * it is kept as its own line rather than folded in because `qp` and both alley
 * transitions are shapes the player has ridden and signed off, and the two forms
 * agree only to the last bit of a double.
 */
export function arcRun(p: {
  radius: number;
  height: number;
  panel?: { grade: number; rise: number };
  vert?: number;
}): number {
  if (p.panel) {
    const k = kickOf(p.radius, p.height, p.panel, p.vert);
    return k.curl + k.vertRun;
  }
  const theta = Math.acos(Math.max(-1, 1 - p.height / p.radius));
  return p.radius * Math.sin(theta);
}

/**
 * Slope of the top along local +z at `t`, as dy/dv. Analytic, never a finite
 * difference: on an 80° transition a difference over any usable lookahead
 * straddles the lip and reads it as a gentle ramp.
 */
function profileGrade(p: Profile, t: number, hz: number, u = 0, hx = 1): number {
  switch (p.shape) {
    case "flat":
      return 0;
    case "apron":
      return ((p.y1 - p.y0) * flareAt(p, u, hx)) / (2 * hz);
    // Stairs ride their nosing plane (see `profileY`), so their grade is a
    // ramp's — which is also what lays the deck down the set instead of
    // holding it flat while the floor drops away underneath it.
    case "stairs":
    case "ramp":
      return (p.y1 - p.y0) / (2 * hz);
    case "arc": {
      const d = t * arcRun(p);
      if (p.panel) {
        const k = kickOf(p.radius, p.height, p.panel, p.vert);
        // ONE grade over the whole panel — the flat tone the player asked for and
        // the flat NORMAL the shading needs, both out of this line.
        if (d <= k.run) return p.panel.grade;
        // …and ONE grade over the straight lip, which is the whole point of it:
        // whatever centimetre of it the ride reads its launch tangent off, the
        // answer is the same. See `BACK_VERT`.
        if (d > k.curl) return k.lipGrade;
        const a = d - k.cv;
        const kr2 = p.radius * p.radius - a * a;
        return kr2 <= 1e-6 ? 40 : a / Math.sqrt(kr2);
      }
      const r2 = p.radius * p.radius - d * d;
      return r2 <= 1e-6 ? 40 : d / Math.sqrt(r2);
    }
  }
}

// ---------------------------------------------------------------------------
// solid ↔ world
// ---------------------------------------------------------------------------

/** World (x, z) → the solid's local (u, v). Inverse of a yaw about +Y. */
function toLocal(s: Solid, x: number, z: number, out: { u: number; v: number }): void {
  const dx = x - s.cx;
  const dz = z - s.cz;
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  out.u = c * dx - sn * dz;
  out.v = sn * dx + c * dz;
}

/**
 * Slope of the top ACROSS the solid, as dy/du. Zero for everything but the
 * apron — and the reason `normalOf` had to grow a second component: a surface
 * that falls sideways and hands back a normal that does not is a surface the
 * ride lays the deck flat on while the wheels roll down it.
 */
function profileCross(p: Profile, t: number, u: number, hx: number): number {
  if (p.shape !== "apron") return 0;
  const inset = hx - Math.abs(u);
  if (inset >= p.flare || inset <= 0) return 0;
  // Ground climbs back toward the pavement as |u| grows, so the sign follows u.
  return (Math.sign(u) * Math.abs(p.y1 - p.y0) * (p.y1 < p.y0 ? t : 1 - t)) / p.flare;
}

const _local = { u: 0, v: 0 };

/**
 * How far outside its own footprint a solid still answers, metres.
 *
 * Two slabs that share an edge — a footway strip and the driveway apron cut out
 * of it — are declared with the SAME number on both sides of the seam, and a
 * query that lands one float outside it belongs to neither. What answers then
 * is whatever is under both, which on the kerb line is the road: measured by
 * sweeping the apron footprints at 5 cm, a stride that happened to land on
 * x = DRIVE_W[0] read the floor 0.380 m lower than the pavement either side of
 * it. A micron of overlap closes every seam in the file at once, and it is four
 * orders of magnitude under anything the ride or the eye can resolve.
 */
const SEAM = 1e-6;

/** Top of this solid at a world point, or null if the point is off it. */
export function topOf(s: Solid, x: number, z: number): number | null {
  if (x < s.aabb.x0 - SEAM || x > s.aabb.x1 + SEAM) return null;
  if (z < s.aabb.z0 - SEAM || z > s.aabb.z1 + SEAM) return null;
  toLocal(s, x, z, _local);
  if (Math.abs(_local.u) > s.hx + SEAM || Math.abs(_local.v) > s.hz + SEAM) return null;
  const t = THREE.MathUtils.clamp((_local.v + s.hz) / (2 * s.hz), 0, 1);
  return profileY(s.profile, t, _local.u, s.hx);
}

/**
 * Surface normal on this solid's top at a world point. Exported next to
 * `topOf` and for the same reason: the harness has to be able to ask a solid
 * what it claims, without going through the stacking the provider does.
 */
export function normalOf(s: Solid, x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  toLocal(s, x, z, _local);
  const t = (_local.v + s.hz) / (2 * s.hz);
  const g = profileGrade(s.profile, t, s.hz, _local.u, s.hx);
  const gu = profileCross(s.profile, t, _local.u, s.hx);
  // Local normal (-gu, 1, -g), turned into the world by the solid's own yaw —
  // `place()` sends a local (au, ay, av) to (c·au + sn·av, ay, -sn·au + c·av).
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  return out.set(-gu * c - g * sn, 1, gu * sn - g * c).normalize();
}

function makeSolid(
  id: string,
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  yaw: number,
  profile: Profile,
  surface: SurfaceKind,
  look: LookKey,
  base: number,
): Solid {
  // The yawed footprint's world AABB — the cheap reject every query starts on.
  const c = Math.abs(Math.cos(yaw));
  const sn = Math.abs(Math.sin(yaw));
  const ex = hx * c + hz * sn;
  const ez = hx * sn + hz * c;
  return {
    id,
    cx,
    cz,
    hx,
    hz,
    yaw,
    profile,
    surface,
    look,
    base,
    aabb: { x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez },
  };
}

/** An axis-aligned piece, given by the corners it spans. */
function slab(
  id: string,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  profile: Profile,
  surface: SurfaceKind,
  look: LookKey,
  base: number,
): Solid {
  return makeSolid(
    id,
    (x0 + x1) / 2,
    (z0 + z1) / 2,
    (x1 - x0) / 2,
    (z1 - z0) / 2,
    0,
    profile,
    surface,
    look,
    base,
  );
}

/**
 * A ramp whose fall line runs along world +x rather than +z.
 *
 * `Profile` only knows how to run from a solid's -z edge to its +z edge, which
 * is right for stairs and banks that face down the plaza and useless for the
 * three things that make this spot connect sideways: the crossing table's
 * approaches, the terrace's access ramps and the quarter pipe's roll-offs. A
 * yaw of +π/2 turns the solid's local +v onto world +x, so `y0` is still the
 * low-x end and nothing has to be reversed by hand.
 */
function rampAlongX(
  id: string,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  surface: SurfaceKind,
  look: LookKey,
  base: number,
): Solid {
  return makeSolid(
    id,
    (x0 + x1) / 2,
    (z0 + z1) / 2,
    (z1 - z0) / 2,
    (x1 - x0) / 2,
    Math.PI / 2,
    { shape: "ramp", y0, y1 },
    surface,
    look,
    base,
  );
}

/**
 * A rise whose CREST is eased — one bump, emitted as `n` ramps following a
 * parabola that is steepest at the toe and flat where it meets the top.
 *
 * A single-slope bump is a KICKER at line speed, and that is not a tuning
 * opinion, it is the ride's own force balance: it lets go of a crest when
 * v² > g·R, and a corner's radius here is `LIP_PIVOT / turn` — so a 9.5° break
 * is a 3 m radius and lets go at 7 m/s. The manual pad shipped with exactly
 * that bump and the main line arrives at 16.5, so the board left the ground at
 * z = 7 and came down at z = 13.4, having flown the whole pad. Measured before:
 * 26 frames of air at every approach speed from 8 to 18 and the wheels never
 * once on the pad the bump exists to put them on.
 *
 * y = y0 + rise·(1 − (1−t)²) turns at a constant rate, so every junction breaks
 * by the same `2·rise/(n·run)` — at n = 6 over the pad's 0.40 m in 5.2 m that
 * is 1.5°, a 19 m radius, and the wheels stay down past 18 m/s. `down` mirrors
 * it for the far side, where the flat part is the end you arrive from.
 */
function easedRise(
  id: string,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  n: number,
  surface: SurfaceKind,
  look: LookKey,
  base: number,
  down = false,
): Solid[] {
  const out: Solid[] = [];
  // Flat end at t = 1 climbing, at t = 0 falling: 1−(1−t)² either way round.
  const at = (t: number): number => y0 + (y1 - y0) * (down ? t * t : 1 - (1 - t) * (1 - t));
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const b = (i + 1) / n;
    out.push(
      slab(
        `${id}-${i}`,
        x0,
        x1,
        z0 + (z1 - z0) * a,
        z0 + (z1 - z0) * b,
        { shape: "ramp", y0: at(a), y1: at(b) },
        surface,
        look,
        base,
      ),
    );
  }
  return out;
}

/**
 * A transition, placed by its TOE — the depth follows from radius and height.
 *
 * `panel` makes it a BOX-RAMP FACE instead of a full curve: the flat inclined
 * plane and how much of the height it climbs, with the rest curled up to the lip
 * on `radius` and `vert` of straight lip above that. The depth still follows,
 * because `arcRun` reads the same profile the query and the mesh do.
 */
function quarterPipe(
  id: string,
  x0: number,
  x1: number,
  zToe: number,
  radius: number,
  height: number,
  surface: SurfaceKind,
  look: LookKey,
  base: number,
  panel?: { grade: number; rise: number },
  vert?: number,
): Solid {
  const profile = { shape: "arc" as const, radius, height, panel, vert };
  return slab(id, x0, x1, zToe, zToe + arcRun(profile), profile, surface, look, base);
}

// ---------------------------------------------------------------------------
// THE SPOT
// ---------------------------------------------------------------------------
//
//                                Z+ (north)
//   -38   -34.4                    0                     +32.4  +36
//    ┌───────────────── BRICK BLOCK (graffiti) ──────────────────┐  z=+48
//    │▔▔▔ BACK DECK — LEVEL at 3.4 m, 3.4 m deep, coping to wall ▔▔ │ z=+44.6
//    │ ═══ COPING, steel, full width ═══════════════════════════════ │ z=+44.6
//    │ ╱╱╱ BACK RAMP — flat 40° panel, 3.4 m, 88° kicked lip ╱╱╱╱╱╱╱ │  z=+41.3
//    │            RUN-OUT — open plaza                            │
//    │        ╲╲╲ LANDING BANK, 2.82 → 0 over 10 m ╱╱╱      ▁FUN▁ │  z=+30
//    │  ╱roll╱▛▀▀ QP DECK ▀▀▜╲roll╲                        ╱ BOX ╲│  z=+25
//    │        ╰─ quarter pipe, 2.6 m, 65° lip, faces south ─╯     │  z=+21
//  W │  ▟ LOADING DOCK ▙                                    ┊    │
//  E │f▐  1.1 m, ledge ▌   ═ FLAT BAR ═   ▄ 3-STAIR ▄      ┊F   f│  z=+18
//  S │o▐               ▌   ║  0.35 m  ║   █ BLOCK PAD █    ┊E   o│
//  T │o╲ bank up ╱      ▐LEDGE▌ ▁MANNY▁ ╱ █  0.55 m  █    ┊N   o│  z=+8
//    │t                      ╱eased bump╱   ╲ bank up ╱     ┊C   t│
//    │═══╱drive╱═════ ASPHALT ROAD, sunken 0.38 ═╱drive╱════┊E   ═│  z=0
//    │w       ╱ raised crossing table, ramped both ends ╱         w│
//    │a ▄▄▄▄ 6-STAIR ▄▄▄▄  ║hubba║   ╱ BANK ╱                    a│  z=-11
//    │y╱█████████ RAISED PLATFORM 1.15 m ██████████╲             y│  z=-14
//    └───────────────── BRICK BLOCK (graffiti) ──────────────────┘  z=-34
//
// The two ribbons marked `footway` are the 3.6 m strips against each side wall
// — a different pour from the plaza, in the sidewalk material, and where all
// the street clutter stands. See WALK_W / WALK_E.
//
// The main line reads bottom to top: drop in off the bank at (2, -12), cross
// the plaza, take the crossing flush, bump onto the manny pad at z=+7.8, hit
// the quarter pipe square at z=+17.5, and come down on the landing bank behind
// it with the speed to carve back into the plaza. Every other feature hangs off
// that spine within one carve of it.
//
// NAVIGATION IS A FEATURE, and it was the thing this spot did not have. The
// sunken road is what makes the kerbs real, and it also cut the plaza in half:
// 0 of 61 straight lanes rolled from the south side to the north one, because
// the road is a 0.38 m trench with a wall on its far side, and the crossing —
// the one flush route — was a slab standing 0.38 m proud of 88 m of asphalt, so
// the road itself could not be ridden either. The spot now carries the things a
// real street carries for exactly this reason: three CROSS-FALLING driveway
// aprons cut into the kerbs, a RAISED crossing table with a ramp at each end so
// the road runs through it, access ramps at both ends of the terrace, an eased
// bump onto the manny pad instead of a 0.40 m wall square across the main line,
// and a quarter pipe with a landing bank behind it instead of a shelf against
// brick. `tools/spot-map.html` sweeps lanes across the whole spot from six
// headings and reports what fraction get across.

/**
 * The plaza floor's extent — everything the wheels can reach.
 *
 * FOUR METRES WIDER EACH SIDE than it shipped: 66 m of block became 74. The
 * player asked for "a bit bigger" and meant it as the modest half of the ask,
 * so this is deliberately not a new wing — it is the width a real downtown
 * block has between its two building lines once the footways are honest. What
 * it BUYS is the thing the old width had no room for: a proper 3.6 m footway
 * against each side wall (see WALK_W / WALK_E) with the clutter a street keeps
 * on it, and enough open plaza east of the block pad to put a funbox on
 * without it fouling the line to the quarter pipe.
 */
export const SPOT_MIN_X = -38;
export const SPOT_MAX_X = 36;
export const SPOT_MIN_Z = -34;
/**
 * The north wall, and it has moved back twice for the same reason: an air is a
 * DISTANCE and the ramp that makes it needs that distance behind it.
 *
 * Round 3 moved it from 30 to 34 and the quarter pipe still dead-ended, because
 * the deck it bought was flat plywood at coping height and the ride came down
 * on it with nothing left. Round 5 moved it to 40 and gave the ramp a landing
 * bank, and the ramp started working — the air comes down rolling now. So the
 * dead end moved one object further along, which is where it had been hiding:
 * measured on the designed main line, throttle held, the landing handed the
 * board back at 10.6 m/s, the run-out spent 5 m of that, and the run ended
 * against the brick at **10.14 m/s of `into` — one tenth over `WALL_SLAM`**, a
 * ragdoll at the end of every clean lap.
 *
 * So the block is 8 m longer at the north end: the landing runs to 35.5, there
 * is flat past it, and the wall itself is banked. What the extra 8 m buys is the
 * RUN-OUT — nine metres of open plaza where a rider can carve out of the line
 * instead of being funnelled at the brick. It is not what stops him hitting it;
 * see `BACK_LIP_ANGLE` for that, and for why three rounds of buying more length
 * here never fixed anything.
 */
export const SPOT_MAX_Z = 48;

/**
 * How far the road sits below the pavement. Has to clear the ride's own wall
 * probe (0.3 m) or the kerb becomes a launch ramp — see the road slab below.
 */
export const ROAD_DROP = 0.38;

/**
 * The smallest step a FLAT top may stand above whatever is under it.
 *
 * The ride resolves the surface it can reach with `yHint = y + 0.15` and
 * refuses to walk into anything taller than `y + 0.30`. A flat top between
 * those two is resolved by neither: `height()` will not hand it back and
 * `blocked()` will not stop you, so the board rides straight through it. The
 * manual pad shipped at 0.28 and did exactly that.
 *
 * So every flat top here stands clear of the upper bound, and there is no
 * middle ground to design into by accident. Ramps, stairs and transitions are
 * exempt by construction — they are reached from their toe, where the step is
 * zero, and `resolve()` never caps them. `tools/spot-map.html` sweeps all of
 * SOLIDS against this and names anything that drifts back into the band.
 */
export const STEP_FLOOR = 0.34;

/** Exported: the harness places an approach off the toe, not off a guess. */
export const QP_TOE_Z = 17.5;
/** Exported: the coping steel is drawn off the lip, not off a typed-in height. */
export const QP_HEIGHT = 2.6;
/**
 * THE LIP IS A BANKED TRANSITION, NOT VERT — 65°, and it is the director's
 * ruling after five rounds of this ramp being broken in five different ways.
 *
 * Round 4 shipped radius 3.2 over height 2.6, which tops out at 79.19°: an air
 * off that lip keeps cos(79.19°) = 0.187 of its speed pointing out over the
 * deck, so every launch flew a flat ballistic arc across the platform and cased
 * it. Round 5 answered with a TRUE quarter circle — radius = height, vertical
 * at the coping — and that is correct for a real vert ramp and wrong for this
 * engine: the surface query hands back the highest surface at (x, z) and the
 * deck sits at coping height, so "come back down INTO the transition" is not a
 * sentence this world can say. Measured on it, throttle held, 8 → 20 m/s: the
 * launch angle was 88–89°, the air went straight up and came straight down, and
 * the board arrived on the apron with **0.00 m/s** every single time.
 *
 * A bank in the 55–65° band is the THPS quarter, and it is the whole fix at
 * once: cos 65° = 0.42 of the lip speed stays HORIZONTAL, so the air goes up
 * and forward, clears the coping, and comes down on the landing bank behind it
 * with speed still on the board. 65 and not 55 because the range of a launch is
 * v²·sin(2θ)/g — the shallower the lip the FURTHER the air travels, and the far
 * end of this one is a brick wall. 65° gives the tallest air that still fits.
 *
 *   cos θ = 1 − H/R, so R = H / (1 − cos 65°) = 2.6 / 0.5774.
 */
const QP_LIP_ANGLE = (65 * Math.PI) / 180;
const QP_RADIUS = QP_HEIGHT / (1 - Math.cos(QP_LIP_ANGLE));
/** Where the coping sits — derived, so the rail can never drift off the lip. */
export const QP_LIP_Z = QP_TOE_Z + arcRun({ radius: QP_RADIUS, height: QP_HEIGHT });
/**
 * The apron behind the coping: the strip that falls TOWARD the ramp, so an air
 * that only just clears the lip comes down on ground tipping it back in and
 * rides the last of it down the transition rather than casing a flat edge.
 *
 * 0.22 m over 1.1 m is 11.3° — enough that gravity takes a stopped board back
 * down it (17 · sin 11.3° = 3.3 m/s²) and shallow enough that the deck behind
 * still reads as a deck rather than as a second ramp.
 */
const QP_APRON = 1.1;
/** Where the flat platform starts, measured off the lip it stands behind. */
export const QP_DECK_Z = QP_LIP_Z + QP_APRON;
/** …and how high it stands. Exported: the deck's own paint is laid off this. */
export const QP_DECK_Y = QP_HEIGHT + 0.22;
/** Where the flat deck ends and the landing starts. A deck is a place to stand. */
const QP_DECK_END = QP_DECK_Z + 2.8;
/**
 * THE LANDING, and it is the piece this ramp never had.
 *
 * Five rounds put a flat deck behind the coping and five rounds ended with the
 * air arriving on it at nothing, because a landing's whole arithmetic is the
 * angle between the flight path and the surface it meets: `along` is what the
 * wheels keep and `into` is what the legs eat, and a 60° descent onto a level
 * deck is almost all `into`. A bank sloping the SAME way you are falling turns
 * that round. Measured on the rebuilt ramp at a 16 m/s approach: coming down at
 * 13.6 m/s onto flat plywood keeps 5.5 m/s and takes a 4.6 m/s slam; onto this
 * bank it keeps 10.0 and takes 1.9. The landing gives the speed back instead of
 * taking it.
 *
 * 10 m, and the extra 2.5 over the first cut is not padding: at 7.5 the bank ran
 * out at z = 33 and the two fastest approaches flew straight over the end of it.
 * Measured, throttle held — a 16 m/s run came down at z = 32.99 and a 20 m/s one
 * at z = 34.42, both onto FLAT concrete, taking 7.6 and 8.4 m/s of slam and
 * riding away at 2.97 and 3.07. The bank they were supposed to land on stopped
 * a metre and a half short of them. At 10 m it reaches z = 35.5 and catches the
 * whole 8 → 20 band.
 *
 * The profile is steep at the deck end (29°) and flat where it meets the plaza,
 * which is the right way round for a LANDING and the wrong way round for a
 * roll-off — coming off the back of the deck at walking pace is a drop onto the
 * bank, not a stroll down it. That is what the back of a ramp is; the roll-offs
 * at the two ends are how you leave the deck on your wheels.
 */
const QP_LAND_END = QP_DECK_END + 10;

/**
 * THE BACK WALL'S BANK IS A TRANSITION, AND THE ANGLE IS THE WHOLE FIX.
 *
 * Three rounds of "the main line dead-ends in the north brick" were answered by
 * making the bank in front of it TALLER and the block LONGER, and three rounds
 * of it ended in the same ragdoll, because height was never what was wrong.
 * Measured on the shipped version: the rider comes off the landing, crosses the
 * run-out with the throttle still held — which is the one thing this level
 * teaches him to do — and arrives at 12.2 m/s against a bank sized to return
 * 8.2. He tops it and meets `WALL_SLAM` on the far side.
 *
 * The bank was 2.0 m over 14.5 m, which is 7.9°, and at 7.9° a rider who keeps
 * pushing does not slow down at all: a push is worth PUSH_IMPULSE/PUSH_INTERVAL
 * = 5.4 m/s² and gravity along a 7.9° slope is only 17·sin 7.9° = 2.3, so the
 * "run-out" was a ramp he ACCELERATED up. No height fixes that. Above 18.5° the
 * two cross and the slope wins, and an arc passes through that angle 20 cm off
 * its own toe and keeps steepening — which is why the answer here is a shape and
 * not a number.
 *
 * And the second half, which is what actually stops the ragdoll: a wall costs
 * you the component of your speed pointing INTO it, and a lip at angle θ leaves
 * only cos θ of the lip speed horizontal. At 70° that is 0.342 — so even the
 * game's terminal roll speed (`MAX_ROLL_SPEED` 26 m/s, which this run-out cannot
 * physically produce) arrives at the brick at 8.5 m/s, under the 10 that bails.
 * The rest went straight UP, and comes straight back down onto the transition
 * he left, which rolls him out pointing at the plaza. That is the line coming
 * back round, and it is what a bank-to-wall does in a real park.
 *
 * …AND 70° WAS STILL A RAMP AIMED AT A WALL, WHICH IS THE PLAYER'S THIRD REPORT
 * OF THIS AND THE FIRST ONE THAT NAMES THE FIX: *"if I go forward, the ramp
 * works in such a way that I just drive into the wall. We could even make the
 * ramp so that instead of going forward, I jump up and land back on it… make it
 * bigger and change the angle."*
 *
 * The paragraph above is arithmetic about the SPEED a wall is charged, and the
 * paragraph below is about the RELEASE, and both of them were right and neither
 * of them is what he was looking at. What he was looking at is a RANGE. A board
 * let go at the lip is a projectile, and a projectile launched at θ with the
 * speed the lip left it flies `v² · sin 2θ / g` before it comes back to the
 * height it started at. At 70°, sin 2θ is 0.643 — nearly the biggest it gets —
 * so the arc goes up AND ALONG, and along is a brick wall. Measured on the 70°
 * version, coasting at it and never touching Space:
 *
 *   approach   lip speed   exit    apex    came down at
 *      12 m/s      4.9      69.5°   2.87 m   z = 46.10 — on the apron, fine
 *      14          8.4      69.8°   4.04     z = 47.69 — 31 cm off the brick
 *      16         11.0      69.7°   5.42     THE WALL, 3.83 m/s into it at y = 5.30
 *      18         13.6      69.7°   7.01     THE WALL, 4.70 m/s at y = 6.82
 *      20         15.9      69.7°   8.81     THE WALL, 5.51 m/s at y = 7.66
 *
 * Every speed the main line actually arrives at flew the whole shelf and put
 * the deck on the bricks, four to eight metres up, and then slid down them. The
 * bank was not failing to release him; it was releasing him AT the wall.
 *
 * So: **86°, and 3.4 m of it.** Both numbers come straight out of that formula
 * and out of what the ride can physically do.
 *
 * · **the angle kills the range.** sin 2θ at 86° is 0.139 against 70°'s 0.643 —
 *   a fifth of the flight for the same lip speed. What is left goes into the
 *   vertical, which is what he asked for in the words "I jump up".
 * · **the height kills the lip speed.** Climbing costs `2gH` of energy whatever
 *   the shape, so a taller transition hands the projectile a smaller v² to
 *   multiply. 2.2 → 3.4 m takes 40 m²/s² out of the launch, and the range is
 *   linear in it. It is also the "bigger" he asked for, and it is a real park
 *   quarter now rather than a kerb with a curve on it.
 * · and together they land him on the ramp's own shelf at EVERY speed the ride
 *   can produce. Measured after (same run, same coast, no Space):
 *
 *   approach   lip speed   exit    apex    came down at        rides away
 *      14 m/s      5.0      85.8°   4.17 m   z = 44.82, +0.2 m   back down it
 *      16          8.8      85.8°   5.69     z = 45.27, +0.7 m   back down it
 *      18         11.7      85.8°   7.46     z = 45.78, +1.2 m   back down it
 *      20         14.3      85.8°   9.46     z = 46.35, +1.8 m   back down it
 *
 *   — no wall event at any speed, and 1.65 m of shelf still to spare at the top
 *   of the ride's own range. `tools/collide-sweep.mjs` asserts all four columns.
 *
 * WHY 86° WAS NOT THE VERTICAL LIP THE QUARTER PIPE'S OWN NOTE REJECTS — AND
 * WHY, AS OF ROUND EIGHT, IT IS EXACTLY THAT LIP AND THAT IS THE PLAYER'S CALL.
 *
 * The quarter pipe's ruling says "come back down INTO the transition" is not a
 * sentence this engine can say **when a DECK sits at coping height** — and it is
 * the deck that makes it unsayable, not the angle. That was the licence this
 * ramp rode on for two rounds: behind the lip stood a strip that CLIMBED (11.3°,
 * then 24.2°), never a deck, so the arc came down on ground already pointing him
 * at the transition and gravity rolled him down it.
 *
 * Round eight puts a level deck at coping height on purpose (read `BACK_DECK_Y`),
 * so that licence is spent and the quarter pipe's sentence now applies here word
 * for word: an arc off an 88° lip comes down on the deck with 0.00 m/s, and a
 * held throttle then walks him at the brick. **This is a known, measured cost of
 * the shape the player asked for, not an oversight** — his eighth report is about
 * the LOOK and it releases the ride explicitly: *"Forget that the character pops
 * off it; let's just make it a proper shape."* The whole trade, and the reason no
 * shape can have both, is written out in `BACK_DECK_Y`.
 *
 * The angle itself is untouched by that, and is still the number that keeps him
 * off the bricks: cos 88° = 0.035 of the lip speed is all that ever points north,
 * so what lands on the deck lands 1.1–1.2 m past the coping instead of six
 * metres up the wall. A shallower lip over a level deck is the round-five
 * catastrophe with a longer run at it.
 *
 * And the ride's own wall probe is not the constraint it was read as. It bounds
 * how much a GROUNDED step may climb — 0.3 m over a 0.05 m walk piece — and
 * `roll()` covers ground in `LIP_PROBE` pieces measured ALONG the surface, so a
 * piece climbs at most 0.12 m however steep the concrete is. Measured: the board
 * climbs all 3.4 m of an 86° transition at every rate from 30 to 144 fps.
 *
 * ROUND SIX: 86° → 88°, and it is the SHELF that asks for it, not the range.
 *
 * 86° was chosen against the brick and it still clears it. What it does not
 * leave is room for a TOP. The landing zone this paragraph is arguing about is
 * gone as of round eight (read `BACK_DECK_Y`), but the two degrees it bought are
 * still load-bearing and the reasoning is kept: the arc's own launch came down
 * as far as 2.30 m past the lip (measured, 8 → 20 m/s in 0.1 m/s steps, worst
 * at 17.4 m/s at 30 fps — the release point walks with the frame stride, so the
 * worst landing is not at the top of the range), and 2.30 m of a 3.4 m shelf
 * spent on landing zone leaves 1.1 m for everything else. The player's second
 * sentence is *"the top panel isn't flat"*, and 0.4 m of flat concrete at the
 * back of a shelf is not a deck, it is a gap.
 *
 * The range is `v²·sin 2θ/g` and what it is nearly linear in up here is cos θ:
 * cos 88° = 0.0349 against cos 86°'s 0.0698, so the whole flight goes out at
 * half the horizontal and comes down in half the distance. Measured after,
 * same sweep: the furthest touchdown is 1.25 m past the lip against 2.30. That
 * buys 1.2 m of the shelf back, and the shelf spends it on a deck you can stand
 * on — see `BACK_DECK_Y`.
 *
 * Two degrees, and what it costs is stated rather than found later:
 *
 * · **the arc gets 12.6 cm SHALLOWER in plan** — R = 3.4/(1−cos 88°) = 3.523
 *   against 3.656, so the run is 3.521 against 3.647 and the toe moves NORTH
 *   from z = 40.95 to 41.08. Everything the old footprint stood clear of it
 *   still stands clear of, with 12.6 cm more room, so nothing south of it moves.
 * · **the climb is unchanged.** `2gH` is 115.6 m²/s² whatever the shape, so the
 *   13 m/s it takes at the toe to reach the lip at all is the same number, and
 *   so is the fakie roll-back under it.
 * · **the air is 2° more vertical**, which is the direction the player asked in:
 *   *"launches upward and then falls back down"* is a description of vert, and
 *   what he objected to is the board going FORWARD. cos 88° leaves 3.5% of the
 *   lip speed pointing at the brick against 7.0%.
 *
 * ROUND SEVEN: 88° STAYS, AND IT IS NOW ONLY THE TOP 42 cm OF THE FACE.
 *
 * The player's seventh report is about the LOOK and not the launch: *"the far
 * away ramp along the wall, u see not a very strange surface, but kind of
 * uneven. Make a flat surface, like simple box ramps."* The face below the lip
 * is a flat panel now — see `BACK_FACE_ANGLE` — and this angle is untouched,
 * because everything above about the range is a statement about the tangent AT
 * THE LIP and nothing else. The lip is where it was, on `BACK_LIP_Z`, at the
 * same 3.4 m, on the same 88°.
 *
 * WHY THE KICK COULD NOT SIMPLY BE 80°, which is where the first cut of this
 * round started: the range is nearly linear in cos θ (see two paragraphs up),
 * and cos 80° is 0.174 against cos 88°'s 0.0349 — five times the horizontal. On
 * the same 3.4 m of climb that puts the furthest touchdown about 6 m past the
 * lip on a 3.4 m shelf, i.e. back on the bricks at six or seven metres up,
 * which is exactly the ragdoll rounds one to five were spent on. A shallower
 * kick only works on a TALLER ramp — to bring an 80° launch back inside the
 * shelf takes about 8 m of height, which is over the graffiti band and through
 * the string course. So the flat panel takes the bottom of the face and the
 * coping keeps the 88° it earned.
 */
const BACK_LIP_ANGLE = (88 * Math.PI) / 180;
/**
 * 3.4 m — the "bigger" half of the player's own instruction, and it is doing
 * real work rather than decoration: see above, the height is what takes the
 * energy out of the launch so the arc lands back on the ramp.
 *
 * What it costs is stated rather than discovered later: everything on the north
 * facade below 2.4 m is shopfront, so at 3.4 m the transition now stands in
 * front of the shutters instead of half of them. That paint is the paint you
 * saw coming down the main line, and it is the price of a quarter pipe you can
 * actually pop off. The graffiti above the shopfront line is untouched.
 *
 * It also sets the floor on the ride: `2gH` is 115.6 m²/s², so it takes about
 * 13 m/s at the toe to reach the lip at all. Under that you ride up it, run out
 * of climb, and come back down fakie — which is what a quarter pipe does to you
 * and is exactly what `fall()` already implements.
 */
const BACK_HEIGHT = 3.4;
/**
 * THE FACE IS ONE FLAT PANEL, AND 40° IS WHAT FITS THE FOOTPRINT IT ALREADY HAS.
 *
 * The player's seventh report on this ramp, and the first one about how it LOOKS
 * rather than where it throws him: *"the far away ramp along the wall, u see not
 * a very strange surface, but kind of uneven. **Make a flat surface, like simple
 * box ramps.**"* He is describing 20 flat facets. `meshSolid` takes ONE normal
 * per profile segment — `p0`'s — so the 20-chord polyline `topPolyline` walks a
 * transition with rendered as 20 constant-shaded strips across a face 74 m wide,
 * each 4.4° of normal off its neighbours and each 0.27 m of face tall. Measured
 * against this level's own sun (azimuth 1°, elevation 22° — see `field.ts`), the
 * brightness step from one band to the next runs 3.1% of the local N·L near the
 * toe, 8.4% through the middle of the face and 11.4% at 55°, which is a visible
 * stripe; the director's crop of a gameplay capture shows exactly that, faint
 * tonal bands parallel to the top edge at the chord spacing. A PLANE IS ONE FACET
 * however big it is, so the bands cannot be drawn on it — the fix removes the
 * cause instead of smoothing over it, and nothing about `meshSolid`'s flat
 * shading changes for the quarter pipe or the two alley transitions, which he has
 * ridden and not complained about. What is left is 9 chords in the top 1.09 m,
 * each 0.12 m of face, under a coping that now has steel on it.
 *
 * 40° comes out of three numbers that were already fixed, not out of taste:
 *
 * · **the footprint.** The toe may not go SOUTH of where it is (z = 41.08 —
 *   props stand off it, see the `pallets` note) and the lip may not leave
 *   `BACK_LIP_Z`, so the face has 3.52 m of run for 3.4 m of climb. The panel,
 *   the curl and the lip have to fit inside that: at 40° they come to 3.33 m and
 *   the toe ends up 19 cm NORTH of where it was, so everything that stood clear
 *   of the old footprint still does, with more room.
 * · **it has to be one whole `park` tile long.** Read `TILE`: 4.5 m per copy of
 *   the trowel image, and the note there is about THIS failure mode on THIS
 *   surface — a transition shorter than its own tile shows one cell of one image
 *   and reads as one smooth region of nothing. A flat panel is also one flat
 *   TONE, so it needs the joints more than the curve did: 40° gives 4.88 m of
 *   face (1.08 tiles) where 45° gives 4.47 (0.99) and would land just under.
 *   What else breaks the tone up is already drawn — `props.ts` lays the wax band
 *   in the top 14%, the dirt line in the bottom fifth and 90 vertical wash
 *   streaks down the whole face, and all of it is anchored in world space across
 *   the 74 m rather than per solid.
 * · **and it has to be a ramp you can ride at.** `blocked()` reads a grade over
 *   about 6 as a wall; 40° is 0.84. `stall()` needs over 18.5° for gravity to
 *   beat a held push and roll a stopped board back down instead of walking it
 *   into the brick (that arithmetic lives in `BACK_DECK_Y` now, which is the
 *   constant it rules on); 40° is 10.9 m/s² against 5.4.
 *   Shallower would be easier still and does not fit the footprint: at 38° the
 *   toe crosses z = 41.00 and goes south.
 */
const BACK_FACE_ANGLE = (40 * Math.PI) / 180;
/**
 * …and how much horizontal run the CURL at the top may spend. 0.42 m.
 *
 * THE FIRST DRAFT OF THIS NOTE HAD THE WRONG REASON IN IT, and `tools/back-face.mjs`
 * is the reason it is not still here: it said a hard 40°→88° crease would be a
 * WALL, because a roll step is `LIP_PROBE` = 0.12 m along the surface (9.2 cm of
 * ground ahead on the panel), `advance()` probes the whole step at the height it
 * STARTED, and anything standing over `WALL_PROBE` = 0.30 m is refused. The
 * arithmetic is right and it cannot happen HERE, because `height` is fixed at 3.4
 * and so is the lip: the curl's rise is 2.05× its run, so shrinking the run
 * shrinks the step in front of the board rather than growing it. Measured, kick
 * run 0.42 → 0.05: the worst step climb goes 0.265 m DOWN to 0.235 m. A crease is
 * not a wall on this ramp, and the sentence is kept rather than deleted because
 * the next person to reason about a steep face here will reach for it too.
 *
 * WHAT THE FILLET IS ACTUALLY FOR is the POP. `takeOff` splits the speed on the
 * tangent of whatever surface the board is on when the key comes up — `speed·cos θ`
 * horizontal — so on a crease every ollie taken anywhere on the panel launches at
 * 40°, keeping 77% of the speed pointed at the brick 3.4 m away. The fillet spends
 * the last 0.42 m of run turning 40° into 88° so that a pop taken near the lip is
 * taken STEEP: measured with `tools/back-air.mjs`, 77–85° through the whole
 * 10–20 m/s band. It is also what keeps the surface tangent-continuous, so the
 * deck lays onto it through `NORMAL_FOLLOW` with no crease to snap through and
 * `lipDecision` has one corner to read on this ramp instead of two.
 *
 * And the probe still bounds it, from the other end. Swept at 0.5 mm over the real
 * solids, square on and out to 52° off, the worst climb any single roll step can
 * be asked to swallow is **0.265 m of the 0.300 m budget**, at z = 44.58 where the
 * face is 80° and the step reaches 2.1 cm of ground ahead — against 0.167 m on the
 * pure 88° arc. The worst case is inside the curl, not at either junction, square
 * on rather than diagonal, and it is a geometric bound: the step is
 * `min(speed·left, LIP_PROBE)`, so no speed and no frame rate can make it longer.
 * The dial that moves it is `BACK_VERT`, not this one.
 *
 * What it costs is 0.86 m of the 3.4 m height: the panel climbs 2.44 m of it
 * (72%) and the curl and lip the rest. That is the trade the player is being
 * handed — three quarters of the face is one plane, the top quarter is the coping
 * that throws him — and it is why the kick's run is a named number rather than
 * whatever fell out.
 */
const BACK_KICK_RUN = 0.42;
/**
 * A HAND'S WIDTH OF VERT UNDER THE COPING — 0.1 m of straight 88° face above the
 * curl, and it is the piece that gives the launch back its precision.
 *
 * A real transition is built with an inch or two of vert under its coping. This
 * one needs 10 cm of it, and the reason is in `skate-model.ts` rather than in
 * anything a rider can see: `lipDecision` reads the tangent it launches on
 * `LIP_EDGE` = 1 cm back along the surface, and near vertical the surface's z
 * advances by only `radius·cos θ` per radian — so on the old 3.52 m arc that
 * centimetre cost 0.6° of read angle and on this 1.18 m curl it costs 1.9°. The
 * range is nearly linear in cos θ, so 2° of read error at the lip is most of a
 * metre of flight. Measured, 8 → 20 m/s in 0.1 steps at 30/60/144 fps with
 * `tools/back-ramp.mjs`, sweeping this constant and nothing else:
 *
 *     vert    released at    furthest the arc comes down    worst step climb
 *   (88° arc)  87.5–87.8°     1.25 m past the lip            0.167 m  ← ships today
 *     0.03 m   86.8–88.0°     1.71 m — onto the CREST        0.222
 *     0.05     87.5–88.0      1.25 m                         0.235
 *   **0.10**   **87.9–88.0**  **1.12 m**                     **0.265**
 *     0.15     87.9–88.0      1.13 m                         0.288
 *     0.20     87.9–88.0      1.12 m                         0.294 — 2% of probe
 *
 * Both ends of that table are a cliff and this is the knee between them.
 *
 * · **too little vert and the read falls off it** onto the curl, where a
 *   centimetre is degrees again. It cost range: 1.71 m past the lip against
 *   1.12, which under the shelf of the day was a landing past the sloped strip
 *   and onto the level top, where the touchdown arrives at 0.1 m/s — under
 *   `PUSH_ROLL_MIN`, where the held throttle stops following `sign(speed)` and
 *   follows his FACING, which is the brick. Round eight makes the whole top
 *   level on purpose (read `BACK_DECK_Y`), so that consequence is now the
 *   shape's rather than this constant's — but the READ is still the reason for
 *   the number, and it is unchanged: the read point, 1 cm plus the bisection's
 *   last 2 mm short of the break, has to land on the straight piece, worst case
 *   2.1 mm of RUN, which at 88° is 6 cm of face. A launch angle that walks with
 *   the frame rate is a launch angle that walks with the frame rate whatever is
 *   behind the coping.
 * · **too much and the vert is a step in front of the wall probe.** A board at
 *   80° on the curl reaches 2.1 cm of ground ahead, and everything the lip stands
 *   above him by is climb his step has to swallow inside `WALL_PROBE` = 0.30 m
 *   (read `BACK_KICK_RUN`). Each centimetre of vert is a centimetre of that
 *   budget, and 0.20 m leaves 2% — a ramp that stops you dead at the coping if
 *   anything else about the shape ever moves.
 *
 * 0.10 m sits 1.7× over the read cliff and 12% under the probe, and it buys a
 * launch angle that does not move with the frame rate at all: 87.9–88.0° against
 * the 87.5–87.8° the pure arc handed back.
 */
const BACK_VERT = 0.1;
/**
 * The curl's radius and the panel's rise, both derived — nothing about this
 * shape is typed twice. `kickOf` in the profile does the rest.
 */
const BACK_RADIUS = BACK_KICK_RUN / (Math.sin(BACK_LIP_ANGLE) - Math.sin(BACK_FACE_ANGLE));
const BACK_PANEL = {
  grade: Math.tan(BACK_FACE_ANGLE),
  rise:
    BACK_HEIGHT -
    BACK_VERT -
    BACK_RADIUS * (Math.cos(BACK_FACE_ANGLE) - Math.cos(BACK_LIP_ANGLE)),
};
/** Exported: the harness drives the ramp off its own numbers, never a guess. */
export const BACK_LIP_DEG = (BACK_LIP_ANGLE * 180) / Math.PI;

/**
 * A LIP NEEDS AIR BEHIND IT, AND THIS ONE HAD A BRICK WALL 0 mm BEHIND IT.
 *
 * The paragraph above is right about the arithmetic and the geometry never
 * delivered it. "Only cos θ of the lip speed stays horizontal" is a statement
 * about a board that has been RELEASED, and the ride only releases a board over
 * a corner: `lipDecision` reads the tangent it arrives on, the chord the board
 * would bridge onto beyond the break, and lets go when the two disagree. The
 * transition's lip stood exactly on `SPOT_MAX_Z`, which is the north wall's own
 * face, so there was no beyond — the last stride of the arc was still GROUNDED
 * when `advance` met the brick, and a grounded step into a wall is charged the
 * whole of the speed, not cos 70° of it.
 *
 * Measured on the version this replaces, riding the line the level teaches
 * (drop in, hold W, nothing else) at 30/60/144 fps: **a wall event on the brick
 * at 3.8–4.2 m/s on every single clean lap**, at z = 48.00, y = 2.29 — which is
 * the top of the ramp, in the wall. That is the player's report in his own
 * words: *"I still crash into that wall on the ramp on the far side of the
 * map."* Popped instead of ridden it is much worse: an ollie taken on the
 * run-out lands the board part way up the arc with its whole speed intact and
 * less than a stride of arc left, and 18 of 4,170 approaches ended in a BAIL,
 * the hardest at **17.78 m/s into the brick** against a `WALL_SLAM` of 10.
 *
 * So the transition gets what the quarter pipe already has and this one never
 * did: the arc stops 2.8 m short of the brick and an APRON carries the last of
 * it to the wall.
 *
 *   arc (86°) → apron (11.3°, rising AWAY from the ramp) → wall
 *
 * · the apron is the CORNER. An 86° tangent breaking onto an 11.3° one is a 75°
 *   break, well past the 59° `lipDecision` already reads at the coping, so the
 *   board is released on the arc's own tangent and only cos 86° = 0.070 of the
 *   lip speed is left pointing at the brick. At the ride's own ceiling that is
 *   1.0 m/s, against a `WALL_SLAM` of 10.
 * · and it rises AWAY from the ramp, which is the half that took two goes to
 *   get right. The first cut put a FLAT deck against the wall and it was worse
 *   than no deck at all: the taught line came down out of its 6 m air onto flat
 *   concrete with a wall in front of it and STOPPED there, 0.00 m/s, parked at
 *   the brick. On 11.3° — the quarter pipe's own apron grade, and it is that
 *   number and not a second opinion — gravity is worth 3.3 m/s² back down it,
 *   so a board that only just clears the lip comes down on ground tipping it
 *   into the transition and rolls back out at the plaza. Which is the sentence
 *   the paragraph above has claimed since it was written.
 *
 * 3.4 m of shelf, and it is sized off the RANGE rather than off taste: the
 * steepened lip flies 1.8 m at the top of the ride's own speed range (see
 * `BACK_LIP_ANGLE` for the table), so 3.4 m leaves 1.65 m of it unused at the
 * worst approach the ride can produce. Going steeper bought that back — the 70°
 * version needed 2.8 m of shelf and flew 6.9 m past it — so the ramp got bigger
 * and the run-out only lost 1.1 m (6.6 m → 5.5 m) rather than gaining a wall.
 *
 * ROUND SIX, AND THE APRON IS GONE. Everything above is still true and the
 * ramp was still broken, in the player's words: *"my character rides onto this
 * ramp, and at the end of the ramp he continues forward, leaning forward,
 * instead of … launches upward and then falls back down. The last ramp looks
 * unrealistic — the top panel isn't flat."*
 *
 * Both halves were this 3.4 m strip of 11.3° concrete, and the arithmetic that
 * condemns it is already written 150 lines up in `BACK_LIP_ANGLE`: **a push is
 * worth PUSH_IMPULSE/PUSH_INTERVAL = 5.4 m/s² and only above 18.5° does gravity
 * beat it.** That paragraph applied it to a 7.9° run-out and never to the apron
 * behind the lip. 11.3° is 17·sin 11.3° = 3.33 m/s² — so the apron was a ramp
 * aimed at the brick that a rider holding W ACCELERATES up, and the note above
 * comparing that 3.33 against nothing at all ("gravity is worth 3.3 m/s² back
 * down it") was comparing it to the wrong number.
 *
 * The other half is what makes it fire on the taught line rather than in a
 * corner case, and it is `LANDING_SCRUB`. An 86° lip leaves cos 86° = 0.070 of
 * the speed horizontal, so the arc comes down almost vertically, and on ground
 * at grade g the wheels keep `along = (vh + vy·g)/hypot(1, g)`. At g = 0.2 that
 * is 0.127 of the lip speed — under the 0.9 m/s a clean landing is scrubbed for
 * anything arriving below 7.1 m/s at the lip. **Scrubbed to zero, and zero is
 * below `PUSH_ROLL_MIN` (0.05), so the push no longer follows `sign(speed)` —
 * it follows `rideSign`, which is the way he is FACING, which is the brick.**
 *
 * Measured on the shipped geometry with `tools/back-ramp.mjs`, riding the line
 * the level teaches (throttle HELD, which is the one thing neither check in
 * `collide-sweep` did — both of them coast):
 *
 *   approach   at the lip   released   lands on the apron at   ends up
 *      8.8 m/s     7.23     yes, 85.7°   z = 45.04, 0.00 m/s     z = 47.98, THE BRICK
 *     10.0        8.11      yes, 85.8°   z = 45.05, 0.00         z = 47.97, THE BRICK
 *
 * — the release fires, the air is real (1.5 m over the coping, 0.83 s of it),
 * and then the landing hands back exactly nothing and the push train walks him
 * 3 m up the apron: 0.19 → 2.53 m/s, decay, kick again, 4.24, until the brick
 * stops him at 2.0–5.4 m/s. **48 of the approaches between 8 and 13 m/s, at
 * 30/60/144 fps, end on the bricks that way**, and the player's own capture is
 * a 49th: 40 km/h at the toe, 3 km/h standing on the pale strip against the
 * wall half a second later.
 *
 * So the strip behind the coping was rebuilt as the two things a real quarter
 * pipe has and this never did: a return that climbs, and a flat deck behind it.
 *
 *   arc (86°) → coping → return (24.2°, 2.0 m) → FLAT DECK (1.4 m) → wall
 *
 * ROUND SEVEN touched nothing on this side of the coping — the shelf was still
 * 3.4 m and still spent the same way. What changed was the face in FRONT of it.
 *
 * ROUND EIGHT SPENDS THE WHOLE SHELF ON THE DECK, AND THE SHELF ITSELF DOES NOT
 * MOVE. `BACK_SHELF` is the one number on this side of the coping that round
 * eight leaves alone, and that is deliberate: it is what fixes the lip on
 * `BACK_LIP_Z` = 44.60 and therefore the toe on 41.27, so every prop that stands
 * off this footprint, the run-out's length and the whole face are untouched. The
 * deck is not bought out of the plaza or out of the face — it is bought out of
 * the 2.1 m of CLIMB that used to sit between the coping and the flat, which was
 * paying for a landing zone the player has now told us not to buy. Read
 * `BACK_DECK_Y` for the ruling and for what it costs.
 *
 * Since this is the one place the whole ramp is written on a single line, the
 * line is restated whole rather than left describing a shelf that is gone:
 *
 *   flat 40° panel (2.44 m of rise) → 0.42 m curl → 0.10 m of vert →
 *     COPING at 3.4 m, 88°, with steel on it →
 *     FLAT DECK, level at 3.4 m, 3.4 m deep → wall
 */
const BACK_SHELF = 3.4;
/**
 * How steeply an apron behind a lip climbs away from it, rise per metre.
 *
 * The quarter pipe's own — `QP_APRON` is 1.1 m for 0.22 m — so the two lips in
 * this spot break by the same angle and a board coming down on either of them
 * is handed back by the same 3.3 m/s².
 *
 * The north wall does not share it — it has no apron at all as of round eight
 * (see `BACK_DECK_Y`) — and that is a SPLIT, not an oversight, so it is written
 * down where the number lives. 11.3° is right for the two aprons that still use
 * it because neither is a run at anything: `qp-apron` is 1.1 m of tip-back with
 * 2.8 m of flat deck behind it and no wall for 22 m, and the alley aprons are 2 m
 * strips at the end of a bank whose whole job is bleeding speed off. What made
 * 11.3° wrong at the north wall is that there were 3.4 m of it pointed at brick.
 */
const APRON_GRADE = 0.2;
/** Where the lip is — derived off the wall, so the shelf always reaches it. */
const BACK_LIP_Z = SPOT_MAX_Z - BACK_SHELF;
/**
 * …and the toe follows the lip, so the face still meets the plaza flush.
 *
 * `arcRun` reads the panel as well as the curl, so the depth follows the shape
 * instead of being typed beside it. The panel meets the plaza at a 40° CREASE
 * rather than tangentially, which is what a box ramp is and is the same junction
 * `bank`, `dock-bank` and `block-ramp` already have: it is concave, so the ride's
 * own lip test reads it as a dip and never releases anything there ("it curls
 * back up: that is a dip, not a lip"), and the deck lays onto it through
 * `NORMAL_FOLLOW` like any other change of ground.
 */
const BACK_TOE_Z =
  BACK_LIP_Z -
  arcRun({ radius: BACK_RADIUS, height: BACK_HEIGHT, panel: BACK_PANEL, vert: BACK_VERT });
/** Where the flat deck starts: AT the coping. There is nothing between them. */
const BACK_DECK_Z = BACK_LIP_Z;
/**
 * THE DECK IS LEVEL WITH THE COPING, AND THIS IS THE WHOLE OF ROUND EIGHT.
 *
 * The player's EIGHTH report on this ramp, and the first one that says in so
 * many words what shape he wants and what he is willing to pay for it:
 *
 *   *"the top isn't flat — there's no flat surface. Plus, the corner is folded
 *   strangely. Please make it a normal shape. Look, think about it
 *   mathematically: a standard default ramp. Forget that the character pops off
 *   it; let's just make it a proper shape."*
 *
 * HE IS DESCRIBING THE GEOMETRY EXACTLY, AND SEVEN ROUNDS OF NOTES ABOVE SAY SO
 * WITHOUT MEANING TO. The shelf was 3.4 m and it was spent 1.5 m of straight
 * 24.2° return, 0.6 m of eased crest, and 1.3 m of flat at y = 4.21. So behind
 * a coping at 3.4 m the ground went UP for 2.1 m before it went level, and from
 * a rider's eye on the face the object's skyline was the crest, not the coping:
 * one lit plane at 40°, one shadowed plane at 24.2°, a bright steel line where
 * they meet, and no readable top anywhere. That is a WEDGE, which is his word,
 * and the 1.3 m of genuinely level concrete behind it was invisible from
 * everywhere a player ever stands.
 *
 * AND THE "FOLDED CORNER" IS THE SAME DEFECT SEEN FROM ON TOP, not a plan-view
 * corner at all — the bank runs the full 77 m into both side walls with
 * `WALL_TUCK` to spare, so it has no visible end to mitre. What the fold was is
 * `meshSolid`'s ONE NORMAL PER SEGMENT, which round seven removed from the face
 * and never from the shelf: the return, the four `easedRise` crest strips and
 * the deck are six solids and therefore six constant-shaded bands, each a few
 * degrees off its neighbour, all running the length of the ramp and converging
 * at the ends. Captured from the top of the ramp looking along the wall
 * (`tools/ramp-look.mjs`, `on-the-deck-w`) it reads as a creased, folded surface
 * rather than a top. ONE flat deck is ONE facet at ONE tone, so the fold has no
 * geometry left to live on. The same fix answers both halves of his report,
 * which is why there is no separate corner treatment in this file.
 *
 * SO: the whole shelf is deck, level at `BACK_HEIGHT`, with the coping at its
 * front edge. 3.4 m of it — a wide platform by any park's standard, and 2.6×
 * what was there. What it costs is listed rather than discovered later:
 *
 *   deck   deck y   clear brick   toe z    run-out   ← BACK_SHELF that buys it
 *   1.3    4.210     0.665 m      41.27    as now      3.4 (return 1.5 + crest 0.6)
 *   **3.4  **3.400** **1.475 m**  **41.27** **as now** **3.4, all of it deck** ←
 *   2.0    3.400     1.475        42.67    +1.4 m      2.0
 *   4.5    3.400     1.475        40.17    −1.1 m      4.5 — toe goes SOUTH
 *
 * The picked row is the one that changes NOTHING but the shape: `BACK_SHELF`
 * stays 3.4, so the lip stays on 44.60 and the toe on 41.27, and every prop that
 * stands off this footprint (see the `pallets` note), the run-out's length and
 * the whole face are untouched. The deck is paid for entirely out of the 2.1 m
 * of climb that used to sit in front of it. The last row is out on its own
 * terms: past about 3.67 m of shelf the toe crosses z = 41.00 and goes south
 * into the props.
 *
 * AND IT GIVES THE WALL ITS PAINT BACK, which is the reverse of what every
 * previous round on this shelf had to trade. The concrete meets the north facade
 * at the deck's own height, the string course starts at 4.875, and a piece that
 * crosses a course is pushed to the FRONT of it by `facadeFront` and floats
 * 0.55 m off the brick (see the long note in `props.ts`). At 4.21 the clear
 * strip was 4.875 − 4.21 = 0.665 m and the eight north tags are 0.30–0.46 m
 * tall in it. At 3.40 it is 4.875 − 3.40 = **1.475 m**, 2.2× as much, and every
 * piece reads the concrete's own height through `onWallOver` so the paint comes
 * down with the deck by itself. `tools/decal-gap.mjs` measures it.
 *
 * WHAT IT COSTS THE RIDE, MEASURED AND NOT HAND-WAVED — and this is the half a
 * ninth round must not have to rediscover.
 *
 * A LEVEL TOP CANNOT HAND A BOARD BACK. `17·sin θ > PUSH_IMPULSE/PUSH_INTERVAL`
 * is θ > 18.53°, so only a slope steeper than that beats a held throttle; and
 * `LANDING_SCRUB` charges a clean landing 0.9 m/s of the `(vh + vy·g)/hypot(1,g)`
 * the wheels keep, which on g = 0 is only the horizontal — cos 88° = 0.035 of
 * the lip speed. Both numbers say the same thing: **a top you can read as flat
 * and a top that rolls you back off it are mutually exclusive on this engine.**
 * That is why seven rounds failed. Each of them tried to buy both, and the
 * player has now chosen, in writing, which one he wants.
 *
 * `pushBlocked` (`skate-model.ts`, landed this session) does NOT close it, and
 * the claim that it might was checked rather than taken: it is scoped to a board
 * already inside `PUSH_ROLL_MIN` and probes `WALL_FEEL` = 0.05 m ahead, so it
 * stops a stopped rider pushing THROUGH brick he is flush against — it cannot
 * stop him being walked 3 m across a deck to reach it. What it does guarantee is
 * the end state: he arrives, he stops, and he stays stopped instead of grinding
 * at it, and the arithmetic bounds the arrival — 3.0 m of push from rest is
 * `sqrt(2·5.4·3.0)` = 5.7 m/s against a `WALL_SLAM` of 10, so nothing up here
 * can bail. He turns round and drops back in, which is what you do on a deck.
 */
const BACK_DECK_Y = BACK_HEIGHT;

/**
 * THE ALLEY ENDS, which are the other two lines in this spot that end face-down.
 *
 * The road runs out through an alley at each end and stops against a back wall
 * you can see — which is the right picture and, ridden, is 45 m of straight
 * asphalt into a brick wall at whatever speed you got up to. Both alley lines
 * measured 0 m/s and a ragdoll.
 *
 * The same THREE pieces as the north wall, in the same order: the alley climbs
 * out of the road's own trench (which is what a real service alley does — the
 * carriageway is sunk for its gutters and the yard behind is not), then the
 * cast bank, then the apron that gives the bank a lip. `ALLEY_RISE` is where
 * the climb starts; everything after it is derived off the wall.
 *
 * The apron is new and it is here for exactly the reason `BACK_SHELF` is — read
 * that first. These two were WORSE than the north wall, because an alley is a
 * slot: 8 m wide, 45 m of straight asphalt into it, and a bank only 1.6 m tall
 * to bleed the speed off. Measured on the version this replaces, 10 → 18.7 m/s
 * at 30/60/144 fps with the throttle held and an ollie tried at every twelfth
 * of a second: **688 of 4,170 approaches BAILED**, the hardest at 17.44 m/s
 * into the brick. The north wall's own figure was 18.
 */
const ALLEY_HEIGHT = 1.6;
/**
 * …and they keep the 70° the north wall was built at, which is a SPLIT and not
 * an oversight, so it is written down.
 *
 * These two constants were one constant until the north transition was rebuilt
 * as something you pop off. They are not the same object any more. The north
 * wall's bank is a quarter pipe with a 3.4 m run-out behind it and a plaza to
 * carve back into — it is meant to throw you, and 86° is how the arc lands back
 * on it. An alley end is a dead end you arrive at down 45 m of straight asphalt
 * with 8 m of width and no run-out at all: what it is for is bleeding the speed
 * off and pointing you back, and 70° already does that (it takes 94% of the lip
 * speed out of the direction of the brick). Steepening it would only fire the
 * board straight up in a slot 8 m wide with a 12 m wall on three sides, which is
 * more air with nowhere to put it.
 */
const ALLEY_LIP_ANGLE = (70 * Math.PI) / 180;
const ALLEY_RADIUS = ALLEY_HEIGHT / (1 - Math.cos(ALLEY_LIP_ANGLE));
const ALLEY_RUN = arcRun({ radius: ALLEY_RADIUS, height: ALLEY_HEIGHT });
/** Where each alley's end wall stands — the two `alley-*-end` slabs' inner face. */
const ALLEY_WALL = 46;
/**
 * How much of the alley the apron behind the bank takes. 2 m and not the north
 * wall's 2.8: an alley is 8 m wide and every metre of it is road, so the lip
 * gets the shortest break `lipDecision` can still read rather than the roomiest.
 */
const ALLEY_SHELF = 2;
/** …so the lip stands here, clear of the brick, and the toe follows it. */
const ALLEY_LIP = ALLEY_WALL - ALLEY_SHELF;
/** …and the top of the climb out of the trench is the bank's toe. */
const ALLEY_TOE = ALLEY_LIP - ALLEY_RUN;
/** How long the climb out of the trench is. 3.4 m for 0.38 m is 6.4°. */
const ALLEY_RISE = 3.4;

/**
 * The manual pad, as three numbers the bumps and the rails both read.
 *
 * It moved 0.8 m north with the eased bump in front of it: the crest has to be
 * long enough to hold the wheels down at line speed (5.2 m — see `easedRise`)
 * and the crossing table's north edge is at z = 4, so where those two meet is
 * where the pad's south edge is. 0.40 and not 0.28: see `STEP_FLOOR`.
 */
const MANNY_S = 9;
const MANNY_N = 13;
const MANNY_Y = 0.4;

/**
 * …and the funbox, the one new obstacle, in the same three numbers.
 *
 * It sits in the north-east quadrant, which is the piece of plaza the widening
 * actually opened: at the old SPOT_MAX_X there was 6 m between the block ramp
 * and the kerb and anything standing in it fouled the run at the quarter pipe.
 * 0.45 m clears STEP_FLOOR, so it is a thing you ollie onto rather than a thing
 * the ride cannot resolve.
 */
const FUNBOX_W = 26;
const FUNBOX_E = 32;
const FUNBOX_Y = 0.45;

/**
 * Where the kerb is cut for a vehicle, in world x.
 *
 * Three of them, and their WIDTH is the whole judgement call. A kerb you can
 * never cross cuts the spot in half, and a kerb cut everywhere is not a kerb —
 * and this level grinds its kerbs. These three plus the crossing take 25 m out
 * of 62 m of kerb line, so most of the street still stops you and the west,
 * middle and east thirds all have a way over.
 */
const DRIVE_W: readonly [number, number] = [-29, -24];
const DRIVE_C: readonly [number, number] = [-14, -10];
const DRIVE_E: readonly [number, number] = [17, 23];
/**
 * How deep an apron is. 2.4 m for a 0.38 m drop is 9 deg — a driveway's grade,
 * and deliberately not the 13.4 deg the first pass used: at 12 m/s that crest
 * threw the board 0.23 m into the air and 4 m down the pavement, which landed
 * it inside the block pad's 0.55 m face on the east side. A dropped kerb is not
 * meant to be a kicker.
 */
const APRON = 2.4;
/**
 * How far in from each side of an apron the fall is eased back to nothing.
 *
 * This is the splay, and it is the number that finally takes the upstand out
 * rather than moving it. 1.6 m against a 0.38 m drop is a 13.4° cross-slope: a
 * board crossing the pavement rolls down it and back up it, and the biggest
 * step anywhere on the footprint is what a 5 cm stride covers of that — under a
 * centimetre, against a 0.30 m wall probe.
 */
const APRON_FLARE = 1.6;
/** Where the footway stops being flat and starts falling to the kerb line. */
const FOOT_S = -4 - APRON;
const FOOT_N = 4 + APRON;
/**
 * How far a floor runs ON under the wall that bounds it.
 *
 * Every plaza slab used to stop on the same line its building starts on, so the
 * last query before the brick had no floor under it at all — and "no floor"
 * is a hole, whatever it is answered with. The ride probes a stride ahead of
 * itself, so a board rolling at a wall asks about the inside of it every frame
 * of the approach; `blocked()` is what stops him there, and it needs the ground
 * to still be ground while it does. Running the floor a metre and a half in
 * under the wall costs nothing to look at (it is inside the building's own
 * solid) and means `resolve` never has to invent an answer where the ride can
 * reach.
 */
const WALL_TUCK = 1.5;

/**
 * Where the footway against each side wall stops and the plaza begins.
 *
 * This is the single biggest thing done about "82% of the floor is one tile",
 * and it is a piece of ARCHITECTURE rather than a texture trick. Every building
 * in a city stands behind a footway; the plaza's big poured bays start where
 * that footway ends. Splitting the two enormous plaza slabs at these two lines
 * costs four extra solids and puts a real material break — different pour,
 * different panel size, different colour — down both long sides of the level,
 * where before there was 74 m of one image repeating.
 *
 * 3.6 m because that is a footway you can ride two abreast down and still leave
 * room for the clutter that stands on one: a bin, a meter, a cabinet, a tree.
 */
const WALK_W = SPOT_MIN_X + 3.6;
const WALK_E = SPOT_MAX_X - 3.6;

/**
 * The built spot — everything with a face you can see. `SOLIDS` adds the street
 * furniture's colliders on top of this; the mesh and the dressing walk THIS
 * list, because a dumpster's collider has no triangles of its own.
 */
export const SPOT_SOLIDS: readonly Solid[] = [
  // --- the floor -----------------------------------------------------------
  // Three slabs across, not one: footway, plaza, footway. They are all at y = 0
  // and they all butt (never overlap — two coplanar tops would z-fight, and
  // SEAM already closes the join for the query), so nothing about the ride
  // changes and everything about the picture does.
  slab("plaza-south-w", SPOT_MIN_X - WALL_TUCK, WALK_W, SPOT_MIN_Z - WALL_TUCK, FOOT_S, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),
  slab("plaza-south", WALK_W, WALK_E, SPOT_MIN_Z - WALL_TUCK, FOOT_S, { shape: "flat", y: 0 }, "concrete", "concrete", -1.5),
  slab("plaza-south-e", WALK_E, SPOT_MAX_X + WALL_TUCK, SPOT_MIN_Z - WALL_TUCK, FOOT_S, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),
  // The road is SUNKEN, which is where the kerbs come from: the plaza's own
  // edge is the kerb, so there is no second description of it to disagree.
  //
  // The depth is not a look, it is a measurement. At 0.18 m the kerb was a
  // RISE the ride could roll up, and one frame's worth of it at 16 m/s reads as
  // 10.8 m/s of vertical — the harness put the skater 3.4 m in the air off a
  // kerb. Past ROAD_DROP the kerb is taller than the board's wall probe, so it
  // stops him instead: you ollie it, you grind it, or you take the crossing.
  slab("road", -44 - WALL_TUCK, 44 + WALL_TUCK, -4, 4, { shape: "flat", y: -ROAD_DROP }, "asphalt", "asphalt", -1.5),
  // …and the crossing, where the main line goes straight over flush.
  //
  // It is a raised TABLE, not a slab, and the two ramps are the whole fix. At
  // pavement level with vertical ends it was a 0.38 m step across the full 8 m
  // width of 88 m of asphalt — the biggest single piece of real street in the
  // level was a wall to anything riding it, in either direction. A speed table
  // with a ramp at each end is what a raised crossing actually is, and it costs
  // the north-south line nothing: the middle 10 m is still dead flush.
  // …in the footway's own panels, because that is what a raised table is built
  // out of: it is the pavement carried across the road, not a lump of plaza.
  slab("crossing", -3, 7, -4, 4, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),
  rampAlongX("crossing-ramp-w", -6.6, -3, -4, 4, -ROAD_DROP, 0, "asphalt", "asphalt", -1.5),
  rampAlongX("crossing-ramp-e", 7, 10.6, -4, 4, 0, -ROAD_DROP, "asphalt", "asphalt", -1.5),
  // THE DROPPED KERBS, AND THEY ARE CUT INTO THE FOOTWAY, NOT INTO THE ROAD.
  //
  // A kerb you cannot cross for 30 m either side of one crossing is not a
  // street, it is a moat, so three of them are dropped for a delivery van. The
  // first pass laid the ramp in the trench — flush with the pavement at the
  // kerb line and falling to the asphalt over 2.4 m — and that put a wedge of
  // concrete standing over the road along its whole 5 m side: ROAD_DROP proud
  // at the kerb line, and still 0.28 m proud after the lip was dropped 0.10 m
  // to get it under the ride's wall probe. So the fix for the wall built a
  // ramp you rode into sideways instead, and the gutter — a 60 m lane of real
  // street the whole level is cut around — met a step at all three of them.
  //
  // The ramp belongs on the other side of the kerb line, which is where a real
  // vehicle crossing puts it: the FOOTWAY is lowered, the gutter runs through
  // dead flush, and there is nothing standing in the road at all.
  //
  // …and it is an APRON, not a ramp, which is the third round of this and the
  // first one that removes the upstand instead of relocating it. A ramp that
  // falls only along z is 0.317 m below the pavement beside it at z = -4.4 and
  // 0.348 at -4.2 — over the ride's 0.30 m probe both times — so a board
  // crossing the footway dropped into the apron and was stopped by its far
  // side. The apron falls across itself as well (see `Profile`), so its long
  // sides ARE the pavement and there is no side left to hit. Swept at 5 cm over
  // the whole footprint of all six, in both ride axes: 0.348 m → 0.010 m.
  slab("drive-w-s", DRIVE_W[0], DRIVE_W[1], FOOT_S, -4, { shape: "apron", y0: 0, y1: -ROAD_DROP, flare: APRON_FLARE }, "asphalt", "asphalt", -1.5),
  // …and the north three run the other way, because `t` does: their -z edge is
  // the kerb line and their +z edge is the pavement. See `apronY`.
  slab("drive-w-n", DRIVE_W[0], DRIVE_W[1], 4, FOOT_N, { shape: "apron", y0: -ROAD_DROP, y1: 0, flare: APRON_FLARE }, "asphalt", "asphalt", -1.5),
  slab("drive-c-s", DRIVE_C[0], DRIVE_C[1], FOOT_S, -4, { shape: "apron", y0: 0, y1: -ROAD_DROP, flare: APRON_FLARE }, "asphalt", "asphalt", -1.5),
  slab("drive-c-n", DRIVE_C[0], DRIVE_C[1], 4, FOOT_N, { shape: "apron", y0: -ROAD_DROP, y1: 0, flare: APRON_FLARE }, "asphalt", "asphalt", -1.5),
  slab("drive-e-s", DRIVE_E[0], DRIVE_E[1], FOOT_S, -4, { shape: "apron", y0: 0, y1: -ROAD_DROP, flare: APRON_FLARE }, "asphalt", "asphalt", -1.5),
  slab("drive-e-n", DRIVE_E[0], DRIVE_E[1], 4, FOOT_N, { shape: "apron", y0: -ROAD_DROP, y1: 0, flare: APRON_FLARE }, "asphalt", "asphalt", -1.5),
  // …and the footway either side of each of them. The plaza is one slab right
  // up to FOOT_S / FOOT_N and four strips after it, because the crossings are
  // cut OUT of the pavement and nothing in this file is cut out of anything —
  // a strip that is not there is the hole the ramp lives in. Each strip carries
  // exactly one kerb run (see RAILS), which is what keeps the two in step.
  slab("footway-s-w", SPOT_MIN_X - WALL_TUCK, DRIVE_W[0], FOOT_S, -4, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),
  slab("footway-s-c", DRIVE_W[1], DRIVE_C[0], FOOT_S, -4, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),
  slab("footway-s-e", DRIVE_C[1], DRIVE_E[0], FOOT_S, -4, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),
  slab("footway-s-ee", DRIVE_E[1], SPOT_MAX_X + WALL_TUCK, FOOT_S, -4, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),
  slab("footway-n-w", SPOT_MIN_X - WALL_TUCK, DRIVE_W[0], 4, FOOT_N, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),
  slab("footway-n-c", DRIVE_W[1], DRIVE_C[0], 4, FOOT_N, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),
  slab("footway-n-e", DRIVE_C[1], DRIVE_E[0], 4, FOOT_N, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),
  slab("footway-n-ee", DRIVE_E[1], SPOT_MAX_X + WALL_TUCK, 4, FOOT_N, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),
  slab("plaza-north-w", SPOT_MIN_X - WALL_TUCK, WALK_W, FOOT_N, SPOT_MAX_Z + WALL_TUCK, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),
  slab("plaza-north", WALK_W, WALK_E, FOOT_N, SPOT_MAX_Z + WALL_TUCK, { shape: "flat", y: 0 }, "concrete", "concrete", -1.5),
  slab("plaza-north-e", WALK_E, SPOT_MAX_X + WALL_TUCK, FOOT_N, SPOT_MAX_Z + WALL_TUCK, { shape: "flat", y: 0 }, "concrete", "sidewalk", -1.5),

  // --- the raised south platform, and the ways on and off it ---------------
  slab("platform", -28, 24, SPOT_MIN_Z - WALL_TUCK, -14, { shape: "flat", y: 1.15 }, "concrete", "concrete", -1.6),
  // The terrace's access ramps, one at each end. Without them the platform is a
  // 52 m wall to anything crossing the lower plaza east-west, and the only ways
  // up were the stair set and the bank — both in the middle 12 m of it.
  rampAlongX("platform-ramp-w", -32.5, -28, -32, -17, 0, 1.15, "concrete", "concrete", -0.4),
  rampAlongX("platform-ramp-e", 24, 28.5, -32, -17, 1.15, 0, "concrete", "concrete", -0.4),
  slab("stair6", -16, -6, -14, -11, { shape: "stairs", y0: 1.15, y1: 0, steps: 6 }, "concrete", "concrete", -0.4),
  // A hubba: the ledge that runs down the side of a stair set. Its top starts
  // proud of the platform so the edge reads, and lands short of the floor.
  slab("hubba", -5.6, -4.4, -14, -10.4, { shape: "ramp", y0: 1.35, y1: 0.2 }, "concrete", "ledge", -0.2),
  slab("bank", -2, 6, -14, -9.5, { shape: "ramp", y0: 1.15, y1: 0 }, "concrete", "park", -0.4),

  // --- ledges and pads on the lower plaza ----------------------------------
  slab("ledge-long", -22, -20, 6, 20, { shape: "flat", y: 0.45 }, "concrete", "ledge", -0.2),
  // Low, wide and right off the crossing, so the manual is the first thing the
  // main line offers — and then z = 11…24 is clear run at the quarter pipe.
  //
  // 0.40, not the 0.28 it shipped at, and the 12 cm is the whole feature. See
  // STEP_FLOOR: at 0.28 this pad was the one solid in the spot standing inside
  // the ride's blind band, and the board rolled through it as if it were not
  // there — measured, y held 0.000 from z = 6.73 to z = 11.07 with the pad top
  // at 0.280. At 0.40 it is a manny pad you ollie onto, like every other ledge
  // here, which is also how you get onto one in real life.
  slab("manual-pad", -6, 6, MANNY_S, MANNY_N, { shape: "flat", y: MANNY_Y }, "concrete", "park", -0.2),
  // …and the bumps onto it, which are the piece the main line was missing. A
  // 0.40 m face square across the designed spine is a wall by the ride's own
  // rule, and it behaved like one: 16.6 m/s into it, 0.00 m/s out.
  //
  // A single-slope bank fixed the wall and broke the pad instead. 2.4 m of
  // ramp for 0.40 m is 9.5°, and a 9.5° crest is a 3 m radius the ride lets go
  // of at 7 m/s — so at the 16.5 m/s the main line actually arrives at, the
  // board left the ground at the pad's south edge and came down 6.4 m later,
  // past its north edge. Measured over 8 → 18 m/s: 23–27 frames of air on every
  // approach and the wheels never once on the pad. The file has always
  // described this as "roll up, manual the flat, roll off"; this is the first
  // version where you can.
  //
  // So the crest is EASED — see `easedRise`. The long edges are still 0.40 m
  // ledges you ollie onto and grind (see RAILS), which is what a manny pad is
  // for when you are not manualling it.
  // Starts at z = 4 and not a centimetre south of it: the road is a 0.38 m
  // trench from z = -4 to +4 across the whole level, so a bump reaching back
  // over that line stands its own 0.4 m face in the gutter. Measured on the
  // first version, which started at 2.6: a lane riding the north gutter east
  // stopped dead at x = -6 on the bump's own side.
  ...easedRise("manual-pad-bump-s", -6, 6, 4, MANNY_S, 0, MANNY_Y, 6, "concrete", "park", -0.2),
  ...easedRise("manual-pad-bump-n", -6, 6, MANNY_N, MANNY_N + 3.2, MANNY_Y, 0, 4, "concrete", "park", -0.2, true),
  // Held east of x = 6.8. At its old centre it cut 0.4 m into the manual pad's
  // south-east corner, and the pad's grind line measured −0.020 m of clearance
  // where the two tops crossed — one ledge standing inside another.
  makeSolid("ledge-angled-ne", 10.2, 8, 3.5, 0.55, -0.45, { shape: "flat", y: 0.42 }, "concrete", "ledge", -0.2),
  // East of x = -22.3, which is what keeps it out of the west driveway's run:
  // at its old centre it lay square across the approach to the dropped kerb and
  // every line that used that crossing died on it 4 m short.
  makeSolid("ledge-angled-sw", -19, -8, 3.2, 0.7, 0.35, { shape: "flat", y: 0.4 }, "concrete", "ledge", -0.2),

  // --- the block: bank up the south face, three stairs off the north --------
  // Held 2 m further north than it shipped, and its bank stretched from 1.6 m
  // to 3. Both numbers come off the east driveway: a board coming out of the
  // apron is still settling at z = 6, and at the old spacing it came down onto
  // the pad's 0.55 m face and stopped dead. There is flat pavement between the
  // kerb and the bank now, and the bank is 10 deg instead of 19.
  slab("block-pad", 14, 26, 9, 18, { shape: "flat", y: 0.55 }, "concrete", "concrete", -0.2),
  slab("block-bank", 14, 26, 6, 9, { shape: "ramp", y0: 0, y1: 0.55 }, "concrete", "park", -0.2),
  slab("stair3", 18, 22, 18, 19.65, { shape: "stairs", y0: 0.55, y1: 0, steps: 3 }, "concrete", "concrete", -0.2),
  // The ramp beside the stairs, which is what every plaza block this size has.
  // Without it the block's whole north face was 0.55 m of wall to anything
  // coming down the east side — 31 lanes stopped on this one solid.
  slab("block-ramp", 22, 26, 18, 20, { shape: "ramp", y0: 0.55, y1: 0 }, "concrete", "park", -0.2),

  // --- the loading dock, against the west block ----------------------------
  slab("dock", -34 - WALL_TUCK, -26, 12, 26, { shape: "flat", y: 1.1 }, "concrete", "concrete", -1.2),
  slab("dock-bank", -34 - WALL_TUCK, -26, 8, 12, { shape: "ramp", y0: 0, y1: 1.1 }, "concrete", "concrete", -1.2),

  // --- the quarter pipe ----------------------------------------------------
  //
  // THE WHOLE RAMP IS TROWELLED CONCRETE NOW, transition to landing, and the
  // plywood is gone. It was drawn in two materials that were both wrong: the
  // transition took the plaza's slab image, so a 65° curve had a floor bay grid
  // wrapped round it, and everything behind the coping took a procedural
  // plywood sheet, so the marquee obstacle was a concrete curve with a wooden
  // shelf bolted to the back of it. Nobody builds that. A cast park quarter is
  // one pour from toe to run-out, and the `park` surface is that pour — which
  // is also the only material in the level with a wax sheen on it, and the lip
  // of this thing is the most-waxed metre of concrete on the spot.
  quarterPipe("qp", -14, 6, QP_TOE_Z, QP_RADIUS, QP_HEIGHT, "concrete", "park", -0.4),
  // The apron, declared AFTER the transition on purpose: the two meet at
  // exactly QP_HEIGHT and the tie-break takes the one declared last, so the
  // seam hands back the apron's 11° instead of the arc's vertical. A ride that
  // read the corner's own tangent as the ground it is standing on would be
  // stopped dead by a wall it is already on top of.
  slab("qp-apron", -14, 6, QP_LIP_Z, QP_DECK_Z, { shape: "ramp", y0: QP_HEIGHT, y1: QP_DECK_Y }, "concrete", "park", -0.4),
  slab("qp-deck", -14, 6, QP_DECK_Z, QP_DECK_END, { shape: "flat", y: QP_DECK_Y }, "concrete", "park", -0.4),
  // THE LANDING. See `QP_LAND_END` — this is where an air off the coping comes
  // down, and the reason it comes down with speed instead of stopping dead. Its
  // crest is eased so that rolling off the deck at walking pace is a roll-off
  // and not a drop, and so an air that lands SHORT meets a surface curving away
  // from it rather than an edge.
  ...easedRise("qp-land", -14, 6, QP_DECK_END, QP_LAND_END, QP_DECK_Y, 0, 5, "concrete", "park", -0.4),
  // The roll-offs. A deck with no way off it is a shelf, and there was no way
  // to get UP there except through the transition. Cast banks at both ends make
  // the deck a place you arrive at and leave — roll in from the west, come down
  // the transition, or take the east bank back to the plaza.
  rampAlongX("qp-roll-w", -21, -14, QP_DECK_Z, QP_DECK_END, 0, QP_DECK_Y, "concrete", "park", -0.4),
  rampAlongX("qp-roll-e", 6, 13, QP_DECK_Z, QP_DECK_END, QP_DECK_Y, 0, "concrete", "park", -0.4),

  // THE BACK TRANSITION — what turns the run-out into a line instead of a dead
  // end. See `BACK_LIP_ANGLE`: it was a 7.9° ramp, which is a slope a rider with
  // the throttle held ACCELERATES up, and it fed him over the top and into the
  // brick at every clean lap. It is a cast bank-to-wall now.
  //
  // …and a BOX RAMP as of round seven, which is the player's own word for what he
  // wanted: one flat 40° panel for the bottom 2.44 m of the height (3.79 m of the
  // 4.88 m face, and ONE facet), the top 0.42 m of run curled to the lip, 0.10 m
  // of vert under it, and a steel coping along it (see `RAILS`). See
  // `BACK_FACE_ANGLE` for why 40°, `BACK_KICK_RUN` for why the curl cannot be a
  // crease, and `BACK_VERT` for why the lip cannot end on the curl. The launch is
  // untouched by all of it — the ride releases on the tangent it arrives on and
  // that tangent is still 88°, now to within a tenth of a degree at every frame
  // rate instead of within three.
  //
  // Full width, so it has no ends to catch a board crossing the north plaza.
  quarterPipe("back-trans", SPOT_MIN_X - WALL_TUCK, SPOT_MAX_X + WALL_TUCK, BACK_TOE_Z, BACK_RADIUS, BACK_HEIGHT, "concrete", "park", -0.4, BACK_PANEL, BACK_VERT),
  // …and the DECK, which as of round eight is the ONLY thing behind the coping.
  // See `BACK_DECK_Y`: the return and the eased crest are gone, and with them the
  // 2.1 m of climb that made this object read as a wedge with no top and made its
  // six flat-shaded strips read as a folded surface from above. What is left is
  // the standard park top — coping at the front edge, 3.4 m of level concrete
  // behind it, wall — and it is ONE solid, so it is one facet at one tone.
  //
  // Declared AFTER the transition for the reason `qp-apron` is: the two meet at
  // exactly BACK_HEIGHT and the tie-break takes the one declared last, so the
  // seam at the coping hands back the deck's level 0° rather than the arc's
  // near-vertical, and a board arriving over the lip is standing on a floor
  // instead of on a wall.
  //
  // It runs ON under the wall by WALL_TUCK, same as every floor here: a board
  // pressed against the brick has to have ground under its probe.
  slab("back-deck", SPOT_MIN_X - WALL_TUCK, SPOT_MAX_X + WALL_TUCK, BACK_DECK_Z, SPOT_MAX_Z + WALL_TUCK, { shape: "flat", y: BACK_DECK_Y }, "concrete", "park", -0.4),

  // --- the alley ends, on the same two terms -------------------------------
  //
  // See `ALLEY_HEIGHT`. The alley climbs out of the road's trench, the last
  // 2.3 m of it is a bank, and the bank tops out onto an apron and a deck — so
  // riding the road to the end of the world is a transition and a carve back
  // rather than a ragdoll, which is what the apron is for.
  rampAlongX("alley-e-rise", ALLEY_TOE - ALLEY_RISE, ALLEY_TOE, -4, 4, -ROAD_DROP, 0, "asphalt", "asphalt", -1.5),
  makeSolid("alley-e-trans", ALLEY_LIP - ALLEY_RUN / 2, 0, 4, ALLEY_RUN / 2, Math.PI / 2, { shape: "arc", radius: ALLEY_RADIUS, height: ALLEY_HEIGHT }, "concrete", "park", -1.5),
  rampAlongX("alley-e-apron", ALLEY_LIP, ALLEY_WALL + WALL_TUCK, -4, 4, ALLEY_HEIGHT, ALLEY_HEIGHT + (ALLEY_WALL + WALL_TUCK - ALLEY_LIP) * APRON_GRADE, "concrete", "park", -1.5),
  // …and the west one, which is the same three solids with their local +v turned
  // onto world -x. A yaw of -π/2 does that for the arc, and `rampAlongX` reads
  // `y0` at the low-x end, so the west apron is declared wall-first.
  rampAlongX("alley-w-rise", -ALLEY_TOE, -(ALLEY_TOE - ALLEY_RISE), -4, 4, 0, -ROAD_DROP, "asphalt", "asphalt", -1.5),
  makeSolid("alley-w-trans", -(ALLEY_LIP - ALLEY_RUN / 2), 0, 4, ALLEY_RUN / 2, -Math.PI / 2, { shape: "arc", radius: ALLEY_RADIUS, height: ALLEY_HEIGHT }, "concrete", "park", -1.5),
  rampAlongX("alley-w-apron", -(ALLEY_WALL + WALL_TUCK), -ALLEY_LIP, -4, 4, ALLEY_HEIGHT + (ALLEY_WALL + WALL_TUCK - ALLEY_LIP) * APRON_GRADE, ALLEY_HEIGHT, "concrete", "park", -1.5),

  // --- THE FUNBOX, in the width the block just gained ----------------------
  //
  // The one new thing to SKATE, and it is here because the widening is what
  // made room for it: at the old SPOT_MAX_X the whole strip east of the block
  // pad was 6 m of run-off between a fence and a kerb, and anything put in it
  // stood in the line to the quarter pipe. A funbox is the most ordinary object
  // in a plaza and this spot did not have one — a low pad you can ollie onto,
  // bank up either end, and grind the side of, all at a height that costs you
  // nothing if you get it wrong. Same three numbers as the manual pad, so a
  // line can carry straight off one and onto the other.
  //
  // Its banks are `easedRise` for the reason the manual pad's are (a
  // single-slope crest is a kicker at line speed), and its top clears
  // STEP_FLOOR so it is a thing you get onto rather than a thing you ride
  // through.
  slab("funbox", FUNBOX_W, FUNBOX_E, 25, 30, { shape: "flat", y: FUNBOX_Y }, "concrete", "park", -0.2),
  ...easedRise("funbox-bank-s", FUNBOX_W, FUNBOX_E, 22, 25, 0, FUNBOX_Y, 5, "concrete", "park", -0.2),
  ...easedRise("funbox-bank-n", FUNBOX_W, FUNBOX_E, 30, 33, FUNBOX_Y, 0, 5, "concrete", "park", -0.2, true),
  // …which is why the fence stops at z = 21 now rather than 26: it used to run
  // straight through where the funbox stands, and a chain-link panel across an
  // obstacle is not a decision anybody would make on purpose.

  // --- what holds it all in ------------------------------------------------
  // The bound IS the architecture: four brick blocks, the road running out
  // through an alley at each end and stopping against a back wall you can see.
  slab("bldg-north", -48, 48, SPOT_MAX_Z, 52, { shape: "flat", y: 15 }, "concrete", "brick2", -1),
  slab("bldg-south", -48, 48, -48, SPOT_MIN_Z, { shape: "flat", y: 13 }, "concrete", "brick", -1),
  slab("bldg-west-s", -50, SPOT_MIN_X, SPOT_MIN_Z, -4, { shape: "flat", y: 11 }, "concrete", "brick", -1),
  slab("bldg-west-n", -50, SPOT_MIN_X, 4, SPOT_MAX_Z, { shape: "flat", y: 12 }, "concrete", "brick", -1),
  // 12 m AND NOT 8, AND THAT IS A COLLISION NUMBER, NOT AN ARCHITECTURAL ONE.
  //
  // These two were the shortest bound in the level and the only one with a 70°
  // transition aimed straight at them down 45 m of straight asphalt, and a wall
  // only stops you while your probe is under its top. The ride's own ceiling
  // from a standing start with the throttle held is 18.66 m/s (measured over
  // every square metre of the block, 24 headings); off a 1.6 m bank at 70° with
  // an ollie on top that is an 9.4 m apex, against an 8 m wall that stops
  // blocking at 7.7. Swept at that speed BEFORE this change: the board crossed
  // both of these 1.00 m past the face and finished the run ROLLING on top of
  // the east one at (47.8, 8.00, 4.0) — where past x = 48 there is no solid in
  // this world at all. At 12 m — `bldg-west-n`'s own height, which is what an
  // alley's back wall is: the back of the same block — the apex is 2.3 m short.
  slab("alley-west-end", -48, -46, -4, 4, { shape: "flat", y: 12 }, "concrete", "brick", -1),
  slab("bldg-east-s", SPOT_MAX_X, 50, SPOT_MIN_Z, -4, { shape: "flat", y: 10 }, "concrete", "brick2", -1),
  slab("bldg-east-n", SPOT_MAX_X, 50, 4, SPOT_MAX_Z, { shape: "flat", y: 11 }, "concrete", "brick2", -1),
  slab("alley-east-end", 46, 48, -4, 4, { shape: "flat", y: 12 }, "concrete", "brick2", -1),
  // The fence stops short of the road: the alley is the one way you can SEE
  // out of the spot, and a fence across it would read as a lid.
  //
  // 3.0 m and not 2.4, for the same reason the alley ends moved: at 2.4 the
  // best ollie off the block pad's 0.55 m top reaches 2.10 m over the fence
  // line 8.8 m away, and `flight()` may land the board on anything it may be
  // let INTO — so 2.10 m was a board standing on top of the fence and then
  // rolling off the far side of it. Swept at the ride's own ceiling, the board
  // crossed the fence's whole 0.40 m thickness. 3.0 m needs 2.70 and nothing in
  // this spot within reach of it gets there; it is also just a taller site
  // fence, which is what a yard you are not meant to be in has.
  slab("fence", 34.8, 35.2, 6, 21, { shape: "flat", y: 3.0 }, "metal", "fence", 0),
];

// ---------------------------------------------------------------------------
// THE BLOCK'S LID — the one thing in this file with no triangles
// ---------------------------------------------------------------------------
//
// The player, in his own words: *"I also shouldn't fall through that back wall.
// So you can place some invisible colliders there."* This is that, and it is
// the smallest version of it that answers the whole class rather than the one
// wall he was standing at.
//
// WHAT THE DEFECT ACTUALLY IS, measured rather than assumed. `blocked()` is one
// rule — "the highest top here is above the board's probe" — and it is perfectly
// symmetric: it is a function of a height, not of an approach. Swept at 25 cm
// along the whole 220 m perimeter, on BOTH faces, at every height from -0.5 m
// up: the boundary is continuous everywhere at riding height. **And it STOPS at
// each building's own roofline** — 9.8 m on `bldg-east-s`, 10.8 on `bldg-west-s`,
// 11.8 on the alley ends, 14.8 on the north wall — because a roof is the top of
// a flat solid and there is nothing above a top. Over that line the wall is not
// solid from EITHER face, which is the honest reading of "solid from one side
// only": from the block it is brick to 10 m and open sky after, and from behind
// there is no floor, no wall and no world at all.
//
// That was 26 cm of margin. The launch sweep measures the ride's own apex at
// 9.54 m against a 10.0 m shortest bound, and this round makes the back
// transition 55% taller and near-vertical, which takes the apex past 10.8 m on
// purpose. So the roofline had to stop being the barrier.
//
// The fix is a LID, not a box: every brick solid gets an invisible twin on its
// own footprint, derived from it rather than declared again, standing far higher
// than the ride can physically reach. Two things make it honest:
//
// · **it is derived.** `BOUND_CAPS` maps the boundary solids themselves, so a
//   wall that moves takes its cap with it and there is no second copy of any
//   number to drift.
// · **it is not in `SPOT_SOLIDS`.** The mesh, the paint and the wear layer all
//   walk that list; `SOLIDS` — what the ride queries — is that list plus the
//   colliders. The street furniture has worked this way since it became matter,
//   so this is the file's existing seam and not a new kind of thing.
//
// And the fence is deliberately NOT capped. It is 15 m of chain link standing in
// the middle of the plaza, not a boundary: past it is more block. Capping it
// would put an invisible wall in the play space, which is the one thing an
// invisible collider must never be.
/**
 * How high a cap stands. Not a taste: the ride's own clamp is `MAX_ROLL_SPEED`
 * 26 m/s, and 26 m/s spent entirely on height is 26²/(2·17) = 19.9 m — the
 * highest apex this game's physics admits from any shape, before the ollie's
 * 1.57 m is added. 40 m is not quite twice that, and there is nothing to pay for
 * it: a flat top over the yHint is skipped by `resolve` in one comparison, so it
 * is invisible to `height()` and speaks only to `blocked()`.
 */
export const BOUND_CAP_Y = 40;
const BOUND_CAPS: readonly Solid[] = SPOT_SOLIDS.filter(
  (s) => s.look === "brick" || s.look === "brick2",
).map((s) =>
  makeSolid(
    `cap-${s.id}`,
    s.cx,
    s.cz,
    s.hx,
    s.hz,
    s.yaw,
    { shape: "flat", y: BOUND_CAP_Y },
    s.surface,
    s.look,
    s.profile.shape === "flat" ? s.profile.y : 0,
  ),
);

// ---------------------------------------------------------------------------
// the street furniture, as matter
// ---------------------------------------------------------------------------

export type PropKind = "dumpster" | "bench" | "bin" | "cone" | "lamp" | "hydrant";

/**
 * What a prop is made of, from the ride's point of view.
 *
 * The rule is the one the verifier asked for out loud: a cone you cannot knock
 * through is annoying, a dumpster you ride through is broken. So a cone is
 * SCENERY (null) and everything with mass is a box — sized to the model's own
 * silhouette, topped where you would actually land on it. Nothing here is a
 * "wall flag": these become ordinary Solids and go through the same `topOf` /
 * `blocked` rules as the architecture, which is why a bench top is a surface
 * you can ollie onto rather than an invisible stop.
 */
const PROP_BLOCK: Record<PropKind, { hx: number; hz: number; top: number } | null> = {
  // 2.1 x 1.1 m of steel against a wall. You land on the lid or you do not pass.
  dumpster: { hx: 1.05, hz: 0.58, top: 1.3 },
  // Topped at the SEAT, not the backrest — the seat is what you ollie onto.
  bench: { hx: 0.95, hz: 0.3, top: 0.45 },
  bin: { hx: 0.34, hz: 0.34, top: 0.92 },
  // The standard's base, not its arm: a lamp post is a 0.4 m obstacle at ground
  // level and 2 m of nothing over your head. Wider than the ride's 0.12 m
  // ground stride, so it cannot be stepped over in one frame at any speed.
  lamp: { hx: 0.2, hz: 0.2, top: 5.6 },
  hydrant: { hx: 0.22, hz: 0.22, top: 0.68 },
  cone: null,
};

/** A prop, placed on the plan. `y` is filled in from the floor under it. */
export interface Placement {
  x: number;
  z: number;
  yaw: number;
  /** Ground the prop stands on, resolved against the architecture alone. */
  y: number;
}

/**
 * Where the furniture lives. Hand-placed against the layout rather than
 * scattered: a bin in the middle of the main line is an obstacle nobody asked
 * for, and a dumpster tucked against the loading dock is what tells you it IS a
 * dock. Now that they are matter, "in the middle of the line" is not a look
 * problem any more — the lamp that used to stand in the mouth of the crossing
 * and the hydrant that stood in the west driveway are both off the tarmac.
 */
const PLACED: Record<PropKind, readonly { x: number; z: number; yaw: number }[]> = {
  dumpster: [
    // ON the dock rather than in front of it — at its old spot it stood square
    // in the mouth of the dock's own bank, which is the only way up there.
    { x: -28.5, z: 22, yaw: 0.1 },
    // …and the four that were parked against a wall have followed the wall out
    // by the four metres the block grew. A dumpster left at its old x is a
    // dumpster standing four metres out in the middle of the new footway.
    { x: 33.5, z: -8, yaw: -0.35 },
    { x: -33.5, z: 34, yaw: -0.15 },
    { x: 33.5, z: 30.5, yaw: 0.25 },
  ],
  bench: [
    // Held clear of the terrace's west ramp: a bench 1 m off the top of a 15 m
    // wide access ramp is a wall across everything the ramp exists to let up.
    { x: -24, z: -25, yaw: 0 },
    // Off the funbox, which is where this one used to stand.
    { x: 34.6, z: 15, yaw: Math.PI / 2 },
    { x: 10, z: -26, yaw: Math.PI },
    // These two are held off the stretches of wall that carry paint — a bench
    // standing a metre in front of a 5 m piece hides the bottom of it.
    { x: -17.5, z: -5.6, yaw: -Math.PI / 2 },
    { x: 33.5, z: -6, yaw: Math.PI / 2 },
  ],
  bin: [
    { x: -16.5, z: 4.8, yaw: 0 },
    { x: 15.5, z: 4.9, yaw: 0.6 },
    { x: -35.5, z: -22, yaw: 0 },
    { x: 18, z: -31, yaw: 1.2 },
    { x: -35.5, z: -14, yaw: 0.3 },
    { x: 34, z: 5.5, yaw: 1.9 },
  ],
  cone: [
    { x: -8.6, z: 5.4, yaw: 0 },
    { x: -7.2, z: 5, yaw: 0.4 },
    { x: -13.5, z: -6.5, yaw: 0.9 },
    { x: -12.2, z: -7.4, yaw: 0.2 },
    // Moved off the funbox's south bank toe, which is new ground under it.
    { x: 12, z: 20, yaw: 1.4 },
    { x: 26.5, z: 2.5, yaw: 0 },
    { x: -25, z: 24, yaw: 0.7 },
    { x: 8.5, z: -30, yaw: 2.1 },
    // Held off the transition and off the landing — both grew this round and
    // both used to have a cone standing on them.
    { x: -17, z: 20.5, yaw: 1.1 },
    { x: 15, z: 30, yaw: 0.3 },
    { x: -27.5, z: -8, yaw: 2.4 },
    { x: 23.5, z: 8.5, yaw: 0.8 },
  ],
  lamp: [
    { x: -19, z: 5.2, yaw: 0 },
    { x: 13, z: -5.2, yaw: Math.PI },
    // The three standards that lit the old wall line, out on the new one.
    { x: 33.6, z: 12, yaw: -Math.PI / 2 },
    { x: -35.4, z: -16.5, yaw: 0 },
    { x: 9.5, z: 5.3, yaw: 0 },
    { x: -35.6, z: 20, yaw: Math.PI / 2 },
  ],
  hydrant: [
    { x: -21.5, z: 4.9, yaw: 0 },
    { x: 26.5, z: -5, yaw: Math.PI },
    { x: 34, z: -33, yaw: -Math.PI / 2 },
  ],
};

/** Highest architecture top at or below `yHint` — the floor a prop stands on. */
function architectureTop(x: number, z: number): number {
  let best = 0;
  for (const s of SPOT_SOLIDS) {
    const top = topOf(s, x, z);
    // A prop never stands on a roof; the buildings are the bound, not a shelf.
    if (top !== null && top > best && top < 4) best = top;
  }
  return best;
}

/** The plan, with each prop stood on whatever the spot says is under it. */
function stand(kind: PropKind): readonly Placement[] {
  return PLACED[kind].map((p) => ({ ...p, y: architectureTop(p.x, p.z) }));
}

export const PLACEMENTS: Record<PropKind, readonly Placement[]> = {
  dumpster: stand("dumpster"),
  bench: stand("bench"),
  bin: stand("bin"),
  cone: stand("cone"),
  lamp: stand("lamp"),
  hydrant: stand("hydrant"),
};

// ---------------------------------------------------------------------------
// the CLUTTER — lane D's procedural library, stood on this spot
// ---------------------------------------------------------------------------
//
// Six generated models were the whole of this level's street furniture, which
// is why a plaza with graffiti on every shutter still read as a car park: a
// real block is not six objects, it is a hundred, and ninety of them are things
// nobody looks at. Posts. Meters. A cabinet. Bins. A hoarding. A tree in a
// grate. `src/world/procedural/` builds twenty families of exactly that, at two
// to five draw calls each, and this is where they get put.
//
// The placement rule is the same one the generated props already run on, and it
// is the reason the list below hugs the walls: **clutter belongs on the
// footway.** A skater's line is the plaza, the road and the obstacles; the
// pavement against a building is where a city keeps its stuff, so a prop there
// is scenery you ride PAST and never something you ride into. Every entry that
// carries a collider is on a footway, on the terrace, on the dock, or behind
// the fence — and `tools/spot-map.html` sweeps the whole spot for lanes that
// stop, so a prop that does block something shows up as a lane that died.
//
// Wall props (`mount: "wall"`) sit ON a building line and build their own
// height above the pavement — see the library's contract, point 1.

interface StreetPlaced {
  id: StreetPropId;
  x: number;
  z: number;
  yaw: number;
  /** Which variant. Omitted, it comes off the entry's index — stable per boot. */
  seed?: number;
}

/** …the same thing with its floor resolved. `props.ts` builds from THIS. */
export interface StreetPlacement extends Required<StreetPlaced> {
  y: number;
}

/** Facing, for a prop standing against each of the four building lines. */
const FACE_E = Math.PI / 2;
const FACE_W = -Math.PI / 2;
const FACE_N = 0;
const FACE_S = Math.PI;

const STREET_PLACED: readonly StreetPlaced[] = [
  // --- the west footway, and the wall behind it ----------------------------
  { id: "sign-post", x: -36.4, z: -30, yaw: FACE_E },
  { id: "tree-pit", x: -35.6, z: -25, yaw: FACE_N },
  { id: "utility-cabinet", x: -36.0, z: -18, yaw: FACE_E },
  { id: "bollard", x: -36.4, z: -12.0, yaw: FACE_N },
  { id: "bollard", x: -36.4, z: -10.4, yaw: FACE_N },
  { id: "bollard", x: -36.4, z: -8.8, yaw: FACE_N },
  { id: "parking-meter", x: -36.3, z: -6.8, yaw: FACE_E },
  // On the corner where the footway meets the road, which is where a street
  // name plate goes and nowhere else.
  { id: "street-name", x: -36.2, z: -5.2, yaw: FACE_N },
  { id: "mailbox", x: -36.2, z: 5.4, yaw: FACE_E },
  { id: "news-boxes", x: -36.0, z: 6.6, yaw: FACE_E },
  { id: "bike-rack", x: -36.2, z: 10.2, yaw: FACE_N },
  { id: "tree-pit", x: -35.6, z: 26.5, yaw: FACE_N },
  { id: "planter", x: -35.9, z: 30, yaw: FACE_N },
  // Held south of the back bank's toe, which is at z = 41.27 (see `BACK_TOE_Z`
  // — it moved south twice, 2.8 m when the bank got its apron and 1.1 m more
  // when the bank became a 3.4 m quarter pipe, then back north 12.6 cm when the
  // lip went to 88° and 19 cm more when the face became a flat panel): a stack of
  // pallets standing on a transition is a stack of pallets nobody stacked.
  { id: "pallets", x: -36.3, z: 33.5, yaw: 0.2 },
  { id: "standpipe", x: SPOT_MIN_X, z: -20, yaw: FACE_E },
  { id: "ac-unit", x: SPOT_MIN_X, z: -9, yaw: FACE_E },
  { id: "ac-unit", x: SPOT_MIN_X, z: 30, yaw: FACE_E },
  { id: "standpipe", x: SPOT_MIN_X, z: 33.5, yaw: FACE_E },

  // --- the east footway, and its wall --------------------------------------
  { id: "sign-post", x: 34.3, z: -30, yaw: FACE_W },
  { id: "tree-pit", x: 34.4, z: -24, yaw: FACE_N },
  { id: "wheelie-bin", x: 34.4, z: -18.0, yaw: FACE_W },
  { id: "wheelie-bin", x: 34.4, z: -16.6, yaw: FACE_W },
  // Site hoarding against the wall — 7.6 m of fly-posted plywood, which is a
  // whole wall of paper at skater height for the price of one prop.
  { id: "hoarding", x: 35.2, z: -10, yaw: FACE_W },
  { id: "parking-meter", x: 34.3, z: -12, yaw: FACE_W },
  { id: "barricade", x: 33.0, z: 8.5, yaw: FACE_N },
  { id: "bollard", x: 34.4, z: 26.0, yaw: FACE_N },
  { id: "bollard", x: 34.4, z: 27.6, yaw: FACE_N },
  { id: "bollard", x: 34.4, z: 29.2, yaw: FACE_N },
  { id: "planter", x: 34.4, z: 33, yaw: FACE_N },
  { id: "crates", x: 34.6, z: -27, yaw: 0.7 },
  { id: "ac-unit", x: SPOT_MAX_X, z: -20, yaw: FACE_W },
  { id: "standpipe", x: SPOT_MAX_X, z: -14, yaw: FACE_W },
  { id: "ac-unit", x: SPOT_MAX_X, z: 30, yaw: FACE_W },

  // --- the street itself: the two kerb lines --------------------------------
  //
  // The signals' mast arms have to reach OVER the carriageway, and the library
  // builds a prop's arm along its own local x — so the yaw that points it at
  // the road is the one that turns local +x onto -z (and +z for the far kerb),
  // not the one that faces the prop at it.
  { id: "traffic-light", x: 13.5, z: 5.8, yaw: FACE_E },
  { id: "traffic-light", x: -4.5, z: -5.8, yaw: FACE_W },
  { id: "bus-stop", x: -17.5, z: 5.9, yaw: FACE_S },
  { id: "street-name", x: 16.3, z: 5.9, yaw: FACE_S },
  { id: "news-boxes", x: -22, z: -5.6, yaw: FACE_S },
  { id: "mailbox", x: 5, z: -5.6, yaw: FACE_S },
  // Pavement hatches — 90 mm of ridge, no collider, and the ride rolls over
  // them. They are here because a footway with nothing IN it is a ribbon.
  { id: "cellar-door", x: -20, z: -5.4, yaw: FACE_N },
  // …on the footway and NOT in a dropped kerb: at x = 22 this one landed on the
  // east driveway apron, which is the one piece of pavement in the level that
  // falls two ways at once, and a steel hatch was lying at 8° across it.
  { id: "cellar-door", x: 12, z: 5.6, yaw: FACE_N },
  { id: "tree-pit", x: -8, z: -5.9, yaw: FACE_N },
  { id: "tree-pit", x: 24, z: -5.9, yaw: FACE_N },

  // --- the terrace, which is 52 m of concrete you cannot avoid looking at ---
  { id: "bike-rack", x: -20, z: -28, yaw: FACE_N },
  { id: "planter", x: -14, z: -30, yaw: FACE_N },
  { id: "planter", x: 14, z: -30, yaw: FACE_N },
  { id: "utility-cabinet", x: 20, z: -29, yaw: FACE_N },
  { id: "crates", x: -26, z: -30, yaw: 0.5 },

  // --- the loading dock, which is what a loading dock has on it -------------
  { id: "pallets", x: -31, z: 15, yaw: 0.15 },
  { id: "pallets", x: -29, z: 24, yaw: -0.3 },
  { id: "crates", x: -32.5, z: 20, yaw: 0.6 },
  { id: "crates", x: -36.3, z: 19, yaw: -0.2 },

  // --- behind the chain link: the yard you can see into and not ride --------
  { id: "wheelie-bin", x: 36.3, z: 9, yaw: FACE_W },
  { id: "pallets", x: 36.2, z: 14, yaw: 0.3 },
  { id: "crates", x: 36.3, z: 18, yaw: 0.9 },
];

export const STREET_PLACEMENTS: readonly StreetPlacement[] = STREET_PLACED.map((p, i) => ({
  ...p,
  seed: p.seed ?? i * 7 + 3,
  y: architectureTop(p.x, p.z),
}));

/** The colliders, from the SAME placements the props are drawn from. */
const PROP_SOLIDS: readonly Solid[] = (Object.keys(PLACEMENTS) as PropKind[]).flatMap((kind) => {
  const box = PROP_BLOCK[kind];
  if (!box) return [];
  return PLACEMENTS[kind].map((p, i) =>
    makeSolid(
      `prop-${kind}-${i}`,
      p.x,
      p.z,
      box.hx,
      box.hz,
      p.yaw,
      { shape: "flat", y: p.y + box.top },
      // Steel and cast iron, so the wheels sound right if you land on one.
      kind === "bench" ? "wood" : "metal",
      "metal",
      p.y,
    ),
  );
});

/**
 * …and the clutter's, on exactly the same terms.
 *
 * A prop the library calls scenery (`collider: null` — a cone, a stack of
 * crates, a pavement hatch) contributes nothing here and is knocked through,
 * which is the rule this file already settled on for traffic cones. Everything
 * else becomes an ordinary Solid and goes through `topOf` and `blocked` like
 * the architecture does, so a utility cabinet is a 1.44 m ledge you can ollie
 * onto rather than an invisible stop.
 */
const CLUTTER_SOLIDS: readonly Solid[] = STREET_PLACEMENTS.flatMap((p, i) => {
  const box = STREET_PROPS[p.id].collider;
  if (!box) return [];
  return [
    makeSolid(
      `clutter-${p.id}-${i}`,
      p.x,
      p.z,
      box.hx,
      box.hz,
      p.yaw,
      { shape: "flat", y: p.y + box.top },
      // Steel, cast iron and precast all sound like the street furniture they
      // are; nothing in the library is a surface you would call soft.
      p.id === "pallets" || p.id === "hoarding" || p.id === "barricade" ? "wood" : "metal",
      "metal",
      p.y,
    ),
  ];
});

/**
 * Everything the ride can hit: the built spot, the furniture standing on it, and
 * the boundary's own invisible lid.
 *
 * `BOUND_CAPS` is declared AFTER the real walls on purpose. Every consumer that
 * asks "which bound is this point over" takes the first match — the sweep's
 * `inBound` does — and the answer a reader wants is the brick they can see, not
 * the collider over it.
 */
export const SOLIDS: readonly Solid[] = [
  ...SPOT_SOLIDS,
  ...PROP_SOLIDS,
  ...CLUTTER_SOLIDS,
  ...BOUND_CAPS,
];

const BY_ID = new Map<string, Solid>(SOLIDS.map((s) => [s.id, s]));

function solid(id: string): Solid {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`[spot] no solid "${id}"`);
  return s;
}

// ---------------------------------------------------------------------------
// the rails
// ---------------------------------------------------------------------------

/**
 * A grind line lying ON a solid, given the two world points its ends are over.
 * The heights come from the solid itself, so moving a ledge moves its grind
 * line with it — the class of bug where a rail hangs 20 cm off the concrete it
 * is drawn on simply cannot be written here.
 */
function ledgeOn(id: string, on: string, ax: number, az: number, bx: number, bz: number): GrindLine {
  const s = solid(on);
  const ay = topOf(s, ax, az);
  const by = topOf(s, bx, bz);
  if (ay === null || by === null) throw new Error(`[spot] rail "${id}" runs off "${on}"`);
  return {
    id,
    a: new THREE.Vector3(ax, ay, az),
    b: new THREE.Vector3(bx, by, bz),
    kind: "ledge",
    surface: s.surface,
    radius: id.startsWith("kerb") ? 0.26 : 0.42,
  };
}

/** A round bar on posts. Not a surface — you grind it or you ollie it. */
function bar(
  id: string,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  radius = 0.34,
): GrindLine {
  return {
    id,
    a: new THREE.Vector3(ax, ay, az),
    b: new THREE.Vector3(bx, by, bz),
    kind: "rail",
    surface: "metal",
    radius,
  };
}

/**
 * Long edge of a yawed slab, on the given local side.
 *
 * Held a hair inside its own footprint. Round-tripping a corner through a
 * rotation lands it a float either side of the boundary, and the version that
 * ran to the exact corner threw on its first pass through the harness. The
 * inset is also the truer line: nobody grinds the last centimetre of a ledge.
 */
function yawedEdge(id: string, on: string, side: 1 | -1): GrindLine {
  const s = solid(on);
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  const v = (s.hz - 0.002) * side;
  const u = s.hx - 0.05;
  return ledgeOn(id, on, s.cx + sn * v - c * u, s.cz + c * v + sn * u, s.cx + sn * v + c * u, s.cz + c * v - sn * u);
}

/** How high a handrail stands over the nosing it follows. */
const RAIL_STAND = 0.75;

/**
 * A coping: the bar bolted along a transition's lip, read off the transition.
 *
 * `bar` takes two endpoints and this is the one line in the spot whose
 * endpoints are somebody else's — the steel runs the full width of the pipe it
 * is bolted to, at the pipe's own lip, so a quarter pipe that moves takes its
 * coping with it.
 */
function coping(id: string, on: string, z: number, y: number, radius: number): GrindLine {
  const s = solid(on);
  return bar(id, s.cx - s.hx, y, z, s.cx + s.hx, y, z, radius);
}

/** How proud of the deck the coping steel stands — and where the trucks sit. */
export const COPING_STAND = 0.03;
/**
 * …and how close the trucks have to pass to catch it. Half a handrail's, and
 * that is the point: a handrail is a thing you aim at down a stair set, a
 * coping is a thing you are always within arm's reach of while you are on the
 * transition. You have to genuinely put the trucks on it.
 */
const COPING_CATCH = 0.18;

export const RAILS: readonly GrindLine[] = [
  // The 6-stair, three ways: down the rail, down the hubba, or over the lot.
  bar("handrail-6", -12, 1.15 + RAIL_STAND, -14.2, -12, RAIL_STAND, -10.6, 0.38),
  ledgeOn("hubba-6", "hubba", -4.4, -13.9, -4.4, -10.5),
  // The rest of the platform's north edge is an 1.15 m drop you can also grind
  // along — the "ledge" every plaza has because a plaza has an edge.
  ledgeOn("platform-lip", "platform", 6, -14, 24, -14),

  // Stops at 16.5, not 20: the quarter pipe's toe moved south to 17.5 to buy
  // its landing a run-out, and a flat bar running on past it would be a rail
  // standing inside the transition.
  bar("flat-bar", -12, 0.35, 8, -12, 0.35, 16.5, 0.32),
  ledgeOn("ledge-long-e", "ledge-long", -20, 6.2, -20, 19.8),
  ledgeOn("ledge-long-w", "ledge-long", -22, 6.2, -22, 19.8),
  yawedEdge("ledge-angled-ne", "ledge-angled-ne", -1),
  yawedEdge("ledge-angled-sw", "ledge-angled-sw", 1),

  // The pad's SIDE edges, not its ends — both ends are banks now, and the top
  // of a bank is a crest, not an arris. These two are what a manny pad is
  // actually grinded on anyway: you come across it and take a side.
  ledgeOn("manual-pad-w", "manual-pad", -6, MANNY_S + 0.2, -6, MANNY_N - 0.2),
  ledgeOn("manual-pad-e", "manual-pad", 6, MANNY_S + 0.2, 6, MANNY_N - 0.2),

  // The kerbs. Short radius on purpose — a kerb is 12 cm of concrete and it
  // should only catch you when you genuinely put the trucks on it, not every
  // time a landing happens to come down near the road.
  // …and they stop at the driveways, because a dropped kerb has no arris. Each
  // run is read off the footway strip it lies on — the strips ARE the pavement
  // between one crossing point and the next, so a driveway that moves takes the
  // kerb run beside it with it and neither can be edited without the other.
  ledgeOn("kerb-n-w", "footway-n-c", DRIVE_W[1] + 0.4, 4, DRIVE_C[0] - 0.4, 4),
  ledgeOn("kerb-n-c", "footway-n-e", DRIVE_C[1] + 0.4, 4, -3.2, 4),
  ledgeOn("kerb-n-e", "footway-n-e", 7.2, 4, DRIVE_E[0] - 0.4, 4),
  ledgeOn("kerb-n-ee", "footway-n-ee", DRIVE_E[1] + 0.4, 4, SPOT_MAX_X - 2, 4),
  ledgeOn("kerb-s-w", "footway-s-c", DRIVE_W[1] + 0.4, -4, DRIVE_C[0] - 0.4, -4),
  ledgeOn("kerb-s-c", "footway-s-e", DRIVE_C[1] + 0.4, -4, -3.2, -4),
  ledgeOn("kerb-s-e", "footway-s-e", 7.2, -4, DRIVE_E[0] - 0.4, -4),
  ledgeOn("kerb-s-ee", "footway-s-ee", DRIVE_E[1] + 0.4, -4, SPOT_MAX_X - 2, -4),
  ledgeOn("block-pad-w", "block-pad", 14, 9.2, 14, 17.8),
  bar("handrail-3", 20, 0.55 + 0.6, 17.9, 20, 0.6, 19.75, 0.35),

  // The funbox's two long sides. Both ENDS are banks, so — exactly as on the
  // manual pad — the grindable edges are the sides you come across and take.
  ledgeOn("funbox-w", "funbox", FUNBOX_W, 25.2, FUNBOX_W, 29.8),
  ledgeOn("funbox-e", "funbox", FUNBOX_E, 25.2, FUNBOX_E, 29.8),

  ledgeOn("dock-edge", "dock", -26, 12.2, -26, 25.8),

  // THE COPING IS A LINE AGAIN, and the three guards it was waiting for are all
  // in. It was pulled because a lock-on is a distance test and a board riding UP
  // the transition passes through the lip by definition, so the line ate every
  // launch the quarter pipe had — 10.73 m/s became 1.49 in one step. What was
  // missing was never a radius; it was somebody able to say "on the way up".
  // Three separate places now do:
  // · the Grinder declines a GROUNDED frame outright, and pumping up a
  //   transition is grounded for every metre of it;
  // · `takeOff` clears `catchWhileRising`, so an air the transition CREATED is
  //   never offered a line until it is on its way back down — that rule was
  //   written for this exact coping;
  // · and the Grinder throws out a climbing flight, and a deck laid across a
  //   line while still rising.
  // So the catch that "cannot fire on the way up" exists, and the marquee move
  // is measured against it rather than trusted: `w4/p8-coping.mjs` pumps the
  // transition at 6…16 m/s, drops in off the deck, and comes down onto the lip
  // out of an air, and only the last of those may come back a grind.
  coping("coping", "qp", QP_LIP_Z, QP_HEIGHT + COPING_STAND, COPING_CATCH),
  // AND THE NORTH WALL GETS THE ONE IT HAS BEEN OWED SINCE ROUND SIX. It was
  // written down as "proposed, not done" then, on the grounds that it adds a
  // line to an already-red catchability check — which is a cost, not a reason:
  // the ramp had no line on it ANYWHERE, so the top of a 3.4 m transition rolled
  // over into the deck with nothing to read it against, and in a capture it looks
  // like a soft mound rather than a ramp. A box ramp reads as a box ramp because
  // of the crisp edge at the top of it.
  //
  // Off the lip, like the quarter pipe's, so it cannot drift off the concrete —
  // and `coping()` takes its ends from the solid, which here is the full 77 m
  // width. Three things follow from that and none of them is a surprise:
  // · it is BOLTED, not a fence. `rail-steel.ts` calls a bar steel you can hit
  //   only when it stands `BOLTED_ON` = 0.25 m clear of what it runs over, and
  //   this clears `COPING_STAND` = 0.03 — so it is drawn (with no posts) and
  //   grindable, and it is nothing at all to `advance()`. The launch cannot be
  //   eaten by it.
  // · a catch needs the E key on this ramp, in practice always. `grind.ts`
  //   declines any GROUNDED frame, so pumping up the face can never lock on; what
  //   is left is coming down onto the lip out of an air, and an air off this
  //   transition arrives heading north — SQUARE across a line that runs east-west,
  //   which is `squareEntry`, which still waits to be asked. Riding ALONG it
  //   takes no key by round-11 rules, and reaching it along its own axis means
  //   being airborne within 0.18 m of a line at the top of the ramp.
  // · and it is a 45th line, so `collide-sweep`'s "every grind line can be
  //   caught" gets one more row it cannot generate an approach for. That check is
  //   already red on 43 spillway lines; this makes 44. Reported, not hidden.
  coping("back-coping", "back-trans", BACK_LIP_Z, BACK_HEIGHT + COPING_STAND, COPING_CATCH),
];

// ---------------------------------------------------------------------------
// the provider
// ---------------------------------------------------------------------------

/** Where a run starts: on the platform, pointed straight down the bank. */
export const SPOT_SPAWN = { x: 2, z: -24, heading: 0 };

/** Floor of last resort — a query that lands on no solid at all. */
const VOID_Y = 0;

/**
 * Scratch for `StreetSpot.resolve` — one query at a time, same idiom as
 * `_local`. `inside` means the point is in solid matter, not on a surface.
 */
const _hit = { solid: null as Solid | null, y: 0, inside: false };

export class StreetSpot implements SurfaceProvider {
  private readonly solids = SOLIDS;

  /**
   * Which solid this query lands on and what height to answer with. Writes
   * `_hit` and returns whether it found anything at all.
   *
   * Takes the highest top at or below `yHint` — and on a TIE, the one declared
   * last. That tie-break is what makes a seam ride: the bank meets the platform
   * at exactly 1.15 m, and taking the platform there handed back a flat normal
   * for one frame at the top of every drop-in.
   *
   * A NON-FLAT solid ignores the cap. `yHint` exists to choose between stacked
   * floors — the pavement and the ledge top above it — and a ramp has no floor
   * under it to choose: you reach it from its toe or you do not reach it. Left
   * capped, a transition rejected ITSELF the moment it got steep: the ride
   * probes one stride ahead with the hint it has now, a 45° stride climbs more
   * than the hint's clearance, the arc drops out of the running, the plaza
   * underneath answers instead, and the ride reads a floor that fell away and
   * launches. Measured: it fired at 34° at 13 m/s, which is most of a quarter
   * pipe. With the cap lifted the same run climbs the transition and comes back
   * down it.
   *
   * Nothing at or below the hint means the point is INSIDE something — a wall,
   * a building, the fence — and there is ONE answer to that, the same one for
   * everybody who asks: nothing here holds you up. Three were tried:
   * · "the roof" — what it answered first. `height(0, 30.5, hint 0.5)` came back
   *   15, so a ragdoll limb that tumbled into a building footprint at knee
   *   height was told to stand on the roof, and its bones stretched the fifteen
   *   metres to get there.
   * · "the hint" — no drop, which is what a lookahead wants to hear, and a
   *   catastrophe for anything asking what holds it up: the answer TRACKS the
   *   asker, so a ragdoll limb inside a wall was handed a floor 5 cm above where
   *   it was every substep and climbed the inside of the building a step at a
   *   time. Measured: a particle at y = 1 inside `bldg-west-n` reached y = 5.0 in
   *   a sixth of a second, and that is the ratchet that put bodies on roofs.
   *   `height()` shipped answering this, documented as the rule for lookaheads
   *   rather than removed, and a rule that is wrong for one caller is wrong.
   * · the street underneath, capped so it can never be a floor ABOVE the asker.
   *   Under the road slab "ground level" is over your head, and a body that has
   *   fallen through the world has to keep falling rather than be flicked back
   *   up onto it. This is the answer, for `height` and `sample` alike.
   *
   * What made the hint look necessary was a different bug, and it is fixed
   * where it lives: every floor stopped on the exact line its wall started on,
   * so the ride's own one-stride lookahead fell off the world a stride before
   * the brick and read a floor that was not there as a drop to launch from. The
   * floors run on under the walls now (`WALL_TUCK`), so from anywhere the wheels
   * can reach there is ground under the probe and this branch is never taken.
   */
  private resolve(x: number, z: number, yHint: number): boolean {
    let best: Solid | null = null;
    let bestY = -Infinity;
    // …and the lowest top of anything here at all, for when nothing passes.
    let inside: Solid | null = null;
    let insideY = Infinity;
    for (const s of this.solids) {
      const top = topOf(s, x, z);
      if (top === null) continue;
      if (top < insideY) {
        inside = s;
        insideY = top;
      }
      if (s.profile.shape === "flat" && top > yHint) continue;
      if (top < bestY) continue;
      best = s;
      bestY = top;
    }
    if (best) {
      _hit.solid = best;
      _hit.y = bestY;
      _hit.inside = false;
      return true;
    }
    if (inside) {
      _hit.solid = inside;
      _hit.y = Math.min(VOID_Y, yHint);
      _hit.inside = true;
      return true;
    }
    return false;
  }

  /**
   * How high the floor is here — and inside solid matter there is no floor at
   * that height, whoever is asking. See `resolve`: one answer, and `sample`
   * next door hands back the same one.
   */
  height(x: number, z: number, yHint = Infinity): number {
    return this.resolve(x, z, yHint) ? _hit.y : VOID_Y;
  }

  normal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    // No hint: a normal is asked for by things that want the surface itself,
    // and with the cap lifted a point can never be inside anything.
    return this.resolve(x, z, Infinity) && _hit.solid
      ? normalOf(_hit.solid, x, z, out)
      : out.set(0, 1, 0);
  }

  /**
   * What is under THIS point — height, tilt and material in one query.
   *
   * A body asks this of every joint every substep, and inside solid matter the
   * honest answer is that nothing here holds you up: a wall standing on the
   * street supports you at the street, not at whatever height you happen to be
   * wedged at. `resolve` has already worked that out; this only adds the tilt.
   */
  sample(x: number, z: number, yHint = Infinity, out = makeSample()): SurfaceSample {
    if (!this.resolve(x, z, yHint) || !_hit.solid) {
      out.height = VOID_Y;
      out.normal.set(0, 1, 0);
      out.kind = "concrete";
      return out;
    }
    out.kind = _hit.solid.surface;
    if (_hit.inside) {
      out.height = _hit.y;
      // No top face to stand on means no tilt to hand back either — the deck
      // stays level rather than laying itself onto a roof it is nowhere near.
      out.normal.set(0, 1, 0);
      return out;
    }
    out.height = _hit.y;
    normalOf(_hit.solid, x, z, out.normal);
    return out;
  }

  /**
   * Grade along a direction, taken from the ANALYTIC normal of the solid the
   * board is on rather than by differencing two heights. A finite difference
   * has to pick a lookahead, and every lookahead is wrong somewhere: short
   * enough to read a coping is too short to see a bank, and long enough to see
   * a bank steps off the ledge in front of it and reports a cliff.
   */
  slopeAlong(x: number, z: number, dirX: number, dirZ: number, yHint = Infinity): number {
    // Inside a wall there is no grade to climb — the wall test is what stops
    // you there, not a slope that costs you speed.
    if (!this.resolve(x, z, yHint) || !_hit.solid || _hit.inside) return 0;
    normalOf(_hit.solid, x, z, _slopeN);
    // Height gradient of a plane with normal n is (-n.x/n.y, -n.z/n.y).
    return -(_slopeN.x * dirX + _slopeN.z * dirZ) / Math.max(1e-4, _slopeN.y);
  }

  rails(): readonly GrindLine[] {
    return RAILS;
  }

  /** One rule: is anything here standing taller than the board's probe. */
  blocked(x: number, z: number, y: number): boolean {
    for (const s of this.solids) {
      const top = topOf(s, x, z);
      if (top !== null && top > y) return true;
    }
    return false;
  }

  spawn(): { x: number; z: number; heading: number } {
    return SPOT_SPAWN;
  }
  // No `softEdge`: the buildings are the bound. Nothing steers you back here.
}

const _slopeN = new THREE.Vector3();

/** The world the game rides on. */
export const STREET_SPOT: SurfaceProvider = new StreetSpot();

// ---------------------------------------------------------------------------
// the mesh — the same profile, walked instead of sampled
// ---------------------------------------------------------------------------

/**
 * A point on a solid's top profile, in its own (v, y) plane.
 *
 * Exported with `topPolyline` below because the WEAR LAYER has to lie on the
 * same points the mesh is built from. `props.ts` used to lay dirt, oil and
 * rubber only on flat tops — the one branch in `buildPaint` that reads
 * `shape !== "flat"` — so every ramp, bank and transition in the level was the
 * one surface with nothing on it but light. A wear quad generated from its own
 * idea of where a 70° arc is would either float or sink; generated from these,
 * it cannot.
 */
export interface ProfilePoint {
  /** 0→1 along local +z. */
  t: number;
  y: number;
  /** Outward normal of the segment STARTING here, in the local (v, y) plane. */
  ny: number;
  nv: number;
}

/**
 * How far a chord may sag under the circle it approximates, metres.
 *
 * The bar the 20-chord arc below already meets — 20 steps over the quarter
 * pipe's 65° at r = 4.50 is 1.8 mm — written down as a number so a curl of any
 * radius can be stepped to the same PICTURE instead of to a segment count that
 * means nothing without its radius beside it.
 */
const CHORD_SAG = 0.002;

/**
 * The top of a solid as a polyline. A stair's risers are points that repeat `t`
 * with two different `y` — a zero-width segment the strip turns into a vertical
 * face for free, which is why there is no special stair mesher.
 */
export function topPolyline(s: Solid): ProfilePoint[] {
  const p = s.profile;
  if (p.shape === "flat") {
    return [
      { t: 0, y: p.y, ny: 1, nv: 0 },
      { t: 1, y: p.y, ny: 1, nv: 0 },
    ];
  }
  // The apron's polyline is its CENTRE line — `meshSolid` scales each column's
  // fall by the same `flareAt` the query uses, so the two cannot disagree.
  if (p.shape === "ramp" || p.shape === "apron") {
    const g = (p.y1 - p.y0) / (2 * s.hz);
    const inv = 1 / Math.hypot(1, g);
    return [
      { t: 0, y: p.y0, ny: inv, nv: -g * inv },
      { t: 1, y: p.y1, ny: inv, nv: -g * inv },
    ];
  }
  if (p.shape === "stairs") {
    // Risers face DOWNHILL — that is the face you see standing at the bottom.
    const down = p.y1 < p.y0 ? 1 : -1;
    const pts: ProfilePoint[] = [];
    let prev = p.y0;
    for (let i = 0; i < p.steps; i++) {
      const y = p.y0 + ((p.y1 - p.y0) * (i + 1)) / p.steps;
      pts.push({ t: i / p.steps, y: prev, ny: 0, nv: down });
      pts.push({ t: i / p.steps, y, ny: 1, nv: 0 });
      prev = y;
    }
    pts.push({ t: 1, y: prev, ny: 1, nv: 0 });
    return pts;
  }
  // The transition is the one place the mesh only APPROXIMATES the query: it is
  // a chord polyline against a real circle. Stepped by ANGLE, not by ground
  // distance — the first version stepped `t` evenly and the segments near the
  // lip each spanned most of a metre of rise, which measured 45 mm of sag off
  // the true arc. Even angle spreads it: 20 steps over 79° is 1.9 mm, under the
  // board's own clearance.
  const run = arcRun(p);
  // A KICKED BANK IS TWO SEGMENTS' WORTH OF POLYLINE AND THAT IS THE FIX ITSELF:
  // one chord for the whole panel, then the curl. `meshSolid` and the wear layer
  // both take ONE flat normal per segment (from `p0`), so a 20-chord arc renders
  // as 20 flat facets — 20 brightness bands across the face, which is what the
  // player was looking at when he called this ramp "uneven". A plane is one
  // facet however big it is, so the bands cannot exist on it.
  //
  // The curl is stepped to the same SAG the pure arc's 20 chords are: a chord's
  // sag off its own circle is r·(1 − cos(Δθ/2)), and 20 steps over the quarter
  // pipe's 65° comes to 1.8 mm, so 2 mm is that bar written as a number. On the
  // north wall's 1.18 m curl through 48° it buys 8 chords, each 0.1 m of face.
  if (p.panel) {
    const k = kickOf(p.radius, p.height, p.panel, p.vert);
    const inv = k.cosIn;
    const pts: ProfilePoint[] = [{ t: 0, y: 0, ny: inv, nv: -p.panel.grade * inv }];
    const thIn = Math.atan2(k.sinIn, k.cosIn);
    const span = Math.atan2(k.sinLip, k.cosLip) - thIn;
    const segs = Math.max(2, Math.ceil(span / (2 * Math.acos(1 - CHORD_SAG / p.radius))));
    for (let i = 0; i <= segs; i++) {
      const th = thIn + (span * i) / segs;
      const d = k.cv + p.radius * Math.sin(th);
      // The chord's own normal, read on the SURFACE at its foot — the panel's
      // grade at the tangent point, the circle's after it, the lip's on the
      // last one, which is what makes the straight lip one facet.
      const g = profileGrade(p, d / run, s.hz);
      const gi = 1 / Math.hypot(1, g);
      pts.push({ t: d / run, y: k.cy - p.radius * Math.cos(th), ny: gi, nv: -g * gi });
    }
    if (k.vertRun > 0) {
      const gi = 1 / Math.hypot(1, k.lipGrade);
      pts.push({ t: 1, y: p.height, ny: gi, nv: -k.lipGrade * gi });
    }
    return pts;
  }
  const segs = 20;
  const thetaMax = Math.acos(Math.max(-1, 1 - p.height / p.radius));
  const pts: ProfilePoint[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = (p.radius * Math.sin((thetaMax * i) / segs)) / run;
    const g = profileGrade(p, t, s.hz);
    const inv = 1 / Math.hypot(1, g);
    pts.push({ t, y: profileY(p, t), ny: inv, nv: -g * inv });
  }
  return pts;
}

/** Triangle soup being built for one material. */
export interface MeshBuffers {
  pos: number[];
  nor: number[];
  uv: number[];
}

function buffers(): MeshBuffers {
  return { pos: [], nor: [], uv: [] };
}

/**
 * Local (u, y, v) → world, through the solid's placement.
 *
 * Exported as `solidPoint`: anything that draws ON a solid's top — the wear
 * layer next door, and whatever comes after it — has to land on the same frame
 * the triangles do, and a second copy of this rotation in another file is the
 * kind of thing that ends up half a degree out and nobody can see why.
 */
function place(s: Solid, u: number, y: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  return out.set(s.cx + c * u + sn * v, y, s.cz - sn * u + c * v);
}
export { place as solidPoint };

const _p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _n = new THREE.Vector3();

/** a→b→c→d, wound so the given normal is the front face. */
function quad(
  m: MeshBuffers,
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
  for (let i = 0; i < 6; i++) {
    m.uv.push(uv[uvOrder[i * 2]], uv[uvOrder[i * 2 + 1]]);
  }
}

/**
 * World metres per texture tile, per material. Never hand-picked per mesh —
 * and sized against what the generated image ALREADY contains: the brick
 * basecolor is a whole wall of brick, so tiling it every 3 m built a moiré you
 * could see from the spawn. One tile is one storey.
 */
/**
 * …and every number in it is now read off the IMAGE rather than guessed.
 *
 * This is half of "some of the textures just look bad", and it is the half that
 * is not the texture's fault. Each generated surface contains a countable
 * number of real-world features — 4 x 4 slabs, 22 courses of brick, two
 * crack-seal blocks — so the tile is that count times the size of the thing in
 * life. Get it wrong and a perfect photograph of brick renders as breeze-block:
 * the old 9 m brick tile spread 22 courses over 9 metres, which is a 41 cm
 * course, and the wall stopped being masonry.
 */
/**
 * Exported because the grain layer in props.ts has to speak this file's UV
 * space: `meshSolid` writes world metres over TILE into the UVs, so the only
 * way to ask for a 0.9 m aggregate pitch on the material is `TILE / 0.9`. A
 * second copy of these numbers in props.ts is a second chance to get a floor's
 * scale wrong, and getting a floor's scale wrong is what the whole comment
 * above is about.
 */
export const TILE: Record<LookKey, number> = {
  // 4 x 4 bays in the image; a poured plaza bay is about 1.8 m.
  concrete: 7.2,
  // 4 x 4 panels; a footway panel is about 1.25 m — which is also what makes
  // the pavement read as SMALLER than the plaza beside it, and that difference
  // in grain is most of what tells the two apart from a moving board.
  sidewalk: 5,
  // Two crack-seal blocks across the image, and a real one is about 4 m.
  asphalt: 8,
  // 4.5, and it was 8 — "big on purpose, so a transition reads as one
  // continuous pour". It read as one continuous NOTHING.
  //
  // The 4 x 4 cells in that image are TROWEL PASSES, not saw-cut bays: a power
  // float is about 1.1 m across and that is the size of the swirl in the
  // photograph, so 4.5 m is the honest reading of it and 8 was stretching a
  // 1.1 m feature to 2. And 4.5 is under the length of the thing that has to
  // show it: the quarter pipe's transition is 5.1 m of arc from toe to lip, so
  // at 8 it never completed a single tile — what you saw from the deck of the
  // board was one smooth region of one cell of one image, wrapped round a 65°
  // curve, which is exactly the "one wide swirl and nothing else" the surface
  // came back as. Every transition in the level now crosses at least one whole
  // tile, joints included.
  park: 4.5,
  // A precast ledge block is about 1.25 m long, and the footway image is a
  // grid of exactly that — so a ledge's joints land where the block joints in a
  // real plaza ledge do.
  ledge: 5,
  // 22 courses to the image, so a 1.75 m tile is life size. It is 2.2 —
  // one part in four generous, on purpose and measured: at 1.75 a 75 mm course
  // is under two screen pixels on the west wall from the middle of the plaza,
  // which is where the mip chain stops resolving courses and starts handing
  // back red noise. That is the "128 px mud" the art direction fails a capture
  // for, and it is not a resolution problem — the image is 4096. 2.2 puts a
  // course at 95 mm and three pixels, which reads as brick from a board and is
  // still masonry when you stand next to it.
  //
  // It was NINE, sized to hide a big black tag baked into the old basecolor.
  // The tag is gone from this one; the per-solid UV phase (`brickPhase`, below)
  // stays, because four blocks starting the same photograph at the same brick
  // is still a tell.
  brick: 2.2,
  brick2: 2.2,
  metal: 2,
  // Seven diamonds to the tile, so this IS the mesh size: 8 cm links, which is
  // what chain link actually measures. It used to be 1.2 m here AND a
  // `repeat.set(30, 2)` on the material on top of it — 25 tiles per metre of
  // fence, which renders as grey aliasing and nothing else.
  fence: 0.55,
};

/**
 * Emit one solid: its top, the two long skirts, and the two end caps. Every
 * vertex comes out of `topPolyline`, which is generated from the same profile
 * `topOf()` evaluates — that shared origin is the whole point of this file.
 */
/**
 * A per-solid UV phase, in tiles, for the two brick looks and nothing else.
 *
 * Four blocks sharing one photograph of a wall used to start that photograph at
 * the same place on all four, so the same tag appeared at the same height on
 * every side of the plaza. The shift is hashed off the solid's own id, so it is
 * stable across boots and moves with the solid. Only brick: shifting the
 * concrete would put a saw-cut joint mismatch across every seam in the plaza,
 * and the plaza's seams are supposed to line up.
 */
function brickPhase(s: Solid): { u: number; v: number } {
  if (s.look !== "brick" && s.look !== "brick2") return { u: 0, v: 0 };
  let h = 2166136261;
  for (let i = 0; i < s.id.length; i++) h = Math.imul(h ^ s.id.charCodeAt(i), 16777619);
  return { u: ((h >>> 8) & 255) / 256, v: ((h >>> 20) & 255) / 256 };
}

export function meshSolid(s: Solid, m: MeshBuffers): void {
  const pts = topPolyline(s);
  const tile = TILE[s.look];
  const phase = brickPhase(s);
  const uvFrom = m.uv.length;
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  const vAt = (t: number): number => -s.hz + t * 2 * s.hz;

  // Arc length along the profile, so a ramp's texture does not stretch.
  const arc: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    arc.push(arc[i - 1] + Math.hypot(vAt(pts[i].t) - vAt(pts[i - 1].t), pts[i].y - pts[i - 1].y));
  }

  // A cross-falling top is the one thing a single quad from -hx to +hx cannot
  // draw, so it — and only it — gets columns. `yAt` is the same `flareAt` the
  // query runs, applied to the centre line's own height, which is what keeps
  // the picture and the wheels on the same surface.
  const apron = s.profile.shape === "apron" ? s.profile : null;
  const cols = apron ? 10 : 1;
  const yHigh = apron ? Math.max(apron.y0, apron.y1) : 0;
  const yAt = (y: number, u: number): number =>
    apron ? yHigh + (y - yHigh) * flareAt(apron, u, s.hx) : y;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const v0 = vAt(p0.t);
    const v1 = vAt(p1.t);
    if (v0 === v1 && p0.y === p1.y) continue;
    // The segment's own normal, turned into the world by the SAME rotation
    // `place()` uses: local (u, y, v) → (c·u + sn·v, y, −sn·u + c·v), so a
    // local (0, ny, nv) lands on (sn·nv, ny, c·nv). It shipped with that
    // horizontal component negated, which put every ramp and every arc segment
    // in the spot on the wrong side of the sun: measured on the quarter pipe,
    // 153° of normal error and N·L −0.34 where the surface query says +0.53.
    // There is no riser special case any more — a riser is ny = 0 and falls
    // straight out of the same line, which is how the two got out of step.
    _n.set(p0.nv * sn, p0.ny, p0.nv * c).normalize();
    const s0 = arc[i] / tile;
    const s1 = arc[i + 1] / tile;
    // -hx → +hx across the strip winds the front face toward (0, dv, -dy),
    // which is (0, ny, nv) for every profile point this file emits — a top face
    // (dv > 0, ny > 0) and a riser (dv = 0, facing whichever way it falls) both
    // come out right, ascending or descending. There used to be a `flip` here
    // for uphill risers; it inverted the one case that was already correct.
    for (let k = 0; k < cols; k++) {
      const ua = -s.hx + (2 * s.hx * k) / cols;
      const ub = -s.hx + (2 * s.hx * (k + 1)) / cols;
      if (apron) {
        // Per-column normal: the centre line's own tilt, scaled by this
        // column's share of the fall, plus the sideways fall itself.
        const um = (ua + ub) / 2;
        const tm = (p0.t + p1.t) / 2;
        const g = profileGrade(s.profile, tm, s.hz, um, s.hx);
        const gu = profileCross(s.profile, tm, um, s.hx);
        _n.set(-gu * c - g * sn, 1, gu * sn - g * c).normalize();
      }
      quad(
        m,
        place(s, ua, yAt(p0.y, ua), v0, _p[0]),
        place(s, ua, yAt(p1.y, ua), v1, _p[1]),
        place(s, ub, yAt(p1.y, ub), v1, _p[2]),
        place(s, ub, yAt(p0.y, ub), v0, _p[3]),
        _n,
        [ua / tile, s0, ua / tile, s1, ub / tile, s1, ub / tile, s0],
      );
    }

    // Long skirts, following the same polyline down to the base. On an apron
    // the sides sit at `y0` by construction, which is the pavement it is cut
    // into — so its skirts are the zero-height strip that says so.
    _n.set(c, 0, -sn);
    quad(
      m,
      place(s, s.hx, yAt(p0.y, s.hx), v0, _p[0]),
      place(s, s.hx, yAt(p1.y, s.hx), v1, _p[1]),
      place(s, s.hx, s.base, v1, _p[2]),
      place(s, s.hx, s.base, v0, _p[3]),
      _n,
      [s0, p0.y / tile, s1, p1.y / tile, s1, s.base / tile, s0, s.base / tile],
    );
    _n.set(-c, 0, sn);
    quad(
      m,
      place(s, -s.hx, yAt(p0.y, -s.hx), v0, _p[0]),
      place(s, -s.hx, s.base, v0, _p[1]),
      place(s, -s.hx, s.base, v1, _p[2]),
      place(s, -s.hx, yAt(p1.y, -s.hx), v1, _p[3]),
      _n,
      [s0, p0.y / tile, s0, s.base / tile, s1, s.base / tile, s1, p1.y / tile],
    );
  }

  // The end caps, in the same columns — on an apron the far cap IS the splayed
  // kerb face, running from full drop in the middle out to nothing at the
  // sides, and one quad across it would draw a square end on a splayed cut.
  const first = pts[0];
  const last = pts[pts.length - 1];
  for (let k = 0; k < cols; k++) {
    const ua = -s.hx + (2 * s.hx * k) / cols;
    const ub = -s.hx + (2 * s.hx * (k + 1)) / cols;
    const uA = ua / tile;
    const uB = ub / tile;
    _n.set(-sn, 0, -c);
    quad(
      m,
      place(s, ua, yAt(first.y, ua), -s.hz, _p[0]),
      place(s, ub, yAt(first.y, ub), -s.hz, _p[1]),
      place(s, ub, s.base, -s.hz, _p[2]),
      place(s, ua, s.base, -s.hz, _p[3]),
      _n,
      [uA, first.y / tile, uB, first.y / tile, uB, s.base / tile, uA, s.base / tile],
    );
    _n.set(sn, 0, c);
    quad(
      m,
      place(s, ua, s.base, s.hz, _p[0]),
      place(s, ub, s.base, s.hz, _p[1]),
      place(s, ub, yAt(last.y, ub), s.hz, _p[2]),
      place(s, ua, yAt(last.y, ua), s.hz, _p[3]),
      _n,
      [uA, s.base / tile, uB, s.base / tile, uB, last.y / tile, uA, last.y / tile],
    );
  }

  // The phase, laid on everything this solid just emitted rather than threaded
  // through five `quad` calls. A shift in tiles is the same shift whichever way
  // round a face's u and v happen to run.
  if (phase.u || phase.v) {
    for (let i = uvFrom; i < m.uv.length; i += 2) {
      m.uv[i] += phase.u;
      m.uv[i + 1] += phase.v;
    }
  }
}

/**
 * Every solid, batched by material. One draw call per look — a plaza is not
 * worth thirty of them.
 */
export function buildSpotGeometry(
  filter: (s: Solid) => boolean = () => true,
): Map<LookKey, THREE.BufferGeometry> {
  const byLook = new Map<LookKey, MeshBuffers>();
  // SPOT_SOLIDS, not SOLIDS: the furniture's colliders are drawn by their own
  // generated models, and meshing them here would stand a grey box inside
  // every dumpster in the plaza.
  for (const s of SPOT_SOLIDS) {
    if (!filter(s)) continue;
    let m = byLook.get(s.look);
    if (!m) byLook.set(s.look, (m = buffers()));
    meshSolid(s, m);
  }
  const out = new Map<LookKey, THREE.BufferGeometry>();
  for (const [look, m] of byLook) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(m.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(m.nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(m.uv, 2));
    geo.computeBoundingSphere();
    out.set(look, geo);
  }
  return out;
}
