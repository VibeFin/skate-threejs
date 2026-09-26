// The only living things on the block.
//
// The spot has no vegetation at all, and that is the loudest single thing about
// it after the ramps: concrete, brick, asphalt, steel, sky. One street tree
// changes a plaza more than another ledge does — it breaks the roofline, it
// puts a soft mass in front of hard ones, and its shadow is the only shadow in
// the frame that is not a straight line. It is also the only prop here whose
// silhouette is not man-made, so it is the one that has to be built out of the
// most primitives and still stay cheap.
//
// The rule both of these follow: a canopy is MASSES, not leaves. Half a dozen
// squashed, lumpy hulls clustered off-centre read as a crown from 8 m and cost
// twenty triangles each; a thousand alpha-tested leaf cards read as grey haze
// and cost the frame. That is the PS2-era answer and it is still the right one.
//
// What it is NOT is a bag of icosahedra. Those same twenty triangles ship
// flat-shaded unless you take the normals off them yourself, and a flat-shaded
// convex hull under a low sun is a rock: hard facets, full-range banding across
// one object, and a straight-edged outline. Foliage is sold by its EDGE and by
// the absence of facets, so both are bought explicitly in `sculpt.mass()` —
// read the note there, it is the whole difference between a canopy and a
// boulder, and it costs nothing.

import * as THREE from "three";
import { propMaterials, cellUv, type PropMaterials } from "./mats";
import { rand, type Rand } from "./rng";
import { bar, bend, cone, mass, panel, sculpt, shade, slab, span, spanned, taperBox, type PropBlock } from "./sculpt";

/**
 * Foliage green, and only green.
 *
 * Two of the five tones here used to be mustard — `0x8a7a2a` and `0x7e6b30` —
 * on the argument that it is late in the year and half the trees are turning.
 * They are gone. `leafMap()`'s base is a pale cream (`#dfe3ce`) and the vertex
 * tone MULTIPLIES it, so a mustard tone over that map is not an autumn canopy,
 * it is sandstone; put it on a faceted hull and a planter's shrub reads at
 * 5.6 m as two ochre boulders sitting in a concrete tub. Autumn survives as the
 * two warm greens at the end of the list, which are as far toward yellow as
 * this material can go and still be a leaf.
 */
const LEAF_TONE = [0x4c6a2e, 0x577a34, 0x3f5b28, 0x6b8236, 0x7c8a33] as const;

/**
 * A crown of masses around a point. Off-centre on purpose: a canopy built
 * concentrically reads as a lollipop, and the thing that makes it read as a
 * tree is that no two lobes are the same size or the same distance out.
 *
 * MANY SMALL rather than few large, which is the second half of the fix the
 * masses themselves are the first half of. Three big lobes give you three big
 * convex outlines and three big flat-ish fields of one tone however well they
 * are shaded; five or six smaller ones give the concavities BETWEEN lobes, and
 * a canopy is read off those notches as much as off the mass.
 */
function crown(
  s: ReturnType<typeof sculpt>,
  mats: PropMaterials,
  r: Rand,
  at: { x: number; y: number; z: number },
  radius: number,
  lobes: number,
  tone: number,
): void {
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + r.about(0, 0.5);
    const out = i === 0 ? 0 : radius * r.range(0.45, 0.85);
    const rad = radius * (i === 0 ? r.range(0.5, 0.66) : r.range(0.3, 0.5));
    s.part(
      `crown-${i}`,
      // Barely squashed, and properly lumpy. The first pass flattened every
      // lobe to 0.62–0.86 of its own radius and the tree came out an umbrella
      // pine: a wide flat slab on a stick. 0.32 of pull is as far as the hull
      // goes before it folds through itself, and it is what makes a twenty-
      // triangle ball read as a mass of leaves rather than as a ball.
      mass(rad, r.range(0.78, 0.98), 0.32, r),
      mats.leaf,
      // Each lobe is tinted a little differently, which is what stops a
      // clustered canopy reading as one moulded lump.
      shade(tone, r.range(0.84, 1.12)),
      {
        x: at.x + Math.cos(a) * out,
        y: at.y + r.about(0, radius * 0.38),
        z: at.z + Math.sin(a) * out,
        ry: r.range(0, 3),
      },
      3.2,
    );
  }
}

/**
 * PLANTER — a precast tub with something in it.
 *
 * Observed: the rim overhangs the body and is the part everybody sits on, so it
 * is worn pale and rounded; the soil sits 100–150 mm below the rim, which means
 * you can see DOWN into it from standing height and a planter drawn as a solid
 * block is instantly wrong; the body tapers slightly to its base; there is
 * always litter in the soil.
 *
 * The seed moves: the concrete tone, what is planted — a low shrub or a staked
 * whip — the leaf tone, and how the planting sits in the tub.
 *
 * The rim is a ledge and is published as one in `userData.grindLines`: 0.55 m
 * of precast with a 60 mm nose is exactly the thing a skater waxes.
 */
const TUB = { w: 1.36, d: 1.24, h: 0.55, rim: 0.07, lip: 0.06 } as const;

/**
 * The RIM, and nothing above it.
 *
 * The shrub is deliberately outside the number: a canopy is foliage, the
 * physics never lands on one, and the review page's ray probe skips `mats.leaf`
 * for exactly this reason.
 */
export const planterSolid: PropBlock = {
  hx: (TUB.w + TUB.lip) / 2,
  hz: (TUB.d + TUB.lip) / 2,
  top: TUB.h,
  ride: true,
};

export function planter(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("planter");
  const { w, d, h, rim, lip } = TUB;
  const tone = r.pick([0xb6b0a3, 0xc2bcae, 0xa8a294, 0xbdb09a] as const);
  const soilY = h - 0.16;

  s.part("body", taperBox(w, d, h, 0.9), mats.precast, tone, { y: h / 2 });
  s.part("rim", slab(w + lip, rim, d + lip), mats.precast, tone, { y: h - rim / 2 });
  // The well: four inward-facing panels and a floor. Five quads, and without
  // them the planter is a block with a hat on.
  s.part("soil", panel(w - 0.12, d - 0.12), mats.leaf, 0x4a4034, { y: soilY, rx: -Math.PI / 2 }, 2.6);
  for (const [i, sx] of [-1, 1].entries()) {
    const inside = shade(tone, 0.6);
    s.part(`well-x-${i}`, panel(d - 0.12, 0.2), mats.precast, inside, { x: (sx * (w - 0.12)) / 2, y: soilY + 0.1, ry: (-sx * Math.PI) / 2 });
    s.part(`well-z-${i}`, panel(w - 0.12, 0.2), mats.precast, inside, { z: (sx * (d - 0.12)) / 2, y: soilY + 0.1, ry: sx > 0 ? Math.PI : 0 });
  }

  const tone2 = LEAF_TONE[r.int(0, LEAF_TONE.length - 1)];
  if (r.chance(0.35)) {
    // A whip: a real little tree, staked, the way a city plants one.
    //
    // With one crown call on top of a bare stem this came out as the exact
    // lollipop the header warns about — a stick with one green lump. A young
    // tree is a stem that has BRANCHED twice; the sprigs are what say so, and
    // at 6 m they are the difference between a sapling and a cotton bud.
    const th = r.range(1.5, 2.1);
    s.part("stem", cone(0.028, 0.05, th, 6), mats.timber, 0x6b5a44, { y: soilY + th / 2 });
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * Math.PI * 2 + r.about(0, 0.8);
      const y0 = soilY + th * r.range(0.52, 0.8);
      const reach = r.range(0.2, 0.34);
      const end: [number, number, number] = [Math.cos(a) * reach, y0 + r.range(0.14, 0.3), Math.sin(a) * reach];
      s.part(`sprig-${i}`, bar(0.013, [0, y0, 0], end, 4), mats.timber, 0x6b5a44);
      crown(s, mats, r, { x: end[0], y: end[1], z: end[2] }, r.range(0.24, 0.34), 2, tone2);
    }
    crown(s, mats, r, { x: 0, y: soilY + th - 0.1, z: 0 }, r.range(0.42, 0.56), 4, tone2);
    s.part("stake", bar(0.018, [0.12, soilY, 0.06], [0.14, soilY + th * 0.66, 0.06], 4), mats.timber, 0xa8926c);
  } else {
    crown(s, mats, r, { x: r.about(0, 0.1), y: soilY + r.range(0.16, 0.26), z: r.about(0, 0.1) },
      Math.min(w, d) * r.range(0.4, 0.5), r.int(5, 7), tone2);
  }
  s.grind({ a: [-w / 2, h, d / 2], b: [w / 2, h, d / 2], kind: "ledge" });
  return s.done();
}

/**
 * TREE PIT — a street tree in the pavement.
 *
 * Observed: a cast-iron grate flush with the slabs, in a square pit; the trunk
 * leans, always, and it is the lean that keeps it from reading as a lamp post
 * with a bush on it; the crown starts high — the lower limbs are cut back for
 * lorries — so there is 2.5 m of clear trunk under it; a bar guard round the
 * base on the newer plantings.
 *
 * The seed moves: the tree's height, the lean and which way, the crown's size
 * and how many lobes, the leaf tone, whether a guard is fitted, and how far up
 * the branches fork.
 *
 * The most expensive prop in the library, and the one that changes the block
 * most. Its collider is the TRUNK only — the crown is 4 m in the air and
 * blocking it would put an invisible wall over the pavement.
 */
interface TreeDims {
  h: number;
  lean: number;
  leanZ: number;
  tone: number;
  forkY: number;
}

/**
 * The pit, the clear trunk and the guard are family constants; the tree above
 * them is not.
 *
 * `CLEAR` is the height the collider stands to, and the seeded fork is kept
 * ABOVE it on purpose — a tree that forked lower would put a solid standing up
 * through its own branches, and one that forked higher would leave the family
 * number quoting a height the trunk does not reach. The lean is bounded for the
 * same reason: at 0.055 rad the trunk's own edge at `CLEAR` is 0.22 m off
 * centre, inside the 0.24 m the collider claims, so the box contains the trunk
 * at every height it covers rather than at the base only.
 */
const TREE = { pit: 1.3, clear: 2.4, guard: 0.2, half: 0.24 } as const;

export const treePitSolid: PropBlock = {
  hx: TREE.half,
  hz: TREE.half,
  top: TREE.clear,
  ride: false,
};

function treeDims(r: Rand): TreeDims {
  const h = r.range(4.0, 5.2);
  const lean = r.about(0, 0.055);
  const leanZ = r.about(0, 0.045);
  const tone = LEAF_TONE[r.int(0, LEAF_TONE.length - 1)];
  const forkY = h * r.range(0.62, 0.7);
  return { h, lean, leanZ, tone, forkY };
}

export function treePit(seed: number, mats: PropMaterials = propMaterials()): THREE.Group {
  const r = rand(seed);
  const s = sculpt("tree-pit");
  const { pit } = TREE;
  const { h, lean, leanZ, tone, forkY } = treeDims(r);
  const topX = lean * h;
  const topZ = leanZ * h;

  // The grate: an iron plate with the slot pattern laid over it, and a frame
  // that is the only part standing proud of the pavement.
  s.part("grate", slab(pit, 0.05, pit), mats.iron, 0x8d857a, { y: 0.025 });
  s.part("slots", cellUv(panel(pit - 0.12, pit - 0.12), "grille"), mats.print, 0x9a938a, { y: 0.051, rx: -Math.PI / 2 }, "keep");
  s.part("kerb", slab(pit + 0.1, 0.06, pit + 0.1), mats.precast, 0xb6b0a3, { y: 0.03 });

  // The trunk is spanned from the pit to the fork rather than rotated about its
  // own middle — a leaning cylinder placed by Euler angles buries its base.
  const fork: [number, number, number] = [(topX * forkY) / h, forkY, (topZ * forkY) / h];
  const foot: [number, number, number] = [0, 0.02, 0];
  s.part("trunk", spanned(cone(0.085, 0.17, span(foot, fork), 6), foot, fork), mats.timber, 0x8a7660);
  // The limbs REACH — but they RISE more than they reach, and that ratio is the
  // difference between a street tree and an umbrella pine. The first cut had
  // them rising 0.9 m and spreading 0.7 and the tree was a lollipop on a stick;
  // the second overcorrected to 1.7 m of spread against 1.2 of rise and the
  // crown came out a flat slab wider than the tree was tall above the fork.
  const limbs = r.int(3, 4);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + r.about(0, 0.6);
    const reach = r.range(0.6, 1.15);
    const rise = r.range(0.55, 0.9) * (h - forkY);
    const end: [number, number, number] = [fork[0] + Math.cos(a) * reach + topX * 0.4, fork[1] + rise, fork[2] + Math.sin(a) * reach + topZ * 0.4];
    s.part(`limb-${i}`, bar(0.05 - i * 0.005, fork, end, 5), mats.timber, 0x8a7660);
    crown(s, mats, r, { x: end[0], y: end[1] + 0.12, z: end[2] }, r.range(0.5, 0.78), 2, tone);
  }
  // The head. Small lobes and a lot of them: the notches BETWEEN lobes are what
  // a canopy is read off at 10 m, and three big ones have no notches at all.
  crown(s, mats, r, { x: fork[0] + topX * 0.5, y: h - 0.45, z: fork[2] + topZ * 0.5 }, r.range(0.95, 1.25), r.int(6, 8), tone);

  if (r.chance(0.5)) {
    // A trunk guard, and a TIGHT one — 400 mm across, which is the size a city
    // actually fits and, not by accident, the size that stays inside the
    // collider the pit publishes. A guard out at the kerb line would be 0.55 m
    // of steel standing outside its own solid, which is a bar the board rides
    // straight through.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * TREE.guard;
      const z = Math.sin(a) * TREE.guard;
      s.part(`guard-${i}`, bar(0.014, [x, 0.02, z], [x, r.range(0.7, 0.95), z], 4), mats.steel, 0x8d949a);
    }
    s.part("guard-ring", bend(TREE.guard, 0.014, Math.PI * 2, 8, 4), mats.steel, 0x8d949a, { y: 0.78, rx: -Math.PI / 2 });
  }
  return s.done();
}
