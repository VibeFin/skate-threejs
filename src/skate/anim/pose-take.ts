// The held moves' own takes — a generated performance used from the WAIST UP.
//
// ## Why a take is only half a body here
//
// Four takes were generated for the four moves the player called out (the grab,
// the manual, the 50-50 and the boardslide). They are `character animate` motion
// — a performer with NO BOARD — and that is not a complaint about them, it is
// the thing that decides how they can be used. Measured on this rig with the
// take driving the WHOLE body — the same instrument `tools/anim-check.mjs` uses,
// stepped at 1/60 in the board's own frame, at each take's own held frame. The
// rolling stance reads 35.2 cm and 72.6 cm on the same two scales:
//
//   take        soles apart ALONG the deck   hips above the soles
//   grab                    1.4 cm                     32.6 cm
//   50-50                  41.5 cm                     59.1 cm
//   manual                 32.5 cm                     60.6 cm
//   boardslide             39.9 cm                     57.2 cm
//
// The grab take brings his feet TOGETHER — a man crouching to pick something up,
// which is what "grab" means with no board in the room. A rider's soles are where
// the board is (`SkaterRig.followFeet` stands the deck on them), so a take that
// moves his feet moves the board, and 1.4 cm apart is both feet in one place with
// the deck hanging off them. The other three keep a plausible width and are still
// a performer's legs, not a rider's, and they arrive 35°–80° off the stance's own
// facing because every take carries the facing of whoever it was extracted from
// (DESIGN.md, 2026-07-26).
//
// What THREE of them have is the half a skater actually reads at speed: the arms
// out to hold a balance, the shoulders squared or dropped, the torso over one
// truck, the head. So a take is sampled from the waist up and laid over the
// stance the rig already stands him in — the legs stay the game's, which is what
// keeps his feet on the deck through every one of these moves, and the upper body
// stops being five hand-picked degrees and becomes fifteen bones of a real
// performance.
//
// Three, not four. The GRAB's take is the one whose upper half is a fact about
// the board too — where a hand lands on a plank — and no performance shot without
// one can carry it. It measured worse than the hand-authored posture on every
// scale that move has, the player saw it and said so, and it is gone; the table
// below keeps the whole measurement where the next person will read it.
//
// This is the same split the posture table already had and never said out loud:
// `Posture.depth` (how low he stands) and `Posture.tuck`/`fold` (the knees in the
// air) are LEG facts and stay in `POSTURES`; `spread`, `lean` and `reach` are the
// upper body and are what a take replaces.
//
// ## What is not here
//
// A full-body take — feet on the deck, filmed on a board — still drops straight
// into `HAND_CLIPS` under the same key and wins outright: `holdTrick` asks for a
// clip first and only reaches a pose take when there is no clip. Nothing in this
// file has to be removed for that to happen.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mirrorBoneName, mirrorPose } from "../mirror";
import type { TrickName } from "../skate-model";

/**
 * Which half of the body above the waist a take is trusted with: the spine, neck
 * and head (`torso`), the shoulders, arms and hands (`arms`), or both (`upper`).
 * Whatever it does not own stays `POSTURES`'.
 */
export type TakeOwns = "upper" | "torso" | "arms";

/**
 * One generated take, used as a held shape.
 *
 * `start` → `end` is the slice of the source where the move is actually being
 * held: every one of these takes walks into its pose over the first half second
 * and walks back out of it at the end, and neither of those belongs to a move
 * the game holds for as long as the player holds a rail.
 */
export interface PoseTake {
  url: string;
  /** Seconds into the take where the held shape begins. */
  start: number;
  /** …and where it ends. */
  end: number;
  /**
   * How much of him the take is trusted with. `upper` by default — everything
   * from the waist up.
   *
   * Two of these moves have one fact about the BOARD living above the waist, and
   * a performance with no board in it cannot know either:
   *   · the MANUAL is that the rider does not lean at ALL — the player's own
   *     note, "he stands completely vertical, it's just his legs". The rig turns
   *     the whole rider with the deck to keep his soles on a plank raked 17°,
   *     and `POSTURES.Manual.lean` is what takes the TORSO back off that angle
   *     to vertical (measured: −6.1° against the rolling stance's −5.0°). The
   *     take's own spine bend is a man leaning over his own toes, which on a
   *     rider standing SIDEWAYS comes out across the deck at −15.5° — a lean of
   *     its own, over the truck that is in the air, and it would land on top of
   *     the cancel rather than instead of it. So the manual takes the arms —
   *     which are what a balancing rider reads as anyway — and leaves the waist
   *     alone (`arms`).
   *   · the GRAB is where his hand goes, and its one fact turned out to fill the
   *     whole move: no setting of this field left it standing. `arms` measures
   *     the wrist 38.6 cm off the griptape and `upper` 22.7 cm, and even `torso`
   *     — which touches no arm bone directly — drags the reaching hand off the
   *     rail to 11.4 cm by rolling the shoulders it hangs from. `POSTURES.Grab`
   *     alone puts it at 6.5 cm, so the grab has no take at all; the table below
   *     carries the measurement and what would replace it.
   * The grinds have no such fact: the board is under him and going where he is
   * going, so both halves are the take's.
   */
  owns?: TakeOwns;
  /**
   * Seconds one pass through that slice takes when the move is held. The slice's
   * own length by default, so the performance runs at the speed it was performed
   * at; it PARKS on the last sampled frame after that, exactly the way the
   * wind-up crouch parks, because a grind can be held for longer than anybody
   * performed one for.
   */
  span?: number;
  /**
   * Seconds this shape takes to come on and to come back off, when the
   * posture's own ramp is not long enough for it.
   *
   * A take is a much bigger arrival than a posture: the grinds' arms open ~85 cm
   * of hand span where the degrees table moved 30, and on `POSTURE_FADE`'s
   * 0.18 s that measured 12.95 cm on the worst single frame
   * (`tools/anim-check.mjs`). This is the same argument `Posture.fade` makes for
   * the grab, in the same units, and it is the take that is arriving so it is the
   * take that carries the number.
   */
  fade?: number;
  /**
   * Degrees of yaw laid on the spine root — the take's own facing correction,
   * and much smaller than a full-body clip's because the pelvis is not the
   * take's to turn. What is left is the shoulders being squared to a camera
   * rather than to the line.
   */
  yaw?: number;
  /** …and the same for the head alone, when the body is right but the gaze is not. */
  headYaw?: number;
}

/**
 * How finely the slice is sampled, in frames per second of source.
 *
 * 30 is the source's own rate to within a frame (the takes run 150 keys over
 * 4.97 s), so nothing is thrown away and nothing is invented. Playback slerps
 * between neighbours, so this is a storage rate and not a frame rate — the
 * body still moves every frame at whatever the game is running at.
 */
const SAMPLE_FPS = 30;

/**
 * The takes, by the move they were generated for — three of the four, with the
 * fourth's whole account standing where its entry used to be.
 *
 * Every window below was read off the take frame by frame on the real rig, in
 * the board's own frame, and not off the clip's duration. The takes are all
 * 4.97 s and all of them spend the first third arriving at the shape and the
 * last third leaving it; what is between is what a held move wants.
 */
export const POSE_TAKES: Partial<Record<TrickName, PoseTake>> = {
  // THE GRAB HAS NO TAKE, and the take generated for it is the reason.
  //
  // "grab the board in the air" — cms52e6vl005v22ozt9yakk6b, which rode here as
  // `{ start: 0.45, end: 2.6, span: 0.9, owns: "torso" }` and is the animation
  // the player called out: "the grab in the air has a crappy animation; it works
  // crookedly, like unrealistic."
  //
  // Measured on the real ride — a 1.2 s air with the grab taken at 0.2 s, read
  // at the held frame in the board's own frame, take on against take off. The
  // deck's top face is 10 cm below the soles, its rails are at x = ±10.5 cm, its
  // ends at z = ±48, and his feet stand near z = −17 (back) and z = +12 (front):
  //
  //                            take OFF                  take ON  (owns: torso)
  //   grabbing hand      x −10.5  z −17.5  −3.5     x  +1.8  z −25.8  +1.4
  //     …off the griptape       6.5 cm                    11.4 cm
  //   free hand          x  +3.9  z +42.4            x +11.3  z +38.2   (2.7 cm)
  //   folded toward the nose    −12.6°                    −19.2°
  //   …and across the deck      −13.7°                    −22.6°
  //
  // Every column got worse. The take slides the grabbing hand 12.3 cm across the
  // board OFF the toe-side rail to the centre line, 8.3 cm back past the rear
  // truck and 4.9 cm up, so it holds nothing; it drops the FREE hand onto the
  // nose instead (2.7 cm off the griptape), which reads as a man clutching his
  // deck with both hands at once; and it folds him 6.6° further toward the nose
  // AND 8.9° further across the deck at the same time — a diagonal fold, which
  // is what "crookedly" looks like, with his head buried between his own knees
  // rather than turned onto the board. Captured both ways round: `shots/grab-fix/`.
  //
  // None of that is a mistake in the take. It is a performer with no board
  // crouching to pick something up off the floor (the header table: his feet
  // come 1.4 cm apart, which is both shoes in one place), and the ONE thing this
  // move needs from above the waist is where a hand goes ON a plank. `owns` has
  // no setting that helps: `arms` measures 38.6 cm off the griptape and `upper`
  // 22.7 cm, against 6.5 cm for the hand-authored posture with no take at all.
  //
  // So the grab rides `POSTURES.Grab` alone, which is where it was measured onto
  // the griptape in round 2 and where it still measures best. A take that would
  // replace it has to be filmed ON a board — video → motion, since text-to-motion
  // cannot produce a board stance — and the framing that has worked on this
  // project is the wide one: camera pulled well back, generous headroom, the
  // rider occupying only the middle half of the picture, a full backside air with
  // the trailing hand on the toe-side rail between the feet held for a beat.
  // Until such a clip exists this move is `POSTURES`', and a FULL-body one drops
  // into `HAND_CLIPS.grab` and outranks both.

  // "ride a rail in a fifty-fifty grind stance" — cms52e84y006122ozhp5xi80b.
  "50-50": {
    url: "https://assets.auras.cc/generations/cms52e84y006122ozhp5xi80b/character-motion-uthana-moCeMPEX7bg7-glb",
    start: 0.9,
    end: 3.3,
    fade: 0.28,
    // The performer looks off across his own shoulder; a rider on a rail looks
    // down it. Measured on the head bone against the rolling stance's own −4.6°,
    // the take arrives at −37.8° and this brings it to −19°: still a chin
    // dropped toward the rail he is on, no longer a man looking at the scenery.
    headYaw: 20,
  },
  // "balance in a manual with the front wheels lifted" — cms52qpjh006h22oz1j74aiyg.
  Manual: {
    url: "https://assets.auras.cc/generations/cms52qpjh006h22oz1j74aiyg/character-motion-uthana-m7P13KGsSAdh-glb",
    start: 2.0,
    end: 4.2,
    fade: 0.28,
    owns: "arms",
  },
  // "slide a rail with the board crossways" — cms52qqkk006l22ozetxud98q. The take
  // came back as a 50-50 both times it was shot (DESIGN.md) — what it is wanted
  // for is the BODY, arms wide and level over a board that is not steering him,
  // and turning the deck across the line is `SkaterRig.grindYaw`'s.
  Boardslide: {
    url: "https://assets.auras.cc/generations/cms52qqkk006l22ozetxud98q/character-motion-uthana-mo9299D1Et2C-glb",
    start: 0.6,
    end: 3.4,
    fade: 0.28,
    // Same correction as the 50-50 beside it, off the same measurement: −39.1°
    // as performed, −20° with this on.
    headYaw: 20,
  },
};

/**
 * A take sampled onto this rig: the bones it owns, and their local rotations
 * frame by frame, both ways the wheels can be running.
 *
 * The reflection is built here for the same reason `attachHandClip` builds its
 * own: it is a whole-take walk, and a landed 180 is not the moment to do one.
 */
export interface SampledTake {
  readonly take: PoseTake;
  /** The bones this take poses, of the ones above the waist it was trusted with. */
  readonly bones: THREE.Object3D[];
  /** Whether the spine, neck and head are the take's — see `PoseTake.owns`. */
  readonly ownsTorso: boolean;
  /** …and whether the shoulders, arms and hands are. */
  readonly ownsArms: boolean;
  /** `ahead[f][i]` is bone `i`'s rotation on frame `f`. */
  readonly ahead: THREE.Quaternion[][];
  /** …and the same take reflected nose for tail. See `mirror.ts`. */
  readonly fakie: THREE.Quaternion[][];
  /** Seconds one pass through the sampled frames takes. */
  readonly span: number;
}

/**
 * The bone a take starts at: the lowest link ABOVE the hips.
 *
 * Named in preference order for the same reason `WAIST_BONES` is — this Meshy
 * skeleton runs Hips → Spine02 → Spine01 → Spine, so the bottom of the spine is
 * `Spine02` and not the one called `Spine`.
 */
const WAIST_ROOTS = ["Spine02", "Spine2", "Spine", "Spine1"];

/** …and where an arm starts, on any rig that names its shoulders at all. */
const SHOULDER = /shoulder|clavicle/i;

/**
 * Loads a take and samples it onto `model`.
 *
 * Only bones at or above the waist are kept, and only ones the take actually has
 * a track for — the hips, the legs and the feet are dropped on the floor here,
 * which is the whole point, and the fingers (which `curlFingers` posed at load
 * and no take touches) come through untouched for the same reason.
 *
 * Returns null rather than throwing: a take that will not load leaves the move
 * on the posture table it was already riding.
 */
export async function loadPoseTake(
  model: THREE.Object3D,
  take: PoseTake,
): Promise<SampledTake | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync(take.url);
    const clip = gltf.animations[0];
    if (!clip) return null;

    let waist: THREE.Object3D | null = null;
    for (const name of WAIST_ROOTS) {
      waist = model.getObjectByName(name) ?? null;
      if (waist) break;
    }
    if (!waist) return null;

    // The mask, as a set of names: the waist and every bone hanging off it,
    // split at the shoulders. An arm is a shoulder bone and everything under it;
    // the torso is what is left, which is the spine chain, the neck and the head.
    const above = new Set<string>();
    const arms = new Set<string>();
    waist.traverse((o: THREE.Object3D) => {
      if (!o.name) return;
      above.add(o.name);
      if (SHOULDER.test(o.name)) o.traverse((a: THREE.Object3D) => a.name && arms.add(a.name));
    });
    const ownsTorso = (take.owns ?? "upper") !== "arms";
    const ownsArms = (take.owns ?? "upper") !== "torso";
    const owned = new Set([...above].filter((n) => (arms.has(n) ? ownsArms : ownsTorso)));

    const bones: THREE.Object3D[] = [];
    const curves: THREE.KeyframeTrack[] = [];
    for (const track of clip.tracks) {
      if (!track.name.endsWith(".quaternion")) continue;
      const name = track.name.slice(0, track.name.indexOf("."));
      if (!owned.has(name)) continue;
      const bone = model.getObjectByName(name);
      if (!bone) continue;
      bones.push(bone);
      curves.push(track);
    }
    // A take that binds almost nothing is a take built on some other skeleton;
    // the posture table is a better answer than half a body. Four is the floor
    // for the narrowest mask there is — two shoulders and two arms.
    if (bones.length < 4) {
      console.warn(`[skater] ${take.url}: only ${bones.length} upper-body bones bound`);
      return null;
    }

    const slice = Math.max(1 / SAMPLE_FPS, take.end - take.start);
    const count = Math.max(2, Math.round(slice * SAMPLE_FPS));
    const ahead: THREE.Quaternion[][] = [];
    for (let f = 0; f < count; f++) {
      const t = take.start + (slice * f) / (count - 1);
      ahead.push(curves.map((curve) => sampleTrack(curve, t)));
    }

    // Which entry of a frame is a bone's opposite number, for the reflection.
    const index = new Map<string, number>();
    bones.forEach((bone, i) => index.set(bone.name, i));
    const twin = bones.map((bone) => index.get(mirrorBoneName(bone.name)) ?? -1);
    const fakie = ahead.map((frame) => mirrorPose(frame, twin));

    return { take, bones, ownsTorso, ownsArms, ahead, fakie, span: take.span ?? slice };
  } catch (e) {
    console.warn("[skater] pose take failed to load", take.url, e);
    return null;
  }
}

/**
 * One rotation track read at one time.
 *
 * Slerped between the two keys either side, which is what a quaternion track
 * means by "between" — a component-wise lerp of two rotations 40° apart is a
 * shortened arm, not a turned one. Written out here rather than taken from
 * three's own interpolant factory because that one is assigned onto the track at
 * runtime and is not in the published types.
 */
function sampleTrack(track: THREE.KeyframeTrack, t: number): THREE.Quaternion {
  const times = track.times;
  const values = track.values;
  let i = 0;
  while (i < times.length - 1 && times[i + 1] <= t) i++;
  const j = Math.min(i + 1, times.length - 1);
  const span = times[j] - times[i];
  const mix = span > 1e-9 ? Math.max(0, Math.min(1, (t - times[i]) / span)) : 0;
  const a = new THREE.Quaternion().fromArray(values, i * 4);
  const b = new THREE.Quaternion().fromArray(values, j * 4);
  return a.slerp(b, mix);
}

/**
 * Where in a sampled take a hold of `age` seconds is, as a frame pair and the
 * blend between them.
 *
 * It PARKS on the last frame rather than looping: a rail can be held for longer
 * than anybody performed a grind for, and a take that wrapped would hand the
 * rider a fresh run-in to a shape he is already in.
 */
export function takeFrame(
  sampled: SampledTake,
  age: number,
  fakie: boolean,
): { a: THREE.Quaternion[]; b: THREE.Quaternion[]; mix: number } {
  const frames = fakie ? sampled.fakie : sampled.ahead;
  const last = frames.length - 1;
  const at = Math.max(0, Math.min(last, (age / sampled.span) * last));
  const i = Math.min(last, Math.floor(at));
  return { a: frames[i], b: frames[Math.min(last, i + 1)], mix: at - i };
}
