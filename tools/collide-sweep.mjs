// THE COLLISION SWEEP — every collidable in the game, driven into at speed.
//
// The player's report was "right now I can go through some walls", and a spot
// check cannot answer that: the spot is ~150 analytic solids and the ways
// through one are a function of the approach angle, the speed AND the frame
// rate. So this drives the REAL `SkateModel` over the REAL worlds into every
// one of them, from eight headings, at two roll speeds and one ollie-in speed,
// at 30, 60 and 144 fps, and reports every point at which the board ended up
// somewhere the ride's own rule says it may not be.
//
// THERE ARE FOUR KINDS OF COLLIDABLE AND EVERY VERSION OF THIS FILE HAS SWEPT
// ONE FEWER THAN IT CLAIMED. Each one was found the same way — by asking what
// the loop is structurally unable to reach — and they are worth listing,
// because the shape repeats:
//
//   · **the solids**, map 1's list of yawed boxes. The first version swept
//     these and called it "every collidable in the spot".
//   · **the bars.** A bar — `handrail-6`, `handrail-3`, `flat-bar`, the coping,
//     and four more in map 2 — is a `GrindLine` and not a `Solid` and carries
//     no entry in `SOLIDS`, so ten thousand approaches came back clean over
//     steel you could ride straight through.
//   · **map 2's concrete.** The channel is analytic and has no `SOLIDS` list to
//     iterate, and the last version said so out loud in its own pass line —
//     which is honest and is still half the game unswept. Both maps are driven
//     now, through one driver: what differs is only how each world DESCRIBES
//     its matter, and the predicate underneath is `blocked(x, z, y +
//     WALL_PROBE)` in the ride's own words both times. See `SPILLWAY_WORLD`.
//   · **the grind**, which is not a kind of collidable at all but a kind of
//     MOVEMENT, and the one the ride does not test: while the state is `grind`
//     the board's position is written straight off the line and `advance` never
//     runs. Everything above the grind section drives with `EMPTY_INPUT`, which
//     as of 2026-07-30 no longer means those approaches cannot grind — entry is
//     automatic now — but an incidental catch is not a sweep of the grind, and
//     the section below is still the only place that puts the board on every
//     line in both maps on purpose. See the grind section's own header.
//
// The inventory check is the answer to that class of hole rather than to any
// one instance of it: every bar in both maps and every grind line in map 1 is
// accounted for against the MESH's own idea of what stands on posts, and a line
// that is neither swept here nor sitting on a solid that is swept here is a
// FAILURE, not a silence.
//
// Run: node --experimental-strip-types tools/collide-sweep.mjs
//      …          --solid <id>      one solid only
//      …          --list            what it considers a blocker, and why
//
// WHAT COUNTS AS A PENETRATION, and why it is not a number of my own choosing.
//
// The ride does not collide with the world, it ASKS it: `advance()` refuses to
// step to a point where `surface.blocked(x, z, y + WALL_PROBE)` is true. That
// predicate IS the definition of solid matter for this game — the kerb you roll
// over and the ledge you cannot are the same rule with different numbers — so
// this file asks it in exactly the same words, importing `WALL_PROBE` from the
// model rather than typing 0.3 into a harness. Two failures follow from it:
//
//   · **resting** — a frame ENDED with the board at a point the ride would have
//     refused to step to. He is standing inside the thing.
//   · **tunnelling** — the frame's own step went in one side of a solid and out
//     the other. Sampled at 2 cm along the step with the board's height carried
//     across it, which is the only way to see a 0.4 m fence crossed by a 0.6 m
//     stride.
//
// "In one side and out the other" is the whole of the second rule and it is
// deliberately narrower than "the segment touched matter". A landing is
// resolved at a frame boundary, so a board coming down onto a 0.45 m ledge is
// legitimately a few centimetres below its top face while already over its
// footprint for part of the frame it lands in — that is the landing arriving,
// and it ENDS with him standing on the ledge. A tunnel ends with him on the far
// side of a thing he never touched, so the test is that BOTH ends of the step
// are off the solid's footprint entirely and the middle is inside it.
//
// AND IN ONE SIDE AND OUT THE **OPPOSITE** ONE, which is a stronger statement
// than "the segment touched matter" and the only one that is honestly testable
// here. Two reasons it has to be put that way:
//
//   · The board is a point and the world is boxes, and a point walked past the
//     CORNER of a box always shaves it — whatever slips between two tested
//     points is bounded by the distance between them and by nothing else. A
//     corner clip enters one face and leaves the one NEXT to it.
//   · The harness only sees frame boundaries. Inside a frame the ride walks its
//     step and can turn part way along it (a slide down a yawed face), so the
//     straight line between two frames is not always the path — and a straight
//     line laid across a slid corner reads as a chord that never happened.
//
// A wall gone THROUGH does not have either excuse: it goes in one face and out
// the one facing it, and no amount of sliding produces that. The worst corner
// chord is still printed, because it is the number that would grow if the walk
// in `advance` ever went away.
//
// Neither is a threshold on feel. A player cannot see 2 cm of deck inside a
// kerb; what he sees is the two things that grow out of it — a lamp post gone
// through at 30 fps, and a run that leaves the block at the north wall.
//
// WHY THE GRID. The honest predicate is `STREET_SPOT.blocked`, which walks all
// ~150 solids per call; this file makes tens of millions of calls. So it keeps a
// uniform grid of the same solids and asks `topOf` — the world's own function —
// on the few in the cell. The first assertion below is that the two agree, over
// 40,000 random points across the block and at every height the ride reaches:
// a broadphase that quietly drops a solid is a sweep that reports zero because
// it never looked.
//
// …AND THE SAME DISCIPLINE FOR THE STEEL. A bar's solidity is not a `blocked()`
// answer — it is `meetSteel()` in `src/skate/rail-steel.ts`, a swept segment
// test — so the bar sweep imports THAT and asks it in the ride's own words, the
// way the solid sweep imports `WALL_PROBE`. A pass-through is a frame whose own
// step crossed a bar's line while the board was under the steel: that is one
// call to the same function the ride refuses the step with, so a harness that
// goes green here cannot be green over a ride that walks through the rail.

import { register } from "node:module";

register(new URL("./ts-resolve.mjs", import.meta.url));
// …and directory specifiers on top of it, because `ts-resolve.mjs` only tries
// `<spec>.ts`: map 2's `layout.ts` and `dressing.ts` import `../procedural`,
// which is `../procedural/index.ts`, and without this the map-2 half of this
// sweep stops at the import. (Map 1's `spot.ts` spells `/index` out for exactly
// this reason and needs nothing.) Registered as a SECOND hook rather than by
// editing the shared resolver, which is another lane's file — hooks chain, the
// most recent runs first, and this one falls straight through to `ts-resolve`
// for everything it does not recognise.
register(
  "data:text/javascript," +
    encodeURIComponent(`
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
export async function resolve(spec, ctx, next) {
  if (spec.startsWith(".") && path.extname(spec) === "" && ctx.parentURL) {
    const base = path.dirname(fileURLToPath(ctx.parentURL));
    const index = path.resolve(base, spec, "index.ts");
    if (existsSync(index)) return next(pathToFileURL(index).href, ctx);
  }
  return next(spec, ctx);
}
`),
);

const { SkateModel, EMPTY_INPUT, WALL_PROBE, WALL_STEP } = await import(
  "../src/skate/skate-model.ts"
);
const {
  SOLIDS,
  STREET_SPOT,
  topOf,
  SPOT_MIN_X,
  SPOT_MAX_X,
  SPOT_MIN_Z,
  SPOT_MAX_Z,
  // The back ramp's own lip angle and the block's own lid height, imported for
  // the same reason `WALL_PROBE` is: the checks below assert what the world says
  // about itself, so moving either number moves both sides of the comparison.
  BACK_LIP_DEG,
  BOUND_CAP_Y,
} = await import("../src/world/spot.ts");
// The ride's own definition of steel, imported rather than re-typed — same rule
// as `WALL_PROBE` above.
const { steelBars, meetSteel, steelTopAt, TUBE_R } = await import("../src/skate/rail-steel.ts");
// …but NOT its `BOLTED_ON`. The inventory check below asks whether the ride
// collides with every bar that IS a fence, and a check that borrows the ride's
// own definition of "fence" cannot answer that — move the number and both sides
// of the comparison move together. So the third party is the MESH, which decides
// the same thing for its own reasons: `props.ts` `buildRails` and
// `map2/dressing.ts` `buildSteel` each drop posts under a bar with 0.25 m of air
// beneath it and draw none under one that has less. A bar the player can see
// standing on posts is a bar the ride has to stop him at.
const MESH_POSTS = 0.25;
const { SPILLWAY_SURFACE, boundAt, BOUND_HEIGHT } = await import("../src/world/map2/surface.ts");
// Map 2's matter, for the ATTRIBUTION only — the boolean below is always the
// provider's own `blocked()`. See `spillwayInside`.
const { FEATURES } = await import("../src/world/map2/layout.ts");
const { topOfFeature } = await import("../src/world/map2/features.ts");
const { centreX, channelY } = await import("../src/world/map2/channel.ts");

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i < 0 ? null : argv[i + 1];
};
const ONLY = arg("--solid");
const LIST = argv.includes("--list");

// ---------------------------------------------------------------------------
// the world, indexed
// ---------------------------------------------------------------------------

const CELL = 4;
const NO_SOLIDS = [];
const grid = new Map();
const cellKey = (i, j) => `${i}|${j}`;
for (const s of SOLIDS) {
  for (let i = Math.floor(s.aabb.x0 / CELL); i <= Math.floor(s.aabb.x1 / CELL); i++) {
    for (let j = Math.floor(s.aabb.z0 / CELL); j <= Math.floor(s.aabb.z1 / CELL); j++) {
      const k = cellKey(i, j);
      const bin = grid.get(k);
      if (bin) bin.push(s);
      else grid.set(k, [s]);
    }
  }
}
const solidsNear = (x, z) =>
  grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? NO_SOLIDS;

/**
 * The deepest solid the board at (x, y, z) is inside of, or null.
 *
 * `top > y + WALL_PROBE` and nothing else — the ride's `advance` refuses to
 * step anywhere this answers, so anywhere it answers is somewhere the board
 * got to without asking.
 */
function insideAt(x, y, z) {
  const probe = y + WALL_PROBE;
  let worst = null;
  let depth = 0;
  for (const s of solidsNear(x, z)) {
    const top = topOf(s, x, z);
    if (top === null || top <= probe) continue;
    if (top - probe > depth) {
      depth = top - probe;
      worst = s;
    }
  }
  return worst ? { id: worst.id, depth, solid: worst } : null;
}

/** Is this point off `s`'s footprint altogether — not on it, not in it? */
const offFootprint = (s, x, z) => topOf(s, x, z) === null;

const OPPOSITE = { "u-": "u+", "u+": "u-", "v-": "v+", "v+": "v-" };

/**
 * Which faces of `s` a straight step enters and leaves through, in the solid's
 * own frame — Liang–Barsky against its two slabs, with the face that clipped
 * each end kept. `null` if the step never gets inside the footprint at all, or
 * if either end is already on it (that is a landing, not a crossing).
 */
function facesCrossed(s, x0, z0, x1, z1) {
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  const u0 = c * (x0 - s.cx) - sn * (z0 - s.cz);
  const v0 = sn * (x0 - s.cx) + c * (z0 - s.cz);
  const u1 = c * (x1 - s.cx) - sn * (z1 - s.cz);
  const v1 = sn * (x1 - s.cx) + c * (z1 - s.cz);
  const du = u1 - u0;
  const dv = v1 - v0;
  let tIn = 0;
  let tOut = 1;
  let fIn = null;
  let fOut = null;
  const slab = (p, q, name) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > tOut) return false;
      if (r > tIn) {
        tIn = r;
        fIn = name;
      }
    } else {
      if (r < tIn) return false;
      if (r < tOut) {
        tOut = r;
        fOut = name;
      }
    }
    return true;
  };
  const ok =
    slab(-du, u0 + s.hx, "u-") &&
    slab(du, s.hx - u0, "u+") &&
    slab(-dv, v0 + s.hz, "v-") &&
    slab(dv, s.hz - v0, "v+");
  if (!ok || tIn >= tOut || !fIn || !fOut) return null;
  return { tIn, tOut, fIn, fOut, opposite: OPPOSITE[fIn] === fOut };
}

// ---------------------------------------------------------------------------
// …and the same three questions for map 2, whose matter is not a list of boxes
// ---------------------------------------------------------------------------
//
// The last version of this file said out loud that it did not sweep map 2's
// concrete, and that was honest and it was still a hole: "every collidable in
// the map" with one of the two maps left out is the same sentence the first
// version used about the bars. What made it awkward is real — map 1 is ~150
// yawed boxes with an AABB each and map 2 is a channel with 58 features
// declared in its own bent frame — but none of it reaches the DEFINITION, which
// is the only part a harness may not have its own copy of. So the boolean below
// is `SPILLWAY_SURFACE.blocked` itself, called with `y + WALL_PROBE`, the same
// words `advance` refuses a step with. There is no broadphase here to disagree
// with the world, which is why map 2 needs no equivalent of check 0: the answer
// IS the world's.
//
// What the loop underneath it adds is only the NAME of what he is inside of,
// which the boolean does not carry — asked in the provider's own order (bank,
// channel, then the features) so the name matches the thing that answered.

const _bound = { u: 0, y: 0 };

function spillwayInside(x, y, z) {
  if (!SPILLWAY_SURFACE.blocked(x, z, y + WALL_PROBE)) return null;
  const probe = y + WALL_PROBE;
  boundAt(z, _bound);
  if (Math.abs(x - centreX(z)) >= _bound.u && probe < _bound.y + BOUND_HEIGHT) {
    return { id: "the bank", depth: _bound.y + BOUND_HEIGHT - probe, what: null };
  }
  const floor = channelY(x, z);
  let worst = floor > probe ? { id: "the channel", depth: floor - probe, what: null } : null;
  for (const f of FEATURES) {
    if (x < f.aabb.x0 || x > f.aabb.x1 || z < f.aabb.z0 || z > f.aabb.z1) continue;
    const top = topOfFeature(f, x, z);
    if (top === null || top <= probe) continue;
    if (!worst || top - probe > worst.depth) worst = { id: f.id, depth: top - probe, what: f };
  }
  // `blocked()` said yes and the three tests it is made of all said no, which
  // cannot happen — reported rather than swallowed, because a probe that has
  // drifted from the provider is a sweep measuring its own opinion.
  return worst ?? { id: "UNATTRIBUTED", depth: 0, what: null };
}

/** A feature's footprint coordinates at a world point: 0→1 down it and across it. */
function featureLocal(f, x, z) {
  return {
    a: (z - f.s0) / (f.s1 - f.s0),
    b: (x - centreX(z) - f.u0) / (f.u1 - f.u0),
  };
}

const OPPOSITE_SU = { "s-": "s+", "s+": "s-", "u-": "u+", "u+": "u-" };

/** Which side of the footprint an outside point is off, or null at a corner. */
function faceOff(f, x, z) {
  const { a, b } = featureLocal(f, x, z);
  const out = [];
  if (a < 0) out.push("s-");
  if (a > 1) out.push("s+");
  if (b < 0) out.push("u-");
  if (b > 1) out.push("u+");
  // Off two sides at once is diagonally past a corner, and a corner clip is the
  // excused case in both worlds (see the header). One side or nothing.
  return out.length === 1 ? out[0] : null;
}

/**
 * Map 2's answer to `facesCrossed`, sampled instead of solved.
 *
 * The footprint is a rectangle in the channel's frame and the channel BENDS, so
 * in world x it is not a rectangle and Liang–Barsky has nothing to clip
 * against. Sampling the step at `SWEEP_SAMPLE` and reading which side each end
 * of the inside run is off gives the same two faces, to that resolution, and
 * the resolution is the same one the chord itself is measured at.
 */
function crossedFeature(f, x0, z0, x1, z1) {
  const run = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.min(2048, Math.max(2, Math.ceil(run / SWEEP_SAMPLE)));
  let first = -1;
  let last = -1;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const { a, b } = featureLocal(f, x, z);
    if (a < 0 || a > 1 || b < 0 || b > 1) continue;
    if (first < 0) first = k;
    last = k;
  }
  if (first <= 0 || last >= n) return null;
  const fIn = faceOff(f, x0 + ((x1 - x0) * (first - 1)) / n, z0 + ((z1 - z0) * (first - 1)) / n);
  const fOut = faceOff(f, x0 + ((x1 - x0) * (last + 1)) / n, z0 + ((z1 - z0) * (last + 1)) / n);
  return { opposite: fIn !== null && OPPOSITE_SU[fIn] === fOut };
}

const results = [];
const check = (name, pass, detail, proof) => {
  results.push({ name, pass, detail, proof: proof ?? null });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}` +
      (proof ? "" : "   [UNPROVEN — never watched failing]"),
  );
};

// --- 0. the broadphase is the world's own answer -----------------------------
{
  let disagreed = 0;
  let worst = "";
  let rng = 20260728;
  const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 40000; i++) {
    const x = -48 + rand() * 96;
    const z = -48 + rand() * 96;
    const y = -1 + rand() * 17;
    const mine = insideAt(x, y, z) !== null;
    const theirs = STREET_SPOT.blocked(x, z, y + WALL_PROBE);
    if (mine !== theirs) {
      disagreed++;
      if (!worst) worst = `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) mine ${mine} world ${theirs}`;
    }
  }
  check(
    "the sweep's own broadphase answers exactly what the world answers",
    disagreed === 0,
    disagreed ? `${disagreed} disagreements, first at ${worst}` : "40,000 random points across the block, 0 disagreements",
    "tools/collide-sweep.mjs `insideAt` — `top <= probe` → `top <= probe + 1` — 2,077 disagreements, the first at (3.61, -0.26, -13.55)",
  );
}

// ---------------------------------------------------------------------------
// what a run is
// ---------------------------------------------------------------------------

/** Eight headings, so no solid is ever met only square-on or only at a corner. */
const HEADINGS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
const FRAME_RATES = [30, 60, 144];
/** How far along a step the board is checked for having crossed something. */
const SWEEP_SAMPLE = 0.02;
/** How far out an approach starts, and how much further it will back off. */
const STANDOFF = 5;
const BACKOFF_MAX = 14;
/** Where the ollie fires, measured from the solid's own edge. */
const POP_AT = 2.6;

/**
 * Distance from a solid's centre to its footprint edge along `dir`. Rotation
 * preserves length, so the exit parameter is read off the LOCAL components of
 * the ray and used as a world distance unchanged.
 */
function edgeDistance(s, dirX, dirZ) {
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  const lu = c * dirX - sn * dirZ;
  const lv = sn * dirX + c * dirZ;
  const tu = Math.abs(lu) < 1e-6 ? Infinity : s.hx / Math.abs(lu);
  const tv = Math.abs(lv) < 1e-6 ? Infinity : s.hz / Math.abs(lv);
  return Math.min(tu, tv);
}

/**
 * The two worlds, wearing one interface — because the driver below is one
 * driver and the failure definitions are one pair of definitions.
 *
 * What differs between the maps is only how each one DESCRIBES its matter: map
 * 1 is a list of yawed boxes with an AABB each, map 2 is a channel with its
 * features declared in the flume's own bent frame. What may not differ, and
 * does not, is the predicate — `blocked(x, z, y + WALL_PROBE)`, in the ride's
 * own words, both times.
 *
 *   · `inside(x, y, z)` → `{ id, depth, what }` or null. `what` is the thing
 *     the chord tests need a footprint from, and it is null when the answer is
 *     map 2's channel or its bank: those are height fields and not boxes, so
 *     "in one face and out the opposite one" is not a sentence about them.
 *     Being outside the bank is itself blocked, so an escape still shows up as
 *     a board resting somewhere it may not be.
 *   · `off(what, x, z)` → is this point off that thing's footprint entirely.
 *   · `crossed(what, x0, z0, x1, z1)` → `{ opposite }`.
 *   · `startable(x, y, z)` → may a run BEGIN here. Not the same question as
 *     "is he inside something", and map 2 is where they come apart: the
 *     hillside beyond the fence line is out of the world, and 2.6 m up it the
 *     bound has already been cleared, so a point out there answers "not inside
 *     anything" while being somewhere the player can never stand. Started
 *     there, he slides down the hill INTO the fence's own volume and rests in
 *     it — a penetration manufactured entirely by where the harness put him.
 *     A start outside the world is counted as nowhere to start, which the pass
 *     line reports, rather than as a pass or as a failure.
 */
const STREET_WORLD = {
  name: "street",
  surface: STREET_SPOT,
  inside: (x, y, z) => {
    const h = insideAt(x, y, z);
    return h ? { id: h.id, depth: h.depth, what: h.solid } : null;
  },
  off: (s, x, z) => offFootprint(s, x, z),
  crossed: (s, x0, z0, x1, z1) => facesCrossed(s, x0, z0, x1, z1),
  startable: (x, y, z) => insideAt(x, y, z) === null,
};

const SPILLWAY_WORLD = {
  name: "spillway",
  surface: SPILLWAY_SURFACE,
  inside: spillwayInside,
  off: (f, x, z) => topOfFeature(f, x, z) === null,
  crossed: (f, x0, z0, x1, z1) => crossedFeature(f, x0, z0, x1, z1),
  startable: (x, y, z) =>
    spillwayInside(x, y, z) === null && Math.abs(x - centreX(z)) < boundAt(z, _bound).u,
};

/**
 * One approach: put him on the floor `standoff` clear of the target's edge,
 * point him at it, give him `speed`, and watch every frame of what happens.
 *
 * Returns the worst resting penetration and the worst tunnelling event, or
 * null if there was nowhere clear to start from (which is reported separately
 * — a solid you cannot get to is not a solid you have tested).
 */
function approach(world, target, heading, speed, fps, mode) {
  const dt = 1 / fps;
  const dirX = Math.sin(heading);
  const dirZ = Math.cos(heading);
  const edge = target.reach(-dirX, -dirZ);

  // Back off until the start is on real floor and not inside anything.
  let standoff = STANDOFF;
  let sx = 0;
  let sz = 0;
  let sy = 0;
  let placed = false;
  for (; standoff <= BACKOFF_MAX; standoff += 1) {
    sx = target.cx - dirX * (edge + standoff);
    sz = target.cz - dirZ * (edge + standoff);
    sy = world.surface.height(sx, sz);
    if (world.startable(sx, sy, sz)) {
      placed = true;
      break;
    }
  }
  if (!placed) return null;

  const model = new SkateModel({}, world.surface);
  model.position.set(sx, sy, sz);
  model.heading = heading;
  model.speed = speed;

  // Long enough to cross the whole footprint and come out the far side, plus
  // the hang time of an ollie taken at the near edge.
  const span = edge * 2 + standoff + 4;
  const frames = Math.ceil((span / Math.max(2, speed) + 1.4) / dt);
  const popDistance = edge + POP_AT;

  let rest = null;
  let tunnel = null;
  let popped = mode !== "air";
  let px = sx;
  let py = sy;
  let pz = sz;

  for (let i = 0; i < frames; i++) {
    const input = { ...EMPTY_INPUT };
    if (!popped) {
      const dx = model.position.x - target.cx;
      const dz = model.position.z - target.cz;
      if (Math.hypot(dx, dz) <= popDistance && model.state === "rolling") {
        input.olliePressed = true;
        popped = true;
      }
    }
    model.update(input, dt);
    const { x, y, z } = model.position;

    const in0 = world.inside(x, y, z);
    if (in0 && (!rest || in0.depth > rest.depth)) {
      rest = { ...in0, x, y, z, speed, fps, heading, mode };
    }

    // …and the step itself: in one side of something and out the other, which
    // is the only failure a per-frame position check can never see. Measured as
    // the CHORD — the share of the step that ran inside — because that is the
    // number the walk in `advance` actually bounds. See the header.
    if (!in0) {
      const run = Math.hypot(x - px, z - pz);
      if (run > SWEEP_SAMPLE) {
        const n = Math.min(2048, Math.ceil(run / SWEEP_SAMPLE));
        const chord = new Map();
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const hit = world.inside(px + (x - px) * t, py + (y - py) * t, pz + (z - pz) * t);
          if (!hit) continue;
          // A height field, not a box: map 2's channel and its bank have no
          // footprint to be off and no opposite face to come out of. See
          // `SPILLWAY_WORLD`.
          if (!hit.what) continue;
          // Crossed, not landed on: he was off this solid's footprint at both
          // ends of the step. See the header — a touchdown that clips the last
          // few centimetres of a ledge's side ENDS on the ledge, and that is a
          // landing, not a wall gone through.
          if (!world.off(hit.what, px, pz) || !world.off(hit.what, x, z)) continue;
          const cur = chord.get(hit.id);
          if (cur) cur.len += run / n;
          else
            chord.set(hit.id, {
              len: run / n,
              through: world.crossed(hit.what, px, pz, x, z)?.opposite === true,
            });
        }
        for (const [id, c] of chord) {
          const worse = !tunnel || (c.through && !tunnel.through) || (c.through === tunnel.through && c.len > tunnel.chord);
          if (worse) {
            tunnel = { id, chord: c.len, through: c.through, x, y, z, speed, fps, heading, mode, run };
          }
        }
      }
    }
    px = x;
    py = y;
    pz = z;
  }
  return { rest, tunnel };
}

// ---------------------------------------------------------------------------
// the sweep
// ---------------------------------------------------------------------------

/**
 * The approaches, as (speed, mode) pairs.
 *
 * 8 m/s is a cruise and 16 is the speed the main line actually arrives at
 * things with; the air run is fired at 16 because an ollie is the only thing
 * in the game that carries the board over a solid rather than into it, and it
 * is where a long unswept stride lives.
 */
const RUNS = [
  [8, "roll"],
  [16, "roll"],
  [16, "air"],
];

/**
 * Every collidable in the game, as something to be driven at: where its middle
 * is, and how far its edge stands from that middle along a given bearing.
 *
 * Map 1 solves it exactly off the solid's own yawed half-extents. Map 2 reads
 * the world AABB `features.ts` already computes for its own broadphase — the
 * footprint under it is a rectangle in the flume's frame and the flume bends,
 * so the box is a shade generous, and generous is the harmless direction: it
 * only decides where an approach STARTS, and the start is then backed off until
 * it is somewhere he may actually be.
 */
const targetsOf = (world) =>
  world === STREET_WORLD
    ? SOLIDS.map((s) => ({
        id: s.id,
        cx: s.cx,
        cz: s.cz,
        reach: (dirX, dirZ) => edgeDistance(s, dirX, dirZ),
      }))
    : FEATURES.map((f) => {
        const cx = (f.aabb.x0 + f.aabb.x1) / 2;
        const cz = (f.aabb.z0 + f.aabb.z1) / 2;
        const hx = (f.aabb.x1 - f.aabb.x0) / 2;
        const hz = (f.aabb.z1 - f.aabb.z0) / 2;
        return {
          id: f.id,
          cx,
          cz,
          reach: (dirX, dirZ) =>
            Math.min(
              Math.abs(dirX) < 1e-6 ? Infinity : hx / Math.abs(dirX),
              Math.abs(dirZ) < 1e-6 ? Infinity : hz / Math.abs(dirZ),
            ),
        };
      });

const SWEPT = [STREET_WORLD, SPILLWAY_WORLD].map((w) => ({
  world: w,
  targets: (ONLY ? targetsOf(w).filter((t) => t.id === ONLY) : targetsOf(w)),
}));
if (ONLY && SWEPT.every((s) => s.targets.length === 0)) {
  console.error(`no solid called ${ONLY}`);
  process.exit(2);
}

const worstRest = new Map(); // solid id → worst resting penetration
const worstOut = new Map(); // …and the ones that are the world's edge, not matter
const worstTunnel = new Map();
const worstByFps = new Map(); // fps → deepest corner any step shaved at it
let unreachable = 0;
let runs = 0;
const t0 = Date.now();

for (const { world, targets } of SWEPT)
  for (const s of targets) {
  for (const heading of HEADINGS) {
    for (const [speed, mode] of RUNS) {
      for (const fps of FRAME_RATES) {
        const r = approach(world, s, heading, speed, fps, mode);
        runs++;
        if (!r) {
          unreachable++;
          continue;
        }
        if (r.rest) {
          const key = `${world.name}/${r.rest.id}`;
          // Matter and the edge of the world are two different failures and the
          // second one is not the ride's — see the containment check below.
          const bin = r.rest.id === "the bank" ? worstOut : worstRest;
          const cur = bin.get(key);
          if (!cur || r.rest.depth > cur.depth) bin.set(key, { ...r.rest, id: key, into: s.id });
        }
        if (r.tunnel) {
          const key = `${world.name}/${r.tunnel.id}`;
          const cur = worstTunnel.get(key);
          const worse =
            !cur ||
            (r.tunnel.through && !cur.through) ||
            (r.tunnel.through === cur.through && r.tunnel.chord > cur.chord);
          if (worse) worstTunnel.set(key, { ...r.tunnel, id: key, into: s.id });
          const byFps = worstByFps.get(fps);
          if (!byFps || r.tunnel.chord > byFps.chord) worstByFps.set(fps, { ...r.tunnel, id: key });
        }
      }
    }
  }
}
const sweptCount = SWEPT.reduce((n, s) => n + s.targets.length, 0);

// …including WHICH approach did it. A penetration report that names only the
// thing entered sends the next reader hunting for a run they cannot reproduce:
// the board rarely ends up inside the solid the approach was aimed at.
const say = (e) =>
  `${e.id} ${(((e.depth ?? e.chord) * 100)).toFixed(0)} cm at ${e.speed} m/s ${e.fps}fps ` +
  `${((e.heading * 180) / Math.PI).toFixed(0)}° ${e.mode}` +
  (e.into && e.into !== e.id.split("/")[1] ? ` (driving at ${e.into})` : "") +
  (e.run ? ` (${(e.run * 100).toFixed(0)} cm stride)` : "");

const restList = [...worstRest.values()].sort((a, b) => b.depth - a.depth);
const crossed = [...worstTunnel.values()].filter((e) => e.through).sort((a, b) => b.chord - a.chord);
// Per frame rate, because that is what tells a corner shave from a wall: a
// shave is the landing tolerance seen edge-on and it shrinks with the stride,
// and a wall gone through does not care how often you ask.
const shavedAt = FRAME_RATES.map((fps) => {
  const worst = worstByFps.get(fps);
  return `${fps}fps ${worst ? `${(worst.chord * 100).toFixed(0)} cm (${worst.id})` : "0 cm"}`;
}).join(" · ");

check(
  `no approach ends with the board inside a solid — ${runs} runs`,
  restList.length === 0,
  restList.length
    ? `${restList.length} solids entered: ${restList.slice(0, 8).map(say).join(" · ")}`
    : `${runs} approaches over ${sweptCount} solids in BOTH maps — ${SWEPT.map(
        (s) => `${s.targets.length} ${s.world.name}`,
      ).join(" + ")} — 8 headings, 8/16 m/s, roll and ollie, 30/60/144 fps — none`,
  "src/skate/skate-model.ts `flight()` — the landing hint back to `yBefore + HINT_LIFT` — 14 solids entered, 970 cm inside `bldg-east-s`, 100 cm inside a dumpster, 85 cm inside the platform, 80 cm inside the dock; every depth is that solid's top minus 0.30. …and the map-2 half of it, which is new and needed its own break: `advanceStep`'s `if (!this.surface.blocked(nx, nz, probe))` → `if (true)`, i.e. no wall test at all — 124 solids entered across the two maps, and `--solid pier-e` on its own gives spillway/pier-e 710 cm at 8 m/s 30fps and spillway/pier-w 710 cm at 16 m/s 30fps air.",
);

check(
  "…and no step goes in one face of a solid and out the opposite one",
  crossed.length === 0,
  crossed.length
    ? `${crossed.length} solids gone through: ${crossed.slice(0, 8).map(say).join(" · ")}`
    : `every step checked at 2 cm with the board's height carried across it; ` +
      `deepest corner shaved by a step that went round it — ${shavedAt} ` +
      `(a landing is resolved at a frame boundary, so this is the frame's own stride seen edge-on)`,
  "src/skate/skate-model.ts `advance()` — drop the `WALL_STEP` walk and probe the whole delta once (`const pieces = 1`) — 12 solids gone in one face and out the opposite one, in BOTH maps: street/prop-lamp-3 by 40 cm off a 52 cm stride at 30 fps, street/fence by its whole 40, street/clutter-hoarding-22 by 30, spillway/prop-sign-7 by 29 off a 40 cm stride, bollards and parking meters by 24 at 60 fps",
);

// --- …and map 2's own boundary, which is a CEILING and not a wall -------------
//
// Split out of the check above rather than counted with it, because it is a
// different sentence about a different thing and only one of them is the ride's.
// Map 2 has no buildings: the world ends at the fence line on the city bank and
// the rock cut on the hill bank, and `surface.ts` makes that bound HEIGHT-AWARE
// on purpose — 2.6 m of it, and nothing above. So an ollie big enough goes over
// the top, and at no point on that path did the ride step anywhere `blocked()`
// refused: it was clear over the fence the whole way. What it comes down on is
// hillside, and every point of hillside within 2.6 m of the walkway datum is
// blocked, so there is nowhere out there he may be — `advance` then refuses
// every direction and the board is frozen where it lands.
//
// That is the world's ceiling and not a wall gone through, which is why it is
// not counted as a penetration; it is still a way out of the level, which is why
// it is not silence either.
{
  const out = [...worstOut.values()].sort((a, b) => b.depth - a.depth);
  check(
    "…and no approach leaves map 2 over the top of its own bound",
    out.length === 0,
    out.length
      ? `${out.length}: ${out.map(say).join(" · ")} — cleared the ${BOUND_HEIGHT} m bound and came down outside it, ` +
        `where the ride has no legal step left in any direction`
      : `nothing the ride does clears the ${BOUND_HEIGHT} m fence line off the walkway`,
    "RED as it stands, and not vacuously: the case it reports was driven frame by frame off the real `SPILLWAY_SURFACE` before this check existed — u 19.70 → 20.21 against a fence line at 19.39, every one of those frames ABOVE the bound's own top (so `blocked()` answered false the whole way and the ride refused nothing), then down onto the hillside and stuck at 0.00 m/s. It is one number away from green and the number is not in this lane: `BOUND_HEIGHT` in `src/world/map2/surface.ts` is 2.6 m and an ollie is 1.57 m off a walkway that a kicker can raise.",
  );
}

// --- the block's own boundary ------------------------------------------------
// The one a player reads without any instrument at all: ride at the edge of the
// world and you stop at it. It is a separate check from the sweep above because
// leaving the block is not a penetration — there is nothing out there to be
// inside of — and that is exactly how a wall with no footprint hides.
{
  const escaped = [];
  const walls = [
    ["north", 0, SPOT_MAX_Z - 8, 0],
    ["south", 0, SPOT_MIN_Z + 8, Math.PI],
    ["east", SPOT_MAX_X - 8, 8, Math.PI / 2],
    ["west", SPOT_MIN_X + 8, 8, -Math.PI / 2],
  ];
  for (const [name, x, z, heading] of walls) {
    for (const fps of FRAME_RATES) {
      const dt = 1 / fps;
      const model = new SkateModel({}, STREET_SPOT);
      model.position.set(x, STREET_SPOT.height(x, z), z);
      model.heading = heading;
      model.speed = 16;
      for (let i = 0; i < Math.ceil(4 / dt); i++) model.update({ ...EMPTY_INPUT }, dt);
      const out =
        model.position.x < SPOT_MIN_X - 2 ||
        model.position.x > SPOT_MAX_X + 2 ||
        model.position.z < SPOT_MIN_Z - 2 ||
        model.position.z > SPOT_MAX_Z + 2;
      if (out)
        escaped.push(
          `${name} ${fps}fps → (${model.position.x.toFixed(1)}, ${model.position.z.toFixed(1)})`,
        );
    }
  }
  check(
    "the block holds you in on all four sides",
    escaped.length === 0,
    escaped.length ? escaped.join(" · ") : "4 s at 16 m/s at each wall, 30/60/144 fps — every run still on the block",
    "src/world/spot.ts — `slab(\"bldg-north\", -44, 44, SPOT_MAX_Z, 48, …)` with SPOT_MAX_Z = 48, which is hz = 0 — a footprint one float wide. This is how the file stood when this check was written and it was red: 16 m/s north ended at z = 80.7, 32 m outside the block, still rolling at 6.3 m/s, with no wall event at any rate. The world lane has since given it 4 m of depth and it is green.",
  );
}

// ---------------------------------------------------------------------------
// THE LAUNCH — the approach that goes OVER a wall instead of INTO one
// ---------------------------------------------------------------------------
//
// EVERYTHING ABOVE THIS LINE DRIVES AT THINGS ON THE FLOOR, and that is the
// fifth version of the same hole this file keeps finding: a whole way of
// meeting a wall that the loop is structurally unable to reach.
//
//   · the 15,624 solid approaches are LEVEL. `RUNS` is 8 and 16 m/s and the
//     ollie-in fires 2.6 m from the target's own edge, so the highest any of
//     them ever gets is one 1.57 m ollie off flat ground, and none of them ever
//     touches the throttle. The ride's own ceiling is 18.66 m/s — measured
//     below, not typed in — which is 40% more energy than the fastest thing
//     swept above carries.
//   · and a wall only blocks while `top > y + WALL_PROBE`. Every approach above
//     tests the refusal; not one of them asks how HIGH the board can be when it
//     arrives. The thing in this game that answers that is a TRANSITION: a 70°
//     bank turns 0.94 of the speed at its lip into vertical, so a 1.6 m bank
//     ridden flat out is a 9.4 m apex — over the top of an 8 m wall, which then
//     stops blocking, and past that wall there is no solid in this world at all.
//
// Both halves of the player's report live here and they are the same geometry
// read twice — "I can end up going right through the wall", and "I still crash
// into that wall on the ramp on the far side of the map":
//
//   · OVER. Swept before the fix at the ride's own ceiling, the board crossed
//     both alley end walls 1.00 m past the face and finished a run ROLLING on
//     top of `alley-east-end` at (47.8, 8.00, 4.0); it crossed the fence's whole
//     0.40 m thickness at (35.0, 2.5, 6.7). That is a wall gone through.
//   · INTO. A lip only throws you if the ride RELEASES you at it, and
//     `lipDecision` releases nobody over a corner that is not there. The back
//     transition's lip stood on `SPOT_MAX_Z`, which IS the north wall's face, so
//     the arc's last stride was still grounded when `advance` met the brick and
//     the wall was charged the whole speed rather than cos 70° of it.
//
// WHAT SPEED, and why it is measured rather than chosen. `MAX_ROLL_SPEED` is 26
// and the plaza cannot produce it — rolling losses cap this ride well under its
// own clamp — so a sweep at 26 asserts against a ride nobody can drive, and a
// sweep at a number I like asserts against my own taste. Nor is one long
// straight enough: the fastest thing in this level is not a push, it is a DROP,
// and the road on its own reads 17.00 m/s against 18.66 off the transitions. So
// the calibration below is the whole block — from rest, throttle held, eight
// headings off a 6 m grid — and the highest speed the model reaches anywhere in
// it is what every launch here is driven with. Move the pushes, the losses, the
// ramps or the block and this number moves with them.
{
  // The ride's own top speed, from the ride.
  let TOP = 0;
  {
    const dt = 1 / 60;
    for (let x = SPOT_MIN_X + 2; x <= SPOT_MAX_X - 2; x += 6) {
      for (let z = SPOT_MIN_Z + 2; z <= SPOT_MAX_Z - 2; z += 6) {
        const y0 = STREET_SPOT.height(x, z);
        if (STREET_SPOT.blocked(x, z, y0 + WALL_PROBE)) continue;
        for (const heading of HEADINGS) {
          const model = new SkateModel({}, STREET_SPOT);
          model.position.set(x, y0, z);
          model.heading = heading;
          for (let i = 0; i < Math.ceil(12 / dt); i++) {
            model.update({ ...EMPTY_INPUT, throttle: true }, dt);
            if (model.speed > TOP) TOP = model.speed;
          }
        }
      }
    }
  }

  // What holds the level in, asked of the world's own description rather than
  // of a list of ids: the four blocks, the two alley ends and the yard fence are
  // exactly the solids the mesh draws as brick or chain-link, and nothing else
  // in `SOLIDS` wears those looks. Add a building and it is covered for free.
  const BOUNDS = SOLIDS.filter(
    (s) => s.look === "brick" || s.look === "brick2" || s.look === "fence",
  );
  const inBound = (x, z) => BOUNDS.find((s) => topOf(s, x, z) !== null) ?? null;

  // …and what can throw you at one. Every non-flat top in the spot, which is
  // every transition, bank, apron, stair set and dropped kerb — no judgement
  // about which of them is "a launcher", because the 0.38 m dropped kerb that
  // fired the board 3.4 m in the air is in this file's own history.
  const LAUNCHERS = SOLIDS.filter((s) => s.profile.shape !== "flat");

  /** Uphill, in world (x, z): the solid's local +v, flipped if it falls that way. */
  function uphillOf(s) {
    const p = s.profile;
    const down = (p.shape === "ramp" || p.shape === "stairs" || p.shape === "apron") && p.y1 < p.y0;
    const sign = down ? -1 : 1;
    // `place()` sends a local (0, 0, v) to (cx + sn·v, cz + c·v).
    return { x: Math.sin(s.yaw) * sign, z: Math.cos(s.yaw) * sign };
  }

  const SKEWS = [-0.9, -0.45, 0, 0.45, 0.9];
  /** When the ollie fires, seconds from the start. One of these lands on the lip. */
  const POPS = [null, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

  const over = new Map();
  let launchRuns = 0;
  let launchUnreachable = 0;
  let apex = 0;

  for (const s of LAUNCHERS) {
    const up = uphillOf(s);
    for (const skew of SKEWS) {
      const heading = Math.atan2(up.x, up.z) + skew;
      const dirX = Math.sin(heading);
      const dirZ = Math.cos(heading);
      // Back off down the fall line until the start is real floor he may be on.
      let sx = 0;
      let sz = 0;
      let sy = 0;
      let placed = false;
      for (let back = edgeDistance(s, -dirX, -dirZ) + 4; back <= 18; back += 1) {
        sx = s.cx - dirX * back;
        sz = s.cz - dirZ * back;
        sy = STREET_SPOT.height(sx, sz);
        if (insideAt(sx, sy, sz) === null && !inBound(sx, sz)) {
          placed = true;
          break;
        }
      }
      if (!placed) {
        launchUnreachable++;
        continue;
      }
      for (const fps of FRAME_RATES) {
        for (const pop of POPS) {
          const dt = 1 / fps;
          const model = new SkateModel({}, STREET_SPOT);
          model.position.set(sx, sy, sz);
          model.heading = heading;
          model.speed = TOP;
          const popFrame = pop === null ? -1 : Math.round(pop * fps);
          launchRuns++;
          for (let i = 0; i < Math.ceil(6 / dt); i++) {
            const input = { ...EMPTY_INPUT, throttle: true };
            if (i === popFrame && model.state === "rolling") input.olliePressed = true;
            model.update(input, dt);
            const p = model.position;
            if (p.y > apex) apex = p.y;
            const hit = inBound(p.x, p.z);
            if (!hit) continue;
            const cur = over.get(hit.id);
            if (!cur || p.y > cur.y)
              over.set(hit.id, {
                y: p.y,
                top: hit.profile.y,
                at: `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`,
                off: s.id,
                fps,
                pop,
              });
            break;
          }
        }
      }
    }
  }

  const gotOver = [...over.entries()].sort((a, b) => b[1].y - a[1].y);
  check(
    `no ramp in map 1 launches the board past a wall — ${launchRuns} launches`,
    gotOver.length === 0,
    gotOver.length
      ? `${gotOver.length} walls cleared: ${gotOver
          .slice(0, 6)
          .map(
            ([id, e]) =>
              `${id} (${e.top} m top) entered at ${e.at} off ${e.off}, ${e.fps}fps, pop ${e.pop === null ? "none" : `${e.pop}s`}`,
          )
          .join(" · ")}`
      : `${launchRuns} launches off ${LAUNCHERS.length} non-flat tops — up the fall line and ±26/±52° across it, ` +
        `at ${TOP.toFixed(2)} m/s (the ride's own ceiling, measured over the whole block from rest), throttle held, ` +
        `popped at eleven times through the climb and not popped at all, 30/60/144 fps. Highest the board ever got: ` +
        `${apex.toFixed(2)} m, against a shortest bound of ${Math.min(...BOUNDS.map((b) => b.profile.y)).toFixed(1)} m ` +
        `(${launchUnreachable} launchers with nowhere clear to start)`,
    "src/world/spot.ts as it stood when this check was written — `alley-west-end`/`alley-east-end` at `y: 8` and `fence` at `y: 2.4`: 3 walls cleared — alley-west-end (8 m top) entered at (-47.0, 9.6, -0.8) off alley-w-trans, alley-east-end at (47.0, 10.5, -2.8) off alley-e-trans, fence (2.4 m top) at (35.0, 2.5, 6.7). The alley runs FINISH out there — one ends rolling on top of the wall at (47.8, 8.00, 4.0), and past x = 48 this world has no solid at all.",
  );
}

// --- …and the line the level actually teaches ---------------------------------
//
// One run, no cleverness: drop in and hold W, which is what the tutorial line
// says to do and what the player does. It is a separate check from the sweep
// above because it is a different sentence — not "can the board get somewhere it
// may not be" but "does the ride the level teaches end in the brick" — and it is
// the one the player reported in his own words: *"I still crash into that wall
// on the ramp on the far side of the map."*
//
// WHAT COUNTS AS CRASHING INTO IT, and it is not the size of the wall event.
// A bank-to-wall is SUPPOSED to touch the brick — that is what a bank to a wall
// is — and the number the design turns on is whether the board was RELEASED
// first. Released at the lip, only cos 70° of the speed is left pointing at the
// wall and the board is metres up by the time it gets there. Not released, the
// board is still on the ramp's own surface when `advance` meets the face, and
// the wall is charged the WHOLE speed rather than cos 70° of it.
//
// The state flag cannot tell those apart — the ride goes airborne on the same
// frame it charges the wall, so `state` reads "air" either way. The HEIGHT can,
// and it needs no number of mine: the ramp's own top at the wall is
// `height(x, SPOT_MAX_Z)`, and a board within `WALL_PROBE` of that is a board
// this whole file would call ON it. Measured over the two versions of this
// geometry, riding the taught line: **y = 2.28–2.29 against a 2.20 m lip**
// before, which is in the brick at the top of the ramp, and y = 5.62–6.38
// against a 2.76 m lip after, which is past it in the air.
//
// The run also has to come BACK. A board that tops out and parks against the
// brick has not crashed and has not carried on either, and it is the failure
// the first attempt at this fix produced.
{
  const bad = [];
  for (const fps of FRAME_RATES) {
    const dt = 1 / fps;
    const model = new SkateModel({}, STREET_SPOT);
    const spawn = STREET_SPOT.spawn();
    model.position.set(spawn.x, STREET_SPOT.height(spawn.x, spawn.z), spawn.z);
    model.heading = spawn.heading;
    let bailed = false;
    let rodeIn = null;
    model.events.onBail = () => {
      bailed = true;
    };
    model.events.onWallHit = (into) => {
      const { x, y, z } = model.position;
      if (z <= SPOT_MAX_Z - 8 || into <= 1) return; // not the far wall, or a seam
      // The ramp's own top a hair SHORT of the face — asked at `SPOT_MAX_Z`
      // itself the answer is the building's 15 m roof, which is the same
      // one-float-inside mistake `lipDecision` reads `LIP_EDGE` back for.
      const lip = STREET_SPOT.height(x, SPOT_MAX_Z - 0.05, y + WALL_PROBE);
      if (y <= lip + WALL_PROBE && (!rodeIn || into > rodeIn.into))
        rodeIn = { into, lip, at: `(${x.toFixed(1)}, ${y.toFixed(2)}, ${z.toFixed(2)})` };
    };
    for (let i = 0; i < Math.ceil(12 / dt); i++) model.update({ ...EMPTY_INPUT, throttle: true }, dt);
    const p = model.position;
    const parked = p.z > SPOT_MAX_Z - 8 && Math.abs(model.speed) < 1;
    if (bailed || parked || rodeIn)
      bad.push(
        `${fps}fps → ` +
          (rodeIn
            ? `rode INTO the far wall at ${rodeIn.into.toFixed(2)} m/s at ${rodeIn.at}, ` +
              `which is on the ramp's own ${rodeIn.lip.toFixed(2)} m lip; `
            : "") +
          `ended (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}) at ${model.speed.toFixed(2)} m/s` +
          (bailed ? ", BAILED" : parked ? ", parked at the wall" : ""),
      );
  }
  check(
    "…and the line the level teaches comes off the far wall instead of riding into it",
    bad.length === 0,
    bad.length
      ? bad.join(" · ")
      : "12 s of drop-in-and-hold-W at 30/60/144 fps — up the far transition, released at its lip, 6.7–6.8 m up, back " +
        "down on the ramp's own shelf 2.4–2.6 m short of the brick, and rolling back down the plaza fakie at 9–11 m/s",
    "src/world/spot.ts as it stood when this check was written — the back transition's lip ON `SPOT_MAX_Z` with no apron behind it, so there was no corner for `lipDecision` to release him over: all three rates ride INTO the brick at 3.78–4.24 m/s at (2.0, 2.29, 48.00), which is the ramp's own 2.20 m lip, on every clean lap. The first attempt at the fix — an apron plus a FLAT deck to the wall — trips the other half of this check instead: all three rates end (2.0, 2.42, 48.0) at 0.00 m/s, parked on the deck against the brick.",
  );
}

// ---------------------------------------------------------------------------
// THE BACK RAMP — where the arc GOES, which is a different question again
// ---------------------------------------------------------------------------
//
// Every check above this line asks whether the ride can get somewhere it may not
// be, and the one directly above asks whether the taught line is RELEASED at the
// lip rather than driven into the brick grounded. Both of those went green over
// a ramp the player then reported for the third time, in these words: *"if I go
// forward, the ramp works in such a way that I just drive into the wall."*
//
// He is right and neither check could see it, because a released board is a
// PROJECTILE and nothing here was asking where it comes down. `v²·sin 2θ / g` is
// the whole of it: at 70° sin 2θ is 0.643, near its maximum, so the old lip
// spent most of the launch going ALONG — measured on it, coasting, never
// touching Space, the arc cleared the 2.8 m shelf from 16 m/s upward and put the
// deck on the bricks four to eight metres up on every single approach.
//
// So this check measures the four numbers that decide it, off the ramp's own
// declared geometry rather than off anything typed here:
//
//   · the EXIT ANGLE, which must be the transition's own lip angle (the ride
//     releases on the tangent it arrives on, so a shallower answer means the
//     release is happening somewhere other than the lip);
//   · the APEX, which is what "I jump up" means;
//   · where the arc COMES DOWN, which must be short of the brick with room to
//     spare — this is the player's complaint, stated as a length;
//   · and that the run then comes back OFF the ramp rather than parking on it,
//     which is the failure the first attempt at this fix produced.
{
  const trans = SOLIDS.find((s) => s.id === "back-trans");
  const toe = trans.cz - trans.hz;
  const lip = trans.cz + trans.hz;
  const lipY = topOf(trans, 0, lip - 1e-6);
  /** How much shelf there is between the lip and the brick, from the world. */
  const shelf = SPOT_MAX_Z - lip;

  const bad = [];
  const rows = [];
  let launched = 0;
  let runsHere = 0;
  let worstClear = Infinity;
  for (const speed of [12, 14, 16, 18, 20]) {
    const seen = [];
    for (const fps of FRAME_RATES) {
      const dt = 1 / fps;
      const model = new SkateModel({}, STREET_SPOT);
      const z0 = toe - 7;
      model.position.set(0, STREET_SPOT.height(0, z0), z0);
      model.heading = 0;
      model.speed = speed;
      runsHere++;
      let brick = null;
      model.events.onWallHit = (into) => {
        const p = model.position;
        if (p.z >= SPOT_MAX_Z - 1.5 && (!brick || into > brick.into))
          brick = { into, y: p.y, z: p.z };
      };
      let vToe = null;
      let launch = null;
      let apex = -Infinity;
      let land = null;
      for (let i = 0; i < Math.ceil(6 / dt); i++) {
        const was = Math.abs(model.speed);
        model.update({ ...EMPTY_INPUT }, dt);
        const p = model.position;
        if (vToe === null && p.z >= toe) vToe = was;
        if (!launch && model.state === "air") {
          const vh = Math.hypot(model.velX, model.velZ);
          launch = { z: p.z, y: p.y, deg: (Math.atan2(model.vy, vh) * 180) / Math.PI };
        }
        if (launch && p.y > apex) apex = p.y;
        if (launch && !land && model.state !== "air") land = { z: p.z, y: p.y, speed: model.speed };
      }
      const p = model.position;
      const tag = `${speed} m/s ${fps}fps`;
      if (brick)
        bad.push(`${tag} → ${brick.into.toFixed(2)} m/s INTO the brick at y=${brick.y.toFixed(2)}`);
      if (!launch) {
        // Under the ramp's own `2gH` he simply cannot reach the lip, and coming
        // back down fakie is the right answer, not a failure. It IS a failure to
        // then be stuck up there.
        if (p.z > toe) bad.push(`${tag} → never reached the lip and ended ON the ramp at z=${p.z.toFixed(2)}`);
        seen.push(`${tag} rolled back`);
        continue;
      }
      launched++;
      if (launch.deg < BACK_LIP_DEG - 3)
        bad.push(`${tag} → left at ${launch.deg.toFixed(1)}°, not the ramp's own ${BACK_LIP_DEG.toFixed(0)}°`);
      if (!land) bad.push(`${tag} → never came down`);
      else {
        const clear = SPOT_MAX_Z - land.z;
        if (clear < worstClear) worstClear = clear;
        if (land.z < lip - 0.05)
          bad.push(`${tag} → came down at z=${land.z.toFixed(2)}, short of the ramp's own lip`);
        if (clear < 0.5)
          bad.push(`${tag} → came down at z=${land.z.toFixed(2)}, ${(clear * 100).toFixed(0)} cm off the brick`);
      }
      if (p.z > toe - 2)
        bad.push(`${tag} → ended at z=${p.z.toFixed(2)} at ${model.speed.toFixed(2)} m/s, still on the ramp`);
      seen.push(
        `${tag} toe ${vToe.toFixed(1)} → ${launch.deg.toFixed(1)}°, apex ${apex.toFixed(2)} m, down at ` +
          `z=${land ? land.z.toFixed(2) : "—"}`,
      );
    }
    rows.push(seen[1] ?? seen[0]); // the 60 fps row stands for the three
  }
  check(
    `the back ramp throws the board UP and the arc lands back on it — ${runsHere} approaches`,
    bad.length === 0 && launched >= 12,
    bad.length
      ? bad.slice(0, 8).join(" · ")
      : `coasting at it from 7 m out at 12–20 m/s, 30/60/144 fps: ${rows.join(" · ")} — every launch left on the ` +
        `transition's own ${BACK_LIP_DEG.toFixed(0)}° lip, came back down inside the ${shelf.toFixed(1)} m shelf with ` +
        `${worstClear.toFixed(2)} m still to spare at the worst of them, put nothing on the brick, and rolled back ` +
        `off the ramp into the plaza (${launched}/${runsHere} reached the lip; under about 13 m/s at the toe the ` +
        `ramp's own 2gH wins and he comes back down fakie without ever getting there)`,
    "src/world/spot.ts as it stood when this check was written — `BACK_LIP_ANGLE` 70°, `BACK_HEIGHT` 2.2 m, `BACK_SHELF` 2.8 m: the launch angle is right (69.7°) and the arc flies the whole shelf anyway — 16 m/s → 3.83 m/s INTO the brick at y=5.30, 18 → 4.70 at y=6.82, 20 → 5.51 at y=7.66, all three at every frame rate, and the 14 m/s approach comes down at z=47.69, 31 cm off the bricks. Steepening alone is not enough either: at 84° with the same 2.2 m height the 20 m/s approach still reaches z=47.4.",
  );
}

// --- …AND THE SAME RAMP WITH THE THROTTLE HELD, WHICH IS THE LINE HE RIDES ----
//
// The check above coasts — `{ ...EMPTY_INPUT }`, nothing pressed — and that one
// omission is how this ramp went green over the defect the player reported for
// the FOURTH time: *"at the end of the ramp he continues forward, leaning
// forward, instead of … launches upward and then falls back down."* The level
// teaches holding W and the player holds W, and a push is 5.4 m/s² that the
// coasting column cannot see.
//
// WHAT IT MISSED, in one line: an 86° lip leaves 7% of the speed horizontal, so
// the arc comes down almost vertically, and on ground at grade `g` the wheels
// keep `(vh + vy·g)/hypot(1, g)`. On the 11.3° apron that was 0.127 of the lip
// speed — under `LANDING_SCRUB` (0.9 m/s) for anything arriving below 7.1 m/s at
// the lip, so the board touched down at **0.00 m/s**. Zero is under
// `PUSH_ROLL_MIN`, so the push stopped following `sign(speed)` and followed
// `rideSign` — the way he is FACING, which is the brick — and 5.4 m/s² of kick
// against the apron's 3.33 m/s² of gravity walked him the whole 3.4 m shelf.
//
// So this asks the question the other one cannot: with W held, is the board ever
// on its WHEELS north of the lip going the wrong way. It is not a threshold on a
// speed or a distance — it is "did the ramp hand him back", answered where the
// answer is unambiguous, and it sweeps the arrival band a tenth of a metre per
// second at a time because the failure is a BAND and 2 m/s steps stepped over it.
{
  const trans = SOLIDS.find((s) => s.id === "back-trans");
  const lip = trans.cz + trans.hz;
  const bad = [];
  let runs = 0;
  let worstBack = Infinity;
  let brickTouches = 0;
  for (const fps of FRAME_RATES) {
    const dt = 1 / fps;
    for (let speed = 8; speed <= 20.05; speed += 0.1) {
      runs++;
      const model = new SkateModel({}, STREET_SPOT);
      const z0 = trans.cz - trans.hz - 7;
      model.position.set(0, STREET_SPOT.height(0, z0), z0);
      model.heading = 0;
      model.speed = speed;
      let brick = null;
      model.events.onWallHit = (into) => {
        if (model.position.z >= SPOT_MAX_Z - 1.5 && (!brick || into > brick.into))
          brick = { into, y: model.position.y, z: model.position.z };
      };
      // Furthest north he ever gets with the wheels DOWN, and the speed there.
      let maxGround = -Infinity;
      let atMax = 0;
      for (let i = 0; i < Math.ceil(8 / dt); i++) {
        model.update({ ...EMPTY_INPUT, throttle: true }, dt);
        const p = model.position;
        if (model.state !== "air" && p.z > maxGround) {
          maxGround = p.z;
          atMax = model.speed;
        }
      }
      const tag = `${speed.toFixed(1)} m/s ${fps}fps`;
      if (brick) {
        brickTouches++;
        bad.push(`${tag} → ${brick.into.toFixed(2)} m/s INTO the brick at y=${brick.y.toFixed(2)}`);
      }
      // He may stand ON the shelf — that is where the arc lands — but he may not
      // still be creeping toward the wall when he is furthest up it.
      if (maxGround > lip && atMax > 0.05)
        bad.push(
          `${tag} → furthest north on his wheels at z=${maxGround.toFixed(2)} and still ` +
            `going FORWARD at ${atMax.toFixed(2)} m/s`,
        );
      if (maxGround > lip && atMax < worstBack) worstBack = atMax;
    }
  }
  check(
    `…and the same ramp with the THROTTLE HELD hands the board back — ${runs} approaches`,
    bad.length === 0,
    bad.length
      ? `${brickTouches} of ${runs} ended on the brick · ${bad.slice(0, 6).join(" · ")}`
      : `8 → 20 m/s in 0.1 m/s steps at 30/60/144 fps, W held the whole way: every launch came down on ` +
        `the return already rolling BACK down it — the least of them at ${Math.abs(worstBack).toFixed(2)} m/s ` +
        `against a ${(0.05).toFixed(2)} m/s floor under which the push would pick his FACING instead — and ` +
        `nothing touched the brick`,
    "src/world/spot.ts as it stood when this check was written — `back-apron`, 3.4 m of 11.3° concrete from the lip to the wall: 48 of these approaches ride the apron into the brick at 2.02–5.35 m/s at y=4.07–4.08, which is the apron's own top at the wall. The taught line survives it by 0.23–0.33 m/s of roll-back, which is why the two checks above are green over it. Restoring the apron and changing nothing else turns this red.",
  );
}

// --- …and nothing off it can put him DOWN on the brick ------------------------
//
// The check above coasts at the ramp square-on, which is the line the player
// rides. This one is everything else he can do to it: yawed across the fall
// line, popped at eleven points through the climb, from five places along a
// 74 m wide transition, at every frame rate. A pop part way up a transition is
// an air the ramp did not author — the board leaves on whatever tangent it had
// at that instant, which on the lower half of any transition points at the wall
// — so this is where the brick still gets touched, and the question is not
// whether it is touched but whether it can END A RUN.
//
// The threshold is the ride's own and is not typed here: `settleWall` fires
// `onWallHit` and then decides on `WALL_SLAM` and `WALL_HEAD` whether to
// ragdoll, so a bail on the same frame as a wall event on the brick IS the ride
// saying the brick put him down. That needs no constant of mine.
{
  const trans = SOLIDS.find((s) => s.id === "back-trans");
  const toe = trans.cz - trans.hz;
  // Coarser than this MISSES IT, and that is worth recording rather than
  // discovering again: against the 70° ramp the one approach that ends a run on
  // the brick is 18 m/s at -17° from x = -30, popped 0.6 s in, at 144 fps. Drop
  // 18 m/s from the speeds or -0.3 from the skews and this check goes green over
  // the exact geometry the player reported.
  const SKEWS = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9];
  const POPS = [null, 0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
  const put = [];
  let worst = null;
  let touched = 0;
  let runsHere = 0;
  for (const speed of [12, 14, 16, 18, 20]) {
    for (const skew of SKEWS) {
      for (const x of [-30, 0, 30]) {
        for (const fps of FRAME_RATES) {
          for (const pop of POPS) {
            const dt = 1 / fps;
            const z0 = toe - 7;
            const y0 = STREET_SPOT.height(x, z0);
            if (STREET_SPOT.blocked(x, z0, y0 + WALL_PROBE)) continue;
            const model = new SkateModel({}, STREET_SPOT);
            model.position.set(x, y0, z0);
            model.heading = skew;
            model.speed = speed;
            runsHere++;
            let frame = -1;
            let lastBrick = null;
            let downTo = null;
            model.events.onWallHit = (into) => {
              const p = model.position;
              if (p.z < SPOT_MAX_Z - 1.5) return;
              lastBrick = { into, y: p.y, z: p.z, frame };
              touched++;
              if (!worst || into > worst.into)
                worst = { into, y: p.y, x: p.x, speed, skew, fps, pop };
            };
            model.events.onBail = () => {
              if (lastBrick && lastBrick.frame === frame && !downTo) downTo = { ...lastBrick };
            };
            const popFrame = pop === null ? -1 : Math.round(pop * fps);
            for (frame = 0; frame < Math.ceil(4 / dt); frame++) {
              const input = { ...EMPTY_INPUT, throttle: true };
              if (frame === popFrame && model.state === "rolling") input.olliePressed = true;
              model.update(input, dt);
            }
            if (downTo)
              put.push(
                `${speed} m/s ${((skew * 180) / Math.PI).toFixed(0)}° x=${x} ${fps}fps pop ${pop} → ` +
                  `${downTo.into.toFixed(2)} m/s into the brick at y=${downTo.y.toFixed(2)}`,
              );
          }
        }
      }
    }
  }
  check(
    `…and no approach off it puts the rider down on the brick — ${runsHere} approaches`,
    put.length === 0,
    put.length
      ? `${put.length} runs ended against the north wall: ${put.slice(0, 6).join(" · ")}`
      : `${runsHere} launches at the back wall — ±52° across the fall line, from x = -30/0/30, throttle held, popped at ` +
        `eight points through the climb and not popped at all, 30/60/144 fps. The brick is touched ${touched} times and the ` +
        `hardest of them is ${worst ? `${worst.into.toFixed(2)} m/s at y=${worst.y.toFixed(2)}` : "never"} — a bump at head ` +
        `height, and the ride's own \`WALL_SLAM\` rule declines to ragdoll any of them`,
    "src/world/spot.ts as it stood when this check was written — `BACK_LIP_ANGLE` 70°, `BACK_HEIGHT` 2.2, `BACK_SHELF` 2.8: 6 runs ended against the north wall, all of them 18 m/s popped 0.6 s into the climb at 144 fps — 10.04 m/s into the brick at y=4.67 at ±17° from x=-30, ±17° from x=30, and 10.01 at y=4.69 from x=0. The brick is touched 696 times over that geometry against 211 over this one, and the hardest touch drops from 8.98 m/s (before the pop rows that ragdoll) to 7.10.",
  );
}

// ---------------------------------------------------------------------------
// THE BOUNDARY, FROM BOTH FACES AND AT EVERY HEIGHT
// ---------------------------------------------------------------------------
//
// `the block holds you in on all four sides`, above, is four runs at four walls.
// It is the right sentence and it is four samples of it, and what the player
// reported — *"I also shouldn't fall through that back wall"* — is the class,
// not the sample. So the barrier itself is asserted here rather than probed.
//
// WHAT WAS ACTUALLY WRONG, measured before the fix. `blocked()` is symmetric by
// construction — one rule, "the highest top here is above the board's probe",
// which is a fact about a height and cannot know which way you arrived — and
// swept at 25 cm along the whole perimeter it was continuous everywhere at
// riding height. **What it was not is unbounded.** A building is a flat-topped
// solid, so the wall stops being a wall at its own roofline: 9.8 m on
// `bldg-east-s`, 10.8 on `bldg-west-s`, 11.8 on the alley ends, 14.8 on the
// north wall. Above that line it is solid from neither face — open sky on the
// inside, and on the outside no floor, no wall and no world. The launch check
// measures the ride's own apex at 9.5 m, which is 26 cm under the shortest of
// them, and this round makes the back transition taller and near-vertical on
// purpose. So the roofline stopped being the barrier: `BOUND_CAPS` puts an
// invisible twin on every boundary solid's own footprint at `BOUND_CAP_Y`.
//
// Asserted as one query per sample rather than a scan up the height: `blocked`
// is `maxTop > probe`, so "solid at every height below H" is exactly
// "maxTop >= H", and the whole footprint of every boundary solid — inner skin,
// thickness, outer skin, corners — is swept on a half-metre grid.
{
  const BOUNDS = SOLIDS.filter((s) => s.look === "brick" || s.look === "brick2");
  const seen = new Set();
  const thin = [];
  let samples = 0;
  const tallestAt = (x, z) => {
    let top = -Infinity;
    for (const s of solidsNear(x, z)) {
      const t = topOf(s, x, z);
      if (t !== null && t > top) top = t;
    }
    return top;
  };
  for (const s of BOUNDS) {
    if (seen.has(s.id.replace(/^cap-/, ""))) continue;
    seen.add(s.id.replace(/^cap-/, ""));
    for (let x = s.aabb.x0 + 0.02; x <= s.aabb.x1 - 0.02; x += 0.5) {
      for (let z = s.aabb.z0 + 0.02; z <= s.aabb.z1 - 0.02; z += 0.5) {
        samples++;
        const top = tallestAt(x, z);
        if (top < BOUND_CAP_Y)
          thin.push(`${s.id} at (${x.toFixed(2)}, ${z.toFixed(2)}) stops being solid at ${top.toFixed(1)} m`);
      }
    }
  }
  // …and the same statement in the ride's own words at a handful of heights, so
  // the arithmetic above cannot quietly stop meaning `blocked()`.
  let disagreed = 0;
  for (const s of BOUNDS) {
    for (let i = 0; i < 6; i++) {
      const x = s.aabb.x0 + ((s.aabb.x1 - s.aabb.x0) * (i + 0.5)) / 6;
      const z = s.aabb.z0 + ((s.aabb.z1 - s.aabb.z0) * (i + 0.5)) / 6;
      for (const y of [-1, 0, 2.5, 5, 9.5, 12, BOUND_CAP_Y - 1]) {
        if (!STREET_SPOT.blocked(x, z, y + WALL_PROBE)) disagreed++;
      }
    }
  }
  check(
    `the block's boundary is solid from both faces at every height — ${samples} samples`,
    thin.length === 0 && disagreed === 0,
    thin.length || disagreed
      ? `${thin.length} points where a wall runs out of height: ${thin.slice(0, 6).join(" · ")}` +
        (disagreed ? ` · and ${disagreed} heights where \`blocked()\` itself said no` : "")
      : `every square half-metre of all ${seen.size} boundary solids — inner skin, full thickness, outer skin and ` +
        `corners — is solid from below the road up to the block's own ${BOUND_CAP_Y} m lid, and \`blocked()\` says so ` +
        `in its own words at -1 / 0 / 2.5 / 5 / 9.5 / 12 / ${BOUND_CAP_Y - 1} m. The two alley mouths are the one place ` +
        `the boundary is deliberately open — the road runs out through them, which is the only way you can see out of ` +
        `this spot — and what closes them is the two alley-end slabs, which are in the ${seen.size} above and swept ` +
        `with the rest`,
    "src/world/spot.ts with `BOUND_CAPS` dropped from `SOLIDS`, which is exactly how the file stood when the player reported this — all 14,736 points fail and 84 of the `blocked()` spot-checks with them: every wall runs out of height at its own roofline, bldg-east-s at 10.0 m, bldg-east-n at 11.0, both alley ends at 12.0, bldg-west-s 11.0, bldg-west-n 12.0, bldg-south 13.0, bldg-north 15.0 — against a ride apex the launch check measures at 11.44 m.",
  );
}

// --- …and nothing driven at it, from either side, gets out --------------------
//
// The barrier check above is about the world. This one is about the ride, and it
// is deliberately the widest net in the file for the smallest region: every
// approach the player has — riding, airborne off the new transition, off the two
// alley banks, at every speed the ride reaches, at every yaw, popped anywhere
// through the climb — plus the one start the old sweep could never make, which
// is ON the far side of the ramp with the brick in front of him.
{
  // The alley is a legal corridor out to the two end walls; everything else is
  // the block. Read off the world rather than typed: the alley's own end walls
  // are the `alley-*-end` slabs and their inner faces are the bound.
  const alleyE = SOLIDS.find((s) => s.id === "alley-east-end");
  const alleyW = SOLIDS.find((s) => s.id === "alley-west-end");
  const outside = (p) => {
    const inAlley = Math.abs(p.z) <= 4.02;
    const xMin = inAlley ? alleyW.aabb.x1 : SPOT_MIN_X;
    const xMax = inAlley ? alleyE.aabb.x0 : SPOT_MAX_X;
    return (
      p.x < xMin - 0.02 || p.x > xMax + 0.02 || p.z < SPOT_MIN_Z - 0.02 || p.z > SPOT_MAX_Z + 0.02
    );
  };

  const gone = [];
  let runsHere = 0;
  const drive = (tag, x, z, heading, speed, fps, pop, seconds) => {
    const y = STREET_SPOT.height(x, z);
    if (STREET_SPOT.blocked(x, z, y + WALL_PROBE)) return;
    const dt = 1 / fps;
    const model = new SkateModel({}, STREET_SPOT);
    model.position.set(x, y, z);
    model.heading = heading;
    model.speed = speed;
    runsHere++;
    const popFrame = pop === null ? -1 : Math.round(pop * fps);
    for (let i = 0; i < Math.ceil(seconds / dt); i++) {
      const input = { ...EMPTY_INPUT, throttle: true };
      if (i === popFrame && model.state === "rolling") input.olliePressed = true;
      model.update(input, dt);
      const p = model.position;
      if (outside(p))
        gone.push(
          `${tag} → (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}) at ${speed} m/s ${fps}fps pop ${pop}`,
        );
    }
  };

  const trans = SOLIDS.find((s) => s.id === "back-trans");
  const toe = trans.cz - trans.hz;
  const lip = trans.cz + trans.hz;
  for (const speed of [10, 14, 18, 20]) {
    for (const fps of FRAME_RATES) {
      for (const pop of [null, 0, 0.2, 0.4, 0.6, 0.8]) {
        // at the back wall, up the ramp, straight and skewed
        for (const skew of [-0.9, -0.45, 0, 0.45, 0.9]) {
          for (const x of [-30, -10, 10, 30]) drive("back ramp", x, toe - 7, skew, speed, fps, pop, 6);
        }
        // …and from the REVERSE side of it: on the apron, brick in front, every
        // way round. This is the start the solid sweep cannot make — it backs
        // off until it is on clear floor, and clear floor here is the plaza.
        for (const heading of HEADINGS)
          for (const x of [-20, 0, 20]) drive("on the apron", x, lip + 1.2, heading, speed, fps, pop, 5);
        // the alley banks, which are the other two lips aimed at brick
        drive("alley east", 30, 0, Math.PI / 2, speed, fps, pop, 6);
        drive("alley west", -30, 0, -Math.PI / 2, speed, fps, pop, 6);
        // and the three walls with no ramp in front of them
        drive("south", 0, SPOT_MIN_Z + 12, Math.PI, speed, fps, pop, 6);
        drive("east", SPOT_MAX_X - 14, 14, Math.PI / 2, speed, fps, pop, 6);
        drive("west", SPOT_MIN_X + 14, 14, -Math.PI / 2, speed, fps, pop, 6);
      }
    }
  }
  check(
    `…and no approach at a boundary leaves the block — ${runsHere} approaches`,
    gone.length === 0,
    gone.length
      ? `${gone.length} frames outside the block: ${gone.slice(0, 6).join(" · ")}`
      : `${runsHere} runs at the four walls and the two alley ends — up the back transition straight and at ±26/±52°, ` +
        `from four places across its width, and from ON its apron with the brick in front of him at all eight headings — ` +
        `10/14/18/20 m/s, throttle held, popped at five points and not popped, 30/60/144 fps. Every frame of every run ` +
        `inside the block`,
    "src/world/spot.ts with `BOUND_CAPS` dropped from `SOLIDS` and NOTHING ELSE CHANGED — 956 frames outside the block, the board out over `bldg-east-n` at (36.1, 11.35, 46.5) off an 18 m/s run up the new transition popped 0.8 s in at 30 fps. That is the whole reason the caps exist and it is not hypothetical: this round's taller, near-vertical back ramp takes the ride's measured apex from 9.54 m to 11.44 m, past the 10 m and 11 m tops of the two east buildings, and a wall stops blocking the moment your probe is over it. Note the launch check above stays GREEN through that — it drives off each launcher's own fall line and never reaches this approach — which is why this one is driven and not sampled.",
  );
}

// ---------------------------------------------------------------------------
// THE STEEL — the collidable that is not a solid
// ---------------------------------------------------------------------------
//
// Everything above this line iterates `SOLIDS`. A bar is not one, so everything
// above this line is structurally incapable of seeing one, and for ten thousand
// approaches it did not. See the header.

const WORLDS = [
  ["street", STREET_SPOT],
  ["spillway", SPILLWAY_SURFACE],
];

/** How far a bar's clearance is read at, for the inventory line. */
function clearanceOf(surface, line) {
  let clear = 0;
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = line.a.x + (line.b.x - line.a.x) * t;
    const y = line.a.y + (line.b.y - line.a.y) * t;
    const z = line.a.z + (line.b.z - line.a.z) * t;
    clear = Math.max(clear, y - surface.height(x, z, y));
  }
  return clear;
}

/** Distance from a point to a bar's ground-plane line, and how far along it. */
function toBar(bar, x, z) {
  const len2 = bar.dx * bar.dx + bar.dz * bar.dz;
  const t = Math.max(0, Math.min(1, ((x - bar.ax) * bar.dx + (z - bar.az) * bar.dz) / len2));
  return { t, d: Math.hypot(x - (bar.ax + bar.dx * t), z - (bar.az + bar.dz * t)) };
}

/**
 * Every crossing of a bar's line that this frame's own step took UNDER the
 * steel — which is the ride's own refusal condition, asked with the ride's own
 * function. `meetSteel` reports the first crossing along the step, so the step
 * is re-searched past each one; eight is more bars than any step meets.
 *
 * The height is judged at the point the crossing HAPPENED rather than at either
 * end of the step: an ollie that clears a bar is above the steel exactly where
 * it matters and below it a metre later, and a test that read the end of the
 * frame would call that a pass-through.
 *
 * AND A CROSSING IS NOT AUTOMATICALLY A PASS-THROUGH — two things it can be
 * instead, both of them bounded by a number this file prints rather than by a
 * feeling, and neither of them a threshold anyone chose:
 *
 *   · **round the END.** A bar is a SEGMENT with two ends, and going round the
 *     end of a handrail is a thing a skater does; the ride SLIDES you along
 *     steel you hit at an angle, so arriving at the tip and carrying on past it
 *     is the rule working rather than failing. Whatever slips past the cap is
 *     bounded by the step's own length and by nothing else — same sentence the
 *     solid sweep uses about corners — so a crossing counts only when it is
 *     further than one step plus the tube's radius from either end.
 *   · **across the CAP.** `under` is how far the board's probe was below the
 *     top of the steel, and the top of the steel is the axis plus `TUBE_R`. So
 *     `under > TUBE_R` is not a tolerance, it is the sentence "the board was
 *     below the tube's own axis": under that line he is inside the bar, over it
 *     he is on top of it, which is where a grind happens. The residue this
 *     leaves is the ride's own step resolution seen edge-on — `advance` reads
 *     the board's height once per 5 cm piece and reads a FALLING step at the
 *     height it started ("a board below the floor is landing, not being
 *     walled"), while this file interpolates it continuously — and it is
 *     reported per frame rate so a residue that fails to shrink cannot hide.
 *
 * Against the ride with `steelStep` removed both numbers are irrelevant: the
 * crossings are 32 to 59 cm under the steel, metres from either end.
 */
function crossings(bars, px, py, pz, x, y, z) {
  const out = [];
  const run = Math.hypot(x - px, z - pz);
  let from = 0;
  for (let guard = 0; guard < 8; guard++) {
    const ax = px + (x - px) * from;
    const az = pz + (z - pz) * from;
    // A probe under every bar in the game, so the GEOMETRIC crossing is found
    // and its height is judged below rather than by the search.
    const hit = meetSteel(bars, ax, az, x, z, -1e9, null);
    if (!hit) break;
    const s = from + (1 - from) * hit.s;
    const board = py + (y - py) * s;
    if (board + WALL_PROBE < hit.top) {
      const len = Math.hypot(hit.bar.dx, hit.bar.dz);
      const fromEnd = Math.min(hit.t, 1 - hit.t) * len;
      const under = hit.top - (board + WALL_PROBE);
      out.push({
        id: hit.bar.line.id,
        under,
        fromEnd,
        through: fromEnd > run + TUBE_R && under > TUBE_R,
        cap: under <= TUBE_R,
      });
    }
    from = s + 1e-6;
    if (from >= 1) break;
  }
  return out;
}

/**
 * One approach at a bar: aimed at a point `along` it, `skew` off square, from
 * `side`. Every one of these genuinely crosses the line — an approach parallel
 * to a bar is riding beside it, which is not a question about solidity.
 */
function barRun(surface, bars, bar, along, skew, side, speed, fps, mode) {
  const dt = 1 / fps;
  const barAngle = Math.atan2(bar.ux, bar.uz);
  const heading = barAngle + side * (Math.PI / 2) + skew;
  const dirX = Math.sin(heading);
  const dirZ = Math.cos(heading);
  const tx = bar.ax + bar.dx * along;
  const tz = bar.az + bar.dz * along;

  let standoff = 4;
  let sx = 0;
  let sz = 0;
  let sy = 0;
  let placed = false;
  for (; standoff <= 12; standoff += 1) {
    sx = tx - dirX * standoff;
    sz = tz - dirZ * standoff;
    sy = surface.height(sx, sz);
    if (!surface.blocked(sx, sz, sy + WALL_PROBE) && !meetSteel(bars, sx, sz, sx, sz, sy + WALL_PROBE)) {
      placed = true;
      break;
    }
  }
  if (!placed) return null;

  const model = new SkateModel({}, surface);
  model.position.set(sx, sy, sz);
  model.heading = heading;
  model.speed = speed;

  const frames = Math.ceil(((standoff + 6) / Math.max(2, speed) + 1.4) / dt);
  let popped = mode !== "air";
  let px = sx;
  let py = sy;
  let pz = sz;
  const through = [];
  let restIn = 0;
  let restId = null;

  for (let i = 0; i < frames; i++) {
    const input = { ...EMPTY_INPUT };
    if (!popped && model.state === "rolling") {
      if (Math.hypot(model.position.x - tx, model.position.z - tz) <= POP_AT) {
        input.olliePressed = true;
        popped = true;
      }
    }
    model.update(input, dt);
    const { x, y, z } = model.position;
    for (const c of crossings(bars, px, py, pz, x, y, z)) through.push(c);
    // …and standing IN the tube, which a crossing test cannot see: a board that
    // ends the frame on the line with the steel over it is inside the bar.
    for (const b of bars) {
      const near = toBar(b, x, z);
      if (near.d >= TUBE_R) continue;
      if (y + WALL_PROBE >= steelTopAt(b, near.t)) continue;
      const depth = TUBE_R - near.d;
      if (depth > restIn) {
        restIn = depth;
        // How far BELOW the axis he is while that close to it — which is the
        // number that says whether he is standing under the rail or in it. The
        // rule guarantees at least `WALL_PROBE - TUBE_R`; this reports what it
        // actually was rather than trusting the arithmetic.
        restId = `${b.line.id}, ${(steelTopAt(b, near.t) - TUBE_R - y).toFixed(2)} m under its axis`;
      }
    }
    px = x;
    py = y;
    pz = z;
  }
  return { through, restIn, restId };
}

{
  // --- the inventory: no grind line is unaccounted for ----------------------
  //
  // SCOPE, stated rather than implied, because the last version of this file
  // implied one it did not have. The solid sweep above is map 1's: it iterates
  // `SOLIDS`, which is the street block's own list, and map 2's channel is
  // analytic and has no such list to iterate. So this accounts for EVERY grind
  // line in map 1 and for every BAR in both maps — the bars are the category
  // that has no solid behind it in either map and the category this round was
  // about. Map 2's concrete is not swept by this file and saying otherwise is
  // how the last hole was certified; it is named in the pass line and it is a
  // gap, not a silence.
  const unaccounted = [];
  const lines = [];
  const barsOf = new Map();
  let ledges = 0;
  for (const [name, surface] of WORLDS) {
    const bars = steelBars(surface);
    barsOf.set(name, bars);
    const steel = new Set(bars.map((b) => b.line.id));
    for (const line of surface.rails()) {
      const clear = clearanceOf(surface, line);
      if (line.kind === "rail") {
        if (steel.has(line.id)) {
          lines.push(`${name}/${line.id} steel (${clear.toFixed(2)} m of air under it)`);
          continue;
        }
        // A bar with nothing holding it up is bolted to what it runs over — a
        // lip, not a fence. It has to be BOLTED to be excused, and the world's
        // own mesh has to agree, which is what reading the clearance proves.
        if (clear < MESH_POSTS) {
          lines.push(`${name}/${line.id} bolted on (${clear.toFixed(2)} m) — a lip, not a fence, and the mesh draws it no posts`);
          continue;
        }
        unaccounted.push(`${name}/${line.id} is a bar with ${clear.toFixed(2)} m of air and no steel`);
        continue;
      }
      if (name !== "street") continue;
      // A ledge line is the top arris of a concrete solid, so the thing that
      // stops you is that solid — already swept above. Proving it is one
      // question: is there matter immediately under the line?
      ledges++;
      let held = true;
      for (let i = 0; i < 5 && held; i++) {
        const t = i / 4;
        const x = line.a.x + (line.b.x - line.a.x) * t;
        const y = line.a.y + (line.b.y - line.a.y) * t;
        const z = line.a.z + (line.b.z - line.a.z) * t;
        if (!surface.blocked(x, z, y - 0.05)) held = false;
      }
      if (held) lines.push(`${name}/${line.id} ledge on a swept solid`);
      else unaccounted.push(`${name}/${line.id} is a ledge line with no solid under it`);
    }
  }
  check(
    `every bar in both maps, and every grind line in map 1, is accounted for — ${lines.length} lines`,
    unaccounted.length === 0,
    unaccounted.length
      ? `${unaccounted.length} unaccounted: ${unaccounted.slice(0, 6).join(" · ")}`
      : `${[...barsOf.values()].reduce((n, b) => n + b.length, 0)} bars carry steel, ` +
        `${lines.filter((l) => l.includes("bolted on")).length} are bolted to what they run over, ` +
        `${ledges} map-1 ledge lines lie on solids this sweep already drives into ` +
        `(map 2's features are swept as solids in their own right, above)`,
    "src/skate/rail-steel.ts — `BOLTED_ON` 0.25 → 1.0, so the ride decides every bar is bolted to what it runs over — 6 unaccounted: street/handrail-6 is a bar with 0.85 m of air and no steel · street/flat-bar 0.35 m · street/handrail-3 0.62 m · spillway/chute-bar 0.70 m · spillway/ledge-run-bar 0.49 m · spillway/outfall-bar 0.67 m. That is the exact hole this file shipped with, and the check sees it because the mesh's post rule is not the ride's — move only the ride's number and the two disagree.",
  );

  // --- and the sweep itself -------------------------------------------------
  const ALONG = [0.25, 0.5, 0.75];
  const SKEWS = [-0.9, -0.45, 0, 0.45];
  const gone = new Map();
  const stood = new Map();
  const tipByFps = new Map();
  const capByFps = new Map();
  let barRuns = 0;
  let barUnreachable = 0;
  for (const [name, surface] of WORLDS) {
    for (const bar of barsOf.get(name)) {
      for (const along of ALONG) {
        for (const skew of SKEWS) {
          for (const side of [1, -1]) {
            for (const [speed, mode] of RUNS) {
              for (const fps of FRAME_RATES) {
                const r = barRun(surface, barsOf.get(name), bar, along, skew, side, speed, fps, mode);
                barRuns++;
                if (!r) {
                  barUnreachable++;
                  continue;
                }
                for (const c of r.through) {
                  if (!c.through) {
                    // Round the end, or across the cap. Both are tracked per
                    // frame rate so a residue that does not shrink shows up.
                    const bin = c.cap ? capByFps : tipByFps;
                    const cur = bin.get(fps);
                    const key = c.cap ? "under" : "fromEnd";
                    if (!cur || c[key] > cur[key]) bin.set(fps, { ...c });
                    continue;
                  }
                  const key = `${name}/${c.id}`;
                  const cur = gone.get(key);
                  if (!cur || c.under > cur.under) {
                    gone.set(key, { under: c.under, fromEnd: c.fromEnd, speed, fps, mode });
                  }
                }
                if (r.restId) {
                  const key = `${name}/${r.restId}`;
                  const cur = stood.get(key);
                  if (!cur || r.restIn > cur.depth) stood.set(key, { depth: r.restIn, speed, fps, mode });
                }
              }
            }
          }
        }
      }
    }
  }
  const goneList = [...gone.entries()].sort((a, b) => b[1].under - a[1].under);
  const stoodList = [...stood.entries()].sort((a, b) => b[1].depth - a[1].depth);
  const tips = FRAME_RATES.map((fps) => {
    const w = tipByFps.get(fps);
    return `${fps}fps ${w ? `${(w.fromEnd * 100).toFixed(0)} cm (${w.id})` : "0 cm"}`;
  }).join(" · ");
  const caps = FRAME_RATES.map((fps) => {
    const w = capByFps.get(fps);
    return `${fps}fps ${w ? `${(w.under * 100).toFixed(1)} cm (${w.id})` : "0 cm"}`;
  }).join(" · ");
  check(
    `no approach rides through a bar — ${barRuns} approaches`,
    goneList.length === 0,
    goneList.length
      ? `${goneList.length} bars ridden through: ${goneList
          .slice(0, 8)
          .map(
            ([id, e]) =>
              `${id} ${(e.under * 100).toFixed(0)} cm under the steel and ${e.fromEnd.toFixed(2)} m from either end, ` +
              `at ${e.speed} m/s ${e.fps}fps ${e.mode}`,
          )
          .join(" · ")}`
      : `${barRuns} approaches over ${[...barsOf.values()].reduce((n, b) => n + b.length, 0)} bars, ` +
        `3 points along each, 8 angles from 30° to 150° off the bar, 8/16 m/s, roll and ollie, 30/60/144 fps — ` +
        `no step crossed a bar's line below the tube's own axis anywhere but at a tip. Furthest in from an end ` +
        `a step got round a cap — ${tips} (bounded by the frame's own stride, which is what going round the end ` +
        `of a handrail looks like at this resolution). Deepest a step crossed OVER the axis, i.e. across the top ` +
        `of the steel — ${caps} of the tube's ${(TUBE_R * 100).toFixed(1)} cm radius` +
        (stoodList.length
          ? `; closest the board ever ENDED a frame to a bar's axis, inside the tube's own ` +
            `${(TUBE_R * 100).toFixed(1)} cm — ` +
            stoodList
              .slice(0, 3)
              .map(([id, e]) => `${id} (${(e.depth * 100).toFixed(1)} cm in)`)
              .join(" · ") +
            ` — which is a board standing UNDER a handrail, not in one`
          : "; and no frame ever ended with the board inside the tube"),
    "src/skate/skate-model.ts `advanceStep` — the `steelStep` line removed, which is the game as the player reported it — all 6 bars ridden through: street/handrail-6 59 cm under the steel and 0.90 m from either end at 16 m/s 30fps roll · spillway/chute-bar 44 cm and 3.52 m in at 144fps · spillway/outfall-bar 42 cm and 3.53 m in · street/handrail-3 36 cm and 0.46 m in · spillway/ledge-run-bar 23 cm and 1.27 m in · street/flat-bar 9 cm and 2.12 m in",
  );

  // --- …and the steel did not delete the grind ------------------------------
  // A fence that stops a board a quarter of a metre under the line must not
  // stand between a board coming DOWN on the line and the lock-on: the trucks
  // arrive at the axis, the probe reaches 0.30 m over the board and the steel
  // stands 0.045 m over the axis, so the margin is 0.255 m and this is the
  // check that says so in gameplay rather than in arithmetic.
  // Three pop distances per approach, and ONE of them has to catch. Where a
  // given ollie tops out is a fact about that bar's height, its slope and the
  // run-up's speed — a 1.85 m rail that falls 0.55 m over its length is a
  // different aim from an 8.5 m flat bar — and this check is not about aim. It
  // asks whether the fence stands between a board coming down on the line and
  // the lock-on, and the answer to that must not depend on which of three
  // reasonable pops was tried.
  // …and it is taken ACROSS the line as well as straight down it, which is the
  // half of this check that has any teeth. A run exactly parallel to a bar never
  // crosses it, so `steelStep` cannot fire and the check cannot fail however
  // wrong the fence is; a rail taken 7° off its own line is both what a rail
  // approach really looks like and the case where the fence and the lock-on are
  // asking about the same metre of steel.
  //
  // THE APPROACH IS STEERED, and it has to be. It used to be a fixed heading and
  // no stick at all — an aim asserted by decree, which held only because the ride
  // charged gravity along the direction of travel and dropped the component
  // across it. `SkateModel.fallLine` charges that component now, so a hands-off
  // straight line across a banked floor is not straight any more: it falls toward
  // the fall line, exactly as a coasting skater does. On `spillway/ledge-run-bar`
  // — a bar bolted diagonally across the flume, whose own comment in
  // `map2/layout.ts` says it is "a thing you line up for" — the cross-grade at the
  // three start points measures 6.9°, 13.6° and 40.5°, and the drift over the 7 m
  // run-up came out 0.14–2.2 m against a 0.32 m catch radius. 15 of 108 approaches
  // stopped reaching the steel.
  //
  // That is the fix working, so the CHECK was what had to change. This check's
  // claim is about the fence and the lock-on; a decreed aim had quietly turned it
  // into a claim about the floor's camber. The aim is held the way a player holds
  // it — pure pursuit on a look-ahead point along the intended line, on the
  // ground only — and the catch radius, the pop distances, the speeds, the frame
  // rates and the ±7° are all untouched. Loosening any of those would have hidden
  // the one thing worth knowing.
  //
  // GROUND ONLY, and that is not a detail: `steer` in the air is a SPIN
  // (`AIR_SPIN_RATE`, counted by `spin.add`), so a controller left running through
  // the ollie would arrive at the bar mid-rotation and the landing would pay for
  // it. The stick is centred the moment the wheels leave.
  const POPS = [1.6, 2.4, 3.2];
  const SKEW = [0, 0.12, -0.12];
  /** Shortest way round, so an aim across ±π does not command a full turn. */
  const shortWay = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  /** How far up the intended line the aim point sits, and how hard he holds it. */
  const AIM_AHEAD = 2;
  const AIM_GAIN = 3;
  const missed = [];
  let caught = 0;
  let worstKept = 1;
  for (const [name, surface] of WORLDS) {
    for (const bar of barsOf.get(name)) {
      const heading = Math.atan2(bar.ux, bar.uz);
      const len = Math.hypot(bar.dx, bar.dz);
      for (const speed of [8, 12]) {
        for (const fps of FRAME_RATES) {
          for (const skew of SKEW) {
            let got = false;
            for (const popAt of POPS) {
              if (got) break;
              // Started off to the side the skew will carry him back across, far
              // enough out that he meets the line at the bar's MIDDLE and not
              // before it starts. `n` is the bar's left-hand normal, and a
              // heading `skew` off the line drifts `sin(skew)` along it per
              // metre travelled.
              const back = 7;
              const off = -Math.tan(skew) * (back + len / 2);
              const sx = bar.ax - bar.ux * back + bar.uz * off;
              const sz = bar.az - bar.uz * back - bar.ux * off;
              const model = new SkateModel({}, surface);
              model.position.set(sx, surface.height(sx, sz), sz);
              model.heading = heading + skew;
              model.speed = speed;
              // The line he means to ride: from where he started, on the heading
              // he started with. Nothing about it is new — it is the line the old
              // fixed heading was asserting, written down so the stick can hold it.
              const aimX = Math.sin(heading + skew);
              const aimZ = Math.cos(heading + skew);
              let popped = false;
              const dt = 1 / fps;
              // How far along the bar the grind actually CARRIES him — not
              // merely whether `grindState` was ever set. A fence that fights
              // the line it is bolted to would still let one frame of lock-on
              // through and then take his speed; a metre of steel ridden is the
              // thing the player would see.
              let t0 = null;
              let t1 = null;
              let kept = 0;
              for (let i = 0; i < Math.ceil((back + len) / speed / dt) + Math.ceil(1.4 / dt); i++) {
                const input = { ...EMPTY_INPUT, slideHeld: true };
                if (!popped && model.state === "rolling") {
                  const d = Math.hypot(model.position.x - bar.ax, model.position.z - bar.az);
                  if (d <= popAt) {
                    input.olliePressed = true;
                    popped = true;
                  }
                }
                // Hold the line. The aim point is `AIM_AHEAD` up the intended line
                // from the foot of his own perpendicular to it, so one term carries
                // both the heading error and the sideways drift — and `heading` is
                // turned by `-steer`, hence the sign.
                if (model.state === "rolling") {
                  const dx = model.position.x - sx;
                  const dz = model.position.z - sz;
                  const along = dx * aimX + dz * aimZ + AIM_AHEAD;
                  const tx = sx + aimX * along - model.position.x;
                  const tz = sz + aimZ * along - model.position.z;
                  const want = Math.atan2(tx, tz);
                  input.steer = Math.max(
                    -1,
                    Math.min(1, -shortWay(want - model.heading) * AIM_GAIN),
                  );
                }
                model.update(input, dt);
                if (model.grindState) {
                  const t = toBar(bar, model.position.x, model.position.z).t;
                  if (t0 === null) {
                    t0 = t;
                    kept = Math.abs(model.speed) / speed;
                  }
                  t1 = t;
                }
              }
              // A metre of steel ridden, and arrived at with his speed — a fence
              // that bit on the way in would hand the rail a standstill.
              if (t0 !== null && Math.abs(t1 - t0) * len >= Math.min(1, len * 0.5) && kept >= 0.5) {
                got = true;
                if (kept < worstKept) worstKept = kept;
              }
            }
            if (got) caught++;
            else
              missed.push(
                `${name}/${bar.line.id}@${speed}m/s ${fps}fps ${((skew * 180) / Math.PI).toFixed(0)}°`,
              );
          }
        }
      }
    }
  }
  check(
    "…and the steel still lets you land on the bar — X held, every bar",
    missed.length === 0,
    missed.length
      ? `${missed.length}/${missed.length + caught} never locked on: ${missed.slice(0, 8).join(" · ")}`
      : `${caught}/${caught} ollie approaches locked on and rode a metre of steel — every bar in both maps, ` +
        `straight down the line and ±7° across it, 8 and 12 m/s, 30/60/144 fps; worst approach still arrived ` +
        `at the line with ${(worstKept * 100).toFixed(0)}% of its entry speed`,
    "src/skate/rail-steel.ts `meetSteel` — the `probe >= hit.top` gate dropped, which is the naive version of this whole fix: the bar solid all the way up instead of only up to its own steel — 3/108 never locked on (street/flat-bar at 8 m/s, straight down the line, at all three frame rates), because the fence caught the board on the way over the bar and it never came down on the line still moving. Weakly sensitive ON PURPOSE and worth saying so: a grind writes the position itself and never calls `advance`, so the fence and the lock-on only ever meet on the approach frames. `TUBE_R` 0.045 → 0.45 does NOT trip this check, and neither does removing the `skip` — both were tried.",
  );
}

// ---------------------------------------------------------------------------
// THE GRIND — the one state that writes its own position
// ---------------------------------------------------------------------------
//
// EVERYTHING ABOVE THIS LINE DRIVES WITH `EMPTY_INPUT`, AND UNTIL 2026-07-30
// THAT MEANT NOT ONE OF THOSE APPROACHES COULD ENTER A GRIND — `tryCatchGrind`
// opened with `if (!this.slideWanted) return false;` and it is the only door
// into `state = "grind"`. That is no longer true and the note is kept because
// the REASON this section exists survives it: the grind is now automatic the
// moment he rides onto a line (the player's own ask), so an `EMPTY_INPUT` sweep
// enters grinds by itself and some of the 14,976 solid and 1,296 bar approaches
// above are now partly grind frames. What an unpressed key still cannot reach is
// the entry taken SQUARE across a line, which is the one thing E still asks for
// — and, more to the point, an incidental grind is not a sweep OF the grind: it
// is whatever the approach happened to catch, from wherever it happened to be.
// The section below is still the only place that puts the board on every line in
// both maps deliberately. It matters because the grind is the one state in the
// game that does not go through `advance` at all:
//
//   · `catchGrind` and `updateGrind` set the board's position with
//     `grind.place(state, this.position)`, which is a point ON the line and
//     nothing else. No `blocked()`, no `meetSteel()`.
//   · `update()` returns at the top while the state is `grind`, so `roll()` and
//     `flight()` — the only callers of `advance` — never run.
//
// A rail that dives into a pier is then a board being TELEPORTED through six
// metres of concrete, and no amount of driving with X up would ever see it.
//
// So: X held, onto every line in both maps, from both ends, and the assertion
// covers the grind AND everything the run turns into afterwards — the bail, the
// ragdoll, the roll-away. That last part is deliberate. What the player would
// actually report is not "one frame of deck was inside a pier": it is that he
// went in, bailed inside, and got up stuck inside, and only a check that keeps
// watching after the grind ends can see that.
//
// AND THE CATCH RATE IS PART OF THE CHECK, not a footnote to it. A grind check
// that never gets onto a rail passes over anything at all — this project has
// shipped exactly that ("only 0/25 approaches caught the rail — the check
// measured nothing"), so a line no approach could catch is a FAILURE here.
{
  /**
   * Three entry speeds, three pop distances, and FOUR ways of arriving — and
   * the last of those is not thoroughness, it is the only way onto two of the
   * lines in this game. Down the line from either end is how you take a
   * handrail; ACROSS it from either side, at its middle, is how you take a
   * coping (up the transition and pop at the lip) and how you take the low end
   * of a hubba. Driven with along-only, `street/coping` and `street/hubba-6`
   * were never once caught at any speed or frame rate — and a grind check that
   * cannot get onto a line reports nothing about it however green it is.
   */
  const GRIND_SPEEDS = [6, 8, 10, 14];
  /**
   * …and `null` is "never press Space", which is not a fourth aim but a
   * different move: the coping is met by riding UP the transition and being
   * thrown off the lip by its own shape, and `flight()` will not offer a line
   * to an air that began under power until he is on his way back down. That is
   * the ride's own rule (`catchWhileRising`), and this is the approach it was
   * written about.
   */
  const GRIND_POPS = [1.6, 2.4, 3.2, null];
  /**
   * …and how long a run-up he gets, because on a transition that decides the
   * speed at the LIP and therefore whether the coping is even reachable: the
   * same 10 m/s approach caught it off 8 m of plaza and was thrown past it off
   * 7. The loop breaks the moment a line is caught, so this costs nothing on
   * the sixty-odd lines that are caught on the first try.
   */
  const GRIND_RUNUPS = [7, 9, 11];

  /**
   * One approach at a line with the slide key held: roll at it from `standoff`
   * metres out, pop, and watch every frame from the moment the trucks lock on
   * until the run is over.
   */
  function grindRun(world, line, aim, heading, speed, fps, popAt, standoff0) {
    const dt = 1 / fps;
    const dirX = Math.sin(heading);
    const dirZ = Math.cos(heading);
    let standoff = standoff0;
    let sx = 0;
    let sz = 0;
    let sy = 0;
    let placed = false;
    for (; standoff <= standoff0 + 8; standoff += 1) {
      sx = aim.x - dirX * standoff;
      sz = aim.z - dirZ * standoff;
      sy = world.surface.height(sx, sz);
      if (world.startable(sx, sy, sz)) {
        placed = true;
        break;
      }
    }
    if (!placed) return null;

    const model = new SkateModel({}, world.surface);
    model.position.set(sx, sy, sz);
    model.heading = heading;
    model.speed = speed;

    const len = Math.hypot(line.b.x - line.a.x, line.b.z - line.a.z);
    // The approach, the line itself, and two more seconds of whatever it turned
    // into: a board that ends up standing inside a pier does it AFTER the grind.
    const frames = Math.ceil((standoff + len) / speed / dt) + Math.ceil(2.2 / dt);
    let popped = popAt === null;
    let caught = false;
    let rode = 0;
    let rest = null;
    let out = null;
    for (let i = 0; i < frames; i++) {
      const input = { ...EMPTY_INPUT, slideHeld: true };
      if (!popped && model.state === "rolling") {
        if (Math.hypot(model.position.x - aim.x, model.position.z - aim.z) <= popAt) {
          input.olliePressed = true;
          popped = true;
        }
      }
      model.update(input, dt);
      if (model.grindState) {
        caught = true;
        rode++;
      }
      if (!caught) continue;
      const { x, y, z } = model.position;
      const hit = world.inside(x, y, z);
      if (!hit) continue;
      const at = { ...hit, x, y, z, speed, fps, mode: model.state, heading };
      if (hit.id === "the bank") {
        if (!out || hit.depth > out.depth) out = at;
      } else if (!rest || hit.depth > rest.depth) rest = at;
    }
    return { caught, rode, rest, out };
  }

  const inMatter = new Map();
  const leftWorld = new Map();
  const never = [];
  let lineCount = 0;
  let caughtCount = 0;
  let grindRuns = 0;
  let grindFrames = 0;
  for (const world of [STREET_WORLD, SPILLWAY_WORLD]) {
    for (const line of world.surface.rails()) {
      lineCount++;
      let everCaught = false;
      const axis = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
      const mid = {
        x: (line.a.x + line.b.x) / 2,
        z: (line.a.z + line.b.z) / 2,
      };
      const families = [
        { aim: line.a, heading: axis },
        { aim: line.b, heading: axis + Math.PI },
        { aim: mid, heading: axis + Math.PI / 2 },
        { aim: mid, heading: axis - Math.PI / 2 },
      ];
      for (const { aim, heading } of families) {
        for (const speed of GRIND_SPEEDS) {
          for (const fps of FRAME_RATES) {
            let got = false;
            for (const standoff of GRIND_RUNUPS) {
              if (got) break;
              for (const popAt of GRIND_POPS) {
              if (got) break;
              const r = grindRun(world, line, aim, heading, speed, fps, popAt, standoff);
              if (!r) continue;
              grindRuns++;
              if (r.caught) {
                got = true;
                everCaught = true;
                grindFrames += r.rode;
              }
              const key = `${world.name}/${line.id}`;
              if (r.rest) {
                const cur = inMatter.get(key);
                if (!cur || r.rest.depth > cur.depth) inMatter.set(key, { ...r.rest, id: key });
              }
              if (r.out) {
                const cur = leftWorld.get(key);
                if (!cur || r.out.depth > cur.depth) leftWorld.set(key, { ...r.out, id: key });
              }
              }
            }
          }
        }
      }
      if (everCaught) caughtCount++;
      else never.push(`${world.name}/${line.id}`);
    }
  }

  const wentIn = [...inMatter.values()].sort((a, b) => b.depth - a.depth);
  check(
    `every grind line in both maps can be caught with X held — ${lineCount} lines`,
    never.length === 0,
    never.length
      ? `${never.length} lines no approach could get onto: ${never.slice(0, 8).join(" · ")} — ` +
        `the penetration check below measured nothing on those`
      : `${caughtCount}/${lineCount} lines caught, ${grindRuns} approaches, ${grindFrames} frames actually spent on steel and stone, ` +
        `down the line from both ends and across it from both sides, ${GRIND_SPEEDS.join("/")} m/s, ` +
        `popped at 1.6/2.4/3.2 m and not popped at all, off ${GRIND_RUNUPS.join("/")} m of run-up, 30/60/144 fps`,
    "src/skate/skate-model.ts `tryCatchGrind` — `if (!this.slideWanted)` → `if (true)`, i.e. the slide key never satisfied, which is the shape this check exists to catch: 66 lines no approach could get onto, and the penetration check under it went green over 0 grind frames.",
  );

  check(
    "…and no grind carries the board into matter",
    wentIn.length === 0,
    wentIn.length
      ? `${wentIn.length} lines ride into something: ${wentIn
          .slice(0, 8)
          .map(
            (e) =>
              `${e.id} → ${e.depth.toFixed(2)} m inside ${e.id.split("/")[0] === "street" ? "" : ""}` +
              `${e.what ? e.what.id : "the world"} at ${e.speed} m/s ${e.fps}fps (state: ${e.mode})`,
          )
          .join(" · ")}`
      : `${grindFrames} grind frames over ${lineCount} lines, and every frame of what each run turned into afterwards — ` +
        `the bail, the ragdoll and the roll-away — ended somewhere the ride would have stepped to`,
    "src/skate/skate-model.ts `updateGrind` — the `railWalk` call put back to the bare `grind.place(state, this.position)` it replaced, which is the game as it stood when this check was written: 4 lines ride into something — spillway/service-pipe-1 → 6.88 m inside pier-e at 6 m/s 30fps (state: ragdoll) · service-pipe-2 → 6.88 m at 60fps (ragdoll) · service-pipe-0 → 6.88 m at 144fps, still GRINDING · plinth-e → 6.88 m (grind). Same four lines, same pier, at every frame rate, which is what a teleport looks like.",
  );

  const got = [...leftWorld.values()].sort((a, b) => b.depth - a.depth);
  check(
    "…and no grind line carries you out of the world",
    got.length === 0,
    got.length
      ? `${got.length}: ${got.map((e) => `${e.id} → ${e.depth.toFixed(2)} m past the bound`).join(" · ")}`
      : "no line in either map runs past its own map's boundary",
    "src/world/map2/layout.ts — the same `BOUND_HEIGHT` break as the check above; with the bound at 0.6 m the outfall line's run-out ends 1.9 m past the fence.",
  );
}

if (LIST) {
  console.log("\nsteel:");
  for (const [name, surface] of WORLDS) {
    for (const b of steelBars(surface)) {
      console.log(
        `  ${`${name}/${b.line.id}`.padEnd(28)} ${Math.hypot(b.dx, b.dz).toFixed(1)} m long, ` +
          `axis ${b.ay.toFixed(2)}→${b.by.toFixed(2)}, catch radius ${b.line.radius}`,
      );
    }
  }
  console.log("\nsolids, tallest face first:");
  for (const s of [...SOLIDS].sort((a, b) => b.aabb.x1 - a.aabb.x1)) {
    console.log(
      `  ${s.id.padEnd(22)} hx ${s.hx.toFixed(2)} hz ${s.hz.toFixed(2)} ${s.profile.shape}`,
    );
  }
}

const failed = results.filter((r) => !r.pass);
const unproven = results.filter((r) => !r.proof);
console.log(
  `\n${results.length - failed.length}/${results.length} passed` +
    ` — ${runs} approaches, ${unreachable} with nowhere clear to start, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
);
if (failed.length) console.log(`FAILED: ${failed.map((f) => f.name).join(" · ")}`);
console.log(
  `${results.length - unproven.length}/${results.length} watched failing against deliberately broken code`,
);
process.exitCode = failed.length ? 1 : 0;
