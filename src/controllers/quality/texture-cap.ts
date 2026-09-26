// Genex adaptive-quality: a DECODE-TIME size ceiling for phone tiers.
//
// WHY THIS EXISTS RATHER THAN A SMALLER RUNG. `pick-asset.ts` is the right tool
// when the rung is there, and it is measured to be missing where it matters
// most. Probed against the live asset host on 2026-07-30:
//
//   skybox-equirect              206   (8192x4096, the desktop original)
//   skybox-equirect@4096         206
//   skybox-equirect@2048         206   <- the lowest rung that EXISTS
//   skybox-equirect@1024         404
//   skybox-equirect@512          404
//   rigged-character.glb         206   (one 4096x4096 texture, uncompressed)
//   rigged-character.glb@1024    404
//   rigged-character.glb@1024.ktx2   404
//   character-rigged-glb         404   (the role name pick-asset matches — the
//                                      player's rig is not even under it)
//
// So the two largest textures in the game — the sky and the player's body —
// cannot be made smaller by asking for a different URL. `loadTextureWithFallback`
// would fall all the way back to the 8192x4096 original on a 404, which on a
// phone is worse than doing nothing at all.
//
// WHAT THE SKY ACTUALLY COSTS, measured with `tools/gpu-audit.mjs` on the
// phone-low tier (390x844 at DPR 3), because the equirect's own row is the small
// half of it:
//
//   generated skybox (2048x1024 + mips)                      10.67 MB
//   PMREM environment, 2 x 1536x2048 RGBA16F                 48.00 MB
//   background cube, 6 x 1024x1024 + mips                    32.00 MB
//   its six per-face depth renderbuffers, 1024x1024x24bit    18.00 MB
//                                                           ---------
//                                                           108.67 MB   of a
//   279.23 MB total — 39% of everything the phone holds, for a strip of haze
//   along the top of the frame.
//
// The 80 MB of that which is NOT the equirect is three.js reacting to its SIZE:
// `scene.environment` sends it through `PMREMGenerator`, whose cubeUV target is
// 3 x (width/4) by 4 x (width/4); `scene.background` sends it through
// `WebGLEnvironments.getCube`, which builds a `WebGLCubeRenderTarget(image.height)`
// — six mipped faces plus a depth renderbuffer each. Both are quadratic in the
// image the game hands them, and neither is reachable from a tier table. Halving
// the decoded panorama is therefore the only lever that moves all four rows at
// once, and it moves them by 4x.
//
// THE ONE RULE THIS FILE OBEYS: every function here returns without touching
// anything unless the tier is `phone` or `phone-low`. A desktop tier's picture
// is not this lane's to change — see `isPhoneTier`.
import type { QualityTier } from './tier.ts';
import { detectTier, isPhoneTier } from './tier.ts';

/**
 * The phone ceiling for a 360° panorama, in pixels of WIDTH.
 *
 * 1024 and not 2048, and the reason is the arithmetic above rather than the
 * texture's own row: at 2048 the sky's four allocations come to 108.67 MB, at
 * 1024 they come to 28.46 MB (2.80 equirect + 12.58 PMREM + 8.39 cube + 4.72
 * depth), and the picture it buys back is a haze band.
 *
 * What it costs in sharpness, stated so nobody has to guess: a 1024-wide
 * equirect carries 2.8 pixels per degree of yaw, against the 9.4 a 585 px phone
 * frame at 62° resolves — so the sky is about 3x softer than the screen it is
 * drawn on. That is the correct trade for THIS game and it is written down
 * because it would be the wrong one for a game played looking up: the block is
 * ringed by 11-15 m of brick and the camera points at the floor.
 * `world/field.ts` had already reached the same conclusion one rung higher up
 * (it forces every phone onto the 2048 sky rather than handing `phone` the 4096
 * one) — this is that decision followed to where the memory actually is.
 */
export const PHONE_PANORAMA_MAX_WIDTH = 1024;

/**
 * The phone ceiling for a character's own maps. 1024 against the 4096x4096 the
 * player's rig ships: 85.33 MB of uncompressed sRGB with a full mip chain, the
 * single largest allocation in the game on every tier, and the one the rung
 * ladder cannot reach (see the probe table above).
 *
 * 1024 is the same number `pick-asset.ts` already asks for on phone tiers when a
 * model DOES have rungs (`modelBudgetFor`), so a body that arrives without them
 * is held to the budget its siblings keep rather than to none at all.
 */
export const PHONE_CHARACTER_MAX_WIDTH = 1024;

/** What a texture-like object has to look like for this file to resize it. */
interface ImageTextureLike {
  image?: { width?: number; height?: number } | null;
  needsUpdate?: boolean;
  name?: string;
}

/**
 * Redraw a decoded image at or below `maxWidth`, preserving aspect, and hand the
 * texture the smaller canvas. Returns the megapixels saved, or 0 if nothing was
 * done — a caller that wants to log has a number rather than a guess.
 *
 * Powers of two on both axes are kept power-of-two: the scale is the smallest
 * halving that fits, not `maxWidth / width`. A 2048x1024 panorama becomes
 * 1024x512 and not 1024x500, because three still wants to mip it and a
 * non-power-of-two equirect would cost the whole chain.
 */
export function capDecodedImage(texture: unknown, maxWidth: number): number {
  const tex = texture as ImageTextureLike | null;
  const image = tex?.image;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (!width || !height || width <= maxWidth) return 0;
  // Halve until it fits. `Math.ceil(log2(...))` rather than a divide, so the
  // result of a power-of-two input is a power of two.
  const steps = Math.ceil(Math.log2(width / maxWidth));
  const factor = 2 ** steps;
  const w = Math.max(1, Math.round(width / factor));
  const h = Math.max(1, Math.round(height / factor));
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return 0; // non-DOM context (a harness) — leave the texture alone
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  // A straight `drawImage` downscale is a bilinear halving per step on every
  // engine that matters at exactly 2x, which is what this is.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  try {
    ctx.drawImage(image as unknown as CanvasImageSource, 0, 0, w, h);
  } catch {
    // Cross-origin without CORS would TAINT this canvas, and a tainted canvas
    // throws SecurityError at `texImage2D` rather than here — i.e. the failure
    // would land on the GPU upload as a black sky instead of a big one. Every
    // generated asset in this game arrives through `TextureLoader`, whose
    // `crossOrigin` is `anonymous`, and the host sends the header (verified: the
    // capped panorama renders), so this branch is insurance for an asset that
    // one day does not — and the insurance is the ORIGINAL image, unresized.
    return 0;
  }
  (tex as { image: HTMLCanvasElement }).image = canvas;
  if (tex) tex.needsUpdate = true;
  // AND HAND THE DECODED ORIGINAL BACK, which is not the same win as the one
  // above and is invisible to a GL census. `GLTFLoader` decodes embedded images
  // through `ImageBitmapLoader` wherever `createImageBitmap` exists, so a
  // character's map arrives as a 4096x4096 ImageBitmap — 67 MB the browser
  // holds until it is closed, and after the redraw above nothing will ever read
  // it again: `texture.image` is the canvas now and the bitmap is unreachable.
  // `ui/menu-stage.ts` has shipped exactly this line since it started shrinking
  // its portrait. It is a no-op on the panorama path, whose `TextureLoader`
  // hands back an `HTMLImageElement`.
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
  return (width * height - w * h) / 1e6;
}

/**
 * Cap every map on every material under `root`. For rigs and props that arrive
 * WITHOUT a mobile rung — the player's body is one — this is the only thing
 * standing between a phone and an 85 MB texture.
 *
 * Called after the GLTF has parsed and before the model is added to a scene, so
 * nothing has been uploaded yet and the big image never reaches the GPU at all.
 * That ordering is the whole point: a cap applied after the first frame would
 * have already paid for the allocation it is trying to avoid.
 */
export function capMaterialTextures(
  root: { traverse: (fn: (node: unknown) => void) => void } | null | undefined,
  tier: QualityTier,
  maxWidth: number = PHONE_CHARACTER_MAX_WIDTH,
): number {
  if (!root || !isPhoneTier(tier)) return 0;
  let savedMp = 0;
  // One texture can be shared by several materials and several meshes; capping
  // it twice is harmless (the second pass sees a width already at the ceiling)
  // but the SET is what the return value has to count.
  const seen = new Set<unknown>();
  root.traverse((node) => {
    const mesh = node as { material?: unknown };
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const material of materials) {
      for (const value of Object.values(material as Record<string, unknown>)) {
        const candidate = value as { isTexture?: boolean } | null;
        if (!candidate?.isTexture || seen.has(candidate)) continue;
        seen.add(candidate);
        savedMp += capDecodedImage(candidate, maxWidth);
      }
    }
  });
  return savedMp;
}

/**
 * THE ONE ROUTE A RIG GLB TAKES BEFORE IT REACHES THE GPU — and it exists
 * because for a while there were three routes and only one of them capped.
 *
 * WHAT A CHARACTER IN THIS GAME ACTUALLY IS, read straight out of both GLBs'
 * JSON chunks rather than assumed from the usual PBR set: `images: 1`,
 * `textures: 2`, `materials: 1`, and BOTH texture defs are
 * `{ source: 0, sampler: 0 }` — one 4096x4096 uncompressed PNG wired into
 * `baseColorTexture` AND `emissiveTexture` (see `render/body-shine.ts`, which
 * is about the second of those). three's GLTFLoader caches by source+sampler,
 * so that is ONE Texture on the GPU: 4096x4096 sRGB with its mip chain,
 * **85.33 MB**. There is no normal map, no metallic-roughness map, no
 * occlusion map — the base colour is the whole of a body's texture cost.
 *
 * THE THREE ROUTES. `motion/rigs.js` parses the body you ride and capped.
 * `ui/menu-stage.ts` has its own unconditional 1024 shrink and `affordable()`
 * gates the whole stage off both phone tiers, so a phone never reaches it.
 * `world/npc.ts` — the man in the plaza, who wears the OTHER 4096 rig through
 * `loadMeshyCharacter` — did not, which is how a phone came to hold 85.33 MB
 * in one texture, **51.5% of its entire GPU budget**, for a figure standing on
 * a pavement. A call site that has to REMEMBER to cap is a call site that
 * eventually does not, so the tier lookup and the ceiling live here, and both
 * rig parse sites call this instead of assembling the arguments themselves.
 *
 * WHY THIS AND NOT THE RUNG LADDER. `pick-asset.ts` is the structural answer
 * wherever rungs exist, and here they provably do not — twice over. (1) Every
 * rung URL is a 404, probed with range GETs on 2026-07-30 against both rigs:
 * `…/rigged-character.glb@1024`, `@2048`, `@1024.ktx2` and the `@1024.glb`
 * spelling all answer 404 where the bare URL answers 206. (2) Even with the
 * files present, `pickModel` would never ask for them: its `MODEL_ROLE_RE`
 * matches the roles `model-glb` and `character-rigged-…-glb`, and this
 * generation's last path segment is `rigged-character.glb`, which matches
 * neither — so `pickModel` returns the URL unchanged and
 * `loadModelWithFallback` degrades to a plain load. Wiring the character
 * through it would add zero requests and buy zero bytes; it is recorded here
 * so the next reader does not have to re-derive it.
 *
 * KTX2 IS NOT AVAILABLE ON THIS TEXTURE EITHER, and it could not be combined
 * with this if it were: `capDecodedImage` redraws a decoded image into a
 * smaller canvas and a `CompressedTexture` has no decoded image to redraw —
 * it returns 0. Cap or compress, never both, per texture.
 *
 * PHONE TIERS ONLY, BY CONSTRUCTION. `capMaterialTextures` returns at its
 * first line unless `isPhoneTier(tier)`, which is a name test against the two
 * phone rows; the three desktop rows cannot reach the resize from here, and
 * desktop keeps the full-resolution character.
 */
export function capRigTextures(
  root: { traverse: (fn: (node: unknown) => void) => void } | null | undefined,
  what: string,
): number {
  const tier = detectTier();
  const savedMp = capMaterialTextures(root, tier, PHONE_CHARACTER_MAX_WIDTH);
  if (savedMp > 0) {
    console.info(
      `[genex-quality] ${what} capped to ${PHONE_CHARACTER_MAX_WIDTH}px on ${tier.name}` +
        ` (${savedMp.toFixed(1)} Mpx off the body — one map, base colour and emissive both)`,
    );
  }
  return savedMp;
}
