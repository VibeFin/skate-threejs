// THE NOISE THE CLOUDS ARE MADE OF — three small textures, built once.
//
// A raymarched cloud reads a density function two or three dozen times per
// pixel, so what that function COSTS is the whole performance story. Evaluating
// four octaves of simplex noise per sample in the fragment shader is the
// textbook way to write this and is roughly forty instructions a tap; a texture
// fetch is one, and on a phone it is one that hits a cache. So all the noise is
// baked here, at boot, into two small 3D textures and one 2D one, and the
// shader does nothing but look things up.
//
// The composition is the standard one (Guerrilla's Horizon clouds and Andrew
// Schneider's write-ups of it, arrived at independently by everyone since):
// a low-frequency Perlin-Worley base that gives cloud-shaped blobs, three
// octaves of inverted Worley to erode them into billows, and a separate
// high-frequency Worley pack to eat the edges into wisps. The 2D map is
// WEATHER — where on the map there are clouds at all — and it is what stops the
// sky being one uniform field of the same noise from horizon to horizon.
//
// COST, measured on the review page rather than guessed: at the desktop sizes
// (48³ shape, 32³ detail, 128² weather) generation is one synchronous pass of
// 60–65 ms during the loading screen for 624 KB of texture; at the phone sizes
// (32³, 16³) it is 30–33 ms for 208 KB. Both are cached per size for the life
// of the page, so swapping maps pays nothing and the second map is free.

import * as THREE from "three";

/** The project's LCG, inlined — this file runs before any RNG interface. */
function lcg(seed: number): () => number {
  let s = (seed | 0) ^ 0x9e3779b9;
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad);
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97);
  s = (s ^ (s >>> 15)) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const fade = (t: number): number => t * t * (3 - 2 * t);

/**
 * Tileable value noise on an f³ lattice, sampled over a size³ grid.
 * Tileable because the shader repeats these textures across kilometres of sky:
 * a seam in the noise is a straight line of cloud edge running to the horizon.
 */
function valueNoise(size: number, f: number, rnd: () => number): Float32Array {
  const lat = new Float32Array(f * f * f);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const at = (x: number, y: number, z: number): number =>
    lat[(((z % f) + f) % f) * f * f + (((y % f) + f) % f) * f + (((x % f) + f) % f)];
  const out = new Float32Array(size * size * size);
  for (let z = 0; z < size; z++) {
    const fz = (z / size) * f;
    const iz = Math.floor(fz);
    const tz = fade(fz - iz);
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * f;
      const iy = Math.floor(fy);
      const ty = fade(fy - iy);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * f;
        const ix = Math.floor(fx);
        const tx = fade(fx - ix);
        const c000 = at(ix, iy, iz);
        const c100 = at(ix + 1, iy, iz);
        const c010 = at(ix, iy + 1, iz);
        const c110 = at(ix + 1, iy + 1, iz);
        const c001 = at(ix, iy, iz + 1);
        const c101 = at(ix + 1, iy, iz + 1);
        const c011 = at(ix, iy + 1, iz + 1);
        const c111 = at(ix + 1, iy + 1, iz + 1);
        const x00 = c000 + (c100 - c000) * tx;
        const x10 = c010 + (c110 - c010) * tx;
        const x01 = c001 + (c101 - c001) * tx;
        const x11 = c011 + (c111 - c011) * tx;
        const y0 = x00 + (x10 - x00) * ty;
        const y1 = x01 + (x11 - x01) * ty;
        out[(z * size + y) * size + x] = y0 + (y1 - y0) * tz;
      }
    }
  }
  return out;
}

/**
 * Tileable inverted Worley, by SPLATTING rather than searching.
 *
 * The obvious implementation walks 27 neighbouring cells per voxel, which is
 * 27·size³ distance tests and puts a 48³ texture at three frequencies into the
 * hundreds of milliseconds — a visible hitch on the loading screen. Splatting
 * inverts the loop: each feature point writes its own influence into the ±1
 * cell box around it, which is 8·size³ tests TOTAL regardless of frequency,
 * and the two produce the same field because a jittered-grid Worley's nearest
 * point is always inside that box.
 */
function worley(size: number, f: number, rnd: () => number): Float32Array {
  const cell = size / f;
  const out = new Float32Array(size * size * size).fill(cell);
  const reach = Math.ceil(cell);
  for (let cz = 0; cz < f; cz++) {
    for (let cy = 0; cy < f; cy++) {
      for (let cx = 0; cx < f; cx++) {
        const px = (cx + rnd()) * cell;
        const py = (cy + rnd()) * cell;
        const pz = (cz + rnd()) * cell;
        const x0 = Math.floor(px - reach);
        const y0 = Math.floor(py - reach);
        const z0 = Math.floor(pz - reach);
        for (let z = z0; z <= z0 + 2 * reach; z++) {
          const dz = z - pz;
          const iz = ((z % size) + size) % size;
          for (let y = y0; y <= y0 + 2 * reach; y++) {
            const dy = y - py;
            const iy = ((y % size) + size) % size;
            const row = (iz * size + iy) * size;
            for (let x = x0; x <= x0 + 2 * reach; x++) {
              const dx = x - px;
              const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
              const i = row + ((x % size) + size) % size;
              if (d < out[i]) out[i] = d;
            }
          }
        }
      }
    }
  }
  // Inverted and normalised: 1 in the middle of a cell, 0 at a feature point.
  // Inverted is the whole point — plain Worley gives you cracks, inverted gives
  // you billows, and a cloud is billows.
  for (let i = 0; i < out.length; i++) out[i] = 1 - Math.min(1, out[i] / cell);
  return out;
}

function fbm(size: number, freqs: number[], rnd: () => number, kind: "worley" | "value"): Float32Array {
  const out = new Float32Array(size * size * size);
  let amp = 0.5;
  let total = 0;
  for (const f of freqs) {
    const layer = kind === "worley" ? worley(size, f, rnd) : valueNoise(size, f, rnd);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const remap = (v: number, a: number, b: number, c: number, d: number): number =>
  c + ((v - a) / (b - a)) * (d - c);

export interface CloudNoise {
  shape: THREE.Data3DTexture;
  detail: THREE.Data3DTexture;
  weather: THREE.DataTexture;
  /** Milliseconds spent building it — the review page prints this. */
  buildMs: number;
  bytes: number;
}

const cache = new Map<string, CloudNoise>();

/**
 * `shapeSize` 48 / `detailSize` 32 is the desktop pair, 32 / 16 the phone pair.
 * Both tile, so the sky's feature size is set by the shader's sampling
 * frequency rather than by the texture's resolution — a 32³ shape texture does
 * not mean coarse clouds, it means fewer distinct billows before the field
 * repeats, and at the scales here the repeat is four kilometres wide.
 */
export function cloudNoise(shapeSize: number, detailSize: number, seed = 7): CloudNoise {
  const key = `${shapeSize}:${detailSize}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t0 = performance.now();
  const rnd = lcg(seed);

  // R: Perlin-Worley — value-noise blobs remapped by a low Worley so they get
  // billowed edges instead of the soft round ones value noise has on its own.
  const perlin = fbm(shapeSize, [2, 4, 8], rnd, "value");
  const lowW = fbm(shapeSize, [2, 4], rnd, "worley");
  const w4 = fbm(shapeSize, [4], rnd, "worley");
  const w8 = fbm(shapeSize, [8], rnd, "worley");
  const w16 = fbm(shapeSize, [Math.min(16, shapeSize / 2)], rnd, "worley");

  const n = shapeSize * shapeSize * shapeSize;
  const shapeData = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const pw = clamp01(remap(perlin[i], lowW[i] - 1, 1, 0, 1));
    shapeData[i * 4] = Math.round(pw * 255);
    shapeData[i * 4 + 1] = Math.round(clamp01(w4[i]) * 255);
    shapeData[i * 4 + 2] = Math.round(clamp01(w8[i]) * 255);
    shapeData[i * 4 + 3] = Math.round(clamp01(w16[i]) * 255);
  }
  const shape = new THREE.Data3DTexture(shapeData, shapeSize, shapeSize, shapeSize);
  shape.format = THREE.RGBAFormat;
  shape.type = THREE.UnsignedByteType;
  shape.minFilter = shape.magFilter = THREE.LinearFilter;
  shape.wrapS = shape.wrapT = shape.wrapR = THREE.RepeatWrapping;
  shape.needsUpdate = true;

  const dn = detailSize * detailSize * detailSize;
  const d4 = fbm(detailSize, [Math.max(2, detailSize / 8)], rnd, "worley");
  const d8 = fbm(detailSize, [Math.max(3, detailSize / 4)], rnd, "worley");
  const d16 = fbm(detailSize, [Math.max(4, detailSize / 2)], rnd, "worley");
  const detailData = new Uint8Array(dn * 4);
  for (let i = 0; i < dn; i++) {
    detailData[i * 4] = Math.round(clamp01(d4[i]) * 255);
    detailData[i * 4 + 1] = Math.round(clamp01(d8[i]) * 255);
    detailData[i * 4 + 2] = Math.round(clamp01(d16[i]) * 255);
    detailData[i * 4 + 3] = 255;
  }
  const detail = new THREE.Data3DTexture(detailData, detailSize, detailSize, detailSize);
  detail.format = THREE.RGBAFormat;
  detail.type = THREE.UnsignedByteType;
  detail.minFilter = detail.magFilter = THREE.LinearFilter;
  detail.wrapS = detail.wrapT = detail.wrapR = THREE.RepeatWrapping;
  detail.needsUpdate = true;

  // WEATHER. Two channels over the ground plane: how much cloud there is here
  // at all, and how tall it grows. This is the difference between a sky and a
  // noise field — real cloud comes in systems with clear lanes between them,
  // and one 128² map with two octaves in it buys exactly that for one fetch.
  const W = 128;
  const cov = valueNoise2(W, 3, rnd);
  const cov2 = valueNoise2(W, 7, rnd);
  const typ = valueNoise2(W, 5, rnd);
  const weatherData = new Uint8Array(W * W * 4);
  for (let i = 0; i < W * W; i++) {
    const c = clamp01(cov[i] * 0.72 + cov2[i] * 0.28);
    weatherData[i * 4] = Math.round(clamp01(remap(c, 0.3, 0.78, 0, 1)) * 255);
    weatherData[i * 4 + 1] = Math.round(clamp01(typ[i]) * 255);
    weatherData[i * 4 + 2] = 0;
    weatherData[i * 4 + 3] = 255;
  }
  const weather = new THREE.DataTexture(weatherData, W, W, THREE.RGBAFormat);
  weather.minFilter = weather.magFilter = THREE.LinearFilter;
  weather.wrapS = weather.wrapT = THREE.RepeatWrapping;
  weather.needsUpdate = true;

  const out: CloudNoise = {
    shape,
    detail,
    weather,
    buildMs: performance.now() - t0,
    bytes: shapeData.byteLength + detailData.byteLength + weatherData.byteLength,
  };
  cache.set(key, out);
  return out;
}

/** The 2D case of the same lattice, for the weather map. */
function valueNoise2(size: number, f: number, rnd: () => number): Float32Array {
  const lat = new Float32Array(f * f);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const at = (x: number, y: number): number => lat[(((y % f) + f) % f) * f + (((x % f) + f) % f)];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * f;
    const iy = Math.floor(fy);
    const ty = fade(fy - iy);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * f;
      const ix = Math.floor(fx);
      const tx = fade(fx - ix);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
      out[y * size + x] = a + (b - a) * ty;
    }
  }
  return out;
}
