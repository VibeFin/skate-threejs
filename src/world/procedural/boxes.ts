// The boxes — everything on a street that is a container with a lid on it.
//
// These are the props that pay twice. A utility cabinet is a piece of street
// furniture AND a 1.2 m ledge with a lip on it; a stack of news boxes is a
// row of colour against a grey wall AND something you have to go round. The
// spot's own obstacles are all poured concrete, so this is the layer that puts
// PAINTED, hollow, man-made objects in the frame — which is most of what makes
// a plaza read as a place people work in rather than a skatepark.
//
// Anything with a lid gets a real hinge: `pivot()` puts the lid on its own
// named group at the knuckle, so a later pass can swing it without touching
// this file. The seed sets the angle it is standing at today.
//
// THE FROZEN RECORD, which every factory in this directory now follows.
//
// The collider is the only number in the library the physics reads, and there
// is exactly ONE of it per family — `STREET_PROPS[id].collider`, the field both
// maps already read. So the object under it has to be that shape at every seed,
// and the way that is guaranteed is structural rather than careful: the
// dimensions the collider is made of live in one frozen `const` record at the
// top of the family, the exported `…Solid` block is computed FROM that record,
// and the factory builds from the same record. There is no seeded draw between
// them to get out of step, and no second number anywhere for a caller to reach
// for by mistake.
//
// What the seed still moves is everything you can see and nothing you can hit:
// paint, print, how many doors, which flank, which sticker, what is stacked on
// top, how much has been fly-posted. The trade is deliberate and it is recorded
// in `index.ts`, contract point 3 — a cabinet whose width changed per seed was
// a cabinet whose family collider was wrong for every seed but one, and the
// board rested 21 cm in clear air over one of them.
//
// `tools/props-lab.html` drops a grid of rays through every rideable prop's
// collider footprint and reds any row whose landing height is not the height of
// the geometry under it, at every seed it tries.

import * as THREE from "three";
import { propMaterials, cellUv, type PropMaterials } from "./mats";
import { rand } from "./rng";
import { bar, cone, disc, dome, panel, pipe, ring, shade, slab, sculpt, squash, taperBox, type PropBlock } from "./sculpt";

/** The colours a city vends in. Every one of them is a real box on a street. */
const VEND_PAINT = [0xa8322a, 0x1f4f8c, 0xd4a017, 0x2f6b46, 0x8c8f93, 0xd2661c] as const;

/**
 * UTILITY CABINET — the grey steel box on a concrete pad.
 *
 * Observed: the roof OVERHANGS on every side and is the read at distance; the
 * body is one or two doors with a piano hinge down one edge and a padlock hasp
 * on the other; a louvre panel low on one flank; a warning sticker at eye
 * height; the pad it stands on is bigger than its footprint and the grime line
 * is exactly where the pad meets it.
 *
 * The seed moves: paint, one door or two, which flank carries the louvres and
 * the hasp, and whether the warning sticker and the asset stencil are on.
 * Its SIZE does not move — see the frozen-record note at the top of the file.
 *
 * This is the most useful prop in the library for the ride: 1.2 m of flat top
 * with a lipped edge is a manual pad and a ledge, and `grindLines` marks the
 * front arris so lane B can hand it to the grinder if it wants to.
 */
const CABINET = { w: 1.28, h: 1.06, d: 0.62, pad: 0.09, roof: 0.05, lip: 0.07 } as const;

/** The roof, overhang and all — which is exactly what you land on. */
export const utilityCabinetSolid: PropBlock = {
  hx: (CABINET.w + CABINET.lip) / 2,
  hz: (CABINET.d + CABINET.lip) / 2,
  top: CABINET.pad + CABINET.h + CABINET.roof,
  ride: true,
};

export function utilityCabinet(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("utility-cabinet");
  const { w, h, d, pad, lip } = CABINET;
  // Municipal PALE, not municipal dark. These are seen from the shade side
  // half the time under a 15-degree sun, and the first pass painted them
  // 0x4f5a52–0x6c7168: on the shadow side, lit by a cool hemisphere at 1.0 and
  // an environment at 0.34, a 1.3 m cabinet came out a black slab with a roof.
  const paint = r.pick([0x8f9488, 0x9aa094, 0xb0a894, 0x76827a] as const);
  const side = r.sign();
  const top = pad + h;

  s.part("pad", slab(w + 0.3, pad, d + 0.26), mats.precast, 0xb6b0a3, { y: pad / 2 });
  s.part("body", slab(w, h, d), mats.enamel, paint, { y: pad + h / 2 });
  // The roof and its overhang. 3 cm proud all round, which is the lip you can
  // see from ten metres and the thing that stops it reading as a fridge.
  s.part("roof", slab(w + lip, CABINET.roof, d + lip), mats.enamel, paint, { y: top + CABINET.roof / 2 });
  s.part("plinth", slab(w + 0.03, 0.06, d + 0.03), mats.enamel, paint, { y: pad + 0.03 });

  const doors = r.chance(0.55) ? 2 : 1;
  if (doors === 2) {
    s.part("door-seam", slab(0.022, h * 0.84, 0.014), mats.enamel, 0x3a3d3a, { y: pad + h / 2, z: d / 2 + 0.006 });
  }
  for (const dy of [h * 0.3, -h * 0.3]) {
    s.part("hinge", pipe(0.022, 0.11, 6, false), mats.steel, 0x8d949a,
      { x: (-side * w) / 2 + side * 0.02, y: pad + h / 2 + dy, z: d / 2 - 0.01 });
  }
  s.part("hasp", slab(0.05, 0.14, 0.03), mats.steel, 0x8d949a, { x: (side * w) / 2 - 0.09, y: pad + h * 0.62, z: d / 2 + 0.015 });
  s.part("padlock", squash(dome(0.035, 6), 1, 1.4, 0.7), mats.steel, 0x767c82,
    { x: (side * w) / 2 - 0.09, y: pad + h * 0.62 - 0.06, z: d / 2 + 0.03 });
  s.part("louvres", cellUv(panel(Math.min(0.42, d * 0.7), h * 0.3), "grille"), mats.print, 0xbfc2c4,
    { x: (side * w) / 2 + 0.001, y: pad + h * 0.26, ry: (side * Math.PI) / 2 }, "keep");
  if (r.chance(0.7)) {
    s.part("sticker", cellUv(panel(0.17, 0.17), "warning"), mats.print, 0xffffff,
      { x: -w * 0.28, y: pad + h * 0.66, z: d / 2 + 0.012 }, "keep");
  }
  if (r.chance(0.5)) {
    // The asset plate every municipal box carries. Flat print, no geometry, and
    // it is one of the draws that replaced the size variation the collider
    // contract took away — two cabinets in a row still have to differ, and now
    // they differ in what is printed on them rather than in how big they are.
    s.part("plate", cellUv(panel(0.14, 0.1), "regs"), mats.print, 0xffffff,
      { x: w * 0.3, y: pad + h * 0.82, z: d / 2 + 0.012 }, "keep");
  }
  // The front arris of the roof — and it is quoted at exactly the solid's own
  // `top`, because a grind line under the surface the physics builds is a line
  // you cannot reach.
  s.grind({ a: [-w / 2, top + CABINET.roof, d / 2 + 0.035], b: [w / 2, top + CABINET.roof, d / 2 + 0.035], kind: "ledge" });
  return s.done();
}

/**
 * NEWS BOXES — a rank of three honour boxes.
 *
 * Observed: the body sits on a plinth so the window is at reading height; the
 * lid slopes back; the window fills the front and the masthead is behind it;
 * there is a coin mechanism on one side of the door and a pull handle across
 * it. In a row they are never aligned and never the same colour, and that is
 * the entire reason to draw more than one.
 *
 * The seed moves: each one's colour, each one's yaw and shuffle along the rank,
 * and which of them is sold out.
 *
 * THREE, always, and the lids all sit at the same angle — the two draws this
 * family lost to the collider contract, and both for the same reason. `top` is
 * a flat plane the physics builds across the whole footprint, so a rank with
 * one lid propped 30° back puts the board 8 cm over the other two, and a rank
 * that is sometimes one box wide leaves 51 cm of invisible wall either side of
 * it. A rank of three is the iconic object anyway; a lone honour box is not
 * what anybody pictures.
 */
const NEWS = { count: 3, pitch: 0.47, bodyH: 0.6, plinth: 0.27, tip: -0.14, shuffle: 0.02, yaw: 0.12 } as const;

/**
 * The lids, tipped back on their hinges.
 *
 * The rank does not shuffle ALONG itself, only in and out from the kerb, and
 * that is the collider talking rather than the observation: a box that could
 * slide 3 cm either way along the row put the end of the row anywhere across an
 * 8 cm band, and a single box's own yaw moves it 3 cm more. Quoted at the
 * middle of that band the solid is 6 cm of invisible wall on a bad seed; quoted
 * at the top of it, it always is. Boxes on a real pavement are chained to one
 * frame anyway — what varies is how far the frame has been pushed back off the
 * kerb, and that is the draw that stayed.
 */
export const newsBoxesSolid: PropBlock = {
  // The lid is 0.45 × 0.43 on a hinge at the back, so a yawed box reaches its
  // own diagonal. Quoted just inside the widest yaw: a hair narrow beats a hair
  // wide, for the reason `palletsSolid` gives.
  hx: ((NEWS.count - 1) * NEWS.pitch) / 2 + 0.225 * Math.cos(NEWS.yaw) + 0.1 * Math.sin(NEWS.yaw),
  hz: 0.25,
  top: NEWS.plinth + NEWS.bodyH + 0.215 * Math.abs(Math.sin(NEWS.tip)) + 0.023 * Math.cos(NEWS.tip),
  ride: true,
};

export function newsBoxes(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("news-boxes");
  const { count, pitch, bodyH, plinth, tip } = NEWS;
  const x0 = (-(count - 1) * pitch) / 2;
  const empty = r.int(0, count - 1);

  for (let i = 0; i < count; i++) {
    const x = x0 + i * pitch;
    const z = r.about(0, NEWS.shuffle);
    const yaw = r.about(0, NEWS.yaw);
    const paint = VEND_PAINT[r.int(0, VEND_PAINT.length - 1)];
    const at = { x, z, ry: yaw };
    s.part(`plinth-${i}`, slab(0.34, plinth, 0.32), mats.enamel, paint, { ...at, y: plinth / 2 });
    s.part(`body-${i}`, slab(0.42, bodyH, 0.4), mats.enamel, paint, { ...at, y: plinth + bodyH / 2 });
    // The sold-out one shows the notice instead of the masthead. It is the read
    // that used to come from a propped lid, and it costs nothing in the box.
    s.part(`window-${i}`, cellUv(panel(0.3, bodyH * 0.62), i === empty ? "noBills" : "masthead"), mats.print, 0xffffff,
      { ...at, y: plinth + bodyH * 0.6, z: z + 0.201 }, "keep");
    s.part(`glaze-${i}`, panel(0.33, bodyH * 0.68), mats.glass, 0xd4dbe2,
      { ...at, y: plinth + bodyH * 0.6, z: z + 0.204 }, "keep");
    s.part(`handle-${i}`, bar(0.014, [x - 0.13, plinth + 0.12, z + 0.22], [x + 0.13, plinth + 0.12, z + 0.22], 6), mats.steel, 0x8d949a);
    s.part(`coin-${i}`, slab(0.06, 0.1, 0.05), mats.steel, 0x8d949a, { ...at, x: x + 0.16, y: plinth + bodyH - 0.1, z: z + 0.19 });
    // The lid is still a real hinge on its own named group — a later pass can
    // swing it, and the collider it should use when it does is the body.
    const lid = s.pivot(`lid-${i}`, { x, y: plinth + bodyH, z: z - 0.2, ry: yaw, rx: tip });
    lid.part(`lid-${i}`, slab(0.45, 0.045, 0.43), mats.enamel, paint, { z: 0.215 });
  }
  return s.done();
}

/**
 * MAILBOX — the drop box on the corner.
 *
 * Observed: a rounded hood over a square body, which is the silhouette nothing
 * else on the street has; a pull-down door taking up most of the front; a
 * pedestal that is inset, so the box looks like it is floating a little; feet
 * bolted to the pavement.
 *
 * The seed moves: paint, how far the door hangs open, what is printed inside
 * it, and whether somebody has fly-posted the side. The box itself is a frozen
 * size — see the note at the top of the file.
 */
const MAIL = { w: 0.5, d: 0.46, bodyH: 0.6, plinth: 0.29 } as const;

/**
 * The hood's apex. A dome is not a flat top and the flat solid `spot.ts` builds
 * from this is an approximation either way — but an approximation at the apex
 * of THIS box is a couple of centimetres out at its shoulders, where the old
 * family constant was fifteen out over the whole thing.
 *
 * The door is deliberately outside the footprint: it is a 3 cm flap hanging
 * open, and a collider that swallowed it would be a wall standing in front of
 * the mailbox.
 */
export const mailboxSolid: PropBlock = {
  hx: MAIL.w / 2,
  hz: MAIL.d / 2 + 0.03,
  top: MAIL.plinth + MAIL.bodyH + MAIL.w * 0.275,
  ride: true,
};

export function mailbox(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("mailbox");
  const { w, d, bodyH, plinth } = MAIL;
  const paint = r.pick([0x1f4f8c, 0x2f6b46, 0x8c8f93] as const);
  const bodyY = plinth + bodyH / 2;

  s.part("plinth", slab(w - 0.12, plinth, d - 0.12), mats.enamel, 0x3c4046, { y: plinth / 2 });
  s.part("foot", slab(w - 0.02, 0.03, d - 0.02), mats.steel, 0x7f868c, { y: 0.015 });
  s.part("body", slab(w, bodyH, d), mats.enamel, paint, { y: bodyY });
  // The hood: a hemisphere squashed flat and pulled forward. It is the ONE
  // curved surface on the whole object and it does all the identifying.
  s.part("hood", squash(dome(w / 2, 12), 1, 0.55, (d / w) * 1.02), mats.enamel, paint, { y: plinth + bodyH });
  s.part("slot-lip", slab(w * 0.62, 0.03, 0.06), mats.enamel, 0x2b2e31, { y: plinth + bodyH + 0.08, z: d / 2 - 0.05 });

  const swing = r.range(0.05, 0.42);
  const door = s.pivot("door", { y: plinth + 0.1, z: d / 2, rx: swing });
  door.part("door", slab(w * 0.8, bodyH * 0.72, 0.03), mats.enamel, paint, { y: (bodyH * 0.72) / 2 });
  door.part("door-handle", bar(0.016, [-w * 0.24, bodyH * 0.66, 0.03], [w * 0.24, bodyH * 0.66, 0.03], 6), mats.steel, 0x9aa1a7);
  if (r.chance(0.45)) {
    door.part("door-plate", cellUv(panel(w * 0.5, 0.12), "regs"), mats.print, 0xffffff, { y: bodyH * 0.3, z: 0.018 }, "keep");
  }
  if (r.chance(0.4)) {
    s.part("flyposter", cellUv(panel(0.22, 0.3), "posterB"), mats.print, 0xffffff,
      { x: -w / 2 - 0.002, y: bodyY, ry: -Math.PI / 2, rz: r.about(0, 0.2) }, "keep");
  }
  return s.done();
}

/**
 * WHEELIE BIN — the two-wheeled roller bin, standing where it was left.
 *
 * Observed: the body TAPERS to its base, which is what stops it reading as a
 * fridge on its side; the lid overhangs at the front with a lifting lip; a comb
 * bar across the back for the lorry; two solid wheels on a steel axle, and the
 * bin leans back onto them when it is full.
 *
 * The seed moves: colour, and whether it has a bag hanging over the rim.
 *
 * The lid is SHUT at every seed, and that is the draw this family gave up. A
 * bin with its lid propped 40° back is not a surface at all — there is no flat
 * height `spot.ts` could build that would be on it — so the old factory flipped
 * `ride` and `top` together on a coin toss, and the one family constant the
 * game reads had to be one of the two answers and wrong for the other. Shut
 * bins land the same way every time. The lid is still on its own hinge group
 * with the real knuckle offset, so a later pass can swing it; when it does, the
 * collider it should use is the body, not the lid.
 *
 * The wheels reach further back than the body does, so the footprint is theirs.
 */
const BIN = { w: 0.6, d: 0.72, h: 0.98, lean: -0.045, open: 0.03 } as const;

export const wheelieBinSolid: PropBlock = {
  hx: BIN.w / 2 + 0.06,
  hz: Math.max(BIN.d / 2 + 0.03, BIN.d * 0.36 + 0.12),
  // The lid sits a few centimetres over the body, tilted by the bin's own lean.
  top: BIN.h + 0.03 + 0.46 * BIN.d * Math.sin(BIN.open - BIN.lean),
  ride: true,
};

export function wheelieBin(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("wheelie-bin");
  const { w, d, h, lean, open } = BIN;
  const paint = r.pick([0x2b2e31, 0x2f5f3a, 0x1f4f8c, 0x6f767c, 0x7a6a3a] as const);

  s.part("body", taperBox(w, d, h, 0.82), mats.poly, paint, { y: h / 2, rx: lean });
  // Two mould ribs down the flanks — a bin with none is a plastic slab.
  for (const dy of [h * 0.22, -h * 0.12]) {
    s.part("rib", slab(w + 0.012, 0.035, d * 0.9), mats.poly, paint, { y: h / 2 + dy, rx: lean });
  }
  s.part("comb", bar(0.028, [-w * 0.42, h * 0.94, -d * 0.44], [w * 0.42, h * 0.94, -d * 0.44], 6), mats.poly, 0x33363a);
  const axleY = 0.13;
  s.part("axle", bar(0.018, [-w * 0.5, axleY, -d * 0.36], [w * 0.5, axleY, -d * 0.36], 6), mats.steel, 0x7f868c);
  for (const sx of [-1, 1]) {
    s.part("wheel", pipe(0.115, 0.06, 10, false), mats.poly, 0x25282b,
      { x: sx * (w * 0.5 + 0.03), y: axleY, z: -d * 0.36, rz: Math.PI / 2 });
  }
  const lid = s.pivot("lid", { y: h + 0.01, z: -d * 0.46, rx: lean - open });
  lid.part("lid", taperBox(w + 0.03, d, 0.05, 0.98), mats.poly, paint, { y: 0.02, z: d * 0.46 });
  lid.part("lid-lip", slab(w * 0.5, 0.045, 0.05), mats.poly, paint, { y: 0, z: d * 0.96 });
  if (r.chance(0.3)) {
    // A bag over the rim. Two squashed blobs, and it is the difference between
    // a bin and a bin somebody actually uses.
    lid.part("bag", squash(dome(0.19, 8), 1, 0.9, 1), mats.poly, 0x2a2c2e, { y: 0.02, z: d * 0.72 });
  }
  return s.done();
}

/**
 * AC UNIT — a condenser bolted to a wall above head height.
 *
 * Observed: a rectangular box with ONE round grille on the front, which is the
 * whole read; a louvred coil pack on one flank; two lagged pipes running back
 * into the wall; L-brackets under it with a visible gap between the box and
 * the brick; a rust streak on the wall under the drain.
 *
 * WALL PROP. `z = 0` is the wall face and +Z is out into the street; `y` is
 * metres above the pavement, and the seed picks the mounting height, so lane B
 * only needs the wall's line and a yaw.
 *
 * The seed moves: mounting height, size, case colour, which flank carries the
 * coil, and how far the fan has stopped.
 */
export function acUnit(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("ac-unit");
  const w = r.range(0.72, 0.95);
  const h = r.range(0.56, 0.72);
  const d = r.range(0.3, 0.4);
  const y = r.range(2.3, 3.1);
  const paint = r.pick([0xb9bcc0, 0x9aa1a7, 0xd8d4c8] as const);
  const side = r.sign();
  const front = d + 0.06;

  s.part("case", slab(w, h, d), mats.enamel, paint, { y, z: 0.06 + d / 2 });
  s.part("case-top", slab(w + 0.02, 0.03, d + 0.02), mats.enamel, paint, { y: y + h / 2, z: 0.06 + d / 2 });
  // The guard: a bezel ring, the grille itself, and a hub. Three parts, 40
  // triangles, and it is the only thing on the object anybody looks at.
  s.part("grille", cellUv(disc(0.15, 12), "grille"), mats.print, 0xbfc2c4, { y, z: front + 0.002 }, "keep");
  s.part("bezel", ring(0.15, 0.175, 14), mats.enamel, paint, { y, z: front + 0.004 });
  s.part("hub", pipe(0.035, 0.05, 8, false), mats.steel, 0x6f767c, { y, z: front - 0.02, rx: Math.PI / 2 });
  s.part("coil", cellUv(panel(d * 0.8, h * 0.7), "grille"), mats.print, 0xa8aaad,
    { x: (side * w) / 2 + side * 0.002, y, z: 0.06 + d / 2, ry: (side * Math.PI) / 2 }, "keep");
  for (const sx of [-1, 1]) {
    s.part("bracket", slab(0.05, 0.05, 0.34), mats.steel, 0x7f868c, { x: sx * w * 0.36, y: y - h / 2 - 0.02, z: 0.17 });
    s.part("bracket-leg", bar(0.02, [sx * w * 0.36, y - h / 2 - 0.02, 0.02], [sx * w * 0.36, y - h / 2 - 0.3, 0.3], 5), mats.steel, 0x7f868c);
  }
  // Lagged pipe, out of the case and into the brick. Grey foam, taped.
  s.part("pipe-a", bar(0.035, [-w * 0.3, y - h / 2 + 0.06, 0.06], [-w * 0.3, y - h / 2 - 0.22, 0.02], 6), mats.poly, 0x8d8f92);
  s.part("pipe-b", bar(0.028, [-w * 0.3 + 0.09, y - h / 2 + 0.06, 0.06], [-w * 0.3 + 0.09, y - h / 2 - 0.34, 0.02], 6), mats.poly, 0x8d8f92);
  s.part("drain", bar(0.012, [w * 0.32, y - h / 2, 0.1], [w * 0.32, y - h / 2 - 0.5, 0.03], 5), mats.poly, 0x6d6f72);
  return s.done();
}

/**
 * A pallet, drawn once. Five deck boards, three bearers, three feet — the gaps
 * between the boards are the identity, so they are real geometry rather than a
 * stripe painted on a slab.
 */
function pallet(s: ReturnType<typeof sculpt>, mats: PropMaterials, r: ReturnType<typeof rand>, tag: string, y: number, yaw: number, tone: number): void {
  const { w, d } = PALLETS;
  for (let i = 0; i < 5; i++) {
    const z = -d / 2 + 0.07 + (i * (d - 0.14)) / 4;
    const broken = r.chance(0.08);
    s.part(`${tag}-board-${i}`, slab(broken ? w * r.range(0.4, 0.75) : w, 0.022, 0.13), mats.timber, tone,
      { x: broken ? r.about(0, 0.12) : 0, y: y + 0.128, z, ry: yaw });
  }
  for (const x of [-w / 2 + 0.07, 0, w / 2 - 0.07]) {
    s.part(`${tag}-bearer`, slab(0.09, 0.095, d), mats.timber, tone, { x, y: y + 0.065, ry: yaw });
  }
  s.part(`${tag}-base`, slab(w, 0.022, d * 0.42), mats.timber, tone, { y: y + 0.011, ry: yaw });
}

/**
 * PALLETS — a three-high stack against a wall, where a dock always has one.
 *
 * Observed: the stack is never square; the top pallet is the only one whose
 * boards you can see through, so it is the only one that has to be modelled
 * with its gaps; the ones under it read as a striped slab; the whole stack
 * greys off from the top down where the rain got at it.
 *
 * The seed moves: each layer's yaw and shuffle, the timber tone, which of the
 * top boards is snapped, the leaner, and the cartons on the deck.
 *
 * THREE HIGH, always. The height was the draw that made this the worst prop in
 * the library for the ride: a one-high stack carrying the four-high family
 * constant put the board a full pallet-height of clear air over its own deck,
 * and 0.44 m is the deck height a skate box has anyway.
 */
const PALLETS = { step: 0.15, count: 3, deck: 0.139, w: 1.16, d: 0.78 } as const;

/**
 * The top deck, which is the whole point of a stack of pallets: a 1.16 × 0.78
 * platform a skater can pop onto.
 *
 * The cartons on the deck and the broken one leaning on the side are NOT in it.
 * Cardboard is not a surface and the leaner is a board propped against the
 * stack, not part of it — the review page's ray probe skips both by material
 * for the same reason.
 */
export const palletsSolid: PropBlock = {
  // Just inside the deck rather than just outside it. A yawed top pallet pokes
  // 4 cm past this at the corners, which is the right way round to be wrong: a
  // collider a little smaller than the object is a corner you clip, a collider
  // a little larger is a wall standing in clear air beside it.
  hx: 0.59,
  hz: 0.4,
  top: (PALLETS.count - 1) * PALLETS.step + PALLETS.deck,
  ride: true,
};

export function pallets(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("pallets");
  const { count, step } = PALLETS;
  const tone = r.pick([0xc9ab7c, 0xb4a58e, 0x9d9789, 0xd6bd93] as const);

  // Everything below the top layer is a slab with the deck's stripe on its
  // edge — nobody can see through a pallet with another one sitting on it.
  for (let i = 0; i < count - 1; i++) {
    const y = i * step;
    const yaw = r.about(0, 0.14);
    s.part(`slab-${i}`, slab(PALLETS.w, 0.14, PALLETS.d), mats.timber, tone, { y: y + 0.07, ry: yaw, x: r.about(0, 0.05), z: r.about(0, 0.05) });
  }
  const top = (count - 1) * step;
  pallet(s, mats, r, "top", top, r.about(0, 0.16), tone);
  if (r.chance(0.4)) {
    // A broken one leaning against the stack. Its centre sits at half its own
    // vertical reach, so a 1.1 m board at 57° stands ON the pavement instead of
    // sinking a quarter of itself through it.
    const tilt = r.range(0.85, 1.1);
    s.part("leaner", slab(1.1, 0.13, 0.7), mats.timber, tone,
      { x: r.sign() * 0.74, y: 0.55 * Math.sin(tilt) + 0.06, z: r.about(0, 0.2), rz: r.sign() * tilt, ry: r.about(0, 0.6) });
  }
  // A carton or two on the top deck. The only cardboard in the library, and a
  // dock without one is a dock nobody has delivered to.
  if (r.chance(0.55)) {
    for (let i = 0; i < r.int(1, 2); i++) {
      const bw = r.range(0.34, 0.5);
      s.part(`carton-${i}`, slab(bw, r.range(0.24, 0.34), bw * r.range(0.7, 1)), mats.card, 0xd8c49a,
        { x: r.about(0, 0.28), y: top + 0.14 + 0.15 + i * 0.3, z: r.about(0, 0.16), ry: r.about(0, 0.5) });
    }
  }
  return s.done();
}

/**
 * What a crate is actually moulded in. NOT the vending primaries: a bulk
 * polyethylene moulding takes cheap pigment, so it comes out a muted brick, a
 * works blue, a dairy green, a bread-crate ochre or plain works grey. The first
 * cut painted them out of `VEND_PAINT` and a stack read as candy.
 */
const CRATE_PAINT = [0x9d4034, 0x2f5680, 0x35694a, 0xb2872f, 0x74797e, 0x8c3f5e] as const;

/**
 * ONE crate: an open frame with a dark inside, never a lidded box.
 *
 * This is the prop the library got wrong for a whole round, and the failure is
 * worth stating because it is a general one. The old crate was a capped
 * `taperBox` with a slab across its mouth and a dark quad drawn 4 cm below the
 * slab "so the crate reads as a container": the cap sealed it, the slab lidded
 * it, and the dark quad was buried under both. A ray dropped anywhere over the
 * footprint hit the lid and nothing else, roughly a quarter of every crate's
 * triangles rendered to nobody, and at 6 m the whole prop was a saturated
 * plastic tub with a flat tint on it and no surface event of any kind.
 *
 * So the read is built out of the geometry that actually makes it:
 *
 * - the **well** is a solid mass set 3.5 cm inside the frame and tinted to half
 *   the crate's paint. It is the darker field you see BETWEEN the frame
 *   members, and it is a thing rather than the absence of one. HALF, not a
 *   third: the first cut took it to 0.32 and on the shade side a stack read as
 *   black blocks with a coloured edge, which is the other failure the art
 *   direction names.
 * - the **rim** and the **foot** are open bands, so the mouth is a mouth. From
 *   above you land on the well 6 cm down, which is what a container does.
 * - the **mid band and the four corner ribs** are the cage. They are what break
 *   the flat tint on a side into lit strips and shaded ones, they are what
 *   carries the paint at 8 m, and they are what a crate's silhouette is made of
 *   at the distance this game renders it.
 *
 * Eighty-eight triangles, one material, one merged mesh for the whole stack.
 */
function crateAt(
  s: ReturnType<typeof sculpt>,
  mats: PropMaterials,
  tag: string,
  x: number,
  y: number,
  z: number,
  yaw: number,
  size: number,
  h: number,
  paint: number,
  flipped: boolean,
): void {
  // Crates nest, so a crate is wider at its mouth. Turned over — which is what
  // half the crates on a real dock are, because they get sat on — the wide end
  // is at the bottom and every part is mirrored about the crate's own middle.
  const taper = flipped ? 1 / 0.9 : 0.9;
  const at = (t: number): { x: number; y: number; z: number; ry: number } =>
    ({ x, y: y + (flipped ? h - t : t), z, ry: yaw });
  const half = size / 2;

  s.part(`${tag}-well`, taperBox(size - 0.07, size - 0.07, h - 0.06, taper), mats.poly, shade(paint, 0.48), at((h - 0.06) / 2));
  s.part(`${tag}-rim`, taperBox(size, size, 0.055, 0.97, true), mats.poly, paint, at(h - 0.028));
  s.part(`${tag}-mid`, taperBox(size * 0.985, size * 0.985, 0.045, 0.98, true), mats.poly, paint, at(h * 0.46));
  // The foot band is grimed a shade down — the edge that gets dragged across a
  // yard, and the one horizontal line on the object that is not the paint.
  s.part(`${tag}-foot`, taperBox(size * 0.93, size * 0.93, 0.05, 0.97, true), mats.poly, shade(paint, 0.84), at(0.026));
  // The corner offsets are rotated by hand because `place()` turns the geometry
  // about the PART's own origin: a rib handed the un-rotated corner would spin
  // on the spot and stay on the crate's unyawed corner.
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (half - 0.033);
      const cz = sz * (half - 0.033);
      s.part(`${tag}-rib`, slab(0.07, h - 0.02, 0.07), mats.poly, paint,
        { x: x + cx * c + cz * sn, y: y + h / 2, z: z - cx * sn + cz * c, ry: yaw });
    }
  }
}

/**
 * CRATES — stacked plastic crates, the cheapest colour on the street.
 *
 * Observed: they come in piles rather than in a heap, because somebody stacked
 * them; the pile is never square to the wall; half of them are upside down; the
 * rim is a separate lip that catches the light; and the sides are open, which
 * at 6 m reads as a dark field inside a bright cage rather than as holes.
 *
 * COLOUR IS PER PILE, not per crate. A pile is one delivery from one dairy, and
 * six different colours stacked three high read at 15 m as a scatter of
 * confetti rather than as a stack of anything — a critic reading the street at
 * that distance said exactly that. Crates on a real dock come in runs, and the
 * variety belongs BETWEEN the piles.
 *
 * The seed moves: how many, how they divide into piles, each pile's colour, per
 * crate yaw and whether it is turned over, and the crate size for the whole set.
 *
 * Scenery, not matter — a crate you cannot knock through is worse than no
 * crate, which is the rule `spot.ts` already applies to traffic cones.
 */
export function crates(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("crates");
  const total = r.int(2, 5);
  const size = r.range(0.34, 0.4);
  const h = r.range(0.27, 0.32);

  // The piles, laid on a grid rather than walked at random. The old walk
  // stepped 0.34–0.46 m for a 0.38 m crate that was also yawed a fifth of a
  // radian — 0.42 m across its own diagonal — and then clamped x at ±0.95, so a
  // five-crate seed grew its piles THROUGH each other instead of beside them.
  // The pitch is 0.56 m against a worst case of 0.46 m across the diagonal of
  // the biggest crate at the fullest yaw, and the jitter below can close at
  // most 0.09 m of that. The clamp is gone because a grid never needs one.
  const piles: number[] = [];
  for (let left = total; left > 0; ) {
    const n = Math.min(left, r.int(1, 3));
    piles.push(n);
    left -= n;
  }
  const cols = Math.min(3, piles.length);
  const rows = Math.ceil(piles.length / cols);

  for (const [p, high] of piles.entries()) {
    const px = ((p % cols) - (cols - 1) / 2) * 0.56 + r.about(0, 0.02);
    const pz = (Math.floor(p / cols) - (rows - 1) / 2) * 0.54 + r.about(0, 0.02);
    const paint = CRATE_PAINT[r.int(0, CRATE_PAINT.length - 1)];
    for (let k = 0; k < high; k++) {
      crateAt(s, mats, `crate-${p}-${k}`,
        px + r.about(0, 0.025), k * h, pz + r.about(0, 0.025),
        r.about(0, 0.14), size, h,
        // One shade down every second crate: a run of the same moulding, not a
        // run of the same pixel. It is what keeps a pile from flattening into
        // one silhouette now that the colours no longer separate them.
        k % 2 ? shade(paint, 0.86) : paint, r.chance(0.35));
    }
  }
  return s.done();
}

/**
 * STANDPIPE — the fire brigade's inlet on the face of a building.
 *
 * Observed: a brass or painted-red siamese Y at about waist height, on a riser
 * that disappears into the wall; caps on chains that hang; a small sign plate
 * above it. It is the one thing on a blank brick wall at skater height, and it
 * is why a wall reads as a BUILDING rather than as the edge of the level.
 *
 * WALL PROP — `z = 0` is the wall face, `y` is metres above the pavement.
 *
 * The seed moves: brass or painted, one inlet or two, riser height, and
 * whether the caps are still on their chains.
 */
export function standpipe(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("standpipe");
  const y = r.range(0.75, 1.05);
  const brass = r.chance(0.55);
  const body = brass ? mats.steel : mats.enamel;
  const tone = brass ? 0xc9a44c : 0xa8322a;
  const twin = r.chance(0.6);

  s.part("wall-plate", slab(0.22, 0.22, 0.03), mats.steel, 0x8d949a, { y, z: 0.015 });
  s.part("riser", pipe(0.055, r.range(0.5, 0.9), 8), body, tone, { y: y - 0.2, z: 0.09 });
  s.part("body", pipe(0.075, 0.16, 8, false), body, tone, { y, z: 0.09, rx: Math.PI / 2 });
  const inlets = twin ? [-1, 1] : [0];
  for (const [i, sx] of inlets.entries()) {
    const x = sx * 0.11;
    s.part(`inlet-${i}`, bar(0.05, [0, y, 0.11], [x, y + 0.06, 0.27], 8), body, tone);
    s.part(`cap-${i}`, pipe(0.062, 0.05, 8, false), body, tone, { x, y: y + 0.06, z: 0.28, rx: Math.PI / 2 });
    s.part(`cap-face-${i}`, disc(0.062, 8), body, tone, { x, y: y + 0.06, z: 0.305 });
    if (r.chance(0.7)) {
      s.part(`chain-${i}`, bar(0.008, [x, y + 0.04, 0.26], [x * 0.4, y - 0.12, 0.12], 4), mats.steel, 0x7f868c);
    }
  }
  s.part("sign", cellUv(panel(0.22, 0.13), "regs"), mats.print, 0xffffff, { y: y + 0.4, z: 0.012 }, "keep");
  if (r.chance(0.5)) {
    s.part("bracket", cone(0.02, 0.05, 0.09, 6, false), mats.steel, 0x8d949a, { y: y - 0.62, z: 0.09 });
  }
  return s.done();
}
