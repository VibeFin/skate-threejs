// Seeded variation, in one place, because "seeded" is a promise to the caller.
//
// Every factory in this directory takes a seed and the contract is that two
// different seeds give two visibly different objects — not two objects that
// differ in the fourth decimal place of a bolt. So the draws here are meant to
// be spent on things you can SEE from a moving board: how tall it is, what
// colour it was painted, how many of it there are, which way it leans, whether
// the lid is open.
//
// The generator is the LCG props.ts already uses, with one addition: the seed
// is AVALANCHED before it is used. A raw LCG seeded with 0, 1, 2, 3 returns
// first draws of 0.236, 0.236, 0.236, 0.236 to two decimal places — consecutive
// seeds are exactly what a placement loop hands you (`makeBollard(i)`), so a row
// of eight bollards would have come out identical, and the bug would have read
// as "the seed does nothing" rather than as a bad hash.

/** The draws a factory is allowed to make. Deterministic for a given seed. */
export interface Rand {
  /** 0 ≤ x < 1. */
  unit(): number;
  range(lo: number, hi: number): number;
  /** Whole number, both ends inclusive — a count of hoops, crates, blades. */
  int(lo: number, hi: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  /** ±1, for which side an arm reaches or which way a post leans. */
  sign(): number;
  /** `mid` ± `spread`, triangular — most of them near nominal, a few odd ones. */
  about(mid: number, spread: number): number;
}

/** Avalanche, so consecutive seeds are unrelated. See the header. */
function mix(seed: number): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

export function rand(seed: number): Rand {
  let s = mix(seed);
  const unit = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return {
    unit,
    range: (lo, hi) => lo + unit() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(unit() * (hi - lo + 1)),
    pick: (xs) => xs[Math.floor(unit() * xs.length) % xs.length],
    chance: (p) => unit() < p,
    sign: () => (unit() < 0.5 ? -1 : 1),
    about: (mid, spread) => mid + (unit() + unit() - 1) * spread,
  };
}
