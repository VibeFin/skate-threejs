# Car: VehicleController + ShapeCastWheel

The car is three cooperating pieces:

- **`VehicleController`** (`vehicle/vehicle-controller.ts`) — the brain. It
  creates a dynamic Rapier body **without colliders**, owns the drivetrain
  (engine torque curve, gear ratios, RPM-threshold auto shift), routes
  drive/brake/steer demands to the wheels, and applies their suspension +
  friction impulses to the body.
- **`ShapeCastWheel`** (`vehicle/wheel.ts`) — one per corner, created via
  `car.addWheel()`. Each wheel sweeps a cylinder at the ground, computes a
  suspension spring/damper impulse and slip-curve tire friction, and drives
  its own visual groups (steer, suspension bounce, spin).
- **`vehiclePresets`** (`vehicle/presets.ts`) — complete car recipes:
  `carConfig`, chassis collider specs, shared wheel options, and four wheel
  slots (order FL, FR, RL, RR).

Conventions: **+Z is the car's forward axis**, +X is left, and positive steer
input turns LEFT. Wheel `position` is the axle mount point in chassis-local
space.

## Wiring (matches the shipped preset shapes)

```ts
import * as THREE from "three";
import { PhysicsWorld } from "./controllers/shared/physics-world.ts";
import { cuboidCollider } from "./controllers/shared/colliders.ts";
import { VehicleController } from "./controllers/vehicle/vehicle-controller.ts";
import { vehiclePresets } from "./controllers/vehicle/presets.ts";
import { KeyboardInput } from "./controllers/character/keyboard-input.ts";

const physics = await PhysicsWorld.create();
const world = physics.world;

// 1. Controller (creates the dynamic body — no colliders yet).
const preset = vehiclePresets["arcade-kart"];
const car = new VehicleController({
  world,
  position: new THREE.Vector3(12, 1.4, 4),
  carConfig: preset.carConfig,
});

// 2. Chassis colliders — YOU attach them to car.body from the preset recipe.
for (const c of preset.chassisColliders) {
  cuboidCollider(world, car.body, [c.halfExtents.x, c.halfExtents.y, c.halfExtents.z], {
    position: [c.offset.x, c.offset.y, c.offset.z],
    density: c.density,
  });
}

// 3. Wheels — shared options + per-slot role flags. Register all four
//    before the first update() so the torque split is stable.
const wheelGeom = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 20);
wheelGeom.rotateZ(Math.PI / 2); // the wheel model spins around LOCAL X
for (const slot of preset.wheelSlots) {
  const wheel = car.addWheel({
    ...preset.wheelShared,
    ...slot,
    position: new THREE.Vector3(slot.position.x, slot.position.y, slot.position.z),
  });
  const mesh = new THREE.Mesh(wheelGeom, wheelMat);
  wheel.modelObject.add(mesh); // wheelGroup steers, suspensionGroup bounces, modelObject spins
}

// 4. Scene graph: chassis mesh under chassisObject, chassisObject in the scene.
car.chassisObject.add(carBodyMesh); // your visual chassis (a genex model GLB works)
scene.add(car.chassisObject);
physics.registerBody(car.body, car.chassisObject); // interpolated render sync

// 5. Input + fixed-step update (BEFORE world.step(), via onBeforeStep).
// NOTE: this direct setMovement wiring is for a car-only game. When an
// EnterExitManager is in play, DELETE it — the manager routes input via its
// applyInput only while driving (see enter-exit.md); keeping this line too
// makes WASD drive the empty car while the player is on foot.
const kb = new KeyboardInput(); // WASD/arrows drive+steer, Space = brake
physics.onBeforeStep(() => {
  car.setMovement(kb.getCarMovement());
  car.update();
});
```

`setMovement` merges field-wise — send the complete `CarMovementIntent`
every frame (a stale partial leaves old `true`s behind), which
`kb.getCarMovement()` already does.

**Touch input — wire it by default, not on request:** published games get opened
on phones from shared links. Pass `{ joystickL: { x, y } }` from `TouchJoystick`
(pushing right steers right) and show it only on touch devices
(`joy.setVisible(navigator.maxTouchPoints > 0)`) — invisible on desktop.
Phone-specific layouts stay ask-only.

If an on-foot character shares the world, create its body with
`userData: { controller: { excludeVehicleRay: true } }` so the wheels never
treat the player as drivable ground.

## Custom generated bodies (`npx genex model`)

A generated GLB works as the visual chassis — add it under `car.chassisObject`
exactly like `carBodyMesh` above. Generated car models arrive as ONE mesh with
the wheels baked in (prompting "no wheels" does not reliably remove them) —
that is the expected input. Three rules make it read right:

- **Never add visible wheel meshes to a generated body.** Leave every
  `wheel.modelObject` empty — the suspension shapecasts drive the body
  correctly with no wheel visuals, and code wheels next to the baked-in ones
  read as a six-wheeled monster truck. The baked wheels simply don't spin;
  at game speed that's the accepted look. (The cylinder wheels in the wiring
  above are for hand-built box-chassis cars only.)
- **Fit the invisible wheels to the body, not the body to the preset.**
  Scale the GLB by LENGTH toward the preset's footprint (body length ≈
  wheelbase + 1.5 m; race-grip/muscle-drift wheelbase is 3.0 m, track
  1.7 m) — never a min-axis bounding-box fit, which shrinks the body and
  strands the wheel slots outside its silhouette. Then move the wheel slots
  to the model's own wheel arches (from its bounding box: axles at roughly
  ±0.33 × body length on z, x at ±(half width − 0.1)) and set
  `rayShapeR`/`wheelModelRadius` so the body STANDS on the road — baked
  tires touching the ground, nothing floating.
- **Verify the facing before anything else.** +Z must be the nose:
  generation regularly comes back rotated 180° (the classic "car drives
  backward" bug) — apply the one-time yaw wrapper from `$genex-ai-model`,
  then confirm in your smoke test that the NOSE leads under forward input.

Center the GLB over the chassis colliders. Collider strategy for GLBs lives
in `$genex-threejs-physics-rapier`.

## Presets and provenance

| Preset | Drivetrain | Suspension | Notes |
| --- | --- | --- | --- |
| `arcade-kart` | 600 HP, AWD, front steer, single gear | stiff (springK 38000) | upstream demo "Vehicle 1", verbatim. The safe default. |
| `muscle-drift` | 600 HP, AWD with rear `driveTorqueWeight: 2` | soft (springK 25000) | upstream demo "Vehicle 2", verbatim. Power-oversteers into drifts under throttle. |
| `offroad-bouncy` | 450 HP, AWD, wider steering | soft, long travel (rayLength 0.8), bigger wheels | Genex-authored starting point derived from arcade-kart. |
| `race-grip` | 800 HP, RWD, 4-speed gearbox | very stiff (springK 42000) | Genex-authored, tuned in the testbed (see below). |

**Suspension scales with mass.** `springK`/`dampingC` in `wheelShared` were
tuned against each preset's `assumedChassisDensity` (200 for all four). If
your chassis is materially heavier or lighter, rescale `springK`
proportionally and keep `dampingC` below `2*sqrt(springK * massPerWheel)` —
too little spring bottoms out, too much damping locks the suspension solid.

## Gearbox and RPM

- Peak engine torque derives as `engineHorsepower * 7022 / engineMaxRPM`
  (N·m); "car feels slow" → raise `engineHorsepower`.
- A single-entry `gearRatios` (arcade-kart, muscle-drift) disables shifting.
  Multiple entries enable the auto shift: up above `shiftUpRPM`, down below
  `shiftDownRPM`, with `shiftCooldown` seconds between shifts.
  `transmissionMode: "manual"` shifts only via `car.setGear(index)`.
- Live telemetry for HUDs: `car.engineRPM` (drive-weighted average wheel RPM
  × drive ratio), `car.gearIndex` (0-based — display `gearIndex + 1`),
  `car.currLinVel.length() * 3.6` for km/h.
- **Why race-grip's gearing works** (and what to check if you author your
  own gearbox): rolling resistance grows with wheel speed, so each gear has
  a drag-limited equilibrium RPM it can never exceed on flat ground
  (measured in the testbed: ~5500 / ~4900 / ~4100 for race-grip's gears
  1–3). `shiftUpRPM` must sit BELOW the current gear's equilibrium or the
  shift point is never reached and the car sits at redline forever.
  race-grip uses `shiftUpRPM: 4300`, giving clean upshifts with post-shift
  RPM ~2800–3000 — safely above `shiftDownRPM: 2400`, so no gear hunting.
  Lower `rollingResistanceCoef` (race-grip: 0.004 vs default 0.007) raises
  every gear's ceiling and buys the shifter headroom.

## Drift tuning: tire grip vs rollover

The knobs, in the order to reach for them:

- `tireGripFactor` (wheel option, default 1.5) — averaged with the ground
  collider's friction: effective grip = `(surfaceFriction + tireGripFactor) / 2`.
  Lower = more slide everywhere.
- `latFrictionEllipseScale` — scales ONLY the cornering half of the friction
  ellipse. The direct drift knob: below 1 the car slides sideways sooner
  while braking/accelerating stay strong.
- `driveTorqueWeight` on the rear slots (muscle-drift uses 2) — rear-biased
  torque makes throttle break the rear loose.
- Brake-and-turn (Space is the brake) initiates a slide with any preset.

**The rollover trap** — measured in the testbed while retuning `race-grip`:
the lateral slip curve keeps ~90% grip even in a full slide, so peak lateral
acceleration is about `(surfaceFriction + tireGripFactor) / 2 *
latFrictionEllipseScale` in g. If that exceeds the chassis's static rollover
threshold (`halfTrack / comHeight` — ~1.0 g for the race-grip chassis), a
hard slide TRIPS THE CAR OVER instead of drifting. The race-grip retune
fixed exactly this, two-sided:

1. capped lateral grip with `latFrictionEllipseScale: 0.8` (and
   `lngFrictionEllipseScale: 1.15` so braking/launch stay strong), and
2. lowered the center of mass — a light cabin collider (density 60) over a
   low-slung main mass (offset y −0.15) keeps the CoM near axle height so
   hard cornering leans instead of tipping.

If your car flips in corners, do the same: lower the grip-side product or
lower the CoM. Raising `springK` alone does not fix rollover.

## Telemetry for effects

Per wheel (from `car.wheels`, a `ReadonlyMap<string, ShapeCastWheel>`):
`wheel.slipStrength` (0..1, max of longitudinal/lateral slip — the skid
smoke/screech trigger), `wheel.rayHitPos` + `wheel.rayHitNormal` (where to
spawn marks), `wheel.wheelLinVel` (surface speed), `wheel.rayHit` (null when
airborne). Vector getters are live internal instances — `.copy()` them,
never mutate. Value getters are one-frame-stale snapshots by design.
