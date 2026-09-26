---
name: genex-threejs-vehicle-controllers
description: Add a drivable car or a flyable drone to a Genex Three.js game with `npx genex controller car` / `npx genex controller drone` — shapecast-wheel vehicle physics with a gearbox, PD quadcopter flight, tuned presets, character enter/exit with animation and camera handoff, all over Rapier physics. Use whenever the player drives or flies something.
---

# Genex Three.js Vehicle Controllers

Real vehicle physics for plain Three.js games: a car built from a dynamic
chassis body plus one shapecast wheel per corner (suspension spring/damper,
slip-curve tire model, speed-sensitive steering, engine torque curve with an
RPM-threshold automatic gearbox), and a quadcopter drone flown by a PD
attitude controller mixing four thrust propellers. Both are vendored
TypeScript classes copied INTO the game — not an npm dependency — so the code
is yours to read and tune.

## Install

Run inside the game project (where `genex init` ran):

```bash
npx genex controller car      # VehicleController + ShapeCastWheel + presets
npx genex controller drone    # DroneController + presets
npm i @dimforge/rapier3d-compat
```

Files land in `src/controllers/` (shared physics glue, the vehicle or drone
module, `interact/enter-exit.ts`, and the input + follow-camera modules).
Existing files are never overwritten (use `--force` to refresh). For the
on-foot character that enters these vehicles, also run
`npx genex controller character` and load `$genex-threejs-character-controller`.

These files become game-owned. Do not use `--force` as an upgrade mechanism after editing them;
install into a scratch project and port the targeted `syncFromBody`/transition changes.

## The loop contract (get this right first)

Every controller exposes `update(dt?)` that must run once per **fixed physics
substep, BEFORE `world.step()`**. The `dt` argument is ignored — all internal
math uses `world.timestep`. Wire it through `PhysicsWorld` (installed with
every controller kind):

```ts
const physics = await PhysicsWorld.create();

physics.onBeforeStep(() => {
  const dt = physics.timeStep;
  // 1. kinematic platforms (setNextKinematicTranslation/Rotation)
  mgr.update(dt);                                // 2. enter/exit manager
  if (!character.isParked) character.update(dt); // 3. controller brains
  car.update(dt);
  drone.update(dt);
});                                              // 4. world.step() runs after

let lastT = performance.now();
renderer.setAnimationLoop(() => {
  const nowT = performance.now();
  physics.step(Math.min((nowT - lastT) / 1000, 0.1)); // fixed substeps + interpolated mesh sync
  lastT = nowT;                   // performance.now() delta — THREE.Clock.getDelta() freezes at 0 in real games
  // camera + render here — render-delta code never goes inside onBeforeStep
});
```

Never call a controller's `update()` from the render loop, never step the
world yourself, and never feed the render delta into physics code.

**One input path.** With an `EnterExitManager`, vehicle input flows ONLY through
each `registerVehicle`'s `applyInput` (routed while driving). Delete any direct
`car.setMovement(...)`/`drone.setMovement(...)` calls from your before-step —
leaving one in makes WASD drive the empty car while the player is on foot. The
standalone `setMovement` wiring in the car/drone references applies only to
games with no on-foot character.

## Wiring references

- [references/car.md](references/car.md) — chassis body + colliders, wheels,
  presets with provenance, gearbox and RPM, drift vs rollover tuning.
- [references/drone.md](references/drone.md) — body + propeller mounts,
  VELOCITY vs POSITION control modes, the PD gain mass-scaling rule, presets.
- [references/enter-exit.md](references/enter-exit.md) — `EnterExitManager`,
  park/unpark, sensor tuning, seat animations (`Sitting_Enter` /
  `Driving_Loop` / `Sitting_Exit`), follow-camera handoff — **including the
  touch interact button**: on phones there is no F key, so the enter prompt
  must be tappable (and an Exit button shown while driving) or the shared
  link is unenterable on mobile. Wire it whenever you wire the touch
  joysticks (`navigator.maxTouchPoints > 0`; the shared touch kit + genre
  recipes live in `$genex-threejs-touch-controls`).

## Presets at a glance

Spread a preset into the controller and build colliders/wheels/propellers
from its recipe (exact code in the references).

| Preset | Kind | Feel | Provenance |
| --- | --- | --- | --- |
| `arcade-kart` | car | AWD, stiff, forgiving — the safe default | upstream demo, verbatim |
| `muscle-drift` | car | soft, rear-biased torque, power-oversteers | upstream demo, verbatim |
| `offroad-bouncy` | car | long-travel springs, big wheels, low grip | Genex-authored |
| `race-grip` | car | stiff RWD, 4-speed auto gearbox, flat controllable drift | Genex-authored, testbed-tuned |
| `camera-drone` | drone | slow, heavily damped filming platform (~2 kg) | Genex-authored |
| `racing-drone` | drone | agile FPV-style racer (~5 kg) | Genex-authored |
| `heavy-lifter` | drone | ~298 kg cargo platform, POSITION gains pre-scaled | upstream demo, verbatim |

## Custom generated bodies

`npx genex model` GLBs drop straight in as vehicle visuals — but generate them
**without the moving parts**: a car body with no wheels ("red sports car body,
no wheels"), a drone frame with no propellers. Wheels and blades are
code-driven (`wheel.modelObject` steers/bounces/spins; a propeller spins its
`spinModel`), so moving parts baked into the body mesh stand frozen while the
physics moves the vehicle — it reads as broken. A wheel-less or bladeless body
is valid and drives/flies correctly; add per-corner wheel meshes or per-mount
blades only when you want them visible. Exact wiring in the car/drone
references.

On enter/exit: the on-foot character **disappears into the vehicle on enter
(`park()` hides it) and reappears at the exit point on dismount** — designed
behavior, not a bug. Don't leave the character mesh standing next to a car it
is supposedly driving; see [references/enter-exit.md](references/enter-exit.md).

## Multiplayer: vehicle occupancy is confirmed object ownership

If the game is multiplayer, **who is in what vehicle must be synced** — a
remote player vanishing into an apparently empty car reads as a bug. Load
`$genex-threejs-multiplayer` before writing any networking code, then:

- Install `genex controller networked-physics` and use `NetworkedVehicle`. A seat is the vehicle
  object's confirmed owner—not a writable `shared` key. Enter only after `claimConfirmed` accepts;
  two simultaneous entrants therefore produce one driver and one clean loser.
- **Occupied means owned.** Idle vehicles stay unowned, so a present owner IS the current driver —
  `enter()` refuses an owned vehicle by default (the relay's short hold only protects the first
  ~300 ms of a drive, so without this gate any walk-up claim would hijack a moving car and dump its
  driver). Pass `enter({ steal: true })` only when carjacking is an intended mechanic, and wire
  `onSeatLost` so a forcibly dismounted driver returns to on-foot controls instead of a dead seat.
- Publish `driving: "car" | null` in the player's state for remote visuals. Use `me.snap` on entry/exit
  mode edges, and continuous `objects.set` only from the confirmed driver.
- Same authority rule as the character: the **local player simulates the
  physics of whatever they occupy**; remote vehicles are visuals only —
  draw the SDK-smoothed `objects.get(id).state` directly on a plain mesh
  (never re-lerp/buffer it) and never run `VehicleController`/
  `DroneController` for a remote player.
- Idle vehicles remain unowned at their last raw pose. The host may explicitly claim+snap+release to
  seed/reset, but must not continuously adopt or republish parked vehicles. Persist raw idle truth.
- On accepted entry, seed the body from `stateRaw`, enable/register/wake it, call `syncFromBody`, and
  `snapBodyInterpolation` before controls/camera read it. On exit, publish final pose, player-snap the
  character, unregister, then wait for confirmed release.

## Boundaries and troubleshooting

- Physics world setup, collider strategy for `genex model` GLBs, and general
  Rapier pitfalls live in `$genex-threejs-physics-rapier`.
- Camera systems beyond the bundled follow camera: `$genex-threejs-camera-direction`.
- Skid smoke, dust, rotor wash: `$genex-threejs-procedural-vfx`, driven by
  the telemetry getters listed in the references (`wheel.slipStrength`,
  `drone.propellersInfo`).
- **One-time console warning at boot** ("using deprecated parameters for the
  initialization function...") comes from the Rapier WASM loader itself —
  harmless, not fixable from game code. Do not chase it.
