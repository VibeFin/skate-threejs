# Wiring the character controller

The full path from an empty scene to a playable character:
world → `CharacterController` → `FollowCamera` → `KeyboardInput` /
`TouchJoystick` → `CharacterAnimations`. Every class and option name below is
the vendored code's real API — copy from here, not from memory.

## 1. Physics world

```ts
import { PhysicsWorld } from "./controllers/shared/physics-world.ts";

const physics = await PhysicsWorld.create();      // awaits RAPIER.init() (embedded WASM)
const world = physics.world;                      // the raw Rapier world controllers consume
```

Nothing may construct any RAPIER object before `create()` resolves. Options if
you need them: `gravity` (default `[0, -9.81, 0]`), `timeStep` (default
`1/60`), `maxDelta`, `interpolate`. `physics.paused` and `physics.timeScale`
give you pause and slow motion for free.

## 2. Level colliders

Every walkable surface needs a rigid body + collider. For authored boxes:

```ts
import { cuboidCollider } from "./controllers/shared/colliders.ts";

const ground = new THREE.Mesh(new THREE.BoxGeometry(90, 0.5, 90), groundMat);
scene.add(ground);
const groundBody = physics.createBody({ type: "fixed", position: [0, -0.25, 0] }, ground);
cuboidCollider(world, groundBody, [45, 0.25, 45], { friction: 1 }); // HALF extents
```

For loaded GLB level pieces, `collidersFromObject(world, body, gltf.scene, "trimesh")`
auto-generates colliders per mesh (`"hull"` for dynamic props from
`$genex-ai-model`; `"trimesh"` only on static geometry). `cuboidCollider`
takes **half** extents — do not halve twice.

## 3. Character

```ts
import { CharacterController } from "./controllers/character/character-controller.ts";
import { characterPresets } from "./controllers/character/presets.ts";

const character = new CharacterController(world, camera, {
  ...characterPresets["default"].options,
  position: { x: 0, y: 2, z: 0 },
  userData: { controller: { excludeVehicleRay: true } },
});
scene.add(character.root);
physics.registerBody(character.body, character.root);
```

- The constructor creates the dynamic body + capsule collider immediately.
- `character.root` is the visual anchor; `registerBody` makes it follow the
  body with interpolation. Register scene-root-level groups and add them to the
  scene **first** — `registerBody` captures the parent's world matrix once and
  never refreshes it.
- `userData: { controller: { excludeVehicleRay: true } }` keeps car wheels
  from treating the on-foot player as drivable ground. Related keys (set on
  OTHER bodies): `excludeRay` (ignored by all ground queries),
  `excludeCharacterRay` (ignored by the character's ground query only).
- The camera argument is how movement becomes camera-relative ("forward" = away
  from camera). Pass the same camera the `FollowCamera` drives.

### Place the model so its feet touch the ground

The capsule floats: in root space the ground is at
`-(capsuleHalfHeight + capsuleRadius + floatHeight)` — **-0.8** with the
defaults (0.3 + 0.3 + 0.2). Normalize any loaded model to ~1.35 units tall and
drop its bounding-box bottom to that line:

```ts
const bbox = new THREE.Box3().setFromObject(model);
const scale = 1.35 / Math.max(bbox.max.y - bbox.min.y, 1e-3);
model.scale.setScalar(scale);
model.position.y = -0.8 - bbox.min.y * scale;
character.root.add(model);
```

A model hovering above the floor or knee-deep in it means this offset is wrong
— it is the single most common wiring bug.

## 4. Input

```ts
import { KeyboardInput } from "./controllers/character/keyboard-input.ts";

const kb = new KeyboardInput(); // WASD/arrows move, Shift run, Space jump, F interact
```

Event-driven — nothing to poll per frame. Read `kb.getCharacterMovement()`
inside the before-step callback and pass the **complete** intent object every
time: the controller merges defined fields, so a stale partial would leave old
`true`s behind. Merge touch controls caller-side (see the SKILL's mobile
section). `kb.onInteract(cb)` is the rising-edge F-key hook (for enter/exit).
It already clears all keys on window blur / tab hide, so no stuck-key handling
is needed.

## 5. Follow camera

```ts
import { FollowCamera } from "./controllers/character/follow-camera.ts";

const followCam = new FollowCamera(camera, {
  domElement: renderer.domElement,
  colliderMeshes: staticWallMeshes,
  // Pointer-lock aim is ON by default on desktop — see §5.1 to wire the cue, or
  // pass `pointerLockAim: false` for a cursor-core game (RTS, card, builder).
});
```

Drag orbits, wheel/pinch zooms, and rays pull the camera in front of walls.
Rules that matter:

- `colliderMeshes` takes static **leaf** meshes only (the ray test is
  non-recursive) and must never include the character or vehicle meshes — the
  rays start at the character's head and would hit them every frame. The array
  is public — mutate it after level loads.
- **First-person is a real mode, not a zoom trick**: pass
  `firstPerson: true` (or flip the public `followCam.firstPerson` field at
  runtime) — the camera sits AT the follow target and looks out along the
  aim direction, wheel zoom is ignored, and collision pullback is skipped.
  Feed the follow target the character's EYE height (~1.6–1.7 m up the
  capsule, not the head-top orbit anchor), hide the local body with
  `setFirstPersonBody(model, true)` (`first-person.ts` — keeps the shadow,
  clones materials so shared remote-player materials are untouched), and
  parent the viewmodel (held weapon/hands) to the CAMERA so it moves with
  the view. Pointer lock stays mandatory (`$genex-threejs-camera-direction`).
  Do NOT fake first-person by pinning a tiny follow distance — the old
  0.02-min-distance trick leaves collision pullback and zoom live, and both
  fight the player.
- Feel: `smoothTime` (0.05 snappy → 0.25 cinematic, default 0.1),
  `initialDistance` (default 4), `initialAzimuthAngle` (default `Math.PI` —
  camera starts behind a +Z-facing character).
- v1 limits (by design): no truck/pan, and the orbit space assumes the up axis
  stays roughly world +Y — far-from-Y custom gravity will misbehave.

### Pointer-lock aim (on by default)

Aim is enabled by default on desktop: a click locks the pointer and mouse movement
drives the orbit directly (no drag). FollowCamera ships no DOM of its own, but the
kit ships a cue overlay — wire `createAimCue()` to `onAimChange` for the reticle +
"click to aim" prompt:

```ts
import { createAimCue } from "./controllers/character/aim-cue.ts";

const aimCue = createAimCue();
const followCam = new FollowCamera(camera, {
  domElement: renderer.domElement,
  colliderMeshes: staticWallMeshes,
  onAimChange: aimCue.onAimChange, // reticle when locked, cue when not
});
```

Want a custom HUD? Read `onAimChange: ({ state }) => …` yourself instead of the cue.

- **Opt out:** cursor-core games (RTS, tower defense, card, builder) pass
  `pointerLockAim: false` — the camera then stays drag-orbit and never grabs the
  cursor.
- **Menus / vehicles:** the BOOT/main menu counts as a menu — park aim from the
  first frame. The one true wiring is the phase binding
  `followCam.setPaused(phase !== "playing")` applied on phase TRANSITIONS
  (inside `setPhase()`), never driven from the render loop: `setPaused` is
  idempotent, but a per-frame resume once locked the pointer over an open menu
  the moment a menu click granted transient activation. The Play/Resume click's
  transition doubles as the required user gesture for the re-lock. Vehicles:
  combine conditions (`phase !== "playing" || activeId !== CHARACTER_ID`) — aim
  is on-foot only.
- **First-person:** the same mode plus `minDistance`/`maxDistance` ≈ 0.1, an
  eye-height target fed to `moveTo`, `avatar.visible = false`, and
  `controller.setLockForward(true)`.
- **Touch / rejected lock:** touch never locks (the mode reports `"off"`); a
  third-party embed without `allow="pointer-lock"` goes `"unavailable"` and
  drag-orbit stays as the fallback — never a dead camera.

The bucket rule (mandatory / recommended / never) and the full lock lifecycle
contract live in `$genex-threejs-camera-direction`.

## 6. The loop — exact order

Per fixed **substep** (inside `physics.onBeforeStep`), in this order:

1. Drive moving platforms (`setNextKinematicTranslation` / `setNextKinematicRotation`).
2. `EnterExitManager.update(dt)` — only if vehicles exist (vehicle skill).
3. `character.setMovement(...)` then `character.update()` — skip while
   `character.isParked`.
4. (Vehicle/drone `update()` calls, if any.)
5. `world.step()` happens automatically right after your callback returns.

Per **render** frame (inside `renderer.setAnimationLoop`), in this order:

```ts
// Delta from performance.now() — THREE.Clock.getDelta() has repeatedly frozen
// at 0 in real games (world renders, nothing moves).
const nowT = performance.now();
const delta = Math.min((nowT - lastT) / 1000, 0.1);
lastT = nowT;
physics.step(delta);                               // 1. fixed substeps + mesh sync

pivot.copy(character.currPos).addScaledVector(character.bodyYAxis, 0.5);
followCam.moveTo(pivot.x, pivot.y, pivot.z, true); // 2. feed the camera
followCam.setUp(character.upAxis);
if (physics.stepsLastFrame > 0 && character.isOnPlatform) {
  followCam.applyPlatformTurn(character.turnOnYQuat);
}
followCam.update(delta);                           // 3. damp + place the camera

anims.update(character, delta);                    // 4. animations (render delta)
renderer.render(scene, camera);                    // 5. draw
```

Non-negotiables:

- `update()` takes an optional dt **and ignores it** — all controller time
  terms use the fixed `world.timestep`. Never call controller updates from the
  render loop directly.
- `applyPlatformTurn` consumes a per-physics-step yaw delta: gate it on
  `physics.stepsLastFrame > 0`, or high-refresh displays re-apply a stale delta
  and the camera over-rotates on platforms.
- Camera and animation updates take the **render** delta, never
  `physics.timeStep`.

## 7. Reading state (for game logic)

All getters are live internal objects — `.clone()` if you keep them:
`currPos`, `currQuat`, `currLinVel`, `isOnGround`, `isFalling`, `isMoving`,
`isOnPlatform`, `moveSpeed`, `verticalSpeed`, `runActive`, `jumpActive`,
`slopeAngle`, `actualSlopeAngle`, `standCollider` (the rigid body under the
character), `standPoint`, `standNormal`, `upAxis`, `bodyZAxis` (facing).
Useful methods beyond `setMovement`: `setLockForward(true)` for strafe mode,
`setGroundDetection("rayCast" | "shapeCast")`, `park()` / `unpark(pos, euler)`
for vehicle boarding, `syncRoot()` if you skip `registerBody`.

## 8. Debug and teardown

- `physics.enableDebug(scene)` draws every collider as wireframe lines
  (disable in shipped games); `{ debug: true }` + a `debugScene` constructor
  arg adds per-controller indicators.
- Teardown: `character.dispose()`, `kb.dispose()`, `followCam.dispose()`,
  joystick/button `.dispose()`, then `physics.dispose()` last.

## Troubleshooting

- **Character slides down gentle ramps or climbs cliffs** — check
  `slopeMaxAngle` (default 72°); see the tuning reference.
- **Stuck bouncing at spawn** — spawn `position.y` too low; the capsule center
  must start above `capsuleHalfHeight + capsuleRadius + floatHeight`.
- **Model drifts away from the capsule** — the registered root's parent moved
  or scaled after `registerBody`; register scene-root groups only.
- **Movement ignores the camera** — you passed a different camera to the
  controller than the one being rendered.
- **`using deprecated parameters for the initialization function` in the
  console** — harmless one-time Rapier WASM-loader message; ignore it.
