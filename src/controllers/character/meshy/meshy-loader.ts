// SPDX-License-Identifier: MIT
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { LocomotionProfile } from "../character-animations.ts";

export type MeshyMotionPolicy =
  | "controller-loop"
  | "anchored-action"
  | "planar-root-action"
  | "choreography";

export type MeshyLocomotionBindingMode = "loop" | "one-shot" | "pose";

export interface MeshyLocomotionBinding {
  actionId?: number;
  clip: string;
  mode: MeshyLocomotionBindingMode;
  phase?: number;
}

export interface MeshyCharacterManifest {
  schema: 1;
  characterId: string;
  revision: number;
  manifestVersion: number;
  rig: "meshy-biped";
  controllerPack?: {
    key: string;
    version: number;
    fingerprint?: string;
    actionIds?: number[];
  };
  provenance?: {
    provider: "meshy";
    aiModel: "meshy-6";
    apiVersion?: string;
    meshyApiVersion?: string;
    poseMode: "a-pose" | "t-pose";
    shouldRemesh: boolean;
    targetPolycount: number;
    conceptModel?: string;
    conceptGenerationId?: string;
    conceptCandidate?: number;
    sourceFaceCount?: number;
    remeshTargetFaceCount?: number;
    remeshActualFaceCount?: number;
    remeshTopology?: "triangle";
    previewGenerationId?: string;
  };
  model: {
    url: string;
    heightMeters: number | null;
    skeletonSignature: string;
  };
  clips: Array<{
    actionId: number;
    key: string;
    name: string;
    url: string;
    duration: number | null;
    loop: boolean;
    motionPolicy: MeshyMotionPolicy;
    rootMotionValidated: boolean;
    controllerSlots: string[];
    nominalSpeed: number | null;
    trajectoryUrl: string | null;
    requirements: Record<string, unknown>;
    skeletonSignature: string;
  }>;
  locomotion: {
    slots: Record<string, string>;
    bindings?: Record<string, MeshyLocomotionBinding>;
    fallbacks: Record<string, string>;
    nominalSpeed?: Partial<Record<"walk" | "run" | "crouch", number>>;
    playbackRate: { min: number; max: number };
  };
}

export interface MeshyCharacter {
  kind: "meshy-native";
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  manifest: MeshyCharacterManifest;
  rigSignature: string;
  locomotionProfile: LocomotionProfile;
  update(delta: number): void;
  dispose(): void;
}

function validateManifest(value: unknown): MeshyCharacterManifest {
  const manifest = value as Partial<MeshyCharacterManifest> | null;
  if (
    !manifest ||
    manifest.schema !== 1 ||
    manifest.rig !== "meshy-biped" ||
    !manifest.model?.url ||
    !manifest.model.skeletonSignature ||
    !Array.isArray(manifest.clips) ||
    !manifest.locomotion?.slots
  ) {
    throw new Error("[meshy-character] invalid character manifest");
  }
  return manifest as MeshyCharacterManifest;
}

function compatibleTracks(model: THREE.Object3D, clips: THREE.AnimationClip[]): THREE.AnimationClip[] {
  return clips.filter((clip) => clip.tracks.every((track) => {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    return parsed.nodeName !== undefined && model.getObjectByName(parsed.nodeName) !== undefined;
  }));
}

type TrackConstructor = new (
  name: string,
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  interpolation?: number,
) => THREE.KeyframeTrack;

/** Materialize one reviewed frame as an independent mixer clip for crouch-idle. */
export function createPoseClip(source: THREE.AnimationClip, name: string, phase = 0): THREE.AnimationClip {
  const sampleTime = Math.max(0, Math.min(1, phase)) * Math.max(0, source.duration);
  const tracks = source.tracks.map((track) => {
    const valueSize = track.getValueSize();
    const sampled = new Float32Array(valueSize);
    const interpolant = (track as THREE.KeyframeTrack & {
      createInterpolant(result: Float32Array): { evaluate(time: number): ArrayLike<number> };
    }).createInterpolant(sampled);
    interpolant.evaluate(sampleTime);
    const Track = track.constructor as TrackConstructor;
    return new Track(track.name, [0], sampled, track.getInterpolation());
  });
  // A non-zero duration keeps the static pose well-defined for looped mixer actions.
  return new THREE.AnimationClip(name, 1, tracks);
}

export function resolveMeshyLocomotion(
  manifest: MeshyCharacterManifest,
  sourceClips: readonly THREE.AnimationClip[],
): { clips: THREE.AnimationClip[]; slots: Record<string, string>; missingBindings: string[] } {
  const clips = [...sourceClips];
  const slots = { ...manifest.locomotion.slots };
  const missingBindings: string[] = [];
  for (const [slot, binding] of Object.entries(manifest.locomotion.bindings ?? {})) {
    const source = clips.find((clip) => clip.name === binding.clip);
    if (!source) {
      missingBindings.push(slot);
      continue;
    }
    if (binding.mode === "pose") {
      const poseName = `${binding.clip}__${slot.replaceAll(".", "_")}__pose`;
      clips.push(createPoseClip(source, poseName, binding.phase));
      slots[slot] = poseName;
    } else {
      slots[slot] = binding.clip;
    }
  }
  for (const [slot, fallback] of Object.entries(manifest.locomotion.fallbacks)) {
    if (!slots[slot] && slots[fallback]) slots[slot] = slots[fallback];
  }
  return { clips, slots, missingBindings };
}

export interface LoadMeshyCharacterOptions {
  /** A decoder-wired loader (quality kit's createGltfLoader) — required for
   *  meshopt/KTX2 model rungs; defaults to a plain GLTFLoader. */
  loader?: GLTFLoader;
  /** Candidate URLs to try for the BASE model, best first — the quality kit's
   *  rung ladder: (url) => [pickModel(url, tier, {ktx2}), pickModel(url, tier),
   *  url]. Defaults to just the manifest URL. Clips stay per-clip plain loads
   *  (animation GLBs have no rungs — sampler data, tiny). Dependency-injected
   *  so character/ installs without the quality kit. */
  modelUrlCandidates?: (url: string) => string[];
}

export async function loadMeshyCharacter(
  manifestUrl: string,
  opts?: LoadMeshyCharacterOptions,
): Promise<MeshyCharacter> {
  const response = await fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`[meshy-character] ${manifestUrl} returned HTTP ${response.status}`);
  const manifest = validateManifest(await response.json());
  const loader = opts?.loader ?? new GLTFLoader();
  const candidates = [...new Set(opts?.modelUrlCandidates?.(manifest.model.url) ?? [manifest.model.url])];
  let base: Awaited<ReturnType<GLTFLoader["loadAsync"]>> | null = null;
  for (const [i, candidate] of candidates.entries()) {
    try {
      base = await loader.loadAsync(candidate);
      break;
    } catch (err) {
      if (i === candidates.length - 1) throw err;
      console.warn(`[meshy-character] ${candidate} failed — trying the next candidate.`);
    }
  }
  if (!base) throw new Error(`[meshy-character] no loadable model candidate for ${manifest.model.url}`);
  const clips: THREE.AnimationClip[] = [...base.animations];
  const loaded = await Promise.all(manifest.clips.map(async (entry) => {
    if (entry.skeletonSignature !== manifest.model.skeletonSignature) {
      console.warn(`[meshy-character] ${entry.key} belongs to another rig revision — skipped.`);
      return null;
    }
    try {
      return { entry, gltf: await loader.loadAsync(entry.url) };
    } catch {
      console.warn(`[meshy-character] ${entry.key} failed to load — skipped.`);
      return null;
    }
  }));
  for (const item of loaded) {
    if (!item) continue;
    const compatible = compatibleTracks(base.scene, item.gltf.animations);
    if (compatible.length !== item.gltf.animations.length) {
      console.warn(`[meshy-character] ${item.entry.key} has tracks missing from the active rig — skipped.`);
      continue;
    }
    if (compatible.length === 1) compatible[0]!.name = item.entry.key;
    clips.push(...compatible);
  }
  const locomotion = resolveMeshyLocomotion(manifest, clips);
  for (const slot of locomotion.missingBindings) {
    console.warn(`[meshy-character] locomotion binding ${slot} references a clip that did not load.`);
  }
  return {
    kind: "meshy-native",
    scene: base.scene,
    clips: locomotion.clips,
    manifest,
    rigSignature: manifest.model.skeletonSignature,
    locomotionProfile: {
      slots: locomotion.slots,
      nominalSpeed: manifest.locomotion.nominalSpeed,
      playbackRate: manifest.locomotion.playbackRate,
    },
    update() {
      // Native GLTF rigs do not need VRM's normalized-bone maintenance pass.
    },
    dispose() {
      base.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      base.scene.removeFromParent();
    },
  };
}
