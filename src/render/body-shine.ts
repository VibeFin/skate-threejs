// The one thing in the render lane that reaches back into the SCENE, and the
// reason it has to.
//
// ── THE COMPLAINT, AND WHERE IT ACTUALLY CAME FROM ──────────────────────────
//
// "This shine on the character — we have some kind of super shine." Every
// capture agrees with him: the skater carries a bright, flat, non-directional
// glow that no other surface in the plaza has, brightest along his silhouette,
// and it does not go down when he rides into the west block's shadow.
//
// Post was the obvious suspect — bloom picking a light shirt out of a dark
// plaza — and post is innocent, which the numbers below settle without needing
// the bloom switched off: the flat of his back measured display L 0.799 with
// 23.6% of that band above L 0.92 against plaza concrete at 0.389, and taking
// ONE material property off the character (row A → B) dropped it to 0.165 with
// nothing else in the chain touched. A pass that spreads highlights cannot be
// the reason a surface is a highlight. What the bloom was doing was drawing the
// halo AROUND something that had already blown, which is the bloom working
// exactly as intended on a surface that should never have been up there.
//
// The cause is in the asset, in the glTF, and it is a two-line defect that
// Meshy ships on every rig it exports. Read straight out of the GLB's own JSON
// chunk (`rigged-character.glb`, one material, `Material_1`):
//
//   "emissiveFactor": [1, 1, 1],
//   "emissiveTexture": { "index": 0 },
//   "pbrMetallicRoughness": { "baseColorTexture": { "index": 1 } },
//   "extensions": { "KHR_materials_specular": { "specularColorFactor": [2,2,2] } }
//
// …and `textures[0]` and `textures[1]` are BOTH `{ "sampler": 0, "source": 0 }`.
// The same image. The character's albedo map is wired into the EMISSIVE slot at
// full white strength as well as into the base colour. He is not lit brightly;
// he is a lamp shaped like himself, radiating his own texture, and then lit on
// top of that.
//
// Two more numbers come out of the same block and they make it worse rather
// than better:
//
// · `pbrMetallicRoughness` carries NO `metallicFactor` and NO `roughnessFactor`,
//   and the glTF defaults for both are 1.0 — which `GLTFLoader` applies
//   verbatim (`GLTFLoader.js:3586`). So cotton, denim and skin were rendering as
//   a fully-metallic, fully-rough body. A metal has NO diffuse term
//   (`diffuseColor *= 1.0 - metalness` zeroes it), so the sun that lights the
//   whole plaza was contributing almost nothing to him and essentially all of
//   his visible brightness was the emissive. That is exactly why the glow reads
//   as flat and why it does not follow the light: there was no light in it.
// · `specularColorFactor: [2,2,2]` is a literal 2x on dielectric reflectance.
//   It is a no-op TWICE over here — three clamps it (`min(..., vec3(1.0))`) and
//   then `mix(..., diffuse, metalness)` discards it outright at metalness 1 —
//   so it is not the cause, but it is normalised below anyway: the moment
//   metalness comes off 1.0 it stops being inert and starts being a 2x specular
//   nobody asked for.
//
// ── WHAT THIS DOES ABOUT IT, AND WHAT IT DELIBERATELY DOES NOT ──────────────
//
// He asked for the shine WEAKER, not gone. So the emissive stays — it is what
// lifts him off a plaza the metering is holding at mid-grey, and it is a real
// part of how the game reads — it just stops being the entire lighting model.
// What the numbers below do is move his brightness from the emissive term to
// the LIT term: cut the self-glow hard, and give the body back a diffuse
// response so the sun, the sky and the bounce actually reach him. Total
// brightness lands close to where it was; the flat wash becomes shading.
//
// It also does nothing whatsoever to the level. Every constant here is applied
// to SKINNED meshes and nothing else, and the plaza's own specular — the
// handrails at roughness 0.32 / metalness 0.85, the shopfront glass at
// 0.18 / 0.3 — is what an earlier round put there on purpose to fix a frame
// with no specular hit anywhere in it (highlights above L 0.92 measured at
// 0.083% of pixels). None of that is reachable from here.
//
// ── WHY `isSkinnedMesh` IS THE WHOLE TEST ───────────────────────────────────
//
// Because in this project it is exact. The only skinned geometry in the game is
// a generated Meshy humanoid: the player's body and the NPC, who is a
// skeleton-aware clone of the same asset and therefore SHARES these materials.
// The board is a static mesh, the plaza is static geometry, and the vegetation's
// `Skeleton` is `vegetation/grow.ts`'s own procedural type on an InstancedMesh,
// not `THREE.Skeleton`. So "has a skeleton" means "came down from the character
// pipeline", and that is the population with the defect.
//
// ── WHY IT LIVES IN THE RENDER LANE AND RUNS FROM `look.render` ─────────────
//
// The material is wrong the moment it is parsed, and the honest fix is at the
// loader. That file is not this lane's, and the asset is 23 MB of remote GLB
// nobody here can re-export — so the reachable seam is the scene, after the
// body has landed in it. `look.ts` is the only module in this lane that holds
// the scene, ticks every frame, and OUTLIVES a spot change, which is what a
// character who survives a map swap needs.
//
// It is not a per-frame traversal. `renderer.info.memory.geometries` only moves
// when geometry is registered or disposed — a GLB landing, a map unmounting —
// so the common frame costs one integer compare and nothing else. The sweep
// runs on the handful of frames where the scene's contents actually changed,
// and a `WeakSet` means a material is only ever touched once however often it
// is walked past.

import * as THREE from "three";

/**
 * THE FIVE CAPTURES THESE NUMBERS CAME OFF.
 *
 * All on the identical frame — the spawn stance, facing the low sun, the one
 * heading where the shine was loudest — and all read off the same three bands:
 * the flat of his back below the collar (`shirt`), the hot edge down his right
 * shoulder and upper arm (`rim`, which IS the complaint), and the plaza two
 * metres to his left (`ground`, the control).
 *
 *   variant                                 shirt L   >L0.92   rim >L0.92   ground L
 *   A  as shipped   e 1  m 1  r 1  s 2       0.799     23.6%      18.2%       0.389
 *   B  glow off     e 0  m 1  r 1  s 2       0.165      0.0%       0.0%       0.383
 *   C  lit only     e 0  m 0  r 0.62 s 1     0.356      0.0%       0.0%       0.383
 *   D               e 0.20 m 0 r 0.62 s 1    0.523      0.0%       1.2%       0.384
 *   E  shipped now  e 0.30 m 0 r 0.62 s 1    0.594      4.6%      14.8%       0.384
 *
 * Read the rows in order and the whole diagnosis is in them. **A → B**: taking
 * the emissive out and changing nothing else drops the shirt from 0.799 to
 * 0.165 — 79% of everything you could see of this character was the self-glow,
 * and what was left underneath it was darker than the concrete he stands on.
 * That is the proof it was never bloom and never the light rig. **B → C**:
 * metalness alone puts him back to 0.356 without a scrap of emissive, because
 * that is the sun and the sky finally reaching a surface that had been refusing
 * them. **C → E**: the glow comes back at under a third strength to lift him
 * off a plaza sitting at 0.384, and lands at 0.594.
 *
 * And the `ground` column never moves — 0.383 to 0.389 across every row, which
 * is capture noise. Nothing here touches the level, including through the
 * meter: the exposure the plaza is riding is the same in all five.
 */

/**
 * Self-glow left in, as a fraction of the albedo the emissive slot carries.
 *
 * 0.30 and not 0. He said WEAKER, and row C is what "off" looks like: a body
 * lit correctly and honestly, sitting at 0.356 against ground at 0.383, which
 * reads as a slightly dingy cut-out standing on a bright plaza. The glow is
 * doing a real job in this picture — it is what separates the one thing you are
 * steering from sixty metres of concrete — so it stays and just stops being the
 * whole lighting model. What it buys at 0.30: the shirt comes down 26% (0.799 →
 * 0.594), the blown pixels on it drop 5x (23.6% → 4.6%), and the brightest
 * pixel anywhere on him goes from 0.966 to 0.944 — so nothing on the character
 * is pure white any more, which is what the halo was.
 *
 * 0.20 was captured too (row D) and it is the better-behaved number by every
 * measure: no blown pixels at all. It is not the shipped one because by then he
 * has stopped glowing rather than glowing less, and that is a different note
 * from the one that was given.
 */
const EMISSIVE = 0.3;

/**
 * Metalness. Zero, and this is the number that lets the emissive come down at
 * all: at the asset's 1.0 the diffuse term is multiplied out entirely, so the
 * key light, the hemisphere split and the ground bounce all landed on him at
 * roughly nothing (row B: shirt at 0.165 with the glow off) and cutting the
 * glow on its own would only have made him dark. A skater is cotton, denim,
 * canvas and skin — there is no metal on him but the truck axles, which are
 * three pixels.
 */
const METALNESS = 0;

/**
 * Roughness, and it is NOT the asset's 1.0. A perfectly rough dielectric has a
 * specular lobe so broad it is indistinguishable from its own diffuse, which
 * would answer "make the shine weaker" by deleting the last of it. 0.62 is
 * cloth-with-a-sheen: the sun puts a real, directional highlight on his
 * shoulders and the top of the cap — one that swings as he carves and dies when
 * he rides into the west block's shadow, which is the thing the flat emissive
 * glow was standing in for and could never do. Less shine, and what is left is
 * the light rather than the texture.
 */
const ROUGHNESS = 0.62;

/**
 * Dielectric reflectance, back to the physical 1.0 from the asset's 2.0. Inert
 * at metalness 1 and NOT inert at metalness 0 — see the header. Left un-nudged
 * this would have handed the body double the specular of every other non-metal
 * surface in the game at the exact moment it started having any.
 */
const SPECULAR = 1;

export interface BodyShine {
  /**
   * Call once a frame, before the draw. Costs one integer compare on the
   * frames where nothing has been added to or removed from the scene, which is
   * all of them but a handful.
   */
  sync(): void;
}

/** Anything three might hand back for `mesh.material`. */
type AnyMaterial = THREE.Material | THREE.Material[];

/**
 * Tame the generated bodies in `scene`. Safe to build before anything has
 * loaded — it finds the character whenever it arrives, and the NPC too.
 */
export function createBodyShine(renderer: THREE.WebGLRenderer, scene: THREE.Scene): BodyShine {
  // Identity, not uuid: a Set of strings would keep a dead material's key alive
  // across a spot change forever, and the point of the weak reference is that a
  // disposed body takes its bookkeeping with it.
  const done = new WeakSet<THREE.Material>();
  let lastGeometries = -1;

  const tame = (material: AnyMaterial): void => {
    const list = Array.isArray(material) ? material : [material];
    for (const mat of list) {
      if (done.has(mat)) continue;
      done.add(mat);
      // `MeshPhysicalMaterial` sets both flags, so this catches the character's
      // KHR_materials_specular material and a plain standard one alike, and
      // declines anything unlit — a body wearing a MeshBasicMaterial has no
      // lighting model to rebalance and would just go black.
      const std = mat as THREE.MeshStandardMaterial;
      if (!std.isMeshStandardMaterial) continue;

      // The glow is touched ONLY where it is the defect: the emissive slot
      // carrying the very same image as the base colour. A rig whose emissive
      // map is a real emission mask — a visor, a light strip, an LED on a
      // shoe — is left alone, because that one is an artist saying "this part
      // glows" rather than an exporter duplicating a slot.
      //
      // Compared on `source` as well as on identity because three is free to
      // hand back either. The two glTF textures here differ only in index and
      // three happens to resolve them to one `Texture` object, so `===` catches
      // this asset today; `Texture.source` is the decoded image itself and is
      // shared however many wrappers point at it, so the `.source` arm is what
      // keeps this true if that ever stops being the case.
      const map = std.map;
      const glow = std.emissiveMap;
      if (map && glow && (glow === map || glow.source === map.source)) {
        std.emissiveIntensity = EMISSIVE;
      }
      // These two, unlike the glow, are unconditional, and that is the intent
      // rather than an oversight: this is the render lane stating what a body
      // in this game is MADE of. Every skinned mesh here is a human wearing
      // cotton, denim and canvas, no generated rig has ever had a reason to be
      // metal, and a value of 1.0 on either is the glTF default — i.e. the
      // exporter declining to say — far more often than it is a choice.
      std.metalness = METALNESS;
      std.roughness = ROUGHNESS;
      const phys = mat as THREE.MeshPhysicalMaterial;
      if (phys.isMeshPhysicalMaterial) phys.specularColor.setScalar(SPECULAR);
      // No `needsUpdate`. Every one of these is a uniform on an already-compiled
      // program — flagging a recompile here would stall the frame the body
      // lands on, which is the one frame of the session that can least afford it.
    }
  };

  return {
    sync() {
      const geometries = renderer.info.memory.geometries;
      if (geometries === lastGeometries) return;
      lastGeometries = geometries;
      scene.traverse((object) => {
        const skinned = object as THREE.SkinnedMesh;
        if (skinned.isSkinnedMesh) tame(skinned.material);
      });
    },
  };
}
