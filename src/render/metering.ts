// The meter — the only thing in the chain that LOOKS at the frame before it
// grades it.
//
// WHY THIS FILE EXISTS. Round 3 measured the same plaza concrete at display
// L 0.784 rolling down the main line (29.9% of that band clipped above 0.92)
// and L 0.089 sitting at the spawn (27.8% below 0.08) — an 8.8x swing in one
// material from HEADING alone. Nothing was wrong with either number: the spawn
// corner is in the building's cast shadow and the main line is in raked sun, so
// the SCENE really does span that. What was wrong is that a fixed exposure of
// 1.12 and a grade tuned against one remembered frame were being asked to serve
// both, and a fixed exposure serves whichever end it was tuned for and throws
// the other away. Facing one way the game was white paper, facing the other it
// was tar, and neither end carried material.
//
// A camera solves this by metering. So does an eye. This is that stage, and it
// is the piece the stack was missing: HDR scene -> **luminance meter -> adapted
// exposure** -> tone map -> grade -> output.
//
// ── THE FOUR LOOK DECISIONS ─────────────────────────────────────────────────
//
// 1. **Log-average, not average.** The mean of a frame containing a sun is the
//    sun. The geometric mean (an arithmetic mean of log2 luminance) is what
//    photographers and every game auto-exposure use, because a handful of blown
//    pixels move it by a fraction of a stop instead of by three.
//
// 2. **Ground-weighted, not centre-weighted and not whole-frame.** This is a
//    chase camera that holds the concrete under the skater in the lower half of
//    the screen at all times, and the concrete is the thing that was blowing and
//    crushing. A gaussian centred just below the middle of the frame, with a
//    floor so the sky still counts for something, makes the exposure follow the
//    surface the player is actually riding rather than how much sky happens to
//    be in shot. Whole-frame metering would have handed the sky the vote.
//
// 3. **PARTIAL adaptation.** `gain = (KEY / measured) ^ 0.7`, not `KEY /
//    measured`. Full adaptation makes every corner of the block render at the
//    same brightness, which is its own kind of flat — riding out of a shadowed
//    alley into raked sun has to FEEL like something. The block's metered range
//    end to end is about 6x (0.05 to 0.30 scene-linear, measured); at 0.7 that
//    opens 3.5x and leaves a residual 1.9x, which reads as a stop of difference
//    between the shaded and the sunlit half of the map instead of the 8.8x that
//    was blowing one end and tarring the other.
//
// 4. **Asymmetric time constants**, which is both what an eye does and what the
//    grading skill's failure list calls out by name: stopping DOWN when the sun
//    arrives is quick (0.35 s) because a blown frame is unreadable, opening UP
//    into shade is slow (1.1 s) because a pumping exposure on every doorway is
//    the most obvious auto-exposure artefact there is.
//
// ── WHY IT NEVER LEAVES THE GPU ─────────────────────────────────────────────
//
// The obvious build for this is a reduction to 1x1, a `readRenderTargetPixels`
// to get the number onto the CPU, and the adaptation in JavaScript. That build
// was written first and measured, and it is a trap. Even through
// `readRenderTargetPixelsAsync` — pixel-pack buffer, fence, no busy wait — the
// `getBufferSubData` that finally moves four bytes is a synchronous round trip
// to Chrome's GPU process, and it arrives whenever that process is free. At
// 3840x2160 the measured result was a 90 ms hitch every four or five frames:
// mean frame time barely moved (23.8 ms against 24.2 with no meter at all), but
// the pacing was destroyed — a run of 8 ms frames, then a stall, forever.
//
// So nothing crosses back. The reduction ends in a 1x1 half-float target, the
// smoothing runs as a fourth 1x1 draw against a copy of the previous frame's
// value, and the consumers SAMPLE that texel: the grade multiplies its exposure
// by it, and the bloom's high-pass divides its knee by it (see
// `attachBloomExposure`). The CPU never learns the number and never needs to.
//
// ── WHAT IT COSTS ───────────────────────────────────────────────────────────
//
// Five draws — 64² at 16 taps, 8² at 64 taps, and three single pixels — about
// 70k texture fetches, against roughly a million for one fullscreen pass at
// 1280x800. It is on at every preset for that reason: it is a rounding error
// against the bloom, and it is the difference between the game having an image
// and having two.

import * as THREE from "three";
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Side of the first reduction. Divides by 8 twice, so 64 -> 8 -> 1. */
const COARSE = 64;
const MID = 8;

/**
 * The scene-linear log-average this game is exposed FOR — the number the gain
 * comes out at 1.0 for. Calibrated by capture against the golden-hour block:
 * the main line in raked sun meters well above it and stops down, the shadowed
 * spawn corner meters below it and opens up, and the plaza's own mid-lit
 * stretches sit near it and are left alone.
 */
const KEY = 0.093;

/** See decision 3 in the header. 1.0 = a flat, evenly-lit game. */
const ADAPT_STRENGTH = 0.7;

/**
 * How far the meter is allowed to move the picture. These are not safety rails
 * for a broken measurement — they are the artistic floor and ceiling. Past them
 * the game stops being golden hour and starts being a light meter's opinion.
 */
const GAIN_MIN = 0.38;
const GAIN_MAX = 1.9;

/** Seconds to cover ~63% of the distance. Down fast, up slow — decision 4. */
const TAU_DOWN = 0.35;
const TAU_UP = 1.1;

/**
 * Where the meter looks. `(0.5, 0.4)` in UV with v counted from the BOTTOM, so
 * this sits just below the middle of the screen — under the skater, on the
 * concrete. The spread is deliberately wider across than down: a street runs
 * left to right through the frame and a sky sits above it.
 */
const WEIGHT_CENTRE = new THREE.Vector2(0.5, 0.4);
const WEIGHT_SPREAD = new THREE.Vector2(0.58, 0.42);
/** What a pixel at the very edge of the weight still counts for. Not zero: a
 *  frame that is nine-tenths sunlit wall should still stop the camera down. */
const WEIGHT_FLOOR = 0.16;

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Reduction 1 — full frame to 64x64, in log space, already weighted.
 *
 * Each output texel owns 1/64 of the screen in each axis and takes a 4x4 grid of
 * bilinear taps inside it, so it sees 64 source pixels of the ~250 it covers at
 * 1280x800. The offsets are in OUTPUT-texel units, which is what makes the whole
 * meter resolution-independent: nothing here has to be told the window size, and
 * nothing has to be rebuilt when the governor changes the pixel ratio.
 *
 * It writes `(weight * log2 luminance, weight)`. Carrying the weight as its own
 * channel is what lets the reductions downstream stay plain unweighted averages
 * and still produce a correctly weighted mean at the end — the last stage just
 * divides the two sums. The target is half-float, so the log stays a signed
 * number and needs no packing.
 */
const COARSE_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tSource;
uniform vec2 uCentre;
uniform vec2 uSpread;
uniform float uFloor;
varying vec2 vUv;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main() {
  const float cell = 1.0 / ${COARSE.toFixed(1)};
  float acc = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      vec2 o = ((vec2(float(x), float(y)) + 0.5) * 0.25 - 0.5) * cell;
      vec3 c = texture2D(tSource, vUv + o).rgb;
      // A hard floor and not a smooth one: a genuinely black pixel carries no
      // exposure information, and 2^-16 is far enough below anything this scene
      // contains that clamping there cannot drag the mean.
      acc += log2(max(dot(c, LUMA), 1.5e-5));
    }
  }

  vec2 d = (vUv - uCentre) / uSpread;
  float w = mix(uFloor, 1.0, exp(-dot(d, d)));

  gl_FragColor = vec4(acc / 16.0 * w, w, 0.0, 1.0);
}
`;

/** Reduction 2 — a plain 8x8 box over both channels. 64x64 -> 8x8. */
const BOX_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tSource;
uniform vec2 uStep;
varying vec2 vUv;

void main() {
  vec2 acc = vec2(0.0);
  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 8; x++) {
      acc += texture2D(tSource, vUv + (vec2(float(x), float(y)) - 3.5) * uStep).rg;
    }
  }
  gl_FragColor = vec4(acc / 64.0, 0.0, 1.0);
}
`;

/**
 * Reduction 3 and the adaptation, in one single-pixel draw: finish the 8x8 box,
 * divide out the weight, turn the log-average into the gain this frame WANTS,
 * and then move only part of the way there from where the gain WAS.
 *
 * `uSnap` is the first-frames case. A freshly allocated render target contains
 * whatever the driver left in it, so for the first two frames the history is
 * ignored outright and the gain is taken whole — otherwise every session opens
 * with a visible exposure slide from the loader's near-black frame, or worse,
 * from a NaN. The `prev` guard below catches the same thing a second way:
 * a comparison against NaN is false, so garbage falls through to `wanted`.
 */
const ADAPT_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tMid;
uniform sampler2D tPrev;
uniform float uDelta;
uniform float uKey;
uniform float uStrength;
uniform float uMin;
uniform float uMax;
uniform float uTauDown;
uniform float uTauUp;
uniform float uSnap;

void main() {
  vec2 acc = vec2(0.0);
  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 8; x++) {
      acc += texture2D(tMid, (vec2(float(x), float(y)) + 0.5) / ${MID.toFixed(1)}).rg;
    }
  }
  float measured = exp2(acc.x / max(acc.y, 1e-4));
  float wanted = clamp(pow(uKey / max(measured, 1e-5), uStrength), uMin, uMax);

  float prev = texture2D(tPrev, vec2(0.5)).r;
  prev = (prev > 0.0 && prev < 1000.0) ? prev : wanted;

  float tau = wanted < prev ? uTauDown : uTauUp;
  float k = 1.0 - exp(-uDelta / tau);
  float next = uSnap > 0.5 ? wanted : prev + (wanted - prev) * k;

  gl_FragColor = vec4(next, 0.0, 0.0, 1.0);
}
`;

/**
 * The history copy. It exists so the texture the grade and the bloom sample is
 * a FIXED object: a ping-pong would have the gain living in a different target
 * on alternate frames and every consumer would have to be re-pointed each
 * frame. One extra single-pixel draw buys a stable `meter.texture` instead.
 */
const COPY_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tSource;
void main() {
  gl_FragColor = vec4(texture2D(tSource, vec2(0.5)).r, 0.0, 0.0, 1.0);
}
`;

export interface ExposureMeter {
  /**
   * The composer pass that does the measuring. Goes straight after `RenderPass`
   * and before anything that darkens or brightens the frame — an AO pass is a
   * local darkening of the scene and metering downstream of it would have the
   * camera stop UP because a corner is occluded.
   */
  readonly pass: Pass;
  /**
   * A 1x1 texture whose red channel is the exposure multiplier in force. Stable
   * for the life of the meter: assign it once, sample it every frame.
   */
  readonly texture: THREE.Texture;
  /**
   * TEMPORARY — the tuning panel's handle on the adaptation. `uKey`,
   * `uStrength`, `uMin`, `uMax`, `uTauDown` and `uTauUp` are the six numbers
   * this file's header argues about, and the panel exists so the player can
   * argue back with the game running. Delete with `src/ui/look-lab.ts`.
   */
  readonly uniforms: Record<string, THREE.IUniform>;
  dispose(): void;
}

function makeTarget(size: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  target.texture.name = `meter:${size}`;
  return target;
}

export function createExposureMeter(): ExposureMeter {
  const coarse = makeTarget(COARSE);
  const mid = makeTarget(MID);
  const gain = makeTarget(1);
  const history = makeTarget(1);

  const coarseMat = new THREE.ShaderMaterial({
    name: "MeterCoarse",
    uniforms: {
      tSource: { value: null },
      uCentre: { value: WEIGHT_CENTRE.clone() },
      uSpread: { value: WEIGHT_SPREAD.clone() },
      uFloor: { value: WEIGHT_FLOOR },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: COARSE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const boxMat = new THREE.ShaderMaterial({
    name: "MeterBox",
    uniforms: {
      tSource: { value: coarse.texture },
      uStep: { value: new THREE.Vector2(1 / COARSE, 1 / COARSE) },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: BOX_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const adaptMat = new THREE.ShaderMaterial({
    name: "MeterAdapt",
    uniforms: {
      tMid: { value: mid.texture },
      tPrev: { value: history.texture },
      uDelta: { value: 1 / 60 },
      uKey: { value: KEY },
      uStrength: { value: ADAPT_STRENGTH },
      uMin: { value: GAIN_MIN },
      uMax: { value: GAIN_MAX },
      uTauDown: { value: TAU_DOWN },
      uTauUp: { value: TAU_UP },
      uSnap: { value: 1 },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: ADAPT_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const copyMat = new THREE.ShaderMaterial({
    name: "MeterCopy",
    uniforms: { tSource: { value: gain.texture } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: COPY_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });

  const coarseQuad = new FullScreenQuad(coarseMat);
  const boxQuad = new FullScreenQuad(boxMat);
  const adaptQuad = new FullScreenQuad(adaptMat);
  const copyQuad = new FullScreenQuad(copyMat);

  let frames = 0;

  const pass = new Pass();
  pass.needsSwap = false;
  pass.render = (
    r: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
  ): void => {
    const previousTarget = r.getRenderTarget();
    coarseMat.uniforms.tSource!.value = readBuffer.texture;
    // Clamped rather than trusted: a tab that was backgrounded for a minute
    // hands the loop one enormous delta, and an adaptation that consumed it
    // would snap the exposure on the first frame back.
    adaptMat.uniforms.uDelta!.value = Math.min(Math.max(deltaTime, 0), 0.1);
    adaptMat.uniforms.uSnap!.value = frames < 2 ? 1 : 0;
    frames++;

    r.setRenderTarget(coarse);
    coarseQuad.render(r);
    r.setRenderTarget(mid);
    boxQuad.render(r);
    r.setRenderTarget(gain);
    adaptQuad.render(r);
    r.setRenderTarget(history);
    copyQuad.render(r);

    // Hand the composer back exactly the target it had. Passes downstream set
    // their own, but a pass that quietly changes global renderer state is how
    // post chains grow bugs that only show up when someone reorders them.
    r.setRenderTarget(previousTarget);
  };
  pass.setSize = (): void => {
    // Nothing to do: every offset in the reduction shaders is in output-texel
    // units, so the whole meter is resolution-independent by construction.
  };
  pass.dispose = (): void => {
    // The meter outlives any one composer chain — see `look.ts`. Its lifetime
    // is the ExposureMeter handle's `dispose`, not the chain's.
  };

  return {
    pass,
    texture: gain.texture,
    // TEMPORARY — see the interface.
    uniforms: adaptMat.uniforms,
    dispose() {
      coarseQuad.dispose();
      boxQuad.dispose();
      adaptQuad.dispose();
      copyQuad.dispose();
      coarseMat.dispose();
      boxMat.dispose();
      adaptMat.dispose();
      copyMat.dispose();
      coarse.dispose();
      mid.dispose();
      gain.dispose();
      history.dispose();
    },
  };
}

/**
 * Teach `UnrealBloomPass` to read the meter, because the bloom knee is the one
 * consumer of the exposure that does NOT live in a shader this project wrote.
 *
 * Why it has to know at all: the knee is a scene-linear number, and a fixed one
 * means bloom is a sun-facing-only effect — the exact accident round 3 caught
 * the grade in. In the shaded half of the block the camera opens up 1.9x, and
 * the knee has to come down with it or the lit windows and the sun off a rail
 * stop glowing the moment the skater turns around; on the main line it has to
 * come back up or a low knee lays a soft warm haze over the whole sunlit plaza,
 * which is precisely the "muddy" the brief exists to get rid of.
 *
 * The pass sets `luminosityThreshold` from its own `threshold` property every
 * frame, so there is no uniform left to ride. What there is is one line of its
 * high-pass shader, replaced here before the material has ever compiled, so the
 * divide happens per pixel on the GPU where the gain lives. The replacement is
 * guarded on finding the line it means to replace: against a three that has
 * rewritten it, the patch declines and the knee stays the fixed one, which is a
 * duller bloom and not a broken one.
 */
export function attachBloomExposure(bloom: UnrealBloomPass, exposure: THREE.Texture): void {
  const uniforms = bloom.highPassUniforms as Record<string, { value: unknown }>;
  if (uniforms.tExposure) {
    uniforms.tExposure.value = exposure;
    return;
  }

  const material = bloom.materialHighPassFilter as THREE.ShaderMaterial;
  const marker =
    "float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );";
  if (!material.fragmentShader.includes(marker)) return;

  uniforms.tExposure = { value: exposure };
  material.fragmentShader =
    "uniform highp sampler2D tExposure;\n" +
    material.fragmentShader.replace(
      marker,
      "float knee = luminosityThreshold / max( texture2D( tExposure, vec2( 0.5 ) ).r, 1e-3 );\n" +
        "float alpha = smoothstep( knee, knee + smoothWidth, v );",
    );
}
