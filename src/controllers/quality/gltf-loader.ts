// Genex adaptive-quality: decoder-wired GLTFLoader (mesh-compression lane).
// Generated models ship mobile rungs — `<role>@1024` (embedded textures ≤1024,
// meshopt-compressed, simplified where safe) and the `.ktx2` capability
// sibling (textures stay compressed ON the GPU, ~6x less VRAM). A plain
// GLTFLoader cannot decode either; this factory wires the decoders once and
// marks the game as rung-capable for the platform's publish-time scanner.
//
// The meshopt decoder is a pure ES module inside three — it bundles, nothing
// to host. KTX2 needs the basis transcoder files that `npx genex controller
// quality` copies into public/assets/ (basis_transcoder.js + .wasm) — pass the
// renderer so KTX2Loader can probe GPU support; skip it and models simply use
// the universal @1024 rung.
import type * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export interface GenexGltfLoader {
  loader: GLTFLoader;
  /** True when KTX2 transcoding is wired AND the GPU supports a target format —
   *  pass to pickModel/loadModelWithFallback so phones request `.ktx2` rungs. */
  ktx2: boolean;
  /** Dispose the KTX2 worker pool (call on teardown if you created many). */
  dispose: () => void;
}

/**
 * Build the game's shared GLTFLoader. Call ONCE at boot, after the renderer:
 *
 *   const gltf = createGltfLoader(renderer);
 *   const model = await loadModelWithFallback(MODEL_URL, tier, (u) => gltf.loader.loadAsync(u), { ktx2: gltf.ktx2 });
 *
 * Without a renderer (headless/tools), meshopt still decodes and `ktx2` is
 * false — every load falls back to browser-decodable variants.
 */
export function createGltfLoader(
  renderer?: THREE.WebGLRenderer,
  opts?: { transcoderPath?: string },
): GenexGltfLoader {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  // The scanner's marker: this literal survives minification and tells the
  // publish-time scan the game actually loads models through the rung ladder
  // (models have no edge rewrite — scoring is honest only when wired).
  (window as Window & { __GENEX_MODEL_RUNGS__?: boolean }).__GENEX_MODEL_RUNGS__ = true;

  let ktx2 = false;
  let ktx2Loader: KTX2Loader | null = null;
  if (renderer) {
    try {
      ktx2Loader = new KTX2Loader()
        .setTranscoderPath(opts?.transcoderPath ?? "./assets/")
        .detectSupport(renderer);
      loader.setKTX2Loader(ktx2Loader);
      ktx2 = true;
    } catch {
      ktx2Loader = null; // transcoder missing — universal rungs still work
    }
  }

  return {
    loader,
    ktx2,
    dispose: () => ktx2Loader?.dispose(),
  };
}
