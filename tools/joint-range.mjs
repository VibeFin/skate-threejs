// Does any joint go THROUGH its own range while he falls?
//
//   node --experimental-strip-types tools/joint-range.mjs [substring filter]
//
// The player's report, verbatim: *"we still have fall physics and the
// character's bones. Let's make it more realistic, because sometimes the joints
// twist like this… Just make it so the joints don't twist all the way through."*
// He likes the fall — "it already looks cool" — so nothing here measures how hard
// it lands or how far it slides. `tools/ragdoll-drop.mjs` owns all of that and is
// the file that says the violence did not change. This one measures ONE thing:
// per joint, per frame, how far outside a body's own range the drawn skeleton
// actually went.
//
// ---------------------------------------------------------------------------
// WHY THIS IS NOT A COLUMN IN ragdoll-drop
// ---------------------------------------------------------------------------
//
// `ragdoll-drop` already has `bend` (a hinge past straight) and it reads 0–5°
// across all 195 rows on the build this file was written against — a green
// column over the exact defect the player is describing. It is green for a
// precise reason, and the reason is the shape of the hole:
//
// · **It measures ONE of a joint's three degrees of freedom.** `bend` is the
//   IN-PLANE fold about the axis the joint was folded on at the bail, and
//   `signedAngle` projects both bone directions onto that plane before measuring
//   — so a shin swung 90° OUT of the plane reads the same fold as one still in
//   it. `integration-check` says so out loud on the line beside it: *"a 150°
//   hinge limit bounds the in-plane component only, so this bar is loose on
//   purpose"*, and its own worst reading is a 171.5° fold against a 150° limit.
// · **It measures against the pose he BAILED in.** That is right for a swing
//   cone and it cannot see a twist at all: a bone's roll about its own length
//   does not change where the bone POINTS, so no measurement built on bone
//   directions — `limb°`, `held°`, `bend`, `thru` — can see a forearm spinning
//   about its own axis. The whole table is blind to it by construction.
//
// So this file measures the two things nothing else does, in the frame the only
// frame they mean anything in: **the rig's own bind pose, read off
// `Skeleton.boneInverses`.**
//
// ---------------------------------------------------------------------------
// THE RIG'S OWN REST FRAME, AND WHY IT IS NOT AN ASSUMPTION
// ---------------------------------------------------------------------------
//
// Meshy, Mixamo and VRM rigs do not share a rest frame; the same bone names do
// not mean the same skeleton, and this project has already had a set of raw clips
// fold a new body in half over exactly that. So not one number below comes from
// an assumed T-pose or an assumed axis convention:
//
// · Every joint's HINGE AXIS is `u × w` of that joint's own bind-pose bone
//   directions, expressed in the PARENT's bind frame — a constant of this
//   skeleton, carried into the world every frame by the parent's live rotation.
// · Which WAY round that axis is anatomical flexion is decided by the rig too:
//   `forward` is measured off the bind pose as ankle → toe (this rig answers
//   +Z, which is what the project's rigs are documented to rest facing, and it
//   is CHECKED here rather than assumed), and a knee is the joint whose flexion
//   carries the ankle backwards while an elbow's carries the hand forwards.
// · Every bone's LONG AXIS is its own bind-frame direction toward the child the
//   solver aims it at, so "roll about its own length" is that bone's length and
//   not a guess about which local axis is down the limb.
//
// ---------------------------------------------------------------------------
// WHAT THIS BATCH ACTUALLY HOLDS, AND WHAT IT THEREFORE DOES NOT COVER
// ---------------------------------------------------------------------------
//
// **There is no input layer under any row here, and there is none under
// `ragdoll-drop` either** — `grep -c "SkateModel" tools/ragdoll-drop.mjs` returns
// 0, that file says so about itself, and this one drives `createRagdoll` the same
// way. So "coasting versus throttle held" is not a variable a ragdoll row can hold,
// because the ride hands the fall exactly two things and neither is a key: the
// velocity passed to `start()`, and the bone history `observe()` collected.
//
// Those two ARE swept, hard. Velocity 0 to 30 m/s, which brackets the 18 m/s the
// ride actually reaches and goes past `SEED_MAX` (22) so the solver is handed the
// largest impulse it can ever be given; spin both ways out of a 540; drops to 4 m,
// which lands the whole mass on two legs at 11.7 m/s of closing speed; four
// surfaces including steel, which grips a third as hard and tumbles far longer; and
// eighteen places on the real spot, each chosen for a solid that has produced a bug
// in this project. Every one of them at 30, 45, 60, 90 and 144 fps.
//
// **The gap is the POSE, and it is a real one.** Every row captures from the rolling
// stance, because that is the clip the pre-roll plays. A bail out of a grab, off a
// rail, or half way through a flip captures a DIFFERENT pose, and the capture pose
// is exactly what `ragdoll.ts`'s `ENTRY_SLACK` opens the two new stops against. So
// what is measured is that the stops hold from a rolling entry; what is argued
// rather than measured is that they open cleanly from a held-move entry. Covering
// it needs the four pose takes in the loop, which is `src/skate/anim/`'s lane.
//
// And the frames are derived HERE, off the skeleton, rather than borrowed from
// `ragdoll.ts` — for the reason `ragdoll-drop`'s `skinRadii` comment already
// records paying for once: scoring the solver against the solver's own table is
// marking its homework with its own answer sheet. What IS imported is the
// envelope numbers (`JOINT_LIMITS`) and the name→role map (`classifyBone`),
// because a pass mark that can drift from the thing it grades is not a pass mark
// and a bone landing in a different role here than in the solver would make
// every row meaningless.

import { register } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

// The same directory-import shim `ragdoll-drop.mjs` carries, for the same
// reason: `src/world/spot.ts` has an `import … from "./procedural"` in it, every
// bundler resolves that and node's ESM loader does not, and the two lines that
// fix it belong in `tools/ts-resolve.mjs`, which is not this lane's file.
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
const { createRagdoll, JOINT_LIMITS, classifyBone } = await import("../src/skate/ragdoll.ts");
const { STREET_SPOT, SOLIDS, topOf, QP_LIP_Z } = await import("../src/world/spot.ts");

const SKATER_URL =
  "https://assets.auras.cc/generations/cms0fbiar004o22nuyjqjhzuz/rigged-character.glb";
const RIDE_URL =
  "https://assets.auras.cc/generations/cms1pxt86000i22lphj1usysu/character-motion-uthana-mSN1m41g3uF6-glb";
const GETUP_URL =
  "https://assets.auras.cc/generations/cms51mx9o003d22oz0yd8rn0t/character-motion-uthana-mxzpuR97gzzo-glb";

/**
 * Every rate a player is actually on. A constraint solver with a fixed substep
 * and a variable frame is a different solver at each of them — 30 fps takes six
 * substeps a frame and 144 takes one or two — and a hard stop that holds at 60
 * and not at 30 is not a hard stop.
 */
const RATES = [30, 45, 60, 90, 144];
const DEG = 180 / Math.PI;
const CACHE = path.join(os.tmpdir(), "skate-ragdoll-harness");

// ---------------------------------------------------------------------------
// loading
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

/** three's GLTFLoader reaches for `self.createImageBitmap`; there is no `self` here. */
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

const parseGlb = (ab) => new Promise((ok, fail) => new GLTFLoader().parse(ab, "", ok, fail));

const character = await parseGlb(stripImages(await cached(SKATER_URL, "skater.glb")));
const RIDE_CLIP = (await parseGlb(stripImages(await cached(RIDE_URL, "ride.glb")))).animations[0];
const GETUP_CLIP = (await parseGlb(stripImages(await cached(GETUP_URL, "get-up.glb")))).animations[0];
if (!RIDE_CLIP) throw new Error("no ride clip — the capture pose would be a T-pose");
if (!GETUP_CLIP) throw new Error("no get-up take — the hand-back rows would measure the fallback");

function skinOf(root) {
  let mesh = null;
  root.traverse((o) => {
    if (!mesh && o.isSkinnedMesh) mesh = o;
  });
  return mesh;
}

// ---------------------------------------------------------------------------
// worlds
// ---------------------------------------------------------------------------

function makeWorld(height, { kind = "concrete", blocked = () => false } = {}) {
  const out0 = { height: 0, normal: new THREE.Vector3(0, 1, 0), kind };
  const normal = (x, z, out = new THREE.Vector3()) => {
    const d = 0.12;
    const e1 = new THREE.Vector3(2 * d, height(x + d, z) - height(x - d, z), 0);
    const e2 = new THREE.Vector3(0, height(x, z + d) - height(x, z - d), 2 * d);
    return out.crossVectors(e2, e1).normalize();
  };
  return {
    height: (x, z) => height(x, z),
    normal,
    sample(x, z, hint, out = out0) {
      out.height = height(x, z);
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
}

const FLAT = makeWorld(() => 0);
/** A 0.6 m ledge he rolls off the end of at x = 4. */
const LEDGE = makeWorld((x) => (x < 4 ? 0.6 : 0), {
  blocked: (x, _z, y) => x >= 4 && x < 4.35 && y < 0.6,
});
/** Five 0.18 m steps down from x = 2 — a body that lands on a corner. */
const STAIRS = makeWorld((x) => {
  if (x < 2) return 0.9;
  const step = Math.floor((x - 2) / 0.32);
  return Math.max(0, 0.9 - 0.18 * Math.min(5, step + 1));
});
/** Steel: `GRIP.metal` is 0.35, so he slides a long way and keeps tumbling. */
const METAL = makeWorld(() => 0, { kind: "metal" });

/** The honest floor of the real spot, capped the way `ragdoll-drop` caps it. */
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
// the rig's own rest frame
// ---------------------------------------------------------------------------

/** Angle from `a` to `b` about `axis`, signed — all three assumed unit. */
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pc = new THREE.Vector3();
function signedAngle(a, b, axis) {
  _pa.copy(a).addScaledVector(axis, -a.dot(axis));
  _pb.copy(b).addScaledVector(axis, -b.dot(axis));
  if (_pa.lengthSq() < 1e-10 || _pb.lengthSq() < 1e-10) return 0;
  _pa.normalize();
  _pb.normalize();
  return Math.atan2(_pc.copy(_pa).cross(_pb).dot(axis), _pa.dot(_pb));
}

/**
 * The twist of `q` about `axis`, radians — the twist half of a swing–twist
 * decomposition, exactly (`q = swing · twist`, the swing's axis square to
 * `axis`).
 *
 * `q` and `-q` are the same rotation and `atan2` needs one of them, so the sign
 * is normalised first; without that a bone that has rolled 10° reads as having
 * rolled 350° on about half the frames, which would be the instrument inventing
 * the very defect it is looking for.
 */
function twistAbout(q, axis) {
  let x = q.x;
  let y = q.y;
  let z = q.z;
  let w = q.w;
  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  const d = x * axis.x + y * axis.y + z * axis.z;
  return 2 * Math.atan2(d, w);
}

/**
 * …and the ROLL of one bone about its own length, radians — the number nothing
 * else in this repo measures and the one the player is describing when he says a
 * forearm twists through itself.
 *
 * The definition matters more than the code, because there are two of them and
 * one is nearly useless here. Decomposing the local delta about the bone's REST
 * direction (`q = swing · twist`) goes singular as the swing approaches a half
 * turn — and a fall is full of limbs 100–165° off their rest direction, so that
 * version reads a couple of hundred degrees of "roll" out of pure swing. This is
 * the other one: carry the bone's rest frame along its CURRENT direction by the
 * minimal rotation (no roll of its own), and the roll is whatever is left over.
 *
 * That is also exactly the quantity `ragdoll.ts`'s `rollFrom` picks — a bone with
 * one child has no roll in the particle cloud at all, so the solver chooses it by
 * continuity — which is what makes it both the right anatomical reading and the
 * one a write-back clamp can actually control.
 */
const _lr = new THREE.Vector3();
const _ln = new THREE.Vector3();
const _qs = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
function rollOf(j, local, out) {
  _lr.copy(j.long).applyQuaternion(j.restLocal);
  _ln.copy(j.long).applyQuaternion(local);
  _qs.setFromUnitVectors(_lr, _ln);
  out.swing = 2 * Math.acos(Math.min(1, Math.abs(_qs.w)));
  _qr.copy(local).multiply(_qi.copy(j.restLocal).invert()).multiply(_qs.invert());
  out.axial = twistAbout(_qr, _ln);
  return out;
}

/**
 * Every joint of the skeleton, with the frame its limits mean anything in, read
 * off the BIND POSE and nothing else.
 *
 * `Skeleton.boneInverses[i]` is `bone.matrixWorld.invert()` as of the moment the
 * skin was bound, so its inverse is that bone's bind-pose world matrix — which is
 * available at any time, whatever the animation layer is currently doing to the
 * skeleton. That is the whole reason the rest frame is taken from there rather
 * than from "the scene before a clip runs": by the time a bail happens there is
 * no such moment left.
 */
function jointsOf(root) {
  const mesh = skinOf(root);
  const bones = [...mesh.skeleton.bones];
  const bindQ = [];
  const bindP = [];
  for (let i = 0; i < bones.length; i++) {
    const m = new THREE.Matrix4().copy(mesh.skeleton.boneInverses[i]).invert();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    m.decompose(p, q, s);
    bindP.push(p);
    bindQ.push(q);
  }
  const roles = bones.map((b) => classifyBone(b.name));
  const idx = new Map();
  bones.forEach((b, i) => idx.set(b, i));
  // The solver's own parent: the nearest ancestor it did not skip.
  const parentOf = bones.map((b) => {
    let p = b.parent;
    while (p && (!idx.has(p) || roles[idx.get(p)] === "skip")) p = p.parent;
    return p && idx.has(p) ? idx.get(p) : -1;
  });
  // …and the child it aims at, picked the way `pickAxial` picks it: the body's
  // own line continues into the spine and the neck, not into a collarbone.
  const rank = (r) => (r === "spine" || r === "neck" || r === "head" ? 0 : r === "headTip" ? 1 : 2);
  const kids = bones.map(() => []);
  for (let i = 0; i < bones.length; i++) {
    if (roles[i] === "skip") continue;
    if (parentOf[i] >= 0) kids[parentOf[i]].push(i);
  }
  const aimOf = kids.map((list) => {
    let best = -1;
    for (const c of list) if (best < 0 || rank(roles[c]) < rank(roles[best])) best = c;
    return best;
  });
  // A head's own leaves are face markers, not another head — the same demotion
  // `build()` does, so the roles this file looks envelopes up under are the roles
  // the solver actually used.
  for (let i = 0; i < bones.length; i++) {
    if (roles[i] !== "head") continue;
    const p = parentOf[i];
    if (p >= 0 && (roles[p] === "head" || roles[p] === "headTip")) roles[i] = "headTip";
  }

  // WHICH WAY THE RIG FACES, measured: the sole, ankle → toe, in the bind pose.
  // This project's rigs are documented to rest facing +Z; that is checked below
  // rather than trusted, because a limit whose sign came from a wrong guess about
  // a rig's facing is a knee stopped on the wrong side.
  const forward = new THREE.Vector3();
  let soles = 0;
  for (let i = 0; i < bones.length; i++) {
    if (roles[i] !== "foot" || aimOf[i] < 0) continue;
    forward.add(_pa.subVectors(bindP[aimOf[i]], bindP[i]).setY(0).normalize());
    soles++;
  }
  if (soles === 0) throw new Error("no foot→toe pair in the bind pose — cannot measure facing");
  forward.divideScalar(soles).normalize();

  const out = [];
  for (let i = 0; i < bones.length; i++) {
    const role = roles[i];
    const spec = JOINT_LIMITS[role];
    const p = parentOf[i];
    const c = aimOf[i];
    if (role === "skip" || p < 0 || c < 0 || !spec) continue;
    const u = new THREE.Vector3().subVectors(bindP[i], bindP[p]).normalize();
    const w = new THREE.Vector3().subVectors(bindP[c], bindP[i]).normalize();
    const cross = new THREE.Vector3().crossVectors(u, w);
    const bent = cross.length();
    let axis;
    let source;
    // WHICH AXIS A JOINT ACTUALLY HINGES ABOUT, and this rig answers differently
    // for the knee and the elbow — which is why it is measured rather than picked.
    //
    // `u × w` off the bind pose is the obvious source and it is only as good as
    // the bind FOLD is deep: at a shallow bend the cross product is dominated by
    // whatever else the rest pose has in it. Measured on this rig, the knee rests
    // at 11.3° of bend and its `u × w` axis is **22.9° away** from the body's own
    // hip-to-hip line — the A-pose's leg splay, not the knee. The consequence is
    // not academic: an axis 20° off turns real FLEXION into apparent abduction at
    // sin(20°) of the swing, so the riding stance's 43° of knee bend reads as
    // **18.2° of the knee bending sideways** against `u × w` and **0.1° against
    // the lateral line**. The elbow is the other way round — it rests at 29° of
    // bend, and its stance reads 1.1–3.0° of abduction against `u × w` against
    // 8.4–14.0° against the lateral line.
    //
    // So: `u × w` where the bind fold is deep enough to trust (20°, sin 0.34) and
    // the body's own lateral line where it is not — `u × forward`, which is the
    // hip-to-hip direction and is square to the bone above by construction. Both
    // are measurements off this skeleton; the threshold is the only judgement, and
    // it lands each of the four hinges on the axis its own two poses say it turns
    // about.
    if (bent > 0.34) {
      axis = cross.divideScalar(bent);
      source = "u×w";
    } else {
      axis = new THREE.Vector3().crossVectors(u, forward);
      if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
      axis.normalize();
      source = "lateral";
    }
    // …and which way round it is anatomical. Flexion carries a knee's ankle
    // BACKWARD and an elbow's hand FORWARD; the rate the outgoing bone moves at
    // for a positive turn about the axis is `axis × w`, so its component along
    // the measured facing decides the sign. Anything that is not a hinge keeps
    // the axis it was handed — nothing below reads its sign.
    const carries = _pa.crossVectors(axis, w).dot(forward);
    const wantForward = role === "foreArm" ? 1 : role === "shin" ? -1 : 0;
    if (wantForward !== 0 && carries * wantForward < 0) axis.negate();
    out.push({
      i,
      name: bones[i].name,
      role,
      parent: p,
      aim: c,
      spec,
      hinge: spec.kind === "hinge",
      /** The hinge axis in the PARENT's bind frame — a constant of this skeleton. */
      axisP: axis.clone().applyQuaternion(bindQ[p].clone().invert()),
      /** …and this bone's own long axis in its OWN bind frame. */
      long: w.clone().applyQuaternion(bindQ[i].clone().invert()),
      /** The local rotation it rests at, so `axial` is measured off the rig. */
      restLocal: bindQ[p].clone().invert().multiply(bindQ[i]),
      restFold: signedAngle(u, w, axis),
      /**
       * How far out of the hinge plane the bone RESTS, so abduction is measured as
       * a deviation and reads exactly zero in the bind pose.
       *
       * It is not always zero even with the `u × w` axis, because the axis is
       * negated where the rig's own fold direction is not the anatomical one — and
       * with the lateral axis it is 4.4° on the knee. An absolute `|w · e|` would
       * therefore charge every joint for its own rest pose, which is the mistake
       * the swing cones already avoid by being relative.
       */
      abdRest: Math.asin(Math.max(-1, Math.min(1, w.dot(axis)))),
      bent,
      source,
      /** True where the scene parent and the solver parent are the same node. */
      direct: bones[i].parent === bones[p],
    });
  }
  return { bones, joints: out, forward, roles };
}

const REST = (() => {
  const holder = cloneSkeleton(character.scene);
  holder.updateMatrixWorld(true);
  return jointsOf(holder);
})();

/**
 * WHAT THE RIG'S OWN ANIMATION ALREADY DOES, joint by joint — the ceiling any
 * envelope has to clear before it is a limit rather than a fight.
 *
 * A stop tighter than the game's own authored motion is not a stop, it is a
 * second animator with a worse opinion — and it shows up in the worst possible
 * place: the ragdoll only owns the pose while it is blending out, so a take the
 * envelope disagrees with gets clamped for the length of the hand-back and then
 * springs to its authored value the frame the weight reaches zero. That is a pop,
 * and it is caused by the guard.
 *
 * So both clips this fall touches are swept here — the rolling stance the bail
 * captures FROM and the get-up take it hands back TO — and the envelope is read
 * against them in the rest table. Nothing is asserted: it is a measurement, and
 * where the take is wider than a body's range the honest reading is that the
 * generated take is wider than a body's range.
 */
function clipRange(clip) {
  const holder = cloneSkeleton(character.scene);
  holder.updateMatrixWorld(true);
  const { bones, joints } = jointsOf(holder);
  const mixer = new THREE.AnimationMixer(holder);
  mixer.clipAction(clip).play();
  const at = bones.map(() => new THREE.Vector3());
  const worst = joints.map(() => ({ flexLo: Infinity, flexHi: -Infinity, abd: 0, axial: 0 }));
  for (let t = 0; t <= clip.duration; t += 1 / 60) {
    mixer.setTime(t);
    holder.updateMatrixWorld(true);
    for (let i = 0; i < bones.length; i++) bones[i].getWorldPosition(at[i]);
    for (let k = 0; k < joints.length; k++) {
      const r = readJoint(joints[k], bones, at, _out);
      if (!r) continue;
      const w = worst[k];
      w.flexLo = Math.min(w.flexLo, r.flex);
      w.flexHi = Math.max(w.flexHi, r.flex);
      w.abd = Math.max(w.abd, Math.abs(r.abd));
      w.axial = Math.max(w.axial, Math.abs(r.axial));
    }
  }
  return worst;
}

// ---------------------------------------------------------------------------
// reading one frame of the drawn skeleton
// ---------------------------------------------------------------------------

const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _e = new THREE.Vector3();
const _qa = new THREE.Quaternion();

/**
 * The three numbers a joint has, off the DRAWN skeleton.
 *
 * · `flex` — the in-plane fold about the rig's own hinge axis, signed. Zero is
 *   straight, whatever pose he bailed in; negative is hyperextension.
 * · `abd` — how far the outgoing bone has left the hinge PLANE. This is the one
 *   `ragdoll-drop`'s `bend` cannot see: `signedAngle` projects it away.
 * · `axial` — the roll about this bone's own length, against the rig's bind pose.
 *   Nothing in the particle cloud fixes this for a bone with one child, so it is
 *   read off the drawn LOCAL rotation and not off any bone direction.
 */
const _out = { flex: 0, abd: 0, axial: 0, swing: 0 };
function readJoint(j, bones, at, out = { flex: 0, abd: 0, axial: 0, swing: 0 }) {
  _u.subVectors(at[j.i], at[j.parent]);
  _w.subVectors(at[j.aim], at[j.i]);
  if (_u.lengthSq() < 1e-12 || _w.lengthSq() < 1e-12) return null;
  _u.normalize();
  _w.normalize();
  // The axis is a constant of the PARENT bone, so it is carried into the world by
  // whatever the parent's live rotation is — no accumulated delta, no borrowing
  // from the solver.
  bones[j.parent].getWorldQuaternion(_qa);
  _e.copy(j.axisP).applyQuaternion(_qa);
  out.flex = signedAngle(_u, _w, _e);
  out.abd = Math.asin(Math.max(-1, Math.min(1, _w.dot(_e)))) - j.abdRest;
  // `bone.quaternion` is relative to the SCENE parent, which is the solver parent
  // wherever `direct` is true (it is for every joint on this rig — the rest table
  // shouts if it is not).
  rollOf(j, bones[j.i].quaternion, out);
  return out;
}

// ---------------------------------------------------------------------------
// one fall
// ---------------------------------------------------------------------------

const AXLE_HEIGHT = 0.055;
function deckMesh() {
  const geo = new THREE.BoxGeometry(0.21, 0.125, 0.96);
  geo.translate(0, 0.0075, 0);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
}

/**
 * One bail, driven the way `main.ts` drives it — including the stand-up, because
 * a joint can be put through its range from either end and the hand-back is the
 * other end. `phase` on every sample says which half it came from.
 */
function run(spec) {
  const {
    world,
    street = false,
    fps = 60,
    at = { x: 0, z: 0 },
    dir = { x: 1, z: 0 },
    speed = 0,
    spin = 0,
    drop = 0,
    seconds = 3.2,
  } = spec;
  const dt = 1 / fps;
  const holder = cloneSkeleton(character.scene);
  holder.updateMatrixWorld(true);
  const { bones, joints } = jointsOf(holder);

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

  const ragdoll = createRagdoll({ root: holder, surface: world, getUp: GETUP_CLIP });

  // Half a second of real riding first, so the seeding path (`observe`) is under
  // test rather than assumed and the capture pose is the game's own stance.
  const mixer = new THREE.AnimationMixer(holder);
  mixer.clipAction(RIDE_CLIP).play();
  const PRE = 0.5;
  const floorAtBail = street ? (streetGround(at.x, at.z, 40) ?? 0) : world.height(at.x, at.z);
  rigRoot.position.set(at.x - dir.x * speed * PRE, floorAtBail + drop, at.z - dir.z * speed * PRE);
  rigRoot.rotation.y = Math.atan2(dir.x, dir.z) - spin * PRE;
  for (let i = 0, n = Math.round(PRE / dt); i < n; i++) {
    mixer.setTime(0.4 + i * dt);
    rigRoot.position.x += dir.x * speed * dt;
    rigRoot.position.z += dir.z * speed * dt;
    rigRoot.rotation.y += spin * dt;
    rigRoot.updateMatrixWorld(true);
    ragdoll.observe(dt);
  }

  const world0 = bones.map((b) => b.getWorldPosition(new THREE.Vector3()));
  let lowest0 = Infinity;
  for (const p of world0) lowest0 = Math.min(lowest0, p.y);
  const cap = lowest0 + 0.8;
  const groundBelow = street
    ? (x, z) => streetGround(x, z, cap) ?? floorAtBail
    : (x, z) => world.height(x, z);

  // THE RIDING STANCE ITSELF, on the frame before the bail. A limit the entry
  // pose already violates is a limit that snaps the body on frame one, which is
  // the failure `ragdoll.ts`'s `Limit` comment records paying for, so the pose he
  // arrives in is measured before anything is asserted about the pose he leaves.
  const stance = joints.map((j) => readJoint(j, bones, world0));

  ragdoll.start(new THREE.Vector3(dir.x * speed, 0, dir.z * speed));

  const at3 = bones.map(() => new THREE.Vector3());
  const worst = joints.map(() => ({
    flexLo: Infinity,
    flexHi: -Infinity,
    abd: 0,
    axial: 0,
    swing: 0,
    out: 0,
    outRise: 0,
    frames: 0,
    // …and the pose ON THE FRAME THE BODY IS DECLARED SETTLED, which is not the
    // same claim as the worst frame and is the more important of the two. Every
    // other number here is an instant during a tumble, and a limb 30° out of plane
    // for two frames of an 11 m/s slam is a body taking a hit; the settled pose is
    // what the player lies there LOOKING at for the better part of a second before
    // he gets up, and a joint bent wrong and held is what he reported.
    restFlex: 0,
    restAbd: 0,
    restAxial: 0,
  }));
  let elapsed = 0;
  let released = false;
  const frames = Math.round((seconds + 2.6) / dt);
  const deckHome = (t) => {
    boardPitch.position.set(0, AXLE_HEIGHT, 0);
    boardPitch.rotation.set(Math.min(1, t / 0.35) * 0.5, 0, 0);
  };
  let firstFrame = null;

  for (let f = 0; f < frames; f++) {
    // Exactly what the game does to the rig on a bail frame, in the same order:
    // the ride follows the hips, `followFeet` writes the deck's home, then the
    // fall gets the last word on the bones.
    deckHome(elapsed);
    if (elapsed > 0) {
      rigRoot.position.x = ragdoll.hips.x;
      rigRoot.position.z = ragdoll.hips.z;
      rigRoot.position.y = groundBelow(rigRoot.position.x, rigRoot.position.z);
      rigRoot.updateMatrixWorld(true);
    }
    // …and the animation layer underneath, which is a STANCE and not a switch:
    // three's `PropertyMixer` only writes when its own output changes, so a
    // constant `setTime` parks the clip on frame one and then goes quiet. The
    // alternating tenth of a millisecond is what `ragdoll-drop` uses for the same
    // reason and is a three-hundredth of one of the take's own keyframes.
    if (released) mixer.setTime(0.4 + (f % 2) * 1e-4);
    ragdoll.update(dt);
    elapsed += dt;
    holder.updateMatrixWorld(true);
    for (let i = 0; i < bones.length; i++) bones[i].getWorldPosition(at3[i]);

    for (let k = 0; k < joints.length; k++) {
      const j = joints[k];
      const r = readJoint(j, bones, at3, _out);
      if (!r) continue;
      const wk = worst[k];
      wk.frames++;
      wk.flexLo = Math.min(wk.flexLo, r.flex);
      wk.flexHi = Math.max(wk.flexHi, r.flex);
      wk.abd = Math.max(wk.abd, Math.abs(r.abd));
      wk.axial = Math.max(wk.axial, Math.abs(r.axial));
      wk.swing = Math.max(wk.swing, r.swing);
      if (outside(j, r)) {
        wk.out++;
        if (released) wk.outRise++;
      }
      // The settled pose, read on the frame the body is declared to have stopped —
      // and again on every frame until then, so a fall that never settles reports
      // how it was LEFT rather than reporting nothing.
      if (!released) {
        wk.restFlex = r.flex;
        wk.restAbd = r.abd;
        wk.restAxial = r.axial;
      }
    }
    if (firstFrame === null) firstFrame = joints.map((j) => readJoint(j, bones, at3));

    // The ride hands the controls back the frame the body settles — `SkateModel`
    // reads `settled` and goes straight to `rolling`, and `main.ts` calls
    // `release()` on that same frame — so the stand-up starts here and not on a
    // clock of this file's own choosing.
    if (!released && (ragdoll.settled || elapsed > seconds)) {
      released = true;
      ragdoll.release();
    }
    if (released && !ragdoll.running) break;
  }
  return { worst, joints, stance, firstFrame, name: spec.name, fps };
}

/** Is this reading outside the envelope the solver is meant to be holding? */
function outside(j, r) {
  const s = j.spec;
  if (s.axial !== undefined && Math.abs(r.axial) > s.axial + 1e-9) return true;
  if (!j.hinge) return false;
  if (s.abd !== undefined && Math.abs(r.abd) > s.abd + 1e-9) return true;
  return r.flex < -s.a - 1e-9 || r.flex > (s.b ?? Math.PI) + 1e-9;
}

// ---------------------------------------------------------------------------
// what to drop him off — speed, angle, spin, surface, and every rate
// ---------------------------------------------------------------------------

const N = { x: 0, z: 1 };
const S = { x: 0, z: -1 };
const E = { x: 1, z: 0 };
const W = { x: -1, z: 0 };
const NE = { x: Math.SQRT1_2, z: Math.SQRT1_2 };

const CASES = [];
// Flat, the whole grid: every speed a line reaches × both ways out of a spin ×
// a standing collapse and a drop. This is where a joint has the most room to
// tumble and nothing to be stopped by.
for (const speed of [0, 6, 10, 14, 18]) {
  for (const spin of [0, 7.6, -7.6]) {
    for (const dropH of [0, 1.5]) {
      CASES.push({
        name: `flat ${speed} m/s ${spin === 0 ? "no spin" : `${spin > 0 ? "+" : "−"}540`} ${dropH ? "1.5 m" : "grounded"}`,
        world: FLAT,
        speed,
        spin,
        drop: dropH,
        dir: E,
      });
    }
  }
}
// …and steel, which grips a third as hard, so the same bail tumbles far longer.
for (const speed of [10, 16]) {
  CASES.push({ name: `steel ${speed} m/s`, world: METAL, speed, dir: E });
}
// THE SINGLE HUGE IMPULSE, which is where a soft limit fails and a hard stop has
// to be shown not to. `SEED_MAX` caps a seeded particle at 22 m/s, so an entry
// above that is the solver being handed the largest impulse it can ever see, and a
// 4 m drop lands the whole mass on two legs at 11.7 m/s of closing speed with
// nothing else to absorb it. Neither is a speed the ride reaches; that is the
// point of them.
for (const speed of [24, 30]) {
  CASES.push({ name: `single huge impulse ${speed} m/s`, world: FLAT, speed, dir: E });
  CASES.push({ name: `huge impulse ${speed} m/s + 4 m`, world: FLAT, speed, drop: 4, dir: E });
}
CASES.push({ name: "dead drop 4 m, no speed", world: FLAT, speed: 0, drop: 4 });
CASES.push({ name: "540 into a 4 m drop", world: FLAT, speed: 12, spin: 7.6, drop: 4 });

// Edges: a body that lands across a corner is where a limb gets levered.
CASES.push({ name: "off a 0.6 m ledge 6 m/s", world: LEDGE, speed: 6, drop: 0.6 });
CASES.push({ name: "off a 0.6 m ledge 12 m/s", world: LEDGE, speed: 12, drop: 0.6 });
CASES.push({ name: "down five stairs 7 m/s", world: STAIRS, speed: 7, drop: 0.9 });
CASES.push({ name: "down five stairs 14 m/s", world: STAIRS, speed: 14, drop: 0.9 });

/** The real spot, at the solids that have each produced a bug in this project. */
const STREET = [
  { name: "into the north building 12 m/s", at: { x: 20, z: 30 }, dir: N, speed: 12 },
  { name: "QP deck into the building 10 m/s", at: { x: 0, z: 29 }, dir: N, speed: 10 },
  { name: "off the QP lip at 9 m/s", at: { x: 0, z: QP_LIP_Z + 0.2 }, dir: S, speed: 9 },
  { name: "off the 6-stair at 9 m/s", at: { x: -11, z: -15 }, dir: N, speed: 9 },
  { name: "off the long ledge at 7 m/s", at: { x: -21, z: 12 }, dir: N, speed: 7 },
  { name: "into the fence at 12 m/s", at: { x: 28, z: 15 }, dir: E, speed: 12 },
  { name: "in the gutter at 10 m/s", at: { x: 14, z: 0 }, dir: E, speed: 10 },
  { name: "onto the manual pad 18 m/s", at: { x: 2, z: 0 }, dir: N, speed: 18 },
  { name: "into the dock face at 11 m/s", at: { x: -22, z: 18 }, dir: W, speed: 11 },
  { name: "at the dock bank toe 11 m/s", at: { x: -29, z: 8 }, dir: N, speed: 11 },
  // …and the same plaza at four speeds and two angles, which is what a player's
  // bail actually is most of the time.
  { name: "plaza 6 m/s", at: { x: 5, z: 5 }, dir: E, speed: 6 },
  { name: "plaza 10 m/s", at: { x: 5, z: 5 }, dir: E, speed: 10 },
  { name: "plaza 14 m/s", at: { x: 5, z: 5 }, dir: E, speed: 14 },
  { name: "plaza 18 m/s", at: { x: 5, z: 5 }, dir: E, speed: 18 },
  { name: "plaza 14 m/s diagonal", at: { x: 5, z: 5 }, dir: NE, speed: 14 },
  { name: "plaza out of a 540", at: { x: 5, z: 5 }, dir: E, speed: 10, spin: 7.6, drop: 0.6 },
  { name: "plaza out of a 540, other way", at: { x: 5, z: 5 }, dir: E, speed: 10, spin: -7.6, drop: 0.6 },
  { name: "into the wall 14 m/s", at: { x: 20, z: 30 }, dir: N, speed: 14 },
];

const only = process.argv[2] ?? "";
const wanted = (c) => c.name.toLowerCase().includes(only.toLowerCase());

const rows = [];
for (const c of CASES.filter(wanted)) for (const fps of RATES) rows.push(run({ ...c, fps }));
for (const c of STREET.filter(wanted)) {
  for (const fps of RATES) rows.push(run({ ...c, world: STREET_SPOT, street: true, fps }));
}

// ---------------------------------------------------------------------------
// the table
// ---------------------------------------------------------------------------

const f = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "—");

console.log("");
console.log("THE RIG'S OWN REST FRAME — bind matrices, not an assumed T-pose");
console.log(
  `facing measured off the soles: (${REST.forward.toArray().map((v) => v.toFixed(2)).join(", ")})` +
    ` — ${REST.forward.z > 0.9 ? "+Z, as this project's rigs are documented to rest" : "NOT +Z — check the rig"}`,
);
console.log("");
const RIDE_RANGE = clipRange(RIDE_CLIP);
const TAKE_RANGE = clipRange(GETUP_CLIP);
console.log(
  "joint".padEnd(16),
  "role".padEnd(9),
  "restFold".padStart(9),
  "bend".padStart(6),
  "axis".padStart(8),
  "envelope (hyper/flex · abd · axial)".padStart(36),
  "riding stance (flex/abd/axial)".padStart(31),
  "the two clips' own worst (flex lo..hi · abd · axial)".padStart(52),
);
console.log("-".repeat(176));
for (let k = 0; k < REST.joints.length; k++) {
  const j = REST.joints[k];
  // The riding stance, averaged over every row — this is what the entry frame has
  // to be allowed to be, or the first frame of every fall is a snap.
  let flex = 0;
  let abd = 0;
  let axial = 0;
  let n = 0;
  for (const r of rows) {
    const s = r.stance[k];
    if (!s) continue;
    flex += s.flex;
    abd += Math.abs(s.abd);
    axial += Math.abs(s.axial);
    n++;
  }
  if (!j.direct) console.log(`  !! ${j.name}: solver parent is not the scene parent`);
  console.log(
    j.name.padEnd(16),
    j.role.padEnd(9),
    `${f(j.restFold * DEG)}°`.padStart(9),
    f(j.bent, 3).padStart(6),
    j.source.padStart(8),
    `${j.hinge ? `${f(j.spec.a * DEG, 0)}/${f((j.spec.b ?? Math.PI) * DEG, 0)}` : `cone ${f(j.spec.a * DEG, 0)}`} · ${j.spec.abd === undefined ? "—" : f(j.spec.abd * DEG, 0)} · ${j.spec.axial === undefined ? "—" : f(j.spec.axial * DEG, 0)}`.padStart(36),
    n
      ? `${f((flex / n) * DEG)}° / ${f((abd / n) * DEG)}° / ${f((axial / n) * DEG)}°`.padStart(31)
      : "",
    // …and both clips at once, worst of the two, so one glance says whether the
    // envelope contains the rig's own authored motion.
    (() => {
      const a = RIDE_RANGE[k];
      const b = TAKE_RANGE[k];
      const lo = Math.min(a.flexLo, b.flexLo);
      const hi = Math.max(a.flexHi, b.flexHi);
      const abdW = Math.max(a.abd, b.abd);
      const axW = Math.max(a.axial, b.axial);
      const over = [];
      if (j.hinge && lo < -j.spec.a) over.push("hyper");
      if (j.hinge && hi > (j.spec.b ?? Math.PI)) over.push("flex");
      if (j.hinge && j.spec.abd !== undefined && abdW > j.spec.abd) over.push("abd");
      if (j.spec.axial !== undefined && axW > j.spec.axial) over.push("axial");
      return `${f(lo * DEG, 0)}..${f(hi * DEG, 0)}° · ${f(abdW * DEG, 0)}° · ${f(axW * DEG, 0)}°${over.length ? ` PAST: ${over.join(",")}` : ""}`.padStart(52);
    })(),
  );
}

// The ranked table: one row per joint, worst over every fall at every rate.
const agg = REST.joints.map((j) => ({
  j,
  hyper: 0,
  flex: 0,
  abd: 0,
  axial: 0,
  swing: 0,
  out: 0,
  outRise: 0,
  frames: 0,
  worstAt: "-",
  worstBy: 0,
  restBy: 0,
  restAt: "-",
}));
for (const r of rows) {
  for (let k = 0; k < r.worst.length; k++) {
    const a = agg[k];
    const w = r.worst[k];
    const s = a.j.spec;
    a.hyper = Math.max(a.hyper, Number.isFinite(w.flexLo) ? -w.flexLo : 0);
    a.flex = Math.max(a.flex, Number.isFinite(w.flexHi) ? w.flexHi : 0);
    a.abd = Math.max(a.abd, w.abd);
    a.axial = Math.max(a.axial, w.axial);
    a.swing = Math.max(a.swing, w.swing);
    a.out += w.out;
    a.outRise += w.outRise;
    a.frames += w.frames;
    // How far past its own envelope this fall took it, in degrees — the one
    // number the rows can be ranked on.
    let by = 0;
    if (s.axial !== undefined) by = Math.max(by, w.axial - s.axial);
    if (a.j.hinge) {
      if (s.abd !== undefined) by = Math.max(by, w.abd - s.abd);
      by = Math.max(by, -w.flexLo - s.a, w.flexHi - (s.b ?? Math.PI));
    }
    if (by > a.worstBy) {
      a.worstBy = by;
      a.worstAt = `${r.name} @ ${r.fps}`;
    }
    // …and the same question for the pose he was left lying in.
    let rest = 0;
    if (s.axial !== undefined) rest = Math.max(rest, Math.abs(w.restAxial) - s.axial);
    if (a.j.hinge) {
      if (s.abd !== undefined) rest = Math.max(rest, Math.abs(w.restAbd) - s.abd);
      rest = Math.max(rest, -w.restFlex - s.a, w.restFlex - (s.b ?? Math.PI));
    }
    if (rest > a.restBy) {
      a.restBy = rest;
      a.restAt = `${r.name} @ ${r.fps}`;
    }
  }
}
agg.sort((x, y) => y.worstBy - x.worstBy);

console.log("");
console.log(
  `WORST JOINT EXCURSIONS — ${rows.length} falls (${CASES.length + STREET.length} cases × ${RATES.length} rates), ranked by how far past the envelope`,
);
console.log(
  "joint".padEnd(16),
  "role".padEnd(9),
  "hyper".padStart(7),
  "fold".padStart(7),
  "abd".padStart(7),
  "axial".padStart(7),
  "swing".padStart(7),
  "past by".padStart(8),
  "at rest".padStart(8),
  "out%".padStart(6),
  "rise%".padStart(6),
  "worst case",
);
console.log("-".repeat(140));
for (const a of agg) {
  // `hyper`, `fold` and `abd` are HINGE readings and are left blank on everything
  // else on purpose. A ball joint has no hinge plane, so a "fold about the lateral
  // axis" on a hip is a number with no anatomy behind it — printing one would be
  // this file inventing a defect. What a ball joint is judged on is `axial` and
  // (in `ragdoll-drop`) its cone.
  const hinged = a.j.hinge;
  console.log(
    a.j.name.padEnd(16),
    a.j.role.padEnd(9),
    (hinged ? `${f(a.hyper * DEG)}°` : "—").padStart(7),
    (hinged ? `${f(a.flex * DEG)}°` : "—").padStart(7),
    (hinged ? `${f(a.abd * DEG)}°` : "—").padStart(7),
    `${f(a.axial * DEG)}°`.padStart(7),
    `${f(a.swing * DEG)}°`.padStart(7),
    `${f(a.worstBy * DEG)}°`.padStart(8),
    `${f(a.restBy * DEG)}°`.padStart(8),
    `${f((100 * a.out) / Math.max(1, a.frames))}%`.padStart(6),
    `${f((100 * a.outRise) / Math.max(1, a.frames))}%`.padStart(6),
    a.worstBy > 0 ? a.worstAt : "",
  );
}

const bad = agg.filter((a) => a.worstBy > 0);
const badRest = agg.filter((a) => a.restBy > 0);
const badFrames = agg.reduce((s, a) => s + a.out, 0);
const allFrames = agg.reduce((s, a) => s + a.frames, 0);
const riseFrames = agg.reduce((s, a) => s + a.outRise, 0);
console.log("");
console.log(
  `${bad.length}/${agg.length} joints leave their envelope at some instant · ${badFrames} of ${allFrames} joint-frames outside it (${f((100 * badFrames) / Math.max(1, allFrames), 2)}%)`,
);
console.log(
  `${riseFrames} of those ${badFrames} are during the stand-up (${f((100 * riseFrames) / Math.max(1, badFrames))}% — the hand-back, not the tumble)`,
);
console.log("");

// ---------------------------------------------------------------------------
// pass marks
// ---------------------------------------------------------------------------
//
// Two, because they are two different claims and the second one is the one the
// player made.
//
// · **AT REST** — the pose he is left lying in, which he looks at for the better
//   part of a second before the get-up starts. This is the claim: no joint is
//   outside a body's own range in it, on any fall, at any frame rate. Half a
//   degree is floating-point slack on a stop that is holding exactly.
// · **AT ANY INSTANT** — the worst single frame of a tumble. This is deliberately
//   loose, and loose for a stated reason rather than a tuned one: a limb 25° out
//   of plane for three frames of an 18 m/s slam is a body taking a hit, and the
//   fall is supposed to look like it hurt. What it must not be is a joint going
//   THROUGH, so the bar is set above what the shipped solver reaches and far below
//   what a missing stop reads.
//
// WATCHED FAILING, which is the only thing that makes either of them an assertion.
// Two breaks, two sets of real numbers:
//
// · **The `abd` and `axial` entries taken out of `ragdoll.ts`'s `LIMITS`** — which
//   turns off the roll stop and the abduction band and leaves everything else in
//   place. Same 300 falls: **139.4° past at the worst instant and 139.4° past AT
//   REST**, red on 17 of 17 joints, 7.06% of all joint frames outside a body's
//   range against 3.37% now. The at-rest number is the one that matters — that is
//   a sole facing backwards off an ankle that has not moved, held, in the pose the
//   player is looking at.
// · **The whole round reverted** — the solver as it shipped into this work,
//   measured on the 54-case batch this file started with (the six extreme-impulse
//   cases were added afterwards, so the two are not the same 300 rows): **172.1°
//   past at the worst instant**, 15 of 17 joints out, and **21.02%** of all joint
//   frames outside. Per joint that build read 177.1° of knee hyperextension, 93.8°
//   of knee out-of-plane, and 179.9° of shin, 180.0° of ankle, 179.9° of hip and
//   179.7° of spine ROLL off the bind pose.
const REST_BAR = 0.5 / DEG;
const PEAK_BAR = 35 / DEG;
const restWorst = Math.max(0, ...agg.map((x) => x.restBy));
const peakWorst = Math.max(0, ...agg.map((x) => x.worstBy));
const restBad = agg.filter((a) => a.restBy > REST_BAR);
const peakBad = agg.filter((a) => a.worstBy > PEAK_BAR);
const line = (ok, label, text) => console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${text}`);
line(
  restBad.length === 0,
  "no joint is outside its own range in the pose he is left lying in",
  `worst ${f(restWorst * DEG, 2)}° past of ${f(REST_BAR * DEG, 1)}° allowed${restBad.length ? ` — ${restBad.map((a) => `${a.j.name} ${f(a.restBy * DEG)}° (${a.restAt})`).join(" · ")}` : ""}`,
);
line(
  peakBad.length === 0,
  "…and nothing goes THROUGH one at any instant of any fall",
  `worst ${f(peakWorst * DEG)}° past of ${f(PEAK_BAR * DEG, 0)}° allowed${peakBad.length ? ` — ${peakBad.map((a) => `${a.j.name} ${f(a.worstBy * DEG)}° (${a.worstAt})`).join(" · ")}` : ""}`,
);
console.log("");
if (restBad.length > 0 || peakBad.length > 0) process.exitCode = 1;
