// tools/gpu-audit.mjs — MEASURE the GPU memory this game actually holds.
//
// This is a REVIEW tool, not game code. It adds nothing to the bundle and the
// game exposes nothing for it. Every number below is read off the WebGL driver
// calls three.js makes, from OUTSIDE the game, by wrapping
// `WebGL2RenderingContext.prototype` in an init script that runs before any of
// the page's own modules load. The game is not modified, not flagged, and does
// not know it is being watched — which is the only way a number like this is
// worth anything.
//
// WHY GL-LEVEL AND NOT `renderer.info.memory`. `info.memory` gives COUNTS
// (textures: 47, geometries: 210) and no sizes at all. The sizes are the whole
// question. Every allocation a WebGL2 context can make goes through exactly
// five entry points, and all five are wrapped here:
//
//   texStorage2D / texStorage3D      immutable textures — three r150+ takes
//                                    this path for nearly everything, and the
//                                    call itself carries the LEVEL COUNT, so
//                                    the mip chain is measured, not estimated
//   texImage2D / texImage3D          the mutable path (render targets, some
//                                    DataTextures) — level-by-level
//   compressedTexImage2D             KTX2/BasisU, once transcoded
//   renderbufferStorage(Multisample) depth/stencil and MSAA colour surfaces
//   bufferData                       every vertex/index buffer
//
// Deletes are wrapped too (`deleteTexture`/`deleteBuffer`/`deleteRenderbuffer`),
// so what is reported is LIVE memory at the moment of the dump, not the sum of
// everything that was ever uploaded. That distinction matters here: the boot
// path disposes stand-in textures as the generated ones land.
//
// ATTRIBUTION. A GL call knows a size, not a name. Names come from the upload
// SOURCE, captured at `texSubImage2D`/`texImage2D`:
//   · HTMLImageElement  -> its real URL (every `TextureLoader` asset)
//   · ImageBitmap       -> the blob it was decoded from, and its byte length,
//                          which is matched against the static GLB inventory
//                          (`--assets`) to name the GLB it came out of
//   · HTMLCanvasElement -> "canvas" (the procedural stand-ins)
//   · ArrayBufferView   -> "data" (DataTexture / the cloud noise volume)
//   · null              -> "target" (a render target's own surface)
//
// USAGE
//   npm run dev                                    # in another shell
//   node tools/gpu-audit.mjs --tier low            # phone-low
//   node tools/gpu-audit.mjs --tier medium         # phone
//   node tools/gpu-audit.mjs --tier high           # desktop (regression check)
//   node tools/gpu-audit.mjs --all                 # all three, one table
//   node tools/gpu-audit.mjs --assets              # no browser: static asset
//                                                  # inventory, per tier rung
//
// FLAGS
//   --tier low|medium|high|auto   the game's OWN persisted Quality setting
//                                 (localStorage `genex:quality`), seeded before
//                                 boot. `low` -> phone-low, `medium` -> phone,
//                                 `high` -> desktop. Not a debug hook: it is
//                                 the same value the settings screen writes.
//   --all                         run low, medium and high in one go
//   --assets                      static inventory only (no browser needed)
//   --url <u>                     default http://localhost:5173/?genex_local_test=1
//   --play                        click DROP IN and ride for a few seconds, so
//                                 lazily-uploaded textures are counted too
//   --json <path>                 write the full per-resource census
//   --top <n>                     rows in the printed table (default 24)
//   --console                     dump page console
//   --timeout <ms>                boot timeout (default 90000)
//   --settle <ms>                 how long the dress pass gets AFTER the loader
//                                 detaches (default 6000). Raise it on a cold
//                                 cache: the sky, the surfaces and the bodies
//                                 all stream in after the loader goes, and a
//                                 census taken early misses the biggest rows.
//
// READING THE RESULT. A run with `--play` ASSERTS it is in gameplay — DROP IN
// clicked, the loader gone, and `#speedo .n` reading non-zero with W held — and
// prints `NOT IN GAMEPLAY` on the table itself when it is not. Believe that
// line: a census of the loading screen is a clean table full of nothing.

import { chromium } from "playwright-core";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

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
const TIMEOUT = Number(arg("timeout", 90000));
/** How long the dress pass gets AFTER the loader detaches — see the boot gate. */
const SETTLE = Number(arg("settle", 6000));
const TOP = Number(arg("top", 24));

/**
 * The three tiers this game can actually be in on a phone, plus desktop as the
 * no-regression control. Viewport and DPR are the REAL ones — the framebuffer
 * is the largest single allocation in the game and it is a function of both, so
 * measuring a phone tier in a desktop window would understate it.
 *
 * DPR here is the DEVICE's, not the cap: `main.ts` does
 * `setPixelRatio(min(devicePixelRatio, tier.dprCap))`, so handing the browser a
 * real 3 and letting the game clamp it is the only way to prove the clamp runs.
 *
 * THE PHONE ROWS ARE LANDSCAPE (844x390, not 390x844) AND THAT IS NOT A TYPO.
 * The game refuses to play in portrait — the touch layer puts a rotate-device
 * overlay over the whole screen — and that overlay INTERCEPTS the DROP IN
 * click, so a portrait run could never reach gameplay at all. It is 844x390
 * rather than some other landscape box because it is the same phone turned
 * round: identical pixel count, identical DPR, therefore an identical drawing
 * buffer and an identical framebuffer allocation. Every phone number this
 * harness has ever printed stays comparable; what changes is that `--play` now
 * works on them.
 */
const RUNS = {
  low: {
    setting: "low",
    label: "phone-low",
    width: 844,
    height: 390,
    dpr: 3,
    mobile: true,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  },
  medium: {
    setting: "medium",
    label: "phone",
    width: 844,
    height: 390,
    dpr: 3,
    mobile: true,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
  high: {
    setting: "high",
    label: "desktop",
    width: 1280,
    height: 800,
    dpr: 2,
    mobile: false,
    ua: undefined,
  },
};

// ---------------------------------------------------------------------------
// the in-page instrument
// ---------------------------------------------------------------------------
//
// Everything inside this function is stringified and injected with
// `addInitScript`, so it runs in the page before a single module of the game
// does. It must not reference anything from this file's scope.

function instrument() {
  const W = window;
  if (W.__gpuAudit) return;

  /** Bytes per texel, by GL internal format. Unknown formats are flagged, not
   *  guessed silently — a wrong constant here would be a wrong table. */
  const BPP = {
    0x8058: 4, // RGBA8
    0x8c43: 4, // SRGB8_ALPHA8
    0x8051: 3, // RGB8
    0x8c41: 3, // SRGB8
    0x8229: 1, // R8
    0x822b: 2, // RG8
    0x881a: 8, // RGBA16F
    0x881b: 6, // RGB16F
    0x822d: 2, // R16F
    0x822e: 4, // R32F
    0x822f: 4, // RG16F
    0x8230: 8, // RG32F
    0x8814: 16, // RGBA32F
    0x8815: 12, // RGB32F
    0x8c3a: 4, // R11F_G11F_B10F
    0x8058_0: 4,
    0x8d62: 2, // RGB565
    0x8056: 2, // RGBA4
    0x8057: 2, // RGB5_A1
    0x81a5: 2, // DEPTH_COMPONENT16
    0x81a6: 3, // DEPTH_COMPONENT24
    0x8cac: 4, // DEPTH_COMPONENT32F
    0x88f0: 4, // DEPTH24_STENCIL8
    0x8cad: 8, // DEPTH32F_STENCIL8
    0x8d48: 1, // STENCIL_INDEX8
    // legacy (unsized) formats, used by the mutable texImage2D path
    0x1908: 4, // RGBA
    0x1907: 3, // RGB
    0x1906: 1, // ALPHA
    0x1909: 1, // LUMINANCE
    0x190a: 2, // LUMINANCE_ALPHA
    0x1902: 2, // DEPTH_COMPONENT
    0x84f9: 4, // DEPTH_STENCIL
    0x1903: 1, // RED
    0x8227: 2, // RG
  };
  /** Compressed formats: [bytes per block, block width, block height].
   *  Block DIMENSIONS matter as much as the byte count — every ASTC rung is 16
   *  bytes a block and they differ only in how many texels a block covers. */
  const BLOCK = {
    0x83f0: [8, 4, 4], 0x83f1: [8, 4, 4], 0x83f2: [16, 4, 4], 0x83f3: [16, 4, 4], // S3TC DXT1/1a/3/5
    0x8c4c: [8, 4, 4], 0x8c4d: [8, 4, 4], 0x8c4e: [16, 4, 4], 0x8c4f: [16, 4, 4], // S3TC sRGB
    0x9270: [8, 4, 4], 0x9271: [8, 4, 4], 0x9272: [16, 4, 4], 0x9273: [16, 4, 4], // EAC R11/RG11
    0x9274: [8, 4, 4], 0x9275: [8, 4, 4], // ETC2 RGB8 / sRGB8
    0x9276: [8, 4, 4], 0x9277: [8, 4, 4], // ETC2 punchthrough alpha
    0x9278: [16, 4, 4], 0x9279: [16, 4, 4], // ETC2 RGBA8_EAC / sRGB8_ALPHA8_EAC
    0x93b0: [16, 4, 4], 0x93b1: [16, 5, 4], 0x93b2: [16, 5, 5], 0x93b3: [16, 6, 5], // ASTC
    0x93b4: [16, 6, 6], 0x93b5: [16, 8, 5], 0x93b6: [16, 8, 6], 0x93b7: [16, 8, 8],
    0x8e8c: [16, 4, 4], 0x8e8d: [16, 4, 4], 0x8e8e: [16, 4, 4], 0x8e8f: [16, 4, 4], // BPTC
  };

  /** The six cube-face targets. A cube map is SIX allocations on one texture
   *  object, and the mutable (`texImage2D`) path uploads them one face at a
   *  time — see the face bookkeeping in the texImage2D wrap for why that had to
   *  be counted per face rather than per level. */
  const CUBE_FACES = new Set([0x8515, 0x8516, 0x8517, 0x8518, 0x8519, 0x851a]);

  /**
   * Where an allocation came from, as the game's own file and line.
   *
   * A GL call knows a size, not a caller, and the biggest rows in this table are
   * render targets — allocations with no upload source and therefore no name at
   * all. Before this existed, a 1536x2048 half-float pair and six 1024x1024
   * depth renderbuffers sat in the census as "render target / empty" and had to
   * be identified by their SHAPE. The stack says it outright.
   */
  function callSite() {
    const raw = new Error().stack || "";
    const lines = raw.split("\n").slice(1);
    const out = [];
    for (const line of lines) {
      // Drop this instrument's own frames (it is an init script, so it has no
      // file of its own) and keep the first few that name a real module.
      if (!/https?:\/\//.test(line)) continue;
      out.push(line.trim().replace(/^at\s+/, "").replace(/https?:\/\/[^/]+/, ""));
      if (out.length === 4) break;
    }
    return out.join(" < ");
  }

  const unknownFormats = new Set();
  function texelBytes(internalFormat, typeHint) {
    const b = BPP[internalFormat];
    if (b !== undefined) {
      // The unsized legacy formats depend on the pixel TYPE, not the format.
      if (internalFormat === 0x1908 || internalFormat === 0x1907) {
        if (typeHint === 0x140b) return internalFormat === 0x1908 ? 8 : 6; // HALF_FLOAT
        if (typeHint === 0x1406) return internalFormat === 0x1908 ? 16 : 12; // FLOAT
      }
      return b;
    }
    unknownFormats.add("0x" + Number(internalFormat).toString(16));
    return 4;
  }

  /**
   * A block-compressed mip chain. Kept separate from `mipBytes` because a
   * compressed format has no bytes-per-texel at all — ETC2_EAC and ASTC 4x4 are
   * both 16 bytes per 4x4 block, i.e. ONE byte per texel, and treating them as
   * RGBA8 over-counts every KTX2 texture in the game by exactly 4x. That was
   * this harness's own first bug and it is the reason the number moved.
   */
  function blockMipBytes(w, h, spec, levels) {
    const [blockBytes, bw, bh] = spec;
    let total = 0;
    let lw = w;
    let lh = h;
    for (let i = 0; i < levels; i += 1) {
      total += Math.ceil(Math.max(1, lw) / bw) * Math.ceil(Math.max(1, lh) / bh) * blockBytes;
      lw = Math.floor(lw / 2);
      lh = Math.floor(lh / 2);
      if (lw < 1 && lh < 1) break;
    }
    return total;
  }

  /** Sum of a full mip chain from level 0 down, `levels` deep. */
  function mipBytes(w, h, d, bytesPerTexel, levels) {
    let total = 0;
    let lw = w;
    let lh = h;
    let ld = d || 1;
    for (let i = 0; i < levels; i += 1) {
      total += Math.max(1, lw) * Math.max(1, lh) * Math.max(1, ld) * bytesPerTexel;
      lw = Math.floor(lw / 2);
      lh = Math.floor(lh / 2);
      if (d > 1) ld = Math.floor(ld / 2);
      if (lw < 1 && lh < 1 && ld < 1) break;
    }
    return total;
  }

  // --- resource registries ---------------------------------------------------
  let seq = 0;
  const textures = new Map(); // WebGLTexture -> record
  const buffers = new Map(); // WebGLBuffer -> record
  const renderbuffers = new Map(); // WebGLRenderbuffer -> record

  /**
   * THE BOOT PEAK, which is the number that decides whether an iPhone lives.
   *
   * iOS does not slow a page down for holding too much, it kills the tab, and it
   * does that against the HIGH-WATER MARK rather than the steady state. The
   * steady state is what the census at the bottom of a run reports; this is the
   * largest the live total ever got on the way there, which on this boot path is
   * a different number — stand-in canvases are still resident while the
   * generated textures upload over them, and the PMREM keeps a ping-pong target
   * it never frees.
   */
  let peakBytes = 0;
  let peakAt = 0;
  let peakNote = "";
  /** Live total at the first draw call — what is resident before the first frame. */
  let firstDraw = null;

  function totalNow() {
    let t = 0;
    textures.forEach((r) => { t += r.bytes; });
    buffers.forEach((r) => { t += r.bytes; });
    renderbuffers.forEach((r) => { t += r.bytes; });
    return t;
  }
  function markAlloc(note) {
    const t = totalNow();
    if (t > peakBytes) { peakBytes = t; peakAt = performance.now(); peakNote = note; }
  }

  function texRecord(tex) {
    let r = textures.get(tex);
    if (!r) {
      seq += 1;
      r = { id: seq, bytes: 0, levels: 0, w: 0, h: 0, d: 1, fmt: "", label: "", kind: "" };
      textures.set(tex, r);
    }
    return r;
  }

  // --- blob / ImageBitmap provenance -----------------------------------------
  //
  // GLTFLoader turns each embedded image into a Blob, makes an object URL for
  // it and hands that to ImageBitmapLoader. The ImageBitmap that comes back
  // carries no trace of where it came from, so the trail is kept here: object
  // URL -> byte length, fetch(blobUrl) -> tag the Blob, createImageBitmap ->
  // remember the bitmap. The byte length is what names it later — it is matched
  // against the static GLB inventory (`--assets`), where every embedded image's
  // exact bufferView length is known.
  const blobBytes = new Map(); // blob: URL -> byte length
  const bitmapSrc = new WeakMap(); // ImageBitmap -> { url, bytes }

  const realCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (obj) {
    const url = realCreateObjectURL(obj);
    try {
      if (obj && typeof obj.size === "number") blobBytes.set(url, obj.size);
    } catch { /* not a Blob */ }
    return url;
  };

  const realFetch = W.fetch.bind(W);
  const netLog = [];
  W.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    const res = await realFetch(input, init);
    try {
      if (typeof url === "string" && !url.startsWith("blob:")) {
        const len = Number(res.headers.get("content-length") || 0);
        netLog.push({ url, bytes: len });
      }
      const realBlob = res.blob.bind(res);
      res.blob = async function () {
        const b = await realBlob();
        try { Object.defineProperty(b, "__auditUrl", { value: url, enumerable: false }); } catch { /* frozen */ }
        return b;
      };
    } catch { /* opaque */ }
    return res;
  };

  const realCreateImageBitmap = W.createImageBitmap;
  W.createImageBitmap = function (source, ...rest) {
    const p = realCreateImageBitmap.call(W, source, ...rest);
    return p.then((bmp) => {
      try {
        const url = source && source.__auditUrl;
        const bytes = source && typeof source.size === "number" ? source.size : 0;
        bitmapSrc.set(bmp, { url: url || "", bytes });
      } catch { /* ignore */ }
      return bmp;
    });
  };

  /** What a texture upload was fed. This is the whole of the naming. */
  function describeSource(src) {
    if (src == null) return { kind: "target", label: "render target / empty" };
    if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) {
      const url = src.currentSrc || src.src || "image";
      // A `blob:` src is a GLB's embedded image — GLTFLoader makes an object
      // URL per texture. (Safari and any Safari-UA context take the
      // HTMLImageElement path rather than ImageBitmapLoader, which is why a
      // phone run reports these here and not as bitmaps.) The BYTE LENGTH is
      // the handle: it is matched against `--assets`, where every GLB's
      // embedded image byte length is parsed out of the glTF JSON.
      if (url.startsWith("blob:")) {
        const bytes = blobBytes.get(url) || 0;
        return { kind: "glb", label: `GLB-embedded image (${bytes} B source)`, bytes };
      }
      return { kind: "image", label: url };
    }
    if (typeof HTMLCanvasElement !== "undefined" && src instanceof HTMLCanvasElement) {
      return { kind: "canvas", label: `canvas ${src.width}x${src.height}` };
    }
    if (typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement) {
      return { kind: "video", label: src.currentSrc || src.src || "video" };
    }
    if (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) {
      const meta = bitmapSrc.get(src);
      if (meta && meta.bytes) {
        const url = meta.url && meta.url.startsWith("blob:") ? "glb-embedded" : meta.url || "glb-embedded";
        return { kind: "bitmap", label: `${url} (${meta.bytes} B)`, bytes: meta.bytes };
      }
      return { kind: "bitmap", label: "ImageBitmap (unknown origin)" };
    }
    if (ArrayBuffer.isView(src)) return { kind: "data", label: "DataTexture" };
    return { kind: "other", label: String(src && src.constructor && src.constructor.name) };
  }

  // --- the wrap ---------------------------------------------------------------
  const proto = W.WebGL2RenderingContext ? W.WebGL2RenderingContext.prototype : null;
  const proto1 = W.WebGLRenderingContext ? W.WebGLRenderingContext.prototype : null;

  function wrapContext(p) {
    if (!p || p.__gpuAuditWrapped) return;
    p.__gpuAuditWrapped = true;

    // Which texture is bound where. three sets activeTexture then bindTexture
    // immediately before every allocation, so per-unit-per-target is exact.
    const bound = new Map(); // `${unit}:${target}` -> WebGLTexture
    let unit = 0x84c0;
    const bufBound = new Map(); // target -> WebGLBuffer
    let rbBound = null;

    const realActive = p.activeTexture;
    p.activeTexture = function (u) { unit = u; return realActive.call(this, u); };

    const realBindTexture = p.bindTexture;
    p.bindTexture = function (target, tex) {
      bound.set(`${unit}:${target}`, tex);
      return realBindTexture.call(this, target, tex);
    };
    const current = (target) => bound.get(`${unit}:${target}`) || null;

    const realBindBuffer = p.bindBuffer;
    p.bindBuffer = function (target, buf) {
      bufBound.set(target, buf);
      return realBindBuffer.call(this, target, buf);
    };

    const realBindRb = p.bindRenderbuffer;
    if (realBindRb) {
      p.bindRenderbuffer = function (target, rb) {
        rbBound = rb;
        return realBindRb.call(this, target, rb);
      };
    }

    // --- immutable allocation (three's normal path) ---------------------------
    if (p.texStorage2D) {
      const real = p.texStorage2D;
      p.texStorage2D = function (target, levels, internalFormat, width, height) {
        const tex = current(target === 0x8513 ? 0x8513 : target);
        if (tex) {
          const r = texRecord(tex);
          if (!r.from) r.from = callSite();
          const faces = target === 0x8513 ? 6 : 1; // TEXTURE_CUBE_MAP
          const block = BLOCK[internalFormat];
          r.bytes = (block
            ? blockMipBytes(width, height, block, levels)
            : mipBytes(width, height, 1, texelBytes(internalFormat), levels)) * faces;
          r.w = width; r.h = height; r.levels = levels;
          r.fmt = "0x" + Number(internalFormat).toString(16);
          r.cube = faces === 6;
          if (block) {
            r.kind = "compressed";
            const bpp = (block[0] * 8) / (block[1] * block[2]);
            r.label = r.label || `KTX2 ${bpp} bpp (GLB-embedded)`;
          }
        }
        markAlloc(`texStorage2D ${width}x${height}`);
        return real.apply(this, arguments);
      };
    }
    if (p.texStorage3D) {
      const real = p.texStorage3D;
      p.texStorage3D = function (target, levels, internalFormat, width, height, depth) {
        const tex = current(target);
        if (tex) {
          const r = texRecord(tex);
          const volume = target === 0x806f; // TEXTURE_3D mips shrink in z too
          r.bytes = volume
            ? mipBytes(width, height, depth, texelBytes(internalFormat), levels)
            : mipBytes(width, height, 1, texelBytes(internalFormat), levels) * depth;
          r.w = width; r.h = height; r.d = depth; r.levels = levels;
          r.fmt = "0x" + Number(internalFormat).toString(16);
        }
        markAlloc(`texStorage3D ${width}x${height}x${depth}`);
        return real.apply(this, arguments);
      };
    }

    // --- mutable allocation (render targets, some DataTextures) ---------------
    const realTexImage2D = p.texImage2D;
    p.texImage2D = function (target, level, internalFormat, a, b, c, d, e, f) {
      const isFace = CUBE_FACES.has(target);
      const tex = current(isFace ? 0x8513 : target);
      if (tex) {
        const r = texRecord(tex);
        if (!r.from) r.from = callSite();
        let width; let height; let type; let source;
        if (arguments.length >= 8) {
          width = a; height = b; type = e; source = f;
        } else {
          source = c; type = b;
          width = source && source.width ? source.width : 0;
          height = source && source.height ? source.height : 0;
        }
        if (width && height) {
          const bytes = width * height * texelBytes(internalFormat, type);
          if (isFace) {
            // SIX ALLOCATIONS, ONE TEXTURE OBJECT — and this is the bug that was
            // hiding the largest single item on the phone. `texStorage2D` carries
            // its own face count, but the mutable path uploads face by face, and
            // the old code mapped all six faces onto one record whose level-0
            // branch RESET `bytes`. A cube render target therefore reported one
            // face: 5.33 MB instead of 32 MB for the 1024 background cube three
            // builds out of `scene.background` (WebGLEnvironments.getCube), a
            // 6x undercount on every cube map in the game.
            r.faces = r.faces || {};
            r.faces[`${target}:${level}`] = bytes;
            if (!r.mipped) {
              r.bytes = 0;
              for (const k in r.faces) r.bytes += r.faces[k];
            }
            r.cube = true;
            r.mutable = true;
            r.levels = Math.max(r.levels, level + 1);
            if (level === 0) {
              r.w = width; r.h = height;
              r.fmt = "0x" + Number(internalFormat).toString(16);
            }
          } else if (level === 0) {
            // A fresh level 0 replaces the record; mips arrive after it.
            r.bytes = bytes;
            r.w = width; r.h = height; r.levels = 1;
            r.fmt = "0x" + Number(internalFormat).toString(16);
            r.mutable = true;
          } else {
            r.bytes += bytes;
            r.levels = Math.max(r.levels, level + 1);
          }
        }
        if (source !== undefined && !r.label) {
          const desc = describeSource(source);
          r.label = desc.label; r.kind = desc.kind;
          if (desc.bytes) r.srcBytes = desc.bytes;
        }
        markAlloc("texImage2D");
      }
      return realTexImage2D.apply(this, arguments);
    };

    if (p.texImage3D) {
      const realTexImage3D = p.texImage3D;
      p.texImage3D = function (target, level, internalFormat, width, height, depth, border, format, type) {
        const tex = current(target);
        if (tex && width && height && depth) {
          const r = texRecord(tex);
          const bytes = width * height * depth * texelBytes(internalFormat, type);
          if (level === 0) {
            r.bytes = bytes; r.w = width; r.h = height; r.d = depth; r.levels = 1;
            r.fmt = "0x" + Number(internalFormat).toString(16);
            r.kind = r.kind || "data";
            r.label = r.label || `volume ${width}x${height}x${depth}`;
          } else {
            r.bytes += bytes;
          }
        }
        return realTexImage3D.apply(this, arguments);
      };
    }

    // --- the naming pass -------------------------------------------------------
    const realTexSubImage2D = p.texSubImage2D;
    p.texSubImage2D = function (target, level) {
      const tex = current(target >= 0x8515 && target <= 0x851a ? 0x8513 : target);
      if (tex && level === 0) {
        const r = texRecord(tex);
        if (!r.label) {
          const src = arguments[arguments.length - 1];
          const desc = describeSource(src);
          r.label = desc.label; r.kind = desc.kind;
          if (desc.bytes) r.srcBytes = desc.bytes;
        }
      }
      return realTexSubImage2D.apply(this, arguments);
    };

    // --- compressed (KTX2 / BasisU) -------------------------------------------
    const realCompressed = p.compressedTexImage2D;
    if (realCompressed) {
      p.compressedTexImage2D = function (target, level, internalFormat, width, height) {
        const tex = current(target >= 0x8515 && target <= 0x851a ? 0x8513 : target);
        if (tex && width && height) {
          const r = texRecord(tex);
          const block = BLOCK[internalFormat] || [8, 4, 4];
          const bytes = Math.ceil(width / block[1]) * Math.ceil(height / block[2]) * block[0];
          if (level === 0) {
            r.bytes = bytes; r.w = width; r.h = height; r.levels = 1;
            r.fmt = "compressed 0x" + Number(internalFormat).toString(16);
            r.kind = r.kind || "compressed";
            r.label = r.label || "KTX2 / compressed";
          } else {
            r.bytes += bytes;
            r.levels = Math.max(r.levels, level + 1);
          }
        }
        return realCompressed.apply(this, arguments);
      };
    }

    // --- generateMipmap: the 1/3 the mutable path does not declare ------------
    const realGenerateMipmap = p.generateMipmap;
    p.generateMipmap = function (target) {
      const tex = current(target === 0x8513 ? 0x8513 : target);
      if (tex) {
        const r = texRecord(tex);
        // Only the mutable path needs this: texStorage2D already declared its
        // level count, and re-adding here would double-count the chain.
        if (r.mutable && r.levels <= 1 && r.w && r.h) {
          const levels = Math.floor(Math.log2(Math.max(r.w, r.h))) + 1;
          // For a cube this comes out right without a face term: `bytes` is
          // already all six faces of level 0, so bytes/(w*h) is six texels'
          // worth and the chain scales with it.
          const perTexel = r.bytes / (r.w * r.h);
          r.bytes = mipBytes(r.w, r.h, r.d, perTexel, levels);
          r.levels = levels;
          // A late face upload must not undo the chain — see the face branch.
          r.mipped = true;
        }
      }
      return realGenerateMipmap.apply(this, arguments);
    };

    // --- renderbuffers (depth/stencil, MSAA colour) ---------------------------
    function recordRb(internalFormat, width, height, samples) {
      if (!rbBound) return;
      renderbuffers.set(rbBound, {
        bytes: width * height * texelBytes(internalFormat) * Math.max(1, samples),
        w: width, h: height, samples: samples || 0,
        fmt: "0x" + Number(internalFormat).toString(16),
        from: callSite(),
      });
    }
    const realRbStorage = p.renderbufferStorage;
    p.renderbufferStorage = function (target, internalFormat, width, height) {
      recordRb(internalFormat, width, height, 1);
      markAlloc(`renderbuffer ${width}x${height}`);
      return realRbStorage.apply(this, arguments);
    };
    if (p.renderbufferStorageMultisample) {
      const realRbMs = p.renderbufferStorageMultisample;
      p.renderbufferStorageMultisample = function (target, samples, internalFormat, width, height) {
        recordRb(internalFormat, width, height, samples);
        return realRbMs.apply(this, arguments);
      };
    }

    // --- geometry --------------------------------------------------------------
    const realBufferData = p.bufferData;
    p.bufferData = function (target, data) {
      const buf = bufBound.get(target);
      if (buf) {
        const bytes = typeof data === "number" ? data : (data && data.byteLength) || 0;
        buffers.set(buf, { bytes, target });
        markAlloc("bufferData");
      }
      return realBufferData.apply(this, arguments);
    };

    // --- the first frame: what is resident before anything has been drawn -----
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      const realDraw = p[name];
      if (!realDraw) continue;
      p[name] = function () {
        if (!firstDraw) {
          firstDraw = { bytes: totalNow(), at: performance.now(), textures: textures.size, call: name };
        }
        return realDraw.apply(this, arguments);
      };
    }

    // --- deletes: what is reported is LIVE, not cumulative --------------------
    const realDelTex = p.deleteTexture;
    p.deleteTexture = function (tex) { textures.delete(tex); return realDelTex.apply(this, arguments); };
    const realDelBuf = p.deleteBuffer;
    p.deleteBuffer = function (buf) { buffers.delete(buf); return realDelBuf.apply(this, arguments); };
    const realDelRb = p.deleteRenderbuffer;
    if (realDelRb) {
      p.deleteRenderbuffer = function (rb) { renderbuffers.delete(rb); return realDelRb.apply(this, arguments); };
    }
  }

  wrapContext(proto);
  wrapContext(proto1);

  W.__gpuAudit = function () {
    const tex = [];
    // A NaN in a size makes the whole table unreadable, and one turned up for a
    // real reason rather than an arithmetic slip: the boot allocates a texture
    // with a ZERO dimension (Chrome says so out loud — "glTexStorage2D: Texture
    // dimensions must all be greater than zero"), and a zero-area level 0
    // divides by zero when `generateMipmap` works out its bytes per texel. The
    // bad records are pulled out and COUNTED rather than silently zeroed, because
    // the count is a finding about the game.
    const degenerate = [];
    textures.forEach((r) => {
      if (!Number.isFinite(r.bytes) || r.bytes < 0) {
        degenerate.push({ w: r.w, h: r.h, fmt: r.fmt, levels: r.levels, from: r.from || "" });
        r.bytes = 0;
      }
      tex.push(r);
    });
    let bufBytes = 0;
    let bufCount = 0;
    buffers.forEach((r) => { bufBytes += r.bytes; bufCount += 1; });
    let rbBytes = 0;
    const rb = [];
    renderbuffers.forEach((r) => { rbBytes += r.bytes; rb.push(r); });
    return {
      textures: tex,
      textureBytes: tex.reduce((s, r) => s + r.bytes, 0),
      buffers: { bytes: bufBytes, count: bufCount },
      renderbuffers: { bytes: rbBytes, list: rb },
      unknownFormats: Array.from(unknownFormats),
      degenerate,
      peak: { bytes: peakBytes, at: peakAt, note: peakNote },
      firstDraw,
      net: netLog,
      dpr: W.devicePixelRatio,
      canvas: (() => {
        const c = document.querySelector("canvas");
        return c ? { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight } : null;
      })(),
    };
  };
}

// ---------------------------------------------------------------------------
// static asset inventory (no browser)
// ---------------------------------------------------------------------------

/** Mirrors `src/controllers/quality/pick-asset.ts` — kept here rather than
 *  imported because that file is TypeScript and this harness is plain node.
 *  If the ladder there changes, this changes with it. */
const IMAGE_RUNG = { "phone-low": 1024, phone: 2048 };
const SKY_RUNG = { "phone-low": 2048, phone: 4096 };
const MODEL_RUNG = { "phone-low": 1024, phone: 1024, desktop: 2048 };

function pickImage(url, tier) {
  const role = url.split("/").pop();
  if (tier === "desktop") return url;
  if (role === "skybox-equirect") return `${url}@${SKY_RUNG[tier]}`;
  if (role === "texture-basecolor" || role === "image-main" || /^image-alt-\d+$/.test(role)) {
    return `${url}@${IMAGE_RUNG[tier]}`;
  }
  return url;
}
function pickModelUrl(url, tier) {
  const role = url.split("/").pop();
  if (!/^(model-glb|character-rigged(-a\d+)?-glb(-r\d+)?)$/.test(role)) return url;
  return `${url}@${MODEL_RUNG[tier]}`;
}

/** Image dimensions from the first bytes of a JPEG / PNG / WebP. */
function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: "png" };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), type: "jpeg" };
      }
      i += 2 + len;
    }
  }
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") {
    const fmt = buf.slice(12, 16).toString("ascii");
    if (fmt === "VP8X") return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1, type: "webp" };
    if (fmt === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, type: "webp" };
    if (fmt === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, type: "webp" };
    }
  }
  return null;
}

/** Parse a GLB: every embedded image with its decoded size, and the geometry. */
function parseGlb(buf) {
  if (buf.slice(0, 4).toString("ascii") !== "glTF") return null;
  const total = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < Math.min(total, buf.length) - 8) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const chunk = buf.slice(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    if (type === 0x004e4942) bin = chunk;
    off += 8 + len + ((4 - (len % 4)) % 4) * 0;
    off += (4 - (off % 4)) % 4;
  }
  if (!json) return null;
  const views = json.bufferViews || [];
  const images = (json.images || []).map((img, i) => {
    let size = null;
    let bytes = 0;
    if (img.bufferView !== undefined && bin) {
      const v = views[img.bufferView];
      bytes = v.byteLength;
      const slice = bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + Math.min(v.byteLength, 65536));
      size = imageSize(slice);
    }
    return { index: i, name: img.name || img.uri || `image${i}`, mime: img.mimeType, bytes, ...(size || {}) };
  });
  let geometryBytes = 0;
  for (const a of json.accessors || []) {
    if (a.bufferView === undefined) continue;
    const v = views[a.bufferView];
    if (v) geometryBytes += v.byteLength;
  }
  // De-duplicate: several accessors share one bufferView.
  const geoViews = new Set();
  for (const a of json.accessors || []) if (a.bufferView !== undefined) geoViews.add(a.bufferView);
  geometryBytes = 0;
  geoViews.forEach((i) => { geometryBytes += views[i] ? views[i].byteLength : 0; });
  const meshes = (json.meshes || []).length;
  const tris = (json.meshes || []).reduce((s, m) => s + (m.primitives || []).length, 0);
  return { images, geometryBytes, meshes, primitives: tris, fileBytes: buf.length };
}

async function getBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
async function getHead(url, bytes = 65536) {
  const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const len = Number(res.headers.get("content-range")?.split("/")?.[1] || res.headers.get("content-length") || 0);
  return { buf: Buffer.from(await res.arrayBuffer()), fileBytes: len };
}

/**
 * Every generated asset on the BOOT path of map 1, with the file that loads it.
 * Map 2 is parked (`world/maps.ts`) and is not mounted at boot, so its set is
 * listed but not summed — it would be a second world's worth of texture if it
 * ever comes back.
 */
const ASSETS = [
  // --- the sky ---
  { name: "city skybox", kind: "sky", where: "world/props.ts CITY_SKYBOX_URL", url: "https://assets.auras.cc/generations/cms2syf6o01ml22lplnxih4je/skybox-equirect" },
  // --- ground / wall surfaces (props.ts SURFACES) ---
  { name: "road basecolor", kind: "tex", where: "world/props.ts ROAD_TEX", url: "https://assets.auras.cc/generations/cms51ksoc000022ozvbavgosq/texture-basecolor" },
  { name: "plaza basecolor", kind: "tex", where: "world/props.ts PLAZA_TEX", url: "https://assets.auras.cc/generations/cms51kten000322ozvretisvl/texture-basecolor" },
  { name: "park concrete basecolor", kind: "tex", where: "world/props.ts PARK_TEX", url: "https://assets.auras.cc/generations/cms51ktzt000622oze19doqef/texture-basecolor" },
  { name: "sidewalk basecolor", kind: "tex", where: "world/props.ts WALK_TEX", url: "https://assets.auras.cc/generations/cms51kumv000922ozl7evnckj/texture-basecolor" },
  { name: "brick basecolor", kind: "tex", where: "world/props.ts BRICK_TEX", url: "https://assets.auras.cc/generations/cms51lcmj000c22oz08pij2dw/texture-basecolor" },
  { name: "facade basecolor", kind: "tex", where: "world/props.ts FACADE_TEX", url: "https://assets.auras.cc/generations/cms51ld9r000f22ozmjq67yue/texture-basecolor" },
  { name: "fence cutout", kind: "tex", where: "world/props.ts FENCE_IMAGE_URL", url: "https://assets.auras.cc/generations/cms51lfh6000o22oz0illccyx/image-main" },
  // --- desktop-only relief maps (phones skip these — dressMaterials `if (phone) return`) ---
  { name: "road normal", kind: "tex", desktopOnly: true, where: "world/props.ts", url: "https://assets.auras.cc/generations/cms51ksoc000022ozvbavgosq/texture-normal" },
  { name: "road roughness", kind: "tex", desktopOnly: true, where: "world/props.ts", url: "https://assets.auras.cc/generations/cms51ksoc000022ozvbavgosq/texture-roughness" },
  // --- graffiti / paint ---
  { name: "graffiti throw-up", kind: "tex", where: "world/props.ts GRAFFITI_URLS[0]", url: "https://assets.auras.cc/generations/cms2djqci01e622lpb7gczi3k/image-main" },
  { name: "graffiti wildstyle", kind: "tex", where: "world/props.ts GRAFFITI_URLS[1]", url: "https://assets.auras.cc/generations/cms2djr1n01e922lpurc3ne4s/image-main" },
  { name: "graffiti stencil", kind: "tex", where: "world/props.ts GRAFFITI_URLS[2]", url: "https://assets.auras.cc/generations/cms2djrqw01ec22lpquoo2jol/image-main" },
  { name: "contest flyposter", kind: "tex", where: "world/props.ts GRAFFITI_URLS[3]", url: "https://assets.auras.cc/generations/cms2djsfm01ef22lpycp5tch6/image-main" },
  // --- UI plates ---
  { name: "menu still (title)", kind: "ui", where: "main.ts MENU_ART_URL", url: "https://assets.auras.cc/generations/cms2hv48901lw22lppfy2tr8c/image-main" },
  { name: "loader / shop plate", kind: "ui", where: "main.ts LOADER_ART_URL + ui/menu.ts SHOP_URL", url: "https://assets.auras.cc/generations/cms67vjuo007022obezc4pooz/image-main" },
  { name: "lens dirt plate", kind: "ui", where: "render/lens-dirt.ts (medium/high only)", url: "https://assets.auras.cc/generations/cms5za9xv010a22lbuv46x7wq/image-main@1024", raw: true },
  // --- models ---
  { name: "skateboard", kind: "glb", where: "skate/skater-rig.ts BOARD_URL", url: "https://assets.auras.cc/generations/cms0fd757004s22nupq71hp7f/model-glb" },
  { name: "prop: dumpster", kind: "glb", where: "world/props.ts PROP_URLS", url: "https://assets.auras.cc/generations/cms2djt3701ei22lpwgkcfik7/model-glb" },
  { name: "prop: bench", kind: "glb", where: "world/props.ts PROP_URLS", url: "https://assets.auras.cc/generations/cms2djts701el22lphxetrioe/model-glb" },
  { name: "prop: bin", kind: "glb", where: "world/props.ts PROP_URLS", url: "https://assets.auras.cc/generations/cms2djuh101eo22lpk3khrtxt/model-glb" },
  { name: "prop: cone", kind: "glb", where: "world/props.ts PROP_URLS", url: "https://assets.auras.cc/generations/cms2djv4t01er22lp7aeex5uj/model-glb" },
  { name: "prop: lamp", kind: "glb", where: "world/props.ts PROP_URLS", url: "https://assets.auras.cc/generations/cms2djvt201eu22lp7fkfyxin/model-glb" },
  { name: "prop: hydrant", kind: "glb", where: "world/props.ts PROP_URLS", url: "https://assets.auras.cc/generations/cms2djwej01ex22lpqlmsuhdo/model-glb" },
  // --- characters ---
  { name: "PLAYER body (The Timekeeper)", kind: "glb", where: "main.ts CHARACTERS[0].modelUrl -> motion/rigs.js loadRig", url: "https://assets.auras.cc/generations/cms5uxuo500ea22lb0sccf64o/rigged-character.glb" },
  { name: "NPC body (The Local)", kind: "glb", where: "world/npc.ts CHARACTER_MANIFEST -> loadMeshyCharacter", url: "https://assets.auras.cc/generations/cms0fbiar004o22nuyjqjhzuz/rigged-character.glb" },
  { name: "menu-stage body (The Local)", kind: "glb", where: "ui/menu.ts STAGE_BODIES", url: "https://assets.auras.cc/generations/cms0fbiar004o22nuyjqjhzuz/rigged-character.glb", dupOf: "NPC body (The Local)" },
];

async function auditAssets() {
  const tiers = ["phone-low", "phone", "desktop"];
  const rows = [];
  for (const a of ASSETS) {
    const row = { ...a, perTier: {} };
    for (const tier of tiers) {
      const url = a.raw ? a.url : a.kind === "glb" ? pickModelUrl(a.url, tier) : pickImage(a.url, tier);
      try {
        if (a.kind === "glb") {
          const buf = await getBuffer(url);
          const glb = parseGlb(buf);
          if (!glb) { row.perTier[tier] = { error: "not a GLB" }; continue; }
          let texBytes = 0;
          const imgs = glb.images.map((im) => {
            const b = im.w && im.h ? im.w * im.h * 4 * (4 / 3) : 0;
            texBytes += b;
            return { ...im, vram: b };
          });
          row.perTier[tier] = {
            url, fileBytes: glb.fileBytes, images: imgs,
            textureVram: texBytes, geometryVram: glb.geometryBytes,
            vram: texBytes + glb.geometryBytes,
          };
        } else {
          const { buf, fileBytes } = await getHead(url);
          const size = imageSize(buf);
          if (!size) { row.perTier[tier] = { error: "unrecognised image" }; continue; }
          // Mipmaps: three defaults `generateMipmaps` true for TextureLoader
          // textures. The skybox is an env map and is also PMREM'd — accounted
          // separately in the live census, which sees the real render targets.
          const vram = size.w * size.h * 4 * (4 / 3);
          row.perTier[tier] = { url, fileBytes, w: size.w, h: size.h, vram };
        }
      } catch (e) {
        row.perTier[tier] = { error: String(e.message || e) };
      }
    }
    rows.push(row);
  }
  return rows;
}

const MB = (b) => (b / (1024 * 1024)).toFixed(2);

function printAssets(rows) {
  const tiers = ["phone-low", "phone", "desktop"];
  console.log("\n=== STATIC ASSET INVENTORY — decoded VRAM per tier rung ===");
  console.log("(RGBA8 + full mip chain = w*h*4*4/3. Source of truth for what each");
  console.log(" generated asset costs; the live census below is what the GPU holds.)\n");
  const pad = (s, n) => String(s).padEnd(n);
  const rpad = (s, n) => String(s).padStart(n);
  console.log(pad("asset", 34) + rpad("phone-low", 11) + rpad("phone", 11) + rpad("desktop", 11) + "  dims (phone rung)");
  console.log("-".repeat(100));
  const totals = { "phone-low": 0, phone: 0, desktop: 0 };
  for (const r of rows) {
    const cells = tiers.map((t) => {
      const d = r.perTier[t];
      if (!d || d.error) return rpad(d?.error ? "ERR" : "-", 11);
      if (r.desktopOnly && t !== "desktop") return rpad("skipped", 11);
      if (!r.dupOf) totals[t] += d.vram;
      return rpad(MB(d.vram), 11);
    });
    const ph = r.perTier.phone;
    const dims = ph && !ph.error
      ? (r.kind === "glb"
        ? `${ph.images.length} img: ${ph.images.map((i) => `${i.w}x${i.h}`).join(", ")}`
        : `${ph.w}x${ph.h}`)
      : "";
    console.log(pad(r.name + (r.dupOf ? " (dup)" : ""), 34) + cells.join("") + "  " + dims);
  }
  console.log("-".repeat(100));
  console.log(pad("TOTAL (generated assets)", 34) + tiers.map((t) => rpad(MB(totals[t]), 11)).join(""));
  return totals;
}

// ---------------------------------------------------------------------------
// the live census
// ---------------------------------------------------------------------------

async function runTier(key) {
  const cfg = RUNS[key];
  const browser = await chromium.launch({
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
  });
  const context = await browser.newContext({
    viewport: { width: cfg.width, height: cfg.height },
    deviceScaleFactor: cfg.dpr,
    isMobile: cfg.mobile,
    hasTouch: cfg.mobile,
    userAgent: cfg.ua,
  });

  // The tier is seeded through the game's OWN persisted Quality setting — the
  // same localStorage key `ui/settings.ts` writes when a player picks Low. No
  // URL flag, no injected global, nothing the game has to know about.
  await context.addInitScript((setting) => {
    try { localStorage.setItem("genex:quality", setting); } catch { /* blocked */ }
  }, cfg.setting);
  await context.addInitScript(instrument);

  const page = await context.newPage();
  /** Set when the gameplay assertion below fails, so the printed census can say so. */
  let notInGameplay = null;
  /** Set when the census was still growing when it was taken. */
  let stillStreaming = null;
  const logs = [];
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning" || has("console")) logs.push(`[${m.type()}] ${m.text()}`);
  });

  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.waitForSelector("canvas", { timeout: TIMEOUT });

  // THE BOOT GATE, AND WHY IT IS NOT `[data-act="play"]` ANY MORE.
  //
  // The title screen's DROP IN button is in the DOM from the first frame,
  // BEHIND the loader — `ui/menu.ts` builds the whole card up front and the
  // loader is a separate full-screen div over it. So the old gate,
  // `waitForSelector('[data-act="play"]')`, was satisfied within a few hundred
  // milliseconds of boot and this harness went on to census a scene that did
  // not exist yet.
  //
  // IT DID NOT FAIL — that is the trap. It printed a clean, well-formatted
  // table reading `TOTAL 0.00 MB` with four 1x1 textures in it, all four of
  // them `WebGLState`'s own defaults from inside `new WebGLRenderer`. Every
  // number in the game was missing and nothing said so. **If you ever see a
  // census under a megabyte, or one whose only rows are 1x1, the run measured
  // the loading screen — do not report it.**
  //
  // `#loader` is the honest gate: `ui/hud.ts` builds it during boot and removes
  // it from the DOM 600 ms after the last job lands. ATTACHED first and then
  // DETACHED, because `detached` on its own is also satisfied by "not built
  // yet" — which is the same bug wearing a different selector.
  await page.waitForSelector("#loader", { state: "attached", timeout: TIMEOUT });
  await page.waitForSelector("#loader", { state: "detached", timeout: TIMEOUT });
  // The dress pass streams in AFTER the loader hides — generated surfaces, the
  // furniture, the sky and its two derivatives. `--settle` exists because that
  // is a network cost, not a GPU one: 6 s is fine against a warm cache and not
  // remotely enough on a cold one, and a census taken early under-reports the
  // largest allocations in the game.
  await sleep(SETTLE);

  let phase = "title";
  if (has("play")) {
    const btn = await page.$('[data-act="play"]');
    // NON-FATAL, and deliberately so: if something is sitting over DROP IN the
    // right outcome is a census that says it never got in, not a stack trace
    // that throws the whole run away. The assertion below is what reports it.
    if (btn) {
      await btn.click({ timeout: 15000 }).catch((e) => {
        console.error(`!! DROP IN could not be clicked — ${String(e).split("\n")[0]}`);
      });
    }
    await sleep(1200);
    for (const code of ["KeyW", "Space", "KeyW"]) {
      await page.evaluate((c) => {
        const ev = (t) => new KeyboardEvent(t, { code: c, key: c, bubbles: true });
        window.dispatchEvent(ev("keydown"));
        setTimeout(() => window.dispatchEvent(ev("keyup")), 700);
      }, code);
      await sleep(900);
    }
    await sleep(2500);
    phase = "riding";

    // ASSERTION, NOT AN ASSUMPTION — the same one `tools/desk-profile.mjs`
    // makes, for the same reason: the title card must be gone and the game's
    // own speed readout (`#speedo .n`, the element `ui/hud.ts` binds) must
    // answer to the W key. A phone tier hides that element in CSS, which does
    // not empty it, so this reads on all three tiers.
    await page.evaluate(() => {
      const ev = (t) => new KeyboardEvent(t, { code: "KeyW", key: "w", bubbles: true });
      window.dispatchEvent(ev("keydown"));
      setTimeout(() => window.dispatchEvent(ev("keyup")), 900);
    });
    await sleep(900);
    const live = await page.evaluate(() => ({
      speed: Number(document.querySelector("#speedo .n")?.textContent ?? NaN),
      titleStillUp: !!document.querySelector("#loader") || !document.querySelector("canvas"),
    }));
    if (!(live.speed > 0) || live.titleStillUp) {
      notInGameplay = `speed readout ${JSON.stringify(live.speed)}${live.titleStillUp ? ", loader still up" : ""}`;
      console.error(
        `\n!! NOT IN GAMEPLAY (${notInGameplay}) — this census is NOT evidence.\n` +
          `   The world may still be streaming: raise --settle, or --timeout if the boot itself is slow.`,
      );
    }
  }

  // IS IT STILL ARRIVING? The other way this harness lies quietly.
  //
  // The gameplay assertion above proves the WORLD exists; it says nothing about
  // whether the world has finished STREAMING. The generated surfaces, the
  // bodies and the sky's two derivatives all land after the loader goes, so a
  // `--settle` that is too short for the cache you have produces a table that
  // looks completely normal and is missing the biggest rows in the game.
  // (Observed: a 15 s settle on a cold cache reported 130.51 MB at phone-low
  // with the background cube at 0.00 MB — the sky had not arrived. The same
  // build, settled, is 165.67 MB.)
  //
  // So census twice and compare. A total that is still moving means the number
  // is not the steady state yet, whatever it says.
  const total = (c) => (c ? c.textureBytes + c.buffers.bytes + c.renderbuffers.bytes : 0);
  const first = await page.evaluate(() => window.__gpuAudit && window.__gpuAudit());
  await sleep(3000);
  const census = await page.evaluate(() => window.__gpuAudit && window.__gpuAudit());
  const grew = total(census) - total(first);
  if (grew > total(first) * 0.01) {
    stillStreaming = `+${(grew / 1048576).toFixed(2)} MB in the last 3 s`;
    console.error(
      `\n!! STILL STREAMING (${stillStreaming}) — this census is not the steady state.\n` +
        `   Raise --settle (currently ${SETTLE} ms) and run it again.`,
    );
  }

  await browser.close();
  return { key, cfg, census, logs, phase, notInGameplay, stillStreaming };
}

/** Fold the per-texture records into the buckets a human can act on. */
function bucket(label, kind, rec) {
  if (rec && rec.cube) {
    // `scene.background = <equirect texture>` does NOT just get sampled. three's
    // WebGLEnvironments.getCube builds a `WebGLCubeRenderTarget(image.height)`
    // and renders the panorama into all six faces, with mipmaps — so the
    // background costs a cube map the size of the sky's HEIGHT on top of the
    // equirect itself and on top of the PMREM that `scene.environment` needs.
    // It is the largest single item on the phone and it had no name until the
    // face accounting above started counting all six.
    return "background cube (scene.background)";
  }
  if (kind === "target") {
    // three's PMREM allocates 3*cubeSize x 4*cubeSize RGBA16F — one for the
    // environment map the scene keeps and one ping-pong it never frees (it is
    // released only by `renderer.dispose()`). The shape is unmistakable and
    // worth calling out by name rather than lumping into "render targets".
    if (rec && rec.fmt === "0x881a" && rec.h === (rec.w / 3) * 4) return "PMREM environment (sky)";
    return "render targets (post/shadow)";
  }
  if (kind === "canvas") return "procedural canvas";
  if (kind === "data") return "DataTexture / volume";
  if (kind === "compressed") return "GLB textures — KTX2 (props, board)";
  if (kind === "glb" || kind === "bitmap") return "GLB textures — UNCOMPRESSED (characters)";
  if (kind === "video") return "video";
  if (typeof label === "string" && label.includes("/generations/")) {
    if (label.includes("skybox-equirect")) return "generated skybox";
    if (label.includes("texture-")) return "generated surface";
    if (label.includes("image-main")) return "generated image (graffiti/UI)";
    return "generated other";
  }
  return "other";
}

function shortLabel(label) {
  if (typeof label !== "string") return String(label);
  const m = label.match(/generations\/([a-z0-9]+)\/([^?]+)/);
  if (m) return `${m[2]}  (${m[1].slice(0, 10)}…)`;
  return label.length > 52 ? label.slice(0, 49) + "…" : label;
}

function printCensus(run) {
  const { cfg, census, key, phase, notInGameplay, stillStreaming } = run;
  if (!census) { console.log(`\n!! ${cfg.label}: no census (instrument never ran)`); return null; }
  // The banner rides ON the table rather than only in stderr, because the table
  // is the thing that gets pasted into a report.
  if (notInGameplay) {
    console.log(`\n!! ${cfg.label}: NOT IN GAMEPLAY (${notInGameplay}) — the numbers below are NOT evidence.`);
  }
  if (stillStreaming) {
    console.log(`\n!! ${cfg.label}: STILL STREAMING (${stillStreaming}) — the numbers below are not the steady state; raise --settle.`);
  }
  const tex = census.textures.slice().sort((a, b) => b.bytes - a.bytes);
  const texTotal = census.textureBytes;
  const bufTotal = census.buffers.bytes;
  const rbTotal = census.renderbuffers.bytes;
  const total = texTotal + bufTotal + rbTotal;

  console.log(`\n=== LIVE GPU CENSUS — tier ${cfg.label} (setting "${cfg.setting}", ${phase}) ===`);
  console.log(`viewport ${cfg.width}x${cfg.height} @ device DPR ${cfg.dpr} -> page DPR ${census.dpr}` +
    (census.canvas ? `, drawing buffer ${census.canvas.w}x${census.canvas.h}` : ""));
  if (census.unknownFormats.length) console.log(`(unknown GL formats seen: ${census.unknownFormats.join(", ")})`);
  if (census.degenerate && census.degenerate.length) {
    console.log(`(!! ${census.degenerate.length} texture(s) with a ZERO dimension — counted as 0 bytes, but they are a real GL error at boot:`);
    for (const d of census.degenerate.slice(0, 3)) console.log(`    ${d.w}x${d.h} fmt ${d.fmt} lv${d.levels}  ${String(d.from).slice(0, 120)}`);
    console.log("  )");
  }

  const byBucket = new Map();
  for (const t of tex) {
    const b = bucket(t.label, t.kind, t);
    const e = byBucket.get(b) || { bytes: 0, count: 0 };
    e.bytes += t.bytes; e.count += 1;
    byBucket.set(b, e);
  }
  console.log("\n-- by category ------------------------------------------------");
  const cats = Array.from(byBucket.entries()).sort((a, b) => b[1].bytes - a[1].bytes);
  for (const [name, e] of cats) {
    console.log(`  ${String(name).padEnd(32)} ${String(MB(e.bytes)).padStart(9)} MB   (${e.count})`);
  }
  console.log(`  ${"renderbuffers (depth/MSAA)".padEnd(32)} ${String(MB(rbTotal)).padStart(9)} MB   (${census.renderbuffers.list.length})`);
  console.log(`  ${"geometry buffers".padEnd(32)} ${String(MB(bufTotal)).padStart(9)} MB   (${census.buffers.count})`);
  console.log("  " + "-".repeat(56));
  console.log(`  ${"TOTAL".padEnd(32)} ${String(MB(total)).padStart(9)} MB`);

  if (census.firstDraw) {
    console.log(`\n-- the boot, which is what an iPhone actually kills for --------`);
    console.log(`  first draw call at ${Math.round(census.firstDraw.at)} ms with ${MB(census.firstDraw.bytes)} MB resident (${census.firstDraw.textures} textures)`);
    console.log(`  PEAK live total   ${MB(census.peak.bytes)} MB at ${Math.round(census.peak.at)} ms (${census.peak.note})`);
    console.log(`  steady state      ${MB(total)} MB  ->  peak is ${(census.peak.bytes / total).toFixed(2)}x the steady state`);
  }

  console.log(`\n-- top ${TOP} individual allocations ---------------------------`);
  console.log("     MB   dims          levels  what");
  for (const t of tex.slice(0, TOP)) {
    const dims = t.d > 1 ? `${t.w}x${t.h}x${t.d}` : `${t.w}x${t.h}${t.cube ? " cube" : ""}`;
    console.log(`  ${String(MB(t.bytes)).padStart(7)}  ${dims.padEnd(13)} ${String(t.levels).padStart(5)}   ${shortLabel(t.label)}`);
    if (t.kind === "target" || t.cube) console.log(`  ${" ".repeat(9)}from  ${(t.from || "?").slice(0, 150)}`);
  }
  const rbs = census.renderbuffers.list.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 4);
  if (rbs.length) {
    console.log("  -- renderbuffers --");
    for (const r of rbs) {
      console.log(`  ${String(MB(r.bytes)).padStart(7)}  ${`${r.w}x${r.h}`.padEnd(13)} ${String(r.samples + "x").padStart(5)}   depth/MSAA ${r.fmt}`);
      console.log(`  ${" ".repeat(9)}from  ${(r.from || "?").slice(0, 150)}`);
    }
  }
  return { key, label: cfg.label, texTotal, bufTotal, rbTotal, total, cats, textures: tex };
}

// ---------------------------------------------------------------------------

async function main() {
  const out = { url: URL_, when: new Date().toISOString() };

  if (has("assets") || has("all")) {
    const rows = await auditAssets();
    out.assets = rows;
    printAssets(rows);
  }
  if (has("assets") && !has("all")) {
    await writeJson(out);
    return;
  }

  const keys = has("all") ? ["low", "medium", "high"] : [String(arg("tier", "medium"))];
  const summaries = [];
  for (const k of keys) {
    if (!RUNS[k]) { console.error(`unknown tier "${k}" — use low | medium | high`); process.exit(1); }
    const run = await runTier(k);
    out[`census_${k}`] = run.census;
    if (has("console")) run.logs.slice(0, 40).forEach((l) => console.error(l));
    const s = printCensus(run);
    if (s) summaries.push(s);
  }

  if (summaries.length > 1) {
    console.log("\n=== THE TABLE ===============================================");
    console.log("category".padEnd(34) + summaries.map((s) => s.label.padStart(13)).join(""));
    console.log("-".repeat(34 + 13 * summaries.length));
    const names = new Set();
    summaries.forEach((s) => s.cats.forEach(([n]) => names.add(n)));
    for (const n of names) {
      const cells = summaries.map((s) => {
        const hit = s.cats.find(([c]) => c === n);
        return String(hit ? MB(hit[1].bytes) : "-").padStart(13);
      });
      console.log(String(n).padEnd(34) + cells.join(""));
    }
    console.log("renderbuffers (depth/MSAA)".padEnd(34) + summaries.map((s) => String(MB(s.rbTotal)).padStart(13)).join(""));
    console.log("geometry buffers".padEnd(34) + summaries.map((s) => String(MB(s.bufTotal)).padStart(13)).join(""));
    console.log("-".repeat(34 + 13 * summaries.length));
    console.log("TOTAL".padEnd(34) + summaries.map((s) => String(MB(s.total)).padStart(13)).join(""));
    console.log("budget: <300 MB broad phones, <700 MB modern");
  }

  await writeJson(out);
}

async function writeJson(out) {
  const path = arg("json", "");
  if (typeof path === "string" && path) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(out, null, 2));
    console.log(`\nfull census -> ${path}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
