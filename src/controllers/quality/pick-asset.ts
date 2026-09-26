// Genex adaptive-quality: per-tier asset variant selection (mobile-readiness
// program, Option A+D). Generated assets ship with GUARANTEED downscale rungs
// in R2 — sibling roles like "skybox-equirect@2048" — so phones can load a
// ~11 MB sky instead of the 8192x4096 original (~178 MB decoded). Desktop
// always loads the bare URL: the ladder exists so phones stop dying, never to
// make desktops uglier.
//
// FALLBACK CONTRACT: a rung can be missing (remixed old URLs, an environment
// whose backfill hasn't run). loadTextureWithFallback retries the bare URL on
// a rung failure, so the worst case is today's behavior — never a broken boot.
import type { QualityTier } from './tier.ts';
import { isPhoneTier } from './tier.ts';
import { capDecodedImage, PHONE_PANORAMA_MAX_WIDTH } from './texture-cap.ts';

// Host-agnostic on purpose: each stand serves generated assets from its own
// domain (prod assets.genex.technology, dev assets.auras.cc), and baking one
// host in would silently disable the whole ladder everywhere else — the
// fallback contract makes a false positive harmless (404 rung -> warn ->
// original), so the path shape is the only thing worth matching.
const GENEX_GENERATIONS_RE = /^https:\/\/[^/]+\/generations\/[^/]+\/[^/@]+$/;

// ---------------------------------------------------------------------------
// THE FALLBACK CONTRACT ONLY HOLDS IF THE COMPRESSED PATH CAN FAIL AT ALL
// ---------------------------------------------------------------------------
//
// Everything below this file's `try/catch`es assumes a `.ktx2` load either
// resolves or rejects. **three's KTX2 path has a third outcome**, and it is the
// one that kills a boot:
//
//   · `WorkerPool.postMessage` (`three/addons/utils/WorkerPool.js`) is
//     `return new Promise( ( resolve ) => { … } )` — **there is no `reject`
//     anywhere in it.** Nothing but a message back from the worker settles it.
//   · The transcoder worker's own readiness is `new Promise( ( resolve ) => {
//     BasisModule = { wasmBinary, onRuntimeInitialized: resolve }; BASIS(…) } )`
//     (`KTX2Loader.BasisWorker`) — also reject-free. A worker whose wasm never
//     instantiates never runs its `transcode` handler and never posts anything.
//   · And the pool marks that worker BUSY. Four wedged workers and every
//     subsequent request lands in `queue` and is never even posted.
//
// So one transcoder that fails to come up on one phone is not one missing
// texture: it is ~20 promises that never settle, `dressField`'s `Promise.all`
// never resolving, and a loader pinned at 60% "Lacing up…" with **nothing in
// flight** — a hang, not a slow download. That failure is phone-shaped by
// construction (`ktx2Textures` returns `undefined` off a phone tier, so a
// desktop never enters this branch at all) and invisible to every desktop check.
//
// A deadline turns that third outcome back into the second one, and the
// fallback chain below then does exactly what it was written to do. It is
// deliberately far longer than any healthy load: at the ~1 MB/s this game's
// assets currently stream at, a 1024² sibling is ~1 s, so 30 s only ever fires
// on something that was never going to arrive. The bound is not a performance
// knob and must not be tuned down into the range where a slow phone can trip it
// — a spurious timeout costs the compressed rung, which is the memory win the
// whole lane exists for.
const KTX2_DEADLINE_MS = 30_000;

/** Reject a never-settling compressed-texture load instead of pending forever. */
function bounded<T>(job: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    job,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`[genex-quality] ktx2 transcode never settled for ${what}`)),
        KTX2_DEADLINE_MS,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Rung widths by role family — mirrors the server's ladder (store.ts MOBILE_RUNGS). */
function rungWidthFor(url: string, tier: QualityTier): number | null {
  if (tier.name !== 'phone' && tier.name !== 'phone-low') return null;
  const role = url.split('/').pop() ?? '';
  if (role === 'skybox-equirect') return tier.name === 'phone-low' ? 2048 : 4096;
  if (role === 'texture-basecolor' || role === 'image-main' || /^image-alt-\d+$/.test(role)) {
    return tier.name === 'phone-low' ? 1024 : 2048;
  }
  return null;
}

/**
 * Resolve the URL a THIS-tier device should load. Non-generated URLs and
 * desktop tiers pass through untouched; phone tiers get the rung sibling.
 */
export function pickAsset(url: string, tier: QualityTier): string {
  if (!GENEX_GENERATIONS_RE.test(url)) return url;
  const width = rungWidthFor(url, tier);
  return width ? `${url}@${width}` : url;
}

/**
 * Load an image URL through the ladder with the bare-URL fallback. Use it for
 * generated skyboxes/textures instead of raw TextureLoader.loadAsync:
 *
 *   const texture = await loadTextureWithFallback(
 *     SKYBOX_URL, tier, (u) => new THREE.TextureLoader().loadAsync(u),
 *   );
 *
 * KTX2-capable games (createGltfLoader with a renderer) can pass `ktx2Load` —
 * on phone tiers the `.ktx2` capability sibling is tried FIRST (textures stay
 * compressed on the GPU, ~6x less VRAM), then the browser-decodable rung,
 * then the original. Every fallback warns: silent degradation hides real
 * pipeline gaps.
 */
export async function loadTextureWithFallback<T>(
  url: string,
  tier: QualityTier,
  load: (resolvedUrl: string) => Promise<T>,
  opts?: { ktx2Load?: (resolvedUrl: string) => Promise<T> },
): Promise<T> {
  const picked = pickAsset(url, tier);
  if (picked !== url && opts?.ktx2Load) {
    try {
      return await capForPhone(await bounded(opts.ktx2Load(`${picked}.ktx2`), `${picked}.ktx2`), url, tier);
    } catch {
      console.warn(`[genex-quality] ktx2 variant missing for ${picked} — using the browser-decodable rung`);
    }
  }
  if (picked === url) return capForPhone(await load(url), url, tier);
  try {
    return await capForPhone(await load(picked), url, tier);
  } catch {
    // Missing rung (old asset, un-backfilled env) — degrade to the original.
    // The cap below is what keeps THIS line survivable on a phone: the fallback
    // is the 8192x4096 panorama, which a phone cannot hold at any rung.
    console.warn(`[genex-quality] rung missing for ${url} — loading the original`);
    return capForPhone(await load(url), url, tier);
  }
}

/**
 * The decode-time ceiling, applied to what the loader just handed back.
 *
 * It is HERE rather than at each call site for the same reason `pickAsset` is:
 * the ladder's whole job is that a caller asks for a URL and gets whatever this
 * device should be holding, and a panorama the rung ladder cannot shrink is
 * still a panorama this device cannot hold. See `texture-cap.ts` for the probe
 * table showing that `skybox-equirect@1024` does not exist, and for the 108.67
 * -> 28.46 MB arithmetic that makes the sky worth 80 MB on its own.
 *
 * DESKTOP TIERS RETURN AT THE FIRST LINE. `isPhoneTier` is a name test against
 * the two phone rows, so the three desktop rows cannot reach the resize, and a
 * desktop frame is bit-identical to what it was before this function existed.
 *
 * It is deliberately narrow: ONE role. A surface texture is 1024 on a phone
 * already and is the thing the player's eye is actually on — the register this
 * game holds itself to calls muddy ground a fail — so nothing but the sky is
 * capped here, and the character's own maps are capped by the caller that owns
 * a rig (`capMaterialTextures`).
 */
function capForPhone<T>(loaded: T, url: string, tier: QualityTier): T {
  if (!isPhoneTier(tier)) return loaded;
  const role = url.split('/').pop() ?? '';
  if (role !== 'skybox-equirect') return loaded;
  const savedMp = capDecodedImage(loaded, PHONE_PANORAMA_MAX_WIDTH);
  if (savedMp > 0) {
    console.info(
      `[genex-quality] panorama capped to ${PHONE_PANORAMA_MAX_WIDTH}px wide on ${tier.name}` +
        ` (${savedMp.toFixed(1)} Mpx off the equirect, and the PMREM and background cube come down with it)`,
    );
  }
  return loaded;
}

// ---------------------------------------------------------------------------
// Generated MODELS (mesh-compression lane). GLB rungs use the same numeric
// suffix — `model-glb@1024` = embedded textures ≤1024 + meshopt (+simplify) —
// but unlike images there is NO edge rewrite for old games: selection happens
// ONLY here, in games that wired the decoders (createGltfLoader). EVERY tier
// loads a game-ready rung — provider-raw originals are archival/remix source,
// not game assets (a Tripo prop is ~500k tris + 3x4096² textures; a scene of
// them floored an M4 Max). Desktop gets @2048, phones @1024; the original is
// only ever the fallback of last resort.

/** Per-tier texture budget: desktop tiers @2048, phone tiers @1024. */
function modelBudgetFor(tier: QualityTier): number {
  return tier.name === "phone" || tier.name === "phone-low" ? 1024 : 2048;
}
const MODEL_ROLE_RE = /^(model-glb|character-rigged(-a\d+)?-glb(-r\d+)?)$/;

/** Resolve the model URL a THIS-tier device should load. `ktx2: true` (from
 *  createGltfLoader) upgrades to the GPU-compressed sibling. */
export function pickModel(url: string, tier: QualityTier, opts?: { ktx2?: boolean }): string {
  if (!GENEX_GENERATIONS_RE.test(url)) return url;
  const role = url.split("/").pop() ?? "";
  if (!MODEL_ROLE_RE.test(role)) return url;
  const rung = `${url}@${modelBudgetFor(tier)}`;
  return opts?.ktx2 ? `${rung}.ktx2` : rung;
}

/**
 * Load a generated model through the rung ladder with the full fallback chain
 * (`.ktx2` → the tier's rung → original). Use with the decoder-wired loader:
 *
 *   const gltf = createGltfLoader(renderer);
 *   const model = await loadModelWithFallback(MODEL_URL, tier, (u) => gltf.loader.loadAsync(u), { ktx2: gltf.ktx2 });
 *
 * The worst case is today's behavior (the full original) — never a broken boot.
 */
export async function loadModelWithFallback<T>(
  url: string,
  tier: QualityTier,
  load: (resolvedUrl: string) => Promise<T>,
  opts?: { ktx2?: boolean },
): Promise<T> {
  const withKtx2 = pickModel(url, tier, opts);
  const universal = pickModel(url, tier, { ktx2: false });
  if (withKtx2 !== universal) {
    try {
      // Same deadline, same reason as the texture branch above: a `.ktx2` GLB
      // is decoded by the same reject-free worker pool, so without it a wedged
      // transcoder parks the model load forever instead of falling through to
      // the universal rung one line down. Unlike the texture branch this one is
      // reachable from a desktop tier — `pickModel` appends `.ktx2` on every
      // tier — but a bound that only fires on a promise which would otherwise
      // never settle cannot change a load that completes, so the desktop's
      // model path is byte-for-byte what it was.
      return await bounded(load(withKtx2), withKtx2);
    } catch {
      console.warn(`[genex-quality] ktx2 model rung missing for ${url} — trying the universal rung`);
    }
  }
  if (universal === url) return load(url);
  try {
    return await load(universal);
  } catch {
    console.warn(`[genex-quality] model rung missing for ${url} — loading the original`);
    return load(url);
  }
}
