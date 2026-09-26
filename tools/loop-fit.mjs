// Loop-window fitter for a generated music bed.
//
// A looping gameplay track has to repeat on a BAR, not on a fade: the follower
// starts at `start` while the leader is still 300 ms short of `end`, so the
// distance `end - 0.3 - start` IS the loop and it must be a whole number of
// bars or every repeat drops the groove a fraction of a beat early.
//
// Two independent measurements, deliberately not derived from each other:
//   1. the LOOP LENGTH, by normalised cross-correlation — how well the audio a
//      distance L later matches the audio here, swept in fine steps;
//   2. the BEAT PERIOD, from the onset envelope's own autocorrelation, which
//      knows nothing about (1).
// If the best L is a whole number of bars at that tempo, the two agree and the
// window is real. If they disagree, say so rather than picking the prettier one.
import { spawnSync } from "node:child_process";

const file = process.argv[2];
const SR = 22050;

const dec = spawnSync(
  "ffmpeg",
  ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"],
  { maxBuffer: 1 << 30 },
);
if (dec.status !== 0) {
  console.error(dec.stderr.toString());
  process.exit(1);
}
const buf = dec.stdout;
const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
const dur = x.length / SR;

// --- where the music actually starts -----------------------------------------
// mp3 decoders insert silence at the head; the in-point has to clear it.
let firstAudible = 0;
for (let i = 0; i < x.length; i++) {
  if (Math.abs(x[i]) > 0.003) { firstAudible = i / SR; break; }
}
let lastAudible = dur;
for (let i = x.length - 1; i >= 0; i--) {
  if (Math.abs(x[i]) > 0.003) { lastAudible = i / SR; break; }
}

// --- 1. loop length by correlation -------------------------------------------
// Compare a window at s against the same-length window at s+L. Several
// in-points, because one lucky alignment is not a measurement.
function corr(aStart, bStart, n) {
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += x[aStart + i]; sb += x[bStart + i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const u = x[aStart + i] - ma, v = x[bStart + i] - mb;
    num += u * v; da += u * u; db += v * v;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

const WIN = Math.round(1.0 * SR);          // 1 s of comparison
const STEP = Math.round(0.002 * SR);        // 2 ms, as the previous track used
const inPoints = [0.5, 3.0, 6.0, 9.0];     // seconds into the file
const minL = 8, maxL = dur - 2.5;

const scores = new Map();
for (const s of inPoints) {
  const a = Math.round(s * SR);
  for (let L = Math.round(minL * SR); L + a + WIN < x.length; L += STEP) {
    if (L / SR > maxL) break;
    const c = corr(a, a + L, WIN);
    const key = L;
    scores.set(key, (scores.get(key) ?? 0) + c / inPoints.length);
  }
}
const ranked = [...scores.entries()]
  .map(([L, c]) => ({ L: L / SR, c }))
  .sort((p, q) => q.c - p.c);

// Keep only peaks that are locally maximal, so a 2 ms neighbour of the winner
// does not fill the whole top ten.
const peaks = [];
for (const r of ranked) {
  if (peaks.every((p) => Math.abs(p.L - r.L) > 0.5)) peaks.push(r);
  if (peaks.length >= 8) break;
}

// --- 2. beat period from the onset envelope ----------------------------------
const HOP = 256;
const frames = Math.floor(x.length / HOP);
const env = new Float32Array(frames);
for (let f = 0; f < frames; f++) {
  let e = 0;
  for (let i = 0; i < HOP; i++) e += x[f * HOP + i] * x[f * HOP + i];
  env[f] = Math.sqrt(e / HOP);
}
// half-wave-rectified first difference — onsets only
const onset = new Float32Array(frames);
for (let f = 1; f < frames; f++) onset[f] = Math.max(0, env[f] - env[f - 1]);
const om = onset.reduce((a, b) => a + b, 0) / frames;
for (let f = 0; f < frames; f++) onset[f] -= om;

function acf(lag) {
  let n = 0, d1 = 0, d2 = 0;
  for (let f = 0; f + lag < frames; f++) {
    n += onset[f] * onset[f + lag]; d1 += onset[f] * onset[f]; d2 += onset[f + lag] * onset[f + lag];
  }
  return d1 > 0 && d2 > 0 ? n / Math.sqrt(d1 * d2) : 0;
}
const fps = SR / HOP;
let best = { bpm: 0, c: -1 };
for (let bpm = 60; bpm <= 200; bpm += 0.1) {
  const lag = Math.round((60 / bpm) * fps);
  const c = acf(lag);
  if (c > best.c) best = { bpm, c };
}

console.log(`file            ${file.split("/").pop()}`);
console.log(`duration        ${dur.toFixed(3)} s`);
console.log(`first audible   ${firstAudible.toFixed(3)} s`);
console.log(`last audible    ${lastAudible.toFixed(3)} s`);
console.log(`beat (onset ACF) ${best.bpm.toFixed(1)} BPM  (corr ${best.c.toFixed(3)})`);
const bar4 = (60 / best.bpm) * 4;
console.log(`one 4/4 bar     ${bar4.toFixed(3)} s`);
console.log(`\ncandidate loop lengths, best correlation first:`);
for (const p of peaks) {
  const bars = p.L / bar4;
  console.log(
    `  L = ${p.L.toFixed(3)} s   corr ${p.c.toFixed(3)}   = ${bars.toFixed(2)} bars` +
      (Math.abs(bars - Math.round(bars)) < 0.03 ? `  <- whole bars (${Math.round(bars)})` : ""),
  );
}
