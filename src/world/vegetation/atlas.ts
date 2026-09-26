// What a tree is MADE of — three textures and three materials for the whole
// forest, however many species stand in it.
//
// The thing this file exists to prevent is the defect the player named: a
// hillside of flat dark-green cones. A cone is not wrong because it is
// low-poly; it is wrong because it has no EDGE. Real conifer mass is read off
// its outline — needle sprays that stop in a ragged line, holes you see sky
// through, a tip that thins out rather than meeting a point. None of that is
// geometry you can afford three hundred times over, and all of it fits in an
// alpha channel. So the geometry is a skeleton and the mass is an alpha-tested
// spray card, which is the standard answer and is standard because it works.
//
// TWO decisions carry the budget here, both borrowed from `procedural/mats.ts`
// and for the same reasons stated there:
//
// **Colour is per-instance, not per-material.** Every needle spray in the game
// samples ONE 512² atlas painted in a pale desaturated green; the species tone
// and the tree-to-tree variation ride on `InstancedMesh.instanceColor` and
// MULTIPLY it. Five species and two hundred trees therefore cost one texture
// and one material, and a hillside is not one green.
//
// **Bark is its own material, not a fourth atlas cell.** An atlas cell cannot
// tile, and a trunk is the one part of a tree whose texture has to repeat up
// its own length. Sharing the sheet would also mean the trunk's mip chain bleeds
// into transparent needle cells at distance and puts holes in the trunk. One
// extra draw call per tree mesh buys both problems away.
//
// Nothing here is a generated asset — it is procedural canvas, the same
// technique the street's own materials use.

import * as THREE from "three";
import { rand, type Rand } from "../procedural/rng";

/** Which cell of the foliage atlas a species draws its mass from. */
export type SprayCell = "needleA" | "needleB" | "leaf" | "leafB";

const ATLAS = 512;
const CELL = 256;

/** Grid position of each cell in the 2×2 sheet, in canvas coordinates. */
const CELL_AT: Record<SprayCell, [number, number]> = {
  needleA: [0, 0],
  needleB: [1, 0],
  leaf: [0, 1],
  leafB: [1, 1],
};

/**
 * Anisotropy, for the same reason `mats.ts` states it: a spray card seen from
 * a chase camera is a long thin thing at a grazing angle, and isotropic
 * mipmapping averages it toward its own mean colour — which for an alpha-tested
 * card means the alpha averages too, and the canopy turns to grey haze at
 * exactly the distance most of the forest is standing at.
 */
const ANISOTROPY = 8;

/**
 * The UV rectangle of a cell, inset by a texel and a half.
 *
 * The inset is not fussiness. Bilinear filtering at mip 0 already reaches half
 * a texel past the edge, and the mip chain reaches further every level; without
 * the inset the top of a needle spray samples the bottom of the cell above it
 * and the canopy grows a hairline of somebody else's foliage. Canvas y runs
 * down and texture v runs up, so the flip happens here and nowhere else.
 */
export function cellUv(cell: SprayCell): { u0: number; v0: number; u1: number; v1: number } {
  const [gx, gy] = CELL_AT[cell];
  const pad = 1.5 / ATLAS;
  const u0 = (gx * CELL) / ATLAS + pad;
  const u1 = ((gx + 1) * CELL) / ATLAS - pad;
  // v0 is the BASE of the spray (the end that meets the branch) and therefore
  // the bottom of the cell in texture space, which is its high y in canvas.
  const v0 = 1 - ((gy + 1) * CELL) / ATLAS + pad;
  const v1 = 1 - (gy * CELL) / ATLAS - pad;
  return { u0, v0, u1, v1 };
}

// ---------------------------------------------------------------------------
// the painters
// ---------------------------------------------------------------------------

function canvas2d(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("[vegetation] no 2d context");
  return { c, g };
}

/**
 * The needle greens, and they are LIGHT on purpose.
 *
 * This sheet is multiplied by an instance colour that is a real conifer green
 * (around 0x55703c). Paint the needles at that green as well and the product is
 * 0x1d2a12 — black moss, which is exactly the "flat dark-green" the player
 * objected to, arrived at from the other direction. Painted pale, the same
 * multiply lands on a readable green and still carries the light-to-dark
 * variation ACROSS one spray, which is the part a single flat tint cannot have.
 */
const NEEDLE_TONE = ["#c9d6a4", "#b6c691", "#a3b681", "#d6e0b7", "#93a774"];
const LEAF_TONE = ["#c6d3a2", "#b1c48d", "#dbe3bd", "#9db184", "#cddaa9"];
const STEM_TONE = "#7d7457";

type Pt = { x: number; y: number };

/**
 * One conifer branchlet: a solid core with two combs of needles down it.
 *
 * Drawn in a local frame with its base at the origin growing toward −y (up, in
 * canvas terms) — the caller translates and rotates. `size` is the length it
 * fills, and every mark inside scales off it, so the same routine paints a
 * 240 px atlas cell and a 9 px mark on a distant-tree imposter.
 *
 * THE CORE IS NOT DECORATION, it is the fix for a defect the first version of
 * this file shipped and the review page caught: needles drawn as bare one-pixel
 * strokes make a card that is ninety per cent holes, and an alpha channel that
 * is ninety per cent holes DISSOLVES down its own mip chain. On the hillside
 * that read as black stipple crawling over every tree past forty metres —
 * exactly the crunchy PS1 noise the art direction rules out. So the spray is
 * painted twice: a fat opaque pass at sixty per cent of each shoot's length,
 * which is a mass that survives minification, and the fine needles over it,
 * which are what gives the OUTLINE its raggedness. Solid in the middle, torn at
 * the edge — which is also what a branchlet looks like.
 */
function drawNeedleSpray(g: CanvasRenderingContext2D, size: number, r: Rand, tone: string[]): void {
  const len = size * r.range(0.88, 1.0);
  const bend = r.range(-0.18, 0.18) * size;
  const cx = bend * 0.35;
  const cy = -len * 0.55;
  // The stem, as a quadratic from (0,0) through (cx,cy) to (bend,-len).
  const at = (t: number): Pt => ({
    x: 2 * (1 - t) * t * cx + t * t * bend,
    y: 2 * (1 - t) * t * cy + t * t * -len,
  });
  const tangent = (t: number): number => {
    const dx = 2 * (1 - t) * cx + 2 * t * (bend - cx);
    const dy = 2 * (1 - t) * cy + 2 * t * (-len - cy);
    return Math.atan2(dy, dx);
  };

  g.lineCap = "round";
  g.lineJoin = "round";

  // Where the shoots are. Sampled ONCE and reused by both passes, so the mass
  // and the needles are the same branchlet drawn twice rather than two
  // branchlets on top of each other.
  const rows = 10 + r.int(0, 4);
  const shoots: { p: Pt; angle: number; len: number }[] = [];
  for (let i = 0; i < rows; i++) {
    const t = Math.min(0.985, 0.05 + ((i + r.range(-0.28, 0.28)) / rows) * 0.95);
    const p = at(t);
    const axis = tangent(t);
    const shootLen = len * (0.46 * Math.pow(1 - t, 0.5) + 0.06);
    for (const side of [-1, 1] as const) {
      if (r.chance(0.1)) continue; // a gap is a hole in the canopy — keep some
      const open = (0.72 - 0.26 * t) * side + r.range(-0.14, 0.14);
      shoots.push({ p, angle: axis + open, len: shootLen });
    }
  }

  // Pass 1 — the mass.
  g.strokeStyle = tone[2];
  for (const s of shoots) {
    g.lineWidth = Math.max(1.2, s.len * 0.34);
    g.beginPath();
    g.moveTo(s.p.x, s.p.y);
    g.lineTo(s.p.x + Math.cos(s.angle) * s.len * 0.58, s.p.y + Math.sin(s.angle) * s.len * 0.58);
    g.stroke();
  }

  // The stem, over the mass and under the needles.
  g.strokeStyle = STEM_TONE;
  const K = 12;
  for (let i = 0; i < K; i++) {
    const a = at(i / K);
    const b = at((i + 1) / K);
    g.lineWidth = Math.max(0.9, size * 0.022 * (1 - i / K) + size * 0.007);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }

  // Pass 2 — the needles, which own the outline.
  for (const s of shoots) drawComb(g, s.p, s.angle, s.len, size, r, tone);

  // The leader — a tip past the last row, so the spray ends in a point rather
  // than in a cut edge.
  const tip = at(1);
  g.strokeStyle = tone[0];
  g.lineWidth = Math.max(0.9, size * 0.014);
  g.beginPath();
  g.moveTo(tip.x, tip.y);
  g.lineTo(tip.x + Math.cos(tangent(1)) * len * 0.07, tip.y + Math.sin(tangent(1)) * len * 0.07);
  g.stroke();
}

/** A shoot off the stem: a line of paired needles, thinning to the tip. */
function drawComb(
  g: CanvasRenderingContext2D,
  from: Pt,
  angle: number,
  length: number,
  size: number,
  r: Rand,
  tone: string[],
): void {
  const n = Math.max(3, Math.round(length / (size * 0.03)));
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  // A floor on the width, because this routine is also what paints a 40 px
  // distant-tree card: a stroke computed as a fraction of `size` goes to a
  // third of a pixel there, and a third of a pixel is nothing at all.
  g.lineWidth = Math.max(0.9, size * 0.016);
  for (let j = 0; j <= n; j++) {
    const f = j / n;
    const bx = from.x + ca * length * f;
    const by = from.y + sa * length * f;
    const nl = length * 0.36 * (1 - 0.45 * f) * r.range(0.72, 1.18);
    for (const s of [-1, 1] as const) {
      // Jittered, because a comb with a constant needle angle is a herringbone
      // and reads as barbed wire on the tree.
      const na = angle + s * (1.05 - 0.3 * f) + r.range(-0.22, 0.22);
      g.strokeStyle = tone[r.int(0, tone.length - 1)];
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + Math.cos(na) * nl, by + Math.sin(na) * nl);
      g.stroke();
    }
  }
}

/**
 * A broadleaf cluster: forty-odd blades round a short stem, overlapping enough
 * to read as mass and gappy enough to read as leaves.
 */
function drawLeafSpray(g: CanvasRenderingContext2D, size: number, r: Rand, tone: string[]): void {
  const len = size * r.range(0.8, 0.94);
  g.strokeStyle = STEM_TONE;
  g.lineCap = "round";
  g.lineWidth = size * 0.016;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(size * 0.04, -len * 0.5, r.range(-0.1, 0.1) * size, -len * 0.86);
  g.stroke();

  const n = 34 + r.int(0, 16);
  for (let i = 0; i < n; i++) {
    // Cluster along the stem, widest at two thirds up — a leaf cluster is an
    // egg, not a disc, and a disc of leaves is the lollipop this avoids.
    const t = Math.pow(r.unit(), 0.7);
    const spread = Math.sin(Math.PI * Math.min(1, t * 1.15)) * size * 0.42;
    const px = r.range(-1, 1) * spread;
    const py = -len * t + r.range(-1, 1) * size * 0.07;
    const w = size * r.range(0.07, 0.15);
    const h = w * r.range(1.5, 2.4);
    const a = Math.atan2(py, px) + Math.PI / 2 + r.range(-0.6, 0.6);
    g.save();
    g.translate(px, py);
    g.rotate(a);
    g.fillStyle = tone[r.int(0, tone.length - 1)];
    g.beginPath();
    g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    g.fill();
    // A midrib, so a blade is a blade and not a green pill.
    g.strokeStyle = "rgba(110,124,86,0.5)";
    g.lineWidth = Math.max(0.6, size * 0.004);
    g.beginPath();
    g.moveTo(0, -h);
    g.lineTo(0, h);
    g.stroke();
    g.restore();
  }
}

// ---------------------------------------------------------------------------
// the sheets
// ---------------------------------------------------------------------------

let atlasTexture: THREE.CanvasTexture | null = null;

/**
 * The one foliage sheet: two needle sprays, two leaf clusters.
 *
 * Two of each, not one, and the second is not a nicety. A branch picks its cell
 * per spray, so a canopy built from one card is the SAME card two hundred times
 * at two hundred rotations, and the eye finds that pattern immediately at the
 * distance a hillside is seen from. Two cards and a horizontal flip is four
 * looks, which is enough.
 */
export function foliageAtlas(): THREE.CanvasTexture {
  if (atlasTexture) return atlasTexture;
  const { c, g } = canvas2d(ATLAS, ATLAS);
  const paint = (cell: SprayCell, seed: number, kind: "needle" | "leaf"): void => {
    const [gx, gy] = CELL_AT[cell];
    const r = rand(seed);
    g.save();
    // Base of the spray at the bottom-centre of its cell, growing up.
    g.translate(gx * CELL + CELL / 2, gy * CELL + CELL * 0.985);
    if (kind === "needle") drawNeedleSpray(g, CELL * 0.94, r, NEEDLE_TONE);
    else drawLeafSpray(g, CELL * 0.94, r, LEAF_TONE);
    g.restore();
  };
  paint("needleA", 2207, "needle");
  paint("needleB", 3313, "needle");
  paint("leaf", 4409, "leaf");
  paint("leafB", 5501, "leaf");

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISOTROPY;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  atlasTexture = t;
  return t;
}

let barkTexture: THREE.CanvasTexture | null = null;

/**
 * Bark: 128² and seamless both ways, because a trunk wraps it round and repeats
 * it up. Painted near the value real bark sits at rather than pale — unlike the
 * foliage, the instance colour on a trunk is a small brown-to-grey nudge, not a
 * species repaint, so this map carries the material.
 */
export function barkMap(): THREE.CanvasTexture {
  if (barkTexture) return barkTexture;
  const S = 128;
  const { c, g } = canvas2d(S, S);
  const r = rand(1607);
  g.fillStyle = "#6a5b4a";
  g.fillRect(0, 0, S, S);
  // Vertical fissures. Drawn three times across the seam so a crack that leaves
  // the right edge arrives at the left one — the same wrap trick `mats.ts`
  // spells out, and without it a trunk shows its own UV seam as a stripe.
  for (let i = 0; i < 46; i++) {
    const x = r.unit() * S;
    const w = r.range(1, 5);
    const dark = r.chance(0.6);
    g.strokeStyle = dark
      ? `rgba(${44 + r.unit() * 22},${36 + r.unit() * 18},${28 + r.unit() * 14},0.55)`
      : `rgba(${150 + r.unit() * 50},${132 + r.unit() * 40},${110 + r.unit() * 34},0.4)`;
    g.lineWidth = w;
    for (const dx of [-S, 0, S]) {
      g.beginPath();
      let y = -6;
      let px = x + dx;
      g.moveTo(px, y);
      while (y < S + 6) {
        y += 8 + r.unit() * 10;
        px += r.range(-2.2, 2.2);
        g.lineTo(px, y);
      }
      g.stroke();
    }
  }
  // Grain flecks, wrapped the same way.
  for (let i = 0; i < 320; i++) {
    const x = r.unit() * S;
    const y = r.unit() * S;
    g.fillStyle = `rgba(${90 + r.unit() * 70},${76 + r.unit() * 56},${58 + r.unit() * 44},0.35)`;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) g.fillRect(x + dx, y + dy, 1 + r.unit() * 2, 2 + r.unit() * 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISOTROPY;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  barkTexture = t;
  return t;
}

/** One projected spray, in cell coordinates: x/y in [0,1], y up. */
export interface ImposterMark {
  x: number;
  y: number;
  /** Fraction of the cell the mark spans. */
  size: number;
  /** Screen angle in radians; 0 points up. */
  angle: number;
}

/**
 * The far-distance card, painted from the SAME sprays the real tree is built
 * from — see `imposterMarks()` in mesh.ts, which projects an actual skeleton.
 *
 * That is the whole reason this takes marks rather than a species name. An
 * imposter painted freehand is a second artist's opinion of the tree, and the
 * LOD swap then reads as a species change at ninety metres. Painted from the
 * skeleton's own sprays it is the same tree with the geometry taken out.
 */
export function imposterTexture(
  size: number,
  marks: ImposterMark[],
  trunk: { width: number; top: number } | null,
  kind: "needle" | "leaf",
  seed: number,
): THREE.CanvasTexture {
  const { c, g } = canvas2d(size, size);
  const r = rand(seed);
  if (trunk) {
    g.fillStyle = "#5d5142";
    const w = trunk.width * size;
    g.beginPath();
    g.moveTo(size / 2 - w / 2, size);
    g.lineTo(size / 2 + w / 2, size);
    g.lineTo(size / 2 + w * 0.16, size * (1 - trunk.top));
    g.lineTo(size / 2 - w * 0.16, size * (1 - trunk.top));
    g.closePath();
    g.fill();
  }
  // Back to front by height, so the lower sprays overlap the ones above them
  // the way they do on the tree.
  const order = [...marks].sort((a, b) => a.y - b.y);
  for (const m of order) {
    g.save();
    g.translate(m.x * size, (1 - m.y) * size);
    // Canvas 0 rad points +x and the painters grow toward −y, so a mark whose
    // world direction is "up" needs no rotation at all; the sign carries the
    // droop the branches actually have.
    g.rotate(m.angle);
    if (kind === "needle") drawNeedleSpray(g, m.size * size, r, NEEDLE_TONE);
    else drawLeafSpray(g, m.size * size, r, LEAF_TONE);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISOTROPY;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// the materials
// ---------------------------------------------------------------------------

/**
 * Wind, as ONE vertex patch shared by the bark, the foliage and both of their
 * shadow-depth materials.
 *
 * Adapted from ez-tree's leaf shader (MIT, Copyright (c) 2024 Daniel Greenheck)
 * — see `NOTICE.md`. What is kept is the shape of the answer: sway is a sum of
 * three sines at spread frequencies, weighted per-vertex so the trunk barely
 * moves and a spray tip moves fully. What is changed is where the phase comes
 * from: ez-tree evaluates 3D simplex noise per vertex to decouple neighbouring
 * trees, which is thirty-odd ALU per vertex on geometry that is INSTANCED here
 * — every instance already carries its own world position in
 * `instanceMatrix[3]`, and a dot product against it is one instruction and just
 * as decorrelated.
 */
export interface WindUniforms {
  time: { value: number };
  /** Peak displacement in metres, world axes. */
  wind: { value: THREE.Vector3 };
}

export function patchWind(mat: THREE.Material, u: WindUniforms, key: string): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.time;
    shader.uniforms.uWind = u.wind;
    shader.vertexShader =
      "attribute float aSway;\nuniform float uTime;\nuniform vec3 uWind;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float swayPhase = dot(instanceMatrix[3].xyz, vec3(0.113, 0.071, 0.137));
      #else
        float swayPhase = 0.0;
      #endif
      transformed += uWind * aSway * (
        0.55 * sin(uTime * 1.10 + swayPhase) +
        0.30 * sin(uTime * 2.30 + swayPhase * 1.7) +
        0.15 * sin(uTime * 4.70 + swayPhase * 2.9));`,
    );
  };
  // Without this every material sharing the patch would collide in three's
  // program cache with the unpatched build of the same shader.
  mat.customProgramCacheKey = () => key;
}

export interface VegetationMaterials {
  bark: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  /** Alpha-correct shadows for the foliage — see below. */
  foliageDepth: THREE.MeshDepthMaterial;
  wind: WindUniforms;
  dispose(): void;
}

let shared: VegetationMaterials | null = null;

/**
 * The three materials, built once and shared by every forest in the game.
 *
 * `foliageDepth` is the piece it is easy to leave out and impossible to miss
 * once it is wrong: a shadow map is rendered with a depth material, and three's
 * default one knows nothing about the alpha channel — so an alpha-tested spray
 * card casts the shadow of its RECTANGLE. A hillside of trees then throws a
 * hillside of dark quadrilaterals across the concrete, which reads exactly as
 * the cardboard this library exists to avoid. Giving the foliage mesh its own
 * `customDepthMaterial` with the same map and the same alphaTest is the fix,
 * and it is why bark and foliage are separate MESHES rather than two groups of
 * one geometry: `customDepthMaterial` is per object, and one shared between an
 * opaque trunk and an alpha canopy would test the trunk's UVs against the
 * foliage sheet and cut holes in it.
 */
export function vegetationMaterials(): VegetationMaterials {
  if (shared) return shared;
  const atlas = foliageAtlas();
  const wind: WindUniforms = { time: { value: 0 }, wind: { value: new THREE.Vector3(0.06, 0, 0.04) } };

  const bark = new THREE.MeshStandardMaterial({
    name: "veg-bark",
    map: barkMap(),
    roughness: 0.94,
    metalness: 0,
  });

  const foliage = new THREE.MeshStandardMaterial({
    name: "veg-foliage",
    map: atlas,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.86,
    metalness: 0,
    // Dithering, because a canopy is a very large area of two or three close
    // greens and 8-bit banding across it is visible on a phone panel.
    dithering: true,
    // Alpha-to-coverage: on the desktop tiers the look stack runs its composer
    // target at 4x MSAA (`tier.composerSamples`), and this hands the alpha test
    // those four samples instead of one — foliage edges stop being a binary
    // keep/discard and get four steps of coverage. Where there is no
    // multisampled buffer (every phone tier) the GL enable is a no-op, so it
    // costs nothing to leave on.
    alphaToCoverage: true,
  });

  // The rounded-normal trick, and the patch that lets it survive on a back
  // face. Both adapted from ez-tree (MIT, Daniel Greenheck) — see NOTICE.md.
  // `mesh.ts` writes a spray's normals as the average of the card's own normal
  // and the direction out to each corner, so a flat quad shades like a piece of
  // a sphere; three then flips the normal on back faces, which for a
  // double-sided card undoes exactly that and makes the far side of every spray
  // go black. Skipping the flip is what keeps a canopy from strobing dark as
  // the chase camera swings round it.
  const keepNormals = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""),
    );
  };
  patchWind(foliage, wind, "veg-foliage");
  const windOnly = foliage.onBeforeCompile;
  foliage.onBeforeCompile = (shader, renderer) => {
    windOnly.call(foliage, shader, renderer);
    keepNormals(shader);
  };
  patchWind(bark, wind, "veg-bark");

  const foliageDepth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: atlas,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
  });
  patchWind(foliageDepth, wind, "veg-foliage-depth");

  shared = {
    bark,
    foliage,
    foliageDepth,
    wind,
    dispose(): void {
      bark.dispose();
      foliage.dispose();
      foliageDepth.dispose();
      atlas.dispose();
      barkMap().dispose();
      atlasTexture = null;
      barkTexture = null;
      shared = null;
    },
  };
  return shared;
}
