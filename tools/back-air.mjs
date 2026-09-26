// The north transition, taken the way a PLAYER takes it — at an angle, on the
// keys he actually holds.
// — `node --experimental-strip-types tools/back-air.mjs [--quick] [--trace=SPEED@FPS@DEG@MODE]`
//
// WHY A SECOND RAMP HARNESS. `tools/back-ramp.mjs` settled the question it was
// built for — the release fires, and the disease was the apron behind the lip —
// and its own header records the two blind spots that let five green rounds miss
// the player's report: a check that COASTS at the ramp, and a check that stops
// the clock at the landing. Both are fixed there. Neither of them is this one.
//
// This file exists for the third blind spot, and it is a blind spot both of the
// other harnesses share: **every approach either of them measures is SQUARE ON,
// with heading = 0, and every one holds the same one key.** A player does
// neither.
//
//   · HEADING. `slopeAlong` is a plane gradient dotted with the direction of
//     travel, so a bank crossed θ off square reports `tan(face)·cos θ` — its
//     own grade only when θ = 0. Every number the ride reads off this ramp
//     (`roll`'s per-piece gravity, `lipDecision`'s ψ, `takeOff`'s split,
//     `land`'s `along`/`into`) is that reading and not the geometry's.
//   · THE KEYS. Holding W and Space together is not "throttle + charge": see
//     `input.ts`'s `pushLocked` — Space arriving on top of a held W turns the
//     THROTTLE OFF and leaves the pump on, and an `olliePressed` never fires at
//     all until the key comes UP. A player who holds Space through the lip is
//     riding a different vehicle from one who taps it, and neither is the
//     `{...EMPTY_INPUT, throttle: true}` the other harnesses feed.
//
// So the key state machine is replicated here rather than approximated — W and
// Space as two booleans through the same `pushLocked` / `chargeSpent` rules
// `SkateInputSource.consume` runs — and every run is classified against the four
// things the player asked for, in his own order:
//
//   UP     — he leaves the ground and goes UP, not out. The launch angle.
//   PLANE  — the air stays in the plane of the takeoff: no sideways deflection,
//            and his own heading is preserved so a spin is his to choose.
//   SPIN   — hang time enough to actually complete a 180 and a 360. Not
//            asserted from the apex: the spin is FLOWN, with the stick held and
//            released, and the landing has to come out clean rather than a bail.
//   DOWN   — he comes down on the ramp FACE and rolls back down it, not onto the
//            deck and not into the brick.

import { register } from "node:module";

register(new URL("./ts-resolve.mjs", import.meta.url));
const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { STREET_SPOT, SOLIDS, SPOT_MAX_Z, topOf, arcRun } = await import("../src/world/spot.ts");
const { SPIN_SQUARE_DEG } = await import("../src/skate/contracts.ts");

const QUICK = process.argv.includes("--quick");
const RATES = [30, 60, 144];
const HEADINGS = [0, 10, 20, 30, 40, -10, -20, -30, -40];

// --- the ramp, off its own solids --------------------------------------------

// THE RAMP IS READ, NOT TYPED — and it is read POSITIONALLY, not by id.
//
// The geometry lane is re-cutting this ramp: the face becomes one flat inclined
// panel plus a kick, the sloped landing zone is being sized against the POPPED
// range instead of the coasted one, and the lip may move south. So an id lookup
// is a stale constant with extra steps — `back-apron` was already renamed
// `back-return` once, and the next cut can drop `back-return` and `back-deck`
// entirely. Everything below comes off the solids' own footprints and profiles:
//
//   THE FACE   — the non-flat solid standing against the north wall at x = 0.
//   THE LIP    — its own +z edge, and the height and tangent there.
//   BEHIND IT  — walked north from the lip: how much of the shelf still SLOPES
//                (something you can roll back down) and where the first LEVEL top
//                starts (the thing a board comes down on and cannot leave).
//
// If the lane deletes the level top altogether these read as "no level top" and
// the sweep keeps working; nothing here needs the ids to survive.
const TRANS = (() => {
  const byId = SOLIDS.find((s) => s.id === "back-trans");
  if (byId) return byId;
  // The tallest non-flat top at x = 0 whose +z edge is inside the north wall.
  let best = null;
  for (const s of SOLIDS) {
    if (s.profile.shape === "flat") continue;
    if (s.cz + s.hz > SPOT_MAX_Z + 0.01 || s.cz - s.hz < SPOT_MAX_Z - 12) continue;
    if (Math.abs(0 - s.cx) > s.hx) continue;
    const top = topOf(s, 0, s.cz + s.hz - 1e-6);
    if (top === null) continue;
    if (!best || top > best.top) best = { s, top };
  }
  if (!best) throw new Error("no north transition found against SPOT_MAX_Z");
  return best.s;
})();
const TOE_Z = TRANS.cz - TRANS.hz;
const LIP_Z = TRANS.cz + TRANS.hz;
const LIP_Y = topOf(TRANS, 0, LIP_Z - 1e-6);
/** The face's own tangent AT the coping — the ≥80° the geometry lane guarantees. */
const LIP_DEG =
  (Math.atan(STREET_SPOT.slopeAlong(0, LIP_Z - 0.001, 0, 1, LIP_Y + 0.15)) * 180) / Math.PI;

/** Walked north from the lip: the sloped shelf, and the first level top past it. */
const BEHIND = (() => {
  const out = { slope: 0, flatAt: null, flatId: null, flatY: null };
  for (let z = LIP_Z + 0.02; z <= SPOT_MAX_Z + 1e-9; z += 0.02) {
    let best = null;
    let bestY = -Infinity;
    for (const s of SOLIDS) {
      const top = topOf(s, 0, z);
      if (top === null || top < bestY) continue;
      best = s;
      bestY = top;
    }
    if (!best) break;
    if (best.profile.shape === "flat") {
      out.flatAt = z;
      out.flatId = best.id;
      out.flatY = bestY;
      break;
    }
    out.slope = z - LIP_Z;
  }
  return out;
})();

/** The spin rate the model flies at, and what a half and a full turn cost. */
const AIR_SPIN_RATE = 7.6;
const T_180 = Math.PI / AIR_SPIN_RATE;
const T_360 = (2 * Math.PI) / AIR_SPIN_RATE;

/** Which solid the ride's own ground probe lands on — `resolve()` replicated. */
function probe(x, z, yHint) {
  let best = null;
  let bestY = -Infinity;
  for (const s of SOLIDS) {
    const top = topOf(s, x, z);
    if (top === null) continue;
    if (s.profile.shape === "flat" && top > yHint) continue;
    if (top < bestY) continue;
    best = s;
    bestY = top;
  }
  // `flat` rather than the id, because the geometry behind this coping is being
  // re-cut under this harness and the ids will not survive it. "Came down on the
  // ramp" is a claim about the SHAPE — a face you can roll back down — and
  // "stranded on the deck" is a claim about a level top. Those two survive a
  // rename; `back-return` does not.
  return best
    ? { id: best.id, y: bestY, flat: best.profile.shape === "flat" }
    : { id: "—", y: -Infinity, flat: false };
}

// --- the keys, as `SkateInputSource` actually resolves them --------------------
//
// Two booleans in, one `SkateInput` out, running the same three rules the real
// source runs. Written out rather than imported because the source is built on
// `window` and reads `performance.now()`; the rules are four lines and they are
// the four that decide what a player holding W and Space is actually asking for.
function makeKeys() {
  return { throttleWas: false, windingWas: false, pushLocked: false, chargeSpent: false };
}
function consume(k, { w, space, steer = 0 }) {
  const pushDown = w;
  const winding = space;
  const pushStarted = pushDown && !k.throttleWas;
  if (pushStarted && k.windingWas) k.chargeSpent = true;
  if (winding && !k.windingWas && k.throttleWas) k.pushLocked = true;
  if (!pushDown) k.pushLocked = false;
  // Space coming UP is the pop, and it is also the other end of the lock.
  const released = !winding && k.windingWas;
  const olliePressed = released && !k.chargeSpent;
  if (released) {
    k.pushLocked = false;
    k.chargeSpent = false;
  }
  k.throttleWas = pushDown;
  k.windingWas = winding;
  return {
    ...EMPTY_INPUT,
    throttle: pushDown && !k.pushLocked,
    steer,
    chargeHeld: winding && !k.chargeSpent,
    olliePressed,
  };
}

// --- one approach, watched all the way through --------------------------------

/**
 * `mode` is what the hands are doing, and each one is a real player:
 *
 *   `W`      — the throttle held the whole way. What the level teaches.
 *   `coast`  — nothing pressed. What `collide-sweep`'s ramp checks measure.
 *   `hold`   — W held, and Space pressed 2 m before the lip and NEVER released.
 *              No pop fires (`resolve` needs `olliePressed`, which is a key-UP)
 *              and `pushLocked` has taken the throttle away. The player who
 *              "jumps" at a ramp by leaning on Space.
 *   `tap`    — W held, Space pressed 2 m out and released at the lip: the pop
 *              the ramp is supposed to answer.
 *
 * `spin` is 0, 180 or 360: the stick held from the launch for exactly as long as
 * that many degrees takes, then centred. That is the spin FLOWN and not assumed.
 */
function ride({
  speed,
  fps,
  headingDeg,
  mode = "W",
  spin = 0,
  seconds = 16,
  x0 = 0,
  // The stick, HELD from the start and all the way up the face — a rider carving
  // at the bank rather than one aimed at it and going straight. This is the
  // dimension that reproduced the sixth report: 0.5 held for the run-up puts him
  // 83° off square at the coping, which no fixed heading in this sweep reaches.
  steerHeld = 0,
  log = false,
}) {
  const dt = 1 / fps;
  const model = new SkateModel({}, STREET_SPOT);
  const heading = (headingDeg * Math.PI) / 180;
  // Started far enough out that the whole climb is on the ramp: the run-up is
  // measured along the HEADING, so an angled approach needs a longer one.
  const back = 8 / Math.cos(heading);
  const z0 = TOE_Z - back * Math.cos(heading);
  const sx = x0 - back * Math.sin(heading);
  model.position.set(sx, STREET_SPOT.height(sx, z0), z0);
  model.heading = heading;
  model.speed = speed;
  const keys = makeKeys();

  const out = {
    startOn: probe(sx, z0, 40).id,
    bail: null,
    brick: null,
    /** The lip, and whether he ever got there at all. */
    atLip: null,
    maxY: -Infinity,
    launch: null,
    apex: -Infinity,
    hang: 0,
    land: null,
    /** Sideways deflection: metres off the vertical plane of the takeoff. */
    drift: 0,
    /** How far his own heading moved between launch and touchdown, degrees. */
    yaw: 0,
    /** Wheels down north of the lip — rolling onto the deck instead of flying. */
    overLip: null,
    rolledDown: null,
    /** He got onto the face at all, he got to the coping, he got back down. */
    onRamp: false,
    reachedLip: false,
    backToPlaza: null,
    /** Heading as he crossed the toe, and how far the CLIMB turned it. */
    toeHeading: null,
    straightened: null,
    /** Furthest north he ever got with the wheels down, and how high. */
    maxGroundZ: -Infinity,
    /** Did he end the run stranded on a FLAT top behind the coping? */
    strandedOn: null,
    /**
     * DID HE EVER GET THE WHEELS ONTO THE LEVEL TOP — however briefly, and
     * whether or not he later got off it.
     *
     * This column exists because the one it replaces was not measuring the
     * player's complaint. `strandedOn` reads the LAST frame of the run, so a
     * rider who rolls over the crest, walks the deck to the brick, stalls at
     * 1 km/h and then rolls back down the face scored `good` — he came back down,
     * so nothing was flagged. That is exactly the picture in the director's
     * capture (`run3-f10.png`: standing on the level top at 1 km/h with his nose
     * in the graffiti), and the player has been describing it for seven rounds.
     * "Comes back down eventually" is not what he asked for; "lands back on the
     * ramp and rides down" is.
     *
     * `overLip` cannot stand in for it either: it fires on the first wheels-down
     * frame north of the lip, which a touchdown on the return satisfies at once.
     * This one asks about a LEVEL top specifically — the thing you cannot roll off.
     */
    overTop: null,
    /** …and the slowest he ever got while up there, which is the 1 km/h frame. */
    topMinSpeed: null,
    rows: [],
    end: null,
  };
  model.events.onBail = (trick) => {
    // ONLY a bail AT THE RAMP, and the x test is not decoration. 16 s of held
    // throttle carries a fakie roll-back the length of the plaza and into the
    // side walls; `back-ramp.mjs` filters that with a z band alone, and a z band
    // alone catches it — measured, 10 m/s at 20° off square rolled back down at
    // 12 m/s, crossed the plaza and slammed the WEST facade at (−38.00, 0.33,
    // 41.66) at 10.93 m/s with 39.69 m of building over him. z 41.66 is north of
    // the toe, so it read as a bail on the ramp. It is a bail on a shopfront.
    const p = model.position;
    if (p.z < TOE_Z - 8) return;
    if (Math.abs(p.x - TRANS.cx) > TRANS.hx - 2) return;
    if (!out.bail) out.bail = { x: p.x, z: p.z, y: p.y, trick: trick ?? "—" };
  };
  model.events.onWallHit = (into) => {
    if (model.position.z < SPOT_MAX_Z - 4) return;
    if (!out.brick || into > out.brick.into)
      out.brick = { into, y: model.position.y, z: model.position.z };
  };

  const frames = Math.ceil(seconds / dt);
  let spinLeft = 0;
  for (let i = 0; i < frames; i++) {
    const p = model.position;
    const toLip = LIP_Z - p.z;
    const w = mode !== "coast";
    let space = false;
    if (mode === "hold") space = toLip <= 2;
    else if (mode === "tap") space = toLip <= 2 && toLip > 0.02;
    // The stick: the carve on the ground, and the commanded spin in the air only
    // while it still has degrees left to turn.
    let steer = out.launch ? 0 : steerHeld;
    if (spin > 0 && out.launch && spinLeft > 0) {
      steer = 1;
      spinLeft -= dt;
    }
    if (out.toeHeading === null && p.z >= TOE_Z) out.toeHeading = model.heading;
    const input = consume(keys, { w, space, steer });
    const wasAir = model.state === "air";
    model.update(input, dt);
    const air = model.state === "air";
    if (!air && p.z >= LIP_Z - 0.06 && p.z <= LIP_Z + 0.06 && out.atLip === null)
      out.atLip = Math.abs(model.speed);
    if (!air && p.z > TOE_Z) out.maxY = Math.max(out.maxY, p.y);

    if (!out.launch && air && p.z >= TOE_Z) {
      const vh = Math.hypot(model.velX, model.velZ);
      out.launch = {
        z: p.z,
        y: p.y,
        x: p.x,
        deg: (Math.atan2(model.vy, vh) * 180) / Math.PI,
        v: Math.hypot(vh, model.vy),
        vy: model.vy,
        vh,
        heading: model.heading,
        // The plane of the takeoff: the vertical plane through the launch point
        // containing the direction he was TRAVELLING in. Its horizontal normal
        // is what a sideways deflection is measured against.
        //
        // Taken off the HEADING and not off `(velX, velZ)`: at an 88° lip `vh`
        // is a few centimetres a second, so the travel direction is numerically
        // degenerate there while the heading is exact — and the heading is what
        // the player means by "the same plane as their takeoff", because it is
        // the line he rode in on.
        nx: Math.cos(model.heading),
        nz: -Math.sin(model.heading),
      };
      spinLeft = spin === 180 ? T_180 : spin === 360 ? T_360 : 0;
      // How much of the off-square the CLIMB took out (or put in). Positive =
      // closer to square with the fall line at the lip than at the toe.
      if (out.toeHeading !== null)
        out.straightened =
          (Math.abs(out.toeHeading) - Math.abs(model.heading)) * (180 / Math.PI);
    }
    // THE AIR ONLY — everything here stops at the first touchdown. A run watched
    // for 16 s takes more airs than this one (the plaza has a quarter pipe and a
    // funbox in it), and a `hang` or a `drift` that kept adding them up is a
    // column about the harness's own stride rather than about this lip. Measured
    // before the gate went in: 1.0 s of real hang printed as 2.7.
    if (out.launch && !out.land) {
      out.apex = Math.max(out.apex, p.y);
      if (air) out.hang += dt;
      const d = Math.abs((p.x - out.launch.x) * out.launch.nx + (p.z - out.launch.z) * out.launch.nz);
      out.drift = Math.max(out.drift, d);
    }
    if (out.launch && !out.land && !air) {
      const g = probe(p.x, p.z, p.y + 0.15);
      out.land = {
        z: p.z,
        y: p.y,
        x: p.x,
        speed: model.speed,
        on: g.id,
        flat: g.flat,
        drift: out.drift,
      };
      let dy = ((model.heading - out.launch.heading) * 180) / Math.PI;
      while (dy > 180) dy -= 360;
      while (dy < -180) dy += 360;
      // A commanded spin turns the heading on purpose; what this column is for
      // is the deflection he did NOT ask for, so the command comes out of it.
      out.yaw = dy - (spin === 0 ? 0 : spin);
    }
    if (!air && p.z > LIP_Z + 0.02)
      out.overLip = out.overLip ?? { z: p.z, y: p.y, launched: !!out.launch };
    if (!air && p.z > out.maxGroundZ) out.maxGroundZ = p.z;
    // Wheels on the LEVEL top, at any point in the run. See `overTop`.
    if (!air && p.z > LIP_Z) {
      const g = probe(p.x, p.z, p.y + 0.15);
      if (g.flat) {
        out.overTop = out.overTop ?? { z: p.z, y: p.y, on: g.id, speed: model.speed, at: i * dt };
        if (out.topMinSpeed === null || Math.abs(model.speed) < out.topMinSpeed.v)
          out.topMinSpeed = { v: Math.abs(model.speed), x: p.x, z: p.z };
      }
    }
    // …and the last of his sentence: "ride down". Grounded, back on the plaza,
    // below the toe of the ramp he just flew off.
    if (out.land && !out.rolledDown && !air && p.z <= TOE_Z)
      out.rolledDown = { at: i * dt, speed: model.speed };
    // The same question for a run that never got air at all: did he at least come
    // back DOWN? A hard carve at a bank that never reaches the coping is skating,
    // not a defect — but a carve that leaves him parked up there is the defect
    // wearing a different hat, so the two have to be told apart.
    if (out.onRamp && !out.backToPlaza && !air && p.z <= TOE_Z)
      out.backToPlaza = { at: i * dt, speed: model.speed };
    if (!air && p.z > TOE_Z + 0.5) out.onRamp = true;
    if (out.atLip === null && !air && p.z >= LIP_Z - 0.05) out.reachedLip = true;
    if (log && p.z > TOE_Z - 1) {
      const g = probe(p.x, p.z, p.y + 0.15);
      out.rows.push(
        `${(i * dt).toFixed(3)}s x=${p.x.toFixed(2)} z=${p.z.toFixed(3)} y=${p.y.toFixed(3)} ` +
          `v=${model.speed.toFixed(2)} vy=${model.vy.toFixed(2)} hd=${((model.heading * 180) / Math.PI).toFixed(1)}° ` +
          `${air ? "AIR " : "roll"} ${g.id}` +
          (air && !wasAir ? "  <<< RELEASED" : "") +
          (!air && wasAir ? "  <<< TOUCHDOWN" : ""),
      );
    }
  }
  const p = model.position;
  const g = probe(p.x, p.z, p.y + 0.15);
  out.end = { x: p.x, y: p.y, z: p.z, speed: model.speed, state: model.state, on: g.id };
  // Where the sixth report actually ends: not on the brick, and not bailed — up
  // on the LEVEL top behind the coping, riding it out to the corner. A run that
  // finishes north of the lip on a flat solid never came down at all.
  if (p.z > LIP_Z && g.flat) out.strandedOn = { id: g.id, x: p.x, y: p.y, z: p.z };
  return out;
}

// --- the four verdicts, one run at a time -------------------------------------

/** Did he leave the ground, and near-vertically? */
function upOf(r) {
  if (!r.launch) return null;
  return r.launch.deg;
}
/**
 * On the ramp FACE — a surface with a fall line — and rolled back down it.
 *
 * `overTop` is in here and `strandedOn` is not enough on its own: getting the
 * wheels onto the level top at all fails outcome 4, whether or not he later got
 * off it. See `overTop`.
 */
function downOk(r) {
  return !!r.land && !r.land.flat && !!r.rolledDown && !r.brick && !r.bail && !r.overTop;
}

/**
 * The verdict on one run, and the one judgement call in this file: **a carve that
 * never reaches the coping is not a defect.**
 *
 * 3.4 m of climb costs 10.75 m/s along the line you climb it on, and a rider
 * holding the stick over arrives at the toe 40–80° off square, where his line up
 * the face is half again as long and the fall line is pulling him off it the
 * whole way. He carves up, he carves back down, and that is what carving a bank
 * IS. What the player's four points are about is what happens when he DOES take
 * the ramp — so the gate is: reach the coping and you must fly; don't reach it
 * and you must come back down to the plaza clean. Getting stuck up there, on the
 * brick, or on the flat top fails either way round.
 */
function verdict(r) {
  const up = upOf(r);
  const f = flagsOf(r);
  if (up === null) {
    const carved =
      !r.reachedLip && !!r.backToPlaza && !r.brick && !r.bail && !r.overTop && !r.strandedOn;
    return { ok: carved, carved, flags: carved ? [] : f };
  }
  return { ok: up >= 70 && r.drift <= 0.5 && downOk(r), carved: false, flags: f };
}

/** Everything wrong with one run, in the player's own order. */
function flagsOf(r) {
  const f = [];
  const up = upOf(r);
  if (up === null) {
    if (r.reachedLip) f.push("REACHED THE COPING AND DID NOT FLY");
    else if (!r.backToPlaza)
      f.push(`NEVER CAME BACK DOWN (maxY ${r.maxY === -Infinity ? "never on it" : r.maxY.toFixed(2)})`);
    else f.push(`no launch (maxY ${r.maxY === -Infinity ? "never on it" : r.maxY.toFixed(2)})`);
  } else if (up < 70) f.push(`FLAT ${up.toFixed(0)}°`);
  if (r.launch && r.drift > 0.5) f.push(`DRIFT ${r.drift.toFixed(2)} m`);
  if (r.overLip && !r.overLip.launched) f.push(`ROLLED OVER at ${r.overLip.z.toFixed(2)}`);
  if (r.land && r.land.flat) f.push(`DOWN ON THE FLAT (${r.land.on})`);
  if (r.overTop)
    f.push(
      `OVER THE TOP — wheels on ${r.overTop.on} at z=${r.overTop.z.toFixed(2)}, ` +
        `slowest ${r.topMinSpeed.v.toFixed(2)} m/s (${(r.topMinSpeed.v * 3.6).toFixed(0)} km/h)` +
        (r.strandedOn ? " and STAYED there" : ""),
    );
  if (r.launch && !r.rolledDown && !r.overTop) f.push("NO RIDE DOWN");
  if (r.brick) f.push(`BRICK ${r.brick.into.toFixed(2)}`);
  if (r.bail) f.push(`BAIL at (${r.bail.x.toFixed(1)}, ${r.bail.z.toFixed(1)})`);
  return f;
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v, d = 2, n = 7) =>
  String(v === null || v === undefined || v === -Infinity ? "—" : v.toFixed(d)).padStart(n);

console.log(
  `\nTHE NORTH TRANSITION: toe z=${TOE_Z.toFixed(2)}, lip z=${LIP_Z.toFixed(2)} at y=${LIP_Y.toFixed(2)}, ` +
    // Footprint, not `arcRun` — that one takes a `{radius, height}` and the face
    // is becoming a flat inclined panel, where it would read NaN.
    `footprint ${(2 * TRANS.hz).toFixed(2)} m, brick at z=${SPOT_MAX_Z}`,
);
console.log(
  `the face is "${TRANS.id}", ${TRANS.profile.shape}, and its tangent 1 mm short of the coping is ` +
    `${LIP_DEG.toFixed(1)}°\n` +
    `behind the coping: ${BEHIND.slope.toFixed(2)} m of it still SLOPES, then ` +
    (BEHIND.flatAt === null
      ? `no level top at all — the shelf slopes to the brick`
      : `a LEVEL top ("${BEHIND.flatId}") from z=${BEHIND.flatAt.toFixed(2)} at y=${BEHIND.flatY.toFixed(2)}, ` +
        `${(SPOT_MAX_Z - BEHIND.flatAt).toFixed(2)} m of it to the brick`),
);
console.log(
  `a 180 needs ${T_180.toFixed(3)} s of hang at ${AIR_SPIN_RATE} rad/s, a 360 needs ${T_360.toFixed(3)} s; ` +
    `clean window ±${SPIN_SQUARE_DEG}°\n`,
);

// =============================================================================
// 1. THE HEADING SWEEP — the thing no previous round measured
// =============================================================================
const MODES = QUICK ? ["W", "hold"] : ["W", "coast", "hold", "tap"];
const SWEEP_SPEEDS = QUICK ? [10, 13, 16] : [10, 12, 14, 16, 18, 20];

for (const mode of MODES) {
  console.log(`=== heading sweep, keys = ${mode.toUpperCase()} ===`);
  console.log(
    `  ${pad("hdg", 6)}${pad("speed", 7)}${pad("fps", 6)}${pad("at lip", 8)}${pad("launch°", 9)}` +
      `${pad("apex", 7)}${pad("hang", 7)}${pad("drift", 7)}${pad("yaw", 7)}${pad("down on", 14)}` +
      `${pad("ride down", 10)}verdict`,
  );
  let bad = 0;
  let n = 0;
  let stranded = 0;
  let carved = 0;
  const worst = { up: Infinity, drift: 0, yaw: 0, hang: Infinity, straight: Infinity };
  for (const headingDeg of HEADINGS) {
    for (const speed of SWEEP_SPEEDS) {
      for (const fps of RATES) {
        const r = ride({ speed, fps, headingDeg, mode });
        n++;
        const up = upOf(r);
        const v = verdict(r);
        const ok = v.ok;
        if (!ok) bad++;
        if (v.carved) carved++;
        if (r.overTop) stranded++;
        if (up !== null) worst.up = Math.min(worst.up, up);
        if (r.launch) {
          worst.drift = Math.max(worst.drift, r.drift);
          worst.yaw = Math.max(worst.yaw, Math.abs(r.yaw));
          worst.hang = Math.min(worst.hang, r.hang);
          if (r.straightened !== null) worst.straight = Math.min(worst.straight, r.straightened);
        }
        if (!ok || !QUICK)
          console.log(
            `  ${pad(`${headingDeg}°`, 6)}${pad(speed, 7)}${pad(fps, 6)}${num(r.atLip, 2, 6)}  ` +
              `${num(up, 1, 7)}  ${num(r.apex, 2, 5)}  ${num(r.hang, 3, 5)}  ` +
              `${num(r.launch ? r.drift : null, 2, 5)}  ${num(r.launch ? r.yaw : null, 1, 5)}  ` +
              `${pad(r.land?.on ?? "—", 14)}${pad(r.rolledDown ? "yes" : "—", 10)}` +
              (v.carved ? "carved back down — never reached the coping" : v.flags.length ? v.flags.join(" · ") : "ok"),
          );
      }
    }
  }
  console.log(
    `  → ${n - bad}/${n} good (${carved} of them carved back down without air), ` +
      `${stranded} got the wheels onto the level top. ` +
      `worst launch ${worst.up === Infinity ? "—" : worst.up.toFixed(1)}°, ` +
      `worst drift ${worst.drift.toFixed(2)} m, worst unasked yaw ${worst.yaw.toFixed(1)}°, ` +
      `least hang ${worst.hang === Infinity ? "—" : worst.hang.toFixed(3)} s, ` +
      `least straightening ${worst.straight === Infinity ? "—" : worst.straight.toFixed(1)}°\n`,
  );
}

// =============================================================================
// 1b. THE CARVE — the stick HELD at the bank, which is how a player gets off
//     square in the first place. This is the dimension that reproduced report #6.
// =============================================================================
console.log(`=== the CARVE sweep: stick held from the run-up and all the way up the face ===`);
console.log(
  `  ${pad("keys", 7)}${pad("stick", 7)}${pad("speed", 7)}${pad("fps", 6)}${pad("lip hdg", 9)}` +
    `${pad("launch°", 9)}${pad("apex", 7)}${pad("hang", 7)}${pad("down on", 14)}` +
    `${pad("ride down", 10)}verdict`,
);
{
  let bad = 0;
  let n = 0;
  let stranded = 0;
  let carved = 0;
  let worstStrand = null;
  for (const mode of QUICK ? ["W"] : ["W", "hold"]) {
    for (const steerHeld of [-1, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1]) {
      for (const speed of QUICK ? [10, 13, 16] : [10, 12, 14, 16, 18, 20]) {
        for (const fps of RATES) {
          const r = ride({ speed, fps, headingDeg: 0, mode, steerHeld, seconds: 16 });
          n++;
          const up = upOf(r);
          const v = verdict(r);
          if (!v.ok) bad++;
          if (v.carved) carved++;
          if (r.overTop) {
            stranded++;
            if (!worstStrand || Math.abs(r.topMinSpeed.x) > Math.abs(worstStrand.x))
              worstStrand = { ...r.overTop, x: r.topMinSpeed.x, y: 0, speed, fps, steerHeld, v: r.topMinSpeed.v };
          }
          if (!v.ok || !QUICK)
            console.log(
              `  ${pad(mode, 7)}${pad(steerHeld, 7)}${pad(speed, 7)}${pad(fps, 6)}` +
                `${num(r.toeHeading === null ? null : (r.toeHeading * 180) / Math.PI, 0, 7)}  ` +
                `${num(up, 1, 7)}  ${num(r.apex, 2, 5)}  ${num(r.hang, 3, 5)}  ` +
                `${pad(r.land?.on ?? "—", 14)}${pad(r.rolledDown ? "yes" : "—", 10)}` +
                (v.carved
                  ? "carved back down — never reached the coping"
                  : v.flags.length
                    ? v.flags.join(" · ")
                    : "ok"),
            );
        }
      }
    }
  }
  console.log(
    `  → ${n - bad}/${n} good (${carved} carved back down without air). OVER THE TOP: ${stranded}` +
      (worstStrand
        ? ` — furthest (${worstStrand.x.toFixed(2)}, ${worstStrand.y.toFixed(2)}, ${worstStrand.z.toFixed(2)}) ` +
          `at ${worstStrand.v.toFixed(2)} m/s, from stick ${worstStrand.steerHeld} at ${worstStrand.speed} m/s ${worstStrand.fps}fps`
        : "") +
      "\n",
  );
}

// =============================================================================
// 2. THE SPEED BAND, 0.1 m/s at a time — where the launch stops happening
// =============================================================================
console.log(`=== the speed band, 0.1 m/s at a time, square on and 30° off, keys = W ===`);
console.log(
  `  ${pad("hdg", 6)}${pad("fps", 6)}${pad("band", 34)}${pad("worst", 10)}what happens there`,
);
for (const headingDeg of [0, 30]) {
  for (const fps of RATES) {
    let noLaunch = [];
    let flat = [];
    let rolled = [];
    let badDown = [];
    let n = 0;
    for (let speed = 8; speed <= 20.05; speed += 0.1) {
      const r = ride({ speed, fps, headingDeg, mode: "W", seconds: 14 });
      n++;
      const up = upOf(r);
      if (up === null) noLaunch.push(speed);
      else if (up < 70) flat.push(speed);
      if (r.overLip && !r.overLip.launched) rolled.push(speed);
      if (up !== null && !downOk(r)) badDown.push(speed);
    }
    const span = (a) =>
      a.length === 0 ? "—" : `${a.length} (${a[0].toFixed(1)}–${a[a.length - 1].toFixed(1)})`;
    console.log(
      `  ${pad(`${headingDeg}°`, 6)}${pad(fps, 6)}` +
        `${pad(`no launch ${span(noLaunch)}`, 34)}${pad(`of ${n}`, 10)}` +
        `flat ${span(flat)} · rolled over ${span(rolled)} · bad landing ${span(badDown)}`,
    );
  }
}
console.log("");

// =============================================================================
// 3. THE SPIN, FLOWN — a 180 and a 360 off this lip, not asserted from the apex
// =============================================================================
console.log(`=== the spin, actually flown off this lip (keys = W, stick held then centred) ===`);
console.log(
  `  ${pad("spin", 7)}${pad("hdg", 6)}${pad("speed", 7)}${pad("fps", 6)}${pad("hang", 7)}` +
    `${pad("needs", 7)}${pad("turned", 8)}${pad("down on", 14)}${pad("away at", 9)}verdict`,
);
{
  let bad = 0;
  let n = 0;
  for (const spin of [180, 360]) {
    for (const headingDeg of QUICK ? [0, 30] : [0, 20, 30, -30]) {
      for (const speed of QUICK ? [13] : [10, 13, 16, 19]) {
        for (const fps of RATES) {
          const r = ride({ speed, fps, headingDeg, mode: "W", spin, seconds: 16 });
          n++;
          const need = spin === 180 ? T_180 : T_360;
          const ok = !!r.launch && r.hang >= need && downOk(r);
          if (!ok) bad++;
          const turned = r.launch && r.land ? r.yaw + spin : null;
          if (!ok || !QUICK)
            console.log(
              `  ${pad(spin, 7)}${pad(`${headingDeg}°`, 6)}${pad(speed, 7)}${pad(fps, 6)}` +
                `${num(r.hang, 3, 5)}  ${num(need, 3, 5)}  ${num(turned, 0, 6)}  ` +
                `${pad(r.land?.on ?? "—", 14)}${num(r.land?.speed ?? null, 2, 7)}  ` +
                (!r.launch
                  ? "NO LAUNCH"
                  : r.hang < need
                    ? "NOT ENOUGH HANG"
                    : r.bail
                      ? `BAIL ${r.bail.trick}`
                      : r.brick
                        ? `BRICK ${r.brick.into.toFixed(2)}`
                        : !r.rolledDown
                          ? "NO RIDE DOWN"
                          : downOk(r)
                            ? "ok"
                            : `DOWN ON ${r.land?.on}`),
            );
        }
      }
    }
  }
  console.log(`  → ${n - bad}/${n} spins completed and rode away\n`);
}

// =============================================================================
// 4. HOW MUCH SHELF THE ARC ACTUALLY NEEDS — with and without the pop
// =============================================================================
//
// This is the one number this lane cannot fix and the geometry lane cannot guess.
// `back-ramp.mjs` measures the furthest a COASTED/THROTTLED arc comes down and
// `BACK_RETURN` was sized off it (1.25 m). Nobody measured the arc with a POP in
// it, and a pop is not a small correction here: `takeOff` adds the legs' 1.57 m
// as ENERGY on top of what the lip already gave, so the hang time grows by half
// again and the range grows with it — while the horizontal is barely touched.
console.log(`=== how far past the lip the arc comes down, and what it needs behind the coping ===`);
console.log(`  ${pad("keys", 8)}${pad("furthest", 10)}${pad("past lip", 10)}${pad("on", 14)}from`);
for (const mode of ["W", "hold", "tap"]) {
  let worst = null;
  for (const headingDeg of QUICK ? [0] : [0, 20, 40, -40]) {
    for (const fps of RATES) {
      for (let speed = 8; speed <= 20.05; speed += QUICK ? 1 : 0.25) {
        const r = ride({ speed, fps, headingDeg, mode, seconds: 10 });
        if (r.land && (!worst || r.land.z > worst.z))
          worst = { ...r.land, speed, fps, headingDeg, apex: r.apex };
      }
    }
  }
  console.log(
    `  ${pad(mode, 8)}${num(worst?.z ?? null, 2, 8)}  ${num(worst ? worst.z - LIP_Z : null, 2, 8)}  ` +
      `${pad(worst?.on ?? "—", 14)}` +
      (worst
        ? `${worst.speed.toFixed(2)} m/s at ${worst.fps}fps, ${worst.headingDeg}° off square, apex ${worst.apex.toFixed(2)} m`
        : "—"),
  );
}
console.log(
  `  the shelf is ${(SPOT_MAX_Z - LIP_Z).toFixed(2)} m and only the first ` +
    `${BEHIND.slope.toFixed(2)} m of it slopes` +
    (BEHIND.flatAt === null
      ? ` — no level top, so anything that comes down behind the coping can roll back off it.\n`
      : `; past that is a level top, and a board that comes down on a level top ` +
        `${(SPOT_MAX_Z - BEHIND.flatAt).toFixed(2)} m from the brick has nowhere to go.\n`),
);

// =============================================================================
// 5. NOTHING ELSE MOVED — the two rides this lane is forbidden to touch
// =============================================================================
//
// The fall-line term is `sin φ` × `sin θ`, so it is identically zero on the flat
// and identically zero along a fall line. That is an argument; these are the
// numbers. Both are printed rather than asserted, because "unchanged to the last
// decimal" is a claim a reader should be able to check against `takeOff`'s note
// without running anything.
console.log(`=== nothing else moved ===`);
{
  // The flat-ground ollie. `OLLIE_POP` is 7.3 m/s and `takeOff`'s note pins the
  // apex at 1.57 m; on flat ground work and velocity are the same number, so this
  // is that number and it may not move.
  for (const fps of RATES) {
    const dt = 1 / fps;
    const model = new SkateModel({}, STREET_SPOT);
    const keys = makeKeys();
    model.position.set(0, STREET_SPOT.height(0, 0), 0);
    model.heading = 0;
    model.speed = 0;
    let apex = -Infinity;
    let vy0 = 0;
    for (let i = 0; i < Math.ceil(3 / dt); i++) {
      // Space down for three frames, then up: the pop fires on the RELEASE.
      const input = consume(keys, { w: false, space: i < 3 });
      model.update(input, dt);
      if (model.state === "air" && vy0 === 0) vy0 = model.vy;
      apex = Math.max(apex, model.position.y);
    }
    console.log(
      // `vy` read one frame in, so it is `OLLIE_POP` minus that frame's gravity —
      // the number to check against `takeOff`'s note is the APEX.
      `  flat-ground ollie at ${String(fps).padStart(3)}fps: vy one frame in ${vy0.toFixed(4)} m/s, ` +
        `apex ${apex.toFixed(4)} m`,
    );
  }
  // …and the quarter pipe, taken square, which is the ride this lane must not
  // change and the one the fall-line term is exactly zero on.
  const QP = SOLIDS.find((s) => s.id === "qp");
  if (QP) {
    for (const speed of [10, 14]) {
      for (const fps of RATES) {
        const dt = 1 / fps;
        const model = new SkateModel({}, STREET_SPOT);
        const zToe = QP.cz - QP.hz;
        const dir = Math.sign(QP.cz) || 1;
        const z0 = zToe - dir * 8;
        model.position.set(QP.cx, STREET_SPOT.height(QP.cx, z0), z0);
        model.heading = dir > 0 ? 0 : Math.PI;
        model.speed = speed;
        let apex = -Infinity;
        let deg = null;
        for (let i = 0; i < Math.ceil(6 / dt); i++) {
          model.update({ ...EMPTY_INPUT }, dt);
          if (model.state === "air") {
            if (deg === null)
              deg = (Math.atan2(model.vy, Math.hypot(model.velX, model.velZ)) * 180) / Math.PI;
            apex = Math.max(apex, model.position.y);
          }
        }
        console.log(
          `  ${QP.id} square on, ${speed} m/s at ${String(fps).padStart(3)}fps: ` +
            `exit ${deg === null ? "no air" : deg.toFixed(4) + "°"}, apex ${apex === -Infinity ? "—" : apex.toFixed(4) + " m"}`,
        );
      }
    }
  }
  console.log("");
}

const TRACE = process.argv.find((a) => a.startsWith("--trace="))?.slice(8) ?? null;
if (TRACE) {
  const [sp, fp, hd, md, stk] = TRACE.split("@");
  console.log(`=== frame trace: ${sp} m/s at ${fp} fps, ${hd}° off square, keys = ${md ?? "W"} ===`);
  const r = ride({
    speed: Number(sp),
    fps: Number(fp),
    headingDeg: Number(hd),
    mode: md ?? "W",
    steerHeld: stk === undefined ? 0 : Number(stk),
    seconds: 12,
    log: true,
  });
  for (const row of r.rows) console.log(`  ${row}`);
  console.log(
    `  launch ${r.launch ? `${r.launch.deg.toFixed(1)}° at ${r.launch.v.toFixed(2)} m/s` : "NONE"} · ` +
      `apex ${r.apex.toFixed(2)} · hang ${r.hang.toFixed(3)} s · drift ${r.drift.toFixed(3)} m · ` +
      `down on ${r.land?.on ?? "—"} at ${r.land?.speed?.toFixed(2) ?? "—"} m/s · ` +
      `rode down ${r.rolledDown ? "yes" : "NO"}\n`,
  );
}
