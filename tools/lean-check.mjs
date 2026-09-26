// Which way does he bank? — `node --experimental-strip-types tools/lean-check.mjs`
//
// The player, on the live build: *"when I turn left or right in switch, the
// lean stays reversed. The lean also needs to take into account whether the
// character is facing switch or regular."*
//
// A skater leans INTO the carve — his head goes to the INSIDE of the arc he is
// drawing. That is a fact about the world, not about the screen and not about
// the camera, so this harness measures it as a fact about the world:
//
//   · the LEAN direction is read off the rig's own matrices — the horizontal
//     displacement of `bank`'s up vector against its parent's, which is the
//     direction the whole assembly tipped. Not `bank.rotation.z`, and not the
//     sign of `SkateModel.lean`: either would be re-reading the code under test,
//     and the sign in that expression has now been wrong twice.
//   · the INSIDE of the carve is read off the ride's own `course`, sampled at
//     the two ends of a three-frame window. The change in a UNIT travel vector
//     points at the centre of the arc, whichever way the wheels are running.
//
// Then the whole check is one dot product: positive is leaning in, negative is
// leaning out. `bank.rotation.z` is printed in degrees beside it because that is
// the number the report quotes, but nothing is asserted on its sign directly.
//
// THE THREE WAYS OF RIDING, because the bug lived in the gap between two of
// them (DESIGN.md, 2026-07-28 — "switch is a reflection, not a neck"):
//
//   REGULAR — wheels running nose-first, body set up nose-first.
//   SWITCH  — he turned round on the deck (rolled back down a transition), so
//             the body is set up tail-first AND the wheels run tail-first.
//             `stance` flips; `SkateModel.rideSign` is −1.
//   FAKIE   — the BOARD came round under feet that did not move (a landed 180),
//             so the wheels run tail-first while the body is still set up
//             nose-first. `stance` stays regular; `rideSign` is still +1.
//
// The HUD says SWITCH for both of the last two and so does the player. The old
// lean took its direction from `rideSign`, which is right for the first two and
// mirrored for the third — and the third is the one you reach by landing a 180,
// which is how every player gets there.
//
// TWO SHORTCUTS, both deliberate, both stated:
//
//   · **A dead-flat floor.** `SurfaceProvider` is an interface the model already
//     takes (`FIELD_SURFACE`, `STREET_SPOT`), and this adds a third
//     implementation: no hills, no ramps, no walls, no rails. A carve held for a
//     second on the real block runs into a bank or a shopfront and the numbers
//     stop being about the lean — measured, on `STREET_SPOT` from its own spawn:
//     the two directions came out at 9.4 and 12.3 m/s having swept 159° and 77°,
//     because one of them climbed something. The question here is a sign in the
//     ride, so the ride is put on a floor with nothing on it. The model, the rig
//     and the frame order are the real ones.
//   · **`stance` forced by hand, on the SWITCH rows only.** `SkateModel.syncStance`
//     is the game's only writer of it and this harness never asks the game to
//     write it; it is set here for the reason `tools/switch-check.mjs` sets it —
//     the question is what the ride draws in a given stance, and it must be
//     askable without a run-up at a quarter pipe. The FAKIE rows take no such
//     shortcut: they pop, spin a real half-turn and land, and the run throws if
//     the model does not report `fakie` afterwards.

import { register } from "node:module";
import * as THREE from "three";

register(new URL("./ts-resolve.mjs", import.meta.url));
const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { SkaterRig } = await import("../src/skate/skater-rig.ts");
const { makeSample } = await import("../src/world/surface.ts");

const STEP = 1 / 60;
const DEG = 180 / Math.PI;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

/** An empty concrete plain. `softEdge` is left unset, so nothing steers him. */
const FLAT = {
  height: () => 0,
  normal: (_x, _z, out = new THREE.Vector3()) => out.set(0, 1, 0),
  sample: (_x, _z, _yHint, out = makeSample()) => {
    out.height = 0;
    out.normal.set(0, 1, 0);
    out.kind = "concrete";
    return out;
  },
  slopeAlong: () => 0,
  rails: () => [],
  blocked: () => false,
  spawn: () => ({ x: 0, z: 0, heading: 0 }),
};

function harness(speed = 0) {
  const rig = new SkaterRig(new THREE.Scene());
  const model = new SkateModel({}, FLAT);
  model.speed = speed;
  return { rig, model };
}

/** main.ts's frame order, minus the animation layer — no clip touches `bank`. */
function frame(h, input, dt = STEP) {
  h.model.update({ ...EMPTY_INPUT, ...input }, dt);
  h.rig.sync(h.model, dt);
  h.rig.followFeet(null, h.model, dt);
  h.rig.root.updateMatrixWorld(true);
}

function run(h, input, seconds, dt = STEP) {
  for (let i = 0, n = Math.round(seconds / dt); i < n; i++) frame(h, input, dt);
}

/**
 * The horizontal direction the rig TIPPED, in world space.
 *
 * `bank`'s up against its own parent's up: the parent carries the heading and
 * the ground normal, so what is left is the roll this node put in — and it is
 * read through the real matrices, so a sign that moved into another node would
 * still be caught here.
 */
function leanDirection(rig) {
  rig.root.updateMatrixWorld(true);
  const upBank = new THREE.Vector3(0, 1, 0).applyQuaternion(
    rig.bank.getWorldQuaternion(new THREE.Quaternion()),
  );
  const upParent = new THREE.Vector3(0, 1, 0).applyQuaternion(
    rig.grindYaw.getWorldQuaternion(new THREE.Quaternion()),
  );
  const tip = upBank.sub(upParent);
  tip.y = 0;
  return tip;
}

/** A unit vector down the line he is actually travelling. */
const travelOf = (course) => new THREE.Vector3(Math.sin(course), 0, Math.cos(course));

/**
 * Hold the stick over, let the bank settle, then answer the one question.
 *
 * `steer` is the raw stick: +1 is D / ArrowRight, −1 is A / ArrowLeft. The lean
 * damps at 9/s, so 0.6 s is five time constants and the settle is over; the
 * window it is then measured across is three frames, which is a few degrees of
 * arc — short enough that "the change in the travel vector" IS the direction of
 * the arc's centre rather than a chord across half a circle.
 */
function carve(h, steer) {
  run(h, { steer }, 0.6);
  const before = travelOf(h.model.course);
  const speed = h.model.speed;
  run(h, { steer }, 3 * STEP);
  const after = travelOf(h.model.course);
  const inside = after.clone().sub(before);
  const swept = Math.acos(THREE.MathUtils.clamp(before.dot(after), -1, 1)) * DEG;
  const lean = leanDirection(h.rig);
  return {
    bankDeg: h.rig.bank.rotation.z * DEG,
    speed,
    stance: h.model.stance,
    fakie: h.model.fakie,
    state: h.model.state,
    swept,
    // Normalised, so the number is a cosine: +1 fully into the carve, −1 fully
    // out of it. The sign is the answer; the magnitude is a sanity light.
    into:
      inside.lengthSq() > 1e-12 && lean.lengthSq() > 1e-12
        ? lean.normalize().dot(inside.normalize())
        : 0,
  };
}

// --- the three ways of riding ------------------------------------------------

/** Rolling nose-first, body nose-first. Pushed up to speed for real. */
function regular() {
  const h = harness(0);
  run(h, { throttle: true }, 4);
  return h;
}

/**
 * Turned round ON the deck: body tail-first, wheels tail-first. For him a
 * negative speed IS forwards, which is what makes `syncStance` leave him alone
 * (`way === facing`) instead of turning him straight back.
 */
function switchStance() {
  const h = harness(-1.5);
  h.model.stance = "switch";
  run(h, { throttle: true }, 4);
  return h;
}

/**
 * A REAL landed 180: charge, pop, hold the stick until the spin tracker has a
 * half-turn in the bank, then let it land. The board comes round, his feet do
 * not, and he rides away with the wheels running against the way he stands.
 */
function fakie(way) {
  const h = harness(0);
  run(h, { throttle: true }, 4);
  run(h, { throttle: true, chargeHeld: true }, 0.3);
  frame(h, { throttle: true, olliePressed: true, chargeHeld: false });
  if (!h.model.airborne) throw new Error("the pop never fired — the scenario tests nothing");
  let guard = 0;
  while (h.model.airborne && guard++ < 240) {
    frame(h, { steer: Math.abs(h.model.spin.degrees) < 168 ? way : 0 });
  }
  run(h, {}, 0.25); // let the wheels settle and `syncStance` answer
  if (!h.model.fakie) throw new Error("the 180 did not leave him fakie — the probe tests nothing");
  if (h.model.stance !== "regular") throw new Error("the 180 moved his feet — that is not fakie");
  return h;
}

// --- the table ---------------------------------------------------------------

const ROWS = [
  ["regular", "left", -1, regular],
  ["regular", "right", +1, regular],
  ["switch", "left", -1, switchStance],
  ["switch", "right", +1, switchStance],
  // The half-turn is spun the same way the carve then goes, so each fakie row is
  // one continuous piece of play rather than a trick and an unrelated turn.
  ["fakie", "left", -1, () => fakie(-1)],
  ["fakie", "right", +1, () => fakie(+1)],
];

console.log(
  "\nstance   turn    bank.rotation.z    speed     arc    lean·inside   verdict\n" +
    "-------------------------------------------------------------------------",
);

const rows = [];
for (const [label, turn, steer, setup] of ROWS) {
  const r = carve(setup(), steer);
  rows.push({ label, turn, steer, ...r });
  console.log(
    `${label.padEnd(8)} ${turn.padEnd(6)} ${r.bankDeg.toFixed(2).padStart(9)}°   ` +
      `${r.speed.toFixed(2).padStart(6)}  ${r.swept.toFixed(2).padStart(5)}°   ` +
      `${r.into.toFixed(3).padStart(7)}    ${r.into > 0 ? "INTO the carve" : "OUT of it"}`,
  );
}
console.log("");

const find = (label, turn) => rows.find((r) => r.label === label && r.turn === turn);

// 1. THE CHECK THAT IS THE ASK: every row leans into its own arc.
for (const r of rows) {
  check(
    `${r.label.padEnd(7)} carving ${r.turn.padEnd(5)} leans INTO the arc`,
    r.into > 0.99 && r.state === "rolling" && r.swept > 0.5,
    `bank ${r.bankDeg.toFixed(2)}°, arc swept ${r.swept.toFixed(2)}° over 3 frames, ` +
      `lean·inside ${r.into.toFixed(3)} at ${r.speed.toFixed(2)} m/s`,
  );
}

// 2. Left and right are opposites within a stance — a lean that had lost its
//    steer entirely (stuck at zero, or keyed off the speed alone) would still
//    pass check 1 for one of the two rows by luck.
for (const label of ["regular", "switch", "fakie"]) {
  const l = find(label, "left");
  const d = find(label, "right");
  check(
    `${label.padEnd(7)} left and right bank opposite ways`,
    Math.sign(l.bankDeg) === -Math.sign(d.bankDeg) && Math.abs(l.bankDeg) > 1,
    `left ${l.bankDeg.toFixed(2)}°, right ${d.bankDeg.toFixed(2)}°`,
  );
}

// 3. THE PLAYER'S SENTENCE, as a number. Riding the other way round, the same
//    key must roll the deck the OTHER way: the wheels are running the other way
//    along the plank, so leaning into the same on-screen turn is the opposite
//    roll of it. Both ways of riding the other way round are asked, because
//    `rideSign` got one of them right and that is exactly how this survived.
for (const label of ["switch", "fakie"]) {
  for (const turn of ["left", "right"]) {
    const reg = find("regular", turn);
    const other = find(label, turn);
    check(
      `${label.padEnd(7)} ${turn.padEnd(5)} is the MIRROR of regular ${turn}, not a copy`,
      Math.sign(other.bankDeg) === -Math.sign(reg.bankDeg),
      `regular ${reg.bankDeg.toFixed(2)}° vs ${label} ${other.bankDeg.toFixed(2)}°`,
    );
  }
}

// 4. The magnitude did not move: the fix is a HAND, and one that also changed
//    how hard he banks would be a feel change nobody asked for.
//
//    Grouped by speed, because how hard he banks is a function of speed and
//    always was (`turnFactor`, and the ramp to full lean). The fakie rows come
//    out of a landed 180 rather than a straight push-up, so they arrive at a
//    different speed and are entitled to a different angle — what they are NOT
//    entitled to is a different angle from each other.
{
  const groups = new Map();
  for (const r of rows) {
    const key = Math.abs(r.speed).toFixed(2);
    (groups.get(key) ?? groups.set(key, []).get(key)).push(Math.abs(r.bankDeg));
  }
  for (const [speed, band] of groups) {
    const spread = Math.max(...band) - Math.min(...band);
    check(
      `every way of riding at ${speed} m/s banks by the same AMOUNT`,
      spread < 0.01,
      `${band.length} rows: ${band.map((v) => v.toFixed(3)).join("°, ")}° — ` +
        `spread ${spread.toFixed(4)}°`,
    );
  }
  // …and across the two speeds the difference is small and explained: 13.8 m/s
  // and 15.1 m/s sit either side of `turnFactor`'s washout, so the faster one
  // banks slightly less. A sign fix has no business moving this at all.
  const reg = Math.abs(find("regular", "left").bankDeg);
  const fak = Math.abs(find("fakie", "left").bankDeg);
  check(
    "…and the two speed bands are within a couple of degrees of each other",
    Math.abs(reg - fak) < 3,
    `${reg.toFixed(2)}° at ${Math.abs(find("regular", "left").speed).toFixed(2)} m/s vs ` +
      `${fak.toFixed(2)}° at ${Math.abs(find("fakie", "left").speed).toFixed(2)} m/s`,
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
