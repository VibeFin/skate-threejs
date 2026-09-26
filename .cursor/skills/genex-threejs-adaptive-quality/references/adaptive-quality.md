# Genex adaptive quality — tiers, knobs, and the governor in depth

Use this reference when tuning the tier ladder, deciding which knob may change
when, or teaching the governor a game-specific step.

## Why boot-conservative

The phone budget is a hard ceiling that includes GPU memory (textures,
framebuffers), and the OS kill arrives with no catchable event. Boot is the
danger window: skybox + models + post targets decode together. So phone tiers
START one notch below what the heuristics suggest and the governor steps UP
after ~20 smooth seconds. The cost of guessing low is moments of softness; the
cost of guessing high is a dead page.

## The tier ladder

| Knob | phone-low | phone | desktop-low | desktop |
|---|---|---|---|---|
| DPR cap | 1.0 | 1.5 | 1.5 | 2 |
| antialias (context, no-post games) | off | off | off | on |
| Composer MSAA samples | 0 | 0 | 0 | 4 |
| Shadow map | 512 (static-cached) | 1024 | 1024 | 2048 |
| Post level | tone map only | + FXAA/vignette | + FXAA/vignette | full named stack |
| Skybox rung | @2048 (~11 MB) | @4096 (~45 MB) | original | original |
| Model rung | @1024 (+.ktx2 when wired) | @1024 (+.ktx2 when wired) | @2048 (+.ktx2) | @2048 (+.ktx2) |
| Texture rung (props) | @1024 | @2048 | original | original |
| Particles/scatter | 0.25× | 0.5× | 0.75× | 1× |
| Draw distance | 0.5× | 0.75× | 1× | 1× |
| Frame target | stable 30 | 60 | 60 | 60 |
| Remote avatars animated | 4 | 8 | all | all |
| Prop colliders | hull/cuboid | hull | as designed | as designed |

`desktop-low` is the weak-desktop demotion (Intel iGPU MacBooks, old integrated
AMD): desktop GPU renderer strings are UNMASKED (unlike iOS), so one boot probe
separates a 2015 Intel Air from an M3 Max. The full desktop path on those
machines — DPR 2 + 4× MSAA + 2048 PCFSoft shadows + full bloom — is the classic
"huge lags on a MacBook" recipe, and two of its costs (context MSAA, shadow
budget) were previously invisible to the governor.

A DPR drop from 3 (raw iPhone) to 1.5 cuts every full-screen surface — color,
depth, and each post target — to a quarter of the bytes. It is the single
strongest lever the tier owns.

## The knob split — what may change when

Getting this wrong produces silent no-ops or a session stuck ugly:

- **Context-creation-fixed (never changes live):** `antialias`, `alpha`,
  `stencil`, `powerPreference` on WebGL. Changing them means a new context and
  a full re-init — the tier must decide them BEFORE the renderer exists.
  (WebGPU differs: MSAA is per-render-target sample count and is runtime-
  changeable.) **Context MSAA under an EffectComposer is pure waste** — it
  multisamples a buffer the composer never reads. Post games construct with
  `rendererAntialias(tier, true)` (false) and put their AA on the composer's
  own target via `tier.composerSamples`; only no-post games keep context MSAA.
- **Load-time (fixed for the session once fetched):** asset rungs (skybox and
  texture resolutions), model LOD sets. `pickAsset` decides them from the tier
  at load; switching later means a re-fetch — treat as fixed.
- **Scene-build-fixed: the light COUNT.** Three.js bakes the number of lights
  of each type into every lit material's shader program; add, remove, or hide
  a light (or a group containing one) mid-play and ALL lit materials recompile
  synchronously on that frame — a multi-second freeze that boot-time
  `compileAsync` cannot pre-warm because each new count is a new shader. A
  pilot game froze ~3 s on every pickup exactly this way (each collected
  relic's group hid a child PointLight). Drive `intensity` to 0 instead;
  change the population only on full level swaps.
- **Runtime-free (the governor's domain):** `setPixelRatio`, post passes on/off
  and their target resolutions, shadow map size (realloc), draw distance and
  fog, LOD bias, particle counts, mixer update rates, frame cap, remote-avatar
  animation count. Light `intensity` is runtime-free; light COUNT is not (see
  above).
- **Shadow maps of STATIC lights render once, not per frame:** shadow maps
  default to re-rendering every frame, and a PointLight's is a 6-face cube —
  four static shadow lanterns = 24 redundant passes/frame over the whole
  caster set (measured 66M submitted triangles/frame in a pilot). Freeze them:
  `light.shadow.autoUpdate = false; light.shadow.needsUpdate = true;` — only
  the key light that shadows moving actors stays dynamic.

## Governor mechanics

- Slow = frame delta over budget for a SUSTAINED window (4 s) — never single
  spikes, which are usually shader compiles or GC. Precompiling with
  `renderer.compileAsync` during the loader screen removes most spikes at the
  source (and keeps first-frame jank from reading as a stall to the platform's
  telemetry).
- Step-down order: DPR ×0.8 → post off → shadows reduced (half the map +
  realloc via `setShadowQuality`) → DPR ×0.65 → draw distance ×0.6 → 30 fps
  cap. Each step is the cheapest remaining lever with the biggest headroom
  return; the shadow rung and second DPR step exist because one ×0.8 was
  often not enough on weak desktops.
- Step-up needs 20 smooth seconds (hysteresis), and a step that had to be
  re-applied twice is pinned for the session — oscillating quality reads worse
  than stable-low.
- The governor never stops: thermal throttling degrades phones after minutes
  of play, so a boot-time benchmark alone always ends up wrong.
- A stable 30 fps cap beats a stuttery 40–50: consistent frame pacing reads
  smoother and halves GPU work per second (heat, battery, memory bandwidth).
- Backgrounded tab (`visibilitychange`): pause the render loop and audio, not
  just the governor — a hidden game burning GPU is pure thermal debt on the
  device class that can least afford it.

## Detection honesty

- Apple devices mask the GPU renderer string ("Apple GPU") — screen dims + DPR
  + iOS major version are the usable signals there, and the governor corrects
  the rest from measured frames.
- Android exposes real renderer strings (Adreno/Mali/Xclipse); the vendored
  lookup in `tier.ts` promotes strong GPUs to the `phone` tier. It is a
  heuristic on purpose — extend the regex when field data shows a
  misclassified family, and let the governor absorb the rest.
- Never burn a probe context on a memory-strapped phone at play time; the one
  probe in `tier.ts` runs at boot and frees its context immediately.

## Memory discipline that rides the tier

- Dispose on every level swap: traverse the outgoing scene and call
  `.dispose()` on geometry, material, AND each material's textures — material
  dispose does not free textures, and three frees nothing automatically.
- Watch `renderer.info.memory.{textures,geometries}` across swaps in dev; a
  monotonic climb is a leak marching toward the OS kill. The governor
  publishes these counts for the platform's field telemetry.
- Prefer meshopt/instanced geometry for repeats: 3+ copies of the same
  generated model → `InstancedMesh` (one draw call per source mesh instead of
  per copy — `$genex-ai-model` has the collapse snippet); `BatchedMesh`
  batches HETEROGENEOUS static meshes into one draw where instancing
  (identical meshes only) can't.
- Distance LOD comes free with the rung ladder: `THREE.LOD` with the phone
  rung (`@1024`) as the far level — `lod.addLevel(near, 0);
  lod.addLevel(far, 25)`. One extra fetch; worth it past ~25 m sightlines,
  skip in small arenas.
- Half-resolution transparency: render heavy particle/transparency passes to a
  half-size target and composite up — fill-rate is the phone bottleneck.

## Multiplayer at tier

Remotes are visual-only; with the shared avatar file, `loadVrmClone` gives N
remotes one set of GPU geometry/textures. Animate and fully draw only the
nearest `tier.remoteAvatarCap`; beyond it, freeze the mixer and billboard or
hide. Matchmade games can also declare a lower `maxPlayers` in
`genex.matchmaking` for phone-heavy audiences — capacity is a server-owned
knob.
