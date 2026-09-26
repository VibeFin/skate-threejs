// THE ONE-MINUTE RUN — the clock, the score, and the gate on repeating it.
//
// Free-roam is the DEFAULT state of this game and it never goes away: a player
// who never skates near the NPC still has the whole block and both maps. A run
// is a minute laid OVER that — the ride, the tricks and the combo rule do not
// change inside it, only what the score is counted against.
//
// Nothing in here draws, loads or touches three.js. It is the rule, in one
// place, so the HUD paints it and the world triggers it without either of them
// owning a second copy of "is a run on".
//
// THE GATE, in the player's own words: *"When the run ends you can repeat it —
// repeating is only possible after the run has ended, never mid-run."* That is
// `start()` returning false while `running`, and it is the only place the
// question is asked. Every caller — the NPC's trigger, the results screen's GO
// AGAIN, a future menu button — goes through it. `restart()` is the ONE way
// past it, and it is past it by throwing the minute away first rather than by
// asking a second time; see its own note.

/**
 * Where a run is.
 *
 * `over` is a DISPLAY state, not a gameplay one: the moment the clock hits zero
 * the player is free-roaming again and can ride away mid-results. The phase is
 * only still `over` so the results readout knows it is up and so its two
 * choices — GO AGAIN and FREE RIDE — have something to hang off.
 */
export type RunPhase = "free" | "running" | "over";

/** How long a run lasts. The whole ask is "a run that lasts one minute". */
export const RUN_SECONDS = 60;

// THE RESULTS READOUT NO LONGER TAKES ITSELF AWAY, and the deletion is the
// point rather than a tidy-up. `RESULTS_LINGER` was 22 seconds, and it was the
// right call while the card's only control was a single GO AGAIN — a readout
// nobody answered would otherwise have sat over the game for the rest of the
// session. The card is a QUESTION now, with two answers and one of them
// highlighted, and a question that answers itself after 22 seconds while the
// player is still deciding is not a choice. Every way out of it is his: FREE
// RIDE, GO AGAIN, any ride key, R. `dismiss()` is still the one door they all
// go through.

export interface RunHooks {
  /** The clock started. */
  onStart?: () => void;
  /** …and ran out, with what the player banked inside it. */
  onEnd?: (score: number) => void;
  /** The run was thrown away without finishing — a map change. No score. */
  onCancel?: () => void;
}

export class OneMinuteRun {
  private hooks: RunHooks;
  private state: RunPhase = "free";
  private left = 0;
  private points = 0;

  constructor(hooks: RunHooks = {}) {
    this.hooks = hooks;
  }

  get phase(): RunPhase {
    return this.state;
  }
  get running(): boolean {
    return this.state === "running";
  }
  /** Seconds left, 0 when no run is on. */
  get timeLeft(): number {
    return this.state === "running" ? this.left : 0;
  }
  /** Points banked inside the current (or just-finished) run. */
  get score(): number {
    return this.points;
  }

  /**
   * Start one. Refused while a run is already on — THE gate — and allowed from
   * both `free` and `over`, which is what "you can repeat it once it has ended"
   * means. Returns whether it took, so a trigger can stay quiet rather than
   * pretending it did something.
   */
  start(): boolean {
    if (this.state === "running") return false;
    this.state = "running";
    this.left = RUN_SECONDS;
    this.points = 0;
    this.hooks.onStart?.();
    return true;
  }

  /**
   * Throw this minute away and take a fresh one — the pause card's RESTART RUN,
   * and the only thing in the game that gets past the mid-run gate.
   *
   * It does not weaken the gate, it goes round it the honest way: the current
   * minute is CANCELLED first, so it scores nothing and the world hears about
   * it (`onCancel`), and only then is a new one started through the same
   * `start()` every other caller uses. The gate exists so a trigger the player
   * rolled past cannot silently reset his clock; a word he chose off a pause
   * screen is the opposite of that, and it is the only place this is offered.
   *
   * Returns whether a run is now on, so a caller reached with no minute to
   * restart stays quiet rather than starting one the player did not ask for.
   */
  restart(): boolean {
    if (this.state !== "running") return false;
    this.cancel();
    return this.start();
  }

  /**
   * Points the player just BANKED — a landed line, cashed. Only what banks
   * counts, which is the game's own scoring rule (`Hud.commitBank`) and not a
   * second one written here: a line the player is still building is not a
   * score, and a line he bailed out of pays nothing.
   *
   * Outside a run this is a no-op rather than an error. The HUD announces every
   * bank whether or not a clock is on, and free-roam scoring is the HUD's own
   * running total.
   */
  add(points: number): void {
    if (this.state !== "running" || points <= 0) return;
    this.points += points;
  }

  update(dt: number): void {
    if (this.state !== "running") return;
    this.left -= dt;
    if (this.left <= 0) {
      this.left = 0;
      this.state = "over";
      this.hooks.onEnd?.(this.points);
    }
  }

  /**
   * The results readout is done with — back to plain free-roam.
   *
   * Every way out of the card lands here: FREE RIDE, a ride key, the map
   * change. Nothing else clears the phase, and nothing clears it on a timer.
   */
  dismiss(): void {
    if (this.state !== "over") return;
    this.state = "free";
  }

  /**
   * The run is gone and nothing is scored for it — the player changed spot
   * mid-minute, so the minute was ridden on a block that is no longer there.
   */
  cancel(): void {
    const wasOn = this.state !== "free";
    this.state = "free";
    this.left = 0;
    this.points = 0;
    if (wasOn) this.hooks.onCancel?.();
  }
}

/** `0:07` — the clock as the HUD prints it. */
export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
