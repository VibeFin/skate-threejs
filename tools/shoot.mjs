// tools/shoot.mjs — drive the REAL game in a real browser and capture frames.
//
// This is a REVIEW tool, not game code. It adds nothing to the bundle and the
// game exposes nothing for it: every step below goes through the same DOM the
// player uses — a click on DROP IN, real KeyboardEvents on window, real touch
// points on the canvas. That is the whole point. A critic that reads a
// builder's summary has verified nothing; a critic that presses W for three
// seconds and looks at the pixels has.
//
// Uses playwright-core against the Chrome already on this machine — no 150 MB
// browser download, no second engine.
//
//   node tools/shoot.mjs --out shots/roll.png --steps "drop, hold KeyW 3000, shot"
//
// STEPS (comma-separated, in order):
//   wait <ms>              let the game run
//   drop                   click DROP IN (the title screen's play button)
//   hold <Code> <ms>       keydown, wait, keyup
//   down <Code>            keydown, no release
//   up <Code>              keyup
//   tap <Code>             press and release (~60 ms)
//   move <dx> <dy>         mouse-move by this delta (free-look / camera)
//   mdown <btn> / mup <btn>  mouse button (0=left, 2=right)
//   touch <x> <y> <ms>     press a touch point at viewport % and hold it
//   swipe <x1> <y1> <x2> <y2> <ms>   drag a touch point across the screen
//   shot [name]            capture a PNG (numbered if the run takes several)
//   burst <n> <ms>         n shots <ms> apart — a filmstrip of one move
//   ready [ms]             block until the world is actually up (see --profile)
//
// FLAGS:
//   --url <u>        default http://localhost:5173/?genex_local_test=1
//   --out <path>     PNG path; a burst/multi-shot run appends -1, -2, …
//   --size WxH       viewport (default 1280x800)
//   --mobile         iPhone-class viewport + touch + DPR 3
//   --cpu <n>        CPU throttle rate (4 = 4x slower, phone-class)
//   --fps            print frame timings measured in-page over the run
//   --console        dump page console + errors to stderr
//   --timeout <ms>   boot timeout (default 60000)
//   --profile <dir>  reuse a Chrome profile across runs — a WARM HTTP CACHE
//   --assets <dir>   cache every assets.auras.cc fetch to disk and serve it
//                    from there — the network out of the experiment entirely
//
// ── WHY `--profile` AND `ready` EXIST, and why a fixed `wait` is not enough ──
//
// The DROP IN button appears LONG before the world does: `main.ts` builds the
// title screen, then awaits `Promise.all([boardJob, skaterJob, dressJob])`, and
// on a desktop tier those three are fetches of the un-rung originals from the
// CDN — the 8192x4096 skybox, a 22 MB rig, every base-colour texture. Measured
// on 2026-07-30 with a cold profile: seventeen of those requests were still in
// flight 45 s after `domcontentloaded`, and the page sat at "LACING UP… 60%"
// for as long as anything watched it. A run that clicks DROP IN and then waits
// a fixed number of milliseconds photographs the LOADER, not the game, and it
// does so without saying anything is wrong — which is exactly how three
// identical screenshots of a title card once got read as a boot wedge.
//
// So: `--profile <dir>` swaps `launch` for `launchPersistentContext`, which
// keeps Chrome's HTTP cache between runs. The first run into a fresh directory
// still pays the whole download; every run after it starts from disk. That
// changes no rendering input whatsoever — the same bytes arrive, from a closer
// place — which is the same argument `tools/desk-profile.mjs` makes for reusing
// its own profile, and it is what makes an A/B of two builds comparable at all.
//
// And `ready [ms]` waits for the loader to actually go (`#loader.gone`, set by
// `hud.setProgress(1, …)`) rather than for a guess. It throws if the deadline
// passes, because a capture run that quietly photographs a loading screen is
// worse than one that fails.

import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, basename, join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}
const has = (name) => process.argv.includes(`--${name}`);

const URL_ = arg("url", "http://localhost:5173/?genex_local_test=1");
const OUT = arg("out", "shots/shot.png");
const MOBILE = has("mobile");
const SIZE = arg("size", MOBILE ? "390x844" : "1280x800");
const [W, H] = String(SIZE).split("x").map(Number);
const CPU = Number(arg("cpu", 0)) || 0;
const TIMEOUT = Number(arg("timeout", 60000));
const PROFILE = typeof arg("profile", "") === "string" ? arg("profile", "") : "";
const ASSETS = typeof arg("assets", "") === "string" ? arg("assets", "") : "";
const STEPS = String(arg("steps", "drop, wait 1200, shot"));

const outDir = dirname(OUT);
const outBase = basename(OUT, extname(OUT));
let shotIndex = 0;
const written = [];

async function shoot(page, label) {
  shotIndex += 1;
  const name = label ? `${outBase}-${label}.png` : `${outBase}.png`;
  const path = join(outDir, shotIndex === 1 && !label ? `${outBase}.png` : name);
  const finalPath =
    shotIndex > 1 && !label ? join(outDir, `${outBase}-${shotIndex}.png`) : path;
  await page.screenshot({ path: finalPath });
  written.push(finalPath);
  return finalPath;
}

/** Real KeyboardEvents on window — the same ones a player's keyboard makes. */
const KEY_NAMES = {
  KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", KeyE: "e", KeyQ: "q",
  KeyR: "r", KeyV: "v", KeyF: "f", KeyC: "c", KeyZ: "z", KeyX: "x",
  Space: " ", ShiftLeft: "Shift", ControlLeft: "Control", Escape: "Escape",
  ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight", Digit1: "1", Digit2: "2", Digit3: "3",
};
async function keyEvent(page, type, code) {
  await page.evaluate(
    ([t, c, k]) => {
      const ev = new KeyboardEvent(t, {
        code: c, key: k, bubbles: true, cancelable: true,
        shiftKey: c === "ShiftLeft", repeat: false,
      });
      window.dispatchEvent(ev);
      document.dispatchEvent(ev);
    },
    [type, code, KEY_NAMES[code] ?? code],
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(outDir, { recursive: true });

  const launchArgs = [
    // Software WebGL is unusably slow for a real three.js scene; ask for the
    // GPU path headless Chrome normally declines to take.
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
  ];
  const contextOptions = {
    viewport: { width: W, height: H },
    deviceScaleFactor: MOBILE ? 3 : 1,
    isMobile: MOBILE,
    hasTouch: MOBILE,
    userAgent: MOBILE
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  };

  // A persistent context is the ONLY way to keep Chrome's HTTP cache between
  // runs — `browser.newContext()` is incognito by construction. See the header.
  let browser = null;
  let context;
  if (PROFILE) {
    context = await chromium.launchPersistentContext(PROFILE, {
      executablePath: CHROME,
      headless: true,
      args: launchArgs,
      ...contextOptions,
    });
  } else {
    browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: launchArgs,
    });
    context = await browser.newContext(contextOptions);
  }

  // ── THE GENERATED ASSETS, ON DISK ────────────────────────────────────────
  //
  // Every model, texture, skybox and rig in this game is a remote fetch from
  // `assets.auras.cc`, and `main.ts` blocks the loader on `Promise.all` over
  // three of them. Chrome's own cache (`--profile`) fixes that most of the time
  // — but "most of the time" is not a property a before/after comparison can be
  // built on: measured on 2026-07-30, roughly one run in three stalled at
  // "LACING UP… 60%" for 400 s with a WARM profile while several agents shared
  // the machine and the far end. A capture pair where one half booted from the
  // network and the other did not is not a pair.
  //
  // So `--assets <dir>` takes the network out of the experiment: the first run
  // through a fresh directory fetches each URL once and writes the bytes and the
  // content type beside it; every run after that is served from disk. The bytes
  // are the ones the CDN sent — this is a cache, not a substitute — so nothing
  // the renderer sees changes. It is also the only way the two halves of an A/B
  // provably load the SAME assets: a lane republishing a texture between two
  // runs would otherwise change the picture underneath the comparison.
  if (ASSETS) {
    await mkdir(ASSETS, { recursive: true });
    await context.route("**://assets.auras.cc/**", async (route) => {
      const url = route.request().url();
      const key = join(ASSETS, createHash("sha1").update(url).digest("hex"));
      try {
        const body = await readFile(key);
        const type = await readFile(`${key}.type`, "utf8").catch(() => "application/octet-stream");
        await route.fulfill({ status: 200, headers: { "content-type": type }, body });
        return;
      } catch {
        /* not cached yet — fall through and fetch it once */
      }
      const res = await route.fetch({ timeout: 180000 });
      const body = Buffer.from(await res.body());
      if (res.status() === 200) {
        await writeFile(key, body);
        await writeFile(`${key}.type`, res.headers()["content-type"] ?? "application/octet-stream");
      }
      await route.fulfill({ response: res, body });
    });
  }

  const page = context.pages()[0] ?? (await context.newPage());
  const errors = [];
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning" || has("console")) {
      errors.push(`[${t}] ${m.text()}`);
    }
  });

  if (CPU > 0) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  }

  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: TIMEOUT });

  // The loader hides itself when the world is up. Wait for the canvas AND for
  // the title screen's own button, which only exists once boot() got that far.
  await page.waitForSelector("canvas", { timeout: TIMEOUT });
  await page
    .waitForSelector('[data-act="play"]', { timeout: TIMEOUT })
    .catch(() => {});

  // In-page frame timing, measured over the whole run rather than sampled.
  if (has("fps")) {
    await page.evaluate(() => {
      const w = window;
      w.__frames = [];
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        w.__frames.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  const held = new Set();
  const steps = STEPS.split(",").map((s) => s.trim()).filter(Boolean);

  for (const step of steps) {
    const [op, ...rest] = step.split(/\s+/);
    switch (op) {
      case "wait":
        await sleep(Number(rest[0]) || 500);
        break;
      case "drop": {
        const btn = await page.$('[data-act="play"]');
        if (btn) await btn.click();
        else await page.mouse.click(W / 2, H / 2);
        await sleep(600);
        break;
      }
      case "hold":
        await keyEvent(page, "keydown", rest[0]);
        await sleep(Number(rest[1]) || 500);
        await keyEvent(page, "keyup", rest[0]);
        break;
      case "down":
        held.add(rest[0]);
        await keyEvent(page, "keydown", rest[0]);
        break;
      case "up":
        held.delete(rest[0]);
        await keyEvent(page, "keyup", rest[0]);
        break;
      case "tap":
        await keyEvent(page, "keydown", rest[0]);
        await sleep(60);
        await keyEvent(page, "keyup", rest[0]);
        break;
      case "move":
        await page.mouse.move(
          W / 2 + Number(rest[0] || 0),
          H / 2 + Number(rest[1] || 0),
        );
        break;
      case "mdown":
        await page.mouse.down({ button: ["left", "middle", "right"][Number(rest[0]) || 0] });
        break;
      case "mup":
        await page.mouse.up({ button: ["left", "middle", "right"][Number(rest[0]) || 0] });
        break;
      case "touch": {
        const x = (Number(rest[0]) / 100) * W;
        const y = (Number(rest[1]) / 100) * H;
        await page.touchscreen.tap(x, y);
        await sleep(Number(rest[2]) || 0);
        break;
      }
      case "swipe": {
        const x1 = (Number(rest[0]) / 100) * W;
        const y1 = (Number(rest[1]) / 100) * H;
        const x2 = (Number(rest[2]) / 100) * W;
        const y2 = (Number(rest[3]) / 100) * H;
        const ms = Number(rest[4]) || 300;
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart", touchPoints: [{ x: x1, y: y1 }],
        });
        const steps_ = 12;
        for (let i = 1; i <= steps_; i += 1) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{
              x: x1 + ((x2 - x1) * i) / steps_,
              y: y1 + ((y2 - y1) * i) / steps_,
            }],
          });
          await sleep(ms / steps_);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        break;
      }
      case "ready": {
        // WAIT FOR THE LOADER TO BE GONE FROM THE DOM, not for a class to become
        // visible — and the difference is not pedantry, it cost a shipped build.
        //
        // This step used to be `waitForSelector("#loader.gone")`. `hideLoader()`
        // (`ui/hud.ts`) adds `.gone` AND removes the element 600 ms later, and
        // `.gone` is what fades the loader OUT — so playwright's default
        // `state: "visible"` was waiting for an element to become visible at the
        // exact moment it was being made invisible and then deleted. It could
        // never match. On 2026-07-30 that timed out against a game that had
        // booted perfectly (96%, "Warming the shaders…", DROP IN present at
        // 83 s), the run was read as "no gameplay frame available", and a build
        // went out with nothing having looked at it. **A harness that fails on a
        // healthy game is worse than no harness**, because it spends the trust
        // you would otherwise have spent looking.
        //
        // `detached` is the honest condition: `main.ts` reaches `hideLoader()`
        // only after `Promise.all([boardJob, skaterJob, dressJob])` and the
        // shader warm-up, and the element is removed unconditionally 600 ms on.
        // Note the boot is genuinely slow on a cold cache — assets stream from
        // the CDN and 83 s to first frame is normal, minutes if the network is
        // busy — so the default timeout is generous on purpose. Throwing beats
        // photographing a loading screen.
        const ms = Number(rest[0]) || 240000;
        await page.waitForSelector("#loader", { state: "detached", timeout: ms });
        await sleep(400);
        break;
      }
      case "shot":
        await shoot(page, rest[0]);
        break;
      case "burst": {
        const n = Number(rest[0]) || 6;
        const gap = Number(rest[1]) || 120;
        for (let i = 0; i < n; i += 1) {
          await shoot(page, `f${String(i).padStart(2, "0")}`);
          await sleep(gap);
        }
        break;
      }
      default:
        console.error(`[shoot] unknown step: ${step}`);
    }
  }

  for (const code of held) await keyEvent(page, "keyup", code);

  if (has("fps")) {
    const frames = await page.evaluate(() => window.__frames ?? []);
    const usable = frames.slice(10).filter((f) => f < 500);
    if (usable.length) {
      const sorted = [...usable].sort((a, b) => a - b);
      const mean = usable.reduce((a, b) => a + b, 0) / usable.length;
      const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
      console.log(
        `FRAMES n=${usable.length} mean=${mean.toFixed(2)}ms (${(1000 / mean).toFixed(1)} fps) ` +
          `p50=${p(0.5).toFixed(2)} p95=${p(0.95).toFixed(2)} worst=${sorted.at(-1).toFixed(2)}`,
      );
    }
  }

  // A persistent context owns its own browser: closing the context is what
  // flushes the cache to disk for the next run.
  if (browser) await browser.close();
  else await context.close();

  for (const p of written) console.log(`SHOT ${p}`);
  if (errors.length) {
    console.error(`\n--- page console (${errors.length}) ---`);
    for (const e of errors.slice(0, 60)) console.error(e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
