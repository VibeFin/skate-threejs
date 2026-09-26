// THE GENERATED PANORAMA'S TWO DERIVATIVES, OWNED BY THE GAME INSTEAD OF BY
// THREE — and the reason is 768 MB of desktop memory plus a 1.28 GB leak.
//
// A map used to install its sky with two lines:
//
//     scene.background  = equirect;   // EquirectangularReflectionMapping
//     scene.environment = equirect;
//
// Neither line is a "use this image". Both are CONVERSIONS that three performs
// lazily, on the first frame, into objects the game is handed no reference to
// (`WebGLEnvironments` in three r185 keeps them in two WeakMaps keyed on the
// source texture). What the driver actually holds after those two lines, at the
// desktop rung (an 8192x4096 panorama), measured with `tools/gpu-audit.mjs`:
//
//   the equirect itself, 8192x4096 + mips                 179 MB
//   background cube, 6 x 4096x4096 + mips                  384 MB
//     · its six per-face DEPTH renderbuffers               384 MB   <- never read
//   PMREM environment, 6144x8192 RGBA16F                   384 MB
//     · PMREMGenerator's ping-pong twin, same size         384 MB   <- never read
//
// THE TWO DEAD ROWS. `WebGLEnvironments.getCube` builds
// `new WebGLCubeRenderTarget( image.height )` with NO options, so every face
// gets a DEPTH_COMPONENT24 renderbuffer — for a conversion that draws ONE
// BackSide box with `blending: NoBlending`, one fragment per pixel per face.
// Depth is irrelevant during the conversion and the target is only ever SAMPLED
// afterwards, so those six renderbuffers are written once and never read.
// `PMREMGenerator` keeps a second full-size target to ping-pong the blur
// through; three's internal generator is created once and never disposed, so
// that twin stays resident for the whole session behind a closure.
//
// Doing both conversions HERE changes none of that arithmetic except the two
// dead rows: the cube is built at the same size from the same image with the
// same filtering (`fromEquirectangularTexture` copies type, colorSpace,
// generateMipmaps, minFilter and magFilter off the source), and the PMREM comes
// out of the same class, driven by the same renderer, that three would have
// used. What changes is that `depthBuffer: false` is passed, and that the
// generator is disposed the moment it has produced its output — which is the
// only way to free the ping-pong at all.
//
// AND THE SOURCE GOES TOO — 170.67 MB of it on desktop, 2.67 on a phone.
//
// Once both conversions have run, the equirect is dead: `scene.background`
// samples the cube, `scene.environment` samples the CubeUV target, and three's
// `WebGLEnvironments.get` hands both of those back untouched (it only
// intercepts Equirectangular*/Cube* mappings, and these carry
// CubeReflectionMapping and CubeUVReflectionMapping). Nothing in the game holds
// the panorama either — it is a local in the map's dress step. So it is
// disposed on the spot, which is safe ONLY because the game now owns the two
// derivatives: under three's arrangement the source's `dispose` event was the
// one thing keeping them alive, and freeing it would have taken the sky down
// with it.
//
// WHAT IT COSTS TO BE WRONG, stated plainly because it is the one line here
// that throws something away: after this call the sky cannot be REBUILT without
// refetching the panorama. There is no second conversion to run — the image is
// gone from the GPU and the only handle to it goes out of scope with the dress
// step. That is fine today because nothing in this game re-derives a sky at
// runtime, and all three ways it might were checked rather than assumed:
//
// · THE QUALITY PICKER DOES NOT RELOAD THE PAGE — it calls
//   `look.refreshFromSetting()` and rebuilds the POST CHAIN live. But it never
//   re-fetches an asset at a different rung, and the screen says so in the
//   player's own words: `ui/settings.ts` tags the row it just changed
//   "Sharpness settles next launch". Asset rungs are read once, at boot.
// · THE GOVERNOR moves DPR, post, shadows, draw distance and the frame cap. It
//   holds no texture and never reaches this file.
// · A MAP SWAP fetches its OWN panorama — each dress step builds a fresh
//   `TextureLoader` against its own URL — so the incoming sky never wants the
//   outgoing source. Measured across a real swap: the street's family is freed
//   and the spillway's is built from its own download.
//
// So the invariant a future reader has to keep is small and checkable: if
// anything ever wants to re-derive the sky from the image it already has, it
// has to keep the source instead — and pay the 170 MB back to do it.
//
// WHICH IS ALSO ITEM THREE. `maps.ts` unmounts a spot by diffing the scene's
// children, and the sky is not a child — so a spot change used to drop the last
// reference to the equirect without ever firing its `dispose` event, which is
// the only signal three listens for. The whole family was collected by the JS
// GC and left on the GPU with no handle to free it. `disposeSky` is that handle.

import * as THREE from "three";

/** What one scene's sky costs, and everything needed to give it back. */
interface OwnedSky {
  cube: THREE.WebGLCubeRenderTarget;
  environment: THREE.WebGLRenderTarget;
}

/**
 * Per scene, because "the sky" is scene state rather than map state — the two
 * maps write the same two properties and only one of them is ever installed.
 * A WeakMap so a scene that is thrown away takes its bookkeeping with it.
 */
const OWNED = new WeakMap<THREE.Scene, OwnedSky>();

function release(owned: OwnedSky): void {
  // Both are render targets: `dispose()` frees the colour attachment(s), the
  // framebuffer and — for the cube — all six faces.
  owned.cube.dispose();
  owned.environment.dispose();
}

/**
 * Install a loaded equirectangular panorama as the scene's background AND its
 * image-based light, converting it explicitly instead of letting three do it.
 *
 * Call it with the texture the loader just resolved, and set the rotations and
 * `environmentIntensity` around it exactly as before — this function touches
 * `background` and `environment` and nothing else.
 *
 * IT IS ALL-OR-NOTHING ON PURPOSE. Both derivatives are built into locals
 * first; only when both exist are the two scene properties written, in the same
 * synchronous step. A conversion that throws (a lost context, an image the
 * driver refuses) falls all the way back to the two lines this replaced, so the
 * scene can never be left with a background from one sky and a light from
 * another — and a panorama that never loads at all never gets here, which
 * leaves both properties as the map's build step left them.
 */
export function installPanoramaSky(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  source: THREE.Texture,
): void {
  const image = source.image as { width?: number; height?: number } | undefined;
  const height = image?.height ?? 0;

  let cube: THREE.WebGLCubeRenderTarget | null = null;
  let environment: THREE.WebGLRenderTarget | null = null;

  if (height > 0) {
    try {
      // `image.height` is the size three itself picks for the face, so the cube
      // is pixel-for-pixel the one the game was already drawing. The option is
      // the whole point of doing this by hand.
      cube = new THREE.WebGLCubeRenderTarget(height, { depthBuffer: false });
      cube.fromEquirectangularTexture(renderer, source);
      // Already the CubeTexture default; written down because it is what makes
      // three's `getCube` hand this straight back instead of trying to convert
      // it a second time.
      cube.texture.mapping = THREE.CubeReflectionMapping;

      const generator = new THREE.PMREMGenerator(renderer);
      try {
        environment = generator.fromEquirectangular(source);
      } finally {
        // The ping-pong target lives on the generator, not on the output, so
        // this is the line that gives back the second 384 MB. Every piece of
        // state PMREMGenerator disposes here is its OWN (r185 moved the blur
        // materials and LOD meshes onto the instance) — three's internal
        // generator, if it is ever built, is untouched.
        generator.dispose();
      }
    } catch (e) {
      console.warn("[sky] panorama conversion failed — falling back to three's own", e);
      cube?.dispose();
      environment?.dispose();
      cube = null;
      environment = null;
    }
  }

  const previous = OWNED.get(scene);

  if (cube && environment) {
    scene.background = cube.texture;
    scene.environment = environment.texture;
    OWNED.set(scene, { cube, environment });
    // The panorama has done its two jobs and is referenced by nothing. See the
    // header for why this is only safe because the two objects above are ours
    // now, and for the one thing it gives up: the sky can no longer be rebuilt
    // without refetching it.
    source.dispose();
  } else {
    // Exactly the two lines this function replaced.
    source.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = source;
    scene.environment = source;
    OWNED.delete(scene);
  }

  // LAST, and only now that the replacement is on the scene: a sky is never
  // torn down before the one taking its place is standing.
  if (previous) release(previous);
}

/**
 * Give back whatever `installPanoramaSky` last built for this scene, and clear
 * the two properties that pointed at it.
 *
 * Called from `maps.ts` on unmount. The guards matter: the incoming map may
 * already have written its own background (map 2's build step sets a flat
 * colour before its panorama streams in), and clearing a property that is no
 * longer ours would take that with it.
 */
export function disposeSky(scene: THREE.Scene): void {
  const owned = OWNED.get(scene);
  if (!owned) return;
  OWNED.delete(scene);
  if (scene.background === owned.cube.texture) scene.background = null;
  if (scene.environment === owned.environment.texture) scene.environment = null;
  release(owned);
}
