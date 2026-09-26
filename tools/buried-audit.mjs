// tools/buried-audit.mjs — WHICH wall dressing is buried, band by band.
//
// This is a REVIEW tool, not game code. It adds nothing to the bundle and the
// game exposes nothing new for it: every value below comes from exports that
// already existed (`FACADES`, `bandsOf`, `BAND_DEPTH`, `SKIN`, `facadeFront`
// from `world/props.ts`; `SOLIDS`, `topOf` from `world/spot.ts`), imported
// through the dev server the same way the game imports them. The predicate is
// RE-IMPLEMENTED here from those primitives rather than imported, so this is an
// independent check of `props.ts`'s own `buriedRun` and not a tautology.
//
// WHY IT EXISTS. Gating facade 0's buried ground floor cut FOUR band boxes out
// of the shadow pass when the intent was ONE. Four could be correct — the north
// 18 m of both side walls are also behind the back ramp's deck — or it could be
// geometry quietly vanishing off a wall the player can see. "Could be" is not
// good enough for a change sold as pixel-identical, so this prints the verdict
// for every facade, every band and every run, with the fill height that decided
// it, and lets a human read it.
//
//   node tools/buried-audit.mjs
//
// FLAGS
//   --url <u>   default http://localhost:5173/?genex_local_test=1
//   --samples n samples across a run (default 17, matching props.ts)

import { chromium } from "playwright-core";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const URL_ = arg("url", "http://localhost:5173/?genex_local_test=1");
const SAMPLES = Number(arg("samples", 17));

const context = await chromium.launchPersistentContext(
  join(tmpdir(), "buried-audit-profile"),
  { executablePath: CHROME, headless: true, args: ["--use-angle=metal", "--mute-audio"] },
);
const page = context.pages()[0] ?? (await context.newPage());
// A blank page on the dev server's origin: we want the module graph, not a boot.
await page.goto(URL_.replace(/\?.*$/, "") + "?genex_local_test=1", {
  waitUntil: "domcontentloaded",
});

const rows = await page.evaluate(async (samples) => {
  const props = await import("/src/world/props.ts");
  const spot = await import("/src/world/spot.ts");
  const { FACADES, bandsOf, BAND_DEPTH, SKIN, facadeFront } = props;
  const { SOLIDS, topOf } = spot;

  // The same two helpers props.ts now has, written out again from primitives.
  const fillAt = (fi, along, out) => {
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
  };
  const MARGIN = 0.1;

  const out = [];
  for (let fi = 0; fi < FACADES.length; fi++) {
    const f = FACADES[fi];
    const runs = f.gap
      ? [[-f.width / 2, f.gap[0]], [f.gap[1], f.width / 2]]
      : [[-f.width / 2, f.width / 2]];
    const bands = bandsOf(f);
    for (let bi = 0; bi < bands.length; bi++) {
      const b = bands[bi];
      for (const [a0, a1] of runs) {
        if (a1 - a0 < 0.1) continue;
        const yTop = b.y + b.h / 2;
        const o = b.proud + BAND_DEPTH / 2;
        let lowest = Infinity;
        let highest = -Infinity;
        for (let i = 0; i < samples; i++) {
          const along = a0 + ((a1 - a0) * i) / (samples - 1);
          const v = fillAt(fi, along, o);
          lowest = Math.min(lowest, v);
          highest = Math.max(highest, v);
        }
        out.push({
          kind: ["plinth", "string", "cornice"][bi] ?? `band${bi}`,
          fi, a0, a1, yTop, out: o, lowest, highest,
          buried: lowest >= yTop + MARGIN,
          x: f.x, z: f.z, yaw: f.yaw, width: f.width, height: f.height,
        });
      }
    }
    // the grime veil, same test as props.ts applies to it
    for (const [a0, a1] of runs) {
      if (a1 - a0 < 0.1) continue;
      const o = facadeFront(f, 0, 1.8) + SKIN.grime;
      let lowest = Infinity;
      let highest = -Infinity;
      for (let i = 0; i < samples; i++) {
        const along = a0 + ((a1 - a0) * i) / (samples - 1);
        const v = fillAt(fi, along, o);
        lowest = Math.min(lowest, v);
        highest = Math.max(highest, v);
      }
      out.push({
        kind: "grime", fi, a0, a1, yTop: 1.8, out: o, lowest, highest,
        buried: lowest >= 1.8 + MARGIN,
        x: f.x, z: f.z, yaw: f.yaw, width: f.width, height: f.height,
      });
    }
  }
  return out;
}, SAMPLES);

console.log(`\nburied-audit — ${SAMPLES} samples per run, margin 0.10 m\n`);
console.log("  f  piece    run (along)        top    out   fill lo   fill hi   VERDICT");
console.log("  " + "-".repeat(76));
let buried = 0;
for (const r of rows) {
  if (r.buried) buried += 1;
  console.log(
    `  ${r.fi}  ${r.kind.padEnd(8)} ` +
    `${`${r.a0.toFixed(1)}…${r.a1.toFixed(1)}`.padEnd(16)} ` +
    `${r.yTop.toFixed(2).padStart(6)} ${r.out.toFixed(2).padStart(6)} ` +
    `${r.lowest.toFixed(3).padStart(9)} ${r.highest.toFixed(3).padStart(9)}   ` +
    `${r.buried ? "*** BURIED — not drawn ***" : "drawn"}`,
  );
}
console.log("  " + "-".repeat(76));
console.log(`  ${buried} of ${rows.length} pieces buried\n`);
console.log("  facade geometry, for reading the verdicts:");
const seen = new Set();
for (const r of rows) {
  if (seen.has(r.fi)) continue;
  seen.add(r.fi);
  console.log(
    `    f${r.fi}: x ${r.x}  z ${r.z}  yaw ${(r.yaw * 180 / Math.PI).toFixed(0)}°  ` +
    `width ${r.width}  height ${r.height}`,
  );
}
await context.close();
