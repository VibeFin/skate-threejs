// Where does the board actually GO at the north transition?
// — `node --experimental-strip-types tools/back-ramp.mjs [--verbose]`
//
// WHY THIS FILE EXISTS, and it is not "collide-sweep did not cover it".
// `tools/collide-sweep.mjs` has two green checks over this exact ramp — "the
// line the level teaches comes off the far wall" and "the back ramp throws the
// board UP and the arc lands back on it" — and the player has now reported the
// same ramp for the FOURTH time, in words that contradict both of them: *"at the
// end of the ramp he continues forward, leaning forward, instead of … launches
// upward and then falls back down."*
//
// Both of those checks stop measuring at the landing. The first one asks where
// the run is after 12 s and whether it is moving; the second one coasts at the
// ramp with NOTHING pressed and stops the clock 6 s in. Neither of them watches
// the seconds AFTER the arc comes down, and neither of them holds the throttle
// through the landing — which is the one thing the level teaches and the one
// thing the player does.
//
// So this harness rides the taught line and then keeps watching, and it prints
// the trajectory rather than a verdict: per frame, where he is, whether the
// wheels are down, WHICH SOLID and which part of its profile the ground probe
// resolved, and where the release fired. A table you can read is the only thing
// that settles a disagreement between a green check and the player.
//
// The three columns that decide it:
//
//   LAUNCH   — did the lip release him, on what angle, to what apex.
//   RETURN    — where he came down and on what, and whether he then rolled back
//              DOWN the transition (the design's claim) or carried on up the
//              apron toward the brick (the player's report).
//   BRICK    — every wall event at the north face, with the speed charged.
//
// Everything is read off the ramp's own declared solids. Nothing about the
// geometry is typed in here.
//
// WHAT IT FOUND, so the next reader does not have to re-derive it. The release
// was never the problem — it fires, on the transition's own tangent, a hair
// short of the lip, and the air is real (32–183 frames of it). The disease was
// on the far side of the LANDING, and it is two of the ride's own constants
// meeting the apron's grade:
//
//   · a near-vertical lip leaves almost nothing horizontal, so the arc comes
//     down steeply, and the wheels keep `(vh + vy·g)/hypot(1, g)` of it. On the
//     11.3° apron that was 0.127 of the lip speed — under `LANDING_SCRUB`
//     (0.9 m/s) for anything arriving below 7.1 m/s at the lip. **Touchdown at
//     0.00 m/s.**
//   · and 0.00 is under `PUSH_ROLL_MIN` (0.05), so the push stopped following
//     `sign(speed)` and followed `rideSign` — the way he is FACING, which is the
//     brick. 5.4 m/s² of kick against 3.33 m/s² of gravity on an 11.3° slope is
//     a ratchet, and it walked him the whole 3.4 m shelf: 0.19 → 2.53 m/s,
//     decay, kick again, 4.24, until the brick stopped him.
//
// 48 of 363 approaches between 8 and 20 m/s ended on the bricks that way. The
// arithmetic that condemns it was already in `spot.ts` — `BACK_LIP_ANGLE`'s own
// note works out that only above 18.5° does gravity beat a held push — and it
// had never been applied to the strip behind the lip.
//
// ROUND SIX, and this file's own blind spot. The player reported the same ramp
// again. **Every approach in this file is SQUARE ON** — `ride()` sets
// `model.heading = 0` and never touches the stick — and 18.5° is a bar that only
// holds square: the grade the ride actually reads is `slopeAlong`, a gradient
// dotted with the direction of TRAVEL, so `atan(tan 24.2° · cos φ)` drops under
// 18.5° at φ > 41.9°. Carve at the bank instead of aiming at it and he arrives at
// the coping 62–87° off square, lands on the return, and the held push walks him
// ACROSS it — over the crest, out along the level deck, into the corner at
// (±38.0, 4.21, 48.0) at 0.00 m/s. 32 of 432 carved approaches, and none of them
// reachable from this file because none of them is square.
//
// The measurement lives in `tools/back-air.mjs`: heading and stick as swept
// dimensions, the key state machine (`pushLocked` — W and Space held together is
// not throttle-plus-charge), and the spin flown rather than inferred. The fix is
// `SkateModel.fallLine` — the cross-track half of gravity, which nothing had ever
// charged. This file's square-on numbers are unchanged by it, to the decimal,
// because the term is zero when φ is.

import { register } from "node:module";

register(new URL("./ts-resolve.mjs", import.meta.url));
const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { STREET_SPOT, SOLIDS, SPOT_MAX_Z, topOf, arcRun } = await import("../src/world/spot.ts");

const VERBOSE = process.argv.includes("--verbose");
const RATES = [30, 60, 144];
const SPEEDS = [10, 12, 14, 16, 18, 20];

// --- the ramp, off its own solids --------------------------------------------

const TRANS = SOLIDS.find((s) => s.id === "back-trans");
// The strip immediately behind the coping, by POSITION and not by id — this is
// the piece of the ramp that has been re-cut in every round of it, and it has
// been called `back-apron` and `back-return` already. As of round eight there is
// no sloped strip at all: the deck starts at the coping, and the report below
// says "level from the coping" instead of crashing on a name that has gone.
// Read `BACK_DECK_Y` in `src/world/spot.ts` for why that is the shape now.
const RET =
  SOLIDS.find((s) => s.id === "back-return") ??
  SOLIDS.find((s) => s.id === "back-apron") ??
  null;
const DECK = SOLIDS.find((s) => s.id === "back-deck");
const TOE_Z = TRANS.cz - TRANS.hz;
const LIP_Z = TRANS.cz + TRANS.hz;
const LIP_Y = topOf(TRANS, 0, LIP_Z - 1e-6);
const SHELF = SPOT_MAX_Z - LIP_Z;

/**
 * Which solid the ride's own ground probe lands on, and where in its profile —
 * `resolve()` replicated in the harness rather than reached into. Same two rules
 * it runs: the highest top wins, a FLAT top above the hint is skipped, and the
 * tie goes to whichever was declared last.
 */
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
  if (!best) return { id: "—", t: 0, y: -Infinity };
  const c = Math.cos(best.yaw);
  const sn = Math.sin(best.yaw);
  const v = sn * (x - best.cx) + c * (z - best.cz);
  return { id: best.id, t: Math.min(1, Math.max(0, (v + best.hz) / (2 * best.hz))), y: bestY };
}

/** The tangent angle of the surface under a point, degrees up-along +z. */
function surfaceDeg(x, z, y) {
  return (Math.atan(STREET_SPOT.slopeAlong(x, z, 0, 1, y + 0.15)) * 180) / Math.PI;
}

// --- one approach, watched all the way through -------------------------------

/**
 * Ride at the ramp and keep watching after the landing.
 *
 * `from` is a z to start at, `speed` the speed to start with, `throttle` whether
 * W is held (the taught line holds it; `collide-sweep`'s ramp check does not,
 * which is the difference this file exists to measure). `spawn` rides the real
 * drop-in instead, which is the player's actual lap.
 */
function ride({ speed, fps, throttle = true, seconds = 14, fromSpawn = false, log = false }) {
  const dt = 1 / fps;
  const model = new SkateModel({}, STREET_SPOT);
  if (fromSpawn) {
    const s = STREET_SPOT.spawn();
    model.position.set(s.x, STREET_SPOT.height(s.x, s.z), s.z);
    model.heading = s.heading;
  } else {
    const z0 = TOE_Z - 7;
    model.position.set(0, STREET_SPOT.height(0, z0), z0);
    model.heading = 0;
    model.speed = speed;
  }

  const out = {
    bailed: false,
    bail: null,
    wasAir: false,
    wasVy: 0,
    wasSpeed: 0,
    brick: null,
    toe: null,
    atLip: null,
    overLip: null,
    overLipMax: null,
    launch: null,
    apex: -Infinity,
    land: null,
    /** Furthest north the board ever got, wheels down or not. */
    maxZ: -Infinity,
    /** Furthest north with the WHEELS DOWN — the player's "continues forward". */
    maxGroundZ: -Infinity,
    after: null,
    rows: [],
    lipFrames: [],
    end: null,
  };
  // WHERE the bail happened, not just that it did — the whole of what the two
  // existing checks could not see. `onBail` fires from inside `update`, so the
  // position it reads is the one the bail was taken at.
  model.events.onBail = (trick) => {
    // Only bails AT THE RAMP. 14 s of held throttle carries the run all the way
    // back down the plaza and into the south end, and that is this harness's own
    // stride, not the ramp's.
    if (model.position.z < TOE_Z - 8) return;
    out.bailed = true;
    if (!out.bail) {
      const p = model.position;
      out.bail = {
        z: p.z,
        y: p.y,
        x: p.x,
        trick: trick ?? "—",
        offSquare: model.spin?.offSquare?.() ?? null,
        wasAir: out.wasAir,
        vy: out.wasVy,
        speed: out.wasSpeed,
      };
    }
  };
  model.events.onWallHit = (into) => {
    const p = model.position;
    if (p.z < SPOT_MAX_Z - 4) return;
    if (!out.brick || into > out.brick.into)
      out.brick = { into, y: p.y, z: p.z, x: p.x, after: !!out.land };
  };

  const frames = Math.ceil(seconds / dt);
  for (let i = 0; i < frames; i++) {
    const was = Math.abs(model.speed);
    const wasAir = model.state === "air";
    out.wasAir = wasAir;
    out.wasVy = model.vy;
    out.wasSpeed = model.speed;
    model.update({ ...EMPTY_INPUT, throttle }, dt);
    const p = model.position;
    const air = model.state === "air";
    if (out.toe === null && p.z >= TOE_Z) out.toe = was;
    // …and only the air off THIS ramp. The taught line crosses the quarter pipe
    // first and launches off ITS coping, so a bare "first air" reads the wrong
    // obstacle — which is how the taught-line row below first printed a 64°
    // exit off a ramp whose lip is 86°.
    if (!out.launch && air && p.z >= TOE_Z) {
      const vh = Math.hypot(model.velX, model.velZ);
      out.launch = {
        z: p.z,
        y: p.y,
        deg: (Math.atan2(model.vy, vh) * 180) / Math.PI,
        v: Math.hypot(vh, model.vy),
        t: i * dt,
      };
    }
    if (out.launch && p.y > out.apex) out.apex = p.y;
    if (out.launch && !out.land && !air) {
      const g = probe(p.x, p.z, p.y + 0.15);
      out.land = { z: p.z, y: p.y, speed: model.speed, on: g.id, t: g.t, at: i * dt };
    }
    if (p.z > out.maxZ) out.maxZ = p.z;
    if (!air && p.z > out.maxGroundZ) out.maxGroundZ = p.z;
    // THE ONE THING NEITHER EXISTING CHECK ASKS: was he ever on his WHEELS past
    // the lip? That is the player's whole report — "at the end of the ramp he
    // continues forward" — and it is a different sentence from "the launch flew
    // too far", which is what the geometry was last tuned against.
    if (!air && p.z > LIP_Z + 0.02) {
      out.overLip = out.overLip ?? { z: p.z, y: p.y, speed: model.speed, at: i * dt, launched: !!out.launch };
      out.overLipMax = Math.max(out.overLipMax ?? -Infinity, p.z);
    }
    // …and the speed he arrives at the lip with, which is what decides it:
    // `lipDecision` refuses to release anything under `LAUNCH_MIN_SPEED`.
    if (out.atLip === null && p.z >= LIP_Z - 0.05 && !air) out.atLip = Math.abs(model.speed);
    // What the seconds AFTER the landing do — the half neither existing check
    // watches. Sampled at the moment he is furthest north on his wheels.
    if (out.land && !air && p.z >= out.maxGroundZ - 1e-9) {
      const g = probe(p.x, p.z, p.y + 0.15);
      out.after = {
        z: p.z,
        y: p.y,
        speed: model.speed,
        on: g.id,
        deg: surfaceDeg(p.x, p.z, p.y),
        gap: SPOT_MAX_Z - p.z,
      };
    }
    // The two or three frames either side of the lip, which is the whole of
    // "does the release fire at all": a board GROUNDED across `BACK_LIP_Z` was
    // never released, and one that goes AIR at the lip and rolls again within a
    // frame was released and immediately re-caught. Different diseases.
    if (Math.abs(p.z - LIP_Z) <= 0.35 && p.z > TOE_Z) {
      out.lipFrames.push(
        `z=${p.z.toFixed(3)} y=${p.y.toFixed(3)} v=${model.speed.toFixed(2)} ` +
          `${air ? "AIR" : "roll"}`,
      );
    }
    if (log && p.z > TOE_Z - 1) {
      const g = probe(p.x, p.z, p.y + 0.15);
      out.rows.push(
        `${(i * dt).toFixed(3)}s z=${p.z.toFixed(3)} y=${p.y.toFixed(3)} ` +
          `v=${model.speed.toFixed(2)} vy=${model.vy.toFixed(2)} ` +
          `${air ? "AIR " : "roll"} ${g.id}@t=${g.t.toFixed(3)} ` +
          `surf=${air ? "—" : surfaceDeg(p.x, p.z, p.y).toFixed(1) + "°"}` +
          (air && !wasAir ? "  <<< RELEASED" : "") +
          (!air && wasAir ? "  <<< TOUCHDOWN" : ""),
      );
    }
  }
  const p = model.position;
  out.end = { x: p.x, y: p.y, z: p.z, speed: model.speed, state: model.state };
  return out;
}

// --- report -------------------------------------------------------------------

const pad = (s, n) => String(s).padEnd(n);
const num = (v, d = 2, n = 7) => String(v === null || v === -Infinity ? "—" : v.toFixed(d)).padStart(n);

console.log(
  `\nTHE NORTH TRANSITION, off its own solids: toe z=${TOE_Z.toFixed(2)}, lip z=${LIP_Z.toFixed(2)} ` +
    `at y=${LIP_Y.toFixed(2)}, arc run ${arcRun(TRANS.profile).toFixed(2)} m, ` +
    `shelf ${SHELF.toFixed(2)} m to the brick at z=${SPOT_MAX_Z}`,
);
const retDeg = RET ? (Math.atan((RET.profile.y1 - RET.profile.y0) / (2 * RET.hz)) * 180) / Math.PI : 0;
console.log(
  `behind the coping — ` +
    (RET
      ? `"${RET.id}": ${RET.profile.shape} y0=${RET.profile.y0.toFixed(2)} → ` +
        `y1=${RET.profile.y1.toFixed(2)} over ${(2 * RET.hz).toFixed(2)} m = ${retDeg.toFixed(1)}°` +
        ` (gravity along it ${(17 * Math.sin((retDeg * Math.PI) / 180)).toFixed(2)} m/s²` +
        ` against a held push's 5.4)`
      : `NOTHING SLOPED — the top is LEVEL from the coping, so gravity behind it is ` +
        `0.00 m/s² against a held push's 5.4 and no landing up here is handed back`) +
    (DECK ? `, then "${DECK.id}": FLAT at y=${DECK.profile.y.toFixed(2)} over ${(2 * DECK.hz).toFixed(2)} m` : ", and no flat deck") +
    `\n`,
);

for (const throttle of [true, false]) {
  console.log(
    `=== approach sweep, throttle ${throttle ? "HELD (the taught line)" : "COASTING"} ` +
      `— 7 m out, square on ===`,
  );
  console.log(
    `  ${pad("case", 14)}${pad("toe v", 8)}${pad("exit°", 8)}${pad("apex", 8)}` +
      `${pad("down at z", 11)}${pad("on", 14)}${pad("max ground z", 14)}${pad("ends on", 14)}` +
      `${pad("brick", 18)}`,
  );
  for (const speed of SPEEDS) {
    for (const fps of RATES) {
      const r = ride({ speed, fps, throttle });
      const g = probe(r.end.x, r.end.z, r.end.y + 0.15);
      console.log(
        `  ${pad(`${speed} m/s ${fps}fps`, 14)}${num(r.toe, 1, 6)}  ` +
          `${num(r.launch?.deg ?? null, 1, 6)}  ${num(r.apex, 2, 6)}  ` +
          `${num(r.land?.z ?? null, 2, 9)}  ${pad(r.land?.on ?? "—", 14)}` +
          `${num(r.maxGroundZ, 2, 12)}  ${pad(g.id, 14)}` +
          `${pad(r.brick ? `${r.brick.into.toFixed(2)} m/s y=${r.brick.y.toFixed(1)}` : "none", 18)}` +
          (r.bail
            ? ` BAILED at z=${r.bail.z.toFixed(2)} y=${r.bail.y.toFixed(2)} ` +
              `${r.bail.wasAir ? "in AIR" : "rolling"} vy=${r.bail.vy.toFixed(1)} ` +
              `offSquare=${r.bail.offSquare === null ? "?" : r.bail.offSquare.toFixed(0) + "°"}`
            : ""),
      );
    }
  }
  console.log("");
}

// --- the band where the board only JUST clears the lip ------------------------
//
// The coarse sweep above walks 2 m/s at a time and the one row that rode into
// the brick sits between two rows that did not, which is the shape of a BAND
// rather than of a speed. `lipDecision` will not release anything arriving under
// `LAUNCH_MIN_SPEED` (1.5 m/s) — and a board that is not released at a lip rolls
// over it, on its wheels, onto whatever is behind. So this walks the approach a
// tenth of a metre per second at a time through 2gH and prints the two numbers
// that decide each run: the speed he reaches the lip with, and whether the
// wheels were ever down north of it.
console.log(`=== the lip-arrival band, 0.1 m/s at a time, throttle HELD ===`);
console.log(
  `  ${pad("case", 15)}${pad("toe v", 8)}${pad("at lip", 9)}${pad("released", 10)}` +
    `${pad("wheels-down past lip", 22)}${pad("max ground z", 14)}brick`,
);
{
  let band = 0;
  let worst = null;
  for (const fps of RATES) {
    for (let speed = 4; speed <= 13.05; speed += 0.1) {
      const r = ride({ speed, fps, throttle: true, seconds: 10 });
      const rolledOver = r.overLip && !r.overLip.launched;
      if (!rolledOver && !r.brick) continue;
      band++;
      if (!worst || r.maxGroundZ > worst.z) worst = { z: r.maxGroundZ, speed, fps };
      console.log(
        `  ${pad(`${speed.toFixed(1)} ${fps}fps`, 15)}${num(r.toe, 1, 6)}  ` +
          `${num(r.atLip, 2, 7)}  ${pad(r.launch ? `${r.launch.deg.toFixed(1)}°` : "NO", 10)}` +
          `${pad(rolledOver ? `YES at ${r.overLip.z.toFixed(2)}, ${r.overLip.speed.toFixed(2)} m/s` : "no", 22)}` +
          `${num(r.maxGroundZ, 2, 12)}  ` +
          (r.brick ? `${r.brick.into.toFixed(2)} m/s at y=${r.brick.y.toFixed(2)}` : "none"),
      );
    }
  }
  console.log(
    `  → ${band} approaches in the band rolled over the lip on their wheels instead of being ` +
      `released; furthest north ${worst ? `z=${worst.z.toFixed(2)} (${worst.speed.toFixed(1)} m/s, ${worst.fps}fps)` : "—"}\n`,
  );
}

// --- how far past the lip the arc can COME DOWN, which sizes the return -------
//
// `BACK_RETURN` has to be at least this or the fast end of the band lands on the
// flat deck behind it — and a flat deck is the version of this that parks at
// 0.00 m/s and pushes into the brick. Swept at 0.1 m/s because the worst landing
// is not at the top of the range: the release point walks with the frame stride,
// so 17.2 m/s at 30 fps outruns 20 m/s at 144.
{
  let worst = null;
  for (const fps of RATES) {
    for (let speed = 8; speed <= 20.05; speed += 0.1) {
      const r = ride({ speed, fps, throttle: true, seconds: 8 });
      if (r.land && (!worst || r.land.z > worst.z))
        worst = { z: r.land.z, speed, fps, on: r.land.on, v: r.land.speed };
    }
  }
  console.log(
    `=== furthest the arc comes down, 8 → 20 m/s in 0.1 steps, 30/60/144 fps ===\n` +
      `  z=${worst.z.toFixed(2)} (${worst.speed.toFixed(1)} m/s at ${worst.fps}fps) on ${worst.on} ` +
      `at ${worst.v.toFixed(2)} m/s — the lip is at ${LIP_Z.toFixed(2)}, so the arc needs ` +
      `${(worst.z - LIP_Z).toFixed(2)} m of return behind it\n`,
  );
}

const TRACE = process.argv.find((a) => a.startsWith("--trace="))?.slice(8) ?? null;
if (TRACE) {
  const [sp, fp] = TRACE.split("@");
  console.log(`=== frame trace: ${sp} m/s at ${fp} fps, throttle held ===`);
  const r = ride({ speed: Number(sp), fps: Number(fp), throttle: true, seconds: 8, log: true });
  for (const row of r.rows) console.log(`  ${row}`);
  console.log("");
}

console.log(`=== the taught line: drop in at spawn, hold W, nothing else, 20 s ===`);
for (const fps of RATES) {
  const r = ride({ speed: 0, fps, throttle: true, seconds: 20, fromSpawn: true, log: VERBOSE });
  const g = probe(r.end.x, r.end.z, r.end.y + 0.15);
  console.log(
    `  ${fps}fps  toe ${num(r.toe, 1, 5)} → exit ${num(r.launch?.deg ?? null, 1, 5)}°, ` +
      `apex ${num(r.apex, 2, 5)} m, down at z=${num(r.land?.z ?? null, 2, 6)} on ` +
      `${pad(r.land?.on ?? "—", 12)}`,
  );
  console.log(
    `         furthest north on his WHEELS: z=${num(r.maxGroundZ, 2, 6)} ` +
      `(${r.after ? `${r.after.gap.toFixed(2)} m off the brick, on ${r.after.on} at ${r.after.deg.toFixed(1)}°, ${r.after.speed.toFixed(2)} m/s` : "—"})`,
  );
  console.log(
    `         ends (${r.end.x.toFixed(1)}, ${r.end.y.toFixed(2)}, ${r.end.z.toFixed(1)}) at ` +
      `${r.end.speed.toFixed(2)} m/s on ${g.id}, ${r.end.state}` +
      (r.bailed ? ", BAILED" : "") +
      (r.brick ? ` · BRICK ${r.brick.into.toFixed(2)} m/s at y=${r.brick.y.toFixed(2)}${r.brick.after ? " (AFTER the landing)" : ""}` : " · no wall event"),
  );
  // GROUNDED THROUGH THE LIP, or RELEASED AT IT? Different diseases and
  // different fixes, so the answer is printed rather than inferred: the last
  // frame with the wheels down before the first airborne one, and how far past
  // the lip that was.
  const airAt = r.lipFrames.findIndex((f) => f.includes("AIR"));
  const rollBack = r.lipFrames.slice(airAt + 1).find((f) => f.includes("roll"));
  console.log(
    `         across the lip (z=${LIP_Z.toFixed(2)}): ` +
      (airAt < 0
        ? `GROUNDED the whole way through — never released`
        : `last grounded ${r.lipFrames[airAt - 1] ?? "—"} → ${r.lipFrames[airAt]}` +
          ` (released ${(LIP_Z - Number(/z=([\d.]+)/.exec(r.lipFrames[airAt])[1])).toFixed(3)} m short of the lip)` +
          `, ${r.lipFrames.length - airAt - (rollBack ? 1 : 0)} airborne frames, back down on ${rollBack ?? "—"}`),
  );
  if (VERBOSE) for (const row of r.rows) console.log(`           ${row}`);
}

// --- and the piece of the picture the player is looking AT ---------------------
//
// "the top panel isn't flat" is a claim about the profile, so print the profile.
// Walked north from a metre before the toe to the brick, which is the silhouette
// a skater on the plaza sees against the shopfronts.
console.log(`\n=== the profile a player sees, walked north at x = 0 ===`);
console.log(`  ${pad("z", 8)}${pad("y", 8)}${pad("solid", 14)}slope along +z`);
for (let z = TOE_Z - 1; z <= SPOT_MAX_Z + 1e-9; z += 0.25) {
  const g = probe(0, z, 40);
  console.log(
    `  ${pad(z.toFixed(2), 8)}${pad(g.y.toFixed(3), 8)}${pad(g.id, 14)}` +
      `${surfaceDeg(0, z, g.y).toFixed(1)}°`,
  );
}
