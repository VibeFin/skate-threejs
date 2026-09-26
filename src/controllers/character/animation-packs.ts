// SPDX-License-Identifier: MIT
// One-call loading for the proven VRM + UAL lane. Meshy-native characters load
// their exact-rig clips from meshy/meshy-loader.ts and never enter this retargeter.
import type * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { VRM } from "@pixiv/three-vrm";
import { retargetClips } from "./vrm/vrm-retarget.ts";

interface AnimsManifest {
  schema: number;
  clips: string[];
}

export interface LoadCharacterClipsOptions {
  /** Asset base URL — where animation-library.glb + anims/ live. Default "./assets/". */
  base?: string;
}

/** Load the bundled UAL core and every optional UAL pack onto a VRM avatar. */
export async function loadCharacterClips(
  vrm: VRM,
  options: LoadCharacterClipsOptions = {},
): Promise<THREE.AnimationClip[]> {
  const base = options.base ?? "./assets/";
  const loader = new GLTFLoader();
  const clips: THREE.AnimationClip[] = [];

  const library = await loader.loadAsync(base + "animation-library.glb");
  clips.push(...retargetClips(vrm, library.scene, library.animations));

  const manifest = await fetch(base + "anims/manifest.json")
    .then((res) => (res.ok ? (res.json() as Promise<AnimsManifest>) : null))
    .catch(() => null);
  if (manifest !== null && Array.isArray(manifest.clips) && manifest.clips.length > 0) {
    const packs = await Promise.all(
      manifest.clips.map(async (name) => {
        try {
          return await loader.loadAsync(`${base}anims/${name}.glb`);
        } catch {
          console.warn(`[animation-packs] ${name}.glb failed to load — skipped.`);
          return null;
        }
      }),
    );
    for (const pack of packs) {
      if (pack !== null) clips.push(...retargetClips(vrm, pack.scene, pack.animations));
    }
  }
  return clips;
}
