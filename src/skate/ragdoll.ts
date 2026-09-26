// When the bones give up.
//
// The player's ask, verbatim: "when the character falls they shouldn't just tip
// to the side, they should have real physics… when the bones actually
// collapse." So a bail stops being a rig transform and becomes a body: one
// verlet particle per bone, distance constraints along every bone so limbs keep
// their length, joint limits so knees and elbows only bend the way knees and
// elbows bend, and the floor read out of the same SurfaceProvider the ride uses.
// The skeleton is then POSED from the particles — each bone swings its rest
// direction onto its child particle.
//
// That is NOT inverse kinematics. A `twoBoneIK` foot-pin was rejected and
// reverted whole on this rig (DESIGN.md, 2026-07-26) and nothing here reaches
// for a solver: no target is chased, no chain is inverted, no joint is asked to
// reach anywhere. The particles fall, and the bones report where they landed.
//
// Two things this file is deliberately careful about:
//
// · **Entry has no snap** because there is nothing to snap from — the particles
//   are seeded from the skeleton's own live world positions, and each one keeps
//   the velocity that bone actually had. `observe()` is what buys that: two
//   frames of bone history turn "a mannequin was dropped" into "he was thrown
//   down the line he was travelling, still spinning".
//
// · **It is the LAST writer, not the only one.** The animation layer keeps
//   playing underneath; this runs after it and overwrites the bones at a weight
//   that is 1 while he is down and ramps to 0 through `release()`. That is the
//   whole blend back to the riding stance — and, unlike the two-writers bug this
//   project already paid for, the order here is fixed, so the winner never flips.

import * as THREE from "three";
import type { SurfaceKind, SurfaceProvider, SurfaceSample } from "../world/surface";
import { makeSample } from "../world/surface";
import type { RagdollHandle } from "./contracts";
import { BoardFall } from "./fall/board-fall";
import type { BodySegment } from "./fall/board-fall";
import { GetUp } from "./fall/get-up";
import { loadGetUpTake } from "./fall/get-up-take";

// ---------------------------------------------------------------------------
// Feel constants
// ---------------------------------------------------------------------------
/**
 * The ride's own gravity, not earth's. A body that falls slower than the board
 * it came off reads as slow motion, and the ride is tuned at 17 for hang time.
 */
const GRAVITY = 17;
/** Air resistance on a tumbling limb, 1/s. Enough to stop a flail perpetuating. */
const AIR_DRAG = 0.7;
/**
 * Joint friction: how fast two ends of a bone give up moving RELATIVE to each
 * other, 1/s.
 *
 * This is not a filter laid over motion — it is the thing a real joint has and
 * a string of particles does not. Without it a shin is a point on the end of a
 * 34 cm string and a foot a point on the end of a 16 cm one, and a light
 * particle on a short lever comes round faster than any limb can: the standing
 * collapse measured 177° of ankle in a single frame with the leg barely moving.
 * It leaves the body's own motion alone — only the difference between two ends
 * of the same bone is touched.
 *
 * It is quoted for a bone of `JOINT_DAMP_LEN` and scaled by length, because what
 * a joint resists is TURNING and this solver only knows how to resist sliding.
 * The two are the same thing divided by the bone: measured on this rig, the
 * chest is 10.5 cm to the neck and the neck 8.6 cm to the skull, so a couple of
 * centimetres of ordinary solver give up there is 50–60° of head in one frame
 * while the same give in a 34 cm thigh is 4°. One friction number for both
 * therefore has to be wrong twice — too loose on the short bones, which is where
 * every whip in the table came from, and too stiff on the long ones, which is
 * what makes a body land in formation instead of tumbling.
 */
const JOINT_DAMP = 16;
/** The bone length `JOINT_DAMP` is quoted for, m — roughly an upper arm. */
const JOINT_DAMP_LEN = 0.26;
/** …and how far the scaling may go, so a 3 cm marker bone cannot freeze a joint. */
const JOINT_DAMP_MAX = 4;
/**
 * The solver runs on its own fixed clock. A ragdoll integrated at the display's
 * frame time explodes the first time a frame is long — and a bail is exactly
 * when the frame gets long, because the audio and the HUD all fire at once.
 */
const SUBSTEP = 1 / 180;
const MAX_SUBSTEPS = 12;
/**
 * Relaxation passes per substep. Below 3 the legs visibly stretch on impact, and
 * measured across the whole drop table, six passes hold a bone to 3.3 mm on its
 * worst impact frame and ten hold it to 1.0 mm. A ragdoll runs for about a
 * second per bail, so the passes are cheap and the skin not moving is the whole
 * point of the exercise.
 *
 * What this loop does NOT do is converge on a hard frame — every solver in it
 * re-injects its own correction each pass — so the number that actually decides
 * whether a bone stretches is `FINAL_BONE_PASSES` below, not this one.
 */
const ITERATIONS = 10;
/** Bones and braces are both hard — a limb has one length and a pelvis has one shape. */
const BONE_STIFFNESS = 1;
const BRACE_STIFFNESS = 1;
/** How much of a limit violation is taken back per pass. Full correction chatters. */
const LIMIT_STIFFNESS = 0.6;
/**
 * …except at a HINGE, where it is taken back whole.
 *
 * The two are different kinds of boundary and that is the whole reason there are
 * two numbers. A swing cone is soft and a fall spends most of its time resting
 * against one, so a full correction there is a pose bouncing off its own limit
 * every pass — which is what "chatters" above means. A knee's stops are only ever
 * touched by a violation, and everything else in the substep is pushing back at
 * them: the floor projection, the volume solver and twenty-three links all
 * re-inject their own corrections every pass, so a partial one never arrives.
 *
 * **And the honest reading of what it buys, which is less than the paragraph above
 * expects.** Measured across 300 bails at five rates, 0.6 against 1: the knee's
 * worst out-of-plane goes 19.1° → 18.9° and the elbow's 28.5° → 28.8°, so the
 * residual is NOT a convergence problem and full correction does not close it —
 * the joint is being held out of plane by the floor and the links, not by an
 * unfinished relaxation. What it does buy is the claim that matters:
 * `integration-check`'s "nothing folds shut mid-fall" reads **150.2° against the
 * 150° allowed at 1, and 154.3° at 0.6**, so at full strength the hinge sits
 * exactly on its stop. It costs 2.6° on that file's single-frame reversal line
 * (97.3° → 99.9°, both well inside its bound).
 *
 * It is still not a teleport: `capTurn` runs after every pass this is used in and
 * holds any bone to 7.0° a substep against where it began that substep.
 */
const HINGE_STIFFNESS = 1;
/**
 * …and how fast a joint limit is allowed to turn a joint, rad/s — ONE budget per
 * substep, shared by every relaxation pass.
 *
 * The floor and the wall are both rationed (`liftRoom`, `WALL_MAX_STEP`) and the
 * limits were not, which made them the one solver in the file that could move a
 * body arbitrarily far in a frame. Traced pass by pass on a bail into the
 * quarter-pipe deck: a single limit pass swung a foot **27.8 cm**, ten passes a
 * substep, six substeps a frame at 30 fps — 1.14 m of leg between two drawn
 * frames, which is what a limb turning inside out actually is. The cause is a
 * closed loop rather than a bad number: a `frame` limit is measured against the
 * pelvis's own rotation, the pelvis's rotation is read off the two hip particles,
 * and the correction moves those hip particles. Turning the loop gain down is not
 * a fix; bounding how fast it can act is, because a ration can only ever take a
 * correction away and never add one, and a joint genuinely does have a top speed.
 *
 * Quoted as a rate, so the bound is the same at 30, 60 and 144 — 20 rad/s is
 * 1150°/s, which is a limb whipping about as fast as a body can whip one, and
 * measured across 360 street bails per skeleton it costs the fall nothing: the
 * mean single-frame turn moves 57.2° → 50.3° while the worst goes 180° → 120°.
 */
const LIMIT_TURN_RATE = 20;
/**
 * …and how fast THE PARTICLES may turn a joint, rad/s. The one bound this file
 * was missing, and the reason a limb could still come out backwards.
 *
 * Everything else here is rationed in METRES — `capSpeed` bounds how fast a
 * particle may travel, `liftRoom` how far a floor may lift it, `WALL_MAX_STEP`
 * how far a wall may eject it, `LIMIT_TURN_RATE` how fast the limit solver's own
 * feedback loop may act. None of those bound a bone, because a bone is short and
 * a short lever turns a small translation into an enormous angle: measured on
 * the real Meshy rig bailing into the loading-dock face at 18 m/s, a collarbone
 * and an upper arm 13.8 cm apart each moved 12 cm in one frame and the bone
 * between them turned **106.8° at 45 fps** — 4,800°/s, a limb inside out — while
 * the same frame's worst BONE ROTATION read 77.7° and passed. It is not a long
 * frame either: the same sweep turns 111.8° in a single substep at 144 fps.
 *
 * So a joint gets the thing a joint has and a string of particles does not: a
 * top angular speed. The segment between two linked particles may not swing
 * faster than this, and when it tries it is swung back about the joint — which
 * keeps the bone exactly its own length, the same reason `rotateChild` may run
 * inside the relaxation loop. Nothing is smoothed and no pose is filtered; the
 * particles are corrected, and the bones report where they landed as before.
 *
 * Quoted as a rate, so one frame at 30 fps buys exactly the same turn as five at
 * 144: the budget is `BONE_TURN_RATE · SUBSTEP` per substep and there are
 * `dt / SUBSTEP` of them. 22 rad/s is 1,260°/s — three and a half turns a second
 * for one limb, which is faster than a body can whip one and far under the 4,800
 * above. Measured across 480 street bails at five frame rates it costs the fall
 * nothing a player can see: the p95 single-frame turn is unchanged to a tenth of
 * a degree and only the reversals move.
 */
const BONE_TURN_RATE = 22;

/** A body does not bounce. This is only here so a slam does not read as a stick. */
const RESTITUTION = 0.08;
/**
 * How fast a surface scrubs the speed off a body sliding on it, 1/s. Written as
 * a rate rather than a per-contact fraction: the solver takes several substeps
 * a frame, and a fraction taken per substep is a different amount of friction
 * at every frame rate.
 */
const FRICTION: Record<SurfaceKind, number> = {
  asphalt: 16,
  concrete: 14,
  metal: 6,
  wood: 12,
  grass: 22,
};
/**
 * …and how much SLOPE each one can hold a body still on, as a gradient.
 *
 * Scrubbing speed off is not the same thing as holding on, and only having the
 * first is why a body never came to rest at the foot of a bank. Viscous friction
 * balances gravity at `g·sinθ / FRICTION` — on the loading dock's 15° bank that
 * is 0.32 m/s, which is over `SETTLE_SPEED`, so the skater crept down it for the
 * whole four seconds of `MAX_SIM` and the player watched a corpse slither
 * before he was allowed to get up. Measured at 30, 60 and 144 fps, on the real
 * spot. A surface holds a resting body until the slope beats its grip, so these
 * are that grip: concrete grips a 42° bank, plywood 35°, steel barely 19°, and
 * nothing holds anything on a quarter-pipe transition, which is right.
 */
const GRIP: Record<SurfaceKind, number> = {
  asphalt: 1,
  concrete: 0.9,
  metal: 0.35,
  wood: 0.7,
  grass: 0.8,
};
/** How slowly a contact has to be moving before that grip takes hold, m/s. */
const STATIC_SLIDE = 0.6;
/**
 * How much speed one substep of relaxation may ADD to a particle, m/s².
 *
 * A position solver reports its corrections as velocity, and when a body lands
 * stacked — a standing collapse, where two legs have to stop the whole mass —
 * those corrections compound into a launch: measured, a shin left the pile at
 * 0.83 m in a single frame and the write-back turned that into a 171° snap.
 * Momentum still transfers freely (a torso landing on a hand really does throw
 * the hand); it just cannot do it faster than a hard impulse would.
 */
const IMPULSE_MAX = 40;

/**
 * Below this speed on his FASTEST-moving part he has stopped moving, m/s.
 *
 * It reads high for a rest because it is now the worst particle rather than the
 * mean of twenty-four, and those are different numbers by an order of magnitude:
 * the old mean-under-0.3 bar let a shin travel at 2.55 m/s while the body was
 * declared settled. At 0.8 the worst any bail ever froze at, measured across the
 * six wall cases at 30 / 60 / 144, is 0.51 m/s — a hand still drifting, for the
 * fraction of a second before the reset — and the bodies that used to lie there
 * for the whole of `MAX_SIM` come to rest instead.
 */
const SETTLE_SPEED = 0.8;
/** …and he has to hold it this long, so a bounce is not mistaken for a rest. */
const SETTLE_HOLD = 0.22;
/** Hard ceiling on a tumble. Nothing may leave the player watching a stuck body. */
const MAX_SIM = 4;
/** Seconds spent handing the skeleton back — the stand-up, not a teleport. */
const RELEASE_BLEND = 0.28;

/** Normal-closing speed a contact needs before it is worth a sound, m/s. */
const IMPACT_MIN = 1.6;
/** Ceiling on any seeded particle speed. One bad frame of history must not launch him. */
const SEED_MAX = 22;
/**
 * The board stops and the rider does not. Scaling the seed velocity by each
 * bone's height above the hips turns the impact into a trip: the feet are pulled
 * back, the head is thrown on, and he goes over the nose. Without it a fast bail
 * reads as a body sliding along in formation.
 */
const TRIP_GAIN = 0.35;
/** …over this much height, metres. Roughly hips-to-head. */
const TRIP_SPAN = 0.6;
/** Bone history older than this is not a velocity, it is a guess. */
const OBSERVE_STALE = 0.2;

/**
 * How far above the LOWEST GROUND this particle has held the world is allowed to
 * claim the floor is, before the claim stops being a floor. Metres.
 *
 * A `SurfaceProvider` resolves a query against whatever it finds at (x, z), and
 * beside a wall or a fence it can hand back the WALL'S ROOF — measured, one
 * query next to a building answered 15 m to a body riding at half a metre, and
 * the projection below believed it: the whole skeleton went onto the roof with
 * the bones drawn out to metres. Nothing downstream survives being told to move
 * one particle fifteen metres, and no amount of relaxation makes it look like a
 * fall.
 *
 * The reference this is measured against is the thing that matters, and getting
 * it wrong is how the guard was defeated twice. Measured against where the
 * particle was A SUBSTEP AGO it tests nothing at all against the failure this
 * world actually has: a provider that answers a query INSIDE a solid with the
 * y-hint it was handed says "the floor is exactly where you are", which is a
 * rise of zero every substep and lifts the body one radius per pass forever —
 * 12 m of building in about a second, and every frame of it passes a
 * rise-since-last-frame test.
 *
 * So the reference is `floorRef`, the lowest ground each particle has held since
 * the bail, and it ONLY EVER FALLS. A rise is then a rise since the body was
 * demonstrably not inside solid concrete, it is bounded once instead of once per
 * frame, and no sequence of lies can walk it upward.
 *
 * Which is also why it does not have to be generous. A floor AT OR BELOW the
 * particle is believed whatever it says, because a floor below you cannot lift
 * you — so a hand that comes to rest on a 0.45 m ledge top needs nothing from
 * this number. All this has to cover is a floor genuinely ABOVE the particle,
 * and the only honest reason for one of those is penetration: 12 cm at the
 * fastest a seeded particle may travel. A quarter of a metre is that with room.
 *
 * The whole drop table passes anywhere from 0.15 to 0.60, so the value is a
 * judgement and not a measurement, and the judgement is the 0.40 m ledge: at
 * 0.25 a limb sliding into a ledge's FACE is refused its top and stopped by it,
 * which is what a ledge does, and at 0.60 the same limb would be stood on top of
 * it. Note what this is NOT doing any more — it is not what defeats a provider
 * that echoes the y-hint. That is the hint cap below, which rejects the echo at
 * any height and at any value of this.
 */
const FLOOR_RISE_MAX = 0.25;
/**
 * …and how far ONE relaxation pass may lift a particle out of the floor, m.
 *
 * The plausibility test is the fix; this is what makes the solver safe against a
 * lie it cannot detect. A particle falls at most `v · SUBSTEP` into a surface —
 * 11 cm at 20 m/s — so six passes of this converge on any honest penetration,
 * while a floor that jumps can only ever carry the body up at a running pace
 * instead of teleporting it and taking the bones with it.
 */
const PROJECT_MAX_LIFT = 0.08;
/**
 * …and how much a WHOLE substep may lift one particle beyond what it could
 * honestly have driven itself into the floor with, m.
 *
 * Per-pass rationing alone bounds nothing: the projection aims at an absolute
 * height, so ten passes of 8 cm simply converge on whatever the floor claimed,
 * however far above the body that is. The honest budget is the arrival speed —
 * you cannot be 11 cm inside concrete unless you were doing 20 m/s — plus the
 * hardest push the constraints are allowed to add (`IMPULSE_MAX`), plus this,
 * which is the give in a relaxation pass rather than in the physics.
 *
 * It is deliberately kept now that it no longer binds. With the ceiling and
 * `FLOOR_NORMAL_MIN` both in place the whole drop table passes at 1 cm, 4 cm and
 * 10 cm alike — but on the way here it was the thing holding the liar's cliff
 * together on its own (unrationed, a limb turned 177.6° in one frame and the
 * body never came to rest), and a budget that costs nothing and bounds how fast
 * a floor this file has been lied to about can move a body is worth having when
 * the next provider is wrong in a way nobody has thought of yet.
 */
const PROJECT_LIFT_SLACK = 0.04;
/**
 * How upright a floor's normal has to be before it is used as one at all.
 *
 * A height query cannot describe a surface past vertical, so a provider that
 * differences its own heights reports a step edge as a face lying nearly flat on
 * its side — and both the projection and the friction then work along the
 * ground instead of across it. The steepest thing in this spot that IS a floor
 * is the quarter pipe at its lip, whose analytic normal reads 0.19; anything
 * under this is a differencing artefact and gets treated as flat.
 */
const FLOOR_NORMAL_MIN = 0.12;

/**
 * Which way a wall face can point. Axis-aligned on purpose: every solid in the
 * spot is a box with a yaw, and the two ledges that ARE yawed are 0.4 m tall —
 * a body meets their top, not their face.
 */
const WALL_OUT: readonly THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];
/**
 * How far out to look for that face, m — cheapest rung first, and the search
 * stops the moment a nearer way out has been found on another axis.
 *
 * `blocked` is a predicate with no normal in it, so the only way to learn which
 * way a wall faces is to step off it and see which step got out. Six tenths of
 * a metre is more than a substep of travel at any speed the ride reaches, and
 * the first five rungs are that: a body against a face.
 *
 * The coarse rungs after them are for a body that is not against a face at all
 * but INSIDE the block, which is a state the ride should never hand over and
 * does — measured, a bail seeded 3 m inside the north building slid nine metres
 * through it and came to rest 12 m in, because the search gave up past 0.6 m and
 * "leave the body alone" means leave it there. Walking on out to five metres
 * costs nothing in the case that matters (the first rung that clears ends the
 * search, and a body against a wall clears on the first) and turns "asleep
 * inside a building" into "crawls out of it and lands on the street". It also
 * stops the tearing that used to end it: he reached the FAR face of a 12 m
 * block and was ejected out of it, 180.0° of bone in one frame.
 */
const WALL_PROBE: readonly number[] = [0.03, 0.07, 0.15, 0.3, 0.6, 1.2, 2.4, 4.8];
/** Halvings that turn the rung into the face itself. Three of 3 cm is 4 mm. */
const WALL_BISECT = 3;
/**
 * How high the probe looks for its way out, above the particle. Metres.
 *
 * `blocked` is "some top here is above you", which is true of a wall and equally
 * true of a step — and a body wedged where two solids meet has to be able to
 * leave over the low one. Measured on the real spot: a toe finished 13 cm under
 * the quarter-pipe deck in the 9 cm sliver where the deck's footprint ends and
 * the north building's begins. Every horizontal way out was "blocked": into the
 * brick one way, under the deck's own top face the other, for further than the
 * probe can see. Nothing was wrong except that the deck is a FLOOR 13 cm up.
 *
 * Fifteen centimetres is chosen against both neighbours and not by taste: it is
 * under the 0.40 m of the shortest ledge in the spot, so a real ledge face still
 * stops a body dead instead of becoming a ramp; and it is under `FLOOR_RISE_MAX`,
 * so anything the probe steps him over, the floor is then allowed to stand him
 * on.
 */
const WALL_STEP_UP = 0.15;
/**
 * How far one SUBSTEP may push a particle back out of a wall, m — the same
 * ration the floor gets per pass, for the same reason. A body driven into brick
 * at 18 m/s is 10 cm in after one substep, so this is a body climbing out of a
 * wall at walking pace over two or three of them rather than being teleported
 * out with the bones in tow.
 */
const WALL_MAX_STEP = 0.08;
/**
 * …and the ration UNDER that ceiling: how far a wall may push a particle out
 * beyond what the particle drove itself in with this substep, m.
 *
 * The floor has had this since round 4 (`liftRoom`) and the wall never did, and
 * the difference is a body that will not lie down. A limb the skeleton holds
 * INSIDE a solid — an arm across a bench, a toe under a deck — is a constraint
 * with no solution: the wall pushes it out, the bones pull it back, and with the
 * ceiling as the only bound each of those is worth 8 cm. Measured on an open-
 * plaza bail at 14 m/s that ends against a prop, a forearm ping-ponged **19 mm
 * every substep at a dead-steady 0.78 m/s for the whole four seconds of
 * `MAX_SIM`** — invisible between two drawn frames, and enough to spend `calm`
 * forever, so `settled` never came true and the player waited out the valve.
 *
 * A particle can only be as far inside a wall as it drove itself: `v · h` along
 * the face normal, 10 cm for a body arriving at 18 m/s and a fifth of a
 * millimetre for one lying still. So that is what it gets back, plus this, which
 * is the give in a relaxation pass rather than in the physics — and, for a limb
 * that is genuinely buried with no speed to its name, the pace it crawls out at:
 * 5 mm a substep is 0.9 m/s, which is the walking pace `WALL_MAX_STEP` was
 * already aiming for and never enforced.
 */
const WALL_STEP_SLACK = 0.005;
/**
 * Passes on the BONES ALONE that close the substep.
 *
 * One is not enough, and the reason is worth writing down: inside the
 * relaxation loop the floor, the wall and the joint limits are all re-injecting
 * their corrections every pass, so the loop does not converge on a hard frame —
 * traced pass by pass on a bail into the loading-dock face, the link error read
 * 90 mm after the limits, 20 mm after the links, 90 mm after the projection,
 * ten times over, and one closing pass left 25 mm of it in a 129 mm hip bone.
 * Whatever runs last is what the write-back sees, and the bones have to be it
 * for long enough to actually finish: measured across the whole street table at
 * three frame rates, the worst bone in any bail goes 51 mm at one pass → 15 at
 * two → 8.5 at four → 4.2 at eight → 0.97 at sixteen → 0.22 at twenty-four.
 * Twenty-three links twenty-four times is nothing next to a bone that stretches.
 */
const FINAL_BONE_PASSES = 24;

// ---------------------------------------------------------------------------
// The body, as the code names it
// ---------------------------------------------------------------------------

/** What hit the floor. The audio picks a sample off this; the camera picks a shake. */
export type RagdollPart = "head" | "torso" | "hips" | "arm" | "hand" | "leg" | "foot";

export interface RagdollImpact {
  part: RagdollPart;
  /** Closing speed ALONG THE SURFACE NORMAL, m/s — how hard, not how fast. */
  speed: number;
  /** Where it happened, world space. */
  readonly point: THREE.Vector3;
  /** What he hit. Concrete and grass are not the same sound. */
  surface: SurfaceKind;
}

export interface RagdollOptions {
  /**
   * The skater's skeleton root — anything with the bones under it. The bones are
   * found from the first SkinnedMesh's skeleton, so this can be the rig holder.
   */
  root: THREE.Object3D;
  /** The floor he lands on. Sampled with each particle's own y as the hint. */
  surface: SurfaceProvider;
  /** Fired the frame a body part first touches down hard enough to hear. */
  onImpact?: (impact: RagdollImpact) => void;
  /**
   * The node the deck's meshes hang under, so the board can fall with him.
   *
   * Optional, and it is optional in the honest sense rather than the lazy one:
   * left out, `findBoard` looks for it in the rig's own graph and finds it on
   * this game's rig (see that function for exactly what it will and will not
   * accept). Passing it explicitly is better where the caller knows — it is one
   * node reference and it removes a search that can decline.
   */
  board?: THREE.Object3D | null;
  /**
   * The get-up take: lying on the ground to standing, on this skeleton.
   *
   * **Left out, the fall loads its own** — `src/skate/fall/get-up-take.ts`, the
   * generation DESIGN.md's asset table records for this lane. That default is the
   * whole point of the field being optional: round one made it a slot only a
   * caller could fill, `main.ts` did not fill it, and every bail in the shipped
   * game ran the cross-fade while the harness reported green.
   *
   * The three values mean three different things and none of them is a shrug:
   *   · **absent** — load the take this lane owns. What the game does.
   *   · a clip  — play that one instead. What the harness does, so a row can be
   *     run against a take of its choosing without a network in the room.
   *   · **null** — no take at all, the plain cross-fade. Also the harness's, on
   *     the named rows that measure the fallback itself.
   */
  getUp?: THREE.AnimationClip | null;
}

/**
 * The handle the model holds, plus the two things the shared contract could not
 * know about: the per-frame bone history that makes a fall carry his motion, and
 * the impact report the audio and the camera read.
 */
export interface Ragdoll extends RagdollHandle {
  /**
   * Call EVERY frame while he is still skating, after the animation layer has
   * posed the skeleton. It costs 24 matrix reads and it is the difference
   * between a fall that carries his speed and spin, and a mannequin being
   * dropped. A no-op while the ragdoll is running.
   */
  observe(dt: number): void;
  /** True while the bones still belong to physics — including the blend back out. */
  readonly running: boolean;
  /** The most recent contact worth hearing, or null. */
  readonly lastImpact: RagdollImpact | null;
  /** …and the hardest one of this fall, which is the one the camera wants. */
  readonly hardestImpact: RagdollImpact | null;
  /** Swap when the world does. Takes effect on the next bail. */
  surface: SurfaceProvider;
  /**
   * He is standing back up — the body has been let go of and the get-up is
   * playing. `running` is still true through this, because the bones and the
   * deck are still ours.
   */
  readonly rising: boolean;
  /**
   * Hand in the get-up take once it has downloaded. Ignored mid-stand-up; the
   * next bail uses it.
   */
  setGetUpClip(clip: THREE.AnimationClip | null): void;
  /** Whether one is loaded — false means the stand-up is the plain cross-fade. */
  readonly hasGetUpClip: boolean;
}

type BoneRole =
  | "hips"
  | "spine"
  | "neck"
  | "head"
  | "headTip"
  | "shoulder"
  | "upperArm"
  | "foreArm"
  | "hand"
  | "thigh"
  | "shin"
  | "foot"
  | "toe"
  | "skip";

const PART: Record<Exclude<BoneRole, "skip">, RagdollPart> = {
  hips: "hips",
  spine: "torso",
  shoulder: "torso",
  neck: "head",
  head: "head",
  headTip: "head",
  upperArm: "arm",
  foreArm: "arm",
  hand: "hand",
  thigh: "leg",
  shin: "leg",
  foot: "foot",
  toe: "foot",
};

/** Collision radius per role, metres — the particle sits at a joint, not a surface. */
const RADIUS: Record<Exclude<BoneRole, "skip">, number> = {
  hips: 0.13,
  spine: 0.13,
  shoulder: 0.09,
  neck: 0.07,
  head: 0.11,
  headTip: 0.07,
  upperArm: 0.06,
  foreArm: 0.055,
  hand: 0.05,
  thigh: 0.08,
  shin: 0.07,
  foot: 0.06,
  toe: 0.05,
};

/**
 * How THICK he is, per bone, in metres — the flesh on the line a bone draws.
 *
 * This is a second radius table and it is not a duplicate of the one above.
 * `RADIUS` is how far a JOINT sits from the floor, and it is deliberately small
 * so a body lies on the concrete instead of hovering a hand's width over it. How
 * far two limbs keep apart is a different question with a different answer: an
 * ankle joint is 6 cm above the sole and a shin in this game's jeans is 14 cm
 * wide, and a body built out of the first number can put a whole leg through
 * itself while every particle stays a legal distance from every other.
 *
 * Which is exactly what it did. Measured on the real rig in
 * `tools/ragdoll-drop.mjs`, against the character's OWN skin rather than
 * against this table: at rest, on every case in the LOOK set, his two shins
 * overlapped by 12 to 23 cm — the legs occupying the same space, held there,
 * for the whole second the player looks at the body before he gets up. That is
 * the "breaks apart" in the report: nothing separates, the length of every bone
 * is right to a hundredth of a millimetre, and the parts pass through each
 * other.
 *
 * The numbers are the character's own, at the 70th percentile of the distance
 * from each bone's line to the vertices the skin gives that bone outright
 * (printed by the harness at the top of every run). They are a floor, not a
 * target — see `captureRest`, which clamps every pair to the clearance THE POSE
 * HE BAILED IN already had, so a stance standing with its knees together does
 * not blow itself apart on the first frame.
 */
const SELF_RADIUS: Record<Exclude<BoneRole, "skip">, number> = {
  hips: 0.15,
  spine: 0.14,
  shoulder: 0.06,
  neck: 0.04,
  head: 0.08,
  headTip: 0.05,
  upperArm: 0.075,
  foreArm: 0.055,
  hand: 0.045,
  thigh: 0.115,
  shin: 0.13,
  foot: 0.07,
  toe: 0.05,
};
/**
 * How much of a self-intersection is taken back per relaxation pass.
 *
 * Partial, like every other correction in this file: ten passes converge on it
 * and a full correction in one pass is a body that pops rather than settles.
 */
const VOLUME_STIFFNESS = 0.5;
/**
 * …and the most one pass may move a limb out of another, m.
 *
 * The same ration the floor and the wall get (`PROJECT_MAX_LIFT`,
 * `WALL_MAX_STEP`), for the same reason: a correction with no ceiling is a
 * correction that can throw a body, and `capSpeed` only bounds what the whole
 * substep did. Two centimetres a pass is 20 cm a substep at the very worst,
 * which no honest overlap ever reaches.
 */
const VOLUME_MAX_PUSH = 0.02;
/**
 * Pairs closer than this at the bail are not tested at all, m.
 *
 * Below a centimetre of clearance the two lines are effectively the same line —
 * a collarbone and the neck beside it — and a separation constraint on them is
 * a coin toss about which way "apart" is. They are held by the braces already.
 */
const VOLUME_MIN_GAP = 0.01;

/** Inverse mass — how far a constraint is allowed to move this one. Torso is heavy. */
const INV_MASS: Record<Exclude<BoneRole, "skip">, number> = {
  hips: 0.6,
  spine: 0.7,
  shoulder: 1,
  neck: 1,
  head: 0.9,
  headTip: 1.4,
  upperArm: 1.2,
  foreArm: 1.5,
  hand: 2,
  thigh: 0.9,
  shin: 1.2,
  foot: 1.6,
  toe: 2.2,
};

const DEG = Math.PI / 180;

/**
 * How a joint is allowed to move.
 *
 * Every one of these is measured against THE POSE HE BAILED IN, never against
 * an anatomical neutral this file would have to guess at. That is not a
 * shortcut, it is the only version that works: a skater's ankle sits about 90°
 * to his shin and his collarbone about 90° to his spine, so a limit written
 * against a T-pose is already violated the frame it is captured — measured, it
 * yanked the foot 54° and the shoulder 47° in the FIRST frame of every fall.
 * Relative limits start at zero violation by construction, which is also what
 * makes the entry seamless.
 *
 * `hinge` is the one that stops a knee bending backwards: a signed bend angle
 * about an axis taken from the way the joint is already folded. `chain` is a
 * cone around where the bone was pointing, carried along by the bone above it.
 * `frame` is the same cone for a limb hanging off the pelvis or the ribcage,
 * where the "bone above" is a hip stub a few centimetres long whose direction
 * means nothing.
 */
type Limit =
  | {
      kind: "hinge";
      axis: THREE.Vector3;
      hyper: number;
      flex: number;
      /**
       * The other axis of a hinge: how far the outgoing bone may leave the hinge
       * PLANE, as a signed band around where the BIND POSE rests it (`abdRest`).
       *
       * This is the stop that was missing, and its absence is why the in-plane one
       * could be punched through. `signedAngle` projects both bone directions onto
       * the plane before measuring the fold — so once a shin has swung far enough
       * out of that plane, both projections are tiny, the fold reads as nothing
       * whatever the leg is really doing, and the hyperextension stop quietly stops
       * acting at all. Measured across 300 bails at five frame rates with only the
       * in-plane stop: the knee left the plane by up to **93.8°** and then folded to
       * **177.1° PAST STRAIGHT** — a leg bent fully backwards — with the in-plane
       * stop reporting no violation. `ragdoll-drop`'s `bend` column read 5.1° on the
       * same build and `integration-check` says why on the line beside its own:
       * *"a 150° hinge limit bounds the in-plane component only, so this bar is
       * loose on purpose"*.
       */
      abdRest: number;
      abdLo: number;
      abdHi: number;
      /**
       * …and where in that band the bail actually left it, as a raw `asin(w · axis)`
       * rather than a deviation. `rollFromHinge` aims the parent's roll at THIS and
       * not at `abdRest`, which is what makes the entry frame an exact identity.
       */
      abdHold: number;
    }
  | { kind: "chain"; ref: THREE.Vector3; max: number }
  | { kind: "frame"; frame: "pelvis" | "chest"; ref: THREE.Vector3; max: number };

/**
 * The limit each role gets, keyed on the bone whose OWN direction is constrained.
 *
 * **THE TWO HALVES OF THIS TABLE ARE MEASURED AGAINST DIFFERENT REFERENCES**, and
 * that is the whole reason it is one table with a long comment instead of two
 * short ones.
 *
 * · `kind` / `a` / `b` — the SWING, against THE POSE HE BAILED IN, for the reason
 *   the `Limit` doc above gives: a cone written against an assumed neutral is
 *   already violated on the capture frame and yanks the joint 54° in the entry
 *   frame. A hinge is the exception that proves it — `a`/`b` are measured about
 *   an axis, and the fold angle that axis measures is ZERO AT STRAIGHT whatever
 *   pose he bailed in, so `a` really is degrees of hyperextension.
 *
 * · `abd` / `axial` — the two degrees of freedom a swing cone cannot see, against
 *   **THE RIG'S OWN BIND POSE**, read off `Skeleton.boneInverses` (see
 *   `readBind`). They have to be, because there is no other frame in which they
 *   mean anything anatomical: "the shin has rolled 90° about the shin" is a
 *   statement about a leg, not about a bail. Meshy, Mixamo and VRM rigs do not
 *   share a rest frame — same bone names, different skeleton — so every one of
 *   these is applied against the axes THIS skeleton's own bind matrices give,
 *   never against an assumed T-pose or an assumed axis convention. And because a
 *   riding stance is not a bind pose, each one is WIDENED at the bail to admit
 *   the pose he actually bailed in (`captureRest`), so entry violation is zero by
 *   construction the same way the swing cones' is.
 *
 *   · `abd` is the hinge's other axis: how far the outgoing bone may leave the
 *     hinge PLANE. A knee bending sideways. The swing limit above cannot see it
 *     at all — `signedAngle` projects both directions onto the plane, so a shin
 *     swung 80° out of it reads the same in-plane fold as one still in it.
 *     Measured on this rig across 300 bails at
 *     five frame rates: unguarded, the knee left the plane by up to **93.8°** and
 *     the elbow by **89.1°**, on 30–38% of every frame of every fall.
 *   · `axial` is the roll about the bone's OWN long axis, relative to the bind
 *     pose, and it is the one number in this file that NOTHING in the particle
 *     cloud constrains: a shin, a thigh, a forearm, an upper arm and a collarbone
 *     each have exactly one child, so their roll is not observable from the
 *     particles and `rollFrom` carries it by continuity instead. Continuity has
 *     no anchor — it drifts — and a forearm spinning about its own length is what
 *     that drift looks like. Measured unguarded, off the bind pose:
 *     **179.9° of forearm, 179.9° of shin, 180.0° of ankle, 179.9° of hip and
 *     179.7° of spine** — with 21% of all joint frames outside a body's range.
 *
 *   The numbers are a real body's range and not a generous one. Knee: 15° of
 *   tibial rotation (it is only available at all with the knee flexed) and 8° of
 *   varus/valgus, which on a loaded knee is ligament rather than joint. Elbow:
 *   the 90° is PRONATION, which on a one-bone forearm rig is the only place the
 *   radius rolling over the ulna can live; 10° of carrying-angle play. Hip 50°,
 *   shoulder 95°, ankle 25° of inversion/eversion, each spine segment 35°, the
 *   neck 55°, the skull 30° on top of it.
 */
const LIMITS: Partial<
  Record<BoneRole, { kind: "hinge" | "chain" | "frame"; a: number; b?: number; abd?: number; axial?: number }>
> =
  {
    // knee, elbow: hinge, with a few degrees of hyperextension so a hard landing
    // reads as a leg snapping straight rather than a leg hitting a wall.
    shin: { kind: "hinge", a: 5 * DEG, b: 150 * DEG, abd: 8 * DEG, axial: 15 * DEG },
    foreArm: { kind: "hinge", a: 5 * DEG, b: 150 * DEG, abd: 10 * DEG, axial: 90 * DEG },
    // ball joints, swung against the body rather than the stub above them
    thigh: { kind: "frame", a: 85 * DEG, axial: 50 * DEG },
    upperArm: { kind: "frame", a: 100 * DEG, axial: 95 * DEG },
    // The collarbone barely moves on a real body, and it is where the arm hangs
    // from — left free, the arm particle orbits a 13.8 cm lever and takes the
    // whole limb across the chest at 148° a frame.
    // …and its `axial` is 45° rather than the 20° a collarbone really has, because
    // a stop tighter than the rig's own animation is not a stop, it is a second
    // animator. Measured with `tools/joint-range.mjs`'s clip sweep: the get-up take
    // and the rolling stance roll this rig's collarbones **39° and 35°** about
    // their own length. At 20° the guard held the pose down for the length of the
    // hand-back and the shoulders then sprang to their authored value the frame the
    // physics weight reached zero — a pop caused by the guard. 45° contains the
    // rig's content and still bounds the drift, which was **151°** unguarded.
    shoulder: { kind: "chain", a: 25 * DEG, axial: 45 * DEG },
    // …and the skull is carried against the RIBCAGE, not against the neck: the
    // neck is an 8.6 cm bone, and a cone hung off its direction inherits every
    // bit of noise in it. Both of these are a real neck's range rather than a
    // generous one, because the head group is what does the remaining whipping
    // in the drop table: at 65°/32° the skull turned up to 66° in a single frame
    // on the ledge drop, at 45°/32° it turns 57.8° at the worst and 34.0°
    // typically, and it still lolls — a settled body is never found looking
    // straight ahead.
    //
    // Those two numbers are the standing collapse in `tools/ragdoll-drop.mjs`,
    // re-measured. They had drifted to 60.1°/40.0° and are back where the line
    // above says they are, because they were never a limits problem: the bone
    // stretch and the roll below were what moved them. Tightening the cone was
    // tried and is worse, not better — on the same table the 540 bail's worst
    // world turn goes 70.2° at 45°, 82.4° at 38°, 98.9° at 32°, because a
    // tighter cone is violated harder and takes a bigger correction to answer.
    head: { kind: "frame", a: 45 * DEG, axial: 30 * DEG },
    // everything else swings against the bone it hangs off
    foot: { kind: "chain", a: 55 * DEG, axial: 25 * DEG },
    spine: { kind: "chain", a: 38 * DEG, axial: 35 * DEG },
    neck: { kind: "chain", a: 32 * DEG, axial: 55 * DEG },
    // A toe has no cone — it is 6 cm of bone hanging off a foot and a limit on
    // where it points fights the floor for nothing anyone can see. Its ROLL is a
    // different matter: `rollFrom` carries it like every other single-child bone
    // and it drifts like every other one, and a sole facing sideways off an ankle
    // that has not moved is the same defect as a forearm doing it.
    toe: { kind: "chain", a: 180 * DEG, axial: 25 * DEG },
  };

/**
 * Read-only view of the envelope above, for `tools/joint-range.mjs`.
 *
 * The harness derives every joint FRAME itself, off the skeleton's own bind
 * matrices, and deliberately does not borrow the solver's — marking the solver's
 * homework with its own answer sheet is the mistake `ragdoll-drop`'s `skinRadii`
 * comment already records paying for once. What it does borrow is the NUMBERS,
 * because a pass mark that can drift from the thing it grades is not a pass mark.
 */
export const JOINT_LIMITS: Readonly<typeof LIMITS> = LIMITS;
/** …and the role a bone name lands in, for the same reason. */
export { classify as classifyBone };

/**
 * How far outside its anatomical range the POSE HE BAILED IN is allowed to be
 * before the stop opens up to admit it, radians.
 *
 * Every stop in this file starts at zero violation on the capture frame, and the
 * two new ones have to as well or the entry snaps — which is the failure the
 * `Limit` doc above records paying for at 54° of foot and 47° of shoulder. So
 * `abd` and `axial` are opened per bail to whatever the capture pose reads plus
 * this, and only ever outward.
 *
 * Measured, and this is the number that says the envelope above is a real body's
 * range and not a shrug: **the rolling stance is inside every one of them
 * already, so this never fires on it.** The closest two are the knee's abduction
 * at 3.7–4.7° of the 8° allowed and the neck's roll at 30.4° of 55°; the knees
 * roll 2.6–2.8° of 15°, the ankles 8.4–10.3° of 25°, the elbows 9.0–9.7° of 90°
 * and 1.1–3.0° of the 10° of abduction. It is kept for the bail that does not
 * start from a rolling stance — out of a grab, off a rail, half way through a
 * flip — where the pose is the animation layer's and not this file's to predict.
 */
const ENTRY_SLACK = 2 * DEG;
/**
 * The bind fold a hinge needs before `u × w` is its axis rather than noise, as a
 * sine.
 *
 * A joint's hinge axis is `u × w` of its own bind-pose bone directions — except
 * that a shallow rest bend makes that cross product mostly about whatever ELSE is
 * in the rest pose. Measured on this rig: the knee rests at 11.3° of bend and its
 * `u × w` lands **22.9° away** from the body's own hip-to-hip line, which is the
 * A-pose's leg splay and not the knee. An axis that far off turns real flexion
 * into apparent abduction at sin(22.9°) of the swing — the rolling stance's 43° of
 * knee bend reads as **18.2° of the knee bending sideways** against `u × w` and
 * **0.1° against the lateral line** — so a stop built on it would be fighting
 * flexion for the whole fall. The elbow is the other way round: it rests at 29°
 * and reads 1.1–3.0° against `u × w` versus 8.4–14.0° against the lateral line.
 *
 * 20° (sin 0.34) is the threshold that lands each of the four hinges on the axis
 * its own two poses say it turns about. `tools/joint-range.mjs` derives the same
 * frames independently and prints which source each joint got.
 */
const HINGE_FOLD_MIN = 0.34;
/**
 * How far a bone's direction may have swung off its BIND direction before its roll
 * stops being a number worth clamping, radians — and the width the stop fades out
 * over on the way there.
 *
 * A roll is the residue left after a bone's rest direction has been carried onto
 * its current one by the minimal rotation, and that carry is **undefined when the
 * two are opposite**. Near the antipode it is defined but stiff: a small change in
 * where the bone points swings the roll a long way, and the reading can cross its
 * own ±π seam. Clamping THAT hands the band's two opposite ends to two consecutive
 * frames, and for a bone with a wide band that is most of a half turn of pose in
 * one picture. Measured, and it is the worst number this round produced:
 * `integration-check`'s bone-reversal line — which reads exactly this, a bone's
 * world quaternion between two DRAWN frames — went 41.9° → **129.2°** with the stop
 * ungated, on `60fps QP deck into the north building`.
 *
 * Two other cures were built and measured before this one, and both are worse:
 *
 * · **Unwrapping the reading against last frame's** turns the seam crossing into a
 *   long excursion which then clamps to a far edge: 129.2° → **157.0°**, and it
 *   took the bone stretch from 0.119 mm to 2.364 mm.
 * · **Accumulating the roll as a per-frame STEP** has no singularity at all, which
 *   is why it looked right — and a sum of per-frame twists is not the twist, it is
 *   the twist plus the holonomy of the path the bone's direction took. A limb that
 *   sweeps a large solid angle through a tumble accumulates the whole of it:
 *   `tools/joint-range.mjs`, which reads the ABSOLUTE roll off the bind pose and
 *   knows nothing about any sum, caught it immediately at **179.9° of thigh and
 *   178.9° of upper arm** — the original defect, laundered.
 *
 * So the reading stays absolute and the STOP is what fades. 150° with 25° of fade
 * costs nothing measurable: across 300 bails at five rates the widest swing off
 * bind any bone reaches is 154° and only the upper arms get past 140°, so the gate
 * is fully open for effectively the whole of every fall — and where it is not, the
 * roll is left to the continuity `rollFrom` was already choosing, which is what
 * this file did before the stop existed.
 */
const ROLL_TRUST = 150 * DEG;
const ROLL_FADE = 25 * DEG;

/** Which bone's rotation a `frame` limit is measured against. */
const FRAME_OF: Partial<Record<BoneRole, "pelvis" | "chest">> = {
  thigh: "pelvis",
  upperArm: "chest",
  head: "chest",
};

interface Limb {
  bone: THREE.Object3D;
  role: Exclude<BoneRole, "skip">;
  part: RagdollPart;
  /** Index of the parent limb, or -1 for the root. */
  parent: number;
  children: number[];
  radius: number;
  invMass: number;

  // the particle
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  /** True while it is resting on something — so one landing is one sound. */
  touching: boolean;
  /** The floor under it, sampled once per substep and reused by every pass. */
  floorY: number;
  floorN: THREE.Vector3;
  floorKind: SurfaceKind;
  /**
   * The lowest GROUND this particle has held since the bail — `pos.y` less its
   * own radius, kept as a running minimum. Every floor claim is judged against
   * this, and because it only ever falls, a body can never be walked upward one
   * plausible-looking step at a time.
   */
  floorRef: number;
  /** How far this substep's projection has already lifted it, m… */
  lifted: number;
  /** …and how far it is allowed to, given what it arrived with. */
  liftRoom: number;
  /**
   * …and how far the CONSTRAINTS have driven it this substep, m.
   *
   * The floor and the wall are both rationed to what a particle could honestly
   * have driven ITSELF into them with, which was the whole answer while the
   * only thing that moved a particle was its own velocity. The volume solver is
   * a second thing that can: measured on the fence bail with a park bench newly
   * in the slide path, ten passes of 2 cm a substep beat a wall allowed to give
   * back `drove + 5 mm`, and a head finished 38 cm inside the bench for three
   * frames. So a push in is booked here and the two solvers are allowed to take
   * exactly it back — a correction that can only ever undo another one, which
   * is the same shape as every other ration in this file.
   */
  pushIn: number;
  /**
   * …and the WALL beside it, found the same way and for the same reason: one
   * plane per substep, so every relaxation pass solves against the same shape.
   * Zero when nothing is in the way.
   */
  wallN: THREE.Vector3;
  /** Where that face is, as `pos · wallN` — the wall's own `floorY`. */
  wallLimit: number;
  /** Which of `WALL_OUT` it was, so the next substep looks there first. */
  wallDir: number;
  /** Speed it arrived with, BEFORE the constraints had a say. */
  vIn: THREE.Vector3;

  // captured at the bail
  /** World rotation the bone held at capture; every write-back is a delta on this. */
  restWorld: THREE.Quaternion;
  /** Local rotation at capture — a leaf bone keeps exactly this. */
  restLocal: THREE.Quaternion;
  /** The child this bone aims at. */
  aimA: number;
  /**
   * …and the pair of particles whose line resolves its TWIST about that aim,
   * or -1 if this bone has nothing to twist against.
   *
   * A pair, not a second child, because the baseline matters more than anything
   * else here: the chest read off spine→collarbone is 3.9 cm long, and a
   * centimetre of solver give in it swings the twist far enough to throw the
   * whole arm — 94° in one frame with the shoulder barely moving. Read off
   * collarbone→collarbone the same body is twice the baseline, and the pelvis
   * (hip→hip) is a third of a metre instead of 13 cm.
   */
  twistFrom: number;
  twistTo: number;
  /** Their world directions at capture. */
  dirA: THREE.Vector3;
  dirB: THREE.Vector3;
  /** Radians of limit correction this joint has left in this substep. */
  turnRoom: number;
  /** Direction from the parent to this joint at capture — the lever `lever` is read off. */
  upRest: THREE.Vector3;

  // --- the rig's own rest frame, read once off `Skeleton.boneInverses` ---------
  //
  // Everything above is captured at the bail. These four are captured at BUILD,
  // from the bind pose, and they are the only things in this file that are: a
  // twist and a sideways bend are statements about a leg, and a leg's neutral is
  // the rig's, not the bail's. See `readBind`.
  /**
   * The hinge axis in the PARENT's bind frame, or null where this bone is not a
   * hinge. A constant of this skeleton — carried into the world by whatever the
   * bone above it is doing, exactly the way the swing cones' references are.
   */
  hingeP: THREE.Vector3 | null;
  /** How far out of that plane the outgoing bone RESTS, so abduction reads 0 at bind. */
  abdRest: number;
  /** This bone's local rotation relative to its solver parent, in the bind pose. */
  bindLocal: THREE.Quaternion;
  /** True where the scene parent and the solver parent are the same node. */
  direct: boolean;
  /**
   * This bone's own long axis in its own frame, from CAPTURE rather than from
   * bind — `restWorld⁻¹ · dirA`, so it is exactly the axis the write-back's
   * correction turns about and the clamp can never chase its own tail. The roll
   * ZERO is still the bind pose and is exact whatever axis this is, because a
   * rotation measured from `bindLocal` to `bindLocal` is the identity.
   */
  longB: THREE.Vector3;
  /** The roll band about that axis, widened at the bail — see `ENTRY_SLACK`. */
  rollLo: number;
  rollHi: number;
  lever: number;
  limit: Limit | null;
  /** Delta from the captured world rotation to now — reused by the frame limits. */
  delta: THREE.Quaternion;
  /**
   * …and the delta it held at the last pose, which is what an UNOBSERVABLE roll
   * is carried from. See `rollFrom`. Written once a frame, in `writeBack`, so
   * every `deltaOf` inside a substep is still a pure function of the particles.
   */
  held: THREE.Quaternion;
  /** Where this particle stood when the substep began — the settle test reads it. */
  stepFrom: THREE.Vector3;
  /** …and the world rotation that comes out of it, so the blend can work in local space. */
  poseWorld: THREE.Quaternion;
  /** This bone's world scale, captured once — rotating it never changes it. */
  scale: THREE.Vector3;
}

interface Link {
  a: number;
  b: number;
  rest: number;
  /**
   * Unit direction a→b as the last substep left it — what `capTurn` measures
   * this substep's swing against. Links carry the bones' own swing; braces carry
   * the TWIST of the pelvis, the ribcage and the skull, which no link can see
   * (a bone's roll is read off a sibling pair, not off its parent).
   */
  ref: THREE.Vector3;
  /** The flesh on this bone, m — only links carry it, braces are not bones. */
  thick: number;
  /** Its midpoint and half-length as the substep began — the cheap reject. */
  mid: THREE.Vector3;
  half: number;
}

/** Two bones that are not allowed to occupy the same space. */
interface Volume {
  a: number;
  b: number;
  /** How far apart the two lines have to stay, m. */
  gap: number;
}

// scratch — a ragdoll runs every frame of a bail and allocates nothing
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _n = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _swingA = new THREE.Vector3();
const _swingB = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pc = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _world = new THREE.Vector3();
// …and the roll stop, which runs once per jointed bone per relaxation pass
/** How far `rollOf`'s last carry had to turn — see `ROLL_TRUST`. */
let rollSwing = 0;
const _rr = new THREE.Vector3();
const _rn = new THREE.Vector3();
const _rq = new THREE.Quaternion();
const _rq2 = new THREE.Quaternion();
const _rq3 = new THREE.Quaternion();
const _rq4 = new THREE.Quaternion();
const _rl = new THREE.Quaternion();
const _rl2 = new THREE.Quaternion();
// …and the segment-to-segment solve, which runs a couple of hundred times a pass
const _ca = new THREE.Vector3();
const _cb = new THREE.Vector3();
const _cd1 = new THREE.Vector3();
const _cd2 = new THREE.Vector3();
const _cr = new THREE.Vector3();

export function createRagdoll(options: RagdollOptions): Ragdoll {
  let limbs: Limb[] = [];
  /** The bones themselves… */
  let links: Link[] = [];
  /** …and the shape that keeps a pelvis from folding shut. */
  let braces: Link[] = [];
  /** …and which of those bones are not allowed inside each other. */
  let volumes: Volume[] = [];
  /** Parents before children, so a write-back can read a fresh parent matrix. */
  let order: number[] = [];
  let hipsIndex = -1;
  let chestIndex = -1;
  let built = false;
  let warned = false;
  /** The skin's own skeleton — `boneInverses` is where the bind pose lives. */
  let skeleton: THREE.Skeleton | null = null;
  /** …read once, on the first bail, because it cannot change after that. */
  let bindRead = false;
  /**
   * The whole skeleton, including the fingers and face markers the solver
   * skips — the get-up has to capture and restore every bone its clip touches,
   * not only the ones physics owns.
   */
  let allBones: THREE.Object3D[] = [];
  /** The bones as the DECK sees them: a line and the flesh on it. */
  let segments: BodySegment[] = [];
  let board: BoardFall | null = null;
  let getUp: GetUp | null = null;
  let getUpClip: THREE.AnimationClip | null = options.getUp ?? null;
  /**
   * True until somebody hands a take in — the flag that keeps the download this
   * lane starts for itself from overwriting one a caller chose.
   *
   * The download is started HERE, at construction, rather than at the first bail:
   * 60 kB fetched while he is still rolling is 60 kB that has landed by the time
   * he needs it, and a stand-up is not the moment to start waiting for a network.
   */
  let takeIsOurs = options.getUp === undefined;
  if (takeIsOurs) {
    void loadGetUpTake().then((clip) => {
      if (!takeIsOurs || !clip) return;
      getUpClip = clip;
      getUp?.setClip(clip);
    });
  }

  // bone history, for seeding
  const seen: THREE.Vector3[] = [];
  const velA: THREE.Vector3[] = [];
  const velB: THREE.Vector3[] = [];
  let observedAge = Infinity;
  let observations = 0;

  /** The particles are moving. Goes false the moment he has come to rest… */
  let simulating = false;
  /** …but the POSE is still ours until the blend back out has finished. */
  let posed = false;
  let releasing = false;
  let elapsed = 0;
  let calm = 0;
  let leftover = 0;
  /** 1 while physics owns the bones, ramping to 0 across `release()`. */
  let weight = 0;

  const hips = new THREE.Vector3();
  const sample: SurfaceSample = makeSample();
  /**
   * The floor the body PROVED was under it, by standing on it at the bail — the
   * lowest bone it had, less a shoe. No surface query is involved, which is
   * exactly what makes it usable as the fallback when the queries are the thing
   * that is wrong.
   *
   * It assumes he was ON the ground when he bailed, which he is whenever he was
   * rolling. Bail out of the air into a world where EVERY query lies and he
   * comes to rest on the height he bailed at instead of the ground — measured at
   * 1.21 m in the harness's total-liar case. That is the honest floor of what
   * can be known with no truthful query anywhere, and it is bounded, which
   * believing the query is not.
   */
  let bailFloor = 0;
  let lastImpact: RagdollImpact | null = null;
  let hardestImpact: RagdollImpact | null = null;

  const handle: Ragdoll = {
    hips,
    surface: options.surface,

    get running(): boolean {
      return posed;
    },
    /**
     * He has genuinely stopped moving — not "enough time has gone by".
     *
     * The model stands him up off this, so it has to be a fact about the body
     * rather than about the clock: it is exactly "the particles are no longer
     * being integrated", and the only things that stop the integration are the
     * average particle speed holding under `SETTLE_SPEED` for `SETTLE_HOLD`,
     * `release()`, and the `MAX_SIM` valve that exists so a body wedged
     * somewhere impossible can never leave the player watching it. Before a bail
     * and after a stand-up there is nothing moving either, which is the same
     * answer and the safe one.
     */
    get settled(): boolean {
      return !simulating;
    },
    get lastImpact(): RagdollImpact | null {
      return lastImpact;
    },
    get hardestImpact(): RagdollImpact | null {
      return hardestImpact;
    },
    get rising(): boolean {
      return releasing;
    },
    get hasGetUpClip(): boolean {
      return getUpClip !== null;
    },
    setGetUpClip(clip: THREE.AnimationClip | null): void {
      // A caller who says which take to play outranks the one this lane loads
      // for itself, whichever lands first.
      takeIsOurs = false;
      getUpClip = clip;
      getUp?.setClip(clip);
    },

    observe,
    start,
    update,
    release,
    cancel,
  };
  return handle;

  // -------------------------------------------------------------------------
  // finding the body
  // -------------------------------------------------------------------------

  /**
   * Reads the skeleton once, the first time it is needed — the rig streams in
   * well after boot, so this cannot happen in the constructor.
   *
   * Failure is NOT latched: a bail before the skater has loaded degrades to
   * "nothing to collapse" for that one fall, and the next one looks again
   * rather than deciding for the session that there is no body.
   */
  function build(): boolean {
    if (built) return true;
    skeleton = findSkeleton(options.root);
    const bones = findBones(options.root);
    if (bones.length === 0) {
      if (!warned) {
        console.warn("[ragdoll] no skeleton under the root — the bail stays a rig tip");
        warned = true;
      }
      return false;
    }

    const index = new Map<THREE.Object3D, number>();
    const roles: Exclude<BoneRole, "skip">[] = [];
    const kept: THREE.Object3D[] = [];
    for (const bone of bones) {
      const role = classify(bone.name);
      if (role === "skip") continue;
      index.set(bone, kept.length);
      kept.push(bone);
      roles.push(role);
    }
    // A leaf hanging off the head is a face marker, not another head — it is a
    // particle that gives the skull a twist to be solved against, nothing more.
    for (let i = 0; i < kept.length; i++) {
      if (roles[i] !== "head") continue;
      const parent = kept[i].parent;
      const pi = parent ? index.get(parent) : undefined;
      if (pi !== undefined && (roles[pi] === "head" || roles[pi] === "headTip")) {
        roles[i] = "headTip";
      }
    }

    limbs = kept.map((bone, i) => {
      const role = roles[i];
      return {
        bone,
        role,
        part: PART[role],
        parent: -1,
        children: [],
        radius: RADIUS[role],
        invMass: INV_MASS[role],
        pos: new THREE.Vector3(),
        prev: new THREE.Vector3(),
        touching: false,
        floorY: 0,
        floorN: new THREE.Vector3(0, 1, 0),
        floorKind: "concrete",
        floorRef: 0,
        lifted: 0,
        liftRoom: 0,
        pushIn: 0,
        wallN: new THREE.Vector3(),
        wallLimit: 0,
        wallDir: 0,
        vIn: new THREE.Vector3(),
        restWorld: new THREE.Quaternion(),
        restLocal: new THREE.Quaternion(),
        aimA: -1,
        twistFrom: -1,
        twistTo: -1,
        dirA: new THREE.Vector3(),
        dirB: new THREE.Vector3(),
        turnRoom: 0,
        upRest: new THREE.Vector3(),
        hingeP: null,
        abdRest: 0,
        bindLocal: new THREE.Quaternion(),
        direct: true,
        longB: new THREE.Vector3(0, 1, 0),
        rollLo: -Math.PI,
        rollHi: Math.PI,
        lever: 1,
        limit: null,
        delta: new THREE.Quaternion(),
        held: new THREE.Quaternion(),
        stepFrom: new THREE.Vector3(),
        poseWorld: new THREE.Quaternion(),
        scale: new THREE.Vector3(1, 1, 1),
      };
    });

    for (let i = 0; i < limbs.length; i++) {
      let p: THREE.Object3D | null = limbs[i].bone.parent;
      while (p && !index.has(p)) p = p.parent;
      const pi = p ? (index.get(p) ?? -1) : -1;
      limbs[i].parent = pi;
      if (pi >= 0) limbs[pi].children.push(i);
    }

    hipsIndex = limbs.findIndex((l) => l.parent < 0);
    if (hipsIndex < 0) return false;
    // The ribcage is the topmost spine bone — the one carrying the shoulders.
    chestIndex = limbs.findIndex(
      (l) => l.role === "spine" && l.children.some((c) => limbs[c].role !== "spine"),
    );
    if (chestIndex < 0) chestIndex = hipsIndex;

    order = [];
    const queue = [hipsIndex];
    while (queue.length > 0) {
      const i = queue.shift() as number;
      order.push(i);
      for (const c of limbs[i].children) queue.push(c);
    }

    for (const i of order) {
      seen[i] = new THREE.Vector3();
      velA[i] = new THREE.Vector3();
      velB[i] = new THREE.Vector3();
    }

    buildLinks();

    // The two things that ride along with the collapse: the deck he was
    // standing on, and the way back up off the floor. Both are resolved here,
    // once, for the same reason the skeleton is — the rig streams in long after
    // boot and none of it exists in the constructor.
    allBones = bones;
    // …and the rig's own rest frame, once. A bind pose cannot change, and this has
    // to be in hand before the FIRST bail rather than after it — read from
    // `captureRest` it would miss `makeLimit` by one fall.
    if (!bindRead) readBind(bones);
    getUp = new GetUp(options.root);
    getUp.setClip(getUpClip);
    const deck = options.board ?? findBoard(options.root);
    if (deck) board = new BoardFall(deck, handle.surface);
    else if (!warned) {
      console.warn("[ragdoll] no deck found beside the skater — the board will not fall with him");
      warned = true;
    }

    built = true;
    return true;
  }

  /**
   * Every bone is a hard link. On top of that the pelvis, the ribcage and the
   * skull get braced: without the sibling links a hip joint is a hinge with
   * nothing holding it, and the whole pelvis folds shut the first time he lands
   * on it.
   */
  function buildLinks(): void {
    links = [];
    braces = [];
    const blank = (a: number, b: number, thick: number): Link => ({
      a,
      b,
      rest: 0,
      ref: new THREE.Vector3(),
      thick,
      mid: new THREE.Vector3(),
      half: 0,
    });
    for (const i of order) {
      const p = limbs[i].parent;
      // A link IS the bone above it drawn toward this joint, so the flesh on it
      // is the PARENT's — the line from a thigh to a knee is a thigh.
      if (p >= 0) links.push(blank(p, i, SELF_RADIUS[limbs[p].role]));
    }
    for (const i of order) {
      const kids = limbs[i].children;
      for (let a = 0; a < kids.length; a++) {
        for (let b = a + 1; b < kids.length; b++) braces.push(blank(kids[a], kids[b], 0));
      }
      // A fan of children is rigid in itself but free to TWIST about the bone
      // below it — which is a chest that can wind 360° off its own hips. Bracing
      // the grandparent to each child is what locks that off.
      const gp = limbs[i].parent;
      if (kids.length >= 2 && gp >= 0) {
        for (const c of kids) braces.push(blank(gp, c, 0));
      }
    }
  }

  // -------------------------------------------------------------------------
  // watching him ride
  // -------------------------------------------------------------------------

  function observe(dt: number): void {
    if (simulating || dt <= 0) return;
    if (!build()) return;
    for (const i of order) {
      const e = limbs[i].bone.matrixWorld.elements;
      _world.set(e[12], e[13], e[14]);
      if (observations > 0) {
        velB[i].copy(velA[i]);
        velA[i].subVectors(_world, seen[i]).divideScalar(dt);
      }
      seen[i].copy(_world);
    }
    observations++;
    observedAge = 0;
  }

  // -------------------------------------------------------------------------
  // the fall
  // -------------------------------------------------------------------------

  function start(velocity: THREE.Vector3): void {
    if (!build()) {
      simulating = false;
      posed = false;
      releasing = false;
      weight = 0;
      return;
    }
    options.root.updateWorldMatrix(true, true);

    const fresh = observations >= 2 && observedAge <= OBSERVE_STALE;
    // Everything above the hips is thrown on, everything below is held back.
    // That is what a board catching is: his feet stop and he does not.
    const horiz = Math.hypot(velocity.x, velocity.z);
    const tripX = horiz > 0.5 ? velocity.x / horiz : 0;
    const tripZ = horiz > 0.5 ? velocity.z / horiz : 0;

    bailFloor = Infinity;
    for (const i of order) {
      const l = limbs[i];
      l.bone.getWorldPosition(l.pos);
      l.bone.getWorldQuaternion(l.restWorld);
      l.restLocal.copy(l.bone.quaternion);
      l.touching = false;
      l.delta.identity();
      l.held.identity();
      l.bone.matrixWorld.decompose(_v, _q, l.scale);
      if (l.pos.y < bailFloor) bailFloor = l.pos.y;
    }
    // He was standing on it a frame ago, so the floor is at or below his lowest
    // joint — one shoe's worth below it. This is the only ground height in the
    // file that costs no query, and it is what every implausible answer below
    // falls back to.
    bailFloor -= 0.05;
    hips.copy(limbs[hipsIndex].pos);

    for (const i of order) {
      const l = limbs[i];
      // A collision radius is a standoff, and a bone that is ALREADY resting on
      // the floor defines its own: a toe captured 3 cm up gets ejected 2 cm the
      // first frame if it keeps the nominal 5, and the ankle snaps to pay for
      // it. Measured at 29° of ankle in the entry frame before this clamp.
      const s = handle.surface.sample(l.pos.x, l.pos.z, l.pos.y + 0.05, sample);
      // He was standing on this a frame ago, so a floor ABOVE the bone is not
      // the floor — it is the thing he is beside. The old test allowed a claim
      // half a metre over the bone, which is exactly what a provider that
      // echoes the y-hint hands back, and it started every bail with the whole
      // skeleton already inside its own floor.
      const ground = s.height <= l.pos.y ? s.height : bailFloor;
      l.radius = Math.max(0.015, Math.min(RADIUS[l.role], l.pos.y - ground));
      l.floorY = ground + l.radius;
      l.floorRef = Math.min(ground, bailFloor);
      l.floorN.set(0, 1, 0);
      l.floorKind = s.kind;
    }

    for (const i of order) {
      const l = limbs[i];
      // Two frames averaged: one frame of bone history is a difference of two
      // animation samples, and a clip that scrubs unevenly puts a spike in it.
      if (fresh) _v.copy(velA[i]).add(velB[i]).multiplyScalar(0.5);
      else _v.copy(velocity);

      const lift = THREE.MathUtils.clamp((l.pos.y - hips.y) / TRIP_SPAN, -0.4, 1);
      _v.x += tripX * TRIP_GAIN * horiz * lift;
      _v.z += tripZ * TRIP_GAIN * horiz * lift;
      if (_v.lengthSq() > SEED_MAX * SEED_MAX) _v.setLength(SEED_MAX);

      l.prev.copy(l.pos).addScaledVector(_v, -SUBSTEP);
    }

    captureRest();

    // The deck leaves his feet with the speed he was carrying and the floor he
    // was demonstrably standing on — which is the one height in the fall that
    // costs no query and cannot be lied about.
    getUp?.cancel();
    board?.setSurface(handle.surface);
    board?.start(velocity, bailFloor);

    simulating = true;
    posed = true;
    releasing = false;
    weight = 1;
    elapsed = 0;
    calm = 0;
    leftover = 0;
    lastImpact = null;
    hardestImpact = null;
  }

  /**
   * THE RIG'S OWN REST FRAME, and the one thing in this file that does not come
   * from the pose he bailed in.
   *
   * Every swing limit here is relative to the capture pose for a good reason (see
   * `Limit`), and that reason does not extend to the two stops this function
   * feeds. "The shin has bent sideways" and "the forearm has rolled about its own
   * length" are statements about a LEG; they have no meaning against a bail, and a
   * band centred on a bail would let a fall keep whatever twist the animation
   * layer happened to hand over and then add its own on top. So they are centred
   * on the skeleton's own neutral, and the band is only ever OPENED to admit the
   * capture pose (`ENTRY_SLACK`), never moved.
   *
   * **Where the neutral comes from matters more than any number below.**
   * `Skeleton.boneInverses[i]` is `bone.matrixWorld` inverted as of the moment the
   * skin was bound, so its inverse is that bone's bind-pose world matrix — and it
   * is readable at any time, whatever the animation layer is currently doing.
   * That is the whole reason the rest frame is taken from there rather than from
   * "the scene before a clip runs": by the time a bail happens there is no such
   * moment left to read.
   *
   * Meshy, Mixamo and VRM rigs do not share a rest frame — same bone names, a
   * different skeleton — and this project has already had a set of raw clips fold
   * a new body in half over exactly that. So nothing here is assumed: not the fold
   * axis (measured, `u × w` or the lateral line, see `HINGE_FOLD_MIN`), not which
   * way round flexion goes (measured off the rig's own facing), and not which
   * local axis runs down a limb (measured toward the child the solver aims at).
   */
  function readBind(bones: THREE.Object3D[]): void {
    bindRead = true;
    if (!skeleton) return;
    const slot = new Map<THREE.Object3D, number>();
    for (let i = 0; i < bones.length; i++) slot.set(bones[i], i);
    const bq: THREE.Quaternion[] = [];
    const bp: THREE.Vector3[] = [];
    for (let i = 0; i < bones.length; i++) {
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      _m.copy(skeleton.boneInverses[i]).invert().decompose(p, q, _v);
      bp.push(p);
      bq.push(q);
    }
    const at = (l: Limb): number => slot.get(l.bone) ?? -1;

    // WHICH WAY THE RIG FACES, measured off its own soles: ankle → toe, flattened.
    // This project's rigs are documented to rest facing +Z and this rig answers
    // (0.01, 0.00, 1.00), but it is measured rather than trusted — a limit whose
    // sign came from a wrong guess about a rig's facing is a knee stopped on the
    // wrong side, which is worse than no limit at all.
    // `aimA` is not set until the first bail, and it does not need to be: which
    // child a bone aims at is a fact about the ROLES, not about a pose, so
    // `pickAxial` answers the same thing here as it will there.
    const aimOf = (l: Limb): number => (l.children.length > 0 ? pickAxial(l.children) : -1);
    const forward = new THREE.Vector3();
    let soles = 0;
    for (const i of order) {
      const l = limbs[i];
      const aim = aimOf(l);
      if (l.role !== "foot" || aim < 0) continue;
      const a = at(l);
      const b = at(limbs[aim]);
      if (a < 0 || b < 0) continue;
      forward.add(_v.subVectors(bp[b], bp[a]).setY(0).normalize());
      soles++;
    }
    if (soles > 0) forward.normalize();
    else forward.set(0, 0, 1);

    for (const i of order) {
      const l = limbs[i];
      const me = at(l);
      const pi = l.parent >= 0 ? at(limbs[l.parent]) : -1;
      l.direct = l.parent >= 0 && l.bone.parent === limbs[l.parent].bone;
      if (me < 0 || pi < 0) continue;
      l.bindLocal.copy(bq[pi]).invert().multiply(bq[me]);
      const spec = LIMITS[l.role];
      const aim = aimOf(l);
      if (!spec || spec.kind !== "hinge" || aim < 0) continue;
      const ci = at(limbs[aim]);
      if (ci < 0) continue;
      _u.subVectors(bp[me], bp[pi]).normalize();
      _w.subVectors(bp[ci], bp[me]).normalize();
      _axis.crossVectors(_u, _w);
      if (_axis.length() > HINGE_FOLD_MIN) _axis.normalize();
      else {
        // Too straight at rest to read a fold off — take the body's own lateral
        // line instead, which `u × forward` gives square to the bone above by
        // construction. See `HINGE_FOLD_MIN` for the measurement that decides.
        _axis.crossVectors(_u, forward);
        if (_axis.lengthSq() < 1e-8) _axis.set(1, 0, 0);
        _axis.normalize();
      }
      // …and which way round it is flexion, off the rig again: a knee's flexion
      // carries its ankle BACKWARD and an elbow's carries its hand FORWARD, and
      // the outgoing bone's rate for a positive turn about the axis is `axis × w`.
      const carries = _n.crossVectors(_axis, _w).dot(forward);
      const want = l.role === "foreArm" ? 1 : -1;
      if (carries * want < 0) _axis.negate();
      l.hingeP = _axis.clone().applyQuaternion(_q.copy(bq[pi]).invert());
      l.abdRest = Math.asin(THREE.MathUtils.clamp(_w.dot(_axis), -1, 1));
    }
  }

  /**
   * The roll of a bone about its OWN length, radians, measured off the rig's bind
   * pose — the one degree of freedom in this skeleton that NOTHING in the particle
   * cloud constrains.
   *
   * A collarbone, an upper arm, a forearm, a thigh, a shin, a foot, a neck and
   * every spine segment on this rig have exactly one child each, so their roll is
   * not observable from the particles at all and `rollFrom` picks it by continuity
   * instead. Continuity has no anchor: it only says "near last frame", so over a
   * tumble it walks. Measured across 300 bails at five rates, unguarded: **179.9°
   * of shin, 180.0° of ankle, 179.9° of forearm, 179.7° of hip and 179.7° of
   * spine** off the bind pose — a sole facing backwards off an ankle that has not
   * moved, which is exactly the defect the report names and which no measurement
   * built on bone DIRECTIONS can see, because a roll does not change where a bone
   * points.
   *
   * **The decomposition is the load-bearing part.** Splitting the local delta about
   * the bone's REST direction (`q = swing · twist`) goes singular as the swing
   * approaches a half turn, and a fall is full of limbs 100–165° off their rest —
   * that version reads hundreds of degrees of "roll" out of pure swing. This is
   * the other one: carry the rest frame along the bone's CURRENT direction by the
   * minimal rotation, which has no roll of its own, and the roll is the residue.
   * That is also precisely the quantity `rollFrom` chooses, which is what makes it
   * both the right anatomical reading and one a clamp can actually control.
   */
  function rollOf(l: Limb, from: THREE.Quaternion, local: THREE.Quaternion): number {
    _rr.copy(l.longB).applyQuaternion(from);
    _rn.copy(l.longB).applyQuaternion(local);
    _rq.setFromUnitVectors(_rr, _rn);
    // How far the carry had to turn — the caller needs it, because that is what
    // says whether the number below means anything. See `ROLL_TRUST`.
    rollSwing = 2 * Math.acos(Math.min(1, Math.abs(_rq.w)));
    _rq2.copy(local).multiply(_rq3.copy(from).invert()).multiply(_rq.invert());
    // `q` and `-q` are the same rotation and `atan2` needs one of them: without the
    // sign fix a bone rolled 10° reads as rolled 350° on about half the frames,
    // which would be the guard inventing the defect it is there to stop.
    const s = _rq2.w < 0 ? -1 : 1;
    const d = s * (_rq2.x * _rn.x + _rq2.y * _rn.y + _rq2.z * _rn.z);
    return 2 * Math.atan2(d, s * _rq2.w);
  }

  // A BONE WHOSE CHILD IS A HINGE HAS ITS ROLL OBSERVED BY THAT HINGE — TRIED,
  // MEASURED, REVERTED. Written down rather than deleted, because the idea is
  // sound and the next person to have it should have the numbers.
  //
  // The coupling is real: a knee's hinge PLANE is carried by the thigh, so the
  // thigh's roll — one of the unobserved ones `rollFrom` picks by continuity —
  // decides where that plane sits, while the shin's direction is pinned by three
  // particles. Continuity walks the plane off the shin, and the abduction stop is
  // then asked to drag a shin the particles are holding into a plane the thigh put
  // in the wrong place. Turned round it is free: spend the roll nothing observes on
  // putting the plane through the child, and the abduction reads whatever it read
  // at the bail for nothing. Real anatomy is this way round too — the plane your
  // forearm swings in IS how your humerus is rolled.
  //
  // It was built as an analytic solve (rolling by θ leaves the hinge axis's
  // component along the bone alone and turns the rest in a circle, so the child's
  // out-of-plane reading is `C + A·cos θ + B·sin θ` and θ comes out of one `acos`),
  // aimed at the bail's own reading so the entry frame stayed an exact identity,
  // and it worked: across 300 bails at five rates it took the knee's out-of-plane
  // from 19.2° to **13.1°**, and to **8.0°** — the whole allowance — with the roll
  // band lifted off the two bones that carry it.
  //
  // **It costs a 179.0° single-frame roll flip, and that is not a trade.** The solve
  // has two roots and picks the nearer, so when the continuity roll is diametrically
  // wrong the nearer root is still half a turn away and the arm rolls 180° between
  // two drawn pictures — `integration-check`'s bone-reversal line reads it directly
  // (a bone's world quaternion between drawn frames) and went 41.5° → 179.0°. There
  // is no fix for that inside the idea: bounding θ per frame is a rate limit on the
  // pose, which is the damping this project has rejected three times, and the two
  // roots cannot be made to merge. Lifting the roll band instead put the thighs and
  // upper arms back to **180.0°** of drift, which is the original defect.
  //
  // What replaced it is the plain thing: hold the plane with the abduction stop and
  // let the roll be continuity inside a band. The knee sits at 12.5–13.1° of
  // out-of-plane against the 8° allowed, and NOTHING reverses.

  /**
   * …and the stop on it, applied to a WORLD delta.
   *
   * It rotates the bone about its own length, so the bone's direction — everything
   * the particles actually said — comes out bit-for-bit unchanged, and so does
   * every joint POSITION: `writeBack` derives each bone's local position from the
   * particles through its parent's posed frame, so a parent rolled back to legal
   * hands its child the same world point by a different route. Nothing is damped,
   * filtered or blended; one unobservable number is held inside a body's range.
   *
   * Skipped where the roll IS observed — the pelvis reads its own off the hip line
   * (`twistFrom`/`twistTo`) — because overriding a measurement with a default is
   * how a guard starts inventing poses.
   */
  function clampRoll(l: Limb, out: THREE.Quaternion, dirWorld: THREE.Vector3): THREE.Quaternion {
    if (l.parent < 0 || l.twistTo >= 0 || l.rollHi >= Math.PI) return out;
    const p = limbs[l.parent];
    _rl2.copy(out).multiply(l.restWorld);
    _rl.copy(p.delta).multiply(p.restWorld).invert().multiply(_rl2);
    // Unwrapped onto the branch continuous with the pose already on screen — see
    // `ROLL_TRUST`, and the 129.2° flip that is what happens without it.
    const a = rollOf(l, l.bindLocal, _rl);
    const back = a < l.rollLo ? l.rollLo : a > l.rollHi ? l.rollHi : a;
    if (back === a) return out;
    // …and faded to nothing where the reading stops being trustworthy, which is the
    // difference between a stop and a flip. See `ROLL_TRUST`.
    const trust = THREE.MathUtils.clamp((ROLL_TRUST - rollSwing) / ROLL_FADE, 0, 1);
    if (trust <= 0) return out;
    return out.premultiply(_rq4.setFromAxisAngle(dirWorld, (back - a) * trust));
  }

  /** The pose the write-back is a delta on, plus every constraint's rest shape. */
  function captureRest(): void {
    for (const i of order) {
      const l = limbs[i];
      l.aimA = -1;
      l.twistFrom = -1;
      l.twistTo = -1;
      if (l.parent >= 0) {
        l.upRest.subVectors(l.pos, limbs[l.parent].pos);
        l.lever = THREE.MathUtils.clamp(
          JOINT_DAMP_LEN / Math.max(0.02, l.upRest.length()),
          0.35,
          JOINT_DAMP_MAX,
        );
        l.upRest.normalize();
      } else {
        l.upRest.set(0, 1, 0);
        l.lever = 1;
      }

      if (l.children.length > 0) {
        // Aim along the body's own line first: the spine continues into the
        // neck, not into a collarbone.
        l.aimA = pickAxial(l.children);
        l.dirA.subVectors(limbs[l.aimA].pos, l.pos).normalize();
        // …and resolve the twist across the widest line available: two children
        // standing off the aim axis if there are two, otherwise this bone to the
        // one that is. A child in line with the aim says nothing about twist.
        const off: number[] = [];
        for (const c of l.children) {
          if (c === l.aimA) continue;
          _v.subVectors(limbs[c].pos, l.pos).normalize();
          if (_v.cross(l.dirA).length() > 0.2) off.push(c);
        }
        if (off.length >= 2) {
          let widest = 0;
          for (let a = 0; a < off.length; a++) {
            for (let b = a + 1; b < off.length; b++) {
              const d = limbs[off[a]].pos.distanceTo(limbs[off[b]].pos);
              if (d > widest) {
                widest = d;
                l.twistFrom = off[a];
                l.twistTo = off[b];
              }
            }
          }
        } else if (off.length === 1) {
          l.twistFrom = i;
          l.twistTo = off[0];
        }
        if (l.twistTo >= 0) {
          // …and a line SHORTER than the bone whose roll it resolves is not an
          // observation, it is two particles with noise between them. The file
          // already moved this baseline once for exactly this reason (chest read
          // off spine→collarbone at 3.9 cm threw the arm 94° in a frame); the
          // rule is now written down instead of chosen per bone. On this rig it
          // leaves the PELVIS observed — the hip line is 18 cm against a 14.6 cm
          // spine bone, the one place in the skeleton with a baseline wider than
          // what it measures — and hands the chest (7.9 cm of collarbone against
          // a 10.5 cm neck bone) and the skull (10.2 cm of face marker against an
          // 18.5 cm head) to `rollFrom`, which carries their roll instead of
          // re-deriving it from noise every frame.
          _v.subVectors(limbs[l.twistTo].pos, limbs[l.twistFrom].pos);
          if (_v.length() < limbs[l.aimA].pos.distanceTo(l.pos)) {
            l.twistFrom = -1;
            l.twistTo = -1;
          } else {
            l.dirB.copy(_v).normalize();
          }
        }
      }
      l.limit = makeLimit(i);
    }

    // THE TWO STOPS THAT ARE NOT RELATIVE TO THE BAIL, opened just far enough to
    // admit the pose he bailed in. See `ENTRY_SLACK` — measured, the rolling stance
    // never needs it, and it is here for the bail that does not start from one.
    for (const i of order) {
      const l = limbs[i];
      const spec = LIMITS[l.role];
      l.rollLo = -Math.PI;
      l.rollHi = Math.PI;
      if (!spec || spec.axial === undefined || l.parent < 0 || l.aimA < 0) continue;
      // The bone's own length in its own frame, from the capture pose, so the
      // correction turns about exactly the axis the reading is taken about.
      l.longB.copy(l.dirA).applyQuaternion(_q.copy(l.restWorld).invert());
      _rl.copy(limbs[l.parent].restWorld).invert().multiply(l.restWorld);
      const roll = rollOf(l, l.bindLocal, _rl);
      l.rollLo = Math.min(-spec.axial, roll - ENTRY_SLACK);
      l.rollHi = Math.max(spec.axial, roll + ENTRY_SLACK);
      const lim = l.limit;
      if (!lim || lim.kind !== "hinge" || spec.abd === undefined) continue;
      // …and the hinge's other axis, read the same way: where the outgoing bone
      // sits relative to the plane the BIND pose rests it in.
      _w.subVectors(limbs[l.aimA].pos, l.pos).normalize();
      lim.abdHold = Math.asin(THREE.MathUtils.clamp(_w.dot(lim.axis), -1, 1));
      const abd = lim.abdHold - lim.abdRest;
      lim.abdLo = Math.min(-spec.abd, abd - ENTRY_SLACK);
      lim.abdHi = Math.max(spec.abd, abd + ENTRY_SLACK);
      // …and the in-plane pair, for the same reason: a bail out of a pose already
      // folded past 150° must not be answered with a yank on frame one.
      _u.subVectors(l.pos, limbs[l.parent].pos).normalize();
      const fold = signedAngle(_u, _w, lim.axis);
      lim.hyper = Math.max(lim.hyper, -fold + ENTRY_SLACK);
      lim.flex = Math.max(lim.flex, fold + ENTRY_SLACK);
    }

    for (const link of [...links, ...braces]) {
      link.rest = limbs[link.a].pos.distanceTo(limbs[link.b].pos);
      link.ref.subVectors(limbs[link.b].pos, limbs[link.a].pos).normalize();
    }

    // …and which bones are not allowed inside each other, with the clearance
    // measured against the pose he bailed in.
    //
    // Every limit in this file is relative to that pose and this is no
    // different, for the same two reasons: a riding stance already has his
    // thighs closer together than two thighs' worth of flesh, so an absolute
    // rule would blow the legs apart on the entry frame — the snap this file
    // exists to avoid — and a rule that starts at zero violation is one the
    // solver never has to fight on the way in. What it forbids is going DEEPER
    // than he already was, which is exactly what a limb passing through a limb
    // does and what a limb resting against one does not.
    //
    // Bones that share a joint are left out (they always touch, by
    // construction), and so is anything on the same chain — an elbow folding
    // the forearm onto the upper arm is a joint doing its job.
    // …and the same lines, handed to the deck so it has something to bounce off
    // that is not the floor. Live vectors: the particles ARE the body.
    segments = links.map((l) => ({ a: limbs[l.a].pos, b: limbs[l.b].pos, radius: l.thick }));

    volumes = [];
    for (let a = 0; a < links.length; a++) {
      for (let b = a + 1; b < links.length; b++) {
        const A = links[a];
        const B = links[b];
        if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue;
        if (onOneChain(A.a, B.a)) continue;
        const nominal = A.thick + B.thick;
        if (nominal <= 0) continue;
        const gap = Math.min(
          nominal,
          segmentGap(limbs[A.a].pos, limbs[A.b].pos, limbs[B.a].pos, limbs[B.b].pos),
        );
        if (gap < VOLUME_MIN_GAP) continue;
        volumes.push({ a, b, gap });
      }
    }
  }

  /** True if one of these two bones is an ancestor of the other, or the same. */
  function onOneChain(i: number, j: number): boolean {
    for (let k = i; k >= 0; k = limbs[k].parent) if (k === j) return true;
    for (let k = j; k >= 0; k = limbs[k].parent) if (k === i) return true;
    return false;
  }

  function pickAxial(children: number[]): number {
    const rank = (r: BoneRole): number =>
      r === "spine" || r === "neck" || r === "head" ? 0 : r === "headTip" ? 1 : 2;
    let best = children[0];
    for (const c of children) {
      if (rank(limbs[c].role) < rank(limbs[best].role)) best = c;
    }
    return best;
  }

  function makeLimit(i: number): Limit | null {
    const l = limbs[i];
    const spec = LIMITS[l.role];
    if (!spec || l.aimA < 0) return null;
    const dir = l.dirA;

    if (spec.kind === "frame") {
      const frame = FRAME_OF[l.role] ?? "pelvis";
      return { kind: "frame", frame, ref: dir.clone(), max: spec.a };
    }
    // …and a cone of half a turn is not a cone. The toe is in the table for its
    // `axial` alone (see there) and a swing limit on 6 cm of bone hanging off a
    // foot would only ever fight the floor.
    if (spec.a >= Math.PI) return null;
    if (spec.kind === "chain") {
      if (l.parent < 0) return null;
      return { kind: "chain", ref: dir.clone(), max: spec.a };
    }

    // hinge — the axis is THE RIG'S, carried into the world by whatever the bone
    // above it was doing at the bail (`readBind` measured it in that bone's own
    // bind frame, so this is the same carry every swing reference here gets).
    //
    // It was `upRest × dirA` — the way the joint happened to be folded at the
    // bail — and that is fine for the fold ANGLE, whose zero is straight whatever
    // axis you measure it about, and useless for the fold PLANE, which is the
    // thing `abd` needs and the bail cannot tell you: bail from a straight leg and
    // `u × w` is noise pointing anywhere. So the plane comes from the skeleton and
    // the angle is unchanged. Measured, the two agree to a few degrees on a
    // rolling stance's already-bent knee, which is why nothing about the existing
    // hyperextension behaviour moves.
    if (l.parent < 0) return null;
    if (l.hingeP) _axis.copy(l.hingeP).applyQuaternion(limbs[l.parent].restWorld).normalize();
    else {
      // No bind pose to read (a rig with no skin under it). Fall back to the way
      // the joint is folded right now, which is what this file did before.
      _u.copy(l.upRest);
      _axis.copy(_u).cross(dir);
      if (_axis.lengthSq() < 1e-6) {
        _axis.set(0, 1, 0).cross(_u);
        if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
      }
      _axis.normalize();
    }
    return {
      kind: "hinge",
      axis: _axis.clone(),
      hyper: spec.a,
      flex: spec.b ?? 150 * DEG,
      abdRest: l.abdRest,
      abdLo: -(spec.abd ?? Math.PI),
      abdHi: spec.abd ?? Math.PI,
      abdHold: l.abdRest,
    };
  }

  // -------------------------------------------------------------------------
  // stepping
  // -------------------------------------------------------------------------

  function update(dt: number): void {
    observedAge += dt;
    if (!posed) return;

    // The deck gets substeps for as long as IT is moving, which is not the same
    // clock as the body's — he slides to a halt in under a second while the
    // board is still going off a ledge. Tied to `simulating` alone, the deck
    // stopped dead in mid-air the frame he came to rest.
    if (simulating || (board?.moving ?? false)) {
      leftover += Math.min(dt, MAX_SUBSTEPS * SUBSTEP);
      let steps = 0;
      while (leftover >= SUBSTEP && steps < MAX_SUBSTEPS) {
        if (simulating) step(SUBSTEP);
        // The deck runs after the body has moved, so what it collides with is
        // where the limbs actually are this substep.
        board?.step(SUBSTEP, segments);
        leftover -= SUBSTEP;
        steps++;
        if (simulating) elapsed += SUBSTEP;
      }
      if (simulating) hips.copy(limbs[hipsIndex].pos);
      // Once he has stopped, stop integrating outright: a verlet body left
      // running against friction creeps, and a body creeping on the concrete
      // for the second before the reset is a body the player watches twitch.
      // The POSE stays ours — he lies there until someone stands him up.
      //
      // `MAX_SIM` is a valve, not a settle condition: it ends the tumble, and
      // because ending it is what makes `settled` true, the flag never claims a
      // body has stopped while it is still being thrown around.
      const rested = calm >= SETTLE_HOLD && elapsed > 0.25;
      if (rested || elapsed >= MAX_SIM) simulating = false;
    }

    if (releasing) {
      // The stand-up owns the pose from here: it plays the get-up take over the
      // skeleton and hands back the weight the COLLAPSED pose still has, which
      // is the only part of it physics can apply. Without a take it is the
      // cross-fade this file has always done, on the same timing.
      weight = getUp ? getUp.blend(dt) : Math.max(0, weight - dt / RELEASE_BLEND);
      // …and the deck is part of "still ours". Its return is longer than the
      // bones' handover, and dropping `posed` while it is half way home would
      // hand `followFeet` a board the fall is still holding — two writers, one
      // node, which is the bug this file's whole ordering exists to avoid.
      if (weight <= 0 && !(getUp?.running ?? false) && !(board?.held ?? false)) {
        weight = 0;
        releasing = false;
        posed = false;
        return; // the animation layer has the skeleton back, whole
      }
    }
    if (weight > 0) writeBack(weight);
    // …and the deck last of all, because `SkaterRig.followFeet` writes the pose
    // it WOULD be holding into the same node earlier in the frame and the fall
    // reads that as home.
    board?.pose(dt);
  }

  function step(h: number): void {
    const drag = Math.max(0, 1 - AIR_DRAG * h);
    const gravity = GRAVITY * h * h;
    const surface = handle.surface;

    // The ground the BODY is demonstrably standing on: the lowest floor any part
    // of him is actually in contact with, as the last substep left it.
    //
    // `floorRef` is per-particle and only ever falls, which is right for a roof
    // and wrong for a bank. A limb in the air over a rising slope keeps the
    // reference it had over the flat, so a quarter of the way up the loading
    // dock's bank its floor is refused as implausible — and `findWall` then reads
    // that refused floor as a vertical FACE and shoves the body back down the
    // slope. Measured: a bail sliding onto the bank at 11 m/s went 8.97 → 0.73 m/s
    // of hip speed in 50 ms with three particles reporting a wall normal of
    // (0, 0, −1), and came to rest 2.1 m from where it fell with 4% of its speed.
    // A skater who hits a bank rides UP it.
    //
    // Contact is the evidence, and it is the same evidence the per-particle rule
    // already trusts (`if (l.touching) l.floorRef = low`) — only shared across
    // one body instead of hoarded per limb. It cannot bootstrap a climb, because
    // a claim has to be BELIEVED before it can be stood on, and the liars in the
    // drop table answer every query above whatever ceiling they are asked from:
    // nothing ever touches, so nothing ever raises this.
    let stood = Infinity;
    for (const i of order) {
      const l = limbs[i];
      if (l.touching) stood = Math.min(stood, l.floorY - l.radius);
    }

    for (const i of order) {
      const l = limbs[i];
      // Where he stood before anything in this substep touched him. The settle
      // test is measured against THIS and not against the integration step,
      // because the integration step is not the only thing that moves a body:
      // a particle being ejected from a wall moves in `project`, which the old
      // sum never saw, so a rider still climbing out of the loading dock read as
      // motionless and `calm` declared him settled mid-brick. Everything that
      // moves him now counts — gravity, the links, the limits, the floor and the
      // wall — which is the only version of "he has stopped" that is a fact
      // about the body rather than about one term in it.
      l.stepFrom.copy(l.pos);
      _v.subVectors(l.pos, l.prev).multiplyScalar(drag);
      l.prev.copy(l.pos);
      l.pos.add(_v);
      l.pos.y -= gravity;
      l.vIn.copy(_v).divideScalar(h);

      // The ground this particle would be standing on if it were resting right
      // here, and then the reference everything below is judged against.
      //
      // Two rules, and both of them are the same sentence: the ground under him
      // is where he last STOOD, and while he is off it, it can only be lower.
      // · in contact, it is exactly where he is — he is demonstrably on it, so a
      //   body carried up a bank takes the bank's own rise with him. Left as a
      //   pure running minimum this is what fails: 25 cm up the manual pad's
      //   bump the allowance is spent, the pad's own top stops being believed,
      //   and the feet finish 5 cm under it.
      // · airborne, it only ever falls, which is the guard. A floor cannot be
      //   walked upward one plausible-looking step at a time, because nothing
      //   the world SAYS ever raises this — only landing on something does.
      // · and a position INSIDE solid matter is not evidence about the ground at
      //   all, so it is not allowed to lower it either. Measured on the real
      //   spot: a toe that passed through the north building came out with a
      //   memory of having been at 2.285 m in the middle of a wall, which put
      //   the quarter-pipe deck it was lying under 31 cm above its reference and
      //   therefore out of reach — the toe stayed 10 cm inside the deck, and the
      //   whole leg with it.
      const buried = surface.blocked(l.pos.x, l.pos.z, l.pos.y);
      const low = l.pos.y - l.radius;
      if (l.touching) l.floorRef = low;
      else if (low < l.floorRef && !buried) l.floorRef = low;

      // The highest a floor here could be and still be one: at or below the
      // particle, which no floor can lift him from, or within one step of the
      // lowest ground he has held. A wall query answering with the wall's roof
      // is rejected outright and he keeps falling toward the ground he was
      // actually over; the ceiling travels down with him, so a floor left behind
      // by a genuine drop cannot hold him up either.
      // …and "the lowest ground HE has held" is the body's, not this particle's:
      // see `stood`. A limb in the air over a bank the rest of him is lying on is
      // not entitled to a lower reference than the part of him that is on it.
      const held = stood < Infinity ? Math.max(l.floorRef, Math.min(stood, low)) : l.floorRef;
      const ceiling = Math.max(low, held + FLOOR_RISE_MAX);
      // …and that is also what the query is ASKED with, which is the half of
      // this that closes the loop. A provider that cannot resolve a point inside
      // a solid answers with the hint it was handed, so a hint taken from the
      // body's own height is a lie the body wrote — every substep it climbs, the
      // next claim climbs with it. Asked at the ceiling, the echo comes back
      // exactly `0.05` above the ceiling and is rejected every time, at any
      // height, forever.
      //
      // It is a HIGH cap, not a low one: it sits above the particle wherever the
      // particle is, so a body thrown up onto the loading dock still resolves the
      // dock's own deck and lands on it. Capping it at the reference instead
      // measured 22.5 cm of skull through that deck, because the deck was 1.1 m
      // up and the query was never allowed to see it.
      const s = surface.sample(l.pos.x, l.pos.z, ceiling + 0.05, sample);
      if (s.height <= ceiling) {
        l.floorY = s.height + l.radius;
        l.floorN.copy(s.normal);
        l.floorKind = s.kind;
      } else if (l.floorY - l.radius > ceiling) {
        l.floorY = ceiling + l.radius;
      }

      // What one substep of projection may spend getting him back out: what he
      // could honestly have driven himself in with, plus the give in a pass.
      l.lifted = 0;
      l.pushIn = 0;
      l.liftRoom = (l.vIn.length() + IMPULSE_MAX * h) * h + PROJECT_LIFT_SLACK;
      l.turnRoom = LIMIT_TURN_RATE * h;

      findWall(surface, l, buried);
    }

    joints(h);
    measureLinks();

    // The order inside a pass is not arbitrary, and neither is the floor being
    // in it at all:
    // · resolving penetration once at the END lets the last constraint pass
    //   push a hand straight back through the concrete — that is what the
    //   bones-below-the-floor reading was, at 11 cm;
    // · the bones go last of the three solvers, because whatever runs after
    //   them is what the write-back sees, and solving them first left a thigh
    //   18 mm long on the worst impact frame.
    for (let k = 0; k < ITERATIONS; k++) {
      solveLimits();
      solveVolume();
      solveLinks(braces, BRACE_STIFFNESS);
      solveLinks(links, BONE_STIFFNESS);
      project();
      capTurn(h);
    }
    // …and then the bones alone, until they are actually solved. Interleaving
    // the projection into this tail was tried and measured worse on both counts
    // — 10 mm of bone AND 92 mm of penetration, against 0.2 and 84.
    //
    // The turn cap DOES belong in it, and putting it anywhere else is a hole the
    // size of the tail. Run once before these passes it was undone by them:
    // twenty-four passes of Gauss-Seidel move a particle along every OTHER bone
    // it is on, and a 3.9 cm collarbone whose far end shifts two centimetres has
    // turned thirty degrees without a single link changing length. Measured, the
    // cap ahead of the tail left 129.9° of one-frame limb reversal on the board —
    // seven degrees of it capped and the rest handed back. Interleaved, the two
    // converge on each other, because rotating a segment about its own joint
    // cannot change its length and closing a length cannot beat a bound that is
    // re-applied after it.
    // …and the HINGES go in it too, for the same reason `capTurn` does and with the
    // same evidence behind it: whatever runs last is what the write-back sees.
    // Twenty-four passes of Gauss-Seidel move a joint's particles along every other
    // bone they are on, so a knee checked only BEFORE this tail is a knee whose last
    // twenty-four corrections nobody looked at. Four joints a pass costs nothing
    // next to the twenty-three links beside them, and the deltas the carried axes
    // need are refreshed once here rather than per pass because the tail moves a
    // particle by millimetres — 8.5 mm of link error down to 0.22 mm across the
    // whole of it, which is a fraction of a degree of carried frame.
    refreshDeltas();
    for (let k = 0; k < FINAL_BONE_PASSES; k++) {
      solveLinks(links, BONE_STIFFNESS);
      solveLimits(true);
      capTurn(h);
    }
    // Putting the WALL in that tail as well was tried this round and measured
    // worse, which is the same answer the floor got and worth writing down
    // twice rather than a third agent finding out again: the argument for it is
    // good — a body that hits something is pulled straight INTO it by its own
    // links, and the links run last — but the cost is the thing links exist to
    // prevent. Across the whole street table it took `bone±` from 0.05 mm to
    // 8.0–19.7 mm on four rows and left the 540 bail still moving at four
    // seconds. A bone that stretches 2 cm is skin that tears, every frame,
    // against a wall intrusion that clears itself in one or two.

    capSpeed(h);
    contacts(h);
    // Where every segment ended up, which is what the NEXT substep's turn is
    // measured from — the geometry the write-back is about to read, so no motion
    // between two drawn frames is outside the bound.
    recordTurn();

    // …and it is the WORST part of him, not the average of all of them. An
    // average over twenty-four particles is a place for a limb to hide: measured
    // on a bail into the quarter-pipe deck, a shin still travelling at 2.55 m/s
    // is 0.11 m/s of average, so the body was declared settled and frozen with
    // one leg in mid-swing. Nothing about "he has stopped moving" is an average.
    let moved = 0;
    for (const i of order) moved = Math.max(moved, limbs[i].stepFrom.distanceTo(limbs[i].pos));
    const speed = moved / h;
    // Stillness is SPENT by movement rather than erased by it. Counting the
    // corrections made the measure honest and also made it jumpy: a settled body
    // pops one knee against its own limit about every tenth substep, 2 cm and
    // gone, and a reset-to-zero meant those ten milliseconds cancelled the two
    // hundred either side of them — 10 bails in 360 lay on the concrete for the
    // full `MAX_SIM` with nothing moving. Spending it keeps the distinction that
    // matters: a body being walked out of a wall moves on EVERY substep and can
    // never save any up, while a body that is done twitches and carries on lying
    // there.
    calm = speed < SETTLE_SPEED ? calm + h : Math.max(0, calm - h);
  }

  /**
   * Where every bone's line sits as the substep begins — the cheap reject the
   * volume solver leans on, so ten passes over 250-odd pairs cost a couple of
   * hundred distance tests instead of two and a half thousand segment ones.
   *
   * Measured once a substep rather than once a pass on purpose: a relaxation
   * pass moves a particle by millimetres, and the reject carries the pair's own
   * clearance as slack, so nothing can slip past it between passes.
   */
  function measureLinks(): void {
    for (const link of links) {
      link.mid.addVectors(limbs[link.a].pos, limbs[link.b].pos).multiplyScalar(0.5);
      link.half = limbs[link.a].pos.distanceTo(limbs[link.b].pos) * 0.5;
    }
  }

  /**
   * A body has volume: two bones may not occupy the same space.
   *
   * This is the "group him to his bones" half of the collapse, and it is a
   * constraint like every other one here rather than a filter over the result —
   * the closest approach of two bone lines is found, and if it is inside the
   * clearance the pair started with, the two are pushed apart along that line.
   * Rotating nothing and stretching nothing: the correction is shared between a
   * bone's two ends by where along it the contact fell, so a limb pressed
   * against a torso turns about the contact the way a limb does, and the closing
   * bone passes still have the last word on length.
   *
   * One-directional forces were considered and rejected: a torso that shoves a
   * leg away without being shoved back is a body with a fixed centre, and the
   * mass ratio already does that job honestly (`INV_MASS` — the hips move a
   * third as far as a hand for the same push).
   */
  function solveVolume(): void {
    for (const v of volumes) {
      const A = links[v.a];
      const B = links[v.b];
      // Two lines whose midpoints are further apart than both half-lengths and
      // the clearance put together cannot be touching.
      if (A.mid.distanceToSquared(B.mid) > (A.half + B.half + v.gap) ** 2) continue;

      const a0 = limbs[A.a];
      const a1 = limbs[A.b];
      const b0 = limbs[B.a];
      const b1 = limbs[B.b];
      const s = closestPoints(a0.pos, a1.pos, b0.pos, b1.pos);
      const d = _ca.distanceTo(_cb);
      if (d >= v.gap) continue;
      if (d > 1e-6) _n.subVectors(_ca, _cb).divideScalar(d);
      else {
        // Two lines exactly on top of each other leave no direction to separate
        // along. Their cross product is the one axis that is square to both, and
        // "apart" along it is as good an answer as there is.
        _n.crossVectors(_u.subVectors(a1.pos, a0.pos), _w.subVectors(b1.pos, b0.pos));
        if (_n.lengthSq() < 1e-12) _n.set(0, 1, 0);
        _n.normalize();
      }
      const push = Math.min((v.gap - d) * VOLUME_STIFFNESS, VOLUME_MAX_PUSH);

      // How readily each side gives, at the point they actually touch.
      const wa = a0.invMass * (1 - s.a) + a1.invMass * s.a;
      const wb = b0.invMass * (1 - s.b) + b1.invMass * s.b;
      const total = wa + wb;
      if (total <= 1e-6) continue;
      const ka = (push * wa) / total;
      const kb = (push * wb) / total;
      a0.pos.addScaledVector(_n, ka * (1 - s.a));
      a1.pos.addScaledVector(_n, ka * s.a);
      b0.pos.addScaledVector(_n, -kb * (1 - s.b));
      b1.pos.addScaledVector(_n, -kb * s.b);
      // Booked, so the floor and the wall can take back exactly what this just
      // pushed into them. See `Limb.pushIn`.
      a0.pushIn += ka * (1 - s.a);
      a1.pushIn += ka * s.a;
      b0.pushIn += kb * (1 - s.b);
      b1.pushIn += kb * s.b;
    }
  }

  function solveLinks(set: Link[], stiffness: number): void {
    for (const link of set) {
      const a = limbs[link.a];
      const b = limbs[link.b];
      _v.subVectors(b.pos, a.pos);
      const d = _v.length();
      if (d < 1e-6) continue;
      const total = a.invMass + b.invMass;
      const push = ((d - link.rest) / d) * stiffness;
      a.pos.addScaledVector(_v, push * (a.invMass / total));
      b.pos.addScaledVector(_v, -push * (b.invMass / total));
    }
  }

  /**
   * Every bone's rotation-so-far. Limits are carried on THESE rather than on the
   * direction of the bone above them, and the difference is not cosmetic: a
   * collarbone is 3.9 cm long, and reading an orientation off two particles 3.9 cm
   * apart is noise the moment the shape gives at all — it swung the reference the
   * arm cone hangs off, and threw the whole arm across the body at 165° a frame. A
   * bone's own aim is a longer lever.
   */
  function refreshDeltas(): void {
    for (const i of order) limbs[i].delta.copy(deltaOf(i, _q2));
  }

  /**
   * @param hingesOnly run only the two hinge stops, against the deltas already in
   *   hand. That is what the closing tail wants: twenty-four passes of Gauss-Seidel
   *   move a joint's particles, and whatever runs last is what the write-back sees,
   *   so a knee has to be checked inside that tail and not only before it — the same
   *   argument `capTurn` is interleaved there for. The deltas are refreshed once
   *   ahead of the tail rather than per pass because the tail moves particles by
   *   millimetres: measured, the worst bone in the tail goes from 8.5 mm of link
   *   error to 0.22 mm across it, which is a fraction of a degree of carried frame.
   */
  function solveLimits(hingesOnly = false): void {
    if (!hingesOnly) refreshDeltas();

    for (const i of order) {
      const l = limbs[i];
      const lim = l.limit;
      if (!lim || l.aimA < 0) continue;
      if (hingesOnly && lim.kind !== "hinge") continue;
      const child = limbs[l.aimA];
      _w.subVectors(child.pos, l.pos);
      const wl = _w.length();
      if (wl < 1e-5) continue;
      _w.divideScalar(wl);

      if (lim.kind === "hinge") {
        if (l.parent < 0) continue;
        _u.subVectors(l.pos, limbs[l.parent].pos);
        if (_u.lengthSq() < 1e-8) continue;
        _u.normalize();
        // Carry the flexion axis along with the bone above: the axis was measured
        // against that bone's own frame, so it has to turn with it or a leg held
        // out sideways starts bending on the axis it had when it hung down.
        _axis.copy(lim.axis).applyQuaternion(limbs[l.parent].delta).normalize();
        // FIRST the plane, then the angle in it, and that order is the point.
        //
        // A hinge is two constraints and this file only ever had one. The fold
        // angle is measured with both bone directions PROJECTED onto the hinge
        // plane, so once the outgoing bone has swung far out of that plane both
        // projections are tiny and the fold reads as nothing whatever the leg is
        // really doing — the hyperextension stop stops acting, and the knee is
        // then free to fold 177° the wrong way with nothing complaining. Holding
        // the plane first is what keeps the angle measurable.
        const out = Math.asin(THREE.MathUtils.clamp(_w.dot(_axis), -1, 1)) - lim.abdRest;
        const back = THREE.MathUtils.clamp(out, lim.abdLo, lim.abdHi);
        if (back !== out) {
          // Turning about `w × axis` moves `w` toward the axis at a rate of
          // `1 − (w·axis)²`, so near the plane this is one for one and the
          // relaxation closes the rest.
          _n.crossVectors(_w, _axis);
          if (_n.lengthSq() > 1e-10) {
            _n.normalize();
            rotateChild(l, child, _n, (back - out) * HINGE_STIFFNESS, false);
            _w.subVectors(child.pos, l.pos).normalize();
          }
        }
        const angle = signedAngle(_u, _w, _axis);
        const clamped = THREE.MathUtils.clamp(angle, -lim.hyper, lim.flex);
        if (clamped === angle) continue;
        rotateChild(l, child, _axis, (clamped - angle) * HINGE_STIFFNESS, false);
        continue;
      }

      if (lim.kind === "chain") {
        if (l.parent < 0) continue;
        // Where this bone WOULD point if it had kept its captured angle to the
        // bone above — the cone's axis, carried along rather than fixed.
        _u.copy(lim.ref).applyQuaternion(limbs[l.parent].delta).normalize();
      } else {
        const frame = limbs[lim.frame === "pelvis" ? hipsIndex : chestIndex];
        _u.copy(lim.ref).applyQuaternion(frame.delta).normalize();
      }

      const cos = THREE.MathUtils.clamp(_u.dot(_w), -1, 1);
      const angle = Math.acos(cos);
      if (angle <= lim.max) continue;
      _axis.copy(_u).cross(_w);
      if (_axis.lengthSq() < 1e-8) continue;
      _axis.normalize();
      rotateChild(l, child, _axis, -(angle - lim.max) * LIMIT_STIFFNESS, true);
    }
  }

  /**
   * Swings a joint's child around it. Rotating ABOUT the joint keeps the bone
   * exactly its own length, so a limit can never stretch a limb — which is why
   * limits are allowed to run in the same relaxation loop as the distances.
   */
  function rotateChild(
    l: Limb,
    child: Limb,
    axis: THREE.Vector3,
    angle: number,
    rationed: boolean,
  ): void {
    // Rationed, the way the floor and the wall are: `LIMIT_TURN_RATE` radians per
    // substep, spent across all ten passes. Spending it is what stops the loop
    // between a frame limit and the particles its own correction moves; running
    // out of it leaves the joint violated for a substep, which the next one
    // carries on correcting, and that is a joint that cannot un-fold instantly
    // rather than a joint that gives up.
    //
    // **A HINGE IS NOT RATIONED, AND THAT IS NOT AN EXEMPTION — IT IS THE REASON
    // THE RATION EXISTS.** What `LIMIT_TURN_RATE` was added to break is a closed
    // loop, spelt out where it is declared: a `frame` limit is measured against
    // the pelvis's own rotation, the pelvis's rotation is read off the two hip
    // particles, and the correction moves those hip particles. A hinge is measured
    // against the bone directly above it and corrected by turning the child about
    // the joint; there is no loop to break, and a hard stop that can only correct
    // 6.4° a substep is a knee that stays bent backwards for two drawn frames
    // after a hard impact — which is exactly the thing being fixed.
    //
    // It is not unbounded either, and the bound is the honest one: `capTurn` is
    // interleaved after every pass this runs in, in the relaxation loop AND in the
    // closing tail, and it holds every bone to `BONE_TURN_RATE · SUBSTEP` — 7.0° a
    // substep, 1,260°/s — against where that bone was when the substep began. So a
    // hinge stop turns a joint as fast as this solver lets ANY bone turn, and no
    // faster. Nothing here is damped and no pose is filtered; the difference is
    // which of two ceilings a knee is held under.
    if (rationed) {
      if (l.turnRoom <= 0) return;
      if (angle > l.turnRoom) angle = l.turnRoom;
      else if (angle < -l.turnRoom) angle = -l.turnRoom;
      l.turnRoom -= Math.abs(angle);
    }
    _swingA.subVectors(child.pos, l.pos);
    _swingB.copy(_swingA).applyAxisAngle(axis, angle).sub(_swingA);
    // The joint gives a little too, weighted by mass — a knee stopping a shin
    // dead while the thigh does not move at all reads as a puppet string.
    const share = l.invMass / (l.invMass + child.invMass);
    child.pos.addScaledVector(_swingB, 1 - share);
    l.pos.addScaledVector(_swingB, -share);
  }

  /**
   * Joint friction along every real bone — the two ends give up moving relative
   * to each other. Braces are left out: they are a shape, not a joint.
   */
  function joints(h: number): void {
    for (const i of order) {
      const l = limbs[i];
      if (l.parent < 0) continue;
      const p = limbs[l.parent];
      const k = 1 - Math.exp(-JOINT_DAMP * l.lever * h);
      _v.subVectors(l.pos, l.prev).sub(_u.subVectors(p.pos, p.prev)).multiplyScalar(k);
      const total = p.invMass + l.invMass;
      l.prev.addScaledVector(_v, l.invMass / total);
      p.prev.addScaledVector(_v, -p.invMass / total);
    }
  }

  /**
   * A joint's top speed, in the only place it can be enforced — the particles.
   *
   * A bone's drawn direction IS the line between its two particles: `writeBack`
   * swings the bone onto its child and then puts the child ON its own particle,
   * so whatever this pair does is what the player sees the limb do. Bounding the
   * pair therefore bounds the limb, and bounding it by ROTATING one end about the
   * other keeps the bone exactly its own length — a turn cap can never stretch a
   * limb, which is what lets it sit between the relaxation and the closing pass
   * instead of fighting them.
   *
   * The correction is a rigid re-placement: position and previous position move
   * together, so no velocity is created or destroyed. That matters. Moving `pos`
   * alone would read as an impulse next substep and the limb would spring back —
   * a filter with a resonance, which is the class of fix this project has already
   * rejected three times. Left as a pure re-placement it is a governor: a joint
   * with more angular speed than it is allowed simply turns at the limit for as
   * many substeps as it takes, and `joints()` bleeds the excess the way friction
   * bleeds anything else.
   */
  function capTurn(h: number): void {
    const max = BONE_TURN_RATE * h;
    for (const set of [links, braces]) {
      for (const link of set) {
        const a = limbs[link.a];
        const b = limbs[link.b];
        _v.subVectors(b.pos, a.pos);
        const d = _v.length();
        if (d < 1e-6) continue;
        _v.divideScalar(d);
        const angle = Math.acos(THREE.MathUtils.clamp(link.ref.dot(_v), -1, 1));
        if (angle <= max) continue;
        _axis.crossVectors(link.ref, _v);
        // A segment that reversed EXACTLY leaves no axis to swing back about.
        // Any axis square to it will do — the cap is about the size of the turn,
        // not about which way it went.
        if (_axis.lengthSq() < 1e-12) {
          _axis.set(0, 1, 0).cross(_v);
          if (_axis.lengthSq() < 1e-12) _axis.set(1, 0, 0);
        }
        _axis.normalize();
        _q.setFromAxisAngle(_axis, -(angle - max));
        _swingA.subVectors(b.pos, a.pos);
        _swingB.copy(_swingA).applyQuaternion(_q).sub(_swingA);
        // The joint gives too, weighted by mass — the same share `rotateChild`
        // uses, so a heavy torso is not swung about by a hand.
        const share = a.invMass / (a.invMass + b.invMass);
        b.pos.addScaledVector(_swingB, 1 - share);
        b.prev.addScaledVector(_swingB, 1 - share);
        a.pos.addScaledVector(_swingB, -share);
        a.prev.addScaledVector(_swingB, -share);
      }
    }
  }

  function recordTurn(): void {
    for (const set of [links, braces]) {
      for (const link of set) {
        _v.subVectors(limbs[link.b].pos, limbs[link.a].pos);
        if (_v.lengthSq() > 1e-12) link.ref.copy(_v.normalize());
      }
    }
  }

  /** The relaxation is allowed to slow anything down, and only to speed it up so fast. */
  function capSpeed(h: number): void {
    const room = IMPULSE_MAX * h;
    for (const i of order) {
      const l = limbs[i];
      _v.subVectors(l.pos, l.prev);
      const speed = _v.length() / h;
      const cap = l.vIn.length() + room;
      if (speed > cap) l.prev.copy(l.pos).addScaledVector(_v, -cap / speed);
    }
  }

  // -------------------------------------------------------------------------
  // the floor
  // -------------------------------------------------------------------------

  /**
   * The wall beside a particle, as a PLANE — outward normal and where the face
   * is — resolved once per substep from the one thing the contract offers, a
   * boolean.
   *
   * This exists because the wall used to be the one correction in the file that
   * was not a constraint: it snapped x and z back to where the particle had
   * been a whole substep earlier, unrationed, from inside the relaxation loop.
   * Every pass yanked it back to the same stale spot, so the links holding the
   * bones together could never converge against it — measured on the street
   * spot, 37.6 mm of Spine02 into the loading-dock face and 40.1 mm of Spine01
   * on the quarter-pipe deck, against 0.5-0.8 mm on the clear plaza. A bone
   * length is the one thing in a ragdoll that must never give, so the wall now
   * has exactly the shape the floor has: a plane, fixed for the substep,
   * corrected a rationed step at a time, with the bones solved after it.
   */
  function findWall(surface: SurfaceProvider, l: Limb, buried: boolean): void {
    l.wallN.set(0, 0, 0);
    if (!buried) return;
    // …but "blocked" is `some top here is above you`, which is also true of a
    // hand a centimetre under the deck it just slapped. That is a FLOOR contact
    // and the floor is already lifting it; calling it a wall as well shoves it
    // sideways off the deck at the same time, and the two corrections fight for
    // as long as the body lies there. So: if standing it on its own floor would
    // free it, this is not a wall.
    if (!surface.blocked(l.pos.x, l.pos.z, l.floorY)) return;

    let best = -1;
    let inside = 0;
    let outside = Infinity;
    let at = l.pos.y;
    const probe = (d: number): boolean => {
      const n = WALL_OUT[d];
      let lo = 0;
      for (const r of WALL_PROBE) {
        if (r >= outside) break;
        if (!surface.blocked(l.pos.x + n.x * r, l.pos.z + n.z * r, at)) {
          best = d;
          inside = lo;
          outside = r;
          return true;
        }
        lo = r;
      }
      return false;
    };

    // He comes back out the way he went IN, whenever this substep's travel says
    // which way that was. The nearest face is the wrong answer against anything
    // thin: the fence is 40 cm of slab, a body arriving at 12 m/s is 7 cm into
    // it after one substep and its far side is the closer way out, so half the
    // particles left through it and the skater ended up straddling a fence he
    // hit — 111 spike frames and no rest inside four seconds.
    const dx = l.pos.x - l.prev.x;
    const dz = l.pos.z - l.prev.z;
    const back =
      Math.abs(dx) > Math.abs(dz)
        ? Math.abs(dx) > 1e-3
          ? dx > 0
            ? 1
            : 0
          : -1
        : Math.abs(dz) > 1e-3
          ? dz > 0
            ? 3
            : 2
          : -1;
    // Otherwise the nearest face there is, starting from the one he was against
    // last substep — a body already down against a wall stays against it, and
    // finding the near way out first makes every other axis break on its first
    // rung.
    if (back < 0 || !probe(back)) {
      for (let k = 0; k < WALL_OUT.length; k++) probe((l.wallDir + k) % WALL_OUT.length);
    }
    // Nothing within reach on any axis — so ask again from one step higher,
    // because `blocked` cannot tell a wall from a step and the way out of a
    // wedge is usually over the low side of it. Measured: a toe finished 13 cm
    // under the quarter-pipe deck in the 9 cm sliver between the deck's
    // footprint and the north building's, with brick one way and the deck's own
    // top face the other, and stayed there. This runs ONLY where the ordinary
    // probe found nothing at all, so a body against a real face never sees it —
    // asked from a step up unconditionally, the loading dock's bank stops being
    // a bank and the body wedges in its toe for the full four seconds.
    if (best < 0) {
      at = l.pos.y + WALL_STEP_UP;
      for (let k = 0; k < WALL_OUT.length; k++) probe((l.wallDir + k) % WALL_OUT.length);
    }
    // Still nothing. He is not against a face, he is buried in the middle of a
    // block, and the honest answer is to leave the body alone rather than pick a
    // direction and shove the whole skeleton along it.
    if (best < 0) return;

    const n = WALL_OUT[best];
    for (let k = 0; k < WALL_BISECT; k++) {
      const mid = (inside + outside) / 2;
      if (surface.blocked(l.pos.x + n.x * mid, l.pos.z + n.z * mid, at)) inside = mid;
      else outside = mid;
    }
    l.wallN.copy(n);
    l.wallDir = best;
    // …and only as far as it could honestly have got in. See `WALL_STEP_SLACK`.
    const drove = Math.max(0, -l.vIn.dot(n)) * SUBSTEP;
    l.wallLimit = l.pos.dot(n) + Math.min(outside, WALL_MAX_STEP, drove + WALL_STEP_SLACK);
  }

  /** Positions only — no velocity is touched here, so it is safe to run in the loop. */
  function project(): void {
    for (const i of order) {
      const l = limbs[i];
      // Rationed, not teleported. One pass may only lift a particle as far as a
      // real impact could have driven it in, so a floor this file has been lied
      // to about can never outrun the links holding the bones together — that is
      // what turned a bad wall query into a body on a roof with metre-long legs.
      const lift = l.floorY - l.pos.y;
      if (lift > 0) {
        // …and out along the SURFACE NORMAL, not straight up. Over flat ground
        // the two are the same move and this reads as `pos.y = floorY`; on a bank
        // or a quarter-pipe transition they are not, and straight up drives a
        // particle ALONG the face it is trying to leave instead of off it.
        // `lift · n.y` is the perpendicular distance to the plane through the
        // contact, so nothing changes on the flat. The floor under `n.y` is for a
        // face steep enough that a height field has stopped meaning anything —
        // there it only has to move, and out is out.
        //
        // …and past `FLOOR_NORMAL_MIN` it is not a floor's normal at all. A
        // provider that differences its heights hands back a nearly HORIZONTAL
        // normal at a step edge, and pushing along that is a sideways shove with
        // the whole lift behind it and no upward component to stop the fall:
        // measured on the liar's cliff, a limb finished 26.7 cm under the
        // concrete because every pass moved it along the ground instead of onto
        // it. The steepest face this spot really has reads 0.19, so anything
        // under 0.12 is noise and the only safe answer is up.
        _n.copy(l.floorN);
        if (_n.y < FLOOR_NORMAL_MIN) _n.set(0, 1, 0);
        const step = Math.min(
          lift * Math.max(_n.y, 0.25),
          PROJECT_MAX_LIFT,
          l.liftRoom + l.pushIn - l.lifted,
        );
        if (step > 0) {
          l.pos.addScaledVector(_n, step);
          l.lifted += step;
        }
      }
      // …and the wall, out along its own face normal, on the same ration. Only
      // the perpendicular is taken: a body that hits a fence at speed should
      // slide along it and go down, and taking both horizontals back — which is
      // what snapping to `prev` did — stops it dead in the air, which is the
      // one thing a fence never does.
      if (l.wallN.lengthSq() > 0) {
        // …plus whatever the volume solver has driven it in with since the
        // substep began, which the ration below could not have known about when
        // it was worked out. See `Limb.pushIn`.
        const into = l.wallLimit + l.pushIn - l.pos.dot(l.wallN);
        if (into > 0) l.pos.addScaledVector(l.wallN, Math.min(into, PROJECT_MAX_LIFT));
      }
    }
  }

  /**
   * Friction, restitution, and the impact report — once per substep, after the
   * relaxation has settled where everything is.
   *
   * Two things here are load-bearing, and both were found by watching a body
   * launch itself off the floor:
   *
   * · The normal velocity of a contact is REBUILT, never kept. Pushing a
   *   penetrating particle back up to the surface is a position edit, and the
   *   next step reads it as upward speed the body never had — one substep of
   *   that is nothing, sixty of it threw a shin 0.86 m in a single frame. After
   *   a contact the only thing left across the normal is the bounce.
   *
   * · The impact SPEED is `vIn`, what the particle arrived with, not what is
   *   left in it. Constraint corrections show up in `(pos - prev)/h` as speed
   *   that was never there — reading the report off that had a standing
   *   collapse announcing a 16 m/s head impact.
   */
  function contacts(h: number): void {
    for (const i of order) {
      const l = limbs[i];

      // A wall is a floor turned on its side, and its normal velocity is REBUILT
      // for the same reason the floor's is: pushing a particle back out of the
      // brick is a position edit, and the next substep reads it as speed away
      // from the wall that the body never had. Measured with it kept, a skater
      // who hit the fence at 12 m/s was still being thrown off it four seconds
      // later — 111 spike frames, and `settled` never came true.
      if (l.wallN.lengthSq() > 0) {
        const arriving = l.vIn.dot(l.wallN);
        _v.subVectors(l.pos, l.prev).divideScalar(h);
        _v.addScaledVector(l.wallN, -_v.dot(l.wallN)); // along the face only…
        if (arriving < 0) _v.addScaledVector(l.wallN, -arriving * RESTITUTION); // …plus the bounce
        l.prev.copy(l.pos).addScaledVector(_v, -h);
      }

      if (l.pos.y > l.floorY + 1e-4) {
        l.touching = false;
        continue;
      }

      // Same guard as the projection: a normal this far over is a step edge
      // differenced, not a face, and scrubbing "along the surface" across one
      // leaves the FALL in and takes the slide out — the exact inverse of
      // friction.
      _n.copy(l.floorN);
      if (_n.y < FLOOR_NORMAL_MIN) _n.set(0, 1, 0);
      const arriving = l.vIn.dot(_n);
      if (arriving < -IMPACT_MIN && !l.touching) report(l, -arriving, l.floorKind);

      _v.subVectors(l.pos, l.prev).divideScalar(h);
      _v.addScaledVector(_n, -_v.dot(_n)); // along the surface only…
      // …scrubbed, but only as hard as a surface can actually scrub.
      //
      // The rate on its own is a viscous law, and a viscous law is a brake whose
      // force goes up with speed: at `FRICTION.concrete` a body arriving at
      // 11 m/s is being slowed at **154 m/s², fifteen g**, and keeps 0.85% of its
      // speed a third of a second later. Measured on the loading dock's bank,
      // that is a skater who hits the concrete at 11 m/s and comes to a dead
      // stop 2.0 m later with 1% of his speed left — the whole of what "a sack
      // of sand instead of a body" looks like, and invisible to every other line
      // in the drop table because a sack that lands and dies satisfies all of
      // them.
      //
      // Real sliding does not work like that: it takes off a fixed amount of
      // speed per second whatever you are doing, `µ·g`. And this file already
      // knows µ for every surface — `GRIP` is a gradient, and a gradient a
      // surface can hold a body still on IS its coefficient of friction. So the
      // same number does both jobs, and the loss is whichever of the two is
      // SMALLER: the rate below walking pace, where it is the thing that lets a
      // body actually stop, and the µ·g brake above it, where it is the thing
      // that lets a body slide. Concrete now takes 15.3 m/s² off a slide, so
      // 11 m/s is 3.9 m of skater going down the street on his back rather than
      // 2.0 m of him arriving.
      const was = _v.length();
      if (was > 1e-6) {
        const viscous = was * (1 - Math.exp(-(FRICTION[l.floorKind] ?? 14) * h));
        const brake = (GRIP[l.floorKind] ?? 0.9) * GRAVITY * h;
        _v.setLength(Math.max(0, was - Math.min(viscous, brake)));
      }
      // …and then held, if what is left is a creep and the slope is one this
      // surface can hold. See `GRIP`: without this the body never stops on any
      // grade at all, because viscous friction has a terminal speed and settling
      // needs a zero.
      const grade = Math.sqrt(Math.max(0, 1 - _n.y * _n.y)) / Math.max(1e-3, _n.y);
      if (_v.lengthSq() < STATIC_SLIDE * STATIC_SLIDE && grade <= (GRIP[l.floorKind] ?? 0.9)) {
        _v.set(0, 0, 0);
      }
      if (arriving < 0) _v.addScaledVector(_n, -arriving * RESTITUTION); // …plus a token bounce
      l.prev.copy(l.pos).addScaledVector(_v, -h);
      l.touching = true;
    }
  }

  function report(l: Limb, speed: number, kind: SurfaceKind): void {
    const impact: RagdollImpact = {
      part: l.part,
      speed,
      point: l.pos.clone(),
      surface: kind,
    };
    lastImpact = impact;
    if (!hardestImpact || speed > hardestImpact.speed) hardestImpact = impact;
    options.onImpact?.(impact);
  }

  // -------------------------------------------------------------------------
  // posing the skeleton
  // -------------------------------------------------------------------------

  /**
   * The rotation this bone has picked up since the bail: swing its rest
   * direction onto the child particle it aims at, then twist about that swing
   * until its twist line comes back into place. Both are identities at capture,
   * which is why entering the ragdoll cannot snap.
   */
  function deltaOf(i: number, out: THREE.Quaternion): THREE.Quaternion {
    const l = limbs[i];
    out.identity();
    if (l.aimA < 0) return out;
    _v.subVectors(limbs[l.aimA].pos, l.pos);
    if (_v.lengthSq() < 1e-10) return out;
    _v.normalize();
    if (l.twistTo < 0) {
      // Nothing in the particles says how this bone is ROLLED — a collarbone, an
      // upper arm, a forearm, a thigh and a shin all have exactly one child. So
      // it takes the bone above it WHOLE and adds only the swing its own joint
      // has made, which is what a limb hanging off a limb actually does…
      //
      // …and then `rollFrom` picks WHICH of those rolls, because "the minimal
      // rotation from the carried rest direction" is not one answer, it is an
      // answer that jumps. Carrying the rest direction along with the parent
      // means the parent turning moves it, and re-deriving the roll from scratch
      // against a moved reference produces the holonomy of that loop as a lump:
      // measured on a bail into the fence, a thigh's world rotation moved 177°
      // in ONE frame while the direction it points moved 90°, and the leg came
      // out of the hip backwards. The 87° of difference was not in the particles
      // at all — the same body, the same shape, a different arbitrary choice of
      // roll two frames running. Continuity is the only defensible choice for a
      // quantity nothing observes, and it is free.
      if (l.parent < 0) out.setFromUnitVectors(l.dirA, _v);
      else {
        _u.copy(l.dirA).applyQuaternion(limbs[l.parent].delta);
        out.setFromUnitVectors(_u, _v).multiply(limbs[l.parent].delta);
      }
      // …and then the roll that continuity chose is held inside a body's range.
      // Continuity is the only defensible choice for a quantity nothing observes,
      // and it has no anchor — see `clampRoll` and `rollOf` for the 180° of shin
      // and ankle it walks to without one. The clamp turns the bone about its own
      // length, so the direction the particles just gave it survives exactly.
      return clampRoll(l, rollFrom(l.held, out, _v), _v);
    }

    out.setFromUnitVectors(l.dirA, _v);
    _w.subVectors(limbs[l.twistTo].pos, limbs[l.twistFrom].pos);
    if (_w.lengthSq() < 1e-10) return clampRoll(l, rollFrom(l.held, out, _v), _v);
    _w.normalize();
    _u.copy(l.dirB).applyQuaternion(out);
    // Both projected off the aim axis, so the twist is measured in the plane
    // the swing has already fixed.
    _u.addScaledVector(_v, -_u.dot(_v));
    _n.copy(_w).addScaledVector(_v, -_w.dot(_v));
    if (_u.lengthSq() < 1e-8 || _n.lengthSq() < 1e-8) {
      return clampRoll(l, rollFrom(l.held, out, _v), _v);
    }
    _u.normalize();
    _n.normalize();
    const twist = signedAngle(_u, _n, _v);
    return out.premultiply(_q.setFromAxisAngle(_v, twist));
  }

  /**
   * Re-rolls `q` about `axis` until it sits as close to `held` as the particles
   * allow — the pose this bone had last frame, kept wherever nothing measures it.
   *
   * A rotation that has to carry one direction onto another has exactly one
   * degree of freedom left, the roll about that direction, and for every bone in
   * this skeleton with a single child there is nothing in the particle cloud that
   * fixes it. So it gets chosen, and choosing it fresh each frame is what puts a
   * 180° flip on screen while the body is holding still. Choosing it by
   * continuity cannot: the direction is whatever the particles say, and the roll
   * is the one the bone already had, so a bone's world rotation between two
   * frames is now its own direction change and nothing else. That holds at 30 fps
   * as squarely as at 144, because it is not a rate — there is no roll left for a
   * long frame to accumulate.
   *
   * It costs the drift a rotation-minimising frame always has: roll it out of a
   * long tumble and the bone is rolled a little from where an anatomist would put
   * it. Against a limb reversing, that is not a close call, and the bone's own
   * direction and every joint POSITION are untouched by it.
   */
  function rollFrom(
    held: THREE.Quaternion,
    q: THREE.Quaternion,
    axis: THREE.Vector3,
  ): THREE.Quaternion {
    // The turn from where this bone would land to where it was, reduced to its
    // component about the bone — the swing half is what the particles just said
    // and is not up for discussion.
    _q.copy(q).invert().premultiply(held);
    const d = axis.x * _q.x + axis.y * _q.y + axis.z * _q.z;
    _q.set(axis.x * d, axis.y * d, axis.z * d, _q.w);
    const n = Math.hypot(_q.x, _q.y, _q.z, _q.w);
    // A half-turn about something square to the bone leaves no roll to read.
    if (n < 1e-6) return q;
    _q.set(_q.x / n, _q.y / n, _q.z / n, _q.w / n);
    return q.premultiply(_q);
  }

  /**
   * Poses the skeleton, at weight `w`.
   *
   * The blend is done in LOCAL space, against the ragdoll's OWN chain — the
   * whole pose is resolved to world rotations first, then converted to locals
   * using the ragdoll's parents rather than the half-blended bones on screen.
   * Written the other way round it eats itself: as a blending parent rotates,
   * every child has to counter-rotate to hold its world orientation, and the
   * stand-up measured 179° of hips-relative snap on bones that were not moving.
   */
  function writeBack(w: number): void {
    if (limbs.length === 0) return;
    // Ancestors too: the rig's own root moved this frame, and a bone written
    // against a stale parent matrix lands the body a frame behind the board.
    options.root.updateWorldMatrix(true, true);

    for (const i of order) {
      const l = limbs[i];
      const parent = l.bone.parent;

      if (l.aimA >= 0) {
        l.delta.copy(deltaOf(i, _q2));
        // The pose that just went out is what the next frame's roll is carried
        // from. Written HERE and nowhere else, so `deltaOf` stays a pure function
        // of the particles for the ten times a substep the limits call it — a
        // roll advanced inside the relaxation loop would compound, which is the
        // parked-clip bug this project has already paid for once.
        l.held.copy(l.delta);
        l.poseWorld.copy(l.delta).multiply(l.restWorld);
      } else if (l.parent >= 0) {
        // A leaf keeps the angle it had to the bone above it — a hand does not
        // decide anything, it goes where the forearm takes it.
        l.poseWorld.copy(limbs[l.parent].poseWorld).multiply(l.restLocal);
      } else {
        l.poseWorld.copy(l.restWorld);
      }

      if (l.parent >= 0) _q.copy(limbs[l.parent].poseWorld).invert().multiply(l.poseWorld);
      else if (parent) _q.copy(parent.getWorldQuaternion(_q2).invert()).multiply(l.poseWorld);
      else _q.copy(l.poseWorld);
      l.bone.quaternion.slerp(_q, w);

      // THE DRAWN POSE IS NOT CLAMPED A SECOND TIME HERE — TRIED, MEASURED,
      // REVERTED, and the reason is worth more than the attempt.
      //
      // The argument for it is good: a slerp is a geodesic in SO(3), the set of poses
      // a body can hold is not geodesically convex, and this blend runs the whole
      // stand-up from a collapsed pose toward a get-up take — so a blend between two
      // legal poses can pass through an illegal one. Measured, it bought something
      // real: the share of out-of-range joint frames falling in the hand-back rather
      // than in the tumble went from a fifth of them to 2.4%.
      //
      // **And it silently breaks the bone lengths, which is the one thing a ragdoll
      // may never do.** A clamp applied to `bone.quaternion` after the slerp does not
      // update `poseWorld` — and `poseWorld` is what every CHILD's local position is
      // derived through two lines below, while the position that child actually ends
      // up at is realised through its parent's DRAWN matrix. Desynchronise the two and
      // each bone lands a little off its own particle, compounding down the chain:
      // `integration-check`'s bone-stretch line went 0.119 mm → **2.364 mm** and the
      // reversal it is meant to help went 129.2° → 157.0°. A guard that tears the skin
      // is not a guard.
      //
      // The roll stop therefore lives in ONE place — `clampRoll`, inside `deltaOf`,
      // where it corrects the pose the particles produced before anything is derived
      // from it. Both ends of the blend are legal because of that, and what the blend
      // does between them is the animation layer's business.

      // …and its POSITION, so every bone lands on its own particle rather than
      // being reconstructed off a rigid offset from its parent. Rotation alone
      // is exact for a single-child bone and only as good as the pelvis is
      // rigid for the rest: measured, a hard landing walked the far leg off its
      // own particles and put a toe 11 cm under the concrete. The bone lengths
      // this writes are the particle lengths, which the hard links hold to
      // within 4.5 mm on the worst impact frame measured — the harness checks
      // exactly that, and it is what keeps the skin from stretching.
      if (l.parent >= 0) {
        const p = limbs[l.parent];
        _v.subVectors(l.pos, p.pos).applyQuaternion(_q2.copy(p.poseWorld).invert()).divide(p.scale);
      } else {
        _v.copy(l.pos);
        if (parent) _v.applyMatrix4(_m.copy(parent.matrixWorld).invert());
      }
      l.bone.position.lerp(_v, w);
      // The next bone down reads this one's world matrix, so it has to be true
      // before we get there. Parents come first in `order`.
      l.bone.updateWorldMatrix(false, false);
    }
  }

  /**
   * Stand him up. The bones are NOT dropped here — they are handed back over
   * `RELEASE_BLEND`, so the riding stance grows back under the settled pose
   * instead of the reset teleporting him upright in one frame. Keep calling
   * `update()` until `running` goes false and that blend runs itself.
   */
  /**
   * The teleport exit — see `RagdollHandle.cancel`.
   *
   * Everything `release()` starts is a JOURNEY HOME: the get-up blends the
   * skeleton back over its own clip, and the deck slides to the skater's feet
   * over `BOARD_RETURN`. Both of those are solved in world space against a home
   * that is about to move to the spawn, so after R they play out as a body and
   * a board flying across the block. This is the same handover with every
   * journey skipped — the fall is simply not happening any more, and the
   * animation layer owns the bones again on the very next frame (`weight = 0`,
   * not a ramp).
   */
  function cancel(): void {
    simulating = false;
    releasing = false;
    posed = false;
    weight = 0;
    getUp?.cancel();
    board?.cancel();
  }

  function release(out = new THREE.Vector3()): THREE.Vector3 {
    simulating = false;
    if (posed && !releasing) {
      releasing = true;
      // The hips bone, handed over while the skeleton STILL HOLDS the collapsed
      // pose — this is the last frame on which which-way-round-he-is-lying and
      // how-high-he-is-lying can be read, and the take is placed on the body off
      // exactly those two facts. See `GetUp.arm`.
      getUp?.arm(allBones, hipsIndex >= 0 ? limbs[hipsIndex].bone : null);
      // …and the deck comes home over its own short constant, because THIS is the
      // frame the ride takes the board back — `SkateModel` calls here and returns
      // to `rolling` in the same breath. Timing the return off the stand-up
      // instead was round two's call and it is reverted: it made the deck's home
      // a target moving away at riding speed, and the deck spent the whole
      // stand-up lying flat on the concrete being towed along beside him.
      board?.release();
    }
    return out.copy(hips);
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * The skeleton, preferring the skin's own joint list — that is the authoritative
 * set, and it excludes any helper object someone parented under the rig.
 */
/**
 * …and the skeleton itself, because `boneInverses` is the only place the rig's own
 * bind pose can be read from once a clip is running over it. Same first-skin rule
 * as `findBones`, so the two can never disagree about which body this is.
 */
function findSkeleton(root: THREE.Object3D): THREE.Skeleton | null {
  let found: THREE.Skeleton | null = null;
  root.traverse((o: THREE.Object3D) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!found && mesh.isSkinnedMesh && mesh.skeleton) found = mesh.skeleton;
  });
  return found;
}

function findBones(root: THREE.Object3D): THREE.Object3D[] {
  let skinned: THREE.Skeleton | null = null;
  root.traverse((o: THREE.Object3D) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!skinned && mesh.isSkinnedMesh && mesh.skeleton) skinned = mesh.skeleton;
  });
  if (skinned) return [...(skinned as THREE.Skeleton).bones];

  const bones: THREE.Object3D[] = [];
  root.traverse((o: THREE.Object3D) => {
    if ((o as THREE.Bone).isBone) bones.push(o);
  });
  return bones;
}

/**
 * The deck, found in the rig's own graph rather than passed in.
 *
 * The rig hangs the skater and the board off the same chain — the board on one
 * branch, the rider on another — so from the skeleton's root the deck is a
 * SIBLING, a few nodes up. This walks that far and no further, and it accepts a
 * candidate only on evidence rather than on position: a branch with meshes in it
 * and no skin anywhere is a prop; a branch with a SkinnedMesh is a body.
 *
 * It declines rather than guesses. Two candidates at the same level means the
 * rig has grown something this rule cannot tell from a board — a second prop, a
 * shadow blob — and attaching physics to the wrong node is worse than leaving
 * the board where it was. Reaching the scene is the same case: everything in
 * the world is a mesh with no skin, so the ambiguity rule stops the walk there
 * on its own. Pass `RagdollOptions.board` and none of this runs.
 */
function findBoard(root: THREE.Object3D): THREE.Object3D | null {
  let node: THREE.Object3D = root;
  for (let up = 0; up < 6 && node.parent; up++) {
    const parent: THREE.Object3D = node.parent;
    let found: THREE.Object3D | null = null;
    let count = 0;
    for (const sibling of parent.children) {
      if (sibling === node || !isProp(sibling)) continue;
      found = sibling;
      count++;
    }
    if (count === 1 && found) return found;
    if (count > 1) return null;
    node = parent;
  }
  return null;
}

/** A branch with something to draw in it and no skeleton anywhere under it. */
function isProp(node: THREE.Object3D): boolean {
  let mesh = false;
  let skinned = false;
  node.traverse((o: THREE.Object3D) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    else if ((o as THREE.Mesh).isMesh) mesh = true;
  });
  return mesh && !skinned;
}

/**
 * Bone name → what it is. Order matters: "LeftUpLeg" has to be read as a thigh
 * before "leg" claims it, and "forearm" before "arm" does. Covers the Meshy /
 * Mixamo names this game ships on and the VRM humanoid names the fallback
 * avatar uses; anything unrecognised is carried as a plain link with no limit,
 * which is the right answer for a bone this file has never heard of.
 */
function classify(raw: string): BoneRole {
  const n = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (/thumb|index|middle|ring|little|pinky|finger|eye|jaw|tongue|hair|skirt|breast|bust|tail|cloth/.test(n)) {
    return "skip";
  }
  if (/hips|pelvis/.test(n)) return "hips";
  if (/toe|ball/.test(n)) return "toe";
  if (/foot|ankle/.test(n)) return "foot";
  if (/upleg|upperleg|thigh/.test(n)) return "thigh";
  if (/lowerleg|calf|shin|knee|leg/.test(n)) return "shin";
  if (/shoulder|clavicle/.test(n)) return "shoulder";
  if (/forearm|lowerarm|elbow/.test(n)) return "foreArm";
  if (/hand|wrist/.test(n)) return "hand";
  if (/arm/.test(n)) return "upperArm";
  if (/neck/.test(n)) return "neck";
  if (/head/.test(n)) return "head";
  if (/spine|chest|torso|abdomen|waist/.test(n)) return "spine";
  return "spine";
}

/**
 * Closest approach of two segments — the classic clamped-parameter solve.
 *
 * Leaves the two closest points in `_ca` and `_cb` and returns where along each
 * segment they fell, because the volume solver needs both: the direction to
 * separate along, and how to share that separation between a bone's two ends.
 */
const _seg = { a: 0, b: 0 };
function closestPoints(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
): { a: number; b: number } {
  const d1 = _cd1.subVectors(q1, p1);
  const d2 = _cd2.subVectors(q2, p2);
  const r = _cr.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s = 0;
  let t = 0;
  if (a >= 1e-9 || e >= 1e-9) {
    if (a < 1e-9) {
      t = clamp01(f / e);
    } else {
      const c = d1.dot(r);
      if (e < 1e-9) {
        s = clamp01(-c / a);
      } else {
        const b = d1.dot(d2);
        const denom = a * e - b * b;
        s = denom > 1e-9 ? clamp01((b * f - c * e) / denom) : 0;
        t = (b * s + f) / e;
        if (t < 0) {
          t = 0;
          s = clamp01(-c / a);
        } else if (t > 1) {
          t = 1;
          s = clamp01((b - c) / a);
        }
      }
    }
  }
  _ca.copy(p1).addScaledVector(d1, s);
  _cb.copy(p2).addScaledVector(d2, t);
  _seg.a = s;
  _seg.b = t;
  return _seg;
}

/** …and the distance alone, for the one place that only wants the number. */
function segmentGap(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
): number {
  closestPoints(p1, q1, p2, q2);
  return _ca.distanceTo(_cb);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Angle from `a` to `b` measured about `axis`, signed, all three assumed unit. */
function signedAngle(a: THREE.Vector3, b: THREE.Vector3, axis: THREE.Vector3): number {
  const pa = _pa.copy(a).addScaledVector(axis, -a.dot(axis));
  const pb = _pb.copy(b).addScaledVector(axis, -b.dot(axis));
  if (pa.lengthSq() < 1e-10 || pb.lengthSq() < 1e-10) return 0;
  pa.normalize();
  pb.normalize();
  return Math.atan2(_pc.copy(pa).cross(pb).dot(axis), pa.dot(pb));
}
