// rigs.js — the genex motion retarget formulas (AG-823, vendored by
// `genex motion install`): load an avatar and retarget ARDY CoreSkeleton27
// locals onto it. THIS FILE IS YOURS — the formulas are meant to be read and
// tuned in-place; the shipped versions were verified to 0.0-0.3° (VRM) /
// 0.0-0.4° (Meshy/Mixamo GLB) bone-direction error. Two transport formulas:
//
//  VRM (three-vrm normalized bones) — normalized bones rest at IDENTITY world
//    orientation, but after rotateVRM0 the whole rig lives in a frame yawed 180°
//    about Y. Transport is frame CONJUGATION per local: q' = M·L·M⁻¹ (M = Y180 —
//    negate quat x,z), root local = G·M, plus the rest-correction sandwich
//    C0(parent)⁻¹ · q' · C0(bone). Unmapped ARDY joints (Spine3, hand ends) fold
//    into the nearest mapped descendant by composing locals down the chain.
//
//  Mixamo (real GLB skeletons — Meshy/Mixamo characters) — joints rest at
//    arbitrary NON-identity orientations (bones point along +Y of their own local
//    frame) and the hierarchy can differ from ARDY's (3-bone spine, no hand ends),
//    so locals can't transport bone-by-bone. Transport the WORLD rotation instead:
//    ARDY rest orientations are identity, so the source FK world rotation D(j) IS
//    the delta from rest. Target bone world goal:  W(b) = D(j) · A(b) · Wrest(b),
//    where A(b) is the constant rest alignment (avatar bind bone direction →
//    ARDY rest bone direction, minimal arc — this is what absorbs an A-pose bind);
//    locals recover top-down:  L(b) = W(parentBone)⁻¹ · W(b).  Unmapped source
//    joints fold in automatically through the FK product, and unmapped TARGET
//    nodes between bones keep their bind locals (relRest). Frame transport is
//    identity — ARDY and glTF characters both face +Z with left = +X.
//
// Verification stays non-circular for both: pages compare scene-graph bone
// directions (geoNode) against the npz posed_joints via rig.dirErrors().

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { capRigTextures } from "../controllers/quality/texture-cap.ts";

const CORE_TO_VRM = {
  Hips: "hips", Spine: "spine", Spine1: "chest", Spine2: "upperChest",
  Neck: "neck", Head: "head",
  RightShoulder: "rightShoulder", RightArm: "rightUpperArm", RightForeArm: "rightLowerArm", RightHand: "rightHand",
  LeftShoulder: "leftShoulder", LeftArm: "leftUpperArm", LeftForeArm: "leftLowerArm", LeftHand: "leftHand",
  RightUpLeg: "rightUpperLeg", RightLeg: "rightLowerLeg", RightFoot: "rightFoot", RightToeBase: "rightToes",
  LeftUpLeg: "leftUpperLeg", LeftLeg: "leftLowerLeg", LeftFoot: "leftFoot", LeftToeBase: "leftToes",
};

// full-resolution primary chain in ARDY joint names; rest correction and metric
// segments resolve through unmapped joints by walking this until a mapped one
const PRIMARY_NEXT = {
  Hips: null,
  Spine: "Spine1", Spine1: "Spine2", Spine2: "Spine3", Spine3: "Neck",
  Neck: "Head", Head: null,
  RightShoulder: "RightArm", RightArm: "RightForeArm", RightForeArm: "RightHand",
  RightHand: "RightHandEnd", RightHandEnd: null, RightHandThumb1: null,
  LeftShoulder: "LeftArm", LeftArm: "LeftForeArm", LeftForeArm: "LeftHand",
  LeftHand: "LeftHandEnd", LeftHandEnd: null, LeftHandThumb1: null,
  RightUpLeg: "RightLeg", RightLeg: "RightFoot", RightFoot: "RightToeBase", RightToeBase: null,
  LeftUpLeg: "LeftLeg", LeftLeg: "LeftFoot", LeftFoot: "LeftToeBase", LeftToeBase: null,
};

// Mixamo/Meshy bone-name aliases (normalized: lowercase, mixamorig prefix and
// non-alphanumerics stripped). Spine bones are matched STRUCTURALLY, never by
// name — Meshy names its lowest spine bone "Spine02" and its highest "Spine".
const MIXAMO_ALIASES = {
  Hips: ["hips", "pelvis"],
  Neck: ["neck", "neck01", "neck1"],
  Head: ["head"],
  LeftShoulder: ["leftshoulder", "leftclavicle"], RightShoulder: ["rightshoulder", "rightclavicle"],
  LeftArm: ["leftarm", "leftupperarm"], RightArm: ["rightarm", "rightupperarm"],
  LeftForeArm: ["leftforearm", "leftlowerarm"], RightForeArm: ["rightforearm", "rightlowerarm"],
  LeftHand: ["lefthand"], RightHand: ["righthand"],
  LeftUpLeg: ["leftupleg", "leftupperleg", "leftthigh"], RightUpLeg: ["rightupleg", "rightupperleg", "rightthigh"],
  LeftLeg: ["leftleg", "leftlowerleg", "leftcalf", "leftshin"], RightLeg: ["rightleg", "rightlowerleg", "rightcalf", "rightshin"],
  LeftFoot: ["leftfoot"], RightFoot: ["rightfoot"],
  LeftToeBase: ["lefttoebase", "lefttoe", "lefttoes"], RightToeBase: ["righttoebase", "righttoe", "righttoes"],
};
const SPINE_SLOTS = ["Spine", "Spine1", "Spine2", "Spine3"];
const normName = s => s.toLowerCase().replace(/^mixamorig\d*[:_]?/, "").replace(/[^a-z0-9]/g, "");

class RigBase {
  constructor(gltf, base, kind) {
    this.gltf = gltf;
    this.gltfScene = gltf.scene;
    this.base = base;               // { joints, parents, restPositions, hipsRestY }
    this.kind = kind;
    this.missing = [];
    this._qT = new THREE.Quaternion();
    this._qA = new THREE.Quaternion();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this.gltfScene.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; });
  }

  // subclass fills nodeOf[] first; derives the shared fold/segment structure
  finishSetup() {
    const { joints, parents } = this.base;
    const J = joints.length;
    this.mapped = [];
    for (let j = 0; j < J; j++) if (this.animNode(j)) this.mapped.push(j);
    this.mappedAncestor = {}; this.chainFor = {};
    for (const j of this.mapped) {
      const seg = [j];
      let p = parents[j];
      while (p !== -1 && !this.animNode(p)) { seg.unshift(p); p = parents[p]; }
      this.chainFor[j] = seg;
      this.mappedAncestor[j] = p;   // -1 for hips
    }
    this.primaryOf = {};            // j -> first MAPPED joint down the primary chain, or -1
    for (const j of this.mapped) {
      let n = PRIMARY_NEXT[joints[j]], res = -1;
      while (n) {
        const idx = joints.indexOf(n);
        if (idx >= 0 && this.animNode(idx)) { res = idx; break; }
        n = PRIMARY_NEXT[n];
      }
      this.primaryOf[j] = res;
    }
    // metric segments between mapped joints; "primary" = the parent bone's own
    // direction (controllable); the rest are attachment offsets = body shape
    this.segs = []; this.segPrimary = [];
    for (const j of this.mapped) {
      const a = this.mappedAncestor[j];
      if (a < 0) continue;
      this.segs.push([a, j]);
      this.segPrimary.push(this.primaryOf[a] === j);
    }
  }

  // drive the real pipeline with identity locals (corr off); whatever pose the
  // scene lands in is the avatar's effective rest — align each bone direction
  // onto ARDY's rest direction. Leaves the probe pose applied so callers can
  // measure rest-pose deltas right after.
  computeCorrection() {
    this.applyFrame((k, out) => out.identity(), false);
    this.setHipsFromArdy(0, this.base.hipsRestY, 0);
    this.update(0);
    this.scene.updateMatrixWorld(true);
    const probe = {};
    for (const j of this.mapped) probe[j] = this.geoNode(j).getWorldPosition(new THREE.Vector3());
    const { joints, restPositions: rp } = this.base;
    const dV = new THREE.Vector3(), dA = new THREE.Vector3();
    this.corr = {};
    const table = [];
    for (const j of this.mapped) {  // ascending = parents before children
      if (joints[j] === "Hips") { this.corr[j] = new THREE.Quaternion(); continue; }
      const cj = this.primaryOf[j];
      if (cj < 0) {                 // leaf: inherit the parent's twist frame
        this.corr[j] = (this.corr[this.mappedAncestor[j]] ?? new THREE.Quaternion()).clone();
        continue;
      }
      dV.copy(probe[cj]).sub(probe[j]).normalize();
      this.mapDir(rp[cj][0] - rp[j][0], rp[cj][1] - rp[j][1], rp[cj][2] - rp[j][2], dA);
      this.corr[j] = new THREE.Quaternion().setFromUnitVectors(dV, dA);
      table.push([`${joints[j]}→${joints[cj]}`, +(dV.angleTo(dA) * 180 / Math.PI).toFixed(1)]);
    }
    return table.sort((a, b) => b[1] - a[1]);
  }

  applyFrame(readLocal, corr) {
    this.retargetFrame(readLocal, corr, (j, q) => this.animNode(j).quaternion.copy(q));
  }

  // one THREE.AnimationClip from an ARDY clip { fps, localQuat[F][27][4], rootPos[F][3] }
  buildClip(c, name, corr) {
    const F = c.localQuat.length;
    const times = new Float32Array(F).map((_, i) => i / c.fps);
    const vals = {};
    for (const j of this.mapped) vals[j] = new Float32Array(F * 4);
    const pos = new Float32Array(F * 3);
    for (let f = 0; f < F; f++) {
      this.retargetFrame((k, out) => out.fromArray(c.localQuat[f][k]), corr,
                         (j, q) => q.toArray(vals[j], f * 4));
      const r = c.rootPos[f];
      this.hipsLocalFromArdy(r[0], r[1], r[2], this._v);
      pos[f * 3] = this._v.x; pos[f * 3 + 1] = this._v.y; pos[f * 3 + 2] = this._v.z;
    }
    const tracks = [];
    for (const j of this.mapped)
      tracks.push(new THREE.QuaternionKeyframeTrack(`${this.animNode(j).name}.quaternion`, times, vals[j]));
    tracks.push(new THREE.VectorKeyframeTrack(`${this.animNode(0).name}.position`, times, pos));
    return new THREE.AnimationClip(`ardy:${name}`, F / c.fps, tracks);
  }

  // THE honest metric: scene-graph bone directions vs ARDY posed_joints (one frame)
  dirErrors(positionsFrame) {
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), tb = new THREE.Vector3();
    const { joints } = this.base;
    const rows = [];
    for (let i = 0; i < this.segs.length; i++) {
      const [a, b] = this.segs[i];
      this.geoNode(a).getWorldPosition(va);
      this.geoNode(b).getWorldPosition(vb);
      vb.sub(va).normalize();
      const pa = positionsFrame[a], pb = positionsFrame[b];
      this.mapDir(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2], tb);
      rows.push([`${joints[a]}→${joints[b]}`, vb.angleTo(tb) * 180 / Math.PI, this.segPrimary[i]]);
    }
    return rows;
  }
}

// ---------------------------------------------------------------- VRM adapter
const Y180 = new THREE.Quaternion(0, 1, 0, 0);
const conjY180 = q => { q.x = -q.x; q.z = -q.z; return q; };

class VrmRig extends RigBase {
  constructor(gltf, vrm, base) {
    super(gltf, base, "vrm");
    this.vrm = vrm;
    VRMUtils.rotateVRM0(vrm); // no-op for VRM 1.x models
    const { joints } = base;
    this._anim = {}; this._geo = {};
    for (let j = 0; j < joints.length; j++) {
      const bn = CORE_TO_VRM[joints[j]];
      if (!bn) continue; // hand ends / Spine3: no VRM slot by design
      const n = vrm.humanoid.getNormalizedBoneNode(bn);
      if (!n) { this.missing.push(`${joints[j]}→${bn}`); continue; }
      this._anim[j] = n;
      this._geo[j] = vrm.humanoid.getRawBoneNode(bn);
    }
    this.finishSetup();
    this.hipsNode = this._anim[0];
    this.hipsRestLocal = this.hipsNode.position.clone();
  }

  readRest() { // after scene add: rest world hip height fixes the scale ratio
    const w = this.hipsNode.getWorldPosition(new THREE.Vector3());
    this.hipRatio = w.y / this.base.hipsRestY;
  }

  animNode(j) { return this._anim[j] ?? null; }
  geoNode(j) { return this._geo[j] ?? null; }
  update(dt) { this.vrm.update(dt); }

  // scene frame = ARDY frame yawed 180° about Y (mirror x,z)
  mapPoint(p, out) {
    return out.set(-p[0] * this.hipRatio - this.hipsRestLocal.x,
                   this.hipsRestLocal.y + (p[1] - this.base.hipsRestY) * this.hipRatio,
                   -p[2] * this.hipRatio - this.hipsRestLocal.z);
  }
  mapDir(dx, dy, dz, out) { return out.set(-dx, dy, -dz).normalize(); }

  // hips local = M⁻¹·world_target with the rig root carrying M — so unmirrored
  hipsLocalFromArdy(x, y, z, out) {
    return out.set(this.hipsRestLocal.x + x * this.hipRatio,
                   this.hipsRestLocal.y + (y - this.base.hipsRestY) * this.hipRatio,
                   this.hipsRestLocal.z + z * this.hipRatio);
  }
  setHipsFromArdy(x, y, z) { this.hipsNode.position.copy(this.hipsLocalFromArdy(x, y, z, this._v)); }

  retargetFrame(readLocal, corr, emit) {
    for (const j of this.mapped) {
      const q = this._q.identity();
      for (const k of this.chainFor[j]) q.multiply(readLocal(k, this._qT));
      if (this.mappedAncestor[j] === -1) {
        q.multiply(Y180);                          // root: q = G·M (rig root carries M)
      } else {
        conjY180(q);                               // transport the local into the scene frame
        if (corr) {
          q.premultiply(this._qA.copy(this.corr[this.mappedAncestor[j]]).invert());
          q.multiply(this.corr[j]);
        }
      }
      emit(j, q);
    }
  }
}

// ------------------------------------------------------------- Mixamo adapter
class MixamoRig extends RigBase {
  constructor(gltf, base) {
    super(gltf, base, "mixamo");
    const { joints } = base;
    const J = joints.length;

    // scan the skeleton by normalized names (spines matched structurally below)
    const byNorm = {};
    this.gltfScene.traverse(o => { if (o.name) byNorm[normName(o.name)] ??= o; });
    const bones = {}; // ARDY joint name -> node
    for (const [core, aliases] of Object.entries(MIXAMO_ALIASES)) {
      for (const a of aliases) if (byNorm[a]) { bones[core] = byNorm[a]; break; }
    }
    if (!bones.Hips || !bones.LeftUpLeg || !bones.RightUpLeg)
      throw new Error(`mixamo rig scan failed: hips/legs not found (have: ${Object.keys(bones).join(",")})`);

    // spine chain = nodes strictly between neck (or head) and hips, hips-adjacent
    // first; ends-anchored assignment onto ARDY's four spine slots
    const top = bones.Neck ?? bones.Head;
    const chain = [];
    for (let p = top?.parent, i = 0; p && p !== bones.Hips && i < 10; p = p.parent, i++) chain.unshift(p);
    if (top && chain.length && chain[0].parent === bones.Hips) {
      const n = chain.length;
      chain.forEach((node, i) => {
        const slot = SPINE_SLOTS[n === 1 ? 3 : Math.round(i * (SPINE_SLOTS.length - 1) / (n - 1))];
        bones[slot] ??= node;
      });
    }

    this._anim = {};
    for (let j = 0; j < J; j++) {
      if (bones[joints[j]]) this._anim[j] = bones[joints[j]];
      else if (MIXAMO_ALIASES[joints[j]]) this.missing.push(joints[j]); // spines/hand-ends: expected to fold
    }
    this.finishSetup();
    this.hipsNode = this._anim[0];
  }

  readRest() { // scene-added + updated: the default pose IS the bind pose (asserted offline)
    const J = this.base.joints.length;
    this.restWorld = {}; this.parentBone = {}; this.relRest = {}; this.parentStatic = {};
    const isBoneNode = new Set(this.mapped.map(j => this._anim[j]));
    for (const j of this.mapped) {
      const node = this._anim[j];
      this.restWorld[j] = node.getWorldQuaternion(new THREE.Quaternion());
      // nearest mapped ancestor on the TARGET side + the static bind rotation of
      // any unmapped nodes in between
      const stack = [];
      let p = node.parent;
      while (p && !isBoneNode.has(p)) { stack.unshift(p); p = p.parent; }
      if (p) {
        this.parentBone[j] = this.mapped.find(k => this._anim[k] === p);
        const rel = new THREE.Quaternion();
        for (const s of stack) rel.multiply(s.quaternion);
        this.relRest[j] = rel;
        if (this.parentBone[j] >= j) console.warn(`mixamo rig: ${this.base.joints[j]} parent order anomaly`);
      } else { // hips: everything above is static scenery (Armature etc.)
        this.parentBone[j] = -1;
        this.parentStatic[j] = node.parent.getWorldQuaternion(new THREE.Quaternion());
      }
    }
    this.hipsRestWorld = this.hipsNode.getWorldPosition(new THREE.Vector3());
    this.hipRatio = this.hipsRestWorld.y / this.base.hipsRestY;
    this._hipsParentInv = this.hipsNode.parent.matrixWorld.clone().invert(); // static
    this._D = Array.from({ length: J }, () => new THREE.Quaternion());
    this._W = {};
    for (const j of this.mapped) this._W[j] = new THREE.Quaternion();
    this._qP = new THREE.Quaternion();
  }

  animNode(j) { return this._anim[j] ?? null; }
  geoNode(j) { return this._anim[j] ?? null; }
  update() {}

  // scene frame == ARDY frame (both face +Z, left = +X), anchored at the bind hips
  mapPoint(p, out) {
    return out.set(this.hipsRestWorld.x + p[0] * this.hipRatio,
                   this.hipsRestWorld.y + (p[1] - this.base.hipsRestY) * this.hipRatio,
                   this.hipsRestWorld.z + p[2] * this.hipRatio);
  }
  mapDir(dx, dy, dz, out) { return out.set(dx, dy, dz).normalize(); }

  hipsLocalFromArdy(x, y, z, out) {
    this.mapPoint([x, y, z], out);
    return out.applyMatrix4(this._hipsParentInv); // world → armature-local (cm)
  }
  setHipsFromArdy(x, y, z) { this.hipsNode.position.copy(this.hipsLocalFromArdy(x, y, z, this._v)); }

  retargetFrame(readLocal, corr, emit) {
    const { parents } = this.base;
    const J = parents.length;
    for (let k = 0; k < J; k++) {  // source FK: D = world rotation = delta from rest
      const p = parents[k];
      if (p === -1) this._D[k].copy(readLocal(k, this._qT));
      else this._D[k].copy(this._D[p]).multiply(readLocal(k, this._qT));
    }
    for (const j of this.mapped) { // ascending: parents emitted before children
      const W = this._W[j].copy(this._D[j]);
      if (corr) W.multiply(this.corr[j]);
      W.multiply(this.restWorld[j]);
      const pb = this.parentBone[j];
      if (pb === -1) this._qP.copy(this.parentStatic[j]);
      else this._qP.copy(this._W[pb]).multiply(this.relRest[j]);
      emit(j, this._qP.invert().multiply(W));
    }
  }
}

// -------------------------------------------------------------------- loader
export async function loadRig(url, base, scene) {
  if (base.joints[0] !== "Hips") throw new Error("ARDY joint 0 must be Hips");
  const loader = new GLTFLoader();
  loader.register(p => new VRMLoaderPlugin(p));
  const gltf = await loader.loadAsync(url);
  // The rig ships ONE 4096x4096 uncompressed sRGB texture — 85.33 MB with its
  // mip chain, and measured, the largest single allocation in the whole game.
  // It also bypasses every rung mechanism, because `loadRig` builds its own
  // GLTFLoader; and there is no rung to ask for even if it didn't —
  // `rigged-character.glb@1024` is a 404, checked, and the fallback would serve
  // the 8192x4096 original, which is worse than doing nothing.
  //
  // So phone tiers redraw it at 1024 BEFORE it is uploaded. Desktop tiers get
  // the argument back untouched — the cap is a no-op unless `isPhoneTier(tier)`,
  // which is name-tested, so the three desktop rows cannot reach it by
  // construction. Measured on phone-low: 197.73 MB -> 117.73 MB.
  //
  // It goes through `capRigTextures` rather than assembling the tier and the
  // ceiling here, because this was not the only place in the game that parses a
  // rig GLB and it WAS the only place that capped — see that function.
  capRigTextures(gltf.scene, url);
  const rig = gltf.userData.vrm ? new VrmRig(gltf, gltf.userData.vrm, base)
                                : new MixamoRig(gltf, base);
  scene.add(gltf.scene);
  scene.updateMatrixWorld(true);
  rig.scene = scene;
  rig.readRest();
  return rig;
}

// ===========================================================================
// LOAD-TIME PER-RIG NORMALIZATIONS (AG-823 §7.3 — the walker.glb session).
// All four are rigid frame-convention fixes in the allowed op class: constant
// per rig+set, zero joint-vs-joint edits. Call order matters:
//
//   const rig = await loadRig(url, set, scene);
//   rig.computeCorrection();
//   const restAnkle = captureRestAnkle(rig, scene);      // BEFORE any clip
//   reanchorFeet(rig, set, scene);                       // BEFORE ClipSet
//   const clipSet = new ClipSet(rig, set, set.gaits);
//   groundCalibrate(rig, clipSet, scene, restAnkle);     // AFTER ClipSet
//   curlFingers(rig, scene);                             // once, at load
// ===========================================================================

/**
 * REST-pose ankle baseline, captured in BIND pose before any clip plays.
 * Settling into the current idle instead would let a floating idle calibrate
 * its own defect away (the marine lesson). `rootY` = the character root's
 * world Y at capture time (0 for a root still at the origin).
 */
export function captureRestAnkle(rig, scene, rootY = 0) {
  scene.updateMatrixWorld(true);
  const f = new THREE.Vector3(), g = new THREE.Vector3();
  const jr = rig.base.joints.indexOf("RightFoot"), jl = rig.base.joints.indexOf("LeftFoot");
  rig.geoNode(jr).getWorldPosition(f);
  rig.geoNode(jl).getWorldPosition(g);
  return Math.min(f.y, g.y) - rootY;
}

/**
 * FOOT-PITCH re-anchor + rigid-boot toe (mixamo rigs only). corr aligns the
 * foot's bind direction onto ARDY's rest direction, so a planted foot plays
 * at ARDY's foot pitch (27°); a steep-boot rig (walker: 42°, ankle 15 cm
 * above the sole vs ARDY's 6.7 cm) then carries its front sole in the air.
 * For FEET the rig's bind pitch IS ground truth (the sole is authored flat),
 * so fold the constant pitch difference back into the corr slot:
 * corr' = D⁻¹·R·D·corr, measured on the set's idle frame 0 (pitch only,
 * heading stays ARDY's). Then lock the toe bone to the foot at its bind
 * offset (corr[toe] = Dt⁻¹·D·corr[foot]) — a boot doesn't bend at the ball,
 * and ARDY's toe-flex delta would tip the mesh under the floor.
 */
export function reanchorFeet(rig, set, scene) {
  const idle = (set.gaits ?? set.clips)?.idle;
  if (rig.kind !== "mixamo" || !idle) return;
  const { joints, parents } = rig.base;
  const upV = new THREE.Vector3(0, 1, 0);
  for (const [fN, tN] of [["LeftFoot", "LeftToeBase"], ["RightFoot", "RightToeBase"]]) {
    const jf = joints.indexOf(fN), jt = joints.indexOf(tN);
    const fNode = jf >= 0 ? rig.geoNode(jf) : null, tNode = jt >= 0 ? rig.geoNode(jt) : null;
    if (!fNode || !tNode || tNode.parent !== fNode || !rig.restWorld?.[jf]) continue;
    // bind ankle→toe direction = bind world rotation · toe's local offset
    const bindDir = tNode.position.clone().applyQuaternion(rig.restWorld[jf]).normalize();
    // retarget idle frame 0 with the current corr and measure the live direction
    rig.applyFrame((k, out) => out.fromArray(idle.localQuat[0][k]), true);
    rig.setHipsFromArdy(idle.hipsPos[0][0], idle.hipsPos[0][1], idle.hipsPos[0][2]);
    rig.update(0);
    scene.updateMatrixWorld(true);
    const pa = fNode.getWorldPosition(new THREE.Vector3());
    const cur = tNode.getWorldPosition(new THREE.Vector3()).sub(pa).normalize();
    // target: keep the take's heading, restore the bind pitch
    const bindPitch = Math.asin(THREE.MathUtils.clamp(bindDir.y, -1, 1));
    const h = cur.clone().addScaledVector(upV, -cur.y).normalize();
    const target = h.multiplyScalar(Math.cos(bindPitch)).addScaledVector(upV, Math.sin(bindPitch));
    const theta = cur.angleTo(target);
    if (theta < 0.05) continue; // <3°: rig and ARDY already agree
    const R = new THREE.Quaternion().setFromUnitVectors(cur, target);
    const D = new THREE.Quaternion(), qk = new THREE.Quaternion();
    const chain = [];
    for (let p = jf; p !== -1; p = parents[p]) chain.unshift(p);
    for (const k of chain) D.multiply(qk.fromArray(idle.localQuat[0][k]));
    rig.corr[jf].premultiply(new THREE.Quaternion().copy(D).invert().multiply(R).multiply(D));
    const Dt = new THREE.Quaternion();
    const chainT = [];
    for (let p = jt; p !== -1; p = parents[p]) chainT.unshift(p);
    for (const k of chainT) Dt.multiply(qk.fromArray(idle.localQuat[0][k]));
    rig.corr[jt] = new THREE.Quaternion().copy(Dt).invert().multiply(D).multiply(rig.corr[jf]);
    console.log(`[motion] ${fN}: pitch re-anchored to bind by ${(theta * 180 / Math.PI).toFixed(1)}° + rigid-boot toe`);
  }
}

/**
 * Per-rig GROUND CALIBRATION: hips Y is ARDY-absolute scaled by hipRatio,
 * which assumes the rig shares ARDY's hips:leg proportions. A rig with
 * proportionally shorter legs (walker.glb) hangs its feet above the floor on
 * EVERY clip. Rigid fix: play the idle through the real retarget path,
 * measure its lowest ankle vs the BIND-pose ankle (captureRestAnkle), and
 * shift every track's hips Y by the difference — one constant per rig+set,
 * no-op (<4 mm) on well-proportioned rigs. Call AFTER ClipSet construction.
 */
export function groundCalibrate(rig, clipSet, scene, restAnkle, rootY = 0) {
  const joints = rig.base.joints;
  const LFOOT = joints.indexOf("LeftFoot"), RFOOT = joints.indexOf("RightFoot");
  const ref = clipSet.tracks.idle ?? clipSet.tracks.stance ?? Object.values(clipSet.tracks)[0];
  if (!ref || LFOOT < 0 || RFOOT < 0) return;
  const v = new THREE.Vector3();
  let minY = Infinity;
  for (let f = 0; f < ref.F; f++) {
    for (const j of rig.mapped) rig.animNode(j).quaternion.fromArray(ref.quat[j], f * 4);
    rig.setHipsFromArdy(ref.hips[f * 3], ref.hips[f * 3 + 1], ref.hips[f * 3 + 2]);
    rig.update(0);
    scene.updateMatrixWorld(true);
    for (const jf of [LFOOT, RFOOT]) {
      rig.geoNode(jf).getWorldPosition(v);
      minY = Math.min(minY, v.y - rootY);
    }
  }
  const delta = minY - restAnkle;
  if (Math.abs(delta) > 0.004) {
    const dArdy = delta / rig.hipRatio;
    for (const t of Object.values(clipSet.tracks))
      for (let f = 0; f < t.F; f++) t.hips[f * 3 + 1] -= dArdy;
    console.log(`[motion] ground-cal: idle ankle ${(delta * 100).toFixed(1)} cm off bind ankle — hips shifted for this rig`);
  }
}

/**
 * GRIP CURL: ARDY's skeleton has no fingers, so retargeted rigs keep their
 * REST hands — splayed-open fingers "holding" a weapon. Curl whatever finger
 * bones the rig actually has, once at load (nothing animates fingers, so it
 * sticks). The curl axis is the knuckle line; its SIGN is probed per hand
 * (closing a finger brings its tip toward the wrist — rig conventions vary).
 * Mitten/finger-less hands (walker.glb) are left alone: prefer weapon-carry
 * looks that read well with flat hands on such rigs.
 */
export function curlFingers(rig, scene) {
  const joints = rig.base.joints;
  const RHAND = joints.indexOf("RightHand"), LHAND = joints.indexOf("LeftHand");
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _hp = new THREE.Vector3();
  const _t0 = new THREE.Vector3(), _cw = new THREE.Quaternion();
  const _cp2 = new THREE.Quaternion(), _cx = new THREE.Quaternion();
  const tipOf = (b) => { let n = b; while (n.children.length) n = n.children[0]; return n; };
  const rotWorld = (bone, axis, ang) => {
    _cx.setFromAxisAngle(axis, ang);
    bone.getWorldQuaternion(_cw).premultiply(_cx);
    bone.parent.getWorldQuaternion(_cp2).invert();
    bone.quaternion.copy(_cp2.multiply(_cw));
    bone.updateMatrixWorld(true);
  };
  for (const handJ of [RHAND, LHAND]) {
    const hand = rig.animNode(handJ);
    if (!hand) continue;
    let roots = hand.children.filter((c) => c.isBone);
    if (!roots.length) roots = [...hand.children];
    roots = roots.filter((c) => !/thumb/i.test(c.name));
    if (roots.length < 2) continue; // mitten hand
    roots[0].getWorldPosition(_a);
    roots[roots.length - 1].getWorldPosition(_b);
    const axis = _b.clone().sub(_a);
    if (axis.lengthSq() < 1e-8) continue;
    axis.normalize();
    const chain = roots[Math.floor(roots.length / 2)];
    const tip = tipOf(chain);
    hand.getWorldPosition(_hp);
    const saved = chain.quaternion.clone();
    let sign = 1, bestD = Infinity;
    for (const s of [1, -1]) {
      rotWorld(chain, axis, s * 0.9);
      tip.getWorldPosition(_t0);
      const dd = _t0.distanceTo(_hp);
      if (dd < bestD) { bestD = dd; sign = s; }
      chain.quaternion.copy(saved);
      chain.updateMatrixWorld(true);
    }
    axis.multiplyScalar(sign);
    const curl = (bone, depth) => {
      if (depth >= 1 && !/thumb/i.test(bone.name)) {
        rotWorld(bone, axis, [0, 0.5, 0.7, 0.8][Math.min(depth, 3)]);
      }
      for (const c of [...bone.children]) curl(c, depth + 1);
    };
    curl(hand, 0);
  }
  rig.update(0);
  scene.updateMatrixWorld(true);
}
