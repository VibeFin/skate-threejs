// ik.js — minimal analytic two-bone IK (AG-803 Step C). Pins a hand to a
// weapon grip: law-of-cosines elbow, pole-vector bend plane, applied as
// world-space quaternion deltas onto the ANIMATED nodes (rig-agnostic — works
// on the VRM normalized rig and raw Mixamo/Meshy bones alike, because a world
// delta premultiplied through the node's own parent frame is rig-independent).
// weight scales the correction (slerp from identity) so IK can fade with the
// aim mask.
import * as THREE from "three";

const _A = new THREE.Vector3(), _E = new THREE.Vector3(), _W = new THREE.Vector3();
const _n = new THREE.Vector3(), _h = new THREE.Vector3(), _bend = new THREE.Vector3();
const _e = new THREE.Vector3(), _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3();
const _delta = new THREE.Quaternion(), _pw = new THREE.Quaternion();
const _w0 = new THREE.Quaternion(), _id = new THREE.Quaternion();
const _dw = new THREE.Quaternion(); // scaled delta — MUST be distinct from _delta
                                    // (callers pass _delta in; aliasing zeroed the IK once)

/** Premultiply a WORLD-space rotation delta (scaled by w) onto a bone. */
function applyWorldDelta(bone, delta, w) {
  _dw.copy(_id).slerp(delta, w);
  bone.getWorldQuaternion(_w0);
  _w0.premultiply(_dw); // new world orientation
  bone.parent.getWorldQuaternion(_pw).invert();
  bone.quaternion.copy(_pw.multiply(_w0));
  bone.updateMatrixWorld(true);
}

/** Blend a bone's WORLD orientation toward worldQuat (rotates in place —
 *  wrist position is untouched, so it composes with the position IK). */
export function setWorldQuat(bone, worldQuat, w = 1) {
  if (!bone || w <= 1e-3) return;
  bone.getWorldQuaternion(_w0).slerp(worldQuat, w);
  bone.parent.getWorldQuaternion(_pw).invert();
  bone.quaternion.copy(_pw.multiply(_w0));
  bone.updateMatrixWorld(true);
}

/**
 * upper/fore/hand: THREE nodes of the arm chain (shoulder->elbow->wrist).
 * target: world-space Vector3 the wrist should reach.
 * hintDir: world-space direction the elbow should bend toward (pole vector).
 * weight: 0..1 correction strength.
 */
export function twoBoneIK(upper, fore, hand, target, hintDir, weight = 1) {
  if (!upper || !fore || !hand || weight <= 1e-3) return;
  upper.getWorldPosition(_A);
  fore.getWorldPosition(_E);
  hand.getWorldPosition(_W);
  const L1 = _A.distanceTo(_E), L2 = _E.distanceTo(_W);
  if (L1 < 1e-5 || L2 < 1e-5) return;

  _n.copy(target).sub(_A);
  const d = Math.min(Math.max(_n.length(), Math.abs(L1 - L2) + 1e-4), L1 + L2 - 1e-4);
  _n.normalize();
  _h.copy(hintDir).normalize();
  _bend.copy(_h).addScaledVector(_n, -_h.dot(_n));
  if (_bend.lengthSq() < 1e-8) _bend.set(0, -1, 0).addScaledVector(_n, _n.y); // degenerate hint
  _bend.normalize();

  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  _e.copy(_A).addScaledVector(_n, L1 * cosA).addScaledVector(_bend, L1 * sinA);

  // 1) upper arm: current elbow dir -> desired elbow dir
  _v0.copy(_E).sub(_A).normalize();
  _v1.copy(_e).sub(_A).normalize();
  applyWorldDelta(upper, _delta.setFromUnitVectors(_v0, _v1), weight);

  // 2) forearm: fresh positions after step 1, then wrist -> target
  fore.getWorldPosition(_E);
  hand.getWorldPosition(_W);
  _v0.copy(_W).sub(_E).normalize();
  _v1.copy(target).sub(_E).normalize();
  applyWorldDelta(fore, _delta.setFromUnitVectors(_v0, _v1), weight);
}
