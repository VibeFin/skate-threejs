# Presets and tuning

Every option has a tuned default — start from a preset and override only what
feels wrong. Spread the preset's `options` into the constructor:

```ts
import { characterPresets } from "./controllers/character/presets.ts";

const character = new CharacterController(world, camera, {
  ...characterPresets["platformer-snappy"].options,
  maxRunVel: 8, // your overrides win
  userData: { controller: { excludeVehicleRay: true } },
});
```

## Preset table

| Preset | Provenance | Assumed density | Feel |
| --- | --- | --- | --- |
| `default` | ported library defaults, verbatim | 1 | balanced third-person: walk 2 m/s, run 5 m/s, decisive jump, moderate grip |
| `heavy-body-reference` | ported demo tuning, verbatim | **200** | heavy body with proportionally stiff springs — the reference for the scaling rule below |
| `platformer-snappy` | Genex-authored | 1 | quick starts/stops, strong jump + heavy fall, extra air control, hold-to-run |
| `souls-heavy` | Genex-authored | 1 | weighty, committed movement; low deliberate jump; pronounced run lean |
| `moon-bounce` | Genex-authored | 1 | long floaty jumps — **requires world gravity `(0, -1.62, 0)`**; the preset does not set world gravity for you |
| `ice-slide` | Genex-authored | 1 | near-zero grip, wide sliding turns |

Every preset states the collider `density` it was tuned for
(`assumedDensity`, mirrored into `options.density`). That matters because of:

## The density/spring scaling rule

The float spring and auto-balance springs apply raw impulses, so they scale
roughly **linearly with body mass** (mass = density × capsule volume). Change
`density` (or the capsule size) and the springs must scale in the same
proportion or the character sinks/oscillates/faceplants. The two shipped
anchor points:

| Option | density 1 (`default`) | density 200 (`heavy-body-reference`) |
| --- | --- | --- |
| `springK` | 80 | 6400 |
| `dampingC` | 6 | 860 |
| `autoBalanceSpringK` | 0.5 | 50 |
| `autoBalanceDampingC` | 0.03 | 3 |
| `autoBalanceSpringOnY` | 0.08 | 8 |
| `autoBalanceDampingOnY` | 0.006 | 0.76 |

Recipe for "make the character feel heavier": raise `density`, multiply those
six constants by the density ratio as a starting estimate (the reference
values are hand-tuned near that line, not exactly on it), then fine-tune —
pogo bounce means `dampingC` too low, sticky landings too high, slow-motion
tip-overs mean the `autoBalance*` pair is too soft.

## "User says X → tune Y" map

| The user says | Change |
| --- | --- |
| "it's slippery / skates around" | raise `slideGripFactor` (default 0.5; `ice-slide` uses 0.05) |
| "falling feels floaty" | raise `fallingGravityScale` (default 3) |
| "jump too weak / too strong" | `jumpVel` (default 5 m/s); `jumpDuration` (default 0.1 s) stretches the takeoff window |
| "it walks up cliffs / slopes that should slide" | lower `slopeMaxAngle` — **default is `Math.PI / 2.5` = 72°, so a 50° ramp is walkable out of the box**; `Math.PI / 4` makes 45°+ slide |
| "should climb steeper slopes" | raise `slopeMaxAngle` |
| "feels heavier / like a tank" | `souls-heavy` preset, or raise `density` + apply the spring scaling rule above |
| "sluggish to start / stop" | raise `accDeltaTime` / `decDeltaTime` (responsiveness in (0, 1]; default 0.2 — higher is snappier) |
| "drifts sideways through turns" | raise `rejectVelFactor` toward 1 (default 1; `ice-slide` lowers it to 0.2) |
| "too slow / too fast" | `maxWalkVel` (default 2) / `maxRunVel` (default 5) |
| "run should be hold, not toggle" | `enableToggleRun: false` (default true = Shift toggles) |
| "sneaks too fast / too slow" | `crouchSpeedRatio` (default 0.45 × `maxWalkVel`) |
| "can't fit under the obstacle when crouched" | lower `crouchCapsuleScale` (default 0.6 — the crouched capsule's cylinder half-height as a fraction of standing; the head drops by `2*(1-scale)*capsuleHalfHeight`) |
| "crouch should be hold, not toggle" | `crouchMode: "hold"` (default `"toggle"` — C flips it) |
| "no control in the air" | raise `airDragFactor` (default 0.1) |
| "falls too fast at terminal velocity" | `fallingMaxVel` (default 20 m/s) |
| "leans too much when running" | lower `moveImpulsePointOffset` (default 0.5; 0 = no lean) |
| "wobbles / tips over" | raise `autoBalanceSpringK` + `autoBalanceDampingC` |
| "turns to face direction too slowly" | raise `autoBalanceSpringOnY` |
| "grounded flag flickers on stairs / ledges" | raise `rayHitForgiveness` (default 0.28) |
| "bounces on landing (pogo)" | raise `dampingC`; "sticks to the ground on landing" → lower it |
| "hovers too high / feet in the floor" | `floatHeight` (default 0.2) — and re-check the model's foot offset (wiring reference) |
| "should always face the camera (strafe/shooter)" | `lockForward: true`, or `setLockForward(true)` at runtime |
| "jump should push off slopes" | `slopeJumpFactor` (default 0 = straight up, 1 = off the slope normal) |
| "moon / low gravity" | `moon-bounce` preset **plus** `PhysicsWorld.create({ gravity: [0, -1.62, 0] })` |
| "camera feels laggy / rubber-bandy" | `FollowCamera` `smoothTime` (0.05 snappy → 0.25 cinematic) |
| "camera clips through walls" | add the static level meshes to `FollowCamera` `colliderMeshes` |

## Sizing a different character

`capsuleHalfHeight` (default 0.3) and `capsuleRadius` (default 0.3) define the
collider: total capsule height = `2 * (capsuleHalfHeight + capsuleRadius)` =
1.2 by default, floating `floatHeight` above the ground. For a bigger
character scale both, remember the ground-query defaults derive from them
(`rayLength = capsuleRadius + 1`, `rayRadius = capsuleRadius / 2`,
`rayOriginOffset = -capsuleHalfHeight`), and re-tune the springs — a bigger
capsule is a heavier body at the same density.

## Do-not-touch list

- `friction: -0.5` on the capsule is intentional (negative averages against
  the ground and keeps the capsule from grabbing walls); traction comes from
  the controller's own grip model, not collider friction.
- Ground detection: `"shapeCast"` (default) is forgiving on stairs and ledge
  edges; `"rayCast"` is cheaper and stricter. Switch at runtime with
  `setGroundDetection(...)` — don't hand-roll a third scheme.
- Platform behavior (`followPlatform`, `applyCounterMass`,
  `applyCounterJumpImp`, `applyCounterMoveImp`) defaults to physically-honest
  and already handles moving/rotating platforms; only touch these for
  deliberate arcade effects.
