# Character animations

`CharacterAnimations` turns the controller's live flags into crossfaded
`THREE.AnimationMixer` playback: core states, directional locomotion profiles,
alias-based clip binding, one-shots, and a procedural bob/lean fallback. The
default lane retargets UAL packs to VRM; the Meshy lane plays animation-only
clips only on the exact matching generated rig revision.

## The bundled assets + animation packs

`npx genex controller character` installs both lanes of the player's body — the
game's own generated character (the default) and the VRM avatar fallback:

- `public/assets/meshy-character.json` — written by
  `npx genex controller character --character <id>` once the game's character
  has been generated. Its presence is what `loadPlayerCharacter` routes on.
- `public/assets/avatar.vrm` — the FALLBACK body (the bundled CC0 default).
  Always present; always one path. At runtime the fallback lane loads the
  visiting player's own picked avatar instead (`user.avatarUrl` from the embed
  identity) — this file covers local dev and load failures.
- `public/assets/animation-library.glb` (~1.3 MB) — the 12-clip core
  (idle/walk/jog/sprint, the jump trio, crouch idle+move, hit, death, interact)
  on a shared Quaternius rig (provenance in `src/controllers/NOTICE.md`).
- `public/assets/anims/*.glb` — OPTIONAL per-clip packs installed by
  `npx genex controller anims <tags|clip names…>` from the 120-clip Quaternius
  Universal Animation Library Pro catalog (see the tag catalog below). Re-runs
  are additive; `--reset` starts over; a `manifest.json` alongside lists what's
  installed.

VRM helpers live in `src/controllers/character/vrm/`. Install three-vrm once:
`npm i @pixiv/three-vrm`.

`loadPlayerCharacter` loads the body and everything the game can play on it in
one call — the generated character's exact-rig clips, or the core library plus
installed packs retargeted onto the avatar's humanoid rig. All with
**relative** paths so the published game works under its subpath:

```ts
import { loadPlayerCharacter } from "./controllers/character/player-character.ts";
import { capsuleFromModel } from "./controllers/character/vrm/capsule-fit.ts";
import { CharacterController } from "./controllers/character/character-controller.ts";
import { CharacterAnimations } from "./controllers/character/character-animations.ts";
import { characterPresets } from "./controllers/character/presets.ts";
import { waitForPlayer } from "@genex-ai/embed-sdk";

// This game's own generated character when it has one; otherwise the playing
// user's own avatar (their profile pick; per-session for guests), with the
// baked file as the local-dev / failure fallback.
const { user } = await waitForPlayer();
const player = await loadPlayerCharacter({ avatarUrl: user.avatarUrl });

// capsuleFromModel derives the collider from the body's bounds — no manual
// per-model tuning even as heights and proportions vary between lanes.
const fit = capsuleFromModel(player.scene);
const character = new CharacterController(physics.world, camera, {
  ...characterPresets["default"].options,
  ...fit,
  position: { x: 0, y: 2, z: 0 },
});
character.root.add(player.scene);
player.scene.position.y = fit.modelOffsetY; // root = capsule CENTER; drop the model so feet touch the floor

const anims = new CharacterAnimations(player.scene, player.clips, {
  locomotionProfile: player.locomotionProfile, // undefined in the fallback lane — fine
});
```

(Advanced: to load a single GLB by hand, `retargetClips(vrm, gltf.scene,
gltf.animations)` from `vrm/vrm-retarget.ts` is what `loadCharacterClips` uses
internally — it auto-detects the source rig per file.)

Per render frame, **after** `physics.step(delta)`:

```ts
anims.update(character, delta); // the controller itself satisfies the snapshot type
player.update(delta);           // REQUIRED — ticks the humanoid rig + spring bones
```

`player.update(delta)` MUST run every frame, AFTER `anims.update`. In the
fallback (VRM) lane it applies the animated normalized pose onto the render
mesh and advances spring bones (hair, cloth); native generated rigs need no
such pass, so it costs nothing there. Call it unconditionally — that is what
lets the body change lanes without this loop changing.
`anims.update` takes the RAW render delta — pause/slow-motion go through
`anims.setPaused(true)` / `anims.setTimeScale(0.5)` (fade durations stretch with
the time scale so slow motion doesn't pop).

## Same-rig Meshy specialty lane

Use this lane when a game needs a custom generated humanoid or catalog depth
that the personal-VRM library does not cover: sports, dance, tactical actions,
prop interactions, or authored traversal. Load `$genex-ai-character`, search
first, then use the reviewed concept → high-detail preview → approved 10k
triangle-remesh flow before adding exact action IDs:

```bash
npx genex animations search "rifle reload" --json
npx genex character "stylized sci-fi courier, practical clothing"
npx genex character preview <concept-id> --candidate <1|2|3> --user-approved
npx genex character finalize <preview-id> --user-approved --approve-remesh 10000 --animation 466
npx genex character animate <character-id> --action <action-id>
npx genex controller character --character <character-id>
```

All three concepts and the selected high-detail model use a neutral A-pose.
The high-detail source is preserved in R2 and shown from front, back, left, and
right with its measured face count before the user is asked to approve the
separate 10,000-face triangle remesh. Only that remesh is rigged and animated.
Held, slung, or overlapping props can fuse into the body or hide limbs; warn
before generation and prefer separate gameplay props.

Search output exposes the numeric action ID, stable key, preview, loop mode,
motion policy, controller slots, gameplay requirements, review status, and
estimated cost. Use a returned ID; do not guess from a name. Search is free and
local. Character and animation generation print a Genex-credit quote before
enqueueing, and successful outputs are copied to permanent R2 URLs.

The install command writes `public/assets/meshy-character.json`. **There is
nothing to wire** — the boot block above already routes on that file, so the
next reload plays the generated character with its exact-rig clips and
locomotion profile, through the same physics controller and camera.

`loadMeshyCharacter` is the direct handle underneath, for the rare case that
needs the manifest itself (reading `rigSignature`, a second character in the
scene):

```ts
import { loadMeshyCharacter } from "./controllers/character/meshy/meshy-loader.ts";

const native = await loadMeshyCharacter("./assets/meshy-character.json");
// native.scene / native.clips / native.locomotionProfile / native.manifest
```

Never make it the player's boot path: that is the two-lane split
`loadPlayerCharacter` exists to remove.

During Meshy validation, record the action ID actually bound to every slot.
A public preview is not evidence when the game is playing a different clip or
a rig-basic fallback. Meshy limb rotations play unchanged. Never freeze hand
tracks or apply post-mixer arm, hand, leg, or foot corrections. Only horizontal
root or hip translation may be normalized for Rapier.

The loader rejects clips whose manifest skeleton signature differs from the
current model revision or whose tracks target missing bones. This is deliberate
same-rig playback, not runtime retargeting. After adding an action, rerun the
controller command to refresh the manifest; existing controller source remains
untouched unless `--force` is explicitly used.

### Directional locomotion and cadence

Meshy manifests can fill slots such as `idle.default`, `walk.forward`,
`walk.backward`, `walk.left`, `walk.right`, their diagonal variants, matching
run/crouch slots, transitions, and jump phases. Under `lockForward`, the state
machine quantizes controller-local input into eight directions with hysteresis;
under free-facing movement it uses forward locomotion. Playback cadence follows
controller move speed divided by each band's authored nominal speed, clamped to
the profile range, so ECCTRL remains authoritative while feet track velocity.

### Motion policies and authored root actions

Meshy results distinguish four policies:

- `controller-loop` — looping locomotion; ECCTRL supplies all translation.
- `anchored-action` — a one-shot that stays at the current controller pose.
- `planar-root-action` — a one-shot that may carry an extracted trajectory, but
  it remains disabled until real output is validated.
- `choreography` — a multi-actor or constrained sequence; game code owns the
  participants, anchors, props, and environment contract.

All installed GLBs stay horizontally in-place. A planar trajectory may request
movement only when its manifest entry says `rootMotionValidated: true`; current
Meshy manifests publish `false`, so these actions remain anchored. Once a real
canary validates extraction and synchronization, `MotionActionDriver` feeds the
trajectory into `CharacterController` immediately before
`character.update()`:

```ts
import { loadMotionTrajectory, MotionActionDriver } from "./controllers/character/motion-actions.ts";

const trajectory = await loadMotionTrajectory("./assets/anims/<trajectory-file>.json");
const motion = new MotionActionDriver(character, anims);
motion.play(trajectory);

physics.onBeforeStep(() => {
  character.setMovement(kb.getCharacterMovement());
  motion.update(physics.world.timestep);
  character.update();
});
```

Resolve the URL from `meshy-character.json`'s `trajectoryUrl` rather than
guessing it, and refuse it unless `rootMotionValidated` is true. Fulfill every
declared requirement (`prop`, `partner`, or `environment`) before starting an
action. Only the owning client runs the driver; remotes play the event while
following the owner's smoothed transform.

### Foot IK (optional)

`vrm/foot-ik.ts` plants feet on uneven ground (no skating/floating on steps and
slopes). It's **opt-in** — locomotion and combat work without it; enable it once
the avatar's animations look right, injecting a ground query backed by rapier:

```ts
import { FootIK } from "./controllers/character/vrm/foot-ik.ts";
const footIK = new FootIK(vrm, (foot) => {
  const hit = physics.world.castRay(
    new RAPIER.Ray({ x: foot.x, y: foot.y + 0.5, z: foot.z }, { x: 0, y: -1, z: 0 }),
    1.5, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    undefined, undefined, character.body); // exclude the character's own capsule
  return hit ? foot.y + 0.5 - hit.timeOfImpact : null;
}, {
  isActive: () => character.isOnGround,          // keep the jump pose while airborne
  allowReachDown: () => !anims.oneShotActive,    // REQUIRED with one-shots: they are
  // choreography — without this a firing stance over a step edge drags the pelvis
  // down into the staircase. While gated, feet are only lifted as much as needed
  // to stay out of the step under them (anti dig-in).
});
```

Foot IK is a VRM-lane feature (it poses a VRM's normalized bones), so it
applies only when the player is on the fallback body — check
`player.kind === "avatar"` before creating it.

ORDER IS LOAD-BEARING — foot IK poses the VRM's *normalized* bones, which the
VRM's own update then copies onto the render mesh. Run it BETWEEN the two
(after that copy it has no visible effect at all — the next frame's mixer tick
overwrites it before the copy):

```ts
anims.update(character, delta); // 1. mixer poses the normalized rig
footIK?.update(delta);          // 2. plant the feet on that pose (fallback lane only)
player.update(delta);           // 3. copy normalized -> render mesh + spring bones
```

## States and default clips

The pure resolver (`resolveAnimationState`) maps controller flags to one of:

| State | Bundled clip | Notes |
| --- | --- | --- |
| `IDLE` | `Idle_Loop` | starts playing immediately on construction |
| `WALK` | `Walk_Loop` | |
| `RUN` | `Jog_Fwd_Loop` | **the default run clip**; `Sprint_Loop` also binds via alias — force it with an override if the user wants an all-out sprint look |
| `CROUCH_IDLE` | `Crouch_Idle_Loop` | while `crouchActive`; degrades to `IDLE` on rigs without crouch clips |
| `CROUCH_MOVE` | `Crouch_Fwd_Loop` | crouched + moving; degrades to `WALK` |
| `JUMP_START` | `Jump_Start` | one-shot, played at 1.6× so it finishes inside the hop |
| `JUMP_IDLE` | `Jump_Loop` | airborne, moving up |
| `JUMP_FALL` | `Jump_Loop` | airborne, moving down (shares the clip — no restart mid-air) |
| `JUMP_LAND` | `Jump_Land` | one-shot |

## One-shot actions + the 120-clip pack catalog

The nine states above cover locomotion. **Every other clip** plays through
`anims.playOneShot(clipName, options?)`: it crossfades the clip over the current
motion, plays it once, then hands control back to the state machine. Returns
`false` if the clip name isn't in the set you passed to the constructor.

Punch-on-click is the controller default:

```ts
let jab = true;
addEventListener("pointerdown", () => {
  anims.playOneShot(jab ? "Punch_Jab" : "Punch_Cross");
  jab = !jab;
  // Raycast forward from the character; if it hits another player, YOUR game
  // decides the reaction — e.g. remoteAnims.playOneShot("Hit_Chest").
});
```

`options`: `fadeIn` (default 0.1 s), `timeScale`, `clamp` (hold the final pose —
for deaths), `interruptible` (grounded movement cancels the clip), `onDone`.

**Every one-shot is FULL-BODY** (there is no upper-body layering), so it freezes
the legs — a moving character SLIDES across the ground in a frozen pose for the
clip's whole length. Two rules keep that from ever being visible:

- **Reactions and gestures a player can walk out of get `interruptible: true`**
  (hit flinches, casts, taunts, celebrations). Movement intent releases the clip
  and locomotion takes over the same frame. A 2.9 s hit reaction without it
  locks the player's animation for 2.9 s *per hit taken*.
- **`clamp: true` holds the lock FOREVER by design** — nothing releases it
  automatically, not even the clip ending. Every clamped one-shot needs a
  guaranteed paired release: call `anims.clearOneShot()` on the transition out
  (respawn, revive, action aborted). Audit every early-return on the path
  between "clamped one-shot started" and "the replacing clip plays" — an abort
  branch that skips the replacement strands the pose and the character slides
  around locked until something else clears it.

`anims.clearOneShot()` cancels the active one-shot and crossfades locomotion
back in with no T-pose frame; it is safe to call when nothing is held. Call it
on TRANSITIONS only — per-frame calls cancel every in-flight reaction clip. To
cancel one SPECIFIC one-shot without clobbering whatever replaced it, check
`anims.currentOneShotName` first:

```ts
// abort a held charge wind-up, but never a death pose that replaced it:
if (anims.currentOneShotName === WINDUP_CLIP) anims.clearOneShot();
```

The 12 core clips are always available; everything else comes from
`npx genex controller anims <selectors…>` — selectors are **tags** (install a
themed set) or **exact clip names** (cherry-pick), freely mixed:

```bash
npx genex controller anims sword pistol         # tags: a sword + shooter game
npx genex controller anims stealth Celebration  # a tag + one exact clip
npx genex controller anims --list               # all tags with sizes
npx genex controller anims --list sword magic   # per-clip durations + descriptions
```

Tag catalog (tag → clips → reach for it when). Pick tags from the game's theme;
run `--list <tag>` for per-clip descriptions before wiring one-shots:

| Tag | Clips (≈size) | Use for |
| --- | --- | --- |
| `core` | Idle/Walk/Jog/Sprint loops, Jump trio, Crouch idle+fwd, Hit_Chest, Death01, Interact | already bundled — never needs installing |
| `locomotion-extra` | Jog strafe/diagonal/lean ×10, Turn90_L/R, Walk_Formal_Loop, Sprint_Enter/Exit (~1 MB) | 8-way strafe rigs, formal NPC gaits, sprint transitions |
| `stealth` | Crouch_Enter/Exit + crouched strafe/diagonal/backward ×9 (~0.6 MB) | stealth games (the built-in crouch only needs core; these add direction variety + transitions) |
| `crawl` | Crawl enter/exit/idle + 4 directions (~0.5 MB) | prone crawling, vents, tunnels |
| `climb` | Climb enter/exit/idle, up/down/left/right, ClimbLedge (~0.6 MB) | ladders, walls, parkour |
| `parkour` | BackFlip, Roll, Dodge_Left/Right (~0.3 MB) | dodges and flips |
| `brawl` | Punch_Jab/Cross, Kick, PunchKick_Enter/Exit (~0.35 MB) | fist fighting |
| `sword` | Sword_Enter/Exit/Idle/Attack/Attack_Standing (~0.35 MB) | melee weapons |
| `pistol` | Pistol_Idle_Loop, Aim_Up/Neutral/Down (pick by camera pitch), Shoot, Reload (~0.3 MB) | shooters |
| `magic` | Spell_Simple + Spell_Double enter/exit/idle/shoot cycles (~0.5 MB) | casters — Double's shoot is a channel/beam loop |
| `damage` | Hit_Head/Shoulder_L/R/Stomach, Death02 (~0.3 MB) | directional hit reactions beyond the core pair |
| `swim` | Swim_Idle_Loop, Swim_Fwd_Loop (~0.15 MB) | water |
| `sit` | Sitting enter/exit + 5 idles, GroundSit set (~0.7 MB) | seats, campfires, dialogue |
| `emote` | Celebration, Crying, Dance_Loop, Drink, talking/tired/look-around idles, Rock/Paper/Scissors (~0.7 MB) | emotes, NPCs, minigames |
| `interact` | PickUp_Kneeling/Table, Fixing_Kneeling, Push enter/exit/loop (~0.4 MB) | pickups, levers, crafting, pushing |
| `shop` | Counter enter/exit/idle/give/show/angry (~0.4 MB) | shopkeeper NPCs |
| `drive` | Driving_Loop (~0.05 MB) | vehicles (see `$genex-threejs-vehicle-controllers`) |

For legacy-library looping poses that should **persist** (aiming, sitting,
swimming) rather than
play once, drive them through the public `anims.mixer` escape hatch instead; the
`$genex-threejs-vehicle-controllers` skill shows the seated pattern. UAL clips
are in-place. Meshy planar actions remain anchored until their manifest
explicitly validates the extracted trajectory; in every case the physics
controller owns world translation.

## Binding arbitrary clip names on a compatible rig

`buildClipMap(clips, overrides?)` resolves each state in priority order:
explicit override (exact, then case-insensitive) → library exact names →
case-insensitive → each alias as a case-insensitive **substring**, shortest
matching clip name wins (so `Walk_Loop` beats `Walk_Bwd_Loop`, and `walking`
beats `walking_backwards`). Aliases include `idle`, `walk`, `run`,
`jog`, `sprint`, `crouch_idle`, `sneak`, `jump_start`, `takeoff`, `fall`,
`land`, and a bare `jump` catch-all so a rig whose only airborne clip is
"Jumping" still binds all four jump states. Unbound loop states chain
(RUN↔WALK, JUMP_IDLE↔JUMP_FALL, CROUCH_IDLE→IDLE, CROUCH_MOVE→WALK — rigs
without crouch clips sneak in a standing pose instead of T-posing); unbound
one-shots stay silent so the previous loop keeps playing.

This resolves names; it does **not** make incompatible skeletons compatible.
Only pass clips already retargeted to the VRM or authored for the exact Meshy
rig revision. If a compatible clip name refuses to bind, pass overrides:

```ts
const anims = new CharacterAnimations(model, gltf.animations, {
  clipMap: { RUN: "Sprint_Loop", JUMP_START: "MyTakeoff" },
  onChange: (state) => { if (state === "JUMP_LAND") playLandSfx(); },
});
console.log(anims.clipMap); // inspect what actually bound, per state
```

### Rig mismatch guard

Clips whose tracks target bones the model doesn't have spam PropertyBinding
warnings. When mixing a custom model (e.g. from `$genex-ai-model` — note
generated props are usually rig-less) with the bundled library, filter first:

```ts
const clips = libGltf.animations.filter((clip) =>
  clip.tracks.every((track) => {
    const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
    return nodeName !== undefined && model.getObjectByName(nodeName) !== undefined;
  })
);
```

## Rig-less models: the procedural fallback

Pass an empty clip array (or clips that bind nothing) and the default
`fallback: "auto"` mode drives the model with a procedural walk/run bob, a
forward lean while moving, an air lean, and a landing dip — additive over the
model's transform at construction time, so any capsule, robot, or generated
prop reads as alive with zero animation work. `fallback: "procedural"` forces
it even when clips exist; `"none"` leaves the model static. Check
`anims.usingProceduralFallback` to see which path is live.

```ts
const anims = new CharacterAnimations(placeholderMesh, []); // procedural fallback kicks in
```

## Remote players (multiplayer)

The snapshot type is structural — **anything** with the six booleans works,
which is exactly what remote players need. Remote players have no physics and
no `CharacterController` (see the SKILL's multiplayer rule): sync the six
flags from the owner and feed them straight in.

```ts
// Sender (local player), on the 10-20 Hz tick — alongside position/yaw:
const flags = {
  isOnGround: character.isOnGround,
  isFalling: character.isFalling,
  isMoving: character.isMoving,
  runActive: character.runActive,
  jumpActive: character.jumpActive,
  crouchActive: character.crouchActive,
};

// Receiver: one CharacterAnimations per remote model, fed the synced flags.
remoteAnims.update(remoteState.flags, delta);
```

`crouchActive` is additive: an older game syncing only five flags still
resolves correctly (a missing flag reads as not-crouched).

The mixer crossfades exactly as it does locally, so remote players animate
correctly without simulating anything. Build every remote's body with
`loadRemotePlayerCharacter({ avatarUrl: p.avatarUrl })` — the same routing the
local player gets, so in a game with a generated character everyone wears it,
and only a game without one falls back to per-player avatars (`p.avatarUrl` is
the multiplayer SDK's verified per-player field; empty means fall back). It
clones a shared parsed base, so N remotes cost about one body of GPU memory;
call `remote.dispose()` on leave. Relay one-shot events (punch,
hit, validated planar-action start) alongside the flags and call the matching
`remoteAnims.playOneShot(...)` on receipt. Never run `MotionActionDriver` for a
remote: its smoothed owner-authored transform is the sole movement authority.
Full networking patterns: `$genex-threejs-multiplayer`.

## Gotchas

- Call `anims.update` once per render frame, never inside
  `physics.onBeforeStep`.
- The state machine reads **input-based** `isMoving` — a character shoved by
  physics while the player is idle stays in IDLE by design (matches the feel
  players expect).
- One-shots lock transitions until they finish (`JUMP_START` → the lock
  releases into `JUMP_IDLE`); this is internal — don't try to manage it.
- `dispose()` stops all actions and releases the mixer listener; call it when
  the character leaves the scene.
