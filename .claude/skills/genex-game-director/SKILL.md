---
name: genex-game-director
description: The lightweight Genex request router. Read the latest game, tool, component, or focused-change request; ask only genuinely unresolved build forks; keep DESIGN.md current; and load only the Genex skills that the requested work actually needs. Use first for new work, resumed work, or whenever ownership is unclear.
---

# Genex Game Director

The player chooses what to build and in what order. You route that request;
the owning Genex skills control how their lanes run. Load only skills that
change the requested result—never the whole pack by default, and never
commission unrelated work because an old workflow listed it.

**After any context compaction or session resume**, re-read the project's
`AGENTS.md`, `DESIGN.md` when present, and the skill for the work you are
executing. Then follow the player's latest clear request; do not reconstruct
the project from memory or replay completed discovery.

## 1. Check capabilities and boundaries once

Look at your available tools:

- **Question tool:** use it only when this skill says a real unresolved fork
  remains; otherwise continue. Without one, ask one short plain-language
  question in chat.
- **Sub-agents:** useful for independent workstreams in a whole coordinated
  build; never required for focused work.
- **Browser:** use it to inspect the actual result. Without one, ask the player
  for the smallest useful visual observation.

Never claim a capability you did not find, and never stall because one is
missing.

Your platform may bundle its own image/video generation and site-building,
hosting, or deploy skills. **They are not Genex lanes.** All generated art,
audio, video, characters, and UI come from `genex` commands unless the player
explicitly asks for another tool by name. A local reference image is not a
reason to switch tools: `genex image --edit` and `--inpaint` accept local
paths. Building, previewing, and publishing use `genex preview` /
`genex publish`; do not load a competing hosting workflow.

## 2. Route the latest request

Use the request in front of you, not the oldest description of the project.

- **Clear focused request**—“work on the UI,” “fix movement,” “add one enemy,”
  “make this prop,” “publish this”—read the touched implementation and
  `DESIGN.md`, load only the owning skills, update `Now:`, and start. Do not
  re-pitch the game, ask whole-game-versus-one-part again, force a concept
  round, restart completed milestones, or add adjacent work.
- **Clear new game request with a named scope** starts from that scope. Record
  the requested destination and proceed; ask only a missing decision that
  materially changes architecture or player experience.
- **Broad full-game request** may need one scope choice: “Should I build the
  whole game as coordinated milestones, or start with one part?” Offer only
  request-relevant parts—such as movement, core gameplay, world, enemies, UI,
  multiplayer, or a named tool. If the player already chose a part or clearly
  asked for the complete game, skip the question.
- **Blank or genuinely unclear intake** asks one neutral question: are they
  making a game, building a tool/component, or changing existing work? Do not
  invent or propose game concepts for them.
- **Existing project** respects its renderer, physics, file conventions, and
  working systems unless the player asks to change them.

Ask one decision at a time. Never ask the player to choose an SDK, engine,
renderer, file layout, provider, or other implementation detail. Product
defaults fill missing implementation choices; they never override a clear
request.

The player's latest direction may replace `Now:` immediately. Preserve
unfinished requested work as open commitments unless the player cancels or
re-scopes it; focused work changes the current order, not historical truth.

## 3. Keep DESIGN.md as durable memory

For a new project or substantial multi-step request, create `DESIGN.md` from
[references/design-contract.md](references/design-contract.md). For existing
work, update only the sections touched by the latest request. A tiny focused
fix does not need unrelated sections filled in.

The file keeps three truths separate:

1. **Requested outcome**—the player's final target, changed only by the player.
2. **Current focus**—the exact `Now:` item and its observable done condition.
3. **Open commitments**—requested work not completed, cancelled, or re-scoped.

Also record the working mode: `whole coordinated build`, `step by step`, or
`focused change`. Step-by-step changes order, not destination. The build plan
is current, never “locked”; tell the player only that their request is recorded
in `DESIGN.md` and you will keep it current.

Preserve the exact markers used by existing machinery: `## Build plan &
status`, `Now:`, `HUD lane:`, `Menu video:`, HUD pipeline stage IDs and paths,
`Player character:`, generation IDs and permanent URLs, and asset wiring
state. The paid Assets flow remains:

`proposed → planned → generating (id) → landed (URL) → wired`

A landed asset is not complete until wired or visibly cancelled. Procedural
code-built assets use their own local flow:

`proposed → planned → building (blockout | detail | material | runtime) →
landed (<local TypeScript path>) → wired`

Never invent a provider generation ID for local code. Sections for gameplay,
content, UI, world, assets, multiplayer, character/animation, tools, or
modules are conditional on the request and existing project.

## 4. Route to the owning lane

Use the [routing map](references/routing-map.md) for exact ownership. The main
Genex asset and runtime lanes are:

- `npx genex model "<prompt>"`—a static GLB → `$genex-ai-model`
- `npx genex texture "<prompt>"`—a generated surface → `$genex-ai-texture`
- `npx genex skybox "<prompt>"`—a 360° environment-only sky →
  `$genex-ai-skybox`
- `npx genex sfx "<prompt>"` / `music` / `voice` →
  `$genex-ai-sfx`, `$genex-ai-music`, `$genex-ai-voice`
- `npx genex image "<prompt>"` / `video`—2D and motion art →
  `$genex-ai-image`, `$genex-ai-video`
- UI, HUD, and menu requests → `$genex-threejs-game-ui`,
  `$genex-ai-hud`, `$genex-ai-menu`
- `npx genex character`, `creature`, and their motion commands →
  `$genex-ai-character`, `$genex-threejs-creatures`
- movement and vehicles → `$genex-threejs-character-controller`,
  `$genex-threejs-vehicle-controllers`
- phone input and phone-survivable rendering →
  `$genex-threejs-touch-controls`, `$genex-threejs-adaptive-quality`
- editable, parameterized reference objects or simple environment pieces →
  `$genex-threejs-procedural-assets`

For “make this image 3D,” ask **one** route question only when both results
honestly fit: a generated static GLB, or editable parameterized Three.js code.
If the request says procedural, parametric, code-built, reusable variations,
or names a GLB, start the corresponding route directly. An image alone never
auto-triggers the procedural lane. Player bodies, rigged characters/creatures,
and animation stay with their protected owners.

If a procedural request has a private reference, use it locally and do not
upload, publish, or commit it without explicit permission. If no reference was
supplied and creating one is part of the requested work, use the existing
`npx genex image` lane unchanged and record that paid reference as its own
Assets row.

Plan and generate only assets the current request earns. In a whole coordinated
game build, derive the set from the requested outcome and commitments; in
focused work, do not create a default “core set” outside the touched scope.
Run independent planned generations with `--no-wait`, scaffold while they
land, and preserve their IDs, URLs, and wiring state.

## 5. Execute by working mode

### Focused change

Start directly. Read the touched files, preserve working systems, update the
relevant `DESIGN.md` section and `Now:`, execute the owning lane, and verify
the requested result. Skip unrelated discovery, module fan-out, UI/HUD
concepts, asset batches, and critic loops.

### Step by step

Set `Now:` to the chosen request-relevant part and build it. Preserve the
player's final requested outcome and every other unfinished promise under Open
commitments. When the step is previewed, ask what they want next only if their
latest message did not already say.

### Whole coordinated build

Turn the actual request into milestones and workstreams. The director may run
independent work in parallel and move through internal milestones without
asking the player to manage each one. Dependencies determine order; no fixed
module list does.

For every new game, preserve the platform foundations:

1. `$genex-threejs-embed-auth` owns identity and runs before boot code.
2. `$genex-threejs-adaptive-quality` owns device tiers, the runtime governor,
   and generated-asset rungs at boot.
3. `$genex-threejs-touch-controls` owns mobile input whenever its recipe fits.
4. `$genex-threejs-multiplayer` loads before networking code whenever 2+
   players share a world.

Record only content and world promises present in the request or essential to
its stated genre. Make them countable or otherwise observable before choosing
the paid asset batch. A requested large/open world records its intended scale,
terrain/ground, boundaries, and locations from the request; never silently
replace it with one small flat plane hidden by fog or impose fixed kilometer,
chunk, biome, or POI defaults. Generated-asset availability never decides how
much game the player receives. Ask one scope question only when a real
reduction is required.

There is **no startup game, UI, or HUD concept gate**. Schedule UI/HUD/menu at
the appropriate later milestone when the complete requested outcome includes
those surfaces. Enter that lane immediately when the player asks for it, and
skip it during unrelated focused work.

### When the UI/HUD/menu lane is invoked

**Generated UI art is opt-in.** A restrained interface built in clean CSS is a
finished, legitimate HUD—not a placeholder. Reach for the sprite lane
(`$genex-ai-hud`) when the game's own style genuinely wants drawn
chrome—ornate, painterly, comic, hand-made—or when the player asks for HUD art;
stylized games are where chrome earns its place. The art direction comes from
the game's brief in words. Generating ONE element you decided the game needs—a
frame, a mask, an icon, a wordmark, a menu backdrop, a menu video—is a normal,
first-class use of these tools, never a half-run pipeline.

Judgment governs *whether* art is generated; it never loosens *how well* it is
done. When you do run a stage, run its quality steps in full: `$genex-ai-hud`
and `$genex-ai-menu` keep their Stage-1/Stage-2 prompts, FAL calls, credits,
checkpoints, retries, extraction, masks, wiring, `npx genex ui audit`, nudges,
and preflights exactly as written, hard refusals included. Choosing to generate
one element rather than a whole set is a scope decision, not a bypass.

While a sprite or menu-video pipeline is actually in flight, `DESIGN.md` holds
its state so a context compaction can resume it: `HUD lane:`, `Menu video:`,
and the HUD pipeline stage IDs and paths. A game whose interface never runs a
generation lane records nothing there.

In both lanes, micro-text stays HTML text in the chosen font, and no generic
rectangular plate appears behind bars, digits, or icons; a genuinely shaped
plate comes from `npx genex ui plate`.

### Controls that move

For every game that moves, apply the screen-direction contract and record the
pointer bucket and input-direction convention:

- `$genex-threejs-camera-direction` owns pointer lock. First-person/FPS
  shooters and other mouse-aimed action keep it; cursor-core games and orbit
  showcases pass `pointerLockAim: false`; keyboard-only games lock the unused
  cursor during play.
- D/ArrowRight moves or turns screen-right, mouse-right turns the view right,
  and drag-pan axes share one convention. Copy the verified bases from the
  camera skill before writing hand-rolled signs.

## 6. Coordinate only when coordination helps

Whole coordinated mode may use sub-agents for independent, request-derived
workstreams. Focused work skips fan-out unless the requested task itself has
usefully independent pieces.

- One worker owns one disjoint file set. The main agent remains the integrator
  and only writer of shared boot, main-loop, and netcode files.
- Give each worker the `DESIGN.md` path, its exact row, owned files, relevant
  skill paths, and observable done condition. Workers do not spawn workers.
- A worker generates only Assets rows already marked `planned`; new wants
  enter as `proposed`. Whoever wires HUD output reads its mask/bbox files, not
  a prose summary.
- Do not create workers merely to write extra test suites or reports.

When the player asks for parallel work, repeated refinement passes, or a critic
reviewing your output, that request IS the instruction—wherever it reaches you,
including inside their answer to a question you asked. Adopt it as the working
mode immediately, starting with the work in front of you; never file it as a
later milestone or a final polish pass.

For a substantial, judgeable result in whole coordinated mode, a **fresh
critic may** inspect the actual game, rendered pixels, reference, or test
result—not the builder's summary. It returns the single largest meaningful
gap; the builder may address that gap and request another fresh look. This is
permission, not ceremony: no fixed round count, progress site, per-round
ledger, or user approval between internal rounds.

Stop when the requested acceptance is reached, improvement becomes immaterial,
the player redirects the work, or the available time/compute budget is spent.
A critic may identify a protected or paid-lane problem, but may not bypass,
rewrite, or automatically repeat that lane; follow-up still uses its existing
approval, checkpoint, retry, credit, and verification behavior.

## 7. The game's character (Meshy)—the player's body

**The game's own generated character is the player's body** wherever a human
body appears on screen. Third-person obviously; first-person too when remotes,
a look-down body, shadow, death/spectator camera, or menu portrait shows one.
“No human body ever appears” is the exemption—not “the camera is in the
head.” A genuinely non-person player (car, ship, RTS cursor, board) uses
`npx genex model` instead.

When this lane is relevant, put its row in the Assets table and enqueue it
when its milestone starts—or in parallel when whole coordinated mode makes
that useful. Its asset-specific concept review is its own beat—the one concept
step that survives, because the player is choosing a concrete thing they asked
for—and it never waits on another lane. `npx genex controller character`
installs the controller and fallback body; `loadPlayerCharacter` keeps the boot
path stable, and `npx genex controller character --character <id>` switches the
manifest when the generated body lands.

The profile VRM avatar is the fallback: a temporary body while generation
runs, or the stand-in when generation genuinely could not happen, recorded as
`Player character: VRM — <reason>`. A capsule or hand-built primitive is never
a shipped human body. In multiplayer, every remote wears the generated game
character when one exists.

**The default lane has one user stop: the character concept review.** When the
user names a visual reference, inspect references before writing the concept
prompt. Generate exactly three concepts, all neutral A-pose; never use a
dynamic concept pose or silently fall back to T-pose. Warn that held, slung,
or overlapping props and straps can fuse into the body or obscure limbs, and
recommend separate gameplay props. Show the actual images and wait for the
player to explicitly select a candidate. Their pick carries the lane:

`npx genex character preview <concept-id> --candidate <1|2|3> --user-approved`

If the player has not picked by the time the character blocks progress (or
~10 minutes), use the existing owner-ratified platform policy (2026-07-23):
pick the strongest candidate, say which and why in chat, proceed, and record
the decision in `DESIGN.md`.

Meshy Image-to-3D first produces an unremeshed high-detail model. Show its
front, back, left, and right views and report its measured face count.
Preserve that model in R2. The 10,000-face triangle remesh—not the high-detail
source—is rigged and animated. In the default lane, the pick authorizes that
remesh:

`npx genex character finalize <preview-id> --user-approved --approve-remesh 10000 [--animation <action-id>…]`

When the player explicitly requested a custom character, keep the existing
two stops: wait for candidate selection before Image-to-3D, then wait for
explicit remesh approval before finalize. The `--direct-text` legacy path is
not a substitute.

Load `$genex-ai-character`, search actions with
`npx genex animations search "<intent>" --json`, and never invent IDs. Meshy
limb rotations play unchanged. Never freeze hand tracks or apply post-mixer
arm, hand, leg, or foot corrections. Only horizontal root or hip translation
may be normalized for Rapier. The character controller owns collision and
world translation. Before handoff, visibly check idle, walk, run, crouch-idle,
crouch-move, and jump, plus every control the HUD advertises.

## 8. Verify in proportion to the request

Focused work verifies the focused result and the owning skill's required
evidence; it does not trigger a whole-project audit. A milestone preview uses
one smoke pass after the preview, not a new test suite.

- Always capture the relevant running result and exercise the changed control
  or interaction in its labeled direction.
- Once a generated HUD is wired, capture gameplay after a changing value
  (such as damage) so masks/fills are visible.
- Once menu video is wired, watch one full rendered loop using
  `$genex-ai-menu`'s seam check.
- Multiplayer uses the existing two-distinct-identity netcode feel gate.
- Character/animation uses the owning lane's pose, clip, and controller checks.

Judge evidence against the requested result and current `DESIGN.md`, fix
meaningful gaps, and move on. An explicit preview or publish request runs the
existing protected flow directly; report open commitments honestly rather
than restarting design discovery.

## 9. Say it straight

“Loaded” means you read a file. “Built” means the thing runs. “Done” means the
requested acceptance and relevant owning-lane checks are true. Never report a
skill as applied because you read it, an asset as wired because it generated,
or the full requested outcome as complete while Open commitments remain.
