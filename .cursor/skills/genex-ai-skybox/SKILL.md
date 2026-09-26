---
name: genex-ai-skybox
description: Generate a real 360° skybox (equirectangular panorama) from a text prompt with `npx genex skybox`, then load it as the scene background + environment lighting in Three.js. Use when the user wants a specific photoreal/painted sky or backdrop ("sunset over the ocean", "alien purple nebula", "foggy pine forest") as an image, rather than a procedural/shader sky.
---

# Genex AI · Skybox

Turn a prompt into a 360° **equirectangular** panorama that wraps the scene and
also lights it (image-based lighting).

## When to use this vs. a procedural sky

- **Use `npx genex skybox`** for a specific, describable ENVIRONMENT — "golden
  hour over misty mountains", "rolling thunderstorm, towering cumulonimbus",
  "alien purple nebula", "hazy dusk sky over a distant sea horizon". You get a
  real image.
- Build a procedural, animated, time-of-day sky directly in the game's existing
  scene/runtime only when that is the requested deliverable; this image lane
  owns static generated panoramas.

**A skybox is environment only — never content.** Buildings, trees, ruins,
towers, or any object painted into the sky render at infinite distance: they
never get closer as the player moves, they sit at the wrong parallax against
the real 3D world, and they read as broken the moment the camera strafes.
Structures belong in the scene as geometry (`npx genex model`); the sky
carries atmosphere — light, weather, clouds, haze, stars.

**Writing "no cathedral" does not rescue a prompt that also says "cathedral".**
Image models are steered by the nouns they ARE given; a ban loses to any
positive mention of the same thing in the same prompt. A real pilot asked for
a *"cinematic dark anime gothic atmosphere, ruined cathedral courtyard mood,
**no buildings or structures**"* — and got a full gothic cathedral with a
courtyard balustrade and a baked ground plane. Five negations in that prompt,
zero effect. So never name a structure in a skybox prompt **even to exclude
it**: describe only light, colour, cloud, weather and time of day.

The CLI enforces this both ways. It appends a closed-positive environment
clause to every prompt (you'll see `↳ environment-only guard applied`; the
full final prompt is stored with the generation), and it **refuses outright,
before spending any credits**, when the prompt itself names a structure or
object. Landforms are fine — "golden hour over misty mountains", "a distant
sea horizon", "towering cumulonimbus" all pass. If you genuinely need content
baked into the sky — e.g. a space station panorama for a scene with no world
geometry — pass `--raw` to send your prompt exactly as written.

## Run

```bash
npx genex skybox "<prompt>"
```

Blocks until ready, then prints its public URL:

```
https://assets.genex.technology/generations/<id>/skybox-equirect
```

The image lives in Genex storage (R2) and loads straight from that URL — you don't
download it and nothing is committed to your repo. The URL is permanent (works the same
in local dev, the published game, and remixes).

## Load it as background + environment

Load the equirect JPG through the quality tier's rung ladder, mark it
equirectangular, and use it for both the visible background and the lighting.
The bare URL is an 8192×4096 original — ~178 MB decoded, over half a phone's
GPU budget in one texture — so phones must load the downscale rung the platform
stores next to every skybox (`$genex-threejs-adaptive-quality`):

```ts
import * as THREE from "three";
import { detectTier } from "./controllers/quality/tier.ts";
import { loadTextureWithFallback } from "./controllers/quality/pick-asset.ts";

// the URL `npx genex skybox` printed (R2 sends CORS headers, so cross-origin works):
const SKYBOX_URL = "https://assets.genex.technology/generations/<id>/skybox-equirect";
const tier = detectTier(); // reuse the boot tier if you already have it
const texture = await loadTextureWithFallback(SKYBOX_URL, tier, (u) =>
  new THREE.TextureLoader().loadAsync(u),
);
texture.mapping = THREE.EquirectangularReflectionMapping;
texture.colorSpace = THREE.SRGBColorSpace;

scene.background = texture;   // visible sky
scene.environment = texture;  // image-based lighting on PBR materials
```

Desktop gets the original; phones get the `@2048`/`@4096` rung; a missing rung
falls back to the original automatically — never a broken boot.

For sharper reflections/lighting, pre-filter it with `PMREMGenerator`:

```ts
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromEquirectangular(texture).texture;
scene.environment = envMap;
scene.background = texture; // keep the raw texture for the visible sky
// Do NOT dispose `texture` here — it IS the visible background. Dispose it only
// if you later stop using it as the sky.
```

## Publish checklist

- Load it from the **URL** the command printed — absolute and permanent, so it resolves
  the same in local dev, the published game, and remixes. Nothing to commit.
- Don't copy the image into `public/assets/` — generated assets live in R2, not the repo.

## Options

- `--raw` — send the prompt exactly as written, skipping the appended
  environment-only guard (for the rare sky that must carry content).
- `--no-wait` — enqueue and return immediately with the generation id; pick
  the result up later with `npx genex wait <id>` (safe to re-run — it attaches
  to the SAME generation).
- `--api-url <url>` — override the API base (local dev).

## Troubleshooting

- **"Not authorized"** — run `npx @genex-ai/cli-demo@dev init` first (it writes your `GENEX_TOKEN`).
- **"Out of credits" (`insufficient_credits`)** — the account has no credits left for
  this skybox generation. Tell the user the facts the CLI printed: their balance, this
  generation's cost, and when their credits refill. Then offer to continue the build
  with a procedurally-coded placeholder (a gradient/procedural sky or a plain
  `scene.background` color) and mark the spot with
  `// TODO(genex): regenerate when credits refill` so the real asset is one command
  away later. Do not stop the session over this.
- **"Email not verified" (`email_verification_required`)** — generation credits
  unlock after the account's email is verified. Give the user the verify link the
  CLI printed, wait for them to confirm, then re-run the command.
- **Sky looks too dark/bright** — adjust `renderer.toneMappingExposure`, or scale
  `scene.environment` influence via material `envMapIntensity`.
- **Seam/pole artifacts** — that's inherent to equirect images; keep the camera
  away from looking straight up/down, or use PMREM for the lighting.
