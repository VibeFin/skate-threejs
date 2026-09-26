// THE SPILLWAY, feature by feature — this file IS the level design.
//
// Read it top to bottom and you have ridden the map. Everything is placed in
// the channel's own frame (`s` down the flume, `u` across it), so the numbers
// below say where a thing is IN THE CHANNEL, not where it is in the world, and
// the meander carries them all.
//
// THE LINE, and what each reach is for. The speeds are MEASURED, on the real
// ride over the real surface, for a run that never touches the throttle once:
//
//   s        reach             grade   coasting     what it does to you
//   ───────  ────────────────  ──────  ───────────  ──────────────────────────
//   −34…−6   the headworks     0.09    0 → 5 m/s    the apron under the road.
//                                                   A warm-up ledge and a block
//                                                   to find the controls on.
//   6…52     THE CHUTE         0.26    7 → 15 m/s   8.4 m of floor between two
//                                                   banks, and NOTHING in it but
//                                                   two sills and a bar.
//                                                   The whole reach is the speed.
//   66…118   the ledge run     0.14    15 → 13.5    it opens out: a centre
//                                                   island, two staggered
//                                                   blocks, a hubba, a wedge.
//   130…168  THE BOWL          0.16    14           25 m wall to wall, 3 m banks
//                                                   and the map's only SHARP
//                                                   coping. Carve it, pump it,
//                                                   boost out of it. A spine
//                                                   across the middle and a
//                                                   wedge off each toe.
//   182…200  the drop reach    0.24    → 13         it squeezes and steepens…
//   200      **THE FIRST DROP**  −3.4 m             …and falls away: 12 m of air
//                                                   and 10 m of drop coasting,
//                                                   twice that with speed on.
//   205…240  the landing       0.62                 32° of bank, which is what
//                                                   turns that arrival back into
//                                                   speed instead of a slam.
//   240…276  the long straight 0.17    23 → 24      the road bridge, its piers
//                                                   on the bank toes, and
//                                                   barriers before the drop.
//   276      **THE SECOND DROP** −2.6 m             22 m out, 13 m down, onto 27°.
//   281…330  the last chute    0.18    22           a step-up shelf, then the
//                                                   FINALE WEDGE.
//   344…374  the outfall       → 0                  it opens right out…
//   374…410  the run-out       −0.36                …and ENDS IN A BANK that
//                                                   hands you back pointing at
//                                                   the flume, with a trash
//                                                   rack behind it you can see.
//
// TWO RULES EVERY NUMBER HERE IS CHECKED AGAINST, and they are the RIDE'S rather
// than this map's:
//
// · **NOTHING IN THE CHANNEL PRESENTS A SQUARE FACE TO A CARVING RIDER.** A
//   carve is a heading change that does not come back (see channel.ts's
//   `THE BANK IS A THING YOU USE`), so a rider who touches the carve key is
//   crossing the flume at 25–30° until he does something else, and everything
//   he can reach on the way is something he arrives at from the side. Measured
//   on the first cut of this map that was the whole game: 0.3 s of carve at
//   eight stations put six of them into a wall, and the thing that ended an
//   88 km/h run was the flat upstream face of a 0.62 m plinth. Two shapes come
//   out of that, and between them they are most of the edits in this file:
//     · every ramp is a `wedge`, tapered to nothing at both ends of its own
//       footprint, so there is no face on it from any direction at all;
//     · every LEDGE has a `bank` on its upstream end, stands under 1.2 m so a
//       square hit is a stop and never a ragdoll (`WALL_HEAD` is 1.6), and — if
//       it is longer than about six metres — carries a `chamfer` down the side
//       the channel is on. That last one is not about crashing: the ride
//       charges a face it is leaning on `WALL_RUB`, 3 m/s², for as long as the
//       lean lasts, and the centre island took a 54 km/h run to 21 without ever
//       hitting anything harder than a scuff. See `Chamfer` in features.ts.
//
// · **A LAUNCHER'S ANGLE IS MEASURED AGAINST THE HORIZON.** The floor here falls
//   at 0.14 to 0.26, and a feature's top is cast off the floor DATUM — so a ramp
//   rising `2H/L` leaves the board on `2H/L − |floorGrade|`. The first cut wrote
//   0.9 m over 5 m and called it a 20° lip; it is 10°, and measured at 77 km/h
//   it gave 0.21 m of rise. `wedge` takes the angle and works the height out
//   (`kickerHeight`), which is why the finale is 1.97 m of ramp and not 0.9.
//
// WHY THE OBSTACLES ARE WHERE THEY ARE. "Spaced for the speed you will actually
// be carrying" is arithmetic, not taste: at the ride's own `GRAVITY` of 17 a
// board leaving a 22° lip at 20 m/s is in the air for 0.9 s and covers 16 m of
// ground before the floor's own fall is counted. So nothing in this map is
// placed closer to the thing before it than the air off that thing is long, and
// the two drop structures each own thirty metres of landing.

import * as THREE from "three";
import type { GrindLine, SurfaceKind } from "../surface";
import {
  centreX,
  crestY,
  floorY,
  flumeSurfaceY,
  makeMarks,
  makeSection,
  marksOf,
  sectionAt,
} from "./channel";
import { CLUTTER, type ClutterId } from "./clutter";
import { bank, block, pad, roller, spine, wedge, type Feature } from "./features";

// ---------------------------------------------------------------------------
// where the run starts
// ---------------------------------------------------------------------------

/**
 * On the headworks apron, twenty-odd metres above the mouth, pointed down the
 * flume — and NOT already in the chute, deliberately. A map that starts you at
 * fifteen metres a second has spent the best moment it has before you looked
 * up; the apron's own 0.09 rolls you off the line without a keypress, and the
 * moment the walls close in and the floor tips to 0.26 is the map introducing
 * itself.
 */
export const SPILLWAY_SPAWN = { s: -24, heading: 0 };

export function spawnPoint(): { x: number; z: number; heading: number } {
  return { x: centreX(SPILLWAY_SPAWN.s), z: SPILLWAY_SPAWN.s, heading: SPILLWAY_SPAWN.heading };
}

// ---------------------------------------------------------------------------
// the features
// ---------------------------------------------------------------------------

const CONCRETE: SurfaceKind = "concrete";

/**
 * Everything with a face you can see. `FEATURES` at the bottom of the file adds
 * the furniture's colliders on top of this; the mesher walks THIS list, because
 * a barricade's collider has no triangles of its own.
 */
export const BUILT: readonly Feature[] = [
  // === THE HEADWORKS =======================================================
  // The back of the world: the intake wall the channel starts against, so the
  // top of the map has a face rather than an edge.
  block("intake-wall", { s0: -46, s1: -40, u0: -30, u1: 30 }, 7, { look: "brick", rows: 2, cols: 8 }),
  // The gate piers — two of them, standing on the bank toes where a stop-log
  // slot would be. They are the first thing you see and they frame the chute,
  // and they are OFF THE FLOOR (which is 8.9 m half-wide here) for the same
  // reason the bridge piers are: a pier is over `WALL_HEAD`, so it is the one
  // kind of thing in this map that genuinely puts you down, and it belongs
  // where you can see it coming rather than where a carve delivers you.
  block("gate-pier-w", { s0: -18, s1: -14.4, u0: -10.6, u1: -8.6 }, 6.2, { look: "brick", cols: 2 }),
  block("gate-pier-e", { s0: -18, s1: -14.4, u0: 8.6, u1: 10.6 }, 6.2, { look: "brick", cols: 2 }),
  // A warm-up ledge on the apron. Every skate map needs somewhere to find the
  // controls before it starts asking for things, and this is that place.
  bank("apron-ledge-on", { s0: -33, s1: -30, u0: -7.2, u1: -4.0 }, 0.5, true, { rows: 5, cols: 4, chamfer: [0.9, 0.9] }),
  pad("apron-ledge", { s0: -30, s1: -18, u0: -7.2, u1: -4.0 }, 0.5, 0.5, { rows: 8, cols: 4, chamfer: [0.9, 0.9] }),
  // …and a low block to ollie, set the other side of the line, banked at BOTH
  // ends because on the apron you are still slow enough to come at it either
  // way round.
  bank("apron-block-on", { s0: -28, s1: -26, u0: 2.0, u1: 6.4 }, 0.45, true, { cols: 4, chamfer: [0.8, 0.8] }),
  pad("apron-block", { s0: -26, s1: -21, u0: 2.0, u1: 6.4 }, 0.45, 0.45, { cols: 4, chamfer: [0.8, 0.8] }),
  bank("apron-block-off", { s0: -21, s1: -19, u0: 2.0, u1: 6.4 }, 0.45, false, { cols: 4, chamfer: [0.8, 0.8] }),

  // === THE CHUTE ===========================================================
  // Nothing across the line for fifty metres. Two sills — the check dams a real
  // flume has every so often — which compress and let you pump, and never once
  // put the board in the air (see `roller`). And one flat bar down the middle,
  // which is the one thing in the reach you can hit, at the speed the reach has
  // just given you.
  roller("chute-sill-1", { s0: 20, s1: 26, u0: -7.2, u1: 7.2 }, 0.3, { cols: 7, chamfer: [1.2, 1.2] }),
  roller("chute-sill-2", { s0: 46, s1: 52, u0: -7.4, u1: 7.4 }, 0.34, { cols: 7, chamfer: [1.2, 1.2] }),

  // === THE LEDGE RUN =======================================================
  // The centre island: bank on, eighteen metres of block, bank off. The bank at
  // each end is what makes it a feature rather than a wall — a 0.6 m face
  // square across the main line at 16 m/s is a full stop, which is the mistake
  // map 1's manual pad shipped with and had to be rebuilt to remove.
  bank("island-on", { s0: 68, s1: 71.5, u0: -3.0, u1: 3.0 }, 0.6, true, { cols: 5, chamfer: [1.2, 1.2] }),
  pad("island", { s0: 71.5, s1: 89, u0: -3.0, u1: 3.0 }, 0.6, 0.6, { rows: 10, cols: 5, chamfer: [1.2, 1.2] }),
  bank("island-off", { s0: 89, s1: 92.5, u0: -3.0, u1: 3.0 }, 0.6, false, { cols: 5, chamfer: [1.2, 1.2] }),
  // Two blocks staggered across the run, so the line has to weave or ollie.
  // Each carries a bank on its upstream face — you can take them either way.
  bank("block-w-on", { s0: 96, s1: 98.5, u0: -6.6, u1: -1.5 }, 0.55, true, { cols: 5, chamfer: [1.0, 1.1] }),
  pad("block-w", { s0: 98.5, s1: 106, u0: -6.6, u1: -1.5 }, 0.55, 0.55, { rows: 6, cols: 5, chamfer: [1.0, 1.1] }),
  bank("block-e-on", { s0: 104, s1: 106.5, u0: 1.5, u1: 6.6 }, 0.55, true, { cols: 5, chamfer: [1.1, 1.0] }),
  pad("block-e", { s0: 106.5, s1: 114, u0: 1.5, u1: 6.6 }, 0.55, 0.55, { rows: 6, cols: 5, chamfer: [1.1, 1.0] }),
  // The hubba: a ledge falling down the east side of the run, hard against the
  // bank's toe where the floor's own half-width runs out (6.6 m here) — and
  // with a BANK onto its top end. That bank is the single most expensive line
  // in this file: without it the hubba is a 1.15 m wall standing square across
  // a reach riders cross at 13 m/s, and measured on the first cut it pinned a
  // 42 km/h run for 4.4 m and left it at zero.
  bank("hubba-on", { s0: 95.5, s1: 99, u0: 3.6, u1: 7.5 }, 1.15, true, { rows: 5, cols: 5, chamfer: [1.6, 1.0] }),
  pad("hubba", { s0: 99, s1: 111, u0: 3.6, u1: 7.5 }, 1.15, 0.5, { rows: 8, cols: 5, chamfer: [1.6, 1.0] }),
  // …and the first launcher in the map. A 20° lip, which over a floor falling
  // at 0.14 is 1.26 m of ramp — and at the 13.5 m/s this reach carries it is
  // 0.6 m up and 7 m of gap. Small on purpose: it is the one that teaches you
  // what the map does, and it is a WEDGE, so crossing its shoulder while you
  // are already carving throws you sideways instead of stopping you.
  wedge("ledge-wedge", { s0: 108, s1: 113, u0: -7.0, u1: 1.6 }, 20, 2.6, { cols: 12 }),

  // === THE BOWL ============================================================
  // A low island first, so the middle of the widest reach is not empty floor.
  bank("bowl-island-on", { s0: 131, s1: 133.5, u0: -3.5, u1: 3.5 }, 0.55, true, { cols: 5, chamfer: [1.1, 1.1] }),
  pad("bowl-island", { s0: 133.5, s1: 140, u0: -3.5, u1: 3.5 }, 0.55, 0.55, { cols: 5, chamfer: [1.1, 1.1] }),
  bank("bowl-island-off", { s0: 140, s1: 142.5, u0: -3.5, u1: 3.5 }, 0.55, false, { cols: 5, chamfer: [1.1, 1.1] }),
  // THE SPINE — the map's centrepiece, and the one obstacle here that is a
  // launch rather than a shape. Two banks meeting on an edge 1.6 m up.
  //
  // FIVE metres of run and not eight, which is the same arithmetic as the
  // finale's: a spine rises `2H/L` off the floor datum and the floor is falling
  // 0.16 under it, so at 8 m the lip was 0.4 − 0.16 = 13.5° and measured 0.26 m
  // of rise at 47 km/h — a bump with a grind line on it. At 5 m the lip is
  // 0.64 − 0.16 = 25.6°, a coasting run tops it at 11.9 m/s and it is 0.8 m up
  // and 6.5 m across. POPPED at the crest it is half as much again, because
  // `takeOff` adds the legs as work on top of what the ramp already bought.
  //
  // …and it runs WALL TO WALL, out to u = ±12, which is where the transitions
  // have climbed past its own crest and buried its ends. A spine that stops in
  // open floor has two exposed 1.6 m end faces, and 1.6 m is `WALL_HEAD` — an
  // invisible thing off to the side that ragdolls you for carving wide. Dying
  // into the banks is also what a real weir does.
  spine("spine", { s0: 143, s1: 148, u0: -12, u1: 12 }, 1.6, { cols: 12 }),
  // The two wedges off the bank toes, staggered so you take one or the other
  // and never both. 22° over 5.5 m is 1.55 m of ramp, which at the 14 m/s this
  // reach now holds is 0.8 m up and 8 m of gap — and their shoulders taper to
  // nothing over 2.6 m, so the outer one dies into the transition and the inner
  // one is a hip you can boost off sideways when you meet it mid-carve.
  wedge("bowl-wedge-w", { s0: 152, s1: 157.5, u0: -11.4, u1: -3.6 }, 22, 2.6, { cols: 12 }),
  wedge("bowl-wedge-e", { s0: 158, s1: 163.5, u0: 3.6, u1: 11.4 }, 22, 2.6, { cols: 12 }),

  // === THE DROP REACH ======================================================
  // A last sill to compress through, and then nothing: the drop wants a clean
  // approach, because what decides where you land is the tangent you leave on.
  roller("drop-sill", { s0: 184, s1: 190, u0: -9.2, u1: 9.2 }, 0.34, { cols: 7, chamfer: [1.2, 1.2] }),
  // The two low walls beside the lip. They narrow what you fly off to the
  // middle twelve metres, which is how a drop structure reads as a THING to aim
  // at rather than as the floor happening to stop — and each has a bank onto
  // its upstream end, because this is the reach where a rider is carrying 13
  // m/s and looking at the horizon rather than at his feet.
  bank("drop-wall-w-on", { s0: 191, s1: 194, u0: -8.8, u1: -5.0 }, 1.1, true, { rows: 5, cols: 5, chamfer: [1.2, 1.3] }),
  pad("drop-wall-w", { s0: 194, s1: 200, u0: -8.8, u1: -5.0 }, 1.1, 1.1, { rows: 4, cols: 5, chamfer: [1.2, 1.3] }),
  bank("drop-wall-e-on", { s0: 191, s1: 194, u0: 5.0, u1: 8.8 }, 1.1, true, { rows: 5, cols: 5, chamfer: [1.3, 1.2] }),
  pad("drop-wall-e", { s0: 194, s1: 200, u0: 5.0, u1: 8.8 }, 1.1, 1.1, { rows: 4, cols: 5, chamfer: [1.3, 1.2] }),

  // === THE LONG STRAIGHT ===================================================
  roller("straight-sill", { s0: 244, s1: 251, u0: -10.2, u1: 10.2 }, 0.5, { cols: 7, chamfer: [1.6, 1.6] }),
  // THE BRIDGE'S PIERS, and they are the one thing in this map that will
  // genuinely put you down: a pier stands over head height, so `WALL_HEAD` says
  // a square hit at speed is a crash rather than a stop, and this reach carries
  // 23 to 24 m/s.
  //
  // Which is why they sit HALF WAY UP THE TRANSITIONS and not in the water. At
  // u = ±9.8 the gap between them is 19.6 m against 14 m of floor, and their
  // faces stand a metre above the plinths that lead onto them — so the thing you
  // have to miss is not on the floor at all, it is up the bank where you can see
  // it against the sky, and threading the bridge is still the point. It is one
  // of exactly three things in this map that is still a square face, and the
  // other two are the intake wall and the trash rack: all three are over head
  // height, all three are where you can see them coming, and a pier taken square
  // at 60 km/h is the one hit in 450 m that is meant to put you down.
  // Their PLINTHS carry a bank onto the upstream end for the same reason the
  // hubba does: the plinth's flat face was measured taking an 88 km/h run to 36
  // in a single frame, and it is the exact thing this file's first rule is now
  // written about.
  bank("plinth-w-on", { s0: 249.6, s1: 253, u0: -9.2, u1: -4.9 }, 0.62, true, { rows: 5, cols: 5, chamfer: [1.0, 1.1] }),
  pad("pier-plinth-w", { s0: 253, s1: 259, u0: -9.2, u1: -4.9 }, 0.62, 0.62, { cols: 5, chamfer: [1.0, 1.1] }),
  bank("plinth-e-on", { s0: 249.6, s1: 253, u0: 4.9, u1: 9.2 }, 0.62, true, { rows: 5, cols: 5, chamfer: [1.1, 1.0] }),
  pad("pier-plinth-e", { s0: 253, s1: 259, u0: 4.9, u1: 9.2 }, 0.62, 0.62, { cols: 5, chamfer: [1.1, 1.0] }),
  block("pier-w", { s0: 254.4, s1: 257.6, u0: -11.0, u1: -9.8 }, 7.4, { look: "flume", rows: 3 }),
  block("pier-e", { s0: 254.4, s1: 257.6, u0: 9.8, u1: 11.0 }, 7.4, { look: "flume", rows: 3 }),
  // Barriers before the second drop — the last thing you weave before the floor
  // goes away, and the reason the drop is a decision instead of a surprise.
  bank("barrier-w-on", { s0: 263.5, s1: 266, u0: -9.0, u1: -3.5 }, 0.6, true, { cols: 5, chamfer: [1.0, 1.1] }),
  pad("barrier-w", { s0: 266, s1: 272, u0: -9.0, u1: -3.5 }, 0.6, 0.6, { cols: 5, chamfer: [1.0, 1.1] }),
  bank("barrier-e-on", { s0: 266.5, s1: 269, u0: 3.5, u1: 9.0 }, 0.6, true, { cols: 5, chamfer: [1.1, 1.0] }),
  pad("barrier-e", { s0: 269, s1: 275, u0: 3.5, u1: 9.0 }, 0.6, 0.6, { cols: 5, chamfer: [1.1, 1.0] }),

  // === THE LAST CHUTE ======================================================
  // The step-up shelf: a raised platform along the west side with a bank onto
  // it, a 0.7 m ledge down its whole length, and a drop off the end back into
  // the line. Somewhere to go that is not the floor.
  bank("shelf-on", { s0: 298, s1: 301.5, u0: -8.9, u1: -1.6 }, 0.7, true, { cols: 6, chamfer: [1.1, 1.4] }),
  pad("shelf", { s0: 301.5, s1: 313, u0: -8.9, u1: -1.6 }, 0.7, 0.7, { rows: 8, cols: 6, chamfer: [1.1, 1.4] }),
  // THE FINALE, and it is the answer to "somewhere to put the speed".
  //
  // A 26° lip, wall to wall — eighteen metres of it, out past the toes of both
  // transitions, tapering to nothing over 3.6 m at each end so there is no face
  // on it anywhere — you can take it square down the middle or
  // clip a shoulder mid-carve and get thrown across the channel instead. Over a
  // floor falling at 0.229 a 26° lip is 1.97 m of ramp, and at the 21.7 m/s the
  // last chute carries that is 2.7 m of rise, 1.1 s of hang and 24 m of gap —
  // with the floor itself dropping 6.2 m under the arc, because the profile
  // STEEPENS from 0.18 to 0.26 beyond it rather than flattening. A kicker whose
  // landing runs away from the arc is a kicker you ride out of.
  wedge("finale-wedge", { s0: 316, s1: 321.5, u0: -9.0, u1: 9.0 }, 26, 3.6, { cols: 16 }),

  // === THE OUTFALL =========================================================
  // A last bank-and-block to land the finale onto, off to one side of it.
  bank("outfall-bank-on", { s0: 344, s1: 347.5, u0: 1.8, u1: 9.5 }, 0.6, true, { cols: 6, chamfer: [1.2, 1.1] }),
  pad("outfall-pad", { s0: 347.5, s1: 358, u0: 1.8, u1: 9.5 }, 0.6, 0.6, { rows: 7, cols: 6, chamfer: [1.2, 1.1] }),
  bank("outfall-bank-off", { s0: 358, s1: 361.5, u0: 1.8, u1: 9.5 }, 0.6, false, { cols: 6, chamfer: [1.2, 1.1] }),
  // The debris screen — a trash rack across the mouth of the culvert, and the
  // end of the world you can SEE rather than a stop you cannot.
  //
  // 1.5 m and not the six it was first cut at, and that is map 1's own ruling
  // rather than a change of mind about what a trash rack looks like: the ride
  // ragdolls you on anything standing over `WALL_HEAD` (1.6 m) that you hit
  // past `WALL_SLAM`, and a run that comes all the way down this map and meets
  // a six-metre wall goes down at the end of every clean lap. Under head height
  // it takes every scrap of your speed and leaves you standing — which is what
  // a thing you could have ollied should do. The bank in front of it is what
  // actually turns you round; this is the backstop behind the backstop.
  block("screen", { s0: 412, s1: 415, u0: -22, u1: 22 }, 1.5, { look: "steel", rows: 2, cols: 10 }),
];

// ---------------------------------------------------------------------------
// the rails
// ---------------------------------------------------------------------------

/**
 * A grind line following the channel, emitted as `parts` straight segments.
 *
 * A ledge cast down a channel that bends is a CURVE, and a `GrindLine` is a
 * segment — so a single line drawn from one end of an eighteen-metre block to
 * the other cuts the corner by more than its own catch radius, which is a rail
 * you lock onto over thin air and miss where the concrete is. Chopping it is
 * the whole fix, and three parts over twenty metres puts the worst deviation
 * under two centimetres against a 0.42 m radius.
 *
 * `h` is height above the FLOOR DATUM, which is where every feature in this
 * file measures its top from — so a pad's edge line is the pad's own height and
 * there is no second number to keep in step.
 */
function flumeRail(
  id: string,
  kind: GrindLine["kind"],
  u: number,
  s0: number,
  s1: number,
  h0: number,
  h1: number,
  opts: { parts?: number; radius?: number; surface?: SurfaceKind } = {},
): GrindLine[] {
  const parts = opts.parts ?? Math.max(1, Math.round((s1 - s0) / 7));
  const out: GrindLine[] = [];
  const at = (t: number): THREE.Vector3 => {
    const s = s0 + (s1 - s0) * t;
    return new THREE.Vector3(centreX(s) + u, floorY(s) + h0 + (h1 - h0) * t, s);
  };
  for (let i = 0; i < parts; i++) {
    out.push({
      id: parts === 1 ? id : `${id}-${i}`,
      a: at(i / parts),
      b: at((i + 1) / parts),
      kind,
      surface: opts.surface ?? (kind === "rail" ? "metal" : CONCRETE),
      radius: opts.radius ?? (kind === "rail" ? 0.34 : 0.42),
    });
  }
  return out;
}

/**
 * The coping along the top of a bank, read off the SECTION rather than typed
 * in — so a reach that widens takes its coping with it and the steel can never
 * drift off the lip it is bolted to. Only the reaches whose `Section.coping` is
 * 0 get one: a crest that has been rolled over has no arris to grind, and since
 * the section grew a freeboard apron that is every reach but the bowl.
 */
function copingRail(id: string, side: 1 | -1, s0: number, s1: number, parts: number): GrindLine[] {
  const marks = makeMarks();
  const sec = makeSection();
  const at = (t: number): THREE.Vector3 => {
    const s = s0 + (s1 - s0) * t;
    marksOf(sectionAt(s, sec), marks);
    return new THREE.Vector3(centreX(s) + side * marks.crest, crestY(s) + 0.03, s);
  };
  const out: GrindLine[] = [];
  for (let i = 0; i < parts; i++) {
    out.push({
      id: `${id}-${i}`,
      a: at(i / parts),
      b: at((i + 1) / parts),
      kind: "rail",
      surface: "metal",
      // Half a handrail's, the same call map 1's quarter pipe makes: you are
      // within arm's reach of a coping for every metre you spend on the
      // transition, so it has to be a thing you genuinely put the trucks on.
      radius: 0.18,
    });
  }
  return out;
}

/**
 * …and a handrail standing on the FREEBOARD APRON, a metre in from the parapet.
 *
 * The reward line. Everything above the bank's crest costs speed to reach —
 * `sqrt(2·17·bank)`, which is 8.2 m/s in the last chute — so a rail up there is
 * a thing you can only take by carving hard out of a fast reach and arriving on
 * the apron still rolling. It is also exactly what a real channel has along its
 * maintenance bench, which is why it is steel and not concrete.
 */
function apronRail(id: string, side: 1 | -1, s0: number, s1: number, parts: number): GrindLine[] {
  const marks = makeMarks();
  const sec = makeSection();
  const at = (t: number): THREE.Vector3 => {
    const s = s0 + (s1 - s0) * t;
    const m = marksOf(sectionAt(s, sec), marks);
    const inset = 1.0;
    return new THREE.Vector3(
      centreX(s) + side * (m.apron - inset),
      floorY(s) + sec.bank + sec.rise * (m.apron - inset - m.crest) + 0.55,
      s,
    );
  };
  const out: GrindLine[] = [];
  for (let i = 0; i < parts; i++) {
    out.push({
      id: `${id}-${i}`,
      a: at(i / parts),
      b: at((i + 1) / parts),
      kind: "rail",
      surface: "metal",
      radius: 0.3,
    });
  }
  return out;
}

/** A straight bar on posts, given in flume coordinates at both ends. */
function flumeBar(
  id: string,
  u0: number,
  s0: number,
  u1: number,
  s1: number,
  h: number,
  radius = 0.32,
): GrindLine {
  return {
    id,
    a: new THREE.Vector3(centreX(s0) + u0, floorY(s0) + h, s0),
    b: new THREE.Vector3(centreX(s1) + u1, floorY(s1) + h, s1),
    kind: "rail",
    surface: "metal",
    radius,
  };
}

export const RAILS: readonly GrindLine[] = [
  // The apron ledge, where you find the controls.
  ...flumeRail("apron-ledge-e", "ledge", -4.0, -29.6, -18.4, 0.5, 0.5, { parts: 2 }),
  // THE CHUTE'S FLAT BAR. Fourteen metres of steel down the middle of the
  // fastest thing in the map — the one obstacle in the reach, placed where you
  // arrive at it already doing eighteen.
  flumeBar("chute-bar", 0, 30, 0, 44, 0.52),

  // The centre island, both sides, and its crest is what a manual is for.
  ...flumeRail("island-w", "ledge", -1.8, 72, 88.6, 0.6, 0.6, { parts: 3 }),
  ...flumeRail("island-e", "ledge", 1.8, 72, 88.6, 0.6, 0.6, { parts: 3 }),
  ...flumeRail("block-w-e", "ledge", -2.6, 99, 105.6, 0.55, 0.55, { parts: 1 }),
  ...flumeRail("block-e-w", "ledge", 2.6, 107, 113.6, 0.55, 0.55, { parts: 1 }),
  // The hubba — a ledge you take on the way down it, which is the only way a
  // falling ledge is ever taken.
  ...flumeRail("hubba-w", "ledge", 5.2, 99.4, 110.6, 1.14, 0.51, { parts: 2 }),
  // A bar across the run at an angle, so it is a thing you line up for.
  flumeBar("ledge-run-bar", -6.6, 104, -1.2, 112, 0.5),

  // THE BOWL. Its island, its spine's own crest — a spine IS a coping — and
  // thirty metres of coping along each bank, which is the reward for carrying
  // enough speed up a 46° wall to get to it.
  ...flumeRail("bowl-island-e", "ledge", 2.4, 134, 139.6, 0.55, 0.55, { parts: 1 }),
  ...flumeRail("bowl-island-w", "ledge", -2.4, 134, 139.6, 0.55, 0.55, { parts: 1 }),
  {
    id: "spine-coping",
    a: new THREE.Vector3(centreX(145.5) - 9, floorY(145.5) + 1.6, 145.5),
    b: new THREE.Vector3(centreX(145.5) + 9, floorY(145.5) + 1.6, 145.5),
    kind: "ledge",
    surface: CONCRETE,
    radius: 0.38,
  },
  ...copingRail("bowl-coping-w", -1, 132, 166, 5),
  ...copingRail("bowl-coping-e", 1, 134, 166, 5),

  // THE LONG STRAIGHT: the piers' plinths, the service pipe along the east
  // toe, and the barriers you weave on the way to the second drop.
  ...flumeRail("plinth-w", "ledge", -6.0, 253.4, 258.6, 0.62, 0.62, { parts: 1 }),
  ...flumeRail("plinth-e", "ledge", 6.0, 253.4, 258.6, 0.62, 0.62, { parts: 1 }),
  ...flumeRail("service-pipe", "rail", 7.6, 242, 264, 0.42, 0.42, { parts: 3, radius: 0.3 }),
  ...flumeRail("barrier-w-e", "ledge", -4.6, 266.4, 271.6, 0.6, 0.6, { parts: 1 }),
  ...flumeRail("barrier-e-w", "ledge", 4.6, 269.4, 274.6, 0.6, 0.6, { parts: 1 }),

  // The shelf's outer edge, the whole eleven metres of it.
  ...flumeRail("shelf-e", "ledge", -3.0, 302, 312.6, 0.7, 0.7, { parts: 2 }),
  // …and the maintenance handrail along the last chute's east apron, which is
  // where you land out of the second drop still carrying everything it gave you
  // and the only thing left to spend it on is height.
  ...apronRail("apron-rail-e", 1, 288, 314, 4),

  // The outfall: the pad you land the finale on, and a last bar across the
  // apron for a line that has nowhere else to go.
  ...flumeRail("outfall-pad-w", "ledge", 3.0, 348, 357.6, 0.6, 0.6, { parts: 2 }),
  flumeBar("outfall-bar", -9, 368, -9, 382, 0.5),
];

// ---------------------------------------------------------------------------
// the clutter, and its colliders
// ---------------------------------------------------------------------------

/**
 * What the water left, placed here rather than in the dressing — for exactly
 * the reason map 1 moved its own placements next to its architecture: a drum
 * you can ride through is broken, and the only way the model and the thing that
 * stops you can never disagree is for both of them to be generated from ONE
 * list. `dressing.ts` builds the meshes from this; `FURNITURE` below turns the
 * same entries into colliders the ride asks about.
 */
export interface PropPlacement {
  id: ClutterId;
  /** Across the channel. A walkway placement is written with `deckU`. */
  u: number;
  s: number;
  yaw: number;
  seed: number;
}

/** The middle of a walkway at this station, `inset` metres in from the fence. */
export function deckU(s: number, side: 1 | -1, inset = 1.6): number {
  const sec = makeSection();
  const m = marksOf(sectionAt(s, sec), makeMarks());
  return side * (m.deck - inset);
}

/** …and a point on the freeboard apron, `inset` metres in from the parapet. */
export function apronU(s: number, side: 1 | -1, inset = 1.2): number {
  const sec = makeSection();
  const m = marksOf(sectionAt(s, sec), makeMarks());
  return side * (m.apron - inset);
}

/**
 * Where it all is.
 *
 * ONE rule, and it is the file's own first rule wearing a different hat:
 * **nothing with a collider stands anywhere a carve can deliver you.** The
 * racing line is the floor and the carving line is the two transitions, so
 * everything that can stop a board sits either on the WALKWAY, behind the
 * parapet, or on the FREEBOARD APRON above the bank's crest — which is where a
 * flood actually strands a drum, and which costs 8 m/s of climb to reach, so
 * anybody who meets one up there arrived slowly and on purpose. What goes in
 * the channel itself is `trolley` and `tyre`, and those two carry no collider
 * at all: you ride through them, which is why they are allowed to be in the
 * one place a real ditch would put them.
 */
export const PROPS: readonly PropPlacement[] = [
  // --- the headworks, and the walkways down the east bank -------------------
  { id: "sign", u: deckU(-20, 1), s: -20, yaw: Math.PI, seed: 3 },
  { id: "drum", u: deckU(-9, 1, 1.2), s: -9, yaw: 0.4, seed: 11 },
  { id: "pallets", u: deckU(-4, 1, 1.4), s: -4, yaw: 0.2, seed: 12 },
  { id: "sign", u: deckU(120, 1), s: 120, yaw: Math.PI, seed: 7 },
  { id: "barrier", u: deckU(150, 1, 2.0), s: 150, yaw: Math.PI / 2, seed: 2 },
  { id: "drum", u: deckU(228, 1, 1.2), s: 228, yaw: 1.1, seed: 4 },
  { id: "sign", u: deckU(250, 1), s: 250, yaw: Math.PI, seed: 9 },
  { id: "pallets", u: deckU(300, 1, 1.4), s: 300, yaw: 2.4, seed: 8 },
  { id: "drum", u: deckU(354, 1, 1.2), s: 354, yaw: 0.7, seed: 1 },
  // --- the west walkway, against the rock cut -------------------------------
  { id: "barrier", u: deckU(88, -1, 2.0), s: 88, yaw: Math.PI / 2, seed: 14 },
  { id: "sign", u: deckU(192, -1), s: 192, yaw: 0, seed: 15 },
  { id: "pallets", u: deckU(268, -1, 1.4), s: 268, yaw: 0.4, seed: 16 },
  { id: "drum", u: deckU(340, -1, 1.2), s: 340, yaw: 2.6, seed: 17 },
  // --- on the freeboard aprons, where a flood strands things ----------------
  { id: "drum", u: apronU(128, 1), s: 128, yaw: 1.1, seed: 32 },
  { id: "pallets", u: apronU(164, 1, 1.8), s: 164, yaw: 0.8, seed: 33 },
  { id: "drum", u: apronU(242, 1, 1.4), s: 242, yaw: 0.6, seed: 35 },
  { id: "barrier", u: apronU(338, -1, 1.6), s: 338, yaw: 1.5, seed: 36 },
  { id: "pallets", u: apronU(366, 1, 1.6), s: 366, yaw: 0.2, seed: 37 },
  // --- in the channel: scenery only, and every one of these is rideable-through
  { id: "trolley", u: -5.6, s: 58, yaw: 0.3, seed: 31 },
  { id: "tyre", u: 5.4, s: 76, yaw: 1.4, seed: 41 },
  { id: "tyre", u: -7.6, s: 136, yaw: 0.2, seed: 42 },
  { id: "trolley", u: -8.2, s: 176, yaw: 2.2, seed: 34 },
  { id: "tyre", u: -6.4, s: 248, yaw: 2.9, seed: 43 },
  { id: "trolley", u: -11.4, s: 384, yaw: 0.9, seed: 38 },
  { id: "tyre", u: 9.6, s: 392, yaw: 1.7, seed: 44 },
];

/**
 * …and the same list as matter. Sized off the catalogue's own `block`, turned
 * by the placement's own yaw and taken as the box that turn sweeps: a prop
 * whose collider grew when you rotated it would be a wall wider than the thing
 * you can see, and one that did not would be a corner you ride through.
 */
export const FURNITURE: readonly Feature[] = PROPS.flatMap((p) => {
  const c = CLUTTER[p.id].block;
  if (!c) return [];
  const cos = Math.abs(Math.cos(p.yaw));
  const sin = Math.abs(Math.sin(p.yaw));
  const hu = c.hx * cos + c.hz * sin;
  const hs = c.hx * sin + c.hz * cos;
  return [
    block(
      `prop-${p.id}-${p.seed}`,
      { s0: p.s - hs, s1: p.s + hs, u0: p.u - hu, u1: p.u + hu },
      c.top,
      { look: "steel", rows: 1, cols: 1 },
    ),
  ];
});

// ---------------------------------------------------------------------------
// what the map hands the dressing lane
// ---------------------------------------------------------------------------

/** Everything the ride can hit: what is built, plus the furniture standing on it. */
export const FEATURES: readonly Feature[] = [...BUILT, ...FURNITURE];

/**
 * The concrete at a flume point, for anything that has to be stood on it.
 *
 * Asked of `BUILT` and never of `FEATURES`, which is the order that terminates:
 * a prop resolved against the full list would be standing on its own collider,
 * which map 1 had to work out the same way round.
 */
export function standOn(u: number, s: number): number {
  let best = flumeSurfaceY(u, s);
  for (const f of BUILT) {
    if (s < f.s0 || s > f.s1 || u < f.u0 || u > f.u1) continue;
    const base = f.base === "floor" ? floorY(s) : flumeSurfaceY(u, s);
    const top = base + f.h((s - f.s0) / (f.s1 - f.s0), (u - f.u0) / (f.u1 - f.u0));
    // The buildings are the bound, not a shelf — nothing is ever stood on a
    // bridge pier or on the debris screen.
    if (top > best && top - flumeSurfaceY(u, s) < 2.5) best = top;
  }
  return best;
}
