// The grade — one fullscreen pass that turns a linear HDR frame into THIS
// game's image, and the only place in the project that owns the answer to
// "what era is this".
//
// It is one pass and not five on purpose. The chain hands it a scene-referred
// HDR buffer, and it does the whole of exposure → tone map → definition →
// creative grade → output encode → era artefacts in a single trip through the
// framebuffer, because every extra fullscreen pass is another read and write of
// the entire screen and this game has to run on a phone.
//
// ── WHAT ROUND 3 CHANGED: THE CURVE COULD NOT HOLD BOTH ENDS ────────────────
//
// Measured on the identical HUD-free ground band across five captures of the
// same plaza concrete: rolling down the main line it sat at display L 0.784 with
// 29.9% of the band clipped above 0.92; sitting at the spawn, in the building's
// cast shadow, L 0.089 with 27.8% below 0.08. An 8.8× swing in one material from
// heading alone, and at BOTH ends the high-frequency detail figure was pinned at
// 2/255 — the material had been squeezed out of the picture in opposite
// directions. Whole-frame, one heading put 12.4% above L 0.92 and the other put
// 36.3% below L 0.08 against this file's own written top-end target of 1.1–1.3%.
//
// Two separate causes, both structural rather than a matter of tuning:
//
// 1. **Nothing metered the frame.** A single fixed exposure was serving a scene
//    that genuinely spans raked sun and deep cast shadow. That is now
//    `metering.ts`'s job, and this pass reads the result through `uExposure` the
//    same way it always read the renderer's number. Nothing here compensates for
//    it; the whole point is that this curve now receives a frame that has
//    already been placed.
//
// 2. **Every stage of the old curve had a hard clip in it, at both ends.**
//    · `y = (y0 - lift) / (white - lift)` with `white = 0.86` mapped the entire
//      top 14% of the range onto 1.0 flat. Sunlit concrete does not have detail
//      "compressed" by that, it has no detail at all — and the crosswalk paint,
//      which is the highest-albedo surface on the block, went to paper.
//    · `(y - PIVOT) * contrast + PIVOT` with `PIVOT = 0.45` and `contrast = 1.1`
//      maps everything below 0.069 to a NEGATIVE number, which the clamp then
//      makes zero. That single line is where "36.3% of the frame below L 0.08,
//      23.2% below 0.04" came from: the contrast operator was not darkening the
//      shade, it was deleting it.
//    · `mix(col, sunTarget, sun * 0.42)` from `SUN_START = 0.66` replaced a
//      quarter of the local variation of every sunlit surface with a constant,
//      so the sun band went both brighter AND flatter — the exact recipe for
//      "white paper".
//
//    The curve below has no clip anywhere in it. It is a black point, a shadow
//    gamma, and a contrast that is a POWER about the pivot rather than a line
//    through it. The power form is what buys the whole thing: it is monotone, it
//    lands exactly on 0 at 0 and exactly on 1 at 1, its slope at the pivot is the
//    contrast number, and its slope falls away smoothly toward both ends — which
//    is a filmic toe and a filmic shoulder, arrived at for free rather than
//    bolted on. Nothing can be crushed to black and nothing can be clipped to
//    white, because neither end is reachable by anything except an input that was
//    already there.
//
// ── WHAT ROUND 2 CHANGED, KEPT BECAUSE IT IS STILL LOAD-BEARING ─────────────
//
// · **The split tone is an OFFSET, not a multiply.** `col *= shadeTint` with a
//   1.17 blue was operating on shadows holding B = 0.031; there was no blue down
//   there to scale, so the shadows could not cool and the darks stayed the most
//   saturated orange in the frame. A shade lift ADDS. Gain belongs in the
//   highlights, where every channel has signal to scale.
// · **Contrast runs on LUMINANCE and colour rides it as a ratio.** Per channel
//   the same curve skews hue instead of holding it — it drives the surviving
//   channel up while the other two crush, so every stop of contrast made the
//   darks more orange. On luminance, contrast changes value and nothing else,
//   and what happens to saturation is decided separately, by tonal zone.
//
// ── THE REST OF THE PASS ────────────────────────────────────────────────────
//
// · **Mud.** Two clamped unsharp masks, at one pixel and at two and a half. The
//   tight one is the era's crispness — PS1 is soft and chunky, PS2 is CRISP and
//   chunky. The wide one is round 3's answer to "carries no material": a
//   one-pixel ring cannot see the frequency that concrete aggregate, brick
//   courses and slab staining actually live at on screen, so it was sharpening
//   edges over a surface that stayed blank. Both are clamped to the range their
//   own neighbourhood already spanned, which is what stops an unsharp mask
//   drawing a white halo down every silhouette.
// · **The era**, deliberately, in the two artefacts that are PS2 rather than PS1:
//   a **dithered quantise** (the console's framebuffer, and the fix for banding
//   in the sky gradient in the same line) and a hair of **composite-video
//   fringing** at the frame edges. What is NOT here is as deliberate: no
//   scanlines (that is a CRT filter, and it reads as a gimmick laid over the game
//   rather than as the game), no mosaic filter and no vertex wobble (those are
//   PS1, and they cost the resolution the brief says to keep).
//
//   The **RENDER SCALE** added this round is the other half of the same era and
//   is deliberately NOT in this file, because it is not a filter: the console
//   rendered at about 640x448 and the video hardware scaled that to the display,
//   so the game's answer is an internal resolution and an upscale (`look.ts`,
//   `RENDER_SCALES`) rather than anything drawn on top of a full-resolution
//   frame. The one place the two meet is the quantise on the last line: it is
//   the COLOUR half of the same 2002 framebuffer, it already runs, and it is the
//   reason nothing here posterises further when the scale comes down.
// · **The lens**, which is round 5's one addition to this pass and is four lines
//   (`#ifdef DIRT`): the bloom, masked by the plate `lens-dirt.ts` owns, added
//   back a second time. It is here rather than in a pass of its own for the same
//   reason the shafts are — the add belongs in scene-referred linear next to the
//   bloom, and this pass is already standing there.
//
// Tone mapping is applied HERE and exactly once. `main.ts` sets ACES + exposure
// on the renderer; three then applies that only when a material draws straight
// to the canvas, and under a composer every material draws into a render target
// instead, so those settings go quiet on their own. This pass re-implements the
// same ACES fit and reads the renderer's exposure live — now multiplied by the
// meter's gain — so the graded image and the composer-off fallback agree on tone
// and differ only by the grade. Nothing anywhere sRGB-encodes twice.

import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { dirtCoverScale } from "./lens-dirt";

/**
 * The part of the grade a PRESET is allowed to move — and it is only the stages
 * with a real per-pixel price tag, because that is the only thing a preset is
 * for.
 *
 * Round 2 found the presets diverging on knobs that compile to identical work:
 * the quantise level, the vignette depth and the sharpen AMOUNT all cost exactly
 * the same to compute at any value, so varying them by preset bought no
 * performance and handed phones a different-looking game for free — a harsher
 * quantise and a shallower grade on the one platform the tier system exists to
 * protect. They are constants now.
 *
 * What is left costs fetches. The fringe is two extra texture reads per pixel;
 * the wide definition ring is four reads plus four ACES fits. The cheapest
 * preset pays for neither, and that is the whole of the difference between the
 * rungs' colour — the tone curve, the split, the vibrance, the vignette, the
 * grain and the quantise are byte-identical on all three.
 */
export interface GradeLook {
  /** Composite-video fringing at the frame edge, in UV at the corner. 0 = out. */
  fringe: number;
  /** Wide (2.5 px) local-contrast ring — the "material" pass. 0 = out. */
  definition: number;
  /**
   * Lens dirt — the bloom, multiplied by the plate in `lens-dirt.ts` and added
   * back a second time. A BOOLEAN and not a strength, unlike every other field
   * on this interface, and that is the rule at the top of this comment being
   * obeyed rather than broken: the plate and the gain are the game's look and
   * live in `COLOUR` with the tone curve and the vignette, identical wherever
   * they run. What a preset decides is only whether the block is COMPILED, and
   * the block costs two texture fetches — which is the same price the fringe
   * pays and the same reason the cheapest rung declines it.
   */
  dirt: boolean;
  /**
   * Light shafts — how much of the radial gather is added back. 0 = out, and
   * `out` here means the block is not compiled, so the preset pays nothing.
   */
  shafts: number;
  /**
   * Taps along each shaft, and the whole of what a shaft costs. Compile-time,
   * so a preset that asked for twelve runs a twelve-iteration loop rather than
   * a sixteen-iteration one with four predicated off.
   */
  shaftSamples: number;
}

/**
 * THE GAME'S COLOUR. Identical on every preset and every machine, which is what
 * makes `low` this game with less work done to it rather than a second, greyer
 * game.
 */
const COLOUR = {
  /**
   * Black point. Small and deliberately so: two-and-a-bit codes, enough that the
   * picture has a floor to read depth against, nowhere near enough to be the
   * reason anything is dark. The old 0.028 was being asked to make the frame
   * feel contrasty and it was doing it by removing the bottom of the shade.
   */
  black: 0.008,
  /**
   * Shadow gamma, applied before the contrast. Below 1 it both LIFTS the dark
   * end and STEEPENS it — at display 0.05 the local slope comes out at 1.4, so
   * the brick course and the slab seam in a cast shadow gain amplitude rather
   * than merely getting paler. That distinction is the whole of round 3's
   * "at both ends it carries no material": an offset lift greys a shadow, only
   * slope puts detail back in it.
   */
  shadowGamma: 0.86,
  /**
   * Contrast at the pivot, as a POWER about it rather than a line through it —
   * see the header. Slightly stronger than the old 1.1 because it no longer has
   * to be kept timid to stop the clamps eating the ends.
   */
  contrast: 1.18,
  /** Base saturation. Left at 1: the game's chroma problem was never that it had
   *  too much, it was that all of it sat in one hue at one value. */
  saturation: 1.0,
  /** Extra saturation handed to the pixels that have the least, so near-grey
   *  concrete keeps an identity while the brick does not turn to boiled sweets. */
  vibrance: 0.28,
  /**
   * The shade lift — an OFFSET, and now an entirely POSITIVE one. The old
   * version subtracted 0.028 of red, which on a shadow holding R = 0.06 was a
   * 47% cut and was helping push the shade toward tar; the cool cast is bought
   * instead by lifting blue three times as hard as red. What this guarantees is
   * a FLOOR: the darkest pixel the pass can emit is a blue-grey at L ≈ 0.03
   * rather than a hole, which is what a shadow lit by a golden-hour sky actually
   * looks like and what stops 23% of a frame sitting under L 0.04.
   */
  shadeLift: new THREE.Vector3(0.016, 0.028, 0.06),
  /** What a blown highlight goes to. Not pure white — a hair warm, because the
   *  key is a warm sun and its speculars are its own colour. */
  sunTarget: new THREE.Vector3(1.0, 0.98, 0.935),
  /**
   * How far the top of the range is carried toward that target. A third of
   * round 2's 0.42, and starting two zones later (see SUN_START): a bleach that
   * strong reaching down to L 0.66 was replacing a quarter of the local
   * variation of ordinary sunlit concrete with a constant, and the surface it
   * did the most damage to was the one with the most to lose — the crosswalk
   * paint, the highest-albedo material on the block and the one the camera
   * spends the drop-in staring straight at. It is for the specular and the blown
   * window now, not for every lit surface.
   */
  bleach: 0.15,
  /** Saturation removed at the bottom of the range. */
  shadeDesat: 0.2,
  /** Saturation removed at the top — bright surfaces read as LIGHT, not as paint. */
  sunDesat: 0.1,
  /**
   * Corner falloff, as a fraction of brightness removed at the corner, and it
   * starts later than it did. A vignette is a multiply, so on a frame whose
   * corners are already in shade it takes what little is there — round 3
   * measured 23.2% of the shaded-wall capture below L 0.04 and the corners were
   * a real part of that.
   */
  vignette: 0.17,
  /** Clamped unsharp amount at one pixel — edge crispness. */
  sharpen: 0.55,
  /** Emulsion grain, luminance-weighted. Pure ALU — no texture fetch — so it
   *  costs a phone nothing measurable and does not vary by preset. */
  grain: 0.018,
  /**
   * Output quantisation steps per channel. The console's 16-bit framebuffer mode
   * was 5 bits — 32 steps. 48 was the previous compromise and round 3 caught it
   * from the other side: a 1/48 step is 5.3/255, and the ground material this
   * grade sits on top of measured 2–6/255 of high-frequency amplitude, so the
   * posterise was quantising away the surface it was supposed to be an artefact
   * on. 64 puts the step at 4/255, still a plainly visible console posterise
   * under the ordered dither, but under rather than over the detail it carries.
   */
  levels: 64,
  /**
   * How hard the lens plate is driven, as a multiplier on the bloom it masks —
   * so the unit is "extra copies of the bloom, dirt-shaped".
   *
   * 0.85 sounds enormous for something the brief calls SUBTLE and it is not,
   * because of what it multiplies. The plate is near-black: measured over the
   * generated 1024 plate, the median texel sits at 3/255 and only 1.4% of it is
   * above 64/255, so the frame-average contribution of this term is a few
   * percent of the bloom even before the bloom's own 0.32 strength. What 0.85
   * buys is that the handful of texels that ARE bright — a thumbprint over the
   * sun, a scratch across a lit shopfront — reach about four fifths of the glow
   * they sit on, which is the difference between a lens you can see is dirty
   * when you point it at the light and a plate that is technically present.
   *
   * The reference is a beaten camcorder in a skate video, not a windscreen.
   * Everything that keeps it there is upstream of this number: the plate's own
   * sparse middle third, the fact that it multiplies rather than adds, and the
   * tone map's shoulder, which lands on the sum and cannot let a smear over an
   * already-blown window push past white.
   */
  dirt: 0.85,
} as const;

/**
 * Where bloom should start, expressed the way the grade thinks — as the value a
 * pixel reaches AFTER exposure and just before the ACES fit, so it means the
 * same thing whatever exposure the game is riding.
 *
 * `bloomThreshold()` below returns the knee at the renderer's BASE exposure. The
 * meter's gain divides it per pixel inside the bloom's own high-pass shader —
 * see `attachBloomExposure` in `metering.ts` for why the knee has to ride the
 * exposure at all and why that divide happens on the GPU rather than here.
 *
 * It is declared UP HERE, above the shader source, because the shaft gather
 * interpolates it into that source — the two effects have to agree about where
 * light starts, and a `const` referenced from a template literal has to exist by
 * the time the literal is evaluated.
 */
export const BLOOM_KNEE = 0.86;

const VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
// The meter's 1x1 result. The highp qualifier is not decoration: sampling a
// float texture at mediump is the one iOS trap the adaptive-quality kit calls
// out by name, and a wrong exposure here is the whole picture.
uniform highp sampler2D tExposure;
uniform vec2  uTexel;
uniform float uAspect;
uniform float uExposure;
uniform float uSharpen;
uniform float uDefinition;
uniform float uBlack;
uniform float uShadowGamma;
uniform float uContrast;
uniform float uSaturation;
uniform float uVibrance;
uniform vec3  uShadeLift;
uniform vec3  uSunTarget;
uniform float uBleach;
uniform float uShadeDesat;
uniform float uSunDesat;
uniform float uVignette;
uniform float uGrain;
uniform float uFringe;
uniform float uLevels;
// Where the sun is on screen, in UV, and how much shaft to draw this frame.
// uShafts already carries the off-frame falloff and is exactly 0 the moment the
// sun is behind the camera — look.ts owns both, see aimShafts there.
uniform vec2  uSunUv;
uniform float uShafts;
// The bloom's OWN contribution — the composite it is about to be added to the
// frame with, not the frame — and the plate that masks it. See the #ifdef DIRT
// block in main() and the header of lens-dirt.ts for why this is the only
// form of this effect that is not wrong.
uniform sampler2D tBloom;
uniform sampler2D tDirt;
uniform vec2  uDirtScale;
uniform float uDirt;

varying vec2 vUv;

// Mid-grey the contrast pivots about, in display space. 0.45 and not 0.5: the
// plaza's concrete lands just under half a stop below middle grey at this hour,
// and pivoting on the surface the player actually looks at is what keeps the
// asphalt from crushing to tar when the contrast comes up.
const float PIVOT = 0.45;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Where the shade lift and the highlight bleach hand over. Deliberately far
// apart with a wide gap in the middle: the mids ARE golden hour and are left
// alone. SUN_START sits at 0.84 rather than round 2's 0.66 so that ordinary
// sunlit concrete — which is most of this game — is in that gap and not in the
// bleach, and so is the lit half of a crosswalk stripe.
const float SHADE_END = 0.32;
const float SUN_START = 0.84;
const float SUN_END   = 0.99;

// The exposure actually in force this frame: the renderer's number multiplied
// by the meter's gain. Read ONCE per pixel into a global, because toneMap() is
// called up to nine times per pixel by the two definition rings and a texture
// fetch inside it would be nine fetches of the same texel.
float gExposure;

vec3 rrtAndOdtFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

// three's own ACESFilmic fit, copied rather than referenced: the renderer's
// copy of it is unreachable from a custom shader, and drifting away from it
// would make the post-off fallback a different picture.
vec3 toneMap(vec3 color) {
  const mat3 ACES_IN = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACES_OUT = mat3(
    vec3( 1.60475, -0.10208, -0.00327),
    vec3(-0.53108,  1.10813, -0.07276),
    vec3(-0.07367, -0.00605,  1.07602));
  color *= gExposure / 0.6;
  color = ACES_IN * color;
  color = rrtAndOdtFit(color);
  color = ACES_OUT * color;
  return clamp(color, 0.0, 1.0);
}

// The sRGB OETF, in the same form three uses. This pass is the last thing
// before the canvas and nothing downstream encodes again.
vec3 encode(vec3 c) {
  return mix(
    pow(c, vec3(0.41666)) * 1.055 - vec3(0.055),
    c * 12.92,
    vec3(lessThanEqual(c, vec3(0.0031308)))
  );
}

vec3 mapped(vec2 uv) {
  return toneMap(texture2D(tDiffuse, uv).rgb);
}

// Contrast as a power about the pivot, mirrored above it. THE property that
// matters: 0 maps to 0, 1 maps to 1, the slope at the pivot is exactly k, and
// the slope decays smoothly to zero at both ends. A straight line through a
// pivot has to be clamped and the clamp is a cliff — this has a toe and a
// shoulder built into its own algebra and can neither crush nor clip.
float pivotContrast(float x, float k) {
  return x < PIVOT
    ? PIVOT * pow(x / PIVOT, k)
    : 1.0 - (1.0 - PIVOT) * pow((1.0 - x) / (1.0 - PIVOT), k);
}

// Interleaved-gradient noise. Not fract(sin(dot())) — that hash has visible
// wormy clumps at grain amplitudes and reads as dirt on the lens.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// 4x4 ordered dither, built recursively from the 2x2 so it needs no lookup
// table and no integer ops (this shader is GLSL ES 1.0).
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) {
  return bayer2(a * 0.5) * 0.25 + bayer2(a);
}

#ifdef SHAFTS
// ── LIGHT SHAFTS ───────────────────────────────────────────────────────────
//
// A radial gather back toward the sun's screen position, keeping only what was
// already brighter than the bloom's own knee. It is the 2002 build of this
// effect and that is the point — the era ran it exactly this way, with no
// occlusion buffer and no second draw of the scene, because the OCCLUSION IS
// FREE: a roofline, a lamp standard or a skater standing in front of the sun is
// not bright, so it contributes nothing to the gather and a dark stripe comes
// out the other side of it. Every solid thing in the frame casts its own shaft
// without ever being asked to.
//
// It runs INSIDE this pass rather than as a pass of its own, and that is what
// makes it affordable at all on a build whose mobile preflight is ~870 MB
// against a <700 MB budget: a standalone shaft pass is the textbook build and
// it wants a half-resolution target of its own plus a composite. This wants
// nothing. The buffer it gathers from is the one already bound, the add lands
// on the HDR value before the tone map — which is where a lens effect belongs, next to
// the bloom rather than on the other side of the curve — and the memory cost at
// every tier is zero bytes.
//
// THE KNEE IS BLOOM_KNEE, deliberately the same number, and it rides the
// meter's gain the same way (see bloomThreshold in this file). Two effects that both mean
// "this pixel is a light source" disagreeing about where light starts is how a
// frame ends up with a glow around a window that throws no shaft, and it would
// have been a second constant to keep in step with the exposure by hand.
//
// SAMPLING. SHAFT_DENSITY is how far back along the ray the walk reaches, as
// a fraction of the distance to the sun; the weight decays geometrically so the
// near end of a shaft is bright and the far end fades rather than ending on a
// hard edge. The start point is jittered by the same IGN the grain and the
// shutter use, because twelve taps spread over a third of the screen are
// visible as concentric rings otherwise — the jitter turns those rings into a
// dither the quantise on the last line then swallows.
const float SHAFT_DENSITY = 0.62;
const float SHAFT_DECAY = 0.94;

vec3 shafts(vec2 uv) {
  // The one runtime branch in this pass, and it is here because it is FREE: a
  // test on a uniform takes the same side on every pixel of the draw, so there
  // is no divergence to pay for and the whole loop is skipped rather than run
  // and multiplied by zero. It earns its keep because the condition is true for
  // a large fraction of the game — every heading with the sun behind the
  // camera, which on a plaza you ride in circles is about half of them — and
  // skipping it there gives those frames the fetch cost of a preset with no
  // shafts compiled in at all.
  if (uShafts <= 0.0) return vec3(0.0);

  vec2 delta = (uv - uSunUv) * (SHAFT_DENSITY / float(SHAFT_SAMPLES));
  vec2 p = uv - delta * ign(gl_FragCoord.xy);
  // The bloom's knee, in scene-linear, at the exposure actually in force. Under
  // it there is no light source here and the gather contributes nothing.
  float knee = ${BLOOM_KNEE.toFixed(2)} * 0.6 / gExposure;
  vec3 sum = vec3(0.0);
  float weight = 1.0;
  for (int i = 0; i < SHAFT_SAMPLES; i++) {
    p -= delta;
    // Clamped in the shader rather than left to the sampler, which today would
    // give the same answer — a composer target is clamp-to-edge — and which is
    // the point: the walk very often leaves the frame, because a shaft's whole
    // job is to point AT a sun that is usually just outside it. Two ALU ops a
    // tap buys independence from a wrap mode this file does not own; on a target
    // that ever came back as REPEAT the same walk would fold the top of the sky
    // onto the bottom of the plaza.
    vec3 s = texture2D(tDiffuse, clamp(p, 0.0, 1.0)).rgb;
    sum += max(s - knee, 0.0) * weight;
    weight *= SHAFT_DECAY;
  }
  return sum * (uShafts / float(SHAFT_SAMPLES));
}
#endif

void main() {
  gExposure = uExposure * max(texture2D(tExposure, vec2(0.5)).r, 1e-3);

  vec2 dir = vUv - 0.5;

  #ifdef FRINGE
    // Red pulled out, blue pulled in, scaled by r² so the centre of the frame —
    // where the skater is — stays perfectly registered and only the edges
    // fringe. That is where a composite signal actually falls apart.
    vec2 pull = dir * dot(dir, dir) * uFringe;
    vec3 hdr = vec3(
      texture2D(tDiffuse, vUv + pull).r,
      texture2D(tDiffuse, vUv).g,
      texture2D(tDiffuse, vUv - pull).b
    );
  #else
    vec3 hdr = texture2D(tDiffuse, vUv).rgb;
  #endif

  #ifdef SHAFTS
    // Added in SCENE-REFERRED LINEAR, above the tone map, for the same reason
    // the bloom sits where it does: a shaft is light arriving at the lens, so it
    // has to be summed with the rest of the light in the frame and then have the
    // one curve applied to the total. Added after the curve it would be paint.
    // Adding it here also means the shoulder handles it for free — a shaft
    // crossing an already-blown sky cannot push anything past white.
    hdr += shafts(vUv);
  #endif

  #ifdef DIRT
    // ── LENS DIRT ─────────────────────────────────────────────────────────
    //
    // The bloom is already IN hdr — the bloom pass blended it onto this
    // buffer before the grade ever ran. What this adds is a SECOND copy of the
    // same glow, shaped by the plate: light that hit the specks and the smears
    // on the front element and scattered instead of converging.
    //
    // tBloom is the bloom's composite target rather than the frame, and that
    // is the entire effect. Multiply the FRAME by a plate and you get grime you
    // can see on a dark shot — a texture stuck to the monitor. Multiply the
    // BLOOM by it and the dirt is made of the light in the scene: nothing
    // bright in frame, nothing on the lens. Riding into the west block's shadow
    // takes it away by itself, and swinging west into the 22° key is where it
    // is loudest, with no rule anywhere saying so.
    //
    // In scene-referred linear and above the tone map, next to the shafts and
    // for the same reason: it is light arriving at the lens, so it is summed
    // with the rest of the light and the one curve is applied to the total. The
    // shoulder then handles a smear over a blown window for free.
    //
    // uDirtScale is the cover fit — see dirtCoverScale in lens-dirt.ts.
    // A stretched 16:9 plate on a phone in portrait turns every speck into a
    // vertical streak, which is the one artefact that would give it away as a
    // texture rather than as glass.
    hdr += texture2D(tBloom, vUv).rgb
         * texture2D(tDirt, (vUv - 0.5) * uDirtScale + 0.5).rgb
         * uDirt;
  #endif

  vec3 c = toneMap(hdr);

  #ifdef SHARPEN
    // Clamped unsharp mask: sharpen against the four-neighbour mean, then hold
    // the result inside the range the neighbourhood already spanned. The clamp
    // is the whole trick — an unclamped mask draws a white halo down every
    // silhouette, which is exactly the "over-processed" look this must avoid.
    // Tone-mapped taps, not raw HDR ones: sharpening a linear buffer amplifies
    // the brightest pixel in the neighbourhood into a firefly.
    vec3 n0 = mapped(vUv + vec2(uTexel.x, 0.0));
    vec3 n1 = mapped(vUv - vec2(uTexel.x, 0.0));
    vec3 n2 = mapped(vUv + vec2(0.0, uTexel.y));
    vec3 n3 = mapped(vUv - vec2(0.0, uTexel.y));
    vec3 ring = (n0 + n1 + n2 + n3) * 0.25;
    vec3 lo = min(min(n0, n1), min(n2, n3));
    vec3 hi = max(max(n0, n1), max(n2, n3));
    c = clamp(c + (c - ring) * uSharpen, min(lo, c), max(hi, c));
  #endif

  #ifdef DEFINITION
    // The material ring. Diagonals at 2.5 px, so it samples a genuinely
    // different neighbourhood from the one above rather than a slightly bigger
    // version of it, and so four taps cover a square rather than a cross.
    //
    // This is the stage that answers "the ground carries no material". Aggregate
    // in concrete, courses in brick and staining on a slab land at three to six
    // screen pixels at the distance the chase camera holds them — a one-pixel
    // unsharp is blind to all of it and spends its whole budget on the silhouette
    // edges, which is why the measured detail figure stayed pinned at 2/255 on a
    // surface that has texture on it.
    vec2 wide = uTexel * 2.5;
    vec3 m0 = mapped(vUv + vec2( wide.x,  wide.y));
    vec3 m1 = mapped(vUv + vec2(-wide.x,  wide.y));
    vec3 m2 = mapped(vUv + vec2( wide.x, -wide.y));
    vec3 m3 = mapped(vUv + vec2(-wide.x, -wide.y));
    vec3 wring = (m0 + m1 + m2 + m3) * 0.25;
    vec3 wlo = min(min(m0, m1), min(m2, m3));
    vec3 whi = max(max(m0, m1), max(m2, m3));
    c = clamp(c + (c - wring) * uDefinition, min(wlo, c), max(whi, c));
  #endif

  // Display-referred from here down. Contrast, saturation and grain are all
  // perceptual operations and they only behave the way a colourist expects on
  // the other side of the transfer function.
  vec3 col = encode(c);

  // ── 1. THE TONE CURVE, ON LUMINANCE ────────────────────────────────────────
  // Black point, shadow gamma and contrast all run on a single luminance value,
  // and the colour rides the result as a RATIO. Per-channel this same curve
  // skews hue — it drives the surviving channel up while the other two crush,
  // which is precisely how an earlier grade turned its own shadows into the most
  // saturated orange in the frame. Here it changes value and nothing else; what
  // happens to saturation is decided further down, deliberately, by tonal zone.
  //
  // There is no clamp inside the curve and there is nowhere one is needed: every
  // stage is monotone on [0,1] and lands on [0,1]. The clamp on the last line is
  // the shoulder doing real work on COLOUR rather than on value — a ratio that
  // carries one channel past 1.0 clips it while the others keep climbing, so a
  // surface hot enough to blow desaturates toward white, which is what a
  // specular looks like and the only mechanism in this pass that makes one.
  float y0 = max(dot(col, LUMA), 1e-4);
  float y = clamp((y0 - uBlack) / max(1.0 - uBlack, 1e-3), 0.0, 1.0);
  y = pow(y, uShadowGamma);
  y = pivotContrast(y, uContrast);
  col = clamp(col * (y / y0), 0.0, 1.0);

  // ── 2. VIGNETTE ───────────────────────────────────────────────────────────
  // Applied here rather than at the end, because a vignette physically IS a
  // falloff in exposure — putting it above the zone work below means a darkened
  // corner gets the same cool shade treatment as any other shadow instead of
  // staying a warm smudge. Aspect-corrected so a phone in portrait and a monitor
  // in landscape lose the same amount at the corner.
  vec2 q = dir * vec2(uAspect, 1.0);
  float r = length(q) / length(vec2(uAspect, 1.0) * 0.5);
  col *= 1.0 - uVignette * smoothstep(0.45, 1.0, r);

  // ── 3. THE SPLIT — AN OFFSET IN THE SHADOWS, A BLEACH IN THE HIGHLIGHTS ────
  // The one operation that separates shadowed concrete from lit concrete as a
  // COLOUR and not just as a level. Shade goes cool by ADDING blue (a multiply
  // has nothing to work on down there — see the header); the sunlit top of the
  // range is carried toward a warm white so a lit surface reads as light rather
  // than as more of the same paint. The lift is also this pass's floor: it is
  // what the darkest pixel in the game is made of.
  float luma = dot(col, LUMA);
  float shade = 1.0 - smoothstep(0.0, SHADE_END, luma);
  float sun = smoothstep(SUN_START, SUN_END, luma);
  col = clamp(col + uShadeLift * shade, 0.0, 1.0);
  col = mix(col, uSunTarget, sun * uBleach);

  // ── 4. SATURATION, WEIGHTED BY ZONE ───────────────────────────────────────
  // Vibrance, not saturation: the boost is scaled by how little chroma a pixel
  // already has, so the near-grey plaza gains and the brick wall does not turn
  // to boiled sweets. On top of that both ends of the range give chroma back —
  // deep shade toward neutral (a shadow is fill light, and fill light is weak
  // and colourless), the sun band toward white — which is what stops the whole
  // frame sitting inside one hue window.
  float chroma = max(max(col.r, col.g), col.b) - min(min(col.r, col.g), col.b);
  float amount = uSaturation + uVibrance * (1.0 - chroma)
               - uShadeDesat * shade - uSunDesat * sun;
  col = clamp(mix(vec3(dot(col, LUMA)), col, max(amount, 0.0)), 0.0, 1.0);

  #ifdef GRAIN
    // Static (no time term — a per-frame reseed shimmers on every still
    // surface), one sample per DEVICE pixel via gl_FragCoord so it is fine and
    // square at any DPR, and weighted to the mids so it never dirties the
    // blacks or eats the speculars.
    float glum = dot(col, LUMA);
    col += (ign(gl_FragCoord.xy) - 0.5) * uGrain * (1.0 - abs(2.0 * glum - 1.0));
  #endif

  // The era artefact, and the banding fix, in one line: quantise the output the
  // way the console's framebuffer did, with an ordered dither carrying the error
  // so a sky gradient stays a gradient instead of becoming stripes.
  col = floor(clamp(col, 0.0, 1.0) * uLevels + 0.5 + (bayer4(gl_FragCoord.xy) - 0.5)) / uLevels;

  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Build the pass. The optional stages are compile-time `#define`s and not
 * runtime branches: a preset that has switched the fringe off does not pay a
 * per-pixel test for it, it pays nothing at all.
 */
export function createGradePass(look: GradeLook): ShaderPass {
  const defines: Record<string, string> = {};
  // The tight ring and the grain are the game's colour and are on everywhere —
  // they are `#define`s rather than uniforms so that a future preset CAN compile
  // them out, and so the shader reads as the list of stages it actually runs.
  if (COLOUR.sharpen > 0) defines.SHARPEN = "1";
  if (COLOUR.grain > 0) defines.GRAIN = "1";
  if (look.fringe > 0) defines.FRINGE = "1";
  if (look.definition > 0) defines.DEFINITION = "1";
  if (look.dirt) defines.DIRT = "1";
  if (look.shafts > 0 && look.shaftSamples >= 2) {
    defines.SHAFTS = "1";
    defines.SHAFT_SAMPLES = String(Math.round(look.shaftSamples));
  }

  return new ShaderPass({
    name: "PS2Grade",
    defines,
    uniforms: {
      tDiffuse: { value: null },
      // Filled in by the look stack from the meter. Never null in practice, and
      // deliberately not defaulted to a white 1x1: a grade running without the
      // meter is a bug to see, not one to paper over.
      tExposure: { value: null },
      uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 800) },
      uAspect: { value: 1.6 },
      uExposure: { value: 1 },
      uFringe: { value: look.fringe },
      uDefinition: { value: look.definition },
      // Both driven per frame by `updateGradeSun`. The strength starts at 0 so
      // the very first frame of a session — before anything has told this pass
      // where the sun is — draws no shaft rather than one aimed at the corner.
      uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
      uShafts: { value: 0 },
      // The bloom's composite target and the plate, both wired ONCE at chain
      // build — see `look.ts`. Left null on a preset with no DIRT define, where
      // the sampler does not exist in the compiled program at all.
      tBloom: { value: null },
      tDirt: { value: null },
      uDirtScale: { value: new THREE.Vector2(1, 1) },
      // The gain, not a preset knob: the plate and how hard it is driven are
      // the game's look, the same way the vignette and the tone curve are. What
      // varies is only whether the block above was compiled. Runtime 0 is the
      // player's switch (`setGradeDirt`) and costs the two fetches it saves
      // nothing on — which is why the switch is a uniform and the preset is a
      // define.
      uDirt: { value: look.dirt ? COLOUR.dirt : 0 },

      // --- the game's colour: identical on every preset, by design -----------
      uSharpen: { value: COLOUR.sharpen },
      uGrain: { value: COLOUR.grain },
      uVignette: { value: COLOUR.vignette },
      uLevels: { value: COLOUR.levels },
      uBlack: { value: COLOUR.black },
      uShadowGamma: { value: COLOUR.shadowGamma },
      uContrast: { value: COLOUR.contrast },
      uSaturation: { value: COLOUR.saturation },
      uVibrance: { value: COLOUR.vibrance },
      uShadeLift: { value: COLOUR.shadeLift.clone() },
      uSunTarget: { value: COLOUR.sunTarget.clone() },
      uBleach: { value: COLOUR.bleach },
      uShadeDesat: { value: COLOUR.shadeDesat },
      uSunDesat: { value: COLOUR.sunDesat },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}

/**
 * Per-frame housekeeping. Exposure is READ from the renderer each frame rather
 * than copied once, so the one number `main.ts` set stays the anchor — and if
 * the game ever rides it (a flash, a bail, dusk) this follows for free. The
 * meter's gain is NOT applied here: it never leaves the GPU, and the shader
 * multiplies by it per pixel out of `tExposure`.
 */
export function updateGradeFrame(
  pass: ShaderPass,
  exposure: number,
  width: number,
  height: number,
): void {
  pass.uniforms.uExposure.value = exposure;
  // The size of the buffer this pass SAMPLES, which since the render-scale
  // experiment landed is not the size of the canvas it draws to. Both sharpen
  // rings step in texels of `tDiffuse`, so at 0.55 scale a one-pixel ring is a
  // one-pixel ring of the internal frame — which is the correct answer twice
  // over: it keeps the crispness constant in the image rather than in the
  // display, and it stops the rings trying to resolve detail the reduced buffer
  // does not contain.
  (pass.uniforms.uTexel.value as THREE.Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
  const aspect = width / Math.max(1, height);
  pass.uniforms.uAspect.value = aspect;
  // The plate's cover fit rides the aspect, so it follows a window drag and a
  // phone rotating without anything else being told. Free on the presets that
  // did not compile the block — the uniform is simply never read.
  dirtCoverScale(aspect, pass.uniforms.uDirtScale.value as THREE.Vector2);
}

/**
 * The lens dirt's runtime switch — the player's, not a preset's.
 *
 * It scales the gain rather than rebuilding the pass, so flipping it is free
 * and instant. What it cannot do is turn the effect ON where the preset never
 * compiled the block: `low` has no `DIRT` define, no samplers and no fetches,
 * and that is the point of it being a define. Same shape as the shafts, which
 * `look.ts` also guards on the preset's own strength rather than running and
 * multiplying by zero.
 */
export function setGradeDirt(pass: ShaderPass, on: boolean): void {
  pass.uniforms.uDirt.value = on ? COLOUR.dirt : 0;
}

/**
 * The scene-linear threshold that puts `BLOOM_KNEE` at the given exposure.
 *
 * `knee` is an override and defaults to the shipped constant — it exists only
 * so the tuning panel can move where bloom starts without fighting `render()`,
 * which recomputes this every frame off the live exposure. TEMPORARY; it goes
 * back to a no-argument function when the panel does.
 */
export function bloomThreshold(exposure: number, knee: number = BLOOM_KNEE): number {
  return (knee * 0.6) / Math.max(exposure, 1e-3);
}

/**
 * Aim the shafts. Called every frame by `look.ts`, which owns the projection of
 * the key light onto the screen and the whole of the falloff — this pass is
 * handed a UV and a strength and asks no questions about either.
 *
 * Separate from `updateGradeFrame` on purpose: that one is housekeeping every
 * preset needs, this one is a stage two of the three do not compile at all, and
 * folding them together would have the cheapest rung computing a sun position
 * for a shader with no `uSunUv` in it.
 */
export function updateGradeSun(pass: ShaderPass, u: number, v: number, strength: number): void {
  (pass.uniforms.uSunUv.value as THREE.Vector2).set(u, v);
  pass.uniforms.uShafts.value = strength;
}
