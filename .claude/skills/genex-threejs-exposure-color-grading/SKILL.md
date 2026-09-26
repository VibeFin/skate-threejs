---
name: genex-threejs-exposure-color-grading
description: Build exposure and color grading for Genex Three.js games. Use for luminance metering, eye adaptation, tone mapping ownership, LUT-style grading, scene-referred color, output color spaces, mood passes, and final image consistency across gameplay lighting.
---

# Genex Three.js Exposure And Color Grading

Treat exposure, tone mapping, grading, and output conversion as distinct stages. Tune them from measured HDR signal, not by stacking compensating color operations.

## Order

```text
HDR scene
  → luminance meter
  → adapted exposure
  → tone map
  → creative grade / 3D LUT
  → final output conversion
```

## Film grain — add it only if the look calls for it, and author it correctly

Film grain is a legitimate look. **Badly-authored grain is the single most common
post defect** — it reads as a cheap noise sheet laid over the frame, not as
emulsion, and an owner will call it "some texture rippling over everything." The
exact shape that ships when an agent hand-rolls it:

```glsl
// ✗ DO NOT. This is what "very bad grain" looks like in code.
float g = hash(vUv * 900.0 + fract(uTime) * 133.0) - 0.5;  // measured live in a real game
c += g * 0.045;
```

Four independent defects in that one line, each visible:

1. **`fract(uTime)` re-seeds every frame → it SHIMMERS.** Measured on the shipped
   game: 64.5% of the pixels on a *static* floor change frame-to-frame from grain
   alone (0% with grain off). This is the loudest defect and the easiest to fix:
   grain is **static** unless you deliberately want a slow film cadence.
2. **`vUv * 900` is blocky and stretched.** vUv is 0..1, so ×900 makes ~900 cells
   across the frame — on a 1600×900 window at DPR 2 that's ~3.5×2 px **non-square**
   blocks, not fine grain. Seed on **device pixels** (`gl_FragCoord.xy`), which is
   1 cell per pixel and aspect-correct for free.
3. **Flat additive → it dirties the blacks and blows the highlights.** Real grain
   lives in the **mids**. Weight it by luminance so shadows and speculars stay clean.
4. **`hash()` = `fract(sin(dot()))` has visible blotch structure** — wormy
   low-frequency clumps, not grain. Use interleaved-gradient noise (below) or,
   best, sample a tiling **blue-noise texture** at screen resolution.

The corrected pass — copy this instead of inventing one:

```glsl
// Interleaved-gradient noise: cheap, well-distributed, no sin() blotches.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// ...at the end of the grade, before the output conversion:
float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
float lw   = 1.0 - abs(2.0 * luma - 1.0);   // peaks at mid-grey, 0 at black & white
float g    = ign(gl_FragCoord.xy) - 0.5;    // one sample PER DEVICE PIXEL — fine, aspect-correct
c += g * uGrain * lw;                        // uGrain ~0.02–0.03, NOT 0.045
```

- **Static by default** (no `uTime`). If the look truly wants moving grain, reseed
  at a film cadence, not per frame: `ign(gl_FragCoord.xy + floor(uTime * 12.0))` —
  12 Hz, not 60. Per-frame reseed is the shimmer.
- **A blue-noise texture beats the hash.** `ign` is the no-asset fallback; a
  32–64 px tiling blue-noise PNG sampled at `gl_FragCoord.xy / texSize` gives the
  cleanest grain and is what to reach for if you can generate one.
- **See it in the running game**, and specifically look for shimmer while nothing
  moves (`$genex-threejs-visual-validation` has the two-frozen-frame check).

## Failure conditions

- tone mapping occurs in both materials and post;
- exposure is used to repair physically inconsistent light ratios;
- meter weighting and scene framing are not inspected;
- adaptation speed is the same toward light and dark;
- LUT input/output spaces are undocumented;
- sRGB encoding happens twice;
- a display-domain LUT is moved before tone mapping without being rebuilt;
- grain is re-seeded per frame (it shimmers), tiled in UV space (it blocks), or
  applied flat instead of luminance-weighted (it dirties the blacks).

## Routing boundary

Keep HDR glow, AO, atmosphere, and shared render-target ordering in the game's
existing post stack. This skill owns exposure, tone mapping, grading, and output
conversion only.
