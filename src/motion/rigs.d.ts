// Types for the vendored `genex motion` runtime (rigs.js ships as plain JS).
// Deliberately loose: the runtime is duck-typed across VRM and GLB rigs, and
// this file exists to let the game's TypeScript call it, not to re-specify it.

import type * as THREE from "three";

export interface MotionRig {
  scene: THREE.Object3D;
  mapped: string[];
  computeCorrection(): void;
  readRest(): void;
  update(dt: number): void;
  animNode(joint: string): THREE.Object3D;
  retargetFrame(
    read: (key: string, out: THREE.Quaternion) => void,
    local: boolean,
    write: (joint: string, q: THREE.Quaternion) => void,
  ): void;
}

export type MotionSet = Record<string, unknown> & {
  joints: string[];
  parents: number[];
  gaits: Record<string, unknown>;
};

export function loadRig(url: string, base: MotionSet, scene: THREE.Object3D): Promise<MotionRig>;
export function captureRestAnkle(rig: MotionRig, scene: THREE.Object3D, rootY?: number): unknown;
export function reanchorFeet(rig: MotionRig, set: MotionSet, scene: THREE.Object3D): void;
export function groundCalibrate(
  rig: MotionRig,
  clipSet: unknown,
  scene: THREE.Object3D,
  restAnkle: unknown,
  rootY?: number,
): void;
export function curlFingers(rig: MotionRig, scene: THREE.Object3D): void;
