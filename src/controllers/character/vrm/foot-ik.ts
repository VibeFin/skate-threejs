// SPDX-License-Identifier: MIT
// Two-bone foot IK with raycast grounding + pelvis drop + foot-to-slope alignment
// (Genex AG-747). Renderer/physics-agnostic: you inject a ground query (wrap your
// Rapier `world.castRayAndGetNormal`) and it plants the feet — so on stairs and
// slopes each sole sits FLAT on the step under it instead of clipping or floating
// toes-down. OPT-IN: locomotion + punch work without it; enable after per-avatar QA.
//
// It does what a naive ankle-raise cannot, matching a good reference planter:
//   1. lowers the PELVIS toward the lower foot so both legs can reach without
//      over-stretching (essential on steps),
//   2. two-bone-solves each leg so the ankle reaches its grounded target while the
//      foot keeps its animated orientation, then
//   3. tilts each PLANTED foot to lie flat on the ground normal (lifted/mid-stride
//      feet keep the animation, weighted by how high off the ground they are).
//
// ORDER MATTERS: this poses the VRM's NORMALIZED bones, which `vrm.update(dt)` then
// copies to the raw (rendered) rig. Run it AFTER the animation mixer has posed the
// frame but BEFORE `vrm.update(dt)` — after the copy it has no visible effect until
// the next frame, where the mixer overwrites it first.
//
//   const footIK = new FootIK(vrm, (foot) => {
//     const hit = world.castRayAndGetNormal(
//       new RAPIER.Ray({ x: foot.x, y: foot.y + 0.5, z: foot.z }, { x: 0, y: -1, z: 0 }),
//       1.0, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, character.body);
//     return hit ? { y: foot.y + 0.5 - hit.timeOfImpact, normal: hit.normal } : null;
//   }, { isActive: () => character.isOnGround });
//   // each frame, in this order:
//   anims.update(character, dt); // mixer poses the normalized rig
//   footIK.update(dt);           // plant the feet on the normalized rig
//   vrm.update(dt);              // copy normalized -> raw, run spring bones
import * as THREE from "three";
import { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { VRM } from "@pixiv/three-vrm";

/** A grounded contact under a foot: world-Y of the surface + (optional) its world normal. */
export interface GroundSample {
  /** Ground world-Y directly below the foot. */
  y: number;
  /** Surface normal (world, unit). Omit for flat-only grounding (feet stay level). */
  normal?: THREE.Vector3;
}

/**
 * Ground query below a foot. Return the contact ({@link GroundSample} — or a bare
 * world-Y number for the simple flat case), or null when there's nothing to plant
 * on (airborne, a gap, a too-far drop) so the foot keeps its animated pose.
 */
export type GroundQuery = (footWorldPos: THREE.Vector3) => GroundSample | number | null;

export interface FootIKOptions {
  /** Max metres an ankle is raised/lowered toward the ground. Default 0.4. */
  maxOffset?: number;
  /**
   * Extra clearance between the sole and the ground contact (m). The grounding
   * target is the TERRAIN under the foot relative to the body root, so 0 lands
   * the sole flush; raise it a hair if a particular avatar's sole clips in.
   * Default 0.
   */
  soleClearance?: number;
  /** Per-frame offset smoothing rate (higher = snappier). Default 14. */
  smoothing?: number;
  /** Lower the pelvis toward the lower foot so both legs reach. Default true. */
  pelvisDrop?: boolean;
  /** Tilt planted feet to lie flat on the ground normal. Default true. */
  alignFeet?: boolean;
  /**
   * Gate: return false to fade the effect out (e.g. `() => character.isOnGround`
   * so airborne legs keep their jump pose). Default: always active.
   */
  isActive?: () => boolean;
  /**
   * Gate for the terrain-relative reach (downward offsets + pelvis drop, and
   * full plant-up). Return false while a full-body one-shot is playing
   * (`() => !anims.oneShotActive`): those clips are choreography — a foot
   * swinging over a lower step must not drag the pelvis down into a staircase,
   * and a raised stance foot must not be yanked a full step up. While gated,
   * feet are lifted only as much as needed to keep the sole out of the contact
   * under them (anti dig-in). Default: always allowed.
   */
  allowReachDown?: () => boolean;
}

// three-vrm's own node type — same THREE.Object3D at runtime, but using the
// library's return type keeps this file's storage self-consistent under any
// three typings the game happens to resolve.
type BoneNode = NonNullable<ReturnType<VRM["humanoid"]["getNormalizedBoneNode"]>>;
type VrmHumanBone = (typeof VRMHumanBoneName)[keyof typeof VRMHumanBoneName];

interface Leg {
  upper: BoneNode;
  lower: BoneNode;
  foot: BoneNode;
  /** Smoothed vertical grounding offset (world-Y delta from the animated ankle). */
  offset: number;
  /** Smoothed world ground normal under this foot. */
  normal: THREE.Vector3;
  /** Animated ankle world position, captured before any IK this frame. */
  animFootPos: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);

// Foot-plant tuning (mirrors the reference planter's feel).
const WEIGHT_DAMPING = 8; // global fade in/out when isActive flips
const NORMAL_DAMPING = 12; // ground-normal smoothing
const PLANTED_LIFT_MIN = 0.04; // below this lift the foot is fully planted (align at full weight)
const PLANTED_LIFT_MAX = 0.16; // above this lift the foot is fully lifted (no align)
const MAX_FOOT_TILT = 0.6; // clamp foot-to-slope tilt (rad)
const PENETRATION_SLACK = 0.02; // ankle may dip this far below rest before the no-sink lift kicks in
// Max anti-dig-in lift while reach-down is gated (one-shots). Retarget dips are
// a few cm; a hard cap keeps a stance foot carried INTO a stair riser by the
// choreography from being lifted a whole step ("knee to the chest") — beyond
// the cap it stays buried, which the step itself mostly occludes.
const GATED_LIFT_CAP = 0.12;
const MIN_BONE_LENGTH = 1e-4;
const IK_EPSILON = 1e-4;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _target = new THREE.Vector3();
const _rootPos = new THREE.Vector3();
const _normalTarget = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _kneeToHip = new THREE.Vector3();
const _kneeToAnkle = new THREE.Vector3();
const _bendAxis = new THREE.Vector3();
const _fallbackAxis = new THREE.Vector3();
const _currentDir = new THREE.Vector3();
const _targetDir = new THREE.Vector3();
const _tiltAxis = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _footWorldQuat = new THREE.Quaternion();
const _deltaQuat = new THREE.Quaternion();
const _parentQuat = new THREE.Quaternion();
const _localDelta = new THREE.Quaternion();
const _modelQuat = new THREE.Quaternion();
const _parentInverse = new THREE.Matrix4();

/**
 * Foot IK over a VRM's normalized leg bones. Constructed once; call `update()`
 * each frame AFTER the animation mixer and BEFORE `vrm.update()` (see file header).
 */
export class FootIK {
  #legs: Leg[] = [];
  #hips: BoneNode | null;
  #modelRoot: THREE.Object3D;
  #query: GroundQuery;
  #maxOffset: number;
  #soleClearance: number;
  #smoothing: number;
  #pelvisDrop: boolean;
  #alignFeet: boolean;
  #isActive: (() => boolean) | undefined;
  #allowReachDown: (() => boolean) | undefined;
  #enabled = true;
  #weight = 0;
  #restFootHeight = 0;

  constructor(vrm: VRM, groundQuery: GroundQuery, options: FootIKOptions = {}) {
    this.#query = groundQuery;
    this.#maxOffset = options.maxOffset ?? 0.4;
    this.#soleClearance = options.soleClearance ?? 0;
    this.#smoothing = options.smoothing ?? 14;
    this.#pelvisDrop = options.pelvisDrop ?? true;
    this.#alignFeet = options.alignFeet ?? true;
    this.#isActive = options.isActive;
    this.#allowReachDown = options.allowReachDown;
    this.#modelRoot = vrm.scene;

    const h = vrm.humanoid;
    this.#hips = h.getNormalizedBoneNode(VRMHumanBoneName.Hips);
    const mk = (u: VrmHumanBone, l: VrmHumanBone, f: VrmHumanBone): Leg | null => {
      const upper = h.getNormalizedBoneNode(u);
      const lower = h.getNormalizedBoneNode(l);
      const foot = h.getNormalizedBoneNode(f);
      return upper && lower && foot
        ? {
            upper,
            lower,
            foot,
            offset: 0,
            normal: new THREE.Vector3(0, 1, 0),
            animFootPos: new THREE.Vector3(),
          }
        : null;
    };
    const left = mk(VRMHumanBoneName.LeftUpperLeg, VRMHumanBoneName.LeftLowerLeg, VRMHumanBoneName.LeftFoot);
    const right = mk(VRMHumanBoneName.RightUpperLeg, VRMHumanBoneName.RightLowerLeg, VRMHumanBoneName.RightFoot);
    if (left) this.#legs.push(left);
    if (right) this.#legs.push(right);
    this.#restFootHeight = this.#measureRestFootHeight();
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
  }

  update(dt = 1 / 60): void {
    if (this.#legs.length === 0) return;

    // Global weight fades the whole effect in/out (toggle or airborne) so nothing pops.
    const active = this.#enabled && (this.#isActive?.() ?? true);
    this.#weight += ((active ? 1 : 0) - this.#weight) * (1 - Math.exp(-WEIGHT_DAMPING * dt));
    if (!active && this.#weight < 1e-3) {
      for (const leg of this.#legs) {
        leg.offset = 0;
        leg.normal.copy(UP);
      }
      return;
    }

    this.#modelRoot.updateWorldMatrix(true, true);
    this.#modelRoot.getWorldPosition(_rootPos);
    this.#modelRoot.getWorldQuaternion(_modelQuat);
    _fallbackAxis.set(1, 0, 0).applyQuaternion(_modelQuat); // knee hinge fallback (model X)

    const k = 1 - Math.exp(-this.#smoothing * dt);
    const kNormal = 1 - Math.exp(-NORMAL_DAMPING * dt);
    const reachDown = this.#allowReachDown?.() ?? true;

    // 1. Sample the ground under each ANIMATED foot; smooth offset + normal.
    //    Two lift signals, merged:
    //    - TERRAIN-relative plant: the ground height under the foot vs the body
    //      root (the VRM origin = its floor/sole level), NOT vs the animated
    //      foot. Stride-phase independent — a lifted swing foot keeps its
    //      animation (no dragging/sinking while running) while a planted foot
    //      still lands on its step, and it self-corrects any residual
    //      capsule-float gap (feet reach true ground).
    //    - needLift: raise the ankle ONLY as much as needed so the sole clears
    //      the contact under it — the anti-dig-in floor for poses that dip the
    //      animated feet below the clip's own ground (weapon recoil etc. on
    //      differently-proportioned avatars).
    //    With reach-down gated off (full-body one-shots), ONLY needLift
    //    applies, capped at GATED_LIFT_CAP: choreography feet are left alone
    //    unless they'd clip into a step, and a foot the stance carries INTO a
    //    riser gets at most a small hop, not a knee-to-the-chest fold. The
    //    lift-only offsets also mean min(0,offset)=0 keeps the pelvis drop
    //    off. Smoothing eases every transition (one-shot start/end, a ray
    //    crossing a step edge) without pops.
    for (const leg of this.#legs) {
      leg.foot.getWorldPosition(leg.animFootPos);
      const sample = active ? this.#query(leg.animFootPos) : null;
      const groundY = sample === null ? null : typeof sample === "number" ? sample : sample.y;
      _normalTarget.copy(
        sample !== null && typeof sample !== "number" && sample.normal ? sample.normal : UP,
      );
      let desired = 0;
      if (groundY !== null) {
        // Anti-dig-in signal: how much lift (if any) the ankle needs so the
        // sole clears the contact under it. NEGATIVE when the foot is safely
        // above the contact — and it must stay negative: flooring it at zero
        // here would win every Math.max below and silently kill the downward
        // reach (and with it the pelvis drop) for the whole planter.
        const needLift =
          groundY +
          this.#soleClearance +
          this.#restFootHeight -
          PENETRATION_SLACK -
          leg.animFootPos.y;
        desired = reachDown
          ? Math.max(
              THREE.MathUtils.clamp(
                groundY + this.#soleClearance - _rootPos.y,
                -this.#maxOffset,
                this.#maxOffset,
              ),
              Math.min(needLift, this.#maxOffset),
            )
          : THREE.MathUtils.clamp(needLift, 0, GATED_LIFT_CAP);
      }
      leg.offset += (desired - leg.offset) * k;
      leg.normal.lerp(_normalTarget, kNormal).normalize();
    }

    // 2. Pelvis drop: sink the hips toward the LOWER foot (most negative offset)
    //    so the downhill leg reaches without the uphill one hyper-extending.
    if (this.#pelvisDrop && this.#hips && this.#legs.length === 2) {
      let minOffset = 0;
      for (const leg of this.#legs) minOffset = Math.min(minOffset, leg.offset);
      const pelvisOffset = minOffset * this.#weight;
      if (Math.abs(pelvisOffset) > IK_EPSILON) this.#shiftWorldY(this.#hips, pelvisOffset);
    }

    // 3. Per-leg two-bone IK to the grounded target, then flatten planted feet.
    //    (Anti-dig-in is already folded into the smoothed offset — needLift in
    //    step 1 — so the target needs no extra instant clamp here.)
    for (const leg of this.#legs) {
      _target.copy(leg.animFootPos);
      _target.y += leg.offset * this.#weight;
      leg.foot.getWorldPosition(_c);
      if (_c.distanceToSquared(_target) > IK_EPSILON * IK_EPSILON) {
        this.#solve(leg, _target);
      }
      if (this.#alignFeet) this.#alignFootToGround(leg, _rootPos.y);
    }
  }

  /** Analytic two-bone IK: bend the knee + swing the hip so the ankle reaches
   * `targetWorld`, preserving the foot's animated world orientation. */
  #solve(leg: Leg, targetWorld: THREE.Vector3): void {
    leg.upper.getWorldPosition(_a);
    leg.lower.getWorldPosition(_b);
    leg.foot.getWorldPosition(_c);
    const upperLen = _a.distanceTo(_b);
    const lowerLen = _b.distanceTo(_c);
    _toTarget.subVectors(targetWorld, _a);
    if (upperLen < MIN_BONE_LENGTH || lowerLen < MIN_BONE_LENGTH || _toTarget.lengthSq() < MIN_BONE_LENGTH ** 2) {
      return;
    }

    // Preserve the animated foot orientation across the solve (we re-tilt it in step 3).
    leg.foot.getWorldQuaternion(_footWorldQuat);

    const dist = THREE.MathUtils.clamp(
      _toTarget.length(),
      Math.abs(upperLen - lowerLen) + IK_EPSILON,
      upperLen + lowerLen - IK_EPSILON,
    );
    const cosKnee = (upperLen * upperLen + lowerLen * lowerLen - dist * dist) / (2 * upperLen * lowerLen);
    const desiredKnee = Math.acos(THREE.MathUtils.clamp(cosKnee, -1, 1));

    _kneeToHip.subVectors(_a, _b);
    _kneeToAnkle.subVectors(_c, _b);
    const currentKnee = _kneeToHip.angleTo(_kneeToAnkle);
    _bendAxis.crossVectors(_kneeToAnkle, _kneeToHip);
    if (_bendAxis.lengthSq() < 1e-10) _bendAxis.copy(_fallbackAxis);
    _bendAxis.normalize();

    const bendDelta = currentKnee - desiredKnee;
    if (Math.abs(bendDelta) > 1e-6) {
      _deltaQuat.setFromAxisAngle(_bendAxis, bendDelta);
      this.#applyWorldRotationDelta(leg.lower, _deltaQuat);
      leg.foot.getWorldPosition(_c);
    }

    // Swing the whole limb so the ankle points at the target.
    _currentDir.subVectors(_c, _a).normalize();
    _targetDir.copy(_toTarget).normalize();
    _deltaQuat.setFromUnitVectors(_currentDir, _targetDir);
    this.#applyWorldRotationDelta(leg.upper, _deltaQuat);

    // Restore the animated foot orientation (step 3 tilts it onto the slope).
    this.#setWorldQuaternion(leg.foot, _footWorldQuat);
  }

  /** Tilt a PLANTED foot to lie flat on its ground normal (skipped for lifted feet). */
  #alignFootToGround(leg: Leg, rootY: number): void {
    const lift = leg.animFootPos.y - rootY - this.#restFootHeight;
    const planted = 1 - THREE.MathUtils.smoothstep(lift, PLANTED_LIFT_MIN, PLANTED_LIFT_MAX);
    const tilt = Math.min(leg.normal.angleTo(UP), MAX_FOOT_TILT) * this.#weight * planted;
    if (tilt < 1e-3) return;
    _tiltAxis.crossVectors(UP, leg.normal);
    if (_tiltAxis.lengthSq() < 1e-10) return;
    _deltaQuat.setFromAxisAngle(_tiltAxis.normalize(), tilt);
    this.#applyWorldRotationDelta(leg.foot, _deltaQuat);
  }

  #measureRestFootHeight(): number {
    if (this.#legs.length === 0) return 0;
    this.#modelRoot.updateWorldMatrix(true, true);
    this.#modelRoot.getWorldPosition(_rootPos);
    let total = 0;
    for (const leg of this.#legs) total += leg.foot.getWorldPosition(_worldPos).y - _rootPos.y;
    return total / this.#legs.length;
  }

  /** Rotate a bone by a WORLD-space quaternion delta, then refresh its subtree. */
  #applyWorldRotationDelta(bone: BoneNode, worldDelta: THREE.Quaternion): void {
    const parent = bone.parent;
    if (!parent) return;
    parent.getWorldQuaternion(_parentQuat);
    _localDelta.copy(_parentQuat).invert().multiply(worldDelta).multiply(_parentQuat);
    bone.quaternion.premultiply(_localDelta);
    bone.updateWorldMatrix(false, true);
  }

  /** Set a bone's WORLD orientation, then refresh its subtree. */
  #setWorldQuaternion(bone: BoneNode, worldQuat: THREE.Quaternion): void {
    const parent = bone.parent;
    if (!parent) return;
    parent.getWorldQuaternion(_parentQuat);
    bone.quaternion.copy(_parentQuat).invert().multiply(worldQuat);
    bone.updateWorldMatrix(false, true);
  }

  /** Translate a bone vertically in WORLD space, then refresh its subtree. */
  #shiftWorldY(bone: BoneNode, deltaY: number): void {
    const parent = bone.parent;
    if (!parent) return;
    bone.getWorldPosition(_worldPos);
    _worldPos.y += deltaY;
    _parentInverse.copy(parent.matrixWorld).invert();
    bone.position.copy(_worldPos.applyMatrix4(_parentInverse));
    bone.updateWorldMatrix(false, true);
  }
}
