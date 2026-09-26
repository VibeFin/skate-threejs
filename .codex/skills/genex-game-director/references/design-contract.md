# The design contract — DESIGN.md

`DESIGN.md` is durable project memory, not a startup questionnaire. Create it
for a new project or substantial multi-step request; for an existing project,
read it first and update only what the latest request changes. A small focused
fix may use the existing file without expanding unrelated sections.

Write in plain language the player can read. Commit the file with the project
so it survives a long pause, context compaction, handoff, and remix.

## Rules

- **Requested outcome is the destination.** Record what the player ultimately
  asked for. A milestone or step-by-step working mode may change build order,
  but may not silently shrink that destination.
- **Working mode describes this run:** `whole coordinated build`, `step by
  step`, or `focused change`. A clear later request may change the mode and
  replace `Now:` immediately without replaying discovery.
- **The Build plan & status section is the compass.** Keep the exact
  `## Build plan & status` heading and `Now:` marker. Use `▶ in progress`,
  `✅ → previewed`, `⏸ paused`, and `⬜ open/next` truthfully. A milestone is
  complete only when its result reached `genex preview`; a pause does not erase
  the commitment.
- **Open commitments preserve unfinished promises.** Requested work remains
  open until completed, explicitly cancelled, or re-scoped by the player.
  Open work prevents a false claim that the full requested outcome is done,
  but never blocks an explicit preview or publish request: run the owning flow
  and say plainly what remains.
- **Ask only about a real reduction.** If completing a request would require
  lowering its content, world, or quality target, ask one scope question.
  Otherwise choose sensible implementation details and continue.
- **Modules are conditional.** Use the Modules table for a whole coordinated
  build or another useful parallel split. Dependencies decide parallel versus
  serial, file ownership never overlaps, and focused work does not create
  unrelated module rows.
- **The Assets table is the paid-generation budget and ledger.** Keep the exact
  status flow `proposed → planned → generating (id) → landed (URL) → wired`.
  A landed asset is unfinished until wired or visibly cancelled. Preserve
  generation IDs, permanent URLs, local outputs, and wiring state across
  compaction.
- **Code-built procedural assets use their own truthful status flow:**
  `proposed → planned → building (blockout | detail | material | runtime) →
  landed (<local TypeScript path>) → wired`. They never invent a provider
  generation ID. A generated reference image is a separate normal Assets row.
- Sections are request-driven. Gameplay, content, UI, assets, world,
  multiplayer, character/animation, tools, modules, and procedural assets
  appear only when the request or existing project uses them.
- Preserve every machine-readable marker an invoked pipeline owns, including
  `HUD lane:`, `Menu video:`, HUD stage IDs and paths, `Player character:`,
  asset generation IDs/URLs, and wiring state. They exist so work already in
  flight survives a compaction; a lane you never run leaves its markers unwritten
  and owes no explanation for their absence.
- A private reference attachment is a build input. Do not upload, publish, or
  commit it without the player's explicit permission.

When the document first lands, tell the player in one plain line that you
recorded what they asked for in `DESIGN.md` and will keep it current. Do not
call the plan “locked”; the player may redirect the work at any time.

## Template

```markdown
# <Project name> — Design

_Living document — the agent keeps this current; changes land in the log at
the bottom._

## Requested outcome
<The player's final target, in their language. Preserve it until they change
or explicitly re-scope it.>

## Build plan & status
Working mode: <whole coordinated build | step by step | focused change>
Now: ▶ <number/name of the current milestone or focused task>
Done when: <one plain, observable condition for the current work>
1. <milestone> — ✅ → previewed
2. <milestone> — ▶ in progress (<main agent | sub-agent>)
3. <milestone> — ⏸ paused (<reason>)
4. <milestone> — ⬜ open/next
(Keep only milestones the request earns. Update `Now:` immediately when the
player redirects the work.)

## Open commitments
- [ ] <requested promise not yet complete>
- [ ] <another promise>
(Remove only when completed; otherwise mark explicitly cancelled or re-scoped
in Decisions & changes.)

## Core loop (gameplay requests only)
- **You do:** <primary verb>
- **To:** <objective>
- **Under pressure from:** <what pushes back>
- **You earn:** <reward/progression, when requested>
- **You lose when:** <fail state> → **and retry by:** <restart shape>

## Content commitments (only when requested)
Record only promises present in the request or essential to its stated genre.
Make each promise countable or otherwise observable:
- <commitment>: <target and acceptance>
- <commitment>: <target and acceptance>

## World & scale (only when relevant)
Intended scale: <request-derived size/shape>
Terrain/ground: <request-derived form>
Boundaries: <what the player encounters at the edge>
Locations: <requested named/countable locations>
(A requested large/open world is never silently replaced by one small flat
plane hidden by fog. Do not impose fixed kilometer, chunk, biome, or POI
defaults.)

## Screens & UI (only when the UI/HUD/menu lane is invoked)
Screens: <only the requested/required states> · Style brief: <one line>
(The two lines below are bookkeeping for a generation lane actually running,
so a compaction can resume it. An interface built in CSS records neither.)
HUD lane: sprites (<which elements the sprite lane is producing>)
Menu video: <generation id/URL, or the still standing in while it renders>

## Assets — the generation plan AND budget (only when used)
| Asset | Kind | Status | Wired? |
|---|---|---|---|
| <asset> | <model/image/texture/…> | planned | — |
| <asset> | <kind> | generating (<id>) | — |
| <asset> | <kind> | landed → <URL> | yes/no |
Status flow: proposed → planned → generating (id) → landed (URL) → wired.

**HUD pipeline state (only while the sprites lane is running) — keep this
current; it is how that pipeline survives a context compaction.**
- Stage-1 mockup: <id → URL>
- Stage-2 sheet: <id → URL>
- Cleaned sheet: <id → URL>
- Extracted sprites: <public/assets/hud/…>
- Masks: <public/assets/hud/…-mask.png + sidecars>
- Next stage: <what fires next, one line>

## Procedural assets (only for editable code-built references)
| Asset | Reference | Status | Wired? |
|---|---|---|---|
| <object> | <private local path or separate Genex asset row> | building (blockout) | — |
Status flow: proposed → planned → building (blockout | detail | material |
runtime) → landed (<local TypeScript path>) → wired.

## Player character & animation (only when used)
Player character: <generated character id/status | VRM — explicit reason>
Character generations: <concept/preview/final IDs and URLs>
Animation: <catalog actions or generated motion IDs, bindings/manifests,
validation still open>

## Multiplayer (only when 2+ players share a world)
<ongoing world (connect) | fresh matches (matchmake: quorum, teams,
backfill…)> — and why.
Play-button rule: nothing connects before the click when a Play screen exists.
Verification still open: <two-identity/netcode evidence>

## Modules (whole coordinated mode or another useful split only)
| Module | Owns files | Built by | Done when |
|---|---|---|---|
| <request-derived stream> | <disjoint paths> | <parallel/serial + reason> | <observable result> |

## Verification evidence
- <preview URL/date and what it proves>
- <browser capture, interaction, phone, multiplayer, or owning-skill evidence>

## Decisions & changes
- <date> — <decision, assumption, explicit cancellation, or player re-scope>
```
