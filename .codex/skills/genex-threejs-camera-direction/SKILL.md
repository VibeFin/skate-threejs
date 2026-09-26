---
name: genex-threejs-camera-direction
description: Design advanced Three.js camera systems for Genex browser games. Use for chase cameras, orbit cameras, side cameras, authored shots, pointer-look controls, scale-aware offsets, collision constraints, camera handoffs, projection ownership, large-world precision, and lifecycle cleanup.
---

# Genex Three.js Camera Direction

**Boundary:** the pack's default third-person camera is the bundled
`FollowCamera` (see `$genex-threejs-character-controller` — the vehicle
controllers hand off to it too). Extend and tune that first; load this skill
for rigs beyond it — top-down/side views, authored shots, cinematics, pointer
look, and camera handoffs.

Treat the camera as an authored visual system, not a passive viewport. Compose
the subject, establish scale, choose a stable up frame, and make every mode
handoff explicit.

## Build order

1. Define the design frame: subject size, screen occupancy, lens, near/far,
   motion, and horizon/up convention.
2. Build camera targets in semantic frames: ship, body surface, docking axis,
   or scene-authored shot.
3. Derive position and orientation independently, then combine them once.
4. Add input orbit/look only inside declared yaw/pitch and spatial constraints.
5. Add frame-rate-independent follow or a bounded spring where the reference
   uses inertia.
6. Snapshot and restore camera projection/state when a scene owns it.
7. Test mode transitions, cuts, pointer-lock reacquisition, resize, and large
   coordinates.

Read [references/camera-rigs.md](references/camera-rigs.md)
for exact chase/side/orbit rigs, projection values, transition
rules, floating-origin shot, pointer controls, and implementation limits.

## Aiming and pointer lock

The rule is binary: during play, **the cursor is either a gameplay tool or it is
locked away**. An OS arrow parked over the action in a game that never uses it is
a shipped defect, not a default. On the bundled `FollowCamera`, pointer-lock aim
is ON by default on desktop — a click locks the pointer and raw mouse movement
drives the view — so mostly you decide whether to turn it OFF. Name the bucket in
the build plan:

- **MANDATORY** — first-person of any kind (FPS, walking sim, horror) and any
  mouse-aimed action (third-person shooter, turret/range). Lock is on by default;
  leave it on. Shipping this unlocked is a defect, not a style choice — validation
  fails it. For first-person on the bundled controller, use the REAL mode —
  `firstPerson: true` on `FollowCamera` (eye-height target, no zoom, no
  collision pullback) + `setFirstPersonBody()` to hide the local body while
  keeping its shadow — never a pinned tiny follow distance.
- **HIGHLY RECOMMENDED** — third-person free-camera action/adventure (the default
  `genex controller character` game). On by default; leave it on. Opt out with
  `pointerLockAim: false` only for a stated reason (a cursor-heavy UI at the core
  of play).
- **Keyboard-driven games lock too** — a racer, platformer, or runner that never
  reads the mouse still locks the pointer on the play/Start click: the cursor is
  not a tool there, so lock it away (hidden cursor, no stray clicks, Esc = pause
  as usual). Bundled-controller games get this for free; a hand-rolled game uses
  the minimal lock recipe in `$genex-threejs-game-ui` (~6 lines).
- **NEVER** — cursor-core games where the pointer IS the gameplay tool (top-down
  click-to-move, tower defense, builders, card/board/puzzle) and spectator/orbit
  showcases. These **must pass `pointerLockAim: false`** — otherwise the bundled
  camera grabs the cursor on the first click. (Touch needs nothing: pointer lock
  doesn't exist there and the mode no-ops on coarse pointers.)

**Mechanism — games on the bundled controller (most games):** do NOT hand-roll
lock handling. Aim is already enabled; the kit ships a ready-made cue overlay —
wire `createAimCue()` (from `aim-cue.ts`, installed by `genex controller
character`) to `onAimChange` and you get the reticle + "click to aim" cue for free:

    import { createAimCue } from "./controllers/character/aim-cue.ts";

    const cue = createAimCue(); // reticle when locked, "Click to aim — Esc pauses" when not
    const followCam = new FollowCamera(camera, {
      domElement: renderer.domElement,
      onAimChange: cue.onAimChange,
    });
    followCam.setPaused(getPhase() !== "playing"); // park aim if the game boots on a menu/loader

Cursor-core game? Pass `pointerLockAim: false` instead and skip the cue. Want a
custom HUD? Read `onAimChange` yourself — `{ state }` is one of `locked` /
`unlocked` / `unavailable` / `paused` / `off` (the `needs-gesture` re-emit repeats
`unlocked`, so treat states idempotently).

Yaw/pitch re-sync on lock acquire is built in (aim shares the orbit state — the
view never snaps). First-person is the same mode plus three lines: pin the zoom
(`minDistance`/`maxDistance` ≈ 0.1), feed an eye-height target to `moveTo`, and
hide the avatar model. Pair aim with `controller.setLockForward(true)` so the
body faces where the camera looks. Pointer lock needs no setup on Genex —
standalone the game is the top-level page, and the platform's game frame already
grants the permission.

**Custom rigs only** (no bundled controller): build the pointer-look pattern in
[references/camera-rigs.md](references/camera-rigs.md) — the same contract applies.

**The aim contract (lock lifecycle — non-negotiable):**

1. Two states only: locked = playing, unlocked = menu/paused. "Unlocked but
   gameplay continues" is the imprecise-aim defect in disguise.
2. Opening any menu — the BOOT/main menu included — parks aim: exit the lock
   (`followCam.setPaused(true)`), cursor returns, gameplay input pauses. Menu
   keys are Tab/I/E — never Esc. The one true wiring is the phase binding
   `followCam.setPaused(phase !== "playing")` applied on phase transitions,
   never per frame: an unguarded per-frame resume once re-requested the lock
   every frame, and any menu click's ~5s of transient activation then locked
   the pointer over the open menu.
3. Closing a menu re-locks INSIDE the close click/keypress handler
   (`followCam.setPaused(false)` — the phase binding's `setPhase("playing")`
   in the Play/Resume click does exactly this) — the browser requires a user
   gesture, so menus close by click/keypress, never by timeout.
4. Esc is the browser's release valve (you can't intercept it; Chrome enforces
   a re-lock cooldown) → treat Esc as pause: show the overlay with a
   "click to resume" button.
5. Always-visible state: reticle while locked; real cursor + "click to
   aim/resume" cue while unlocked. The cue is also the validation hook.
6. If the lock request is rejected (a third-party page embedding the game
   without `allow="pointer-lock"`), the mode falls back to drag-orbit — show
   "Drag to look" instead. Never a dead game.
7. Gate firing/actions on `followCam.aimState === "locked"` — the click that
   acquires the lock (and any drag in the fallback) must not also shoot.
8. Do NOT exit the lock between rounds, respawns, or cutscenes — only for real
   menus (`setPaused`). A lock you never released needs no gesture to keep.
9. A re-lock that can't run without a fresh gesture (a resume outside a click, or
   Chrome's post-Esc cooldown) fires `onAimChange` with reason `needs-gesture` and
   keeps the "click to aim" cue up; the next click or keypress re-locks. Never
   retry on a timer.
10. The bundled camera OWNS the lock: never call `document.exitPointerLock()` or
    `canvas.requestPointerLock()` yourself alongside it — raw calls desync
    `aimState` and the cue. Everything routes through `setPaused` (which is
    idempotent — a same-value call is a no-op).

**Not an OS setting:** pointer `movementX/movementY` is never inverted by the OS
(trackpad "natural scrolling" only flips the wheel). If look feels inverted it's a
sign bug in the rig, not a device quirk — fix the sign, don't sniff the trackpad.

## The screen-direction contract

Every input axis has one correct on-screen direction, for every rig, bundled or
hand-rolled. These four invariants are testable and non-negotiable:

1. Mouse/touchpad RIGHT turns the view right; mouse UP looks up (down only behind
   an explicit invert option the player chose).
2. `KeyD`/ArrowRight moves or turns the player toward screen-RIGHT; `KeyA`/
   ArrowLeft toward screen-left. Same for a touch stick's +x.
3. Drag-pan picks ONE convention — grab-the-world (terrain follows the pointer)
   or move-the-camera — and BOTH axes obey it. One axis each is the
   "diagonals feel twisted" bug.
4. See the OS-setting note above: inversion is always your sign, never the device.

The formula that settles every sign argument: `screenRight = cross(cameraForward, worldUp)`.
For a Y-up world and forward `(sin yaw, 0, cos yaw)`, screen-right is
`(-cos yaw, 0, sin yaw)`. **Warning — `(cos yaw, 0, -sin yaw)` is the LEFT
vector** (that's `cross(worldUp, cameraForward)`), and writing it as "right" is
the single most-shipped direction bug in generated games: two independent
projects inverted their A/D exactly this way. Related trap: positive
`rotation.y` turns a +Z-facing object toward +X, which is screen-LEFT from a
chase camera behind it — so "positive yaw = turn right" is false in this basis.

Never derive signs by intuition — intuition about right-handed frames is wrong
about half the time and has been wrong in every shipped instance. Copy a
verified pair (sign AND basis together) from
[references/camera-rigs.md](references/camera-rigs.md), then confirm with the
input-direction part of the smoke check: hold D and watch which way the world
answers.

## Non-negotiable rules

- Use subject dimensions to derive offsets; do not tune one fixed distance for
  differently scaled assets.
- For planetary motion, derive up from the dominant body rather than global Y.
- Interpolate position with `lerp` and orientation with `slerp`.
- During an explicit handoff, use one interpolation stage. Do not stack a
  transition blend and a second follow smoother over the same interval.
- Re-sync yaw/pitch from the camera when pointer lock is acquired.
- Hand-rolled steering/pan/look math copies a verified basis from the reference
  and passes the input-direction check — signs are never derived by intuition.
- Update the projection matrix whenever FOV, near, far, or aspect changes.
- Keep stars or infinite backgrounds camera-relative when large translation
  would create false parallax or precision loss.
- Restore camera and input ownership on scene disposal.

## Routing boundary

Use `$genex-threejs-procedural-animation` for object motion timelines, springs,
docking, staging, and debris. This skill owns how the scene is viewed and how
camera modes hand off.
