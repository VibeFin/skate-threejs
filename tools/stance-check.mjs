// Which way round is he standing? — `node tools/stance-check.mjs`
//
// It ASSERTS now. It used to print these numbers and stop there, which made it
// a very well-instrumented way of not noticing that switch was unreachable —
// nothing in it could fail, so nobody read it, so the mirrored clip set went a
// whole round without a caller. Every readout below is still printed, because
// the numbers are what a fix is steered by; each one now also has the rule it
// is measuring attached to it.
//
// Steps the REAL animation layer (`SkaterAnim`, its real clips, the real Meshy
// rig) with no renderer, and asks the three questions a stance has to answer:
//
//   FACING  — in the BOARD's frame, 0° is square down the nose and −90° is
//             screen-right. Regular and switch must come out a clean HALF-TURN
//             apart: switch is the same take with the whole body turned round on
//             the deck, so every angle in it is the regular one plus 180°.
//             (This used to demand equal and OPPOSITE — a sagittal mirror. The
//             mirror is gone: it is a real skate stance, riding NOSE-first, and
//             this game only ever goes switch when the wheels are running the
//             other way, so it left him facing 155° off his own line. Measured
//             in the world by `tools/turn-check.mjs`, which is the frame that
//             question belongs in.)
//   FEET    — which foot is at the nose. Regular is left foot forward; switch
//             is the same skater with his right foot forward.
//   HANDOVER— the biggest single-frame joint jump across the swap. three.js
//             writes the skeleton's BIND pose back into the bones the frame an
//             action stops, so a stance change that leaves a gap shows up here
//             as tens of degrees on a body that only meant to turn round.
//
// The board's frame is the group the rig hangs in: `SKATER_YAW` lives on the
// model, so its PARENT is the deck — nose at +Z, screen-right at −X.

globalThis.self ??= globalThis;
globalThis.URL.createObjectURL ??= () => "blob:stance-check";
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

// The game's imports are extensionless — a bundler's job. Node wants the
// extension, so it is handed one on the way past; the source stays as the game
// ships it. The import below has to be dynamic for the hook to be in place.
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
const { SkaterAnim, HAND_CLIPS, RIDE_HAND_CLIP, CROUCH_HAND_CLIP } = await import(
  "../src/skate/skater-anim.ts"
);

const SKATER_URL =
  "https://assets.auras.cc/generations/cms0fbiar004o22nuyjqjhzuz/rigged-character.glb";
/** Yaw that turns the rig sideways on the deck — main.ts's SKATER_YAW. */
const SKATER_YAW = -Math.PI / 2;
const DT = 1 / 60;

// The layer fetches its motion set and its local GLBs by URL, so `public/` is
// served rather than the paths being special-cased for this harness.
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
const bound = await anim.attachHandClips(table);
console.log(`clips bound: ${bound.join(", ")}`);

// The deck: SKATER_YAW sits on the model, so the model's PARENT is the board's
// own frame — which is exactly how SkaterRig hangs him.
const board = new THREE.Group();
anim.model.rotation.y = SKATER_YAW;
board.add(anim.model);

const bones = new Map();
anim.model.traverse((o) => o.name && bones.set(o.name, o));
const v = new THREE.Vector3();
const q = new THREE.Quaternion();
const f = new THREE.Vector3();
const inv = new THREE.Matrix4();

const step = (spin) => {
  anim.update(DT, spin);
  board.updateMatrixWorld(true);
};

/**
 * Where a bone is pointing, in the board's frame. 0° = down the nose. Same
 * convention as `tools/move-film.html`'s YAW column, so the stance numbers can
 * be read against the +41° the rolling clip is known to stand at.
 */
const facing = (name) => {
  const bone = bones.get(name);
  bone.getWorldQuaternion(q);
  f.set(0, 0, 1).applyQuaternion(q);
  inv.copy(board.matrixWorld).invert();
  f.transformDirection(inv);
  return (Math.atan2(f.x, f.z) * 180) / Math.PI;
};

const boardQ = new THREE.Quaternion();
/**
 * The same bone's turn about the VERTICAL, degrees, as a swing-twist twist.
 *
 * The projection above is the readout the rest of the project uses, and on the
 * head it lies: that bone rests pitched a long way over, so its forward axis
 * sits near vertical and the projected angle swings wildly for a few degrees of
 * real turn (DESIGN.md, 2026-07-26, ~2.4× and non-linear). The twist has no
 * such singularity, which is what makes it the right instrument for the spin.
 */
const twist = (name) => {
  bones.get(name).getWorldQuaternion(q);
  board.getWorldQuaternion(boardQ);
  q.premultiply(boardQ.invert());
  return (2 * Math.atan2(q.y, q.w) * 180) / Math.PI;
};

/** Switch stance sits near a half-turn, where the readout above wraps. */
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/** …and where it IS, in the board's frame. +z is toward the nose. */
const at = (name) => {
  inv.copy(board.matrixWorld).invert();
  return v.setFromMatrixPosition(bones.get(name).matrixWorld).applyMatrix4(inv).clone();
};

/**
 * Every bone's orientation IN THE BOARD'S FRAME — which is what a player sees,
 * and not the same question as its local quaternion.
 *
 * The half-turn that puts him switch lives on a group ABOVE the skeleton, so a
 * local-quaternion comparison cannot see it at all: this readout answered 0.6°
 * for a stance swap that turns the whole body round, and would have answered
 * 0.6° just as happily if the group had snapped through 180° in one frame.
 * That is the shape of harness this round was told not to write.
 */
const pose = () => {
  board.updateMatrixWorld(true);
  const bq = new THREE.Quaternion();
  board.getWorldQuaternion(bq).invert();
  return [...bones.values()].map((b) => b.getWorldQuaternion(new THREE.Quaternion()).premultiply(bq));
};
const worstJump = (a, b) => {
  let worst = 0;
  for (let i = 0; i < a.length; i++)
    worst = Math.max(worst, 2 * Math.acos(Math.min(1, Math.abs(a[i].dot(b[i])))) * (180 / Math.PI));
  return worst;
};

const report = (label) => {
  const lf = at("LeftFoot");
  const rf = at("RightFoot");
  const front = lf.z >= rf.z ? "LEFT" : "RIGHT";
  const out = { body: facing("Hips"), head: twist("Head"), front };
  console.log(
    `  ${label.padEnd(22)} body ${out.body.toFixed(1).padStart(7)}°  ` +
      `head twist ${out.head.toFixed(1).padStart(7)}°   ` +
      `feet L z ${lf.z.toFixed(3)} / R z ${rf.z.toFixed(3)} → ${front} foot at the nose`,
  );
  return out;
};

const SETTLE = 60;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// --- the rolling stance, both ways round -------------------------------------
for (let i = 0; i < 180; i++) step();
console.log(`\nRIDE  (${RIDE_HAND_CLIP.url.slice(-24)})`);
const regular = report("regular");

// The swap, measured across the frame it happens on.
const before = pose();
anim.setStance("switch");
step();
const jump = worstJump(before, pose());
for (let i = 0; i < SETTLE; i++) step();
const switched = report("switch");
// The rolling clip is a LOOP and it never stops moving, so the two readings sit
// SETTLE+1 frames apart in its own phase. This is that phase drift on its own,
// measured the same distance apart in the same stance — anything the mirror
// comparison shows above this is the mirror's.
anim.setStance("regular");
for (let i = 0; i < SETTLE; i++) step();
const again = report("regular, one loop-phase later");
console.log(
  `  HANDOVER               worst single-frame joint jump across the swap: ${jump.toFixed(1)}°`,
);
console.log(
  `  → body ${regular.body.toFixed(1)}° vs ${switched.body.toFixed(1)}° ` +
    `(turned ${wrap(switched.body - regular.body).toFixed(1)}°, ±180 = carried round; ` +
    `the loop drifts ${(again.body - regular.body).toFixed(1)}° on its own over the same span), ` +
    `front foot ${regular.front} → ${switched.front}`,
);
// Regular is left foot forward; switch is the same skater with his RIGHT foot
// forward, and it has to swap back when he does.
//
// The half-turn the stance group carries is what does this — it takes the left
// foot to the tail all by itself. It is a necessary read and not a sufficient
// one: the feet can swap ends while the body faces entirely the wrong way, which
// is exactly what the mirrored stance did for two rounds. The angle test below
// is the other half.
check(
  "switch puts the other foot at the nose, and regular puts it back",
  regular.front === "LEFT" && switched.front === "RIGHT" && again.front === "LEFT",
  `regular ${regular.front} → switch ${switched.front} → back to ${again.front}`,
);
// …and THIS is the turn. Switch is the same pose carried a half-circle round the
// deck: body and head both land 180° from where they ride regular, and because
// the direction of travel has reversed too, that puts his gaze back down the
// line — which is the whole point, and is asserted in the world by turn-check.
//
// A reflection would read equal and OPPOSITE instead (sum ≈ 0), and that is what
// this asserted for two rounds: −45.4° against +45.4°, head sum ≈ 0. It looked
// impeccable and it shipped a skater riding backwards, because in THIS frame
// "down the line" quietly assumes the nose leads.
//
// The loop never stops moving, so its own phase drift over the same span is
// subtracted rather than assumed away.
{
  const turn = Math.abs(wrap(switched.body - regular.body));
  const headTurn = Math.abs(wrap(switched.head - regular.head));
  const drift = Math.abs(again.body - regular.body);
  check(
    "…and it is a HALF-TURN — the same pose, carried round the deck, gaze and all",
    Math.abs(turn - 180) < Math.max(10, drift * 1.5) && Math.abs(headTurn - 180) < 20,
    `body turned ${turn.toFixed(1)}° against ${drift.toFixed(1)}° of loop drift, head ${headTurn.toFixed(1)}°`,
  );
}
check(
  "…and coming round costs the body no pose jump",
  jump < 6,
  `worst single-frame joint jump across the swap ${jump.toFixed(1)}°`,
);

// --- a clip that carries a yaw correction ------------------------------------
// The crouch stands 21° off the stance and is turned back by `yaw`; the twin
// has to turn back the other way or switch reads as him standing crooked. It is
// also PARKED on its last frame, so unlike the loop above it holds still — this
// is the comparison with nothing else moving in it.
anim.startCharge();
for (let i = 0; i < 60; i++) step();
console.log(`\nCROUCH  (yaw ${CROUCH_HAND_CLIP.yaw}°, headYaw ${CROUCH_HAND_CLIP.headYaw}°) — parked`);
const cReg = report("regular");
anim.setStance("switch");
for (let i = 0; i < 60; i++) step();
const cSw = report("switch");
console.log(
  `  → body turned ${wrap(cSw.body - cReg.body).toFixed(1)}°, head ${wrap(cSw.head - cReg.head).toFixed(1)}°`,
);
// Parked, so nothing else is moving: the yaw correction has to come round WITH
// him and stay exactly the same size, or he stands crooked on the deck for as
// long as the key is held. It does so for free now — the correction is a turn
// measured in his own frame and the stance is a turn of that frame — where the
// mirrored twin had to carry a negated copy of every correction to match.
check(
  "a yaw-corrected clip carries its correction round with him",
  Math.abs(Math.abs(wrap(cSw.body - cReg.body)) - 180) < 2 &&
    Math.abs(Math.abs(wrap(cSw.head - cReg.head)) - 180) < 2 &&
    cReg.front === "LEFT" &&
    cSw.front === "RIGHT",
  `body turned ${wrap(cSw.body - cReg.body).toFixed(1)}°, head ${wrap(cSw.head - cReg.head).toFixed(1)}°, feet ${cReg.front} → ${cSw.front}`,
);

// --- the pop, both ways round ------------------------------------------------
// Every trick now asks the clip TABLE for its own take and falls back to the
// ollie's body, which is what takes the kickflip off the compiled motion set —
// the last move that still cut to it, at ~47° of hips snap. Worst single-frame
// joint jump on the frame the trick claims the body:
anim.setStance("regular");
anim.endCharge();
for (let i = 0; i < 120; i++) step();
console.log("");
const pops = [];
for (const stance of ["regular", "switch"]) {
  anim.setStance(stance);
  for (let i = 0; i < 90; i++) step();
  for (const trick of ["Ollie", "Kickflip", "Shove-it", "Grab"]) {
    for (let i = 0; i < 60; i++) step();
    const was = pose();
    anim.playTrick(trick, 0.86);
    step();
    const jumped = worstJump(was, pose());
    pops.push({ stance, trick, jumped });
    console.log(
      `POP   ${stance.padEnd(8)} ${trick.padEnd(9)} worst joint jump at the pop ` +
        `${jumped.toFixed(1).padStart(5)}°`,
    );
  }
}
{
  // The bar is the defect this replaced: the kickflip used to cut from the
  // stance to the compiled idle and jolt ~47° of hips at the pop. Anything in
  // double figures is that bug coming back, in either stance.
  const worst = pops.reduce((m, p) => (p.jumped > m.jumped ? p : m));
  check(
    "every trick takes the body without a jolt, in BOTH stances",
    worst.jumped < 10,
    `worst ${worst.jumped.toFixed(1)}° — ${worst.stance} ${worst.trick}`,
  );
}

// --- the body during a spin --------------------------------------------------
// A stand-in tracker, turned at the ride model's own air rate. The flourish is
// read as the difference between a spinning frame and the very next frame with
// the tracker taken away: one frame of the rolling loop moves the body ~0.1°,
// so what is left is the flourish and nothing else.
anim.setStance("regular");
anim.endCharge();
for (let i = 0; i < 180; i++) step();
const spin = { degrees: 0, peak: 0, reset() {}, add() {}, name: () => null, offSquare: () => 0 };
const RATE = (7.6 * 180) / Math.PI; // AIR_SPIN_RATE, degrees per second
console.log(`\nSPIN  (lead measured as twist about the vertical, in the board's frame)`);
const leads = {};
for (const stance of ["regular", "switch"]) {
  anim.setStance(stance);
  for (let i = 0; i < 60; i++) step();
  for (const dir of [-1, 1]) {
    spin.degrees = 0;
    for (let i = 0; i < 30; i++) {
      spin.degrees += dir * RATE * DT;
      step(spin);
    }
    const on = { chest: twist("Spine01"), head: twist("Head"), hips: twist("Hips") };
    // Nose-side shoulder against tail-side, NOT left against right: which
    // shoulder is at the nose changes with the stance, and the lean does not.
    const shoulders = () => {
      const l = at("LeftShoulder");
      const r = at("RightShoulder");
      return l.z >= r.z ? l.y - r.y : r.y - l.y;
    };
    const roll = shoulders();
    step(); // …and the same body with no spin to read
    const off = { chest: twist("Spine01"), head: twist("Head"), hips: twist("Hips") };
    const level = shoulders();
    leads[`${stance}:${dir}`] = {
      chest: wrap(on.chest - off.chest),
      head: wrap(on.head - off.head),
      shoulder: roll - level,
    };
    console.log(
      `  ${stance.padEnd(8)} ${dir < 0 ? "screen-RIGHT" : "screen-LEFT "} at ${RATE.toFixed(0)}°/s — ` +
        `chest ${wrap(on.chest - off.chest).toFixed(1).padStart(6)}°, ` +
        `head ${wrap(on.head - off.head).toFixed(1).padStart(6)}°, ` +
        `hips ${wrap(on.hips - off.hips).toFixed(1).padStart(5)}°, ` +
        `nose shoulder rises ${((roll - level) * 100).toFixed(1).padStart(5)} cm`,
    );
  }
}
// …and the reset a landing does, which must not read as a spin.
anim.setStance("regular");
for (let i = 0; i < 60; i++) step();
spin.degrees = 400;
step(spin);
const beforeReset = twist("Head");
spin.degrees = 0;
step(spin);
const resetMove = Math.abs(wrap(twist("Head") - beforeReset));
console.log(
  `  a landing resets the tracker 400° → 0 in one frame: head moves ` +
    `${(twist("Head") - beforeReset).toFixed(1)}° (a reset is not a spin)`,
);

// The flourish is the body LEADING the spin — he looks where he is going and
// drops the nose-side shoulder. It has to exist, it has to swap with the
// direction, and it has to do the same thing in switch: a mirrored clip set
// with an unmirrored flourish on top of it reads as him leading the wrong way
// round the moment he lands a 180.
check(
  "the spin flourish leads the turn, and swaps with it",
  ["regular", "switch"].every((s) => {
    const r = leads[`${s}:-1`];
    const l = leads[`${s}:1`];
    return (
      Math.abs(r.chest) > 3 &&
      r.chest * l.chest < 0 &&
      r.head * l.head < 0 &&
      r.shoulder * l.shoulder < 0 &&
      Math.abs(Math.abs(r.chest) - Math.abs(l.chest)) < Math.abs(r.chest) * 0.35
    );
  }),
  ["regular", "switch"]
    .map(
      (s) =>
        `${s} R${leads[`${s}:-1`].chest.toFixed(1)}°/L${leads[`${s}:1`].chest.toFixed(1)}° chest`,
    )
    .join(" · "),
);
check(
  "…and switch leads it the same amount, not the same direction as regular",
  Math.abs(Math.abs(leads["switch:-1"].chest) - Math.abs(leads["regular:-1"].chest)) <
    Math.abs(leads["regular:-1"].chest) * 0.4,
  `regular ${leads["regular:-1"].chest.toFixed(1)}° vs switch ${leads["switch:-1"].chest.toFixed(1)}° for the same screen-right spin`,
);
// …and the reset a landing does must not read as one more frame of spinning.
check(
  "a landing's tracker reset is not a spin",
  resetMove < 3,
  `head moves ${resetMove.toFixed(1)}° on the reset frame`,
);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;

server.close();
