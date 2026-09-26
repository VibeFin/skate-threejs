// "Rotate your phone" overlay — the orientation component of the Genex touch kit.
//
// The web cannot force an orientation (`screen.orientation.lock()` needs fullscreen
// and is absent on iOS Safari), so a game declares its one natural orientation and
// this overlay asks the player to rotate ONLY while the device is held the wrong way.
// Use it when the wrong orientation genuinely breaks the game (a landscape racer in
// a portrait sliver); if the game is merely suboptimal sideways, skip the overlay
// and just resize.
//
// Safe by construction:
// - Shows only on touch devices (`navigator.maxTouchPoints > 0`) whose smaller
//   viewport side is phone/tablet sized — a touch-screen laptop is never told to
//   rotate itself.
// - Sits above everything (zIndex 9999), swallows input while visible, and hides the
//   instant the orientation matches. `onChange` lets the game pause under it.

const OVERLAY_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  inset: "0",
  zIndex: "9999",
  display: "none",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "20px",
  background: "rgba(6, 9, 18, 0.94)",
  color: "rgba(255, 255, 255, 0.92)",
  fontFamily: "system-ui, sans-serif",
  fontSize: "15px",
  fontWeight: "500",
  textAlign: "center",
  userSelect: "none",
  touchAction: "none",
};

const PHONE_GLYPH_STYLE: Partial<CSSStyleDeclaration> = {
  width: "30px",
  height: "52px",
  border: "2.5px solid rgba(255, 255, 255, 0.85)",
  borderRadius: "7px",
  boxSizing: "border-box",
};

/** Devices whose smaller viewport side exceeds this are assumed unrotatable (laptops). */
const MAX_ROTATABLE_MIN_VIEWPORT = 920;

export interface RotateOverlayOptions {
  /** The game's one natural orientation — the overlay shows while the device is in the OTHER one. */
  orientation: "landscape" | "portrait";
  /** Overlay text; default "Rotate your phone". */
  message?: string;
  /** DOM parent; default `document.body`. */
  parent?: HTMLElement;
  /** Fires when the overlay appears (true) / disappears (false) — e.g. pause the game. */
  onChange?: (blocking: boolean) => void;
}

/**
 * Self-managing rotate-device overlay. Construct it once at boot and forget it:
 *
 *     const rotate = new RotateOverlay({ orientation: "landscape" });
 *     // optional: pause while it blocks
 *     //   new RotateOverlay({ orientation: "landscape", onChange: (b) => (physics.paused = b) });
 */
export class RotateOverlay {
  #root: HTMLDivElement;
  #natural: "landscape" | "portrait";
  #blocking = false;
  #onChange: ((blocking: boolean) => void) | undefined;
  #portraitQuery: MediaQueryList | null = null;
  #glyphAnimation: Animation | null = null;
  #disposed = false;

  #onOrientationChange = (): void => {
    this.#evaluate();
  };

  constructor(options: RotateOverlayOptions) {
    this.#natural = options.orientation;
    this.#onChange = options.onChange;

    this.#root = document.createElement("div");
    Object.assign(this.#root.style, OVERLAY_STYLE);

    const glyph = document.createElement("div");
    Object.assign(glyph.style, PHONE_GLYPH_STYLE);
    this.#root.appendChild(glyph);

    const label = document.createElement("div");
    label.textContent = options.message ?? "Rotate your phone";
    this.#root.appendChild(label);

    // Rotate the phone glyph 90° toward the natural orientation, pause, repeat.
    const turn = this.#natural === "landscape" ? "90deg" : "-90deg";
    if (typeof glyph.animate === "function") {
      this.#glyphAnimation = glyph.animate(
        [
          { transform: "rotate(0deg)", offset: 0 },
          { transform: "rotate(0deg)", offset: 0.25 },
          { transform: `rotate(${turn})`, offset: 0.6 },
          { transform: `rotate(${turn})`, offset: 1 },
        ],
        { duration: 2200, iterations: Infinity, easing: "ease-in-out" }
      );
    }

    (options.parent ?? document.body).appendChild(this.#root);

    if (typeof matchMedia === "function") {
      this.#portraitQuery = matchMedia("(orientation: portrait)");
      this.#portraitQuery.addEventListener("change", this.#onOrientationChange);
    }
    // Belt and braces — rotation signals differ per browser: the media query,
    // the Screen Orientation API, and plain resize (which also catches
    // browser-chrome show/hide). Re-evaluating is idempotent, so listen to all.
    screen.orientation?.addEventListener("change", this.#onOrientationChange);
    window.addEventListener("resize", this.#onOrientationChange);

    this.#evaluate();
  }

  /** True while the overlay is shown (device held the wrong way). */
  get blocking(): boolean {
    return this.#blocking;
  }

  /** The overlay element (for ad-hoc styling). */
  get element(): HTMLDivElement {
    return this.#root;
  }

  /** Remove DOM + listeners. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#portraitQuery?.removeEventListener("change", this.#onOrientationChange);
    screen.orientation?.removeEventListener("change", this.#onOrientationChange);
    window.removeEventListener("resize", this.#onOrientationChange);
    this.#glyphAnimation?.cancel();
    this.#root.remove();
    if (this.#blocking) {
      this.#blocking = false;
      this.#onChange?.(false);
    }
  }

  #evaluate(): void {
    if (this.#disposed) return;
    const isTouch = navigator.maxTouchPoints > 0;
    const rotatable = Math.min(window.innerWidth, window.innerHeight) <= MAX_ROTATABLE_MIN_VIEWPORT;
    const portrait = this.#portraitQuery
      ? this.#portraitQuery.matches
      : window.innerHeight >= window.innerWidth;
    const current: "landscape" | "portrait" = portrait ? "portrait" : "landscape";
    const shouldBlock = isTouch && rotatable && current !== this.#natural;
    if (shouldBlock === this.#blocking) return;
    this.#blocking = shouldBlock;
    this.#root.style.display = shouldBlock ? "flex" : "none";
    this.#onChange?.(shouldBlock);
  }
}
