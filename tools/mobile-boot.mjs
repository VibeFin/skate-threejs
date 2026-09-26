// tools/mobile-boot.mjs — why does the LOADER stick on a phone but not a desktop?
//
// A REVIEW tool. It adds nothing to the bundle and the game exposes nothing for
// it: the tier is pinned through the game's OWN persisted Quality setting
// (localStorage `genex:quality`, the same key the settings screen writes), the
// loader caption and bar are read off the DOM the player already sees, and the
// request table is the browser's own network log.
//
//   node tools/mobile-boot.mjs [--seconds 240] [--url ...] [--quality low]
//
// It exists because `tools/boot-probe.mjs` is desktop-only (1280x800, no touch,
// DPR 1) and the fault being chased is phone-gated by construction. Landscape
// 844x390 on purpose: the game refuses to play in portrait and the rotate-device
// overlay eats the DROP IN click.
//
// Every second it prints the loader's caption and bar width, whether DROP IN
// exists, and — the part a screenshot cannot give you — HOW MANY REQUESTS ARE
// STILL IN FLIGHT and how old the oldest one is. A bar pinned at one number
// with nothing in flight is a hang; a bar pinned with requests still arriving is
// starvation. Those are different bugs and they are not distinguishable by eye.

import { chromium } from "playwright-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const has = (n) => process.argv.includes(`--${n}`);

const URL_ = arg("url", "http://localhost:5173/?genex_local_test=1");
const SECONDS = Number(arg("seconds", 240));
const QUALITY = arg("quality", "low");
const PROFILE = arg("profile", "");

const contextOptions = {
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};
const launchArgs = [
  "--use-angle=metal",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
  "--autoplay-policy=no-user-gesture-required",
  "--mute-audio",
];

let context;
let browser;
if (PROFILE) {
  context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    headless: true,
    args: launchArgs,
    ...contextOptions,
  });
} else {
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: launchArgs });
  context = await browser.newContext(contextOptions);
}

const page = context.pages()[0] ?? (await context.newPage());

// The game's own Quality setting, written the same way the settings screen
// writes it. 'low' pins TIERS['phone-low'] — which is exactly what every touch
// device now gets on Auto anyway.
await page.addInitScript((q) => {
  try {
    if (q && q !== "auto") localStorage.setItem("genex:quality", q);
  } catch {
    /* storage blocked */
  }
}, QUALITY);

/** Every request, with the moment it started and the moment it finished. */
const reqs = new Map();
let seq = 0;
page.on("request", (r) => {
  reqs.set(r, { url: r.url(), t0: Date.now(), i: seq++, done: null, status: null });
});
page.on("requestfinished", (r) => {
  const e = reqs.get(r);
  if (e) {
    e.done = Date.now();
    e.status = r.response()?.status?.() ?? null;
  }
});
page.on("requestfailed", (r) => {
  const e = reqs.get(r);
  if (e) {
    e.done = Date.now();
    e.status = `FAIL ${r.failure()?.errorText ?? ""}`;
  }
});

const logs = [];
page.on("console", (m) => {
  const t = m.type();
  if (t === "error" || t === "warning" || m.text().includes("genex-quality")) {
    logs.push(`[${t}] ${m.text().slice(0, 200)}`);
  }
});
page.on("pageerror", (e) =>
  logs.push(`[pageerror] ${e.message}\n${(e.stack || "").split("\n").slice(0, 12).join("\n")}`),
);
page.on("worker", (w) => logs.push(`[worker created] ${w.url().slice(0, 80)}`));

await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 120000 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastBar = null;
let stuckFor = 0;

// The loader is built by the game's own boot, a few hundred ms after
// `domcontentloaded`. Waiting for it to APPEAR first is what stops "no #loader
// yet" from being read as "boot finished" — the mistake that made the first run
// of this tool report a healthy boot in zero seconds.
try {
  await page.waitForSelector("#loader", { state: "attached", timeout: 30000 });
  console.log(`loader appeared — document is ${page.url()}`);
} catch {
  console.log("!! #loader never appeared within 30 s — the page may not be the game at all");
  console.log(`   url is now: ${page.url()}`);
}

for (let t = 0; t < SECONDS; t++) {
  const state = await page
    .evaluate(() => {
      const loader = document.querySelector("#loader");
      const play = document.querySelector('[data-act="play"]');
      const bars = loader
        ? [...loader.querySelectorAll("*")].map((e) => e.style?.width).filter((w) => w && w.endsWith("%"))
        : [];
      const cap = loader ? (loader.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80) : null;
      return {
        loader: !!loader,
        gone: loader ? loader.classList.contains("gone") : null,
        bars,
        cap,
        play: !!play,
      };
    })
    .catch((e) => ({ err: String(e).slice(0, 120) }));

  const now = Date.now();
  const pending = [...reqs.values()].filter((e) => !e.done);
  const oldest = pending.length ? Math.max(...pending.map((e) => now - e.t0)) : 0;
  const bar = (state.bars || []).join(",");
  if (bar === lastBar) stuckFor++;
  else {
    stuckFor = 0;
    lastBar = bar;
  }

  console.log(
    `t=${String(t).padStart(3)}s loader=${state.loader ? (state.gone ? "FADING" : "up") : "GONE"} ` +
      `bar=${bar || "—"} stuck=${stuckFor}s inflight=${pending.length} oldest=${(oldest / 1000).toFixed(1)}s ` +
      `| ${state.cap ?? state.err ?? ""}`,
  );

  if (!state.loader) {
    console.log("\nLOADER GONE — boot completed.");
    break;
  }
  // A bar that has not moved for 25 s with NOTHING in flight is a wedge, not a
  // slow download. Dump what is still open and what the page said.
  if (stuckFor >= 25 && pending.length === 0) {
    console.log("\n*** WEDGED: bar frozen with zero requests in flight ***");
    break;
  }
  await sleep(1000);
}

const now = Date.now();
const pending = [...reqs.values()].filter((e) => !e.done);
if (pending.length) {
  console.log(`\nSTILL IN FLIGHT (${pending.length}):`);
  for (const e of pending.slice(0, 25)) {
    console.log(`  ${((now - e.t0) / 1000).toFixed(1)}s  ${e.url.slice(0, 140)}`);
  }
}
const ktx = [...reqs.values()].filter((e) => e.url.includes(".ktx2"));
if (ktx.length) {
  console.log(`\n.ktx2 REQUESTS (${ktx.length}):`);
  for (const e of ktx.slice(0, 30)) {
    console.log(`  ${e.done ? `${e.status}` : "PENDING"}  ${e.url.slice(-90)}`);
  }
}
// ── `--play`: a boot is only proved by RIDING it ───────────────────────────
//
// A loader that goes away proves the boot finished, not that the game came up.
// This drops in, holds W, reads the game's own speed readout and takes the
// frame. Note the readout is `display: none` under `@media (pointer: coarse)`
// (`hud.ts`) — the game hides it from touch players on purpose — so the NUMBER
// is read from the element and the SCREENSHOT is the scene. Both, or neither
// means anything.
if (has("play")) {
  const shot = arg("shot", "shots/mobile-play.png");
  try {
    await page.waitForSelector("#loader", { state: "detached", timeout: 240000 });
    await sleep(600);
    const play = await page.$('[data-act="play"]');
    if (play) await play.click();
    await sleep(1500);
    const key = (t) =>
      page.evaluate(
        (type) =>
          window.dispatchEvent(new KeyboardEvent(type, { code: "KeyW", key: "w", bubbles: true })),
        t,
      );
    // Read the speed and take the frame WHILE W IS STILL DOWN — release first
    // and the number you photograph is the number it decayed to.
    await key("keydown");
    await sleep(3000);
    const ride = await page.evaluate(() => {
      const n = document.querySelector("#speedo .n");
      const canvas = document.querySelector("canvas");
      return {
        speed: n ? n.textContent.trim() : "(no #speedo)",
        canvas: canvas ? `${canvas.width}x${canvas.height}` : "(no canvas)",
        hud: !!document.querySelector("#speed"),
      };
    });
    await page.screenshot({ path: shot });
    await key("keyup");
    console.log(`\nPLAY: speed=${ride.speed} km/h · canvas=${ride.canvas} · hud=${ride.hud}`);
    console.log(`shot: ${shot}`);
  } catch (e) {
    console.log(`\nPLAY FAILED: ${String(e).slice(0, 200)}`);
  }
}
if (logs.length) {
  console.log(`\nconsole (${logs.length}):`);
  for (const l of logs.slice(0, 60)) console.log(`  ${l}`);
}

await (browser ? browser.close() : context.close());
