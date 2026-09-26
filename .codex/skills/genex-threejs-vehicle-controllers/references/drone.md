# Drone: DroneController + propellers

`DroneController` (`drone/drone-controller.ts`) is a PD flight brain over a
**caller-created** dynamic body: each registered propeller contributes thrust
along its mount's local +Y plus a reaction torque; every step the brain
computes a hover throttle (weight / total upward thrust potential) and mixes
per-propeller attitude corrections on top, clamped so attitude control never
costs altitude. Unlike the car, the controller never creates or frees the
body — you build body, colliders, and chassis visuals, then hand them over.

`dronePresets` (`drone/presets.ts`) are complete recipes: `config` (merged
over `DEFAULT_DRONE_CONFIG`), four propeller slots in a quad-X layout, and a
collider recipe (`body`) with the density the gains were tuned against.

## Wiring (from the preset recipe)

```ts
import * as THREE from "three";
import { PhysicsWorld } from "./controllers/shared/physics-world.ts";
import { cuboidCollider, cylinderCollider } from "./controllers/shared/colliders.ts";
import { DroneController, type PropellerOptions } from "./controllers/drone/drone-controller.ts";
import { dronePresets } from "./controllers/drone/presets.ts";
import { KeyboardInput } from "./controllers/character/keyboard-input.ts";

const physics = await PhysicsWorld.create();
const preset = dronePresets["camera-drone"];

// 1. Chassis visual root + one mount Object3D per propeller (descendants of
//    the chassis; local +Y = thrust axis). spinModel is optional blade visual.
const chassis = new THREE.Group();
chassis.add(coreMesh); // your body visual
const propellers: PropellerOptions[] = [];
for (const p of preset.propellers) {
  const mount = new THREE.Object3D();
  mount.position.set(p.position.x, p.position.y, p.position.z);
  chassis.add(mount);
  const blade = new THREE.Mesh(bladeGeom, bladeMat);
  mount.add(blade);
  propellers.push({
    object: mount,
    spinModel: blade,
    maxThrust: p.maxThrust,
    torqueRatio: p.torqueRatio,
    invertTorque: p.invertTorque,
  });
}
scene.add(chassis);

// 2. Dynamic body + colliders from the preset recipe (density sets the mass).
const body = physics.createBody({ type: "dynamic", position: [-6, 1.6, 14] }, chassis);
const b = preset.body;
cuboidCollider(physics.world, body,
  [b.cuboidHalfExtents.x, b.cuboidHalfExtents.y, b.cuboidHalfExtents.z],
  { density: b.density });
for (const pos of b.armCylinders.positions) {
  cylinderCollider(physics.world, body, b.armCylinders.halfHeight, b.armCylinders.radius,
    { position: [pos.x, pos.y, pos.z], density: b.density });
}

// 3. Controller + fixed-step update (BEFORE world.step()).
const drone = new DroneController({
  world: physics.world,
  body,
  chassis,
  propellers,
  config: preset.config,
});
// NOTE: direct setMovement wiring is for a drone-only game. With an
// EnterExitManager, DELETE it — the manager's applyInput routes input only
// while piloting (see enter-exit.md); keeping it flies the empty drone.
const kb = new KeyboardInput(); // W/S throttle, A/D yaw, arrows pitch/roll
physics.onBeforeStep(() => {
  drone.setMovement(kb.getDroneMovement());
  drone.update();
});
```

The keyboard scheme is deliberately asymmetric (WASD = throttle/yaw, arrows
= pitch/roll — they are NOT aliases; do not "unify" them).

**Touch input — wire it by default, not on request:** published games get opened
on phones from shared links. Two `TouchJoystick`s map as `joystickL` =
climb/yaw, `joystickR` = pitch/roll; show them only on touch devices
(`setVisible(navigator.maxTouchPoints > 0)`) — invisible on desktop.
Phone-specific layouts stay ask-only.

## Custom generated frames (`npx genex model`)

A generated GLB works as the body visual (`chassis.add(glb)`), but **generate
the frame only, without propellers** — prompt it explicitly, e.g.
`npx genex model "carbon quadcopter drone frame, no propellers"`. Blades are
code-driven: each propeller spins its `spinModel` object, so blades baked into
the body mesh stand still while the drone flies — it reads as broken. Keep the
one-mount-`Object3D`-per-propeller wiring above and put a blade mesh (simple
geometry or a small generated model) in each mount as `spinModel`; a bladeless
frame also flies correctly if that's the look.

## Control modes: VELOCITY vs POSITION

`DroneControlMode` — switch at runtime with `drone.setControlMode(mode)`:

- **`"VELOCITY"`** — stick flying: inputs command velocities (up to
  `maxHorizSpeed` / `maxVertSpeed` / `maxYawRate`) and the PD loop converts
  them to tilt + throttle. Use while a player is on board.
- **`"POSITION"`** — autopilot: the drone holds `targetPos` and faces
  `targetFwd`. Use for parked, idle, or scripted drones. The parking recipe
  (also what the enter/exit hook does on dismount):

```ts
drone.setTarget(drone.currPos, drone.bodyZAxis); // hold HERE, facing THIS way
drone.setControlMode("POSITION");
```

Set the target BEFORE anything else moves — `currPos`/`bodyZAxis` are live
vectors; `setTarget` copies them.

## The PD gain mass-scaling rule

`DroneConfig` gains fall into two families — this is the single most common
tuning mistake:

- **`VERT_POS_P/D`, `HORIZ_POS_P/D`** (POSITION-mode hold gains) are in
  **absolute force units** — they MUST scale with the drone's mass. The
  library defaults fit a ~2 kg drone; the `heavy-lifter` preset (~298 kg)
  ships them pre-scaled ×100 (e.g. `VERT_POS_P: 900` vs default 9). A drone
  that sags away from its hold point or oscillates around it after a mass
  change has stale POSITION gains.
- **`HORIZ_VEL_P`, `VERT_VEL_P`** (VELOCITY-mode gains) are in
  **acceleration units** — mass-independent, usually fine as-is.
- `airDragFactor` is also an absolute force per (m/s): meaningful on a 2 kg
  drone, cosmetic on a 300 kg one.
- Attitude feel: sluggish to tilt → raise `TILT_P`; wobbles/overshoots after
  a maneuver → raise `TILT_D`. `maxTiltAngle` caps how far it leans (and
  therefore horizontal acceleration).

Tune at runtime with `drone.updateConfig({ TILT_P: 18 })` — it recomputes
the cached tilt limit when `maxTiltAngle` changes.

## Propeller sizing

- Size `maxThrust` so total thrust ≈ **2× the drone's weight**: hover
  throttle then sits near 0.5, which maximizes attitude authority (the mixer
  clamps corrections to `min(1 - hover, hover)`). Check `drone.hoverThrottle`
  at runtime — near 1 means underpowered (climbs barely, steers worse).
- Diagonal pairs must share the same `invertTorque` value (quad-X
  counter-rotation) or reaction torques won't cancel and the drone yaws
  constantly.
- `debug: true` on a propeller attaches upstream thrust/torque arrows +
  axis markers under the mount — great while building a custom frame.

## Presets and provenance

| Preset | Mass | Feel | Provenance |
| --- | --- | --- | --- |
| `camera-drone` | ~2 kg (density 335) | gentle 20° tilt limit, strong drag, floaty on purpose | Genex-authored |
| `racing-drone` | ~5 kg (density 240) | full 45° tilt, fast yaw, snappy `TILT_P: 18` | Genex-authored |
| `heavy-lifter` | ~298 kg (density 200) | huge climb reserve, hover ~0.146, POSITION gains ×100 | upstream demo, verbatim |

Each preset's `notes` field carries its own plain-language tuning hints; the
`approxMassKg`/`approxHoverThrottle` fields are documentation values (Rapier
derives the real mass from the colliders and density).

## Telemetry for effects

`drone.propellersInfo` (a `ReadonlyMap<string, PropellerState>`) exposes per
propeller: `finalThrottle` (0..1 mixer output — rotor-wash/audio intensity),
`worldThrustPos`/`worldThrustDir` (where and which way to emit), and
`thrustImpulse`. `drone.hoverThrottle` reads the last computed hover value.
All vectors are reused internal instances — copy, never mutate.
