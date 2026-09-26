// A FOREST — hundreds of trees, on a phone.
//
// The library above this file makes ONE tree well. This file is the answer to
// "and now do it two hundred and sixty times at sixty frames on a 2019
// Android", which is a different problem and is solved by three things:
//
// **Instancing.** One geometry, one material, one draw call, N transforms. That
// is not optional at this count — two hundred separate meshes is two hundred
// draw calls and a phone gives up somewhere under a thousand for the whole
// frame, with the skater, the channel, the fence and the bridge all wanting
// theirs.
//
// **Levels of detail, re-bucketed as you ride.** A tree at fifteen metres and a
// tree at two hundred are not the same object. `InstancedMesh` and `THREE.LOD`
// do not compose — LOD switches per OBJECT and every instance shares one — so
// the switching is done here instead: every placement carries a band, the bands
// are recomputed a few times a second against the camera, and each band's mesh
// draws only its own share. That costs one distance test per tree per rebucket,
// which for four hundred trees at six hertz is under a tenth of a millisecond,
// and it buys back ninety per cent of the triangles.
//
// **A hard cull.** Past the fog's own far plane a tree contributes nothing but
// vertex work, so it is not drawn at all. This is the single biggest win on
// `phone-low`, whose draw distance is half the desktop's.
//
// WHAT IS DELIBERATELY NOT HERE: placement. This is a library. Which hillside
// gets which species, at what density, standing on whose heightfield, belongs
// to the map that owns the hillside — a forest that knows where the trees go is
// a forest you cannot put anywhere else.

import * as THREE from "three";
import type { QualityTier, TierName } from "../../controllers/quality/tier";
import { rand } from "../procedural/rng";
import { imposterTexture, vegetationMaterials, type VegetationMaterials } from "./atlas";
import { growTree, type Skeleton } from "./grow";
import { buildImposterMesh, buildTreeMesh, detailFor, imposterMarks, imposterSize, type TreeMesh } from "./mesh";
import { SPECIES, type SpeciesId, type TreeProfile } from "./species";

export interface TreePlacement {
  species: SpeciesId;
  x: number;
  y: number;
  z: number;
  /** Radians. Random if omitted — a stand of trees all facing one way is a set. */
  yaw?: number;
  /** Multiplier on the species' nominal height. Default 1. */
  scale?: number;
  /** Picks the variant and the tint. Default: derived from the position. */
  seed?: number;
}

/**
 * Per-tier budget, and these are the numbers to argue with when the forest is
 * too expensive or too coarse.
 *
 * `near` and `mid` are the band edges in metres. `variants` is how many
 * distinct trees per species get built — the thing that stops a hillside being
 * one silhouette stamped over and over. It is the first thing to spend on a
 * desktop and the first thing to cut on a phone, because every variant is its
 * own pair of geometries and its own pair of potential draw calls, and a phone
 * running two variants still has scale, yaw and tint doing the varying.
 *
 * `phone-low` gets `near: 0`, which is not a mistake: the full-detail mesh is
 * simply never built there. Every tree on that tier is the mid mesh or a card.
 */
export interface ForestBudget {
  near: number;
  mid: number;
  variants: number;
  /** Trees past this are not drawn at all. Defaults to the map's fog far. */
  cull: number;
  /** Mid-band trees cast shadows only where there is a shadow budget for it. */
  midShadows: boolean;
}

export const BUDGET: Record<TierName, ForestBudget> = {
  "phone-low": { near: 0, mid: 66, variants: 1, cull: 260, midShadows: false },
  phone: { near: 26, mid: 84, variants: 2, cull: 400, midShadows: false },
  "desktop-low": { near: 34, mid: 100, variants: 3, cull: 520, midShadows: false },
  desktop: { near: 46, mid: 130, variants: 3, cull: 600, midShadows: true },
  "desktop-high": { near: 58, mid: 150, variants: 4, cull: 620, midShadows: true },
};

/**
 * A WORD ABOUT DRAW CALLS, because `variants` buys them and this is where the
 * bill lands. Every (species, variant, band) is its own instanced mesh, and
 * bark and foliage are separate meshes inside that (see atlas.ts for why), so a
 * five-species forest at three variants can submit up to 35 draws. Measured on
 * the review page's own hillside: 290 trees over five species → 63 instanced
 * draws at `desktop`, 35 at `phone`, 15 at `phone-low`. That is a fine number
 * on a desktop and a poor ratio — about five trees a call. It is the price of not stamping one silhouette over
 * a hillside, it is paid in the cheapest currency this frame has, and the knob
 * to turn when a profile says otherwise is `variants`, not the bands.
 */

/**
 * Hysteresis on the band edges, as a fraction of the edge distance.
 *
 * Without it a tree sitting exactly on a boundary swaps mesh every rebucket as
 * the camera jitters, and a hillside full of them flickers. 8% at 52 m is four
 * metres of slack, which a chase camera crosses in a quarter of a second at
 * speed — so the swap happens once and stays.
 */
const HYSTERESIS = 0.08;

interface Variant {
  skeleton: Skeleton;
  near: TreeMesh | null;
  mid: TreeMesh;
  /** Scale that makes this variant's card the same height as its geometry. */
  farScale: number;
}

interface MeshPair {
  bark: THREE.InstancedMesh;
  foliage: THREE.InstancedMesh;
}

interface SpeciesBuild {
  profile: TreeProfile;
  variants: Variant[];
  imposter: {
    geometry: THREE.BufferGeometry;
    material: THREE.MeshStandardMaterial;
    texture: THREE.CanvasTexture;
    height: number;
  };
  /** One pair per variant. `nearMesh` is null on a tier with no near band. */
  nearMesh: (MeshPair | null)[];
  midMesh: MeshPair[];
  farMesh: THREE.InstancedMesh;
}

interface Slot {
  species: number;
  variant: number;
  matrix: THREE.Matrix4;
  /** Same transform with the card's height correction folded in. */
  farMatrix: THREE.Matrix4;
  bark: THREE.Color;
  foliage: THREE.Color;
  x: number;
  y: number;
  z: number;
  band: number;
}

export interface ForestStats {
  placements: number;
  /** Triangles the forest is asking for from the camera it last saw. */
  triangles: number;
  /** Instanced meshes actually submitted. */
  drawCalls: number;
  near: number;
  mid: number;
  far: number;
  culled: number;
  /** Static cost of the library itself, whatever the camera is doing. */
  perTree: { species: SpeciesId; variant: number; near: number; mid: number; far: number }[];
}

export interface Forest {
  readonly group: THREE.Group;
  /**
   * Advance the wind and, a few times a second, re-sort the trees into their
   * detail bands. Safe and cheap to call every frame — it rate-limits itself.
   */
  update(dt: number, cameraPosition: THREE.Vector3): void;
  /** Peak sway in metres, world axes. Zero is a dead-still forest. */
  setWind(x: number, z: number): void;
  readonly stats: ForestStats;
  readonly budget: ForestBudget;
  dispose(): void;
}

export interface ForestOptions {
  tier: QualityTier;
  placements: TreePlacement[];
  /** Overrides the tier's cull distance — pass the map's own fog far. */
  cullDistance?: number;
  /** Trees cast shadows. Off is a real option on a map with no sun in shot. */
  castShadow?: boolean;
  /** Peak sway in metres. Default is a light breeze. */
  wind?: { x: number; z: number };
  /** Shifts every variant and tint in the forest. */
  seed?: number;
}

function buildVariant(profile: TreeProfile, seed: number, withNear: boolean): Variant {
  const skeleton = growTree(profile, seed);
  const near = withNear ? buildTreeMesh(profile, skeleton, detailFor(profile, "near")) : null;
  const mid = buildTreeMesh(profile, skeleton, detailFor(profile, "mid"));
  return { skeleton, near, mid, farScale: 1 };
}

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  capacity: number,
  name: string,
): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
  m.name = name;
  m.count = 0;
  m.visible = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}

export function createForest(opts: ForestOptions): Forest {
  const tier = opts.tier;
  const base = BUDGET[tier.name];
  const budget: ForestBudget = {
    ...base,
    cull: opts.cullDistance ?? base.cull * tier.drawDistanceScale,
  };
  const mats: VegetationMaterials = vegetationMaterials();
  mats.wind.wind.value.set(opts.wind?.x ?? 0.13, 0, opts.wind?.z ?? 0.09);

  const group = new THREE.Group();
  group.name = "vegetation";
  const castShadow = (opts.castShadow ?? true) && tier.shadowMapSize > 0;

  // Which species this forest actually uses. Building all five when a hillside
  // asked for three is three geometries and a 256² canvas thrown away.
  const used: SpeciesId[] = [];
  for (const p of opts.placements) if (!used.includes(p.species)) used.push(p.species);

  const seedBase = opts.seed ?? 0;
  const builds: SpeciesBuild[] = [];
  const capacityOf = (id: SpeciesId): number => opts.placements.filter((p) => p.species === id).length;

  for (const id of used) {
    const profile = SPECIES[id];
    const cap = capacityOf(id);
    const variants: Variant[] = [];
    for (let v = 0; v < budget.variants; v++) {
      variants.push(buildVariant(profile, seedBase + 9973 * v + id.length * 131, budget.near > 0));
    }

    // ONE card per species, not one per variant. At a hundred and forty metres
    // a spruce is forty pixels tall and the difference between two seeds of it
    // is under a pixel — so the far band spends one texture and one draw call
    // for the whole species, and each variant's card is scaled to match the
    // height its own geometry actually came out at. Without that correction a
    // tree changes height at the moment it swaps to its card, which is the one
    // level-of-detail artefact the eye catches every time.
    const impSkeleton = variants[0].skeleton;
    const impSize = tier.name.startsWith("phone") ? 128 : 256;
    const { marks, trunk } = imposterMarks(impSkeleton);
    const texture = imposterTexture(impSize, marks, trunk, profile.kind, seedBase + 77 * id.length);
    const material = new THREE.MeshStandardMaterial({
      name: `veg-imposter-${id}`,
      map: texture,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0,
    });
    const cardSize = imposterSize(impSkeleton);
    const geometry = buildImposterMesh(cardSize);
    // Each variant's card is scaled so it stands as tall as that variant's own
    // geometry did. Without it a tree changes height at the instant it swaps to
    // its card, which is the one level-of-detail artefact the eye catches every
    // time — and with five metres between the tallest and shortest seed of a
    // spruce, it would catch it constantly.
    for (const v of variants) v.farScale = imposterSize(v.skeleton) / cardSize;

    const nearMesh: SpeciesBuild["nearMesh"] = [];
    const midMesh: SpeciesBuild["midMesh"] = [];
    for (const [vi, v] of variants.entries()) {
      if (v.near) {
        const bark = instanced(v.near.bark, mats.bark, cap, `${id}-${vi}-near-bark`);
        const foliage = instanced(v.near.foliage, mats.foliage, cap, `${id}-${vi}-near-foliage`);
        foliage.customDepthMaterial = mats.foliageDepth;
        bark.castShadow = castShadow;
        foliage.castShadow = castShadow;
        bark.receiveShadow = true;
        foliage.receiveShadow = true;
        group.add(bark, foliage);
        nearMesh.push({ bark, foliage });
      } else {
        nearMesh.push(null);
      }
      const mbark = instanced(v.mid.bark, mats.bark, cap, `${id}-${vi}-mid-bark`);
      const mfoliage = instanced(v.mid.foliage, mats.foliage, cap, `${id}-${vi}-mid-foliage`);
      mfoliage.customDepthMaterial = mats.foliageDepth;
      mbark.castShadow = castShadow && budget.midShadows;
      mfoliage.castShadow = castShadow && budget.midShadows;
      mbark.receiveShadow = true;
      mfoliage.receiveShadow = true;
      group.add(mbark, mfoliage);
      midMesh.push({ bark: mbark, foliage: mfoliage });
    }

    const farMesh = instanced(geometry, material, cap, `${id}-far`);
    // A card at a hundred and forty metres is outside every shadow camera this
    // game runs (map 2's is 58 m wide), so asking it to cast is asking for a
    // second pass over geometry that contributes nothing.
    farMesh.castShadow = false;
    farMesh.receiveShadow = false;
    group.add(farMesh);

    builds.push({ profile, variants, imposter: { geometry, material, texture, height: cardSize }, nearMesh, midMesh, farMesh });
  }

  // --- the placements, resolved once ---------------------------------------
  const slots: Slot[] = [];
  const quat = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (const [i, p] of opts.placements.entries()) {
    const si = used.indexOf(p.species);
    if (si < 0) continue;
    const b = builds[si];
    const r = rand((p.seed ?? Math.round(p.x * 31 + p.z * 17 + i)) + seedBase);
    const vi = r.int(0, b.variants.length - 1);
    const v = b.variants[vi];
    const scale = (p.scale ?? 1) * r.about(1, 0.16);
    const yaw = p.yaw ?? r.unit() * Math.PI * 2;
    quat.setFromAxisAngle(axis, yaw);
    pos.set(p.x, p.y, p.z);
    const matrix = new THREE.Matrix4().compose(pos, quat, scl.setScalar(scale));
    const farMatrix = new THREE.Matrix4().compose(pos, quat, scl.setScalar(scale * v.farScale));
    // Tint, and the whole reason a hillside is not one green: two neighbouring
    // firs off the same geometry differ by a few degrees of hue and a few per
    // cent of lightness, and that is enough for the eye to read them as two
    // trees rather than as one tree drawn twice.
    const tone = new THREE.Color(b.profile.tone[r.int(0, b.profile.tone.length - 1)]);
    tone.offsetHSL(r.range(-0.022, 0.022), r.range(-0.07, 0.07), r.range(-0.075, 0.075));
    const barkTone = new THREE.Color(b.profile.barkTone[r.int(0, b.profile.barkTone.length - 1)]);
    barkTone.offsetHSL(0, r.range(-0.05, 0.05), r.range(-0.06, 0.06));
    slots.push({
      species: si,
      variant: vi,
      matrix,
      farMatrix,
      bark: barkTone,
      foliage: tone,
      x: p.x,
      y: p.y,
      z: p.z,
      band: -1,
    });
  }

  const stats: ForestStats = {
    placements: slots.length,
    triangles: 0,
    drawCalls: 0,
    near: 0,
    mid: 0,
    far: 0,
    culled: 0,
    perTree: builds.flatMap((b) =>
      b.variants.map((v, vi) => ({
        species: b.profile.id,
        variant: vi,
        near: v.near ? v.near.triangles : 0,
        mid: v.mid.triangles,
        far: 4,
      })),
    ),
  };

  // --- the bucketing --------------------------------------------------------
  const nearEdge = budget.near;
  const midEdge = budget.mid;
  const cull = budget.cull;

  /** Which band a tree at distance `d` belongs in, given where it is now. */
  function bandFor(d: number, current: number): number {
    // Grow every edge outward for a tree that is already inside it, so the
    // swap-back happens further out than the swap-in did.
    const n = nearEdge * (current === 0 ? 1 + HYSTERESIS : 1);
    const m = midEdge * (current <= 1 ? 1 + HYSTERESIS : 1);
    const c = cull * (current <= 2 ? 1 + HYSTERESIS : 1);
    if (d > c) return 3;
    if (d > m) return 2;
    if (d > n) return 1;
    return 0;
  }

  const counts: number[][][] = builds.map((b) => b.variants.map(() => [0, 0, 0]));
  const farCount: number[] = builds.map(() => 0);

  function rebucket(camera: THREE.Vector3): void {
    for (const perVariant of counts) for (const c of perVariant) c[0] = c[1] = c[2] = 0;
    for (let i = 0; i < farCount.length; i++) farCount[i] = 0;
    stats.near = stats.mid = stats.far = stats.culled = 0;

    for (const s of slots) {
      const dx = s.x - camera.x;
      const dy = s.y - camera.y;
      const dz = s.z - camera.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const band = bandFor(d, s.band);
      s.band = band;
      const b = builds[s.species];
      if (band === 3) {
        stats.culled++;
        continue;
      }
      if (band === 2) {
        const k = farCount[s.species]++;
        b.farMesh.setMatrixAt(k, s.farMatrix);
        b.farMesh.setColorAt(k, s.foliage);
        stats.far++;
        continue;
      }
      const pair = band === 0 ? b.nearMesh[s.variant] : b.midMesh[s.variant];
      if (!pair) {
        // No near mesh on this tier — fall through to mid rather than vanish.
        const mid = b.midMesh[s.variant];
        const k = counts[s.species][s.variant][1]++;
        mid.bark.setMatrixAt(k, s.matrix);
        mid.bark.setColorAt(k, s.bark);
        mid.foliage.setMatrixAt(k, s.matrix);
        mid.foliage.setColorAt(k, s.foliage);
        stats.mid++;
        continue;
      }
      const k = counts[s.species][s.variant][band]++;
      pair.bark.setMatrixAt(k, s.matrix);
      pair.bark.setColorAt(k, s.bark);
      pair.foliage.setMatrixAt(k, s.matrix);
      pair.foliage.setColorAt(k, s.foliage);
      if (band === 0) stats.near++;
      else stats.mid++;
    }

    stats.triangles = 0;
    stats.drawCalls = 0;
    const commit = (mesh: THREE.InstancedMesh, n: number, tris: number): void => {
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (n > 0) {
        // The bounding sphere is recomputed because it is the ONLY thing that
        // lets an instanced mesh be frustum-culled at all: one sphere covers
        // every instance, so a stale one that still contains the whole map
        // means the near mesh is submitted even when the camera is pointed the
        // other way. It is O(count) over a few dozen trees.
        mesh.computeBoundingSphere();
        stats.drawCalls++;
        stats.triangles += n * tris;
      }
    };
    for (const [bi, b] of builds.entries()) {
      for (const [vi, v] of b.variants.entries()) {
        if (b.nearMesh[vi] && v.near) {
          const n = counts[bi][vi][0];
          const t = v.near.bark.index ? v.near.bark.index.count / 3 : 0;
          const f = v.near.foliage.index ? v.near.foliage.index.count / 3 : 0;
          commit(b.nearMesh[vi].bark, n, t);
          commit(b.nearMesh[vi].foliage, n, f);
        }
        const n = counts[bi][vi][1];
        const t = v.mid.bark.index ? v.mid.bark.index.count / 3 : 0;
        const f = v.mid.foliage.index ? v.mid.foliage.index.count / 3 : 0;
        commit(b.midMesh[vi].bark, n, t);
        commit(b.midMesh[vi].foliage, n, f);
      }
      commit(b.farMesh, farCount[bi], 4);
    }
  }

  let sinceRebucket = 1e9;
  const lastCamera = new THREE.Vector3(NaN, NaN, NaN);

  const forest: Forest = {
    group,
    update(dt, cameraPosition): void {
      mats.wind.time.value += dt;
      sinceRebucket += dt;
      // Six times a second, or sooner if the camera has moved far enough to
      // have crossed a band edge's worth of slack. Neither test alone is
      // enough: a parked camera still needs the first sort, and a camera doing
      // twenty metres a second crosses four metres of hysteresis in a fifth of
      // a second.
      const moved = lastCamera.distanceToSquared(cameraPosition);
      if (sinceRebucket < 0.16 && moved < 4 && Number.isFinite(lastCamera.x)) return;
      sinceRebucket = 0;
      lastCamera.copy(cameraPosition);
      rebucket(cameraPosition);
    },
    setWind(x, z): void {
      mats.wind.wind.value.set(x, 0, z);
    },
    stats,
    budget,
    dispose(): void {
      for (const b of builds) {
        for (const v of b.variants) {
          v.near?.bark.dispose();
          v.near?.foliage.dispose();
          v.mid.bark.dispose();
          v.mid.foliage.dispose();
        }
        b.imposter.geometry.dispose();
        b.imposter.material.dispose();
        b.imposter.texture.dispose();
      }
      group.clear();
    },
  };
  return forest;
}

/**
 * One tree, as a plain Group — no instancing, no bands.
 *
 * For the hero tree a map wants in one specific place, and for the review page.
 * Everything a forest draws comes through `createForest`; this is the door for
 * the single case where a forest is the wrong shape of answer.
 */
export function createTree(
  species: SpeciesId,
  seed: number,
  band: "near" | "mid" = "near",
): { group: THREE.Group; triangles: number; height: number; spread: number } {
  const profile = SPECIES[species];
  const mats = vegetationMaterials();
  const skeleton = growTree(profile, seed);
  const built = buildTreeMesh(profile, skeleton, detailFor(profile, band));
  const group = new THREE.Group();
  group.name = `tree-${species}-${seed}`;
  const bark = new THREE.Mesh(built.bark, mats.bark);
  const foliage = new THREE.Mesh(built.foliage, mats.foliage);
  foliage.customDepthMaterial = mats.foliageDepth;
  for (const m of [bark, foliage]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(bark, foliage);
  return { group, triangles: built.triangles, height: built.height, spread: built.spread };
}
