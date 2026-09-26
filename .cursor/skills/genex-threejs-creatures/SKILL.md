---
name: genex-threejs-creatures
description: Build enemies and creatures that hold up in play — rigged Meshy bipeds via `npx genex creature` or static models with procedural motion, plus the mechanical floor every enemy owes the player regardless of rigging - a physics collider (no walking through bodies), verified facing, hit reactions, and a death moment. Load whenever the game has enemies, NPCs, or creatures.
---

# Genex Three.js · Creatures & Enemies

An enemy the player can walk through, that faces sideways, and that dies by
vanishing is the fastest way for a finished-looking game to feel broken. This
skill owns the enemy-quality floor: which generation lane each creature takes,
and the four mechanical rules that apply to ALL of them.

## Choose the lane per creature — by body shape

**Meshy rigs biped-shaped bodies only.** This is a measured platform limit
(live-tested 2026-07-23), and it starts at the MODEL stage: a prompt for a
four-legged stance comes back standing upright, and wings get no bones (they
skin to the spine/arms and move rigidly — a wing flap is impossible through
the rig). Route by silhouette:

- **Biped-shaped** (werewolf, orc, skeleton, gargoyle, zombie, knight — two
  legs, two arms, upright): the **rigged lane** below. Real skeleton, real
  library animations. This is the DEFAULT for every enemy that fits it.
- **Everything else** (true quadrupeds, serpents, swarms, fliers mid-flight,
  blobs): the **static + procedural lane** — `npx genex model` for the body,
  motion authored in code. Say it honestly in the Assets table:
  `hound: static + procedural — Meshy rigs bipeds only`. Never pretend a
  procedural creature is rigged.

## The rigged lane — `npx genex creature`

One shot, no approval ceremony (an enemy is production scenery, not the
player's identity piece — the themed PLAYER character keeps its review beat,
`$genex-ai-character`):

```bash
# 1. Find real clip ids first — never invent them:
npx genex animations search "zombie walk" --json
npx genex animations search "melee attack" --json
npx genex animations search "death backward" --json

# 2. One command: model → rig → bind those clips (enqueue and keep building):
npx genex creature "hulking bone seraph, tattered wing membranes, upright stance" \
  --animation <walk-id> --animation <attack-id> --animation <death-id> --no-wait
```

Each creature is one Assets-table row (visible spend — the usual budget
rules). The result is a rigged GLB whose clips play on a standard
`THREE.AnimationMixer`; Meshy limb rotations play unchanged — never apply
post-mixer limb corrections. Prompt the body UPRIGHT and unpropped (held
props fuse into bodies); prompt "facing the viewer" but never trust it —
facing is verified below.

When the catalog has no clip for a bespoke attack, telegraph, or death move on
a rigged biped, generate one for this creature:

```bash
npx genex creature animate <creature-id> "wind-up ground pound" --no-wait
npx genex creature animate <creature-id> --locomotion --lean --no-wait
```

Say what the body does, in beats, with the weight named — "rears back, both
arms overhead, slams down and sinks into a low crouch" beats "attack". The
clips land in the creature's own manifest and play through the raw mixer wired
below; `--lean` keeps movement to forward walk + run, which is all an enemy
following a path can ever play. See the motion section of `$genex-ai-character`
for what this can and cannot generate.

### State → clip wiring (one mixer per creature)

```ts
import * as THREE from "three";

interface CreatureRig {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<"walk" | "attack" | "hit" | "death", THREE.AnimationAction>;
  current?: THREE.AnimationAction;
}

function play(rig: CreatureRig, name: keyof CreatureRig["actions"], fade = 0.18): void {
  const next = rig.actions[name];
  if (rig.current === next) return;
  next.reset();
  if (name === "attack" || name === "hit" || name === "death") {
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true; // death holds its last frame
  }
  if (rig.current) next.crossFadeFrom(rig.current, fade, false);
  next.play();
  rig.current = next;
}
// drive from the enemy state machine: chase → play(rig, "walk");
// windup+strike → play(rig, "attack"); damaged → play(rig, "hit");
// hp <= 0 → play(rig, "death") and only AFTER the clip finishes, run the
// death VFX moment (embers/dissolve) — animation first, particles second.
// mixer.update(dt) every frame; one mixer per creature, clips cloned per
// instance (THREE.AnimationUtils / SkeletonUtils.clone for shared GLBs).
```

## The mechanical floor — ALL enemies, rigged or not

### 1. A collider — the player never walks through a body

An enemy that is only a `THREE.Group` is a ghost. Give every enemy a physics
presence. The recipe (Rapier, matching `$genex-threejs-physics-rapier` and
the bundled character controller):

```ts
import RAPIER from "@dimforge/rapier3d-compat";

/** One kinematic capsule per enemy: the CONTROLLER collides with it (no
 *  walk-through) but the enemy's own movement stays script-driven — AI code
 *  keeps teleport-free authority via setNextKinematicTranslation. */
function addEnemyCollider(world: RAPIER.World, e: { root: THREE.Object3D; halfHeight: number; radius: number }) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      e.root.position.x, e.root.position.y + e.halfHeight + e.radius, e.root.position.z,
    ),
  );
  world.createCollider(RAPIER.ColliderDesc.capsule(e.halfHeight, e.radius), body);
  return body;
}
// every frame AFTER the AI moves the root:
//   body.setNextKinematicTranslation({ x, y: y + halfHeight + radius, z });
// Size from the model's real bounding box (new THREE.Box3().setFromObject),
// not guessed numbers. Gameplay range tests (aggro, melee reach) keep using
// your own distance math — the collider exists so BODIES are solid.
```

If the game has no physics world at all, the minimal honest fallback is a
controller-side overlap resolve: each frame, push the player out of each
enemy's XZ radius (`if (dist < r) player.position.addScaledVector(away, r - dist)`).
Solid beats elegant.

### 2. Verified facing — walk in front of each enemy type once

Generated models are NOT reliably authored front-toward-+Z, and a
`lookAt`-driven enemy with a sideways-authored model walks sideways forever —
invisible from behind-the-player camera angles, glaring head-on. Two steps:

```ts
/** Wrap the GLB so +Z is the FORWARD your code can trust: rotate the child
 *  inside the wrapper until its face agrees, then aim only the wrapper. */
function wrapForward(model: THREE.Object3D, yawCorrection: number): THREE.Group {
  const wrapper = new THREE.Group();
  model.rotation.y = yawCorrection; // 0, ±Math.PI/2, or Math.PI — per MODEL, found by looking
  wrapper.add(model);
  return wrapper; // enemy code does wrapper.lookAt(...) / aims the wrapper only
}
```

The verification is human and takes ten seconds per enemy TYPE: stand in
front of it once — it must face you. This is part of the milestone smoke
pass once enemies exist (an enemy in frame, facing the player). Set the
`yawCorrection` constant per model and move on.

Two hard rules alongside it: **never mirror a rig with negative scale** —
`scale.x = -1` is a 2D-sprite trick that flips winding and normals on a
SkinnedMesh and does NOT turn a 3D body; turning is always a yaw
(`rotation.y`), set explicitly from the creature's role. And in any
**duel / side-view / two-character scene**, the combatants face EACH OTHER
along the duel axis — a fighter staring into the camera is a bug, not a
pose, and the smoke capture is where it gets caught.

### 3. Hit reaction — damage reads on the body

Rigged: the `hit` clip above. Procedural: a 100–150 ms flinch — scale pulse
(`1 → 0.92 → 1`), a brief emissive/color flash, and a small recoil along the
hit direction. Pair it with the HUD hit marker; a bullet that changes nothing
on the body reads as a miss even when the numbers moved.

### 4. A death moment — never blink out of existence

Rigged: play `death`, hold the final frame (~0.5 s), THEN dissolve/embers and
remove. Procedural: collapse (scale Y toward 0 with a topple rotation) into
the same dissolve. Either way the death VFX is a `$genex-threejs-procedural-vfx`
moment that EARNS its beat (the target dissolves and awards score) — one
pooled burst, not a particle bath.

## Procedural motion recipes (the static lane, done well)

Give an unrigged body three layered motions — enough life that "static +
procedural" is a real choice, not a downgrade: a **gait bob** (body
`position.y += sin(t * stride) * 0.05` with a slight roll for quadrupeds), a
**lunge stretch** (scale Z up 8% during attack windup, snap back on strike),
and an **idle sway** (low-amplitude yaw/pitch noise so nothing stands
morgue-still). Author them against the wrapper from rule 2 so facing math
stays clean. `$genex-threejs-procedural-animation` has the timeline tools for
anything staged.

## Multiplayer

Enemies are host-simulated shared objects (`$genex-threejs-multiplayer` —
the host owns `room.objects` for every enemy; remotes render interpolated
state). The collider rule applies on every client — bodies are solid locally
even when the HOST owns the movement; clip/state changes ride the shared
object's state field, never a per-frame broadcast.

## Troubleshooting

- **"Out of credits" (`insufficient_credits`)** — tell the user the facts the
  CLI printed (balance, cost, refill), continue with a procedural-placeholder
  enemy body, and mark the spot with
  `// TODO(genex): regenerate when credits refill`. Do not stop the session.
- **"Email not verified" (`email_verification_required`)** — hand over the
  verify link the CLI printed, wait, re-run.
- **The creature came back standing when you wanted four legs** — that is the
  documented platform limit, not a bad roll: re-rolling the prompt will not
  produce a rigged quadruped. Switch that creature to the static + procedural
  lane and say so in the Assets table.
- **Clips look wrong on the body** (arms clip the torso on a bulky model) —
  pick a different library action id (`animations search`); never patch limbs
  post-mixer.
- **Every instance animates in sync** — you shared one mixer or one clip
  instance; clone per creature (`SkeletonUtils.clone` + a fresh mixer each).
