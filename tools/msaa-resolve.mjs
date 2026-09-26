// Does a 4x MSAA resolve of FOUR IDENTICAL half-float samples return that value
// bit-exactly? — the one question standing between us and 125 MiB of desktop VRAM.
//
// WHY THIS EXISTS. `look.ts`'s `composer.renderTarget2` is allocated with
// `samples: 4`, and the post lane established structurally that every write into
// it is a viewport-covering full-screen quad: GTAO's copy (opaque, `NoBlending`
// since three 0.185.1's `GTAOPass.js:577`) and the shutter. Multisampling only
// differs from single-sampling under PARTIAL PIXEL COVERAGE, and a quad that
// covers every pixel has none — so the multisample renderbuffer provably holds
// four bit-identical copies at every pixel. Dropping to `samples: 0` therefore
// reclaims 125 MiB (2560x1600 x RGBA16F x 3 extra samples) and two full-resolution
// colour resolves a frame.
//
// The lane declined to ship it anyway, and was right to. The last step of the
// argument is that the DRIVER's resolve of four identical half-floats returns that
// value exactly. Every real implementation does — the resolve is a weighted average
// whose weights sum to one, and 0.25*(4x v) is exact in IEEE754 for any v with a
// clean binary quarter... which is every value, since dividing by 4 only shifts the
// exponent. But that is a driver property, not a code property, and the player's
// mandate is "not one pixel" — so the claim degraded from "this buffer is never
// read" to "this reads the same", which is a different kind of promise.
//
// So: measure it. This is not a game harness — it never loads the game, never
// touches src/, and answers one question about THIS machine's driver.
//
// WHAT IT DOES. Renders the same fragment shader into two RGBA16F targets at the
// real desktop buffer size (2560x1600): one with `samples: 4` (blitted down to a
// single-sample target, which is exactly what three's `updateMultisampleRenderTarget`
// does), one with no multisampling at all. Reads both back as raw half-float bits
// and compares them INTEGER-wise, not with an epsilon — an epsilon would answer a
// weaker question than the one that was asked.
//
// The shader deliberately spans the awkward parts of the format: values through the
// subnormal range (below 2^-14, where a half's mantissa loses bits), values above
// 1.0 (this chain is HDR on purpose — `look.ts:842-844` needs headroom above white),
// and a per-pixel hash so no two neighbours share a value and a lazy resolve cannot
// pass by accident.
//
//   node tools/msaa-resolve.mjs
//
// Exit 0 = bit-identical, the item is safe to take on this driver. Exit 1 = they
// differ, and the decline stands. Either way it settles THIS machine, not every GPU
// a player might have — which is itself worth writing down next to the result.

import { chromium } from "playwright-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = 2560;
const H = 1600;
const SAMPLES = 4;

const page = await (
  await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=metal"] })
).newPage();

page.on("console", (m) => console.log(`  [page] ${m.text()}`));

const result = await page.evaluate(
  async ({ W, H, SAMPLES }) => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const gl = canvas.getContext("webgl2", { antialias: false });
    if (!gl) return { error: "no webgl2" };
    if (!gl.getExtension("EXT_color_buffer_half_float") && !gl.getExtension("EXT_color_buffer_float")) {
      return { error: "no half-float colour buffer" };
    }

    const maxSamples = gl.getParameter(gl.MAX_SAMPLES);
    const renderer = (() => {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "(masked)";
    })();

    // A full-screen triangle, covering every pixel — the whole premise of the item.
    const vs = `#version 300 es
      void main() {
        vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
        gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
      }`;
    // Per-pixel hash across the half's awkward ranges: subnormals, ordinary values,
    // and HDR values well above 1.0. No two neighbours share a value.
    const fs = `#version 300 es
      precision highp float;
      out vec4 frag;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 c = gl_FragCoord.xy;
        float a = hash(c);
        float b = hash(c + 17.0);
        frag = vec4(
          a * 64512.0,              // up to just under half's max finite (65504)
          b * 1e-5,                 // subnormal territory (< 2^-14 ~ 6.1e-5)
          a * 8.0 - 4.0,            // HDR, signed
          mix(0.25, 4.0, b)         // ordinary, always exact-ish quarters at the ends
        );
      }`;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindVertexArray(gl.createVertexArray());
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.viewport(0, 0, W, H);

    // ── the single-sample reference ──────────────────────────────────────────
    const plainTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, plainTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, W, H);
    const plainFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, plainFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, plainTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ── the 4x multisampled path, resolved exactly the way three resolves it ──
    const msRb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, msRb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, SAMPLES, gl.RGBA16F, W, H);
    const msFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msRb);
    const realSamples = gl.getParameter(gl.SAMPLES);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const resolvedTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, resolvedTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, W, H);
    const resolvedFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, resolvedFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resolvedTex, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolvedFbo);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);

    // ── read both back as RAW HALF BITS and compare as integers ──────────────
    const read = (fbo) => {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);
      const px = new Uint16Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.HALF_FLOAT, px);
      return px;
    };
    const a = read(plainFbo);
    const b = read(resolvedFbo);

    let differing = 0;
    let worstBits = 0;
    let firstAt = -1;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === b[i]) continue;
      differing += 1;
      if (firstAt < 0) firstAt = i;
      const d = Math.abs(a[i] - b[i]);
      if (d > worstBits) worstBits = d;
    }
    const err = gl.getError();
    return {
      renderer,
      maxSamples,
      realSamples,
      components: a.length,
      differing,
      worstBits,
      firstAt,
      glError: err === gl.NO_ERROR ? null : err,
    };
  },
  { W, H, SAMPLES },
);

console.log(`\n  MSAA ${SAMPLES}x resolve vs single-sample, RGBA16F ${W}x${H}\n`);
if (result.error) {
  console.log(`  ✗ ${result.error}`);
  process.exit(2);
}
console.log(`  GPU              ${result.renderer}`);
console.log(`  MAX_SAMPLES      ${result.maxSamples}   (asked ${SAMPLES}, got ${result.realSamples})`);
console.log(`  components       ${result.components.toLocaleString()}`);
console.log(`  differing bits   ${result.differing.toLocaleString()}`);
if (result.differing) console.log(`  worst delta      ${result.worstBits} raw half bits, first at index ${result.firstAt}`);
if (result.glError) console.log(`  GL error         ${result.glError}`);

const pass = result.differing === 0 && result.realSamples === SAMPLES && !result.glError;
console.log(
  pass
    ? `\n  ✓ BIT-IDENTICAL on this driver — dropping renderTarget2 to samples:0 cannot move a pixel here.\n    Settles THIS machine only; a different GPU is a different driver.\n`
    : `\n  ✗ NOT bit-identical — the decline stands.\n`,
);
process.exit(pass ? 0 : 1);
