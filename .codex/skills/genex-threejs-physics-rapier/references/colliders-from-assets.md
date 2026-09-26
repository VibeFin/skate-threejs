# Colliders from assets

Everything here documents `src/controllers/shared/colliders.ts` as installed
by `npx genex controller`. All helpers assume `PhysicsWorld.create()` has
already resolved — constructing a collider before WASM init throws.

## Contents

- Decision table: which collider for which asset
- Explicit primitive helpers
- Auto-colliders from a GLB scene
- Hull vs trimesh
- Scale pitfalls
- Collider options
- Sensors
- End-to-end: a genex model prop

## Decision table: which collider for which asset

| Asset | Collider | Why |
| --- | --- | --- |
| ground, walls, crates, platforms (box-shaped) | `cuboidCollider` | cheapest, exact for boxes |
| dynamic prop from `npx genex model` (barrel, rock, chair) | `convexHullColliderFromMesh` (or `collidersFromObject(..., "hull")` for multi-mesh GLBs) | tight fit, still convex/fast/solid |
| static level GLB (terrain piece, building interior, track) | `trimeshColliderFromMesh` per mesh | exact triangles; safe because it never moves |
| ball-shaped things | `ballCollider` | exact sphere |
| tall dynamic props, posts | `capsuleCollider` / `cylinderCollider` | stable standing shapes |
| pickups, triggers, zones | any shape + `{ sensor: true, mass: 0 }` | overlap events, no contact forces |
| the player, cars, drones | none of the above — `npx genex controller` | controllers own their collider recipes |
| any prop on a PHONE tier (`$genex-threejs-adaptive-quality`) | prefer `cuboidCollider`/hull over trimesh | trimesh contacts scale with triangle count — a phone CPU/memory tax; keep trimesh for static level geometry only |

## Explicit primitive helpers

```ts
import {
  cuboidCollider,
  ballCollider,
  capsuleCollider,
  cylinderCollider,
} from "./controllers/shared/colliders.ts";

cuboidCollider(world, body, [1, 0.4, 2.4], { friction: 1 }); // HALF extents: 2 x 0.8 x 4.8 box
ballCollider(world, body, 0.5);
capsuleCollider(world, body, 0.3, 0.3);   // (halfHeight, radius)
cylinderCollider(world, body, 0.15, 3);   // (halfHeight, radius)
```

Two classic mistakes, called out because they are silent:

- **Cuboid takes HALF extents.** A `[1, 0.4, 2.4]` collider is a 2 × 0.8 × 4.8
  box. Do not halve twice.
- **Capsule/cylinder arg order is `(halfHeight, radius)`** — the REVERSE of
  `THREE.CapsuleGeometry(radius, length)` — and the capsule's `halfHeight`
  covers the cylindrical section only: total height is
  `2 * halfHeight + 2 * radius`, so `(0.3, 0.3)` is 1.2 units tall.

All helpers return the created `RAPIER.Collider` and accept a `ColliderOptions`
last argument (below), including `position`/`rotation` relative to the body.

## Auto-colliders from a GLB scene

`collidersFromObject` walks every visible mesh under an object and creates one
collider per mesh — the batteries-included path for GLBs:

```ts
import { collidersFromObject } from "./controllers/shared/colliders.ts";

const gltf = await loader.loadAsync("./assets/models/weathered-wooden-barrel.glb");
const model = gltf.scene;
scene.add(model);

const body = physics.createBody({ type: "dynamic", position: [0, 2, 0] }, model);
collidersFromObject(world, body, model, "hull", { friction: 0.7, density: 400 });
```

- Shapes: `"cuboid"` (bounding box per mesh — cheapest), `"ball"` (bounding
  sphere), `"hull"` (convex hull per mesh — the default choice for `genex
  model` props), `"trimesh"` (exact triangles — static geometry only).
- `object3d` must be the SAME object registered to the body (their frames must
  coincide); call it right after `createBody`, before the first step.
- Hidden meshes are skipped unless you pass `includeInvisible: true` in the
  options.
- It returns the array of created colliders, so you can attach events or
  retune later.

For a single mesh you can target directly, the explicit forms skip the
traversal:

```ts
import {
  convexHullColliderFromMesh,
  trimeshColliderFromMesh,
} from "./controllers/shared/colliders.ts";

convexHullColliderFromMesh(world, dynamicBody, propMesh, { density: 400 });
trimeshColliderFromMesh(world, fixedBody, levelMesh, { friction: 1 });
```

Both bake the mesh's current world transform relative to the body, so the
collider lands exactly where the mesh renders.

## Hull vs trimesh

| | Convex hull | Trimesh |
| --- | --- | --- |
| fit | shrink-wraps the mesh; concavities filled in (a mug loses its opening) | exact triangles, concavities preserved |
| solidity | solid volume | **hollow shell** — a body starting inside it is stuck or falls through |
| cost | cheap contacts | expensive contacts; scales with triangle count |
| dynamic bodies | yes — the default for props | **never on fast dynamic bodies** — thin hollow triangles are the classic tunneling recipe |
| static level geometry | fine but approximate | the right tool |

When one hull is too crude for a concave prop, prefer either of these before
reaching for a dynamic trimesh:

- **Per-mesh hulls:** most multi-part GLBs already split into several meshes,
  and `collidersFromObject(world, body, model, "hull")` gives one hull per
  part — a compound of convex pieces approximates concavity well.
- **A few hand-placed primitives:** two or three `cuboidCollider`s with
  `position` offsets often beat any auto shape (this is how the bundled
  vehicle chassis recipes work).

`"hull"` can also fail outright on degenerate/coplanar geometry — the helper
throws with the mesh name; fall back to `"cuboid"` for such meshes.

## Scale pitfalls

Colliders copy geometry **at creation time**; they do not track later
transforms.

- **Scale the model BEFORE creating colliders.** Normalize the GLB (e.g.
  `model.scale.setScalar(targetHeight / bboxHeight)`) first, then create the
  body and colliders. Changing `scale` afterwards resizes the render mesh
  only — the collider keeps the old size.
- **Put scale on the mesh, not on the registered root.** The auto-collider
  path faithfully replicates an upstream quirk: the registered root's world
  scale is double-counted in collider sizing, so a root scaled 2× produces
  colliders 2× larger than the rendered meshes. Scaling child meshes (or the
  GLB scene before registering a plain unscaled root) avoids the quirk
  entirely.
- **`"ball"` uses `scale.x` only** (same upstream quirk, replicated not
  fixed) — a non-uniformly scaled sphere gets the wrong radius. Use `"hull"`
  for squashed spheres.
- **Verify visually.** `physics.enableDebug(scene)` draws every collider as a
  wireframe — one glance catches every scale/offset mistake in this section.

## Collider options

`ColliderOptions`, accepted by every helper (and applied via
`applyColliderOptions(collider, options)` if you retune at runtime):

| Option | Notes |
| --- | --- |
| `friction` | negative values are legal and load-bearing — the bundled character capsule ships with `-0.5` because its traction is synthetic; do not clamp |
| `restitution` | bounciness 0–1 |
| `density` / `mass` | **mutually exclusive — picking both throws.** `density` is kg/m³ (water ≈ 1000, wood ≈ 400–700); `mass` is absolute kg |
| `sensor` | overlap detection, no contact forces |
| `position` / `rotation` | collider pose relative to its body (euler XYZ radians) |
| `collisionGroups` / `solverGroups` | raw Rapier bitmasks |
| `contactSkin` | extra contact thickness — trades a visual gap for less jitter |
| `frictionCombineRule` / `restitutionCombineRule`, `activeCollisionTypes` | raw Rapier passthroughs |

Density matters more than it looks: impulse-driven controllers push bodies by
force, so a crate with the default density reacts very differently from one at
`density: 100`. Give props deliberate densities.

## Sensors

```ts
const zone = cuboidCollider(world, zoneBody, [2, 1, 2], { sensor: true, mass: 0 });
physics.setColliderEvents(zone, {
  onIntersectionEnter: ({ other }) => { if (other.object3d === playerRoot) enterZone(); },
  onIntersectionExit:  ({ other }) => { if (other.object3d === playerRoot) leaveZone(); },
});
```

Always give sensors `mass: 0` when they hang off a dynamic body (e.g. a
vehicle's boarding sensor) so they add no mass. Remember exit events fire both
handler families — keep exit logic idempotent (see the physics-setup
reference).

## End-to-end: a genex model prop

```ts
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { collidersFromObject } from "./controllers/shared/colliders.ts";

const loader = new GLTFLoader();
const gltf = await loader.loadAsync("./assets/models/weathered-wooden-barrel.glb");
const barrel = gltf.scene;

// 1. Normalize scale FIRST (target: 1.1 units tall).
const bbox = new THREE.Box3().setFromObject(barrel);
barrel.scale.setScalar(1.1 / (bbox.max.y - bbox.min.y));

// 2. Wrap in an unscaled root, add to the scene, register, then colliders.
const root = new THREE.Object3D();
root.add(barrel);
scene.add(root);
const body = physics.createBody({ type: "dynamic", position: [3, 2, 0] }, root);
collidersFromObject(world, body, root, "hull", { friction: 0.7, density: 500 });
```

Generating the GLB itself (`npx genex model "..."`) is covered by
`$genex-ai-model`.
