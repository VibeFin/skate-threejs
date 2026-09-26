---
name: genex-ai-texture
description: Generate a real photoreal surface texture (PBR base-color image) from a text prompt with `npx genex texture`, then apply it as a tiling material on meshes or terrain in Three.js. Use `--terrain` for seamless ground. Use when the user wants a specific photoreal material on a surface ("rusty metal floor", "mossy cobblestone path", "grassy terrain") rather than a procedural/shader material.
---

# Genex AI · Texture

Turn a prompt into a real, tileable **base-color** texture image and apply it as a
material on a primitive, a mesh, or terrain.

## When to use this vs. procedural materials

- **Use `npx genex texture`** for a specific photoreal surface you can describe —
  "weathered Roman cobblestone", "cracked desert clay", "oak planks". You get a
  real raster image.
- **Use `$genex-threejs-procedural-materials`** for stylized/abstract or
  fully-parametric materials authored in shaders (instant, perfectly tiling, no
  files). The two are complementary.

## Run

```bash
npx genex texture "<prompt>"
npx genex texture "lush green grass" --terrain    # seamless tiling for ground/terrain
```

Blocks until ready, then prints a URL per map it produced:

```
  basecolor: https://assets.genex.technology/generations/<id>/texture-basecolor
  normal:    https://assets.genex.technology/generations/<id>/texture-normal
  roughness: https://assets.genex.technology/generations/<id>/texture-roughness
  metalness: https://assets.genex.technology/generations/<id>/texture-metalness
```

Each lives in Genex storage (R2) and loads straight from its URL — you don't
download anything and nothing is committed to your repo. The URLs are permanent
(local dev, published game, and remixes alike).

> **Wire only the roles it actually printed.** Most deployments still run the
> base-color-only route and print `texture-basecolor` alone; the PBR maps above
> appear only where the platform is configured for them. A `normalMap` pointed at
> a URL that was never printed is a 404, not a bump — and a 404 inside a
> `Promise.all` costs you the whole material, base colour included.

## Apply it (tiling material)

Load the texture, then **measure the UVs off the geometry** — never set `repeat`
by eye. `worldUV` (next section) is the whole reason this is two lines and not a
judgement call.

```ts
import * as THREE from "three";

const BASE = "https://assets.genex.technology/generations/<id>"; // the id it printed
const load = async (role: string, srgb = false) => {
  const t = await new THREE.TextureLoader().loadAsync(`${BASE}/${role}`);
  // ONLY base color is colour data. A normal/roughness/metalness map holds
  // NUMBERS — decode them as sRGB and the lighting is quietly wrong everywhere.
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // NOTE: no t.repeat here, on purpose — worldUV puts the scale in the UVs.
  return t;
};

// Load ONLY the roles the CLI printed. Asking for one it didn't print is a 404,
// and inside a Promise.all a single 404 rejects the whole thing — you get no
// material at all, not a base-colour one.
const map = await load("texture-basecolor", true);

const TILE_M = 4;               // one tile covers 4×4 metres — choose ONCE per material
const geo = worldUV(new THREE.PlaneGeometry(200, 200), TILE_M);
const ground = new THREE.Mesh(
  geo,
  new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
```

### When it printed the PBR maps too

If the run also printed `texture-normal` / `texture-roughness` / `texture-metalness`,
load them and drop the hand-picked constants — the maps carry roughness and
metalness per texel, so rust reads matte and the rivets read metallic out of one
material:

```ts
const [map, normalMap, roughnessMap, metalnessMap] = await Promise.all([
  load("texture-basecolor", true),
  load("texture-normal"),
  load("texture-roughness"),
  load("texture-metalness"),
]);

const mat = new THREE.MeshStandardMaterial({
  map,
  normalMap,
  roughnessMap,
  metalnessMap,
  // NOT optional. Three.js MULTIPLIES each map by its scalar
  // (`metalnessFactor *= texelMetalness.b` in the shader), and metalness
  // defaults to **0** — so a metalnessMap on a default material contributes
  // exactly nothing and the rivets stay plastic. roughness defaults to 1, which
  // is why roughnessMap appears to "just work" and metalnessMap silently doesn't.
  metalness: 1,
  roughness: 1,
});
```

Same two lines for a wall, a kerb, a platform, a crate — any shape, any size:

```ts
const wallGeo = worldUV(new THREE.BoxGeometry(19, 2.4, 1), TILE_M);
```

### Terrain

Generate with `--terrain` and lay a large `PlaneGeometry` (rotated flat). Scale is
the same call — `worldUV(geo, TILE_M)`. Pick `TILE_M` by what the material IS: a
4 m gravel tile and a 0.6 m tile of floorboards are both right, for different
materials. What is never right is a different density on two faces of one object.

## Why you cannot pick `repeat` by eye

Two facts make a hand-chosen `repeat` wrong on everything but the one face you
were looking at:

1. **Every `BoxGeometry` face spans UV 0..1 regardless of its world size.** A
   `Box(1, 2.4, 17)` gives its 1×17 m top face the same 0..1 UV square as its
   17×2.4 m side. One `repeat` therefore cannot serve both.
2. **`repeat` lives on the `Texture`, not the `Material`.** Two meshes sharing one
   loaded texture share its `repeat`, `offset` and `wrapS/T`. Setting it for the
   wall silently re-tiles the crates. (If you truly need two densities from one
   image, `map.clone()` — but `worldUV` means you almost never do.)

A real game shipped `wallTex.repeat.set(6, 1)` on a four-box wall ring. The number
was tuned against the long side face and landed there at a near-perfect 1.2:1 —
and the same number put **1:102** on the wall tops, which read to the player as
wooden planks rather than the riveted steel the texture actually shows. The
texture was flawless. The wiring was not.

## `worldUV` — measure the UVs, don't guess them

Copy this in. It rewrites a geometry's UVs so one tile covers `tileM × tileM`
metres on **every** face, whatever the shape. After it, leave `repeat` at (1, 1)
and it cannot be wrong — there is no number left to pick.

```ts
/**
 * Box-project a geometry's UVs in world metres. Call once at build time.
 * Units are the geometry's own, so keep mesh.scale at 1 (or bake it in with
 * geometry.scale(...)) — worldUV cannot see a scale applied to the mesh.
 * Returns a non-indexed geometry: a shared vertex on a box corner belongs to
 * faces pointing different ways and cannot carry one UV for both.
 */
function worldUV(geometry: THREE.BufferGeometry, tileM: number): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < pos.count / 3; t++) {
    const i0 = t * 3, i1 = i0 + 1, i2 = i0 + 2;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const nx = Math.abs(n.x), ny = Math.abs(n.y), nz = Math.abs(n.z);
    // Drop the face's dominant axis; the other two are the tile plane. One
    // branch exactly — picking each axis independently collapses a 45° face to
    // a zero-area UV.
    const axis = nx >= ny && nx >= nz ? 0 : ny >= nz ? 1 : 2;
    for (const i of [i0, i1, i2]) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const u = axis === 0 ? z : x;
      const v = axis === 1 ? z : y;
      uv[i * 2] = u / tileM;
      uv[i * 2 + 1] = v / tileM;
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
```

This is box projection: correct for the primitives games build out of (boxes,
planes, kerbs, platforms, extrusions). A generated GLB arrives with its own
authored UVs — leave those alone; `worldUV` is for geometry **you** construct.

## Tiling is checked FOR you — read the verdict

`npx genex texture` measures the wrap seam of every texture it generates and
prints the verdict right under the URL. A bad one looks like this:

```
✗ Visible vertical tiling seam — the tile boundary jumps 6.6× this texture's own detail (want ≤ 3×).
```

`--terrain` ASKS the model for seamless; it does **not** guarantee it — a shipped
game seamed at 6.6× with `--terrain` set. When that line appears, **regenerate**
with "seamless tiling, no visible edges" in the prompt before wiring it in. Do
not try to hide a seam by tiling less: that trades a visible defect you can name
for a stretched one you can't, and a texture that only survives at `repeat` 1 on
one axis is a texture that failed. To re-check any image (including one you
didn't just generate): `npx genex ui seams --in <png|url>`.

Note the two checks see different things and you need both to pass: the seam
check judges the **image**, `worldUV` fixes the **wiring**. A flawless image
wired at 1:102 and a seamed image tiled perfectly are both defects, and the
first one is the one a screenshot of the whole arena will not show you.

## Publish checklist

- Load it from the **URL** the command printed — absolute and permanent, so it resolves
  the same in local dev, the published game, and remixes. Nothing to commit.

## Options

- `--terrain` — seamless tiling tuned for ground/terrain (shown in Run above).
- `--no-wait` — enqueue and return immediately (the file won't be downloaded;
  re-run without `--no-wait` to fetch it).
- `--api-url <url>` — override the API base (local dev).

## Troubleshooting

- **"Not authorized"** — run `npx @genex-ai/cli-demo@dev init` first (it writes your `GENEX_TOKEN`).
- **"Out of credits" (`insufficient_credits`)** — the account has no credits left for
  this texture generation. Tell the user the facts the CLI printed: their balance,
  this generation's cost, and when their credits refill. Then offer to continue the
  build with a procedurally-coded placeholder (a procedural Three.js material in a
  matching color) and mark the spot with
  `// TODO(genex): regenerate when credits refill` so the real asset is one command
  away later. Do not stop the session over this.
- **"Email not verified" (`email_verification_required`)** — generation credits
  unlock after the account's email is verified. Give the user the verify link the
  CLI printed, wait for them to confirm, then re-run the command.
- **Visible tiling seams** — measure first (`npx genex ui seams --in <url>`): a
  high ratio is a defect to fix, not a limitation to accept. Regenerate with
  `--terrain` / a "seamless tiling" prompt, lower the `repeat`, or blend two
  textures until the check passes.
- **Colors look washed/dark** — ensure `map.colorSpace = THREE.SRGBColorSpace`.
