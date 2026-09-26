---
name: genex-ai-hud
description: Generate HUD sprites — matched frames, masks, and icons in one coherent art style — via the mockup-then-deconstruct pipeline (`npx genex image` + `npx genex ui`), then wire them as a DOM overlay with channel-accurate masked fills. Use when the game's own style wants drawn chrome — ornate, painterly, comic, hand-made — when the player asks for HUD art, or to generate one element the game needs.
---

# Genex AI · HUD

Generate a game's HUD sprites in ONE art style — a full-HUD mockup, then a
deconstruction into individual assets — and wire them as a plain-DOM overlay
with masked fills that track the art's real channels. The result is an
art-directed HUD (etched steel ammo strip, parchment HP bar, chrome minimap
ring) that no hand-written CSS can fake.

## When to reach for this — and when clean CSS is the answer

- **Drawn chrome earns its place in a game whose own style wants it** —
  ornate, painterly, comic, hand-made, diegetic. Gothic filigree frames,
  rusted post-apocalyptic panels, carbon-fiber racing telemetry, hand-painted
  storybook plates: art the brief already promises and CSS cannot fake. The
  player asking for HUD art is the same signal, stated out loud.
- **A restrained interface built in clean CSS is a finished HUD.** For a
  spare modern game — thin strokes, quiet type, one accent hue — hand-built
  chrome styled FROM THE BRIEF is the better answer, and it ships as the HUD
  with nothing owed. It is not scaffolding and not a lesser tier. When you
  can't tell which way a game leans, lean minimal.
- **One element is a normal run of this lane.** Generating a single frame,
  mask, icon, emblem, or wordmark you decided the game needs is first-class
  use — fill the templates for that one asset (or regenerate it per-sprite,
  below) and wire it to the same standard. There is no all-or-nothing
  pipeline to finish.
- **Whatever you do generate is executed in full.** Extraction, masks,
  channel-accurate fills, `npx genex ui audit` — judgment decides whether art
  is generated, never how well it is done. Half-wired sprites are the one
  outcome this skill has no room for.
- `$genex-threejs-game-ui` owns the overlay architecture, the shared style
  brief, and the CSS craft floor this lane plugs into — read it either way.

## Three layers — plates are DOM, chrome is sprites, data is DOM

- **Plate (DOM).** The backing surface behind a widget is built in CSS — in
  whatever register the brief and the mockup call for: smoked glass
  (`background: rgba(<darkest hue>, 0.35–0.6)` + `backdrop-filter: blur(6–12px)`
  and its `-webkit-` twin) when the style wants translucency, a solid painted
  plate, a subtle gradient — or no plate at all for an outline-led look.
  **A plate exists only where the widget's own art doesn't already back it.**
  Behind an OPAQUE frame sprite there is no plate — the frame IS the backing
  surface, and a dark div stacked behind it only protrudes as a box over the
  scene (the recurring black-box defect). Where a plate IS needed — bare DOM
  readouts, thin-outline widgets — it stays WITHIN the widget's silhouette,
  and the mechanism is the **silhouette plate**: run
  `npx genex ui plate --in <frame.png>` (free, local) to trace the frame's
  REAL interior into a mask PNG, then give the plate div
  `mask-image: url(<name>-plate.png)` (+ `-webkit-` twin,
  `mask-size: 100% 100%`) alongside its usual `rgba`/`backdrop-filter`. The
  plate then fits spiky gothic panels and shaped medallions exactly — a bare
  rounded rectangle spills past thin frames and can't follow shaped art (the
  recurring plate-spill defect).
  **Glass is a technique, not a default** — do not reach for translucency
  because this skill mentions it; reach for it when THIS game's brief does.
  Plates stay DOM by default because a sprite cut from an UNKNOWN background
  cannot carry translucency (its pixels are a blend of panel and scene) — but
  a genuinely glassy identity panel has a second lane now:
  `npx genex image "<glass panel prompt>" --glass` generates it on a
  controlled flat-magenta key screen and solves REAL per-pixel translucency
  into the shipped PNG (`$genex-ai-image` documents the lane; a frosted panel
  reads as true glass over any scene). Use DOM plates for tint-and-blur
  backing; use `--glass` when the glass itself is crafted identity art. Give
  a DOM plate its corners with `border-radius` or shape it with a `ui plate`
  silhouette mask — **never a raw `clip-path`/`mask` chamfer**
  (it shears off borders, shadows, and content near the cut and re-breaks on
  every padding/value change: the recurring "cut corners" defect). A genuinely
  ornamented or angular frame belongs in chrome, generated. The load-bearing
  `mask`/`clip-path` uses in this skill are the masked-fill reveal below and
  the `ui plate` silhouette — never corner shaping.
- **Chrome (sprites — what THIS pipeline generates).** Opaque frames, corner
  brackets, ornaments, emblems, icons, medallions — hard-alpha art laid over
  the glass. The Stage-2 sheet contains ONLY chrome; never a panel with its
  fill or glass surface baked in. One deliberate exception to "no fills":
  every meter frame ships WITH its EMPTY dark in-style track baked in (the
  Stage-2 track rule) — the empty state is art; only the moving fill is DOM.
- **Data (DOM).** Numbers, labels, and bar fills are DOM text and masked
  fills (the fillBox pattern below) — always over the glass, never
  rasterized into art.
- **Micro-elements are designed, not defaulted.** The sheet excludes
  primitive-only shapes (plain crosshair ticks, dots, pips) because CSS
  renders them crisper — but CSS never means default: the reticle and every
  cue, toast, and counter still get the brief's treatment (stroke weight,
  glow, state changes — hit, low-ammo, empowered). An ornamented,
  identity-bearing reticle (engraved ring, sculpted brackets) is chrome —
  put it on the sheet like any other asset.

### Sprite vs CSS — two decision rules

- **Rule A — container vs content (the FUSED-unit test).** When a widget's
  frame and its interior detail are one crafted unit — an engraved border
  flowing into an engraved interior, a medallion whose emblem grows out of
  its ring — separating them and reassembling in CSS coordinates is fragile:
  keep them FUSED in one sprite and treat the whole thing as chrome. When
  the interior is runtime territory (a fill channel, a number, map blips),
  the container is the sprite and the content is DOM — the default split.
- **Rule B — image vs code (the 5-minute test).** If CSS can build the
  element in under ~5 minutes without losing fidelity — flat plates, simple
  dots/pips, plain strokes, a rounded corner — it is CSS. If it needs
  craft (material, ornament, painterly texture), it is a sprite. One
  exception cuts the other way: a static label engraved/embossed into a
  frame's craft stays BAKED in the sprite (`baked_static` below) even
  though DOM text is "code".
- **CSS-chrome recipes — the middle ground.** Between bare CSS and the full
  sprite pipeline sits brief-styled CSS chrome, right for utilitarian panels
  and secondary screens: a two-hue gradient frame (border + inset
  box-shadow in brief hues), rounded with `border-radius` (never a raw
  `clip-path` chamfer — see `$genex-threejs-game-ui`'s corner rules), a
  9-slice-ish panel from nested divs (outer div = border hue, inset div =
  plate hue, 2–3px reveal). What
  makes these legitimate: **CSS elements are styled FROM THE BRIEF — hue,
  weight, texture. Default-gray CSS anywhere on screen is a defect** (the
  classic failure: score pips shipped as unstyled "○ ●" system glyphs).

## Framing rules — internalize before prompting

The HUD overlays a **live 3D scene**. The pixels between widgets show the game.

- **NEVER generate a fullscreen ambient background** (parchment sheet, paper,
  fabric, wood board) as part of the HUD. Material aesthetics belong on the
  widget FRAMES — the HP bar frame is parchment, the minimap ring is leather —
  never on a screen-filling sprite.
- **No plates in sprites.** Panel plates in the mockup — translucent or
  solid — are welcome as the LOOK, but the Stage-2 asset list requests only
  their opaque chrome (frame, brackets, ornament); the plate itself is
  rebuilt at runtime in CSS matching the mockup's tint (see the three layers
  above).
- **No rectangular backing plates behind bars, digits, or icons — in the
  mockup, in sprites, or in CSS.** The Stage-1 template's widget-construction
  paragraph forbids them at the source (widgets are shaped silhouettes drawn
  over the scene — never delete that paragraph), and the runtime never adds
  one back: ornament lives on the widget's own silhouette. A screen that
  truly needs a plate (a menu sheet, an inventory panel) shapes it from the
  art's real interior with `npx genex ui plate` — never a bare rounded
  rectangle. Measured across 7 genres: without this rule every genre grows
  heavy generic plates behind its bars and digits.
- **4–7 widgets.** Fewer doesn't read as a HUD; more clutters the screen and
  burns generations.
- **Every widget needs internal contrast** — a panel fill, outline stroke, or
  semi-opaque backdrop — because the scene behind it might be a snowfield or a
  torchlit dungeon. Pure-outline widgets over arbitrary scenes fail. An opaque
  frame sprite already IS that contrast; don't stack a plate behind it. A
  needed backdrop lives inside the widget's silhouette, never as a rectangle
  spilling past the art (see the plate rule under "three layers").
- **The mockup must be flat and head-on** — a 2D screen-space overlay, never
  tilted, isometric, or in perspective. Angled panels have no clean silhouette
  and deconstruct into skewed slices. If the mockup comes back tilted,
  regenerate it before going further.

## Style brief

Start from the game's ONE shared style brief (`$genex-threejs-game-ui` owns
it) — the HUD, menu, and loader consume the same brief; a HUD styled in a
second world is a bug. Expand it here with what sprites need:
materials, an explicit palette of **4–5 named hues**, weathering, line
treatment, atmosphere. Keep outline stroke width
consistent across widgets — per-widget stroke changes read as amateur fastest.
For **per-sprite prompts** (single-sprite regeneration, below) the brief must
end EXACTLY with:

> Sharp edge silhouette on a flat plain background for clean cutout. No drop shadows. No vignette. Subject centered.

That sentence is what gives clean cutouts; skip it and the sprites come back
with halos. (The Stage-1 mockup and Stage-2 sheet prompts do NOT use it — they
are full frames, not cutouts; the templates below handle that.)

## Text ownership — classify every word before Stage 2

Walk every visible word, digit, suffix, and glyph in the mockup into three
buckets. The Stage-2 prompt KEEPS or REMOVES accordingly:

- **`baked_static`** — identity text fused into the art (a "SPECIAL" label
  painted into a meter frame, carved scale numerals, engraved panel titles).
  Stage 2 **keeps** it in the asset.
- **`runtime_static`** — fixed but editable/localizable labels ("AMMO"
  captions, objective headers not fused with the frame). Stage 2 **removes**
  it; you render it as DOM text.
- **`runtime_dynamic`** — anything driven by game state: values, timers, bar
  fills, item icons, map content. Stage 2 **removes** it; the DOM renders it.

The test: "is this fixed identity artwork, or should runtime code own it?"
Baking a runtime value into a sprite is a failure; stripping a carved identity
label flattens the art. **One label per widget:** whoever the table says owns
a word, owns it alone — if a sprite ships with a `baked_static` label, the
DOM must never render the same word again on that widget (the double-label
failure). The classification survives to wiring: carry it into the code
comments, not just this analysis.

### Placing runtime text on frame sprites — measured, never eyeballed

- **Position from `innerBBox`.** The trim/extract sidecars (`.bbox.json`)
  carry `innerBBox` — the frame's central transparent cavity. Box the DOM
  text to `innerBBox` scaled to the widget's on-screen size; never hand-tune
  magic paddings until it "looks right" (they break on the first resize or
  art swap). If `innerBBox` is null on a genuine frame (no cavity), fall
  back to the frame's visual center and say so in the wiring notes — solid
  plates without a cavity are DOM plates anyway (three layers).
- **Occupancy bands.** Value text fills 65–85% of its zone's height; labels
  55–75%. Below the band the text rattles inside the frame; above it, it
  crowds the art.
- **Width buffers for display fonts.** Display faces run wide: budget +25%
  width over a naive estimate, +40% for heavy weights in uppercase, +50% for
  heavy + uppercase + serif — then verify `scrollWidth <= clientWidth` at
  the widest real value (the 888,888 test).
- **`genex ui text-color` is a MANDATORY step for every widget that carries
  DOM text** — sample the mockup region and use the returned hex verbatim.
  Free-picking a "close enough" palette color is how text drifts off the
  art's actual plate.

## Icons & mechanics must match the game — diff before Stage 2

Words are only half of it. Every ICON, slot, gauge, and pictogram in the mockup
implies a MECHANIC: a grenade icon promises grenades, three ability slots
promise three abilities, an armor bar promises armor. Before Stage 2, walk each
one against the game contract — the mechanics the code actually has (or that you
are committing to build):

- **Backed by a real mechanic** → keep it and wire it to that state.
- **No backing mechanic** → it is a promise the player will notice is empty.
  CUT it (prompt Stage 2, or a region re-edit, to omit that icon/slot) OR add
  the mechanic to the game. Shipping a depicted control the game can't do — a
  grenade slot on a rifle-only HUD, an armor bar with no armor, a minimap over
  no map — is a failure, and "the model drew it so I kept it" is how it happens.

The mockup anchors STYLE; the game contract owns WHAT EXISTS. When the picture
and the mechanics disagree, the mechanics win. Record a cut widget in
DESIGN.md as "deferred from mockup" while the lane is running — never silently
wired, never silently dropped.

## The pipeline

Each step is one command; every `<...-url>` is the R2 URL the previous command
printed. Fill the two prompt templates —
[references/stage1-prompt-template.md](references/stage1-prompt-template.md)
and [references/stage2-prompt-template.md](references/stage2-prompt-template.md)
— before Stages 1 and 2.

**Order of work.** When you have decided this game's HUD gets sprites, Stage 1
renders a mockup of THIS game's HUD over THIS game's scene — ONE generation,
no candidate variants unless the player asks. The scene half of the prompt is
written in TEXT from the game plan — `[GAME_SCENE]` in the Stage-1 template:
setting, the moment, what the player is doing, lighting. Enqueue it
`--no-wait` and keep building; kick Stage 2 off as soon as the mockup lands,
since every sprite is cut from it.
**If a reference image already exists — the user's own art, or a look frame
you generated and they approved — anchor Stage 1 to it with
`--edit <that-url-or-file>` so the HUD inherits its exact palette, materials,
and lighting; that anchoring is what makes the final HUD match the art it is
supposed to match, and skipping it is why a text-only mockup drifts.** A
text-only Stage 1 is the normal path when no reference exists. A
user-supplied reference needs no upload step: `--edit` takes a local file
path directly (`--edit ./reference.png`, ≤4 MB inlined) — a chat attachment
saved to disk is a perfectly good anchor, and "I can't feed the local
screenshot into the art chain" is never true and never a reason to reach for
another tool. While the mockup renders, write the widget layout and wiring
code (placement, masked-fill scaffolding, plain-CSS bars) — the game stays
playable the whole time. When a sprite lands it REPLACES its CSS stand-in:
delete the stand-in's own background/plate as you wire the opaque frame in —
a dark div left behind an opaque sprite is the black-box defect. The mockup
is a STYLE anchor only: the widget set and layout come from the element
inventory and the game contract — a mechanic the mockup invented (a lap
counter, a stamina orb) does not enter the HUD, and a mechanic it failed to
show still does. **A single element needs no mockup at all**: generate it
straight in the house style (Sprite iteration below), extract it, and wire it
to the same standard.

```bash
# Stage 1 — the HUD mockup: this game's full HUD over its own scene.
# TEXT-described; add `--edit <url-or-local-file>` to anchor it to an
# existing reference image so the HUD inherits its exact style.
# ONE mockup; save its URL:
npx genex image "<filled stage-1 prompt>" --size 2560x1440 --quality high

# Stage 2 — deconstruct the mockup into an asset sheet on white:
npx genex image "<filled stage-2 prompt>" --edit <mockup-url> --quality high

# Stage 2b — ML-clean the sheet background (preserves anti-aliased edges and
# interior whites that a naive white-key would eat; the prompt is recorded, unused):
npx genex image "clean sheet" --clean <sheet-url>

# Stage 3 — extract individual transparent PNGs locally (free, no generation).
# Names in READING ORDER: top-to-bottom, then left-to-right within a band:
npx genex ui extract --in <cleaned-url> --out-dir public/assets/hud --names hp-frame,ammo-frame,minimap-ring,weapon-icon

# Progress masks — for every CONTINUOUS bar/meter with a generated frame. The
# Stage-2 sheet holds a clean frame cell PLUS a same-size annotated duplicate
# with the fill zones painted pure green #00ff00; this converts the green into
# an alpha mask + the fillBox (FB) the DOM fill reads (+ per-segment fillBoxes
# in `segments` for one-frame-N-slots meters). --auto finds the cell pairs
# itself — prefer it; fall back to hand-computed --pairs crop rects only when
# it reports ambiguity:
npx genex ui masks --in <cleaned-url> --out-dir public/assets/hud --auto --names hp
#   explicit fallback: --pairs "hp:cx,cy,w,h:ax,ay,w,h:1"
#   pairs = name : clean-cell crop (px) : annotated-cell crop (px) : expected green components

# Text colors — sample the mockup instead of free-picking from the palette:
npx genex ui text-color --in <mockup-url> --box x,y,w,h
```

Why mockup-then-deconstruct instead of N per-sprite generations: one
generation produces a **matched set** (no style drift between widgets) and the
model composes the layout for you — the mockup is the ground-truth reference
you verify the final HUD against.

### Sprite iteration

To fix ONE sprite, don't re-run the pipeline:

- **Regenerate it** in the house style:
  `npx genex image "<style brief + sprite subject>" --quality medium --remove-bg`
  — add `--bg-mode glyph` for digits and closed shapes (an `8` or `$` otherwise
  comes back with its loops hollowed out). Use the mandatory cutout sentence.
- **Or region-edit the sheet**: `npx genex image "<targeted change>" --edit <sheet-url>`
  then re-run `genex ui extract` — surgical, preserves everything else.
- `npx genex ui trim --in public/assets/hud/<sprite>.png` crops a sprite to
  its alpha content and reports its real pixel dims — the source of truth for
  the box↔art aspect rule below.

### Crop guards — catch a bad sheet before it ships

- **`extract --expect N`** (N = your `--names` count) asserts the component
  count and hard-errors BEFORE writing any file, listing what it found. Use
  it on every extraction — a miscount is otherwise silent and mis-names
  everything after the gap.
- Extraction also **warns** when a component touches the sheet canvas edge
  (the canvas sliced it — regenerate the sheet with more margin around every
  element) or looks like a fragment (extreme aspect / near-empty box — try
  `--dilate` to glue split pieces).
- **Stacked meters cluster.** Meters that sit adjacent/stacked in the mockup
  (HP directly over stamina) tend to come back as one clustered crop on the
  sheet — when your mockup stacks meters, ask the Stage-2 sheet for extra
  whitespace between the STACKED meter cells specifically (measured on a
  live run: the tools hard-refuse the resulting neighbor-in-crop defect, so
  spacing up front saves a sheet re-roll).
- **gpt-image-2 silently squashes past 3:1** — never request a canvas with
  aspect beyond 3:1. For thin strips (a wide bar frame), generate inside a
  ≤3:1 canvas with margins, then `genex ui trim` down to the art.
- **Fix-up recrop, never a Stage-2 re-run for one sprite.** One bad crop:
  re-extract from the cleaned sheet with adjusted `--min-pixels`/`--dilate`,
  or region-`--edit` the sheet and re-extract. Re-running Stage 2 re-rolls
  every OTHER sprite too — the most expensive way to fix one.

## The sheet repair lane — model edits, never pixel hacks

When a sheet defect surfaces AFTER generation — a white-painted trough
(`ui audit`'s hard `white-trough` finding, or `ui masks`' refusal), a wrong
ornament, a mis-drawn cell — the fix is a MODEL edit of the sheet, then
re-clean + re-extract. Never patch shipped pixels by hand (threshold-punching
a trough chews the frame's bezel — a tried-and-rejected workaround; the one
allowed pixel surgery is extraction's own known-matte rim defringe):

```bash
# Whole-sheet repair (all bar cells at once — proven to preserve bezels,
# ornaments AND the green annotated twins):
npx genex image "Repaint every meter channel interior as the meter's EMPTY state: a flat dark in-style track. Change nothing else." --edit <sheet-url>

# Region repair (one cell, others must not re-roll): add a mask whose
# TRANSPARENT hole covers the zone to change — assemble it from the channel
# mask + the cell's crop rect, or a hand-drawn rectangle:
npx genex image "<same repaint ask>" --edit <sheet-url> --inpaint <mask.png>
```

**`--inpaint` honesty — a targeting scope, not a scalpel.** The mask focuses
WHERE the change happens (proven: the masked cell's trough repainted while the
other bar's design survived untouched) — but the WHOLE sheet still re-renders
and any transparency is destroyed either way. So after ANY repair edit,
mandatory: re-run `--clean` on the result, re-extract, and re-derive masks —
the old crops/masks describe the pre-edit sheet.

## Composition rules (each one is a documented failure class)

- **Continuous fills = fill-on-top masked reveal.** HP, mana, fuel, XP,
  stamina, charge — NEVER generate `*-fill.png` sprites, and NEVER use a
  naive `width`/`height` percentage of the widget box (it drifts ~12% off the
  art's real channel: empty at 25%, full by 75%). THE bar recipe: the frame
  sprite carries its EMPTY dark track baked at source (Stage-2 track rule),
  and a near-opaque gradient fill paints ON TOP of it, clipped to `FB` inside
  the channel mask — the masked-fill DOM pattern below. Never a plate/track
  div stacked behind the frame to fake an empty state.
- **Minimap/radar interiors are an empty CSS disc** (`border-radius: 50%`,
  dark background). Only the decorative ring frame is a sprite, prompted with
  an explicitly **transparent center — no map, no terrain inside**. Gameplay
  code paints blips into the disc at runtime; the model otherwise invents
  garbled fake streets.
- **Dial needles = ONE up-pointing sprite + a computed rotation.** Never one
  sprite per angle. `transform: rotate(<deg>)` with `transform-origin: 50% 100%`
  (pivot at the needle base), sweeping `-135deg..135deg` for a classic dial:
  `rotate(${-135 + 270 * clamp(v / max, 0, 1)}deg)`.
- **Segmented bars = 3 stacked divs**: (1) a full-width dark track, (2) the
  solid scaling fill, (3) a fixed full-width notch overlay
  (`repeating-linear-gradient(to right, transparent 0 9%, #1c1c24 9% 10%)`)
  painted ON TOP. Never put the gradient on the scaling fill itself — its `%`
  stops anchor to the fill's own width and the segments visibly compress as
  the value drops.
- **A numeric readout sitting as bare text over the scene gets a backing
  plate** — a `background: rgba(10, 8, 6, 0.6)` rounded div behind the text, an
  extracted plate sprite when the art has one, or a deliberate skip documented
  in a comment (`/* no plate — reads against <reason> */`). Bare digits look
  fine over the dev background and vanish over a bright scene. A readout
  already sitting on an opaque frame sprite needs NO separate plate — the frame
  backs it; a second dark div only boxes it (the no-double-backing rule above).

## Discrete vs continuous — classify every meter before Stage 2

**The rule: does the quantity change in whole units the player counts?**
Hearts, lives, ammo bullets, stars, mana pips, wave markers → DISCRETE.
HP %, fuel, XP, stamina, charge → CONTINUOUS. The two ship through different
recipes, and classifying late means re-doing the sheet:

- **Discrete = repeated sprites, NEVER a masked fill.** A masked reveal
  swept across a row of icons slices an icon mid-body at most values — the
  classic badly-masked hearts. Ship one `<img>` per unit
  (`Array.from({ length: count })`), with partial states as sprite VARIANTS —
  full/half/empty cells requested on the Stage-2 sheet as separate same-size
  cells. Stacking (empty cell under a lit cell, dimmed vs lit) beats swapping
  when the art allows it.
  - **Overflow pre-flight** before placing:
    `max_count × item_w + (max_count − 1) × gap ≤ widget_w` — at MAX count,
    not the current one.
  - **Anchor rule:** align the row to ONE end (start or end, matching the
    widget's screen anchor); never center a count that changes — it reflows.
  - Simple-shape counters CSS renders crisper than any sprite (plain
    dots/pips) stay CSS by Rule B — but styled from the brief: hue, stroke,
    glow, state change. Unstyled system glyphs are the defect.
- **Continuous = the masked-fill pattern below.** Frame sprite + green-key
  mask + fillBox-relative clip. Never a `*-fill.png`, never a naive width%.
- **Segmented continuous meters** (ONE frame, N visible slots, fractional
  value — a posture/heat bar with slot dividers): use the `segments` array
  the masks JSON writes next to `fillBox` (per-slot fillBoxes, sorted
  left-to-right). Fill `Math.floor(v)` segments fully (each clipped to 100%
  of its own fillBox), clip segment `Math.floor(v) + 1` fractionally INSIDE
  its own fillBox, leave the rest empty. Never sweep one clip across all
  slots — the union `fillBox` is for single-channel fills only.
- **Never bake a label mid-channel.** A label or ornament painted in the
  MIDDLE of a fill channel splits the mask into fragments and the fill into
  pieces. Labels sit above/beside the channel or on the frame's end caps —
  it's a Stage-2 prompt rule; if a sheet comes back violating it, region-edit
  that cell before running masks.

## The masked-fill DOM pattern (the crown jewel)

Full annotated version with all direction variants and a worked HP-bar
example: [references/masked-fill.md](references/masked-fill.md). The compact
form:

```html
<div class="widget" id="hud-hp">          <!-- root: overflow VISIBLE (glows may bleed) -->
  <img class="hp-frame" src="/assets/hud/hp-frame.png" alt="">  <!-- frame + baked empty track -->
  <div class="hp-mask">                   <!-- outer: the silhouette mask, ON TOP of the frame -->
    <div class="hp-fill" data-fill data-fill-mask="hp-mask.png"
         data-fill-box="0.0784,0.3469,0.9216,0.3605"
         data-fill-from="left" data-fill-ratio="0.72"></div>
  </div>
</div>
```

```css
.widget  { position: absolute; overflow: visible; }
.hp-mask { position: absolute; inset: 0; overflow: hidden;
           -webkit-mask-image: url(/assets/hud/hp-mask.png);
           mask-image: url(/assets/hud/hp-mask.png);
           -webkit-mask-size: 100% 100%; mask-size: 100% 100%;
           mask-repeat: no-repeat; }
.hp-fill { position: absolute; inset: 0;   /* FULL-BOX gradient; the clip places the edge */
           background: linear-gradient(180deg, #ef5b5b, #7a1d18); }
.hp-frame { position: absolute; inset: 0; width: 100%; height: 100%;
            object-fit: fill; }            /* under the fill: its baked track IS empty */
```

```ts
// FB = the mask's fillBox from the `genex ui masks` JSON — the TRUE channel.
const FB = { x: 0.0784, y: 0.3469, w: 0.9216, h: 0.3605 };
const fill = document.querySelector<HTMLElement>("#hud-hp .hp-fill")!;

function setHp(hp: number, maxHp: number): void {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const cx = (FB.x + ratio * FB.w) * 100;               // left-fill: edge at the CHANNEL level
  fill.style.clipPath = `polygon(0% 0%, ${cx}% 0%, ${cx}% 100%, 0% 100%)`;
  fill.dataset.fillRatio = String(ratio);               // keeps the fill auditable
  const low = hp / maxHp < 0.25;                        // the reactive element (see below)
  fill.style.filter = low ? "drop-shadow(0 0 12px #ff2a36)" : "none";
}
```

The structure, in one breath: the frame `<img>` (with its baked EMPTY track)
paints first with `object-fit: fill`; the OUTER div after it carries the alpha
mask (`mask-image` + `mask-size: 100% 100%`, `overflow: hidden`) so the fill
can only exist inside the art's channel; the INNER div is a FULL-BOX gradient
whose `clip-path` places the leading edge at the **channel-relative** level
using `FB` — for a left fill the right edge sits at `(FB.x + ratio * FB.w) * 100%`,
for a bottom fill the top edge at `(FB.y + (1 - ratio) * FB.h) * 100%`. Stamp
`data-fill`, `data-fill-mask`, `data-fill-box`, `data-fill-from`, and
`data-fill-ratio` on the inner div — they make every fill auditable against
the mask JSON. The widget root keeps `overflow: visible` so glow effects bleed
past the art instead of clipping to a hard square. (Fill UNDER the frame is
the exception, for genuinely transparent channel cavities with a reason —
[references/masked-fill.md](references/masked-fill.md) has the rule.)

## Reactivity — the juice floor

A live HUD moves; a static one is a mockup screenshot. The floor for THIS
skill (each is a few lines of plain JS + CSS):

- **Numbers tween, never snap.** Score/coins/ammo tick to the new value over
  ~300 ms (`requestAnimationFrame` lerp on the displayed number).
- **Damage-chip bar**: behind the instant red fill, a white/pale "chip" layer
  eases down ~600 ms later — the player reads exactly how much that hit cost.
  (Two stacked fills in the same mask; the chip's `clip-path` lags the real
  one via a delayed transition.)
- **A damage flash**: a screen-edge vignette pulse on hit (one full-screen
  div, `opacity` keyframe), not a number cloud.
- **At least one threshold state** — a change of VISUAL, not just of fill:

```ts
const low = hp / maxHp < 0.25;
el.style.color = low ? "#ff6b6b" : "#f4e3b8";
el.classList.toggle("pulse", low);   // @keyframes pulse in your CSS + a transition
```

- **Pickup pop**: the touched counter scales 1 → 1.15 → 1 (~150 ms) when it
  gains.

Impact feedback beyond the HUD (hitstop, camera shake, difficulty ramp) is
`$genex-threejs-game-feel` — run its pass before calling the game done; the
HUD's reactive layer and that skill's feedback layer are designed together.

## Placement

Position widgets by **anchor + reference-1920×1080 pixels**, scaled by
`viewportH / 1080` so the HUD holds its physical position on any aspect ratio:

```ts
function layoutHud(): void {
  const s = innerHeight / 1080;
  const hp = document.getElementById("hud-hp")!;
  hp.style.left = `${40 * s}px`;
  hp.style.bottom = `${40 * s}px`;
  hp.style.width = `${560 * s}px`;
  // h derived from the frame art's REAL aspect (trim/extract sidecar dims), never eyeballed:
  hp.style.height = `${Math.round(560 * (102 / 760)) * s}px`;  // hp-frame.png is 760x102
}
layoutHud();
window.addEventListener("resize", layoutHud);
```

Genre defaults (tweak per game): **hp** bottom-left `(40, -40)`; **ammo**
bottom-center; **crosshair** dead center, ~48px, aspect locked; **score**
top-center; **minimap** top-right, ~220px square.

Two hard rules:

- **The box aspect must match the frame PNG's aspect** (use the dims from the
  `genex ui trim` output or the extract `.bbox.json` sidecar): pick ONE
  dimension by design and COMPUTE the other. `object-fit: fill` on a
  mismatched box squashes the art.
- **≥ 20px gaps** (reference pixels) between widgets sharing an anchor —
  tighter visibly overlaps once sprite padding is counted.

## Verify before calling it done

**This is a gate, not a suggestion — the HUD is not "done", does not ship, and
is not called a milestone until you have looked at it running.** The field
failure is an agent that wires the sprites, takes one glance, notices a possible
clip or cutoff, and ships anyway with "I'll refine if the user reports issues."
That punt IS the defect. You are the one who verifies, not the user. If you are
out of budget to check, say the HUD is unverified — never call it done.

- **Open every extracted PNG and eyeball it** — right subject, right name.
  The reading-order sort can mismap when rows are uneven; re-run `extract`
  with corrected name order rather than regenerating anything.
- **Fills grow monotonically** — drive each fill through 0 → 50 → 100 and
  confirm the reveal grows and stays inside the art's channel (never bulging
  past the frame's track). A screenshot at full HP proves nothing about a
  meter — the classic shipped defect (a painted-full trough behind the mask)
  is invisible at 100%. This is why the milestone smoke pass's gameplay
  capture is taken AFTER taking damage once.
- **No text clips** — for every text node, `scrollWidth <= clientWidth`.
  Display fonts run 25–50% wider than a naive estimate; widen the box or drop
  the weight, don't shrink the font.
- **No widget overlaps** at the reference viewport, and none off-screen.
- **Screenshot the running HUD and inspect it** — bright AND dark scenes —
  with `$genex-threejs-visual-validation`'s capture discipline. **Zoom every
  corner:** no sheared frames, no clipped/cut corners, no text truncated or
  colliding with an edge. Judge the pixels, not your intent — skipping this is
  exactly how the "cut corners" defect ships.

## The closing wiring audit — the pipeline's final stage, not optional

The most expensive failure this pipeline has produced in the field is not
bad art — it is validated assets that never got WIRED: masks sitting on disk
while the shipped fill was a naive width%, frame sprites stretched into
boxes of the wrong aspect. Close every HUD build with this audit:

1. **Wired-or-reasoned table.** Every PNG in `public/assets/hud/` is either
   referenced in code/CSS or has a one-line written reason it was cut. No
   third state.
2. **No naive %-fills.** Grep your own code for dynamic width/height percent
   writes — every continuous fill goes through the masked-fill clip with a
   real `FB` from the masks JSON.
3. **Box aspect = sprite aspect** for every placed widget, computed from the
   trim/extract sidecar dims — not from the mockup, never by eye.
4. **Every mask referenced.** Each `<name>-mask.png` appears in a CSS
   `mask-image` (or its widget has a written reason).
5. **Text placement from `innerBBox`, colors from `genex ui text-color`** —
   verbatim hex, no free-picked palette colors.
6. Run **`npx genex ui audit`** (it also runs automatically as a preflight in
   `genex preview`/`publish`) and clear or explain every finding — its
   findings are heuristics, so "checked, fine because X" is a valid close.

**The subagent handoff rule.** If stages 2–3 ran in a subagent or an earlier
session, the wiring agent MUST read the produced `*.annotated-progress.json`
and `.bbox.json` files from disk before wiring — a prose summary of them
does not count. fillBox numbers, `segments`, and real sprite dims do not
survive paraphrase; the canonical version of this failure is a subagent
reporting "masks validated" while the parent ships width% fills.

**Do not fire-and-forget the whole HUD/menu/logo into one background subagent.**
The field failure: the entire art lane was handed to a single background agent
that then stalled overnight, so every preview the user played showed bare CSS
bars and the sprites they were promised only landed hours later, unseen. If art
runs in a subagent it is a BOUNDED task you wait on, then wire and verify in
THIS session — not an overnight handoff. While commissioned art is pending the
HUD is unverified: do not call it done or push it as a finished milestone. If a
subagent stalls or misses its window, wire what landed and say plainly which
widgets are still waiting on their sprites — never present unfinished art as
the finished look.

## Cost & latency honesty

A full sprite HUD is **~9 image generations** (mockup + deconstruct + clean +
a few sprite re-rolls), a couple of minutes each at high quality — budget an
hour end to end, not five minutes. A single element is a fraction of that:
one generation plus free local steps. That fits comfortably inside the image
rate limit; local `genex ui` steps are free and instant. One rule keeps the
clock honest: when the lane runs, it runs WHILE you build — enqueue with
`--no-wait`, code the layout against plain CSS bars, swap sprites in as
stages land, and never sit in a foreground wait.

## Publish checklist

- **Extracted sprites and masks are LOCAL files in `public/assets/hud/`** —
  unlike other generated assets, they ship with the build and belong in the
  repo. Reference them by relative path (`/assets/hud/hp-frame.png`), which
  resolves at the domain root in dev and published alike.
- Keep the mockup and cleaned-sheet **R2 URLs in a comment** near the HUD
  code — sheet region-edits and re-extraction need them, and they're permanent.
- Every fill uses the masked reveal with a real `FB` from the masks JSON — no
  naive percentage fills hiding anywhere (`data-fill-*` stamps make this
  greppable).

## Options

- `npx genex image` — `--size <WxH>` exact pixels (multiples of 16, each side
  ≤ 3840, aspect at most 3:1); `--quality <low|medium|high>` (high for the
  mockup/sheet, medium for single sprites); `--candidates <2|3|4>` several
  variants in ONE call (only when the player asks for variants — one mockup
  is the default); `--edit <url|file>` image-to-image edit of an
  R2 URL or a local image file (≤4 MB, inlined); `--clean <url>`
  background removal only; `--remove-bg` chains removal after a
  generation/edit; `--bg-mode <sprite|glyph|sheet>` picks the removal model
  (`glyph` for digits/closed shapes; `--clean` defaults to `sheet`; `matte`
  = BiRefNet soft alpha for hair/glow/smoke edges the binary cutters butcher);
  `--no-wait` enqueue and continue — `npx genex wait <id>` picks the result
  up later (safe to re-run; never creates a new generation);
  `--inpaint <mask.png|url>` region mask for `--edit` (transparent hole =
  the zone to change — see the repair lane's honesty note);
  `--upscale <url>` 2x utility upscale of an existing asset;
  `--glass` the magenta-key glass lane (`$genex-ai-image`).
- `npx genex ui extract --in <png|url> --out-dir <dir> --names a,b,c` — also
  writes a `.bbox.json` sidecar per sprite (with `innerBBox` for text
  placement); `--expect <n>` hard-errors on a component miscount before
  writing anything; `--min-pixels <n>` lowers the
  component threshold when a small sprite is missed.
- `npx genex ui masks --in <png|url> --out-dir <dir> --auto [--names a,b]` —
  detects the clean/annotated cell pairs itself; explicit fallback
  `--pairs "name:cx,cy,w,h:ax,ay,w,h:n"`. Emits `<name>-frame.png`,
  `<name>-mask.png`, an overlay, and the JSON with `fillBox` (`FB`) plus
  per-slot `segments` for segmented meters.
- `npx genex ui text-color --in <png|url> --box x,y,w,h` — deterministic
  eyedropper: background/plate color + dark/light/chromatic ink candidates.
  Use the returned hex verbatim for the DOM text over that region.
- `npx genex ui trim --in <png>` — crop to alpha content + report real dims.
- `npx genex ui plate --in <frame.png> [--erode 2]` — trace the frame's real
  interior (art + enclosed cavity) into `<name>-plate.png`; wire it as the
  CSS plate's `mask-image` (the silhouette-plate rule above). Free, local.
- `npx genex ui audit [--dir public/assets/hud] [--src src]` — the mechanical
  wiring scan (unreferenced sprites/masks, naive %-fill patterns, and a
  missing/incomplete mobile viewport meta in the root `index.html`); warn-only
  except the provable kinds (`mask-frame-mismatch`, `white-trough`), which
  exit 1; `--strict` exits 1 on any findings.
- Extraction defringes chroma-keyed sprite rims by default (2px matte
  un-blend against the sheet white — kills the halo over dark scenes; the
  sidecar stamps `defringed`); `--no-defringe` opts out.

## Troubleshooting

- **"Not authorized"** — run `npx genex init` first (in the project — it resolves this project's own CLI) (it
  writes your `GENEX_TOKEN`).
- **"Prompt rejected"** — the provider's content-safety filter blocked the
  prompt. Non-retryable; rewrite the wording.
- **Generation takes minutes** — normal at high quality; let the command wait
  and print the URL (the next pipeline step needs it, and re-running creates —
  and bills — a new generation).
- **A sprite got the wrong name** — extraction sorts by reading order
  (top-to-bottom bands, left-to-right within a band); uneven rows can shift
  the mapping. Re-run `extract` with the names reordered — no generation
  needed.
- **A small element is missing from extraction** — it fell under the component
  threshold; re-run with `--min-pixels 500`.
- **The fill drifts off the art's channel** — a naive `width`/`height` % crept
  in, or `FB` doesn't match the mask. Use the clipPath formula with the
  `fillBox` from the masks JSON, verbatim.
- **The fill never shows, at any ratio** — the fill is painting UNDER the
  frame while the frame's channel is opaque track art. The recipe puts the
  mask div AFTER the frame `<img>` in source order (fill on top); check the
  DOM order first. The mask keeps the fill inside the channel, so the rim and
  baked labels are unaffected (see [references/masked-fill.md](references/masked-fill.md)).
- **`genex ui masks` fails registration/coverage checks** — the annotated
  duplicate drifted from the clean cell (different scale/position) or the
  green isn't flat `#00ff00`. Region-edit the sheet (`--edit <sheet-url>`)
  asking for a same-size duplicate with flat green fill zones, then re-run.
  Do NOT loosen the tolerance to force a pair through: a mask registered off
  its frame ships a fill that floats off the art, and loosened runs are
  stamped in the metadata (preview/publish will warn about them).
- **`ui masks` refuses: "the fill channel is painted filled in the frame
  art"** — the sheet model ignored "REMOVE the fill" and left the bar painted
  full (usually near-white). The defect is invisible at 100% and shows the
  moment the value drops. Region-edit that cell so the trough is EMPTY
  (dark/recessed, no fill), then re-run — never wire that frame as-is.
- **`ui audit` errors with `white-trough`** — a shipped frame's fill channel
  measures opaque near-sheet-white: the model drew the trough white/filled and
  the cleaner can't reach enclosed regions. Under-fills silently never show
  behind it. Run the sheet repair lane (region-edit the trough to its EMPTY
  dark track, `--inpaint` for one cell), then re-clean + re-extract — never
  ship the frame, never pixel-punch the white out.
- **After any `--edit`/`--inpaint` repair the sprites look stale/wrong** —
  the whole sheet re-rendered (that's the edit contract): the OLD extractions
  and masks describe the pre-edit sheet. Re-run `--clean`, re-extract, and
  re-derive masks against the new sheet URL.
- **Wisps, glows, smoke, hair get chopped by `--remove-bg`** — the binary
  cutters can't do soft edges. Recut with `--bg-mode matte` (BiRefNet soft
  alpha).
- **`ui masks`/`ui extract` refuses: "the crop catches another sheet
  element"** — elements sit too close on the sheet, so the crop would bake a
  sliver of a neighbor into this asset. Regenerate the sheet with more
  spacing between elements (or tighten the crop / lower `--padding`).
- **"the crop box is slicing the element" (flush edge)** — widen the crop box
  if the sheet has room; otherwise the sheet ran out of margin here —
  region-edit or regenerate it with more margin around the element. There is
  no tolerance to bump: a sliced frame ships as a cut-off corner.
- **`ui audit` errors with `mask-frame-mismatch`** — the CSS ships a frame
  PNG cut from DIFFERENT sheet geometry than the crop the mask was derived
  against, so the fill floats off the frame. If you swap which frame variant
  ships, re-run `ui masks` against it (or ship the mask's own `-frame.png`) —
  a frame swap is never cosmetic once a mask is involved.
- **`masks --auto` reports ambiguity or a missing twin** — it never guesses:
  fall back to explicit `--pairs` with hand-read crop rects for just that
  meter (the error lists the candidate cells it saw).
- **The green mask splits into unexpected components** — a label or ornament
  is baked mid-channel. Region-edit that cell to move the label onto the
  frame's end caps (see the mid-channel rule), or treat it as a segmented
  meter and wire the `segments` array.
- **Digits or `$`/`%` come back hollow after `--remove-bg`** — closed loops
  read as background to the default cutter. Regenerate with `--bg-mode glyph`.
- **A widget looks squashed** — the placement box aspect doesn't match the
  frame PNG (`object-fit: fill` stretches). Get the real dims from
  `genex ui trim` and compute the box from them.
- **The mockup came back tilted / in perspective** — it won't deconstruct
  cleanly. Keep the flat-framing paragraph in the Stage-1 prompt and
  regenerate before Stage 2.
