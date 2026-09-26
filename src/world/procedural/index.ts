// PROCEDURAL STREET PROPS — the library, and the contract lane B places against.
//
// Twenty hard-surface factories for the clutter a real downtown block is full
// of and this one has none of: posts, signs, a signal, cabinets, vending boxes,
// bins, pallets, crates, a bike rack, a hoarding, a barricade, a hatch, a
// planter and a street tree. Nothing here is generated art — it is primitives
// and procedural canvas materials, built in code, which is what the ticket asks
// for and what keeps the whole set inside a phone's budget.
//
// THE CONTRACT, in five lines, because two other lanes read it:
//
// 1. **Prop space.** The origin is the base centre, `y = 0` is the ground it
//    stands on, and the prop FACES +Z — the same rest facing the character rigs
//    use, so one yaw convention covers everything in the game. A `mount: "wall"`
//    prop puts `z = 0` on the wall face and builds itself at its own real
//    height above the pavement.
// 2. **`build(seed)` is pure.** Same seed, same object, every boot — the plaza
//    has to be judgeable. Different seeds differ in things you can SEE from a
//    board: colour, count, lean, what is printed on it, what is stacked on it.
// 3. **There is exactly ONE collider per family and every seed fits it.**
//    `STREET_PROPS[id].collider`: half-extents in x and z and the height you
//    land on — the same three numbers `spot.ts` already takes for a prop
//    (`PROP_BLOCK`) — plus `ride`, which says whether `top` is a surface or
//    just a ceiling. `null` means scenery, a thing a skater knocks through,
//    which `spot.ts` already rules is the right answer for traffic cones.
//
//    ONE, because the alternative was tried and it shipped a bug twice. This
//    library used to carry two numbers: a per-seed collider, which was true,
//    and a family RESERVATION over every seed, which was the worst case and
//    therefore wrong for every seed but one. Two lanes place these props and
//    they ask two different ways — `spot.ts` calls `streetPropCollider(id,
//    seed)`, `map2/layout.ts` reads `STREET_PROPS[id].collider` — and while
//    those two answers could differ, whichever one a level happened to read was
//    a coin toss. Reading the reservation put the board 38 cm in clear air over
//    one utility cabinet's roof, 30 cm over a single pallet, and gave thirteen
//    placed props a footprint wider than the object by more than a hand's
//    width, all while the review page proved the OTHER number green. A harness
//    passing over a live defect is worse than no harness, and the cause was
//    never the numbers: it was a type with two fields where the truth is one.
//
//    So the price is paid in the factories instead. The dimensions a collider
//    is made of — a cabinet's width, a post's height, how many pallets are in
//    the stack — are FROZEN per family in a `const` record, and the exported
//    block is computed from that same record. Both spellings of the question
//    now return the same frozen object, so neither lane can be the one that is
//    wrong. The seed still moves everything else, which is most of what you
//    see: paint, print, wear, counts of things that live inside the footprint,
//    lean, what is propped against it, what has been fly-posted on it. Two
//    seeds are still visibly two objects; they are just two objects of the same
//    size, the way two bollards in a row are.
// 4. **`bounds`** is the envelope over EVERY seed, not one instance — it is
//    bigger than the collider, because it covers the parts that hang outside
//    the solid on purpose (a signal's arm, a tree's crown, a mailbox's open
//    door). Lane B spaces on it; the instance's own measured box comes back in
//    `root.userData.prop.bounds` for anything that needs to be exact.
// 5. **`root.userData.prop.grindLines`** carries any line on THIS instance a
//    skater could lock onto, in prop space. Lane B decides whether to hand them
//    to the grinder; the library only says where they honestly are. They are
//    quoted at the same instance's `collider.top`, never under it.
//
// THE BUDGET, and how it is met. Every static part of a prop is merged into one
// mesh per material at build time (see `sculpt.ts`), and the whole library
// shares ELEVEN materials (see `mats.ts`). So a prop costs one mesh per
// material it uses and nothing per part: measured over 64 seeds of each,
// 1–7 meshes (median 3) and 40–522 triangles, one of every factory together
// **3,329 triangles**.
//
// The number that actually matters is the street, not the family, and this used
// to be quoted for "forty of them" — a count the map has never had. Built
// exactly as `spot.ts` places it, seeds and all: **55 props, 171 meshes,
// 10,232 triangles, 11 materials**, which is three draw calls a prop where a
// naive Object3D-per-part build of the same street would be six hundred. Every
// mesh also casts, so the shadow pass repeats those 171. `tools/props-lab.html`
// prints that line on every load, off the real placement list, so it cannot go
// stale again the way this paragraph did.
//
// 490 of those triangles are the canopies, and they were bought deliberately.
// The nine planted props are the only organic silhouette in the game and they
// were reading as faceted rock — see `green.ts` and `sculpt.mass()`. Smooth
// normals and the corner pulls that break the outline are free; the extra lobes
// that put NOTCHES in the crown are not, and 5% of the street's triangles is
// what a tree that reads as a tree costs.
//
// Those numbers, per factory, are printed by `tools/props-lab.html`, which is
// also where a critic looks at all twenty at gameplay distance under the game's
// own sun, where the stated bounds below are checked against the geometry over
// 64 seeds each, and where a grid of rays is dropped through the collider
// footprint of every rideable prop AT EVERY SEED to prove the landing height is
// the height of the geometry under it. That gate reads the same
// `STREET_PROPS[id].collider` the game reads, and there is nothing else for it
// to read — which is the point of point 3 above.

import * as THREE from "three";
import { propMaterials, type PropMaterials } from "./mats";
import type { GrindLine, PropBlock } from "./sculpt";
import {
  acUnit, mailbox, mailboxSolid, newsBoxes, newsBoxesSolid, pallets, palletsSolid, crates,
  standpipe, utilityCabinet, utilityCabinetSolid, wheelieBin, wheelieBinSolid,
} from "./boxes";
import { planter, planterSolid, treePit, treePitSolid } from "./green";
import {
  bollard, bollardSolid, busStop, busStopSolid, parkingMeter, parkingMeterSolid,
  signPost, signPostSolid, streetName, streetNameSolid, trafficLight, trafficLightSolid,
} from "./posts";
import { barricade, barricadeSolid, bikeRack, bikeRackSolid, cellarDoor, hoarding, hoardingSolid } from "./site";

export type { PropMaterials } from "./mats";
export type { GrindLine, PropBlock } from "./sculpt";
export { propMaterials, createPropMaterials, disposePropMaterials } from "./mats";

export type StreetPropId =
  | "bollard"
  | "parking-meter"
  | "sign-post"
  | "street-name"
  | "traffic-light"
  | "bus-stop"
  | "utility-cabinet"
  | "news-boxes"
  | "mailbox"
  | "wheelie-bin"
  | "ac-unit"
  | "standpipe"
  | "bike-rack"
  | "barricade"
  | "hoarding"
  | "cellar-door"
  | "pallets"
  | "crates"
  | "planter"
  | "tree-pit";

/** The space a prop occupies. Half-extents in x/z, and its floor and ceiling. */
export interface PropBounds {
  hx: number;
  hz: number;
  y0: number;
  y1: number;
}

/** Where a prop wants to be stood. */
export type PropMount = "ground" | "wall";

export interface StreetProp {
  id: StreetPropId;
  /** One line, for the review page and for a placement pass choosing. */
  what: string;
  mount: PropMount;
  /** The envelope over every seed — see the contract, point 4. */
  bounds: PropBounds;
  /**
   * What the ride is stopped by. THE collider — there is no other, and every
   * seed of this family is built to fit it. `null` is scenery.
   *
   * It is deliberately not the object's full extent: it is the object's honest
   * footprint at board height. A traffic light's is its pole, not the three
   * metres of arm over the road; a tree's is its trunk, not its crown.
   */
  collider: PropBlock | null;
  build(seed: number, mats?: PropMaterials): THREE.Group;
}

/** What `buildStreetProp` hangs on the root for the lanes downstream. */
export interface PropInstance {
  id: StreetPropId;
  seed: number;
  mount: PropMount;
  /** The family collider, carried through so a placed prop answers for itself. */
  collider: PropBlock | null;
  /** THIS instance's measured box, not the family envelope. */
  bounds: PropBounds;
  grindLines: readonly GrindLine[];
}

const P = (
  id: StreetPropId,
  what: string,
  mount: PropMount,
  bounds: PropBounds,
  collider: PropBlock | null,
  build: (seed: number, mats?: PropMaterials) => THREE.Group,
): StreetProp => ({
  id,
  what,
  mount,
  bounds,
  // FROZEN, because there is now exactly one of these per family and both maps
  // hold a reference to it at module scope. A caller that "adjusted" a collider
  // for its own placement would silently move every other placement of that
  // prop in both levels, and the symptom would be a landing height that is
  // wrong somewhere nobody was working.
  collider: collider && Object.freeze(collider),
  build,
});

/**
 * The library.
 *
 * The bounds below are measured, not guessed: `props-lab.html` builds 64 seeds
 * of every entry and prints the real envelope against the one stated here, and
 * a row that does not fit is a red line on the page.
 *
 * The `collider` column is not stated here at all — every entry hands over the
 * block its own factory file exports, built from the same frozen record the
 * geometry is built from. Two copies of a number in two files is how the last
 * one drifted; there is now one copy and it lives beside the draw.
 */
export const STREET_PROPS: Record<StreetPropId, StreetProp> = {
  bollard: P("bollard", "steel pipe bollard, domed cap, reflective band", "ground",
    { hx: 0.15, hz: 0.15, y0: 0, y1: 1.14 },
    // Narrow — narrower than the 0.2 m `spot.ts` calls the floor for a prop the
    // ride cannot step over in one frame. Bollards want placing in a ROW, where
    // the gap between them is the thing that reads, not as a lone stopper.
    bollardSolid, bollard),
  "parking-meter": P("parking-meter", "meter head on a post, single or twin", "ground",
    { hx: 0.19, hz: 0.12, y0: 0, y1: 1.61 },
    parkingMeterSolid, parkingMeter),
  "sign-post": P("sign-post", "U-channel post, one to three regulation blades", "ground",
    { hx: 0.36, hz: 0.12, y0: 0, y1: 2.47 },
    signPostSolid, signPost),
  "street-name": P("street-name", "corner pole, two crossed name blades, legible both ways", "ground",
    { hx: 0.48, hz: 0.46, y0: 0, y1: 3.03 },
    streetNameSolid, streetName),
  "traffic-light": P("traffic-light", "pole, mast arm, three-lens head, one lit", "ground",
    { hx: 3.58, hz: 0.24, y0: 0, y1: 4.32 },
    // The POLE, not the arm. A collider under the head would be an invisible
    // wall three metres out over the road.
    trafficLightSolid, trafficLight),
  "bus-stop": P("bus-stop", "flag pole with a timetable case", "ground",
    { hx: 0.25, hz: 0.18, y0: 0, y1: 2.62 },
    busStopSolid, busStop),
  "utility-cabinet": P("utility-cabinet", "steel cabinet on a pad — a real ledge", "ground",
    { hx: 0.8, hz: 0.45, y0: 0, y1: 1.21 },
    utilityCabinetSolid, utilityCabinet),
  "news-boxes": P("news-boxes", "rank of three honour boxes, one sold out", "ground",
    { hx: 0.75, hz: 0.30, y0: 0, y1: 0.96 },
    newsBoxesSolid, newsBoxes),
  mailbox: P("mailbox", "blue drop box, rounded hood, pull-down door", "ground",
    { hx: 0.27, hz: 0.45, y0: 0, y1: 1.05 },
    mailboxSolid, mailbox),
  "wheelie-bin": P("wheelie-bin", "two-wheeled roller bin, hinged lid", "ground",
    { hx: 0.38, hz: 0.42, y0: -0.03, y1: 1.28 },
    wheelieBinSolid, wheelieBin),
  "ac-unit": P("ac-unit", "wall condenser on brackets, pipes into the brick", "wall",
    { hx: 0.5, hz: 0.5, y0: 1.4, y1: 3.5 },
    // In the air, on a wall the facade already blocks. Nothing to hit.
    null, acUnit),
  standpipe: P("standpipe", "fire brigade inlet on a wall, capped and chained", "wall",
    { hx: 0.2, hz: 0.33, y0: 0, y1: 1.55 },
    null, standpipe),
  "bike-rack": P("bike-rack", "three inverted-U hoops in a row", "ground",
    { hx: 0.42, hz: 0.92, y0: 0, y1: 0.9 },
    bikeRackSolid, bikeRack),
  barricade: P("barricade", "timber A-frame, chevrons, warning lamp", "ground",
    { hx: 1.08, hz: 0.27, y0: 0, y1: 1.19 },
    barricadeSolid, barricade),
  hoarding: P("hoarding", "plywood site fencing, two bays, fly-posted", "ground",
    { hx: 2.37, hz: 0.13, y0: 0, y1: 2.24 },
    hoardingSolid, hoarding),
  "cellar-door": P("cellar-door", "steel pavement hatch, 90 mm proud", "ground",
    { hx: 1.0, hz: 0.85, y0: -0.02, y1: 0.9 },
    // FLAT. It is 90 mm of ridge on a pavement and the ride rolls straight over
    // it — a collider here would be a kerb across the middle of a line.
    null, cellarDoor),
  pallets: P("pallets", "three-high stack of timber pallets", "ground",
    { hx: 1.25, hz: 0.6, y0: 0, y1: 1.12 },
    palletsSolid, pallets),
  crates: P("crates", "piles of open plastic crates — scenery, knock through", "ground",
    { hx: 0.85, hz: 0.56, y0: 0, y1: 1.0 },
    null, crates),
  planter: P("planter", "precast tub with a shrub — a waxable rim", "ground",
    { hx: 0.8, hz: 0.85, y0: 0, y1: 2.72 },
    planterSolid, planter),
  "tree-pit": P("tree-pit", "street tree in a cast-iron grate", "ground",
    { hx: 2.0, hz: 1.8, y0: 0, y1: 5.6 },
    // The TRUNK. The crown starts 2.4 m up and blocking it would put a wall
    // over the pavement.
    treePitSolid, treePit),
};

export const STREET_PROP_IDS = Object.keys(STREET_PROPS) as StreetPropId[];

/**
 * What the ride is stopped by, for ONE placed prop.
 *
 * It returns `STREET_PROPS[id].collider` — the same object, by identity, not a
 * copy — and that is the whole point of it existing. Two lanes place these
 * props and they reach for the collider two different ways: `spot.ts` calls
 * this, `map2/layout.ts` reads the field. When those two answers could differ
 * the library shipped a bug in both directions at once, and the review page
 * proved whichever one it happened to ask green. They cannot differ now: every
 * seed of a family is built to one block, so there is one answer and both
 * spellings of the question return it.
 *
 * `seed` is kept in the signature and deliberately unused. It costs nothing, it
 * makes the call site say out loud that this is a query about a PLACED prop
 * rather than about a catalogue entry, and if a family ever earns per-seed
 * dimensions back it is the one call that would have to change rather than
 * every caller in two levels.
 */
export function streetPropCollider(id: StreetPropId, seed: number): PropBlock | null {
  void seed;
  return STREET_PROPS[id].collider;
}

/**
 * Build one, with its instance record attached.
 *
 * This is the call lane B should use rather than the bare factory: it measures
 * the box this seed actually came out at, carries the collider and the grind
 * lines through on `userData.prop`, and names the root so a scene graph dump
 * reads as a street rather than as forty anonymous groups.
 */
export function buildStreetProp(
  id: StreetPropId,
  seed: number,
  mats: PropMaterials = propMaterials(),
): THREE.Group {
  const prop = STREET_PROPS[id];
  const root = prop.build(seed, mats);
  root.name = `${id}-${seed}`;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const instance: PropInstance = {
    id,
    seed,
    mount: prop.mount,
    collider: prop.collider,
    bounds: {
      hx: Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
      hz: Math.max(Math.abs(box.min.z), Math.abs(box.max.z)),
      y0: box.min.y,
      y1: box.max.y,
    },
    grindLines: (root.userData.grindLines ?? []) as GrindLine[],
  };
  root.userData.prop = instance;
  return root;
}
