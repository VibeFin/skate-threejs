// The lens plate — the specks, scratches and smears on the glass the game is
// being filmed through, and NOTHING about where they are drawn.
//
// This file owns one thing: a texture. The stage that uses it is four lines in
// `ps2-grade.ts` (`#ifdef DIRT`), because that is all a lens dirt effect is once
// you have decided the one thing that actually matters about it:
//
// ── IT MODULATES THE BLOOM. IT IS NOT LAID OVER THE FRAME. ──────────────────
//
// The failure mode of this effect — the reason it is on every list of post
// people regret shipping — is dirt you can see on a dark frame. Grime added to
// the picture is a texture stuck to the screen; it does not belong to the
// camera, it belongs to the monitor, and the moment the skater rides into the
// west block's shadow it is the brightest thing in the shot.
//
// What a dirty lens actually does is SCATTER light that was already arriving.
// No light, no scatter. So the plate is a mask over the bloom's own output —
// `hdr += bloomContribution * plate * gain` — and every property the effect
// needs falls out of that one line for free:
//
// · Point the camera away from the sun, at the shaded spawn corner, and the
//   bloom contribution is near zero, so the dirt is near zero. It is not faded
//   out by a rule; there is nothing for it to be made of.
// · Point it west into the 22° key (`field.ts`'s SUN_AZIMUTH) and the sky, the
//   lit facade and the shafts hand the bloom its brightest frame of the game —
//   and the dirt lights up with it, hardest where the glow is hardest.
// · It costs no decision about tone: the add lands in scene-referred linear,
//   above the grade's tone map, so a smear over a blown window rolls off the
//   same shoulder every other highlight does and cannot push past white.
//
// The plate is sampled at the SAME uv as the frame, cover-fitted (see
// `dirtCoverScale`), so a speck is a speck and not a vertical streak on a phone
// in portrait.
//
// ── WHY THERE IS A PROCEDURAL PLATE IN HERE AT ALL ──────────────────────────
//
// Two reasons, and the second is the one that keeps it after the generated
// plate landed. First, it is what this lane built against while the plate was
// being commissioned. Second, `PLATE_URL` is a remote asset on a CDN and this
// effect must not be a hole in the picture when that fetch fails, 404s or is
// still in flight on the frame the player drops in: the texture object handed
// out below is STABLE and is never null, so the chain wires it exactly once and
// the generated image swaps itself into the same object when it arrives.
// Nothing downstream has a "has the dirt loaded yet" branch in it.

import * as THREE from "three";

/**
 * The generated plate. 16:9, near-black with grey-white marks — dust specks
 * over the whole frame, a few long thin scratches, several soft greasy blobs
 * and water spots, deliberately HEAVIER at the edges and corners and sparse
 * through the middle third.
 *
 * That density gradient is not decoration, it is what keeps this effect off the
 * one thing in the frame the player is steering: the skater sits in the middle
 * of a chase shot, and the middle of this plate is the part with almost nothing
 * on it.
 *
 * `@1024` and not the full-size variant, and not because 1024 is enough to look
 * at — it is enough for what this is SAMPLED as. The plate multiplies a bloom
 * buffer that is itself built at half the composer's resolution and then blurred
 * five times; there is no frequency in the product above the blur's, so a 2048
 * plate would cost four times the memory to carry detail that is destroyed by
 * the thing it is multiplied against. At 1024x576, mipmaps off (see below),
 * that is 2.36 MB — which matters, because the last mobile preflight came back
 * at ~870 MB against a <700 MB budget.
 */
const PLATE_URL =
  "https://assets.auras.cc/generations/cms5za9xv010a22lbuv46x7wq/image-main@1024";

/** The plate's own aspect, used for the cover fit. Both plates are 16:9. */
export const DIRT_ASPECT = 16 / 9;

/** The procedural fallback's size. 16:9 to match the plate, so the cover fit
 *  below means the same thing whichever one is bound. */
const FALLBACK_W = 512;
const FALLBACK_H = 288;

/**
 * How the plate is fitted to the frame: COVER, not stretch.
 *
 * Stretching a 16:9 plate over a phone in portrait (9:19.5) is a 4.2x
 * anisotropy — every round speck becomes a vertical streak and the whole effect
 * reads as a dirty screen rather than a dirty lens. Cover keeps the marks
 * circular and crops instead, and it crops the axis the plate has least to lose
 * on: on a portrait frame the left and right of the plate go, and what is kept
 * is the middle band plus the top and bottom EDGES, which is where the density
 * lives.
 *
 * Returned as the scale applied about the centre of the frame:
 * `plateUv = (frameUv - 0.5) * scale + 0.5`.
 */
export function dirtCoverScale(frameAspect: number, out: THREE.Vector2): THREE.Vector2 {
  const a = Math.max(frameAspect, 1e-3);
  return out.set(Math.min(1, a / DIRT_ASPECT), Math.min(1, DIRT_ASPECT / a));
}

export interface LensDirt {
  /**
   * The plate. A FIXED object for the life of the stack — the generated image
   * is swapped into this texture's own source rather than replacing it — so a
   * chain wires it once and never has to be re-pointed when the fetch lands.
   */
  readonly texture: THREE.Texture;
  /**
   * Swap the plate. One line, which is the whole reason the loading lives
   * behind a setter: a new generation is a new URL and nothing else changes.
   * `null` puts the procedural plate back.
   */
  setPlate(url: string | null): void;
  dispose(): void;
}

/**
 * A fixed-seed LCG. The plate has to be IDENTICAL every session — a lens whose
 * scratches move between runs is not a lens — and `Math.random()` would have
 * given the fallback a different set of marks on every boot, which is also the
 * one difference that would have made an A/B capture of this effect worthless.
 */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The fallback plate, drawn once into a canvas.
 *
 * It is built to the same brief as the generated one, because the two have to
 * be interchangeable: near-black ground, marks weighted toward the edges and
 * corners, nothing much through the middle third. `edgeBias` below is the whole
 * of that — a mark's position is drawn uniformly and then REJECTED in proportion
 * to how central it is, which is cheaper than sampling a 2D density field and
 * lands in the same place.
 *
 * Everything is drawn in white at low alpha and left for the shader to scale.
 * The plate is a MASK: its absolute level is meaningless on its own and is set
 * by `DIRT_GAIN` in `ps2-grade.ts` against the bloom it multiplies.
 */
function drawFallback(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = FALLBACK_W;
  canvas.height = FALLBACK_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, FALLBACK_W, FALLBACK_H);

  const rnd = makeRandom(0x5ca7e0);
  // How far from the centre a point is, 0 at the middle and 1 at a corner.
  const edge = (x: number, y: number): number => {
    const dx = (x / FALLBACK_W - 0.5) * 2;
    const dy = (y / FALLBACK_H - 0.5) * 2;
    return Math.min(1, Math.hypot(dx, dy) / Math.SQRT2) ** 0.7;
  };

  ctx.globalCompositeOperation = "lighter";

  // Dust. The bulk of the plate by count and the least of it by area: a lens
  // that has been in a bag with a set of keys for a year.
  for (let i = 0; i < 900; i += 1) {
    const x = rnd() * FALLBACK_W;
    const y = rnd() * FALLBACK_H;
    if (rnd() > 0.12 + edge(x, y) * 0.88) continue;
    const r = 0.35 + rnd() * rnd() * 1.9;
    ctx.fillStyle = `rgba(255,255,255,${(0.25 + rnd() * 0.6).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Scratches — long, thin, and nearly straight. A handful, because two or
  // three is a used lens and twenty is a broken one.
  for (let i = 0; i < 9; i += 1) {
    const x = rnd() * FALLBACK_W;
    const y = rnd() * FALLBACK_H;
    if (rnd() > 0.1 + edge(x, y) * 0.9) continue;
    const a = rnd() * Math.PI;
    const len = 30 + rnd() * 150;
    const bow = (rnd() - 0.5) * 26;
    ctx.strokeStyle = `rgba(255,255,255,${(0.18 + rnd() * 0.3).toFixed(3)})`;
    ctx.lineWidth = 0.5 + rnd() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a) * len * 0.5 - Math.sin(a) * bow,
      y + Math.sin(a) * len * 0.5 + Math.cos(a) * bow,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
    );
    ctx.stroke();
  }

  // Smears and water spots. These are what carry the effect: a speck is one
  // pixel of glow, a greasy thumbprint is a soft patch of it, and the soft
  // patch is what reads as a lens rather than as noise.
  for (let i = 0; i < 26; i += 1) {
    const x = rnd() * FALLBACK_W;
    const y = rnd() * FALLBACK_H;
    if (rnd() > 0.08 + edge(x, y) * 0.92) continue;
    const r = 8 + rnd() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const peak = 0.1 + rnd() * 0.22;
    g.addColorStop(0, `rgba(255,255,255,${peak.toFixed(3)})`);
    g.addColorStop(0.45, `rgba(255,255,255,${(peak * 0.45).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    // Squashed, and turned: a smear is a wipe, and a wipe has a direction.
    ctx.ellipse(x, y, r, r * (0.4 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

/**
 * Build the plate. Cheap — a 512x288 canvas, 590 KB of CPU memory — and the
 * network fetch starts here, so a preset that never compiles the dirt block
 * should never call this. `look.ts` builds it lazily for exactly that reason.
 */
export function createLensDirt(): LensDirt {
  const fallback = drawFallback();
  // The type parameter is the whole point of this line: the plate STARTS as a
  // canvas and becomes an <img> when the generated one lands, in the same
  // Texture object, so the object has to be declared as able to hold either.
  // Without it three infers `Texture<HTMLCanvasElement>` off the constructor and
  // the swap below is a type error rather than the one-line swap it is meant to
  // be.
  const texture = new THREE.Texture<HTMLCanvasElement | HTMLImageElement>(fallback);
  texture.name = "look:lens-dirt";
  // sRGB, so the hardware decodes the plate to linear on sample — three picks
  // an SRGB8_ALPHA8 internal format off this flag, which is what makes the mask
  // mean the same thing as the eye reading the file. A mask uploaded as linear
  // would have every mid-grey speck sitting about twice as bright as it looks.
  texture.colorSpace = THREE.SRGBColorSpace;
  // No mipmaps, and it is a memory decision rather than a quality one: this
  // plate is MAGNIFIED at every resolution the game runs at (1024 across a
  // 1280-wide frame, and 1170 device pixels wide on a phone at DPR 3), so the
  // whole chain would be built to be never sampled — 33% of the texture's
  // memory for nothing. Linear min filter so the one case that does minify —
  // a very wide window — degrades softly rather than aliasing the specks.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  let pending = 0;

  const setPlate = (url: string | null): void => {
    const job = ++pending;
    if (!url) {
      texture.image = fallback;
      texture.needsUpdate = true;
      return;
    }
    new THREE.ImageLoader().setCrossOrigin("anonymous").load(
      url,
      (image) => {
        // A late arrival from a plate that has since been swapped away must not
        // win. Two `setPlate` calls in one session is a fetch that lost.
        if (job !== pending) return;
        texture.image = image;
        texture.needsUpdate = true;
      },
      undefined,
      // Quietly. A dead URL leaves the procedural plate bound and the effect
      // keeps working — the same way the menu lane's backdrop falls back to its
      // still. There is nothing here worth throwing a frame away over.
      () => {
        if (job === pending) console.warn("[lens-dirt] plate unavailable, using the procedural one");
      },
    );
  };

  setPlate(PLATE_URL);

  return {
    texture,
    setPlate,
    dispose() {
      // Cancels nothing: a fetch still in flight resolves into a texture whose
      // GPU copy is gone, which is a no-op. `pending` is bumped so the callback
      // above declines anyway.
      pending += 1;
      texture.dispose();
    },
  };
}
