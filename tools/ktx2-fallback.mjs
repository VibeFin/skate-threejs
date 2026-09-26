// Does the `.ktx2` texture path actually fall back, and is anything upside down?
//
// The compressed-texture lane hands `loadTextureWithFallback` a second loader
// for the `.ktx2` sibling of every flat map texture on phone tiers. Two things
// about that are load-bearing and neither is visible from the call site:
//
//   1. a MISSING sibling must warn and land on the browser-decodable rung, not
//      break the boot — and several siblings genuinely are missing today,
//      because the backfill is older than some of the generations;
//   2. a compressed texture is `flipY = false` where every TextureLoader
//      texture is `flipY = true`, so the swap needs the mirror `props.ts`
//      applies or the whole level renders upside down.
//
// This runs the REAL `pick-asset.ts` against the REAL asset host with loaders
// that fail the way three's FileLoader fails (reject on a non-200), so the
// fallback is exercised rather than reasoned about.
//
//   node --experimental-strip-types --import ./tools/ts-resolve-hook.mjs tools/ktx2-fallback.mjs
//
// …or just `node tools/ktx2-fallback.mjs`, which re-execs itself with those.

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-resolve.mjs", pathToFileURL(`${import.meta.dirname}/`));

const { loadTextureWithFallback, pickAsset } = await import(
  "../src/controllers/quality/pick-asset.ts"
);
const { TIERS } = await import("../src/controllers/quality/tier.ts");

const HOST = "https://assets.auras.cc/generations";
/** One graffiti piece whose sibling landed, and one whose generation is newer. */
const HAS_SIBLING = `${HOST}/cms2djqci01e622lpb7gczi3k/image-main`;
const NO_SIBLING = `${HOST}/cms51lfh6000o22oz0illccyx/image-main`;
const A_SURFACE = `${HOST}/cms51kten000322ozvretisvl/texture-basecolor`;
const THE_SKY = `${HOST}/cms2syf6o01ml22lplnxih4je/skybox-equirect`;

let failures = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n        got  ${got}\n        want ${want}`}`);
};

/** A loader that fails the way three's FileLoader fails: reject on non-200. */
const fetcher = (kind) => async (url) => {
  const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-255" } });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status} on ${url}`);
  await res.arrayBuffer();
  return { kind, url };
};

const warnings = [];
const realWarn = console.warn;
console.warn = (...a) => warnings.push(a.join(" "));

const run = async (label, url, tier, withKtx2) => {
  warnings.length = 0;
  const opts = withKtx2 ? { ktx2Load: fetcher("ktx2") } : undefined;
  const got = await loadTextureWithFallback(url, tier, fetcher("image"), opts);
  return { label, ...got, warnings: [...warnings] };
};

const phone = TIERS["phone-low"];
const desktop = TIERS.desktop;

// 1. The sibling is there: the compressed file is what gets loaded, silently.
let r = await run("sibling present", HAS_SIBLING, phone, true);
check("phone + present sibling loads the .ktx2", r.kind, "ktx2");
check("phone + present sibling loads @1024.ktx2", r.url, `${HAS_SIBLING}@1024.ktx2`);
check("phone + present sibling warns about nothing", r.warnings.length, 0);

// 2. The sibling 404s: warn, then the ordinary rung. THIS IS THE BOOT GUARD.
r = await run("sibling missing", NO_SIBLING, phone, true);
check("phone + missing sibling falls to the image rung", r.kind, "image");
check("phone + missing sibling loads @1024", r.url, `${NO_SIBLING}@1024`);
check("phone + missing sibling warns once", r.warnings.length, 1);
check(
  "phone + missing sibling names the ktx2 variant",
  r.warnings[0].includes("ktx2 variant missing"),
  true,
);

// 3. A surface texture, the bulk of the win.
r = await run("surface", A_SURFACE, phone, true);
check("phone + surface loads the .ktx2", r.url, `${A_SURFACE}@1024.ktx2`);

// 4. DESKTOP IS UNTOUCHED. Even handed the ktx2 loader, a desktop tier must
//    fetch the bare original — this is the whole hard rule of the lane.
r = await run("desktop", A_SURFACE, desktop, true);
check("desktop loads the bare original", r.url, A_SURFACE);
check("desktop never touches the ktx2 loader", r.kind, "image");
check("desktop pickAsset is identity", pickAsset(A_SURFACE, desktop), A_SURFACE);

// 5. The sky is NOT wired for ktx2 and must not be: `capDecodedImage` cannot
//    resize a CompressedTexture, and the PMREM target and background cube are
//    quadratic in the source. Called the way `field.ts` calls it — no opts.
r = await run("sky", THE_SKY, phone, false);
check("sky stays on the browser-decodable rung", r.url, `${THE_SKY}@2048`);
check("sky is never a .ktx2", r.url.endsWith(".ktx2"), false);

// 6. The orientation assumption, straight off three itself.
const THREE = await import("three");
check(
  "CompressedTexture is flipY=false",
  new THREE.CompressedTexture([], 4, 4).flipY,
  false,
);
check("Texture is flipY=true", new THREE.Texture().flipY, true);

// 7. The other half of the lane: an image with no mesh left to draw it on.
//    `buildPaint` drops any piece under the tier's budget and `Painted.drawn`
//    is read off the buffers it built, so the census below is what that flag
//    will say. If a placement is ever widened past the budget this goes green
//    again on its own — which is the point of deriving it rather than listing
//    art indices anywhere.
const { DECALS, GRAFFITI_URLS } = await import("../src/world/props.ts");
const survivors = (budget) => {
  const per = GRAFFITI_URLS.map(() => 0);
  for (const d of DECALS) if (d.w >= budget) per[d.art]++;
  return per;
};
const onPhone = survivors(1.6); // tier.particleScale < 0.6
const onDesktop = survivors(0);
check("desktop draws every graffiti image", onDesktop.every((n) => n > 0), true);
check(
  "phone empties at least one graffiti image",
  onPhone.filter((n) => n === 0).length,
  1,
);
console.log(`      phone survivors per art: [${onPhone}]  (a 0 is 5.33 MB not loaded)`);

console.warn = realWarn;
console.log(failures ? `\n${failures} FAILED` : "\nall good");
process.exit(failures ? 1 : 0);
