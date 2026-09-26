// The skater's body — driven by the custom motion set compiled from
// `genex motion` takes (the Meshy catalog has no skateboard actions, so the
// rolling stance, the push, the ollie and the kickflip were all generated for
// this game).
//
// The skate model owns height and travel; this layer only decides which clip
// is playing and how strongly. `yCap` on the one-shots keeps the clip's own
// hips-rise from double-counting the pop the physics already applied.
//
// ONE take per move, and TWO facts about which way round the skater is, which
// this layer keeps apart because every wrong answer it has had came from mixing
// them (`side` has the whole argument):
//   · `stance` — which end of the deck his body is set up to lead. A half-turn
//     of the whole rider, carried by a group above the skeleton
//     (`stanceGroup`), which the clip never knows about.
//   · `fakie` — whether the wheels are running toward that end or the other
//     one. A REFLECTION of the take, nose for tail (`mirror.ts`), built once at
//     load and swapped in with the clip's own crossfade.
//
// The held moves — the grinds, the manual, the grab — are built in TWO halves,
// and the split is the rig's rather than a compromise:
//   · the LEGS are the game's. The board is stood on his soles, so how low he
//     stands (`Posture.depth`, a real parked squat out of the crouch take) and
//     what his knees do in the air (`tuck`/`fold`) are facts about where the deck
//     is, and no take performed without a board can be trusted with them.
//   · the BODY ABOVE THE WAIST is a take's. Four were generated for the four
//     moves the player named — the grab, the manual, the 50-50, the boardslide —
//     and THREE of them are laid on from the waist up (`anim/pose-take.ts`),
//     which is the half of them that is a rider and not a mime. The grab's was
//     dropped: its upper half is a fact about the board as well, and a performer
//     with no board folded him over his own knees instead of onto the deck.
//     Anything with no take falls back to `POSTURES`: a few measured degrees of
//     arm and waist, which is still what tells a grind from a boardslide on a
//     real skater, and on the grab is still what puts the hand on the griptape.
// A full-body take filmed ON a board outranks both and needs no code: it goes in
// `HAND_CLIPS` under the move's own key and `holdTrick` asks for it first.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  loadRig,
  captureRestAnkle,
  reanchorFeet,
  groundCalibrate,
  curlFingers,
} from "../motion/rigs.js";
import { ClipSet, Animator } from "../motion/anim-runtime.js";
import { mirrorClip, mirrorYaw } from "./mirror";
import { AirBody, AIR_SHAPE, AIR_STANCE, ARMS_WIDEST, IMPACT_SHAPE } from "./anim/air";
import { POSE_TAKES, loadPoseTake, takeFrame } from "./anim/pose-take";
import type { PoseTake, SampledTake } from "./anim/pose-take";
import type { SpinTracker, Stance } from "./contracts";
import type { TrickName } from "./skate-model";

/** Loops that run on their own phase clock rather than the shared gait phase. */
const FREE_LOOPS = ["idle", "skatePush"];

/** Clip names as the compiler emitted them, from the take filenames. */
const CLIP_IDLE = "idle";
const CLIP_PUSH = "skatePush";
const CLIP_OLLIE = "skateOllie";
// The compiler routes a take to a one-shot by its filename; "kickflip" alone
// reads as a loop and seam-cuts the crouch→pop→catch arc, so the take ships as
// `skate-kickflip-ollie.npz` and lands under this name.
const CLIP_KICKFLIP = "skateKickflipOllie";

/** How long one push stroke reads for, seconds. */
const PUSH_STROKE = 0.45;

/**
 * Hand-authored clips play through a three.js mixer rather than the compiled
 * motion runtime — they are already built on this exact skeleton, so there is
 * nothing to retarget. The mixer writes the bones AFTER the stance has been
 * posed, and the two are crossfaded by hand (a mixer weight below 1 would
 * blend against the BIND pose, not against the stance, and flash a half
 * T-pose on the way in).
 */
export interface HandClipRange {
  url: string;
  /** Seconds into the source clip where the usable action begins. */
  start: number;
  /** …and where it ends. */
  end: number;
  /** Seconds of crossfade at each end. */
  fade?: number;
  /**
   * Runs forever instead of once: it wraps at the end and never fades out, and
   * it is what the body falls back to whenever nothing else is playing. Exactly
   * one clip carries this — the rolling stance.
   */
  loop?: boolean;
  /**
   * Degrees of yaw laid on the clip's hips before it is blended in, turning the
   * whole body on the deck. Every clip carries the facing of whoever it was
   * extracted from, and those do not agree: measured off the Hips track, the
   * rolling stance stands at +41°, the push at +70°, the ollie at +15°. A clip
   * more than a few tens of degrees from the stance reads as him standing the
   * wrong way round on the board.
   */
  yaw?: number;
  /** …and the same for the head alone, when the body is right but the gaze is not. */
  headYaw?: number;
}

/** The ollie clip supplied for this rig: crouch at 0.80s → landing by 3.10s. */
export const OLLIE_HAND_CLIP: HandClipRange = {
  url: "./assets/olie_animation.glb",
  start: 0.82,
  end: 3.1,
  fade: 0.22,
};

/**
 * The push, hand-authored for this rig: he turns out of the sideways stance,
 * plants the front foot and sweeps the back one along the ground.
 *
 * The source holds TWO strides; a push is one, so the range is the first —
 * feet together at 0.08, back foot swept out by 0.35, back together by 0.89.
 * Running the pair as one push read as a shuffle.
 *
 * Its standing foot slides 15.1 cm (`tools/push-feet.html`), which used to drag
 * the whole skater 27.7 cm along the deck. That is no longer this clip's
 * problem: the rig freezes where he stands for the duration of a push, so the
 * slide stays in the clip instead of moving his body. A generated replacement
 * (video → motion, `cms1tk72j00bf22lpjamg9kiy`) slid 11.9 cm but read worse in
 * motion, and the player asked for this one back.
 */
export const PUSH_HAND_CLIP: HandClipRange = {
  url: "./assets/push.glb",
  start: 0.08,
  end: 0.89,
  fade: 0.26,
};

/**
 * The wind-up crouch, extracted from the reference footage the player supplied
 * (`crouch.mov`, MIRRORED before extraction → video-to-motion). He sinks from
 * the rolling stance into a loaded squat — his hips drop 11.8 cm, bottoming out
 * at 0.40 s and holding there — which is why it can be parked at the end frame
 * for as long as the jump key is down.
 *
 * The same clip does the landing cushion, played shorter and shallower.
 *
 * Mirroring is what fixed the facing: this extraction stands at +20° against the
 * rolling stance's +41°, so `yaw` only has 21° left to take out. The first take
 * (`pre-jump.mov`, unmirrored, `cms1wybaj00ms22lpcmeiodyw`) came out at +122° — a
 * right angle round — and its 21 cm squat was deeper but needed an 81° turn.
 */
export const CROUCH_HAND_CLIP: HandClipRange = {
  url: "https://assets.auras.cc/generations/cms2bqswu01bf22lpi7napen5/character-motion-uthana-mh7ZGKXBdQoc-glb",
  start: 0.02,
  end: 0.42,
  fade: 0.16,
  yaw: 21,
  // The subject in the footage watches his own board go down. The rolling
  // stance holds the head 53° round from the body, looking down the line; this
  // brings the crouch back to the same place — the clip reads head −38° against
  // the stance's 0°. The head bone is pitched, so a turn about the vertical
  // swings its gaze ~2.4× as far as the angle applied: 38° over-rotated it to
  // +53°, and this is the value that lands on 0.
  headYaw: 16,
};

/** How long the sink into the loaded crouch takes, seconds. */
const CHARGE_SPAN = 0.34;
/** The landing cushion: shorter, and only this much of the crouch's depth. */
const CUSHION_SPAN = 0.34;
const CUSHION_DEPTH = 0.55;

/**
 * The rolling stance — the pose he holds whenever he is just riding.
 *
 * Text-to-motion could not produce this: with no board in the description it
 * has nothing to stand across, and it kept returning a man standing at
 * attention with his feet together. This one was extracted from reference
 * FOOTAGE of an actual skater instead, so the wide stance, the side-on body
 * and the head turned down the line come from someone really riding.
 *
 * The ends do not meet, so the wrap re-runs the same crossfade the one-shots
 * use rather than cutting.
 */
export const RIDE_HAND_CLIP: HandClipRange = {
  url: "https://assets.auras.cc/generations/cms1pxt86000i22lphj1usysu/character-motion-uthana-mSN1m41g3uF6-glb",
  start: 0.4,
  end: 4.8,
  fade: 0.35,
  loop: true,
};

/**
 * Every hand-authored clip the skater owns, by the key the game asks for.
 *
 * ONE entry is a whole move: the take's URL, the slice of it that is the
 * action, the crossfade, and the two facing corrections. There is no
 * switch-stance variant to film and never will be — the half-turn is a group
 * above the skeleton and the fakie take is this one reflected. See `side`.
 *
 * A trick clip lands by adding a line. The keys the rest of the game already
 * asks for, and which currently fall back to the ollie's body or to no clip at
 * all, are: `kickflip`, `heelflip`, `shoveit`, `grab`, `manual`, `noseManual`,
 * `fifty`, `boardslide`, `nosegrind`, `tailslide`, `smith`. Shape:
 *
 *   kickflip: {
 *     url: "https://assets.auras.cc/generations/<id>/character-motion-…-glb",
 *     start: 0.0,   // where the action begins, seconds into the take
 *     end: 1.2,     // …and ends
 *     fade: 0.12,   // crossfade at each end
 *     yaw: 0,       // degrees to turn the hips so he stands square on the deck
 *     headYaw: 0,   // …and the head alone. Positive turns him toward the nose.
 *   },
 *
 * `yaw` is measured against the rolling stance's own facing, which sits at
 * +41°: read the take's hips facing in `tools/move-film.html`'s YAW column and
 * enter the difference. Nothing else changes — a held move (grab, manual, a
 * grind) is the same entry, played through `holdTrick`, which runs it once into
 * its shape and parks it there the way the wind-up crouch is parked. `loop` is
 * the rolling stance's alone.
 */
export const HAND_CLIPS: Record<string, HandClipRange> = {
  ride: RIDE_HAND_CLIP,
  ollie: OLLIE_HAND_CLIP,
  push: PUSH_HAND_CLIP,
  crouch: CROUCH_HAND_CLIP,
};

/**
 * Which clip a trick asks for. A trick with no clip of its own falls back to
 * the ollie's body, which is not a compromise: a kickflip, a heelflip and a
 * shove-it ARE an ollie from the waist up, and what tells them apart is the
 * board — `SkateModel.flipAxis` / `flipSign`, spun by the rig.
 */
const TRICK_CLIP: Readonly<Record<TrickName, string>> = {
  Ollie: "ollie",
  Kickflip: "kickflip",
  Heelflip: "heelflip",
  "Shove-it": "shoveit",
  Grab: "grab",
  Manual: "manual",
  "Nose Manual": "noseManual",
  "50-50": "fifty",
  Boardslide: "boardslide",
  Nosegrind: "nosegrind",
  Tailslide: "tailslide",
  Smith: "smith",
};

/**
 * A held move nobody could film for us, standing on the moves we have.
 *
 * All four numbers are a real skater's, in the order you would coach them:
 * how low he stands, how far his arms come out to hold it, which way his weight
 * is over the board, and — for the grab alone — the back hand going down to the
 * deck. `depth` is a fraction of the crouch clip's own sink, so it is a REAL
 * squat on this skeleton and not a rig-level dip; the rest are degrees.
 *
 * Everything but `depth` is laid on ABOVE the hips, for the same reason the
 * spin flourish is: the board is stood on the soles, so a wind anywhere at or
 * below them moves the deck instead of the body.
 */
interface Posture {
  /**
   * How far into the crouch's sink he goes, 0 → 1 of its range.
   *
   * The clip is the only depth control there is, and it has a floor: its first
   * frame already stands 15.9 cm below the rolling stance, and the far end is
   * 26.5 cm, so every shape below lives inside that band (`tools/hold-check.mjs`
   * prints the ladder). Blending the crouch in at partial WEIGHT looks like a
   * finer knob and is not one — the crossfade's under-layer is its own previous
   * output, so any weight above zero creeps to the full pose within a few
   * frames.
   *
   * **Zero means no crouch at all**: the shape is laid on whatever he is riding,
   * which is the rolling stance. That is not a rounding of the band above, it is
   * the other side of its floor — a move that should read as ROLLING cannot use
   * this clip at any depth, because its shallowest frame is already a 16 cm
   * squat.
   */
  depth: number;
  /** Degrees each arm swings out from the body — the balance you can see. */
  spread: number;
  /** Degrees the waist carries his weight toward the TAIL; negative is the nose. */
  lean: number;
  /** Degrees the tail-side arm comes down and across, toward the deck. */
  reach: number;
  /**
   * Degrees that arm's elbow straightens with it. The crouch holds both hands
   * up in front of him with the elbows folded, and a folded elbow is why the
   * shoulder alone cannot get the hand anywhere near the deck.
   */
  elbow?: number;
  /**
   * Degrees each hip flexes — the knees coming up under him — and the knee
   * folding with them.
   *
   * These two are the ONLY numbers in this table that live below the hips, and
   * they break the rule the rest of the file keeps for a reason that only holds
   * in the air. The board is stood on the soles, so lifting a sole on the GROUND
   * drives the deck up through the rider; airborne, `SkaterRig.followFeet` flips
   * round and the board rides the feet, so lifting the soles brings the DECK up
   * with them. That is the whole of how a grab reaches the board on this rig
   * (see `POSTURES.Grab`): you do not reach down to a board, you pull the board
   * up to your hand, which is also what a skater actually does.
   *
   * So a tuck belongs only to a move the trick book marks `where: "air"`. The
   * grab is the only posture in this table that carries one, `tools/anim-check.mjs`
   * asserts that it stays the only one, and `SkaterAnim.holdAir` is where they
   * are applied — merged with the air pose's own tuck rather than added to it.
   */
  tuck?: number;
  fold?: number;
  /**
   * Seconds this shape takes to come on and to come back off, when
   * `POSTURE_FADE` is not long enough for it.
   *
   * Only the grab asks. Every other shape here is a few tens of degrees of arm
   * and waist, and 0.18 s puts its worst single-frame joint move at 9–10°
   * (`tools/hold-check.mjs`, HANDOVER) — the same as the stance turn's own,
   * which is the fastest thing on this body anybody has accepted. The grab is
   * 40° of hip and 112° of knee, six times the movement, and on the shared ramp
   * it measured **24.3°** on the worst frame going in and 18.4° coming out. At
   * 0.26 s it is 18.1° / 14.3°, which is a rider snatching his board up quickly
   * rather than the pose arriving in three frames.
   */
  fade?: number;
}

/**
 * The read for every held move whose clip failed to generate.
 *
 * The two grinds differ the way they differ on a rail: the 50-50 is a shallow
 * ready squat with the arms out a little, and the boardslide is deeper and
 * wider because the board is across the line and there is nothing to steer with
 * — that turn is `SkaterRig.grindYaw`'s, and it carries the rider with it, so
 * the body is already across the rail before any of this runs.
 *
 * Exported for the same reason `HAND_CLIPS` is: every number in here was picked
 * off a measurement, and it is `tools/hold-check.mjs` that has to be able to
 * sweep them.
 */
/**
 * Per-BODY corrections to the table below — a few degrees, named by trick.
 *
 * WHY THIS EXISTS. Every number in `POSTURES` was swept against ONE rig, and
 * the game now has two. The two skeletons turn out to be far more compatible
 * than anyone expected — identical bone names, identical hierarchy, and every
 * clip binds 24/24 on both with every animated bone landing within a third of a
 * degree, because these clips carry full local quaternion tracks that REPLACE
 * the bind rotation instead of composing with it. So the depth ladder, the
 * grinds and the manuals all survive a body swap untouched: the second rig's
 * crouch bottoms out at 45.8 cm against the first's 45.6, and every held move
 * lands within 1 cm of where it was tuned.
 *
 * ONE shape does not survive, and it is the grab — because the grab is the only
 * posture whose success is measured against the BOARD rather than against
 * himself. `POSTURES.Grab`'s tuck and fold were swept over 768 poses on rig 1;
 * rig 2 has 5.4 cm more leg and 4.3 cm less foot, which lifts the deck that much
 * higher relative to his body under the same angles, and his wrist ends up
 * **1.8 cm INSIDE the deck, planted mid-griptape**, with the free hand back down
 * at 8.5 cm — the two-hands-on-one-board failure the player already rejected
 * once. `fold` moves the hand ~0.56 cm per degree and `reach` moves it ~0.81 cm
 * across on BOTH rigs, so the shapes respond identically; they simply start from
 * different bodies, and no single pair of numbers serves both.
 *
 * Keep this table SMALL. It is a correction, not a second design. A third
 * character needs its own sweep (`tools/grab-sweep.mjs`, 320 poses of
 * `fold` × `reach`, seconds of `node`), and if a future entry starts listing
 * every trick, the right answer is that the posture layer should be measuring
 * the body rather than being told about it.
 *
 * **AND A THIRD BODY HAS NOW BEEN SWEPT, AND IT PROVED THIS TABLE IS NOT THE
 * GATE.** The Runaway (`runaway`, rigged 2026-07-29) has NO entry here and must
 * not be given one. Her 320-pose sweep found nothing, so the net was widened to
 * the whole shape — 8 tucks × 18 folds × 16 reaches, 2,304 poses — and of the 23
 * that put a hand on a rail a few cm over the griptape, ZERO are on the TOE-side
 * rail with the board brought up to her. The reason is upstream of every number
 * in here: the hand-authored clips are played raw at the rig (`attachHandClip`
 * retargets nothing), and her LOCAL rest rotations sit 138.6° from the rig those
 * clips were authored on — Spine02 138.6°, Hips 136.1°, both `UpLeg`s over 135°,
 * against The Timekeeper's worst bone of 35.4°. A local-rotation track REPLACES
 * the bind rotation, so on her it means something else: her rolling stance comes
 * out with `Spine02` 6.4 cm BELOW her hips and her shoulder 82.4 cm over the
 * soles against 121.2 on the RETARGETED compiled set. Her torso is folded before
 * this layer gets a turn, and the deck — which rides her soles in the air — ends
 * up above her shoulder. Numbers in this table would be tuning around that.
 * Her GLB is fine: in bind she measures like her neighbours to the centimetre.
 */
export type PostureTweak = Partial<Record<TrickName, Partial<Posture>>>;

export const POSTURES: Partial<Record<TrickName, Posture>> = {
  // 19.5 cm lower than the rolling stance, with a 68 cm hand span against its
  // 44 cm — measured, both ways round, in `tools/hold-check.mjs`.
  "50-50": { depth: 0.3, spread: 8, lean: 0, reach: 0 },
  // …and the boardslide is 6.3 cm lower again and 26 cm wider across the hands,
  // which is the difference you can see from behind on a rail.
  Boardslide: { depth: 0.8, spread: 30, lean: 0, reach: 0 },
  // A nosegrind is over the front truck and a tailslide over the back one, so
  // what separates those two from the pair above is where his weight sits.
  //
  // The two that lean BACK ask for more degrees than they look like they should,
  // and the reason is the clip they are laid on: the crouch pitches the torso
  // further forward the deeper it goes (−12.8° at the 50-50's depth, −14.3° at
  // the tailslide's, against the rolling stance's −6.0°), so a backward lean
  // spends its first 20° climbing out of that before any of it shows. Measured
  // on the torso itself, the waist returns 0.67° for every degree asked. At the
  // 16° the tailslide used to ask, his torso still sat 3.6° FORWARD of vertical
  // — a deep crouch, and nothing a viewer would call weight over the tail. At 28
  // it sits 4.5° back, which is 18° of daylight against the 50-50 beside it.
  Nosegrind: { depth: 0.45, spread: 14, lean: -16, reach: 0 },
  Tailslide: { depth: 0.8, spread: 30, lean: 28, reach: 0 },
  Smith: { depth: 0.55, spread: 20, lean: 20, reach: 0 },
  // The manuals are the only shapes here with NO crouch in them, and that is
  // the difference between a wheelie and a squat. A manual is rolling: he holds
  // his riding height (72.5 cm) rather than the crouch clip's 16 cm floor, which
  // is what made a manual read as a man crouching on a raked board.
  //
  // **The lean CANCELS the deck's rake — it does not add to it.** This is the
  // player's own correction and it reversed both signs below: "when he does a
  // manual he himself shouldn't lean, the character should stay facing forward,
  // only the board tilts… he stands completely vertical, it's just his legs."
  // `SkaterRig.followFeet` turns the whole rider with the deck, because that is
  // the only thing keeping his soles in the plane of a plank at 17°
  // (`MANUAL_PITCH`) — so what is left for this table is to take the TORSO back
  // off that angle at the waist and leave the legs raked underneath it.
  //
  // Measured on the real ride, `tools/anim-check.mjs`: rolling reads −5.0° over
  // the tail, and the rig's rake alone puts a manual at +17.3° and a nose manual
  // at −23.4°. The numbers below are what brings each of those back to the
  // rolling stance's own angle, which is this body's vertical — the +26 of a
  // nose manual was already measured landing on −5.0° exactly.
  Manual: { depth: 0, spread: 22, lean: -26, reach: 0 },
  "Nose Manual": { depth: 0, spread: 22, lean: 26, reach: 0 },
  // …and the grab, which is the one move that genuinely wanted its own clip and
  // does not get one.
  //
  // **It was the wrong question for two rounds.** Round 2 measured the hand
  // 42.0 cm above the soles at the bottom of the squat and proved the arm could
  // not close it: the shoulder sits 87.6 cm above the soles and the whole arm is
  // 51.1 cm, so an arm hanging DEAD STRAIGHT down still stops 36.5 cm up, and a
  // sweep of `reach` × `elbow` over 42 pairs won 5.5 cm of that and no more.
  // Every one of those numbers is still true. They are just an answer to "how
  // far down can he reach", and a skater grabbing his board does not reach down
  // — **he pulls the board UP.**
  //
  // Which this rig can do, because airborne the board rides the soles rather
  // than the other way round (`SkaterRig.followFeet`). `tuck` and `fold` bring
  // the knees up under him and the deck comes with them. Swept over 768 poses
  // of these four angles and measured against the deck's real top face — 10 cm below the soles in the air, 21 cm wide: this pose puts
  // the wrist **6.5 cm off the griptape at the toe-side rail** (x = −10.5 cm,
  // which is the rail to the centimetre) and 17.5 cm back toward the tail, which
  // is between his feet where a hand goes. Before the tuck it was 52 cm away.
  // His knees end level with his hips and no higher: deeper reached the deck
  // sooner and read as a cannonball, not a grab.
  //
  // Parking the ollie's airborne tuck instead was tried in round 2 and measured
  // worse (hand 61 cm up and 59 cm behind him — a jump throws the arms back).
  // This is that idea done to the LEGS, where it belongs.
  //
  // **The FREE arm is the other half of a grab and used to be 12°.** The board
  // comes up to hip height under this tuck, and at 12° the hand that is NOT
  // grabbing came up with it: measured at the held frame, 7.9 cm off the griptape
  // at the nose riding regular and 3.6 cm riding switch — nearer the deck than
  // the grabbing hand was. Two hands on one board is not a grab, it is a man
  // hanging onto his deck, and it is half of what the player was looking at when
  // he called this one crooked. Swept 12 → 44° with the reaching arm untouched
  // (it is a different bone and does not move by so much as a millimetre):
  //
  //   spread    12°     20°     28°     36°     44°
  //   regular  7.9 cm  11.4    16.3    22.3    28.6   free hand off the griptape
  //   switch   3.6 cm   6.2     9.8    15.0    21.0
  //
  // 28 is where the free hand clears the deck in BOTH stances — 16.3 / 9.8 cm,
  // out past the nose and level with his hips — and it opens his hands to 72.4 cm
  // apart against the 50-50's 68.3, which is a balancing arm and not a windmill.
  // 36 and up throws it over his head and starts to read as a bail.
  Grab: { depth: 1, spread: 28, lean: 4, reach: 24, elbow: 28, tuck: 40, fold: 112, fade: 0.26 },
};

/**
 * There was a shoulder check here — three fixed turns, 22° of waist plus 43° of
 * chest plus 60° of head, laid over the ordinary clip whenever the wheels ran
 * the other way. It answered the right question with the wrong instrument and a
 * player named the defect exactly: "you just turned the head, while the body is
 * facing backward even though I'm moving forward."
 *
 * He was right, and the reason is that 125° of spine is not what a rider does
 * riding fakie. A skater's shoulders open ~47° toward the end he is going to,
 * and going the other way they open ~47° toward the OTHER end — a 94° swing
 * that lands in his hips and his whole torso together, not a crank of the neck
 * over a pelvis still pointed backwards. That swing is a reflection of the pose,
 * nose for tail, which is exactly `mirror.ts` — and it comes with the rest of
 * the stance for free: the other foot leaves the deck to push, off the other
 * end, stroking the other way. No number in a table here could have done that.
 */

/** Seconds a posture takes to come on, and to come back off. */
const POSTURE_FADE = 0.18;

/**
 * How long the body takes to come round into the other stance, seconds.
 *
 * It is a REAL half-turn: the group carries the whole 180°, because the take
 * playing through it is the same one either way (the reflection belongs to
 * `fakie`, which a half-turn never fires with — see `syncStance`). It used to be
 * 0.35 s, measured back when a mirror was pinned to the stance and its own
 * facing came back the other way and ate most of the group's 180°, leaving a
 * body that swept 99.5°. Against a real 180 the same 0.35 s came out at 13.9°
 * on the worst frame at 60 fps: 834°/s, against the air spin's own 435°/s. A
 * settle turning twice as fast as the spin that caused it is the whip this
 * constant exists to prevent.
 *
 * 0.45 s puts the peak back under the spin's rate. It is still faster than the
 * player can see it start and stop — a real revert is about this quick — and it
 * is measured on the ramp, where the turn runs on its own with no landing
 * cushion crossfading underneath it (`tools/turn-check.mjs`).
 */
const STANCE_TURN = 0.45;

/** Bones the board is stood on — one ankle and one toe per side. */
const FOOT_BONES = ["LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"];

/** The bone the eye actually tracks as "him" — see `readUpperBody`. */
const HEAD_BONE = "Head";
/**
 * The bone the spin is sold on. Named per rig; this Meshy skeleton runs
 * Hips → Spine02 → Spine01 → Spine, so the middle of the back is `Spine01`.
 * It has to be ABOVE the hips: winding anything at or below them moves the
 * feet, and the rig stands the board on the soles.
 */
const CHEST_BONES = ["Spine01", "Spine1", "Chest", "Spine"];
/**
 * …and the bone a lean starts at: the LOWEST link above the hips, so the whole
 * torso goes over the tail rather than only the shoulders. Same rig, so
 * `Spine02` first.
 */
const WAIST_BONES = ["Spine02", "Spine2", "Spine", "Spine1"];
/**
 * The upper arms, which is where a balance spread and a grab's reach live, and
 * the forearms, which is the only way the reaching hand gets down to the deck.
 */
const ARM_BONES = { left: "LeftArm", right: "RightArm" } as const;
const FOREARM_BONES = { left: "LeftForeArm", right: "RightForeArm" } as const;
/** Read for the character's own left/right axis — one hip to the other. */
const HIP_BONES = { left: "LeftUpLeg", right: "RightUpLeg" } as const;
/**
 * The legs — the only bones below the hips anything here turns, and only ever
 * in the air. See `Posture.tuck` for why that is safe up there and wrong down
 * here. The thighs are the same two bones the character's own left/right axis
 * is read off; they are named twice because they are used for two things.
 */
const THIGH_BONES = { left: "LeftUpLeg", right: "RightUpLeg" } as const;
const SHIN_BONES = { left: "LeftLeg", right: "RightLeg" } as const;

/** Vertical, for the per-clip facing correction. */
const UP = new THREE.Vector3(0, 1, 0);
/** …and the two axes the spin flourish works in, in the rig's rest frame. */
const FORWARD = new THREE.Vector3(0, 0, 1);

// --- the body during a spin --------------------------------------------------
// A rotation applied to the root turns a statue. What sells a spin is the body
// getting there first: the head leads, the chest follows it round, and the
// shoulders drop into the turn. All three are laid on ABOVE the hips so the
// feet never move and the board never chases them.
//
// `AIR_SPIN_RATE` in the ride model is 7.6 rad/s — this is that, in degrees,
// and it is what the flourish is scaled against so a full-speed spin reads at
// full strength and a steering correction reads at almost none.
const SPIN_FULL = (7.6 * 180) / Math.PI;
/** Degrees the head leads the turn by, at full spin rate. */
const HEAD_LEAD = 16;
/** …and the chest, which trails the head and leads the hips. */
const CHEST_LEAD = 9;
/** Degrees the shoulders drop into the rotation. */
const CHEST_ROLL = 6;
/**
 * The backstop on the rate, for a tracker whose degrees moved without the
 * tracker itself saying why. A reset is caught by its own signature (see
 * `readSpin`); nothing on this ride turns faster than this under its own steam,
 * so anything that does is a number being written, not a body turning.
 */
const SPIN_STEP_MAX = 900;

interface HandClipSide {
  range: HandClipRange;
  action: THREE.AnimationAction;
  /** True for the reflected take — `turnClip` takes its yaws the other way. */
  fakie: boolean;
}

/** One move, both ways the wheels can be running. See `side`. */
interface HandClipEntry {
  /** The take as filmed: the end he stands to lead is the end he is going to. */
  readonly ahead: HandClipSide;
  /** …reflected nose for tail, for when the wheels run the other way. */
  readonly fakie: HandClipSide;
}

/** Where the skater's soles are, in whatever space was queried. */
export interface FootAnchor {
  /** Mid-point between the two soles. */
  readonly mid: THREE.Vector3;
  /**
   * The lower sole on its own. During a push only one foot is on the deck, and
   * the board belongs under THAT one — centring on the mid-point leaves the
   * board halfway between the deck and the swinging leg.
   */
  readonly planted: THREE.Vector3;
  /** Nose-up pitch implied by the line through the two feet, radians. */
  pitch: number;
}

export class SkaterAnim {
  /** The loaded rig's holder — parent this above the deck. */
  readonly model: THREE.Group;
  /**
   * Turned a half-turn about the vertical for switch stance, INSIDE the
   * holder the rig yaws for the deck.
   *
   * It is the WHOLE of switch stance, and that is worth stating plainly because
   * it used to be half of it. The other half was a sagittal mirror of the clip,
   * on the reasoning that the holder stands the skater sideways with
   * `SKATER_YAW = -π/2` (call it A), a reflected clip applies S = diag(-1,1,1)
   * in the rig's own frame, and S·A = R(ŷ,π)·A·S — so mirror plus π equals the
   * skater reflected across the board's lengthwise vertical plane. The algebra
   * is right and the answer is the wrong stance: that reflection is a goofy
   * rider going NOSE-first, and this game only ever goes switch when the wheels
   * are running the other way. A half-turn on its own is the rider turned round
   * on his own deck, which is what the ride means by it and what the player
   * asked for. `side` carries the measurements.
   *
   * It sits below the holder rather than being folded into the holder's yaw so
   * that everything measured against the CHARACTER — the soles the board is
   * stood on, the head the push lean-cancel watches — keeps reading in the
   * board's frame, nose at +Z, whichever way round he is standing.
   */
  private readonly stanceGroup: THREE.Group;

  private anim: InstanceType<typeof Animator>;
  private clipSet: InstanceType<typeof ClipSet>;
  private pushWeight = 0;
  private pushHold = 0;
  private stanceNow: Stance = "regular";
  // --- coming round into the other stance ----------------------------------
  // The turn is eased on the SAME ramp as the pose, and it is eased by
  // interpolating between two cached angles rather than by adding a slice of a
  // turn each frame. Adding would compound the moment the clip parks — the trap
  // the yaw correction fell into (DESIGN.md, 2026-07-26) — and the assignment
  // here is absolute, so a parked frame simply re-writes the same number.
  private stanceFrom = 0;
  private stanceTo = 0;
  /** Starts settled — he drops in riding regular, with no turn to finish. */
  private stanceAge = STANCE_TURN;
  private stanceSpan = STANCE_TURN;
  /**
   * A stance change waiting on this frame's heading before it picks its ramp.
   *
   * `setStance` is fired from inside the ride model's own step, which is before
   * the rig has told this layer what the ride did with its facing — and that is
   * the whole question (see `planStanceTurn`). So the swap of the clip happens
   * at once, where it has to, and the geometry waits for `update`, which is
   * still the same frame.
   */
  private stancePending = false;
  /** Radians the RIDE turned this frame, as `SkaterRig.sync` measured it. */
  private rideTurn = 0;

  // --- hand-authored clip layer -------------------------------------------
  // One mixer for the rig, one registered clip per move. Exactly one action is
  // ever playing, because the whole layer is scrubbed by absolute time.
  private mixer: THREE.AnimationMixer | null = null;
  private hands: Record<string, HandClipEntry> = {};
  private hand: HandClipSide | null = null;
  /** The move `hand` is a side of, so a fakie change can swap sides mid-clip. */
  private handEntry: HandClipEntry | null = null;
  /** The wheels are running against the end his stance leads. See `side`. */
  private fakieNow = false;
  /** Set when the action changed under the mixer — see `updateHandClip`. */
  private mixerStale = false;
  /** Which move `hand` belongs to — the twin swap re-reads the same key. */
  private handKey: string | null = null;
  private handBones: THREE.Object3D[] = [];
  private handSaved: THREE.Quaternion[] = [];
  private hips: THREE.Object3D | null = null;
  /** Where the hips and the head sit in `handBones` — see `turnClip`. */
  private hipsIndex = -1;
  private headIndex = -1;
  private yawFix = new THREE.Quaternion();
  /** The turned pose of each corrected bone, and the scrub time it was made at. */
  private turned = new Map<number, THREE.Quaternion>();
  private lastScrub = Number.NaN;
  private hipsSaved = new THREE.Vector3();
  private handElapsed = 0;
  /** Seconds since this clip's last fade began — unlike handElapsed it is
   *  reset at every loop wrap, which is what smooths the seam. */
  private handAge = 0;
  private handSpan = 0;
  /** Slice of the source clip this play is scrubbing, in source seconds. */
  private handFrom = 0;
  private handTo = 0;
  private handPlaying = false;
  /** Seconds a landing is still moving his feet for — see `landingSettling`. */
  private cushionLeft = 0;
  /**
   * Parks the clip on its last frame at full weight instead of ending it —
   * that is what turns the crouch into a HELD wind-up for as long as the jump
   * key is down.
   */
  private handHold = false;
  private tmpQuat = new THREE.Quaternion();
  private tmpVec = new THREE.Vector3();

  /**
   * The pose the body was actually in when the current clip started. A clip
   * that fades in from the rolling loop instead snaps whenever it interrupts
   * something — pop an ollie halfway through a push and the legs would jump
   * back to the loop before the trick took over.
   */
  private fromPose: THREE.Quaternion[] = [];
  private fromHips = new THREE.Vector3();

  // --- foot lookup, for standing the board under the soles -----------------
  // Ankle AND toe on each side: the ankle bone sits at the back of the shoe,
  // and the skater stands ACROSS the deck, so anchoring on it alone hangs the
  // toes off the front rail. The middle of ankle-to-toe is the middle of the
  // shoe, which is what the board wants to be centred on.
  private feet: Record<string, THREE.Object3D> = {};
  private head: THREE.Object3D | null = null;
  private chest: THREE.Object3D | null = null;

  // --- the held moves with no clip -----------------------------------------
  /** The bones a posture turns: the waist and the two upper arms. */
  private waist: THREE.Object3D | null = null;
  private armL: THREE.Object3D | null = null;
  private armR: THREE.Object3D | null = null;
  private foreL: THREE.Object3D | null = null;
  private foreR: THREE.Object3D | null = null;
  /** …and the legs, which only the air ever turns. */
  private thighL: THREE.Object3D | null = null;
  private thighR: THREE.Object3D | null = null;
  private shinL: THREE.Object3D | null = null;
  private shinR: THREE.Object3D | null = null;
  /**
   * The character's own axes, read off the skeleton at load and held in the
   * stance group's frame — which is the skeleton's own frame, in both stances.
   */
  private charFwd = new THREE.Vector3(0, 0, 1);
  private charLeft = new THREE.Vector3(1, 0, 0);
  /** …and his own vertical, which is what a facing correction turns about. */
  private charUp = new THREE.Vector3(0, 1, 0);
  private postureAxis = new THREE.Vector3();
  private postureQuat = new THREE.Quaternion();
  private frameQuat = new THREE.Quaternion();
  /** Scratch for `abduction` — which way one upper arm is pointing. */
  private armDir = new THREE.Vector3();
  /** The shape he is holding, and how far into it he is — 0 → 1, both ways. */
  private posture: Posture | null = null;
  private postureLevel = 0;
  private postureTarget = 0;
  /**
   * Seconds the shape he is holding takes to come on and off — its own `fade`
   * if it asked for one. Held past the release rather than read off `posture`
   * each frame, so a shape rides OUT on the same ramp it rode in on even though
   * `posture` is cleared the moment the level reaches zero.
   */
  private postureSpan = POSTURE_FADE;

  // --- the held moves' own takes -------------------------------------------
  /** Every take that loaded, by the move it was generated for. */
  private takes: Partial<Record<TrickName, SampledTake>> = {};
  /**
   * The take posing him above the waist right now, and how far into it he is.
   *
   * It rides the SAME ramp as the posture — `postureLevel` — because it is the
   * same fact: a held shape coming on and going off. The two never both drive
   * the upper body (`holdPosture` stands down while a take is on), so one ramp
   * is the whole truth about how far in he is.
   */
  private takeNow: SampledTake | null = null;
  /** Seconds this take has been held — its own playback clock. */
  private takeAge = 0;
  private takeQuat = new THREE.Quaternion();
  /** The bone a take's facing correction turns: the lowest link above the hips. */
  private spineRoot: THREE.Object3D | null = null;

  // --- being off the ground ------------------------------------------------
  /**
   * How big the air he is in is, and how hard the last one ended. It is fed by
   * the pop (`playTrick`) and the landing (`playCushion`), and `setAir` is the
   * door for the airs neither of those announces — see `anim/air.ts`.
   */
  private air = new AirBody();

  private footA = new THREE.Vector3();
  private footB = new THREE.Vector3();
  private tmpFoot = new THREE.Vector3();
  private invSpace = new THREE.Matrix4();

  // --- the spin ------------------------------------------------------------
  /** Where the model's spin tracker stood last frame, degrees. */
  private spinLast = 0;
  /** …and its peak, which only ever grows until a reset zeroes it. */
  private spinPeak = 0;
  /** …turned into a rate and normalised: −1 hard screen-right, +1 screen-left. */
  private spinDrive = 0;
  private spinQuat = new THREE.Quaternion();
  /**
   * The bones the flourish turned this frame, and what they held before it.
   *
   * The flourish is a premultiply onto a live bone, so it has to be invisible
   * to everything that READS the body — the crossfade's two reference poses
   * both do — or a lean gets snapshotted as if it were part of the clip and
   * then laid on top of itself. Measured before this was kept: the frame after
   * a loop wrap came out at twice the lean, and the frame the spin stopped
   * kept the whole of it.
   */
  private flourish: Array<{ bone: THREE.Object3D; before: THREE.Quaternion }> = [];

  /**
   * `POSTURES` with this BODY's corrections already folded in — see
   * `PostureTweak`.
   *
   * Merged ONCE here rather than spread at the read site, because the read site
   * is `holdPosture` and that runs on every frame a shape is held. It is also
   * the only reader, which is what makes the whole mechanism fifteen lines.
   */
  private postures: Partial<Record<TrickName, Posture>> = POSTURES;

  private constructor(
    model: THREE.Group,
    stanceGroup: THREE.Group,
    anim: InstanceType<typeof Animator>,
    clipSet: InstanceType<typeof ClipSet>,
  ) {
    this.model = model;
    this.stanceGroup = stanceGroup;
    this.anim = anim;
    this.clipSet = clipSet;
  }

  /**
   * Loads a humanoid (VRM or Meshy/Mixamo GLB) and binds the compiled skate
   * set to it. The rig is calibrated at the ORIGIN inside a detached holder —
   * the ankle/ground maths assume a root at y = 0 — and only then handed back
   * to be parented onto the moving board.
   */
  static async create(
    modelUrl: string,
    setUrl: string,
    tweak?: PostureTweak,
  ): Promise<SkaterAnim> {
    const res = await fetch(setUrl);
    if (!res.ok) throw new Error(`motion set ${setUrl} → ${res.status}`);
    const set = await res.json();

    const holder = new THREE.Group();
    // The rig is loaded and calibrated inside the stance group, not the holder,
    // so every one of the motion runtime's world-space measurements sees the
    // frame it always saw. The group is identity until he lands switch.
    const stanceGroup = new THREE.Group();
    holder.add(stanceGroup);
    const rig = await loadRig(modelUrl, set, stanceGroup);
    rig.computeCorrection();

    const restAnkle = captureRestAnkle(rig, stanceGroup);
    reanchorFeet(rig, set, stanceGroup); // must run BEFORE the ClipSet is built
    const clipSet = new ClipSet(rig, set, set.gaits);
    groundCalibrate(rig, clipSet, stanceGroup, restAnkle); // and this one AFTER
    curlFingers(rig, stanceGroup);

    const anim = new SkaterAnim(holder, stanceGroup, new Animator(clipSet), clipSet);
    if (tweak) {
      const merged: Partial<Record<TrickName, Posture>> = { ...POSTURES };
      for (const key of Object.keys(tweak) as TrickName[]) {
        const base = POSTURES[key];
        // A tweak for a shape with no posture is a typo, not an addition — the
        // grinds and the grab are the only shapes built this way and a body
        // cannot invent one. Dropped rather than half-built.
        if (base) merged[key] = { ...base, ...tweak[key] };
      }
      anim.postures = merged;
    }
    holder.traverse((o: THREE.Object3D) => {
      if (FOOT_BONES.includes(o.name)) anim.feet[o.name] = o;
      if (o.name === HEAD_BONE) anim.head = o;
    });
    // In preference order, not traversal order — several of these names can
    // exist on one rig and the middle of the back is the one that reads.
    for (const name of CHEST_BONES) {
      anim.chest = holder.getObjectByName(name) ?? null;
      if (anim.chest) break;
    }
    // Still at the origin, still in the bind pose — the one moment the
    // character's own axes can be read off the skeleton without unpicking
    // whatever a clip has done to it.
    anim.capturePostureBones();
    return anim;
  }

  /**
   * Measures the character's own axes off his bones, and finds the three the
   * posture layer turns.
   *
   * LEFT is one hip to the other and UP is the hips to the waist — read from
   * the rig, the way `mirror.ts` reads the side names off it, rather than
   * assumed from a convention this skeleton may not follow. FORWARD is their
   * cross product, so the three are a genuine basis even if the spine is not
   * quite square over the pelvis. Taken at the origin, in the bind pose, before
   * any clip has had a chance to move them.
   */
  private capturePostureBones(): void {
    const find = (name: string): THREE.Object3D | null => this.model.getObjectByName(name) ?? null;
    this.armL = find(ARM_BONES.left);
    this.armR = find(ARM_BONES.right);
    this.foreL = find(FOREARM_BONES.left);
    this.foreR = find(FOREARM_BONES.right);
    this.thighL = find(THIGH_BONES.left);
    this.thighR = find(THIGH_BONES.right);
    this.shinL = find(SHIN_BONES.left);
    this.shinR = find(SHIN_BONES.right);
    for (const name of WAIST_BONES) {
      this.waist = find(name);
      if (this.waist) break;
    }

    const hipL = find(HIP_BONES.left);
    const hipR = find(HIP_BONES.right);
    const hips = find("Hips");
    if (!hipL || !hipR || !hips || !this.waist) return;

    this.model.updateMatrixWorld(true);
    const at = (bone: THREE.Object3D): THREE.Vector3 =>
      new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
    this.charLeft = at(hipL).sub(at(hipR)).normalize();
    const up = at(this.waist).sub(at(hips)).normalize();
    this.charFwd = new THREE.Vector3().crossVectors(this.charLeft, up).normalize();
    // Squared off the other two rather than taken from the spine directly, so
    // the three are a genuine orthonormal basis even on a pelvis the spine does
    // not sit quite straight on.
    this.charUp = new THREE.Vector3().crossVectors(this.charFwd, this.charLeft).normalize();
    this.spineRoot = this.waist;
  }

  /**
   * One of the character's axes, in the frame `bone`'s own rotation lives in.
   *
   * Solved every frame rather than cached at load, and that is the difference
   * between a lean that works and one that mostly doesn't: the bones a posture
   * turns hang off a PELVIS the crouch has already pitched a long way forward,
   * so an axis measured in the bind pose arrives at the waist pointing somewhere
   * else and half the lean comes out as a twist. Measured: 14° of lean landed as
   * 6.3° of torso against the board; solved live it lands as 13.4°.
   *
   * `getWorldQuaternion` re-solves the ancestors on the way, so this reads the
   * pose the clip just wrote, not last frame's.
   */
  private axisIn(bone: THREE.Object3D, axis: THREE.Vector3): THREE.Vector3 {
    this.stanceGroup.getWorldQuaternion(this.frameQuat);
    this.postureAxis.copy(axis).applyQuaternion(this.frameQuat);
    (bone.parent ?? bone).getWorldQuaternion(this.frameQuat);
    return this.postureAxis.applyQuaternion(this.frameQuat.invert());
  }

  /**
   * Where the soles are right now, in `space`'s frame. The board is stood on
   * this rather than on a fixed height, so it follows a crouch, a pop and a
   * tuck instead of clipping through the legs. Returns false until the rig's
   * foot bones are known.
   */
  readFeet(space: THREE.Object3D, out: FootAnchor): boolean {
    this.invSpace.copy(space.matrixWorld).invert();
    if (!this.readSole("Left", this.footA)) return false;
    if (!this.readSole("Right", this.footB)) return false;

    out.mid.copy(this.footA).add(this.footB).multiplyScalar(0.5);
    out.planted.copy(this.footA.y <= this.footB.y ? this.footA : this.footB);
    // The skater stands across the deck, so his feet separate along +Z — the
    // nose direction. Whichever is further forward is the front foot.
    const front = this.footA.z >= this.footB.z ? this.footA : this.footB;
    const back = front === this.footA ? this.footB : this.footA;
    const dz = front.z - back.z;
    out.pitch = dz < 1e-3 ? 0 : Math.atan2(front.y - back.y, dz);
    return true;
  }

  /**
   * Where his HEAD is, in `space`'s frame. The hips are pinned to the deck by
   * the foot anchor, so they never move — but the push clip pitches everything
   * above them forward and back over the nose, and that swing is what the
   * player sees as the skater sliding up the board and returning. Measuring the
   * head is how the rig knows how much of that to take back out.
   */
  readUpperBody(space: THREE.Object3D, out: THREE.Vector3): boolean {
    if (!this.head) return false;
    this.invSpace.copy(space.matrixWorld).invert();
    out.setFromMatrixPosition(this.head.matrixWorld).applyMatrix4(this.invSpace);
    return true;
  }

  /** Middle of one shoe — halfway from its ankle bone to its toe bone. */
  private readSole(side: "Left" | "Right", out: THREE.Vector3): boolean {
    const ankle = this.feet[`${side}Foot`];
    if (!ankle) return false;
    out.setFromMatrixPosition(ankle.matrixWorld).applyMatrix4(this.invSpace);
    const toe = this.feet[`${side}ToeBase`];
    if (toe) {
      this.tmpFoot.setFromMatrixPosition(toe.matrixWorld).applyMatrix4(this.invSpace);
      out.add(this.tmpFoot).multiplyScalar(0.5);
    }
    return true;
  }

  hasClip(name: string): boolean {
    return Boolean(this.clipSet.tracks[name]);
  }

  /**
   * Loads every clip in `HAND_CLIPS` AND every take in `POSE_TAKES`, in
   * parallel. One `await` for the whole body, so a new move is a table entry
   * and nothing else — and the held moves' takes come through the same door as
   * the clips because they are the same fetch and the same failure: a take that
   * does not arrive leaves its move on the posture table, exactly as a clip that
   * does not arrive leaves its move on the generated set.
   */
  async attachHandClips(
    table: Record<string, HandClipRange> = HAND_CLIPS,
    takes: Partial<Record<TrickName, PoseTake>> = POSE_TAKES,
  ): Promise<string[]> {
    const keys = Object.keys(table);
    const [ok] = await Promise.all([
      Promise.all(keys.map((key) => this.attachHandClip(key, table[key]))),
      this.attachPoseTakes(takes),
    ]);
    return keys.filter((_, i) => ok[i]);
  }

  /**
   * Loads the held moves' takes and samples them onto this rig.
   *
   * Returns the moves that landed one. A move whose take fails is not an error
   * anywhere — `holdTrick` simply finds nothing and falls through to `POSTURES`.
   */
  async attachPoseTakes(
    takes: Partial<Record<TrickName, PoseTake>> = POSE_TAKES,
  ): Promise<TrickName[]> {
    const names = Object.keys(takes) as TrickName[];
    const loaded = await Promise.all(
      names.map((name) => loadPoseTake(this.model, takes[name] as PoseTake)),
    );
    const got: TrickName[] = [];
    names.forEach((name, i) => {
      const sampled = loaded[i];
      if (!sampled) return;
      this.takes[name] = sampled;
      got.push(name);
    });
    return got;
  }

  /**
   * Loads a hand-authored animation GLB and binds it to this rig. The clip must
   * already be built on the same skeleton (matching bone names); nothing is
   * retargeted here.
   * Returns false if the clip has no animation or none of its tracks bind, so a
   * bad file degrades to the generated one instead of freezing the skater.
   *
   * **MATCHING NAMES IS NOT THE WHOLE OF "THE SAME SKELETON", and the gate below
   * only checks the names.** A track is a LOCAL quaternion that REPLACES the
   * bone's bind rotation, so it only means what it meant on the rig it was
   * authored on if this rig RESTS in the same frame. Two Meshy bipeds out of the
   * same generator, both `poseMode: a-pose`, both nominally 1.7 m, can stand
   * identically in bind and still rest 138° apart on the pelvis — the child
   * offsets take the difference up, and the world bind pose, which is the only
   * thing anybody looks at, hides it completely. Measured on the roster
   * (`tools/grab-sweep.mjs`, THE REST FRAME): The Timekeeper's worst bone is
   * 35.4° from The Local's and every clip in `HAND_CLIPS` reads correctly on him;
   * The Runaway is 138.6° at `Spine02`, 136.1° at `Hips` and over 135° at both
   * `UpLeg`s, and the same clips fold her torso — `Spine02` 6.4 cm BELOW her hips
   * and her shoulder 39 cm lower than the retargeted compiled set puts it.
   * 24/24 tracks bind on her, so this gate passes and the pose is still wrong.
   * A rig that far out needs the clips RETARGETED (the compiled set already is,
   * via `loadRig` → `computeCorrection`) or a re-rig, not a posture correction.
   */
  async attachHandClip(name: string, range: HandClipRange): Promise<boolean> {
    try {
      const gltf = await new GLTFLoader().loadAsync(range.url);
      const clip = gltf.animations[0];
      if (!clip) return false;

      const bones: THREE.Object3D[] = [];
      this.model.traverse((o: THREE.Object3D) => {
        if ((o as THREE.Bone).isBone) bones.push(o);
      });
      if (bones.length === 0) return false;

      // Every clip track must find a bone of that name, or the pose would come
      // out half-applied — better to fall back than to ship a broken trick.
      const boneNames = new Set(bones.map((b) => b.name));
      const bound = clip.tracks.filter((t) => boneNames.has(t.name.split(".")[0]));
      if (bound.length < clip.tracks.length * 0.8) {
        console.warn(
          `[skater] ${range.url}: only ${bound.length}/${clip.tracks.length} tracks match this rig — keeping the generated clip`,
        );
        return false;
      }

      this.mixer ??= new THREE.AnimationMixer(this.model);
      // Two takes per move: the one that was filmed, and the same one reflected
      // nose for tail for when the wheels are running the other way. The mirror
      // is built once here rather than per swap — it walks every keyframe of
      // every track, and a landed 180 is not the moment to do that. See `side`.
      this.hands[name] = {
        ahead: { range, action: this.mixer.clipAction(clip), fakie: false },
        fakie: {
          range,
          action: this.mixer.clipAction(mirrorClip(clip, boneNames)),
          fakie: true,
        },
      };
      this.handBones = bones;
      this.handSaved = bones.map(() => new THREE.Quaternion());
      this.hips = bones.find((b) => b.name === "Hips") ?? null;
      this.hipsIndex = bones.findIndex((b) => b.name === "Hips");
      this.headIndex = bones.findIndex((b) => b.name === HEAD_BONE);

      return true;
    } catch (e) {
      console.warn("[skater] hand clip failed to load", e);
      return false;
    }
  }

  /**
   * The take he is riding right now, of the two every move carries.
   *
   * There are TWO independent facts about which way round the skater is, and
   * every wrong answer this has had came from treating them as one:
   *
   *   · **`stance`** — which end of the deck his body is set up to lead. It is
   *     a half-turn of the whole rider about the vertical (`stanceGroup`), his
   *     feet swap ends of the board, and the one thing that causes it is him
   *     turning round on the spot: rolling back down a quarter pipe, which the
   *     player asked for in exactly those words ("the skateboard stays in
   *     place, my guy just turns the other way").
   *   · **`fakie`** — whether the wheels are running toward the end he is set
   *     up to lead, or the other one. It is a REFLECTION of the pose, nose for
   *     tail (`mirror.ts`), his feet do not move at all, and what causes it is
   *     the BOARD coming round under him: a landed 180.
   *
   * They compose. Regular rolling forwards is neither. A landed 180 is fakie
   * alone — the reflection, which opens his shoulders toward the tail because
   * the tail is where he is going now, and hands the push to the other foot off
   * the other end. The ramp roll-back is stance alone — the half-turn, which
   * carries his shoulders round with the rest of him. Both at once is a 180
   * landed while already turned round, and `R(ŷ,π)·S_ẑ = S_x̂` says what that
   * is: the sagittal reflection, a rider standing goofy with the nose leading,
   * which is precisely the state it means.
   *
   * The old code had exactly one flag and paired the mirror with the half-turn,
   * so it could only ever produce the two compositions nothing in this game is
   * in. Measured on the real rig through `tools/turn-check.mjs`:
   *   · mirror + half-turn — **158° off his line** riding away from a landed
   *     180. Right transform, wrong state.
   *   · half-turn alone — his feet swap ends, which is the 180's whole result
   *     undone, and his shoulders stay open toward the end he came from.
   *   · half-turn alone plus a 125° shoulder check over the top — the head
   *     comes round and the body does not, which is what the player saw and
   *     said: "you just turned the head, while the body is facing backward."
   */

  /**
   * Starts one hand-authored clip, stretched to fill `span` seconds. `portion`
   * takes only the first slice of the clip's range — the landing cushion is
   * the crouch stopped short of the full squat.
   */
  private playHand(name: string, span?: number, portion = 1): boolean {
    const entry = this.hands[name];
    if (!entry || !this.mixer) return false;
    const side = this.fakieNow ? entry.fakie : entry.ahead;
    this.snapshotPose();

    this.hand?.action.stop();
    side.action.reset().play();
    this.restorePose();
    this.hand = side;
    this.handEntry = entry;
    this.turned.clear();
    this.mixerStale = true;
    this.handKey = name;
    // Whatever shape he was holding, he is not holding it any more — a pop, a
    // push or the stance reclaiming the body all end a grind's stance. It rides
    // back out on its own ramp rather than being dropped, so the arms come down
    // as the next move fades in. `holdTrick` re-takes it straight after.
    //
    // A shape with no depth is the exception, and it has to be: it is defined ON
    // the stance rather than on a parked crouch, so the stance taking the body
    // back is the move continuing, not the move ending. A manual would otherwise
    // stand up the moment the landing cushion it was started on ran out. The
    // model announces the end of one of those with `holdTrick(null)`.
    if (!this.posture || this.posture.depth > 0) this.postureTarget = 0;
    this.handElapsed = 0;
    this.handAge = 0;
    this.handHold = false;
    this.handFrom = side.range.start;
    this.handTo = side.range.start + (side.range.end - side.range.start) * portion;
    // A loop runs at its own tempo; a one-shot is stretched to fill its span.
    this.handSpan = span ?? this.handTo - this.handFrom;
    this.handPlaying = true;
    return true;
  }

  /** Which way round he is standing on the board. */
  get stance(): Stance {
    return this.stanceNow;
  }

  /**
   * He came round and is standing the other way: the half-turn that carries him
   * there is planned a few lines later in the same frame (`planStanceTurn`,
   * which needs this frame's heading and cannot have it yet).
   *
   * Nothing here touches the mixer, and that is the difference between this and
   * `setFakie` next door: a half-turn is a group ABOVE the skeleton, so the same
   * take plays straight through it and the clip never even knows. The
   * reflection is in the clip data, so that one has to change action.
   */
  setStance(stance: Stance): void {
    if (stance === this.stanceNow) return;
    this.stanceNow = stance;
    this.stancePending = true;
  }

  /** Which way round the wheels are running against the way he stands. */
  get fakie(): boolean {
    return this.fakieNow;
  }

  /**
   * Told by the rig every frame: are the wheels running against the end his
   * stance leads? A change hands the move he is in the middle of over to its
   * reflected twin — stop one action, start the other at the same point in the
   * take, and hold the pose across the swap so the clip's own crossfade carries
   * the body round rather than cutting to it.
   *
   * Cheap on the frames that matter: both takes were built at load, so this is
   * two mixer calls and a cache clear, and it runs only when the answer changes.
   */
  setFakie(fakie: boolean): void {
    if (fakie === this.fakieNow) return;
    this.fakieNow = fakie;

    const entry = this.handEntry;
    if (!entry || !this.mixer || !this.handPlaying) return;
    const side = fakie ? entry.fakie : entry.ahead;
    if (side === this.hand) return;
    this.snapshotPose();
    this.hand?.action.stop();
    side.action.reset().play();
    this.restorePose();
    this.hand = side;
    // Fade in again from the pose he is in. A one-shot measures its ramp both
    // ways and takes the shorter, so this is what stops a swap landing mid-clip
    // from arriving as a cut.
    this.handAge = 0;
    // The yaw corrections are cached per bone and they change hand with the
    // reflection (`mirrorYaw`), so last frame's answers are now the wrong sign.
    this.turned.clear();
    this.mixerStale = true;
  }

  /**
   * Remembers where the body IS before the mixer overwrites it, so whatever
   * comes next fades in from the real current pose rather than snapping.
   */
  private snapshotPose(): void {
    for (let i = 0; i < this.handBones.length; i++) {
      this.fromPose[i] ??= new THREE.Quaternion();
      this.fromPose[i].copy(this.poseOf(this.handBones[i]));
    }
    if (this.hips) this.fromHips.copy(this.hips.position);
  }

  /**
   * …and puts it straight back on the bones, after the mixer has been handed a
   * different action.
   *
   * three.js keeps ONE binding per bone per mixer and restores the value it
   * saved when that binding was first taken over, the moment the last action
   * holding it stops (`AnimationMixer._deactivateAction`). Stopping one action
   * and playing another therefore leaves the skeleton holding a pose from
   * whenever the first clip started — old, and never rendered. The layer itself
   * never reads it back, because `updateHandClip` rebuilds every bone from
   * `fromPose`… but anything that starts a SECOND clip later in the same frame
   * does, through its own `snapshotPose`, and a landed 180 is exactly that: the
   * stance swap and then the landing cushion, one after the other.
   *
   * Measured before this existed: the cushion faded in from that stale pose and
   * the body moved 38.6° in the frame it started — against 18.7° for the whole
   * of the turn underneath it. After: 18.7°, the turn's own ramp and nothing
   * else.
   */
  private restorePose(): void {
    for (let i = 0; i < this.handBones.length; i++) {
      if (this.fromPose[i]) this.handBones[i].quaternion.copy(this.fromPose[i]);
    }
    if (this.hips) this.hips.position.copy(this.fromHips);
  }

  /** What a bone was posed to this frame, with any spin flourish taken back off. */
  private poseOf(bone: THREE.Object3D): THREE.Quaternion {
    for (const turned of this.flourish) if (turned.bone === bone) return turned.before;
    return bone.quaternion;
  }

  /** Puts the flourished bones back the way the clip left them. */
  private undoFlourish(): void {
    for (const turned of this.flourish) turned.bone.quaternion.copy(turned.before);
    this.flourish.length = 0;
  }

  /**
   * Hands the body back to the rolling stance. The stance is the resting
   * state, so anything that interrupts it only has to stop — it never has to
   * restore the pose itself.
   */
  private resumeRide(): boolean {
    return this.playHand("ride");
  }

  /**
   * Called when the skate model kicks. The player's own push clip owns this if
   * it loaded; the generated fallback is a leg swing that never convinced.
   */
  startPush(span: number): void {
    if (this.playHand("push", span)) return;
    this.pushHold = PUSH_STROKE;
  }

  /**
   * The jump key went down: sink into the loaded crouch and STAY there. The
   * clip parks on its last frame, so a long hold is a long wind-up rather than
   * a squat that bobs back up on its own.
   */
  startCharge(): void {
    if (this.playHand("crouch", CHARGE_SPAN)) this.handHold = true;
  }

  /**
   * …and it came back up. Nothing else happens here on purpose: if a pop
   * follows in this same frame the trick clip claims the body before the next
   * update, and if it doesn't, the parked clip simply runs out and hands back
   * to the rolling stance — which reads as him standing up again.
   */
  endCharge(): void {
    this.handHold = false;
  }

  /** True while a clip is PARKED — the wind-up crouch, or a held move's shape. */
  get charging(): boolean {
    return this.handHold;
  }

  /**
   * Which way round the body actually IS, as +1 riding regular → −1 riding
   * switch, read off the turn rather than off the word.
   *
   * Everything that leans the body one way relative to the BOARD needs this: the
   * tail is on his right riding regular and on his left riding switch, so the
   * sign has to change with the stance — but if it changed the moment the stance
   * word did, it would change 0.35 s before the body had finished coming round,
   * and the lean would point at the nose for the whole of the turn. Taking it
   * from the group's own angle eases it through zero exactly as fast as he
   * turns.
   */
  private get stanceSign(): number {
    return Math.cos(this.stanceGroup.rotation.y);
  }

  /**
   * The same number, for the rig: +1 while he is standing regular, −1 switch,
   * easing through zero exactly as fast as the body comes round.
   *
   * `SkaterRig` needs it for the push's sideways hold, which is offset toward
   * the leg that is LEAVING the deck — the same leg either way round, but over
   * the other rail of the BOARD once he has turned round on it. Off the turn
   * rather than off the model's word, for the same reason everything else here
   * is: the word changes 0.45 s before the body does.
   */
  get stanceSide(): number {
    return this.stanceSign;
  }

  /**
   * Touchdown. He takes the landing on bent knees rather than arriving stiff —
   * the same crouch, shallower and quicker, blending straight back out.
   *
   * `slam` is the vertical the legs could NOT take, in m/s, and it is the only
   * thing on screen that says a landing was heavy now that height no longer
   * bails: the concrete takes a bite out of his speed and he rides away, so
   * without a deeper fold and a longer one the biggest air in the game lands
   * exactly like a kerb. Capped at the crouch's own full depth — past that the
   * clip is simply parked at its bottom and going further buys nothing.
   */
  playCushion(slam = 0): void {
    // The wheels are down, whatever the air had promised — and how hard it
    // ended is the impact the body takes on top of the fold below.
    this.air.land(slam);
    const bite = Math.min(1, slam / 6);
    const span = CUSHION_SPAN * (1 + 0.6 * bite);
    // His soles keep travelling for the whole of that span AND for the rolling
    // stance's own crossfade after it — see `landingSettling`, which is what
    // stops the rig freezing a foot mid-cushion.
    this.cushionLeft = span + (RIDE_HAND_CLIP.fade ?? 0);
    this.playHand("crouch", span, Math.min(1, CUSHION_DEPTH * (1 + 0.8 * bite)));
  }

  /**
   * True while his soles are simply RIDING — both on the deck, in the rolling
   * stance, with nothing still moving them.
   *
   * `SkaterRig.followFeet` freezes a foot anchor on the frame a push begins and
   * holds it for the whole stroke, so a frozen wrong answer is wrong for all
   * 0.4 s of it — and after a landing there is no settled foot to read live: the
   * cushion crouch is still crossfading, and a push started in that window
   * measured **15.21 cm off the deck's centre-line against 12.26 cm** for the
   * same push started settled, flipping sides with the stance exactly as the
   * player described. This is the door that lets the rig latch the last settled
   * frame instead of the moving one.
   *
   * Three things move his soles and each is asked its own way. The landing is a
   * CLOCK rather than a clip query, because the push clip replaces the cushion
   * the moment it starts — by the time the rig asks, the cushion is no longer
   * what is playing and the body is still finishing its move. A trick clip, a
   * wind-up crouch or a parked posture is asked as "is the rolling loop what is
   * running". The air is the rig's own question and it asks it there
   * (`skate.airborne`), because it is the ride that knows: an air nobody
   * announced never reaches this layer at all.
   */
  get feetSettled(): boolean {
    if (this.cushionLeft > 0) return false;
    return !this.handPlaying || (this.handKey === "ride" && !this.handHold);
  }

  /**
   * True while the ROLLING STANCE is what is posing him — nothing performed, no
   * clip claiming the body, no shape parked on top of it.
   *
   * It is the same question `feetSettled` opens with and a DIFFERENT answer, on
   * purpose: that one is about his SOLES still travelling and so it carries the
   * landing cushion's clock, which keeps saying no for the fade after a landing.
   * This one is about who owns the pose, and after a landing the answer is the
   * stance — which is exactly the frames a coasted air begins on.
   *
   * What it is FOR is the air with no performance in it (`anim/air.ts`,
   * `AIR_STANCE`). Every clip that is not the rolling loop is a body already
   * doing something about being off the ground: the ollie take on a pop, the
   * parked wind-up crouch for the frame between the wheels leaving and
   * `endCharge`, the crouch again under a grab. The one state left over is the
   * launch nobody announced, and it is the whole of the player's report.
   */
  private get ridingStance(): boolean {
    return this.handPlaying && this.handKey === "ride" && !this.handHold;
  }

  /**
   * The wheels left the ground, or came back to it.
   *
   * `hang` is the hang time a pop bought, in seconds, which is how big the air
   * is going to be before it has happened. Leave it out and the shape comes on
   * as the air proves itself long instead.
   *
   * The pop and the landing already call this (`playTrick`, `playCushion`), and
   * between them they cover every air the ride ANNOUNCES. They do not cover the
   * biggest one there is: rolling off the quarter pipe's lip at 20 m/s is 1.77 s
   * of air and 5.66 m up with no pop anywhere in it. One line per frame in the
   * game loop — `anim?.setAir(skate.airborne)` — is the whole of what that
   * needs, and until it is there a coasted launch flies with a rider standing
   * up in it.
   *
   * That line is in `src/main.ts` as of 2026-07-29 and a check in
   * `tools/anim-check.mjs` reads the file off the disk and goes red without it.
   * Getting told about the air turned out to be necessary and not sufficient: the
   * body still stood up in it for the first 0.95 s, because being told is one
   * thing and having an air POSE to be in is another. See `AIR_STANCE`.
   */
  setAir(airborne: boolean, hang = 0): void {
    if (airborne) this.air.launch(hang);
    else this.air.land(0);
  }

  /**
   * True while both feet are on the deck. During a push one foot is on the
   * GROUND, so anything that measures the board against the soles has to hold
   * still rather than chase the swinging leg.
   */
  get feetOnBoard(): boolean {
    return !(this.handPlaying && this.handKey === "push");
  }

  /** True when no hand-authored push loaded and the fallback has to carry it. */
  get usingGeneratedPush(): boolean {
    return !this.hands.push;
  }

  /**
   * Called on the pop. The generated takes are performed slowly — a couple of
   * seconds each — while the actual pop only buys ~0.7 s of air, so the clip is
   * paced to the hang time instead of playing at its own leisurely tempo and
   * still being mid-crouch when the wheels touch down.
   */
  playTrick(trick: TrickName, airTime: number): void {
    // A pop is the one moment the ride says how big an air is going to be
    // BEFORE it happens, which is what lets the body be in the shape at the top
    // of it rather than half way down.
    this.setAir(true, airTime);
    // The trick's own clip if one has landed, and the ollie's body if not — a
    // hand clip on this skeleton beats anything the compiled set can do, and a
    // flip IS an ollie from the waist up. Both fit their takeoff→landing span
    // into the hang time, plus a beat for the landing crouch to finish after
    // the wheels are back down.
    const span = airTime + 0.28;
    if (this.playHand(TRICK_CLIP[trick], span)) return;
    if (this.playHand("ollie", span)) return;

    const wanted = trick === "Kickflip" && this.hasClip(CLIP_KICKFLIP) ? CLIP_KICKFLIP : CLIP_OLLIE;
    const track = this.clipSet.tracks[wanted];
    if (!track) return;
    // A generated one-shot takes the body over, so let go of any hand clip
    // mid-flight rather than having the two fight for the legs.
    if (this.handPlaying) {
      this.handPlaying = false;
      this.hand?.action.stop();
    }
    // Fit the clip into the hang time, with a little tail for the landing.
    const rate = THREE.MathUtils.clamp(track.dur / Math.max(0.2, airTime * 1.15), 1, 6);
    // yCap: the skate model already threw the body into the air; letting the
    // clip's own hips rise stack on top of it reads as a double jump.
    // fadeOut is deliberately tiny: it blends back into the compiled IDLE loop,
    // which is no longer what the skater returns to. Left at 0.12 s it showed
    // the old standing pose for ~180 ms after every kickflip before the rolling
    // stance took over. The stance's own crossfade covers the handoff instead.
    // onDone fires the frame the trick's own clip runs out, while the body is
    // still in its landing pose — so the stance takes over from THAT, not from
    // whatever the compiled loop settles into afterwards. fadeOut is tiny for
    // the same reason: it blends back into the compiled IDLE loop, which is no
    // longer what the skater returns to. Left as it was, the old standing pose
    // showed for ~150 ms after every kickflip.
    this.anim.playOneShot(wanted, {
      yCap: 0.1,
      fadeIn: 0.05,
      fadeOut: 0.02,
      rate,
      // …unless something has already claimed the body by then — the landing
      // cushion fires on touchdown, which can be before this runs out.
      onDone: () => {
        if (!this.handPlaying) this.resumeRide();
      },
    });
  }

  /**
   * A move that is HELD rather than fired — a grab, a manual, a grind. The clip
   * runs once into its shape and then parks on its last frame for as long as
   * the model says the trick is on, the same way the wind-up crouch is parked.
   * `null` lets it go, and the parked clip finishes back into the stance.
   *
   * No held move has a FULL-body take — the four that were generated are
   * performances with no board in them and cannot be trusted with his feet
   * (`anim/pose-take.ts`) — so in practice every one of them lands on the second
   * path: the crouch clip stopped at that move's own depth and parked there,
   * with the take posing him from the waist up and `POSTURES` filling in for the
   * moves that have none. Only a move that is in neither table returns false,
   * which is still the cue that its whole read is coming from the BOARD.
   */
  holdTrick(trick: TrickName | null, span = 0.25): boolean {
    if (!trick) {
      this.handHold = false;
      this.postureTarget = 0;
      return false;
    }
    if (this.playHand(TRICK_CLIP[trick], span)) {
      this.handHold = true;
      return true;
    }
    // No take of its own — so it is built out of the crouch and whatever poses
    // him above the waist. `playHand` has already dropped any posture that was
    // running, so this is the only place one is ever taken up.
    const posture = this.postures[trick];
    if (!posture) return false;
    // A shape with no depth wants no clip: it rides on the rolling stance and
    // is nothing but the degrees below, which is the only way a move can be
    // held at his ROLLING height — the crouch's own first frame is already
    // 16 cm down (see `Posture.depth`). Nothing is parked, so there is nothing
    // to release either; letting go is the posture ramping back out.
    if (posture.depth > 0) {
      if (!this.playHand("crouch", span, posture.depth)) return false;
      this.handHold = true;
    }
    this.posture = posture;
    // The take, if this move landed one, takes the body above the waist off the
    // posture. Its clock starts here and nowhere else: a move re-taken after a
    // landing cushion interrupted it starts its performance again, which is what
    // a rider settling back onto a rail actually does.
    this.takeNow = this.takes[trick] ?? null;
    this.takeAge = 0;
    // The take's own ramp when it has one — it is the bigger arrival, so it is
    // the one that decides how long the shape takes to come on.
    this.postureSpan = this.takeNow?.take.fade ?? posture.fade ?? POSTURE_FADE;
    this.postureTarget = 1;
    return true;
  }

  /**
   * Holds the shape of a move that has no clip: the arms out to balance it, the
   * waist carrying his weight over the tail or the nose, and — for the grab —
   * the back hand reaching down to the deck.
   *
   * It is a premultiply onto live bones, exactly like the spin flourish, and it
   * is registered the same way so that everything which READS the body sees the
   * clip's own pose. Which arm is the back one changes with the stance: the
   * half-turn swaps which end of the deck each of his sides is over, so the hand
   * that can reach the tail swaps with it.
   *
   * It stands down over whichever half of him a take has claimed. Everything in
   * here is upper body, which is exactly what a take replaces, and the two laid
   * on top of each other would be one balance spread plus another — the take's
   * arms dragged a further 22° out of a shape somebody actually held. What is
   * left is the one fact each of those moves has about the BOARD, which no
   * performance without one could carry: see `PoseTake.owns`.
   */
  private holdPosture(): void {
    const p = this.posture;
    const take = this.takeNow;
    if (!p || (take?.ownsTorso && take?.ownsArms)) return;
    const w = smoothstep(this.postureLevel);
    if (w < 1e-3) return;
    // The tail is on his right riding regular and on his left riding switch —
    // the half-turn in `stanceGroup` is what swaps them, and `stanceSign` reads
    // it off the turn as it happens rather than off the word.
    const stanceSign = this.stanceSign;

    if (this.waist && p.lean && !take?.ownsTorso) {
      this.turn(this.waist, this.charFwd, p.lean * stanceSign * w);
    }
    if (take?.ownsArms) return;

    // Which arm can reach the deck is the one over the TAIL, and that swaps with
    // both facts about which way round he is: the half-turn carries his sides to
    // the other ends, and the fakie reflection swaps their names where they
    // stand. Off the eased turn for the first, so a grab held through a
    // half-turn changes hand half way, where neither arm is the back one.
    //
    // The lean above is NOT on this composite and must not be: it is a pitch
    // about `charFwd`, which lives in the stance group's frame, so the clip
    // being reflected underneath it changes nothing about where it points.
    const back = stanceSign * (this.fakieNow ? -1 : 1) < 0 ? this.armL : this.armR;
    for (const arm of [this.armL, this.armR]) {
      if (!arm) continue;
      // Out is away from the body on each side, so the sign is the side's, not
      // the stance's — a reflection swaps both at once and the spread survives
      // it unchanged.
      const side = arm === this.armL ? 1 : -1;
      if (arm === back && p.reach !== 0) {
        // The grab: that arm is not out for balance, it is going DOWN to the
        // deck. The shoulder swings it over the board and the elbow straightens
        // out of the crouch's fold — which is the half that actually gets the
        // hand down there, and the half a shoulder rotation alone cannot do.
        this.turn(arm, this.charLeft, p.reach * w);
        this.turn(arm, this.charFwd, side * p.reach * 0.35 * w);
        const fore = arm === this.armL ? this.foreL : this.foreR;
        if (fore) this.turn(fore, this.charLeft, (p.elbow ?? 0) * w);
      } else {
        this.turn(arm, this.charFwd, side * p.spread * w);
      }
    }
  }

  /**
   * The held move's own take, laid on from the waist up.
   *
   * Absolute rotations, not degrees added to something: for every bone the take
   * owns, the body is slerped from whatever the clip underneath posed toward the
   * frame the performer was in. So at full strength his arms, shoulders, spine
   * and head ARE the take, and his hips, legs and feet are still the rolling
   * stance or the parked crouch — which is what keeps his soles on the deck the
   * board is stood on (`anim/pose-take.ts` has the measurements that made that
   * the rule).
   *
   * Registered through `hold` for the same reason the spin flourish and the
   * posture are: everything that READS the body — the crossfade's two reference
   * poses among them — has to see the clip's own pose, or a held shape gets
   * snapshotted as if it were part of the clip and then laid on top of itself.
   */
  private holdTake(dt: number): void {
    const sampled = this.takeNow;
    if (!sampled) return;
    this.takeAge += dt;
    const w = smoothstep(this.postureLevel);
    if (w < 1e-3) return;

    const { a, b, mix } = takeFrame(sampled, this.takeAge, this.fakieNow);
    for (let i = 0; i < sampled.bones.length; i++) {
      const bone = sampled.bones[i];
      this.hold(bone);
      // The frame the performance is on, then the blend into the body under it.
      // Two slerps rather than one: the first is playback and runs at full
      // strength whatever the ramp is doing, the second is how much of the
      // shape he has taken up.
      this.takeQuat.copy(a[i]).slerp(b[i], mix);
      bone.quaternion.slerp(this.takeQuat, w);
    }

    // …and the take's own facing, on the spine root, which turns the torso and
    // everything hanging off it without touching the pelvis the legs stand on.
    // Both corrections go the other way on the reflected take, exactly as a
    // clip's do — the vertical lies in the mirror plane (`mirror.ts`).
    // Both belong to the torso, so a take that only owns the arms has no facing
    // of its own to correct — the spine and the head under it are the stance's
    // and are already square on the deck.
    if (!sampled.ownsTorso) return;
    const sign = this.fakieNow ? -1 : 1;
    const { yaw, headYaw } = sampled.take;
    if (yaw && this.spineRoot) this.turn(this.spineRoot, this.charUp, yaw * sign * w);
    if (headYaw && this.head) this.turn(this.head, this.charUp, headYaw * sign * w);
  }

  /**
   * The shape a big air puts him in, and the thump when it ends.
   *
   * **The legs, which nothing else here touches.** The board is stood on his
   * soles, so on the ground a leg is not this layer's to move — lifting a sole
   * drives the deck up through the rider. Airborne it is the other way round:
   * `SkaterRig.followFeet` hands the board to the feet, so pulling the knees up
   * brings the deck up with them. That is the air pose and it is also the whole
   * of how the grab reaches the board (`POSTURES.Grab`).
   *
   * The THREE tucks are MERGED, not added: a grab held at the top of a big air
   * would otherwise ask for both and fold him into a ball, and the flight stance
   * under them both would make it three. The deepest wins per joint — the grab's
   * whenever a grab is on, because a grab is a harder tuck than flying is, and
   * the big air's over the flight stance, because `AIR_STANCE` is the pose he is
   * in for having left the ground and `AIR_SHAPE` is the one he grows into for
   * having left it a long way. Merging is also what makes the handover between
   * those two invisible: they cross where `lift` reaches 16/30 of the shape's tuck
   * and 22/42 of its fold — 0.53 and 0.52, near enough the same moment — with the
   * same value on both sides of it, so nothing steps. Measured on the coasted air
   * (`tools/anim-check.mjs`, DOOR TEST): 5.4 cm of the 12.4 is the stance and the
   * shape grows the other 7.0 out of it as the air proves itself long.
   *
   * The arms are the posture's while a posture is held — a grab's back arm is
   * going somewhere specific and an air spread laid over it would drag it back
   * out — and the air's or the landing's otherwise.
   */
  private holdAir(): void {
    const lift = this.air.lift;
    // …and the flight stance under it, which is on from the moment the wheels
    // leave rather than from the moment the air proves itself big. It is already
    // zero on every frame a take is performing the air (`AirBody.update` is
    // handed that fact), so nothing here has to ask again.
    const flying = this.air.stance;
    const hit = this.air.impact;
    const p = this.posture;
    const held = p ? smoothstep(this.postureLevel) : 0;

    // Knees up, heels under him. Negative about his own left is a knee coming
    // UP IN FRONT of him: his left is +x̂ in the rig's frame and up is +ŷ, so a
    // positive turn about it takes up toward forward and therefore takes a leg
    // hanging down toward the BACK. The shin folds the other way round it, so
    // the heel comes up under the seat instead of the foot swinging out.
    const tuck = Math.max(AIR_SHAPE.tuck * lift, AIR_STANCE.tuck * flying, (p?.tuck ?? 0) * held);
    const fold = Math.max(AIR_SHAPE.fold * lift, AIR_STANCE.fold * flying, (p?.fold ?? 0) * held);
    if (tuck > 1e-3) {
      for (const thigh of [this.thighL, this.thighR]) {
        if (thigh) this.turn(thigh, this.charLeft, -tuck);
      }
    }
    if (fold > 1e-3) {
      for (const shin of [this.shinL, this.shinR]) {
        if (shin) this.turn(shin, this.charLeft, fold);
      }
    }

    // …and the arms come out to hold it. "Slightly", the player said, so this
    // is a fraction of what a grind's balance spread is.
    //
    // TOWARD the widest they go, by at most that much, rather than blindly
    // further round the same way. Which direction that is depends on where the
    // clip underneath has already put them, and on the airs the player actually
    // takes it is the opposite of what this used to do: the ollie take carries
    // his upper arms to 113° of abduction at the top of a quarter-pipe air, and
    // a further 16° from there closed his hands over his head — 3.7 cm NARROWER
    // than the clip on its own. `ARMS_WIDEST` carries that measurement. Nothing
    // changes on a body riding with his arms down, which is every air with no
    // trick clip in it and the whole of what the coasted launch is.
    const spread = Math.max(
      AIR_SHAPE.spread * lift,
      AIR_STANCE.spread * flying,
      IMPACT_SHAPE.spread * hit,
    );
    if (spread > 1e-3 && held < 1e-3) {
      for (const arm of [this.armL, this.armR]) {
        if (!arm) continue;
        const side = arm === this.armL ? 1 : -1;
        const fore = arm === this.armL ? this.foreL : this.foreR;
        const open = THREE.MathUtils.clamp(
          ARMS_WIDEST - this.abduction(arm, fore, side),
          -spread,
          spread,
        );
        this.turn(arm, this.charFwd, side * open);
      }
    }

    // The landing folds him over his own knees on the way through, on top of
    // the deeper and longer squat `playCushion` is already playing. Forward is
    // a turn about his left, and it decays out over half a second — a body
    // absorbing a drop and standing back up, rather than a pose he now holds.
    if (hit > 1e-3 && this.waist) {
      this.turn(this.waist, this.charLeft, -IMPACT_SHAPE.fold * hit);
    }
  }

  /**
   * How far one upper arm is held out from his side right now, degrees on
   * `ARMS_WIDEST`'s scale — 0 hanging straight down, 90 straight out sideways,
   * past 90 on its way over his head.
   *
   * The bone's own direction is where its CHILD sits, turned by whatever the
   * clip has done to it: a bone's rest translation never changes, so the
   * forearm's local position is the upper arm written as a vector, and one
   * world quaternion each brings it into the frame `charLeft` and `charUp` were
   * measured in. `getWorldQuaternion` re-solves the ancestors on the way, so
   * this reads the pose the clip wrote THIS frame rather than last frame's —
   * the same reason `axisIn` solves live instead of caching at load.
   *
   * Read before the turn and never after it, which is what keeps it from
   * compounding: the hand layer rebuilds every bone from scratch each frame, so
   * the angle this returns is always the clip's own and never the shape's from
   * the frame before (the trap the parked crouch fell into — DESIGN.md,
   * 2026-07-26).
   *
   * A rig whose forearms this layer never found reads as already-widest, which
   * turns the spread off rather than turning it the wrong way — the same thing
   * the rest of the posture layer does with a bone it does not have.
   */
  private abduction(arm: THREE.Object3D, fore: THREE.Object3D | null, side: number): number {
    if (!fore) return ARMS_WIDEST;
    this.armDir.copy(fore.position).normalize();
    arm.getWorldQuaternion(this.frameQuat);
    this.armDir.applyQuaternion(this.frameQuat);
    this.stanceGroup.getWorldQuaternion(this.frameQuat);
    this.armDir.applyQuaternion(this.frameQuat.invert());
    // Away from the midline, against straight down — his own frontal plane,
    // which is the plane `charFwd` turns an arm in.
    const out = this.armDir.dot(this.charLeft) * side;
    const down = -this.armDir.dot(this.charUp);
    return (Math.atan2(out, down) * 180) / Math.PI;
  }

  /** Turns one bone `degrees` about one of the character's axes. */
  private turn(bone: THREE.Object3D, axis: THREE.Vector3, degrees: number): void {
    if (!degrees) return;
    const local = this.axisIn(bone, axis);
    this.hold(bone);
    this.postureQuat.setFromAxisAngle(local, (degrees * Math.PI) / 180);
    bone.quaternion.premultiply(this.postureQuat);
  }

  /**
   * `spin` is the ride model's own tracker. Passing it is what makes a spin
   * read as a body turning instead of a statue on a turntable; leaving it out
   * costs nothing but that.
   */
  update(dt: number, spin?: SpinTracker): void {
    // Off first, on again at the end: for the whole of this step the body is
    // the clip's and nothing else's.
    this.undoFlourish();
    this.readSpin(spin, dt);
    // Stepped whatever else happens this frame: the air's own clock is what
    // says how big it is, and it has to keep running through a frame where the
    // compiled set owns the body and nothing here poses anything.
    //
    // `ridingStance` is the second thing it needs and the only one it cannot
    // work out: an air with the rolling loop playing is an air NOBODY is
    // performing, and that is the one the flight stance is for. Read here, one
    // step before `updateHandClip` may change the answer, which costs a single
    // frame of a 0.10 s ramp and is what keeps this a plain read rather than a
    // hook inside the clip layer.
    this.air.update(dt, this.ridingStance);
    // Both in this order and both before the pose: the ramp is chosen off the
    // spin rate `readSpin` just took, and the body is turned before anything
    // that reads which way round it is standing.
    this.planStanceTurn();
    this.turnStance(dt);
    this.pushHold = Math.max(0, this.pushHold - dt);
    // Runs whatever else owns the body: what it times is his FEET settling after
    // a landing, and they settle whether or not a clip is still driving them.
    this.cushionLeft = Math.max(0, this.cushionLeft - dt);
    const target = this.pushHold > 0 ? 1 : 0;
    this.pushWeight += (target - this.pushWeight) * (1 - Math.exp(-12 * dt));

    const weights: Record<string, number> = {};
    if (this.hasClip(CLIP_PUSH) && this.pushWeight > 1e-3) {
      weights[CLIP_PUSH] = this.pushWeight;
      weights[CLIP_IDLE] = 1 - this.pushWeight;
    } else {
      weights[CLIP_IDLE] = 1;
    }

    // ONE writer per skeleton. The compiled set poses the body only when it
    // actually owns it — as the fallback if the rolling clip never bound, and
    // while a generated one-shot is running. Letting it also run UNDERNEATH a
    // hand clip put two animations on the same bones every frame, and on some
    // frames the compiled loop won outright: measured at 40–47° of hips snap
    // and 39 cm of foot travel in a single frame, on a skater standing still.
    if (!this.handPlaying || !this.hands.ride) {
      this.anim.setLoops(weights, dt, FREE_LOOPS);
      this.anim.update(dt);
    }

    // The stance reclaims the body the moment nothing else wants it — including
    // after a generated one-shot, which drops the hand layer outright.
    if (!this.handPlaying && !this.anim.oneShotActive) this.resumeRide();
    // Only the frames the hand layer actually posed get the spin flourish laid
    // on top. It is a premultiply onto a live bone, and a premultiply onto a
    // bone nobody re-wrote this frame COMPOUNDS — the same trap the parked
    // crouch fell into (DESIGN.md, 2026-07-26). The hand layer rebuilds every
    // bone from scratch each frame, so on those frames there is nothing to
    // compound; the compiled set only maps some of the spine, so it does not
    // qualify and the fallback body simply spins level.
    if (this.updateHandClip(dt)) {
      // The take FIRST, because it writes absolute rotations: the spin's leads
      // and the posture's degrees are premultiplied onto whatever is there, and
      // laying the take over them would wipe them out instead of riding on them.
      this.holdTake(dt);
      this.leanIntoSpin();
      this.holdPosture();
      this.holdAir();
    }
    // Ramped in real seconds, both ways, so a rail he steps onto and off again
    // neither pops into the shape nor drops out of it. Stepped AFTER the pose,
    // which is what puts the first frame of a shape at zero strength: the arms
    // come out of the pose the clip is in rather than starting part-way out.
    this.postureLevel = THREE.MathUtils.clamp(
      this.postureLevel + ((this.postureTarget ? 1 : -1) * dt) / this.postureSpan,
      0,
      1,
    );
    if (this.postureLevel === 0) {
      this.posture = null;
      // The take rides the posture's ramp, so it lets go on the same frame — and
      // it has to be cleared rather than left set, because `holdPosture` stands
      // down while one is on and a stale take would keep it standing down.
      this.takeNow = null;
    }

    this.model.updateMatrixWorld(true);
  }

  /**
   * How far the RIDE turned this frame, handed over by the rig before the body
   * is posed — see `planStanceTurn` for the one question it answers.
   *
   * Radians, and already the short way round: what is wanted is how far the
   * skater actually swung, not how the number was written.
   */
  rideTurned(radians: number): void {
    this.rideTurn = radians;
  }

  /**
   * Picks the ramp for a stance change: how far the body still has to come
   * round, and how long it has.
   *
   * Switch is a rider standing the other way round on his own deck, and the ride
   * hands it over on ONE rule (`SkateModel.syncStance`): the wheels are running
   * against the way he stands, so he turns round to face his line. It does not
   * matter whether the ground sent him back down a transition or the board came
   * round under him on a landed 180 — either way the deck holds its own heading
   * and the RIDER is the thing that turns.
   *
   * So this group's half-turn is always a REAL turn of the body on the deck, and
   * it always gets eased. Same for the ground pivot, whose heading came round
   * over ~0.9 s of scrubbing.
   *
   * The one case left where the ride's facing genuinely jumps is a respawn — R
   * teleports him to the spawn heading and sets the stance back to regular in
   * the same call — and easing 180° of body turn onto a skater who has just
   * appeared somewhere else is a turn nobody asked for. That is what the
   * `rideTurn` test catches, and it is a test about the RIDE having teleported,
   * not about a landing: nothing on this ride turns more than a right angle in
   * one frame under its own steam (the air spin is 7.6 rad/s and main.ts clamps
   * a frame to 0.1 s, so 44° is the ceiling), so a bigger step is a facing being
   * written rather than a body turning — the same reasoning `SPIN_STEP_MAX` uses
   * on the tracker. Measured both ways in `tools/hold-check.mjs`: 12.9° on the
   * worst frame of a landed 180, 179.5° on a respawn.
   */
  private planStanceTurn(): void {
    if (!this.stancePending) return;
    this.stancePending = false;
    // Absolute, so a half-finished turn that is interrupted still ends square,
    // and the group only ever rests at 0 or ±π.
    //
    // WHICH WAY round does not need deciding, because no spin can reach here any
    // more. The stance only changes when the board did NOT come round — the
    // ground sending him back down a transition — and nothing is spinning in
    // that moment. Carrying the turn on the way he had last been spinning was
    // tried this round and taken back out: the last spin could be a 360 from
    // half a minute earlier, which is a stale answer dressed as an informed one.
    this.stanceFrom = this.stanceGroup.rotation.y;
    this.stanceTo = this.stanceNow === "switch" ? Math.PI : 0;
    // …unless he is part-way through the opposite turn already, in which case
    // the two ends of ±π are not the same distance away and taking the far one
    // is a 266° whip to arrive somewhere 94° away. Only reachable by flipping
    // twice inside one 0.45 s turn, which the speed deadband exists to prevent —
    // this is the belt for it. A clean start sits at exactly 0, where both ends
    // are π away and the guard cannot fire.
    if (Math.abs(this.stanceFrom - this.stanceTo) > Math.PI) this.stanceTo *= -1;
    if (Math.abs(this.rideTurn) > Math.PI / 2) {
      this.stanceAge = this.stanceSpan;
      this.stanceGroup.rotation.y = this.stanceTo;
      return;
    }
    this.stanceAge = 0;
    this.stanceSpan = STANCE_TURN;
  }

  /**
   * Carries the body round into the stance it landed in.
   *
   * `setStance` used to assign the half-turn outright, which whipped him round
   * inside one frame while the POSE it starts took 0.35 s to cross — the two
   * halves of one move on two different clocks. Same ramp for both now, and the
   * same smoothstep.
   *
   * The numbers, measured on the real clip through `tools/hold-check.mjs` rather
   * than derived from the 180° this group turns — the body sweeps 99.5°, not
   * 180°, because the mirrored clip's own facing comes back the other way with
   * it (see `planStanceTurn`):
   *   · the turn alone, 60 fps — worst frame **7.0°**, a clean smoothstep hump
   *     with no step in it anywhere
   *   · a real landed 180, with the landing cushion crossfading under it —
   *     worst frame **12.9°**, and 25.7° at 30 fps: 774°/s either way, so it is
   *     a rate and not a frame-rate artefact
   *   · the same turn with the ease taken out — **180.0°** in one frame
   * Two of those three are the cushion's, not this ramp's, and they are printed
   * separately so the ramp is neither blamed for it nor hidden behind it.
   */
  private turnStance(dt: number): void {
    if (this.stanceAge >= this.stanceSpan) return;
    this.stanceAge = Math.min(this.stanceSpan, this.stanceAge + dt);
    const t = smoothstep(this.stanceAge / this.stanceSpan);
    this.stanceGroup.rotation.y = this.stanceFrom + (this.stanceTo - this.stanceFrom) * t;
  }

  /**
   * How hard he is coming round, as −1 (hard screen-right) → +1 (screen-left).
   *
   * The tracker counts the heading change the ride model actually applied, and
   * screen-right is DECREASING heading (skate-model.ts's header note), so a
   * negative rate is a spin to the right. Differencing it is exact — the model
   * adds one value per step — so there is nothing here to smooth.
   */
  private readSpin(spin: SpinTracker | undefined, dt: number): void {
    if (!spin || dt <= 0) {
      this.spinDrive = 0;
      return;
    }
    const was = this.spinLast;
    this.spinLast = spin.degrees;
    // The tracker is RESET at every landing, every rail catch and every pivot
    // that ends, and a reset is not a spin — taken at face value it fires the
    // whole flourish for one frame on every touchdown. The reset is recognised
    // by its own signature rather than by how big it is: `peak` only ever grows
    // within a run and `reset()` zeroes it, so a peak that DROPPED is a reset
    // and nothing else. Guessing from the size cannot do this — a pivot that
    // ended carrying 10° of steering correction reads as 600°/s at 60 fps,
    // which is a real air-spin rate and sails through any threshold set high
    // enough not to clip a genuine 540.
    const reset = spin.peak < this.spinPeak;
    this.spinPeak = spin.peak;
    if (reset) {
      this.spinDrive = 0;
      return;
    }
    const rate = (spin.degrees - was) / dt;
    // …and the belt as well as the braces: a tracker whose degrees are set from
    // outside (a harness, a future teleport) leaves the peak untouched, and
    // nothing turns this fast under its own steam.
    this.spinDrive =
      Math.abs(rate) > SPIN_STEP_MAX ? 0 : THREE.MathUtils.clamp(rate / SPIN_FULL, -1, 1);
  }

  /**
   * The body during a spin: the head goes first, the chest follows it round,
   * and the shoulders drop into the turn.
   *
   * Everything is laid on ABOVE the hips, so the legs and the soles are
   * untouched and the board — which is stood on those soles — cannot be thrown
   * by it. The yaw leads are turns about each bone's own vertical, which is the
   * vertical whichever way the holder is yawed, so they keep their sign in both
   * stances. The roll is about the rig's FORWARD axis, and the switch
   * half-turn points that the other way round — hence the stance sign.
   */
  private leanIntoSpin(): void {
    const drive = this.spinDrive;
    if (Math.abs(drive) < 0.02) return;
    const stanceSign = this.stanceSign;
    const rad = Math.PI / 180;

    if (this.chest) {
      this.hold(this.chest);
      this.spinQuat.setFromAxisAngle(UP, CHEST_LEAD * drive * rad);
      this.chest.quaternion.premultiply(this.spinQuat);
      this.spinQuat.setFromAxisAngle(FORWARD, -CHEST_ROLL * drive * stanceSign * rad);
      this.chest.quaternion.premultiply(this.spinQuat);
    }
    // On top of the chest's own lead, because the head hangs off it — the two
    // add up to the ~25° of gaze that says which way he is going.
    if (this.head) {
      this.hold(this.head);
      this.spinQuat.setFromAxisAngle(UP, HEAD_LEAD * drive * rad);
      this.head.quaternion.premultiply(this.spinQuat);
    }
  }

  /**
   * Remembers a bone's clip pose before the flourish turns it.
   *
   * Once per bone per frame, even when a spin and a held posture both want it:
   * a second entry would remember the ALREADY-turned pose, and `undoFlourish`
   * restores in order, so the last entry would win and the turn would be left
   * baked into the bone to be laid on again next frame.
   */
  private hold(bone: THREE.Object3D): void {
    for (const turned of this.flourish) if (turned.bone === bone) return;
    this.flourish.push({ bone, before: bone.quaternion.clone() });
  }

  /**
   * Turns one bone of the freshly-scrubbed clip pose about the vertical.
   *
   * `fresh` says whether the mixer has actually re-written this bone since the
   * last call. It has not when the clip is PARKED — the held crouch scrubs to
   * the same time every frame and the mixer stops writing — and premultiplying
   * onto a bone that still holds last frame's answer compounds the turn: 81°
   * per frame, measured as the body spinning on the spot for as long as the
   * jump key was down. So the turn is done once and the result cached.
   */
  private turnClip(index: number, degrees: number | undefined, fresh: boolean): void {
    if (!degrees || index < 0) return;
    let turned = this.turned.get(index);
    if (fresh || !turned) {
      this.yawFix.setFromAxisAngle(UP, (degrees * Math.PI) / 180);
      turned = (turned ?? new THREE.Quaternion()).copy(this.handBones[index].quaternion);
      turned.premultiply(this.yawFix);
      this.turned.set(index, turned);
    }
    this.handBones[index].quaternion.copy(turned);
  }

  /**
   * Lays the hand-authored clip over whatever the stance just posed, crossfaded
   * by hand at both ends so the trick neither pops in nor snaps back out.
   *
   * Returns whether it posed the body this frame — the spin flourish rides on
   * that answer, because it premultiplies onto live bones.
   */
  private updateHandClip(dt: number): boolean {
    if (!this.handPlaying || !this.mixer || !this.hand) return false;

    const looping = this.hand.range.loop === true;
    this.handAge += dt;
    this.handElapsed += dt;
    if (this.handElapsed >= this.handSpan) {
      if (this.handHold) {
        // Parked on the last frame — the loaded crouch, held for as long as
        // the player keeps the key down.
        this.handElapsed = this.handSpan;
      } else if (!looping) {
        // Straight back to the stance, in THIS frame, posing the body before we
        // leave. Two things bite otherwise: the compiled set would pose the
        // body on the next frame (a beat of the old generated loop, 43° away),
        // and stopping the finished action makes three.js write the skeleton's
        // BIND pose back into the bones — measured at a 68° hips snap for one
        // frame at the end of every push and ollie.
        this.handPlaying = false;
        return this.resumeRide() ? this.updateHandClip(0) : false;
      } else {
        // Wrap: restart the fade from the pose the clip ends on, so the seam
        // between the last frame and the first is crossfaded, never cut.
        this.handElapsed %= this.handSpan;
        this.handAge = 0;
        this.snapshotPose();
      }
    }
    const progress = this.handElapsed / this.handSpan;

    // Remember the stance pose — the mixer is about to overwrite these.
    for (let i = 0; i < this.handBones.length; i++) {
      this.handSaved[i].copy(this.handBones[i].quaternion);
    }
    if (this.hips) this.hipsSaved.copy(this.hips.position);

    const { fade = 0.1 } = this.hand.range;
    const scrub = this.handFrom + progress * (this.handTo - this.handFrom);
    // three.js only writes a bone when the SAMPLED value moves, so an action
    // swapped in under a PARKED clip — the held wind-up crouch, scrubbing to the
    // same time every frame — left the blend converging on its own last output
    // and the body frozen half way across the change (4.4° on the low spine,
    // 6.2° on the chest, 16.9° on the neck, measured). One throwaway sample a
    // hair off the real one guarantees the next write differs from the buffer.
    if (this.mixerStale) {
      this.mixerStale = false;
      this.mixer.setTime(scrub + 1e-3);
    }
    this.mixer.setTime(scrub);
    // Stand the clip the right way round on the deck before anything blends it.
    // A turn about the PARENT's up axis swings the whole body; the pose inside
    // it is untouched.
    // "Has the clip actually moved?" — and it has to be asked with a tolerance,
    // because three.js decides whether to write a bone by comparing the SAMPLED
    // values, not the time. The frame a clip parks, the accumulated elapsed time
    // arrives at the span one ulp short and then exactly on it, so the scrub
    // moves by ~1e-16, the sampled pose does not move at all, and an exact `!==`
    // called it fresh: the yaw correction went onto a bone that already carried
    // it. Measured on a 0.25 s hold — which is fifteen frames dead on, so it
    // lands exactly there — as a single 21.0° hips kick (the crouch's own yaw)
    // on the frame the shape settled.
    const fresh = Math.abs(scrub - this.lastScrub) > 1e-9;
    this.lastScrub = scrub;
    // Both corrections are measured against the CLIP's own facing, and the
    // reflection brings that back the other way round — so on the fakie take
    // they go the other way too. (The spin flourish's leads do not: those turn
    // about the parent's vertical, which points the same way in the world
    // whatever the clip is doing.)
    const yaw = this.hand.fakie ? mirrorYaw(this.hand.range.yaw) : this.hand.range.yaw;
    const headYaw = this.hand.fakie
      ? mirrorYaw(this.hand.range.headYaw)
      : this.hand.range.headYaw;
    this.turnClip(this.hipsIndex, yaw, fresh);
    this.turnClip(this.headIndex, headYaw, fresh);

    // Ramp in over the first `fade` of real time, back out over the last.
    const fadeFrac = Math.min(0.45, fade / this.handSpan);
    // The loop measures its fade in real seconds since the last wrap; progress
    // is not a one-way trip for it, so it cannot drive the ramp. A one-shot
    // measures it BOTH ways and takes whichever has run less: the two agree
    // exactly on a normal start, and they part company when a clip is restarted
    // part-played — `handAge` restarts there, and it is what fades the change
    // instead of cutting to it.
    const rampIn = looping
      ? Math.min(1, this.handAge / Math.max(1e-3, fade))
      : Math.min(1, progress / fadeFrac, this.handAge / Math.max(1e-3, fade));
    // A held crouch never fades out — it is being kept, not finished.
    const rampOut =
      looping || this.handHold ? 1 : Math.min(1, (1 - progress) / fadeFrac);
    const w = smoothstep(Math.min(rampIn, rampOut));
    // What the clip fades FROM: the pose the body was in when it started,
    // sliding across to the live rolling loop as the entry completes. At w = 0
    // that is exactly last frame's pose, so nothing can snap on the way in.
    const entry = smoothstep(rampIn);

    // A one-shot fades FROM the body's live under-layer, so it can drop back
    // onto it when it ends. The stance loop has nothing to drop back onto — it
    // IS the resting pose — so it fades straight from whatever it interrupted,
    // and the generated loop never leaks back in behind it.
    for (let i = 0; i < this.handBones.length; i++) {
      this.tmpQuat.copy(this.handBones[i].quaternion); // the clip's pose
      const q = this.handBones[i].quaternion.copy(this.fromPose[i] ?? this.handSaved[i]);
      if (!looping) q.slerp(this.handSaved[i], entry);
      q.slerp(this.tmpQuat, w);
    }
    if (this.hips) {
      this.tmpVec.copy(this.hips.position);
      const p = this.hips.position.copy(this.fromHips);
      if (!looping) p.lerp(this.hipsSaved, entry);
      p.lerp(this.tmpVec, w);
    }
    return true;
  }
}

function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

