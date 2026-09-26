# The masked-fill DOM pattern

Every continuous fill (bar, meter, orb, gauge) inside a generated frame is a
**masked directional reveal**: two nested divs plus the frame image. The mask
confines the fill to the art's exact silhouette; a `clip-path` on a full-box
inner div places the leading edge at the channel-relative level.

## Why not `width: ratio * 100%`?

The art's fillable channel does not span the widget box — the frame's
ornament eats the ends. Scaling the fill's own width/height against the FULL
box drifts up to ~12% off the real channel (measured: reads empty at 25%,
full by 75%). The reveal edge must be placed at `ratio` along the **true
channel** — the `fillBox` (`FB`) that `npx genex ui masks` measures from the
mask's opaque pixels and prints in its JSON.

## Structure

```
widget root            position:absolute; overflow: VISIBLE   ← glows may bleed past the art
├─ frame <img>         inset:0; width/height:100%; object-fit:fill   ← the frame WITH its baked
│                                                                      empty dark track (Stage-2 rule)
└─ outer mask div      inset:0; overflow:hidden; mask-image:url(<mask.png>); mask-size:100% 100%
   └─ inner fill div   inset:0; FULL-BOX gradient; clip-path places the edge; data-fill-* stamps
```

Confinement is the outer div's job (`overflow: hidden` + the mask). The
widget **root stays `overflow: visible`** — otherwise any glow/halo that
blooms past the silhouette gets sliced to a hard square.

**The fill paints ON TOP of the frame — that is the recipe, not a fallback.**
The Stage-2 sheet rule bakes every meter's EMPTY dark in-style track into the
frame art, so the empty state is the art itself; the fill is a near-opaque
gradient revealed over that track, and the mask confines it to the channel
pixels so the rim, bezels, and any baked labels stay untouched. (Source order
does the stacking: frame `<img>` first, mask div after — no z-index needed.)
Painting the fill UNDER the frame is the exception, taken only when the frame
has a genuinely transparent channel cavity AND a reason to use it — e.g. a
real-translucency glass channel (`genex image --glass` art) the fill should
glow through, or ornament overhangs that must paint over the moving fill.
Never stack a plate/track div behind an opaque frame to compensate for a
white-painted trough — a white or stained trough is a sheet defect
(`ui audit` flags it); repair the SHEET (region-edit the trough to its empty
dark track, re-clean, re-extract), never patch it at composite time.

## The reveal formulas

`ratio = clamp(value / max, 0, 1)`. `FB = { x, y, w, h }` in 0..1 fractions
of the widget box (from the masks JSON). The edge coordinate is a percent of
the FULL box:

| `from` | leading edge | clipPath |
| --- | --- | --- |
| **left** | `cx = (FB.x + ratio * FB.w) * 100` | `polygon(0% 0%, cx% 0%, cx% 100%, 0% 100%)` |
| **right** | `cx = (FB.x + (1 - ratio) * FB.w) * 100` | `polygon(cx% 0%, 100% 0%, 100% 100%, cx% 100%)` |
| **bottom** | `cy = (FB.y + (1 - ratio) * FB.h) * 100` | `polygon(0% cy%, 100% cy%, 100% 100%, 0% 100%)` |
| **top** | `cy = (FB.y + ratio * FB.h) * 100` | `polygon(0% 0%, 100% 0%, 100% cy%, 0% cy%)` |

Left/right suit horizontal bars; bottom suits orbs and vertical gauges (the
liquid rises). For an orb whose empty top would show the scene through the
glass, add a dark cavity div (a circle at the `FB` box) BEHIND the fill so
the empty portion reads as deep glass rather than a hole.

## Segmented meters — the `segments` array

A meter whose frame has N visible slots but a CONTINUOUS value (a posture or
heat bar with dividers) never sweeps ONE clip across all slots — the union
`FB` would light half a slot's divider at most values. The masks JSON writes
`segments` next to `fillBox`: per-slot fillBoxes sorted left-to-right, each
`{ index, fillBox }` in the same 0..1 space. Wire it per slot:

```ts
// v in [0, N] — e.g. 2.4 = two full slots + 40% of the third.
function setSegmented(fill: HTMLElement[], segments: { fillBox: FB }[], v: number): void {
  segments.forEach((seg, i) => {
    const local = Math.max(0, Math.min(1, v - i));      // this slot's own 0..1
    const b = seg.fillBox;
    const cx = (b.x + local * b.w) * 100;
    // One fill div per slot, all inside the same mask div:
    fill[i]!.style.clipPath = `polygon(${b.x * 100}% 0%, ${cx}% 0%, ${cx}% 100%, ${b.x * 100}% 100%)`;
  });
}
```

Full slots clip to 100% of their own box, the fractional slot clips inside
its own box, empty slots clip to zero width. One fill div per slot (same
gradient, same mask parent) keeps each slot's edge inside its own channel.

## Discrete counters are NOT masked fills

Hearts, lives, ammo pips, stars — anything counted in whole units — never go
through this pattern at all. A mask swept across a row of hearts slices a
heart mid-body at most values:

```ts
// DON'T: one mask + width clip across a row of heart icons.
// DO: repeated <img> per unit, variants for partial states.
const hearts = document.getElementById("hud-hearts")!;
function setHearts(hp: number, max: number): void {   // hp may be 2.5
  hearts.replaceChildren(
    ...Array.from({ length: max }, (_, i) => {
      const img = document.createElement("img");
      const v = Math.max(0, Math.min(1, hp - i));
      img.src = v === 1 ? "/assets/hud/heart-full.png"
        : v >= 0.5 ? "/assets/hud/heart-half.png"
        : "/assets/hud/heart-empty.png";
      return img;
    }),
  );
}
```

The full/half/empty cells come from the Stage-2 sheet as separate same-size
cells (see the stage-2 template). Pre-flight the row at MAX count:
`max × item_w + (max − 1) × gap ≤ widget_w`, and anchor the row to one end —
never center a count that changes.

## The `data-fill-*` contract

Stamp these on the inner fill div, derived from the SAME variables that
drive the clip — they make every fill auditable against the masks JSON
(and greppable, so no naive percentage fill hides in the codebase):

| Attribute | Value |
| --- | --- |
| `data-fill` | present on every fill element |
| `data-fill-mask` | the mask PNG basename, e.g. `hp-mask.png` |
| `data-fill-box` | `` `${FB.x},${FB.y},${FB.w},${FB.h}` `` |
| `data-fill-from` | `left` \| `right` \| `top` \| `bottom` |
| `data-fill-ratio` | the current `ratio`, updated with the clip |

## Worked example — an HP bar (left fill)

`genex ui masks --out-dir public/assets/hud` wrote `hp-frame.png` +
`hp-mask.png` and, beside them, `hp.annotated-progress.json` (one object per
pair; the run's index `annotated-progress.json` nests the same objects in a
`pairs` array). `fillBox` sits at the object's top level:

```json
{
  "input": "<cleaned-sheet-url>",
  "pairs": [
    {
      "name": "hp",
      "fillBox": { "x": 0.0784, "y": 0.3469, "w": 0.9216, "h": 0.3605 },
      "mask": { "path": "public/assets/hud/hp-mask.png", "...": "..." },
      "...": "..."
    }
  ]
}
```

```html
<div class="widget" id="hud-hp">
  <img class="frame" src="/assets/hud/hp-frame.png" alt="">  <!-- frame + baked empty track -->
  <div class="fill-mask" style="-webkit-mask-image: url(/assets/hud/hp-mask.png); mask-image: url(/assets/hud/hp-mask.png);">
    <div class="fill" data-fill data-fill-mask="hp-mask.png"
         data-fill-box="0.0784,0.3469,0.9216,0.3605"
         data-fill-from="left" data-fill-ratio="0.72"></div>
  </div>
</div>
```

```css
.widget { position: absolute; overflow: visible; }
.fill-mask {
  position: absolute; inset: 0; overflow: hidden;
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-position: center; mask-position: center;
  -webkit-mask-size: 100% 100%; mask-size: 100% 100%;
}
.fill {
  position: absolute; inset: 0;                      /* FULL box — the clip does the work */
  background: linear-gradient(180deg, #ef5b5b 0%, #c84134 60%, #7a1d18 100%);
  transition: clip-path 0.2s ease-out;               /* smooth damage ticks */
}
.fill.low { filter: drop-shadow(0 0 12px #ff2a36); animation: hud-pulse 1s ease-in-out infinite; }
.frame { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
@keyframes hud-pulse { 50% { opacity: 0.75; } }
```

```ts
// FB comes from the masks JSON — never eyeball it, never re-measure by hand.
const FB = { x: 0.0784, y: 0.3469, w: 0.9216, h: 0.3605 };
const fill = document.querySelector<HTMLElement>("#hud-hp .fill")!;

export function setHp(hp: number, maxHp: number): void {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const cx = (FB.x + ratio * FB.w) * 100;
  fill.style.clipPath = `polygon(0% 0%, ${cx}% 0%, ${cx}% 100%, 0% 100%)`;
  fill.dataset.fillRatio = String(ratio);
  fill.classList.toggle("low", ratio < 0.25);          // the reactive branch
}
```

Cosmetics (glow, pulse, transition) live alongside the clip but must never
fight it — no `transform`, `width`, or `height` on the fill element; the
computed `clip-path` is the single source of the reveal.

## Verification

Drive each fill through 0 → 50 → 100: it must read empty at 0, grow
monotonically, read full at 100, and never bulge past the frame's visible
track. If the edge lands off the channel, the `FB` in code doesn't match the
masks JSON — or a naive percentage fill crept back in.
