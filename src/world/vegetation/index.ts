// THE VEGETATION LIBRARY — the door every map comes in through.
//
// WHAT THIS EXISTS TO FIX. Map 2's hillsides were three stacked cones per tree,
// flat-shaded, in one dark green, instanced twice. The player looked at a frame
// of it and said the trees were wrong, and pointed at
// https://github.com/dgreenheck/ez-tree. He is right and the diagnosis is
// specific: a cone has no EDGE. Foliage is read off its outline — sprays that
// stop ragged, holes you see sky through, a top that thins rather than meeting
// a point — and a cone has none of that at any triangle count. Nothing here is
// coarsened to look old: the register for this round is that the SURFACES are
// modern and the era lives in the grade, so these are real tapering trunks,
// real branch structure and alpha-tested needle mass, then handed to the same
// post stack as everything else.
//
// HOW IT IS PUT TOGETHER (each file's own header carries the detail):
//   species.ts   the parameter space and the five profiles
//   grow.ts      seed → skeleton (adapted from ez-tree; see NOTICE.md)
//   mesh.ts      skeleton → triangles, at three levels of detail
//   atlas.ts     one foliage sheet, one bark map, three materials
//   forest.ts    instancing, detail bands, wind, and the per-tier budget
//
// THE BUDGET, stated so it can be argued with. These are MEASURED, off
// `tools/veg-lab.html`, which prints the live numbers — believe the page over
// this comment if the two ever disagree.
//
//   species      near     mid    card
//   pine         1080     366      4      16.4 m tall, 4.3 m across
//   fir          1572     526      4      14.5 m,      4.6 m
//   spruce       1740     582      4      18.9 m,      2.9 m
//   broadleaf     760     216      4      15.4 m,      7.6 m
//   scrub         348     106      4       3.1 m,      1.7 m
//
// …and what the review page's own hillside costs — 290 trees over 320 m of
// channel, five species, from a camera standing on the floor at one end:
//
//   tier          bands      near / mid / card      triangles   draws
//   desktop       46/130 m      53 / 84 / 153         103,700      63
//   phone         26/ 84 m      11 / 84 / 195          49,000      35
//   phone-low      —/ 66 m       0 / 82 / 208          35,800      15
//
// The shape of those rows is the whole design: the near band is small and
// expensive, the card band is large and free, and the mid band is where a
// forest actually lives. The draw-call column is the price of `variants` —
// see the note beside `BUDGET` in forest.ts, which names the knob.
//
// For comparison, the thing this replaces: two draw calls, about forty-four
// triangles a tree, and the player identified it as wrong from one screenshot.
//
// USING IT, from a map's own build step:
//
//   const forest = createForest({
//     tier,
//     placements,                    // you own where the trees go
//     cullDistance: 620 * tier.drawDistanceScale,   // your fog's far plane
//   });
//   group.add(forest.group);
//   // …and once a frame, from the same place the camera is updated:
//   forest.update(dt, camera.position);
//
// `update` is the one obligation. Without it every tree stays in whatever band
// it was first sorted into, which on the first frame is the band it has from
// the spawn point — a forest that never re-sorts is a forest drawn at full
// detail four hundred metres away and as a card at ten.

export { SPECIES, SPECIES_IDS, type SpeciesId, type TreeProfile } from "./species";
export { growTree, type Skeleton, type Spray, type Limb } from "./grow";
export { buildTreeMesh, buildImposterMesh, imposterMarks, imposterSize, detailFor, DETAIL, type Detail, type TreeMesh } from "./mesh";
export { vegetationMaterials, foliageAtlas, barkMap, imposterTexture, cellUv, type SprayCell, type VegetationMaterials } from "./atlas";
export {
  createForest,
  createTree,
  BUDGET,
  type Forest,
  type ForestBudget,
  type ForestOptions,
  type ForestStats,
  type TreePlacement,
} from "./forest";
