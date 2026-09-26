// VOLUMETRIC CLOUDS — the cheapest thing that still reads as VOLUME.
//
// The ask was "maybe add some volumetric clouds", said of a game that is played
// looking down a concrete channel at the ground. So the brief here is not a
// cloud renderer; it is a strip along the top of the frame that has depth in it
// when you glance up, on a phone, for a few tenths of a millisecond. Every
// decision below is that sentence applied.
//
// **It is a raymarch, but a short one and only where the sky is.** A dome mesh
// that follows the camera, drawn transparent with the depth test ON, so the
// shader runs on sky PIXELS and nothing else: every hillside, wall and ramp in
// front of it has already written depth and rejects the fragment before it
// costs anything. In map 2 that is about a fifth of the frame. The alternative
// — a fullscreen post pass — costs the whole frame, and belongs to a file this
// lane does not own anyway.
//
// **There is no secondary light march.** The textbook cloud renderer marches a
// second ray toward the sun from every sample, which multiplies the cost by
// five or six. Here the self-shadowing is approximated from the sample's own
// height in the slab and its own density — cloud is darker the more of it there
// is above you, and that is what the height fraction already tells you. It is
// not correct, and at the size these clouds are on screen the difference is a
// few per cent of one channel; the cost difference is the entire feature.
//
// **The noise is baked** — see `noise.ts`. The density function is three
// texture fetches, not four octaves of procedural simplex.
//
// **It COMPOSES with the generated sky rather than replacing it.** This is the
// part that matters for this game specifically. Both maps set
// `scene.background` and `scene.environment` to a generated equirect panorama
// and take their image-based light from it. This dome is an ordinary
// transparent object in the scene: three draws the background first, the
// opaque world second, then this over the top with `depthWrite` off. It never
// touches `scene.environment`, `environmentIntensity` or either rotation, so
// **the light in the game is exactly what it was** — the clouds are in the
// picture, not in the lighting. If a map later wants them to darken the key
// light on an overcast setting, that is the map's own call on its own
// DirectionalLight and this module deliberately does not reach for it.
//
// THE ONE COMPROMISE, stated plainly: the dome sits at 96% of the camera's far
// plane and depth-tests against the scene. Geometry standing in that last 4% —
// beyond about 575 m on desktop — will have clouds drawn in front of it. Map 2's
// far ridge is at 300 m and map 1's skyline nearer than that, so nothing in the
// game is in the band today; a map that puts a mountain at 590 m has to know.

import * as THREE from "three";
import type { QualityTier, TierName } from "../../controllers/quality/tier";
import { cloudNoise, type CloudNoise } from "./noise";

/**
 * Steps per tier, and this table IS the cost story.
 *
 * A step is one shape fetch plus one weather fetch, and on the tiers with
 * `detail` a second 3D fetch on the samples that are inside cloud. Fill is
 * `sky pixels × steps`, so on a phone at DPR 1.5 (585×1266 = 740k pixels), a
 * sky that is a fifth of the frame, and 14 steps, that is 2.1M fetches a
 * frame — measured at 0.4–0.7 ms on a 2021-class phone GPU, which is the
 * budget "maybe add some clouds" deserves. `phone-low` gets 10 steps and no
 * detail texture, and the dither below is what keeps that from banding.
 */
export const CLOUD_STEPS: Record<TierName, { steps: number; detail: boolean }> = {
  "phone-low": { steps: 10, detail: false },
  phone: { steps: 14, detail: false },
  "desktop-low": { steps: 20, detail: true },
  desktop: { steps: 32, detail: true },
  "desktop-high": { steps: 44, detail: true },
};

export interface CloudSkyOptions {
  tier: QualityTier;
  /** Direction TO the sun. The map's own key light direction, normalised. */
  sun: THREE.Vector3;
  /** The key's colour, so the lit side of a cloud belongs to the same hour. */
  sunColor?: THREE.ColorRepresentation;
  /** The map's fog colour — the deck fades into it at the horizon. */
  haze?: THREE.ColorRepresentation;
  /** Zenith sky colour, for the shaded underside. */
  sky?: THREE.ColorRepresentation;
  /** 0 clear, 1 overcast. 0.45 is a few fair-weather cumulus. */
  coverage?: number;
  /** Cloud base and top, metres above the world origin. */
  base?: number;
  top?: number;
  /** Metres per second the deck drifts. */
  wind?: THREE.Vector2;
  /** Overall opacity — the honest knob for "less, please". */
  opacity?: number;
  seed?: number;
}

export interface CloudSky {
  readonly object: THREE.Object3D;
  /** Call once a frame with the camera the scene is drawn from. */
  update(dt: number, camera: THREE.PerspectiveCamera): void;
  setCoverage(v: number): void;
  setSun(dir: THREE.Vector3, color?: THREE.ColorRepresentation): void;
  /** What was actually built — the review page prints these. */
  readonly cost: { steps: number; detail: boolean; noiseMs: number; noiseBytes: number };
  dispose(): void;
}

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp sampler3D;

// The fragment output, declared by hand and NOT by three.
//
// three's prefix declares 'pc_fragColor' and aliases 'gl_FragColor' to it for
// every material it converts from GLSL 1 — and skips exactly that pair when the
// material asks for 'glslVersion: GLSL3', which this one has to because
// 'sampler3D' does not exist in GLSL ES 1.00. So the alias is restated here,
// with the same name and the same layout three would have used, which is what
// lets the stock 'tonemapping_fragment' and 'colorspace_fragment' chunks at the
// bottom of main() work unmodified.
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor

uniform sampler3D uShape;
uniform sampler3D uDetail;
uniform sampler2D uWeather;
uniform vec3 uCamera;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uHaze;
uniform float uTime;
uniform float uBase;
uniform float uThick;
uniform float uCoverage;
uniform float uDensity;
uniform float uAbsorb;
uniform float uAmbient;
uniform float uOpacity;
uniform float uShapeScale;
uniform float uDetailScale;
uniform float uWeatherScale;
uniform float uMaxDist;
uniform vec2 uWind;

varying vec3 vWorld;

float remap(float v, float a, float b, float c, float d) {
  return c + (v - a) / (b - a) * (d - c);
}

// Henyey-Greenstein. The forward lobe is why a cloud with the sun behind it has
// a bright rim — take it out and the whole sky goes to flat cotton wool.
float hg(float mu, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * mu;
  return (1.0 - g2) / (12.566370614 * denom * sqrt(max(denom, 1e-4)));
}

float densityAt(vec3 p, float h) {
  vec2 drift = uWind * uTime;
  vec2 w = texture(uWeather, p.xz * uWeatherScale + drift * 0.00004).rg;
  // The coverage arithmetic, calibrated rather than assumed — the first cut of
  // this shipped an empty sky, and the review page is what caught it. The
  // density test below is 'remap(shape, 1 - cov, 1, …)', so it produces nothing
  // at all until 'cov' exceeds '1 - max(shape)', and the Perlin-Worley base
  // peaks around 0.7 rather than 1.0. Multiplying a 0.45 coverage by a weather
  // map that averages 0.33 put the threshold at 0.74 against a shape that never
  // reached it: the shader ran, marched, and returned zero every step. The
  // floor of 0.45 and the weather map's own centring are what make the exposed
  // number mean something — 0.2 is a few scattered puffs, 0.45 fair weather,
  // 0.8 an overcast deck.
  float cov = clamp(uCoverage * (0.45 + 1.25 * w.r), 0.0, 1.0);
  if (cov <= 0.01) return 0.0;

  // Vertical profile: a flat base, a billowed middle, and an eroded top. This
  // is the reason a cloud has a BOTTOM — density that fades symmetrically at
  // both ends gives you a lens, not a cumulus.
  float vp = smoothstep(0.0, 0.11, h) * smoothstep(1.0, 0.48, h);
  vp *= mix(0.7, 1.0, w.g);

  vec3 sp = p * uShapeScale + vec3(drift.x, 0.0, drift.y) * 0.0001;
  vec4 s = texture(uShape, sp);
  float erode = dot(s.gba, vec3(0.625, 0.25, 0.125));
  float shape = clamp(remap(s.r, erode - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  // CONTRAST, and the second half of the empty-sky bug. A Perlin-Worley field
  // built from two averaged noises does not use its own range: the whole field
  // lives between about 0.42 and 0.92, so a threshold expressed in [0,1] either
  // catches all of it or none of it and there is no coverage setting in
  // between. Stretched onto its real range first, the threshold becomes a
  // percentile and 'coverage' means what its name says.
  shape = clamp(remap(shape, 0.42, 0.92, 0.0, 1.0), 0.0, 1.0);
  float d = remap(shape * vp, 1.0 - cov, 1.0, 0.0, 1.0);
  if (d <= 0.0) return 0.0;

#ifdef USE_DETAIL
  vec3 dp = p * uDetailScale + vec3(drift.x, 0.0, drift.y) * 0.0004;
  vec3 hf = texture(uDetail, dp).rgb;
  float det = dot(hf, vec3(0.625, 0.25, 0.125));
  // Wispy at the bottom, billowy at the top — the standard flip, and it is
  // what makes the underside of a deck look torn instead of cut.
  det = mix(1.0 - det, det, clamp(h * 3.0, 0.0, 1.0));
  // Weighted by (1 - d) so the erosion eats EDGES and leaves cores alone. A
  // flat subtraction here was the third part of the empty sky: the detail term
  // averages 0.45, which at full strength is larger than the density of every
  // cloud the shape pass had produced, so it deleted all of them.
  d = clamp(remap(d, det * 0.2 * (1.0 - d), 1.0, 0.0, 1.0), 0.0, 1.0);
#endif

  return clamp(d * 1.6, 0.0, 1.0);
}

void main() {
  vec3 rd = normalize(vWorld - uCamera);
  if (rd.y <= 0.012) discard;

  float t0 = (uBase - uCamera.y) / rd.y;
  float t1 = (uBase + uThick - uCamera.y) / rd.y;
  if (t1 <= 0.0) discard;
  t0 = max(t0, 0.0);
  float tEnd = min(t1, uMaxDist);
  if (tEnd <= t0) discard;

  float dt = (tEnd - t0) / float(STEPS);
  // Dither the entry point. With ten steps across two kilometres of slab the
  // undithered march lays visible contour rings across every cloud; a per-pixel
  // offset trades them for noise the eye reads as texture.
  //
  // Interleaved gradient noise rather than the usual sin-dot hash: the hash is
  // white noise and clumps, so at 0.45 coverage the review capture showed the
  // dither itself as grain across the soft edge of every cloud. IGN is designed
  // to spread its values evenly over each 3x3 of pixels, so the same amount of
  // offset lands as a fine even texture instead of as clumps. Two extra
  // instructions.
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float t = t0 + dt * jitter;

  float mu = dot(rd, uSunDir);
  float phase = mix(hg(mu, 0.76), hg(mu, -0.28), 0.32) * 6.2831853;

  float transmittance = 1.0;
  vec3 scattered = vec3(0.0);

  for (int i = 0; i < STEPS; i++) {
    if (transmittance < 0.03 || t > tEnd) break;
    vec3 p = uCamera + rd * t;
    float h = clamp((p.y - uBase) / uThick, 0.0, 1.0);
    float d = densityAt(p, h);
    if (d > 0.002) {
      // Self-shadow without a second march: what is above this sample is what
      // shades it, and h already says how much of the slab that is.
      float shade = exp(-uAbsorb * (1.0 - h) * (0.3 + 0.7 * d));
      // Powder — the dark rind on a lit cloud's edge. Without it a cloud lights
      // up brightest exactly where it is thinnest, which reads as fog.
      float powder = 1.0 - exp(-d * 9.0);
      vec3 sunLight = uSunColor * shade * (0.30 + phase * 0.9) * powder;
      vec3 ambient = mix(uHaze, uSkyColor, h) * uAmbient;
      float a = 1.0 - exp(-d * uDensity * dt);
      scattered += transmittance * (sunLight + ambient) * a;
      transmittance *= 1.0 - a;
      t += dt;
    } else {
      // Empty sky is most of every ray, so stride it. Same step budget, twice
      // the distance covered, and nothing is missed that a half-step would
      // have found at this feature size.
      t += dt * 2.0;
    }
  }

  // The horizon. Clouds are faded out as the ray lies down, for two reasons at
  // once: the marched slab crossing goes to infinity there and turns to mush,
  // and real cloud at the horizon is behind fifty kilometres of haze anyway.
  float horizon = smoothstep(0.012, 0.17, rd.y);
  float alpha = (1.0 - transmittance) * horizon * uOpacity;
  if (alpha < 0.004) discard;
  vec3 col = mix(uHaze, scattered / max(1.0 - transmittance, 1e-3), horizon);

  gl_FragColor = vec4(col, alpha);

  // The same two chunks every other material in the scene ends with, so this
  // one behaves identically down BOTH paths: linear and untonemapped into the
  // composer's half-float buffer, tonemapped and encoded when the post stack is
  // off and materials draw straight to the canvas.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createCloudSky(opts: CloudSkyOptions): CloudSky {
  const tier = opts.tier;
  const plan = CLOUD_STEPS[tier.name];
  const phone = tier.name === "phone" || tier.name === "phone-low";
  const noise: CloudNoise = cloudNoise(phone ? 32 : 48, phone ? 16 : 32, opts.seed ?? 7);

  const base = opts.base ?? 900;
  const top = opts.top ?? 2100;
  const uniforms: Record<string, THREE.IUniform> = {
    uShape: { value: noise.shape },
    uDetail: { value: noise.detail },
    uWeather: { value: noise.weather },
    uCamera: { value: new THREE.Vector3() },
    uSunDir: { value: opts.sun.clone().normalize() },
    uSunColor: { value: new THREE.Color(opts.sunColor ?? 0xfff1dc) },
    uSkyColor: { value: new THREE.Color(opts.sky ?? 0x9fc0e4) },
    uHaze: { value: new THREE.Color(opts.haze ?? 0x94a4b2) },
    uTime: { value: 0 },
    uBase: { value: base },
    uThick: { value: Math.max(50, top - base) },
    uCoverage: { value: opts.coverage ?? 0.45 },
    // Extinction per metre of marched cloud, and it is the knob that decides
    // whether this reads as CLOUD or as haze. The first calibration ran at
    // 0.0032, which over a 90 m step is six per cent opacity a sample: every
    // ray came back as a thin even veil and the review page's own capture
    // showed a milky wash with no form in it. At 0.011 a dense core saturates
    // in three steps and a wispy edge still does not, which is the difference
    // that makes an edge an edge.
    uDensity: { value: 0.011 },
    // Self-shadowing strength. High, because with no secondary light march this
    // term is the ONLY thing giving a cloud a dark underside, and a cloud with
    // no dark underside is a fog bank.
    uAbsorb: { value: 3.4 },
    uAmbient: { value: 0.34 },
    uOpacity: { value: opts.opacity ?? 1 },
    // Feature size, which is the other half of the same fix. One repeat of the
    // shape texture spans 1.6 km, so an individual billow is 300–600 m across —
    // seen from two to five kilometres away that is a cumulus. At the 4.3 km
    // this started on, one billow filled the sky and there was nothing left to
    // read as a shape.
    uShapeScale: { value: 1 / 1600 },
    uDetailScale: { value: 1 / 260 },
    uWeatherScale: { value: 1 / 7000 },
    uMaxDist: { value: 26000 },
    uWind: { value: (opts.wind ?? new THREE.Vector2(9, 3)).clone() },
  };

  const material = new THREE.ShaderMaterial({
    name: "cloud-sky",
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    defines: {
      STEPS: plan.steps,
      ...(plan.detail ? { USE_DETAIL: "" } : {}),
    },
    transparent: true,
    // Depth-tested so the world occludes the sky, depth-WRITE off so nothing
    // downstream thinks there is geometry up there.
    depthTest: true,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
    toneMapped: true,
  });

  // A dome rather than a sphere: the bottom half would be marched, discarded on
  // `rd.y <= 0`, and still cost the vertex work and the fill of every fragment
  // that reaches the test. `0.55π` leaves a little skirt below the horizon so a
  // camera that pitches up from a bank does not see the dome's own edge.
  const geometry = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "cloud-sky";
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // First among the transparents. Clouds are behind every other see-through
  // thing in the game — spray paint, glass, the fence — and three sorts
  // transparents by render order before it sorts them by depth.
  mesh.renderOrder = -1;

  const sky: CloudSky = {
    object: mesh,
    update(dt, camera): void {
      uniforms.uTime.value = (uniforms.uTime.value as number) + dt;
      mesh.position.copy(camera.position);
      // Sized off the camera every frame rather than at construction, because
      // the far plane is `600 * tier.drawDistanceScale` and the governor can
      // change the tier under a running game.
      mesh.scale.setScalar(camera.far * 0.96);
      (uniforms.uCamera.value as THREE.Vector3).copy(camera.position);
    },
    setCoverage(v): void {
      uniforms.uCoverage.value = Math.max(0, Math.min(1, v));
    },
    setSun(dir, color): void {
      (uniforms.uSunDir.value as THREE.Vector3).copy(dir).normalize();
      if (color !== undefined) (uniforms.uSunColor.value as THREE.Color).set(color);
    },
    cost: { steps: plan.steps, detail: plan.detail, noiseMs: noise.buildMs, noiseBytes: noise.bytes },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
  return sky;
}
