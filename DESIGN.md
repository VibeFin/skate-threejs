# Skate — Design

_Living document — the agent keeps this current; changes land in the log at
the bottom._

## Concept
A PS2-era skate game. You ride a downtown street block at golden hour — cracked
asphalt, a concrete plaza, waxed ledges, handrails down two stair sets, a bank
and a quarter pipe, brick walls under layers of graffiti. Chunky low-poly
skater, crunchy textures, saturated colours, the loose feel of an early-2000s
skate video. Milestones 1–6 built the ride itself on an open field; milestone 7
gave it a place to happen and the vocabulary to fill it — grinds, spins, switch,
a trick list and falls that actually collapse.
Key art: `cms2hv48901lw22lppfy2tr8c` (street, golden hour, UI-free).

## Core loop
- **You do:** push, carve, ollie, flip, spin, grind, manual — and link them
- **To:** run one line across the block without touching down
- **Under pressure from:** the board's own momentum, a flip that has to finish
  before the wheels come back down, and a rail that has to be caught square
- **You earn:** the combo builds link by link on screen, and banks on a clean
  landing — multiplied by how long you kept it alive
- **You lose when:** you bail → the skater actually collapses → **and retry
  by:** R, instant reset, same block

## Build plan & status
Now: **14. REMOVE GENEX (2026-09-26)** — working mode: **focused change**.
The player said the game redirects to Genex and asked to remove Genex. Done:
the redirect was the embed SDK's standalone flow (`initEmbed` in `main.ts`
→ `redirectToAuthorize` → `location.replace` to the dashboard), and the SDK
is now out of the game entirely. Scores and settings live on the device.
Milestone 13's table is kept below; milestone 12's rows still marked
⏳/❌/⚠️ have NOT been absorbed here and are still owed.

### Milestone 14 — REMOVE GENEX (2026-09-26)

| # | change | file |
| - | ------ | ---- |
| 1 | `initEmbed` + `waitForPlayer` + `genex.config.ts` deleted — the redirect source is gone | `main.ts`, `genex.config.ts` (deleted) |
| 2 | board is local: best minute in localStorage, same exported shapes so every readout prints as before | `game/leaderboard.ts` |
| 3 | audio settings device-only; account stubs kept for signatures | `audio/settings.ts` |
| 4 | `@genex-ai/embed-sdk` dropped from `package.json` | `package.json` |
| 5 | results card prints BEST instead of WORLD RANK (rank was always 1 locally) | `ui/hud.ts` |

Verified: `tsc` exit 0 · `vite build` clean · shipped bundle greps 0 hits
for `redirectToAuthorize`/`location.replace`/`embed-sdk`/`genex.games`.
Trade-off, stated: no online identity means no global leaderboard and no
cross-device settings — both are per-device now. If Genex publishing is ever
wanted back, it re-enters through these same three seams.

### Milestone 13 — MOBILE CONTROLS + OPTIMISATION (2026-09-26)

Already shipped before this milestone (verified by reading, not rebuilt):
touch layer (`skate-touch-layer.ts`: static stick with hysteresis push/brake
gate, OLLIE/FLIP/GRAB/MANUAL + RESET + pause, z-16, portrait overlay),
phone-only chunk split (`skate-touch-layer-*.js` still separate in this
milestone's `vite build`), `touch-action: none`, viewport-fit cover,
Auto→phone-low default with 30 fps cap, full governor ladder, KTX2,
85.67 MB phone-low census.

Landed in this milestone, both phone-only, desktop byte-identical by
construction (no desktop row is written):

| # | change | effect |
| - | ------ | ------ |
| 1 | shadow cadence on phone tiers (`look.ts`: `needsUpdate` every 2nd frame) | halves the ~170-draw shadow rasterisation amortised — the biggest per-frame phone cost left |
| 2 | plaza anisotropy phone-low 8 → 4 (`props.ts`; phone stays 8, desktop 16) | fill-rate saving on the weakest phones, the tier that paces at 30 fps |

Known artefact (#1): the skater's contact shadow lags one extra frame
(~16 cm at cruise on 30 fps phone-low). It stays under the board; it arrives
a frame late. If it reads wrong in play, revert is one ternary.

`tsc` exit 0 · `vite build` clean, touch chunk still split.

Still open, not in this milestone: promote-on-smooth rung (re-earn `phone`
from measured frames), InstancedMesh shadow-LOD (the triangle axis no shadow
box can touch), `gpu-audit.mjs` empty-scene gate, row-8 GL census, row 11/12
desktop items.

Milestone 11 was: **THE THIRD LIST (2026-07-30, overnight)** — working mode:
**focused change, parallel sub-agents, director verifies**. Milestone 10's table
is kept below; the rows still marked ❌/⚠️ there have NOT been absorbed into 11
and are still owed.

Milestone 10 was: **THE SECOND LIST (2026-07-29)** — working mode: **focused change,
parallel sub-agents, player in the loop**. Milestone 9 previewed; he played it
and wrote the next list, which is the table below. Milestone 9's own notes are
kept underneath for the decisions they record.

Milestone 9 was: **THE PLAYER'S OWN LIST (2026-07-29)** — working mode: **focused change,
parallel sub-agents, player in the loop**. He played it, wrote out exactly what
he wants fixed, and cut the scope himself. His words on how to work: *"No need
to obsess over verification; just do it and let me test. I'll watch and give
feedback; I'll be in the loop as much as possible — your tester. Just keep
asking me as you do things — ask and work in parallel as much as you can."* So
the gauntlet's critic loop is OFF for this milestone by the player's own
instruction; he is the critic. Verification is `tsc` + the existing harnesses,
not a critic round.

### Milestone 12 — THE FAR RAMP, ROUND SEVEN (2026-07-30) — in progress

The player's whole request, in two sentences of his own:

> "the far away ramp along the wall, u see not a very strange surface, but kind
> of uneven. **Make a flat surface, like simple box ramps.** Please. And I'll say
> it again, I don't know why — could you please make it so the character launches
> off the ramp? Either design the ramp or set up the physics so the character
> **shoots upward on the ramp and stays in the same plane as their takeoff. They
> spin, land back on the ramp, and ride down.**"

**This is the SEVENTH report on the same ramp, and the previous six all ended
with green checks.** That is the milestone's real subject. `tools/back-ramp.mjs`
already existed because round six had the same problem, and its own header
records the two blind spots that let five green checks miss a live defect: every
harness *coasted* at the ramp instead of holding the throttle, and every harness
stopped the clock at the landing. So round seven's rule is that **a green check
over this ramp is not evidence**; the reproduction has to be found first and the
check written from it.

| # | row | owner | parallel? | status |
| - | --- | ----- | --------- | ------ |
| 0 | the ride FACE — flat panel, coping, look | sub-agent (`spot.ts`) | parallel — different file from row 1, and the interface between them is a single number: the tangent the lip guarantees | ✅ built, geometry independently re-derived by the director |
| 1 | the AIR — launch, hang time, return | sub-agent (`skate-model.ts`, `tools/`) | parallel, same reason | ✅ built, harnesses re-run by the director |
| 2 | smoke capture + preview + publish | director | serial, after both | ⏳ |
| 3 | the wall-push fix | sub-agent (`skate-model.ts`) | serial — it came out of row 1's finding | ✅ built + verified |
| 4 | mobile + desktop optimisation | ultracode workflow, 5 recon → plan → 5 build+verify → critic | the one workflow of this milestone; see the working-mode note above | ❌ **KILLED at 15:46, aborted mid-Recon.** 3 of 5 surveys returned; nothing was built. Their findings survive and are the plan for rows 5–9 |
| 5 | mobile: tier, governor, boot | sub-agent (`tier.ts`, `governor.ts`, `main.ts`) | parallel — disjoint files | ✅ built, `tsc` 0, functional boot check |
| 6 | mobile: phone frame cost — shadow reach + anisotropy | sub-agent (`field.ts`, `mats.ts`) | parallel | ✅ built, `tsc` 0 — **draw-call axis only, see below** |
| 7 | mobile: KTX2 for flat map textures (NOT the sky) | sub-agent (`props.ts`, `map2/dressing.ts`) | parallel | ✅ built + **plumbed by the director** in `field.ts`; `tsc` 0, `vite build` clean, `tools/ktx2-fallback.mjs` 17/17 |
| 8 | desktop: dead buffers in the post chain, category (a) only | sub-agent (`look.ts`) | parallel | ✅ built, `tsc` 0 — **GL census owed, see the director's serialized pass** |
| 9 | desktop: the sky's 768 MB — cube depth + PMREM + spot-change leak | sub-agent (new `sky/panorama.ts`, `field.ts`, `dressing.ts`, `maps.ts`) | was serial-blocked; ran once rows 6+7 handed back | ✅ **842.68 MB reclaimed, leak proved fixed across a real swap**; captures taken |
| 11 | desktop FPS: delete the AO normal prepass (category (b), ends with the player's eye) | sub-agent (`look.ts`, `distance-blur.ts`) | parallel | ⏳ |
| 12 | desktop FPS: cache the static shadow map | — | queued; `field.ts` is free again | ⏳ not started |
| 13 | mobile: **the character texture — 85.33 MB, 51.5% of the phone's whole budget** | sub-agent (`rigs.js`, `menu-stage.ts`, the third path) | parallel | ⏳ |
| 10 | the far ramp, ROUND EIGHT — the SHAPE | sub-agent (`spot.ts`, `tools/`) | parallel — no other row touches `spot.ts` | ⏳ |

**ROW 10 — WHY THE TOP IS NOT FLAT, AND WHAT RELEASED IT.** The player's eighth
report, with a reference photo of a municipal concrete bank: *"the top isn't flat
— there's no flat surface. Plus, the corner is folded strangely… think about it
mathematically: a standard default ramp. **Forget that the character pops off
it**; let's just make it a proper shape."* His report is accurate and the geometry
says so: of the 3.4 m shelf behind the coping, **2.1 m is still climbing** (1.5 m
of 24.2° return + 0.6 m of eased crest) and only the last 1.3 m is level — a strip
too narrow, behind a climb too long, to read as a top at all. It reads as the
wedge he photographed.

That climbing return is the LANDING ZONE (`BACK_RETURN`), and it won the argument
in every previous round. **His "forget the pop" retires it.** Its other job —
beating a held push into the brick — is very likely redundant now that
`pushBlocked` landed; the agent verifies that against the code rather than
assuming it.

And the facade constraint runs the FAVOURABLE way for once: a standard bank's deck
is level with the coping at **3.4 m**, which is **0.81 m LOWER** than today's 4.21 m
— so it hands 0.81 m back to the clear-brick band instead of eating it. The
Milestone 11 floating-graffiti defect is the reason previous rounds could not widen
the deck; going flat moves away from it.

**Watch for the shading artefact before believing the shape:** `meshSolid()` pushes
ONE normal per `quad()` from `p0`, so any multi-chord curve renders as constant-
shaded strips. The bright arris in his capture may be that, not geometry — round
seven's face was rebuilt for exactly this reason.

**SHIPPED AND VERIFIED ON THE LIVE BUILD (2026-07-30 ~19:15).** `dev.genex.games/world/skate`.
Director's own captures, not an agent's: desktop sharp at 46 km/h; the DEPLOYED build on a
phone profile (844×390 @ DPR 3, Quality Low) riding at 52 km/h with touch controls up; and a
census of the DEPLOYED build at phone-low reading **85.67 MB total** — matching the lab
number to the byte.

**PHONE MEMORY: 178.85 → 85.67 MB across the milestone. −52%.** Against the platform's
<300 MB broad budget. (The deploy preflight still prints "~1241 MB est., over-budget" — it is
7–14× the live census and appears to price raw asset bytes without seeing tiers, rungs or
caps. Trust the census; the discrepancy is still owed a look.)

⚠️ **THE BOOT WEDGE, AND THE ONE-TOKEN CAUSE.** `look.ts` built the composer target with
`depthTexture: sceneDepth ?? undefined`. `null ?? undefined` is `undefined`; three r185's
`RenderTarget` does `Object.assign({depthTexture: null, …}, options)`, so an explicit
`undefined` OVERWRITES the null default, and the setter's guard `if (current !== null)
current.renderTarget = this` throws on it. `createLookStack` never returns. **`boot()` was
invoked as `void boot()`, so the rejection was discarded — the bar froze with no error, no
message, nothing in flight.** Phone-only because `aoFor()` needs `postLevel === 'full'`,
which only `desktop`/`desktop-high` have — **so `desktop-low`, the weak-MacBook demotion,
was dead too.** Found independently by two lanes. Fixed; and `main.ts` now does
`boot().catch(…)` and writes the failure into the loader's own status line, which is the
change that stops this class of bug costing a night.

⚠️ **TWO MORE SILENT HANGS, closed with deadlines.** `WebGLRenderer.compileAsync` is
`new Promise((resolve) => …)` with **no reject anywhere** — it re-arms a 10 ms timer until
every program reports ready, so a mobile driver that never reports
`COMPLETION_STATUS_KHR` parks the boot at 96% forever, and **the `.catch` around it was never
protection, because nothing ever rejects.** Same shape in `WorkerPool.postMessage` and the
KTX2 transcoder's `onRuntimeInitialized` — and a wedged worker stays marked BUSY, so every
later request queues behind it: one dead transcoder = ~20 promises that never settle =
`dressField`'s `Promise.all` never resolving. Both bounded now (20 s / 30 s) so the existing
fallbacks can fire.

⚠️ **ROW 11 DECLINED ON A THREE DEFECT, NOT ON QUALITY — and it uncovered a live landmine.**
`three.core.js:9231` sets `isRenderTargetTexture = true` on a target's COLOUR textures and
**never on its `depthTexture`**. So the moment a shader samples that depth as an ordinary
uniform, `setTexture2D` is eligible to RE-UPLOAD it: `initTexture` calls
`_gl.createTexture()` and hands the sampler a brand-new object while the framebuffer keeps
writing the old one. Traced with `tools/depth-probe.mjs`: `ATTACH #1` → `RESOLVE writes #1`
(real depth, 0.958 at his feet) → `ALLOC #3` → `BLUR reads #3` (1.0 in all 81 probes) = every
pixel at infinity = full defocus on the whole frame. **The shipped GTAOPass has the identical
latent bug and survives only because its depth texture is DIMENSIONLESS, so the stray upload
FAILS — that is the `GL_INVALID_VALUE: glTexStorage2D` warning this project has been calling
harmless. It was a bug wearing a warning as a disguise.** Four repairs tried and measured,
all rejected on evidence. `distance-blur.ts` restored byte-identical; `look.ts` differs by one
functional line (`renderTarget2.samples = 0`). The prize — a whole scene pass, 163 draws /
1.29 M tri a frame — is still there for whoever can make three hand one `DepthTexture` to both
a framebuffer and a sampler.

**ROW 13 — THE 85 MB WAS THE NPC'S BODY, NOT THE PLAYER'S.** Four load paths, not three:
`loadRig` already capped, `menu-stage` capped twice over (and gated off phone tiers entirely),
the VRM loader has **zero callers**, and the uncapped one is
`meshy-loader` ← `npc.ts:262` — **The Local, the plaza NPC**. New `capRigTextures` in
`texture-cap.ts:240` does the tier lookup itself so no call site assembles it; `npc.ts` caps in
a `.then` before `attach`, i.e. before the image is ever uploaded, and one cap covers every NPC
because they are skeleton-aware clones sharing the materials. **165.67 → 85.67 MB, −48.3%.**
Desktop byte-identical (1723.64 → 1723.65, the 0.01 being vegetation instancing buffers).
*Both GLBs carry ONE image*: `images: 1, textures: 2`, both `{source: 0, sampler: 0}` — one
4096² PNG wired into baseColor AND emissive. No normal, no roughness. *No rung ladder exists
for it*: `@1024`, `@2048`, `.ktx2` and every naming variant probe **404**, and `pickModel`'s
`MODEL_ROLE_RE` does not even match this role — so capping is the fix, not a patch. Verified
by eye at ×14 on the head and in texture space: cap, chest print, pocket stitching, wristband,
trainers all identical; what goes is fabric weave, on a head ~40 px tall.

**ROW 9 — 842.68 MB, 31.9% OF EVERYTHING THE DESKTOP BUILD HOLDS.** New
`src/world/sky/panorama.ts` owns `installPanoramaSky` / `disposeSky`; the two
`scene.background = tex; scene.environment = tex` lines in `field.ts` and
`dressing.ts` are replaced by one call each, so the game now holds the cube and the
PMREM output itself instead of three's WeakMap. Measured, desktop 1280×800 @ DPR 2,
riding: **2640.61 MB → 1797.93 MB** (122→120 textures, 10→4 renderbuffers). Gone: six
4096² cube depth renderbuffers, the PMREM ping-pong twin, and the 8192×4096 source
equirect + 14 mips. **The two buffers that are actually sampled are byte-for-byte the
same size, format and mip count** — that is the whole pixel-identity claim.

*The leak, proved rather than asserted*, across a real map swap (map 2 unparked in an
isolated copy): **before** — after unmounting the street its equirect was still live
*by URL* alongside its 512 MB cube and BOTH 384 MB PMREMs, textures climbing 124→144
while geometry fell 1381→590. **After** — exactly one cube and one PMREM live, no
named equirect at all, and leaving the street gave back 896 MB. Captured riding the
spillway at 51 km/h under its own blue sky: not black, not half-built.

*One correction to three's own docs, found the hard way:* r185 moved every piece of
PMREM generator state onto the instance (`this._blurMaterial`, `this._lodMeshes`), so
`gen.dispose()` cannot reach three's internal generator — the doc comment still claims
otherwise.

**THE MOBILE SKY: OPTIONS 2 AND 3 OVERRULED, WITH NUMBERS — AND THE REAL HOG FOUND.**
Phone-low, landscape 844×390 @ DPR 3: total **178.85 → 165.67 MB**, the entire 13.18 MB
delta being sky. There is nothing left on the rung axis: every phone is already forced
to the phone-low rung, `pickAsset` asks for `@2048` (the lowest that EXISTS — `@1024`
is a probed 404), and `capForPhone` then redraws the decode to **1024×512** before the
GPU sees it. Dropping the PMREM would buy 6.00 MB (3.6%) against every specular
response in the game — and is not a one-line removal, because `field.ts` deliberately
traded hemisphere diffuse DOWN (0.72→0.34) when it took environment UP (0.34→0.50), so
deleting it makes the plaza darker than desktop unless the hemisphere is re-raised in
the same edit. Dropping the background cube would buy 8.00 MB (4.8%) — for the sunset
itself. **Declined both, correctly.**

⚠️ **THE ACTUAL MOBILE PROBLEM, and it is six times the whole sky:** the sky family on
phone-low is now **14.00 MB of 165.67 MB (8.5%)**, while **ONE texture — the uncapped
`rigged-character.glb` 4096² basecolor — is 85.33 MB, 51.5% of everything the phone
holds**, displayed on a body a few hundred pixels tall on a 390 px screen. Two rigs are
fetched and only one is capped: `loadRig` (`rigs.js:393`) and `menu-stage.ts:615` both
cap, a third path does not. Row 13.

⚠️ **A BOOBY TRAP IN OUR OWN MEASUREMENT KIT:** `tools/gpu-audit.mjs` gates on
`waitForSelector('[data-act="play"]')` — a button that sits in the DOM *behind* the
loader from frame one — so it returns instantly and censuses an EMPTY SCENE, reporting
0.00 MB. It does not fail; it silently reports nothing. Three runs were lost to it.
Being fixed; gate on the speed readout instead.

**THE 125 MiB IS SETTLED — MEASURED, NOT ARGUED.** `tools/msaa-resolve.mjs`
(new, director's own): one full-screen triangle into a 4× multisampled RGBA16F
2560×1600 renderbuffer, blitted down exactly the way three's
`updateMultisampleRenderTarget` does, against a plain single-sample target — read
back as RAW HALF BITS and compared as integers, no epsilon (an epsilon answers a
weaker question than the one that was asked). The shader spans the format's awkward
regions deliberately: subnormals below 2⁻¹⁴, HDR values above 1.0, and a per-pixel
hash so no two neighbours share a value and a lazy resolve cannot pass by accident.

**ANGLE Metal / Apple M2 Max: 0 differing components out of 16,384,000.**

So `renderTarget2.samples = 0` is taken — **125 MiB** plus two full-resolution colour
resolves a frame. **Scope, written at the site and here: this settles ONE driver.**
The structural half (no partial pixel coverage anywhere in rt2, so the multisample
buffer holds four identical copies) is machine-independent; the resolve's exactness
is not. Residual risk on a non-conformant GPU is ≤1 ULP of a half in an HDR buffer
that then goes through tone mapping.

**THE DESKTOP FRAME'S REAL SHAPE — the block's geometry is submitted THREE TIMES
a frame.** Shadow pass ~1.31 M tri (~170–250 draws, view-dependent), GTAO normal
prepass 100 draws / 1.29 M tri, the picture itself 109 draws / 1.29 M tri. ≈3.9 M
triangles to draw one frame of a 1.3 M-triangle scene. **Everything shipped so far
on desktop is a MEMORY story; this is where the FPS is**, and both middle and first
passes are attackable. Recorded because it reframes the whole desktop lane.

**ROW 11 (running) — DELETE THE AO NORMAL PREPASS.** The fact that makes it far
safer than it sounds: `GTAOPass._renderOverride` sets `scene.overrideMaterial`, and
**an override material discards normal maps** — so the buffer being filled today
already holds plain GEOMETRIC surface directions, exactly the class of data a depth
buffer can reconstruct. Not an approximation of something richer. Build: hand
`GTAOPass.setGBuffer` a depth texture plus a normal texture made by ONE full-screen
pass, using the accurate 4-tap reconstruction (the naive `cross(dFdx, dFdy)` haloes
every silhouette — that artefact is what would get it rejected).
**The coupling that must be decided, not stumbled into:** the prepass's `DepthTexture`
is handed out as `aoDepth` and **the distance blur borrows it**. Killing the prepass
means the depth comes from the composer, i.e. `renderTarget1.resolveDepthBuffer` goes
back ON — **one MSAA depth resolve per frame, bought with an entire scene geometry
pass.** Good trade, but it partly reverses a ROW 8 item, so it is a decision.
Category (b): ends with the player's eye on four capture pairs — thin rail/fence
against sky, skater silhouette against the far facade, the coping's convex arris,
and ordinary wall-meets-ground contact darkening.

**ROW 12 (queued, BLOCKED on `field.ts`) — CACHE THE STATIC SHADOW MAP.** The sun
never moves and the block never moves; the only genuinely dynamic caster is the
skater. The pass re-renders every frame only because the shadow camera FOLLOWS him.
Three properties make a cached version *provably* identical rather than merely
similar, and all three are required:
1. **Split the casters** — static block into one map, skater into a small one;
   shadowed if either says so, which is what one combined map already computes.
2. **Oversize the static box by a margin and refresh only when he has moved past
   it** — between refreshes the map covers a SUPERSET of what is needed.
3. **Translate by whole texels.** `trackShadow` already snaps to texels; if the grid
   alignment never changes, shadow edges do not move on refresh — no shimmer. Without
   this the refresh is a visible one-frame twitch on every shadow edge in the scene.
Same resolution, same grid, same casters ⇒ same pixels, with the static pass running
once or twice a second instead of sixty times.
**The honest residual risk:** PCF now filters twice and combines, so where the
skater's own shadow overlaps a building's the soft edge can differ by a filter width.
That is the capture to take. **Do NOT "fix" this by pinning the box to the block and
widening it** — the playable area reaches the road and alleys at ±44 m, so a box that
covers everything is coarser texels or a 4096² map, i.e. a graphics regression paid
to buy performance. That is the trap in this item.

**MOBILE DEFAULTS TO LOW — the player's call, implemented by the director.**
*"and i think on mobile it should go Low quality by default"*. `detectTier()`'s
Auto branch now returns `TIERS['phone-low']` for every touch device; the iOS
version and Android GPU-string heuristics are **deleted**, not left unreachable,
along with `androidGpuLooksStrong` and `STRONG_ANDROID_GPU`. Two consequences,
both deliberate and both written at the site: the governor moves knobs WITHIN a
tier and never promotes `phone-low` → `phone`, so this is a ceiling and not a
"boot low and recover"; and `phone-low` carries `frameCap: 30`, live only since
row 5 wired `setFrameCap`, **so every phone on Auto now paces at a steady 30 fps.**
If he wants 60 back at low detail the one-line answer is `frameCap: 60` on that
row, NOT reverting the branch. The honest way to re-earn `phone` is a
promote-on-smooth rung in `governor.ts` reading measured frames — queued, not built.

**ROW 8 — 108 MiB OF DEAD BUFFERS AND 7 DEAD CLEARS A FRAME, and two survey
claims corrected.** Shipped, all category (a): the two GTAO targets lose their
depth renderbuffer (**31.25 MiB**, `look.ts:1035-1036`); the bloom's eleven lose
theirs (**14.31 MiB**, `:1132-1138`); `renderTarget2` loses its 4× multisampled
depth (**62.5 MiB**, `:913` + `:1267-1269`/`:1385`) behind a per-frame parity pin;
and seven dead full-screen clears go (`:1428-1437`). Draws, triangles and programs
are unchanged by construction — nothing here removes a draw.

*The trap was removed rather than handled:* instead of setting `renderer.autoClear`
globally and adding an explicit `clear()` to the governor's post-off bypass, the
flag is scoped to `composer.render` alone with `try/finally`. The bypass never sees
it, and **the change needs nothing from `main.ts`.**

*Stronger than the brief on the bloom's weaker premise:* `FullScreenQuad`'s mesh
sits at window depth **exactly 0** under `OrthographicCamera(-1,1,1,-1,0,1)`, and
the default depth func is LEQUAL — so `0 <= anything` passes with a depth buffer,
and GL specifies the test as always passing without one. The quad passes
unconditionally either way, independent of the clear. Written into the file, with
the "if anyone draws a second thing into a bloom mip this becomes real" warning.

⚠️ **DECLINED, and the reasoning is the model for this whole milestone:
`renderTarget2.samples 4 → 0`, worth 125 MiB — the largest single item on the
list.** The structural half is airtight (every write to rt2 is a viewport-covering
quad, so the multisample buffer provably holds four bit-identical copies per pixel).
The half that cannot be proved from the code is that the DRIVER's resolve of four
identical half-floats returns that value bit-exactly. Every real implementation
does — but that is a driver property, not a code property, so the claim degrades
from *"this buffer is never read"* to *"this reads the same"*, which is the line the
mandate draws. **What settles it:** a ~30-line `tools/` harness rendering one
identical quad into a 4× and a 1× RGBA16F 2560×1600 target and `readPixels`-comparing
them. Settles THIS machine's driver, not every GPU. Director's serialized pass.

⚠️ **TWO SURVEY CLAIMS CORRECTED — keep both, they killed a shipped reason.**
(1) The recon lane declined GTAOPass's redundant copy on the grounds that
`copyMaterial` is `transparent:true` and the Default branch never sets
`blending = NoBlending`. **Stale in three 0.185.1**: `GTAOPass.js:577` DOES set it,
so the copy is an opaque wholesale overwrite of rt2 — which is load-bearing for the
parity pin above. The item stays declined; its stated reason was wrong.
(2) The "sky shaded twice in the GTAO prepass" item rested on the cloud dome
covering every sky pixel. It does not: `clouds.ts:362` builds a spherical cap of
`π*0.55` — 99° from the zenith, i.e. 9° below the horizon — leaving an **81° cone
uncovered**. Whether any depth==1.0 pixel lands in that cone depends on the ground
extent and the camera's pitch limits, in files that lane did not own, and it would
have to hold in every reachable orientation. Declined for want of that proof.

*Owed:* the GL census, deliberately not taken because `main.ts`/`field.ts`/
`dressing.ts` were being written concurrently and a census would have measured their
half-finished state. Expected: **14 fewer renderbuffer allocations at boot** (13
single-sample + 1 multisampled DEPTH_COMPONENT24), **7 fewer clears/frame**, draws
and triangles unchanged, `blitFramebuffer` unchanged.

**ROW 7 — KTX2, AND IT COSTS NO PIXELS AT ALL. Also: the texture rung ladder has
been a no-op on this game's flat imagery from the start.** Measured, not assumed —
every one of these generations is **already 1024×1024 at the original**, and
`@1024`, `@2048` and the bare URL serve the *identical file, byte for byte*. So
the `.ktx2` swap keeps the same 1024², the same 11 mip levels, and changes only
the quantisation: **5.33 MB → 1.33 MB per texture.** ≈37.3 MB off the phone today,
≈61 MB once the graffiti backfill runs. Both phone tiers behave identically.

**THE TRAP THAT WAS NOT IN THE BRIEF AND WOULD HAVE SHIPPED THE LEVEL UPSIDE
DOWN.** `CompressedTexture` sets `flipY = false` in its constructor and it cannot
be changed — three uploads with `compressedTexImage2D`, which `UNPACK_FLIP_Y_WEBGL`
does not touch. Every `TextureLoader` texture here is `flipY = true`. The siblings
carry `KTXorientation: "rd"` and three's `KTX2Loader` **never reads that key** —
there is no orientation handling in it at all. A drop-in swap renders every
compressed texture vertically mirrored: cornices on the floor, spray hung by its
drips. Fixed with the texture matrix (`repeat.y *= -1; offset.y += 1`), applied
after each call site sets its own wrap/repeat, and a no-op on anything uncompressed.

*The lane shipped INERT and the director plumbed it:* the KTX2Loader's only handle
is `gltf.loader.ktx2Loader`, and `field.ts` had `gltf` in scope but passed it only
to `dressFurniture`. Now threaded to `dressMaterials` / `dressFacades` / `dressPaint`
(`field.ts:1107-1121`), with the reason and the sky exclusion written at the call
site. `tsc` 0. Map 2 is parked and still needs the same 3 arguments in
`spillway.ts:220-221` if it is ever revived.

*Desktop identity, four independent reasons:* `ktx2Textures` returns `undefined`
off a phone tier so no `ktx2Load` argument is passed at all; `pickAsset` returns the
bare URL on desktop and the ktx2 branch is guarded by `picked !== url`;
`matchLoaderOrientation` no-ops on anything not a `CompressedTexture`; and the new
`drawn` guard is derived from a budget that is `0` on desktop. All four asserted in
the harness.

*Extra win taken:* `dressPaint` fetched, decoded and held **all 8** graffiti images
regardless of tier, but `buildPaint` drops every piece under the phone budget — the
contest flyposter's 9 placements are ALL under 1.6 m, so a phone built no mesh for
it and held 5.33 MB for a picture nothing sampled. `Painted.drawn[]` skips it.

*Declined with reasons worth keeping:* both skyboxes (as briefed — net +80 MB). Both
chain-link fences, for two independent reasons: the sibling is a live 404 today so
it buys 0 MB, and when the backfill lands it would be an ETC1S alpha slice cut at a
hard `alphaTest` (0.5 / 0.35) through a one-pixel wire lattice — the worst shape in
the level for quantised alpha, and it would switch on **silently**. Documented at
both sites so it gets a capture rather than a surprise. The spray does take the
sibling because those materials blend (`transparent: true`, no `alphaTest`), and the
container's format descriptor was checked for a real alpha slice.

**ROW 6 — THE SHADOW BOX SHRANK, AND IT BOUGHT DRAW CALLS, NOT TRIANGLES. Read
the second half before quoting the first.** `SHADOW_REACH_BY_TIER` (`field.ts:179`)
is `phone: 24`, `phone-low: 18`, applied at `field.ts:543-547` behind
`isPhoneTier`; no desktop row exists, so desktop takes ZERO writes rather than
the same value written again. The snap survives because the change goes the one
route the file sanctions — write `shadowReach`, re-run `setSunBasis`, let
`applyShadowCamera` push it — before the light is built, and `updateMatrices`
re-reads the texel size from `BOX` every frame.

Counted statically over 252 positions on the ride line: **≈49 of the 173 shadow
draws go (−28%), ≈66 on phone-low (−39%)** — but only **4,029 triangles of
1,039,440.**

**That is the finding, and it retires the tidy version of "the shadow map is half
the phone's work".** The million triangles live in ~13 InstancedMeshes the dressed
street furniture becomes, and three culls an InstancedMesh as ONE object against
its whole instance spread — which is the block. **No shadow box can ever touch
them.** The triangle axis is reachable only from `props.ts`'s `instance()`:
spatial clustering, or a shadow-only LOD. That is a queued row, not a done one.

Visible cost: cast shadows past 24 m / 18 m disappear — 5.7 s / 4.3 s ahead of him
at cruise, travelling with him, and the whole band given up is 1.8° of the lens,
~11 css px of a 390 px landscape frame, under the horizon at 9–19% haze. **The one
artefact to look for in a capture:** a terminator where a large raking building
shadow crosses the box boundary. Bonus he does see: the tighter fit is 4.69 cm/texel
against 7.81 (2.4× the texel density), 7.03 against 15.63 on phone-low.

Anisotropy: `ANISOTROPY_PHONE = 4` / `_PHONE_LOW = 2` via `setPropTextureTier`
(`mats.ts:131`), which returns at its first line for any non-phone tier. Not 1
anywhere — this file's own measured note is that isotropic filtering turned the
barricade's chevrons to flat mauve. **Scope caveat:** `mats.ts` is prop clutter
only (128 px wear maps, 512 px print atlas). **The plaza floor's anisotropy is a
separate `8` in `props.ts`** — that is the surface the grazing-angle argument is
actually about, and it is the bigger fish.

*Declined with reasons worth keeping:* PCF radius/taps and dropping the bounce or
hemisphere light (per-fragment ALU only — the phone is not fill-bound, +0.01/−0.03 ms
for quartering the pixels); a smaller shadow map (wrong axis, and it fights the
density win). **Queued, not declined: shadow-map cadence** — `autoUpdate = false`
plus `needsUpdate` every other frame on phone is the real second half of "47% of
the draws from a sun that never moves" and would halve the pass's amortised cost.
It lives on the renderer (`look.ts`/`main.ts`), not in that lane, and it has a real
artefact: the skater's own contact shadow lags ~14 cm at cruise. Needs a capture.

**ROW 5 — WHAT LANDED, and one deliberate player-visible change.**
`detectTier()`'s `if (setting === 'high')` was evaluated BEFORE `isTouchDevice()`,
so **Quality: High on a phone ran the entire desktop chain** — 4× MSAA, a full-res
GTAOPass, a 3072 shadow map, DPR 2, and `isPhoneTier` false, which meant
`capForPhone` returned early and the phone fetched the **un-rung 8192×4096 sky**.
Now `isTouchDevice() ? TIERS.phone : TIERS.desktop` (`tier.ts:244`); the desktop
branch returns the same object it always did. `setFrameCap` was never passed to the
governor, so its last rung called an undefined optional and advanced the ladder for
free — wired at `main.ts:596/:616/:1038` with the skip test inside
`setAnimationLoop` before the delta. The governor could not see stutter: the hitch
branch cleared `slowSince`, so a phone hitching oftener than every 4 s could never
accumulate a step (measured: rung `none` with the EWMA at 13× budget). Fixed with a
SECOND signal — `STUTTER_WINDOW_MS`/`STUTTER_COUNT`, four ≥80 ms hitches in 4 s —
NOT by loosening `budgetMs` or `SLOW_WINDOW_MS`, both untouched. `main.ts` also fed
the governor a delta clamped to 0.1 s, which was silently a second job: no frame
worse than 10 fps was ever reported as worse. `compileAsync` now runs behind the
loader at 0.96 progress, `.catch`-wrapped. A hidden tab now stops the loop.

⚠️ **`phone-low` now paces at a stable 30 fps from boot** — the tier table's own
stated intent, but nothing read that number before today. This is the lane's one
intentional player-visible change.

*Handed on, not in that lane:* there is no `AudioContext` in this game (zero grep
hits) — audio is `HTMLMediaElement` via `src/audio.ts` + `src/audio/element.ts`, and
`audio.duck(true)` hushes but does not pause. **Ducked elements still decode**, so
a hidden tab still pays for them. Belongs to whoever owns `src/audio.ts`.

**STATE AT COMPACTION (2026-07-30 ~15:50) — resume from here.**

*Landed and verified in the tree:* the far ramp rebuilt as a flat 40° panel with a
coping (row 0); `fallLine`, the cross-track half of gravity (row 1); `pushBlocked`,
so a held push cannot drive him into a wall he is flush against (row 3); and four
renderer items — `resolveDepthBuffer=false` on both composer targets, the shadow map
computed once per frame with `needsUpdate` set **above** the governor's post-off
bypass in `look.ts` (that placement is load-bearing — moving it freezes shadows on
the weakest machines), `matrixAutoUpdate=false` on static nodes in `props.ts`, and
GTAO `samples: 8` (was 12). `tsc` exit 0.

*Not yet done:* the workflow's own results; a smoke capture of the final tree; a
preview push; the production push. **Production is deliberately NOT updated** — it
still runs the Milestone 11 build. The dev project IS live with the ramp face and
the fall-line fix but WITHOUT the wall fix or any renderer work:
`https://dev.genex.games/world/skate`.

*The running workflow:* run id `wf_b2383c91-fec`; script at
`~/.claude/projects/-Users-simeonmelnikov-ai-games-CLI-TESTS-skate/2d2b66b7-52b6-499f-af20-aa784cb1730e/workflows/scripts/skate-perf-mobile-desktop-wf_b2383c91-fec.js`;
transcripts under `…/subagents/workflows/wf_b2383c91-fec/`. It carries the two
mandates as a hard rule — **desktop may ship category (a) only** (provably
pixel-identical), **mobile may ship anything** — plus the KTX2 lead below.

*The lead worth not losing:* the KTX2 transcoder is installed
(`public/assets/basis_transcoder.js` + `.wasm`), `createGltfLoader` is wired
(`main.ts:19`, `:466`) and MODELS use it (`props.ts:4322`), but **no texture does** —
every `loadTextureWithFallback` call omits `ktx2Load`: `field.ts:979` (the 8192×4096
sky), `props.ts:1729`/`:1787`/`:2773`/`:4032`, `map2/dressing.ts:353`. Per
`genex-threejs-adaptive-quality`, a `.ktx2` sibling stays compressed on the GPU for
~6× less VRAM **at full resolution** — lossy, so category (b): buildable on mobile,
priced-only on desktop. This is the answer to the player's *"1.7 GB of sky can be
lower without losing quality"*, and it beats the `@4096` rung, which halves
resolution and is visible.

*Measurement discipline that must survive:* a pixel diff **cannot prove** anything
here — the noise floor is **344,163 pixels, 8.40% of the frame**, because
`render/metering.ts` is an asymptotic IIR exposure loop and two runs of the same
build differ by that much. Verify (a) claims structurally plus the GL census. Time
with `--novsync` (the panel is ProMotion; one batch pinned every row at exactly
33.33 ms), interleaved A/B/A/B, with `os.loadavg()` printed. Cold boot is 30–60 s —
assert gameplay from the speed readout before timing anything.

**Row 1 — THE ROOT CAUSE, AND IT IS WHY SIX ROUNDS OF GREEN CHECKS WERE ALL
HONEST.** `fall()` and `stall()` charged gravity from `slopeAlong`, which is a
gradient dotted with ONE direction. Everything the ride could see was
`tan θ · cos φ`, where φ is how far off the fall line he is travelling; the
`sin φ` component had nowhere to go and was silently dropped. **A bank crossed
square was charged in full; the same bank crossed 83° off square read as a
floor.** Every previous round, and both existing ramp harnesses, rode at this
bank with `heading = 0` and never touched the stick — the one case that worked.

The reproduction is **a carve**, which is what a player does at a bank: W held,
stick held 0.5–1.0 through the run-up and up the face, 10–20 m/s, all of
30/60/144 fps. He arrives at the coping 62–87° off square, launches correctly
(80–85°), lands on the return — and then rides *along* it, over the crest, out
onto the level top, and parks against the brick at (±38.00, 4.21, 48.00) at
**0.00 m/s**, having scuffed the wall at 2.2–3.7 m/s. **32 of 432 carved
approaches.** He never comes back down.

It is the same arithmetic that condemned the 11.3° apron in round 5, one
dimension over. `BACK_LIP_ANGLE`'s note records that only above 18.5° does
gravity beat a held push — and the 24.2° return passes that bar *square on
only*: `atan(tan 24.2° · cos φ)` drops under 18.5° at **φ > 41.9°**. Measured at
the failure: **0.98 m/s² of gravity along his line against 5.4 from the push.** A
steeper face moves the angle out (45° fails at 70.5°) and never removes it, so
**no face shape could have fixed this** — which is why row 0 alone was never
going to be enough, and why the fix is in the model.

**The fix: `SkateModel.fallLine()`, the cross-track half of gravity.** One extra
`slopeAlong` probe per `roll()` piece (the travel frame's perpendicular), with
`dψ/dt = a_cross / v` derived in the surface's tangent plane and charged over the
piece's own seconds the way `fall()` is. A board is not a ball and cannot slide
sideways — it swings round, which is why you always come off a transition
pointing down it. Two bounds, **no tuned number**: the rider's own carve rate
(`TURN_RATE · turnFactor`, which also handles the 1/v divergence at a standstill)
and never past the fall line. The term is `sin φ × sin θ`, so it is identically
zero on flat ground and identically zero along a fall line, and it is expressed
in what the surface reports rather than in anything about the shape that is
there today. Verified by the director by reading the implementation, not the
report: the early return on `gc === 0`, the derived rate, both clamps.

**Row 1 numbers, re-run by the director on the final tree:**

| sweep | result |
| ----- | ------ |
| heading ±40°, keys = W | **162/162 good, 0 stranded**, worst launch 86.2°, drift 0.00 m, unasked yaw 0.0°, least hang 0.896 s |
| heading ±40°, Space HELD through the lip | **162/162, 0 stranded**, worst launch 86.3°, least hang 1.035 s |
| heading ±40°, coasting | 162/162, 0 stranded — 60 carve back down with no air (see `stall()`) |
| **the carve sweep** — stick held from the run-up all the way up the face | **220/288 good, STRANDED: 0** (was 16/288 stranded, 32/432 on the finer grid) |
| the spin, actually flown off this lip | **96/96 completed and rode away** (180 needs 0.413 s, 360 needs 0.827 s) |
| deliberate ollie AT the lip (`tap`) | 98/162 — **64 stranded, accepted, see below** |
| forbidden rides | flat ollie apex **1.5872 m** at all three rates; qp square on 14 m/s exit **63.2498°**, apex **3.9476 m** — byte-identical either side |

`collide-sweep` **17/18**, back to baseline · `turn-check` 30/30 · `switch-check`
9/9 · `grind-auto` 8/8 · `back-face` 3/3 · `decal-gap` 90/90 · `tsc` exit 0.

**`collide-sweep` regressed 17/18 → 16/18 on the way, and the CHECK was wrong,
not the fix.** Its steel-landing check asserted an aim by decree — a fixed
heading, coasting 7 m across a floor whose cross-grade is 6.9°, 13.6° and 40.5°
at the three start points. That decree held only *because* gravity was charged
along travel and dropped across it; with the fix the camber bends him 5.3–13.6°
and 0.14–2.2 m off line against a 0.32 m catch radius, so the check had stopped
measuring the steel and started measuring the flume. The director's call was to
make the check steer rather than weaken the fix. It now runs pure pursuit on a
2 m look-ahead (`AIM_GAIN` 3, **ground only** — steering in the air is a spin,
and a controller left running through the ollie would land mid-rotation). Catch
radius, pop distances, ±7° skews, speeds and frame rates all untouched, no
approach dropped: **108/108 lock on**, still **18/18 watched failing** against
deliberately broken code including `meetSteel`'s dropped `probe >= hit.top`
gate, and the worst approach still arrives with 69% of its entry speed against
70% un-steered — so the steering holds the aim and buys no slack.

**ACCEPTED AND OPEN: a deliberate ollie AT the lip lands on the level top,
64/162.** The geometry lane was asked to deepen the sloped landing zone and came
back with a measured refusal, which is the right answer. `BACK_RETURN` has been
sized against a COASTED range since round six, and the pop is what it never saw:
`takeOff` adds the legs' 1.57 m as energy, hang goes to ~1.95 s, and the worst
popped touchdown is **3.40 m past the lip** (17.75 m/s, 144 fps, 20° off square,
apex 12.36 m) against 2.08 m of slope. It is **pre-existing rather than the
panel's doing** — A/B'd on one tree, the old pure 88° arc stranded 60/162 and
the flat panel strands 64/162.

The reason it cannot be bought: the deck's height is DERIVED, and the north
facade has only **0.475 m of clear brick** between the concrete and the string
course at 4.875, with the tags 0.44–0.58 m tall — the band is saturated. Every
metre of landing zone costs 0.45 m of it:

| `BACK_RETURN` | deck y | clear brick | stranded/162 | `decal-gap` |
| --- | --- | --- | --- | --- |
| **1.5 (ships)** | **4.21** | **0.475 m** | **64** | **90/90** |
| 2.0 | 4.435 | 0.440 | 44 | north band FLOATS |
| 2.5 | 4.660 | 0.215 | 35 | north band FLOATS |
| 3.0 | 4.885 | −0.010 | 23 | north band FLOATS |
| 3.4 | 5.065 | −0.190 | **11** | **76/90** — 8 tags floating 0.55 m off the brick, 6 buried |

So the first 22 cm of extra deck already floats paint, and even the full 3.4 m
does not close the defect. Buying it would trade a defect the player has never
mentioned for the exact one he DID report in milestone 11 — *"one piece floating
in the air behind the central ramp"*. Roll-offs are not available either: a bank
from 4.21 m to the plaza needs 4–10 m of run (the qp's are 7 m for a 2.83 m deck)
and the shelf is 3.4 m deep with its ends 38 m away. What actually happens is
survivable and recoverable: he lands on the level top at ~0.1 m/s, rolls 1.3 m,
scuffs the brick at 2.0–5.0 m/s — under `WALL_SLAM`, so **none of the 64 bail** —
and turns round to drop back in, which is the overshoot-onto-the-deck a real
quarter pipe with a deck also has. **The dials that could still close it are all
outside both rows: the pop's own energy at a lip (`takeOff`), a lower
`BACK_HEIGHT` (walks back the player's "make it bigger"), or moving the north
paint band into a window gap (`props.ts`).** Player's call.

**The geometry lane also refuted one of its own claims, which is worth keeping.**
It had justified the fillet by saying a hard 40°→88° crease would be a wall.
`tools/back-face.mjs` showed the opposite: with the height and the lip fixed, the
curl's rise is 2.05× its run, so *shrinking* the kick run shrinks the step in
front of the board (0.42 → 0.05 m improves the worst step climb from 0.265 to
0.235 m). The fillet's real justification is the **pop**: `takeOff` splits speed
on the surface's own tangent, so on a crease every ollie taken on the panel
launches at 40° with 77% of its speed pointed at the brick. The wrong reason is
kept next to the measurement that killed it.

**Also delivered:** `LIP_PROBE` exported from `skate-model.ts` beside
`WALL_PROBE`/`WALL_STEP`; `tools/back-face.mjs` (3/3 — hard probe clearance
0.265 of 0.300 swept out to 52° off square, a **10% margin** on it at 12% clear,
and the face against one `park` tile at 1.08; watched failing at vert
0.20/0.25/0.40 and panel 46°) — the margin check is the one that would have
caught the `BACK_VERT` 0.20 trap at 2%; and the coasted-energy note in `stall()`
(**10.75 m/s at the toe before drag, ~12.1 with it**, 60/162 coasted approaches
never reaching the coping, explicitly labelled not-a-bug).

**Row 0 — what shipped, and it is a BOX RAMP now rather than a curve.** The
20-chord `arc` becomes a composite profile: one straight panel, a short circular
curl, and a sliver of straight vert under the coping. Every number is derived
from the lip angle by `kickOf()`, so a typed panel and a typed lip can never
disagree — and the pure-arc branch is untouched, gated behind `if (p.panel)`, so
`qp` and both alley transitions render exactly as they did (the player has signed
those off; they were not in scope).

| piece | number |
| ----- | ------ |
| flat panel | **40°**, rise 2.4389 m, run 2.907 m — **3.794 m of face as ONE segment, one normal, one tone** |
| | = **77.7%** of the 4.881 m face length and **71.7%** of its height |
| curl | R = 1.1778 m, derived from a 0.42 m kick run, 40° → 88° |
| vert | 0.10 m of straight 88° face under the coping |
| lip | **88.000°** at z = 44.60, y = 3.40 — unchanged from round six |
| toe | z 41.079 → 41.270 (19 cm north, inside the footprint) |
| new | **`back-coping`** — the ramp has NEVER had a coping; see below |

Re-derived by the director from the four inputs rather than read off the
builder's table: R 1.1778, panel rise 2.4389, panel run 2.907, lip 88.000°,
total run 3.330 m, panel 77.7% / 71.7%. All agree.

**The player's "uneven" was a SHADING defect, not geometry, and the panel
removes the cause.** `meshSolid` emits one normal per profile segment (taken from
`p0`), so a 20-chord arc rendered as 20 constant-shaded strips 0.27 m apart
across the full 74 m of width. Against this level's own sun (azimuth 1°,
elevation 22°, read from `field.ts`) the band-to-band N·L step measured 3.1% of
local brightness near the toe, 8.4% mid-face, 11.4% at 55°, and 52% on the last
near-vertical facet. The director confirmed it independently in a cropped
gameplay capture before any code changed: faint tonal bands parallel to the lip,
at the chord spacing. `meshSolid`'s shading was deliberately NOT changed — that
would have altered the quarter pipe and both alleys, which are not in scope.

**Two engine constraints shaped the kick, both measured:**
1. A hard 40°→88° crease **is a wall.** `advance` probes a whole roll step at its
   start height against `WALL_PROBE` 0.30 m, and a step is `LIP_PROBE` 0.12 m
   along the surface = 9.2 cm of ground on a 40° panel — a vertical face 9 cm
   ahead is 0.5 m of climb. Hence a fillet rather than a crease. Worst step climb
   is now 0.265 m of the 0.300 budget, and it is a geometric bound: speed- and
   frame-rate-independent.
2. A tight curl **reads its own launch tangent shallower.** `lipDecision` samples
   1 cm back along the surface, and near vertical the ground advances only
   R·cos θ per radian — 0.6°/cm at the old R 3.52, but 1.9°/cm at R 1.18. The
   first cut (curl straight into the return, no vert) released at 86.0–87.3° and
   threw the worst landing 2.19 m past the lip onto the crest at 0.1 m/s, which
   is round six's brick-ratchet arriving by a new road. `BACK_VERT` = 0.10 m
   fixes it by construction; the swept table 0.03 → 0.20 m is in its comment,
   including why 0.20 is wrong (2% of the probe budget left).

**Why 88° and not the 80° the brief asked for as a floor.** Range is near-linear
in cos θ and cos80°/cos88° = 5.0, so on the same 3.4 m of climb an 80° lip puts
the worst touchdown ~6 m past the lip — onto a 3.4 m shelf, i.e. back into the
brick 6–7 m up, which is what rounds 1–5 were spent on. Bringing an 80° launch
inside the shelf needs ~8 m of ramp height, through the graffiti band.

**THE RAMP HAD NO COPING, and that is most of why it read as a mound.** The
level declared exactly one coping in total, on the quarter pipe; `back-trans` has
never had an edge at its top. The director found this while capturing the "before"
and routed it into row 0 mid-flight. `back-coping` is now derived off the solid
and `COPING_STAND` — never a typed height — with `COPING_CATCH`. Measured
side-effects: clearance 0.03 m < `BOLTED_ON` 0.25 m, so it draws with no posts
and is **not a collider** and cannot eat the launch; line inventory 44 → 45;
"every grind line can be caught" 67 → 68 with the uncatchable list still exactly
the same 43 spillway lines; `grind-auto` **8/8 unchanged** (0 auto-catches with
no key, 0/1159 rolls, 0/450 crossings, 0/1488 hops). It also closes a line the
spot has been owed since milestone 10: a coping grind at the far lip.

**Row 0 numbers, `tools/back-ramp.mjs` before → after:** release angle
87.5–87.8° → 87.9–88.0°; released short of the lip 0–8 mm → 0–3 mm; taught-line
apex 6.12/6.49/6.85 m → 6.14/6.48/6.78 m at 30/60/144 fps; touchdown z
45.03–45.13 → 44.97–45.08, both on `back-return`, both then rolling back DOWN
the face (−2.57…−3.22 → −2.63…−3.28 m/s); furthest touchdown over the whole
8→20 m/s × 3 fps sweep 1.25 m → **1.12 m** past the lip, so 0.38 m of the 1.5 m
landing zone is never used at the worst approach the ride can produce. Wheels
down past the lip, brick events and bails: 0 · 0 · 0, before and after.

`tsc` exit 0 · `decal-gap` 90/90 with 0 muddled pairs (the toe moving north
buried and exposed nothing) · `integration-check` 69/75, the same six documented
reds · `collide-sweep` 16/18, **A/B'd with the row's geometry and coping reverted
and the reds were byte-identical**, so neither is row 0's; one is the documented
43-spillway catchability and the other traces to row 1's in-flight edit.

**Open, carried rather than dropped:** nothing permanently guards the wall-probe
margin (0.265 of 0.300), because computing it needs `LIP_PROBE`, which is
module-private in `skate-model.ts`. Exporting it the way `WALL_PROBE` and
`WALL_STEP` already are buys a ~70-line `tools/back-face.mjs` asserting both the
probe clearance and the face length in tiles. Do it after row 1 lands, so the two
lanes do not write the same file.

### Milestone 11 — THE THIRD LIST (2026-07-30, overnight) — → previewed & PUBLISHED

Shipped to production and live: `https://genex.games/world/skate`
(play origin `https://skate.genex.technology/`, project `cms6hpop500ds2co5sw3n8m1k`,
entry `assets/index-BpqhVOxP.js`). Deployed from the `skate-prod` staging folder
with the production CLI (0.95.0) and `--env ~/.genex/env.prod`; the dev project's
channel and token were not touched.

**Verified on the DEPLOYED bundle, not the local tree:**
- the pop-punk bed `cms6mkm08001422nsjimpzg4s` and its `end: 69.343` are in the
  live entry chunk; the drill bed `cms6kddve002s22msomg32mr0` is gone (0 hits)
- the four new graffiti ids are in it
- the touch layer ships as its own chunk, `skate-touch-layer-Cq8fP-M6.js`, which a
  desktop session never fetches
- **phone-low GPU census: 117.73 MB steady, peak 1.00×** — the caps are visibly
  firing in the table (background cube 512² at 8.00 MB, character texture 1024² at
  5.33 MB)
- **desktop census unchanged**: PEAK 2605.86 MB, first draw 1061.67 MB across 11
  textures, PMREM 768.00, background cube 512.00, character textures still full
  4096² (170.67 MB for two) — the same figures as before the change, so
  `capMaterialTextures` is confirmed a no-op on desktop **on the shipped artifact**

**Both preview preflight warnings resolved, neither dismissed:**
1. *"~1241 MB est. GPU memory on phones — over-budget."* The preflight is a STATIC
   estimator: it reads the asset manifest and assumes full-resolution uploads, so
   it cannot see a decode-time ceiling. The runtime census on the same shipped
   bundle is 117.73 MB, 5.9× under the modern budget. Keep the warning — it is a
   correct tripwire for the day the cap stops firing, and it would be right again
   the moment `capForPhone`/`capMaterialTextures` were bypassed.
2. *"Post stack detected with no devicePixelRatio cap."* Investigated previously
   and again: `phone` already has `dprCap: 1.5`, `phone-low` has `1`, and
   `render/look.ts` sizes its targets from `renderer.getPixelRatio()` — the capped
   value. Corroborated by the census above, whose phone render targets measure
   390×844, not 3× that. The preflight scans text and cannot see through the tier
   table. False positive, twice checked.

Regression at ship: `tsc` 0 · integration-check **69/75** (the same six deferred
reds) · collide-sweep **17/18** (its one documented red) · input-matrix 17/17 ·
grind-auto 8/8 · anim-check 28/29 · decal-gap **90/90** · ragdoll-drop 195/195 ·
joint-range 2/2 · lean 16/16 · stance 8/8 · switch 9/9 · turn 30/30.

He played the milestone-10 build and left five items before going to sleep, with
one instruction about how to work that is different from last time and is the
reason this milestone reads the way it does: *"Can we run with subagents but plz
fully verify by yourself these improvements."* So the lanes are sub-agents as
before, but **verification does not delegate** — the director does the smoke
pass, the pixel diff and the capture, and a lane's own green harness is evidence
for the lane, not for the milestone. He is asleep; there is no critic round and
no question round. Anything ambiguous gets decided, stated here, and built.

| # | The ask | Lane | Parallel? | Owner files | Status |
| --- | --- | --- | --- | --- | --- |
| 0 | **Rail sliding with no button** — *"As soon as you ride onto it, the rail slide starts."* Asked at the end of milestone 10, landed with this batch. | GRIND | parallel — ride model only | `skate/grind.ts`, `skate/skate-model.ts`, `tools/grind-auto.mjs` | ✅ done |
| 1 | **Idle pose in the air.** Riding a ramp with space held, the launch drops him into a standing/idle pose mid-flight. He asked for the flight state instead. | AIR | parallel — anim layer only | `skate/skater-anim.ts`, `skate/anim/*`, `tools/anim-check.mjs` | ✅ done |
| 2 | **The far ramp, third report.** He rides up it and continues FORWARD leaning instead of launching up and falling back. And the top panel is not flat and reads as strange. | RAMP | parallel — map-1 geometry only | `world/spot.ts`, `tools/collide-sweep.mjs` | ✅ done |
| 3 | **Fall realism** — joints twisting all the way through. Explicit praise for what the fall already is; the only defect is anatomy. | DOLL | parallel — ragdoll + fall only | `skate/ragdoll.ts`, `skate/fall/*`, `tools/ragdoll-drop.mjs` | ✅ done |
| 4 | **Graffiti**: one piece floating behind the central ramp — remove it. Plus a few NEW, different pieces generated and put on a wall. | TAG | parallel — dressing + billed generation | `world/props.ts`, genex | ✅ done |
| 5 | **Mobile optimisation + mobile controls**, with desktop graphics frozen. | MOB (perf) + THUMB (controls) | parallel — two lanes, disjoint | `controllers/quality/*`, `render/*` · `controllers/touch/*`, `ui/touch-controls.ts` | ✅ done — pixel gate NOT closed, see below |

**The desktop rule for row 5, in his own words and as the lanes were given it.**
*"It is very important that the desktop graphics are not affected and do not
change at all, because the desktop graphics are currently perfect. This must not
change in any way."* Written as a contract: on a desktop tier the rendered frame
must come out **pixel-identical** — every mobile change lives inside a branch
only `phone-low`/`phone` can enter, the three desktop rows of `TIERS` are frozen,
no shared constant changes value, and it is proven by a PNG diff at a fixed
viewport rather than argued. Zero differing pixels or the change comes out. Same
rule for the touch layer structurally: a desktop session gains no DOM node, no
listener, no pixel — not a hidden overlay, not a `display:none` element.
Note the scope boundary this creates: rows 1–4 change desktop pixels ON PURPOSE
(that is what he asked for), so the pixel-identity gate is scoped to row 5's diff
in isolation, never to the game as a whole.

**Row 0 — automatic rail entry, and the number I had been quoting was wrong.**

The rule is now: `if (this.grind.squareEntry && !this.slideWanted) return false`
in `tryCatchGrind`. Riding onto a line ALONG it takes no key; only the deck laid
SQUARE across a line still waits to be asked, because in this game a
square-across ollie is simultaneously the boardslide entry and the way you hop a
kerb on the way somewhere else, and no geometry separates those two — same
approach, same arc, same frame. `Grinder.squareEntry` is a report, set from the
same `along`/`square` band the candidate loop already uses, exactly like
`crossedAt`. The decline no longer calls `grind.reset()`, because that also
cleared `airPeak` and this branch now fires in ordinary play; it declines the way
the `blocked` and rising-flip branches do.

**I had been saying the E key was holding back 237 false catches out of 576. It
was not, and the harness says so.** `tools/grind-auto.mjs` prints two columns per
section — key up and key held — and the key-held column IS the old behaviour,
since the change only ever adds a refusal. With the key held, straight rolls were
already clean: 0/1111 along a line, 0/432 across one, 0/182 ollies beside one.
What the key was actually buying was **air crossings only** — 82/1432 hops taken
at 65°/90° across a line, plus 19 at 50°. The 237 belonged to round 2's rules
(`if (q.grounded) return null` plus the `crest` test), which are untouched and
still load-bearing: revert them and 205/1111 straight rolls lock on. The lane
proved that by reverting them and watching the sweep go red, which is the only
reason the claim is in this file.

| | before, key up (shipped) | before, key held (= geometry alone) | after, no key |
| --- | --- | --- | --- |
| straight rolls along a line | 0/1111 | 0/1111 | 0/1111 |
| rolls across a line | 0/432 | 0/432 | 0/432 |
| ollie beside a line, outside corridor | 0/182 | 0/182 | 0/182 |
| ollie across a line (65°/90°) to clear it | 0/1432 | 82/1432 | 0/1432 |
| ride onto a line along it (24 lines × 2 ends × 5 angles × 4 speeds) | 960/960 unreachable | 78/960 | 78/960 — identical, line for line |
| same entry at 30/60/144 fps | 144/144 unreachable | 0/144 | 0/144 |
| pop out, 0.2 s watched | — | — | 12/12 on the line, 0 re-catches |

Regressions: integration-check 69/75 (the same documented six), input-matrix
17/17, collide-sweep 16/17 (documented red, all `spillway/*`), ragdoll-drop
195/195, turn 30/30, stance 8/8, switch 9/9, lean 16/16, grind-auto 8/8.
`input-matrix` item 12 asserted the OLD contract and was turned over deliberately.

**One dial left un-turned, on purpose.** 310 of 2158 diagonal hops at 25°/35°
still catch automatically — they sit inside the repo's existing 45° `along` band,
so they are "riding onto it" by the definition the whole file already uses. A
tighter band for automatic entry only would mean the same approach catching with
E but not without, which is two rules pretending to be one. If he ever says *"it
grabs me when I hop diagonally over a kerb"*, the dial is `CATCH.rail.along` /
`CATCH.ledge.along` and grind-auto prints the cost of moving it immediately. The
78/960 unreachable entries are pre-existing and identical with the key held
(dock-edge 25, platform-lip 14, kerb-n-ee 8, kerb-s-ee 7, block-pad-w 7).

Controls copy changed with it, not deleted: `ui/menu.ts` splits the old
`HOLD E — Grind` row into `RIDE ONTO A RAIL — It takes you — no key` and
`HOLD E — …or lay the deck SIDEWAYS across one · a boardslide`; `ui/hud.ts`
`CONTROL_ROWS` reads `Slide across / E`, because a key legend cannot list a skill
that has no key.

**Row 1, ROUND TWO — he played the published build and could not see it.** His
words: *"можешь сказать что ты сделала с airbone стендингом? тк я не вижу изменений
пока."* He was right, and the reason is a sizing error I should have caught before
calling it done.

`AIR_STANCE` was sized against `AIR_SHAPE` — "a little over half way" between 0 and
the big-air tuck. But `AIR_SHAPE` is a SMALL layer: the whole air layer is worth
12.4 cm of hip and the stance took 5.4 of it. The ladder that matters on screen is
**72.2 cm standing → 40.5 cm on the ollie take alone → 20.4 cm on a big popped
air**, so the pose was half of a small layer inside a 32 cm gap. 5 cm of hip on a
1.75 m body at chase-camera distance is not a pose.

**28/38/14 with `STANCE_ON` 0.10 → 0.17 s.** Amplitude and ramp length turned out
to be ONE dial, not two: `anim-check`'s rate bar is 5° of knee on the worst single
frame (half of `Posture.fade`'s 9–10°), and a smoothstep spends ~25% of its travel
on its steepest frame however gently it is eased — so a ramp of N frames carries
about 4N° and a bigger pose can only be bought with more frames. Measured at 60 fps:

| stance | ramp | hips at launch | knee | worst frame | popped ollie |
| --- | --- | --- | --- | --- | --- |
| 16/22/8 (shipped) | 0.10 s | 66.4 cm | 20° | 4.4° | 40.5 cm |
| 22/30/11 | 0.11 s | 63.8 cm | 27° | 5.6° — over | 40.5 cm |
| 24/33/12 | 0.12 s | 62.7 cm | 30° | 5.7° — over | 40.5 cm |
| **28/38/14 (now)** | **0.17 s** | **60.8 cm** | **34°** | **4.7°** | **40.5 cm** |
| 30/41/15 | 0.19 s | 59.7 cm | 37° | 4.6° | 40.5 cm |

30/41 was the other candidate, passed over for arriving 20 ms later and spending the
growth entirely. **The popped ollie is 40.5 cm in every row** — that is the
ownership gate working, and it is why this could be doubled without re-opening the
thing he settled when he said a hop should pull nothing.

**Two checks were re-based, and both are recorded as weakenings rather than fixes.**
`…he is in it from the launch` asked for 70% of the pose at +0.1 s, which was the
right question at a 0.10 s ramp and the wrong one at 0.17 — held as written it caps
the pose at the size he could not see. It now asks +0.2 s and 70%, plus a derived
ceiling (`STANCE_ON < AIR_LOW / 3`) so the bar moves with the ramp instead of being
hard-coded against it; `STANCE_ON` is exported for that. And the DOOR TEST's growth
clause went `> 4` cm to `> 1`: because the layers merge by `max()`, every centimetre
the launch gained came out of the growth, so "deepens as the air proves itself long"
is 7.0 cm → 1.4. All that clause now claims is that `AIR_SHAPE` is not dead, which
its watched failure (0.0 cm) still catches. `anim-check` back to **28/29**, the one
red being the pre-existing manual-opposites finding.

**Row 1 — the air pose, and why nothing was broken.**

Holding Space fires **no pop at all**. The ollie lives on the key coming UP
(`input.ts` `onKeyUp` → `olliePressed`) and `TrickBook.resolve` only takes it
`&& ctx.grounded`, so a launch taken with Space still down never calls
`playTrick`, never starts the ollie take, and has no air performance in it. What
it does instead is park the wind-up crouch, which
`setCharging(grounded && chargeHeld)` releases on the first airborne frame:
`endCharge()` → the parked clip runs out → `resumeRide()`, which is the standing
rolling loop, crossfading in over its own 0.35 s. And `AIR_LOW = 0.95` holds the
size-driven shape at exactly zero, which is HIS OWN condition (an ollie pulls
nothing) and is right. Three correct decisions composing into a rider standing at
attention. Measured: **72.9 cm above his soles with 54° of knee — the flat-roll
numbers to the tenth of a centimetre** — from 0.3 s off the lip until 0.95 s, out
of 0.83–1.33 s of hang.

**There is no unused flight clip.** `public/motion-sets/skate.json` has three
gaits (`idle`, `skateOllie`, `skateKickflipOllie`); `HAND_CLIPS` has
ride/ollie/push/crouch. `animation-library.glb` and `meshy-character.json` do
carry `Jump_Start`/`Jump_Loop`/`Jump_Land` and `Regular_Jump`, but those are the
ON-FOOT controller's — performed with no board, feet together — and this rig
stands the deck ON THE SOLES, so a clip that moves his feet moves the board. Same
reason `POSE_TAKES` are waist-up only. The "flight state" he means is the ride's
own `state === "air"`, which exists and now produces a pose.

The fix is `AIR_STANCE = { tuck: 16, fold: 22, spread: 8 }`, ramped over
`STANCE_ON = 0.10 s`, merged by `max()` per joint with `AIR_SHAPE * lift` and the
grab's posture tuck. **Gated on ownership, not on a clock**: it only fills in when
the rolling loop is what is posing him (`SkaterAnim.ridingStance`). That is why an
ollie still does not look like a tuck — a popped ollie is the ollie take, which
already folds him to 51.1 cm / 112° of knee, and laying degrees on that is the
same tuck twice. Measured with the gate removed, the flat ollie folded a further
9.6 cm and carried 119° of knee against the take's 98°. The two layers cross at
`lift ≈ 0.53` with the same value either side, so a big air grows out of the
stance with no step.

| off the lip, Space held (identical @12/16/20) | before | after |
| --- | --- | --- |
| +0.1 s | 50.5 cm · 105° knee · 62 cm hands | 42.3 · 122° · 71 cm |
| +0.3 s | 71.1 cm · 61° · 48 cm | 64.7 · 81° · 59 cm |
| tallest anywhere in the air | 72.9 cm | 67.6–67.9 cm |
| least-bent knee anywhere | 54° (= the flat roll) | 73–74° |
| flat ollie, popped (control) | 60.7 cm · 112° | 60.7 · 112°, unchanged to the decimal |

`anim-check` 23/25 → **28/29**, four new checks each watched failing against a
stated break. One EXISTING check had to be re-based and it is flagged rather than
quietly moved: the coasted DOOR TEST measured `AIR_SHAPE`'s margin over a body the
new stance had already folded, and went 12.4 → 7.0 cm and RED with nothing about
`AIR_SHAPE` changed. Its `bare` run now zeroes the whole air layer, with a third
run keeping the split visible (5.4 cm stance + 7.0 cm growth).

**A separate real defect was found and deliberately NOT papered over.**
`tools/anim-check.mjs:971` had been driving its MANUAL case with `ride(["KeyE"])`,
stale since the Shift/E swap — so it was measuring the grind key. On `ShiftLeft`
the first manual check goes green (deck 21.7° nose-up, torso 3.6° off rolling).
The second stays red on a real number: `…and the two manuals are opposites` wants
the two torsos within 5° and they are 8.3° apart. Cause: `POSTURES.Manual.lean =
∓26` is a FIXED waist cancel tuned against a fixed 17.2° rake, but
`manualPitch()` now swings the rake with the balance meter (5.2° → 29.2°), so a
fixed cancel is exact at exactly one rake and leaves a residual either side.
Re-tuning ±26 to ≈±32 would land these two cases and be wrong at both ends of the
swing. The real fix is for the waist cancel to track the deck's live rake, which
needs a per-frame signal the posture table does not receive —
`skater-rig.ts`/`skate-model.ts`. **Left open on purpose, not tuned.**

**Follow-up, proposed not planned:** the honest long-term answer to "he should
switch to a flight pose" is an AUTHORED skate flight take with the board under the
feet, not degrees over the rolling stance. Per the standing project finding, a
prop stance cannot come from text-to-motion — it needs `character animate --video`
with real footage. He has shot footage for this project before (`crouch.mov`,
`pre-jump.mov` are in the repo root), so the route exists. Not commissioned; the
degrees layer is what today's assets support.

**Row 2 — the far ramp, round six, and the release was never the problem.**

Answering the actual question first: on the taught line the board is released
CLEANLY, 0–8 mm short of `BACK_LIP_Z`, on the transition's own tangent, and flies
to an apex of 6.1–6.8 m. It is not re-grounded a frame later. Rounds 1–5 were all
looking at the wrong side of the ramp. **The whole defect is on the far side of
the LANDING.**

An 86° lip leaves only cos 86° = 7% of the speed horizontal, so the arc comes
down almost vertically and the wheels keep `(vh + vy·g)/hypot(1,g)` = **0.127 of
the lip speed** on the apron's 11.3° grade. That is under `LANDING_SCRUB`'s flat
0.9 m/s for anything arriving below 7.1 m/s at the lip, so touchdown is **exactly
0.00 m/s**. And 0.00 is under `PUSH_ROLL_MIN` (0.05), which is the hinge: below it
the held throttle stops following `sign(speed)` and follows **`rideSign` — the way
he is FACING, which is the brick.** 5.4 m/s² of push against 11.3°'s 3.33 m/s² of
gravity then ratchets him the whole 3.4 m shelf into the wall. That is his
sentence — "he continues forward, leaning forward" — as arithmetic.

**The arithmetic that condemns the apron was already in this file.**
`BACK_LIP_ANGLE`'s own note works out that only above 18.5° does gravity beat a
held push. It was applied to the 7.9° run-out and never to the apron behind the
lip.

**Why five green checks missed it, which matters more than the fix:** both
`collide-sweep` ramp checks pass `{...EMPTY_INPUT}` — they COAST. Coasting there
is no push, so nothing fails. The taught-line check does hold W, but runs one lap
per frame rate and that lap survived by 0.23–0.33 m/s. And the previous round's
headline claim, "no wall event at any speed", was measured coasting. With the
throttle held: **48 of 363 approaches fire `onWallHit` at 2.02–5.35 m/s at
y = 4.07–4.08**, the apron's own top at the brick. My browser capture was a 49th
sample.

The apron is gone. The shape is now
`arc → coping → return (24.2°, 1.5 m) → eased crest (0.6 m) → FLAT DECK (1.3 m at y 4.21)`,
and the lip goes **86° → 88°**.
- `BACK_RETURN_GRADE` 0.45 (24.2°) does two jobs: it beats the push (6.98 vs
  5.4 m/s², a 1.3× margin) AND hands back 0.31 of the lip speed instead of 0.127,
  so a landing survives the 0.9 m/s scrub outright.
- `BACK_CREST` is eased, and this was measured rather than assumed: the straight
  24.2°→flat arris DID fire, releasing 15 of 363 approaches off the deck edge, 4
  of them onto the brick. `easedRise` drops every junction to 6.4°, under
  `CORNER_HOLD`'s 20.05°.
- 88° is what buys the deck: range is near-linear in cos θ, so the furthest
  touchdown moves 2.30 m → 1.25 m past the lip, freeing 1.2 m of the 3.4 m shelf
  for concrete you can stand on. The toe moves 12.6 cm north (smaller footprint);
  `2gH` and the 13 m/s floor unchanged.

| | before | after |
| --- | --- | --- |
| throttle-held sweep (363 approaches) | 48 on the brick | **0** |
| least roll-back at the top | 0.00 m/s | **3.08 m/s** |
| taught line, furthest north on wheels | 45.38–45.59 | 45.03–45.13 (2.87–2.97 m off the brick) |
| taught-line landing speed | −0.23…−0.33 | **−2.57…−3.22** (rolls back down fakie) |
| worst clearance off the brick, coasting | 1.72 m | **2.48 m** |
| popped/yawed brick touches (2520) | 519, hardest 7.22 | 154, hardest 7.76 — still no ragdoll |
| bails at the ramp | 0 | **0** |

`collide-sweep` 16/17 → 17/18: a new check *"the same ramp with the THROTTLE HELD
hands the board back — 363 approaches"*, watched failing on the original geometry
at exactly 48/363.

What he sees looking north from the plaza: 3.5 m of curve rising to near-vertical,
a hard coping arris at 3.40 m, a short 24.2° kick behind it, then 1.3 m of LEVEL
deck at 4.21 m against the graffiti. The pale wedge is gone. The deck sits above
plaza eye height, so from the ground he reads curve + coping; the deck reads when
he is in the air over it — which is where the "top panel" complaint came from.

**Proposed, not done:** a steel coping grind line at that lip. It would read
beautifully, but it adds a 44th line to the already-red "every grind line can be
caught" check and the catch behaviour lives in `grind.ts`. Held for a later pass.

**A seventh red appeared tonight, I called it pre-existing, and it was not.**
Worth writing down because three of us got it wrong in sequence. The RAMP lane saw
`integration-check` at 68/75 with an extra red — *"no bone reverses in a single
frame — worst 129.2°"* — restored its own geometry, re-ran, got byte-identical
output, and correctly concluded the red was not its change. The TAG lane saw the
same 68/75 and attributed it to the RAMP lane's territory. I then relayed to the
DOLL lane that the harness had been flagging its bug all along, and drew a lesson
about unowned red checks.

The DOLL lane A/B'd it properly: strip its two new stops and `integration-check`
is **69/75 with that check GREEN at 41.5–41.9°**; its first draft of the stops made
it 68/75 at 129.2°. The 129.2° everyone was reading was its own mid-edit tree. It
is now green at 99.9° and the count is back to **69/75 with the same six reds** —
nobody changed which six.

So the real lesson is the opposite of the one I drew, and it is worse: **every
instrument was GREEN over exactly the defect the player described.** `ragdoll-drop`
read 0–5° of `bend` across all 195 rows. Two reasons, both structural: `bend`
measures one of a joint's three degrees of freedom and `signedAngle` projects the
out-of-plane component away before measuring — `integration-check` even admitted
this on the line beside its own ("a 150° hinge limit bounds the in-plane component
only, so this bar is loose on purpose") while its own reading was 171.5° against a
150° limit — and **nothing anywhere measured twist at all**, because a bone rolling
about its own length does not change where the bone points, so every existing
column is blind to it by construction. A red check nobody owns is a problem. A
green check measuring one axis of three is a worse one.

**Row 4 — he spotted one floating tag. There were 26 bad placements out of 86.**

His piece is `tag-qp-deck`: laid at the quarter-pipe deck's HEIGHT (y 2.834) but at
z 31.2, which is out over the third segment of the landing bank where the concrete
has already fallen to 0.45 m. A 3.2 m tag hanging **2.650 m in the air** behind the
ramp. It was also structurally impossible as written — the deck is 2.8 m deep and a
3.2 m square turned 0.55 rad reaches 2.20 m from its centre. Now 2.1 m at 0.3 rad,
centred on the deck solid's own `cz` rather than a typed z.

The audit that found the other 25 is new: `tools/decal-gap.mjs` marches out of every
sample point on all 90 quads and reports signed gap, occlusion, and — added after
four of its own fixes landed on top of existing pieces — **decal-vs-decal overlap**.
Summary of what was wrong: 5 pieces fully or 80%+ BURIED behind the back bank or a
hoarding; 6 more 40% buried; 4 plaza-floor tags under the QP toe, a roll-off, a
block ramp or a mailbox; 2 FLOATING over the sunken road (+0.344 m) and the east
driveway apron (+0.186 m); and — only visible once the overlap check existed — two
flyposter pairs printed **100% inside** a 5.6 m burner, invisible, and green on
every previous check. One 7% layering is left deliberately at the facade 2/4 seam,
because writers do paint over each other.

`tools/spot-map.html` would have caught his piece. Nobody ran it, because it needs a
browser and a human — and its 1 m search window printed a 2.65 m float as `—`. That
is the actual lesson: a checker that needs a person is a checker that reports
nothing.

**Root cause, for the third time in this file: a solid moved and the paint didn't.**
Nobody typed a wrong number. The concrete met the north wall at 2.76 m when the band
was authored, 4.07 m when the audit ran, and **4.30 m by the time it finished** —
because the RAMP lane replaced `back-apron` with `back-return` + `back-deck` mid-flight.
So facade 0's band now reads the concrete's own height through a new
`frontFill()`/`onWallOver()` helper, the same discipline as `facadeFront`, and the
next re-cut moves the paint with it. That wall has only **0.475 m** of clear brick
left (deck 4.30 → string course 4.875), so it is eight tags now; the four burners
moved up to the four widest gaps in the 7.4–8.3 m window and the two portrait
posters went to facades 4/5.

**The four new pieces**, all `image --transparent`, wired as arts 4–7, all `onWall`,
all measured at gap 0.052 m, 0% occluded, 0% off-end:

| art | id | where |
| --- | --- | --- |
| 4 roller blockbuster | `cms6och8p000k22mznd8o90ff` | facade 2, west wall, z 7.3, 3.2 × 1.93 m |
| 5 character piece (skull mascot) | `cms6or64b000922o7a7m72ch2` | facade 2, z 10.6, 1.7 × 1.82 m |
| 6 chrome hand-style + drips | `cms6ocxl4000n22mzim4rrr7j` | facade 3, east wall, z −6, 2.6 × 2.06 m |
| 7 hollow outline | `cms6p3ojf000g22o7t5eu9a0j` | facade 1, south wall, x 17, 3.47 × 1.24 m |

Every height caps at 2.49 m: that is the fascia signs, and at `BAY_PITCH` 4.7 there
is no 3 m span of clear ground-floor wall anywhere in the level.

**Five generations were rejected, and the two interesting ones are prompt lessons.**
Three failed on a flag error (`--aspect 16:9` is invalid; `--transparent` also refuses
`--size`, so transparent decals are square-only). Then: character v1 was rejected by
`npx genex ui trim` at **6.3% rim speckle against a 2% limit** — a damaged cutout,
caused by the prompt asking for "overspray haze at the edges"; the retake with hard
edges came back 0.00%. And hollow v1 passed the cutout gate and failed on the PAINT:
**65.8% of its inked pixels under 50% opacity**, because "the wall showing through
every letter" was read as literal transparency. The retake is 96.7% of ink at ≥78%,
in family with the originals (87.1%, 89.6%). Both are the same shape of error as the
music lesson: a word describing an EFFECT gets executed as a channel value.

A new `PAINT_WINDOW` table gives each new image its alpha-measured UV crop, so `w`/`h`
now mean metres of PAINT and each piece renders at its own aspect instead of a square
stretched into a letterbox. Arts 0–3 are deliberately untouched — fifty placements
were sized against their stretch.

Cost: 8 graffiti textures instead of 4 — +4 draw calls, ~+16 MB at the full rung,
tier-reduced on phones. Noted against row 5's budget.

**Two things left on the table, both mine to decide, both deliberately not done:**
facade 0's entire ground floor is now dead geometry behind 4.3 m of concrete —
plinth, 15 bays of shutters and glass, fascia signs, drainpipes, grime veil — free
draw calls for the taking, and outside a graffiti brief. And the chrome hand-style is
the nearest cousin of existing art 0 (also a silver chrome throw-up); the drips and
the crossed-out tag distinguish it, but it is the least "new in kind" of the four and
is the one to re-roll if he says so.

**Row 3 — the fall's joints. New instrument first, then the envelope.**

`tools/joint-range.mjs` (new, and a real gate — two pass marks, both watched
failing, non-zero exit): 300 falls, 60 cases × 30/45/60/90/144 fps, and per joint
per frame it records flexion about the rig's OWN hinge axis, out-of-plane
deviation, roll off the bind pose, and the settled pose separately. Joint frames
are derived independently from `Skeleton.boneInverses`; only the envelope numbers
and the name→role map come from `ragdoll.ts` (new exports `JOINT_LIMITS`,
`classifyBone`). Two bugs in the instrument itself were found and fixed before it
was trusted — radians printed as degrees, and a roll decomposition reading hundreds
of degrees out of pure swing.

| joint | before — hyper / fold / abd / roll | after |
| --- | --- | --- |
| LeftLeg (knee) | 172.3° / 179.2° / 88.1° / 138.4° | **5.0° / 150.1° / 18.9° / 39.6°** |
| RightLeg (knee) | 177.1° / 178.9° / 93.8° / 179.9° | **5.0° / 150.6° / 19.4° / 31.5°** |
| LeftForeArm (elbow) | 169.2° / 176.2° / 89.1° / 179.9° | **5.0° / 150.0° / 28.8° / 90.0°** |
| RightForeArm (elbow) | 126.1° / 172.2° / 88.5° / 179.1° | **5.0° / 150.1° / 26.9° / 90.0°** |
| hips (roll) | 179.7° / 179.9° | 50.0° |
| ankles (roll) | 162.1° / 180.0° | 25.0° / 26.5° |
| shoulders (roll) | 155.6° / 145.6° | 100.5° / 95.0° |
| clavicles (roll) | 139.9° / 151.0° | 45.0° |
| spine 01/02 (roll) | 179.7° / 133.0° | 35.0° |
| neck (roll) | 112.7° | 55.0° |

Joint-frames outside range **21.02% → 3.37%**; worst excursion **172.1° → 24.6°**
past. And the number that matters most for how it reads, because it is the pose he
lies in and looks at: **at rest, worst 139.4° past → 0.15° past.**

Every limit is measured off THIS rig's bind pose, not an assumed T-pose — the
standing project finding about Meshy rigs not sharing a rest frame applies directly.
Facing measured off the soles: `(0.01, 0.00, 1.00)`, checked rather than assumed.
The hinge axis is `u × w` where the bind fold is deep enough to trust and the body's
lateral line where it is not, **because it differs per joint on this rig**: the knee
rests at 11.3° of bend and its `u × w` lands 22.9° off the hip-to-hip line, so the
rolling stance's 43° of knee bend reads as 18.2° of SIDEWAYS knee against `u × w`
and 0.1° against the lateral line. The elbow is the other way round. Every stop is
widened per bail to admit the capture pose (`ENTRY_SLACK`) so entry violation is
zero, and the rolling stance measures inside every envelope already, so no stop ever
fires on a body that is merely riding. The clavicle is 45° rather than an anatomical
20° for a stated reason: the get-up take and the ride clip roll this rig's
collarbones 39° and 35°, and a stop tighter than the rig's own animation is a second
animator.

Implementation notes worth keeping: the missing axis was **abduction on the hinges**,
and that is also why hyperextension could reach 177° — once the shin leaves the
hinge plane both projections go tiny, the fold reads as nothing, and the in-plane
stop silently stops acting. Holding the plane is what keeps the angle measurable.
Hinges are deliberately unrationed (`LIMIT_TURN_RATE` exists to break the `frame`
limits' feedback loop through the pelvis particles; a hinge has no such loop) and
bounded by `capTurn` instead. The roll stop lives in `deltaOf` because a single-child
bone's roll is not in the particle cloud at all, and it rotates the bone about its
own length so bone directions and joint positions come out bit-identical.

**Three fixes were built, measured, and reverted, each recorded in the file with its
number** — this is the part worth keeping: solving roll from the child's hinge took
knee out-of-plane 19.2° → 13.1° but cost a 179.0° single-frame roll flip;
unwrapping the roll reading made it 157.0° and stretched bones 2.364 mm;
accumulating roll per frame reproduced the original defect laundered as holonomy,
caught at 179.9° of thigh. A fourth — a second clamp on the drawn pose after the
slerp — desynchronised `bone.quaternion` from `poseWorld` and was the source of that
2.364 mm stretch.

**Violence unchanged, which was the constraint** (*"it already looks cool"*). Over
170 matched rows: settle +3.3%, travel +1.6%, speed retained at 0.34 s +0.1%,
limb°/frame +0.5%, turn/s +0.2%, hardest impact −0.9%, fastest particle 0. The only
figure over 5% is `held°` over 0.1 s, and it went **UP** (+5.4%) — more limb motion
per tenth of a second, not less. One number got worse and nothing asserts on it: max
world-quaternion turn per frame 24.9° → 43.1°, the roll stop's own correction
becoming visible.

**The honest gap, in the lane's own words rather than mine:** there is no input
layer under any ragdoll row — the ride hands the fall exactly two things, the
`start()` velocity and the `observe()` bone history, and both are swept hard (0→30
m/s past `SEED_MAX`, spin both ways, drops to 4 m, four surfaces including steel, 18
real locations, five frame rates). But **every row captures from the rolling
stance**, because that is the pre-roll clip. A bail out of a grab, a grind, or
mid-flip captures a different pose, and the capture pose is exactly what
`ENTRY_SLACK` opens the stops against. So "the stops hold from a rolling entry" is
measured; "they open cleanly from a held-move entry" is argued. Closing it needs the
four pose takes in the pre-roll, which belongs to `src/skate/anim/`. Written into the
harness header, not just here.

Follow-up available: `integration-check`'s fold-shut line is no longer "loose on
purpose" and could be tightened from 180° to ~155° so it bites.

**Row 5a — the desktop pixel gate is NOT closed, and that is the first thing to
say about this row.**

I set the gate as "zero differing pixels or the change comes out", and told the
player's own rule to two lanes. It cannot be met with the instruments available,
and both lanes and I reached that independently by different methods.

Early in the night I measured a **0/1024000** noise floor — two independent
browser launches of the same build, same viewport, byte-identical — and said the
gate was real. **It was not; that zero was luck on an idle machine.** Proof, run
later on the same untouched baseline tree: **111,129 differing pixels against
itself.** So the determinism was never a property of the build.

The full control matrix, 1280×800, tolerance 0, `tools/png-diff.mjs`:

| | differing px | mean Δ |
| --- | --- | --- |
| baseline tree vs **itself** | 111,129 | 0.63 |
| row-5-reverted tree vs **itself** | 114,717 | 0.66 |
| full tree vs **itself** | 117,334 | 0.75 |
| **row-5-reverted vs full — the gate** | **115,101** | **0.68** |
| the same gate at 1920×1080 | 209,871 (10.1%) | 0.59 |
| the same gate at 2560×1440 | 492,359 (13.4%) | 0.73 |
| the same gate, title screen | 24,703 (2.4%) | 0.038 |

The gate diff sits **inside** the spread of same-tree runs. The MOB lane's own
harness (`tools/desktop-pixel-guard.mjs` — faked page clock, `gl.readPixels` off
the real back buffer at 2560×1600, no compositor) got a 309,445-pixel noise floor
and a 305,020-pixel gate: same verdict, opposite method. Its menu-stage canvas
came back exactly **0/1218336**.

**Why, measured:** `src/render/metering.ts` is a per-frame auto-exposure feedback
loop that converges asymptotically and therefore never bit-exactly, and the
residual is a fine speckle on high-contrast edges — facade windows, tree
canopies, the skater's silhouette — with flat ground bit-identical. That is an
exposure signature, not a scene in a different state. Closing it needs the meter
pinned for the duration of a capture, which is debug-only code in the game and
barred by AGENTS.md rule 16. **Do not "fix" this by adding a freeze flag.**

So the row was accepted on exact evidence of a different kind, all of it
reproducible:
1. **The desktop GPU census is byte-identical** before and after — every
   category row, `PEAK live total 2605.86 MB`, `first draw 1061.67 MB resident
   (11 textures)`. Only network timestamps differ.
2. `window.__GENEX_QUALITY__` identical at the end of both runs:
   `{tex:113, geo:348, step:0, rung:"none", ms:16}`.
3. **Structural**: the three desktop `TIERS` rows are not edited, no shared
   constant changed value, and both new shared-path calls (`capForPhone`,
   `capMaterialTextures`) return their argument untouched unless
   `isPhoneTier(tier)` — which is name-tested, so a desktop tier cannot reach the
   branch by construction.
4. **The touch layer costs desktop nothing, measured**: DOM element count
   217 → 217, listener count 138 → 138, same structural document hash, in both
   cold- and warm-cache boots. The layer is its own vite chunk
   (`skate-touch-layer`, 12.25 kB) reached only through an `await import()` below
   the gate, and a desktop session never fetches it — `grep OLLIE` on the entry
   chunk returns 0.

**Row 5b — the memory. DESIGN.md's ~1156 MB figure was wrong in both directions,
and the real problem was never in the tier table.**

`tools/gpu-audit.mjs` had a **6× undercount** hiding the biggest item: on the
mutable upload path all six cube faces collapsed into one record whose level-0
branch reset the byte count. Corrected, the phone total before any change was
**279.23 MB (phone-low) / 298.59 MB (phone)** — not 1156.

The root cause, which nobody had named: **`scene.background = <equirect texture>`
is not a sample, it is a conversion.** three's `WebGLEnvironments.getCube` builds
a `WebGLCubeRenderTarget(image.height)` — six mipped faces plus a depth
renderbuffer per face — while `scene.environment` sends the same texture through
`PMREMGenerator` (RGBA16F, ×2 because the blur target is never freed). Both are
quadratic in the decoded image and **neither is reachable from the tier table**.
The sky came to **108.67 MB, 39% of everything a phone holds, for a strip of haze
along the top of the frame.**

The rung ladder was probed first and is a dead end: `skybox-equirect@1024` and
`@512` are 404, and `rigged-character.glb@1024`, `@1024.ktx2` and the role
`character-rigged-glb` are all 404 — the two largest textures in the game have no
smaller URL, and `loadTextureWithFallback` would serve the 8192×4096 original,
worse than nothing. So the cut is a **decode-time ceiling**, phone-gated, in new
`src/controllers/quality/texture-cap.ts`:
`PHONE_PANORAMA_MAX_WIDTH = 1024` (equirect 10.67→2.80, PMREM 48.00→12.00,
background cube 32.00→8.00, cube depth 18.00→4.50), plus
`capMaterialTextures` on the player's rig in `src/motion/rigs.js` — one
4096×4096 uncompressed sRGB texture, **85.33 MB with mips, the largest single
allocation in the game**, which bypassed every rung because `loadRig` builds its
own `GLTFLoader`.

| | phone-low | phone |
| --- | --- | --- |
| before | 279.23 MB | 298.59 MB |
| after the sky cap | 197.73 MB | 217.09 MB |
| **after the rig cap too (shipped)** | **117.73 MB** | **~137 MB** |

Against <700 MB that is **5.9× under**; against a broad-phone <300 MB it is 2.5×
under. Reproduced twice on phone-low. **No `TIERS` row changed at all** — not even
the phone rows. Three tier-table knobs were priced and declined with numbers:
phone `dprCap` 1.5→1.25 recovers 4.7 MB (2%) for the most visible knob in the
game; `postLevel` phone→off recovers ~12 MB and costs the entire grade;
`shadowMapSize` 1024→512 recovers 2.25 MB (1%).

**Boot peak: on phones the peak IS the steady state, 1.00×** — at the first draw
call only 19.83 MB (phone-low) / 24.15 MB (phone) is resident across 7 textures,
because the world is dressed inside `Promise.all([boardJob, skaterJob, dressJob])`
before the loader hides. Nothing streams in behind the first frame, so there is no
spike above the steady state for iOS to kill.

`governor.ts` was **not** changed — the 36.83 ms budget and the vsync-dead-zone
reasoning stand. Two things learned about it: on `phone-low` the ladder's last
rung is a no-op (`framecap-30` on a tier whose `frameCap` is already 30), so the
weakest tier has five effective rungs; and the earliest possible step-down there
is ~12 s, which is fine for thermal rescue and useless against a jetsam kill —
which is why the memory table was the deliverable and not the frame time.

**Row 5c — mobile controls.** Left thumb is one two-axis stick, because the
keyboard's push/brake/carve are one four-key cluster under one hand: +y presses
`KeyW` through a hysteresis gate (engage 0.45, release 0.30 — a bare threshold
chatters and **every chatter is a fresh push edge**, which would silently eat the
pop of anyone holding OLLIE), −y presses `KeyS`, x is the analogue carve. Static,
not floating: a carve is a multi-second precise hold against the balance gauge and
a re-anchoring centre throws away the thumb's only reference. Right thumb is four
controls — OLLIE (1.5× everything else, in the corner at the thumb's home), FLIP,
GRAB, MANUAL — and four is an **area budget, not taste**: the comfortable
quarter-annulus at r = 55…190 px is 25,970 px², and one 104 px cap plus three
72 px caps is 26,368 px². A fifth needs r > 220, which is a hand-shift. So the
phone has no heelflip, shove-it, nose manual or slide-across; every VERB survives
and only second flavours are gone. PAUSE and RESET sit outside both arcs. Camera
is deliberately not in this layer — `FollowCamera` already orbits on a one-finger
canvas drag, and a second drag surface is exactly the twisted-diagonals bug.

Direction contract traced end to end and measured on the real model: stick right →
**+4.33 m** along screen-right in 1 s, stick left → **−4.30 m**, mirror spread
0.029 m; and **a stick at +1 lands him in the same place as `KeyD` held to
0.00e+0 m** after 1 s of carve, because the stick feeds the existing ramp as a
target rather than getting a second, faster path.

**Row 5d — a real desktop bug the touch lane found on the UNPATCHED build, now
fixed.** `#ui` (the menu root) is `position: fixed; inset: 0; z-index: 15` and
stays `display: block` for the whole of play, with `pointer-events: auto`. The
screens inside toggle their own pointer-events; the root never did. So it was a
transparent lid over the entire game, above the HUD (which has no z-index of its
own) and above the canvas. Desktop hid it for months because during play the
pointer is LOCKED and a lock bypasses hit-testing — but `hud.wantsCursor` frees
the cursor for the round-end card, and measured on the pre-fix build,
`elementFromPoint` returned `DIV#ui` at the screen centre, over the canvas, and
**at the spot where GO AGAIN and FREE RIDE sit**. Those two buttons were very
probably unclickable since milestone 10 shipped them. On a phone there is no lock
at all, which is why the touch widgets were completely dead until the lane worked
it out. Fix is one declaration on the root; `#ui .screen.is-on` already sets
`pointer-events: auto`, so the menus keep their own permission. Verified DROP IN
still starts the game after the change. **Not verified: clicking GO AGAIN on a
real round-end card** — that needs a completed run and I did not get one; the
mechanism is unambiguous but the click itself is untested.

**Two findings deliberately left alone, both his call:**
1. **The desktop tier holds 2.6 GB**, and the sky is 1738.67 MB of it (PMREM
   768.00 as 2 × 6144×8192 RGBA16F, background cube 512.00, six 4096² depth
   renderbuffers ~288, equirect 170.67). Fine on unified-memory Macs, a coin flip
   on a 2–4 GB discrete GPU. Dropping the desktop skybox to the `@4096` rung takes
   those four rows to ~434.67 MB — **−1.3 GB** — at the cost of a softer sky. Any
   version of this changes desktop pixels, which he has frozen, so it is not mine
   to take.
2. **A real GL error at boot on the desktop path**:
   `GL_INVALID_VALUE: glTexStorage2D: Texture dimensions must all be greater than
   zero`. Something allocates a zero-dimension texture; it is what put a `NaN` in
   the census total (a zero-area level 0 divides by zero when `generateMipmap`
   derives bytes-per-texel). Present in my own console dumps too, so it is real and
   not the audit's. Not phone-reproducible. Unfixed, unattributed.

**Carried in from the end of milestone 10, so it is written down somewhere other
than a conversation that has already been compacted twice:**

- **`Box3.setFromObject` is wrong on a `SkinnedMesh`, and that is what made the
  menu show a pair of giant sneakers.** It calls `updateWorldMatrix`, which
  `SkinnedMesh` does not override; only `updateMatrixWorld` keeps
  `bindMatrixInverse == matrixWorld⁻¹`. `SkeletonUtils.clone` resets
  `bindMatrixInverse` to identity, which exposed an `Armature` node sitting at
  `scale 0.010` — so the measurement, not the scale, was the bug. `measureBody()`
  in `ui/menu-stage.ts` now runs `updateMatrixWorld(true)`, clears the cached
  skinned `boundingBox`, plays the idle clip and `mixer.update(0)` before
  measuring (bind pose ≠ ride pose), and caches the result. A second hazard was
  found in the same walk and is fixed there too: `unwrap()` descends unnamed
  single-child `Group`s and STOPS at the first named node, so the `Armature`'s
  meaningful 0.010 survives while a switch-stance yaw parked on an intermediate
  group gets reset. No mirror; `BODY_YAW` untouched.
  Milestone 10 row 11 is still ❌ — the picker degrade and the character's move
  left were never built, only this measurement bug was.
- **Music: 46 candidates generated over the evening, 2 kept, 44 cancelled.** The
  gameplay bed is `cms6mkm08001422nsjimpzg4s` (urban emo pop-punk over hip hop
  drums, his pick, *"take this plz!!!"*). Map 2 still runs its original
  skate-punk and was not re-cast. Every other candidate from that session is
  **cancelled** — not held for map 2, not parked as `proposed`. The reason to
  write the count down rather than the list: what the session actually produced
  was two measurement results, and those are in `audio/catalog.ts`.
- **Two prompt lessons from that batch, both measured, both against my own
  instinct.** Loudness cannot be prompted (established earlier: "loud" came back
  5 dB quieter). And *detail* cannot either — my elaborate BPM/instrumentation
  prompts pushed 4 of 4 drill tracks over 0 dBFS, while his own three-word
  *"drill chicago beat"* clipped 1 of 3. His instruction — *"забей на bpm генери
  как я пишу"* — measurably improved the output, so short prompts are the house
  style for music now.
- **Periodicity tracks genre, and my prediction was wrong.** Measured over all 46:
  boom bap / pop-punk 0.43 (best), folk 0.19–0.38, psych rock 0.14–0.23,
  scratch-trap 0.03–0.21 (worst — a scratch is a non-repeating gesture, so it
  destroys periodicity). I predicted folk would loop worse than rock; it loops
  better.
- **The rendered crossfade beats correlation for choosing a loop window**, on two
  independent tracks now. Correlation finds a matching INSTANT; the listener hears
  300 ms. On the pop-punk bed the correlation-preferred window (L = 60.069 s)
  renders at 3.15 dB mean / 8.70 dB worst — above the groove's own 5.77 dB swing,
  i.e. audible — while the chosen window (L = 66.088 s) renders at 0.38 / 0.93
  with a join correlation of **−0.04**. What the render CANNOT see is harmony: it
  knows level and nothing else, so "no seam artifact" is not "the chord makes
  sense". `tools/loop-window.mjs` decides this in one run.
- **Phone GPU memory was never measured** before the production migration —
  ~1156 MB against a <700 MB budget is a stale figure. He chose to ship without
  it (*"Нет, переносим без этого"*). Row 5 of this milestone is where it finally
  gets measured.

### Milestone 10 — THE SECOND LIST (2026-07-29, same session) — previewed, partial

He played the milestone-9 build and wrote out ten more items, then kept adding
to them in chat as he tested. Working mode is unchanged: **focused change,
parallel sub-agents, he is the critic.** Same instruction — *"Fun sabagents to
comlete this tasks plz"* — so every disjoint row is a sub-agent and the director
keeps integration, `main.ts`, `index.html`, and all `genex` calls.

| # | The ask | Lane | Parallel? | Owner files | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | **The Local is NPC-only.** Out of the picker, into the plaza. Girl rigged as a playable body. | director | serial — casting + billed generation | `main.ts`, `world/npc.ts` | ✅ swap done · girl BLOCKED (below) |
| 2 | **Regenerate the idles** for both bodies. | director | serial — billed | genex | ⏳ 2 clips queued |
| 3 | **The back wall, again.** The ramp launches him forward into brick; the wall is solid from one side only; he still goes through. | W | parallel — map-1 layout only | `world/spot.ts`, `tools/collide-sweep.mjs` | ✅ done — the angle was never the bug |
| 4 | **Talk to the NPC on a key press**, with a quest card, in the new font. | N | parallel — its own new UI file | `world/npc.ts`, `ui/dialogue.ts` | ✅ done — key **T** |
| 5 | **Round-end screen** with RETRY / FREE RIDE, arrows + mouse, polished. | R | parallel — HUD + run rule | `ui/hud.ts`, `game/run.ts`, `ui/pause.ts` | ✅ done |
| 6 | **Pause goes somewhere** — Main Menu or continue. | R | folded into 5 | as above | ✅ done |
| 7 | **Controls vs THPS.** Discussed first, at his explicit request. | director | serial — a decision, not a build | — | ✅ he chose: keep the scheme, swap **grind → Shift, grab → X** |
| 8 | **A sculpted cassette** replaces the spinning ring+diamond over the NPC. | N | folded into 4 | `world/npc.ts` | ✅ done — 3 draw calls, ~330 tris |
| 9 | **Switch lean is mirrored.** | M | parallel — ride model only | `skate/skate-model.ts`, `skater-rig.ts`, `mirror.ts` | ✅ done — the bug was **fakie**, not stance |
| 10 | **Camera**: RMB look for trackpads, closer default, turn lag, speed FOV. | C | parallel — one file | `camera/skate-camera.ts` | ✅ done |
| 11 | **Menu stage**: move the character left, mirror his facing, degrade the picker to one body. | S | parallel | `ui/menu.ts`, `ui/menu-stage.ts` | ❌ **agent stopped by the player** — not built |
| 12 | **No MANUAL/HOLDING caption** during a manual. | (folded into 7) | — | `ui/hud.ts` | ✅ done |
| 13 | **Lighting push + shadow bug + a tuning panel** he can dial and hand back. | L | parallel — render + field | `render/*`, `world/field.ts`, `ui/look-lab.ts` | ✅ shadows + panel done; the push itself deliberately left to him |
| 14 | **Graphics settings screen** — the preset backend exists, the picker never did. | Q | parallel — one new file | `ui/settings.ts` | ✅ done |
| 15 | **Strip the subtext** — no captions, no eyebrows, no rules, anywhere. | — | parallel | `ui/pause.ts`, `ui/settings.ts`, `ui/hud.ts` | ✅ done |
| 16 | **New music, new round-end sound, music at 30%.** | A | parallel — one file | `audio/catalog.ts`, `audio/mixer.ts` | ✅ done — third take on the chime |
| 17 | **The girl**, five concept rounds and a rig. | director | serial — billed | genex, `main.ts` | ⚠️ rigged, HELD BACK — see below |

**Decisions and findings this milestone:**

- **The switch-lean bug was never about `stance`.** `stance === "switch"` was already
  correct. The mirrored lean was **`fakie`** — board round under feet that did not
  follow, i.e. every landed 180. The sign had been hung on `rideSign` (which way the
  BODY is set up) when a carve lean is a roll about the deck's long axis into an arc
  that bends with **travel**. Now `clamp(speed / LEAN_FULL_SPEED, -1, 1)` — one
  clamped signed term, continuous through zero so the deadband cannot pop it.
  Harness `tools/lean-check.mjs`: **12/16 → 16/16**, and regular/switch are unchanged
  to the last decimal, which is the proof only the wrong hand moved.
- **Camera turn lag is authorised and is NOT the rejected smoothing.** The standing
  rule against damping was written about **animation jitter** — smearing a bad clip
  instead of fixing it. He asked for camera lag in his own words, so the lag IS the
  deliverable. `TRAIL_TIME = 0.09 s` (cap 9.2°) is one named lag term on the AIM,
  not a second filter: still exactly one filter on the yaw, the rig's `smoothTime`,
  untouched at 0.20. Lowering `SWING_LEAD` instead was modelled and rejected — it
  adds 5° at 13 m/s but **76° at 1.5 m/s**, because the surviving trail divides by
  the speed-ramped rate. `LEAD_MAX` 1.1 → 1.25 because the clamp was biting inside
  the ride's own range (hardest carve asks 1.179), so a clamp was authoring trail.
- **Speed FOV**: 62° at rest → 68° at 17 m/s, dead zone under 4 m/s, `FOV_RATE = 2`.
  The boom stays a fixed 4.0 m, so nothing double-counts. This module now OWNS
  `camera.fov` during play — a later FOV slider must come through it.
- **Camera distance** 4.5 → 4.0; pitch held at 7.5° deliberately, which LOWERS the
  lens 2.03 → 1.97 m over the deck and continues "not from above".
- **RMB look**: under pointer lock the aim path never read `buttons`, so RMB-drag
  already rotated; what the button now buys is a **pin** — `LOOK_IDLE`'s clock is
  held at zero while it is down, so re-stroking a trackpad mid-look no longer spends
  the recentre window. Unlocked (drag-orbit fallback) is where it was genuinely dead
  and now rotates.
- **Controls**: he rejected the full THUG remap — *"давай как щас оставим все-таки
  но x неудобно для рейла"*. Kept the scheme, swapped the two held keys. Reasoning
  recorded at the site: a grab is a fraction of a second in the air, a grind is
  seconds of A/D fighting the gauge, and WASD leaves only the pinky and thumb free,
  so the LONG hold takes the pinky's home key. `input-matrix` 17/17,
  `integration-check` 69/75 (identical six pre-existing reds, baselined by reverting).
- **Casting swap**: The Local (`meshy-character.json`, `cms0fbiar…`) is now the man in
  the plaza; The Timekeeper (`meshy-npc.json`, `cms5uxuo5…`) is now the body you ride.
  The manifest FILENAMES still record who each rig was first and are deliberately not
  renamed — every URL in this document would go stale. Lucky landing: the NPC's talk
  clip was originally generated on The Local's rig, so it is back on its native
  skeleton with nothing retargeted.
- **`idle.default` is a PINNED slot** — the platform refuses to let generation replace
  it (six reviewed controller-pack slots are protected). So the new idles land as
  their own clips and the menu will be pointed at them.
- **A director error, recorded so it is not repeated:** the first idle call was written
  as a long descriptive sentence, the router read it as *movement*, and it queued the
  full **16-clip 8-way walk + run set** for a character who is never off a board.
  Billed and useless. `character animate` wants a SHORT pose-shaped verb — "relaxed
  waiting stance" came back as the intended 1 clip. One verb per call, read the plan.
- **God rays are off on High and on on Medium.** `PRESET_SPECS.high.grade.shafts = 0`
  (0 means the block is not compiled at all) against `medium`'s 1, while the tap
  counts 10/16 say both rungs were meant to have them. Flagged to lane L.
- **The shadow bug, diagnosed before delegating**, two independent causes: (1) the sun
  and its target follow the skater every frame (`main.ts`) with **no texel snapping**,
  so the map rasterises on a different sub-texel alignment each frame and every edge
  crawls — that is the flicker; (2) one map covers ±`SPOT_HALF` ≥ 40 m, i.e. ≥80 m
  across on a 2048 map = **≥3.9 cm per texel**, and a deck is 20 cm wide — that is the
  pixelation.
- **The graphics-preset backend was already complete** and nobody had noticed: the
  three-rung table, `getQualitySetting`/`setQualitySetting` persisting to
  localStorage, `startingPreset()` falling back to the detected tier, a live
  `refreshFromSetting()`, and a documented device veto for memory-class costs. The
  only missing piece was a screen that calls the setter. Default is **Auto**, not
  High — the machine decides until the player overrides.
- **The look-lab tuning panel is player-requested, not agent scaffolding.** The
  contract's ban on debug-only code is about the agent adding hidden scaffolding to
  check its own work. This is a tool he asked for out loud, and it ships on terms:
  nothing hidden (a visible settings row, no URL flag), one file / one import / one
  call site so its deletion is one deletion, and it comes out once he hands the
  numbers back.
- **The lab paid for itself and is now shut.** He tuned the live plaza and handed
  back two numbers: **sun intensity 3.1 → 3.9** and **sun bearing −160° → 1°**
  (`world/field.ts`). Both are recorded at their site as HIS, so nobody re-derives
  them from the old prose — and the old prose is kept, relabelled as the case for
  the light his number beat. The bearing change makes the 22° elevation choice
  *cheaper* than when it was made: the west block's 29.7 m shadow now falls away
  from the main line instead of across it. The panel itself is hidden by handing
  `SettingsScreen` no `onLookLab` — one line, and `ui/look-lab.ts` stays compiled,
  because he said "пока" and because uncalled code rots.
- **"The lighting turns off a few seconds into a run" — DIAGNOSED, measured, and
  fixed.** It was the adaptive-quality governor, and the root cause is a number
  that could never have worked: the budget `1000/60 + 8` = **24.67 ms sits inside
  the vsync dead zone**. A display hands out whole vsync intervals — 16.7 ms or
  33.3 ms and nothing between — so a game pacing at a rock-solid 30 fps reports
  33.3 ms on EVERY frame and is over budget on EVERY frame. Measured on his M2
  Max at his real full-screen size: median 22.1 ms, p95 32.2 — straddling that
  line permanently.
  - **It was a lottery, not a defence.** Because `slowSince` resets on any single
    under-budget frame, a step-down needed the slow frames to CLUSTER rather than
    to be numerous. Measured: a **38.6 fps** run never stepped down while a
    **42.6 fps** run did.
  - **It judged the BOOT.** Rung 1 was measured firing at t = 9.44 s with DROP IN
    pressed at t = 11.64 s — a rung spent 2.2 s before play began, which is why
    the player's first sustained-slow stretch in a run landed straight on
    post-off. That is exactly the sentence he wrote.
  - Fix: budget moved one whole vsync rung below target (~36.8 ms), judging is an
    EWMA rather than a run of consecutive frames, hitches over `max(80 ms, 3×)`
    are rejected as outliers, a 6 s warm-up stops the loader spending a rung, and
    the ladder is reordered so **post-off is now second from LAST**, behind two
    resolution steps, the shadow map and the draw distance. Post-off is skipped
    entirely when the player has chosen a preset by hand — `postIsPlayerChoice`
    in `main.ts`. A governor may rescue a machine; it may not silently overrule
    the settings screen.
  - Verified after: 90 s at his real full-screen size, **no step-down at all**,
    post chain intact the whole run. On a genuinely weak machine (CPU ×10) the
    full ladder still walks, and post-off moved 13.5 s → **31.9 s**.
- **4.8 GB was riding along in every source push.** `shots/` — 80 folders of my
  own verification captures — was never in `.gitignore`. The build deploys from
  `src/` and `public/` and was always fine; it was the SOURCE push that tried to
  move nearly five gigabytes of PNG through git-lfs and gave up. That is what
  "✗ Couldn't save your game's source" was, and the 409 "No uploaded build for
  this commit" on the publish that followed. Now ignored; the files stay on disk.

**THE GIRL — BLOCKED, and the reason is mechanical, not aesthetic.**
The approved Y2K-tech preview (`cms62715k01cg22lbbweyi673`) **cannot be rigged**:
Meshy rejected it with `native motion QA: persistent-leg-crossing`. Her concept
stands with feet together and the wide tearaway pant legs fuse into one silhouette
from hip to floor, so the rigger cannot separate the legs. Three attempts:
finalize → QA failure; two retries → `This idempotency key was already used`; and
re-requesting the preview returns the **same id** ("Repeating the same approval
reuses its existing job"), so the mesh cannot be re-rolled either. It is a
one-of-one that the API will not rig again. The route through is a new concept.
Round 2 (`cms669qt2…`) fixed the stance; he rejected it on looks — the armband,
the hip bag and the shoulder detail read shabby and the jacket was too plain.
Round 3 (`cms66ygvp005c22obhzk27j45`) is with him now: two-tone hair, panelled
racing jacket, no bag, no armband, nothing on the shoulders, feet apart.
**Awaiting his pick of 1 / 2 / 3.**

**THE BACK RAMP — the release angle was never the bug, and that is the lesson.**
It was already 70°, which *sounds* steep. But a released board is a projectile and
flies `v²·sin2θ/g`, and `sin(140°) = 0.643` is near the **maximum of the range
curve** — so the lip was throwing him as FAR as it possibly could, and far is
brick. Fixed by going past the range peak rather than by re-aiming: **70° → 86°,
2.2 → 3.4 m tall, shelf 2.8 → 3.4 m**. Measured on the real `SkateModel`, coasting,
no pop: 16 m/s went from **hitting the wall at 3.83 m/s at y 5.30** to landing at
z 45.27; 20 m/s from **5.51 m/s into brick** to 1.65 m clear of it. He now lands
*fakie* on the tipped-back apron within 2 m of the lip and rolls back down. Over
2,520 skewed/popped approaches the worst brick contact went **10.04 m/s → ragdoll**
to **7.22 m/s and zero runs ending on the brick**.

**The wall was symmetric all along** — `blocked()` is `maxTop > probe`, a fact about
a height that cannot know which way you arrived, and it swept continuous at 25 cm
over all 220 m of perimeter. What it lacked was a CEILING: a building is a
flat-topped solid, so above its own roofline it is solid from *neither* face and
there is no world behind it. Rooflines run 10–15 m; the old ramp's apex was
**9.54 m — 46 cm of margin** — and the new one reaches **11.44 m**. Hence
`BOUND_CAPS`: invisible twins derived from each boundary solid's own footprint,
flat top at 40 m, added to `SOLIDS` (what the ride queries) and NOT to
`SPOT_SOLIDS` (what the mesh and paint walk). Proven necessary, not theoretical —
removing them and changing nothing else put the board **956 frames outside the
block**, out over `bldg-east-n` at (36.1, 11.35, 46.5) off an 18 m/s run.
`collide-sweep` **12/13 → 16/17**, 17/17 watched failing.

**`integration-check` 68/75 → 69/75 (baseline).** The ramp move broke the wall-audio
harness, not the game: it aimed north from `SPOT_MAX_Z - 6` = z 42, which was 6 cm
of flat ground before and is ON THE RAMP now, so every approach launched and the
rates came back NaN. Re-aimed south at `bldg-south` — same brick, nothing in front
of it. Measured after the move: onWallHit 17.8 / 17.8 / 17.9 at 30 / 60 / 144.

**SFX LOUDNESS CANNOT BE PROMPTED — three takes proving it.** The round-end chime:
*"warm gentle chime, mellow, no harshness"* → **−34.6 dBFS**; the same idea with
*"loud… at full level… present and forward"* bolted on → **−39.5 dBFS, five dB
WORSE**; *"a bell struck hard"* → **−21.3 dBFS**. Adjectives about level do
nothing — the generator masters a gentle sound gently. What moves the number is
the **physics being described**. This matters because `HTMLAudioElement` cannot
amplify (`el.volume` clamps at 1), so a clip's file level IS its ceiling: take 1
landed 8 dB UNDER the concrete roll bed and every minute ends while rolling.

**THE 27 UNWIRED GENERATIONS, resolved** (preflight flags them at every push, and
the rule is wire it or say why). Checked by grepping each id across `src/`, not by
memory — all 27 genuinely have zero references. Four groups:

- **Superseded by a later take of the same thing — CANCELLED, no action.** The four
  loose textures (`cms2djn5a` asphalt, `cms2djnt6` plaza slabs, `cms2djoi1` brick,
  `cms2djp8s` ledge) carry ids immediately BEFORE the ten-texture batch the world
  actually loads (`cms2djqci` … `cms2djwej`) — the same four surfaces, first pass,
  replaced by the fuller set within the same minute. Same story for the old street
  music (`cms0efzgw`, replaced today by the lofi bed), the old buzzer
  (`cms59uqta`), and the two failed chimes (`cms67o8vx` at −34.6 dBFS,
  `cms6a7b9c` at −39.5). Nothing to recover.
- **Motion reference video — CANCELLED.** The eleven `cms1p…`/`cms1t…`/`cms51m…`/
  `cms52d…` clips were the video→motion experiments for the push and stance takes.
  Their output is already in the game as clips; the source footage is not an asset.
- **Built for a road not taken — PARKED with map 2.** The three spare skyboxes
  (`cms0efn4b` open country, `cms59etqc` golden hour, `cms59ev8j` midday), the
  grass texture (`cms0efmj4`) and the two loose skateboard props (`cms0eflwm`,
  `cms0fd7sa`) date from the open-field milestones and map 2. They ride with map 2's
  parked note; if it comes back they are the first things to check.
- **Nothing here is a missed opportunity**, which is the useful conclusion — the
  preflight warning is real bookkeeping, but every row resolves to superseded,
  source material, or parked-with-map-2. It stays noisy until someone prunes the
  generation history, which is not worth a push.

**Assets generated this milestone**, all live on R2 and referenced by URL:

| What | Id | Wired |
| --- | --- | --- |
| Idle — The Timekeeper (player body) | `cms66dbk0004q22obvp6ll8hc` | ✅ `main.ts` roster `idleUrl` |
| Idle — The Local (plaza NPC) | `cms66ljya004z22obdxh4ksfa` | ✅ `world/npc.ts` `NPC_IDLE_CLIP_URL` |
| Logotype — ANGELCORE style | `cms67vgv6006x22obvqjxtlap` | ✅ `public/ui/logotype-angel.png` |
| Title backdrop — PS1-render shop | `cms67vjuo007022obezc4pooz` | ✅ `ui/menu.ts` `SHOP_URL` |
| Music — old-school lofi hip hop | `cms67o5n2006c22obpk8u2999` | ⏳ lane being measured |
| Sfx — warm round-end chime | `cms67o8vx006f22obpcxfg7tu` | ⏳ same lane |

**The 30% music volume needed a split, not a number.** `DEFAULT_MUSIC` was ONE
constant doing TWO jobs — the slider a new player starts on, and the master
`musicTrim` divides by. Halving it doubles every per-track trim, so the bed comes
out at exactly the volume it started and the change is invisible. Verified before
touching it. Now `DEFAULT_MUSIC = 0.30` is only the starting slider and
`MUSIC_TRIM_REFERENCE = 0.60` is only the calibration; the bed lands at element
volume ~0.155 instead of ~0.31, and dragging the slider to 0.60 restores the mix
the trim was measured for.

**Neither generated idle loops, and it would have been visible.** The shipped
`Idle_3` is an authored loop — last keyframe matches first to 0.0° on all 24
tracks. The new takes are 3.97 s and end 11.6° (Timekeeper) and 18.6° (Local) out,
with 15 of 23 tracks over 3°. On `LoopRepeat` that is both legs snapping every
four seconds on the title screen. They play **`LoopPingPong`** instead — exact at
both ends by construction, inventing no frames a crossfade would have authored,
and cheap because the takes are nearly still where they turn (8–15°/s at the
tail). Reads as a 7.9 s weight shift. The real fix is a take generated to close on
itself; it is one line in each file if we ever queue one.

**The title backdrop's mirror is GONE.** The old photo carried `scaleX(-1)`
because its open floor was centre-left and the layout needs it on the right, and
flipping was free — no text in frame. The PS1 render is full of signage (BAKER,
ZERO, VISION, EXIT, Shorty's), so a mirror would put five backwards words on the
title screen. It does not need the flip anyway: its counter already runs down the
right and the open tile is centre-right, where the body stands.

**THE GIRL — the block cleared, and the route through was the references.** The
player put three photos in `bar/girl/` and asked whether they could be fed to the
generator directly. They cannot: `genex character` takes text only — no `--image`,
no `--ref` — and the only image the rigging pipeline reads is a concept it
generated itself (`genex image --edit` takes local files, but that lane makes
pictures, not riggable bodies). What the refs DID fix was the brief. Every earlier
round had been briefed as **Y2K sportswear** — platinum dye, technical zip jackets,
tearaway track pants, an armband and a hip pouch — against references that are
**2003 indie sleaze**: long undyed hair, velvet corset tops, low-rise baggy
distressed jeans, studded belts, an earthy brown/olive/plum palette. That mismatch,
not the generator, is why four rounds read cringe. Re-briefed from the photos →
`cms67l5ab005t22ob3fcmvuhn` (redhead) and `cms67yjcw007i22ob5qrba24x` (brunette,
from refs 2–3). He picked redhead candidate 2, then rejected the 3D
(`cms685c0a008122ob37nch77h`) because the hair covered her face. Re-briefed with
the face explicitly clear → `cms68hjcq008l22obkttmqfj5`, **candidate 3 approved**,
3D preview running.

**Milestone 10 previewed 2026-07-29** — `https://dev.genex.games/world/skate`.
Verified in the live bundle rather than asserted from the push log:
`index-CQ921DsP.js` carries `logotype-angel`, the PS1 shop id, `Settings`,
`Picture and sound`, `Restart run`, `Free ride`, `cassette` ×4, `idleUrl` ×4.

**THE RUNAWAY IS RIGGED AND HELD BACK — a clip/rig mismatch, not a look problem.**
`cms69mf2z00aj22obb71wt0hq`, manifest `public/assets/meshy-girl.json`, idle
`cms69uf4e00cc22obqh885k87`. Her roster row in `main.ts` is COMMENTED OUT because
she would ride folded in half. Swept exhaustively before concluding it
(`tools/grab-sweep.mjs`, new): 320 fold×reach poses found nothing, so the net went
to the whole shape — 8 tucks × 18 folds × 16 reaches, **2,304 poses** — and ZERO
put her hand on the toe-side rail with the board brought up.

The cause is upstream of the posture table. Hand-authored clips are played RAW at
the rig, and a quaternion track **replaces** a bind rotation rather than composing
with it, so a clip means only what it meant on the skeleton it was authored on.
Her rest rotations sit **138.6°** from that skeleton (Spine02 138.6, Hips 136.1,
both UpLegs >135) where The Timekeeper's worst bone is **35.4°** — which is why he
works and she does not. Measured consequence in her rolling stance: Spine02 lands
**6.4 cm below her own hips**, shoulder 39 cm lower than the retargeted set puts
it, so the deck (which rides the soles in the air) ends up **above her shoulder**.
No fold/reach pair reaches a board that is over your shoulder. Every hand-authored
clip breaks on her — stance, ollie, push, crouch — so this is not a grab bug, and
it is **not** a video→motion job: a new clip authored on the same rig breaks
identically. **Fix = retarget the clips onto her rest frame, or re-rig.**

Her GLB is fine — in bind she measures like her neighbours to the centimetre and
her segments are ordinary (leg 73.9, foot 12.7, arm 53.2 vs The Timekeeper's
73.5 / 12.0 / 50.2).

**The gate that should have caught this cannot.** All three manifests claim
`poseMode: a-pose`, `meshy-6`, 1.7 m — and three DIFFERENT `skeletonSignature`s.
The signature check lives inside `loadMeshyCharacter`; the ride loads a bare GLB
and never sees it. `tools/grab-sweep.mjs` now carries a standing **THE REST FRAME**
assertion (every playable rig within 60° of the clips' own) — currently **4/6**,
both reds hers.

The sweep also re-derived the other two bodies' shipped numbers independently
rather than re-reading them: The Local re-selects `fold 112 / reach 24` (6.5 cm,
x −10.5) and The Timekeeper `fold 96 / reach 16` (6.1 cm, x −10.9), matching what
this document already records. `anim-check` 24/25, byte-identical to baseline.
One methodology correction kept: the old headline measured the *nearest-approach*
frame, an UNSIGNED distance, so a wrist inside the plank scored the same as one
above it. The sweep reads the **parked** frame and prints the sign — which is what
turns The Timekeeper's uncorrected −0.3 into its true **−1.8 cm inside**.

**Row 11 is UNBUILT.** He stopped that agent mid-run, so moving the menu character
left and mirroring his facing did not happen, and the picker still assumes two
bodies while the roster now has one. The controls-table key swap that agent was
also carrying, the director applied by hand. Do not relaunch it without him asking.

### Milestone 9 — the list, and who owns each row

| # | The ask | Lane | Parallel? | Owner files |
| --- | --- | --- | --- | --- |
| 1 | **Park map 2.** Comment it out, hide it, take it off the interfaces. Not deleted — we come back to it. | director | serial (director) | `world/maps.ts`, `ui/menu.ts` |
| 2 | **Remove the crosswalk** from map 1 (the glowing stripes). | director | serial (director) | `world/props.ts` |
| 3 | **Board respawns in a random orientation** after a fall — sideways, flipped. Player called it critical. | P | parallel — the ride model is disjoint from every other row | `skate/skate-model.ts`, `skate/fall/*`, `skate/input.ts`, `skate/ragdoll.ts` |
| 4 | **Push dies after a jump.** Hold W, ollie, land still holding W → he stops pushing. | P | same lane as 3 — one file, one writer | as above |
| 5 | **Manual is wrong.** The board sinks into the ground; the rider leans with it when he should stand vertical and let his legs do it. | M | parallel — pose/rig files, no overlap with the ride model | `skate/skater-rig.ts`, `skate/skater-anim.ts`, `skate/anim/*` |
| 6 | **Post-landing drift** — measured in milestone 8, fix never applied. Same file as 5, so it rides along. | M | folded into M | as above |
| 7 | **Motion blur** + wire the clouds that were built and never placed. | V | parallel — the post chain and the sky touch nothing else | `render/*`, `world/sky/*`, `world/field.ts` |
| 8 | **You can ride through the wall behind the big ramp**, off a small ramp the player says is placed oddly. | W | parallel — map-1 layout only | `world/spot.ts`, `tools/collide-sweep.mjs` |
| 9 | **Grind catch drift** — catches are inconsistent; `integration-check` red on grind + boardslide, `collide-sweep` 10/11. | G | parallel — the model only delegates into `grind.ts` | `skate/grind.ts`, `skate/rail-steel.ts` |
| 10 | **The NPC needs a face.** He hands out the mission and was still the player's own rig reused. | director | serial — generation is billed, the director reads every routing line | genex |
| 11 | **The second skater**, from the player's reference. | director | serial — same reason | genex |

Why 3–9 run in parallel and 1, 2, 10, 11 do not: rows 3–9 are five disjoint file
sets with no shared writer, which is the whole test. Rows 1 and 2 are the
director's because they touch the map registry and the menu, which every lane
reads. Rows 10 and 11 are the director's because `genex` bills, and because the
last run lost a batch to a misread routing line — one verb per call, read the
plan, then send.

**SCOPE CUT, in the player's own words (2026-07-29):** *"The first map doesn't
need to be redone, that's the first thing. It's fine now; we just need to remove
the glowing stripes I mentioned, right?"* — so map 1's **"bigger overall"** and
the **street-vs-skatepark relayout** are OFF the list until he puts them back.
Row 8 is a collision hole and one badly-placed ramp, not a relayout.

**PARKED, not cancelled** (map 2's whole note list rides with it): the white
artefact, the colourful graffiti, the ground textures, the drop-in at the top,
and why a skater is there at all. Also still open and not in milestone 9: the
quality picker, the volume sliders, mobile + the 764 MB GPU budget, Rapier
physics for loose props, and the trees/skyboxes/graffiti that are built and
unwired.

### Milestone 8 — THE GAUNTLET RUN (AG-831) — previewed, partial
The ticket's ten asks, decomposed into lanes below and run as gauntlet loops
(builder → FRESH critic with no builder context → biggest gap back to the
builder → until two rounds find nothing new → smoothing pass). The player's
priority governed the order: **P0-A the maps look and feel right · P0-B the
skater moves right**; everything else P1. Milestone 7's own resume items were
folded into lane B. **Roughly a third of the rounds never ran** — every lane's
round 2 and 3 died on a session limit. The status table below is what actually
landed.

### STATUS — the AG-831 ticket, item by item (2026-07-29)

Written after the first gauntlet night, **verified against the repo rather than
against the lane reports**. Roughly a third of the planned rounds never ran —
every lane's round 2 and 3 died on a session limit — so most of what is marked
✅ has passed ONE critic pass, not run until dry.

Four states are used, and the third one is the one that matters:
**✅ done and wired** · **🔌 BUILT BUT NOT WIRED** (paid for, in the repo, not in
the game) · **◐ partial** · **⬜ not started**.

| # | The ask | State | Where it actually stands |
| --- | --- | --- | --- |
| 1 | Map 1 bigger + super realistic, textures | ◐ | 66 → **74 m** — modest, and the player has since said **bigger OVERALL**, which is not done. Matched texture set wired with normals + roughness; brick tiling fixed (was 9 m — a 41 cm course); mirrored wrapping removed; ramps finally poured in real skatepark concrete; plaza's one-tile share 82% → **50.2%** measured over 38,316 samples. **Layout still reads SKATEPARK, not street** — the player's own correction, arrived after this lane's last successful round. |
| 2 | Procedurally generate street objects | ✅ | img2threejs library (8 modules), **55 props placed, 41 with colliders**, overlap check written and re-verified at zero. |
| 3 | Solid physics — no riding through walls | ◐ | `tools/collide-sweep.mjs`: 146 solids × 8 headings × 3 frame rates = **15,624 approaches**. Found 4 real holes: frame-stride tunnelling at 30 fps (0.67 m/frame through the fence, lamp bases, hydrants), a 15 cm band that could be entered but not landed on, an air probe cleared by where he *would* be, and **the north wall had zero depth — 32 m outside the block, still rolling**. All fixed. **10/11 — the red is grind lines.** |
| 4 | Map 2, the speed map | ◐ | Exists and is reachable from the title screen. 450 m channel, gradient that gives 7 m/s at the chute mouth and 15 by the bottom with the throttle never touched, banked walls that return energy, two drop structures, four kickers, a bridge. **Its round 2 and 3 died**, so every one of the player's map-2 notes is still open: the white artefact, the colourful graffiti, the ground textures, the drop-in at the top, and *why* a skater is there. |
| 5 | Air pose + landing impact | ◐ | `src/skate/anim/air.ts` built. One critic pass only. |
| 6 | PS2-AAA look + presets + performance | ◐ | Real composer chain: RenderPass → GTAO → bloom → a PS2 grade (exposure, ACES, unsharp, contrast, split tone, vibrance, vignette, grain, ordered dither). Three presets exist. **The picker is NOT WIRED — `setPreset` has no caller**, so the preset is whatever the tier picked at boot and the player cannot change it. **Motion blur: not started.** |
| 7 | Mobile — properly supported | ⬜ | **Not started.** And the preview preflight now reports **~764 MB estimated GPU memory on phones** against a <700 MB budget for modern devices, <300 MB broad. This is the single biggest untouched risk in the build. |
| 8 | Push / jump input priority | ✅ | Both rules, decided by which key arrived SECOND. `tools/input-matrix.mjs` 17/17, **all 17 watched failing** against deliberately broken code first. |
| 9 | The fall — bones, board, get-up | ◐ | `src/skate/fall/` built (board-fall, get-up). Get-up clip wired. `ragdoll-drop` 195/195. One critic pass only. |
| 10 | Missing animations, manual/rail jank | ◐ | **All five clips generated AND wired**: grab, 50-50/rail stance, manual, boardslide (`src/skate/anim/pose-take.ts`), get-up (`src/skate/fall/get-up-take.ts`). The jank itself has had one pass. |
| 11 | Post-landing drift | 🔌 | **CAUSE FOUND AND MEASURED, FIX NOT APPLIED.** `SkaterRig.followFeet` freezes the foot anchor on the single frame the feet leave the deck and holds it for the whole stroke. After a landing the cushion is still crossfading, so it freezes a MOVING foot and carries 98% of that offset: **15.21 cm off the deck centre-line against 12.26 cm** for the same push without it. The side flips with stance, which is the player's "depends which way he's facing". The file belongs to no lane — it is the director's, and it was not edited. |
| 12 | Slide button | ✅ | **HOLD X**, held not toggled. 0/36 rails catch with it up, 36/36 with it held. Now advertised in the HUD strip and the controls screen — it was invisible until the player asked where it had gone. |
| 13 | Camera | ✅ | Right-mouse free look, latches off and STAYS where you put it, right-click hands it back, 5.4 → 7.0 m, boom collides with the world. Found that follow-the-direction-of-travel **had never worked**: `headingAlignGain: 0` multiplied the swing to nothing, so the camera held whatever angle it was born with. |
| 14 | Game loop + global leaderboard | ◐ | NPC, one-minute run, repeat gate, `submitScore`/`getLeaderboard` on the real SDK, NPC voice line and talk clip wired. Round 3's critic died. **Not verified end to end on the real draft page** — local test mode does not exercise saves or the board. |
| 15 | UI — THPS combo readout | ◐ | Combo machinery exists; Big Shoulders Display loaded. One pass. |

**🔌 BUILT AND PAID FOR, SITTING IN THE REPO, NOT IN THE GAME.** This is the
list to read first — every row is finished work that shows up nowhere on screen:

| What | Where it is | Why it is not in |
| --- | --- | --- |
| **The procedural trees** | `src/world/vegetation/` — 5 species, real trunks and branch fans, seeded variation, LOD bands, 35.8k tris for a 290-tree hillside on phone-low, MIT ez-tree attribution in place | map 2's lane died before it could place them. **The cones you can see are still the old ones.** |
| **Volumetric clouds** | `src/world/sky/` — depth-tested raymarch on sky pixels only, baked 3D noise, per-tier step counts | never placed by either map |
| **Golden-hour sky with cumulus** | `cms59etqc000822p5zq6z1m7f` | not wired |
| **Midday sky with cumulus** | `cms59ev8j000b22p5krrhwbgb` | not wired |
| **Faded monochrome tags** (map 2) | `cms59infh000q22p5q04vl00q` | not wired — the bright graffiti the player disliked is still there |
| **Bleached roller paint** (map 2) | `cms59io4s000t22p548oug5vq` | not wired |
| **The quality picker** | presets exist in `src/render/look.ts` | nothing calls `setPreset` |
| **Music / SFX sliders** | levels live and persisted in `src/audio/settings.ts` | no UI control exists |

**⬜ NOT STARTED AT ALL:** mobile (item 7) · motion blur · Rapier physics for
loose props · the second character from `bar/girl_skate.png` · map 1's
street-vs-skatepark layout · map 2's drop-in entrance and its white artefact.

**WHAT IS GREEN, MEASURED:** `input-matrix` 17/17 · `turn-check` 30/30 ·
`stance-check` 8/8 · `switch-check` 9/9 · `hold-check` clean ·
`ragdoll-drop` 195/195 · `collide-sweep` 10/11 · `tsc --noEmit` clean ·
`vite build` clean.
**WHAT IS RED:** `collide-sweep`'s grind-line check, and `integration-check`'s
grind/boardslide items — the rail work was mid-flight across two lanes when the
limits hit, so **grinds may catch inconsistently.**

**AUDIO — done this round and wired:** music is ON (it had been at volume 0
since milestone 4, one silent track for two maps), every level derived by
measuring all 19 files rather than dialled by ear, a second faster track for
map 2, canyon ambience, wind that rides real speed, ducking on bails and
grinds, per-map beds, and loop windows that dodge the mp3 padding — which is
how it was found that **both music tracks fade to silence at the end** despite
being prompted to loop, and that **the grass roll sound has been swelling in
and out every six seconds since milestone 4.**

### Milestone 8 lanes — the decomposition

Ownership is one writer per file, by construction. The director owns `main.ts`,
`skater-rig.ts`, integration, previews and the player conversation.

| Lane | Ticket items | Owns | Wave | Parallel? |
| --- | --- | --- | --- | --- |
| **A · Look stack** | 6 | `src/render/**` | 0 | serial — both map lanes author against the post stack and the presets, so it cannot move under them |
| **D · Procedural props** | 2 | `src/world/procedural/**` | 0 | parallel with A — a prop LIBRARY with no placement, so it touches nothing A touches |
| **B · Map 1** | 1, round-6 leftovers, places D's props | `src/world/spot.ts`, `props.ts`, `field.ts` | 1 | parallel — its own three files; needs A's stack and D's library to exist first |
| **C · Map 2** | 4 | `src/world/spillway.ts`, `src/world/maps.ts` | 1 | parallel — an entirely new file set |
| **E · The ride** | 3, 8, 11, 12 | `src/skate/skate-model.ts`, `input.ts`, `collide.ts` | 1 | parallel — all four asks are the ride's own behaviour, and they contend for the same file, so they are ONE lane run internally in sequence |
| **F · Animation** | 5, 10 | `src/skate/skater-anim.ts`, `mirror.ts` | 1 | parallel — owns the animation layer alone |
| **G · The fall** | 9 | `src/skate/ragdoll.ts` | 1 | parallel — its own file |
| **H · Camera** | 13 | `src/render/skate-camera.ts` | 2 | parallel |
| **I · Mobile** | 7 | `src/mobile/**`, `src/controllers/touch/**` | 2 | parallel — but it is judged on captures of what waves 0–1 built, so it goes after them |
| **J · Game loop + leaderboard** | 14 | `src/game/**`, `src/world/npc.ts` | 2 | parallel |
| **K · UI / HUD** | 15 | `src/ui/**` | 2 | serial-after-J — the combo readout IS the run's HUD, so the two are built against each other |
| **Z · Smoothing** | — | none (reports only) | 3 | serial — one art direction, one input convention, one camera language |

1. Scaffold, identity, quality tier, field + chase camera — ✅ → previewed
2. Skater, board and the three moves (roll / ollie / kickflip) — ✅ → previewed
3. Wire the generated skater + board + ground + sky + audio — ✅ → previewed
4. Stance, board-to-feet contact, ollie feel, music wired silent — ✅ → **published**
5. Title screen + logotype + menu video — ✅ → previewed (HUD sprites still open)
6. Stronger rolling hills, mobile GPU budget — ⬜ superseded by lane B
7. THE STREET BUILD — ✅ → previewed (rounds 1–5 + four stance rounds)
8. **THE GAUNTLET RUN** — ▶ waves 0 → 3 above

_Milestone 7's original detail follows, for the resume items lane B inherits._

Now (milestone 7, closed): **rounds 1–5 are live** (pushed 2026-07-27, the
first preview since round 3), plus four rounds of STANCE work on top of them,
all of it reported by the player watching the game. Where it landed, and the
thing to resume from: **which way round the skater is riding is TWO facts, not
one, and they compose.**

- **`stance`** — which end of the deck his body is set up to lead. A half-turn
  of the whole rider above the skeleton (`SkaterAnim.stanceGroup`); his feet
  swap ends. Caused by the RIDER turning: rolling back down a quarter pipe.
- **`fakie`** — whether the wheels are running toward that end or the other.
  A REFLECTION of the clip, nose for tail (`src/skate/mirror.ts`); his feet do
  not move at all, his shoulders open the other way and the OTHER foot pushes.
  Caused by the BOARD turning: a landed 180.

`SkateModel.syncStance` is the only writer of both and the only place that asks
which happened. Green — `tsc --noEmit` and `vite build` clean, `turn-check`
30/30, `stance-check` 8/8, `switch-check` 9/9, `hold-check` clean,
`integration-check` 68/75 with the 7 failures all pre-existing round-6 items
listed below, `ragdoll-drop`'s 8 wall/bank scrub failures likewise unchanged.

**Resume here.** Round 6 was stopped part-way (one agent of five finished; the
run is resumable from its own cache). Its brief, minus the two items the stance
round has since delivered: the main line dead-ending in the north brick, the
driveway aprons that have stood proud for three rounds, the opening frame's cool
sky against golden-hour key art, the untextured skyline, the 82%-one-tile plaza,
the ragdoll's 30 fps limb inversion (survived three fixes, reproduced on the REAL
rig, so the "it's the synthetic skeleton" diagnosis is refuted), and the quarter
pipe's lip, still round 5's vertical coping — popping at it above 16 m/s is a
guaranteed no-pop, and the coasting band from 12–15 m/s comes down at under
3 m/s. The 7 red integration checks are exactly those: the wall event's
`undefined` payload, the lip, the coasting band, and ollie-while-pushing at
4/7.
1. Scaffold, identity, quality tier, field + chase camera — ✅ → previewed
2. Skater, board and the three moves (roll / ollie / kickflip) — ✅ → previewed
3. Wire the generated skater + board + ground + sky + audio — ✅ → previewed
4. Stance, board-to-feet contact, ollie feel, music wired silent — ✅ → **published**
5. Title screen + logotype + menu video — ✅ → previewed (HUD sprites still open)
6. Stronger rolling hills, mobile GPU budget — ⬜ deferred: the field is being
   replaced by a street spot, so hill work would be thrown away
7. **THE STREET BUILD** — ▶ the player's five asks, built in parallel:
   - 7a **Street spot** — a real street plaza: asphalt + concrete, ledges,
     stairs, banks, quarter pipes, graffiti walls, props. Looped until it
     reads as a place, not a box of ramps.
   - 7b **Grinding** — lock onto rails and ledges, 50-50 (straight) and
     boardslide (sideways), balance, pop out, grind audio.
   - 7c **Spins + switch stance** — rotate in the air and on the ground; a
     landed 180 leaves him riding with the other foot in front and he stays
     that way.
   - 7d **Ragdoll bails + ramp physics** — the bones actually collapse; the
     board rides transitions properly.
   - 7e **The trick list** — a real kickflip, plus heelflip, shove-it, grab,
     manual, and the grind tricks, on a readable control layout.
8. Verify pass — every ask above proved on screen, then preview — ⬜

Published 2026-07-25 at the player's request, with the menu screens and the
sprite HUD still outstanding — recorded here so they are not mistaken for done.

## Screens & UI
Screens: loader, menu, HUD (speed, trick callout, streak), pause, bail/retry.
Style brief: early-2000s skate-video graphics — rough spray-stencil edges,
bold condensed sans type, high contrast, no backing plates.
References: Tony Hawk's Pro Skater 3, Jet Set Radio, Skate 3 (feel only —
conventions, palette and post, never trade dress).
Menu archetype: **centred stack** — the wordmark is this game's strongest piece
of art and the key art's subject sits centre-right with open sky above, so a
left rail would run the buttons straight through the skater. Bare stencil
buttons, no plates.
HUD lane: **CSS** — the concept's chrome is flat geometry and typography
(condensed caps, a thin speed bar, a spray-stencil trick callout, no ornament
and no plates anywhere), so a CSS rebuild is screenshot-indistinguishable from
the mockup and carries the live combo readout, balance meter and stance badge
that milestone 7 needs. Micro-text stays HTML in Anton / Barlow Condensed.
Menu video: yes — re-shot for the street (`cms2hxarf01m922lpeknc4cj2`).

## Assets — the generation plan AND the budget
| Asset | Kind | Status | Wired? |
|---|---|---|---|
| Concept + HUD mockup | image | generating (cms0eflc2000d22nu2etnf4d6) | n/a |
| Skater concepts (x3) | character | generating (cms0efbqx000922nujb6l61i1) | — |
| Skateboard | model | landed (cms0fd757004s22nupq71hp7f) | **yes** |
| ~~Skateboard v0~~ | model | cancelled — wheels on both faces (cms0eflwm000g22nu5fqdi5a0) | no |
| ~~Skateboard v1~~ | model | cancelled — two stacked decks (cms0fd7sa004v22nuf5td90si) | no |
| Grass field ground | texture | generating (cms0efmj4000j22nujaebvzb0) | — |
| Afternoon sky | skybox | generating (cms0efn4b000m22nuhmn49er8) | — |
| Wheels rolling | sfx | generating (cms0efx3r000s22nu5ebee9q9) | — |
| Ollie pop | sfx | generating (cms0efxn8000v22nu512232m7) | — |
| Landing slap | sfx | generating (cms0efy9n001222nu8hzh3web) | — |
| Bail clatter | sfx | generating (cms0efytc001522nus1dxl7vz) | — |
| Skate-punk loop | music | landed (cms0efzgw001822nun13ysw35) | wired, volume 0 |
| Roll stance (anim) | motion | generating (cms0ehj40002c22nu9o4598e1) | — |
| Push off (anim) | motion | generating (cms0ehjrv002f22numdpbdn5t) | — |
| Roll stance v2 (anim) | video → motion | landed (video cms1pvbtp000d22lpq7zjaokb → motion cms1pxt86000i22lphj1usysu) | **yes** |
| Ollie (anim) | **hand-authored GLB** | player-supplied `public/assets/olie_animation.glb` | **yes** |
| Push (anim) | **hand-authored GLB** | player-supplied `public/assets/push.glb` | **yes** |
| Wind-up crouch (anim) | video → motion | landed (player's `crouch.mov`, mirrored → motion cms2bqswu01bf22lpi7napen5) | **yes** — the Space hold AND the landing cushion |
| ~~Wind-up crouch v1~~ | video → motion | superseded — unmirrored, 81° off the stance (cms1wybaj00ms22lpcmeiodyw) | no |
| Menu video | video | landed (cms2b5bb201aq22lpbk8v0i8s) | **yes** |
| Logotype (repaired cutout) | image --clean | landed (cms2bcnbn01ax22lpyjuudwkc → trimmed to `public/ui/logotype.png`) | **yes** — menu title + loader mark |
| ~~Kickflip (anim) v0~~ | motion | superseded by the video→motion take below (cms0ehl6y002l22nubgc66xjx) | no |
| **— milestone 7, the street build —** | | | |
| ❌ Kickflip (anim) | text → video → motion | **failed — motion vendor out of balance** (cms2dhltq01cr22lpze0k7f6x) | no |
| ❌ Heelflip (anim) | text → video → motion | **failed — same** (cms2di43l01cw22lpazflgt75) | no |
| ❌ Pop shove-it (anim) | text → video → motion | **failed — same** (cms2di4sc01d122lpf95xhf35) | no |
| ❌ 50-50 grind (anim) | text → video → motion | **failed — same** (cms2di5hu01d722lpsh6i10nk) | no |
| ❌ Boardslide (anim) | text → video → motion | **failed — same** (cms2di66n01de22lppy59ip6c) | no |
| ❌ Indy grab (anim) | text → video → motion | **failed — same** (cms2di6uj01dk22lpi2lt8hjb) | no |
| ❌ Manual (anim) | text → video → motion | **never queued** — API 500s, then the balance wall | no |
| ❌ 360 spin (anim) | text → video → motion | **never queued** — same | no |
| Asphalt street | texture --terrain | landed (cms2djn5a01du22lph6awgiyp) | **yes** — `props.ts` → `dressMaterials()` |
| Concrete plaza | texture --terrain | landed (cms2djnt601dx22lpotwvyir3) | **yes** — `props.ts` → `dressMaterials()` |
| Brick wall | texture | landed (cms2djoi101e022lpmpfvqmgu) | **yes** — `props.ts` → `dressMaterials()` |
| Waxed ledge | texture | landed (cms2djp8s01e322lppu649em4) | **yes** — `props.ts` → `dressMaterials()` |
| ~~City sky~~ | skybox | superseded by the golden-hour take below (cms2dqcrw01hh22lpzekuvtbb) | no |
| Golden-hour city sky | skybox | landed (cms2syf6o01ml22lplnxih4je) | **yes** — `props.ts` → `dressField()`, turned onto `SUN_AZIMUTH` |
| Graffiti throw-up | image --transparent | landed (cms2djqci01e622lpb7gczi3k) | **yes** — `dressPaint()`, 53 decals |
| Graffiti wildstyle | image --transparent | landed (cms2djr1n01e922lpurc3ne4s) | **yes** — `dressPaint()`, 53 decals |
| Graffiti stencil | image --transparent | landed (cms2djrqw01ec22lpquoo2jol) | **yes** — `dressPaint()`, 53 decals |
| Contest flyposter | image --transparent | landed (cms2djsfm01ef22lpycp5tch6) | **yes** — `dressPaint()`, 53 decals |
| Dumpster | model | landed (cms2djt3701ei22lpwgkcfik7) | **yes** — `dressFurniture()` |
| Park bench | model | landed (cms2djts701el22lphxetrioe) | **yes** — `dressFurniture()` |
| Trash can | model | landed (cms2djuh101eo22lpk3khrtxt) | **yes** — `dressFurniture()` |
| Traffic cone | model | landed (cms2djv4t01er22lp7aeex5uj) | **yes** — `dressFurniture()` |
| Street lamp | model | landed (cms2djvt201eu22lp7fkfyxin) | **yes** — `dressFurniture()` |
| Fire hydrant | model | landed (cms2djwej01ex22lpqlmsuhdo) | **yes** — `dressFurniture()` |
| Metal rail grind | sfx | landed (cms2djx2601f022lpivc9qnr3) | **yes** — `audio.ts` → `startGrind()` |
| Concrete slide | sfx | landed (cms2djxnt01f322lpfn6aut06) | **yes** — `audio.ts` → `startGrind()` |
| Rail lock-on | sfx | landed (cms2dqdky01hk22lp98gg7nxf) | **yes** — `audio.ts` |
| Body on concrete | sfx | landed (cms2dqe9f01hn22lpntob6qpi) | **yes** — `audio.ts` → `bodyImpact()` |
| Wheels on concrete | sfx | landed (cms2dqex301hs22lppezgy02e) | **yes** — `audio.ts` → `setRolling()` |
| Flip whoosh | sfx | landed (cms2dqfmx01hv22lpe845jmyq) | **yes** — `audio.ts` → `flipWhoosh()` |
| **Street key art** (menu + loader) | image | landed (cms2hv48901lw22lppfy2tr8c) | **yes** — menu still + loader art |
| **Street menu loop** | video --frame | landed (cms2hxarf01m922lpeknc4cj2) | **yes** — title backdrop |
| **— milestone 8, the gauntlet run —** | | | |
| Asphalt road v2 | texture --terrain | generating (cms51ksoc000022ozvbavgosq) | — |
| Plaza concrete v2 | texture --terrain | generating (cms51kten000322ozvretisvl) | — |
| **Skatepark concrete** | texture --terrain | generating (cms51ktzt000622oze19doqef) | — |
| Sidewalk concrete | texture --terrain | generating (cms51kumv000922ozl7evnckj) | — |
| Brick wall v2 | texture | generating (cms51lcmj000c22oz08pij2dw) | — |
| Building facade | texture | generating (cms51ld9r000f22ozmjq67yue) | — |
| Spillway concrete (map 2) | texture --terrain | generating (cms51lduu000i22oztar44nkh) | — |
| Hillside dirt + rock (map 2) | texture --terrain | generating (cms51leit000l22ozckanu7ty) | — |
| Chain-link fence | image --transparent | generating (cms51lfh6000o22oz0illccyx) | — |
| Bright day sky (map 2) | skybox | generating (cms51lnml001722ozlt8bhb8p) | — |
| Grab — reference footage | video 720p | generating (cms51mmff002q22ozucu61xrr) | — |
| Manual — reference footage | video 720p | generating (cms51mn3j002x22oz9ixdb68a) | — |
| 50-50 grind — reference footage | video 720p | generating (cms51mnr6003022ozpcwaveh6) | — |
| Boardslide — reference footage | video 720p | generating (cms51mocp003422oz8qutai3j) | — |
| **Get-up** (+ 16 locomotion clips) | character animate | landed (cms51mx9o003d22oz0yd8rn0t → `character-motion-uthana-mxzpuR97gzzo-glb`) | — lane G |
| **Grab in the air** | video → motion | landed (cms52e6vl005v22ozt9yakk6b → `character-motion-uthana-mzYtLGdccnpq-glb`) | — lane F |
| **50-50 / rail stance** | video → motion | landed (cms52e84y006122ozhp5xi80b → `character-motion-uthana-moCeMPEX7bg7-glb`) | — lane F |
| Manual — reference footage v2 | video 720p | landed (cms52dbrq005p22ozn8v5jkyj) | n/a — extraction input |
| Boardslide — reference footage v2 | video 720p | landed (cms52dccm005s22ozj7vmzyfo) | n/a — extraction input |
| **Manual** (balance, wheels up) | video → motion | landed (cms52qpjh006h22oz1j74aiyg → `character-motion-uthana-m7P13KGsSAdh-glb`) | — lane F |
| **Boardslide** | video → motion | landed (cms52qqkk006l22ozetxud98q → `character-motion-uthana-mo9299D1Et2C-glb`) | — lane F |
| NPC voice line | voice --gruff | landed (cms535ayw006z22ozuttz934n) | — lane J |
| NPC talk clip | character animate | generating (cms537kys008822ozrleetqn1) | — lane J |
| **— the player's 2026-07-29 notes —** | | | |
| Golden-hour sky **with cumulus** (map 1) | skybox | landed (cms59etqc000822p5zq6z1m7f) | — lane B |
| Midday sky **with cumulus** (map 2) | skybox | landed (cms59ev8j000b22p5krrhwbgb) | — lane C |
| Faded monochrome tags (map 2) | image --transparent | landed (cms59infh000q22p5q04vl00q) | — lane C |
| Bleached roller paint (map 2) | image --transparent | landed (cms59io4s000t22p548oug5vq) | — lane C |
| **Skate-punk track 2** (map 2 / fast) | music 100 s | landed (cms59ulv7000022lb8rnj1y46) | — lane AU |
| Wind at speed | sfx loop | landed (cms59umwj000322lbp7krp1hm) | — lane AU |
| Canyon ambience (map 2) | sfx loop | landed (cms59unyg000622lbcsvqersz) | — lane AU |
| Run start horn | sfx | landed (cms59upf2000922lb6o9gwb2x) | — lane AU |
| Run end buzzer | sfx | landed (cms59uqta000g22lblzack1bu) | — lane AU |
| Coping clack | sfx | landed (cms59urkn000l22lbncxro19p) | — lane AU |
| Cone knocked over | sfx | landed (cms59usn9000q22lb16qfmp1w) | — lane AU/PH |
| Bin knocked over | sfx | landed (cms59utp8000v22lbubaobkeq) | — lane AU/PH |

**A CAVEAT ON THE TWO NEW SKIES, checked by looking at the panoramas rather than
trusting the prompt.** Both have genuinely good upper hemispheres — real
towering cumulus, and the golden-hour one has the sun disc blazing through a
break in the cloud. But **both came back with a LANDSCAPE baked into the lower
hemisphere** (a rapeseed field and a hedgerow horizon), which is exactly the
failure the skybox skill warns about, and it happened even though the prompt
named no landform. In map 1 the ground half is hidden behind 11–15 m of
building on all four sides and in map 2 behind the channel walls and the
hillsides, so it costs nothing there — but a camera that ever sees the true
horizon will see a meadow, and the ROTATION matters (`backgroundRotation`
already turns the panorama to put its sun on `SUN_AZIMUTH`).

And the standing fact underneath this: the player's note was *"the skybox used
to be great, though I don't know where it went"* — he LIKED the sky this game
already had (`cms2syf6o01ml22lplnxih4je`, still what `CITY_SKYBOX_URL` points
at). So the defect to fix is that it stopped being VISIBLE, not that it was the
wrong sky. These two are an option, not an instruction: use one only if it
genuinely beats the sky he already praised.
| **Second character — the girl** | character | **planned — gated on lane F going dry** (`bar/girl_skate.png`) | — |
| NPC talk clip | character animate | proposed — only if the misrouted locomotion batch yields nothing usable | — |
| **— milestone 10, the player's graffiti ask (2026-07-30) —** | | | |
| Graffiti — roller blockbuster | image --transparent | landed (cms6och8p000k22mznd8o90ff) | **yes** — `props.ts` art 4, `w-roller` on the west wall |
| ~~Graffiti — character piece v1~~ | image --transparent | rejected — damaged cutout, 6.3% rim speckle vs a 2% limit (cms6o05ga000522mzzsv6i1pa) | no |
| Graffiti — character piece | image --transparent | landed (cms6or64b000922o7a7m72ch2) | **yes** — art 5, `w-character` on the west wall |
| Graffiti — chrome hand-style + drips | image --transparent | landed (cms6ocxl4000n22mzim4rrr7j) | **yes** — art 6, `e-chrome` on the east wall |
| ~~Graffiti — hollow outline v1~~ | image --transparent | rejected — paint itself 99.4% non-opaque, reads as a wash (cms6od1rz000q22mz54zuyuer) | no |
| Graffiti — hollow outline | image --transparent | landed (cms6p3ojf000g22o7t5eu9a0j) | **yes** — art 7, `s-hollow` on the south wall |
| ~~Graffiti ×3 at `--aspect 16:9`~~ | image | failed — the provider takes only 1024x1024 / 1536x1024 / 1024x1536 (cms6nztmc, cms6o0d1t, cms6o0kiv) | no |

**Two of the first four reference takes were unusable and were re-shot.** The
generator cropped the head out of frame on the manual and the 50-50 despite the
prompt asking for the whole body — motion extraction needs a complete subject,
and half a body extracts as half a performance. The re-shoot leads with **WIDE
SHOT, camera pulled well back, generous headroom, subject occupying only the
middle half of the picture**, and both came back framed correctly. That phrasing
is the fix; "whole body in frame" on its own is not enough.

The boardslide take came back as a 50-50 both times (board running ALONG the
rail, not crossways). Wired anyway and recorded as a deliberate call: what the
clip is needed for is the BODY — arms out wide and level, knees bent, hips
stacked — and turning the deck across the line is the yaw machinery the grind
lane already owns.
Status flow: proposed → planned → generating (id) → landed (URL) → wired.

**`character animate` routes each verb ITSELF, and it can route a standing
performance into the movement set.** Asking for *"stand in place talking,
weight on one hip, one hand gesturing at chest height"* came back as
`movement — generated as the full 8-way walk + run set`, 16 clips. The plan
line said so before it queued and it was sent anyway, which is the actual
mistake — the plan print is the stop, and it is only a stop if it is read.
Rule for the rest of this run: **one verb per call, read the routing line, and
only then send.** Not re-run: a second call bills a second batch, and the 16
locomotion clips are at least a real asset (the NPC can walk).

**The ten generations that are wired nowhere, and why — resolved, not parked.**
The preview preflight names them at every push, so here is the standing answer:
· `cms0eflwm` and `cms0fd7sa` — the two rejected skateboards (wheels on both
  faces; two stacked decks). Cancelled on inspection, not shelved.
· `cms0efmj4` (grass ground) and `cms0efn4b` (open-country sky) — **superseded
  by the street.** The field they dressed no longer exists; the spot uses the
  asphalt/concrete/brick set and the city sky.
· `cms2b5bb2` — the grass menu loop, superseded by the street loop above.
· `cms1pvbtp`, `cms1slhc0`, `cms1t363q`, `cms1t6wn7`, `cms1tbuoi` — five
  reference VIDEOS whose only job was to be the input to a motion extraction.
  Their motion output IS wired (the rolling stance and the push); the footage
  itself was never meant to appear on screen. This is what the video→motion
  lane costs, and it is not waste.

**The title art was re-shot for the street.** The old key art is a grass field
and the tagline literally reads ONE FIELD — both were about to be lying about
the game. The new still is the same golden-hour register on the new spot
(brick, graffiti, handrail, quarter pipe, downtown behind), UI-free and
full-bleed, and the menu loop is animated FROM it so the cycle closes on
itself. Menu archetype is unchanged: the wordmark still has open sky to sit in.

**2026-07-27 — the motion vendor ran out of money, and the tricks are being
built without it.** All eight trick clips failed server-side with
`Uthana: Insufficient balance: $-0.90 (minimum $-1.00 required)`. Image, texture,
model, skybox and sfx generation are all unaffected — it is the motion lane
alone. Nothing will re-queue successfully until that account is topped up, so
re-running them is money for nothing.

The fallback is not a downgrade, because in real skating the difference between
these tricks is mostly **the board, not the body**:
· **kickflip / heelflip / shove-it** — the body is an ollie in all three, and
  this game already has a real hand-authored ollie on this exact skeleton. The
  trick is the BOARD's axis: roll one way, roll the other, spin flat. Driving
  them off `boardFlip` also fixes a known defect — the kickflip is the last move
  still on the compiled motion set and jolts ~47° at the pop.
· **manual / nose manual** — board pitch plus a rig-level weight shift. No clip.
· **50-50** — the rolling stance already IS a skater standing on a board.
· **boardslide** — the same stance yawed across the line; the yaw machinery
  exists.
· **grab** — the only one that genuinely wants a new clip. Additive off the
  crouch, or left out and said so.
An earlier rate-limit wave (HTTP 429) also hit this batch; those all recovered
on backoff and landed. No generation is ever re-run once it has an id — that
would bill a second one.

**Animation note:** the Meshy catalog has NO skateboard actions (`animations
search "skateboard riding stance"` → 0 results), so all three moves the player
asked for are custom `genex motion` sets, compiled locally into a
rig-independent set the vendored runtime retargets onto the Meshy skater.

## World & scale
One street block, roughly 66 × 64 m, built as ~28 analytic solids that the
visible mesh and the physics query BOTH read — one description, never two.
A plaza of concrete slabs with an asphalt road across it, a 6-stair and a
3-stair each with a handrail, waxed ledges and a manual pad, a bank, a hubba, a
loading dock, a flat bar, and a quarter pipe with a coping you can launch off.
Buildings and a chain-link fence bound it, so the edge of the world is the
street's own geometry rather than an invisible wall. No streaming — the block
is small on purpose, because a THPS level is a place you learn, not a place you
travel across.

## Multiplayer
Single-player. The mechanic is the whole ask; nothing shares a world yet.

## Modules — the build split
Milestones 1–6 were built serially by the main agent (sub-agents were disabled
by operator instruction at the time, and the motion model, the animation state
machine and the camera are one feel that has to be tuned against itself).

**Milestone 7 runs in parallel** — the player asked for it explicitly. The
five lanes touch disjoint file sets by construction: the shared spine
(`skate-model.ts`, `surface.ts`, `contracts.ts`) is written FIRST, in one
pass, and every lane then codes against those types. One writer per file,
always. The main agent keeps `main.ts`, `skater-rig.ts`, the previews and the
player conversation.

| Module | Owns files | Built by | Parallel? | Done when |
|---|---|---|---|---|
| Shared spine | src/skate/contracts.ts, src/skate/skate-model.ts, src/world/surface.ts | spine agent | **serial — everything depends on it** | tsc green, every lane's types exist |
| 7a Street spot | src/world/spot.ts, src/world/props.ts, src/world/field.ts, src/world/terrain.ts | world agent | parallel — reads the surface contract, writes only world/ | the spot reads as a real street |
| 7b Grinding | src/skate/grind.ts | grind agent | parallel — its own file, called from the spine | rails lock on, both orientations, exits clean |
| 7c Spins + switch | src/skate/mirror.ts, src/skate/skater-anim.ts | anim agent | parallel — owns the animation layer alone | he rides both ways, clips mirrored |
| 7d Ragdoll + ramps | src/skate/ragdoll.ts | physics agent | parallel — its own file; ramp feel lands in the spine | bones collapse, transitions ride |
| 7e Tricks + input | src/skate/tricks.ts, src/skate/input.ts | tricks agent | parallel — table + bindings, no spine edits | every trick fires and reads |
| Audio | src/audio.ts | audio agent | parallel | grind, land, bail, roll all speak |
| HUD + screens | src/ui/** | ui agent | parallel | trick names, combo, new controls list |
| Integration | src/main.ts, src/skate/skater-rig.ts | main agent | serial, after the lanes | it all boots and plays |

## Stands — where this game lives, and how it gets promoted
The game exists as TWO projects, one per stand, and they are separate rows in
separate databases that happen to share a slug:

| | project id | plays from | dashboard | token |
|---|---|---|---|---|
| **dev** (where we build) | `cms0e8m2z000622nu3u3lokje` | `skate.auras.cc` | `dev.genex.games` | `~/.genex/env` |
| **prod** (the public page) | `cms6hpop500ds2co5sw3n8m1k` | `skate.genex.technology` | `genex.games` | `~/.genex/env.prod` |

Same account (`team@genex.games`) owns both. `.genex/project.json` binds this
FOLDER to exactly one of them, and `genex preview/publish` follows that file.

**Promotion is a copy, not a rebuild** — and that is by design, not luck.
`src/genex.config.ts` reads `window.__GENEX__`, which the serving host injects
ahead of the bundle; production serves
`{apiUrl: "https://api.genex.games", dashboardOrigins: ["https://genex.games"]}`.
So ONE build is correct on either stand and an immutable bundle can never pin
the wrong environment. Verified against the live prod page, not assumed.

**Assets do not move.** Every generated asset URL points at `assets.auras.cc`,
which serves `access-control-allow-origin: *` — checked with a request carrying
`Origin: https://skate.genex.technology`. The live prod bundle already loads 36
of them from that host. This is a real cross-stand dependency worth knowing
about: if the dev CDN ever restricts origins, the prod game loses its art.

The promote, run from this folder:

```
cp .genex/project.json /tmp/project.dev.json                                  # the dev binding
npx genex link skate --force --api-url https://api.genex.games --env ~/.genex/env.prod
npx genex publish            --api-url https://api.genex.games --env ~/.genex/env.prod
cp /tmp/project.dev.json .genex/project.json                                 # hand the folder back to dev
```

Do NOT pass `--title` (prod's title is "SKATE" in caps; omitting the flag keeps
it) and do NOT pass `--regenerate-cover` unless the art actually changed. Do NOT
switch the npm channel to do this — `@genex-ai/cli-demo@dev` talks to the
production API fine over `--api-url`; installing `@latest` would swap the
installed skills and re-point every command at the wrong stand.

## Decisions & changes
- 2026-07-30 (evening) — **THE HATCHED STRIP ALONG THE NORTH WALL.** The player
  reported "square clipping" where the far ramp's deck meets the brick, and read
  it correctly: two things at the same level, fix the OTHER one, leave the ramp
  height alone. Measured in the scene rather than guessed — every mesh with a
  face within 25 cm of 3.4 m near the wall — and it was one line: the shopfront
  plinth in `bandsOf` spans y 0 → 3.40, and `BACK_DECK_Y` is 3.40. Coplanar over
  the 0.5 m the band stands proud of the brick, 74 m along the north wall plus a
  run down each side. Two unrelated 3.4s. Dropped the plinth to 3.32 — DOWN, so
  it hides under the deck; raising it would have put an 8 cm lip across the
  landing. Verified with a before/after pair from the same camera on the deck.
- 2026-07-30 (evening) — **PROMOTED TO PRODUCTION.** The player asked for the
  dev build to land on his existing `genex.games/world/skate` page. Confirmed
  first that the prod project is his own (same account, published 2026-07-29,
  93 plays — an older snapshot of this same codebase), that the assets need no
  migration, and that `tsc` is clean. Procedure recorded above under Stands.
  README's play link now points at the production world page.
- 2026-07-29 (afternoon) — **MILESTONE 10: THE PLAYER'S SECOND AND THIRD LISTS.**
  He played the live build and came back twice. Working mode unchanged: focused
  change, parallel sub-agents, him as the critic.
  - **CAMERA REBUILT** (`src/camera/skate-camera.ts`), to his spec — "closer and
    slightly lower, not from above… follow more smoothly with a slight delay…
    for looking around, DON'T use right mouse button". `CAM_DISTANCE` 7.0 →
    **4.5**, rig pitch 14° → **7.5°**, `SWING_RATE` 2.2 → 1.4, `smoothTime` 0.14
    → 0.20, `LEAD_MAX` 0.7 → 1.1. Measured: the skater goes 150 px → **265 px**
    tall standing and 130 → 156 at 59 km/h; lens height over the deck 3.11 →
    2.03 m. **The RMB gate is deleted** — guard listener, latch, tap-slop and
    right-click hand-back all gone; pointer lock was already owned by the rig
    and it was the guard that made it feel button-gated. Hand-back is now an
    **auto-recentre after 1.2 s of mouse stillness, gated on riding** — chosen
    over a key precisely because a key would need a row on the HUD strip.
    Trade, stated: a 0.20 s spring trails ~3 m at speed, so effective distance
    is 4.5 m parked and ~7.5 m flat out; and the boom rides 0.58 m over the
    pivot instead of 1.66, so it is blocked more often and the lift answers.
  - **THE FAR WALL — both of his reports were one piece of geometry**,
    `back-trans`, the 2.2 m / 70° bank welded to the north shopfronts. Its lip
    stood exactly ON `SPOT_MAX_Z`, which is the wall's face, so there was no
    CORNER for `lipDecision` to release the board over: the last stride of the
    climb was still on the ramp when `advance` met the brick, and the wall was
    charged the **whole** speed instead of cos 70° of it. On the line the level
    teaches, a wall event at (2.0, **2.29**, 48.00) at 3.78–4.24 m/s **every
    clean lap**. The other half — riding THROUGH — was the alley banks: a 70°
    bank turns 0.94 of lip speed into vertical, the ride's ceiling is 18.2 m/s,
    and the 8 m end walls were cleared by 1.00 m, one run finishing rolling on
    TOP of one. Fixed: lip pulled **2.8 m clear** with an 11.3° apron carrying
    to the wall (a flat deck was tried first and was worse — he landed out of a
    6 m air onto flat concrete and parked at 0.00 m/s), alley walls 8 → 12 m,
    fence 2.4 → 3.0 m. `collide-sweep` 10/11 → **12/13** with two new checks,
    both watched failing: 9,720 launches off all 54 non-flat tops at a top speed
    the harness CALIBRATES from the ride rather than types in.
  - **MANUALS.** Two gaps he found by playing. (a) Push in a manual did nothing
    legible — the flat `MANUAL_MAX_HOLD = 4` clock is gone and **a push now ENDS
    the manual and banks it**, decided by which key arrived SECOND, the rule the
    game already runs for W vs Space. (b) A manual could be held for ever;
    `SkateModel.stepManual` is now the manual's answer to `Grinder.update` — an
    inverted pendulum, a two-sine wander that ramps with seconds on two wheels,
    A/D correcting. **The deck IS the meter**: `manualPitch()` maps balance to
    rake, 5.2° at the wheels-coming-down edge, 17.2° on the point, 29.2° at the
    tail scrape. Measured: hands-off **4.05 s**, full fight **16.3 s**, wrong key
    1.00 s. Losing it drops the wheels — never a bail. The HUD gauge follows it
    (`main.ts`), and `#hud.balance-up #hints` hides the control legend, which the
    two rows used to collide with.
  - **THE GRAB'S TAKE IS DROPPED, DELIBERATELY** (`cms52e6vl005v22ozt9yakk6b`,
    generated and now wired NOWHERE — this is the plain line the preflight asks
    for). The player: "the grab in the air has a crappy animation; it works
    crookedly". From the captures he was doubled over face-DOWN into his own
    knees with BOTH hands clamped to the board, the free hand on the nose at
    2.7 cm and the GRABBING hand hovering over the centre line 11.4 cm up,
    touching nothing, folded 19.2° toward the nose and 22.6° across the deck at
    once — the diagonal is the "crookedly". Take on vs off made every column
    worse and no `owns` value rescued it (arms 38.6 cm, upper 22.7, torso 11.4,
    none 6.5): the clip is a performer with no board crouching to pick something
    off the floor. `POSTURES.Grab.spread` 12 → 28 so the free hand clears the
    deck. **A replacement must be video → motion, not text** — text-to-motion
    cannot do prop stances, which is exactly what failed here.
  - **THE "SUPER SHINE" WAS NEVER POST — it is a defect Meshy ships on every
    rig** (`src/render/body-shine.ts`). Read out of the GLB's own JSON chunk:
    `emissiveFactor [1,1,1]` with `emissiveTexture` pointing at the SAME image
    as `baseColorTexture`, so the character's albedo is wired into the emissive
    slot at full white — he was a lamp shaped like himself. And
    `pbrMetallicRoughness` carries NO `metallicFactor` and NO `roughnessFactor`,
    whose glTF defaults are **1.0**, applied verbatim by `GLTFLoader` — so
    cotton, denim and skin rendered fully metallic, a metal has no diffuse
    term, and essentially all his brightness WAS the emissive. That is why the
    glow was flat and why it never dimmed in shade. Measured: the flat of his
    back at display L **0.799** with 23.6% of that band over L 0.92, against
    plaza concrete at 0.389 → **0.165** blown, from one material property.
    `EMISSIVE` kept at **0.3** rather than 0 because the player likes it —
    "maybe make it a bit weaker", not remove.
  - **THE UI, to a THUG reference he sent.** Name stays **SKATE** — he decided
    it explicitly after being offered eight alternatives and after raising the
    trademark point himself; it is his call and it is recorded as his. Style:
    **period-accurate 2003**, his pick over a restrained reading. Font:
    **Michroma** added to `index.html` — wide squarish techno, the closest free
    face to the reference's Handel-Gothic-ish font; it is now the game's
    numeric/techno face (anything that counts, indexes or measures), Anton keeps
    anything that SHOUTS, Barlow Condensed keeps small caps. HUD: score left,
    trick + its value bottom centre, controls right as **old-school keycaps**.
    Title screen: the game's own rig in real 3D on a skate-shop backdrop with
    the menu rail left, character picker wired to both rigged bodies.
  - **New art, all wired:** logotype `cms5y41hg00wa22lbj0lw0t4h` → trimmed to
    `public/ui/logotype-2003.png` (941×336, real alpha, speckle 0); loader plate
    `cms5y3dqu00w722lbeizx8cci` (split from the title still — the two screens
    stopped being the same picture); skate-shop backdrop
    `cms5y32q400w422lbn1ptwipz`. **Director error worth recording:** the backdrop
    URL was handed to the menu lane with a wrong generation id and 404'd for
    twenty minutes. The lane's fallback caught it and kept the key art, which is
    why it cost nothing — verify an asset URL before handing it on.
  - **Two lanes died to a stream watchdog mid-verification** (the HUD and the
    first render lane), both with working code already in the tree and tsc
    clean. One resumed from its transcript; the other had no transcript and its
    remaining work — the post-effects survey — was finished by the director.
  - **Post-effects the player chose to try next**, from a menu written for him
    in plain language: **lens dirt**, **distance blur**, and **"pixelating"** —
    built as the PS2 reading (an internal RENDER SCALE, since PS2 rendered at
    ~640×448 and upscaled), never the PS1 one (mosaic, wobble, affine warp),
    and defaulted OFF at every tier because it is an experiment he wants to look
    at rather than a shipped decision.

- 2026-07-29 — **MILESTONE 9, WHAT LANDED.** In order of the player's list:
  - **Map 2 parked** — `src/world/maps.ts` registry row and import commented,
    not deleted. `maps()` returns one entry, which is what makes the menu's
    spot picker vanish: `src/ui/menu.ts` now RENDERS the row conditionally
    rather than hiding it, because keyboard nav is built by querying
    `.menu-btn` and a `display:none` button eats an ArrowDown.
  - **The crosswalk is gone** (`src/world/props.ts`). The cause of the glow is
    worth keeping: the zebra and the road markings were `MeshBasicMaterial`
    with `toneMapped: false`, so 0.89-white paint reached the bloom knee
    ALREADY over it while everything else in the level was tone mapped. The
    zebra is removed outright; the lane lines stay and are now tone mapped.
    `crossingCanvas` is kept and exported so the recipe survives.
  - **The board no longer respawns sideways or upside down.** Two writers
    described one node differently: `SkaterRig.followFeet` writes ONE axis of
    `boardPitch.rotation`, `BoardFall.pose` writes a whole quaternion, and
    nothing ever put roll and yaw back. Worse, `pose()` read its own `home` off
    that node, so the return blended toward the tumble it was undoing and
    CONVERGED on it. Measured: 180.0° of roll at 12 and 16 m/s, 4.7–5.1° of yaw
    at every speed → 0.0° and 0.0° everywhere.
  - **Push resumes after a jump.** `pushLocked` had one release — the push key
    coming up — and the player never let go of W. It is a tie-break between two
    keys held AT ONCE, so it now also ends when Space comes up. Measured, W held
    throughout: 2 kicks and 4.7–5.1 m/s → 4 kicks and 14.1–14.7 m/s.
  - **R no longer drags the board across the block.** `RagdollHandle.cancel()`
    added (`contracts.ts`, `ragdoll.ts`) and called from `SkateModel.reset()`.
    Both of the fall's exits are journeys HOME and a teleport moves home;
    `BoardFall.cancel` already existed and had no caller.
  - **The manual is a wheelie now.** The deck pitched about its own middle, so
    at 17.2° the rear contact patch sat 7.4 cm UNDER the tarmac; it now rotates
    about the loaded truck's contact patch (rear for a manual, front for a nose
    manual, faded out with `airBlend`), rear contact 0.0 cm. And the rider
    stands up: `POSTURES.Manual.lean` 26 → −26 (nose manual −26 → +26) so the
    posture CANCELS the deck's rake at the waist. Torso 30.7° → −6.1° against
    rolling's −5.0°. `stand.rotation.x` deliberately KEPT — his feet are 35 cm
    apart along a deck raked 17°, which is 5.2 cm of height between them, so
    levelling the whole rider drives the front shoe through the griptape. The
    rake lives on the legs; the waist takes the torso back to vertical. That is
    the player's "it's just his legs", literally.
  - **Post-landing drift fixed** (the milestone-8 measurement finally applied).
    The push anchor latches the last SETTLED frame — wheels down, both soles
    riding, no cushion still crossfading — instead of the live foot. Measured at
    20/100/200 ms after touchdown: −1.2 / −1.7 / −0.7 cm, where the live foot on
    those same frames was −17.8 / −20.9 / −21.8 cm. No damping.
  - **Motion blur** — `src/render/motion-blur.ts`, a camera-reprojection
    shutter between GTAO and bloom. No velocity buffer, and the reason is the
    game: the skater travels WITH the chase cam, so his screen velocity is near
    zero exactly where a per-object pass would spend most, and a full-res RG16F
    target is 8.2–33 MB against a build already at ~764 MB. Rotation
    reprojection is exact at any depth (a carve, the loudest motion here, has
    zero error); depth is the analytic ground-plane hit, so walls are
    UNDER-blurred — every error points the safe way. Normalized against 60 Hz so
    the blur is not a property of the player's frame rate. **0 MB, +0.30 ms at
    1440p.** Off on low and phone-low, 5 taps on medium, 8 on high.
  - **Volumetric clouds wired** into map 1 at coverage 0.22 (0.38 took the
    golden hour out of the top third of the frame). Desktop tiers only — phones
    are off on FILL, not memory: 14 steps over a fifth of a 585×1266 frame is
    2.1 M dependent 3D fetches. `src/world/sky/` untouched, so this is
    revertible, and `CLOUD_STEPS` keeps its phone rungs.
  - **The body learns it is airborne from the RIDE** (`main.ts`). `setAir` had
    two callers, both trick-driven, so the only airs that reached the skeleton
    were ones a pop announced — and the biggest air the spot produces has no pop
    in it: off the quarter pipe's lip is 1.6–1.7 s and 5 m up at every speed
    from 12 to 20 m/s, with `onPop` never firing. He flew it standing.
  - **Three harnesses re-pointed, and all three because the PLAYER overruled a
    decision, not because a test broke.** `input-matrix` asserted the push must
    never return while W is down — that was the reported bug, written down as a
    requirement. `anim-check` asserted the rider leans ≥15° further over the
    tail in a manual. `integration-check:536`'s measure is unchanged and still
    right; only its name lied. 17/17 and 24/24.
  - **Characters.** NPC: concepts `cms5tnc4y00at22lb98lwlgbw` → preview
    `cms5tukx400bq22lbbmkvnh3g` (candidate 2, player's pick) → finalizing at
    10,000 faces. Second skater: candidate 2 of `cms5tocve00b322lbfl1k3sim`
    previewed as `cms5tuotk00bu22lbx7pwijv8` and **rejected by the player** —
    the sweater lost its grey and its crop in the 3D pass. A sharper text brief
    (`cms5uo04d00du22lbcu5u3h59`) was also rejected: *"I don't like this girl at
    all. Make it a completely different vibe."* Third round is **goth-skate**,
    his pick from four offered directions.
  - **The second skater is PARKED**, the player's call after three rejected
    rounds: *"Park her, get back to the game."* Not cancelled — she comes back
    when the game side is quiet. What exists and is paid for: three concept
    sets (`cms5tocve00b322lbfl1k3sim`, `cms5uo04d00du22lbcu5u3h59` goth-skate
    `cms5uzylb00ee22lbdxubbwfd`), one 3D preview (`cms5tuotk00bu22lbx7pwijv8`,
    never finalized so never rigged), and **one thing genuinely worth keeping:
    `cms5v5y7h00ga22lbo7gx7xeg`, an A-pose plate made by running `genex image
    --edit bar/girl_skate.png` on the player's OWN file.** It holds his
    reference's outfit exactly — sweater, both belts, cargos, boots — on a
    square-on neutral pose with a different face. If she is picked up again,
    the brief is transcribed from that plate rather than from a candid photo,
    which is the one thing not yet tried.
  - **THE GRIND HARNESS HAD NEVER PRESSED X.** `tools/integration-check.mjs`
    contained no `KeyX` and no `slideHeld` anywhere, and `frame()` merges over
    `EMPTY_INPUT`, which sets `slideHeld: false` — so every one of its twelve
    grind and boardslide cases has been unreachable since milestone 12 made the
    grind a held key. They were red because the key was never sent. **57/75 →
    69/75, and exactly those twelve flipped**; the six survivors are
    byte-identical and none of them touches a rail. This is the worst kind of
    harness failure — a false RED — and it hid a real grind fix behind noise
    for a whole night. Proven-against-a-real-break also went 33/75 → 46/75.
    A second instrument bug fell out of it: *"still rolling on the far side"*
    read the speed at a fixed 0.4 s after touchdown, and `flat-bar` points
    straight at the quarter pipe, so at 8 m/s it measured him mid-climb at
    1.35 m/s while he was still going UP. Identical numbers with X up, so it
    was the instrument and not the ride.
  - **The six remaining reds, shown to the player, who chose to play first
    rather than queue them:** the wall is not heard and an 18 m/s wall does not
    put him down · a rider holding push cannot reliably ollie · popping at the
    quarter-pipe lip bails instead of launching · the coasting band has a hole
    in it · speeds in that band that fly do not come back down rolling · the
    six-stair rides away with speed 3 times in 99.
  - **Previewed and live** — `https://dev.genex.games/world/skate`. Two
    preflight lines, and neither is noise:
    - **~870 MB estimated phone GPU memory, up from ~764.** The rise is the
      NPC's own rig: a second 10k-face character with its own texture set,
      loaded on every tier. Mobile is ticket item 7 and is untouched, so the
      build was already over the <700 MB modern budget — but this made it
      worse and the cause is today's work. The cheap mitigation is a tier gate
      in `src/world/npc.ts` (`phone` and `phone-low` fall back to the player's
      manifest, which is what he wore yesterday), saving the whole second
      character on exactly the platform that cannot afford it. **Not applied
      unasked** — it changes who is standing in the plaza on a phone, which is
      the player's call, and it does not on its own bring 870 under 700.
    - **"Post stack with no devicePixelRatio cap — cap at 1.5 on phones."**
      Already satisfied in substance: `TIERS['phone-low'].dprCap` is 1 and
      `TIERS.phone.dprCap` is 1.5, applied at `main.ts:88`. The preflight looks
      for the cap beside the composer and this game keeps it in the tier table.
      Nothing to change.
    - **The 23 unwired generations, in one line:** they are SUPERSEDED, not
      forgotten — the milestone-1 grass/sky/board set belongs to a game that
      has not been a field since the spot landed; the milestone-4 texture set
      was replaced by the matched set with normals and roughness; and every
      `video` in the list is a motion REFERENCE whose clip is wired (the video
      is the input, the motion id is the asset). The genuinely idle ones are
      the two cumulus skyboxes (`cms59etqc`, `cms59ev8j`) and they are on the
      open list above.
  - **Asked and answered: can the reference photo make the rig directly?** No.
    `genex character` takes a text brief and nothing else — the only image the
    Image-to-3D stage reads is the concept it generated itself. `genex image
    --edit <file>` takes a local file but produces a picture, not a rig. So a
    reference reaches the model through words. Separately, and independent of
    the tooling: both references are photographs of real, identifiable people —
    the briefs describe the clothes and the attitude, never the face.

- 2026-07-29 — **WHY THE FRAME IS ONE ORANGE WASH, MEASURED — and it is not the
  post stack.** Lane A shipped a real post chain (composer → GTAO → bloom → a
  PS2 grade doing exposure, ACES, unsharp, contrast, split tone, vibrance,
  vignette, grain, ordered-dither quantise) and its own fresh critic then proved
  the picture had barely moved, with numbers off the running game:

  · **98.2% of the chromatic pixels in the frame sit inside a single 60° hue
    window**, and again 98.4% after lane B swapped the ground textures
    underneath the measurement. It is not one bad texture — the whole image is
    one hue.
  · **Pixels bright enough to be a highlight (L > 0.92) are 0.083%, and 0.001%
    after the swap.** There is not one specular hit in the game.
  · Named surfaces: the steel edge strip capping the manual pad and the handrail
    behind it are both flat black bands with zero value change along their top
    edges — at golden hour under a 4.1 key those are exactly the two surfaces
    that should carry a hot line. The shopfront GLASS is a flat dark-brown
    rectangle with no reflection, no sheen and no frame highlight, sitting
    beside brick at the same matte value. The quarter-pipe transition and the
    plaza floor it rises out of are the same hue at nearly the same value.

  **THE TWO CAUSES, both in files lane B owns, both fixable:**

  1. **THE FOG IS THE WASH.** `field.ts` fogs `0xe0a468` from **14 m** to 150 m
     on a block that is 66 × 64 m, with the camera 5.4 m behind the skater — so
     essentially everything past his own shadow is already mixed toward one
     amber before the post stack is handed the buffer. On phone-low
     (`drawDistanceScale` 0.5) it starts at **7 m**. The earlier round-6 note
     "one flat coat of colour on everything" was diagnosed as fog starting too
     FAR; the correction over-shot and it now starts far too near.
  2. **THERE IS NO SPECULAR TO RECOVER.** Ground materials are roughness
     0.96–1.0 at metalness 0, most props 0.85–0.98, and
     `scene.environmentIntensity` is 0.34. A rough dielectric under one
     directional light returns no visible highlight, so "no specular anywhere"
     is a MATERIAL fact, not a post one. Bloom can only spill a pixel that is
     already bright. Roughness variation across the plaza, waxed ledges and
     coping down around 0.35, and a higher environment intensity would give the
     grade something to work with.

  This is the same thing the player said in his own words the same evening —
  *"there are no post-effects here, as far as I understand"* — and it is why:
  the stack is real and it is grading a scene with nothing in it to grade.
  **Post cannot put back a highlight that was never rendered.**

  Also applied in `main.ts` this round, from lane A's cross-lane requests:
  `rendererAntialias(tier, true)` now that a composer exists (the context's own
  MSAA was multisampling a framebuffer nothing reads), and the governor's
  `setPostEnabled` and `setDrawDistanceScale` rungs are wired — two of its six
  step-downs had been silent no-ops.

- 2026-07-29 — **FOUR MORE ASKS, same sitting, all recorded before they get
  lost.** In his order:

  **1. A SECOND CHARACTER — and it is explicitly SEQUENCED, not parallel.**
  *"I've put a ref girl_skate.png in the bar folder. Maybe u can make also a
  second character like that girl on reference and retarget all our animations
  to it and verify. So we'll have two characters, but that's AFTER you finish
  everything for the first one."*
  · The reference is a Y2K/early-2000s street look and it fits this game's era
    exactly: messy blonde hair, a cropped chunky marled knit with red
    embroidery, a studded belt, low-slung baggy black cargo jeans, a small
    studded belt bag, chunky platform boots.
  · **The character is generated from the LOOK, never from the person.** The
    prompt describes clothing, silhouette and era; it does not describe or
    attempt a real individual's face. `--edit` against the file is available
    (`npx genex image`/`character` take a local path) and is the right way to
    anchor the WARDROBE.
  · Every clip this game owns is on the first skater's Meshy skeleton, so the
    second character has to take them by retarget. The vendored runtime already
    retargets a compiled set onto a Meshy rig, and the hand-authored GLBs bind
    by bone name — so the real work is proving each clip on the new rig, which
    is what "and verify" means. It gets its own gauntlet lane.
  · **Gate: it does not start until lane F (animation) is dry**, because it
    would otherwise be retargeting clips that are still changing.

  **2. MAP 1 IS TO BE BIGGER — properly, not "a bit".** *"We also wanted to make
  Map 1 bigger — did you forget? I mean OVERALL."* The ticket's original wording
  was "a bit bigger", and this correction supersedes it: the footprint grows
  overall. It is currently one block of roughly 66 × 64 m.

  **3. MAP 1 SHOULD HAVE PHYSICS**, and the wall ask is repeated with emphasis:
  *"And it should have physics… You shouldn't be able to drive through walls;
  that definitely shouldn't happen."*
  · The wall half is ticket item 3 and lane E already owns it. It is not a new
    ask, it is the player telling us how much it matters.
  · "It should have physics" is NEW and it reverses a standing decision. The
    2026-07-25 entry reads *"no Rapier for v0 … Revisit the moment ramps or
    obstacles land."* Ramps and obstacles landed in milestone 7, so it is
    revisited: **Rapier comes in for LOOSE PROPS ONLY** — cones you clip and
    send skittering, a bin that tips, boards and rubbish that scatter. It does
    NOT touch the skater: the custom skate motion model over an analytic surface
    is the whole game's feel and four milestones of tuning, and handing it to a
    rigid-body solver would throw all of that away to gain nothing the player
    asked for.

  **4. THE AUDIO.** *"Also, think about the audio — sounds and music."* The
  honest state of it: **the music has been wired and SILENT since milestone 4**
  (`GameAudio.musicVolume = 0`, one track), because that is what was asked for
  at the time. It has never been turned up, there is one track for two maps and
  a menu, there are no settings sliders, and nothing in the mix responds to
  speed except the roll loop. That is the gap, and it is a lane.

  **AND THE STANDING NOTE ON BOTH MAPS:** *"just plan them so everything is
  logical and cool. And stylish, too. Add various fun details."*

- 2026-07-29 — **THE PLAYER LOOKED AT BOTH MAPS MID-RUN, AND HIS NOTES OUTRANK
  EVERY CRITIC IN THIS WORKFLOW.** Two captures were put in front of him
  (`shots/ask/m1.png`, `shots/ask/m2.png`) with one question: is this the look
  he meant by "AAA graphics styled like an old PS2". The answer redirects the
  art direction and lists eleven defects. Verbatim, and then what each one
  means:

  **THE DIRECTION MOVED.** *"Overall, we probably need to move toward a more
  modern vibe — what I mean is the textures themselves."* So the register
  splits in two and the split is now the rule: **the SURFACES are modern and
  realistic; the PS2 is the TREATMENT laid over them.** That is consistent with
  his own ticket line — *"ideally the map should be super realistic"* — and it
  retires any reading of "PS2" that meant crunchier textures. Nothing in the
  geometry or the material resolution gets coarsened to look old; the era lives
  in the grade, and only there.

  **MAP 1**
  · *"What are those glowing stripes? … remove the glow — it's really
    unnecessary, for sure."* The crosswalk paint is blooming. White road paint
    is a diffuse surface, not a light source, and a bloom threshold low enough
    to catch it is low enough to catch every pale concrete panel in the plaza.
  · *"The skybox used to be great, though I don't know where it went."* It IS
    gone — the frame shows a bare blue gradient where the golden-hour panorama
    (`cms2syf6o01ml22lplnxih4je`) should be. This is a REGRESSION, not a choice,
    and it is the same defect round 6 recorded as "cool opening sky against
    golden-hour key art" — which means that item was never actually closed.
  · *"There are no post-effects here, as far as I understand — we aren't using
    post-effects yet, right?"* The stack is wired and he cannot see it. Whatever
    the frame numbers say, a post pass the player reads as absent has not
    landed. It has to be visibly deliberate.
  · *"Maybe add some volumetric clouds."*
  · **THE LAYOUT, and it is NOT the furniture** — he corrected this himself
    within the hour, so read the correction and not the first note: *"I was
    talking about Map 1 — not the furniture placed without reason, but some big
    long rails and the transitions from one part to another. It all looks
    somewhat unrealistic and awkward. The furniture itself is fine. I meant the
    street layout … There's some clutter — fine for a skatepark, but this is a
    street-style park, so it should be a mix."*
    So: **the street furniture is FINE and is not to be touched for this
    reason.** What is wrong is the SKATE GEOMETRY — the long rails and the way
    one area hands over to the next. The spot currently reads as a SKATEPARK
    (oversized purpose-built rails, park-scale transitions) when it is meant to
    be a STREET spot: real street architecture — kerbs, stair sets, plaza
    ledges, loading docks, driveways, handrails that exist because a building
    needed a handrail — MIXED with skate features, rather than a park's
    vocabulary laid out on a street. A rail in a street spot is the length of
    the stairs it runs beside, not the length a park would make it.
  · *"Maybe also slap some graffiti on the ramp."*
  · *"We might need some motion blur to make it feel more modern."* Camera/
    per-object motion blur in the look stack. Note it is asked for as MODERN,
    which is the same redirect as the textures — the era treatment does not
    mean the frame should look like it is running at 20 fps.

  **MAP 2**
  · *"There should be some kind of jump at the start — maybe there is — where we
    drop into that big thing."* The map has to be ENTERED, from above.
  · *"There's graffiti, probably some bright graffiti, but it isn't needed; the
    graffiti should be trimmed."* — clarified: *"I meant the COLOURFUL
    graffiti — I didn't like it."* So it is the saturation and the multicoloured
    pieces, not the presence of paint. A real flood channel carries faded
    monochrome tags and roller work, bleached by sun and half scrubbed off.
    Map 1's bright wildstyle set belongs to map 1's brick and does not travel.
  · *"I see some kind of white thing … at the skybox level or whatever it is …
    You can see something white behind my character. That needs to be removed.
    The skybox is done very poorly."*
  · *"The ground textures are silly, kind of unrealistic."*
  · *"Where and why the skater is rolling in the second map"* — the place needs
    a reason to exist, the same note as map 1's furniture.
  · **Trees:** *"you can inspire by that: https://github.com/dgreenheck/ez-tree"*.
    Cloned to `.claude/reference/ez-tree` (MIT, Daniel Greenheck, 2024) as
    READING MATERIAL — `src/lib/tree.js` is the procedural branch/leaf builder
    and `src/app/clouds.js` is relevant to the volumetric-clouds ask above. The
    player named the tool, which is what AGENTS.md rule 4 requires; it is a
    procedural-geometry reference and generates no art, so nothing about the
    genex-exclusive art lane changes.

- 2026-07-28 — **SWITCH IS A REFLECTION, NOT A NECK.** The player, with a
  screenshot of the build shipped the day before: *"you just turned the head,
  while the body is facing backward even though I'm moving forward … when I'm
  riding forward … I push off the ground with my right foot. When I'm looking to
  the left — i.e. rotated 180 degrees — and still going forward, that's goofy …
  Then I should be pushing with my left foot."* He was right on both counts and
  the second one is the whole answer: no transform above the hips can move a
  pushing foot.

  **The model was one flag doing two jobs.** There are TWO independent facts
  about which way round a skater is, and the old `stance` was the two of them
  fused, which is why every setting of it was wrong somewhere:

  | | `stance` — half-turn | `fakie` — reflection |
  |---|---|---|
  | what turned | the RIDER, on the spot | the BOARD, under him |
  | caused by | rolling back down a ramp | landing a 180 |
  | his feet | swap ends of the deck | never move |
  | leading foot | the SAME one | the **other** one |
  | his shoulders | carried round with him | open the other way |
  | the push | same foot, same end | **other foot, other end** |
  | implemented as | a group above the skeleton | `src/skate/mirror.ts` |

  They compose, and the composition is exact: reflecting a clip applies
  S = diag(−1,1,1) in the rig's own frame, the holder yaw A = R(ŷ, −π/2) carries
  it to `A·S_x̂ = S_ẑ·A`, and ẑ is the board's nose — so a mirrored clip is the
  skater reflected nose for tail, which is fakie. Add the half-turn and
  `R(ŷ,π)·S_ẑ = S_x̂`, the sagittal reflection: a rider standing goofy with the
  nose still leading, which is precisely the one state that means it (a 180
  landed while already turned round). The old code paired the mirror WITH the
  stance, so the only two poses it could produce were the two nothing in this
  game is in.

  **Measured, riding away from a landed 180** (`tools/turn-check.mjs`, both spin
  directions): hips **−64.7° → +38.2°** off his line, chest **−63.3° → +43.3°** —
  the mirror of the angle he rides at going forwards, over the other shoulder.
  Head 22.1°. RIGHT foot leads (LEFT led going in), 12.3 m of air, rides away at
  10.7 m/s and 5.8° off the line he flew, deck −174.2°. The push, which is the
  part that cannot be faked: riding forwards the **RIGHT** foot kicks off the
  **TAIL** (0.44 m more deck than the other sole) with the LEFT leading; riding
  fakie the **LEFT** foot kicks off the **NOSE** (0.36 m) with the RIGHT leading.
  Both strokes go off the end BEHIND him, so both drive him along his line.

  The quarter-pipe roll-back is untouched and still measures the way the player
  asked for it: LEFT foot leads both ways, deck held to 0.0°, looking −11.5° off
  his line, worst frame 10.5°. `syncStance` now clears `fakie` on that path
  outright — he turned to face his line, so the wheels and his stance agree.

  **The harness was measuring the wrong bone.** `turn-check` read the HEAD and
  nothing else, so the rejected build — 125° of shoulder check over a pelvis
  still pointed backwards — scored 36° off his line and passed everything. It
  now reads hips and chest as well, and asserts they land on the FAR side of his
  line from where they rode in, at about the same angle. Watched failing: with
  the reflection removed, hips 129.7° and chest 133.3° and the same foot pushing
  off the same end (9 checks red); with the stance flipped on a landed 180 as
  well, LEFT → LEFT and 153.8° of body/deck disagreement (12 checks red). The
  push probe's first signature — "the pushing foot is the LOWER one" — was wrong
  and was caught the same way: the rig slides the skater so the planted sole
  rides the deck, so the free leg swings back and UP, and the two soles' lowest
  points were 14 mm apart. It reads deck TRAVEL now.

  Also gone: the shoulder check, its three constants, and `charUp`. Also fixed:
  `turn-check` never wired `onPush`, so no push probe in it could ever have
  fired a clip.

  **Verified by looking.** Local test build, driven through the game's own input
  layer: pushed up to speed, popped, spun the 180, and rode away — chase camera
  behind him, SWITCH lit on the HUD, his back to the camera and his body side-on
  down his line. The screenshot the player sent had his chest square to the
  camera.
- 2026-07-27 — **A 180 LEAVES YOU SWITCHED, AND YOU STAY.** The player, on the
  build from an hour earlier: *"We want to do a switch specifically so the guy
  rides in switch. Now you made it so I ride, I jump, I do a 180, my guy lands,
  and then goes back to his default stance. That's not normal… He should stay.
  So why does he turn back?"* He is right, and the harness had measured the
  evidence without anyone reading it: LEFT foot led going in, **LEFT foot led
  riding away**. Turning him round on the deck to face his line puts his feet
  exactly where they started, so the trick left no trace at all.

  **The two ways of rolling tail-first are different moves, and both of his own
  descriptions are now honoured.** This is the split that was built, deleted an
  hour later, and is now back with the reason written down properly:

  | | the ramp roll-back | the landed 180 |
  |---|---|---|
  | what turned | the ground sent him back | the board came round under him |
  | his feet | swap ends of the deck | never move |
  | leading foot | the SAME one | the **other** one |
  | his body | turns 180° on the deck | already turned, with the board |
  | his own words | *"the skateboard stays in place, my guy just turns the other way"* | *"he should stay… why does he turn back?"* |

  Measured on the real rig: 180 → RIGHT foot leads riding away, deck −174.2°,
  body −169.6° (turned ONCE, with the board), rides away at 10.7 m/s 5.8° off the
  line he flew. Ramp → LEFT foot leads both ways, deck held to 0.0°.

  **And the facing, which is the other half and the thing he reported before
  this.** Standing the way he landed, he is looking 169° off his own line — dead
  backwards. He is not turned round to fix it; he does what a skater riding fakie
  actually does and looks over his leading shoulder: 22° of waist, 43° of chest,
  60° of head, **125° in all**, eased on over 0.3 s, laid on ABOVE the hips so
  his feet and the board standing on them never move. He lands at **169° off his
  line and rides away at 36°** — the same angle he rides at going forwards, over
  the other shoulder.

  A twist is not a rotation and cannot be checked like one: turning 125° the
  WRONG way from 169° also ends up under 75° off, by going the long way through
  180° — on screen, him turning away from where he is going first. So turn-check
  reads the gaze at the touchdown FRAME, before the ramp has moved, and asserts
  the turn goes the short way to nothing. Watched failing at +117.6° against
  −133.4°.

  **Kept from the round before it:** the clip mirror stays gone. It was measurably
  wrong — the ramp turn used to leave him 155° off his line, and it is 17° now —
  and switch is a half-turn of the body and nothing else. `src/skate/mirror.ts`
  and `tools/mirror-check.mjs` remain deleted.

  **Three smaller things fell out.**
  · **A push follows the way he is GOING, not the way he is standing.** Rolling
    fakie, a kick up his own facing was braking him — a skater pressing forward
    and slowing down, which is what he described in round one as *"we're moving
    the character incorrectly"*. Below 0.05 m/s there is no travel to follow and
    his facing decides, so a standstill still pushes off forwards.
  · **One badge word.** SWITCH lights for both ways of riding the other way
    round, and both pay ×1.25. To the player they are one thing and he calls both
    of them switch; the game does not need a vocabulary he did not ask for.
  · **The settle direction was removed again.** No spin can reach a stance change
    under this rule, so "carry the turn the way he was last spinning" was reading
    a 360 from half a minute ago. Stale state dressed as an informed answer.

  Green: `tsc --noEmit` and `vite build` clean, `turn-check` **22/22**,
  `stance-check` 8/8, `switch-check` 9/9, `integration-check` 68/75 (the same 7
  pre-existing round-6 failures), `ragdoll-drop`'s 8 wall/bank scrub failures
  confirmed unrelated. Every new assertion watched failing: the guard dropped →
  the same foot leads and 7 checks go red; the shoulder check removed → 169° off
  his line; the shoulder check negated → the long way round.

  **Not verified by looking.** Keyboard input still does not reach the preview
  pane, so this is measured on the real ride, rig and animation rather than
  played.
- 2026-07-27 — **THE FACING ROUND: a skater faces the way he is going.** The
  player watched the fix from earlier the same day and reported the half of it
  that was still wrong: *"when I jump and turn 180 degrees in the air, the
  character keeps moving forward, but he's looking backward, in the opposite
  direction from his movement… we need to properly track which direction the
  skater is moving and which way the body and head should be oriented."* The
  momentum half was right — he does keep his line — and the orientation half was
  not, in both directions of a bug that had been hiding behind a harness.

  **What was actually wrong, and how it hid.** Nothing in the project had ever
  measured where the skater is LOOKING. `tools/turn-check.mjs` grew a gaze
  read — the character's bind-pose forward carried by however far the head has
  turned since, put back into the world and compared against the line he is
  really moving along, all of it re-derived inside the harness rather than
  borrowed from the code under test. It found two numbers, not one:

  | | riding forward | after the change |
  |---|---|---|
  | landed 180 | −42.9° off his line | **+167.7°** → −13.2° |
  | rolled back down the quarter pipe | −11.6° | **−155.1°** → −17.2° |

  So the ramp turn shipped yesterday was ALSO facing backwards, and the lead-foot
  check that guarded it passed the whole time: his feet swapped ends of the deck
  exactly as advertised while his head faced the way he came from. Feet are a
  necessary read and not a sufficient one — that is the lesson, and it is now
  written into both harnesses.

  **The cause was the clip mirror, and it has been removed.** Switch was a
  sagittal mirror of the take plus a half-turn of the body. That composition is a
  real stance — it is the skater standing goofy, riding NOSE-first, which is what
  switch means to a skater — and it is not this game's stance. Nothing here ever
  puts him switch while the nose still leads: the only trigger is the wheels
  running the other way, so the end he is rolling toward is always the TAIL, and
  a pose that faces the nose faces backwards. The half-turn ALONE is the rider
  turned round on his own deck, which is exactly what the player asked for in
  round one — *"the skateboard stays in place, my guy just turns the other way"*.
  `src/skate/mirror.ts` and `tools/mirror-check.mjs` are deleted; every clip is
  one take now, and the facing corrections stopped needing negated twins.

  **And the stance rule collapsed to one line.** Yesterday's round split the two
  ways of ending up rolling tail-first — the ground sent you back (turn him
  round: SWITCH) versus the board came round under you (leave him: FAKIE) — on a
  115° board-turn guard. The split is gone with the FAKIE state it existed to
  protect. `syncStance` is now `if (way !== facing) flip`, plus the 1.2 m/s
  deadband, and it does not care how the wheels came to be running backwards.
  Fixing a landed 180 in the NECK instead was measured and cannot work: closing
  167.7° of gaze needs an owl, not a shoulder check.

  **The "360 with the body" is fixed where it actually lived.** Putting the
  half-turn back onto landings brings back the risk the player named in round
  one, so the settle now turns AGAINST the spin: land a 180 spun screen-right and
  he swings back screen-left onto his line — a revert, whose net body turn over
  the whole trick is zero. turn-check runs the spin scenario BOTH ways round and
  asserts that zero; before the direction was wired, the screen-left 180 netted
  **349.7°**, which is the player's complaint in a number. (The direction was
  tried and rejected in an earlier round for a reason that went with the mirror:
  the two arcs used to be 99.5° and 259.5°, so picking by spin picked the long
  one half the time. Both are a clean 180° now.)

  Because the body's whole 180° now lands on the rider instead of being half
  eaten by the mirror, `STANCE_TURN` went **0.35 → 0.45 s**: at 0.35 the settle
  peaked at 13.9° a frame, 834°/s, nearly twice the air spin's own 435°/s — a
  settle turning faster than the spin that caused it. It is 9.2° now.

  **FAKIE is gone from the game.** No state reaches it: the HUD badge is SWITCH
  or nothing, and the ×1.15 fakie multiplier is removed (switch keeps ×1.25). One
  word for one thing.

  **Watched failing, all of it.** The stance pinned square → 8 turn-check checks
  red and the feet stop swapping. `syncStance` neutered → the landed-180 and the
  ramp both ride away 158°/167° off their line, and 12 spins in the 0–400° sweep
  answer `regular (want switch)`. The settle cut to one frame → 179.9° of gaze in
  a frame against the trick's own worst of 34°. The deadband removed → the
  dithering-at-a-standstill check and five others. Two of my own new assertions
  were caught being useless first: the gaze-ease window opened AFTER the turn was
  over and read 0.2° against a deliberate snap, and turn-check had been passing
  `rig.spinRate ?? 0` — a property `SkaterRig` does not have — so every scenario
  in it had run with no spin tracker at all and the flourish had never once
  fired.

  Green: `tsc --noEmit` and `vite build` clean, `turn-check` **20/20**,
  `stance-check` 8/8, `switch-check` 9/9, `integration-check` 68/75 — the same 7
  pre-existing round-6 failures, and `ragdoll-drop`'s 8 wall/bank scrub failures
  confirmed unrelated by re-running them with the stance switched off entirely.

  **Not verified by looking.** Keyboard input still does not reach the preview
  pane, so this round is measured on the real ride, rig and animation rather than
  played. The gaze read is new and it is the strongest instrument this project
  has for the question the player asked; it is not a screenshot.
- 2026-07-27 — **THE STANCE ROUND, built and pushed.** Three things the player
  reported by watching the game, all of them one question wearing three hats:
  which way round is the rider standing, and who decides. Answered once, in
  `SkateModel.syncStance`, which is now the only writer of `stance`.

  **1. "when the switch happens the character rotates 360 with the body again."**
  He was right and the cause was double-counting. A spin turns the WHOLE
  assembly — `heading` carries it degree by degree and the rig swings deck and
  rider together — so a landed 180 is already 180° of body. Flipping the stance
  on top of it added a second half-turn on the rider ALONE. Measured on the real
  rig through the new `tools/turn-check.mjs`: a deck that came round −152° left
  the body having netted −58° once the stance ramp finished, a **95° disagreement
  between the plank and the man standing on it**, arriving as a swing back the
  other way a fifth of a second after touchdown. A landed spin no longer touches
  the stance at all; measured after: body −168.6° against a deck of −174.2°.

  **2. "when I ride onto a ramp and off it my character doesn't turn around …
  the skateboard stays in place, my guy just turns the other way."** Nothing in
  the game could reach that state — `setStance` had exactly one caller, the spin
  landing. Now: roll the wheels backwards past a deadband with the board holding
  its heading and the rider swings a half-circle on the deck to face where he is
  going, mirrored clip set and all. Measured end to end off the real quarter
  pipe: climbs 1.03 m, rolls back at −5.25 m/s, **deck held to 0.0°**, body
  eased round at **6.7° on its worst frame**, and the same foot leads his line
  before and after.

  **3. "when I jump and rotate 180 in the air, my character doesn't keep moving
  forward switched."** The landing was REDIRECTING him: a landed half-turn set
  the course to the new heading, so a 180 turned your line through 180° with it
  and you rode off the way the nose now pointed. That was a decision recorded
  here on 2026-07-27 and it was wrong for this game — a player who spins a 180
  over a stair set finds the line he was riding gone. Momentum is not a rotation.
  The landing now asks one question of the geometry, is the nose still pointing
  where the momentum runs, and keeps every metre per second either way. Measured:
  12.3 m of air, rides away at **−10.7 m/s, 5.8° off the line he flew**, other
  foot leading.

  **[The split below is RIGHT and is what ships — see the entry at the top of
  this log. What was wrong with it was the facing, not the split: it left the
  rider's head 168° from his line, and the round that "fixed" that by collapsing
  the two states was reverted within the hour. He looks over his shoulder now.
  The clip mirror is gone, and the badge says SWITCH for both.]**

  **The rule, in one sentence:** *he turns round on the deck when the ground
  sends him back the way he came with the board still pointing where it was; if
  the BOARD came round instead, he came round with it and there is nothing left
  to do.* Which is why **fakie and switch are two states again** and the collapse
  of them attempted earlier in this same round was reverted:
  · **FAKIE** — the board came round and he did not. Every landed 180. His feet
    never moved on the deck, so no clip mirrors and no body turns.
  · **SWITCH** — HE came round and the board did not. The transition roll-back.
    Clips mirror, `stanceGroup` carries its π, badge reads SWITCH.
  Both roll tail-first, so the sign of the speed cannot tell them apart and the
  stance is what settles it — in the HUD badge, in the trick names and in the
  score bonus (switch ×1.25 beats fakie ×1.15: switch is the one you had to do
  something to get into).

  Three consequences fell out of switch becoming a state you can HOLD rather
  than a flag you land in, and all three were latent bugs:
  · the push drives along the way the RIDER faces (`rideSign`), so a skater
    facing downhill pressing W no longer brakes;
  · `Math.abs` on the push's own speed ceiling — read signed, a switch rider at
    15 m/s was under `MAX_SPEED` by any test and kicked forever;
  · the lean took its magnitude from the SIGNED speed, so `min(1, s/4)` read −5
    at 20 m/s backwards: five times past the bank's own ceiling, and the wrong
    way round, since a rider turned round on the deck leans to his right by
    rolling it the other way.

  **On the harness, because it lied again and the mutation tests are the story.**
  Every check in `integration-check`'s stance section was asserting the OLD rule,
  i.e. certifying the bug — the third round running that has happened here. They
  were rewritten and then each one was watched FAILING against deliberately
  broken code. Two would not fail at all: the air sweep read the settled stance,
  and the stance is a function of the speed, so whatever a landing does to it the
  same frame puts it back — the old rule was restored underneath it twice, once
  with the two rules reordered so the flip would survive, and it said PASS both
  times. It asserts the `onStance` EVENTS now, which is what the animation layer
  acts on: a switch→regular pair inside one frame is two 0.35 s body turns, a
  whip on screen out of a no-op in the numbers. And `turn-check`'s first attempt
  measured the body's angle across its course, which cannot survive a mirror —
  it was measuring the reflection, not the turn. It reads the lead foot against
  the DISPLACEMENT now, because an earlier version asked the model for its
  `course`, which reads the stance, so a build with the stance wired to nothing
  scored itself against its own broken answer and passed.

  Not verified by playing: keyboard input would not reach the preview pane, so
  there is no gameplay capture of this round. Everything above is measured on
  the real model, rig and animation layer stepped in main.ts's own frame order.
- 2026-07-27 — **HALF BUILT.** The momentum half landed in the stance round
  above (the landing keeps your line, whatever the spin did with the board); the
  RAMP half has not — the lip in the code is still round 5's vertical coping:
  **the quarter pipe's lip is a BANKED transition, not vert — and
  landing keeps your forward momentum.** Director's call, after five rounds each
  ending with the spot's marquee ramp broken in a new way. Round 4: radius 3.2
  over height 2.6 topped out at 79°, so airs flew out over the deck. Round 5 made
  it a true quarter circle, vertical at the coping — and every air then went
  straight up and came straight down with **0.00–0.67 m/s of roll speed left**,
  dead-ending the main line in the north brick.
  · A vertical coping is right for a real vert ramp, and a real vert ramp works
    because you come back down INTO the transition and the energy returns. This
    engine's surface query returns the highest surface at (x, z) and the deck
    sits at the coping, so "back into the transition" is not something it can
    express. Building that is a bigger system than this milestone.
  · So the lip tops out around 55–65°: you launch up AND forward, and you land
    still rolling. That is the THPS quarter that plays well, it is what the key
    art shows, and it deletes the whole class of bug at the root.
  · And the landing keeps the along-ground component. A skater who drops off a
    roof lands ROLLING — the legs absorb the vertical, not the forward.
- 2026-07-27 — **DECIDED, NOT YET BUILT** (same stopped round):
  **"speed retained" is the instrument this project was missing.**
  Nothing in the harness ever measured what a player has LEFT after using an
  obstacle — only apex, bail and lock-on. That is how "the quarter pipe is a dead
  stop" survived four rounds while the checks read 7/7 PASS: the check scored
  `rode: !bailed`, and every one of those runs came to a halt. An obstacle that
  leaves you at 0 m/s has not been ridden, however cleanly it avoided a bail.
  Every obstacle assertion reports it now.
- 2026-07-27 — **round 5, integration: the landing ruling landed, and two keys
  that did nothing got their jobs back.** Six lanes fixed their own files; the
  integrator applied the cross-file requests and then played the nine things
  round 4 said a player could not do, with a real keyboard on the real spot.
  · **`LAND_ABSORB` (9 m/s) no longer bails anything.** It is the vertical a
    pair of legs takes for free, and past it a hard landing scrubs
    `LAND_SLAM_SCRUB` (0.6) m/s of roll speed per m/s the legs could not take.
    The combo survives. Six-stair ollie **30% → 100%** across the width of the
    set at 30/60/144 fps; the quarter pipe with the throttle held **0% → 100%**
    at 30/60/90/144 fps, 8→20 m/s, popped or not. The old rule's cliff moved
    with the frame rate — deepest survivable drop 2.12 m at 30 fps against
    2.36 m at 144 — because a landing is judged on a vertical carrying up to
    `GRAVITY·dt` of overshoot. Falls now come from blowing a trick.
  · **You could not ollie while pushing.** `input.ts` spent the wind-up whenever
    the push key was DOWN, so W + Space + release gave `olliePressed` false on
    every frame — and the push key is how you get the speed to reach a stair set
    or a coping in the first place. The player's rule ("a push during the
    wind-up calls the jump off") is about REACHING for the push mid-crouch, so
    it is now an edge, not a level: the pop is spent only if the push key GOES
    down while Space is held. Rule kept, key returned.
  · **A rail put you on the floor while your board was still going UP.** 56 of
    252 kickflip-toward-a-rail approaches ended on the concrete, every one of
    them rising past a rail he would have cleared, having landed on nothing. A
    rail is a landing surface, so it only puts you down when you were arriving;
    rising, it now declines and he lands past it. `flip < 1` stays exactly as
    the director's rule has it — the change is *when* the rail is allowed to
    ask. It also asks at the moment the trucks met the line (`Grinder.crossedAt`)
    rather than at the end of the frame they met it in, which is up to 33 ms
    late at 30 fps and was the last frame-rate-dependent grind/bail outcome.
  · **A manual could not keep a combo alive.** The ride decides a landing while
    its state still says `air`, so the frame that touches down cannot be the
    frame a ground trick starts on — the bank had already cashed by the time E
    was announced, and a flip landed into a manual paid out and opened a fresh
    line underneath the player. `hud.carryCombo` is now routed from `onManual`
    and the landing's bank waits `BANK_GRACE` (0.12 s) for it. Measured on the
    same five inputs: **1,276 → 4,505** banked, one line instead of five.
  · **`spinFlipsStance` stopped calling every 90°–269° turn a 180**, in
    `contracts.ts` as well as in the ride — a sloppy pivot changed the player's
    stance and every mirrored clip in the game changed hands because he wobbled.
  · A landing now carries `slam` (the vertical his legs could not take) through
    to the animation and the audio: he folds deeper, the slap is louder, the
    body thumps. It is the whole of what "that was a big one" looks like now
    that height is a reward.
  · A character that streams in AFTER a stance change used to miss it outright —
    `onStance` is an edge and every listener of it is written `anim?.`. The boot
    now re-sends the current stance the moment the body resolves.
  · Two harness assertions were certifying the old rules and are fixed: the
    coasting band demanded that a bail exist, and "pop at the lip" triggered on
    a z that is 1.66 m of near-vertical wall now that the transition is a true
    quarter circle — it reads the height. `tools/ragdoll-drop.mjs` gained the
    settle assertion it never had (`frozen`: the fastest bone on the frame the
    body is declared settled, watched failing at 2.58 m/s against the old
    measure). **61/61** integration, 52/52 ragdoll, 9/9 switch, 8/8 stance.
  · **`tools/grind-lab.ts` was deleted rather than fixed.** It began every
    approach with `m.state = "air"; m.speed = s;`, but the ride has carried
    `velX/velZ` through the air since the spine rewrite and those are private
    and left at zero — so every row was a vertical drop and its angle and speed
    columns were labels on data that did not contain them. Reproduced: at 3, 8
    and 14 m/s it printed the identical catch-jump, snap distance and free
    flight, and refused every angle above 15°. Its own run recipe no longer
    resolved either. The honest coverage it claimed lives in
    `tools/integration-check.mjs` (lock-on placement at 30/45/60/90/144 fps,
    every rail ridden to a ride-away or a slam). A harness that agrees with
    itself is the thing this project keeps paying for.
  · Walked as a player, with a real keyboard: push to speed · ollie the six-stair
    with W held and roll away clear of the set · kickflip into a 50-50 on the
    flat bar and pop out · 180 → land switch → switch kickflip · kickflip landed
    into a manual carried 9.0 m and popped out into a heelflip as ONE line ·
    the quarter pipe ridden and popped at 8/12/16/20 m/s, every one a ride-away ·
    a blown flip that ends in a ragdoll · and a roll off the 2.82 m quarter-pipe
    deck that costs speed and nothing else.
- 2026-07-27 — **you bail because you got the TRICK wrong, never because you
  landed from height.** Director's call. Four of the five asks were failing for
  one reason and round 4's verifiers found it from four independent directions:
  landing hard bailed you (`LAND_ABSORB`). Measured consequences — you could
  ollie the six-stair and ride away **4 times in 56 attempts (7%)**, the quarter
  pipe bailed at *every* approach speed from 8 to 20 m/s with the push key held,
  and a kickflip aimed at a rail slammed on it in 13–31% of approaches.
  · That is wrong for this genre. THPS3 — the player's own stated reference —
    lets you drop off a roof and roll away. **Height is the reward in a skate
    game, not a hazard.**
  · The rule now: bail when the flip has not come round, when a spin lands far
    from square, when a grind's balance runs out, or when you hit something
    solid hard. A hard landing costs SPEED, scaled to how hard — and it can cost
    the pending combo — but you ride away.
  · The player asked for realistic falls and a ragdoll they can see. Those come
    from blowing a trick, which is frequent and readable. They do not come from
    taxing the player for using the ramps.
- 2026-07-27 — **a landed 180 sets the board's course to where it now points and
  TOGGLES the stance.** Director's call, made because round 3 left `stance`
  literally unreachable and therefore left the player's third ask — "mirror all
  animations, since our player must support both sides" — with no trigger at
  all: `mirror.ts`, both mirrored clip sets, the stance group, the switch
  flip-axis sign and the HUD badge were all dead code.
  · The cause was honest. `course` is the direction he TRAVELS, `heading` the
    direction the BOARD points; an air spin already turns `heading` through π
    continuously, so the old `heading += π` at the landing counted the same
    rotation twice and snapped. Both lanes that removed it were right — they
    just left nothing behind.
  · The rule now: land a spin whose net is an odd multiple of 180 → `course =
    heading`, toggle stance, emit once. Land another and you are back regular.
    The ground pivot follows the same rule. A 360 leaves the stance alone.
  · **This is a deliberate simplification, recorded as one.** Physically a 180
    leaves you rolling fakie, not switch; skate games redirect instead, because
    rolling away the way you are now pointing is what the trick reads as. The
    mirrored clips are what put his feet on the right trucks afterwards.
- 2026-07-27 — **a harness that passes while the feature is broken is worse than
  no harness**, and this project proved it three rounds running. Round 3 shipped
  **43/43 green** while popping at the quarter-pipe lip was a guaranteed bail
  from 12 m/s up. The checks were not sloppy so much as *self-agreeing*: the
  launch case drove the model with an empty input object, the drop-in case
  asserted the inverse of the rule its own comment stated, one section asserted
  `stances.length === 0` — certifying the exact failure of ask #3 — and no
  ragdoll assertion looked at HEIGHT, so a body asleep on a 12 m roof passed all
  four. Verification integrity is now its own build lane, and a new assertion
  does not count until it has been watched FAILING against deliberately broken
  code.
- 2026-07-27 — **round 2 of milestone 7: the verifiers' findings, and what integration
  found on top of them.** Six lanes fixed their own files; the integrator applied every
  cross-file request and then walked the game frame by frame from the title screen. Four
  things only that walk could find, all measured in `tools/integration-check.mjs` (31
  checks, headless, the real model + rig + spot + grinder + trick book in main.ts's own
  frame order):
  · **The title screen was still a grass field.** The street key art
    (`cms2hv48901lw22lppfy2tr8c`) and the menu loop (`cms2hxarf01m922lpeknc4cj2`) landed
    days ago and nothing pointed at them — `main.ts` was serving the milestone-1 field
    still to the menu AND the loader. The first thing the player saw was a picture of a
    different game. Both wired.
  · **Space stopped popping you off a rail above ~8.6 m/s.** The grind lane's fix — ask
    the Grinder on rising frames too, without which an ollie onto a handrail is
    impossible above 4 m/s — meant that popping OUT of a grind cleared the Grinder's
    re-catch DISTANCE while the board was still inside the rail's 0.55 m catch window.
    Measured on the flat bar: re-locked 0.067 s later with 0.45 m of a 1.57 m ollie. The
    ride now refuses a rail on the way up out of a pop it made on purpose; every speed
    from 5 to 14 m/s gets the full 1.59 m.
  · **A rail would take a board that was still coming round.** 13 of 36 flip-toward-a-line
    approaches locked on mid-kickflip, snapping the deck 210°–345° in one frame and paying
    out a clean grind for a trick he never finished. A rail is a landing surface, so it
    now asks the landing's own first question — is the board caught? Flip early enough
    that the deck is under your feet when the trucks arrive, or the rail puts you down.
    Costs the plain ollie nothing (78/84 approaches still catch); a kickflip still makes
    it from ~0.3 s of lead.
  · **R and a bail both let go of things silently.** `reset()` cleared `grindState` and the
    held trick by assignment, so R halfway down a handrail left the grind loop playing and
    the rider yawed across a line now on the other side of the plaza; a bail dropped a grab
    or a manual without ever announcing it, leaving the hand on the deck and the badge lit
    for the rest of the run. Both now announce.
  Also wired this round: the ragdoll's own `settled` (he gets up when the BODY has stopped
  — 0.55 s floor, 1.5 s ceiling, measured at each), the grab as a real held trick with a
  callout and a sound, and **Q as a nose manual distinct from E** — the controls screen
  offers two tricks and the body already had a weight shift for each, but the model
  announced both as "Manual". DROP IN now unlocks audio: it is a click, and a mouse-only
  player rolled off the title screen in silence.
- 2026-07-27 — **the grab ships as a sink-and-reach, and it is not a hand on the board.**
  The one trick that genuinely wanted footage, and the motion vendor is out of balance.
  Measured: at the bottom of the squat the shoulder is still ~100 cm above the soles and
  the whole arm is 55 cm, so the hand's floor is 42 cm above the deck — a limit of the
  rig's proportions, not of the pose. Parking the ollie's airborne tuck instead measured
  worse (hand 61 cm up, 59 cm behind him). Wired anyway: Shift moving nothing at all is
  worse than a rider visibly sinking and dropping his hand toward the board, and the
  routing is written so a real clip drops straight in. Recorded here so it is not
  mistaken for finished.
- 2026-07-27 — **a bail is now decided by the impact, not by the angle.** `LAND_HARD_ANGLE`
  (72°) put him on the concrete for every air off the quarter pipe, because an honest
  vertical launch comes down at 79° onto a flat deck at 2 m/s as surely as at 12. Replaced
  with `LAND_ABSORB` = 11 m/s straight into the floor (an ollie lands at 7.3, a 2.6 m
  transition air at 8.6, a popped six-stair at 9.8, a drop off the QP deck at 11.9). This
  is a FEEL change outside anything the verifiers asked for — bails are rarer and dropping
  back into a transition fakie now works — and it is flagged for the player rather than
  buried.
- 2026-07-27 — **milestone 7 is being built in PARALLEL, as an ultracode workflow**, at the
  player's explicit request ("run workflow an ultracode, fan subagents… I'm going to
  sleep now; make it as autonomous as possible"). Fourteen agents in round 1: a serial
  spine (shared contracts + an analytic `SurfaceProvider` + the rewritten ride) so that
  seven lanes could then write disjoint files at once, an integrator, and five
  adversarial verifiers whose brief was to REFUTE that the player got what they asked
  for. The verifiers earned their keep — five blockers and eleven majors, every one
  measured, none of them visible from the lane reports alone. Round 2 is those fixes
  plus a second refutation pass.
  · The lane split is only safe because the spine went first: `contracts.ts`,
    `world/surface.ts` and the extended `skate-model.ts` existed, with compiling stubs
    for grind/tricks/ragdoll, before anyone else started. Three agents then replaced a
    stub each without ever opening the same file.
  · **The ride no longer reads the terrain directly.** It takes a `SurfaceProvider`, and
    the street spot is one. The idea that makes ledges work is `yHint`: a ledge has two
    valid heights at one (x, z) — the pavement beside it and its top face — so the query
    takes the board's current height to disambiguate. Verified against a two-height
    provider: same (x, z), two answers, and a skater rolls both along the top and past
    the base.
  · `slopeAlong` had to shorten its lookahead from 1.5 m to ~0.15 m. Measured: at 0.5 m
    an 80° quarter-pipe transition reads as an 11° ramp and eats 40% of the drop-in
    energy; at 0.15 m the same drop-in keeps 91% of the free-fall ideal. The old value
    was tuned for 1° hills and there is no such thing here any more.
- 2026-07-27 — **the tricks are built off the BOARD, not the body, and that is now the
  design rather than a workaround.** The eight new trick clips all failed on the motion
  vendor's balance (see the Assets note). In real skating a kickflip, a heelflip and a
  shove-it are the same ollie — what differs is the board rolling one way, the other, or
  spinning flat — and this game already owns a real hand-authored ollie on this exact
  skeleton. Driving them off `boardFlip`'s axis also retires the last move still running
  on the compiled motion set, which jolted ~47° at the pop. Manuals are board pitch plus
  a rig-level weight shift; a 50-50 is the rolling stance; a boardslide is that stance
  yawed across the line. Only the grab genuinely wants footage.
- 2026-07-27 — **the crouch was re-made from `crouch.mov`, MIRRORED first**, at
  the player's request. Mirroring the footage before extraction is the same trick
  the push clip needed, and it is what fixes the facing at source: this take
  stands at **+20°** against the rolling stance's +41°, so the yaw correction is
  21° instead of the first take's 81°. Deeper too — the rig bottoms out at
  **27 cm** of hip drop against the old take's 23 — and it parks there flat. The
  first take (`pre-jump.mov`, unmirrored, `cms1wybaj00ms22lpcmeiodyw`) stays
  recorded; it is not wired.
  · Its subject watches his own board go down, so the head sat 38° off the line.
    `headYaw` turns it back. Note for next time: the head bone is pitched, so
    the projected gaze swings **~2.4× the angle applied** and is wildly
    non-linear — 38° of correction overshot to +53°. Tune it by eye, not by the
    readout.
- 2026-07-27 — **a push during the wind-up calls the jump off.** Player's rule:
  press push while Space is held and letting go of Space does nothing. You cannot
  kick and pop off the same foot, so reaching for speed mid-crouch means the
  push — he stands up on the spot (the crouch releases the frame the push starts,
  not when the key comes up), rolls away, and the pop is spent. Verified in the
  game: 13 → 25 km/h with the wheels never leaving the grass.
- 2026-07-27 — **the title screen shipped** — milestone 5's first half. Centred
  stack archetype: the wordmark is this game's strongest piece of art and the key
  art's subject sits centre-right with open sky above it, so a left rail would
  have run the buttons straight through the skater. Bare stencil buttons, no
  plates (the brief forbids them and they would fight the logotype). DROP IN /
  CONTROLS, keyboard and mouse driving one selection, staggered entrance. The
  backdrop is the menu still, crossfaded over by the generated loop
  (`cms2b5bb201aq22lpbk8v0i8s`) — two stacked videos handing over at the cycle
  end, since the clip lands near its first frame rather than exactly on it. Phone
  tiers keep the still.
  · **The logotype had its transparency CHECKERBOARD painted in as real pixels**
    — it had been shipping as a white slab across the loader art since the
    logotype landed. Repaired with a glyph-mode background removal
    (`cms2bcnbn01ax22lpyjuudwkc`), verified over a bright background for both
    failure modes (no plate, zero speckle), then trimmed to its alpha bounds
    (814x396) and committed as a UI sprite — which is also what makes the menu
    layout predictable.
  · The entrance stagger animates `transform`, so anything centred WITH a
    transform loses its centring the moment the stagger runs. The wordmark walked
    off the right edge until it was centred with auto margins instead.
- 2026-07-26 — **every clip carries its own facing, and they do not agree.**
  Player: holding Space turned him the wrong way round on the board. Measured off
  each clip's Hips track, the stances stand at rolling **+41°**, push +70°, ollie
  +15°, and the new crouch **+122°** — a right angle out, because the reference
  footage was shot from behind the skater. `HandClipRange` now carries `yaw`
  (and `headYaw`), a turn about the vertical laid on the clip's hips before it is
  blended; the crouch is set to −81°, which puts it back on the stance's line.
  · **The first version of that fix spun him on the spot.** A parked clip (the
    held crouch) scrubs to the same time every frame and three.js stops writing
    the bone, so premultiplying the turn onto the live bone compounded it — the
    yaw readout in `tools/move-film.html` walks −47° → 151° → −11° → −173° frame
    after frame. The turn is now done once per scrub time and the result cached;
    same readout holds −47° flat for as long as the key is down.
  · `tools/move-film.html` gained that `YAW body/head` readout. Facing bugs are
    invisible in a fore/aft trace and obvious in one column of degrees.
- 2026-07-26 — **hold Space to load the ollie, let go to pop, land on bent
  knees.** Space now fires on RELEASE; the hold in between is a wind-up crouch,
  and a tap still reads as an instant ollie because press and release land a
  frame or two apart. The crouch is a NEW clip, extracted from the reference
  footage the player dropped in the project root (`pre-jump.mov` →
  video-to-motion, `cms1wybaj00ms22lpcmeiodyw`): the source sinks 21 cm into a
  loaded squat and then holds it, which is what lets the hand-clip layer PARK on
  the last frame for as long as the key is down (`handHold`) instead of looping
  or finishing.
  · The same clip does the landing cushion, played over 0.34 s at 55% depth —
    measured in `tools/move-film.html`: he takes touchdown at −13.9 cm of hip
    height and is back to the rolling stance 0.6 s later, with no pose flash at
    the handoff.
  · **Hold length does NOT change the pop height.** Deliberate: the ask was for
    the wind-up to READ, and the pop/gravity pair is already tuned. A charge
    meter would be a new mechanic, not this one.
  · Losing window focus drops the wind-up rather than firing it — a tabbed-out
    player never comes back mid-air.
- 2026-07-26 — **the push "slides forward and comes back" — it was his LEAN, not
  his stance.** Player report, and the frozen anchor was innocent: with the hips
  pinned, `tools/move-film.html` showed his head swinging **+10 cm toward the
  nose** in the first fifth of a second and drifting back over the rest of the
  stroke. Cancelling it outright just moves the same swing down to the hips, so
  the rig now takes back HALF of it (`PUSH_LEAN_CANCEL = 0.5`) by stepping him
  along the deck — measured after: head +5.1 cm, hips −5.6 cm, so he pivots about
  his middle instead of sliding up the board. Applied straight rather than
  through the anchor's easing, which exists to hide the anchor changing hands and
  let the swing get out in front of the correction.
- 2026-07-26 — **the ORIGINAL hand-authored push is back**, at the player's
  request, now that the rig no longer chases its foot slide. Measured with the
  frozen anchor in place: body drift vs the board **2.1 cm sideways, 0.4 cm
  fore/aft** — the 27.7 cm fore/aft drag is gone outright. The clip's own 12–15 cm
  standing-foot slide stays in the clip, where it reads as his foot shifting on
  the deck rather than his whole body walking off it. The generated replacement
  (`cms1tk72j00bf22lpjamg9kiy`) measured better on paper (11.9 cm slide) but read
  worse in motion; it stays recorded here in case it is ever wanted back.
- 2026-07-26 — **push clip replaced, from mirrored reference footage.** The
  supplied `push.glb` slid the standing foot 15.1 cm, which is what made the
  board chase his foot and shift him around the deck.
  - Tried first and REJECTED: pinning the foot with the vendored `twoBoneIK`.
    At full sweep the leg is already at its own length, so the solver clamps and
    the correction goes into the knee — the player reported the leg looking
    broken and the foot pushing the board instead of the ground. Reverted whole.
    **Do not reach for IK on this rig again.**
  - **Video generation cannot be told left from right.** Three prompts asked for
    a right-foot push; all three produced a left-foot push. Fix: mirror the
    footage with `ffmpeg -vf hflip` before extraction — a mirrored left-foot
    push IS a right-foot push. Deterministic, free, no regeneration.
  - Simpler prompts extract better. A long choreographed one ("front foot stays
    planted while the back foot steps down and sweeps…") produced a WALK, both
    feet sliding ~45 cm. The short one — subject, side view, locked camera,
    whole body in frame, plain background — produced a real push.
  - Shipped: `cms1tk72j00bf22lpjamg9kiy`, range 0 → 1.3 s. Standing-foot slide
    **15.1 → 8.5 cm** in game, sweep a clean 41.7 cm, right foot pushing.
  - **Then the drift itself was fixed, in the rig, not the clip.** `followFeet`
    re-solved the board position every frame from whichever sole was lower, so
    it tracked the clip's own foot slide AND switched feet when the soles
    crossed. Measured A/B on the same run: his body moved **5.7 cm sideways and
    27.7 cm fore/aft relative to the board** during one push — he walked off the
    deck. Now the anchor is FROZEN at the spot he stood when the push began and
    held until both feet are back on the deck; the existing settle lerp eases it
    back. After: **0.8 cm sideways, 1.9 cm fore/aft.** No IK, no smoothing — one
    solve that had no valid input during a push simply stops running.
  - Note for future clips: the extraction lane always returns ZERO hip travel,
    so any ground travel in the footage lands in the feet as slide. No clip from
    this lane will be perfectly planted — which is why the rig holds him instead.
- 2026-07-26 — **the pose flash at the END of a move.** Player: after a push or
  a jump the skater snaps to a different pose for a beat before settling. Two
  distinct causes, both measured with the scripted-move mode of
  `tools/ride-jitter.html`:
  1. **three.js writes the BIND pose when an action stops.** `updateHandClip`
     ended a one-shot by clearing the flag and returning, so the frame that
     stopped the action left the restored bind pose on screen — a **68° hips
     snap for one frame** at the end of every push, 59.9° at the end of every
     ollie. Fixed by handing back to the stance and posing the body inside the
     SAME frame (`resumeRide()` then `updateHandClip(0)`), fading from the pose
     the move actually ended on. Both flashes now measure zero.
  2. **the generated kickflip faded back into the compiled idle**, which is no
     longer the resting pose — the old standing pose showed for ~150 ms after
     every kickflip. `fadeOut` cut to 0.02 s and the stance now takes over from
     `playOneShot`'s `onDone`, which fires while the body is still in the
     landing pose. Worst snap 35.6° → 15.4°.
  - **Still open:** the kickflip is the last move driven by the compiled set, so
    entering it still cuts from the stance to the compiled idle (~47° at the
    pop). The fix is to re-make the kickflip as a hand clip via the video →
    motion route that produced the rolling stance; offered to the player.
- 2026-07-26 — **standing jitter: TWO animations were writing one skeleton.**
  The player reported the skater juddering while simply rolling. Measured with
  `tools/ride-jitter.html` (fixed 1/60 steps of the real model + rig + anim,
  per-frame deltas in the board's frame, no input):
  - before: body 4.91 mm/frame peaking at **69.9 mm**, foot 20.3 mm/frame
    peaking at **389 mm**, 11 spike frames in 8 s, worst single-frame joint snap
    **56.2°** — on a skater doing nothing.
  - the clip was NOT at fault: the same clip scrubbed the same way on a bare rig
    moved the hips **0.110°/frame**, max 7° (the loop seam). Its own tracks hold
    zero single-frame pops over 6°, and its hips carry no horizontal travel
    (x/z range exactly 0).
  - the cause: `update()` ran the compiled motion set over every bone EVERY
    frame and then blended the hand clip on top. On spike frames the live hips
    sat **0.0°** from a compiled-set-only twin — the old loop had taken the body
    back outright — while on calm frames it sat 43° away. Two writers, and the
    winner flipped.
  - the fix is one writer, not a filter: the compiled set now poses the body
    only when it actually owns it (the rolling clip failed to bind, or a
    generated one-shot is running). After: body 1.52 mm/frame max **2.7 mm**,
    foot 1.14 mm/frame max **3.0 mm**, **0 spikes**, worst joint snap 2.9°.
    Nothing is damped or smoothed.
- 2026-07-26 — **the riding stance now comes from VIDEO, not text.** The player
  supplied a reference frame (a PS2-era skater cruising: upright, relaxed, feet
  planted wide across the deck, head turned down the line) and asked for a
  default rolling animation to match.
  - Text-to-motion cannot produce this pose, and no wording fixes it. Two paid
    batches confirmed it: asking for a crouch returned a man squatting on the
    board (hips 0.39–0.43, sitting on his heels); asking for upright returned a
    man **standing at attention with his feet together** (hips ~1.0, head yaw
    0–18°). The generator has no board in the scene, so it has nothing to stand
    across — "riding a skateboard" collapses to "standing". This is a limit of
    the modality, not of the prompt.
  - The fix was the player's own suggestion: generate a reference VIDEO, then
    extract motion from it. `npx genex video` (locked-off side-on shot, plain
    background, whole body in frame — written to satisfy the extractor's rules)
    → `npx genex character animate <char> "riding a skateboard" --video`. The
    stance in the result is a real skater's, so the wide stance, the side-on
    body and the turned head all survive.
  - **`genex character animate` with a TEXT verb is broken server-side** —
    `Uthana: Cannot query field "job_id" on type "createtexttomotionjob"`,
    deterministic across two attempts. `--video` uses a different job type and
    works. `genex motion gen|verify|compile|install` is unaffected.
  - The clip plays through the hand-clip mixer lane as a LOOP (`RIDE_HAND_CLIP`,
    `loop: true`) rather than being compiled into the motion set — it is already
    built on this exact skeleton, so there is nothing to retarget. Its ends do
    not meet, so the wrap re-runs the same crossfade the one-shots use instead
    of cutting. The compiled `idle` clip stays as the silent fallback.
  - The sampled-crouch hack (`STANCE_SAMPLE_TIME` / `STANCE_WEIGHT`, one frame
    lifted off the ollie and blended 50% under the rolling loop) is GONE — it
    existed only because the old generated stance stood too tall, and stacking
    it on the new clip over-crouched him.

- 2026-07-25 — player confirmed: PS2 skate game, classic 2000s skater, "just
  the mechanic, done well" (declined ramps, declined a trick score for now).
- 2026-07-25 — **no Rapier for v0.** Nothing in the field falls, collides or
  gets pushed, and skate feel is momentum + carve + air time over a heightfield
  the game already knows analytically. A custom skate motion model over an
  analytic ground gives a better, more tunable ride than bending the on-foot
  capsule controller into a board. Revisit the moment ramps or obstacles land.
- 2026-07-25 — camera is the bundled FollowCamera in its vehicle mode
  (`alignHeading` swings it behind the board), pointer-locked: third-person
  action, cursor away during play, mouse free-looks.
- 2026-07-25 — the trick score the player declined is left out; bail + instant
  retry stays, because a run you can't lose has nothing to land.
- 2026-07-25 — **board regenerated.** The first deck (cms0eflwm) came back with
  wheels moulded onto BOTH faces — confirmed in a three-view render, thrown out.
  A second attempt (cms0fd7sa) generated two decks stacked. The shipped board is
  cms0fd757: grip tape on top, four wheels underneath, verified on screen.
- 2026-07-25 — **push animation regenerated.** The first take read "right leg
  reaching down and sweeping backward" as *bend at the waist* and folded the
  skater in half. Reworded to "standing tall… back completely straight… never
  bending forward at the waist" — the v2 batch returned three PASS-100 takes.
- 2026-07-25 — **riding stance regenerated** for a lower crouch. Best available
  take sits at hips 0.974 (≈3% below standing); the text-to-motion model resists
  a deep surf crouch. Still reads a touch tall — revisit with a constraint pass.
- 2026-07-25 — kickflip take routes to a ONE-SHOT only when its filename carries
  a one-shot verb; `skate-kickflip.npz` compiled as a seam-cut loop and lost the
  crouch→pop→catch arc. Shipped as `skate-kickflip-ollie.npz` → `skateKickflipOllie`.
- 2026-07-25 — trick clips are performed slowly (2–4 s) while a pop buys ~0.7 s
  of air, so one-shots are rate-scaled to the hang time at playback.
- 2026-07-25 — carve lean was banking OUT of the turn; sign fixed and verified
  on screen. D/→ turning screen-right was already correct.
- 2026-07-25 — dropped auto-pause on tab-hide (it now just silences the audio):
  the clamped frame delta already prevents a teleport, and a modal on every
  alt-tab is a nuisance. Escape is the pause.
- 2026-07-25 — **animations regenerated a second time, and reviewed by EYE.**
  Built `tools/clip-check.html`: renders any compiled set as a phase strip on the
  real skater. It immediately showed what the verify scores hid — the "PASS 100"
  riding stance was a standing idle (feet together, arms down) and the ollie
  never left the ground. Score is not motion; watch the clip.
  Winning framings (the model responds to the ACTIVITY named, not the adjectives):
  · riding stance ← "riding a snowboard down a slope" (deep bent-knee crouch)
  · ollie ← "dropping into a deep crouch then exploding straight up… pulling both
    knees up high toward the chest" (genuinely airborne)
  · kickflip ← "at the very top of the jump kicking the left foot sharply out to
    the side… rolling the ankle outward" (clear sideways flick mid-air)
  · push — still weak. "Scooting on one leg" and kick-scooter framings both come
    back as a shuffle; the model will not put one foot on a raised board and sweep
    the other along the ground. Shipping the least-bad take; flagged to the player.
- 2026-07-25 — trick clips came back short (1.0–1.2 s) this round, so the
  playback rate scaling is now gentle (~1.4x) instead of the 3–6x the first,
  slower takes needed.
- 2026-07-25 — **tested the player's hypothesis that short prompts beat detailed
  ones.** Ran "riding a skateboard" / "ollie on a skateboard" / "kickflip on a
  skateboard" / "pushing a skateboard with one foot", 4 takes each, and reviewed
  every take in the phase-strip viewer against the detailed set. Result: the
  DETAILED prompts win decisively on all three moves.
  · "riding a skateboard" → straight legs, feet together, no crouch (all 4 takes)
  · "ollie on a skateboard" → the skater just stands there; never leaves the ground
  · "kickflip on a skateboard" → a soccer-style leg swing, a fold at the waist, or
    a plain hop with an arm raised; no flick
  The model does not know skate jargon as motion. It responds to the ACTIVITY it
  already knows ("riding a snowboard down a slope") and to literal body mechanics
  ("deep crouch then exploding straight up, knees to the chest"). Naming the trick
  buys nothing. Detailed set kept.
- 2026-07-25 — **push clip dropped entirely.** Seven prompt framings across three
  batches never produced a skateboard push; the model will not put one foot on a
  raised board and sweep the other along the ground. Replaced with a rig-level
  push COMPRESSION (the skater sinks ~11 cm and springs back over 0.42 s, with a
  slight forward lean). Rig transform, not a joint edit, so it composes with the
  stance clip. Reads as a pump and never looks broken.
- 2026-07-25 — **the ollie is now the player's own hand-authored clip.** They
  supplied `olie_animation.glb`: animation-only, 26 nodes, 24 channels, 3.97 s at
  30 fps, built on this exact Meshy skeleton (bone names and order match the
  rigged character one for one — nothing retargeted). It contains one full ollie
  plus lead-in and settle; the usable span is 0.82 s → 3.10 s (crouch → takeoff
  ~1.0 s → tuck at the peak → landing absorbed by 3.1 s), scrubbed to fit the
  hang time at playback.
  It plays through a three.js AnimationMixer LAYERED over the compiled stance,
  crossfaded by hand: the stance pose is snapshotted each frame, the mixer
  overwrites the bones, then the two are slerped by a ramp. A mixer weight below
  1 would blend against the BIND pose instead of the stance and flash a half
  T-pose on entry — hence the manual blend. Guarded: if <80% of the clip's tracks
  bind to the rig, the generated ollie is kept instead.
  Same lane is now available for any future hand-authored clip via
  `SkaterAnim.attachHandClip()`. `tools/glb-clip-check.html` renders any such GLB
  on the skater as a phase strip for picking the range.
- 2026-07-25 — **the board is stood on the skater's soles, not on a fixed
  height** (`SkaterRig.followFeet`, run after the animation has posed the rig).
  Grounded, the board holds the wheel contact point and the SKATER slides to
  meet it — that is what keeps the deck centred under his feet whatever the
  stance does. Airborne, it flips: the board rides the feet, and the deck angle
  comes from the line through them (keeping 30% of the physics pop so the nose
  still lifts). Fixed three player complaints at once — off-centre deck, legs
  clipping through it, and board and legs on separate clocks in the air.
  · The anchor is the middle of ANKLE→TOE on each side, not the ankle bone. The
    skater stands across the deck, so anchoring on the ankle alone hung his toes
    off the front rail — the exact thing the player photographed.
  · `SOLE_CLEARANCE` 0.05 m rolling, `AIR_SOLE_CLEARANCE` 0.10 m: the shoe
    meshes are chunky and their bones sit well inside them, so a skeleton stood
    flat on the deck buries the shoes in it.
- 2026-07-25 — **blob contact shadow removed** at the player's request. The low
  sun already casts a real shadow off the deck and the skater; two shadows read
  as a bug. Height now reads off the real shadow and the horizon.
- 2026-07-25 — **deck enlarged** 0.82 → 0.96 m. Correct for a 1.70 m rider is
  ~0.82, but the skater's shoes are stylised chunky and hung off the rails; PS2
  skate games draw the plank oversized for exactly this reason.
- 2026-07-25 — **rolling stance deepened without regenerating anything.** One
  frame of the player's own ollie GLB (t = 0.34 s, its bent-knee wind-up) is
  sampled at load and held as a target the generated rolling loop is slerped
  50% toward. The loop re-poses every bone each frame, so it is a fresh blend,
  not a drift. Cheaper and better than another motion batch — the model never
  produced a real skate crouch anyway.
- 2026-07-25 — **ollie raised and slowed** at the player's request: gravity
  20 → 17 and the pop 6.4 → 7.3 (kickflip 7.0 → 7.6). ~1.0 m / 0.64 s of air
  becomes ~1.6 m / 0.86 s. Gravity is the one knob that slows every pop; the
  hand clip is already paced to the hang time, so it stretched to match.
- 2026-07-25 — **the push is now the player's own hand-authored clip too**
  (`push.glb`, same skeleton, 1.97 s). Bound to **V** as they asked; W and Up
  still push, so the steering hand never has to move. The rig-level compression
  stays only as the fallback when no clip binds.
  · The source holds TWO strides. Read out of the phase strip: feet together at
    0.08 s, back foot swept out by 0.35 s, together again by 0.89 s — one push
    is that first stride, so the range is 0.08 → 0.89 and the kick interval is
    0.85 s. Running the pair as one push read as a shuffle.
  · **"Wrong leg" was the board, not the leg.** Foot tracking confirmed the
    LEFT foot stays planted (x +0.13, z +0.16, y flat) and the RIGHT sweeps the
    tail — correct for the regular stance the yaw sets up. But `followFeet` was
    still centring the deck on the MID-POINT of both soles, so it parked itself
    beside the swinging leg instead of under the planted one. `FootAnchor` now
    also carries `planted` (the lower sole) and the rig anchors on that
    whenever `feetOnBoard` is false.
  · Kick impulse now feeds in over 0.30 s instead of landing as one delta
    (4.6 m/s over the stroke) — the player reported the start as abrupt.
  · Crossfades lengthened: ollie 0.10 → 0.22 s, push 0.26 s.
  · **Clips now fade in from the pose the body was actually in** (`fromPose`),
    not from the rolling loop. Popping an ollie halfway through a push used to
    snap the legs back to the loop before the trick took over. A generated
    one-shot (the kickflip) also releases any hand clip rather than fighting it.
- 2026-07-25 — **OPEN: the push judders, and three attempts to damp it out were
  all rejected and REVERTED.** Recorded so it is not attempted a fourth time.
  Measured with a fixed-step harness (real model + rig + anim, 1/60, throttle
  held), the cause is not a bug in the rig at all:
  · `push.glb`'s Hips track carries NO horizontal translation — only y, 0.70 →
    0.83 m. The body's ninety-degree turn is pure rotation about the hips.
  · That turn swings BOTH soles through ~0.23 m sideways in character space, so
    there is no stationary foot to anchor the deck to. The feet mid-point moves
    10.6 mm/frame, peaking at 24 mm.
  · Anything that stands the deck under a foot therefore throws the body the
    other way and back, twice a second: 25 mm/frame of body movement.
  Rejected fixes: (1) blending the anchor between mid-foot and planted-foot by
  how far one has lifted; (2) hysteresis on which sole counts as planted, plus
  moving the deck instead of the skater; (3) slowing the skater's settle to
  3 /s, which did cut body movement to 3.6 mm/frame with no steps left — the
  player rejected it anyway. **Damping the symptom is not the fix.** The next
  attempt should change the CLIP: either re-author the push with less body
  rotation, or key the front foot as genuinely planted so the rig has something
  to hold on to.
- 2026-07-25 — `tools/glb-clip-check.html` gained `yaw`, a `back` view, and a
  per-frame readout of both feet in world axes. Eyeballing a clip in its rest
  orientation is misleading once the game yaws the rig; the numbers settled a
  question three renders could not.
- 2026-07-25 — **music wired and silent.** The generated skate-punk loop streams
  and loops from the first gesture at volume 0, as the player asked. Raising
  `GameAudio.musicVolume` is the entire switch.
