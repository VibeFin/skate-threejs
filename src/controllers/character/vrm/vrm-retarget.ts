// SPDX-License-Identifier: MIT
// Retarget Quaternius Universal Animation Library clips onto a three-vrm
// normalized humanoid rig (Genex AG-747/AG-775). Two source rigs are supported
// and auto-detected: the free UAL's Blender Rigify `DEF-*` skeleton and the UAL
// Pro's UE-mannequin-style skeleton (`pelvis`/`spine_01`/…) that the bundled
// core library and every CDN animation pack use. Adapted from the
// official three-vrm humanoid retargeting example (@pixiv/three-vrm examples, MIT):
// rewrite each bone track into the VRM's normalized-bone local space using the
// SOURCE rig's rest-pose world rotations, and scale the hips translation by the
// height ratio. Because vrm-loader calls VRMUtils.rotateVRM0, VRM 0.x and 1.0
// share this one path — no per-version flip.
//
// The HIPS POSITION track is kept (delta from the source rest pose, scaled by
// the hips-height ratio, like the upstream recipe). Dropping it pins the hips at
// bind height, so any pose that lowers the hips (idle stance, walk contact,
// punches) lifts the feet off the floor instead — the UAL idle alone holds the
// hips ~4.5 cm below rest. All other position tracks are still dropped: the
// physics controller owns whole-body translation, and UAL clips are in-place,
// so the hips delta is pure pose (crouch/bob/sway), not root motion.
//
// The output AnimationClips target the VRM's normalized bone nodes, so they feed
// CharacterAnimations + buildClipMap unchanged:
//
//   const { scene, vrm } = await loadVrm("./assets/avatar.vrm");
//   const lib = await new GLTFLoader().loadAsync("./assets/animation-library.glb");
//   const clips = retargetClips(vrm, lib.scene, lib.animations);
//   const anims = new CharacterAnimations(scene, clips);
import * as THREE from "three";
import { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { VRM } from "@pixiv/three-vrm";

type VrmBone = (typeof VRMHumanBoneName)[keyof typeof VRMHumanBoneName];

// Quaternius UAL Rigify deform bone -> VRM humanoid bone. Fingers are omitted
// (the clips barely animate them and not every avatar rigs them); the body chain
// is what locomotion + gestures need.
const DEF_TO_VRM: Record<string, VrmBone> = {
  "DEF-hips": VRMHumanBoneName.Hips,
  "DEF-spine.001": VRMHumanBoneName.Spine,
  "DEF-spine.002": VRMHumanBoneName.Chest,
  "DEF-spine.003": VRMHumanBoneName.UpperChest,
  "DEF-neck": VRMHumanBoneName.Neck,
  "DEF-head": VRMHumanBoneName.Head,
  "DEF-shoulder.L": VRMHumanBoneName.LeftShoulder,
  "DEF-upper_arm.L": VRMHumanBoneName.LeftUpperArm,
  "DEF-forearm.L": VRMHumanBoneName.LeftLowerArm,
  "DEF-hand.L": VRMHumanBoneName.LeftHand,
  "DEF-shoulder.R": VRMHumanBoneName.RightShoulder,
  "DEF-upper_arm.R": VRMHumanBoneName.RightUpperArm,
  "DEF-forearm.R": VRMHumanBoneName.RightLowerArm,
  "DEF-hand.R": VRMHumanBoneName.RightHand,
  "DEF-thigh.L": VRMHumanBoneName.LeftUpperLeg,
  "DEF-shin.L": VRMHumanBoneName.LeftLowerLeg,
  "DEF-foot.L": VRMHumanBoneName.LeftFoot,
  "DEF-toe.L": VRMHumanBoneName.LeftToes,
  "DEF-thigh.R": VRMHumanBoneName.RightUpperLeg,
  "DEF-shin.R": VRMHumanBoneName.RightLowerLeg,
  "DEF-foot.R": VRMHumanBoneName.RightFoot,
  "DEF-toe.R": VRMHumanBoneName.RightToes,
};

// Quaternius UAL Pro (UE-mannequin-style skeleton) -> VRM humanoid bone. Bone
// names verified against the UAL1 master GLB ("Head" really is capitalized).
// Fingers are omitted, same policy as the DEF map.
const UE_TO_VRM: Record<string, VrmBone> = {
  pelvis: VRMHumanBoneName.Hips,
  spine_01: VRMHumanBoneName.Spine,
  spine_02: VRMHumanBoneName.Chest,
  spine_03: VRMHumanBoneName.UpperChest,
  neck_01: VRMHumanBoneName.Neck,
  Head: VRMHumanBoneName.Head,
  clavicle_l: VRMHumanBoneName.LeftShoulder,
  upperarm_l: VRMHumanBoneName.LeftUpperArm,
  lowerarm_l: VRMHumanBoneName.LeftLowerArm,
  hand_l: VRMHumanBoneName.LeftHand,
  clavicle_r: VRMHumanBoneName.RightShoulder,
  upperarm_r: VRMHumanBoneName.RightUpperArm,
  lowerarm_r: VRMHumanBoneName.RightLowerArm,
  hand_r: VRMHumanBoneName.RightHand,
  thigh_l: VRMHumanBoneName.LeftUpperLeg,
  calf_l: VRMHumanBoneName.LeftLowerLeg,
  foot_l: VRMHumanBoneName.LeftFoot,
  ball_l: VRMHumanBoneName.LeftToes,
  thigh_r: VRMHumanBoneName.RightUpperLeg,
  calf_r: VRMHumanBoneName.RightLowerLeg,
  foot_r: VRMHumanBoneName.RightFoot,
  ball_r: VRMHumanBoneName.RightToes,
};

/**
 * Pick the source-rig bone map by looking for each rig's hips bone in the
 * scene: `DEF-hips` -> Rigify (free UAL), `pelvis` -> UE-style (UAL Pro).
 * Returns null for unrecognized rigs.
 */
export function detectBoneMap(sourceRoot: THREE.Object3D): Record<string, VrmBone> | null {
  let map: Record<string, VrmBone> | null = null;
  sourceRoot.traverse((object) => {
    if (map !== null) return;
    if (object.name === "DEF-hips") map = DEF_TO_VRM;
    else if (object.name === "pelvis") map = UE_TO_VRM;
  });
  return map;
}

/**
 * Retarget UAL clips onto `vrm`.
 * @param vrm           the loaded VRM (already through {@link loadVrm}).
 * @param animationRoot the animation GLB's scene — its bones in rest pose
 *                      supply the source frame the tracks are relative to.
 * @param clips         that GLB's animations.
 * @param boneMap       source-bone-name -> VRM humanoid bone. Defaults to
 *                      {@link detectBoneMap} on `animationRoot` (Rigify or
 *                      UE-style rigs bind automatically).
 * @returns new clips whose tracks target the VRM's normalized humanoid bones.
 */
export function retargetClips(
  vrm: VRM,
  animationRoot: THREE.Object3D,
  clips: THREE.AnimationClip[],
  boneMap?: Record<string, VrmBone>,
): THREE.AnimationClip[] {
  const sourceToVrm = boneMap ?? detectBoneMap(animationRoot);
  if (sourceToVrm === null) {
    console.warn(
      "[vrm-retarget] unrecognized animation rig (no DEF-hips or pelvis bone found) — returning no clips; pass an explicit boneMap to retargetClips.",
    );
    return [];
  }

  animationRoot.updateWorldMatrix(true, true);
  vrm.scene.updateWorldMatrix(true, true);

  // three's GLTFLoader SANITIZES node names in animation track targets
  // (PropertyBinding strips `[].:/ ` and turns spaces into `_`), so a Rigify bone
  // "DEF-upper_arm.L" shows up in tracks as "DEF-upper_armL". Map those sanitized
  // names back to the real bones, whose actual names carry the dots the map
  // keys on. (Many source rigs are dotless, so the upstream example never needed this.)
  const sanitize = (name: string): string => name.replace(/\s/g, "_").replace(/[[\]./:]/g, "");
  const sourceByTrackName = new Map<string, THREE.Object3D>();
  animationRoot.traverse((o) => {
    if (o.name) sourceByTrackName.set(sanitize(o.name), o);
  });
  // glTF load sanitizes bone names too, so `source.name` is already dot-stripped —
  // key the VRM-bone lookup by the sanitized source name, matching the track's nodeName.
  const sanitizedSourceToVrm: Record<string, VrmBone> = {};
  for (const [src, bone] of Object.entries(sourceToVrm)) sanitizedSourceToVrm[sanitize(src)] = bone;

  // Reusable bind-pose quaternions. Both rigs are at rest here (nothing has
  // animated them yet), so getWorldQuaternion reads the bind pose.
  const srcParentBindWorld = new THREE.Quaternion();
  const srcBindWorldInv = new THREE.Quaternion();
  const tgtBindWorld = new THREE.Quaternion();
  const tgtParentBindWorldInv = new THREE.Quaternion();
  const q = new THREE.Quaternion();

  // Hips-position retarget setup (see the header note). We reproduce the source
  // hips' vertical bob/crouch on the target hips as a rest-relative DELTA, so
  // the physics controller still owns the whole-body base translation while the
  // pose keeps the pelvis (and therefore the feet) at the right height.
  const hipsSourceName = Object.entries(sanitizedSourceToVrm).find(
    ([, bone]) => bone === VRMHumanBoneName.Hips,
  )?.[0];
  const srcHips = (hipsSourceName ? sourceByTrackName.get(hipsSourceName) : undefined) ?? null;
  const tgtHips = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Hips);
  const hipsSrcParentWorld = new THREE.Quaternion();
  const hipsTgtParentWorldInv = new THREE.Quaternion();
  const hipsSrcRestLocal = new THREE.Vector3();
  const hipsTgtRestLocal = new THREE.Vector3();
  let hipsHeightRatio = 1;
  if (srcHips && tgtHips) {
    if (srcHips.parent) srcHips.parent.getWorldQuaternion(hipsSrcParentWorld);
    if (tgtHips.parent) tgtHips.parent.getWorldQuaternion(hipsTgtParentWorldInv).invert();
    hipsSrcRestLocal.copy(srcHips.position);
    hipsTgtRestLocal.copy(tgtHips.position);
    // Scale the crouch/bob by leg-length proportion (hips rest height ratio) so
    // a tall avatar bobs more than a short one, matching the source clip's feel.
    const srcY = srcHips.getWorldPosition(new THREE.Vector3()).y;
    const tgtY = tgtHips.getWorldPosition(new THREE.Vector3()).y;
    if (Math.abs(srcY) > 1e-4) hipsHeightRatio = tgtY / srcY;
  }
  const hipsDelta = new THREE.Vector3();

  const out: THREE.AnimationClip[] = [];
  for (const clip of clips) {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const track of clip.tracks) {
      const lastDot = track.name.lastIndexOf(".");
      const nodeName = track.name.slice(0, lastDot);
      const prop = track.name.slice(lastDot + 1);
      const source = sourceByTrackName.get(nodeName);
      const vrmBone = sanitizedSourceToVrm[nodeName];
      if (!source || !vrmBone) continue;

      const target = vrm.humanoid.getNormalizedBoneNode(vrmBone);
      if (!target) continue;

      // HIPS POSITION: keep it, as a rest-relative delta (see header note). Every
      // OTHER position track is dropped — the physics controller owns whole-body
      // translation, and the UAL clips are in-place, so only the hips carry pose
      // height (crouch/bob) worth reproducing.
      if (prop === "position" && track instanceof THREE.VectorKeyframeTrack) {
        if (vrmBone !== VRMHumanBoneName.Hips || !srcHips || !tgtHips) continue;
        const values = Array.from(track.values);
        for (let i = 0; i < values.length; i += 3) {
          // delta = (frameLocal - srcRestLocal) → world → scale → target-parent-local,
          // then re-anchor on the target hips' own rest local position.
          hipsDelta.fromArray(values, i).sub(hipsSrcRestLocal);
          hipsDelta.applyQuaternion(hipsSrcParentWorld);
          hipsDelta.multiplyScalar(hipsHeightRatio);
          hipsDelta.applyQuaternion(hipsTgtParentWorldInv).add(hipsTgtRestLocal);
          hipsDelta.toArray(values, i);
        }
        tracks.push(
          new THREE.VectorKeyframeTrack(`${tgtHips.name}.position`, Array.from(track.times), values),
        );
        continue;
      }

      if (prop !== "quaternion" || !(track instanceof THREE.QuaternionKeyframeTrack)) continue;

      // Full bind-pose retarget: reproduce the SOURCE bone's world-space motion
      // on the TARGET bone, accounting for BOTH rigs' bind orientations, then
      // express it in the target's local space. Unlike the simplified source-rig
      // recipe (source-rest only), this also uses the VRM normalized bone's bind
      // world rotation — necessary because T-pose limbs are far from identity,
      // which is what left arms pointing straight up before. Reduces to identity
      // (the normalized rest pose) when the source is at its own bind pose.
      source.getWorldQuaternion(srcBindWorldInv).invert();
      if (source.parent) source.parent.getWorldQuaternion(srcParentBindWorld);
      else srcParentBindWorld.identity();
      target.getWorldQuaternion(tgtBindWorld);
      if (target.parent) {
        target.parent.getWorldQuaternion(tgtParentBindWorldInv);
        tgtParentBindWorldInv.invert();
      } else {
        tgtParentBindWorldInv.identity();
      }

      const values = Array.from(track.values);
      for (let i = 0; i < values.length; i += 4) {
        // q_target_local = tgtParentBindWorld⁻¹ · srcParentBindWorld · q · srcBindWorld⁻¹ · tgtBindWorld
        q.fromArray(values, i);
        q.premultiply(srcParentBindWorld);
        q.multiply(srcBindWorldInv).multiply(tgtBindWorld);
        q.premultiply(tgtParentBindWorldInv);
        q.toArray(values, i);
      }
      tracks.push(
        new THREE.QuaternionKeyframeTrack(`${target.name}.quaternion`, Array.from(track.times), values),
      );
    }
    if (tracks.length > 0) out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  return out;
}
