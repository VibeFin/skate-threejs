// The phone's hands — THE LAYER. Built only on a phone; see `src/ui/touch-controls.ts`
// for the gate and for why a desktop session never loads this file at all.
//
// WHAT THIS GAME'S CORE VERB IS, because the layout is derived from it and not
// from a template: you roll, you LOAD a crouch by holding a button, and you POP
// by letting it go — all while the other hand is holding a carve through the
// arc you want to land in. So the phone needs exactly two things to be good: one
// analogue axis that can be held off-centre for seconds at a time, and one big
// holdable button that reads as holdable. Everything else is garnish arranged
// around those two.
//
// ── THE LEFT THUMB IS THE WASD CLUSTER, not "a movement stick" ───────────────
// The keyboard's steer/push/brake are one four-key cluster under one hand
// (W/S = push/brake, A/D = carve, spin and the balance fight), so the touch
// version is one two-axis stick under one thumb: +y pushes, −y brakes, x carves.
// That is worth spelling out because the alternative — throttle as a held button
// on the right — was rejected on a measurable ground: the right thumb is already
// the whole trick vocabulary, and a held throttle there would mean the player
// cannot push and pop, which is the game's core verb.
//
// The stick is STATIC (a fixed circle), not `floating: true`, for three reasons.
// A carve is a sustained, PRECISE hold — the balance gauge is fought with this
// axis for the whole length of a handrail — and a centre that re-anchors
// wherever the thumb happened to land takes away the one reference a thumb has
// (its distance from the corner of the phone). A floating zone is also 45vw x
// 60vh of the screen, and every touch inside it is swallowed: that is most of
// the camera's drag area gone. And the resting hint of a floating stick is a
// widget that MOVES, which is the opposite of what a fixed control wants to be.
//
// Push and brake come off the stick through a HYSTERESIS GATE, and the gap is
// load-bearing rather than tidiness: `SkateInputSource` spends the wind-up when
// a push STARTS while Space is held (that is the player's own rule — you cannot
// kick and pop off the same foot). A stick sitting exactly on a single threshold
// chatters, and every chatter is a fresh push edge, so a bare threshold would
// silently eat the pop of anybody holding OLLIE with the stick near the gate.
// Engage above 0.45 (26.7° up from the horizontal), release below 0.30 (17.5°).
//
// ── THE RIGHT THUMB IS THE TRICK HAND, and it holds FOUR controls ────────────
// OLLIE sits in the corner, at the thumb's home, at 1.5x the size of anything
// else — the loudest statement the layout can make about which button matters.
// FLIP, GRAB and MANUAL sit on an arc around it.
//
// FOUR, and the number is an area budget rather than a preference. The
// comfortable quarter-annulus around a right thumb pivoting at the bottom-right
// corner runs r = 55…190 px, which is (pi/4)(190^2 - 55^2) = 25,970 px^2. One
// 104 px OLLIE plus three 72 px buttons is 26,368 px^2 of bounding box. A fifth
// widget does not fit inside the reach without pushing something to r > 220,
// which is a hand-shift and not a thumb-stretch. So the phone does NOT have
// heelflip (G), 360 shove-it (C), nose manual (Q) or slide-across (E), and each
// one of them is ONE ROW of `RIDE_CLUSTER` away if the player would rather trade
// the comfort for the trick. Every VERB survives the cut — push, brake, carve,
// spin, ollie, flip, grab, manual, and grinds, which need no button at all since
// they start on contact — and what is missing is a second flavour of three of
// them.
//
// Sizes are in PX and anchored to the corners, never in vw/vh: a thumb is the
// same size on a 667 px SE and an 844 px iPhone 15, so a control that scaled
// with the viewport would be wrong on both. Worked out on both, from a thumb
// pivoting 24 px in and 10 px up from the corner, and the point of anchoring to
// the corner is that the four numbers barely move: OLLIE 64/66, FLIP 142/144,
// GRAB 151/151, MANUAL 186/187. The live DOM agrees — the widgets measure at
// centres (782, 328), (684, 338), (790, 232), (696, 242) on an 844x390 phone.
//
// ── THE CAMERA IS NOT IN HERE, AND THAT IS A DECISION ────────────────────────
// The kit's `DragZone` is the usual recipe for touch look, and this game must
// NOT use it. `FollowCamera` already orbits on a one-finger canvas drag and
// pinch-zooms on two (follow-camera.ts: "Drag right pans the view right"), and
// `camera/skate-camera.ts` says in as many words that a phone's look IS that
// transient drag-orbit. A DragZone over the right half would sit on top of the
// canvas at zIndex 5 and SWALLOW those touches — it would replace a working look
// with a second one, and two drag surfaces is exactly the "diagonals feel
// twisted" bug the direction contract is about. So the widgets below are small
// islands and everything that is not one of them falls through to the canvas.
// One drag convention in the game, and it is the one that was already verified.
//
// ── SCREEN DIRECTION, TRACED RATHER THAN ASSUMED (AGENTS.md rule 17) ─────────
// A mirrored axis is this lane's most common bug, so the chain is written out:
//   1. `TouchJoystick.#move`: `#x = (clientX - centerX) / maxRadius`. A thumb
//      moving screen-RIGHT raises clientX, so `joy.x > 0` for screen-right.
//   2. `#y = -(clientY - centerY) / maxRadius`. A thumb moving UP lowers clientY,
//      so `joy.y > 0` for screen-up. (The one negation in the widget.)
//   3. This file passes `joy.x` straight to `input.touchSteer(x)` with NO sign
//      change, and +y presses KeyW while −y presses KeyS.
//   4. `skate/input.ts`: "D / ArrowRight is +1 — the model turns the skater
//      screen-right on +1", and `skate-model.ts`'s header derives that minus
//      from `forward = (sin h, 0, cos h)` with the camera behind it.
// So stick-right IS D IS screen-right, by three files agreeing rather than by
// one file guessing. Verified by riding it, not by reading it — see the report.
//
// ── NO PLATES (AGENTS.md rule 6) ─────────────────────────────────────────────
// Nothing here draws a rectangle behind anything. Each control is a circle and
// the ornament — a hairline ring, and a second concentric ring on the HOLDS —
// lives on that circle's own silhouette. The dark wash inside a cap is the
// widget's own disc rather than a plate behind type: without it a hairline
// button disappears against golden-hour concrete, which is the one lighting this
// game has.
//
// Type and colour are the HUD's, copied as literals with the values spelled out
// because this layer is its own DOM tree on `document.body` and cannot inherit
// `#hud`'s custom properties. Barlow Condensed 700 caps (the brief's condensed
// body face), `--bone #eafff2`, `--gold #ffd23d`, and the HUD's `--ink` shadow
// pair so a label survives both bright concrete and shadow.
//
// ── WHY Z-INDEX 16 AND NOT THE KIT'S 10 ─────────────────────────────────────
// MEASURED, because the first build of this layer was completely dead to the
// touch and the reason was not in this file. `ui/menu.ts` mounts `#ui` as
// `position: fixed; inset: 0; z-index: 15` with pointer-events left at `auto`,
// and it stays in the document with `display: block` for the whole of play — the
// menu SCREENS inside it turn their own pointer-events on and off, the root never
// does. So `document.elementFromPoint` returns `DIV#ui` for every pixel of the
// screen while the game is running, at the stick's centre and at the ollie
// button's alike, and nothing underneath it was ever hit-tested.
//
// Desktop cannot see this bug: during play the pointer is LOCKED, and a lock
// bypasses hit-testing entirely by routing every event to the lock element. That
// is also the reason it is worth reporting rather than only working around —
// anything the game wants CLICKED while unlocked is under the same lid, the
// results card's own GO AGAIN and FREE RIDE included.
//
// 16 is the smallest number that clears it, and it keeps the ordering the kit
// asks for at the top end: still UNDER the pause card (18) and the settings
// screen (19), which are the two things that must be able to cover these.

import { TouchJoystick, VirtualButton } from "./touch-joystick";
import { RotateOverlay } from "./rotate-overlay";
import type {
  TouchControlCode,
  TouchControls,
  TouchControlsOptions,
} from "../../ui/touch-controls";

// --- the palette, copied from `ui/hud.ts`'s :root ---------------------------
const BONE = "234, 255, 242";
const GOLD = "255, 210, 61";
const INK = "0 2px 7px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.85)";
const BODY_FONT = '"Barlow Condensed", system-ui, sans-serif';
/** Over the menu root's lid, under the pause card — see the header's Z note. */
const WIDGET_Z = "16";

// --- the stick -------------------------------------------------------------
/** The stick's interactive square, px. Its corner offset is `STICK_INSET`. */
const STICK_ZONE = 152;
/** The visible reference circle the deflection is measured against, px. */
const STICK_BASE = 104;
/** The knob, px. */
const STICK_KNOB = 58;
/** Full deflection at this many px of travel — a comfortable thumb arc. */
const STICK_RADIUS = 48;
const STICK_INSET = 10;
/**
 * Radial dead zone, rescaled so full deflection is still exactly 1.
 *
 * The keyboard's steer is exactly 0 at rest; a thumb resting 6% off centre is
 * not, and `TURN_RATE * 0.06` is a slow constant drift that reads as the board
 * pulling to one side. 0.12 is under the smallest deflection a thumb makes on
 * purpose and over the largest one it makes by accident.
 */
const STICK_DEADZONE = 0.12;
/** Push/brake engage above this on the stick's y — 26.7° up from horizontal. */
const AXIS_ENGAGE = 0.45;
/** …and release below this — 17.5°. The gap is the anti-chatter; see the header. */
const AXIS_RELEASE = 0.3;

// --- the buttons -----------------------------------------------------------
interface ButtonSpec {
  /** What the cap says. Uppercase; the label IS the manual on a phone. */
  readonly label: string;
  /** The key this control presses. One code, so dropping a control is one row. */
  readonly code: TouchControlCode;
  /**
   * A HOLD is a state you are in for as long as the thumb is down (the wind-up,
   * the grab, the manual); a TAP is one you throw and it is over. Holds wear a
   * second concentric ring, which goes gold while they are live — the affordance
   * the player asked for when he asked for a button that reads as holdable.
   *
   * The ring is a STATE and not a meter, deliberately: holding OLLIE longer does
   * not buy a higher ollie (`main.ts`: "Holding longer just holds the crouch"),
   * so a ring that filled up over time would be drawing a charge the ride does
   * not have.
   */
  readonly hold: boolean;
  /** The wrapper, px — the touch target. Never below 44. */
  readonly hit: number;
  /** The visible cap, px. */
  readonly cap: number;
  readonly font: number;
  /** Corner offsets, px, before the safe-area inset is added. */
  readonly right: number;
  readonly bottom: number;
}

/**
 * THE RIDE CLUSTER — one row per control, and the order is the order they are
 * reached for.
 *
 * Adding or dropping a control is one row of this table and nothing else, which
 * is the point of its being a table: the grind lane is making rails catch on
 * contact, and when SLIDE-ACROSS (`KeyE`) stops being a thing a player has to
 * ask for, the row that would have carried it never has to be written. If it is
 * wanted on the phone before then it goes at `right: 196, bottom: 44` — the
 * outer slot at r = 224, a hand-shift rather than a thumb-stretch, which is the
 * right price for a split-second stab that a whole trick depends on.
 */
const RIDE_CLUSTER: readonly ButtonSpec[] = [
  // THE POP, at the thumb's home and half again the size of its neighbours.
  // Space is the odd key in the whole game — it pops on RELEASE, and the hold in
  // between is the wind-up crouch — so this is the one button whose press and
  // release are two different events in the ride, and the only one that needs
  // its state drawn.
  { label: "OLLIE", code: "Space", hold: true, hit: 104, cap: 82, font: 15, right: 10, bottom: 10 },
  // The signature trick, and the only flip the phone carries. Left of OLLIE
  // rather than above it because a flip is thrown WHILE popping — the thumb
  // rolls sideways off the ollie, it does not travel.
  { label: "FLIP", code: "KeyF", hold: false, hit: 72, cap: 56, font: 12, right: 124, bottom: 16 },
  // Air-only and a fraction of a second long, so it wants to be a stab straight
  // up from the resting thumb.
  { label: "GRAB", code: "KeyX", hold: true, hit: 72, cap: 56, font: 12, right: 18, bottom: 122 },
  // The far corner of the cluster, and it earns it: a manual is the one hold
  // measured in seconds, so the thumb has time to travel and then time to stay.
  {
    label: "MANUAL",
    code: "ShiftLeft",
    hold: true,
    hit: 72,
    cap: 56,
    font: 10,
    right: 112,
    bottom: 112,
  },
];

/**
 * The two controls that are NOT ride input, top-right, out of both thumb arcs.
 *
 * They are up here because a mis-tap on either costs the player the thing they
 * were doing — a reset in the middle of a good line, a pause in the middle of a
 * minute — so they belong where a thumb does not go by accident. Small (46 px,
 * the floor) and quiet (a dimmer ring) for the same reason.
 *
 * The top-right corner is genuinely free: the HUD's score rail is top-LEFT, the
 * run clock is a centred band, and the keycap control rail that used to be
 * bottom-right is already `display: none` on a coarse pointer.
 */
const PAUSE_SPEC = { hit: 46, cap: 34, font: 9, right: 10, top: 8 };
const RESET_SPEC = { hit: 46, cap: 34, font: 9, right: 62, top: 8 };

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** `12px + the notch`, for one edge. Landscape puts the notch left OR right. */
function inset(base: number, edge: "left" | "right" | "top" | "bottom"): string {
  return `calc(${base}px + env(safe-area-inset-${edge}))`;
}

/** The cap's resting look, shared by every control; size and type vary. */
function capStyle(size: number, font: number, dim: boolean): Partial<CSSStyleDeclaration> {
  return {
    width: `${size}px`,
    height: `${size}px`,
    // The disc, not a plate: a hairline circle alone vanishes over lit concrete,
    // which is what this whole spot is made of.
    background: "rgba(8, 10, 20, 0.2)",
    border: `1.5px solid rgba(${BONE}, ${dim ? 0.3 : 0.44})`,
    color: `rgba(${BONE}, ${dim ? 0.8 : 0.95})`,
    fontFamily: BODY_FONT,
    fontWeight: "700",
    fontSize: `${font}px`,
    letterSpacing: "0.1em",
    textShadow: INK,
  };
}

/** The HOLD's second ring — concentric on the cap's own circle, never a box. */
const HOLD_RING: Partial<CSSStyleDeclaration> = {
  outline: `1px solid rgba(${BONE}, 0.24)`,
  outlineOffset: "5px",
};

/** …and what it looks like while the hold is live: gold, the game's EARNING colour. */
const HOLD_RING_LIVE: Partial<CSSStyleDeclaration> = {
  outline: `1px solid rgba(${GOLD}, 0.85)`,
  outlineOffset: "5px",
  borderColor: `rgba(${GOLD}, 0.9)`,
  color: `rgb(${GOLD})`,
};

/** A tap has no state to draw, so its press is a flash of the same gold. */
const TAP_FLASH: Partial<CSSStyleDeclaration> = {
  borderColor: `rgba(${GOLD}, 0.9)`,
  color: `rgb(${GOLD})`,
};

/**
 * Build the layer. Only ever called from `createTouchControls`, and only on a
 * device whose primary pointer is a finger.
 */
export function createSkateTouchLayer(options: TouchControlsOptions): TouchControls {
  const { input } = options;

  // --- the stick ------------------------------------------------------------
  /**
   * Which axis keys the stick is currently holding down. Kept here rather than
   * asked of the source, because it is the HYSTERESIS' own memory: whether the
   * gate is open decides which threshold applies next.
   */
  const axisDown = { KeyW: false, KeyS: false };

  const gate = (code: "KeyW" | "KeyS", value: number): void => {
    const open = axisDown[code] ? value > AXIS_RELEASE : value > AXIS_ENGAGE;
    if (open === axisDown[code]) return;
    axisDown[code] = open;
    // Through the same door a key goes through, so the push/pop tie-break, the
    // spent wind-up and the staleness gate all see a thumb as a keystroke.
    input.touchControl(code, open);
  };

  const stick = new TouchJoystick({
    maxRadius: STICK_RADIUS,
    wrapperStyle: {
      zIndex: WIDGET_Z,
      width: `${STICK_ZONE}px`,
      height: `${STICK_ZONE}px`,
      borderRadius: "0",
      left: inset(STICK_INSET, "left"),
      bottom: inset(STICK_INSET, "bottom"),
    },
    baseStyle: {
      width: `${STICK_BASE}px`,
      height: `${STICK_BASE}px`,
      background: "rgba(8, 10, 20, 0.14)",
      border: `1.5px solid rgba(${BONE}, 0.32)`,
    },
    knobStyle: {
      width: `${STICK_KNOB}px`,
      height: `${STICK_KNOB}px`,
      background: `rgba(${BONE}, 0.26)`,
      border: `1.5px solid rgba(${BONE}, 0.55)`,
    },
    onChange: (rawX, rawY) => {
      // The dead zone is RADIAL and rescaled, so the axis still reaches exactly
      // 1 at full travel — a linear-per-axis dead zone would cap a diagonal at
      // 0.88 and quietly make a carve-and-push weaker than either alone.
      const mag = Math.hypot(rawX, rawY);
      let x = 0;
      let y = 0;
      if (mag > STICK_DEADZONE) {
        const k = (mag - STICK_DEADZONE) / ((1 - STICK_DEADZONE) * mag);
        x = clamp(rawX * k, -1, 1);
        y = clamp(rawY * k, -1, 1);
      }
      // No sign change here, and that is the whole of the direction contract for
      // this axis — see the header's four-step trace.
      input.touchSteer(x);
      gate("KeyW", y);
      gate("KeyS", -y);
    },
  });

  // --- the buttons ----------------------------------------------------------
  const buttons: VirtualButton[] = [];

  for (const spec of RIDE_CLUSTER) {
    buttons.push(
      new VirtualButton({
        label: spec.label,
        wrapperStyle: {
          zIndex: WIDGET_Z,
          width: `${spec.hit}px`,
          height: `${spec.hit}px`,
          right: inset(spec.right, "right"),
          bottom: inset(spec.bottom, "bottom"),
        },
        capStyle: spec.hold
          ? { ...capStyle(spec.cap, spec.font, false), ...HOLD_RING }
          : capStyle(spec.cap, spec.font, false),
        capPressedStyle: spec.hold ? HOLD_RING_LIVE : TAP_FLASH,
        onPress: () => input.touchControl(spec.code, true),
        onRelease: () => input.touchControl(spec.code, false),
      }),
    );
  }

  // RESET. Pressed and released in one gesture like every other tap; the ride
  // reads it through `takeReset()`, which is the same latch R sets.
  buttons.push(
    new VirtualButton({
      label: "RESET",
      wrapperStyle: {
        zIndex: WIDGET_Z,
        width: `${RESET_SPEC.hit}px`,
        height: `${RESET_SPEC.hit}px`,
        right: inset(RESET_SPEC.right, "right"),
        top: inset(RESET_SPEC.top, "top"),
      },
      capStyle: capStyle(RESET_SPEC.cap, RESET_SPEC.font, true),
      capPressedStyle: TAP_FLASH,
      onPress: () => input.touchControl("KeyR", true),
      onRelease: () => input.touchControl("KeyR", false),
    }),
  );

  // PAUSE — the one control that is not ride input at all. It does not go
  // through `SkateInputSource`, because Escape does not either: the boot owns
  // the pause key (`skate/input.ts` says so), so this raises the same intent.
  // The glyph is two bars, in text, because a drawn icon here would be the only
  // picture in a HUD made entirely of type.
  buttons.push(
    new VirtualButton({
      label: "II",
      wrapperStyle: {
        zIndex: WIDGET_Z,
        width: `${PAUSE_SPEC.hit}px`,
        height: `${PAUSE_SPEC.hit}px`,
        right: inset(PAUSE_SPEC.right, "right"),
        top: inset(PAUSE_SPEC.top, "top"),
      },
      capStyle: {
        ...capStyle(PAUSE_SPEC.cap, PAUSE_SPEC.font + 4, true),
        letterSpacing: "0.22em",
        // The two bars read as a pause glyph only if they are not centred as a
        // word — the tracking pushes the second bar out and this pulls the pair
        // back over the middle of the cap.
        textIndent: "0.22em",
      },
      capPressedStyle: TAP_FLASH,
      onPress: () => options.onPause(),
    }),
  );

  // --- orientation ----------------------------------------------------------
  /**
   * PORTRAIT GENUINELY BREAKS THIS GAME, which is the test the kit sets for
   * showing this overlay at all rather than just resizing. The camera's 62°
   * field of view is VERTICAL (`main.ts` builds the PerspectiveCamera with it),
   * so the horizontal view is the vertical one times the aspect ratio: 844x390
   * landscape sees 100° across, 390x844 portrait sees 32°. A skate line is aimed
   * at a ledge you have to be able to SEE before you reach it, and 32° is a
   * letterbox pointed at your own back. The four corners the controls live in do
   * not exist in portrait either.
   *
   * The overlay is restyled from here rather than in `rotate-overlay.ts`: it is
   * a vendored widget, it exposes its own element for exactly this, and a game's
   * type belongs to the game.
   */
  const rotate = new RotateOverlay({
    orientation: "landscape",
    message: "Turn your phone sideways",
    onChange: (blocked) => {
      if (blocked) release();
      options.onOrientationBlock?.(blocked);
    },
  });
  Object.assign(rotate.element.style, {
    fontFamily: BODY_FONT,
    fontWeight: "700",
    fontSize: "17px",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: `rgba(${BONE}, 0.92)`,
    background: "rgba(8, 10, 20, 0.95)",
  });

  /**
   * Let go of everything, silently.
   *
   * SILENTLY is the whole reason this is not just "hide the widgets". Hiding a
   * pressed button with `display: none` fires no `pointerup`, so without this a
   * pause card opening under a thumb on OLLIE would leave Space held in the ride
   * for the whole pause, and the button itself would be dead on the way back
   * (its pointer id is still claimed, so the next press is ignored as a second
   * finger). `VirtualButton.cancel()` drops the press without announcing a
   * release — announcing one would POP him, out of a pause, which is exactly
   * what a player who pressed pause did not ask for.
   *
   * The stick is the other way round: its reset SHOULD be announced, because the
   * announcement is what walks the push/brake gate back down and zeroes the
   * carve.
   */
  function release(): void {
    stick.reset();
    for (const button of buttons) button.cancel();
    // …and the source's own memory of what was held, which is the same thing an
    // alt-tab does to a keyboard.
    input.releaseAll();
  }

  const widgets: { setVisible(visible: boolean): void; dispose(): void }[] = [stick, ...buttons];
  // Off at construction. The boot builds this layer while it is still paused
  // behind the title screen, and `setPlaying` is driven from the one place that
  // already knows whether the game is running.
  for (const widget of widgets) widget.setVisible(false);

  return {
    setPlaying(playing: boolean): void {
      if (!playing) release();
      for (const widget of widgets) widget.setVisible(playing);
    },
    dispose(): void {
      release();
      for (const widget of widgets) widget.dispose();
      rotate.dispose();
    },
  };
}
