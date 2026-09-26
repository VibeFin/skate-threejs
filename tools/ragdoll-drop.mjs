// Drops the real skater and measures what happens to him.
//
//   node --experimental-strip-types tools/ragdoll-drop.mjs
//
// Fixed step, no renderer, the actual generated Meshy rig, the actual
// `src/skate/ragdoll.ts` and — for everything that matters — the actual
// `STREET_SPOT`. Every claim about the ragdoll in this project comes out of
// here: time to settle, whether a bone length drifted, whether anything ended up
// under the floor, HOW HIGH ABOVE THE FLOOR HE CAME TO REST, and the worst
// single-frame joint rotation, because a real body has no 170° snaps in it and a
// broken solver is full of them.
//
// The capture pose is the game's own rolling stance, and the bone history is fed
// in by actually riding him for half a second first, so the seeding path
// (`observe()`) is under test too rather than being assumed.
//
// Three things about this file are the scar tissue of round 3, where 43 checks
// went green over a broken feature:
//
// · **It runs the REAL spot.** Every wall bug this project has had was found at
//   a specific solid — the loading-dock face, the quarter-pipe deck, the north
//   building — and none of them exist in a step function. `STREET_CASES` bails
//   him at those places, at the speeds the ride actually reaches.
//
// · **It runs at 30, 60 and 144.** A solver with a fixed substep and a variable
//   frame is two different solvers, and the number of substeps a frame is the
//   knob that changes.
//
// · **The liars lie the way the world actually lied.** A provider that answers a
//   constant 15 m is trivially caught by any rise test. The real `StreetSpot`
//   answers a query it cannot resolve WITH THE Y-HINT IT WAS HANDED, which is a
//   rise of zero every substep and a body on a 12 m roof inside a second — and
//   it passes a rise-since-last-frame test every single frame. `ECHO` is that
//   provider, and the `rest` column is what catches it: a body asleep on a roof
//   satisfies every other assertion in this table.

import { register } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

// A DIRECTORY import — `./procedural` meaning `./procedural/index.ts` — is
// something every bundler resolves and node's ESM loader does not, and
// `ts-resolve.mjs` only tries the `.ts` sibling. `src/world/spot.ts` grew one
// (`import … from "./procedural"`) and it stops every harness in this folder
// dead, this one included. The two lines that fix it belong in
// `tools/ts-resolve.mjs`, which is not this lane's file to write, so they are
// carried here until they land there — and they cost nothing once they do,
// because this only fires where the `.ts` sibling does not exist.
register(
  "data:text/javascript," +
    encodeURIComponent(`
      import { existsSync } from "node:fs";
      import path from "node:path";
      import { fileURLToPath, pathToFileURL } from "node:url";
      export async function resolve(specifier, context, nextResolve) {
        if (specifier.startsWith(".") && path.extname(specifier) === "" && context.parentURL) {
          const base = path.dirname(fileURLToPath(context.parentURL));
          const index = path.resolve(base, specifier, "index.ts");
          if (!existsSync(path.resolve(base, specifier + ".ts")) && existsSync(index)) {
            return nextResolve(pathToFileURL(index).href, context);
          }
        }
        return nextResolve(specifier, context);
      }
    `),
  import.meta.url,
);
register(new URL("./ts-resolve.mjs", import.meta.url));
const { createRagdoll } = await import("../src/skate/ragdoll.ts");
const { STREET_SPOT, SOLIDS, topOf, QP_LIP_Z } = await import("../src/world/spot.ts");
// The width of the stand-up's hand-back, from the file that owns it — see `stood`.
const { RISE_OUT } = await import("../src/skate/fall/get-up.ts");

/**
 * THE RIDE'S OWN TWO NUMBERS FOR HOW LONG A BAIL LASTS — read out of
 * `skate-model.ts` as text, because that file exports neither of them and this
 * lane may not add an export to it.
 *
 * Round three's finding, in the critic's words: *"`grep -c "SkateModel"
 * tools/ragdoll-drop.mjs` returns 0 — the harness drives `createRagdoll`
 * standalone against a parked mixer, so `RAGDOLL_RECOVER` is outside all 195
 * checks"*. That was exactly true, and it is why a 2.2 s stand-up could sit on
 * three green columns while, in the game, the player spent every millisecond of
 * it pushing a man on his hands and knees across the plaza.
 *
 * Reading the source is not cleverness for its own sake. A copied constant is a
 * constant that goes stale silently, and the whole point of this pair is that
 * the stand-up is judged against what the RIDE actually does — so if either of
 * them moves, this file has to see it move. Missing them is a hard stop rather
 * than a default: a default would be this file inventing the ride's behaviour.
 */
const RIDE = (() => {
  const src = readFileSync(new URL("../src/skate/skate-model.ts", import.meta.url), "utf8");
  const read = (name) => {
    const m = new RegExp(`const ${name} = ([0-9.]+);`).exec(src);
    if (!m) throw new Error(`ragdoll-drop: ${name} is gone from skate-model.ts — fix this file`);
    return Number(m[1]);
  };
  return { minDown: read("RAGDOLL_MIN_DOWN"), recover: read("RAGDOLL_RECOVER") };
})();
/**
 * When the ride takes the controls back, in seconds after the bail.
 *
 * `SkateModel.updateRagdoll`: `rested = bailT >= RAGDOLL_MIN_DOWN && body.settled`,
 * and `if (rested || bailT >= RAGDOLL_RECOVER)` he is `rolling` again — and
 * `main.ts` calls `ragdoll.release()` on that same frame. So the stand-up starts
 * exactly when the player gets his controls back and the window it has to itself
 * is ZERO, at every settle time in this table.
 */
const handBack = (settle) =>
  Math.min(RIDE.recover, Math.max(RIDE.minDown, settle < 0 ? RIDE.recover : settle));

const SKATER_URL =
  "https://assets.auras.cc/generations/cms0fbiar004o22nuyjqjhzuz/rigged-character.glb";
const RIDE_URL =
  "https://assets.auras.cc/generations/cms1pxt86000i22lphj1usysu/character-motion-uthana-mSN1m41g3uF6-glb";
/**
 * THE GET-UP TAKE — the same generation `src/skate/fall/get-up-take.ts` loads,
 * and the reason this file can now measure a stand-up at all.
 *
 * Round two's finding, in the critic's words: *"178 of the 180 green rows assert
 * nothing at all about the stand-up"*. That was exactly true, and the shape of it
 * matters more than the number: the two rows that DID assert fed the RIDING
 * STANCE into the clip slot, because the get-up take had not been wired, so the
 * table's only coverage of the stand-up was a clip with no stand-up in it.
 *
 * The take is loaded here rather than reached for through the ragdoll's own
 * loader for one reason: the harness has no browser and no bundler under it, and
 * a row must be able to say WHICH take it ran. Every row runs this one now
 * (`getUpClip` defaults to it in `run`), which is the configuration that ships;
 * the two `noTake` rows below run the cross-fade on purpose, and assert that it
 * still reads as the cut it is.
 */
const GETUP_URL =
  "https://assets.auras.cc/generations/cms51mx9o003d22oz0yd8rn0t/character-motion-uthana-mxzpuR97gzzo-glb";

/**
 * The frame times a player actually has. A solver is not one solver across them,
 * and the number of substeps a frame is the knob that changes it — 30 fps takes
 * six of them, 144 takes one or two. Every case in this file runs at every one.
 */
const RATES = [30, 45, 60, 90, 144];
/**
 * The window `held°` reads a limb's turn over, seconds. A tenth of a second is
 * the same span at 30 fps and at 144, which is exactly what a per-frame limb
 * measure is not.
 */
const LIMB_WINDOW = 0.1;
const CACHE = path.join(os.tmpdir(), "skate-ragdoll-harness");

// ---------------------------------------------------------------------------
// loading a GLB with no browser under it
// ---------------------------------------------------------------------------

async function cached(url, name) {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, name);
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
}

/**
 * Strips materials, textures and images out of a GLB.
 *
 * three's GLTFLoader reaches for `self.createImageBitmap` the moment a material
 * references a texture, and there is no `self` in node. Nothing here measures
 * pixels, so the pixels go.
 */
function stripImages(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
  delete json.materials;
  delete json.textures;
  delete json.images;
  delete json.samplers;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) delete prim.material;
  }

  let js = JSON.stringify(json);
  while (js.length % 4 !== 0) js += " ";
  const jsonBytes = new TextEncoder().encode(js);
  const binStart = 20 + jsonLen;
  const binLen = dv.getUint32(binStart, true);
  const bin = buf.subarray(binStart + 8, binStart + 8 + binLen);

  const total = 12 + 8 + jsonBytes.length + 8 + binLen;
  const out = new Uint8Array(total);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, 0x46546c67, true);
  odv.setUint32(4, 2, true);
  odv.setUint32(8, total, true);
  odv.setUint32(12, jsonBytes.length, true);
  odv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  odv.setUint32(20 + jsonBytes.length, binLen, true);
  odv.setUint32(24 + jsonBytes.length, 0x004e4942, true);
  out.set(bin, 28 + jsonBytes.length);
  return out.buffer;
}

function parseGlb(ab) {
  return new Promise((ok, fail) => new GLTFLoader().parse(ab, "", ok, fail));
}

// ---------------------------------------------------------------------------
// worlds to land on
// ---------------------------------------------------------------------------

function makeWorld(height, { kind = "concrete", blocked = () => false, sample } = {}) {
  const out0 = { height: 0, normal: new THREE.Vector3(0, 1, 0), kind };
  const normal = (x, z, out = new THREE.Vector3()) => {
    const d = 0.12;
    const e1 = new THREE.Vector3(2 * d, height(x + d, z) - height(x - d, z), 0);
    const e2 = new THREE.Vector3(0, height(x, z + d) - height(x, z - d), 2 * d);
    return out.crossVectors(e2, e1).normalize();
  };
  const world = {
    // `height` is the TRUTH and `sample` is what the provider says. They are the
    // same function in an honest world, and a liar is exactly a world where they
    // are not — which is also what stops the harness measuring the lie against
    // itself and calling it a pass.
    height: (x, z) => height(x, z),
    normal,
    sample(x, z, hint, out = out0) {
      out.height = sample ? sample(x, z, hint) : height(x, z);
      normal(x, z, out.normal);
      out.kind = kind;
      return out;
    },
    slopeAlong(x, z, dx, dz) {
      const d = 0.15;
      return (height(x + dx * d, z + dz * d) - height(x - dx * d, z - dz * d)) / (2 * d);
    },
    rails: () => [],
    blocked,
    spawn: () => ({ x: 0, z: 0, heading: Math.PI / 2 }),
  };
  return world;
}

const FLAT = makeWorld(() => 0);
/** A 0.6 m ledge he rolls off the end of at x = 4. */
const LEDGE = makeWorld((x) => (x < 4 ? 0.6 : 0), {
  blocked: (x, _z, y) => x >= 4 && x < 4.35 && y < 0.6,
});
/** Five 0.18 m steps down, starting at x = 2. */
const STAIRS = makeWorld((x) => {
  if (x < 2) return 0.9;
  const step = Math.floor((x - 2) / 0.32);
  return Math.max(0, 0.9 - 0.18 * Math.min(5, step + 1));
});

/**
 * A world that LIES, which is the whole point of it.
 *
 * Flat concrete everywhere, and past x = 2 every height query answers 15 however
 * it is asked. This is the crude lie — a wall's roof handed to a body at knee
 * height — and any rise test at all catches it. It stays because it is the
 * cheapest proof that the rejection path still works.
 */
const LIAR = makeWorld((x) => (x > 2 ? 15 : 0));
const LIAR_TRUTH = () => 0;
/** The worst version of the crude lie: every query, from the capture frame on. */
const LIAR_ALL = makeWorld(() => 15);
/** An HONEST wall, so the liar's wall case can be read against something. */
const WALL = makeWorld(() => 0, { blocked: (x, _z, y) => x >= 9 && x < 9.4 && y < 3 });
/** …and the crude lie with a real wall face in it, so `blocked` is under test too. */
const LIAR_WALL = makeWorld((x) => (x > 2 ? 15 : 0), {
  blocked: (x, _z, y) => x >= 9 && x < 9.4 && y < 15,
});

/**
 * THE LIE THE WORLD ACTUALLY TELLS, and the one that beat the last two rounds.
 *
 * `StreetSpot.resolve` cannot find a floor for a point inside solid matter, and
 * answers with `Math.min(insideTop, yHint)` — which past a building is the
 * Y-HINT ITSELF. "The floor is exactly where you asked from" is a rise of zero
 * against last frame, so every plausibility test written against the body's
 * recent position passes it, every frame, while the projection lifts the body
 * one radius per pass and walks it up 12 m of brick.
 *
 * Everything at x ≥ 6 here is a building: solid to 12 m, and the height query
 * echoes the hint back. The truth is that there is no floor there at all and the
 * body belongs on the concrete at 0.
 */
const ECHO = makeWorld(() => 0, {
  sample: (x, _z, hint) => (x >= 6 ? (hint === undefined ? 12 : Math.min(12, hint)) : 0),
  blocked: (x, _z, y) => x >= 6 && y < 12,
});
/** …and the same echo with NO wall, so the floor guard is measured on its own. */
const ECHO_OPEN = makeWorld(() => 0, {
  sample: (x, _z, hint) => (x >= 6 ? (hint === undefined ? 12 : Math.min(12, hint)) : 0),
});

// ---------------------------------------------------------------------------
// the real spot, and the truth about it
// ---------------------------------------------------------------------------

/**
 * The honest floor at a point: the highest solid top at or below `cap`, or null
 * where there is none — which is what "inside a building" looks like from here.
 *
 * The cap is what makes this a truth rather than a second opinion. `SOLIDS`
 * stacks freely, so the topmost thing at (x, z) can be a roof 15 m up; a body
 * that bailed on the plaza can only ever come to rest on something it could
 * reach, so the query is capped a little above the floor he bailed over and
 * everything above that is not floor, it is architecture.
 */
function streetGround(x, z, cap) {
  let best = null;
  for (const s of SOLIDS) {
    const top = topOf(s, x, z);
    if (top === null || top > cap) continue;
    if (best === null || top > best) best = top;
  }
  return best;
}

// ---------------------------------------------------------------------------
// the measurement
// ---------------------------------------------------------------------------

const character = await parseGlb(stripImages(await cached(SKATER_URL, "skater.glb")));
const rideGlb = await parseGlb(stripImages(await cached(RIDE_URL, "ride.glb")));
const RIDE_CLIP = rideGlb.animations[0];
if (!RIDE_CLIP) throw new Error("no ride clip — the capture pose would be a T-pose");
const getUpGlb = await parseGlb(stripImages(await cached(GETUP_URL, "get-up.glb")));
const GETUP_CLIP = getUpGlb.animations[0];
if (!GETUP_CLIP) throw new Error("no get-up take — every stand-up row would measure the fallback");
// …and it is the get-up rather than one of the sixteen locomotion takes the same
// batch produced. Checked here rather than taken from the asset table: the whole
// point of the `rise` column is that a take which does not start on the floor
// cannot be measured as a stand-up, and that is a fact about the FILE.
{
  const root = GETUP_CLIP.tracks.find((t) => /(^|\.)hips\.position$/i.test(t.name));
  if (!root) throw new Error("the get-up take has no root height track to measure");
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < root.times.length; i++) {
    lo = Math.min(lo, root.values[i * 3 + 1]);
    hi = Math.max(hi, root.values[i * 3 + 1]);
  }
  // The rig is authored in centimetres, so this is 0.22 m → 0.83 m: a body that
  // starts on the floor and finishes standing. The locomotion takes from the same
  // call never leave 0.79–0.87.
  if (!(hi - lo > 40)) {
    throw new Error(`the take in the get-up slot never leaves the ground (${lo}→${hi})`);
  }
}

function bonesOf(root) {
  let skeleton = null;
  root.traverse((o) => {
    if (!skeleton && o.isSkinnedMesh) skeleton = o.skeleton;
  });
  return skeleton ? skeleton.bones : [];
}

function skinnedMeshOf(root) {
  let mesh = null;
  root.traverse((o) => {
    if (!mesh && o.isSkinnedMesh) mesh = o;
  });
  return mesh;
}

// ---------------------------------------------------------------------------
// how THICK he is — measured off the skin, not off the solver
// ---------------------------------------------------------------------------

/**
 * Each bone's own flesh radius, in metres, taken from the SKIN in its bind pose.
 *
 * This is the number `thru` below is measured against, and where it comes from
 * is the whole point of it. The solver has a `RADIUS` table of its own; scoring
 * self-intersection against that table would be marking the solver's homework
 * with the solver's own answer sheet — shrink the table and the body would pass
 * for being thinner rather than for holding together. The mesh cannot be argued
 * with: for every vertex the skin gives OUTRIGHT to one bone, this is how far
 * that vertex sits from the line the bone draws, at the 70th percentile so a
 * single stray vertex on a hem does not become the arm's width.
 *
 * A bone with no child (a finger tip, the head marker) has no line to measure
 * against and is left out — nothing in the table below is judged on it.
 */
function skinRadii(mesh, bones, childOf) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const per = bones.map(() => []);
  const v = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ap = new THREE.Vector3();
  // Vertices and bones read in ONE frame, which is the whole trick here: a
  // rig's node pose is not always its bind pose, and taking the vertices from
  // the geometry while taking the bones from the node hierarchy silently
  // measures the difference between the two. Measured that way first, this rig
  // put the head's flesh 1.5 m off its own axis. `applyBoneTransform` puts a
  // vertex exactly where the skin draws it for the pose the bones are in, so
  // both sides of the distance come from the same skeleton.
  mesh.skeleton.update();
  const at = bones.map((x) => x.getWorldPosition(new THREE.Vector3()));
  for (let i = 0; i < pos.count; i++) {
    let best = -1;
    let bw = 0.75; // only vertices one bone owns outright
    for (const c of ["X", "Y", "Z", "W"]) {
      const w = sw[`get${c}`](i);
      if (w > bw) {
        bw = w;
        best = si[`get${c}`](i);
      }
    }
    const child = best >= 0 ? childOf[best] : -1;
    if (child < 0) continue;
    v.fromBufferAttribute(pos, i);
    mesh.applyBoneTransform(i, v);
    mesh.localToWorld(v);
    a.copy(at[best]);
    b.copy(at[child]);
    ab.subVectors(b, a);
    const len2 = ab.lengthSq();
    if (len2 < 1e-8) continue;
    const t = Math.max(0, Math.min(1, ap.subVectors(v, a).dot(ab) / len2));
    per[best].push(v.distanceTo(ap.copy(a).addScaledVector(ab, t)));
  }
  return per.map((list) => {
    if (list.length < 8) return 0;
    list.sort((x, y) => x - y);
    return list[Math.floor(list.length * 0.7)];
  });
}

// scratch for `segmentGap` — it runs a few hundred times a frame
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _r = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _c2 = new THREE.Vector3();

/** Closest distance between two segments. */
function segmentGap(p1, q1, p2, q2) {
  const d1 = _d1.subVectors(q1, p1);
  const d2 = _d2.subVectors(q2, p2);
  const r = _r.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s = 0;
  let t = 0;
  if (a < 1e-9 && e < 1e-9) return p1.distanceTo(p2);
  if (a < 1e-9) {
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = d1.dot(r);
    if (e < 1e-9) {
      s = Math.max(0, Math.min(1, -c / a));
    } else {
      const bb = d1.dot(d2);
      const denom = a * e - bb * bb;
      s = denom > 1e-9 ? Math.max(0, Math.min(1, (bb * f - c * e) / denom)) : 0;
      t = (bb * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (bb - c) / a));
      }
    }
  }
  return _c1.copy(p1).addScaledVector(d1, s).distanceTo(_c2.copy(p2).addScaledVector(d2, t));
}

/**
 * Mesh edges whose two ends are dominated by the SAME bone — the "did the mesh
 * explode" test.
 *
 * Any edge that spans two bones legitimately stretches when the pose changes;
 * that is what skinning IS, and measuring it says nothing. An edge inside one
 * bone's influence is transformed rigidly, so its length must not move at all,
 * whatever the pose. Anything that shows up here is the ragdoll writing scale
 * or shear into a bone.
 */
function skinSample(mesh, count = 300) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const idx = geo.index;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const top = (v) => {
    let best = 0;
    let bw = -1;
    for (const c of ["x", "y", "z", "w"]) {
      const w = sw[`get${c.toUpperCase()}`](v);
      if (w > bw) {
        bw = w;
        best = si[`get${c.toUpperCase()}`](v);
      }
    }
    return bw > 0.999 ? best : -1; // only vertices ONE bone owns outright
  };
  const tris = idx ? idx.count / 3 : pos.count / 3;
  const picks = [];
  for (let t = 0; t < tris && picks.length < count; t++) {
    const a = idx ? idx.getX(t * 3) : t * 3;
    const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const ba = top(a);
    if (ba >= 0 && ba === top(b)) picks.push([a, b]);
  }
  return picks;
}

/**
 * How far a bone is above the floor, measured so a knife-edge does not lie.
 *
 * A step has no thickness: a toe that has draped over a ledge and come to rest
 * on the pavement BELOW it reads as 58 cm underground if it happens to sit
 * 0.2 mm on the ledge's side of the lip. Measured that exact frame —
 * x = 3.999795, y = 0.014, sitting on ground zero. A particle is a sphere with a
 * radius, so the honest question is whether there is floor above it anywhere it
 * could actually be, not at one infinitely thin x.
 */
function clearanceOf(truth, x, y, z) {
  const d = 0.04;
  // …and the floor is asked for AT THIS BONE'S OWN HEIGHT, which is the same
  // y-hint rule the world's provider resolves by and the same "a body cannot
  // climb" rule the bail-time cap already applies to the whole skeleton.
  //
  // It stopped being optional the day the spot grew street furniture. A park
  // bench is a solid whose top is 0.45 m over its own footprint, so a head
  // lying on the CONCRETE beside its legs — which is where a body that slides
  // into a bench ends up — read as 38 cm underground on every frame it was
  // there. Asked at the head's own height the bench is simply not the floor
  // under it, and the concrete is.
  //
  // What this still catches, which is the whole job: a bone sinking THROUGH the
  // surface it is lying on. That surface is at or below the bone by
  // construction, so nothing about it moves. What it no longer claims to catch
  // is a limb buried in the vertical FACE of something — there is no
  // instrument for that here, and there never was one that worked: it only
  // ever fired when the thing happened to be short enough to sit under the
  // bail-time cap.
  const cap = y + 0.05;
  let floor = truth(x, z, cap);
  for (const [ox, oz] of [
    [d, 0],
    [-d, 0],
    [0, d],
    [0, -d],
  ]) {
    floor = Math.min(floor, truth(x + ox, z + oz, cap));
  }
  return y - floor;
}

function edgeLengths(mesh, picks, out) {
  mesh.skeleton.update();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const geo = mesh.geometry;
  for (let i = 0; i < picks.length; i++) {
    a.fromBufferAttribute(geo.attributes.position, picks[i][0]);
    b.fromBufferAttribute(geo.attributes.position, picks[i][1]);
    mesh.applyBoneTransform(picks[i][0], a);
    mesh.applyBoneTransform(picks[i][1], b);
    out[i] = a.distanceTo(b);
  }
  return out;
}

/**
 * The deck, at the size and the offset `SkaterRig` gives it.
 *
 * A box rather than the generated GLB on purpose: what is under test is where
 * the fall PUTS a deck, and a box with the real deck's extents measures that
 * exactly while costing no download. The numbers are the rig's own — 0.96 m
 * nose to tail, the wheels resting `AXLE_HEIGHT` below the node that carries
 * it, the grip tape 6 cm above it.
 */
const AXLE_HEIGHT = 0.055;
function deckMesh() {
  const geo = new THREE.BoxGeometry(0.21, 0.125, 0.96);
  geo.translate(0, 0.0075, 0); // wheels at -0.055, grip tape at +0.07
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
}

const _dw = new THREE.Vector3();

/**
 * The skeleton's own flesh, measured once. Every clone of the character shares
 * this bone order, so one pass over the bind pose serves all 170 rows.
 */
const BODY = (() => {
  const holder = cloneSkeleton(character.scene);
  holder.updateMatrixWorld(true);
  const bones = bonesOf(holder);
  const parentOf = bones.map((b) => {
    let p = b.parent;
    while (p && !bones.includes(p)) p = p.parent;
    return bones.indexOf(p);
  });
  const childOf = bones.map((_, i) => parentOf.indexOf(i));
  const radius = skinRadii(skinnedMeshOf(holder), bones, childOf);
  // Segments worth testing against each other: a bone with a child, flesh on
  // it, and not one of the fingers/markers the solver skips too.
  const segs = [];
  for (let i = 0; i < bones.length; i++) {
    if (childOf[i] < 0 || radius[i] <= 0) continue;
    segs.push(i);
  }
  const ancestor = (i, j) => {
    // is j an ancestor of i (or the same bone)?
    for (let k = i; k >= 0; k = parentOf[k]) if (k === j) return true;
    return false;
  };
  const pairs = [];
  for (let a = 0; a < segs.length; a++) {
    for (let b = a + 1; b < segs.length; b++) {
      const i = segs[a];
      const j = segs[b];
      // Two segments that share a joint always touch; two that are on the same
      // chain (shoulder → arm → forearm) fold onto each other by design. Only
      // limbs meeting things they are not attached to say anything.
      if (childOf[i] === j || childOf[j] === i) continue;
      if (ancestor(i, j) || ancestor(j, i)) continue;
      pairs.push([i, j, radius[i] + radius[j]]);
    }
  }
  // The hinges, by name, because a knee bending backwards is the one pose a
  // player names without being asked. Each is (parent joint, joint, child).
  const idx = (re) => bones.findIndex((b) => re.test(b.name));
  const hinge = [];
  for (const side of ["Left", "Right"]) {
    for (const [j, label] of [
      [new RegExp(`^${side}Leg$`), `${side} knee`],
      [new RegExp(`^${side}ForeArm$`), `${side} elbow`],
    ]) {
      const i = idx(j);
      if (i < 0 || parentOf[i] < 0 || childOf[i] < 0) continue;
      hinge.push({ i, parent: parentOf[i], child: childOf[i], label });
    }
  }
  return { radius, pairs, hinge, child: childOf, names: bones.map((b) => b.name) };
})();
const BONE_NAMES = BODY.names;

function run(spec) {
  const {
    name,
    world,
    street = false,
    truth,
    floor,
    fps = 60,
    at = { x: 0, z: 0 },
    dir = { x: 1, z: 0 },
    speed = 0,
    spin = 0,
    drop = 0,
    seconds = 5,
    history = true,
    // The take that ships, on every row, unless the row says otherwise. A row
    // that sets `noTake` runs the cross-fade instead — see `cut` in LIMITS.
    getUpClip = spec.noTake ? null : GETUP_CLIP,
  } = spec;
  const dt = 1 / fps;
  const holder = cloneSkeleton(character.scene);
  const bones = bonesOf(holder);
  const mesh = skinnedMeshOf(holder);
  const parentOf = bones.map((b) => {
    let p = b.parent;
    while (p && !bones.includes(p)) p = p.parent;
    return bones.indexOf(p);
  });

  // --- the rig, as far as the fall can see it -------------------------------
  //
  // The skater is not a loose skeleton in the game: he hangs off the same chain
  // as the board, and where the board sits relative to him is the whole of
  // ticket item 9's second half. So the harness builds that chain — a root that
  // follows the ride, the deck on one branch, the rider on another — and then
  // drives it the way `main.ts` and `SkaterRig` do while he is down.
  //
  // Two things are under test that a bare skeleton could not reach: the deck's
  // own fall, and `findBoard`, which has to pick this branch out of the graph
  // with nothing but "meshes, and no skin under it" to go on.
  const rigRoot = new THREE.Group();
  const boardPitch = new THREE.Group();
  const stand = new THREE.Group();
  const charNode = new THREE.Group();
  boardPitch.position.y = AXLE_HEIGHT;
  boardPitch.add(deckMesh());
  charNode.add(holder);
  stand.add(charNode);
  rigRoot.add(boardPitch);
  rigRoot.add(stand);

  const impacts = [];
  let elapsed = 0;
  const ragdoll = createRagdoll({
    root: holder,
    surface: world,
    getUp: getUpClip,
    onImpact: (i) => impacts.push({ part: i.part, speed: i.speed, t: elapsed }),
  });
  const deck = boardPitch.children[0];
  /** What `followFeet` writes into the deck's node on every frame of a bail. */
  const deckHome = (bailT) => {
    boardPitch.position.set(0, AXLE_HEIGHT, 0);
    boardPitch.rotation.set(Math.min(1, bailT / 0.35) * 0.5, 0, 0);
  };

  // --- ride him for half a second, so the seeding has real history ----------
  // Straight line at a held height, ending exactly at the bail point: what is
  // under test here is `observe()`, not the ride.
  const mixer = new THREE.AnimationMixer(holder);
  mixer.clipAction(RIDE_CLIP).play();
  const PRE = 0.5;
  const steps = Math.round(PRE / dt);
  // Where he is actually standing when he bails. `floor` overrides it for the
  // worlds whose own `height` IS the lie — dropping him from the liar's answer
  // and then asserting against the truth measures nothing but the harness.
  const floorAtBail =
    floor ?? (street ? (streetGround(at.x, at.z, 40) ?? 0) : world.height(at.x, at.z));
  const y0 = floorAtBail + drop;
  rigRoot.position.set(at.x - dir.x * speed * PRE, y0, at.z - dir.z * speed * PRE);
  rigRoot.rotation.y = Math.atan2(dir.x, dir.z) - spin * PRE;
  for (let i = 0; i < steps; i++) {
    mixer.setTime(0.4 + i * dt);
    rigRoot.position.x += dir.x * speed * dt;
    rigRoot.position.z += dir.z * speed * dt;
    rigRoot.rotation.y += spin * dt;
    rigRoot.updateMatrixWorld(true);
    // `history: false` is the control: no bone history, so `start()` falls back
    // to giving every particle the board's velocity — a mannequin being dropped.
    if (history) ragdoll.observe(dt);
  }

  // --- the bail -------------------------------------------------------------
  const world0 = bones.map((b) => b.getWorldPosition(new THREE.Vector3()));
  // The truth, fixed at the bail: everything he could still land on. A body
  // cannot climb, so anything standing more than a bail's-worth above the floor
  // he left is not a floor he can reach — it is the wall he is beside.
  let lowest0 = Infinity;
  for (const w of world0) lowest0 = Math.min(lowest0, w.y);
  const cap = lowest0 + 0.8;
  const groundBelow = street
    ? (x, z, yCap = Infinity) => streetGround(x, z, Math.min(cap, yCap)) ?? floorAtBail
    : (truth ?? ((x, z) => world.height(x, z)));

  ragdoll.start(new THREE.Vector3(dir.x * speed, 0, dir.z * speed));

  // --- the two poses a player names, measured as STATE and not as a rate ----
  //
  // Everything else in this file measures how fast something moved. A knee bent
  // backwards and HELD there moves at nothing at all, and so does a forearm
  // lying inside the ribcage — the whole table is blind to both, which is
  // exactly the shape of hole this project has been caught in three times. So
  // these two are read off the drawn skeleton every frame, and again on the
  // frame the body is declared settled, because the settled pose is the one the
  // player looks at for the better part of a second before he gets up.
  //
  // Neither borrows a number from the solver: the bend is re-derived from bone
  // world positions and the hinge axis the joint itself was folded on at the
  // bail, and the thickness comes off the SKIN (see `skinRadii`).
  const hinges = BODY.hinge.map((h) => {
    const u = world0[h.i].clone().sub(world0[h.parent]).normalize();
    const w = world0[h.child].clone().sub(world0[h.i]).normalize();
    const axis = u.clone().cross(w);
    return {
      ...h,
      axis: axis.lengthSq() > 1e-8 ? axis.normalize() : null,
      qp0: bones[h.parent].getWorldQuaternion(new THREE.Quaternion()).invert(),
    };
  });
  let bendWorst = 0;
  let bendWorstName = "-";
  let bendRest = 0;
  let thruWorst = 0;
  let thruWorstName = "-";
  let thruRest = 0;
  const _bu = new THREE.Vector3();
  const _bw = new THREE.Vector3();
  const _bx = new THREE.Vector3();
  const _bc = new THREE.Vector3();
  const _bq = new THREE.Quaternion();
  const _bp = bones.map(() => new THREE.Vector3());
  const readPose = () => {
    for (let i = 0; i < bones.length; i++) bones[i].getWorldPosition(_bp[i]);
    let bend = 0;
    let bendName = "-";
    for (const h of hinges) {
      if (!h.axis) continue;
      _bu.subVectors(_bp[h.i], _bp[h.parent]);
      _bw.subVectors(_bp[h.child], _bp[h.i]);
      if (_bu.lengthSq() < 1e-8 || _bw.lengthSq() < 1e-8) continue;
      _bu.normalize();
      _bw.normalize();
      // The flexion axis turns with the bone above the joint, or a leg held out
      // sideways would read as bending on the axis it had when it hung down.
      bones[h.parent].getWorldQuaternion(_bq).multiply(h.qp0);
      _bx.copy(h.axis).applyQuaternion(_bq);
      const signed = Math.atan2(_bc.crossVectors(_bu, _bw).dot(_bx), _bu.dot(_bw));
      const past = (-signed * 180) / Math.PI; // past straight, the wrong way
      if (past > bend) {
        bend = past;
        bendName = h.label;
      }
    }
    let thru = 0;
    let thruName = "-";
    for (let p = 0; p < BODY.pairs.length; p++) {
      const [i, j, thickness] = BODY.pairs[p];
      const gap = segmentGap(_bp[i], _bp[BODY.child[i]], _bp[j], _bp[BODY.child[j]]);
      // …measured against the POSE HE BAILED IN, the same way every joint limit
      // in the solver is. A skater's own stance already has his thighs inside
      // each other's flesh by this measure — the two are 20 cm apart and the
      // jeans are 12 cm thick — so the absolute overlap says nothing and only
      // the part he did not arrive with is a limb going through him.
      const depth = thickness - gap - overlap0[p];
      if (depth > thru) {
        thru = depth;
        thruName = `${bones[i].name}/${bones[j].name}`;
      }
    }
    return { bend, bendName, thru, thruName };
  };
  // The overlap the riding stance itself carries, pair by pair.
  const overlap0 = BODY.pairs.map(([i, j, thickness]) =>
    Math.max(0, thickness - segmentGap(world0[i], world0[BODY.child[i]], world0[j], world0[BODY.child[j]])),
  );

  const restLen = bones.map((_, i) =>
    parentOf[i] < 0 ? 0 : world0[i].distanceTo(world0[parentOf[i]]),
  );
  const picks = skinSample(mesh);
  const bindEdges = edgeLengths(mesh, picks, new Float64Array(picks.length));

  // Which bones do the whipping, and how much of the time. A ragdoll is judged
  // on its worst frame, but the worst frame is only worth chasing once you know
  // whether it is one bone in trouble or the whole body chattering.
  //
  // And it is measured in WORLD space, because that is the only rotation there
  // is anything to see in. A local-quaternion delta counts the parent's turn
  // too: measured, the worst "78° snap" in a standing collapse was a RightArm
  // whose own direction in the world had moved 14.7° — the other 64° was the
  // collarbone above it turning, and the arm went along for the ride without
  // bending at all. Chasing that number tunes the solver against an artefact of
  // the hierarchy. The local delta is kept alongside it, because a JOINT
  // genuinely folding fast is a different fault and worth seeing.
  const snapMax = new Float64Array(bones.length);
  const lastQ = bones.map((b) => b.quaternion.clone());
  const lastWQ = bones.map((b) => b.getWorldQuaternion(new THREE.Quaternion()));
  const wq = new THREE.Quaternion();
  let worstWorld = 0;
  let worstWorldName = "-";

  // …and the thing a bone's ROTATION cannot say: which way the limb points.
  //
  // This is the instrument round 5 did not have, and its absence is why a guard
  // could be deleted and every assertion still pass. A bone's world quaternion
  // carries a swing AND a roll, and `rollFrom` in the solver deliberately makes
  // the roll continuous — so the quaternion delta is small by construction on
  // exactly the bones whose roll was the old bug, and it is NOT the number that
  // says whether a limb reversed. What a player sees a limb do is the line from
  // its joint to the next one, and that line is what this measures: the largest
  // angle any bone-to-child segment turns through between two DRAWN frames.
  //
  // Measured on the real Meshy rig bailing into the loading-dock face at 18 m/s
  // and 45 fps: the segment turned 135.6° in one frame — a forearm pointing the
  // other way — while `world°` on the same run read 77.7° and the 120° limit
  // passed it without a murmur.
  const childOf = bones.map((_, i) => parentOf.indexOf(i));
  const segDirs = () => {
    const out = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < bones.length; i++) {
      const c = childOf[i];
      if (c < 0) {
        out.push(null);
        continue;
      }
      bones[i].getWorldPosition(a);
      bones[c].getWorldPosition(b);
      const v = b.clone().sub(a);
      out.push(v.lengthSq() > 1e-10 ? v.normalize() : null);
    }
    return out;
  };
  let lastDir = segDirs();
  let worstLimb = 0;
  let worstLimbName = "-";
  let worstLimbT = 0;
  /** …the same thing per second, which is the claim that means the same at every rate. */
  let worstLimbRate = 0;
  /** …and how many frames had a limb turn past a right angle. That is a limb going backwards. */
  let heldLimb = 0;
  let heldLimbName = "-";
  /** A tenth of a second of limb history — see `held°`. */
  const dirHist = [];

  const lastW = bones.map((b) => b.getWorldPosition(new THREE.Vector3()));
  let fastest = 0;
  let fastestName = "-";
  /**
   * How fast the body was still going when it was DECLARED settled — measured
   * over the tenth of a second BEFORE the claim, not over the one frame that
   * carried it.
   *
   * One frame cannot answer this at 144 fps. The solver runs on a 1/180 s
   * substep and a 1/144 s frame takes one or two of them, so a bone travelling
   * at a steady 0.7 m/s in solver time reads 0 on a one-substep frame and
   * 1.1 m/s on a two-substep one — the measure aliases against the accumulator
   * and reports a body that has stopped as moving half again as fast as it is.
   * A window that spans several substeps at every rate cannot: it is net
   * displacement over a fixed wall-clock tenth of a second, which is exactly
   * what "had he stopped" means and is the same question at 30 and at 144.
   *
   * It has to look BACKWARD. Nothing moves after `settled` — that is what the
   * flag does — so a window taken after it would be zero on any build, broken or
   * not, which is a decoration rather than an assertion.
   */
  const FROZEN_WINDOW = 0.1;
  const recent = [];
  let frozenAt = 0;
  let worstJoint = 0;
  let worstJointName = "-";
  let worstJointT = 0;
  let spikes = 0;
  const perFrame = [];
  let lenDrift = 0;
  let minClearance = Infinity;
  let minClearanceBone = "-";
  let minClearanceT = 0;
  const minClearanceAt = new THREE.Vector3();
  /**
   * How many FRAMES had a bone more than 5 cm under the surface.
   *
   * The depth alone cannot tell a body lying inside a wall from one frame of a
   * limb passing through a face at 11 m/s, and those are not the same bug. One
   * is something the player sees; the other is over before the next frame draws.
   */
  let deepFrames = 0;
  let settleAt = -1;
  let worstStretch = 0;
  /** The highest any bone got after the bail — a body on a roof is obvious here. */
  let topY = -Infinity;
  const p = new THREE.Vector3();
  const edges = new Float64Array(picks.length);
  // How much of his spin the body takes with it: the shoulder line's heading,
  // unwrapped, over the first third of a second.
  const shoulders = ["LeftShoulder", "RightShoulder"].map((n) => bones.find((b) => b.name === n));
  const shoulderYaw = () => {
    const a = shoulders[0].getWorldPosition(new THREE.Vector3());
    const b = shoulders[1].getWorldPosition(new THREE.Vector3());
    return Math.atan2(b.x - a.x, b.z - a.z);
  };
  let yaw0 = shoulderYaw();
  let carried = 0;

  // SPEED RETAINED — the instrument nothing in this repo had, applied here.
  //
  // A skater who hits the deck at 14 m/s SLIDES. He does not stop where he fell,
  // and a ragdoll that comes to rest under its own bail point is a sack of sand,
  // not a body. So: how much of the speed he arrived with is still in him a third
  // of a second later, and how far he travelled in the end. `settle`, `floor` and
  // `bone±` are all perfectly happy with a body that drops dead on the spot —
  // this is the only line in the table that is not.
  const CARRY_AT = 0.34;
  const hipsAt = [];
  let carrySpeed = 0;

  // --- the deck, and whether it is where a fallen board should be -----------
  //
  // Three numbers, because "the board must fall with him, not through him" is
  // three claims: it comes off the rig at all (`deckMove` — the fixed-geometry
  // build has it welded under the hips and it never moves relative to them), it
  // ends up ON the floor rather than hovering at wheel height or buried, and it
  // is not INSIDE him. The last one is measured the same way limb-through-limb
  // is: closest approach of the deck's own box edges to every bone, against the
  // skin's thickness.
  const deckBox = new THREE.Box3().setFromObject(deck);
  const deckLocal = deckBox.clone().applyMatrix4(new THREE.Matrix4().copy(deck.matrixWorld).invert());
  const deckCorners = [];
  for (let i = 0; i < 8; i++) {
    deckCorners.push(
      new THREE.Vector3(
        i & 1 ? deckLocal.max.x : deckLocal.min.x,
        i & 2 ? deckLocal.max.y : deckLocal.min.y,
        i & 4 ? deckLocal.max.z : deckLocal.min.z,
      ),
    );
  }
  // The twelve edges of that box, as index pairs.
  const deckEdges = [];
  for (let a = 0; a < 8; a++) {
    for (let b = a + 1; b < 8; b++) {
      const diff = (a ^ b).toString(2).split("1").length - 1;
      if (diff === 1) deckEdges.push([a, b]);
    }
  }
  const deckAt = deckCorners.map(() => new THREE.Vector3());
  const homeWorld = new THREE.Vector3();
  let deckInWorst = 0;
  let deckInRest = 0;
  let deckRest = 0;
  let deckOnHim = false;
  let deckMove = 0;
  const deckRestAt = new THREE.Vector3();
  const readDeck = () => {
    deck.updateWorldMatrix(true, false);
    let low = Infinity;
    let lowIdx = 0;
    for (let i = 0; i < 8; i++) {
      deckAt[i].copy(deckCorners[i]).applyMatrix4(deck.matrixWorld);
      if (deckAt[i].y < low) {
        low = deckAt[i].y;
        lowIdx = i;
      }
    }
    let deep = 0;
    for (const [a, b] of deckEdges) {
      for (let i = 0; i < bones.length; i++) {
        const c = BODY.child[i];
        if (c < 0 || BODY.radius[i] <= 0) continue;
        const gap = segmentGap(deckAt[a], deckAt[b], _bp[i], _bp[c]);
        deep = Math.max(deep, BODY.radius[i] - gap);
      }
    }
    // How far the deck has come from WHERE THE RIG WOULD BE HOLDING IT — not
    // from the hips.
    //
    // Measured against the hips first, and that was a decoration: the welded
    // build reads 0.75 m of "drift" while the deck never leaves the rig at all,
    // because the hips drop three quarters of a metre when he lies down and the
    // deck is bolted to the ground under them. `homeWorld` is the pose
    // `followFeet` wrote into the node this very frame, carried into the world
    // by the node's own parent, so the number is the deck's and nobody else's.
    deck.getWorldPosition(_dw);
    const drift = _dw.distanceTo(homeWorld);
    return { low, deep, drift, lowAt: deckAt[lowIdx] };
  };

  const frames = Math.round(seconds / dt);
  for (let f = 0; f < frames; f++) {
    // What the game does to the rig on every frame of a bail, in the same
    // order: the ride's own position is dragged to the hips, and `followFeet`
    // stands down and writes the deck's fixed geometry. Both happen BEFORE
    // `ragdoll.update`, which is what makes the fall the last writer on the
    // deck as well as on the bones.
    deckHome(elapsed);
    if (elapsed > 0) {
      rigRoot.position.x = ragdoll.hips.x;
      rigRoot.position.z = ragdoll.hips.z;
      rigRoot.position.y = groundBelow(rigRoot.position.x, rigRoot.position.z);
      rigRoot.updateMatrixWorld(true);
    }
    // Where the rig is holding the deck this frame, before the fall overwrites
    // it — the reference `deck ran` is measured against.
    homeWorld.set(0, AXLE_HEIGHT, 0).applyMatrix4(rigRoot.matrixWorld);
    ragdoll.update(dt);
    elapsed += dt;
    // The download landing while he is still going over. See `lateTake` above.
    if (spec.lateTake !== undefined && elapsed >= spec.lateTake && !ragdoll.hasGetUpClip) {
      ragdoll.setGetUpClip(GETUP_CLIP);
    }
    // …and if this is that frame, whatever is still moving on it is what
    // "settled" is claiming has stopped. See `frozen` in LIMITS.
    const justSettled = settleAt < 0 && ragdoll.settled;
    if (justSettled) settleAt = elapsed;

    holder.updateMatrixWorld(true);
    let frameFastest = 0;
    let frameWorst = 0;
    let deepThis = false;
    for (let i = 0; i < bones.length; i++) {
      const d = (lastQ[i].angleTo(bones[i].quaternion) * 180) / Math.PI;
      if (d > worstJoint) {
        worstJoint = d;
        worstJointName = bones[i].name;
        worstJointT = elapsed;
      }
      lastQ[i].copy(bones[i].quaternion);

      bones[i].getWorldQuaternion(wq);
      const dw = (lastWQ[i].angleTo(wq) * 180) / Math.PI;
      if (dw > frameWorst) frameWorst = dw;
      if (dw > snapMax[i]) snapMax[i] = dw;
      if (dw > worstWorld) {
        worstWorld = dw;
        worstWorldName = bones[i].name;
      }
      lastWQ[i].copy(wq);

      bones[i].getWorldPosition(p);
      const boneSpeed = p.distanceTo(lastW[i]) / dt;
      if (boneSpeed > frameFastest) frameFastest = boneSpeed;
      if (boneSpeed > fastest) {
        fastest = boneSpeed;
        fastestName = bones[i].name;
      }
      lastW[i].copy(p);
      if (globalThis.__probe && elapsed > 1.0 && boneSpeed > 0.5) {
        (globalThis.__probeRows ??= []).push(`t=${elapsed.toFixed(2)} ${bones[i].name} ${boneSpeed.toFixed(2)} m/s y=${p.y.toFixed(3)}`);
      }
      if (parentOf[i] >= 0) {
        const now = p.distanceTo(bones[parentOf[i]].getWorldPosition(new THREE.Vector3()));
        lenDrift = Math.max(lenDrift, Math.abs(now - restLen[i]));
      }
      const clear = clearanceOf(groundBelow, p.x, p.y, p.z);
      if (clear < minClearance) {
        minClearance = clear;
        minClearanceBone = bones[i].name;
        minClearanceT = elapsed;
        minClearanceAt.copy(p);
      }
      if (clear < -0.05) deepThis = true;
      if (p.y > topY) topY = p.y;
    }

    // …and the two POSE facts, every frame and again the moment he is declared
    // settled. `rest` is the one a player stares at.
    {
      const pose = readPose();
      if (pose.bend > bendWorst) {
        bendWorst = pose.bend;
        bendWorstName = pose.bendName;
      }
      if (pose.thru > thruWorst) {
        thruWorst = pose.thru;
        thruWorstName = pose.thruName;
      }
      // …and if he never settles at all, the last frame IS how he was left.
      if (justSettled || settleAt < 0) {
        bendRest = pose.bend;
        thruRest = pose.thru;
      }
      const d = readDeck();
      deckInWorst = Math.max(deckInWorst, d.deep);
      deckMove = Math.max(deckMove, d.drift);
      // …and the deck's own rest is the LAST frame, not the frame the body
      // stopped on: they are two things falling and they do not stop together.
      {
        deckInRest = d.deep;
        // Is there floor immediately under it — asked at the deck's own height,
        // and taking the HIGHEST answer in the few centimetres around its
        // lowest corner. Both halves earn their place: asked with the bail-time
        // cap alone a deck that ends up on the 1.1 m loading dock reads as
        // floating a metre in the air, and asked at one infinitely thin point a
        // deck perched on a ledge's lip reads as floating 60 cm because the
        // point happens to fall a millimetre past the edge.
        const e = 0.06;
        let high = -Infinity;
        let low = Infinity;
        for (const [ox, oz] of [
          [0, 0],
          [e, 0],
          [-e, 0],
          [0, e],
          [0, -e],
        ]) {
          const g = groundBelow(d.lowAt.x + ox, d.lowAt.z + oz, d.low + 0.05);
          high = Math.max(high, g);
          low = Math.min(low, g);
        }
        // A step has no thickness, so at an edge there are two right answers a
        // few centimetres apart and a deck lying across one is on the ground by
        // either. Only clear of BOTH counts as floating, and under both counts
        // as sunk. Measured on the ledge drop: a deck lying on the pavement with
        // its lowest corner 2 mm on the ledge's side of the lip read as 60 cm
        // underground, which is the ledge's own height and nothing else.
        deckRest = d.low > high ? d.low - high : d.low < low ? d.low - low : 0;
        deckRestAt.copy(d.lowAt);
        // …UNLESS IT CAME TO REST ON HIM, which is a thing a board does and this
        // line did not use to have to consider. `deck±` asks whether the deck is
        // hovering, and the floor it was allowed to hover over was the ground and
        // nothing else — fine while the deck spent every fall running away from
        // the body, and wrong now that it lands beside him: `off the long ledge
        // at 7 m/s` came to rest lying across him and read 27 cm of "float".
        //
        // The evidence is the same closest-approach the `in him` line is built on
        // and it is measured, not declared: within 3 cm of his skin is a board
        // touching him. It cannot excuse a deck buried in him, because `in him`
        // and `deck in!` bound that from the other side on the same number.
        deckOnHim = d.deep > -0.03;
      }
    }

    // …and the limbs, whose direction is the only thing that says "inside out".
    const nowDir = segDirs();
    let frameLimb = 0;
    let frameLimbName = "-";
    for (let i = 0; i < bones.length; i++) {
      if (!lastDir[i] || !nowDir[i]) continue;
      const dot = Math.max(-1, Math.min(1, lastDir[i].dot(nowDir[i])));
      const a = (Math.acos(dot) * 180) / Math.PI;
      if (a > frameLimb) {
        frameLimb = a;
        frameLimbName = bones[i].name;
      }
    }
    lastDir = nowDir;
    if (frameLimb > worstLimb) {
      worstLimb = frameLimb;
      worstLimbName = frameLimbName;
      worstLimbT = elapsed;
    }
    worstLimbRate = Math.max(worstLimbRate, frameLimb / dt);

    // …and the same question over a TENTH OF A SECOND, which is the one the eye
    // is actually asking and the only one the solver's own limiter cannot answer
    // for us.
    //
    // This replaces `flip`, which was a decoration and round three said so:
    // `flip` counted frames where a limb turned past 100°, and `capTurn` allows
    // `BONE_TURN_RATE · SUBSTEP` per substep — 42.0° in a 30 fps frame, 28.0 at
    // 45, 21.0 at 60, 14.0 at 90 and 144. So `flip = 0` was arithmetic, not
    // evidence, at every rate this file sweeps; worse, it was strictly weaker
    // than `limb°` beside it, which bounds the same quantity at 55 and therefore
    // goes red first in every case `flip` could ever have caught.
    //
    // A window is a different quantity. The cap is a RATE, so it permits 126° of
    // turn in a tenth of a second at 30 fps and 84° at 144 — it does not bound
    // this at all, and a limb that genuinely comes round the wrong way does it in
    // about that long. Measured across the table on the shipped solver it reads
    // 60–75°, which is a leg swinging through a fall; the same measurement with
    // `capTurn` deleted reads past 150.
    dirHist.push({ t: elapsed, dirs: nowDir });
    while (dirHist.length > 2 && dirHist[0].t < elapsed - LIMB_WINDOW) dirHist.shift();
    const back = dirHist.find((h) => h.t <= elapsed - LIMB_WINDOW) ?? dirHist[0];
    if (back !== dirHist[dirHist.length - 1]) {
      for (let i = 0; i < bones.length; i++) {
        if (!back.dirs[i] || !nowDir[i]) continue;
        const dot = Math.max(-1, Math.min(1, back.dirs[i].dot(nowDir[i])));
        const a = (Math.acos(dot) * 180) / Math.PI;
        if (a > heldLimb) {
          heldLimb = a;
          heldLimbName = bones[i].name;
        }
      }
    }

    // Speed retained, and the rolling window the settle claim is judged against.
    hipsAt.push({ t: elapsed, x: ragdoll.hips.x, z: ragdoll.hips.z });
    recent.push({ t: elapsed, at: bones.map((b) => b.getWorldPosition(new THREE.Vector3())) });
    while (recent.length > 2 && recent[0].t < elapsed - FROZEN_WINDOW * 1.5) recent.shift();

    if (elapsed <= 0.34) {
      const y = shoulderYaw();
      let d = y - yaw0;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      carried += d;
      yaw0 = y;
    }
    if (justSettled) {
      // The oldest sample still inside the window, so the span is a real tenth
      // of a second however many frames that took.
      const back = recent.find((h) => h.t >= elapsed - FROZEN_WINDOW) ?? recent[0];
      const span = Math.max(1e-3, elapsed - back.t);
      for (let i = 0; i < bones.length; i++) {
        bones[i].getWorldPosition(p);
        frozenAt = Math.max(frozenAt, p.distanceTo(back.at[i]) / span);
      }
    }
    perFrame.push(frameWorst);
    if (frameWorst > 45) spikes++;
    if (deepThis) deepFrames++;

    if (settleAt >= 0 && worstStretch === 0) {
      edgeLengths(mesh, picks, edges);
      for (let i = 0; i < edges.length; i++) {
        const s = Math.abs(edges[i] - bindEdges[i]) / Math.max(1e-4, bindEdges[i]);
        worstStretch = Math.max(worstStretch, s);
      }
    }
    if (settleAt >= 0 && elapsed > settleAt + 0.3) break;
  }

  // --- where he actually came to rest ---------------------------------------
  // The check nobody had. Everything else in this table is satisfied by a body
  // asleep on a 12 m roof: its bones are the right length, nothing is under the
  // surface it is lying on, it settled quickly and no joint snapped. The only
  // thing wrong with it is that it is twelve metres in the air, and the only way
  // to see that is to ask how far above the floor the lowest bone finished.
  let restY = Infinity;
  let restBone = "-";
  const restAt = new THREE.Vector3();
  // …and the part of him that is FURTHEST down the line he was travelling,
  // which is the part that would have touched whatever stopped him. A body is
  // nearly two metres long and its hips are in the middle of it: measured from
  // the hips alone, the 30 fps fence bail reads three quarters of a metre clear
  // of a fence its own feet are lying against.
  let lead = -Infinity;
  const leadAt = new THREE.Vector3();
  for (let i = 0; i < bones.length; i++) {
    bones[i].getWorldPosition(p);
    if (p.y < restY) {
      restY = p.y;
      restBone = bones[i].name;
      restAt.copy(p);
    }
    const along = p.x * dir.x + p.z * dir.z;
    if (along > lead) {
      lead = along;
      leadAt.copy(p);
    }
  }
  const restHeight = restY - groundBelow(restAt.x, restAt.z);

  // --- and the stand-up -----------------------------------------------------
  //
  // The animation layer is held STILL underneath (the riding stance, parked on
  // one frame), so everything measured here is the HANDOVER — how he gets from
  // the pose physics left him in to standing on his board.
  //
  // `blend°` is the old instrument: the worst any bone turns between two drawn
  // frames. It was never enough, and the filmed proof is in `shots/g/`: at
  // 100 ms a frame he is flat on the concrete in one picture and upright in the
  // next, with `blend°` reading 8.5. A cross-fade turns every bone a little and
  // moves the whole man a metre. So the number that says whether a stand-up is
  // a motion or a cut is how fast his HIPS climb — a real get-up lifts about
  // 0.75 m and takes the better part of a second, which is around 1 m/s, and
  // the 0.28 s cross-fade does it at three times that.
  //
  // **It is measured over a WINDOW, not over a frame, and that is the whole
  // difference between an instrument and a decoration.** A per-frame |Δy| is a
  // different quantity at every rate — the solver's accumulator hands one frame
  // two substeps and the next one none, so at 144 fps a body climbing steadily
  // reads zero on half its frames and double on the other half — and it is also
  // blind to the failure that matters: a stand-up made of eight small steps in
  // 0.28 s has no big frame in it anywhere and is still a cut. A tenth of a
  // second of NET climb is the same question at 30 and at 144, and it is the one
  // a player's eye is actually asking.
  const RISE_WINDOW = 0.1;
  const hipBone = bones.find((b) => /hips|pelvis/i.test(b.name)) ?? bones[0];
  const hipAt = new THREE.Vector3();
  hipBone.getWorldPosition(hipAt);
  /** Hips height, frame by frame, from the moment he is let go of. */
  const hipTrace = [{ t: 0, y: hipAt.y }];
  /** …and how UPRIGHT he is, frame by frame: hips above his lowest bone. */
  const standTrace = [];
  const uprightNow = () => {
    let low = Infinity;
    for (let i = 0; i < bones.length; i++) {
      bones[i].getWorldPosition(p);
      low = Math.min(low, p.y);
    }
    hipBone.getWorldPosition(p);
    return p.y - low;
  };
  const hipStart = hipAt.y;
  let riseRate = 0;
  let riseFor = 0;
  let riseFrames = 0;
  /**
   * How long the SKELETON was still changing for — which is not the same thing
   * as how long the fall held on to something.
   *
   * Measured as "the ragdoll is still running" first, and that was a
   * decoration: the deck's own return keeps `running` true for the better part
   * of half a second, so a handover cut to a single frame still scored half a
   * second of stand-up. Watched failing the moment it read the bones instead.
   */
  let poseFor = 0;
  const lastPose = bones.map((b) => b.quaternion.clone());
  ragdoll.release();
  let worstBlend = 0;
  // Long enough for the whole stand-up at every rate. It was a flat 200 frames,
  // which is 6.7 s at 30 fps and 1.39 s at 144 — so the moment the take made a
  // stand-up longer than 1.39 s, the 144 fps rows stopped measuring the end of
  // one: they reported the deck 1.4 m from home and the hips 3 cm short of
  // standing, and both were the harness running out of frames rather than the
  // game doing anything. Four seconds of wall clock is the same window at every
  // rate, which is the whole reason this file sweeps five of them.
  const riseFrameCap = Math.ceil(4 / dt);
  for (let f = 0; f < riseFrameCap && ragdoll.running; f++) {
    // THE ANIMATION LAYER, PARKED — and parked is not the same as switched off,
    // which is what this line used to do by accident.
    //
    // `mixer.setTime(0.4)` every frame writes the riding stance onto the bones
    // ONCE, on the frame the time changes, and then goes quiet: three's
    // `PropertyMixer.apply` only pushes into the scene graph when its own output
    // changes. That is the same trap `src/skate/fall/get-up.ts` documents and
    // refuses to build on, and this harness was standing in it — so the stance
    // the stand-up is supposed to be handing back TO was not on the skeleton for
    // any frame but the first, and the fallback's whole 0.66 m of cross-fade
    // measured as one 7 cm frame followed by nothing. It is what produced the
    // "2.20 m/s worst" that has been printed on every row of this table for
    // three rounds while the hips finished 0 cm above where they started.
    //
    // A tenth of a millisecond of alternation is enough to make the mixer write
    // and is a three-hundredth of one of the take's own 30 fps keyframes, so the
    // stance is still parked in every sense a measurement cares about.
    mixer.setTime(0.4 + (f % 2) * 1e-4);
    deckHome(elapsed + riseFor);
    ragdoll.update(dt);
    riseFor += dt;
    riseFrames++;
    for (let i = 0; i < bones.length; i++) {
      worstBlend = Math.max(worstBlend, (lastQ[i].angleTo(bones[i].quaternion) * 180) / Math.PI);
      lastQ[i].copy(bones[i].quaternion);
    }
    hipBone.getWorldPosition(p);
    riseRate = Math.max(riseRate, Math.abs(p.y - hipAt.y) / dt);
    hipAt.copy(p);
    hipTrace.push({ t: riseFor, y: p.y });
    standTrace.push({ t: riseFor, h: uprightNow() });
    let moved = 0;
    for (let i = 0; i < bones.length; i++) {
      moved = Math.max(moved, (lastPose[i].angleTo(bones[i].quaternion) * 180) / Math.PI);
      lastPose[i].copy(bones[i].quaternion);
    }
    if (moved > 0.1) poseFor = riseFor;
  }
  // The fastest tenth of a second his hips moved through, and how far they
  // finished above where physics left them. Taken over every window in the trace
  // rather than the worst frame — see `RISE_WINDOW`.
  let riseFast = 0;
  for (let i = 0, j = 0; i < hipTrace.length; i++) {
    while (hipTrace[i].t - hipTrace[j].t > RISE_WINDOW) j++;
    const span = hipTrace[i].t - hipTrace[j].t;
    if (span > RISE_WINDOW * 0.5) {
      riseFast = Math.max(riseFast, Math.abs(hipTrace[i].y - hipTrace[j].y) / span);
    }
  }
  const riseLift = hipTrace[hipTrace.length - 1].y - hipStart;
  // …and WAS HE STANDING WHEN THE TAKE STOPPED DRIVING HIM.
  //
  // Two things about this line are the scar tissue of getting it wrong twice, and
  // both are worth more than the number it prints.
  //
  // **It is measured off his own body.** How far his hips sit above his lowest
  // bone: 78 cm standing on this character, 13 cm lying. No floor query, no rig
  // root, nothing a liar world can touch — which is the only way a stand-up test
  // can mean the same thing on all 195 rows.
  //
  // **And it is measured `RISE_OUT` before the end, not at the end.** Read at the
  // last frame it is worthless, and it took a deliberate break to find that out:
  // with the take's trim broken so it cut off at the performer's KNEES, the column
  // read 78 cm and the table stayed green. The animation layer's riding stance is
  // a standing pose and it is underneath the whole time, so whatever the take
  // leaves unfinished the hand-back finishes — every "is he standing at the end"
  // test in this shape is really a test of the riding stance. `RISE_OUT` is the
  // width of that hand-back, imported from the file that owns it rather than
  // copied, and the frame before it starts is the last one the TAKE is answering
  // for. Same break, read there: 41 cm, and red at every rate.
  const riseEnd = hipTrace[hipTrace.length - 1];
  const beforeHandover = standTrace.filter((s) => s.t <= riseEnd.t - RISE_OUT);
  const stood = (beforeHandover[beforeHandover.length - 1] ?? standTrace[0] ?? { h: 0 }).h;
  // Where the deck finished once he was back on his feet: the rig owns it again
  // from here, so anything but its own home pose is a board left behind.
  const deckHomeGap = boardPitch.position.distanceTo(new THREE.Vector3(0, AXLE_HEIGHT, 0));

  // How much of the speed he bailed with the body still had a third of a second
  // in — measured over a 0.1 s span so it is a speed and not one frame's noise.
  {
    const end = hipsAt.find((h) => h.t >= CARRY_AT) ?? hipsAt[hipsAt.length - 1];
    const start = hipsAt.find((h) => h.t >= end.t - 0.1) ?? hipsAt[0];
    const span = Math.max(1e-3, end.t - start.t);
    carrySpeed = Math.hypot(end.x - start.x, end.z - start.z) / span;
  }

  // --- did he stop, or was he stopped? --------------------------------------
  //
  // `scrub` below says a body that eats it at speed keeps sliding, and it has
  // always carried an exemption for a body that ends up against something —
  // "a body that hits brick is supposed to stop". That exemption used to be a
  // hand-written `stops: true` on the case, and two cases that plainly qualify
  // never got one: **into the fence** comes to rest with the fence 0.3 m ahead
  // of it at hip height, and **at the dock bank toe** comes to rest two thirds
  // of a metre UP the bank it slid onto, on ground still climbing at 15°. Those
  // are eight of this harness's nine long-standing red rows, and they are red
  // for being right.
  //
  // So the exemption is measured instead of declared, three ways: he finished
  // higher than he fell, something solid sits within half a metre of his
  // LEADING bone, or the ground in front of that bone is climbing at better
  // than 1 in 5. It is deliberately short-range: the 18 m/s plaza bail has a
  // ledge a metre and a half past where it stops and is NOT exempt by any of
  // the three, which is right — it stopped on open concrete and the ledge is
  // somewhere it never reached.
  let stoppedBy = null;
  {
    const here = groundBelow(leadAt.x, leadAt.z);
    // The plainest evidence of all, and the one that does not depend on where
    // exactly he stopped: he ended up HIGHER than he fell. A body that has
    // climbed a bank spent its speed climbing it, and looking only at what is
    // in front of where he stopped misses the case where he made it to the top
    // and the ground went flat again — which is the 30 fps dock-bank row.
    if (here - floorAtBail > 0.25) {
      stoppedBy = `${((here - floorAtBail) * 100).toFixed(0)} cm of climb from where he fell`;
    }
    for (const d of stoppedBy ? [] : [0.15, 0.3, 0.45]) {
      const x = leadAt.x + dir.x * d;
      const z = leadAt.z + dir.z * d;
      if (world.blocked(x, z, Math.max(leadAt.y, here + 0.15))) {
        stoppedBy = `solid ${d.toFixed(2)} m past his leading bone`;
        break;
      }
      // …or ground climbing at better than 1 in 5 — an 11° grade, the
      // shallowest thing on this spot that is a bank rather than a paving fall.
      // Written as a gradient rather than a height so the three rungs all mean
      // the same thing.
      const rise = groundBelow(x, z) - here;
      if (rise > 0.2 * d) {
        stoppedBy = `ground climbing 1 in ${(d / rise).toFixed(1)} ahead of him`;
        break;
      }
    }
  }

  const hardest = ragdoll.hardestImpact;
  const hips = ragdoll.hips;
  return {
    stoppedBy,
    name,
    fps,
    case: spec,
    settle: settleAt,
    hips: hips.clone(),
    travel: Math.hypot(hips.x - world0[0].x, hips.z - world0[0].z),
    carrySpeed,
    carryFrac: speed > 0.5 ? carrySpeed / speed : 1,
    deckRest,
    deckOnHim,
    deckRestAt: deckRestAt.clone(),
    // WHERE THE BOARD FINISHED IN RELATION TO HIM — the half of "the board must
    // fall with him" that had no line anywhere in this file.
    //
    // `deckMove` above is a MINIMUM and it is measured against the rig's home
    // pose, so it only ever says the deck came loose. Nothing said how far it
    // then went, and the answer on the build before this round was: 1.5 to
    // 12.3 m, most cases between three and eleven. The `stand still, dropped
    // 1.2 m` row is the one that cannot be argued with — rider stationary,
    // `travel` 0.1 m, and the deck 2.83 m away.
    //
    // Read off the deck's own resting low corner against the hips at rest, both
    // in world metres, both already printed on the detail line — so the number in
    // the CHECKS column is the same number a reader can recompute off the report.
    deckBy: Math.hypot(deckRestAt.x - hips.x, deckRestAt.z - hips.z),
    deckInWorst,
    deckInRest,
    deckMove,
    deckHomeGap,
    riseRate,
    riseFast,
    riseLift,
    stood,
    riseFor,
    poseFor,
    // …and how much of that the PLAYER was riding through. The stand-up starts
    // when the ride hands the controls back and the ride hands them back at
    // `handBack`, so the overrun is the whole of it — see `knees` in LIMITS, and
    // `handBack` for where the ride's two constants come from.
    knees: Math.max(0, poseFor - Math.max(0, handBack(settleAt) - (settleAt < 0 ? 0 : settleAt))),
    handBack: handBack(settleAt),
    riseFrames,
    bendWorst,
    bendWorstName,
    bendRest,
    thruWorst,
    thruWorstName,
    thruRest,
    worstLimb,
    worstLimbName,
    worstLimbT,
    worstLimbRate,
    heldLimb,
    heldLimbName,
    lenDrift,
    minClearance,
    minClearanceBone,
    minClearanceT,
    minClearanceAt: minClearanceAt.clone(),
    deepFrames,
    restHeight,
    restBone,
    topY,
    worstJoint,
    worstJointName,
    worstJointT,
    worstWorld,
    worstWorldName,
    fastest,
    fastestName,
    frozenAt,
    carried: (carried * 180) / Math.PI,
    spikes,
    p95: perFrame.slice().sort((a, b) => a - b)[Math.floor(perFrame.length * 0.95)] ?? 0,
    worstStretch,
    worstBlend,
    impacts,
    hardest,
    worstBones: bones
      .map((b, i) => ({ name: b.name, max: snapMax[i] }))
      .sort((a, b) => b.max - a.max)
      .slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// what to drop him off
// ---------------------------------------------------------------------------

// The north transition, off its own solids rather than typed — the geometry lane
// is re-cutting this ramp and the lip may move south, so a literal here is a
// literal that goes stale silently. `BACK_FLAT_Z` is walked, not derived from an
// id, for the same reason: the level top may be renamed or removed.
const BACK_TRANS = SOLIDS.find((s) => s.id === "back-trans");
const BACK_LIP_Z = BACK_TRANS.cz + BACK_TRANS.hz;
const BACK_FLAT_Z = (() => {
  for (let z = BACK_LIP_Z + 0.02; z <= BACK_LIP_Z + 6; z += 0.02) {
    let best = null;
    let bestY = -Infinity;
    for (const s of SOLIDS) {
      const top = topOf(s, 0, z);
      if (top === null || top < bestY) continue;
      best = s;
      bestY = top;
    }
    if (best?.profile.shape === "flat") return z;
  }
  return BACK_LIP_Z + 2.1;
})();

const N = { x: 0, z: 1 };
const S = { x: 0, z: -1 };
const E = { x: 1, z: 0 };
const W = { x: -1, z: 0 };

/**
 * The synthetic table — step functions and outright liars. Cheap, and the only
 * place a lie can be built deliberately.
 */
const LAB_CASES = [
  { name: "stand still, dropped 1.2 m", world: FLAT, drop: 1.2, speed: 0 },
  { name: "bail at 8 m/s, flat", world: FLAT, speed: 8 },
  { name: "slam at 16 m/s from 1.5 m", world: FLAT, speed: 16, drop: 1.5 },
  { name: "bail out of a 540 (7.6 rad/s)", world: FLAT, speed: 6, spin: 7.6, drop: 0.6 },
  { name: "off a 0.6 m ledge at 6 m/s", world: LEDGE, speed: 6, drop: 0.6, at: { x: 0, z: 0 } },
  { name: "down five stairs at 7 m/s", world: STAIRS, speed: 7, drop: 0.9 },
  // The crude lie: a constant roof, which any rise test catches. `floor: 0` is
  // load-bearing on the two total liars — their own `height` is the lie, so
  // standing him on it would drop him from 15 m and measure nothing.
  { name: "LIAR: 15 m floor at 8 m/s", world: LIAR, truth: LIAR_TRUTH, speed: 8 },
  { name: "LIAR: every query 15 m", world: LIAR_ALL, truth: LIAR_TRUTH, floor: 0, speed: 8 },
  { name: "LIAR: every query 15 m, still", world: LIAR_ALL, truth: LIAR_TRUTH, floor: 0, drop: 1.2,
    // Nothing truthful to fall toward: the bound is the height he bailed at
    // (1.2 m) plus the one step the guard allows, and not a centimetre more.
    restMax: 145 },
  { name: "honest wall at 12 m/s", world: WALL, speed: 12 },
  { name: "LIAR + wall face at 12 m/s", world: LIAR_WALL, truth: LIAR_TRUTH, speed: 12 },
  // …and the lie the real world tells: the floor is wherever you asked from.
  { name: "ECHO: hint-as-floor, walled", world: ECHO, truth: LIAR_TRUTH, speed: 10 },
  { name: "ECHO: hint-as-floor, no wall", world: ECHO_OPEN, truth: LIAR_TRUTH, speed: 10 },
  { name: "ECHO: dropped into it", world: ECHO_OPEN, truth: LIAR_TRUTH, at: { x: 8, z: 0 }, drop: 1.2,
    // Same bound, same reason: dropped 1.2 m inside a footprint where every
    // query echoes the hint and no wall exists to push him out of it.
    restMax: 145 },
  // THE STAND-UP WITH NO TAKE — the cross-fade, on purpose, and the two rows
  // that keep the `rise` column honest.
  //
  // Every other row in this file now runs the get-up take, because that is what
  // ships. These two run what ships when the take will not download, and they
  // assert the OPPOSITE of the others: the fallback must still read as the cut it
  // openly is (`cut` in LIMITS). That is a watched-failing test that runs on
  // every invocation rather than once in a report — if `rise`'s bound ever stops
  // having teeth, or somebody quietly empties the clip slot again, these two go
  // red in the same run that the take rows go green.
  { name: "— stand-up, NO take (cross-fade)", world: FLAT, speed: 8, noTake: true },
  { name: "— stand-up, NO take, from 1.5 m", world: FLAT, speed: 12, drop: 1.5, noTake: true },
  // …and the same two bails WITH the take, side by side with them, so the two
  // numbers can be read off one screen.
  { name: "— stand-up, the take", world: FLAT, speed: 8 },
  { name: "— stand-up, the take, from 1.5 m", world: FLAT, speed: 12, drop: 1.5 },
  // A take handed in AFTER the ragdoll was built and after the fall has started,
  // which is what a download landing mid-bail looks like. It must be adopted by
  // the NEXT stand-up rather than dropped for the session — the guard that used
  // to say `if (stage !== "off") return` threw it away outright.
  // A take handed in AFTER the ragdoll was built and while he is still tumbling,
  // which is exactly what the shipped download looks like when a bail beats it:
  // `createRagdoll` starts the fetch at boot and a fall a second later has an
  // empty slot until it lands. It must be adopted by THIS stand-up — so this row
  // is held to the take bounds and not to `cut`.
  { name: "— stand-up, take lands mid-fall", world: FLAT, speed: 8, noTake: true, lateTake: 0.5 },
  // The control for the seeding: same bail, no bone history behind it.
  { name: "— same 540, NO bone history", world: FLAT, speed: 6, spin: 7.6, drop: 0.6, history: false },
  { name: "— same 8 m/s, NO bone history", world: FLAT, speed: 8, history: false },
];

/**
 * The real spot, at the places a bail actually happens.
 *
 * Every one of these is a solid that has produced a bug: the north building is
 * where the height query answers with the hint, the quarter-pipe deck and the
 * loading dock are where the wall corrections fought the links, the fence is
 * 40 cm of slab a body can leave through the far side, the gutter is the one
 * place in the level where the floor beside you is 38 cm above your head.
 */
const STREET_CASES = [
  // Straight into the north building off the open plaza.
  { name: "into the north building 12 m/s", at: { x: 20, z: 30 }, dir: N, speed: 12 },
  // …and into it off the quarter-pipe deck, 2.6 m up, where the floor under him
  // is real and the thing he hits is 15 m of brick.
  { name: "QP deck into the building 10 m/s", at: { x: 0, z: 29 }, dir: N, speed: 10 },
  // Off the lip, down the transition.
  { name: "off the QP lip at 9 m/s", at: { x: 0, z: QP_LIP_Z + 0.2 }, dir: S, speed: 9 },
  // Off the six-stair, from the platform.
  { name: "off the 6-stair at 9 m/s", at: { x: -11, z: -15 }, dir: N, speed: 9 },
  // Along the long ledge and off its north end.
  { name: "off the long ledge at 7 m/s", at: { x: -21, z: 12 }, dir: N, speed: 7 },
  // Into the chain-link fence, which is thin enough to leave through.
  { name: "into the fence at 12 m/s", at: { x: 28, z: 15 }, dir: E, speed: 12 },
  // In the gutter: sunken asphalt with a 0.38 m kerb either side.
  { name: "in the gutter at 10 m/s", at: { x: 14, z: 0 }, dir: E, speed: 10 },
  // Straight into the manual pad's bump and up onto the pad, at the fastest the
  // ride goes. A body that slides onto a rising surface has to be lifted by it,
  // and the floor guard is the thing that can refuse to.
  { name: "onto the manual pad 18 m/s", at: { x: 2, z: 0 }, dir: N, speed: 18 },
  // Into the loading dock's 1.1 m face, the wall that used to eat the links.
  { name: "into the dock face at 11 m/s", at: { x: -22, z: 18 }, dir: W, speed: 11 },
  // …and at the TOE of its bank, which is where a body creeps instead of
  // settling if the only friction it has is viscous.
  { name: "at the dock bank toe 11 m/s", at: { x: -29, z: 8 }, dir: N, speed: 11 },

  // --- THE NORTH TRANSITION, which this file had never bailed him at ---------
  //
  // Ten cases above and not one of them is the far ramp — the obstacle the player
  // has now reported seven times. That is the same blind spot four other
  // instruments on this ramp have had, in a fifth: a harness that drives it
  // differently from a player, or here does not drive it at all.
  //
  // Why it matters and why RIDE sweeps could not answer it. `tools/back-air.mjs`
  // proves the RIDE never puts the wheels on the level top behind the coping
  // without a pop — ~2,700 approaches, the load-bearing gate being that touchdown
  // is 2.6–3.0 m/s, ~55× `PUSH_ROLL_MIN`, so a held push always follows his
  // motion and never his facing. **None of that binds a BODY.** A ragdoll obeys
  // no launch tangent, no `PUSH_ROLL_MIN` and no `syncStance`, so if a bail can
  // deposit him on that 4.21 m level top, "standing on the deck at 1 km/h" has a
  // route the ride never had. `rest` is the column that answers it.
  //
  // The velocities are the ones this ramp actually hands out, measured on the
  // taught line: released off the coping on its own 88° tangent (vy +9.5 to
  // +10.9, barely any horizontal), back down on the return at −2.6 to −2.9, and
  // down the face at −14.1 to −14.7. `drop` stands in for the height, since
  // `ragdoll.start` takes a horizontal velocity.
  { name: "back ramp: bailed AT the coping", at: { x: 0, z: BACK_LIP_Z - 0.05 }, dir: N, speed: 1 },
  { name: "back ramp: air over the lip, 3 m up", at: { x: 0, z: BACK_LIP_Z }, dir: N, speed: 2, drop: 3 },
  { name: "back ramp: air over the lip, 6 m up", at: { x: 0, z: BACK_LIP_Z }, dir: N, speed: 2, drop: 6 },
  { name: "back ramp: air past the lip, 5 m up", at: { x: 0, z: BACK_LIP_Z + 0.8 }, dir: N, speed: 3, drop: 5 },
  // …and the two on the wheels: coming back down the return, and down the face.
  { name: "back ramp: on the return at 3 m/s", at: { x: 0, z: BACK_LIP_Z + 0.5 }, dir: S, speed: 3 },
  { name: "back ramp: down the face at 14 m/s", at: { x: 0, z: BACK_LIP_Z - 1 }, dir: S, speed: 14 },
  // The one that asks the question directly: a body already ON the level top.
  // If it settles there, the deck is a place a bail can park him.
  { name: "back ramp: on the level top at 4 m/s", at: { x: 0, z: BACK_FLAT_Z + 0.3 }, dir: N, speed: 4 },

  // WHAT THESE SEVEN FOUND, so the next reader does not re-derive it: a bail on
  // the WHEELS slides to the plaza every time (rest z 33.6–40.5), and a bail in
  // the AIR past the coping comes to rest ON the level top — hips 4.34 at
  // z 47.3–47.5, 0.5–0.7 m off the brick, 10 of 10 rows at five frame rates. The
  // stand-up then hands the controls back 1.37 s later, on his feet, at ~0 m/s,
  // facing the wall. That is the route the RIDE never had, and it is what
  // `SkateModel.pushBlocked` was written for.
  //
  // FOUR OF THESE ROWS FAIL, AND THEY ARE LEFT FAILING ON PURPOSE. Three are the
  // board coming to rest 0.1–0.3 m PAST him — north of him, toward the brick —
  // at 60/90/45 fps, reported as "257.1 cm over the floor" at (−0.3, 2.57, 44.5).
  // SUSPECTED, not diagnosed: the face's own surface there is y ≈ 2.9, so the
  // board is plausibly resting ON the transition while this harness's floor probe
  // answers the plaza's 0 — i.e. the float figure is measured against the wrong
  // ground, not the board being in the air. The fourth is the deck 6.6 cm into him
  // at rest against a 6 cm limit, 30 fps only. Chasing a measurement quirk in the
  // middle of a real fix is how green checks get written over live bugs, so the
  // numbers stay in the table and the suspicion stays here.
];

/**
 * THE LOOK — the same fall, at the speeds and out of the situations a player
 * actually bails in, so the table says what a bail looks like rather than only
 * whether the solver survived one.
 *
 * The street cases above are chosen for the solids that have broken this file.
 * These are chosen for the PLAYER: the four speeds a line reaches, a bail out of
 * a spin, off a ledge, down the six-stair, and straight into a wall. It is where
 * `carry` earns its place — a body that hits the plaza at 18 m/s and stops where
 * it fell passes every other line in the table and looks like a dropped sack.
 */
const LOOK_CASES = [
  { name: "LOOK plaza 6 m/s", at: { x: 5, z: 5 }, dir: E, speed: 6 },
  { name: "LOOK plaza 10 m/s", at: { x: 5, z: 5 }, dir: E, speed: 10 },
  { name: "LOOK plaza 14 m/s", at: { x: 5, z: 5 }, dir: E, speed: 14 },
  { name: "LOOK plaza 18 m/s", at: { x: 5, z: 5 }, dir: E, speed: 18 },
  { name: "LOOK out of a 540", at: { x: 5, z: 5 }, dir: E, speed: 10, spin: 7.6, drop: 0.6 },
  { name: "LOOK off the ledge", at: { x: -21, z: 12 }, dir: N, speed: 10 },
  { name: "LOOK down the 6-stair", at: { x: -11, z: -17 }, dir: N, speed: 12 },
  { name: "LOOK into the wall 14 m/s", at: { x: 20, z: 30 }, dir: N, speed: 14 },
];

// ---------------------------------------------------------------------------
// pass marks
// ---------------------------------------------------------------------------

/**
 * What a player would notice, as numbers. These are assertions, not a report:
 * the run exits non-zero when one breaks, and every one of them has been proved
 * to bite by breaking the code under it on purpose.
 */
const LIMITS = [
  // A bone that stretches is skin that tears. The links hold to a millimetre.
  ["bone±", (r) => r.lenDrift * 1000, () => 6, "mm"],
  // Below the surface he is lying on. Negative is inside the concrete.
  //
  // Two numbers, because one cannot say what a player sees. A skull passing
  // 9.7 cm through the loading dock's face for ONE frame during an 11 m/s
  // head-first slam is not the same bug as a body lying inside a wall, and a
  // single depth threshold either misses the second or fails the first. So the
  // depth catches anything catastrophic and `deep` — frames with any bone more
  // than 5 cm under — catches anything you could actually look at. Measured on
  // the real spot: every case sits at 0 deep frames except the dock slam, which
  // is 1, and the unguarded build ran 22.
  ["floor", (r) => -r.minClearance * 100, () => 25, "cm"],
  ["deep", (r) => r.deepFrames, () => 3, " frames"],
  // …and the one nobody had: asleep in mid-air passes every other line here.
  //
  // The default is 30 cm — he is on the floor or he is not. One case carries its
  // own bound and says why: with NO truthful query anywhere in the world there
  // is nothing to fall toward, and the honest guarantee is that he cannot CLIMB
  // — he comes to rest on the height he bailed at, plus the one step
  // `FLOOR_RISE_MAX` allows, and never a centimetre above it.
  ["rest", (r) => Math.abs(r.restHeight) * 100, (c) => c.restMax ?? 30, "cm"],
  // A body that never stops is a body the player is still watching.
  ["settle", (r) => (r.settle < 0 ? 99 : r.settle), () => 3.9, "s"],
  // …and its other half: he was DECLARED settled — was he still moving? An
  // average over twenty-four particles is a place for a limb to hide. Watched
  // failing: reverting the ragdoll's `moved` to the integration-only sum, or
  // averaging it instead of taking the worst part of him, both put a shin at
  // 2.58 m/s on the frame the body was frozen.
  ["frozen", (r) => r.frozenAt, () => 0.9, " m/s"],
  // A LIMB MAY NOT REVERSE — measured on the line from a joint to the next one,
  // which is the only thing a reversal shows in. A bone's QUATERNION is not:
  // round 5's 120° bound read one, and the verifier set `LIMIT_TURN_RATE` to 1e9
  // — deleted a guard outright — with the check still passing at 78.5°.
  //
  // Three lines, and they bind at different ends of the frame-rate range, which
  // is the whole reason there are three.
  //
  // · `limb°` is what a player's eye actually judges: how far the limb swung
  //   between the two pictures he was shown. It is the TIGHTEST line at 30 and
  //   45 fps and the slackest at 144, because a long frame is allowed more turn
  //   and a short one less.
  // · `turn/s` is the same fact as a rate, which is tightest at 144 and slackest
  //   at 30 — the exact complement. A joint has a top angular speed and it does
  //   not change because the display got slower.
  // · `flip` is the plain-English one: how many drawn frames had a limb turn past
  //   a right angle. Not "fast", not "jittery" — pointing the other way. It counts
  //   FRAMES rather than taking a maximum, so one bad frame in a fall reads
  //   differently from forty of them.
  //
  // The two bounds are set against the solver's own analytic ceiling, measured
  // rather than copied: `capTurn` allows `BONE_TURN_RATE · SUBSTEP` per substep
  // and a frame takes `ceil(dt/SUBSTEP)` of them, so the guarded build tops out
  // at exactly 42.0° at 30 fps, 28.0 at 45, 21.0 at 60, 14.0 at 90 and 14.0 at
  // 144 — hit to the tenth of a degree by the worst row at each rate across all
  // 170. 55° is that worst case with a third again on top, and 3,000°/s is the
  // 2,017°/s the 144 fps accumulator aliases to with half again on top.
  //
  // WATCHED FAILING, which is the only thing that makes any of this an assertion
  // rather than a decoration. `capTurn` deleted (`BONE_TURN_RATE = 1e9`), the
  // whole table, per rate — worst limb turn 116.0° at 30 fps, 112.7 at 45, 90.4
  // at 60, 69.2 at 90, 62.1 at 144, against a bound of 55: RED AT EVERY RATE,
  // 60/170 rows passing. Round 5's `world°` line is gone rather than retuned: it
  // read a bone's QUATERNION, `rollFrom` makes the roll half of that continuous
  // by construction, and the verifier proved the point by setting
  // `LIMIT_TURN_RATE` to 1e9 — deleting a guard outright — with the 120° bound
  // still passing at 78.5°.
  ["limb°", (r) => r.worstLimb, () => 55, "°"],
  ["turn/s", (r) => r.worstLimbRate, () => 3000, "°/s"],
  // A LIMB MAY NOT COME ROUND THE WRONG WAY OVER A TENTH OF A SECOND — the line
  // that replaces `flip`, which round three showed was arithmetic rather than
  // evidence (`capTurn` bounds a frame's limb turn at 42.0° at 30 fps down to
  // 14.0 at 144, so `flip`'s 100° threshold could never be reached at any rate
  // this file sweeps, and `limb°` at 55 would have gone red first anyway).
  //
  // The cap is a RATE and this is a WINDOW, so the cap does not force it: at
  // 30 fps it permits 126° in a tenth of a second and at 144 fps 84°. Measured
  // over the whole table on the shipped solver: **61.3° at the quietest, 76.9°
  // median, 121.2° at the worst**, and the spread across the five rates on any
  // one case is a couple of degrees — which is what a window buys and a per-frame
  // measure cannot give.
  //
  // 130 is that worst with a margin. WATCHED FAILING: `capTurn` deleted
  // (`BONE_TURN_RATE = 1e9`) — **131.1° to 152.9°, red on 26 rows** (the table
  // drops to 33/195 overall, most of it on `limb°` and `turn/s`, which is the
  // right division of labour: those two catch the cap going missing and this one
  // catches a limb that came round the wrong way whether or not it did).
  //
  // That margin is thin and it is stated rather than tuned around, because it is
  // the honest shape of the thing: a window measure is mostly indifferent to a
  // per-frame RATE limiter, which is precisely why it is worth having next to
  // two lines that are not. `JOINT_DAMP = 0` — the documented cause of every whip
  // in this table's history — was tried as a second break and does not move this
  // column at all on the three cases it was run against.
  //
  // **And the honest reading of the top of that range, which is a finding rather
  // than a pass mark.** Every row over 100° is the NECK, at every frame rate,
  // and 121° in a tenth of a second is 20° a frame for six frames running — the
  // per-frame cap, held flat. On those rows `capTurn` is not clipping a spike off
  // the physics, it is authoring the head's motion. That is the "30 fps limb
  // inversion" this project has chased through three fixes, finally on an
  // instrument that can see it: it is not per-frame and it is not the legs. The
  // neck's own cone is NOT the answer — `ragdoll.ts`'s `LIMITS.neck` records
  // tightening it being tried and measured worse — so it is left named here
  // rather than half-fixed.
  ["held°", (r) => r.heldLimb, () => 130, "°"],
  // …and SPEED RETAINED, the instrument this repo did not have anywhere.
  //
  // A skater who eats it at speed slides down the street; he does not stop where
  // he fell. Every other line here is content with a body that lands and dies on
  // the spot, which is what "the ragdoll works" kept meaning while it looked like
  // a dropped sack. So: a third of a second after a bail above 6 m/s, at least a
  // fifth of the speed he arrived with is still carrying him.
  //
  // --- and the three things ticket item 9 is actually about ------------------
  //
  // A KNEE MAY NOT BEND BACKWARDS, and it is measured as a STATE. Every other
  // line above this one measures how fast something moved, and a limb bent the
  // wrong way and held there moves at nothing at all — which is precisely the
  // shape of hole this project has been caught in three times. This is the
  // settled pose, the one the player looks at for the better part of a second
  // before he gets up. 8° is the solver's own 5° of hyperextension with the
  // slack a partial correction leaves on top.
  ["bend", (r) => r.bendRest, () => 8, "°"],
  // …and NO PART OF HIM MAY BE INSIDE ANOTHER PART. Measured against the
  // character's own SKIN (see `skinRadii`) and against the pose he bailed in,
  // so a stance that already stands with its knees together is not asked to
  // blow itself apart, and only the overlap he did NOT arrive with counts.
  //
  // WATCHED FAILING: with `solveVolume` commented out of the relaxation loop —
  // which is exactly the build that shipped before this round — his two shins
  // occupy the same space at rest on every case in the table, 12 to 25 cm deep.
  ["thru", (r) => r.thruRest * 100, () => 4, "cm"],
  ["thru!", (r) => r.thruWorst * 100, () => 9, "cm"],
  // …and THE BOARD FALLS WITH HIM, NOT THROUGH HIM, which is three claims and
  // takes three lines. It leaves the rig at all (the build before this round
  // has it welded under the hips: `deck ran` reads the full 25 cm short on
  // every row). It comes to rest ON the floor rather than hovering at wheel
  // height or sunk through it. And it is not inside his body when it stops.
  ["deck ran", (r) => (r.case.speed >= 6 ? Math.max(0, 25 - r.deckMove * 100) : 0), () => 0, " cm short"],
  // …and the OTHER end of that, which is the line this table did not have and
  // the one round three's blocker is entirely about.
  //
  // `deck ran` is a MINIMUM — it says the deck came loose and nothing else — so
  // between it and `home` there was no bound anywhere on how far the board then
  // went. Computed off this file's own printed world positions on the build that
  // shipped into round three: 1.50 m to 12.33 m between the hips at rest and the
  // deck at rest, most cases between three and eleven. The row that cannot be
  // argued away is `stand still, dropped 1.2 m` — rider stationary, `travel`
  // 0.1 m, nothing in the scene with any momentum in it — and the deck finished
  // **2.83 m** away. On screen that is four wide frames of a collapsed skater
  // with no skateboard anywhere in them (`shots/g-body/c-flat-f02/f03/f05/f06`).
  //
  // **The bound is not a constant, because the honest answer is not one.** A
  // board and the body it came off leave at the same speed and both of them
  // slide; a bail that puts the RIDER twelve metres down the plaza has no
  // business demanding the board stop within arm's reach of where he fell. So it
  // is measured as an allowance: a body-length and a half, plus however far the
  // fall itself travelled. A standing drop gets 1.5 m and a full-speed slam gets
  // whatever the slam was worth, and both of them mean the same thing — the
  // board is part of this fall rather than an event happening somewhere else.
  //
  // WATCHED FAILING, whole table, with the three constants this round changed in
  // `board-fall.ts` put back where they were: `KICK` to 1.15, `IMPACT_GRIP` to 0
  // (no friction at an impact, which is what the file had), `SEPARATE_GIVE`
  // unbounded (a separation reads back as speed in full). **86 of 195 rows red
  // across 19 of the 39 cases, worst 6.1 m past the allowance**, and the cases
  // are the ones the shots are of — `stand still, dropped 1.2 m`, `bail at 8 m/s,
  // flat`, `— stand-up, the take`, `into the north building 12 m/s`.
  ["deck by", (r) => Math.max(0, r.deckBy - (1.5 + r.travel)), () => 0, " m past him"],
  // …with the same escape the body's own `rest` line carries, for the same
  // reason: in a world where every height query lies there is no floor for the
  // deck to find either, and the honest guarantee is that it cannot CLIMB.
  ["deck±", (r) => (r.deckOnHim ? 0 : Math.abs(r.deckRest) * 100), (c) => c.restMax ?? 12, "cm"],
  // 6 cm rather than 4, and the reason is the same one that made `deck in!` need
  // more passes: a deck that stays with the body comes to rest against it, and one
  // case in the table has nowhere for it to go. `into the dock face at 11 m/s`
  // leaves him draped over 1.1 m of concrete with the deck wedged between his
  // chest and the face — the wall solve backs it out horizontally, the body solve
  // pushes it off him into the wall, and there is no pose in that corner where it
  // is clear of both. It reads 5.2–5.6 cm at the two rates it lands worst on and
  // 0.0 everywhere else in the table.
  //
  // The line still has teeth: on the build with `solveBody` taken out of the
  // substep it reads 12.4 cm.
  ["in him", (r) => r.deckInRest * 100, () => 6, "cm"],
  // …at rest AND on its worst frame, which are two claims and used to be one.
  //
  // `deckInWorst` was computed every frame and printed on every row ("deepest
  // into him 9.8 cm") and bounded nowhere, so a deck could pass a hand's width
  // through a thigh mid-tumble with the whole table green — the same shape of
  // hole the body's own self-intersection had before it grew a `thru!` line to
  // sit beside `thru`. This is that line for the board.
  //
  // 12 cm rather than 9: a deck is a rigid plank meeting a limb that is being
  // solved against the floor and a wall in the same substep, and unlike two of
  // his own bones the pair has no shared joint to hold them apart. Measured
  // across all 195 rows the worst honest frame is 10.7 cm, on the dock face.
  //
  // WATCHED FAILING: the one line that calls `solveBody` taken out of
  // `board-fall.ts`'s substep — the deck goes 15.8 to 16.2 cm through him and the
  // column goes red on 183 of 195 rows (the table drops to 11/195). The margin
  // between 10.6 honest and 15.8 broken is thin, which is exactly why this needs
  // the worst-frame line as well as the at-rest one: `in him` alone reads 12.4 cm
  // on the same broken build and would have caught it, but only because the deck
  // happened to STOP inside him — a deck that passes through a thigh and comes to
  // rest on the concrete beyond it is invisible to a rest check.
  ["deck in!", (r) => r.deckInWorst * 100, () => 12, "cm"],
  // …and it is BACK UNDER HIS FEET once he is up, because the rig owns it again
  // from that frame and anything else is a board left lying in the road while
  // he rides off on nothing.
  ["home", (r) => r.deckHomeGap * 1000, () => 1, "mm"],
  // --- and the stand-up, which is the half of item 9 round two found unbuilt ---
  //
  // The old line here was `(r) => (r.case.getUpClip ? Math.max(0, 0.25 - r.poseFor) : 0)`
  // against a bound of 0, and only two of thirty-six cases set `getUpClip` — so
  // on the 178 rows running the configuration that SHIPS the metric was the
  // literal constant zero. It printed its own condemnation on every one of them
  // ("hips climbing at 2.20 m/s worst") and asserted nothing. That is the third
  // time this project has shipped a green table over an unbuilt feature, and the
  // fix is not a tighter number, it is that the default row runs what the player
  // runs: every row here now plays the get-up take, and the fallback lives on two
  // rows that assert it is a cut.
  //
  // Three lines, because "a real transition from collapsed to standing" is three
  // claims and one of them alone is satisfiable by nonsense:
  //
  // · `stand` — it LASTED. A get-up is not one frame and not two: the take in the
  //   slot is 2.2 s of played motion, and 0.7 s is that with a wide margin for a
  //   take somebody swaps in later. Measured on the pose itself (`poseFor` — the
  //   last moment any bone's local rotation moved by more than a tenth of a
  //   degree) rather than on `ragdoll.running`, because the deck's own return
  //   keeps the fall alive for half a second after the bones have stopped.
  // · `rise` — it was a MOTION. The fastest tenth of a second his hips climbed
  //   through, which is the number that separates a man standing up from a man
  //   being teleported upright: the take does it at 1.59 m/s and the cross-fade
  //   at 2.20, at every one of the five rates. 1.9 is the take's own worst across
  //   all 195 rows with a fifth on top, and it is deliberately BELOW the
  //   cross-fade's own number — a bound a cut would pass is not a bound.
  //
  //   Exempt where `restMax` is, and for that line's reason rather than a new
  //   one: those two rows are worlds where every height query lies, the body
  //   legitimately comes to rest 1.2 m above a floor it cannot find, and the rig
  //   this harness stands him back up on is placed at the TRUTH. The 5.3 m/s they
  //   read is the gap between the lie and the truth, measured once, at the moment
  //   he stands. In the game both sides come from the same lying provider and
  //   there is no gap to fall through.
  // · `stood` — the TAKE got him up, rather than the hand-back doing it for him.
  //   Slow and busy satisfies both lines above while never leaving the floor, and
  //   so does a take that stops half way. This asks how far his hips are above his
  //   lowest bone at the last frame the take is answering for — see the
  //   measurement, which explains why that is `RISE_OUT` before the end and not at
  //   the end. The take has him at 69–73 cm there on every row of the table; the
  //   riding stance underneath is 78; a body lying down is 13.
  //
  // WATCHED FAILING, and this is the part that makes them assertions rather than
  // decorations. Three breaks, three sets of real numbers:
  //
  // · **The clip slot empty** — the build that shipped into round two, so
  //   `blend()` runs the `!this.clip` cross-fade. Done by making `run` pass
  //   `getUp: null` on every row. `stand` 0.4 s short of 0.7 and `rise` 2.2 m/s
  //   against 1.9, on all 180 rows that are not already `noTake`: **15/195**.
  // · **The take played at 1.86×** — `RISE_MAX` at the 1.6 s tried first. `rise`
  //   2.0 m/s against 1.9, every take row, all five rates.
  // · **The take trimmed short of standing** — `RISE_SETTLED` at 1, so the trim
  //   fires the moment the root's climb is off its own peak and the take is cut at
  //   the performer's crouch. `stand` and `rise` both stay GREEN (it is long, and
  //   it is slow), and `stood` reads 62.8–63.8 cm against 65 on 23 rows. That is
  //   the narrowest of the three margins and it is the reason this line exists:
  //   the other two cannot see a get-up that runs its full length and never
  //   arrives.
  ["stand", (r) => Math.max(0, 0.7 - r.poseFor), (c) => (c.noTake && !c.lateTake ? 99 : 0), "s short"],
  [
    "rise",
    (r) => r.riseFast,
    (c) => (c.noTake && !c.lateTake ? 99 : c.restMax ? 99 : 1.9),
    " m/s",
  ],
  ["stood", (r) => Math.max(0, 65 - r.stood * 100), (c) => (c.noTake && !c.lateTake ? 99 : 0), " cm short"],
  // · `knees` — and it FINISHED BEFORE THE PLAYER WAS RIDING AGAIN, which is the
  //   claim the three lines above cannot make and never could.
  //
  //   `stand`, `rise` and `stood` all measure the take in isolation: this file
  //   drives `createRagdoll` standalone against a parked mixer, so until this
  //   line existed nothing here had ever heard of `SkateModel` at all. What that
  //   hid is not subtle. The ride hands the controls back the FRAME the body
  //   settles — `RAGDOLL_MIN_DOWN` is a floor of 0.55 s and every settle in this
  //   table is past it, so `handBack` is the settle itself — and `main.ts` calls
  //   `release()` on that same frame. The stand-up therefore begins when the
  //   player gets his controls back, and **its window is zero seconds long**.
  //   Every second of it is live gameplay: filmed, 21 → 29 → 41 → 48 km/h across
  //   four consecutive frames with the rider on all fours crossing the plaza
  //   (`shots/g-crit/getup-push-f01/f03/f04`, upright only at f06).
  //
  //   So this line measures the overrun, and the number it is bounded at is an
  //   admission rather than a target. The target is 0 and 0 is not reachable from
  //   inside this lane: the take is a 2.6 s performance, `rise` will not let it
  //   be played faster than 1.77×, and 1.5 s of clip plus the 0.22 s entry is
  //   1.82 s however it is arranged. 1.9 is that with a margin — a REGRESSION
  //   gate that holds the stand-up where this round put it and goes red the
  //   moment anyone lengthens it again.
  //
  //   WATCHED FAILING: `RISE_MAX` back at 2, which is the build that shipped into
  //   round three — 2.2 s of pose against 1.9, red on **185 of 195 rows**, which
  //   is every take row at every rate. The ten that stay green are the `noTake`
  //   rows running the 0.3 s cross-fade, which is exactly the shape this line
  //   should have: it is blind to the fallback on purpose and `cut` guards that
  //   from the other side.
  ["knees", (r) => (r.case.noTake && !r.case.lateTake ? 0 : r.knees), () => 1.9, "s riding on his knees"],
  // …and the cross-fade is still a cut, which is the only thing that keeps the
  // three lines above from being decorations.
  //
  // A bound that nothing in the table ever approaches proves nothing. These two
  // rows run the build that shipped into round two and are asserted to FAIL the
  // shape of `rise` — the fallback must read at better than 2 m/s over a tenth of
  // a second, because that is what a 0.3 s hand-back of a body off the floor
  // costs and pretending otherwise would mean the instrument had gone blind. If
  // somebody empties the clip slot again, the take rows go red; if somebody
  // softens `rise` until it cannot see a cut, these go red.
  //
  // It has already caught one. WATCHED FAILING: the stand-up loop's
  // `mixer.setTime` put back to a constant, which is what it was for three rounds
  // — the parked animation layer then never writes, the stance the cross-fade is
  // supposed to be blending INTO is not on the skeleton, and the fallback's whole
  // 0.66 m collapses to one 7 cm frame. All ten rows red, 1.3 to 1.8 m/s under.
  // That is the same mixer trap `src/skate/fall/get-up.ts` was built to avoid,
  // caught this time in the instrument instead of in the game.
  [
    "cut",
    (r) => (r.case.noTake && !r.case.lateTake ? Math.max(0, 2 - r.riseFast) : 0),
    () => 0,
    " m/s under",
  ],

  // Stated as the SCRUB so it reads the same way round as everything else here:
  // the share of his entry speed the fall took off him by then, which may not be
  // more than four fifths. A body that ended up against something is exempt —
  // and whether it did is MEASURED off the world in front of it (`stoppedBy`),
  // not asserted on the case, because a hand-written exemption is a way of
  // marking your own homework.
  [
    "scrub",
    (r) => (r.case.speed >= 6 && !r.stoppedBy ? (1 - r.carryFrac) * 100 : 0),
    () => 80,
    "%",
  ],
];

function check(r) {
  const c = r.case ?? {};
  return LIMITS.filter(([, of, max]) => !(of(r) <= max(c))).map(
    ([label, of, max, unit]) => `${label} ${of(r).toFixed(1)}${unit} > ${max(c)}${unit}`,
  );
}

// ---------------------------------------------------------------------------
// run it
// ---------------------------------------------------------------------------

// EVERYTHING runs at EVERY rate. The lab table used to run at 60 alone, with
// only the liars and the street cases swept, which meant the standing collapse,
// the 16 m/s slam, the 540 bail, the ledge drop and the five stairs — five of the
// six cases that describe what a fall LOOKS like — were never once measured at
// the frame rate half the players are on. A solver with a fixed substep and a
// variable frame is a different solver at every rate, so there is no case in this
// file that is exempt from proving it.
// An optional substring filter, so a single case can be re-measured in seconds
// while chasing one number. With no argument the whole table runs, which is what
// the pass mark at the bottom is counted over.
const only = process.argv[2] ?? "";
const wanted = (c) => c.name.toLowerCase().includes(only.toLowerCase());

const rows = [];
for (const c of LAB_CASES.filter(wanted)) {
  for (const fps of RATES) rows.push(run({ ...c, fps }));
}
for (const c of [...STREET_CASES, ...LOOK_CASES].filter(wanted)) {
  for (const fps of RATES) rows.push(run({ ...c, world: STREET_SPOT, street: true, fps }));
}

const f = (n, d = 2) => (n === Infinity || n === -Infinity ? "—" : n.toFixed(d));
const head = () => {
  console.log(
    "case".padEnd(30),
    "fps".padStart(4),
    "settle".padStart(7),
    "travel".padStart(7),
    "carry".padStart(6),
    "bone±".padStart(8),
    "floor".padStart(7),
    "deep".padStart(5),
    "rest".padStart(7),
    "limb°".padStart(6),
    "turn/s".padStart(7),
    "held°".padStart(6),
    "bend".padStart(6),
    "thru".padStart(6),
    "deck".padStart(6),
    "in him".padStart(7),
    "deck by".padStart(8),
    "rise".padStart(7),
    "stood".padStart(5),
    "knees".padStart(6),
    "frozen".padStart(7),
    "world°".padStart(7),
    "blend°".padStart(7),
    "skin".padStart(5),
    "",
  );
  console.log("-".repeat(140));
};

// What `thru` is measured against, printed once: a reader has to be able to see
// that the flesh this table calls a collision is the flesh the character
// actually has.
console.log("");
console.log(
  "skin thickness (70th pct, cm):",
  BODY.pairs.length,
  "segment pairs ·",
  BODY.radius
    .map((r, i) => (r > 0 ? `${BONE_NAMES[i]} ${(r * 100).toFixed(1)}` : null))
    .filter(Boolean)
    .join(" · "),
);
console.log("");
head();
let lastName = null;
for (const r of rows) {
  if (lastName !== null && r.name !== lastName && r.fps !== 60) console.log("");
  lastName = r.name;
  const bad = check(r);
  console.log(
    r.name.padEnd(30),
    String(r.fps).padStart(4),
    `${f(r.settle)}s`.padStart(7),
    `${f(r.travel, 1)}m`.padStart(7),
    `${f(r.carryFrac * 100, 0)}%`.padStart(6),
    `${f(r.lenDrift * 1000, 2)}mm`.padStart(8),
    `${f(r.minClearance * 100, 1)}cm`.padStart(7),
    String(r.deepFrames).padStart(5),
    `${f(r.restHeight * 100, 1)}cm`.padStart(7),
    f(r.worstLimb, 1).padStart(6),
    f(r.worstLimbRate, 0).padStart(7),
    f(r.heldLimb, 0).padStart(6),
    `${f(r.bendRest, 0)}°`.padStart(6),
    `${f(r.thruRest * 100, 1)}`.padStart(6),
    `${f(r.deckRest * 100, 1)}`.padStart(6),
    `${f(r.deckInRest * 100, 1)}`.padStart(7),
    `${f(r.deckBy, 1)}/${f(1.5 + r.travel, 1)}`.padStart(8),
    `${f(r.riseFast, 1)}`.padStart(7),
    `${f(r.stood * 100, 0)}`.padStart(5),
    `${f(r.knees, 2)}`.padStart(6),
    `${f(r.frozenAt, 2)}`.padStart(7),
    f(r.worstWorld, 1).padStart(7),
    f(r.worstBlend, 1).padStart(7),
    `${f(r.worstStretch * 100, 0)}%`.padStart(5),
    bad.length ? `FAIL: ${bad.join(", ")}` : "",
  );
}

console.log("");
for (const r of rows) {
  // The detail block is 60 fps only when the whole table runs, because eight
  // lines per row over 170 rows is not a report. Filtered down to one case it is
  // the opposite — every rate, because a number that moves with the frame rate is
  // the only kind of bug this file has left.
  if (!only && r.fps !== 60) continue;
  const first = r.impacts[0];
  console.log(
    `${r.name}:`,
    `hips rest ${f(r.hips.x, 1)},${f(r.hips.y, 2)},${f(r.hips.z, 1)}`,
    `· ${r.impacts.length} impacts`,
    first ? `· first ${first.part} @ ${f(first.speed, 1)} m/s (t=${f(first.t)}s)` : "· none",
    r.hardest ? `· hardest ${r.hardest.part} @ ${f(r.hardest.speed, 1)} m/s` : "",
  );
  console.log(
    "   ".padEnd(4),
    `worst limb turn ${r.worstLimbName} ${f(r.worstLimb, 1)}°/frame = ${f(r.worstLimbRate, 0)}°/s at t=${f(r.worstLimbT)}s · worst over a tenth of a second ${r.heldLimbName} ${f(r.heldLimb, 1)}°`,
    `· speed retained ${f(r.carrySpeed, 1)} m/s (${f(r.carryFrac * 100, 0)}% of entry) 0.34 s in${r.stoppedBy ? ` — stopped by ${r.stoppedBy}, scrub exempt` : ""}`,
    `· worst world turn ${r.worstWorldName} ${f(r.worstWorld, 1)}°/frame`,
    `· worst joint fold ${r.worstJointName} ${f(r.worstJoint, 1)}° at t=${f(r.worstJointT)}s`,
    `· worst hinge past straight ${r.bendWorstName} ${f(r.bendWorst, 1)}° (${f(r.bendRest, 1)}° at rest)`,
    `· deepest limb-through-limb ${r.thruWorstName} ${f(r.thruWorst * 100, 1)} cm (${f(r.thruRest * 100, 1)} cm at rest)`,
    `· deck came ${f(r.deckMove, 2)} m off the hips, rests ${f(r.deckRest * 100, 1)} cm over the floor at (${f(r.deckRestAt.x,1)},${f(r.deckRestAt.y,2)},${f(r.deckRestAt.z,1)}) — ${f(r.deckBy, 2)} m from his hips — deepest into him ${f(r.deckInWorst * 100, 1)} cm (${f(r.deckInRest * 100, 1)} at rest), home to ${f(r.deckHomeGap * 1000, 1)} mm`,
    `· the ride takes the controls back ${f(r.handBack, 2)}s after the bail (RAGDOLL_MIN_DOWN ${RIDE.minDown}s / RAGDOLL_RECOVER ${RIDE.recover}s), and ${f(r.knees, 2)}s of the stand-up runs after that`,
    `· stand-up ${r.case.noTake && !r.case.lateTake ? "NO TAKE — cross-fade" : "the take"}: ${f(r.poseFor, 2)}s of pose (${f(r.riseFor, 2)}s held) over ${r.riseFrames} frames, hips up ${f(r.riseLift * 100, 0)} cm and ${f(r.stood * 100, 0)} cm over his lowest bone when the take let go, climbing at ${f(r.riseFast, 2)} m/s over its fastest 0.1 s (${f(r.riseRate, 2)} m/s worst single frame)`,
    `· lowest bone ${r.minClearanceBone} ${f(r.minClearance * 100, 1)} cm at t=${f(r.minClearanceT)}s at (${f(r.minClearanceAt.x, 1)},${f(r.minClearanceAt.y, 2)},${f(r.minClearanceAt.z, 1)}) over ${r.deepFrames} deep frames`,
    `· rests on ${r.restBone} ${f(r.restHeight * 100, 1)} cm up`,
    `· fastest particle ${r.fastestName} ${f(r.fastest, 1)} m/s`,
    `· carried ${f(r.carried, 0)}° of body spin in the first 0.34 s`,
  );
  console.log(
    "   ".padEnd(4),
    "whipping:",
    r.worstBones.map((b) => `${b.name} ${f(b.max, 0)}°/frame`).join(" · "),
  );
}

const failed = rows.filter((r) => check(r).length > 0);
console.log("");
console.log(`${rows.length - failed.length}/${rows.length} pass`);
for (const r of failed) console.log(`  FAIL ${r.name} @ ${r.fps}fps — ${check(r).join(", ")}`);
console.log("");
if (failed.length > 0) process.exitCode = 1;
