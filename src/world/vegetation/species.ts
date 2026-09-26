// THE PARAMETER SPACE — what makes a pine a pine and not a spruce.
//
// The shape of this table is adapted from ez-tree's `options.js` and its
// `presets/` folder (MIT, Copyright (c) 2024 Daniel Greenheck — see NOTICE.md),
// which is the fastest way anyone learns which knobs on a procedural tree
// actually matter. It is not a copy of it: everything ez-tree carries for its
// editor (trellis growth, per-level texture plumbing, four levels of recursion,
// a leaf per twig) is gone, because this library builds trees for a hillside
// seen from a moving board rather than for an inspector at two metres.
//
// WHAT SURVIVED, AND WHY EACH ONE IS HERE:
//
// · **`crown`** — the exponent on how branch length falls off with height. This
//   single number is the difference between a fir (1.1, a straight-sided cone)
//   and a pine (0.5, a high rounded head on a bare pole), and it is the first
//   thing to reach for when a species reads wrong.
// · **`angle` → `topAngle`** — branches droop near the ground and sweep UP near
//   the leader. A conifer drawn with one branch angle is a bottle brush; the
//   interpolation between these two is most of what makes a silhouette read as
//   a real tree.
// · **`droop`** — a downward force applied along each branch as it grows, so
//   the branch CURVES rather than sitting on a straight line out of the trunk.
//   Spruce lives on this one.
// · **`branchStart`** — where the lowest branch is. A pine's bare lower trunk is
//   the thing that lets you see through a stand of them, and seeing through a
//   stand is the difference between a forest and a wall.
//
// Heights are in metres AT SCALE 1, and they are real: a mature Douglas fir is
// forty metres and nothing here is, because a 40 m tree on a hillside twelve
// metres above a skate channel dwarfs the map. These are the 12–20 m
// second-growth a flood channel actually runs through.

import type { SprayCell } from "./atlas";

export type SpeciesId = "pine" | "fir" | "spruce" | "broadleaf" | "scrub";

export interface TreeProfile {
  id: SpeciesId;
  /** One line for the review page and for whoever places these. */
  what: string;
  /** Needles are drawn and lit differently from blades — see atlas.ts. */
  kind: "needle" | "leaf";
  /** Metres at scale 1, before per-seed variation. */
  height: number;
  /** Triangular spread on the height, in metres. */
  heightVar: number;
  /** Trunk radius at the ground, metres. */
  radius: number;
  /** Rings up the trunk at full detail. */
  sections: number;
  /** Radial segments round the trunk at full detail. */
  segments: number;
  /** How much the trunk wanders off vertical per ring, radians. */
  gnarl: number;
  /** How hard the trunk is pulled back upright — phototropism, in effect. */
  upright: number;

  /** Recursion depth: 1 = branches off the trunk only (every conifer). */
  levels: 1 | 2;
  /** Branches off the trunk. */
  branches: number;
  /** Height fraction the lowest branch leaves the trunk at. */
  branchStart: number;
  /** Longest branch, as a fraction of tree height. */
  spread: number;
  /** Falloff exponent of branch length with height. See the header. */
  crown: number;
  /** Degrees off the parent axis at the BOTTOM of the tree (>90 droops). */
  angle: number;
  /** …and at the top. */
  topAngle: number;
  /** Triangular jitter on both, degrees. */
  angleVar: number;
  /** Downward force along a branch as it grows. */
  droop: number;
  branchSections: number;
  branchSegments: number;
  /** Second-order branches per first-order branch (levels === 2 only). */
  children2: number;

  /**
   * Sprays per foliage-bearing branch, and how big each one is as a fraction of
   * that branch's length.
   *
   * MANY SMALL rather than FEW LARGE, which is the same call `procedural/
   * green.ts` makes about canopy masses and for the same reason: three big
   * cards down a branch give you three big flat outlines, and the eye reads
   * them as fronds on a palm. Seven smaller ones give the notches BETWEEN them,
   * and a conifer branch is read off those notches as much as off the mass. It
   * costs four triangles a card, which is the cheapest thing in this library.
   */
  sprays: number;
  spraySize: number;
  /** Which cells of the atlas this species draws from. */
  cells: SprayCell[];

  /** Instance tint palette — multiplied into the pale atlas. See atlas.ts. */
  tone: number[];
  /** Bark tint palette, same deal but a much smaller nudge. */
  barkTone: number[];
}

/**
 * The five. Conifers first and deliberately three of them: map 2 is a channel
 * between forested hillsides, so the bulk of what gets placed is evergreen, and
 * a hillside built from ONE conifer is the same silhouette two hundred times
 * however well each copy is made. Three species at four seeds each is twelve
 * distinct outlines before scale and yaw touch them.
 */
export const SPECIES: Record<SpeciesId, TreeProfile> = {
  // A bare pole with a high open head — the tree you see the rest of the forest
  // THROUGH. Placed at the front of a stand it stops the hillside reading as a
  // wall, which is the job no amount of detail on a dense fir can do.
  pine: {
    id: "pine",
    what: "Scots-pine type — bare lower trunk, high open crown",
    kind: "needle",
    height: 17,
    heightVar: 3.4,
    radius: 0.3,
    sections: 11,
    segments: 6,
    gnarl: 0.055,
    upright: 0.02,
    levels: 1,
    branches: 26,
    branchStart: 0.5,
    spread: 0.3,
    crown: 0.5,
    angle: 86,
    topAngle: 52,
    angleVar: 9,
    droop: 0.2,
    branchSections: 2,
    branchSegments: 3,
    children2: 0,
    sprays: 6,
    spraySize: 0.78,
    cells: ["needleA", "needleB"],
    tone: [0x5d7440, 0x687d46, 0x53683a, 0x71834c],
    barkTone: [0xb4a08a, 0xa8907a, 0xc0aa92],
  },

  // Dense and conic almost to the ground: the mass in the middle of a stand.
  fir: {
    id: "fir",
    what: "Douglas-fir type — dense straight-sided cone, foliage low down",
    kind: "needle",
    height: 14,
    heightVar: 3.0,
    radius: 0.26,
    sections: 10,
    segments: 6,
    gnarl: 0.05,
    upright: 0.03,
    levels: 1,
    branches: 40,
    branchStart: 0.1,
    spread: 0.28,
    crown: 1.05,
    angle: 99,
    topAngle: 55,
    angleVar: 8,
    droop: 0.3,
    branchSections: 2,
    branchSegments: 3,
    children2: 0,
    sprays: 6,
    spraySize: 0.72,
    cells: ["needleB", "needleA"],
    tone: [0x4e6837, 0x59723d, 0x445c31, 0x627a42],
    barkTone: [0x9c8a76, 0x8d7c6a, 0xa8967f],
  },

  // Narrow, tall and drooping — the one that breaks a ridge line into teeth.
  spruce: {
    id: "spruce",
    what: "Spruce type — narrow, tall, branches drooping hard",
    kind: "needle",
    height: 19,
    heightVar: 3.8,
    radius: 0.28,
    sections: 12,
    segments: 6,
    gnarl: 0.04,
    upright: 0.04,
    levels: 1,
    branches: 44,
    branchStart: 0.12,
    spread: 0.19,
    crown: 1.25,
    angle: 110,
    topAngle: 62,
    angleVar: 10,
    droop: 0.5,
    branchSections: 2,
    branchSegments: 3,
    children2: 0,
    sprays: 6,
    spraySize: 0.64,
    cells: ["needleA", "needleB"],
    tone: [0x47603a, 0x516a3e, 0x3d5432, 0x5a7145],
    barkTone: [0x9b8b7c, 0x8a7a6c, 0xa79684],
  },

  // The one broadleaf, and it is here to be RARE: a stand of conifers with two
  // or three round-headed trees in it reads as a real hillside, and one with
  // none reads as a Christmas-tree farm.
  broadleaf: {
    id: "broadleaf",
    what: "Big-leaf maple / alder type — round head, forking limbs",
    kind: "leaf",
    height: 11,
    heightVar: 2.4,
    radius: 0.4,
    sections: 8,
    segments: 6,
    gnarl: 0.09,
    upright: 0.015,
    levels: 2,
    branches: 4,
    branchStart: 0.34,
    spread: 0.44,
    crown: 0.25,
    angle: 48,
    topAngle: 34,
    angleVar: 12,
    droop: -0.05,
    branchSections: 4,
    branchSegments: 5,
    children2: 3,
    sprays: 6,
    spraySize: 0.9,
    cells: ["leaf", "leafB"],
    tone: [0x6d8043, 0x7a8c4c, 0x5f7139, 0x84914f],
    barkTone: [0xa79e90, 0x968c80, 0xb5ab9c],
  },

  // Hillside scrub. Not a small tree — a different thing: no clear trunk, all
  // shoots from the base. It is what goes at the toe of a slope where a forest
  // meets concrete, and without it every tree in the map stands on bare dirt.
  scrub: {
    id: "scrub",
    what: "Hillside scrub — multi-stem, waist-to-shoulder height",
    kind: "leaf",
    height: 2.1,
    heightVar: 0.7,
    radius: 0.055,
    sections: 5,
    segments: 4,
    gnarl: 0.16,
    upright: 0.01,
    levels: 1,
    branches: 11,
    branchStart: 0.02,
    spread: 0.62,
    crown: 0.2,
    angle: 58,
    topAngle: 30,
    angleVar: 16,
    droop: -0.02,
    branchSections: 2,
    branchSegments: 3,
    children2: 0,
    sprays: 4,
    spraySize: 0.95,
    cells: ["leafB", "leaf"],
    tone: [0x6b7a3f, 0x77854a, 0x5c6a36, 0x818c52],
    barkTone: [0x9a8f7e, 0x8b8172],
  },
};

export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];
