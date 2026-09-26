// What the street clutter is MADE of — eleven materials for the whole library.
//
// The register is the one `props.ts` → `dressMaterials()` sets and the gauntlet
// enforces: PS2-era, which means solid, readable, REAL specular and real
// lighting, never flat-shaded and never untextured. A bollard drawn as an
// untextured grey cylinder is PS1 and fails on sight; a bollard drawn with a
// 5 MB photo of steel on it is a budget this game does not have for a 1 m post.
// So every material here is one small procedural canvas — the same technique
// the spot's own stand-ins use — at the roughness and metalness that make the
// low sun land on it.
//
// TWO decisions carry the whole budget, and they are worth stating.
//
// **Colour is VERTEX colour, not a material.** A city paints its bollards
// black, its meters grey, its mailboxes blue and its news boxes every colour
// there is. Twenty factories × a colour each would be sixty materials and sixty
// draw calls. Instead the map carries only the WEAR — scuffs, chips, grain,
// grime, all of it near-white so it multiplies rather than muddies — and the
// paint colour rides on the vertex attribute. One `enamel` material, every
// colour on the street, and a whole prop merges into one draw call.
//
// **Everything printed shares one atlas.** Sign faces, posters, mastheads, a
// parking-meter dial, a slotted vent, the chevrons on a barricade: sixteen
// cells of one 512² canvas, one material. That is exactly how a PS2 game did
// its signage, and it is why a sign here costs two triangles and no new state.
//
// Nothing in this file is a generated asset — it is procedural canvas, which is
// what the ticket asks for. The generated textures live in `props.ts`.

import * as THREE from "three";
import { isPhoneTier, type QualityTier } from "../../controllers/quality/tier";
import { rand } from "./rng";

// ---------------------------------------------------------------------------
// canvas plumbing
// ---------------------------------------------------------------------------

function canvas(size: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) throw new Error("[procedural] no 2d context");
  return { c, g };
}

/**
 * A tiling wear map. `base` is deliberately bright — see the header: this
 * texture MULTIPLIES the paint colour, so anything below ~0.75 luminance turns
 * every prop in the library to mud, which is the failure the art direction
 * names by name.
 */
function wear(size: number, base: string, draw: (g: CanvasRenderingContext2D, r: ReturnType<typeof rand>) => void, seed: number): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  draw(g, rand(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/**
 * Anisotropic filtering, on every map in this file, and it is not a nicety.
 *
 * Street furniture is made of LONG THIN faces seen at grazing angles — a 2 m
 * barricade rail 0.2 m tall, a bollard shaft, a hoarding. Those minify far
 * harder across the short axis than along the long one, so isotropic mipmapping
 * picks a level for the worst axis and averages the whole texture toward its
 * mean colour. Measured on the barricade: orange chevrons on a white board came
 * out a flat pinkish mauve at 6 m and the object read as a park BENCH — the
 * stripes were in the atlas, on the mesh, with correct UVs, and still not on
 * screen. `props.ts` sets the same 8 on its generated surfaces for the same
 * reason. three clamps this to whatever the device supports.
 */
const ANISOTROPY = 8;
/**
 * …AND WHAT A PHONE PAYS FOR IT, WHICH UNTIL NOW WAS THE SAME EIGHT.
 *
 * Anisotropic filtering is not one fetch that got cleverer: at a grazing angle
 * the sampler takes up to `anisotropy` taps along the axis of compression, and
 * a street full of long thin faces seen from a chase camera is the case that
 * asks for all eight of them. On a desktop that is free. On a phone it is a
 * multiplier on every texture fetch in the frame, sitting on the tier that is
 * already the one running out of everything.
 *
 * The cut is graded rather than switched off, and the reason is written three
 * paragraphs up: 1 is isotropic, and isotropic is what turned the barricade's
 * orange chevrons into flat mauve and made the prop read as a park bench. That
 * failure is a bigger loss than the fetches are a win. 2 keeps the anisotropic
 * path — the axis is still resolved, just coarsely — and 4 on `phone` keeps
 * more than half of it on the tier that has the pixels to show it.
 *
 * Scope, honestly: this file is the procedural CLUTTER's eleven materials —
 * 128 px wear maps, two 64 px gradients and the 512 px print atlas, on props
 * that are metres wide. The plaza floor's own anisotropy is a different
 * constant on the generated surfaces in `props.ts`, and that is where the
 * grazing-angle argument really bites; nothing here reaches it.
 */
const ANISOTROPY_PHONE = 4;
/** …and `phone-low`, which is the tier the whole budget list is written for. */
const ANISOTROPY_PHONE_LOW = 2;

/**
 * The value the maps below are actually built with. Desktop's 8 is the default
 * and the only value any caller that never mentions a tier can get, which is
 * what keeps the props lab and every desktop rung byte-identical.
 */
let anisotropy = ANISOTROPY;

/**
 * Tell this file which device it is drawing for. Phone tiers only — a desktop
 * tier returns at the first line, so a desktop map's textures are built with
 * the same 8 they have always been built with.
 *
 * It is a SETTER rather than a parameter, and that is the shape this file's own
 * conventions ask for: the eleven materials are reached through a dozen factory
 * default arguments (`bollard(seed)`, `crates(seed)`, …) whose whole point is
 * that a caller does not have to know what a prop is made of, and threading a
 * tier through all of them to move one sampler number would be the tail wagging
 * the dog. `field.ts` calls this once, as the first statement of `createField`
 * — which is before `buildFurniture` → `buildClutter` takes its own unshared
 * bank, and before anything else in the spot has asked for a material.
 *
 * The retro-fit is for the shared singleton alone, because that is the only
 * bank this module can still reach without holding a reference to materials
 * `maps.ts` may already have disposed: a map's own bank is built downstream of
 * the call above and picks the value up at construction.
 */
export function setPropTextureTier(tier: QualityTier): void {
  if (!isPhoneTier(tier)) return;
  const want = tier.name === "phone-low" ? ANISOTROPY_PHONE_LOW : ANISOTROPY_PHONE;
  if (want === anisotropy) return;
  anisotropy = want;
  if (!shared) return;
  for (const m of Object.values(shared)) {
    if (typeof m === "function") continue;
    // `emissiveMap` on the lamp IS `map` — the same texture object — so the
    // guard on the value it already holds is what stops one canvas being
    // handed back for two uploads.
    for (const tex of [m.map, m.emissiveMap]) {
      if (!tex || tex.anisotropy === want) continue;
      tex.anisotropy = want;
      // Anisotropy is a sampler parameter three writes only while it uploads,
      // so a texture that is already on the GPU has to be offered back for one.
      tex.needsUpdate = true;
    }
  }
}

/**
 * Speckle that WRAPS: every mark is drawn again over each edge it crosses, so
 * a chip on the seam is a chip and not half a chip. A tiling wear map whose
 * marks stop at the edge shows its own grid on anything longer than a metre.
 */
function speck(
  size: number,
  r: ReturnType<typeof rand>,
  n: number,
  paint: (x: number, y: number, i: number) => void,
): void {
  for (let i = 0; i < n; i++) {
    const x = r.unit() * size;
    const y = r.unit() * size;
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) paint(x + dx, y + dy, i);
  }
}

// ---------------------------------------------------------------------------
// the wear maps
// ---------------------------------------------------------------------------

/** Enamel over steel: orange peel, chips down to dark primer, a rubbed sheen. */
function enamelMap(): THREE.CanvasTexture {
  return wear(128, "#e2e2e2", (g, r) => {
    speck(128, r, 40, (x, y) => {
      g.fillStyle = `rgba(${190 + r.unit() * 50},${190 + r.unit() * 50},${190 + r.unit() * 50},0.5)`;
      g.beginPath();
      g.ellipse(x, y, 4 + r.unit() * 16, 3 + r.unit() * 12, r.unit() * 3, 0, Math.PI * 2);
      g.fill();
    });
    // Chips: a dark bite with a bright lip, which is what a chip reads as at
    // 6 m — a flat dark dot reads as dirt.
    speck(128, r, 26, (x, y) => {
      const s = 1 + r.unit() * 3;
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.fillRect(x - 0.6, y - 0.6, s + 1.2, s + 1.2);
      g.fillStyle = `rgba(${70 + r.unit() * 30},${66 + r.unit() * 28},${62 + r.unit() * 26},0.85)`;
      g.fillRect(x, y, s, s);
    });
    // Scuffs — long, shallow, in one direction, the way a kerb rubs a post.
    g.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      g.strokeStyle = `rgba(${150 + r.unit() * 80},${150 + r.unit() * 80},${150 + r.unit() * 80},0.35)`;
      const y = r.unit() * 128;
      g.beginPath();
      g.moveTo(-4, y);
      g.lineTo(132, y + (r.unit() - 0.5) * 10);
      g.stroke();
    }
  }, 101);
}

/** Hot-dip galvanised: brush streaks along the run, spangle, a few scrapes. */
function galvMap(): THREE.CanvasTexture {
  return wear(128, "#dcdfe2", (g, r) => {
    // The spangle is the tell. Without the crystal patches this reads as
    // painted grey pipe, and every rail in the plaza is already painted grey.
    speck(128, r, 34, (x, y) => {
      g.fillStyle = `rgba(${196 + r.unit() * 55},${200 + r.unit() * 55},${204 + r.unit() * 50},0.55)`;
      g.beginPath();
      const n = 5 + Math.floor(r.unit() * 3);
      const rad = 5 + r.unit() * 13;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const rr = rad * (0.6 + r.unit() * 0.6);
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
    });
    g.lineWidth = 1;
    for (let i = 0; i < 120; i++) {
      const x = r.unit() * 128;
      g.strokeStyle = `rgba(${170 + r.unit() * 80},${175 + r.unit() * 80},${180 + r.unit() * 75},0.3)`;
      g.beginPath();
      g.moveTo(x, -4);
      g.lineTo(x + (r.unit() - 0.5) * 6, 132);
      g.stroke();
    }
  }, 211);
}

/** Cast iron, weathered: pitted, rust freckled, no gloss left anywhere. */
function ironMap(): THREE.CanvasTexture {
  return wear(128, "#c8c3bb", (g, r) => {
    speck(128, r, 60, (x, y) => {
      g.fillStyle = `rgba(${130 + r.unit() * 60},${124 + r.unit() * 55},${116 + r.unit() * 50},0.5)`;
      g.beginPath();
      g.ellipse(x, y, 3 + r.unit() * 12, 3 + r.unit() * 10, r.unit() * 3, 0, Math.PI * 2);
      g.fill();
    });
    speck(128, r, 90, (x, y) => {
      g.fillStyle = `rgba(${80 + r.unit() * 40},${74 + r.unit() * 36},${68 + r.unit() * 30},0.55)`;
      g.fillRect(x, y, 1 + r.unit() * 2, 1 + r.unit() * 2);
    });
    speck(128, r, 30, (x, y) => {
      g.fillStyle = `rgba(${190 + r.unit() * 50},${130 + r.unit() * 40},${70 + r.unit() * 30},${0.12 + r.unit() * 0.22})`;
      g.beginPath();
      g.ellipse(x, y, 2 + r.unit() * 7, 2 + r.unit() * 6, r.unit() * 3, 0, Math.PI * 2);
      g.fill();
    });
  }, 307);
}

/** Sawn softwood: grain along U, knots, saw marks across. */
function timberMap(): THREE.CanvasTexture {
  return wear(128, "#e0d2ba", (g, r) => {
    g.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const y = r.unit() * 128;
      g.strokeStyle = `rgba(${140 + r.unit() * 60},${112 + r.unit() * 50},${76 + r.unit() * 40},${0.18 + r.unit() * 0.3})`;
      g.beginPath();
      g.moveTo(-4, y);
      for (let x = 0; x <= 136; x += 17) g.lineTo(x, y + Math.sin(x * 0.09 + i) * 1.8);
      g.stroke();
    }
    speck(128, r, 5, (x, y) => {
      for (let k = 3; k > 0; k--) {
        g.strokeStyle = `rgba(${120 + k * 18},${92 + k * 14},${60 + k * 10},0.55)`;
        g.lineWidth = 1.6;
        g.beginPath();
        g.ellipse(x, y, k * 2.4, k * 1.5, 0.4, 0, Math.PI * 2);
        g.stroke();
      }
    });
    // The grey of weathered ply, patchy — a pallet that has stood out a winter.
    speck(128, r, 16, (x, y) => {
      g.fillStyle = `rgba(180,178,172,${0.08 + r.unit() * 0.22})`;
      g.fillRect(x - 10, y - 6, 20 + r.unit() * 24, 5 + r.unit() * 9);
    });
  }, 401);
}

/** Moulded polyethylene: near-flat, a mould swirl, kerb rash on the corners. */
function polyMap(): THREE.CanvasTexture {
  return wear(128, "#e6e6e6", (g, r) => {
    speck(128, r, 26, (x, y) => {
      g.fillStyle = `rgba(${205 + r.unit() * 45},${205 + r.unit() * 45},${205 + r.unit() * 45},0.45)`;
      g.beginPath();
      g.ellipse(x, y, 6 + r.unit() * 18, 5 + r.unit() * 14, r.unit() * 3, 0, Math.PI * 2);
      g.fill();
    });
    for (let i = 0; i < 30; i++) {
      const y = r.unit() * 128;
      g.strokeStyle = `rgba(255,255,255,${0.1 + r.unit() * 0.25})`;
      g.lineWidth = 0.8 + r.unit();
      g.beginPath();
      g.moveTo(-4, y);
      g.lineTo(132, y + (r.unit() - 0.5) * 14);
      g.stroke();
    }
    speck(128, r, 22, (x, y) => {
      g.fillStyle = `rgba(${120 + r.unit() * 50},${118 + r.unit() * 48},${114 + r.unit() * 44},${0.1 + r.unit() * 0.2})`;
      g.fillRect(x, y, 2 + r.unit() * 5, 1 + r.unit() * 3);
    });
  }, 503);
}

/** Precast concrete: aggregate, form-board lines, chipped arrises, streaks. */
function precastMap(): THREE.CanvasTexture {
  return wear(128, "#dcd7cc", (g, r) => {
    speck(128, r, 260, (x, y) => {
      const t = r.unit();
      g.fillStyle = `rgba(${150 + t * 90},${146 + t * 88},${138 + t * 84},${0.25 + r.unit() * 0.4})`;
      g.fillRect(x, y, 1 + r.unit() * 2.5, 1 + r.unit() * 2.5);
    });
    for (let i = 0; i < 4; i++) {
      const y = (i + r.unit() * 0.6) * 32;
      g.strokeStyle = "rgba(150,144,134,0.4)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-4, y);
      g.lineTo(132, y);
      g.stroke();
    }
    speck(128, r, 18, (x, y) => {
      g.fillStyle = `rgba(${110 + r.unit() * 40},${106 + r.unit() * 38},${100 + r.unit() * 34},${0.08 + r.unit() * 0.16})`;
      g.beginPath();
      g.ellipse(x, y, 5 + r.unit() * 20, 4 + r.unit() * 16, r.unit() * 3, 0, Math.PI * 2);
      g.fill();
    });
  }, 601);
}

/** Foliage: clumps light and dark, so a canopy blob is not one flat green ball. */
function leafMap(): THREE.CanvasTexture {
  return wear(128, "#dfe3ce", (g, r) => {
    speck(128, r, 90, (x, y) => {
      const dark = r.chance(0.55);
      g.fillStyle = dark
        ? `rgba(${120 + r.unit() * 40},${140 + r.unit() * 40},${96 + r.unit() * 30},0.6)`
        : `rgba(${226 + r.unit() * 28},${236 + r.unit() * 18},${190 + r.unit() * 30},0.55)`;
      g.beginPath();
      g.ellipse(x, y, 3 + r.unit() * 9, 2 + r.unit() * 6, r.unit() * 3, 0, Math.PI * 2);
      g.fill();
    });
    speck(128, r, 130, (x, y) => {
      g.fillStyle = `rgba(${90 + r.unit() * 50},${110 + r.unit() * 50},${70 + r.unit() * 40},0.45)`;
      g.fillRect(x, y, 1 + r.unit() * 2, 1 + r.unit() * 2);
    });
  }, 701);
}

/** Cardboard and newsprint: flute lines, fibre, a taped seam. */
function cardMap(): THREE.CanvasTexture {
  return wear(128, "#ddceb2", (g, r) => {
    g.lineWidth = 1;
    for (let x = 0; x < 128; x += 4) {
      g.strokeStyle = `rgba(${150 + r.unit() * 40},${128 + r.unit() * 34},${94 + r.unit() * 28},0.28)`;
      g.beginPath();
      g.moveTo(x, -4);
      g.lineTo(x, 132);
      g.stroke();
    }
    speck(128, r, 120, (x, y) => {
      g.fillStyle = `rgba(${170 + r.unit() * 60},${150 + r.unit() * 50},${118 + r.unit() * 40},0.4)`;
      g.fillRect(x, y, 1 + r.unit() * 3, 1);
    });
  }, 809);
}

/**
 * Dark glass with sky in the top of it. NOT tiled — every glass part in the
 * library is one quad or one small panel with its own 0→1 UVs, so the gradient
 * lands the same way up on all of them. A plain dark quad reads as a hole
 * punched in the object, which is the same note the spot's windows got.
 */
function glassMap(): THREE.CanvasTexture {
  const { c, g } = canvas(64);
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, "#c9d6e2");
  grad.addColorStop(0.42, "#59636f");
  grad.addColorStop(1, "#2b3138");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "rgba(255,255,255,0.28)";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(-6, 40);
  g.lineTo(40, -6);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** A lens: hot in the middle, falling off to the rim. Same 0→1 UV rule. */
function lensMap(): THREE.CanvasTexture {
  const { c, g } = canvas(64);
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.45, "#ffe8bd");
  grad.addColorStop(1, "#a8752c");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

// ---------------------------------------------------------------------------
// the print atlas — every legend in the library, on one page
// ---------------------------------------------------------------------------

/** Where each printed face lives in the 4 × 4 atlas. */
export const CELL = {
  stop: [0, 0],
  noParking: [1, 0],
  oneWay: [2, 0],
  warning: [3, 0],
  blade: [0, 1],
  bladeAlt: [1, 1],
  busFlag: [2, 1],
  regs: [3, 1],
  /** The back of any sign — bare aluminium and a bracket shadow. */
  back: [0, 2],
  posterA: [1, 2],
  posterB: [2, 2],
  noBills: [3, 2],
  meterFace: [0, 3],
  masthead: [1, 3],
  /** Slotted vent — a tree grate, a cabinet louvre, a condenser grille. */
  grille: [2, 3],
  chevrons: [3, 3],
} as const;

export type CellName = keyof typeof CELL;

const ATLAS_COLS = 4;
const ATLAS_CELL = 128;

/**
 * The whole library's signage, drawn once.
 *
 * Type is drawn with the platform's own condensed stack rather than the game's
 * loaded webfonts: a canvas built during boot cannot know whether Anton has
 * arrived yet, and a sign that renders in a fallback face on a cold load and in
 * Anton on a warm one is a texture that changes between two runs of the same
 * seed. At 6 m a regulation sign is legible as a red disc over white, which is
 * what the shape and the colour are for.
 */
function printAtlas(): THREE.CanvasTexture {
  const size = ATLAS_COLS * ATLAS_CELL;
  const { c, g } = canvas(size);
  const r = rand(907);
  g.fillStyle = "#b9bcc0";
  g.fillRect(0, 0, size, size);

  /** Draw inside one cell, in 0→128 local pixels. */
  const cell = (name: CellName, draw: () => void): void => {
    const [cx, cy] = CELL[name];
    g.save();
    g.beginPath();
    g.rect(cx * ATLAS_CELL, cy * ATLAS_CELL, ATLAS_CELL, ATLAS_CELL);
    g.clip();
    g.translate(cx * ATLAS_CELL, cy * ATLAS_CELL);
    draw();
    // Every printed face takes the same grime, so a sign belongs to the same
    // street as the post holding it up.
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${90 + r.unit() * 70},${86 + r.unit() * 66},${78 + r.unit() * 60},${0.04 + r.unit() * 0.1})`;
      g.beginPath();
      g.ellipse(r.unit() * 128, r.unit() * 128, 3 + r.unit() * 16, 2 + r.unit() * 12, r.unit() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };

  const text = (s: string, y: number, px: number, colour: string, weight = "700"): void => {
    g.fillStyle = colour;
    g.font = `${weight} ${px}px "Arial Narrow", "Helvetica Neue", system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(s, 64, y, 120);
  };
  const fill = (colour: string): void => {
    g.fillStyle = colour;
    g.fillRect(0, 0, 128, 128);
  };

  cell("stop", () => {
    fill("#b8231f");
    g.strokeStyle = "#f2eee6";
    g.lineWidth = 6;
    g.strokeRect(9, 9, 110, 110);
    text("STOP", 66, 44, "#f6f2ea", "800");
  });
  cell("noParking", () => {
    fill("#eeeae0");
    g.strokeStyle = "#b8231f";
    g.lineWidth = 11;
    g.beginPath();
    g.arc(64, 52, 33, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(41, 29);
    g.lineTo(87, 75);
    g.stroke();
    text("P", 52, 46, "#23262b", "800");
    text("NO PARKING", 104, 19, "#23262b");
  });
  cell("oneWay", () => {
    fill("#1b1d21");
    g.fillStyle = "#eeeae0";
    g.beginPath();
    g.moveTo(14, 56);
    g.lineTo(88, 56);
    g.lineTo(88, 40);
    g.lineTo(116, 64);
    g.lineTo(88, 88);
    g.lineTo(88, 72);
    g.lineTo(14, 72);
    g.closePath();
    g.fill();
    text("ONE WAY", 108, 20, "#eeeae0");
  });
  cell("warning", () => {
    fill("#e8b224");
    g.strokeStyle = "#1b1d21";
    g.lineWidth = 5;
    g.strokeRect(10, 10, 108, 108);
    g.fillStyle = "#1b1d21";
    // A walking figure, blocked in: head, body, two legs. It reads at 6 m.
    g.beginPath();
    g.arc(58, 34, 8, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(58, 44); g.lineTo(62, 74);
    g.moveTo(62, 74); g.lineTo(50, 100);
    g.moveTo(62, 74); g.lineTo(78, 98);
    g.moveTo(58, 52); g.lineTo(42, 66);
    g.stroke();
  });
  const blade = (label: string): void => {
    fill("#1d6b3f");
    g.strokeStyle = "#eeeae0";
    g.lineWidth = 4;
    g.strokeRect(6, 34, 116, 60);
    text(label, 64, 30, "#f2f2ec", "700");
  };
  cell("blade", () => blade("MARKET ST"));
  cell("bladeAlt", () => blade("7TH AVE"));
  cell("busFlag", () => {
    fill("#1b4f8f");
    g.fillStyle = "#eeeae0";
    g.fillRect(26, 30, 76, 44);
    g.fillStyle = "#1b4f8f";
    g.fillRect(32, 36, 28, 20);
    g.fillRect(66, 36, 30, 20);
    g.fillStyle = "#1b1d21";
    g.beginPath(); g.arc(42, 78, 8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(88, 78, 8, 0, Math.PI * 2); g.fill();
    text("BUS", 104, 22, "#eeeae0");
  });
  cell("regs", () => {
    fill("#eeeae0");
    g.fillStyle = "#b8231f";
    g.fillRect(0, 0, 128, 34);
    text("NO STANDING", 17, 19, "#f6f2ea");
    text("8AM - 6PM", 56, 22, "#23262b");
    text("MON - FRI", 82, 22, "#23262b");
    g.strokeStyle = "#23262b";
    g.lineWidth = 3;
    g.strokeRect(6, 40, 116, 82);
  });
  cell("back", () => {
    fill("#a8aaad");
    g.fillStyle = "rgba(60,62,66,0.35)";
    g.fillRect(52, 8, 24, 112);
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.fillRect(0, 0, 128, 8);
  });
  cell("posterA", () => {
    fill("#e4dccd");
    g.fillStyle = "#c8342b";
    g.fillRect(0, 12, 128, 34);
    text("SKATE JAM", 29, 26, "#f6f2ea", "800");
    g.fillStyle = "#1b1d21";
    g.fillRect(10, 56, 108, 6);
    text("SAT 8PM", 78, 22, "#1b1d21");
    text("DOWNTOWN LOT", 100, 15, "#43464b");
  });
  cell("posterB", () => {
    fill("#dfd7c6");
    g.fillStyle = "#2b4c8f";
    g.fillRect(8, 8, 112, 60);
    text("LIVE", 30, 30, "#f2ecdc", "800");
    text("TONIGHT", 54, 20, "#f2ecdc");
    // Torn along the bottom, because a poster on a hoarding always is.
    g.fillStyle = "#b9bcc0";
    g.beginPath();
    g.moveTo(0, 128);
    for (let x = 0; x <= 128; x += 16) g.lineTo(x, 92 + r.unit() * 26);
    g.lineTo(128, 128);
    g.closePath();
    g.fill();
  });
  cell("noBills", () => {
    fill("#cdb489");
    g.fillStyle = "rgba(120,96,60,0.35)";
    for (let y = 0; y < 128; y += 9) g.fillRect(0, y, 128, 2);
    g.save();
    g.translate(64, 64);
    g.rotate(-0.12);
    g.translate(-64, -64);
    text("POST NO", 54, 22, "#4a4238", "800");
    text("BILLS", 78, 22, "#4a4238", "800");
    g.restore();
  });
  cell("meterFace", () => {
    fill("#2e3237");
    g.fillStyle = "#7d8992";
    g.fillRect(16, 14, 96, 46);
    g.fillStyle = "#1b1d21";
    g.fillRect(22, 20, 84, 34);
    text("00:00", 37, 22, "#d8e6b0");
    g.fillStyle = "#9aa2a8";
    g.fillRect(52, 74, 24, 7);
    text("25c", 100, 16, "#c8ccd0");
  });
  cell("masthead", () => {
    fill("#e6e2d6");
    g.fillStyle = "#1b1d21";
    g.fillRect(0, 6, 128, 30);
    text("THE POST", 21, 24, "#f2efe6", "800");
    g.fillStyle = "rgba(60,60,60,0.5)";
    for (let y = 46; y < 122; y += 7) g.fillRect(10, y, 108, 3);
  });
  cell("grille", () => {
    fill("#8f8c87");
    g.fillStyle = "#26282b";
    for (let i = 0; i < 7; i++) g.fillRect(10 + i * 17, 10, 9, 108);
    g.fillStyle = "rgba(255,255,255,0.3)";
    for (let i = 0; i < 7; i++) g.fillRect(10 + i * 17, 10, 9, 3);
    g.strokeStyle = "#6d6a66";
    g.lineWidth = 8;
    g.strokeRect(4, 4, 120, 120);
  });
  cell("chevrons", () => {
    fill("#eeeae0");
    g.fillStyle = "#d2661c";
    g.save();
    g.beginPath();
    g.rect(0, 0, 128, 128);
    g.clip();
    // Two bands to the cell, not four. A barricade rail is drawn 200 px wide
    // and 10 px tall from six metres — a stripe finer than this is an average.
    for (let i = -2; i < 5; i++) {
      g.beginPath();
      g.moveTo(i * 64, 128);
      g.lineTo(i * 64 + 32, 128);
      g.lineTo(i * 64 + 32 + 128, 0);
      g.lineTo(i * 64 + 128, 0);
      g.closePath();
      g.fill();
    }
    g.restore();
  });

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/**
 * Map a part's own 0→1 UVs into one atlas cell.
 *
 * Inset by two texels: at mip level 2 a 128 px cell is 32 px, and a quad that
 * samples right up to its own edge takes the neighbouring cell's colour along
 * the seam — a stop sign with a green stripe down one side.
 */
export function cellUv(geo: THREE.BufferGeometry, name: CellName): THREE.BufferGeometry {
  const [cx, cy] = CELL[name];
  const uv = geo.getAttribute("uv");
  const inset = 2 / ATLAS_CELL;
  const span = (1 - inset * 2) / ATLAS_COLS;
  for (let i = 0; i < uv.count; i++) {
    const u = THREE.MathUtils.clamp(uv.getX(i), 0, 1);
    const v = THREE.MathUtils.clamp(uv.getY(i), 0, 1);
    uv.setXY(
      i,
      (cx + inset) / ATLAS_COLS + u * span,
      // Cell rows are counted from the TOP, the way the atlas is drawn, while
      // UV v runs up. Flipping here keeps the drawing code and the layout table
      // reading the same way round.
      1 - (cy + inset) / ATLAS_COLS - (1 - v) * span,
    );
  }
  uv.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------------------
// the bank
// ---------------------------------------------------------------------------

export interface PropMaterials {
  /** Painted steel — bollards, meters, cabinets, mailboxes, news boxes. */
  enamel: THREE.MeshStandardMaterial;
  /** Hot-dip galvanised — sign posts, bike racks, brackets, fixings. */
  steel: THREE.MeshStandardMaterial;
  /** Weathered cast iron — grates, hatches, hydrant-grade street iron. */
  iron: THREE.MeshStandardMaterial;
  /** Sawn softwood and ply — pallets, barricades, hoardings. */
  timber: THREE.MeshStandardMaterial;
  /** Moulded polyethylene — wheelie bins, crates, water barriers. */
  poly: THREE.MeshStandardMaterial;
  /** Precast concrete — planters, cabinet pads, kerb furniture. */
  precast: THREE.MeshStandardMaterial;
  /** Everything printed. One atlas, sixteen legends — see `CELL`. */
  print: THREE.MeshStandardMaterial;
  /** Foliage. */
  leaf: THREE.MeshStandardMaterial;
  /** Cardboard and newsprint. */
  card: THREE.MeshStandardMaterial;
  /** Dark glazing — meter windows, vending fronts, timetable cases. */
  glass: THREE.MeshStandardMaterial;
  /** A lit lens. The only emissive material in the library. */
  lamp: THREE.MeshStandardMaterial;
  dispose(): void;
}

/**
 * Roughness and metalness, and why they are not the obvious numbers.
 *
 * `props.ts` recorded the lesson for the rails: at 0.32 / 0.85 they took the
 * whole sky as one specular sheet and read as glowing white pipes from every
 * camera in the harness, so the shipped steel is 0.52 / 0.7. This bank sits on
 * the same side of that line — galvanised at 0.46 / 0.68, enamel barely
 * metallic at all — because it is lit by the same 15°-elevation sun and the
 * same bright golden-hour dome.
 */
function build(): PropMaterials {
  const std = (
    name: string,
    map: THREE.Texture | null,
    roughness: number,
    metalness: number,
  ): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ map, roughness, metalness, vertexColors: true });
    m.name = name;
    return m;
  };

  const lamp = std("lamp", lensMap(), 0.3, 0.05);
  lamp.emissive = new THREE.Color(0xffb347);
  lamp.emissiveMap = lamp.map;
  lamp.emissiveIntensity = 0.9;

  const bank: PropMaterials = {
    enamel: std("enamel", enamelMap(), 0.5, 0.15),
    steel: std("steel", galvMap(), 0.46, 0.68),
    iron: std("iron", ironMap(), 0.72, 0.4),
    timber: std("timber", timberMap(), 0.84, 0),
    poly: std("poly", polyMap(), 0.56, 0),
    precast: std("precast", precastMap(), 0.92, 0),
    print: std("print", printAtlas(), 0.38, 0.05),
    leaf: std("leaf", leafMap(), 0.78, 0),
    card: std("card", cardMap(), 0.94, 0),
    glass: std("glass", glassMap(), 0.14, 0.2),
    lamp,
    dispose(): void {
      for (const m of Object.values(bank)) {
        if (typeof m === "function") continue;
        m.map?.dispose();
        m.dispose();
      }
    },
  };
  return bank;
}

let shared: PropMaterials | null = null;

/**
 * The one bank, built on first use.
 *
 * Shared on purpose: eleven materials for a whole street of clutter is the
 * budget, and it only holds if every factory reaches for the same eleven. A
 * caller that genuinely wants its own set (a review page rendering two
 * variants side by side) passes its own into the factory instead.
 */
export function propMaterials(): PropMaterials {
  shared ??= build();
  return shared;
}

/** Fresh, unshared — for a tool that wants to poke at a material safely. */
export function createPropMaterials(): PropMaterials {
  return build();
}

export function disposePropMaterials(): void {
  shared?.dispose();
  shared = null;
}
