---
name: genex-ai-image
description: Generate a real image (PNG/JPEG) from a text prompt with `npx genex image`, then load it into Three.js on any mesh, plane, or sprite. Use for posters, paintings, billboards, signs, logos, sprites, card/item art, loading screens, textures for in-game screens, and decals/stickers ("wanted poster", "arcade cabinet marquee", "hand-painted tavern sign") rather than a procedural/shader look. Pass `--transparent` for anything with an alpha channel.
---

# Genex AI · Image

Turn a prompt into a real raster image and put it anywhere in the game — a poster,
a painting, a billboard, a sign, a logo, a sprite, card/item art, a loading screen,
art on an in-game screen, or a decal/sticker.

## When to use this vs. procedural materials

- **Use `npx genex image`** for a specific, recognizable picture you can describe —
  "vintage travel poster of Mars", "guild crest with crossed swords", "arcade
  marquee art". You get a real image.
- **Use `$genex-threejs-procedural-materials`** for stylized/abstract or fully
  parametric surfaces authored in shaders. Use `$genex-ai-texture` for a *tiling*
  PBR surface (floors, ground, walls) — this skill is for a single flat picture.

## Run

```bash
npx genex image "<prompt>"
npx genex image "chalk graffiti tag, hand-drawn style" --transparent   # PNG with alpha (decals/stickers/logos)
```

Blocks until ready, then prints its public URL:

```
https://assets.genex.technology/generations/<id>/image-main
```

The image lives in Genex storage (R2) and loads straight from that URL — you don't
download it and nothing is committed to your repo. The URL is permanent (local dev,
published game, and remixes alike).

## Load it into the scene

Load the image and apply it to any mesh, plane, or sprite:

```ts
import * as THREE from "three";

// the URL `npx genex image` printed (R2 sends CORS headers, so cross-origin works):
const IMAGE_URL = "https://assets.genex.technology/generations/<id>/image-main";
const map = await new THREE.TextureLoader().loadAsync(IMAGE_URL);
map.colorSpace = THREE.SRGBColorSpace;                    // pictures are sRGB — without this they look washed/dark
map.anisotropy = renderer.capabilities.getMaxAnisotropy(); // stays sharp at grazing angles

// a poster/painting/sign on a wall — a flat plane:
const poster = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 3),                          // match the image aspect (w:h)
  new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0 }),
);
scene.add(poster);
```

For a `--transparent` PNG, set `transparent: true` on the material so the alpha shows.
For a screen-space sprite (HUD art, an icon) use `new THREE.Sprite(new THREE.SpriteMaterial({ map }))`.
For art that must glow (a lit sign, a screen) use `MeshBasicMaterial` (unlit) so scene lighting doesn't darken it.

## Decals & stickers

**Anything applied *on top* of a surface — a decal, sticker, spray tag, logo, or
bullet hole — needs an alpha channel, so always generate it with `--transparent`.**
Without alpha you get an opaque rectangle instead of a shaped mark.

Project it onto the target mesh with `DecalGeometry` (the canonical spray-paint look —
clips to the surface and wraps around corners):

```ts
import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";

// ONE shared texture + material for all sprays (generated with --transparent):
const map = await new THREE.TextureLoader().loadAsync(IMAGE_URL);
map.colorSpace = THREE.SRGBColorSpace;
map.anisotropy = renderer.capabilities.getMaxAnisotropy();
const sprayMat = new THREE.MeshStandardMaterial({
  map, transparent: true, depthTest: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -4,          // pulls the decal forward — kills z-fighting
});

const raycaster = new THREE.Raycaster();
const helper = new THREE.Object3D();                     // orientation scratch — never added to the scene
const decals: THREE.Mesh[] = [];
const MAX_DECALS = 20;

function spray(): void {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);      // screen centre
  const hit = raycaster.intersectObjects(sprayables, false)[0];  // sprayables = your wall meshes
  if (!hit || !hit.face) return;
  const n = hit.face.normal.clone()                              // face.normal is LOCAL space —
    .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)); // must transform it
  helper.position.copy(hit.point);
  helper.lookAt(hit.point.clone().add(n));
  const S = 1;                                                    // metres; for non-square art size.y = S * imgH/imgW
  const geom = new DecalGeometry(hit.object as THREE.Mesh, hit.point,
    helper.rotation.clone(), new THREE.Vector3(S, S, S * 0.5));   // size.z = wrap depth
  const decal = new THREE.Mesh(geom, sprayMat);
  decal.renderOrder = 100 + decals.length;                        // newer sprays draw on top
  (hit.object as THREE.Mesh).attach(decal);                       // verts are world-space; attach keeps them correct
  decals.push(decal);
  if (decals.length > MAX_DECALS) {                               // FIFO cap — dispose the oldest
    const old = decals.shift()!;
    old.removeFromParent();
    old.geometry.dispose();      // geometry is per-spray — MUST dispose; the shared material/map are never disposed here
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyT" && !e.repeat) spray();
});
```

Gotchas (all bite in practice):

- **`hit.face.normal` is LOCAL space** — apply the normal-matrix from `matrixWorld`.
  Skipping it "works by accident" only on an unrotated, unscaled wall; any rotated
  wall gets the decal facing the wrong way.
- **`depthWrite: false` means overlap order is draw order** — increment `renderOrder`
  per spray, or stacked decals flicker and sort wrongly.
- **One decal clips against ONE mesh** — a spray straddling two wall meshes gets cut
  at the boundary. Pass the single `hit.object`, or make walls separate meshes.
- **`size.z` too large on a thin wall wraps the decal onto the back face** (visible
  from behind). Keep `size.z` below the wall thickness.
- **`DecalGeometry` is static-mesh only** — no `SkinnedMesh`/morph targets. For a
  moving or skinned target, use a small `PlaneGeometry` quad offset along the normal
  (`hit.point + n * 0.01`, `quad.lookAt(hit.point.clone().add(n))`) instead.

### Impact marks (bullet holes, scorch, blood) — spawn on the hit, not a keypress

A game that shoots, throws, or explodes and leaves NO mark on what it hits reads
as unfinished — and it's the same recipe, driven by the weapon's raycast you
already have. Generate ONE small `--transparent` bullet-hole / scorch / impact
image, then on each confirmed **world** hit place a decal at `hit.point` with
`hit.face.normal` (exactly the `spray()` body above), capped in a FIFO ring
(~30–50) reusing one shared material. On enemy/skinned hits skip the decal and
use the quad fallback or a hit-spark VFX instead. Impact marks are a first-class
generated surface for any weapon/collision game — inventory them up front with
the rest of your art, don't discover the bare walls at the end.

## Real-translucency glass panels — `--glass`

A sprite cut from an unknown background can never carry semi-transparency —
but a panel generated on a CONTROLLED backdrop can. `--glass` appends a
flat-magenta key-screen suffix to your prompt, then (after generation) solves
the per-pixel contamination locally into REAL fractional alpha and writes
ready RGBA files (`glass-1.png`, one per candidate, into `--out-dir`,
default `.`) plus the key metrics (key color, strength, flatness):

```bash
npx genex image "frosted translucent dark glass panel, about 40 percent opacity, thin luminous cyan frame" --glass --size 1280x832 --quality high
```

- **Steer the translucency with words**: "frosted translucent … about 40
  percent opacity" → real see-through glass; "dark smoked glass" → near-
  opaque tint. The suffix handles the backdrop; your prompt owns the glass.
- **Wire the PNG like any sprite** — its alpha IS the glass. No CSS opacity
  on top, no plate underneath.
- **Not for magenta/pink-hued art**: magenta in the SUBJECT keys as
  translucency. Panels, frames, HUD plates — yes; a pink neon sign — no.
- A candidate whose backdrop came back shaded is REJECTED with a retryable
  message (rare — regenerate). `--glass` is generation-only: it conflicts
  with `--edit`/`--clean`/`--upscale`/`--transparent`/`--remove-bg`/`--no-wait`.
- Glass files are LOCAL outputs (like HUD sprites) — they ship with the
  build; commit them under `public/assets/`.

## Multiplayer

The asset URL is public, permanent, and CORS-open, so it is safe to broadcast the
string to every player. A placed-at-runtime mark (a decal included) is static shared
world state — put it on `room.shared`, **not** `objects` (no movement to smooth) and
**not** `send` (late joiners would see a bare wall; `shared` keys replay on connect).

Use a **fixed ring of slots** and overwrite the oldest — **never a fresh key per
spray**. The relay caps game-writable `shared` keys at **256 per room, keys are
permanent and undeletable, and new keys past the cap are silently dropped forever**,
so a new key per spray eventually breaks the game:

```ts
let next = 0;
const RING = 32;                                   // decal:0 .. decal:31
function placeShared(url: string, hit: { point: THREE.Vector3; normal: THREE.Vector3 }) {
  room.shared.set(`decal:${next % RING}`, { url, p: hit.point.toArray(), n: hit.normal.toArray() });
  next++;
}
room.on("shared", (key, value) => {                // every player (incl. late joiners) rebuilds the decal
  if (key.startsWith("decal:") && value) spawnDecalFromShared(value);
});
```

See `$genex-threejs-multiplayer` for the `shared` channel rules and the room API.

## Publish checklist

- Load it from the **URL** the command printed — absolute and permanent, so it resolves
  the same in local dev, the published game, and remixes. Nothing to commit.
- Don't copy the image into `public/assets/` — generated assets live in R2, not the repo.

## Options

- `--transparent` — PNG with an alpha channel (mandatory for decals/stickers/logos —
  anything laid on top of a surface).
- `--aspect <ratio>` — image shape (e.g. `square`, `16:9`, `9:16`); default is square.
- `--quality <low|medium|high>` — quality preset; higher costs more and takes longer.
- `--size <WxH>` — exact pixel size (multiples of 16, each side ≤ 3840, aspect ≤ 3:1).
- `--edit <url>` — edit THAT generated image with the prompt (image-to-image).
- `--inpaint <mask.png|url>` — with `--edit`: a region mask (local PNG or
  asset URL; TRANSPARENT hole = the zone to change). It targets WHERE the
  edit lands — the other regions keep their designs — but the WHOLE image
  still re-renders and alpha is destroyed either way: after any masked edit,
  re-run `--clean`/re-extraction downstream. A targeting scope, not a pixel
  freeze.
- `--clean <url>` — ML background removal of THAT image only (prompt recorded,
  unused). **For an image that HAS a background.** Running it over a
  `--transparent` result re-keys edges that were already correct and can spray
  colour speckle across the rim and into the art — `ui trim`/`extract`/`audit`
  refuse that output, and nothing repairs it but going back to the original.
- `--upscale <url>` — 2x utility upscale of THAT image (prompt recorded,
  unused; ~2-credit class). Use before printing/large billboards, not by
  default.
- `--remove-bg` — chain ML background removal after the generation/edit.
- `--bg-mode <sprite|glyph|sheet|matte>` — background-removal model (`glyph`
  for digits/closed shapes; `--clean` defaults to `sheet`; `matte` = BiRefNet
  SOFT alpha for hair/glow/smoke edges the binary cutters butcher).
- `--glass` — the magenta-key real-translucency lane (section above);
  writes local RGBA files into `--out-dir` (default `.`).
- `--no-wait` — enqueue and return immediately, without the URL. Fire-and-forget
  only: re-running the command creates (and bills) a NEW image.
- `--api-url <url>` — override the API base (local dev).

Menu backdrops belong to `$genex-ai-menu`; a cohesive art-directed HUD sprite
set belongs to `$genex-ai-hud` — both build on this command.

## Troubleshooting

- **"Not authorized"** — run `npx genex init` first (in the project — it resolves this project's own CLI) (it writes your `GENEX_TOKEN`).
- **"Prompt rejected"** — the provider's content-safety filter blocked the prompt.
  This is non-retryable; retrying the same wording fails again. Rewrite the prompt.
- **Decal is an opaque rectangle** — the image has no alpha. Regenerate with
  `--transparent`.
- **Colors look washed/dark** — ensure `map.colorSpace = THREE.SRGBColorSpace`.
- **Decal blurs at oblique angles** — set `map.anisotropy = renderer.capabilities.getMaxAnisotropy()`.
