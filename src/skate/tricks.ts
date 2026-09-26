// The trick book: which key means which trick, what it is called, and what
// landing it is worth.
//
// Four jobs live here and nowhere else. WHICH trick this frame's keys mean
// (`resolve` for the ones that fire off a press, `held` for the ones you keep
// holding), what a landed trick is CALLED (`trickName`, pure), what one trick
// is WORTH on its own, and the one moment a combo closes that no landing ever
// announces (`takeGroundClose`). The line's own arithmetic — how much a chain
// of four pays over a chain of one — is the HUD's, and the rule is written out
// at `COMBO_MAX_MULT` because it was briefly in both places at once.
//
// It keeps NO running score. It used to: a `pendingScore` accumulated in
// `describe` and handed back by `bank()`/`drop()`, whose returns went nowhere
// at either call site. Two ledgers, one of them never read, and its doc
// comments described it as the contract — so the fix is the deletion, not a
// second wiring.
//
// The division of labour with the model: the model owns WHEN a trick may fire
// (grounded, in the air, on a rail) and what it does to the ride. This file
// owns which trick the keys mean, its name and its score. Nothing here touches
// the scene, the mixer or the DOM — `clip` is a key the animation layer
// registers a take against (`SkaterAnim.attachHandClip`), and picking the take,
// its range and its mirror is lane 7c's call.
//
// Variety comes from COMPOSITION rather than from a longer id list: the same
// kickflip is a "Kickflip", a "360 Kickflip", a "Switch Kickflip" and a "Fakie
// 540 Kickflip" depending on how it was done, and one grab clip covers four
// named grabs picked off the stick. That is how THPS gets a hundred callouts
// out of a handful of moves.

import type {
  Stance,
  TrickDef,
  TrickId,
  TrickResult,
  TrickScoreContext,
  TrickTable,
} from "./contracts";
import { SPIN_SQUARE_DEG, spinName, spinOffSquare } from "./contracts";

// ---------------------------------------------------------------------------
// Scoring constants
// ---------------------------------------------------------------------------
/**
 * Points per second for the tricks you have to keep holding. A manual is worth
 * having because it KEEPS a combo alive across flat ground, not because it pays
 * — so the rate is low enough that holding one is never better than doing
 * something else with the time.
 *
 * That sentence was a lie for two rounds. The trick book does its half — a
 * manual scores, and letting go of one with the wheels down is the one line
 * ending nothing else announces (`takeGroundClose`). What it could not do is
 * stop the LANDING from banking first: the wheels touch down, the ride
 * announces the landing, the line is paid and closed, and the manual that was
 * meant to carry it across the flat opened a fresh one a frame later. The
 * carry is the HUD's (`Hud.carryCombo`), because the line and the pot are the
 * HUD's; this rate is only what the seconds are worth once it works.
 */
const HOLD_RATE = 60;
/**
 * A grind pays nearly twice that per second: you are on a rail you had to land
 * on square and you are fighting the balance the whole way, which is a harder
 * second than a manual's.
 */
const GRIND_HOLD_RATE = 90;
/**
 * Riding the other way round is a different set of feet. It pays, and it pays
 * the same however he got there — turned round on the deck coming back down a
 * transition, or the board came round under him on a landed 180.
 */
const SWITCH_BONUS = 1.25;
/** Every half turn is worth half the trick again — 180 ×1.5, 360 ×2, 540 ×2.5. */
const SPIN_STEP = 0.5;
/**
 * The ceiling on the combo multiplier — the tenth link is the last one that
 * buys anything, so a line worth having is a line that keeps ADDING value
 * rather than one that runs forever.
 *
 * WHERE THE COMBO MULTIPLIER LIVES — one layer, and this is not it.
 *
 * The rule, so it cannot come back: **the trick book emits BASE value and the
 * HUD applies the combo multiplier, once, at the bank.** Everything about how
 * the trick was DONE — the spin, the stance, the seconds held — is folded in
 * here, because only this file knows what those are worth. How many tricks are
 * in the line is not; that is the line's own arithmetic, it is the number the
 * HUD is already printing as "× 4", and multiplying there is what makes the
 * readout and the score the same sum. The whole rule is written out at
 * `Hud.commitBank`, which is the code that runs it.
 *
 * It was applied in BOTH places once (a link multiplied on the way out AND the
 * pot multiplied at the bank), which paid a five-link line 16,050 for 1,120 of
 * tricks. Then it was applied in neither: this cap was documented here and
 * enforced nowhere, because the only function that read it had no callers and
 * the HUD multiplied by its raw link count — a fourteen-link line paid ×14.
 * `comboMultiplier` below is the HUD's one way in. Anything added here has to
 * be per-trick, not per-line.
 */
const COMBO_MAX_MULT = 10;
/** Below this you are not rolling, you are balancing on a stationary board. */
const MANUAL_MIN_SPEED = 1.5;
// A manual you never come down from stops being a link and starts being a
// parking space, and for two milestones the thing that stopped it was a flat
// `MANUAL_MAX_HOLD = 4` right here: four seconds of clock, ticked off
// `ctx.holdTime`, that nothing the player did could argue with.
//
// The player's question is what replaced it: *"during a manual there should be
// the same balance mechanic as when we grind on a rail, right? Otherwise I
// could ride forever on it."* Half right — it did end, at four seconds — but he
// is asking for the MECHANIC, not for an ending, and a clock he cannot fight is
// not one. So the ride holds a balance now (`SkateModel.stepManual`, the
// manual's answer to `Grinder.update`) and hands the book the one fact the book
// needs: it is over. Left alone it still runs out at four seconds, which is why
// nothing about the length is missed; A and D buy up to sixteen.
//
// What stays in this file is what the ENDING MEANS, unchanged: the trick BANKS
// and the wheels drop, it is not a bail, because losing a run to a trick you
// were already holding is a punishment nobody reads as their own mistake — and
// the key stays locked out until it comes up, so the end of one manual is not
// the start of the next.

/** How far the stick has to be over for a grab to take its name from it. */
const GRAB_STEER_DEADZONE = 0.4;
/**
 * The deck goes all the way round on C — a whole flat turn, which is a 360
 * shove-it. Exported so the control screen and the HUD hint say the same words
 * the callout does instead of three files agreeing by hand.
 */
export const SHOVEIT_CALLOUT = "360 Shove-it";

/**
 * The four grabs, off one clip and one key. Which one you get is where the
 * stick was when you reached down — neutral is an indy, back is a method, and
 * the two sides are the heel and toe edges of the deck. The bonuses are small
 * and reflect the reach, not the score: a method is the furthest.
 */
const GRAB_BONUS: Readonly<Record<GrabFlavour, number>> = {
  Indy: 0,
  Melon: 20,
  Nosegrab: 20,
  Method: 50,
};

type GrabFlavour = "Indy" | "Melon" | "Nosegrab" | "Method";

/**
 * The pressed/held flags a trick can be resolved from. `SkateInput` satisfies
 * this structurally — declared here so the trick book does not depend on the
 * ride it is called from. `steer` and `brake` are the ride's own required
 * fields, so they are always really there; they are optional here only so this
 * type stays a description of what the book READS.
 */
export interface TrickInput {
  olliePressed?: boolean;
  kickflipPressed?: boolean;
  heelflipPressed?: boolean;
  shoveitPressed?: boolean;
  grabHeld?: boolean;
  manualHeld?: boolean;
  noseManualHeld?: boolean;
  /** -1 left, +1 right. Names the grab. */
  steer?: number;
  /** Names the grab too — back foot, back hand: a method. */
  brake?: boolean;
}

/** What the ride is doing right now — decides which tricks are even legal. */
export interface TrickContext {
  grounded: boolean;
  airborne: boolean;
  grinding: boolean;
  stance: Stance;
  /** Signed: negative is the wheels running the other way down the heading. */
  speed: number;
  /**
   * The wheels are running against the way he stands — a landed 180, where the
   * board came round and his feet did not. It scores as switch and it is called
   * switch: to a player the two are one thing, "he is riding the other way
   * round", and both leave him rolling with the other foot in front.
   */
  fakie: boolean;
  /** True while a flip is still coming round: a second flick is not free. */
  flipping: boolean;
  /**
   * The ride says the hold he is on is finished — the manual's balance went
   * past the edge, or he asked for his pushing foot back. It is a fact about
   * the BOARD, which is why it arrives from out there rather than being decided
   * in here off a clock.
   *
   * Optional, and absent reads as "still on it": a caller that does not model a
   * balance gets a manual that ends when the key comes up, which is the
   * milestone-6 behaviour and not a crash.
   */
  holdSpent?: boolean;
}

/**
 * Milestone 7's control layout, as one table.
 *
 * `clip` is the animation layer's registry key, and several tricks share one
 * take on purpose: a nose manual is a manual with the weight forward (the deck
 * angle is the model's, not the body's), and the five grinds are two stances —
 * along the rail or across it.
 *
 * Scores are THPS-shaped: a flip beats an ollie, a grind beats a flip because
 * you had to land on something to get it, and the multipliers (spin, stance,
 * hold, combo) live in `describe` rather than being baked in here.
 */
export const TRICKS: TrickTable = {
  ollie: { id: "ollie", name: "Ollie", score: 100, key: "space", where: "ground", clip: "ollie" },
  kickflip: { id: "kickflip", name: "Kickflip", score: 250, key: "f", where: "air", clip: "kickflip" },
  heelflip: { id: "heelflip", name: "Heelflip", score: 250, key: "g", where: "air", clip: "heelflip" },
  shoveit: { id: "shoveit", name: "Shove-it", score: 200, key: "c", where: "air", clip: "shoveit" },
  grab: { id: "grab", name: "Grab", score: 150, key: "shift", where: "air", clip: "grab", hold: true },
  manual: { id: "manual", name: "Manual", score: 120, key: "e", where: "ground", clip: "manual", hold: true },
  noseManual: {
    id: "noseManual",
    name: "Nose Manual",
    score: 140,
    key: "q",
    where: "ground",
    clip: "manual",
    hold: true,
  },
  fifty: { id: "fifty", name: "50-50", score: 300, key: "land", where: "grind", clip: "fifty", hold: true },
  boardslide: {
    id: "boardslide",
    name: "Boardslide",
    score: 350,
    key: "land",
    where: "grind",
    clip: "boardslide",
    hold: true,
  },
  nosegrind: {
    id: "nosegrind",
    name: "Nosegrind",
    score: 380,
    key: "land",
    where: "grind",
    clip: "fifty",
    hold: true,
  },
  tailslide: {
    id: "tailslide",
    name: "Tailslide",
    score: 380,
    key: "land",
    where: "grind",
    clip: "boardslide",
    hold: true,
  },
  smith: { id: "smith", name: "Smith", score: 420, key: "land", where: "grind", clip: "fifty", hold: true },
};

/** The parts of a callout, in the order they are spoken. */
export interface TrickNaming {
  /** The trick's own display name — a grab's flavour, not always `TrickDef.name`. */
  trick?: string | null;
  /** The line he landed in, printed after the trick: "Kickflip to 50-50". */
  grind?: string | null;
  /** Signed degrees turned during the move. */
  spinDegrees?: number;
  stance?: Stance;
  /** Rolling with the other foot in front because the board came round. */
  fakie?: boolean;
}

/**
 * The spin word for a turn the RIDE counted, or null.
 *
 * One function, because "180" appears in three places on screen — the callout,
 * the bare-spin link in the combo line, and the score's own half-turn bonus —
 * and they have to be the same number the model acted on. `spinName` alone is
 * `round(|deg| / 180)`, so a 109° brake-and-steer pivot printed "180" across
 * the screen while the ride, asking `spinOffSquare(deg) <= SPIN_SQUARE_DEG`,
 * had refused to call it one: measured on the real model, a 109° pivot said
 * "180" in the combo line and left the stance badge dark, which is the HUD
 * announcing a trick and then disowning it in the same breath.
 *
 * It composes rather than re-deciding: the NUMBER still comes from `spinName`,
 * which the ride lane owns, and the gate is the ride's own square test off its
 * own exported constant. Both being true is the same question asked twice, so
 * the day `spinName` grows the gate itself this stays correct — unlike the
 * stance inference that was tried in `describe`, where two corrections for one
 * bug inverted each other.
 */
export function landedSpinName(degrees: number): string | null {
  return spinOffSquare(degrees) <= SPIN_SQUARE_DEG ? spinName(degrees) : null;
}

/** …and the same turn as half-turns, which is what the spin bonus is paid on. */
function landedHalves(degrees: number): number {
  return spinOffSquare(degrees) <= SPIN_SQUARE_DEG ? Math.round(Math.abs(degrees) / 180) : 0;
}

/**
 * One callout out of stance + spin + trick + grind, in that order. Pure: the UI
 * lane prints exactly what comes back (the HUD upper-cases in CSS, so this
 * stays in the same title case as `TrickName`).
 */
export function trickName(parts: TrickNaming): string {
  const words: string[] = [];
  if (parts.stance === "switch" || parts.fakie) words.push("Switch");

  // The BOARD's own rotation is already inside some trick names ("360
  // Shove-it"), so a body that turned the SAME amount would print the number
  // twice — "360 360 Shove-it" reads as a bug, not as a trick, and it is the
  // common case because a full turn is what the air spin is paced to. Turning a
  // different amount still says both ("180 360 Shove-it"), which is two
  // rotations about two axes and is exactly what happened.
  //
  // Whatever is dropped here is dropped from the WORDS only — `value()` scores
  // off `spinDegrees` and never reads the callout. And the number always
  // survives somewhere in the string, which is what lets the HUD recognise its
  // own provisional spin link and replace it instead of stacking a second link
  // (and a second multiplier) beside it.
  const spin = landedSpinName(parts.spinDegrees ?? 0);
  if (spin && !parts.trick?.startsWith(spin)) words.push(spin);

  if (parts.trick) words.push(parts.trick);
  if (parts.grind) words.push(parts.trick ? `to ${parts.grind}` : parts.grind);
  return words.join(" ");
}

/**
 * Scored links → multiplier. The first trick is worth face value, the tenth is
 * worth ten, and the eleventh is worth ten as well — see `COMBO_MAX_MULT`.
 *
 * Called by `Hud.commitBank`, which is the only place a combo is ever
 * multiplied. It takes the count of SCORED links: a rail he is still on and a
 * spin no trick attached to are printed in the line but they are not tricks,
 * and they used to multiply it anyway.
 */
export function comboMultiplier(links: number): number {
  return Math.max(1, Math.min(links, COMBO_MAX_MULT));
}

export class TrickBook {
  readonly table: TrickTable = TRICKS;

  /** What is being held right now, as of this frame's `held()`. */
  private holding: TrickId | null = null;
  /** Latched from the ride at the pop: the wheels were running against him. */
  private fakie = false;
  private grabFlavour: GrabFlavour = "Indy";
  /** A held trick that ended itself needs the key RELEASED before it re-arms. */
  private manualLocked = false;
  /** A ground hold ended with the wheels down — see `takeGroundClose`. */
  private groundClose = false;
  /**
   * A ground hold the GROUND took away while its key was still down — a bump, a
   * lip, a kerb — waiting to be picked back up. See `resumedBase`.
   */
  private resumable: TrickId | null = null;
  /**
   * The hold running right now whose base value was already paid, because it is
   * the SAME hold resuming after the ground interrupted it.
   *
   * This is the trick book's half of the manny-pad bug, and it is the half that
   * is really about scoring. A manual is one trick you keep holding; a pad that
   * bumps the wheels off it hands the book a stream of short ones, and it used
   * to pay full price for each. Measured on the real model, holding E up the
   * plaza spine: at 8 m/s the pad let the manual run and it paid **300**; at
   * 12 m/s the same key over the same ground broke three times and paid
   * **1,548** — the player was rewarded, five times over, for the ride failing.
   * At 6 pieces the pure arithmetic is 5,400 against 300, an **18×** overpay,
   * because the base was charged six times AND six links multiplied the pot.
   *
   * So a resumed hold pays for its SECONDS and not for a second take-off. The
   * link count is the HUD's half of the same fix (`Hud.addLink`), and the two
   * together put a broken manual back on exactly the number a clean one pays.
   *
   * It is deliberately not a time window: what makes this one trick is that the
   * key never came up. Any OTHER trick banking in between clears it (`describe`)
   * — pop an ollie out of a manual and the manual you come back to is a new
   * link, which is a line, not a stutter.
   */
  private resumedBase: TrickId | null = null;

  def(id: TrickId): TrickDef {
    return this.table[id];
  }

  /** The flavour the current grab will bank under — the callout, while it is on. */
  get grabName(): string {
    return this.grabFlavour;
  }

  /**
   * The trick that FIRES this frame — the one-shots, the ones that come off a
   * key press. Returns null when the input asks for nothing legal.
   *
   * Called once per frame by the model, which then decides what firing means:
   * on the ground it is a pop, in the air it is a late flick.
   *
   */
  resolve(input: TrickInput, ctx: TrickContext): TrickId | null {
    // Latched here rather than read at the bank: the wheels can change sign
    // between popping a trick and landing it, and what a trick is called is
    // decided by the stance he took off in.
    this.fakie = ctx.fakie;
    if (ctx.grinding) return null;
    if (input.kickflipPressed) return "kickflip";
    if (input.heelflipPressed) return "heelflip";
    if (input.shoveitPressed) return "shoveit";
    if (input.olliePressed && ctx.grounded) return "ollie";
    return null;
  }

  /**
   * The trick currently being HELD — grab in the air, manual on the ground.
   * Returns null the frame the key comes up, which is the model's cue to bank
   * it and call `describe`.
   */
  held(input: TrickInput, ctx: TrickContext): TrickId | null {
    const grabWanted = input.grabHeld === true;
    // Read before the airborne branch, because a manual is broken by leaving
    // the ground far more often than by anything else, and the book has to know
    // whether the KEY is still down to tell a bump from a player letting go.
    const manualWanted = input.noseManualHeld === true || input.manualHeld === true;
    if (!manualWanted) {
      // Lifted out of the ground branch below: a manual that timed out, then
      // took an air, and had its key released MID-AIR never cleared its lock —
      // the clear only ran on grounded frames — so E was dead for the rest of
      // the run until he let go a second time on the floor.
      this.manualLocked = false;
      // He has let go of a hold the ground had already taken off him. THAT is
      // where the line ends: the bump was not his doing, so it does not close a
      // line, and this does. Same rule as `hold()`'s, one release later.
      if (this.resumable !== null) {
        if (ctx.grounded) this.groundClose = true;
        this.resumable = null;
      }
    }

    if (ctx.airborne) {
      if (!grabWanted) return this.hold(null, ctx.grounded, manualWanted);
      // The stick at the moment he reaches down names the grab, and it is
      // latched: steering out of a melon does not make it an indy.
      if (this.holding !== "grab") this.grabFlavour = pickGrab(input);
      return this.hold("grab", ctx.grounded, manualWanted);
    }

    // Wheels down, and there is no "sketchy grab" to score: a grab still on at
    // touchdown is a BAIL, decided by the ride (`skate-model.ts`, the `clean`
    // test — your hand is between the deck and the concrete). The book used to
    // carry a Sketchy Grab result and a re-arm latch for the case where it was
    // survivable; neither could ever run, because the ragdoll takes the hold
    // away before a grounded frame is ever resolved. Falling through to the
    // manuals below drops the grab, which is all that is left to do with it.

    if (!ctx.grounded || !manualWanted || this.manualLocked) {
      return this.hold(null, ctx.grounded, manualWanted);
    }
    if (Math.abs(ctx.speed) < MANUAL_MIN_SPEED) return this.hold(null, ctx.grounded, manualWanted);
    // `manualling()` first, and it is load-bearing: the flag is still true on
    // the frame the key comes back down, and a fresh manual must not inherit
    // the last one's ending. It is only ever asked of the hold that is running.
    if (this.manualling() && ctx.holdSpent === true) {
      this.manualLocked = true;
      // `false`, with the key plainly still down: this is the one hold ending
      // that the BOARD chose and that is finished. It banks, the wheels drop,
      // and the lock above is what stops it being picked straight back up — so
      // calling it resumable would only mean paying nothing for the next one.
      return this.hold(null, ctx.grounded, false);
    }
    // Q outranks E: the nose manual is the harder one, so a player pressing
    // both means the harder one.
    return this.hold(
      input.noseManualHeld === true ? "noseManual" : "manual",
      ctx.grounded,
      manualWanted,
    );
  }

  /**
   * The line closed on the FLOOR — the one moment a combo ends that no landing
   * is ever going to announce. Latched here, taken once: the caller banks the
   * line on the frame this comes back true (`Hud.bankCombo`).
   *
   * Every other way a line ends already has a voice. An air trick ends on a
   * landing, a grind ends into the air and then onto a landing, a bail ends on
   * `onBail`. A trick done entirely on the ground has none of those: a manual
   * ends with the wheels already down and the ride rolls on as if nothing had
   * happened, so five clean manuals in a row banked NOTHING and sat in the line
   * waiting for an air the player might never take.
   *
   * It fires for GROUND holds only — `where: "ground"`, which is the two
   * manuals. A grab is let go of in the air and a grind hands him back to the
   * air as well, so both of those have a landing coming and must not be cashed
   * a second time here.
   */
  takeGroundClose(): boolean {
    const close = this.groundClose;
    this.groundClose = false;
    return close;
  }

  /**
   * Name and score a landed trick — the only per-trick call the ride makes, so
   * the line on screen is built out of what comes back from here. The spin is
   * folded into the name ("360 Kickflip" is one callout, not two) because the
   * HUD prints one line per link.
   *
   * The score that comes back is the trick's BASE value: spin, stance and hold
   * time in, combo multiplier OUT (see `COMBO_MAX_MULT`). It is what the HUD
   * adds to the pot it is showing, and the pot is what gets multiplied when the
   * line banks — one multiplication, in the place that prints it.
   *
   * `ctx.streak` is deliberately unused: the streak is the run's clean-landing
   * count and belongs to the HUD, while the multiplier that PAYS is the combo's
   * link count — the number the player is building right now.
   */
  describe(id: TrickId, ctx: TrickScoreContext): TrickResult {
    const def = this.def(id);
    const grind = def.where === "grind";
    // `ctx.stance` is the stance he TOOK OFF in, and this file takes it at face
    // value — it does not reconstruct it. THPS names a trick by the feet it was
    // popped off: a regular skater's 180 is a "180 Ollie" that leaves him
    // switch, and calling it a "Switch 180 Ollie" names the landing instead.
    // The ride is what knows which that was, and it hands it over as its own
    // argument (`SkateModel.bankTrick`) precisely so nobody has to infer it.
    //
    // Inferring it here was tried this round and it is why this comment exists:
    // flipping the stance back whenever `spinDegrees` was an odd half-turn is
    // correct against a caller that hands over the LANDED stance, and the ride
    // stopped being one — the same round, in another lane. Two corrections for
    // one bug invert it, and the measured result was the exact symptom the fix
    // was for ("SWITCH 180 OLLIE" off a regular 180).
    const name = trickName({
      trick: grind ? null : this.displayName(id),
      grind: grind ? def.name : null,
      spinDegrees: ctx.spinDegrees,
      stance: ctx.stance,
    });
    const score = Math.round(this.value(id, ctx));
    // The base is charged once per hold, so it is spent here — `value()` above
    // is the only reader of it.
    if (this.resumedBase === id) this.resumedBase = null;
    // Banking a DIFFERENT trick settles the interrupted hold's account: another
    // trick has landed between the bump and the pick-up, so the manual he comes
    // back to is a new link and pays in full. Banking the interrupted trick
    // ITSELF is the bump's own bank, which arrives one call after `held()`
    // latched it — clearing on that would undo the latch before it could ever
    // be used.
    if (this.resumable !== null && this.resumable !== id) this.resumable = null;
    return { id, name, score };
  }

  /**
   * He went down. The hold goes with him and the line is forfeit.
   *
   * There is nothing to give BACK here, and that is the point: this file never
   * banked anything to take back. The score exists in exactly one place, the
   * HUD's pot, and a bail is `Hud.loseCombo` — which throws the whole line away
   * without ever adding it to the total. `drop()` used to return the base sum
   * it had been accumulating and the ride used it as a bare statement; the
   * number was invented, carried and discarded, which is how it came to be
   * documented as the contract while being read by nobody.
   */
  drop(): void {
    this.holding = null;
    this.groundClose = false;
    this.resumable = null;
    this.resumedBase = null;
  }

  /** New run: nothing held, nothing latched, nothing locked out. */
  reset(): void {
    this.holding = null;
    this.manualLocked = false;
    this.groundClose = false;
    this.resumable = null;
    this.resumedBase = null;
  }

  // -------------------------------------------------------------------------

  /**
   * `keyDown` is whether the trick's own key is STILL held — which is the whole
   * difference between a player ending a manual and the ground ending one.
   */
  private hold(id: TrickId | null, grounded: boolean, keyDown = false): TrickId | null {
    const was = this.holding;
    this.holding = id;
    if (was !== null && id !== was && this.def(was).where === "ground") {
      if (keyDown) {
        // He never let go — a bump, a lip, a kerb took it. The line is not over
        // and the trick is not finished; it is waiting to be picked back up.
        this.resumable = was;
      } else if (id === null && grounded) {
        // Letting go of a manual with the wheels still down ends the line,
        // because nothing else is coming that would. See `takeGroundClose`.
        this.groundClose = true;
      }
    }
    // Only on the frame a hold STARTS. Running it every frame would wipe the
    // flag one frame after setting it — `resumable` is cleared here, so the
    // very next frame's `resumable === id` is false and the resumed manual
    // would go back to paying full price with nothing on screen to show it.
    if (id !== null && id !== was) {
      // Picking the SAME hold back up continues it; starting a different one
      // means the interrupted trick is over and its successor pays in full.
      this.resumedBase = this.resumable === id ? id : null;
      this.resumable = null;
    }
    return id;
  }

  private manualling(): boolean {
    return this.holding === "manual" || this.holding === "noseManual";
  }

  /**
   * What the callout SAYS, which is not always what the table calls the trick.
   *
   * A grab prints its flavour — one clip, four names, picked off the stick.
   *
   * The shove-it prints what the board actually DOES. `skater-rig.ts` yaws the
   * deck a whole turn, not a half, because the model snaps `flip` back to
   * square at the catch and a deck left half way round would jump on that
   * frame. A whole flat turn is a 360 shove-it, so that is what it is called
   * here, on the controls screen and in the hints — a "pop shove-it" is the
   * 180, and this is not one. (`TrickDef.name` stays "Shove-it": that word is
   * the animation layer's clip key, not a caption.)
   */
  private displayName(id: TrickId): string {
    if (id === "grab") return this.grabFlavour;
    if (id === "shoveit") return SHOVEIT_CALLOUT;
    return this.def(id).name;
  }

  /**
   * What one link is worth before the combo multiplies it.
   *
   * The stance bonus reads `ctx.stance` for the same reason the callout does:
   * it is the stance he took off in, and that is what the bonus pays for. A
   * regular skater who threw a 180 was not riding switch when he threw it.
   */
  private value(id: TrickId, ctx: TrickScoreContext): number {
    const def = this.def(id);
    // A hold the ground interrupted has already been paid for taking off; what
    // it is worth from here is the seconds. Without this, a manny pad that
    // bumps a manual three times charges the player's own combo three take-offs
    // and pays him for all of them.
    const base =
      this.resumedBase === id
        ? 0
        : def.score + (id === "grab" ? GRAB_BONUS[this.grabFlavour] : 0);
    // The half-turns the RIDE counted, not the ones `round()` would like to see:
    // a 109° pivot is not a 180 and does not pay for one. Same gate as the
    // callout's, from the same function.
    const halves = landedHalves(ctx.spinDegrees);
    const rate = def.where === "grind" ? GRIND_HOLD_RATE : HOLD_RATE;
    const hold = Math.max(0, ctx.holdTime) * rate;
    const bonus = ctx.stance === "switch" || this.fakie ? SWITCH_BONUS : 1;
    return (base * (1 + halves * SPIN_STEP) + hold) * bonus;
  }
}

/** Where the stick was when he reached for the deck. */
function pickGrab(input: TrickInput): GrabFlavour {
  if (input.brake === true) return "Method";
  const steer = input.steer ?? 0;
  if (steer <= -GRAB_STEER_DEADZONE) return "Melon";
  if (steer >= GRAB_STEER_DEADZONE) return "Nosegrab";
  return "Indy";
}
