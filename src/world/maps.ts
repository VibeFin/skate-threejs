// The map registry — the game has two places to skate now, and this is the
// only file that knows both of them exist.
//
// The ride never learns which world it is on: it holds a `SurfaceProvider` and
// asks it how high the floor is (see surface.ts). So swapping maps is exactly
// three things — tear the old world's nodes out of the scene, build the new
// one, and hand the ride the new provider. Everything else in the game is
// already written against the contract rather than against the street.
//
// WHY THE SNAPSHOT DANCE IN `mount`: a map's build function adds its own group,
// its sun, its target and its hemisphere light straight to the scene, and it
// returns a `Field` that carries no handle to any of them. Rather than make
// every map lane thread a root object back out — which would put two authors in
// one file — this diffs the scene's own children across the call. It is exact,
// it needs nothing from the map, and it disposes what it removes.

import * as THREE from "three";
import type { QualityTier } from "../controllers/quality/tier";
import type { GenexGltfLoader } from "../controllers/quality/gltf-loader";
import { createField, dressField, type Field } from "./field";
import { disposeSky } from "./sky/panorama";
// MAP 2 IS PARKED — see the REGISTRY note below. The import is commented rather
// than deleted so this is one line to undo.
// import { SPILLWAY_MAP } from "./spillway";

export type MapId = "street" | "spillway";

export interface GameMap {
  id: MapId;
  /** What the player is offered in the menu. */
  name: string;
  /** One line under the name — what riding it is like. */
  blurb: string;
  /** Geometry, light rig and the surface contract. Synchronous; playable at once. */
  build(scene: THREE.Scene, tier: QualityTier): Field;
  /** Streams the generated surfaces in afterwards. Never blocks the first frame. */
  dress(
    scene: THREE.Scene,
    field: Field,
    tier: QualityTier,
    renderer: THREE.WebGLRenderer,
    gltf?: GenexGltfLoader,
  ): Promise<void>;
}

/**
 * MAP 1 — the street block. Milestones 1–7 built it; lane B of the gauntlet run
 * is making it bigger and getting the surfaces honest.
 */
const STREET: GameMap = {
  id: "street",
  name: "Downtown Block",
  blurb: "Plaza, stair sets, handrails, a bank and a quarter pipe.",
  build: createField,
  dress: dressField,
};

/**
 * MAP 2 — the spillway — IS PARKED, by the player's call on 2026-07-29: "let's
 * comment out the second map in the code for now and hide it, since there's
 * still a lot to finish. We won't work on it yet; we'll come back to it later.
 * It needs to be removed from the interfaces."
 *
 * Parked, NOT deleted. `src/world/spillway.ts` and `src/world/map2/` are all
 * still in the project, so `tsc` still type-checks them and they cannot rot
 * while they wait. What changes is that nothing imports them, so the bundler
 * drops the whole map out of the build — and `maps()` returns one entry, which
 * is what makes the menu's spot picker disappear on its own.
 *
 * TO BRING IT BACK: uncomment the import at the top and the row below. That is
 * the whole undo — every other file in the game reads maps through this
 * registry, and `MapId` deliberately still carries "spillway" so the audio
 * lane and the save data keep their shape.
 */
const REGISTRY = new Map<MapId, GameMap>([
  ["street", STREET],
  // ["spillway", SPILLWAY_MAP],
]);

export function register(map: GameMap): void {
  REGISTRY.set(map.id, map);
}

export function maps(): GameMap[] {
  return [...REGISTRY.values()];
}

export function getMap(id: MapId): GameMap {
  const m = REGISTRY.get(id);
  if (!m) throw new Error(`[maps] no map "${id}"`);
  return m;
}

export interface MountedMap {
  map: GameMap;
  field: Field;
  /** Removes every node this mount added and frees its GPU memory. */
  unmount(): void;
}

/** Build a map into the scene and remember exactly what it put there. */
export function mount(map: GameMap, scene: THREE.Scene, tier: QualityTier): MountedMap {
  const before = new Set(scene.children);
  const fogBefore = scene.fog;
  const field = map.build(scene, tier);
  const added = scene.children.filter((c) => !before.has(c));

  return {
    map,
    field,
    unmount() {
      // THE SKY IS NOT A NODE, which is why it used to survive this loop and
      // then be lost. `dressField`/`dressSky` write it to `scene.background`
      // and `scene.environment`, the diff below never sees it, and the incoming
      // map overwrites both properties — so the outgoing panorama and the two
      // large derivatives built from it (the background cube and the PMREM
      // environment, ~1.28 GB together at the desktop rung) were dropped by the
      // JS collector with their GPU memory still allocated and no handle left
      // to free it. `world/sky/panorama.ts` keeps that handle; this is where it
      // is used. It clears the two properties only while they still point at
      // what it built, so a map that has already installed its own sky keeps it.
      disposeSky(scene);
      for (const node of added) {
        scene.remove(node);
        node.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else if (mat) mat.dispose();
        });
      }
      scene.fog = fogBefore;
    },
  };
}
