// SPDX-FileCopyrightText: 2023-2026 Erdong Chen
// SPDX-License-Identifier: MIT
// Vanilla-TS port of the ecctrl character controller's animation layer (React/R3F/zustand shells removed).
//
// Port notes / deliberate deviations from upstream:
// - De-branding renames: `EcctrlAnimationState` -> `CharacterAnimationState`,
//   `resolveEcctrlAnimationState` -> `resolveAnimationState`, `EcctrlAnimationStateContext`
//   -> `AnimationStateContext` (the `handle` field is dropped so the resolver stays pure).
// - The zustand animation store + `EcctrlAnimationStateController` component + the demo's
//   `AnimatedCharacterModel` playback effect are folded into one `CharacterAnimations` class;
//   drei `useAnimations`'s implicit mixer tick becomes an explicit `mixer.update(dt)`.
// - Upstream reads `e.action._clip` (private API); this port uses `e.action.getClip().name`.
// - Upstream sets the store (crossfade via re-render) and THEN calls `onChange`; this port
//   applies the transition then fires `onChange` — same observable order. The transition
//   attempt (and the stuck-lock release checks) run every update, guarded and idempotent:
//   the non-React equivalent of upstream's playback effect re-running on `canPlayNext`
//   changes (this is what fades Jump_Loop/Idle_Loop in after a one-shot finishes).
// - `crossFadeFrom`'s `warp` argument is passed explicitly as `false` (upstream omits it), and
//   the crossfade is skipped (plain `.play()`) when no previous action is cached.
// - NEW (no upstream source): `buildClipMap` alias-based fuzzy clip lookup + hole-filling
//   chaining, and the procedural bob/lean fallback (PROC_* constants) for rig-less models.
// - NEW: the IDLE-bound action starts playing in the constructor (upstream leaves the rig in
//   bind pose until the first state change).
// - RUN's default clip is `Jog_Fwd_Loop` (the value the upstream demo actually runs);
//   `Sprint_Loop` is the second exact choice and also binds via alias.
// - The state controller's `enabled` prop and the `timeScale` RefObject variant are dropped in
//   favor of `setPaused(boolean)` / `setTimeScale(number)`.

import * as THREE from "three";

// ---------------------------------------------------------------------------
// State resolver (pure port)
// ---------------------------------------------------------------------------

/** The nine animation states the resolver can produce. */
export type CharacterAnimationState =
  | "IDLE"
  | "WALK"
  | "RUN"
  | "CROUCH_IDLE"
  | "CROUCH_MOVE"
  | "JUMP_START"
  | "JUMP_IDLE"
  | "JUMP_FALL"
  | "JUMP_LAND";

/**
 * The plain state snapshot the animation system consumes each frame.
 * Defined HERE, never imported from the controller — `CharacterController`'s readonly getters
 * satisfy it structurally, so you can pass the controller instance straight into `update()`.
 * Any object with these five booleans works (handy for networked remote players).
 */
export interface CharacterStateSnapshot {
  /** Ground contact within the float-ray forgiveness window. */
  readonly isOnGround: boolean;
  /** Airborne and moving downward (velocity·up < 0). */
  readonly isFalling: boolean;
  /** INPUT-based, not velocity-based: true while the player is steering the character. */
  readonly isMoving: boolean;
  /** Run key held (or toggled, when the controller uses toggle-run). */
  readonly runActive: boolean;
  /** True during the short jump window (default 0.1 s), not for the whole airborne arc. */
  readonly jumpActive: boolean;
  /**
   * True while the capsule is crouched (AG-775). OPTIONAL for backward
   * compatibility — a five-boolean snapshot (e.g. an older networked remote
   * player) behaves exactly as before (treated as `false`).
   */
  readonly crouchActive?: boolean;
}

export type LocomotionDirection =
  | "forward"
  | "forward-right"
  | "right"
  | "backward-right"
  | "backward"
  | "backward-left"
  | "left"
  | "forward-left";

export interface AdvancedCharacterStateSnapshot extends CharacterStateSnapshot {
  readonly inputDir: THREE.Vector3;
  readonly relativeVelOnPlane: THREE.Vector3;
  readonly bodyXAxis: THREE.Vector3;
  readonly bodyZAxis: THREE.Vector3;
  readonly moveSpeed: number;
  readonly lockForward: boolean;
}

export interface LocomotionProfile {
  /** Explicit semantic slot → stable clip id. Unavailable slots use declared fallbacks. */
  slots: Readonly<Record<string, string>>;
  nominalSpeed?: Partial<Record<"walk" | "run" | "crouch", number>>;
  playbackRate?: { min: number; max: number };
  directionHysteresisDegrees?: number;
}

/** Snapshot plus the previous frame's ground flag (derived internally by CharacterAnimations). */
export interface AnimationStateContext extends CharacterStateSnapshot {
  readonly wasOnGround: boolean;
  /** Always present in the context (missing snapshot flag defaults to false). */
  readonly crouchActive: boolean;
}

/** Custom state-resolver signature — must stay a pure function over the context. */
export type AnimationStateResolver = (ctx: AnimationStateContext) => CharacterAnimationState;

/**
 * Pure animation-state resolver (upstream logic + crouch). Check order is load-bearing:
 * JUMP_START outranks everything (fires on the ground frame where the jump window opened);
 * JUMP_LAND outranks IDLE/WALK/RUN for exactly one evaluation after touchdown; crouch
 * outranks the standing ground states (landing while crouched flashes JUMP_LAND for one
 * evaluation, then settles into CROUCH_*).
 */
export function resolveAnimationState(ctx: AnimationStateContext): CharacterAnimationState {
  const { isOnGround, wasOnGround, isFalling, isMoving, runActive, jumpActive, crouchActive } =
    ctx;

  if (jumpActive && wasOnGround) return "JUMP_START";

  if (isOnGround) {
    if (!wasOnGround) return "JUMP_LAND";
    if (crouchActive) return isMoving ? "CROUCH_MOVE" : "CROUCH_IDLE";
    if (!isMoving) return "IDLE";
    return runActive ? "RUN" : "WALK";
  }

  return isFalling ? "JUMP_FALL" : "JUMP_IDLE";
}

// ---------------------------------------------------------------------------
// Clip lookup (alias-based fuzzy naming for clips already compatible with the active rig)
// ---------------------------------------------------------------------------

/** Resolved clip NAME per state; null = unbound (procedural fallback may take over). */
export type ClipMap = Record<CharacterAnimationState, string | null>;

const ALL_STATES: readonly CharacterAnimationState[] = [
  "IDLE",
  "WALK",
  "RUN",
  "CROUCH_IDLE",
  "CROUCH_MOVE",
  "JUMP_START",
  "JUMP_IDLE",
  "JUMP_FALL",
  "JUMP_LAND",
];

type ClipSearchSpec = {
  /** Quaternius Universal Animation Library names, tried first (exact, then case-insensitive). */
  exact: readonly string[];
  /** Case-insensitive substring aliases, in priority order. */
  aliases: readonly string[];
};

const CLIP_SEARCH: Record<CharacterAnimationState, ClipSearchSpec> = {
  IDLE: { exact: ["Idle_Loop"], aliases: ["idle", "stand", "breath"] },
  WALK: { exact: ["Walk_Loop"], aliases: ["walk"] },
  RUN: { exact: ["Jog_Fwd_Loop", "Sprint_Loop"], aliases: ["run", "jog", "sprint"] },
  // Aliases stay SPECIFIC on purpose: a bare "crouch" substring would greedily
  // match any of the 9+ Crouch_* pack clips (Crouch_Enter, Crouch_Bwd_Loop, …).
  CROUCH_IDLE: { exact: ["Crouch_Idle_Loop"], aliases: ["crouch_idle", "sneak_idle"] },
  CROUCH_MOVE: {
    exact: ["Crouch_Fwd_Loop"],
    aliases: ["crouch_walk", "crouch_fwd", "sneak_walk", "sneak"],
  },
  // Only the LOOP jump states (JUMP_IDLE/JUMP_FALL) end with a bare "jump" alias (lowest priority
  // — the specific compound tokens above always win when present) so a rig whose only airborne clip
  // is named "Jump" / "Jumping" still animates mid-air instead of playing the ground loop.
  // The one-shot states (JUMP_START/JUMP_LAND) deliberately OMIT the bare "jump" alias: binding them
  // to a shared loop clip (e.g. "Jump_Loop") makes them one-shot-clamp that clip, freezing the rig on
  // its last frame through the whole airborne arc — the same reason the hole-filling below leaves
  // them null. Without a specific start/land clip they stay null and the previous loop keeps playing.
  JUMP_START: {
    exact: ["Jump_Start"],
    aliases: ["jump_start", "jumpstart", "jump start", "jump_up", "takeoff"],
  },
  JUMP_IDLE: { exact: ["Jump_Loop"], aliases: ["jump_loop", "jump_idle", "air", "fall", "jump"] },
  JUMP_FALL: { exact: ["Jump_Loop"], aliases: ["jump_loop", "fall", "falling", "air", "jump"] },
  JUMP_LAND: { exact: ["Jump_Land"], aliases: ["jump_land", "land"] },
};

/**
 * Bind animation clips to states by fuzzy name lookup.
 *
 * Per state, first match wins: explicit override (exact, then case-insensitive) → UAL exact
 * names → UAL case-insensitive → each alias as a case-insensitive SUBSTRING (shortest matching
 * clip name wins, so `Walk_Loop` beats `Walk_Bwd_Loop` and a generic `walking` beats
 * `walking_backwards`). Afterwards LOOP-state holes are chained (RUN↔WALK, JUMP_IDLE↔JUMP_FALL)
 * so partially-animated rigs still move; one-shot states (JUMP_START/JUMP_LAND) stay null when
 * unbound so the previous loop keeps playing (upstream behavior) instead of clamping a loop clip.
 *
 * If your rig's names don't bind, pass `overrides` — e.g. `{ RUN: "MyFastRun" }`.
 */
export function buildClipMap(
  clips: THREE.AnimationClip[],
  overrides?: Partial<Record<CharacterAnimationState, string>>
): ClipMap {
  const names = clips.map((clip) => clip.name);
  const lowerNames = names.map((name) => name.toLowerCase());

  const findExact = (name: string): string | null => (names.includes(name) ? name : null);
  const findCiExact = (name: string): string | null => {
    const index = lowerNames.indexOf(name.toLowerCase());
    return index >= 0 ? names[index] : null;
  };

  const resolveClip = (state: CharacterAnimationState): string | null => {
    const override = overrides?.[state];
    if (override !== undefined) {
      const hit = findExact(override) ?? findCiExact(override);
      if (hit !== null) return hit;
      console.warn(
        `[CharacterAnimations] clip override "${override}" for state ${state} matches no clip; falling back to fuzzy lookup.`
      );
    }
    const spec = CLIP_SEARCH[state];
    for (const exactName of spec.exact) {
      const hit = findExact(exactName);
      if (hit !== null) return hit;
    }
    for (const exactName of spec.exact) {
      const hit = findCiExact(exactName);
      if (hit !== null) return hit;
    }
    for (const alias of spec.aliases) {
      let best: string | null = null;
      for (let i = 0; i < names.length; i++) {
        if (lowerNames[i].includes(alias) && (best === null || names[i].length < best.length)) {
          best = names[i];
        }
      }
      if (best !== null) return best;
    }
    return null;
  };

  const map: ClipMap = {
    IDLE: null,
    WALK: null,
    RUN: null,
    CROUCH_IDLE: null,
    CROUCH_MOVE: null,
    JUMP_START: null,
    JUMP_IDLE: null,
    JUMP_FALL: null,
    JUMP_LAND: null,
  };
  for (const state of ALL_STATES) map[state] = resolveClip(state);

  // Hole-filling chaining so partial rigs still animate — LOOP states only.
  // JUMP_START/JUMP_LAND are deliberately NOT hole-filled: they get one-shot playback
  // (LoopOnce + clampWhenFinished), and aliasing a loop clip (idle, fall) onto them would
  // freeze the rig in a clamped pose after every stop/landing. Left null they reproduce
  // upstream's missing-action early return: the previous loop keeps playing.
  if (map.RUN === null) map.RUN = map.WALK;
  if (map.WALK === null) map.WALK = map.RUN;
  if (map.JUMP_FALL === null) map.JUMP_FALL = map.JUMP_IDLE;
  if (map.JUMP_IDLE === null) map.JUMP_IDLE = map.JUMP_FALL;
  // Crouch degrades to the standing loops on rigs without crouch clips (old
  // 46-clip libraries and same-rig catalog exports) — wrong pose beats a frozen T-pose.
  if (map.CROUCH_IDLE === null) map.CROUCH_IDLE = map.IDLE;
  if (map.CROUCH_MOVE === null) map.CROUCH_MOVE = map.WALK ?? map.CROUCH_IDLE;
  return map;
}

// ---------------------------------------------------------------------------
// Playback constants (upstream demo values)
// ---------------------------------------------------------------------------

/** One-shot (JUMP_START/JUMP_LAND) actions play sped up so they finish inside the hop. */
const ONE_SHOT_TIME_SCALE = 1.6;
/** Crossfade into a one-shot action, seconds (scaled by the effective mixer timeScale). */
const ONE_SHOT_FADE_DURATION = 0.1;
/** Crossfade between looping actions, seconds (scaled by the effective mixer timeScale). */
const LOOP_FADE_DURATION = 0.2;
/** Floor for the fade timeScale factor — prevents a zero-length fade while paused. */
const FADE_TIME_SCALE_FLOOR = 0.05;

// Procedural fallback constants (NEW — no upstream source). Tuning hints:
// raise the *_BOB_FREQ values for a more frantic gait, the *_BOB_AMP values for a bouncier
// one; *_LEAN tips the model forward while moving; PROC_SMOOTHING is the blend rate
// (higher = snappier transitions between offsets).
const PROC_WALK_BOB_FREQ = 8; // rad/s
const PROC_RUN_BOB_FREQ = 12; // rad/s
const PROC_WALK_BOB_AMP = 0.03; // m
const PROC_RUN_BOB_AMP = 0.05; // m
const PROC_WALK_LEAN = 0.06; // rad, forward-positive about local X
const PROC_RUN_LEAN = 0.12; // rad
const PROC_AIR_LEAN = -0.08; // rad
const PROC_LAND_DIP = 0.06; // m
const PROC_SMOOTHING = 10; // in k = 1 - exp(-PROC_SMOOTHING * dt)

// ---------------------------------------------------------------------------
// Mixer state machine
// ---------------------------------------------------------------------------

export interface CharacterAnimationsOptions {
  /** Per-state clip-name overrides; passed through to {@link buildClipMap}. */
  clipMap?: Partial<Record<CharacterAnimationState, string>>;
  /** Custom state resolver; default {@link resolveAnimationState}. */
  resolver?: AnimationStateResolver;
  /** Fired once per state CHANGE, after the transition is applied. Receives a context copy. */
  onChange?: (state: CharacterAnimationState, ctx: AnimationStateContext) => void;
  /**
   * "auto" (default): procedural bob/lean when no usable clips bind;
   * "procedural": force the procedural fallback even when clips exist;
   * "none": do nothing when unbound (model stays static).
   */
  fallback?: "auto" | "procedural" | "none";
  /** Optional controller-aware directional locomotion profile. */
  locomotionProfile?: LocomotionProfile;
}

/** Options for {@link CharacterAnimations.playOneShot}. */
export interface PlayOneShotOptions {
  /** Crossfade-in seconds from the current motion. Default 0.1. */
  fadeIn?: number;
  /** Playback speed. Default 1. */
  timeScale?: number;
  /** Clamp the final pose instead of returning to the loop. Default false. */
  clamp?: boolean;
  /** Fired when the clip finishes (skipped if a newer one-shot interrupts it). */
  onDone?: () => void;
  /**
   * Movement cancels this one-shot. Every one-shot is FULL-BODY (there is no
   * upper-body layering), so it freezes the legs — a moving character SLIDES
   * across the ground in a static pose for the clip's whole length (a 2.9s hit
   * reaction, a 2.7s cast). With `interruptible: true`, grounded movement
   * intent releases the clip via {@link CharacterAnimations.clearOneShot} and
   * locomotion takes over immediately. Use it for reactions and gestures a
   * player can walk out of; leave it off for poses that must hold to their end
   * (a death/knockdown). Default false.
   */
  interruptible?: boolean;
}

type MutableAnimationStateContext = {
  -readonly [Key in keyof AnimationStateContext]: AnimationStateContext[Key];
};

/**
 * Animation state machine for the character: resolves a state from the controller's snapshot,
 * crossfades `THREE.AnimationMixer` actions (one-shot jump start/land, looping everything
 * else), and falls back to a procedural bob/lean for rig-less models.
 *
 * Call `update(controller, renderDelta)` once per render frame AFTER the physics stepping
 * loop — never inside it, and always with the render-clock delta (the mixer's own timeScale
 * handles pause/slow-motion).
 */
export class CharacterAnimations {
  /** Escape hatch for playing extra clips (e.g. `Sitting_Enter` on vehicle entry). */
  readonly mixer: THREE.AnimationMixer;

  #model: THREE.Object3D;
  #clipMap: ClipMap;
  #resolver: AnimationStateResolver;
  #onChange: ((state: CharacterAnimationState, ctx: AnimationStateContext) => void) | undefined;
  #actions = new Map<string, THREE.AnimationAction>();
  // Every provided clip by name — lets playOneShot reach clips beyond the 9
  // locomotion states (any installed pack clip: Punch_*, Sword_*, Sitting_*…).
  #clipsByName = new Map<string, THREE.AnimationClip>();
  #missingOneShotWarnings = new Set<string>();
  #oneShotAction: THREE.AnimationAction | null = null;
  #locomotionOneShotAction: THREE.AnimationAction | null = null;
  #oneShotOnDone: (() => void) | undefined;
  // When true, the active one-shot holds its final pose on finish (clamp:true —
  // e.g. Death01) instead of crossfading back to locomotion.
  #oneShotHoldPose = false;
  // When true, grounded movement intent cancels the active one-shot (see
  // PlayOneShotOptions.interruptible).
  #oneShotInterruptible = false;

  #state: CharacterAnimationState = "IDLE";
  #prevActionName: string | null;
  #canPlayNext = true;
  #initialized = false;
  #previousIsOnGround = false;
  #ctx: MutableAnimationStateContext;

  #timeScale = 1;
  #paused = false;
  #prevMixerTimeScale = -1;

  #usingProceduralFallback: boolean;
  #basePositionY: number;
  #baseRotationX: number;
  #procPhase = 0;
  #bobOffset = 0;
  #leanOffset = 0;

  #disposed = false;
  #onFinished: (event: { action: THREE.AnimationAction }) => void;
  #locomotionProfile: LocomotionProfile | undefined;
  #desiredMotionName: string | null;
  #lastDirection: LocomotionDirection = "forward";
  #lastSpeedBand: "walk" | "run" | "crouch" = "walk";
  #previousMoving = false;

  /**
   * @param model root Object3D of the character visual (mixer root; also the transform target
   *              for the procedural fallback).
   * @param clips animation clips (e.g. `gltf.animations` from the bundled animation library, a
   *              source-biped export, or `[]` — an empty array triggers the procedural fallback
   *              under the default `"auto"` mode).
   */
  constructor(
    model: THREE.Object3D,
    clips: THREE.AnimationClip[],
    options: CharacterAnimationsOptions = {}
  ) {
    this.#model = model;
    // Seed the fuzzy name-matched map from the locomotion profile's own slots
    // (explicit options.clipMap still wins). Simple boolean snapshots (remote
    // players, bots) never reach the profile's directional resolver and fall
    // through to this map — without the seed they bind DIFFERENT clips than the
    // local player ("Running" vs the profile's run.forward), so the same
    // movement renders as two different gaits on two screens. Jump states are
    // deliberately NOT seeded: jump.full would one-shot-clamp as a loop.
    const slots = options.locomotionProfile?.slots ?? {};
    const profileSeed: Partial<Record<CharacterAnimationState, string>> = {};
    const seedPairs: ReadonlyArray<[CharacterAnimationState, string]> = [
      ["IDLE", "idle.default"],
      ["WALK", "walk.forward"],
      ["RUN", "run.forward"],
      ["CROUCH_IDLE", "crouch.idle"],
      ["CROUCH_MOVE", "crouch.forward"],
    ];
    for (const [state, slot] of seedPairs) {
      const clip = slots[slot];
      if (clip) profileSeed[state] = clip;
    }
    this.#clipMap = buildClipMap(clips, { ...profileSeed, ...options.clipMap });
    this.#resolver = options.resolver ?? resolveAnimationState;
    this.#onChange = options.onChange;
    this.#locomotionProfile = options.locomotionProfile;
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) this.#clipsByName.set(clip.name, clip);

    // Cache one AnimationAction per bound clip so repeated lookups are free and
    // crossFadeFrom always finds the previous action still alive.
    const boundNames = new Set<string>();
    for (const state of ALL_STATES) {
      const name = this.#clipMap[state];
      if (name !== null) boundNames.add(name);
    }
    for (const name of Object.values(this.#locomotionProfile?.slots ?? {})) {
      if (this.#clipsByName.has(name)) boundNames.add(name);
      else console.warn(`[CharacterAnimations] locomotion slot clip "${name}" is not installed.`);
    }
    for (const clip of clips) {
      if (boundNames.has(clip.name) && !this.#actions.has(clip.name)) {
        this.#actions.set(clip.name, this.mixer.clipAction(clip));
      }
    }

    const fallback = options.fallback ?? "auto";
    const rigUnbound = this.#clipMap.IDLE === null && this.#clipMap.WALK === null;
    this.#usingProceduralFallback =
      fallback === "procedural" || (fallback === "auto" && rigUnbound);

    // Procedural fallback is additive over the transform captured here — never cumulative.
    this.#basePositionY = model.position.y;
    this.#baseRotationX = model.rotation.x;

    this.#desiredMotionName =
      this.#resolveProfileSlot("idle.default") ?? this.#clipMap.IDLE;
    this.#prevActionName = this.#desiredMotionName;
    if (this.#prevActionName !== null) {
      // NEW vs upstream: start the idle clip immediately (upstream stayed in bind pose
      // until the first state change).
      this.#actions.get(this.#prevActionName)?.play();
    }

    this.#ctx = {
      isOnGround: false,
      wasOnGround: false,
      isFalling: false,
      isMoving: false,
      runActive: false,
      jumpActive: false,
      crouchActive: false,
    };

    this.#onFinished = (event) => {
      // One-shot (punch/gesture) finished.
      if (this.#oneShotAction && event.action === this.#oneShotAction) {
        const finished = this.#oneShotAction;
        const done = this.#oneShotOnDone;
        if (this.#oneShotHoldPose) {
          // clamp:true — keep the clamped final frame and stay locked until a
          // later playOneShot() (or an explicit change) replaces it.
          this.#oneShotOnDone = undefined;
          done?.();
          return;
        }
        // Default: hand control back to locomotion by crossfading the current
        // state's loop in FROM the just-finished one-shot, which is clamped on
        // its last frame (see playOneShot). Doing this here — in the same mixer
        // tick that fires "finished", from a still-posing clamped action —
        // is what prevents the one-frame unposed T-pose flash the old deferred
        // reset().play() left between finish and the next update.
        this.#oneShotAction = null;
        this.#oneShotOnDone = undefined;
        this.#canPlayNext = true;
        this.#recoverFromOneShot(finished);
        done?.();
        return;
      }
      if (this.#locomotionOneShotAction && event.action === this.#locomotionOneShotAction) {
        this.#locomotionOneShotAction = null;
        this.#canPlayNext = true;
        return;
      }
      const clipName = event.action.getClip().name;
      if (
        !this.#canPlayNext &&
        (clipName === this.#clipMap.JUMP_START || clipName === this.#clipMap.JUMP_LAND)
      ) {
        this.#canPlayNext = true;
      }
    };
    this.mixer.addEventListener("finished", this.#onFinished);
  }

  /** Current resolved animation state (starts `"IDLE"`). */
  get state(): CharacterAnimationState {
    return this.#state;
  }

  /** The resolved state→clip-name binding (for debugging; treat as read-only). */
  get clipMap(): ClipMap {
    return this.#clipMap;
  }

  /** Clip currently posing the locomotion layer (stable id for advanced profiles). */
  get activeClipName(): string | null {
    return this.#prevActionName;
  }

  /**
   * True while a {@link playOneShot} clip is playing (or holding its final
   * pose with `holdPose`). Feed `() => !anims.oneShotActive` to foot IK's
   * `allowReachDown` so one-shot choreography can't drag the pelvis down
   * a step edge, and use it to block "fire again" spam in game code.
   */
  get oneShotActive(): boolean {
    return this.#oneShotAction !== null;
  }

  /** True when the procedural bob/lean drives the model instead of animation clips. */
  get usingProceduralFallback(): boolean {
    return this.#usingProceduralFallback;
  }

  /**
   * Call once per render frame AFTER the physics stepping loop.
   * @param snapshot anything satisfying {@link CharacterStateSnapshot} — typically the
   *                 CharacterController instance itself.
   * @param dt RAW render-clock delta in seconds (do NOT pre-multiply by timeScale).
   */
  update(snapshot: CharacterStateSnapshot, dt: number): void {
    if (this.#disposed) return;

    const ctx = this.#ctx;
    ctx.isOnGround = snapshot.isOnGround;
    // First-ever frame uses the CURRENT value so a character that spawns grounded
    // does not fire JUMP_LAND.
    ctx.wasOnGround = this.#initialized ? this.#previousIsOnGround : snapshot.isOnGround;
    ctx.isFalling = snapshot.isFalling;
    ctx.isMoving = snapshot.isMoving;
    ctx.runActive = snapshot.runActive;
    ctx.jumpActive = snapshot.jumpActive;
    // Optional in the snapshot (older five-boolean remote-player objects).
    ctx.crouchActive = snapshot.crouchActive ?? false;

    // Grounded movement cancels an interruptible one-shot — otherwise the
    // frozen full-body pose slides across the ground for the clip's whole
    // length. clearOneShot crossfades locomotion back in with no T-pose frame.
    if (this.#oneShotAction && this.#oneShotInterruptible && ctx.isMoving && ctx.isOnGround) {
      this.clearOneShot();
    }

    const next = this.#resolver(ctx);
    const stateChanged = next !== this.#state;
    if (stateChanged) this.#state = next;
    // Attempt the transition EVERY update, not only on state change — the non-React
    // equivalent of upstream's effect re-running on canPlayNext changes: after a one-shot
    // (Jump_Start/Jump_Land) finishes and unlocks, the pending loop clip must still fade in
    // even though the state did not change again. Internal guards make this a no-op otherwise.
    this.#desiredMotionName = this.#resolveLocomotionClip(snapshot, next) ?? this.#clipMap[next];
    // Rigs whose airborne slots fall back to the SAME clip as jump.start (every
    // Meshy rig: jump.rise/jump.fall → jump.full) never re-enter #applyTransition
    // while airborne — the name never changes — so once the one-shot finishes the
    // character hangs FROZEN in the jump's final frame for the rest of the fall
    // (long drops, knockback launches). Once the held action has finished
    // (paused+clamped), retarget sustained airtime at the idle loop so the limbs
    // keep animating while descending.
    if ((next === "JUMP_IDLE" || next === "JUMP_FALL") && this.#desiredMotionName !== null) {
      const held = this.#actions.get(this.#desiredMotionName);
      if (held && held.paused) {
        this.#desiredMotionName = this.#resolveProfileSlot("idle.default") ?? this.#clipMap.IDLE;
      }
    }
    // A full-jump profile clip may outlast a very short physics hop. Release
    // its one-shot lock as soon as the controller lands so idle/walk can
    // crossfade immediately instead of waiting for the authored clip to end.
    if (this.#locomotionOneShotAction && ctx.isOnGround && next !== "JUMP_START") {
      this.#locomotionOneShotAction = null;
      this.#canPlayNext = true;
    }
    const movingNow = ctx.isMoving && ctx.isOnGround;
    if (this.#locomotionProfile && movingNow !== this.#previousMoving && !this.oneShotActive) {
      const transition = movingNow
        ? this.#resolveProfileSlot(`start.${this.#lastSpeedBand}.${this.#lastDirection}`)
        : this.#resolveProfileSlot(`stop.${this.#lastSpeedBand}.${this.#lastDirection}`);
      if (transition) this.playOneShot(transition, { fadeIn: ONE_SHOT_FADE_DURATION });
    }
    this.#applyTransition();
    this.#updateLocomotionRate(snapshot, next);
    if (stateChanged) {
      // Context copy: the live ctx object is reused every frame.
      this.#onChange?.(next, { ...ctx });
    }

    this.#previousIsOnGround = snapshot.isOnGround;
    this.#previousMoving = movingNow;
    this.#initialized = true;

    this.#releaseStuckLocks();

    if (this.#usingProceduralFallback) this.#updateProcedural(dt);

    const effectiveTimeScale = this.#paused ? 0 : this.#timeScale;
    if (this.#prevMixerTimeScale !== effectiveTimeScale) {
      this.mixer.timeScale = effectiveTimeScale;
      this.#prevMixerTimeScale = effectiveTimeScale;
    }
    // Raw render delta — mixer.timeScale does the scaling internally.
    this.mixer.update(dt);
  }

  /**
   * Global playback speed (default 1). Fade durations stretch with it, so slow-motion
   * transitions stay smooth instead of popping.
   */
  setTimeScale(timeScale: number): void {
    this.#timeScale = timeScale;
  }

  /** Paused ⇒ effective mixer timeScale 0 (state resolution keeps running). */
  setPaused(paused: boolean): void {
    this.#paused = paused;
  }

  /**
   * Play a full-body one-shot clip (punch, wave, pick-up, cast…) over the current
   * locomotion, then hand control back to the state machine when it finishes. Any
   * NON-locomotion clip from the set passed to the constructor works — see the
   * character-controller skill's tagged pack catalog (Punch_Jab/Cross, Sword_Attack,
   * Pistol_Shoot, Interact, Hit_Chest, …; install more with `genex controller anims`).
   * Returns false if the clip name is unknown.
   *
   * @example
   * // punch on click:
   * addEventListener('pointerdown', () => anims.playOneShot('Punch_Jab'));
   */
  playOneShot(clipName: string, options: PlayOneShotOptions = {}): boolean {
    if (this.#disposed) return false;
    const clip = this.#clipsByName.get(clipName);
    if (!clip) {
      if (!this.#missingOneShotWarnings.has(clipName)) {
        this.#missingOneShotWarnings.add(clipName);
        console.warn(`[character-animations] one-shot clip "${clipName}" is not installed; playOneShot() returned false.`);
      }
      return false;
    }

    const action = this.mixer.clipAction(clip);

    // Crossfade the new one-shot FROM whatever is currently posing: a still-playing
    // previous one-shot (rapid re-punch) takes priority over the cached locomotion
    // action, so re-punching blends punch→punch instead of dipping toward bind pose.
    const prevOneShot =
      this.#oneShotAction && this.#oneShotAction !== action ? this.#oneShotAction : null;
    const current =
      prevOneShot ??
      (this.#prevActionName !== null ? this.#actions.get(this.#prevActionName) : undefined);

    action.enabled = true;
    action.setLoop(THREE.LoopOnce, 1);
    // ALWAYS clamp the final frame: the pose must be held from the "finished"
    // event until #recoverFromOneShot's crossfade takes over (or forever, when
    // clamp:true). With clampWhenFinished=false the action disables itself on
    // finish and the rig snaps to bind pose for a frame — the T-pose flash.
    action.clampWhenFinished = true;
    this.#oneShotHoldPose = options.clamp ?? false;
    this.#oneShotInterruptible = options.interruptible ?? false;
    action.timeScale = options.timeScale ?? 1;
    action.reset();
    if (current && current !== action) {
      action.crossFadeFrom(current, options.fadeIn ?? 0.1, false);
    }
    action.play();

    this.#oneShotAction = action;
    this.#oneShotOnDone = options.onDone;
    // Freeze the locomotion transition until the one-shot's 'finished' event
    // reopens it; marking the one-shot as the "current" action makes
    // #applyTransition a no-op meanwhile.
    this.#canPlayNext = false;
    this.#prevActionName = clipName;
    return true;
  }

  /**
   * Cancel a one-shot and hand control back to locomotion NOW. The case that
   * REQUIRES it: a `clamp:true` one-shot (death/knockdown, a held wind-up)
   * holds its final frame and keeps the locomotion lock closed FOREVER by
   * design — so a respawn or an aborted action must explicitly release it, or
   * the rig keeps the clamped pose while the body moves around. Safe to call
   * at any time; a no-op when nothing is held.
   *
   * Call it on TRANSITIONS (respawn, revive, action aborted) — never per
   * frame, or it cancels every in-flight reaction clip.
   *
   * @example
   * // on respawn, before teleporting the body:
   * anims.clearOneShot();
   */
  clearOneShot(): void {
    if (this.#disposed) return;
    const finished = this.#oneShotAction;
    this.#oneShotAction = null;
    this.#oneShotOnDone = undefined;
    this.#oneShotHoldPose = false;
    this.#oneShotInterruptible = false;
    this.#canPlayNext = true;
    // Crossfade the current state's loop in FROM the held pose — same path the
    // "finished" handler uses, so there is no unposed/T-pose frame.
    if (finished) this.#recoverFromOneShot(finished);
  }

  /** Clip name of the currently-playing (or clamped-held) one-shot, or null.
   *  Lets a caller cancel a SPECIFIC one-shot (e.g. a held charge wind-up)
   *  without clobbering whatever replaced it:
   *  `if (anims.currentOneShotName === WINDUP_CLIP) anims.clearOneShot();` */
  get currentOneShotName(): string | null {
    return this.#oneShotAction?.getClip().name ?? null;
  }

  /** Stop all actions, uncache clips, remove the mixer's 'finished' listener. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.mixer.removeEventListener("finished", this.#onFinished);
    this.mixer.stopAllAction();
    for (const action of this.#actions.values()) {
      this.mixer.uncacheClip(action.getClip());
    }
    this.#actions.clear();
    this.#locomotionOneShotAction = null;
  }

  /**
   * Return to locomotion after a one-shot finishes: crossfade the current
   * state's loop in FROM the just-finished (still-posing, clamped) one-shot.
   * Called from the "finished" handler so the blend starts in the same tick —
   * no unposed frame. Falls back to a plain reset()/play() only when the finished
   * action can't be a fade source, and to prevActionName=null when the state has
   * no bound loop (procedural fallback / previous clip keeps the rig posed).
   */
  #recoverFromOneShot(finished: THREE.AnimationAction): void {
    const name = this.#desiredMotionName;
    const loopAction = name !== null ? this.#actions.get(name) : undefined;
    if (!loopAction) {
      this.#prevActionName = null;
      return;
    }
    const effectiveTimeScale = this.#paused ? 0 : this.#timeScale;
    const fade = LOOP_FADE_DURATION * Math.max(effectiveTimeScale, FADE_TIME_SCALE_FLOOR);
    loopAction.enabled = true;
    loopAction.timeScale = 1;
    loopAction.reset();
    if (loopAction !== finished) loopAction.crossFadeFrom(finished, fade, false);
    loopAction.play();
    this.#prevActionName = name;
  }

  /**
   * Crossfade into the clip bound to the current state. Runs every update (guards make it a
   * no-op unless the target clip differs and the one-shot lock is open) — mirrors upstream's
   * effect re-running on both state and canPlayNext changes.
   */
  #applyTransition(): void {
    const nextName = this.#desiredMotionName;
    // Unbound state: keep the previous action playing (upstream's `if (!nextAction) return`);
    // on a fully rig-less model the procedural fallback drives the transform instead.
    if (nextName === null) return;
    const nextAction = this.#actions.get(nextName);
    if (!nextAction) return;

    const effectiveTimeScale = this.#paused ? 0 : this.#timeScale;
    const getFadeDuration = (duration: number): number =>
      duration * Math.max(effectiveTimeScale, FADE_TIME_SCALE_FLOOR);

    const prevActionName = this.#prevActionName;
    // Only crossfade when switching to a NEW clip (JUMP_IDLE→JUMP_FALL share Jump_Loop —
    // comparing clip names, not states, keeps the loop from restarting mid-air).
    if (nextName !== prevActionName && this.#canPlayNext) {
      const prevAction =
        prevActionName !== null ? this.#actions.get(prevActionName) : undefined;

      // One-shot detection is by CLIP NAME, not state, so a shared clip inherits
      // one-shot behavior exactly like upstream's name-keyed actions.
      const profileJumpStart =
        this.#state === "JUMP_START" && nextName === this.#resolveProfileSlot("jump.start");
      const profileJumpLand =
        this.#state === "JUMP_LAND" &&
        nextName === this.#resolveProfileSlot("jump.land") &&
        nextName !== this.#resolveProfileSlot("idle.default");
      if (
        nextName === this.#clipMap.JUMP_START ||
        nextName === this.#clipMap.JUMP_LAND ||
        profileJumpStart ||
        profileJumpLand
      ) {
        this.#canPlayNext = false;
        this.#locomotionOneShotAction = nextAction;
        nextAction.timeScale = ONE_SHOT_TIME_SCALE;
        nextAction.reset();
        if (prevAction) {
          nextAction.crossFadeFrom(prevAction, getFadeDuration(ONE_SHOT_FADE_DURATION), false);
        }
        nextAction.setLoop(THREE.LoopOnce, 1).play();
        nextAction.clampWhenFinished = true;
      } else {
        this.#canPlayNext = true;
        nextAction.timeScale = 1;
        nextAction.reset();
        if (prevAction) {
          nextAction.crossFadeFrom(prevAction, getFadeDuration(LOOP_FADE_DURATION), false);
        }
        nextAction.play();
      }

      this.#prevActionName = nextName;
    }
  }

  /**
   * Release the one-shot lock if the state moved past the one-shot's natural follow-up
   * (runs every update — the non-React equivalent of upstream's effect re-runs).
   */
  #releaseStuckLocks(): void {
    const prevActionName = this.#prevActionName;
    if (prevActionName === null) return;
    // Match BOTH bindings a jump one-shot can have: the fuzzy clipMap names and
    // the profile slots. On profile rigs the clipMap entries are usually null
    // (no clip is literally named "jump_start"), which made this escape hatch
    // dead code — a stuck jump lock could never self-release. The jump.land
    // slot is ignored when it falls back to idle.default (same guard
    // #applyTransition uses), or an idle prevAction would spuriously match.
    const startName = this.#clipMap.JUMP_START ?? this.#resolveProfileSlot("jump.start");
    const profileLand = this.#resolveProfileSlot("jump.land");
    const landName =
      this.#clipMap.JUMP_LAND ??
      (profileLand !== this.#resolveProfileSlot("idle.default") ? profileLand : null);
    // A manual playOneShot() lock is NOT ours to release — even when its clip
    // happens to share a name with the jump binding (clearOneShot owns that).
    if (this.#oneShotAction) return;
    if (
      !this.#canPlayNext &&
      prevActionName === startName &&
      this.#state !== "JUMP_IDLE" &&
      this.#state !== "JUMP_START"
    ) {
      this.#canPlayNext = true;
    }
    if (
      !this.#canPlayNext &&
      prevActionName === landName &&
      this.#state !== "IDLE" &&
      this.#state !== "JUMP_LAND"
    ) {
      this.#canPlayNext = true;
    }
  }

  /** Procedural bob/lean for rig-less models — additive over the captured base transform. */
  #updateProcedural(dt: number): void {
    const state = this.#state;

    if (state === "WALK") this.#procPhase += PROC_WALK_BOB_FREQ * dt;
    else if (state === "RUN") this.#procPhase += PROC_RUN_BOB_FREQ * dt;

    let targetBob = 0;
    if (state === "WALK") targetBob = PROC_WALK_BOB_AMP * Math.abs(Math.sin(this.#procPhase));
    else if (state === "RUN") targetBob = PROC_RUN_BOB_AMP * Math.abs(Math.sin(this.#procPhase));
    else if (state === "JUMP_LAND") targetBob = -PROC_LAND_DIP;

    let targetLean = 0;
    if (state === "WALK") targetLean = PROC_WALK_LEAN;
    else if (state === "RUN") targetLean = PROC_RUN_LEAN;
    else if (state === "JUMP_START" || state === "JUMP_IDLE" || state === "JUMP_FALL") {
      targetLean = PROC_AIR_LEAN;
    }

    // Frame-rate-independent smoothing (same idiom as the controller's gravityDirLerpSpeed).
    const k = 1 - Math.exp(-PROC_SMOOTHING * dt);
    this.#bobOffset += (targetBob - this.#bobOffset) * k;
    this.#leanOffset += (targetLean - this.#leanOffset) * k;

    this.#model.position.y = this.#basePositionY + this.#bobOffset;
    this.#model.rotation.x = this.#baseRotationX + this.#leanOffset;
  }

  #resolveProfileSlot(slot: string): string | null {
    const name = this.#locomotionProfile?.slots[slot];
    return name && this.#clipsByName.has(name) ? name : null;
  }

  #resolveLocomotionClip(
    snapshot: CharacterStateSnapshot,
    state: CharacterAnimationState,
  ): string | null {
    if (!this.#locomotionProfile) return null;
    if (state === "IDLE") return this.#resolveProfileSlot("idle.default");
    if (state === "CROUCH_IDLE") {
      return this.#resolveProfileSlot("crouch.idle") ?? this.#resolveProfileSlot("idle.default");
    }
    const jumpSlot: Partial<Record<CharacterAnimationState, string>> = {
      JUMP_START: "jump.start",
      JUMP_IDLE: "jump.rise",
      JUMP_FALL: "jump.fall",
      JUMP_LAND: "jump.land",
    };
    const airborne = jumpSlot[state];
    if (airborne) return this.#resolveProfileSlot(airborne);
    if (state !== "WALK" && state !== "RUN" && state !== "CROUCH_MOVE") return null;
    if (!isAdvancedSnapshot(snapshot)) return null;

    const band = state === "RUN" ? "run" : state === "CROUCH_MOVE" ? "crouch" : "walk";
    const direction = snapshot.lockForward ? this.#resolveDirection(snapshot) : "forward";
    this.#lastDirection = direction;
    this.#lastSpeedBand = band;
    const candidates = directionFallbacks(band, direction);
    for (const slot of candidates) {
      const clip = this.#resolveProfileSlot(slot);
      if (clip) return clip;
    }
    return null;
  }

  #resolveDirection(snapshot: AdvancedCharacterStateSnapshot): LocomotionDirection {
    const x = snapshot.inputDir.dot(snapshot.bodyXAxis);
    const z = snapshot.inputDir.dot(snapshot.bodyZAxis);
    if (x * x + z * z < 1e-6) return this.#lastDirection;
    const angle = Math.atan2(x, z);
    const directions: readonly LocomotionDirection[] = [
      "forward",
      "forward-right",
      "right",
      "backward-right",
      "backward",
      "backward-left",
      "left",
      "forward-left",
    ];
    const candidate = directions[(Math.round(angle / (Math.PI / 4)) + 8) % 8]!;
    const previousAngle = directions.indexOf(this.#lastDirection) * (Math.PI / 4);
    const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;
    const delta = Math.abs(Math.atan2(Math.sin(normalizedAngle - previousAngle), Math.cos(normalizedAngle - previousAngle)));
    const threshold = THREE.MathUtils.degToRad(
      22.5 + (this.#locomotionProfile?.directionHysteresisDegrees ?? 7.5),
    );
    return delta <= threshold ? this.#lastDirection : candidate;
  }

  #updateLocomotionRate(
    snapshot: CharacterStateSnapshot,
    state: CharacterAnimationState,
  ): void {
    // Gate on a numeric moveSpeed rather than the full advanced snapshot:
    // remote players and bots drive with simple boolean snapshots plus an
    // estimated speed (position deltas / their own velocity), and without this
    // they play locomotion at a flat 1.0 while the local player's clips
    // speed-match — visibly different gaits for the same movement.
    const speed = (snapshot as Partial<AdvancedCharacterStateSnapshot>).moveSpeed;
    if (!this.#locomotionProfile || typeof speed !== "number" || this.oneShotActive) return;
    const band = state === "RUN" ? "run" : state === "CROUCH_MOVE" ? "crouch" : state === "WALK" ? "walk" : null;
    if (!band || !this.#prevActionName) return;
    const nominal = this.#locomotionProfile.nominalSpeed?.[band];
    if (!nominal || nominal <= 0) return;
    const limits = this.#locomotionProfile.playbackRate ?? { min: 0.75, max: 1.35 };
    const rate = THREE.MathUtils.clamp(speed / nominal, limits.min, limits.max);
    this.#actions.get(this.#prevActionName)?.setEffectiveTimeScale(rate);
  }
}

function isAdvancedSnapshot(
  snapshot: CharacterStateSnapshot,
): snapshot is AdvancedCharacterStateSnapshot {
  const value = snapshot as Partial<AdvancedCharacterStateSnapshot>;
  return (
    typeof value.moveSpeed === "number" &&
    typeof value.lockForward === "boolean" &&
    value.inputDir instanceof THREE.Vector3 &&
    value.relativeVelOnPlane instanceof THREE.Vector3 &&
    value.bodyXAxis instanceof THREE.Vector3 &&
    value.bodyZAxis instanceof THREE.Vector3
  );
}

function directionFallbacks(
  band: "walk" | "run" | "crouch",
  direction: LocomotionDirection,
): string[] {
  const exact = `${band}.${direction}`;
  const cardinal = direction.includes("backward")
    ? `${band}.backward`
    : direction.includes("right")
      ? `${band}.right`
      : direction.includes("left")
        ? `${band}.left`
        : `${band}.forward`;
  const ownForward = `${band}.forward`;
  const walkEquivalent = `walk.${direction}`;
  return [...new Set([exact, cardinal, ownForward, walkEquivalent, "walk.forward"])];
}
