// tools/png-diff.mjs — count the pixels that differ between two captures.
//
// This exists for one promise, made to the player about the mobile work:
// *"It is very important that the desktop graphics are not affected and do not
// change at all, because the desktop graphics are currently perfect."* A lane
// can only ever ARGUE that; this measures it.
//
//   node tools/png-diff.mjs a.png b.png [--tol 0] [--out diff.png]
//
// Prints: pixels compared, pixels differing, the worst single-channel delta, and
// where the worst one is. Exit 0 when nothing differs beyond `--tol`, 1 when
// something does — so it can gate a shell pipeline.
//
// ## The noise floor comes first, and it is not optional
//
// A running game is not a still life: clouds drift, litter animates, the
// governor's own clock decides a DPR, and a GPU is free to round a blend
// differently on two draws of the same scene. So the number this prints is only
// meaningful next to the number you get diffing TWO CAPTURES OF THE SAME BUILD
// taken the same way. Measure that first. If same-build is 0, then a non-zero
// after/before diff is a real change and the count is the size of it. If
// same-build is not 0, this tool cannot answer the question by itself and the
// desktop-identity gate has to fall back on diffing the resolved tier
// configuration instead — which is exact, deterministic, and blind to anything
// that does not go through the tier table.
//
// `--tol n` allows a per-channel delta of n before a pixel counts as different.
// Use 0 for the gate. Anything above 0 is a measurement, not a proof, and the
// output says so.
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const [aPath, bPath] = process.argv.slice(2).filter((s) => !s.startsWith("--"));
const argOf = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const TOL = Number(argOf("tol", 0));
const OUT = argOf("out", null);

if (!aPath || !bPath) {
  console.error("usage: node tools/png-diff.mjs a.png b.png [--tol 0] [--out diff.png]");
  process.exit(2);
}

const a = PNG.sync.read(readFileSync(aPath));
const b = PNG.sync.read(readFileSync(bPath));

if (a.width !== b.width || a.height !== b.height) {
  console.log(`SIZE MISMATCH  ${a.width}x${a.height}  vs  ${b.width}x${b.height}`);
  console.log("Not comparable — capture both at the same viewport and DPR.");
  process.exit(1);
}

const n = a.width * a.height;
let differing = 0;
let worst = 0;
let worstAt = [0, 0];
let sum = 0;
const diff = OUT ? new PNG({ width: a.width, height: a.height }) : null;

for (let i = 0; i < n; i++) {
  const o = i * 4;
  let d = 0;
  for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[o + c] - b.data[o + c]));
  sum += d;
  if (d > worst) {
    worst = d;
    worstAt = [i % a.width, Math.floor(i / a.width)];
  }
  if (d > TOL) differing++;
  if (diff) {
    // Differences in red at their own magnitude, over a dimmed copy of `a`, so
    // a glance says WHERE as well as how much.
    const lit = d > TOL;
    diff.data[o] = lit ? 255 : a.data[o] >> 2;
    diff.data[o + 1] = lit ? Math.max(0, 255 - d * 4) : a.data[o + 1] >> 2;
    diff.data[o + 2] = lit ? Math.max(0, 255 - d * 4) : a.data[o + 2] >> 2;
    diff.data[o + 3] = 255;
  }
}

if (diff) writeFileSync(OUT, PNG.sync.write(diff));

const pct = ((differing / n) * 100).toFixed(4);
console.log(`${aPath.split("/").pop()}  vs  ${bPath.split("/").pop()}`);
console.log(`  size            ${a.width}x${a.height}  (${n} px)`);
console.log(`  differing       ${differing}  (${pct}%)   tolerance ${TOL}`);
console.log(`  worst delta     ${worst} on one channel, at ${worstAt[0]},${worstAt[1]}`);
console.log(`  mean delta      ${(sum / n).toFixed(4)}`);
if (OUT) console.log(`  diff written    ${OUT}`);
if (TOL > 0) console.log(`  NOTE: tolerance is above 0 — this is a measurement, not the gate.`);
process.exit(differing === 0 ? 0 : 1);
