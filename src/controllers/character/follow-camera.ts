// SPDX-FileCopyrightText: 2023-2026 Erdong Chen
// SPDX-License-Identifier: MIT
// Vanilla-TS port of the ecctrl controller's follow camera (standalone; no camera-controls dependency).

import * as THREE from "three";

/**
 * Options for {@link FollowCamera}.
 *
 * Tuning cheat-sheet:
 * - Camera feels laggy / rubber-bandy -> lower `smoothTime` (0.05 is snappy, 0.25 is cinematic).
 * - Camera clips into walls -> add your static environment meshes to `colliderMeshes`.
 * - Zoom range wrong for your scale -> `minDistance` / `maxDistance` (0.02 min enables first-person).
 * - Vehicle camera swings behind the car too slowly/quickly -> `headingAlignGain` (default 5).
 */
export type FollowCameraOptions = {
  /** Input surface for pointer/wheel events (usually `renderer.domElement`). */
  domElement: HTMLElement;
  /**
   * SmoothDamp time (seconds) for target + orbit angles + distance. Roughly "time to cover ~63%
   * of the remaining gap"; the camera settles in ~2-3x this. Default 0.1 (demo-tuned).
   */
  smoothTime?: number;
  /**
   * SmoothDamp time while the user is controlling an axis, applied PER AXIS (upstream parity):
   * orbit angles use it while a drag-rotate is in effect, distance while a wheel/pinch zoom is
   * in effect (each flag persists until the next programmatic rotate()/dollyTo() call); the
   * follow target always uses `smoothTime`. Default 0.125.
   */
  draggingSmoothTime?: number;
  /** Per-frame lerp factor for `camera.up` toward the fed up-axis. Default 0.1. */
  upLerpFactor?: number;
  /** Polar (vertical orbit) clamp, radians. Defaults 0.1 and PI - 0.1 — never exactly 0/PI (lookAt degenerates). */
  minPolarAngle?: number;
  maxPolarAngle?: number;
  /** Distance (zoom) clamp. Defaults: 0.02 (first-person capable) and 12. */
  minDistance?: number;
  maxDistance?: number;
  /**
   * Initial orbit pose. Defaults: distance 4, azimuth PI, polar PI/2 — camera starts at
   * target + (0, 0, -4), level with the target and looking +Z (matches the upstream demo).
   */
  initialDistance?: number;
  initialAzimuthAngle?: number;
  initialPolarAngle?: number;
  /** Drag speed multipliers; a full drag across the element HEIGHT = one full turn (2*PI rad). Defaults 1. */
  azimuthRotateSpeed?: number;
  polarRotateSpeed?: number;
  /**
   * Wheel zoom speed multiplier. Multiplicative zoom with upstream normalization:
   * `0.95^(-deltaY/30)` per pixel-mode wheel event (~18.7% distance change per classic 100-unit
   * notch; deltaY/10 on Mac, deltaY/3 for line-mode/ctrlKey trackpad events). Default 1.
   */
  dollySpeed?: number;
  /**
   * Gain for vehicle heading auto-alignment: azimuth rotates by `angle * headingAlignGain * dt`
   * toward the vehicle's forward axis each frame. Default 5. Higher = camera snaps behind the
   * vehicle faster; 0 disables auto-align.
   */
  headingAlignGain?: number;
  /**
   * Static environment meshes for collision pullback (ray tests from target toward camera).
   * Only static LEAF meshes (intersection is non-recursive); NEVER include the character or
   * vehicle meshes — the rays start at the character's head and would hit them every frame.
   * Default []. Mutable after construction via the public `colliderMeshes` field.
   */
  colliderMeshes?: THREE.Mesh[];
  /**
   * Pointer-lock aim mode (AG-754). **Default true** on desktop (fine pointer):
   * a left-mouse click on `domElement` requests pointer lock, and while locked
   * raw mouse movement drives the orbit directly (no drag needed). Esc — or any
   * lock loss — returns to "unlocked". Pass `pointerLockAim: false` to opt OUT —
   * do this for cursor-core games (RTS, tower defense, card/board, point-and-click
   * builders) where the OS cursor IS the input, and for orbit showcases.
   * FollowCamera itself ships NO DOM UI; the character controller kit ships a
   * ready-made cue helper (`aim-cue.ts` — `createAimCue()`) that you wire to
   * `onAimChange` to draw a reticle while locked and a "click to aim" cue while
   * unlocked. Touch pointers never trigger lock (mobile controls are unchanged)
   * and coarse-pointer-only devices report "off". First-person is this same mode
   * plus a pinned zoom + eye-height target (see the character-controller wiring
   * reference).
   */
  pointerLockAim?: boolean;
  /**
   * REAL first-person mode (Revenant pilot D2) — not the follow-distance hack.
   * The camera sits AT the follow target (feed it the character's EYE height,
   * ~1.6–1.7 m, not the head-top orbit anchor) and looks OUT along the exact
   * direction the orbit camera would have looked from behind, so the
   * pointer-lock aim math — and its verified input signs — are shared, not
   * duplicated. While on: wheel zoom is ignored and collision pullback is
   * skipped (there is nothing behind the eyes). Toggle at runtime via the
   * public `firstPerson` field (e.g. enter/exit a vehicle). Hide the local
   * body with `setFirstPersonBody()` (first-person.ts) — it keeps the shadow.
   * Default false.
   */
  firstPerson?: boolean;
  /** Radians of view rotation per pixel of locked mouse movement. Default 0.0023. Mutable via `aimSensitivity` setter. */
  aimSensitivity?: number;
  /**
   * Invert the vertical (pitch) axis in locked aim — mouse-up looks DOWN, for
   * players who prefer flight-sim pitch. Default false. There is deliberately no
   * horizontal-invert option: inverted yaw is a bug class, never a preference.
   */
  aimInvertY?: boolean;
  /** Fired on every aim-state transition (plus an initial "init" emit when aim is enabled). */
  onAimChange?: (e: FollowCameraAimEvent) => void;
};

/**
 * Aim-mode lifecycle state (AG-754). Games render UI off these via `onAimChange`:
 * a reticle while "locked", a "click to aim" cue while "unlocked", a "drag to
 * look" hint while "unavailable".
 */
export type FollowCameraAimState =
  | "off" // pointerLockAim not enabled, no DOM document (node/SSR), or a coarse-pointer-only device
  | "unlocked" // aim available, waiting for a click
  | "locked" // pointer locked, mouse drives the view
  | "paused" // suspended by the game (menu open / driving) — clicks don't re-lock
  | "unavailable"; // lock permanently rejected (e.g. an iframe without allow="pointer-lock") → drag-orbit fallback

/**
 * Payload for {@link FollowCameraOptions.onAimChange}.
 *
 * NOTE: reason `"needs-gesture"` is a **same-state re-emit** — it fires with
 * `state === prev === "unlocked"` when a re-lock attempt could not run because
 * the browser lacked a usable user gesture (a resume outside a click, or Chrome's
 * post-Esc re-lock cooldown). The camera keeps the "unlocked" cue up and re-locks
 * on the next pointerdown/keydown; UI handlers must treat it idempotently.
 */
export type FollowCameraAimEvent = {
  state: FollowCameraAimState;
  prev: FollowCameraAimState;
  reason:
    | "user-click"
    | "esc-or-lost"
    | "paused"
    | "resumed"
    | "rejected"
    | "needs-gesture"
    | "init";
};

/** Mutable scalar velocity slot for SmoothDamp (Unity-style ref param). */
type ScalarRef = { value: number };

/** Upstream approxEquals epsilon (used for the "currently collided" test in dollyTo). */
const EPSILON = 1e-5;

/** Upstream wheel normalization: Mac reports finer-grained deltaY, so it divides less. */
const IS_MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

/**
 * Unity-style critically damped spring (exact port of the smoothing the upstream camera uses).
 * `smoothTime` = time to reach ~63% of the gap; settles in ~2-3x smoothTime. Module-private
 * on purpose (not part of shared/math).
 */
function smoothDamp(
  current: number,
  target: number,
  velRef: ScalarRef,
  smoothTime: number,
  maxSpeed: number,
  dt: number
): number {
  if (dt <= 0) return current; // numerical guard: dt=0 with current===target would NaN the velocity
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const originalTo = target;
  const maxChange = maxSpeed * smoothTime;
  change = THREE.MathUtils.clamp(change, -maxChange, maxChange);
  target = current - change;
  const temp = (velRef.value + omega * change) * dt;
  velRef.value = (velRef.value - omega * temp) * exp;
  let output = target + (change + temp) * exp;
  // overshoot clamp
  if (originalTo - current > 0 === output > originalTo) {
    output = originalTo;
    velRef.value = (output - originalTo) / dt;
  }
  return output;
}

/**
 * Spring-damped third-person follow camera (vanilla-TS stand-in for the camera-controls-based
 * rig the upstream demo uses; same imperative surface: `moveTo`, `setUp`, `rotate`, `dolly`,
 * `distance`, `colliderMeshes`, `smoothTime`).
 *
 * Features: SmoothDamp'd target follow + orbit + zoom, pointer-drag orbit, wheel/pinch zoom,
 * collision-aware pullback (4 near-plane-corner rays from the target toward the camera; the
 * damped distance is clamped to the hit while the END distance is preserved, so the camera
 * smoothly re-extends via SmoothDamp when the obstruction clears — upstream semantics),
 * platform/vehicle heading compensation.
 *
 * Call order per RENDER frame (render delta, never the fixed physics step):
 * 1. `moveTo(t.x, t.y, t.z, true)` with the pivot (controller `currPos + bodyYAxis * 0.5`)
 * 2. `setUp(controller.upAxis)`
 * 3. character on platform -> `applyPlatformTurn(controller.turnOnYQuat)` — ONLY on frames where
 *    at least one physics step ran (`turnOnYQuat` is a per-physics-step yaw delta; re-applying a
 *    stale delta on zero-step high-refresh frames over-rotates the camera)
 * 4. vehicle active -> `alignHeading(vehicle.bodyZAxis, dt)`
 * 5. `update(dt)`
 *
 * v1 assumes upAxis ~= +Y (no custom gravity): the orbit sphere is built in world-Y space;
 * `camera.up` lerps toward the fed up-axis and the heading math projects onto it, but a far-from-Y
 * up-axis will misbehave.
 *
 * Wiring tip: give the canvas `touch-action: none` so pointer drags aren't hijacked by scrolling.
 */
export class FollowCamera {
  /** Master switch: false freezes the camera entirely (no damping, input ignored). */
  enabled: boolean;
  /**
   * Gates target-follow + up-lerp + heading compensation (the demo's "followPlayer" toggle).
   * Manual orbit/zoom and damping keep working while false.
   */
  followEnabled: boolean;
  /** SmoothDamp time for target/orbit/zoom; live-tunable. */
  smoothTime: number;
  /** Static environment meshes for collision pullback; mutate freely (e.g. after level load). */
  colliderMeshes: THREE.Mesh[];
  /** First-person mode (see {@link FollowCameraOptions.firstPerson}); toggle freely at runtime. */
  firstPerson: boolean;

  private _camera: THREE.PerspectiveCamera;
  private _domElement: HTMLElement;

  private _draggingSmoothTime: number;
  private _upLerpFactor: number;
  private _minPolarAngle: number;
  private _maxPolarAngle: number;
  private _minDistance: number;
  private _maxDistance: number;
  private _azimuthRotateSpeed: number;
  private _polarRotateSpeed: number;
  private _dollySpeed: number;
  private _headingAlignGain: number;

  // Damped state (current) + targets (end) + SmoothDamp velocities.
  private _target: THREE.Vector3;
  private _targetEnd: THREE.Vector3;
  private _targetVelocity: THREE.Vector3;
  private _azimuth: number;
  private _azimuthEnd: number;
  private _azimuthVel: ScalarRef;
  private _polar: number;
  private _polarEnd: number;
  private _polarVel: ScalarRef;
  private _distance: number;
  private _distanceEnd: number;
  private _distanceVel: ScalarRef;

  private _upAxis: THREE.Vector3;

  // Pointer state.
  private _orbiting: boolean;
  private _pinching: boolean;
  private _pinchDistance: number;
  private _pointers: Map<number, { x: number; y: number }>;

  // Per-axis "user is controlling" flags (upstream _isUserControllingRotate/_isUserControllingDolly):
  // set by drag-rotate / wheel+pinch respectively, and cleared ONLY by the next programmatic
  // rotate()/dollyTo() call — they intentionally persist past pointerup so the in-flight damping
  // keeps the dragging constant, exactly like upstream.
  private _userDragRotate: boolean;
  private _userDolly: boolean;

  // Preallocated scratch (no allocations in the per-frame path).
  private _sdRef: ScalarRef;
  private _sphericalDir: THREE.Vector3;
  private _fpLook: THREE.Vector3;
  private _camDir: THREE.Vector3;
  private _finalDir: THREE.Vector3;
  private _crossAxis: THREE.Vector3;
  private _rayDir: THREE.Vector3;
  private _corner: THREE.Vector3;
  private _rayOrigin: THREE.Vector3;
  private _zero: THREE.Vector3;
  private _lookMatrix: THREE.Matrix4;
  private _raycaster: THREE.Raycaster;

  // Bound handlers (stored so dispose() removes the same references).
  private _onPointerDown: (e: PointerEvent) => void;
  private _onPointerMove: (e: PointerEvent) => void;
  private _onPointerUp: (e: PointerEvent) => void;
  private _onWheel: (e: WheelEvent) => void;
  private _onContextMenu: (e: MouseEvent) => void;

  // Pointer-lock aim (AG-754). _pausedByGame gates re-lock while a menu or vehicle
  // owns input; the document listeners exist only when aim is capable.
  private _aimSensitivity: number;
  private _aimInvertY: boolean;
  private _onAimChange?: (e: FollowCameraAimEvent) => void;
  private _aimState: FollowCameraAimState;
  private _pausedByGame: boolean;
  // Armed only after a re-lock could not run for lack of a user gesture; the next
  // real gesture (canvas pointerdown, or this document keydown) retries the lock.
  // Kept off after a deliberate Esc so a stray keypress never yanks the cursor back.
  private _retryArmed: boolean;
  private _onLockChange: () => void;
  private _onLockError: () => void;
  private _onRetryKeyDown: () => void;

  constructor(camera: THREE.PerspectiveCamera, options: FollowCameraOptions) {
    this._camera = camera;
    this._domElement = options.domElement;

    this.enabled = true;
    this.followEnabled = true;
    this.smoothTime = options.smoothTime ?? 0.1;
    this.colliderMeshes = options.colliderMeshes ?? [];
    this.firstPerson = options.firstPerson ?? false;

    this._draggingSmoothTime = options.draggingSmoothTime ?? 0.125;
    this._upLerpFactor = options.upLerpFactor ?? 0.1;
    this._minPolarAngle = options.minPolarAngle ?? 0.1;
    this._maxPolarAngle = options.maxPolarAngle ?? Math.PI - 0.1;
    this._minDistance = options.minDistance ?? 0.02;
    this._maxDistance = options.maxDistance ?? 12;
    this._azimuthRotateSpeed = options.azimuthRotateSpeed ?? 1;
    this._polarRotateSpeed = options.polarRotateSpeed ?? 1;
    this._dollySpeed = options.dollySpeed ?? 1;
    this._headingAlignGain = options.headingAlignGain ?? 5;

    this._target = new THREE.Vector3();
    this._targetEnd = new THREE.Vector3();
    this._targetVelocity = new THREE.Vector3();
    this._azimuth = options.initialAzimuthAngle ?? Math.PI;
    this._azimuthEnd = this._azimuth;
    this._azimuthVel = { value: 0 };
    this._polar = THREE.MathUtils.clamp(
      options.initialPolarAngle ?? Math.PI / 2,
      this._minPolarAngle,
      this._maxPolarAngle
    );
    this._polarEnd = this._polar;
    this._polarVel = { value: 0 };
    this._distance = THREE.MathUtils.clamp(
      options.initialDistance ?? 4,
      this._minDistance,
      this._maxDistance
    );
    this._distanceEnd = this._distance;
    this._distanceVel = { value: 0 };

    this._upAxis = new THREE.Vector3(0, 1, 0);

    this._orbiting = false;
    this._pinching = false;
    this._pinchDistance = 0;
    this._pointers = new Map();
    this._userDragRotate = false;
    this._userDolly = false;

    this._sdRef = { value: 0 };
    this._sphericalDir = new THREE.Vector3();
    this._fpLook = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._finalDir = new THREE.Vector3();
    this._crossAxis = new THREE.Vector3();
    this._rayDir = new THREE.Vector3();
    this._corner = new THREE.Vector3();
    this._rayOrigin = new THREE.Vector3();
    this._zero = new THREE.Vector3();
    this._lookMatrix = new THREE.Matrix4();
    this._raycaster = new THREE.Raycaster();

    this._onPointerDown = (e: PointerEvent) => {
      if (!this.enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Aim mode: an unlocked left-click on a mouse requests pointer lock, then
      // falls through to the drag path — so if the lock request is rejected, this
      // same click seamlessly becomes a drag-orbit (the graceful-degradation path).
      if (this._aimState === "unlocked" && e.pointerType === "mouse" && e.button === 0) {
        this._requestLock();
      }
      this._domElement.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 1) {
        this._orbiting = true;
        this._pinching = false;
      } else if (this._pointers.size === 2) {
        this._orbiting = false;
        this._pinching = true;
        this._pinchDistance = this._currentPinchDistance();
      } else {
        this._orbiting = false;
        this._pinching = false;
      }
    };

    this._onPointerMove = (e: PointerEvent) => {
      if (!this.enabled) return;
      if (this._aimState === "locked") {
        // Locked aim: raw movement deltas drive the orbit directly (no pointer
        // tracking). SIGN: mouse-right looks right, mouse-up looks up — the SAME
        // convention as the drag path below (both pan the VIEW: azimuth uses the
        // negative horizontal delta, pitch the negative vertical). Pinned by the
        // signed projection test in follow-camera-aim.test.ts — do not "reason" a
        // flip here; change the test if the convention itself ever changes.
        const s = this._aimSensitivity;
        const pitch = this._aimInvertY ? e.movementY * s : -e.movementY * s;
        this.rotate(-e.movementX * s, pitch, true);
        this._userDragRotate = true; // reuse the dragging smoothTime, like manual orbit
        return;
      }
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this._orbiting) {
        // Full drag across the element HEIGHT (both axes) = one full turn. Drag right pans the
        // view right; drag up looks up. Sign convention is the classic port bug — verified in
        // the testbed; flip here (not in rotate()) if a scene ever disagrees.
        const h = this._domElement.clientHeight || 1;
        this.rotate(
          -2 * Math.PI * this._azimuthRotateSpeed * (dx / h),
          -2 * Math.PI * this._polarRotateSpeed * (dy / h),
          true
        );
        this._userDragRotate = true; // AFTER rotate() — rotate() clears it (upstream lifecycle)
      } else if (this._pinching && this._pointers.size >= 2) {
        const d = this._currentPinchDistance();
        if (this._pinchDistance > 1e-6 && d > 1e-6) {
          // Fingers spread (d grows) -> distance shrinks (zoom in), multiplicatively.
          this.dollyTo(this._distanceEnd * (this._pinchDistance / d), true);
          this._userDolly = true; // AFTER dollyTo() — dollyTo() clears it (upstream lifecycle)
        }
        this._pinchDistance = d;
      }
    };

    this._onPointerUp = (e: PointerEvent) => {
      if (this._domElement.hasPointerCapture(e.pointerId)) {
        this._domElement.releasePointerCapture(e.pointerId);
      }
      this._pointers.delete(e.pointerId);
      if (this._pointers.size === 1) {
        this._orbiting = true;
        this._pinching = false;
      } else if (this._pointers.size === 0) {
        this._orbiting = false;
        this._pinching = false;
      }
    };

    this._onWheel = (e: WheelEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      // First-person has no zoom — and letting the wheel mutate the hidden
      // orbit distance would make the NEXT third-person switch snap to a
      // surprise distance.
      if (this.firstPerson) return;
      // Upstream wheel normalization (unclamped, proportional): pixel mode divides deltaY by
      // deltaYFactor*10 (-30, or -10 on Mac); line mode (Firefox) or ctrlKey (trackpad pinch
      // gesture) divides by deltaYFactor only. Then multiplicative zoom, dollyScale =
      // 0.95^(-delta * dollySpeed) — ~18.7% per classic 100-unit notch. deltaY > 0 zooms out.
      const deltaYFactor = IS_MAC ? -1 : -3;
      const delta =
        e.deltaMode === 1 || e.ctrlKey ? e.deltaY / deltaYFactor : e.deltaY / (deltaYFactor * 10);
      this.dollyTo(this._distanceEnd * Math.pow(0.95, delta * this._dollySpeed), true);
      this._userDolly = true; // AFTER dollyTo() — dollyTo() clears it (upstream lifecycle)
    };

    this._onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    this._domElement.addEventListener("pointerdown", this._onPointerDown);
    this._domElement.addEventListener("pointermove", this._onPointerMove);
    this._domElement.addEventListener("pointerup", this._onPointerUp);
    this._domElement.addEventListener("pointercancel", this._onPointerUp);
    this._domElement.addEventListener("wheel", this._onWheel, { passive: false });
    this._domElement.addEventListener("contextmenu", this._onContextMenu);

    // ---- pointer-lock aim (AG-754) ----
    this._aimSensitivity = options.aimSensitivity ?? 0.0023;
    this._aimInvertY = options.aimInvertY === true;
    this._onAimChange = options.onAimChange;
    this._pausedByGame = false;
    this._retryArmed = false;
    this._onLockChange = () => {
      const locked =
        typeof document !== "undefined" && document.pointerLockElement === this._domElement;
      if (locked) {
        this._retryArmed = false; // a live lock supersedes any pending gesture retry
        if (this._pausedByGame) {
          // A lock grant that lands AFTER setPaused(true): requestPointerLock is
          // async, so the click's request can resolve once a menu/vehicle has
          // already paused aim. Drop it and stay paused — never go live in a menu.
          document.exitPointerLock();
          return;
        }
        this._setAimState("locked", "user-click");
      } else if (this._aimState === "locked") {
        // Lock lost. A game-driven pause routes to "paused"; anything else (Esc,
        // focus loss, tab hide) is the browser's release valve → back to "unlocked".
        // Esc does NOT arm a keydown retry: the player asked for the cursor, so we
        // wait for a deliberate click, not the next stray keypress.
        this._setAimState(
          this._pausedByGame ? "paused" : "unlocked",
          this._pausedByGame ? "paused" : "esc-or-lost",
        );
      }
    };
    // pointerlockerror carries no detail; a genuine permission denial is caught on
    // the requestPointerLock() promise instead. Transient errors just stay "unlocked".
    this._onLockError = () => {};
    // A re-lock that failed for lack of a user gesture (a resume outside a click, or
    // Chrome's post-Esc cooldown) arms this: the next keydown retries the lock, so
    // the player can resume with WASD, not only a click. Only fires while armed +
    // unlocked + not game-paused, so it never fights a deliberate Esc.
    this._onRetryKeyDown = () => {
      if (this._pausedByGame || this._aimState !== "unlocked" || !this._retryArmed) return;
      this._retryArmed = false;
      this._requestLock();
    };
    // Capability gate: aim is ON by default on desktop; opt out with
    // `pointerLockAim: false` (cursor-core games). Also requires a DOM document
    // (node/SSR safe), element API support, and a fine pointer (phones never lock —
    // the mode reports "off" so games don't draw a desktop-only cue).
    const aimCapable =
      options.pointerLockAim !== false &&
      typeof document !== "undefined" &&
      typeof this._domElement.requestPointerLock === "function" &&
      (typeof matchMedia !== "function" || matchMedia("(pointer: fine)").matches);
    this._aimState = aimCapable ? "unlocked" : "off";
    if (aimCapable) {
      document.addEventListener("pointerlockchange", this._onLockChange);
      document.addEventListener("pointerlockerror", this._onLockError);
      document.addEventListener("keydown", this._onRetryKeyDown);
      // Emit the opening state so one onAimChange handler owns ALL aim UI — the
      // "click to aim" cue appears immediately, before any interaction.
      this._onAimChange?.({ state: "unlocked", prev: "off", reason: "init" });
    }
  }

  // ---- follow feed (call before update(), every frame the controller is active) ----

  /**
   * Set the orbit pivot (world space). Feed the controller's head point every frame:
   * `currPos + bodyYAxis * 0.5`. `transition=true` (default) damps toward it; `false` snaps.
   * No-op while `followEnabled` is false.
   */
  moveTo(x: number, y: number, z: number, transition: boolean = true): void {
    if (!this.followEnabled) return;
    this._targetEnd.set(x, y, z);
    if (!transition) {
      this._target.copy(this._targetEnd);
      this._targetVelocity.set(0, 0, 0);
    }
  }

  /**
   * Feed the controller's up-axis. v1: stored + normalized; `camera.up` lerps toward it inside
   * `update()`, but the orbit space stays world +Y (custom-gravity orbit reorientation is a
   * documented v1 cut). No-op while `followEnabled` is false.
   */
  setUp(up: THREE.Vector3): void {
    if (!this.followEnabled) return;
    this._upAxis.copy(up).normalize();
  }

  /**
   * Character-on-platform compensation: rotates the orbit by the FULL signed yaw angle of
   * `turnOnYQuat` (no gain, no dt — the quat is already a per-physics-step delta). Call only
   * when the character controller reports `isOnPlatform`, and only on frames where at least one
   * physics step ran. No-op while `followEnabled` is false.
   */
  applyPlatformTurn(turnOnYQuat: THREE.Quaternion): void {
    if (!this.followEnabled) return;
    this._camera.getWorldDirection(this._camDir).projectOnPlane(this._upAxis).normalize();
    this._finalDir.copy(this._camDir).applyQuaternion(turnOnYQuat);
    this.rotate(this._signedHeadingAngle(), 0, true);
  }

  /**
   * Vehicle heading auto-align: eases the azimuth toward the vehicle's forward axis by
   * `angle * headingAlignGain * dt` per frame (dt = RENDER delta). Skipped while the user is
   * orbiting so manual look-around always wins. No-op while `followEnabled` is false.
   */
  alignHeading(bodyZAxis: THREE.Vector3, dt: number): void {
    if (!this.followEnabled) return;
    if (this.isUserOrbiting) return;
    this._camera.getWorldDirection(this._camDir).projectOnPlane(this._upAxis).normalize();
    this._finalDir.copy(bodyZAxis).projectOnPlane(this._upAxis).normalize();
    this.rotate(this._signedHeadingAngle() * this._headingAlignGain * dt, 0, true);
  }

  // ---- imperative controls ----

  /**
   * Add deltas to the orbit angles (radians). Polar is clamped on the END value so damping never
   * fights the clamp. `transition=false` snaps. Clears the drag-rotate damping flag (upstream
   * rotateTo lifecycle) — platform/vehicle heading compensation goes through here, so it also
   * restores the base `smoothTime` for the angle axes.
   */
  rotate(azimuthDelta: number, polarDelta: number, transition: boolean = true): void {
    this._userDragRotate = false;
    this._azimuthEnd += azimuthDelta;
    this._polarEnd = THREE.MathUtils.clamp(
      this._polarEnd + polarDelta,
      this._minPolarAngle,
      this._maxPolarAngle
    );
    if (!transition) {
      this._azimuth = this._azimuthEnd;
      this._polar = this._polarEnd;
      this._azimuthVel.value = 0;
      this._polarVel.value = 0;
    }
  }

  /**
   * Move the zoom distance by `-delta` (positive delta dollies the camera toward the target).
   * First-person recipe: `cam.dolly(cam.distance - 0.02, true)`.
   */
  dolly(delta: number, transition: boolean = true): void {
    this.dollyTo(this._distanceEnd - delta, transition);
  }

  /**
   * Set the absolute zoom distance, clamped to [minDistance, maxDistance]. Collision-aware
   * (upstream _dollyToNoClamp): while the camera is pinned against geometry, dolly-OUT requests
   * are refused (so zoom-out can't silently accumulate behind a wall), and the END distance is
   * additionally clamped by the collision test. Clears the wheel/pinch damping flag (upstream
   * dollyTo lifecycle).
   */
  dollyTo(distance: number, transition: boolean = true): void {
    this._userDolly = false;
    const clamped = THREE.MathUtils.clamp(distance, this._minDistance, this._maxDistance);
    if (this.colliderMeshes.length > 0) {
      const hit = this._collisionTest();
      const isCollided = Math.abs(hit - this._distance) < EPSILON;
      const isDollyIn = this._distanceEnd > clamped;
      if (!isDollyIn && isCollided) return;
      this._distanceEnd = Math.min(clamped, hit);
    } else {
      this._distanceEnd = clamped;
    }
    if (!transition) {
      this._distance = this._distanceEnd;
      this._distanceVel.value = 0;
    }
  }

  // ---- readonly state ----

  /** Damped (current) zoom distance. */
  get distance(): number {
    return this._distance;
  }

  /** Damped azimuth angle (radians, world-Y orbit space). */
  get azimuthAngle(): number {
    return this._azimuth;
  }

  /** Damped polar angle (radians). */
  get polarAngle(): number {
    return this._polar;
  }

  /** Damped pivot position. Returns the internal vector — read-only, do not mutate. */
  get target(): THREE.Vector3 {
    return this._target;
  }

  /** True while a pointer-drag orbit (or pinch zoom) is in progress. */
  get isUserOrbiting(): boolean {
    return this._orbiting || this._pinching;
  }

  /**
   * Current pointer-lock aim state (AG-754). "off" means aim is disabled or the
   * device has no fine pointer; "unavailable" means lock was permanently rejected.
   */
  get aimState(): FollowCameraAimState {
    return this._aimState;
  }

  /**
   * Radians of view rotation per pixel of locked mouse movement (default 0.0023).
   * Mutable so a pause-menu sensitivity slider can retune aim live.
   */
  get aimSensitivity(): number {
    return this._aimSensitivity;
  }
  set aimSensitivity(v: number) {
    if (Number.isFinite(v) && v > 0) this._aimSensitivity = v;
  }

  /**
   * Suspend or resume aim without disabling the camera. Call `setPaused(true)`
   * when a menu opens (the BOOT menu counts) or the player starts driving; call
   * `setPaused(false)` INSIDE the closing click/keypress handler (browsers only
   * grant re-lock from a user gesture). While paused, canvas clicks do NOT
   * re-lock. No-op when aim is "off" or "unavailable".
   *
   * IDEMPOTENT: a same-value call is a complete no-op — safe to drive from a
   * phase binding (`setPaused(phase !== "playing")`) that may fire repeatedly.
   * This is load-bearing, not a nicety: an unguarded `setPaused(false)` per
   * render frame re-requested the lock every frame, and because ANY DOM click
   * (a Settings button) grants ~5s of transient activation, the next frame
   * grabbed the pointer over the open menu. The resume re-lock therefore only
   * fires on a real paused→unpaused transition; a game that never called
   * `setPaused(true)` gets its re-lock from the canvas click (+ the cue), by
   * design.
   */
  setPaused(paused: boolean): void {
    if (this._aimState === "off" || this._aimState === "unavailable") return;
    if (paused === this._pausedByGame) return; // idempotent — same-value calls are no-ops
    this._pausedByGame = paused;
    if (paused) {
      this._retryArmed = false; // a menu/vehicle owns input now — no gesture retry
      if (typeof document !== "undefined" && document.pointerLockElement === this._domElement) {
        document.exitPointerLock(); // _onLockChange lands on "paused" (_pausedByGame is set)
      } else {
        this._setAimState("paused", "paused");
      }
    } else {
      this._setAimState("unlocked", "resumed");
      this._requestLock(); // legal because the caller is inside a user-gesture handler
    }
  }

  // ---- per-frame ----

  /**
   * Render-phase update. Call ONCE per render frame, AFTER physics stepping + body->mesh sync,
   * with the RENDER delta (never the fixed physics timestep).
   */
  update(dt: number): void {
    if (!this.enabled) return;

    // Up-lerp: naive per-frame lerp with factor 0.1 — intentionally frame-rate dependent for
    // upstream parity (do NOT convert to 1 - exp(-k*dt)).
    if (this.followEnabled) {
      this._camera.up.lerp(this._upAxis, this._upLerpFactor).normalize();
    }

    // Damping: per-axis constants (upstream parity) — angles use the dragging constant while a
    // drag-rotate is in effect, distance while a wheel/pinch zoom is in effect; the follow
    // target ALWAYS uses the base smoothTime (upstream's truck flag is never set by orbit/zoom).
    const rotSt = this._userDragRotate ? this._draggingSmoothTime : this.smoothTime;
    const dollySt = this._userDolly ? this._draggingSmoothTime : this.smoothTime;
    this._azimuth = smoothDamp(this._azimuth, this._azimuthEnd, this._azimuthVel, rotSt, Infinity, dt);
    this._polar = smoothDamp(this._polar, this._polarEnd, this._polarVel, rotSt, Infinity, dt);
    this._distance = smoothDamp(this._distance, this._distanceEnd, this._distanceVel, dollySt, Infinity, dt);
    this._smoothDampVec3(this._target, this._targetEnd, this._targetVelocity, this.smoothTime, dt);

    // Collision pullback (upstream: `_spherical.radius = min(_spherical.radius, collisionTest)`):
    // the DAMPED distance itself is clamped to the hit; `_distanceEnd` (and the velocity) stay
    // untouched, so when the obstruction clears, SmoothDamp eases the camera back out to the
    // user's zoom instead of snapping.
    if (!this.firstPerson && this.colliderMeshes.length > 0) {
      this._distance = Math.min(this._distance, this._collisionTest());
    }

    // Unit offset direction from spherical, world-Y orbit space (THREE.Spherical convention:
    // azimuth 0 = +Z, increasing azimuth = right-hand rotation about +Y).
    const dir = this._sphericalDir.set(
      Math.sin(this._polar) * Math.sin(this._azimuth),
      Math.cos(this._polar),
      Math.sin(this._polar) * Math.cos(this._azimuth)
    );

    if (this.firstPerson) {
      // First-person: the camera sits AT the (eye-height) follow target and
      // looks OUT along the exact direction the orbit camera would have looked
      // from behind (-dir). Sharing the angle state means the pointer-lock aim
      // math — and its verified mouse-direction signs — apply unchanged, and a
      // runtime toggle back to third-person keeps view continuity.
      this._camera.position.copy(this._target);
      this._fpLook.copy(this._target).addScaledVector(dir, -1);
      this._camera.lookAt(this._fpLook);
      return;
    }

    this._camera.position.copy(this._target).addScaledVector(dir, this._distance);
    this._camera.lookAt(this._target);
  }

  // ---- lifecycle ----

  /** Remove all DOM listeners. The camera object itself is left wherever it was. */
  dispose(): void {
    this._domElement.removeEventListener("pointerdown", this._onPointerDown);
    this._domElement.removeEventListener("pointermove", this._onPointerMove);
    this._domElement.removeEventListener("pointerup", this._onPointerUp);
    this._domElement.removeEventListener("pointercancel", this._onPointerUp);
    this._domElement.removeEventListener("wheel", this._onWheel);
    this._domElement.removeEventListener("contextmenu", this._onContextMenu);
    if (typeof document !== "undefined") {
      document.removeEventListener("pointerlockchange", this._onLockChange);
      document.removeEventListener("pointerlockerror", this._onLockError);
      document.removeEventListener("keydown", this._onRetryKeyDown);
      if (document.pointerLockElement === this._domElement) document.exitPointerLock();
    }
    this._retryArmed = false;
    this._pointers.clear();
    this._orbiting = false;
    this._pinching = false;
    this._userDragRotate = false;
    this._userDolly = false;
  }

  // ---- private ----

  /**
   * Signed angle taking `_camDir` to `_finalDir` about `_upAxis` (both scratch vectors must be
   * populated by the caller): `atan2(cross(cur, final) . up, clamp(cur . final, -1, 1))`, with
   * the upstream `dot = -0` guard (atan2(y, -0) flips the branch and produces +-PI spikes).
   */
  private _signedHeadingAngle(): number {
    this._crossAxis.crossVectors(this._camDir, this._finalDir);
    let dot = THREE.MathUtils.clamp(this._camDir.dot(this._finalDir), -1, 1);
    if (Math.abs(dot) < 1e-10) dot = 0; // prevent dot=-0
    return Math.atan2(this._crossAxis.dot(this._upAxis), dot);
  }

  /**
   * Request pointer lock and classify the outcome (AG-754). Outcomes:
   * - No usable user gesture (a resume outside a click, or Chrome's post-Esc
   *   cooldown): skip the doomed request, keep the "click to aim" cue up (a
   *   same-state "needs-gesture" re-emit), and arm a keydown retry.
   * - SecurityError (permission denied — e.g. an iframe without
   *   allow="pointer-lock"): permanent, fall back to drag-orbit ("unavailable").
   * - NotSupportedError from `unadjustedMovement`: retry the plain request (still
   *   inside the transient-activation window, so no new gesture is needed).
   * - Any other rejection: transient — treat like the missing-gesture case.
   */
  private _requestLock(unadjusted = true): void {
    if (typeof document === "undefined") return;
    // Bail before requesting if the browser reports no active user activation:
    // requestPointerLock would reject, so short-circuit to the cue + gesture retry.
    // (Absent userActivation — older browsers, Node stubs — means "can't tell" → proceed.)
    const ua =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { userActivation?: { isActive?: boolean } }).userActivation
        : undefined;
    if (ua && ua.isActive === false) {
      this._retryArmed = true;
      this._setAimState("unlocked", "needs-gesture", true);
      return;
    }
    // Prefer raw device input (no OS mouse acceleration) where supported.
    const request = this._domElement.requestPointerLock as unknown as (
      options?: { unadjustedMovement?: boolean },
    ) => Promise<void> | undefined;
    const ret = request.call(this._domElement, unadjusted ? { unadjustedMovement: true } : undefined);
    ret?.catch?.((err: unknown) => {
      const name = (err as DOMException)?.name;
      if (name === "NotSupportedError" && unadjusted) {
        this._requestLock(false); // retry without the raw-input option
        return;
      }
      if (name === "SecurityError") {
        this._setAimState("unavailable", "rejected");
        return;
      }
      // A rejection can land AFTER a menu paused aim (requestPointerLock is async,
      // same race as the late grant in _onLockChange). Never pop the "click to aim"
      // cue over an open menu — stay paused; the resume path re-requests anyway.
      if (this._pausedByGame) return;
      this._retryArmed = true;
      this._setAimState("unlocked", "needs-gesture", true);
    });
  }

  /**
   * Transition aim state and fire onAimChange. Same-state transitions are a no-op
   * UNLESS `forceEmit` (the "needs-gesture" re-emit, which keeps the "unlocked"
   * cue up after a failed silent re-lock — see FollowCameraAimEvent).
   */
  private _setAimState(
    state: FollowCameraAimState,
    reason: FollowCameraAimEvent["reason"],
    forceEmit = false,
  ): void {
    if (state === this._aimState && !forceEmit) return;
    const prev = this._aimState;
    this._aimState = state;
    this._onAimChange?.({ state, prev, reason });
  }

  /**
   * Collision test (upstream _collisionTest): 4 rays from the target's near-plane corners toward
   * the camera along the DAMPED orbit direction (a single center ray would let the near plane
   * clip through wall edges); ray reach is `_distance + 1`. Returns the nearest hit distance, or
   * Infinity when nothing is hit / no colliders. fov/aspect/near are read fresh each call so
   * window resizes keep working.
   */
  private _collisionTest(): number {
    let distance = Infinity;
    if (this.colliderMeshes.length === 0) return distance;
    const dir = this._rayDir.set(
      Math.sin(this._polar) * Math.sin(this._azimuth),
      Math.cos(this._polar),
      Math.sin(this._polar) * Math.cos(this._azimuth)
    );
    const nearH =
      Math.tan(THREE.MathUtils.degToRad(this._camera.getEffectiveFOV()) / 2) * this._camera.near;
    const nearW = nearH * this._camera.aspect;
    this._lookMatrix.lookAt(this._zero, dir, this._camera.up);
    for (let i = 0; i < 4; i++) {
      const sx = (i & 1) === 0 ? 1 : -1;
      const sy = (i & 2) === 0 ? 1 : -1;
      this._corner.set(sx * nearW, sy * nearH, 0).applyMatrix4(this._lookMatrix);
      this._rayOrigin.copy(this._target).add(this._corner);
      this._raycaster.set(this._rayOrigin, dir);
      this._raycaster.far = this._distance + 1;
      const hits = this._raycaster.intersectObjects(this.colliderMeshes, false);
      const first = hits[0];
      if (first && first.distance < distance) distance = first.distance;
    }
    return distance;
  }

  /** Distance in CSS pixels between the first two tracked pointers (0 if fewer than two). */
  private _currentPinchDistance(): number {
    let first: { x: number; y: number } | null = null;
    for (const p of this._pointers.values()) {
      if (first === null) {
        first = p;
      } else {
        return Math.hypot(p.x - first.x, p.y - first.y);
      }
    }
    return 0;
  }

  /**
   * Component-wise scalar SmoothDamp for the target vector (visually identical to a coupled
   * vec3 SmoothDamp at smoothTime ~0.1; faithful simplification, noted per the port spec).
   */
  private _smoothDampVec3(
    current: THREE.Vector3,
    target: THREE.Vector3,
    velocity: THREE.Vector3,
    smoothTime: number,
    dt: number
  ): void {
    this._sdRef.value = velocity.x;
    current.x = smoothDamp(current.x, target.x, this._sdRef, smoothTime, Infinity, dt);
    velocity.x = this._sdRef.value;
    this._sdRef.value = velocity.y;
    current.y = smoothDamp(current.y, target.y, this._sdRef, smoothTime, Infinity, dt);
    velocity.y = this._sdRef.value;
    this._sdRef.value = velocity.z;
    current.z = smoothDamp(current.z, target.z, this._sdRef, smoothTime, Infinity, dt);
    velocity.z = this._sdRef.value;
  }
}
