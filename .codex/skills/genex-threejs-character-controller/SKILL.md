---
name: genex-threejs-character-controller
description: Add Genex's tuned ECCTRL-derived physics character controller with `npx genex controller character`: dynamic-capsule movement, follow camera, touch input, and one loader that resolves the player's body — the game's own generated character by default, the profile VRM avatar as the fallback. Use for every on-foot player or third-person movement request.
---

# Genex Three.js Character Controller

## Run the command first — never hand-write the controller

```bash
npx genex controller character
npm i @dimforge/rapier3d-compat @pixiv/three-vrm   # three is already in the scaffold
```

The command vendors tested, tuned controller code into the game: TypeScript
modules into `src/controllers/` (including `character/vrm/` — VRM loading,
animation retargeting, capsule auto-fit, foot IK) and the 12-clip core
`animation-library.glb` (idle/walk/run/jump/crouch + hit/death/interact,
~1.3 MB) into `public/assets/`. Need more — swords, pistols, magic, climbing,
swimming, emotes? Install exactly what the game uses with
`npx genex controller anims <tags|clip names…>` (see Animations below). The
copied files are then owned by the game —
edit them freely; re-running skips existing files unless `--force`. Do not write
a character controller from scratch and do not swap in a kinematic-controller
tutorial: this one is a real dynamic body that pushes crates, rides moving
platforms, climbs stairs and slides on too-steep slopes out of the box.

## The player's body: the game's own character

**The player wears the character this game generated for itself.** That is the
default for any game where a human body appears on screen — third-person
obviously, and first-person too the moment remotes, a look-down body, a shadow,
a death cam, or a menu portrait shows one. Load `$genex-ai-character` and start
it EARLY, with your first art actions, so it lands around the v0 preview
instead of after it.

The profile VRM avatar is the **fallback**, and the command bakes a neutral CC0
copy to `public/assets/avatar.vrm` (attribution in `src/controllers/NOTICE.md`)
so a fresh game always has a working body. It is used when:

- the generated character hasn't landed yet — say in one plain line that this
  body is temporary; or
- it genuinely could not be made (out of credits, generation failed, email
  unverified) — say so in one line, record `Player character: VRM — <reason>`
  in DESIGN.md, and keep building.

At runtime the fallback lane loads the **visiting player's own** picked avatar
(`user.avatarUrl` from the embed identity); the baked file covers local dev and
load failures. Games whose player is not a person at all — a car, a ship, an
RTS cursor, a board — generate that object with `npx genex model` instead and
never enter this lane.

**You never write two boot paths for this.** `loadPlayerCharacter()` decides at
runtime from `public/assets/meshy-character.json` and returns one shape either
way, so the character arriving mid-build is a file drop
(`npx genex controller character --character <id>`) and not an edit to your
most load-bearing code. Wire the block under "Minimal wiring" once, at hour 0.

For a full custom LOCOMOTION SET beyond the UAL packs, see `$genex-ai-character`'s
motion section: `npx genex character animate <id> --locomotion` generates the
8-way walk + run set onto the character's own rig, filling the directional slots
this controller already resolves but the stock pack leaves empty. Signature moves
are the same command with a verb.

Before generating a Meshy character, discuss two or three visual directions.
When the user names a visual reference, inspect references before writing the
concept prompt. Recommend a neutral A-pose for characters that will be rigged.

Generate concept images first and show the actual images to the user. Do not
start Image-to-3D until the user explicitly selects a candidate. All three
concepts and the selected high-detail pre-rig generation stay in a neutral
A-pose; never use a dynamic concept pose or silently substitute a T-pose. Warn
that held, slung, or overlapping props and straps can fuse into the body or
obscure limbs, and recommend separate gameplay props.

```bash
npx genex animations search "rifle reload" --json
npx genex character "stylized sci-fi courier, practical clothing"
npx genex character preview <concept-id> --candidate <1|2|3> --user-approved
npx genex character finalize <preview-id> --user-approved --approve-remesh 10000 --animation 466
npx genex controller character --character <character-id>
```

Meshy Image-to-3D first produces an unremeshed high-detail model. Show its
front, back, left, and right views and report its measured face count. Preserve
that model in R2. Before rigging, ask the user to approve a separate
10,000-face triangle remesh. The 10k remesh—not the high-detail source—is
rigged and animated. (For these approvals, use your question tool when you
have one; if you have none, a short numbered list in chat.)

The generated character is a **same-rig Meshy-native lane**. Its animation-only
GLBs are accepted only when their skeleton signature matches the active
character revision; this lane does no runtime retargeting. The shared
ECCTRL-derived dynamic controller stays authoritative for collision, grounding,
facing, and world translation — identical in both lanes. The animation layer
poses the visual rig; it never translates the visual root.

Meshy manifests bypass browser cache, so newly installed actions must work
after preview without asking the player to disable cache. `playOneShot()`
returns false and emits one warning when a requested clip is absent; treat
that as an installation failure, not a successful action.

Meshy limb rotations play unchanged. Never freeze hand tracks or apply
post-mixer arm, hand, leg, or foot corrections. Only horizontal root or hip
translation may be normalized for Rapier. A bad native rig or clip must be
rejected and regenerated. A controller pack is an immutable exact action set:
if a required binding is absent, installation fails instead of substituting
Meshy's rig-basic Walking or Running animation.

Because these files are game-owned, never run `genex controller character --force` over an edited
fork as a migration strategy. Install a fresh copy elsewhere and port only the named changes.

## What you get

| Module (under `src/controllers/`) | Exports you use | Job |
| --- | --- | --- |
| `shared/physics-world.ts` | `PhysicsWorld` | Rapier WASM init, fixed-timestep loop, body↔Object3D sync, collision events |
| `shared/colliders.ts` | `cuboidCollider`, `collidersFromObject`, … | colliders for level geometry and GLB props |
| `character/character-controller.ts` | `CharacterController` | the floating-capsule movement brain |
| `character/presets.ts` | `characterPresets` | six named tunings |
| `character/follow-camera.ts` | `FollowCamera` | orbit/zoom chase camera with collision pullback and pointer-lock aim ON by default (opt out with `pointerLockAim: false`) |
| `character/aim-cue.ts` | `createAimCue` | drop-in reticle + "click to aim" overlay; wire to `FollowCamera`'s `onAimChange` |
| `character/keyboard-input.ts` | `KeyboardInput` | WASD/arrows/Shift/Space/F state, no per-frame polling setup |
| `touch/*` | `TouchJoystick`, `VirtualButton`, `DragZone`, `RotateOverlay` | the shared touch kit — `$genex-threejs-touch-controls` owns the genre recipes |
| `character/character-animations.ts` | `CharacterAnimations` | animation state machine, directional profiles, speed-matched cadence, `playOneShot`, procedural fallback |
| `character/animation-packs.ts` | `loadCharacterClips` | loads the core + installed UAL packs and retargets them to the active VRM |
| `character/meshy/meshy-loader.ts` | `loadMeshyCharacter` | loads a Meshy manifest, exact-signature model/clips, locomotion slots, and fallbacks |
| `character/player-character.ts` | `loadPlayerCharacter`, `loadRemotePlayerCharacter` | **the player's body** — the game's generated character when it has one, the avatar fallback when it doesn't, one shape either way |
| `character/motion-actions.ts` | `MotionActionDriver` | applies only validated planar trajectories through the physics controller, never the visual root |
| `character/vrm/*` | `loadVrm`, `retargetClips`, `capsuleFromModel`, `FootIK` | the FALLBACK lane's parts: load a VRM avatar, retarget library clips onto its humanoid rig, auto-fit the capsule (works on both lanes), ground the feet |

## Minimal wiring

```ts
import { PhysicsWorld } from "./controllers/shared/physics-world.ts";
import { CharacterController } from "./controllers/character/character-controller.ts";
import { CharacterAnimations } from "./controllers/character/character-animations.ts";
import { loadCharacterClips } from "./controllers/character/animation-packs.ts";
import { characterPresets } from "./controllers/character/presets.ts";
import { FollowCamera } from "./controllers/character/follow-camera.ts";
import { createAimCue } from "./controllers/character/aim-cue.ts";
import { KeyboardInput } from "./controllers/character/keyboard-input.ts";
import { loadPlayerCharacter } from "./controllers/character/player-character.ts";
import { capsuleFromModel } from "./controllers/character/vrm/capsule-fit.ts";
import { waitForPlayer } from "@genex-ai/embed-sdk";

const physics = await PhysicsWorld.create(); // nothing RAPIER-related may run before this resolves

// The player's body — ONE call, both lanes. It plays as the character THIS
// GAME generated whenever `public/assets/meshy-character.json` is present
// (with that character's exact-rig clips and locomotion profile), and falls
// back to the visiting player's own profile avatar when it isn't — retargeting
// the bundled core library plus any packs installed by `genex controller
// anims`. `user.avatarUrl` comes from the embed identity
// ($genex-threejs-embed-auth boots before this) and is used only in that
// fallback lane; the baked `./assets/avatar.vrm` covers local dev and load
// failures. WRITE THIS ONCE: when the generated character lands mid-build,
// `genex controller character --character <id>` drops the manifest in and the
// next reload swaps the body. Nothing below changes.
const { user } = await waitForPlayer();          // from "@genex-ai/embed-sdk"
const player = await loadPlayerCharacter({ avatarUrl: user.avatarUrl });

const fit = capsuleFromModel(player.scene);    // collider fits THIS body's bounds
const character = new CharacterController(physics.world, camera, {
  ...characterPresets["default"].options,
  ...fit,
  position: { x: 0, y: 2, z: 0 },
  userData: { controller: { excludeVehicleRay: true } }, // car wheels must never drive on the player
});
scene.add(character.root);
character.root.add(player.scene);               // parent the body under the character root
player.scene.position.y = fit.modelOffsetY;     // root = capsule CENTER; drop the model so feet touch the floor
physics.registerBody(character.body, character.root); // root now follows the body, interpolated

// locomotionProfile is present in the generated lane and undefined in the
// fallback — pass it either way; CharacterAnimations handles both.
const anims = new CharacterAnimations(player.scene, player.clips, {
  locomotionProfile: player.locomotionProfile,
});
addEventListener("pointerdown", () => anims.playOneShot("Punch_Jab")); // punch on click

const kb = new KeyboardInput();
// Pointer-lock aim is ON by default (desktop). The kit's cue overlay gives you the
// reticle + "click to aim" prompt; pass `pointerLockAim: false` for cursor-core games.
const aimCue = createAimCue();
const followCam = new FollowCamera(camera, {
  domElement: renderer.domElement,
  colliderMeshes: staticWallMeshes, // static environment ONLY — never the character mesh
  onAimChange: aimCue.onAimChange,
});

// Fixed-substep phase: input + controller brain, BEFORE world.step().
physics.onBeforeStep(() => {
  character.setMovement(kb.getCharacterMovement()); // send the COMPLETE intent every step
  character.update(); // ignores any dt argument — uses the fixed world.timestep internally
});

// Render phase: step physics, then camera, then animations.
// Delta comes from performance.now(), NOT THREE.Clock — Clock.getDelta() has
// repeatedly frozen at 0 in real games (world renders, nothing moves).
const pivot = new THREE.Vector3();
let lastT = performance.now();
renderer.setAnimationLoop(() => {
  const nowT = performance.now();
  const delta = Math.min((nowT - lastT) / 1000, 0.1);
  lastT = nowT;
  physics.step(delta); // runs the fixed substeps + world.step() + mesh sync

  pivot.copy(character.currPos).addScaledVector(character.bodyYAxis, 0.5);
  followCam.moveTo(pivot.x, pivot.y, pivot.z, true);
  followCam.setUp(character.upAxis);
  if (physics.stepsLastFrame > 0 && character.isOnPlatform) {
    followCam.applyPlatformTurn(character.turnOnYQuat); // per-physics-step delta — gate on steps
  }
  followCam.update(delta);

  anims.update(character, delta); // see the animations reference
  player.update(delta);           // REQUIRED — ticks the VRM humanoid + spring bones
                                  // in the fallback lane, a no-op for native rigs.
                                  // Always call it: that is why the lane can change
                                  // under you without this loop changing.
  renderer.render(scene, camera);
});
```

The loop contract is strict: the controller's `update()` runs once per fixed
physics substep **before** `world.step()` (that is what `onBeforeStep` gives
you), and camera + animations run once per **render** frame with the render
delta, after `physics.step(delta)`. Read
[references/wiring.md](references/wiring.md) for the full walkthrough — level
colliders, model placement, moving platforms, camera details, enter/exit
hooks, and disposal.

## Presets and tuning

Spread a preset into the options and override only what feels wrong:
`"default"`, `"heavy-body-reference"`, `"platformer-snappy"`, `"souls-heavy"`,
`"moon-bounce"` (needs world gravity `(0, -1.62, 0)`), `"ice-slide"`. Read
[references/tuning-and-presets.md](references/tuning-and-presets.md) for the
preset table with provenance, the density/spring scaling rule, and the
"user says X → tune Y" map. Two traps worth knowing up front:

- `slopeMaxAngle` defaults to `Math.PI / 2.5` (72°) — a 50° ramp is **walkable
  out of the box**. Cap it (e.g. `Math.PI / 4`) if steep slopes should slide.
- The capsule ships with friction `-0.5` **on purpose** (grip is synthesized by
  the controller). Do not "fix" it to a positive value.
- CCD is enabled by default. For high-energy multiplayer arenas, set
  `maxExternalLinearSpeed` above every intended run/jump/fall speed and provide `isPoseAllowed`.
  `onRecovery` fires after body, root, velocity, and controller caches are restored in the same
  frame; use it to call `physics.snapBodyInterpolation(character.body)`, reset the camera target,
  and publish `room.me.snap(...)`. Bounds and spawn coordinates stay in game code.

## Animations + animation packs

`CharacterAnimations` resolves locomotion states (IDLE / WALK / RUN /
CROUCH_IDLE / CROUCH_MOVE / JUMP_START / JUMP_IDLE / JUMP_FALL / JUMP_LAND)
from the controller's live flags and crossfades mixer actions. Every OTHER
clip — punches, sword swings, pistol fire, spells, sit, dance, hit reactions —
plays through `anims.playOneShot("Punch_Jab")`, which layers over locomotion
and returns to it when done (punch-on-click is the default).

The bundled library carries only the 12 core clips. **Install what the game's
theme needs** from the 120-clip UAL catalog by tag/name. For motion UAL does
not cover, use the separate Meshy character lane:

```bash
npx genex controller anims sword pistol        # a sword+shooter game
npx genex controller anims stealth climb crawl # a ninja game
npx genex controller anims --list              # browse tags; --list <tag> for per-clip details
npx genex animations search "rifle reload" --json
npx genex character "stylized sci-fi courier, practical clothing"
npx genex character preview <concept-id> --candidate <1|2|3> --user-approved
npx genex character finalize <preview-id> --user-approved --approve-remesh 10000
npx genex character animate <character-id> --action <action-id>
npx genex controller character --character <character-id> # refresh the manifest
```

Meshy search results include an action ID, stable key, preview, loop mode,
motion policy, controller slots, requirements, review status, and estimated
cost. The installed Meshy manifest supplies exact-signature clips, directional
slots, fallbacks, and cadence data. UAL clips still land in
`public/assets/anims/` and are additive. Read
[references/animations.md](references/animations.md) for the tag catalog with
genre hints, `playOneShot` options, overrides, foot IK, and remote-player
animation.

For Meshy characters, do not repair hands, arms, or legs at runtime. Meshy limb
rotations play unchanged. Never freeze hand tracks or apply post-mixer arm,
hand, leg, or foot corrections. Only horizontal root or hip translation may be
normalized for Rapier. Verify that the installed manifest binds the expected
action IDs; if a native pose is bad or a required binding is missing, stop and
regenerate the character.

## Crouch (built in)

`C` toggles crouch (capsule shrinks, speed drops to `crouchSpeedRatio ×
maxWalkVel`, CROUCH_IDLE/CROUCH_MOVE play). Standing back up is
ceiling-checked: under a low obstacle the character STAYS crouched and pops up
automatically once clear; jumping while crouched requests a stand instead of
jumping. `crouchMode: "hold"` makes it hold-to-crouch;
`character.setCrouch(bool)` and `character.crouchActive` are the programmatic
hooks (that's also how a touch button wires in — see Mobile below).

Press every control that the HUD or handoff advertises. For Meshy characters,
crouch passes only when both the capsule behavior and a visibly crouched pose
are confirmed. Capture crouch-idle and crouch-move separately; a standing
animation over a shortened capsule is not working crouch.

## Mobile: TouchJoystick + VirtualButton (wire by default)

**Wire these whenever this controller is installed — not only when asked.**
Published games get opened on phones from shared links; the bundled touch
controls are ~6 lines and invisible on desktop. (Designing phone-specific
layouts or testing mobile viewports stays ask-only.)

```ts
import { TouchJoystick, VirtualButton } from "./controllers/touch/touch-joystick.ts";

const joy = new TouchJoystick({ floating: true }); // stick appears under the thumb; omit for a fixed bottom-left circle
const btnJump = new VirtualButton({ label: "Jump" }); // first button parks bottom-right by default
const btnCrouch = new VirtualButton({
  label: "Crouch",
  wrapperStyle: { right: "100px", bottom: "48px" }, // position every button after the first
  onPress: () => character.setCrouch(!character.crouchActive), // tap = toggle
});

physics.onBeforeStep(() => {
  character.setMovement({
    ...kb.getCharacterMovement(),
    jump: kb.space || btnJump.pressed,
    joystick: { x: joy.x, y: joy.y }, // non-zero joystick overrides the digital keys
  });
  character.update();
});
```

Show them only on touch devices: `joy.setVisible(navigator.maxTouchPoints > 0)`.
Give the canvas `touch-action: none` so camera drags aren't hijacked by page
scrolling. Joystick deflection sets direction only — the controller normalizes
it, so half-deflection is not half-speed. Default positions are safe-area-aware
(bottom-left stick, bottom-right button) — restyle or reposition via the style
options. The full genre recipes, the drag-zone and rotate-overlay primitives,
and the style-matching rules live in `$genex-threejs-touch-controls`.

## Multiplayer rule (mandatory)

**The local player is physics-authoritative; remote players are interpolated
visuals only.** Exactly one `CharacterController` exists — yours. For every
remote player:

```ts
import { loadRemotePlayerCharacter } from "./controllers/character/player-character.ts";

const remote = await loadRemotePlayerCharacter({ avatarUrl: p.avatarUrl });
scene.add(remote.scene);
const remoteAnims = new CharacterAnimations(remote.scene, remote.clips, {
  locomotionProfile: remote.locomotionProfile,
});
// on 'leave': remote.dispose()
```

Same rule as the local player, and the same one call: **in a game with its own
generated character, every remote wears it** — the game should look like the
game that was designed, and a mixed roster (one themed knight plus three stock
avatars) is the same incoherence as capsule-and-cone remotes. Only when this
game has NO generated character does each remote wear their own
`p.avatarUrl` VRM, which is then the right look. Several generated characters
(per class, per team, a picker) are fine when the player asks for them — the
rule is a coherent themed cast, not exactly one model. Name tags distinguish
players; their bodies don't have to.

The loader shares one parsed base across every remote (N remotes ≈ 1 body of
GPU memory) and `remote.dispose()` detaches the clone without touching those
shared resources. Move it with the interpolator from
`$genex-threejs-multiplayer`, and **never** create a rigid body, a
`CharacterController`, or any physics for it. Simulating remote players'
physics locally guarantees divergence — every client would compute a different
world. And a remote player's body is **never hand-built primitives** (no
capsule-plus-cone "person"). First-person games are not exempt — the local
player may be invisible to themselves (`setFirstPersonBody`), but every remote
is a full character on screen.

- **Publish `character.netState()`** on the fixed 10–20 Hz tick (never per frame):
  `room.me.set(character.netState())`. It bundles the network-safe position, a four-number
  quaternion, and the six animation booleans in one call. It uses `netPos`, **not** `currPos` —
  `currPos` is the raw physics capsule whose Y bobs on the float-suspension spring, so publishing
  it makes a *standing* remote player visibly bob up and down. `netState()` snaps the grounded Y to
  the settled height (raw while airborne, so jumps still arc). Never reduce rotation to a scalar yaw.
- On each remote, apply the SDK's **smoothed** copy with
  `applyNetState(remoteObject, players.get(id).state)` (sets position + rotation), and feed the same
  six booleans (`onGround`, `falling`, `moving`, `running`, `jumping`, `crouching`) to that remote's
  `CharacterAnimations` — see the animations reference. Never publish `currPos` directly.
- Only the owning client runs `MotionActionDriver`. Remotes play the same
  one-shot event while following smoothed owner-authored position/rotation;
  their animation mixer never moves them through the world.
- Load `$genex-threejs-multiplayer` before writing any networking code; it is
  mandatory for any 2+ player game.

## Placing rigs outside the controller — facing is explicit

The vendored controller owns the local player's facing. Any rig you place
YOURSELF — a duel opponent, an NPC, a fighter in a side-view game — obeys
three hard rules:

- **Meshy / Mixamo / VRM rigs rest facing +Z** — from a side camera that
  means straight at the lens. Set the yaw explicitly from the character's
  ROLE the moment you place it (`model.rotation.y = …`); never leave the
  rest pose and assume it reads right.
- **Never mirror a SkinnedMesh with negative scale.** `scale.x = -1` is a
  2D-sprite trick: on a 3D rig it flips triangle winding and normals
  (broken lighting and culling) and does NOT turn the character. Turning is
  always a yaw rotation.
- **Duel / side-view / two-character scenes: the combatants face EACH
  OTHER along the duel axis.** Two fighters staring into the camera is a
  bug, not a pose — verify it in the milestone smoke capture (an enemy in
  frame facing the player's CHARACTER, never the lens).

## If the user asks for ecctrl

ecctrl is a React / React Three Fiber component; a Genex game is plain
Three.js with no React, so the package cannot run here. Tell the user plainly:
*"the library you named requires React, and this game is plain Three.js —
Genex ships the same controller, ported for your setup."* This vendored
controller **is** ecctrl's floating-capsule controller translated to plain
TypeScript classes (same physics model, same tuning options, same feel; see
`src/controllers/NOTICE.md`). Run `npx genex controller character` and carry
on — never add React or install the React package to satisfy the request.

## Known benign warning

`@dimforge/rapier3d-compat` logs `using deprecated parameters for the
initialization function` once at boot. It comes from the library's own
embedded WASM loader, is harmless, and cannot be fixed from user code — do not
spend time chasing it.

## Vehicles

For a drivable car or flyable drone — and character ↔ vehicle enter/exit —
run `npx genex controller car` / `npx genex controller drone` and load the
`$genex-threejs-vehicle-controllers` skill. The character side of enter/exit is
already built in: `character.park()`, `character.unpark(position, rotation)`
and the `isParked` getter (skip `character.update()` while parked).
