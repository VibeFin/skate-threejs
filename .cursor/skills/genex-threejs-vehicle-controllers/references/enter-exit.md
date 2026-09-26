# Enter/exit: character ↔ vehicle handoff

`EnterExitManager` (`interact/enter-exit.ts`) owns the whole flow: it puts a
proximity sensor on every registered vehicle, surfaces a "Press F" prompt
when the on-foot character walks into one, and on interact **parks** the
character (hidden + physics disabled) and hands control — input routing and
camera target — to the vehicle; interacting again places the character
beside the vehicle and hands control back.

It needs the on-foot character from `npx genex controller character`
(`CharacterController` implements the `park()`/`unpark()` contract the
manager calls; see `$genex-threejs-character-controller`). `CHARACTER_ID`
(`"character"`) is the reserved id for the on-foot unit.

## Wiring

```ts
import { EnterExitManager, CHARACTER_ID } from "./controllers/interact/enter-exit.ts";

const mgr = new EnterExitManager({
  world: physics.world,
  character, // the CharacterController instance
  applyCharacterInput: () => {
    character.setMovement(kb.getCharacterMovement()); // routed only while on foot
  },
  onPromptChange: (target) => {
    // Drive your DOM prompt from here; fires on change only (incl. -> null).
    promptEl.textContent = target ? `Press F to enter ${target.label}` : "";
    promptEl.style.display = target ? "block" : "none";
  },
  onHandoff: (fromId, toId) => {
    // Fires after control switches — seat visuals + input hygiene (below).
  },
});

mgr.registerVehicle({
  id: "car",
  label: "Car",
  vehicle: car,                       // VehicleController satisfies this structurally
  exitAxis: "bodyX",                  // cars step out sideways
  exitLength: 2.2,
  // radius ≥ the chassis half-length (2.4 here) — see "Sensor and exit tuning".
  sensor: { kind: "cylinder", halfHeight: 0.5, radius: 2.5, offset: { x: 0, y: 0.1, z: 0 } },
  applyInput: () => car.setMovement(kb.getCarMovement()), // routed only while driving
});

mgr.registerVehicle({
  id: "drone",
  label: "Drone",
  vehicle: drone,
  exitAxis: "up",                     // the drone drops the pilot off below it
  exitLength: 1.6,
  sensor: { kind: "ball", radius: 2.4 },
  applyInput: () => drone.setMovement(kb.getDroneMovement()),
  onOccupantEnter: () => {
    drone.setControlMode("VELOCITY"); // stick flying while boarded
  },
  onOccupantExit: () => {
    // Fires BEFORE the character is unparked — capture the hold pose first.
    drone.setTarget(drone.currPos, drone.bodyZAxis);
    drone.setControlMode("POSITION"); // autopilot-hover where it was left
  },
});

// Sensor events: feed the raw collision tap into the manager.
physics.onCollisionEvent((h1, h2, started) =>
  mgr.handleIntersectionEvent(h1, h2, started)
);

// Interact: EDGE-triggered (key transition, never a held-key poll — that
// would enter and exit every frame). kb.onInteract is the F key, pre-guarded.
kb.onInteract(() => mgr.requestInteract());

// TOUCH DEVICES: there is no F key on a phone — make the SAME prompt tappable, or the
// game is unenterable on the shared link. One button, the exact same code path as the key
// (claim-before-park in multiplayer included); it doubles as the Exit button while driving.
if (navigator.maxTouchPoints > 0) {
  promptEl.style.pointerEvents = "auto";      // the prompt div IS the button
  promptEl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    onInteractPressed();                      // whatever your F-key handler calls
  });
  // While driving there's no proximity prompt — show a fixed "Exit" button instead:
  exitBtn.style.display = mgrIsDriving ? "block" : "none"; // toggle in onHandoff
  exitBtn.addEventListener("pointerdown", () => mgr.requestInteract());
}
```

Loop order per fixed substep (inside `physics.onBeforeStep`): **`mgr.update(dt)`
FIRST** (consumes the interact request, refreshes the camera feed, routes
input to the active unit), then the controller `update()`s, then the world
steps. Skip `character.update()` while `character.isParked`. Sensor events
drain after the step, so proximity lags input by at most one frame — as
designed.

Registration order = prompt priority: when two sensors overlap, the first
registered vehicle wins the prompt.

## Sensor and exit tuning

- Default sensor: cylinder `halfHeight 0.4, radius 1.5, offset (0, 0.1, 0)`.
  `radius` is the knob that matters for prompt range. Sensors are mass-0 —
  they never shift the chassis center of mass.
- **Long-chassis gotcha (measured in the testbed):** the sensor is centered
  on the body, so if the chassis half-length exceeds the sensor radius
  (testbed car: half-length 2.4 vs radius 2.2), walking up from dead astern
  touches the bumper before the capsule enters the sensor — the prompt only
  appears after sliding along the side, while a side approach prompts
  immediately. Fix: sensor radius ≥ chassis half-length, or an offset
  sensor per end.
- `exitLength` (default 1.5) is how far along `exitAxis` the character
  reappears. Raise it if the character spawns inside a wide chassis. The
  default equals the default sensor radius so immediate re-entry stays
  possible — intended.
- Flipped/nose-down vehicles are supported: the manager projects the live forward axis and falls back
  to body-X/world-Z before normalization, so the exit basis remains finite. Still choose an
  `exitLength` that clears the actual chassis collider.

## Seat visuals: Sitting_Enter / Driving_Loop / Sitting_Exit

`park()` hides the character body and visuals — the manager does NOT animate
a seated pilot; that is game glue on the `onHandoff` seam. The pattern: keep
a reference to the character's visual model, re-parent it into a seat anchor
under the vehicle's chassis object, and play the seat clips through a
dedicated `THREE.AnimationMixer` (the locomotion state machine is idle while
parked). The seat clips are animation-pack clips — install them once with
`npx genex controller anims sit drive` (they land in `public/assets/anims/`
and `loadCharacterClips` from the character controller picks them up).

```ts
const seatMixer = new THREE.AnimationMixer(characterModel);
const seatAnchor = new THREE.Group();

function enterSeat(host: THREE.Object3D, seatPos: THREE.Vector3) {
  seatAnchor.position.copy(seatPos);        // e.g. (0, 0.55, -0.6) for a car cabin
  host.add(seatAnchor);
  characterModel.position.set(0, 0, 0);     // remember the old pose to restore on exit
  characterModel.quaternion.identity();
  seatAnchor.add(characterModel);
  const enter = seatMixer.clipAction(sittingEnterClip); // "Sitting_Enter"
  enter.reset();
  enter.setLoop(THREE.LoopOnce, 1);
  enter.clampWhenFinished = true;
  enter.play();
  // On the mixer's "finished" event, crossFade to the "Driving_Loop" action.
}

function exitSeat() {
  // Optionally play "Sitting_Exit" (LoopOnce) before restoring; then:
  seatMixer.stopAllAction();
  seatAnchor.removeFromParent();
  character.root.add(characterModel);       // restore the remembered pose
}

// onHandoff wiring: enter when control moves TO a vehicle, exit when it
// returns to the character.
onHandoff: (fromId, toId) => {
  if (toId !== CHARACTER_ID) enterSeat(hostFor(toId), seatPosFor(toId));
  else exitSeat();
  // Input hygiene: zero the released unit's held inputs, or an exited car
  // keeps driving on its last merged input state.
  if (fromId === "car") car.setMovement({ forward: false, backward: false,
    steerLeft: false, steerRight: false, brake: false });
}
```

While parked, tick `seatMixer.update(renderDelta)` in the render loop
instead of the locomotion `CharacterAnimations.update()`. With a rig-less
model (no matching clips) skip the mixer and just re-seat the visual — the
handoff still works.

## Camera handoff via FollowCamera

The manager exposes a camera feed; the bundled `FollowCamera` consumes it.
Per RENDER frame (render delta — never inside the fixed step):

```ts
const t = mgr.cameraTarget;              // activeUnit.currPos + bodyYAxis * 0.5
followCam.moveTo(t.x, t.y, t.z, true);
followCam.setUp(mgr.cameraUp);           // activeUnit.upAxis
if (mgr.activeControllerId === CHARACTER_ID) {
  if (physics.stepsLastFrame > 0 && character.isOnPlatform) {
    followCam.applyPlatformTurn(character.turnOnYQuat); // per-physics-step delta
  }
} else if (mgr.activeVehicle) {
  followCam.alignHeading(mgr.activeVehicle.bodyZAxis, delta); // ease behind the vehicle
}
followCam.update(delta);
```

`alignHeading` eases the orbit behind the vehicle at `headingAlignGain`
(default 5; 0 disables) and always yields to an active user drag-orbit.
`cameraTarget`/`cameraUp` are reused internal vectors — copy, never mutate.

**Follow camera v1 limits (by design):** no truck/pan (the pivot is always the
followed unit), and the orbit space assumes up ≈ +Y — `camera.up` lerps toward
the fed up-axis, but a far-from-Y gravity direction will misbehave. For rigs
beyond this, see `$genex-threejs-camera-direction`.

**Pointer-lock aim + vehicles:** `FollowCamera`'s aim mode (see
`$genex-threejs-camera-direction`) is on-foot only — one shared camera serves
both character and vehicle, so pause aim while driving and it resumes on foot:

```ts
onHandoff: (fromId, toId) => followCam.setPaused(toId !== CHARACTER_ID),
```

Enter is clean — exiting a lock needs no gesture. On **exit**, though, `onHandoff`
runs deferred inside `update()`, NOT in the F-key handler, so `setPaused(false)`'s
re-lock request has no live user gesture: aim emits `needs-gesture`, the "click to
aim" cue stays up, and the next gesture (a click OR any keypress — the walk keys
count) re-locks automatically. So it recovers on its own; just don't expect the lock
back on the exact exit frame. Vehicle cameras keep their `alignHeading` behavior.

If the game also has a menu phase (most do), fold both signals into ONE derived
boolean recomputed from `setPhase` AND `onHandoff` —
`followCam.setPaused(phase !== "playing" || activeId !== CHARACTER_ID)` — so
neither wiring overwrites the other's pause. Both call sites fire on real
transitions only; `setPaused` is idempotent, so an occasional repeated value is
harmless (but never drive it from the render loop).

## Multiplayer

Occupancy uses confirmed object ownership — remote players must see who is in what. With
`$genex-threejs-multiplayer` (load it before writing any networking code):

- Put `driving: "car" | "drone" | null` in each player's synced state; on
  remote change, show/hide that player's on-foot avatar and seat their
  visual in the vehicle (the seat-visual pattern above, minus the physics).
- The occupant simulates the vehicle and publishes its pose; everyone else draws the
  SDK-smoothed `objects.get(vehicleId).state` directly on a plain mesh — the SDK already
  interpolates it. Never buffer/lerp that `state` a second time, and never run the vehicle
  controllers for a remote player's vehicle.
- Install `genex controller networked-physics` and use `NetworkedVehicle`: gate entry on
  `NetworkedVehicle.enter()` / `objects.claimConfirmed(vehicleId)` **before** parking the
  character or switching the `EnterExitManager` active unit — a rejected seat must leave the
  on-foot prompt and controls untouched. Do NOT put the claim inside `onOccupantEnter` after the
  park: `performInteract` has no rollback, so a rejection there strands a hidden character wired
  to a vehicle it never won. Never use `shared.set("occupant:car", ...)` as a lock—any client can
  overwrite it. An accepted seat seeds from raw pose, calls `syncFromBody` +
  `snapBodyInterpolation`, and becomes the only publisher.
- Exit publishes final vehicle truth, uses `me.snap` for the player mode edge, unregisters the local
  body, and waits for `releaseConfirmed`. Idle vehicles stay unowned; host seed/reset is the narrow
  `{ authority: "host" }` claim+snap+release path.
