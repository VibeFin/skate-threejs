// Being off the ground, as the BODY reads it — and the thump when it ends.
//
// The player asked for two things and they are one move: "in the air he crouches
// deeper and spreads his arms slightly, for when he's flying high; landing from
// height reads as impact." Note the condition. A skater pops an ollie every few
// seconds and pulls nothing; he pulls his knees up when there is time and height
// to pull them up IN. So the shape below is off entirely for an ordinary hop and
// comes on with the size of the air.
//
// ## What "flying high" is, in seconds
//
// Measured on the real ride over the real spot — the model driven through the
// real input layer, popping at the quarter pipe's lip at each speed. The same
// airs `tools/anim-check.mjs` drives the body through:
//
//   flat ollie, any speed        0.86 s of hang, apex 1.59 m, lands with slam 0
//   quarter pipe, popped @12     1.38 s, apex 3.62 m, slam 1.21 m/s
//   quarter pipe, popped @16     1.60 s, apex 4.69 m, slam 4.01 m/s
//   quarter pipe, popped @20     1.82 s, apex 6.12 m, slam 7.64 m/s
//
// So the ollie is the floor and the transition is the ceiling, and the two are
// two thirds of a second apart. `AIR_LOW` sits just above the ollie — every hop
// in the game reads at zero, which is the player's own condition — and
// `AIR_HIGH` at the 16 m/s launch, which is the air the game is FOR.
//
// ## Time, not height
//
// The drive is hang time rather than metres, for one reason that matters: the
// ride announces a pop with the hang time it bought (`onPop`), and it does not
// announce a height at all. Hang time is also the honest question — a body in
// the air has as long as it has, and a skater tucks because he has TIME to,
// whether he got it off a lip or off a roof.
//
// Which is why the clock keeps running past what the pop promised. `airTime` is
// `max(hang, elapsed)`: an ollie off the top of a six-stair buys 0.86 s and then
// keeps falling, and every one of those extra tenths is a rider who is higher
// than he expected to be. The shape deepens as he falls. It never retreats
// mid-air, because a body does not un-tuck on the way down.
//
// ## The one thing this cannot see
//
// A pop is announced; simply ROLLING off a lip is not. Coasting off the quarter
// pipe at 20 m/s is 1.77 s of air and 5.66 m up with no `onPop` at all — the
// biggest air in the game, and this layer is blind to it until something tells
// it per frame that the wheels are off the ground.
//
// `SkaterAnim.setAir` is that door and it is one line, in a file this lane does
// not own: `src/main.ts`, in the frame loop between `rig.sync(skate, delta)` and
// `anim?.update(delta, skate.spin)`, add
//
//     anim?.setAir(skate.airborne);
//
// Order inside the frame does not matter as long as it is before `anim.update`,
// and it cannot fight the two callers that already exist: a `launch` inside an
// air keeps the bigger promise rather than restarting the clock (see `launch`),
// and `land(0)` on a grounded frame leaves the landing's own thump alone (see
// `land`). Until that line is there, a coasted launch flies with a rider
// standing up in it.
//
// This paragraph used to end by saying `tools/anim-check.mjs` "drives `setAir` by
// hand and proves the shape, which is the layer, not the wiring" — and that is
// how a green harness came to sit on top of a feature the game cannot reach. The
// harness now says DOOR TEST in the name of every check that opens the door
// itself, and it has one more check that reads `src/main.ts` off the disk and
// goes RED while the line above is missing. A comment describing a hole and a
// number saying everything is fine cancel each other out; a red check does not.
//
// THE LINE LANDED on 2026-07-29 and that check is green: `src/main.ts` runs
// `anim?.setAir(skate.airborne)` in the frame loop. Read the section below
// before assuming that closed the hole — being TOLD about an air and having an
// air POSE to be in are two different things, and the second one took another
// round.
//
// ## The air nobody PERFORMS — and why the shape above is not the whole answer
//
// Everything above is one layer: how BIG this air is. It says nothing about
// whether the body is in an air pose at all, and there is an air where nothing
// else says it either. The player rode it and named it exactly: *"I'm riding
// onto a ramp — for example I hold the spacebar — and at the end of the ramp,
// when I launch, my character switches to a normal pose, like an idle pose,
// right in the air."*
//
// He is describing the ROLLING STANCE, and every step of how it gets there is
// deliberate somewhere else:
//
//   1. the pop lives on the key coming UP (`SkateInputSource.onKeyUp`), so Space
//      held through the lip fires no `onPop` and no trick clip ever starts;
//   2. the wind-up crouch is parked while he climbs (`startCharge`), and
//      `SkateModel.setCharging(grounded && chargeHeld)` releases it on the frame
//      after the wheels leave — `endCharge` → the parked clip runs out →
//      `resumeRide()`, which is the standing rolling loop, crossfading in over
//      its own 0.35 s;
//   3. and `AIR_LOW` holds the shape above at exactly zero for the first 0.95 s
//      of hang, which is the player's own condition and is right.
//
// Measured on the real launch (`tools/anim-check.mjs`, THE LAUNCH — the real
// model over the real quarter pipe with Space held, at 12, 16 and 20 m/s): he
// left the lip and came up to **72.9 cm above his own soles with 54° of knee**,
// which is a man rolling along the flat with nothing pressed to the degree and
// the tenth of a centimetre. Not a pose that resembles one — that one, the same
// loop, on every frame from 0.3 s after the lip until `AIR_LOW` admitted the air
// at 0.95 s, out of 0.83–1.33 s of hang. Nothing was broken. Three correct
// decisions composed into a rider standing at attention on the way up.
//
// So the shape is TWO layers, and they answer two different questions:
//
//   · `AIR_STANCE` — is he in an air pose AT ALL. On the moment the wheels
//     leave, whatever size the air turns out to be, and only for an air with no
//     performance in it (see its own note). Small: knees soft, board under the
//     feet.
//   · `AIR_SHAPE` — how big this one is. Unchanged, still gated on `AIR_LOW`,
//     still zero for every ollie in the game.
//
// They are MERGED, not added — the deeper of the two wins, per joint — so a
// coasted air that turns into a long one grows out of the stance into the tuck
// with nothing double-counted and no step where one hands over to the other.
//

/** The shape a big air puts a body in. Degrees, all of them. */
export interface AirShape {
  /**
   * Each hip flexing — the knees coming up under him. Positive is a knee
   * rising toward his chest, in the rig's own frame; the sign is settled in
   * `SkaterAnim.holdAir`, which is the only thing that knows which way round
   * the character's axes point.
   */
  tuck: number;
  /** …and the knee folding with it, heel toward the seat. */
  fold: number;
  /**
   * Degrees each arm swings out from the body. "Slightly", he said.
   *
   * Degrees TOWARD `ARMS_WIDEST`, not degrees added on — read that constant
   * before changing this one, because on the airs that carry a trick clip the
   * two directions are opposite.
   */
  spread: number;
}

/**
 * Abduction at which a pair of arms is at its widest, degrees — 0 is an arm
 * hanging straight down his side, 90 is straight out sideways, past 90 is on
 * its way over his head.
 *
 * This exists because "spread his arms" is not "turn both shoulders further
 * round", and the difference is the whole of why the arms half of the player's
 * ask reached nothing on a real air. Measured on this rig, through a 1.6 s
 * quarter-pipe air with the hand-authored ollie playing (`tools/anim-check.mjs`
 * and its arm sweep): the take alone carries the upper arms to **113° and 109°
 * of abduction** at the top — well past sideways, on their way overhead — and
 * holds his hands 130.8 cm apart at the widest. Turning them a further 16° the
 * same way from there does not open him up, it closes his hands OVER his head:
 * measured at 126.0 → 117.8 cm at the top of the air, 3.7 cm narrower across
 * the whole flight. The shape was subtracting from the clip it was laid on.
 *
 * So each arm is turned toward this angle by at most `spread` degrees, and
 * which WAY that is falls out of where the arm already is. On a body riding
 * with his arms down — the rolling stance, every air with no trick clip in it —
 * that is the same outward turn it always was, to within the clamp. On a body
 * already reaching over the top it is the opposite one, and both of them mean
 * the same thing on screen: his hands get further apart.
 *
 * 90 rather than a measured optimum because the arm is a rigid bone: its
 * sideways reach is `sin(abduction)`, which peaks at a right angle whatever the
 * elbow below it is doing. The clamp is one-sided in the safe direction as
 * well — a turn of `spread` about his front-to-back axis moves the measured
 * abduction by rather less than `spread` (0.57 of it on this rig, because the
 * shoulder is not square to that axis), so an arm 20° short of widest is
 * turned 20° and arrives at about 11° short. It never crosses over.
 */
export const ARMS_WIDEST = 90;

/**
 * The air pose itself.
 *
 * A tuck this deep lifts the soles ~14 cm toward the hips, and the board rides
 * the soles while he is up (`SkaterRig.followFeet`), so the deck comes up with
 * them — which is what a big air looks like from behind and is the difference
 * between a skater flying and a statue on a parabola.
 *
 * Exported for the same reason `POSTURES` is: every number in here came off a
 * measurement, and `tools/anim-check.mjs` has to be able to sweep them.
 */
export const AIR_SHAPE: AirShape = { tuck: 30, fold: 42, spread: 16 };

/**
 * The stance a body is in the MOMENT the wheels leave the ground, whatever size
 * the air turns out to be — knees soft, the board under his feet, arms just off
 * his sides. It is not a tuck and must not read as one.
 *
 * **Why an ollie still does not look like a tuck, now that something comes on
 * at once.** This layer is not gated on time at all — it is gated on OWNERSHIP,
 * and that is the whole reason it can be instant. It fills in only for an air
 * with no performance in it: the frames where the ROLLING STANCE is what is
 * posing the body (`SkaterAnim.update` hands that fact to `AirBody.update`). A
 * popped ollie is not one of those frames — the hand-authored ollie take owns
 * the body for the whole of `hang + 0.28 s` and it already pulls his knees up on
 * its own, to 51.1 cm above the soles and 112° of knee where a rolling body is at
 * 72.9 cm and 54° (`tools/anim-check.mjs`, THE LAUNCH). Laying degrees on TOP of
 * that take is not a flight pose, it is the same tuck twice: measured, with the
 * gate taken out the flat ollie folded a further **9.6 cm** (tallest 60.7 → 51.1)
 * and carried 119° of knee against the take's own 98°, which breaks the player's
 * own condition — "a skater pops an ollie every few seconds and pulls nothing" —
 * and it is the check right beside it. So the ollie is left alone because the
 * ollie is already performed, not because a clock has not run out yet.
 *
 * The numbers, swept on the real launch off the lip at 16 m/s with Space held
 * (`tools/anim-check.mjs`, THE LAUNCH). Hips above his own soles and knee flexion
 * at +0.3 s, and the least bent his knees get anywhere in the air:
 *
 *   tuck/fold     0/0    8/11   12/17  16/22  20/28  24/33  30/42
 *   hips (cm)    71.1   68.2   66.5   64.7   62.7   60.7   57.1
 *   knee          61°    71°    76°    81°    86°    91°    99°
 *   least bent    54°    63°    69°    73°    79°    83°    92°
 *
 * The two ends are the ladder this has to sit inside: 0/0 is the defect — 54° of
 * knee, the flat roll's own number — and 30/42 is `AIR_SHAPE`, the tuck a big air
 * already gets and which must stay the bigger read. 16/22 is a little over half
 * way in knee angle (81° against 61° and 99°) and it is the pair below: **19° of
 * knee and 8 cm of hip** off the standing stance, with 18° and 7.6 cm still left
 * for the big air to grow into. 24/33 reads as a tuck on an ordinary roll-off and
 * leaves that growth nowhere to go; 8/11 is 9° of knee, which is inside what the
 * rolling loop varies over on its own.
 *
 * `spread` is 8 against the shape's 16 for the same reason the shape's own is
 * small: on a coasted air his arms hang at 9–12° of abduction and there is a
 * whole quadrant to open into, so a little goes a long way. Swept on the same
 * launch — hand span at +0.3 s, and at its widest anywhere in the air:
 *
 *   spread         0°      4°      8°     12°     16°
 *   hands        48.3    53.6    59.1    64.6    70.2   cm at +0.3 s
 *   widest       63.0    66.2    70.9    75.7    80.5
 *
 * 8° is worth 10.8 cm of span over an air with none, against 40.5 cm of hand span
 * rolling — arms just off his sides. 16 is the full shape's and belongs to the big
 * air, where it doubles this.
 *
 * ## ROUND TWO — 16/22/8 shipped, and the player could not see it
 *
 * His words after playing the published build: *"можешь сказать что ты сделала с
 * airbone стендингом? тк я не вижу изменений пока."* He was right and the numbers
 * above are why. Everything in the paragraph beginning "The two ends are the
 * ladder" is arithmetic about `AIR_SHAPE`, and `AIR_SHAPE` is a SMALL layer: the
 * whole air layer is worth 12.4 cm of hip and 16/22 took 5.4 of it. Meanwhile the
 * real ladder on screen runs 72.2 cm standing → 40.5 cm on the ollie take alone →
 * 20.4 cm on a big popped air. So the pose was being sized against the wrong
 * reference: half of a small layer, in a 32 cm gap. 5 cm of hip on a 1.75 m body,
 * at chase-camera distance, is not a pose — it is a rounding error you can measure.
 *
 * 28/38/14 instead, and the ceiling it sits under is not taste — it is the frame
 * budget. `anim-check`'s rate bar is 5° of knee on the worst single frame (half of
 * `Posture.fade`'s 9–10°), and a smoothstep spends ~25% of its travel on its
 * steepest frame however gently it is eased, so a ramp of N frames carries about
 * 4N° in total. Measured, at 60 fps:
 *
 *   stance      ramp     hips at launch    knee    worst frame    ollie
 *   16/22/8     0.10 s      66.4 cm         20°       4.4°        40.5 cm
 *   22/30/11    0.11 s      63.8 cm         27°       5.6°  OVER  40.5 cm
 *   24/33/12    0.12 s      62.7 cm         30°       5.7°  OVER  40.5 cm
 *   28/38/14    0.17 s      60.8 cm         34°       4.7°        40.5 cm
 *   30/41/15    0.19 s      59.7 cm         37°       4.6°        40.5 cm
 *
 * So amplitude is bought with ramp length and nothing else, and 0.17 s is what 34°
 * costs at a legal rate. 30/41 was the other candidate and was passed over for two
 * small reasons: it arrives 20 ms later, and it spends the growth entirely (59.7
 * against the 59.4 a long air reaches on its own), where 28/38 leaves 1.4 cm.
 *
 * **The trade, stated because it is a real loss.** The growth this layer had over a
 * long air — the shape deepening as an air proves itself — was 7.0 cm and is now
 * 1.4. Most of it has moved into the launch, which is where he was looking. If a
 * long air ever needs to read deeper again, the number to raise is `AIR_SHAPE`, not
 * this one, and it will cost the big air's own read.
 *
 * The one thing that did NOT move: the popped ollie is **40.5 cm in every row of
 * that table**. That is the ownership gate doing its job, not a coincidence — the
 * stance only fills in when the rolling loop owns the body, so amplitude here is
 * free of the ollie entirely. It is the reason this could be doubled without
 * re-opening the question he settled when he said a hop should pull nothing.
 */
export const AIR_STANCE: AirShape = { tuck: 28, fold: 38, spread: 14 };

/**
 * Seconds the flight stance takes to come on, and to come back off.
 *
 * Short on purpose — the complaint being answered is a pose arriving 0.95 s into
 * a 1.3 s air, so "later" is the defect. It is not instant either: at 60 fps a
 * smoothstepped ramp of this length puts the worst single-frame joint move at
 * **4.7° of knee**, against the 9–10° every posture in the game arrives at
 * (`Posture.fade`), so it is under half the fastest rate this body already runs and
 * nowhere near a snap. Straight assignment was tried and measures 17.9° on one
 * frame — 92% of the whole move, landing on the frame the wind-up crouch lets go.
 *
 * 0.10 → 0.17 s in round two, and it is not a free parameter: it is what the
 * doubled `AIR_STANCE` costs to arrive at a legal rate. Read that constant's own
 * round-two note for the table — amplitude and ramp length are one dial here,
 * because the rate bar is fixed and a smoothstep's steepest frame is ~25% of its
 * travel. 0.17 s is still five and a half times sooner than `AIR_LOW` would admit
 * the air at all, which is the thing the complaint was ever about.
 *
 * It comes back off on `AIR_OFF` rather than its own number: coming off, this is
 * the same event as the shape above coming off — the wheels are down — and the
 * landing cushion is crossfading underneath both of them.
 */
// Exported for the same reason `AIR_SHAPE` is: `tools/anim-check.mjs` has a check
// whose bar is derived from this length rather than hard-coded against it, which is
// what stops the round-two re-base from happening a third time silently.
export const STANCE_ON = 0.17;

/** Hang time at which an air starts to read as big, seconds. */
export const AIR_LOW = 0.95;
/** …and where it is as big as this game gets. */
export const AIR_HIGH = 1.6;

/** Seconds the shape takes to come on, and to come back off. */
const AIR_ON = 0.22;
const AIR_OFF = 0.14;

/**
 * How long an air is allowed to last with nothing announcing its end.
 *
 * Every landing announces itself (`onLand` → `playCushion`), but a BAIL does
 * not: the ragdoll takes the skeleton over and the model stands him up on a
 * timer. Physics is the last writer on those bones while it runs, so nothing is
 * visible either way — but a flag left set is a flag that is wrong the moment
 * the body comes back, and 4 s is twice the longest air the spot can produce.
 */
const AIR_GIVE_UP = 4;

/**
 * The vertical a landing has to carry to read as a full-blooded impact, m/s.
 *
 * `slam` is what his legs could NOT absorb — the ride already takes
 * `LAND_ABSORB` (9 m/s) for free — so this is on top of a landing that is
 * already heavy. Measured: the biggest air the spot produces, a 20 m/s launch
 * off the quarter pipe, comes down at 7.64.
 */
export const IMPACT_FULL = 8;

/** Seconds the impact takes to wash out of the body. */
const IMPACT_SPAN = 0.5;

/** How far the landing folds him, on top of the cushion clip's own squat. */
export interface ImpactShape {
  /** Degrees the arms fly out as he takes it — toward `ARMS_WIDEST`, as above. */
  spread: number;
  /** Degrees the waist folds him forward over his own knees. */
  fold: number;
}

/**
 * What a heavy landing does to the body, over and above the cushion.
 *
 * `playCushion` already plays the crouch deeper and longer with the slam, and
 * that is the legs. This is the rest of him — the arms coming out and the torso
 * folding over — and it is what turns "he crouched" into "that hurt". It decays
 * out over half a second, so the biggest landing in the game is a fold and a
 * recovery rather than a pose he holds.
 */
export const IMPACT_SHAPE: ImpactShape = { spread: 22, fold: 14 };

/**
 * The body's own account of being in the air: how big this one is, and how hard
 * the last one ended.
 *
 * Pure time and numbers — no bones, no three.js. `SkaterAnim` owns which bones
 * this turns; this owns when, and how much.
 */
export class AirBody {
  /** True between leaving the ground and the landing being announced. */
  private up = false;
  /** What the pop promised, seconds. Zero for an air nobody announced a pop for. */
  private hang = 0;
  /** …and how long it has actually gone on for. */
  private elapsed = 0;
  /** The eased strength of the air shape, 0 → 1. */
  private level = 0;
  /** …and of the flight stance under it, which is not driven by the size at all. */
  private flight = 0;
  /** …and of the landing's own thump, which only ever decays. */
  private thump = 0;

  /**
   * He left the ground. `hang` is the hang time the pop bought, seconds — 0
   * when nothing bought it (rolling off a lip), in which case the shape comes
   * on as the air proves itself long, which is the only honest thing to do with
   * an air whose size is not known until it is over.
   */
  launch(hang = 0): void {
    // A second launch inside one air is the ride announcing a trick popped off
    // a lip he was already off; keep the bigger promise rather than restarting
    // the clock under him.
    if (this.up) {
      this.hang = Math.max(this.hang, hang);
      return;
    }
    this.up = true;
    this.hang = hang;
    this.elapsed = 0;
  }

  /** …and the wheels are back down. */
  land(slam = 0): void {
    this.up = false;
    this.hang = 0;
    this.elapsed = 0;
    // Straight to full and then decays — an impact has no ramp in. It is only
    // ever the harder of what is already running and what just arrived, so a
    // pair of landings a few frames apart cannot cancel each other out.
    this.thump = Math.max(this.thump, Math.min(1, slam / IMPACT_FULL));
  }

  /** True while he is off the ground, as far as anything has told this layer. */
  get airborne(): boolean {
    return this.up;
  }

  /**
   * How big this air is, 0 → 1 — the eased strength of the shape.
   *
   * `AIR_LOW` is above the flat ollie's own hang time on purpose: a hop reads
   * at exactly zero and the pose costs nothing until the air is worth it. That
   * is still what this drives, and it is still only half the answer — being off
   * the ground AT ALL is `stance`, which does not consult the size.
   */
  get lift(): number {
    return this.level;
  }

  /**
   * …and whether he is in a flight stance at all, 0 → 1.
   *
   * Smoothstepped rather than handed over raw, unlike `lift`: that one's target
   * is already an eased function of the hang time, and this one's is a step — a
   * bare linear ramp off a step has a corner at each end, and the corner at the
   * top lands on the frame the stance settles.
   */
  get stance(): number {
    return smoothstep(this.flight);
  }

  /** …and how hard the last landing was, decaying to nothing over `IMPACT_SPAN`. */
  get impact(): number {
    return this.thump;
  }

  /**
   * `riding` is the one fact this layer cannot work out for itself: is the
   * ROLLING STANCE what is posing the body right now — an air with no
   * performance in it — or is a take up there doing the flying?
   *
   * It gates the flight stance and nothing else. `AIR_SHAPE` is a shape laid
   * over whatever is playing and is measured on top of the ollie take on
   * purpose; the stance is a REPLACEMENT for a missing performance, so it has to
   * stand down the moment there is one. Left ungated it is the ollie's own tuck
   * applied twice — 9.6 cm of it, measured, on the hop the player asked to be
   * left alone. See `AIR_STANCE`.
   *
   * Defaulted to false so the only thing that can turn the stance on is a caller
   * that actually knows: a harness stepping `AirBody` on its own gets the shape
   * layer exactly as it always measured.
   */
  update(dt: number, riding = false): void {
    // Toward on while he is up there with nothing performing it, off otherwise
    // — including the frames a trick clip takes the air over mid-flight, which
    // is a real handover and not a glitch: the take's own knees arrive as this
    // rides out under it.
    const flying = this.up && riding ? 1 : 0;
    const flightSpan = flying > this.flight ? STANCE_ON : AIR_OFF;
    this.flight =
      flying > this.flight
        ? Math.min(flying, this.flight + dt / flightSpan)
        : Math.max(flying, this.flight - dt / flightSpan);
    if (this.up) {
      this.elapsed += dt;
      // Nothing announced the end of this one — a bail, most likely, where the
      // ragdoll owns the bones and the model stands him up on a timer.
      if (this.elapsed > AIR_GIVE_UP) this.up = false;
    }
    // The air is as big as the longer of what the pop promised and what it has
    // actually turned into. Both matter: the promise is what lets a launch off
    // the lip read big at take-off instead of half way down, and the elapsed
    // time is what catches an ollie off a stair set that is still falling.
    const airTime = this.up ? Math.max(this.hang, this.elapsed) : 0;
    const want = this.up
      ? smoothstep((airTime - AIR_LOW) / Math.max(1e-3, AIR_HIGH - AIR_LOW))
      : 0;
    // Eased in real seconds, both ways round, so the shape never arrives or
    // leaves inside one frame. On the way in it also cannot outrun the drive
    // itself, which is what keeps a hop at zero rather than at "0 for a moment".
    const span = want > this.level ? AIR_ON : AIR_OFF;
    const stepBy = dt / span;
    this.level =
      want > this.level
        ? Math.min(want, this.level + stepBy)
        : Math.max(want, this.level - stepBy);
    this.thump = Math.max(0, this.thump - dt / IMPACT_SPAN);
  }
}

function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}
