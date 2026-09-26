// SPDX-License-Identifier: MIT
// VRM loading for the character controller (Genex AG-747). Wraps three's
// GLTFLoader with @pixiv/three-vrm's VRMLoaderPlugin, normalizes VRM 0.x
// orientation, and runs the standard perf cleanup — so the rest of the
// controller treats every avatar (VRM 0.x or 1.0) identically.
//
// Mobile-readiness: everyone in a Genex room renders the SAME avatar file, so
// this module caches per URL — the file downloads once (loadVrm), and remote
// players should use loadVrmClone, which shares one set of GPU geometry +
// textures across N remotes (~1 avatar of VRAM instead of N). Before this,
// each remote re-downloaded AND re-parsed the VRM into duplicate GPU memory —
// a real jetsam contributor at high player counts.
//
// Needs `npm i @pixiv/three-vrm` (peer of three, which the scaffold already has).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { VRM } from "@pixiv/three-vrm";

export interface LoadedVrm {
  /** The renderable root — add THIS to your character root / the scene. */
  scene: THREE.Group;
  /** The VRM instance — call `vrm.update(dt)` once per frame (spring bones). */
  vrm: VRM;
}

// One network fetch + decode per URL, however many avatars spawn.
const bufferCache = new Map<string, Promise<ArrayBuffer>>();
// One PARSED base VRM per URL — the clone source for remote players.
const baseCache = new Map<string, Promise<LoadedVrm>>();

function fetchVrmBuffer(url: string): Promise<ArrayBuffer> {
  let cached = bufferCache.get(url);
  if (!cached) {
    cached = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`VRM fetch failed: ${r.status} ${url}`);
      return r.arrayBuffer();
    });
    cached.catch(() => bufferCache.delete(url)); // failed fetches retry next call
    bufferCache.set(url, cached);
  }
  return cached;
}

async function parseVrm(url: string): Promise<LoadedVrm> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const buffer = await fetchVrmBuffer(url);
  const gltf = await loader.parseAsync(buffer.slice(0), url);
  const vrm = gltf.userData.vrm as VRM;

  VRMUtils.rotateVRM0(vrm);
  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.combineSkeletons(vrm.scene);

  // Skinned meshes can pop out at glancing camera angles (animated bounds) —
  // but ONLY skinned meshes need the exemption. Blanket-disabling culling on
  // every node made ALL loaded avatars draw every frame regardless of
  // visibility, a per-remote GPU-time tax on phones.
  vrm.scene.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) obj.frustumCulled = false;
  });

  return { scene: vrm.scene, vrm };
}

/**
 * Load a `.vrm` and return its scene + VRM instance, ready to animate.
 * Full-fidelity (spring bones, humanoid) — the LOCAL player's avatar, or any
 * avatar you retarget clips onto. The file itself is fetched once per URL.
 *
 * `VRMUtils.rotateVRM0` bakes the VRM 0.x 180° flip into BOTH the model and its
 * humanoid rig, so the avatar faces -Z (three's forward, same as every other
 * model) and the UAL retargeter (vrm-retarget.ts) needs no per-version handling.
 */
export async function loadVrm(url: string): Promise<LoadedVrm> {
  return parseVrm(url);
}

/**
 * Visual-only clone for REMOTE players: parses the URL once (cached), then
 * returns `SkeletonUtils.clone` of the base — its own bones and mixer target,
 * but SHARED geometry, materials, and textures (N remotes ≈ 1 avatar of GPU
 * memory). Trade-off, on purpose: clones carry no VRM instance, so spring
 * bones (hair/cloth sway) don't simulate on remotes — retarget animation clips
 * ONCE on the base (`(await loadVrmClone.base(url)).vrm`, or your local
 * loadVrm result when it's the same file) and play them on each clone's own
 * `THREE.AnimationMixer`; track names match by construction.
 */
export async function loadVrmClone(url: string): Promise<{ scene: THREE.Group }> {
  const base = await loadVrmCloneBase(url);
  return { scene: SkeletonUtils.clone(base.scene) as THREE.Group };
}

/** The shared parsed base behind loadVrmClone — retarget clips against ITS vrm. */
export function loadVrmCloneBase(url: string): Promise<LoadedVrm> {
  let cached = baseCache.get(url);
  if (!cached) {
    cached = parseVrm(url);
    cached.catch(() => baseCache.delete(url));
    baseCache.set(url, cached);
  }
  return cached;
}
loadVrmClone.base = loadVrmCloneBase;
