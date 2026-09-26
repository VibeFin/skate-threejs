# Physics world setup

Everything here documents `src/controllers/shared/physics-world.ts` as
installed by `npx genex controller`. The class names, methods, and defaults
below are the real exports — use them as written.

## Contents

- Creating the world
- Rigid bodies and the mesh registry
- Kinematic platforms
- Collision and sensor events
- Sleeping bodies
- Tunneling and CCD
- Pause, slow motion, and per-step gating
- Debug rendering and teardown
- Ground-query userData flags
- The benign boot warning

## Creating the world

```ts
import { PhysicsWorld } from "./controllers/shared/physics-world.ts";

const physics = await PhysicsWorld.create();                    // Earth defaults
const moon = await PhysicsWorld.create({ gravity: [0, -1.62, 0] });
```

`PhysicsWorld.create()` awaits `RAPIER.init()` — the WASM is embedded in
`@dimforge/rapier3d-compat`, so no bundler configuration is needed, and
multiple `create()` calls share a single init. **Nothing may construct any
`RAPIER.*` object before this promise resolves**; collider helpers assume it
already has.

Options you actually touch (`PhysicsWorldOptions`, defaults in parentheses):

| Option | Default | Meaning |
| --- | --- | --- |
| `gravity` | `[0, -9.81, 0]` | world gravity, m/s² |
| `timeStep` | `1/60` | fixed simulation step in seconds; exposed as `physics.timeStep` and mirrored into `world.timestep` — the ONLY dt physics code may use |
| `maxDelta` | `1/30` | per-frame wall-clock clamp (spiral-of-death guard: at most 2 substeps per frame at the default step); raise it to let physics catch up after long hitches |
| `interpolate` | `true` | lerp rendered poses between fixed steps — leave on |

The remaining options (`numSolverIterations` 4, `numInternalPgsIterations` 1,
`allowedLinearError` 0.001, `predictionDistance` 0.002, `minIslandSize` 128,
`maxCcdSubsteps` 1, `contactNaturalFrequency` 30, `lengthUnit` 1) mirror the
solver defaults the controllers were tuned against — change them only with a
measured reason.

## Rigid bodies and the mesh registry

```ts
const body = physics.createBody(
  {
    type: "dynamic",            // "dynamic" | "fixed" | "kinematicPosition" | "kinematicVelocity"
    position: [0, 3, 0],
    rotation: [0, Math.PI / 2, 0], // euler XYZ radians, or a THREE.Quaternion
    linearDamping: 0.1,
    ccd: true,                  // fast small bodies only
    userData: { controller: { excludeVehicleRay: true } },
  },
  mesh                          // optional: registers mesh to follow the body
);
```

Passing an `Object3D` as the second argument calls
`physics.registerBody(body, object3d)` for you: every `physics.step`, the
object's position/quaternion are driven from the body pose, interpolated
between fixed steps. Registry rules:

- **Register scene-root-level groups and add them to the scene FIRST.** The
  parent's inverse world matrix and the object's world scale are captured at
  registration time and never refreshed — if the registered object's parent
  later moves or scales, the sync silently desyncs.
- `physics.unregisterBody(body)` stops the sync; `physics.removeBody(body)`
  also drops collider event handlers and removes the body (and its colliders)
  from the world. `physics.getObject3d(body)` returns the registered object.
- The registered object's transform is OWNED by physics. To teleport, move the
  body (`body.setTranslation({ x, y, z }, true)` — the `true` wakes it), never
  the mesh.

Colliders are attached separately — see
`references/colliders-from-assets.md` in this skill.

## Kinematic platforms

Moving/rotating platforms are `kinematicPosition` bodies whose next pose is set
inside `onBeforeStep`, so Rapier derives their velocities and carries riders:

```ts
const platBody = physics.createBody(
  { type: "kinematicPosition", position: [-2, 0.6, 8] },
  platformMesh
);
cuboidCollider(world, platBody, [1.5, 0.15, 1.5], { friction: 1 });

let simTime = 0;
physics.onBeforeStep(() => {
  simTime += physics.timeStep;
  platBody.setNextKinematicTranslation({ x: -2 + 3 * Math.sin(simTime * 0.5), y: 0.6, z: 8 });
  // rotating: rotBody.setNextKinematicRotation(quaternion)
});
```

Advance your own `simTime` by `physics.timeStep` (as above), never by the
render delta. Set platform poses **before** controller `update()` calls in the
same callback so characters standing on them read fresh platform velocity.

## Collision and sensor events

Per-collider handlers — `setColliderEvents` also enables
`ActiveEvents.COLLISION_EVENTS` on the collider (without that flag Rapier never
reports the pair):

```ts
physics.setColliderEvents(pickupCollider, {
  onIntersectionEnter: ({ other }) => {
    // other: { collider, rigidBody, object3d } — object3d is the registered
    // mesh of the other body, or null
    if (other.object3d === playerRoot) collect();
  },
});
```

- Solid contacts fire `onCollisionEnter`; sensor overlaps fire
  `onIntersectionEnter`. **Exit events fire BOTH** `onCollisionExit` and
  `onIntersectionExit` — intentional, do not "fix" it; make exit handlers
  idempotent.
- `physics.clearColliderEvents(collider)` removes handlers
  (`removeBody` does it automatically).
- `physics.onCollisionEvent((h1, h2, started) => ...)` is a raw tap over every
  drained event; its one intended consumer is the enter/exit system:
  `physics.onCollisionEvent((h1, h2, s) => mgr.handleIntersectionEvent(h1, h2, s))`
  (see `$genex-threejs-vehicle-controllers`). Both hooks return an unsubscribe
  function.

## Sleeping bodies

Dynamic bodies sleep when at rest (`canSleep` default `true`) — good: sleeping
islands cost nothing, and the mesh sync skips sleeping bodies so their meshes
simply hold still. What to know:

- Waking is automatic on contact and impulse. When you move a body directly,
  pass the wake flag: `body.setTranslation(pos, true)`, `body.setLinvel(v, true)`.
- A body you nudge by writing tiny velocities every few frames may keep
  falling asleep between nudges — create it with `canSleep: false` instead of
  fighting the sleep threshold.
- If a stack "freezes" mid-air after you deleted its support, you removed the
  body without waking neighbors — `physics.removeBody` handles the common case;
  exotic cases can call `body.wakeUp()` on neighbors.

## Tunneling and CCD

A fast small body can pass through a thin collider entirely between two fixed
steps. In order of preference:

1. Make static geometry **thick** (the ground in the setup snippet is a 0.5
   thick box, not a plane).
2. Enable CCD on the fast body: `ccd: true` in `createBody` (projectiles,
   thrown props). `maxCcdSubsteps` stays at 1 unless you measure misses.
3. Never fix tunneling with a trimesh on the moving body — trimeshes are
   hollow and make it worse (see the colliders reference).
4. Shrinking `timeStep` is a last resort: it changes tuning for every
   controller in the scene.

## Pause, slow motion, and per-step gating

- `physics.paused = true` freezes simulation without banking time — unpausing
  never replays the gap.
- `physics.timeScale = 0.5` is half-speed slow-mo (1 = realtime).
- `physics.stepsLastFrame` is the number of fixed substeps the latest `step()`
  ran (can be 0 on a fast frame). Use it to gate once-per-physics-step work
  done outside the physics loop, e.g. applying a platform's turn to the camera
  only on frames where a substep actually ran.

## Debug rendering and teardown

```ts
physics.enableDebug(scene);   // wireframe of every collider — tuning only
physics.disableDebug();       // remove + dispose the lines
physics.dispose();            // free the Rapier world, event queue, registries
```

Debug lines cost CPU/GPU every frame — never leave them on in a published
game. `physics.debugEnabled` reports the current state.

## Ground-query userData flags

Controllers probe the world for "ground" (character ray, wheel shapecasts).
Bodies opt out via `userData` at creation (`ControllerUserData` shape):

```ts
{ controller: { excludeRay: true } }           // ignored by ALL ground queries
{ controller: { excludeCharacterRay: true } }  // ignored by the character's ground ray only
{ controller: { excludeVehicleRay: true } }    // ignored by wheel shapecasts only
```

The character body itself should carry `excludeVehicleRay: true` so car wheels
never treat the on-foot player as drivable ground — the character skill's
wiring does this.

## The benign boot warning

`@dimforge/rapier3d-compat` 0.19.3 prints one console warning at init —
`using deprecated parameters for the initialization function; pass a single object instead` —
from its own embedded WASM loader. It is not caused by game code, cannot be
silenced from game code, and affects nothing. Leave it alone.
