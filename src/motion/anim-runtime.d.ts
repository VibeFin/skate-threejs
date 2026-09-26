// Types for the vendored `genex motion` runtime (anim-runtime.js ships as
// plain JS). Loose on purpose — see rigs.d.ts.

import type { MotionRig, MotionSet } from "./rigs.js";

export interface MotionTrack {
  F: number;
  fps: number;
  dur: number;
  speed: number;
  loop: boolean;
}

export class ClipSet {
  constructor(rig: MotionRig, data: MotionSet, clips: Record<string, unknown>);
  rig: MotionRig;
  tracks: Record<string, MotionTrack | undefined>;
}

export interface OneShotOptions {
  fadeIn?: number;
  fadeOut?: number;
  yCap?: number | null;
  rate?: number;
  onDone?: (() => void) | null;
}

export class Animator {
  constructor(clipSet: ClipSet);
  readonly oneShotActive: boolean;
  setLoops(weights: Record<string, number>, dt: number, free?: string[]): void;
  playOneShot(name: string, options?: OneShotOptions): boolean;
  setMask(name: string, weight: number, pitch01?: number): void;
  update(dt: number): { shotW: number } | undefined;
}

export function dir8Weights(
  x: number,
  z: number,
  mag: number,
  available?: string[] | null,
): Record<string, number>;

export function aimMaskStep(
  maskW: number,
  o: { mag: number; grounded: boolean; pitch: number; dt: number; aiming?: boolean; tau?: number },
): number;

export function sampleContact(t: MotionTrack, ph: number, foot: unknown): unknown;
