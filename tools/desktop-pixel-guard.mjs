// tools/desktop-pixel-guard.mjs — prove a change did NOT move a desktop pixel.
//
// This is a REVIEW tool, not game code. It adds nothing to the bundle and the
// game exposes nothing for it: the tier comes from the game's OWN persisted
// Quality setting (localStorage `genex:quality`, the value the settings screen
// writes), the inputs are real DOM events on the elements a player clicks, and
// the only thing injected is an observer around `HTMLCanvasElement.getContext`
// — the same shape of wrap `gpu-audit.mjs` already puts around the GL calls.
//
// WHY IT EXISTS. The mobile lane is allowed to change phone tiers and nothing
// else. "Nothing else" is a claim about PIXELS, and the only way to hold a lane
// to it is to photograph the game before and after and subtract. A reasoned
// argument that a branch is unreachable on desktop is not evidence; a differing
// pixel count of 0 across a fixed set of viewpoints is.
//
// ── THE THREE THINGS THAT HAD TO BE MEASURED BEFORE THIS TOOL WAS WORTH ANY-
//    THING, in the order they bit ─────────────────────────────────────────────
//
// 1. THE GAME IS NOT DETERMINISTIC ON A REAL CLOCK. Two runs of
//    `shoot.mjs --steps "drop, wait 2500, shot"` on IDENTICAL code produced two
//    different PNGs (sha256 e54209a1… vs ae4ddeb2…). Of course they did — the
//    exposure meter adapts over time, the skater's idle loop advances, and a
//    wall-clock wait lands on a different millisecond every run. A byte-for-byte
//    gate on top of that measures the machine's mood, not the diff.
//    So the page's time is Playwright's fake clock (`page.clock`), installed
//    BEFORE navigation and advanced only in fixed 16 ms steps. rAF,
//    `performance.now()`, `Date` and every timer come off it, so the game sees an
//    exactly repeatable frame sequence and the inputs land on exact frames. The
//    only real-time thing left is the network, and each clock step is followed by
//    a real sleep so assets have room to land while game time stands still.
//
// 2. `locator.click()` HANGS UNDER A FROZEN CLOCK. Playwright's actionability
//    check waits for the element's box to hold still across two consecutive
//    animation frames, and with rAF frozen there is never a second one. The DROP
//    IN click is therefore `element.click()` inside the page — the same event the
//    button's own handler listens for.
//
// 3. SO DOES `page.screenshot()`, and `Page.captureScreenshot` over CDP is worse
//    than a hang: `fromSurface: true` came back a 1280x800 image of a 2560x1600
//    canvas (measured), i.e. a downscale, which would hide half of any
//    difference — and `fromSurface: false` came back with the page laid out at
//    the wrong scale. Neither is a gate.
//    What this tool captures instead is the game's OWN back buffer, read with
//    `gl.readPixels` inside a rAF callback registered after the game's, so it
//    sees the frame the clock step just drew, at full device resolution, with no
//    compositor, no downscale and no encoder anywhere near it. Every live WebGL
//    canvas is read — the world's and the menu stage's, which is its own
//    renderer at its own DPR clamp.
//
// ── WHERE THIS TOOL STANDS TODAY, AND IT IS NOT AT ZERO ──────────────────────
//
// `--selftest` captures the same set twice, in two separate browsers, on
// IDENTICAL code. Run it before reading any number this tool prints about a
// change, because that is the floor every other number sits on. Measured on
// 2026-07-30, after the three fixes above:
//
//   01-title   309445 / 4096000 differing (max Δ 155)
//   02-spawn   343670 / 4096000           (max Δ 155)
//   03-roll    334123 / 4096000           (max Δ  88)
//   04-air     320964 / 4096000           (max Δ  84)
//   05-carve   173045 / 4096000           (max Δ  48)
//
// So the floor is about 8% of the frame. WHAT IT IS: a fine speckle on the
// high-contrast edges — the facade windows, the tree canopies, the skater's
// silhouette — with the flat ground bit-identical. That is the shape of a
// marginally different EXPOSURE running through the grade's quantise, not of a
// scene in a different state, and the exposure meter is a per-frame feedback
// loop (`render/metering.ts`) that converges asymptotically and therefore never
// bit-exactly. Something still lands on a marginally different frame between two
// runs — the menu stage's own body GLB is the strongest candidate, since it is
// fetched lazily on the first menu frame — and once the loop has been handed two
// different first frames it stays apart for the session.
//
// WHAT THAT MEANS FOR A READER: this tool can say "the change is inside the
// noise" and it can say "the change is enormous". It cannot yet say "zero", so
// it is not a byte gate, and a lane that needs one should not pretend this is
// it. Closing it means either freezing the meter for the duration of a capture
// (which would be debug-only code in the game, and is therefore not allowed —
// AGENTS.md rule 16) or finding the last real-time arrival and waiting for it,
// which is where this was left.
//
// USAGE
//   npm run dev                                    # in another shell
//   node tools/desktop-pixel-guard.mjs --selftest               # harness sanity
//   node tools/desktop-pixel-guard.mjs --out /tmp/guard/before
//   …make the change…
//   node tools/desktop-pixel-guard.mjs --out /tmp/guard/after
//   node tools/desktop-pixel-guard.mjs --diff /tmp/guard/before /tmp/guard/after
//
// FLAGS
//   --out <dir>        where the frame set goes (.rgba.gz for the diff, .png to look at)
//   --diff <a> <b>     compare two sets, per viewpoint, and exit 1 on any diff
//   --selftest         capture twice into a temp pair and diff them
//   --setting <s>      the game's persisted Quality setting: auto|low|medium|high
//                      (default auto — on a non-touch UA that is TIERS.desktop)
//   --size WxH         viewport in CSS px (default 1280x800)
//   --dpr <n>          device pixel ratio (default 2 — the desktop tier's cap)
//   --url <u>          default http://localhost:5173/?genex_local_test=1
//   --console          dump page console

import { chromium } from "playwright-core";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { deflateSync, gzipSync, gunzipSync, crc32 } from "node:zlib";
import { tmpdir } from "node:os";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}
const has = (name) => process.argv.includes(`--${name}`);
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

const URL_ = arg("url", "http://localhost:5173/?genex_local_test=1");
const SIZE = String(arg("size", "1280x800"));
const [VW, VH] = SIZE.split("x").map(Number);
const DPR = Number(arg("dpr", 2));
const SETTING = String(arg("setting", "auto"));
/** One reused browser profile, so the HTTP cache survives between runs — see
 *  BOOT_WAIT_MS on why a warm cache cannot change the game this captures. */
const PROFILE = String(arg("profile", join(tmpdir(), "pixel-guard-profile")));

/** One clock step. 16 ms and not 16.667: the number only has to be REPEATABLE. */
const STEP_MS = 16;
/**
 * Warm-up clock steps between "the title screen is up and the network has gone
 * quiet" and the first capture.
 *
 * It has to clear the governor's 6000 ms warm-up (`governor.ts` WARMUP_MS) so no
 * capture is taken in a window where the ladder is watching but not acting, and
 * it has to be long enough for the exposure meter's adaptation to converge — the
 * meter is exponential, so that is a matter of time constants, not a lucky frame.
 */
const WARMUP_TICKS = Number(arg("warmup", 500)); // default 8000 ms of game time
/** Real milliseconds per clock step, so texture uploads can drain. */
const PLAY_REAL_MS = 12;
/**
 * Real-time settle between the boot gate and the first animation frame.
 *
 * Anything still in flight when the title screen appears — a decode finishing, a
 * `.then` in the dress pass, a KTX2 worker posting back — lands HERE, at game
 * time zero, rather than in the gap between two clock steps where the tick it
 * arrives on would depend on the machine. Measured before it was added: two runs
 * on identical code differed by ~370k of 4096000 pixels, as a speckle on the
 * high-contrast edges of the facades and trees, which is the signature of the
 * exposure meter's feedback loop having been handed a marginally different first
 * frame and never quite converging back.
 */
const SETTLE_MS = 6000;
/**
 * THE WHOLE OF THE BOOT IS SPENT WITH THE GAME'S CLOCK AT ZERO, and this is the
 * decision that makes the harness repeatable rather than merely slow.
 *
 * Measured: the boot's `Promise.all([boardJob, skaterJob, dressJob])` is pure
 * network — it needs no animation frame to finish — and a DESKTOP tier boot
 * fetches the un-rung originals (the 8192x4096 skybox, the 22 MB rig), which
 * took 120.8 s of real time on a cold cache here. Ticking the clock while that
 * lands would put every asset's arrival at a DIFFERENT game time in every run,
 * and anything phase-driven off arrival — an idle clip, an adaptation — would
 * come out somewhere else. With the clock at zero, every run's world arrives at
 * game time 0 and the capture programme starts from the same frame in all of
 * them.
 *
 * The browser profile is persistent for the same reason it is safe to be: the
 * HTTP cache turns the second run's 120 s into a few seconds, and since no game
 * time passes while the assets land, a warm cache and a cold one produce the
 * same game.
 */
const BOOT_WAIT_MS = 240000;
/** Real milliseconds with no new request before the network counts as quiet. */
const NET_QUIET_MS = 3000;

// ---------------------------------------------------------------------------
// the viewpoint programme — fixed, and every offset is GAME time
// ---------------------------------------------------------------------------
//
// Five frames chosen to light up every part of the chain the critical rule
// protects: the menu (its own renderer and its own DPR clamp), the world at
// spawn, the world in motion (the shutter and the metering), the world in the
// air (the sky, the shafts, the bloom against the brightest thing in frame) and
// a carve (the camera lag and the widest streak the blur produces).
const PROGRAMME = [
  { shot: "01-title" },
  { drop: true },
  { ticks: 60, shot: "02-spawn" },
  { down: "KeyW" },
  { ticks: 125, shot: "03-roll" },
  { tap: "Space" },
  { ticks: 22, shot: "04-air" },
  { down: "KeyA" },
  { ticks: 45, shot: "05-carve" },
  { up: "KeyA" },
  { up: "KeyW" },
];

const KEY_NAMES = {
  KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", Space: " ", ShiftLeft: "Shift",
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

/** Advance GAME time by `n` steps, giving the network `realMs` per step. */
async function tick(page, n, realMs) {
  for (let i = 0; i < n; i += 1) {
    await page.clock.runFor(STEP_MS);
    if (realMs > 0) await realSleep(realMs);
  }
}

/**
 * The injected observer. Its whole job is to keep a handle on every WebGL
 * context the page creates, so the back buffer can be read later. It changes no
 * attribute the game asked for and returns the real context untouched.
 */
function observeCanvases() {
  const W = window;
  if (W.__guardCanvases) return;
  W.__guardCanvases = [];
  const real = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    let ask = attrs;
    if (type === "webgl2" || type === "webgl") {
      // THE ONE ATTRIBUTE THIS TOOL CHANGES, and it has to. Without
      // `preserveDrawingBuffer` the back buffer is undefined after the frame is
      // presented, and `readPixels` came back all zeroes — measured: five
      // 2560x1600 captures that were byte-identical because all five were
      // blank, which is the most dangerous possible failure of a gate. It
      // changes what is READABLE after a present, never what is drawn, and it
      // is set identically on the before and after runs.
      ask = Object.assign({}, attrs, { preserveDrawingBuffer: true });
    }
    const ctx = real.call(this, type, ask);
    if (ctx && (type === "webgl2" || type === "webgl")) {
      W.__guardCanvases.push({ canvas: this, gl: ctx });
    }
    return ctx;
  };

  /**
   * Read the back buffer of every live WebGL canvas, in DOM order.
   *
   * The read happens inside a `requestAnimationFrame` callback registered HERE,
   * i.e. after the game's own loop registered its, so within the clock step that
   * follows this call the game draws first and this reads second — the buffer is
   * the frame that step produced, before the compositor has had it.
   */
  W.__guardCapture = () => new Promise((resolve) => {
    requestAnimationFrame(() => {
      const out = [];
      for (const entry of W.__guardCanvases) {
        const { canvas, gl } = entry;
        if (!canvas.isConnected) continue;
        if (typeof gl.isContextLost === "function" && gl.isContextLost()) continue;
        const w = canvas.width;
        const h = canvas.height;
        if (!w || !h) continue;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        // Base64 in 32k chunks — one `String.fromCharCode(...px)` on 16 MB
        // blows the argument limit.
        let s = "";
        for (let i = 0; i < px.length; i += 32768) {
          s += String.fromCharCode.apply(null, px.subarray(i, i + 32768));
        }
        out.push({ w, h, b64: btoa(s), id: canvas.dataset.guardId ?? "" });
      }
      resolve(out);
    });
  });
}

// ---------------------------------------------------------------------------
// PNG, both ways, with no dependency
// ---------------------------------------------------------------------------

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

/** Encode top-down RGBA into an 8-bit RGBA PNG. Filter 0 throughout: this is a
 *  file for a human to look at, and the diff never reads it. */
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y += 1) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** `gl.readPixels` is bottom-up; a PNG is top-down. */
function flipRows(w, h, rgba) {
  const stride = w * 4;
  const out = Buffer.alloc(rgba.length);
  for (let y = 0; y < h; y += 1) {
    rgba.copy(out, (h - 1 - y) * stride, y * stride, (y + 1) * stride);
  }
  return out;
}

// ---------------------------------------------------------------------------

async function capture(outDir) {
  await mkdir(outDir, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    headless: true,
    args: [
      "--use-angle=metal",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
    ],
    viewport: { width: VW, height: VH },
    deviceScaleFactor: DPR,
    isMobile: false,
    hasTouch: false,
  });
  await context.addInitScript((setting) => {
    try {
      if (setting === "auto") localStorage.removeItem("genex:quality");
      else localStorage.setItem("genex:quality", setting);
    } catch { /* blocked */ }
  }, SETTING);
  await context.addInitScript(observeCanvases);

  const page = await context.newPage();
  const logs = [];
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning" || has("console")) logs.push(`[${m.type()}] ${m.text()}`);
  });
  let lastRequest = Date.now();
  page.on("request", () => { lastRequest = Date.now(); });

  // Before navigation, and `pauseAt` as well as `install` — this pair is the
  // whole determinism of the harness and the second half was learned the hard
  // way. `install()` alone does NOT stop the clock: the API's own words are
  // "time resumes flowing, timers are fired as usual", so the page still got
  // real, variable-length frames while the assets came down. Measured with that
  // bug in: two runs of this programme on IDENTICAL code differed by up to
  // 4096000 of 4096000 pixels. `pauseAt` a second into the future, BEFORE the
  // navigation, means the game's very first animation frame is the first
  // `runFor` below — game time reads 2 ms at the moment the title screen comes
  // up, in every run, on a warm cache or a cold one.
  const t0 = new Date("2026-01-01T12:00:00Z");
  await page.clock.install({ time: t0 });
  await page.clock.pauseAt(new Date(t0.getTime() + 1000));
  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 120000 });

  // Boot, with the game's clock standing still — see BOOT_WAIT_MS.
  const bootStart = Date.now();
  let ready = false;
  while (Date.now() - bootStart < BOOT_WAIT_MS) {
    await realSleep(500);
    ready = await page.evaluate(() => !!document.querySelector('[data-act="play"]'));
    if (ready && Date.now() - lastRequest > NET_QUIET_MS) break;
  }
  process.stderr.write(`  boot: title ${ready ? "up" : "NEVER APPEARED"} after ${Date.now() - bootStart} ms real, game clock still at 0\n`);
  if (!ready) logs.push("[guard] title screen never appeared — the frame set is not a gate");

  await realSleep(SETTLE_MS);

  process.stderr.write(`  warm-up ${WARMUP_TICKS} clock steps`);
  await tick(page, WARMUP_TICKS, PLAY_REAL_MS);
  process.stderr.write(" done\n");

  const written = [];
  for (const step of PROGRAMME) {
    if (step.drop) {
      // `element.click()` in the page, NOT `locator.click()` — see note 2 in the
      // header. The DOM click is the event the button's own handler listens for.
      const hit = await page.evaluate(() => {
        const el = document.querySelector('[data-act="play"]');
        if (!el) return false;
        el.click();
        return true;
      });
      if (!hit) logs.push("[guard] no DROP IN button found");
    }
    if (step.down) await keyEvent(page, "keydown", step.down);
    if (step.up) await keyEvent(page, "keyup", step.up);
    if (step.tap) {
      await keyEvent(page, "keydown", step.tap);
      await tick(page, 4, PLAY_REAL_MS);
      await keyEvent(page, "keyup", step.tap);
    }
    if (step.ticks) await tick(page, step.ticks, PLAY_REAL_MS);
    if (step.shot) {
      // Arm the read, then spend ONE clock step: the game draws, this reads.
      const pending = page.evaluate(() => window.__guardCapture());
      await tick(page, 1, 0);
      const frames = await pending;
      for (let i = 0; i < frames.length; i += 1) {
        const f = frames[i];
        const bottomUp = Buffer.from(f.b64, "base64");
        const name = `${step.shot}-c${i}-${f.w}x${f.h}`;
        await writeFile(join(outDir, `${name}.rgba.gz`), gzipSync(bottomUp, { level: 6 }));
        await writeFile(join(outDir, `${name}.png`), encodePng(f.w, f.h, flipRows(f.w, f.h, bottomUp)));
        written.push(name);
      }
      process.stderr.write(`  shot ${step.shot}: ${frames.map((f) => `${f.w}x${f.h}`).join(", ")}\n`);
    }
  }

  const info = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    return {
      dpr: window.devicePixelRatio,
      canvas: c ? { w: c.width, h: c.height } : null,
      quality: window.__GENEX_QUALITY__ ?? null,
    };
  });
  await context.close();
  return { written, logs, info };
}

// ---------------------------------------------------------------------------

/** Differing pixels, and the largest single-channel gap, between two buffers. */
function diffRgba(a, b) {
  if (a.length !== b.length) return { differing: -1, total: -1, maxDelta: 255, note: `${a.length} vs ${b.length} bytes` };
  let differing = 0;
  let maxDelta = 0;
  for (let i = 0; i < a.length; i += 4) {
    let hit = 0;
    for (let c = 0; c < 4; c += 1) {
      const d = Math.abs(a[i + c] - b[i + c]);
      if (d) { hit = 1; if (d > maxDelta) maxDelta = d; }
    }
    differing += hit;
  }
  return { differing, total: a.length / 4, maxDelta };
}

async function diffDirs(dirA, dirB) {
  const names = (await readdir(dirA)).filter((n) => n.endsWith(".rgba.gz")).sort();
  const other = new Set((await readdir(dirB)).filter((n) => n.endsWith(".rgba.gz")));
  let worst = 0;
  console.log(`\n=== DESKTOP PIXEL DIFF — ${basename(dirA)} vs ${basename(dirB)} ===`);
  console.log("frame".padEnd(30) + "differing px".padStart(14) + "  of total".padEnd(14) + "  max Δ");
  console.log("-".repeat(72));
  for (const n of names) {
    const label = n.replace(/\.rgba\.gz$/, "");
    if (!other.has(n)) {
      console.log(`${label.padEnd(30)}  MISSING IN B (frame set differs)`);
      worst = Math.max(worst, 1);
      continue;
    }
    other.delete(n);
    const a = gunzipSync(await readFile(join(dirA, n)));
    const b = gunzipSync(await readFile(join(dirB, n)));
    const d = diffRgba(a, b);
    worst = Math.max(worst, Math.max(0, d.differing));
    console.log(
      label.padEnd(30) + String(d.differing).padStart(14) +
      `  / ${d.total}`.padEnd(14) + `  ${d.maxDelta}` + (d.note ? `  (${d.note})` : ""),
    );
  }
  for (const n of other) {
    console.log(`${n.replace(/\.rgba\.gz$/, "").padEnd(30)}  MISSING IN A (frame set differs)`);
    worst = Math.max(worst, 1);
  }
  console.log("-".repeat(72));
  console.log(worst === 0
    ? "RESULT: 0 differing pixels on every frame."
    : `RESULT: ${worst} differing pixels at worst — NOT identical.`);
  return worst;
}

async function main() {
  const diffAt = process.argv.indexOf("--diff");
  if (diffAt !== -1) {
    const a = process.argv[diffAt + 1];
    const b = process.argv[diffAt + 2];
    if (!a || !b) { console.error("--diff needs two directories"); process.exit(2); }
    process.exit((await diffDirs(a, b)) === 0 ? 0 : 1);
  }

  if (has("selftest")) {
    const base = join(tmpdir(), `pixel-guard-selftest-${Date.now()}`);
    const a = join(base, "a");
    const b = join(base, "b");
    console.log(`self-test: the same programme twice (setting ${SETTING}, ${SIZE} @ DPR ${DPR})`);
    const ra = await capture(a);
    const rb = await capture(b);
    if (has("console")) for (const l of [...ra.logs, ...rb.logs]) console.error(l);
    const worst = await diffDirs(a, b);
    console.log(worst === 0
      ? "\nHARNESS IS DETERMINISTIC — a 0 from it about a code change is worth something."
      : `\nHARNESS NOISE FLOOR: ${worst} px on identical code. Every diff this tool` +
        "\nprints has to be read against that number — see the header. It is not zero," +
        "\nso this is not a byte gate yet.");
    process.exit(worst === 0 ? 0 : 1);
  }

  const out = String(arg("out", "shots/guard/set"));
  const r = await capture(out);
  await writeFile(join(out, "meta.json"), JSON.stringify({
    when: new Date().toISOString(), url: URL_, setting: SETTING, size: SIZE, dpr: DPR,
    stepMs: STEP_MS, warmupTicks: WARMUP_TICKS, settleMs: SETTLE_MS, info: r.info, logs: r.logs,
  }, null, 2));
  console.log(`captured ${r.written.length} frames -> ${out}`);
  console.log(`canvas ${JSON.stringify(r.info.canvas)} at page DPR ${r.info.dpr}, quality ${JSON.stringify(r.info.quality)}`);
  if (has("console")) for (const l of r.logs) console.error(l);
}

main().catch((e) => { console.error(e); process.exit(1); });
