// Site clutter — the layer that says somebody is working on this block.
//
// A real downtown street is never finished. There is always a hoarding round
// something, a barricade across something else, and a rack of bikes chained to
// the last thing anybody bolted down. This is also the layer that gives lane B
// something to CLOSE a gap with that is not another brick wall: a hoarding is
// 2.4 m of matter you can stand anywhere, and it reads as a reason rather than
// as the edge of the map.

import * as THREE from "three";
import { propMaterials, cellUv, type CellName, type PropMaterials } from "./mats";
import { rand } from "./rng";
import { bar, bend, disc, panel, pipe, slab, sculpt, type PropBlock } from "./sculpt";

/**
 * BIKE RACK — inverted-U hoops in a row.
 *
 * Observed: 40 mm galvanised tube; the top corners are BENT, not welded, and
 * the radius of that bend is the whole difference between a bike rack and a
 * croquet hoop; base flanges bolted to the slab; the hoops are never quite
 * parallel.
 *
 * The seed moves: each hoop's yaw and skew, its shuffle along the row, and
 * whether the feet are linked by a bottom rail. How MANY hoops does not move,
 * and neither does the pitch: a two-hoop rack carrying the four-hoop family's
 * 1.55 m half-length was 68 cm of invisible wall beside a prop nobody touched,
 * and the family constant is the one number the physics reads.
 *
 * Each hoop's top tube is published in `userData.grindLines` — 0.36 m of round
 * bar at 0.85 m is a real, if short, 50-50, and lane B decides whether to hand
 * them to the grinder.
 */
const RACK = { tube: 0.024, count: 3, pitch: 0.82, h: 0.85, half: 0.34 } as const;

/**
 * The row, exactly as long as the row is.
 *
 * `top` is the crown of the bend — the top of the tube, which is what the grind
 * lines below are quoted at, so the line the library offers is ON the solid
 * `spot.ts` builds rather than 4 cm inside it. `ride` is false: you 50-50 a bike
 * rack, you do not land on it, and there is no flat surface up there to land on.
 */
export const bikeRackSolid: PropBlock = {
  hx: RACK.half + RACK.tube + 0.03,
  hz: ((RACK.count - 1) * RACK.pitch) / 2 + 0.06,
  top: RACK.h + RACK.tube,
  ride: false,
};

export function bikeRack(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("bike-rack");
  const { count, pitch, h, half, tube } = RACK;
  // A hoop is two uprights and ONE semicircle of the same radius as the gap
  // between them — get that wrong and it reads as a croquet hoop, which is the
  // identity note in the header.
  const legTop = h - half;
  const z0 = (-(count - 1) * pitch) / 2;
  const linked = r.chance(0.4);

  for (let i = 0; i < count; i++) {
    const z = z0 + i * pitch + r.about(0, 0.02);
    const skew = r.about(0, 0.03);
    for (const sx of [-1, 1]) {
      const x = sx * half;
      s.part(`leg-${i}`, bar(tube, [x, 0.01, z], [x + skew, legTop, z + skew * 0.5], 6), mats.steel, 0xa2a9af);
      s.part(`foot-${i}`, disc(0.05, 8), mats.steel, 0x8d949a, { x, y: 0.012, z, rx: -Math.PI / 2 });
    }
    // The bend: a half torus lying in XY, which is exactly the top of a U.
    s.part(`bend-${i}`, bend(half, tube, Math.PI, 8, 4), mats.steel, 0xa2a9af,
      { y: legTop, z, ry: skew });
    // The grindable stretch is the crown, and it is genuinely short. Quoted at
    // the TOP of the tube — `rackBox`'s own `top` — rather than at the
    // centreline: a line quoted 4 cm under the solid the physics builds from
    // the same instance is a line the board can never reach. The arc drops
    // about 8 mm by the ends of this span, which is inside a wheel.
    s.grind({ a: [-half * 0.25, h + tube, z], b: [half * 0.25, h + tube, z], kind: "rail" });
  }
  if (linked) {
    s.part("bottom-rail", bar(tube * 0.8, [0, 0.06, z0 - 0.06], [0, 0.06, z0 + (count - 1) * pitch + 0.06], 6), mats.steel, 0x9aa1a7);
  }
  return s.done();
}

/**
 * BARRICADE — the timber A-frame across a hole in the pavement.
 *
 * Observed: two or three rails, chevroned on both faces, carried on a pair of
 * splayed A-frames; a lamp wired to the top rail; the whole thing is light
 * enough that it is never square to anything and is usually leaning on
 * something else.
 *
 * The seed moves: rail count and their spacing, the lean, the timber tone, the
 * chevron yaw, and whether the lamp is fitted. Length, height and splay are the
 * frame, and the frame is the collider.
 */
const HORSE = { len: 2.1, h: 1.05, splay: 0.21 } as const;

/**
 * The frame. `ride: false` — a barricade is two rails and a lot of air, and the
 * warning lamp on top is a 13 cm plastic box you knock off, not 11 cm of extra
 * solid.
 */
export const barricadeSolid: PropBlock = {
  hx: HORSE.len / 2,
  hz: HORSE.splay * 1.1 + 0.01,
  top: HORSE.h,
  ride: false,
};

export function barricade(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("barricade");
  const { len, h, splay } = HORSE;
  const rails = r.int(2, 3);
  const tone = r.pick([0xd6c49a, 0xc0b49c, 0xb9a888] as const);
  const lean = r.about(0, 0.05);

  for (const sx of [-1, 1]) {
    const x = sx * (len / 2 - 0.12);
    // The A: two legs splayed fore and aft, and a foot board across them.
    for (const sz of [-1, 1]) {
      s.part("leg", bar(0.032, [x, 0.01, sz * splay], [x + lean * h, h, 0], 4), mats.timber, tone);
    }
    s.part("foot", slab(0.11, 0.035, splay * 2.2), mats.timber, tone, { x, y: 0.018 });
  }
  for (let i = 0; i < rails; i++) {
    const y = h - 0.13 - i * r.range(0.3, 0.38);
    if (y < 0.16) break;
    const yaw = i === 0 ? 0 : r.about(0, 0.04);
    // The rail is the CHEVRONS, drawn on both faces of a board thin enough to
    // read as a board. It shipped once with the stripes on separate panels
    // floating 3 mm proud of a white plank, and at 6 m the whole object read as
    // a park bench: the pale plank was the silhouette and the stripes never
    // arrived. Same board, chevrons on its own faces, no floating panels.
    for (const [j, sz] of [1, -1].entries()) {
      s.part(`rail-face-${i}-${j}`, cellUv(panel(len, 0.2), "chevrons"), mats.print, 0xffffff,
        { y, z: sz * 0.023, ry: yaw + (sz < 0 ? Math.PI : 0), rz: lean * 0.1 }, "keep");
    }
    s.part(`rail-${i}`, slab(len, 0.2, 0.04), mats.timber, 0xd8d2c2, { y, z: 0, ry: yaw, rz: lean * 0.1 });
  }
  if (r.chance(0.6)) {
    const x = r.about(0, len * 0.3);
    s.part("lamp-case", slab(0.13, 0.14, 0.11), mats.poly, 0x2b2e31, { x, y: h + 0.04 });
    s.part("lamp-lens", disc(0.05, 8), mats.lamp, 0xffffff, { x, y: h + 0.04, z: 0.058 }, "keep");
  }
  return s.done();
}

/** Which posters end up on a hoarding, and how often. */
const POSTERS: readonly CellName[] = ["posterA", "posterB", "noBills", "posterA"];

/**
 * HOARDING — plywood site fencing in bays.
 *
 * Observed: 2.4 m sheets on timber posts, with the posts standing PROUD of the
 * sheet on the street side; a kicker board along the bottom; the joints between
 * sheets are the strongest lines on it; and every square metre of it that can
 * be reached has been fly-posted and then torn off again.
 *
 * The seed moves: painted or bare ply, the paint, how much has been posted and
 * where, and which posters. The RUN does not move — two 2.3 m bays, every time.
 * A one-bay hoarding carrying the three-bay family's 7.5 m footprint was 1.45 m
 * of invisible plywood past each end of a board you could see the whole of, and
 * the run is the one thing on this prop the physics reads.
 */
const HOARD = { bays: 2, bayW: 2.3, h: 2.15, cap: 0.045 } as const;

/**
 * As long as the run of bays is.
 *
 * The posts, the kicker and the cap rail all live on the site side, so the
 * footprint is not centred on the sheet; `hz` covers the deepest of them.
 */
export const hoardingSolid: PropBlock = {
  hx: (HOARD.bays * HOARD.bayW) / 2,
  hz: 0.11,
  top: HOARD.h + HOARD.cap,
  ride: false,
};

export function hoarding(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("hoarding");
  const { bays, bayW, h } = HOARD;
  const painted = r.chance(0.55);
  const face = painted ? r.pick([0x2f6b46, 0x1f4f8c, 0xb4b0a4] as const) : 0xc8ab7a;
  const total = bays * bayW;
  const x0 = -total / 2;

  for (let i = 0; i < bays; i++) {
    const x = x0 + bayW / 2 + i * bayW;
    s.part(`sheet-${i}`, slab(bayW - 0.02, h, 0.028), mats.timber, face, { x, y: h / 2 });
  }
  // Posts, kicker and cap rail all live on the SITE side (-Z). The street gets
  // the flat face, which is why a hoarding is the thing a city fly-posts.
  for (let i = 0; i <= bays; i++) {
    const x = x0 + i * bayW;
    s.part(`post-${i}`, slab(0.09, h + 0.06, 0.1), mats.timber, 0xa8926c, { x, y: (h + 0.06) / 2, z: -0.05 });
  }
  s.part("kicker", slab(total, 0.16, 0.05), mats.timber, 0xa8926c, { y: 0.08, z: -0.035 });
  s.part("cap-rail", slab(total, 0.05, 0.09), mats.timber, 0xa8926c, { y: h + 0.02, z: -0.02 });

  const posted = r.int(1, 4);
  for (let i = 0; i < posted; i++) {
    const w = r.range(0.4, 0.7);
    s.part(`poster-${i}`, cellUv(panel(w, w * r.range(1.1, 1.5)), POSTERS[r.int(0, POSTERS.length - 1)]), mats.print, 0xffffff,
      { x: r.range(x0 + 0.4, x0 + total - 0.4), y: r.range(0.7, h - 0.5), z: 0.016, rz: r.about(0, 0.08) }, "keep");
  }
  return s.done();
}

/**
 * CELLAR DOOR — the steel hatch in the pavement outside every old shopfront.
 *
 * Observed: two leaves meeting at a low ridge, 60–90 mm proud of the slab, set
 * in a frame that is flush; diamond plate, worn smooth in the middle and rusted
 * at the edges; a hasp at the ridge; the hinges are on the OUTER edges, so the
 * leaves open away from each other.
 *
 * FLAT PROP. It stands under 10 cm and carries no collider — it is laid on the
 * pavement and the ride rolls over it, which is what a skater does to one at
 * speed. Lane B must sink it to the floor height under it; it does not answer
 * the height query and nothing here expects it to.
 *
 * The seed moves: size, ridge height, how rusted it is, and whether one leaf is
 * standing open.
 */
export function cellarDoor(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("cellar-door");
  const w = r.range(1.35, 1.8);
  const d = r.range(1.15, 1.5);
  const ridge = r.range(0.055, 0.095);
  const tone = r.pick([0x8f8a82, 0x9a8b78, 0x7e7a74] as const);
  const pitch = Math.atan2(ridge, w / 2);

  s.part("frame-a", slab(w + 0.14, 0.05, 0.07), mats.iron, tone, { y: 0.025, z: d / 2 + 0.035 });
  s.part("frame-b", slab(w + 0.14, 0.05, 0.07), mats.iron, tone, { y: 0.025, z: -d / 2 - 0.035 });
  s.part("frame-c", slab(0.07, 0.05, d + 0.14), mats.iron, tone, { x: w / 2 + 0.035, y: 0.025 });
  s.part("frame-d", slab(0.07, 0.05, d + 0.14), mats.iron, tone, { x: -w / 2 - 0.035, y: 0.025 });

  const open = r.chance(0.15);
  for (const [i, sx] of [-1, 1].entries()) {
    const lift = open && sx > 0;
    // Both signs are NEGATIVE `sx`, and that is not a coincidence: each leaf
    // extends from its hinge toward the middle, so lifting its inner edge is a
    // turn about +Z away from the hinge either way. Shipped once as `+sx` for
    // the open case and the raised leaf swung down through the pavement.
    const leaf = s.pivot(`leaf-${i}`, {
      x: (sx * w) / 2,
      y: 0.03,
      rz: -sx * (lift ? 1.15 : pitch),
    });
    leaf.part(`leaf-${i}`, slab(w / 2, 0.035, d), mats.iron, tone, { x: (-sx * w) / 4 });
    // Diamond plate, as the grille cell stretched flat over the leaf. It is the
    // only texture on the object and it is what stops it reading as a lid.
    leaf.part(`tread-${i}`, cellUv(panel(w / 2 - 0.03, d - 0.04), "grille"), mats.print, 0x9a958c,
      { x: (-sx * w) / 4, y: 0.019, rx: -Math.PI / 2 }, "keep");
    for (const z of [-d * 0.3, d * 0.3]) {
      leaf.part(`hinge-${i}`, pipe(0.022, 0.1, 6, false), mats.iron, 0x6f6a63, { x: -sx * 0.01, y: 0.005, z, rz: Math.PI / 2 });
    }
  }
  s.part("hasp", slab(0.07, 0.03, 0.14), mats.iron, 0x6f6a63, { y: ridge + 0.03 });
  return s.done();
}
