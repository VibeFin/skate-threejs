---
name: genex-threejs-adaptive-quality
description: Make a Genex Three.js game phone-survivable with the vendored adaptive-quality kit — device-tier detection, tier-budgeted renderer settings, a runtime governor that steps quality down before phones run out of memory, per-tier asset rungs for generated skyboxes/textures, and a Quality picker in settings. Load for every game at boot wiring time, and whenever a game is heavy, crashes on phones, or gets flagged desktop-only.
---

# Genex Three.js Adaptive Quality

Phones enforce a hard GPU-memory ceiling desktops don't have: iOS silently
kills the page when a game allocates too much, and the kill arrives at BOOT —
exactly when a skybox, models, and the post stack all decode at once. This
skill wires the vendored quality kit so the game boots conservatively on
phones, steps quality UP when the device proves smooth, and never gets uglier
on desktop. **You can recover from ugly; you cannot recover from a killed
page.**

This is a completion gate like the post stack: every game wires the tier at
boot before it is called done. It costs three lines, not a testing burden —
you still verify on desktop only.

## Install

```bash
npx genex controller quality
```

Installs `src/controllers/quality/{tier.ts, governor.ts, pick-asset.ts,
gltf-loader.ts}` — game-owned code, edit freely — plus the KTX2 basis
transcoder (`basis_transcoder.js` + `.wasm`) into `public/assets/` (loaded by
path at runtime; Vite would drop it anywhere else).

## Wire the tier at boot (before renderer construction)

```ts
import { detectTier, rendererAntialias } from "./controllers/quality/tier.ts";
import { QualityGovernor } from "./controllers/quality/governor.ts";

const tier = detectTier(); // phone-low | phone | desktop-low | desktop; manual Quality setting wins
// Context MSAA is WASTED under an EffectComposer (it multisamples a buffer the
// composer never reads — the classic weak-MacBook lag recipe). Games with a
// post stack pass willRunPost=true and get their AA from the composer target:
const renderer = new THREE.WebGLRenderer({ antialias: rendererAntialias(tier, true) });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dprCap));
// With post: AA comes from the composer's multisampled target instead —
const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: tier.composerSamples });
const composer = new EffectComposer(renderer, target);
```

`detectTier()` also demotes WEAK desktops (Intel iGPU MacBooks, old integrated
AMD — desktop GPU strings are unmasked, unlike iOS) to `desktop-low`: DPR 1.5,
no MSAA, 1024 shadows, light post. The Quality picker still overrides.

The tier owns every budget decision: `dprCap` (1.5 on phones — the single
biggest framebuffer lever), `antialias` (off on phones; it is fixed at context
creation and can never change live), `shadowMapSize` (1024 phone / 2048
desktop), `postLevel` (`'light'` = tone mapping + cheap passes on phones;
`'full'` = the named stack on desktop), `particleScale`, `drawDistanceScale`,
`frameCap`, and `remoteAvatarCap` for multiplayer. The exact ladder and which
knobs may change at runtime vs load time vs never: [references/adaptive-quality.md](references/adaptive-quality.md).

## Wire the governor (runtime — phones throttle over minutes)

```ts
const governor = new QualityGovernor(tier, {
  setDprScale: (m) => renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dprCap * m)),
  setPostEnabled: (on) => (composerEnabled = on),
  setShadowQuality: (level) => {
    sun.shadow.mapSize.setScalar(level === 'full' ? tier.shadowMapSize : tier.shadowMapSize / 2);
    sun.shadow.map?.dispose(); sun.shadow.map = null; // realloc at the new size
  },
  setDrawDistanceScale: (m) => (scene.fog!.far = baseFogFar * tier.drawDistanceScale * m),
  setFrameCap: (fps) => (frameCap = fps), // 0/undefined-safe: tier.frameCap restores it
}, renderer);

// In the render loop, with the same performance.now() delta the loop already
// computes. Wire ALL the callbacks — every omitted one is a governor rung
// that silently no-ops. The frame cap paces inside setAnimationLoop:
let frameCap = tier.frameCap, lastFrame = 0;
renderer.setAnimationLoop((t) => {
  if (frameCap < 60 && t - lastFrame < 1000 / frameCap - 1) return; // skip: stable 30 > stuttery 45
  const deltaMs = lastFrame ? t - lastFrame : 16;
  lastFrame = t;
  governor.frame(deltaMs);
  // ...update + render
});
```

Sustained slow frames step down (DPR ×0.8 → post off → shadows reduced →
DPR ×0.65 → draw distance → 30 fps cap); twenty smooth seconds step back up; a
knob whose recovery failed twice stays down for the session. It keeps governing forever — thermal throttling
arrives at minute eight, not second thirty. It also pauses judgment when the
tab is hidden and publishes memory counts the platform's crash telemetry
reads; pause your own loop and audio on `visibilitychange` too.

## Generated assets: load through the rungs

Generated skyboxes are 8192×4096 — about 178 MB decoded, over half a phone's
whole budget in one texture. Every generated image asset ships with downscale
rungs; phones must load through them:

```ts
import { detectTier } from "./controllers/quality/tier.ts";
import { loadTextureWithFallback } from "./controllers/quality/pick-asset.ts";

const texture = await loadTextureWithFallback(SKYBOX_URL, tier, (u) =>
  new THREE.TextureLoader().loadAsync(u),
);
```

Desktop loads the original, phones the `@2048` rung (~11 MB), and a missing
rung falls back to the original — never a broken boot. The `$genex-ai-skybox`
and `$genex-ai-texture` skills show the wiring in place.

## Generated models: load through the rungs

Provider-raw GLBs are NOT game assets: one prop is ~500k triangles + several
4K PBR textures (a pilot scene of them submitted 66M triangles/frame and
floored an M4 Max). Every model ships a game-ready ladder — `@2048` (the
desktop rung) and `@1024` (the phone rung), both meshopt-compressed and
simplified where safe, each with a `.ktx2` sibling whose textures stay
compressed ON the GPU (~6× less texture VRAM). A plain `GLTFLoader` can decode
none of them — wire the decoders once and load through the ladder:

```ts
import { createGltfLoader } from "./controllers/quality/gltf-loader.ts";
import { loadModelWithFallback } from "./controllers/quality/pick-asset.ts";

const gltfLoader = createGltfLoader(renderer); // meshopt always; KTX2 when the transcoder is present
const gltf = await loadModelWithFallback(
  MODEL_URL, tier, (u) => gltfLoader.loader.loadAsync(u), { ktx2: gltfLoader.ktx2 },
);
// Provider PBR sometimes ships mirror-metal (metalness~1 + near-zero roughness)
// that reflects the sky env and swims with camera motion. Tame ONLY that extreme
// — do NOT flatten every material to 0.6 (it dulls legitimately metallic props):
gltf.scene.traverse((o) => {
  const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
  if (!m?.isMeshStandardMaterial) return;
  if (m.metalness > 0.85 && m.roughness < 0.2) {
    m.metalness = 0.7;
    m.roughness = Math.max(m.roughness, 0.3);
  }
  m.envMapIntensity = Math.min(m.envMapIntensity, 0.8);
});
```

Fallback chain: `.ktx2` rung → the tier's universal rung (`@2048` desktop,
`@1024` phones) → original — each step warns; the original is archival/remix
source, fetched only as the fallback of last resort. Meshy characters take
the same ladder through
`loadMeshyCharacter(manifestUrl, { loader: gltfLoader.loader, modelUrlCandidates: (u) => [pickModel(u, tier, { ktx2: gltfLoader.ktx2 }), pickModel(u, tier), u] })`.
KTX2-capable games can also pass `ktx2Load` to `loadTextureWithFallback` so
skyboxes/textures use their `.ktx2` variants.

## Quality picker in settings

The pause/settings screen (see `$genex-threejs-game-ui`) always carries a
Quality entry: **Auto / Low / Medium / High**, wired to
`setQualitySetting(...)` from `tier.ts` + a reload or re-tier. Persisted
per-device in localStorage on purpose — quality is a property of the phone,
not the player's account. Default Auto.

## Budgets that ride the tier (not separate rules)

- Shadows: `tier.shadowMapSize`, `shadow.autoUpdate = false` for static scenes,
  at most 2 cascades on phones (`$genex-threejs-shadow-systems`).
- Post: phone floor is a BUILT tone-mapping/output pass (`postLevel: 'light'`
  adds FXAA/vignette); SSAO, volumetrics, and DoF are desktop-tier only
  (`$genex-game-director`'s routing map owns the floor wording).
- Particles/scatter: multiply counts by `tier.particleScale`; render heavy
  transparency at half resolution and upsample.
- Animation: distant mixers update at 1/2–1/4 rate; multiplayer remotes above
  `tier.remoteAvatarCap` billboard instead of animating
  (`$genex-threejs-multiplayer`).
- Physics: phone tiers prefer hull/cuboid colliders for props — trimesh only
  where gameplay demands it (`$genex-threejs-physics-rapier`).
- Shaders: default `mediump` (iOS exception: float-texture sampling needs
  `highp sampler2D`); precompile with `renderer.compileAsync(scene, camera)`
  during the loader screen so first-frame jank doesn't read as a stall; skip
  max anisotropy on phones.
- Disposal: level swaps traverse the outgoing scene and dispose geometry,
  materials, AND textures (three never frees them for you); watch
  `renderer.info.memory` while testing — if textures/geometries climb across
  swaps, you leak toward the kill.

## WebGPU games

The scaffold ships WebGL and stays the default; if this project already uses
`WebGPURenderer`, keep it (never switch renderers mid-project). Context loss
differs: WebGL fires `webglcontextlost` events; WebGPU exposes a
`device.lost` promise — attach a handler that pauses the loop and rebuilds,
mirroring the scaffold's WebGL pattern. All tier knobs apply identically
except `antialias` (WebGPU MSAA is per-render-target and CAN change at
runtime).

## Failure conditions

- Renderer constructed before `detectTier()` → context-creation knobs
  (antialias) are locked wrong for the session. Tier first, renderer second.
- Governor wired to context-creation flags → no-op at best. Runtime knobs
  only: DPR, post toggles, distances, frame cap.
- Skybox loaded with a bare `TextureLoader.loadAsync(SKYBOX_URL)` on a game
  that targets phones → ~178 MB decoded; route it through
  `loadTextureWithFallback`.
- Quality stepping on every spike → shader compiles read as slowness. The
  governor requires SUSTAINED slow windows; do not shorten them.
- Testing quality tiers by resizing the desktop window → tiers key off touch +
  OS, not viewport. Trust desktop verification plus the preflight report
  `genex preview` prints.
