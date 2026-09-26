# Stage 2 prompt template — deconstruct into an asset sheet

Fill `[ASSET_LIST]`, then pass the whole text as the prompt to
`npx genex image "<filled prompt>" --edit <mockup-url> --quality high`.

`[ASSET_LIST]` is an itemized list of the assets to produce. Each item:

- **states its source location** in the mockup ("the HP bar at the bottom
  left") so the model finds what to copy;
- **states the fused-unit boundary** when the element is several visually
  attached pieces ("the bars panel INCLUDING the gold cross ornament on its
  left") — separating spatially fused ornament from its container makes
  code-side reassembly fragile, so fused units stay one asset;
- **states what to KEEP** from your text-ownership record (`baked_static`
  identity labels);
- **states what to REMOVE** (`runtime_static` labels and `runtime_dynamic`
  values, fills, items);
- **requests chrome only** — never a panel's plate/backing surface,
  translucent or solid: plates are rebuilt at runtime in CSS (rgba,
  backdrop-filter, or a solid fill — whatever matches the mockup), so ask
  for the panel's frame/brackets/ornament, not the panel surface itself;
- **requests the annotated duplicate** for every CONTINUOUS bar/meter frame
  (the template's progress block below covers the mechanics — your item just
  says "output the clean frame + annotated duplicate pair");
- **requests variant cells for discrete icon counters** — hearts, ammo
  pips, stars ship as repeated sprites, not masks, so their item asks for
  the states as SEPARATE same-size cells ("the heart icon: one full, one
  half, one empty cell") instead of an annotated pair;
- **asks for extra whitespace between meters that were STACKED in the
  mockup** ("place the health-bar cells and the stamina-bar cells in
  separate rows with generous spacing") — adjacent meters otherwise cluster
  into one crop and the extraction tools refuse the pair.

## The template

```
Look at this game HUD screenshot. Produce a GAME DEVELOPMENT ASSET SHEET — the individual reusable building-block graphics a developer would composite with code at runtime. The output is NOT a rearrangement of the visible HUD. It is a list of distinct extractable assets, where each asset preserves the EXACT proportions and visual style of how it appears in the source.

Lay these assets on a pure flat white #ffffff background, separated by at least 100px of clear whitespace between each:

[ASSET_LIST]

If an asset is a generated progress/bar/meter frame, output TWO CELLS immediately beside each other:
1. LEFT CELL — the clean production asset the game will use. Preserve exact style, baked_static labels, frame metal, bevels, dividers, scratches, proportions, and texture. Remove runtime dynamic fill and values. Every meter/bar cell shows the meter EMPTY: the channel interior is painted as the meter's dark empty track in the art's own style — recessed, unlit, like a drained lamp-oil groove or a powered-down light strip. NEVER white, NEVER a filled bar, NEVER the sheet background color inside a frame. Do not paint technical colors on this clean cell.
2. RIGHT CELL — an annotated duplicate of the same production asset. It must be the same asset, same scale, same canvas bounds, same position, and same outer shape as the left cell. The only difference: paint runtime-fill zones with pure green key color #00ff00. Green marks only the places where runtime bar/progress fill should appear. Paint the green as a FLAT, UNIFORM, fully-saturated #00ff00 fill — no shading, no gradient, no inner shadow, no vignette, NO DARKENING TOWARD THE EDGES, no lighting, no highlights, no texture; constant color edge-to-edge with a HARD, CRISP boundary against the frame. The green is a chroma-key, not a lit surface — any edge shading makes the extracted alpha mask ragged. For segmented meters, paint each segment slot as a separate green shape; do not merge slots into one continuous strip and do not paint half-segments. Never place a label or ornament in the middle of a fill channel — labels belong above/beside the channel or on the frame's end caps.

Do NOT create a separate black-background mask cell. Do NOT create a standalone simplified silhouette. The right cell is a registration-safe annotation map; local tooling derives the alpha mask from its green pixels and uses the left cell as the frame.

PRESERVE the exact visual style, materials, colors, ornamental detail, and PROPORTIONS of every asset as it appears in the input image. Do not redraw, do not stylize, do not normalize aspect ratios to standard shapes, do not "improve" anything. The ONLY changes are the content removals listed above (bar fills, slot items, map content, runtime-owned text, dynamic-value text, etc).

CRITICAL text ownership distinction:

KEEP these baked into the asset — they are part of the panel's IDENTITY and never change at runtime:
- Static labels carved or painted into the frame: panel titles, axis tick labels, scale numerals, unit indicators ("LB", "FT", "%"), decorative engravings
- Large sticker/hazard-panel identity labels printed into the design (examples: "SCORE", "RUN", "SPECIAL", "SPEED")
- Static notch / segment dividers along a bar's length (runtime code composites a scaling fill beneath them)
- Decorative graphics fused with the panel: an engraved emblem on a coin, a carved compass rose on a bezel, a fixed icon glyph on a slot frame
- Tick marks on a fixed scale (depth gauge marks, dial gradations)

REMOVE runtime-owned content:
- Current numeric values (the "1247" coins, the "47" ammo count)
- Current bar fill levels (the colored fill INSIDE a bar — runtime code paints the fill; the emptied channel shows the meter's own dark empty track, never white, never the sheet background)
- Current item icons inside slots (the sword, potion — runtime renders the equipped item)
- Current map content / radar blips (the game paints these at runtime)
- Any editable or localizable label the design does not fuse into the frame, even if it does not change frame-to-frame

The test for each text element: "is this fixed identity artwork, or should runtime code own it?" Fixed identity → KEEP. Runtime-owned → REMOVE.

DO NOT include in the output sheet:
- Pure tick-mark strips, line-only compass rails, or any element that consists only of evenly-spaced lines / dashes WITH NO surrounding frame or ornament
- Crosshairs and reticles built from simple geometric primitives (corner brackets, dots, plus signs, triangles)
- Plain rectangles, plain circles, plain triangles without texture or ornament
- Simple dot indicators, status pips, blip markers
- Fills inside bars, items inside slots, map terrain inside minimap rings (these are added at runtime by CSS / game code)

Those excluded elements will be recreated by runtime code (CSS shapes and DOM text) — much crisper than a downsampled PNG. Recreated does NOT mean default-styled: reticles, pips, and cues still follow the style brief (stroke weight, glow, state colors). An ornamented, identity-bearing reticle — an engraved ring, sculpted brackets — is NOT a simple primitive; include it in the asset list like any other chrome.

Pure white #ffffff background everywhere except where the actual UI assets sit.
```

Adapt the concrete KEEP/REMOVE examples to YOUR mockup's text-ownership
record — the categories are fixed, the examples are illustrations. The
annotated duplicates are extraction guides, not runtime art: after the
`--clean` pass, feed each clean/annotated cell pair to `npx genex ui masks`
to derive the mask PNG + `fillBox`.
