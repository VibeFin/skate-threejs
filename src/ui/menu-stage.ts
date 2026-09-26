// THE TITLE SCREEN'S 3D STAGE — the player's own body, standing in the shop.
//
// The player asked for it in as many words: "I want us to render our character.
// We can have him standing in a pose, with some photo in the background — maybe
// something like an old-school skate shop — and the character should be in 3D,
// and we CHOOSE the character."
//
// So this is a real rig under real lights, turning slowly, over whatever picture
// the menu has behind it — NOT a render captured to a PNG. The menu owns the
// backdrop and the type; this file owns the body, the lights and the canvas it
// draws on, and nothing else on the title screen knows three.js exists.
//
// ---------------------------------------------------------------------------
// WHAT IT COSTS, and why every line of it is the cheap version
// ---------------------------------------------------------------------------
// The last mobile preflight measured ~870 MB of estimated phone GPU memory
// against a <700 MB budget — the game is already over. A title screen that
// stands up a second scene and TWO 10k-face bodies with their texture sets
// before the game has started is exactly the wrong direction, so:
//
//   · ONE body is resident at a time. Picking the other one frees the first in
//     the same tick the new one is added — three uploads a texture on its first
//     DRAW, not at parse, so the two never share a frame on the GPU. The
//     outgoing body stays on screen while the new one downloads (it is already
//     resident; keeping it costs nothing) rather than leaving the stage empty
//     for the length of a 23 MB fetch.
//   · Only the IDLE clip is fetched — one GLB, not the seven-clip controller
//     pack the game's own loader pulls. The menu never walks, runs, jumps or
//     crouches. That stayed true when the idle was RE-GENERATED: a body whose
//     roster entry names a fresh take fetches that take (62 kB) INSTEAD of the
//     manifest's own slot (137 kB), never as well as. See `StageBody.idleUrl`.
//   · The rig's single 4096² texture is DOWNSCALED to 1024² before it is ever
//     uploaded (`MAX_TEXTURE`). That is the whole cost of a body: 67 MB of VRAM
//     becomes 4.2 MB, and at the size a menu portrait is actually drawn nobody
//     can tell. It is skipped when the model was handed to us already loaded —
//     that texture belongs to the skater the game is about to ride, and
//     shrinking it under him would be this file reaching into the ride.
//   · No shadow map, no environment map, no post chain, no ground plane. The
//     figure is separated from the backdrop by a rim light and by the DOM's own
//     glow pool behind it (`menu.ts`, `.stage-pool`), which costs nothing.
//   · The loop runs at STAGE_FPS, not at the display's rate. He is turning at
//     eight degrees a second; thirty frames is more than that motion can use,
//     and the game's own renderer is still drawing the paused world behind this
//     screen every frame of its own.
//   · It is TORN DOWN on DROP IN — context and all — so nothing here is
//     resident while the game is being played.
//
// MEASURED, not estimated — every texture upload the page makes was tallied in
// a real Chrome at 1280x800 and read as a delta across one body swap:
//
//   one body on the stage        2 uploads, 4.0 MB  (one 1024², one tiny)
//   …with three's mip chain      ~5.3 MB
//   …plus its geometry           ~0.65 MB (9,431 verts, 10,364 tris)
//   the same body undownscaled   ~89 MB   (4096² + mips) — 15x this
//   the whole page, everything   1,212 MB across 129 uploads
//
// So the character on the title screen is about half a percent of what this
// game already puts on a GPU, and the one line that makes that true is
// `shrinkTextures`. The canvas itself is the second-largest item: ~24 MB of
// attachments at DPR 1.5 with the desktop tier's 4x MSAA, and it is handed
// back on DROP IN.
//
// Time, same run: the FIRST body lands in ~0.7 s because it is the same URL the
// boot has already pulled for the player's rig and the browser answers from
// cache; the second costs 4.6 s from keypress to standing (2.2 s of that is 23
// MB over the wire). Nothing here is on the boot's critical path — the menu is
// built after the loader has gone, and the outgoing body stays on screen for
// the whole of the download.
//
// PHONES DO NOT GET THIS. `affordable()` gates it off on both phone tiers, and
// `menu.ts` falls back to the key-art still there. Two reasons, and the second
// is the one that decides it: the game is already over its phone memory budget,
// and a SECOND WebGL context on iOS is a live risk to the FIRST one — Safari
// drops the oldest context under pressure, and the oldest context is the game.
//
// ---------------------------------------------------------------------------
// WHY THIS DOES NOT REUSE THE GAME'S RENDERER
// ---------------------------------------------------------------------------
// Because it cannot reach the frame. `main.ts` owns the only animation loop and
// draws the world through the look stack's composer to the same default
// framebuffer every frame, title screen included. A second `render()` into that
// canvas from a loop of our own would be overwritten by whichever ran last, and
// the scissor/viewport dance that would let both share the buffer leaves state
// behind that the composer does not reset. What CAN be shared, and is worth far
// more than the context, is the BODY: hand `MenuStage` a `StageBody` carrying
// the already-loaded `object3D` and it clones that instead of fetching and
// parsing a second copy — see `StageBody.object3D`.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { detectTier, type QualityTier } from "../controllers/quality/tier";
import type { MeshyCharacterManifest } from "../controllers/character/meshy/meshy-loader";

/**
 * One body the player can pick. A LIST, deliberately: a third character is one
 * more entry in the array the caller hands over and nothing here changes — and
 * a roster that SHRINKS is the same fact from the other end, which is what
 * happened when The Local became an NPC and stopped being a body you ride.
 */
export interface StageBody {
  /** Stable id — what a caller wiring the choice into the game acts on. */
  id: string;
  /** What the picker prints under the figure. */
  name: string;
  /** The `genex controller character` manifest — his rig and his clip list. */
  manifestUrl: string;
  /**
   * His bare model GLB, when it is known without opening the manifest.
   *
   * Carried purely so whoever wires the CHOICE into the game has the one URL it
   * needs in hand — the boot loads the player's body from a bare GLB URL today
   * (`SKATER_URL`), not from a manifest, and making it re-fetch and re-parse
   * the manifest to find out what the player picked would be this list keeping
   * a secret it already knows. Nothing in this file reads it.
   */
  modelUrl?: string;
  /**
   * A FRESHLY GENERATED idle, as a bare motion GLB, played INSTEAD of the
   * manifest's `idle.default`.
   *
   * Why it is a URL and not a manifest slot: `idle.default` is one of six
   * controller-pack slots the platform PINS, and it refuses to let generation
   * replace them. So a re-generated idle cannot arrive through the manifest at
   * all — it arrives beside it, and this field is the beside. `world/npc.ts`
   * carries the same pattern for the same reason (`NPC_TALK_CLIP_URL`).
   *
   * It REPLACES the manifest idle rather than joining it: absent, the slot is
   * read exactly as before; present, the slot is not fetched at all. The stage
   * downloads one clip per body and that promise is not spent twice — the only
   * time both are fetched is the failure path below, where the take turns out
   * not to bind to this rig and the pinned slot is what he falls back to.
   */
  idleUrl?: string;
  /**
   * An ALREADY-LOADED copy of this rig, if the game happens to be holding one.
   *
   * The player's body is loaded by the boot before the title screen is built,
   * and it is the same GLB this manifest names — so handing it over here means
   * the menu clones a skeleton (a few dozen matrices) instead of downloading,
   * parsing and uploading 23 MB of it a second time. The clone shares geometry
   * and materials, so nothing here may dispose them; `owned` below is what
   * keeps that straight.
   *
   * WHAT THIS FILE PROMISES ABOUT IT, so a caller need not normalise anything
   * before handing it over: it is CLONED, never adopted, so the game keeps
   * riding the original and may go on posing and moving it; its placement,
   * facing and pose on the stage are the stage's alone (`unwrap`, `BODY_YAW`,
   * the idle clip); and nothing here writes to it, resizes its textures or
   * re-lights it, because those materials belong to the skater the game is
   * about to ride.
   *
   * WHAT IT ASKS BACK, and it is one thing: this must be the rig that is LIVE
   * when the title screen is standing, not the one that was live when the
   * roster array was built. The stage clones on arrival at the menu and it
   * arrives more than once — DROP IN tears the stage down and the pause card's
   * MAIN MENU builds it again — so a roster that captured a rig at boot will,
   * after the player has swapped bodies, clone a skeleton nobody is riding any
   * more. A getter, or a roster rebuilt at the moment the menu is opened, is
   * what keeps the two the same body.
   */
  object3D?: THREE.Object3D;
}

/** The stage's own report on itself, for the screen that owns the caption. */
export type StageState = "idle" | "loading" | "ready" | "failed";

/**
 * The clip the figure breathes to, and WHERE IT CAME FROM — which decides how
 * it is looped, and that is not a detail.
 *
 * The manifest's `Idle_3` is an authored loop: measured over its 24 rotation
 * tracks, the last keyframe matches the first to **0.0° on every one of them**,
 * so it repeats forever with nothing to see at the seam.
 *
 * A generated take is not that. Both new idles were measured the same way and
 * neither closes: the Timekeeper's ends 11.6° away from where it started at the
 * right hand (6 of 23 tracks over 3°), and the Local's ends **18.6° out at the
 * right thigh**, with 15 of 23 tracks over 3°. Repeated, that is a leg snapping
 * a fifth of a right angle every 3.97 s, in the middle of the title screen.
 *
 * So a fresh take is played PING-PONG — forward, then backward — which is exact
 * at both ends by construction rather than blended toward being exact. It is
 * also the reading that invents nothing: every frame drawn is a frame the
 * generator made, where a crossfade-over-the-seam would author 0.3 s of pose
 * that is in neither clip. What it costs is a turnaround, and the turnaround is
 * cheap here because both takes are nearly still at their ends — peak joint
 * speed is 22°/s (Timekeeper) and 47°/s (Local) at the head of the clip and
 * 8°/s and 15°/s at the tail, i.e. a slow drift reversing, not a gesture
 * rewinding. The cycle reads as 7.9 s of weight shift instead of 4 s.
 *
 * The honest fix is still the CLIP — a take generated to close on itself would
 * play straight through on `LoopRepeat`. If one ever lands, this flag is where
 * that decision is made and it is one line.
 */
interface StageIdle {
  clip: THREE.AnimationClip | null;
  /** True when it came from `StageBody.idleUrl` rather than the manifest slot. */
  fresh: boolean;
}

/** Longest edge a menu portrait's texture is allowed to occupy on the GPU. */
const MAX_TEXTURE = 1024;
/**
 * Fluorescent shop-tube exposure — the whole canvas, one number.
 *
 * 1.12 was copied from the boot so the menu portrait and the skater you ride
 * would be graded alike. That was right against a PHOTOGRAPH of a sunlit shop.
 * The backdrop is now a PS1-style render of a dim room lit by two ceiling
 * strips, and against it 1.12 put the body a full stop above everything behind
 * him — which is what "cut out and pasted on" is, before any light is blamed.
 */
const STAGE_EXPOSURE = 0.95;
/**
 * How much of the rig's own self-illumination the menu keeps.
 *
 * Was 0.3, which the world's own grade earns back on top of it. Nothing on this
 * canvas earns anything back, and emissive is the one term in the shading that
 * does NOT respond to the room: it is albedo added flat, so it is exactly the
 * light that cannot come from the shop. Turned down to 0.12 it is a whisper of
 * the rig's own colour holding the shadow side off black, and the difference
 * between the two numbers is handed to the three lights below — which is what
 * puts the fluorescent back on his shoulders instead of on all of him at once.
 */
const EMISSIVE = 0.12;
/** Frames a second. He turns at eight degrees a second — see the header. */
const STAGE_FPS = 30;
/**
 * Yaw the body is placed at, radians. NEGATIVE turns him toward screen-LEFT.
 *
 * Meshy rigs rest facing +Z (AGENTS.md rule 10) and the camera sits on +Z
 * looking back at the origin, so a yaw of ZERO is already face-on and a
 * POSITIVE yaw swings his chest toward screen-RIGHT. Positive is what he had,
 * and it was wrong in the plainest way: he stood on the right of the shop
 * turned out of the picture, away from the menu he is standing beside. The
 * player said exactly that — "mirror them, I mean they are looking right
 * there" — so the fix is the SIGN of this one number.
 *
 * It is the sign and NOTHING else: a mirrored SkinnedMesh (negative scale) is
 * forbidden outright by rule 10, and for a real reason — the skin weights are
 * solved in the bind pose and a handedness flip turns the shoulders inside out.
 *
 * The magnitude is unchanged, still the three-quarter turn that makes a
 * shoulder line read as a body standing in a room rather than a passport photo.
 * `STAGE_BODY_X` quietly adds about 4° more to it, because the camera now sits
 * off to his screen-right and he is seen a touch off-axis — which pushes the
 * same way and costs nothing.
 */
const BODY_YAW = -0.34;
/**
 * How far the idle sway carries him either side of `BODY_YAW`, radians.
 *
 * Symmetrical about the yaw, so mirroring the yaw mirrors the sway with it and
 * the range needed no second thought: −0.34 ± 0.16 is −10° to −29°, which is a
 * body easing between "nearly facing you" and "a firm three-quarter". Neither
 * end squares him up to the camera and neither end turns him past profile, so
 * he is looking into the menu for the whole cycle.
 */
const SWAY = 0.16;
/** Seconds for one full sway cycle. */
const SWAY_PERIOD = 15;
/**
 * Fraction of the canvas height the figure fills — and it is over 1 on purpose.
 *
 * At 0.82 he stood entirely inside the frame with about a ninth of his own
 * height of empty air above his head and the same again under his boots, which
 * is precisely the composition the player named: *"he looks like he's
 * floating"*. Air under a standing figure is what floating IS in a still
 * picture — there is no floor in this canvas, only a photograph behind it, so
 * the only thing that says his weight is on something is where the bottom of
 * the frame cuts him. A figure whose feet leave the picture is standing in the
 * room the picture is of; a figure with a margin under him is a sticker on it.
 *
 * 1.02 makes him 24% taller on screen than he was (0.82 → 1.02 of a canvas that
 * also grew, so about 67% of the window becomes 88% of it) and takes his boots
 * off the bottom edge. He is not centred in that overflow — see `HEADROOM`; all
 * of the crop is at the feet and none of it is off his head.
 *
 * The player's own permission for the crop, so it is not mistaken for a bug:
 * *"It would be fine if he were slightly cropped so it looks natural."*
 */
const FILL = 1.02;
/**
 * Air left above the crown, as a fraction of his own height.
 *
 * This is the number that decides WHERE the overflow goes. Framing him on his
 * mid-point would split the 2% overflow between his hair and his soles and
 * neither read would be deliberate; anchoring the top of the frame a twentieth
 * of his height above the crown puts every millimetre of it at the bottom.
 *
 * The arithmetic, once: the frame is `height / FILL` = 0.980 h tall, its top is
 * at crown + 0.050 h, so its bottom lands at crown + 0.050 h − 0.980 h, which
 * is 0.070 h ABOVE his soles. On a 1.70 m rig that is 12 cm — his shoes and the
 * turn of his ankle, and nothing above them.
 */
const HEADROOM = 0.05;
/**
 * Where the figure stands ACROSS the stage column — 0 is its left edge, 1 its
 * right, and 0.5 is the dead centre he used to be pinned to.
 *
 * Read off the backdrop rather than guessed at. The shop has a long glass
 * counter running from the bottom-left corner up to about half way across the
 * picture, its far end standing at roughly 52% of the screen; then open floor;
 * then the raised step into the daylit doorway from about 82% on. Centred in
 * the column he stood at 73% of the screen — hard up against that step, hugging
 * the right edge of the frame with his back to everything. At 0.36 he stands at
 * 65%: the middle of the open floor, his nearest boot a clear hand's width off
 * the counter's end, and a third of the screen between him and the menu's red
 * wash, which has faded out entirely by 48%.
 *
 * Exported because two DOM layers have to agree with it — the floor pool he is
 * grounded on and the caption under his feet, both in `menu.ts`. One number,
 * three consumers: move it and the shadow and the nameplate follow him.
 */
export const STAGE_BODY_X = 0.36;
/** Metres the incoming body slides in from when the player swaps. */
const SLIDE = 0.85;
/** Seconds that slide takes. */
const SLIDE_TIME = 0.34;

export interface MenuStageOptions {
  /** The element the canvas is appended to — the stage fills it. */
  host: HTMLElement;
  /**
   * Every body on offer, in picker order.
   *
   * Any length. One body is a portrait with nothing to pick between and no
   * arrows to pick it with (`menu.ts` renders the picker to match); an empty
   * list stands nobody up at all rather than throwing on the way. Neither is a
   * special case anywhere below — the list's own length is the only fact this
   * file reads about it.
   */
  bodies: readonly StageBody[];
  /** Which one starts on the stage. */
  index?: number;
  /** The boot's device tier, when the caller has one; detected otherwise. */
  tier?: QualityTier;
  /** The boot's decoder-wired loader, so the rig takes the same rungs the rest
   *  of the game's models do. A plain loader is built if none is passed. */
  loader?: GLTFLoader;
  /** Called whenever the body on the stage changes, and once at construction. */
  onChange?: (body: StageBody, index: number) => void;
  /** Called as the stage loads / lands / gives up, so the caption can say so. */
  onState?: (state: StageState) => void;
}

/**
 * Can this device afford a second WebGL context and a rig on the title screen?
 *
 * Phones cannot — see the header. This is the one place that decides it, and it
 * is a function rather than a constant so a caller can ask before building.
 */
export function stageAffordable(tier?: QualityTier): boolean {
  const t = tier ?? detectTier();
  return t.name !== "phone" && t.name !== "phone-low";
}

export class MenuStage {
  private host: HTMLElement;
  private bodies: readonly StageBody[];
  private idx: number;
  private tier: QualityTier;
  private loader: GLTFLoader;
  private onChange?: (body: StageBody, index: number) => void;
  private onState?: (state: StageState) => void;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private pivot: THREE.Group;

  private body: THREE.Object3D | null = null;
  /** Did we load this body ourselves? A clone of a live rig frees nothing. */
  private bodyOwned = false;
  /**
   * What the body on the stage MEASURES, in world metres — the one fact the
   * camera is aimed from, taken once when he lands (`measureBody`).
   */
  private bodyBox: THREE.Box3 | null = null;
  private mixer: THREE.AnimationMixer | null = null;

  /** Ticket for the in-flight load, so a fast double-tap on the arrows cannot
   *  land an older body on top of a newer one. */
  private job = 0;
  private raf = 0;
  private running = false;
  private dead = false;
  private last = 0;
  private age = 0;
  /** Seconds left of the incoming body's slide, 0 when he is standing still. */
  private slide = 0;
  private slideFrom = 0;
  private observer: ResizeObserver | null = null;
  /** The host has no size — a window narrowed past the layout's stage
   *  breakpoint. Nothing is drawn into a box nobody can see. */
  private collapsed = false;

  constructor(opts: MenuStageOptions) {
    this.host = opts.host;
    this.bodies = opts.bodies;
    this.idx = Math.max(0, Math.min(opts.bodies.length - 1, opts.index ?? 0));
    this.tier = opts.tier ?? detectTier();
    this.loader = opts.loader ?? new GLTFLoader();
    this.onChange = opts.onChange;
    this.onState = opts.onState;

    // `alpha: true` is the whole reason the backdrop is a DOM layer and not a
    // textured plane in here: the menu's own picture shows straight through the
    // canvas, so the stage never pays for the backdrop at all.
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: this.tier.antialias,
      powerPreference: "high-performance",
    });
    this.renderer.setClearAlpha(0);
    // The same tone curve and the same output space as the game — a menu
    // portrait mapped differently from the skater you are about to ride comes
    // out a different character. The EXPOSURE is deliberately no longer the
    // boot's: see STAGE_EXPOSURE. The curve is what keeps him the same person;
    // the stop is what puts him in this room rather than in the world's.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = STAGE_EXPOSURE;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    // The figure is decoration on a screen whose controls are elsewhere — a
    // click that lands on it must reach the picker's arrows underneath.
    canvas.style.pointerEvents = "none";
    this.host.appendChild(canvas);

    this.scene = new THREE.Scene();
    // A long lens: 28° flatters a standing figure the way a portrait lens does,
    // where the 62° the gameplay camera runs at would bow him outward.
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    buildLights(this.scene);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.resize();

    // Nothing to stand up, nothing to announce. A caller with an empty roster
    // gets a live, blank stage instead of a constructor that throws — and
    // `menu.ts` does not even build one, so this is the belt to that brace.
    if (this.bodies.length > 0) {
      void this.load(this.idx, 0);
      this.onChange?.(this.bodies[this.idx], this.idx);
    }
  }

  /** Which body is on the stage — what a caller wires the choice from. */
  get current(): StageBody {
    return this.bodies[this.idx];
  }

  get index(): number {
    return this.idx;
  }

  /**
   * Put a different body on the stage. `dir` is which way the player asked for
   * it, so the incoming figure walks in from the side the key points at:
   * RIGHT brings the next one in from screen-right, which is the direction
   * convention every other input in this game keeps (AGENTS.md rule 17).
   */
  select(index: number, dir = 0): void {
    // Guarded before the modulo, not after: `% 0` is NaN, and a NaN index reads
    // `bodies[NaN]` as undefined and loses the body that was standing there.
    if (this.dead || this.bodies.length === 0) return;
    const next = ((index % this.bodies.length) + this.bodies.length) % this.bodies.length;
    if (next === this.idx && this.body) return;
    this.idx = next;
    this.onChange?.(this.bodies[next], next);
    void this.load(next, dir);
  }

  next(): void {
    this.select(this.idx + 1, 1);
  }

  prev(): void {
    this.select(this.idx - 1, -1);
  }

  /** The stage draws only while the title screen is the screen being looked at. */
  setRunning(on: boolean): void {
    if (this.dead || on === this.running) return;
    this.running = on;
    if (!on) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      return;
    }
    this.last = performance.now();
    this.tick();
  }

  /**
   * Everything, gone: the body, the context, the canvas.
   *
   * Called the moment DROP IN is pressed. A title screen that leaves a rig and a
   * second GL context resident behind the game is the exact shape of the mobile
   * memory problem this file is written around.
   */
  dispose(): void {
    if (this.dead) return;
    this.dead = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.observer = null;
    this.dropBody();
    this.scene.clear();
    this.renderer.dispose();
    // Hands the context back to the browser rather than waiting for the GC to
    // notice — on iOS the count of live contexts is the thing that bites.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------------------

  private resize(): void {
    const w = Math.max(1, Math.round(this.host.clientWidth));
    const h = Math.max(1, Math.round(this.host.clientHeight));
    // The layout hides the stage under 720 px of viewport (menu.ts), and a
    // renderer drawing thirty frames a second into a 1x1 canvas behind a
    // `display: none` is pure waste on exactly the machines that can least
    // afford it.
    this.collapsed = w < 8 || h < 8;
    if (this.collapsed) return;
    // Capped at the tier's DPR and again at 1.5, which is the second-largest
    // number on this screen after the texture. The canvas is about half the
    // window; at DPR 2 with the desktop tier's 4x MSAA its attachments come to
    // roughly 30 MB, against 17 MB at 1.5 — and 1.5 WITH multisampling is a
    // cleaner silhouette than 2 without, which is the only edge a standing
    // figure over a photograph has to get right.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.tier.dprCap, 1.5));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.frame();
  }

  /**
   * Fetch a body and stand it up.
   *
   * The OUTGOING body is left on screen for the whole of the download — it is
   * already resident, so keeping it costs nothing, and an empty stage for the
   * length of a 23 MB fetch reads as a broken screen. It is freed in the same
   * tick the new one is added, before either has been drawn: three uploads a
   * texture on first draw, so the two never share the GPU.
   */
  private async load(index: number, dir: number): Promise<void> {
    const ticket = ++this.job;
    const entry = this.bodies[index];
    if (!entry) return;
    this.onState?.("loading");
    try {
      const built = entry.object3D
        ? {
            root: cloneSkinned(entry.object3D),
            owned: false,
            idle: await this.idleFor(entry, entry.object3D),
          }
        : await this.loadOwn(entry);
      if (this.dead || ticket !== this.job) {
        if (built.owned) disposeTree(built.root);
        return;
      }
      this.dropBody();
      this.stand(built.root, built.owned, built.idle, dir);
      this.onState?.("ready");
    } catch (e) {
      console.warn("[menu-stage] body failed to load", e);
      if (ticket === this.job) this.onState?.("failed");
    }
  }

  /**
   * The lean load: the manifest, the model, and the ONE clip the menu plays.
   *
   * `loadMeshyCharacter` is the game's route into these manifests and it is the
   * right one for the game — it downloads every clip in the pack so the
   * controller has a walk, a run, a jump and a crouch to blend. A title screen
   * has a man standing still. Seven GLBs for six animations nobody will see is
   * six fetches and six clip's worth of sampler data on a screen whose whole
   * job is to not be expensive, so this reads the same manifest shape and takes
   * the idle out of it.
   *
   * The rung ladder is deliberately NOT walked here: these two characters have
   * no `@1024`/`@2048` siblings on the CDN (both 404), the boot loads the
   * player's rig raw for the same reason, and a 404 per body per session is a
   * request bought for nothing. The downscale below is what a rung would have
   * bought anyway, and it does not depend on the backfill ever happening.
   */
  private async loadOwn(entry: StageBody): Promise<{
    root: THREE.Object3D;
    owned: boolean;
    idle: StageIdle;
  }> {
    const manifest = await readManifest(entry.manifestUrl);
    const slot = idleEntry(manifest);
    const fresh = entry.idleUrl || null;
    // ONE clip, chosen before anything is fetched: the roster's own take when it
    // names one, the manifest's pinned slot when it does not. Never both — see
    // `StageBody.idleUrl`.
    const [base, clips] = await Promise.all([
      this.loader.loadAsync(manifest.model.url),
      this.clipsAt(fresh ?? slot?.url ?? null),
    ]);
    shrinkTextures(base.scene, MAX_TEXTURE);
    tameEmissive(base.scene, EMISSIVE);
    let idle: StageIdle = { clip: fittingClip(clips, base.scene), fresh: fresh !== null };
    // The take does not belong to this skeleton. Half a binding is not half an
    // animation, it is a twitch — so fall back to the slot that has always
    // worked, and pay the second fetch only here, where it buys a standing man
    // instead of a T-pose.
    if (!idle.clip && fresh) {
      console.warn("[menu-stage] the fresh idle does not fit this rig — falling back to the manifest slot");
      idle = { clip: slot ? fittingClip(await this.clipsAt(slot.url), base.scene) : null, fresh: false };
    }
    // Last resort: whatever the model GLB brought with it. Same line this
    // always ended on.
    if (!idle.clip) idle = { clip: base.animations[0] ?? null, fresh: false };
    return { root: base.scene, owned: true, idle };
  }

  /** The idle clip on its own, for a body the game already had in memory. */
  private async idleFor(entry: StageBody, root: THREE.Object3D): Promise<StageIdle> {
    if (entry.idleUrl) {
      const clip = fittingClip(await this.clipsAt(entry.idleUrl), root);
      if (clip) return { clip, fresh: true };
      console.warn("[menu-stage] the fresh idle does not fit this rig — falling back to the manifest slot");
    }
    try {
      const manifest = await readManifest(entry.manifestUrl);
      const slot = idleEntry(manifest);
      if (!slot) return { clip: null, fresh: false };
      return { clip: fittingClip(await this.clipsAt(slot.url), root), fresh: false };
    } catch (e) {
      console.warn("[menu-stage] idle clip failed to load — he stands still", e);
      return { clip: null, fresh: false };
    }
  }

  /**
   * The clips inside one GLB, or none.
   *
   * A clip that will not download must not take the BODY down with it: a figure
   * standing still on the title screen is a pose, an empty stage is a bug, and
   * the difference used to be one unhandled rejection — the fetch sat inside the
   * same `Promise.all` as the model, so a 404 on a 60 kB motion file failed the
   * whole load and left the shop empty.
   */
  private async clipsAt(url: string | null): Promise<readonly THREE.AnimationClip[]> {
    if (!url) return [];
    try {
      const gltf = await this.loader.loadAsync(url);
      return gltf.animations ?? [];
    } catch (e) {
      console.warn("[menu-stage] a clip failed to load", url, e);
      return [];
    }
  }

  private stand(
    root: THREE.Object3D,
    owned: boolean,
    idle: StageIdle,
    dir: number,
  ): void {
    // A clone arrives wearing whatever transform the rig had applied to it —
    // the skater is turned sideways on his deck. The stage places its own.
    unwrap(root);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        // A menu portrait is looked at from one angle and the rig's own bounds
        // are computed from the bind pose; a wide idle sway can push a wrist
        // outside it and cull the whole body on the frame it does.
        mesh.frustumCulled = false;
      }
    });
    this.pivot.add(root);
    this.body = root;
    this.bodyOwned = owned;

    // THE CLIP GOES ON BEFORE THE TAPE MEASURE COMES OUT, and the order is the
    // fix to the second half of the sneakers bug.
    //
    // A body this file LOADED arrives in its bind pose — a man standing up
    // straight, 1.70 m — so measuring it before the idle played was measuring
    // very nearly what the idle would then show. A body handed over by the game
    // arrives in the pose the RIDE left it in: knees bent over a deck, and
    // measured at 1.517 m on the live rig. Framed on 1.517 he is 12% too big
    // for his own frame, and the idle then stands him up straight INTO the top
    // edge — the crown leaves the picture, which is the one place `HEADROOM`
    // says a crop may never be. Writing frame 0 first makes both paths measure
    // the body that is actually going to be drawn.
    if (idle.clip) {
      this.mixer = new THREE.AnimationMixer(root);
      const action = this.mixer.clipAction(idle.clip);
      // Ping-pong for a generated take, straight repeat for the manifest's
      // authored loop — the measurements behind that are on `StageIdle`.
      action.setLoop(idle.fresh ? THREE.LoopPingPong : THREE.LoopRepeat, Infinity);
      action.play();
      this.mixer.update(0);
    }

    // Measured ONCE, here, and kept: the sway moves his arms and his crown by a
    // centimetre or two, and re-measuring on every resize would let the framing
    // breathe with it. `resize` re-aims off this same box.
    this.bodyBox = measureBody(root);
    this.frame();

    this.slide = dir === 0 ? 0 : SLIDE_TIME;
    this.slideFrom = dir * SLIDE;
    this.pivot.position.x = this.slideFrom;
    // A stage that is not running still owes one frame — the screen behind this
    // one can be up while a body lands, and a blank canvas that fills in only
    // when the player comes back reads as a bug.
    this.draw(0);
  }

  /**
   * Point the camera at whatever height this rig actually is.
   *
   * Measured off the body's own bounds (`measureBody`, cached in `bodyBox`)
   * rather than trusted from the manifest's `heightMeters`: the bodies are all
   * nominally 1.70 m and a rig that comes back a head taller would otherwise be
   * framed at the chin.
   *
   * Standing him off-centre is done by moving the CAMERA sideways rather than
   * the body, for two reasons. `pivot.position.x` is the entrance slide's own
   * channel and it eases back to zero every time a body lands, so a resting
   * offset parked there would be wiped by the next swap. And the offset is
   * derived here, where the visible width is already known — expressed as a
   * fraction of the frame rather than in metres, it holds at any window shape
   * instead of drifting across the shop as the aspect changes.
   *
   * The VERTICAL anchor is the crown and not the mid-point, as of the round
   * that made him bigger than his own frame (`FILL`, `HEADROOM`). Framing on
   * the middle would have split the overflow between his hair and his soles;
   * hanging the frame off the top of his head puts all of it under him, which
   * is the only place a crop is allowed to be on a standing figure.
   */
  private frame(): void {
    const box = this.bodyBox;
    if (!box) return;
    const height = Math.max(0.5, box.max.y - box.min.y);
    const visible = height / FILL;
    const dist = visible / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
    // The middle of the PICTURE, in world metres — the crown with its headroom
    // above it is the frame's top edge, so half a frame down from there is its
    // centre. With FILL over 1 this sits above the middle of the body, which is
    // the same fact as the crop being at his feet.
    const centre = box.max.y + height * HEADROOM - visible / 2;
    // The camera slides screen-RIGHT to put him screen-LEFT. `lookAt` keeps the
    // same x, so the view direction stays square down -Z and the result is a
    // lateral shift and not a keystone — the figure is simply further out in
    // the frustum, seen about 4° off his own axis at this distance.
    const shift = (0.5 - STAGE_BODY_X) * visible * this.camera.aspect;
    // The lens sits a little ABOVE the centre of the picture and looks very
    // slightly down into it. Held at the old 0.08 of his height this would now
    // read as looking down ON him, because the centre of the picture climbed to
    // his chest when the crop moved to his feet — so it comes back to 0.04, and
    // the down-angle stays the few degrees that stop a portrait reading as a
    // shop-window mannequin photographed square on.
    this.camera.position.set(shift, centre + height * 0.04, dist);
    this.camera.lookAt(shift, centre, 0);
  }

  private tick = (): void => {
    if (!this.running || this.dead) return;
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    if (dt < 1 / STAGE_FPS) return;
    this.last = now;
    this.draw(Math.min(dt, 0.1));
  };

  private draw(dt: number): void {
    if (this.collapsed) return;
    this.age += dt;
    this.mixer?.update(dt);
    // The slow turn. A body standing perfectly still under a still camera reads
    // as a photograph — which is the one thing the player said this must not be.
    this.pivot.rotation.y = BODY_YAW + Math.sin((this.age / SWAY_PERIOD) * Math.PI * 2) * SWAY;
    if (this.slide > 0) {
      this.slide = Math.max(0, this.slide - dt);
      const t = 1 - this.slide / SLIDE_TIME;
      // Ease-out: he arrives quickly and settles, rather than coasting in.
      this.pivot.position.x = this.slideFrom * (1 - t) ** 3;
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Take the body off the stage, and free it if it was ours to free. */
  private dropBody(): void {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.bodyBox = null;
    if (!this.body) return;
    this.pivot.remove(this.body);
    if (this.bodyOwned) disposeTree(this.body);
    this.body = null;
  }
}

// ---------------------------------------------------------------------------
// the parts, kept out of the class because none of them need it
// ---------------------------------------------------------------------------

/**
 * Three lights and no shadow map — and as of 2026-07-29 they are the SHOP's
 * lights, not the game's.
 *
 * The player: *"adjust the lighting: he's lit too brightly in the main menu."*
 * He was right twice over, and only one of the two is a level. The rig was lit
 * for the old backdrop — a photograph of a sunlit shop, warm, bright, sun
 * coming in the door — with a golden-hour key from screen-left at 2.3 and a
 * blue sky fill at 0.95, because those are the numbers the WORLD is graded at
 * and this screen used to be standing in a picture of that world.
 *
 * The backdrop is now a PS1-style render of a dim room: a cool blue-green cast
 * throughout, two fluorescent strips on the ceiling doing all of the work, and
 * everything below waist height falling off into a green-grey murk. A body lit
 * warm from the side, at four times the room's own level, cannot belong in that
 * however well it is modelled — it is the wrong colour AND the wrong stop, and
 * both of those read to the eye as the single word "pasted".
 *
 * So the rig is:
 *   · KEY — the ceiling tube. Cool fluorescent white with the render's green in
 *     it (0xdff3e6), 2.3 → 0.85, and moved much steeper: (2.4, 3.4, 3.2) →
 *     (1.4, 4.6, 2.2). A strip light overhead lights the tops of shoulders and
 *     leaves the front of a chest comparatively flat, which is exactly the read
 *     the room behind him has.
 *   · RIM — 0x9fd2ff → 0x6fd6c4, 1.6 → 0.55. Still the thing that cuts him off
 *     the wall, which he needs more than ever now that he is not brighter than
 *     it; but it is the room's own blue-green spill, not a second sun.
 *   · FILL — 0xbcd8ff / 0x3a2f22 at 0.95 → 0x9ec6c4 / 0x1c2622 at 0.50. The
 *     warm brown bounce was the old floor's; this floor is cold tile, so the
 *     ground half goes green-grey and the shadow side goes with it.
 *
 * Together with `STAGE_EXPOSURE` and `EMISSIVE` that is a little over half the
 * light he was getting, and it is deliberately NOT tuned by a number: the test
 * is whether the eye can still find the edge between him and the deck wall
 * behind him, and whether anything on him is brighter than the two tubes, which
 * are the brightest thing in the room and must stay that way. Checked on a real
 * capture at 1280x800 over this backdrop.
 *
 * A shadow map here would still be a megabyte of texture for a contact shadow
 * the camera is too level to see, and there is now no contact point in frame at
 * all — the DOM's floor darkening does that job for nothing (`.stage-pool`).
 */
function buildLights(scene: THREE.Scene): void {
  const fill = new THREE.HemisphereLight(0x9ec6c4, 0x1c2622, 0.5);
  scene.add(fill);

  const key = new THREE.DirectionalLight(0xdff3e6, 0.85);
  key.position.set(1.4, 4.6, 2.2);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x6fd6c4, 0.55);
  rim.position.set(-2.6, 2.0, -2.2);
  scene.add(rim);
}

/**
 * Take off the transforms the GAME parented this rig in, and leave the ones the
 * FILE brought.
 *
 * Resetting the outermost node was enough while the stage loaded its own bodies
 * — there is nothing above a GLB's own scene. A rig handed over by the ride
 * arrives wearing a stack: the holder the board yaws (that one was always
 * reset), and INSIDE it the stance group, which is turned a half-turn about the
 * vertical whenever the player is riding switch. That half-turn is a child, so
 * it survived the reset, and a player who lands switch and walks out through the
 * pause card's MAIN MENU would meet a title screen with his own back on it.
 *
 * It cannot simply be blanket-cleared down the tree: the `Armature` node these
 * Meshy exports hang the skeleton off carries a `scale 0.010` that the file
 * means, and wiping it takes the body with it. The line between the two is that
 * the game's wrappers are plain, UNNAMED `Group`s with a single child, and every
 * node the file brought is named (`Scene`, `Armature`). So the walk stops at the
 * first named node — which on a body this file loaded itself is the very first
 * child, and the loop degenerates to exactly the three lines it replaced.
 *
 * This is a reset, never a mirror: the stage's left-facing pose is `BODY_YAW`
 * and a negative scale on a SkinnedMesh is forbidden outright (AGENTS.md 10).
 */
function unwrap(root: THREE.Object3D): void {
  let node: THREE.Object3D | undefined = root;
  while (node) {
    node.position.set(0, 0, 0);
    node.rotation.set(0, 0, 0);
    node.scale.setScalar(1);
    const only: THREE.Object3D | undefined =
      node.children.length === 1 ? node.children[0] : undefined;
    node = only && only.type === "Group" && only.name === "" ? only : undefined;
  }
}

/**
 * How tall the body on the stage actually is, in world metres.
 *
 * This is `Box3.setFromObject` with TWO lines in front of it, and those two
 * lines are the whole of the giant-sneakers bug — the title screen framed a
 * body it measured at ONE AND A HALF CENTIMETRES, put the lens a metre from it
 * at ankle height, and filled the shop with a pair of shoes.
 *
 * The trap is specific to skinned rigs, and it is worth writing down because
 * nothing about it is visible in the scene graph:
 *
 *   · These Meshy exports carry `scale 0.010` on their `Armature` node while
 *     the mesh's vertices are already in METRES (its geometry box measures
 *     0.00–1.70). In `AttachedBindMode` — three's default, and what these rigs
 *     use — that scale is INVISIBLE when drawing, because the shader's
 *     `bindMatrixInverse` is kept equal to the mesh's own inverted world
 *     matrix and the two cancel exactly. The body renders at 1.70 m with a
 *     hundredth on its parent, and nothing on screen ever says so.
 *   · `Box3` does not get that cancellation for free. For a `SkinnedMesh` it
 *     asks the mesh for `boundingBox`, which is computed through the SAME
 *     `bindMatrixInverse`, and then multiplies the result by `matrixWorld` —
 *     so it only comes out right when `bindMatrixInverse` is currently the
 *     inverse of `matrixWorld`. Three keeps that true inside `updateMatrixWorld`
 *     and NOWHERE else, and `Box3` calls `updateWorldMatrix`, which is a
 *     different method that `SkinnedMesh` does not override.
 *
 * That is the difference between the two paths, and it is the only one. A body
 * this file LOADS has been through a full `updateMatrixWorld` on its way out of
 * the loader, so its `bindMatrixInverse` already carries the ×100 and the box
 * came back 0.00–1.70 — correct, by luck. A body handed over already loaded is
 * CLONED, and `SkeletonUtils.clone` re-binds the copy with the source's own
 * (identity) bind matrix — which resets `bindMatrixInverse` to identity. The
 * ×100 is gone, the ×0.01 is not, and the same rig measures 0.0152 m. Measured
 * on the live page: `own 0.00..170.00` on the loaded body against
 * `own -0.00..1.52` on the clone, both against `matrixWorld` scale 0.010.
 *
 * So: run the update that `SkinnedMesh` overrides, and drop any box cached from
 * before it — `boundingBox` is computed once and kept forever, and a wrong one
 * cached at load is a wrong one for the life of the screen, which is why this
 * survived the first draw putting the bind state right.
 */
function measureBody(root: THREE.Object3D): THREE.Box3 {
  root.parent?.updateWorldMatrix(true, false);
  // `updateMatrixWorld`, deliberately, and not `updateWorldMatrix`: only this
  // one goes through `SkinnedMesh`'s override, and the override is the fix.
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const skinned = o as THREE.SkinnedMesh;
    // `null` is three's own "not computed yet" for this field and the only way
    // to ask for a recompute — `Box3` tests it against null and `SkinnedMesh`
    // initialises it to null. The published types say `Box3`, which is the
    // typing being behind the runtime rather than a different contract.
    if (skinned.isSkinnedMesh) skinned.boundingBox = null as unknown as THREE.Box3;
  });
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y;
  // Not a debug hook — this is the silent failure that shipped. A human rig
  // that measures outside this range means the bind state was wrong again, and
  // the `Math.max(0.5, …)` clamp downstream will quietly turn it into framing
  // instead of into an error.
  if (!(height > 0.5) || height > 3) {
    console.warn(`[menu-stage] the body measures ${height.toFixed(3)} m — that is not a person`);
  }
  return box;
}

async function readManifest(url: string): Promise<MeshyCharacterManifest> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`[menu-stage] ${url} returned HTTP ${res.status}`);
  const manifest = (await res.json()) as MeshyCharacterManifest;
  if (!manifest?.model?.url) throw new Error(`[menu-stage] ${url} is not a character manifest`);
  return manifest;
}

/**
 * The manifest entry the `idle.default` slot points at.
 *
 * The slot holds a clip KEY (`Idle_3`), which is what the character loader
 * renames the loaded clip to — so it is matched against `key` first and against
 * `name` only as a courtesy to a manifest written the other way round. A clip
 * belonging to a different revision of the rig is refused here for the same
 * reason the game's loader refuses it: those bones are not these bones.
 */
function idleEntry(manifest: MeshyCharacterManifest): MeshyCharacterManifest["clips"][number] | null {
  const want = manifest.locomotion?.slots?.["idle.default"];
  const fits = manifest.clips.filter(
    (c) => c.skeletonSignature === manifest.model.skeletonSignature,
  );
  return (
    fits.find((c) => c.key === want) ??
    fits.find((c) => c.name === want) ??
    fits.find((c) => c.controllerSlots?.includes("idle.default")) ??
    null
  );
}

/**
 * The first clip in `clips` whose every track names a bone this rig actually
 * has. Same test the character loader screens its own clips with
 * (`PropertyBinding.parseTrackName`, not a split on the first dot — bone names
 * with dots in them exist): a half-binding clip does not play a half animation,
 * it twitches.
 */
function fittingClip(
  clips: readonly THREE.AnimationClip[],
  root: THREE.Object3D,
): THREE.AnimationClip | null {
  for (const clip of clips) {
    const fits = clip.tracks.every((track) => {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      return parsed.nodeName !== undefined && root.getObjectByName(parsed.nodeName) !== undefined;
    });
    if (fits) return clip;
  }
  return null;
}

/**
 * Shrink every texture on this rig to `max` on its longest edge, BEFORE it has
 * been drawn once.
 *
 * This is the single biggest number on the page. Both bodies are one 4096²
 * PNG each — 67 MB on the GPU, 89 MB once three has built the mip chain — and
 * the portrait they are drawn at is about 700 px tall. Swapping the image out
 * while `needsUpdate` is still pending means the full-size version never
 * reaches the GPU at all; only the browser's decoder ever holds it, and it lets
 * go the moment the ImageBitmap is closed.
 *
 * The texture OBJECT is kept — its colour space, wrapping and flipY are what
 * the GLB asked for and re-deriving them here is how a character comes out
 * inside out.
 */
function shrinkTextures(root: THREE.Object3D, max: number): void {
  const seen = new Set<THREE.Texture>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of materialsOf(mesh)) {
      for (const texture of texturesOf(material)) {
        if (seen.has(texture)) continue;
        seen.add(texture);
        shrinkTexture(texture, max);
      }
    }
  });
}

function shrinkTexture(texture: THREE.Texture, max: number): void {
  const image = texture.image as
    | (ImageBitmap | HTMLImageElement | HTMLCanvasElement)
    | null
    | undefined;
  if (!image) return;
  const w = (image as HTMLImageElement).width ?? 0;
  const h = (image as HTMLImageElement).height ?? 0;
  if (w <= max && h <= max) return;
  const scale = max / Math.max(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  texture.image = canvas;
  texture.needsUpdate = true;
  // The decoded original is 67 MB of ImageBitmap; the browser holds it until it
  // is closed, and nothing else is ever going to.
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
}

/**
 * Turn the rig's fullbright self-illumination down to `amount`.
 *
 * Only ever called on a body this file LOADED. A body handed over already
 * loaded shares its materials with the skater the game is about to ride, and
 * re-lighting him from the title screen is this file reaching into the ride —
 * the same rule the texture downscale follows, for the same reason.
 */
function tameEmissive(root: THREE.Object3D, amount: number): void {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of materialsOf(mesh)) {
      if (seen.has(material)) continue;
      seen.add(material);
      const lit = material as THREE.MeshStandardMaterial;
      if (lit.emissiveIntensity !== undefined) lit.emissiveIntensity = amount;
    }
  });
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function texturesOf(material: THREE.Material): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if (value instanceof THREE.Texture) out.push(value);
  }
  return out;
}

/** Free a body this file loaded: its geometry, its materials, its textures. */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    for (const material of materialsOf(mesh)) {
      for (const texture of texturesOf(material)) texture.dispose();
      material.dispose();
    }
  });
  root.removeFromParent();
}
