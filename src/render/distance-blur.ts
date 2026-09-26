// Distance blur — the far end of the block goes soft and the near end does not.
//
// ── THE ONE HARD CONSTRAINT, AND WHY IT IS STRUCTURAL RATHER THAN TUNED ─────
//
// **It must never touch the skater.** He is the thing the player is steering,
// he is in the middle of every frame, and a defocus that catches him is not a
// subtle effect that needs turning down — it is the effect being wrong.
//
// The chase camera holds him at 4.5 m of boom at a standstill, stretching to
// about 7.5 m at 60 km/h as the pivot lags (`skate-camera.ts`, (d)), and the
// boom SHORTENS when it hits world geometry — its floor is 1.2 m, which is the
// shot you get riding into a corner. So the number this effect has to clear is
// not 4.5: it is the whole band 1.2 m to 7.5 m, at every speed and every angle.
//
// The blur is therefore not keyed on a distance this file picked. It is keyed
// on THE MAP'S OWN FOG CURVE, `scene.fog`, read live every frame:
//
//   fogFactor = smoothstep(fog.near, fog.far, viewDepth)
//
// which is character-for-character the expression three's own `fog_fragment`
// chunk runs in every material in the game. On the street that curve starts at
// 14 m (`field.ts`) — 6.5 m past the longest boom the camera can reach and
// nearly twelve times the shortest. Everything inside it is EXACTLY zero fog and
// therefore EXACTLY zero blur, not a small amount of blur, and no tuning pass on
// this file can make it otherwise without moving the fog. The skater lives in a
// band the effect cannot express a value in.
//
// It is also the honest answer to "how far is far HERE": 14→220 m on the 66 m
// street block and 90→620 m on the 450 m spillway channel are two numbers the
// world lane already tuned per map, and the governor's draw-distance rung
// already rides `fog.far`. Keying off them means this effect follows a map swap
// and a quality step-down for free, with no constant of its own to keep in sync.
// A blur that started at a fixed 40 m would have been sensible on the block and
// would have fogged the top of the channel map solid.
//
// ── WHERE THE DEPTH COMES FROM: NOWHERE NEW ────────────────────────────────
//
// The pass needs a per-pixel depth, and this build already renders one. GTAOPass
// runs a full normal-and-depth prepass of the scene into its own
// `normalRenderTarget` before it does anything else, and hands the depth out as
// `pass.depthTexture` (`GTAOPass.setGBuffer`). Reading it costs **zero extra
// megabytes and zero extra draws** — the prepass happens whether this file
// exists or not.
//
// That is also why this effect is gated to the SAME rung the AO is on, and the
// gate is written as a dependency rather than as a taste (`blurFor` in
// `look.ts`). The alternatives were both worse on a build whose last mobile
// preflight came back at ~870 MB against a <700 MB budget:
//
// · Attaching a `DepthTexture` to the composer's own scene target is free on
//   `low` (it replaces the depth RENDERBUFFER that `depthBuffer: true` already
//   allocates) but NOT on `medium`: MSAA needs a multisampled depth renderbuffer
//   AND a single-sample depth texture to resolve into, which is a whole new
//   full-resolution depth surface — 4.1 MB at 1280x800, 5.3 MB on a phone at
//   DPR 2 — on the two rungs that exist to protect a device that is already over
//   its budget. It also puts the correctness of the effect on a WebGL2 depth
//   BLIT, and on mobile three may take the `WEBGL_multisampled_render_to_texture`
//   path instead, which this lane cannot verify from a laptop.
// · A depth prepass of this file's own is a second full draw of the scene's
//   geometry, which is the single most expensive thing in the chain and the
//   exact cost GTAO is gated to `high` for.
//
// So: where the AO's prepass runs, this runs and is free. Where it does not,
// there is no depth in the chain to key on and this does not run either.
//
// ── WHY IT IS A PASS AND NOT A BLOCK INSIDE THE GRADE ───────────────────────
//
// The shafts went inside `ps2-grade.ts` because a standalone shaft pass wanted a
// half-resolution TARGET, and megabytes were the currency. This wants no target
// — it is a plain `ShaderPass`, so the composer ping-pongs it between the two
// buffers it already owns and it allocates zero bytes, exactly like
// `motion-blur.ts`. What it costs is fill, and fill is the currency in which
// being a separate pass buys something: ORDER.
//
// A defocus is the lens failing to converge the light BEFORE the sensor
// integrates it and before the glow spreads, so it belongs above the shutter and
// well above the bloom — a blown window at ninety metres has to be defocused
// into a soft disc and THEN bloom, rather than bloom into a hard flare that is
// afterwards smudged. Inside the grade it would have landed under both, and it
// would have had to fight the grade's own two sharpening rings from inside the
// same pass.
//
// ── THE SAMPLING ────────────────────────────────────────────────────────────
//
// Six taps on a golden-angle spiral over the disc, not a ring: a ring of six is
// a hexagonal bokeh and shows itself the moment it is wide enough to notice,
// where `radius * sqrt((i + 0.5) / TAPS)` fills the disc evenly for the same
// six fetches. The whole spiral is then rotated per pixel by the same
// interleaved-gradient noise the grain, the shutter and the shafts use, which
// turns what is left of the structure into a dither the grade's own quantise
// swallows on the last line of the frame.
//
// EVERY TAP IS WEIGHTED BY ITS OWN FAR FACTOR, which is the second fetch per
// tap and the reason it is worth paying for. Without it a blur gathered at a far
// pixel pulls in whatever near, sharp geometry happens to be next to it on
// screen — and the near, sharp geometry that spends the whole game silhouetted
// against a distant facade is the skater. He would not be blurred; he would be
// SMEARED OUTWARD, a halo of his own colour in the soft background around his
// shoulders and his cap. Weighting each tap by the blur it is itself entitled to
// makes a tap at 5 m contribute exactly nothing to a pixel at 90 m, which is the
// same guarantee the fog curve gives the centre pixel, applied to the gather.

import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/** What a preset is allowed to move. Both fields have a real per-pixel price. */
export interface DistanceBlurSpec {
  /**
   * Fetches per pixel is 2x this plus 2 — colour and depth per tap, plus the
   * centre pair. Compiled in as a `#define` so the loop unrolls.
   */
  taps: number;
  /**
   * The radius of the disc at full blur, in UV of the frame's SHORT axis (the
   * long axis is corrected by the aspect so the disc stays round). 0.005 is
   * 4 px of radius at 800 high and 8 px of diameter — about three times the
   * 2.5 px the grade's definition ring works at, which is the scale at which a
   * surface stops carrying material and starts reading as distance.
   */
  radius: number;
}

/**
 * Where the blur starts and where it saturates, as fractions of the map's own
 * FOG FACTOR — not as metres, so the two maps and the governor's draw-distance
 * rung all keep their own scale.
 *
 * What they are in metres, since a fraction of a smoothstep is not something
 * anybody can picture. Inverting `smoothstep(near, far, d)`:
 *
 *   fog factor  street (14→220 m)   spillway (90→620 m)
 *   0.05        41.6 m              161 m
 *   0.35        95.7 m              300 m
 *
 * · **41.6 m before a single pixel softens**, against a skater who is never more
 *   than 7.5 m from the lens. That is 5.5x of clearance on top of the fog's own
 *   guarantee, and it is deliberately generous: the cost of starting too far out
 *   is that a ledge in the middle distance stays sharp, and the cost of starting
 *   too near is the one thing this effect is not allowed to do.
 * · **95.7 m to saturate**, which is set on the block's own geometry: the north
 *   facade — the wall of lit windows across the top of every frame looking down
 *   the main line — stands about 90 m out, so it lands at 93% of full blur and
 *   the roofline behind it is fully soft. The plaza's own furniture, every ledge
 *   and rail and the quarter pipe, is inside 30 m and is untouched.
 */
const FAR_IN = 0.05;
const FAR_OUT = 0.35;

const VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
// The AO's prepass depth. highp is not optional: a 24-bit depth value sampled at
// mediump collapses the whole far half of the frame onto a handful of distinct
// values, and the far half of the frame is the only part this pass looks at.
uniform highp sampler2D tDepth;
uniform vec2  uCamera;   // near, far — read live, the governor moves far
uniform vec2  uFog;      // fog near, fog far — the map's own, read live
uniform float uAspect;
uniform float uRadius;

varying vec2 vUv;

// Interleaved-gradient noise, the same two instructions the grain, the shutter
// and the shaft gather use. Not fract(sin(dot())): a white-noise hash rotates
// the spiral into clumps, where IGN spreads its values evenly over each 3x3 of
// pixels and reads as an even grain.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

/**
 * How much blur this pixel is entitled to, 0 to 1.
 *
 * Two steps and both are quoted from somewhere else on purpose. The first is
 * three's own perspectiveDepthToViewZ, so "depth" means what the renderer means
 * by it; the second is three's own linear Fog factor — a SMOOTHSTEP between near
 * and far on view-space z, which is -viewZ exactly — so "far" means what every
 * material in the scene already means by it.
 */
float farFactor(vec2 uv) {
  float depth = texture2D(tDepth, uv).x;
  // Nothing was drawn here: the cleared far plane. Sky, and sky is as far as it
  // gets. Written out rather than left to the arithmetic because at depth 1.0
  // the divide below lands on -near/... precision garbage on some drivers.
  if (depth >= 1.0) return 1.0;
  float viewZ = (uCamera.x * uCamera.y) / ((uCamera.y - uCamera.x) * depth - uCamera.y);
  float fog = smoothstep(uFog.x, uFog.y, -viewZ);
  return smoothstep(${FAR_IN.toFixed(3)}, ${FAR_OUT.toFixed(3)}, fog);
}

void main() {
  float centre = farFactor(vUv);

  // The one branch, and it is worth it here in a way it would not be in a pass
  // whose condition scattered: "is this pixel further than forty metres" is a
  // CONTIGUOUS REGION of the screen — the top of the frame and whatever shows
  // down the street — so warps are almost entirely on one side of it or the
  // other and there is very little divergence to pay for. On the common frame
  // most of the screen is plaza inside 30 m and takes this exit at the cost of
  // one depth fetch.
  if (centre <= 0.0) {
    gl_FragColor = texture2D(tDiffuse, vUv);
    return;
  }

  // Round in PIXELS, not in UV: an offset of r in v is r*height pixels and the
  // same offset in u is r*width, so the u axis is divided by the aspect. Without
  // this the disc is a 1.6:1 ellipse on a monitor and a 1:2.2 one on a phone.
  float r = uRadius * centre;
  float spin = ign(gl_FragCoord.xy) * 6.2831853;

  vec3 sum = texture2D(tDiffuse, vUv).rgb * centre;
  float weight = centre;

  for (int i = 0; i < TAPS; i++) {
    // Golden angle, and sqrt for the radius — the two together fill a disc
    // evenly with as few samples as this has. A constant angular step would be
    // a hexagon and a linear radius would pile every tap at the rim.
    float a = spin + float(i) * 2.39996323;
    float rad = r * sqrt((float(i) + 0.5) / float(TAPS));
    vec2 uv = clamp(vUv + vec2(cos(a) / uAspect, sin(a)) * rad, 0.0, 1.0);
    // The tap's OWN entitlement — see the header. A near, sharp neighbour
    // contributes 0 and cannot bleed into the far field.
    float w = farFactor(uv);
    sum += texture2D(tDiffuse, uv).rgb * w;
    weight += w;
  }

  // Mixed back by centre rather than written outright, so the ramp from sharp
  // to soft is continuous across the band where the gather is only partly
  // weighted — the alternative pops the moment a pixel's factor leaves zero.
  gl_FragColor = vec4(
    mix(texture2D(tDiffuse, vUv).rgb, sum / max(weight, 1e-4), centre),
    1.0
  );
}
`;

export interface DistanceBlur {
  /** Goes into the chain after the AO — which is what fills its depth — and
   *  above the shutter. */
  readonly pass: ShaderPass;
  /**
   * Once a frame, before `composer.render()`. Reads the camera's near/far and
   * the mounted map's fog live, so a spot change, a governor draw-distance
   * step-down and a player re-picking the quality all land for free.
   * `depth` null (no AO in this chain) switches the pass off outright.
   *
   * `width`/`height` are the size the chain is DRAWING at — the drawing buffer
   * times the render scale, not the canvas — because they do two jobs here: the
   * aspect that keeps the sample disc round, and the size this pass asserts onto
   * the borrowed depth texture (see the body).
   */
  update(
    camera: THREE.PerspectiveCamera,
    fog: THREE.Fog | null,
    width: number,
    height: number,
  ): void;
  /** The runtime switch. `false` is free: the composer skips a disabled pass. */
  setEnabled(on: boolean): void;
}

export function createDistanceBlur(
  spec: DistanceBlurSpec,
  depth: THREE.Texture | null,
): DistanceBlur {
  const pass = new ShaderPass({
    name: "DistanceBlur",
    defines: { TAPS: Math.max(2, Math.round(spec.taps)) },
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: depth },
      uCamera: { value: new THREE.Vector2(0.1, 600) },
      uFog: { value: new THREE.Vector2(14, 220) },
      uAspect: { value: 1.6 },
      uRadius: { value: spec.radius },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });

  let wanted = true;

  return {
    pass,
    update(camera, fog, width, height) {
      // No fog on this map means the map declined to say where far IS, and this
      // effect has no opinion of its own — see the header. It stands down rather
      // than inventing a range.
      pass.enabled = wanted && depth !== null && fog !== null;
      if (!pass.enabled || !fog || !depth) return;

      // ── SIZE THE BORROWED DEPTH TEXTURE ──────────────────────────────────
      //
      // The one piece of three's own bookkeeping this file has to do, and it is
      // here — every frame, before the draw — rather than in `setSize`, because
      // the window it is closing is not only a resize.
      //
      // GTAOPass builds its depth as `new DepthTexture()`: no width, no height,
      // `image` literally `{ width: undefined, height: undefined }`. Three fills
      // those in inside `setupDepthTexture`, the first time the render target
      // the texture is ATTACHED to is bound. That is fine for something that is
      // only ever a framebuffer attachment — and it stops being fine the moment
      // anything binds it as an ORDINARY sampler uniform, which is exactly what
      // this pass does. Three sees a texture whose version has moved, takes the
      // upload path instead of the bind path, and calls `texStorage2D` with an
      // undefined width: one `GL_INVALID_VALUE: glTexStorage2D: Texture
      // dimensions must all be greater than zero` per session, harmless on this
      // Mac and the kind of thing that is not harmless on a phone driver.
      //
      // Measured while chasing it: the AO's own depth allocates correctly at
      // 1280x800 on the chain's first frame, and the bad upload lands two frames
      // later against a DIFFERENT GL texture — i.e. after the pass ahead of this
      // one had its GPU-side bookkeeping thrown away and re-made, which happens
      // on any resize, any pixel-ratio step from the governor, any render-scale
      // change and any preset rebuild. Trying to close that window from `setSize`
      // only closes the ones that arrive as a resize.
      //
      // So: assert the size every frame, from the numbers the chain is actually
      // drawing at. It is a compare on the common frame and two writes on the
      // handful where it moved, and it writes exactly what three would write
      // itself a moment later — `setupDepthTexture` re-checks the same two
      // numbers against the target and corrects them if this ever disagreed.
      const image = depth.image as { width: number; height: number } | null;
      if (image && (image.width !== width || image.height !== height)) {
        image.width = width;
        image.height = height;
      }

      (pass.uniforms.uCamera.value as THREE.Vector2).set(camera.near, camera.far);
      (pass.uniforms.uFog.value as THREE.Vector2).set(fog.near, fog.far);
      pass.uniforms.uAspect.value = width / Math.max(1, height);
    },
    setEnabled(on) {
      wanted = on;
      if (!on) pass.enabled = false;
    },
  };
}
