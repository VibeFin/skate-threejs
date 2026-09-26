// SPDX-FileCopyrightText: 2024 Daniel Greenheck
// SPDX-License-Identifier: MIT
//
// THE SKELETON — where every branch and every spray of one tree is, before any
// of it is triangles.
//
// This file is an adaptation of the growth algorithm in ez-tree's
// `src/lib/tree.js` (MIT, Copyright (c) 2024 Daniel Greenheck), which the
// player named as the reference for this work. See `NOTICE.md`. What is
// carried over is the algorithm and three specific decisions in it that are
// better than the obvious version:
//
// · **Stratified child placement with PERMUTED radial slots.** Children are
//   spaced one per height slot and one per angle slot, then the two lists are
//   shuffled against each other. Without the shuffle — and this is ez-tree's own
//   note — an evergreen whose branch length depends on height spirals its
//   longest branches to one side and the whole tree leans.
// · **Growth force applied about the (up × target) axis**, clamped to the angle
//   that remains. The naive slerp-toward-a-quaternion form is degenerate when
//   the target is identity and shoves branches in whatever random direction the
//   section had already drifted.
// · **A skeleton that consumes ALL the randomness, and meshing that consumes
//   none.** That is what lets three levels of detail be built from one tree
//   without any of them being a different tree — the LOD1 mesh is the LOD0 tree
//   with rings skipped, not a second roll of the dice.
//
// What is deliberately NOT carried over: Euler angles (quaternions here — the
// original composes Eulers through `setFromQuaternion` round trips), the
// trellis system, the per-level texture plumbing, and leaves. ez-tree emits one
// quad per LEAF and a pine preset asks for 30 of them on each of 82 branches;
// that is 4,920 quads for one tree, which is a fine number for a tree viewer
// and about six times this game's entire vegetation budget. Here a branch
// carries three or four SPRAYS — a card with a whole branchlet painted on it —
// and the alpha channel does the work the geometry was doing.

import * as THREE from "three";
import { rand, type Rand } from "../procedural/rng";
import type { TreeProfile } from "./species";

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/** One cross-section of a limb: where it is, which way it points, how thick. */
export interface Ring {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  r: number;
}

export interface Limb {
  rings: Ring[];
  /** 0 = trunk. */
  level: number;
  segments: number;
  /** Length in metres, kept for sizing the sprays that ride on it. */
  length: number;
}

/** A foliage card's placement. `roll` spins the crossed planes about the axis. */
export interface Spray {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  size: number;
  roll: number;
  /** Index into the profile's `cells` — which card of the atlas this one is. */
  cell: number;
  /** Height fraction up the tree, for the wind weight and the imposter sort. */
  h: number;
}

export interface Skeleton {
  limbs: Limb[];
  sprays: Spray[];
  /** Measured, not the profile's nominal — seeds vary it by metres. */
  height: number;
  /** Measured half-width of the crown. */
  spread: number;
}

const deg = Math.PI / 180;

/**
 * Rotate a growth direction toward `target` by at most `amount` radians.
 * ez-tree's corrected force term, in quaternion form. A positive amount pulls
 * toward the target (a trunk toward vertical), a negative one pushes away.
 */
function bendToward(q: THREE.Quaternion, target: THREE.Vector3, amount: number): void {
  if (amount === 0) return;
  const up = UP.clone().applyQuaternion(q);
  const axis = new THREE.Vector3().crossVectors(up, target);
  const sin = axis.length();
  if (sin < 1e-6) return;
  axis.divideScalar(sin);
  const full = Math.atan2(sin, up.dot(target));
  const step = Math.max(-full, Math.min(full, amount));
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, step));
}

/** Fisher-Yates over [0..n), on the tree's own RNG so a seed stays a seed. */
function shuffled(n: number, r: Rand): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r.unit() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

interface GrowArgs {
  origin: THREE.Vector3;
  orientation: THREE.Quaternion;
  length: number;
  radius: number;
  level: number;
  sections: number;
  segments: number;
  gnarl: number;
  /** Positive pulls toward `bendTarget`. */
  bend: number;
  bendTarget: THREE.Vector3;
  /** Radius at the tip as a fraction of the base — 0 for a conifer branch. */
  taper: number;
}

function growLimb(a: GrowArgs, r: Rand): Limb {
  const rings: Ring[] = [];
  const p = a.origin.clone();
  const q = a.orientation.clone();
  const step = a.length / a.sections;
  for (let i = 0; i <= a.sections; i++) {
    const t = i / a.sections;
    rings.push({ p: p.clone(), q: q.clone(), r: a.radius * (1 - (1 - a.taper) * t) });
    p.add(UP.clone().applyQuaternion(q).multiplyScalar(step));
    // Wander, growing as the limb thins — a twig wobbles and a trunk does not.
    //
    // ez-tree scales this by `1/sqrt(radius)` in absolute units, which is a
    // trap at this scale: its trunks are radius 1.05 in its own units and these
    // are 0.26 METRES, so the same expression handed a fir a multiplier of
    // seven at the leader and the random walk laid whole trees over on their
    // sides — visible in the first hillside capture as trunks at forty degrees.
    // Scale-free and capped instead: the shape of the falloff is kept, the
    // dependence on what a metre is, is not.
    const thin = Math.sqrt(1 / Math.max(0.06, 1 - t));
    const g = a.gnarl * Math.min(3, thin);
    q.multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(r.range(-g, g), 0, r.range(-g, g)),
      ),
    );
    bendToward(q, a.bendTarget, a.bend);
  }
  return { rings, level: a.level, segments: a.segments, length: a.length };
}

/** Position, orientation and radius at a height fraction along a limb. */
function sampleLimb(limb: Limb, t: number): Ring {
  const n = limb.rings.length - 1;
  const f = Math.max(0, Math.min(1, t)) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const a = limb.rings[i];
  const b = limb.rings[i + 1];
  const k = f - i;
  return {
    p: new THREE.Vector3().lerpVectors(a.p, b.p, k),
    q: a.q.clone().slerp(b.q, k),
    r: a.r * (1 - k) + b.r * k,
  };
}

/**
 * Grow one tree. Deterministic in `seed`: the same seed is the same tree, every
 * boot and every level of detail.
 */
export function growTree(profile: TreeProfile, seed: number): Skeleton {
  const r = rand(seed);
  const height = Math.max(1, r.about(profile.height, profile.heightVar));
  const radius = profile.radius * (height / profile.height);

  const limbs: Limb[] = [];
  const sprays: Spray[] = [];

  // The trunk. A tiny lean off vertical, because a tree that is exactly plumb
  // is the one thing in a forest that reads as placed rather than grown — and
  // on a HILLSIDE, where every trunk is seen against a slope, it is the
  // difference between a stand and a row of fence posts.
  const lean = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(r.range(-0.05, 0.05), r.unit() * Math.PI * 2, r.range(-0.05, 0.05)),
  );
  const trunk = growLimb(
    {
      origin: new THREE.Vector3(),
      orientation: lean,
      length: height,
      radius,
      level: 0,
      sections: profile.sections,
      segments: profile.segments,
      gnarl: profile.gnarl,
      bend: profile.upright,
      bendTarget: UP,
      // A conifer's trunk runs out to a point at the leader; a broadleaf's
      // stops thick because a real limb continues out of it.
      taper: profile.levels === 1 ? 0.02 : 0.42,
    },
    r,
  );
  limbs.push(trunk);

  const branchOf = (
    parent: Limb,
    count: number,
    level: number,
    startFrac: number,
    lengthAt: (t: number) => number,
    angleAt: (t: number) => number,
    sections: number,
    segments: number,
    droop: number,
  ): Limb[] => {
    const made: Limb[] = [];
    const offset = r.unit();
    const slots = shuffled(count, r);
    const span = (1 - startFrac) / count;
    for (let i = 0; i < count; i++) {
      const t = startFrac + (i + r.unit()) * span;
      const base = sampleLimb(parent, t);
      const radial = 2 * Math.PI * (offset + (slots[i] + r.range(-0.5, 0.5)) / count);
      const off = (angleAt(t) + r.about(0, profile.angleVar)) * deg;
      const q = base.q
        .clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(UP, radial))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), off));
      const len = Math.max(0.2, lengthAt(t) * r.about(1, 0.16));
      const limb = growLimb(
        {
          origin: base.p,
          orientation: q,
          length: len,
          radius: Math.max(0.012, base.r * 0.42),
          level,
          sections,
          segments,
          gnarl: profile.gnarl * 1.5,
          bend: droop,
          bendTarget: droop >= 0 ? DOWN : UP,
          taper: 0.04,
        },
        r,
      );
      limbs.push(limb);
      made.push(limb);
    }
    return made;
  };

  const spray = (at: Ring, size: number): void => {
    sprays.push({
      p: at.p,
      q: at.q.clone(),
      size,
      roll: r.unit() * Math.PI,
      cell: r.int(0, profile.cells.length - 1),
      h: Math.max(0, Math.min(1, at.p.y / height)),
    });
  };

  const foliageOn = (limb: Limb): void => {
    const n = profile.sprays;
    for (let i = 0; i < n; i++) {
      // Along the branch from a sixth of the way out. The first cut of this
      // started at a THIRD, on the argument that a conifer's branch structure
      // should be visible near the trunk — and it is, but a third of every
      // branch on every tree adds up to a bare column round the trunk, and the
      // hillside read as a stand of dead poles. The structure still shows; it
      // shows THROUGH the foliage, which is where you see it on a real tree.
      const t = 0.16 + ((i + r.range(0.1, 0.9)) / n) * 0.84;
      const at = sampleLimb(limb, Math.min(1, t));
      // Biggest around two thirds out. Cards of one size down a branch read as
      // a repeated stamp; this is the taper the eye is looking for.
      spray(at, limb.length * profile.spraySize * (0.62 + 0.55 * Math.sin(Math.PI * t)));
    }
  };

  if (profile.levels === 1) {
    // Every conifer, and the scrub. Branches straight off the trunk, length
    // falling off with height by `crown`, angle sweeping from drooping at the
    // bottom to upswept at the leader.
    const made = branchOf(
      trunk,
      profile.branches,
      1,
      profile.branchStart,
      (t) => profile.spread * height * Math.pow(1 - t, profile.crown),
      (t) => profile.angle + (profile.topAngle - profile.angle) * t,
      profile.branchSections,
      profile.branchSegments,
      profile.droop,
    );
    for (const b of made) foliageOn(b);
    // The LEADER. A conifer's top is a shoot with foliage on it, not the bare
    // spike a tapering trunk ends in — and the top of the tree is the part a
    // hillside shows most of, because it is the bit above the ridge line.
    if (profile.kind === "needle") {
      for (let i = 0; i < 3; i++) {
        spray(sampleLimb(trunk, 0.82 + i * 0.06), height * profile.spread * 0.55 * (1 - i * 0.22));
      }
    }
  } else {
    // The broadleaf: primaries off the trunk, secondaries off those, foliage
    // only on the secondaries — which is what puts the canopy in a SHELL with
    // open structure under it rather than in a ball.
    const primaries = branchOf(
      trunk,
      profile.branches,
      1,
      profile.branchStart,
      (t) => profile.spread * height * (1 - 0.35 * t),
      (t) => profile.angle + (profile.topAngle - profile.angle) * t,
      profile.branchSections,
      profile.branchSegments,
      profile.droop,
    );
    for (const p of primaries) {
      const secondaries = branchOf(
        p,
        profile.children2,
        2,
        0.34,
        () => p.length * 0.55,
        () => profile.angle * 0.72,
        Math.max(2, profile.branchSections - 1),
        Math.max(3, profile.branchSegments - 2),
        profile.droop * 0.5,
      );
      for (const s of secondaries) foliageOn(s);
    }
  }

  // Measured, not assumed — placement code spaces trees off these and a stated
  // bound the geometry does not fit inside is worse than no bound at all.
  let top = 0;
  let wide = 0;
  for (const s of sprays) {
    top = Math.max(top, s.p.y + s.size * 0.6);
    wide = Math.max(wide, Math.hypot(s.p.x, s.p.z) + s.size * 0.5);
  }
  for (const ring of trunk.rings) top = Math.max(top, ring.p.y);
  return { limbs, sprays, height: top, spread: wide };
}
