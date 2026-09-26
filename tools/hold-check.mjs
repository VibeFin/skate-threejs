// What does a held move look like? — `node tools/hold-check.mjs`
//
// Sister to `tools/stance-check.mjs`, and it exists because the motion vendor
// ran out of money mid-milestone: none of the grinds, the manual or the grab
// has a clip, so their read is built out of the crouch plus a few degrees of
// arm (`POSTURES` in skater-anim.ts). "It reads differently" is not a claim
// anyone can check, so this prints the four numbers that decide it:
//
//   STAND   — hips above the soles. Dropping is the whole point of a grind
//             pose, and measuring it against the SOLES rather than against the
//             floor makes it independent of where the rig stands the board.
//   SPREAD  — hand to hand. Arms out is the other half of the read.
//   HAND    — the back hand's height above the soles: the grab's only question.
//   LEAN    — the torso off vertical in the BOARD's frame, toward the tail.
//             The deck's own rake is the rig's job and is not in here, so this
//             is the body's contribution alone.
//
// Then four things that are not postures at all but live in the same file: the
// stance flip's per-frame turn (it used to arrive in ONE frame, and until round
// 4 nothing in the game could reach it), the grab's reach against the ceiling
// the rig's own proportions put on it, which side of the deck a push holds him
// on, and the tracker reset that used to leak through as a spin.
//
// Steps the REAL SkaterAnim on the REAL rig with no renderer, same as its
// sister — so these are the numbers the game produces, not a model of them.

globalThis.self ??= globalThis;
globalThis.URL.createObjectURL ??= () => "blob:hold-check";
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
const { SkaterAnim, HAND_CLIPS } = await import("../src/skate/skater-anim.ts");
const { createSpinTracker } = await import("../src/skate/contracts.ts");

const SKATER_URL =
  "https://assets.auras.cc/generations/cms0fbiar004o22nuyjqjhzuz/rigged-character.glb";
const SKATER_YAW = -Math.PI / 2;
const DT = 1 / 60;

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
console.log(`clips bound: ${(await anim.attachHandClips(table)).join(", ")}`);

// The deck: SKATER_YAW sits on the model, so the model's PARENT is the board's
// own frame — nose at +Z, screen-right at −X. Exactly how SkaterRig hangs him.
const board = new THREE.Group();
anim.model.rotation.y = SKATER_YAW;
board.add(anim.model);

const bones = new Map();
anim.model.traverse((o) => o.name && bones.set(o.name, o));
const inv = new THREE.Matrix4();
const v = new THREE.Vector3();
const step = (spin) => {
  anim.update(DT, spin);
  board.updateMatrixWorld(true);
};

/** Where a bone is, in the board's frame. +Z is the nose, +Y is up. */
const at = (name) => {
  inv.copy(board.matrixWorld).invert();
  return v.setFromMatrixPosition(bones.get(name).matrixWorld).applyMatrix4(inv).clone();
};
/** Middle of one shoe — ankle to toe, the same point the board is stood on. */
const sole = (side) => at(`${side}Foot`).add(at(`${side}ToeBase`)).multiplyScalar(0.5);

/** The four numbers, in centimetres and degrees. */
const sample = (stance) => {
  const feet = sole("Left").add(sole("Right")).multiplyScalar(0.5);
  const hips = at("Hips");
  const torso = at("neck").sub(hips);
  const back = stance === "switch" ? at("LeftHand") : at("RightHand");
  return {
    stand: (hips.y - feet.y) * 100,
    spread: at("LeftHand").distanceTo(at("RightHand")) * 100,
    hand: (back.y - feet.y) * 100,
    // Off vertical, toward the TAIL (−Z). The deck's rake is not in here.
    lean: (Math.atan2(-torso.z, torso.y) * 180) / Math.PI,
  };
};

/** Averaged over `n` frames — the rolling stance is a loop and never holds still. */
const hold = (n, stance) => {
  const acc = { stand: 0, spread: 0, hand: 0, lean: 0 };
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < n; i++) {
    step();
    const s = sample(stance);
    for (const k of Object.keys(acc)) acc[k] += s[k] / n;
    low = Math.min(low, s.stand);
    high = Math.max(high, s.stand);
  }
  return { ...acc, swing: high - low };
};

const line = (label, s, base) =>
  `  ${label.padEnd(14)} stand ${s.stand.toFixed(1).padStart(6)} cm` +
  (base ? ` (${(s.stand - base.stand).toFixed(1).padStart(6)} cm)` : "        ".padStart(10)) +
  `  spread ${s.spread.toFixed(1).padStart(5)} cm` +
  `  back hand ${s.hand.toFixed(1).padStart(6)} cm` +
  `  lean ${s.lean.toFixed(1).padStart(6)}°`;

const MOVES = ["50-50", "Boardslide", "Nosegrind", "Tailslide", "Smith", "Manual", "Grab"];

for (const stance of ["regular", "switch"]) {
  anim.holdTrick(null);
  anim.setStance(stance);
  for (let i = 0; i < 180; i++) step();
  console.log(`\n${stance.toUpperCase()}  (hips above the soles; the rolling loop is the baseline)`);
  const base = hold(60, stance);
  console.log(`${line("rolling", base)}   loop swing ${base.swing.toFixed(1)} cm`);
  for (const move of MOVES) {
    const took = anim.holdTrick(move);
    for (let i = 0; i < 45; i++) step(); // 0.25 s into the shape, 0.18 s of ramp
    const s = hold(30, stance);
    console.log(`${line(move, s, base)}${took ? "" : "   NO POSTURE"}`);
    anim.holdTrick(null);
    for (let i = 0; i < 90; i++) step();
  }
}

// --- taking a shape up, and letting it go ------------------------------------
// The same instrument `tools/stance-check.mjs` points at the stance swap: the
// worst single-frame joint jump. A posture is a premultiply onto live bones, so
// if it arrived or left in one frame this is where it would show.
const pose = () => [...bones.values()].map((b) => b.quaternion.clone());
const worstJump = (a, b) => {
  let worst = 0;
  for (let i = 0; i < a.length; i++)
    worst = Math.max(worst, 2 * Math.acos(Math.min(1, Math.abs(a[i].dot(b[i])))) * (180 / Math.PI));
  return worst;
};
console.log(`\nHANDOVER  (worst single-frame joint jump, degrees)`);
anim.setStance("regular");
for (let i = 0; i < 120; i++) step();
for (const move of MOVES) {
  let on = 0;
  let off = 0;
  let was = pose();
  anim.holdTrick(move);
  for (let i = 0; i < 45; i++) {
    step();
    on = Math.max(on, worstJump(was, (was = pose())));
  }
  anim.holdTrick(null);
  for (let i = 0; i < 60; i++) {
    step();
    off = Math.max(off, worstJump(was, (was = pose())));
  }
  console.log(`  ${move.padEnd(12)} taking it up ${on.toFixed(1).padStart(5)}°   letting go ${off.toFixed(1).padStart(5)}°`);
}

// --- the stance flip ---------------------------------------------------------
// The move this whole lane exists for, and until round 4 nothing could reach it.
// Read as the body's own facing in the board's frame, frame by frame, so what is
// measured is what is seen — the stance group's half-turn and the mirrored
// clip's own facing are both in there, which is why the total is not 180°.
const q = new THREE.Quaternion();
const bq = new THREE.Quaternion();
const facing = () => {
  bones.get("Hips").getWorldQuaternion(q);
  board.getWorldQuaternion(bq);
  q.premultiply(bq.invert());
  return (2 * Math.atan2(q.y, q.w) * 180) / Math.PI;
};
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * One landing, the way the ride announces it — which is the ONLY sequence the
 * turn ever runs in, and not the sequence this was measured in before.
 *
 * `SkateModel.land` resolves the spin (which zeroes the tracker) and flips the
 * stance inside its own step, and main.ts plays the landing cushion off the same
 * event, all BEFORE the animation layer's frame. So the tracker this layer reads
 * on the turn's first frame is already at zero — which is why the direction has
 * to come off a remembered hand — and the clip live under the turn is the
 * cushion, not the rolling loop.
 *
 * `spinDir` is −1 for a spin to screen-RIGHT, matching the ride's own sign.
 */
function landASpin({ spinDir = 1, dt = DT, cushion = true, teleport = false, to = "switch" }) {
  const spin = createSpinTracker();
  // …the air spin itself, so the layer has a real rate to remember.
  for (let i = 0; i < 20; i++) {
    spin.add(spinDir * 7.6 * dt); // AIR_SPIN_RATE, radians
    anim.update(dt, spin);
    board.updateMatrixWorld(true);
  }
  // The last pose the player actually SAW — read before the ride's step, not
  // after it. `setStance` swaps the mixer's action, and three.js writes a
  // binding's saved state back into the bones when the action holding it stops;
  // that is a value nothing has rendered, and reading it as the frame before
  // the turn charged 35.7° of measurement artefact to the turn.
  let last = facing();
  spin.reset(); // resolveSpin, one call before the stance flips
  if (teleport) anim.rideTurned(Math.PI); // a respawn: the ride's facing jumped
  anim.setStance(to);
  if (cushion) anim.playCushion();

  let worst = 0;
  let total = 0;
  const trace = [];
  for (let i = 0; i < Math.round(0.6 / dt); i++) {
    anim.update(dt, spin);
    board.updateMatrixWorld(true);
    const now = facing();
    const d = wrap(now - last);
    last = now;
    total += d;
    worst = Math.max(worst, Math.abs(d));
    trace.push(d);
  }
  return { worst, total, trace };
}

const settle = (stance) => {
  anim.holdTrick(null);
  anim.endCharge();
  anim.setStance(stance);
  for (let i = 0; i < 240; i++) step();
};

console.log(`\nSTANCE FLIP  (body facing in the board's frame, frame by frame)`);
settle("regular");
const flip60 = landASpin({ spinDir: -1 });
console.log(
  `  60 fps, landing a screen-right 180 — worst single frame ${flip60.worst.toFixed(1)}°, ` +
    `turned ${flip60.total.toFixed(1)}° in all`,
);
console.log(
  `  per-frame: ${flip60.trace.slice(0, 24).map((d) => d.toFixed(1)).join(" ")}`,
);
settle("regular");
const flip30 = landASpin({ spinDir: -1, dt: 1 / 30 });
console.log(
  `  30 fps — worst single frame ${flip30.worst.toFixed(1)}°, turned ${flip30.total.toFixed(1)}°`,
);
// The turn on its own, with no landing cushion under it. The difference between
// this and the line above is the cushion's own crossfade, which is a pose the
// landing is supposed to play — worth separating so the turn is not blamed for
// it, and worth printing so it is not hidden either.
settle("regular");
const bare = landASpin({ spinDir: -1, cushion: false });
console.log(
  `  the turn alone, no cushion under it — worst single frame ${bare.worst.toFixed(1)}°, ` +
    `turned ${bare.total.toFixed(1)}°`,
);
console.log(`  per-frame: ${bare.trace.slice(0, 30).map((d) => d.toFixed(1)).join(" ")}`);

// Which WAY he comes round, and the two rules that decide it.
//
// 1. It does NOT depend on which way he spun. The group's half-turn plus the
//    mirror's own 89° of facing make one arc 99.5° and the other 259.5°, and
//    the short one is taken every time — so a 180 spun screen-right and one
//    spun screen-left have to land the same numbers. A rule that chased the
//    spin instead reads 99.5 one way and −259.5 the other, at 741°/s.
// 2. Out and back must UNDO each other, or the group winds up: ride switch,
//    ride regular, ride switch and the body would have turned 300° net on a
//    deck it never left.
settle("regular");
const right = landASpin({ spinDir: -1 });
settle("regular");
const left = landASpin({ spinDir: 1 });
console.log(
  `  the arc does not depend on the spin: screen-right 180 turns ${right.total.toFixed(1)}° ` +
    `(worst frame ${right.worst.toFixed(1)}°), screen-left 180 turns ${left.total.toFixed(1)}° ` +
    `(worst frame ${left.worst.toFixed(1)}°) ` +
    `(${Math.abs(right.total - left.total) < 3 ? "same arc — correct" : "DIFFERENT — one of them is going the long way round"})`,
);
settle("regular");
const out = landASpin({ spinDir: 1, to: "switch" });
const back = landASpin({ spinDir: 1, to: "regular" });
console.log(
  `  and it unwinds: out ${out.total.toFixed(1)}°, back ${back.total.toFixed(1)}° ` +
    `(${Math.abs(out.total + back.total) < 6 ? "cancels — the group does not wind up" : "DOES NOT CANCEL"})`,
);

// …and the one case that is still allowed to arrive in one frame: a respawn,
// where the ride teleports its own facing in the same call it sets the stance
// back to regular. Easing 180° of body turn onto a skater who has just appeared
// somewhere else is a turn nobody asked for, so this SHOULD snap — and it is the
// shipping code path, not a model of it.
settle("switch");
const respawn = landASpin({ spinDir: 1, teleport: true, cushion: false, to: "regular" });
console.log(
  `  a respawn (the ride's facing jumped too) lands it in one frame: ` +
    `worst single frame ${respawn.worst.toFixed(1)}°, turned ${respawn.total.toFixed(1)}°`,
);

// --- the grab, settled -------------------------------------------------------
//
// Round 2 measured the hand 42 cm short of the deck and blamed the rig's
// proportions; round 3 was asked to confirm or refute that and wrote the
// reasoning into `POSTURES` without a standing instrument. This is the
// instrument. It is arithmetic, not opinion: if the shoulder is S above the
// soles and the arm is A long, then no pose of the shoulder and elbow can put
// the hand below S − A, and the deck's top face is 5 cm above the soles
// (`SOLE_CLEARANCE`). Print all four and the question is closed.
{
  settle("regular");
  anim.holdTrick("Grab");
  for (let i = 0; i < 60; i++) step();
  const feet = sole("Left").add(sole("Right")).multiplyScalar(0.5);
  const shoulder = at("RightArm");
  const arm =
    at("RightArm").distanceTo(at("RightForeArm")) + at("RightForeArm").distanceTo(at("RightHand"));
  const hand = at("RightHand");
  const floor = shoulder.y - arm - feet.y;
  console.log(
    `\nGRAB  shoulder ${((shoulder.y - feet.y) * 100).toFixed(1)} cm above the soles, ` +
      `arm ${(arm * 100).toFixed(1)} cm long → a DEAD STRAIGHT arm still stops at ` +
      `${(floor * 100).toFixed(1)} cm; the pose reaches ${((hand.y - feet.y) * 100).toFixed(1)} cm ` +
      `(deck top face is 5.0 cm). The gap is the rig, not the pose: ` +
      `${((hand.y - feet.y - floor) * 100).toFixed(1)} cm of it is all a pose could ever win.`,
  );
  anim.holdTrick(null);
}

// --- the push, both ways round -----------------------------------------------
// `SkaterRig` holds him 12.5 cm toward one side for the length of a push,
// because the frozen anchor is the mid-point of BOTH feet while only the front
// one is on the deck — so it sits offset toward the leg that is LEAVING. The
// mirrored push swings the other leg, so the offset changes hand and the
// correction has to change hand with it. Measured as the anchor itself: the rig
// gets this out of `readFeet`, which is where the mirror actually lands.
const anchor = { mid: new THREE.Vector3(), planted: new THREE.Vector3(), pitch: 0 };
const pushOffset = (stance) => {
  settle(stance);
  anim.startPush(0.45);
  let peak = 0;
  for (let i = 0; i < 30; i++) {
    step();
    if (!anim.feetOnBoard) {
      anim.readFeet(anim.model.parent, anchor);
      if (Math.abs(anchor.mid.x) > Math.abs(peak)) peak = anchor.mid.x;
    }
  }
  return peak * 100;
};
const pushR = pushOffset("regular");
const pushS = pushOffset("switch");
console.log(
  `\nPUSH  foot anchor at its furthest off the deck's centre line: ` +
    `regular ${pushR.toFixed(1)} cm, switch ${pushS.toFixed(1)} cm ` +
    `(${Math.sign(pushR) === -Math.sign(pushS) ? "opposite sides — the 12.5 cm hold must change hand" : "SAME side"})`,
);

// --- the tracker reset -------------------------------------------------------
// A reset is not a spin. The real tracker zeroes its PEAK when it resets, which
// is the signature this layer now reads; the stub below never touches peak,
// which is what the old rate-only rule saw — and 10° at 60 fps is 600°/s, a
// real air-spin rate that sails through a 900°/s guard.
anim.setStance("regular");
for (let i = 0; i < 120; i++) step();
const flourish = (spin) => {
  const before = { chest: twist("Spine01"), head: twist("Head") };
  step(spin);
  return Math.abs(wrap(twist("Head") - before.head)) + Math.abs(wrap(twist("Spine01") - before.chest));
};
function twist(name) {
  bones.get(name).getWorldQuaternion(q);
  board.getWorldQuaternion(bq);
  q.premultiply(bq.invert());
  return (2 * Math.atan2(q.y, q.w) * 180) / Math.PI;
}

// The body has to be SETTLED first — a tracker sitting on a residual it is not
// adding to is a body that is not turning, which is the whole point: the only
// thing that moves on the next frame is the reset itself.
console.log(`\nTRACKER RESET  (chest+head movement on the frame the tracker goes to zero)`);
const real = createSpinTracker();
real.add((10 * Math.PI) / 180); // a steering correction, not a spin
for (let i = 0; i < 3; i++) step(real);
real.reset();
console.log(`  real tracker, 10° residual → reset:   ${flourish(real).toFixed(2)}°`);
const leaky = { degrees: 10, peak: 0, reset() {}, add() {}, name: () => null, offSquare: () => 0 };
for (let i = 0; i < 3; i++) step(leaky);
leaky.degrees = 0;
console.log(`  a tracker that hides its reset:       ${flourish(leaky).toFixed(2)}°  ← the old rule`);

server.close();
