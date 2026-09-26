// Motion blur — the frame's own shutter, reconstructed from the CAMERA and
// nothing else.
//
// The ask was "we might need some motion blur to make it feel more modern",
// said of a game that is ridden at 8–17 m/s (58 km/h off the speed bar on the
// main line) behind a chase camera that yaws through every carve. So the brief
// is not a motion-blur renderer; it is a shutter that opens for part of a frame
// and is INVISIBLE as an effect — you should notice the speed, never the smear.
//
// ── WHY REPROJECTION AND NOT A VELOCITY BUFFER ──────────────────────────────
//
// The textbook build is a per-object velocity pass: render the scene a second
// time writing (currentClip - previousClip) per fragment into an RG16F target,
// then blur along it. It is correct for everything — a spinning deck, a
// swinging arm, a car crossing the shot — and it costs a full extra draw of the
// scene's geometry plus a full-resolution float render target.
//
// This game cannot pay either, and does not need to. Two measurements decide it:
//
// · **Nothing in this world moves except the camera.** The plaza is static
//   geometry. The only things with their own velocity are the skater and his
//   board, and they sit in the middle of a chase shot travelling WITH the
//   camera — their screen velocity is near zero exactly where a velocity buffer
//   would be doing its most expensive work. The wheels and a flipping deck are
//   the real per-object motion in the game and they are a few hundred pixels.
// · **The mobile preflight is already over budget** — ~764 MB estimated phone
//   GPU memory against a <700 MB allowance. A full-resolution RG16F velocity
//   target is 4 bytes a pixel: 8.2 MB at 1280×800 DPR 1, 33 MB at DPR 2. That
//   is the wrong direction to spend in by an order of magnitude.
//
// So this reconstructs the velocity field ANALYTICALLY, from the camera's own
// two matrices, and allocates NOTHING: it is a plain `ShaderPass`, and an
// `EffectComposer` ping-pongs every ShaderPass between the two render targets
// it already owns. The memory cost of this file at every tier is zero bytes.
// What it costs is one extra read+write of the screen and TAPS texture fetches
// per pixel — see the preset table in `look.ts`.
//
// ── WHAT IT GETS RIGHT AND WHAT IT APPROXIMATES ─────────────────────────────
//
// Per pixel it builds the world-space ray, puts a point on it, and projects
// that point through the PREVIOUS frame's view-projection. The difference in
// NDC is the pixel's velocity. The only unknown is how far along the ray the
// point is, i.e. the depth — and that is the whole approximation:
//
// · **Camera ROTATION is exact at any depth.** Rotational optical flow does not
//   depend on distance: yaw the camera one degree and every pixel in the frame
//   moves by the same angle, near ground and far skyline alike. Since a carve
//   is mostly a yaw, the single loudest motion in this game is reconstructed
//   with no error at all — including the roll and the fov, because it comes out
//   of the real projection matrix rather than out of a screen-space
//   approximation of one.
// · **Depth is taken off the GROUND PLANE**, analytically: a ray heading
//   downward meets y = 0 at `t = -camY / dir.y`, and that is EXACT for the
//   concrete, which is most of a skate frame and the only surface that streaks
//   hard enough to see. A ray heading up, or one so near horizontal that it
//   lands past the far plane, is pinned at the far plane instead — which turns
//   the maths back into the rotation-only case, and that is also exact, because
//   a building 90 m away and a sky at infinity genuinely have no forward
//   parallax worth drawing.
// · **What it gets wrong is walls, and it gets them wrong SAFELY.** A ray that
//   hits the north facade is given the depth of the ground point BEHIND that
//   facade, which is further away, which means less parallax, which means the
//   wall is UNDER-blurred rather than smeared. Every error in this file points
//   the same way on purpose: the failure mode of a motion blur is a smear, so
//   the approximation is arranged to run out of blur rather than into it. (A
//   downhill map — the parked spillway — puts its ground below y = 0, so its
//   floor is under-blurred by the same mechanism rather than over-blurred.)
//
// ── THE FRAME RATE IS NOT THE SHUTTER ───────────────────────────────────────
//
// Reprojection measures displacement between two DRAWN frames, so the raw
// answer is proportional to the frame interval: the same carve at 30 fps
// reprojects four times as far as at 120. Left alone that is a game whose look
// is set by the machine it is running on — measured here at 118 fps in the
// capture harness against the 60 the design is tuned at, a factor of two — and
// the fast machine gets the crisper picture, which is backwards from every
// other quality knob in this project.
//
// So the displacement is divided back out by the frame's own delta and
// multiplied by REFERENCE_DT. What is left is a velocity in screen-widths per
// SECOND times a fixed exposure time, which is what a physical shutter is: the
// blur now says how fast the camera is moving and nothing about how fast the
// machine is drawing. `look.ts` hands the delta down for exactly this.
//
// ── THE THREE GUARDS ────────────────────────────────────────────────────────
//
// 1. **Idle.** A frame where nothing moved must cost nothing, and the game
//    spends real time sitting at the title screen with the world rendering
//    behind the menu. One probe point 20 m in front of the camera is projected
//    through last frame's matrix; below IDLE_FLOW the pass is switched off
//    outright and the composer skips it.
// 2. **Cuts.** `R`, DROP IN and a spot change teleport the camera. The frame
//    after a teleport has a velocity field the size of the screen, and blurring
//    across a cut is not motion, it is a wipe. Past TELEPORT_FLOW the pass
//    stands down for that frame. Both thresholds are tested against the
//    NORMALISED flow, so neither of them moves when the frame rate does.
// 3. **The knee, which is a roll-off and not a cliff.** A hard carve at 59 km/h
//    measured about 4.3 screen-widths a second of optical flow — six times what
//    the fastest straight-line ground streak asks for — so a hard clamp is not
//    a safety rail here, it is the LOOK during every turn in the game, and a
//    length that pins to the same number the instant you touch A or D reads as
//    a switch being thrown. `maxBlur` is applied as a Reinhard-style soft knee
//    instead: `len · m/(m + len)`. Below the knee it is transparent (a streak
//    at a fifth of `m` comes back at 83% of its length), at `m` it is halved,
//    and it can never reach `m` however violently the camera is thrown. The
//    first cut of this file used the cliff, and the capture of a carve is what
//    caught it — the plaza and a facade 40 m behind it smeared by the same
//    25 px because both had saturated.
//
// ── WHAT IT COSTS, MEASURED ─────────────────────────────────────────────────
//
// Timed by A/B against the same run with the pass removed, interleaved so the
// machine's own thermal drift landed on both sides equally — the first attempt
// at this measured the version with LESS work in it as slower, which is what an
// un-interleaved 4K benchmark on a warming laptop is worth. At 2560x1440
// (3.7 Mpx) the eight-tap high rung costs **+0.30 ms** of median frame time,
// 10.03 → 10.33. That scales with fill, so it is about 0.08 ms at 1280x800 and
// 0.17 ms at 1920x1080, and the five-tap rung below it is roughly five eighths
// of those. In MEGABYTES it costs **zero, at every tier** — the pass owns no
// target, and an EffectComposer ping-pongs it between the two it already had.
//
// ── TONE MAPPING ────────────────────────────────────────────────────────────
//
// This runs in scene-referred HDR, between the AO and the bloom, and it neither
// tone maps nor encodes. That is both correct and required: a real shutter
// integrates RADIANCE, so the average belongs in linear light where a blown
// window streaking across a dark doorway stays a bright streak instead of a
// grey one — and `ps2-grade.ts` is the single owner of the tone map and the
// sRGB encode in this project. Sitting above the bloom is deliberate for the
// same reason: the glow spreads along the streak, which is what stops a fast
// pass under a lit shopfront reading as a stack of ghosts.

import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/** What a preset is allowed to move. Every field here has a real price. */
export interface MotionBlurSpec {
  /**
   * Texture fetches per pixel, and the whole cost of the pass. Compiled in as a
   * `#define` so the loop unrolls and no preset pays a runtime counter.
   */
  taps: number;
  /**
   * Shutter, as a fraction of REFERENCE_DT — 0.5 would be the film convention's
   * 180° shutter at 60 fps. The blur is centred on the pixel rather than
   * trailing it, so the picture never lags the input by half a shutter.
   */
  shutter: number;
  /**
   * The soft knee, in UV — the length a streak asymptotically approaches and
   * never reaches. 0.011 is 8.8 px at 800 high and 14 px across at 1280, since
   * this is one number for both axes and the long axis is where a carve moves.
   */
  maxBlur: number;
}

/**
 * The frame interval the shutter is quoted against. 60 Hz because that is what
 * this game is tuned and captured at; a 144 Hz monitor and a machine dropping
 * to 30 both get the same streak for the same camera speed.
 */
const REFERENCE_DT = 1 / 60;

/**
 * Below this much NORMALISED screen movement the pass is switched off. In UV:
 * 0.0015 is one and a bit pixels at 800 high, which is under the grade's own
 * dither, so there is nothing there to blur.
 */
const IDLE_FLOW = 0.0015;
/**
 * …and above THIS the camera did not move, it was moved. A third of the screen
 * in a 60th of a second is not reachable by skating: the hardest carve measured
 * on the main line is 0.072, so a teleport clears this by a factor of five and
 * an ordinary turn never comes near it.
 */
const TELEPORT_FLOW = 0.35;
/** How far in front of the camera the flow probe sits, in metres. */
const PROBE_DISTANCE = 20;

const VERTEX = /* glsl */ `
uniform mat4 uInvViewProj;

varying vec2 vUv;
varying vec2 vNdc;
// The far-plane point in HOMOGENEOUS world space, divided in the fragment
// shader rather than here. Unprojecting NDC is a linear map and this quad has
// no perspective, so interpolating the vec4 and dividing per pixel is exactly
// the same answer as a per-pixel matrix multiply — for one varying instead of
// sixteen multiply-adds a fragment.
varying vec4 vFar;

void main() {
  vUv = uv;
  vNdc = uv * 2.0 - 1.0;
  vFar = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform mat4 uPrevViewProj;
uniform vec3 uCamPos;
uniform float uShutter;
uniform float uMaxBlur;

varying vec2 vUv;
varying vec2 vNdc;
varying vec4 vFar;

// Interleaved-gradient noise, the same hash the grade and the cloud march use.
// Not fract(sin(dot())): with ten taps over twenty-odd pixels the tap positions
// are visible as hard steps down a streak, and a white-noise hash trades them
// for clumps. IGN spreads its values evenly over each 3x3 of pixels, so a half
// tap of jitter turns the steps into an even grain the grade's own dither then
// swallows. Two instructions.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  // The ray from the eye to this pixel's far-plane point. Parameterised so
  // t = 1 IS the far plane, which is what lets the depth guess below be a
  // clamp into [0,1] with no extra uniform to tell it what "far" means.
  vec3 ray = vFar.xyz / vFar.w - uCamPos;

  // Where the ray meets the ground. Down-going rays get the exact plane
  // intersection; everything else is pinned at the far plane, which is the
  // rotation-only case and is exact for sky and skyline. The 0.002 floor is
  // about a metre at this game's far plane and stops a camera that has dipped
  // below y = 0 from asking for a point at the eye itself.
  float t = 1.0;
  if (ray.y < -1e-4) t = clamp(-uCamPos.y / ray.y, 0.002, 1.0);
  vec3 world = uCamPos + ray * t;

  // …and where that same point was on screen last frame.
  vec4 prev = uPrevViewProj * vec4(world, 1.0);
  vec2 velocity = vec2(0.0);
  // w <= 0 is a point that was BEHIND the previous camera — its projection is
  // mirrored nonsense, so it contributes no blur rather than a wrong one.
  // uShutter already carries this frame's REFERENCE_DT/delta normalisation, so
  // what comes out is an exposure and not a frame interval.
  if (prev.w > 1e-4) velocity = (vNdc - prev.xy / prev.w) * 0.5 * uShutter;

  // The soft knee — see the header. A multiply, not a branch, so it costs the
  // same on every pixel and there is no discontinuity anywhere in the field for
  // a carve to snap across.
  float len = length(velocity);
  velocity *= uMaxBlur / (uMaxBlur + len);

  // Symmetric around the pixel: taps run over (-0.5, +0.5) of the shutter, so a
  // still edge stays where it is and a moving one grows in both directions.
  // Sampling outside the frame is left to the target's own clamp-to-edge, which
  // extends the border pixel along the streak — the standard artefact, and the
  // cheapest of the choices at the one place nobody looks.
  float jitter = ign(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float f = (float(i) + jitter) / float(TAPS) - 0.5;
    sum += texture2D(tDiffuse, vUv + velocity * f).rgb;
  }

  gl_FragColor = vec4(sum / float(TAPS), 1.0);
}
`;

export interface MotionBlur {
  /** Goes into the chain after the AO and before the bloom. */
  readonly pass: ShaderPass;
  /**
   * Once a frame, before `composer.render()`. Reads the camera's matrices,
   * hands the shader this frame's and last frame's, and decides whether the
   * pass runs at all — see the guards in the header. `delta` is the frame's own
   * seconds and is what turns a per-frame displacement into a shutter.
   */
  update(camera: THREE.PerspectiveCamera, delta: number): void;
}

/**
 * Build the pass. `taps` is a compile-time `#define`, so a preset that asked for
 * six does not run a ten-iteration loop with four of them predicated off — it
 * compiles a six-tap shader.
 */
export function createMotionBlur(spec: MotionBlurSpec): MotionBlur {
  const pass = new ShaderPass({
    name: "CameraMotionBlur",
    defines: { TAPS: Math.max(2, Math.round(spec.taps)) },
    uniforms: {
      tDiffuse: { value: null },
      uInvViewProj: { value: new THREE.Matrix4() },
      uPrevViewProj: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uShutter: { value: spec.shutter },
      uMaxBlur: { value: spec.maxBlur },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
  // Off until the first `update` says the camera moved. It also means the very
  // first frame of a session — which has no previous matrix at all — draws
  // sharp instead of drawing whatever an identity matrix reprojects to.
  pass.enabled = false;

  const viewProj = new THREE.Matrix4();
  const prevViewProj = new THREE.Matrix4();
  const probe = new THREE.Vector3();
  let primed = false;

  return {
    pass,
    update(camera, delta) {
      // The follow camera has already moved this frame, but `matrixWorldInverse`
      // is the RENDERER's business and is still last frame's until the draw
      // begins. Doing it here is what makes `viewProj` this frame's rather than
      // a frame behind — and it is idempotent, so the renderer redoing it a
      // moment later costs one matrix inverse on an object with no parent.
      camera.updateMatrixWorld();
      viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

      // ONE probe carries both guards. A point 20 m in front of the camera sits
      // at NDC (0,0) under this frame's matrix by construction, so its distance
      // from the origin after the PREVIOUS frame's matrix is the whole flow
      // measurement — rotation and translation together, in the units the
      // shader works in. `applyMatrix4` on a Vector3 does the perspective
      // divide, so this is four lines for what the alternative spends a
      // readback on.
      probe.set(0, 0, -PROBE_DISTANCE).applyMatrix4(camera.matrixWorld).applyMatrix4(prevViewProj);
      // The frame's displacement, put on the reference clock before anything
      // compares it to a threshold — otherwise "is this a teleport" would be
      // answered differently on a 144 Hz monitor and on a machine at 30.
      const shutter = REFERENCE_DT / Math.max(delta, 1e-3);
      const flow = Math.hypot(probe.x, probe.y) * 0.5 * shutter;
      pass.enabled = primed && flow > IDLE_FLOW && flow < TELEPORT_FLOW;

      if (pass.enabled) {
        (pass.uniforms.uInvViewProj.value as THREE.Matrix4).copy(viewProj).invert();
        (pass.uniforms.uPrevViewProj.value as THREE.Matrix4).copy(prevViewProj);
        (pass.uniforms.uCamPos.value as THREE.Vector3).copy(camera.position);
        pass.uniforms.uShutter.value = spec.shutter * shutter;
      }

      prevViewProj.copy(viewProj);
      primed = true;
    },
  };
}
