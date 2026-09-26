// tools/depth-probe.mjs — is the scene depth texture actually being FILLED?
//
// A REVIEW tool. It adds nothing to the bundle and the game exposes nothing for
// it: everything below wraps `WebGL2RenderingContext.prototype` from an init
// script that runs before any of the page's own modules, which is the same
// technique `tools/desk-profile.mjs` and `tools/gpu-audit.mjs` already use. No
// game code is touched and no flag is added to it.
//
//   node tools/depth-probe.mjs --url http://localhost:5199/?genex_local_test=1
//
// ── WHY IT EXISTS ────────────────────────────────────────────────────────────
//
// On 2026-07-30 the post chain stopped rendering GTAO's normal prepass and
// started reading scene depth off the composer's own target instead. The frame
// came back with EVERY pixel blurred — foreground, midground and background
// alike, at a standstill — which is precisely what `distance-blur.ts` draws when
// its depth sample reads 1.0 everywhere: `farFactor` returns 1.0 for the cleared
// far plane, so a depth texture that is empty means "the whole world is at
// infinity" and the disc opens to full radius on every pixel.
//
// A screenshot cannot tell an empty depth texture from a wrongly-encoded one
// from one that is filled and read at the wrong moment. These four counters can:
//
//   blitFramebuffer   how many resolves ran, and how many carried DEPTH_BUFFER_BIT
//   texImage2D /      any (re)allocation of a DEPTH_COMPONENT* texture AFTER
//   texStorage2D      boot is a depth surface being thrown away and re-made
//   invalidateFramebuffer  three discards the depth attachment whenever
//                     `resolveDepthBuffer === false`; if that lands between the
//                     fill and the read, the read gets nothing
//   getError          checked immediately after every blit, because a depth blit
//                     whose formats disagree fails silently as far as pixels go
//
// Every count is reported for the STEADY STATE — the last few seconds of the
// run, after boot has stopped allocating — because boot legitimately allocates
// everything once and that is not the question being asked.

import { chromium } from "playwright-core";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL_ = arg("url", "http://localhost:5173/?genex_local_test=1");
const PROFILE = arg("profile", "/tmp/depth-probe-profile");
const SECONDS = Number(arg("seconds", 25));

const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  headless: true,
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
  ],
  viewport: { width: 1280, height: 800 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

await page.addInitScript(() => {
  const P = WebGL2RenderingContext.prototype;
  const S = {
    blits: 0,
    depthBlits: 0,
    blitErrors: [],
    attach: [],
    depthAlloc: [],
    invalidates: 0,
    depthInvalidates: 0,
    frames: 0,
  };
  window.__depthProbe = S;

  // ── TEXTURE IDENTITY TRACE ──────────────────────────────────────────────
  // Every GL texture gets a number the moment it is created, so "the surface
  // the framebuffer writes" and "the surface the sampler reads" can be compared
  // as identities rather than as two readbacks that might be of the same thing.
  let nextId = 1;
  const idOf = (t) => {
    if (!t) return "null";
    if (!S.ids.has(t)) S.ids.set(t, nextId++);
    return S.ids.get(t);
  };
  S.ids = new WeakMap();
  S.trace = [];
  const log = (line) => { if (S.trace.length < 90) S.trace.push(`f${S.frames} ${line}`); };
  window.__idOf = idOf;

  const rawDelTex = P.deleteTexture;
  P.deleteTexture = function (t) { if (S.ids.has(t)) log(`deleteTexture #${idOf(t)}`); return rawDelTex.call(this, t); };

  const rawBlit = P.blitFramebuffer;
  P.blitFramebuffer = function (sx0, sy0, sx1, sy1, dx0, dy0, dx1, dy1, mask, filter) {
    rawBlit.call(this, sx0, sy0, sx1, sy1, dx0, dy0, dx1, dy1, mask, filter);
    S.blits += 1;
    if (mask & this.DEPTH_BUFFER_BIT) {
      S.depthBlits += 1;
      const e = this.getError();
      if (e !== this.NO_ERROR && S.blitErrors.length < 12) {
        S.blitErrors.push(`${e} @ ${sx1 - sx0}x${sy1 - sy0}`);
      }
      // ── THE QUESTION A GL ERROR CANNOT ANSWER ──────────────────────────
      // ES 3.0 §4.3.2: "If a buffer is specified in mask and does not exist
      // in BOTH the read and draw framebuffers, the corresponding bit is
      // silently ignored." So a depth resolve into a draw framebuffer with no
      // depth attachment succeeds, reports NO_ERROR, and copies nothing. The
      // only way to tell that apart from a working resolve is to ask what is
      // attached to each end.
      if (S.attach.length < 6) {
        const q = (t) => {
          const type = this.getFramebufferAttachmentParameter(
            t, this.DEPTH_ATTACHMENT, this.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE,
          );
          return type === this.TEXTURE ? "TEXTURE"
            : type === this.RENDERBUFFER ? "RENDERBUFFER"
            : type === this.NONE ? "NONE" : `?${type}`;
        };
        S.attach.push(`read=${q(this.READ_FRAMEBUFFER)} draw=${q(this.DRAW_FRAMEBUFFER)} ${sx1 - sx0}x${sy1 - sy0}`);
        // The texture the resolve actually WRITES INTO — not the last one
        // anything attached anywhere, which is a different question.
        const filled = this.getFramebufferAttachmentParameter(
          this.DRAW_FRAMEBUFFER, this.DEPTH_ATTACHMENT, this.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME,
        );
        S.sameAsLastAttached = filled === S.depthTex;
        if (S.filledTex !== filled) log(`DEPTH RESOLVE writes texture #${idOf(filled)}`);
        S.filledTex = filled;
      }
    }
  };

  const DEPTH_INTERNAL = new Set([
    0x81a5 /* DEPTH_COMPONENT16 */, 0x81a6 /* DEPTH_COMPONENT24 */,
    0x8cac /* DEPTH_COMPONENT32F */, 0x88f0 /* DEPTH24_STENCIL8 */,
    0x8cad /* DEPTH32F_STENCIL8 */, 0x1902 /* DEPTH_COMPONENT */,
    0x84f9 /* DEPTH_STENCIL */,
  ]);
  const note = (call, fmt, w, h) => {
    if (!DEPTH_INTERNAL.has(fmt)) return;
    S.depthAlloc.push(`f${S.frames} ${call} 0x${fmt.toString(16)} ${w}x${h}`);
    if (S.depthAlloc.length > 40) S.depthAlloc.shift();
    if (S.gl) log(`ALLOC ${call} 0x${fmt.toString(16)} ${w}x${h} into #${idOf(S.gl.getParameter(S.gl.TEXTURE_BINDING_2D))}`);
  };
  const rawStorage = P.texStorage2D;
  P.texStorage2D = function (t, levels, fmt, w, h) {
    note("texStorage2D", fmt, w, h);
    return rawStorage.call(this, t, levels, fmt, w, h);
  };
  const rawImage = P.texImage2D;
  P.texImage2D = function (...a) {
    if (a.length >= 6) note("texImage2D", a[2], a[3], a[4]);
    return rawImage.apply(this, a);
  };
  const rawInval = P.invalidateFramebuffer;
  P.invalidateFramebuffer = function (target, attachments) {
    S.invalidates += 1;
    for (const a of attachments) {
      // DEPTH_ATTACHMENT / DEPTH_STENCIL_ATTACHMENT
      if (a === 0x8d00 || a === 0x821a) S.depthInvalidates += 1;
    }
    return rawInval.call(this, target, attachments);
  };

  // ── WHICH TEXTURE DOES THE BLUR'S `tDepth` SAMPLER ACTUALLY SEE? ───────
  //
  // The counters can prove the resolve filled texture X. They cannot prove the
  // shader READS X — and "filled the right surface, sampled a different one" is
  // a real failure mode whenever a texture is disposed and re-made underneath a
  // uniform. `tDepth` is a name only the distance blur's program declares, so
  // finding a program that has that uniform location identifies the pass, and
  // the sampler's unit identifies the texture object it is bound to.
  const rawDraw = P.drawArrays;
  P.drawArrays = function (mode, first, count) {
    if (S.wantProbe) {
      const prog = this.getParameter(this.CURRENT_PROGRAM);
      const loc = prog && this.getUniformLocation(prog, "tDepth");
      if (loc) {
        const unit = this.getUniform(prog, loc);
        const active = this.getParameter(this.ACTIVE_TEXTURE);
        this.activeTexture(this.TEXTURE0 + unit);
        const bound = this.getParameter(this.TEXTURE_BINDING_2D);
        this.activeTexture(active);
        const u = (n) => { const l = this.getUniformLocation(prog, n); return l ? this.getUniform(prog, l) : "absent"; };
        S.blurUniforms = {
          uCamera: Array.from(u("uCamera") ?? []),
          uFog: Array.from(u("uFog") ?? []),
          uAspect: u("uAspect"),
          uRadius: u("uRadius"),
        };
        log(`BLUR tDepth sampler reads texture #${idOf(bound)}`);
        S.blurSamples = {
          unit,
          isTheBlitTarget: bound === S.filledTex,
          isTheLastAttached: bound === S.depthTex,
          bound: bound === null ? "NULL — three bound its empty texture" : "a texture",
        };
        S.blurTex = bound;
        S.wantProbe = false;
      }
    }
    return rawDraw.call(this, mode, first, count);
  };

  // Remember the last texture anyone attached as a DEPTH_ATTACHMENT, and the
  // context it belongs to, so the readback below can sample the real thing.
  const rawFbTex = P.framebufferTexture2D;
  P.framebufferTexture2D = function (target, attachment, textarget, tex, level) {
    if (attachment === this.DEPTH_ATTACHMENT || attachment === this.DEPTH_STENCIL_ATTACHMENT) {
      log(`ATTACH depth texture #${idOf(tex)}`);
      S.depthTex = tex;
      S.gl = this;
    }
    return rawFbTex.call(this, target, attachment, textarget, tex, level);
  };

  // ── READ THE DEPTH BACK ────────────────────────────────────────────────
  //
  // Counters prove the resolve RAN; they cannot prove what is in the surface.
  // `readPixels` cannot read a depth attachment in WebGL2, so this samples the
  // texture with its own one-off program and writes the value into an RGBA8
  // target it owns, 8 bits at a time, which readPixels CAN read. Nothing here
  // touches the game: it runs once, after the measurement window, in its own
  // program and its own framebuffer.
  window.__readDepth = (n = 9, pick = 'blit') => {
    S.pick = pick;
    const gl = S.gl;
    const src = S.pick === 'blur' ? S.blurTex : (S.filledTex ?? S.depthTex);
    if (!gl || !src) return { error: "no depth attachment was ever seen" };
    const vs = `#version 300 es
      in vec2 p; out vec2 v;
      void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
    const fs = `#version 300 es
      precision highp float; precision highp sampler2D;
      uniform sampler2D d; in vec2 v; out vec4 o;
      void main(){
        float z = texture(d, v).x;
        // 24 bits of the depth value spread over three 8-bit channels.
        float s = z * 255.0;      float r = floor(s) / 255.0;
        float s2 = fract(s) * 255.0; float g = floor(s2) / 255.0;
        o = vec4(r, g, fract(s2), 1.0);
      }`;
    const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(prog, 0, "p");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { error: gl.getProgramInfoLog(prog) };
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, n, n);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    // Read the sampler state the GAME left on this texture BEFORE changing any
    // of it — that state is what every other shader in the chain sees.
    S.samplerState = {
      compareMode: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE),
      compareFunc: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC),
      minFilter: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER),
      magFilter: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER),
      baseLevel: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL),
      maxLevel: gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL),
      NONE: gl.NONE, COMPARE_REF_TO_TEXTURE: gl.COMPARE_REF_TO_TEXTURE,
      NEAREST: gl.NEAREST, LINEAR: gl.LINEAR,
      NEAREST_MIPMAP_NEAREST: gl.NEAREST_MIPMAP_NEAREST,
      LINEAR_MIPMAP_LINEAR: gl.LINEAR_MIPMAP_LINEAR,
    };
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.NONE);
    gl.uniform1i(gl.getUniformLocation(prog, "d"), 0);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(n * n * 4);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const err = gl.getError();
    const grid = [];
    for (let y = 0; y < n; y += 1) {
      const row = [];
      for (let x = 0; x < n; x += 1) {
        const i = (y * n + x) * 4;
        row.push(((px[i] * 65536 + px[i + 1] * 256 + px[i + 2]) / 16777215).toFixed(4));
      }
      grid.push(row.join(" "));
    }
    gl.bindVertexArray(null);
    return { pick, trace: S.trace, blurUniforms: S.blurUniforms, blurSamples: S.blurSamples, samplerStateTheGameLeft: S.samplerState, glError: err, readingTheBlitTarget: !!S.filledTex, sameAsLastAttached: S.sameAsLastAttached, gridBottomRowFirst: grid };
  };

  const rafTick = () => {
    S.frames += 1;
    requestAnimationFrame(rafTick);
  };
  requestAnimationFrame(rafTick);
});

await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 300000 });
await page.waitForSelector("#loader", { state: "detached", timeout: 400000 });
await page.waitForTimeout(1200);
const btn = await page.$('[data-act="play"]');
if (btn) await btn.click();
await page.waitForTimeout(3000);

// Zero the counters, then watch a quiet window of steady-state frames only.
await page.evaluate(() => {
  const S = window.__depthProbe;
  S.blits = 0; S.depthBlits = 0; S.blitErrors = []; S.attach = [];
  S.invalidates = 0; S.depthInvalidates = 0; S.__f0 = S.frames;
});
await page.waitForTimeout(SECONDS * 1000);
const out = await page.evaluate(() => {
  const S = window.__depthProbe;
  const n = Math.max(1, S.frames - S.__f0);
  return {
    frames: n,
    blitsPerFrame: (S.blits / n).toFixed(2),
    depthBlitsPerFrame: (S.depthBlits / n).toFixed(2),
    blitErrors: S.blitErrors,
    depthAttachments: S.attach,
    depthAllocInSteadyState: S.depthAlloc,
    invalidatesPerFrame: (S.invalidates / n).toFixed(2),
    depthInvalidatesPerFrame: (S.depthInvalidates / n).toFixed(2),
  };
});
console.log(JSON.stringify(out, null, 2));
await page.evaluate(() => { window.__depthProbe.wantProbe = true; });
await page.waitForTimeout(500);
console.log('THE TEXTURE THE BLUR SAMPLES:');
console.log(JSON.stringify(await page.evaluate(() => window.__readDepth(9, 'blur')), null, 2));
await ctx.close();
