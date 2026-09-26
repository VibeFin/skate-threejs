---
name: genex-ai-character
description: Generate a controller-ready Meshy humanoid with Genex, search the committed Meshy animation catalog by gameplay intent, add exact same-rig actions, and install the shared physics controller's Meshy-native adapter. Use for the game's own character — the player's body in every game where a human body appears on screen — and for motion the bundled UAL library doesn't cover.
---

# Genex AI Character

**The game's own generated character IS the player's body.** Not the platform's
profile avatar — that is the fallback. The rule applies wherever a human body
appears on screen: third-person obviously, and first-person too, the moment
co-op or versus remotes, a look-down body, a shadow, a death or spectator
camera, or a menu portrait shows one. "The camera is in the head" is not an
exemption; **"no human body ever appears in this game" is.** A game whose
player is genuinely not a person — a car, a ship, an RTS cursor, a puzzle
board — generates that object with `npx genex model` instead.

**Start it EARLY** — enqueue the character with your first art actions, not as
an afterthought once the world is built. It is the player's body and every
stage of it takes minutes server-side, so firing at minute 0 means it lands
around the v0 preview instead of long after it. Its concept candidates get
their own review beat with the player when they arrive.

Until it lands, the player's body is the profile VRM avatar. That is a fallback
in two shapes and both are spoken aloud: a **temporary** body while the
character renders (say so in one plain line — the avatar is fully textured and
animated, so nothing on screen will look unfinished enough to remind you), or
the **stand-in** when generation genuinely could not happen (out of credits,
failed, email unverified) — then record `Player character: VRM — <reason>` in
DESIGN.md. Never let it become the game's character by default.

Both lanes use the same ECCTRL-derived Rapier controller, camera, inputs,
crossfades, transition rules, and multiplayer authority contract — and the
same one-call boot path (`loadPlayerCharacter`, in
`$genex-threejs-character-controller`), so when the character lands mid-build,
`npx genex controller character --character <id>` is the whole switch. There is
no code to rewrite, which is exactly why there is no excuse to skip it.

**Two lanes, two approval shapes:**

- **The game-default lane (one user stop).** The three concept candidates
  ARE the review beat: show the actual images, the player picks one. That
  pick authorizes the whole lane (preview and the 10,000-face rigging
  remesh both proceed on it — state each step plainly as you run it). If
  the player hasn't picked by the time the character blocks progress (or
  ~10 minutes), pick the strongest candidate yourself, say which and why
  in chat, and proceed. That auto-proceed — including its generation
  spend — is owner-ratified platform policy (2026-07-23), not an agent
  liberty: record the pick in DESIGN.md → Decisions.
- **The user-initiated custom-character lane (two stops — the ceremony
  below, in full).** When the user themselves asked for a custom
  character, the approvals ARE the product: an explicit candidate
  selection, then an explicit approval of the separate 10,000-face
  remesh. Never compress these two stops for a user-initiated ask.

## Generate a controller-ready character

Before generating a Meshy character, discuss two or three visual directions.
When the user names a visual reference, inspect references before writing the
concept prompt. Recommend a neutral A-pose for characters that will be rigged.
Ask which equipment and color direction matter, and explain that every
riggable concept uses that neutral pose instead of an action pose.

Generate exactly three concept candidates for the chosen direction. Lock all
three to a neutral A-pose: never use a dynamic concept pose. Warn before
generation when held, slung, or overlapping props, straps, clothing, or gear
may fuse into the body or obscure a limb; recommend generating gameplay props
separately.

```bash
npx genex character "stylized desert courier, practical layered clothing"
```

**Keep the brief under 600 characters** — the concept endpoint rejects longer
ones. A brief is the LOOK (silhouette, materials, palette, mood), not the
game design; gameplay details never belong in it.

**Every character stage takes minutes server-side — never sit in a foreground
`genex wait` on one.** Enqueue with `--no-wait`, keep building the game, and
pick the result up at the next natural pause with `genex wait --all`. Watching
a character render in 30-second poll chunks stalls the whole build and is the
single fastest way to make the player ask why nothing else is happening.

Generate concept images first and show the actual images to the user. Do not
start Image-to-3D until the user explicitly selects a candidate.

Open or link all three real candidate images, then wait for the user's choice.
Do not treat a text description, task ID, filename, or your own preference as
approval. Continue with the selected candidate only:

```bash
npx genex character preview <concept-id> --candidate <1|2|3> --user-approved
```

Meshy Image-to-3D first produces an unremeshed high-detail model. Show its
front, back, left, and right views and report its measured face count. Preserve
that model in R2. Before rigging, ask the user to approve a separate
10,000-face triangle remesh. The 10k remesh—not the high-detail source—is
rigged and animated. (For these approvals, use your question tool when you
have one; if you have none, a short numbered list in chat.)

The high-detail pre-rig generation stays in the selected neutral A-pose. There
is no dynamic-pose concept and no silent T-pose fallback. After the user has
seen the four views and face count, wait for explicit approval and finalize:

```bash
npx genex character finalize <preview-id> \
  --user-approved \
  --approve-remesh 10000 \
  --animation <action-id>
```

`--animation` is repeatable. Finalization uses Meshy 6, creates the approved
10k triangle remesh, rigs it, adds the immutable preview-reviewed neutral-v3
idle/walk/run/crouch/jump controller pack, and stores the source, remesh, rig,
and clips at permanent Genex asset URLs. It prints the complete Genex-credit
quote before enqueueing. The Meshy API key remains server-side; never ask the
user for one or call Meshy directly from game code.

Meshy's public API performs automatic rigging. The manual joint-marker step
shown in Meshy Web is not exposed through that API, so do not claim that this
part of the hosted workflow is reproduced.

The legacy one-shot text workflow is explicit and does not masquerade as the
reviewed image-first path:

```bash
npx genex character "compact fantasy knight" --direct-text
```

Useful options:

```bash
npx genex character finalize <preview-id> --user-approved --approve-remesh 10000 --height 1.7
npx genex character finalize <preview-id> --user-approved --approve-remesh 10000 --animation 466 --no-wait
npx genex wait <generation-id>
```

`--animation <id-or-query>` is repeatable on `finalize`.
`--no-controller-pack` is available only with the explicit `--direct-text`
compatibility path. The guided parity workflow always installs neutral-v3.
`--no-wait` returns a generation id for `genex wait`; it does not create a
second paid request. Never add `--user-approved` until the user has actually
seen and selected the candidate; never add `--approve-remesh 10000` until they
have actually seen the four high-detail views and measured face count.

Before handoff, capture idle, walk, run, crouch-idle, crouch-move, and jump.
Inspect shoulders, elbows, wrists, and hands as well as the feet. Reject
shrugging palms-up poses, permanently raised elbows, or a gait whose
upper-body style contradicts the requested character. “No T-pose” is not
an animation-quality check.

## Search first; use action IDs

```bash
npx genex animations search "rifle reload" --json
npx genex animations search "dance" --category Action --limit 8
npx genex animations search "walk backward" --in-place
```

Search is local and free: it reads the committed Meshy catalog and returns the
numeric action ID, stable key, preview URL, motion policy, controller slots,
requirements, review status, and estimated Genex cost. Use a returned action
ID. Never invent an ID or assume an unsupported motion exists. For example,
the current committed catalog has no skateboard action; build that mechanic
only after search returns real coverage.

Catalog entries are metadata-reviewed. Inspect the preview before choosing a
specialty action. Only provider-declared `InPlace` loops or measured overrides
may fill locomotion slots automatically.

## Custom animations — `genex character animate "<verb>"`

Catalog search is ALWAYS the first stop — its stock actions cover most verbs
with no spend. When the catalog genuinely lacks the motion (a signature move, a
boss telegraph, a full 8-way movement set), say what the character should DO in
plain words and the platform generates it for this character's own rig:

```bash
npx genex character animate <character-id> "overhead slam" "parry and recover" --no-wait
npx genex character animate <character-id> --locomotion --no-wait
npx genex character animate <character-id> "victory pose" --video ./take-3.mp4
```

One clip per verb. You never choose the method — the platform routes each verb
(reuse a shared-library motion, generate movement, act it out on video first, or
generate from a description) and prints the plan BEFORE anything is charged.

**Show the plan to the user and let them change it before you continue.** That
is the one stop in this lane; everything after it runs in the background while
you keep building.

Read [references/motion-generation.md](references/motion-generation.md) before
the first run: it carries what makes a good verb, which verbs this cannot do,
and the footage requirements for `--video`.

`--locomotion` generates the full 8-way walk + run set (16 clips) — the
directional slots the shipped controller resolves but the stock pack leaves
empty, so a strafe stops being a faked forward walk. For an enemy that just
follows a path, `--lean` keeps it to forward walk + run.

Animate an enemy the same way — `genex creature animate <id> "<verb>"`. A
creature is already a character underneath; the alias exists so you don't have
to know that.

## Add actions and refresh the game

```bash
npx genex character animate <character-id> --action <action-id>
npx genex character animate <character-id> --action <first-id> --action <second-id> --no-wait
npx genex character motions <character-id>     # what is installed right now
npx genex controller character --character <character-id>
```

`--action` picks an existing catalog clip; a free-text verb generates one. Both
land in the same manifest and play through the same state machine.

Ambiguous text queries print ranked candidates instead of silently spending
credits. Already-installed actions return without another debit. After an
animation job completes, rerun `genex controller character --character <id>`
to refresh `public/assets/meshy-character.json`; existing controller source is
preserved unless `--force` is explicitly used.

Six slots belong to the reviewed controller pack and cannot be replaced —
`idle.default`, `walk.forward`, `run.forward`, `crouch.forward`, `crouch.idle`,
`jump.full`. A generated locomotion set fills the other fourteen directions; the
plan says so before you spend anything. A character built without the pack
(every `genex creature`) takes all sixteen.

Meshy manifests bypass browser cache, so newly installed actions must work
after preview without asking the player to disable cache.

`playOneShot()` returns false and emits one warning when a requested clip is
absent; treat that as an installation failure, not a successful action.

Meshy limb rotations play unchanged. Never freeze hand tracks or apply
post-mixer arm, hand, leg, or foot corrections. Only horizontal root or hip
translation may be normalized for Rapier.

A bad native rig or clip must be rejected and regenerated; validation never
rewrites limb animation.

A controller pack is an immutable exact action set. If a required binding is
absent, installation fails instead of substituting Meshy's rig-basic Walking
or Running animation. During Meshy validation, record the action ID actually
bound to every slot. A public preview is not evidence when the game is playing
a different clip or a rig-basic fallback.

Load `$genex-threejs-character-controller` for the actual wiring. The install
command copies the shared controller plus `character/meshy/meshy-loader.ts`.
The manifest points at the current rigged model and compact animation-only GLBs
in R2, and carries the skeleton signature, locomotion slots, fallbacks,
durations, nominal speeds, trajectories, and gameplay requirements.

## Compatibility and motion authority

- Meshy clips play only on the exact character revision whose skeleton
  signature matches. There is no runtime retargeting in this lane.
- Do not repair hands, arms, or legs at runtime. Verify the installed manifest's
  exact slot-to-action mappings; stop and regenerate when a native pose is bad.
- Rapier owns the player transform. Only horizontal root or hip translation may
  be normalized; never move the rendered character root separately.
- `controller-loop` clips follow controller-local intent and measured speed.
  The state machine crossfades idle, walk, run, jump, directional slots, and
  explicit fallbacks exactly as it does for VRM + UAL.
- `anchored-action` is a one-shot at the current controller pose.
- `planar-root-action` is not enabled for physics movement until the manifest
  says `rootMotionValidated: true`. The current catalog does not validate root
  motion, so do not drive a roll or lunge trajectory merely from its name.
- `choreography` needs game logic for the named prop, partner, ledge, ladder,
  obstacle, seat, or other environment contract. A clip does not create that
  mechanic.

For multiplayer, only the owning client advances the dynamic body and publishes
its pose plus compact animation state. Remote characters are visual-only: they
interpolate the owner's transform and replay the matching clip progress. Never
run a motion driver or a second physics controller for a remote player. In a
game with a generated character, every remote wears it — one
`loadRemotePlayerCharacter` call, one shared parsed base, N cheap clones.

## Troubleshooting

- **"Not authorized"** — run `npx genex init` first (in the project — it resolves this project's own CLI) (it writes your `GENEX_TOKEN`).
- **"Out of credits" (`insufficient_credits`)** — the account has no credits left for
  this character stage. Tell the user the facts the CLI printed: their balance, this
  stage's cost, and when their credits refill. Then keep the player on the profile
  VRM avatar (the fallback lane — no code change, it is already what the game
  loads), tell them in one plain line that the game is wearing the platform avatar
  because the character couldn't be generated, record
  `Player character: VRM — out of credits` in DESIGN.md, and mark the spot with
  `// TODO(genex): regenerate when credits refill`. Do not stop the session over
  this, and do not hand-build a stand-in humanoid.
- **"Email not verified" (`email_verification_required`)** — generation credits
  unlock after the account's email is verified. Give the user the verify link the
  CLI printed, wait for them to confirm, then re-run the command.
- **The character is stuck mid-lane** — each stage is a separate generation. `npx
  genex wait --all` prints one line per job; a failed `preview` or `finalize` is
  re-run from the id of the stage before it, never from the beginning.
- **The rig or a pose is bad** — reject and regenerate. Never repair limbs at
  runtime; validation never rewrites limb animation.
