// The look stack — the game's whole image, after the scene and before the eye.
//
// This file owns the answer to "why does it look PS2 and not PS1". The register
// is: **solid silhouettes, readable materials, real specular and real
// lighting — then stylised BACK toward the era through post**, never by
// throwing away geometry or texture resolution. Vertex wobble, 128px mud and
// bare untextured faces are PS1, and they are a fail here however fast they run.
//
// `main.ts` owns the seam and nothing else: it builds one of these, calls
// `render()` in place of `renderer.render()`, and forwards resizes. Everything
// between those two calls belongs to this module.
//
// THE CHAIN, and why it is in this order:
//
//   scene ▶ RenderPass ▶ meter ▶ [GTAO] ▶ [defocus] ▶ [shutter] ▶ bloom ▶ grade ▶ canvas
//          HDR, linear   reads   contact   the far     motion     highlight  tone map,
//          half-float    nothing darkening field       blur       spill      grade, era,
//                        writes                                              LENS DIRT
//
// …and the whole of it now runs at RENDER SCALE — see `RENDER_SCALES`. That is
// not a stage, it is the size of every buffer above: the scene is drawn at a
// fraction of the canvas and the last pass scales it back up, which is how the
// console did it and is switched OFF at every tier until somebody asks.
//
// · **RenderPass into a half-float target.** Not a byte target: everything
//   downstream needs the highlights that live above 1.0 — the lit windows, the
//   sky, the sun off the coping — and a byte buffer has clipped them before the
//   bloom ever gets to look. Drawing into a target is also what makes the tone
//   mapping single-owner: three only applies `renderer.toneMapping` in a
//   material when that material draws straight to the canvas, so the moment the
//   composer exists every material goes linear-and-untonemapped on its own and
//   the grade pass is the only thing left that tone maps.
// · **The meter immediately after, and above anything that changes a level.**
//   `metering.ts` reduces the raw scene buffer to one ground-weighted
//   log-average and hands back the exposure multiplier that the grade and the
//   bloom knee both ride. It sits above the AO because AO is a LOCAL darkening —
//   metering downstream of it would have the camera stop UP because a corner is
//   occluded — and above the bloom because bloom adds back light that was
//   already counted. It writes only to its own three tiny targets and touches
//   neither composer buffer, so it could be dropped anywhere in the first half
//   of the chain without changing a pixel; this is where it is CORRECT rather
//   than where it is convenient.
// · **AO before bloom.** AO is a darkening of the scene, so it has to land
//   before anything measures brightness — bloom on an un-occluded frame lights
//   up corners the AO is about to put in shadow.
// · **The shutter between the AO and the bloom.** Motion blur is the sensor
//   integrating radiance over the time the shutter is open, so it belongs in
//   scene-referred linear (a blown window streaking across a dark doorway has
//   to stay a bright streak, not average down to a grey one) and it belongs
//   AFTER everything that decides what the scene's radiance is — the AO
//   included, since a shutter blurs the shaded image and not the unshaded one.
//   It sits ABOVE the bloom so the glow spreads along the streak rather than
//   the streak smearing an already-spread glow; that is the difference between
//   a fast pass under a lit shopfront reading as speed and reading as a stack
//   of ghosts. It allocates nothing — see `motion-blur.ts` on why this is a
//   camera reprojection and not a velocity buffer, and on what that costs.
// · **Bloom before the grade.** Bloom is a lens/sensor effect and lives in
//   scene-referred HDR where a value of 6.0 blooms six times as hard as a 1.0.
//   Downstream of the tone map every highlight is already squashed to 1.0 and
//   bloom stops being able to tell a window from a sheet of paper.
// · **The grade last, and alone.** See `ps2-grade.ts` — it is exposure, tone
//   map, definition, colour, output encode and the era's own artefacts in one
//   trip through the framebuffer, because every extra fullscreen pass is
//   another full read and write of the screen.
//
// WHAT ROUND 5 ADDED — three effects the player picked off a menu, and the
// through-line is that not one of them buys a render target:
//
// · **LENS DIRT** (`lens-dirt.ts`, and four lines of `ps2-grade.ts`). Specks,
//   scratches and smears that light up when the bloom does, because they ARE the
//   bloom: the plate multiplies the bloom's own composite and the product is
//   added back. Dirt you can see on a dark frame is the failure mode of this
//   effect and this form of it cannot produce one — no light in shot, nothing
//   for the grime to be made of. Costs a 2.36 MB texture on the rungs that
//   compile it, two fetches, and no pass.
// · **DISTANCE BLUR** (`distance-blur.ts`). The far end of the block goes soft.
//   It is keyed on the map's OWN fog curve read live out of the scene, which is
//   what makes the hard constraint structural instead of tuned: the skater sits
//   between 1.2 m and 7.5 m of boom, the street's fog does not start until 14 m,
//   and inside the fog's near plane the effect cannot express a non-zero value.
//   Its depth comes from the AO's prepass — already drawn, on the one rung that
//   draws it — so it costs zero megabytes and zero extra draws of the scene.
// · **RENDER SCALE** (`RENDER_SCALES`, and `syncSize` below). The PS2 reading of
//   "pixelating": an internal resolution and an upscale, the way the hardware
//   actually did it, rather than a mosaic filter laid over a full-resolution
//   frame — which is the PS1 reading and a fail condition here. It is the one
//   effect in the round that makes the game CHEAPER, and it is off everywhere
//   until asked for.
//
// WHAT ROUND 4 ADDED, and note that it did NOT add a stage: the light shafts
// live INSIDE the grade, above its tone map, rather than as a pass of their
// own. The textbook build of that effect is a half-resolution target plus a
// composite, and the last mobile preflight came back at ~870 MB against a
// <700 MB budget, so the price of admission was zero bytes and zero extra
// reads of the screen. What it costs instead is texture fetches on the two
// presets that compile it — see the note above `PRESET_SPECS` for the tap
// counts and the strengths, and `ps2-grade.ts` for why a radial gather with no
// occlusion buffer is not a shortcut but the way the era actually did it.
//
// The other half of round 4 is not post at all and is called out here because
// it is wired into this module's `render`: `body-shine.ts`, which takes the
// character's "super shine" down. That shine was never in this chain — the
// generated rig ships with its albedo wired into the emissive slot at full
// strength — and the bloom was only ever drawing a halo around something that
// had already blown. Read that file before reaching for a knob in this one the
// next time something in the frame is too bright.
//
// WHAT ROUND 3 ADDED, AND WHY IT IS A STAGE AND NOT A TUNING PASS. The same
// plaza concrete measured display L 0.784 facing down the main line and L 0.089
// facing the shaded spawn corner — an 8.8x swing in one material from heading
// alone, blown at one end and tarred at the other. Neither number was a bug in
// the scene: that corner really is in the building's cast shadow. The bug was
// that one fixed exposure and a curve tuned against one remembered frame were
// being asked to serve both, so the game had a look only while the sun was in
// shot. A camera answers that by metering and so does an eye, and that is now a
// stage in this chain rather than a constant in a file. See `metering.ts` for
// the four decisions inside it (log-average, ground-weighted, PARTIAL
// adaptation, asymmetric time constants) and `ps2-grade.ts` for the curve
// rebuild that stopped clipping the ends the meter now hands it.
//
// WHAT THIS STACK CANNOT FIX, said plainly so nobody tunes the post trying: a
// **highlight that was never rendered**. Post owns range, definition, and the
// colour difference between shade and sun; it does not own where the light hits.
// The world lane has since given the metal and the glass real specular
// parameters (`props.ts` runs the handrails at roughness 0.32 / metalness 0.85
// and the shopfront glass at 0.18 / 0.3) and moved the key to 3.1 against a cool
// 0xa9b1bd haze, and the frame changed more from those three numbers than from
// anything in this file. What is still flat in a capture is the broad rough
// ground — plaza and quarter-pipe transition run at roughness 0.94–0.98 with
// `scene.environmentIntensity` at 0.34, which is a surface with nothing to
// reflect at any angle — and that separation has to come from light and
// geometry, not from a grade.
//
// Two more surfaced the moment the metering started exposing the shaded
// headings properly, and both are world-lane numbers this file cannot reach:
// the FOG, which is now the brightest thing in every frame the sun is not in
// (the shaded-heading captures put 3.3–3.8% of the frame above L 0.92 and
// essentially all of it is the haze band across the top), and the ground's
// single albedo, which no amount of local contrast turns into two materials.
// This lane's report names both with the measurements.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import type { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import type { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { getQualitySetting, isPhoneTier, type QualityTier } from "../controllers/quality/tier";
import { createBodyShine } from "./body-shine";
import { createDistanceBlur, type DistanceBlur, type DistanceBlurSpec } from "./distance-blur";
import { createLensDirt, type LensDirt } from "./lens-dirt";
import { attachBloomExposure, createExposureMeter } from "./metering";
import { createMotionBlur, type MotionBlur, type MotionBlurSpec } from "./motion-blur";
import {
  BLOOM_KNEE,
  bloomThreshold,
  createGradePass,
  setGradeDirt,
  updateGradeFrame,
  updateGradeSun,
  type GradeLook,
} from "./ps2-grade";

/** The picker's options, coarsest first. */
export const PRESETS = ["low", "medium", "high"] as const;
export type PresetName = (typeof PRESETS)[number];

/**
 * THE RENDER SCALE — the fraction of the canvas the SCENE is drawn at before it
 * is scaled up to the display. Coarsest last, and 1 first because that is the
 * default at every tier.
 *
 * ── THIS IS THE PS2 READING OF "PIXELATING", AND THE PS1 ONE IS A FAIL ──────
 *
 * The ask was "try some pixelating", and there are two things that could mean.
 * A mosaic filter over a full-resolution frame — snap the UV to a coarse grid,
 * or posterise the frame into blocks — is the PS1 one, and it is a fail
 * condition for this project for the same reason vertex wobble and 128px mud
 * are: it is a costume worn over a modern frame, it costs a pass and buys
 * nothing, and it reads as an Instagram filter rather than as a console.
 *
 * What the hardware actually did is not a filter at all. A PS2 rendered into a
 * framebuffer of about 640x448 and the video hardware scaled that to the
 * display; the SOFTNESS was the whole artefact, and it was an artefact of the
 * machine's budget rather than of anything drawn on top. So that is what this
 * is: the composer's internal buffers shrink, the last pass still draws to the
 * full canvas, and the upscale is the GPU's own bilinear filter — which is what
 * a composite video path did to a 640-wide signal anyway.
 *
 * The numbers are picked on that:
 * · **0.55** at 1280x800 is **704x440**, which is within 3% of the console's own
 *   640x448 on both axes. This rung is the actual period reference, and it is
 *   the reason 0.55 is here rather than a rounder 0.5 (640x400, correct across
 *   and 11% short down).
 * · **0.75** is 960x600 — a half-step, for a player who wants the softness
 *   without the era.
 * · **1** is off, and off is where it starts everywhere (`PRESET_SPECS` does not
 *   carry this field at all — see `setRenderScale`). It is an experiment the
 *   player asked to LOOK at, not a decision this lane made for the game.
 *
 * It is also the one effect in this round that makes the game CHEAPER. Every
 * composer target, the MSAA on it, the bloom's whole mip chain and the scene's
 * own rasterisation all scale with the square of this number.
 *
 * NEAREST would be the wrong filter and is not offered: a hard-edged upscale is
 * exactly the mosaic look the first paragraph rules out, arrived at from the
 * other direction. The HUD is untouched either way — it is DOM over the canvas,
 * has never been in this chain, and stays at native resolution while the game
 * behind it does not, which is precisely the split a PS2 title had between its
 * framebuffer and its scaler.
 */
export const RENDER_SCALES = [1, 0.75, 0.55] as const;

/**
 * ── TEMPORARY: THE TUNING PANEL'S WINDOW INTO THE LIVE CHAIN ────────────────
 *
 * The player asked for an in-game panel he can drag numbers on and paste the
 * result back, and a panel that cannot reach the passes cannot change the
 * picture. This is the whole of the seam — the objects, not a copy of their
 * settings, so a slider writes a uniform and the next frame is different.
 *
 * It is built to be DELETED. When the numbers come back and land in
 * `PRESET_SPECS` and `COLOUR`, this interface, the `passes` and `tuning`
 * members of `LookStack`, the four lines that fill them in, and
 * `src/ui/look-lab.ts` go together and nothing else in the tree changes —
 * nothing but the panel ever reads any of it.
 */
export interface LookPasses {
  grade: ShaderPass;
  bloom: UnrealBloomPass;
  /** `null` on every rung but the showcase — see `aoFor`. */
  ao: GTAOPass | null;
  motion: MotionBlur | null;
  blur: DistanceBlur | null;
  /** Which optional grade stages this preset actually COMPILED, so the panel
   *  can grey out a slider whose `#define` is not in the program. */
  defines: Record<string, unknown>;
  /** The exposure meter's adaptation uniforms — see `metering.ts`. */
  meter: Record<string, THREE.IUniform>;
}

/** TEMPORARY — see `LookPasses`. Values `render()` consults every frame, so
 *  the panel can move things the chain otherwise recomputes for itself. */
export interface LookTuning {
  /**
   * Where bloom starts, in the grade's own post-exposure units. `render()`
   * turns it back into the scene-linear knee every frame, which is why it has
   * to live here rather than being written straight onto the pass — a write to
   * `bloom.threshold` would be overwritten by the next frame.
   */
  bloomKnee: number;
}

export interface LookStack {
  /** Draw the frame. Replaces `renderer.render(scene, camera)` outright. */
  render(delta: number): void;
  /** TEMPORARY — see `LookPasses`. A getter: a preset swap rebuilds them all. */
  readonly passes: LookPasses;
  /** TEMPORARY — see `LookTuning`. */
  readonly tuning: LookTuning;
  /** Swap the quality preset at runtime — the settings picker calls this. */
  setPreset(name: PresetName): void;
  /**
   * Re-read the persisted per-device Quality setting (`tier.ts`'s
   * `getQualitySetting`) and apply it. This is the ONE call a settings screen
   * needs after it writes `setQualitySetting(...)`: the picker's four options
   * are Auto / Low / Medium / High and only three of them name a preset, so a
   * picker that called `setPreset` directly would have nothing to pass for Auto.
   */
  refreshFromSetting(): void;
  /** The preset currently in force. */
  readonly preset: PresetName;
  /**
   * The governor's post rung. `false` drops straight to `renderer.render()` —
   * the renderer still carries the same ACES and the same exposure, so the
   * picture goes ungraded, not wrong. It also goes UNMETERED: the meter's pass
   * lives in the chain and the gain never crosses to the CPU to be held on to,
   * so this rung gives back the flat-exposure game the metering exists to
   * replace. That is the trade at the only moment it fires — four sustained
   * seconds over budget on a machine already dropping frames. This is
   * deliberately NOT the same thing as `setPreset("low")`: the governor is
   * rescuing a machine, where the picker is a player choosing a look.
   */
  setPostEnabled(enabled: boolean): void;
  /**
   * The internal render scale — one of `RENDER_SCALES`. 1 is off and is where
   * every tier starts. Cheap: it re-sizes the chain's existing targets rather
   * than rebuilding them, so it can be dragged live from a settings screen.
   */
  setRenderScale(scale: number): void;
  /** The scale currently in force, so a picker can show which rung is lit. */
  readonly renderScale: number;
  /**
   * The lens dirt's own switch, independent of the preset. On the presets that
   * did not compile the block (`low`) this has nothing to turn on and says so
   * by returning `false`.
   */
  setLensDirt(on: boolean): boolean;
  /**
   * Swap the dirt plate — a generated PNG's URL, or `null` for the procedural
   * one. One line, because a re-generated plate is a new URL and nothing else.
   */
  setLensDirtPlate(url: string | null): void;
  /**
   * The distance blur's own switch. `false` back means this chain has no blur
   * pass to switch — it rides the AO's depth prepass and therefore exists only
   * where the AO does (see `blurFor`).
   */
  setDistanceBlur(on: boolean): boolean;
  /** Viewport changed. */
  resize(width: number, height: number): void;
  dispose(): void;
}

interface BloomSpec {
  strength: number;
  radius: number;
  /**
   * Fraction of the composer's resolution the bloom's own mip chain is built
   * at. Bloom is the lowest-frequency thing in the whole image — it is five
   * successive blurs — so it does not need the framebuffer's resolution to look
   * right, and every pixel taken off here is taken off eleven separate
   * fullscreen draws. This is what makes bloom affordable on a phone at all
   * rather than the thing a phone has to go without.
   */
  resolutionScale: number;
}

interface PresetSpec {
  /** MSAA samples on the composer target — AA under post comes from here. */
  samples: number;
  /** Ground-contact darkening. The most expensive item in the file. */
  ao: boolean;
  bloom: BloomSpec;
  /**
   * The shutter. `null` means the pass is never built — not built and disabled,
   * not built and running at zero strength: `low` does not allocate it, does
   * not compile it and does not pay the read-and-write of the screen that even
   * an identity fullscreen pass costs.
   */
  motion: MotionBlurSpec | null;
  /**
   * The far-field defocus. `null` means the pass is never built, and on the two
   * cheap rungs it could not be built anyway: it reads the depth GTAO's own
   * prepass renders, and where there is no AO there is no depth in this chain
   * to key it on. See `blurFor` and the header of `distance-blur.ts`.
   */
  blur: DistanceBlurSpec | null;
  grade: GradeLook;
}

/**
 * The three presets.
 *
 * They differ ONLY in what the machine has to do, never in what the game is:
 * every colour operation — the tone curve, the split, the vibrance, the
 * vignette, the quantise, the definition pass — lives in `ps2-grade.ts` and is
 * byte-identical on all three. That is not decoration, it is the point: round 2
 * caught the presets diverging on knobs that compile to identical work, which
 * bought no frames and handed phones a harsher, flatter game for free.
 *
 * What is left varies because it genuinely costs, and the exposure meter is on
 * everywhere for exactly that test: three draws totalling about 70k texture
 * fetches, against a million for one fullscreen pass, and it is the difference
 * between the game having an image and having two.
 * · **low** — no MSAA, no AO, no shutter, a bloom built at half the composer's
 *   resolution, and the tight sharpen ring only. One render target, one blur
 *   chain a quarter of the area of the screen, one fullscreen pass. It keeps
 *   the game's whole colour, its metered exposure and its highlight glow,
 *   because the glow is most of what makes a surface read as lit and it is the
 *   cheapest thing in the chain by a distance.
 * · **medium** — 2× MSAA, a wider bloom at three-quarter resolution, edge
 *   fringing, the wide definition ring, and a five-tap shutter. The
 *   weak-desktop tier.
 * · **high** — the showcase: 4× MSAA, GTAO, the full-resolution bloom and the
 *   eight-tap shutter.
 *
 * THE SHUTTER NUMBERS, since "subtle" is a word and these are not. Every one of
 * them came off captures of the same run rather than off a preference, and the
 * unit is UV of streak at the 60 fps `motion-blur.ts` normalises to:
 *
 * · **Straight down the main line at 59 km/h**, which is where the effect earns
 *   its keep, the ground two metres under the camera and about six out asks for
 *   `radius × 16.4/6` per second — 1.33 screen-widths a second at the bottom
 *   corner, or 0.0078 UV of streak at 0.35 shutter. Ten pixels, falling to
 *   nothing by the middle of the frame and to nothing at all on the facade
 *   ninety metres up the road. That is the whole effect on a straight line, and
 *   the first capture with it in was almost sharp — which is the correct amount
 *   for "modern", because a skate line has to stay readable.
 * · **A hard carve measured 4.3 screen-widths a second**, six times that, which
 *   is why `maxBlur` is a soft knee rather than a ceiling (see `motion-blur.ts`)
 *   and why it is set as low as 0.011: through the knee those 0.025 UV come back
 *   as 0.0077, so a carve and the fastest straight-line ground streak land at
 *   the same ten pixels and the turn sweeps the frame instead of smearing it.
 *   The hard-clamped first cut of this ran at 0.02 and the capture of that carve
 *   is the reason both numbers moved: the plaza and a facade forty metres behind
 *   it came back with the same 25 px of smear, because both had saturated.
 * · **`medium` runs the same effect quieter** — 0.3 and 0.008 — because five
 *   taps over a long streak is where a blur stops being a blur and starts being
 *   a row of ghosts, so the tap count and the length come down together. Eight
 *   taps over the 14 px the high knee asymptotes to is a tap every 1.8 px, and
 *   the shader's own jitter covers the rest.
 */
const PRESET_SPECS: Record<PresetName, PresetSpec> = {
  low: {
    samples: 0,
    ao: false,
    bloom: { strength: 0.26, radius: 0.35, resolutionScale: 0.5 },
    motion: null,
    blur: null,
    grade: { fringe: 0, definition: 0, dirt: false, shafts: 0, shaftSamples: 0 },
  },
  medium: {
    samples: 2,
    ao: false,
    bloom: { strength: 0.29, radius: 0.4, resolutionScale: 0.75 },
    motion: { taps: 5, shutter: 0.3, maxBlur: 0.008 },
    blur: null,
    grade: { fringe: 0.0025, definition: 0.3, dirt: true, shafts: 1, shaftSamples: 10 },
  },
  high: {
    samples: 4,
    ao: true,
    bloom: { strength: 0.32, radius: 0.45, resolutionScale: 1 },
    motion: { taps: 8, shutter: 0.35, maxBlur: 0.011 },
    blur: { taps: 6, radius: 0.03 },
    // `shafts: 1.2` and not 0 — see "THE SHAFTS" below, which had been quoting
    // 1.2 against `medium`'s 1.0 as measured arithmetic while the table itself
    // said 0. A 0 here does not turn the effect down, it stops `ps2-grade.ts`
    // COMPILING the block (`look.shafts > 0 && look.shaftSamples >= 2`), so the
    // sixteen taps beside it were sixteen taps of a gather that did not exist:
    // god rays were OFF on the showcase rung and ON on the rung below it, which
    // is the one shape the preset table is never allowed to take.
    grade: { fringe: 0.003, definition: 0.34, dirt: true, shafts: 1.2, shaftSamples: 16 },
  },
};

/**
 * ROUND 5'S TWO NEW ROWS IN THAT TABLE, and what each of them is priced in.
 *
 * · **`dirt`** is a boolean, and it is on the same rungs the fringe is on for
 *   the same reason: it is priced per FETCH — two of them, the bloom's own
 *   composite and the plate — and `low` is the rung that pays for no stage
 *   priced that way. What it costs in MEMORY is the plate, and only on the
 *   rungs that ask for it: the generated 1024x576 image with mipmaps switched
 *   off is 2.36 MB, and `low`-only sessions never build it, never fetch it and
 *   never upload it (`lens-dirt.ts` is constructed lazily below). The gain and
 *   the plate are identical wherever the block compiles — see `GradeLook.dirt`
 *   on why this one field is a switch and not a strength.
 * · **`blur`** is on `high` alone, and that is a DEPENDENCY rather than a
 *   preference. It needs a per-pixel depth; GTAOPass already draws one, into
 *   its own `normalRenderTarget`, before it does anything else, and hands it out
 *   as `pass.depthTexture`. Reading it costs zero megabytes and zero draws.
 *   Buying depth for the other two rungs does not: a `DepthTexture` on the
 *   composer's target is free on `low` (it replaces the depth renderbuffer that
 *   is already there) but on `medium` MSAA needs a multisampled depth buffer AND
 *   a single-sample texture to resolve into — a new full-resolution depth
 *   surface, 4.1 MB at 1280x800, on the rung that exists to protect a device
 *   already at ~870 MB against a <700 MB budget. Six taps at two fetches each is
 *   the fill cost, and it is only paid on the pixels past forty metres — see the
 *   branch in `distance-blur.ts`, which is coherent in screen space.
 *
 * Neither row moves the game's COLOUR, which is the rule the table has followed
 * since round 2: the tone curve, the split, the vibrance, the vignette, the
 * quantise and the definition pass are byte-identical on all three.
 */

/**
 * THE SHAFTS, and where they sit in the preset table above.
 *
 * They are the one thing round 4 ADDED to the chain, and they are here rather
 * than in a pass of their own for the reason `ps2-grade.ts` gives at length:
 * the textbook build wants a half-resolution target and a composite, and this
 * build's last mobile preflight came back at ~870 MB against a <700 MB budget,
 * so the effect had to be free in megabytes or not happen. Folded into the
 * grade it costs SHAFT_SAMPLES texture fetches and nothing else — no target, no
 * extra read and write of the screen, no second tone map.
 *
 * `low` is 0 and therefore does not compile the block at all. That is the same
 * rule the fringe and the wide definition ring already follow: the cheapest rung
 * pays for no stage that is priced per fetch. It is also the rung with no MSAA
 * and the lowest DPR, and a ten-tap radial gather is the one effect in the chain
 * that would show its own sampling on a screen that cannot resolve it.
 *
 * `medium` takes ten taps and `high` sixteen for the same reason the shutter
 * runs five and eight: the gather walks 62% of the way back to the sun, and a
 * shaft that crosses a third of the screen on ten taps is a tap every 40-odd
 * pixels. Below about ten the IGN jitter stops being able to hide the rings and
 * the shaft reads as a fan of separate spokes; above sixteen the picture stops
 * changing and the fetches do not.
 *
 * The STRENGTH difference between them is arithmetic and not taste, which is
 * the same rule the rest of this table follows — the presets differ in what the
 * machine does, never in what the game is. The gather divides by its own tap
 * count, but the weights decay at 0.94 a step, so ten taps sum to 0.766 of a
 * flat average where sixteen sum to 0.652: the SAME strength number would draw
 * an 18% brighter shaft on the cheaper rung. 1.0 against 1.2 is that ratio,
 * and it makes the two presets land on the same picture.
 *
 * WHAT 1.2 IS, measured, since it was picked off captures at 0, 1.2 and 2.5 of
 * the identical shot — the plaza looking west into the low sun, the one heading
 * this effect exists for. Differenced against 0, the shaft term reaches 61% of
 * the frame and averages 8.5/255, and the shape of it in the difference image is
 * the thing worth having: a fan of soft streaks radiating out of the point where
 * the sun sits behind the north-west roofline, laid across the cloud deck.
 * 2.5 was captured too and rejected, for a reason that matters more than the
 * sky: at that strength the gather is bright enough that a BACKLIT SKATER picks
 * up a rim of sky along his whole silhouette. That is the correct physics — it
 * is the air in front of him scattering — and it is also the exact halo round 4
 * had just spent its other half taking off the character (see `body-shine.ts`),
 * so it is turned down until the atmosphere is in the sky where it belongs and
 * the silhouette stays solid.
 */

/**
 * How far outside the frame the sun is still allowed to throw a shaft, as a
 * fraction of the half-diagonal from the centre of the screen.
 *
 * The unit: the sun's distance from the centre of the frame in screen UV,
 * doubled, so 1.0 is the middle of an edge and 1.41 is a corner — and because
 * UV is normalised, it means the same thing on a phone in portrait and a
 * monitor in landscape without an aspect term.
 *
 * It has to run well past 1.0 and that is the whole point of having a number
 * here: a sun sitting just off the top of the frame is exactly when god rays
 * are at their best — the rays are in shot and the source is not — and a
 * falloff that ended at the frame edge would switch the effect off at the one
 * camera angle it exists for. Smoothstepping between these two is also what
 * stops the shafts arriving with a pop as the camera swings round: 1.0 to 2.4
 * is a little over a third of a second of fade at the rate a hard carve turns
 * the chase camera.
 */
const SHAFT_FADE_IN = 1;
const SHAFT_FADE_OUT = 2.4;

/** How far down the sun's direction the projected point is put, in metres. A
 *  directional light has no position, so any point far enough down the ray
 *  projects to the same pixel; 4 km is past every far plane in the game. */
const SUN_DISTANCE = 4000;

/**
 * Which preset a session STARTS on.
 *
 * The player's own persisted choice wins outright and maps one-to-one — this is
 * the fix for round 2's dead middle rung. `detectTier()` folds the setting into
 * a TIER (`medium` → `TIERS.phone`), which is the right thing for DPR, shadow
 * maps and asset rungs but is lossy for the look: a player who picked Medium
 * came out on a phone tier whose `postLevel` is `'light'`, and the light rung
 * means preset `low`. Two of the three settings rendered the same picture and
 * the middle preset was unreachable on any machine. Reading the setting
 * directly, alongside the tier rather than through it, is what makes all three
 * reachable.
 *
 * On `auto` the tier decides, because `postLevel` is literally "how much of the
 * stack can this machine afford". `desktop-low` is the one machine the two
 * signals disagree about: a real desktop with a weak iGPU, so it gets the middle
 * rung instead of the phone's.
 */
function startingPreset(tier: QualityTier): PresetName {
  const setting = getQualitySetting();
  if (setting === "low") return "low";
  if (setting === "medium") return "medium";
  if (setting === "high") return "high";

  if (tier.postLevel === "full") return "high";
  if (tier.postLevel === "light") return tier.name === "desktop-low" ? "medium" : "low";
  return "low";
}

/**
 * The two places the DEVICE still gets a veto over the preset the player asked
 * for, because both are memory-class costs and a phone that runs out of memory
 * does not get uglier, it gets killed.
 *
 * MSAA on a half-float target multiplies the largest allocation in the game;
 * `tier.composerSamples` is the kit's own answer for how much of that this
 * machine can hold, and it is read rather than second-guessed. The one place
 * this stack goes past it is a tier that says 0 but is not a phone-class tier —
 * `desktop-low` — where 2× is affordable and the difference between a jagged and
 * a clean edge at DPR 1.5 is large.
 *
 * That exception used to be written as `Math.max(tier.composerSamples, 2)`,
 * which is not "desktop-low is the exception", it is "every tier gets a floor of
 * 2". `TIERS.phone` carries `composerSamples: 0` deliberately, so a phone whose
 * player picked Medium would have taken 2× MSAA on the half-float target — the
 * one allocation this comment exists to protect. It is named explicitly now.
 *
 * GTAO is a second full draw of the scene plus a depth and a normal buffer. A
 * player on a phone may ask for the showcase; the phone is still allowed to
 * decline the one pass that doubles the scene's geometry cost.
 */
function samplesFor(spec: PresetSpec, tier: QualityTier): number {
  if (tier.postLevel === "off") return 0;
  const cap = tier.name === "desktop-low" ? Math.max(tier.composerSamples, 2) : tier.composerSamples;
  return Math.min(spec.samples, cap);
}

/**
 * What `postLevel: 'off'` means here, said out loud because it is not what the
 * kit's wording suggests. It zeroes MSAA above and it pins the preset to `low` —
 * but it does NOT bypass the chain, and that is deliberate: what is left on
 * `low` is one half-float target (a few megabytes at DPR 1), a blur chain built
 * at a quarter of the screen, and one fullscreen pass, which is less than the
 * shadow map the same tier still budgets. Bypassing it would not save a
 * phone-class device anything it can feel, and it WOULD hand that device a game
 * with none of this game's colour in it. The governor's post rung is the thing
 * that turns the chain off, and it fires on measured frame times rather than on
 * a guess made at boot from a GPU string.
 */


function aoFor(spec: PresetSpec, tier: QualityTier): boolean {
  return spec.ao && tier.postLevel === "full";
}

/**
 * The distance blur's gate, and it is written as `aoFor(...)` rather than as a
 * tier test of its own ON PURPOSE. The pass does not have a quality opinion; it
 * has a dependency. Its depth comes out of the AO's prepass, so the honest
 * expression of "when does this run" is "when that prepass runs" — and a phone
 * whose player forced the showcase preset declines the AO (see `aoFor`), which
 * has to take the blur with it or the pass would be sampling a depth texture
 * nobody rendered into.
 */
function blurFor(spec: PresetSpec, tier: QualityTier): DistanceBlurSpec | null {
  return spec.blur && aoFor(spec, tier) ? spec.blur : null;
}

/**
 * The lens dirt's veto, and it is the ONE memory-class rule of the three new
 * effects: the plate is 2.36 MB of texture. `postLevel: 'off'` — `phone-low`,
 * the DPR-1 floor — declines it, because that tier's whole chain is one buffer,
 * one small blur chain and one fullscreen pass, and a player who has been put on
 * it by a device check is not the player to spend two and a third megabytes and
 * two fetches on a lens artefact for.
 *
 * Every other tier keeps it if the preset asked, including `phone` — the dirt is
 * cheap enough that the middle rung is worth having on a phone that chose it,
 * which is the same call `motionFor` makes about the shutter one line up.
 */
function dirtFor(spec: PresetSpec, tier: QualityTier): boolean {
  return spec.grade.dirt && tier.postLevel !== "off";
}

/**
 * The DEVICE's veto on the shutter, and it is a fill veto rather than a memory
 * one — the pass allocates nothing at all (see `motion-blur.ts`), so the two
 * memory-class rules above do not apply to it and it is not written as if they
 * did. What it costs is one more read and write of every pixel plus its taps,
 * which is the one currency a phone has least of.
 *
 * `postLevel: 'off'` — `phone-low`, the DPR-1 floor — gets none: that tier's
 * whole chain is already one buffer, one small blur chain and one fullscreen
 * pass, and this would be a 20% increase in its post budget for an effect it
 * will not resolve at that resolution anyway.
 *
 * `postLevel: 'light'` — `phone` and `desktop-low` — is capped at the middle
 * rung's five taps however high the player set the picker. Eight taps over a
 * 585×1266 phone frame is 5.9M fetches against five taps' 3.7M, and a streak
 * that asymptotes to fourteen pixels is not a thing a 6" screen can tell two
 * sampling rates apart on. This is the same shape as `samplesFor`'s MSAA cap:
 * the player picks the look, the device keeps a veto over the parts of it that
 * are priced per pixel.
 */
function motionFor(spec: PresetSpec, tier: QualityTier): MotionBlurSpec | null {
  if (!spec.motion) return null;
  if (tier.postLevel === "off") return null;
  if (tier.postLevel === "light") return { ...spec.motion, taps: Math.min(spec.motion.taps, 5) };
  return spec.motion;
}

/** Everything one preset allocates, so swapping presets frees all of it. */
interface Chain {
  composer: EffectComposer;
  passes: Pass[];
  grade: ShaderPass;
  bloom: UnrealBloomPass;
  /** `null` on `low` and on `phone-low` — see `motionFor`. */
  motion: MotionBlur | null;
  /** `null` on every rung without the AO's depth prepass — see `blurFor`. */
  blur: DistanceBlur | null;
  /** Whether the grade compiled the dirt block, so the switch can say so. */
  dirt: boolean;
  /** TEMPORARY — kept only so the tuning panel can reach the AO's knobs. */
  ao: GTAOPass | null;
}

const drawSize = new THREE.Vector2();
const cssSize = new THREE.Vector2();

/**
 * Build the stack. The player's persisted Quality setting picks the preset when
 * they have made a choice; the tier picks it when they have not (a phone starts
 * on `low`). Either way the picker can change it later through
 * `refreshFromSetting()`.
 */
export function createLookStack(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  tier: QualityTier,
): LookStack {
  let preset: PresetName = startingPreset(tier);
  let enabled = true;
  let lastWidth = 0;
  let lastHeight = 0;
  let lastRatio = 0;
  let lastScale = 0;
  /**
   * The internal render scale. 1 — off — at every tier and on every preset, and
   * it is deliberately NOT in `PRESET_SPECS`: it is an experiment the player
   * asked to look at rather than a decision about what the game is, so nothing
   * can switch it on except somebody asking for it. See `RENDER_SCALES`.
   */
  let renderScale = 1;
  /** The size of the buffers the chain is actually drawing at — the drawing
   *  buffer times the render scale. What the grade's texel steps are quoted in. */
  let bufferWidth = 0;
  let bufferHeight = 0;
  let dirtOn = true;
  let blurOn = true;
  /**
   * Phone-only shadow cadence. The sun never moves and the block never moves;
   * the only genuinely dynamic caster is the skater. On phone tiers the shadow
   * map re-renders every SECOND frame instead of every frame, halving the
   * pass's amortised cost (the ~170-draw shadow rasterisation is the single
   * biggest per-frame geometry cost on a phone). Desktop is untouched — this
   * counter never gates anything off a phone tier.
   *
   * The honest artefact: the skater's own contact shadow lags one extra frame
   * (~16 cm at cruise on a 30 fps phone-low). His shadow stays under the
   * board; it just arrives a frame late.
   */
  let shadowTick = 0;
  const phoneShadow = isPhoneTier(tier);

  /**
   * The lens plate, built LAZILY and then kept.
   *
   * Lazily because it is the one of round 5's three effects that costs
   * megabytes — 2.36 MB of texture plus a network fetch — and a session that
   * spends all of itself on `low` must never pay for it. Kept because it
   * outlives the chain for the same reason the meter does: a trip to the
   * settings screen rebuilds every pass in the composer, and re-fetching the
   * plate each time would be a network round trip and a fresh GPU upload for an
   * image that has not changed.
   */
  let dirt: LensDirt | null = null;
  const dirtPlate = (): THREE.Texture => (dirt ??= createLensDirt()).texture;

  // The meter outlives the chain on purpose. It owns no screen-sized memory and
  // no preset knob — every offset in its reduction shaders is in output-texel
  // units, so it never resizes and never needs rebuilding — and keeping one
  // instance across preset swaps is what stops a trip to the settings screen
  // resetting the adaptation and sliding the exposure back up from scratch. Its
  // pass is inserted into whatever chain is current; the chain's own disposal
  // calls `pass.dispose()`, which is deliberately a no-op, and this module
  // disposes the meter itself.
  const meter = createExposureMeter();

  // The one thing in this module that is not post — see `body-shine.ts` for
  // why the character's "super shine" is an asset defect rather than a bloom
  // artefact, and why this lane is the one that can reach it. It outlives the
  // chain for the same reason the meter does: the body survives a spot change
  // and a preset swap, so the bookkeeping that tamed it has to as well.
  const bodies = createBodyShine(renderer, scene);

  // ── THE SHAFTS' AIM ───────────────────────────────────────────────────────
  //
  // The gather in `ps2-grade.ts` needs one thing this module has to work out
  // for it: where the sun is on screen. It is found in the scene rather than
  // handed in, because the only module that holds the key light is the MAP
  // (`field.ts`, `spillway.ts`) and the only seam between a map and this stack
  // is `main.ts`, which is not this lane's file to add a wire to.
  //
  // Finding it is not a per-frame traversal. A light that is still parented is
  // still the map's key light, so the common frame is one property read; a
  // spot change is what makes it null, because `maps.ts` unmounts by diffing
  // `scene.children` and removes exactly the nodes the map added — the key
  // light among them. The child-count guard underneath that is the case where
  // there is no directional light to find at all: without it a map lit by
  // hemisphere alone would re-walk the whole graph sixty times a second
  // looking for one.
  let sun: THREE.DirectionalLight | null = null;
  let sunScanChildren = -1;
  const sunDir = new THREE.Vector3();
  const sunNdc = new THREE.Vector3();

  const findSun = (): void => {
    if (sun && sun.parent) return;
    if (scene.children.length === sunScanChildren) return;
    sunScanChildren = scene.children.length;
    let best: THREE.DirectionalLight | null = null;
    scene.traverse((object) => {
      const light = object as THREE.DirectionalLight;
      // Brightest wins. A map carrying a key and a weak second directional as
      // a bounce fill would otherwise throw its shafts from whichever one the
      // traversal happened to meet first.
      if (light.isDirectionalLight && (!best || light.intensity > best.intensity)) best = light;
    });
    sun = best;
  };

  /**
   * Point the grade's gather at the sun and decide how much of it to draw.
   * Called only on the presets that compiled the block — on `low` the whole of
   * this, including the traversal, never runs.
   */
  const aimShafts = (strength: number): void => {
    findSun();
    if (!sun) {
      updateGradeSun(chain.grade, 0.5, 0.5, 0);
      return;
    }
    // A directional light has no position — `sun.position` is a direction with
    // a radius stuck on it. So what gets projected is a point far down that ray
    // from the CAMERA, which lands on the pixel the disc would occupy.
    sunDir.copy(sun.position).sub(sun.target.position).normalize();
    sunNdc.copy(camera.position).addScaledVector(sunDir, SUN_DISTANCE).project(camera);
    // `project()` does the perspective divide, and a point behind the camera
    // comes back with both axes flipped — a sun at your back would throw its
    // shafts out of the opposite corner, which is the one artefact of this
    // technique a player would be able to name. NDC z past the far plane is the
    // exact test for it and costs nothing.
    if (sunNdc.z > 1) {
      updateGradeSun(chain.grade, 0.5, 0.5, 0);
      return;
    }
    const u = sunNdc.x * 0.5 + 0.5;
    const v = sunNdc.y * 0.5 + 0.5;
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const t = Math.min(Math.max((d - SHAFT_FADE_IN) / (SHAFT_FADE_OUT - SHAFT_FADE_IN), 0), 1);
    updateGradeSun(chain.grade, u, v, strength * (1 - t * t * (3 - 2 * t)));
  };

  const buildChain = (name: PresetName): Chain => {
    const spec = PRESET_SPECS[name];
    renderer.getDrawingBufferSize(drawSize);
    renderer.getSize(cssSize);
    // Every target in this chain is allocated at the SCALED size, not the
    // drawing buffer's. `syncSize` would resize them on the next frame anyway
    // (it re-measures whenever the scale moves), but building them right means a
    // preset swap taken while the scale is down never allocates the full-size
    // set for one frame — and the full-size set is the largest allocation in the
    // game.
    const bw = Math.max(1, Math.round(drawSize.x * renderScale));
    const bh = Math.max(1, Math.round(drawSize.y * renderScale));

    // Every anti-aliased edge in the game comes from THIS target's sample
    // count, not from the WebGL context's: the composer never reads the default
    // framebuffer, so context MSAA multisamples a buffer nothing looks at.
    // (`rendererAntialias(tier, willRunPost)` in `tier.ts` exists precisely to
    // say so, and `main.ts` now passes `true` — the note that used to sit here
    // saying otherwise was stale and has been checked against the boot.)
    // Half-float because the passes downstream need the highlights that sit
    // above 1.0; depth because the AO pass reads it; no stencil because
    // nothing in this game masks.
    const target = new THREE.WebGLRenderTarget(bw, bh, {
      type: THREE.HalfFloatType,
      samples: samplesFor(spec, tier),
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.name = "look:scene";

    const composer = new EffectComposer(renderer, target);
    // ── NEVER RESOLVE THESE TARGETS' DEPTH. Nothing reads it. ───────────────
    //
    // `samples > 0` makes three blit the multisampled renderbuffer down to the
    // target's single-sample textures at the end of EVERY `renderer.render()`
    // into it (`updateMultisampleRenderTarget`, three r185 `three.module.js`
    // ~13283 — there is no early-out), and by default `mask` carries
    // DEPTH_BUFFER_BIT as well as COLOR. This chain writes a composer target
    // six times a frame (RenderPass, GTAO's copy and its AO blend, the distance
    // blur, the shutter, bloom's additive pass), so that is six full-resolution
    // depth resolves at the buffer's size — 2560x1600 on a Retina desktop.
    //
    // Measured on this machine: the driver does NOT expose
    // `WEBGL_multisampled_render_to_texture`, so the blits are real rather than
    // implicit, and switching the depth half off is worth 0.60 ms of a 17.8 ms
    // frame (three interleaved A/B pairs at dpr2, all three negative).
    //
    // PIXEL-IDENTICAL, and here is the whole argument: this flag suppresses only
    // the resolve INTO the single-sample depth texture. Depth testing still
    // happens in the multisampled framebuffer, untouched, so the scene
    // rasterises exactly as before. And nothing anywhere samples the resolved
    // texture: `GTAOPass` builds its OWN `DepthTexture` + `normalRenderTarget`
    // (`GTAOPass.js` `setGBuffer`, the `depthTexture === undefined` branch)
    // because nothing here passes it a `depthTexture`, and the distance blur is
    // wired to THAT one (`aoDepth`, below). Grep-verified: no reader of
    // `renderTarget1.depthTexture` / `renderTarget2.depthTexture` exists.
    //
    // ⚠ WHAT WOULD BREAK IT, silently and with no compile error: handing
    // `GTAOPass` the composer's depth via `setGBuffer`, or adding any pass that
    // samples scene depth from the composer target instead of from `aoDepth`.
    // Either of those makes this flag a visual bug. Delete these two lines if
    // that day comes.
    composer.renderTarget1.resolveDepthBuffer = false;
    composer.renderTarget2.resolveDepthBuffer = false;
    // ── AND rt2 NEEDS NO DEPTH BUFFER AT ALL. Only quads ever write it. ──────
    //
    // The line above stops the RESOLVE; this one stops the ALLOCATION, and it
    // is the larger of the two: `renderTarget2` is a clone of `renderTarget1`,
    // so on `high` it carries a 4x multisampled DEPTH_COMPONENT24 renderbuffer
    // — 62.5 MiB at 2560x1600 (`three.module.js` :13134-13139 gates exactly
    // that allocation on `renderTarget.depthBuffer`).
    //
    // It is only safe because of `pinBuffers()` in `render()` below, and the
    // two are ONE change: read that comment before touching either. The short
    // version is that the composer's ping-pong parity is pinned every frame so
    // the `RenderPass` — the one and only thing in this chain that renders a
    // SCENE into a composer buffer, and therefore the one and only thing that
    // needs a depth buffer — always lands in `renderTarget1`. Everything that
    // ever touches `renderTarget2` is a viewport-covering `FullScreenQuad`
    // (GTAO's copy and its AO blend, the distance blur, the shutter, bloom's
    // additive composite), every one of which sits at window depth 0 under a
    // LEQUAL test and so passes with or without a depth buffer.
    //
    // ⚠ The failure mode if the pin is ever broken is LOUD rather than subtle —
    // a scene rendered with no depth buffer is visibly shuffled geometry, not a
    // shifted pixel — which is the one mercy in this change. The invariant it
    // rests on is entirely local to this file: `passes[0]` is the `RenderPass`,
    // nothing with `needsSwap` precedes it, and `pinBuffers()` runs every frame.
    //
    // `renderTarget1` keeps its depth and its MSAA untouched.
    composer.renderTarget2.depthBuffer = false;
    // ── AND rt2 NEEDS NO MULTISAMPLING EITHER. Worth 125 MiB. ────────────────
    //
    // Same premise as the line above and one step further: every write into rt2
    // is a viewport-covering `FullScreenQuad`, so there is no partial coverage
    // anywhere in it and its 4x multisample buffer provably holds four
    // BIT-IDENTICAL copies of every pixel. A 4x RGBA16F at 2560x1600 is 125 MiB
    // of colour samples storing the same value four times, plus two full-
    // resolution colour resolves a frame to fold them back into one.
    //
    // The structural half of that was always provable from this file. The half
    // that was not — that the DRIVER's resolve of four identical half-floats
    // returns that value bit-exactly — is a driver property rather than a code
    // property, and the item was DECLINED for a round on exactly that ground.
    // It is now MEASURED: `tools/msaa-resolve.mjs` renders one shader through
    // both a 4x multisampled RGBA16F 2560x1600 renderbuffer (blitted down the
    // way three's `updateMultisampleRenderTarget` does) and a plain
    // single-sample one, reads both back as RAW HALF BITS and compares them as
    // integers with no epsilon — across subnormals, values above 1.0, and a
    // per-pixel hash so no two neighbours share a value. **16,384,000
    // components, 0 differing bits.**
    //
    // ⚠ THE SCOPE OF THAT, SAID PLAINLY: it settles THIS machine's driver —
    // ANGLE Metal on an Apple M2 Max, MAX_SAMPLES 4 — and not every GPU. The
    // residual risk is at most one ULP of a half-float on a hypothetical
    // non-conformant resolve, in an HDR buffer that then goes through tone
    // mapping. Re-run the harness before quoting this on other hardware.
    //
    // It rests on the same `pinBuffers()` invariant as the two lines above, and
    // the three are ONE change: if the pin is ever broken, a scene rendered into
    // rt2 loses its depth buffer AND its anti-aliasing together.
    composer.renderTarget2.samples = 0;
    // The render scale rides the composer's PIXEL RATIO rather than its size,
    // which is what makes it one number in one place: the composer multiplies
    // the CSS size by this for its own two targets AND for every pass it owns,
    // so the AO's g-buffer and the bloom's whole mip chain come down with the
    // scene buffer and nothing has to be told separately. The last pass still
    // draws to the canvas at the canvas's own resolution — `renderToScreen`
    // binds the default framebuffer, whose viewport is the renderer's — so the
    // upscale is the sampler's, which is the bilinear the era's video hardware
    // did anyway.
    composer.setPixelRatio(renderer.getPixelRatio() * renderScale);
    // A composer handed its own target measures itself in DEVICE pixels, then
    // multiplies by the pixel ratio again for every pass it is given. Telling
    // it the CSS size once, before any pass is added, is what puts it back on
    // the same units as the renderer.
    composer.setSize(cssSize.x, cssSize.y);

    const passes: Pass[] = [new RenderPass(scene, camera), meter.pass];
    /**
     * The AO's own depth prepass, if this chain has one, for the distance blur
     * to key on. It is a stable object across resizes — `GTAOPass.setSize`
     * resizes the target the texture is attached to rather than replacing it —
     * so the blur wires it once at build.
     */
    let aoDepth: THREE.Texture | null = null;
    /** TEMPORARY — the tuning panel's handle. See `LookPasses`. */
    let aoPass: GTAOPass | null = null;

    if (aoFor(spec, tier)) {
      // Contact darkening. Measured against the same frame with the pass
      // removed, it changes 6% of the pixels by more than 4/255 — which sounds
      // like nothing until you look at WHICH 6%: the seam under the board, the
      // shoes (blown to a white blob without it, and sitting on the deck with
      // it), the recess of every window on the far facade, and the line where a
      // ledge meets the plaza. It is a full extra draw of the scene and it buys
      // exactly one thing, but that thing is "the skater is standing on the
      // ground", so it stays — on `high` alone.
      //
      // Radius is in world metres and is set off the block's own furniture: a
      // kerb is 0.15 m and a ledge 0.4 m, so ~0.9 m still reads as contact
      // rather than as a smudge. `scale` is up at 1.9 because at 1.0 the pass
      // was measurably there and visually absent — a plaza is mostly flat
      // ground, and flat ground is unoccluded by definition.
      const ao = new GTAOPass(scene, camera, bw, bh);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 1.0;
      ao.updateGtaoMaterial({
        radius: 0.9,
        distanceExponent: 1,
        thickness: 0.8,
        distanceFallOff: 1,
        scale: 1.9,
        // 12 → 8, THE PLAYER'S OWN CALL, and the only change in this round that
        // costs anything visible. He was shown the whole price list for the AO
        // pass — which the desktop profile put at 8–12.5 ms of a 22 ms frame,
        // more than every other item found put together — and picked the most
        // conservative paid option: fewer AO rays, nothing else. Half-resolution
        // AO, a shorter denoise and switching the pass off were all offered,
        // priced, and DECLINED. So radius, thickness, scale, blend intensity,
        // the AO resolution (`bw`/`bh`, full buffer) and the Poisson denoise
        // below are all deliberately untouched.
        //
        // What it costs to look at: each ray is a horizon-search direction, so
        // 8 instead of 12 leaves the raw occlusion grainier BEFORE the Poisson
        // denoise below cleans it up. Where it will show first is a wide, gently
        // curved shadow gradient — the inside of the quarter pipe, the coping's
        // underside — rather than a hard contact edge, which stays put.
        //
        // TIER REACH, checked rather than assumed: this block only runs under
        // `if (aoFor(spec, tier))` = `spec.ao && tier.postLevel === 'full'`.
        // `ao: true` belongs to ONE preset row, and `postLevel: 'full'` to the
        // `desktop` and `desktop-high` rows alone. Every automatic phone tier
        // (`phone` 'light', `phone-low` 'off') and `desktop-low` ('light')
        // construct no `GTAOPass` at all, so they run ZERO AO samples rather
        // than fewer — this number is unreachable from them. The one edge is a
        // phone whose player forced Quality: High by hand, which resolves to
        // `TIERS.desktop`; there this makes an already-expensive pass cheaper.
        samples: 8,
        screenSpaceRadius: false,
      });
      ao.updatePdMaterial({
        lumaPhi: 10,
        depthPhi: 2,
        normalPhi: 3,
        radius: 4,
        radiusExponent: 1,
        rings: 2,
        samples: 8,
      });
      // ── THE AO'S TWO TARGETS NEED NO DEPTH ATTACHMENT AT ALL ───────────────
      //
      // `GTAOPass` builds all three of its targets with a bare
      // `new WebGLRenderTarget(w, h, { type: HalfFloatType })` (`GTAOPass.js`
      // :143-144 for these two), and three's default is `depthBuffer: true`, so
      // `setupRenderTarget` allocates a DEPTH_COMPONENT24 renderbuffer for each
      // (`three.module.js` :13248-13252). At 2560x1600 that is 15.63 MiB apiece
      // — 31.25 MiB of depth this chain never reads and never writes.
      //
      // The THIRD one, `normalRenderTarget`, is deliberately NOT in this list:
      // it takes a real scene render (`_renderOverride`, a full
      // `renderer.render` with a `MeshNormalMaterial` override) and its depth is
      // both tested against and handed out as `ao.depthTexture` — which is the
      // texture the distance blur keys on. Touching that one is a visual bug.
      //
      // PIXEL-IDENTICAL, and the argument is "nothing writes depth here":
      // `gtaoRenderTarget` and `pdRenderTarget` are each written by exactly one
      // thing, `GTAOPass._renderPass` (:517 and :522), which draws a single
      // `FullScreenQuad` with `gtaoMaterial` / `pdMaterial` — and both of those
      // materials are constructed `depthTest: false, depthWrite: false`
      // (`GTAOPass.js` :150-151 and :168-169). So the depth buffer is written by
      // nobody, tested by nobody, and sampled by nobody (no `depthTexture` is
      // ever attached to either). The `renderer.clear()` that `_renderPass` runs
      // first still clears colour; its DEPTH_BUFFER_BIT is defined to be a no-op
      // when there is no depth attachment.
      //
      // Lifetime: `GTAOPass.setSize` (:252-254) calls `setSize` on these same
      // two OBJECTS, and `RenderTarget.setSize` (`three.core.js` :9382) only
      // moves width/height and disposes the GPU side — it never touches
      // `depthBuffer` — so the flag survives every window resize and every
      // render-scale change. It does NOT survive `setPreset`, which builds a
      // whole new `GTAOPass`; that is why these two lines live HERE, inside
      // `buildChain`, and not once at boot.
      ao.gtaoRenderTarget.depthBuffer = false;
      ao.pdRenderTarget.depthBuffer = false;
      passes.push(ao);
      aoDepth = ao.depthTexture;
      aoPass = ao;
    }

    // The far-field defocus, and it goes HERE — above the shutter and well above
    // the bloom — because a defocus is the lens failing to converge light before
    // the sensor integrates it: a blown window at ninety metres is spread into a
    // soft disc by the glass, and THAT is what then blooms and then streaks. The
    // other order glows a hard point and smudges the glow afterwards.
    //
    // It is directly under the AO because that is what fills its depth texture
    // (`aoDepth`, set one line up). Ordering it above the AO would hand it last
    // frame's depth — which for a chase camera at 17 m/s is a depth field
    // sixteen centimetres out of register with the colour it is keying.
    //
    // Like the shutter it is a plain ShaderPass and allocates nothing: the
    // composer ping-pongs it between the two targets it already owns, and the
    // depth it reads was rendered by a pass that would have rendered it anyway.
    const blurSpec = blurFor(spec, tier);
    const blur = blurSpec ? createDistanceBlur(blurSpec, aoDepth) : null;
    if (blur) {
      blur.setEnabled(blurOn);
      passes.push(blur.pass);
    }

    // The shutter. A plain ShaderPass, so it ping-pongs between the two targets
    // the composer already owns and allocates nothing of its own — which is the
    // reason it can be here at all on a build whose last mobile preflight came
    // back at ~764 MB against a <700 MB budget. It starts disabled and switches
    // itself on the first frame the camera actually moves; `look.render` feeds
    // it the matrices.
    const motionSpec = motionFor(spec, tier);
    const motion = motionSpec ? createMotionBlur(motionSpec) : null;
    if (motion) passes.push(motion.pass);

    // Bloom is on every preset now, and its threshold is not a constant — see
    // `bloomThreshold()`. The first stack thresholded at 1.1 in raw
    // scene-linear, which is about two stops above the brightest surface this
    // world contains, so the pass ran, cost its eleven draws and touched nothing
    // but the emissive windows. Set where the sun band actually lands, bloom is
    // the cheapest "this surface is being hit by light" signal in the chain, and
    // in a scene with no specular in it that signal is worth more than usual.
    // The radius stays tight for the same reason the threshold is not lower: a
    // wide, low bloom over a bright roofline smears a soft warm blanket across a
    // quarter of the sky, which is exactly the "muddy" the brief is trying to
    // get rid of. Glow around what is hot, not haze over what is near it.
    const bloomScale = spec.bloom.resolutionScale;
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(
        Math.max(2, Math.round(bw * bloomScale)),
        Math.max(2, Math.round(bh * bloomScale)),
      ),
      spec.bloom.strength,
      spec.bloom.radius,
      bloomThreshold(renderer.toneMappingExposure),
    );
    // ── THE BLOOM'S ELEVEN TARGETS NEED NO DEPTH ATTACHMENT EITHER ───────────
    //
    // Same allocation, same default: `UnrealBloomPass.js` :105-123 builds
    // `renderTargetBright` plus five horizontal and five vertical mips with
    // `new WebGLRenderTarget(resx, resy, { type: HalfFloatType })`, so eleven
    // DEPTH_COMPONENT24 renderbuffers come with them. Measured at 2560x1600
    // buffer size with `resolutionScale: 1`: three at 1280x800, two at 640x400,
    // two at 320x200, two at 160x100 and two at 80x50 — 14.31 MiB of depth.
    //
    // ⚠ THIS HALF OF THE ARGUMENT IS WEAKER THAN THE AO'S, AND HERE IT IS IN
    // FULL so nobody has to reconstruct it. Three's separable-blur materials
    // and its composite material do NOT set `depthTest: false` the way
    // `gtaoMaterial` and `pdMaterial` do — they are plain `ShaderMaterial`s at
    // the defaults, so they depth-test and depth-write. What makes the removal
    // identical is the SHAPE of the pass rather than a material flag:
    //
    //  · Each of these targets takes exactly ONE `FullScreenQuad` per write,
    //    immediately after an explicit `renderer.clear()` (`UnrealBloomPass.js`
    //    :301-302, :313-314, :327-328, :333-334, :348-349). No second piece of
    //    geometry is ever drawn into any of them, so there is nothing for a
    //    depth test to sort against.
    //  · `FullScreenQuad`'s mesh sits at window depth 0 (a plane at view z = 0
    //    under `OrthographicCamera(-1, 1, 1, -1, 0, 1)`), and the default depth
    //    function is LEQUAL. With a depth buffer it is `0 <= 1.0` (just
    //    cleared) — passes. Without one, GL specifies that the depth test
    //    behaves as if it always passes. Same fragment either way.
    //  · Nothing samples the depth: the only read of any of these targets is
    //    `renderTargetsHorizontal[0].texture` into the grade's `tBloom` (below),
    //    which is the colour attachment.
    //
    // If anyone ever draws a SECOND thing into a bloom mip — a mask, a sprite,
    // a second quad at a different depth — this stops being free and becomes a
    // real bug. Delete this block if that day comes.
    //
    // Lifetime: `UnrealBloomPass.setSize` (:250-268) calls `setSize` on these
    // same eleven objects rather than replacing them, and `RenderTarget.setSize`
    // does not touch `depthBuffer` (see the AO note above), so one application
    // here covers every resize and every render-scale change. `setPreset`
    // rebuilds the pass and re-runs this line with it.
    for (const rt of [
      bloom.renderTargetBright,
      ...bloom.renderTargetsHorizontal,
      ...bloom.renderTargetsVertical,
    ]) {
      rt.depthBuffer = false;
    }
    if (bloomScale < 1) {
      // The composer re-sizes every pass it owns to the full drawing buffer on
      // each resize, which would undo the constructor's resolution the first
      // time the window moved. Scaling inside the pass's own setSize is what
      // makes the reduction survive — the composite still draws at full
      // resolution into the HDR buffer, only the blur chain is smaller.
      const full = UnrealBloomPass.prototype.setSize.bind(bloom);
      bloom.setSize = (width: number, height: number): void => {
        full(
          Math.max(2, Math.round(width * bloomScale)),
          Math.max(2, Math.round(height * bloomScale)),
        );
      };
    }
    // Both consumers of the meter are wired ONCE, here, because the meter hands
    // out a fixed 1x1 texture rather than a ping-pong pair — that is the whole
    // reason it pays for a fourth single-pixel draw. Nothing per-frame has to
    // remember to re-point them.
    attachBloomExposure(bloom, meter.texture);
    passes.push(bloom);

    // The lens dirt is a stage of the grade rather than a pass, so the whole of
    // wiring it is two textures — and both of them are objects that already
    // exist. `renderTargetsHorizontal[0]` is where UnrealBloomPass composites
    // its five blurred mips (strength already folded in) immediately before
    // blending them additively onto the frame, so it is the bloom's OWN
    // contribution rather than the frame with the bloom in it, which is the one
    // thing the effect needs and the difference between dirt made of light and
    // grime stuck to the monitor. Same shape as `attachBloomExposure`: reach
    // into the pass once, at build, and let the GPU do the rest per pixel.
    const wantsDirt = dirtFor(spec, tier);
    const grade = createGradePass({ ...spec.grade, dirt: wantsDirt });
    grade.uniforms.tExposure.value = meter.texture;
    if (wantsDirt) {
      grade.uniforms.tBloom.value = bloom.renderTargetsHorizontal[0].texture;
      grade.uniforms.tDirt.value = dirtPlate();
      setGradeDirt(grade, dirtOn);
    }
    passes.push(grade);

    for (const pass of passes) composer.addPass(pass);
    return { composer, passes, grade, bloom, motion, blur, dirt: wantsDirt, ao: aoPass };
  };

  let chain = buildChain(preset);

  /** TEMPORARY — the tuning panel's live overrides. See `LookTuning`. */
  const tuning: LookTuning = { bloomKnee: BLOOM_KNEE };

  const disposeChain = (c: Chain): void => {
    for (const pass of c.passes) pass.dispose();
    c.composer.dispose();
  };

  /**
   * The governor changes the renderer's pixel ratio behind this module's back —
   * it is wired straight to `renderer.setPixelRatio` in `main.ts` and has no
   * idea a composer exists. Rather than demand a callback for it, the stack
   * just notices: a drawing buffer that is not the size the targets were built
   * at is a resize, whoever caused it.
   *
   * The render scale is folded in here for the same reason and by the same
   * mechanism — it is one more thing that changes what size the buffers should
   * be — so `setRenderScale` does not resize anything itself, it moves the
   * number and lets the next frame notice. That keeps ONE place in this file
   * that can allocate a screen-sized buffer.
   */
  const syncSize = (): void => {
    renderer.getDrawingBufferSize(drawSize);
    const ratio = renderer.getPixelRatio();
    if (
      drawSize.x === lastWidth &&
      drawSize.y === lastHeight &&
      ratio === lastRatio &&
      renderScale === lastScale
    ) {
      return;
    }
    lastWidth = drawSize.x;
    lastHeight = drawSize.y;
    lastRatio = ratio;
    lastScale = renderScale;
    bufferWidth = Math.max(1, Math.round(drawSize.x * renderScale));
    bufferHeight = Math.max(1, Math.round(drawSize.y * renderScale));
    renderer.getSize(cssSize);
    chain.composer.setPixelRatio(ratio * renderScale);
    chain.composer.setSize(cssSize.x, cssSize.y);
  };

  /**
   * ── PIN THE COMPOSER'S PING-PONG PARITY, ONCE PER FRAME ────────────────────
   *
   * `EffectComposer.render` swaps `readBuffer`/`writeBuffer` after every pass
   * whose `needsSwap` is true and NEVER resets them between frames, so which
   * physical target the `RenderPass` draws into is decided by how many swaps
   * the LAST frame happened to make. In this chain that count is not fixed:
   * `high` swaps four times with the shutter running and three with it idle
   * (`motion-blur.ts` sets `pass.enabled` from the camera's own flow, so it
   * toggles mid-line), and the distance blur toggles the same way off the
   * player's switch and off whether the map has fog. So today the scene lands
   * in `renderTarget2` on some frames and `renderTarget1` on others.
   *
   * Pinning it is PIXEL-IDENTICAL on its own, and that is worth stating
   * separately from what it enables, because it is the half that could
   * conceivably change a frame and does not:
   *
   *  · The two targets are clones — same size, same format, same sample count
   *    (until the line in `buildChain` that this pin exists to license) — so
   *    which one holds which intermediate is not observable.
   *  · No pass in this chain reads a composer buffer's PREVIOUS-FRAME content.
   *    The `RenderPass` clears and overwrites. The meter reads `readBuffer` and
   *    writes only its own three targets. GTAO's copy overwrites `writeBuffer`
   *    wholesale with `NoBlending` before its blend touches it. The distance
   *    blur samples `tDiffuse` (this frame) and `tDepth` (the AO's own prepass,
   *    not a composer buffer). The shutter is a camera REPROJECTION — one
   *    `tDiffuse` fetch of the current frame and two matrices, no history
   *    texture, see `motion-blur.ts`. Bloom reads `readBuffer` and blends back
   *    into it. The grade reads `readBuffer` and writes the canvas.
   *  · At boot the composer starts read=rt2/write=rt1, so the pin flips the
   *    very first frame — into a freshly allocated, never-written clone.
   *
   * What it BUYS is the invariant `renderTarget2` never receives a scene
   * render, on any preset and in any combination of enabled passes. Walked
   * through all four of them: with GTAO present the scene goes to rt1 and rt2
   * takes GTAO's copy+blend and then, if it runs, the shutter; without GTAO
   * (`medium`, `low`) rt2 takes the shutter's output or is never touched at all.
   */
  const pinBuffers = (): void => {
    chain.composer.readBuffer = chain.composer.renderTarget1;
    chain.composer.writeBuffer = chain.composer.renderTarget2;
  };

  const stack: LookStack = {
    // TEMPORARY — see `LookPasses`. A getter and not a field: `setPreset`
    // throws the whole chain away and builds another one.
    get passes(): LookPasses {
      return {
        grade: chain.grade,
        bloom: chain.bloom,
        ao: chain.ao,
        motion: chain.motion,
        blur: chain.blur,
        defines: (chain.grade.material as THREE.ShaderMaterial).defines ?? {},
        meter: meter.uniforms,
      };
    },
    tuning,
    render(delta) {
      // ── ONE FRAME, ONE SHADOW-MAP RASTERISATION ────────────────────────────
      //
      // three re-renders the shadow map inside EVERY `renderer.render()` call
      // (`WebGLRenderer.render` → `shadowMap.render`), and this chain makes two
      // of them per frame: the composer's `RenderPass`, and `GTAOPass`'s own
      // normal/depth prepass, which is a second full scene render with a
      // `MeshNormalMaterial` override and samples no shadows at all.
      //
      // Measured with the GL census (`tools/desk-profile.mjs --counters`): two
      // IDENTICAL passes of 171 draws and 1,305,158 triangles into the same
      // 3072x3072 framebuffer, four draws apart — 25.1% of the frame's whole
      // triangle count, thrown away. Nothing between them moves a caster, a
      // light or the shadow camera: `field.trackShadow` runs once per frame in
      // the update above this call (`main.ts:1034`), and the four intervening
      // draws are the exposure meter writing its own 64/8/1 targets. So the
      // second rasterisation overwrites a texture with the same bytes, and
      // dropping it is pixel-identical by construction rather than by argument.
      //
      // `autoUpdate = false` + `needsUpdate = true` is three's own idiom for
      // exactly this: `WebGLShadowMap.render` early-returns when both are false
      // and clears `needsUpdate` once it has rendered, so the FIRST render of a
      // frame builds the map and every later render in the same frame reuses it.
      //
      // ── WHY THESE TWO LINES ARE THE FIRST THING IN THIS METHOD ─────────────
      //
      // This is the one trap in the change, and it is a visible regression on
      // the hardware least able to report it. The governor's post-off rung
      // returns below with a bare `renderer.render(scene, camera)`. Set
      // `needsUpdate` next to `composer.render` — which is where it sat while
      // this was being MEASURED — and that path never sets it, while
      // `autoUpdate` is still false from the frames before the rung fired: the
      // shadows freeze solid on the worst-performing machine in the game, the
      // one this rung exists to rescue. Set here, above the bypass, every path
      // through the method is covered, and so are `setPreset`'s chain rebuild
      // and the governor's shadow-map reallocation (`main.ts:617-624`, which
      // disposes `shadow.map` and relies on the next frame re-creating it).
      //
      // Scoped to THIS renderer. The menu stage owns a second, separate
      // `WebGLRenderer` (`ui/menu-stage.ts:410`) whose own shadow state is
      // untouched by this.
      renderer.shadowMap.autoUpdate = false;
      // Phone tiers refresh every second frame (see `shadowTick` above);
      // desktop refreshes every frame, exactly as before.
      shadowTick++;
      renderer.shadowMap.needsUpdate = phoneShadow ? shadowTick % 2 === 1 : true;

      // ABOVE the governor's bypass, because this is not part of the picture
      // the governor is switching off: a machine that has dropped to
      // `renderer.render()` still draws the same body, and a character who got
      // his shine back the moment the frame rate sagged would be the loudest
      // thing on the worst-performing machine in the game.
      bodies.sync();
      if (!enabled) {
        // The governor's emergency rung. The meter's pass lives in the chain, so
        // when the chain is gone the metering goes with it and the picture falls
        // back to the flat renderer exposure — the same ACES, the same number
        // `main.ts` set, ungraded and unmetered. That is a real loss and it is
        // the right trade at the only moment it fires: this rung is reached
        // after four sustained seconds over budget on a machine that is already
        // dropping frames, and the gain never crossed to the CPU to be held on
        // to (see `metering.ts` on why it must not).
        renderer.render(scene, camera);
        return;
      }
      syncSize();
      // Both of these READ the renderer's exposure rather than caching it, so
      // the grade and the bloom's knee stay locked to each other and to the one
      // number `main.ts` set, whatever rides it later. The meter's gain is not
      // in either of them: it multiplies the grade and divides the bloom knee
      // per pixel, on the GPU, out of the texture wired in at chain build.
      const exposure = renderer.toneMappingExposure;
      // The BUFFER's size, not the canvas's — they are the same number until the
      // render scale comes off 1, and after that the grade's two sharpen rings
      // have to step in texels of the buffer they are sampling rather than
      // pixels of the screen they are drawing to. Passing the canvas size at 0.55
      // would have made the one-pixel ring a 0.55-pixel one, i.e. a blur.
      updateGradeFrame(chain.grade, exposure, bufferWidth, bufferHeight);
      // `tuning.bloomKnee` is `BLOOM_KNEE` until the panel moves it — TEMPORARY.
      chain.bloom.threshold = bloomThreshold(exposure, tuning.bloomKnee);
      // Guarded on the preset's own strength rather than run and multiplied by
      // zero: on `low` the grade has no shaft block compiled into it, so this is
      // a projection and a scene lookup done for a uniform nothing reads.
      const shafts = PRESET_SPECS[preset].grade.shafts;
      if (shafts > 0) aimShafts(shafts);
      // Before the draw, because it is the camera's state going INTO this frame
      // that has to be paired with the state going into the last one. It also
      // decides whether its own pass runs — a title screen, a paused game and
      // the frame after a reset all come out of this call switched off.
      chain.motion?.update(camera, delta);
      // The far field, keyed on the MOUNTED MAP's own fog — read out of the
      // scene every frame rather than captured once, which is what makes a spot
      // change (14→220 m on the block, 90→620 m on the channel) and the
      // governor's draw-distance rung (which scales `fog.far` live) both land
      // here for free. One property read on the common frame.
      chain.blur?.update(
        camera,
        scene.fog instanceof THREE.Fog ? scene.fog : null,
        bufferWidth,
        bufferHeight,
      );
      pinBuffers();
      // ── NO AUTOCLEAR INSIDE THE CHAIN. Every quad overwrites its target. ────
      //
      // A plain `ShaderPass` does not touch `renderer.autoClear` (only
      // BokehPass, CubeTexturePass, GTAOPass, OutlinePass, RenderPass and
      // UnrealBloomPass do), so its `FullScreenQuad.render` goes through
      // `renderer.render`, which reaches `background.render` and clears colour +
      // depth + stencil of whatever is bound (`three.module.js` :1368-1377).
      // In this chain that is seven clears a frame nobody needs: the meter's
      // four tiny targets, the distance blur's and the shutter's writes into a
      // 4x MSAA half-float target at 2560x1600, and the grade's clear of the
      // canvas immediately before it repaints every pixel of it.
      //
      // PIXEL-IDENTICAL, in two halves:
      //  · The COLOUR clear is dead because every one of these quads writes
      //    every pixel unconditionally. `ShaderPass` builds its material as a
      //    bare `ShaderMaterial`, so `blending` is NormalBlending and
      //    `transparent` is false — and `setMaterial` (`three.module.js`
      //    :10407) turns that exact pair into `NoBlending` outright. The quad
      //    spans the full viewport. Nothing of the old contents can survive.
      //  · The DEPTH clear is dead because the quad sits at window depth 0 and
      //    the default depth function is LEQUAL, so it passes against anything
      //    in [0,1] — cleared or not. Nothing in this chain depth-tests a
      //    composer buffer for real; the AO's own prepass depth is a separate
      //    target that `GTAOPass` clears itself.
      //
      // WHAT SURVIVES, and it is the whole reason this is safe: `RenderPass`
      // does its own clear from `autoClearColor`/`autoClearDepth`/
      // `autoClearStencil` (`RenderPass.js` :161), which are SEPARATE flags and
      // are untouched here — so the scene still gets a proper clear. GTAOPass
      // and UnrealBloomPass already set `autoClear = false` themselves and run
      // explicit `renderer.clear()` calls; both save and restore, so they are
      // unaffected either way.
      //
      // ⚠ SCOPED TO THE CHAIN, DELIBERATELY. The obvious version of this change
      // is to set the flag once at boot, and that version is a visible
      // regression on the weakest machine in the game: the governor's post-off
      // rung above returns through a bare `renderer.render(scene, camera)`,
      // which would then draw over the previous frame's colour AND depth. Set
      // and restored around `composer.render` alone, that path never sees the
      // flag at all, and neither does anything `main.ts` does with this
      // renderer. (The menu's own second `WebGLRenderer` — `ui/menu-stage.ts`
      // :410 — has its own `autoClear` and was never in scope.)
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      try {
        chain.composer.render(delta);
      } finally {
        // `finally` rather than a plain restore: a flag left false by a thrown
        // frame is a permanent smear on every path above, including the
        // governor's.
        renderer.autoClear = autoClear;
      }
    },
    setPreset(name) {
      if (name === preset) return;
      preset = name;
      // Rebuilt rather than reconfigured: the sample count is fixed when a
      // render target is allocated and the AO and bloom buffers are the bulk of
      // what a preset costs, so a preset swap has to free them to mean
      // anything. It happens from a settings screen, never mid-line.
      const old = chain;
      chain = buildChain(name);
      disposeChain(old);
      lastWidth = 0; // force syncSize to re-measure against the new chain
    },
    refreshFromSetting() {
      stack.setPreset(startingPreset(tier));
    },
    get preset() {
      return preset;
    },
    setPostEnabled(value) {
      enabled = value;
    },
    /**
     * The internal resolution. No rebuild and no reallocation of its own: it
     * moves one number and lets `syncSize` notice on the next frame, which is
     * the same path a window drag and the governor's DPR rung already take.
     * Every target in the chain — the scene buffer, its MSAA, the AO's g-buffer,
     * the bloom's five mips — comes down together because they are all sized off
     * the composer's pixel ratio.
     *
     * Clamped rather than trusted: a scale of 0 is a zero-sized render target,
     * which is a lost context on some drivers, and anything above 1 is a
     * supersample nobody asked for and the memory budget cannot pay for.
     */
    setRenderScale(scale) {
      renderScale = Math.min(1, Math.max(0.35, scale));
    },
    get renderScale() {
      return renderScale;
    },
    setLensDirt(on) {
      dirtOn = on;
      if (chain.dirt) setGradeDirt(chain.grade, on);
      // `false` back is not a failure, it is the honest answer to "did that do
      // anything": on `low` and on `phone-low` the grade has no dirt block
      // compiled into it at all, so there is nothing here a uniform can reach.
      return chain.dirt;
    },
    setLensDirtPlate(url) {
      // Builds the plate if this is the first thing to ask for one — a session
      // that has been on `low` throughout and is handed a new URL gets the
      // texture allocated here rather than never. It is still wired to nothing
      // until a preset compiles the block.
      (dirt ??= createLensDirt()).setPlate(url);
    },
    setDistanceBlur(on) {
      blurOn = on;
      chain.blur?.setEnabled(on);
      // Same contract as the dirt: `false` means this chain has no blur pass —
      // it rides the AO's depth prepass and only exists where that does.
      return chain.blur !== null;
    },
    resize(width, height) {
      // A zero-sized viewport is a no-op and not a reallocation. It arrives for
      // real — a tab restored from the background, a phone rotating, a window
      // dragged to a second display all fire a resize with one axis still at 0 —
      // and every target in this chain derives its size from this number times
      // the pixel ratio times the render scale, so a 0 here is a 0x0 render
      // target on every one of them. On this Mac that is a console warning; on
      // some phone drivers it is a lost context.
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      syncSize();
    },
    dispose() {
      disposeChain(chain);
      meter.dispose();
      // Both of the things that outlive a chain. `dirt` is null on a session
      // that never left `low` — see the lazy build above.
      dirt?.dispose();
    },
  };

  return stack;
}
