// tools/back-shape.mjs — LOOK at the north ramp's shape, with no browser at all.
//
// A REVIEW tool. It adds nothing to the bundle and the game exposes nothing for
// it: it imports `buildSpotGeometry()` — the same function the game meshes the
// level with — and rasterises those triangles into a PNG with a z-buffer and
// one sun. No dev server, no GL, no dependencies beyond the ones the harnesses
// already use.
//
//   node tools/back-shape.mjs --out shots/ramp8/after
//
// WHY IT IS NOT `tools/spot-map.html`, WHICH IS THE BETTER PICTURE. That lab has
// the real materials, the real sun and the real dressing, and it is the one to
// use when it is available. On 2026-07-30 it was not: four lanes were editing
// `field.ts` / `sky/` / `props.ts` / `look.ts` at once, the game's own loader
// wedged at 60% (`tools/boot-probe.mjs` records it), and then the dev server on
// :5173 died and an unrelated Next.js app took the port. A lane that owns a
// SHAPE has to be able to look at its shape without four other lanes compiling.
//
// WHAT IT CAN AND CANNOT TELL YOU, said plainly so a capture from it is never
// passed off as a gameplay frame:
//
//   IT CAN   — silhouette, whether a surface is flat, where the arrises are,
//              and FACETING. Flat shading is deliberate and load-bearing:
//              `meshSolid` pushes one normal per `quad()` (from `p0`), so a
//              profile emitted as N chords renders as N constant-shaded bands.
//              That banding is what the player called "folded", and a smoothed
//              render would hide the very thing this lane was sent to fix.
//   IT CANNOT — materials, textures, decals, dressing, exposure, colour
//               grading, shadows or anything a post chain does. Clay and one
//               sun. For those, `spot-map.html` and `shoot.mjs`.
//
// The sun is the level's own — azimuth 1°, elevation 22° (`field.ts`, and the
// measurement in `BACK_FACE_ANGLE`'s note) — so the N·L banding this prints is
// the banding the game lights.

import { register } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deflateSync } from "node:zlib";

register(new URL("./ts-resolve.mjs", import.meta.url));
const { buildSpotGeometry } = await import("../src/world/spot.ts");

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const OUT = arg("out", "shots/ramp8/shape");
const W = Number(arg("width", 1280));
const H = Number(arg("height", 800));
const FOV = 62;

/** One clay per material — this is a SHAPE tool, so nothing here is a look. */
const CLAY = {
  concrete: [0.72, 0.70, 0.66], park: [0.76, 0.74, 0.70], sidewalk: [0.69, 0.67, 0.64],
  asphalt: [0.30, 0.30, 0.31], ledge: [0.74, 0.72, 0.68], brick: [0.42, 0.28, 0.24],
  brick2: [0.40, 0.27, 0.23], metal: [0.62, 0.65, 0.68], fence: [0.55, 0.57, 0.60],
};

const az = (1 * Math.PI) / 180;
const el = (22 * Math.PI) / 180;
const SUN = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];

// The player's own angles, read off his capture: low and ON the ramp looking
// along the wall (the frame in which the object reads as one wedge), the top of
// the ramp looking along it (where the shelf's facets fold), the two ends, and
// the whole object from the plaza.
const CAMS = [
  // HIS OWN FRAME: on the face at eye height, looking west-north-west along the
  // wall. The face at z = 43.6 stands at 1.96 m, so the eye is 1.6 m over it.
  ["on-the-ramp-wnw", [8, 3.6, 43.6], [-24, 3.9, 45.8]],
  // On the top, looking along it — the frame in which the shelf's own facets
  // showed as parallel bands and read as a folded surface.
  ["on-the-deck-w", [2, 4.0, 46.6], [-30, 3.7, 47.2]],
  // The whole object from the plaza, oblique and low, which is where a rider
  // sees whether there is a TOP behind the coping or only a skyline.
  ["from-the-plaza", [14, 1.7, 34.0], [-14, 3.4, 45.0]],
  // The two ends, where a bank that stopped short of the side walls would need
  // a hip or a cap. This one runs the full width into both of them.
  ["corner-w", [-26, 3.0, 39.0], [-38, 3.4, 46.5]],
  ["corner-e", [24, 3.0, 39.0], [36, 3.4, 46.5]],
];

// --- the geometry, as flat arrays --------------------------------------------
const tris = [];
for (const [look, geo] of buildSpotGeometry()) {
  const pos = geo.getAttribute("position").array;
  const nor = geo.getAttribute("normal").array;
  const albedo = CLAY[look] ?? [0.7, 0.68, 0.65];
  for (let i = 0; i < pos.length; i += 9) {
    tris.push({
      p: [
        [pos[i], pos[i + 1], pos[i + 2]],
        [pos[i + 3], pos[i + 4], pos[i + 5]],
        [pos[i + 6], pos[i + 7], pos[i + 8]],
      ],
      // ONE normal per triangle, read off its first vertex — which is exactly
      // what `meshSolid` wrote, and the reason this render shows the bands.
      n: [nor[i], nor[i + 1], nor[i + 2]],
      albedo,
    });
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function render(eye, target) {
  const fwd = norm(sub(target, eye));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const f = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
  const aspect = W / H;

  const zbuf = new Float64Array(W * H).fill(Infinity);
  const rgb = new Float64Array(W * H * 3);
  // Sky, so the silhouette reads against something.
  for (let i = 0; i < W * H; i++) {
    rgb[i * 3] = 0.42; rgb[i * 3 + 1] = 0.55; rgb[i * 3 + 2] = 0.72;
  }

  const NEAR = 0.05;
  /** World point → camera space (x right, y up, z forward). */
  const toCam = (p) => {
    const d = sub(p, eye);
    return [dot(d, right), dot(d, up), dot(d, fwd)];
  };
  const project = (v) => ({
    x: (((v[0] * f) / (v[2] * aspect)) * 0.5 + 0.5) * W,
    y: (0.5 - ((v[1] * f) / v[2]) * 0.5) * H,
    z: v[2],
  });
  /**
   * Clip a camera-space triangle against the near plane, into 0, 1 or 2
   * triangles. WITHOUT this the tool silently drops the biggest surfaces in the
   * level: the plaza, the deck and the face are each ONE quad tens of metres
   * across, so a camera standing on one has that quad's far vertices in front of
   * it and its near ones behind, and a whole-triangle reject throws the ground
   * the camera is standing on out of the frame.
   */
  // Sutherland–Hodgman against the single plane z = NEAR, then fan-triangulate.
  // Written as the general polygon clip rather than the three-case special one:
  // the special case is four lines shorter and it is exactly where the first cut
  // of this file went wrong — a mis-rotated in/out pattern let a triangle keep a
  // vertex BEHIND the eye, and the frame came back as a starburst of hundred-
  // metre slivers through the vanishing point.
  const clipNear = (v) => {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      const p = v[i];
      const q = v[(i + 1) % v.length];
      const pIn = p[2] >= NEAR;
      const qIn = q[2] >= NEAR;
      if (pIn) out.push(p);
      if (pIn !== qIn) {
        const t = (NEAR - p[2]) / (q[2] - p[2]);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, NEAR]);
      }
    }
    const tri = [];
    for (let i = 1; i + 1 < out.length; i++) tri.push([out[0], out[i], out[i + 1]]);
    return tri;
  };

  const fragments = [];
  for (const t of tris) {
    for (const piece of clipNear(t.p.map(toCam))) fragments.push({ t, v: piece });
  }

  for (const frag of fragments) {
    const t = frag.t;
    const a = project(frag.v[0]);
    const b = project(frag.v[1]);
    const c = project(frag.v[2]);
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    if (minX > maxX || minY > maxY) continue;
    const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (area === 0) continue;
    // Two-sided: the spot's skirts and caps are wound for one face and this is
    // a diagnostic, not a render — a back face is still a real surface here.
    const nl = Math.abs(dot(t.n, SUN));
    const facing = dot(t.n, [0, 1, 0]);
    // sun + a sky/ground hemisphere, so a shaded plane is still readable
    const lit = 0.16 + 0.30 * (0.5 + 0.5 * facing) + 1.05 * nl;
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const x = px + 0.5;
        const y = py + 0.5;
        let w0 = ((b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y)) / area;
        let w1 = ((x - a.x) * (c.y - a.y) - (c.x - a.x) * (y - a.y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        // Perspective-correct depth, which matters at these grazing angles.
        const z = 1 / (w2 / a.z + w1 / b.z + w0 / c.z);
        const i = py * W + px;
        if (z >= zbuf[i]) continue;
        zbuf[i] = z;
        rgb[i * 3] = t.albedo[0] * lit;
        rgb[i * 3 + 1] = t.albedo[1] * lit;
        rgb[i * 3 + 2] = t.albedo[2] * lit;
      }
    }
  }
  return rgb;
}

/** Minimal PNG writer — no image dependency for a review tool. */
function png(rgb) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) {
        // sRGB-ish, so a 22° sun does not read as black concrete.
        const v = Math.max(0, Math.min(1, rgb[i + k]));
        raw[o++] = Math.round(255 * Math.pow(v, 1 / 2.2));
      }
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

await mkdir(dirname(OUT), { recursive: true });
console.log(`${tris.length} triangles from buildSpotGeometry(), sun az 1° el 22°`);
for (const [name, eye, target] of CAMS) {
  const path = `${OUT}-${name}.png`;
  await writeFile(path, png(render(eye, target)));
  console.log(`SHOT ${path}  eye (${eye}) → (${target})`);
}
