// The words the street build's lanes share.
//
// Nothing in here touches the scene. These are the shapes the ride, the grind,
// the trick book, the ragdoll and the animation layer all have to agree on,
// plus the handful of pure sums that go with them. If two lanes need a type it
// belongs here; if one lane needs it, it belongs in that lane's file.

import type * as THREE from "three";
import type { GrindLine } from "../world/surface";

/**
 * Which END of his own deck he is set up to lead — nose for `regular`, tail for
 * `switch`. The animation layer answers it with a half-turn of the whole body
 * above the skeleton, so his feet swap ends of the board with him.
 *
 * It is only HALF of "which way round is he riding", and the other half is not
 * here: `SkateModel.fakie` says whether the wheels are running toward that end
 * or the other one, and the anim layer answers THAT with a reflection of the
 * clip. One is caused by the rider turning (a ramp roll-back), the other by the
 * board turning (a landed 180), and they compose.
 */
export type Stance = "regular" | "switch";

export type GrindKind = "fifty" | "boardslide" | "nosegrind" | "tailslide" | "smith";

export type TrickId =
  | "ollie"
  | "kickflip"
  | "heelflip"
  | "shoveit"
  | "grab"
  | "manual"
  | "noseManual"
  | GrindKind;

/**
 * What the HUD prints. Kept as a closed union rather than a bare string so a
 * misspelt trick is a compile error and not a blank callout — the animation
 * layer switches on these too.
 */
export type TrickName =
  | "Ollie"
  | "Kickflip"
  | "Heelflip"
  | "Shove-it"
  | "Grab"
  | "Manual"
  | "Nose Manual"
  | "50-50"
  | "Boardslide"
  | "Nosegrind"
  | "Tailslide"
  | "Smith";

/** The key that fires a trick, as the control layout names it. */
export type TrickKey = "space" | "f" | "g" | "c" | "shift" | "e" | "q" | "land";

/** Where a trick is legal. `land` tricks are caught by landing on a line. */
export type TrickWhere = "air" | "ground" | "grind";

export interface TrickDef {
  id: TrickId;
  name: TrickName;
  /** Points before spin, stance and hold time are folded in. */
  score: number;
  key: TrickKey;
  where: TrickWhere;
  /**
   * Clip key in the animation layer's hand-clip registry — the name passed to
   * `SkaterAnim.attachHandClip`. Two tricks may share one clip.
   */
  clip: string;
  /** True while a key is DOWN rather than fired once: grab, manual, grinds. */
  hold?: boolean;
}

export type TrickTable = Readonly<Record<TrickId, TrickDef>>;

/** One resolved trick, ready for the HUD and the score. */
export interface TrickResult {
  id: TrickId;
  /** Display string WITH the spin folded in — "360 Kickflip", not "Kickflip". */
  name: string;
  score: number;
}

/** What a trick is worth depends on how it was done, not just which it was. */
export interface TrickScoreContext {
  /** Net degrees turned during the move. A 360 kickflip outscores a kickflip. */
  spinDegrees: number;
  /** Seconds a held trick was held — manual, grab, grind. 0 for a one-shot. */
  holdTime: number;
  /**
   * The stance he TOOK OFF in — a regular 180 is a "180 Ollie" and leaves you
   * switch. The ride captures it before the landing resolves the spin and hands
   * it over; nothing downstream may re-infer it from `spinDegrees`, or the two
   * corrections invert each other and a regular 180 prints "Switch 180 Ollie".
   */
  stance: Stance;
  /** Clean landings already banked; the combo the HUD is showing. */
  streak: number;
}

/**
 * A grind in progress. The model owns the state machine around it; the grind
 * lane owns everything inside it, including `speed` — which is why speed lives
 * here rather than being read back off the model every frame.
 */
export interface GrindState {
  kind: GrindKind;
  line: GrindLine;
  /** Position along the line: 0 at `a`, 1 at `b`. */
  t: number;
  /** +1 riding a→b, -1 riding b→a. */
  dir: 1 | -1;
  /** Heading that rides the line the way he is going, radians. */
  heading: number;
  /** Board yaw against the rail, radians. 0 is straight (50-50), ±π/2 sideways. */
  boardAngle: number;
  /** Along-line speed, m/s. The grind lane applies its own friction to this. */
  speed: number;
  /** −1 (heelside) → +1 (toeside). Reaching ±1 is a bail. */
  balance: number;
  /** Seconds on this line, for the score and the balance ramp. */
  elapsed: number;
}

/**
 * A body that has stopped being animated and started being physics.
 *
 * The ragdoll writes bone rotations directly, so while it runs it is the ONLY
 * writer on that skeleton — two animations on one skeleton is the bug that cost
 * this project a day (DESIGN.md, 2026-07-26). `release()` is how the skeleton
 * goes back.
 */
export interface RagdollHandle {
  /** Throw the body. `velocity` is the board's world velocity at impact. */
  start(velocity: THREE.Vector3): void;
  update(dt: number): void;
  /** True once the bones have come to rest — the model's cue to stand him up. */
  readonly settled: boolean;
  /** Where the hips are right now. The camera watches this while he tumbles. */
  readonly hips: THREE.Vector3;
  /**
   * Hands the skeleton back to the animation layer and returns where the body
   * came to rest — which is where the next run starts from.
   */
  release(out?: THREE.Vector3): THREE.Vector3;
  /**
   * Drop everything the fall is holding, NOW, with no carry-home.
   *
   * `release()` is the end of a fall: the body stands up where it landed and
   * the deck slides back to his feet over `BOARD_RETURN`, which is right,
   * because home is a few metres away and the eye follows it. A TELEPORT is not
   * the end of a fall. Home has moved to the spawn, the return solves the
   * deck's world pose through the new parent matrix, and what the player sees
   * is his board streaking in across the block for half a second. Hitting R is
   * the one case that wants the fall simply gone.
   */
  cancel(): void;
}

/**
 * Degrees turned since the current air (or ground pivot) began, signed. The
 * landing reads this to name the spin, to decide whether he came round square,
 * and to work out whether he is riding switch now.
 */
export interface SpinTracker {
  /** Signed, and it keeps counting past 360 — a 540 is 540, not 180. */
  degrees: number;
  /** The largest |degrees| reached, so a spin unwound at the last moment still reads. */
  peak: number;
  reset(): void;
  /** Feed it the heading change actually applied this frame, in radians. */
  add(radians: number): void;
  /** "180" / "360" / "540", or null under a half turn. */
  name(): string | null;
  /** Degrees away from square. Under the model's clean window this is a landing. */
  offSquare(): number;
}

export function createSpinTracker(): SpinTracker {
  return {
    degrees: 0,
    peak: 0,
    reset(): void {
      this.degrees = 0;
      this.peak = 0;
    },
    add(radians: number): void {
      this.degrees += (radians * 180) / Math.PI;
      this.peak = Math.max(this.peak, Math.abs(this.degrees));
    },
    name(): string | null {
      return spinName(this.degrees);
    },
    offSquare(): number {
      return spinOffSquare(this.degrees);
    },
  };
}

/**
 * How far the board is from pointing along its own line of travel again. Square
 * is any multiple of 180 — a 180 lands you switch, but it lands you.
 */
export function spinOffSquare(degrees: number): number {
  const d = Math.abs(degrees) % 180;
  return Math.min(d, 180 - d);
}

/**
 * How far off square a spin may land and still count as having come round.
 * The ride's landing test and the stance rule read the same number, because a
 * spin that was not square enough to land is not square enough to turn him
 * round either.
 */
export const SPIN_SQUARE_DEG = 60;

/**
 * "180" / "360" / "540" …, or null for anything that did not come round.
 *
 * The gate is the same one `spinFlipsStance` carries and it is here for the
 * same reason: `Math.round(|deg| / 180)` alone calls every turn from 90° to
 * 269° a 180, and this is the expression the HUD prints. Left ungated it
 * announced a "180" for a 100° wobble that the stance rule had already, and
 * correctly, refused to call one — the screen saying one thing while the model
 * did another. A name is a claim about what happened, so it answers the
 * question the ride answered.
 */
export function spinName(degrees: number, cleanDeg = SPIN_SQUARE_DEG): string | null {
  if (spinOffSquare(degrees) > cleanDeg) return null;
  const halves = Math.round(Math.abs(degrees) / 180);
  return halves >= 1 ? String(halves * 180) : null;
}

// There was a `spinFlipsStance` here — "did that spin come round an odd number
// of half-turns and land square" — and it was how the stance used to be decided.
// It is not a question about the stance at all: a 180 landed at a standstill
// turns nobody round and a roll-back down a transition turns him round with no
// spin whatever. The wheels decide (`SkateModel.syncStance`). `spinOffSquare`
// stayed, because how square a landing is is still what a bail is judged on.

/** The other stance. */
export function flipStance(stance: Stance): Stance {
  return stance === "regular" ? "switch" : "regular";
}
