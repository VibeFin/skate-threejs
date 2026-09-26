# Routing Map

This map assigns the player's **current request** to its owning Genex lanes.
A clear focused request starts there; it never inherits unrelated steps from a
full-game workflow.

## Three.js version and references

For new Genex browser-game projects, use the current stable Three.js release
(what `npm i three` installs) and keep the project on the version actually
installed—match all docs and examples to it.

For existing projects, inspect and respect the installed Three.js version
unless the player asks to upgrade. Use official Three.js docs first, then
official examples. Match examples to the installed release and do not blindly
copy demo architecture.

## Route by request shape

- **Clear latest request:** load the owning rows below and start.
- **Focused existing work:** read `DESIGN.md` and the touched code, update
  `Now:`, preserve unrelated commitments, and do not replay discovery.
- **Broad new game:** only when unresolved, ask whole coordinated build versus
  one request-relevant part first. If the player already answered, proceed.
- **Blank/unclear:** ask whether this is a game, tool/component, or existing
  work. Do not propose a concept.
- **Generated GLB versus editable code:** for an ambiguous “make this image
  3D,” ask one plain question: normal generated GLB, or editable parameterized
  Three.js code? Explicit `GLB`, `procedural`, `parametric`, `code-built`, or
  `variations` language chooses directly.

## Route by system

| Work needed | Load |
| --- | --- |
| shot composition, chase/side/orbit rigs, camera handoffs, projection ownership, pointer look, mouse-aimed action, mouse-look, the screen-direction contract for hand-rolled steering/pan/look input signs, floating origins | `$genex-threejs-camera-direction` |
| on-foot player movement: walk/run/jump/crouch, third-person character, slopes, stairs, moving platforms, the player's body loader, directional locomotion, transitions, action motion | `$genex-threejs-character-controller` |
| the game's own generated character—the player's body wherever a human body appears—or Meshy animation coverage beyond the stock pack: reference-informed A-pose concepts, exact action IDs, same-rig adapter | `$genex-ai-character` + `$genex-threejs-character-controller` |
| a character/enemy needs motion the catalog lacks—a signature move, boss telegraph, death, full 8-way set, or the player's footage; free plan before spend | `$genex-ai-character` motion section + `references/motion-generation.md` |
| remote player bodies in multiplayer—never hand-built primitives: the game's generated character when it has one, otherwise the player's `p.avatarUrl` VRM | `$genex-threejs-multiplayer` + `$genex-threejs-character-controller` |
| enemies, NPCs, or creatures: rigged bipeds via `npx genex creature`; static plus procedural motion for other body shapes; collider, facing, hit reaction, death | `$genex-threejs-creatures` |
| cars, drones, vehicle physics, gearbox, character↔vehicle enter/exit | `$genex-threejs-vehicle-controllers` |
| playable on phones: joystick, virtual buttons, drag zones, genre touch recipes, rotate-device overlay | `$genex-threejs-touch-controls` |
| phone-survivable rendering: device tiers, DPR/shadow/post budgets, runtime governor, generated-asset rungs, Quality picker, dispose-on-swap | `$genex-threejs-adaptive-quality` |
| anything falls, collides, gets pushed, or needs colliders/events | `$genex-threejs-physics-rapier` |
| launch/docking timelines, authored transform phases, springs, convergence, deterministic prop/debris motion | `$genex-threejs-procedural-animation` |
| rebuild a reference prop, hard-surface object, modular decoration, or simple environment piece as editable parameterized Three.js code | `$genex-threejs-procedural-assets` |
| procedural/PBR material boundary, authored frame PBR, and the retained material craft | `$genex-threejs-procedural-materials` |
| particles, trails, plasma, shockwaves, pooled bursts, and event effects | `$genex-threejs-procedural-vfx` |
| stable large-world shadows, cascades, clipmaps, cached updates | `$genex-threejs-shadow-systems` |
| eye adaptation, tone mapping, output color, LUT grading, and proven static grain | `$genex-threejs-exposure-color-grading` |
| fixed-view screenshots, input direction, facing, temporal and budget evidence | `$genex-threejs-visual-validation` |
| a static generated GLB for a concrete prop, vehicle, building, or non-rigged object | `$genex-ai-model` |
| generated surface or terrain texture with real-world UV scale | `$genex-ai-texture` |
| environment-only 360° sky | `$genex-ai-skybox` |
| poster, sign, sprite, decal, reference sheet, or other 2D art | `$genex-ai-image` |
| in-world motion art or another requested video | `$genex-ai-video` |
| sound effect, one looping music bed, or a short spoken line | `$genex-ai-sfx`, `$genex-ai-music`, or `$genex-ai-voice` |
| requested UI/HUD/menu/interface work, a visible UI problem, or an interface you decided this game wants built with generated art | `$genex-threejs-game-ui` |
| cinematic menu/title/pause/victory/defeat/lobby/credits video treatment | `$genex-ai-menu` |
| drawn HUD chrome the game's style wants—one element or a matched set of frames, masks, and icons | `$genex-ai-hud` |
| the game works but feels flat, floaty, or unresponsive: input response, camera, impacts, cooldowns, difficulty, fail/retry | `$genex-threejs-game-feel` |
| realtime multiplayer: movement sync, shared ball/NPC, host-run scores/enemies, shots/emotes, persistence | `$genex-threejs-multiplayer` |
| player identity, sign-in, guests, saves/progress, per-player state, shared persistent world, leaderboards—mandatory for every game | `$genex-threejs-embed-auth` |

## Request-sized execution

### Focused work

Load only the owning row or rows, preserve the current architecture, implement
the requested result, and run its relevant check. UI work routes directly to
UI; movement routes directly to movement; publishing routes directly to the
existing publish flow. Do not add a concept, unrelated asset batch, full-game
module plan, or critic loop.

### Step by step

Make the selected part `Now:` and preserve the final requested destination plus
other unfinished promises under Open commitments. A small playable slice is a
milestone, never silent permission to replace the destination.

### Whole coordinated build

Choose milestones and workstreams from the actual request. Independent streams
may run in parallel; dependencies remain serial. The stable game foundations
still route to their protected owners:

1. `$genex-threejs-embed-auth` before boot code:
   `initEmbed(...)` plus the correct `waitForPlayer()` gate.
2. `$genex-threejs-adaptive-quality` at boot: device tier, capped pixel ratio,
   runtime governor, and generated-asset rung loaders.
3. `$genex-threejs-touch-controls` when a mobile recipe fits.
4. `$genex-threejs-multiplayer` before any networking code whenever 2+ players
   share a world.

Then build the requested gameplay and content in dependency order. Schedule
UI/HUD/menu at an appropriate later milestone only when the requested complete
outcome includes them. There is no startup game/UI concept gate.

## Content and world promises without cookbook machinery

For a broad/full-game content-shaped request, record only promises actually
present in the request or essential to the stated genre. Make each promise
countable or otherwise observable before choosing the paid asset batch.

- A clear detailed request becomes commitments and starts; it does not trigger
  a fixed questionnaire.
- Step-by-step changes `Now:`, not the requested destination.
- Never lower a final content target silently. Ask one scope question only
  when a real reduction needs the player's decision.
- A focused request updates only its touched item; unrelated commitments stay
  as memory, not blockers.
- A requested large/open world records request-derived scale, terrain/ground,
  boundaries, and locations. Never silently reinterpret it as one small flat
  plane hidden by fog, and never impose fixed kilometer, chunk, biome, or POI
  defaults.
- Generated assets support commitments; asset availability does not decide
  how much game the player receives.

Open commitments prevent a false “the full requested game is complete” claim.
They do not block an explicit preview or publish request: run the protected
flow and state what remains.

## Reference-driven procedural assets

Use `$genex-threejs-procedural-assets` only for explicitly requested editable,
parameterized code-built objects or simple environment pieces. Do not trigger
it merely because an image exists, and never use it for player bodies, rigged
characters/creatures, or animation.

- Prefer a supplied reference. A private attachment stays local unless the
  player explicitly permits upload, publication, or commit.
- If a reference is part of the requested work but absent, use the existing
  `npx genex image` lane unchanged. Record that paid image as a normal Assets
  row, separate from the code-built object.
- Its output is a local TypeScript factory returning `THREE.Group`, with named
  parts and intentional parameters/seed. Add pivots, sockets, collider
  metadata, or destruction groups only when gameplay needs them.
- Compare one reference-matched view and one off-axis/in-game-scale view.
  Correct meaningful mismatches and stop at the requested fidelity.
- Consume the game's existing renderer, camera, lighting, post, physics,
  adaptive-quality, and animation authority. Never create competing systems.

Use the local status flow exactly:

`proposed → planned → building (blockout | detail | material | runtime) →
landed (<local TypeScript path>) → wired`

## Protected lane handoffs

### UI, HUD, menu, and FAL

Enter this lane for a direct UI/HUD/menu request, a relevant visible UI
problem, or an interface you decided this game's style wants built with
generated art. Generated UI art is opt-in: a restrained CSS interface is a
finished HUD, and generating one element—a frame, a mask, an icon, a wordmark,
a menu backdrop, a menu video—is a normal use of the lane. Once invoked,
`$genex-threejs-game-ui`, `$genex-ai-hud`, `$genex-ai-menu`,
`$genex-ai-image`, and `$genex-ai-video` retain their existing Stage-1/Stage-2
prompts, FAL calls, credits/checkpoints, retries, extraction, masks, wiring,
markers, nudges, preflights, and approval behavior—the scope is your call, the
execution quality is theirs. While a sprite or menu-video pipeline is in
flight, keep `HUD lane:`, `Menu video:`, and every HUD pipeline stage ID/path
current in `DESIGN.md` so a compaction can resume it.

The absence of generated HUD/menu/concept art alone never interrupts unrelated
focused work.

### Character, creature, and animation

The character lane retains its full approval chain. Inspect any user-named
references, generate exactly three neutral-A-pose concepts, and do not start
Image-to-3D before the applicable candidate decision. Preserve and show the
high-detail pre-rig model from four sides with measured face count; the
separate approved 10,000-face triangle remesh is what gets rigged and
animated. Never freeze/correct Meshy limb rotations; only horizontal root/hip
translation may be normalized for Rapier.

Search the catalog first. A missing verb uses
`genex character animate <id> "<verb>"` or the creature equivalent, with the
existing free motion plan before paid work, route selection, source/clip
validation, locomotion bindings, manifests, controller authority, and runtime
playback unchanged. `$genex-threejs-procedural-animation` remains the
non-biped/prop-motion fallback.

### Optimization and mobile

`$genex-threejs-adaptive-quality` and `$genex-threejs-touch-controls` retain
their existing tier detection, runtime governor, DPR/shadow/post budgets,
generated-asset rungs and fallbacks, mobile preflight/readiness, and touch
input behavior. Do not hard-code competing quality or mobile systems.

## Parallel work and the optional fresh critic

Whole coordinated mode may fan independent request-derived workstreams out to
sub-agents. One writer owns each disjoint file set; the director integrates
shared boot, loop, and netcode files. Focused work skips fan-out unless the
request itself has independently useful parts.

A player who asks for parallel work, repeated refinement passes, or a critic
reviewing the work has given the instruction—wherever it reaches you, including
inside an answer to a question you asked. It becomes the working mode right
then, on the work in front of you, not a milestone scheduled for later.

For a substantial judgeable result, a fresh critic may inspect the real game,
rendered pixels, supplied reference, or test output—not a builder summary. It
returns the single largest meaningful gap; the builder may correct it and ask
for another fresh look. Stop when requested acceptance is reached, gains are
immaterial, the player redirects, or time/compute budget is spent. No fixed
round count, critic ledger, progress site, or automatic paid retry.

A critic can identify a protected-lane issue but cannot bypass or rewrite the
owning lane. Follow-up uses the same approval, credit, checkpoint, retry, and
verification behavior.

## Acceptance

- **Focused request:** done means its observable requested result works and the
  relevant owning-skill evidence exists. It does not require unrelated
  full-game floors.
- **Step:** done means that milestone reached preview; the final outcome and
  open commitments remain truthful.
- **Whole coordinated result:** done means the requested outcome and relevant
  commitments are present and reachable, with the invoked lanes' own checks
  satisfied.

For moving controls, verify labeled direction. When physics/controllers are
used, keep per-frame work inside the physics world's before-step hook, then
step the world—never duplicate simulation in the render loop. Browser evidence
must show the relevant canvas result renders, moves, and responds.

## Publish and multiplayer awareness

An explicit preview or publish request proceeds directly through the existing
protected command flow; do not restart design discovery. Preserve every
preflight, mobile report, source upload, live-pointer, remix, marker, and
approval behavior. State open commitments and warnings plainly, then follow
the player's explicit direction.

Do not invent unavailable Genex service APIs. Keep renderer/scene setup
isolated from transport/auth code, spawn/simulation seeds deterministic, state
serializable, asset paths explicit, and one clear start function for local
preview and hosted launch.

**Multiplayer is mandatory routing.** If the game has 2+ players sharing a
world, load `$genex-threejs-multiplayer` **before writing any networking
code**—it is not optional. The `@genex-ai/multiplayer` relay syncs
`me`/`shared`/`objects`; the **SDK auto-smooths remote players AND shared
objects** for you (do not write your own interpolation). It gives
server-enforced primitives—`objects` (one owner per ball/NPC, claimed on
contact) and a room `host` (single writer of scores, single simulator of
enemies). Draw `state` directly, render yourself and owned objects from local
state, use quaternion rotation, and reserve `stateRaw` for hit-tests.
Reconnection is built into the SDK (`reconnecting`/`reconnected`; never
rebuild it).

Pushable/ownable bodies use claim-on-touch plus a Rapier proxy; only a genuine
simultaneous contest uses the host-authoritative `inputs` + `onHostTick`
pattern. Choose the net model from player experience: one ongoing drop-in
world uses `connect()`; a fresh bounded match/mission with quorum, fair start,
teams, backfill, or parallel sessions uses `matchmake()`. Infer this when the
brief is clear. Ask one experience-level question only when both are genuinely
plausible—never ask the player to select an SDK API or preset.

When a Play/Online button exists, it is the first relay contact. Immediate
`connect()` + spawn is valid only when loading already means joining the
always-online world and no fake Play screen exists. Before handoff, run the
multiplayer skill's netcode feel gate with two distinct identities. Use only
the APIs that skill documents.
