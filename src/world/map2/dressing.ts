// WHAT MAKES THE SPILLWAY A PLACE — surfaces, forest, fence, bridge, spray.
//
// Nothing in this file answers a height query. What it draws is still read off
// the descriptions next door rather than re-typed: the fence stands on the line
// `blocked()` stops you at, the trees stand on `channelY`, the spray is hung on
// the wall band `crossY` describes, and the street furniture comes from the
// same `PROPS` list `layout.ts` turns into colliders. A thing you can see and a
// thing you can hit are one entry, twice — the rule map 1 had to be rebuilt to
// get and this map starts with.
//
// Every generated surface lands as one URL constant with a procedural stand-in
// underneath, the way map 1 does it: the channel has to look like concrete the
// moment it boots and look like better concrete when the textures arrive. A
// failed load is a warning and the placeholder, never a broken scene.
//
// ON THE LIGHTING REGISTER. All ten surfaces in this round were generated in
// ONE register — flat neutral overcast, grey-balanced, no baked shadows — so
// that the two maps stop reading as two art departments. Nothing here grades
// them apart; the tints below are within a few per cent of white and exist only
// to seat a surface under THIS map's sky, which is a hard blue midday rather
// than map 1's golden hour.

import * as THREE from "three";
import { TIERS, isPhoneTier, type QualityTier } from "../../controllers/quality/tier";
import { loadTextureWithFallback } from "../../controllers/quality/pick-asset";
import type { GenexGltfLoader } from "../../controllers/quality/gltf-loader";
import {
  CHANNEL_Z0,
  CHANNEL_Z1,
  HILL_REACH,
  PARAPET_SLOPE,
  centreSlope,
  centreX,
  channelGradient,
  channelY,
  floorY,
  makeMarks,
  makeSection,
  marksOf,
  sectionAt,
} from "./channel";
import { TILE, type Map2Look } from "./features";
import { PROPS, RAILS, standOn } from "./layout";
import {
  FENCE_HEIGHT,
  buildChannelGeometry,
  buildFeatureGeometry,
  buildFenceGeometry,
  fencePosts,
} from "./mesh";
import { CLUTTER } from "./clutter";
import { clutterMaterials } from "./clutter";
import { installPanoramaSky } from "../sky/panorama";

// --- generated surfaces -----------------------------------------------------
/** The channel itself: bleached flood-channel concrete, form-work seams. */
const FLUME_TEXTURE_URL =
  "https://assets.auras.cc/generations/cms51lduu000i22oztar44nkh/texture-basecolor";
/** Everything skated: smooth power-trowelled, pale cool grey, a wax sheen. */
const PAD_TEXTURE_URL =
  "https://assets.auras.cc/generations/cms51ktzt000622oze19doqef/texture-basecolor";
/** The hillsides: dry tan dirt, shale, scrub. */
const HILL_TEXTURE_URL =
  "https://assets.auras.cc/generations/cms51leit000l22ozckanu7ty/texture-basecolor";
/** The headworks and the outfall structures: old red clay brick. */
const BRICK_TEXTURE_URL =
  "https://assets.auras.cc/generations/cms51lcmj000c22oz08pij2dw/texture-basecolor";
/** The bridge deck. */
const ROAD_TEXTURE_URL =
  "https://assets.auras.cc/generations/cms51ksoc000022ozvbavgosq/texture-basecolor";
/** Chain link, with its own alpha. */
const FENCE_TEXTURE_URL =
  "https://assets.auras.cc/generations/cms51lfh6000o22oz0illccyx/image-main";
/** A hard blue midday — map 2 is the OTHER hour, and that is most of its identity. */
export const SPILLWAY_SKYBOX_URL =
  "https://assets.auras.cc/generations/cms51lnml001722ozlt8bhb8p/skybox-equirect";

/**
 * The four pieces of spray, and they are the same four map 1 uses.
 *
 * Declared here rather than imported from `props.ts` on purpose: that file
 * belongs to the street lane and is being rebuilt in the same round as this
 * map, and one lane reaching across a boundary for a constant is how two lanes
 * become one file with two writers. The generation ids are the ids; the paint
 * on a drainage channel and the paint on a plaza are the same four cans.
 */
const GRAFFITI_URLS = [
  "https://assets.auras.cc/generations/cms2djqci01e622lpb7gczi3k/image-main", // throw-up
  "https://assets.auras.cc/generations/cms2djr1n01e922lpurc3ne4s/image-main", // wildstyle
  "https://assets.auras.cc/generations/cms2djrqw01ec22lpquoo2jol/image-main", // stencil
  "https://assets.auras.cc/generations/cms2djsfm01ef22lpycp5tch6/image-main", // contest flyposter
];

// ---------------------------------------------------------------------------
// procedural stand-ins
// ---------------------------------------------------------------------------

function canvas(size: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) throw new Error("[spillway] no 2d context");
  return { c, g };
}

/** Deterministic noise — the same channel every boot, so a look can be judged. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tiling(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

/** Bleached channel concrete: form-work bays, a lift line, water staining. */
function flumeCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.fillStyle = "#c3c0b6";
  g.fillRect(0, 0, 256, 256);
  const r = rng(19);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(${150 + r() * 60},${150 + r() * 58},${142 + r() * 55},0.32)`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 8 + r() * 44, 6 + r() * 34, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // The vertical streaks a wall gets from thirty years of run-off.
  g.strokeStyle = "rgba(96,96,90,0.22)";
  for (let i = 0; i < 26; i++) {
    g.lineWidth = 1 + r() * 5;
    g.beginPath();
    const x = r() * 256;
    g.moveTo(x, 0);
    g.lineTo(x + (r() - 0.5) * 10, 256);
    g.stroke();
  }
  grain(g, 256, 23, 22);
  // The form-work bay joint. One tile is one bay — see TILE.flume.
  g.strokeStyle = "rgba(78,76,70,0.7)";
  g.lineWidth = 2.5;
  g.strokeRect(0, 0, 256, 256);
  return tiling(c);
}

/** Power-trowelled and waxed: what the blocks and the kickers are cast in. */
function padCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.fillStyle = "#b9bcbd";
  g.fillRect(0, 0, 256, 256);
  const r = rng(37);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(${168 + r() * 50},${170 + r() * 50},${172 + r() * 48},0.3)`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 5 + r() * 26, 4 + r() * 20, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  grain(g, 256, 41, 16);
  g.strokeStyle = "rgba(88,90,92,0.55)";
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  return tiling(c);
}

/** Dry tan dirt with shale in it. */
function hillCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.fillStyle = "#9a8259";
  g.fillRect(0, 0, 256, 256);
  const r = rng(53);
  for (let i = 0; i < 340; i++) {
    const t = r();
    g.fillStyle =
      t < 0.45
        ? `rgba(${120 + r() * 40},${104 + r() * 34},${74 + r() * 28},0.6)`
        : `rgba(${150 + r() * 46},${138 + r() * 42},${112 + r() * 40},0.5)`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 2 + r() * 12, 1.5 + r() * 8, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // Scrub.
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${64 + r() * 40},${78 + r() * 40},${44 + r() * 28},0.5)`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 3 + r() * 9, 3 + r() * 8, 0, 0, Math.PI * 2);
    g.fill();
  }
  grain(g, 256, 59, 26);
  return tiling(c);
}

function brickCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.fillStyle = "#6b574c";
  g.fillRect(0, 0, 256, 256);
  const r = rng(71);
  const rows = 16;
  const h = 256 / rows;
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? h : 0;
    for (let x = -h * 2; x < 256; x += h * 2) {
      const t = 0.7 + r() * 0.45;
      g.fillStyle = `rgb(${Math.round(146 * t)},${Math.round(84 * t)},${Math.round(64 * t)})`;
      g.fillRect(x + off + 1.5, row * h + 1.5, h * 2 - 3, h - 3);
    }
  }
  grain(g, 256, 73, 20);
  return tiling(c);
}

function roadCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.fillStyle = "#41434a";
  g.fillRect(0, 0, 256, 256);
  const r = rng(83);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(${72 + r() * 88},${72 + r() * 84},${74 + r() * 84},0.5)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  grain(g, 256, 89, 20);
  return tiling(c);
}

/** Chain link, at the mesh size TILE.fence already lays out in world metres. */
function fenceCanvas(): THREE.CanvasTexture {
  const { c, g } = canvas(128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(198,205,212,0.95)";
  g.lineWidth = 4;
  for (let i = -2; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * 21.33, 0);
    g.lineTo(i * 21.33 + 128, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(i * 21.33, 128);
    g.lineTo(i * 21.33 + 128, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A stand-in piece of spray, so the walls are painted before the art lands.
 *
 * Deliberately DULL, and it is the one placeholder in this map that had to be
 * toned down rather than up. The floor set draws the same image flat at 55%
 * over most of the screen, so a saturated stand-in is not "a tag you cannot
 * read yet" — measured by looking at the first eight seconds of a boot, three
 * full-saturation hues over a pale concrete floor rendered the whole channel as
 * a pastel smear. One hue family, low chroma, and the real art replaces it.
 */
function graffitiCanvas(seed: number): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.clearRect(0, 0, 256, 256);
  const r = rng(seed);
  const base = Math.floor(r() * 360);
  const hues = [base, base + 18, base - 22];
  // Seven blobs and not sixteen. A piece of spray is mostly NOTHING — the alpha
  // is the shape — and a stand-in that fills its own square is a stand-in that
  // paints the floor rather than a tag on it.
  for (let i = 0; i < 7; i++) {
    g.fillStyle = `hsla(${hues[i % 3]},${20 + r() * 18}%,${34 + r() * 18}%,0.75)`;
    g.beginPath();
    g.ellipse(64 + r() * 128, 90 + r() * 80, 12 + r() * 26, 9 + r() * 18, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "rgba(18,16,20,0.9)";
  g.lineWidth = 7;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(20 + r() * 60, 80 + r() * 100);
    g.bezierCurveTo(r() * 256, r() * 256, r() * 256, r() * 256, 180 + r() * 60, 80 + r() * 110);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------

export type Map2Materials = Record<Map2Look, THREE.MeshStandardMaterial>;

export function createMap2Materials(): Map2Materials {
  const std = (
    map: THREE.Texture | null,
    color: number,
    roughness: number,
    metalness = 0,
  ): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ map, color, roughness, metalness });

  // The stand-ins carry the SAME knock-down the landed textures get (see
  // `dressMap2Materials`), so the channel is already in the right value range
  // on the first frame and does not brighten by a stop when the art arrives.
  return {
    flume: std(flumeCanvas(), 0xc9c8c4, 0.9),
    // Lower than the flume's, and it is the one material difference that
    // carries gameplay: a waxed block catches the sun where the channel around
    // it does not, so a ledge reads as a ledge before you are on it.
    pad: std(padCanvas(), 0xd6d8db, 0.62),
    hill: std(hillCanvas(), 0xb8b0a0, 0.97),
    brick: std(brickCanvas(), 0xc6b4a8, 0.92),
    road: std(roadCanvas(), 0xa5a4a8, 0.94),
    // Dull galvanised, not chrome — at low roughness a handrail takes the whole
    // sky as one specular sheet and reads as a glowing white pipe.
    steel: std(null, 0x7c838a, 0.5, 0.68),
    fence: new THREE.MeshStandardMaterial({
      map: fenceCanvas(),
      color: 0xb6bcc2,
      roughness: 0.45,
      metalness: 0.6,
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
    }),
  };
}

// ---------------------------------------------------------------------------
// GPU-compressed textures, on phones only
// ---------------------------------------------------------------------------
//
// The same two helpers map 1 keeps in `props.ts`, and they are COPIED rather
// than imported on purpose: this map owns its own dressing end to end — its
// materials, its spray, its sky — and reaching into map 1's module for ten
// lines would be the first thread tying the two together. The long-form reason
// for each of them lives beside the originals; the short version is below.
//
// Phone tiers only, because Basis/UASTC is a lossy re-encode of an image the
// desktop currently gets byte-for-byte: `isPhoneTier` is a name test against the
// two phone rows, so a desktop calls `loadTextureWithFallback` with no
// `ktx2Load` at all and loads exactly what it loaded before. Not the sky, for
// the reason `dressSky` carries at the bottom of this file.

/** The `.ktx2` sibling loader for a phone, or nothing at all. */
function ktx2Textures(
  tier: QualityTier,
  gltf: GenexGltfLoader | undefined,
): { ktx2Load: (url: string) => Promise<THREE.Texture> } | undefined {
  if (!isPhoneTier(tier)) return undefined;
  // The game's ONE KTX2Loader, built in `createGltfLoader` at boot with the
  // transcoder path and the `detectSupport(renderer)` probe already on it.
  const loader = gltf?.ktx2 ? gltf.loader.ktx2Loader : null;
  if (!loader) return undefined;
  return { ktx2Load: (url) => loader.loadAsync(url) };
}

/**
 * Turn a compressed texture the same way up as an uncompressed one — a
 * `CompressedTexture` is `flipY = false` and cannot be changed, while every
 * `TextureLoader` texture here is `flipY = true`, so a raw swap renders the
 * channel upside down. The texture matrix does what the upload cannot. Applied
 * after each call site has set its own wrap and repeat, and a no-op on anything
 * that is not compressed.
 */
function matchLoaderOrientation(tex: THREE.Texture): THREE.Texture {
  if (!(tex as THREE.CompressedTexture).isCompressedTexture || tex.flipY) return tex;
  tex.repeat.y *= -1;
  tex.offset.y += 1;
  return tex;
}

/** The generated surfaces, swapped in over the stand-ins once they arrive. */
export async function dressMap2Materials(
  mats: Map2Materials,
  tier: QualityTier,
  renderer: THREE.WebGLRenderer,
  gltf?: GenexGltfLoader,
): Promise<void> {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const compressed = ktx2Textures(tier, gltf);
  const swap = async (look: Map2Look, url: string, tint: number): Promise<void> => {
    try {
      const tex = await loadTextureWithFallback(url, tier, (u) => loader.loadAsync(u), compressed);
      tex.colorSpace = THREE.SRGBColorSpace;
      // MIRRORED, all of it. A 450 m channel shows one wall texture over and
      // over from a single camera, and plain repeat puts whatever is loudest in
      // the basecolor back at exactly the same phase every TILE metres.
      // Mirroring doubles the oriented period and makes the tile boundary
      // continuous by construction.
      tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
      // The UVs already carry world metres over TILE, so the repeat here is 1
      // by construction — a texture that needs a number typed in is a texture
      // that ends up at a different scale on the next mesh.
      tex.repeat.set(1, 1);
      tex.anisotropy = aniso;
      matchLoaderOrientation(tex);
      const old = mats[look].map;
      mats[look].map = tex;
      mats[look].color.setHex(tint);
      mats[look].needsUpdate = true;
      old?.dispose();
    } catch (e) {
      console.warn(`[spillway] ${look} texture failed`, e);
    }
  };

  // THE GRADE, and it is almost all one number.
  //
  // Every one of these basecolors is a bright overcast plate — the bleached
  // spillway slab reads about 0.88 of white before anything is done to it — and
  // three of them side by side under a midday key blow the whole channel out to
  // paper. So the tint is a knock-down of roughly 0.62 applied to ALL of them,
  // which is an exposure and not a grade: the ten surfaces were generated in
  // one lighting register on purpose and pulling them apart by hue is exactly
  // what would undo that. What varies here is VALUE, and only where the
  // material genuinely differs — the waxed pad sits a shade lighter and cooler
  // than the channel it stands in, so a ledge reads before you are on it, and
  // asphalt is darker than concrete because asphalt is darker than concrete.
  await Promise.all([
    swap("flume", FLUME_TEXTURE_URL, 0x8b8a86),
    swap("pad", PAD_TEXTURE_URL, 0x9a9c9f),
    swap("hill", HILL_TEXTURE_URL, 0x7f7767),
    swap("brick", BRICK_TEXTURE_URL, 0x8b7a6f),
    swap("road", ROAD_TEXTURE_URL, 0x69686d),
    // The chain link keeps its alpha and its own wrap: a mirrored diamond mesh
    // is a diamond mesh, but the alpha edge at the tile seam is not.
    //
    // And it keeps the browser-decodable path, for the reason map 1's fence
    // carries in full: it has no `.ktx2` sibling to load (404 as of
    // 2026-07-30 — a later generation than the backfill), and when one appears
    // it would be an ETC1S alpha slice cut at a hard `alphaTest` through a
    // one-pixel wire lattice. That wants a capture, not a silent upgrade.
    (async () => {
      try {
        const tex = await loadTextureWithFallback(FENCE_TEXTURE_URL, tier, (u) => loader.loadAsync(u));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1, 1);
        tex.anisotropy = aniso;
        const old = mats.fence.map;
        mats.fence.map = tex;
        mats.fence.needsUpdate = true;
        old?.dispose();
      } catch (e) {
        console.warn("[spillway] fence texture failed", e);
      }
    })(),
  ]);
}

// ---------------------------------------------------------------------------
// the built world
// ---------------------------------------------------------------------------

/** The concrete: the channel, and everything cast on it. */
export function buildConcrete(mats: Map2Materials, tier: QualityTier): THREE.Group {
  const group = new THREE.Group();
  group.name = "spillway-concrete";
  for (const [look, geo] of buildChannelGeometry(tier)) {
    const mesh = new THREE.Mesh(geo, mats[look]);
    // The channel floor is the one surface nothing ever stands beside, so it
    // only receives — a floor casting onto itself buys acne and nothing else.
    mesh.receiveShadow = true;
    mesh.castShadow = look !== "hill";
    mesh.name = `spillway-${look}`;
    group.add(mesh);
  }
  for (const [look, geo] of buildFeatureGeometry()) {
    const mesh = new THREE.Mesh(geo, mats[look]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `spillway-feature-${look}`;
    group.add(mesh);
  }
  return group;
}

/**
 * The steel: every grind line that is a BAR, drawn off `RAILS` itself, so the
 * pipe you can see is the pipe you lock onto and there is no second set of
 * coordinates to keep in step. Ledges need nothing here — their grind edge is
 * the concrete's own top corner.
 */
export function buildSteel(mats: Map2Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = "spillway-steel";
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const line of RAILS) {
    if (line.kind !== "rail") continue;
    a.copy(line.a);
    b.copy(line.b);
    const len = a.distanceTo(b);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), mats.steel);
    tube.position.copy(mid.addVectors(a, b).multiplyScalar(0.5));
    tube.quaternion.setFromUnitVectors(up, mid.subVectors(b, a).normalize());
    tube.castShadow = true;
    group.add(tube);
    // Posts only where the bar actually stands off what it runs over. A coping
    // is bolted along a lip and has nothing to hold it up; posting it the way a
    // flat bar is posted grows a row of 3 cm stubs down a transition.
    let clear = 0;
    for (let i = 0; i <= 4; i++) {
      mid.lerpVectors(a, b, i / 4);
      clear = Math.max(clear, mid.y - channelY(mid.x, mid.z));
    }
    if (clear < 0.25) continue;
    const posts = Math.max(2, Math.round(len / 2.2));
    for (let i = 0; i <= posts; i++) {
      mid.lerpVectors(a, b, i / posts);
      const floor = channelY(mid.x, mid.z);
      const h = Math.max(0.1, mid.y - floor);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, h, 6), mats.steel);
      post.position.set(mid.x, floor + h / 2, mid.z);
      post.castShadow = true;
      group.add(post);
    }
  }
  return group;
}

/**
 * The chain link, and the posts it is strung on.
 *
 * Both banks get it. The fence is not decoration here — it stands exactly where
 * `blocked()` stops you (see `BOUND_INSET`), so it is the one thing on screen
 * that tells a player where the world ends, and a bound you cannot see is a
 * bound that reads as the game being broken.
 */
export function buildFence(mats: Map2Materials, tier: QualityTier): THREE.Group {
  const group = new THREE.Group();
  group.name = "spillway-fence";
  const postGeo = new THREE.CylinderGeometry(0.045, 0.05, FENCE_HEIGHT + 0.1, 6);
  const m = new THREE.Matrix4();
  for (const side of [-1, 1] as const) {
    const mesh = new THREE.Mesh(buildFenceGeometry(tier, side), mats.fence);
    mesh.name = `spillway-fence-${side > 0 ? "east" : "west"}`;
    group.add(mesh);

    const posts = fencePosts(side);
    const inst = new THREE.InstancedMesh(postGeo, mats.steel, posts.length);
    inst.castShadow = true;
    for (let i = 0; i < posts.length; i++) {
      m.makeTranslation(posts[i].x, posts[i].y + (FENCE_HEIGHT + 0.1) / 2, posts[i].z);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }
  return group;
}

/**
 * THE ROAD BRIDGE — the one piece of the city that reaches over the channel,
 * and the thing that makes this a ditch behind a town rather than a canyon.
 *
 * Its deck sits on the two piers `layout.ts` already stands in the water, so
 * the obstacle you thread at speed and the landmark you see from four hundred
 * metres away are the same object.
 */
export function buildBridge(mats: Map2Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = "spillway-bridge";
  const s = 256;
  const cx = centreX(s);
  const y = floorY(s) + 7.4;
  const span = 74;
  const width = 9;

  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    py: number,
    pz: number,
    mat: THREE.Material,
  ): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  // The soffit, the deck, and a parapet down each side.
  box(span, 0.85, width, cx, y + 0.42, s, mats.flume);
  box(span, 0.1, width - 0.6, cx, y + 0.9, s, mats.road);
  box(span, 0.85, 0.34, cx, y + 1.28, s - width / 2 + 0.17, mats.flume);
  box(span, 0.85, 0.34, cx, y + 1.28, s + width / 2 - 0.17, mats.flume);
  // …and the abutment wall each end, so the deck lands on something.
  box(3, 9, width + 2, cx - span / 2 + 1.5, y - 3.6, s, mats.brick);
  box(3, 9, width + 2, cx + span / 2 - 1.5, y - 3.6, s, mats.brick);
  return group;
}

/**
 * The outfall pipes: three of them in the west wall, which is what a channel
 * behind a town actually collects.
 */
export function buildOutfalls(mats: Map2Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = "spillway-outfalls";
  const sec = makeSection();
  const marks = makeMarks();
  for (const [s, radius] of [
    [84, 0.85],
    [232, 0.6],
    [332, 1.1],
  ] as const) {
    const sc = sectionAt(s, sec);
    const m = marksOf(sc, marks);
    // Through the PARAPET, a third of the way up it — which is where a town's
    // storm outfall actually pierces a flood wall, above the design flow and
    // under the walkway. It is also the only face in the section flat enough to
    // put a 1.7 m headwall pipe through without the ring standing off the
    // concrete at one end: the transition under it is a 4 m radius.
    const face = Math.atan(PARAPET_SLOPE);
    const h = sc.bank + m.apronH + sc.freeboard * 0.34;
    const d = m.apron + (h - sc.bank - m.apronH) / PARAPET_SLOPE;
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 1.4, 12, 1, true),
      mats.brick,
    );
    ring.rotation.z = Math.PI / 2 - face;
    ring.position.set(centreX(s) - d + 0.3, floorY(s) + h, s);
    ring.material.side = THREE.DoubleSide;
    group.add(ring);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(radius, 12), mats.steel);
    cap.position.set(centreX(s) - d - 0.25, floorY(s) + h + 0.4 / Math.tan(face), s);
    cap.rotation.y = Math.PI / 2;
    cap.rotation.x = 0;
    group.add(cap);
  }
  return group;
}

// ---------------------------------------------------------------------------
// the hillsides
// ---------------------------------------------------------------------------

/**
 * THE FAR RIDGE — the other side of the valley, and it is not decoration.
 *
 * This map falls ninety metres over its own length, so from the headworks you
 * are looking DOWN the channel and out of the valley: the near hillsides close
 * the sides at a 39° elevation angle and close nothing at all straight ahead.
 * Measured by looking, before this existed — a band of the skybox's own dry
 * grass sat across the horizon at the end of the flume in every frame taken
 * from the top half of the map, which reads as the world running out.
 *
 * So the valley gets a far side. It grows out of the channel's own hillside at
 * the last row the mesh draws (`channelY(x, 408)`), which is what makes the
 * join seamless without a second description of where the ground is, and it
 * rises 50-odd metres over the next hundred and thirty. Nothing queries it and
 * nothing can reach it — the debris screen stops the ride at s = 398 — so it is
 * scenery in the honest sense rather than geometry with no collision.
 */
const RIDGE = {
  X0: -130,
  X1: 130,
  Z0: 424,
  Z1: 561,
  base: (x: number): number => channelY(THREE.MathUtils.clamp(x, -62, 62), 424),
  rise: (x: number): number => 52 + 20 * Math.sin(x / 62 + 1.1) + 8 * Math.sin(x / 21),
  yAt(x: number, z: number): number {
    return this.base(x) + this.rise(x) * smootherStep((z - this.Z0) / (this.Z1 - this.Z0));
  },
};

function buildBackdrop(): THREE.BufferGeometry {
  const { X0, X1, Z0, Z1 } = RIDGE;
  const cols = 26;
  const rows = 12;
  const yAt = (x: number, z: number): number => RIDGE.yAt(x, z);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < cols; i++) {
    const xa = X0 + ((X1 - X0) * i) / cols;
    const xb = X0 + ((X1 - X0) * (i + 1)) / cols;
    for (let k = 0; k < rows; k++) {
      const za = Z0 + ((Z1 - Z0) * k) / rows;
      const zb = Z0 + ((Z1 - Z0) * (k + 1)) / rows;
      p[0].set(xa, yAt(xa, za), za);
      p[1].set(xa, yAt(xa, zb), zb);
      p[2].set(xb, yAt(xb, zb), zb);
      p[3].set(xb, yAt(xb, za), za);
      n.crossVectors(e1.subVectors(p[1], p[0]), e2.subVectors(p[2], p[0])).normalize();
      for (const j of [0, 1, 2, 0, 2, 3]) {
        pos.push(p[j].x, p[j].y, p[j].z);
        nor.push(n.x, n.y, n.z);
        uv.push(p[j].x / TILE.hill, p[j].z / TILE.hill);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

function smootherStep(t: number): number {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/** One conifer: a trunk and three stacked skirts, merged into one geometry. */
function coniferGeometry(): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry } {
  const trunk = new THREE.CylinderGeometry(0.1, 0.2, 1, 5);
  trunk.translate(0, 0.5, 0);
  const parts = [
    { r: 1.0, h: 1.5, y: 0.55 },
    { r: 0.78, h: 1.4, y: 1.4 },
    { r: 0.52, h: 1.3, y: 2.2 },
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const p of parts) {
    const cone = new THREE.ConeGeometry(p.r, p.h, 6, 1, true).toNonIndexed();
    cone.translate(0, p.y + p.h / 2, 0);
    const cp = cone.getAttribute("position");
    const cn = cone.getAttribute("normal");
    const cu = cone.getAttribute("uv");
    for (let i = 0; i < cp.count; i++) {
      pos.push(cp.getX(i), cp.getY(i), cp.getZ(i));
      nor.push(cn.getX(i), cn.getY(i), cn.getZ(i));
      uv.push(cu.getX(i), cu.getY(i));
    }
    cone.dispose();
  }
  const crown = new THREE.BufferGeometry();
  crown.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  crown.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  crown.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  crown.computeBoundingSphere();
  return { trunk, crown };
}

/**
 * THE FORESTED HILLSIDES.
 *
 * Two instanced draw calls for the whole valley, and every tree stood on
 * `channelY` — the same function the wheels read — so nothing floats and
 * nothing is buried. Scattered off a fixed seed, because a hillside that
 * reshuffles itself every boot is a hillside nobody can judge.
 *
 * They start a metre and a half OUTSIDE the walkway's fence line and lean out
 * from there: the reference frame this map is built to has trees crowding the
 * top of the concrete, and a bare berm between the fence and the forest is the
 * one thing that would make a valley read as a diorama.
 */
export function buildForest(tier: QualityTier, mats: Map2Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = "spillway-forest";
  const ridge = new THREE.Mesh(buildBackdrop(), mats.hill);
  ridge.name = "spillway-backdrop";
  group.add(ridge);
  const { trunk, crown } = coniferGeometry();
  const bark = new THREE.MeshStandardMaterial({ color: 0x463a2e, roughness: 0.95 });
  // Desaturated on purpose. A saturated conifer green against bleached concrete
  // is the one colour in this map loud enough to pull the eye off the line, and
  // a dry hillside above a flood channel is olive rather than emerald anyway.
  const needle = new THREE.MeshStandardMaterial({ color: 0x3c4a33, roughness: 0.92 });

  const r = rng(1301);
  const sec = makeSection();
  const marks = makeMarks();
  const spots: { x: number; y: number; z: number; scale: number; yaw: number }[] = [];
  const density = Math.max(0.25, tier.particleScale);
  const step = 5 / density;
  for (let z = CHANNEL_Z0 - 20; z < CHANNEL_Z1 + 20; z += step) {
    const zz = z + r() * step;
    const s = sectionAt(zz, sec);
    const m = marksOf(s, marks);
    for (const side of [-1, 1] as const) {
      const rows = 3;
      for (let i = 0; i < rows; i++) {
        if (r() > 0.78) continue;
        const out = m.deck + 1.5 + (HILL_REACH - 2) * ((i + r()) / rows);
        const x = centreX(zz) + side * out;
        spots.push({
          x,
          y: channelY(x, zz) - 0.15,
          z: zz,
          scale: 2.4 + r() * 3.2,
          yaw: r() * Math.PI * 2,
        });
      }
    }
  }

  // …and the FAR RIDGE gets its own stand, which is what turns it from a pale
  // cut-out into the other side of a valley. A hazed hillside with nothing on
  // it has no scale in it at all: the fog tells you it is distant and the
  // silhouette tells you nothing about how distant, and the eye reads it as a
  // painted flat. Conifers going down in size across three hundred metres of
  // haze are the whole read, and they are the same two instanced meshes.
  // Sparse and only on its near slope: a ridge at three hundred metres is
  // mostly FOG, so every tree standing on it is a fog-coloured cone, and the
  // first pass put four rows of them there and built a white wall across the
  // end of the map that read as nearer than the hillside forty metres away.
  // What the silhouette needs is to be broken, not filled.
  for (let x = RIDGE.X0 + 6; x < RIDGE.X1; x += 9 / density) {
    for (let i = 0; i < 2; i++) {
      if (r() > 0.66) continue;
      const xx = x + (r() - 0.5) * 9;
      const zz = RIDGE.Z0 + 8 + (i + r()) * 34;
      spots.push({
        x: xx,
        y: RIDGE.yAt(xx, zz) - 0.4,
        z: zz,
        scale: 5 + r() * 4,
        yaw: r() * Math.PI * 2,
      });
    }
  }

  const mat4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const fill = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh => {
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    inst.castShadow = true;
    for (let i = 0; i < spots.length; i++) {
      const t = spots[i];
      q.setFromAxisAngle(axis, t.yaw);
      mat4.compose(p.set(t.x, t.y, t.z), q, sc.set(t.scale, t.scale, t.scale));
      inst.setMatrixAt(i, mat4);
    }
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  };
  group.add(fill(trunk, bark));
  group.add(fill(crown, needle));
  return group;
}

// ---------------------------------------------------------------------------
// the paint
// ---------------------------------------------------------------------------

export interface Painted {
  group: THREE.Group;
  /** One material per art, twice — see below for why a wall and a floor differ. */
  materials: THREE.MeshStandardMaterial[];
  flat: THREE.MeshStandardMaterial[];
  /**
   * Which art indices this tier actually put geometry on the wall for — the
   * same guard map 1 carries, and for the same reason: `buildPaint` drops any
   * piece under the tier's budget, and an image with nothing left to draw it on
   * is 5.33 MB of texture nothing samples. Derived from the `perArt` buffers
   * rather than from a second copy of the budget rule. Desktop tiers use a
   * budget of 0, so every entry is true and nothing changes there.
   */
  drawn: boolean[];
}

/**
 * Where the spray goes, generated rather than hand-placed.
 *
 * Map 1 places every one of its fifty-three pieces by hand and that is right
 * for a plaza, where each wall is a different length and half of them have a
 * bench in front of them. This is four hundred and fifty metres of identical
 * concrete: hand-placing it would be typing the same three numbers eighty times
 * with the z changed, and what actually matters — that the pieces sit on the
 * STRAIGHT part of the wall, that they never cross a bay joint at a silly
 * angle, and that they cluster where a person could get down to the channel —
 * is a rule, not a list. So it is written as the rule.
 */
interface Decal {
  s: number;
  side: 1 | -1;
  /** Where up the parapet's face a wall piece sits, 0 at its toe and 1 at its cap. */
  h: number;
  w: number;
  hh: number;
  art: number;
  flip: boolean;
  /** A flat piece lies on the floor at this offset across the channel instead. */
  u?: number;
}

function decals(): Decal[] {
  const r = rng(907);
  const out: Decal[] = [];
  // The walls. Denser where a run is slow enough to look at them — the bowl,
  // under the bridge, the outfall — and thinner down the chute, where you are
  // doing twenty and the wall is a blur anyway.
  for (let s = 8; s < 396; s += 6 + r() * 9) {
    const inBowl = s > 126 && s < 172;
    const nearBridge = s > 236 && s < 278;
    const chance = inBowl || nearBridge ? 0.92 : s < 56 ? 0.42 : 0.68;
    for (const side of [-1, 1] as const) {
      if (r() > chance) continue;
      const art = Math.floor(r() * 4);
      const big = r() > 0.42;
      const w = big ? 3.6 + r() * 3.4 : 1.4 + r() * 1.2;
      out.push({
        s: s + r() * 3,
        side,
        // Low on the parapet, where somebody standing on the apron can reach.
        h: 0.28 + r() * 0.34,
        w,
        hh: w * (art === 3 ? 1.35 : 0.42 + r() * 0.16),
        art,
        flip: r() > 0.5,
      });
    }
  }
  // …and on the floor, where a run puts your eyes. Flat paint reads at
  // distances a wall piece does not, and this map is mostly seen down its own
  // length rather than across it.
  for (let s = 12; s < 392; s += 16 + r() * 20) {
    out.push({
      s,
      side: 1,
      h: 0,
      u: (r() - 0.5) * 7,
      w: 2.6 + r() * 2.6,
      hh: 2.6 + r() * 2.6,
      art: Math.floor(r() * 3),
      flip: r() > 0.5,
    });
  }
  return out;
}

/**
 * The spray IS lit, and that is deliberate. Unlit paint on a sunlit wall reads
 * as a sticker stuck onto the photograph — a piece in the shade of the west
 * bank exactly as bright as one in full sun. At roughness 0.96 a standard
 * material has no specular lobe worth worrying about and puts every piece in
 * the same light as the concrete under it.
 */
export function buildPaint(tier: QualityTier): Painted {
  const group = new THREE.Group();
  group.name = "spillway-paint";
  const materials = GRAFFITI_URLS.map(
    (_, i) =>
      new THREE.MeshStandardMaterial({
        map: graffitiCanvas(211 + i * 53),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        roughness: 0.96,
        metalness: 0,
      }),
  );
  // A chrome throw-up is most of the way to black outline, and laid flat under
  // a midday sun the wall version of it renders as a dark splat that is the
  // loudest thing in the channel. The floor set is the same image at 55% and
  // rougher, which is what a year of wheels and run-off does to it.
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

  const perArt: { pos: number[]; nor: number[]; uv: number[] }[] = [...materials, ...flat].map(
    () => ({ pos: [], nor: [], uv: [] }),
  );
  // Phones lose the small stuff first — the big wall pieces are the read.
  const budget = tier.particleScale < 0.6 ? 2.4 : 0;
  const sec = makeSection();
  const marks = makeMarks();
  const grad = { gx: 0, gz: 0 };

  for (const d of decals()) {
    if (d.w < budget) continue;
    const isFlat = d.u !== undefined;
    const b = perArt[d.art + (isFlat ? materials.length : 0)];
    const push = (x: number, y: number, z: number, u: number, v: number, n: number[]): void => {
      b.pos.push(x, y, z);
      b.nor.push(n[0], n[1], n[2]);
      b.uv.push(u, v);
    };
    const u0 = d.flip ? 1 : 0;
    const u1 = d.flip ? 0 : 1;

    if (isFlat) {
      // A flat piece follows the concrete corner by corner, so it never digs
      // into the drainage dish or hangs off the trickle groove.
      const hw = d.w / 2;
      const hh = d.hh / 2;
      const corner = (dx: number, dz: number): number[] => {
        const x = centreX(d.s + dz) + (d.u as number) + dx;
        const z = d.s + dz;
        return [x, channelY(x, z) + 0.02, z];
      };
      const c00 = corner(-hw, -hh);
      const c10 = corner(hw, -hh);
      const c11 = corner(hw, hh);
      const c01 = corner(-hw, hh);
      channelGradient(c00[0], c00[2], grad);
      const inv = 1 / Math.hypot(grad.gx, 1, grad.gz);
      const n = [-grad.gx * inv, inv, -grad.gz * inv];
      push(c00[0], c00[1], c00[2], u0, 0, n);
      push(c10[0], c10[1], c10[2], u1, 0, n);
      push(c11[0], c11[1], c11[2], u1, 1, n);
      push(c00[0], c00[1], c00[2], u0, 0, n);
      push(c11[0], c11[1], c11[2], u1, 1, n);
      push(c01[0], c01[1], c01[2], u0, 1, n);
      continue;
    }

    // A wall piece is hung ON THE PARAPET, in the plane of the parapet — 84° —
    // rather than stood up straight in front of it. Paint sprayed on concrete
    // lies on the concrete; a decal that ignores the slope stands off it by its
    // own height at the top and is buried in it at the bottom.
    //
    // The parapet and not the transition, and that is the section's own doing
    // rather than a change of taste. Since the bank was bounded at 2.0–3.4 m
    // (see `THE BANK IS A THING YOU USE`) the straight band between the
    // transition's lip and the crest is under a metre tall — everything below
    // that is curved, and a 2 m throw-up wrapped round a 4 m radius reads as a
    // sticker on a pipe. The freeboard wall above the apron is the only big
    // FLAT face in the section, it is 1.4 to 2.6 m of it, it stands where a
    // rider at the top of a carve is looking straight at it, and it is exactly
    // where a real ditch is painted: above the water line, reachable from the
    // walkway, and the first thing the fence looks down on.
    const s = sectionAt(d.s, sec);
    const m = marksOf(s, marks);
    const wallLow = s.bank + m.apronH;
    const wallHigh = m.topH;
    const face = Math.atan(PARAPET_SLOPE);
    // A piece is SIZED TO THE WALL IT IS ON, not sized in the list and then
    // rejected if it does not fit. The band is 1.4 m in the outfall and 2.6 in
    // the chute, and the first cut wrote its own dimensions and dropped
    // anything taller — which threw away every big piece in the reach a rider
    // spends the longest looking at, and left a 47 m wall carrying two
    // stickers. Scaled, the aspect survives and the wall is painted; under a
    // third of the intended size it is not worth drawing, and that is the only
    // thing left that skips one.
    const band = (wallHigh - wallLow) / Math.sin(face);
    const fit = Math.min(1, (band * 0.82) / d.hh);
    if (fit < 0.34) continue;
    const dw = d.w * fit;
    const dh = d.hh * fit;
    const h = THREE.MathUtils.clamp(
      wallLow + (wallHigh - wallLow) * d.h,
      wallLow + dh * 0.55 * Math.sin(face),
      wallHigh - dh * 0.55 * Math.sin(face),
    );
    const dist = m.apron + (h - wallLow) / PARAPET_SLOPE;
    const cx = centreX(d.s) + d.side * dist;
    const cy = floorY(d.s) + h;
    // Along the channel, and up the wall.
    const slope = centreSlope(d.s);
    const along = new THREE.Vector3(slope, 0, 1).normalize();
    const up = new THREE.Vector3(d.side * Math.cos(face), Math.sin(face), 0).normalize();
    const n = new THREE.Vector3().crossVectors(along, up);
    if (n.y < 0) n.negate();
    const nn = [n.x, n.y, n.z];
    const at = (a: number, u: number): number[] => [
      cx + along.x * a + up.x * u,
      cy + along.y * a + up.y * u,
      d.s + along.z * a + up.z * u,
    ];
    const hw = dw / 2;
    const hh = dh / 2;
    const p00 = at(-hw, -hh);
    const p10 = at(hw, -hh);
    const p11 = at(hw, hh);
    const p01 = at(-hw, hh);
    push(p00[0], p00[1], p00[2], u0, 0, nn);
    push(p10[0], p10[1], p10[2], u1, 0, nn);
    push(p11[0], p11[1], p11[2], u1, 1, nn);
    push(p00[0], p00[1], p00[2], u0, 0, nn);
    push(p11[0], p11[1], p11[2], u1, 1, nn);
    push(p01[0], p01[1], p01[2], u0, 1, nn);
  }

  const all = [...materials, ...flat];
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
    const mesh = new THREE.Mesh(geo, all[i]);
    mesh.receiveShadow = true;
    mesh.renderOrder = 3;
    group.add(mesh);
  }
  return { group, materials, flat, drawn };
}

/**
 * The generated spray, over the stand-in blobs.
 *
 * Takes the `.ktx2` sibling on phones where one exists. These materials BLEND
 * rather than alpha-test, which is what makes a compressed alpha slice safe
 * here and not on the fence — see map 1's `dressPaint` for the measurement.
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
      // Nothing on this tier draws this piece, so nothing holds its image.
      if (!painted.drawn[i]) return;
      try {
        const tex = await loadTextureWithFallback(url, tier, (u) => loader.loadAsync(u), compressed);
        tex.colorSpace = THREE.SRGBColorSpace;
        matchLoaderOrientation(tex);
        const old = painted.materials[i].map;
        painted.materials[i].map = tex;
        painted.materials[i].needsUpdate = true;
        painted.flat[i].map = tex;
        painted.flat[i].needsUpdate = true;
        old?.dispose();
      } catch (e) {
        console.warn(`[spillway] graffiti ${i} failed`, e);
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// the clutter
// ---------------------------------------------------------------------------

/**
 * The clutter, built from the SAME list `layout.ts` turns into colliders — see
 * `PROPS` there, and `clutter.ts` for the catalogue itself.
 *
 * The materials are made fresh per mount rather than shared: `maps.ts` disposes
 * everything it removes when a spot is unmounted, so a map holding a shared set
 * would take the next one's props down with it on the way out.
 */
export function buildClutter(tier: QualityTier): THREE.Group {
  const group = new THREE.Group();
  group.name = "spillway-clutter";
  const mats = clutterMaterials();
  PROPS.forEach((p, i) => {
    const kind = CLUTTER[p.id];
    // Scenery thins out on a phone; anything with a collider never does,
    // because whatever else a quality tier is allowed to change, it is not
    // allowed to change where the walls are.
    if (!kind.block && tier.particleScale < 0.6 && i % 2 === 1) return;
    const root = kind.build(p.seed, mats);
    root.position.set(centreX(p.s) + p.u, standOn(p.u, p.s), p.s);
    root.rotation.y = p.yaw;
    root.name = `clutter-${p.id}-${p.seed}`;
    group.add(root);
  });
  return group;
}

// ---------------------------------------------------------------------------
// the sky
// ---------------------------------------------------------------------------

/**
 * Where the sun is, in the ONE place both the light and the sky read it from —
 * the same discipline `field.ts` runs on, with map 2's own numbers.
 *
 * Map 1 is a 27° golden hour raking along a plaza; this is a hard blue midday
 * coming ACROSS a valley, and the two hours are most of what stops the second
 * map reading as a reskin of the first — bleached concrete instead of amber,
 * one bank lit and one in shade instead of long stripes down a floor.
 *
 * WEST-NORTH-WEST AND 37° UP, and both numbers are doing a job.
 *
 * The azimuth puts the light ACROSS the channel rather than along it, which is
 * the whole difference between a flume with two banks and a flume with one:
 * the light travels east, so the west transition takes it square and the east
 * one — whose inner face points straight into it — is in shade for its whole
 * length. That is the lighting the reference frames have, and it is what tells
 * you a channel is a V rather than a strip of grey.
 *
 * The elevation is 56° and it is a VALLEY number, which is the thing this map
 * has that a plaza does not. The panorama's own disc sits at 37° (measured off
 * the image at u = 0.324, v = 0.707) and the first cut ran the rig there to
 * match it — and at 37° the twenty metres of hillside standing over the west
 * bank throws twenty-six metres of shadow, which is the whole channel. Measured
 * by looking: the floor, both transitions and the rider were in shade for the
 * length of the map. So the key goes up until the valley stops shadowing
 * itself. What a player can actually check — where the sun disc is in the sky
 * against which way his own shadow points — is the AZIMUTH, and that is exact:
 * the sky is turned to the rig (see `dressSky`), never the rig to the sky.
 */
export const SUN_AZIMUTH = (-150 * Math.PI) / 180;
export const SUN_ELEVATION = (56 * Math.PI) / 180;
/** Where the generated panorama's own sun sits, measured off the image. */
const SKY_SUN_AZIMUTH = (-63.3 * Math.PI) / 180;

/** Streams the sky in and turns it onto the light rig. */
export async function dressSky(
  scene: THREE.Scene,
  tier: QualityTier,
  renderer: THREE.WebGLRenderer,
): Promise<void> {
  // Every phone takes the LOW rung: this map is played looking DOWN a channel
  // between two hillsides, so the sky is a strip along the top of the frame and
  // a source of bounce light, and 32 MB of it is most of a phone's budget.
  const skyTier = tier.name === "phone" || tier.name === "phone-low" ? TIERS["phone-low"] : tier;
  try {
    const tex = await loadTextureWithFallback(SPILLWAY_SKYBOX_URL, skyTier, (u) =>
      new THREE.TextureLoader().loadAsync(u),
    );
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    // Both properties, in one call, and the same picture as the two assignments
    // this replaced — see `world/sky/panorama.ts`. The game owns the background
    // cube and the PMREM environment now, so the cube's dead per-face depth
    // buffers are never allocated, the generator's ping-pong twin is freed, and
    // leaving this map gives the whole family back instead of orphaning it on
    // the GPU.
    installPanoramaSky(scene, renderer, tex);
    // The sky is TURNED to the light rig rather than the rig to the sky, so the
    // panorama's sun disc lands on the bearing every shadow in the channel
    // points away from. And it is set EXPLICITLY rather than left alone: the
    // rotation is scene state, so a map that does not write it inherits
    // whatever the last map turned the sky to.
    const turn = new THREE.Euler(0, SUN_AZIMUTH - SKY_SUN_AZIMUTH, 0);
    scene.backgroundRotation = turn;
    scene.environmentRotation = turn.clone();
    // Under map 1's 0.34, and for the same reason its key came down: this dome
    // is a hard bright blue and the channel it is lighting is pale concrete on
    // every face. It is here to colour the shade, not to fill it.
    scene.environmentIntensity = 0.22;
  } catch (e) {
    console.warn("[spillway] skybox failed", e);
  }
}
