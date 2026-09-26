// The spot: its mesh, its dressing, its sky, and the light rig.
//
// THE GAME HAS TO LOOK LIKE ITS OWN KEY ART, and until this round it did not.
// The menu is a saturated golden-hour street; you pressed DROP IN and arrived
// under a pale blue midday dome with white cumulus in it. That is the first cut
// a player sees and it read as a different game — the single loudest complaint
// left on the spot. So the sky is the generated golden-hour panorama now, and
// everything that has to agree with a sky agrees with this one:
//
// · the SUN is turned to the sky's own sun, and the sky is turned to the light
//   rig — `SUN_AZIMUTH` is one number and both read it, so a shadow can never
//   point somewhere the picture behind it does not;
// · it is LOW — 15° instead of 22.6° — because raking light is the whole look.
//   A 5.6 m lamp standard throws 20.9 m of shadow at 15° against 13.4 at 22.6,
//   and those long stripes across the plaza are what tells you what time it is;
// · the fill SPLITS. Golden hour is warm key and COOL shade: the hemisphere's
//   sky half goes blue and its ground half goes hot, so a face in the sun is
//   amber and the same face in shadow is not merely darker, it is a different
//   colour. That split is most of what makes a picture read as evening rather
//   than as a dimmer switch;
// · the fog goes amber, because the haze between you and the far wall at this
//   hour is lit by the same sun everything else is.
//
// The geometry itself is not built here. It comes out of spot.ts, from the same
// description the ride's height queries read, which is the whole point.

import * as THREE from "three";
import { TIERS, isPhoneTier, type QualityTier, type TierName } from "../controllers/quality/tier";
import { loadTextureWithFallback } from "../controllers/quality/pick-asset";
import type { GenexGltfLoader } from "../controllers/quality/gltf-loader";
import type { SurfaceProvider } from "./surface";
import { buildSpotGeometry, STREET_SPOT } from "./spot";
import type { Solid } from "./spot";
import {
  CITY_SKYBOX_URL,
  buildFacades,
  buildFurniture,
  buildPaint,
  freezeStatic,
  buildRails,
  createMaterials,
  dressFacades,
  dressFurniture,
  dressMaterials,
  dressPaint,
} from "./props";
import type { Facades, Furniture, SpotMaterials } from "./props";
import { setPropTextureTier } from "./procedural/mats";
import { createCloudSky } from "./sky";
import { installPanoramaSky } from "./sky/panorama";

export const SKYBOX_URL = CITY_SKYBOX_URL;

/**
 * WHICH DEVICES GET THE VOLUMETRIC DECK.
 *
 * `src/world/sky/` has carried a working cloud system since it was built and no
 * map had ever put it in the scene — the sky over this block was the generated
 * panorama's own painted cirrus and nothing else, which is a soft pink smear
 * across the top-left of the frame and a very large amount of empty gradient
 * everywhere else. This is the wiring, and this set is the honest half of it.
 *
 * Desktop tiers only, and the reason is fill rather than memory. The noise is
 * three small textures — 442 KB shape + 131 KB detail + 65 KB weather at the
 * desktop sizes, and they are cached per size for the life of the page — which
 * is nothing next to the ~764 MB the last mobile preflight estimated against a
 * <700 MB budget. What a phone cannot afford is the MARCH: 14 steps over a sky
 * that is a fifth of a 585×1266 frame is 2.1M dependent 3D-texture fetches, and
 * this game had already spent that tier's budget on a chase camera pointed at
 * concrete. `clouds.ts` keeps its `phone` and `phone-low` rungs in
 * `CLOUD_STEPS`, deliberately: turning them on again is adding two names here
 * and nothing else.
 *
 * WHAT IT COSTS, measured on the desktop rung rather than taken from the module
 * header's estimate: A/B against the same run with the deck removed, interleaved
 * so the machine's thermal drift landed on both sides, at 2560x1440 with the
 * camera pitched UP so the sky is most of the frame — the worst case this game
 * has. **+0.72 ms** of median frame time, 10.03 → 10.75. An ordinary gameplay
 * frame is a chase camera pointed at concrete with the sky a strip along the
 * top, and the shader only runs on sky pixels (the dome is depth-tested, so
 * every wall and ramp in front of it rejects the fragment for free), so the
 * cost in play is a fraction of that. Memory is 638 KB of baked noise, once,
 * cached for the life of the page.
 *
 * A note on what this deck does NOT do, because it is the first thing a reader
 * of this file's lighting will ask: it does not touch the light rig. The
 * panorama is still `scene.background` and `scene.environment` and still does
 * all the image-based lighting; the clouds are an ordinary transparent mesh
 * drawn over the top with depth writes off. The plaza is lit by exactly the same
 * numbers it was before this line existed.
 */
const CLOUD_TIERS: ReadonlySet<TierName> = new Set<TierName>([
  "desktop-low",
  "desktop",
  "desktop-high",
]);

/**
 * The pieces the wheels roll on constantly and nothing ever stands beside. They
 * are drawn as receive-only: a floor casting onto itself buys nothing but acne,
 * and everything that should throw a shadow across it — walls, ledges, stairs,
 * the quarter pipe — is in the other batch.
 */
const FLOOR_IDS = new Set(["road", "crossing"]);
/**
 * …plus the footway strips the dropped kerbs are cut out of, and the six slabs
 * the plaza is now split into (`plaza-south`, `plaza-south-w`, and so on — one
 * per material zone). Matched by PREFIX rather than listed: the split into
 * footway/bays/footway is the kind of thing that gets refined again, and a
 * hand-kept list of ids is how a new slab quietly starts casting shadows onto
 * itself.
 */
const isFloor = (s: Solid): boolean =>
  FLOOR_IDS.has(s.id) || s.id.startsWith("footway-") || s.id.startsWith("plaza-");

/**
 * How much GROUND around the skater takes a cast shadow, in metres. The shadow
 * camera rides with him (see `trackShadow`), so this is a radius and not a
 * half-block: 40 m reaches the quarter pipe from the stair set and the far
 * facade from the middle of the plaza, which is every shadow the chase camera
 * can actually resolve. Past it the fog is already at 12–24% and a shadow is a
 * grey smear two pixels wide.
 */
const SHADOW_REACH_DEFAULT = 40;
/**
 * …AND WHAT A PHONE GETS INSTEAD, WHICH IS THE ONE NUMBER ON THIS MAP THAT WAS
 * NEVER TIERED.
 *
 * `tier.drawDistanceScale` reaches `camera.far` (main.ts) and `scene.fog`
 * (below) and stops there: the shadow box was 80 m across on a 3072 desktop map
 * and 80 m across on a phone's 1024, so the smallest device in the game was
 * shadowing the WHOLE 74 m block, every frame, from a sun that never moves.
 *
 * That is expensive on the axis a phone is actually short of. Profiled at the
 * phone tier (landscape, settled spawn view): the shadow pass is 173 draw calls
 * — MORE than the visible scene pass's 174 — for 1,039,440 triangles. The box
 * is what decides how many of those 173 there are, because three culls per
 * OBJECT against the shadow frustum, and this map's caster set is mostly small
 * separate objects: the 55 procedural street props are 171 draw calls between
 * them (3.1 apiece, merged per material), of which a phone keeps 30 / 94, and
 * the facade dressing adds 54 more single-mesh casters standing out at
 * z = 47…61 behind the north block.
 *
 * Counted over 252 positions along the ride line, cullable shadow-pass draws:
 *
 *   reach 40 m → 94.8 (101 at the spawn view)
 *   reach 30 m → 64.9
 *   reach 26 m → 52.8
 *   reach 24 m → 46.0  (48 at the spawn view)   ← `phone`
 *   reach 18 m → 28.8                            ← `phone-low`
 *
 * so 40 → 24 takes about 49 draws off a 173-draw pass (−28%, and −15% of the
 * frame's 347 total draws), and 40 → 18 takes about 66 (−39%).
 *
 * WHAT IT DOES NOT BUY IS TRIANGLES, and that is worth writing down so nobody
 * comes back here looking for them: the same count says the cullable casters
 * are 4,029 triangles of the 1,039,440. The million lives in the ~13
 * INSTANCED meshes the dressed street furniture becomes (30 generated props in
 * six kinds) — three culls an InstancedMesh as ONE object against its whole
 * instance spread, and that spread is the block, so no box this side of absurd
 * can touch them. That is a different lever in a different file.
 *
 * WHY 24 AND 18 RATHER THAN A ROUND HALF. The thing given up is cast shadows
 * beyond the reach, and on this camera that is a strip you can measure. The
 * chase lens sits 3.2 m back and 1.45 m up at 7.5° of pitch, so the eye is
 * ~1.9 m over the plaza with a 62° vertical field: ground at 24 m is 4.53°
 * below the horizon and ground at 40 m is 2.72°, so EVERYTHING this change
 * stops shadowing lives in a 1.8° band — about 11 css pixels of a 390 px
 * landscape phone frame — pressed against the horizon, under 9–19% of this
 * map's own haze. At the 4.2 m/s cruise the new edge is 5.7 s of riding ahead
 * of him on `phone` and 4.3 s on `phone-low`; he never rides into a shadow
 * appearing, because the box moves with him.
 *
 * And the same fit that loses those shadows sharpens the ones left, which is
 * the half of this a player can actually see: 48 m over a 1024 map is 4.69 cm a
 * texel across against 7.81 before it (2.4× the texels per square metre once
 * the down axis is counted), and 36 m over `phone-low`'s 512 is 7.03 cm against
 * 15.63 — a small board finally casting something with an edge on it.
 */
const SHADOW_REACH_BY_TIER: Partial<Record<TierName, number>> = {
  phone: 24,
  "phone-low": 18,
};
/**
 * The reach actually in force. A `let` for one reason only: the tuning panel's
 * "shadow reach" row. Every other number describing the map — the box's height,
 * its clip planes, both biases, and the TEXEL the snap rounds to — is derived
 * from it, so a panel that wrote the shadow camera's own `left`/`right` (which
 * is what a slider naturally does) would move the frustum out from under the
 * snap and put the crawl straight back. `setShadowReach` is the one door.
 */
let shadowReach = SHADOW_REACH_DEFAULT;
/**
 * Head-room the box has to hold above the plaza: the biggest air off the
 * quarter pipe's lip is about 5 m and the rider is 1.8 m of it, so 8 m is the
 * skater at the top of the loudest jump in the game plus a metre.
 */
const SHADOW_LIFT = 8;
/** The tallest thing that throws a shadow INTO that disc — the 15 m north block. */
const SHADOW_CASTER_TOP = 16;
/** How far down the sun ray the directional light itself is parked, in metres. */
const SUN_DISTANCE = 60;
/**
 * How far the receiver is pushed TOWARD the light before the depth compare, in
 * WORLD METRES — which is not the unit `shadow.bias` takes, and that mismatch
 * is what this constant exists to fix.
 *
 * `shadow.bias` is added to a depth already divided by the shadow camera's own
 * near→far range, so the same number means a different distance on every map
 * and every time somebody moves a clip plane. The old −0.0011 over a 1→160
 * frustum was **17.5 cm** of push along the ray — 6.6 cm of vertical lift at a
 * 22° sun, on a board whose wheels hold it 5.4 cm off the tarmac. That is the
 * whole of why the deck had no contact shadow: the bias alone was lifting the
 * board's shadow out from under it.
 *
 * 3.5 cm is 1.3 cm of vertical lift, which is a quarter of a wheel.
 */
const SHADOW_DEPTH_BIAS = 0.035;

/**
 * Where the sun is, in the ONE place both the light and the sky read it from.
 *
 * Azimuth is measured the way `equirectUv` samples the panorama — `atan2(z, x)`
 * — so the sky can be turned to put its own sun disc on this bearing and the
 * two can never drift apart. West-south-west: it rakes the length of the plaza,
 * lights the north facade (the backdrop of every north-bound run, and where all
 * the paint is) at a grazing 25°, and throws the stair set's and the quarter
 * pipe's shadows out across the main line rather than along it.
 */
const SUN_AZIMUTH = (1 * Math.PI) / 180;
/*
 * …and 1° is the PLAYER'S, dialled in the look lab over the live plaza on
 * 2026-07-29 and handed back with the intensity. It replaces the -160° the
 * paragraph above argues for, so read that paragraph as the case for the light
 * this one beat, not as a description of the light in the game.
 *
 * What his number changes, so nobody re-derives it as a bug: the sun now comes
 * from very nearly +x, which is the side the west block ISN'T on. The elevation
 * note below spends itself on the west block's 12 m throwing 29.7 m EAST across
 * the main line at 22° — at this bearing that throw goes the other way, off the
 * back of the level where nothing skates. So 22° is now cheaper than it was
 * when it was chosen, never dearer, and the constraint that picked it no longer
 * binds. The sky panorama turns with the bearing (SKY_SUN_AZIMUTH below), and
 * the bounce is placed off this same constant, so all three stay one light.
 */
/**
 * …and 22°, which is a measurement rather than a preference — of the west
 * building's own shadow.
 *
 * The comments around this file all argue from 15° and the code said 27, so
 * both were tried on the real spot. 15 is the better light and it puts the
 * whole level in the dark: the west block is 12 m tall standing at x = -38, and
 * at 15° above the horizon on this bearing it lays 12/tan 15° = 44.8 m of its
 * own shadow east across the plaza — past x = +4, which is the main line, the
 * crossing, the manual pad and the run at the quarter pipe. That is what 27 was
 * quietly buying and what nobody had written down.
 *
 * 22° is where the two meet: 29.7 m of building shadow, so it reaches x = -8
 * and stops short of the spine; the light still rakes (a 5.6 m lamp standard
 * throws 13.9 m, which is the long stripe across the concrete the look wants);
 * and the north facade — the backdrop of every north-bound run, and where all
 * the paint is — still takes the sun at a grazing 19°.
 */
const SUN_ELEVATION = (22 * Math.PI) / 180;
/**
 * How high the bounce comes in from. A wall does not have an elevation, so this
 * is where the CENTRE of the light coming back off a 10 m facade thirty metres
 * away sits — a little above head height and well below the sun, which is what
 * keeps it reading as a room's other wall and not as a second sun.
 */
const BOUNCE_ELEVATION = (35 * Math.PI) / 180;
/** Where the generated panorama's own sun sits, measured off the image. */
const SKY_SUN_AZIMUTH = (99 * Math.PI) / 180;

/**
 * THE LIGHT'S OWN FRAME — three unit vectors, and everything about the shadow
 * map below is arithmetic in them.
 *
 * `SUN_DIR` points from the plaza TOWARD the sun. `SUN_RIGHT` and `SUN_UP` are
 * the other two axes of the basis three itself builds when the shadow camera
 * does its `lookAt`, derived the same way (`z = normalize(eye − target)`,
 * `x = normalize(up × z)`, `y = z × x`) so that a metre measured here is a
 * metre measured there. They are the horizontal and vertical axes OF THE SHADOW
 * MAP, which is what makes both of the fixes below expressible at all: you
 * cannot fit a box to a light, or snap a camera to a texel grid, in world axes.
 */
const SUN_DIR = new THREE.Vector3();
const SUN_RIGHT = new THREE.Vector3();
const SUN_UP = new THREE.Vector3();

/**
 * ── THE SHADOW BOX, AND WHY IT IS NOT A SQUARE ─────────────────────────────
 *
 * It used to be ±40 m on BOTH axes of the map, which is the shape you write
 * when you are thinking in world metres. In the light's own frame that is
 * mostly empty sky: the map's vertical axis is `SUN_UP`, and a flat plaza seen
 * from a sun 22° above the horizon is FORESHORTENED into it — a ground disc of
 * radius R occupies 2·R·sin(22°) = 0.75·R of map height, not 2·R.
 *
 * So half the shadow map was rasterising air. Fitting the height properly is
 * **2.03× the texel density down the map for the same coverage and the same
 * megabyte**, and it is the single cheapest thing in this file.
 *
 * The other half of the fit is the one that looks wrong and is not: NO padding
 * is added for tall casters. In light space a caster and the ground it shadows
 * share the same (right, up) coordinate exactly — the shadow ray runs along
 * `SUN_DIR`, which is perpendicular to both axes, so travelling down it cannot
 * change either. A 15 m building therefore occupies precisely the strip of the
 * map its own shadow lands in. What DOES need room is anything the light has to
 * see ABOVE the plaza and behind the near clip: the skater at the top of an
 * air, which is what `SHADOW_LIFT` buys, and the depth range, which is what
 * `SHADOW_CASTER_TOP` buys on the near plane.
 *
 * ── WHAT IT IS WORTH, IN CENTIMETRES PER TEXEL ─────────────────────────────
 *
 * That is the unit that matters, because the thing the player called
 * "pixelated" is a deck 20 cm wide trying to cast a shadow through it.
 *
 * BEFORE: one square box of ±`max(SPOT_MAX_Z + 6, 40)` — and `SPOT_MAX_Z` is
 * 48, so that constant resolved to **54 m**, not to its own 40 floor. 108 m
 * across a 2048 map on every desktop tier = **5.27 cm a texel on BOTH axes**,
 * and a 20 cm deck is 3.8 texels wide. Plus `bias -0.0011` over a 1→160
 * frustum, which is 17.5 cm of push along the ray — see `SHADOW_DEPTH_BIAS`.
 *
 * AFTER, on `desktop` / `desktop-high` (the 3072 rung):
 *   across  80.0 m / 3072 = **2.60 cm**   (2.03× denser)
 *   down    39.4 m / 3072 = **1.28 cm**   (4.11× denser)
 *   → 8.3× the texels per square metre; the deck is 7.7 × 15.6 texels.
 * AFTER, on `phone` / `desktop-low`, which are handed NO extra memory at all:
 *   across  80.0 m / 1024 = **7.81 cm**   (1.35× denser)
 *   down    39.4 m / 1024 = **3.85 cm**   (2.74× denser)
 *   → 3.7× the texels per square metre, out of the fit alone.
 * AFTER, on `phone-low` (512): 15.63 across and 7.70 down, from 21.09 flat.
 *
 * …and those two phone lines are the DESKTOP-LOW reading now. Both phone tiers
 * take a shorter reach as well (`SHADOW_REACH_BY_TIER`, which is a draw-call
 * fix and not a resolution one), so their boxes are 48.0 × 27.4 m on `phone`
 * and 36.0 × 22.9 on `phone-low`: 4.69 cm across / 2.68 down on the 1024, and
 * 7.03 / 4.47 on the 512 — 2.4× and 3.8× the texels per square metre again, on
 * top of everything above. `desktop-low` keeps the 80 m box and the numbers as
 * printed.
 *
 * The two axes are different numbers now, and that IS the fit: the down axis is
 * where the old box was spending half its resolution on sky.
 *
 * The coverage that paid for it is the reach coming 54 → 40 m, and it is a real
 * trade rather than a free lunch: a cast shadow 45 m up the road is no longer
 * drawn. At that distance this map's fog is already at 12–24% and the shadow is
 * a two-pixel smear, and the tuning panel carries the slider — but it is the
 * one number in this block a player could notice going the wrong way.
 */
const BOX = {
  /** Half the box across the map. A ground disc projects 1:1 into this axis. */
  halfX: SHADOW_REACH_DEFAULT,
  /** …and down it, where the same disc is squashed by the sun's own elevation. */
  up: 0,
  down: 0,
  near: 0,
  far: 0,
};

/**
 * Rebuild the light's frame and the box fitted to it. Called once at module
 * load with the shipped angles, and again by `setSunAngles` when the tuning
 * panel swings the sun — which is the reason none of this is a `const` any
 * more: every number in `BOX` is a function of the elevation, so a sun the
 * player moves has to take its own shadow box with it or the fit stops being a
 * fit.
 *
 * Elevation is clamped well clear of the zenith: at 90° the sun is parallel to
 * `up`, the cross product that makes `SUN_RIGHT` collapses, and the whole basis
 * is a division by zero.
 */
function setSunBasis(azimuth: number, elevation: number): void {
  const el = Math.min(Math.max(elevation, (2 * Math.PI) / 180), (85 * Math.PI) / 180);
  const sin = Math.sin(el);
  const cos = Math.cos(el);
  SUN_DIR.set(Math.cos(azimuth) * cos, sin, Math.sin(azimuth) * cos);
  SUN_RIGHT.set(0, 1, 0).cross(SUN_DIR).normalize();
  SUN_UP.crossVectors(SUN_DIR, SUN_RIGHT).normalize();
  BOX.halfX = shadowReach;
  BOX.up = shadowReach * sin + SHADOW_LIFT * cos;
  BOX.down = shadowReach * sin + 2;
  const depth = shadowReach * cos;
  BOX.near = SUN_DISTANCE - depth - SHADOW_CASTER_TOP * sin - 3;
  BOX.far = SUN_DISTANCE + depth + 3;
}
/**
 * The angles actually in force. `SUN_AZIMUTH` / `SUN_ELEVATION` are where every
 * session starts and are still the one place the light and the sky agree; these
 * are the same two numbers after the tuning panel has been allowed to move them,
 * so the panorama's rotation follows the key rather than being pinned to the
 * shipped value — and so a reach change can refit the box around wherever the
 * sun currently is instead of snapping it back to the shipped elevation.
 */
let sunAzimuth = SUN_AZIMUTH;
let sunElevation = SUN_ELEVATION;
setSunBasis(sunAzimuth, sunElevation);

/** Push the fitted box onto a light's shadow camera, and re-derive its biases. */
function applyShadowCamera(sun: THREE.DirectionalLight): void {
  const c = sun.shadow.camera;
  c.left = -BOX.halfX;
  c.right = BOX.halfX;
  c.top = BOX.up;
  c.bottom = -BOX.down;
  c.near = BOX.near;
  c.far = BOX.far;
  c.updateProjectionMatrix();
  applyShadowBias(sun);
}

/**
 * THE MAP'S SIDE, and the one thing in this file that costs megabytes.
 *
 * A three.js shadow map is an RGBA8 colour attachment plus a 24-bit depth
 * texture — 8 bytes a texel — so the rungs are 512² = 2.1 MB, 1024² = 8.4,
 * 2048² = 33.6, 3072² = **75.5**. The step from 2048 to 3072 is therefore
 * **+42 MB**, and it is taken on `postLevel: 'full'` ALONE — `desktop` and
 * `desktop-high`, the same two tiers that pay for GTAO and the 4× MSAA target.
 *
 * Phones are not offered it at any preset, exactly the way `blur` and `dirt`
 * are vetoed in `look.ts`: the last phone preflight came back at ~870 MB
 * against a <700 MB budget, and 42 MB of shadow map is not the place to spend
 * on a device that cannot pay the bill it already has. `phone` keeps 1024² and
 * `phone-low` keeps 512², unchanged, and the box fit above hands both of them a
 * 2× denser map for nothing.
 */
function shadowMapSizeFor(tier: QualityTier): number {
  if (tier.shadowMapSize <= 0) return 0;
  return tier.postLevel === "full" ? 3072 : tier.shadowMapSize;
}

/**
 * Both biases, DERIVED from the box and the map rather than typed in — which is
 * the only way they can stay right, because the governor halves the map live
 * and every one of these numbers is a function of the texel it is protecting.
 *
 * · **`bias`** is a constant world distance (see `SHADOW_DEPTH_BIAS`) divided by
 *   the depth range it will be measured in.
 * · **`normalBias`** offsets the lookup along the surface normal and is the
 *   only tool that works at a grazing angle, where one texel of the map covers
 *   a large slide in depth. The right size for it is a bit over one WORLD
 *   texel, so it falls out of the box and the map side together: 3.1 cm on the
 *   3072 map, 4.7 on 2048, and clamped at 6 cm below that so a phone does not
 *   erase the board's own contact shadow trying to avoid acne it cannot see.
 */
function applyShadowBias(sun: THREE.DirectionalLight): void {
  const side = Math.max(1, sun.shadow.mapSize.x);
  const texel = (BOX.halfX * 2) / side;
  sun.shadow.bias = -SHADOW_DEPTH_BIAS / Math.max(1, BOX.far - BOX.near);
  sun.shadow.normalBias = Math.min(0.06, Math.max(0.018, texel * 1.2));
}

export interface Field {
  /** The plaza slab — kept under its old name so boot code reads unchanged. */
  ground: THREE.Mesh;
  sun: THREE.DirectionalLight;
  /** What the ride asks about the floor. Hand this to `new SkateModel(...)`. */
  surface: SurfaceProvider;
  materials: SpotMaterials;
  furniture: Furniture;
  paint: ReturnType<typeof buildPaint>;
  /**
   * The skyline's materials, so the generated building front can land on them.
   *
   * Optional because `Field` is the contract EVERY map returns and only this
   * one has a city block behind it — map 2 is a flume between two hillsides and
   * has no skyline to dress. A required field here would have made lane C carry
   * a property it has nothing to put in.
   */
  facades?: Facades;
  /**
   * Re-seat the shadow camera on the skater — the whole of what the boot loop
   * has to do per frame about lighting, and the fix for "the shadows flicker".
   *
   * It replaces three lines of `main.ts` that moved `sun.position` and
   * `sun.target` to the raw skater position. Nothing was wrong with FOLLOWING
   * him; what was missing is that the follow has to land on the shadow map's
   * own texel grid. A shadow map is rasterised from the light's point of view,
   * so a camera that slides a third of a texel between frames re-samples every
   * edge in the level against a different grid and every one of them crawls —
   * which is exactly what a player sees as sparkle along a kerb.
   *
   * Optional on the interface because `Field` is the contract BOTH maps return
   * and the spillway keeps its own (much wider) rig; a map that does not
   * implement this simply keeps a light that never moves.
   */
  trackShadow?(focus: THREE.Vector3): void;
  /**
   * Swing the key light, in degrees. The whole rig follows: the shadow box's
   * own basis, the cloud deck's lit face and the panorama's rotation are all
   * derived from these two numbers, so moving them here moves the sun and the
   * sky it belongs to together rather than leaving a shadow pointing somewhere
   * the picture behind it does not.
   *
   * TEMPORARY, for the tuning panel. It only bites while the boot loop drives
   * the light through `trackShadow` — a caller that still writes
   * `sun.position` itself will overwrite it on the next frame.
   */
  setSunAngles?(azimuthDeg: number, elevationDeg: number): void;
  /**
   * How far from the skater the shadow map reaches, in metres — the one knob
   * that trades sharpness against how much of the block still has shadows in it.
   *
   * It exists as a METHOD rather than as a slider writing `sun.shadow.camera`
   * because the camera is not the only thing that depends on this number: the
   * box's height, both clip planes, both biases and the size of the texel the
   * follow snaps to are all derived from it. A panel that set `camera.left`
   * and `camera.right` itself would leave the snap rounding to a texel the map
   * no longer has, which is the crawl this round exists to remove.
   *
   * TEMPORARY, for the tuning panel — same lifetime as `setSunAngles`.
   */
  setShadowReach?(metres: number): void;
  /**
   * The shadow map side this map wants at full quality, so the governor's
   * step-down rung halves the map THIS field built rather than the one the tier
   * table would have built. See `shadowMapSizeFor`.
   */
  shadowMapSize?: number;
}

export function createField(scene: THREE.Scene, tier: QualityTier): Field {
  // THE PHONE'S OWN SHADOW REACH, and it has to be the first thing this
  // function does: `BOX` is derived from it, the sun's camera is pushed from
  // `BOX`, and the texel the follow snaps to is measured off the same numbers.
  // Set it after the light is built and the snap would be rounding to a grid
  // the map no longer has.
  //
  // Gated on `isPhoneTier` rather than on a threshold, for the reason that
  // predicate exists (see its own note): the three desktop rows have to be
  // unreachable from here BY CONSTRUCTION. A desktop frame cannot move — no
  // desktop tier appears in `SHADOW_REACH_BY_TIER`, and on a miss nothing is
  // touched at all, so `shadowReach` stays at the 40 the module was loaded
  // with and `BOX` keeps the values `setSunBasis` gave it at load. The one
  // desktop machine that does land here is a desktop that picked Low or Medium
  // in the Quality picker, which is `detectTier` handing it a phone tier
  // outright — the same door the low sky rung and the texture caps already
  // come through.
  //
  // …and it deliberately re-runs the fit rather than writing `BOX` itself, so
  // a reach change and a sun swing stay one code path.
  const tierReach = isPhoneTier(tier) ? SHADOW_REACH_BY_TIER[tier.name] : undefined;
  if (tierReach !== undefined) {
    shadowReach = tierReach;
    setSunBasis(sunAzimuth, sunElevation);
  }
  // …and the clutter's own filtering, on the same gate. See `setPropTextureTier`.
  setPropTextureTier(tier);

  const materials = createMaterials();
  const group = new THREE.Group();
  group.name = "street-spot";

  let ground: THREE.Mesh | null = null;
  for (const [look, geo] of buildSpotGeometry(isFloor)) {
    const mesh = new THREE.Mesh(geo, materials[look]);
    mesh.receiveShadow = true;
    mesh.name = `spot-floor-${look}`;
    group.add(mesh);
    if (look === "concrete") ground = mesh;
  }
  for (const [look, geo] of buildSpotGeometry((s) => !isFloor(s))) {
    const mesh = new THREE.Mesh(geo, materials[look]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `spot-${look}`;
    group.add(mesh);
  }
  group.add(buildRails(materials));
  const facades = buildFacades(tier);
  group.add(facades.group);

  const paint = buildPaint(tier);
  group.add(paint.group);
  const furniture = buildFurniture(tier);
  group.add(furniture.group);
  scene.add(group);

  // Warm haze, tuned to the plaza's own size: the fog is there to put dust in
  // the air BETWEEN the skater and the far building, not to hide the end of the
  // world — and until now it could not, because it started where the far
  // building is. At 46 → 210 m, on a block whose whole diagonal is 95 m, every
  // surface in the spot came back at fog 0: the north wall from the middle of
  // the plaza is 34 m away and got none, the alley ends 95 m down the road got
  // 23%. One flat coat of colour on everything, at every distance, which is the
  // thing that makes a 66 m block read as a painted backdrop rather than a
  // place with depth in it.
  //
  // 14 → 150 puts the haze where the depth actually is: 4% at 20 m (the ledge
  // you are about to hit — nothing), 15% on the far wall, 24% on the buildings
  // behind it, 60% down the alley. The near plane is a hair under the width of
  // the plaza on purpose, so the skater's own board and the ledge under him are
  // never touched.
  //
  // THE COLOUR IS THE SKY YOU CAN ACTUALLY SEE, AND IT IS NOT AMBER.
  //
  // This is the fix for the loudest thing left on the opening frame: press DROP
  // IN and the picture cut to a cool blue sky over a street drenched in orange,
  // which read as two images stuck together. The cause was here. Haze is lit
  // air, so it takes the colour of whatever is lighting it — and looking INTO a
  // low sun that is amber, which is what the key art shows and what this fog
  // was set to. But this camera never looks into the sun: the main line runs
  // north, the sun is west-south-west by design (see SUN_AZIMUTH, which is what
  // puts it BEHIND you lighting the wall you ride at), so every gameplay frame
  // in this game is pointed 110° away from it. The haze in that direction is
  // the blue of the dome, not the gold of the disc — measured off the panorama
  // on this exact bearing at (147, 167, 199).
  //
  // So the far wall now fades toward the sky standing above it instead of away
  // from it, and the warm/cool split that makes an evening read is complete:
  // amber key, cool shade (the hemisphere below), cool air. Nothing about the
  // hour is lost — the SUN is still gold and everything it touches still is.
  //
  // 14 → 220, not 150, and the old comment's own arithmetic is what asked for
  // it: it claimed 15% haze on the far wall, and 14 → 150 puts 38% there. At
  // 38% a 66 m brick facade is more air than brick, which is a look for a
  // valley and not for a street you can throw a bottle across. 220 puts the far
  // wall at 24%, the buildings behind it at 34%, and the alley ends — 95 m down
  // the road, which is genuinely far — at 40%.
  scene.fog = new THREE.Fog(0xa9b1bd, 14 * tier.drawDistanceScale, 220 * tier.drawDistanceScale);

  // Low and hot, on the sky's own bearing — see SUN_AZIMUTH.
  //
  // 3.1 and not 4.1, and that came off the SURFACES table in props.ts rather
  // than off anybody's taste. The generated set is grey-balanced and is
  // multiplied down to real albedos now (concrete ~0.35, brick ~0.32, asphalt
  // ~0.12) where the old set carried a hand-picked amber tint that was doing
  // half the exposure's job for it. Against a 4.1 key through ACES at 1.12,
  // honest concrete facing this sun clips: the skyline came back at (195, 199,
  // 195) — a grey wall in golden light rendering as white paper. This is the
  // key that lands a lit plaza in the middle of the curve and leaves the
  // highlights somewhere to go.
  //
  // …and the KEY IS LESS ORANGE than it was, for the same reason it is less
  // bright. 0xffb765 is (255, 183, 101) — a 3200 K key, which is sunset, not
  // late afternoon — and the grade downstream then runs vibrance over it, which
  // by its own note "lifts the near-grey concrete hard". Grey concrete under
  // that key came out chocolate brown: measured on the main line, the plaza sat
  // at (128, 88, 76), a surface whose blue channel is 40% below its red. Real
  // concrete at this hour is a WARM GREY.
  //
  // …AND 0xffd2a6 RATHER THAN 0xffc489, because that correction did not go far
  // enough and the same measurement came back on the next capture. 0xffc489 is
  // (255, 196, 137) — red over blue of 1.86, which is about 3000 K and is what
  // the sun looks like with its disc ON the horizon. This one is 22° up (see
  // SUN_ELEVATION, which is measured off the west block's own shadow), and 22°
  // of atmosphere is nearer 3600 K. The difference is not taste, it is the whole
  // ground plane: captured on a real frame, the concrete came back at
  // red-minus-blue +43 to +56 flat and +97 to +114 where the sun rakes it, which
  // made the GREY plaza more saturated-orange than the RED BRICK standing over
  // it — 118,79,62 for the wall against 115,83,62 for the quarter pipe in front
  // of it, the same colour to within three levels on every channel. Four
  // materials, one colour, and that is the tell that nothing in the frame is
  // being read as a material at all.
  //
  // 0xffd2a6 is (255, 210, 166), 1.54 red over blue. Every lit face in the level
  // is still gold and the picture is still evening — the sky, the fog and the
  // long shadows are what say that, and none of them moved. What changes is that
  // grey concrete comes back a warm GREY instead of terracotta, and the brick
  // can go back to being the warmest thing in the frame, which it is.
  // 3.9 is the PLAYER'S OWN number, dialled on the live scene in the look lab
  // on 2026-07-29 and handed back. It is not a guess to be re-derived: 3.1 was
  // mine, he sat with the slider over the real plaza and stopped here. Anything
  // that wants to move it needs a reason he would recognise on screen.
  const sun = new THREE.DirectionalLight(0xffd2a6, 3.9);
  sun.position.copy(SUN_DIR).multiplyScalar(SUN_DISTANCE);
  const shadowMapSize = shadowMapSizeFor(tier);
  sun.castShadow = shadowMapSize > 0;
  if (sun.castShadow) {
    sun.shadow.mapSize.setScalar(shadowMapSize);
    // A soft-ish tap, and a note on WHICH filter this number belongs to,
    // because in three 0.185 there is only one that reads it.
    //
    // `WebGLProgram` maps exactly two shadow types to a define — `PCFShadowMap`
    // → `SHADOWMAP_TYPE_PCF` and `VSMShadowMap` → `SHADOWMAP_TYPE_VSM`. Anything
    // else, `PCFSoftShadowMap` INCLUDED, falls through to `SHADOWMAP_TYPE_BASIC`,
    // which is one hard comparison and ignores `radius` outright. So the boot's
    // `renderer.shadowMap.type = PCFShadowMap` is the correct setting and the
    // "softer" one next to it in the enum is a downgrade — worth saying here,
    // because reaching for PCF_SOFT is the obvious move the next time somebody
    // is asked to take the stair-step off an edge.
    //
    // What PCF costs and buys at 0.185: five Vogel-disk taps rotated per pixel
    // by interleaved gradient noise, each of them a hardware `sampler2DShadow`
    // fetch with `LinearFilter` — so four bilinear samples apiece, twenty
    // effective. `radius` scales the disc IN TEXELS. 1.4 is a hair over one, so
    // the disc covers the neighbouring texels and no further: enough to take the
    // stair-step off a kerb edge, and short of the point where five taps spread
    // far enough apart to read as rings. The IGN rotation is a function of
    // `gl_FragCoord` alone — no frame counter — so it adds no temporal noise of
    // its own, which matters on a fix whose whole subject is edges that crawl.
    sun.shadow.radius = 1.4;
    // Fitted in the LIGHT's frame, not the world's — see `BOX` for why it is
    // 80 m across and only 39 m down (48 × 27 on `phone` and 36 × 23 on
    // `phone-low`, where the reach is shorter), and why the clip planes are pulled in to
    // the disc: `shadow.bias` is quoted as a fraction of that depth range, so
    // over the old 1→160 the same number meant 17.5 cm of push where over this
    // 86 m it means 3.5.
    applyShadowCamera(sun);
  }
  scene.add(sun);
  scene.add(sun.target);

  // ── THE BOUNCE, and it is the one light in this rig that is not in the sky ──
  //
  // A golden-hour street has three sources, not two: the sun, the dome, and the
  // WALL OPPOSITE. Everything east of the main line is a 10–11 m brick facade
  // taking the 22° key full in the face, and what comes back off it is a broad,
  // soft, low light arriving from the OTHER side — which is the half of the
  // rider, the ledge and the quarter-pipe transition the sun cannot reach.
  //
  // The hemisphere light cannot do this and it is worth saying why, because the
  // temptation is always to turn the hemisphere up instead: three's hemisphere
  // term varies with `dot(N, up)` and NOTHING else, so it gives the same value
  // to the sunlit face of a wall and to its shaded face. It cannot separate two
  // vertical surfaces facing opposite ways, which is exactly the separation a
  // shaded skater needs to stop reading as a silhouette pasted on the plaza.
  //
  // It costs ZERO megabytes — one more directional light is a handful of ALU in
  // a loop three already runs — so it is on at every rung. It casts NO shadow,
  // deliberately: a bounce has no shadow in the real world either (it arrives
  // from a whole wall, not a point) and a second shadow map is the one thing
  // here that would cost real memory.
  //
  // 35° up and pointed back across the block, cool rather than warm: the brick
  // is warm but most of what a shaded face actually sees is SKY past the
  // roofline, and a second amber lamp is the mistake the ground half of the
  // hemisphere was already caught making (see below).
  const bounce = new THREE.DirectionalLight(0x9fb4cf, 0.42);
  bounce.position.set(
    -60 * Math.cos(SUN_AZIMUTH) * Math.cos(BOUNCE_ELEVATION),
    60 * Math.sin(BOUNCE_ELEVATION),
    -60 * Math.sin(SUN_AZIMUTH) * Math.cos(BOUNCE_ELEVATION),
  );
  bounce.castShadow = false;
  scene.add(bounce);
  scene.add(bounce.target);

  // …and the SPLIT that makes it evening. Sky half cool, ground bounce hot:
  // an up-facing surface out of the sun takes the blue of the dome away from
  // the sunset, a wall facing the plaza takes the amber coming back off lit
  // concrete. Shadows that are only darker read as an overcast day turned down.
  // 0.72 with the key, in the same proportion — the split is what does the
  // work here, not the level, and holding the ratio keeps shade the same
  // distance below sun as it was before the exposure was brought back down.
  // …and the sky half is 0xa3b6d0 rather than 0x8fb0dc. Half this level is in
  // the west block's shadow at any moment, and everything in it is lit by this
  // colour alone: at the old saturation the plaza in shade came back lilac,
  // which is a bigger lie about concrete than "merely darker" ever was.
  // …and the ground half is 0xab9a8c rather than 0xba9163, for the reason the
  // key came down: a bounce is the colour of what it bounced OFF. 0xba9163 is
  // (186, 145, 99) — 1.88 red over blue, i.e. more saturated-amber than the sun
  // itself, which would be a fair description of light coming back off a desert
  // and is not one of light coming back off a grey plaza. This bounce lights the
  // underside of every ledge, the toe of every transition and the whole west
  // block's shade, so half the level was taking its fill from a colour no
  // surface in the level actually is. 0xab9a8c is (171, 154, 140) — still warm,
  // still clearly the sunlit floor throwing light back up, and no longer the
  // second orange lamp in a two-lamp rig.
  //
  // …AND IT IS 0.34 NOW RATHER THAN 0.72, WITH THE DIFFERENCE HANDED TO THE
  // SKY ITSELF. This is the round's one change to the fill, and it moves no
  // light — it moves WHICH SOURCE the same light comes out of.
  //
  // Measured off the panorama this game already loads, integrated properly (the
  // cosine-weighted mean radiance over the upper hemisphere, in linear): the
  // dome sits at (0.293, 0.206, 0.212). At `environmentIntensity` 0.34 it was
  // handing an up-facing surface (0.100, 0.070, 0.072) of the fill and this
  // hemisphere light was handing it (0.084, 0.107, 0.145) — so 46% of every
  // shaded surface in the level was being lit by a term that, by construction,
  //
  //   · varies with `dot(N, up)` and nothing else, so it cannot tell the two
  //     faces of a wall apart, and
  //   · contributes NO SPECULAR AT ALL. Three's hemisphere light is a diffuse
  //     irradiance term; it is not in the specular sum.
  //
  // The environment does both. It is a real panorama, so a ledge facing the
  // roofline and one facing the alley take different colours, and it drives the
  // IBL specular every metal and every sheet of glass in `props.ts` was given
  // parameters for — the handrails at roughness 0.32 / metalness 0.85 and the
  // shopfront glass at 0.18 / 0.3 had a PBR response nothing was feeding.
  //
  // So: hemisphere 0.72 → 0.34, environment 0.34 → 0.50 (see `dressField`).
  // The arithmetic is in the file rather than in a report because the POINT is
  // that the fill is unchanged — env (0.147, 0.103, 0.106) plus hemisphere
  // (0.040, 0.051, 0.068) plus the new bounce (0.027, 0.034, 0.047) comes to
  // (0.213, 0.188, 0.221) against the old pair's (0.184, 0.177, 0.217): five
  // percent of luminance, which the meter eats, for every rough surface in the
  // level gaining a reflection it did not have.
  //
  // The COLOURS are untouched. 0xa3b6d0 stayed off the lilac the last round
  // measured, and 0xab9a8c is still the plaza's own grey-warm rather than the
  // desert amber before it.
  scene.add(new THREE.HemisphereLight(0xa3b6d0, 0xab9a8c, 0.34));

  // THE CLOUD DECK — see CLOUD_TIERS above for who gets it and why.
  //
  // Every colour it is handed already exists in this file, which is the whole
  // point of wiring it here rather than letting it pick its own defaults: the
  // sun DIRECTION is the key light's own (so the lit face of a cloud and the
  // long shadow across the plaza agree about where the sun is, and the
  // panorama's painted disc — which the sky is turned to match, see
  // SKY_SUN_AZIMUTH — agrees with both); the sun COLOUR is the key's 0xffd2a6,
  // so a lit billow is the same 3600 K as a lit wall; and the haze is the fog's
  // own 0xa9b1bd, so the deck fades into the same air the far buildings do.
  //
  // AND IT DOES NOT TOUCH THE FOG. The fog's near plane stays at 14 m — a hair
  // under the width of the plaza, which is what keeps the board and the ledge
  // under the skater at fog 0 — because a near start is what pre-mixed this
  // whole game to one amber wash the last time it was measured. The deck is a
  // separate transparent object with `fog: false`, and it does its own fading
  // at the horizon in its own shader, toward the same colour.
  //
  // COVERAGE at 0.22, well under `clouds.ts`'s own 0.45 "fair weather"
  // calibration and near its 0.2 "a few scattered puffs", because this sky is
  // not the subject and 0.38 was measured proving it: the first capture with
  // the deck wired came back with cloud from the rooflines to the zenith, a
  // grey-white blanket that had taken the golden hour out of the top third of
  // every frame. That is the same failure as a near fog start wearing a
  // different hat — one flat coat of colour laid over the picture — and this
  // game has already paid for that lesson once.
  //
  // The panorama behind it is a golden evening with a few high pink wisps, and
  // the deck's job is to put depth and drift in the strip above the rooflines
  // while that evening stays the thing you see. Opacity 0.7 finishes the same
  // argument: it is the honest knob for "less, please", and it keeps the
  // panorama's own colour reading through every thin edge instead of painting
  // over it.
  const clouds = CLOUD_TIERS.has(tier.name)
    ? createCloudSky({
        tier,
        sun: sun.position.clone().normalize(),
        sunColor: 0xffd2a6,
        haze: 0xa9b1bd,
        // The zenith, read off a capture of this spot looking up rather than
        // guessed: the dome above the block sits at a desaturated blue-grey,
        // and it is what the shaded underside of a billow is lit by.
        sky: 0x9fb6d2,
        coverage: 0.22,
        opacity: 0.7,
      })
    : null;
  if (clouds) {
    // Inside the spot's own group, so `maps.ts`'s mount/unmount snapshot picks
    // it up with everything else this map built and disposes it on a spot
    // change. (The baked noise is cached per size in `noise.ts` and outlives
    // the mesh on purpose — a second visit to this block pays nothing.)
    group.add(clouds.object);

    // WHY THE DOME DRIVES ITSELF, rather than being ticked from the game loop.
    //
    // `clouds.update()` has to run every frame — the dome is centred on the
    // camera and scaled off its far plane, so a sky that is never updated is a
    // sky sitting at the world origin at one unit across. `Field` is the
    // contract every map returns and it carries no per-frame hook, and `main.ts`
    // is not this lane's file to add one to. `onBeforeRender` is three's own
    // answer to exactly this: it fires with the camera the object is about to be
    // drawn from, which is also the only camera whose position and far plane are
    // the right ones to size a sky against.
    //
    // Two details it has to get right. The time base is WALL CLOCK rather than
    // an accumulated delta, because on the `high` preset the scene is drawn
    // twice a frame (the GTAO pass renders it again for its depth and normals)
    // and a hook that added a delta each time would drift the wind at double
    // speed on one tier and single on the others. And the world matrix is
    // rebuilt by hand, because `onBeforeRender` runs after the renderer has
    // already walked the graph — without this the dome would draw one frame
    // behind the camera, which at 16 m/s is a quarter of a metre of the sky
    // sliding every frame.
    const dome = clouds.object;
    let lastMs = performance.now();
    dome.onBeforeRender = (_renderer, _scene, cam): void => {
      const now = performance.now();
      const dt = Math.min((now - lastMs) / 1000, 0.1);
      lastMs = now;
      clouds.update(dt, cam as THREE.PerspectiveCamera);
      dome.updateMatrixWorld(true);
    };
  }

  // ── THE TEXEL SNAP ─────────────────────────────────────────────────────────
  //
  // The follow itself is right and is kept: a box that rides the skater spends
  // all of its texels where he is, which is the only reason a 40 m reach at
  // this density is affordable at all. What was missing is the snap.
  //
  // A shadow map is a rasterisation from the light's point of view. Move the
  // light's camera by a third of a texel and every depth in the map is sampled
  // against a grid that has shifted under it: a kerb edge that fell just inside
  // texel n falls just outside it next frame, comes back the frame after, and
  // the player sees the whole level's shadow edges boiling. It is worst on
  // exactly the geometry this game is made of — long straight edges at a
  // shallow angle to the grid — and it is worst while ROLLING, which is all of
  // the time.
  //
  // The fix is to quantise the focus to whole texels in the light's own frame
  // before anything is drawn from it. Then the grid is welded to the world: the
  // camera advances in whole-texel steps, every edge lands on the same texel it
  // landed on last frame, and the map is stable while the box still follows.
  // Nothing is damped and nothing lags — this is a rounding, not a filter.
  //
  // The third axis (`SUN_DIR`, the depth) is deliberately NOT snapped: it does
  // not index the map, and rounding it would move the near plane in steps.
  // WHERE THE SNAP IS INSTALLED, AND WHY IT IS NOT SIMPLY DONE IN `trackShadow`.
  //
  // A rounding to the texel grid is only correct if it is the LAST thing that
  // touches the light before the map is drawn. Put it in the follow and it is
  // one writer among several — the boot loop re-seats the light every frame,
  // the governor rebuilds the map at a different size, a future spot change
  // moves it — and any one of them lands after it and puts the jitter back.
  //
  // So the follow decides WHERE the light goes and this decides the sub-texel
  // rounding, at the only moment nothing can come after it: three calls
  // `shadow.updateMatrices(light)` from inside `WebGLShadowMap.render`, with
  // the world matrices already up to date, immediately before rasterising the
  // map. Delegating to the original afterwards is what keeps every other piece
  // of three's own bookkeeping — the frustum, the shadow matrix, the reversed-
  // depth branch — untouched. (Same shape as the two patches already in this
  // project: `attachBloomExposure` rewrites one line of the bloom's high-pass
  // shader, and `look.ts` wraps `UnrealBloomPass.setSize`.)
  //
  // It is a rounding of the WHOLE rig, not of the target alone: whatever offset
  // the caller chose between the light and its target is preserved exactly, so
  // the sun's DIRECTION cannot drift by so much as a degree — only the origin
  // of the grid moves, and it moves in whole texels.
  const snapDelta = new THREE.Vector3();
  let biasedFor = -1;
  if (sun.castShadow) {
    const baseUpdate = sun.shadow.updateMatrices.bind(sun.shadow);
    sun.shadow.updateMatrices = (light: THREE.Light): void => {
      const side = sun.shadow.mapSize.x;
      // Re-derived rather than cached, because the governor's shadow rung
      // halves `mapSize` live and both biases are functions of the texel.
      if (side !== biasedFor) {
        applyShadowBias(sun);
        biasedFor = side;
      }
      const texelX = (BOX.halfX * 2) / side;
      const texelY = (BOX.up + BOX.down) / side;
      const target = (light as THREE.DirectionalLight).target;
      const focus = target.position;
      const fx = focus.dot(SUN_RIGHT);
      const fy = focus.dot(SUN_UP);
      snapDelta
        .set(0, 0, 0)
        .addScaledVector(SUN_RIGHT, Math.round(fx / texelX) * texelX - fx)
        .addScaledVector(SUN_UP, Math.round(fy / texelY) * texelY - fy);
      target.position.add(snapDelta);
      light.position.add(snapDelta);
      light.updateMatrixWorld(true);
      target.updateMatrixWorld(true);
      baseUpdate(light);
      // Put the rig back where its owner left it, so the snap is a property of
      // the DRAW and never accumulates into the follow. Without this the light
      // would walk half a texel further from the skater every frame it was not
      // re-seated — a pause screen, a title screen, a bail.
      target.position.sub(snapDelta);
      light.position.sub(snapDelta);
    };
  }

  /** The follow. See `Field.trackShadow`. */
  const trackShadow = (focus: THREE.Vector3): void => {
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(SUN_DIR, SUN_DISTANCE);
    sun.target.updateMatrixWorld();
  };

  /** TEMPORARY — the tuning panel's sun swing. See `Field.setSunAngles`. */
  const setSunAngles = (azimuthDeg: number, elevationDeg: number): void => {
    sunAzimuth = (azimuthDeg * Math.PI) / 180;
    sunElevation = (elevationDeg * Math.PI) / 180;
    setSunBasis(sunAzimuth, sunElevation);
    if (sun.castShadow) applyShadowCamera(sun);
    // The light itself, so the change bites on the frame it is made rather than
    // on the next one the boot loop re-seats it.
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, SUN_DISTANCE);
    // …and the SKY with it, so a shadow can still never point somewhere the
    // picture behind it does not. Same turn `dressField` applies at load.
    const turn = new THREE.Euler(0, sunAzimuth - SKY_SUN_AZIMUTH, 0);
    scene.backgroundRotation = turn;
    scene.environmentRotation = turn.clone();
    // The bounce is the light off the facade OPPOSITE, so it has to swing with
    // the key rather than stay pinned to the shipped bearing — otherwise moving
    // the sun round the block leaves the fill arriving from a wall the sun no
    // longer lights, which is the one thing a player dragging this slider would
    // read as "the shading stopped making sense".
    bounce.position.set(
      -60 * Math.cos(sunAzimuth) * Math.cos(BOUNCE_ELEVATION),
      60 * Math.sin(BOUNCE_ELEVATION),
      -60 * Math.sin(sunAzimuth) * Math.cos(BOUNCE_ELEVATION),
    );
    // The cloud deck's lit face, for the same reason: a billow lit from the west
    // over a plaza whose shadows point east is the sky disagreeing with the
    // ground. `null` on the tiers that never built one.
    clouds?.setSun(SUN_DIR);
  };

  /**
   * TEMPORARY — the tuning panel's shadow-reach row. See `Field.setShadowReach`.
   *
   * Clamped at both ends for the same reason the elevation is: under about ten
   * metres the box is inside the chase camera's own boom and the skater rides
   * out of his own shadow map, and past ninety the texel is coarser than the
   * board is wide again, which is the defect this whole round exists to fix.
   */
  const setShadowReach = (metres: number): void => {
    shadowReach = Math.min(90, Math.max(10, metres));
    setSunBasis(sunAzimuth, sunElevation);
    if (sun.castShadow) applyShadowCamera(sun);
  };

  // ── FREEZE THE STATIC LEVEL, LAST, ONCE EVERYTHING IS PARENTED ─────────────
  //
  // This whole group is built once and never moves: the plaza slabs, the rails,
  // the six facades and their instanced shutters/panes/signs/reveals, all the
  // paint and ground wear, and the street furniture. Every one of those nodes was
  // recomposing an unchanging matrix every frame — see `freezeStatic`, which also
  // explains why `updateMatrix()` has to run before the flag comes off.
  //
  // Placed HERE, at the end, for the one reason that matters: `freezeStatic`
  // walks children, so it has to run after the last `group.add` above rather than
  // beside any of them.
  //
  // THE ONE EXCLUSION IS THE CLOUD DOME, and it is not optional. `clouds.object`
  // is deliberately parented inside this group (so a spot change disposes it with
  // everything else), and it moves itself EVERY FRAME — its `onBeforeRender`
  // copies the camera's position onto it and rescales it to `camera.far`. Freezing
  // it would nail the sky to wherever the camera was on the first frame. Pruning
  // it here leaves it and its subtree exactly as they were, auto-update and all.
  //
  // The props are NOT frozen from here: they are frozen inside `instance()`, so
  // that `dressFurniture`'s later replacements are covered too.
  const domeNode = clouds?.object;
  const frozen = freezeStatic(group, (o) => o === domeNode);
  void frozen;

  return {
    ground: ground as THREE.Mesh,
    sun,
    surface: STREET_SPOT,
    materials,
    furniture,
    paint,
    facades,
    trackShadow,
    setSunAngles,
    setShadowReach,
    shadowMapSize,
  };
}

/**
 * Streams in the generated surfaces, spray and street furniture. Called after
 * the scene is already up — the spot is playable on its stand-ins from the
 * first frame and gets better while you are riding it.
 */
export async function dressField(
  scene: THREE.Scene,
  field: Field,
  tier: QualityTier,
  renderer: THREE.WebGLRenderer,
  gltf?: GenexGltfLoader,
): Promise<void> {
  // Every phone takes the LOW rung of the sky, not just phone-low.
  //
  // The ladder hands a `phone` device the 4096x2048 sky: 42.7 MB decoded,
  // against 10.7 for the 2048 one. That trade is worth it in a game you play
  // looking up. This one is played inside a plaza ringed by 11–15 m of brick,
  // with the camera pointed at the floor — measured against the harness's own
  // cameras, the sky is a strip along the top of the frame and a source of
  // bounce light. 32 MB is most of a phone's whole texture budget for it.
  const skyTier = tier.name === "phone" || tier.name === "phone-low" ? TIERS["phone-low"] : tier;
  const skyJob = loadTextureWithFallback(SKYBOX_URL, skyTier, (u) =>
    new THREE.TextureLoader().loadAsync(u),
  )
    .then((tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      // `background` and `environment`, both written inside this one call. It
      // is the same picture — the same cube at the same size, the same PMREM
      // out of the same class — built explicitly so the game holds the two
      // objects three would have hidden in a WeakMap. That buys three things
      // the picture cannot tell apart: the cube's six per-face depth buffers
      // are never allocated, the PMREM's ping-pong twin is freed the moment it
      // has been blurred through, and a spot change can finally give the whole
      // family back (`maps.ts`). See `sky/panorama.ts` for the arithmetic.
      installPanoramaSky(scene, renderer, tex);
      // The sky is TURNED to the light rig rather than the rig to the sky, and
      // this is the line that keeps the picture honest: the panorama's sun disc
      // ends up on SUN_AZIMUTH, which is where every shadow in the plaza points
      // away from. Turned the other way the low sun would be blazing over the
      // north wall while the whole block threw its shadows north.
      const turn = new THREE.Euler(0, sunAzimuth - SKY_SUN_AZIMUTH, 0);
      scene.backgroundRotation = turn;
      scene.environmentRotation = turn.clone();
      // 0.50, up from 0.34, and the hemisphere light came down by the matching
      // amount of DIFFUSE in `createField` — so the plaza is not being filled
      // any harder, it is being filled by something that also reflects. The
      // measurement and the arithmetic are beside that hemisphere light; the
      // short version is that this is the only term in the rig that reaches the
      // specular sum, and the handrails, the shopfront glass and the wet-looking
      // asphalt were all given PBR parameters with nothing feeding them.
      //
      // It is still well under 1: the old note's warning is real — a dome this
      // bright taken to full strength washes the 22° key's contrast straight
      // out — and this is deliberately the largest step that keeps the sun the
      // reason anything in the frame is bright.
      scene.environmentIntensity = 0.5;
    })
    .catch((e) => console.warn("[spot] skybox failed", e));

  await Promise.all([
    skyJob,
    // `gltf` rides along so the texture dressers can reach the ONE KTX2 loader the
    // boot path already built (`gltf.loader.ktx2Loader`) — a phone then takes the
    // `.ktx2` sibling of each flat map texture at the same 1024² and 11 mips, for a
    // quarter of the bytes. It is threaded rather than made global on purpose: a
    // second KTX2Loader would mean a second transcoder worker pool. Desktop is
    // untouched by construction — `ktx2Textures` returns undefined off a phone tier,
    // so these calls receive no `ktx2Load` at all. The SKY deliberately does not get
    // it: `capDecodedImage` cannot redraw a CompressedTexture, and the cube and PMREM
    // are quadratic in the source, so a compressed sky is a net +80 MB.
    dressMaterials(field.materials, tier, renderer, gltf),
    field.facades ? dressFacades(field.facades.blocks, tier, gltf) : Promise.resolve(),
    dressPaint(field.paint, tier, gltf),
    gltf ? dressFurniture(field.furniture, tier, gltf) : Promise.resolve(),
  ]);
}
