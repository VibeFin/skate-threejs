// What makes the spot a place instead of a shape.
//
// Everything here is DRESSING — nothing in this file answers a height query.
// What it draws is still read off the description in spot.ts rather than
// re-typed: the rail tubes come from `RAILS`, the coping from the quarter
// pipe's own lip, and the street furniture from `PLACEMENTS`, which lives next
// door because a dumpster is matter and its collider has to come from the same
// coordinates as its model. The steel you see is the line the board locks onto,
// and the dumpster you see is the dumpster you cannot ride through.
//
// Every generated asset lands as one URL constant with a procedural stand-in
// underneath, the way dressField() did it: the spot has to look like a street
// the moment it boots, and then look like a better one when the textures
// arrive. A failed load is a warning and the placeholder, never a broken scene.

import * as THREE from "three";
import { TIERS, isPhoneTier, type QualityTier } from "../controllers/quality/tier";
import { loadTextureWithFallback, loadModelWithFallback } from "../controllers/quality/pick-asset";
import type { GenexGltfLoader } from "../controllers/quality/gltf-loader";
import type { LookKey, Placement, PropKind, Solid } from "./spot";
import {
  PLACEMENTS,
  QP_DECK_Y,
  RAILS,
  ROAD_DROP,
  SOLIDS,
  SPOT_MAX_X,
  SPOT_MAX_Z,
  SPOT_MIN_X,
  SPOT_SOLIDS,
  STREET_PLACEMENTS,
  STREET_SPOT,
  TILE,
  solidPoint,
  topOf,
  topPolyline,
} from "./spot";
import { buildStreetProp, createPropMaterials } from "./procedural/index";

export type { PropKind } from "./spot";

// --- generated surfaces ------------------------------------------------------
//
// THE WHOLE SET WAS RE-SHOT IN ONE LIGHTING REGISTER, and that is the fix for
// the second of the two texture complaints. The old surfaces were generated one
// at a time over three rounds: the asphalt came back lit from the left, the
// waxed ledge came back under a warm bounce, the brick came back with a black
// throw-up baked into it, and each one then had a hand-picked amber tint
// applied in `dressMaterials` to try to make it agree with its neighbours.
// Eight tints is not a grade, it is eight opinions, and the result is what the
// player reported: the surfaces did not match each other.
//
// These nine were shot as ONE set — flat neutral overcast, no baked shadows,
// grey-balanced — so they already agree, and the code's job is to stop pulling
// them apart. What is left below is a per-surface VALUE, not a colour: these
// images are photographic and bright (the plaza slabs sit at roughly 0.88
// luminance and real concrete is nearer 0.35), so each material is multiplied
// down to a believable albedo and no further. The hour comes from the sun and
// the split hemisphere in `field.ts`, which is where an hour belongs.
const gen = (id: string, role: string): string =>
  `https://assets.auras.cc/generations/${id}/${role}`;

/** Worn street: tar crack-seal seams, patched, mid grey. */
const ROAD_TEX = "cms51ksoc000022ozvbavgosq";
/** The plaza's own pour: broad slabs, expansion joints, staining. */
const PLAZA_TEX = "cms51kten000322ozvretisvl";
/** Power-trowelled park concrete, pale and cool, with the wax sheen on it. */
const PARK_TEX = "cms51ktzt000622oze19doqef";
/** Footway: small scored panels and gum spots. Also what a precast ledge is. */
const WALK_TEX = "cms51kumv000922ozl7evnckj";
/** Old red clay brick, real mortar, a ghost sign — and no tag baked into it. */
const BRICK_TEX = "cms51lcmj000c22oz08pij2dw";
/** Cinder block and rows of steel-framed windows — the skyline behind the block. */
const FACADE_TEX = "cms51ld9r000f22ozmjq67yue";
/** Chain link, generated with a real alpha channel. */
export const FENCE_IMAGE_URL = gen("cms51lfh6000o22oz0illccyx", "image-main");
/**
 * Golden hour, and it replaces the pale midday dome the spot shipped under.
 *
 * The menu still and the loop are saturated evening; the gameplay sky was blue
 * with white cumulus in it, so DROP IN cut from one game to another. Same block,
 * same walls, different hour — and this is the one asset in the level that
 * decides what hour it is.
 */
export const CITY_SKYBOX_URL =
  "https://assets.auras.cc/generations/cms2syf6o01ml22lplnxih4je/skybox-equirect";

// --- graffiti, in the order the placements index them ------------------------
//
// FOUR MORE, AND THEY ARE FOUR DIFFERENT KINDS OF MARK rather than four more
// throw-ups. The spot had one throw-up, one wildstyle, one stencil and one
// flyposter rotated over fifty-odd pieces, and rotation is what the two high
// bands' comments keep failing to hide: three images cannot help reading as
// three images. What breaks that is not more of the same — it is a mark the eye
// files differently. A ROLLER blockbuster is house paint on a pole, not aerosol.
// A CHARACTER piece has no letters in it at all. A CHROME hand-style is one
// stroke with drips. A HOLLOW is an outline with the wall showing through it. At
// twenty metres those four read as four different people having been here, which
// is the thing a production wall is actually made of.
export const GRAFFITI_URLS = [
  "https://assets.auras.cc/generations/cms2djqci01e622lpb7gczi3k/image-main", // throw-up
  "https://assets.auras.cc/generations/cms2djr1n01e922lpurc3ne4s/image-main", // wildstyle
  "https://assets.auras.cc/generations/cms2djrqw01ec22lpquoo2jol/image-main", // stencil
  "https://assets.auras.cc/generations/cms2djsfm01ef22lpycp5tch6/image-main", // contest flyposter
  "https://assets.auras.cc/generations/cms6och8p000k22mznd8o90ff/image-main", // roller blockbuster
  // …take 2. The first (`cms6o05ga000522mzzsv6i1pa`) was REJECTED by
  // `npx genex ui trim`: 6.3% of its soft rim was isolated colour speckle
  // against a 2% limit — a damaged cutout, which over dark brick is a colour
  // halo round the whole mascot and which nothing downstream repairs. The cause
  // was in the prompt: it asked for "aerosol overspray haze at the edges", and a
  // hazy edge is precisely what the transparent model cannot key cleanly.
  // Re-briefed with "very thick hard black outline, crisp clean edges, no haze,
  // no soft airbrushed halo" → speckle **0.00%**. Same drawing, same drip.
  "https://assets.auras.cc/generations/cms6or64b000922o7a7m72ch2/image-main", // character piece
  "https://assets.auras.cc/generations/cms6ocxl4000n22mzim4rrr7j/image-main", // chrome hand-style
  // …also take 2, and this one passed the cutout gate and failed on the PAINT.
  // `ui trim` cleared the first one (`cms6od1rz000q22mz54zuyuer`, 0.03% speckle)
  // and the alpha histogram condemned it: **65.8% of its inked pixels were under
  // 50% opacity** and 2.3% over 98%, i.e. the letters themselves were a wash, not
  // paint. Over red brick that is mud. The cause was again in the brief — "the
  // wall showing straight through every letter" was read as literal
  // transparency. Re-briefed as "fully opaque flat paint at full strength, the
  // inside of every letter left completely EMPTY": **96.7% of the ink is now at
  // 78% opacity or better**, which is the same family as the four originals
  // (87.1% and 89.6% for the throw-up and the wildstyle). Worth keeping as a
  // measurement: a transparent-background PNG can be a clean cutout and still be
  // unusable, and no cutout tool looks at the middle of the letters.
  "https://assets.auras.cc/generations/cms6p3ojf000g22o7t5eu9a0j/image-main", // hollow outline
];

/** How much of one generated image actually carries paint, in UV. */
interface PaintWindow {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** The whole image — what every piece got before the windows were measured. */
const FULL_IMAGE: PaintWindow = { u0: 0, u1: 1, v0: 0, v1: 1 };

/**
 * The paint window of each generated image, MEASURED OFF ITS OWN ALPHA CHANNEL
 * rather than assumed, and the reason the four new pieces are not stretched.
 *
 * `npx genex image --transparent` returns a square 1024², and the art inside it
 * is whatever shape the art is: the roller piece fills 985 x 594 of it and the
 * hollow one 949 x 439, so 21% and 57% of those images are empty. A quad that
 * maps the whole image (UV 0 → 1) therefore has to be SQUARE for the paint on it
 * to be undistorted — and a square quad big enough to make a 3.2 m piece stands
 * 3.2 m tall, so it crosses courses and fascia signs the paint itself never
 * touches, and the occlusion check has to measure that empty overhang as if it
 * were paint.
 *
 * Mapping the window instead makes `w` and `h` in a placement mean the METRES OF
 * PAINT, which is what every comment in `DECALS` has always assumed they meant.
 * It is also the honest fix for a complaint this file has recorded twice — the
 * two high bands came back as "unreadable pale smears" because a square image
 * was being pulled to 4.5:1, and the standing 2.5:1 rule is a rule about how far
 * a SQUARE image may be pulled. A windowed piece is placed at its own aspect and
 * is not being pulled at all.
 *
 * Arts 0–3 are deliberately absent and keep the full image. Their letterbox
 * stretch is the thing fifty existing placements were sized and re-sized against
 * over four rounds; re-cropping them now would move every one of those pieces.
 */
const PAINT_WINDOW: Record<number, PaintWindow> = {
  // Alpha ≥ 10% is the threshold — below that a pixel carries no paint worth a
  // texel. v is flipped because `flipY` is on by default: image row 0 is v = 1.
  4: { u0: 0.0166, u1: 0.9785, v0: 0.2051, v1: 0.7852 }, // roller     985 x 594, 1.658:1
  5: { u0: 0.0859, u1: 0.9141, v0: 0.0645, v1: 0.9531 }, // character  848 x 910, 0.932:1
  6: { u0: 0.0303, u1: 0.9746, v0: 0.1465, v1: 0.8945 }, // chrome     967 x 766, 1.262:1
  7: { u0: 0.0557, u1: 0.9688, v0: 0.3613, v1: 0.6875 }, // hollow     935 x 334, 2.799:1
};

// --- street furniture --------------------------------------------------------
// The PLACEMENTS live in spot.ts now, next to the colliders they generate.
export const PROP_URLS: Record<PropKind, string> = {
  dumpster: "https://assets.auras.cc/generations/cms2djt3701ei22lpwgkcfik7/model-glb",
  bench: "https://assets.auras.cc/generations/cms2djts701el22lphxetrioe/model-glb",
  bin: "https://assets.auras.cc/generations/cms2djuh101eo22lpk3khrtxt/model-glb",
  cone: "https://assets.auras.cc/generations/cms2djv4t01er22lp7aeex5uj/model-glb",
  lamp: "https://assets.auras.cc/generations/cms2djvt201eu22lp7fkfyxin/model-glb",
  hydrant: "https://assets.auras.cc/generations/cms2djwej01ex22lpqlmsuhdo/model-glb",
};

/** Metres tall each prop is scaled to. A generated GLB arrives at any size. */
const PROP_HEIGHT: Record<PropKind, number> = {
  dumpster: 1.35,
  bench: 0.9,
  bin: 1.0,
  cone: 0.6,
  lamp: 5.6,
  hydrant: 0.75,
};

/**
 * How far a prop may reach sideways, when a uniform scale to `PROP_HEIGHT`
 * would give it more.
 *
 * One entry, and it earns its place. The lamp GLB is a genuine twin-head cobra
 * standard — pole, a long arm with a diagonal brace, two luminaires hanging off
 * it — and its own bounds are 0.356 wide to 1.0 tall. Scaled by height alone
 * that is a 2.2 m reach on a 5.6 m post, and with the sun 22.6 deg above the
 * horizon the arm, the brace and the two heads rake out into a 15 m shadow with
 * three prongs on the end of it. Nothing is wrong with the model or the shadow
 * rig; the arm is simply half again longer than a real one, and its silhouette
 * is what lands on the plaza. Clamping the reach is the fix the mesh itself
 * asks for, and it is measured against the mesh rather than eyeballed.
 */
const PROP_REACH: Partial<Record<PropKind, number>> = { lamp: 1.5 };

// ---------------------------------------------------------------------------
// procedural stand-ins
// ---------------------------------------------------------------------------

function canvas(size: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) throw new Error("[props] no 2d context");
  return { c, g };
}

/** Deterministic noise — the same plaza every boot, so a look can be judged. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function grain(g: CanvasRenderingContext2D, size: number, seed: number, amount: number): void {
  const r = rng(seed);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] = THREE.MathUtils.clamp(d[i] + n, 0, 255);
    d[i + 1] = THREE.MathUtils.clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = THREE.MathUtils.clamp(d[i + 2] + n, 0, 255);
  }
  g.putImageData(img, 0, 0);
}

function tiling(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Poured concrete with a saw-cut joint grid — the stand-in for the three cast
 * floors, told apart by how many bays there are to a tile and how it is worn.
 *
 * One function and not three because the stand-in's whole job is to hold the
 * shape of the level for the second and a half before the real surface lands:
 * what has to be right is that the plaza reads as big bays, the footway as
 * small panels and a transition as an almost jointless pour, because those are
 * the three grains the finished picture is made of.
 */
function concreteCanvas(bays: number, base: string, wear: number, seed: number): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${140 + r() * 60},${136 + r() * 55},${124 + r() * 50},${0.1 + wear * 0.3})`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 6 + r() * 40, 5 + r() * 30, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  grain(g, 256, seed + 4, 12 + wear * 18);
  // The joints are the reason this reads as a floor somebody poured.
  const step = 256 / bays;
  g.strokeStyle = `rgba(70,66,60,${0.35 + wear * 0.4})`;
  g.lineWidth = 3;
  for (let i = 0; i < bays; i++) {
    g.strokeRect(i * step, 0, step, 256);
    g.strokeRect(0, i * step, 256, step);
  }
  // …and the cracks running out of them, on the floors old enough to have any.
  g.strokeStyle = `rgba(60,56,50,${0.2 + wear * 0.3})`;
  g.lineWidth = 1.5;
  for (let i = 0; i < Math.round(wear * 6); i++) {
    g.beginPath();
    let x = r() * 256;
    let y = r() < 0.5 ? 0 : 256;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (r() - 0.5) * 40;
      y += y < 128 ? 18 + r() * 26 : -(18 + r() * 26);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return tiling(c);
}

function asphaltCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.fillStyle = "#3f4045";
  g.fillRect(0, 0, 256, 256);
  const r = rng(23);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(${70 + r() * 90},${70 + r() * 85},${72 + r() * 85},0.5)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  grain(g, 256, 29, 22);
  return tiling(c);
}

function brickCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.fillStyle = "#6e5a50";
  g.fillRect(0, 0, 256, 256);
  const r = rng(41);
  const rows = 16;
  const h = 256 / rows;
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? h : 0;
    for (let x = -h * 2; x < 256; x += h * 2) {
      const t = 0.72 + r() * 0.45;
      g.fillStyle = `rgb(${Math.round(150 * t)},${Math.round(86 * t)},${Math.round(66 * t)})`;
      g.fillRect(x + off + 1.5, row * h + 1.5, h * 2 - 3, h - 3);
    }
  }
  grain(g, 256, 43, 20);
  return tiling(c);
}

function ledgeCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(128);
  g.fillStyle = "#c9c2b1";
  g.fillRect(0, 0, 128, 128);
  const r = rng(59);
  // The dark smears are the wax — a ledge that has been skated shows it.
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(60,55,50,${0.05 + r() * 0.13})`;
    g.fillRect(0, r() * 128, 128, 2 + r() * 7);
  }
  grain(g, 128, 61, 18);
  return tiling(c);
}

/**
 * …and the trowel swirl, which is the one mark a park surface has that the
 * plaza does not. A power float leaves broad shallow arcs where the machine
 * turned, and they are most of why a transition catches the low sun in bands
 * rather than evenly.
 */
function parkCanvas(): THREE.CanvasTexture {
  const c = concreteCanvas(2, "#c3c5c6", 0.15, 71);
  const g = (c.image as HTMLCanvasElement).getContext("2d");
  if (!g) return c;
  const r = rng(73);
  for (let i = 0; i < 22; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.03 + r() * 0.05})`;
    g.lineWidth = 5 + r() * 16;
    const x = r() * 256;
    const y = r() * 256;
    g.beginPath();
    g.arc(x, y, 40 + r() * 90, r() * 6.28, r() * 6.28 + 1.2);
    g.stroke();
  }
  c.needsUpdate = true;
  return c;
}

/**
 * The ground's own history, in TWO layers at pitches that share no factor.
 *
 * An ALPHA veil, not a multiply layer. Multiplied wear is the physically right
 * answer — dirt has no brightness of its own, it takes away from whatever the
 * sun is doing — and it was written that way first. Measured: `MultiplyBlending`
 * came back OPAQUE over this pipeline, and the whole plaza rendered white. The
 * spray already proves plain alpha composites correctly here, so the wear uses
 * what is known to work and pays for it with a veil that does not darken any
 * further inside a shadow.
 *
 * The split is the fix for what one layer could not stop being. A single canvas
 * covered edge to edge in marks and tiled at 16 m repeats four times across the
 * plaza and 4 x 4 on screen at once, and at that density every copy carries the
 * same silhouette of stuff — so it read as a PATTERN, and the marks themselves
 * were the loudest thing in the frame. It carried 18 crack walks of 7 segments
 * forking both ways (about 230 m of drawn crack in every 16 x 16 m tile — 0.9 m
 * of crack per square metre of plaza) and 14 tyre scuffs up to 44 cm wide, all
 * on a floor that is supposed to be concrete somebody skates.
 *
 * So: `groundStainCanvas` is broad pooling only, at 37 m, and it is what makes
 * the floor not new. `groundGrimeCanvas` is the close-up detail at 16 m, a
 * third of the marks it had, and — the part that actually kills the repeat —
 * masked by big soft blotches, so most of any given tile is CLEAN floor. Two
 * incommensurate layers whose busy parts land in different places is the same
 * trick the brick walls run at 9 m and 23 m, and for the same reason.
 */
function groundStainCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.clearRect(0, 0, 256, 256);
  const r = rng(137);
  // Soft pooling, and it is COLOURED now rather than only dark. A plaza this
  // size is not one pour: some of it went down warmer, some of it has gone
  // grey, and a floor that only ever gets darker in patches still reads as one
  // material with dirt on it. The verifier's word for the opening shot was "car
  // park", and the loudest reason was that 60% of the frame was one tone.
  // Zones of tone at 37 m — a pitch nothing else in the level shares — are what
  // give it somewhere lighter and somewhere darker to be.
  //
  // Twice the strength it shipped at, because it was measurably invisible: the
  // peak alpha was 0.17 over a texture the generator had already flattened.
  for (let i = 0; i < 26; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const rad = 26 + r() * 78;
    const warm = r() < 0.42;
    const tone = warm ? "126,96,58" : "56,52,46";
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(${tone},${0.14 + r() * 0.2})`);
    grad.addColorStop(0.55, `rgba(${tone},${0.06 + r() * 0.1})`);
    grad.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  return tiling(c);
}

function groundGrimeCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(512);
  g.clearRect(0, 0, 512, 512);
  const r = rng(131);
  // Cracks. Thin, dark and SHORT — a crack is a hairline that has let dirt in,
  // and the old ones were 3 px of pale grey, which at this tile is a 9 cm line
  // LIGHTER than the concrete. One walk out of the seed, and only sometimes a
  // fork, because a crack that branches both ways every time reads as a leaf.
  g.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    const x = r() * 512;
    const y = r() * 512;
    const a = r() * Math.PI * 2;
    const arms = r() < 0.45 ? [1, -1] : [1];
    for (const dir of arms) {
      g.strokeStyle = `rgba(46,41,36,${0.4 + r() * 0.24})`;
      g.lineWidth = 0.8 + r() * 1.4;
      g.beginPath();
      g.moveTo(x, y);
      let cx = x;
      let cy = y;
      let ca = a + (dir > 0 ? 0 : Math.PI);
      for (let k = 0; k < 4; k++) {
        ca += (r() - 0.5) * 0.9;
        cx += Math.cos(ca) * (10 + r() * 24);
        cy += Math.sin(ca) * (10 + r() * 24);
        g.lineTo(cx, cy);
      }
      g.stroke();
    }
  }
  // Tyre and truck scuffs — long shallow arcs. Half as many, and faint enough
  // that they read as something that happened rather than something drawn.
  for (let i = 0; i < 12; i++) {
    g.strokeStyle = `rgba(60,56,52,${0.12 + r() * 0.16})`;
    g.lineWidth = 6 + r() * 12;
    const x = r() * 512;
    const y = r() * 512;
    const a = r() * Math.PI * 2;
    const len = 80 + r() * 220;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 90,
      y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 90,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
    );
    g.stroke();
  }
  // …and the coverage mask, which is what stops the tile being a motif: keep
  // the marks only where these blotches are, so roughly half of every copy is
  // clean floor and no two copies show the same half.
  g.globalCompositeOperation = "destination-in";
  for (let i = 0; i < 17; i++) {
    const x = r() * 512;
    const y = r() * 512;
    const rad = 80 + r() * 140;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(0,0,0,${0.85 + r() * 0.15})`);
    grad.addColorStop(0.6, "rgba(0,0,0,0.45)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
  return tiling(c);
}

/**
 * Dirt climbing a wall out of the pavement — splashback, and the dark line
 * where a facade meets the ground. One tile per strip vertically, so it is
 * anchored to the bottom of the wall instead of repeating up it.
 */
function wallGrimeCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.clearRect(0, 0, 256, 256);
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, "rgba(34,30,25,0.62)");
  grad.addColorStop(0.22, "rgba(44,39,32,0.36)");
  grad.addColorStop(0.62, "rgba(52,46,38,0.12)");
  grad.addColorStop(1, "rgba(52,46,38,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const r = rng(149);
  // Streaks, so the band is not a clean gradient anybody reads as a gradient.
  for (let i = 0; i < 70; i++) {
    const x = r() * 256;
    const h = 40 + r() * 150;
    g.fillStyle = `rgba(28,24,20,${0.04 + r() * 0.12})`;
    g.fillRect(x, 256 - h, 1 + r() * 5, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A skated ledge edge: wax gone dark and glassy along the grind line, chipped
 * back to raw aggregate where trucks have landed on it. Runs along the strip,
 * so u is distance down the ledge and v crosses the arris.
 */
function waxCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.clearRect(0, 0, 256, 256);
  // The polished band sits ON the arris — strongest at the edge itself, gone
  // by the time it reaches concrete nobody's trucks have touched.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "rgba(46,41,36,0)");
  grad.addColorStop(0.3, "rgba(46,41,36,0.34)");
  grad.addColorStop(0.5, "rgba(38,33,29,0.5)");
  grad.addColorStop(0.7, "rgba(46,41,36,0.34)");
  grad.addColorStop(1, "rgba(46,41,36,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const r = rng(163);
  // Chips: pale, because a chip is fresh concrete out from under the wax.
  for (let i = 0; i < 44; i++) {
    g.fillStyle = `rgba(228,220,203,${0.16 + r() * 0.26})`;
    g.beginPath();
    g.ellipse(r() * 256, 88 + r() * 80, 3 + r() * 9, 2 + r() * 6, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // …and the darker smears between them.
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(26,23,20,${0.08 + r() * 0.16})`;
    g.fillRect(r() * 256, 96 + r() * 64, 8 + r() * 60, 3 + r() * 10);
  }
  return tiling(c);
}

/**
 * A TRANSITION'S OWN HISTORY, toe to lip — the layer a ramp in this level has
 * never had, and the reason a 65° curve read as varnished plywood.
 *
 * Every wear layer in this file lands on FLAT tops: `buildPaint`'s stain and
 * grime pass skips anything whose profile is not flat, and `markFloorAt` refuses
 * an oil pool, a tar patch or a skid on a sloped solid outright. So the plaza
 * carried two veils, twenty-eight patches, sixteen skids and nine manholes, and
 * the ramp growing out of the same pour carried nothing at all. What you saw on
 * a transition was 100% lighting: the same surface came back near-white in a
 * fixed camera and chocolate brown in the game, because there was nothing else
 * in it to look at.
 *
 * This is the half of it that is ORIENTED, and it is the three marks a
 * transition has that a floor does not:
 *
 * · the DIRT LINE at the toe — grit, leaves and washed silt collect where the
 *   trans meets the flat, and it is the single mark that says which way up a
 *   ramp is;
 * · the WASH down the face — rain runs off a transition, so the streaks are
 *   vertical and the face is cleaner than the ground either side of it;
 * · the WAX BAND under the lip — the most-skated 30 cm of concrete on the spot,
 *   gone dark and glassy the way `waxCanvas` has every ledge arris in the level
 *   going. Only the arcs get it (see `buildSlopeWear`), because only an arc
 *   knows which of its ends is a lip.
 *
 * v runs 0 at the toe and 1 at the lip. `flipY` puts canvas row 0 at v = 1, so
 * the wax is drawn at the TOP of the image and the grit at the bottom.
 */
function transitionWearCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(512);
  g.clearRect(0, 0, 512, 512);
  const r = rng(419);
  // The wax band, in the top 14% — the 30 cm under a lip that a coping session
  // actually polishes.
  const wax = g.createLinearGradient(0, 0, 0, 72);
  wax.addColorStop(0, "rgba(34,30,26,0.5)");
  wax.addColorStop(0.4, "rgba(42,37,32,0.34)");
  wax.addColorStop(1, "rgba(48,42,36,0)");
  g.fillStyle = wax;
  g.fillRect(0, 0, 512, 72);
  // Chips out of it: a coping gets landed on, and a chip is fresh concrete from
  // under the wax rather than more dirt.
  //
  // AND THESE ARE THE "LITTER PARTICLES HOVERING IN MID-AIR OFF THE COPING".
  // Three separate captures reported a band of pale flakes floating above the
  // quarter pipe's lip and every one of them blamed `buildLitter`; the litter
  // was moved off the ramps entirely and the flakes were still there, because
  // they were never litter. They were drawn here, at radii of 3–13 by 2–7 px on
  // a card whose u is 6.5 m and whose v is the whole 5.1 m arc — so a "chip"
  // came out up to 33 cm across in cream at 38% over brown concrete, scattered
  // down the top eighth of the face. That is not a chip in a wax band, that is a
  // sheet of paper, and forty of them across a ramp is a drift of them.
  //
  // A real chip is a thumbnail of pale aggregate where a truck landed. So: half
  // the alpha, a third of the size, and a paler grey rather than cream — 4–14 cm
  // across, which is what the thing being drawn actually measures.
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(206,199,187,${0.07 + r() * 0.12})`;
    g.beginPath();
    g.ellipse(r() * 512, 5 + r() * 34, 1.4 + r() * 3.6, 1 + r() * 2.4, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // The dirt line at the toe, in the bottom fifth.
  const grit = g.createLinearGradient(0, 512, 0, 396);
  grit.addColorStop(0, "rgba(40,34,26,0.58)");
  grit.addColorStop(0.34, "rgba(48,41,32,0.3)");
  grit.addColorStop(1, "rgba(54,47,37,0)");
  g.fillStyle = grit;
  g.fillRect(0, 396, 512, 116);
  // …with grit in it, so the line is a deposit and not a gradient.
  for (let i = 0; i < 260; i++) {
    const y = 512 - Math.pow(r(), 1.7) * 108;
    g.fillStyle = `rgba(${28 + r() * 40 | 0},${24 + r() * 34 | 0},${18 + r() * 26 | 0},${0.2 + r() * 0.4})`;
    g.fillRect(r() * 512, y, 1 + r() * 3, 1 + r() * 2);
  }
  // The wash: vertical streaks running the whole face, strongest near the toe
  // because that is where what ran down it ended up.
  for (let i = 0; i < 90; i++) {
    const x = r() * 512;
    const top = 60 + r() * 300;
    const grad = g.createLinearGradient(0, top, 0, 512);
    grad.addColorStop(0, "rgba(38,33,27,0)");
    grad.addColorStop(1, `rgba(38,33,27,${0.06 + r() * 0.14})`);
    g.fillStyle = grad;
    g.fillRect(x, top, 1 + r() * 6, 512 - top);
  }
  // AND NO RUBBER HERE. The first cut drew fourteen long scuff arcs across the
  // face, which is what a transition really has — and at a 6.5 m tile across a
  // 20 m ramp that is three copies of the same fourteen arcs, which on capture
  // read as one big C-shape repeating across the pipe. That is the exact defect
  // this whole pass exists to remove, re-created in a different colour. The
  // rubber belongs on the layer that is anchored in WORLD space and masked so
  // half of every copy is bare (`groundGrimeCanvas`), which now runs up the
  // ramps too — so it is already there and it does not repeat. What is left in
  // this image is only the three things that are a function of HEIGHT up the
  // face, and a gradient cannot be a motif.
  const t = new THREE.CanvasTexture(c);
  // Across the face it repeats; up the face it must not — the toe and the lip
  // are anchored to the two ends of the ramp and a wrap would put a dirt line
  // across the middle of the transition.
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * THE GRAIN A PHOTOGRAPH OF A FLOOR DOES NOT HAVE — and the floor is half of
 * every frame in this game.
 *
 * The four generated concretes are honest photographs and they are also, all
 * four, nearly featureless: the plaza pour is 232,230,222 with a low-contrast
 * saw-cut grid on it and almost no aggregate in the image at all, the park pour
 * is 215,218,218 with soft float arcs. Measured on a gameplay frame, high-pass
 * luminance sd came back 3.6 on the plaza and 3.2 on the quarter-pipe
 * transition, against 14.5 on the brick wall behind them. The wall you cannot
 * ride carried four times the material of the floor you spend the whole game
 * looking at. Between the joint lines there was nothing — the joints WERE the
 * texture — and "an empty flat untextured surface" is this project's own named
 * automatic fail.
 *
 * That is not fixable by tiling the photograph harder: at 7.2 m a plaza tile is
 * already life-size, and shrinking it would make the slabs the wrong size to
 * fight a defect that is in the photograph rather than in the scale. What is
 * missing is the layer under the slabs — sand, exposed aggregate, air pops, the
 * blotchy cream a float leaves — which is a HALF-METRE phenomenon and no
 * seven-metre photograph of a plaza has it.
 *
 * So it is drawn once, here, as a value-only card, and multiplied into the
 * basecolor of every ridable surface by `groundFinish` below. Three things
 * about it are load-bearing:
 *
 * · IT IS MULTI-SCALE. A 512 card at a 0.9 m pitch is 1.8 mm per pixel, which
 *   is beautiful under the board and gone by fifteen metres — the mip chain
 *   averages 3 mm stones back to flat grey long before the ledge you are aiming
 *   at. So most of the energy in it is at 10–35 cm (the float mottle), which
 *   survives minification, and the stones ride on top of that for the two
 *   metres in front of the trucks where they can actually be seen.
 * · IT WRAPS. Every blob is drawn nine times at ±512 so the card is seamless;
 *   a detail layer with a visible edge is a worse artefact than no detail.
 * · IT IS GREY, centred on 0.5. It says how much light comes back, never what
 *   colour — the ten surfaces were shot in one lighting register on purpose and
 *   a tint drawn in here is exactly how they stopped matching last time.
 */
function grainCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(512);
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 512, 512);
  const r = rng(9173);
  /** One soft blob, painted through all nine wraps so the card is seamless. */
  const blob = (x: number, y: number, rad: number, tone: number, alpha: number): void => {
    const rgb = `${tone},${tone},${tone}`;
    for (const dx of [-512, 0, 512]) {
      for (const dy of [-512, 0, 512]) {
        const px = x + dx;
        const py = y + dy;
        if (px < -rad || px > 512 + rad || py < -rad || py > 512 + rad) continue;
        const grad = g.createRadialGradient(px, py, 0, px, py, rad);
        grad.addColorStop(0, `rgba(${rgb},${alpha})`);
        grad.addColorStop(0.55, `rgba(${rgb},${alpha * 0.45})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(px, py, rad, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
  // The float mottle: where the cream came to the surface and where it did not.
  // This is the octave that is still there at twenty metres, so it carries most
  // of the contrast — 10–35 cm patches, half pale, half grey.
  for (let i = 0; i < 96; i++) {
    const pale = r() < 0.5;
    blob(r() * 512, r() * 512, 26 + r() * 76, pale ? 236 : 34, 0.16 + r() * 0.26);
  }
  // …and a second, coarser pass at a size the whole card can barely hold, so a
  // 0.9 m copy is never uniformly light or uniformly dark.
  for (let i = 0; i < 10; i++) {
    blob(r() * 512, r() * 512, 130 + r() * 110, r() < 0.5 ? 214 : 52, 0.1 + r() * 0.12);
  }
  // Exposed aggregate — 3–9 mm stones, both brighter and darker than the paste
  // they are set in, because a stone is quartz or it is basalt.
  for (let i = 0; i < 5200; i++) {
    const t = r();
    const tone = t < 0.42 ? 200 + r() * 46 : 46 + r() * 54;
    g.fillStyle = `rgba(${tone},${tone},${tone},${0.16 + r() * 0.34})`;
    g.beginPath();
    g.ellipse(r() * 512, r() * 512, 1.2 + r() * 3.4, 1.0 + r() * 2.6, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // Air pops: the little dark craters a poker leaves in a slab. Small, dark and
  // numerous, and they are most of what the eye reads as "concrete" up close.
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = `rgba(28,26,24,${0.18 + r() * 0.4})`;
    g.beginPath();
    g.arc(r() * 512, r() * 512, 0.7 + r() * 2.0, 0, Math.PI * 2);
    g.fill();
  }
  grain(g, 512, 9181, 30);
  const t = tiling(c);
  t.colorSpace = THREE.NoColorSpace; // a value card, not a colour
  // Four, where the surfaces themselves get sixteen. This card is fetched three
  // times per fragment on every floor in the level, so its filter cost is paid
  // three times over; and it is a value modulation rather than the picture, so
  // what it needs is not to SHIMMER on a grazing floor, which four buys. It is
  // clamped to the device's maximum on upload, so this is safe on any GPU.
  t.anisotropy = 4;
  return t;
}

/**
 * What the grain does to one surface — the numbers that turn a photograph into
 * a material.
 *
 * `grit` is how hard the card bites at close range and `coarse` how hard its
 * low-frequency half bites at every range; two taps of the same texture at
 * pitches that share no factor (0.9 m and 3.7 m), so the combined pattern only
 * repeats every thirty-odd metres and there is no 0.9 m motif to find.
 *
 * `matt` is a floor under the roughness map, and it is the fix for the other
 * half of what the surfaces were doing wrong: the generated roughness maps run
 * mid-grey, `dressMaterials` sets the material constant to 1 so the image can
 * do the work, and a mid-grey roughness under a 22° sun is a wet mirror. On
 * capture the plaza beside the terrace ramp carried a specular streak across it
 * with a matte ramp standing right next to it. Concrete does not do that; wax
 * on a transition does, which is why `park` is the one surface allowed low.
 */
interface Finish {
  grit: number;
  coarse: number;
  /** How hard the far-field tone drift bites. See GRAIN_MACRO. */
  drift: number;
  matt: number;
}

const FINISH: Record<Exclude<LookKey, "metal" | "fence">, Finish> = {
  // The oldest floor in the level and the one the camera lives on.
  concrete: { grit: 0.44, coarse: 0.28, drift: 0.17, matt: 0.72 },
  sidewalk: { grit: 0.38, coarse: 0.24, drift: 0.14, matt: 0.7 },
  // Asphalt is the one surface that already read correctly, so it takes the
  // least — enough to stop the road going flat at ten metres and no more.
  asphalt: { grit: 0.24, coarse: 0.16, drift: 0.1, matt: 0.62 },
  // A power float closes the surface, so a park pour has the least aggregate
  // showing of any concrete here — but "least" is not "none", and none is what
  // it had. It gets the SAME bite as the plaza in the end, and the reason is
  // where it is rather than what it is: every transition in this level is a
  // 5 m arc seen from ten to thirty metres away, so most of what is drawn on it
  // is already being eaten by the mip chain before it reaches the screen. Under
  // the board, where the two surfaces meet at the toe, they still read apart —
  // the trowelled pour is paler, cooler and glossier, which is the difference
  // that is actually true.
  park: { grit: 0.5, coarse: 0.36, drift: 0.18, matt: 0.64 },
  ledge: { grit: 0.32, coarse: 0.2, drift: 0.1, matt: 0.55 },
  // The brick walls already measure 9–14 of high-frequency detail and needed
  // none of this; what they take is the roughness floor, so the low sun stops
  // finding a specular sheet on them down the east alley.
  brick: { grit: 0, coarse: 0, drift: 0, matt: 0.6 },
  brick2: { grit: 0, coarse: 0, drift: 0, matt: 0.6 },
};

/**
 * Metres per copy of the two grain octaves. No common factor, on purpose: the
 * combined pattern only comes back round every thirty-odd metres, so there is
 * no 0.9 m motif in the plaza for an eye to lock onto.
 *
 * 2.5 rather than the 3.7 this shipped at, and the quarter pipe is why. The
 * coarse tap is the one that survives minification — it is 2.8 times bigger on
 * the texel, so it is still there at twenty-five metres where the fine one has
 * been averaged back to grey — and at 3.7 m a 5.1 m transition arc got one and a
 * third copies of it, which is not variation, it is a gradient. At 2.5 the ramp
 * crosses two whole copies from toe to lip.
 */
const GRAIN_FINE = 0.9;
const GRAIN_COARSE = 2.5;
/**
 * Where the fine octave is gone. It was 34, which put the fade's midpoint at
 * 22 m — and the quarter pipe, the ledges and the far half of the plaza are all
 * further away than that from where you stand. The mip chain will still take
 * most of it out there; this only stops the code taking out what the mip chain
 * had not.
 */
const GRAIN_FADE = 55;
/**
 * …and the third tap, which is the one for the FAR HALF OF THE PLAZA.
 *
 * Both octaves above are anchored to the surface's own UVs and both are gone by
 * about twenty-five metres — not because of the fade, but because a 0.9 m
 * feature is four screen pixels at that range and the mip chain has honestly
 * averaged it away. Measured on a real frame after the first two taps went in:
 * the plaza under the board came back at high-frequency sd 7.1 and the SAME
 * material thirty metres up the block at 2.9. Half the floor in every picture
 * is further off than the fade, so half the floor was still the flat thing the
 * whole complaint was about.
 *
 * What is legible at thirty metres is a thing several metres across, and on a
 * real plaza that thing is the POUR: a floor this size went down in bays over
 * weeks, some of it warmer, some of it greyer, some of it relaid, and the patch
 * you are looking at is a different age from the patch beside it. So the same
 * card is sampled a third time at 19 m — where its blobs are 2.7 to 8.4 m — and
 * anchored in WORLD XZ rather than in UVs, which is what lets one drift cross
 * the six plaza slabs, the footway and the road without a seam at any of the
 * joins. It does not fade with distance, because distance is what it is for.
 */
const GRAIN_MACRO = 19;

/**
 * Multiply the grain into a surface's basecolor and put a floor under its
 * roughness, in the surface's OWN UV space.
 *
 * `vMapUv` is world metres over `TILE[look]` by construction (see `meshSolid`),
 * which is the whole reason this can be done on the material rather than as
 * another transparent pass over the floor: multiplying `vMapUv` by
 * `TILE / pitch` gives real metres on flat slabs AND arc length up a
 * transition, so the aggregate does not stretch round the quarter pipe and does
 * not stop at its toe. A veil pass would have been a third full-screen layer of
 * overdraw on the surface that already covers most of the frame.
 */
function groundFinish(
  mat: THREE.MeshStandardMaterial,
  look: Exclude<LookKey, "metal" | "fence">,
  grainMap: THREE.Texture,
): void {
  const f = FINISH[look];
  const tile = TILE[look];
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.gxGrain = { value: grainMap };
    shader.uniforms.gxScale = { value: new THREE.Vector2(tile / GRAIN_FINE, tile / GRAIN_COARSE) };
    shader.uniforms.gxBite = { value: new THREE.Vector3(f.grit, f.coarse, f.drift) };
    shader.uniforms.gxMatt = { value: f.matt };
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        "varying float vGxDist;\nvarying vec2 vGxWorld;\nvoid main() {",
      )
      // `mvPosition` is still in scope after this chunk, and -z out of it is the
      // view distance the fine octave fades over. The world XZ the macro drift
      // rides on is worked from `transformed` for the same reason it is not
      // taken from `worldpos_vertex`: that chunk only defines `worldPosition`
      // when an envmap, a shadow or transmission happens to be switched on, and
      // a floor's material must not stop having grain because a light moved.
      .replace(
        "#include <project_vertex>",
        [
          "#include <project_vertex>",
          "vGxDist = -mvPosition.z;",
          "vGxWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;",
        ].join("\n"),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        [
          "uniform sampler2D gxGrain;",
          "uniform vec2 gxScale;",
          "uniform vec3 gxBite;",
          "uniform float gxMatt;",
          "varying float vGxDist;",
          "varying vec2 vGxWorld;",
          "void main() {",
        ].join("\n"),
      )
      .replace(
        "#include <map_fragment>",
        [
          "#include <map_fragment>",
          "float gxNear = 1.0 - smoothstep( GX_FADE * 0.3, GX_FADE, vGxDist );",
          "float gxA = texture2D( gxGrain, vMapUv * gxScale.x ).g - 0.5;",
          // The second tap is offset as well as rescaled: two taps of one card
          // at the same phase would still line their brightest patches up.
          "float gxB = texture2D( gxGrain, vMapUv * gxScale.y + vec2( 0.37, 0.61 ) ).g - 0.5;",
          "float gxC = texture2D( gxGrain, vGxWorld / GX_MACRO + vec2( 0.13, 0.79 ) ).g - 0.5;",
          "float gxWear = gxA * gxBite.x * gxNear + gxB * gxBite.y + gxC * gxBite.z;",
          "diffuseColor.rgb *= 1.0 + gxWear * 2.0;",
        ].join("\n"),
      )
      .replace(
        "#include <roughnessmap_fragment>",
        [
          "#include <roughnessmap_fragment>",
          "roughnessFactor = gxMatt + ( 1.0 - gxMatt ) * roughnessFactor;",
          // Dirtier is rougher. Without this the grain is albedo only and the
          // specular sheet over it stays perfectly smooth, which is what made a
          // stained plaza still read as polished.
          "roughnessFactor = clamp( roughnessFactor - gxWear * 0.8, 0.04, 1.0 );",
        ].join("\n"),
      )
      .replace(/GX_FADE/g, GRAIN_FADE.toFixed(1))
      .replace(/GX_MACRO/g, GRAIN_MACRO.toFixed(1));
  };
  // Every surface compiles the same source and differs only in uniforms, so
  // they share one program. Without this three keys the cache on the closure's
  // own text and would still share it — but silently, and a future edit that
  // inlined a number would then hand every floor the plaza's grit.
  mat.customProgramCacheKey = () => "gx-ground-finish";
}

/** A roller shutter, pulled down over a dead shopfront. */
function shutterCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(128);
  g.fillStyle = "#7e837c";
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 6) {
    g.fillStyle = y % 12 === 0 ? "#8f948c" : "#6b706a";
    g.fillRect(0, y, 128, 3);
  }
  const r = rng(181);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${90 + r() * 40},${70 + r() * 30},${50 + r() * 30},${0.1 + r() * 0.25})`;
    g.fillRect(r() * 128, r() * 128, 3 + r() * 18, 2 + r() * 10);
  }
  // The lock box at the bottom rail, which is the detail that says "shutter".
  g.fillStyle = "#4a4f4a";
  g.fillRect(0, 120, 128, 8);
  g.fillStyle = "#33372f";
  g.fillRect(54, 121, 20, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A shop window: dark glass, a stall riser, a mullion, something inside. */
function shopGlassCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#4a5561");
  grad.addColorStop(0.5, "#232b33");
  grad.addColorStop(1, "#161b21");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const r = rng(191);
  // Warm interior, seen through it — the reason it reads as a shop and not a hole.
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(${200 + r() * 55},${150 + r() * 60},${80 + r() * 60},${0.14 + r() * 0.2})`;
    g.fillRect(8 + r() * 100, 40 + r() * 60, 8 + r() * 28, 10 + r() * 40);
  }
  // Sky reflected in the top third, raking across it.
  g.fillStyle = "rgba(190,206,220,0.22)";
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(128, 0); g.lineTo(128, 26); g.lineTo(0, 52); g.fill();
  g.fillStyle = "#6d6357";
  g.fillRect(0, 108, 128, 20); // stall riser
  g.strokeStyle = "#7b7166";
  g.lineWidth = 7;
  g.strokeRect(0, 0, 128, 128);
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(64, 4); g.lineTo(64, 108); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The fascia over a shopfront. Blocky invented lettering — a sign has to read
 * as type from thirty metres and must not read as anybody's actual sign.
 */
function fasciaCanvas(seed: number): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  const r = rng(seed);
  const hues = [12, 30, 200, 150, 350, 44];
  const hue = hues[Math.floor(r() * hues.length)];
  g.fillStyle = `hsl(${hue} ${28 + r() * 40}% ${16 + r() * 18}%)`;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fillRect(0, 0, 256, 8);
  g.fillStyle = `hsl(${(hue + 30) % 360} 70% ${72 + r() * 16}%)`;
  let x = 18;
  while (x < 236) {
    const w = 8 + r() * 16;
    g.fillRect(x, 22, w, 22);
    x += w + 5 + r() * 6;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * THE THINGS THAT HAVE HAPPENED TO THIS FLOOR — one alpha cut-out each.
 *
 * The wear layers are veils: they tile, they are soft, and they can only ever
 * make the concrete a bit dirtier in some places than others. What the opening
 * shot had none of is EVENTS — a hard-edged patch somebody cut and filled, a
 * car that stood there long enough to drip, a truck that locked its wheels, a
 * manhole. Those are the things an eye finds and fixes on, and without any of
 * them 60% of the frame was a tile pattern with a gradient over it. They are
 * placed individually rather than tiled, so they never repeat and they can be
 * put where the camera actually looks.
 */
function oilCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(128);
  g.clearRect(0, 0, 128, 128);
  const r = rng(401);
  // The pool: soft-edged and roughly round, because an oil stain has soaked IN
  // rather than been thrown. The first version drew three ragged polygons over
  // each other and rendered as a splat of mud with lobes on it.
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 54);
  grad.addColorStop(0, "rgba(16,14,13,0.55)");
  grad.addColorStop(0.45, "rgba(22,19,17,0.34)");
  grad.addColorStop(0.78, "rgba(30,26,22,0.14)");
  grad.addColorStop(1, "rgba(30,26,22,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fill();
  // …with the edge bitten into, so it is not a disc.
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2;
    const d = 40 + r() * 22;
    g.beginPath();
    g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 8 + r() * 16, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
  // …and the drips around it, which is what says a vehicle stood here.
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(24,20,17,${0.14 + r() * 0.3})`;
    g.beginPath();
    g.ellipse(14 + r() * 100, 14 + r() * 100, 1.5 + r() * 5, 1.5 + r() * 4, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A cut-and-fill repair: fresh tar inside a saw-cut somebody was paid to make.
 *
 * THIS IS THE DIAMOND, and it is worth writing down because it took a fresh
 * pair of eyes to see and there was nothing in the file to attribute it to.
 * One canvas — a single quadrilateral with a hard dark stroke round it — was
 * shared by all seventy-two patches, and `buildGroundMarks` laid every one of
 * them at `r() * Math.PI`. Free rotation on ONE silhouette is not variety: at
 * 45° a quad is a diamond, and what the plaza actually carried was the same
 * 1.5 m dark-grey diamond over and over, cutting across the slab joints on what
 * read as a lattice. It was the clearest of the level's "slightly weird
 * elements" and it was drawn by the layer that exists to make the floor look
 * repaired.
 *
 * So there are three of them now, and the shapes are what a saw does. A repair
 * is cut with a floor saw, and a floor saw follows the slab: `seed` 0 is a long
 * shallow trench for a service run, 1 is a squarer excavation, 2 is a narrow
 * upright one. `buildGroundMarks` lays them square to the plaza's own grid to
 * match, which is the other half of why the old ones read as objects lying on
 * the floor rather than as holes cut in it.
 */
function patchCanvas(seed: number): THREE.CanvasTexture {
  const { c, g } = canvas(128);
  g.clearRect(0, 0, 128, 128);
  const r = rng(419 + seed * 53);
  // How much of the card the cut fills, across and up. A patch is drawn INSIDE
  // its quad rather than filling it, so three cards of one square mesh give
  // three real aspect ratios and the mesh never has to change.
  const inset: [number, number] = seed === 0 ? [6, 34] : seed === 1 ? [10, 12] : [38, 8];
  const x0 = inset[0];
  const y0 = inset[1];
  const x1 = 128 - inset[0];
  const y1 = 128 - inset[1];
  // Weathered, not fresh. At 0.86 alpha over a near-black grey these read as
  // holes cut in the plaza rather than as repairs made in it — a patch that has
  // been walked on for two years is a shade or two off the slab around it.
  g.fillStyle = "rgba(92,88,83,0.44)";
  g.beginPath();
  // Four corners with a couple of millimetres of wander each — a saw cut is
  // straight, and the straightness is the tell, so the jitter stays small.
  g.moveTo(x0 + r() * 4, y0 + r() * 4);
  g.lineTo(x1 - r() * 4, y0 + r() * 3);
  g.lineTo(x1 - r() * 3, y1 - r() * 4);
  g.lineTo(x0 + r() * 4, y1 - r() * 3);
  g.closePath();
  g.fill();
  // The bitumen seal squeezed out along the cut — the tell of a real patch.
  g.strokeStyle = "rgba(42,38,35,0.4)";
  g.lineWidth = 4;
  g.stroke();
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${96 + r() * 60},${92 + r() * 55},${88 + r() * 50},${0.1 + r() * 0.22})`;
    g.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1 + r() * 4, 1 + r() * 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Rubber: a wheel that stopped turning before the vehicle did. */
function skidCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(128);
  g.clearRect(0, 0, 128, 128);
  const r = rng(433);
  for (const lane of [40, 84]) {
    g.strokeStyle = "rgba(26,24,24,0.5)";
    g.lineWidth = 12 + r() * 6;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(6, lane + (r() - 0.5) * 10);
    g.bezierCurveTo(44, lane + (r() - 0.5) * 22, 84, lane + (r() - 0.5) * 22, 122, lane + (r() - 0.5) * 12);
    g.stroke();
  }
  // Fade both ends, so a skid arrives and leaves instead of being a bar.
  g.globalCompositeOperation = "destination-in";
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.28, "rgba(0,0,0,0.95)");
  grad.addColorStop(0.72, "rgba(0,0,0,0.8)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = "source-over";
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Cast iron in a concrete collar — a cover, and the gully grate beside it. */
function ironCanvas(grate: boolean): THREE.CanvasTexture {
  const { c, g } = canvas(128);
  g.clearRect(0, 0, 128, 128);
  const r = rng(grate ? 449 : 457);
  if (grate) {
    g.fillStyle = "rgba(96,90,84,0.95)";
    g.fillRect(10, 30, 108, 68);
    g.fillStyle = "rgba(28,26,24,0.92)";
    for (let i = 0; i < 7; i++) g.fillRect(18 + i * 14, 38, 8, 52);
    g.strokeStyle = "rgba(60,56,52,0.9)";
    g.lineWidth = 5;
    g.strokeRect(10, 30, 108, 68);
  } else {
    g.fillStyle = "rgba(104,98,90,0.95)";
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(72,66,60,0.95)";
    g.beginPath();
    g.arc(64, 64, 48, 0, Math.PI * 2);
    g.fill();
    // The waffle a cover is cast with, dark enough to read from a board.
    g.fillStyle = "rgba(38,35,32,0.75)";
    for (let a = 0; a < 8; a++) {
      for (let b = 0; b < 8; b++) {
        const x = 22 + a * 11;
        const y = 22 + b * 11;
        if (Math.hypot(x - 64, y - 64) > 44) continue;
        g.fillRect(x, y, 7, 7);
      }
    }
    g.strokeStyle = "rgba(150,142,130,0.5)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 24; i++) {
    g.fillStyle = `rgba(${120 + r() * 50},${80 + r() * 40},${44 + r() * 30},${0.05 + r() * 0.16})`;
    g.fillRect(r() * 128, r() * 128, 2 + r() * 9, 2 + r() * 7);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Loose paper, a leaf, a flattened can. Alpha cut-outs, laid on the ground. */
function litterCanvas(kind: 0 | 1 | 2): THREE.CanvasTexture {
  const { c, g } = canvas(64);
  g.clearRect(0, 0, 64, 64);
  const r = rng(211 + kind * 17);
  if (kind === 0) {
    g.fillStyle = "#ded6c4";
    g.beginPath();
    g.moveTo(10, 18);
    for (let i = 0; i < 7; i++) g.lineTo(10 + r() * 44, 12 + r() * 40);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(120,112,98,0.7)";
    g.lineWidth = 1.5;
    g.stroke();
  } else if (kind === 1) {
    g.fillStyle = "#8a6a2c";
    g.beginPath();
    g.ellipse(32, 32, 18, 9, 0.6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(60,44,18,0.8)";
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(16, 42); g.lineTo(48, 22); g.stroke();
  } else {
    g.fillStyle = "#9aa2a8";
    g.beginPath();
    g.ellipse(32, 32, 16, 7, 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#c0392b";
    g.fillRect(20, 28, 24, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Chain link, as an alpha mask — the diamonds are holes, not paint. */
function fenceCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = "#b9c0c6";
  g.lineWidth = 3;
  for (let i = -128; i < 256; i += 22) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 128, 128);
    g.moveTo(i + 128, 0);
    g.lineTo(i, 128);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A window: frame, mullions, and glass that goes pale toward the top. Plain
 * dark quads read as holes punched in the brick from anywhere in the plaza —
 * the gradient is what makes them read as glass with sky in it.
 */
function windowCanvas(lit: boolean): THREE.CanvasTexture {
  const { c, g } = canvas(128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  if (lit) {
    grad.addColorStop(0, "#ffcf88");
    grad.addColorStop(1, "#c07a2e");
  } else {
    grad.addColorStop(0, "#8ea8bd");
    grad.addColorStop(0.45, "#3d4c5c");
    grad.addColorStop(1, "#181d25");
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#7c7166";
  g.lineWidth = 11;
  g.strokeRect(0, 0, 128, 128);
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(64, 6);
  g.lineTo(64, 122);
  g.moveTo(6, 58);
  g.lineTo(122, 58);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A spray piece: fat outlined blobs in two saturated colours. Reads at 30 m. */
function graffitiCanvas(seed: number): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.clearRect(0, 0, 256, 256);
  const r = rng(seed);
  const hue = Math.floor(r() * 360);
  const fill = `hsl(${hue} 85% 55%)`;
  const shade = `hsl(${(hue + 40) % 360} 90% 35%)`;
  g.lineJoin = "round";
  g.lineCap = "round";
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass === 0 ? "#12100f" : fill;
    g.lineWidth = pass === 0 ? 34 : 22;
    for (let s = 0; s < 4; s++) {
      g.beginPath();
      let x = 26 + s * 56 + r() * 12;
      let y = 90 + r() * 60;
      g.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        x += (r() - 0.3) * 40;
        y += (r() - 0.5) * 90;
        g.lineTo(THREE.MathUtils.clamp(x, 20, 236), THREE.MathUtils.clamp(y, 40, 216));
      }
      g.stroke();
    }
  }
  g.fillStyle = shade;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc(30 + r() * 200, 40 + r() * 180, 5 + r() * 9, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Road paint: the dashed centre line and the yellow kerb edges.
 *
 * 512, not the 1024 it shipped at. This canvas holds eleven rectangles and two
 * stripes; the extra rung cost 4.2 MB of phone VRAM to render the same three
 * straight edges, and the road is seen at a raking angle where the anisotropic
 * filter is doing the work anyway.
 */
function markingsCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(512);
  g.clearRect(0, 0, 512, 512);
  g.fillStyle = "rgba(232,226,196,0.82)";
  // The canvas maps onto the whole road strip: x across the page, z down it.
  for (let x = 0; x < 512; x += 39) g.fillRect(x, 250, 22, 11);
  g.fillStyle = "rgba(212,180,60,0.7)";
  g.fillRect(0, 46, 512, 7);
  g.fillRect(0, 458, 512, 7);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Paint-out: the mismatched rollered patches a building owner puts over a tag,
 * plus the soot and water staining that goes with them.
 *
 * This is the second half of the brick de-tiling (see TILE in spot.ts for the
 * first). The generated brick basecolor carries one large black throw-up, and
 * the tile pitch — 9 m on brick, 7.5 on brick2 — is the SAME on every copy, so
 * seven of them marched along the north facade in step. A veil at a pitch that
 * shares no factor with either (23 m) puts a different patch over each copy: the
 * repeat is still there in the brick, and the eye stops being able to match it.
 * Which is also exactly what a real wall on a spot like this looks like.
 */
function paintOutCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(512);
  g.clearRect(0, 0, 512, 512);
  const r = rng(277);
  // The patches. Roller-width bands, buff and grey, with a ragged top edge —
  // nobody cuts in above head height.
  for (let i = 0; i < 6; i++) {
    const w = 60 + r() * 150;
    const h = 60 + r() * 150;
    const x = r() * 512;
    const y = r() * 512;
    const tone = r();
    // Knocked right back from the 0.62–0.90 it shipped at. At that strength six
    // opaque buff slabs a storey high stood across every facade in the level and
    // the wall stopped being brick — worse, they buried the paint, which is the
    // one thing on these walls the player asked for. A paint-out is a patch
    // somebody rollered, not a re-clad: it has to be legible and lose.
    g.fillStyle =
      tone < 0.45
        ? `rgba(${168 + r() * 26},${158 + r() * 24},${138 + r() * 22},${0.3 + r() * 0.16})`
        : `rgba(${104 + r() * 30},${100 + r() * 28},${96 + r() * 26},${0.26 + r() * 0.16})`;
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, y + 14);
    for (let k = 0; k <= 6; k++) g.lineTo(x + (w * k) / 6, y + r() * 26);
    g.lineTo(x + w, y + h);
    g.closePath();
    g.fill();
    // Roller nap: the horizontal streaks that stop a patch reading as a swatch.
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.035})`;
      g.fillRect(x, y + 10 + r() * (h - 12), w, 1 + r() * 3);
    }
  }
  // Water staining down from the parapet, and soot in the lee of it.
  for (let i = 0; i < 26; i++) {
    const x = r() * 512;
    const h = 60 + r() * 300;
    g.fillStyle = `rgba(38,34,29,${0.05 + r() * 0.12})`;
    g.fillRect(x, 0, 2 + r() * 16, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A block of city, seen from across the plaza. Storeys, a window grid, a
 * parapet band — nothing that has to survive a close look, everything that has
 * to survive being the top third of the frame.
 *
 * The skyline shipped as untextured boxes in one flat tan, sitting directly on
 * top of facades that carry brick, shopfronts, dirt and paint. It is the first
 * thing in the frame that says "this is a model", and it says it across the
 * whole width of the picture. One tile is 12 m — four storeys and four bays —
 * so a 13 m mass gets one and a 6 m one gets half, and no two are the same
 * width, which is what stops the grid marching.
 */
function distantBlockCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  const r = rng(613);
  g.fillStyle = "#7d6b5c";
  g.fillRect(0, 0, 256, 256);
  // Storey banding first — a distant building reads as horizontal lines long
  // before it reads as windows.
  for (let y = 0; y < 256; y += 64) {
    g.fillStyle = `rgba(255,236,208,${0.05 + r() * 0.05})`;
    g.fillRect(0, y, 256, 3);
    g.fillStyle = "rgba(40,32,26,0.18)";
    g.fillRect(0, y + 60, 256, 4);
  }
  // …then the windows, four to a storey, dark and a few of them alight.
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * 64 + 16;
      const y = row * 64 + 16;
      const lit = r() < 0.16;
      g.fillStyle = lit ? `rgba(255,190,110,${0.75 + r() * 0.25})` : `rgba(22,21,26,${0.78 + r() * 0.22})`;
      g.fillRect(x, y, 32, 30);
      g.fillStyle = "rgba(255,240,220,0.10)";
      g.fillRect(x, y, 32, 5);
    }
  }
  // Soot down the face, so the mass is not one even tone.
  for (let i = 0; i < 22; i++) {
    g.fillStyle = `rgba(44,36,30,${0.04 + r() * 0.1})`;
    g.fillRect(r() * 256, 0, 3 + r() * 20, 40 + r() * 216);
  }
  grain(g, 256, 617, 16);
  return tiling(c);
}

/**
 * The zebra, which lives on the raised crossing rather than on the road.
 *
 * NOTHING CALLS THIS — the zebra was pulled from the level on 2026-07-29 (see
 * `buildPaint`). It is `export`ed only so `noUnusedLocals` lets the recipe stay
 * in the file: the crossing table it belonged to is still there and still
 * ridden, so this is one call site away from coming back.
 */
export function crossingCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = "rgba(226,220,198,0.62)";
  for (let i = 0; i < 11; i++) g.fillRect(10 + i * 22, 20, 11, 216);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------

export type SpotMaterials = Record<LookKey, THREE.MeshStandardMaterial>;

export function createMaterials(): SpotMaterials {
  const std = (
    map: THREE.Texture | null,
    color: number,
    roughness: number,
    metalness = 0,
  ): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ map, color, roughness, metalness });

  // No `repeat` here, and that is the point: spot.ts already lays the UVs out
  // in world metres over TILE.fence, so a repeat on the material multiplies a
  // scale that is already correct. It shipped at repeat(30, 2) on top of those
  // UVs — about 25 chain-link tiles to the metre, which renders as grey
  // aliasing and nothing you would call a fence.
  const fence = new THREE.MeshStandardMaterial({
    map: fenceCanvas(),
    color: 0xb6bcc2,
    roughness: 0.45,
    metalness: 0.6,
    transparent: true,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
  });

  const out: SpotMaterials = {
    // Four bays to a tile, well worn — the plaza is the oldest floor here.
    concrete: std(concreteCanvas(4, "#b7b0a3", 1, 7), 0xffffff, 0.93),
    // …and sixteen small panels, cleaner, because a footway gets relaid.
    sidewalk: std(concreteCanvas(4, "#bcb8b0", 0.55, 17), 0xffffff, 0.9),
    asphalt: std(asphaltCanvas(), 0xffffff, 0.96),
    // The one surface in the level that is meant to shine: a trowelled
    // transition is glassy where it has been waxed, and 0.62 against the
    // plaza's 0.93 is what makes the ramp catch the low sun and the floor not.
    park: std(parkCanvas(), 0xffffff, 0.62),
    ledge: std(ledgeCanvas(), 0xffffff, 0.52),
    brick: std(brickCanvas(), 0xffffff, 0.9),
    // Same texture, a different block. Four identical red walls is what made
    // the plaza read as a box — one warm brick block and one bleached, painted
    // one gives the place a north side and a south side.
    brick2: std(brickCanvas(), 0xffffff, 0.88),
    // Dull galvanised steel, not chrome. At 0.32 roughness / 0.85 metalness
    // the rails took the whole sky as one specular sheet and read as glowing
    // white pipes from every camera in the harness.
    metal: std(null, 0x767d85, 0.52, 0.7),
    fence,
  };

  // The grain goes on at CONSTRUCTION, not when the generated surfaces land, so
  // the stand-in floors carry it too — the spot is playable from the first frame
  // and the first frame should not be the one flat one.
  //
  // One card shared by every surface. It is a value-only detail layer, so there
  // is nothing per-surface in the image; what differs is how hard each material
  // bites into it, and that is in FINISH.
  const grainMap = grainCanvas();
  for (const look of Object.keys(FINISH) as (keyof typeof FINISH)[]) {
    groundFinish(out[look], look, grainMap);
  }
  return out;
}

/**
 * What each surface is made of, in one table.
 *
 * `tint` is the ONLY per-surface number left, and the comment on the URL block
 * above is the rule it obeys: it is a value multiplier that brings a bright
 * photographic basecolor down to a believable albedo, never a colour grade to
 * make one surface agree with another. Concrete is ~0.35 in life, asphalt
 * ~0.12, brick ~0.32; the images arrive at 0.6–0.9, so these are the numbers
 * that put them back. Every one of them is a neutral or near-neutral grey —
 * if a future round finds itself typing an amber in here, the surfaces have
 * stopped matching again and the answer is upstream, not in this column.
 *
 * `bump` is how hard the normal map pushes. It is not one number because the
 * surfaces are not one depth: a crack-seal seam in asphalt is a real 15 mm
 * trench, a mortar joint is 8 mm, and a power-floated transition is as close to
 * dead flat as concrete gets — pushing that one hard is how a ramp starts
 * looking like porridge from the deck.
 */
interface Surface {
  /** The generation this look's basecolor, normal and roughness all come from. */
  tex: string;
  tint: number;
  bump: number;
}

/**
 * …AND THE FOUR CONCRETES ARE NO LONGER ONE CONCRETE, which is the other half
 * of the floor complaint.
 *
 * Measured in one frame: plaza 159,135,119 · sidewalk 155,128,104 · park pour
 * 153,123,100 — within six levels of each other on every channel, so four
 * materials rendered as one poured floor and the level had no ground plan you
 * could read. The cause was in this column: the four tints were all near-grey
 * and all within nine levels of VALUE too, laid over four photographs that are
 * themselves within 35 levels of each other. Nothing was left to tell them
 * apart but the tile pitch.
 *
 * They are not the same material and they are not the same age, so the ladder
 * below is what they measure in life rather than what makes them agree:
 *
 *   asphalt 55 · plaza 112 · footway 121 · precast ledge 137 · park pour 141
 *
 * A plaza that has been there thirty years is the DARKEST concrete on the spot;
 * a power-trowelled park pour is the palest thing in the level and the only one
 * that is cool rather than warm-neutral, which is exactly what the generated
 * photographs already say (park 215,218,218 against plaza 232,230,222) and what
 * the old tints were flattening back out. This is still a value multiplier and
 * still near-neutral — the rule at the top of this block holds — it just stopped
 * being the SAME value multiplier five times.
 */
const SURFACES: Record<Exclude<LookKey, "metal" | "fence">, Surface> = {
  concrete: { tex: PLAZA_TEX, tint: 0x7c7d80, bump: 0.7 },
  sidewalk: { tex: WALK_TEX, tint: 0x9d9d9c, bump: 0.8 },
  asphalt: { tex: ROAD_TEX, tint: 0x5a5a5c, bump: 1.0 },
  // 0.85, and it was 0.28 — the LOWEST relief in the level, laid on the flattest
  // photograph in the set, which between them meant the ramps arrived on screen
  // carrying nothing at all.
  //
  // The old reasoning was sound and the arithmetic was not: "a power-floated
  // transition is as close to dead flat as concrete gets, and pushing that one
  // hard is how a ramp starts looking like porridge". True — but the relief in
  // the normal map is the relief the PHOTOGRAPH has, and that image is already
  // the flattest thing in the matched set (luminance sd 8.7 against the plaza's
  // 12.9, saturation 1.6% against 4.4%). Scaling an already-shallow map down by
  // three quarters is not restraint, it is deletion: measured in-frame, the
  // quarter-pipe transition came back at 7.0 of luminance variation against
  // 26–42 for the plaza slab it grows out of, so the one thing left describing
  // it was the sun. A trowelled pour still has trowel swirl, aggregate under the
  // cream, and a cold joint, and from the deck of a board at two metres those
  // are what tell you it is concrete. This is the level's flattest surface at
  // full strength rather than its shallowest at a quarter.
  park: { tex: PARK_TEX, tint: 0xa2a6ab, bump: 0.85 },
  // The ledges are precast blocks, so they take the footway's own panels —
  // which is what a plaza ledge is cast as, and it retires the last surface in
  // the level from outside the matched set (the milestone-7 waxed-ledge photo,
  // shot under a warm bounce and tinted 0xe2d6bc to try to hide it). The
  // polished band down the grind line is drawn on top by `buildWax` and always
  // was; it never needed to be in the basecolor.
  ledge: { tex: WALK_TEX, tint: 0xb3b1ab, bump: 0.5 },
  // 0.7 and not the 1.0 a mortar joint deserves. Captured down the east alley,
  // where the low sun rakes a wall at about 10°: at full strength the normal
  // map's own texel-to-texel steps each caught a specular highlight and the
  // brick came back covered in white sparks that crawled as the camera moved.
  // That is specular aliasing, not detail, and the cure is less relief on the
  // one surface in the level the sun hits edge-on.
  brick: { tex: BRICK_TEX, tint: 0xc4bcb2, bump: 0.7 },
  // The bleached block: the same wall, painted out years ago and gone grey.
  brick2: { tex: BRICK_TEX, tint: 0xa8a7a6, bump: 0.65 },
};

// ---------------------------------------------------------------------------
// GPU-compressed textures, on phones only
// ---------------------------------------------------------------------------
//
// KTX2 was wired for MODELS and never for the flat map textures, and the flat
// map textures are where the phone's memory actually is. Every generated image
// in this file ships a `.ktx2` sibling beside its `@1024` rung whose blocks stay
// compressed ON the GPU: 1.33 MB against 5.33 MB for the same 1024x1024 with its
// eleven mip levels — the 4x the model lane already measured through the GLB.
// Probed against the live host on 2026-07-30, `--encode etc1s --clevel 2
// --qlevel 128`, eleven levels, sRGB transfer, `access-control-allow-origin: *`.
//
// AND IT COSTS NO PIXELS, which is worth writing down because it is not what
// the rung ladder's name suggests. Measured the same day: every one of these
// generations is 1024x1024 AT THE ORIGINAL, and `@1024`, `@2048` and the bare
// URL all serve the identical file, byte length for byte length. The texture
// rungs have been a no-op on this game's flat imagery from the start — a phone
// was already holding exactly the picture the desktop holds. So the `.ktx2`
// swap changes the ENCODING and nothing else: same 1024x1024, same eleven mip
// levels, one quarter of the memory, and the only thing given up is ETC1S block
// quantisation. It is not a resolution drop and must not be described as one.
//
// PHONE TIERS ONLY, AND THE REASON IS NOT CAUTION. Basis — ETC1S in these
// files — is a LOSSY re-encode of an image the desktop gets byte-for-byte
// today, and it is lossy twice over, since what the transcoder turns into ASTC
// or ETC2 at load is already a block-compressed approximation. So this is a
// trade a phone makes to stay alive and a desktop has no reason to make at all.
// `isPhoneTier` is a name test against the two phone rows, so the three desktop
// rows return `undefined` here and `loadTextureWithFallback` is called with no
// `ktx2Load` at all — the desktop's load path is the same two lines it was
// before this block existed. (`pickAsset` would refuse the sibling on a desktop
// tier anyway; the gate is here so the argument does not depend on reading it.)
//
// NOT THE SKY. `texture-cap.ts` shrinks the decoded panorama by redrawing it
// into a smaller canvas, which is something you cannot do to a CompressedTexture
// — `capDecodedImage` would return 0 and the 2048-wide sky would come back with
// its PMREM target and its background cube, both QUADRATIC in the source, for a
// net +80 MB. `dressField` and `dressSky` keep the browser-decodable path.

/** The `.ktx2` sibling loader for a phone, or nothing at all. */
function ktx2Textures(
  tier: QualityTier,
  gltf: GenexGltfLoader | undefined,
): { ktx2Load: (url: string) => Promise<THREE.Texture> } | undefined {
  if (!isPhoneTier(tier)) return undefined;
  // The game builds exactly one KTX2Loader, in `createGltfLoader` at boot: it
  // owns the transcoder path and the `detectSupport(renderer)` probe that
  // decides which block format this GPU can take. `gltf.ktx2` is false when the
  // transcoder never loaded, and `ktx2Loader` is the handle three's GLTFLoader
  // keeps for it. A second loader here would mean a second worker pool and a
  // second copy of the wasm for nothing.
  const loader = gltf?.ktx2 ? gltf.loader.ktx2Loader : null;
  if (!loader) return undefined;
  return { ktx2Load: (url) => loader.loadAsync(url) };
}

/**
 * Turn a compressed texture the same way up as an uncompressed one.
 *
 * THIS IS NOT OPTIONAL AND IT IS THE ONE TRAP IN THE SWAP. Every texture in this
 * file arrives from `TextureLoader` with `flipY = true`, so v = 0 samples the
 * BOTTOM row of the image. A `CompressedTexture` is constructed with
 * `flipY = false` and cannot be changed — three uploads it with
 * `compressedTexImage2D`, which `UNPACK_FLIP_Y_WEBGL` does not touch — and the
 * siblings carry `KTXorientation: rd` (top row first), which three's KTX2Loader
 * does not read. Dropped in as-is, every compressed texture on the level would
 * render UPSIDE DOWN: a facade with its cornice on the floor, spray hung by its
 * drips.
 *
 * The texture matrix does what the upload cannot. A negative v repeat with a +1
 * offset is an exact mirror, it costs one uniform that is already being sent,
 * and it is applied AFTER each call site has set its own wrap and repeat so the
 * site keeps owning those. Under `RepeatWrapping` the +1 is a no-op modulo the
 * tile; under `ClampToEdge` it is what puts v back in [0,1].
 *
 * Returns the texture, and is a no-op on anything that is not compressed — so
 * the desktop path calls it and nothing happens.
 */
function matchLoaderOrientation(tex: THREE.Texture): THREE.Texture {
  if (!(tex as THREE.CompressedTexture).isCompressedTexture || tex.flipY) return tex;
  tex.repeat.y *= -1;
  tex.offset.y += 1;
  return tex;
}

/**
 * The generated surfaces, swapped in over the stand-ins once they arrive.
 *
 * THE OTHER HALF OF "SOME TEXTURES JUST LOOK BAD" IS THAT THEY WERE COLOUR AND
 * NOTHING ELSE. Every floor in this level was one basecolor image on a flat
 * material: no normal, no roughness map, so a 15 mm crack-seal seam in the road
 * was a dark line painted on glass and the low sun could not find a single edge
 * anywhere in the plaza. That is what "low definition" looks like from a board
 * — not resolution, RELIEF. Each generation ships `-normal` and `-roughness`
 * beside its basecolor and both are loaded here now, which is the largest
 * single change to how any of these surfaces reads.
 *
 * Phones take the basecolor alone. Three maps on seven materials is three times
 * the texture memory on the surfaces that cover the most screen, and the tier
 * ladder already hands phones a 1024 rung for exactly this reason; a normal map
 * is the first thing to lose and the last thing a 5-inch screen shows.
 */
export async function dressMaterials(
  mats: SpotMaterials,
  tier: QualityTier,
  renderer: THREE.WebGLRenderer,
  gltf?: GenexGltfLoader,
): Promise<void> {
  const loader = new THREE.TextureLoader();
  const compressed = ktx2Textures(tier, gltf);
  const phone = tier.name === "phone" || tier.name === "phone-low";
  /**
   * 16 on anything that is not a phone, and it is the cheapest thing in this
   * file that makes the floor look further away than it is.
   *
   * The plaza is seen at three to eight degrees off horizontal for the whole
   * game, which is the case anisotropic filtering exists for and the case where
   * a plain mip chain fails worst: at 8 samples the saw-cut joints stop
   * resolving at about twenty metres, and past that the far half of the plaza is
   * a smooth field with a horizon on it. Measured across one frame, the joints
   * and the grain both survive to the far wall at 16 and die at 24 m at 8. It
   * costs texture bandwidth and no memory at all.
   *
   * Phones stay at 8 or below: they are already on the 1024 rung, where there
   * is less to resolve, and fill rate is the thing they have least of.
   * `phone-low` drops to 4 — the weakest phones are fill-bound, and at DPR 1
   * with a 1024 rung there is little extra detail for 8 taps to resolve.
   */
  const aniso = Math.min(
    tier.name === "phone-low" ? 4 : phone ? 8 : 16,
    renderer.capabilities.getMaxAnisotropy(),
  );
  /**
   * One GPU texture per generation+role, shared across the looks that use it.
   *
   * Three of the seven surfaces are the same photograph twice: `brick` and
   * `brick2` are one wall in two paints, and `sidewalk` and `ledge` are one
   * precast panel used as a floor and as a block. Loading each separately is
   * six extra 2048² uploads for nothing — 96 MB decoded on a device whose whole
   * budget is 181. What actually differs between them is the tint and the TILE,
   * and the tile lives in the UVs (see `TILE` in spot.ts), not on the texture,
   * so there is nothing left to keep apart.
   */
  const shared = new Map<string, Promise<THREE.Texture>>();

  const swap = async (look: Exclude<LookKey, "metal" | "fence">): Promise<void> => {
    const s = SURFACES[look];
    const mat = mats[look];
    // NOTHING WRAPS MIRRORED ANY MORE, and the brick is why the rule changed.
    //
    // Mirroring was introduced to hide a seam and a baked-in tag in the old
    // brick photograph, and it worked at a 9 m tile because one tile was a
    // storey and there were only seven of them across a facade. At the honest
    // 2.2 m tile the same trick puts a four-fold symmetry through every 4.4 m
    // of wall, and the eye reads four-fold symmetry as ORNAMENT: captured on
    // the west block at 30 m, the wall came back covered in identical
    // kaleidoscope rosettes, which is a worse artefact than any repeat and does
    // not look like masonry at all. The new brick is `--terrain`-clean at its
    // own edges, so plain repeat has nothing to hide.
    const wrap = THREE.RepeatWrapping;
    /** One map. `linear` for anything that is data rather than colour. */
    const load = (role: string, linear: boolean): Promise<THREE.Texture> => {
      const key = `${s.tex}/${role}`;
      let job = shared.get(key);
      if (!job) {
        // The basecolor is the only map a phone loads (see below), and it is
        // the one with a `.ktx2` sibling — `-normal` and `-roughness` are not
        // rung roles, so `pickAsset` leaves them alone and the compressed
        // branch is never entered for them.
        job = loadTextureWithFallback(
          gen(s.tex, role),
          tier,
          (u) => loader.loadAsync(u),
          compressed,
        ).then((tex) => {
          tex.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
          tex.wrapS = tex.wrapT = wrap;
          // The UVs already carry world metres / tile size, so the repeat here
          // is 1 by construction — a texture that needs a number typed in is a
          // texture that will end up at a different scale on the next mesh.
          tex.repeat.set(1, 1);
          tex.anisotropy = aniso;
          return matchLoaderOrientation(tex);
        });
        shared.set(key, job);
      }
      return job;
    };
    try {
      const base = await load("texture-basecolor", false);
      const old = mat.map;
      mat.map = base;
      mat.color.setHex(s.tint);
      mat.needsUpdate = true;
      old?.dispose();
    } catch (e) {
      console.warn(`[spot] ${look} basecolor failed`, e);
      return;
    }
    if (phone) return;
    // Relief and gloss, both optional: a missing rung must never cost the level
    // its colour, and the basecolor above has already landed by here.
    await Promise.all([
      load("texture-normal", true)
        .then((tex) => {
          mat.normalMap = tex;
          mat.normalScale.set(s.bump, s.bump);
          mat.needsUpdate = true;
        })
        .catch(() => console.warn(`[spot] ${look} has no normal map — flat`)),
      load("texture-roughness", true)
        .then((tex) => {
          mat.roughnessMap = tex;
          // The map multiplies the constant, so the constant goes to 1 and the
          // image does the work. Left at the stand-in's 0.62 the trowelled
          // ramp came out at 0.62 x whatever the photograph said and lost the
          // wet-looking wax band that is the whole reason it has a map.
          mat.roughness = 1;
          mat.needsUpdate = true;
        })
        .catch(() => console.warn(`[spot] ${look} has no roughness map — constant`)),
    ]);
  };

  await Promise.all((Object.keys(SURFACES) as (keyof typeof SURFACES)[]).map(swap));

  // …and the chain link, which is an `--transparent` image rather than a
  // surface: the diamonds are real holes in the alpha channel, so it goes in
  // the map slot of a material that already alpha-tests.
  //
  // NO `.ktx2` HERE, DELIBERATELY, and it is the one texture in this file that
  // is left on the browser-decodable path on purpose rather than by omission.
  // Two reasons, and either would do. It has no sibling to load — probed
  // 2026-07-30, `image-main@1024.ktx2` is a 404 on this generation, which is
  // newer than the backfill — so wiring it buys exactly nothing today. And the
  // day the backfill runs it would buy 4 MB at the worst possible odds: ETC1S
  // encodes alpha as its own lossy slice, this material cuts that alpha at a
  // HARD 0.5 (`alphaTest` below, not blending), and what is being cut is a
  // one-pixel wire lattice — the single shape in the level where a quantised
  // alpha edge turns into eaten wire and a rim of colour that nothing
  // downstream repairs. That wants a capture before it ships, not a silent
  // upgrade the next backfill turns on. The spray next door blends instead of
  // testing, which is why it does take the sibling.
  try {
    const tex = await loadTextureWithFallback(FENCE_IMAGE_URL, tier, (u) => loader.loadAsync(u));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = aniso;
    const old = mats.fence.map;
    mats.fence.map = tex;
    // Higher than the stand-in's 0.35. A generated cut-out carries whatever the
    // matte left behind in the fully transparent pixels, and mip levels blend
    // that back toward the wire; cutting at half alpha keeps the mesh and drops
    // the halo.
    mats.fence.alphaTest = 0.5;
    mats.fence.color.setHex(0xffffff);
    mats.fence.needsUpdate = true;
    old?.dispose();
  } catch (e) {
    console.warn("[spot] fence image failed", e);
  }
}

// ---------------------------------------------------------------------------
// the steel
// ---------------------------------------------------------------------------

/**
 * Round bar and posts for every `kind: "rail"` line. Built straight off RAILS,
 * so a rail you can see is a rail you can grind and there is no second set of
 * coordinates to keep in step. Ledges need nothing here — their grind edge is
 * the concrete solid's own top corner.
 */
/** Under this much air beneath it, a bar is bolted to what it runs over. */
const BOLTED_ON = 0.25;

export function buildRails(mats: SpotMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = "spot-rails";
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (const line of RAILS) {
    if (line.kind !== "rail") continue;
    a.copy(line.a);
    b.copy(line.b);
    const len = a.distanceTo(b);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 10), mats.metal);
    tube.position.copy(mid.addVectors(a, b).multiplyScalar(0.5));
    tube.quaternion.setFromUnitVectors(up, mid.subVectors(b, a).normalize());
    tube.castShadow = true;
    group.add(tube);

    // Posts every ~1.7 m, each dropped to whatever is under it — on a handrail
    // that is the stair nosing, on a flat bar the plaza.
    //
    // …but only where the bar actually STANDS off the floor. A coping is bolted
    // along a transition's lip, so the floor under it is the lip: posted the
    // way a handrail is, it would grow thirteen 10 cm stubs along the quarter
    // pipe. The test is the geometry's, not the line's name — a bar lying on
    // what it runs over has nothing to hold it up.
    const clear = Math.max(
      ...Array.from({ length: 5 }, (_, i) => {
        mid.lerpVectors(a, b, i / 4);
        return mid.y - STREET_SPOT.height(mid.x, mid.z, mid.y);
      }),
    );
    if (clear < BOLTED_ON) continue;
    const posts = Math.max(2, Math.round(len / 1.7));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      mid.lerpVectors(a, b, t);
      const floor = STREET_SPOT.height(mid.x, mid.z, mid.y);
      const h = Math.max(0.1, mid.y - floor);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, h, 8), mats.metal);
      post.position.set(mid.x, floor + h / 2, mid.z);
      post.castShadow = true;
      group.add(post);
    }
  }

  // The chain-link fence's frame. Same idea as the rails — read off the fence
  // solid, so the steel is on the mesh rather than beside it. Without a top
  // rail and posts a chain-link panel reads as a floating grey haze; the frame
  // is what tells you it is a fence and how far away it is.
  const f = SOLIDS.find((s) => s.id === "fence");
  if (f) {
    const top = (f.profile as { y: number }).y;
    const len = f.hz * 2;
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8), mats.metal);
    rail.position.set(f.cx, top - 0.04, f.cz);
    rail.rotation.x = Math.PI / 2;
    rail.castShadow = true;
    group.add(rail);
    const posts = Math.max(2, Math.round(len / 3));
    for (let i = 0; i <= posts; i++) {
      const z = f.cz - f.hz + (len * i) / posts;
      const floor = STREET_SPOT.height(f.cx, z, top);
      const h = top - floor + 0.06;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, h, 8), mats.metal);
      post.position.set(f.cx, floor + h / 2, z);
      post.castShadow = true;
      group.add(post);
    }
  }
  return group;
}

// ---------------------------------------------------------------------------
// the buildings, as buildings
// ---------------------------------------------------------------------------

/** One wall face the plaza can see, and how tall it is. */
export interface Facade {
  /** Anchor on the wall plane, and which way it faces (0 faces +Z). */
  x: number;
  z: number;
  yaw: number;
  width: number;
  height: number;
  /** A hole in this face, in `along` metres — an alley the road runs out of. */
  gap?: readonly [number, number];
}

export const FACADES: readonly Facade[] = [
  // Read off the spot's own bound, so the wall that moved back to give the
  // quarter pipe a run-out took its brick, its shopfronts and its spray with it.
  // 74 and not 66 with the block: a facade narrower than the wall it dresses
  // leaves a strip of bare brick at each end with no plinth, no shopfront and
  // no cornice on it, which reads as the building having been cut off.
  { x: -1, z: SPOT_MAX_Z, yaw: Math.PI, width: 74, height: 15 },
  { x: -1, z: -34, yaw: 0, width: 74, height: 13 },
  // The alley mouths: the road runs out through them at z = ±4, and the whole
  // point of the alley is that you can SEE out of the spot down it. Every band,
  // bay, window and piece of spray on these two faces stops at the gap —
  // without it the plinth ran a 3.4 m box straight across both alleys and
  // sealed the plaza into a courtyard.
  //
  // Anchored on SPOT_MIN_X / SPOT_MAX_X rather than on the old ±33-ish numbers,
  // so the whole skin — courses, shopfronts, drainpipes and every piece of
  // paint placed by `onWall` — followed the wall out by the four metres the
  // block grew instead of standing four metres off it in mid-air.
  { x: SPOT_MIN_X, z: -2, yaw: Math.PI / 2, width: 64, height: 11.5, gap: [-6, 2] },
  { x: SPOT_MAX_X, z: -2, yaw: -Math.PI / 2, width: 64, height: 10.5, gap: [-2, 6] },
  // …and the north eighteen metres of each side wall, which have never been
  // dressed at all. Those two runs are z = 30 → 48, which is the whole of the
  // quarter pipe's landing and run-out: the piece of the level you spend the
  // end of every lap looking at was two bare brick planes with nothing on them.
  //
  // They are separate entries rather than a wider pair above because `onWall`
  // measures `along` from a facade's own anchor, and moving those two anchors
  // north to re-centre them would have slid all sixteen pieces of spray on them
  // nine metres up the wall — several of them into the alley mouth. New indices
  // at the END of the list keep every existing decal's index and offset intact.
  // Their heights are the two wall solids' own (bldg-west-n 12, bldg-east-n 11).
  { x: SPOT_MIN_X, z: 39, yaw: Math.PI / 2, width: 18, height: 12 },
  { x: SPOT_MAX_X, z: 39, yaw: -Math.PI / 2, width: 18, height: 11 },
];

/** Does anything spanning `along ± half` run into this face's alley mouth? */
export function inGap(f: Facade, along: number, half = 0): boolean {
  return !!f.gap && along + half > f.gap[0] && along - half < f.gap[1];
}

/** A horizontal course standing proud of a facade — plinth, string, cornice. */
export interface Band {
  /** Centre height and full height, metres. */
  y: number;
  h: number;
  /** How far the band's CENTRE stands out of the wall plane. */
  proud: number;
}

/** Every band is the same slab, so its street face is `proud + BAND_DEPTH/2`. */
export const BAND_DEPTH = 0.5;

/**
 * The courses on a facade, as data rather than three calls in a row. They are
 * read TWICE — once to build the boxes, once to work out how far a decal has to
 * stand out to be in front of them — and the pair is the whole reason fifteen
 * of sixteen graffiti pieces shipped inside an opaque plinth.
 */
export function bandsOf(f: Facade): readonly Band[] {
  return [
    // The plinth's top used to land at 1.7 + 1.7 = 3.40 m, which is `BACK_DECK_Y`
    // to the centimetre — the north deck's own surface. Two horizontal faces in
    // ONE plane, over the 0.5 m this band stands proud of the brick: 74 m of it
    // along the north wall and a run down each side wall where the deck reaches
    // them. No depth buffer can separate coplanar faces, so the strip hatched
    // and flickered everywhere the deck met the wall. The two 3.4s mean
    // different things — how tall a shopfront is, and how tall this ramp is —
    // and they collided the round the deck was laid level at coping height.
    //
    // DOWN, not up, and that is the whole choice: 3.32 buries the band under
    // the deck, where it is not drawn at all. Raising it would have stood an
    // 8 cm lip 0.53 m proud of the brick across the landing — in the exact
    // place a rider comes down off an 88° lip. Nothing else moves: the bays
    // stop at `BAY_TOP` (2.45) and the string course does not start until
    // 4.875, so all this costs anywhere else is 8 cm of bare brick.
    { y: 1.66, h: 3.32, proud: 0.28 }, // shopfront plinth
    { y: 5.1, h: 0.45, proud: 0.3 }, // string course above the ground floor
    { y: f.height - 0.55, h: 1.1, proud: 0.42 }, // cornice
  ];
}

/**
 * How far out of the wall plane the street-facing surface stands, over the
 * height span [y0, y1]. Zero is the brick itself.
 */
export function facadeFront(f: Facade, y0: number, y1: number): number {
  let front = 0;
  for (const b of bandsOf(f)) {
    if (y1 < b.y - b.h / 2 || y0 > b.y + b.h / 2) continue;
    front = Math.max(front, b.proud + BAND_DEPTH / 2);
  }
  return front;
}

/**
 * What gets laid on a facade's street face, and in what order, measured out
 * from `facadeFront`. Everything on a wall reads this instead of carrying its
 * own hand-typed z — which is exactly the number that was wrong when fifteen
 * of sixteen graffiti pieces ended up inside the plinth.
 */
export const SKIN = {
  /** Glass and roller shutters, sitting on the plinth. */
  shopfront: 0.006,
  /** Splashback and street dirt, over the lot. */
  grime: 0.03,
  /** Spray and paper — the last thing anybody put on this wall. */
  paint: 0.05,
} as const;

/** One shopfront opening on a facade's ground floor. */
export interface Bay {
  /** Centre of the bay, metres along the face from its middle. */
  along: number;
  width: number;
  /** Shuttered rather than glazed — and a shutter is where the spray goes. */
  shuttered: boolean;
  /** Which fascia sign sits over it. */
  sign: number;
}

/** Bay centres, 4.7 m apart, with a pier of plinth left between them. */
const BAY_PITCH = 4.7;
const BAY_WIDTH = 3.8;
/** The opening itself, and the fascia band over it. */
export const BAY_TOP = 2.45;
const BAY_BOTTOM = 0.1;
const FASCIA_Y = 2.82;
const FASCIA_H = 0.66;

/**
 * The ground floor of a facade, as a run of bays. Deterministic off the
 * facade's own anchor, so the shutter a piece of graffiti is placed on is the
 * same shutter every boot.
 */
export function baysOf(f: Facade): Bay[] {
  const r = rng(Math.round(1000 + f.x * 31 + f.z * 7 + f.width));
  const n = Math.floor((f.width - 2) / BAY_PITCH);
  const bays: Bay[] = [];
  for (let i = 0; i < n; i++) {
    const along = -((n - 1) * BAY_PITCH) / 2 + i * BAY_PITCH;
    bays.push({ along, width: BAY_WIDTH, shuttered: r() < 0.45, sign: Math.floor(r() * 3) });
  }
  return bays;
}

/**
 * The boxes that stand proud of a facade's ground floor — the fascia sign over
 * every bay — in the facade's own (along, y, out) frame.
 *
 * Exported because the occlusion harness has to know about them. It caught
 * eleven buried decals on the first pass and missed two more, because its idea
 * of "what is in front of this wall" was the courses and the spot's solids and
 * nothing else. A wall's furniture has to be in that list or the check is a
 * check of the wrong thing.
 */
export function shopfrontsOf(f: Facade): {
  along: number;
  half: number;
  y0: number;
  y1: number;
  out0: number;
  out1: number;
}[] {
  const plinth = facadeFront(f, 0, BAY_TOP);
  const out: ReturnType<typeof shopfrontsOf> = [];
  for (const bay of baysOf(f)) {
    if (inGap(f, bay.along, bay.width / 2 + 0.3)) continue;
    out.push({
      along: bay.along,
      half: (bay.width + 0.5) / 2,
      y0: FASCIA_Y - FASCIA_H / 2,
      y1: FASCIA_Y + FASCIA_H / 2,
      out0: plinth,
      out1: plinth + 0.22,
    });
  }
  return out;
}

/**
 * The drainpipes on a facade — one per pier, EXCEPT where somebody has painted
 * that pier.
 *
 * Exported for the same reason `shopfrontsOf` is: the occlusion harness has to
 * know what stands in front of a wall, and a pipe standing 0.12 m proud of the
 * paint is exactly the kind of thing that cuts 11% out of three pieces without
 * anybody noticing. Being a function of the decal list rather than a list of
 * its own is what makes the two impossible to get out of step.
 */
export function drainpipesOf(
  f: Facade,
  fi: number,
): { along: number; half: number; out0: number; out1: number }[] {
  /** Half a pipe, plus enough that its shadow does not land on a piece either. */
  const CLEAR = 0.25;
  const plinth = facadeFront(f, 0, BAY_TOP);
  const out: ReturnType<typeof drainpipesOf> = [];
  for (const bay of baysOf(f)) {
    if (inGap(f, bay.along, bay.width / 2 + 0.3)) continue;
    const pier = bay.along + BAY_PITCH / 2;
    if (WALL_SPANS.some((s) => s.fi === fi && pier > s.a0 - CLEAR && pier < s.a1 + CLEAR)) continue;
    out.push({ along: pier, half: 0.07, out0: plinth + 0.03, out1: plinth + 0.17 });
  }
  return out;
}

/** A vertical face of a spot solid — where a decal on the world can hang. */
type Side = "+x" | "-x" | "+z" | "-z";

function solidOf(id: string): Solid {
  const s = SOLIDS.find((v) => v.id === id);
  if (!s) throw new Error(`[props] no solid "${id}"`);
  return s;
}

/**
 * A decal on the visible side of a spot solid, placed in the SOLID's terms —
 * `along` runs across the face and the stand-off comes from the footprint, so
 * moving a ledge moves its tag with it. Same discipline as `ledgeOn` next door
 * in spot.ts, and the same class of bug it prevents.
 *
 * Worked in the solid's OWN frame, through the same `(u, y, v)` placement
 * spot.ts meshes with, so it is right on a yawed solid too. It used to add
 * `s.hz` straight onto `s.cz`, which is only the face on a solid standing
 * square to the world — true of every ledge it was called on, and the reason
 * the two plywood roll-off banks either side of the quarter pipe had no way to
 * carry paint at all. They are turned a right angle: the face you see from the
 * plaza is their local +u side, not any world axis.
 */
function onSolid(
  id: string,
  face: string,
  side: Side,
  along: number,
  y: number,
  w: number,
  h: number,
  art: number,
  flip = false,
): Decal {
  const s = solidOf(id);
  const out = SKIN.paint;
  // Local (u, v) of the decal's centre, and the facing that goes with it: a
  // decal's `yaw` is measured so that 0 looks down +Z, which is the solid's own
  // local +v at yaw 0.
  const [u, v, turn] =
    side === "+z"
      ? [along, s.hz + out, 0]
      : side === "-z"
        ? [along, -s.hz - out, Math.PI]
        : side === "+x"
          ? [s.hx + out, along, Math.PI / 2]
          : [-s.hx - out, along, -Math.PI / 2];
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  return {
    id: face,
    x: s.cx + c * u + sn * v,
    y,
    z: s.cz - sn * u + c * v,
    yaw: s.yaw + turn,
    w,
    h,
    art,
    flip,
  };
}

/**
 * Where a piece of paint sits on a facade, in the facade's own frame.
 *
 * Kept because the wall's FURNITURE has to know. A drainpipe stands 0.12 m
 * proud of the paint, so a pipe dropped down a pier that a 5.6 m piece happens
 * to cover clips the piece — three of them measured 11% clipped. The pipes are
 * placed after this list rather than in spite of it: same description, read
 * twice, which is how the decals stopped drifting into the plinth in round 2.
 */
const WALL_SPANS: { fi: number; a0: number; a1: number }[] = [];

/**
 * The top of whatever the spot's own concrete piles against a facade at `along`,
 * measured at the plane the paint stands on.
 *
 * THIS EXISTS BECAUSE THE NORTH WALL HAS NOW DROWNED ITS OWN PAINT TWICE, and
 * both times the placements were correct when they were written. `onWall` already
 * refuses to let a piece drift into the wall's own courses — it reads `bandsOf`
 * instead of carrying a hand-typed stand-off — and this is the same idea turned
 * the other way up: a piece hung on a wall that something is BANKED AGAINST has
 * to read that bank's height, or the next time somebody re-cuts the ramp the
 * paint stays where it was and vanishes.
 *
 * Measured history, in one wall's worth of milestones: the back transition was
 * 2.0 m of 7.9° ramp, then 2.2 m at 70° with a 2.8 m shelf (concrete meeting the
 * brick at 2.76 m), then 3.4 m at 86° with a 3.4 m shelf tipping back at 11.3°
 * (4.07 m) — and while THIS audit was being written it became a 3.4 m
 * transition, a 2 m return to 4.3 and a flat deck (4.30 m). Three different
 * numbers for "where the brick starts" in three rounds, and the band underneath
 * each one was buried by 40–100%. There is no version of typing it in that
 * survives.
 *
 * Only `SOLIDS` — the ride's own list, which is what actually stands in the
 * plaza. The facade's own skin is `facadeFront`'s job and is measured out of the
 * wall plane, not up from the floor.
 */
function frontFill(fi: number, along: number): number {
  const f = FACADES[fi];
  const c = Math.cos(f.yaw);
  const sn = Math.sin(f.yaw);
  const x = f.x + c * along + sn * SKIN.paint;
  const z = f.z - sn * along + c * SKIN.paint;
  let top = 0;
  for (const s of SOLIDS) {
    const t = topOf(s, x, z);
    if (t !== null && t > top) top = t;
  }
  return top;
}

/**
 * Enough that the paint does not die into the seam where the concrete meets the
 * brick. 5 cm reads as a clean edge from the plaza and costs nothing.
 */
const OVER_FILL = 0.05;

/**
 * The same question `frontFill` answers, asked at an arbitrary distance OUT of
 * the wall plane rather than at the paint's own offset — because a course stands
 * proud and has to be tested where its outermost face actually is, not where the
 * spray sits.
 *
 * Deliberately a second function rather than a parameter on `frontFill`:
 * `frontFill` is read by `onWallOver` for every decal on this wall, and its
 * signature is not worth disturbing for a caller that wants one number changed.
 */
function fillAt(fi: number, along: number, out: number): number {
  const f = FACADES[fi];
  const c = Math.cos(f.yaw);
  const sn = Math.sin(f.yaw);
  const x = f.x + c * along + sn * out;
  const z = f.z - sn * along + c * out;
  let top = 0;
  for (const s of SOLIDS) {
    const t = topOf(s, x, z);
    if (t !== null && t > top) top = t;
  }
  return top;
}

/** How far above a span's top the concrete must reach before we call it gone. */
const BURIED_MARGIN = 0.1;
/** Samples across a run. 17 is one every 4.6 m on the widest facade. */
const BURIED_SAMPLES = 17;

/**
 * Is a span of wall dressing COMPLETELY buried, along its whole length, behind
 * whatever is banked against this facade — and therefore never drawn for anyone?
 *
 * WHY THIS EXISTS. Milestone 11 left a note that facade 0's ground floor is
 * "dead geometry behind 4.3 m of concrete — free draw calls for the taking".
 * Measured, the prize is smaller than that sounds (see the call sites), but it is
 * real and it is free: the back ramp's `back-deck` slab and its end cap stand in
 * front of the north wall's plinth from the plaza's side, so nothing that lives
 * under the concrete can reach a pixel.
 *
 * DERIVED, NEVER TYPED, and that is the whole design of it. Three milestones
 * running, this wall's "where the brick starts" has been 2.76 m, then 4.07, then
 * 4.21 — and every time somebody typed the number, the next re-cut of the ramp
 * left the dressing in the wrong place. `frontFill`'s own header records that
 * history. So this asks `SOLIDS` the same way `frontFill` does: re-cut the ramp
 * lower and the plinth comes back by itself, raise it and more goes away.
 *
 * CONSERVATIVE ON PURPOSE, in three separate ways, because the cost of being
 * wrong here is a hole in the level that nobody notices for a milestone:
 *  · it samples ACROSS the run and takes the LOWEST fill, so a band is only
 *    dropped if it is buried everywhere rather than at its midpoint;
 *  · it tests at the span's own `out` distance, so a proud course is judged
 *    where its front face is;
 *  · it wants `BURIED_MARGIN` of concrete over the top, so a course that merely
 *    reaches the surface still gets drawn.
 * It is also written for ANY facade index, not special-cased to 0, so the day a
 * second wall gets banked against it needs no new code — and the day this one is
 * un-banked, it needs none either.
 */
function buriedRun(
  fi: number,
  a0: number,
  a1: number,
  yTop: number,
  out: number,
): boolean {
  let lowest = Infinity;
  for (let i = 0; i < BURIED_SAMPLES; i++) {
    const along = a0 + ((a1 - a0) * i) / (BURIED_SAMPLES - 1);
    lowest = Math.min(lowest, fillAt(fi, along, out));
    if (lowest < yTop + BURIED_MARGIN) return false;
  }
  return true;
}

/**
 * A piece hung from the top of whatever is banked against this wall, rather than
 * from a height of its own. `hug` lifts it further up the clear brick, which is
 * the only axis a narrow band has left to stop reading as a ruled line.
 */
function onWallOver(
  fi: number,
  id: string,
  along: number,
  w: number,
  h: number,
  art: number,
  hug = 0,
  flip = false,
): Decal {
  return onWall(fi, id, along, frontFill(fi, along) + OVER_FILL + hug + h / 2, w, h, art, flip);
}

/** …and the same for a facade, which stacks its skin instead of a footprint. */
function onWall(
  fi: number,
  id: string,
  along: number,
  y: number,
  w: number,
  h: number,
  art: number,
  flip = false,
): Decal {
  const f = FACADES[fi];
  const out = facadeFront(f, y - h / 2, y + h / 2) + SKIN.paint;
  WALL_SPANS.push({ fi, a0: along - w / 2, a1: along + w / 2 });
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return {
    id,
    x: f.x + c * along + s * out,
    z: f.z - s * along + c * out,
    y,
    yaw: f.yaw,
    w,
    h,
    art,
    flip,
  };
}

/**
 * A plinth, a cornice, rows of windows, a run of shopfronts, drainpipes, dirt
 * out of the pavement, and clutter on the roofline.
 *
 * Not decoration — measurement. A brick texture on a 66 x 15 m plane reads as
 * one flat red rectangle from anywhere in the plaza, however good the texture
 * is, because there is nothing on it at building scale. Three horizontal breaks
 * and a grid of dark holes was the cheapest thing that turned it into a block
 * of buildings; what it still lacked was anything at SKATER height, which is
 * where the camera actually lives. So the ground floor is now shopfronts —
 * shutters, glass, fascia signs, a shadow line under each sign — and the walls
 * are dirty for the first 1.8 m the way real ones are. The roofline gets tanks
 * and vents, because the silhouette against the sky is free contrast and a flat
 * parapet throws it away.
 *
 * All of it instanced: one draw per material however many faces there are.
 */
export interface Facades {
  group: THREE.Group;
  /**
   * The skyline masses' materials, so `dressFacades` can put the generated
   * building front on them. Handed out rather than looked up by name: the three
   * are tinted copies of one texture and the swap has to reach all three.
   */
  blocks: THREE.MeshStandardMaterial[];
}

export function buildFacades(tier: QualityTier): Facades {
  const group = new THREE.Group();
  group.name = "spot-facades";
  const detail = tier.particleScale >= 0.6;
  const trim = new THREE.MeshStandardMaterial({ color: 0x574b40, roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({
    map: windowCanvas(false),
    roughness: 0.25,
    metalness: 0.35,
  });
  const lit = new THREE.MeshStandardMaterial({
    map: windowCanvas(true),
    emissive: 0xffb24a,
    emissiveIntensity: 0.35,
    roughness: 0.4,
  });
  const shutter = new THREE.MeshStandardMaterial({ map: shutterCanvas(), roughness: 0.62, metalness: 0.35 });
  const shopGlass = new THREE.MeshStandardMaterial({
    map: shopGlassCanvas(),
    roughness: 0.18,
    metalness: 0.3,
  });
  const fascias = [0, 1, 2].map(
    (i) => new THREE.MeshStandardMaterial({ map: fasciaCanvas(233 + i * 53), roughness: 0.7 }),
  );
  const pipe = new THREE.MeshStandardMaterial({ color: 0x4b4038, roughness: 0.7, metalness: 0.3 });
  // The roof clutter is the last untextured flat colour on the horizon, and it
  // stands against the SKY — the one background that shows a flat fill for
  // exactly what it is. The masses beneath it took the generated facade last
  // round and these eleven objects did not, so the skyline still ended in a row
  // of plain tan cylinders and cubes.
  //
  // They take the SHUTTER, which is the level's ribbed-steel canvas and is
  // exactly what rooftop plant and a water tank are clad in. No new texture, no
  // new draw call — and not the wall grime, which is an alpha veil whose cleared
  // pixels are black and which on an opaque material would render the top of
  // every box in shadow-black against a bright sky.
  const roofMat = new THREE.MeshStandardMaterial({
    map: shutterCanvas(),
    color: 0x7d7a71,
    roughness: 0.82,
    metalness: 0.2,
  });
  // Three tints over one texture: a city block is not one colour, and three is
  // enough that no two masses standing side by side ever match.
  const blockTex = distantBlockCanvas();
  const blocks = [0x9c8871, 0x82766c, 0xa88a72].map(
    (color) => new THREE.MeshStandardMaterial({ map: blockTex, color, roughness: 0.88 }),
  );
  // Weathered galvanised, not the saturated brown it was. The roof tanks are
  // the only untextured flat colour left on the horizon, so they are the one
  // thing up there that can still fall out of the register the generated
  // surfaces put everything else in — and a warm brown drum against a grey
  // cinder-block skyline is exactly the mismatch the re-shoot was for.
  const tank = new THREE.MeshStandardMaterial({
    map: shutterCanvas(),
    color: 0x8f8778,
    roughness: 0.88,
    metalness: 0.15,
  });
  // Multiplied, not painted: the dirt has to darken whatever the sun is doing
  // to the wall behind it, not replace it with a flat grey band.
  // Lit, like the spray is. An unlit veil is the same darkness on a wall in
  // full sun and a wall in shade, which is the tell that gives a decal away;
  // a lit one tracks the surface it is dirtying and comes close to the multiply
  // this could not have.
  const grimeMat = new THREE.MeshStandardMaterial({
    map: wallGrimeCanvas(),
    transparent: true,
    depthWrite: false,
    roughness: 0.98,
    metalness: 0,
  });
  // No `repeat` on either of these, and that is the point. A repeat lives on the
  // TEXTURE, so it is one number shared by every mesh that draws with it — and
  // the runs it is drawing are 66, 64 and 34 m long, so one guess (it was 10)
  // is wrong on all but one of them. `wallQuad` below derives the UVs from the
  // run's own world width instead, which is a number the geometry already knows.
  const paintMat = new THREE.MeshStandardMaterial({
    map: paintOutCanvas(),
    transparent: true,
    depthWrite: false,
    roughness: 0.95,
    metalness: 0,
  });

  /** Metres per tile for the two wall veils. Incommensurate on purpose. */
  const GRIME_TILE = 7;
  const PAINT_TILE = 23;
  /**
   * …and for the skyline behind them.
   *
   * 17 m, read off the generated facade the same way every other tile in this
   * level now is: the image is six storeys of a cinder-block building with
   * steel-framed windows in it, and a storey is 2.9 m. At the old 12 the
   * procedural stand-in's four painted storeys were 3 m each, which was right
   * for the stand-in and wrong for this photograph — a building whose storeys
   * came out at 2 m is a building the eye reads as a model.
   */
  const BLOCK_TILE = 17;

  /**
   * A veil across one run of a facade, tiled from its own world size. Vertical
   * is one tile for the grime (its gradient IS the vertical and must not wrap)
   * and one tile for the paint-out (a wall is painted out from the ground, not
   * in bands up it).
   */
  const wallQuad = (
    mat: THREE.MeshStandardMaterial,
    width: number,
    height: number,
    tile: number,
    order: number,
  ): THREE.Mesh => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (width / tile), uv.getY(i));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(width, height, 1);
    mesh.renderOrder = order;
    return mesh;
  };

  const unit = new THREE.PlaneGeometry(1, 1);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const pipeGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 7);
  const winGeo = new THREE.PlaneGeometry(1.5, 2.0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const scale = new THREE.Vector3();
  const p = new THREE.Vector3();
  const cold: THREE.Matrix4[] = [];
  const warm: THREE.Matrix4[] = [];
  const shutters: THREE.Matrix4[] = [];
  const panes: THREE.Matrix4[] = [];
  const signs: THREE.Matrix4[][] = [[], [], []];
  const pipes: THREE.Matrix4[] = [];
  const roofBoxes: THREE.Matrix4[] = [];
  const parapets: THREE.Matrix4[] = [];
  /** The window heads and sills — see the window loop for why they exist. */
  const reveals: THREE.Matrix4[] = [];
  const tanks: THREE.Matrix4[] = [];
  const r = rng(97);

  for (let fi = 0; fi < FACADES.length; fi++) {
    const f = FACADES[fi];
    const c = Math.cos(f.yaw);
    const s = Math.sin(f.yaw);
    // Along the face is the wall's own left-right; out of it is its normal.
    const on = (along: number, y: number, out: number): THREE.Vector3 =>
      p.set(f.x + c * along + s * out, y, f.z - s * along + c * out);
    q.setFromAxisAngle(axis, f.yaw);

    // A band is one box, or two with the alley mouth taken out of the middle.
    const runs: [number, number][] = f.gap
      ? [
          [-f.width / 2, f.gap[0]],
          [f.gap[1], f.width / 2],
        ]
      : [[-f.width / 2, f.width / 2]];
    for (const b of bandsOf(f)) {
      for (const [a0, a1] of runs) {
        if (a1 - a0 < 0.1) continue;
        // Gate the EMISSION, never `bandsOf` itself. `facadeFront` and `onWall`
        // read `bandsOf` to work out how far every decal on this wall has to
        // stand out; dropping a course from the DATA would pull ~30 low pieces
        // on facades 1–5 back 0.58 m into the brick. That is the same class of
        // bug as the one `frontFill`'s header records, and it is why this test
        // lives here, on the one box, and not one scope up.
        if (buriedRun(fi, a0, a1, b.y + b.h / 2, b.proud + BAND_DEPTH / 2)) continue;
        const box = new THREE.Mesh(new THREE.BoxGeometry(a1 - a0, b.h, BAND_DEPTH), trim);
        box.position.copy(on((a0 + a1) / 2, b.y, b.proud));
        box.rotation.y = f.yaw;
        box.castShadow = true;
        box.receiveShadow = true;
        group.add(box);
      }
    }

    // …AND EVERY ONE OF THEM GETS A LINTEL AND A SILL, which is the difference
    // between a window and a rectangle painted on a wall.
    //
    // A capture called these "zero-thickness quads — a flat dark rectangle with
    // a painted mullion", and that is exactly what they were: a 1.5 x 2.0 plane
    // standing 16 cm off the brick with a picture of a window on it. Real
    // openings are RECESSED, and what tells you so from thirty metres is not the
    // recess, it is the two hard shadows the reveal throws — the head cutting a
    // band down the top of the glass and the sill catching the light as a bright
    // line under it. Recessing the plane itself is not available here (the
    // facade is a solid wall with no hole in it, so a plane behind its face is a
    // plane you cannot see), but standing the stone PROUD gives the same two
    // shadows for the same reason — which is the trick the shopfront fascias
    // below already run, and their note says it is "most of what says street".
    //
    // At the 22° sun a 14 cm projection lays 35 cm of shadow down a 2 m window,
    // and the sill's 20 cm lays a band under it. Both are instanced off the
    // cornice's own box and stone, so the whole level pays one draw call.
    const cols = Math.floor(f.width / 3.3);
    for (let row = 0; row * 2.9 + 6.4 < f.height - 1.4; row++) {
      for (let i = 0; i < cols; i++) {
        const along = -f.width / 2 + 1.9 + i * 3.3;
        if (inGap(f, along, 0.9)) continue;
        const y = 6.4 + row * 2.9;
        m.compose(on(along, y, 0.16), q, one);
        (r() < 0.14 ? warm : cold).push(m.clone());
        // The head, wider than the opening the way a lintel bearing on brick is.
        m.compose(on(along, y + 1.09, 0.15), q, scale.set(1.94, 0.18, 0.3));
        reveals.push(m.clone());
        // …and the sill, which projects further because it has to throw water
        // clear of the wall.
        m.compose(on(along, y - 1.06, 0.18), q, scale.set(2.0, 0.12, 0.36));
        reveals.push(m.clone());
      }
    }

    // --- the ground floor -------------------------------------------------
    const plinth = facadeFront(f, 0, BAY_TOP);
    for (const bay of baysOf(f)) {
      if (inGap(f, bay.along, bay.width / 2 + 0.3)) continue;
      const h = BAY_TOP - BAY_BOTTOM;
      m.compose(
        on(bay.along, (BAY_TOP + BAY_BOTTOM) / 2, plinth + SKIN.shopfront),
        q,
        scale.set(bay.width, h, 1),
      );
      (bay.shuttered ? shutters : panes).push(m.clone());
      // The fascia stands proud of the glass so the low sun draws a shadow
      // line under every sign — that line is most of what says "street".
      m.compose(
        on(bay.along, FASCIA_Y, plinth + 0.11),
        q,
        scale.set(bay.width + 0.5, FASCIA_H, 0.22),
      );
      signs[bay.sign].push(m.clone());
    }

    // The pipes, from the list the harness reads — a pipe is 0.07 m of cast
    // iron standing 0.12 m in front of the spray, so it cuts a stripe out of
    // whatever is behind it, and the piece was on the wall first.
    if (detail) {
      const h2 = f.height - 1.6;
      for (const pipe of drainpipesOf(f, fi)) {
        m.compose(on(pipe.along, h2 / 2, plinth + 0.1), q, scale.set(1, h2, 1));
        pipes.push(m.clone());
      }
    }

    // Dirt out of the pavement, and the paint-outs over the brick above it. One
    // quad per run each, both tiled from the run's own width.
    for (const [a0, a1] of runs) {
      if (a1 - a0 < 0.1) continue;
      // Same test as the courses above, same reason it is on the emission and
      // not on `facadeFront`: this quad is "dirt out of the pavement", and on a
      // wall whose pavement is 4.2 m of concrete there is no pavement to come
      // out of and no pixel it can reach.
      if (!buriedRun(fi, a0, a1, 1.8, facadeFront(f, 0, 1.8) + SKIN.grime)) {
        const grime = wallQuad(grimeMat, a1 - a0, 1.8, GRIME_TILE, 1);
        grime.position.copy(on((a0 + a1) / 2, 0.9, facadeFront(f, 0, 1.8) + SKIN.grime));
        grime.rotation.y = f.yaw;
        group.add(grime);
      }

      // The paint-out runs from the string course to the cornice — the bare
      // brick, which is the only part of the wall the repeat is legible on.
      const y0 = 5.4;
      const y1 = f.height - 1.3;
      if (y1 > y0 + 0.5) {
        const paint = wallQuad(paintMat, a1 - a0, y1 - y0, PAINT_TILE, 1);
        paint.position.copy(on((a0 + a1) / 2, (y0 + y1) / 2, facadeFront(f, y0, y1) + SKIN.grime));
        paint.rotation.y = f.yaw;
        group.add(paint);
      }
    }

    // --- the roofline, which is the spot's horizon --------------------------
    //
    // Measured from the ride: on the main line the top of the wall you are
    // facing sits 22° above the eye and the frame has no sky in it at all, so
    // that parapet IS the horizon of this game — and it was ONE straight line
    // 66 m long, because one slab drew it. A city block is never one building.
    //
    // Two things break it, and neither is a collider or a decal, so neither can
    // fight anything: piers standing on the parapet, and the rest of the block
    // set back behind it at its own heights. Not gated on `detail` — silhouette
    // against the sky is the cheapest contrast there is, and it is 8 boxes.
    for (let i = 0; i < Math.round(f.width / 10.5); i++) {
      const along = -f.width / 2 + 2 + ((f.width - 4) * (i + 0.5)) / Math.round(f.width / 10.5);
      if (inGap(f, along, 1.5)) continue;
      const w = 1.2 + r() * 1.1;
      const hh = 0.5 + r() * 0.45;
      m.compose(
        on(along, f.height - 0.1 + hh / 2, bandsOf(f)[2].proud),
        q,
        scale.set(w, hh, BAND_DEPTH * 1.15),
      );
      parapets.push(m.clone());
    }
    // The block behind: three masses of their own heights and set-backs. Their
    // bottoms run 3 m below the parapet so they are opaque from anywhere in the
    // plaza, and their tops are what turns a line into a skyline.
    //
    // Three and not four, and 6–13 m wide and not 7–17: measured off the built
    // group, four wide ones stood over 52 of 67 sample columns of the north
    // parapet, which is not a skyline, it is a taller wall. At three the north
    // block steps up over about half its length and the rest of it still ends
    // in sky.
    //
    // They are NOT in the instanced batch, and that is the whole of the fix for
    // the flat-boxes complaint. An InstancedMesh shares one geometry, so one set
    // of 0–1 box UVs has to serve a 6 m mass and a 13 m one — which is why they
    // could only ever be flat colour. Twelve meshes of their own carry UVs in
    // world metres instead, so the storeys are the same size on every mass, and
    // twelve draw calls for the entire skyline is not a budget anybody notices.
    for (let i = 0; i < 3; i++) {
      const along = -f.width / 2 + 5 + ((f.width - 10) * (i + 0.15 + r() * 0.7)) / 3;
      if (inGap(f, along, 9)) continue;
      const rise = 1.3 + r() * 4.2;
      const wide = 6 + r() * 7;
      const depth = 6 + r() * 7;
      const back = -(3.5 + r() * 6) - depth / 2;
      const tall = rise + 3;
      const geo = new THREE.BoxGeometry(wide, tall, depth);
      const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
      // Box UVs run 0→1 across each face; the four side faces come first, so
      // scaling u by the face's own width and v by the height puts the storeys
      // at one size everywhere. The top and bottom never face the plaza.
      const across = [depth, depth, wide, wide, wide, wide];
      for (let k = 0; k < uv.count; k++) {
        const face = Math.floor(k / 4);
        uv.setXY(k, (uv.getX(k) * across[face]) / BLOCK_TILE, (uv.getY(k) * tall) / BLOCK_TILE);
      }
      const mesh = new THREE.Mesh(geo, blocks[i % blocks.length]);
      mesh.position.copy(on(along, f.height + rise - tall / 2, back));
      mesh.rotation.y = f.yaw;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (detail) {
      for (let i = 0; i < 9; i++) {
        const along = -f.width / 2 + 4 + r() * (f.width - 8);
        if (inGap(f, along, 2)) continue;
        const back = -1.4 - r() * 3;
        if (r() < 0.36) {
          const rad = 1.1 + r() * 0.7;
          m.compose(on(along, f.height + rad * 0.6, back), q, scale.set(rad, rad * 1.6, rad));
          tanks.push(m.clone());
        } else {
          const w = 1 + r() * 1.8;
          const hh = 0.5 + r() * 1.4;
          m.compose(on(along, f.height + hh / 2 - 0.2, back), q, scale.set(w, hh, w * 0.8));
          roofBoxes.push(m.clone());
        }
      }
    }
  }

  const batch = (geo: THREE.BufferGeometry, mat: THREE.Material, at: THREE.Matrix4[]): void => {
    if (!at.length) return;
    const inst = new THREE.InstancedMesh(geo, mat, at.length);
    for (let i = 0; i < at.length; i++) inst.setMatrixAt(i, at[i]);
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    group.add(inst);
  };

  // Phones get the glass but not the lit ones — two materials is two draws.
  const rows: [THREE.Matrix4[], THREE.Material][] =
    detail ? [[cold, glass], [warm, lit]] : [[cold.concat(warm), glass]];
  for (const [mats, mat] of rows) batch(winGeo, mat, mats);
  batch(unit, shutter, shutters);
  batch(unit, shopGlass, panes);
  for (let i = 0; i < 3; i++) batch(unitBox, fascias[i], signs[i]);
  batch(pipeGeo, pipe, pipes);
  // The piers are the cornice's own stone, so they take the cornice's material.
  batch(unitBox, trim, parapets);
  // …and so do the window heads and sills, which is why they cost one call.
  batch(unitBox, trim, reveals);
  batch(unitBox, roofMat, roofBoxes);
  batch(new THREE.CylinderGeometry(1, 1, 1, 10), tank, tanks);
  return { group, blocks };
}

/**
 * The generated building front, over the skyline's procedural stand-in.
 *
 * The masses behind the parapet are the top third of the frame from anywhere on
 * the main line, and they shipped as flat tan boxes with a painted window grid
 * on them — the one thing left in the picture that said "this is a model", said
 * across the whole width of it. `cms51ld9r` is a real cinder-block facade with
 * rows of steel-framed windows, shot in the same register as the ground
 * surfaces, so the skyline stops being a different game from the plaza in front
 * of it.
 *
 * Three tints over one texture, kept from the stand-in and for the same reason:
 * a city block is not one colour, and three is enough that no two masses
 * standing side by side ever match. They are near-neutral now — see SURFACES.
 */
export async function dressFacades(
  blocks: THREE.MeshStandardMaterial[],
  tier: QualityTier,
  gltf?: GenexGltfLoader,
): Promise<void> {
  try {
    const tex = await loadTextureWithFallback(
      gen(FACADE_TEX, "texture-basecolor"),
      tier,
      (u) => new THREE.TextureLoader().loadAsync(u),
      ktx2Textures(tier, gltf),
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // The skyline is windows in rows — the one surface here where being upside
    // down would be unmistakable. See `matchLoaderOrientation`.
    matchLoaderOrientation(tex);
    const shades = [0xa39c93, 0x8d8880, 0xb0a89d];
    for (let i = 0; i < blocks.length; i++) {
      const old = blocks[i].map;
      blocks[i].map = tex;
      blocks[i].color.setHex(shades[i % shades.length]);
      blocks[i].needsUpdate = true;
      // One texture, many materials — dispose the stand-in ONCE.
      if (i === 0) old?.dispose();
    }
  } catch (e) {
    console.warn("[spot] skyline facade failed", e);
  }
}

// ---------------------------------------------------------------------------
// paint, paper and spray
// ---------------------------------------------------------------------------

/**
 * The floors dirt, oil and rubber may be laid on. Everything cast or laid that
 * a person walks or drives on, which is every ground material in the level.
 */
const GROUND_LOOKS = new Set<LookKey>(["concrete", "sidewalk", "asphalt", "park"]);

/** A flat quad laid on a wall (or the floor), pushed clear of z-fighting. */
export interface Decal {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Facing, radians about +Y. 0 faces +Z. */
  yaw: number;
  w: number;
  h: number;
  /** Which of GRAFFITI_URLS this piece uses. */
  art: number;
  /** Lay it flat on the ground instead of standing it on a wall. */
  flat?: boolean;
  /** Mirrored. Four images over thirty pieces need it not to read as four. */
  flip?: boolean;
}

/** Flat on the ground, where a run puts your eyes. */
function tag(id: string, x: number, z: number, yaw: number, size: number, art: number, y = 0.014): Decal {
  return { id, x, y, z, yaw, w: size, h: size, art, flat: true };
}

/**
 * Every piece in the spot, placed on the surface it is painted on rather than
 * at a hand-typed coordinate near it.
 *
 * The old list carried world x/y/z typed in by eye, and fifteen of its sixteen
 * wall pieces were inside the shopfront plinth — 11 of them 100% buried, and
 * graffiti is one of the things the player actually asked for. `onWall` takes
 * a facade and a distance along it and works the stand-off out of the courses
 * that are actually there; `onSolid` does the same off a ledge's own footprint.
 * Neither can drift, and `tools/spot-map.html` marches out of every one of them
 * to prove it.
 *
 * Coverage is deliberate and much heavier than it was: a street spot with three
 * pieces on it reads as a level with some decals, and a street spot where every
 * shutter and every riser has been hit reads as somewhere people go.
 */
export const DECALS: readonly Decal[] = [
  // --- the north block ------------------------------------------------------
  // THIS WALL HAS NO GROUND LEVEL ANY MORE, and that is a deliberate trade.
  //
  // The run-out now ends in a bank to the brick across the FULL width of the
  // block (`back-trans` in spot.ts — 2.2 m of cast transition from x = -39.5 to
  // 37.5), so every centimetre of this facade below 2.2 m is behind concrete.
  // Ten pieces used to sit at y = 1.25–1.6 out at the two ends, and the old bank
  // already had three quarters of each of them; the transition has the lot.
  //
  // They are not buried, they have MOVED — onto facades 4 and 5, the north
  // eighteen metres of the two side walls, which carried no paint at all and
  // which you ride between for the whole length of the run-out. Same pieces,
  // same budget, on brick the camera actually passes. What is left on this face
  // starts at 3.45 m, which is where it always started being visible from a
  // board anyway.

  // THE BACKDROP OF THE MAIN LINE, and it was the bare wall on the spot.
  //
  // Everything above runs along the two ends of this facade — the stretches
  // either side of the quarter pipe, which are 83% and 86% painted. In between,
  // x = -21 … 13, stands the transition, its deck and both roll-off banks: 34 m
  // of brick that you look STRAIGHT AT for the whole north-bound run and the
  // whole time you are on the deck, and it carried five pieces with a 12.3 m
  // bare run through the middle of it — 43% cover on the one wall the camera
  // never leaves, against 83–86% on the ends nobody faces down the line.
  //
  // The band is 3.45 → 4.85 m and that is not a choice: the shopfront plinth
  // tops out at 3.4, the string course starts at 4.875, and the first row of
  // windows sits at 6.4 ± 1. Anything taller than 1.4 m here gets pushed out to
  // the front of a course by `facadeFront` and floats off the brick. So it is a
  // long production wall rather than a few big pieces — which is what a wall
  // over a quarter pipe looks like anyway, and it sits just above the coping,
  // which is exactly where your eye is coming up the transition.
  // …AND NO TWO NEIGHBOURS ARE THE SAME PIECE. Eight throw-ups over three
  // images went down as 0, 2, 2, 1, 1, 1, 0, 2 read west to east — three copies
  // of one image in a row in the middle of the band, all 3.3 x 1.3 m, all at
  // y = 4.1. Captured standing on the back transition, which is where this wall
  // fills the frame, that band was one skull four times. Three images is what
  // the budget bought, so the answer is that no repeat is ever ADJACENT and no
  // two copies of one image share a size, a height or a facing: a 3-cycle west
  // to east, alternating flip, and widths from 2.1 to 3.7 m.
  //
  // …AND IT WAS STILL A WALLPAPER BORDER, because that fix changed the wrong
  // variable. Ten pieces stood on this facade in the 3.45–4.85 m band — the
  // eight above plus the quarter pipe's two — every one of them between 1.1 and
  // 1.36 m tall, so every one of them filled the band top to bottom and the
  // eight y values, spread over a grand total of 12 cm, could not do anything
  // about it. Ten letterboxes in a dead-level line at one height is a border
  // whatever is printed inside them, and rotating three images through it only
  // decides which picture the border is made of. A fresh capture called it a
  // wallpaper border in exactly those words.
  //
  // WHAT A REAL PRODUCTION WALL LOOKS LIKE is a handful of full-height burners
  // with a lot of small scrawl around and between them, and the scrawl is at
  // every height an arm reaches from the pavement. So: four burners, and eight
  // TAGS at 0.44–0.58 m that use the vertical room the burners cannot — 3.72 up
  // to 4.52, which is a metre of scatter in a 1.4 m band. The band stops being a
  // line because most of what is in it is no longer the height of the line.
  //
  // …AND THEN THE BACK RAMP GREW AND DROWNED ALL OF IT, TWICE. Every number in
  // the four paragraphs above was correct when it was written. The band is
  // 3.45 → 4.85 because the shopfront plinth topped out at 3.4 and nothing else
  // stood in front of this wall below the string course — and then the back
  // bank-to-wall was re-cut, and re-cut again: concrete met this facade at 2.76 m
  // when the band was authored, at 4.07 m by the time it was audited, and at
  // **4.30 m** (`back-deck`, flat) by the time the audit was finished. Measured
  // by `tools/decal-gap.mjs` against the middle of those three: five pieces
  // **100% buried**, five more at 40%, and the quarter pipe's own pair at 0% and
  // 80%. Nine pieces of paint on the backdrop of the whole game, behind a bank.
  //
  // Nobody typed a wrong number, three times running. A SOLID MOVED and the
  // paint on it did not — so the fix is not a fourth set of numbers. Every piece
  // in this band now reads the concrete's own height through `onWallOver`, the
  // same way `onWall` already reads the courses through `facadeFront` and
  // `onSolid` reads a ledge's own footprint. The next re-cut moves the paint
  // with it.
  //
  // WHAT THE WALL HAS LEFT IS 0.475 m — the string course starts at 4.875 and a
  // piece that crosses a course gets pushed out to the FRONT of it by
  // `facadeFront` and floats 0.55 m off the brick, which is the other half of
  // this same bug. There is no taller clear brick anywhere below 7.4 m either:
  // the window rows at 6.4 / 9.3 / 12.2 with 2 m panes leave 0.9 m gaps and
  // nothing else. So this is a strip, and pretending otherwise is what buries
  // paint.
  //
  // The four BURNERS therefore leave: 1.3 m of throw-up will not squash into
  // 0.475 without going past 5:1, and the two high bands already measured that
  // past about 2.5:1 a throw-up stops having a silhouette and comes back as a
  // pale horizontal smear. They are 12 m up this same wall now, in the 7.4 → 8.3
  // window, spread into the four widest gaps the band up there had left — same
  // wall, same backdrop, above the ramp instead of behind it. The two portrait
  // POSTERS go to facades 4 and 5, which still have the clear 3.45 → 4.85 band
  // this one lost.
  //
  // What STAYS is what a 4.3 m bank against a wall actually produces: eight tags
  // at the reach of somebody standing on top of the ramp, 0.30–0.46 m tall over
  // 0.69–1.06 m. `hug` scatters their bottom edge over 4.35 → 4.52 while every
  // top lands inside 4.78 → 4.82, so the strip has a ragged lower edge and a
  // straight-ish upper one — which is what a row of tags sprayed off a deck by
  // people of one height looks like, and is the opposite of the ruled line the
  // ten-across version read as.
  onWallOver(0, "n-tag-w1", -11.0, 1.01, 0.44, 2),
  onWallOver(0, "n-tag-w2", -7.2, 0.78, 0.34, 0, 0.13, true),
  onWallOver(0, "n-tag-c1", -2.2, 0.92, 0.4, 1, 0.03, true),
  onWallOver(0, "n-tag-c2", -0.6, 1.06, 0.46, 0),
  onWallOver(0, "n-tag-e1", 4.4, 0.74, 0.32, 1, 0.15),
  onWallOver(0, "n-tag-e2", 5.5, 0.69, 0.3, 2, 0.17, true),
  onWallOver(0, "n-tag-e3", 12.0, 0.87, 0.38, 0, 0.05, true),
  onWallOver(0, "n-tag-e4", 15.3, 0.83, 0.36, 2, 0.11),
  // The four burners, rehoused in the 7.4 → 8.3 m window's own gaps. Measured
  // against what is already up there rather than eyeballed: the ten existing
  // pieces occupy ten intervals along this wall and leave x -38 → -26, -21.4 →
  // -6.3 (15.1 m), -1.5 → 6.8 (8.3 m) and 13.5 → 23.55 (10.05 m). One goes in
  // each of the four widest, and each fits with over a metre to spare at both
  // ends. Two take a different image than they did, because the band they are
  // joining has its own no-repeat-adjacent order and it wins — read west to east
  // the whole band is now 0,2,1,2,0,2,0,1,2,0,1,2,0,1.
  //
  // Their y is inside 7.42 → 8.29, i.e. inside the clear brick this band's own
  // comment names. Several of the ten already there are not (n-high-1 dips to
  // 7.27 and n-high-1b reaches 8.44, both over a window pane) — pre-existing, not
  // touched here, and noted so nobody reads these four as the odd ones out.
  onWall(0, "n-throw-w", 30, 7.84, 2.05, 0.86, 0),
  onWall(0, "n-throw-c", 12, 7.89, 1.9, 0.8, 2, true),
  onWall(0, "n-throw-e", -3.5, 7.85, 2.15, 0.88, 0),
  onWall(0, "n-throw-w4", -19.5, 7.81, 1.85, 0.78, 1, true),
  // Paper in the two gaps left between them — portrait art, so it is the one
  // thing on this wall that is not being stretched to a letterbox.
  // …and it is exactly what a 0.475 m strip cannot hold: 1.4 m of portrait will
  // not shrink to that without becoming 0.35 m wide, which at 4.5 m up a 74 m
  // wall is nothing. Both are on the side walls now — see facades 4 and 5.

  // …AND TWO MORE COURSES UP THE WALL, because one band of paint on a 66 m
  // facade is a stripe, and this facade is the backdrop of the whole game.
  //
  // Everything above was crammed into 3.45 → 4.85 m, the only clear brick over
  // the shopfronts, and left 5.4 → 13.9 m — nine metres of the biggest surface
  // in the level — completely bare. The two new bands are in the gaps the
  // window grid leaves: rows sit at 6.4, 9.3 and 12.2 with 2 m panes, so
  // 7.4 → 8.3 and 10.3 → 11.2 are clear brick right across the wall, and
  // `facadeFront` confirms nothing stands proud of either. Long and low is the
  // only shape that fits, which is exactly what a rooftop production is.
  // …AND THEY ARE NOT A ROW. Seven pieces at a dead 9 m pitch, all the same
  // height, all the same 0.82 m tall, over three images is not seven pieces —
  // it is one piece of wallpaper, and that is what it read as: art 1 landed at
  // x = -30, -3 and 26 at the same y with the same silhouette, so the wall
  // showed the same skull three times at even spacing on the most-looked-at
  // surface in the level.
  //
  // Nothing about the band moved: 7.4 → 8.3 m is still the only clear brick
  // between the window rows. What changed is that real production spots are
  // CLUSTERED — writers paint next to each other, over each other, and leave
  // whole panels bare. So the gaps run 6 to 15 m instead of 9 and 9 and 9, the
  // sizes vary by half again rather than by a tenth, and no two copies of one
  // image are adjacent or at the same height.
  //
  // …AND THEY ARE NO LONGER 4.5:1. The clear brick between window rows is 0.9 m
  // tall, so a 4.4 m piece in it is a square image stretched to five times its
  // own width — and on capture that is precisely what these two bands came back
  // as: unreadable pale smears at 7.7 and 10.7 m, with nothing in them anybody
  // could name as paint. Stretch past about 2.5:1 and a throw-up stops having a
  // silhouette; the letters run together into a horizontal streak. So each piece
  // is now roughly 2.2:1 — legible — and there are more of them, which is how a
  // production wall gets its coverage anyway: writers put pieces NEXT to each
  // other, they do not paint one twelve-metre banner.
  onWall(0, "n-high-1", -31.5, 7.72, 2.0, 0.9, 1),
  onWall(0, "n-high-1b", -28.9, 8.14, 1.35, 0.6, 0, true),
  onWall(0, "n-high-2", -25.6, 7.66, 1.5, 0.66, 2, true),
  onWall(0, "n-high-3", -13.4, 7.62, 2.2, 0.92, 0),
  onWall(0, "n-high-3b", -10.8, 8.16, 1.3, 0.58, 2),
  onWall(0, "n-high-4", -8.6, 7.7, 1.6, 0.7, 1, true),
  onWall(0, "n-high-5", 1.5, 7.8, 1.9, 0.86, 2),
  onWall(0, "n-high-6", 4.6, 8.18, 1.3, 0.58, 0, true),
  onWall(0, "n-high-7", 21.5, 8.02, 2.1, 0.84, 1),
  onWall(0, "n-high-7b", 24.2, 7.64, 1.45, 0.62, 2, true),
  // Two at the top, not three: the third one made a second row out of what
  // should read as the one production somebody got up on a roof to do.
  onWall(0, "n-top-1", -19, 10.72, 1.9, 0.86, 2),
  onWall(0, "n-top-1b", -16.4, 10.78, 1.3, 0.58, 1, true),
  onWall(0, "n-top-2", 12.5, 10.8, 1.7, 0.8, 0, true),

  // --- the two side walls' north ends, which the run-out is ridden between ---
  //
  // Facades 4 and 5 dress z = 30 → 48 of the west and east blocks and have never
  // carried a piece. That is the wall either side of the quarter pipe's landing
  // and its whole run-out — twenty seconds of every lap looking down a corridor
  // of bare brick — and it is where the north face's ground-level band has gone.
  //
  // `along` runs SOUTH from the anchor on facade 4 (z = 39 - along) and NORTH on
  // facade 5 (z = 39 + along), so both lists below read north to south in their
  // own frame. Everything is held between z = 36 and 44: south of 36 the
  // footway's own clutter stands in front of the wall (a planter, a stack of
  // pallets, a standpipe, a dumpster), and north of 44.9 the back transition
  // does.
  //
  // …AND 44.9 IS NOW 41.8, WHICH COST TWO PIECES. The re-cut back transition's
  // TOE moved south with its radius (86° over 3.4 m puts it at z 40.95) and it
  // is full width, so it tucks into both side walls. An arc rises slowly off its
  // own toe — 4 cm at z 41.5 — but these two pieces start at y 0.10, so what
  // buries them is not the ramp's height, it is the toe's POSITION: measured,
  // `w-north-piece` was 60% behind it and `e-north-piece` 40%.
  //
  // Both are 5.0 m wide, and z 36 → 41.6 is 5.6 m with a 4.2 m piece already
  // standing in it, so there is no version of "slide it south a bit" that fits.
  // They are SOUTH of their neighbours instead, at z 33 — over the run-out's
  // last ten metres rather than its final five, which is the same corridor and
  // the same twenty seconds of every lap. Held north of z 30.5 at their west/east
  // edge: facades 4 and 5 start at z 30, and facades 2 and 3 carry a shopfront
  // plinth standing 0.53 m proud right up to that line, so a piece hung over the
  // seam would be inside the plinth of the wall next door.
  //
  // …and that is where the paragraph above them turns out to be right: this
  // stretch DOES carry the footway's clutter. Measured at z 33 —
  // `clutter-pallets-13` (0.439 m, west) and `clutter-planter-28` (0.55 m, east)
  // are hard against the brick and took 2% and 7% off the bottom edge. So the
  // pieces are hung from 0.62 m west and 0.75 m east rather than from 0.10, which
  // clears that clutter by 18 and 20 cm, and their tops stop at 2.38 and 2.33 —
  // under the fascia signs at 2.49, which the bay pitch puts over 3.35 m of this
  // exact span. 1.756 and 1.589 m tall is what is left between those two lines,
  // both at 2.39:1 — inside the 2.5:1 the two high bands measured as the
  // legibility limit.
  // (`prop-dumpster-2` also stands here, but 3.4 m off the wall — furniture in
  // front of a wall is a plaza, not a defect. That distinction is the harness's.)
  //
  // …AND THE TWO PIECES ARE NO LONGER TWINS, because the two walls do not have
  // the same room. Once the decal-vs-decal check went in, the free ground-floor
  // brick between the transition toe and each wall's existing pair measured 5.0 m
  // west and 4.0 m east — so 4.2 m fits on one and 3.8 on the other, and the
  // posters that were 25% and 58% inside them moved to the gaps that were left.
  // The east poster went NORTH of its neighbour (z 40.0 → 41.2, where the
  // transition is still only 9 mm tall) because there was no 1.2 m gap south of
  // it; the west one shrank to 1.0 m to fit the 1.3 m it had.
  onWall(4, "w-north-piece", 6, 1.5, 4.2, 1.756, 0),
  onWall(4, "w-north-piece2", 0.5, 1.3, 4.2, 2.1, 2, true),
  onWall(4, "w-north-poster", 3.2, 1.5, 1.0, 1.417, 3),
  onWall(4, "w-north-throw", -2, 4.1, 3.4, 1.3, 1),
  onWall(5, "e-north-piece", -6.5, 1.54, 3.8, 1.589, 1),
  onWall(5, "e-north-piece2", -1.5, 1.3, 4.4, 2.15, 0, true),
  onWall(5, "e-north-poster", 1.6, 1.45, 1.2, 1.7, 3, true),
  onWall(5, "e-north-throw", 1, 4.1, 3.2, 1.28, 2, true),
  // The north wall's two flyposters, rehoused. These two walls kept the clear
  // 3.45 → 4.85 m band that facade 0 lost to the bank, and it is empty here
  // apart from one throw-up each — so the paper goes in at its own full portrait
  // size instead of being squashed into a letterbox it was never drawn for.
  // North edges held at z 44.0 / 43.9, clear of where the apron reaches 3.4 m.
  onWall(4, "n-poster-4", -4.5, 4.14, 1.02, 1.4, 3),
  onWall(5, "n-poster-5", 4.4, 4.14, 1.02, 1.4, 3, true),

  // --- the south block, above the raised platform's lip --------------------
  // The platform is 1.15 m of concrete against this wall, so nothing sits lower
  // than that — everything here starts where the deck you are standing on ends.
  onWall(1, "s-piece-w", -22, 1.8, 3.2, 1.25, 1),
  onWall(1, "s-piece-wc", -13, 1.8, 3.2, 1.25, 2, true),
  onWall(1, "s-piece-c", -4, 1.8, 3.2, 1.25, 0),
  onWall(1, "s-piece-e", 14, 1.8, 3.2, 1.25, 2, true),
  onWall(1, "s-piece-far-e", 25, 1.8, 3.2, 1.25, 1),
  // …and two throw-ups high on the bare brick, over the fascia signs, where
  // there is nothing standing proud of the wall at all.
  onWall(1, "s-throw-w", -18, 4.1, 3.3, 1.3, 0, true),
  onWall(1, "s-throw-e", 9, 4.1, 3.3, 1.3, 2),
  onWall(1, "s-poster-1", -8, 1.8, 1.05, 1.2, 3),
  onWall(1, "s-poster-2", 6, 1.8, 1.05, 1.2, 3, true),
  // The hollow — an outline nobody came back to fill, which is what half the
  // paint on a real spot is. It goes on the widest gap this wall has left
  // (x 14.6 → 22.4) and in the narrowest window in the level: the platform deck
  // is 1.15 m of concrete against this brick and the fascia signs start at 2.49,
  // so there is 1.29 m to work in and the piece is 1.24. Its 2.799:1 art is the
  // one shape in the new set that fits a slot like that without being pulled —
  // 3.47 m of it, which the 7.8 m gap holds with 2.2 m spare at each end.
  onWall(1, "s-hollow", 18, 1.82, 3.47, 1.24, 7),

  // --- the west block -------------------------------------------------------
  // The loading dock covers this wall from z = 12 to 26, so the run down the
  // dock carries pieces at DOCK height and the plaza end carries them at ground
  // level. The alley mouth at along -6…2 stays bare, which is the point of it.
  // Ground level here is now z = -17 … -4 and z = 26 … 30 and nothing else: the
  // terrace's west access ramp stands in front of the wall from z = -32 to -17,
  // and a 15 m ramp rising to 1.15 m hides the bottom half of anything painted
  // behind it. The rest of this wall's paint went up onto the dock run.
  onWall(2, "w-piece-s", 6, 1.25, 5.2, 2.3, 2),
  onWall(2, "w-piece-sc", 12, 1.25, 5.2, 2.3, 0, true),
  onWall(2, "w-piece-n", -31, 1.25, 4.4, 2.3, 1),
  onWall(2, "w-piece-dock-s", -16, 1.85, 3.2, 1.2, 2, true),
  onWall(2, "w-piece-dock", -20, 1.85, 3.2, 1.2, 1),
  onWall(2, "w-piece-dock2", -26, 1.85, 3.2, 1.2, 0, true),
  onWall(2, "w-throw-dock", -23, 4.1, 3.3, 1.3, 2),
  // THE PAPER WAS PRINTED INSIDE THE PAINT, AND NOTHING HAD EVER CHECKED THAT.
  //
  // Every occlusion check this file has ever had asks what MATTER is in front of
  // a piece, and two decals on one wall are both perfectly clear of matter — so
  // `w-poster-2` sat **100% inside** `w-piece-s` (a 5.2 m burner from z -10.6 to
  // -5.4, with the poster at -7 to -5.8) and `w-poster-1` 17% inside it, and both
  // measured green on every pass. `tools/decal-gap.mjs` compares the quads
  // against each other now; it found five muddled pairs on the first run, two of
  // them total burials, and it caught four of my own in the same breath.
  //
  // The clear paper-sized gaps on this wall are z -5.4 → -4.0 (the burner's north
  // end to the alley mouth) and z 4.0 → 5.7 (the alley's far side to the new
  // roller piece, which moved 30 cm north to open it). One poster in each. Small
  // overlaps are left alone deliberately — writers paste over each other, and the
  // harness passes anything under 25% for exactly that reason.
  onWall(2, "w-poster-1", -6.85, 1.5, 1.2, 1.7, 3),
  onWall(2, "w-poster-2", -2.7, 1.45, 1.2, 1.7, 3, true),
  // THE TWO NEW PIECES, and they are here because this is the only run of clear
  // ground-floor brick left in the level: the alley mouth ends at z 4 and the
  // loading dock stands in front of the wall from z 12, so z 5 → 11.5 is six
  // metres nobody had painted. It is also the west FOOTWAY, which you ride the
  // length of on the way to the dock — a wall you pass at arm's length rather
  // than one you look at from forty metres, so a roller piece and a character
  // next to each other read as two writers who were both here.
  //
  // THE 2.49 m CEILING IS THE FASCIA SIGNS AND IT IS NOT NEGOTIABLE. Every bay
  // on every facade carries a sign standing 0.53 → 0.75 m proud from y 2.49 to
  // 3.15, and at BAY_PITCH 4.7 with a 4.3 m guard the piers between them are
  // 0.4 m wide — so there is no 3 m span of ground-floor wall anywhere in this
  // level that is clear of one. Both pieces therefore top out at 2.46, which is
  // also just about as high as somebody with a can can reach: 0.54 → 2.47 m is
  // the band a person standing on that pavement actually paints.
  onWall(2, "w-roller", -9.3, 1.5, 3.2, 1.93, 4),
  onWall(2, "w-character", -12.6, 1.55, 1.7, 1.824, 5),

  // --- the east block -------------------------------------------------------
  // The chain-link fence stands 0.8 m off this wall from z = 6 to 26 and 2.4 m
  // up it, so that stretch is painted ABOVE the fence line and nowhere else.
  onWall(3, "e-piece-s", -28, 1.25, 5.6, 2.3, 0),
  onWall(3, "e-piece-sc", -20, 1.25, 5.6, 2.3, 1, true),
  // …and this one had a HOARDING across its north end. `clutter-hoarding-22` is
  // a 4.6 m board bolted flat to this wall from z -12.30 to -7.70, and a 5.6 m
  // piece centred on z -14 reached z -11.2 — 18% of it behind plywood, measured.
  // Two metres south puts the whole piece in the clear between the hoarding and
  // its neighbour, which spans z -24.8 → -19.2.
  onWall(3, "e-piece-sn", -14, 1.25, 5.6, 2.3, 2),
  // Over the fence AND over the fascia signs: the bare brick above the plinth
  // is the only part of this wall with nothing standing in front of it.
  onWall(3, "e-throw-s", 12, 4.1, 3.3, 1.3, 0, true),
  onWall(3, "e-throw-n", 22, 4.1, 3.3, 1.3, 1),
  // …and the east wall's poster was the other total burial: 100% inside
  // `e-piece-s` (z -32.8 → -27.2, poster at -31.6 → -30.4). Moved into the 2.4 m
  // of clear brick between that piece and its neighbour. See `w-poster-2`.
  onWall(3, "e-poster-1", -24, 1.5, 1.2, 1.7, 3),
  // The chrome hand-style, in the 3.7 m of wall between the hoarding's south end
  // (z -7.7) and the alley mouth (z -4). A one-stroke tag with the paint still
  // running is exactly what goes on the last clear panel beside an alley — and
  // this is the wall you look at across the whole southbound half of the plaza.
  // Same 2.46 ceiling as the west pair, same reason: the fascia signs.
  onWall(3, "e-chrome", -4, 1.45, 2.6, 2.06, 6),

  // --- the spot's own concrete, which is what you see while you are riding --
  // The platform's north face is interrupted by the stair set, the hubba and the
  // bank, so its tags sit outside all three.
  onSolid("platform", "platform-riser-w", "+z", -24, 0.6, 2.4, 0.85, 2),
  onSolid("platform", "platform-riser-wc", "+z", -19, 0.62, 2.4, 0.85, 0, true),
  onSolid("platform", "platform-riser-e", "+z", 12, 0.6, 2.4, 0.85, 1),
  onSolid("platform", "platform-riser-ee", "+z", 20, 0.62, 2.4, 0.85, 2, true),
  onSolid("dock", "dock-face-s", "+x", -4, 0.62, 2.2, 0.8, 1),
  onSolid("dock", "dock-face-n", "+x", 2, 0.6, 2.2, 0.8, 2, true),
  // The deck's own side faces are gone — the roll-off banks are built against
  // both of them now — so the pair that used to hang there is on the brick at
  // deck height instead, which is what you are looking at while you are stalled
  // up there anyway.
  // …and they are TAGS rather than two more burners at y = 4.1. These two sit in
  // the same band as the production wall above and used to be two more members
  // of the ten-across row it was; a piece the size of a burner has nowhere to go
  // in a 1.4 m band but dead centre. Small, at the two ends of the band's
  // vertical range, so they read as somebody's scrawl beside the paint rather
  // than as two more panels of the border.
  // …and they moved WITH the band above when the bank drowned it: qp-wall-e was
  // **80% buried** and qp-wall-w survived only because it happened to be hung
  // 0.7 m higher. Both read the concrete now, like the rest of the strip.
  onWallOver(0, "qp-wall-w", -9, 0.96, 0.42, 1, 0.05),
  onWallOver(0, "qp-wall-e", 2, 0.92, 0.4, 2, 0.07, true),
  // …and on the roll-offs' own PLYWOOD, which is the closest painted thing to
  // the coping and the first paint you meet coming up the main line. Placed on
  // the tall half of each wedge — the face falls to nothing at the outboard
  // end, and a piece hung over the thin end would stand off the edge of it.
  onSolid("qp-roll-w", "qp-roll-w-tag", "+x", 2.0, 0.85, 2.0, 1.0, 1),
  onSolid("qp-roll-e", "qp-roll-e-tag", "+x", -1.5, 0.8, 2.0, 1.0, 0, true),
  onSolid("block-pad", "block-face-w", "-x", 2, 0.3, 1.1, 0.4, 1),
  onSolid("ledge-long", "ledge-long-tag", "-x", 3, 0.24, 0.9, 0.32, 2),
  // On the pad's WEST face: both its ends are banks now, so the only vertical
  // faces it has left are the two long sides you grind.
  onSolid("manual-pad", "manual-pad-tag", "-x", 0, 0.22, 0.8, 0.28, 0, true),
  onSolid("ledge-long", "ledge-long-tag2", "-x", -3, 0.24, 0.9, 0.32, 0, true),

  // --- flat on the deck, where a run puts your eyes ------------------------
  //
  // Twice as many as it shipped with, and the six new ones are all in the
  // OPENING SHOT. You spawn on the terrace looking north up the plaza, and that
  // frame carried a single tag 20 m off to the left — everything else was clean
  // concrete for 40 m. Ground paint is the cheapest thing in the level that
  // reads at that distance, and this spot is supposed to be somewhere people go.
  //
  // EVERY ONE OF THESE IS NOW MEASURED, and eight of the thirteen were wrong.
  // `tools/decal-gap.mjs` marches out of every sample point on every quad, and
  // a FLAT tag has two ways to be wrong that a wall piece does not: the floor it
  // is lying on can fall away underneath it (the road's 0.38 m trench, a
  // driveway apron's cross-fall) or an obstacle can stand up through it (the
  // quarter pipe's toe, a roll-off bank, a bin's base). A 3.5 m square laid down
  // at a hand-picked (x, z) reaches 2.3 m from its own centre once it is turned,
  // which is further than it looks and is why five of these straddled something.
  //
  // The numbers below are each tag's whole footprint against the solids it
  // crosses, not its centre — see the harness for the per-piece gaps.

  // WAS (-2, 16): a 3.5 m square turned 0.4 rad reaches z 13.7 → 18.3, and the
  // clear floor between the manual pad's north bump (ends z 16.2) and the
  // quarter pipe's toe (z 17.5) is 1.3 m. 58% of it was under concrete. Moved
  // WEST of the pad, where the plaza is open from the road to the transition.
  tag("tag-plaza-n", -10.5, 15, 0.4, 3.2, 2),
  // WAS (9, 22): its north-east corner ran 1.9 m into `qp-roll-e`, the east
  // roll-off, which is 2.82 m of bank at its deck end — 33% buried. Held south
  // of z 22.68, where the roll-off's footprint starts.
  tag("tag-qp-run", 9.5, 19.5, -1.1, 3.6, 0),
  // WAS (-16, -6): reached z -3.76, and the road is a 0.38 m TRENCH from z -4.
  // It hung 0.34 m in the air over the kerb line. Moved south into the plaza,
  // and east of `ledge-angled-sw` (x -22.25 → -15.75) which it would otherwise
  // have gone under.
  tag("tag-plaza-s", -11, -8.5, 2.2, 3.2, 1),
  // WAS (5, -6): 2% under `clutter-mailbox-38`, which stands at (5, -5.6) — dead
  // centre of it. Moved EAST rather than south, which is the only free direction
  // here: south of the box is `bank` (the 1.15 m drop-in off the platform, whose
  // toe is at z -9.5) and north is the road's own kerb line at z -4.
  tag("tag-crossing", 9, -6.5, 0.9, 3, 0),
  tag("tag-dock-run", -29, 18, 0.2, 3.4, 2, 1.114),
  tag("tag-platform", -20, -20, -0.6, 3.6, 1, 1.164),
  // The terrace you start on, which is the whole bottom half of the first frame.
  tag("tag-terrace-c", 3.5, -20.5, 1.3, 3.8, 0, 1.164),
  tag("tag-terrace-e", 14, -24, -0.35, 3.2, 2, 1.164),
  tag("tag-terrace-w", -9, -27, 2.6, 3.0, 1, 1.164),
  // …and the plaza floor beyond it, either side of the main line.
  // WAS (-24, -8): 4% under `ledge-angled-sw`. Moved west — and then held SOUTH
  // of z -6.4 as well, because x -29 → -24 is the west driveway apron and its
  // cross-fall drops 0.38 m under a tag lying flat at y 0.014.
  tag("tag-plaza-w", -26, -9, 1.1, 3.4, 0),
  // WAS (19, -7): x 17 → 23 is the EAST driveway apron, so 0.19 m of air had
  // opened under its north edge. Same fix, same reason.
  tag("tag-plaza-e", 19, -9, -1.4, 3.6, 2),
  // WAS (24, 21): 18% under `block-ramp` (z 18 → 20, 0.55 m of bank). Moved
  // north, and west of x 26 where the funbox's south bank starts.
  tag("tag-plaza-ne", 23.5, 23, 0.7, 3.3, 1),
  // On the quarter pipe's platform, which is where you stand and look down.
  //
  // THIS IS THE PIECE THE PLAYER SAW HANGING IN THE AIR, and it was 2.65 m up.
  // It was laid at z 31.2 on `QP_DECK_Y` — but the deck is z 22.68 → 25.48 and
  // z 31.2 is out over `qp-land-2`, the third segment of the landing bank,
  // which has fallen to 0.45 m by there. So a 3.2 m tag was floating two and a
  // half metres above the bank you land on, side-on to the run and lit from
  // underneath: from the plaza it reads as a billboard behind the ramp.
  //
  // The deck is only 2.8 m deep, and a square turned by `yaw` reaches
  // (size/2)·(|cos yaw| + |sin yaw|) from its centre — 2.20 m at the old 3.2 and
  // 0.55 rad, which is why nothing this size could ever have sat on it. 2.1 at
  // 0.3 rad reaches 1.31 m, so it lands inside the deck with 9 cm at each edge.
  //
  // Centred on the DECK SOLID'S own `cz` rather than on a z of its own: that is
  // the same discipline `onSolid` is built on, and it is the only version of
  // this line that cannot come apart again the next time the ramp is re-cut.
  // (spot.ts exports QP_DECK_Z but not the deck's far edge, and re-typing 2.8
  // here would be exactly the hand-typed coordinate that put it in the air.)
  tag("tag-qp-deck", -6.5, solidOf("qp-deck").cz, 0.3, 2.1, 1, QP_DECK_Y + 0.014),
];

interface Painted {
  group: THREE.Group;
  /**
   * One material per art index, so a landed image swaps in four places at once
   * — TWICE over, because paint on the floor is not paint on a wall.
   *
   * A chrome throw-up is 90% black outline, and laid flat under a low sun the
   * wall version of it renders as a dark splat that is the loudest thing in the
   * plaza. The floor set is the same image at 55% and rougher, which is what
   * two years of wheels and boots do to it, and it is the difference between a
   * tag on the ground and a sticker on the ground.
   */
  materials: THREE.MeshStandardMaterial[];
  flat: THREE.MeshStandardMaterial[];
  /**
   * Which art indices this tier actually put geometry on the wall for.
   *
   * `buildPaint` drops any piece narrower than the tier's budget, and on a phone
   * that can empty a whole image: the contest flyposter is nine placements and
   * every one of them is under 1.6 m, so a phone builds NO mesh for it — and
   * `dressPaint` was still fetching, decoding and holding its 1024² basecolor.
   * 5.33 MB for a picture no pixel on the device is ever asked to sample.
   *
   * It is derived from the same `perArt` buffers the meshes are built from
   * rather than from a second copy of the budget rule, so the two can never
   * disagree. On desktop tiers the budget is 0, every piece survives, and every
   * entry here is true — the desktop loads exactly what it loaded before.
   */
  drawn: boolean[];
}

/**
 * Spray, paper, road paint, ground wear, waxed ledge edges and litter — every
 * layer that is laid ON the spot rather than built out of it.
 *
 * The spray IS lit, and that is a reversal. It shipped unlit to keep it
 * saturated, and unlit paint on a sunlit wall reads as a sticker stuck onto the
 * photo — a piece in the shade of the north block was exactly as bright as one
 * in full sun. It now runs through a standard material at roughness 0.96, which
 * has no specular lobe worth worrying about and puts every piece in the same
 * light as the brick under it. The merged geometry carries real normals for it.
 *
 * The wear layers stay unlit — dirt is a veil, not a surface — and are
 * alpha-composited rather than multiplied; see `groundGrimeCanvas` for why the
 * physically better answer had to be dropped.
 *
 * Everything here is merged or instanced: thirty-odd separate quads for the
 * spray alone would be thirty draw calls of two triangles each.
 */
export function buildPaint(tier: QualityTier): Painted {
  const group = new THREE.Group();
  group.name = "spot-paint";
  const materials = GRAFFITI_URLS.map(
    (_, i) =>
      new THREE.MeshStandardMaterial({
        map: graffitiCanvas(101 + i * 37),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        roughness: 0.96,
        metalness: 0,
      }),
  );
  const flat = materials.map(
    (m) =>
      new THREE.MeshStandardMaterial({
        map: m.map,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
        roughness: 1,
        metalness: 0,
      }),
  );

  // --- the spray, one merged mesh per image --------------------------------
  // Phones lose the small stuff first — the big wall pieces are the read.
  const budget = tier.particleScale < 0.6 ? 1.6 : 0;
  const perArt: { pos: number[]; nor: number[]; uv: number[] }[] = [...materials, ...flat].map(
    () => ({ pos: [], nor: [], uv: [] }),
  );
  for (const d of DECALS) {
    if (d.w < budget) continue;
    const b = perArt[d.art + (d.flat ? materials.length : 0)];
    const c = Math.cos(d.yaw);
    const s = Math.sin(d.yaw);
    // A corner at (u, v) in the piece's own plane: a wall piece stands up, a
    // flat one lies down, and both turn about +Y by the same yaw.
    const at = (u: number, v: number): number[] =>
      d.flat
        ? [d.x + c * u - s * v, d.y, d.z + s * u + c * v]
        : [d.x + c * u, d.y + v, d.z - s * u];
    // …and the same yaw gives its facing, which is what lets the sun find it.
    const n = d.flat ? [0, 1, 0] : [s, 0, c];
    const p00 = at(-d.w / 2, -d.h / 2);
    const p10 = at(d.w / 2, -d.h / 2);
    const p11 = at(d.w / 2, d.h / 2);
    const p01 = at(-d.w / 2, d.h / 2);
    // Four images over fifty pieces: mirroring is what stops the wall reading
    // as the same four stickers over and over.
    // …and the window is what makes `w` x `h` the metres of PAINT rather than the
    // metres of a square image with empty bands in it — see `PAINT_WINDOW`. Arts
    // 0–3 hand back the full image, so every placement written before this line
    // existed is byte-identical.
    const win = PAINT_WINDOW[d.art] ?? FULL_IMAGE;
    const u0 = d.flip ? win.u1 : win.u0;
    const u1 = d.flip ? win.u0 : win.u1;
    const v0 = win.v0;
    const v1 = win.v1;
    const tri: [number[], number[]][] = [
      [p00, [u0, v0]], [p10, [u1, v0]], [p11, [u1, v1]],
      [p00, [u0, v0]], [p11, [u1, v1]], [p01, [u0, v1]],
    ];
    for (const [pt, uv] of tri) {
      b.pos.push(pt[0], pt[1], pt[2]);
      b.nor.push(n[0], n[1], n[2]);
      b.uv.push(uv[0], uv[1]);
    }
  }
  // Which images this tier will actually show — see `Painted.drawn`. Read off
  // the buffers, so a piece that survived the budget is the only thing that can
  // make an image worth fetching.
  const drawn = materials.map(
    (_, i) => perArt[i].pos.length > 0 || perArt[materials.length + i].pos.length > 0,
  );

  for (let i = 0; i < perArt.length; i++) {
    if (!perArt[i].pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(perArt[i].pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(perArt[i].nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(perArt[i].uv, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, [...materials, ...flat][i]);
    mesh.receiveShadow = true;
    mesh.renderOrder = 3;
    group.add(mesh);
  }

  // --- what the ground has been through ------------------------------------
  // Four floor materials to lay it on, not two: the plaza slabs, the footway
  // panels, the road, and the trowelled park pours. Splitting the plaza into
  // footway and bays would have been a hollow win if half the level's floor had
  // then dropped out of the wear pass and stood there brand new.
  // One quad per big flat slab per layer, laid over whatever basecolor landed.
  // Each slab takes its own window into the shared canvas from its WORLD
  // position, so two neighbours never show the same stain twice across the seam
  // between them — and the two layers' windows drift against each other,
  // because 37 and 16 have no factor in common.
  const stain = new THREE.MeshStandardMaterial({
    map: groundStainCanvas(),
    transparent: true,
    depthWrite: false,
    roughness: 0.98,
    metalness: 0,
  });
  const wear = new THREE.MeshStandardMaterial({
    map: groundGrimeCanvas(),
    transparent: true,
    depthWrite: false,
    roughness: 0.98,
    metalness: 0,
  });
  // The detail layer is a second transparent pass over most of the screen, and
  // on a phone the floor IS most of the screen. The pooling is what does the
  // work; the cracks are what you only see standing still.
  const layers: [THREE.MeshStandardMaterial, number, number][] =
    tier.particleScale >= 0.6
      ? [
          [stain, 37, 0],
          [wear, 16, 1],
        ]
      : [[stain, 37, 0]];
  // SPOT_SOLIDS: the furniture's colliders are flat-topped too, and a wear quad
  // laid on a dumpster lid is a grey rectangle floating in the plaza.
  for (const s of SPOT_SOLIDS) {
    if (s.profile.shape !== "flat") continue;
    if (!GROUND_LOOKS.has(s.look)) continue;
    for (const [mat, tile, layer] of layers) {
      const geo = new THREE.PlaneGeometry(s.hx * 2, s.hz * 2);
      const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (uv.getX(i) * s.hx * 2 + s.cx) / tile, (uv.getY(i) * s.hz * 2 + s.cz) / tile);
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      // 2 mm apart so the pair never z-fights; both under the wax and the road
      // paint, which is the order those things went down in.
      mesh.position.set(s.cx, s.profile.y + 0.008 + layer * 0.002, s.cz);
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      group.add(mesh);
    }
  }

  // …AND THE SAME TWO VEILS ON EVERYTHING THAT IS NOT FLAT.
  //
  // The loop above is `shape !== "flat" ? continue`, and that one word is why
  // the ramps looked like a different game from the floor they grow out of.
  // Sixteen solid groups draw with `park` — every transition, bank, deck and
  // manual pad in the level — and until now the flat ones took two wear layers,
  // twenty-eight tar patches and sixteen skids while the sloped ones took
  // nothing. Measured across the seam where the quarter pipe's toe meets the
  // plaza: luminance variation 7.0 on the transition against 26–42 on the slab
  // 1.5 m in front of it, both concrete, both under the same sun.
  //
  // Same materials, same tiles, same world anchoring — so the dirt does not
  // stop at the toe, it carries up the face.
  group.add(buildSlopeWear(layers));

  // --- what has actually happened on it ------------------------------------
  group.add(buildGroundMarks(tier));

  // --- the ledges, where they have been skated -----------------------------
  group.add(buildWax());

  // `toneMapped: true`, and that word is the whole fix. A `MeshBasicMaterial`
  // opted OUT of tone mapping renders its texel at full sRGB and then goes
  // through bloom, so 0.89-white paint arrived at the bloom knee ALREADY over
  // it and lit up. Everything else in the level is tone mapped, so the paint
  // was the one surface in the game that could out-glow the sun. Tone mapped,
  // it is paint on a road again.
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(88, 8),
    new THREE.MeshBasicMaterial({
      map: markingsCanvas(),
      transparent: true,
      depthWrite: false,
    }),
  );
  road.rotation.x = -Math.PI / 2;
  // Just clear of the asphalt, which sits ROAD_DROP below the pavement — and
  // above the wear layer, because paint goes on after a road gets dirty.
  road.position.set(0, 0.018 - ROAD_DROP, 0);
  road.renderOrder = 4;
  group.add(road);

  // The zebra is GONE, by the player's call: "we need to remove the crosswalks
  // related to the first map". It was eleven 11 cm bars of near-white across
  // the raised crossing — the brightest thing in the level and the first thing
  // he saw. `crossingCanvas` stays in the file: the crossing table it belonged
  // to is still there and still ridden, so if paint ever comes back it comes
  // back tone mapped and dirtier, not as a new invention.

  group.add(buildLitter(tier));

  return { group, materials, flat, drawn };
}

/**
 * The wear layers, carried up every ramp, bank and transition in the level.
 *
 * Built off `topPolyline` — the SAME polyline `meshSolid` emits triangles from —
 * so a veil on a 70° arc lies on the arc rather than on somebody's second idea
 * of where it is. That shared origin is this file pair's whole discipline and it
 * is the only reason a 10 mm lift is enough clearance on a curve.
 *
 * The UVs are the flat pass's, continued: `uOff` and `vOff` below put the
 * solid's own local u and v back where they are in the world, so a stain
 * crossing the toe of the quarter pipe is the same stain on both sides of the
 * seam and at the same scale. The one thing that changes on a slope is that v
 * measures ARC LENGTH rather than ground distance — a top-projected texture on a
 * 70° face is stretched 2.9x along the fall line, which is the stretch that made
 * the old plywood deck read as a smear.
 *
 * Aprons and stairs are out, and for opposite reasons. An apron's top falls
 * across itself, so its polyline is a centre line the mesh scales per column and
 * a veil built off it would sit proud at the splayed sides. A stair set's
 * polyline and its query are deliberately not the same surface (see `profileY`),
 * so anything laid on the nosing plane floats over the treads.
 */
function buildSlopeWear(
  layers: readonly (readonly [THREE.MeshStandardMaterial, number, number])[],
): THREE.Group {
  const g = new THREE.Group();
  g.name = "spot-slope-wear";
  const band = new THREE.MeshStandardMaterial({
    map: transitionWearCanvas(),
    transparent: true,
    depthWrite: false,
    roughness: 0.9,
    metalness: 0,
  });
  /**
   * Metres across the face per copy of the band.
   *
   * 6.5 and not 3.2: what is in this image is a wash, and a wash wants to be
   * wider than the thing looking at it. At 3.2 the quarter pipe showed six
   * copies across its 20 m and the streaks lined up into columns.
   */
  const BAND_TILE = 6.5;
  /** Clear of the concrete, and of each other. */
  const LIFT = 0.01;
  const bufs = layers.map(() => ({ pos: [] as number[], nor: [] as number[], uv: [] as number[] }));
  const bandBuf = { pos: [] as number[], nor: [] as number[], uv: [] as number[] };
  const p0 = new THREE.Vector3();

  for (const s of SPOT_SOLIDS) {
    const shape = s.profile.shape;
    if (shape !== "ramp" && shape !== "arc") continue;
    if (!GROUND_LOOKS.has(s.look)) continue;
    const pts = topPolyline(s);
    const c = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    // The solid's local axes, put back where they are in the world. `solidPoint`
    // sends a local (u, v) to (cx + c·u + sn·v, cz − sn·u + c·v), so the world
    // distance along +u is `cx·c − cz·sn + u` and along +v is `cx·sn + cz·c + v`
    // — one scalar each, and both continuous with the plaza's own x and z.
    const uOff = s.cx * c - s.cz * sn;
    const vOff = s.cx * sn + s.cz * c;
    const vAt = (t: number): number => -s.hz + t * 2 * s.hz;
    // Arc length up the face, so the texture is not stretched by the slope.
    const arc: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      arc.push(arc[i - 1] + Math.hypot(vAt(pts[i].t) - vAt(pts[i - 1].t), pts[i].y - pts[i - 1].y));
    }
    // THE ORIENTED BAND GOES ON ARCS AND NOTHING ELSE, and the reason is a fact
    // about how this file describes shapes rather than a preference. An arc is
    // one solid with a toe at t = 0 and a lip at t = 1, so a dirt line and a wax
    // band anchored to its ends land where they belong. A BANK is a chain —
    // `easedRise` emits the funbox's, the manual pad's and the quarter pipe's
    // landing as five or six ramp solids each — and a band anchored to "this
    // solid's ends" would draw five dirt lines up one ramp. The two veils above
    // are anchored in WORLD space and cross those seams without knowing they are
    // there, which is exactly why they are the ones that go everywhere.
    const oriented = s.profile.shape === "arc";

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.t === b.t) continue; // a stair riser; nothing here rides one
      const nx = a.nv * sn;
      const ny = a.ny;
      const nz = a.nv * c;
      const va = vAt(a.t);
      const vb = vAt(b.t);
      // Four corners, in the solid's own frame: (-hx, a) (-hx, b) (+hx, b)
      // (+hx, a). The top is ruled along u for every shape that gets here, so
      // one column across the whole width is exact.
      const corner = (u: number, pt: (typeof pts)[number], v: number, at: number): number[] => {
        solidPoint(s, u, pt.y, v, p0);
        return [p0.x, p0.y, p0.z, uOff + u, at];
      };
      const c00 = corner(-s.hx, a, va, arc[i]);
      const c01 = corner(-s.hx, b, vb, arc[i + 1]);
      const c11 = corner(s.hx, b, vb, arc[i + 1]);
      const c10 = corner(s.hx, a, va, arc[i]);
      const face = [c00, c01, c11, c00, c11, c10];
      for (let li = 0; li < layers.length; li++) {
        const tile = layers[li][1];
        const lift = LIFT + li * 0.002;
        for (const v of face) {
          bufs[li].pos.push(v[0] + nx * lift, v[1] + ny * lift, v[2] + nz * lift);
          bufs[li].nor.push(nx, ny, nz);
          bufs[li].uv.push(v[3] / tile, (vOff + vAt(0) + v[4]) / tile);
        }
      }
      // …and the oriented band on top of them, anchored to the arc's own ends.
      if (!oriented) continue;
      const total = arc[arc.length - 1];
      const lift = LIFT + layers.length * 0.002;
      for (const v of face) {
        bandBuf.pos.push(v[0] + nx * lift, v[1] + ny * lift, v[2] + nz * lift);
        bandBuf.nor.push(nx, ny, nz);
        bandBuf.uv.push(v[3] / BAND_TILE, v[4] / total);
      }
    }
  }

  const emit = (
    buf: { pos: number[]; nor: number[]; uv: number[] },
    mat: THREE.Material,
    order: number,
  ): void => {
    if (!buf.pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(buf.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(buf.nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(buf.uv, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = order;
    g.add(mesh);
  };
  for (let i = 0; i < layers.length; i++) emit(bufs[i], layers[i][0], 1);
  emit(bandBuf, band, 2);
  return g;
}

/**
 * The floor a mark may be laid on, or null.
 *
 * Flat, concrete or asphalt, and the HIGHEST thing at that point — a patch that
 * resolves to the plaza under a ledge is a patch drawn inside a ledge. Asked of
 * the description rather than of a typed-in height, the same way `tag()` and
 * `ledgeOn` are, so a slab that moves takes its oil stains with it.
 */
function markFloorAt(x: number, z: number): { y: number; kind: LookKey } | null {
  let best: Solid | null = null;
  let bestY = -Infinity;
  for (const s of SPOT_SOLIDS) {
    const top = topOf(s, x, z);
    if (top === null || top <= bestY) continue;
    best = s;
    bestY = top;
  }
  if (!best || bestY > 3 || best.profile.shape !== "flat") return null;
  if (!GROUND_LOOKS.has(best.look)) return null;
  return { y: bestY, kind: best.look };
}

/**
 * Patches, oil, rubber and ironwork, laid flat on the plaza.
 *
 * Scattered off a fixed seed but placed against the SURFACE QUERY: every mark
 * has to land wholly on one flat slab of concrete or asphalt, corners included,
 * or it is dropped rather than nudged. That is what stops a 3 m tar patch
 * hanging half off the platform's lip, and it is why the counts below are what
 * the plaza asks for rather than what it gets.
 *
 * The ironwork is placed by hand, because a manhole is not random: covers sit
 * out in the plaza where a plaza's services run, and gullies sit in the gutter
 * where the water goes. Getting those two in the right places is most of what
 * makes a floor read as a street rather than as a texture.
 */
function buildGroundMarks(tier: QualityTier): THREE.Group {
  const g = new THREE.Group();
  g.name = "spot-marks";
  // 0 oil · 1–3 the three saw-cut repairs · 4 rubber · 5 cover · 6 gully.
  const mats = [
    oilCanvas(),
    patchCanvas(0),
    patchCanvas(1),
    patchCanvas(2),
    skidCanvas(),
    ironCanvas(false),
    ironCanvas(true),
  ].map(
    (map) =>
      new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        depthWrite: false,
        roughness: 0.94,
        metalness: 0,
      }),
  );
  const RUBBER = 4;
  const buf = mats.map(() => ({ pos: [] as number[], nor: [] as number[], uv: [] as number[] }));
  /** Lay one quad flat, if the whole of it is standing on one slab. */
  const lay = (art: number, x: number, z: number, yaw: number, w: number, h: number): boolean => {
    const at = markFloorAt(x, z);
    if (!at) return false;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const corner = (u: number, v: number): [number, number] => [x + c * u - s * v, z + s * u + c * v];
    const pts: [number, number][] = [
      corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2),
    ];
    for (const [px, pz] of pts) {
      const f = markFloorAt(px, pz);
      if (!f || Math.abs(f.y - at.y) > 0.01) return false;
    }
    const b = buf[art];
    // 3 mm over the wear layers and under the road paint, which is the order
    // these things went down in: dirt, then what happened, then the lines.
    const y = at.y + 0.013;
    const uvs: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    // 0-2-1 and 0-3-2, not 0-1-2 and 0-2-3: the corners run anticlockwise seen
    // from ABOVE, so the obvious winding puts the front face on the underside
    // of the plaza and every mark is backface-culled. 164 of them shipped that
    // way for one render and not one was on screen. The spray next door gets
    // away with the same order only because it is DoubleSide.
    for (const [i, j, k] of [[0, 2, 1], [0, 3, 2]]) {
      for (const idx of [i, j, k]) {
        b.pos.push(pts[idx][0], y, pts[idx][1]);
        b.nor.push(0, 1, 0);
        b.uv.push(uvs[idx][0], uvs[idx][1]);
      }
    }
    return true;
  };

  const r = rng(881);
  /**
   * Try `want` of a kind in a box, and say how many actually found a slab.
   *
   * `square` is the repairs' whole fix: a floor saw runs along the slab, so a
   * cut lands on the grid or across it and never at 37°. Freely rotated they
   * came out as diamonds — see `patchCanvas`.
   */
  const scatter = (
    art: number,
    want: number,
    box: readonly [number, number, number, number],
    size: () => readonly [number, number],
    square = false,
  ): number => {
    let laid = 0;
    for (let i = 0; i < want * 5 && laid < want; i++) {
      const x = box[0] + r() * (box[1] - box[0]);
      const z = box[2] + r() * (box[3] - box[2]);
      const [w, h] = size();
      const yaw = square
        ? (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.08
        : r() * Math.PI;
      if (lay(art, x, z, yaw, w, h)) laid++;
    }
    return laid;
  };
  /** One repair, dealt round the three cuts so no shape ever clusters. */
  let cut = 0;
  const repairs = (
    want: number,
    box: readonly [number, number, number, number],
    size: () => readonly [number, number],
  ): void => {
    for (let i = 0; i < want; i++) scatter(1 + (cut++ % 3), 1, box, size, true);
  };

  // The counts are what the OPENING SHOT costs. The first pass laid 24 stains,
  // 28 patches and 15 skids over 4000 m² of plaza and the frame you spawn into
  // caught none of them — the verifier's "empty car park" survived the whole
  // layer. A street this size wants a mark every few metres, and the two boxes
  // that matter most are the terrace you start on and the plaza you look across.
  const oil = () => [1.0 + r() * 1.7, 1.0 + r() * 1.7] as const;
  const patch = () => { const w = 0.9 + r() * 1.9; return [w, w * (0.45 + r() * 0.85)] as const; };
  const skid = () => [2.6 + r() * 4.2, 1.2 + r() * 1.2] as const;
  // The boxes are read off the spot's own bound rather than typed in, which is
  // how they followed the block out when it grew four metres each side — the
  // first version had -33 and 31 hard-coded and would have left two four-metre
  // ribbons of brand-new concrete down both edges of the level.
  const W = SPOT_MIN_X + 1;
  const E = SPOT_MAX_X - 1;
  // Oil where things park and idle: the road, the dock, the loading bays.
  scatter(0, 24, [W, E, -3.4, 3.4], oil);
  scatter(0, 18, [W, E, -32, 30], oil);
  // …and the terrace, which is 52 m of concrete you cannot avoid looking at.
  scatter(0, 8, [-27, 23, -33, -15], oil);
  // Repairs, everywhere a plaza gets dug up for whatever runs under it.
  repairs(40, [W, E, -32, 30], patch);
  repairs(22, [-27, 23, -33, -15], patch);
  repairs(10, [W, E, -3.4, 3.4], patch);
  // Rubber, on the road, around the crossing, and off the terrace's own ramps.
  scatter(RUBBER, 16, [W, E, -3.4, 3.4], skid);
  scatter(RUBBER, 14, [-27, 23, -33, -15], skid);
  scatter(RUBBER, 12, [W, E, -12, 24], skid);
  // The ironwork. Covers out on the plaza, gullies in the gutter — 0.6 m off
  // the kerb, which is where a real one sits.
  for (const [x, z] of [[-17, 12], [8.5, 14.5], [-24, -20], [17.5, -22], [-9, 19.5], [24, 3.2], [-11.5, -8], [30, 21], [-33, 27]])
    lay(5, x, z, r() * Math.PI, 0.86, 0.86);
  for (const [x, z] of [[-26, -3.4], [-6, -3.4], [12, -3.4], [-20, 3.4], [2.5, 3.4], [21, 3.4], [30, -3.4], [-33, 3.4]])
    lay(6, x, z, 0, 1.0, 0.62);

  for (let i = 0; i < buf.length; i++) {
    if (!buf[i].pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(buf[i].pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(buf[i].nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(buf[i].uv, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mats[i]);
    mesh.name = `spot-mark-${i}`;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    g.add(mesh);
  }
  // Phones lose the rubber, which is the faintest of the seven and the one that
  // covers the most square metres of transparent fill. Found by NAME, not by
  // child index: a mesh is only added when its buffer has something in it, so
  // the index of any given art moves the moment a scatter finds no slab — and
  // when the repairs went from one card to three it moved for good.
  if (tier.particleScale < 0.6) {
    const rubber = g.getObjectByName(`spot-mark-${RUBBER}`);
    if (rubber) rubber.visible = false;
  }
  return g;
}

/**
 * A waxed, chipped band down every ledge the game lets you grind.
 *
 * Built off RAILS, the way the steel is — the wax is ON the grind line by
 * construction, so the polished strip and the thing that actually catches your
 * trucks can never end up in different places. Which side of the line is ledge
 * and which is fresh air is not stored anywhere, so it is ASKED: the surface
 * query is level with the line on the inside and has fallen away on the
 * outside, and that is the whole test.
 */
function buildWax(): THREE.Group {
  const g = new THREE.Group();
  g.name = "spot-wax";
  const mat = new THREE.MeshStandardMaterial({
    map: waxCanvas(),
    transparent: true,
    depthWrite: false,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  /** One wax tile every 2.4 m down the ledge, so the chips do not repeat. */
  const push = (a: number[], b: number[], c: number[], d: number[], len: number, n: number[]): void => {
    const s = len / 2.4;
    const tri: [number[], number[]][] = [
      [a, [0, 0]], [b, [s, 0]], [c, [s, 1]],
      [a, [0, 0]], [c, [s, 1]], [d, [0, 1]],
    ];
    for (const [pt, t] of tri) {
      pos.push(pt[0], pt[1], pt[2]);
      nor.push(n[0], n[1], n[2]);
      uv.push(t[0], t[1]);
    }
  };

  for (const line of RAILS) {
    // Kerbs are painted, not waxed: 12 cm of concrete has no top face worth a
    // band on it, and the road markings already carry that edge.
    if (line.kind !== "ledge" || line.id.startsWith("kerb")) continue;
    const dx = line.b.x - line.a.x;
    const dz = line.b.z - line.a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) continue;
    const nx = -dz / len;
    const nz = dx / len;
    const mx = (line.a.x + line.b.x) / 2;
    const mz = (line.a.z + line.b.z) / 2;
    const my = (line.a.y + line.b.y) / 2;
    const side = STREET_SPOT.height(mx + nx * 0.25, mz + nz * 0.25, my + 0.05) > my - 0.03 ? 1 : -1;
    const ix = nx * side;
    const iz = nz * side;

    const BAND = 0.3; // across the top face, in from the arris
    const DROP = 0.26; // and the scuff down the side under it
    const LIFT = 0.008;
    push(
      [line.a.x, line.a.y + LIFT, line.a.z],
      [line.b.x, line.b.y + LIFT, line.b.z],
      [line.b.x + ix * BAND, line.b.y + LIFT, line.b.z + iz * BAND],
      [line.a.x + ix * BAND, line.a.y + LIFT, line.a.z + iz * BAND],
      len,
      [0, 1, 0],
    );
    const ox = -ix * LIFT;
    const oz = -iz * LIFT;
    push(
      [line.a.x + ox, line.a.y, line.a.z + oz],
      [line.b.x + ox, line.b.y, line.b.z + oz],
      [line.b.x + ox, line.b.y - DROP, line.b.z + oz],
      [line.a.x + ox, line.a.y - DROP, line.a.z + oz],
      len,
      [-ix, 0, -iz],
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  g.add(mesh);
  return g;
}

/**
 * Paper, leaves and a flattened can, lying wherever the plaza put them.
 *
 * Scattered rather than placed, because litter has no intent — but scattered
 * against the SURFACE QUERY, so a scrap on the loading dock is on the dock and
 * not hanging in the air over it. Anything that lands on a roof is dropped
 * rather than nudged; a roof is not somewhere litter goes.
 */
function buildLitter(tier: QualityTier): THREE.Group {
  const g = new THREE.Group();
  g.name = "spot-litter";
  const r = rng(307);
  const mats = ([0, 1, 2] as const).map(
    (k) =>
      new THREE.MeshBasicMaterial({
        map: litterCanvas(k),
        transparent: true,
        depthWrite: false,
        alphaTest: 0.35,
        toneMapped: false,
      }),
  );
  const at: THREE.Matrix4[][] = [[], [], []];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const spin = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 0, 1);
  const count = Math.round(260 * Math.min(1, tier.particleScale + 0.25));
  /**
   * THE FLOOR HAS TO BE A FLOOR, and this is the fix for a band of paper that
   * hung in mid-air off the quarter pipe on every capture.
   *
   * Every piece of litter is a horizontal quad laid at whatever height the
   * highest solid at that point reports. On the plaza that is right. Over the
   * quarter pipe it is not: the arc's own footprint runs under the deck, so the
   * highest solid there is the DECK, and a sheet of paper laid flat at deck
   * height above a 65° transition is a sheet of paper hanging in the air two
   * metres off the concrete. Twenty of them read as a shelf of moths off the
   * coping and a fresh capture called them exactly that.
   *
   * `markFloorAt` is the answer and it was already written next door — it is
   * what the oil stains and the tar patches are placed against, and it returns
   * null unless the highest thing at that point is a FLAT ground surface under
   * 3 m. One helper, one rule, and the litter now settles where the dirt does.
   */
  for (let i = 0; i < count; i++) {
    const x = SPOT_MIN_X + 1 + r() * (SPOT_MAX_X - SPOT_MIN_X - 2);
    const z = -33 + r() * (SPOT_MAX_Z - 1 + 33);
    const settled = markFloorAt(x, z);
    if (!settled) continue;
    const y = settled.y;
    spin.setFromAxisAngle(up, r() * Math.PI * 2);
    q.copy(flat).multiply(spin);
    const size = 0.22 + r() * 0.3;
    m.compose(p.set(x, y + 0.016, z), q, s.set(size, size, size));
    at[Math.floor(r() * 3)].push(m.clone());
  }
  const geo = new THREE.PlaneGeometry(1, 1);
  for (let k = 0; k < 3; k++) {
    if (!at[k].length) continue;
    const inst = new THREE.InstancedMesh(geo, mats[k], at[k].length);
    for (let i = 0; i < at[k].length; i++) inst.setMatrixAt(i, at[k][i]);
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 2;
    g.add(inst);
  }
  return g;
}

/**
 * The generated spray, over the stand-in blobs.
 *
 * These take the `.ktx2` sibling on phones where one exists — two of the nine
 * pieces today (the throw-up and the hollow outline; the other seven 404, being
 * later generations than the backfill), so the wall comes down by 8 MB now and
 * by 36 MB when the rest land. The siblings carry a real alpha slice — verified
 * in the container's format descriptor: two samples, channels RGB and AAA — so
 * the cutout survives the swap rather than arriving as an opaque square. These
 * materials BLEND rather than alpha-test (`transparent: true` in `buildPaint`),
 * which is what makes that safe: ETC1S quantises the alpha ramp, and a
 * quantised ramp under blending is a slightly softer edge, where under a hard
 * `alphaTest` cut it would be a torn one. That is why the chain link above is
 * left out of this and these are not.
 */
export async function dressPaint(
  painted: Painted,
  tier: QualityTier,
  gltf?: GenexGltfLoader,
): Promise<void> {
  const loader = new THREE.TextureLoader();
  const compressed = ktx2Textures(tier, gltf);
  await Promise.all(
    GRAFFITI_URLS.map(async (url, i) => {
      // Nothing on this tier draws this piece, so nothing on this tier should
      // hold its image — see `Painted.drawn`. On a phone that is the whole
      // flyposter, 5.33 MB of texture for a mesh that was never built.
      if (!painted.drawn[i]) return;
      try {
        const tex = await loadTextureWithFallback(url, tier, (u) => loader.loadAsync(u), compressed);
        tex.colorSpace = THREE.SRGBColorSpace;
        // Clamped, not repeated — so the +1 v offset is doing real work here.
        matchLoaderOrientation(tex);
        const old = painted.materials[i].map;
        painted.materials[i].map = tex;
        painted.materials[i].needsUpdate = true;
        // The floor set shares the image, not the material — see `Painted`.
        painted.flat[i].map = tex;
        painted.flat[i].needsUpdate = true;
        old?.dispose();
      } catch (e) {
        console.warn(`[spot] graffiti ${i} failed`, e);
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// street furniture
// ---------------------------------------------------------------------------

/** Cheap stand-ins, in roughly the right silhouette and colour. */
function placeholderProp(kind: PropKind): THREE.Object3D {
  const grey = new THREE.MeshStandardMaterial({ color: 0x6d7278, roughness: 0.7, metalness: 0.25 });
  const root = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number): void => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    root.add(m);
  };
  switch (kind) {
    case "dumpster":
      add(new THREE.BoxGeometry(2.1, 1.2, 1.1), new THREE.MeshStandardMaterial({ color: 0x2f5f3a, roughness: 0.75 }), 0.6);
      add(new THREE.BoxGeometry(2.2, 0.12, 1.2), grey, 1.26);
      break;
    case "bench":
      add(new THREE.BoxGeometry(1.9, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x8a6438, roughness: 0.8 }), 0.44);
      add(new THREE.BoxGeometry(1.9, 0.5, 0.08), new THREE.MeshStandardMaterial({ color: 0x8a6438, roughness: 0.8 }), 0.72);
      add(new THREE.BoxGeometry(0.08, 0.44, 0.5), grey, 0.22);
      break;
    case "bin":
      add(new THREE.CylinderGeometry(0.32, 0.28, 0.9, 12), grey, 0.45);
      break;
    case "cone":
      add(new THREE.ConeGeometry(0.22, 0.55, 10), new THREE.MeshStandardMaterial({ color: 0xd8521f, roughness: 0.6 }), 0.28);
      add(new THREE.BoxGeometry(0.42, 0.04, 0.42), new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.8 }), 0.02);
      break;
    case "lamp":
      add(new THREE.CylinderGeometry(0.09, 0.13, 6, 8), grey, 3);
      add(new THREE.BoxGeometry(1.3, 0.12, 0.2), grey, 5.95);
      add(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffb347, emissiveIntensity: 0.8, roughness: 0.4 }), 5.84);
      break;
    case "hydrant":
      add(new THREE.CylinderGeometry(0.16, 0.19, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0xc2352c, roughness: 0.6 }), 0.3);
      add(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc2352c, roughness: 0.6 }), 0.62);
      break;
  }
  return root;
}

/**
 * Stop a subtree recomposing a matrix that never changes.
 *
 * `matrixAutoUpdate` was set NOWHERE in this project (zero occurrences before
 * this), so three's default `true` had every static node in the level running
 * `updateMatrix()` — a `Matrix4.compose` from position/quaternion/scale — plus a
 * `matrixWorld.multiplyMatrices`, sixty times a second, for a transform that was
 * written once at build and never again. The desktop profile put
 * `updateMatrixWorld` at 3.7% of the frame's real CPU work.
 *
 * Clearing the flag skips BOTH halves for the whole subtree, not just the
 * compose: with `matrixAutoUpdate` false, `updateMatrix` never runs, so
 * `matrixWorldNeedsUpdate` stays false, so the world multiply is skipped too and
 * `force` does not propagate to the children (three r185 `Object3D`
 * `updateMatrixWorld`). That is why this has to be applied to every node in a
 * subtree rather than to its root.
 *
 * ⚠ `updateMatrix()` FIRST, AND THE ORDER IS NOT COSMETIC. `Object3D`'s
 * constructor leaves `matrix` at identity with `matrixWorldNeedsUpdate` false,
 * and nothing in this file's builders ever calls `updateMatrix()` — they write
 * `position`/`rotation`/`scale` and let the render loop compose it on frame one.
 * Clear the flag without composing first and every band box, wall quad (which
 * also carries a non-unit `scale`), rail, wear quad and clutter root collapses to
 * the origin at unit scale. Composing here, once, and only then freezing, leaves
 * `matrixWorldNeedsUpdate` true so the first render still resolves every world
 * matrix exactly as before — and every frame after it does no work.
 *
 * `prune` skips a node AND its descendants, which `Object3D.traverse` cannot do.
 * It exists for one caller: the cloud dome, which is parented inside the spot's
 * own group and moves itself every frame.
 *
 * Returns how many nodes were frozen, so a caller can report it rather than
 * guess.
 */
export function freezeStatic(
  root: THREE.Object3D,
  prune?: (o: THREE.Object3D) => boolean,
): number {
  let frozen = 0;
  const walk = (o: THREE.Object3D): void => {
    if (prune?.(o)) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
    frozen += 1;
    for (const child of o.children) walk(child);
  };
  walk(root);
  return frozen;
}

/**
 * One InstancedMesh per sub-mesh of the source, so a prop costs one draw call
 * however many of it stand around. Works the same on a stand-in and on a
 * landed GLB — which is what lets the swap be a straight replacement.
 */
function instance(
  source: THREE.Object3D,
  at: readonly Placement[],
  scale: THREE.Vector3,
  tier: QualityTier,
): THREE.Group {
  // THE SINGLE BIGGEST THING A PHONE PAYS FOR IN THIS LEVEL, and it is paid
  // TWICE.
  //
  // Measured at the phone tier (landscape, settled spawn view): the visible
  // scene pass is 174 draws / 1,027,290 triangles, and SIX of those draws —
  // these instanced groups — carry **967,116 of them, 94.1%**. Per instance, at
  // the driver: dumpster 37,932 · bin 37,860 · hydrant 37,762 · cone 37,662 ·
  // bench 37,626. A 37,932-triangle dumpster is provider-raw geometry that was
  // never decimated for a phone; there is no `@1024` rung for these to fall
  // back to (probed — 404), so the triangles are simply what they are.
  //
  // `castShadow` then rasterises every one of those batches a SECOND time into
  // the shadow map. That is why the phone's shadow pass measured 173 draws /
  // 1,039,440 triangles — MORE draw calls than the picture itself, and the same
  // geometry over again. Shrinking the shadow box (`field.ts`'s
  // `SHADOW_REACH_BY_TIER`) took ~46 draws off it and barely touched the
  // triangles, because three culls an InstancedMesh as ONE object against its
  // whole instance spread — which is the block. **No shadow box can ever cull
  // these.** Dropping them out of the caster set is the only lever that reaches
  // the triangle axis, and it is worth about half of everything the phone draws.
  //
  // WHAT IT COSTS, stated because it is a real visual change and the player is
  // the one who decides: on phones the dumpsters, benches, bins, cones, lamps
  // and hydrants stop casting shadows. They still RECEIVE them, and the
  // architecture — walls, ledges, stairs, the ramps, the rails — still casts, so
  // the long raking stripes across the plaza that tell you the time of day are
  // untouched. What goes is the small contact shadow under each prop, and
  // objects without one read as slightly floaty. That is the trade: a floaty
  // dumpster against half the frame's geometry, on the device class that is
  // measurably geometry-bound. Desktop keeps every caster — this is a name test
  // against the two phone rows, so the three desktop rows never reach the line.
  const casts = !isPhoneTier(tier);
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  source.updateMatrixWorld(true);
  source.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, at.length);
    inst.castShadow = casts;
    inst.receiveShadow = true;
    for (let i = 0; i < at.length; i++) {
      const place = at[i];
      // The ground comes with the placement now. Asking the surface would ask
      // the prop's OWN collider — spot.ts stands each one on the architecture
      // before the colliders exist, which is the only order that terminates.
      q.setFromAxisAngle(axis, place.yaw);
      m.compose(p.set(place.x, place.y, place.z), q, scale);
      m.multiply(mesh.matrixWorld);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  });
  // Frozen HERE rather than by the caller, because this is the one path both the
  // stand-ins and the landed GLBs come through — `dressFurniture` replaces the
  // six `prop-<kind>` groups asynchronously after the first frames, and a freeze
  // applied to the level once at build would miss the replacements entirely.
  // Unconditionally safe: every node this function makes sits at IDENTITY (the
  // placement is baked into `instanceMatrix`, not into the node), so composing it
  // is a no-op and there is nothing here for a later frame to move.
  freezeStatic(group);
  return group;
}

/**
 * How many of each kind this device gets.
 *
 * Scenery scales with the tier; MATTER never does. Now that a dumpster is a
 * solid, culling one on a phone would leave an invisible box in the plaza —
 * whatever else a quality tier is allowed to change, it is not allowed to
 * change where the walls are. Cones are the only prop that is pure dressing,
 * and they are the only prop this thins out.
 */
function budgetFor(kind: PropKind, tier: QualityTier): number {
  const all = PLACEMENTS[kind].length;
  if (kind !== "cone") return all;
  return Math.max(1, Math.round(all * tier.particleScale));
}

/**
 * The procedural clutter, built where `spot.ts` says it stands.
 *
 * This is the other half of the placement contract — spot.ts owns WHERE and
 * what it collides with, this owns the mesh — and it is deliberately the whole
 * of the code needed on this side, because everything that could have gone
 * wrong here is already settled in the library: a prop is pure in its seed, it
 * rests on y = 0 facing +Z, and every static part of it is merged into one mesh
 * per material before it comes back.
 *
 * It is a group of groups rather than instanced, and that is the right call for
 * once: no two entries in the list share both an id AND a seed, so there is
 * nothing to instance — the variation IS the point. Fifty-odd props at two to
 * five draw calls each is what the library's own budget note costs, and it buys
 * the thing a plaza with graffiti on every shutter still did not have.
 *
 * Phones lose the far half of the list. Not by importance — by DISTANCE from
 * the main line, which is the same rule the wear layers already thin on: the
 * clutter you ride past on the footway is the clutter that reads.
 */
function buildClutter(tier: QualityTier): THREE.Group {
  const group = new THREE.Group();
  group.name = "spot-clutter";
  // Its own bank rather than the shared one: `mount()` in maps.ts disposes
  // every material it finds under the nodes a map added, so a map that reached
  // for the module-level singleton would take the library's materials down with
  // it and the next mount would draw with disposed textures.
  const mats = createPropMaterials();
  // 0.55 was already a phone-only number — `desktop-low`'s particleScale is 0.75,
  // so the three desktop rows all take the `1` branch and never reach it. 0.30 is
  // the same lever pulled harder, and it is pulled because of WHERE this clutter
  // sits in the phone's frame rather than because of what it weighs.
  //
  // Measured at the phone tier: the whole frame is ~330 draw calls, and this
  // clutter is 30 props at 2–5 draws apiece — call it 90 — which it then pays
  // for a SECOND time as shadow casters. That is over half the phone's draw
  // calls for 60,174 triangles, i.e. 6% of the geometry. **The phone is
  // draw-call bound, not fill bound** (quartering the framebuffer moved the
  // frame by 0.01 ms), so this is the cheapest lever on the axis that hurts:
  // 30 props → 17, and the sort below means the 13 that go are the ones furthest
  // from the plaza's spine — wall clutter a chase camera never gets within 20 m
  // of. The kerb line, which you ride past, is untouched.
  const keep = tier.particleScale >= 0.6 ? 1 : 0.3;
  const cut = Math.round(STREET_PLACEMENTS.length * keep);
  // Sorted by how far the prop is from the plaza's spine (x = 0), so the cut
  // takes the wall clutter and leaves the kerb line — the far ones are the ones
  // a phone camera never gets within 20 m of.
  const order = STREET_PLACEMENTS.map((_, i) => i).sort(
    (a, b) => Math.abs(STREET_PLACEMENTS[a].x) - Math.abs(STREET_PLACEMENTS[b].x),
  );
  for (const i of order.slice(0, cut)) {
    const p = STREET_PLACEMENTS[i];
    const root = buildStreetProp(p.id, p.seed, mats);
    root.position.set(p.x, p.y, p.z);
    root.rotation.y = p.yaw;
    group.add(root);
  }
  // …and on a phone none of it casts, which is the other half of the same
  // arithmetic and the bigger half.
  //
  // Every one of these props is rasterised TWICE a frame — once for the picture,
  // once into the shadow map — and the shadow half is the one the player cannot
  // point at. Set here, in one traverse after the group is built, rather than
  // inside `buildStreetProp`'s dozen shapes: one writer, one place to read, and
  // no way for a new prop shape to quietly start casting again. Desktop is a
  // name test away and takes zero writes.
  //
  // What survives on a phone, deliberately: the ARCHITECTURE still casts — walls,
  // ledges, stairs, the ramps, the rails — and so does the skater. So you keep
  // your own shadow under the board, which is the one you actually read while
  // riding, and you keep the long raking sunset stripes across the plaza that
  // tell you what time of day it is. That is the whole golden-hour look, and it
  // costs about thirty draw calls. What goes is the small contact shadow under a
  // bollard or a crate. **This is why shadows do not need to be switched off on
  // phones**: turning them off entirely would buy those last thirty draws and
  // cost the skater his own shadow, which is a bad trade in both directions.
  if (isPhoneTier(tier)) group.traverse((o) => (o.castShadow = false));
  return group;
}

export interface Furniture {
  group: THREE.Group;
  /** Which kinds are still showing a stand-in — the dress pass replaces these. */
  placeholders: Set<PropKind>;
}

export function buildFurniture(tier: QualityTier): Furniture {
  const group = new THREE.Group();
  group.name = "spot-props";
  const placeholders = new Set<PropKind>();
  const one = new THREE.Vector3(1, 1, 1);
  for (const kind of Object.keys(PLACEMENTS) as PropKind[]) {
    const at = PLACEMENTS[kind].slice(0, budgetFor(kind, tier));
    const sub = instance(placeholderProp(kind), at, one, tier);
    sub.name = `prop-${kind}`;
    group.add(sub);
    placeholders.add(kind);
  }
  // …and the procedural street, which needs no dress pass at all: it is built
  // in code, so it is right on the first frame and never streams.
  group.add(buildClutter(tier));
  return { group, placeholders };
}

/**
 * What a prop is allowed to cost in VRAM, and it is not what the device tier
 * says.
 *
 * Measured, at the tier's own rungs: the six street props were 96 MB of a
 * phone's 181 MB and 384 MB of a desktop's 597 — three 1024²/2048² maps each
 * (basecolor, packed ORM, normal) on objects between 0.6 and 2.1 m across, seen
 * from a moving skateboard. So they load the PHONE rung everywhere and hand
 * back the packed ORM on every device: a traffic cone's ambient occlusion map
 * is 5 MB of a budget the sky and the skater need. Desktop tiers keep the
 * normal, which is the one of the three you can see at this size.
 */
const PROP_RUNG: QualityTier = TIERS.phone;

/** Strip the maps a 1 m prop cannot show, and free them. Returns nothing kept. */
function trimPropMaps(src: THREE.Object3D, keepNormal: boolean): void {
  const dropped = new Set<THREE.Texture>();
  src.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!mat || !mat.isMeshStandardMaterial) return;
    for (const slot of ["aoMap", "roughnessMap", "metalnessMap"] as const) {
      const tex = mat[slot];
      if (tex) dropped.add(tex);
      mat[slot] = null;
    }
    // The ORM's green and blue channels are gone, so the constants have to
    // stand in for them — left at 1.0 a stripped material renders mirror-black.
    mat.roughness = 0.78;
    mat.metalness = 0.15;
    if (!keepNormal && mat.normalMap) {
      dropped.add(mat.normalMap);
      mat.normalMap = null;
    }
    mat.needsUpdate = true;
  });
  for (const tex of dropped) tex.dispose();
}

/** The generated props, dropped in over the stand-ins one kind at a time. */
export async function dressFurniture(
  furniture: Furniture,
  tier: QualityTier,
  gltf: GenexGltfLoader,
): Promise<void> {
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const phone = tier.name === "phone" || tier.name === "phone-low";
  await Promise.all(
    (Object.keys(PROP_URLS) as PropKind[]).map(async (kind) => {
      const url = PROP_URLS[kind];
      if (!url) return;
      try {
        const loaded = await loadModelWithFallback(url, PROP_RUNG, (u) => gltf.loader.loadAsync(u), {
          ktx2: gltf.ktx2,
        });
        const src = loaded.scene;
        trimPropMaps(src, !phone);
        // A generated GLB arrives at whatever size the generator felt like, so
        // it is scaled to a real-world height and stood on its own base — the
        // alternative is a fire hydrant the size of the quarter pipe.
        box.setFromObject(src);
        box.getSize(size);
        const byHeight = PROP_HEIGHT[kind] / Math.max(0.001, size.y);
        // …and a reach clamp for anything whose arm would outgrow it. See
        // PROP_REACH: derived from the mesh's own width, not typed in.
        const reach = PROP_REACH[kind];
        const acrossX = reach ? Math.min(byHeight, reach / Math.max(0.001, size.x)) : byHeight;
        scale.set(acrossX, byHeight, byHeight);
        src.position.y -= box.min.y;
        const at = PLACEMENTS[kind].slice(0, budgetFor(kind, tier));
        const fresh = instance(src, at, scale, tier);
        fresh.name = `prop-${kind}`;
        const old = furniture.group.getObjectByName(`prop-${kind}`);
        if (old) furniture.group.remove(old);
        furniture.group.add(fresh);
        furniture.placeholders.delete(kind);
      } catch (e) {
        console.warn(`[spot] prop ${kind} failed — keeping the stand-in`, e);
      }
    }),
  );
}
