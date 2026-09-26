// tools/desk-profile.mjs — MEASURE where a desktop frame's time actually goes.
//
// This is a REVIEW tool, not game code. It adds nothing to the bundle and the
// game exposes nothing for it. Everything below is installed by an init script
// that runs before any of the page's own modules, and every number is read from
// OUTSIDE the game — the same discipline `tools/gpu-audit.mjs` uses on the GL
// allocation calls, applied here to the draw calls and the frame clock.
//
// WHY NOT `renderer.info`. `info` is behind the game's module scope and reading
// it would mean the game exposing it, which is a bundle change (AGENTS.md rule
// 16). Wrapping `WebGL2RenderingContext.prototype` gets the same counts and
// MORE: it sees the post-processing fullscreen quads, the shadow pass and the
// PMREM blits, which `info.render.calls` lumps together per `render()` call.
//
// ── THE ONE MEASUREMENT THAT DECIDES THE SHAPE OF THE ANSWER ─────────────────
//
// A frame period of 16.67 ms tells you nothing: it is vsync, and it is the same
// number whether the frame cost 2 ms or 16. So this tool separates three clocks:
//
//   period   frame-start to frame-start (what shoot.mjs --fps prints)
//   js       time inside the game's own rAF callback — its update AND every
//            GL call it makes, since submitting draws is synchronous. This is
//            "CPU-bound in JS + CPU-bound in the driver" together.
//   idle     period − js. Waiting: for vsync, or for the GPU.
//
// Read together with `--novsync` (which removes the vsync clamp so frames run
// as fast as they can) they separate the three cases:
//
//   js ≈ period                       CPU-bound (JS or driver)
//   js ≪ period, period pinned 16.67  vsync-limited: there is headroom
//   js ≪ period, period > 16.67       GPU-bound: the CPU is waiting on the GPU
//
// And the confirming experiment is to change ONE variable at a time:
//   --size 640x400   ¼ the pixels, same scene  → moves only if fill/GPU-bound
//   --cpu 2          half the CPU, same pixels → moves only if CPU-bound
//
// ── COUNTER OVERHEAD IS REAL, SO THE PASSES ARE SEPARATE ─────────────────────
//
// Wrapping `bindTexture` costs a function call on a call made thousands of times
// a frame. So `--counters` and the timing run are DIFFERENT runs: the timing run
// wraps only rAF (one closure per frame, ~nothing) and the counter run is not
// used for timing. Do not read a frame time off a `--counters` run.
//
// USAGE
//   npm run dev                                        # in another shell
//   node tools/desk-profile.mjs                        # baseline: timing + CPU profile
//   node tools/desk-profile.mjs --counters             # draw calls / tris / binds per frame
//   node tools/desk-profile.mjs --size 640x400         # the GPU-bound experiment
//   node tools/desk-profile.mjs --cpu 2                # the CPU-bound experiment
//   node tools/desk-profile.mjs --novsync              # unclamped frame cost
//   node tools/desk-profile.mjs --json out.json        # full profile + frames
//
// FLAGS
//   --url <u>       default http://localhost:5173/?genex_local_test=1
//   --size WxH      viewport (default 1280x800)
//   --dpr <n>       device scale factor (default 1)
//   --ride <ms>     how long to hold W and actually play (default 6000)
//   --cpu <n>       CDP CPU throttle rate (2 = half speed)
//   --novsync       launch with the frame-rate limiter off
//   --counters      install the GL counters (do NOT read timing off this run)
//   --profile       take a CDP CPU profile over the ride (default on)
//   --no-profile    skip it
//   --interval <us> profiler sampling interval, default 100 (=0.1 ms)
//   --top <n>       profile rows to print (default 30)
//   --json <path>   write everything
//   --label <s>     a name for this run, printed on every line
//   --console       dump page console
//   --timeout <ms>  boot timeout (default 300000)
//   --profile <dir> reused browser profile (default /tmp/desk-profile-profile)
//   --fresh         throw the profile away first — measures a COLD boot
//
// ── WHY THE PROFILE IS REUSED, AND WHAT THAT DOES AND DOES NOT CHANGE ────────
//
// Measured on this machine: a COLD desktop boot never reached DROP IN inside
// 124 s. It is not the CPU — the desktop tier fetches the un-rung originals (the
// 8192x4096 skybox, the 22 MB rig) and boot is `Promise.all` over the network.
// So a cold run measures the network and a warm one measures the game. Both are
// worth having and they are reported separately: `--fresh` for the cold number
// the player actually waits through, the reused profile for every frame-cost
// comparison, where a warm HTTP cache cannot change a single rendering input —
// the same bytes arrive, from disk instead of the wire.

// ── THIS MACHINE IS NOT QUIET, AND A NUMBER WITHOUT A SPREAD IS NOT A NUMBER ──
//
// Measured while writing this tool: three dpr2 runs on IDENTICAL code came back
// 18.52, 23.71 and 32.77 ms mean, because the box was also running the player's
// own Chrome, WindowServer at 78 % and another agent's node sweeps (load average
// 7.19 on 12 cores). So:
//   · every run prints `os.loadavg()` BEFORE and AFTER its own timed window, and
//     a run whose load moved a lot mid-window is a run to discard;
//   · a single before/after pair is never evidence — compare medians of at least
//     three interleaved runs (`scratchpad/ab.sh`);
//   · and the run asserts it is IN GAMEPLAY rather than assuming it: DROP IN must
//     detach, and the game's own speed readout (`#speedo .n`, the element
//     `ui/hud.ts:1204` binds) must read non-zero with W held. A profile of the
//     loading screen looks exactly like a fast game.

import { chromium } from "playwright-core";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir, loadavg } from "node:os";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}
const has = (name) => process.argv.includes(`--${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const URL_ = arg("url", "http://localhost:5173/?genex_local_test=1");
const SIZE = String(arg("size", "1280x800"));
const [W, H] = SIZE.split("x").map(Number);
const DPR = Number(arg("dpr", 1)) || 1;
const RIDE = Number(arg("ride", 6000)) || 6000;
const CPU = Number(arg("cpu", 0)) || 0;
const TOP = Number(arg("top", 30)) || 30;
const INTERVAL = Number(arg("interval", 100)) || 100;
const LABEL = String(arg("label", `${SIZE}@${DPR}${CPU ? ` cpu/${CPU}` : ""}${has("novsync") ? " novsync" : ""}`));
const JSON_OUT = arg("json", null);
const WANT_PROFILE = !has("no-profile");

/**
 * Installed BEFORE the page's modules. Two things only:
 *   1. wrap rAF so we can time the game's own callback without being inside it
 *   2. optionally wrap the GL draw/bind calls and bucket them per frame
 * Nothing here touches the game's state, and the game cannot see it.
 */
function initScript({ counters }) {
  const w = /** @type {any} */ (window);

  // ---- frame clock -------------------------------------------------------
  // We wrap the callback rather than adding our own rAF loop, so `js` is the
  // time the GAME spent, not the time our probe spent.
  w.__prof = { frames: [], jsTimes: [], gl: [], firstDraw: 0, drawsTotal: 0 };
  const rafOrig = w.requestAnimationFrame.bind(w);
  let lastStart = 0;
  w.requestAnimationFrame = function (cb) {
    return rafOrig(function (t) {
      const start = performance.now();
      if (lastStart) w.__prof.frames.push(start - lastStart);
      lastStart = start;
      // The GL counters for the frame that just ENDED are complete by now
      // (the previous callback returned), so flush before the game runs again.
      if (counters && w.__glCur) {
        w.__prof.gl.push(w.__glCur);
        w.__glCur = w.__glReset();
      }
      // Arm the one-frame census INSIDE the callback, so it captures exactly
      // one game frame's worth of draws and nothing from the compositor.
      const arming = counters && w.__censusArm === true;
      if (arming) { w.__census = []; w.__censusArm = false; }
      let out;
      try {
        out = cb(t);
      } finally {
        w.__prof.jsTimes.push(performance.now() - start);
        if (arming) { w.__censusDone = w.__census; w.__census = null; }
      }
      return out;
    });
  };

  if (!counters) return;

  // ---- per-pass census ---------------------------------------------------
  // A GL call knows no names, but it knows which FRAMEBUFFER it is drawing
  // into, which PROGRAM is bound and how big the viewport is. That triple is
  // enough to reconstruct the pass structure of a frame from outside the game:
  // one framebuffer = one render target, and the shadow pass, the scene pass
  // and the GTAO prepass are three different targets at three different sizes.
  w.__census = null; // filled for ONE frame when __censusArm is set
  w.__censusArm = false;
  const idOf = (() => {
    const ids = new WeakMap();
    let next = 1;
    return (o) => {
      if (o === null) return 0; // the default framebuffer
      let id = ids.get(o);
      if (!id) { id = next++; ids.set(o, id); }
      return id;
    };
  })();
  w.__idOf = idOf;

  // ---- GL counters -------------------------------------------------------
  const G = /** @type {any} */ (WebGL2RenderingContext).prototype;
  // `shadow` and `meter` are per-frame WITNESSES, not perf counters, and they
  // exist for one question that cannot be answered by reading code: when the
  // governor drops to its post-off rung, does the shadow map still get
  // rasterised every frame?
  //   · a draw at a 3072x3072 viewport can only be the sun's shadow map
  //     (`field.ts` shadowMapSizeFor -> 3072 on postLevel 'full')
  //   · a draw at 64x64 can only be the exposure meter's first reduction, and the
  //     meter's pass lives INSIDE the composer chain — so `meter === 0` is how a
  //     frame with post switched off identifies itself from outside the game.
  w.__glReset = () => ({
    draws: 0, verts: 0, instanced: 0, progs: 0, texBinds: 0,
    fbo: 0, clears: 0, uniforms: 0, vao: 0, scissor: 0, viewport: 0,
    shadow: 0, meter: 0, shadowSide: 0,
  });
  w.__glCur = w.__glReset();
  const wrap = (name, tally) => {
    const orig = G[name];
    if (typeof orig !== "function") return;
    G[name] = function (...a) {
      tally(a);
      return orig.apply(this, a);
    };
  };
  // Live GL state we shadow, so a draw can say WHERE it went without a
  // getParameter round-trip (which would stall the pipeline and change what we
  // are trying to measure).
  const st = { fbo: 0, prog: 0, vw: 0, vh: 0 };
  const first = () => {
    if (!w.__prof.firstDraw) w.__prof.firstDraw = performance.now();
    w.__prof.drawsTotal += 1;
  };
  const note = (verts, instances) => {
    // A SQUARE viewport of 256+ can only be the sun's shadow map here. Keyed on
    // squareness rather than on 3072 exactly, and that is a bug I had to fix
    // rather than a nicety: the governor HALVES the shadow map (`setShadowQuality`)
    // one rung BEFORE it switches post off, so a witness looking for 3072²
    // reports "shadows froze" the moment the ladder starts working. The bloom
    // mips are the other small targets and they are never square at the
    // viewports used here; the meter's 64/8/1 are square but far below 256.
    if (st.vw === st.vh && st.vw >= 256) {
      w.__glCur.shadow += 1;
      w.__glCur.shadowSide = st.vw;
    }
    if (st.vw === 64 && st.vh === 64) w.__glCur.meter += 1;
    if (!w.__census) return;
    w.__census.push({
      fbo: st.fbo, prog: st.prog, vw: st.vw, vh: st.vh, verts, instances,
    });
  };
  // `count` is vertices; triangles depend on mode but every mesh here is
  // TRIANGLES (mode 4), so verts/3 is the triangle count. Reported as verts to
  // stay honest about the assumption.
  wrap("drawElements", (a) => {
    w.__glCur.draws++; w.__glCur.verts += a[1]; first(); note(a[1], 1);
  });
  wrap("drawArrays", (a) => {
    w.__glCur.draws++; w.__glCur.verts += a[2]; first(); note(a[2], 1);
  });
  wrap("drawElementsInstanced", (a) => {
    w.__glCur.draws++; w.__glCur.instanced++; w.__glCur.verts += a[1] * a[4];
    first(); note(a[1] * a[4], a[4]);
  });
  wrap("drawArraysInstanced", (a) => {
    w.__glCur.draws++; w.__glCur.instanced++; w.__glCur.verts += a[2] * a[3];
    first(); note(a[2] * a[3], a[3]);
  });
  wrap("useProgram", (a) => { w.__glCur.progs++; st.prog = idOf(a[0]); });
  wrap("bindTexture", () => w.__glCur.texBinds++);
  wrap("bindFramebuffer", (a) => { w.__glCur.fbo++; if (a[0] === 0x8d40) st.fbo = idOf(a[1]); });
  wrap("bindVertexArray", () => w.__glCur.vao++);
  wrap("clear", () => w.__glCur.clears++);
  wrap("viewport", (a) => { w.__glCur.viewport++; st.vw = a[2]; st.vh = a[3]; });
  wrap("scissor", () => w.__glCur.scissor++);
  for (const u of [
    "uniform1f", "uniform1i", "uniform2f", "uniform3f", "uniform4f",
    "uniformMatrix3fv", "uniformMatrix4fv", "uniform1fv", "uniform2fv",
    "uniform3fv", "uniform4fv", "uniform1iv",
  ]) wrap(u, () => w.__glCur.uniforms++);
}

const KEY_NAMES = { KeyW: "w", KeyA: "a", KeyD: "d", Space: " ", ShiftLeft: "Shift" };
async function keyEvent(page, type, code) {
  await page.evaluate(
    ([t, c, k]) => {
      const ev = new KeyboardEvent(t, { code: c, key: k, bubbles: true, cancelable: true });
      window.dispatchEvent(ev);
      document.dispatchEvent(ev);
    },
    [type, code, KEY_NAMES[code] ?? code],
  );
}

function stats(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    n: xs.length,
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
    p50: q(0.5), p95: q(0.95), p99: q(0.99),
    min: s[0], worst: s[s.length - 1],
    over16: xs.filter((x) => x > 16.7).length,
    over20: xs.filter((x) => x > 20).length,
    over33: xs.filter((x) => x > 33.4).length,
  };
}
const f2 = (x) => (x == null ? "  n/a" : x.toFixed(2));

/** Aggregate a CDP CPU profile into self-time per function. */
function selfTimes(profile) {
  const byId = new Map();
  for (const n of profile.nodes) byId.set(n.id, n);
  const self = new Map();
  const total = { ms: 0 };
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < profile.samples.length; i += 1) {
    const dt = (deltas[i] ?? 0) / 1000; // µs -> ms
    if (dt < 0) continue;
    total.ms += dt;
    const node = byId.get(profile.samples[i]);
    if (!node) continue;
    const cf = node.callFrame;
    const url = (cf.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
    const key = `${cf.functionName || "(anonymous)"}  ${url}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + dt);
  }
  const rows = [...self.entries()].sort((a, b) => b[1] - a[1]);
  return { rows, totalMs: total.ms };
}

async function main() {
  const args = [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
  ];
  if (has("novsync")) {
    args.push("--disable-frame-rate-limit", "--disable-gpu-vsync", "--max-gum-fps=1000");
  }

  const PROFILE = String(arg("profile", join(tmpdir(), "desk-profile-profile")));
  if (has("fresh")) await rm(PROFILE, { recursive: true, force: true });

  const context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    headless: true,
    args,
    viewport: { width: W, height: H },
    deviceScaleFactor: DPR,
  });
  const browser = context.browser() ?? { close: () => context.close() };
  await context.addInitScript(initScript, { counters: has("counters") });

  const page = context.pages()[0] ?? (await context.newPage());
  const logs = [];
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || has("console")) logs.push(`[${m.type()}] ${m.text()}`);
  });

  const cdp = await context.newCDPSession(page);
  if (CPU > 0) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });

  // ---- boot, and time it ---------------------------------------------------
  const t0 = Date.now();
  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: Number(arg("timeout", 300000)) });
  const tDom = Date.now();
  await page.waitForSelector("canvas", { timeout: Number(arg("timeout", 300000)) });
  const tCanvas = Date.now();
  await page
    .waitForSelector('[data-act="play"]', { timeout: Number(arg("timeout", 300000)) })
    .catch(() => {});
  const tPlay = Date.now();

  const boot = {
    domContentLoaded: tDom - t0,
    canvasPresent: tCanvas - t0,
    playButton: tPlay - t0,
  };

  // ---- drop in, then PROVE we are in gameplay ------------------------------
  const btn = await page.$('[data-act="play"]');
  if (btn) await page.evaluate((el) => el.click(), btn);
  else await page.mouse.click(W / 2, H / 2);
  await sleep(2500); // let the world settle and the meter converge

  // Assertion, not an assumption: the title button is gone, frames are being
  // produced, and the game's own speed readout answers to the W key. A profile
  // taken on the loading screen is indistinguishable from a very fast game.
  await keyEvent(page, "keydown", "KeyW");
  await sleep(900);
  const live = await page.evaluate(() => {
    const el = document.querySelector("#speedo .n");
    return {
      speed: el ? Number(el.textContent) : NaN,
      playStillThere: !!document.querySelector('[data-act="play"]'),
      frames: window.__prof?.frames.length ?? 0,
      msRTT: (() => {
        // Does this driver resolve MSAA implicitly? If the extension is present
        // three never issues a resolve blit at all, which is the difference
        // between `resolveDepthBuffer` being worth milliseconds and worth zero.
        try {
          const c = document.createElement("canvas");
          const gl = c.getContext("webgl2");
          return !!gl?.getExtension("WEBGL_multisampled_render_to_texture");
        } catch { return null; }
      })(),
    };
  });
  await keyEvent(page, "keyup", "KeyW");
  // The gate is the SPEED READOUT and the frame count, and deliberately not the
  // title button: measured, `[data-act="play"]` stays in the DOM after it is
  // used (the title screen hides itself rather than unmounting), so "detached"
  // was a wrong assumption of mine and is reported as information only. A speed
  // the W key put there cannot be produced by a loading screen.
  const gameplayOk = live.speed > 0 && live.frames > 30;
  console.log(
    `\n=== desk-profile  [${LABEL}] ===\n` +
    `gameplay       ${gameplayOk ? "OK" : "*** NOT IN GAMEPLAY ***"} — ` +
    `speed ${live.speed} km/h with W held · ${live.frames} frames seen · ` +
    `title button still in DOM ${live.playStillThere} · implicit-MSAA ext ${live.msRTT}`,
  );
  if (!gameplayOk) {
    console.log("REFUSING to report timings: the harness never reached gameplay.");
    await browser.close();
    process.exit(3);
  }
  await sleep(600);
  const loadBefore = loadavg();

  // Reset the frame log so the ride is measured, not the title screen.
  await page.evaluate(() => {
    const w = window;
    w.__prof.frames.length = 0;
    w.__prof.jsTimes.length = 0;
    w.__prof.gl.length = 0;
  });

  // ---- ride, with the profiler running over exactly this stretch ----------
  if (WANT_PROFILE) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: INTERVAL });
    await cdp.send("Profiler.start");
  }

  // ── A CENSUS PAIR NEEDS A FIXED VIEWPOINT ──────────────────────────────────
  // Draw calls and triangles per frame are FRUSTUM-dependent, so a census taken
  // after 5 s of riding fingerprints wherever the skater happened to end up, not
  // the change. Measured the hard way: the same tree censused after a ride gave
  // 109 scene draws in one run and 173 in another. `--still` skips the ride so
  // the camera sits at the settled spawn view, which is the same in every run
  // and makes two censuses comparable.
  if (has("still")) {
    await sleep(1200);
    if (has("counters")) {
      await page.evaluate(() => { window.__censusArm = true; });
      await sleep(400);
      const stillCensus = await page.evaluate(() => window.__censusDone ?? null);
      if (stillCensus) reportCensus(stillCensus, "STILL, settled spawn view");
    }
    await browser.close();
    return;
  }

  // A representative stretch of actual play: push, carve both ways, a pop.
  await keyEvent(page, "keydown", "KeyW");
  await sleep(RIDE * 0.3);
  await keyEvent(page, "keydown", "KeyA");
  await sleep(RIDE * 0.2);
  await keyEvent(page, "keyup", "KeyA");
  await keyEvent(page, "keydown", "KeyD");
  await sleep(RIDE * 0.2);
  await keyEvent(page, "keyup", "KeyD");
  await keyEvent(page, "keydown", "Space");
  await sleep(160);
  await keyEvent(page, "keyup", "Space");
  await sleep(RIDE * 0.3);
  await keyEvent(page, "keyup", "KeyW");

  let profile = null;
  if (WANT_PROFILE) profile = (await cdp.send("Profiler.stop")).profile;
  const loadAfter = loadavg();

  // ---- one-frame per-pass census ------------------------------------------
  let census = null;
  if (has("counters")) {
    await page.evaluate(() => { window.__censusArm = true; });
    await sleep(400);
    census = await page.evaluate(() => window.__censusDone ?? null);
  }

  const prof = await page.evaluate(() => {
    const w = window;
    return {
      frames: w.__prof.frames.slice(),
      jsTimes: w.__prof.jsTimes.slice(),
      gl: w.__prof.gl.slice(),
      drawsTotal: w.__prof.drawsTotal,
      dpr: window.devicePixelRatio,
      canvases: [...document.querySelectorAll("canvas")].map((c) => ({
        w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight,
      })),
    };
  });

  // Drop the first few frames: the keydown lands mid-frame and the first frame
  // after a reset has no predecessor.
  const frames = prof.frames.slice(3).filter((x) => x > 0 && x < 2000);
  const jsTimes = prof.jsTimes.slice(3).filter((x) => x >= 0 && x < 2000);
  const fs = stats(frames);
  const js = stats(jsTimes);

  const lv = (a) => a.map((x) => x.toFixed(2)).join("/");
  console.log(`loadavg        before ${lv(loadBefore)} → after ${lv(loadAfter)}  (1/5/15 min, 12 cores)`);
  console.log(`boot           domContentLoaded ${boot.domContentLoaded} ms · canvas ${boot.canvasPresent} ms · DROP IN available ${boot.playButton} ms`);
  console.log(`canvases       ${prof.canvases.map((c) => `${c.w}x${c.h} css ${c.cw}x${c.ch}`).join(" · ")}  (devicePixelRatio ${prof.dpr})`);
  if (fs) {
    console.log(
      `frame period   n=${fs.n} mean ${f2(fs.mean)} ms (${(1000 / fs.mean).toFixed(1)} fps) ` +
      `p50 ${f2(fs.p50)} p95 ${f2(fs.p95)} p99 ${f2(fs.p99)} worst ${f2(fs.worst)} min ${f2(fs.min)}`,
    );
    console.log(
      `               over 16.7 ms: ${fs.over16}/${fs.n} (${((fs.over16 / fs.n) * 100).toFixed(1)}%) · ` +
      `over 20: ${fs.over20} · over 33.4 (dropped to 30): ${fs.over33}`,
    );
  }
  if (js) {
    console.log(
      `js in callback mean ${f2(js.mean)} ms  p50 ${f2(js.p50)} p95 ${f2(js.p95)} p99 ${f2(js.p99)} worst ${f2(js.worst)}`,
    );
    if (fs) {
      const idle = fs.mean - js.mean;
      console.log(
        `               => js is ${((js.mean / fs.mean) * 100).toFixed(1)}% of the frame period; ` +
        `idle/wait ${f2(idle)} ms`,
      );
    }
  }

  if (prof.gl.length) {
    const g = prof.gl.slice(3).filter((x) => x.draws > 0);
    const pick = (k) => stats(g.map((x) => x[k]));
    const line = (k) => {
      const s = pick(k);
      return s ? `${k} mean ${s.mean.toFixed(1)} p95 ${s.p95} worst ${s.worst}` : `${k} n/a`;
    };
    console.log(`gl per frame   ${line("draws")}`);
    console.log(`               ${line("verts")}  (÷3 = triangles, all TRIANGLES mode)`);
    console.log(`               ${line("progs")} · ${line("texBinds")}`);
    console.log(`               ${line("fbo")} · ${line("clears")} · ${line("uniforms")} · ${line("vao")}`);
    console.log(`               ${line("instanced")} · ${line("viewport")} · ${line("scissor")}`);

    // ── THE SHADOW WITNESS ───────────────────────────────────────────────────
    // Per frame: was the 3072² shadow map drawn, and was the composer running?
    // The pair is what proves the `shadowMap.needsUpdate` guard covers the
    // governor's post-off bypass as well as the normal path.
    const withPost = g.filter((x) => x.meter > 0);
    const noPost = g.filter((x) => x.meter === 0);
    const shadowed = (rows) => rows.filter((x) => x.shadow > 0).length;
    const sides = (rows) => {
      const u = [...new Set(rows.map((x) => x.shadowSide).filter(Boolean))].sort((a, b) => a - b);
      return u.length ? u.join('/') : 'none';
    };
    const passes = (rows) => {
      // 171-ish draws is one shadow pass; ~342 is two. Report the median so a
      // regression from one pass back to two is visible.
      const v = rows.map((x) => x.shadow).sort((a, b) => a - b);
      return v.length ? v[Math.floor(v.length / 2)] : 0;
    };
    console.log(
      `shadow witness POST ON : ${shadowed(withPost)}/${withPost.length} frames drew the shadow map` +
      ` (median ${passes(withPost)} draws, sides ${sides(withPost)})`,
    );
    console.log(
      `               POST OFF: ${shadowed(noPost)}/${noPost.length} frames drew the shadow map` +
      ` (median ${passes(noPost)} draws, sides ${sides(noPost)})`,
    );
    if (noPost.length === 0) {
      console.log(`               (the governor never reached post-off in this run)`);
    } else if (shadowed(noPost) < noPost.length) {
      console.log(
        `               *** SHADOWS FROZE on the post-off path — ` +
        `${noPost.length - shadowed(noPost)} frames drew no shadow map ***`,
      );
    }
  }

  if (census && census.length) reportCensus(census, "one frame of the ride");

  if (profile) {
    const { rows, totalMs } = selfTimes(profile);
    console.log(`\ncpu profile    ${totalMs.toFixed(0)} ms of samples, top ${TOP} by SELF time`);
    let shown = 0;
    for (const [key, ms] of rows) {
      if (shown >= TOP) break;
      shown += 1;
      const pct = ((ms / totalMs) * 100).toFixed(2);
      console.log(`  ${String(pct).padStart(6)}%  ${ms.toFixed(1).padStart(8)} ms  ${key}`);
    }
  }

  if (JSON_OUT) {
    await mkdir(dirname(String(JSON_OUT)), { recursive: true });
    await writeFile(
      String(JSON_OUT),
      JSON.stringify({ label: LABEL, boot, frames, jsTimes, gl: prof.gl, canvases: prof.canvases, profile }, null, 1),
    );
    console.log(`\njson           ${JSON_OUT}`);
  }

  await browser.close();
  if (logs.length) {
    console.error(`\n--- page console (${logs.length}) ---`);
    for (const l of logs.slice(0, 40)) console.error(l);
  }
}

/** Group consecutive draws by (framebuffer, viewport) and print the passes. */
function reportCensus(census, what) {
  {
    // The grouping is by RUN, not by key, because a target written twice in a
    // frame (the composer ping-pong) is two passes, not one.
    const runs = [];
    for (const d of census) {
      const key = `${d.fbo}@${d.vw}x${d.vh}`;
      const last = runs[runs.length - 1];
      if (last && last.key === key) {
        last.draws += 1; last.verts += d.verts; last.instances += d.instances;
        last.progs.add(d.prog);
        last.fat = Math.max(last.fat, d.verts);
      } else {
        runs.push({
          key, fbo: d.fbo, vw: d.vw, vh: d.vh, draws: 1, verts: d.verts,
          instances: d.instances, progs: new Set([d.prog]), fat: d.verts,
        });
      }
    }
    const totV = census.reduce((a, d) => a + d.verts, 0);
    console.log(`\nper-pass census  [${what}]: ${census.length} draws, ${(totV / 3 / 1e6).toFixed(2)} M triangles`);
    console.log(`  #  fbo   viewport      draws      triangles   %tri  progs  fattest draw`);
    runs.forEach((r, i) => {
      console.log(
        `  ${String(i).padStart(2)}  ${String(r.fbo).padStart(3)}   ` +
        `${`${r.vw}x${r.vh}`.padEnd(12)} ${String(r.draws).padStart(6)}   ` +
        `${(r.verts / 3).toFixed(0).padStart(12)}  ${((r.verts / totV) * 100).toFixed(1).padStart(5)}  ` +
        `${String(r.progs.size).padStart(5)}  ${(r.fat / 3).toFixed(0).padStart(9)} tri`,
      );
    });
    // The fattest individual draws in the frame, wherever they landed.
    const fattest = [...census].sort((a, b) => b.verts - a.verts).slice(0, 12);
    console.log(`  fattest single draws (tri · fbo · viewport · instances):`);
    for (const d of fattest) {
      console.log(`     ${(d.verts / 3).toFixed(0).padStart(9)}  fbo ${String(d.fbo).padStart(3)}  ${d.vw}x${d.vh}  x${d.instances}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
