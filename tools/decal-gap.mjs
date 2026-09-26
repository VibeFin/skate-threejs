// EVERY PIECE OF PAINT, MEASURED AGAINST THE SURFACE IT CLAIMS TO BE ON.
//
// Run: node --experimental-strip-types tools/decal-gap.mjs
//      …                                        --id <substring>   one piece
//      …                                        --quiet            failures only
//
// WHY THIS IS A NODE HARNESS AND NOT ANOTHER PANEL IN spot-map.html.
//
// `tools/spot-map.html` already marches out of every decal and prints what it
// hits, and it was RIGHT — it would have caught the piece the player reported
// hanging in the air behind the quarter pipe. It caught nothing because nobody
// opened it: it needs a browser, a WebGL context and a human reading 60 lines
// of log, so it is a thing you run when you already suspect something. The bug
// it was built for has now shipped three times (fifteen of sixteen pieces
// inside the shopfront plinth, eleven more behind the wall's own furniture, and
// this round a 3.2 m tag floating 2.32 m over the landing bank), and every one
// of those arrived the same way: a SOLID MOVED and the paint on it did not.
// That is a regression check, and a regression check has to be cheap enough to
// run next to `tsc`.
//
// It is also a different measurement. spot-map.html asks the yes/no question
// "is this buried" over a 1 m march, which is why a tag 2.32 m off the deck
// came back as `behind Infinity` — outside its own search window, printed as a
// dash, indistinguishable from clear air. This file asks for the NUMBER, signed
// and in metres, and has no window to fall out of.
//
// THE THREE WAYS A DECAL IS WRONG, and they need three different questions:
//
//   · FLOATING — there is air between the decal's back face and the matter it
//     is painted on. Measured by marching along -normal until `insideSolid`,
//     and reported signed: positive is air behind it.
//   · BURIED — the decal's back face is right, and something else stands in
//     FRONT of it. The plinth, a fascia sign, a drainpipe, or (this round) a
//     3.4 m bank-to-wall that grew 1.2 m and put its apron across the bottom
//     half of the north wall's whole production band. Measured by marching
//     along +normal and counting the samples that hit matter within 0.6 m,
//     which is the wall's own skin depth — furniture standing further out is a
//     plaza, not a defect (spot-map.html's distinction, kept).
//   · OFF THE END — part of the quad has no matter behind it at all. A tag on
//     the tall half of a wedge whose face falls to nothing, a piece hung past
//     the end of a ledge. Reported as the fraction of samples with no backing,
//     because a piece 20% off the end still looks placed at its centre.
//
//   · ON TOP OF A NEIGHBOUR — two pieces in the same place. Not an occlusion
//     bug at all: both quads are backed by the same wall and both march out
//     clean, so the three checks above pass a piece printed straight through
//     another one. With `depthWrite: false` on the spray material, overlap order
//     is draw order and the pair blends into a muddle. This one was added
//     because it caught a real defect the moment it existed — four burners
//     relocated into what looked like the gaps in a band, on the wrong side of
//     that facade's `along` axis, landing on four existing pieces.
//     Reported for every overlapping pair and FAILED past 25% of the smaller
//     piece, because a small overlap is deliberate here: writers paint next to
//     each other and over each other, and `DECALS` says so out loud.
//
// The predicate `insideSolid` is spot-map.html's, deliberately verbatim: the
// spot's own solids plus the facades' bands, fascia signs and drainpipes. A
// wall's furniture has to be in that list or the check is a check of the wrong
// thing — which is the lesson written at `shopfrontsOf`.

import { register } from "node:module";

register(new URL("./ts-resolve.mjs", import.meta.url));

const { SOLIDS, topOf } = await import("../src/world/spot.ts");
const {
  DECALS,
  FACADES,
  BAND_DEPTH,
  SKIN,
  bandsOf,
  shopfrontsOf,
  drainpipesOf,
} = await import("../src/world/props.ts");

const args = process.argv.slice(2);
const only = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;
const quiet = args.includes("--quiet");

// ---------------------------------------------------------------------------
// what counts as matter
// ---------------------------------------------------------------------------

/** Is (x,y,z) inside solid matter — a spot solid, or a facade's own skin? */
function insideSolid(x, y, z) {
  for (const s of SOLIDS) {
    const top = topOf(s, x, z);
    if (top !== null && y <= top + 1e-4 && y >= s.base - 1e-4) return s.id;
  }
  for (let fi = 0; fi < FACADES.length; fi++) {
    const f = FACADES[fi];
    const c = Math.cos(f.yaw);
    const sn = Math.sin(f.yaw);
    const dx = x - f.x;
    const dz = z - f.z;
    // Inverse of onWall(): along runs with +c/-s, out runs with +s/+c.
    const along = c * dx - sn * dz;
    const outward = sn * dx + c * dz;
    if (Math.abs(along) > f.width / 2) continue;
    for (const b of bandsOf(f)) {
      if (y < b.y - b.h / 2 || y > b.y + b.h / 2) continue;
      if (outward > b.proud - BAND_DEPTH / 2 && outward < b.proud + BAND_DEPTH / 2) {
        return `facade${fi}-band@${b.y.toFixed(2)}`;
      }
    }
    for (const s of shopfrontsOf(f)) {
      if (Math.abs(along - s.along) > s.half) continue;
      if (y < s.y0 || y > s.y1) continue;
      if (outward > s.out0 && outward < s.out1) return `facade${fi}-fascia`;
    }
    for (const p of drainpipesOf(f, fi)) {
      if (Math.abs(along - p.along) > p.half) continue;
      if (outward > p.out0 && outward < p.out1) return `facade${fi}-drainpipe`;
    }
  }
  return null;
}

/**
 * Distance from `p` along `d` to the first matter, and what it was.
 *
 * Two step sizes and that is the whole reason the number is trustworthy at both
 * ends: 2 mm out to 0.5 m resolves a 5 cm stand-off to better than the paint
 * layer's own thickness, and 2 cm out to 6 m still finds a deck a tag is
 * floating two metres above. One step size cannot do both — 2 mm over 6 m is
 * 3000 `insideSolid` calls per sample point across 150 solids.
 */
function march(px, py, pz, dx, dy, dz, far) {
  for (let s = 0.002; s <= Math.min(0.5, far); s += 0.002) {
    const hit = insideSolid(px + dx * s, py + dy * s, pz + dz * s);
    if (hit) return { at: s, hit };
  }
  for (let s = 0.51; s <= far; s += 0.01) {
    const hit = insideSolid(px + dx * s, py + dy * s, pz + dz * s);
    if (hit) return { at: s, hit };
  }
  return { at: Infinity, hit: null };
}

// ---------------------------------------------------------------------------
// the measurement
// ---------------------------------------------------------------------------

/** How far in front of a wall its own skin may stand before it is furniture. */
const SKIN_DEPTH = 0.6;
/** How far back a march looks. A flat tag can be metres off its deck. */
const MARCH_BACK = 6.0;
/**
 * What "on the surface" means, in metres of tolerance.
 *
 * Not a taste either: `SKIN.paint` is 0.05 and `onSolid`/`onWall` both place at
 * exactly that, so a correct piece measures 0.05 to three decimals and the only
 * error a legal placement can carry is the 2 mm march step. 2 cm leaves room
 * for the flat tags (laid at 0.014) and for a sloping deck under a 3.5 m quad,
 * and still fails a piece 3 cm off its wall.
 */
const TOL = 0.02;

const rows = [];
for (const d of DECALS) {
  if (only && !d.id.includes(only)) continue;
  // Outward normal. A wall piece's yaw is measured so 0 looks down +Z (the
  // `Decal` doc's own words), which is exactly what buildPaint() writes into
  // the merged geometry — so this is the same vector the renderer uses.
  const n = d.flat ? [0, 1, 0] : [Math.sin(d.yaw), 0, Math.cos(d.yaw)];
  const c = Math.cos(d.yaw);
  const sn = Math.sin(d.yaw);

  let backMin = Infinity;
  let backMax = -Infinity;
  let unbacked = 0;
  let occluded = 0;
  let pts = 0;
  let backHit = "";
  let frontHit = "";
  // 9 x 5 over 96% of the quad: a piece can be clear at its centre and off the
  // end of its face at one corner, and the corners are where that happens.
  for (let iu = 0; iu <= 8; iu++) {
    for (let iv = 0; iv <= 4; iv++) {
      const su = (iu / 8 - 0.5) * d.w * 0.96;
      const sv = (iv / 4 - 0.5) * d.h * 0.96;
      const px = d.flat ? d.x + c * su - sn * sv : d.x + c * su;
      const py = d.flat ? d.y : d.y + sv;
      const pz = d.flat ? d.z + sn * su + c * sv : d.z - sn * su;
      pts++;
      const back = march(px, py, pz, -n[0], -n[1], -n[2], MARCH_BACK);
      if (back.at === Infinity) unbacked++;
      else {
        if (back.at < backMin) {
          backMin = back.at;
          backHit = back.hit;
        }
        if (back.at > backMax) backMax = back.at;
      }
      const front = march(px, py, pz, n[0], n[1], n[2], SKIN_DEPTH);
      if (front.at !== Infinity) {
        occluded++;
        frontHit = front.hit;
      }
    }
  }

  const occl = occluded / pts;
  const off = unbacked / pts;
  // The headline number is the WORST sample, signed: how much air is behind the
  // furthest-off corner. `backMax` and not the mean, because a piece 20 cm off
  // its wall at one end is wrong whatever its centre does.
  const gap = unbacked === pts ? Infinity : backMax;
  let verdict = "ok";
  let note = "";
  if (unbacked === pts) {
    verdict = "FLOATING";
    note = `nothing behind it within ${MARCH_BACK} m`;
  } else if (off > 0.001) {
    verdict = "OFF THE END";
    note = `${(off * 100).toFixed(0)}% of the quad has no surface behind it`;
  } else if (gap > TOL + SKIN.paint) {
    verdict = "FLOATING";
    note = `${(gap - SKIN.paint).toFixed(3)} m clear of ${backHit}`;
  } else if (occl > 0.001) {
    verdict = "BURIED";
    note = `${(occl * 100).toFixed(0)}% behind ${frontHit}`;
  }
  rows.push({ d, gap, backMin, occl, off, verdict, note, backHit, frontHit });
}

// ---------------------------------------------------------------------------
// …and no piece printed on top of another one
// ---------------------------------------------------------------------------

/**
 * How far apart two quads' planes may be and still be the same wall. The paint
 * layer is 0.05 and the courses step it out to 0.58, so 0.3 keeps a piece on the
 * plinth from being compared against one on the bare brick above it — those two
 * genuinely are different surfaces, half a metre apart.
 */
const SAME_PLANE = 0.3;
/** Overlap past this fraction of the smaller piece is a muddle, not a layering. */
const OVERLAP_FAIL = 0.25;

/** The four corners of a decal in its own plane's (along, up) frame. */
function span(d) {
  // `along` measured on the shared axis perpendicular to the normal. For a flat
  // piece there are two of them, so the flats are compared as XZ rectangles.
  return { a0: -d.w / 2, a1: d.w / 2, y0: d.y - d.h / 2, y1: d.y + d.h / 2 };
}

/** Overlap of [a0,a1] with [b0,b1]. */
const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

const clashes = [];
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i].d;
    const b = rows[j].d;
    if (!!a.flat !== !!b.flat) continue;
    let area = 0;
    if (!a.flat) {
      // Same facing, and the same plane rather than one in front of the other.
      // Compared as NORMALS rather than as an angle difference: the first version
      // of this line normalised the difference into [0, π] and then tested it
      // against π instead of 0, so it skipped every same-yaw pair — i.e. every
      // pair it exists to look at, and the whole check reported "no piece touches
      // another" over a wall with a known 0.3 m overlap on it.
      const n = [Math.sin(a.yaw), 0, Math.cos(a.yaw)];
      if (n[0] * Math.sin(b.yaw) + n[2] * Math.cos(b.yaw) < 0.9999) continue;
      // Distance between the two planes, along the shared normal.
      const off = (b.x - a.x) * n[0] + (b.z - a.z) * n[2];
      if (Math.abs(off) > SAME_PLANE) continue;
      // …and where b sits along a's own face.
      const t = [Math.cos(a.yaw), 0, -Math.sin(a.yaw)];
      const along = (b.x - a.x) * t[0] + (b.z - a.z) * t[2];
      const sa = span(a);
      const sb = span(b);
      area = ov(sa.a0, sa.a1, along + sb.a0, along + sb.a1) * ov(sa.y0, sa.y1, sb.y0, sb.y1);
    } else {
      if (Math.abs(a.y - b.y) > SAME_PLANE) continue;
      // Two rotated rectangles on the floor. Sampled rather than solved: a
      // separating-axis area is fiddly and this is a 90 x 90 check run by hand.
      const N = 24;
      let hit = 0;
      const cb = Math.cos(b.yaw);
      const sb2 = Math.sin(b.yaw);
      const ca = Math.cos(a.yaw);
      const sa2 = Math.sin(a.yaw);
      for (let p = 0; p < N; p++) {
        for (let q = 0; q < N; q++) {
          const u = ((p + 0.5) / N - 0.5) * a.w;
          const v = ((q + 0.5) / N - 0.5) * a.h;
          const x = a.x + ca * u - sa2 * v;
          const z = a.z + sa2 * u + ca * v;
          // …into b's frame.
          const dx = x - b.x;
          const dz = z - b.z;
          const bu = cb * dx + sb2 * dz;
          const bv = -sb2 * dx + cb * dz;
          if (Math.abs(bu) <= b.w / 2 && Math.abs(bv) <= b.h / 2) hit++;
        }
      }
      area = (hit / (N * N)) * a.w * a.h;
    }
    if (area <= 1e-6) continue;
    const frac = area / Math.min(a.w * a.h, b.w * b.h);
    clashes.push({ a: a.id, b: b.id, frac });
  }
}

// ---------------------------------------------------------------------------
// the report
// ---------------------------------------------------------------------------

const W = (s, n) => String(s).padEnd(n);
const N = (v, n, p = 3) =>
  (v === Infinity ? "—" : v === -Infinity ? "—" : v.toFixed(p)).padStart(n);

console.log("=== EVERY DECAL vs THE SURFACE IT CLAIMS TO BE ON ==================");
console.log(`  expected stand-off: wall/solid paint ${SKIN.paint} m · flat tags off their deck`);
console.log(`  gap = worst sample's air behind the quad · +ve floats · occl = matter in front`);
console.log("");
console.log(
  `  ${W("piece", 22)}${W("art", 4)}${W("position", 26)}${"gap".padStart(8)}` +
    `${"occl".padStart(7)}${"off".padStart(6)}  host / verdict`,
);
let bad = 0;
for (const r of rows) {
  if (r.verdict !== "ok") bad++;
  if (quiet && r.verdict === "ok") continue;
  const pos = `(${r.d.x.toFixed(2)}, ${r.d.y.toFixed(2)}, ${r.d.z.toFixed(2)})`;
  const host = r.backHit || "—";
  const tail = r.verdict === "ok" ? `${host}` : `${host}  ← ${r.verdict}: ${r.note}`;
  console.log(
    `  ${W(r.d.id, 22)}${W(r.d.art, 4)}${W(pos, 26)}${N(r.gap, 8)}` +
      `${N(r.occl * 100, 6, 0)}%${N(r.off * 100, 5, 0)}%  ${tail}`,
  );
}
console.log("");
console.log(`  → ${rows.length - bad}/${rows.length} placed on the surface they name.`);

console.log("");
console.log("=== …AND NOT PRINTED ON TOP OF EACH OTHER =========================");
let muddles = 0;
for (const c of clashes.sort((p, q) => q.frac - p.frac)) {
  const fail = c.frac > OVERLAP_FAIL;
  if (fail) muddles++;
  console.log(
    `  ${W(c.a, 22)}${W(c.b, 22)}${(c.frac * 100).toFixed(0).padStart(4)}% of the smaller` +
      (fail ? "  ← MUDDLE" : "  · layered, fine"),
  );
}
if (!clashes.length) console.log("  no piece touches another.");
console.log("");
console.log(`  → ${muddles} muddled pair(s), ${clashes.length - muddles} deliberately layered.`);
process.exitCode = bad || muddles ? 1 : 0;
