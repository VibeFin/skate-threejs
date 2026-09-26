// The whole loop-window decision for one generated music bed, in one run.
//
// `loop-fit.mjs` answers "does this track repeat, and roughly where" and its
// tempo line is an onset autocorrelation, which lands on an octave of the real
// tempo as often as on the tempo (hi-hats read as the beat). That is fine for
// triage and useless for picking a window, because a window has to be a whole
// number of BARS and a bar you got wrong by a factor of two puts every candidate
// at a half-bar.
//
// So this tool does not trust the ACF. It takes the correlation sweep's own peak
// positions — which are properties of the music, not of a tempo guess — and asks
// which bar length makes the MOST of them land on integers. A comb that fits a
// dozen independent peaks is a measurement; a single autocorrelation lag is a
// vote. Then it ranks the bar-aligned windows the way the previous track was
// decided: by rendering the actual equal-power crossfade and diffing its 20 ms
// envelope against the same moment played straight through, because correlation
// finds a matching INSTANT and the player hears 300 ms.
//
//   node tools/loop-window.mjs <file.mp3> [overlap-seconds]
import { spawnSync } from "node:child_process";

const SR = 22050;
const file = process.argv[2];
const OV = Number(process.argv[3] ?? 0.3);

const dec = spawnSync(
  "ffmpeg",
  ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"],
  { maxBuffer: 1 << 30 },
);
if (dec.status !== 0) { console.error(dec.stderr.toString()); process.exit(1); }
const b = dec.stdout;
const x = new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
const dur = x.length / SR;

const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));
function corr(a, c, n) {
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += x[a + i]; sb += x[c + i]; }
  const ma = sa / n, mb = sb / n;
  let nu = 0, da = 0, dd = 0;
  for (let i = 0; i < n; i++) {
    const u = x[a + i] - ma, v = x[c + i] - mb;
    nu += u * v; da += u * u; dd += v * v;
  }
  return da > 0 && dd > 0 ? nu / Math.sqrt(da * dd) : 0;
}

let firstAudible = 0;
for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.003) { firstAudible = i / SR; break; }

// --- the peak comb -----------------------------------------------------------
const WIN = Math.round(1.0 * SR), STEP = Math.round(0.002 * SR);
const pts = [0.5, 3.0, 6.0, 9.0, 12.0];
const acc = new Map();
for (const s of pts) {
  const a = Math.round(s * SR);
  for (let L = Math.round(4 * SR); a + L + WIN < x.length; L += STEP) {
    acc.set(L, (acc.get(L) ?? 0) + corr(a, a + L, WIN) / pts.length);
  }
}
const ranked = [...acc.entries()].map(([L, c]) => ({ L: L / SR, c })).sort((p, q) => q.c - p.c);
const peaks = [];
for (const r of ranked) {
  if (peaks.every((p) => Math.abs(p.L - r.L) > 0.4)) peaks.push(r);
  if (peaks.length >= 24) break;
}

// Which bar length lands the most peaks on integers, weighted by how strong each
// peak is? Sweep bars over every tempo a piece of music plausibly sits at.
let comb = { bar: 0, score: -1, bpm: 0 };
for (let bpm = 60; bpm <= 200; bpm += 0.05) {
  const bar = (60 / bpm) * 4;
  let score = 0;
  for (const p of peaks) {
    const n = p.L / bar;
    if (n < 2) continue;
    const off = Math.abs(n - Math.round(n));       // 0 = dead on a bar
    if (off < 0.06) score += p.c * (1 - off / 0.06);
  }
  if (score > comb.score) comb = { bar, score, bpm };
}

console.log(`file             ${file.split("/").pop()}`);
console.log(`duration         ${dur.toFixed(3)} s`);
console.log(`first audible    ${firstAudible.toFixed(3)} s`);
console.log(`bar from comb    ${comb.bar.toFixed(6)} s  =  ${comb.bpm.toFixed(2)} BPM  (fit ${comb.score.toFixed(2)})`);
console.log(`  peaks it explains, of the ${peaks.length} strongest:`);
for (const p of peaks.slice(0, 10)) {
  const n = p.L / comb.bar;
  const on = Math.abs(n - Math.round(n)) < 0.06;
  console.log(`    ${p.L.toFixed(3)}s  corr ${p.c.toFixed(3)}  = ${n.toFixed(2)} bars${on ? `  <- ${Math.round(n)}` : ""}`);
}

// --- rank bar-aligned windows by the RENDERED splice -------------------------
function env(sig) {
  const w = Math.round(0.02 * SR), out = [];
  for (let i = 0; i + w < sig.length; i += w) {
    let s = 0; for (let j = 0; j < w; j++) s += sig[i + j] * sig[i + j];
    out.push(db(Math.sqrt(s / w)));
  }
  return out;
}
function joined(start, end) {
  const n = Math.round(1.2 * SR), pre = Math.round(0.45 * SR), out = new Float32Array(n);
  const a0 = Math.round((end - OV - 0.45) * SR), f0 = Math.round((start - 0.45) * SR);
  const ov = Math.round(OV * SR);
  for (let i = 0; i < n; i++) {
    const lead = x[a0 + i] ?? 0;
    if (i < pre) { out[i] = lead; continue; }
    const k = i - pre;
    if (k < ov) {
      const t = k / ov;
      out[i] = lead * Math.cos((t * Math.PI) / 2) + (x[f0 + pre + k] ?? 0) * Math.sin((t * Math.PI) / 2);
    } else out[i] = x[f0 + pre + k] ?? 0;
  }
  return out;
}
function straight(end, L) {
  const n = Math.round(1.2 * SR), o = new Float32Array(n);
  const a0 = Math.round((end - OV - 0.45 - L) * SR);
  for (let i = 0; i < n; i++) o[i] = x[a0 + i] ?? 0;
  return o;
}

const bar = comb.bar;
// One bar past the encoder's silence, so the splice lands on a downbeat with the
// kick's attack intact instead of shaving its front.
const startBase = Math.ceil((firstAudible + 0.05) / 0.001) * 0.001;
const rows = [];
for (const startBars of [0, 1, 2]) {
  const start = Number((startBase + startBars * bar).toFixed(3));
  for (let nb = 4; nb * bar + start + OV < dur; nb++) {
    const L = nb * bar, end = start + L + OV;
    const j = env(joined(start, end)), s = env(straight(end, L));
    const i0 = Math.round(0.45 / 0.02), i1 = Math.round((0.45 + OV) / 0.02);
    let worst = 0, sum = 0, cnt = 0, nat = 0;
    for (let i = i0; i <= i1 && i < j.length && i < s.length; i++) {
      const dv = Math.abs(j[i] - s[i]);
      if (dv > worst) worst = dv;
      sum += dv; cnt++;
      if (i + 1 < s.length) nat = Math.max(nat, Math.abs(s[i + 1] - s[i]));
    }
    if (!cnt) continue;
    rows.push({ start, nb, L, end, mean: sum / cnt, worst, nat });
  }
}
rows.sort((p, q) => p.mean - q.mean);
console.log(`\nbar-aligned windows, best RENDERED splice first (overlap ${OV}s):`);
console.log(`  start    bars   loop L      end        mean dev   worst    groove's own 20ms swing`);
for (const r of rows.slice(0, 12)) {
  console.log(
    `  ${r.start.toFixed(3)}   ${String(r.nb).padStart(3)}   ${r.L.toFixed(3)}s   ${r.end.toFixed(3)}s   ${r.mean.toFixed(2)} dB    ${r.worst.toFixed(2)} dB   ${r.nat.toFixed(2)} dB` +
      (r.nb % 4 === 0 ? "   (4-bar phrase)" : ""),
  );
}
console.log(`\nLonger is better for repetition; a mean deviation well under the groove's own`);
console.log(`swing means there is nothing to hear at the join. Weigh both, don't just take row 1.`);
