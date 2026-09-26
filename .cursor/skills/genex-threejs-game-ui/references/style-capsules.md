# Style capsules — top-tier UI conventions by genre

How to use: pick the capsule closest to the game, name 2–3 top games of the
genre yourself (you know them), and state in one line which structural
conventions you're borrowing. Borrow **conventions** — placement, hierarchy,
type treatment, material language. Never logos, exact layouts, or a specific
game's trade dress. Then write the shared style brief in the game's OWN world:
the capsule says a racing HUD leans oblique and bottom-right-heavy; your brief
says what it's made of in THIS game.

Every capsule below assumes the base rules from the skill: corners/edges for
UI, one display + one body font, tabular numerals, contrast plates for bare
text over arbitrary scenes (never a second plate stacked behind an opaque
frame sprite), and panel/button corners done the durable way — `border-radius`
for soft corners (it keeps its `border`/`box-shadow` natively), or a generated
frame (`$genex-ai-hud` chrome / a Tier-3 9-slice panel) with the DOM laid over
it for genuinely angular looks. Raw CSS `clip-path`/`mask` corner cuts are
banned per the skill — they shear borders, shadows, and near-corner content,
and re-break on any padding/font change; `mask`/`clip-path` stay reserved for
their ONE established HUD use, the masked-fill progress reveal.

## Fantasy / action RPG

- Survival cluster anchored to the bottom corners or bottom-center (orbs,
  framed bars); ability/item hotbar bottom-center; quest/objective text
  top-right, quiet.
- Ornament lives on widget FRAMES (metal, carved wood, parchment edges) —
  never as full-screen ambient texture.
- Serif or engraved display type; humanist body; muted earthy palette with ONE
  saturated accent reserved for danger/low-health.
- Feedback is material: gold glints on pickup, red vignette pulse on damage.
- Menu lean: **boxed plate buttons** (or left rail when the vista carries a
  strong subject); ornate engraved logotype; sprite-chrome buttons suit the
  most crafted briefs.

## Clean sci-fi / space

- Hairline strokes (1px), thin geometric panels, generous empty space between
  widgets; data clusters hug the screen edges.
- Uppercase display type with wide letter-spacing; small caps or condensed
  body; monochrome (near-white on near-black) plus a single accent hue.
- Panels read as glass: slight transparency, subtle inner glow, no drop
  shadows heavier than a whisper.
- Motion is precise and quick (120–200 ms), no bounce.
- Menu lean: **centered stack** or **minimal fullbleed**; hairline plate
  buttons or bare text with wide tracking; a thin geometric logotype.

## Racing / arcade sport

- Speed/tacho cluster bottom-right — one huge numeral, small unit label;
  position/lap counter top-left; the top edge stays nearly empty (the road is
  the point).
- Oblique/italic display type reads as speed; chunky high-contrast chips for
  position and lap deltas.
- Saturated team/brand hues are fine — but two, not six.
- Values tween FAST (speed) or pop (position change); a gear change may
  flash — a full-screen flash may not.
- Menu lean: **bottom command bar** (a garage/grid row); oblique bare-text
  or chip buttons; a fast angular logotype.

## Military / modern shooter

- Ammo bottom-right (large current mag / small reserve), health bottom-left,
  compass strip top-center, hit markers at the crosshair.
- Stencil or condensed grotesque display; desaturated palette — amber/red
  exist ONLY as warnings, so they still mean something.
- Damage reads as a directional vignette, not a number cloud.
- Menu lean: **left rail** with stencil bare text, or a **bottom command
  bar**; a stencil logotype, desaturated.

## Horror

- The strongest HUD is almost none: surface health/resources on change, then
  fade them away; keep permanent chrome minimal and dim.
- Typewriter, worn serif, or handwriting display type; heavy vignette and
  grain in the cohesion layer.
- UI motion is slow (400 ms+) and quiet; a sudden UI move is itself a scare —
  spend it deliberately.
- Menu lean: **diegetic corner** or **minimal fullbleed** — prompt the still
  to leave a calm region for the buttons; worn-type logotype, dim.

## Retro / 8-bit

- Pixel font at INTEGER scales only, hard edges — no anti-aliasing, no blur,
  no gradients; 4–8 color palette total, chosen once.
- Score top-left or top-center, lives as repeated icons — conventions players
  already know; lean on them.
- Motion is stepped (frame-quantized), not eased; an optional scanline overlay
  in the cohesion layer sells it.
- Menu lean: **centered stack** (the arcade attract screen); pixel-font bare
  text with a blinking selector; a chunky pixel logotype at integer scale.

## Cozy / casual

- Rounded shapes, soft single-direction shadows, cream/pastel palette with one
  warm accent; big friendly numerals.
- Buttons are plump and obviously pressable; transitions bounce slightly
  (scale 0.95 → 1.02 → 1) instead of fading.
- Nothing flashes red; even failure is gentle (desaturate + a soft "try
  again").
- Menu lean: **centered stack** with plump CSS plate buttons; a rounded
  friendly logotype.

## Painterly / stylized adventure

- UI elements read as brushwork: irregular edges, hand-drawn frames, paper or
  canvas texture on PLATES (not full-screen).
- A display face with calligraphic character; body stays clean for
  readability.
- Palette lifted from the game's own world — sample the scene (or its key art,
  where the game has some), don't invent a second palette.
- Menu lean: **left rail** or **diegetic corner** over the painted vista;
  brushwork logotype; bare text with calligraphic display face.
