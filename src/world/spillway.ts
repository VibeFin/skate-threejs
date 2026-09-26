// MAP 2 — THE SPILLWAY. Lane C owns this file and everything under `world/map2`.
//
// A flood-control channel behind the same town map 1's plaza is in: four
// hundred and fifty metres of concrete running downhill between two forested
// hillsides, with a road bridge over the middle of it and a chain-link fence
// along the top of both banks. It is built around TWO ideas, which are the
// ticket's, and the second one is the one the first cut of this map wrote down
// and did not build.
//
// **THE GRADIENT DOES THE PUSHING.** That is a measurement and not a mood. The
// ride settles a coasting board where `g·sinθ = ROLL_DRAG·v + ROLL_FRICTION`,
// and stepped through that balance from a standing start with the throttle
// never touched, this map hands you 50 km/h at the bottom of the chute, 88
// under the bridge — past the 17 m/s a push can reach — and 78 across the
// finale. Measured on the real ride over the real surface, not derived.
//
// **AND THE BANKS GIVE IT BACK.** The first cut claimed that and measured the
// opposite: one 0.35 s press of the carve key at twelve stations gave 55 → 18,
// 49 → 25, 47 → 0, 88 → 7. What was wrong was never `fall()`, which is exactly
// energy-conserving; it was the SHAPE, in three ways, all of them now fixed and
// all of them written up where they live:
//
// · **the bank was a 5.4 m ramp with a flat deck on top** — a 13.5 m/s toll
//   gate that ate a whole run and then dropped what was left on level concrete.
//   It is now a 2.0–3.4 m transition, a freeboard apron that curves up, a
//   77.5° freeboard wall that is RIDEABLE by a quarter of the ride's own wall
//   probe, and a walkway graded back toward the flume. There is no face
//   anywhere on the inside of this channel. See `THE BANK IS A THING YOU USE`
//   in channel.ts, and `PARAPET_SLOPE`, which is the single most load-bearing
//   number in the map.
// · **the furniture had square sides** — the flat upstream face of a 0.62 m
//   plinth took an 88 km/h run to 36 in one frame, and the centre island's east
//   face took a 54 km/h one to 21 by leaning on it. Every ramp is now a `wedge`
//   tapered to nothing at both ends; every ledge has a bank onto it and a
//   `chamfer` down the side the channel is on. See layout.ts's two rules.
// · **the launchers were bumps** — a ramp's rise is measured off the floor
//   DATUM and this floor falls at 0.14 to 0.26, so "0.9 m over 5 m, a 20° lip"
//   was a 10° lip and gave 0.21 m of rise at 77 km/h. `wedge` takes the angle
//   and works the height out. The finale is 1.97 m of ramp and throws you 20 m
//   with 5 m of ground falling away under the arc.
//
// WHERE THE PIECES LIVE:
//   channel.ts   the ground, as one closed-form surface (the shape and the fall)
//   features.ts  the obstacle vocabulary, in the channel's own frame
//   layout.ts    THE LEVEL — what is where, the rails, the furniture
//   mesh.ts      the same description, walked instead of sampled
//   surface.ts   the `SurfaceProvider` the ride asks
//   dressing.ts  surfaces, forest, fence, bridge, spray, sky
//
// It is not a reskin of map 1 and it does not share a line of its geometry.
// Map 1 is a plaza described as thirty yawed boxes; this is a field with no
// seams in it, and the two answer the same contract from opposite directions.

import * as THREE from "three";
import type { QualityTier } from "../controllers/quality/tier";
import type { Field } from "./field";
import type { GameMap } from "./maps";
import {
  buildBridge,
  buildClutter,
  buildConcrete,
  buildFence,
  buildForest,
  buildOutfalls,
  buildPaint,
  buildSteel,
  createMap2Materials,
  dressMap2Materials,
  dressPaint,
  dressSky,
  SUN_AZIMUTH,
  SUN_ELEVATION,
  type Map2Materials,
  type Painted,
} from "./map2/dressing";
import { SPILLWAY_SURFACE } from "./map2/surface";

/**
 * `Field` is map 1's shape and it carries three handles this map has no
 * equivalent of — its material record, its furniture instancer and its paint.
 * Rather than thread map 2's own set through a type that belongs to the street
 * lane, they ride along here and `dress` reads them back off the field it is
 * handed. One mount, one set, and nothing module-level to go stale when a
 * player swaps spots twice in a second.
 */
interface SpillwayField extends Field {
  spillway: { mats: Map2Materials; paint: Painted };
}

function build(scene: THREE.Scene, tier: QualityTier): Field {
  const mats = createMap2Materials();
  const group = new THREE.Group();
  group.name = "spillway";

  const concrete = buildConcrete(mats, tier);
  group.add(concrete);
  group.add(buildSteel(mats));
  group.add(buildFence(mats, tier));
  group.add(buildBridge(mats));
  group.add(buildOutfalls(mats));
  group.add(buildForest(tier, mats));
  group.add(buildClutter(tier));
  const paint = buildPaint(tier);
  group.add(paint.group);
  scene.add(group);

  // The haze, and it is doing the map's most important job after the gradient.
  //
  // You see four hundred metres down this channel from the top of it, and what
  // makes that read as four hundred metres rather than as a long grey corridor
  // is that the far end is a different colour from the near end. 90 → 620 puts
  // nothing on the block you are about to hit, a fifth on the bridge, and three
  // fifths on the far ridge — enough that distance reads, and not so much that
  // the far half of the map goes to one flat colour with no form left in it.
  //
  // Blue, because this is a midday sky and the air between you and the far
  // hillside is lit by it — map 1's amber over this sun would be the tell that
  // the two maps were graded by different people. And DEEPER than it looks like
  // it should be, which is a bloom fact rather than an atmosphere one: the look
  // stack blooms anything over 0.46 scene-linear (`bloomThreshold` at the
  // renderer's own 1.12 exposure), and the first pale-blue haze this map had
  // sat at 0.65 in the blue channel. Measured by looking — three hundred metres
  // of fully-hazed channel is a very large area of one colour, and over the
  // knee the whole far half of the map rendered as a white void with a bloom
  // halo round it. Everything here is under the knee on all three channels.
  scene.fog = new THREE.Fog(0x94a4b2, 90 * tier.drawDistanceScale, 620 * tier.drawDistanceScale);

  // See `SUN_AZIMUTH` in dressing.ts for where it points and why this map is
  // midday where map 1 is six o'clock.
  //
  // 2.1 and not map 1's 4.1, and the difference is the surfaces rather than the
  // hour: every basecolor in this round is a bright overcast plate, and a
  // channel floored, walled and decked in the SAME pale concrete has nothing
  // dark in it to hold an exposure down. Measured by looking — at 3.4 over a 1.0
  // hemisphere and untinted basecolors the whole thing rendered as paper, with
  // the form joints and the shadow of a spine equally invisible.
  const sun = new THREE.DirectionalLight(0xfff2df, 2.1);
  sun.position.set(
    90 * Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
    90 * Math.sin(SUN_ELEVATION),
    90 * Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
  );
  sun.castShadow = tier.shadowMapSize > 0;
  if (sun.castShadow) {
    sun.shadow.mapSize.setScalar(tier.shadowMapSize);
    // Wide enough that a bank's own shadow reaches the floor across a 47 m
    // section, tight enough that the texels still land on a ledge edge. The
    // light rig FOLLOWS the skater (`main.ts` re-seats it every frame off the
    // offset this position sets), so the box only ever has to cover the reach
    // he is in — which is the only reason a 450 m map can have real shadows.
    const c = sun.shadow.camera;
    c.left = -58;
    c.right = 58;
    c.top = 58;
    c.bottom = -58;
    c.near = 1;
    c.far = 260;
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.04;
  }
  scene.add(sun);
  scene.add(sun.target);

  // Cool sky, warm ground — the same split map 1 uses, with the hours swapped.
  // At midday the fill IS the dome, and what comes back off the hillsides is
  // dry dirt, so the east bank in shade reads blue and the floor at its toe
  // reads tan. 0.5 and not 1.0 for the reason the key came down: with the whole
  // channel cast in one pale concrete, fill is the thing that flattens it.
  scene.add(new THREE.HemisphereLight(0x9dc2e8, 0x8c7a58, 0.5));

  // THE SKY AND THE IMAGE-BASED LIGHT ARE CLAIMED HERE, SYNCHRONOUSLY, and this
  // is the one piece of scene state a map has to write on its way IN rather
  // than when its own art arrives.
  //
  // `maps.ts` diffs the scene's children to unmount a map, which is exact for
  // nodes and says nothing about `scene.background`, `scene.environment` or the
  // rotation on them — those belong to the SCENE, not to anything a map added.
  // So the street's golden-hour dome and its 0.34 of environment light survive
  // the swap and light this channel for the second and a half before the new
  // panorama lands. Measured by looking: the first frame of every run down here
  // came up pink, on a map whose whole identity is that it is the other hour.
  // A flat wash at the fog's own colour is what a hazy midday looks like before
  // there is a sky in it, and `dressSky` replaces it.
  scene.background = new THREE.Color(0xa9bccd);
  scene.environment = null;
  scene.backgroundRotation = new THREE.Euler(0, 0, 0);
  scene.environmentRotation = new THREE.Euler(0, 0, 0);
  scene.environmentIntensity = 0.22;

  const field: SpillwayField = {
    ground: concrete.children[0] as THREE.Mesh,
    sun,
    surface: SPILLWAY_SURFACE,
    // Map 1's three dressing handles. This map keeps its own in `spillway`
    // below; these are the shape the shared `Field` demands and nothing here
    // or in `main.ts` ever reads them.
    materials: {} as Field["materials"],
    furniture: { group: new THREE.Group(), slots: [] } as unknown as Field["furniture"],
    paint: { group: new THREE.Group() } as unknown as Field["paint"],
    spillway: { mats, paint },
  };
  return field;
}

/**
 * The generated surfaces, the spray and the sky, streamed in behind the first
 * frame. The channel is playable on its procedural stand-ins from the moment it
 * boots and gets better while you are riding it.
 */
async function dress(
  scene: THREE.Scene,
  field: Field,
  tier: QualityTier,
  renderer: THREE.WebGLRenderer,
): Promise<void> {
  const own = (field as SpillwayField).spillway;
  if (!own) return;
  await Promise.all([
    dressSky(scene, tier, renderer),
    dressMap2Materials(own.mats, tier, renderer),
    dressPaint(own.paint, tier),
  ]);
}

export const SPILLWAY_MAP: GameMap = {
  id: "spillway",
  name: "The Spillway",
  blurb: "A concrete flume that gives you speed for free. Big banks, bigger air.",
  build,
  dress,
};
