// Ready-made pointer-lock aim UI for the bundled FollowCamera — the reticle +
// "click to aim" cue that the camera's aim mode expects the game to draw.
// FollowCamera itself ships no DOM (it only emits `onAimChange` events); this
// helper turns those events into a minimal always-correct overlay so a game gets
// the whole aim UX in two lines:
//
//     const cue = createAimCue();
//     const followCam = new FollowCamera(camera, { domElement, onAimChange: cue.onAimChange });
//
// What it draws per aim state:
// - "locked"      → a small centered reticle dot (cursor is hidden by the browser).
// - "unlocked"    → a bottom-center pill, "Click to aim — Esc pauses". Also shown on
//                   the "needs-gesture" re-emit (a re-lock that needs a fresh click).
// - "unavailable" → the same pill, "Drag to look" (lock was refused, e.g. a
//                   third-party embed without allow="pointer-lock" — drag still works).
// - "off" / "paused" → nothing (aim disabled, or a menu owns the cursor).
//
// Games that want a custom HUD can skip this and read `onAimChange` directly.

import type { FollowCameraAimEvent } from "./follow-camera.ts";

export interface AimCueOptions {
  /** DOM parent; default `document.body`. */
  parent?: HTMLElement;
  /** Text for the unlocked pill; default "Click to aim — Esc pauses". */
  hint?: string;
  /** Text for the drag-fallback pill (lock unavailable); default "Drag to look". */
  dragHint?: string;
}

export interface AimCue {
  /** Wire this to `FollowCameraOptions.onAimChange`. Idempotent per state. */
  onAimChange: (e: FollowCameraAimEvent) => void;
  /** Remove the overlay from the DOM. */
  dispose: () => void;
}

const OVERLAY_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  inset: "0",
  zIndex: "9",
  pointerEvents: "none",
  fontFamily: "system-ui, sans-serif",
};

const RETICLE_STYLE: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: "6px",
  height: "6px",
  marginLeft: "-3px",
  marginTop: "-3px",
  borderRadius: "50%",
  background: "rgba(255,255,255,0.9)",
  boxShadow: "0 0 0 1.5px rgba(0,0,0,0.5)",
  display: "none",
};

const PILL_STYLE: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  left: "50%",
  bottom: "6%",
  transform: "translateX(-50%)",
  padding: "6px 14px",
  borderRadius: "999px",
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  fontSize: "13px",
  fontWeight: "500",
  letterSpacing: "0.01em",
  whiteSpace: "nowrap",
  display: "none",
};

/**
 * Create the aim overlay and return an `onAimChange` handler to wire into
 * FollowCamera plus a `dispose()` that removes it. Safe to call once per game.
 */
export function createAimCue(options: AimCueOptions = {}): AimCue {
  const parent = options.parent ?? document.body;
  const hint = options.hint ?? "Click to aim — Esc pauses";
  const dragHint = options.dragHint ?? "Drag to look";

  const overlay = document.createElement("div");
  Object.assign(overlay.style, OVERLAY_STYLE);

  const reticle = document.createElement("div");
  Object.assign(reticle.style, RETICLE_STYLE);

  const pill = document.createElement("div");
  Object.assign(pill.style, PILL_STYLE);
  pill.textContent = hint;

  overlay.appendChild(reticle);
  overlay.appendChild(pill);
  parent.appendChild(overlay);

  const onAimChange = (e: FollowCameraAimEvent): void => {
    // Idempotent: the "needs-gesture" re-emit repeats state "unlocked" by design.
    if (e.state === "locked") {
      reticle.style.display = "block";
      pill.style.display = "none";
    } else if (e.state === "unlocked") {
      reticle.style.display = "none";
      pill.textContent = hint;
      pill.style.display = "block";
    } else if (e.state === "unavailable") {
      reticle.style.display = "none";
      pill.textContent = dragHint;
      pill.style.display = "block";
    } else {
      // "off" or "paused": a menu owns the cursor, or aim is disabled.
      reticle.style.display = "none";
      pill.style.display = "none";
    }
  };

  const dispose = (): void => {
    overlay.remove();
  };

  return { onAimChange, dispose };
}
