// The air, the grab, and the held moves — `node tools/anim-check.mjs`
//
// Third of the animation lane's harnesses, beside `tools/hold-check.mjs` (what
// a held shape LOOKS like) and `tools/stance-check.mjs` (which way round he is).
// This one asks the two questions the ticket's items 5 and 10 are made of:
//
//   · **is he in the air properly** — does a big air fold him while a small hop
//     is left alone, and does a landing from height read as an impact
//   · **does the grab actually touch the board** — which on this rig is not a
//     question about his arm at all, it is a question about his KNEES
//   · **do the generated takes reach the body** — the manual, the 50-50 and the
//     boardslide, each measured with its take loaded and without it, from the
//     real URL, with nothing substituted; and the GRAB, whose take was dropped
//     for folding him over his own knees instead of onto the deck (THE TAKES)
//
// Everything is measured on the REAL `SkaterAnim` over the REAL rig, stepped at
// 1/60 with no renderer, in the board's own frame — the same instrument its two
// sisters use, so a number here is comparable with a number there.
//
// THE DECK, and why every distance in here is quoted against the soles: the rig
// stands the board on the skater's soles rather than at a fixed height, and in
// the AIR it hangs `AIR_SOLE_CLEARANCE` = 10 cm below the point this file calls
// the sole (the middle of ankle→toe, which is inside the shoe). So the deck's
// top face is at −10 cm on every scale printed below, and "the hand is on the
// board" means the hand is near −10, not near 0.
//
// HOW IT MEASURES, which is the whole reason it can say anything at all: the
// ollie take already pulls his knees up in the air, so "his hips are low" says
// nothing about whether this layer did anything. Every case here therefore runs
// the SAME air twice — once with the shape's own numbers zeroed and once with
// them shipped — and asserts the difference. `AIR_SHAPE`, `IMPACT_SHAPE` and
// `POSTURES` are exported for exactly this, the way `POSTURES` always was.
//
// Every assertion carries the break it was WATCHED FAILING against. An
// assertion nobody has watched fail is a guess, and this project has shipped
// 43/43 green over a broken feature three times (DESIGN.md, 2026-07-27).
//
// One check in here is a DOOR TEST and says so in its own name: the full-clip
// slot is filled with a stand-in, because no held move has a full-body clip and
// the four that were generated are used from the waist up instead. It proves the
// hinge and nothing about the room, and it is not what THE FOUR TAKES rests on.

globalThis.self ??= globalThis;
globalThis.URL.createObjectURL ??= () => "blob:anim-check";
globalThis.URL.revokeObjectURL ??= () => {};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
globalThis.ProgressEvent ??= class {
  constructor(type, init = {}) {
    Object.assign(this, { type }, init);
  }
};

import * as THREE from "three";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (specifier.startsWith(".")) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
const { SkaterAnim, HAND_CLIPS, POSTURES, CROUCH_HAND_CLIP } = await import(
  "../src/skate/skater-anim.ts"
);
const { POSE_TAKES } = await import("../src/skate/anim/pose-take.ts");
const { AIR_SHAPE, AIR_STANCE, IMPACT_SHAPE, AIR_LOW, AIR_HIGH, STANCE_ON: STANCE_ON_S } = await import(
  "../src/skate/anim/air.ts"
);

const SKATER_URL =
  "https://assets.auras.cc/generations/cms0fbiar004o22nuyjqjhzuz/rigged-character.glb";
const SKATER_YAW = -Math.PI / 2;
const DT = 1 / 60;
/** `SkaterRig`'s `AIR_SOLE_CLEARANCE` — the deck hangs this far below the soles. */
const AIR_DECK_DROP = 10;
/** The two airs the real ride produces, in seconds of hang (see `anim/air.ts`). */
const OLLIE_HANG = 0.86;
const QP_HANG = 1.6;

const root = new URL("../public/", import.meta.url).pathname;
const types = { ".json": "application/json", ".glb": "model/gltf-binary" };
const server = createServer(async (req, res) => {
  try {
    const path = join(root, normalize(decodeURIComponent(req.url.split("?")[0])));
    const body = await readFile(path);
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const abs = (u) => (u.startsWith("http") ? u : `${origin}/${u.replace(/^\.\//, "")}`);

const anim = await SkaterAnim.create(SKATER_URL, `${origin}/motion-sets/skate.json`);
const table = Object.fromEntries(
  Object.entries(HAND_CLIPS).map(([k, v]) => [k, { ...v, url: abs(v.url) }]),
);
// No takes yet: everything down to THE FOUR TAKES is measured on the body the
// posture table alone builds, so that section can difference against it.
console.log(`clips bound: ${(await anim.attachHandClips(table, {})).join(", ")}`);

const board = new THREE.Group();
anim.model.rotation.y = SKATER_YAW;
board.add(anim.model);

const bones = new Map();
anim.model.traverse((o) => o.name && bones.set(o.name, o));
const inv = new THREE.Matrix4();
const v = new THREE.Vector3();
const step = () => {
  anim.update(DT);
  board.updateMatrixWorld(true);
};

/** Where a bone is, in the board's frame: +Z the nose, +X across the deck. */
const at = (name) => {
  inv.copy(board.matrixWorld).invert();
  return v.setFromMatrixPosition(bones.get(name).matrixWorld).applyMatrix4(inv).clone();
};
const sole = (side) => at(`${side}Foot`).add(at(`${side}ToeBase`)).multiplyScalar(0.5);
const feet = () => sole("Left").add(sole("Right")).multiplyScalar(0.5);
const cm = (a, b) => (a.y - b.y) * 100;

/**
 * His own LEFT, read off the hip line the way `SkaterAnim` reads it — not the
 * board's +X. He stands ACROSS the deck, and after a half-turn into switch he
 * stands across it the other way, so an axis taken from the board would measure
 * a spread along his own line half the time.
 */
const across = () => at("LeftUpLeg").sub(at("RightUpLeg")).normalize();
/** How far two bones are apart ACROSS his body, cm — the axis "spread" means. */
const apart = (a, b) => at(a).sub(at(b)).dot(across()) * 100;

let pass = 0;
let fail = 0;
let unproven = 0;
function check(label, ok, detail, watched) {
  if (ok) pass++;
  else fail++;
  if (!watched) unproven++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}\n        ${detail}\n        ` +
      (watched ? `watched failing: ${watched}` : "UNPROVEN"),
  );
}

const settle = (n = 180) => {
  anim.holdTrick(null);
  anim.endCharge();
  anim.setAir(false);
  for (let i = 0; i < n; i++) step();
};

/** Runs `fn` with some of a shape table's numbers replaced, then puts them back. */
function withShape(table, values, fn) {
  const saved = { ...table };
  Object.assign(table, values);
  try {
    return fn();
  } finally {
    Object.assign(table, saved);
  }
}

/**
 * One air, the way the ride announces it: a pop carrying the hang time it
 * bought, then frames, then the landing with whatever the legs could not take.
 * Returns both traces, because the questions are "what did he do up there" and
 * "what did it look like when he arrived".
 */
function fly({ hang, seconds = null, trick = "Ollie", grabAt = null, slam = 0 }) {
  settle();
  const trace = [];
  anim.playTrick(trick, hang);
  const n = Math.round((seconds ?? hang) / DT);
  for (let i = 0; i < n; i++) {
    if (grabAt !== null && Math.abs(i * DT - grabAt) < DT / 2) anim.holdTrick("Grab");
    step();
    const f = feet();
    trace.push({
      t: i * DT,
      stand: cm(at("Hips"), f),
      hand: at("RightHand").clone(),
      handAbove: cm(at("RightHand"), f),
      spread: at("LeftHand").distanceTo(at("RightHand")) * 100,
      // Hand to hand ACROSS him, and the same for the elbows. Straight-line
      // hand distance is the wrong instrument for an ollie: one arm is thrown
      // forward and the other back, so most of the 130 cm it reports is fore
      // and aft and it moves when nothing about the spread has. The elbow is
      // the honest one of the two — it is the bone hanging off the joint this
      // layer actually turns, so nothing the clip does to a forearm gets in
      // between the turn and the number.
      wideAcross: apart("LeftHand", "RightHand"),
      elbows: apart("LeftForeArm", "RightForeArm"),
    });
  }
  const land = [];
  anim.holdTrick(null);
  anim.playCushion(slam);
  for (let i = 0; i < Math.round(0.8 / DT); i++) {
    step();
    const f = feet();
    const torso = at("neck").sub(at("Hips"));
    land.push({
      t: i * DT,
      stand: cm(at("Hips"), f),
      spread: at("LeftHand").distanceTo(at("RightHand")) * 100,
      // Off vertical in the rider's OWN sagittal plane, which is across the
      // deck: he stands sideways on the board, so folding over his own knees
      // moves his chest along the board's ±X and not along its length. Reading
      // it in z — where a lean over the tail lives — cannot see this fold at
      // all, and said 0.0° against a body that had moved 8°.
      pitch: (Math.atan2(torso.x, torso.y) * 180) / Math.PI,
    });
  }
  return { trace, land };
}

const low = (t) => Math.min(...t.map((f) => f.stand));
const wide = (t) => Math.max(...t.map((f) => f.spread));
const OFF = { tuck: 0, fold: 0, spread: 0 };

// =============================================================================
console.log(`\nAIR POSE  — "in the air he crouches deeper and spreads his arms`);
console.log(`            slightly, FOR WHEN HE'S FLYING HIGH"\n`);

settle();
const standing = { stand: cm(at("Hips"), feet()), spread: at("LeftHand").distanceTo(at("RightHand")) * 100 };
const hopBare = withShape(AIR_SHAPE, OFF, () => fly({ hang: OLLIE_HANG }));
const hop = fly({ hang: OLLIE_HANG });
const bigBare = withShape(AIR_SHAPE, OFF, () => fly({ hang: QP_HANG }));
const big = fly({ hang: QP_HANG });

console.log(
  `  rolling stance: hips ${standing.stand.toFixed(1)} cm above the soles, ` +
    `hands ${standing.spread.toFixed(1)} cm apart`,
);
console.log(
  `  flat ollie   (${OLLIE_HANG} s): hips to ${low(hopBare.trace).toFixed(1)} cm on the take ` +
    `alone, ${low(hop.trace).toFixed(1)} cm with the air shape on top`,
);
console.log(
  `  QP air       (${QP_HANG} s): hips to ${low(bigBare.trace).toFixed(1)} cm on the take ` +
    `alone, ${low(big.trace).toFixed(1)} cm with the air shape on top`,
);

check(
  "a big air pulls the knees up — the soles come at least 10 cm nearer his hips",
  low(bigBare.trace) - low(big.trace) > 10,
  `the shape is worth ${(low(bigBare.trace) - low(big.trace)).toFixed(1)} cm on top of ` +
    `the ollie take's own tuck`,
  "AIR_SHAPE.tuck/fold zeroed — which is what the `bare` run in this file IS, " +
    "and the difference collapses to 0.0 cm",
);
check(
  "…and an ordinary hop is left alone — the player's own condition",
  Math.abs(low(hopBare.trace) - low(hop.trace)) < 1.5,
  `${OLLIE_HANG} s of air moved him ${Math.abs(low(hopBare.trace) - low(hop.trace)).toFixed(1)} cm ` +
    `(AIR_LOW is ${AIR_LOW} s and the flat ollie is ${OLLIE_HANG} s of hang)`,
  `AIR_LOW dropped under the ollie's own hang time — at 0.5 s the same hop folds ` +
    `a further 5.1 cm and every ollie in the game starts reading as a transition air`,
);
// The take moves the body on its own — that is what a take is — so "the worst
// single frame" says nothing about this layer until the take is subtracted from
// it. What is measured is the frame-to-frame change in the shape's OWN
// contribution: the same air with the numbers in and out, differenced.
// The leading zero is not decoration: before the pop the shape contributes
// nothing, and without it the very first frame of the air has no `before` to be
// differenced against — which is exactly the frame a snap would land on. Watched
// hiding one: with the ramp replaced by a straight assignment the whole 20 cm
// arrived on frame 0 and this read 1.45 cm and passed.
const own = [0, ...big.trace.map((f, i) => f.stand - bigBare.trace[i].stand)];
const worstOwn = Math.max(...own.slice(1).map((d, i) => Math.abs(d - own[i])));
check(
  "the shape does not arrive in one frame",
  worstOwn < 0.2 * (low(bigBare.trace) - low(big.trace)),
  `the shape's own worst single-frame move is ${worstOwn.toFixed(2)} cm — ` +
    `${((100 * worstOwn) / (low(bigBare.trace) - low(big.trace))).toFixed(0)}% of the ` +
    `${(low(bigBare.trace) - low(big.trace)).toFixed(1)} cm it is worth in all`,
  "AIR_ON/AIR_OFF replaced by a straight assignment (span = 1e-9) → 11.90 cm, " +
    "59% of the move, on the frame the pop is announced",
);

// THE ARMS, ON THE AIR THE PLAYER ACTUALLY TAKES — which is a POPPED one, and
// is therefore an air with the hand-authored ollie playing over it.
//
// This is the half of the player's ask that reached nothing for two rounds, and
// the reason it hid is that the only measurement of it was taken on the coasted
// air below, where the arms are hanging at his sides and there is a whole
// quadrant of arc to open into. Up on a popped air there is not: the take
// carries his upper arms to 113° and 109° of ABDUCTION at the top — past
// sideways, on their way overhead — and 16° further round the same way closed
// his hands over his head instead of opening them.
//
// So the shape is measured here per FRAME rather than at its widest moment, and
// against the elbow as well as the hand: `wide()` takes a maximum over the whole
// flight, and a maximum cannot see a shape that opens him at one moment and
// closes him at another. See `apart` for why the elbow is the honest bone.
const armDelta = (bare, on, key) => on.map((f, i) => f[key] - bare[i][key]);
const elbowOwn = armDelta(bigBare.trace, big.trace, "elbows");
const handOwn = armDelta(bigBare.trace, big.trace, "wideAcross");
const mean = (l) => l.reduce((a, b) => a + b, 0) / l.length;
console.log(
  `  QP air, the arms: elbows ${Math.min(...elbowOwn).toFixed(1)} → ` +
    `${Math.max(...elbowOwn).toFixed(1)} cm of change per frame (mean ` +
    `${mean(elbowOwn).toFixed(1)}), hands ${Math.min(...handOwn).toFixed(1)} → ` +
    `${Math.max(...handOwn).toFixed(1)} (mean ${mean(handOwn).toFixed(1)})`,
);
check(
  "the shape never CLOSES his arms on a popped air — not on one frame of it",
  Math.min(...elbowOwn) > -0.5,
  `the worst frame of the whole flight is ${Math.min(...elbowOwn).toFixed(1)} cm of elbow ` +
    `against the take alone, and the hands' worst is ${Math.min(...handOwn).toFixed(1)} cm`,
  "the turn put back to the blind `side * spread` it was before this round — the " +
    "elbows come IN 7.5 cm on the worst frame and 1.7 cm on average, the hands in " +
    "8.6 cm, and the whole flight nets out at -0.1 cm of hand: the shape subtracting " +
    "from the clip it is laid on",
);
check(
  "…and it holds them out where the clip lets them drop",
  Math.max(...handOwn) > 6 && mean(handOwn) > 1,
  `worth up to ${Math.max(...handOwn).toFixed(1)} cm of hand span and ` +
    `${mean(handOwn).toFixed(1)} cm across the flight — the take swings his arms up and ` +
    `then lets them fall back down as it runs out (113° of abduction at the top, 67° by ` +
    `the last frame), and this is what keeps them out through the whole air. It is a ` +
    `SMALL number on purpose: the ollie take already holds his hands 130 cm apart up ` +
    `there, so what was left to do was stop the shape undoing it`,
  "the blind turn, as above → 14.3 cm at best but -0.1 cm across the flight, which " +
    "is a maximum-only measure passing over a shape that closes him for most of the air",
);

// THE AIR NOBODY ANNOUNCES. Rolling off the quarter pipe's lip at 20 m/s is
// 1.77 s of air and 5.66 m up with no `onPop` in it at all, so there is no
// trick clip either — he flies in the rolling stance. That is the air the
// spread is really for, and `setAir` is the door it comes through.
//
// EVERY CHECK BELOW OPENS THAT DOOR ITSELF, on the line marked, and says DOOR
// TEST in its own name for it. They prove the layer and nothing about the
// wiring; what proves the wiring is the check after them, which reads
// `src/main.ts` off the disk.
function coast(hang, seconds) {
  settle();
  const trace = [];
  anim.setAir(true, hang); // ← THE DOOR, held open by the harness and by nothing else
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    step();
    const f = feet();
    trace.push({
      stand: cm(at("Hips"), f),
      spread: at("LeftHand").distanceTo(at("RightHand")) * 100,
      wideAcross: apart("LeftHand", "RightHand"),
      elbows: apart("LeftForeArm", "RightForeArm"),
    });
  }
  anim.setAir(false);
  return trace;
}
// THREE runs rather than two, since 2026-07-30: the coasted air is now the one
// air where BOTH layers are live, so a bare run that zeroes only `AIR_SHAPE`
// measures the big-air shape's margin over a body the flight stance has already
// folded, not the layer. Watched it happen — this check went from 12.4 cm to 7.0
// and red the moment `AIR_STANCE` shipped, with nothing about `AIR_SHAPE` having
// changed. So `coastBare` is now the air layer switched OFF ENTIRELY, which is
// what the claim was always about, and the middle run keeps the interaction
// visible instead of averaged away.
const coastBare = withShape(AIR_SHAPE, OFF, () =>
  withShape(AIR_STANCE, OFF, () => coast(1.77, 1.2)),
);
const coastStance = withShape(AIR_SHAPE, OFF, () => coast(1.77, 1.2));
const coasted = coast(1.77, 1.2);
console.log(
  `  coasted off the lip (1.77 s, no pop, no trick clip): hips ` +
    `${low(coastBare).toFixed(1)} → ${low(coastStance).toFixed(1)} cm on the flight stance ` +
    `→ ${low(coasted).toFixed(1)} cm as the air proves itself long, hands ` +
    `${wide(coastBare).toFixed(1)} → ${wide(coasted).toFixed(1)} cm apart`,
);
check(
  "an air with no pop in it flies too, once something says he is up there (DOOR TEST)",
  // The growth clause was `> 4` cm and is now `> 1`, and that is a WEAKENING, not a
  // correction — say so rather than let a passing check imply nothing changed.
  // Round two doubled `AIR_STANCE` because the player could not see the shipped
  // one, and the two layers are merged by `max()`, so every centimetre the launch
  // pose gained came out of the growth: 7.0 cm of "deepens as the air proves itself
  // long" is now 1.4. That was a deliberate trade and it is written up at
  // `AIR_STANCE`.
  // What this clause still buys, and the only thing it now claims, is that the
  // size-driven shape is not DEAD: its watched failure is `AIR_SHAPE` zeroed, which
  // measures 0.0 cm of growth, and `> 1` still catches that. If it ever needs to
  // mean more than "not zero" again, raise `AIR_SHAPE` — not this bar.
  low(coastBare) - low(coasted) > 10 && low(coastStance) - low(coasted) > 1,
  `the air layer is worth ${(low(coastBare) - low(coasted)).toFixed(1)} cm of knee over the ` +
    `rolling stance he would otherwise stand up in — with THIS FILE holding the door open. ` +
    `${(low(coastBare) - low(coastStance)).toFixed(1)} cm of it is the flight stance, on from ` +
    `the launch, and the size-driven shape still grows ` +
    `${(low(coastStance) - low(coasted)).toFixed(1)} cm out of it as the air proves itself long`,
  "AIR_SHAPE.tuck/fold AND AIR_STANCE zeroed — the `bare` run — and it collapses to " +
    "0.0 cm. Watched the second clause fail on its own with AIR_SHAPE zeroed and the " +
    "stance left in: 0.0 cm of growth, an air that never deepens however long it lasts",
);
check(
  "…and the arms come out with it (DOOR TEST)",
  wide(coasted) - wide(coastBare) > 6,
  `hands ${wide(coastBare).toFixed(1)} → ${wide(coasted).toFixed(1)} cm apart. There is a ` +
    `whole quadrant of arc to open into on this one — his arms are at 9° and 12° of ` +
    `abduction in the rolling stance, against 113° up on a popped air — which is why ` +
    `this number is big and the popped air's is small`,
  "AIR_SHAPE.spread AND AIR_STANCE.spread zeroed → 0.0 cm; what is left is the " +
    "rolling stance's own arm swing",
);

// …AND THE DOOR ITSELF. The two checks above are the only ones in this file that
// drive a piece of the layer the GAME does not drive, so this is the one that
// asks whether the game drives it. Read off the disk rather than imported: what
// is being asked is whether a line of source exists, and importing `main.ts`
// would boot a renderer.
const mainSrc = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
// Comments stripped first, and that is not fussiness: a call described in a
// comment is exactly the shape this whole check exists to refuse. `src/skate/
// anim/air.ts` has carried the line in prose since round 2 and the game still
// flew with a rider standing up in it. (`https://` survives — the guard is a
// space or a line start before the slashes, and a URL has a colon there.)
const code = mainSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
const wired = /anim\s*\?\.\s*setAir\s*\(/.test(code);
check(
  "THE GAME opens that door — src/main.ts tells the body when it is airborne",
  wired,
  wired
    ? "`anim?.setAir(…)` is in the frame loop, so the two DOOR TESTs above are the " +
      "game's own path and not just this file's"
    : "src/main.ts contains no `anim?.setAir(`. `playTrick` (the pop) and `playCushion` " +
      "(the landing) are then the only callers in the whole repo, so the ONLY airs that " +
      "reach the body are the ones a pop announced — and the biggest air the spot " +
      "produces has no pop in it: rolling off the quarter pipe's lip is 1.6–1.7 s and " +
      "5 m up at every speed from 12 to 20 m/s, measured, with `onPop` never firing. " +
      "The fix is ONE LINE in the frame loop, anywhere before `anim?.update(…)`:\n" +
      "              anim?.setAir(skate.airborne);\n" +
      "        src/main.ts is not the animation lane's file, which is why this is a red " +
      "check and not a commit",
  "the shipped repo, right now — it is RED as written. Watched the other three ways " +
    "against the real file read into node and patched in memory (src/main.ts was not " +
    "edited): the line pasted into the frame loop → green · the same line as a `//` " +
    "comment → still red · as a `/* */` block → still red",
);

// =============================================================================
console.log(`\nLANDING IMPACT  — "landing from height reads as impact"\n`);

const soft = fly({ hang: OLLIE_HANG, slam: 0 });
const hard = fly({ hang: QP_HANG, slam: 7.6 });
const hardBare = withShape(IMPACT_SHAPE, { spread: 0, fold: 0 }, () =>
  fly({ hang: QP_HANG, slam: 7.6 }),
);
const deepest = (l) => Math.min(...l.map((f) => f.stand));
const folded = (l) => Math.max(...l.map((f) => f.pitch));
const armsOut = (l) => Math.max(...l.map((f) => f.spread));
console.log(
  `  ordinary landing (slam 0.0): fold to ${deepest(soft.land).toFixed(1)} cm, ` +
    `torso ${folded(soft.land).toFixed(1)}°, hands ${armsOut(soft.land).toFixed(1)} cm`,
);
console.log(
  `  the big one      (slam 7.6): fold to ${deepest(hard.land).toFixed(1)} cm, ` +
    `torso ${folded(hard.land).toFixed(1)}°, hands ${armsOut(hard.land).toFixed(1)} cm`,
);
check(
  "a landing from height folds him deeper than an ordinary one",
  deepest(soft.land) - deepest(hard.land) > 3,
  `${(deepest(soft.land) - deepest(hard.land)).toFixed(1)} cm deeper on the slam`,
  "playCushion's `bite` pinned to 0 → 0.2 cm, the two landings indistinguishable",
);
check(
  "…and it throws his arms and his torso, which the deeper squat alone does not",
  armsOut(hard.land) - armsOut(hardBare.land) > 3 &&
    folded(hard.land) - folded(hardBare.land) > 3,
  `the impact is worth ${(armsOut(hard.land) - armsOut(hardBare.land)).toFixed(1)} cm of arm ` +
    `and ${(folded(hard.land) - folded(hardBare.land)).toFixed(1)}° of torso over the same ` +
    `landing. The arm is the smaller half and always will be: the cushion take ` +
    `already holds his hands ${armsOut(hardBare.land).toFixed(0)} cm apart, so a shoulder ` +
    `turn on top of it is running out of arc`,
  "IMPACT_SHAPE zeroed — which is what the `bare` run in this file IS, and both " +
    "differences go to 0.0",
);
check(
  "the impact washes out — he stands back up rather than holding the fold",
  Math.abs(hard.land.at(-1).spread - hardBare.land.at(-1).spread) < 3,
  `0.8 s after touchdown, the landing with the impact in it and the one without ` +
    `are ${Math.abs(hard.land.at(-1).spread - hardBare.land.at(-1).spread).toFixed(1)} cm apart`,
  "IMPACT_SPAN raised to 20 s → 27.1 cm apart, the big landing still folded a " +
    "second later",
);

// =============================================================================
console.log(`\nTHE GRAB  — "grab in the air, and verify it actually works"\n`);

const grabBare = withShape(POSTURES.Grab, { tuck: 0, fold: 0 }, () =>
  fly({ hang: 1.2, seconds: 1.2, grabAt: 0.2 }),
);
const grab = fly({ hang: 1.2, seconds: 1.2, grabAt: 0.2 });
/**
 * How near the back hand ever came to the deck — the real distance to the real
 * plank, not a height difference. The deck is 21 cm wide and 96 cm long and it
 * hangs `AIR_DECK_DROP` below the soles in the air, so a hand beside the rail
 * is as far from the board as a hand above it, and only the pair of them
 * together is the question "is he holding it".
 */
const toDeck = (f) =>
  Math.hypot(
    Math.max(0, Math.abs(f.hand.x * 100) - 10.5),
    f.handAbove + AIR_DECK_DROP,
    Math.max(0, Math.abs(f.hand.z * 100) - 48),
  );
const nearest = (t) => Math.min(...t.map(toDeck));
const best = grab.trace.reduce((a, b) => (toDeck(b) < toDeck(a) ? b : a));
console.log(
  `  reaching down for it (no tuck): the hand stops ${nearest(grabBare.trace).toFixed(1)} cm ` +
    `off the griptape — the shipped round-2 pose`,
);
console.log(
  `  pulling it up to him:           ${nearest(grab.trace).toFixed(1)} cm off it, ` +
    `hand ${best.handAbove.toFixed(1)} cm above the soles`,
);
console.log(
  `  and it is over the board: ${(best.hand.x * 100).toFixed(1)} cm off the centre line, ` +
    `${(best.hand.z * 100).toFixed(1)} cm along the deck (the deck is ±48 cm end to end)`,
);
check(
  "the grab puts the hand ON the board, not 40-odd cm off it",
  nearest(grab.trace) < 12,
  `nearest approach ${nearest(grab.trace).toFixed(1)} cm, against ` +
    `${nearest(grabBare.trace).toFixed(1)} cm reaching down for it`,
  "POSTURES.Grab.tuck/fold zeroed — the `bare` run above — which is the round-2 " +
    "number this replaces, at 54.0 cm. Watched red a second way, with the tuck " +
    "left in and `reach` pushed to 60°: the arm swings past the rail and the same " +
    "measure goes to 23.6 cm",
);
check(
  "the board comes UP to him — the tuck is what closes the gap",
  low(grabBare.trace) - low(grab.trace) > 20,
  `the tuck brings the soles ${(low(grabBare.trace) - low(grab.trace)).toFixed(1)} cm nearer ` +
    `his hips; the arm is worth ${(nearest(grabBare.trace) - nearest(grab.trace)).toFixed(1)} cm ` +
    `less than that on its own`,
  "same break as above; with the tuck out the soles do not move at all",
);

// =============================================================================
console.log(`\nTHE HELD MOVES  — one clip slot each, and what happens until they land\n`);

// A tuck below the hips is only safe in the air, where the board rides the feet
// (`Posture.tuck`). The grab is the only air-held move, so it has to be the only
// posture carrying one: on the ground the same numbers drive the deck up through
// the rider instead of bringing it to his hand.
const grounded = Object.entries(POSTURES).filter(
  ([name, p]) => name !== "Grab" && ((p.tuck ?? 0) !== 0 || (p.fold ?? 0) !== 0),
);
check(
  "only the air-held move carries a leg tuck",
  grounded.length === 0,
  grounded.length === 0
    ? "Grab is the only posture with tuck/fold, and the trick book has it where: air"
    : `${grounded.map(([n]) => n).join(", ")} carry one and are ridden on the ground`,
  "a tuck copied onto POSTURES.Manual → red, and the same manual then stands him " +
    "5.9 cm further along the deck (−32.8 → −26.9 cm from its middle), which is " +
    "the board being driven up through his feet on the ground",
);

// =============================================================================
// THE TAKES — "generate the missing animations … and verify it actually works".
// Four were generated for the four moves the player named, and they are
// `character animate` motion: a performer with no board. So they are used from
// the WAIST UP over the stance the rig stands him in, and the moves that have a
// fact about the BOARD living up there keep it (`PoseTake.owns`).
//
// THREE of the four are wired. The grab's is not, and the grab is still measured
// here beside them: its two columns coming out IDENTICAL with the takes attached
// is what proves it, and the row is where anybody looking for the fourth take
// finds out what happened to it.
//
// Every case here is the same A/B the air section uses: the move measured with
// no take loaded, then the real take fetched from its real URL and the move
// measured again. Nothing is substituted, and the difference is the take.
console.log(`\nTHE TAKES  — three of the four generated for the four moves he named\n`);

const q = new THREE.Quaternion();
const bq = new THREE.Quaternion();
const facing = () => {
  bones.get("Hips").getWorldQuaternion(q);
  board.getWorldQuaternion(bq);
  q.premultiply(bq.invert());
  return (2 * Math.atan2(q.y, q.w) * 180) / Math.PI;
};
/** The short way round, for a facing measured either side of the deck. */
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/** One held move, read in the board's frame. */
function held(trick, fakie = false, frames = 60) {
  settle();
  anim.setFakie(fakie);
  anim.holdTrick(trick);
  for (let i = 0; i < frames; i++) step();
  const f = feet();
  const torso = at("neck").sub(at("Hips"));
  const out = {
    stand: cm(at("Hips"), f),
    spread: at("LeftHand").distanceTo(at("RightHand")) * 100,
    // over the TAIL, which is where a manual's weight goes (nose is +z)
    lean: (Math.atan2(-torso.z, torso.y) * 180) / Math.PI,
    // …and across the DECK, which is the axis a rider standing sideways folds
    // over his own board on — the grab's fold lives here and not in `lean`.
    tip: (Math.atan2(torso.x, torso.y) * 180) / Math.PI,
    footZ: Math.abs(sole("Left").z - sole("Right").z) * 100,
    facing: facing(),
  };
  anim.holdTrick(null);
  anim.setFakie(false);
  return out;
}

const MOVES = ["50-50", "Boardslide", "Manual", "Grab"];
const bare = Object.fromEntries(MOVES.map((t) => [t, held(t)]));
const rollingHeld = (() => {
  settle();
  const torso = at("neck").sub(at("Hips"));
  return {
    stand: cm(at("Hips"), feet()),
    spread: at("LeftHand").distanceTo(at("RightHand")) * 100,
    lean: (Math.atan2(-torso.z, torso.y) * 180) / Math.PI,
  };
})();
const landed = await anim.attachPoseTakes(POSE_TAKES);
const withTake = Object.fromEntries(MOVES.map((t) => [t, held(t)]));
for (const t of MOVES) {
  console.log(
    `  ${t.padEnd(11)} hands ${bare[t].spread.toFixed(1)} → ${withTake[t].spread.toFixed(1)} cm · ` +
      `over the tail ${bare[t].lean.toFixed(1)} → ${withTake[t].lean.toFixed(1)}° · ` +
      `over the deck ${bare[t].tip.toFixed(1)} → ${withTake[t].tip.toFixed(1)}° · ` +
      `soles ${bare[t].footZ.toFixed(1)} → ${withTake[t].footZ.toFixed(1)} cm apart`,
  );
}

check(
  "the three takes load and reach the body — the arms, on the moves that have one",
  landed.length === 3 &&
    withTake["50-50"].spread - bare["50-50"].spread > 25 &&
    withTake.Boardslide.spread - bare.Boardslide.spread > 20 &&
    withTake.Manual.spread - bare.Manual.spread > 25,
  `${landed.length}/3 landed · the arms open ` +
    `${(withTake["50-50"].spread - bare["50-50"].spread).toFixed(1)} cm on the 50-50, ` +
    `${(withTake.Boardslide.spread - bare.Boardslide.spread).toFixed(1)} on the boardslide, ` +
    `${(withTake.Manual.spread - bare.Manual.spread).toFixed(1)} on the manual`,
  "`holdTake(dt)` commented out of `update` — the takes still load and still " +
    "bind, and nothing of them reaches the body: the arms go the WRONG WAY, to " +
    "58.6 / 58.5 / 42.6 cm, because `holdPosture` has already stood down for a " +
    "take that is no longer being applied",
);

// …and the fourth take is deliberately not one of them. The grab's generated
// take is a performer with no board crouching to pick something up, and its
// upper half is the one thing a boardless performance cannot carry: where a hand
// lands on a plank. Measured with it on, it slid the grabbing hand off the rail
// to the deck's centre line, dropped the FREE hand onto the nose, and folded him
// 6.6° further toward the nose AND 8.9° further across the deck at once — the
// diagonal the player named ("it works crookedly"). `anim/pose-take.ts` carries
// the whole table. This asserts the move has NO take rather than that some
// number came out well, because "a take is loaded and it is the wrong half of a
// body" is exactly the state that read green here for a round.
check(
  "…and the grab is riding no take at all — its half a body was the wrong half",
  !landed.includes("Grab") && POSE_TAKES.Grab === undefined,
  landed.includes("Grab")
    ? "a take loaded for the grab"
    : `takes landed: ${landed.join(", ")} — POSE_TAKES has no Grab entry, so the ` +
      `move is POSTURES.Grab's from the waist up as well as below it`,
  "the old entry put back verbatim (`start: 0.45, end: 2.6, span: 0.9, owns: " +
    '"torso"`) → red here, and the grab check below goes red with it: the hand ' +
    "leaves the toe-side rail for x = +1.8 cm, the deck's own centre line",
);

// The whole reason a take is only half a body: the board is stood on his soles,
// so a take that moves his feet moves the deck. The legs are the stance's and
// the parked crouch's, and they have to come out IDENTICAL.
const footMoved = Math.max(...MOVES.map((t) => Math.abs(withTake[t].footZ - bare[t].footZ)));
const standMoved = Math.max(...MOVES.map((t) => Math.abs(withTake[t].stand - bare[t].stand)));
check(
  "…and not one of them moves his feet — the take stops at the waist",
  footMoved < 0.5 && standMoved < 0.5,
  `worst change across the four: ${footMoved.toFixed(2)} cm of sole spacing and ` +
    `${standMoved.toFixed(2)} cm of standing height, against arms that moved ` +
    `${(withTake.Manual.spread - bare.Manual.spread).toFixed(0)} cm`,
  "`WAIST_ROOTS` pointed at `Hips`, which is the mask taken one bone too far " +
    "down — 12.53 cm of sole spacing and 11.76 cm of standing height move, and " +
    "the grab take stands him with his soles 17.4 cm apart instead of 29.4, both " +
    "feet in one place with the deck hanging off them",
);

// REVERSED ON 2026-07-29, by the player, about the game rather than about this
// file: "when he does a manual, he himself shouldn't lean; the character should
// stay facing forward, only the board tilts. The guy stands straight —
// completely vertical — when he does a manual; it's just his legs."
//
// This check used to demand `> 15` — the torso carried at least 15° further
// over the tail than a rolling stance. That was a real decision, made for a
// real reason (a skater wheelieing at 17° does lean back), and he has overruled
// it. What it now asks for is the SAME thing from the other side: the take
// still may not touch the waist (that clause is unchanged and still the point
// of `owns: "arms"`), and what the waist is holding is now the rolling stance's
// own angle rather than a lean of its own.
//
// Measured HERE, on the posture alone, the number is not the one you see in the
// game and it must not be: `SkaterRig.stand` adds the deck's 17.2° rake back on
// top of this, because the two soles have to stay in the griptape's plane. So
// the posture's job is to be that rake with the sign flipped — cancel it at the
// waist and let it live on the legs. −17.0° against the rolling stance here is
// what comes out as −6.1° against −5.0° on the real ride, which is the check
// three blocks down.
check(
  "the manual's posture CANCELS the deck's rake at the waist — the take does not get it",
  withTake.Manual.lean - rollingHeld.lean < -12 &&
    withTake.Manual.lean - rollingHeld.lean > -22 &&
    Math.abs(withTake.Manual.lean - bare.Manual.lean) < 1.5,
  `${withTake.Manual.lean.toFixed(1)}° over the tail with the take on, ` +
    `${bare.Manual.lean.toFixed(1)}° without it, against the rolling stance's ` +
    `${rollingHeld.lean.toFixed(1)}° — the take took the arms and left the waist`,
  "`owns: \"arms\"` taken off POSE_TAKES.Manual, which hands the take the waist " +
    "as well → −15.1° over the tail: the performer leaning over his own toes, " +
    "which on a rider standing sideways comes out over the NOSE, on the truck " +
    "that is in the air",
);

// The grab's own measure, re-run with every take that DID land attached, so a
// take put back on this move — or one that leaks onto it — is caught here.
//
// WHERE, not how near. The distance alone was the whole of this check for a
// round and it was not enough: a hand hovering over the middle of the board
// 11.4 cm up scores under 12 cm and holds nothing, which is what shipped. A grab
// is a hand on a RAIL, between the trucks, at or below the level of his soles —
// three facts, and the deck's own geometry decides all three (rails ±10.5 cm,
// trucks near z = ±26, top face 10 cm under the soles).
const grabHeld = fly({ hang: 1.2, seconds: 1.2, grabAt: 0.2 });
const onRail = grabHeld.trace.reduce((a, b) => (toDeck(b) < toDeck(a) ? b : a));
check(
  "the grab lands the hand ON A RAIL between his feet, not over the middle of the deck",
  nearest(grabHeld.trace) < 12 &&
    Math.abs(Math.abs(onRail.hand.x * 100) - 10.5) < 4 &&
    Math.abs(onRail.hand.z * 100) < 30 &&
    onRail.handAbove < 0,
  `${nearest(grabHeld.trace).toFixed(1)} cm off the griptape, at x ` +
    `${(onRail.hand.x * 100).toFixed(1)} cm (the rail is ±10.5), z ` +
    `${(onRail.hand.z * 100).toFixed(1)} cm along the deck (the trucks are ±26), ` +
    `${onRail.handAbove.toFixed(1)} cm above the soles`,
  "POSE_TAKES.Grab put back as it shipped (`owns: \"torso\"`) → 9.8 cm off the " +
    "griptape, which is INSIDE the old 12 cm bar, at x = +6.0 cm — off the rail, " +
    "over the deck's middle, level with his soles rather than under them: the take " +
    "rolls the shoulders the arm hangs from and carries the hand off the rail " +
    "without touching an arm bone, and the distance alone could not see it. " +
    "Watched red a second way with `POSTURES.Grab.reach` pushed to 60° → 24.0 cm " +
    "off, x = +15.0 cm, 13.6 cm above the soles: the arm swung clean past the rail",
);

// A take is 60-odd cm of arm arriving on a shape that had 30, which is six
// times what the posture's own degrees ever moved — so it has to arrive on the
// ramp and not in a frame. Measured as the hand span's worst single-frame move
// against the whole distance it travels, which is the same shape of measure the
// air section uses for its own onset.
function ramp(trick) {
  settle();
  anim.holdTrick(trick);
  const span = [];
  for (let i = 0; i < 40; i++) {
    step();
    span.push(at("LeftHand").distanceTo(at("RightHand")) * 100);
  }
  anim.holdTrick(null);
  const worst = Math.max(...span.slice(1).map((v, i) => Math.abs(v - span[i])));
  return { worst, travel: Math.max(...span) - span[0] };
}
const fiftyRamp = ramp("50-50");
check(
  "…and it arrives on a ramp — 60 cm of arm is not allowed to land in one frame",
  fiftyRamp.worst < 0.2 * fiftyRamp.travel,
  `the arms open ${fiftyRamp.travel.toFixed(1)} cm in all and never more than ` +
    `${fiftyRamp.worst.toFixed(2)} cm in one frame — ` +
    `${((100 * fiftyRamp.worst) / fiftyRamp.travel).toFixed(0)}% of the move`,
  "POSE_TAKES['50-50'].fade pinned to 1e-6, which is the ramp the take rides " +
    "on taken away → 69.66 cm on one frame, 82% of the move, the arms arriving " +
    "between two frames",
);

// …and it rides both ways round, off the same reflection the clips use: the
// facing measured from the nose comes back as 180° − θ, so the two sum to a
// half turn, and the shape itself survives it.
const fifty = withTake["50-50"];
const fiftyFakie = held("50-50", true);
check(
  "a take rides fakie too — its reflection is built with it, not a second take",
  Math.abs(wrap(fifty.facing + fiftyFakie.facing - 180)) < 25 &&
    Math.abs(fifty.spread - fiftyFakie.spread) < 6,
  `the same take stands him at ${fifty.facing.toFixed(1)}° riding ahead and ` +
    `${wrap(fiftyFakie.facing).toFixed(1)}° riding fakie — summing to ` +
    `${wrap(fifty.facing + fiftyFakie.facing).toFixed(1)}° — with his hands ` +
    `${fifty.spread.toFixed(1)} and ${fiftyFakie.spread.toFixed(1)} cm apart`,
  "`mirrorPose` left the quaternion unreflected (x, y, z, w) → the same take " +
    "measures 130.0 cm of hand span one way and 116.5 the other. The facing half " +
    "of this check is the BASE clip's reflection and stays green through that " +
    "break; the span is the take's own and is what goes red",
);

// THE FULL-CLIP DOOR — and this one is a DOOR TEST and nothing more, which is
// worth saying in the file rather than leaving to be discovered. It fills a
// held move's clip slot with a stand-in (the crouch take, sliced somewhere
// else) because no held move has a full-body clip: the four takes that exist
// are performances with no board in them and are used from the waist up
// instead (`anim/pose-take.ts`, and THE FOUR TAKES below, which measures those
// four for real). What this proves is only that `holdTrick` prefers a clip and
// that its fakie twin is built — the hinges, not the room.
const SLOT = "fifty";
const filled = await anim.attachHandClip(SLOT, {
  ...CROUCH_HAND_CLIP,
  url: abs(CROUCH_HAND_CLIP.url),
  start: 0.1,
  end: 0.3,
  fade: 0.12,
});
const rideSlot = (fakie) => {
  settle();
  anim.setFakie(fakie);
  anim.holdTrick("50-50");
  for (let i = 0; i < 45; i++) step();
  const out = {
    stand: cm(at("Hips"), feet()),
    spread: at("LeftHand").distanceTo(at("RightHand")) * 100,
    facing: facing(),
  };
  anim.holdTrick(null);
  anim.setFakie(false);
  return out;
};
const onClip = rideSlot(false);
const onClipFakie = rideSlot(true);
// …and what the fallback measures on the same move, for the comparison.
const FALLBACK_SPREAD = 68.3; // tools/hold-check.mjs, 50-50, regular
check(
  "the full-clip door opens — a clip in a held move's slot is what he rides (STAND-IN)",
  filled && Math.abs(onClip.spread - FALLBACK_SPREAD) > 5,
  filled
    ? `50-50 on a real clip: hips ${onClip.stand.toFixed(1)} cm above the soles, hands ` +
      `${onClip.spread.toFixed(1)} cm apart — against 52.7 cm / ${FALLBACK_SPREAD} cm for ` +
      `the crouch-plus-degrees fallback, so the clip is posing him and the posture stood down`
    : "the clip did not bind at all",
  "`holdTrick`'s `playHand(TRICK_CLIP[trick])` line removed → 68.3 cm, the " +
    "fallback's own number, with a clip loaded and ignored",
);
// The reflection is nose-for-tail in the BOARD's frame (`mirror.ts`), and a yaw
// measured from the nose therefore comes back as 180° − θ. So the two facings
// have to SUM to a half turn: equal angles either side of the deck's crossways
// axis, which is a rider standing the same way over the other end.
check(
  "…and it rides both ways round — the slot's fakie twin is built with it",
  Math.abs(wrap(onClip.facing + onClipFakie.facing - 180)) < 25 &&
    Math.abs(wrap(onClip.facing - onClipFakie.facing)) > 30,
  `the same clip stands him at ${onClip.facing.toFixed(1)}° riding ahead and ` +
    `${wrap(onClipFakie.facing).toFixed(1)}° riding fakie — they sum to ` +
    `${wrap(onClip.facing + onClipFakie.facing).toFixed(1)}°, the reflection, not a second take`,
  "attachHandClip's `mirrorClip(...)` replaced with the plain clip → −48.5° and " +
    "−90.5°, summing to −139° instead of a half turn",
);

// =============================================================================
// THE MANUAL, on the real ride — the one shape whose read is not this layer's
// alone. The board is raked 17° by the model and `SkaterRig.stand` turns the
// RIDER by the same angle so he leans back with it; the posture then carries
// his weight further over the tail. None of that can be measured on the anim
// layer by itself, because two thirds of it is the rig. So this section builds
// the real thing — model, rig and anim, stepped in main.ts's own order — and
// reads the body in WORLD space, which is where the player sees it.
console.log(`\nTHE MANUAL, ON THE REAL RIDE  — "he must interact with the board realistically"\n`);

// The world files are being rewritten by other lanes while this runs, and a
// half-saved `spot.ts` takes the whole harness down with it. The animation
// answers above do not depend on the street at all, so a broken world costs
// this one section and says so rather than costing the run.
let world = null;
try {
  world = {
    SkateModel: (await import("../src/skate/skate-model.ts")).SkateModel,
    SkaterRig: (await import("../src/skate/skater-rig.ts")).SkaterRig,
    SkateInputSource: (await import("../src/skate/input.ts")).SkateInputSource,
    ...(await import("../src/world/spot.ts")),
  };
} catch (e) {
  console.log(`  SKIPPED — the world would not load: ${e.message.split("\n")[0]}`);
}
const { SkateModel, SkaterRig, SkateInputSource, STREET_SPOT, QP_LIP_Z, QP_TOE_Z } =
  world ?? {};

function keyboard() {
  const listeners = {};
  globalThis.window = {
    addEventListener: (t, f) => void (listeners[t] ??= []).push(f),
    removeEventListener: () => {},
  };
  const src = new SkateInputSource();
  src.attach();
  delete globalThis.window;
  src.consume(DT);
  const down = new Set();
  const fire = (type, code) =>
    listeners[type]?.forEach((f) => f({ code, repeat: false, preventDefault() {} }));
  return (hold) => {
    const want = new Set(hold);
    for (const code of [...down])
      if (!want.has(code)) {
        fire("keyup", code);
        down.delete(code);
      }
    for (const code of want)
      if (!down.has(code)) {
        fire("keydown", code);
        down.add(code);
      }
    return src.consume(DT);
  };
}

/**
 * The real ride, wired the way `src/main.ts` wires it — model, rig, anim, feet.
 *
 * ONE call in here is not about the manual and is why THE LAUNCH below can say
 * anything: `anim.setAir(model.airborne)`, which is the line main.ts runs between
 * `rig.sync` and `anim.update`. This helper predates that line and was still
 * driving the ride without it, so the only airs it could ever have measured were
 * the ones a pop announced — the same hole the DOOR TESTs above are about, in the
 * harness itself. Keep the order: it is main.ts's.
 */
function riderLoop(model, rig, press, keys, i) {
  const input = press(typeof keys === "function" ? keys(i) : keys);
  model.update(input, DT);
  rig.sync(model, DT);
  anim.setAir(model.airborne);
  anim.update(DT, model.spin);
  rig.followFeet(anim, model, DT, false);
  rig.root.updateMatrixWorld(true);
}

/** Rides flat ground at `speed`, holding `keys`, and reads the body in world. */
function ride(keys, seconds) {
  const rig = new SkaterRig(new THREE.Scene());
  const model = new SkateModel(
    {
      onPush: (span) => anim.startPush(span),
      onCharge: (w) => (w ? anim.startCharge() : anim.endCharge()),
      onPop: (t, air) => anim.playTrick(t, air),
      onLand: (t, s, slam = 0) => anim.playCushion(slam),
      onManual: (on, nose = false) => anim.holdTrick(on ? (nose ? "Nose Manual" : "Manual") : null),
      onGrindStart: (kind) => anim.holdTrick(model.tricks.def(kind).name),
      onGrindEnd: () => anim.holdTrick(null),
      onStance: (s) => anim.setStance(s),
    },
    STREET_SPOT,
  );
  const z0 = QP_LIP_Z - 30;
  model.position.set(-4, STREET_SPOT.height(-4, z0), z0);
  model.heading = 0;
  model.speed = 9;
  rig.setCharacter(anim.model, SKATER_YAW);
  const press = keyboard();
  let out = null;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    riderLoop(model, rig, press, keys, i);
    const w = (n) => new THREE.Vector3().setFromMatrixPosition(bones.get(n).matrixWorld);
    const torso = w("neck").sub(w("Hips"));
    // Positive is his chest going back over the TAIL: the ride's heading is 0,
    // so the nose runs along +Z and the tail along −Z.
    out = {
      lean: (Math.atan2(-torso.z, torso.y) * 180) / Math.PI,
      rake: (rig.boardPitch.rotation.x * -180) / Math.PI,
      // Where he stands along the deck, against the board's own contact point.
      // The trucks sit ±26 cm from the middle, so "over the back truck" is −26.
      standsAt: (w("Hips").z - model.position.z) * 100,
      speed: model.speed,
    };
  }
  // The rig and the model are thrown away with the frame; the body is not, so
  // hand it back to a plain rolling stance before the next case takes it.
  anim.holdTrick(null);
  anim.model.parent?.remove(anim.model);
  board.add(anim.model);
  settle();
  return out;
}

if (world) {
const rollingReal = ride([], 1.5);
// SHIFT, not E, and the difference is two red checks that were red for the wrong
// reason. The manual moved to Shift on 2026-07-29 at the player's word (*"поменяй
// еще пожалуйста shift и E"*) and E became the square-entry key for a line, so
// this case has been holding the GRIND key and measuring a rolling stance ever
// since: deck 0.0° of rake, torso 0.5° off rolling, both manual checks below red
// with nothing wrong in either file they are about. `SkateInputSource` is the one
// place the keys live (`manualHeld: ShiftLeft || ShiftRight`) — read it rather
// than remembering it.
const manualReal = ride(["ShiftLeft"], 1.5);
const noseReal = ride(["KeyQ"], 1.5);
console.log(
  `  rolling:     deck ${rollingReal.rake.toFixed(1)}° nose-up, body ` +
    `${rollingReal.lean.toFixed(1)}° over the tail, standing ${rollingReal.standsAt.toFixed(1)} cm ` +
    `from the deck's middle`,
);
console.log(
  `  manual:      deck ${manualReal.rake.toFixed(1)}° nose-up, body ` +
    `${manualReal.lean.toFixed(1)}° over the tail, standing ${manualReal.standsAt.toFixed(1)} cm ` +
    `from the deck's middle (the back truck is at −26 cm)`,
);
console.log(
  `  nose manual: deck ${noseReal.rake.toFixed(1)}° nose-up, body ` +
    `${noseReal.lean.toFixed(1)}° over the tail, standing ${noseReal.standsAt.toFixed(1)} cm ` +
    `from the deck's middle`,
);
// Same reversal as above, measured on the real ride rather than on the poses.
// The manual is now a WHEELIE: the deck rakes hard, the rider does not tip with
// it, and everything he does about it happens below the waist. So the deck's
// rake is what has to be big and the torso is what has to stay put.
check(
  "a manual rakes the DECK and leaves the rider standing up",
  manualReal.rake > 15 && Math.abs(manualReal.lean - rollingReal.lean) < 5,
  `deck ${manualReal.rake.toFixed(1)}° nose-up with his torso ` +
    `${(manualReal.lean - rollingReal.lean).toFixed(1)}° off the rolling stance`,
  "`SkaterRig.stand` given the deck's full rake with no posture cancelling it → " +
    "30.7° further over the tail than rolling: the rider tipped back with his own " +
    "board, which is what the player rejected",
);
check(
  "…and the two manuals are opposites in the DECK and in where he stands on it",
  manualReal.rake > 15 &&
    noseReal.rake < -15 &&
    Math.abs(manualReal.lean - noseReal.lean) < 5 &&
    manualReal.standsAt < 0 &&
    noseReal.standsAt > 0,
  `deck ${manualReal.rake.toFixed(1)}° against ${noseReal.rake.toFixed(1)}°, ` +
    `standing ${manualReal.standsAt.toFixed(1)} cm against ${noseReal.standsAt.toFixed(1)} cm ` +
    `from the deck's middle, torso ${Math.abs(manualReal.lean - noseReal.lean).toFixed(1)}° apart`,
  "POSTURES['Nose Manual'].lean given the manual's sign → the two stop being " +
    "opposites and Q reads as a rolling stance on a board raked the other way",
);

// =============================================================================
// THE LAUNCH — "I'm riding onto a ramp, and when I ride onto a ramp — for
// example, I hold the spacebar — and at the end of the ramp, when I launch, for
// some reason my character switches to a normal pose, like an idle pose, right
// in the air. He should probably switch to a flight pose."
//
// THE AIR SECTION AT THE TOP OF THIS FILE COULD NOT SEE THIS AND SAID SO IN
// GREEN. It drives the air through `playTrick` (a pop) and through `setAir` (the
// coast), which are the two airs the layer knows how to be told about — and the
// one the player rode is neither. Holding Space through the lip fires no pop at
// all: the ollie lives on the key coming UP (`SkateInputSource.onKeyUp`). What it
// does instead is park the wind-up crouch, which `SkateModel.setCharging(grounded
// && chargeHeld)` releases on the first airborne frame, which hands the body to
// `resumeRide()` — the standing rolling loop — while `AIR_LOW` keeps the shape
// above at zero for 0.95 s. Three correct decisions, one rider standing at
// attention on the way up.
//
// So this section drives the REAL thing: the real model over the real quarter
// pipe through the real keyboard, at the speeds `anim/air.ts` already tabulates,
// and reads JOINTS rather than clip names — the knees, the hips and the hand span
// on the first airborne frame, at +0.1 s and at +0.3 s. Every case is the same
// A/B the rest of the file uses: the identical launch with `AIR_STANCE` zeroed
// and then shipped, and the difference is the layer.
console.log(`\nTHE LAUNCH  — "at the end of the ramp, when I launch, my character`);
console.log(`              switches to a normal pose, like an idle pose"\n`);

/** Degrees between two directions. */
const ang = (u, v) =>
  (Math.acos(THREE.MathUtils.clamp(u.dot(v) / (u.length() * v.length()), -1, 1)) * 180) /
  Math.PI;

/**
 * One real launch, and the body on the frames either side of it.
 *
 * `keys(i)` is the held set per frame, so a coasted launch is Space never coming
 * up and a flat ollie is Space coming up on the ground — the same two inputs the
 * player's hands make. Read in the RIDER's own frame (`SkaterRig.character`,
 * which is what `board` stands in for in the sections above), so a body measured
 * half way up a 65° transition is measured against his own vertical and not the
 * world's.
 */
function launch({ speed, z0, keys, seconds = 1.8 }) {
  const rig = new SkaterRig(new THREE.Scene());
  const model = new SkateModel(
    {
      onPush: (span) => anim.startPush(span),
      onCharge: (w) => (w ? anim.startCharge() : anim.endCharge()),
      onPop: (t, air) => anim.playTrick(t, air),
      onLand: (t, s, slam = 0) => anim.playCushion(slam),
      onManual: (on, nose = false) => anim.holdTrick(on ? (nose ? "Nose Manual" : "Manual") : null),
      onGrindStart: (kind) => anim.holdTrick(model.tricks.def(kind).name),
      onGrindEnd: () => anim.holdTrick(null),
      onStance: (s) => anim.setStance(s),
    },
    STREET_SPOT,
  );
  model.position.set(-4, STREET_SPOT.height(-4, z0), z0);
  model.heading = 0;
  model.speed = speed;
  rig.setCharacter(anim.model, SKATER_YAW);
  const press = keyboard();
  const frames = [];
  const m = new THREE.Matrix4();
  const wp = (n) => new THREE.Vector3().setFromMatrixPosition(bones.get(n).matrixWorld);
  const rider = (n) => wp(n).applyMatrix4(m);
  const shoe = (side) => rider(`${side}Foot`).add(rider(`${side}ToeBase`)).multiplyScalar(0.5);
  // Flexion at one knee and one hip, degrees, both zero on a leg standing
  // straight under him: the knee is the fold between thigh and shin, and the hip
  // is the thigh coming up out of the line of his own torso. Angles BETWEEN
  // bones, so they need no frame at all — which is why they are the honest read
  // on a body leaving a 65° lip, where every height is measured against something
  // that is itself tilted.
  const knee = (side) => {
    const h = wp(`${side}UpLeg`);
    const k = wp(`${side}Leg`);
    const f = wp(`${side}Foot`);
    return 180 - ang(h.sub(k), f.sub(k));
  };
  const hipFlex = (side) =>
    180 - ang(wp("neck").sub(wp("Hips")), wp(`${side}Leg`).sub(wp(`${side}UpLeg`)));
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    riderLoop(model, rig, press, keys, i);
    m.copy(rig.character.matrixWorld).invert();
    const soles = shoe("Left").add(shoe("Right")).multiplyScalar(0.5);
    frames.push({
      t: i * DT,
      air: model.airborne,
      down: model.state === "ragdoll",
      speed: model.speed,
      // Hips above his own soles — the board rides those soles in the air, so
      // this is also how far the deck is up under him.
      stand: (rider("Hips").y - soles.y) * 100,
      knee: (knee("Left") + knee("Right")) / 2,
      hip: (hipFlex("Left") + hipFlex("Right")) / 2,
      span: rider("LeftHand").distanceTo(rider("RightHand")) * 100,
      // The public witness for WHICH pose is on him: true only while the rolling
      // loop is what poses the body with nothing parked over it.
      riding: anim.feetSettled,
    });
  }
  anim.holdTrick(null);
  anim.model.parent?.remove(anim.model);
  board.add(anim.model);
  settle();
  const off = frames.findIndex((f) => f.air);
  const airborne = off < 0 ? [] : frames.slice(off).filter((f) => f.air && !f.down);
  return {
    frames,
    off,
    airborne,
    /** The last frame with the wheels still down — the ride he left from. */
    ground: frames[off < 0 ? frames.length - 1 : Math.max(0, off - 1)],
    hang: airborne.length * DT,
    lipSpeed: off < 0 ? 0 : frames[Math.max(0, off - 1)].speed,
    /** The body `secs` after the wheels left. */
    at: (secs) => airborne[Math.min(airborne.length - 1, Math.round(secs / DT))],
    /** The moment he stood up the tallest, which is the whole complaint. */
    tallest: () => Math.max(...airborne.map((f) => f.stand)),
  };
}

// Space held from the first frame and never released: no pop, no trick clip, the
// launch the player described. The flat ollie beside it is the other input — held
// and then RELEASED on the ground, which pops and hands the air to the ollie take
// — and it is here as the CONTROL: it is the hop that has to stay untouched.
const QP_START = QP_TOE_Z - 4;
const HOLD = () => ["Space"];
const POP = (i) => (i < 12 ? ["Space"] : []);
const LAUNCHES = [
  { label: "flat ollie, popped", speed: 4, z0: QP_LIP_Z - 30, keys: POP, seconds: 1.2 },
  { label: "quarter pipe @12", speed: 12, z0: QP_START, keys: HOLD },
  { label: "quarter pipe @16", speed: 16, z0: QP_START, keys: HOLD },
  { label: "quarter pipe @20", speed: 20, z0: QP_START, keys: HOLD },
];
const bareLaunch = withShape(AIR_STANCE, OFF, () => LAUNCHES.map((c) => launch(c)));
const flown = LAUNCHES.map((c) => launch(c));
// The yardstick, and it is a RIDE rather than a remembered constant: the same
// body on the same rig rolling along the flat with nothing pressed. "He switched
// to a normal pose" means he switched to this, and every number below is read
// against it.
const rolled = launch({ speed: 8, z0: QP_LIP_Z - 30, keys: () => [], seconds: 1.0 });
console.log(
  `  rolling along the flat, nothing pressed: hips ${rolled.ground.stand.toFixed(1)} cm over ` +
    `his soles, ${rolled.ground.knee.toFixed(0)}° of knee, ${rolled.ground.hip.toFixed(0)}° of ` +
    `hip, hands ${rolled.ground.span.toFixed(1)} cm apart\n`,
);
/** The least bent his knees ever get up there, after the launch has settled. */
const minKnee = (r) => Math.min(...r.airborne.slice(6).map((f) => f.knee));
const row = (f) =>
  f === undefined
    ? "        —                        "
    : `${f.stand.toFixed(1).padStart(6)} cm ${f.knee.toFixed(0).padStart(4)}° knee ` +
      `${f.hip.toFixed(0).padStart(4)}° hip ${f.span.toFixed(0).padStart(4)} cm`;
LAUNCHES.forEach((c, i) => {
  const b = bareLaunch[i];
  const a = flown[i];
  if (a.off < 0) {
    console.log(`  ${c.label.padEnd(20)}  NEVER LEFT THE GROUND`);
    return;
  }
  console.log(
    `  ${c.label.padEnd(20)}  ${a.hang.toFixed(2)} s of air, leaving at ` +
      `${a.lipSpeed.toFixed(1)} m/s` +
      (a.airborne.every((f) => f.riding) ? " (rolling stance the whole way)" : ""),
  );
  for (const [when, secs] of [
    ["first airborne frame", 0],
    ["+0.1 s", 0.1],
    ["+0.3 s", 0.3],
  ]) {
    console.log(`      ${when.padEnd(21)} before ${row(b.at(secs))}   after ${row(a.at(secs))}`);
  }
  console.log(
    `      tallest he stands     before ${b.tallest().toFixed(1)} cm` +
      `${" ".repeat(24)}after ${a.tallest().toFixed(1)} cm`,
  );
});

const qp = [1, 2, 3];
const ollieBare = bareLaunch[0];
const ollieOn = flown[0];
// Measured on the KNEE first and the height second, and that order is the
// instrument rather than a preference: the rolling loop is 4.4 s of a real
// skater riding and his hips move 1.8 cm over it on their own, so "how tall does
// he stand" carries the loop's own wobble into every number. The angle at his
// knee does not — it is two bones — and it is also the thing an eye reads as
// flying rather than standing.
check(
  "he does not fly in his riding stance — the knees are bent for the whole air",
  qp.every(
    (i) =>
      flown[i].off >= 0 &&
      minKnee(flown[i]) - minKnee(bareLaunch[i]) > 15 &&
      flown[i].tallest() < rolled.ground.stand - 3,
  ),
  qp
    .map(
      (i) =>
        `@${LAUNCHES[i].speed}: knee never straighter than ${minKnee(flown[i]).toFixed(0)}° ` +
        `(was ${minKnee(bareLaunch[i]).toFixed(0)}°), tallest ${flown[i].tallest().toFixed(1)} cm ` +
        `(was ${bareLaunch[i].tallest().toFixed(1)})`,
    )
    .join(" · ") +
    ` — against ${rolled.ground.knee.toFixed(0)}° and ${rolled.ground.stand.toFixed(1)} cm ` +
    `rolling along the flat, which is what he used to fly in to the degree`,
  "AIR_STANCE zeroed — the `before` column above IS that run — and all three go back " +
    "to 54° of knee and 72.9 cm, the flat roll's own numbers: a man standing on a board " +
    "with the ground 4 m under him",
);
// RE-BASED in round two, and the reason is written here rather than in the diff.
//
// This asked for 70% of the pose at +0.1 s. That was the right question while
// `STANCE_ON` was 0.10 s, and it is the WRONG question now that it is 0.17 s —
// because amplitude and ramp length are one dial (see `AIR_STANCE`'s round-two
// table: the rate ceiling is fixed at 5°/frame, so a bigger pose can only be
// bought with more frames). Held at 70%-of-0.1 s, this check does not defend the
// player's complaint, it caps the pose at the size he could not see.
//
// So it now asks the thing it always meant: is he in it EARLY, against the 0.95 s
// arrival that was the defect. +0.2 s and 70%, plus a hard ceiling that the pose
// is all the way in well before `AIR_LOW` — 0.17 s of ramp is 5.6× sooner than the
// thing being ruled out, and the +0.1 s figure stays in the printed line so the
// re-base is visible rather than buried.
check(
  "…and he is in it from the launch, not 0.95 s later when AIR_LOW admits the air",
  qp.every((i) => {
    const early = flown[i].at(0.2).knee - bareLaunch[i].at(0.2).knee;
    const settledIn = flown[i].at(0.3).knee - bareLaunch[i].at(0.3).knee;
    return settledIn > 12 && early > 0.7 * settledIn && STANCE_ON_S < AIR_LOW / 3;
  }),
  qp
    .map(
      (i) =>
        `@${LAUNCHES[i].speed}: ${(flown[i].at(0.1).knee - bareLaunch[i].at(0.1).knee).toFixed(0)}° ` +
        `of knee at +0.1 s, ${(flown[i].at(0.2).knee - bareLaunch[i].at(0.2).knee).toFixed(0)}° at ` +
        `+0.2 s, against ${(flown[i].at(0.3).knee - bareLaunch[i].at(0.3).knee).toFixed(0)}° at +0.3 s`,
    )
    .join(" · ") +
    ` — the ramp is ${STANCE_ON_S.toFixed(2)} s, ${(AIR_LOW / STANCE_ON_S).toFixed(1)}× sooner ` +
    `than the ${AIR_LOW} s arrival that was the whole complaint`,
  "the whole of what the player reported: with only the size-driven shape the same " +
    "three launches move 0° of knee at +0.1 s AND 0° at +0.3 s, because AIR_LOW is " +
    "0.95 s of hang and the shape is at exactly zero until then. Watched a second way " +
    "with STANCE_ON pushed to 0.95 s to imitate that arrival: 0° at +0.1 s against 4° " +
    "at +0.3 s, red on both clauses",
);
// …and it is not allowed to arrive in one frame either, which is the same
// question the AIR POSE section asks of `AIR_SHAPE` and the same instrument: the
// stance's OWN contribution, differenced against the identical launch with it
// zeroed, so the crouch releasing underneath it is subtracted out rather than
// counted as this layer moving. The leading zero is the first airborne frame,
// which is exactly where a snap would land.
const stanceOwn = (i) => {
  const b = bareLaunch[i].airborne;
  const a = flown[i].airborne;
  const n = Math.min(b.length, a.length);
  const own = [0, ...Array.from({ length: n }, (_, k) => a[k].knee - b[k].knee)];
  return {
    worst: Math.max(...own.slice(1).map((d, k) => Math.abs(d - own[k]))),
    worth: Math.max(...own.map(Math.abs)),
  };
};
// The bar is in DEGREES here and a FRACTION in the AIR POSE section, and that is
// the ramp's length rather than a double standard: `STANCE_ON` is 0.10 s, which
// is six frames at 60 fps, and a smoothstep across six frames spends ~25% of
// itself on its steepest one however gently it is eased. A fraction cannot tell
// that apart from a snap. What the eye actually reads is the RATE, and this body
// has an accepted one — `POSTURE_FADE` puts every posture in the game at 9–10° on
// its worst frame (`tools/hold-check.mjs`, HANDOVER), and the stance turn is the
// fastest thing anybody has signed off. Half of that is the bar.
check(
  "…and it does not arrive in one frame — a knee may not snap faster than a posture does",
  qp.every((i) => stanceOwn(i).worst < 5),
  qp
    .map((i) => {
      const s = stanceOwn(i);
      return (
        `@${LAUNCHES[i].speed}: worst single frame ${s.worst.toFixed(1)}° of the ` +
        `${s.worth.toFixed(1)}° it is worth (${((100 * s.worst) / s.worth).toFixed(0)}%)`
      );
    })
    .join(" · ") +
    ` — against the 9–10° every held posture in this game arrives at`,
  "STANCE_ON replaced by a straight assignment (0.10 → 1e-9) → 17.9° of knee on one " +
    "frame, 92% of the whole move, on the frame the crouch lets go",
);
check(
  "…and a POPPED ollie is still left alone — the take is the air pose and it owns the body",
  ollieOn.off >= 0 && Math.abs(ollieBare.tallest() - ollieOn.tallest()) < 1.5,
  `the flat ollie stands ${ollieBare.tallest().toFixed(1)} cm at its tallest without this ` +
    `layer and ${ollieOn.tallest().toFixed(1)} cm with it, on an air the ollie take already ` +
    `folds to ${ollieOn.at(0.3)?.stand.toFixed(1)} cm on its own. This is the player's own ` +
    `condition and the reason the gate is OWNERSHIP and not a clock: "a skater pops an ` +
    `ollie every few seconds and pulls nothing"`,
  "the `riding` gate taken out of `AirBody.update` (`this.up && riding` → `this.up`), " +
    "which is the stance applied on every airborne frame the way a time-gated layer " +
    "would have to → the same popped ollie folds a further 9.6 cm, tallest 60.7 → 51.1, " +
    "with 119° of knee at +0.1 s against the take's own 98°: the ollie's tuck applied twice",
);
}

console.log(
  `\n${pass}/${pass + fail} pass` + (unproven ? `, ${unproven} UNPROVEN` : "") + "\n",
);
server.close();
process.exit(fail > 0 ? 1 : 0);
