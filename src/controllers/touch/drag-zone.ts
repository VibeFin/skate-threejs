// Invisible one-finger drag region for touch input — the camera-look / paddle-drag
// primitive of the Genex touch kit (companion to TouchJoystick/VirtualButton).
//
// Two read models, pick per genre:
// - Relative (camera look, steering): call `consumeDelta()` once per frame and apply
//   the returned pixel deltas to yaw/pitch — it drains the accumulator, so frame rate
//   doesn't change sensitivity.
// - Absolute (paddle, pong, slider): read `x`/`y` — the pointer's normalized position
//   inside the zone (0..1 from the zone's left/top edge) — while `active` is true.
//
// Design notes:
// - Touch/pen pointers only by default: the zone typically covers half the screen, and
//   capturing the desktop mouse there would fight mouse-driven gameplay on
//   touch-screen laptops. Override via `pointerTypes` if a game wants the mouse too.
// - One pointer drives (tracked by pointerId); extra fingers are ignored, so a
//   joystick drag in the other hand never disturbs the look drag.
// - The zone sits at zIndex 5 — below the kit's joystick/buttons (10), so widgets
//   layered inside the region stay tappable. It swallows the touches it receives:
//   taps inside the zone do NOT reach the canvas underneath.

const DEFAULT_ZONE_STYLE: Partial<CSSStyleDeclaration> = {
  userSelect: "none",
  webkitUserSelect: "none",
  touchAction: "none",
  overscrollBehavior: "none",
  position: "fixed",
  zIndex: "5",
  right: "0",
  top: "0",
  width: "50vw",
  height: "100vh",
  background: "transparent",
};

export interface DragZoneOptions {
  /** DOM parent; default `document.body`. */
  parent?: HTMLElement;
  /**
   * Style overrides merged over the default zone (the right half of the screen).
   * Reshape via left/right/top/bottom/width/height — e.g. a bottom strip for a
   * paddle: `{ right: "0", left: "0", top: "auto", bottom: "0", width: "100vw", height: "30vh" }`.
   */
  zoneStyle?: Partial<CSSStyleDeclaration>;
  /** Pointer types that activate the zone; default `["touch", "pen"]` (never the mouse). */
  pointerTypes?: readonly string[];
  /** Optional hook: fires when a drag starts (true) or ends (false). */
  onChange?: (active: boolean) => void;
}

/**
 * Invisible fixed-position drag surface. Create it behind a touch check and read it
 * each frame:
 *
 *     const look = new DragZone();                       // right half of the screen
 *     look.setVisible(navigator.maxTouchPoints > 0);
 *     // per frame:
 *     const { dx, dy } = look.consumeDelta();
 *     yaw -= dx * 0.005; pitch -= dy * 0.005;
 */
export class DragZone {
  #zone: HTMLDivElement;
  #pointerTypes: readonly string[];
  #pointerId: number | null = null;
  #lastX = 0;
  #lastY = 0;
  #dx = 0;
  #dy = 0;
  #x = 0;
  #y = 0;
  #onChange: ((active: boolean) => void) | undefined;
  #disposed = false;

  #onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  #onPointerDown = (event: PointerEvent): void => {
    if (this.#pointerId !== null) return; // one pointer drives; ignore extra fingers
    if (!this.#pointerTypes.includes(event.pointerType)) return;
    event.preventDefault();
    this.#pointerId = event.pointerId;
    this.#lastX = event.clientX;
    this.#lastY = event.clientY;
    this.#updatePosition(event.clientX, event.clientY);
    if (typeof this.#zone.setPointerCapture === "function") {
      try {
        this.#zone.setPointerCapture(event.pointerId);
      } catch {
        // pointer already gone — the pointerleave reset path still covers us
      }
    }
    this.#onChange?.(true);
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return;
    this.#dx += event.clientX - this.#lastX;
    this.#dy += event.clientY - this.#lastY;
    this.#lastX = event.clientX;
    this.#lastY = event.clientY;
    this.#updatePosition(event.clientX, event.clientY);
  };

  #onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return;
    this.#pointerId = null;
    this.#onChange?.(false);
  };

  constructor(options: DragZoneOptions = {}) {
    this.#pointerTypes = options.pointerTypes ?? ["touch", "pen"];
    this.#onChange = options.onChange;

    this.#zone = document.createElement("div");
    Object.assign(this.#zone.style, DEFAULT_ZONE_STYLE);
    if (options.zoneStyle) Object.assign(this.#zone.style, options.zoneStyle);
    this.#zone.style.setProperty("-moz-user-select", "none");
    this.#zone.style.setProperty("-ms-user-select", "none");

    this.#zone.addEventListener("contextmenu", this.#onContextMenu);
    this.#zone.addEventListener("pointerdown", this.#onPointerDown);
    this.#zone.addEventListener("pointermove", this.#onPointerMove);
    this.#zone.addEventListener("pointerup", this.#onPointerEnd);
    this.#zone.addEventListener("pointerleave", this.#onPointerEnd);
    this.#zone.addEventListener("pointercancel", this.#onPointerEnd);

    (options.parent ?? document.body).appendChild(this.#zone);
  }

  /** True while a finger is down on the zone. */
  get active(): boolean {
    return this.#pointerId !== null;
  }

  /** Normalized pointer position across the zone width, 0 (left edge) .. 1 (right edge). */
  get x(): number {
    return this.#x;
  }

  /** Normalized pointer position down the zone height, 0 (top edge) .. 1 (bottom edge). */
  get y(): number {
    return this.#y;
  }

  /** The zone element (for ad-hoc styling / conditional display). */
  get element(): HTMLDivElement {
    return this.#zone;
  }

  /**
   * Drain the pixel deltas accumulated since the last call. Call exactly once per
   * frame; unread motion is never lost, and reading twice a frame halves nothing —
   * the second call just returns zeros.
   */
  consumeDelta(): { dx: number; dy: number } {
    const delta = { dx: this.#dx, dy: this.#dy };
    this.#dx = 0;
    this.#dy = 0;
    return delta;
  }

  /** Show/hide helper — e.g. show only when `navigator.maxTouchPoints > 0`. */
  setVisible(visible: boolean): void {
    this.#zone.style.display = visible ? "" : "none";
  }

  /** Remove DOM + listeners. Safe to call mid-drag. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#pointerId = null;
    this.#zone.removeEventListener("contextmenu", this.#onContextMenu);
    this.#zone.removeEventListener("pointerdown", this.#onPointerDown);
    this.#zone.removeEventListener("pointermove", this.#onPointerMove);
    this.#zone.removeEventListener("pointerup", this.#onPointerEnd);
    this.#zone.removeEventListener("pointerleave", this.#onPointerEnd);
    this.#zone.removeEventListener("pointercancel", this.#onPointerEnd);
    this.#zone.remove();
  }

  #updatePosition(clientX: number, clientY: number): void {
    const rect = this.#zone.getBoundingClientRect();
    this.#x = rect.width > 0 ? Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) : 0;
    this.#y = rect.height > 0 ? Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1) : 0;
  }
}
