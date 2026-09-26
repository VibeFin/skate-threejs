// The phone's hands — THE GATE, and deliberately nothing else.
//
// On mobile the game rendered and then did nothing: no way to push, no way to
// steer, no way to pop. This module is the door that lets the touch layer in.
// It is the whole of what a DESKTOP session ever sees of that layer, and what it
// sees is a function that returns `null` before it has touched the DOM.
//
// **THE DESKTOP NO-OP IS STRUCTURAL, NOT A GUARD.** The player's rule for this
// work was that a desktop session must not gain a single DOM node, event
// listener or pixel — so "a runtime `if` around some `createElement` calls" is
// not good enough, because that is exactly the shape that fails OPEN the day
// somebody moves the `if`. Three separate structural facts, and each one is
// enough on its own:
//
//   1. **The widgets live in another module, reached only by `import()`.**
//      Everything that can create an element or add a listener is in
//      `src/controllers/touch/skate-touch-layer.ts`, which is imported
//      DYNAMICALLY, below the gate. Vite emits it as its own chunk: a desktop
//      session never fetches it, never parses it, never evaluates it. There is
//      no unreachable-but-present branch to audit — on desktop the code is not
//      in the page at all.
//   2. **This file contains no DOM.** Grep it: no `document`, no
//      `createElement`, no `addEventListener`. The only way a node can appear is
//      for (1) to have loaded.
//   3. **The handle is `null`, so every call site is optional-chained.**
//      `touch?.setPlaying(…)` on `null` cannot mutate anything. The boot's
//      desktop path is therefore the path that runs today, plus one `matchMedia`
//      read and one already-resolved `await`.
//
// WHAT COUNTS AS "TOUCH IS THE PRIMARY INPUT". `navigator.maxTouchPoints > 0`
// is the kit's own suggestion and it is WRONG for this game: it is true on every
// touch-screen laptop, and a touch-screen laptop is a desktop session with a
// keyboard in front of it — precisely the session that must not change. The
// media query below asks the question the player actually asked: is the primary
// pointing device coarse, and can it hover? A finger is coarse and cannot hover;
// a trackpad is fine and can. A Surface with a touch screen answers
// `(pointer: fine) and (hover: hover)` because the media query reports the
// PRIMARY device, so it stays a desktop.
//
// It is also the query `ui/hud.ts` already uses to hide the keycap control rail
// (`@media (pointer: coarse)`), which matters more than it looks: if this gate
// and that rule ever disagreed you would get a keycap legend AND a joystick on
// the same screen, or neither. The extra `and (hover: none)` here is the
// narrower of the two on purpose — a coarse pointer that CAN hover (a pen on a
// laptop) loses the keycaps but does not gain thumb controls, which is the safe
// side of the disagreement to be on.
//
// `maxTouchPoints` survives as a second condition and not as the first: a device
// that reports a coarse hoverless pointer and zero touch points is a TV or a
// set-top box, and a joystick you drive with a D-pad is furniture.

/**
 * The primary-pointer test, as one string so it is greppable and so the reason
 * it is not `maxTouchPoints` is written in exactly one place (the header).
 */
const TOUCH_PRIMARY_QUERY = "(pointer: coarse) and (hover: none)";

/**
 * EVERY CONTROL A THUMB MAY PRESS, named by the key the keyboard reaches it
 * with — because a thumb presses the same controls a hand does, and saying so in
 * the type is what stops the phone growing a second, subtly different game.
 *
 * It lives HERE and not in `src/skate/input.ts` on purpose: "which keys the
 * touch layer has buttons for" is a fact about the touch layer. The ride's own
 * vocabulary is `HANDLED` in that file, which is a longer list — a code in this
 * union that the ride does not read would simply do nothing, and a code the ride
 * reads that is not in this union is a control the phone has decided not to
 * carry (heelflip, shove-it, nose manual, slide-across; see the layer's own
 * area-budget note).
 */
export type TouchControlCode =
  | "KeyW"
  | "KeyS"
  | "Space"
  | "KeyF"
  | "KeyG"
  | "KeyC"
  | "KeyX"
  | "ShiftLeft"
  | "KeyQ"
  | "KeyE"
  | "KeyR";

/**
 * What the touch layer needs of the ride's input source, and nothing more.
 *
 * Declared as an interface rather than imported as `SkateInputSource` so the
 * dependency runs ONE way: the touch layer states its three requirements, the
 * ride satisfies them, and this module never learns what a `SkateInput` is. It
 * is also what makes the layer testable and the boot's wiring a structural
 * check — if the source ever stops offering one of these, the failure lands in
 * `main.ts` at the call site rather than somewhere inside a phone-only chunk.
 *
 * All three are satisfied by `SkateInputSource`, and the whole reason the layer
 * goes through them instead of building its own `SkateInput` is that the ride's
 * input rules are not simple: a push that starts during a wind-up spends the
 * pop, a wind-up that starts during a push locks the kicks out instead, and a
 * keystroke nothing is reading does not queue. Written once, obeyed by both
 * hands.
 */
export interface TouchInputSink {
  /**
   * Press (`true`) or release (`false`) the control the keyboard reaches with
   * `code`. Identical semantics to the key: the release of `"Space"` is the pop,
   * an edge-triggered code latches until the ride consumes it, and a press
   * arriving while nothing is reading the source is dropped rather than queued.
   */
  touchControl(code: TouchControlCode, down: boolean): void;
  /**
   * The stick's carve axis: −1 screen-LEFT … +1 screen-RIGHT, the same sign
   * `KeyD` / `ArrowRight` has. Exactly 0 means "the stick is not asking", and
   * the keys are read instead.
   */
  touchSteer(x: number): void;
  /** Drop everything held, the way a lost window does. */
  releaseAll(): void;
}

export interface TouchControlsOptions {
  /**
   * The ride's own input source. The touch widgets feed THIS and nothing else —
   * they never build a second `SkateInput`, so every rule the keyboard is
   * subject to applies to a thumb without being written twice. See
   * `TouchInputSink` above and the touch entry points in `src/skate/input.ts`.
   */
  input: TouchInputSink;
  /**
   * Tapped pause. Escape has no key on a phone, so the same intent needs a
   * target: wire it to whatever Escape is wired to.
   */
  onPause: () => void;
  /**
   * The rotate-your-phone overlay went up (true) or came down (false). Portrait
   * genuinely breaks this game — see the layer — so the boot should pause on
   * `true`; it deliberately does not resume on `false`, because a card the
   * player has to dismiss is the honest way back into a run they were in the
   * middle of.
   */
  onOrientationBlock?: (blocked: boolean) => void;
}

export interface TouchControls {
  /**
   * Controls are on screen only while the ride is actually being played. Called
   * with `false` for the title screen, the pause card and the settings screen —
   * and it also DROPS anything a thumb was holding, silently: a pause card that
   * opens under a finger on OLLIE must not pop him when the finger lifts.
   */
  setPlaying(playing: boolean): void;
  dispose(): void;
}

/**
 * Build the phone's controls, or return `null` because there is no phone.
 *
 * `null` is the desktop answer and it is returned BEFORE the `import()`, which
 * is the whole design — see the header. Callers keep the handle and
 * optional-chain it; there is no second "is this a phone" test anywhere in the
 * game.
 */
export async function createTouchControls(
  options: TouchControlsOptions,
): Promise<TouchControls | null> {
  if (typeof window === "undefined" || typeof matchMedia !== "function") return null;
  if (!matchMedia(TOUCH_PRIMARY_QUERY).matches) return null;
  if (navigator.maxTouchPoints < 1) return null;
  const { createSkateTouchLayer } = await import("../controllers/touch/skate-touch-layer");
  return createSkateTouchLayer(options);
}
