---
name: genex-threejs-physics-rapier
description: Set up Rapier physics for Genex Three.js games with the vendored PhysicsWorld glue — async WASM init, fixed-timestep world, body-to-mesh sync, collision events — and pick the right collider per asset (cuboid, hull, trimesh, including genex model GLBs). Use whenever anything falls, collides, gets pushed, or stands on moving ground; load before writing any physics code.
---

# Genex Three.js Physics (Rapier)

Genex games run physics on Rapier (`@dimforge/rapier3d-compat`) through a small
vendored glue layer: `PhysicsWorld` owns the world, the fixed-timestep loop,
the rigid-body ↔ `Object3D` sync, and collision events; `shared/colliders.ts`
turns meshes and GLBs into colliders. You do not install this from a skill —
a CLI command drops the code into the game.

## Get the code (one command, not hand-rolled)

```bash
npx genex controller character   # or car / drone — every kind installs shared/
npm i @dimforge/rapier3d-compat
```

The command copies `src/controllers/shared/physics-world.ts`,
`shared/colliders.ts`, and `shared/math.ts` into the game (plus the controller
you picked). Even a game that only needs loose physics — falling crates, a
rolling ball — should run it once for the `shared/` layer; existing files are
never overwritten without `--force`.

**Never hand-write character or vehicle physics.** A capsule you push around
with raw impulses will clip slopes, stutter on stairs, and slide off moving
platforms — this is the single most common way physics games go wrong. Tuned,
tested controllers already exist: load `$genex-threejs-character-controller`
for walking/running/jumping and `$genex-threejs-vehicle-controllers` for cars
and drones, each installed by the same `npx genex controller` command.

## Minimal working setup

```ts
import * as THREE from "three";
import { PhysicsWorld } from "./controllers/shared/physics-world.ts";
import { cuboidCollider } from "./controllers/shared/colliders.ts";

const physics = await PhysicsWorld.create(); // awaits RAPIER.init() (embedded WASM)
const world = physics.world;                 // the raw Rapier world

// Static ground: a box whose top face is at y = 0.
const ground = new THREE.Mesh(new THREE.BoxGeometry(100, 0.5, 100), groundMat);
scene.add(ground);
const groundBody = physics.createBody({ type: "fixed", position: [0, -0.25, 0] }, ground);
cuboidCollider(world, groundBody, [50, 0.25, 50], { friction: 1 });

// Dynamic crate: passing the mesh to createBody registers it — the mesh
// follows the body automatically every frame, interpolated between steps.
const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), crateMat);
scene.add(crate);
const crateBody = physics.createBody({ type: "dynamic", position: [0, 3, 0] }, crate);
cuboidCollider(world, crateBody, [0.5, 0.5, 0.5], { friction: 0.6, density: 1 });

// Anything that pushes bodies runs once per fixed substep, before the step:
physics.onBeforeStep(() => {
  // controller.update(), impulses, kinematic platform poses ...
});

let lastT = performance.now(); // NOT THREE.Clock — its getDelta() has frozen at 0 in real games
renderer.setAnimationLoop(() => {
  const nowT = performance.now();
  physics.step(Math.min((nowT - lastT) / 1000, 0.1)); // fixed substeps + mesh sync + events
  lastT = nowT;
  // camera follow, mixers, HUD go HERE (render-delta work, after the step) —
  // never inside onBeforeStep above
  renderer.render(scene, camera);
});
```

Note `cuboidCollider` takes **half** extents: `[0.5, 0.5, 0.5]` is a 1×1×1 box.

## The update ordering contract

Physics code never sees the render framerate. Keep this order or controllers
misbehave in ways that look like tuning problems:

1. **Inside `physics.onBeforeStep(...)`** — runs once per fixed substep, in
   this order: kinematic platform poses (`setNextKinematicTranslation` /
   `setNextKinematicRotation`), then `EnterExitManager.update(dt)` if the game
   has enter/exit vehicles, then each controller's `update()`. Controllers
   ignore any dt argument and read `world.timestep` internally — never feed
   them the render delta.
2. **`physics.step(delta)`** — once per `requestAnimationFrame`, with the
   render clock delta in **seconds**. It runs zero or more fixed substeps,
   syncs registered meshes (interpolated), and drains collision events.
3. **After `step`** — cameras, animation mixers, HUD: render-delta work. Gate
   once-per-physics-step camera corrections on `physics.stepsLastFrame > 0`.

Read [references/physics-setup.md](references/physics-setup.md) for world
options, the body registry and its caveats, kinematic platforms, collision and
sensor events, sleeping bodies, CCD/tunneling, pause/slow-mo, and debug
rendering.

Read [references/colliders-from-assets.md](references/colliders-from-assets.md)
for the collider decision table per asset type — `genex model` GLBs, level
geometry, primitives — hull vs trimesh tradeoffs, and the scale pitfalls.

## Benign boot warning — do not chase it

`@dimforge/rapier3d-compat` 0.19.3 logs once at startup:

```text
using deprecated parameters for the initialization function; pass a single object instead
```

This comes from the library's own embedded WASM loader, cannot be fixed from
game code, and is harmless. Ignore it; do not refactor init code trying to
silence it.

## Failure conditions

- physics stepped with the raw render delta instead of `physics.step`'s fixed
  accumulator (speed varies with framerate);
- a controller updated outside `onBeforeStep`, or fed the render delta;
- a dynamic body repositioned with `setTranslation` every frame instead of
  being kinematic;
- a trimesh collider on a fast dynamic body (falls through the floor);
- colliders built from a model whose scale changes afterwards;
- a mesh registered to a body after its parent moved or scaled (silent desync);
- hand-written character/vehicle physics instead of `npx genex controller`.

## Routing boundary

Player movement, jumping, slopes, and animation state belong to
`$genex-threejs-character-controller`. Cars, drones, and enter/exit flow belong
to `$genex-threejs-vehicle-controllers`. Chase/orbit camera design beyond the
bundled follow camera is `$genex-threejs-camera-direction`. Meshes for props
come from `$genex-ai-model`; this skill only decides how they collide.
