---
name: genex-threejs-game-feel
description: Make a Genex Three.js game feel alive — instant input response, acceleration curves, camera follow and impact shake, layered hit feedback, hitstop, readable cooldowns, difficulty ramp, and a fast fail/retry loop. Use when a game technically works but feels flat, floaty, or boring, and before calling any playable loop done.
---

# Genex Three.js Game Feel

"Works" and "feels good" are different finish lines. This skill is the second
one: the tuning pass that turns a functioning loop into a game people replay.
Run it once the mechanics exist — feel tuning before mechanics is polish on
nothing.

## The loop test (run this first)

A playable loop has four parts. If any is missing, fix that before tuning:

1. **Verb** — something the player does (move, jump, shoot, grab).
2. **Objective** — something to chase (score, survive, reach, beat).
3. **Feedback** — success and damage are unmistakable the moment they happen.
4. **Fail / retry** — the game can be lost, and restarting is instant.

A game that can't be lost — or takes more than a second to retry — gets boring
no matter how good it looks.

## Input: respond this frame

- Act on input the **same frame** it arrives. Animation follows the action; it
  never gates it (the character moves now, the run cycle catches up).
- Add forgiveness windows: buffer a jump pressed ~100 ms early, allow a jump
  ~100 ms after walking off a ledge. Players read forgiveness as "tight
  controls", not as cheating. (The bundled `CharacterController` ships with
  NO input buffer or coyote time — add these in `character-controller.ts`
  itself, or apply them only to hand-rolled movement.)
- If an action can't fire (cooldown, no ammo), say so instantly — a click, a
  dimmed icon — silence reads as broken input.
- Camera-aimed shooting wants **pointer lock** — firing at a reticle with an
  unlocked drag-to-turn camera feels imprecise no matter how tight the numbers
  are. The bucket rule + the bundled `FollowCamera` aim mode live in
  `$genex-threejs-camera-direction`; on the bundled controller it's ON by default
  (with a ready-made cue), not hand-rolled events. Direction is half of it: a
  movement key or look axis whose on-screen direction contradicts its label is a
  defect, not a tuning issue — the screen-direction contract and verified bases
  are in `$genex-threejs-camera-direction`.

## Movement: snappy beats realistic

- Reach max speed fast; stop even faster (deceleration stronger than
  acceleration). Long ease-in reads as "floaty" — the most common complaint.
- Tune with live numbers, not rebuilds: keep the constants (accel, decel, max
  speed, jump impulse) in one place and tweak while replaying the same ten
  seconds.
- On-foot and vehicle movement ship pre-tuned in
  `$genex-threejs-character-controller` and
  `$genex-threejs-vehicle-controllers` — retune their exposed knobs before
  writing new movement math.

## Camera: the invisible half of feel

- Smooth follow with **lookahead** — bias the camera toward where the player
  is going, never behind the action hiding the next decision.
- FOV kick on speed/boost (a few degrees, eased) sells acceleration better
  than particles.
- Impact shake: short (< 0.2 s), small, decaying, and always **caused** —
  shake per event, never ambient. Rigs and handoffs live in
  `$genex-threejs-camera-direction`.
- Feel work (shake, FOV kick, hitstop triggers) runs in the **render phase,
  after `physics.step(...)`** — never inside `onBeforeStep` (that's fixed-step
  physics territory; see the physics skill's ordering contract).

## Impact: layer the feedback

Every meaningful event the player caused should be **seen and heard**. For big
hits, layer two or three of:

- a flash or scale pop on the thing that was hit;
- a particle burst — `$genex-threejs-procedural-vfx`;
- a sound — generate real ones with `npx genex sfx` (`$genex-ai-sfx`);
- **hitstop**: freeze the simulation 30–80 ms on heavy impacts (skip rendering
  pauses — just hold the physics/game clock). Longer than ~100 ms feels like lag.
  With the bundled physics pack this is built in — `physics.paused = true` /
  `physics.timeScale = 0.2` (see the physics skill's pause/slow-mo section) plus
  `anims.setPaused(true)` / `anims.setTimeScale(0.2)` for the character's
  animations. Don't hand-roll a second clock. **In multiplayer, hitstop is local
  presentation feedback:** never pause the network pump, reconnect/quorum timers,
  remote interpolation, or another player's/host's simulation. Slow/freeze only
  your locally owned gameplay clock and visuals; the authoritative hit is still
  deduped and applied once through the multiplayer skill's normal event path.

One layer per small event, three for the biggest — uniform intensity flattens
everything back out.

## Pacing and fail/retry

- Show cooldowns and charges visibly (a refilling ring beats a hidden timer).
- Ramp difficulty measurably (speed, spawn rate, tighter windows) so the
  player feels progress; reward near-misses where the design allows.
- Death should teach: show what killed you, keep the score/best visible, and
  restart on ONE key without a page reload. The faster the retry, the more
  "one more try" the game becomes.

## Failure modes to catch

- A mechanic fires with zero feedback — it might as well not have happened.
- The camera hides what the player needs to react to next.
- The game cannot be lost, or losing dumps you to a dead screen.
- Restart requires reloading the page (kills the retry loop — and reloads
  re-run auth and asset loading).
- Shake/flash spam with no cause — feedback inflation reads as noise.
- Multiplayer hitstop pauses networking or host simulation, turning impact feedback
  into packet bursts, quorum lag, or a freeze for players who were not hit.
- Feel constants scattered through the code where nobody dares touch them.
