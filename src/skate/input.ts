// Keyboard AND the phone's thumbs → one SkateInput per frame.
//
// IT WAS KEYBOARD ONLY UNTIL 2026-07-30, and the note that said so is kept
// verbatim because it is the spec the touch lane was built to: *"KEYBOARD ONLY,
// deliberately: there is no touch layer in this game yet, so there are no touch
// entry points here either. A set of `touchGrab` / `pressKickflip` hooks lived
// here with nothing anywhere in src/ calling them, which read as 'the tricks
// work on a phone' when not one of them did. When a touch lane happens it owns
// its own widgets and feeds this source; until then the file says what the game
// does."*
//
// The touch lane happened, and it feeds this source — exactly as that note
// asked, and NOT through hooks of its own. `src/ui/touch-controls.ts` (the gate)
// and `src/controllers/touch/skate-touch-layer.ts` (the widgets) call the three
// entry points near the bottom of this class and nothing else.
// `touchControl(code, down)` presses the SAME code a key presses, through the
// same two methods, so every argument this file settles is obeyed by a thumb
// without being written a second time: the push/pop tie-break, the wind-up a
// push spends, the staleness gate that stops a title-screen tap queueing a
// trick. Only the carve axis has a path of its own, because a stick is already
// analogue where two keys are not — and it still goes through the same ramp.
//
// WHAT THIS COSTS A DESKTOP SESSION: one `this.touchStick !== 0` test per frame
// in `consume()`, against a field whose only writer is `touchSteer`, whose only
// caller is a module a desktop session never loads. It is 0 for the whole life of
// a desktop session, so `target` is the digital target it has always been.
//
// The flip keys are EDGE-triggered: holding F does not machine-gun kickflips.
// `consume()` hands out the pressed flags exactly once. The grab and the two
// manuals are the opposite — they are true for as long as the key is DOWN,
// because the trick IS the holding.
//
// Space is the odd one out: it pops on RELEASE, not on press, because the hold
// in between is the wind-up crouch. A tap still reads as an instant ollie —
// press and release land a frame or two apart and the crouch barely starts.
//
// The layout, which the whole milestone assumes:
//   V / W / Up      push          A / D / ← →   carve, and SPIN in the air
//   S / Down        brake, and S + A/D is a ground pivot
//   Space           hold to load, release to pop (and pops out of a grind)
//   F kickflip      G heelflip    C 360 shove-it
//   X (held)        grab — A/D/S while reaching names it
//   Shift (held) manual            Q (held) nose manual
//   E (held)        SLIDE ACROSS — the deck laid sideways over a line. Riding
//                   onto one needs no key at all.
//   R reset
// (Escape pauses and the mouse looks around; neither is this file's — the boot
// owns the pause key and the follow camera owns the pointer.)
//
// **THE HOLDS MOVED TWICE on 2026-07-29, and the order matters.**
//
// First: the grab came OFF Shift onto X and the grind went the other way. The
// player's complaint was that X was uncomfortable to hold for a grind, and the
// two holds are not the same length — a grab is a fraction of a second in the
// air and is over by the landing, while a grind runs for SECONDS with A and D
// fighting the balance gauge the whole way. With the hand on WASD only the
// pinky and the thumb are free, and X can be reached only by curling a finger
// under while its neighbours work A and D: fine for a stab, wrong for a key you
// keep down for the length of a handrail.
//
// Then, having ridden that: *"поменяй еще пожалуйста shift и E."* The grind went
// on to E and the MANUAL took Shift. The first swap's reasoning does not argue
// against this, because it never distinguished the two LONG holds from each
// other — a manual is also seconds of A/D against a gauge, so the pinky's home
// key was always going to be wanted by one of them, and which one is a matter of
// riding it. He rode it. The grab stays on X either way; that half was never in
// question.
//
// It still puts the three "hold something while you steer" keys — Shift, X and
// E/Q — on three different fingers, which is what makes holding two of them at
// once possible at all.

import type { SkateInput } from "./skate-model";
// Which controls the touch layer has buttons for is a fact about the TOUCH
// LAYER, so the union lives with it rather than here; this file's own vocabulary
// is `HANDLED` at the bottom, which is the longer list. Type-only, so it costs
// the bundle nothing and the harnesses' type-stripping erases it.
import type { TouchControlCode } from "../ui/touch-controls";

const STEER_SMOOTH = 9; // how fast the stick swings to the pressed direction
/**
 * How stale the last `consume()` may be before this source decides nothing is
 * reading it. A frame is 16 ms and the ride clamps its own step at 100 ms, so
 * a third of a second means the loop is not running: the title screen, the
 * pause modal, a hidden tab.
 *
 * It matters because the latches below are STICKY — they wait for a `consume()`
 * to hand them over. Pressing SPACE to activate DROP IN used to arm the pop
 * (Space fires on release, and the release lands after the menu has already
 * unpaused), so the run began with the skater a frame into an ollie he never
 * asked for. Same for F, G, C and R pressed at a title screen. A keystroke
 * nobody was reading is not input, and it does not queue.
 */
const READ_TIMEOUT_MS = 330;

export class SkateInputSource {
  private held = new Set<string>();
  private olliePressed = false;
  private kickflipPressed = false;
  private heelflipPressed = false;
  private shoveitPressed = false;
  private resetPressed = false;
  private steerSmoothed = 0;
  /**
   * A push during the wind-up calls the jump off. You cannot kick and pop off
   * the same foot, and a player who reaches for speed mid-crouch means the
   * push — so he stands up, pushes, and letting go of Space does nothing.
   * Flicking a flip trick out of the crouch spends it the same way: that pop is
   * gone into the trick, and Space coming up afterwards must not buy a second.
   */
  private chargeSpent = false;
  /** Last frame's push, so the rule above can see the key GO down. */
  private throttleWas = false;
  /** …and last frame's wind-up, so the rule BELOW can see Space go down. */
  private windingWas = false;
  /**
   * The other half of that rule, and it is the player's second sentence about
   * the same two keys: *"press W and hold Space and, until W is released, the
   * push must not fire again — Space takes priority when both are held."*
   *
   * It is the mirror image of `chargeSpent` and the two are decided by WHICH
   * KEY ARRIVED SECOND, because that is the thing the player is actually doing:
   *
   *   · **push already down, Space arrives** — he is rolling and reaches for a
   *     pop. The pop is what he asked for, so the wind-up survives (this is the
   *     "ollie while pushing" bug, fixed and kept) and the KICKS stop instead.
   *     You cannot kick and pop off the same foot either way round; which one
   *     you get is decided by which one you asked for last.
   *   · **Space already down, push arrives** — he is crouched and reaches for
   *     speed. The push is what he asked for, so `chargeSpent` spends the pop.
   *
   * A press of both inside ONE frame is neither, and is left alone: nothing
   * arrived second, so he pushes and he can still pop. That is also why both
   * rules read the OTHER key as it was LAST frame rather than as it is now.
   *
   * **It ends when EITHER key comes up, and round five had only one of those.**
   * The reasoning then was that "while W has not been released" is the player's
   * own wording and letting Space go should not hand the kicks back — which
   * reads the sentence as a clause about W rather than as what it is, a
   * tie-break for two keys held at once. His second report is the cost of
   * reading it the other way: hold W, ollie without letting go of W, land, and
   * the kicks never come back at all, because nothing between the pop and the
   * end of the run ever lifts the key the lock was waiting on. See the two lines
   * in `consume` that end it.
   */
  private pushLocked = false;
  /** When `consume()` last ran. Nothing has read this source until it does. */
  private lastRead = Number.NEGATIVE_INFINITY;
  /**
   * The touch stick's carve axis, and 0 whenever no thumb is on it — which is
   * every frame of every desktop session, because `touchSteer` is its only
   * writer and the touch layer is `touchSteer`'s only caller. That is what makes
   * the one extra test in `consume()` a provable no-op on desktop rather than an
   * argument about one.
   */
  private touchStick = 0;

  /** Is the ride actually reading this frame? See `READ_TIMEOUT_MS`. */
  private live(): boolean {
    return performance.now() - this.lastRead < READ_TIMEOUT_MS;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const code = e.code;
    // Swallowed even when the game is not running: Space still scrolls a page
    // and the title screen is a page.
    if (HANDLED.has(code)) e.preventDefault();
    if (!this.live()) return;
    this.press(code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.release(e.code);
  };

  /**
   * A control went DOWN — a key, or the touch layer's button of the same name.
   *
   * Lifted out of `onKeyDown` on 2026-07-30 so there is exactly ONE of these and
   * both hands run it. The `preventDefault` and the `live()` gate stayed behind
   * with the keyboard on purpose: a browser default is a keyboard's problem, and
   * the touch layer applies the same staleness gate itself in `touchControl`,
   * where it can be read next to the thing it protects.
   */
  private press(code: string): void {
    this.held.add(code);
    if (code === "KeyF") this.kickflipPressed = true;
    if (code === "KeyG") this.heelflipPressed = true;
    if (code === "KeyC") this.shoveitPressed = true;
    if (code === "KeyR") this.resetPressed = true;
  }

  /**
   * …and came up.
   *
   * The pop lives here: however long Space was down is how long he was
   * winding up, and letting go is what springs him off the tail — unless a
   * push or a flick already spent the wind-up.
   *
   * `held` is the gate that makes this safe: a Space the ride never saw go
   * down (the title screen's own DROP IN press) was never added, so its
   * release pops nothing. The same gate is what makes the touch OLLIE button
   * safe for free — a press `live()` dropped was never added either, so lifting
   * the thumb pops nothing.
   */
  private release(code: string): void {
    if (code === "Space" && this.held.has("Space")) {
      if (!this.chargeSpent) this.olliePressed = true;
      this.chargeSpent = false;
    }
    this.held.delete(code);
  }

  private onBlur = (): void => {
    // A lost window is not a jump — drop the wind-up instead of firing it. It
    // also lets go of every held trick, which is what a player who alt-tabbed
    // mid-grab would want to come back to. Shared with the touch layer since
    // 2026-07-30 — see `releaseAll`, which is these five lines under a name.
    this.releaseAll();
  };

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  /** True once per press of R. */
  takeReset(): boolean {
    const r = this.resetPressed;
    this.resetPressed = false;
    return r;
  }

  // --- the touch layer's entry points ---------------------------------------
  //
  // These three are the whole of what `src/controllers/touch/skate-touch-layer.ts`
  // may do to the ride, and the shape is the one this file's header asked for
  // before there was a phone build: the widgets own themselves and FEED this
  // source. Not one of them is a second copy of a rule.

  /**
   * Press or release the control the keyboard reaches with `code`.
   *
   * `press`/`release` are the same two methods a key runs, so a thumb inherits
   * every argument settled in this file: Space pops on the RELEASE and the hold
   * between is the wind-up; F/G/C latch until `consume()` hands them over; X and
   * Shift are true for as long as they are down.
   *
   * The `live()` gate is applied to the DOWN only, exactly as the keyboard has
   * it. A tap while nothing is reading this source — the title screen, the pause
   * card, a hidden tab — is not input and does not queue; a release is always
   * honoured, because `held` already knows whether the press was accepted.
   */
  touchControl(code: TouchControlCode, down: boolean): void {
    if (down) {
      if (!this.live()) return;
      this.press(code);
    } else {
      this.release(code);
    }
  }

  /**
   * The touch stick's carve axis: −1 screen-LEFT … +1 screen-RIGHT, the same
   * sign `KeyD` / `ArrowRight` has, with no flip anywhere between the thumb and
   * here (the chain is traced step by step in the layer's header).
   *
   * Exactly 0 means the stick is not asking and the keys are read instead. So
   * the value is CLAMPED and never snapped: the layer has already taken its dead
   * zone out, and anything nonzero arriving here is a thumb doing it on purpose.
   */
  touchSteer(x: number): void {
    this.touchStick = Math.max(-1, Math.min(1, x));
  }

  /**
   * Drop everything held. A lost window does this (see `onBlur`), and so does
   * the touch layer when its controls leave the screen with a thumb still down:
   * a pause card opening under a finger on OLLIE must not leave him crouched for
   * the length of the pause, and hiding a DOM button fires no `pointerup` to say
   * the finger has gone.
   */
  releaseAll(): void {
    this.held.clear();
    this.chargeSpent = false;
    this.throttleWas = false;
    this.windingWas = false;
    this.pushLocked = false;
    this.touchStick = 0;
  }

  consume(dt: number): SkateInput {
    // Stamped first: from here until the ride stops calling this, a keystroke
    // is gameplay input.
    this.lastRead = performance.now();

    const left = this.held.has("KeyA") || this.held.has("ArrowLeft");
    const right = this.held.has("KeyD") || this.held.has("ArrowRight");
    // D / ArrowRight is +1 — the model turns the skater screen-right on +1.
    const keyed = Math.max(-1, Math.min(1, (right ? 1 : 0) - (left ? 1 : 0)));
    /**
     * THE TOUCH STICK IS A TARGET, exactly the way a key is — it does NOT get a
     * smoother path of its own.
     *
     * It is tempting to read an analogue stick straight through, since a thumb
     * is already smooth and `STEER_SMOOTH` exists to turn two digital keys into
     * an axis. Rejected, for two reasons that both point the same way. The ride
     * is tuned against a steer signal that RAMPS — `turnFactor`, the carve
     * scrub, the lean and `AIR_SPIN_DEADZONE` were all measured behind this
     * ramp — so a second, faster path would give a phone a different game rather
     * than the same one. And a stick snaps to exactly 0 the instant a thumb
     * lifts, where a key ramps down over ~1/9 s; read straight through, letting
     * go mid-air would cut a spin dead. One ramp, both hands, and a stick at
     * deflection d is now byte-identical to a key held at d.
     *
     * Nonzero is the whole test, and it is why this is a no-op on desktop.
     */
    const target = this.touchStick !== 0 ? this.touchStick : keyed;
    const k = 1 - Math.exp(-STEER_SMOOTH * dt);
    this.steerSmoothed += (target - this.steerSmoothed) * k;

    // V is the push key the player asked for; W and Up push too, so the
    // hand that is already steering never has to leave the home keys.
    const pushDown =
      this.held.has("KeyV") || this.held.has("KeyW") || this.held.has("ArrowUp");
    // Read here rather than in the key handler, so a flick and a push spend the
    // wind-up on the same frame the ride is about to act on.
    const flicked = this.kickflipPressed || this.heelflipPressed || this.shoveitPressed;
    const winding = this.held.has("Space");
    // The player's rule is about REACHING for the push mid-crouch, so it is the
    // moment the push starts that calls the jump off — not the push key merely
    // being down. Read as a level it also ate the pop of anyone already rolling
    // on the throttle, which is every approach to a stair set or a coping:
    // measured on this source, W held + Space held six frames + release gave
    // `olliePressed` false on every frame, so the six-stair and the pop at the
    // lip were both unreachable with the key that gets you the speed to reach
    // them. An edge keeps the rule and gives the key back.
    const pushStarted = pushDown && !this.throttleWas;
    if ((pushStarted || flicked) && this.windingWas) this.chargeSpent = true;
    // …and the other way round: Space arriving on top of a push already down
    // locks the kicks out instead of losing the pop. See `pushLocked`.
    if (winding && !this.windingWas && this.throttleWas) this.pushLocked = true;
    if (!pushDown) this.pushLocked = false;
    // …and SPACE coming up is the other end of the lock, which it did not have.
    //
    // The rule it enforces is about two keys HELD AT ONCE — "Space takes
    // priority when both are held" — and once Space is up they are not: the
    // wind-up has been spent on the pop, the foot the two were arguing over is
    // free, and a player still leaning on W is asking for speed. Ended only when
    // W came up, the lock outlived the argument by the whole rest of the run:
    // hold W, ollie, land still holding W, and the kicks never came back. That
    // is the player's own second report, and it is one line of it.
    //
    // It hands the key back in the AIR, which is where it should be handed back
    // rather than in spite of it — `SkateModel` only kicks with the wheels down,
    // its whole push block sitting inside `if (grounded)` — so what the player
    // sees is the push resuming on the frame he lands, still holding W.
    if (!winding && this.windingWas) this.pushLocked = false;
    this.throttleWas = pushDown;
    this.windingWas = winding;
    const throttle = pushDown && !this.pushLocked;

    const input: SkateInput = {
      throttle,
      brake: this.held.has("KeyS") || this.held.has("ArrowDown"),
      steer: this.steerSmoothed,
      // Spending the wind-up stands him back up on the spot — the crouch is
      // released the same frame the push begins, not when Space comes up.
      chargeHeld: winding && !this.chargeSpent,
      olliePressed: this.olliePressed,
      kickflipPressed: this.kickflipPressed,
      heelflipPressed: this.heelflipPressed,
      shoveitPressed: this.shoveitPressed,
      // The grab moved here off Shift on 2026-07-29: it is the SHORT hold — a
      // stab in the air that is over by the landing — and the curled-under
      // reach that makes X wrong for a grind is fine for a stab. See the
      // header block for the whole of the reasoning.
      grabHeld: this.held.has("KeyX"),
      // THE MANUAL MOVED TO SHIFT on 2026-07-29, second swap of the day, at the
      // player's word once he had ridden the first one: *"поменяй еще
      // пожалуйста shift и E."* Both of these are multi-second holds fought
      // against A/D, so the pinky's home key was always going to be wanted by
      // one of them; having ridden both he wants it under the manual. Nothing
      // else about either trick changes.
      manualHeld: this.held.has("ShiftLeft") || this.held.has("ShiftRight"),
      noseManualHeld: this.held.has("KeyQ"),
      // Held, not tapped, and not a toggle. A toggle is a mode you can be in
      // without knowing it, and a mode that survives a bail, a reset and a
      // minute of not thinking about it is its own way of being surprised.
      //
      // WHAT IT MEANS NOW IS NARROWER THAN WHEN IT ARRIVED. It used to gate
      // every catch — no rail took you without it — and the player has since
      // asked for the opposite: *"let's make rail sliding activate when I simply
      // ride onto it, without holding a button."* So riding onto a line needs no
      // key, and this one is down to a single job: the deck laid SQUARE across a
      // line instead of run down it. That entry keeps a key because it is the
      // only one no geometry can name — coming at a bar sideways and popping is
      // both how you boardslide and how you hop the thing to get past it, same
      // approach and same arc, 165 of 1432 measured. See
      // `SkateModel.tryCatchGrind` and `tools/grind-auto.mjs`.
      //
      // The KEY did not move: E is a fingertip reach from W with no curl, and it
      // is no longer a multi-second hold at all — a square entry is asked for in
      // the instant before the deck lands, so the finger that was being spared
      // for the length of a handrail has less to do than it did.
      slideHeld: this.held.has("KeyE"),
    };
    this.olliePressed = false;
    this.kickflipPressed = false;
    this.heelflipPressed = false;
    this.shoveitPressed = false;
    return input;
  }
}

const HANDLED = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyC",
  "KeyE",
  "KeyF",
  "KeyG",
  "KeyQ",
  "KeyR",
  "KeyV",
  "KeyX",
  "Space",
  // Both Shifts, since the MANUAL moved onto them (the grind held them for one
  // round before the second swap). A Shift that reaches the page does nothing on
  // its own — unlike Space, which scrolls it — but this set is every key the
  // ride reads, and a gameplay key missing from it is the kind of gap that only
  // shows up the day the page grows something that listens.
  "ShiftLeft",
  "ShiftRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);
