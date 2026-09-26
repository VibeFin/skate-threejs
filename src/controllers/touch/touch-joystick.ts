// SPDX-FileCopyrightText: 2023-2026 Erdong Chen
// SPDX-License-Identifier: MIT
// Vanilla-TS port of the ecctrl controller's touch input (Joystick + VirtualButton DOM/CSS
// widgets; React/zustand shells removed — per-instance state + callbacks instead of stores).
//
// Port notes / deliberate deviations from upstream:
// - NEW: `setPointerCapture` on pointerdown keeps drags alive outside the wrapper
//   (upstream relied on `pointerleave` alone; that reset path is kept for parity when
//   capture is unavailable), and `pointercancel` resets too (browsers fire it when the
//   OS steals the gesture).
// - NEW: one active pointer per widget (tracked by pointerId) — a second finger landing
//   on the same widget is ignored instead of re-anchoring the drag.
// - NEW: safe default positions. When the caller's `wrapperStyle` sets no
//   left/right/top/bottom/inset, the joystick parks bottom-left and the button
//   bottom-right, both offset by `env(safe-area-inset-*)` so nothing hides under a
//   notch or home indicator. Any caller-provided position wins wholesale (the default
//   is skipped entirely, so positioning via `right` never fights a default `left`).
// - NEW: `floating: true` joystick mode — the wrapper becomes a large touch zone and
//   the stick appears centered under the thumb, with a faint resting hint at the
//   default spot so players can discover it. Static (fixed circle) stays the default.
// - Restyled defaults (translucent glass instead of upstream's solid white discs,
//   `system-ui` labels with a shadow instead of LightGray-on-white Arial, buttons
//   compress on press instead of inflating). All still overridable per style option.
// - `VirtualButton.dispose()` resets only ITS OWN state (upstream unmount reset ALL buttons).
// - Upstream's hard-coded duplicate DOM ids (joystick/base/knob/button/cap) are dropped;
//   instances are the identity now.
// - The zustand store keys (`id` props) are gone — create one instance per stick/button.
//
// Added 2026-07-30 for the skate game's touch layer (`skate-touch-layer.ts`), all three
// because a game that HIDES its controls mid-press needs a way to say so:
// - NEW: `TouchJoystick.reset()` and `VirtualButton.cancel()` — a widget taken off screen
//   with `display: none` is never sent a `pointerup`, so without these it keeps its pointer
//   id claimed (dead on the way back: the next press is ignored as a second finger) and the
//   game keeps reading the last state it published. `reset()` ANNOUNCES (onChange with
//   zeros — a stick going to centre is a real input event); `cancel()` does NOT (a button
//   whose release fires a game action must not fire it because a pause card opened over it).
// - NEW: `capPressedStyle` — arbitrary cap style while held, restored on release. Upstream
//   had one fixed brightening, which cannot express "this control is a HOLD and it is live
//   right now"; the skate game's ollie is a held wind-up and needs that state drawn.

// ---------------------------------------------------------------------------
// Shared style plumbing
// ---------------------------------------------------------------------------

/** Style keys, read/written by name — `element.style` indexed as the string map it is. */
type StyleMap = Record<string, string>;

/** Current values of exactly the properties `keys` names, for a later restore. */
function snapshotStyle(element: HTMLElement, keys: readonly string[]): StyleMap {
  const style = element.style as unknown as StyleMap;
  const out: StyleMap = {};
  for (const key of keys) out[key] = style[key] ?? "";
  return out;
}

function applyStyle(
  element: HTMLElement,
  base: Partial<CSSStyleDeclaration>,
  override?: Partial<CSSStyleDeclaration>
): void {
  Object.assign(element.style, base);
  if (override) Object.assign(element.style, override);
}

/** Legacy vendor prefixes upstream shipped via React CSSProperties (Moz/ms). */
function applyLegacyUserSelectNone(element: HTMLElement): void {
  element.style.setProperty("-moz-user-select", "none");
  element.style.setProperty("-ms-user-select", "none");
}

/** True when the caller's style overrides carry ANY positioning of their own. */
function hasOwnPosition(style?: Partial<CSSStyleDeclaration>): boolean {
  if (!style) return false;
  return Boolean(style.left || style.right || style.top || style.bottom || style.inset);
}

// ---------------------------------------------------------------------------
// TouchJoystick
// ---------------------------------------------------------------------------

// Default styles for the joystick wrapper (the 200px interactive hit area).
// Position is applied separately (safe-area default, unless the caller positions it).
const DEFAULT_JOYSTICK_WRAPPER_STYLE: Partial<CSSStyleDeclaration> = {
  userSelect: "none",
  webkitUserSelect: "none",
  touchAction: "none",
  overscrollBehavior: "none",
  position: "fixed",
  zIndex: "10",
  height: "200px",
  width: "200px",
  borderRadius: "50%",
};

// Safe default position: bottom-left, clear of the notch/home-indicator insets.
const DEFAULT_JOYSTICK_POSITION: Partial<CSSStyleDeclaration> = {
  left: "calc(12px + env(safe-area-inset-left))",
  bottom: "calc(12px + env(safe-area-inset-bottom))",
};

// Floating mode turns the wrapper into a large invisible touch zone (bottom-left
// region of the screen); the visible stick lives on the base, not the wrapper.
const FLOATING_JOYSTICK_WRAPPER_STYLE: Partial<CSSStyleDeclaration> = {
  left: "0",
  bottom: "0",
  width: "45vw",
  height: "60vh",
  borderRadius: "0",
  // Below buttons/HUD (zIndex 10) so controls layered inside the zone stay tappable.
  zIndex: "5",
};

// Default styles for the joystick base (the 100px reference circle — center math uses THIS).
const DEFAULT_JOYSTICK_BASE_STYLE: Partial<CSSStyleDeclaration> = {
  width: "100px",
  height: "100px",
  background: "rgba(255, 255, 255, 0.06)",
  border: "1.5px solid rgba(255, 255, 255, 0.4)",
  borderRadius: "50%",
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  touchAction: "none",
};

// Default styles for the joystick knob. The cubic-bezier transition IS the spring-back:
// the state snaps to 0 instantly on release while the knob overshoots home in CSS.
const DEFAULT_JOYSTICK_KNOB_STYLE: Partial<CSSStyleDeclaration> = {
  width: "70px",
  height: "70px",
  background: "rgba(255, 255, 255, 0.35)",
  border: "1.5px solid rgba(255, 255, 255, 0.55)",
  borderRadius: "50%",
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  transition: "transform 0.2s cubic-bezier(0.25, 1.5, 0.5, 1)",
  willChange: "transform",
  pointerEvents: "none",
};

/** Resting-hint opacity for the floating stick (fades to 1 while dragging). */
const FLOATING_REST_OPACITY = "0.35";

export interface TouchJoystickOptions {
  /** DOM parent; default `document.body`. */
  parent?: HTMLElement;
  /** Max knob travel in px; default 50. Larger = more finger travel for full deflection. */
  maxRadius?: number;
  /**
   * Floating mode: the wrapper becomes a large invisible touch zone (default: the
   * bottom-left 45vw x 60vh of the screen — reshape via `wrapperStyle`) and the stick
   * appears centered under the thumb, resting as a faint hint at the zone's default
   * spot between touches. Static fixed-circle mode (false) is the default.
   */
  floating?: boolean;
  /**
   * Style overrides merged over the defaults. Without any position here
   * (left/right/top/bottom/inset), the widget parks at its safe-area-aware default
   * (bottom-left); set your own to move it — your position replaces the default
   * entirely. In floating mode this styles the touch ZONE.
   */
  wrapperStyle?: Partial<CSSStyleDeclaration>;
  baseStyle?: Partial<CSSStyleDeclaration>;
  knobStyle?: Partial<CSSStyleDeclaration>;
  /** Optional change hook: fires on every move/reset with the new state. */
  onChange?: (x: number, y: number, active: boolean) => void;
}

/**
 * DOM+CSS touch joystick. Read `x`/`y` each render frame and pass them into the character
 * controller: `setMovement({ ...kb.getCharacterMovement(), joystick: { x: joy.x, y: joy.y } })`.
 * A nonzero joystick overrides the digital keys inside the controller — pass both through and
 * let it pick. Note the controller normalizes direction, so deflection magnitude is not speed.
 */
export class TouchJoystick {
  #maxRadius: number;
  #floating: boolean;
  #wrapper: HTMLDivElement;
  #base: HTMLDivElement;
  #knob: HTMLDivElement;
  #x = 0;
  #y = 0;
  #active = false;
  /** Live drag's pointerId — a second finger on the widget is ignored. */
  #pointerId: number | null = null;
  #onChange: ((x: number, y: number, active: boolean) => void) | undefined;
  #resizeObserver: ResizeObserver | null = null;
  #disposed = false;

  #onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  #onPointerDown = (event: PointerEvent): void => {
    if (this.#pointerId !== null) return; // one pointer drives; ignore extra fingers
    event.preventDefault();
    event.stopPropagation();
    this.#pointerId = event.pointerId;
    if (this.#floating) this.#anchorStick(event.clientX, event.clientY);
    this.#move(event.clientX, event.clientY);
    // NEW vs upstream: capture keeps the drag working outside the wrapper.
    if (typeof this.#wrapper.setPointerCapture === "function") {
      try {
        this.#wrapper.setPointerCapture(event.pointerId);
      } catch {
        // pointer already gone — the pointerleave reset path still covers us
      }
    }
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.#pointerId) this.#move(event.clientX, event.clientY);
  };

  #onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.#pointerId) this.#reset();
  };

  #onResize = (): void => {
    // Keep the floating resting hint anchored to the zone whenever the zone's size
    // changes (rotation, browser chrome show/hide, a zero-sized boot in a hidden
    // tab becoming visible) while nobody is touching it.
    if (this.#floating && this.#pointerId === null) this.#parkStick(false);
  };

  constructor(options: TouchJoystickOptions = {}) {
    this.#maxRadius = options.maxRadius ?? 50;
    this.#floating = options.floating ?? false;
    this.#onChange = options.onChange;

    this.#wrapper = document.createElement("div");
    applyStyle(this.#wrapper, DEFAULT_JOYSTICK_WRAPPER_STYLE);
    if (this.#floating) applyStyle(this.#wrapper, FLOATING_JOYSTICK_WRAPPER_STYLE);
    else if (!hasOwnPosition(options.wrapperStyle)) {
      applyStyle(this.#wrapper, DEFAULT_JOYSTICK_POSITION);
    }
    if (options.wrapperStyle) applyStyle(this.#wrapper, options.wrapperStyle);
    applyLegacyUserSelectNone(this.#wrapper);

    this.#base = document.createElement("div");
    applyStyle(this.#base, DEFAULT_JOYSTICK_BASE_STYLE, options.baseStyle);
    this.#wrapper.appendChild(this.#base);

    this.#knob = document.createElement("div");
    applyStyle(this.#knob, DEFAULT_JOYSTICK_KNOB_STYLE, options.knobStyle);
    this.#base.appendChild(this.#knob);

    this.#wrapper.addEventListener("contextmenu", this.#onContextMenu);
    this.#wrapper.addEventListener("pointerdown", this.#onPointerDown);
    this.#wrapper.addEventListener("pointermove", this.#onPointerMove);
    this.#wrapper.addEventListener("pointerup", this.#onPointerEnd);
    this.#wrapper.addEventListener("pointerleave", this.#onPointerEnd);
    this.#wrapper.addEventListener("pointercancel", this.#onPointerEnd);

    (options.parent ?? document.body).appendChild(this.#wrapper);

    if (this.#floating) {
      this.#parkStick(false);
      // ResizeObserver tracks the zone element itself (fires on first observe too —
      // self-healing when the game boots in a hidden/zero-sized tab); plain window
      // resize is the fallback for engines without it.
      if (typeof ResizeObserver !== "undefined") {
        this.#resizeObserver = new ResizeObserver(this.#onResize);
        this.#resizeObserver.observe(this.#wrapper);
      } else {
        window.addEventListener("resize", this.#onResize);
      }
    }
  }

  /** Normalized horizontal deflection in [-1, 1] (right-positive). */
  get x(): number {
    return this.#x;
  }

  /** Normalized vertical deflection in [-1, 1], UP-positive (screen dy is negated once here). */
  get y(): number {
    return this.#y;
  }

  /** True iff (x, y) !== (0, 0). */
  get active(): boolean {
    return this.#active;
  }

  /** The wrapper element (for ad-hoc styling / conditional display). */
  get element(): HTMLDivElement {
    return this.#wrapper;
  }

  /** Show/hide helper — e.g. show only when `navigator.maxTouchPoints > 0`. */
  setVisible(visible: boolean): void {
    this.#wrapper.style.display = visible ? "" : "none";
  }

  /**
   * Let go of the drag from OUTSIDE: state to (0, 0), the knob eased home, the
   * pointer id released, and `onChange(0, 0, false)` announced.
   *
   * For a game that hides the stick mid-drag (a pause card, a rotate-device
   * overlay). `display: none` fires no `pointerup`, so without this the widget
   * keeps `#pointerId` claimed — the next press is then discarded as a second
   * finger and the stick is dead — and the game keeps reading the deflection the
   * thumb was holding when the screen changed under it.
   *
   * The announcement is deliberate here and NOT on `VirtualButton.cancel()`: a
   * stick returning to centre is a real input event that a game wants to act on,
   * whereas a button's release is often a game action in its own right.
   */
  reset(): void {
    this.#reset();
  }

  /** Reset state + remove DOM + listeners. Safe to call mid-drag. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#reset();
    this.#wrapper.removeEventListener("contextmenu", this.#onContextMenu);
    this.#wrapper.removeEventListener("pointerdown", this.#onPointerDown);
    this.#wrapper.removeEventListener("pointermove", this.#onPointerMove);
    this.#wrapper.removeEventListener("pointerup", this.#onPointerEnd);
    this.#wrapper.removeEventListener("pointerleave", this.#onPointerEnd);
    this.#wrapper.removeEventListener("pointercancel", this.#onPointerEnd);
    this.#resizeObserver?.disconnect();
    if (this.#floating) window.removeEventListener("resize", this.#onResize);
    this.#wrapper.remove();
  }

  /** Floating: snap the stick under the thumb (clamped so the base stays in the zone). */
  #anchorStick(clientX: number, clientY: number): void {
    const rect = this.#wrapper.getBoundingClientRect();
    const half = this.#base.offsetWidth / 2 || 50;
    const localX = Math.min(Math.max(clientX - rect.left, half), Math.max(rect.width - half, half));
    const localY = Math.min(Math.max(clientY - rect.top, half), Math.max(rect.height - half, half));
    this.#base.style.transition = "opacity 0.1s ease";
    this.#base.style.top = `${localY}px`;
    this.#base.style.left = `${localX}px`;
    this.#base.style.opacity = "1";
  }

  /** Floating: return the stick to its resting-hint spot (bottom-left of the zone). */
  #parkStick(animate: boolean): void {
    const rect = this.#wrapper.getBoundingClientRect();
    const half = this.#base.offsetWidth / 2 || 50;
    const restX = Math.min(half + 12, rect.width / 2 || half);
    const restY = Math.max((rect.height || half * 2) - half - 12, half);
    this.#base.style.transition = animate
      ? "top 0.3s ease, left 0.3s ease, opacity 0.3s ease"
      : "none";
    this.#base.style.top = `${restY}px`;
    this.#base.style.left = `${restX}px`;
    this.#base.style.opacity = FLOATING_REST_OPACITY;
  }

  #move(clientX: number, clientY: number): void {
    // Center math uses the BASE rect (100px reference circle), not the wrapper.
    const rect = this.#base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);
    // If the distance exceeds the maximum radius, scale down the movement.
    if (distance > this.#maxRadius) {
      dx *= this.#maxRadius / distance;
      dy *= this.#maxRadius / distance;
    }

    // The -50% self-centering and the pixel offset ride in ONE translate — replacing this
    // with left/top would break the CSS spring-back.
    this.#knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    this.#x = dx / this.#maxRadius;
    this.#y = -dy / this.#maxRadius; // screen-down-positive dy → game-forward-positive y
    this.#active = !(this.#x === 0 && this.#y === 0);
    this.#onChange?.(this.#x, this.#y, this.#active);
  }

  #reset(): void {
    this.#pointerId = null;
    // State snaps to 0 immediately; the knob eases back via the CSS transition.
    this.#knob.style.transform = "translate(-50%, -50%)";
    if (this.#floating) this.#parkStick(true);
    this.#x = 0;
    this.#y = 0;
    this.#active = false;
    this.#onChange?.(0, 0, false);
  }
}

// ---------------------------------------------------------------------------
// VirtualButton
// ---------------------------------------------------------------------------

// Default style for the virtual button wrapper (the 60px hit area — thumb-sized).
const DEFAULT_BUTTON_WRAPPER_STYLE: Partial<CSSStyleDeclaration> = {
  userSelect: "none",
  webkitUserSelect: "none",
  touchAction: "none",
  overscrollBehavior: "none",
  position: "fixed",
  zIndex: "10",
  height: "60px",
  width: "60px",
  background: "rgba(255, 255, 255, 0.05)",
  borderRadius: "50%",
};

// Safe default position: bottom-right, clear of the safe-area insets. Position
// every button after the FIRST yourself — two buttons on the default overlap.
const DEFAULT_BUTTON_POSITION: Partial<CSSStyleDeclaration> = {
  right: "calc(24px + env(safe-area-inset-right))",
  bottom: "calc(48px + env(safe-area-inset-bottom))",
};

// Default style for the virtual button cap (the 45px visible disc with the label).
const DEFAULT_BUTTON_CAP_STYLE: Partial<CSSStyleDeclaration> = {
  width: "45px",
  height: "45px",
  background: "rgba(255, 255, 255, 0.22)",
  border: "1.5px solid rgba(255, 255, 255, 0.5)",
  borderRadius: "50%",
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  transition: "transform 0.15s ease, background 0.15s ease",
  willChange: "transform",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  fontSize: "12px",
  fontWeight: "600",
  fontFamily: "system-ui, sans-serif",
  color: "rgba(255, 255, 255, 0.95)",
  textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
  userSelect: "none",
  pointerEvents: "none",
};

/** Pressed-state cap fill (compress + brighten; the resting fill is restored on release). */
const BUTTON_PRESSED_BACKGROUND = "rgba(255, 255, 255, 0.45)";

export interface VirtualButtonOptions {
  /** Text rendered on the cap, e.g. "Jump" (plain text — set via textContent). */
  label?: string;
  /** DOM parent; default `document.body`. */
  parent?: HTMLElement;
  /**
   * Style overrides; without any position here the button parks at its safe-area-aware
   * default (bottom-right) — position every button after the first yourself
   * (e.g. `{ right: "100px", bottom: "48px" }`), or they stack on the same spot.
   */
  wrapperStyle?: Partial<CSSStyleDeclaration>;
  capStyle?: Partial<CSSStyleDeclaration>;
  /**
   * Cap style applied WHILE the button is held and undone on release — for a
   * control whose held state is a thing the player has to be able to see (a
   * charge, a grab, a manual). Only the properties named here are touched, and
   * only their pre-press values are put back, so it composes with `capStyle`
   * instead of replacing it.
   *
   * The built-in compress-and-brighten still runs; anything named here is
   * applied over the top of it.
   */
  capPressedStyle?: Partial<CSSStyleDeclaration>;
  /** Rising-edge press hook (e.g. an on-screen Enter/Exit button → `mgr.requestInteract()`). */
  onPress?: () => void;
  onRelease?: () => void;
}

/**
 * DOM+CSS virtual button for touch controls. Read `pressed` each frame (e.g.
 * `jump: kb.space || btnJump.pressed`) or use the `onPress`/`onRelease` edge callbacks.
 */
export class VirtualButton {
  #wrapper: HTMLDivElement;
  #cap: HTMLDivElement;
  /** The cap's resting fill (default or caller override) — restored on release. */
  #capRestBackground: string;
  /** Held-state cap overrides, or undefined — see `capPressedStyle`. */
  #capPressedStyle: Partial<CSSStyleDeclaration> | undefined;
  /**
   * What those overridden properties looked like before the press. Snapshotted
   * per press rather than once at construction, so it survives a caller
   * restyling the cap between presses.
   */
  #capPressedFrom: StyleMap | null = null;
  #pressed = false;
  /** Live press's pointerId — a second finger on the button is ignored. */
  #pointerId: number | null = null;
  #onPress: (() => void) | undefined;
  #onRelease: (() => void) | undefined;
  #disposed = false;

  #onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  #onPointerDown = (event: PointerEvent): void => {
    this.#press(event);
  };

  // pointerId-filtered like the joystick: with capture active, boundary events are
  // suppressed mid-press, so a thumb drifting off the 60px hit area keeps holding
  // (hold-to-jump / hold-to-brake); pointerleave stays only as the release path for
  // engines where capture is unavailable — degraded there, but never a stuck button.
  #onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.#pointerId) this.#release();
  };

  constructor(options: VirtualButtonOptions = {}) {
    this.#onPress = options.onPress;
    this.#onRelease = options.onRelease;
    this.#capPressedStyle = options.capPressedStyle;

    this.#wrapper = document.createElement("div");
    applyStyle(this.#wrapper, DEFAULT_BUTTON_WRAPPER_STYLE);
    if (!hasOwnPosition(options.wrapperStyle)) {
      applyStyle(this.#wrapper, DEFAULT_BUTTON_POSITION);
    }
    if (options.wrapperStyle) applyStyle(this.#wrapper, options.wrapperStyle);
    applyLegacyUserSelectNone(this.#wrapper);

    this.#cap = document.createElement("div");
    applyStyle(this.#cap, DEFAULT_BUTTON_CAP_STYLE, options.capStyle);
    this.#cap.textContent = options.label ?? "";
    this.#capRestBackground = this.#cap.style.background;
    this.#wrapper.appendChild(this.#cap);

    this.#wrapper.addEventListener("contextmenu", this.#onContextMenu);
    this.#wrapper.addEventListener("pointerdown", this.#onPointerDown);
    this.#wrapper.addEventListener("pointerup", this.#onPointerEnd);
    this.#wrapper.addEventListener("pointerleave", this.#onPointerEnd);
    this.#wrapper.addEventListener("pointercancel", this.#onPointerEnd);

    (options.parent ?? document.body).appendChild(this.#wrapper);
  }

  /** True while the button is held. */
  get pressed(): boolean {
    return this.#pressed;
  }

  /** The wrapper element (for ad-hoc styling / conditional display). */
  get element(): HTMLDivElement {
    return this.#wrapper;
  }

  /** Show/hide helper. */
  setVisible(visible: boolean): void {
    this.#wrapper.style.display = visible ? "" : "none";
  }

  /**
   * Drop the press WITHOUT announcing a release — the cap comes back up, the
   * pointer id is handed back, and `onRelease` does NOT fire.
   *
   * For a game that takes its controls off screen while a thumb is still down. A
   * widget hidden with `display: none` is sent no `pointerup`, so without this
   * the button stays `pressed` for ever, keeps `#pointerId` claimed (the next
   * press is discarded as a second finger — the button is dead) and the game
   * keeps reading a hold nobody is holding.
   *
   * The silence is the point. On a game where a button's RELEASE is itself an
   * action — a charge released as a jump, a bow loosed — announcing the release
   * here would fire that action because a pause card opened, which is precisely
   * what the player did not ask for. A real `pointerup` and `dispose()` both
   * still announce.
   */
  cancel(): void {
    this.#release(false);
  }

  /** Release (if held) + remove DOM + listeners. Resets only this button's own state. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#release();
    this.#wrapper.removeEventListener("contextmenu", this.#onContextMenu);
    this.#wrapper.removeEventListener("pointerdown", this.#onPointerDown);
    this.#wrapper.removeEventListener("pointerup", this.#onPointerEnd);
    this.#wrapper.removeEventListener("pointerleave", this.#onPointerEnd);
    this.#wrapper.removeEventListener("pointercancel", this.#onPointerEnd);
    this.#wrapper.remove();
  }

  #press(event: PointerEvent): void {
    if (this.#pointerId !== null) return; // one pointer drives; ignore extra fingers
    event.preventDefault();
    event.stopPropagation();
    this.#pointerId = event.pointerId;
    const wasPressed = this.#pressed;
    this.#pressed = true;
    // Snapshotted BEFORE the two lines below, so an override that names
    // `background` or `transform` restores the RESTING value rather than the
    // pressed one this method is about to write.
    if (this.#capPressedStyle) {
      this.#capPressedFrom = snapshotStyle(this.#cap, Object.keys(this.#capPressedStyle));
    }
    // Compress + brighten (physical buttons press IN — they don't inflate).
    this.#cap.style.transform = "translate(-50%, -50%) scale(0.92)";
    this.#cap.style.background = BUTTON_PRESSED_BACKGROUND;
    // The caller's held-state look goes over the top of the built-in one.
    if (this.#capPressedStyle) Object.assign(this.#cap.style, this.#capPressedStyle);
    // Capture keeps the hold alive while the thumb drifts outside the hit area.
    if (typeof this.#wrapper.setPointerCapture === "function") {
      try {
        this.#wrapper.setPointerCapture(event.pointerId);
      } catch {
        // pointer already gone — the pointerleave reset path still covers us
      }
    }
    // Rising edge (pointerdown cannot re-fire while down, but guard anyway).
    if (!wasPressed) this.#onPress?.();
  }

  /**
   * `announce` is false only for `cancel()` — see the reasoning there. Everything
   * else (a real pointerup, pointerleave, pointercancel, dispose) announces.
   */
  #release(announce = true): void {
    if (!this.#pressed) return;
    this.#pointerId = null;
    this.#pressed = false;
    this.#cap.style.transform = "translate(-50%, -50%) scale(1)";
    this.#cap.style.background = this.#capRestBackground;
    // Put back exactly the properties the held-state override touched, and last,
    // so it wins over the two built-in restores above wherever they overlap.
    if (this.#capPressedFrom) {
      Object.assign(this.#cap.style, this.#capPressedFrom);
      this.#capPressedFrom = null;
    }
    if (announce) this.#onRelease?.();
  }
}
