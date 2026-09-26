// Which rail goes down? — `node tools/switch-check.mjs`
//
// The one thing about the board-axis trick fallback that a player reads
// instantly: a kickflip and a heelflip are the SAME clip and the same pop, and
// the only difference between them on screen is which rail of the deck drops
// first. Get the sign wrong and F draws G's trick — in one stance, or in both.
//
// So this drives the REAL `SkateModel` (a real pop, a real `flipSign`) through
// the REAL `SkaterRig`, in main.ts's frame order, and then asks the question
// geometrically rather than by reading the sign back out of the code that set
// it: take the point one metre out along the deck's TOE-side rail, put it
// through the rig's own matrices, and see whether it went down or up.
//
// Which rail is the toe side is the whole of the derivation, and it is worth
// writing out once:
//
//   · forward is (sin heading, 0, cos heading), so local +Z is the nose and the
//     camera sits behind looking along it. Screen-right is forward × up =
//     (0,0,1) × (0,1,0) = (−1,0,0), i.e. deck −X.
//   · a regular-footed rider has his LEFT foot toward the nose. Standing with
//     the left foot displaced toward travel puts travel 90° to the rider's
//     left, so the rider faces 90° to the RIGHT of travel — screen-right, deck
//     −X. That is the same −π/2 `SKATER_YAW` applies, from the other end.
//   · he faces over his toes, so the toe-side rail is deck −X regular, and deck
//     +X switch (the anim layer's half-turn stands him the other way round).
//   · a kickflip is flicked off the TOE-side edge of the nose and a heelflip off
//     the heel-side edge, and a foot flicking off an edge drives that edge DOWN.
//     So: kickflip drops the toe rail, heelflip drops the heel rail, in whatever
//     stance he is riding.
//
// Run: node --experimental-strip-types tools/switch-check.mjs

import { register } from "node:module";
import * as THREE from "three";

register(new URL("./ts-resolve.mjs", import.meta.url));
const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { SkaterRig } = await import("../src/skate/skater-rig.ts");
const { STREET_SPOT } = await import("../src/world/spot.ts");

const STEP = 1 / 60;
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

function harness() {
  const scene = new THREE.Scene();
  return { rig: new SkaterRig(scene), model: new SkateModel({}, STREET_SPOT) };
}

function frame(h, input, dt = STEP) {
  h.model.update({ ...EMPTY_INPUT, ...input }, dt);
  h.rig.sync(h.model, dt);
  h.rig.followFeet(null, h.model, dt);
  h.rig.root.updateMatrixWorld(true);
}

function run(h, input, seconds, watch, dt = STEP) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    frame(h, typeof input === "function" ? input(i * dt) : input, dt);
    watch?.(i * dt);
  }
}

/**
 * How far a point one metre out along one rail has risen, in the DECK's own
 * frame — `boardPitch`, the node the flip hangs directly under, so the pop's
 * nose-lift and the bank are not mixed into the answer. Positive is up. `side`
 * is the rail's x in deck space: −1 is deck −X, screen-right.
 *
 * Measured through the rig's matrices rather than off `boardFlip.rotation.z`,
 * so a sign that moved into another node would still be caught.
 */
function railRise(rig, side) {
  const p = new THREE.Vector3(side, 0, 0);
  rig.root.updateMatrixWorld(true);
  rig.boardFlip.localToWorld(p);
  rig.boardPitch.worldToLocal(p);
  return p.y;
}

/** The rider's toe-side rail, in deck x: −1 regular, +1 switch. */
const toeRail = (stance) => (stance === "switch" ? 1 : -1);

// --- 0. the flags this file drives are ones a KEYBOARD produces --------------
//
// Everything below writes `kickflipPressed` / `heelflipPressed` /
// `shoveitPressed` into the model by hand, and a hand-written input is how this
// project has twice certified a move nobody can make (round 3's empty `{}` at
// the quarter pipe; round 4's `popped` set on the line above the flag that
// gated on it). So the three flags are taken off the REAL input source first,
// driven by real key events, before any of them is trusted as an approach.
//
// It also catches the other half: these are EDGE-triggered, so holding F must
// fire one kickflip and not sixty.
{
  const listeners = {};
  const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
  globalThis.window = {
    addEventListener: (t, f) => void (listeners[t] ??= []).push(f),
    removeEventListener: () => {},
  };
  const { SkateInputSource } = await import("../src/skate/input.ts");
  const src = new SkateInputSource();
  src.attach();
  if (saved) Object.defineProperty(globalThis, "window", saved);
  else delete globalThis.window;
  src.consume(STEP); // the loop is running: a keystroke now is gameplay input
  const fire = (type, code) =>
    listeners[type]?.forEach((f) => f({ code, repeat: false, preventDefault() {} }));

  const seen = {};
  for (const [code, flag] of [
    ["KeyF", "kickflipPressed"],
    ["KeyG", "heelflipPressed"],
    ["KeyC", "shoveitPressed"],
  ]) {
    fire("keydown", code);
    let fired = 0;
    for (let i = 0; i < 8; i++) if (src.consume(STEP)[flag]) fired++;
    fire("keyup", code);
    src.consume(STEP);
    seen[flag] = fired;
  }
  check(
    "F, G and C each fire their own trick exactly once per press",
    Object.values(seen).every((n) => n === 1),
    Object.entries(seen).map(([k, n]) => `${k} ${n}× over 8 frames of the key held`).join(", "),
  );
}

// --- 1. every flip drops the rider's toe rail, in both stances ---------------
//
// The pop is real: throttle up, hold and release the trick key the way the
// input layer does, and read the deck one frame into the flip while it is still
// only a few degrees round — which is the frame a player's eye actually uses to
// tell the two tricks apart.
for (const stance of ["regular", "switch"]) {
  for (const [trick, key, wantsToe] of [
    ["Kickflip", "kickflip", true],
    ["Heelflip", "heelflip", false],
  ]) {
    const h = harness();
    // The stance is the ride's to set; forced here because this harness is
    // about what the RIG draws for a given stance, and it must be able to ask
    // about switch whether or not the ride has put him there yet. Set BEFORE
    // the run-up, because that is the real order — he lands switch, rolls, and
    // then pops.
    h.model.stance = stance;
    run(h, { throttle: true }, 2.5);
    frame(h, { throttle: true, [`${key}Pressed`]: true });
    // The FIRST frame the deck is actually round by anything — which is the
    // frame a player's eye uses to tell the two tricks apart, and the only one
    // where "which rail went down" is still a question with an answer.
    frame(h, { throttle: true });
    const flip = h.model.flip;
    const toe = railRise(h.rig, toeRail(stance));
    const heel = railRise(h.rig, -toeRail(stance));
    const droppedToe = toe < 0 && heel > 0;
    check(
      `${stance.padEnd(8)} ${trick.padEnd(9)} drops the ${wantsToe ? "toe " : "heel"} rail`,
      droppedToe === wantsToe,
      `toe rail ${(toe * 100).toFixed(1)} cm, heel rail ${(heel * 100).toFixed(1)} cm ` +
        `at flip ${flip.toFixed(2)} (down is negative)`,
    );
  }
}

// --- 2. the two tricks are opposites, and the stance flips them --------------
//
// Weaker than the test above and it is here for a reason: it is the check that
// still bites if the toe-side derivation itself is ever disputed. Kickflip and
// heelflip must draw opposite rolls in one stance, and one trick must draw
// opposite rolls in the two stances. Both were true of the code that had the
// pair swapped, which is exactly why this cannot be the only check.
{
  const roll = (stance, key) => {
    const h = harness();
    h.model.stance = stance;
    run(h, { throttle: true }, 2.5);
    frame(h, { throttle: true, [`${key}Pressed`]: true });
    for (let i = 0; i < 3; i++) frame(h, { throttle: true });
    return h.rig.boardFlip.rotation.z;
  };
  const kr = roll("regular", "kickflip");
  const hr = roll("regular", "heelflip");
  const ks = roll("switch", "kickflip");
  check(
    "kickflip and heelflip roll opposite ways",
    Math.sign(kr) === -Math.sign(hr) && kr !== 0,
    `regular kickflip ${((kr * 180) / Math.PI).toFixed(1)}°, heelflip ${((hr * 180) / Math.PI).toFixed(1)}°`,
  );
  check(
    "the same trick rolls the other way switch",
    Math.sign(ks) === -Math.sign(kr) && ks !== 0,
    `kickflip regular ${((kr * 180) / Math.PI).toFixed(1)}° vs switch ${((ks * 180) / Math.PI).toFixed(1)}°`,
  );
}

// --- 3. a shove-it does NOT change hand with the stance ----------------------
//
// A flat spin has no leading end — the deck comes back to square — so the
// half-turn that puts him switch leaves that direction alone.
{
  const yawOf = (stance) => {
    const h = harness();
    h.model.stance = stance;
    run(h, { throttle: true }, 2.5);
    frame(h, { throttle: true, shoveitPressed: true });
    for (let i = 0; i < 3; i++) frame(h, { throttle: true });
    return { yaw: h.rig.boardFlip.rotation.y, roll: h.rig.boardFlip.rotation.z };
  };
  const r = yawOf("regular");
  const s = yawOf("switch");
  check(
    "a shove-it spins the same way in both stances",
    Math.sign(r.yaw) === Math.sign(s.yaw) && r.yaw !== 0 && r.roll === 0 && s.roll === 0,
    `yaw ${((r.yaw * 180) / Math.PI).toFixed(1)}° regular / ${((s.yaw * 180) / Math.PI).toFixed(1)}° switch, roll 0 in both`,
  );
}

// --- 4. the stance cannot change hand under a deck that is still coming round -
//
// The trick was decided at the POP, so the sign belongs to the pop. If the
// stance word can move while `flip < 1` — a ground pivot resolving under a
// popped deck — reading it live would negate the roll in one frame and snap the
// plank through twice whatever it had come round.
{
  const h = harness();
  run(h, { throttle: true }, 2.5);
  frame(h, { throttle: true, kickflipPressed: true });
  for (let i = 0; i < 3; i++) frame(h, { throttle: true });
  const before = h.rig.boardFlip.rotation.z;
  h.model.stance = "switch"; // mid-flip, the frame a pivot would resolve on
  frame(h, { throttle: true });
  const after = h.rig.boardFlip.rotation.z;
  const step = Math.abs(after - before);
  check(
    "the stance flipping mid-flip does not snap the deck",
    step < 0.6,
    `deck moved ${((step * 180) / Math.PI).toFixed(1)}° on that frame ` +
      `(${((before * 180) / Math.PI).toFixed(1)}° → ${((after * 180) / Math.PI).toFixed(1)}°)`,
  );
}

// --- 5. the push side-shift changes hand with the stance ---------------------
//
// The shift exists because the frozen anchor is the mid-point of BOTH feet
// while only the front one is on the deck, so it sits offset toward the leg
// that is leaving — and the mirrored clip swings the OTHER leg. A shift that
// keeps its sign is 12.5 cm of correction pointing 12.5 cm the wrong way.
//
// The anim layer is what carries the mirror, so this is measured there rather
// than here (`tools/stance-check.mjs`, PUSH). Recorded so the two halves of the
// question are not both assumed to live in the other file.

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} passed` +
    (failed.length ? `\nFAILED: ${failed.map((f) => f.name).join(", ")}` : ""),
);
process.exitCode = failed.length ? 1 : 0;
