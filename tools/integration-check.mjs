// The integration, driven headless — the frame order main.ts actually runs.
//
// This is the one thing tsc cannot tell you: whether the ride, the rig, the
// grinder and the trick book still agree once they are wired to each other.
// It steps the REAL `SkateModel` over the REAL street spot and drives the REAL
// `SkaterRig` in main.ts's own order — model → sync → followFeet — with no
// renderer, which is exactly the state the game boots in before the character
// streams down. The score checks add the REAL `Hud` over a stub document,
// because the number on screen is the only score there is; the ragdoll checks
// add a synthetic skeleton, because the solver is what is under test and this
// file stays offline and deterministic.
//
// It runs at 30, 60 and 144 fps wherever a finding was frame-rate shaped, which
// is most of round 3: a launch that fired at 60 and not at 45, a wall charged
// once per piece of a walked step, a ragdoll measured only ever at 1/60.
//
// ROUND 7 is a single word — the slide key — and it is the plainest
// illustration of this file's own first rule that the project has produced. (It
// was X then and it is SHIFT now: the grind and the grab traded keys on
// 2026-07-29, because a grind is seconds of holding and a grab is a stab.)
//
// Milestone 12 made the grind a HELD KEY: `HOLD SHIFT`, and `tryCatchGrind`
// refuses every catch the Grinder offers while `slideHeld` is false. Nothing in this
// file pressed it. `frame()` merges over `EMPTY_INPUT`, which sets
// `slideHeld: false`, and no `pframe` hold list contained the slide key — so
// from that change onward all TWELVE grind and boardslide cases here were unreachable.
// They were red because the key was never pressed, and a night was spent
// reading them as a broken grind. Measured on the way back in: the handrail
// case answered 0/6 at every frame rate without Shift and 6/6 at every frame rate
// with it, and "a rail catch places him" went from `only 0/25 approaches caught
// the rail — the check measured nothing` to 25/25, no teleport, 100% of speed
// kept. A harness that reports a FALSE RED is worse than one that reports a
// false green: a false green hides a bug, a false red hides a fix.
//
// So every case that asks a line for anything holds Shift for the part of the
// approach a hand would hold it, and the three cases that assert a line must
// REFUSE him hold it too — "rolling along a ledge is not a grind", "riding the
// transition never hands you a grind on the way up" and the pop's "STAYS out"
// are all strictly stronger with the key down, because they then say the line
// refuses him EVEN WHEN HE ASKS rather than saying nobody asked. Each of the
// three carries its own note on the choice; the pop's is the one with numbers
// on both sides of it.
//
// ROUND 6 added the instrument this file has never had, and every case that
// touches an obstacle now carries it:
//
// · **SPEED RETAINED.** Nothing in this repo measured what a player has LEFT
//   after using an obstacle. `rideOut()` answered `ride` / `slam` / `hung` and
//   `launch()` answered `bailed`, so a quarter pipe that spat him out at
//   0.00 m/s scored 7/7 PASS for four rounds — he had not bailed, so he had
//   "ridden" it. An obstacle that leaves you standing still has not been
//   ridden. `kept` is now on every obstacle answer, `ROLL_AWAY_MIN` is the
//   floor, and the assertions are on the floor rather than on the bail.
//
// · **Every assertion carries the break it was WATCHED FAILING against.** The
//   fourth argument to `check()` names the deliberate defect that turned it
//   red — the file, the edit, and the number it produced. An assertion with no
//   such note prints UNPROVEN and is counted at the bottom, because an
//   assertion nobody has watched fail is a guess and round 5 proved it: a
//   verifier deleted a guard outright and the check went on passing.
//
// ROUND 5 changed what a case is allowed to assert, twice over:
//
// · **The outcome is the RIDE-AWAY, never the approach.** "He caught the rail"
//   and "he got over the rail" were both scored as the rail working, which is
//   how "you cannot ollie the six-stair" hid for four rounds behind a rail check
//   that was 100% green. A case now runs until he is rolling again or on the
//   floor, and what it reports is which.
//
// · **The input is a KEYBOARD.** `hands()` drives the real `SkateInputSource`
//   with real key events, so an approach this file certifies is one a player can
//   physically produce. Hand-built input objects are how round 3 certified a
//   quarter pipe nobody had ridden (an empty `{}`) and how round 4 certified a
//   pop at the lip that was set `popped` on the line above. The plain `frame()`
//   path stays for cases about the MODEL's own rules — a landing, a wall, a
//   bone — where there is no player in the question at all.
//
// Run: node --experimental-strip-types tools/integration-check.mjs

import { register } from "node:module";
import * as THREE from "three";

register(new URL("./ts-resolve.mjs", import.meta.url));
const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { SkaterRig } = await import("../src/skate/skater-rig.ts");
const { SkateInputSource } = await import("../src/skate/input.ts");
const { STREET_SPOT, SPOT_MAX_Z, SPOT_MIN_Z, QP_LIP_Z, QP_HEIGHT } =
  await import("../src/world/spot.ts");

const STEP = 1 / 60;

function harness(events = {}) {
  const scene = new THREE.Scene();
  const rig = new SkaterRig(scene);
  const h = { rig, bailed: false };
  // Every harness records the bail, because "did he ride away" is the question
  // behind most of this file and a case that has to remember to wire `onBail`
  // is a case that will one day forget. The caller's own handler still runs.
  h.model = new SkateModel(
    {
      ...events,
      onBail: (...a) => {
        h.bailed = true;
        events.onBail?.(...a);
      },
    },
    STREET_SPOT,
  );
  let keys = null;
  Object.defineProperty(h, "keys", { get: () => (keys ??= hands()) });
  return h;
}

/** One frame, in main.ts's order. Returns nothing — read the model and the rig. */
function frame(h, input, dt = STEP) {
  const full = { ...EMPTY_INPUT, ...input };
  h.model.update(full, dt);
  h.rig.sync(h.model, dt);
  h.rig.followFeet(null, h.model, dt);
  h.rig.root.updateMatrixWorld(true);
  return full;
}

/**
 * `dt` is a parameter and not a constant because half the round-3 findings were
 * frame-rate bugs: a wall charged per piece of a walked step, a launch that
 * fired at 60 fps and not at 45. A harness that only ever runs at 1/60 cannot
 * see either.
 */
function run(h, input, seconds, watch, dt = STEP) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    frame(h, typeof input === "function" ? input(i * dt) : input, dt);
    watch?.(i * dt);
  }
}

/**
 * A pair of hands on a real keyboard, feeding the real `SkateInputSource`.
 *
 * Every input object in this file used to be written by hand, and twice that
 * has certified an approach nobody can make: round 3's quarter pipe was ridden
 * with `{}` and round 4's pop at the lip set its own `popped` flag on the line
 * above the flag it gated on. A key is DOWN or it is UP; what falls out of that
 * is the input layer's business, and it has rules — Space fires on RELEASE, a
 * flip or a push during the wind-up SPENDS it, and a keystroke nobody is reading
 * does not queue. Ask for a held set, get whatever a player would actually get.
 *
 * `hold` is the set of key codes down THIS frame. The driver diffs it against
 * last frame and fires the keydown/keyup that a hand moving would have fired.
 */
function hands() {
  const listeners = {};
  const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
  globalThis.window = {
    addEventListener: (t, f) => void (listeners[t] ??= []).push(f),
    removeEventListener: () => {},
  };
  const src = new SkateInputSource();
  src.attach();
  if (saved) Object.defineProperty(globalThis, "window", saved);
  else delete globalThis.window;
  // The loop was already running when the hands arrived — without one read the
  // source decides nothing is listening and swallows the first keystroke, which
  // is the title-screen rule and not the in-play one.
  src.consume(STEP);

  const down = new Set();
  const fire = (type, code) =>
    listeners[type]?.forEach((f) => f({ code, repeat: false, preventDefault() {} }));
  return {
    /** Hold exactly these codes, and read the frame's input off the source. */
    frame(hold, dt = STEP) {
      const want = new Set(hold);
      for (const code of [...down]) {
        if (!want.has(code)) {
          fire("keyup", code);
          down.delete(code);
        }
      }
      for (const code of want) {
        if (!down.has(code)) {
          fire("keydown", code);
          down.add(code);
        }
      }
      return src.consume(dt);
    },
    reset: () => src.takeReset(),
  };
}

/** One frame with a player's hands on it, in main.ts's order. */
function pframe(h, hold, dt = STEP) {
  const input = h.keys.frame(hold, dt);
  h.model.update(input, dt);
  h.rig.sync(h.model, dt);
  h.rig.followFeet(null, h.model, dt);
  h.rig.root.updateMatrixWorld(true);
  return input;
}

/**
 * SPEED RETAINED — the floor an obstacle has to leave you above.
 *
 * THE missing instrument, and the one that hid a blocker for four rounds. A
 * skater who uses a ramp, a stair set or a rail comes off it ROLLING; that is
 * the whole of why you use it. Nothing here measured that, so every check that
 * touched an obstacle scored the absence of a bail — and "he did not fall over"
 * is true of a man standing still.
 *
 * 2 m/s is walking pace and it is deliberately generous: a push gets him to
 * 8–16, an ordinary ollie lands at 6–14, and anything the player would describe
 * as "it stopped me dead" measures under 1. A bar at 2 accuses nothing that
 * works and cannot be satisfied by a dead stop.
 */
const ROLL_AWAY_MIN = 2;

/**
 * Ride an approach out to its ANSWER, which is one of three words and never
 * "he reached the obstacle".
 *
 *   ride — he is rolling (or grinding) again and never went down,
 *   slam — he bailed, and `where` says at what z it happened,
 *   hung — still in the air when the clock ran out, which is a harness bug and
 *          is reported as one rather than counted as either.
 *
 * …and `kept`, which is the answer to the question none of those three words
 * contains: how fast is he going now. Read on the frame he is rolling again,
 * which is the number on the speed bar as he rides out of the obstacle, and
 * reported beside `entry` so a case can say what the obstacle COST as well as
 * what it left. `dead` is the player's own word for it.
 *
 * This is the instrument round 4 was missing. A rail case that stopped at the
 * lock-on could not tell a grind he rode away from a grind he was thrown out
 * of, and a stair case that stopped at the pop counted an ollie that sailed over
 * everything and cased the landing as a success. Round 5's could tell those
 * apart and still could not tell a ride-away from a dead stop.
 */
function rideOut(h, hold, seconds, dt = STEP) {
  let t = 0;
  let airborne = false;
  let answered = false;
  // The speed he took INTO the obstacle — read on the last grounded frame, not
  // at the top of the run. These cases usually start from a standstill and push
  // up to the lip, so the speed on frame 0 is zero and `kept − entry` off it is
  // a number about the run-up rather than about the obstacle.
  let entry = Math.abs(h.model.speed);
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n && !h.bailed; i++) {
    if (!airborne) entry = Math.abs(h.model.speed);
    pframe(h, typeof hold === "function" ? hold(t) : hold, dt);
    t += dt;
    // Answered once he has been in the air (or on a line) and is back on the
    // wheels: an ollie that landed and rolled on is a ride-away whatever it does
    // for the next three seconds.
    if (airborne && (h.model.state === "rolling" || h.model.state === "grind")) {
      answered = true;
      break;
    }
    airborne ||= h.model.state !== "rolling";
  }
  const out = h.bailed ? "slam" : answered ? "ride" : airborne ? "hung" : "never left";
  const kept = h.bailed ? 0 : Math.abs(h.model.speed);
  return {
    out,
    z: h.model.position.z,
    x: h.model.position.x,
    t,
    airborne,
    entry,
    kept,
    dead: out === "ride" && kept < ROLL_AWAY_MIN,
  };
}

/**
 * The ride's own gravity, MEASURED off a frame of flight rather than retyped.
 *
 * `GRAVITY` is a module constant inside skate-model.ts and a second copy of it
 * here is a second thing that has to stay true. The drop-in check used to carry
 * one, and it carried 9.81 against the ride's 17 — so its "free fall would pay
 * at least this" floor sat a third below anything the game could produce, and
 * would have passed a transition that gave back two-thirds of the drop.
 */
const GRAVITY = (() => {
  const h = harness();
  h.model.position.y += 40; // well clear of anything to land on
  h.model.state = "air";
  h.model.vy = 0;
  const dt = 0.05;
  frame(h, {}, dt);
  return -h.model.vy / dt;
})();

const results = [];
/**
 * `proof` is the deliberately broken code this assertion was WATCHED going red
 * against — the file, the edit, and the number it printed while red.
 *
 * It is a required argument in spirit and an optional one in JavaScript, which
 * is the point: an assertion nobody has watched fail prints UNPROVEN and is
 * counted at the bottom of the run, so a guess cannot sit quietly in a green
 * column. Round 5 is why. A verifier deleted `LIMIT_TURN_RATE`'s whole guard
 * and the assertion named after it stayed green; the same round scored the
 * quarter pipe `rode: !bailed` and reported 7/7 on seven dead stops. Both were
 * written in good faith, and both were guesses.
 *
 * The note is not decoration — it is the recipe. Anyone can re-apply the edit
 * it names and watch the same red.
 */
const check = (name, pass, detail, proof) => {
  results.push({ name, pass, detail, proof: proof ?? null });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}` +
      (proof ? "" : "   [UNPROVEN — never watched failing]"),
  );
};

// --- 1. the world is the street spot, and the rig lands on it ----------------
{
  const h = harness();
  const spawn = STREET_SPOT.spawn();
  const dy = Math.abs(h.model.position.y - STREET_SPOT.height(spawn.x, spawn.z));
  check(
    "spawns on the spot, not at the origin",
    Math.abs(h.model.position.x - spawn.x) < 1e-9 && dy < 1e-9 && h.model.position.y > 1,
    `(${h.model.position.x}, ${h.model.position.y.toFixed(3)}, ${h.model.position.z}) on the platform`,
  );
  run(h, { throttle: true }, 1.5);
  h.rig.root.updateMatrixWorld(true);
  const board = new THREE.Vector3().setFromMatrixPosition(h.rig.boardPitch.matrixWorld);
  const floor = STREET_SPOT.height(board.x, board.z, board.y + 0.15);
  check(
    "the deck rides the queried floor",
    Math.abs(board.y - floor - 0.055) < 0.02,
    `deck axle ${board.y.toFixed(3)}, floor ${floor.toFixed(3)}`,
  );
}

// --- 2. the rig tilts onto the spot's normal, not the old sine field ---------
{
  const h = harness();
  let maxTilt = 0;
  let normalSeen = 0;
  run(h, { throttle: true }, 6, () => {
    // Angle between the rig's own up and world up.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(h.rig.tilt.quaternion);
    maxTilt = Math.max(maxTilt, (Math.acos(Math.min(1, up.y)) * 180) / Math.PI);
    normalSeen = Math.max(normalSeen, 1 - h.model.surfaceNormal.y);
  });
  check(
    "the deck lies onto the bank it is rolling down",
    maxTilt > 5,
    `worst rig tilt ${maxTilt.toFixed(1)}°, model normal off vertical ${(normalSeen * 100).toFixed(1)}%`,
  );
}

// --- 3. you OLLIE onto a ledge; rolling never puts you on one ----------------
// The rule changed in round 2 and this test changed with it. Every ledge line
// in the plaza lies flush on the top face of the thing it is the edge of, so a
// rolling board is level with the kerb beside it and no measurement separates
// "trucks on the kerb" from "wheels on the pavement" — 237 of 576 straight
// twelve-second rolls used to end locked onto a line with nothing pressed. A
// grind now starts when the board leaves the floor, which has to be checked
// BOTH ways round or the fix reads as the grind being broken.
//
// MILESTONE 12 put a key in front of both halves — `HOLD SHIFT`, and the rail only
// takes you while it is down — and BOTH halves hold it, which is the stronger
// reading of each. The rolling half asks the hard version of the question: the
// ledge refuses a board that never left the floor EVEN THOUGH he is asking for
// it, which is the only version that still measures the `crest` rule rather
// than measuring an unpressed key. (With Shift up this half is green against a
// model with `crest` deleted outright, and that is precisely the round-5 defect
// this file exists to refuse.) The popping half plainly needs it: Shift down is how
// a player takes a ledge.
{
  const line = STREET_SPOT.rails().find((r) => r.id === "ledge-long-e");
  const axis = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);

  const rolled = [];
  const a = harness({ onGrindStart: (kind, l) => rolled.push([kind, l.id]) });
  a.model.position.set(line.a.x, line.a.y, line.a.z + 0.4);
  a.model.heading = axis;
  a.model.speed = 7;
  run(a, { slideHeld: true }, 1.2);
  check(
    "rolling along a ledge is not a grind, even with Shift held",
    rolled.length === 0 && a.model.state === "rolling",
    rolled.length ? `caught ${rolled[0][0]} on ${rolled[0][1]}` : "declined, still rolling",
    "src/skate/grind.ts — round 2's rule reverted, both halves of it: `if (q.grounded) return null` " +
      "and `if (this.airPeak - _hit.yNow < w.crest) continue` removed — `caught fifty on ledge-long-e`",
  );

  const popped = [];
  const b = harness({ onGrindStart: (kind, l) => popped.push([kind, l.id]) });
  b.model.position.set(line.a.x, line.a.y, line.a.z + 0.4);
  b.model.heading = axis;
  b.model.speed = 7;
  frame(b, { olliePressed: true, slideHeld: true });
  run(b, { slideHeld: true }, 1.2);
  check(
    "…and popping onto it is",
    popped.length === 1 && b.model.state === "grind",
    popped.length ? `${popped[0][0]} on ${popped[0][1]}` : "no catch off the ollie",
    "src/skate/skate-model.ts `tryCatchGrind` — the slide gate read the wrong way round, " +
      "`if (!this.slideWanted)` → `if (this.slideWanted)`: `no catch off the ollie`",
  );
}

// --- 4. a boardslide turns the deck AND the rider across the line ------------
//
// RIDDEN onto the bar, not placed on it. This case used to set `state = "air"`
// and `vy = -2` by hand with `velX`/`velZ` left at zero, which is a board with
// no flight path at all: it fell straight down out of a hover 15 cm over the
// rail. Everything below was true of a trick no player could reach, and the
// Grinder was being asked a question — which way is this board GOING — that the
// case had deleted the answer to. He now rides at the bar square across it and
// ollies over, with a keyboard.
{
  const line = STREET_SPOT.rails().find((r) => r.id === "flat-bar");
  const axis = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
  const mid = line.a.clone().lerp(line.b, 0.4);
  const across = axis + Math.PI / 2;
  const v = 8;
  const h = harness();
  // The lead is the whole approach: an ollie is 1.59 m over 0.86 s, so popping
  // close in sails a metre over a 0.35 m bar. Measured, this bar takes a
  // square-across ollie at 8 m/s from 0.70 s to 0.90 s of lead and from nowhere
  // else — 0.80 is the middle of that window rather than a lucky number.
  const lead = 0.8;
  h.model.position.set(
    mid.x - Math.sin(across) * v * lead,
    STREET_SPOT.height(mid.x - Math.sin(across) * v * lead, mid.z),
    mid.z - Math.cos(across) * v * lead,
  );
  h.model.heading = across;
  h.model.speed = v;
  // Hold Space, let go: the ollie fires on the release, which is the only way a
  // player has of producing one. Shift is down from the first frame and stays down
  // through the flight and the slide — milestone 12's `HOLD SHIFT`, and a player
  // aiming a square-across ollie at a bar is asking for the bar before he pops,
  // not after. The catch is the only thing the key gates (`tryCatchGrind`), so
  // holding it past the lock-on costs nothing and is what a hand does.
  pframe(h, ["Space", "KeyE"]);
  pframe(h, ["Space", "KeyE"]);
  pframe(h, ["KeyE"]);
  for (let i = 0; i < Math.round(1.4 / STEP) && h.model.state !== "grind"; i++)
    pframe(h, ["KeyE"]);
  // …and then ride it, because the rig EASES the deck across the line rather
  // than snapping it there. Reading `grindYaw` on the catch frame answers 0.0°
  // for a boardslide that is working.
  for (let i = 0; i < Math.round(0.4 / STEP); i++) pframe(h, ["KeyE"]);
  const kind = h.model.grindState?.kind ?? "none";
  const deck = (h.rig.grindYaw.rotation.y * 180) / Math.PI;
  // The board's world facing = root heading + grindYaw. It must equal the
  // Grinder's own answer, or the deck is drawn along a line it is sliding
  // sideways down.
  const world = h.model.heading + h.rig.grindYaw.rotation.y;
  const want = h.model.grindState ? h.model.grind.boardHeading(h.model.grindState) : 0;
  check(
    "a boardslide draws the deck across the rail",
    (kind === "boardslide" || kind === "tailslide") && Math.abs(deck) > 60,
    `${kind}, deck ${deck.toFixed(1)}° off the line of travel`,
    "src/skate/grind.ts `settleAngle` — `boardslide` settles at `Math.PI / 2` → `0` — " +
      "`boardslide, deck 0.0° off the line of travel`",
  );
  check(
    "…and the drawn facing is the Grinder's own",
    Math.abs(Math.atan2(Math.sin(world - want), Math.cos(world - want))) < 1e-9,
    `rig ${((world * 180) / Math.PI).toFixed(2)}° vs grinder ${((want * 180) / Math.PI).toFixed(2)}°`,
    "src/skate/skater-rig.ts — `boardHeading(...) - skate.heading` given a 0.05 rad limp: " +
      "`rig 92.86° vs grinder 90.00°`",
  );
  // …and it comes back square rather than snapping when he leaves it.
  //
  // SHIFT UP for this one frame, and it is the only place in this section where the
  // key is off. Nothing here is a question about a player: the model is put in
  // the air by hand and what is under test is the RIG's unwind, so the plain
  // `frame()` path is right (see the header). Leaving Shift down would be actively
  // wrong — the bar is 15 cm under him and the frame would offer him the line
  // straight back, which measures a re-catch instead of an unwind.
  const before = h.rig.grindYaw.rotation.y;
  h.model.state = "air";
  h.model.grindState = null;
  frame(h, {});
  const jump = Math.abs(h.rig.grindYaw.rotation.y - before);
  check(
    "leaving it unwinds the deck instead of snapping it flat",
    jump > 1e-4 && jump < Math.abs(before) * 0.5,
    `${((jump * 180) / Math.PI).toFixed(1)}° in the first frame off a ${((Math.abs(before) * 180) / Math.PI).toFixed(0)}° slide`,
    "src/skate/skater-rig.ts — the off-line `THREE.MathUtils.damp(grindYaw.rotation.y, 0, GRIND_UNWIND, dt)` " +
      "replaced by a bare `0` — `90.0° in the first frame off a 90° slide`",
  );
}

// --- 5. the three flip tricks are three different board axes -----------------
{
  const seen = {};
  for (const [key, id] of [
    ["kickflipPressed", "kickflip"],
    ["heelflipPressed", "heelflip"],
    ["shoveitPressed", "shoveit"],
  ]) {
    const h = harness();
    run(h, { throttle: true }, 1.2);
    frame(h, { olliePressed: true, [key]: true });
    run(h, {}, 0.2);
    seen[id] = {
      z: h.rig.boardFlip.rotation.z,
      y: h.rig.boardFlip.rotation.y,
      flip: h.model.flip,
    };
  }
  // WHICH way, not just "opposite ways". Asking only whether the two disagree
  // is how the pair survived three rounds drawing each other: the rig's flip
  // sign was inverted, so every kickflip lifted the toe rail 50 cm — a heelflip
  // — and every heelflip dropped it, and a check comparing them to one another
  // was satisfied by the swap. The rider faces deck −X in regular stance
  // (`SKATER_YAW`, and the same answer from left-foot-forward geometry), a
  // kickflip flicks off the TOE edge, and a foot flicking off an edge drives it
  // DOWN — a positive roll about +Z lowers the point at −X. So a kickflip is
  // positive here and a heelflip is negative, and there is no reading of the
  // board under which that is a matter of taste. `tools/switch-check.mjs` asks
  // the same question in centimetres of rail, in both stances.
  check(
    "a kickflip drops the rider's toe rail, a heelflip his heel rail",
    seen.kickflip.z > 0.1 && seen.heelflip.z < -0.1,
    `kickflip ${seen.kickflip.z.toFixed(2)} rad (+ = deck −Shift down = toe side, regular), heelflip ${seen.heelflip.z.toFixed(2)} rad`,
  );
  check(
    "a shove-it spins it flat instead",
    Math.abs(seen.shoveit.y) > 0.1 && seen.shoveit.z === 0 && seen.kickflip.y === 0,
    `shove-it yaw ${seen.shoveit.y.toFixed(2)} rad, roll ${seen.shoveit.z}`,
  );
  // …and each of the three ends where it started, which is the whole reason the
  // deck turns a full 360 rather than a half — the model snaps `flip` to 1 and
  // this node to zero on one frame, and a board left halfway round would jump
  // on it. It is also why the callout is "360 Shove-it".
  {
    const jumps = {};
    for (const [key, id] of [
      ["kickflipPressed", "kickflip"],
      ["heelflipPressed", "heelflip"],
      ["shoveitPressed", "shoveit"],
    ]) {
      const h = harness();
      run(h, { throttle: true }, 1.2);
      frame(h, { olliePressed: true, [key]: true });
      // The board turns ~30°/frame while it is coming round, so a per-frame
      // delta means nothing on its own. What matters is the CATCH frame: the
      // deck snaps to zero the instant `flip` reaches 1, and the question is
      // whether it was already there. A whole turn ends one frame's worth short
      // of square and the snap is invisible; a HALF turn would end 165° out and
      // the catch would be a jump you could see across the plaza.
      let spinning = 0;
      let rate = 0;
      let last = 0;
      run(h, {}, 1.2, () => {
        const now = Math.hypot(h.rig.boardFlip.rotation.z, h.rig.boardFlip.rotation.y);
        if (h.model.flip < 1) {
          rate = Math.max(rate, Math.abs(now - last));
          spinning = now;
        }
        last = now;
      });
      // Distance from square on the last frame it was still coming round.
      jumps[id] = { snap: Math.abs(Math.atan2(Math.sin(spinning), Math.cos(spinning))), rate };
    }
    check(
      "…and the deck catches square instead of jumping",
      Object.values(jumps).every((j) => j.snap <= j.rate * 1.2),
      Object.entries(jumps)
        .map(
          ([k, j]) =>
            `${k} ${((j.snap * 180) / Math.PI).toFixed(1)}° off square, spinning at ${((j.rate * 180) / Math.PI).toFixed(1)}°/frame`,
        )
        .join(" · "),
    );
  }
}

// --- 6. a manual rakes the rider with the deck ------------------------------
{
  const h = harness();
  const manuals = [];
  const g = harness({ onManual: (on, nose) => manuals.push(on ? (nose ? "nose" : "tail") : false) });
  run(g, { throttle: true }, 1.2);
  run(g, { throttle: true, manualHeld: true }, 0.6);
  check(
    "E puts him in a manual and says so once",
    manuals.length === 1 && manuals[0] === "tail" && g.model.boardPitch < -0.2,
    `deck ${((g.model.boardPitch * 180) / Math.PI).toFixed(1)}°, rider ${((g.rig.stand.rotation.x * 180) / Math.PI).toFixed(1)}°`,
  );
  // The MEASURE is unchanged and still correct: `stand` carries the deck's rake
  // so the two soles stay in the griptape's plane — 35 cm apart along a deck
  // raked 17° is 5.2 cm of height between them, and levelling the whole rider
  // drives the front shoe through the board. What changed on 2026-07-29 is the
  // NAME: the rider no longer LEANS with the deck. `POSTURES.Manual.lean`
  // cancels this rake at the waist, so the rake lives on the legs and pelvis and
  // the torso comes back to vertical — the player's "it's just his legs".
  check(
    "the rake reaches his legs, so both soles stay in the deck's plane",
    Math.abs(g.rig.stand.rotation.x - g.model.boardPitch) < 0.02,
    `stand ${g.rig.stand.rotation.x.toFixed(3)} vs boardPitch ${g.model.boardPitch.toFixed(3)}`,
  );
  // Q is a different trick, not the same one with the deck the other way up —
  // the controls screen offers two and the body has a weight shift for each,
  // so rolling straight from E into Q has to be announced.
  const ends = [];
  const n = harness({ onManual: (on, nose) => ends.push(on ? (nose ? "nose" : "tail") : false) });
  run(n, { throttle: true }, 1.2);
  // Two 0.3 s holds, not two 0.4 s ones. The spot's own geometry moved under
  // this test — the platform's north lip is nearer than it was — and at 0.4 s
  // apiece he is off the edge and airborne by the time Q is asked for, so the
  // manual is correctly dropped and the check read a defect that is the ride
  // working. The trick being measured is the HANDOVER, which takes one frame.
  run(n, { throttle: true, manualHeld: true }, 0.3);
  run(n, { throttle: true, manualHeld: true, noseManualHeld: true }, 0.3);
  check(
    "…and Q is a nose manual, not the same trick upside down",
    ends.join(",") === "tail,nose" && n.model.boardPitch > 0.2,
    `E → Q said ${ends.join(" → ")}, deck ${((n.model.boardPitch * 180) / Math.PI).toFixed(1)}°`,
  );

  // …and a manual runs out on its own rather than lasting forever.
  //
  // ROUND 6: this asserted `manuals[last] === false` on a rider crossing the
  // whole spot, and the last event being a drop is true of a manual that ran
  // out, a manual interrupted by a kerb, and a manual that was never held. It
  // was the third. Replayed: from the platform with the throttle down he leaves
  // the ground at 1.98 s, 0.78 s into the hold — the six-stair lip — is re-armed
  // on the landing, dropped again at 3.67 s and 5.02 s (the quarter pipe), and
  // the events came out `tail, false, tail, false, tail, false`. Three manuals,
  // none of them longer than 1.42 s, and `MANUAL_MAX_HOLD` is 4. The check was
  // certifying a constant its data never once reached.
  //
  // So it is run where nothing can interrupt it — west to east along the raised
  // platform, 52 m of dead-flat concrete and the longest uninterrupted line in
  // the spot — and what is asserted is the DURATION, against the constant, with
  // the wheels never leaving the floor.
  //
  // COASTING, not on the throttle. With the push key held he is at 16 m/s
  // inside a second and covers 80 m in the six the timeout needs, which is
  // longer than the block: every route in the spot ends in a kerb, a lip or a
  // wall, and that is what the old case kept measuring. Let go and he crosses
  // 43 m over the same six seconds and is still doing 3.2 m/s at the end of it,
  // well clear of `MANUAL_MIN_SPEED`, so the only thing that can end this hold
  // is the hold itself.
  {
    const said = [];
    let t = 0;
    let sawAir = false;
    const m = harness({ onManual: (on) => said.push([t, on]) });
    m.model.position.set(-26, STREET_SPOT.height(-26, -24), -24);
    m.model.heading = Math.PI / 2;
    m.model.speed = 14;
    for (let i = 0; i < Math.round(6 / STEP); i++) {
      frame(m, { manualHeld: true });
      t += STEP;
      sawAir ||= m.model.state !== "rolling";
    }
    const up = said.find(([, on]) => on);
    const down = said.find(([, on]) => !on);
    const ran = up && down ? down[0] - up[0] : null;
    check(
      "a manual times out instead of running for ever",
      !sawAir &&
        said.length === 2 &&
        ran !== null &&
        Math.abs(ran - 4) < 0.25 &&
        m.model.holding === null,
      sawAir
        ? "left the ground mid-hold — the case measured an interruption, not a timeout"
        : `held Shift for six seconds on the flat: ${said.length} events, the manual ran ${ran === null ? "and never ended" : `${ran.toFixed(2)} s`} against MANUAL_MAX_HOLD = 4`,
      "src/skate/tricks.ts `MANUAL_MAX_HOLD` 4 → 400 — `the manual ran and never ended`, 1 event",
    );
  }
  void h;
}

// --- 7/8. THE SCORE, read off the HUD, because it is the only one -----------
//
// The model used to keep a `score` of its own and these two checks read it —
// which is exactly why they passed while the number on screen was something
// else. It was a running total of BASE trick values, so it disagreed with the
// player's score by the entire combo multiplier. That field is gone; the score
// lives in `Hud.commitBank` and nowhere else, so the harness boots the real HUD
// over a stub document and wires it the way main.ts wires it, in main.ts's own
// event order (bank on the landing, links behind it, `hud.update` last).
const { installDom } = await import("./dom-stub.mjs");
installDom();
const { Hud } = await import("../src/ui/hud.ts");

/**
 * The model, the rig and the HUD, wired to each other exactly as boot does.
 *
 * `extra` is COMPOSED onto the boot wiring, never spread over it. A plain
 * `{ ...boot, ...extra }` means a case that wants to watch `onManual` go by
 * silently deletes `hud.setHeld` and `hud.carryCombo` from the rig it is
 * measuring — and one case does exactly that (19d, the manual pad, the case
 * whose whole subject is the carry). The listener runs after boot's, so the
 * case observes the same events the HUD just saw.
 */
function scoreboard(extra = {}) {
  const hud = new Hud();
  const banked = [];
  const stances = [];
  const boot = {
    onTrick: (_id, name, points) => {
      banked.push(`${name} ${points}`);
      hud.addLink(name, points);
    },
    onLand: (_trick, streak) => hud.bankCombo(streak),
    // A line that ended on the floor banks the same way boot banks it. Wired
    // as a MODEL event on purpose: a poll copied by hand into both `hframe`
    // and the frame loop would keep this green with the game's own copy
    // deleted, which is the round-3 failure wearing a different hat.
    onGroundClose: (streak) => hud.bankCombo(streak),
    onBail: () => hud.loseCombo(),
    onGrindStart: (kind) => hud.openLink(h.model.tricks.def(kind).name),
    onSpin: (degrees) => hud.addSpin(degrees),
    // THE TWO CALLS THIS RIG WAS MISSING, and its docstring claimed it was
    // wired "exactly as boot does" while they were absent.
    //
    // `hud.carryCombo` is the whole of round 5's manual fix — the ride decides a
    // landing while its state still says `air`, so the frame that touches down
    // cannot be the frame a ground trick starts on, and `BANK_GRACE` holds the
    // bank open for 0.12 s waiting for exactly this call. Measured on the
    // player's own five inputs it is the difference between 1,276 and 4,505
    // banked, one line instead of five — and the rig behind every score
    // assertion in this file did not make it. A scoreboard that is not boot
    // cannot certify scoring, however many assertions hang off it.
    //
    // `hud.setHeld` is the badge. Same rule as the stance badge two lines up:
    // the player finds out he is in a manual from the word on screen, and a
    // model announcing a hold nobody paints is a hold that never happened.
    onManual: (on, nose = false) => {
      const name = nose ? "Nose Manual" : "Manual";
      hud.setHeld(on ? name : null);
      hud.carryCombo(on ? name : null);
    },
    onGrab: (flavour) => {
      hud.setHeld(flavour);
      if (flavour) hud.openLink(flavour);
    },
    // Wired the way boot wires it, because the badge IS the read: the player
    // finds out he is riding switch from the word next to the speed, and the
    // model announcing a stance nobody paints is a stance that never happened.
    onStance: (stance) => {
      stances.push(stance);
      hud.setStance(stance);
    },
  };
  const wired = { ...boot };
  for (const [key, fn] of Object.entries(extra)) {
    const base = boot[key];
    wired[key] = base
      ? (...a) => {
          base(...a);
          fn(...a);
        }
      : fn;
  }
  const h = harness(wired);
  h.hud = hud;
  h.banked = banked;
  h.stances = stances;
  /**
   * The word beside the speed, or "" when the badge is dark — read off the
   * element the HUD paints rather than off the model, because that badge is the
   * only way a player finds out which way round he is standing. SWITCH and
   * FAKIE share the slot, so the WORD is the read and a lit class is not.
   */
  h.badge = () => (hud.stanceEl.classList.contains("on") ? hud.stanceEl.textContent : "");
  return h;
}

/** The base values the trick book handed over — the pot, before the multiplier. */
function potOf(h) {
  return h.banked.reduce((sum, row) => sum + Number(row.slice(row.lastIndexOf(" ") + 1)), 0);
}

/** A frame with the HUD in it — `hud.update` is where a pending bank cashes. */
function hframe(h, input, dt = STEP) {
  frame(h, input, dt);
  h.hud.update(h.model.speed, dt, h.model.fakie);
}
function hrun(h, input, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) hframe(h, typeof input === "function" ? input(i * STEP) : input);
}

// A trick on its own is a one-link line: it pays its base value ×1. This is the
// commonest thing a player will ever do and it paid ZERO — the landing was
// announced before the trick, found an empty line, and refused to bank.
{
  const h = scoreboard();
  hrun(h, { throttle: true }, 2.5);
  hframe(h, { olliePressed: true, kickflipPressed: true });
  hrun(h, {}, 1.4);
  check(
    "a kickflip on its own banks its own value",
    h.model.state !== "ragdoll" && h.hud.total === 250,
    `${h.banked.join(" · ")} → ${h.hud.total} on screen`,
  );
}

// …and a LINE pays the pot times the number of scored links. Two links here:
// the kickflip in the air, then the grind he lands into. The grind's own open
// link is replaced by the scored one at the bank and must not multiply twice.
{
  const line = STREET_SPOT.rails().find((r) => r.id === "flat-bar");
  const axis = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
  const d = 10 * 0.45;
  const sx = line.a.x - Math.sin(axis) * d;
  const sz = line.a.z - Math.cos(axis) * d;
  const h = scoreboard();
  h.model.position.set(sx, STREET_SPOT.height(sx, sz), sz);
  h.model.heading = axis;
  h.model.speed = 10;
  // Shift down for the whole line. Milestone 12 gates the CATCH on the slide key,
  // and this line's second link IS the catch — with the key up the kickflip is
  // the only trick in it and the pot pays ×1, which is what this check was
  // reading as a broken multiplier. Held all the way through rather than
  // dropped at the lock-on: it costs nothing on the line itself (`updateGrind`
  // never asks) and a player riding a bar keeps his hand where it was.
  hframe(h, { olliePressed: true, kickflipPressed: true, slideHeld: true });
  hrun(h, { slideHeld: true }, 2.6); // onto the bar, down it, off the end and rolling away
  const links = h.banked.length;
  check(
    "a kickflip into a grind is a two-link line, and it multiplies once",
    h.model.state !== "ragdoll" && links === 2 && h.hud.total === Math.round(potOf(h) * 2),
    `${h.banked.join(" · ")} → ${h.hud.total} on screen (${links} links)`,
    "src/skate/skate-model.ts — the air trick's own bank at grind entry deleted " +
      "(`if (this.trickId) this.bankTrick(this.trickId, 0, degrees, stanceIn)`): " +
      "`50-50 359 → 359 on screen (1 links)` — the kickflip paid nothing and the line never doubled",
  );
}

// The bail half of the same rule: everything the line earned goes on the floor
// with him. The line has to still be OPEN when he goes down, which is why the
// throttle stays on through the manual — a manual that quietly runs out of
// speed banks the line before the bail can take it.
{
  const h = scoreboard();
  // Pointed back UP the plaza: straight off the spawn runs into the manual
  // pad's step, which is correct (you ollie it) and stops him mid-manual.
  h.model.position.set(2, STREET_SPOT.height(2, 0), 0);
  h.model.heading = Math.PI;
  hrun(h, { throttle: true }, 1.6);
  hframe(h, { olliePressed: true, kickflipPressed: true });
  hrun(h, { throttle: true, manualHeld: true }, 1.4);
  const bankedBefore = h.hud.total;
  const held = h.model.state;
  h.model.position.y += 2;
  h.model.state = "air";
  h.model.vy = -14;
  h.model.heading += Math.PI / 2; // land sideways: nothing clean about it
  h.model.spin.degrees = 90;
  hrun(h, { throttle: true, manualHeld: true }, 0.4);
  // The pot has to be worth something, or `total === bankedBefore` is 0 === 0
  // and the case proves nothing. It went that way the moment `carryCombo` was
  // wired into `scoreboard()` — the manual now CARRIES the kickflip's line
  // instead of letting it bank, so both readings are zero and the assertion
  // that used to compare 250 with 250 started comparing nothing with nothing.
  // Which is the stronger case, and it is asserted as the stronger case: the
  // trick book handed over two links worth 400+ and the player's screen has
  // never shown a penny of it.
  const pot = potOf(h);
  check(
    "a bail takes the pending line back and banks nothing for it",
    held === "rolling" &&
      h.model.state === "ragdoll" &&
      h.hud.total === bankedBefore &&
      h.banked.length >= 2 &&
      pot > 300,
    `${h.banked.join(" · ")} = ${pot} handed over by the book — on screen ${bankedBefore} before the slam, ${h.hud.total} after`,
    "src/ui/hud.ts `loseCombo` body emptied — 1240 on screen after the slam against 0 before it",
  );
}

// A trick done entirely on the FLOOR has to pay too, and this is the case
// round 3 never ran: every score case it had ended in a landing, so the one
// path with no landing under it was invisible. A manual is the trick whose
// whole job is keeping a line alive across flat ground — ride, hold E, let go,
// wheels never leave the concrete — and the bank is announced by the landing.
// No landing, no bank: the trick book hands the points over, the HUD puts them
// in the pot, and the pot sits there for the rest of the run.
{
  const h = scoreboard();
  // Along the road, west to east, which is the longest flat run in the spot —
  // the point is a trick with no air anywhere in it, so the route has to have
  // no kerb and no lip in it either.
  h.model.position.set(-18, STREET_SPOT.height(-18, 0), 0);
  h.model.heading = Math.PI / 2;
  let sawAir = false;
  const watch = () => (sawAir ||= h.model.state !== "rolling");
  hrun(h, { throttle: true }, 1.5);
  watch();
  for (let i = 0; i < Math.round(1.2 / STEP); i++) {
    hframe(h, { manualHeld: true });
    watch();
  }
  for (let i = 0; i < Math.round(0.6 / STEP); i++) {
    hframe(h, {});
    watch();
  }
  check(
    "a manual on flat ground pays, without a landing to announce it",
    !sawAir && h.banked.length > 0 && h.hud.total >= 100,
    `${sawAir ? "left the ground — bad case" : "wheels never left the floor"}: banked ${h.banked.join(" · ") || "nothing"} → ${h.hud.total} on screen`,
  );
}

// …and two lines in a row, landed as close together as the ride allows, each
// pay their own value. The HUD leaves a banked line on screen for 0.8 s while
// its animation runs, and the next trick's link arrives INSIDE that window —
// one call after the landing that is going to bank it. Clearing the readout
// there used to cancel the payment for the whole second line, so linking
// tricks quickly, which is the entire point of a combo system, was the one
// thing that scored nothing.
{
  // Kickflip on the platform, then ollie straight off its north lip. Two pops
  // back to back would land 0.9 s apart and clear the window by a tenth of a
  // second, which is how round 3 missed this: a pop taken ON a downhill lip
  // keeps almost none of its impulse (the tangent takes it), so this second
  // air is half the length of the first and the landings arrive ~0.5 s apart —
  // inside the window, where the bug lived. The gap is measured and asserted,
  // so the day the feel changes this case says so instead of quietly stopping
  // covering anything.
  // The second line is a MANUAL, and it has to be. Two pops is the version this
  // case shipped with, and the ride can no longer make that gap: an ollie is
  // 0.86 s of hang time, so the soonest a second POP can land is 1.00 s after
  // the first — MEASURED, and outside the 0.80 s window the case exists to
  // cover. The line that fits inside it is one with no air in it. A manual
  // started clear of `BANK_GRACE` is a new line, not a carry, and it closes
  // when he lets go.
  const h = scoreboard();
  h.model.position.set(2, STREET_SPOT.height(2, -27), -27);
  h.model.heading = 0;
  h.model.speed = 12;
  hframe(h, { olliePressed: true, kickflipPressed: true });
  let t = 0;
  while (h.model.state === "air" && t < 3) {
    hframe(h, {});
    t += STEP;
  }
  // `BANK_GRACE` holds a bank open for 0.12 s after the landing so a manual can
  // catch the line, so the first line's payout is not on screen on the frame he
  // touches down. Read at the second pop instead — by then the grace is long
  // spent, and the gap being measured is still landing-to-landing.
  let gap = 0;
  // Clear of the first bank's grace, then hold E for a beat and let go.
  hrun(h, { throttle: true }, 0.2);
  gap += 0.2;
  const first = h.hud.total;
  hrun(h, { throttle: true, manualHeld: true }, 0.3);
  gap += 0.3;
  hrun(h, { throttle: true }, 0.2); // the manual closes; its bank cashes here
  gap += 0.2;
  check(
    "…and a second line landed inside the first one's settle window pays its own value",
    first === 250 && h.hud.total === 250 + (h.banked[1] ? Number(h.banked[1].slice(h.banked[1].lastIndexOf(" ") + 1)) : 0) &&
      h.hud.total > first &&
      gap < 0.8,
    `${h.banked.join(" · ")} → ${first} then ${h.hud.total}, lines ${gap.toFixed(2)} s apart (the readout settles over 0.80 s)`,
  );
}

// …and the combo multiplier stops where it says it stops. `COMBO_MAX_MULT` was
// documented in the trick book and enforced nowhere for a whole round: a
// fourteen-link line paid ×14. Driven at the HUD, in main.ts's own order, with
// values the real trick book produced — the model cannot be made to chain
// eleven links headlessly, and the rule lives in `Hud.commitBank` anyway.
{
  const { TrickBook } = await import("../src/skate/tricks.ts");
  const paid = [1, 4, 10, 14].map((links) => {
    const hud = new Hud();
    const book = new TrickBook();
    let pot = 0;
    for (let i = 0; i < links; i++) {
      const r = book.describe("kickflip", {
        spinDegrees: 0,
        holdTime: 0,
        stance: "regular",
        streak: 0,
      });
      pot += r.score;
      hud.addLink(`${r.name} ${i}`, r.score);
    }
    hud.bankCombo(1);
    // A bank is not instant: `BANK_GRACE` holds it open for a beat so a manual
    // can catch the line on its way down. One `update` used to be enough and is
    // not any more — the check went red at ×0.00 while the scoring was right,
    // which is the same lie as a check that goes green while it is wrong.
    for (let i = 0; i < Math.round(0.4 / STEP); i++) hud.update(8, STEP);
    return { links, pot, banked: hud.total, mult: hud.total / pot };
  });
  check(
    "the combo multiplier is the link count, and it stops at ten",
    paid.every((p) => Math.abs(p.mult - Math.min(p.links, 10)) < 1e-6),
    paid.map((p) => `${p.links} links → ${p.banked} (×${p.mult.toFixed(2)})`).join(" · "),
  );
}

// --- 9. an ollie onto the headline handrail catches, at every speed, on every
//        machine ----------------------------------------------------------
// The rail is 3.78 m. With a fixed 1.6 m ollie the board is 1.95 m above its
// far end at 9 m/s and never comes back down over it — it crosses the rail's
// height on the way UP, about 0.85 m in. Asking the Grinder only while falling
// therefore caught 4 m/s and nothing above it.
//
// The frame-rate sweep is the half round 3 never ran, and the catch is exactly
// the sort of test that has a frame in it: the vertical window is 0.55 m deep
// and the straddle that saves a board falling clean through it compares this
// frame's height with the LAST one's, which is 5 cm apart at 144 fps and 24 cm
// apart at 30. A rail that only takes you on the fast machine is a rail that
// works for whoever wrote the check.
{
  const line = STREET_SPOT.rails().find((r) => r.id === "handrail-6");
  const axis = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
  const ollieOn = (v, fps) => {
    // Recorded off the EVENT, not off `grindState` at the end of the run: the
    // rail is 3.78 m and at 14 m/s he is off the bottom of it in 0.27 s, so
    // asking afterwards whether he is still on it answers a different question.
    let kind = "—";
    const h = harness({ onGrindStart: (k) => (kind = kind === "—" ? k : kind) });
    // Stood on the platform above the top of the rail, riding down it.
    h.model.position.set(line.a.x, STREET_SPOT.height(line.a.x, line.a.z - 1.6), line.a.z - 1.6);
    h.model.heading = axis;
    h.model.speed = v;
    // Shift held from the pop to the end of the flight — milestone 12's `HOLD SHIFT`.
    // This is a case about whether the LINE takes him, so the key that offers
    // him the line is down for the whole of it; measured, that is 0/24 without
    // it and 24/24 with it, at every one of the four rates.
    frame(h, { olliePressed: true, slideHeld: true }, 1 / fps);
    run(h, { slideHeld: true }, 0.9, undefined, 1 / fps);
    return kind;
  };
  const speeds = [4, 6, 8, 10, 12, 14];
  const rates = [30, 60, 90, 144];
  const missed = [];
  const rows = [];
  for (const fps of rates) {
    const caught = speeds.map((v) => ollieOn(v, fps));
    caught.forEach((k, i) => k === "—" && missed.push(`${fps}fps@${speeds[i]}`));
    rows.push(`${fps}fps ${caught.filter((k) => k !== "—").length}/${speeds.length}`);
  }
  check(
    "an ollie onto the handrail catches from 4 to 14 m/s, at 30/60/90/144 fps",
    missed.length === 0,
    missed.length ? `missed ${missed.join(" ")}` : rows.join(" · "),
    "src/skate/grind.ts — the Grinder asked only while FALLING again, " +
      "`if (rising && climb > RISE_SLOPE * run) return null` → `if (rising) return null`: " +
      "missed 6, 8, 10, 12 and 14 m/s at all four rates and caught 4 m/s alone — " +
      "which is the defect this case's own header describes, reproduced to the speed",
  );
}

// --- 9b. a rail asks the landing's question: is the board caught? ------------
// Locking on with the deck still coming round snapped it flat in one frame —
// 210° to 345° of jump — and paid out a clean grind for a kickflip he never
// finished. A rail is a landing surface and now applies the floor's own test.
// The cost has to be checked too: a plain ollie into a grind must be exactly as
// easy as it was, and a kickflip must still make it given room to come round.
//
// ROUND 5 rewrote what this case COUNTS, and that is the whole of the fix. It
// used to stop at the lock-on and call a catch a success — so "he got over the
// rail and cased the six-stair below it" scored as `over`, which was neither a
// pass nor a fail, and 100% green here sat on top of "you cannot ollie the
// six-stair". A rail approach has exactly three honest endings and the harness
// names all three: he rode away, he went down, or he never touched the line.
{
  /**
   * One approach, ridden to its answer with a keyboard.
   *
   * `lead` is seconds of run-up before the POP, which for a flip is also the
   * flick time — the deck starts coming round at the pop and `FLIP_TIME` is
   * 0.4 s, so how much room he gave himself IS how far round the board is when
   * the trucks arrive.
   */
  const at = (id, v, lead, flip, dt) => {
    const line = STREET_SPOT.rails().find((r) => r.id === id);
    const axis = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
    // A plain ollie fires on the RELEASE of Space, two frames after the key
    // goes down; a flip fires on the press. Backing the start off by the
    // difference puts the pop itself `lead` seconds out in both cases, so the
    // two columns are comparable.
    const preRoll = flip ? 0 : 2;
    const d = v * (lead + preRoll * dt);
    const sx = line.a.x - Math.sin(axis) * d;
    const sz = line.a.z - Math.cos(axis) * d;
    let caught = null;
    let atFlip = 1;
    let prev = 1;
    let prevVy = 0;
    // Read off the frame BEFORE the bail: `enterRagdoll` zeroes `vy` and snaps
    // `flip` to 1 on its way out, so asking afterwards answers "level, and the
    // deck was square" about every fall there is.
    let bailVy = null;
    let bailFlip = 1;
    // Some of these run-ups cross a kerb. `ledge-long-e` sits on the north
    // footway and the shortest leads start the board on the sunken road, so at
    // lead 0.2 he hits the 0.38 m kerb at 9.86 m/s, stops dead, and then pops
    // straight up out of a standstill — measured. That approach says nothing
    // about the LINE, so it is excluded from the speed-retained assertion and
    // counted out loud rather than quietly averaged in.
    let walled = false;
    const h = harness({
      onWallHit: () => (walled = true),
      onGrindStart: () => (caught ??= h.model.position.clone()),
      onBail: () => {
        if (bailVy !== null) return;
        bailVy = prevVy;
        bailFlip = prev;
      },
    });
    h.model.position.set(sx, STREET_SPOT.height(sx, sz), sz);
    h.model.heading = axis;
    h.model.speed = v;
    // Where he went down decides whose fault it was: an ollie that sails clean
    // over a 3.78 m rail and cases the stair set at the bottom of it is the
    // STAIRS putting him down, not the line, and counting those against the
    // rail is how a good grind fix gets reverted.
    const along = () => {
      const dx = line.b.x - line.a.x;
      const dz = line.b.z - line.a.z;
      return (
        ((h.model.position.x - line.a.x) * dx + (h.model.position.z - line.a.z) * dz) /
        (dx * dx + dz * dz)
      );
    };
    // Shift is down for the WHOLE approach, in both columns. Milestone 12 made the
    // grind a held key and the catch is the only thing it gates, so a player
    // aiming a flip or an ollie at a line has it down before he pops and keeps
    // it down until the trucks arrive — there is no moment in this approach
    // where a hand would let go. Without it every one of these 504 approaches
    // is a rail that was never asked: measured, 0/7 caught at every line, every
    // speed and every rate, which is what turned three of this section's checks
    // red without a single one of them being about grinding.
    const hold = (t) =>
      flip
        ? t < dt * 0.5
          ? ["KeyF", "KeyE"]
          : ["KeyE"]
        : t < dt * 1.5
          ? ["Space", "KeyE"]
          : ["KeyE"];
    let t = 0;
    let airborne = false;
    let answered = null;
    for (let i = 0; i < Math.round(3 / dt) && !h.bailed; i++) {
      prev = h.model.flip;
      prevVy = h.model.vy;
      pframe(h, hold(t), dt);
      if (caught !== null && atFlip === 1) atFlip = prev;
      t += dt;
      if (airborne && (h.model.state === "rolling" || h.model.state === "grind")) {
        // Rolling again, or settled onto the line: he made it. Grinds keep
        // running until the model hands them back, so a grind is answered the
        // moment it is entered and its own end is check 9's business.
        answered = h.model.state;
        break;
      }
      airborne ||= h.model.state !== "rolling";
    }
    const at0 = along();
    return {
      // `ride` splits into "rode the line" and "rode over it": both are clean,
      // and only one is the rail doing its job.
      out: h.bailed
        ? at0 >= -0.25 && at0 <= 1
          ? "slam-on-rail"
          : "slam-past"
        : caught
          ? "ride"
          : answered
            ? "over"
            : "hung",
      atFlip,
      // A bail taken with the board still CLIMBING is the finding round 4
      // measured from four directions. Nothing has landed on anything yet: he
      // is on his way up past a rail he would have cleared.
      rising: bailVy !== null && bailVy > 0.5,
      bailFlip,
      // …and what he has LEFT. A rail approach that ends `ride` or `over` and
      // leaves him at walking pace has ended the line as surely as a slam, and
      // for four rounds this function could not tell the difference.
      kept: h.bailed ? 0 : Math.abs(h.model.speed),
      walled,
      v,
    };
  };
  const speeds = [6, 8, 10, 12];
  const leads = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  // Per LINE and per SPEED, never summed. Round 3 added all three rails into
  // one counter and passed at `flipsLanded > 30` of 60 — which one rail taking
  // every approach and the other two taking none satisfies just as well as all
  // three working. The player rides a rail, not an average of rails.
  //
  // A hit RATE is the wrong instrument for the rest of it, too: the headline
  // handrail is 3.78 m long and an ollie is 0.86 s, so at 12 m/s the whole rail
  // passes underneath while he is still near his apex and the middle leads
  // legitimately sail over it. What a player would notice is not a percentage.
  // It is these four, and all four are hard rules:
  //   · a plain ollie at a line NEVER puts you down — miss it or ride it,
  //   · every line takes a plain ollie at every speed, from more than one
  //     approach, so it is aimable rather than a single sweet spot,
  //   · a kickflip flicked early enough still makes every one of them,
  //   · and a kickflip AIMED at a line does not slam ON it. That is the one
  //     round 4's verifiers measured at 13–31% and this file could not see,
  //     because it scored the lock-on and stopped.
  //
  // …and all four at 30, 60 and 144 fps, which is the property the catch
  // actually has since it stopped sampling a point once a frame. A rail that
  // takes a kickflip at 60 and refuses it at 144 is the same class of defect as
  // the 12 cm band that swept the rate check found.
  let midFlip = 0;
  const bailedPlain = [];
  const thinOllie = [];
  const noFlip = [];
  const slammed = [];
  const rising = [];
  let flipTries = 0;
  let flipSlams = 0;
  let railKept = Infinity;
  let railWalled = 0;
  const railDead = [];
  const rows = [];
  for (const fps of [30, 60, 144]) {
    const dt = 1 / fps;
    for (const id of ["handrail-6", "flat-bar", "ledge-long-e"]) {
      const perSpeed = [];
      for (const v of speeds) {
        let ollie = 0;
        let flip = 0;
        let slam = 0;
        for (const lead of leads) {
          const k = at(id, v, lead, true, dt);
          flipTries++;
          if (k.out === "ride" && k.atFlip < 1) midFlip++;
          if (k.out === "ride" && lead >= 0.3) flip++;
          if (k.out.startsWith("slam")) {
            flipSlams++;
            // FLIP_TIME is 0.4 s, so a flick with 0.4 s of run-up in front of
            // it has had the whole of the trick's own deadline. Slamming with
            // less than that is the deck not being under his feet, which is the
            // bargain; slamming with more is the line.
            if (lead >= 0.4) slam++;
            if (k.rising) rising.push(`${fps}fps ${id}@${v}/${lead} flip ${k.bailFlip.toFixed(2)}`);
          }
          const o = at(id, v, lead, false, dt);
          if (o.out === "ride") ollie++;
          if (o.out.startsWith("slam")) bailedPlain.push(`${fps}fps ${id}@${v}/${lead} ${o.out}`);
          // SPEED RETAINED, on every line and every approach that did not end
          // on the floor. This is the third question the function can answer and
          // the first two were the only ones anybody asked: he caught it, he
          // rode away from it — and at what speed. A rail that hands the player
          // back a standstill has ended the line.
          for (const r of [k, o]) {
            if (r.out === "slam-on-rail" || r.out === "slam-past" || r.out === "hung") continue;
            if (r.walled) {
              railWalled++;
              continue;
            }
            railKept = Math.min(railKept, r.kept);
            if (r.kept < ROLL_AWAY_MIN)
              railDead.push(`${fps}fps ${id}@${v}/${lead} ${r.out} at ${r.kept.toFixed(2)} m/s`);
          }
        }
        if (ollie < 3) thinOllie.push(`${fps}fps ${id}@${v} ${ollie}/7`);
        if (flip === 0) noFlip.push(`${fps}fps ${id}@${v}`);
        // One slam in seven leads is 14% of the approaches a player makes at
        // that rail at that speed, and it is the number round 4 called a
        // blocker. The bar is zero: aiming a flip at a rail is the game's
        // signature move and it must not be a coin toss.
        if (slam > 0) slammed.push(`${fps}fps ${id}@${v} ${slam}/7`);
        perSpeed.push(`${v}:${ollie}o/${flip}f${slam ? `/${slam}SLAM` : ""}`);
      }
      rows.push(`${fps}fps ${id} ${perSpeed.join(" ")}`);
    }
  }
  check(
    "no rail ever takes a board that is still coming round",
    midFlip === 0,
    `${midFlip} mid-flip locks in ${flipTries} flip-toward-a-line approaches, 30/60/144 fps`,
    "src/skate/skate-model.ts `tryCatchGrind` — the landing's own question deleted, " +
      "`if (this.flipWas + (this.flip - this.flipWas) * met < 1)` → `if (false)`: " +
      "`56 mid-flip locks in 252 flip-toward-a-line approaches`",
  );
  check(
    "…and it costs the plain ollie nothing — every line, every speed, no bails",
    bailedPlain.length === 0 && thinOllie.length === 0,
    bailedPlain.length
      ? `a plain ollie BAILED at ${bailedPlain.join(" ")}`
      : thinOllie.length
        ? `too few approaches catch: ${thinOllie.join(" ")}`
        : rows.join(" · "),
    "src/skate/grind.ts `MIN_LINE_AHEAD` 0.5 → 4 — the 3.78 m handrail now has less than " +
      "the minimum ahead of him from anywhere on it: `0/7` at every speed and every rate",
  );
  check(
    "…and a kickflip flicked with room still lands on every one of them",
    noFlip.length === 0,
    noFlip.length ? `no flip ever caught ${noFlip.join(" ")}` : rows.join(" · "),
    "src/skate/skate-model.ts `FLIP_TIME` 0.4 → 1.2 — the deck can no longer come round inside " +
      "an ollie's hang time: `no flip ever caught` on all three lines at all three rates",
  );
  check(
    "…and a kickflip flicked with the whole of FLIP_TIME in front of it never slams",
    slammed.length === 0,
    `${flipSlams}/${flipTries} flip approaches end on the floor` +
      (slammed.length ? ` — with room: ${slammed.join(" ")}` : " — none of them with room"),
    "src/skate/skate-model.ts `FLIP_TIME` 0.4 → 1.2 — `252/252 flip approaches end on the floor`, " +
      "`4/7` of them with the whole of the (old) flick time in front of them",
  );
  // The one a player reads as unfair, and the one four verifiers found from
  // four directions. A rail REFUSES a board that is still coming round by
  // bailing him, and that rejection is asked on rising frames too — so a
  // kickflip popped early enough to fly clean OVER a handrail is thrown on the
  // concrete while it is still climbing past the rail's height, having landed
  // on nothing at all. The catch itself already declines to lock on the way up
  // (check 19); the reject does not, and the two have to agree.
  check(
    "…and no line puts him down while the board is still going UP",
    rising.length === 0,
    rising.length
      ? `${rising.length}/${flipTries} bail on a RISING board — ${rising.slice(0, 6).join(" · ")}${rising.length > 6 ? " …" : ""}`
      : "every flip bail was taken on a board coming down",
    "src/skate/grind.ts — reject on rising frames restored to unconditional (`flip < 1` asked while vy > 0): 56/252 bail on a RISING board",
  );
  check(
    "…and every approach that did not end on the floor left him still rolling",
    railDead.length === 0,
    railDead.length
      ? `${railDead.length}/${flipTries * 2} approaches ended at a standstill — ${railDead.slice(0, 6).join(" · ")}${railDead.length > 6 ? " …" : ""}`
      : `slowest ride-away or fly-over across ${flipTries * 2 - railWalled} approaches: ${railKept.toFixed(2)} m/s ` +
        `(floor ${ROLL_AWAY_MIN}; ${railWalled} more were stopped by a kerb in the run-up and are the approach's, not the line's)`,
    "src/skate/skate-model.ts `LAND_SLAM_SCRUB` 0.6 → 6 — 118/504 approaches end at a standstill, slowest 0.00 m/s",
  );
}

// --- 10. …and Space gets you back OFF a line, at speed ----------------------
// The catch above is asked on rising frames too, and a rail's window is 0.55 m
// deep — so at speed the board cleared the Grinder's re-catch distance while
// still INSIDE that window and Space re-locked him 0.067 s later with 0.45 m of
// a 1.57 m ollie. The model refuses the rail on the way up out of a pop.
//
// The check was named for TWO claims and asserted one. It ran 0.5 s after the
// pop and looked at `peak` — how much air — and never once asked whether he was
// back on the line, which is the entire failure it was written for. "Stays out"
// is now its own measurement: the grinder is silent for the whole flight, and
// he is not on a line when the wheels come down.
{
  const rows = [];
  const relocked = [];
  const stalled = [];
  const walled = [];
  let worst = Infinity;
  let kept = Infinity;
  /** The frame before the one being stepped — a catch reports where it took him. */
  let swallowY = null;
  for (const v of [5, 8, 11, 14]) {
    const line = STREET_SPOT.rails().find((r) => r.id === "flat-bar");
    const axis = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
    const p = line.a.clone().lerp(line.b, 0.12);
    // A re-catch is only a defect while he is on the way UP. Coming back down
    // onto a bar he ollied along is a landing, and a good one — this bar is
    // 12 m long and a 1.59 m ollie at 5 m/s puts him back on it 4 m further
    // down, which is a trick and not a bug. What the pop must never do is get
    // swallowed while it is still climbing out of the line it left.
    let catches = [];
    // The bar runs a → b up the plaza and its far end points STRAIGHT AT the
    // quarter pipe: `flat-bar` ends at z 16.5 and the transition's toe is a few
    // metres past it, so a pop off the north end is a pop into the ramp. That
    // is the spot, not a defect — but it is not the pop either, and at 14 m/s
    // the flight ends against the transition's face at y 1.94, charged as a
    // wall at 13.04 m/s and stopped dead in one frame. Recorded and counted out
    // loud, the way 9b counts a run-up stopped by a kerb: what this case is
    // about is the pop, and an approach the ramp ate says nothing about it.
    let hitWall = false;
    const h = harness({
      onGrindStart: () => catches.push(swallowY),
      onWallHit: () => (hitWall = true),
    });
    // Ridden onto the bar the way check 4 rides onto it would take 30 lines of
    // approach for a case about LEAVING one; dropped on from 10 cm instead,
    // which is a place the ride puts him every time an ollie lands on this bar.
    h.model.position.set(p.x, p.y + 0.1, p.z);
    h.model.heading = axis;
    h.model.speed = v;
    h.model.state = "air";
    h.model.vy = -1.5;
    // Shift down for the drop-on, because nothing gets on a bar without it.
    run(h, { slideHeld: true }, 0.5);
    const onLine = h.model.state === "grind";
    catches = []; // the catch that put him there is not the one under test
    const y0 = h.model.position.y;
    // …AND SHIFT STAYS DOWN through the pop and the whole flight, which is the
    // judgement call in this case and the harder of the two readings.
    //
    // Letting go on the pop would make "STAYS out" trivially true — a rail
    // cannot swallow a board off a key that is up — and that is not a guess:
    // with `(this.catchWhileRising || this.vy <= 0)` deleted from `flight()`,
    // which is the exact defect this case was written for, the check runs GREEN
    // with Shift released at the pop and red with Shift held (`11 m/s: swallowed at
    // 47 cm, still rising at 6.2 m/s`). The rule under test is the model's own:
    // an air that BEGAN by leaving a line on purpose is not offered that line
    // again until he is coming back down to it, and that rule only means
    // anything while he is still asking. So he asks for the whole flight, and
    // the assertion is that the rail refuses him anyway until he is falling.
    // Landing back on the bar further down is a trick, not a defect, and is
    // counted separately (`rows`, "landed back on it").
    pframe(h, ["Space", "KeyE"]);
    pframe(h, ["Space", "KeyE"]);
    pframe(h, ["KeyE"]);
    let peak = 0;
    // …and what the pop LEFT him with, read ON THE FRAME HE IS ROLLING AGAIN.
    //
    // That is `kept`'s own definition three hundred lines up — "read on the
    // frame he is rolling again, which is the number on the speed bar as he
    // rides out of the obstacle" — and this case was the one place in the file
    // that did not obey it: it read the speed 0.4 s after the flight loop broke,
    // whatever he happened to be doing by then. What he happens to be doing is
    // riding UP the quarter pipe, because the bar points at it. Measured at
    // 8 m/s: down at 5.93 m/s, and 0.4 s later 1.35 m/s and still climbing — a
    // pop this file would have reported as a dead stop, on a board that was
    // about to come back down the transition faster than it went up. A ramp is
    // not an instrument. `rideOut` breaks on `rolling` OR `grind` for the same
    // reason and this now matches it, so landing back on the bar is answered on
    // the bar.
    let out = null;
    // The WHOLE flight, not the first half second: the old window ended before
    // he was even down, and then asserted a peak height and called that "stays
    // out".
    for (let i = 0; i < Math.round(1.6 / STEP); i++) {
      swallowY = { rise: h.model.position.y - y0, vy: h.model.vy };
      pframe(h, ["KeyE"]);
      peak = Math.max(peak, h.model.position.y - y0);
      if (h.model.state !== "air") {
        out ??= Math.abs(h.model.speed);
        break;
      }
    }
    for (let i = 0; i < Math.round(0.4 / STEP); i++) {
      swallowY = { rise: h.model.position.y - y0, vy: h.model.vy };
      pframe(h, ["KeyE"]);
    }
    worst = Math.min(worst, peak);
    // Popping out of a grind is how a line continues, so a pop that lands him at
    // a standstill has ended the line as surely as being thrown off would have —
    // and the only thing this case ever asked was how high he went. Still in the
    // air when the clock ran out reads as zero, which is the honest answer to
    // "what is he rolling at": nothing, he never landed.
    out ??= 0;
    if (hitWall) {
      walled.push(`${v} m/s flew into the transition's face`);
    } else {
      kept = Math.min(kept, out);
      if (out < ROLL_AWAY_MIN) stalled.push(`${v} m/s in, ${out.toFixed(2)} m/s out`);
    }
    const swallowed = catches.filter((c) => c && c.vy > 0);
    if (!onLine) relocked.push(`${v} m/s: never got on the bar`);
    for (const c of swallowed)
      relocked.push(`${v} m/s: swallowed at ${(c.rise * 100).toFixed(0)} cm, still rising at ${c.vy.toFixed(1)} m/s`);
    rows.push(`${v}:${peak.toFixed(2)}m→${out.toFixed(1)}m/s${catches.length ? ` (landed back on it ${catches.length}×)` : ""}`);
  }
  check(
    "Space pops out of a grind, and STAYS out",
    worst > 1.2 && relocked.length === 0,
    relocked.length ? relocked.join(" · ") : `${rows.join(" ")} off the pop, nothing swallowed on the way up`,
    // Both halves of the name, one break each. The constant was `POP_SPEED` when
    // this note was written and is `OLLIE_POP` now — a recipe that names a
    // symbol nobody can find is not a recipe, so it is re-run and re-named.
    "src/skate/skate-model.ts `OLLIE_POP` 7.3 → 3.0 — worst pop 0.28 m of air against the 1.2 m bar; " +
      "and for the STAYS-out half, `flight()`'s `(this.catchWhileRising || this.vy <= 0)` gate removed — " +
      "`11 m/s: swallowed at 47 cm, still rising at 6.2 m/s`",
  );
  check(
    "…and he is still rolling on the far side of it",
    stalled.length === 0 && walled.length < 4,
    stalled.length
      ? `${stalled.length}/${4 - walled.length} pops ended at a standstill — ${stalled.join(" · ")}`
      : `slowest roll-away out of a pop ${kept.toFixed(2)} m/s (floor ${ROLL_AWAY_MIN})` +
        (walled.length
          ? ` — ${walled.length} more never got to land: ${walled.join(" · ")}, which is the ramp's and not the pop's`
          : ""),
    // The old note named `LAND_SLAM_SCRUB 0.6 → 6`, and neither the symbol nor
    // the number survives: the scrub is `LAND_SLAM_HALF` now, and taken to 0.1
    // it leaves the slowest pop at 0.73 m/s — red, but only just, because this
    // check reads the ride-away and a pop out of a bar is not a hard landing.
    // So the break is aimed where the claim is: the pop itself.
    "src/skate/skate-model.ts `updateGrind` — `this.speed *= 0.15` inserted before " +
      "`this.pop(\"ollie\", grade)`, the pop off a line charged for itself: " +
      "`4/4 pops ended at a standstill — 5 m/s in, 0.00 m/s out · 8 → 0.20 · 11 → 0.63 · 14 → 1.06`",
  );
}

// --- 11. the grab is announced, and a grab you keep hold of puts you down ----
{
  const said = [];
  const h = harness({ onGrab: (f) => said.push(f), onBail: () => said.push("BAIL") });
  run(h, { throttle: true }, 1.6);
  frame(h, { olliePressed: true });
  run(h, { grabHeld: true }, 0.2);
  const onAir = said[0];
  run(h, { grabHeld: true }, 1.4); // …and never let go
  check(
    "X reaches for the deck and says which grab it is",
    typeof onAir === "string" && onAir.length > 0,
    `onGrab("${onAir}")`,
  );
  // The hand has to come OFF the deck when he goes down, or the body holds the
  // shape and the badge stays lit for the rest of the run: a bail never runs
  // through `setHold`, so the drop has to announce itself.
  check(
    "…and a grab held into the floor bails, hand released",
    said.includes("BAIL") && said[said.length - 2] === null,
    said.map((s) => (s === null ? "null" : s)).join(" → "),
  );
}

// --- 12. R lets go of everything it teleports away from ---------------------
// `reset()` used to clear `grindState` and the held trick by assignment, so R
// halfway down a handrail left the grind loop playing, the rider yawed across
// a line now on the other side of the plaza, and the manual badge lit.
{
  const said = [];
  const h = harness({
    onGrindEnd: () => said.push("grind-end"),
    onManual: (on) => said.push(`manual:${on}`),
  });
  const line = STREET_SPOT.rails().find((r) => r.id === "flat-bar");
  const axis = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
  const p = line.a.clone().lerp(line.b, 0.15);
  h.model.position.set(p.x, p.y + 0.1, p.z);
  h.model.heading = axis;
  h.model.speed = 8;
  h.model.state = "air";
  h.model.vy = -1.5;
  // Shift down to get him onto the bar at all — the "NOT grinding → silence" this
  // check has been printing was a rail nobody asked for, not a reset defect.
  run(h, { slideHeld: true }, 0.4);
  const wasGrinding = h.model.state === "grind";
  h.model.reset();
  // …and UP across the reset, because R is the player letting go of everything.
  // A hand still on Shift through a teleport back to the spawn would be asking a
  // second question (does the spawn hand him a line?) inside a case about the
  // first, and the answer this check wants is `grindState === null`.
  frame(h, {});
  check(
    "R mid-grind hands the line back instead of dropping it",
    wasGrinding && said.includes("grind-end") && h.model.grindState === null,
    `${wasGrinding ? "grinding" : "NOT grinding"} → ${said.join(", ") || "silence"}`,
    "src/skate/skate-model.ts `reset()` — the announced hand-back put back to the bare assignment " +
      "it used to be, `if (this.grindState) { … onGrindEnd }` → `this.grindState = null`: " +
      "`grinding → silence`",
  );

  const g = harness({ onManual: (on) => said.push(`manual:${on}`) });
  run(g, { throttle: true }, 1.6);
  run(g, { throttle: true, manualHeld: true }, 0.3);
  const wasUp = said.includes("manual:true");
  g.model.reset();
  check(
    "…and R mid-manual puts the wheels back down",
    wasUp && said.includes("manual:false"),
    said.filter((s) => s.startsWith("manual")).join(", ") || "silence",
  );
}

// --- 13. he gets up when the BODY says so, not when a clock does -------------
// `SkateModel.body` is the ragdoll handle main.ts hands over. Without it the
// stand-up is a flat 1.5 s: a tip-over that came to rest in half a second left
// him lying on the concrete, and a full-speed slam still sliding was hauled to
// his feet mid-slide. The timer is the ceiling over the body's answer, and the
// 0.55 s floor is there because `settled` is also true before anything is
// thrown.
{
  const fakeBody = (settleAt) => {
    let t = 0;
    let thrown = false;
    return {
      hips: new THREE.Vector3(),
      start: () => {
        thrown = true;
        t = 0;
      },
      update: (dt) => {
        t += dt;
      },
      release: (out = new THREE.Vector3()) => out,
      get settled() {
        return !thrown || t >= settleAt;
      },
    };
  };
  const downFor = (settleAt) => {
    // Wired the way main.ts wires it: the model announces the bail, boot throws
    // the body, and the handle it reads back is the same object. Handing over
    // `body` without `onRagdoll` is a body that is never thrown, which reads as
    // permanently settled — so both halves belong in the same test.
    const body = settleAt === null ? null : fakeBody(settleAt);
    const h = harness({ onRagdoll: (v) => body?.start(v) });
    h.model.body = body;
    run(h, { throttle: true }, 1.2);
    h.model.position.y += 2;
    h.model.state = "air";
    h.model.vy = -16;
    h.model.spin.degrees = 90; // nothing clean about this landing
    let t = 0;
    for (let i = 0; i < 200; i++) {
      frame(h, {});
      h.model.body?.update(STEP);
      if (h.model.state !== "ragdoll" && t > 0) return t;
      if (h.model.state === "ragdoll") t += STEP;
    }
    return t;
  };
  const quick = downFor(0.3);
  const slow = downFor(1.2);
  const never = downFor(99);
  const none = downFor(null);
  // The contract, and all three cases of it: he is up at the body's own answer,
  // never before the 0.55 s floor and never after the 1.5 s ceiling — and with
  // no body at all (a harness, or a run where the character never streamed) the
  // ceiling is the whole answer, which is what round 1 shipped for everything.
  check(
    "the stand-up waits for the body, and the timer is only the ceiling",
    quick > 0.54 && quick < 0.6 && slow > 1.18 && slow < 1.24 && never > 1.48 && never < 1.6 &&
      none > 1.48,
    `settles 0.3 s → up ${quick.toFixed(2)} s · 1.2 s → ${slow.toFixed(2)} s · never → ${never.toFixed(2)} s · no body → ${none.toFixed(2)} s`,
  );
}

// --- 14. THE STANCE: the WHEELS decide, and nothing else --------------------
//
// This is the player's ask #3 — "mirror all animations, since our player must
// support both sides" — and it is the section that has been wrong in a
// different way in each of three rounds. Round 3 asserted `stances.length === 0`
// here, which CERTIFIED that switch was unreachable. Round 4 wired it to a
// landed 180 and this section certified THAT, right up until the player watched
// it and said the character spins all the way round again after the switch.
//
// He was right, and the reason is one sentence: a spin turns the WHOLE
// assembly. `heading` carries it degree by degree and the rig swings the board
// and the rider together, so a landed 180 is already 180° of body. Turning him
// round on the deck as well is a second half-turn on the rider alone — the
// board and the man ending up 95° apart (`tools/turn-check.mjs`), arriving as a
// swing back the other way a fifth of a second after touchdown. A skater who
// spins a 180 has not moved his feet on the deck, and the checks below say so.
//
// What DOES turn him round is running the wheels the other way, which is the
// other half of what the player asked for: ride up the quarter pipe, run out of
// speed, and come back down with the board still pointing up the transition.
// The board holds its heading and the RIDER swings round on it to face where he
// is going, mirrored clips and all — "the skateboard stays in place, my guy
// just turns the other way".
//
// So: `stance === switch  ⟺  the wheels are running backwards`, with a deadband
// (`STANCE_FLIP_SPEED`) so a speed sitting on zero cannot flip a half-turn of
// body on and off at frame rate. One writer, one rule, and every check in this
// section is on that rule rather than on a trick.
{
  /**
   * Pop, hold the stick over until the tracker has come round far enough, let
   * go, and ride out the landing. Real input the whole way: writing `degrees`
   * into the tracker by hand — which is how round 3 drove this — tests the
   * landing against a rotation the ride never actually made.
   */
  const spinLand = (target, extra = {}) => {
    const h = scoreboard(extra);
    h.model.position.set(2, STREET_SPOT.height(2, -2), -2);
    h.model.heading = 0;
    h.model.speed = 12;
    hframe(h, { olliePressed: true });
    let guard = 0;
    while (
      h.model.state === "air" &&
      Math.abs(h.model.spin.degrees) < target - 6 &&
      guard++ < 300
    ) {
      hframe(h, { steer: 1 });
    }
    while (h.model.state === "air" && guard++ < 400) hframe(h, {});
    hrun(h, {}, 0.3);
    return h;
  };
  const away = (m) =>
    (Math.abs(Math.atan2(Math.sin(m.course - m.heading), Math.cos(m.course - m.heading))) * 180) /
    Math.PI;

  // The flight path first, because the rest is meaningless if the spin steers
  // him: the board comes round under an arc that does not bend.
  {
    const h = harness();
    h.model.position.set(2, STREET_SPOT.height(2, 0), 0);
    h.model.heading = Math.PI;
    h.model.speed = 14;
    frame(h, { olliePressed: true });
    // Measured over the AIR and nothing else. Reading it 1.1 s after the pop
    // included a quarter of a second of grounded carving with the stick still
    // held, so the check answered "3.6° off" for a flight path that was
    // straight and a carve that was working — the wrong quantity, and the sort
    // of number that gets a good fix reverted.
    const from = h.model.position.clone();
    const to = from.clone();
    run(h, { steer: 1 }, 1.1, () => {
      if (h.model.state === "air") to.copy(h.model.position);
    });
    const spun = to.sub(from);
    const off = Math.atan2(spun.x, spun.z) - Math.PI;
    const drift = Math.abs(Math.atan2(Math.sin(off), Math.cos(off))); // shortest way round
    check(
      "a spin turns the board without steering the flight path",
      drift < 0.02 && spun.length() > 8,
      `${spun.length().toFixed(2)} m of air travel, ${((drift * 180) / Math.PI).toFixed(2)}° off the line he left on`,
    );
  }

  // A HALF turn: the board came round under him and his feet never moved, so the
  // other foot is in front now and he STAYS that way. No stance event at all —
  // one here is him being turned back round on the deck, which puts his feet
  // exactly where they started and leaves the trick with no visible result.
  const half = spinLand(180);
  check(
    "a landed 180 leaves his feet exactly where they were on the deck",
    half.model.state === "rolling" &&
      half.stances.length === 0 &&
      half.model.stance === "regular" &&
      half.model.fakie &&
      half.badge() === "SWITCH",
    `stance ${half.model.stance}, events [${half.stances.join(" → ") || "none"}], ` +
      `wheels-against-him ${half.model.fakie}, badge "${half.badge()}"`,
    "src/skate/skate-model.ts `syncStance` — drop the `STANCE_BOARD_TURN` guard: " +
      "stance switch, events [switch], and the same foot leads coming out as going in",
  );
  check(
    "…and he keeps the line he was already travelling, with the board backwards under him",
    half.model.speed < -1 && away(half.model) > 179,
    `${half.model.speed.toFixed(1)} m/s, deck ${((half.model.heading * 180) / Math.PI).toFixed(0)}° vs travel ${((half.model.course * 180) / Math.PI).toFixed(0)}° — ${away(half.model).toFixed(1)}° apart`,
    "src/skate/skate-model.ts `land` — restore the redirect (`!halfTurn && facing < 0 ? -carried : carried`): " +
      "+12.0 m/s with the deck and the travel 0.0° apart, i.e. his line turned round with him",
  );

  // A WHOLE turn is a whole turn, and lands identically. Both spins are here
  // because the OLD rule split them, and a check that only asks about 360s
  // could not tell the two rules apart.
  const full = spinLand(360);
  check(
    "…and so does a 360",
    full.model.state === "rolling" &&
      full.stances.length === 0 &&
      full.model.stance === "regular" &&
      full.model.speed > 1 &&
      away(full.model) < 1,
    `${full.stances.join(" → ") || "no stance change"}, ${full.model.speed.toFixed(1)} m/s, ${away(full.model).toFixed(1)}° between deck and travel`,
  );

  // …and the ground pivot the same: brake and steer a half turn on the spot and
  // the whole assembly comes round together, rider included.
  {
    const h = scoreboard();
    h.model.position.set(2, STREET_SPOT.height(2, -2), -2);
    h.model.heading = 0;
    h.model.speed = 4;
    let guard = 0;
    while (Math.abs(h.model.spin.degrees) < 176 && guard++ < 400)
      hframe(h, { brake: true, steer: 1 });
    const turned = h.model.spin.degrees;
    hrun(h, {}, 0.2); // let go: the pivot ends and resolves
    check(
      "…and a ground pivot through 180 leaves it alone as well",
      guard < 400 && h.stances.length === 0 && h.model.stance === "regular" && h.badge() === "",
      `pivoted ${turned.toFixed(0)}° → ${h.stances.join(" → ") || "no stance change"}, badge "${h.badge()}"`,
      "src/skate/skate-model.ts `resolveSpin` — put back `if (landedHalfTurn) setStance(flip)` — " +
        'pivoted -179° → switch, badge "SWITCH"',
    );
  }

  // --- and now the thing that DOES turn him round --------------------------
  //
  // The quarter pipe, ridden for real: enough speed to get up the transition
  // and not enough to clear the coping, so he stalls and rolls back down with
  // the board still pointing up it. This is the player's own description of the
  // move, and it is driven end to end rather than by writing a negative speed
  // into the model — the point is that the WORLD produces the reversal.
  {
    const h = scoreboard();
    const z0 = QP_LIP_Z - 8;
    h.model.position.set(-4, STREET_SPOT.height(-4, z0), z0);
    h.model.heading = 0;
    h.model.speed = 8;
    const y0 = h.model.position.y;
    let peak = 0;
    let least = 0;
    for (let i = 0; i < Math.round(6 / STEP); i++) {
      hframe(h, {});
      peak = Math.max(peak, h.model.position.y - y0);
      least = Math.min(least, h.model.speed);
    }
    check(
      "rolling back down the transition is what turns him round",
      peak > 0.6 &&
        least < -1.5 &&
        h.stances.join(",") === "switch" &&
        h.model.stance === "switch" &&
        h.badge() === "SWITCH",
      `climbed ${peak.toFixed(2)} m, rolled back at ${least.toFixed(1)} m/s → ` +
        `[${h.stances.join(" → ") || "no stance change"}], stance ${h.model.stance}, badge "${h.badge()}"`,
      "src/skate/skate-model.ts — drop the `syncStance()` call from `update`: " +
        "he rolls back at -5.3 m/s and stays regular with the badge dark",
    );
  }

  // …and the deadband, which is the whole reason the rule is a band and not a
  // sign test. A board coasting to a standstill crosses zero and hovers there;
  // a bare `speed < 0` turns a 180° body swing on and off at frame rate.
  {
    const h = scoreboard();
    h.model.position.set(2, STREET_SPOT.height(2, -2), -2);
    h.model.heading = 0;
    // Walked back and forth across zero, inside the band the whole way.
    for (const v of [0.9, 0.4, -0.3, -0.8, -1.0, -0.5, 0.2, 0.8, -0.9, 0.0]) {
      h.model.speed = v;
      hframe(h, {});
    }
    const chatter = h.stances.length;
    // …and then out the far side of it, once.
    h.model.speed = -4;
    hframe(h, {});
    check(
      "…and a board dithering around a standstill does not swing him round",
      chatter === 0 && h.stances.join(",") === "switch",
      `${chatter} stance changes across ten frames inside ±1.2 m/s, then [${h.stances.join(" → ")}] at -4 m/s`,
      "src/skate/skate-model.ts `STANCE_FLIP_SPEED` 1.2 → 0 — 5 stance changes inside the band",
    );
  }

  // --- and now the WHOLE range, because three points is not a rule ----------
  //
  // Everything above this line samples the stance rule at a 180, a 360 and a
  // pivot at −179° — three places the rule happens to be right. It could not
  // see that `round(|deg| / 180)` calls EVERY turn from 90° to 269° a half
  // turn, so a sloppy 100° brake-and-steer came out of the corner riding switch
  // with every mirrored clip in the game changed hands, and the harness said
  // nothing because nobody had asked it about 100°.
  //
  // The rule, written out here rather than imported, because a check that asks
  // the code for the rule it is checking is a mirror:
  //
  //   he is switch  ⟺  the last time his speed left the ±1.2 m/s deadband, it
  //   left it going BACKWARDS. What the spin did is not in the rule at all.
  //
  // Which makes both sweeps below an experiment rather than a restatement: every
  // pivot and every landed spin is driven for real, its speed trace is walked
  // frame by frame through the rule above, and the answer is compared with the
  // stance the model actually ended in. A turn that puts nobody backwards can
  // still fail this — by flipping the stance anyway, which is the bug the
  // player reported.
  {
    const BAND = 1.2;
    const CLEAN = 60;
    const offSquare = (d) => {
      const m = Math.abs(d) % 180;
      return Math.min(m, 180 - m);
    };
    /**
     * The rule, run over a trace of (speed, heading). Starts regular, as every
     * run does, and re-implemented here rather than imported — a check that
     * asks the code for the rule it is checking is a mirror.
     *
     * He turns round on the deck when the wheels take up running against the
     * way he is STANDING, and only if the board held its heading while they
     * did. A board that came round on its own carried him with it: his feet
     * never moved and he is riding fakie, not switch.
     *
     * GROUNDED frames only, and that is the rule and not an optimisation: in
     * the air the deck and the flight path part company by however far the
     * spin has turned so far, so a rule that watched the air would find the
     * board "holding still" between two mid-flight frames and turn him round
     * for a rotation he was in the middle of. It is also what makes the two
     * cases distinguishable at all — the last time the wheels and the rider
     * agreed is BEFORE the pop, so a landed spin is measured against the
     * heading he took off on.
     */
    // The stance rule, re-implemented here rather than asked for. He turns round
    // ON THE DECK only when the board did NOT come round — the ground sent him
    // back down a transition the deck is still pointing up. When the BOARD came
    // round instead, on a landed 180, his feet stay exactly where they were and
    // the other foot ends up in front: that is the whole visible result of the
    // trick, and turning him round on top of it puts his feet back where they
    // started. Grounded frames only, with the same deadband and the same 115°.
    const wantFrom = (trace) => {
      let want = "regular";
      let backwards = false;
      let faceH = trace.length ? trace[0].h : 0;
      for (const { v, h, g } of trace) {
        if (!g) continue;
        const facing = want === "switch" ? -1 : 1;
        const way = v <= -BAND ? -1 : v >= BAND ? 1 : 0;
        if (way === 0) continue;
        if (way === facing) {
          backwards = false;
          faceH = h;
          continue;
        }
        if (backwards) continue;
        backwards = true;
        const turn = Math.abs(Math.atan2(Math.sin(h - faceH), Math.cos(h - faceH)));
        if (turn < (115 * Math.PI) / 180) want = want === "switch" ? "regular" : "switch";
      }
      return want;
    };

    // The ground pivot: no landing under it, so it is the path where the rule
    // has nothing else to hide behind. Every 5° from 0 to 360.
    //
    // ROUND 6 changed how it is DRIVEN, and the old way could not fail.
    //
    // `while (|spin.degrees| < target) hframe(brake, steer)` drives to a target
    // and then reads the answer at it, which quietly assumes the target is
    // reachable. `PIVOT_MAX_SPEED` is 6 m/s and a pivot only counts turn while
    // he is under it, so the SLICE of a brake-and-steer that reaches the spin
    // tracker is speed-gated — and this sweep entered every one of its 73
    // pivots at 4 m/s, under the gate from the first frame, where the gate can
    // never bite. Above it the loop simply spins its guard out with
    // `spin.degrees` still 0, and 0° wants `regular`, and he IS regular, so
    // every one of those cases would have passed while the player's brake-and-
    // steer did nothing at all.
    //
    // So: a fixed HOLD, from real street speeds as well as slow ones, and the
    // sweep records what the pivot actually delivered rather than driving until
    // it gets what it came for. `reached` is asserted separately — a pivot that
    // cannot come round from 12 m/s is a finding, not a silent skip.
    const pivotWrong = [];
    const pivotRows = [];
    const unreachable = [];
    for (const enter of [4, 8, 12]) {
      for (let target = 0; target <= 360; target += 5) {
        const h = scoreboard();
        h.model.position.set(2, STREET_SPOT.height(2, -2), -2);
        h.model.heading = 0;
        h.model.speed = enter;
        // 3 s of brake and steer held, and then let go — a hold, not a hunt.
        // Whatever came round in that time is what the player got.
        let guard = 0;
        const trace = [];
        while (Math.abs(h.model.spin.degrees) < target && guard++ < Math.round(3 / STEP)) {
          hframe(h, { brake: true, steer: 1 });
          trace.push({ v: h.model.speed, h: h.model.heading, g: h.model.state === "rolling" });
        }
        const turned = h.model.spin.degrees;
        for (let k = 0; k < Math.round(0.25 / STEP); k++) {
          hframe(h, {}); // let go: the pivot ends and resolves
          trace.push({ v: h.model.speed, h: h.model.heading, g: h.model.state === "rolling" });
        }
        if (Math.abs(turned) < target - 6) {
          unreachable.push(`${enter} m/s: asked for ${target}°, got ${turned.toFixed(0)}°`);
          continue;
        }
        const got = h.model.stance;
        const want = wantFrom(trace);
        if (got !== want)
          pivotWrong.push(`${enter}m/s ${turned.toFixed(0)}° → ${got} (want ${want})`);
        // The badge is part of the rule: the player finds out from the word.
        if ((got === "switch") !== (h.badge() === "SWITCH"))
          pivotWrong.push(`${enter}m/s ${turned.toFixed(0)}° stance ${got} but badge "${h.badge()}"`);
        pivotRows.push(`${turned.toFixed(0)}:${got === "switch" ? "S" : "r"}`);
      }
    }
    check(
      "the stance rule holds across the WHOLE ground pivot, 0°–360° in 5° steps",
      pivotWrong.length === 0 && pivotRows.length > 180,
      pivotWrong.length
        ? `${pivotWrong.length} of ${pivotRows.length} wrong — ${pivotWrong.slice(0, 8).join(" · ")}${pivotWrong.length > 8 ? " …" : ""}`
        : `${pivotRows.length} pivots from 4, 8 and 12 m/s, every one of them on the rule — a brake-and-steer never changes which way round he stands`,
      "src/skate/skate-model.ts `resolveSpin` — put back `if (landedHalfTurn) setStance(flip)` — 72 of 219 wrong, every pivot between 120° and 240° `→ switch`",
    );
    // …and the half the `while` loop was hiding: a brake-and-steer entered at a
    // real street speed has to come round at all. Only the slice below
    // `PIVOT_MAX_SPEED` counts, so a player braking from 12 m/s spends the top
    // of the turn scrubbing speed and nothing else, and whether three seconds is
    // enough to get round from there is a question the old sweep could not ask
    // because it never entered above 4.
    check(
      "…and a pivot entered at street speed still comes round inside three seconds",
      unreachable.length === 0,
      unreachable.length
        ? `${unreachable.length}/219 never got there — ${unreachable.slice(0, 6).join(" · ")}`
        : `every 5° step from 0° to 360° reached, entering at 4, 8 and 12 m/s`,
      "src/skate/skate-model.ts `PIVOT_MAX_SPEED` 6 → 3 — 106/219 never got there, `12 m/s: asked for 360°, got 0°`",
    );

    // …and the same sweep in the AIR, where an off-square landing is a bail and
    // the question becomes "of the ones that landed, did the right ones flip".
    const airWrong = [];
    let widestClean = 0;
    let tightestBail = 180;
    const landed = [];
    for (let target = 0; target <= 400; target += 10) {
      const h = scoreboard();
      h.model.position.set(2, STREET_SPOT.height(2, -2), -2);
      h.model.heading = 0;
      h.model.speed = 12;
      hframe(h, { olliePressed: true });
      let guard = 0;
      const trace = [];
      while (h.model.state === "air" && Math.abs(h.model.spin.degrees) < target && guard++ < 400) {
        hframe(h, { steer: 1 });
        trace.push({ v: h.model.speed, h: h.model.heading, g: h.model.state === "rolling" });
      }
      const turned = h.model.spin.degrees;
      while (h.model.state === "air" && guard++ < 500) {
        hframe(h, {});
        trace.push({ v: h.model.speed, h: h.model.heading, g: h.model.state === "rolling" });
      }
      // The EVENTS as well as the end state — and it took two mutation tests to
      // learn why. The stance is a function of the speed with a deadband, and
      // `syncStance` runs at the end of the same `update` that lands him, so a
      // rule that flips the stance and flips it straight back has the SAME end
      // state as one that never fired: a spin-flips-stance rule was restored
      // under this sweep and it still said PASS, at touchdown as well as
      // settled, because the settled answer genuinely never differs.
      //
      // `onStance` does differ. It fires on every transition and the animation
      // layer starts a 0.45 s body turn on each one, so a pair inside one frame
      // is two of those — a whip on screen out of a no-op in the numbers. Hence
      // the count as well as the value.
      const atTouchdown = h.model.stance;
      for (let k = 0; k < Math.round(0.25 / STEP); k++) {
        hframe(h, {});
        trace.push({ v: h.model.speed, h: h.model.heading, g: h.model.state === "rolling" });
      }
      const off = offSquare(turned);
      if (h.bailed) tightestBail = Math.min(tightestBail, off);
      else {
        widestClean = Math.max(widestClean, off);
        landed.push(target);
        const want = wantFrom(trace);
        if (h.stances.length)
          airWrong.push(`${turned.toFixed(0)}° → [${h.stances.join(" → ")}] on a landing that turned nobody round`);
        else if (atTouchdown !== "regular")
          airWrong.push(`${turned.toFixed(0)}° → ${atTouchdown} on the touchdown frame`);
        else if (h.model.stance !== want)
          airWrong.push(`${turned.toFixed(0)}° → ${h.model.stance} (want ${want})`);
      }
    }
    check(
      "…and across every spin the air will actually land, 0°–400°",
      airWrong.length === 0 && landed.length > 10 && widestClean < tightestBail,
      airWrong.length
        ? `${airWrong.join(" · ")}`
        : `${landed.length} of 41 spins landed; the widest off-square that rolled away is ${widestClean.toFixed(0)}° ` +
          `and the tightest that bailed is ${tightestBail.toFixed(0)}° — and not one of them changed which way round he stands`,
      "src/skate/skate-model.ts `syncStance` — drop the `STANCE_BOARD_TURN` guard — every landed spin between 140° and 220° `→ [switch] on a landing that turned nobody round`",
    );
  }
}

// --- 15. a wall is a wall, and it says so ------------------------------------
// The old version of this rode off the spawn for four seconds and asserted he
// had stopped. The spot moved under it: there is no longer a block in that
// path — after 4 s of throttle he is airborne off the quarter pipe — so it was
// testing nothing. Aimed at a wall deliberately now, and asserting the thing
// that was actually broken: a wall used to eat every metre per second in
// silence, with no event and no bail however hard he hit it.
{
  const hitAt = (v, heading, fps) => {
    const dt = 1 / fps;
    const into = [];
    let bailed = false;
    const h = harness({ onWallHit: (i) => into.push(i), onBail: () => (bailed = true) });
    // Head-on at the SOUTH building, out on the east side of the plaza.
    //
    // It used to aim NORTH from `SPOT_MAX_Z - 6`, and that stopped being a wall
    // test on 2026-07-29: the back ramp was rebuilt taller (2.2 → 3.4 m) and
    // steeper (70° → 86°) to stop launching the player into the brick, and its
    // toe moved to z 40.95. `SPOT_MAX_Z - 6` is z 42 — six centimetres of flat
    // ground before, ON THE RAMP now. So every approach LAUNCHED, `onWallHit`
    // never fired, and the fps rates came back NaN. The harness was aiming at
    // the one wall in the level with a quarter pipe in front of it.
    //
    // South has the same brick and nothing in front of it. Measured after the
    // move: onWallHit 17.8 / 17.8 / 17.9 at 30 / 60 / 144 fps, spread 0.1.
    const z = SPOT_MIN_Z + 6;
    h.model.position.set(20, STREET_SPOT.height(20, z), z);
    // …and south is a half-turn from north, so every caller's heading turns with
    // the target. A square hit stays square and the 45° glance stays a glance.
    h.model.heading = heading + Math.PI;
    h.model.speed = v;
    run(h, {}, 2, undefined, dt);
    return { into, bailed, speed: Math.abs(h.model.speed) };
  };
  const slam = hitAt(18, 0, 60);
  const scuff = hitAt(6, 0, 60);
  const glance = hitAt(14, Math.PI / 4, 60);
  check(
    "hitting a wall is heard, and hitting one at 18 m/s puts you down",
    slam.into.length === 1 && slam.into[0] > 14 && slam.bailed &&
      scuff.into.length === 1 && !scuff.bailed && scuff.speed < 0.5 &&
      glance.into.length === 1 && !glance.bailed && glance.speed > 2,
    `18 m/s square → onWallHit(${slam.into[0]?.toFixed(1)}) + bail · 6 m/s → onWallHit(${scuff.into[0]?.toFixed(1)}), stopped at ${scuff.speed.toFixed(2)} m/s · 14 m/s at 45° → onWallHit(${glance.into[0]?.toFixed(1)}), ${glance.speed.toFixed(1)} m/s kept`,
    "src/skate/skate-model.ts `WALL_SLAM` 12 → 40 — 18 m/s square gives onWallHit but no bail",
  );
  // SPEED RETAINED against a wall, which is the one obstacle where the two
  // directions are both rules and both are already here: square into it you
  // keep NOTHING (`scuff.speed < 0.5`), clipped at 45° you keep enough to carry
  // on (`glance.speed > 2`). Recorded rather than added, because this is the
  // only place in the file that already measured what a player has left — and
  // it is worth naming that the quarter pipe, the six-stair, every rail and the
  // manny pad all went four rounds without the same line.
  // …and it costs the same at every frame rate. A wall walked into in four
  // pieces used to charge four bites at 30 fps and one at 144.
  const rates = [30, 60, 144].map((fps) => hitAt(18, 0, fps).into[0] ?? NaN);
  check(
    "…and a wall costs the same at 30, 60 and 144 fps",
    Math.max(...rates) - Math.min(...rates) < 0.2,
    rates.map((r, i) => `${[30, 60, 144][i]}fps ${r.toFixed(1)}`).join(" · "),
  );
}

// --- 16. nothing latches while nothing is reading ---------------------------
// SPACE on the title screen used to arm the pop: it fires on RELEASE, and the
// release lands after DROP IN has already unpaused. Same for F, G, C and R.
{
  const listeners = {};
  globalThis.window = {
    addEventListener: (t, f) => ((listeners[t] ??= []).push(f), undefined),
    removeEventListener: () => {},
  };
  const { SkateInputSource } = await import("../src/skate/input.ts");
  const src = new SkateInputSource();
  src.attach();
  const fire = (type, code) =>
    listeners[type]?.forEach((f) => f({ code, repeat: false, preventDefault() {} }));

  // The title screen: nothing has ever called consume().
  fire("keydown", "Space");
  fire("keydown", "KeyF");
  fire("keydown", "KeyR");
  fire("keyup", "Space");
  const first = src.consume(STEP);
  const quiet = !first.olliePressed && !first.kickflipPressed && !src.takeReset();

  // …and in play, where it must all still work.
  fire("keydown", "Space");
  fire("keydown", "KeyF");
  fire("keyup", "Space");
  const live = src.consume(STEP);
  check(
    "a keystroke nobody was reading does not queue up for frame 1",
    quiet && live.olliePressed && live.kickflipPressed,
    `title screen: ollie ${first.olliePressed}, flip ${first.kickflipPressed} · in play: ollie ${live.olliePressed}, flip ${live.kickflipPressed}`,
  );
  delete globalThis.window;
}

// --- 17. nothing in the loop throws over a long ride -------------------------
{
  const h = harness();
  let err = null;
  try {
    run(
      h,
      (t) => ({
        throttle: t % 2 < 1.2,
        brake: t % 7 > 6.4,
        steer: Math.sin(t * 0.9),
        chargeHeld: t % 3 > 2.6,
        olliePressed: Math.abs((t % 3) - 2.62) < STEP / 2,
        kickflipPressed: Math.abs((t % 5) - 4.02) < STEP / 2,
        grabHeld: t % 11 > 10.6,
        manualHeld: t % 4 > 3.5,
      }),
      60,
    );
  } catch (e) {
    err = e;
  }
  check(
    "60 s of mashed input never throws",
    !err,
    err ? String(err) : `ended ${h.model.state} at ${h.model.position.y.toFixed(2)} m`,
  );
}

// --- 18. THE QUARTER PIPE ----------------------------------------------------
//
// The spot's marquee feature, and round 2 shipped with not one check on it
// while it worked on about a quarter of approaches. Three things have to be
// true and none of them was: the launch has to FIRE, it has to fire the same
// way at every frame rate, and going faster has to buy you more air.
{
  /**
   * Ride north at the transition from 12 m south of the lip and read the air.
   *
   * `drive` is the whole point of this rewrite. Round 3 ran every one of these
   * with `{}` — an empty input object, nobody's hands on the keyboard — and so
   * certified a quarter pipe that nobody had ridden. A player arrives at a
   * transition with the push key down and lets go of Space at the lip; that is
   * the only approach anybody makes, and it is the one that was broken.
   */
  const launch = (v, fps, drive = "coast", events) => {
    const dt = 1 / fps;
    const z0 = QP_LIP_Z - 12;
    const h = harness(events);
    h.model.position.set(-4, STREET_SPOT.height(-4, z0), z0);
    h.model.heading = 0;
    h.model.speed = v;
    let apex = -Infinity;
    let air = 0;
    let popped = false;
    let popping = 0;
    let sawPop = false;
    // SPEED RETAINED, and this is the number the quarter pipe never had one of.
    // `entry` is the roll speed on the last frame before he leaves the coping;
    // `kept` is the roll speed on the first frame the wheels are back down.
    // Round 5 scored this case `rode: !bailed` and reported 7/7 while every one
    // of those runs came to a dead stop, because a man standing still has not
    // bailed.
    let entry = v;
    let kept = null;
    let flew = false;
    const n = Math.round(4 / dt);
    for (let i = 0; i < n && !h.bailed; i++) {
      // At the lip means at the lip, and since the transition became a true
      // quarter circle that is a HEIGHT, not a z. The last 0.6 m of z is 1.66 m
      // of near-vertical wall, so a z trigger pops him a metre and a half below
      // the coping — a pop into the wall, which is a different move with a
      // different answer (it charged four spurious wall slams at 17.5–20 m/s
      // when the ride lane swept the same case). Where he is off the floor is
      // the thing that has no clock and no arc in it.
      const atLip =
        drive === "pop" &&
        !popped &&
        h.model.state === "rolling" &&
        h.model.position.y > QP_HEIGHT - 0.12;
      if (atLip) popped = true;
      // A REAL hand: the throttle key stays down (that is what "ridden with the
      // push key held" means), Space goes down at the lip and comes up two
      // frames later, and whatever the input layer makes of that is what the
      // ride gets. The old version wrote `{ chargeHeld: atLip && !popped }` on
      // the line after setting `popped = true`, so the wind-up was dead every
      // frame and the drive was an `olliePressed` no hand can produce.
      if (atLip) popping = 3;
      const hold = [];
      if (drive !== "coast") hold.push("KeyW");
      if (popping > 0) {
        hold.push("Space");
        popping--;
      }
      if (!flew) entry = Math.abs(h.model.speed);
      const got = drive === "coast" ? frame(h, {}, dt) : pframe(h, hold, dt);
      if (got?.olliePressed) sawPop = true;
      apex = Math.max(apex, h.model.position.y);
      if (h.model.state === "air") air++;
      flew ||= h.model.state === "air";
      if (flew && kept === null && h.model.state !== "air") kept = Math.abs(h.model.speed);
    }
    return {
      apex,
      air,
      popped,
      sawPop,
      state: h.model.state,
      z: h.model.position.z,
      bailed: h.bailed,
      entry,
      kept,
      // "He rode it" and "he did not fall over" are different claims, and this
      // file scored the second one for four rounds. A ride-away is landing it
      // AND still moving.
      rode: !h.bailed && (!flew || (kept !== null && kept >= ROLL_AWAY_MIN)),
    };
  };

  const table = [12, 13, 14, 15, 16, 17].map((v) => [v, launch(v, 60)]);
  const flying = table.filter(([, r]) => r.air > 0);
  check(
    "coasting at the transition, faster buys more air",
    flying.length >= 4 &&
      table.every(([, r], i) => i === 0 || r.apex > table[i - 1][1].apex + 0.2),
    table.map(([v, r]) => `${v}:${r.apex.toFixed(2)}m${r.air ? "" : " (rolled)"}`).join(" "),
  );

  // …and now with a player on it. Two rules, and the second is the one round 3
  // hid: a transition ridden with the push key down has to be LANDABLE, and
  // pressing the pop key at the lip — the single most ordinary thing anyone
  // does on a quarter pipe — must never turn an air he was going to ride away
  // from into a slam. A key that is a bail button is worse than a dead key.
  const driven = [8, 10, 12, 14, 16, 18, 20].map((v) => {
    const r = launch(v, 60, "throttle");
    const p = launch(v, 60, "pop");
    // `rode`, not `!bailed`. That substitution is the whole of round 5's lie
    // here and it is worth naming: `!bailed` was true of all fourteen of these
    // runs while every one of them came down and stopped.
    return { v, r, rolled: r.rode, p, popped: p.rode };
  });
  // THE INPUT ITSELF, before anything about the ramp. `SkateInputSource` spends
  // the wind-up when the push key is down (`chargeSpent`), and the pop fires on
  // the RELEASE of Space — so a rider holding W and pressing Space gets no
  // charge AND no ollie. Measured on the real source: hold Space for six frames
  // with W down and `olliePressed` is false on every one of them, and false
  // again on the release. The only ollie left is a press and release inside one
  // frame, which is 16 ms and not a thing a hand does.
  //
  // Nothing about the ramp can be read until this is true, because every "pop
  // at the lip" case is really testing a key that did nothing.
  const reached = driven.filter((d) => d.p.sawPop);
  check(
    "a rider holding the push key can still ollie at all",
    reached.length === driven.length,
    `${reached.length}/${driven.length} approaches produced an ollie from a real Space press with W held`,
  );
  const madeWorse = driven.filter((d) => d.rolled && !d.popped);
  check(
    "…and popping at the lip is not a bail button",
    // …AND the pop happened. Without this clause the two columns are the same
    // run twice over and the check is green on a key that did nothing, which is
    // exactly the trap the old `chargeHeld: atLip && !popped` line laid.
    // The non-vacuity clause counts approaches that PRODUCED a pop and survived
    // it, not approaches that rode away: whether the transition hands back any
    // speed is the next check's question and this one must not go red for it,
    // or one defect paints two lines and neither says what it means.
    reached.length === driven.length &&
      madeWorse.length === 0 &&
      driven.filter((d) => d.p.sawPop && !d.p.bailed).length >= 4,
    driven
      .map(
        (d) =>
          `${d.v}:${d.rolled ? "roll✓" : "roll✗"}/${d.p.sawPop ? (d.popped ? "pop✓" : "pop✗") : "NO POP"} ${d.p.apex.toFixed(1)}m@${d.p.kept === null ? "—" : `${d.p.kept.toFixed(1)}m/s`}`,
      )
      .join(" "),
    "src/skate/skate-model.ts `SPIN_CLEAN_DEG` 60 → 0 with `spin.degrees` nudged — the popped column bails at 8/10/12 and `madeWorse` lists three",
  );
  // The ask, as the player would put it: I hold the push key, I ride the
  // transition, I come down. Do I ride away?
  //
  // Round 4 measured a bail at EVERY approach speed from 8 to 20 with the push
  // key held, because a hard landing was a bail (`LAND_ABSORB`, 9 m/s of
  // vertical) and the ramp's arc tops out at 79.19° — so an air that leaves the
  // coping keeps cos(79.19°) = 0.187 of its speed pointing out over the deck
  // and comes down 1.9–5.4 m past it, onto plywood, at 9–15 m/s of vertical.
  // The director's ruling made height a reward: a hard landing costs SPEED, not
  // the run. This is the case that reads that ruling back.
  //
  // Swept over the rate too, which the old version never did: the launch is a
  // force balance now and the landing is a surface match, and both are places a
  // per-frame stride has been the whole answer before.
  //
  // ROUND 6, AND THIS IS THE ONE. The row below used to be built as
  // `{ v, rode: !r.bailed, apex, air }` and reported 7/7 at four frame rates,
  // 28 green cells — while every single one of those airs came down and stopped
  // dead. The director's ruling on the ramp (a banked lip, not a vertical one,
  // and a landing that keeps the component ALONG the ground) exists because of
  // what this column says once it is asked the second question. So the check
  // asks it: he lands it, AND he leaves with something on the board.
  {
    const rateRows = [];
    const bad = [];
    const stopped = [];
    let worstKept = Infinity;
    for (const fps of [30, 60, 90, 144]) {
      const row = [8, 10, 12, 14, 16, 18, 20].map((v) => {
        const r = launch(v, fps, "throttle");
        return { v, rode: !r.bailed, kept: r.kept, entry: r.entry, apex: r.apex, air: r.air };
      });
      const rode = row.filter((d) => d.rode).length;
      if (rode < row.length) bad.push(`${fps}fps ${row.filter((d) => !d.rode).map((d) => d.v).join(",")} m/s BAIL`);
      // …and it is a BAND: no clean roll-away on the far side of a bail. A hole
      // in the middle of the speed range is the shape "the same air landed
      // differently" takes.
      row.forEach((d, i) => {
        if (i > 0 && d.rode && !row[i - 1].rode) bad.push(`${fps}fps clean at ${d.v} past a bail at ${row[i - 1].v}`);
      });
      for (const d of row) {
        if (d.air === 0 || d.kept === null) continue;
        worstKept = Math.min(worstKept, d.kept);
        if (d.kept < ROLL_AWAY_MIN)
          stopped.push(`${fps}fps ${d.v}→${d.kept.toFixed(2)} m/s off a ${d.apex.toFixed(1)} m air`);
      }
      rateRows.push(
        `${fps}fps ${rode}/${row.length} ride away (apex ${row.map((d) => d.apex.toFixed(1)).join("/")}` +
          ` → ${row.map((d) => (d.kept === null ? "—" : d.kept.toFixed(1))).join("/")} m/s left)`,
      );
    }
    check(
      "…and riding it with the throttle held rides away, 8→20 m/s, at 30/60/90/144 fps",
      bad.length === 0,
      bad.length ? bad.join(" · ") : rateRows.join(" · "),
      "src/skate/skate-model.ts `SPIN_CLEAN_DEG` 60 → 0 — 28/28 cells BAIL",
    );
    // The whole reason this file exists in the shape it is in. A marquee ramp
    // that hands the player back a standstill has not been ridden, however
    // cleanly it avoided a bail, and the designed main line dead-ends in the
    // north brick because of it.
    check(
      "…and comes off the transition with speed still on the board",
      stopped.length === 0,
      stopped.length
        ? `${stopped.length}/28 airs ended in a DEAD STOP (floor ${ROLL_AWAY_MIN} m/s) — ${stopped.slice(0, 8).join(" · ")}${stopped.length > 8 ? " …" : ""}`
        : `slowest ride-away off the transition ${worstKept.toFixed(2)} m/s`,
      "already RED against the shipped ramp — see the report; also went red on the six-stair's own break (`LAND_SLAM_SCRUB` 0.6 → 6)",
    );
  }

  // The one that was a coin toss. Before the launch became a force balance,
  // 14 m/s flew at 30, 60 and 144 fps and did not leave the ground at all at
  // 45, 75 or 90 — the same approach, six different games.
  const rates = [30, 45, 60, 75, 90, 144].map((fps) => [fps, launch(14, fps).apex]);
  const apexes = rates.map(([, a]) => a);
  check(
    "…the same at 30, 45, 60, 75, 90 and 144 fps",
    Math.max(...apexes) - Math.min(...apexes) < 0.05,
    rates.map(([f, a]) => `${f}:${a.toFixed(3)}`).join(" ") +
      ` — ${((Math.max(...apexes) - Math.min(...apexes)) * 100).toFixed(1)} cm apart`,
  );

  // …and the COASTING band, which is where the "not monotone in speed" finding
  // lived: 11, 12 and 13 m/s bailed while 10 and 14 rolled away clean.
  //
  // The assertion had to change with the ruling and it is worth being exact
  // about why. It used to require `firstBail > 5` — a bail somewhere in the
  // range — which under "you never bail on vertical speed" is a check demanding
  // the defect. What survives is the SHAPE: no hole in the middle, and the cost
  // of coming down hard is monotone. Height is a reward, so a faster approach
  // may leave with less roll speed at the bottom, but it must do so smoothly —
  // a cliff in that curve is the same "same air, different landing" the band
  // hole was.
  const band = [];
  for (let v = 10; v <= 20; v++) {
    const z0 = QP_LIP_Z - 12;
    const h = harness();
    h.model.position.set(-4, STREET_SPOT.height(-4, z0), z0);
    h.model.heading = 0;
    h.model.speed = v;
    let kept = null;
    run(h, {}, 5, () => {
      if (kept === null && h._wasAir && h.model.state === "rolling") kept = Math.abs(h.model.speed);
      h._wasAir ||= h.model.state === "air";
    });
    band.push([v, h.bailed, kept]);
  }
  const holes = band.filter(([, b], i) => i > 0 && !b && band[i - 1][1]);
  const cliffs = band.filter(
    ([, b, k], i) => i > 0 && !b && !band[i - 1][1] && k !== null && band[i - 1][2] !== null &&
      Math.abs(k - band[i - 1][2]) > 4,
  );
  const bandDead = band.filter(([, b, k]) => !b && k !== null && k < ROLL_AWAY_MIN);
  check(
    "…and the coasting band has no hole in it and no cliff in what it pays",
    holes.length === 0 && cliffs.length === 0 && band.filter(([, b]) => !b).length >= 8,
    band
      .map(([v, b, k]) => `${v}:${b ? "BAIL" : `${k === null ? "rolled" : `${k.toFixed(1)}m/s`}`}`)
      .join(" "),
    "src/skate/skate-model.ts `LAND_ABSORB` 9 → 4 — 13–20 m/s all BAIL, `band` drops to 3 clean",
  );
  // …and `kept` is not decoration in that row. It was already being measured
  // and the only thing asked of it was that it changed SMOOTHLY — so a curve
  // that is flat at zero all the way across satisfied "no cliff" perfectly, and
  // that is precisely the curve the ramp has: `13:0.0 14:0.3 15:0.5 16:0.5
  // 17:0.0 18:0.0 19:0.0 20:0.0`, eight coasting approaches over the coping,
  // every one of them a standstill. A monotonicity test on a number nobody put
  // a floor under is a check on the SHAPE of a lie.
  check(
    "…and every speed in that band that flew comes back down still rolling",
    bandDead.length === 0,
    bandDead.length
      ? `${bandDead.length} coasting approaches ended at a standstill — ${bandDead.map(([v, , k]) => `${v}→${k.toFixed(2)} m/s`).join(" ")}`
      : `${band.filter(([, , k]) => k !== null).length} approaches flew, slowest ride-away ${Math.min(...band.filter(([, , k]) => k !== null).map(([, , k]) => k)).toFixed(2)} m/s`,
    "already RED against the shipped ramp — see the report",
  );

  // DROPPING IN, and this one was asserted backwards.
  //
  // The rule a player notices is the plain one: roll off the lip with more
  // speed and you get to the bottom of the wall with more speed. Round 3
  // asserted its exact inverse — `p < previous - 0.05` across 1.6 → 5.2 m/s at
  // the lip — so the harness could only go green on a transition where
  // committing MORE speed left you slower at the bottom, which is the ramp
  // punishing you for using it. It also read the wrong number: `speed` is the
  // along-SURFACE component, so the moment he clears the lip and free-falls it
  // is the horizontal alone and its peak says nothing about the arrival.
  //
  // Read here is the speed on the first frame the wheels are back on the plaza
  // floor — the number on the speed bar at the bottom of the ramp.
  const PLAZA_Y = STREET_SPOT.height(-4, QP_LIP_Z - 12);
  const dropIn = [1.6, 2.0, 2.8, 3.6, 4.4, 5.2, 6.0].map((v) => {
    const z0 = QP_LIP_Z + 1;
    const h = harness();
    h.model.position.set(-4, STREET_SPOT.height(-4, z0), z0);
    h.model.heading = Math.PI;
    h.model.speed = v;
    let bottom = null;
    run(h, {}, 4, () => {
      if (bottom === null && h.model.state === "rolling" && h.model.position.y <= PLAZA_Y + 0.05)
        bottom = Math.abs(h.model.speed);
    });
    return [v, bottom];
  });
  const ideal = Math.sqrt(2 * GRAVITY * QP_HEIGHT);
  check(
    "…and a faster drop-in arrives at the bottom faster, all the way down the curve",
    dropIn.every(([, p]) => p !== null) &&
      dropIn.every(([, p], i) => i === 0 || p >= dropIn[i - 1][1] - 0.05) &&
      dropIn[0][1] > ideal * 0.85,
    `${dropIn.map(([v, p]) => `${v}→${p === null ? "never got down" : p.toFixed(2)}`).join(" ")} (free fall would pay ${ideal.toFixed(2)})`,
    "src/skate/skate-model.ts `slopeAlong` lookahead 0.15 → 1.5 m (the pre-round-4 value) — 1.6 m/s arrives at 5.62, under the 7.99 floor",
  );
}

// --- 18b. THE BANK, which had no case at all --------------------------------
//
// `bank` is a 4.5 m ramp off the platform's south lip, 1.15 m of drop, and it is
// the gentlest obstacle in the spot — the one the player rides when the stair
// set is too much. Nothing in this file has ever touched it.
//
// It is here because of what the quarter pipe turned out to be. A bank is the
// same question with the answer already known: ride down it and you arrive
// FASTER than you left, ride up it and you arrive slower but still moving. Both
// halves are speed retained, and neither has a bail anywhere near it — which is
// exactly why "did he bail" could never have covered this obstacle.
{
  const BANK_Z0 = -14; // top, on the platform lip
  const BANK_Z1 = -9.5; // toe, on the plaza
  // Read at the far LIP, not a couple of metres beyond it. Rolling drag over
  // flat ground is real and is not the bank's — measured over the same 4 m of
  // run-up plus 4.5 m of ramp plus 2 m of run-out, plain friction is 1.9 m/s at
  // 15 m/s, which is enough to hide the whole of what a 1.15 m drop pays and
  // was doing exactly that.
  //
  // `entry` therefore comes off the frame he reaches the near lip and `kept`
  // off the frame he reaches the far one, so what is between the two readings
  // is the ramp and nothing else.
  const ride = (z0, z1, v, fps) => {
    const dt = 1 / fps;
    const h = harness();
    const north = z1 > z0;
    const start = z0 + (north ? -4 : 4); // 4 m of run-up before the near lip
    h.model.position.set(2, STREET_SPOT.height(2, start), start);
    h.model.heading = north ? 0 : Math.PI;
    h.model.speed = v;
    let entry = null;
    let past = null;
    let airborne = false;
    run(h, {}, 3.5, () => {
      airborne ||= h.model.state === "air";
      const atNear = north ? h.model.position.z >= z0 : h.model.position.z <= z0;
      const atFar = north ? h.model.position.z >= z1 : h.model.position.z <= z1;
      if (entry === null && atNear) entry = Math.abs(h.model.speed);
      if (past === null && atFar && h.model.state === "rolling") past = Math.abs(h.model.speed);
    });
    return { kept: past, entry, airborne, bailed: h.bailed };
  };
  /**
   * The same 4.5 m at the same entry speed, on ground that is dead flat.
   *
   * Rolling drag in this ride is NOT small — 12 m/s coasting loses 1.24 m/s over
   * 4.5 m of plaza, 15 m/s loses 1.09 — and 1.15 m of drop is worth 6.25 m/s of
   * free fall only when you start from a standstill. Above about 8 m/s the drop
   * pays less than the drag costs, so "faster out than in" is a rule about the
   * DRAG and not about the bank, and asserting it fails a working ramp. What the
   * bank owes the player is the drop: he must arrive better off than he would
   * have on flat ground, and by roughly what the height is worth in v².
   */
  const flat = (v) => {
    const h = harness();
    h.model.position.set(-20, STREET_SPOT.height(-20, 18), 18);
    h.model.heading = Math.PI / 2;
    h.model.speed = v;
    let out = null;
    run(h, {}, 3, () => {
      if (out === null && h.model.position.x + 20 >= 4.5) out = Math.abs(h.model.speed);
    });
    return out;
  };
  const down = [6, 9, 12, 15].map((v) => [v, ride(BANK_Z0, BANK_Z1, v, 60)]);
  // 8 m/s stalls 2 cm short of the top and rolls back down — MEASURED (peak
  // z −13.92 against a lip at −14.0, y 1.13 of 1.15), and left out of the sweep
  // deliberately rather than quietly: a bank you need speed for is a bank.
  const up = [9, 11, 14, 17].map((v) => [v, ride(BANK_Z1, BANK_Z0, v, 60)]);
  const rateSweep = [30, 60, 144].map((fps) => [fps, ride(BANK_Z0, BANK_Z1, 12, fps)]);
  const say = (rows) =>
    rows
      .map(([v, r]) =>
        r.kept === null
          ? `${v}→NEVER GOT THERE`
          : `${v} (${r.entry.toFixed(1)} at the lip)→${r.kept.toFixed(2)}${r.airborne ? " [left the ground]" : ""}`,
      )
      .join(" ") + " m/s";
  const G_PAYS = 2 * GRAVITY * 1.15; // what 1.15 m of drop is worth, in v²
  const paid = down.map(([v, r]) => (r.kept === null ? null : (r.kept ** 2 - flat(r.entry) ** 2) / G_PAYS));
  check(
    "riding DOWN the bank pays you the drop, over and above what flat ground costs",
    down.every(([, r]) => r.kept !== null && !r.bailed && r.kept >= ROLL_AWAY_MIN) &&
      paid.every((p) => p !== null && p > 0.6),
    `${say(down)} — worth ${paid.map((p) => (p === null ? "—" : `${(p * 100).toFixed(0)}%`)).join("/")} of the 1.15 m drop against the same run on the flat`,
    "src/world/spot.ts `bank` shape ramp y0 1.15 → flat y 1.15 — pays 3%/3%/2%/2% of the drop",
  );
  check(
    "…and riding UP it costs you speed without ever costing you the run",
    up.every(([, r]) => r.kept !== null && !r.bailed && r.kept >= ROLL_AWAY_MIN && r.kept < r.entry),
    say(up),
    "src/skate/skate-model.ts `GRAVITY` 17 → 60 — 9, 11 and 14 m/s all `NEVER GOT THERE`",
  );
  check(
    "…and the bank pays the same at 30, 60 and 144 fps",
    Math.max(...rateSweep.map(([, r]) => r.kept)) - Math.min(...rateSweep.map(([, r]) => r.kept)) < 0.3,
    rateSweep.map(([f, r]) => `${f}fps ${r.kept.toFixed(2)}`).join(" · ") + " m/s out of a 12 m/s approach",
    "src/skate/skate-model.ts `slopeAlong` lookahead 0.15 → 1.5 m — 30fps 13.14 vs 144fps 13.60, 0.46 apart",
  );
}

// --- 19. no line takes a board on its way UP --------------------------------
// The coping sits on the transition's own tangent point, so a board pumping
// past it at 16 m/s is exactly as close to it as a board stalling on it — and
// the grind lane measured 40% of transition approaches converted into a coping
// slide, 10.73 → 1.49 m/s in one frame. The world lane pulled the coping out of
// `RAILS` and the grind lane made a crossing catch require a board coming DOWN.
// Either fix alone would pass this; it is here so neither can quietly come back.
{
  const caught = [];
  for (const v of [8, 11, 13, 14, 16]) {
    for (const pop of [false, true]) {
      const z0 = QP_LIP_Z - 12;
      const h = harness({ onGrindStart: (k, l) => caught.push(`${v}${pop ? "+pop" : ""}:${k}@${l.id}`) });
      h.model.position.set(-4, STREET_SPOT.height(-4, z0), z0);
      h.model.heading = 0;
      h.model.speed = v;
      // Pop at the lip, which is the approach that produced every hijack.
      // …at the LIP, read off the height for the reason `launch()` gives.
      //
      // WITH SHIFT HELD, which is the only version of this case worth keeping. The
      // hijack it exists to refuse — 40% of transition approaches converted into
      // a coping slide, 10.73 → 1.49 m/s in one frame — happened to a player who
      // was pumping, not asking; milestone 12's key would hide it all by itself
      // and leave both fixes (coping out of `RAILS`, crossing catches must be
      // coming DOWN) free to be reverted under a green check. Held, the case
      // says the coping refuses a pumping board EVEN WHEN HE ASKS, which is the
      // claim that outlives the key.
      run(
        h,
        () => ({
          olliePressed: pop && h.model.position.y > QP_HEIGHT - 0.12,
          slideHeld: true,
        }),
        3,
      );
    }
  }
  check(
    "riding the transition never hands you a grind on the way up",
    caught.length === 0,
    caught.length ? caught.join(" · ") : "10 approaches over the lip, no lock-on",
    // TWO edits, because the case says so in its own header: either fix alone
    // passes this, so a break that removes one proves nothing. The coping is
    // back in `RAILS` on its own (with a 0.18 m catch radius) — it was the
    // crossing rule and the model's rising gate that were holding it off.
    "src/skate/skate-model.ts `flight()` `(this.catchWhileRising || this.vy <= 0)` gate removed " +
      "AND src/skate/grind.ts `if (crossing && rising) continue` removed — " +
      "`13:boardslide@coping · 14:boardslide@coping`, 2 of 10 approaches hijacked; " +
      "drop the `RISE_SLOPE` guard as well and it is 6 of 10",
  );
}

// --- 19b. THE SIX-STAIR, which is the genre's whole opening sentence ---------
//
// Round 4's verifiers: 4 ride-aways in 56 attempts, 7%. Nothing in this file
// could see it, because the stair set had no case of its own and the rail case
// that runs down it scored an ollie that sailed clean over as a success.
//
// Ridden the way a player rides it: push up the platform, LET GO of the push
// key, load the ollie and let it off at the lip, land on the plaza past the
// stairs. Swept across the width of the set, because a stair set you can only
// ollie from one x is not a stair set.
{
  // `stair6` runs x −16 → −6, z −14 → −11, dropping 1.15 m over six steps. The
  // handrail sits at x = −12, so that column used to be a grind rather than a
  // clear — still a ride-away, and deliberately left in.
  //
  // SHIFT STAYS UP here, and that is a deliberate choice rather than the oversight
  // it is everywhere else in this file. This case is about OLLIEING a stair
  // set, not about the rail that happens to run down it, and milestone 12 has
  // made the two separable for the first time: with the key up the x = −12
  // column has to CLEAR the six-stair like every other column, which is a
  // strictly stronger requirement than the `grind || cleared` the check still
  // allows for. Measured with Shift up: 33/33 at 30, 60 and 144 fps, so nothing is
  // hiding behind the rail. Holding Shift would put that one column back on the
  // handrail and weaken the sweep by a column; the rail's own catch is covered
  // eleven ways over in 9, 9b and 19c.
  const LIP_Z = -14;
  const xs = [-15.5, -14.5, -13.5, -12.5, -12, -11, -10, -9, -8, -7, -6.5];
  const rows = [];
  const missed = [];
  const dead = [];
  let worstKept = Infinity;
  let faster = Infinity;
  for (const fps of [30, 60, 144]) {
    const dt = 1 / fps;
    let rode = 0;
    for (const x of xs) {
      for (const lead of [0.15, 0.3, 0.45]) {
        const h = harness();
        const z0 = LIP_Z - 9;
        h.model.position.set(x, STREET_SPOT.height(x, z0), z0);
        h.model.heading = 0;
        let popped = false;
        let hold = ["KeyW"];
        const r = rideOut(
          h,
          () => {
            // Let go of the push key and load the ollie as the lip comes up —
            // holding W through the wind-up SPENDS it, and that is the input
            // layer's rule rather than this harness's.
            const atLip = h.model.position.z > LIP_Z - h.model.speed * lead;
            if (atLip && !popped) hold = ["Space"];
            if (atLip && hold[0] === "Space" && h.model.position.z > LIP_Z - h.model.speed * lead * 0.35) {
              hold = [];
              popped = true;
            }
            return hold;
          },
          6,
          dt,
        );
        // Cleared the set, or caught the handrail that runs down it — both are
        // riding away from a six-stair. Anything else is not.
        const made = r.out === "ride" && (h.model.state === "grind" || r.z > LIP_Z + 1);
        if (made) rode++;
        else missed.push(`${fps}fps x${x}/${lead}s ${r.out}@z${r.z.toFixed(1)}`);
        // …and at what SPEED, which is the half "he rode away" does not contain.
        // A six-stair is a downhill: he should arrive at the bottom with MORE
        // than he left the lip with, and a set that hands back walking pace is
        // a set that ends the line as surely as a bail does.
        if (made) {
          worstKept = Math.min(worstKept, r.kept);
          if (r.dead) dead.push(`${fps}fps x${x}/${lead}s ${r.kept.toFixed(2)} m/s`);
          faster = Math.min(faster, r.kept / r.entry);
        }
      }
    }
    rows.push(`${fps}fps ${rode}/${xs.length * 3}`);
  }
  check(
    "you can ollie the six-stair, from anywhere across it, at 30/60/144 fps",
    missed.length === 0,
    missed.length
      ? `${missed.length}/${xs.length * 9} attempts never rode away — ${missed.slice(0, 8).join(" · ")}${missed.length > 8 ? " …" : ""}`
      : rows.join(" · "),
    "src/skate/skate-model.ts POP_SPEED 7.3 → 3.0 — 76/99 attempts case the set, `9/33` at every rate",
  );
  check(
    "…and rides away from it with speed still on the board",
    dead.length === 0 && faster > 0.5,
    dead.length
      ? `${dead.length}/${xs.length * 9} rode away at a standstill — ${dead.slice(0, 6).join(" · ")}`
      : `slowest ride-away ${worstKept.toFixed(2)} m/s (floor ${ROLL_AWAY_MIN}); ` +
        `the worst any attempt kept of the speed it took to the lip is ${(faster * 100).toFixed(0)}%`,
    "src/skate/skate-model.ts `LAND_SLAM_SCRUB` 0.6 → 6 — slowest ride-away 8.36 → 0.00 m/s, 33/99 dead",
  );
}

// --- 19c. a lock-on does not TELEPORT you, and it does not STOP you ----------
//
// The Grinder snaps the board onto the line's own axis the frame it catches. A
// snap the player sees is a jump he never made, and it is a per-frame quantity,
// so it is exactly the shape of thing that is fine at 144 and a metre at 30.
//
// ROUND 6: the instrument was wrong, and it was wrong in the direction that
// makes a check unfailable. It measured the catch frame's WHOLE displacement —
// travel, fall and snap together — against a made-up stride of `hypot(v, 8)·dt`,
// and then asked whether that was more than TWICE the stride. The ordinary
// travel is most of the number, the invented 8 m/s of fall inflates the
// denominator, and the answer came out 0.77×–0.93× at every rate and every
// speed. The catch window is 0.55 m deep, so the largest snap the Grinder can
// physically make is under a stride at 30 fps and the ratio can never reach 2:
// the round-4 teleport blocker — the one defect this check exists for — could
// not have turned it red. Measured: 0.93× worst, against a 2.00 bar.
//
// What is measured now is the RESIDUAL: how far the catch frame moved him that
// the frame BEFORE it does not explain. Constant velocity is what a board in
// flight has, so the previous frame's own displacement is the prediction, and
// gravity accounts for `g·dt²` of the difference (19 mm at 30 fps). Anything
// past that is the Grinder putting him somewhere he was not going.
//
// …and the second half, which is what the coping hijack actually did to a
// player: 10.73 → 1.49 m/s in one frame. A catch that takes his speed away is
// a teleport in the other axis, so SPEED RETAINED across the catch frame is
// asserted here too.
{
  const rows = [];
  const jumps = [];
  const robbed = [];
  let samples = 0;
  for (const fps of [30, 45, 60, 90, 144]) {
    const dt = 1 / fps;
    const line = STREET_SPOT.rails().find((r) => r.id === "handrail-6");
    const axis = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
    let worst = 0;
    let worstKeep = 1;
    for (const v of [6, 8, 10, 12, 14]) {
      // Two frames back and one frame back: the step between them is the
      // prediction the catch frame has to live up to.
      let prev = null;
      let stride = null;
      let speedIn = null;
      let residual = null;
      let keep = null;
      const h = harness({
        onGrindStart: () => {
          if (residual !== null || stride === null) return;
          residual = h.model.position.clone().sub(prev).sub(stride).length();
          keep = Math.abs(h.model.speed) / speedIn;
        },
      });
      h.model.position.set(line.a.x, STREET_SPOT.height(line.a.x, line.a.z - 1.6), line.a.z - 1.6);
      h.model.heading = axis;
      h.model.speed = v;
      // Shift down from the pop to the catch. Without it there is no catch, and
      // `samples` — the guard that stops this section measuring nothing — was
      // reading 0/25 and saying so. With it: 25/25 at all five rates.
      pframe(h, ["Space", "KeyE"], dt);
      pframe(h, ["Space", "KeyE"], dt);
      pframe(h, ["KeyE"], dt);
      let last = h.model.position.clone();
      for (let i = 0; i < Math.round(1.2 / dt) && residual === null; i++) {
        prev = h.model.position.clone();
        stride = prev.clone().sub(last);
        speedIn = Math.abs(h.model.speed);
        last = prev;
        pframe(h, ["KeyE"], dt);
      }
      // A case that never caught the rail measures nothing, and a section full
      // of those is the failure mode this whole file exists to refuse. Counted,
      // and the count is asserted.
      if (residual === null) continue;
      samples++;
      // Free fall is the one honest reason a frame is not the last frame
      // repeated: `g·dt²`, plus a centimetre for the board following the
      // ground. Twice that is the bar.
      const allowed = GRAVITY * dt * dt + 0.01;
      worst = Math.max(worst, residual / allowed);
      worstKeep = Math.min(worstKeep, keep);
      if (residual > allowed * 2)
        jumps.push(`${fps}fps@${v} moved ${(residual * 100).toFixed(1)} cm the frame before does not explain`);
      if (keep < 0.5) robbed.push(`${fps}fps@${v} kept ${(keep * 100).toFixed(0)}% of ${speedIn.toFixed(1)} m/s`);
    }
    rows.push(`${fps}fps ${worst.toFixed(2)}× (keeps ${(worstKeep * 100).toFixed(0)}%)`);
  }
  check(
    "a rail catch places him, it does not teleport him — 30/45/60/90/144 fps",
    jumps.length === 0 && samples === 25,
    samples !== 25
      ? `only ${samples}/25 approaches caught the rail — the check measured nothing`
      : jumps.length
        ? jumps.slice(0, 6).join(" · ")
        : `worst unexplained move on the catch frame, against free fall's own g·dt²: ${rows.join(" ")}`,
    // Re-run and re-measured, because until the slide key was wired into this
    // section the case caught 0/25 and this note was describing a red nobody
    // could reproduce. The edit is the one the morning's grind fix removed: an
    // along-the-line component in the catch offset.
    "src/skate/grind.ts — `this.offset.set(sideX * keep + 0.35 * ux * dir, …, sideZ * keep + 0.35 * uz * dir)`, " +
      "the catch offset carrying 0.35 m of along-the-line: `moved 35.1 cm the frame before does not explain`, " +
      "12.1× at 30 fps rising to 32.4× at 144, 25/25 flagged",
  );
  check(
    "…and it does not rob him of his speed on the way onto the line",
    robbed.length === 0,
    robbed.length
      ? `${robbed.length}/25 — ${robbed.slice(0, 6).join(" · ")}`
      : `worst fraction of his roll speed a lock-on left him with: ${rows.join(" ")}`,
    // …and the same re-run. It has to be written ON the line that sets it —
    // `this.speed = state.speed` is four lines above `onGrindStart` and a
    // `this.speed *= 0.2` inserted anywhere above it is simply overwritten,
    // which is a green this note would have handed out for free.
    "src/skate/skate-model.ts grind entry `this.speed = state.speed` → `state.speed * 0.2` — " +
      "`25/25 — 30fps@6 kept 20% of 5.9 m/s …`, every one of the 25",
  );
}

// --- 19d. a manual carries a line across the flat and banks at the far end ---
//
// The trick whose entire job is keeping a combo alive between two obstacles,
// and the one path with no landing under it. Ridden over the manual pad: up its
// south bump, across the flat top holding E, and off the north bump, which is
// the far end — and the line has to be worth something when it gets there.
{
  // The manual's own events are the read, not the score: a number going up says
  // nothing about whether the line SURVIVED the crossing. What has to be true
  // is one lift, one drop, nothing in between, and the drop on the far side.
  const said = [];
  const h = scoreboard({ onManual: (on, nose) => said.push(on ? (nose ? "nose" : "tail") : "down") });
  // South of the pad's own bump, aimed north along the middle of it.
  h.model.position.set(0, STREET_SPOT.height(0, 2), 2);
  h.model.heading = 0;
  h.model.speed = 9;
  let liftedAt = null;
  let droppedAt = null;
  let onto = null;
  let off = null;
  const start = h.hud.total;
  for (let i = 0; i < Math.round(3.5 / STEP); i++) {
    // E down for the whole pad, released once he is off the far end.
    const onPad = h.model.position.z > 4 && h.model.position.z < 13.4;
    hframe(h, { manualHeld: onPad });
    // SPEED RETAINED across the pad. A manny pad's whole job is to be crossable
    // WITH the line still moving — it is a link between two obstacles — and the
    // 0.40 m bumps at each end used to be walls (16.6 m/s in, 0.00 m/s out,
    // DESIGN.md). Nothing checked it afterwards; the case read events and a
    // score, and both of those are just as true of a man who stopped on it.
    if (onto === null && h.model.position.z > 4) onto = Math.abs(h.model.speed);
    if (off === null && h.model.position.z > 13.4) off = Math.abs(h.model.speed);
    if (liftedAt === null && said.includes("tail")) liftedAt = h.model.position.z;
    if (liftedAt !== null && droppedAt === null && said.includes("down")) droppedAt = h.model.position.z;
    if (droppedAt !== null && h.model.position.z > 15) break;
  }
  // Settle: the bank is announced by the landing, or by the ground close when
  // there was no landing to announce it.
  hrun(h, {}, 0.6);
  const pad = h.banked.filter((b) => b.startsWith("Manual"));
  // Carried the whole 6.4 m of pad — the flat top plus both bumps — and paid at
  // least the base value once. The pad is what the hold has to survive: it goes
  // up a bank, across a flat, and down a bank.
  const carried = liftedAt !== null && droppedAt !== null && droppedAt - liftedAt > 6;
  check(
    "a manual carries a line across the manual pad and banks it at the far end",
    carried &&
      said.join(",") === "tail,down" &&
      !h.bailed &&
      pad.length === 1 &&
      h.hud.total - start >= 120,
    `${liftedAt === null ? "NEVER lifted" : `nose up at z ${liftedAt.toFixed(1)}`}, ` +
      `${droppedAt === null ? "never came down" : `down at z ${droppedAt.toFixed(1)}`} — ` +
      `${carried ? `carried ${(droppedAt - liftedAt).toFixed(1)} m` : "DROPPED it on the pad"}, ` +
      `events [${said.join(" → ")}], ${h.bailed ? "BAILED" : "rode away"} → ` +
      `banked ${h.banked.join(" · ") || "nothing"} = ${h.hud.total}`,
    "src/skate/tricks.ts `MANUAL_MIN_SPEED` 1.5 → 12 — `NEVER lifted`, no Manual banked",
  );
  check(
    "…and he is still rolling when he gets off the far end of it",
    off !== null && off >= ROLL_AWAY_MIN && off > onto * 0.5,
    off === null
      ? `never reached the north bump — stopped on the pad at ${Math.abs(h.model.speed).toFixed(2)} m/s`
      : `onto the south bump at ${onto.toFixed(2)} m/s, off the north one at ${off.toFixed(2)} m/s`,
    "src/world/spot.ts `manual-pad-bump-s` shape ramp → flat y 0.4 (a 0.40 m wall again) — `never reached the north bump — stopped on the pad at 0.00 m/s`",
  );
}

// --- 20. THE RAGDOLL --------------------------------------------------------
//
// Round 2 had no check on it at all, and it was silently stretching bones by up
// to 53.6 mm against walls — a skeleton drawn out like chewing gum, on the one
// feature the player called "very important to do a good job on".
//
// The subject is the SHIPPED skeleton, baked. This harness stays offline and
// deterministic by design, so it cannot fetch the character — but it can carry
// the character's own bone table, and until round 5 it did not: it drove an
// invented 23-bone rig with invented names (`Spine1`, `Spine2`, `Neck`,
// `HeadTop_End`) at invented proportions, in a T-pose, with every bind rotation
// identity. The game ships 24 bones called `Spine02` / `Spine01` / `Spine`,
// `neck` in lower case, `head_end` and `headfront`, in centimetres under an
// Armature scaled 0.01, every one of them with a real bind rotation.
//
// It mattered. On the invented rig `plaza 18 m/s` turned a thigh 177.9° in one
// frame and this check went red; `tools/ragdoll-drop.mjs`, running the same
// solver against the real GLB, measured 98.6° at its worst and passed. Two
// harnesses, one solver, opposite answers — and the failing one was the one
// driving a body nobody ships. The table below is dumped straight out of
// `rigged-character.glb`, so the two now ask the same question of the same
// skeleton and any disagreement left is the solver's.
{
  const { createRagdoll } = await import("../src/skate/ragdoll.ts");
  /**
   * The shipped rig: name, parent, local position (cm, as the GLB stores it)
   * and local bind rotation. Read out of
   * `cms0fbiar004o22nuyjqjhzuz/rigged-character.glb` — head_end lands at
   * 1.703 m, which is the skater's height.
   */
  const SKEL = [
    ["Hips", null, [-0.3816, 88.9858, -1.8749], [-0.22554, 0.02666, 0.02666, 0.9735]],
    ["LeftUpLeg", "Hips", [9.3238, -8.395, -3.1304], [-0.97752, -0.0405, 0.01609, 0.20629]],
    ["LeftLeg", "LeftUpLeg", [0, 34.3881, 0], [0.09295, 0.04099, 0.03186, 0.99432]],
    ["LeftFoot", "LeftLeg", [0, 33.733, 0], [-0.52554, -0.02282, -0.0002, 0.85046]],
    ["LeftToeBase", "LeftFoot", [0, 16.3242, 0], [-0.3003, -0.01444, -0.00455, 0.95373]],
    ["RightUpLeg", "Hips", [-9.9247, -7.1917, -3.9182], [-0.97159, 0.09362, -0.06759, 0.20661]],
    ["RightLeg", "RightUpLeg", [0, 34.5239, 0], [0.09269, -0.03923, -0.03021, 0.99446]],
    ["RightFoot", "RightLeg", [0, 33.5842, 0], [-0.52411, 0.01526, -0.00708, 0.85149]],
    ["RightToeBase", "RightFoot", [0, 16.302, 0], [-0.30236, 0.01123, 0.00356, 0.95312]],
    ["Spine02", "Hips", [0.6009, 12.773, 7.0486], [0.24868, -0.02474, -0.02762, 0.96788]],
    ["Spine01", "Spine02", [0, 14.6011, 0], [0, 0, 0, 1]],
    ["Spine", "Spine01", [0, 14.6011, 0], [-0.06263, 0.00036, -0.00065, 0.99804]],
    ["LeftShoulder", "Spine", [3.4007, 1.7732, -0.6331], [0.50392, 0.53384, -0.49123, 0.46881]],
    ["LeftArm", "LeftShoulder", [0, 13.6471, 0], [0.39816, 0.4218, 0.09903, 0.80854]],
    ["LeftForeArm", "LeftArm", [0, 26.8902, 0], [-0.19646, -0.01897, 0.15561, 0.9679]],
    ["LeftHand", "LeftForeArm", [0, 26.1141, 0], [0.09104, 0.07732, 0.05614, 0.99125]],
    ["RightShoulder", "Spine", [-3.4456, 2.0208, -0.6734], [0.50358, -0.53415, 0.49662, 0.46309]],
    ["RightArm", "RightShoulder", [0, 13.7798, 0], [0.41119, -0.43616, -0.11001, 0.79284]],
    ["RightForeArm", "RightArm", [0, 26.4691, 0], [-0.20962, 0.04636, -0.1271, 0.96838]],
    ["RightHand", "RightForeArm", [0, 24.6718, 0], [0.07475, -0.09682, -0.10409, 0.98702]],
    ["neck", "Spine", [0.0449, 10.449, 1.3064], [0.06216, 0.00248, -0.00198, 0.99806]],
    ["Head", "neck", [0, 8.6415, 0], [0.22761, -0.00002, 0.00229, 0.97375]],
    ["head_end", "Head", [0.0883, 16.1592, -8.9228], [-0.24959, 0, -0.00247, 0.96835]],
    ["headfront", "Head", [-0.0883, 4.9411, 8.9228], [0.5077, 0, 0.00503, 0.86152]],
  ];
  /**
   * …and the pose he is IN when he bails: the game's rolling stance, sampled at
   * t = 0.4 s of the wired ride clip (`cms1pxt86000i22lphj1usysu`) — head at
   * 1.56 m, hips at 0.79, knees bent, arms out over the deck.
   *
   * The bind pose is not a thing the ride ever draws, and driving the solver
   * from it is not a small difference: the same bail at the same place and the
   * same speed whips a bone 170° in one frame out of the bind pose and 65° out
   * of this one. `tools/ragdoll-drop.mjs` rides the real clip for half a second
   * before every bail for exactly this reason, and until round 5 this file did
   * not — which is the whole of why the two harnesses disagreed.
   */
  const RIDE_POSE = [
    ["Hips", [0, 79.0063, 0], [-0.16633, 0.31981, 0.10556, 0.92677]],
    ["LeftUpLeg", [9.3238, -8.395, -3.1304], [0.99528, -0.03826, -0.032, 0.08325]],
    ["LeftLeg", [0, 34.3881, 0], [0.45156, 0.03263, -0.03456, 0.89097]],
    ["LeftFoot", [0, 33.733, 0], [-0.62736, -0.10706, 0.01579, 0.77117]],
    ["LeftToeBase", [0, 16.3242, 0], [-0.29068, -0.02371, -0.00396, 0.95652]],
    ["RightUpLeg", [-9.9247, -7.1917, -3.9182], [0.98371, -0.13589, 0.11601, 0.01964]],
    ["RightLeg", [0, 34.5239, 0], [0.47556, -0.03066, 0.03638, 0.87839]],
    ["RightFoot", [0, 33.5842, 0], [-0.67676, 0.11791, 0.01362, 0.72657]],
    ["RightToeBase", [0, 16.302, 0], [-0.30758, 0.01951, -0.00116, 0.95132]],
    ["Spine02", [0.6009, 12.773, 7.0486], [0.30345, 0.01124, 0.00001, 0.95278]],
    ["Spine01", [0, 14.6011, 0], [0.07604, 0.00099, 0.00304, 0.9971]],
    ["Spine", [0, 14.6011, 0], [-0.06804, 0.01768, 0.00583, 0.99751]],
    ["LeftShoulder", [3.4007, 1.7732, -0.6331], [0.59439, 0.48369, -0.45352, 0.45504]],
    ["LeftArm", [0, 13.6471, 0], [0.52998, 0.41134, 0.30397, 0.6764]],
    ["LeftForeArm", [0, 26.8902, 0], [-0.31982, -0.09143, 0.28434, 0.89917]],
    ["LeftHand", [0, 26.1141, 0], [0.18391, -0.00491, -0.15398, 0.9708]],
    ["RightShoulder", [-3.4456, 2.0208, -0.6734], [0.61892, -0.4789, 0.43115, 0.44913]],
    ["RightArm", [0, 13.7798, 0], [0.49635, -0.3745, -0.29266, 0.72646]],
    ["RightForeArm", [0, 26.4691, 0], [-0.24667, 0.11901, -0.21463, 0.93751]],
    ["RightHand", [0, 24.6718, 0], [0.10957, -0.1047, 0.01407, 0.98835]],
    ["neck", [0.0449, 10.449, 1.3064], [0.06869, 0.25931, -0.00903, 0.96331]],
    ["Head", [0, 8.6415, 0], [0.24384, 0.00014, 0.00241, 0.96981]],
    ["head_end", [0.0883, 16.1592, -8.9228], [-0.32685, 0.13114, -0.04976, 0.93461]],
    ["headfront", [-0.0883, 4.9411, 8.9228], [0.5077, 0, 0.00503, 0.86152]],
  ];
  /** The Armature the bones hang under: the GLB authors them in centimetres. */
  const RIG_SCALE = 0.01;
  const skeleton = () => {
    const root = new THREE.Object3D();
    const armature = new THREE.Object3D();
    armature.scale.setScalar(RIG_SCALE);
    root.add(armature);
    const by = new Map();
    const bones = [];
    for (const [name, parent, p, q] of SKEL) {
      const bone = new THREE.Bone();
      bone.name = name;
      bone.position.fromArray(p);
      bone.quaternion.fromArray(q);
      (parent ? by.get(parent) : armature).add(bone);
      by.set(name, bone);
      bones.push(bone);
    }
    for (const [name, p, q] of RIDE_POSE) {
      by.get(name).position.fromArray(p);
      by.get(name).quaternion.fromArray(q);
    }
    root.updateMatrixWorld(true);
    return { root, bones, pairs: SKEL.filter((s) => s[1]).map(([n, p]) => [by.get(p), by.get(n)]) };
  };

  const bail = ({ x, y, z, vel, fps, spin = 0, drop = 0 }) => {
    const dt = 1 / fps;
    const { root, bones, pairs } = skeleton();
    const rd = createRagdoll({ root, surface: STREET_SPOT });
    // Ride him first, so the bone history the fall is seeded from is real —
    // `observe()` is what makes a bail carry his speed instead of dropping a
    // mannequin, and it is under test here rather than assumed.
    //
    // The run-up starts UPSTREAM and ends at (x, z), which is the place the
    // case is named after. It used to start AT (x, z) and ride 0.4 s further
    // on, so "plaza 18 m/s" bailed 7.2 m north of the plaza, on the manual
    // pad's step — a different case with a misleading name, and the reason this
    // file and `ragdoll-drop.mjs` reported 179° and 65° for the same bail.
    const PRE = 0.4;
    root.position.set(x - vel[0] * PRE, y + drop, z - vel[2] * PRE);
    // …and the body's own turn, which is what a bail out of a spin carries into
    // the fall. Without it every case here is a body travelling in a straight
    // line, and a straight line is the one thing a joint limit never has to
    // catch — measured: with the four straight cases alone, DELETING
    // `solveLimits()` outright changed the worst one-frame turn by 3°, so the
    // limits could have been removed and this file would have said nothing.
    root.rotation.y = -spin * PRE;
    root.updateMatrixWorld(true);
    const step = new THREE.Vector3(vel[0] * dt, 0, vel[2] * dt);
    for (let i = 0; i < Math.round(PRE / dt); i++) {
      rd.observe(dt);
      root.position.add(step);
      root.rotation.y += spin * dt;
      root.updateMatrixWorld(true);
    }
    rd.start(new THREE.Vector3(...vel));
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const rest = pairs.map(([p, c]) =>
      a.setFromMatrixPosition(p.matrixWorld).distanceTo(b.setFromMatrixPosition(c.matrixWorld)),
    );
    const prev = bones.map((bone) => bone.getWorldQuaternion(new THREE.Quaternion()));
    /**
     * THE JOINT RANGES, which had no check at all.
     *
     * The `turn` assertion below is a check on the INTEGRATOR and says so, and
     * it is the only thing in this file that ever went near `solveLimits` —
     * deleting the limits outright makes that number BETTER (95.6° → 69.6°),
     * so a round-5 verifier removed the guard and the assertion named after it
     * stayed green. Nothing anywhere asked the question the limits exist to
     * answer: does a knee bend backwards.
     *
     * What is measured is the FOLD: the plain 3D angle between the two segments
     * a knee (or an elbow) joins. Straight is 0°, doubled over is 180°, and
     * `LIMITS` in ragdoll.ts allows a knee and an elbow 150° of it — so 150 is
     * the bar and this file does not invent one.
     *
     * It is NOT the solver's own signed hinge angle, and that is a limitation
     * worth writing down rather than papering over. `solveLimits` measures a
     * SIGNED angle projected about an axis carried by the parent's particle-frame
     * rotation (`lim.axis.applyQuaternion(limbs[l.parent].delta)`), and the bone
     * write-back deliberately re-rolls each bone minimally — so the roll the
     * limit is measured against is not in the posed skeleton and cannot be read
     * back out of it. Two attempts at reconstructing the sign from bone world
     * transforms are recorded in the report; both answered 179.9° of
     * hyperextension AND 179.9° of flexion on the same knee, which is one folded
     * leg seen through a plane that had turned over underneath it. Reading the
     * hinge's own signed range wants a hook in ragdoll.ts, and that is a file
     * this lane does not own.
     *
     * The fold catches what it is here to catch anyway. Measured over the 21
     * falls with `solveLimits()` deleted from the pass loop — the exact break
     * that a round-5 verifier applied and every ragdoll assertion in this file
     * survived — the worst settled fold goes 147.5° → 173.2° and the worst peak
     * fold 160.7° → 177.7°.
     */
    const byName = new Map(bones.map((b) => [b.name, b]));
    const HINGES = [
      ["LeftUpLeg", "LeftLeg", "LeftFoot"],
      ["RightUpLeg", "RightLeg", "RightFoot"],
      ["LeftArm", "LeftForeArm", "LeftHand"],
      ["RightArm", "RightForeArm", "RightHand"],
    ];
    const wp = (n) => new THREE.Vector3().setFromMatrixPosition(byName.get(n).matrixWorld);
    const _up = new THREE.Vector3();
    const _dn = new THREE.Vector3();
    const fold = (j) => {
      _up.copy(wp(j[1])).sub(wp(j[0])).normalize();
      _dn.copy(wp(j[2])).sub(wp(j[1])).normalize();
      return (Math.acos(THREE.MathUtils.clamp(_up.dot(_dn), -1, 1)) * 180) / Math.PI;
    };
    let peakFold = 0; // worst fold at any instant of the fall
    let restFold = 0; // …and the fold he is still lying in on the last frame
    let drift = 0;
    let turn = 0;
    let t = 0;
    let settledAt = null;
    for (let i = 0; i < Math.round(6 / dt); i++) {
      rd.update(dt);
      t += dt;
      root.updateMatrixWorld(true);
      pairs.forEach(([p, c], k) => {
        a.setFromMatrixPosition(p.matrixWorld);
        b.setFromMatrixPosition(c.matrixWorld);
        drift = Math.max(drift, Math.abs(a.distanceTo(b) - rest[k]));
      });
      bones.forEach((bone, k) => {
        bone.getWorldQuaternion(q);
        turn = Math.max(turn, 2 * Math.acos(Math.min(1, Math.abs(q.dot(prev[k])))));
        prev[k].copy(q);
      });
      restFold = 0;
      for (const j of HINGES) {
        const d = fold(j);
        peakFold = Math.max(peakFold, d);
        restFold = Math.max(restFold, d);
      }
      if (settledAt === null && rd.settled) settledAt = t;
    }
    // Where he came to rest: how far the deepest bone would have to travel to
    // get out of solid matter, whichever way is nearest. Depth below the
    // nearest top face is useless — a knuckle a millimetre past a building's
    // footprint reads 12 m.
    //
    // UP is one of the ways, and leaving it out is what made this check lie in
    // both directions. `blocked` is `top > y`, so a bone lying ON a face is a
    // float underneath it: the deepest bone of a body settled on the quarter
    // pipe's deck sits 1.64 mm under 2.600 m of plywood, the sideways search
    // then walks the full 1.2 m cap across twenty metres of deck, and a body
    // resting exactly where it should reports as buried a metre deep. Measured
    // upward by bisection, because the number that decides it there is
    // millimetres and the 1 cm sideways stride cannot see one.
    let inside = 0;
    const p = new THREE.Vector3();
    for (const bone of bones) {
      p.setFromMatrixPosition(bone.matrixWorld);
      if (!STREET_SPOT.blocked(p.x, p.z, p.y)) continue;
      let out = 1.2;
      if (!STREET_SPOT.blocked(p.x, p.z, p.y + 1.2)) {
        let lo = 0;
        let hi = 1.2;
        for (let k = 0; k < 32; k++) {
          const mid = (lo + hi) / 2;
          if (STREET_SPOT.blocked(p.x, p.z, p.y + mid)) lo = mid;
          else hi = mid;
        }
        out = hi;
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let d = 0.01; d <= out; d += 0.01) {
          if (!STREET_SPOT.blocked(p.x + dx * d, p.z + dz * d, p.y)) {
            out = Math.min(out, d);
            break;
          }
        }
      }
      inside = Math.max(inside, out);
    }
    // …and how HIGH he came to rest, which nothing measured at all: `drift`,
    // `turn`, `settled` and `blocked` are every one of them satisfied by a body
    // lying peacefully on a twelve-metre roof, and three of the four cases here
    // are thrown at a building. Two numbers say it. The lowest bone has to be
    // ON the floor under it, and the hips must not end up above the height he
    // fell from — a fall goes down.
    let float = Infinity;
    let hipsY = 0;
    for (const bone of bones) {
      p.setFromMatrixPosition(bone.matrixWorld);
      if (bone.name === "Hips") hipsY = p.y;
      float = Math.min(float, p.y - STREET_SPOT.height(p.x, p.z, p.y + 0.15));
    }
    return {
      drift,
      turn: (turn * 180) / Math.PI,
      settledAt,
      inside,
      float,
      rise: hipsY - y,
      peakFold,
      restFold,
    };
  };

  const at = (x, z) => STREET_SPOT.height(x, z);
  const cases = [
    ["plaza 6 m/s", { x: 2, z: 0, y: at(2, 0), vel: [0, 0, 6] }],
    ["plaza 18 m/s", { x: 2, z: 0, y: at(2, 0), vel: [0, 0, 18] }],
    ["QP deck into the north building", { x: -4, z: 31, y: at(-4, 31), vel: [0, 2, 14] }],
    ["west wall 14 m/s", { x: -31, z: 12, y: at(-31, 12), vel: [-14, 0, 0] }],
    // The three that actually load the joints. A body sliding in a straight
    // line never asks a limit anything; a body arriving spinning, or arriving
    // from a height, is the whole of what these limits are for — and they are
    // the falls a player sees, because a bail is what a blown SPIN looks like.
    ["out of a 540, 6 m/s", { x: 2, z: 0, y: at(2, 0), vel: [0, 0, 6], spin: 7.6, drop: 0.6 }],
    ["out of a 540 off the QP deck", { x: -4, z: 30, y: at(-4, 30), vel: [0, 0, 10], spin: 7.6, drop: 1.2 }],
    ["dropped 1.5 m at 16 m/s", { x: 2, z: -4, y: at(2, -4), vel: [0, 0, 16], drop: 1.5 }],
  ];
  const rows = [];
  for (const fps of [30, 60, 144]) {
    for (const [name, c] of cases) rows.push([`${fps}fps ${name}`, bail({ ...c, fps })]);
  }
  const worst = (pick) => rows.reduce((m, [, r]) => Math.max(m, pick(r)), 0);
  const name = (pick) => rows.reduce((m, r) => (pick(r[1]) > pick(m[1]) ? r : m))[0];

  // 1. A bone never gives. This was silently 53.6 mm against a wall, because the
  //    old wall branch yanked the particle back to a stale position on every one
  //    of the ten relaxation passes so the links could never converge against it.
  //
  //    The bar is 0.5 mm and not the 2 mm it was, because 2 mm did not bite:
  //    cutting `FINAL_BONE_PASSES` from 24 to 1 — the pass whose whole job is
  //    this number — measured 1.73 mm and went green. The solver as it stands
  //    holds every one of these 21 falls to 0.007 mm, so 0.5 leaves seventy
  //    times the headroom and still catches the thing it is named after.
  check(
    "no bone ever stretches, on open ground or against a wall",
    worst((r) => r.drift) < 0.0005,
    `worst ${(worst((r) => r.drift) * 1000).toFixed(3)} mm — ${name((r) => r.drift)}`,
  );
  // 2. No limb turns inside out. Anything near 180° in one frame is an arm going
  //    through the chest, which is what a single-child bone with no roll did.
  //
  //    HONESTLY LABELLED, because it does not cover what its neighbours cover.
  //    Deleting `solveLimits()` outright — the joint limits, the whole of them —
  //    makes this number BETTER, not worse: 95.6° with the limits in and 69.6°
  //    with them gone, measured over all 21 falls. The limits are themselves the
  //    largest single-frame turn in the solver, because catching a joint that
  //    has gone out of range is a snap. So this is a check on the INTEGRATOR
  //    (nothing whips) and the joint ranges have no check at all. The hardest
  //    break found for it is `FINAL_BONE_PASSES` 24 → 1, at 114°.
  check(
    "…and no bone reverses in a single frame — an INTEGRATOR check, not a limits one",
    worst((r) => r.turn) < 120,
    `worst ${worst((r) => r.turn).toFixed(1)}° — ${name((r) => r.turn)}`,
    "src/skate/ragdoll.ts `FINAL_BONE_PASSES` 24 → 1 — worst single-frame turn 114°→ over the bar at 30fps out of a 540. " +
      "NOT watched failing against `LIMIT_TURN_RATE` or `solveLimits`, and it cannot be: deleting them makes this number BETTER (95.6° → 69.6°). The check below is the one that covers them.",
  );
  // …and THE JOINT RANGES, which is the check that was missing. The neighbour
  // above is the whole reason it has to exist: a round-5 verifier deleted
  // `solveLimits()` outright and every ragdoll assertion in this file stayed
  // green, because not one of them ever asked whether a knee bends backwards.
  //
  // 5° of hyperextension and 150° of flex are `LIMITS` in ragdoll.ts, read off
  // the source rather than invented here, and the tolerance is the solver's own
  // give — it is a projection solver, so a joint is pulled back to its limit
  // over a pass rather than clamped inside it.
  const worstRest = rows.reduce((m, r) => (r[1].restFold > m[1].restFold ? r : m));
  const worstPeak = rows.reduce((m, r) => (r[1].peakFold > m[1].peakFold ? r : m));
  // He comes to REST inside the joint's range. A solver that gives a little on
  // an impact frame is a solver; a body lying on the concrete with its shin
  // folded onto its thigh is a bug the player looks at for a second and a half.
  // The bar is the limit plus five degrees of the projection solver's own give,
  // and it is not tight to nothing: the shipped fall settles at 147.5°.
  check(
    "…and no knee or elbow comes to REST folded past the joint's own 150° range",
    worstRest[1].restFold < 155,
    `worst settled fold ${worstRest[1].restFold.toFixed(1)}° of 150° allowed — ${worstRest[0]}`,
    "src/skate/ragdoll.ts `solveLimits()` removed from the pass loop — worst settled fold 147.5° → 173.2°",
  );
  // …and the same fold at its worst INSTANT, which is a weaker check and is
  // labelled as one. A hinge limit only bounds the component of the bend about
  // its own axis, so a limb swinging out of that plane can reach a bigger 3D
  // fold perfectly legally: the shipped fall peaks at 160–169° against a 150°
  // limit and is not violating anything. That leaves only ~8° between a working
  // solver and one with `solveLimits()` deleted (177.7°), which is a thin bar
  // and is here because a thin bar on the right quantity beats no bar at all.
  // The tight version wants the solver's own signed angle exported.
  check(
    "…and nothing folds shut mid-fall either",
    worstPeak[1].peakFold < 175,
    `worst fold at any instant ${worstPeak[1].peakFold.toFixed(1)}° — ${worstPeak[0]} (a 150° hinge limit bounds the in-plane component only, so this bar is loose on purpose)`,
    "src/skate/ragdoll.ts `LIMITS.shin.b` 150° → 179° — worst fold 160.7° → 179.1°; " +
      "and `solveLimits()` removed from the pass loop — 177.7°",
  );
  // 3. Every bail ENDS. `MAX_SIM` is 4 s and it is a valve, not a settle.
  const stuck = rows.filter(([, r]) => r.settledAt === null || r.settledAt > 3.9);
  check(
    "…and every fall comes to rest before the simulation is cut off",
    stuck.length === 0,
    rows.map(([n, r]) => `${n.split(" ")[0]} ${r.settledAt?.toFixed(2) ?? "NEVER"}`).join(" · "),
  );
  // 4. …and he comes to rest on the concrete, not inside it.
  check(
    "…and nothing comes to rest inside solid matter",
    worst((r) => r.inside) < 0.03,
    `deepest ${(worst((r) => r.inside) * 1000).toFixed(0)} mm inside — ${name((r) => r.inside)}`,
  );
  // 5. …nor floating over it, nor up on the roof of the thing he hit.
  const floaty = rows.reduce((m, r) => (r[1].float > m[1].float ? r : m));
  const risen = rows.reduce((m, r) => (r[1].rise > m[1].rise ? r : m));
  check(
    "…and he comes to rest ON the floor he fell to, not above it",
    // A metre of rise, because a body can honestly come to rest propped against
    // a ledge with its hips well off the concrete (53 cm, measured) — what this
    // is here to catch is the twelve-metre one.
    floaty[1].float < 0.12 && risen[1].rise < 1,
    `lowest bone floats ${(floaty[1].float * 100).toFixed(1)} cm — ${floaty[0]} · hips end ${(risen[1].rise * 100).toFixed(0)} cm above where he fell — ${risen[0]}`,
  );
}

const failed = results.filter((r) => !r.pass);
const unproven = results.filter((r) => !r.proof);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log(`FAILED: ${failed.map((f) => f.name).join(" · ")}`);
// The second score, and it is the one round 5 needed. A green run whose
// assertions have never been watched failing is a green run that means nothing.
console.log(
  `${results.length - unproven.length}/${results.length} watched failing against deliberately broken code`,
);
if (unproven.length)
  console.log(`UNPROVEN (guesses, marked as such in the file): ${unproven.map((r) => r.name).join(" · ")}`);
process.exitCode = failed.length ? 1 : 0;
