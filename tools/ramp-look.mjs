// tools/ramp-look.mjs — LOOK at the north ramp, from the player's own angles.
//
// A REVIEW tool. It adds nothing to the bundle and the game exposes nothing for
// it: it drives `tools/spot-map.html`, which already builds the REAL scene —
// `createField()`'s sun, hemisphere, fog and sky, the real materials, the real
// dressing groups — and already publishes its scene and renderer on `window`
// for exactly this. Nothing here reaches into game code.
//
//   node tools/ramp-look.mjs --out shots/ramp8/before
//
// WHY IT EXISTS. `tools/shoot.mjs` is the right tool and it is the one that
// proves the RIDE. On 2026-07-30 it could not be used for a picture: the dev
// page wedges on the loader at 60% ("Lacing up…"), which is `main.ts`'s
// `Promise.all([boardJob, skaterJob, dressJob])` — three lanes are editing
// those files at the same time as this one. `tools/boot-probe.mjs` records it.
// A picture of the ramp does not need the skater, so this takes the picture
// from the scene the harness already builds, and `shoot.mjs` is re-run for the
// gameplay frame the moment the page boots again.
//
// The cameras are the player's, read off his own capture: low and ON the ramp
// looking along the wall, the two ends, and the whole object from the plaza.

import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const OUT = arg("out", "shots/ramp8/look");
// Pass `--url` when the dev server is not on :5173 — on 2026-07-30 it died and
// an unrelated Next.js app took the port. When there is no server at all, use
// `tools/back-shape.mjs`, which rasterises the same geometry offline; it cannot
// show materials or grading, and a capture from it must say so.
const URL_ = arg("url", "http://localhost:5173/tools/spot-map.html");
const READY = "spotScene";
const W = 1280;
const H = 800;

// name, camera (x, y, z), target (x, y, z).
//
// The lip is at z = 44.6 and the brick at z = 48. `on-the-ramp-wnw` is his own
// frame: eye height on the face, looking west-north-west ALONG the wall, which
// is the shot in which the whole object reads as one wedge. `corner-w` and
// `corner-e` are the two ends, which is the other half of his report.
const CAMS = [
  ["on-the-ramp-wnw", 6, 3.0, 43.6, -26, 3.2, 46.4],
  // …and the same place at RIDER eye height rather than a metre off the
  // concrete. The face at z = 43.6 stands at 1.96 m, so a rider's eye is at
  // 3.56 — just OVER the 3.40 m coping, which is the only height from which the
  // top of this ramp is visible at all. The metre-high version above is the
  // camera that cannot answer the player's question, and it is kept because it
  // is the one the first pass used and the pair is the point.
  ["rider-eye-wnw", 8, 3.6, 43.6, -24, 3.9, 45.8],
  ["on-the-deck-w", 2, 4.6, 46.6, -30, 4.4, 47.2],
  ["corner-w", -20, 2.2, 41.0, -36, 3.0, 45.6],
  ["corner-e", 18, 2.2, 41.0, 34, 3.0, 45.6],
  ["from-the-plaza", 2, 1.6, 33.0, 2, 2.6, 45.0],
  ["from-the-plaza-oblique", -16, 1.6, 33.5, 6, 2.4, 45.2],
  ["raking-along-the-wall", 26, 2.4, 42.6, -26, 3.4, 46.0],
];

await mkdir(dirname(OUT), { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
    "--mute-audio",
  ],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 120000 });
// `arg` is the SECOND parameter of waitForFunction, so the options object has to
// be third — passed second it is read as the argument and the wait silently
// keeps playwright's 30 s default, which is under this page's own build time.
await page
  .waitForFunction((k) => !!window[k] && !!window[`${k.slice(0, -5)}Renderer`], READY, { timeout: 240000 })
  .catch((e) => {
    // A page that never publishes its scene has usually thrown on the way there,
    // and the timeout on its own says nothing about which module. Print what the
    // page actually said before giving up.
    console.log(`the lab never published its scene: ${String(e.message).split("\n")[0]}`);
    if (errs.length) console.log(`page errors:\n  ${errs.slice(0, 10).join("\n  ")}`);
    else console.log("…and it reported no error at all — it is still building.");
    process.exit(1);
  });

for (const [name, cx, cy, cz, tx, ty, tz] of CAMS) {
  const data = await page.evaluate(
    async ([w, h, cx, cy, cz, tx, ty, tz, key]) => {
      const THREE = window.THREE ?? (await import("/node_modules/three/build/three.module.js"));
      const r = window[`${key.slice(0, -5)}Renderer`];
      const cam = new THREE.PerspectiveCamera(62, w / h, 0.1, 400);
      cam.position.set(cx, cy, cz);
      cam.lookAt(tx, ty, tz);
      r.setSize(w, h, false);
      r.render(window[key], cam);
      return r.domElement.toDataURL("image/png");
    },
    [W, H, cx, cy, cz, tx, ty, tz, READY],
  );
  const path = `${OUT}-${name}.png`;
  await writeFile(path, Buffer.from(data.split(",")[1], "base64"));
  console.log(`SHOT ${path}  cam (${cx}, ${cy}, ${cz}) → (${tx}, ${ty}, ${tz})`);
}
if (errs.length) console.log(`\npage errors:\n  ${errs.slice(0, 10).join("\n  ")}`);
await browser.close();
