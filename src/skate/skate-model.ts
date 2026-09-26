// The ride.
//
// This is the whole mechanic: momentum you build with pushes and spend in
// carves, a spot whose banks and transitions give speed back on the way down, a
// pop that gets you off the ground, a flip that has to finish before the wheels
// come back down, a spin that decides which way round you land, and a rail that
// takes you if you land on it square. Everything the player feels is tuned in
// the CONSTANTS block — no magic numbers buried in the update.
//
// The world is asked, never collided with: `surface` answers how high the floor
// is and which way it faces, so the same model rides a grass field or a street
// plaza with ledges on it. Every query passes the board's own y as `yHint`,
// which is what lets a ledge have two heights at one (x, z) — see surface.ts.
//
// Screen-direction contract (verified in local test mode): D / ArrowRight
// turns the skater screen-RIGHT. Forward is (sin h, 0, cos h) and the camera
// sits behind looking along it, so screen-right is DECREASING heading — hence
// the minus in the steering line. Signs are copied from that derivation, never
// re-guessed.
//
// The specifics of a grind and of a trick are NOT here: `this.grind` is asked
// whether there is a line to catch and whether he is still on it, `this.tricks`
// turns an input into a trick and a score. This file owns the state machine
// between them.

import * as THREE from "three";
import type { GrindLine, SurfaceKind, SurfaceProvider, SurfaceSample } from "../world/surface";
import { FIELD_SURFACE, makeSample } from "../world/surface";
import type {
  GrindKind,
  GrindState,
  RagdollHandle,
  SpinTracker,
  Stance,
  TrickId,
  TrickName,
} from "./contracts";
import {
  SPIN_SQUARE_DEG,
  createSpinTracker,
  flipStance,
} from "./contracts";
import type { GrindQuery } from "./grind";
import { Grinder } from "./grind";
import { meetSteel, steelBars } from "./rail-steel";
import type { TrickContext } from "./tricks";
import { TrickBook } from "./tricks";

export type { TrickName } from "./contracts";

// ---------------------------------------------------------------------------
// Feel constants
// ---------------------------------------------------------------------------
const MAX_SPEED = 17; // the fastest you can PUSH yourself; gravity may go faster
// One kick, paced to the hand-authored push clip: he steps off, sweeps the
// foot along the ground and steps back on. A real push cycle is about a
// second, so the interval is the clip's, and the impulse is scaled to keep the
// same acceleration the shorter, faker stroke had.
const PUSH_IMPULSE = 4.6; // speed gained per kick
const PUSH_INTERVAL = 0.85; // seconds per kick while the push key is held
const PUSH_WINDUP = 0.26; // the foot reaches the ground here…
const PUSH_DRIVE = 0.3; // …and drives for this long. A shove, not a jolt.
const ROLL_DRAG = 0.16; // proportional roll-off — a skateboard coasts a long way
const ROLL_FRICTION = 0.55; // constant crawl-to-stop, m/s²
const BRAKE_DECEL = 11;
const TURN_RATE = 2.0; // rad/s at the sweet spot
const CARVE_SCRUB = 0.2; // speed bled by a hard turn
// Lighter than earth on purpose: a floatier fall is what buys the hang time a
// trick needs to read, and it is the single knob that makes every pop slower.
const GRAVITY = 17;
const OLLIE_POP = 7.3; // ~1.6 m of air, ~0.86 s hang
const KICKFLIP_POP = 7.6; // ~1.7 m, ~0.89 s — the flip needs the extra beat
const FLIP_TIME = 0.4; // seconds for the board to come all the way round
const LANDING_SCRUB = 0.9; // speed lost on a clean landing
const MAX_LEAN = 0.5; // radians the skater banks into a full carve
/**
 * Speed (m/s) at which a carve is worth the whole of `MAX_LEAN`. Read SIGNED —
 * see the lean block in `update`: this one term carries both how hard he banks
 * and which way, because both are the same fact about the wheels.
 */
const LEAN_FULL_SPEED = 4;
const EDGE_TURN = 1.4; // how firmly a field's soft edge steers you back

// --- ramps and transitions ---------------------------------------------------
/**
 * Gravity along a slope is g·sin θ. The field model used a flat coefficient
 * against the GRADE, which is g·tan θ in disguise — a fine stand-in for a 1°
 * hill and a lie on a quarter pipe, where it hands back more acceleration than
 * free fall (tan 60° = 1.73). Slope drive is now real gravity resolved onto the
 * surface, so a transition pays back exactly what it charged on the way in and
 * a vert wall stops being a rocket.
 */
const SLOPE_GRAVITY = GRAVITY;
/**
 * A skater on a transition does not coast, he PUMPS — he loads through the
 * curve and stands up out of it, and that is where a session's speed comes
 * from. Holding the crouch (the same key that loads an ollie) through anything
 * steeper than a driveway feeds speed in at this rate.
 */
const PUMP_ACCEL = 7;
/**
 * Below this grade you are on flat ground and there is nothing to pump. It is
 * as shallow as it is because the BOTTOM of a transition is where a pump does
 * its work — you load through the flat of the curve and stand up out of it —
 * and a threshold at 0.25 (14°) took the first 0.77 m of a 3.14 m arc away
 * outright: a 4 m/s entry reached 0.35 m up the wall pumped and 0.35 m
 * unpumped, which is a ramp you cannot work. 0.05 is 2.9°, still steep enough
 * that flat ground and a plaza's own ripples pay nothing.
 */
const PUMP_MIN_GRADE = 0.05;
/**
 * Ceiling on speed you got from gravity rather than from your legs. Dropping in
 * SHOULD beat pushing — otherwise a ramp is decoration — but a deep transition
 * integrates to more than the camera can follow.
 */
const MAX_ROLL_SPEED = 26;
/**
 * The tightest corner a skateboard can be made to follow, metres.
 *
 * Leaving a lip is not a question about how far the floor has fallen — that
 * was a threshold, and a threshold is a window a fast frame steps over. It is
 * a question about FORCE: a board follows a curved path only while the surface
 * can supply the centripetal acceleration that path needs, which over anything
 * convex is `v²/R ≤ g·cos θ`. The concrete can only push, never pull, so the
 * instant that fails the wheels are off — and where the wheels are off is then
 * a fact about the shape of the ground and the speed on it, not about when the
 * frame happened to land.
 *
 * `R` is the local radius of curvature, and this is its FLOOR. A coping is a
 * corner: geometrically its radius is zero and every speed would leave it, but
 * a board is 0.96 m of plank and cannot turn inside its own length — stand it
 * with the tail on the lip and the nose already reaches most of a metre down
 * the far face. So a corner sharper than this is the board bridging it, turning
 * on half its own length, and that is the arc the physics is run on.
 */
const LIP_PIVOT = 0.5;
/**
 * How far ahead the ground is looked at, metres — and, because it is looked at
 * before every piece of ground the board covers, the longest piece the ground
 * is ever walked in.
 *
 * It is a distance and not a frame's stride on purpose. A lip is a fact about
 * SPACE, and a stride is half a metre at 30 fps and a tenth of that at 144:
 * the old one-frame test threw the same 16 m/s skater off the same coping at
 * 11.7 m/s on one machine, 7.6 m/s on another, and not at all at 144 fps.
 *
 * Exported for the same reason `WALL_PROBE` is, and it is the same pair of
 * numbers doing it: a grounded step reaches `LIP_PROBE·cos θ` of GROUND ahead and
 * is refused anything standing `WALL_PROBE` over where it started, so those two
 * together are what decides whether a steep face is rideable or a wall. A world
 * that shapes a transition against that bound — `tools/back-face.mjs` measures
 * the north wall's clearance against it — has to ask in the ride's own numbers,
 * because a harness carrying its own copy of 0.12 is a harness that goes green
 * while the ramp stops the board dead at the coping.
 */
export const LIP_PROBE = 0.12;
/**
 * The corner a board can roll THROUGH, radians. Anything sharper it bridges —
 * the tail is still on the near face while the nose is over the far one — and a
 * bridged corner always has a moment of air in it, so the board leaves and
 * lands rather than following. It also keeps the following honest: every flat
 * top in the spot stands at least `STEP_FLOOR` proud of what is under it, which
 * is 34° across a deck, so no step here can be mistaken for a surface to be
 * followed down.
 */
const CORNER_HOLD = 0.35;
/** A tenth of a millimetre — a float's worth of nothing. See `breaksAt`. */
const LIP_EPS = 1e-4;
/**
 * …and the same in radians: how far the ground's own tangent has to turn away
 * inside the probe before it counts as a corner rather than a curve. A
 * hundredth of a radian over `LIP_PROBE` is a two-metre radius, which is
 * tighter than anything in the spot that is not a corner, and loose enough
 * that the plaza's own analytic ramps report nothing.
 */
const LIP_TURN = 0.01;
/** Below this he is not rolling, and there is no ground to walk. */
const MIN_ROLL = 1e-3;
/** Belt and braces on the walk: no frame may spend more pieces than this. */
const ROLL_PIECES = 512;
/**
 * Halvings used to find the exact break inside that probe. Six take 0.12 m
 * down to 2 mm, which matters because the last hand's width of a quarter pipe
 * is worth ten degrees of tangent — and ten degrees off the coping is a metre
 * of air.
 */
const LIP_BISECT = 6;
/**
 * …and how far short of the break the tangent is read. A lip is where one solid
 * ENDS, so the answer exactly on it belongs to whatever is beyond — comfortably
 * wider than the bisection's own 2 mm, and narrow enough that the arc it reads
 * is the arc at the coping (79.0° against 79.2°).
 */
const LIP_EDGE = 0.01;
/** A step that moves the board less than this is not a slide along a wall. */
const MIN_SLIDE = 1e-4;
/** …and you have to actually be going somewhere. Nobody launches off a curb at walking pace. */
const LAUNCH_MIN_SPEED = 1.5;
/**
 * How much velocity straight INTO the floor a pair of legs take for FREE, m/s.
 * Past this the landing costs you speed. It has never cost you the run since
 * this line was written, and that is the point of it.
 *
 * **You bail because you got the TRICK wrong, never because you landed from
 * height.** Height is the reward in a skate game: the reference this spot is
 * built to lets you drop off a roof and roll away. Bailing on fall speed was
 * the single rule taxing the player for using the ramps, and it was taxing the
 * two features the whole spot is built around. Measured against this file
 * before it came out: an ollie at the six-stair rode away 30% of the time
 * across the width of the set — 300 lanes, five speeds, three lead distances —
 * and 100% of them now; a quarter pipe ridden with the throttle held bailed
 * EVERY approach from 8 to 20 m/s at 30, 60, 90 and 144 fps, and rides away
 * from all of them now.
 *
 * And no smaller number would have done either, because a threshold on fall
 * speed is not a threshold a player can find. A landing is detected the frame
 * the board is under the floor, so the vertical it is judged on carries up to
 * `GRAVITY·dt` of overshoot — half a metre a second at 30 fps. Measured: the
 * deepest drop onto flat concrete you could ride away from was 2.12 m at 30 fps
 * and 2.36 m at 144, the same drop on two machines with two different answers.
 * Removing it is what makes the ride the same ride on every machine.
 *
 * So this is a SCRUB threshold now (see `LAND_SLAM_SCRUB`), and the number is
 * unchanged because the landings the ride is made of have not changed. An ollie
 * is 1.57 m and comes down at 7.3, so his own basic move costs nothing at all.
 * A 2.1 m air popped out of the transition and put back on its own deck is 8.5,
 * also free. A popped six-stair put down flat is 9.8 and a drop off the quarter
 * pipe's deck is 11.9 — those are slams, and now they read as slams instead of
 * ending the run.
 *
 * Anything MATCHING the surface it lands on costs nothing at any speed at all,
 * because matching it is what makes `into` small — that is the fakie re-entry
 * into a transition, and it was already the one landing this rule never touched.
 */
const LAND_ABSORB = 9;
/**
 * …and what the rest of it costs: the slam that takes HALF your roll speed.
 *
 * A hard landing has to be WORTH something or it is not a landing, it is a
 * teleport — but the currency is speed, not the run, and the bill grows with
 * the drop so height never becomes free.
 *
 * It is a FRACTION and not a subtraction, and that is the whole difference
 * between a landing you ride out of and one that ends the line. A flat
 * `slam · 0.6` m/s off the top clamps at a standstill, so the same 4 m drop
 * that cost a 12 m/s approach a fifth of itself deleted a 2.5 m/s one outright
 * — and every air big enough to be worth taking arrived at the floor with a
 * bill bigger than the ride had. Measured before this line changed: a drop onto
 * flat concrete at 8 m/s rolled away from 12 m at 0.38 m/s and from 20 m at
 * 0.00, and off the quarter pipe the whole 8 → 20 m/s band came down at
 * 0.00 – 0.67. A skater who drops off a roof lands ROLLING; the legs absorb the
 * vertical, they do not absorb the forward.
 *
 * The number is 9 because it reproduces the curve this ride was tuned on at the
 * heights the spot actually has and only softens the fringe: from 8 m/s onto
 * flat concrete, 2 m still costs nothing, 3 m rolls away at 6.3 (was 6.4), 4 m
 * at 5.5 (was 5.4), 6 m at 4.5 (was 3.9) — and 12 m, which nothing here is,
 * at 3.2 instead of 0.4. Enough that you feel the concrete take it out of you;
 * never enough to take the line.
 *
 * The combo survives it, deliberately. Taking the line away for landing big is
 * the same tax in a different currency, and he did land the trick.
 */
const LAND_SLAM_HALF = 9;
/**
 * How fast the deck lies down onto a new surface, 1/s. A lip is a STEP change
 * in the ground's tangent and a deck that snaps through it in one frame reads
 * as a glitch. This follows the surface — it is not a filter over motion, and
 * nothing here touches a clip.
 */
const NORMAL_FOLLOW = 14;
/**
 * Lift added to the board's y before it is used as a `yHint`. A board sitting
 * exactly ON a ledge's top face has to resolve that face, not the pavement
 * below it, and floating-point equality is not a thing to bet a ride on.
 */
const HINT_LIFT = 0.15;
/**
 * Height the wall test probes at — above a rideable ledge, below head height.
 *
 * Exported because it is the whole DEFINITION of "inside something": a point the
 * board may not be at is one where `surface.blocked(x, z, y + WALL_PROBE)` is
 * true, and `tools/collide-sweep.mjs` has to ask that question in exactly the
 * same words the ride does. A harness carrying its own copy of this number is a
 * harness that goes green while the ride walks through brick.
 */
export const WALL_PROBE = 0.3;
/**
 * How far the wall test reaches to find which way the face in the way POINTS,
 * metres. Fixed, so a 144 Hz frame — whose whole stride is 5 cm — feels the
 * same brick a 30 Hz one does.
 */
const WALL_FEEL = 0.05;
/**
 * The longest piece of ground a single wall test is allowed to speak for.
 *
 * `advance` asks one question — "is the place I am going to solid?" — and a
 * question asked of the DESTINATION says nothing whatever about what lay
 * between. Grounded that was harmless, because `roll()` already walks its frame
 * in `LIP_PROBE` pieces and nothing in the spot is thinner than that; in the air
 * and on the floor behind a ragdoll it was not, because those move the whole
 * frame in one go. Measured with `tools/collide-sweep.mjs` before this walk
 * existed: a 0.4 m fence, six 0.4 m lamp-post bases, three hydrants and a
 * dumpster were all crossed clean by a board that never touched them — a 20 m/s
 * air at 30 fps strides 0.67 m, which is wider than any of them.
 *
 * So the step is WALKED, and the piece is `WALL_FEEL` because that is already
 * the distance this file uses for "close enough to a face to feel it": a probe
 * that reaches 5 cm and a stride that covers 5 cm are the same resolution, and
 * two numbers for one resolution is how they drift apart. What it leaves behind
 * is bounded and stated: a point stepping past the CORNER of a box still shaves
 * it, by at most one piece — 5 cm of a 0.96 m deck, which is the width of the
 * grip tape's edge and is not a wall gone through.
 */
export const WALL_STEP = WALL_FEEL;
/** Belt and braces on that walk, the same idea as `ROLL_PIECES`. */
const WALL_PIECES = 512;
/**
 * Velocity straight INTO a solid, m/s, past which the hit is a crash and not a
 * scuff.
 *
 * This is the one impact that still ends a run, and it survives the rule that
 * took the landing bail out because it is not a landing: a landing is taken on
 * two legs that bend and it is the move working, a wall is taken on the trucks
 * and there is nothing to absorb it with. A kerb at a cruise stops you; a kerb
 * at a sprint puts you over the bars, which is what a 0.38 m lump of concrete
 * does, and a player who rode square into brick at 10 m/s reads going down as
 * the only honest answer.
 */
const WALL_SLAM = 10;
/**
 * …and how far the thing has to stand OVER the board before that applies, m.
 *
 * The number above is written for brick taken square, and brick was not what it
 * was doing. Measured over 5,040 three-second rides across the spot with the
 * throttle held — every 2 m of x, eight headings, three speeds, seven starting
 * lines — **3,034 of them (60.2%) ended in a ragdoll and every single one was
 * this rule.** Only 45% of those were the block's own boundary, which is the
 * one thing the constant claims to be about. The rest were the street: 650 on
 * the 0.38 m kerb line the spot's own notes say you ollie, grind or cross, 299
 * on 0.40–0.45 m ledges, 82 on the block pad, 48 on the manual pad. You could
 * not ride across the plaza.
 *
 * So the bail is a fact about what he hit as well as how hard. A kerb, a ledge,
 * a manny pad, a bench, a dumpster — anything he could have gone over the top
 * of — still takes every scrap of his speed the moment it is square (that is
 * what `along` does, and it is unchanged) and still sounds like what it is. It
 * does not put him on the concrete. A face standing over his own head has
 * nowhere to go past it, and that is the one this rule was written for.
 *
 * 1.6 m is the deck to the top of a 1.70 m rider's head. Everything the plaza
 * is furnished with is under it; the buildings, the fence and the lamp posts
 * are over it.
 */
const WALL_HEAD = 1.6;
/** …and below this it is a nudge, worth no sound and no event. */
const WALL_SCUFF = 2;
/**
 * How fast leaning on a wall scrubs your speed off, m/s².
 *
 * The impact is charged ONCE, when the contact begins. What follows is a board
 * held against brick by a rider still steering into it, and that is a rate, not
 * another impact — charging the impact every step instead made the cost a
 * function of the frame rate: the same 45° hit kept 70% of 14 m/s for one step
 * and 70% of 70% of 70% … for a hundred and eighty of them, arriving at
 * 0.70 m/s on one machine and a different number on the next.
 */
const WALL_RUB = 3;

// --- spin --------------------------------------------------------------------
/**
 * Air spin, rad/s. A pop buys ~0.86 s of air, so a 360 has to fit inside that
 * or the move does not exist off flat ground — measured, 6.5 rad/s came round
 * only 304° in one ollie and put him on the concrete. 7.6 comes round in 0.83 s
 * with a beat to spare, and anything with a lip under it gets you a 540.
 */
const AIR_SPIN_RATE = 7.6;
/**
 * How far over the stick has to be before the AIR reads it as a spin.
 *
 * The carve and the air spin are one axis, and that axis is smoothed on its way
 * in (~0.11 s). Let go of the steer on the same frame you let go of the pop and
 * the leftover of a full carve still integrates 48° of rotation into the air —
 * against a 40° clean window, which is an automatic bail for releasing two keys
 * together. A carve's dying tail is not a spin; a spin is the stick held over.
 * Rescaled rather than clipped, so a held spin loses only the last sliver of
 * its rate: 48° of leftover becomes 21°, and a deliberate 360 still comes round
 * inside one ollie.
 */
const AIR_SPIN_DEADZONE = 0.35;
/** Ground pivot, rad/s — slower than the air, because the wheels are fighting you. */
const PIVOT_RATE = 3.6;
/** A pivot is a low-speed move; above this, brake-and-steer is just a hard carve. */
const PIVOT_MAX_SPEED = 6;
/** How far the stick has to be over for a brake to read as a pivot. */
const PIVOT_STEER = 0.15;
/**
 * Land inside this many degrees of square and it is clean. Outside it, you are
 * down.
 *
 * A 180 is the commonest trick in skating and it has to be landable by holding
 * the stick over and letting go when it looks right. At 7.6 rad/s a half turn
 * takes 0.41 s, so 40° was a window of ±92 ms inside an 860 ms hang — measured,
 * only 50% of the release timings available inside one ollie came down clean,
 * and the misses were not near-misses, they were a bail. 60° is ±138 ms and
 * 69%, and it is still well short of the 90° that would make EVERY timing
 * clean: come down a quarter turn out and you are landing sideways, which is
 * still the floor arriving across your wheels.
 */
const SPIN_CLEAN_DEG = SPIN_SQUARE_DEG;
/** Below this the "spin" was a steering correction and gets no callout. */
const SPIN_MIN_DEG = 100;

// --- which way round he stands -----------------------------------------------
/**
 * How fast the wheels have to be running the OTHER way before he turns round on
 * the deck, m/s — and the same number on the way back, which makes this a
 * deadband and not a threshold.
 *
 * Both answers `syncStance` can give hang off the sign of `speed`, so the one
 * thing that could wreck either is a speed that sits on zero: the top of a
 * transition, a brake taken to a standstill, a kerb he is nudging. A bare
 * `speed < 0` there flips a 180° body turn — or a whole reflected clip set — on
 * and off at frame rate. Hysteresis is the whole fix: he commits to riding
 * backwards once he is actually rolling backwards, and commits back the same
 * way.
 *
 * 1.2 m/s because that is already the speed the CAMERA commits at (main.ts's
 * `alignHeading` gate). Below it the view holds where it was, so the body and
 * the camera turn together instead of one leading the other by a metre a
 * second.
 */
/**
 * Below this a push follows the way he is STANDING rather than the way he is
 * moving — there is no travel to follow on a board that has stopped.
 */
const PUSH_ROLL_MIN = 0.05;
const STANCE_FLIP_SPEED = 1.2;
/**
 * How far the BOARD may have come round while the wheels changed direction
 * before the turn stops being the world's doing and starts being his own.
 *
 * This is the difference between the only two ways of ending up rolling
 * tail-first, and a player has now told me twice, in his own words, that they
 * are different moves:
 *
 *   · **The board held still and the ground sent you back.** Ride up the
 *     transition, run out of speed, roll back down. The deck still points up the
 *     ramp and nothing has turned the rider at all, so he turns himself — "the
 *     skateboard stays in place, my guy just turns the other way". His feet swap
 *     ends of the deck and the SAME foot goes on leading.
 *   · **The board came round underneath you.** Spin a 180 and the rig swings the
 *     deck and the rider together. His feet never moved, so the OTHER foot is in
 *     front now — and that is the whole visible result of the trick: "we want to
 *     do a switch specifically so the guy rides in switch… he should stay. Why
 *     does he turn back?" Turning him round on top of the spin puts his feet
 *     exactly where they started and the 180 leaves no trace at all.
 *
 * Which leaves the second half of that case — he is standing the way he landed,
 * so he is facing back down his own line. He is not turned round to fix it; he
 * looks over his shoulder, in the animation layer, where a real skater does it
 * (`SkaterAnim.lookDownTheLine`).
 *
 * 115° because a spin has to be most of the way round to a half turn before the
 * landing counts it at all, and no carve reaches that between one decisive roll
 * direction and the next.
 */
const STANCE_BOARD_TURN = (115 * Math.PI) / 180;

// --- manual ------------------------------------------------------------------
/**
 * Radians the deck sits nose-up in a manual AT THE BALANCE POINT. Negative
 * pitch is nose-up (see the rig).
 */
const MANUAL_PITCH = 0.3;
/**
 * How far the rake swings either side of that as the balance moves — the deck
 * IS the balance meter, and that is the whole readout.
 *
 * A manual is one number: how far past the back truck your weight is. Drawing
 * it as a fixed 17° plank and hiding the number behind it is what let the old
 * manual read as a pose with a clock on it. At 0.70 the rake runs from 5.2° at
 * the wheels-coming-down edge to 29.2° at the tail-scraping one, through 17.2°
 * on the point — so a player watching the board can see which way he is going
 * and which key he needs before it is gone.
 *
 * It stops short of flat at the bottom on purpose: the last five degrees are
 * the wheels ARRIVING, and that drop is what the end of a manual plays out
 * (`manualPitch` goes to 0 and the same 12/s damp carries it there).
 */
const MANUAL_RAKE_SWING = 0.7;
/**
 * How far past the point he pops up, 0–1 of the way to losing it.
 *
 * You never come up dead on the balance point. Which SIDE of it you land is
 * seeded off the ground he popped it on (`tipSide`) — the same patch of
 * pavement always tips him the same way, for the reason `grind.phaseOf` is
 * seeded and not random: a balance you cannot reproduce is a balance you
 * cannot tune. The MAGNITUDE is fixed rather than seeded because the seconds a
 * manual is worth must not be a lottery; only which key saves it is.
 */
const MANUAL_ENTRY_LEAN = 0.15;
/**
 * The inverted pendulum: the further past the point you already are, the
 * harder it takes you there. This is the whole reason a manual ends.
 *
 * Measured hands-off, wheels never leaving the floor, from the entry lean
 * above: **4.05 s at 60 fps** (4.17 at 30, 3.99 at 144 — it is a growth rate,
 * so the frame doesn't own it). That is deliberately the same four seconds the
 * flat `MANUAL_MAX_HOLD` timer in the trick book used to spend, because four
 * seconds of doing nothing was the right LENGTH; what was wrong was that it
 * was a clock nothing could argue with. Now it is the do-nothing case of a
 * balance, and A/D argue.
 */
const MANUAL_TIP = 1.4;
/**
 * The wander on top: two sines that never line up, so the board fidgets under
 * him instead of falling on rails.
 *
 * It is scaled by `1 − |balance|` — the wander is what you feel WHILE you are
 * on the point, and once you are past it the fall is committed and the
 * pendulum owns it. That is also what keeps a hold's length honest instead of
 * a lottery on where the sine happened to be when he came up.
 */
const MANUAL_WANDER = 0.6;
/** It starts at this share of full strength… */
const MANUAL_WANDER_START = 0.2;
/**
 * …and gains another full share every this many seconds on two wheels, with no
 * ceiling on it. THIS is what stops a manual becoming a parking space: the
 * correction below is a fixed 2.8 and the wander is not, so a hold fought
 * perfectly still runs out — measured on the real model with the speed held up
 * so nothing else could end it, **16.3 s** against a reader answering every
 * frame with a full stick, 15.4 s on half a stick and 21.3 s for one that only
 * moves when the deck has visibly gone. In the plaza it is shorter than any of
 * those, because a manual carries no speed of its own and cannot be topped up
 * (a push ends it — see the push block): 8 m/s of coasting is spent inside four
 * seconds, so the balance is the ceiling and the roll is usually the floor.
 */
const MANUAL_WANDER_FULL = 1.5;
/**
 * What A/D is worth against all that, per second squared.
 *
 * It is the SAME key that carves, exactly as the rail's balance is the same
 * key that squares the deck (`grind.ts`, `SQUARE_TAX`) — there is one steering
 * axis on the ground and this is its second job. Nothing about the labels
 * moves: A still carves screen-left and D screen-right while you fight, so a
 * long manual snakes down the plaza, and that is the price of holding one.
 *
 * Comfortably more than the pendulum at its worst (2.8 against 1.4 at the very
 * edge), so a manual is always saveable right up to the moment it isn't.
 * Measured, against the 4.05 s a hold left alone gets: a 0.15 s tap once the
 * deck has visibly gone buys 4.57 s, a third of a second 4.92 s, a full second
 * 8.07 s. The wrong key costs the same size and the other way — fed instead of
 * fought, a manual is gone in 1.00 s, which is what makes carving through one
 * a decision rather than a freebie.
 */
const MANUAL_CORRECT_RATE = 2.8;
/** Bleed on the balance rate, so a correction settles instead of ringing. */
const MANUAL_BALANCE_DAMP = 2.6;

// --- going down --------------------------------------------------------------
/**
 * The CEILING on how long he lies there. He is normally stood up the moment
 * the body itself says it has stopped moving (`RagdollHandle.settled`); this
 * is the valve for a body that never quite does — wedged against a ledge,
 * creeping down a bank — so the player is never left watching one.
 */
const RAGDOLL_RECOVER = 1.5;
/**
 * …and the floor. `settled` is true before a body is thrown as well as after
 * it lands, so without this a bail with no rig under it — a harness, a run
 * where the character never loaded — would end on the frame it began.
 */
const RAGDOLL_MIN_DOWN = 0.55;
/** How much of your speed the body keeps when it stops being a skater. */
const RAGDOLL_CARRY = 0.7;
/** …and how fast that bleeds off as it slides, m/s². */
const RAGDOLL_DRAG = 9;

export type SkateState = "rolling" | "air" | "grind" | "ragdoll";

export interface SkateInput {
  throttle: boolean;
  brake: boolean;
  /** -1 = left, +1 = right (D / ArrowRight is +1). */
  steer: number;
  /** Jump key still down — he is crouched, winding up. */
  chargeHeld: boolean;
  /** Jump key just let go: the pop. On a rail it is the pop OUT. */
  olliePressed: boolean;
  kickflipPressed: boolean;
  // Milestone 7's new keys. Optional so the input lane can land them on its own
  // clock without the ride waiting on it; an absent flag reads as not pressed.
  /** G. */
  heelflipPressed?: boolean;
  /** C. */
  shoveitPressed?: boolean;
  /** X, held, airborne only. */
  grabHeld?: boolean;
  /** Shift, held. */
  manualHeld?: boolean;
  /** Q, held. */
  noseManualHeld?: boolean;
  /**
   * E, held — **SLIDE ACROSS, and only that.** `src/skate/input.ts` is the
   * authority on which key drives this and states it in the layout block in the
   * same words: *"E (held) SLIDE ACROSS — the deck laid sideways over a line.
   * Riding onto one needs no key at all."* The code's own term for the entry it
   * buys is `Grinder.squareEntry`; SLIDE ACROSS is what the HUD and the controls
   * screen call it, and they are the same thing.
   *
   * The history matters, because the ask reversed. It was first: *"a separate
   * button to turn sliding on, so he doesn't automatically go along rails —
   * it's my choice, on a button."* Then, having played it: *"can we make rail
   * sliding activate when I simply ride onto it, without holding a button. As
   * soon as you ride onto it, the rail slide starts."* So the gate moved from
   * every entry to square entries only — `if (this.grind.squareEntry &&
   * !this.slideWanted)` in `tryCatchGrind`, which is still the CATCH and still
   * nowhere else.
   *
   * Why square entries kept a key when along-the-line entries lost theirs: in
   * this game a square-across ollie IS the boardslide entry, and it is also how
   * you hop a kerb on the way somewhere else. Same approach, same arc, same
   * frame — no geometry separates them, so the only thing that can is the
   * player saying which he meant. Measured: making them automatic too locks on
   * 82 of 1432 hops taken to CLEAR a line.
   *
   * The three keys above also swapped in the same remap he asked for — grab X,
   * manual Shift — and this comment used to name the old ones. Everything the
   * Grinder decides once he is on a line is untouched either way: a rail is
   * still a landing surface, it still declines a board on its way UP, `flip < 1`
   * still puts him down. Letting GO mid-grind still does nothing — Space pops
   * you out and the end of the rail runs you off it.
   */
  slideHeld?: boolean;
}

export interface SkateEvents {
  /** `span` is how long this kick lasts, so the clip can be paced to fit it. */
  onPush?: (span: number) => void;
  /** He has started, or stopped, crouching into a jump. */
  onCharge?: (winding: boolean) => void;
  /** `airTime` is how long the pop buys, so the clip can be paced to fit it. */
  onPop?: (trick: TrickName, airTime: number) => void;
  /**
   * `slam` is how much of the arrival the legs could NOT take, m/s — 0 for
   * every landing the ride is normally made of, and up to a few m/s off a drop
   * that would once have ended the run. It is the one thing that tells a
   * cushion how deep to bend and an impact sound how hard to hit, now that
   * coming down heavy costs speed instead of costing the run.
   */
  onLand?: (trick: TrickName | null, streak: number, slam?: number) => void;
  /**
   * A line ended on the FLOOR — a manual let go of with the wheels never having
   * left it. It is the one way a combo closes that no landing is going to
   * announce, and it is its own event rather than a second `onLand` because
   * there was no landing: a listener told otherwise would thump the concrete
   * and bend his knees for a touchdown that never happened. Whoever banks a
   * line on `onLand` banks it here too, and nothing else.
   */
  onGroundClose?: (streak: number) => void;
  /**
   * The run ended badly. Kept from milestone 4 so the existing audio and HUD
   * routing still fires; `onRagdoll` is the one that carries the physics.
   */
  onBail?: (trick: TrickName | null) => void;
  /** The board locked onto a line. */
  onGrindStart?: (kind: GrindKind, line: GrindLine) => void;
  /** …and left it, either popped out / ran off (false) or lost it (true). */
  onGrindEnd?: (bailed: boolean) => void;
  /** A spin resolved on landing (or when a ground pivot ended). Signed degrees. */
  onSpin?: (landedDegrees: number) => void;
  /** He is riding the other way round now — every mirrored clip keys off this. */
  onStance?: (stance: Stance) => void;
  /** A trick was banked. `name` already has the spin folded in ("360 Kickflip"). */
  onTrick?: (id: TrickId, name: string, score: number) => void;
  /**
   * Up on two wheels, or back down on four. `nose` is which end is in the air —
   * E rides the tail, Q rides the nose. The controls screen offers them as two
   * tricks, so they have to arrive as two: the deck's rake already tells them
   * apart and the body has a weight shift for each.
   */
  onManual?: (on: boolean, nose?: boolean) => void;
  /**
   * Reaching for the deck, and letting go of it. The string is the grab's own
   * name ("Indy", "Method") — the callout it will bank under, picked off the
   * stick at the instant he reaches. `null` is both hands back over his feet,
   * however that happened: released, landed on, or dropped by a bail.
   */
  onGrab?: (flavour: string | null) => void;
  /** The bones let go. `impactVelocity` is the board's world velocity at impact. */
  onRagdoll?: (impactVelocity: THREE.Vector3) => void;
  /**
   * He hit something solid — a wall, the side of a ledge, a kerb taken square.
   * `into` is the velocity that went into the concrete rather than along it,
   * m/s, which is exactly how hard it sounded. A hit past `WALL_SLAM` also
   * bails, so this fires one frame before `onBail` on the bad ones.
   */
  onWallHit?: (into: number) => void;
}

export const EMPTY_INPUT: SkateInput = {
  throttle: false,
  brake: false,
  steer: 0,
  chargeHeld: false,
  olliePressed: false,
  kickflipPressed: false,
  heelflipPressed: false,
  shoveitPressed: false,
  grabHeld: false,
  manualHeld: false,
  noseManualHeld: false,
  slideHeld: false,
};

/**
 * How willingly the board turns at a given speed. Standing still you can only
 * shuffle the nose around; at a cruise it carves hard; flat out it goes wide —
 * which is what makes committing to speed a decision.
 */
function turnFactor(speed: number): number {
  const s = Math.abs(speed);
  const spool = Math.min(1, s / 5.5);
  const washout = Math.min(1, Math.max(0, (s - 7) / 9));
  return 0.35 + 0.75 * spool - 0.42 * washout;
}

/** The stick, with a carve's dying tail taken out of it — see `AIR_SPIN_DEADZONE`. */
function spinStick(steer: number): number {
  const s = Math.abs(steer);
  if (s <= AIR_SPIN_DEADZONE) return 0;
  return Math.sign(steer) * ((s - AIR_SPIN_DEADZONE) / (1 - AIR_SPIN_DEADZONE));
}

const _impact = new THREE.Vector3();
/** What the lip test worked out, so the walk can act on it without allocating. */
const _lip = { leaves: false, grade: 0, speed: 0 };
/** …and what the rider is asking of the ground, handed to the walk the same way. */
const _drive = { pump: false, steer: 0, coast: true };
/**
 * Where the line says the board is this frame — asked BEFORE the board is moved
 * there, which is the whole point of it. See `railWalk`.
 */
const _railTo = new THREE.Vector3();

/** An angle difference taken the short way round, radians. */
function shortWay(radians: number): number {
  return Math.atan2(Math.sin(radians), Math.cos(radians));
}

/** Bleed `amount` off a signed speed without ever pushing it past a standstill. */
function towardZero(value: number, amount: number): number {
  return Math.abs(value) <= amount ? 0 : value - Math.sign(value) * amount;
}

/**
 * Rise per metre travelled along a grind line, in the direction he is riding
 * it. A rail is a tangent like any other surface — it is what he leaves along
 * when he pops off the end of a handrail.
 */
function railGrade(state: GrindState): number {
  const run = Math.hypot(state.line.b.x - state.line.a.x, state.line.b.z - state.line.a.z);
  if (run < 1e-4) return 0;
  return ((state.line.b.y - state.line.a.y) / run) * state.dir;
}

export class SkateModel {
  readonly position = new THREE.Vector3(0, 0, 0);
  /** Yaw, radians. Forward is (sin heading, 0, cos heading). */
  heading = 0;
  /**
   * Along-surface speed, m/s. SIGNED: negative is rolling backwards, which is
   * what a transition you could not clear does to you. Anything printing it
   * (HUD, roll audio) wants `Math.abs`.
   */
  speed = 0;
  /** Vertical velocity — only meaningful while airborne. */
  vy = 0;
  /**
   * Horizontal flight velocity, m/s, and the reason a spin does not curl the
   * flight path into a circle.
   *
   * Grounded, where he goes IS where he points: the wheels only roll one way,
   * so the stride is `speed` along the heading. The moment they are off the
   * floor that stops being true — a skater who spins keeps going where he was
   * going — so the ride carries the velocity itself from take-off to
   * touchdown, and `heading` becomes what he is POINTING at and nothing more.
   * Only meaningful while airborne; every take-off sets it fresh.
   */
  private velX = 0;
  private velZ = 0;
  state: SkateState = "rolling";
  /** Which way round he is standing. A 180 flips it. */
  stance: Stance = "regular";

  /** Smoothed bank angle, positive = leaning into a right-hand carve. */
  lean = 0;
  /** Board's nose-up pitch through the pop, radians. Negative is nose-up. */
  boardPitch = 0;
  /** 0 → 1 as the board comes round on a flip; 1 means caught. */
  flip = 1;
  /** Which way the board is coming round: a flip rolls, a shove-it yaws. */
  flipAxis: "roll" | "yaw" = "roll";
  /** …and which way round. Kickflip and heelflip are the same axis, opposite signs. */
  flipSign: 1 | -1 = -1;

  /** The trick currently in the air, if any — display name, for the clip layer. */
  trick: TrickName | null = null;
  /** …and its id, for the score and the trick table. */
  trickId: TrickId | null = null;
  /** Consecutive clean landings. */
  streak = 0;
  // There is no `score` here on purpose. The model used to keep one, and it was
  // a running total of BASE trick values — so it diverged from the number on
  // screen by the whole combo multiplier, which only the HUD applies. Two
  // scores, one of them wrong, and the wrong one was the one the harness read.
  // The score lives in exactly one place now: `Hud.commitBank`, off `onTrick`.
  /** Counts up while he is down, so the visual can time the tumble. */
  bailT = 0;
  /** True while the jump key is down and he is crouched, loading the pop. */
  charging = false;

  /** Degrees turned since this air (or pivot) began — the landing reads it. */
  readonly spin: SpinTracker = createSpinTracker();
  /** The grind in progress, or null. The grind lane owns everything inside it. */
  grindState: GrindState | null = null;

  /** Ground normal under the board — the visual tilts the deck onto it. */
  readonly surfaceNormal = new THREE.Vector3(0, 1, 0);
  /** What the wheels are on right now — the roll sound reads this. */
  surfaceKind: SurfaceKind = "grass";

  /** The world, asked rather than collided with. Swap it, then call `reset()`. */
  surface: SurfaceProvider;
  /** Rails and ledges: is there a line to catch, and am I still on it. */
  grind = new Grinder();
  /** Keys → tricks → scores. */
  tricks = new TrickBook();
  /**
   * The body, once the bones have stopped being animated and started being
   * physics. The model stands him back up when THIS says he has come to rest;
   * the recover timer is only the ceiling over it. Left null — a harness, a
   * run where the character never loaded — the timer is all there is.
   */
  body: RagdollHandle | null = null;

  private pushT = PUSH_INTERVAL; // ready to kick immediately
  private pushPending = false;
  /** Last frame's push key, so a manual can see the key GO down — see the push block. */
  private throttleWas = false;
  /** Seconds of drive left in the current stroke. */
  private driveT = 0;
  /** The held trick (grab / manual / nose manual) and how long it has run. */
  private holding: TrickId | null = null;
  private holdT = 0;
  /**
   * How far past the balance point he is on two wheels: 0 on it, −1 with the
   * wheels arriving back on the floor, +1 with the tail (or the nose) about to
   * scrape. The deck's rake draws it and A/D fight it — see `stepManual`.
   */
  private manualBal = 0;
  private manualBalVel = 0;
  /**
   * Seconds ON TWO WHEELS, which is not the same clock as `holdT`.
   *
   * `holdT` is what the trick is PAID for and it starts again at every link, so
   * rolling from E into Q resets it — two tricks, two payments. The balance
   * does not restart there: he is still up on two wheels, he has only shifted
   * his weight to the other truck, and a wander that started again on every
   * handover would make alternating E and Q an unlimited manual.
   */
  private manualT = 0;
  /** Which way this manual wants to fall, ±1 — see `MANUAL_ENTRY_LEAN`. */
  private manualSide = 1;
  /**
   * The balance ran out, or a push asked for his foot back. Read once by the
   * trick book on the frame it is set (`TrickContext.holdSpent`), which banks
   * the manual, drops the wheels and locks the key out until it comes up.
   */
  private manualSpent = false;
  private pivoting = false;
  /**
   * May a RISING board be offered a line at all?
   *
   * Only one kind of air may: the one that began with a pop off the floor. An
   * ollie onto a handrail rises to it off the platform beside it and crosses
   * its height about a metre in, so a descent-only question could only ever
   * catch a rail the hang time happened to end on top of. Everything else that
   * leaves a surface is going where its own speed sends it and is not shopping
   * for a rail on the way — a coping, a stair nose, a kerb, and the pop OUT of
   * a line you left on purpose. Cleared by every take-off; set again only by
   * the pop that happens with the wheels on the floor.
   */
  private catchWhileRising = false;
  /** `flip` as it stood at the top of this frame — see `tryCatchGrind`. */
  private flipWas = 1;
  /** Squarest wall contact this frame — the share of the step that survived it. */
  private wallAlong = -1;
  /** …and how far the face THAT contact was against stood over the board. */
  private wallOver = 0;
  /** …and whether he was already leaning on it last frame. See `settleWall`. */
  private onWall = false;
  /** The slide key, as of this frame's input — see `SkateInput.slideHeld`. */
  private slideWanted = false;
  /** True while the wheels are running against the way he is standing. */
  private rollingBackwards = false;
  /** The heading the last time they agreed — see `syncStance`. */
  private faceHeading = 0;
  private sample: SurfaceSample = makeSample();
  private events: SkateEvents;

  constructor(events: SkateEvents = {}, surface: SurfaceProvider = FIELD_SURFACE) {
    this.events = events;
    this.surface = surface;
    const start = surface.spawn();
    this.position.set(start.x, surface.height(start.x, start.z), start.z);
    this.heading = start.heading;
  }

  get forwardX(): number {
    return Math.sin(this.heading);
  }
  get forwardZ(): number {
    return Math.cos(this.heading);
  }
  get airborne(): boolean {
    return this.state === "air";
  }
  get grinding(): boolean {
    return this.state === "grind";
  }
  /**
   * How far past the balance point he is on two wheels, −1…+1, or null when he
   * is not on two wheels at all.
   *
   * The same shape `GrindState.balance` has, deliberately: the HUD's gauge
   * takes one number in the same range and does not care which trick grew it
   * (`Hud.setBalance`). The deck's own rake is already the in-world readout, so
   * the gauge is a second opinion rather than the only one.
   */
  get manualBalance(): number | null {
    return this.holding === "manual" || this.holding === "noseManual" ? this.manualBal : null;
  }
  /**
   * The direction he is TRAVELLING, radians, in the same convention as
   * `heading`.
   *
   * They part company the moment the wheels start running the other way: roll
   * back down a transition you could not clear and the deck still points up it
   * while you go down. `heading` stays the deck's — the rig draws the plank on
   * it — and this is the direction the RIDER is facing, because riding
   * backwards is exactly what turns him round on the deck (`syncStance`).
   * Anything that wants to know where he is going rather than which way the
   * nose is — a chase camera, the roll audio's doppler — asks this.
   *
   * The sign of the WHEELS, not the stance. Those two used to be the same
   * question and are not any more: land a 180 and he keeps his line with the
   * board backwards under him, standing the way he always stood — so the deck
   * points one way, the rider another, and the travel a third. This is the
   * travel, which is what a chase camera is for.
   */
  get course(): number {
    if (this.state === "air") {
      return Math.hypot(this.velX, this.velZ) > 1e-4
        ? Math.atan2(this.velX, this.velZ)
        : this.heading;
    }
    return this.speed < 0 ? this.heading + Math.PI : this.heading;
  }

  /**
   * +1 riding nose-first, −1 riding tail-first — the direction the RIDER faces,
   * along the heading.
   *
   * A push drives him the way he is looking. Once he has turned round on the
   * deck that is the other way down the same line, and a kick that still added
   * speed up the heading would be a skater facing downhill pressing W and
   * slowing down.
   */
  private get rideSign(): 1 | -1 {
    return this.stance === "switch" ? -1 : 1;
  }
  /** Height of the deck above the surface it is over — drives the drop shadow. */
  get altitude(): number {
    return (
      this.position.y -
      this.surface.height(this.position.x, this.position.z, this.position.y + HINT_LIFT)
    );
  }

  reset(): void {
    // R is a TELEPORT, and the fall's two exits are both journeys home — the
    // get-up blends the skeleton back, the deck slides to his feet over
    // `BOARD_RETURN`. Both solve against a home that is about to be somewhere
    // else entirely, so without this the board streaks in from wherever he
    // bailed for half a second after the respawn. `cancel` skips the journeys.
    this.body?.cancel();
    const start = this.surface.spawn();
    this.position.set(start.x, this.surface.height(start.x, start.z), start.z);
    this.heading = start.heading;
    this.speed = 0;
    this.vy = 0;
    this.velX = 0;
    this.velZ = 0;
    this.state = "rolling";
    this.rollingBackwards = false;
    this.faceHeading = start.heading;
    this.lean = 0;
    this.boardPitch = 0;
    this.flip = 1;
    this.flipWas = 1;
    this.trick = null;
    this.trickId = null;
    this.streak = 0;
    this.bailT = 0;
    this.pushT = PUSH_INTERVAL;
    this.pushPending = false;
    // As if the key had never been down: a respawn with W still held is a fresh
    // press as far as the ride is concerned, which is the answer that leaves him
    // rolling rather than waiting for a key he is already holding.
    this.throttleWas = false;
    this.driveT = 0;
    this.dropHold();
    this.pivoting = false;
    this.catchWhileRising = false;
    // Announced, not just cleared: R pressed halfway down a handrail otherwise
    // leaves the grind loop playing and the rider still yawed across a line
    // that is now on the other side of the plaza. Nothing is banked — a respawn
    // pays for nothing.
    if (this.grindState) {
      this.grindState = null;
      this.events.onGrindEnd?.(false);
    }
    // Both lanes keep state the model cannot see: the Grinder remembers the
    // line he just left so it cannot re-take him on the spot, and the trick
    // book is holding an unbanked combo. A respawn is a new run for them too.
    this.grind.reset();
    this.tricks.reset();
    this.spin.reset();
    this.surfaceNormal.set(0, 1, 0);
    this.wallAlong = -1;
    this.wallOver = 0;
    this.onWall = false;
    this.setStance("regular");
    this.setCharging(false);
  }

  update(input: SkateInput, dt: number): void {
    // Read first and kept, because the question it answers is asked deep inside
    // the step — `tryCatchGrind` runs out of `roll()` and out of `flight()`,
    // neither of which is handed the frame's input. See `SkateInput.slideHeld`.
    this.slideWanted = input.slideHeld === true;
    if (this.state === "ragdoll") {
      this.updateRagdoll(dt);
      this.settleWall(dt);
      return;
    }
    if (this.state === "grind") {
      this.updateGrind(input, dt);
      this.settleWall(dt);
      return;
    }

    const grounded = this.state === "rolling";
    const steer = THREE.MathUtils.clamp(input.steer, -1, 1);
    const yHint = this.position.y + HINT_LIFT;

    // --- steering, and the spin ---------------------------------------------
    // Minus: screen-right is decreasing heading (see the header note). Written
    // as a signed delta because the spin tracker has to see exactly what was
    // applied — the landing decides everything off that running total.
    if (grounded) {
      // Brake + steer is a PIVOT: he scrubs the wheels round on the spot and
      // rides back out the way he came, and it is a turn like any other turn —
      // the whole assembly comes round together and his feet never move on the
      // deck (see `endPivot`).
      //
      // It begins where the PLAYER begins it — brake down, stick over — and
      // nowhere else. Speed used to be part of the same test, and it made the
      // stance change come off a hidden, speed-dependent slice of the turn
      // instead of off the 180 he could see: hold the brake and the stick from
      // 10 m/s and the first two thirds of the arc were spent above
      // `PIVOT_MAX_SPEED`, counted by nothing, and the tracker started from
      // zero somewhere in the middle of a turn already well under way. A player
      // who watched the board come the whole way round and did not come out of
      // it switch had been lied to about what he was doing.
      //
      // Speed still decides the RATE, which is the part he can see: under
      // `PIVOT_MAX_SPEED` the wheels break loose and it whips round, above it
      // the wheels are still gripping and a brake-and-steer is a hard scrubbing
      // carve that comes round slowly. Either way every degree of it is
      // counted, and the brake is taking 11 m/s² out of him throughout, so a
      // pivot begun at pace is under the crossover inside half a second.
      //
      // …and it is the SPEED that reads the magnitude, not the signed speed.
      // Read signed, rolling fakie down a bank at −12 m/s passed the test and
      // scrubbed a 180 at any pace at all.
      const scrubbing = input.brake && Math.abs(steer) > PIVOT_STEER;
      if (scrubbing) {
        const rate =
          Math.abs(this.speed) < PIVOT_MAX_SPEED
            ? PIVOT_RATE
            : TURN_RATE * turnFactor(this.speed);
        const turn = -steer * rate * dt;
        this.heading += turn;
        this.spin.add(turn);
        this.pivoting = true;
      } else {
        if (this.pivoting) this.endPivot();
        this.heading -= steer * TURN_RATE * turnFactor(this.speed) * dt;
      }
    } else {
      // Airborne this is no longer a nudge of the nose — it SPINS. Everything
      // it turns is counted, and the landing pays for whatever is left over,
      // which is exactly why the dying tail of a carve must not reach it.
      const turn = -spinStick(steer) * AIR_SPIN_RATE * dt;
      this.heading += turn;
      this.spin.add(turn);
    }

    // An open field turns you back at its soft edge rather than stopping you
    // dead. A street spot has walls instead and leaves `softEdge` unset.
    const soft = this.surface.softEdge;
    if (soft !== undefined) {
      const edge = Math.max(
        Math.abs(this.position.x) - soft,
        Math.abs(this.position.z) - soft,
      );
      if (edge > 0 && Math.abs(this.speed) > 0.5) {
        const toCentre = Math.atan2(-this.position.x, -this.position.z);
        let delta = toCentre - this.heading;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // shortest way round
        const push = Math.min(1, edge / 18) * EDGE_TURN;
        this.heading += delta * push * dt;
      }
    }

    // --- the slope under him -------------------------------------------------
    // Rise per metre travelled along the heading, here only so a pop knows the
    // tangent it leaves on. What the slope does to his SPEED is not decided
    // here any more: it is decided one piece of ground at a time inside
    // `roll()`, because a quarter pipe turns through eighty degrees in three
    // metres and a frame's stride is far too long a ruler to charge gravity
    // over. Held at the frame's start position, which is where a pop happens.
    let grade = 0;
    if (grounded) {
      grade = this.surface.slopeAlong(
        this.position.x,
        this.position.z,
        this.forwardX,
        this.forwardZ,
        yHint,
      );
    }

    // --- speed --------------------------------------------------------------
    if (grounded) {
      // Pushes are discrete kicks, not a car throttle — that rhythm IS skating.
      this.pushT += dt;
      // --- the push and the manual, and which one you asked for last ---------
      //
      // The player: *"when I do a manual, I can't press push. That's strange."*
      // The key was not dead — the ride kicked, the speed went up, and the
      // clips fought over his legs where he could see it. What it could not do
      // is the one thing the move means.
      //
      // **A push ENDS a manual, and that is the honest answer.** A manual is
      // balanced on one truck with BOTH feet on the deck; a foot that reaches
      // the ground is a manual that is over, and there is no pumping to fall
      // back on — you cannot pump flat concrete, and inventing a held-speed
      // manual would pay the player for the one trick that already keeps his
      // line alive for free. So the wheels come down, the manual banks its
      // seconds (the trick book locks E/Q out until the key comes up, exactly
      // as a balance that ran out does), and he kicks.
      //
      // WHICH KEY WINS is decided by which one arrived SECOND, which is the
      // rule this game already runs for the push against the pop
      // (`input.ts`, `pushLocked`):
      //
      //   · **push already held, E/Q arrives** — he is rolling and asks for a
      //     manual. The manual is what he asked for, so it wins and the kicks
      //     stop for as long as it is up. A player who rides with W permanently
      //     down — which is most of them — gets his manual, not a foot down
      //     0.85 s later.
      //   · **manual up, push GOES down** — he asks for his speed back. The
      //     push wins: this frame the manual is spent and the kick fires.
      //
      // Both keys arriving on the same frame is neither, and falls out of the
      // ordering for free: `holding` here is still last frame's, so a manual
      // that starts on this frame is not up yet, he kicks, and the manual comes
      // up behind it.
      const pushAsked = input.throttle && !this.throttleWas;
      this.throttleWas = input.throttle;
      const onTwoWheels = this.holding === "manual" || this.holding === "noseManual";
      // Spent on the ASK, not on the kick landing: the ceiling and the 0.85 s
      // rhythm can both refuse the kick, and a foot he took off the deck is off
      // it either way. Whatever the kick does, the wheels come down — the key
      // is never the no-op the player reported.
      if (onTwoWheels && pushAsked) this.manualSpent = true;
      // …and it is the MAGNITUDE that is against the ceiling. Read signed, a
      // skater riding switch at 15 m/s was still under `MAX_SPEED` by any test
      // and kicked forever, because his speed is a negative number.
      if (
        input.throttle &&
        (!onTwoWheels || pushAsked) &&
        this.pushT >= PUSH_INTERVAL &&
        Math.abs(this.speed) < MAX_SPEED
      ) {
        this.pushT = 0;
        this.pushPending = true;
        this.events.onPush?.(PUSH_INTERVAL);
      }
      if (this.pushPending && this.pushT >= PUSH_WINDUP) {
        this.pushPending = false;
        this.driveT = PUSH_DRIVE;
      }
      // The kick feeds in over the length of the stroke instead of landing as
      // one instant lurch — a foot on tarmac accelerates you, it doesn't hit.
      if (this.driveT > 0) {
        this.driveT = Math.max(0, this.driveT - dt);
        // Along the way he is GOING, not the way he is standing. Rolling fakie
        // after a 180, a kick that added speed up his own facing would brake him
        // — a skater pressing forward and slowing down, which is the thing the
        // player described as "we're moving the character incorrectly". Once he
        // is stopped there is no travel to follow and his facing decides.
        const rolling = Math.abs(this.speed) > PUSH_ROLL_MIN;
        const drive = rolling ? Math.sign(this.speed) : this.rideSign;
        // …and a foot cannot shove you through concrete you are already flush
        // against. Asked only of a board that has STOPPED — see `pushBlocked` for
        // why that scope is the whole of it, and why a moving board must keep
        // feeding the walk instead.
        if (rolling || !this.pushBlocked(drive, grade)) {
          this.speed = THREE.MathUtils.clamp(
            this.speed + drive * (PUSH_IMPULSE / PUSH_DRIVE) * dt,
            -MAX_SPEED,
            MAX_SPEED,
          );
        }
      }

      if (input.brake) {
        this.speed = towardZero(this.speed, BRAKE_DECEL * dt);
      }

      // Gravity, the pump and the rolling losses are all charged inside
      // `roll()` — per piece of ground, against the slope that piece actually
      // has and at the speed he is actually doing on it.
    }

    // --- wind-up ------------------------------------------------------------
    // Announced BEFORE the tricks below, so the frame he lets go the crouch is
    // already released when the pop asks for the trick clip.
    this.setCharging(grounded && input.chargeHeld);

    // --- the balance he is holding, if he is up on two wheels ----------------
    // Before the trick block, so the frame it runs out is the frame the book is
    // told about it — a balance the ride reads a frame late is a manual that
    // ends after the deck has already reached the floor.
    if (grounded && (this.holding === "manual" || this.holding === "noseManual")) {
      this.stepManual(steer, dt);
    }

    // --- tricks -------------------------------------------------------------
    const ctx: TrickContext = {
      grounded,
      airborne: !grounded,
      grinding: false,
      stance: this.stance,
      speed: this.speed,
      fakie: this.rollingBackwards,
      flipping: this.flip < 1,
      // Without this a manual never runs out — the book ends the hold, and it
      // can only end what it is told about. See `stepManual`.
      holdSpent: this.manualSpent,
    };
    this.setHold(this.tricks.held(input, ctx));
    if (this.holding) this.holdT += dt;
    // …and if that let go of a manual with the wheels still down, the line it
    // was part of is over. `setHold` has already banked the trick one line
    // above, so the link is in the readout before the close arms the bank —
    // the same order a landing arrives in.
    if (this.tricks.takeGroundClose()) this.events.onGroundClose?.(this.streak);

    const fired = this.tricks.resolve(input, ctx);
    if (fired && grounded) {
      // Popping off a transition takes the transition with you: the legs add
      // their impulse to the velocity the surface already had you carrying.
      this.pop(fired, grade);
      // The one air that may still be offered a line while it is RISING: he
      // jumped, off the floor, on purpose, and an ollie onto a handrail is
      // exactly that. Set after the pop, which clears it.
      this.catchWhileRising = true;
    } else if (fired && fired !== "ollie" && !ctx.flipping) {
      // Late flick: turn an ollie already in the air into a flip. Riskier —
      // there is less hang time left for the board to come round.
      this.trickId = fired;
      this.trick = this.tricks.def(fired).name;
      this.setFlip(fired);
    }

    // --- integrate ----------------------------------------------------------
    // Read the state again rather than reusing `grounded`: a pop fired above
    // has already taken the wheels off, and the frame it fires belongs to the
    // air. (It used to be spent on the floor, which cost every ollie its first
    // frame of rise.)
    const yBefore = this.position.y;
    if (this.state === "rolling") {
      _drive.pump = input.chargeHeld;
      _drive.steer = steer;
      _drive.coast = !input.throttle;
      const spare = this.roll(dt);
      // Asked through the getter: `roll` can take the wheels off mid-frame, and
      // a direct comparison here reads as the state we came in on.
      if (this.airborne) {
        // The floor ran out part way through the frame; the rest of it is air.
        if (spare > 0) this.flight(spare, yBefore);
      } else if (!this.tryCatchGrind(yBefore, true)) {
        // Wheels down and a line under them. The Grinder's answer to this is
        // always NO today, and that is its rule rather than a tight threshold:
        // every ledge line in this plaza lies flush on the top face of the
        // thing it is the edge of, so a board rolling anywhere near one is
        // level with it and no measurement separates trucks-on-the-kerb from
        // wheels-on-the-pavement-beside-it — 237 of 576 straight rolls with
        // nothing pressed used to end locked onto a line. You ollie onto an
        // edge. The question is still ASKED so that the day a kerb stands proud
        // of the pavement the grind lane can answer it without a call site
        // moving; until then this is the branch that always runs.
        this.readSurface(this.position.y + HINT_LIFT, dt);
        this.boardPitch = THREE.MathUtils.damp(this.boardPitch, this.manualPitch(), 12, dt);
      }
    } else if (this.state === "air") {
      this.flight(dt, yBefore);
    }

    // --- which way round he is standing --------------------------------------
    // After the step, because it is an answer about the wheels and the wheels
    // have only just finished turning: a touchdown inside `flight()` above has
    // already set the speed he rides away at, and this is the frame he turns
    // round on if it came out negative. Rolling only — see `syncStance`.
    if (this.state === "rolling") this.syncStance();

    // --- lean ---------------------------------------------------------------
    // The magnitude is the SPEED and so is the direction — one signed term, and
    // that is the whole of this block.
    //
    // The history, because the sign has now been wrong twice in two different
    // ways. It began as the plain signed speed doing both jobs, which broke the
    // magnitude the moment switch became a state you can hold: `min(1, s/4)`
    // reads −5 at 20 m/s backwards, five times past the bank's own ceiling. That
    // was fixed by taking the magnitude off `Math.abs` and hanging the DIRECTION
    // on `rideSign` — the way the rider's body is set up — and that is right for
    // exactly half of the ways of riding the other way round.
    //
    // What the sign actually answers: `lean` is a roll about the DECK's long
    // axis (`SkaterRig.bank`, which sits ABOVE the stance half-turn on purpose),
    // and the carve it leans into is an arc in the WORLD. The trajectory curves
    // toward the side the TRAVEL direction is swinging to, and travel is
    // `sign(speed) · forward` — so which way the bank goes is decided by which
    // way the wheels are running along the deck, and by nothing about the body.
    //
    // `rideSign` agrees with that whenever the wheels and the rider agree —
    // regular running nose-first, switch running tail-first — and disagrees in
    // exactly the states `fakie` names: the board came round under feet that did
    // not follow (a landed 180), so the rider is still set up nose-first while
    // the wheels run the other way. There the bank came out mirrored, which is
    // the player's "when I turn left or right in switch, the lean stays
    // reversed". Riding switch AND fakie at once (a 180 landed out of switch)
    // was mirrored the same way, from the other side.
    //
    // Why HERE and not at `SkaterRig.bank.rotation.z`: `lean` is one channel
    // with three writers in this file — this carve, the grind's balance
    // (`stepGrind`, which decides its own sign on the rail) and the ragdoll's
    // decay to zero — and one reader. A flip at the reader would silently
    // mirror the other two as well, and would put the question "which way is he
    // rolling?" in the one node that deliberately knows nothing about it. The
    // model owns the ride's direction; the rig just draws the number.
    //
    // Written as ONE clamped signed term instead of `abs · sign`, because it is
    // continuous through zero: `syncStance`'s deadband holds the stance around
    // 0 m/s, and a sign that changed hands there as a step would pop the bank.
    // It is not smoothing — the ramp to full lean was always here, and the value
    // it produces in regular and in settled switch is identical to before.
    const leanTarget = grounded
      ? steer *
        MAX_LEAN *
        turnFactor(this.speed) *
        THREE.MathUtils.clamp(this.speed / LEAN_FULL_SPEED, -1, 1)
      : steer * MAX_LEAN * 0.5;
    this.lean = THREE.MathUtils.damp(this.lean, leanTarget, 9, dt);

    // Last, because it may end the run: whatever he ran into during the step.
    this.settleWall(dt);
  }

  // -------------------------------------------------------------------------
  // the world
  // -------------------------------------------------------------------------

  /**
   * One step of world travel, against whatever solid is in the way.
   *
   * A wall takes the part of you that was going INTO it and leaves the part
   * that was going along it — which is the whole rule, and it is the rule the
   * old one only managed at the extremes. That one asked whether an axis slide
   * happened to succeed, so a graze along the brick cost nothing at all and a
   * square hit cost everything: 18 m/s straight into the north block came out
   * at 0.00 m/s, still rolling, with no sound and no bail to show for it, and
   * every 0.40 m ledge in the plaza ended a run the same silent way.
   *
   * So the face is FELT for instead — a fixed 5 cm probe on each axis, so a
   * 144 Hz frame whose whole stride is smaller than that still finds the wall
   * a 30 Hz frame does — and what is left of the step across that face is
   * exactly what is left of his speed. Square is nothing, forty-five degrees is
   * seventy per cent, a graze is nearly all of it. Nothing bounces: a
   * skateboard hitting a wall does not come back.
   *
   * `board` is the height the probe is taken at, and there are TWO of them
   * because the board is not at one height while it crosses a step: `board` is
   * where it started and `boardTo` where it ended. The probe rides the line
   * between them, and the one thing it may never do is walk into the floor it
   * is landing on:
   *
   *   · *the floor is not a wall* — falling, `flight()` integrates y before it
   *     moves him, so a long frame (0.9 m of drop at 10 fps) takes the probe to
   *     a y already under the floor, and read as a wall that deleted every
   *     scrap of the hardest landings' horizontal speed. The old fix was to
   *     freeze the probe at the step's start height, which stopped the floor
   *     reading as a wall by never asking about it at all — and that is a board
   *     falling PAST anything shorter than its own drop. Measured with
   *     `tools/collide-sweep.mjs`: a 16 m/s roll off the north platform at
   *     30 fps went in one face of `clutter-bollard-3` and out the opposite one
   *     with 24 cm of its 53 cm stride inside a bollard whose top stood 27 cm
   *     over the board as it crossed. The probe follows the board down now, and
   *     the distinction is made where it belongs — on WHAT is in the way. See
   *     `ceiling` in `advanceStep`.
   *   · *so far* — the old version took the highest point of the WHOLE step,
   *     which on the way UP is where he will be at the end of it. That is a
   *     board cleared to pass through anything it is going to be above by the
   *     end of the frame, and how much that is worth is a fact about the frame
   *     rate: 0.53 m of a rising ollie at 30 fps against 0.11 m at 144.
   *     Measured with `tools/collide-sweep.mjs`: an ollie taken past a 0.92 m
   *     litter bin at 16 m/s and 30 fps put 26 cm of deck through the corner of
   *     it, and none at all at 144.
   *
   * …and the step is WALKED rather than jumped, in `WALL_STEP` pieces, because
   * the probe only ever speaks for the point it is asked at. See `WALL_STEP`.
   */
  private advance(dx: number, dz: number, board = this.position.y, boardTo = board): void {
    const run = Math.hypot(dx, dz);
    // Where the board's probe stood when the step began. Everything at or under
    // it is ground he was already over and may come down on; everything above
    // it was in his way before the step started. See `advanceStep`.
    const ceiling = board + WALL_PROBE;
    if (run <= WALL_STEP && boardTo === board) {
      this.advanceStep(dx, dz, board, run, ceiling);
      return;
    }
    // Longer than one probe's worth: walk it. See `WALL_STEP` — the test knows
    // only about the point it is asked at, so a step wider than the thing in
    // the way passes straight through it, and how wide a step is is a fact
    // about the frame rate rather than about the ride.
    const pieces = Math.min(WALL_PIECES, Math.max(1, Math.ceil(run / WALL_STEP)));
    const px = dx / pieces;
    const pz = dz / pieces;
    const pr = run / pieces;
    const climb = boardTo - board;
    // Each piece is probed at the LOWER of its own two ends — the start going
    // up, the finish coming down — because that is the lowest the board is
    // anywhere inside it, and a probe taken anywhere higher is a board cleared
    // to pass through something it was under for part of the piece. Going up
    // that used to be the piece's finish, and what it bought was one piece's
    // rise of free pass: measured with `tools/collide-sweep.mjs`, a board
    // leaving map 2's steepest service pipe at 8 m/s and 30 fps climbed 3 cm
    // into `straight-sill` and, still rising, was never offered the landing
    // that would have put him on top of it.
    const lift = climb >= 0 ? 0 : climb / pieces;
    for (let i = 0; i < pieces; i++) {
      const x0 = this.position.x;
      const z0 = this.position.z;
      // The floor arrived inside this piece and he is standing on it: the rest
      // of the step is the landing's, not the walk's.
      if (!this.advanceStep(px, pz, board + (climb * i) / pieces + lift, pr, ceiling)) return;
      // He is up against it and the slide had nowhere to go either: the rest of
      // the step is spent standing there, which is what a wall is.
      if (this.position.x === x0 && this.position.z === z0) return;
    }
  }

  /**
   * One piece of that walk — the whole of the wall rule, over a step short
   * enough that asking about its far end is asking about all of it.
   *
   * Returns false when the walk is over because he has arrived somewhere: see
   * `ceiling` below. A wall returns true — being stopped by one is not the same
   * event as landing on something, and the caller tells them apart by whether
   * the piece moved him.
   */
  private advanceStep(
    dx: number,
    dz: number,
    board: number,
    run: number,
    ceiling: number,
  ): boolean {
    const nx = this.position.x + dx;
    const nz = this.position.z + dz;
    const probe = board + WALL_PROBE;
    // The steel first, because it is the one obstacle `blocked()` cannot see: a
    // bar is a `GrindLine` and not a `Solid`, so the world's own predicate
    // answers false in the middle of every handrail in the game. See
    // `rail-steel.ts` — the test is swept rather than sampled, so a 9 cm tube
    // taken at an angle costs the same answer at 30 fps as at 144.
    if (this.steelStep(dx, dz, probe, board, run)) return true;
    if (!this.surface.blocked(nx, nz, probe)) {
      this.position.x = nx;
      this.position.z = nz;
      return true;
    }
    // In the way of a FALLING probe, and clear at the height the step began at:
    // that is the floor arriving, not a wall.
    //
    // `ceiling` is the same number `flight()` hints its landing with —
    // `max(yBefore, yStep) + WALL_PROBE` — and that is the point of writing it
    // this way rather than as a tolerance of its own. **Anything he can be let
    // into is something he can land on** is already this file's rule; all this
    // does is stop the step one piece INSIDE the thing instead of carrying him
    // out the far side of it, so the landing test at the end of the frame is
    // asked at a point that is actually on it. Land on a bollard, a bin lid or
    // a post top you clipped on the way down — you do not pass through it.
    //
    // The question is asked of `blocked` again rather than of `height`, and the
    // difference is not academic: `blocked` is the whole predicate and `height`
    // is only the part of it that is a floor. Map 2's world bound is a FENCE —
    // a wall that stands over a walkway `height` reports as perfectly
    // standable — so reading the floor there called the fence a landing surface
    // and let a falling board 3 cm past it. Measured with the sweep: an ollie
    // at 16 m/s and 30 fps, pressed against the city-side bound while the fence
    // line narrowed under him, ended 0.80 m outside the world.
    //
    // Inert on any step that is not falling: with `probe === ceiling` the two
    // calls are the same call, so a point that blocked one blocked the other.
    // Rolling and rising steps are bit-for-bit what they were.
    if (probe < ceiling && !this.surface.blocked(nx, nz, ceiling)) {
      this.position.x = nx;
      this.position.z = nz;
      return false;
    }
    if (run < MIN_SLIDE) return true; // pressed against it and going nowhere already

    const fx = dx === 0 ? 0 : Math.sign(dx) * Math.max(Math.abs(dx), WALL_FEEL);
    const fz = dz === 0 ? 0 : Math.sign(dz) * Math.max(Math.abs(dz), WALL_FEEL);
    const facesX = fx !== 0 && this.surface.blocked(this.position.x + fx, this.position.z, probe);
    const facesZ = fz !== 0 && this.surface.blocked(this.position.x, this.position.z + fz, probe);
    let keepX = facesX ? 0 : dx;
    let keepZ = facesZ ? 0 : dz;
    // Neither axis blocked on its own but the diagonal is: the OUTSIDE corner
    // of a box. He gets past on one axis, and it is the one carrying more of
    // the step — the other is what clipped the corner.
    if (keepX !== 0 && keepZ !== 0) {
      if (Math.abs(keepX) >= Math.abs(keepZ)) keepZ = 0;
      else keepX = 0;
    }
    if (keepX !== 0 || keepZ !== 0) {
      const sx = this.position.x + keepX;
      const sz = this.position.z + keepZ;
      if (this.surface.blocked(sx, sz, probe)) {
        keepX = 0;
        keepZ = 0;
      } else {
        this.position.x = sx;
        this.position.z = sz;
      }
    }
    const along = Math.hypot(keepX, keepZ) / run;
    if (this.wallAlong < 0 || along < this.wallAlong) {
      this.wallAlong = along;
      // How tall the thing in the way is, taken from the same point the probe
      // found it and with no hint at all — a hint answers with the floor you
      // could stand on, and the question here is what is standing in front of
      // you. See `WALL_HEAD`: it is the difference between brick and a kerb.
      this.wallOver = this.surface.height(nx, nz) - board;
    }
    return true;
  }

  /**
   * The same piece of step, against the STEEL — the bars, which `blocked()`
   * cannot answer for because a bar is a `GrindLine` and not a `Solid`.
   *
   * Returns true when the piece was spent on a bar, in which case the caller
   * has nothing left to do with it. See `rail-steel.ts` for which bars are
   * fences and how high they stand; the two things this file adds are the two
   * the wall rule already has:
   *
   *   · **what survives is what was going ALONG it** — the same sentence as a
   *     wall's face, over a face whose direction is known exactly instead of
   *     felt for with two 5 cm probes. A bar has one direction and it is in the
   *     line, so there is no corner case and no diagonal to guess at.
   *   · **and it is charged like a wall** — through `wallAlong`, so the sound,
   *     the scrub and the frame-rate independence are the ones already written
   *     down in `settleWall`. `wallOver` is how far the steel stands over the
   *     board, which for every bar in either map is well under `WALL_HEAD`: a
   *     handrail takes your speed and is heard, and it does not put you on the
   *     concrete. That is the same call `WALL_HEAD` already makes for a kerb, a
   *     ledge and a bench — anything you could have gone over the top of.
   *
   * The one thing it does NOT do is shove a board that is running exactly along
   * a bar's axis out from under the steel. That board is not crossing anything;
   * it is either grinding the line or balanced on top of it, and inventing a
   * sideways push there would be a force nothing asked for. What it costs is
   * bounded by the tube: 4.5 cm either side of one line, and `tools/collide-sweep.mjs`
   * measures it rather than assuming it.
   */
  private steelStep(dx: number, dz: number, probe: number, board: number, run: number): boolean {
    const bars = steelBars(this.surface);
    if (bars.length === 0) return false;
    const skip = this.grindState?.line.id ?? null;
    const x0 = this.position.x;
    const z0 = this.position.z;
    const hit = meetSteel(bars, x0, z0, x0 + dx, z0 + dz, probe, skip);
    if (!hit) return false;
    if (run < MIN_SLIDE) return true; // up against it and going nowhere already

    const along = dx * hit.bar.ux + dz * hit.bar.uz;
    let keepX = hit.bar.ux * along;
    let keepZ = hit.bar.uz * along;
    const sx = x0 + keepX;
    const sz = z0 + keepZ;
    // …and the slide only happens if sliding is somewhere he may be: a bar in a
    // doorway would otherwise walk him along it and into the jamb.
    if (this.surface.blocked(sx, sz, probe) || meetSteel(bars, x0, z0, sx, sz, probe, skip)) {
      keepX = 0;
      keepZ = 0;
    } else {
      this.position.x = sx;
      this.position.z = sz;
    }
    const share = Math.hypot(keepX, keepZ) / run;
    if (this.wallAlong < 0 || share < this.wallAlong) {
      this.wallAlong = share;
      this.wallOver = hit.top - board;
    }
    return true;
  }

  /**
   * Is the direction a held push would drive him into concrete he is already
   * against? — the round-six pair, finally closed.
   *
   * **A push is a foot on the ground and a shove. You cannot shove yourself
   * through a wall you are flush against.** That is the whole rule, and it is the
   * only thing this adds: when the direction is unavailable the stroke
   * contributes nothing. It does not brake him, it does not turn him, it does not
   * change what a wall COSTS — `settleWall`, `WALL_SLAM`, the sound and the
   * ragdoll are all untouched. He pushes off again the instant he is pointing
   * somewhere that exists.
   *
   * WHY IT IS HERE, and it took a body to reach it. `PUSH_ROLL_MIN`'s note has
   * said since round six that below 0.05 m/s the push follows `rideSign` — the way
   * he is FACING — because a board that has stopped has no travel to follow. That
   * is right. What was missing is that it never asked whether the facing was a
   * direction he could actually go. `BACK_LIP_ANGLE` and `BACK_SHELF` record the
   * ride-side half of this being fixed twice, by making the shelf steeper than a
   * held push; the pair itself was never closed, because the RIDE cannot reach
   * 0.05 m/s at that ramp any more. Measured with `tools/back-air.mjs`: touchdown
   * behind that coping is 2.6–3.0 m/s, ~55× the deadband, so the push always
   * follows his motion and the facing is never consulted. Two reproductions on the
   * same tree get there anyway, and neither is a ride:
   *
   *   · **A BAIL, which obeys none of the ride's gates.** `tools/ragdoll-drop.mjs`
   *     — a body that bails in the air past that coping comes to rest ON the
   *     4.21 m level top (hips 4.34 at z 47.3–47.5, 10 of 10 rows at five frame
   *     rates; a bail on the WHEELS slides to the plaza every time). The stand-up
   *     hands the controls back 1.37 s later, on his feet, at ~0 m/s, 0.5 m from
   *     the brick — inside the deadband, facing the wall. He then pushed into it
   *     for as long as the key was held.
   *   · **The level's own taught line.** Hold W from the spawn and nothing else:
   *     he slams the south platform at 16.2–16.9 m/s at t≈14.7 s, recovers in
   *     place at (2.0, 1.15, −34.0), and `settleWall`'s `along === 0` then held
   *     him at 0.00 m/s for the remaining 74 s of a 90 s run, at all three frame
   *     rates. The taught line dead-ended in a wall you could not push off.
   *
   * THE TEST IS THE WALK'S OWN, and deliberately not a second copy of it: the same
   * `surface.blocked` predicate, the same `WALL_PROBE` clearance and the same
   * `WALL_FEEL` reach that `advanceStep` uses for exactly this question, asked at
   * exactly one point. What it must NOT be is a horizontal probe — `roll()`
   * advances along the surface TANGENT, and a horizontal 5 cm at this spot's own
   * 88° coping is 1.43 m of rise, so a flat probe calls every transition in the
   * level a wall and would have taken the push away on every ramp in the game.
   * Walked along the tangent the same 5 cm rises 5 cm, clears `WALL_PROBE` by
   * 6×, and the ramps are untouched: the far ramp's whole table is unchanged
   * either side of this.
   *
   * SCOPED TO A BOARD THAT HAS STOPPED, and that boundary is load-bearing rather
   * than cautious. It is asked only where `PUSH_ROLL_MIN` already hands the drive
   * to `rideSign` — the same deadband, unchanged, because that IS the defect's
   * whole domain: a rider with speed has a direction of travel, and both
   * reproductions above are of a rider with none.
   *
   * What the scope protects is the DIAGONAL, and a binary test would have broken
   * it. A rider pressed against a wall at an angle legitimately slides ALONG it —
   * `advanceStep` keeps the along-face component and `settleWall` charges the rest
   * — and the push feeding that slide is a skater doing a real thing. This test
   * cannot see the difference: it probes one point along the travel direction, and
   * for any diagonal that point is inside the face, so an unscoped version would
   * have taken the slide away too. A moving board is left to the walk, which
   * already resolves it properly and by component instead of by yes-or-no.
   *
   * Why the walk's own `wallAlong` is not used INSTEAD of a probe, since it is the
   * better number: at 0.00 m/s there is no step for the walk to resolve — `roll()`
   * takes the `MIN_ROLL` branch straight to `stall()` and never calls `advance` —
   * so `wallAlong` has nothing to report and goes stale at whatever the last
   * motion said. A rider frozen on the deck would then stay frozen even after
   * turning to face open ground, which is the opposite of the point. The probe is
   * live every frame, so the moment he steers away from the wall it answers false
   * and the stroke lands.
   *
   * The steel is not consulted. A bar stands under `WALL_HEAD` by construction
   * (see `steelStep`) — it takes your speed and does not stand in your way — and
   * asking `meetSteel` here would be a swept segment test per frame for a case
   * that cannot pin anybody.
   */
  private pushBlocked(drive: number, grade: number): boolean {
    // The direction as the walk would take it: `speed` is measured ALONG the
    // surface, so a metre of board travel is `1/hyp` of ground and `grade/hyp` of
    // climb — the same split `roll()` makes.
    const gradeGo = grade * drive;
    const hyp = Math.hypot(1, gradeGo);
    const reach = WALL_FEEL / hyp;
    return this.surface.blocked(
      this.position.x + this.forwardX * drive * reach,
      this.position.z + this.forwardZ * drive * reach,
      this.position.y + (gradeGo * reach) + WALL_PROBE,
    );
  }

  /**
   * What the wall cost him, charged once for the whole frame.
   *
   * `advance` only records the squarest contact of the frame — a frame is
   * walked in as many as four pieces, and a wall that took a bite out of each
   * of them would cost four times as much at 30 fps as at 144. The bite itself
   * is taken here, and only on the frame the contact BEGINS: after that he is
   * a rider leaning on brick, which is `WALL_RUB`.
   */
  private settleWall(dt: number): void {
    const along = this.wallAlong;
    this.wallAlong = -1;
    if (along < 0) {
      this.onWall = false;
      return;
    }
    if (this.onWall) {
      // Nothing at all survived the step: he is up against it square and he is
      // not moving, so he has no speed — however hard he keeps pushing. A rub
      // rate cannot say that, and a push is worth five times a rub: without
      // this he leant on the brick at 2.5 m/s for as long as he liked, which is
      // the smaller cousin of the bug the old code had at 16.9.
      this.speed = along > 0 ? towardZero(this.speed, WALL_RUB * dt) : 0;
      return;
    }
    this.onWall = true;
    const before = this.state === "air" ? Math.hypot(this.velX, this.velZ) : Math.abs(this.speed);
    this.speed *= along;
    this.velX *= along;
    this.velZ *= along;
    // A body already on the floor can hit things too; it just has nothing left
    // to announce or to bail out of.
    if (this.state === "ragdoll") return;
    const into = before * Math.sqrt(Math.max(0, 1 - along * along));
    if (into < WALL_SCUFF) return;
    this.events.onWallHit?.(into);
    // Past that it is not a hit, it is a crash — and a run that ends this way
    // has to be allowed to end. Only against something he could not have got
    // over, though: see `WALL_HEAD`.
    if (into > WALL_SLAM && this.wallOver >= WALL_HEAD) this.enterRagdoll();
  }

  /**
   * What the piece of ground he just covered did to his speed: gravity, taken
   * from the height he actually lost over it, plus the rider's own pump.
   * Returns false if he ran out of climb inside the piece — the caller puts him
   * back and sends him down again.
   *
   * Gravity as an ENERGY and not as `g·sinθ·dt` on purpose, and it is what
   * makes the ride the same ride on every machine. `sinθ` is a number the walk
   * has to pick a point to read at, and a quarter pipe turns through eighty
   * degrees in three metres, so which points get read — which is to say, where
   * the frame boundaries happened to fall — was worth a tenth of a metre of
   * apex off the same coping. A height difference has no such choice in it:
   * whatever the ground was chopped into, the climb between two points is the
   * climb between two points.
   */
  private fall(from: number, dir: 1 | -1, grade: number, seconds: number): boolean {
    const energy = this.speed * this.speed + 2 * SLOPE_GRAVITY * (from - this.position.y);
    if (energy <= 0) return false;
    this.speed = dir * Math.sqrt(energy);
    // Loading the crouch through a transition is a pump, which is the
    // difference between a ramp you roll down once and a ramp you can work.
    // Weighted by the SINE of the surface angle rather than by the grade: a
    // grade is a tangent, and clamping a tangent at 1 paid a 45° bank and a
    // vert wall exactly the same while paying nothing at all for the bottom of
    // an arc.
    if (_drive.pump && Math.abs(grade) > PUMP_MIN_GRADE) {
      const sinSlope = grade / Math.hypot(1, grade);
      this.speed += dir * PUMP_ACCEL * Math.abs(sinSlope) * seconds;
    }
    // Rolling losses and the scrub of leaning hard into a carve, charged over
    // the same piece of ground for the same reason gravity is: at the speed he
    // is doing THERE. Both are proportional, so they carry their own sign.
    this.speed -= this.speed * ROLL_DRAG * seconds;
    this.speed -=
      Math.abs(_drive.steer) * turnFactor(this.speed) * this.speed * CARVE_SCRUB * seconds;
    if (_drive.coast) this.speed = towardZero(this.speed, ROLL_FRICTION * seconds);
    this.speed = THREE.MathUtils.clamp(this.speed, -MAX_ROLL_SPEED, MAX_ROLL_SPEED);
    return true;
  }

  /**
   * …and the same two forces on a board that is not moving, where there is no
   * height difference to read them off. Signed and unclamped, so a transition
   * he could not clear takes his speed through zero and rolls him back DOWN it
   * fakie — which is the whole point of a quarter pipe, and what a clamp at
   * zero would have him parked halfway up instead.
   *
   * WHICH IS WHERE MOST RUNS AT A TALL RAMP END, AND IT IS NOT A BUG. Recorded
   * here because it looks like one on a table. A climb of `h` costs `sqrt(2gh)`
   * along the line you climb it on, and the north transition is 3.4 m — so
   * **10.75 m/s at the toe before drag**, and about 12.1 m/s with it. Swept
   * coasting at the ramp (`tools/back-air.mjs`), **60 of 162 approaches never
   * reach the coping**: they climb to y 1.88–2.86 of 3.40 and this function sends
   * them back down. Nothing is missing. It is `v² = 2gh`, and it is the same
   * arithmetic that makes a quarter pipe worth dropping into.
   *
   * The player rides this ramp at 50–60 km/h with the throttle held, which clears
   * that bar comfortably — the push is worth `Δ(v²) = 2v·Δv`, so one kick landing
   * on the face is worth far more than the same kick on the flat. So "you get no
   * air off this ramp" from a slow coast is the model being right, not the ramp
   * being broken; if it ever needs to be true of a coast as well, the answer is a
   * shorter face or a longer run-up, and it lives in `spot.ts`.
   */
  private stall(grade: number, seconds: number): void {
    if (seconds <= 0) return;
    this.speed -= SLOPE_GRAVITY * (grade / Math.hypot(1, grade)) * seconds;
  }

  /**
   * …and the HALF OF GRAVITY THIS RIDE HAS NEVER CHARGED: the part of it that
   * runs ACROSS the way he is going.
   *
   * `fall` and `stall` both take the grade along the direction of travel, which
   * is exactly right for what a slope does to `speed`. But a slope has a
   * gradient, not a grade, and `slopeAlong` is that gradient dotted with one
   * direction — so everything either of them can see is `tan θ · cos φ`, where φ
   * is how far off the fall line he is riding. **The component at `sin φ` had
   * nowhere to go, and it was silently dropped.** A bank crossed square is
   * charged in full; the same bank crossed 83° off square reads as a floor.
   *
   * That is the whole of the player's sixth report on the north transition, and
   * it is the SAME arithmetic that condemned the 11.3° apron one round ago, one
   * dimension over. `BACK_LIP_ANGLE`'s note works out that only above 18.5° does
   * gravity beat a held push. The apron was replaced with a 24.2° return to pass
   * that bar — square on. Off square the bar moves: `atan(tan 24.2° · cos φ)`
   * drops under 18.5° at φ > 41.9°, so any approach more than 42° off square
   * defeats it, and a steeper face only pushes the angle out (45° fails at 70.5°)
   * and never removes it. Measured before this: carve at the bank at 13 m/s with
   * the stick half over and he arrives 83° off square, lands on the return at
   * 2.18 m/s with 0.98 m/s² of gravity along his line against the push's 5.4,
   * and the push ratchets him ACROSS the return, over the crest and out along the
   * 4.21 m deck to the west wall — 12.79 m/s on the flat top, never coming down.
   * "He continues forward instead of falling back down", as arithmetic, again.
   *
   * A board is not a ball: the wheels grip sideways, so the dropped component
   * cannot be a sideways SLIDE. What it does instead is swing the board round —
   * a lateral force on a rolling body curves its path, `dψ/dt = a_cross / v` —
   * and that is why you always come off a transition pointing down it however
   * you went up. There is nothing to gate: the term is `sin φ` × `sin θ`, so it
   * is exactly zero on flat ground and exactly zero along the fall line, in
   * either direction. Every square approach in every existing check is
   * bit-for-bit what it was.
   *
   * The geometry, once, because it is worth not re-deriving: with the height
   * gradient resolved into the travel frame as `(ga, gc)`, the surface normal is
   * `(-ga, 1, -gc)/S` with `S² = 1 + ga² + gc²`, gravity's in-plane part is
   * `G − (G·N)N`, and its component along the in-plane perpendicular of travel
   * works out to `g·gc/S` — which, divided by the horizontal speed
   * `v/hypot(1, ga)`, is the rate below. Taken in the surface's own tangent plane
   * and not in the horizontal projection: they agree to the last bit here, and
   * the tangent-plane derivation is the one that stays true on a vert wall.
   *
   * `seconds` is the piece's own, the same one `fall` is handed — so the yaw is
   * charged over the ground covered rather than per frame, and 30 fps and 144 fps
   * see the same swing.
   *
   * TWO BOUNDS, and neither is a tuned number.
   *
   * The rate is `a_cross / v` and that DIVERGES at a standstill — a board stopped
   * across a bank has no travel direction left for gravity to bend, so the
   * arithmetic asks for an instant pivot. It is held to the rider's own carve,
   * `TURN_RATE · turnFactor(speed)`, because that is the honest comparison:
   * gravity pulling the board round on a bank and the rider carving it round are
   * the same yaw through the same trucks, and one of them is already tuned.
   * `turnFactor` falls to 0.35 at a standstill, which is exactly where the
   * divergence is. On the 24.2° return crossed 83° off square the exact rate is
   * 2.90 rad/s against that bound's 1.29 — so on the case this was written for,
   * the bound is what is running, and it is enough: 32 of 432 carved approaches
   * ended parked on the flat top at (±38.0, 4.21, 48.0) before it, 0 after.
   *
   * And never PAST the fall line, which is what makes it settle instead of ring —
   * downhill is the attractor and there is no overshoot in it.
   *
   * WHAT IT COSTS, because it is one red check and it should not be found by
   * surprise. `collide-sweep` goes 17/18 → 16/18 on *"…and the steel still lets
   * you land on the bar — X held, every bar"*: 15 of 108 approaches to
   * `spillway/ledge-run-bar` no longer lock on. That bar is bolted diagonally
   * across the flume — its own comment in `map2/layout.ts` says "a bar across the
   * run at an angle, so it is a thing you line up for" — and the check lines up
   * for it by setting a fixed heading and COASTING 7 m with no stick at all. The
   * floor under those 7 m is cambered: the cross-grade at the three start points
   * measures 6.9°, 13.6° and 40.5°, so the yaw bends him 5.3–13.6° over the
   * approach and puts him 0.14–2.2 m off the line he started on, against a 0.32 m
   * catch radius. Nothing about the steel changed; what changed is that a
   * straight, hands-off line across a banked floor is no longer straight — which
   * is the same sentence as the fix. Left as a red rather than papered over:
   * lining the bar up is what the level asks for, and a check that lines it up by
   * decree cannot tell that from a fence that fights.
   */
  private fallLine(ga: number, gc: number, speed: number, seconds: number): void {
    if (gc === 0 || seconds <= 0 || speed <= 0) return;
    const rate = (SLOPE_GRAVITY * gc * Math.hypot(1, ga)) / ((1 + ga * ga + gc * gc) * speed);
    const cap = TURN_RATE * turnFactor(speed) * seconds;
    let turn = THREE.MathUtils.clamp(rate * seconds, -cap, cap);
    const toFall = -Math.atan2(-gc, -ga);
    turn = toFall >= 0 ? Math.min(turn, toFall) : Math.max(turn, toFall);
    this.heading += turn;
  }

  /**
   * The grounded step, walked in bounded pieces.
   *
   * Everything that decides where the wheels come off is a fact about SPACE and
   * about SPEED, and never about the frame: the ground is covered in
   * `LIP_PROBE` pieces, each corner is bisected to a couple of millimetres out
   * of the piece that finds it, gravity is charged as the height actually lost
   * over each piece, and whether a corner throws him is `lipDecision`'s force
   * balance. A frame's stride is half a metre at 30 fps and a tenth of that at
   * 144, and none of those four things can tell which it is riding.
   *
   * Returns the seconds of the frame still unspent when the wheels came off —
   * the caller flies them — or 0 if they never did.
   */
  private roll(dt: number): number {
    let left = dt;
    for (let piece = 0; left > 1e-6 && piece < ROLL_PIECES; piece++) {
      const yHint = this.position.y + HINT_LIFT;
      const grade = this.surface.slopeAlong(
        this.position.x,
        this.position.z,
        this.forwardX,
        this.forwardZ,
        yHint,
      );
      const speed = Math.abs(this.speed);
      if (speed < MIN_ROLL) {
        // Stopped, but not necessarily on the flat: a board parked on a bank
        // still has gravity on it, and there is no ground to walk while it is
        // not moving. Spend the rest of the frame standing there.
        this.stall(grade, left);
        break;
      }
      const dir: 1 | -1 = this.speed < 0 ? -1 : 1;
      const tx = this.forwardX * dir;
      const tz = this.forwardZ * dir;
      // The tangent he is riding, as a direction: `speed` is measured ALONG the
      // surface, so a metre of board travel on a 45° transition is only 0.7 m
      // of ground and 0.7 m of climb.
      const hyp = Math.hypot(1, grade * dir);
      const cos = 1 / hyp;
      const sin = (grade * dir) / hyp;

      const step = Math.min(speed * left, LIP_PROBE);
      if (speed > LAUNCH_MIN_SPEED) {
        // Only a corner he actually REACHES this piece — anything further off
        // is next piece's question, and asking it early is what would make the
        // answer depend on where the frame boundaries fell.
        const lip = this.lipAhead(cos, sin, tx, tz, yHint);
        if (lip >= 0 && lip <= step) {
          // The corner, and the speed he arrives at it with. Its height is
          // taken along the tangent rather than out of the surface: the
          // bisection stops on the last point that is still on the near face,
          // and a query from there can perfectly well resolve the FAR one —
          // two millimetres under a coping, the deck two millimetres above is
          // inside the hint and wins, which is a coping that hands back a flat
          // grade and no air.
          const yCorner = this.position.y + lip * sin;
          const vCorner = Math.sqrt(
            Math.max(0, this.speed * this.speed + 2 * SLOPE_GRAVITY * (this.position.y - yCorner)),
          );
          this.lipDecision(lip, cos, sin, tx, tz, dir, yHint, vCorner);
          if (_lip.leaves) {
            if (lip > 0) this.advance(tx * lip * cos, tz * lip * cos);
            this.position.y = yCorner;
            this.speed = dir * _lip.speed;
            this.takeOff(_lip.grade);
            return Math.max(0, left - (2 * lip) / (speed + vCorner));
          }
          // He held it. Nothing to do: a corner shallow enough to hold is
          // shallow enough for the ordinary step below to roll across.
        }
      }

      // What the slope does ACROSS his line, read at the same point and over the
      // same piece as the grade along it. `slopeAlong` is linear in the
      // direction, so the travel frame's perpendicular is the heading's turned a
      // quarter and signed by `dir` — one extra probe per piece. See `fallLine`.
      const crossHead = this.surface.slopeAlong(
        this.position.x,
        this.position.z,
        -this.forwardZ,
        this.forwardX,
        yHint,
      );
      const x0 = this.position.x;
      const z0 = this.position.z;
      const y0 = this.position.y;
      this.advance(tx * step * cos, tz * step * cos);
      this.position.y = this.surface.height(this.position.x, this.position.z, yHint);
      this.fallLine(grade * dir, crossHead * dir, speed, step / speed);
      if (this.fall(y0, dir, grade, step / speed)) {
        // Over the MEAN speed, not the speed he came in at. On a transition a
        // 0.12 m piece can cost a tenth of the speed that entered it, and a
        // frame that mis-accounts its own seconds spends the wrong amount of
        // drag — which is the last thing left that could tell 30 fps from 144.
        left -= (2 * step) / (speed + Math.abs(this.speed));
      } else {
        // The climb took the last of him inside this piece. Back to the ground
        // he could still reach, and now he is going the other way.
        this.position.set(x0, y0, z0);
        this.speed = -dir * MIN_ROLL * 2;
        left -= step / speed;
      }
    }
    return 0;
  }

  /**
   * At the lip: does he leave it, and on what arc? Writes `_lip`.
   *
   * The criterion is a force, not a clearance. A board follows a curved path
   * only while the surface can supply the centripetal acceleration that path
   * needs, and concrete can push but never pull — so over anything convex
   * contact holds exactly while `v² / R ≤ g·cos ψ`, where ψ is how far the
   * tangent is tipped from the horizontal. Past it the wheels are off, and they
   * are off at the point and the speed where the sum stopped balancing rather
   * than at whichever frame boundary happened to be nearby. That is where the
   * frame-rate independence comes from: nothing here is a threshold on a
   * one-frame difference.
   *
   * Run round the whole corner rather than sampled at one point, because a
   * coping is a corner and the board crosses all eighty degrees of it at once.
   * On the pivot circle `v² = v₀² + 2gR(cos ψ₀ − cos ψ)`, so contact holds
   * while `cos ψ ≥ (v₀² + 2gR·cos ψ₀) / 3gR`, which is one number and gives all
   * three answers at once: he is thrown off the moment he arrives (a coping at
   * pace — he leaves ON the transition's own 79°, which is why it throws him UP
   * and not along), he lets go part way round (a slow drop-in — he tips over
   * the lip, keeps hold for the first thirty degrees of it and only then falls
   * the short rest of the way onto the wall), or he holds it all the way and
   * rides onto whatever is beyond (rolling onto the deck at walking pace).
   *
   * `R` comes from how much the tangent turns over the board's own length,
   * floored at `LIP_PIVOT` — see there.
   */
  private lipDecision(
    lip: number,
    cos: number,
    sin: number,
    tx: number,
    tz: number,
    dir: 1 | -1,
    yHint: number,
    v: number,
  ): void {
    // The tangent he arrives on, read a centimetre SHORT of the break. At the
    // lip and one float past it the transition's own footprint has ended and
    // the answer is the flat deck's zero — which is a coping that hands you no
    // air at all. A centimetre back the arc still answers, and it answers 79.0°
    // where the corner itself is 79.2°.
    const back = Math.max(0, lip - LIP_EDGE);
    const gradeIn = this.surface.slopeAlong(
      this.position.x + tx * back * cos,
      this.position.z + tz * back * cos,
      this.forwardX,
      this.forwardZ,
      yHint + back * sin,
    );
    // ψ measured DOWN from the horizontal along the way he is travelling, so a
    // climb is negative and the corner turns it upward through zero.
    const psiIn = -Math.atan(gradeIn * dir);
    // …and what the board would bridge onto beyond the corner, taken as the
    // chord over its own length. A chord and not another slope: past a kerb
    // there is no surface continuing at all, only the road a foot below, and
    // the chord is what says so.
    const cx = this.position.x + tx * lip * cos;
    const cz = this.position.z + tz * lip * cos;
    const cy = this.position.y + lip * sin;
    const far = this.surface.height(cx + tx * LIP_PIVOT, cz + tz * LIP_PIVOT, cy + HINT_LIFT);
    const psiOut = Math.atan2(cy - far, LIP_PIVOT);
    const turn = psiOut - psiIn;
    _lip.leaves = false;
    if (turn <= 1e-4) return; // it curls back up: that is a dip, not a lip
    if (v <= LAUNCH_MIN_SPEED) return; // nobody launches off a kerb at walking pace

    // …and now the question that decides whether there is anything here to be
    // thrown off at all: WHICH WAY DOES THE FAR FACE BEND?
    //
    // Only a CONVEX lip throws you. Concrete pushes and never pulls, so a face
    // that falls away STEEPER than the straight line across it has to come back
    // up to meet the far end of that line — it is a bowl, and a bowl pushes UP
    // the whole way down it. A quarter pipe dropped into is exactly that: the
    // coping is one corner and everything past it is transition curving back
    // under him, so he tips in and RIDES it, which is what dropping in IS. A
    // kerb, a stair nose, a hubba and that same coping taken from BELOW all put
    // the board over a face that is straight or flat — nothing curving back —
    // and those are the ones the force balance decides.
    //
    // Both readings are taken on the FAR face and nowhere near the near one: a
    // centimetre past the break for its own tangent and its own height, then
    // the board's bridge along it for the chord. Anchoring the chord on the
    // corner instead put the whole test at the mercy of the millimetres the
    // bisection and the tangent walk leave behind — measured, the deck beyond
    // the lip came out 8 mm above the walked corner, which reads as a chord
    // tipping UPHILL, and one approach speed in the launch band silently rolled
    // onto the deck instead of flying. Read this way the deck answers 0°
    // against 0°, and the transition answers 78° against 67°.
    const fx = this.position.x + tx * (lip + LIP_EDGE) * cos;
    const fz = this.position.z + tz * (lip + LIP_EDGE) * cos;
    const yFar = this.surface.height(fx, fz, yHint + (lip + LIP_EDGE) * sin);
    const psiFar = -Math.atan(
      this.surface.slopeAlong(fx, fz, this.forwardX, this.forwardZ, yFar + HINT_LIFT) * dir,
    );
    const beyond = this.surface.height(
      fx + tx * LIP_PIVOT,
      fz + tz * LIP_PIVOT,
      yFar + HINT_LIFT,
    );
    if (psiFar > Math.atan2(yFar - beyond, LIP_PIVOT) + LIP_TURN) return;

    // A corner shallow enough for the board to roll THROUGH is ridden, and it
    // is ridden at any speed. See `CORNER_HOLD`: under it the tail is still on
    // the near face while the nose is already on the far one, so there is no
    // moment of bridging in it and nothing to be thrown off — what is left is a
    // crease, and a crease is taken with the knees.
    //
    // The force balance below used to be asked of these too, and it is the
    // wrong question for them: it is a point mass on an arc of `LIP_PIVOT /
    // turn`, and a shallow crease is a two-metre arc, which lets go at
    // `sqrt(gR)` — 5.8 m/s. So EVERY sloped thing in this spot threw the board
    // at ordinary riding speed. Measured before this line: the drop-in bank at
    // 14.3° let go at 7 m/s and cleared its whole 4.5 m face from 12; the three
    // driveway aprons — the ones the spot's own notes say are "not meant to be a
    // kicker" — at 8; the raised crossing at 10; both manual-pad bumps at 8;
    // the quarter pipe's own apron, the strip that exists to tip you back into
    // the transition, at 7. Every one of those is a `takeOff`, which is a spin
    // reset, an air state and a landing scrub, charged for rolling down a bank.
    //
    // Two states is all this ride has — wheels down, or ballistic — and a
    // crease belongs to neither, so it is put in the one the player is
    // actually in. Nothing here is a filter over motion: a crease that is
    // ridden is ridden, and the deck lays onto it through `NORMAL_FOLLOW` like
    // any other ground. Anything SHARPER he bridges, and a bridged corner is a
    // hop however slowly it is taken — walking pace is already out, above.
    if (turn <= CORNER_HOLD) return;

    // Curvature over the length the board bridges, and the board's own floor
    // under it. `turn` past a radian IS the floor — nothing turns tighter.
    const radius = LIP_PIVOT / Math.min(turn, 1);
    const gR = GRAVITY * radius;
    const cosIn = Math.cos(psiIn);
    const cosGo = (v * v + 2 * gR * cosIn) / (3 * gR);

    // He keeps hold over the first of the corner and lets go inside it — the
    // release is always on the descending side, where cos falls away — or, if
    // the sum was already failing when he arrived, on the tangent he arrived
    // on. Never past the far face, which is where the wheels find ground again.
    //
    // He leaves at the SPEED he came in with, not at the slightly higher one
    // the swing round the corner would have paid him. That difference is a few
    // centimetres of drop the model has no honest place to put — the wheels
    // are still on the corner, it is the deck that swung — and paying it out as
    // speed alone would be a launch with more energy in it than the ride
    // arrived with.
    const psiOff =
      cosGo <= cosIn
        ? Math.min(Math.acos(THREE.MathUtils.clamp(cosGo, -1, 1)), psiOut)
        : psiIn;
    _lip.leaves = true;
    _lip.speed = v;
    // Back into the model's frame: a grade along the HEADING, which is what
    // `takeOff` splits the speed with.
    _lip.grade = -Math.tan(psiOff) * dir;
  }

  /**
   * How far ahead the break in the floor is, measured ALONG the surface — or -1
   * if the floor keeps following the board's tangent for the whole probe. The
   * answer is the last point still on the floor, which is where the corner is
   * and where his tangent is read. Whether that corner throws him is
   * `lipDecision`'s question, not this one's.
   *
   * Along the surface and not along the ground on purpose. A horizontal probe
   * cannot see a coping at all: at 78° the board is climbing four times faster
   * than it is travelling, so a probe laid flat crosses the lip while the
   * board's own tangent is still a hand's width under it, and the bisection
   * settles somewhere out on the deck where the grade reads zero — which is a
   * quarter pipe that hands you no air whatsoever. Walked along the tangent the
   * same probe lands within a millimetre of the coping.
   *
   * Bisected rather than sampled: the last two centimetres of a transition turn
   * through ten degrees, and ten degrees of coping is a metre of air.
   */
  private lipAhead(cos: number, sin: number, tx: number, tz: number, yHint: number): number {
    if (!this.breaksAt(LIP_PROBE, cos, sin, tx, tz, yHint)) return -1;
    let lo = 0;
    let hi = LIP_PROBE;
    for (let i = 0; i < LIP_BISECT; i++) {
      const mid = (lo + hi) / 2;
      if (this.breaksAt(mid, cos, sin, tx, tz, yHint)) hi = mid;
      else lo = mid;
    }
    return lo;
  }

  /**
   * Has the ground stopped being the ground he is on, `s` along his tangent?
   *
   * Two ways it can, and BOTH are needed. A corner is a place where the floor
   * either drops out from under the tangent — a kerb, a stair nose, the edge of
   * a platform — or keeps going and turns away under it, which is a crest, and
   * a coping taken from below. The height test alone cannot see the second: he
   * climbs a 79° wall and the deck beyond the lip sits a millimetre or two
   * ABOVE his tangent for the last centimetre of the approach, so the floor
   * reads as still there right up until he is standing on it, flat, with the
   * whole of a vertical 12 m/s turned into horizontal. Measured before the
   * angle test went in: 14 and 15 m/s at the quarter pipe rolled onto its deck
   * and got no air at all, with 13 and 16 flying — a hole in the middle of the
   * range you would have to find by walking it a tenth of a metre at a time.
   *
   * `LIP_EPS` is not a threshold on anything a player can feel — it is a tenth
   * of a millimetre, an order under the bisection's own resolution, and it is
   * there because a ramp's analytic tangent and its analytic height agree only
   * to the last bit of a double. `LIP_TURN` is the same idea in radians.
   */
  private breaksAt(
    s: number,
    cos: number,
    sin: number,
    tx: number,
    tz: number,
    yHint: number,
  ): boolean {
    const px = this.position.x + tx * s * cos;
    const pz = this.position.z + tz * s * cos;
    const py = this.position.y + s * sin;
    if (this.surface.height(px, pz, yHint) < py - LIP_EPS) return true;
    // …and the same question asked of the tangent: is the ground there running
    // downhill of the ground here? Signs are in the travel frame, where `sin`
    // already is the board's own rise per metre along it.
    const ahead = this.surface.slopeAlong(px, pz, tx, tz, py + HINT_LIFT);
    return Math.asin(THREE.MathUtils.clamp(sin, -1, 1)) - Math.atan(ahead) > LIP_TURN;
  }

  /** One step of flight: gravity, the carried velocity, and the way back down. */
  private flight(dt: number, yBefore: number): void {
    // The exact ballistic step, not Euler's. Under constant gravity the arc has
    // a closed form and the ½gt² term costs one multiply, so there is no reason
    // for the height of an ollie to depend on how often it is asked: stepping
    // it Euler's way lost 0.09 m of a 1.56 m pop at 30 fps and none of it at
    // 144.
    const yStep = this.position.y;
    this.position.y += this.vy * dt - 0.5 * GRAVITY * dt * dt;
    this.vy -= GRAVITY * dt;
    // The carried VELOCITY, never the heading — this is the whole of the fix
    // for a spin that used to curl the flight path into a circle and put him
    // down 0.4 m from where he left, because the stride was speed along a
    // heading the spin was turning.
    //
    // Handed BOTH ends of the step's own height, so the probe climbs with him
    // instead of being cleared for the whole step by where he will be at the
    // end of it — see `advance`.
    this.advance(this.velX * dt, this.velZ * dt, yStep, this.position.y);

    // Nose lifts off the pop, then levels out for the landing.
    const target = this.vy > 0 ? -0.34 : 0.06;
    this.boardPitch = THREE.MathUtils.damp(this.boardPitch, target, 7, dt);

    // Kept so a rail can ask about `flip` at the moment the trucks met the line
    // rather than at the end of the frame they met it in — see `tryCatchGrind`.
    this.flipWas = this.flip;
    if (this.flip < 1) this.flip = Math.min(1, this.flip + dt / FLIP_TIME);

    // Rails first: a rail sits above the floor it stands on, so the ground test
    // would swallow every landing that should have been a grind. Asked on the
    // way UP as well as on the way down: an ollie onto a handrail RISES to it
    // off the platform beside it and crosses its height about a metre in, then
    // is never near it again. A descent-only question could only catch a rail
    // the hang time happened to end on top of — on the 3.78 m headline rail
    // that meant 4 m/s and nothing above it.
    //
    // The exception is everything that left a surface under its own speed
    // rather than off a pop, and it has to be here rather than in the Grinder's
    // clearance window: that window is a distance, and at speed he clears it
    // while still INSIDE the rail's 0.55 m catch window. Measured on the flat
    // bar — at 11 and 13 m/s Space re-locked him 0.067 s later with 0.45 m of
    // air out of a 1.57 m ollie, which reads as the pop key not working. The
    // coping was worse: a launch off its own transition is not a pop, so the
    // rail on the lip took him on the frame the air was created and 10.73 m/s
    // became 1.49 in one step. Leaving a surface under power is a decision, and
    // it is honoured until he is on his way back down.
    if ((this.catchWhileRising || this.vy <= 0) && this.tryCatchGrind(yBefore)) return;
    // Landing, though, still only happens on the way down.
    if (this.vy > 0) return;
    // Hinted from where he WAS, not from where the step just put him. A hint
    // only admits floors at or below it, and a body falling 0.6 m in a frame
    // can step clean through a flat top and then be told that top is above him
    // and does not count — measured at 30 fps, he fell through the quarter
    // pipe's own deck and carried on down to the plaza 2.6 m below it. What he
    // may land on is whatever was under him at the start of the step.
    //
    // …and the lift is `WALL_PROBE` and not `HINT_LIFT`, because in the air
    // these two are ONE question asked twice and they have to give the same
    // answer. `advance` lets the board into a footprint whose top is within
    // `WALL_PROBE` of it — that tolerance is what lets an air cross a kerb, a
    // coping's own apron and the lip of the thing it is about to land on — and
    // this decides what it may then stand on. With the two 15 cm apart there
    // was a band of tops the board could get INSIDE and could not land ON, and
    // everything that fell in that band fell through: measured over 6,480
    // approaches with `tools/collide-sweep.mjs`, the board came to rest inside
    // the loading dock (80 cm under its top), inside the raised platform
    // (85 cm), inside the long ledge, the manual pad, both angled ledges and a
    // bench. Every single depth was that solid's own top minus 0.30 — the width
    // of the gap, to the centimetre. One number closes it: anything he can be
    // let into is something he can land on.
    const yHint = Math.max(yBefore, yStep) + WALL_PROBE;
    const ground = this.surface.height(this.position.x, this.position.z, yHint);
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.land(yHint);
    }
  }

  /**
   * Reads the surface under the board and lays the deck onto it. The normal is
   * FOLLOWED rather than copied: a lip is a step change in the ground's tangent
   * and a deck that snaps through it in one frame reads as a glitch. This is
   * the ground being tracked, not motion being filtered.
   */
  private readSurface(yHint: number, dt: number): void {
    const s = this.surface.sample(this.position.x, this.position.z, yHint, this.sample);
    this.surfaceKind = s.kind;
    this.surfaceNormal.lerp(s.normal, 1 - Math.exp(-NORMAL_FOLLOW * dt)).normalize();
  }

  // -------------------------------------------------------------------------
  // leaving the ground, and coming back
  // -------------------------------------------------------------------------

  /**
   * The wheels come off, along the surface's own tangent.
   *
   * `grade` is the rise per metre travelled along the HEADING of the tangent he
   * is released on — the provider's own analytic slope where he simply runs out
   * of floor, `lipDecision`'s release angle where he tips over a corner first.
   * Never a one-frame height difference, which is what used to make the same
   * coping throw the same skater 6.3 m up at 60 fps and 4.0 m at 30. The tangent
   * splits the ride's speed into the horizontal he keeps and the vertical the
   * lip hands him (speed·cos θ, speed·sin θ), so a 79° coping throws him UP
   * and not along — the old launch kept the whole of `speed` as horizontal and
   * bolted a vertical on beside it, which is a quarter pipe firing you at 45°
   * with more energy than you arrived with.
   *
   * `popVy` is whatever the legs add on top of that — as WORK, not as a fixed
   * change in velocity. A pop is a leg extension: a fixed push over a fixed
   * distance. On flat ground, where the wheels are not already leaving the
   * floor, work and velocity are the same number and this is exactly the ollie
   * milestone 4 tuned — 7.3 m/s, 1.57 m, unchanged to the last decimal. They
   * stop being the same the moment the ground is already throwing you, because
   * velocities add and HEIGHTS add as the square of them: bolting 7.3 m/s onto
   * the 11.3 m/s a 79° coping hands you at speed turned a 3.8 m air into a
   * 10.2 m one, and there is nothing in this spot you can survive falling 10 m
   * onto. Adding the legs' energy instead adds their 1.57 m to whatever the
   * transition already bought, which is what an ollie off a lip actually does.
   * A board still coming DOWN gets the plain impulse — the legs are pushing
   * against the fall, not adding to a climb — and the two agree at zero.
   */
  private takeOff(grade: number, popVy = 0): void {
    const hyp = Math.hypot(1, grade);
    const uh = this.speed / hyp; // signed, still along the heading
    this.velX = uh * this.forwardX;
    this.velZ = uh * this.forwardZ;
    const launch = (this.speed * grade) / hyp;
    const rising = Math.max(0, launch);
    this.vy = launch - rising + Math.sqrt(rising * rising + popVy * popVy);
    this.speed = uh;
    this.state = "air";
    this.catchWhileRising = false;
    this.spin.reset();
    this.position.y += 0.02; // clear the ground so we don't re-land instantly
  }

  private pop(id: TrickId, grade: number): void {
    this.setCharging(false);
    this.driveT = 0; // the foot left the ground; the shove goes with it
    // A shove-it is a flat spin of the board, so it pops like an ollie; the
    // flips need the extra beat for the deck to come all the way round.
    const impulse = id === "ollie" || id === "shoveit" ? OLLIE_POP : KICKFLIP_POP;
    this.trickId = id;
    this.trick = this.tricks.def(id).name;
    this.setFlip(id);
    this.takeOff(grade, impulse);
    // Paced to the air he ACTUALLY bought — popping off a transition buys more
    // than the impulse alone, and the clip is scrubbed to fit the hang time.
    this.events.onPop?.(this.trick, (2 * Math.max(this.vy, 0)) / GRAVITY);
  }

  /** Which way the deck comes round, and whether it comes round at all. */
  private setFlip(id: TrickId): void {
    if (id === "kickflip") {
      this.flip = 0;
      this.flipAxis = "roll";
      this.flipSign = -1;
    } else if (id === "heelflip") {
      this.flip = 0;
      this.flipAxis = "roll";
      this.flipSign = 1;
    } else if (id === "shoveit") {
      this.flip = 0;
      this.flipAxis = "yaw";
      this.flipSign = 1;
    } else {
      this.flip = 1;
    }
  }

  /**
   * Touchdown.
   *
   * The whole landing is one question: how far is the board's flight path from
   * the surface it is arriving on? Matched, the fall speed becomes roll speed
   * and a transition hands back everything it took — which is what makes a
   * quarter pipe worth dropping into. Mismatched, the difference is the part
   * of your velocity that goes into the concrete instead of into the wheels.
   *
   * All of it is measured in the vertical plane he is TRAVELLING in, which
   * after a spin is not the plane he is pointing in.
   */
  private land(yHint: number): void {
    const vh = Math.hypot(this.velX, this.velZ);
    const tx = vh > 1e-4 ? this.velX / vh : this.forwardX;
    const tz = vh > 1e-4 ? this.velZ / vh : this.forwardZ;
    const grade = this.surface.slopeAlong(this.position.x, this.position.z, tx, tz, yHint);
    const hyp = Math.hypot(1, grade);
    // The flight velocity, split by the surface it is arriving on: (1, grade)
    // runs along that surface and (-grade, 1) runs into it. `along` is what the
    // wheels can still use, `into` is what the legs have to eat.
    //
    // `along` is SIGNED, and the sign matters — dropping back into the
    // transition you just flew out of is a landing whose `along` is negative,
    // and that is exactly the fakie it ought to be. Measured against the
    // surface's LINE rather than against its uphill direction, so coming back
    // down it is a clean landing and not a 158° mismatch on the concrete.
    const along = (vh + this.vy * grade) / hyp;
    const into = (this.vy - vh * grade) / hyp;
    // …and the floor under `along`, which is the whole of the momentum rule:
    // whatever the surface does with the part of him going INTO it, the part
    // going ALONG the ground has to come out the other side.
    //
    // `along` alone is the tangential projection of the WHOLE arrival, so a
    // surface tipped against the fall turns a fast approach into a slow one on
    // the arithmetic rather than on anything the player did — come down steeply
    // onto ground rising at 11° and 6 m/s of forward reads as 3.3 m/s of
    // tangent, then the scrub takes the rest. A pair of legs does not work like
    // that: they fold under the vertical and the forward runs on through them.
    // So the ride keeps the LARGER of the two, and the only thing that can beat
    // the horizontal he arrived with is the surface handing him MORE — which is
    // a transition giving back what it took, and is exactly the landing this
    // must not touch.
    const carried = Math.abs(along) >= vh ? along : vh;

    const degrees = this.spin.degrees;
    // Everything that can put him down here is something he DID: a flip that
    // never came round, a spin landed nowhere near square, or a grab he never
    // let go of — holding Shift through touchdown puts your hand between the
    // deck and the concrete, which is the one air trick with a deadline of its
    // own. How FAST he arrived is not on the list and must not be: see
    // `LAND_ABSORB`. Coming down hard is charged in speed, below.
    const clean =
      this.flip >= 1 && this.spin.offSquare() <= SPIN_CLEAN_DEG && this.holding !== "grab";
    if (!clean) {
      this.enterRagdoll();
      return;
    }
    // How much of the arrival the legs could not take. Zero for everything the
    // ride is normally made of, and the whole of what a slam reads as.
    const slam = Math.max(0, Math.abs(into) - LAND_ABSORB);

    const trick = this.trick;
    const trickId = this.trickId;
    this.state = "rolling";
    // Which way he rides away — and he rides away the way he was already GOING.
    //
    // One question, asked of the geometry and nothing else: is the nose still
    // pointing where the momentum is running? If it is not, `speed` goes
    // NEGATIVE and he rolls away with the board the wrong way round under him.
    // Spin a half turn over a gap and you keep every metre per second of your
    // line and land fakie, which is the whole of what a 180 is.
    //
    // There used to be an exception here: a landed half turn was REDIRECTED —
    // the course was set to the new heading, so a 180 turned your line through
    // 180° as well and you rode off the way the nose now pointed. It was
    // deliberate, it is what some skate games do, and it was wrong for this
    // one: a player who spun a 180 over a stair set found his momentum turned
    // round with him and the line he was riding gone. Momentum is not a
    // rotation and the board coming round does not touch it.
    const facing = this.velX * this.forwardX + this.velZ * this.forwardZ;
    // The clean landing's own fixed scrub first — that one is the wheels
    // finding the floor and it is the same at any height — then the slam, as a
    // SHARE of what is left. See `LAND_SLAM_HALF`.
    this.speed = THREE.MathUtils.clamp(
      (towardZero(facing < 0 ? -carried : carried, LANDING_SCRUB) * LAND_SLAM_HALF) /
        (LAND_SLAM_HALF + slam),
      -MAX_ROLL_SPEED,
      MAX_ROLL_SPEED,
    );
    this.vy = 0;
    this.boardPitch = 0;
    this.trick = null;
    this.trickId = null;
    this.streak += trick ? 1 : 0;
    this.readSurface(yHint, 1); // dt = 1: on touchdown the deck IS on the floor

    // Which way round he was standing when he STARTED the trick, held across
    // the stance change the spin is about to make. THPS names a trick by the
    // stance you took off in — a regular-stance 180 is a "180 Ollie" and it
    // leaves you switch; calling it a "Switch 180 Ollie" names the landing.
    const stanceIn = this.stance;
    this.resolveSpin(degrees);
    this.events.onLand?.(trick, this.streak, slam);
    if (trickId) this.bankTrick(trickId, 0, degrees, stanceIn);
  }

  /**
   * A spin has resolved: name it, and start the next one from zero.
   *
   * It does NOT touch the stance. Not because a landed 180 leaves the stance
   * alone — it does not, the wheels end up running the other way and he comes
   * round — but because the SPIN is the wrong place to ask. A spin that lands
   * square on a full 360 changes nothing about which way the wheels run, and a
   * roll-back down a transition changes it with no spin at all. `syncStance` is
   * the one and only writer, and it reads the wheels.
   */
  private resolveSpin(degrees: number): void {
    if (this.spin.peak >= SPIN_MIN_DEG) this.events.onSpin?.(degrees);
    this.spin.reset();
  }

  /**
   * Which way round is he riding? — the sign of the wheels against the way he
   * stands, and nothing else.
   *
   * **A skater faces the way he is going.** That is the whole rule, and a player
   * has now asked for it four times in his own words: "the skateboard stays in
   * place, my guy just turns the other way", "keep moving forward switched",
   * "he's looking backward, in the opposite direction from his movement", and
   * "you just turned the head, while the body is facing backward even though I'm
   * moving forward." What changes is HOW he comes to face it, and this function
   * decides that — it writes two different answers and they are not
   * interchangeable.
   *
   * It matters a great deal HOW the wheels came to be running the other way,
   * and this function is the only place that asks. The two ways in are two
   * different moves and a player has described both in his own words:
   *
   *   · **The ground sent him back** — up a transition, out of speed, rolling
   *     back down one the deck is still pointing up. Nothing turned the board,
   *     so the RIDER turns: a half-turn on the deck, his feet swapping ends,
   *     the same foot still leading. "The skateboard stays in place, my guy
   *     just turns the other way."
   *   · **The board came round under him** — a landed 180, his feet never
   *     moving. Turning him as well would put those feet back exactly where
   *     they started and the trick would have no visible result at all: "we
   *     want to do a switch specifically so the guy rides in switch… he should
   *     stay." So the stance is left alone and `fakie` goes up instead, and the
   *     anim layer answers it with a reflection of the pose — his shoulders
   *     open toward the end he is going to and the other foot pushes.
   *
   * `STANCE_BOARD_TURN` is the whole test: did the heading move while he was
   * riding the way he stands? Under it, the ground did this; over it, the board
   * did.
   *
   * It is a deadband, not a threshold (`STANCE_FLIP_SPEED`), so a speed sitting
   * on zero at the top of a transition cannot flip a half-turn of body on and
   * off at frame rate.
   *
   * Grounded only. In the air the deck and the flight path disagree by whatever
   * the spin has turned so far, so asking this question mid-flight would turn
   * him round at 90° through every 360 and back again; the stance he took off in
   * is the stance he flies in, and the wheels re-answer it the moment they are
   * down. The rail is left alone for the same reason — the Grinder was handed a
   * stance at the lock-on and the boardslide it chose is standing on it.
   */
  private syncStance(): void {
    // Which way he FACES along the heading, and which way the wheels are
    // actually running. Regular is nose-first; a rider standing switch faces
    // the tail, and for him a negative speed is forwards.
    const facing = this.rideSign;
    const way =
      this.speed <= -STANCE_FLIP_SPEED ? -1 : this.speed >= STANCE_FLIP_SPEED ? 1 : 0;
    if (way === 0) return; // inside the deadband: hold everything, decide nothing
    if (way === facing) {
      // Travelling the way he is standing. Nothing to settle, and this is the
      // heading a later reversal is measured against.
      this.rollingBackwards = false;
      this.faceHeading = this.heading;
      return;
    }
    // He is going backwards relative to his own body. Answered ONCE per stretch
    // — the flip below makes `facing` agree with `way` on the very next frame,
    // but the suppressed case does not, and re-asking it every frame would turn
    // a fakie roll into a body varial the moment it started.
    if (this.rollingBackwards) return;
    if (Math.abs(shortWay(this.heading - this.faceHeading)) < STANCE_BOARD_TURN) {
      // Nothing turned the board, so he turns himself: a half-turn on the deck,
      // his feet swapping ends, and he is set up to lead with the tail. That is
      // not fakie — the wheels and the way he stands agree again the instant he
      // is round — so the flag never goes up, and the reflection the anim layer
      // hangs on it never comes on for the frame before `rideSign` catches up.
      this.faceHeading = this.heading;
      this.setStance(flipStance(this.stance));
      return;
    }
    // The BOARD came round instead, under feet that stayed exactly where they
    // were. He is standing the same way on the same deck and rolling the other
    // way down it — which is fakie, and the whole visible result of a 180.
    this.rollingBackwards = true;
  }

  /**
   * True while the wheels are running against the way he stands — he is rolling
   * one way and standing the other, because the board came round under him and
   * his feet did not follow.
   *
   * The animation layer hands every clip over to its REFLECTION on this
   * (`SkaterAnim.setFakie` → `mirror.ts`) — shoulders open the other way, the
   * other foot off the deck to push — and the HUD lights the same badge for it
   * as for a rider who turned round on the deck: to the player they are one
   * thing, "he is riding the other way round", and he calls both of them switch.
   */
  get fakie(): boolean {
    return this.rollingBackwards;
  }

  // There was a `landedHalfTurn` here — "did that spin come round an odd number
  // of half-turns and land square" — and it had two callers, the landing's
  // redirect and the stance flip. Both are gone: the landing keeps the momentum
  // whatever the spin did with the board, and which way round he stands is a
  // question about the wheels (`syncStance`). Nothing else ever wanted to know.

  private endPivot(): void {
    this.pivoting = false;
    this.resolveSpin(this.spin.degrees);
  }

  // -------------------------------------------------------------------------
  // grinding — the state machine only; grind.ts owns what happens on the line
  // -------------------------------------------------------------------------

  private tryCatchGrind(yPrev: number, grounded = false): boolean {
    // A GRIND STARTS ON ITS OWN, the moment he rides onto the line — the
    // player's own instruction: *"let's make rail sliding activate when I simply
    // ride onto it, without holding a button. As soon as you ride onto it, the
    // rail slide starts."*
    //
    // THE KEY THAT USED TO BE HERE WAS A FIX, so what replaced it has to do the
    // same work. `HOLD E` gated every catch the Grinder offered, and it was put
    // in because catches on geometry alone locked the board onto things nobody
    // aimed at: **237 of 576 straight twelve-second rolls ended on a line**,
    // most of them kerbs. Deleting the gate and calling it done would hand that
    // measurement straight back. So it was measured instead, on a harness
    // written for exactly this change — `tools/grind-auto.mjs`, which rides
    // every line in the spot from both ends at four speeds and five angles, and
    // reports false catches and unreachable lines in the same run. What it found
    // is that the 237 belong to TWO different rules and only one of them was
    // ever the key:
    //
    // · **The grounded refusal is what killed them, and it is untouched.**
    //   `GrindQuery.grounded` — "a grind starts when the board leaves the floor"
    //   — answers no on every rolling frame, and every kerb in this plaza
    //   measures 0.00 m proud of the road, so a board rolling beside one is
    //   level with it and no window can tell the trucks from the wheels.
    //   Measured with the key HELD, i.e. on geometry alone: **0 of 1111**
    //   straight rolls along a line catch, **0 of 432** rolls across one, and
    //   **0 of 182** ollies beside one outside its corridor. That is the 237
    //   already gone, and gone without a key.
    // · **The staleness the old note describes cannot come back**, because the
    //   Grinder is still asked on EVERY rolling frame. `Grinder.airPeak` — the
    //   apex `crest` measures a rise from — only refreshes on frames `catch`
    //   runs, and the bug was a version of this method that returned BEFORE
    //   asking: the peak went stale high, and a board that never left the ground
    //   read as one falling onto a line. The gate below never moved above the
    //   `catch` call and it still has not. The observation is unconditional; only
    //   the OFFER is ever refused.
    //
    // What the key was still buying, measured: the AIR CROSSINGS. **165 of 1432**
    // hops taken at 65° and 90° across a line, with the run-up swept over the
    // whole arc, come back as a catch — because in this game a square-across
    // ollie IS the boardslide entry (`settleAngle` lays the deck across the
    // line), and ollieing OVER a kerb to get across the road is the same
    // approach, the same arc and the same frame. No geometry separates them.
    // That one entry therefore keeps the key and everything else is automatic;
    // see the gate below.
    //
    // Nothing else about this method changes: the rail is still a landing
    // surface, it still declines a board on its way up, a deck still coming
    // round still puts him down, and `place` is still asked whether the board
    // may be there at all.
    const rails = this.surface.rails();
    if (rails.length === 0) return false;
    const q: GrindQuery = {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yPrev,
      heading: this.heading,
      // Where he is GOING, which since the ride started carrying a velocity
      // through the air is not where the deck points: a 180 spins the board
      // under a straight arc, and a deck turned across a line the momentum is
      // still running down IS a boardslide. Left undefined on the ground, where
      // the wheels only roll one way and the nose is the travel.
      course:
        !grounded && Math.hypot(this.velX, this.velZ) > 1e-4
          ? Math.atan2(this.velX, this.velZ)
          : undefined,
      speed: this.speed,
      stance: this.stance,
      grounded,
    };
    const state = this.grind.catch(q, rails);
    if (!state) return false;
    // THE SLIDE KEY, and it now gates ONE entry instead of all of them: the deck
    // dropped SQUARE across the line rather than ridden along it
    // (`Grinder.squareEntry`). Riding onto a line takes no key at all.
    //
    // It is the only entry that needs one, and that is a fact about the
    // geometry rather than a preference. Coming at a bar across it and popping
    // over is how you boardslide in this game; it is also how you get past a
    // kerb on the way somewhere else. Same approach, same arc, same frame —
    // measured, 165 of 1432 of those hops lock on — so the one thing that
    // separates them is a player saying so. An ALONG entry has no such twin: he
    // is running down the line, which is the whole of "I rode onto it".
    //
    // Declined the way the two branches below decline — `return false` and leave
    // the Grinder holding a line nothing will ride, because the next `catch()`
    // retires it and marks it spent, which is exactly right for a board hopping
    // over something. Deliberately NOT `reset()`, which is what stood here: that
    // clears `airPeak` as well, and with this branch now firing in ordinary play
    // (every hop across a kerb) it would drop the air's own peak to wherever the
    // board was mid-flight — the same class of lie about the crest as the stale
    // peak in the header, told the other way round.
    if (this.grind.squareEntry && !this.slideWanted) return false;

    // A lock-on is a TELEPORT — `place` puts the board on the line, wherever
    // that is — so it is asked the same question every step of the ride is
    // asked: may the board be there at all? A rail buried in a pier answers no
    // for the buried third of its length, and the alternative to refusing is a
    // catch that snaps him inside six metres of concrete before `railWalk` gets
    // its first frame. Declining here also leaves the Grinder exactly as the
    // rising-flip branch below leaves it — holding a line it was never given —
    // and that clears itself the same way.
    const at = this.grind.place(state, _railTo);
    if (this.surface.blocked(at.x, at.z, at.y + WALL_PROBE)) return false;

    // A rail is a landing surface, so it asks the landing's own first question:
    // is the board CAUGHT? Locking on with the deck still coming round used to
    // snap it flat in one frame — measured across 36 flip-toward-a-line
    // approaches, 13 of them caught mid-flip and the deck jumped 210° to 345° —
    // and it paid out a clean grind for a kickflip he never finished. Flip
    // early enough that the deck is under your feet when the trucks arrive, or
    // the rail puts you down; that is the same bargain the floor offers.
    //
    // The Grinder has already marked this line live and nothing will set
    // `grindState`, so it is holding a grind that is not happening. It clears
    // itself: the next `catch()` — the grounded one, the first frame he is
    // rolling again — retires it, which also marks the line spent so it cannot
    // take him the instant he gets up beside it.
    //
    // …asked of the moment the trucks arrived, not of the frame they arrived
    // in. `flip` advances a whole frame at a time, so the end-of-frame value is
    // up to 33 ms late at 30 fps and 7 ms at 144 — measured, that is a 90°
    // kickflip at the 3.78 m handrail at 14 m/s that grinds at 30 fps and slams
    // at 45 and above off the identical arc. `crossedAt` is where in the step
    // the line was actually met, and the step is the one thing the Grinder
    // knows that the ride does not.
    const met = this.grind.crossedAt;
    if (this.flipWas + (this.flip - this.flipWas) * met < 1) {
      // …but only if he was ARRIVING. A board still going up was never landing
      // on this line: it is climbing past a rail it would have cleared, and
      // putting him on the concrete for it is a bail taken in mid-air. Measured
      // across 252 kickflip-toward-a-rail approaches, 56 of them ended on the
      // floor and every single one was rising. Refuse the line instead; the
      // flip has the rest of the hang time to come round, and the floor asks
      // the same question again when he actually arrives.
      if (this.vy > 0) return false;
      this.enterRagdoll();
      return true;
    }

    this.grindState = state;
    this.state = "grind";
    this.heading = state.heading;
    this.speed = state.speed;
    this.vy = 0;
    this.flip = 1;
    this.boardPitch = 0;
    this.grind.place(state, this.position);
    this.surfaceNormal.set(0, 1, 0);
    // The spin that put him on the rail still counts and is named here rather
    // than against the floor. The line itself decides which way he now points
    // (`state.heading`, set above), so there is nothing left for the spin to
    // decide.
    const degrees = this.spin.degrees;
    const stanceIn = this.stance; // named off the stance he took off in — see `land`
    this.resolveSpin(degrees);
    // The air trick banks HERE, in the same order the floor banks it — spin
    // first, so "360" is on screen for "360 KICKFLIP" to swallow. There is no
    // landing coming to do it: `flight()` returns the moment this succeeds, so
    // `land()` never runs and a kickflip into a 50-50 paid for the 50-50 alone.
    if (this.trickId) this.bankTrick(this.trickId, 0, degrees, stanceIn);
    this.trick = null;
    this.trickId = null;
    // A held trick is let go of by the rail, the same as by a bail and by R —
    // and banked, because he grabbed it and he landed it, into a grind.
    // `update()` returns at the top while the state is `grind`, so `setHold`
    // does not run again until he is off the line: the hand stayed on the deck
    // and the badge stayed lit for the whole grind, and the grab banked a beat
    // after he had already stepped off it.
    this.setHold(null);
    this.events.onGrindStart?.(state.kind, state.line);
    return true;
  }

  /**
   * Carry the board to where the line says it is — against the same world every
   * other step of the ride is tested against.
   *
   * **A grind is the one state in this game that writes its own position.**
   * `Grinder.place` returns a point ON the line and nothing else, and `update()`
   * returns at the top while the state is `grind`, so neither `roll()` nor
   * `flight()` runs and `advance` — the only code that asks `blocked()` or
   * `meetSteel()` — is never reached. For the whole length of a grind the board
   * was a position being written rather than a body being tested, and the
   * player's report was the general case of it: *"right now I can go through
   * some walls."*
   *
   * A rail that runs into something is not a hypothetical. Map 2's
   * `service-pipe` lines pass through the east bridge pier: 2.31 m of the
   * middle one is inside `pier-e`, which stands 6.9 m over the steel there.
   * Ridden, that was a board teleported through concrete, a bail INSIDE it, a
   * ragdoll that settled inside it and a skater who stood up 7.10 m inside the
   * pier at 0.00 m/s and stayed there. `tools/collide-sweep.mjs` drives every
   * line in both maps with X held and measures exactly that.
   *
   * So the line's step is walked like any other, and what stops a board rolling
   * stops a board grinding: same probe, same steel, same charge through
   * `wallAlong` — which is what makes hitting a pier at 14 m/s a slam and
   * kissing one at 3 m/s a scuff, without this method knowing either number.
   * The board's own line is skipped by `steelStep` (see `grindState`), so the
   * bar he is riding is never the bar he hits.
   *
   * Returns false when the line did not take him where it said it would, which
   * is the caller's cue that the grind is over: a board that is not on the
   * steel is not grinding it.
   */
  private railWalk(to: THREE.Vector3): boolean {
    // Walked LEVEL, at the lower of the step's two ends, and that is the one
    // thing this does differently from a step through the air. `advance` has a
    // rule for a board coming DOWN — anything it was clear over when the step
    // began is a floor arriving, so it is let in and the landing puts him on
    // top of it — and a board on a rail is not coming down, it is being
    // carried. Applying the falling rule to a line let a descending rail post
    // the board 2 cm into map 2's `straight-sill` before the walk gave up, and
    // 11 cm by the frame after. Level at the low end, and a sill is a wall
    // again. What it costs is at most the drop the line takes inside one
    // frame — 22 cm on the steepest pipe in either map at 30 fps — and the
    // sweep's own catch check (every line, both directions, 6–14 m/s) is what
    // says that costs no grind.
    const low = Math.min(this.position.y, to.y);
    this.advance(to.x - this.position.x, to.z - this.position.z, low, low);
    // The height is the line's either way. If he was stopped at a face he is
    // leaving the line this frame anyway, and `takeOff` starts him from here.
    this.position.y = to.y;
    return (
      Math.abs(this.position.x - to.x) < LIP_EPS && Math.abs(this.position.z - to.z) < LIP_EPS
    );
  }

  private updateGrind(input: SkateInput, dt: number): void {
    const state = this.grindState;
    if (!state) {
      this.takeOff(0);
      return;
    }
    state.elapsed += dt;

    // Space pops out of it — the same key that gets you off the ground. The
    // rail is the tangent he leaves along, so a handrail that drops a metre
    // over its length hands him that drop as vertical, exactly as a lip does.
    if (input.olliePressed) {
      const grade = railGrade(state);
      this.endGrind(false);
      this.pop("ollie", grade);
      // …and `catchWhileRising` is deliberately NOT set: this air began by
      // leaving a line on purpose, so `flight()` will not offer him one again
      // until he is on the way back down to it.
      return;
    }

    const tick = this.grind.update(state, THREE.MathUtils.clamp(input.steer, -1, 1), dt);
    this.heading = state.heading;
    this.speed = state.speed;
    // …and the line only gets to move him where the world lets him go. See
    // `railWalk`: a line that runs into a pier hands the board over to the wall
    // rule the same way a roll into one does.
    const carried = this.railWalk(this.grind.place(state, _railTo));
    // Balance reads as the bank he is fighting, so the existing lean channel
    // carries it and the rig needs to know nothing new.
    this.lean = THREE.MathUtils.damp(this.lean, state.balance * MAX_LEAN, 9, dt);
    this.boardPitch = THREE.MathUtils.damp(this.boardPitch, 0, 12, dt);
    if (tick === "on" && carried) return;

    const grade = railGrade(state);
    this.endGrind(tick === "bail");
    if (tick === "bail") {
      this.enterRagdoll();
    } else {
      // Ran off the end, or ran into something. Either way: back into the air
      // along the line he was riding, and the normal landing rules take over
      // from there — including landing on the next rail along. A line that ran
      // into something has already been charged as a wall by the walk, so
      // `settleWall` takes the speed out of him on this same frame and puts him
      // down if it was a slam.
      this.takeOff(grade);
    }
  }

  private endGrind(bailed: boolean): void {
    const state = this.grindState;
    if (!state) return;
    this.grindState = null;
    this.events.onGrindEnd?.(bailed);
    if (!bailed) this.bankTrick(state.kind, state.elapsed, 0);
  }

  // -------------------------------------------------------------------------
  // held tricks, scoring, and going down
  // -------------------------------------------------------------------------

  /**
   * Nose-up in a manual, tail-up in a nose manual, flat otherwise — and how far
   * up is the BALANCE, which is what makes the deck the meter for it.
   *
   * Symmetric by construction: the rake's magnitude is the same expression for
   * both ends and only its sign is the trick, so `+balance` means "further over
   * the truck he is on" in a nose manual exactly as it does in a manual, and
   * the key that saves one saves the other.
   */
  private manualPitch(): number {
    const rake = MANUAL_PITCH * (1 + this.manualBal * MANUAL_RAKE_SWING);
    if (this.holding === "manual") return -rake;
    if (this.holding === "noseManual") return rake;
    return 0;
  }

  /**
   * One frame of the manual's balance — the manual's answer to `Grinder.update`,
   * and deliberately the same shape: a wander that grows with time on the
   * trick, an inverted pendulum that makes every degree past the point cost
   * more than the last, and the steering axis fighting both.
   *
   * The two differences from the rail are both about what losing it MEANS. A
   * rail is a foot off the ground and going over the edge of one is a ragdoll;
   * two wheels are already on the floor, so the only thing left to lose is the
   * other two — the manual banks, the wheels drop, and he rides on. A manual
   * that ended in a slam every time is a punishment for the trick whose whole
   * job is carrying a line across flat ground, and nobody would ever press E
   * twice. The other is the axis: a rail's balance is a roll, and a manual's is
   * the rake you can already see (`manualPitch`), which is why this needs no
   * gauge to be readable.
   */
  private stepManual(steer: number, dt: number): void {
    // Read at the top of the step, so the first frame of a manual is worth the
    // wander a zero-second manual has: none of it beyond the start share.
    const w = this.manualT;
    this.manualT += dt;
    const ramp = MANUAL_WANDER_START + w / MANUAL_WANDER_FULL;
    // Mirrored with the side he came up on, so the two halves of the balance
    // are the same trick. Without it a manual that tipped one way ran measurably
    // longer than one that tipped the other, purely because the sine happened
    // to lean that way — and the whole point of seeding the SIDE and not the
    // phase is that the hold's length is not a lottery.
    const wander =
      MANUAL_WANDER *
      ramp *
      (1 - Math.abs(this.manualBal)) *
      this.manualSide *
      (Math.sin(1.9 * w) + 0.6 * Math.sin(3.1 * w));
    // A/D against all that, on the rail's own sign: `+steer` (D) pushes the
    // balance positive, which is further over the truck he is on, and A brings
    // it back down. There is no left and right in a rake, so the convention is
    // the one thing that matters and it is the one the rail already uses — one
    // shape of expression for both balances, and one habit for the player. What
    // it reads off is the deck: rising means D is feeding it and A saves it,
    // flattening means the other way round, and both are visible a second
    // before they are fatal. What it COSTS is that the same key is the carve,
    // so a manual held long is a manual held round a curve — the ground-level
    // version of the rail's `SQUARE_TAX`.
    this.manualBalVel +=
      (MANUAL_TIP * this.manualBal + wander + steer * MANUAL_CORRECT_RATE) * dt;
    this.manualBalVel *= Math.exp(-MANUAL_BALANCE_DAMP * dt);
    this.manualBal = THREE.MathUtils.clamp(this.manualBal + this.manualBalVel * dt, -1, 1);
    // Past the edge either way and the wheels are coming down. The book turns
    // this into the bank, the line's close and the key lock-out; the rake gets
    // there on its own, because `manualPitch` is 0 the moment nothing is held.
    if (Math.abs(this.manualBal) >= 1) this.manualSpent = true;
  }

  /**
   * Up on two wheels from nothing: a fresh balance, tipped the way this patch of
   * ground tips people.
   *
   * Not called on the E↔Q handover — see `manualT`. It IS called when the
   * ground took a manual away and he picked it straight back up over a manny
   * pad's bump, and that is right: the wheels touched the floor, so the balance
   * he re-establishes is a new one, even though the trick book is still paying
   * the same link for it.
   */
  private beginManual(): void {
    // The metre square he popped it in decides, and neighbouring squares
    // alternate. Seeded off the ground rather than randomised for the reason
    // `grind.phaseOf` is seeded: the same pop off the same kerb has to tip the
    // same way every run, or the balance is untunable and the player is being
    // asked to read a coin. It is only ever WHICH WAY — both sides are the same
    // trick and take the same time (see `stepManual`), so a coarse rule is the
    // right amount of rule.
    this.manualSide =
      ((Math.round(this.position.x) + Math.round(this.position.z)) & 1) === 0 ? 1 : -1;
    this.manualBal = this.manualSide * MANUAL_ENTRY_LEAN;
    this.manualBalVel = 0;
    this.manualT = 0;
    this.manualSpent = false;
  }

  private setHold(id: TrickId | null): void {
    if (id === this.holding) return;
    const wasManual = this.holding === "manual" || this.holding === "noseManual";
    const wasNose = this.holding === "noseManual";
    const wasGrab = this.holding === "grab";
    if (this.holding) this.bankTrick(this.holding, this.holdT, 0);
    const isManual = id === "manual" || id === "noseManual";
    const isNose = id === "noseManual";
    // A manual STARTING is the only thing that seeds a balance. Rolling from E
    // into Q keeps the one he is on: he has shifted his weight over the other
    // truck, not put the board down, and a handover that handed back a fresh
    // balance would make alternating the two keys a manual with no end.
    if (isManual && !wasManual) this.beginManual();
    this.holding = id;
    this.holdT = 0;
    // Which END is up counts as a change of its own: rolling straight from E
    // into Q without touching down is one manual becoming the other, and the
    // body has to shift its weight over the other truck.
    if (wasManual !== isManual || (isManual && wasNose !== isNose)) {
      this.events.onManual?.(isManual, isNose);
    }
    // The grab has a body and a callout of its own, and the book has already
    // latched which flavour it is by the time we are told to hold it.
    if (wasGrab !== (id === "grab")) {
      this.events.onGrab?.(id === "grab" ? this.tricks.grabName : null);
    }
  }

  /**
   * Let go of whatever was being held WITHOUT banking it — a bail and a respawn
   * both take the trick away rather than paying for it.
   *
   * It still has to be announced. `setHold` is the only other place that says
   * a hold ended, and neither of these paths goes through it, so without this
   * the hand stays on the deck and the badge stays on the screen for the rest
   * of the run.
   */
  private dropHold(): void {
    const was = this.holding;
    this.holding = null;
    this.holdT = 0;
    // The balance goes with it. Nothing reads it while nothing is held, but a
    // spent flag left lying about is the kind of latch that comes back one
    // round later as "the first manual after a slam ends on the frame it
    // starts".
    this.manualBal = 0;
    this.manualBalVel = 0;
    this.manualT = 0;
    this.manualSpent = false;
    if (was === "grab") this.events.onGrab?.(null);
    else if (was === "manual" || was === "noseManual") this.events.onManual?.(false, false);
  }

  /**
   * `stance` is the one he STARTED the trick in, and it is a parameter because
   * the caller that lands a 180 has already flipped him by the time it banks.
   * Defaults to the stance he is in, which is the right answer for everything
   * that did not turn him round — a grind names itself off the feet it is being
   * ridden on.
   */
  private bankTrick(
    id: TrickId,
    holdTime: number,
    spinDegrees: number,
    stance: Stance = this.stance,
  ): void {
    const result = this.tricks.describe(id, {
      spinDegrees,
      holdTime,
      stance,
      streak: this.streak,
    });
    this.events.onTrick?.(result.id, result.name, result.score);
  }

  private setStance(stance: Stance): void {
    if (stance === this.stance) return;
    this.stance = stance;
    this.events.onStance?.(stance);
  }

  private setCharging(winding: boolean): void {
    if (winding === this.charging) return;
    this.charging = winding;
    this.events.onCharge?.(winding);
  }

  /**
   * He is off. The model stops being a skater here: it keeps a body sliding
   * along the floor so the camera has something to watch, and hands the impact
   * velocity to whoever owns the bones (see ragdoll.ts).
   */
  private enterRagdoll(): void {
    // A line still under him goes down with him, and it has to be SAID. Nothing
    // else here clears `grindState`, so a bail taken on a rail — a wall slam
    // charged on the very frame the trucks locked on is the way in — left the
    // grind loop playing and the balance meter lit for the rest of the run,
    // over a skater lying on the concrete. `endGrind(true)` is a no-op when
    // there is no line, and `true` is what keeps it from paying for the grind
    // he just fell out of.
    this.endGrind(true);
    // The velocity he is actually carrying, which off a slam out of the air is
    // the flight velocity and not the heading he happens to have spun to.
    const air = this.state === "air";
    _impact.set(
      air ? this.velX : this.forwardX * this.speed,
      this.vy,
      air ? this.velZ : this.forwardZ * this.speed,
    );
    const trick = this.trick;
    this.state = "ragdoll";
    this.bailT = 0;
    this.streak = 0;
    // A combo is only banked once he rolls away from it. Everything the line
    // has earned so far goes back on the floor with him.
    this.tricks.drop(); // the line is forfeit; the HUD's `loseCombo` is the score half
    this.flip = 1;
    this.vy = 0;
    this.speed *= RAGDOLL_CARRY;
    this.trick = null;
    this.trickId = null;
    this.dropHold();
    this.spin.reset();
    this.events.onRagdoll?.(_impact);
    this.events.onBail?.(trick);
  }

  private updateRagdoll(dt: number): void {
    this.bailT += dt;
    this.speed = towardZero(this.speed, RAGDOLL_DRAG * dt);
    this.advance(this.forwardX * this.speed * dt, this.forwardZ * this.speed * dt);
    // …and the lift is `WALL_PROBE`, not `HINT_LIFT`, for the reason `flight()`
    // gives at its own landing: **anything he can be let into is something he
    // can lie on**. `advance` admits a footprint whose top is within
    // `WALL_PROBE` of the board, so a body that arrives from above — and a
    // ragdoll always does — can be under a top by up to 0.30 m; asking for the
    // floor with only 0.15 m of lift then refuses that top and hands back
    // whatever is beneath it, and he sinks through. Measured with
    // `tools/collide-sweep.mjs`: a 14 m/s grind down `service-pipe-1` bailed
    // against the east pier and the body settled 0.12 m inside `pier-plinth-e`,
    // whose top stood 0.25 m over the board at the moment he went down — dead
    // in the band between the two numbers.
    const yHint = this.position.y + WALL_PROBE;
    this.position.y = this.surface.height(this.position.x, this.position.z, yHint);
    this.readSurface(yHint, dt);
    this.lean = THREE.MathUtils.damp(this.lean, 0, 6, dt);

    // Up when the BODY says it has stopped, not when a clock says it should
    // have: a tip-over that comes to rest in half a second had him lying on the
    // concrete for a second more, and a full-speed slam still sliding at 1.5 s
    // was hauled to his feet mid-slide. The timer is only the ceiling now, and
    // the floor under it is there because `settled` is also true before
    // anything has been thrown.
    const rested = this.bailT >= RAGDOLL_MIN_DOWN && (this.body?.settled ?? false);
    if (rested || this.bailT >= RAGDOLL_RECOVER) {
      this.state = "rolling";
      this.bailT = 0;
      this.speed = 0;
      this.boardPitch = 0;
      this.pushT = PUSH_INTERVAL;
      this.pushPending = false;
    }
  }
}
