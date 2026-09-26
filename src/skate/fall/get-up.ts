// Standing back up, as a motion instead of a cut.
//
// The player's ask, verbatim: "Generate a get-up animation with a real
// transition from collapsed to standing." What shipped before this file is the
// second half of `Ragdoll.release()` on its own: the physics pose is cross-faded
// straight into the riding stance over 0.28 s. Filmed at 100 ms a frame
// (`shots/g/bail2-f05`, `-f06`), that is a man lying flat on the concrete in one
// picture and standing on his board in the next. There is no motion between
// lying and standing because there was never anything to play.
//
// So this owns the middle. Three stages, and only the first and last exist
// without a clip:
//
//   hold      the collapsed pose, exactly as physics left it
//   rise      the get-up CLIP, eased in from that pose over `RISE_IN`
//   handover  the clip's tail cross-faded into whatever the animation layer is
//             playing — which by then is the riding stance
//
// **The clip is a slot, and `src/skate/fall/get-up-take.ts` is what fills it.**
// Round one built the slot and left it empty, which meant every bail on screen
// still ran the fallback below while the harness reported green. The take is
// content and content in this project comes from `npx genex`; what changed is
// that the fall now loads its own, rather than waiting for a caller in a file
// this lane cannot write.
//
// **It samples the clip WITHOUT an AnimationMixer, and that is not a
// preference.** The obvious build — park a second mixer on the same skeleton,
// let it write the clip, read the bones back — was built first and is silently
// broken, because a mixer only pushes a value into the scene graph WHEN ITS OWN
// OUTPUT CHANGES (`PropertyMixer.apply`: *"value has changed -> update scene
// graph"*). Hold a clip on one frame while something else overwrites those
// bones — which is exactly what a ragdoll blending out does, every frame — and
// the mixer writes once and then goes quiet. Measured: the ease from the
// collapsed pose into the clip ran its full 0.22 s with the pose not moving at
// all, and the hips then jumped 0.66 m in a single frame the moment the physics
// weight reached zero. The stand-up was a cut with a longer fuse.
//
// So the clip is read straight off its own tracks — one interpolant per track,
// evaluated at a time this file owns — and the pose is composed and written
// once. Nothing else on the skeleton is touched: a bone the take has no track
// for keeps exactly what the animation layer put there.
//
// ---------------------------------------------------------------------------
// THREE THINGS A CLIP PLAYER IS NOT, and they are what round two was missing
// ---------------------------------------------------------------------------
//
// A take dropped into the slot and played from frame one is still a cut, just a
// prettier one, because the take does not know anything about the body it is
// standing up. Three facts have to be carried across the seam, and all three are
// read off the take's own root track and the skeleton's own hips — no world
// query, no ground sample, no second opinion about where he is.
//
// · **WHICH WAY HE IS LYING.** Every generated take carries the facing of
//   whoever performed it (`pose-take.ts` says the same thing about the four
//   held-move takes and corrects it the same way). The take starts face-down
//   along the rig's own heading; the body is lying wherever the tumble left it,
//   which after a 540 into a wall is routinely a right angle away. Played
//   straight, `RISE_IN` becomes 0.22 s of a body spinning on the concrete. So
//   the take's root is turned to the compass the body actually landed on, and
//   that turn is unwound to nothing across the rise — which is a man getting up
//   and turning onto his line, and is the reason he ends the take facing the way
//   the rig will ride him.
//
//   It corrects the COMPASS and not the roll: a body that came to rest on its
//   back still rolls over into the take's first frame during `RISE_IN`, because
//   rolling over is a thing a person does and inventing a second take for it
//   would be inventing animation.
//
// · **HOW HIGH HE IS LYING.** The take's first frame puts its hips at one
//   height; a body draped over the loading dock's 1.1 m face is three quarters
//   of a metre off it. Unmatched, that difference is paid for by the 0.22 s
//   entry ease, which is a drop — and a drop is a cut in the other direction and
//   measures as one. So the take's root is offset onto the body's own height and
//   the offset is eased out across the WHOLE rise, which turns the same three
//   quarters of a metre into a man climbing down off the thing he was draped
//   over while he gets up. Measured on that bail: 3.2 m/s of entry when the
//   offset was faded over half the rise, 1.2 m/s across all of it.
//
// · **WHERE THE TAKE ACTUALLY BEGINS AND ENDS.** This one is 3.97 s long and
//   stops rising at 2.9: the last second is the performer standing there. It
//   does not START at 0 either — its first third of a second is the performer
//   lying still before he moves, measured off his own root track at under a
//   tenth of the climb rate the rest of the take runs at. Playing it whole holds
//   the skeleton away from the animation layer for a second after the stand-up
//   finished, and — worse — the old `RISE_MAX` fitted the WHOLE take into 1.1 s,
//   so a 3.97 s take played at 3.6× speed. That is not a get-up, it is a spasm.
//   The take is trimmed at BOTH ends to the part where the root is climbing, and
//   only that part is fitted to the clock.
//
//   The front trim is not a cosmetic saving. The clock this file fits the take
//   to is the clock the RIDE leaves it (see `RISE_MAX`), and every tenth of a
//   second spent on the performer lying still is a tenth the actual stand-up has
//   to be played faster to make up — while on screen it is indistinguishable
//   from the `RISE_IN` ease that is already running over the same beat.
//
// None of the three invents motion. They are placement — where the performance
// is put on the body — which is exactly what the four pose takes' `yaw` field
// already does for the held moves.

import * as THREE from "three";

/** Seconds spent easing off the collapsed pose into the clip's first frame. */
const RISE_IN = 0.22;
/**
 * …and spent handing the skeleton back to the animation layer at the end.
 *
 * Longer than the entry because what it blends into is a stance, not a pose: the
 * ride is already rolling by then and the clip's last frame only has to stop
 * being the thing driving him.
 *
 * Exported because it is the moment a stand-up can be JUDGED at, and from outside
 * this file there is no other way to find it: everything after it is the riding
 * stance growing back, and the riding stance is a standing pose whatever the take
 * did. `tools/ragdoll-drop.mjs` reads the body this long before the end and asks
 * whether the take had him on his feet by then.
 */
export const RISE_OUT = 0.3;
/**
 * How long a get-up should take, seconds — the clock the trimmed take is fitted
 * to, and therefore very nearly the whole length of the stand-up on screen
 * (`length` is this plus `RISE_IN`).
 *
 * A stand-up is not a cutscene: `SkateModel.RAGDOLL_RECOVER` gives the body 1.5 s
 * on the floor before the ride takes the controls back regardless, and a get-up
 * still running long after that is a man on his knees while the player is
 * pushing. So the take is played faster than it was performed — and how much
 * faster is a real limit and not a shrug.
 *
 * **This was 2, and 2 is a second and a half of live gameplay spent on all
 * fours.** Filmed through the game's own input layer, that is exactly what it
 * looks like: `shots/g-crit/getup-push-f01…f06`, four consecutive frames reading
 * 21 → 29 → 41 → 48 km/h with the rider face-down crossing the plaza. The ride
 * hands the controls back the frame the body settles — `SkateModel` reads
 * `settled` and goes straight to `rolling` — so every millisecond of stand-up
 * after that is a millisecond the player is pushing a man on his knees.
 *
 * Two things set the number, and they pull opposite ways.
 *
 * · **The floor.** The take is a 2.6 s performance once trimmed, and its own
 *   fastest climb is 1.08 m/s. `tools/ragdoll-drop.mjs`'s `rise` line bounds the
 *   fastest tenth of a second the hips may climb through at 1.9 m/s, and it is
 *   bounded there because the cross-fade this file replaces reads 2.2 — a bound a
 *   cut would pass is not a bound. `riseFast` comes out at almost exactly
 *   1.07 m/s per unit of playback rate, so 1.9 buys a rate of 1.77 and no more,
 *   and 2.6 s of performance at 1.77× is 1.5 s of clip.
 * · **The ceiling.** Everything above that is knees.
 *
 * 1.6 sits just inside the floor: rate 1.65, `riseFast` 1.7–1.8 m/s across all
 * five frame rates, and a stand-up 1.82 s long against the 2.22 s that shipped.
 * The 0.4 s that buys is real and it is not enough, and the honest reading of
 * that is written down rather than tuned away: **this take cannot be made to fit
 * the window the ride leaves, because the window is zero.** Closing the rest is
 * either a shorter get-up performance or a hand-back that waits for the man to
 * be on his feet, and both live outside this file.
 */
const RISE_MAX = 1.6;
/**
 * …and the fastest a take may be played to make it fit.
 *
 * The bound that is missing turns a long take into a spasm; the bound that is
 * missing the other way CUTS one. If a take cannot reach standing inside
 * `RISE_MAX` at this rate it is allowed to run long instead — a get-up that takes
 * two seconds is worse than one that takes one and a half, and a get-up that
 * stops half way up is not a get-up at all.
 */
const RATE_MAX = 2.2;
/**
 * Where a take stops being a stand-up, as a share of its own peak climb rate.
 *
 * Written as a fraction rather than a speed because the root track is in the
 * rig's own units — this skeleton is authored in centimetres — and a threshold in
 * metres per second would be a hundred times wrong on it. A tenth of its own
 * fastest climb is a body that has arrived: measured on the take in the slot,
 * that lands the cut at 2.87 s of a 3.97 s take, which is the frame the performer
 * finishes standing and before the second of idle that follows.
 */
const RISE_SETTLED = 0.1;
/** …plus this much, seconds, so the last frame played is not mid-motion. */
const RISE_TAIL = 0.1;
/** A take with no root track keeps at least this share of itself. */
const RISE_MIN_SPAN = 0.4;
/**
 * How far the take's root may be lifted onto the body's own height, as a share of
 * the take's own climb.
 *
 * Unit-free for the same reason `RISE_SETTLED` is. A whole climb's worth is a body
 * lying as far above the ground the rig is standing him on as the take lifts him
 * from it, which is the dock face — he comes to rest draped over 1.1 m of concrete
 * with the floor under his hips at the bottom of it. Past that is a body somewhere
 * the take has no business being placed on, and the entry ease takes the rest.
 */
const LIFT_MAX = 1;
/**
 * …and the share of the rise it fades out over.
 *
 * ONE, and the reason is the whole point of matching at all. Anything the match
 * does not cover is paid for by the 0.22 s entry ease instead, at a rate no
 * stand-up should ever move at: measured on the dock-face bail, half the match
 * faded over half the rise left 47 cm to fall inside `RISE_IN` and the row read
 * **3.2 m/s** — half again the cross-fade this file exists to replace, on the one
 * bail in the table where the body came to rest above its own standing height.
 * Faded across the whole rise it is 1.2 m/s and reads as what it is: a man
 * climbing down off the thing he was draped over as he gets up.
 */
const LIFT_SPAN = 1;

export type RiseStage = "off" | "hold" | "rise" | "handover";

/** One of the take's tracks, resolved onto a bone of this skeleton. */
interface Channel {
  bone: THREE.Object3D;
  kind: "quaternion" | "position";
  at: (t: number) => ArrayLike<number>;
}

const _identity = new THREE.Quaternion();

/**
 * The stand-up, over one skeleton.
 *
 * Built once per character. `arm()` is called when the body has come to rest,
 * `blend()` every frame after that, and it reports back what weight the physics
 * pose is still entitled to — so the ragdoll stays the one place that writes
 * bones and this stays the one place that decides what they are being written
 * toward.
 */
export class GetUp {
  private clip: THREE.AnimationClip | null = null;
  /**
   * A take handed in while a stand-up is running. It cannot be spliced into one
   * already on screen, and dropping it outright — which is what the guard used to
   * do — loses it for the whole session. It is adopted by the next `arm()`.
   */
  private queued: THREE.AnimationClip | null = null;
  private hasQueued = false;
  private channels: Channel[] = [];
  private bound = false;
  private stage: RiseStage = "off";
  private t = 0;
  /** Where in the take the stand-up starts, seconds — see `RISE_SETTLED`. */
  private from = 0;
  /** …and how many seconds of it there are from there. */
  private span = 0;
  private rate = 1;
  /** How far the take's own root climbs across that span, in the rig's units. */
  private climb = 0;

  /** The take's root channels, when they land on the bone the body is hung off. */
  private rootQ: Channel | null = null;
  private rootP: Channel | null = null;
  /** The turn from the take's own compass onto the one the body landed on. */
  private readonly align = new THREE.Quaternion();
  private aligned = false;
  /** …and the height the body is lying at, less the height the take starts at. */
  private lift = 0;

  private readonly root: THREE.Object3D;
  private readonly q = new THREE.Quaternion();
  private readonly a = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();

  constructor(root: THREE.Object3D) {
    this.root = root;
  }

  /** True while the get-up is driving the pose. */
  get running(): boolean {
    return this.stage !== "off";
  }

  /** Which part of the stand-up is on screen — the harness reads this. */
  get phase(): RiseStage {
    return this.stage;
  }

  /** True once a real clip has been handed in; false means the plain cross-fade. */
  get hasClip(): boolean {
    return this.clip !== null;
  }

  /**
   * How long the whole transition takes with the take that is loaded, seconds —
   * including the ease off the collapsed pose, excluding the hand-back, which
   * overlaps the take's own tail.
   *
   * The deck's return is timed off this (`Ragdoll.release`), so a board arrives
   * back under his feet as he finishes standing rather than sliding home under a
   * man still on his knees.
   */
  get length(): number {
    return this.clip ? RISE_IN + this.span / this.rate : RISE_OUT;
  }

  /**
   * Hand in the get-up take. Safe at any time — a clip that arrives mid-stand-up
   * is kept for the next one rather than spliced into the one on screen.
   */
  setClip(clip: THREE.AnimationClip | null): void {
    if (this.stage !== "off") {
      this.queued = clip;
      this.hasQueued = true;
      return;
    }
    this.adopt(clip);
  }

  private adopt(clip: THREE.AnimationClip | null): void {
    this.clip = clip;
    this.bound = false;
    this.channels = [];
    this.rootQ = null;
    this.rootP = null;
    this.from = 0;
    this.span = clip ? clip.duration : 0;
    this.rate = 1;
    this.climb = 0;
  }

  /**
   * Resolves the take's tracks onto this skeleton, once.
   *
   * `PropertyBinding.parseTrackName` is three's own reading of a track name, so
   * a take authored against `Hips.quaternion`, `.bones[Hips].quaternion` or
   * `mixamorig:Hips.quaternion` all land on the same bone. Anything that does
   * not resolve is skipped rather than guessed at: a track this skeleton has no
   * bone for is a retargeting problem, and quietly driving the nearest name
   * would be worse than leaving that bone to the animation layer.
   */
  private bind(hips: THREE.Object3D | null): void {
    this.bound = true;
    this.channels = [];
    this.rootQ = null;
    this.rootP = null;
    const clip = this.clip;
    if (!clip) return;
    const byName = new Map<string, THREE.Object3D>();
    this.root.traverse((o: THREE.Object3D) => {
      if (o.name && !byName.has(o.name)) byName.set(o.name, o);
    });
    for (const track of clip.tracks) {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      const kind =
        parsed.propertyName === "quaternion"
          ? "quaternion"
          : parsed.propertyName === "position"
            ? "position"
            : null;
      if (!kind) continue; // scale and morph targets are not a pose
      const bone = byName.get(parsed.nodeName) ?? byName.get(String(parsed.objectName ?? ""));
      if (!bone) continue;
      // `createInterpolant` is three's own per-track sampler — the same object
      // an AnimationMixer would use. It is missing from the published types on
      // `KeyframeTrack`, which is why this is spelt out rather than called.
      const factory = track as unknown as {
        createInterpolant: () => { evaluate: (t: number) => ArrayLike<number> };
      };
      const interpolant = factory.createInterpolant();
      const channel: Channel = { bone, kind, at: (t: number) => interpolant.evaluate(t) };
      this.channels.push(channel);
      // The take's ROOT is whichever channel lands on the bone the solver hangs
      // the body off. Matched by identity rather than by name: the two have to be
      // the same object for the alignment below to mean anything, and a take that
      // names its root something this skeleton does not is simply played
      // unaligned rather than aligned onto the wrong bone.
      if (hips && bone === hips) {
        if (kind === "quaternion") this.rootQ = channel;
        else this.rootP = channel;
      }
    }
    if (this.channels.length === 0) {
      console.warn("[get-up] the take binds to none of this skeleton's bones — falling back");
      this.clip = null;
      return;
    }
    this.measure();
  }

  /**
   * Where the stand-up in this take starts and ends, and how far it lifts him.
   *
   * All of it comes off the root's own height track, sampled at the take's own
   * rate: the rise is the stretch where the root is climbing at better than
   * `RISE_SETTLED` of its own fastest, and the climb across that stretch is what
   * the lift match below is scaled against. A take with no root position track
   * keeps its whole length — there is nothing here to read, and guessing at one
   * would be worse than playing the tail.
   *
   * BOTH ends are trimmed. The tail was always cut (a take that ends with the
   * performer standing there holds the skeleton away from the animation layer
   * for a second after the stand-up is over); the FRONT was not, and on the take
   * in the slot that is a third of a second of a man lying still — 0.33 s of a
   * 2.97 s stand-up, 11% of a clock that is measured in tenths. It costs nothing
   * on screen: `RISE_IN` is easing off the collapsed pose over the same beat, so
   * what was being played there was a lying pose blended into a lying pose.
   */
  private measure(): void {
    const clip = this.clip;
    const root = this.rootP;
    if (!clip) return;
    this.from = 0;
    this.span = clip.duration;
    this.climb = 0;
    if (root) {
      const step = 1 / 30;
      const n = Math.max(2, Math.round(clip.duration / step) + 1);
      const ys: number[] = [];
      for (let i = 0; i < n; i++) {
        ys.push(root.at(Math.min(clip.duration, i * step))[1]);
      }
      let peak = 0;
      for (let i = 1; i < n; i++) peak = Math.max(peak, (ys[i] - ys[i - 1]) / step);
      if (peak > 0) {
        const stop = peak * RISE_SETTLED;
        let first = -1;
        let last = 0;
        for (let i = 1; i < n; i++) {
          if ((ys[i] - ys[i - 1]) / step <= stop) continue;
          // The frame BEFORE the climb starts, so the take is entered on the
          // last still picture rather than half a step into the motion.
          if (first < 0) first = (i - 1) * step;
          last = i * step;
        }
        this.from = Math.max(0, first);
        this.span = THREE.MathUtils.clamp(
          last + RISE_TAIL - this.from,
          clip.duration * RISE_MIN_SPAN,
          clip.duration - this.from,
        );
      }
      const at = Math.round(this.from / step);
      let top = ys[at];
      const until = Math.min(n - 1, Math.round((this.from + this.span) / step));
      for (let i = at + 1; i <= until; i++) top = Math.max(top, ys[i]);
      this.climb = Math.max(0, top - ys[at]);
    }
    // Played faster if the take is long, never slower, and never fast enough to
    // stop being a get-up: see `RATE_MAX`.
    this.rate = THREE.MathUtils.clamp(this.span / RISE_MAX, 1, RATE_MAX);
  }

  /**
   * He has stopped moving — start standing up.
   *
   * `bones` is the whole skeleton; it is only used to notice that the character
   * has been swapped underneath us, which re-resolves the take's tracks. `hips`
   * is the bone the solver hangs the body off, read HERE — while the skeleton
   * still holds the pose physics left it in — for the two facts that place the
   * take on the body: which way round he is lying, and how high.
   */
  arm(bones: readonly THREE.Object3D[], hips: THREE.Object3D | null = null): void {
    if (this.hasQueued) {
      this.adopt(this.queued);
      this.queued = null;
      this.hasQueued = false;
    }
    this.stage = "rise";
    this.t = 0;
    this.aligned = false;
    this.lift = 0;
    if (!this.bound || (bones.length > 0 && !this.channels.some((c) => bones.includes(c.bone)))) {
      this.bind(hips);
    }
    if (!this.clip || !hips) return;

    // --- which way he is lying ---------------------------------------------
    // Both quaternions are the SAME bone's local rotation, so the difference
    // between them is a rotation in the rig's own frame and needs no world
    // transform to read. Only its twist about the rig's up axis is kept: that is
    // the compass, and it is the part the take gets wrong. The rest of the
    // difference — a body on its back against a take that starts face-down — is
    // left for the entry ease, because rolling over is a thing a person does.
    if (this.rootQ) {
      // `from`, not 0 — the frame the take is actually ENTERED on. Reading the
      // clip's own first frame would align the body onto a pose that is never
      // played once the front is trimmed.
      const v = this.rootQ.at(this.from);
      this.q.set(v[0], v[1], v[2], v[3]);
      this.a.copy(hips.quaternion).multiply(this.q.invert());
      const w = this.a.w;
      const y = this.a.y;
      const n = Math.hypot(y, w);
      if (n > 1e-6) {
        this.align.set(0, y / n, 0, w / n);
        this.aligned = true;
      }
    }

    // --- and how high ------------------------------------------------------
    // The take's first root height against the body's own, in the rig's units,
    // clamped to a share of the take's own climb (see `LIFT_MAX`).
    if (this.rootP && this.climb > 0) {
      const v = this.rootP.at(this.from);
      const room = this.climb * LIFT_MAX;
      this.lift = THREE.MathUtils.clamp(hips.position.y - v[1], -room, room);
    }
  }

  /** Stop, and give the bones straight back. R mid-fall comes through here. */
  cancel(): void {
    this.stage = "off";
    this.t = 0;
  }

  /**
   * One frame of the stand-up.
   *
   * Call it with the skeleton holding the ANIMATION LAYER's pose, which is what
   * it holds at this point in the frame. Returns how much of the COLLAPSED pose
   * is still entitled to be on screen — 1 while he lies there, easing to 0 as
   * the take takes over, and 0 for good once the animation layer has him back.
   * Only the ragdoll can apply that part, because only the ragdoll is holding
   * the particles it comes from.
   */
  blend(dt: number): number {
    if (this.stage === "off") return 0;
    if (!this.clip) {
      // No take to play. The old cross-fade, unchanged and openly a fallback:
      // there is no motion between lying and standing that this file could
      // invent, and inventing one is what the asset pipeline is for. It is
      // reached in one case now — the take would not download — and the harness
      // measures it on named rows rather than on every row it runs.
      this.t += dt;
      const w = 1 - Math.min(1, this.t / RISE_OUT);
      if (w <= 0) this.stage = "off";
      return w;
    }

    this.t += dt;
    const clipT = Math.max(0, this.t - RISE_IN);
    const played = this.span / this.rate;
    const at = this.from + Math.min(this.span, clipT * this.rate);

    // Two weights, and they are different things:
    // · `physics` is how much of the collapsed pose is still showing, which
    //   only the ragdoll can apply.
    // · `clipW` is how much of the take is showing against the animation
    //   layer's stance, which is applied right here.
    const physics = this.t < RISE_IN ? 1 - ease(this.t / RISE_IN) : 0;
    const left = played - clipT;
    const clipW = left < RISE_OUT ? ease(Math.max(0, left) / RISE_OUT) : 1;
    this.stage = physics > 0 ? "rise" : "handover";

    // …and two placements, both full while the entry ease is running (`clipT` is
    // 0 through all of it, which is what makes that ease a blend onto the body
    // rather than a blend onto the performer).
    const alignW = this.aligned ? 1 - ease(clipT / Math.max(1e-4, played)) : 0;
    const liftW = 1 - ease(clipT / Math.max(1e-4, played * LIFT_SPAN));
    if (alignW > 0) this.a.copy(_identity).slerp(this.align, alignW);

    for (const c of this.channels) {
      const v = c.at(at);
      if (c.kind === "quaternion") {
        this.q.set(v[0], v[1], v[2], v[3]);
        if (c === this.rootQ && alignW > 0) this.q.premultiply(this.a);
        c.bone.quaternion.slerp(this.q, clipW);
      } else {
        this.p.set(v[0], v[1], v[2]);
        if (c === this.rootP) {
          // Carried through the same turn the root's ROTATION got, so a take
          // whose root travels travels the turned way round rather than along
          // the performer's original line. On the take in the slot the root
          // stays over its own origin and this is exactly a no-op — it is here
          // for the take that does not, not for this one.
          if (alignW > 0) this.p.applyQuaternion(this.a);
          if (liftW > 0) this.p.y += this.lift * liftW;
        }
        c.bone.position.lerp(this.p, clipW);
      }
    }
    if (left <= 0) {
      this.stage = "off";
      return 0;
    }
    return physics;
  }
}

/** A cosine ease — the same one the deck's return uses. */
function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 0.5 - 0.5 * Math.cos(x * Math.PI);
}
