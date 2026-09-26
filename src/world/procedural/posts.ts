// Everything on a post.
//
// A downtown block has more vertical steel in it than anything else, and it is
// the layer whose absence reads loudest: a plaza with ramps and no posts is a
// skatepark, and a plaza with a bollard line, a meter, a sign and a signal on
// the corner is a street. None of these are obstacles a player is meant to
// enjoy hitting — they are what tells you where the road was, where the kerb
// is, and how big everything else is. Which is also why their heights are the
// most carefully chosen numbers in this file: a 1.05 m bollard beside a 2.4 m
// sign post beside a 4.3 m signal is a legible scale ladder, and getting one of
// them wrong makes the whole street read as a model village.
//
// Every factory takes a seed and every seed moves something you can see from a
// board: height, colour, count, which way it leans, which face is printed on it.

import * as THREE from "three";
import { propMaterials, cellUv, type CellName, type PropMaterials } from "./mats";
import { rand } from "./rng";
import { bar, bend, cone, disc, dome, panel, pipe, ring, slab, sculpt, type PropBlock } from "./sculpt";

/** Municipal paint. Real cities own about this many colours and no more. */
const CITY_PAINT = [0x3a3e42, 0x415a48, 0x8b9298, 0x2c4a66, 0x5e5952] as const;

/**
 * Every collider in this file is `ride: false`, and that is the honest call.
 *
 * These are POLES. `top` exists so the ride has something to be stopped by; it
 * is not a surface anybody lands on, and the review page does not go looking
 * for one up there. What it does check is that `top` is the height of the post
 * — which is why every post in this file stands at a FROZEN height (see the
 * note in `index.ts`, contract point 3). A 2.15 m sign post carrying a family
 * constant of 2.7 m was 55 cm of solid standing in clear air above it, and the
 * only way one number can describe every seed is if every seed is that number.
 * Height was never the interesting draw here anyway: real street posts of the
 * same kind are all the same height, and a bollard line of mixed heights is a
 * bug in its own right.
 *
 * The footprints stay generous on purpose. A U-channel post is 50 × 26 mm of
 * real steel and a query moving at 12 m/s steps 0.2 m a frame, so a collider
 * cut to the geometry would be a post the ride tunnels straight through. These
 * are a hand's width around the pole — the smallest footprint that stops.
 */
const POST_HALF = 0.12;

/**
 * A sign blade, both sides, in one call.
 *
 * A one-sided blade is invisible edge-on from half the plaza, and a blade with
 * the same legend on BOTH sides is the tell of a placeholder — for a REGULATION
 * sign, which is printed once and bolted up facing the traffic it governs. Its
 * back is bare aluminium and that is what `back` defaults to.
 *
 * A street-name blade is the exception and it is not a small one: the whole
 * object exists to be read from both approaches, so a corner sign whose crossing
 * blade shows a blank pale slab from one side is a corner sign that is wrong
 * from half the junction. Those pass their own legend as `back`.
 */
function blade(
  s: ReturnType<typeof sculpt>,
  mats: PropMaterials,
  name: string,
  geo: () => THREE.BufferGeometry,
  face: CellName,
  at: { x?: number; y: number; z: number; ry?: number; rz?: number },
  back: CellName = "back",
): void {
  s.part(`${name}-face`, cellUv(geo(), face), mats.print, 0xffffff,
    { x: at.x, y: at.y, z: at.z + 0.008, ry: at.ry, rz: at.rz }, "keep");
  s.part(`${name}-back`, cellUv(geo(), back), mats.print, 0xffffff,
    { x: at.x, y: at.y, z: at.z - 0.008, ry: (at.ry ?? 0) + Math.PI, rz: at.rz }, "keep");
}

/**
 * BOLLARD — a 1.0–1.15 m steel post standing free on the pavement.
 *
 * Observed: an outside diameter around 140 mm; a domed cap, which is what
 * stops it reading as a length of scaffold tube; a reflective band a hand's
 * width below the cap; a grout collar where it is set into the slab. The wear
 * is all on one side, at knee height, from cars.
 *
 * The seed moves: pipe or square section, paint, bare galvanised or painted,
 * band on or off and its colour, and up to 2° of lean — a bollard that has
 * been hit.
 *
 * The HEIGHT does not move, and neither does the diameter. See the note above
 * `POST_HALF`: a row of bollards is the one place on a street where everything
 * genuinely is the same size, and it is also the only way `top` can be one
 * number that is true of every seed. The square cap is 72 mm thick rather than
 * the 40 it started at so that a square bollard and a round one stand at the
 * same height — otherwise the section draw alone would move the collider.
 */
const POST = { h: 1.05, rad: 0.072 } as const;

export const bollardSolid: PropBlock = {
  hx: POST_HALF,
  hz: POST_HALF,
  top: POST.h + POST.rad,
  ride: false,
};

export function bollard(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("bollard");
  const { h, rad } = POST;
  const square = r.chance(0.25);
  const bare = r.chance(0.2);
  const paint = bare ? 0xb4bac0 : r.pick(CITY_PAINT);
  const lean = r.about(0, 0.035);
  const body = bare ? mats.steel : mats.enamel;

  if (square) {
    s.part("shaft", slab(rad * 1.9, h, rad * 1.9), body, paint, { y: h / 2, rz: lean, ry: r.range(0, 0.4) });
    s.part("cap", slab(rad * 2.1, rad, rad * 2.1), body, paint, { y: h + rad / 2, rz: lean });
  } else {
    s.part("shaft", pipe(rad, h, 10), body, paint, { y: h / 2, rz: lean });
    s.part("cap", dome(rad, 10), body, paint, { y: h, rz: lean });
  }
  if (r.chance(0.72)) {
    const band = r.pick([0xe4e0d4, 0xd2661c, 0xd7a325] as const);
    s.part("band", pipe(rad * 1.06, 0.075, 10), mats.enamel, band, { y: h - r.range(0.14, 0.2), rz: lean });
  }
  // The collar is 6 cm of concrete and it is what makes the post look SET into
  // the pavement rather than dropped on it.
  s.part("collar", cone(rad * 1.5, rad * 1.85, 0.055, 10, false), mats.precast, 0xb9b3a6, { y: 0.027 });
  return s.done();
}

/**
 * PARKING METER — a 40 mm galvanised post with a cast head on top.
 *
 * Observed: the head overhangs the post on every side, which is the whole
 * silhouette; a sloped printed face; a coin slot on the crown; a lock plate low
 * on the back. Twin heads share one post at a shared bay.
 *
 * The seed moves: single or twin head, body colour, lean, and whether the crown
 * carries a bag ("out of order", which every street has one of).
 *
 * The post stands at a frozen height so `top` is one true number; the head is
 * free to be single or twin because the collider is the POST, the way the
 * signal's is its pole. A twin head overhangs that footprint by 20 mm at chest
 * height, which is not a place anything on a skateboard is.
 */
const METER = { h: 1.2, rise: 0.17, crown: 0.216 } as const;

export const parkingMeterSolid: PropBlock = {
  hx: POST_HALF,
  hz: POST_HALF,
  // The coin slot on the crown, which is the highest thing on it.
  top: METER.h + METER.rise + METER.crown,
  ride: false,
};

export function parkingMeter(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("parking-meter");
  const { h, rise } = METER;
  const twin = r.chance(0.35);
  const paint = r.pick([0x8a9198, 0x4a6350, 0xa2483c, 0x60666b] as const);
  const lean = r.about(0, 0.03);
  const hooded = r.chance(0.25);
  const w = twin ? 0.28 : 0.16;
  const headY = h + rise;

  s.part("collar", cone(0.045, 0.07, 0.05, 8, false), mats.precast, 0xb9b3a6, { y: 0.025 });
  s.part("post", pipe(0.023, h, 8), mats.steel, 0x9aa1a7, { y: h / 2, rz: lean });
  s.part("head", slab(w, 0.34, 0.13), mats.enamel, paint, { y: headY, rz: lean });
  s.part("crown", slab(w + 0.02, 0.035, 0.15), mats.enamel, paint, { y: headY + 0.19, rz: lean });
  s.part("slot", slab(0.035, 0.012, 0.09), mats.steel, 0x6a7076, { x: w * 0.28, y: headY + 0.21, rz: lean });
  const faces = twin ? [-w * 0.25, w * 0.25] : [0];
  for (const [i, x] of faces.entries()) {
    s.part(`face-${i}`, cellUv(panel(0.115, 0.2), "meterFace"), mats.print, 0xffffff,
      { x, y: headY + 0.04, z: 0.066, rz: lean }, "keep");
  }
  if (hooded) {
    // The hood a city drops over a dead meter. Bright, and it reads instantly.
    s.part("hood", slab(w + 0.05, 0.2, 0.17), mats.poly, 0xd2661c, { y: headY + 0.11, rz: lean });
  }
  return s.done();
}

/** The blades a regulation post can carry, and how big each one is. */
const SIGN_FACES = [
  { face: "stop" as CellName, geo: () => disc(0.32, 8), h: 0.64 },
  { face: "noParking" as CellName, geo: () => panel(0.4, 0.5), h: 0.5 },
  { face: "oneWay" as CellName, geo: () => panel(0.62, 0.24), h: 0.24 },
  { face: "warning" as CellName, geo: () => disc(0.34, 4), h: 0.48 },
  { face: "regs" as CellName, geo: () => panel(0.34, 0.52), h: 0.52 },
] as const;

/**
 * SIGN POST — a galvanised U-channel carrying one to three regulation blades.
 *
 * Observed: the post is a flat channel, not a tube, and reads as a 50 mm strip
 * edge-on; blades are bolted through it with the lowest one about 2 m up;
 * nothing on a real street is square — every blade has been turned a few
 * degrees by somebody reversing into it.
 *
 * The seed moves: which blades and how many, their order, each blade's yaw, and
 * the post's lean. The post itself is a frozen 2.45 m, which is what a
 * regulation post is set at and what lets one collider be true of every seed.
 */
const SIGN_H = 2.45;

export const signPostSolid: PropBlock = { hx: POST_HALF, hz: POST_HALF, top: SIGN_H, ride: false };

export function signPost(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("sign-post");
  const h = SIGN_H;
  const lean = r.about(0, 0.025);
  const count = r.int(1, 3);

  s.part("post", slab(0.05, h, 0.026), mats.steel, 0x9aa1a7, { y: h / 2, rz: lean });
  s.part("foot", slab(0.09, 0.05, 0.09), mats.precast, 0xb9b3a6, { y: 0.025 });

  let y = h - 0.16;
  for (let i = 0; i < count; i++) {
    const kind = SIGN_FACES[r.int(0, SIGN_FACES.length - 1)];
    y -= kind.h / 2;
    blade(s, mats, `blade-${i}`, kind.geo, kind.face, { y, z: 0.02, ry: r.about(0, 0.22), rz: lean });
    // Two bolt heads per blade. They are 2 cm across and they are the only
    // thing that says the blade is FIXED to the post rather than floating.
    for (const dy of [kind.h * 0.32, -kind.h * 0.32]) {
      s.part(`bolt-${i}`, disc(0.014, 6), mats.steel, 0x7d858c, { y: y + dy, z: 0.031, rz: lean });
    }
    y -= kind.h / 2 + r.range(0.06, 0.14);
    if (y < 0.6) break;
  }
  return s.done();
}

/**
 * STREET NAME SIGN — a pole with two blades crossed at the top.
 *
 * Observed: the blades sit at different heights, not on one plane, so the pole
 * passes between them; a finial ball caps the pole; the whole thing is taller
 * than it looks — 3 m, because it has to be read from a car.
 *
 * The seed moves: which two names, which one is on top, the crossing angle,
 * lean. The pole is a frozen 2.95 m — see `POST_HALF` — and it has to be tall:
 * a corner sign is read from a car.
 *
 * BOTH blades carry their legend on BOTH faces. A street-name blade is the one
 * sign in the library that is not a regulation plate: it exists to be read from
 * every approach to the junction, and the default bare-aluminium back turned
 * half of every corner sign into a blank pale slab from most of the plaza.
 */
const NAME_H = 2.95;

/** The finial ball caps the pole, so it is 55 mm above the pole's own top. */
export const streetNameSolid: PropBlock = { hx: POST_HALF, hz: POST_HALF, top: NAME_H + 0.055, ride: false };

export function streetName(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("street-name");
  const h = NAME_H;
  const lean = r.about(0, 0.02);
  const swap = r.chance(0.5);
  const a: CellName = swap ? "blade" : "bladeAlt";
  const b: CellName = swap ? "bladeAlt" : "blade";

  s.part("collar", cone(0.06, 0.085, 0.07, 8, false), mats.precast, 0xb9b3a6, { y: 0.035 });
  s.part("pole", pipe(0.034, h, 8), mats.enamel, 0x35473a, { y: h / 2, rz: lean });
  s.part("finial", dome(0.055, 8), mats.enamel, 0x35473a, { y: h, rz: lean });
  blade(s, mats, "blade-a", () => panel(0.92, 0.18), a, { y: h - 0.13, z: 0, rz: lean }, a);
  blade(s, mats, "blade-b", () => panel(0.86, 0.18), b,
    { y: h - 0.34, z: 0, ry: Math.PI / 2 + r.about(0, 0.06), rz: lean }, b);
  return s.done();
}

/**
 * TRAFFIC LIGHT — pole, mast arm, a three-lens head over the road.
 *
 * Observed: the head hangs from the END of the arm and is the object's whole
 * read at distance; the visors over each lens are what make it legible against
 * a bright sky; a pedestrian head and a push button live low on the pole; the
 * arm droops, and a signal drawn with a level arm looks like a crane.
 *
 * The seed moves: arm length and which side it reaches, which lens is lit, the
 * head's yaw, and whether the pedestrian head is fitted. The pole is a frozen
 * 4.3 m: it is the collider, so it is the one draw that has to be a constant,
 * and the arm swinging 2.4–3.4 m out over the road is where the variety lives
 * anyway.
 *
 * This is the tallest thing in the library and the one that sets the street's
 * ceiling. It is also the only prop with an emissive part — one lens, because
 * one aspect is lit at a time, and at golden hour a warm lens is the right one.
 */
const SIGNAL_H = 4.3;

/**
 * The POLE. The arm and the head hang 3 m out over the carriageway and are
 * never in the collider — see the library's own note on this one.
 */
export const trafficLightSolid: PropBlock = { hx: 0.2, hz: 0.2, top: SIGNAL_H, ride: false };

export function trafficLight(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("traffic-light");
  const h = SIGNAL_H;
  const armLen = r.range(2.4, 3.4);
  const side = r.sign();
  const armY = h - 0.35;
  const droop = 0.06;
  const paint = r.pick([0x2f4a37, 0x4a4640, 0x2a2d30] as const);
  const headX = side * armLen;
  const headYaw = r.about(0, 0.12);

  s.part("flange", cone(0.14, 0.17, 0.09, 10, false), mats.steel, 0x8f969c, { y: 0.045 });
  s.part("pole", pipe(0.072, h, 10), mats.enamel, paint, { y: h / 2 });
  // The arm DROOPS — six centimetres over three metres. A level arm reads as a
  // crane; the sag is what says it is carrying something.
  s.part("arm", bar(0.05, [0, armY, 0], [headX, armY - droop, 0]), mats.enamel, paint);
  // The brace. Without it the arm is glued on; with it the joint has a reason
  // to hold three metres of steel out over a road.
  s.part("brace", bar(0.026, [0, armY - 0.62, 0], [side * 0.62, armY - 0.02, 0], 6), mats.enamel, paint);

  const headY = armY - 0.6;
  const fwd = (d: number): { x: number; z: number } => ({
    x: headX + Math.sin(headYaw) * d,
    z: Math.cos(headYaw) * d,
  });
  s.part("head", slab(0.3, 0.9, 0.24), mats.enamel, paint, { x: headX, y: headY, ry: headYaw });
  s.part("head-hanger", bar(0.03, [headX, headY + 0.45, 0], [headX, armY - droop, 0], 6), mats.enamel, paint);
  const lit = r.int(0, 2);
  for (let i = 0; i < 3; i++) {
    const y = headY + 0.29 - i * 0.29;
    const visor = fwd(0.13);
    s.part(`visor-${i}`, cone(0.125, 0.1, 0.14, 8, true), mats.enamel, paint,
      { x: visor.x, y: y + 0.02, z: visor.z, rx: Math.PI / 2, ry: headYaw });
    const lens = fwd(0.15);
    s.part(`lens-${i}`, disc(0.082, 10), i === lit ? mats.lamp : mats.glass, i === lit ? 0xffffff : 0x5c6166,
      { x: lens.x, y, z: lens.z, ry: headYaw }, "keep");
  }
  if (r.chance(0.7)) {
    s.part("ped-head", slab(0.26, 0.3, 0.16), mats.enamel, paint, { y: 2.55, z: 0.12 });
    s.part("ped-lens", cellUv(panel(0.19, 0.22), "warning"), mats.print, 0xffffff, { y: 2.55, z: 0.205 }, "keep");
    s.part("button", slab(0.1, 0.15, 0.08), mats.enamel, 0x8c3a30, { y: 1.12, z: 0.1 });
  }
  return s.done();
}

/**
 * BUS STOP — a pole, a flag, and a timetable case.
 *
 * Observed: the flag is high and turned to face along the kerb, not out into
 * the road; the case is at reading height with a glazed front that catches the
 * sky; the pole is thin enough to disappear at 15 m, which is why the flag has
 * to be the read.
 *
 * The seed moves: flag yaw, case fitted or not, paint, the lock ring. The pole
 * is a frozen 2.6 m for the reason every post in this file is.
 */
const BUS_H = 2.6;

export const busStopSolid: PropBlock = { hx: POST_HALF, hz: POST_HALF, top: BUS_H, ride: false };

export function busStop(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("bus-stop");
  const h = BUS_H;
  const paint = r.pick([0x1f3a52, 0x6f767c, 0x2a2d30] as const);
  const flagYaw = r.about(0, 0.5);

  s.part("collar", cone(0.05, 0.075, 0.06, 8, false), mats.precast, 0xb9b3a6, { y: 0.03 });
  s.part("pole", pipe(0.032, h, 8), mats.enamel, paint, { y: h / 2 });
  blade(s, mats, "flag", () => panel(0.44, 0.56), "busFlag", { y: h - 0.32, z: 0, ry: flagYaw });
  if (r.chance(0.65)) {
    s.part("case", slab(0.36, 0.5, 0.055), mats.enamel, paint, { y: 1.5, z: 0.05, ry: flagYaw });
    s.part("case-glass", panel(0.3, 0.44), mats.glass, 0xcfd6dc, { y: 1.5, z: 0.081, ry: flagYaw }, "keep");
  }
  // A ring of hose clips holding it all on. Two rings, six triangles each.
  for (const y of [1.75, 1.25]) {
    s.part("clip", ring(0.033, 0.045, 6), mats.steel, 0x9aa1a7, { y, rx: -Math.PI / 2 });
  }
  if (r.chance(0.4)) {
    // A chained-up bike lock ring nobody ever cut off. Pure clutter, 40 tris.
    s.part("ring", bend(0.06, 0.012, Math.PI * 2, 8, 4), mats.steel, 0x7d858c, { y: 0.6, z: 0.03, rx: Math.PI / 2 });
  }
  return s.done();
}
