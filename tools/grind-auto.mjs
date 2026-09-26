// Does the rail take him when he asked, and leave him alone when he did not?
// — `node --experimental-strip-types tools/grind-auto.mjs`
//
// WHY THIS FILE EXISTS. The grind used to need a key held down (`slideHeld`,
// E), and that key was not a convenience — it was a FIX. Before it, catches
// were offered on geometry alone and the board locked onto things it had no
// business touching: **237 of 576 straight twelve-second rolls ended on a
// line**, most of them kerbs. The player has now asked for the opposite —
// *"rail sliding activates when I simply ride onto it, without holding a
// button"* — so the key's protective work has to be done by geometry and
// state instead, and "instead" is a claim only a measurement can make.
//
// So this harness measures the two halves of the same change at once, and both
// numbers have to be reported or neither means anything:
//
//   FALSE  — approaches nobody would call a grind. Rolling past a kerb, rolling
//            across one, ollieing beside a line, ollieing OVER one to clear it.
//            Every catch here is a defect.
//   WANTED — riding onto a line along its length, at a spread of speeds, angles
//            and frame rates, and the square-across entry that is a boardslide.
//            Every miss here is a defect.
//
// A change that empties the first column by also emptying the second is not a
// fix, it is a rail that stopped working. Both columns print every run.
//
// TWO COLUMNS PER SECTION, and that is the before/after built into the tool:
// every sample is ridden twice, once with the slide key UP and once with it
// HELD. While the key gates every catch, the `key up` column is the shipped
// game (nothing catches, ever — which is the player's complaint) and the
// `key held` column is the raw geometry that automatic entry inherits, i.e. the
// real baseline for this work. Once entry is automatic the `key up` column IS
// the game, and whatever the key still buys shows up as the difference between
// the two.
//
// A WANTED CELL IS A LEAD SWEEP, not one approach, and that is the difference
// between measuring the game and measuring my own aim. Where in a 1.57 m / 0.86 s
// ollie the line passes underneath decides everything — the vertical window is
// 0.41 m deep on a ledge — and every line in the spot stands at a different
// height over whatever you run up to it on. So a cell asks "is this line
// reachable along its length at this speed and angle", sweeping the run-up, and
// also prints how GENEROUS the window was: one lead in six working is a
// reachable line nobody can ride.
//
// THE INPUT IS THE MODEL'S, not a keyboard's, and deliberately: every case here
// is a question about the ride's own geometry (does this line take this board),
// there is no player-input rule in the question, and the model's own
// `EMPTY_INPUT` is the honest "nothing pressed". The keyboard path
// (`tools/integration-check.mjs` `pframe`) is where key-layout questions live.

import { register } from "node:module";
import * as THREE from "three";

register(new URL("./ts-resolve.mjs", import.meta.url));
const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { STREET_SPOT } = await import("../src/world/spot.ts");

const STEP = 1 / 60;
const RAILS = STREET_SPOT.rails();
const VERBOSE = process.argv.includes("--verbose");
const ONLY = process.argv.find((a) => a.startsWith("--line="))?.slice(7) ?? null;
const LINES = ONLY ? RAILS.filter((r) => r.id === ONLY) : RAILS;

// --- the geometry of a line, in the two forms every case below wants ---------

const axisOf = (l) => Math.atan2(l.b.x - l.a.x, l.b.z - l.a.z);
/** Ground-plane unit normal — which way "beside the line" is. */
function normalOf(l) {
  const ex = l.b.x - l.a.x;
  const ez = l.b.z - l.a.z;
  const len = Math.hypot(ex, ez);
  return { nx: ez / len, nz: -ex / len };
}
const pointAt = (l, t) => ({
  x: l.a.x + (l.b.x - l.a.x) * t,
  y: l.a.y + (l.b.y - l.a.y) * t,
  z: l.a.z + (l.b.z - l.a.z) * t,
});

/** Flat distance from a point to a line's segment. */
function flatTo(l, x, z) {
  const ex = l.b.x - l.a.x;
  const ez = l.b.z - l.a.z;
  const len2 = ex * ex + ez * ez;
  const t = Math.max(0, Math.min(1, ((x - l.a.x) * ex + (z - l.a.z) * ez) / len2));
  return Math.hypot(x - (l.a.x + ex * t), z - (l.a.z + ez * t));
}

/**
 * Widest corridor any line in the spot reaches out with — a handrail is
 * `radius + reach` = 0.64 m, a ledge 0.52, a kerb 0.36. Used only to keep a
 * "beside line A" sample from silently being an "on line B" sample: the spot
 * builds `ledge-long-e` and `-w` two metres apart and `kerb-*` runs face each
 * other across the road, so a lateral offset big enough to leave one corridor
 * can land inside another's, and the catch that follows is the harness's fault
 * and not the game's.
 */
const CORRIDOR = 0.7;
function nearOther(x, z, exceptId, pad = 0.25) {
  for (const l of RAILS) {
    if (l.id === exceptId) continue;
    if (flatTo(l, x, z) < CORRIDOR + pad) return l.id;
  }
  return null;
}

/**
 * One approach, ridden.
 *
 * `ollieAt` is a FRAME index and not a flag, because the whole of what makes an
 * ollie an approach rather than a hover is where in the arc it meets the line.
 * Returns the first catch, how far he actually travelled (a sweep of boards that
 * never moved is a clean sweep of nothing), and whether he went down.
 */
function ride({ x, z, y, heading, speed, slide, ollieAt = -1, seconds = 2, dt = STEP }) {
  const catches = [];
  let bailed = false;
  const model = new SkateModel(
    {
      onGrindStart: (kind, line) => catches.push({ kind, id: line.id }),
      onBail: () => (bailed = true),
    },
    STREET_SPOT,
  );
  const y0 = y ?? STREET_SPOT.height(x, z);
  model.position.set(x, y0, z);
  model.heading = heading;
  model.speed = speed;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    model.update({ ...EMPTY_INPUT, slideHeld: slide, olliePressed: i === ollieAt }, dt);
    if (catches.length) break;
  }
  return {
    catch: catches[0] ?? null,
    moved: Math.hypot(model.position.x - x, model.position.z - z),
    bailed,
    state: model.state,
  };
}

// --- reporting ---------------------------------------------------------------
// A section is a list of CELLS, each ridden twice (key up, key held). A cell is
// one or more rides plus what it wants:
//
//   want "none"  — no ride in the cell may catch anything. Every catch is a bad.
//   want <id>    — at least one ride must catch that line. No catch is a bad,
//                  and `share` records how many of the rides did.
//
// …and `avoid`, which is "none" narrowed to ONE line, because in a plaza this
// tight "crossing line A" is often "running along line B". Hopping the north
// kerb at 90° means travelling down z, and `ledge-long-e` runs down z eleven
// metres away — so the board clears the kerb, lands, and rides onto the ledge
// ALONG it, which is the thing the player asked for and not a defect. Blaming
// that on the kerb would have made a clean rule look dirty, so a crossing cell
// judges the line it is crossing and counts catches on its neighbours as
// `aside`, printed rather than hidden.

const sections = [];
function section(name, note, cells, gate) {
  const cols = {};
  for (const slide of [false, true]) {
    const tally = { n: 0, bad: 0, skipped: 0, moved: 0, share: 0, aside: 0, cases: [] };
    for (const cell of cells) {
      let caughtWanted = 0;
      let rides = 0;
      let moved = 0;
      let worst = null;
      for (const r of cell.rides) {
        const out = ride({ ...r, slide });
        if (out.moved < 0.5 && !out.catch) continue;
        rides++;
        moved += out.moved;
        if (cell.want === "none") {
          if (out.catch && cell.avoid && out.catch.id !== cell.avoid) tally.aside++;
          else if (out.catch) worst ??= `${out.catch.kind} on ${out.catch.id}`;
        } else if (out.catch?.id === cell.want) caughtWanted++;
        else worst ??= out.catch ? `${out.catch.kind} on ${out.catch.id}` : `${out.state}${out.bailed ? ", bailed" : ""}`;
      }
      if (rides === 0) {
        tally.skipped++;
        continue;
      }
      tally.n++;
      tally.moved += moved / rides;
      const bad = cell.want === "none" ? worst !== null : caughtWanted === 0;
      if (cell.want !== "none") tally.share += caughtWanted / rides;
      if (bad) {
        tally.bad++;
        if (tally.cases.length < 500) tally.cases.push(`${cell.label} → ${worst ?? "no catch"}`);
      }
    }
    cols[slide ? "held" : "up"] = tally;
  }
  sections.push({ name, note, cols, gate, wanted: cells[0]?.want !== "none" });
}

/** A cell that is one ride. */
const one = (label, want, r) => ({ label, want, rides: [r] });

// ---------------------------------------------------------------------------
// FALSE-A — rolling past a line, along it, with nothing pressed.
//
// THE ORIGINAL DEFECT, in its own shape. Every kerb in this plaza measures
// 0.00 m proud of the road (`ledgeOn` reads the footway's own top) and every
// ledge line lies flush on the top face of the thing it is the edge of, so a
// rolling board is level with the arris beside it and the vertical window cannot
// separate "the trucks are on the kerb" from "the wheels are on the pavement".
// The offsets straddle every corridor in the spot, so the inside ones are boards
// rolling with the arris under the trucks — the exact sample the old 237 came
// out of.
// ---------------------------------------------------------------------------
{
  const cells = [];
  for (const l of LINES) {
    const axis = axisOf(l);
    const { nx, nz } = normalOf(l);
    for (const off of [-1.2, -0.6, -0.3, -0.15, 0.15, 0.3, 0.6, 1.2]) {
      const p = pointAt(l, 0.05);
      const x = p.x + nx * off;
      const z = p.z + nz * off;
      // Inside its OWN corridor is the point of this section; inside somebody
      // else's is a different test than the one I wrote.
      if (Math.abs(off) > CORRIDOR && nearOther(x, z, l.id)) continue;
      for (const dir of [0, Math.PI]) {
        for (const v of [4, 8, 12]) {
          cells.push(
            one(`${l.id} off ${off.toFixed(2)} ${dir ? "back" : "fwd"} ${v}m/s`, "none", {
              x,
              z,
              heading: axis + dir,
              speed: v,
              seconds: 4,
            }),
          );
        }
      }
    }
  }
  section("FALSE-A  straight rolls along a line", "4 s coasting, nothing pressed", cells, {
    claim: "rolling past a line never puts him on it, with nothing pressed",
    ok: (c) => c.up.bad === 0,
    broke:
      "src/skate/grind.ts — round 2's rule reverted, BOTH halves (`if (q.grounded) return null` " +
      "and `if (this.airPeak - _hit.yNow < w.crest) continue`): 205/1111 straight rolls end " +
      "locked onto a line, which is the 237/576 defect on this sample. The grounded half alone " +
      "is 12/1111 (the coping, which stands 0.03 m over its own deck) — the two rules are one " +
      "defence and NEITHER of them is the key",
  });
}

// ---------------------------------------------------------------------------
// FALSE-B — rolling ACROSS a line. A board crossing a kerb on its way over the
// road is not asking for anything, and at 70° it is not even close to along.
// ---------------------------------------------------------------------------
{
  const cells = [];
  for (const l of LINES) {
    const axis = axisOf(l);
    for (const cross of [90, 70, -70]) {
      for (const side of [1, -1]) {
        for (const v of [4, 8, 12]) {
          const p = pointAt(l, 0.4);
          const dir = axis + (side * cross * Math.PI) / 180;
          cells.push(
            one(`${l.id} across ${side * cross}° ${v}m/s`, "none", {
              x: p.x - Math.sin(dir) * 3,
              z: p.z - Math.cos(dir) * 3,
              heading: dir,
              speed: v,
              seconds: 2.5,
            }),
          );
        }
      }
    }
  }
  section("FALSE-B  rolling across a line", "2.5 s, nothing pressed, 3 m run-up", cells, {
    claim: "rolling ACROSS a line never puts him on it either",
    ok: (c) => c.up.bad === 0,
    broke:
      "src/skate/grind.ts — the same double break as FALSE-A: 4/432 crossings lock on with " +
      "nothing pressed",
  });
}

// ---------------------------------------------------------------------------
// FALSE-C — an ollie BESIDE a line, outside its corridor. Popping over a crack
// while riding down the pavement is not a request for the kerb, and the lateral
// test is the only thing standing between the two.
// ---------------------------------------------------------------------------
{
  const cells = [];
  for (const l of LINES) {
    const axis = axisOf(l);
    const { nx, nz } = normalOf(l);
    for (const off of [-1.6, -0.9, 0.9, 1.6]) {
      const p = pointAt(l, 0.1);
      const x = p.x + nx * off;
      const z = p.z + nz * off;
      if (nearOther(x, z, l.id)) continue;
      for (const v of [6, 10]) {
        cells.push(
          one(`${l.id} pop off ${off.toFixed(1)} ${v}m/s`, "none", {
            x,
            z,
            heading: axis,
            speed: v,
            ollieAt: 2,
            seconds: 2,
          }),
        );
      }
    }
  }
  section("FALSE-C  ollie beside a line, outside the corridor", "pop on frame 2", cells, {
    claim: "an ollie taken BESIDE a line, outside its corridor, is not offered it",
    ok: (c) => c.up.bad === 0,
    broke:
      "src/skate/grind.ts `CATCH.ledge.reach` 0.1 → 1.2 (a ledge reaching out a metre): " +
      "6/6 on `--line=ledge-long-e`, i.e. every pop from 0.9 m and 1.6 m out",
  });
}

// ---------------------------------------------------------------------------
// FALSE-D — an ollie ACROSS a line, to get over it. Kerbs, ledges and the flat
// bar are things you hop on the way somewhere else, all day long.
//
// The lead is swept across the whole arc on purpose. At the apex he is a metre
// clear of a kerb and nothing is offered; at the two ends of the arc he is
// inside the window. One lucky lead would measure nothing.
//
// 90° and 65° only — both are past every "along" band in the spot, so nobody
// can read a catch here as a grind that was asked for. The grey angles get their
// own section below, because 35° across a kerb genuinely is two things at once.
// ---------------------------------------------------------------------------
function acrossCells(angles, want = "none") {
  const cells = [];
  for (const l of LINES) {
    const axis = axisOf(l);
    for (const ang of angles) {
      for (const v of [6, 10, 14]) {
        for (let lead = 0.1; lead <= 0.85; lead += 0.15) {
          const p = pointAt(l, 0.4);
          const dir = axis + (ang * Math.PI) / 180;
          cells.push({
            ...one(`${l.id} clear ${ang}° at ${v}m/s lead ${lead.toFixed(2)}s`, want, {
              x: p.x - Math.sin(dir) * v * lead,
              z: p.z - Math.cos(dir) * v * lead,
              heading: dir,
              speed: v,
              ollieAt: 0,
              seconds: 2,
            }),
            avoid: l.id,
          });
        }
      }
    }
  }
  return cells;
}
section(
  "FALSE-D  ollie across a line to clear it",
  "90° and 65°, lead swept over the whole arc",
  acrossCells([90, -90, 65, -65]),
  {
    claim: "hopping OVER a line to get past it takes no line — unless he asks with E",
    ok: (c) => c.up.bad === 0 && c.held.bad > 0,
    broke:
      "src/skate/skate-model.ts — the square gate deleted (`if (this.grind.squareEntry && " +
      "!this.slideWanted) return false`): 82/1432 hops lock on with nothing pressed",
  },
);

// ---------------------------------------------------------------------------
// WANTED-A — riding onto a line ALONG its length, which is the player's own
// sentence. Aimed AT a point on the line rather than started beside it, so an
// angled approach is an angle and not a miss.
// ---------------------------------------------------------------------------
{
  const cells = [];
  for (const l of LINES) {
    const axis = axisOf(l);
    for (const dir of [0, Math.PI]) {
      for (const ang of [0, 12, -12, 25, -25]) {
        for (const v of [5, 8, 11, 14]) {
          const p = pointAt(l, dir ? 0.85 : 0.15);
          const travel = axis + dir + (ang * Math.PI) / 180;
          const rides = [];
          for (const lead of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
            rides.push({
              x: p.x - Math.sin(travel) * v * lead,
              z: p.z - Math.cos(travel) * v * lead,
              heading: travel,
              speed: v,
              ollieAt: 0,
              seconds: 2.2,
            });
          }
          cells.push({ label: `${l.id} ${dir ? "back" : "fwd"} ${ang}° ${v}m/s`, want: l.id, rides });
        }
      }
    }
  }
  section("WANTED-A ride onto a line along its length", "pop, run-up swept 0.15–0.90 s", cells, {
    // The strongest form this claim has: not "most of them catch" but "the key
    // buys nothing here any more". Anything the geometry offered a player
    // holding E, it now offers a player holding nothing, line for line.
    claim: "riding onto a line catches with NO key — exactly what the key used to buy",
    ok: (c) => c.up.bad === c.held.bad,
    broke:
      "src/skate/skate-model.ts — the gate put back the way it was " +
      "(`if (!this.slideWanted) return false`): 960/960 unreachable with the key up " +
      "against 78/960 with it held",
  });
}

// ---------------------------------------------------------------------------
// WANTED-B — every line in the spot, at 30 / 60 / 144 fps. A rail that only
// takes you on the fast machine is a rail that works for whoever wrote the
// check, and the catch is exactly the sort of test with a frame in it.
// ---------------------------------------------------------------------------
{
  const cells = [];
  for (const l of LINES) {
    const axis = axisOf(l);
    for (const fps of [30, 60, 144]) {
      for (const v of [6, 11]) {
        const p = pointAt(l, 0.15);
        const rides = [];
        for (const lead of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
          rides.push({
            x: p.x - Math.sin(axis) * v * lead,
            z: p.z - Math.cos(axis) * v * lead,
            heading: axis,
            speed: v,
            ollieAt: 0,
            seconds: 2.2,
            dt: 1 / fps,
          });
        }
        cells.push({ label: `${l.id} ${fps}fps ${v}m/s`, want: l.id, rides });
      }
    }
  }
  section("WANTED-B the same entry at 30 / 60 / 144 fps", "straight on, run-up swept", cells, {
    claim: "every line in the spot is rideable-onto with no key, at 30 / 60 / 144 fps",
    ok: (c) => c.up.bad === 0,
    broke:
      "src/skate/skate-model.ts — the gate put back the way it was: 144/144 unreachable, " +
      "every line at every rate",
  });
}

// ---------------------------------------------------------------------------
// GREY — the angles that are two things at once: a hop across a kerb taken
// diagonally, at 50° / 35° / 25° off the line. Reported, never failed. This is
// the number that decides how wide "along" should be for a catch nobody asked
// for out loud, so it prints on both sides of the change.
// ---------------------------------------------------------------------------
section("GREY     diagonal hops (50° / 35° / 25°)", "informational — counts, not verdicts", acrossCells([50, -50, 35, -35, 25, -25]));

// ---------------------------------------------------------------------------
// WANTED-C — the square-across entry, which in this game IS the boardslide:
// ride at the bar across it, ollie, and the deck settles across the line while
// the momentum keeps running down it (`settleAngle`, and `integration-check`'s
// case 4). Held apart from WANTED-A because it is the one entry the geometry
// cannot tell from FALSE-D — the same approach, and only the player knows which
// he meant.
// ---------------------------------------------------------------------------
const SIDE_LINES = ["flat-bar", "handrail-3", "ledge-long-e", "kerb-n-c", "manual-pad-e"];
{
  const rows = [];
  for (const id of SIDE_LINES) {
    const l = RAILS.find((r) => r.id === id);
    if (!l) continue;
    const axis = axisOf(l);
    for (const slide of [false, true]) {
      let hit = 0;
      let n = 0;
      for (const v of [6, 8, 11]) {
        for (let lead = 0.5; lead <= 0.95; lead += 0.075) {
          const p = pointAt(l, 0.4);
          const dir = axis + Math.PI / 2;
          const r = ride({
            x: p.x - Math.sin(dir) * v * lead,
            z: p.z - Math.cos(dir) * v * lead,
            heading: dir,
            speed: v,
            slide,
            ollieAt: 0,
            seconds: 2,
          });
          if (r.moved < 0.5) continue;
          n++;
          if (r.catch?.id === id && (r.catch.kind === "boardslide" || r.catch.kind === "tailslide"))
            hit++;
        }
      }
      rows.push({ id, slide, hit, n });
    }
  }
  sections.push({
    name: "WANTED-C square-across entry (boardslide)",
    note: "lead swept 0.50–0.95 s at 6/8/11 m/s — the entry only the player can name",
    rows,
    gate: {
      claim: "…and E still buys the sideways entry, on every kind of line",
      ok: () => SIDE_LINES.every((id) => (rows.find((r) => r.id === id && r.slide)?.hit ?? 0) > 0),
      broke:
        "src/skate/skate-model.ts — the square gate made unconditional " +
        "(`if (this.grind.squareEntry) return false`), i.e. E taken out of the game the way " +
        "option (a) would have taken it: 0/21 on all five lines, both columns",
    },
  });
}

// ---------------------------------------------------------------------------
// WANTED-D — LEAVING a line, now that leaving it is not a key release.
//
// While the catch was gated, letting go of E was one way off a rail and Space was
// the other; automatic entry leaves only Space, and it hands the board back into
// the air a few centimetres over the steel it just left. A line that took him
// again there would read as the pop key not working — the defect measured at 11
// and 13 m/s as "re-locked 0.067 s later with 0.45 m of air out of a 1.57 m
// ollie" — and everything that stops it is now on the DEFAULT path rather than
// behind a key, so it is measured with nothing held.
//
// WHAT ACTUALLY STOPS IT is the RISING rule and not `RECATCH_CLEAR`, which this
// case established the hard way: with `RECATCH_CLEAR` cut from 0.70 m to 0.02 m
// the twelve pops below still came out clean, because `takeOff` clears
// `catchWhileRising` and `flight()` offers no line at all while the board is on
// its way up. So the claim is worded as what it measures. The clearance is a
// second line of defence for the descent — and a board that lands back on the
// line further down is not a defect anyway, it is an ollie down a rail.
//
// The bail is the other way off, and it needs no measurement because it cannot
// ask: `SkateModel.update` returns at the top while the state is `ragdoll`, so
// `catch` is not called for the whole fall, and the frames after the stand-up are
// grounded ones.
{
  const rows = [];
  for (const id of ["flat-bar", "handrail-6", "ledge-long-e", "kerb-n-c"]) {
    const l = RAILS.find((r) => r.id === id);
    if (!l) continue;
    const axis = axisOf(l);
    for (const v of [6, 9, 12]) {
      // The run-up is swept for the same reason WANTED-A sweeps it: every line
      // stands at its own height over whatever you ride at it on, so one fixed
      // lead measures my aim rather than the game. First lead that gets him on is
      // the one the pop is then measured out of.
      let row = { id, v, on: false, again: 0 };
      for (const lead of [0.3, 0.45, 0.6, 0.75, 0.9]) {
        const seen = [];
        const model = new SkateModel(
          { onGrindStart: (kind, line) => seen.push(line.id) },
          STREET_SPOT,
        );
        const p = pointAt(l, 0.15);
        const x = p.x - Math.sin(axis) * v * lead;
        const z = p.z - Math.cos(axis) * v * lead;
        model.position.set(x, STREET_SPOT.height(x, z), z);
        model.heading = axis;
        model.speed = v;
        // Ride onto it with NOTHING held, which is the whole point.
        let on = false;
        for (let i = 0; i < Math.round(2 / STEP) && !on; i++) {
          model.update({ ...EMPTY_INPUT, olliePressed: i === 0 }, STEP);
          on = model.state === "grind";
        }
        if (!on || seen[0] !== id) continue;
        for (let i = 0; i < Math.round(0.3 / STEP); i++) model.update({ ...EMPTY_INPUT }, STEP);
        const before = seen.length;
        model.update({ ...EMPTY_INPUT, olliePressed: true }, STEP);
        for (let i = 0; i < Math.round(0.2 / STEP); i++) model.update({ ...EMPTY_INPUT }, STEP);
        row = { id, v, on: true, again: seen.length - before, lead };
        break;
      }
      rows.push(row);
    }
  }
  sections.push({
    name: "WANTED-D leaving a line — Space out, and it stays out",
    note: "ridden on with nothing held, 0.3 s on the line, popped, 0.2 s watched",
    exits: rows,
    gate: {
      claim: "…and popping off a line does not put him straight back on it, key or no key",
      ok: () => rows.every((r) => r.on && r.again === 0),
      broke:
        "src/skate/skate-model.ts `flight()` — the rising guard dropped, i.e. " +
        "`if (this.tryCatchGrind(yBefore)) return` in place of " +
        "`if ((this.catchWhileRising || this.vy <= 0) && …)`: the line re-takes him on 3 of the " +
        "12, the flat bar at 9 and 12 m/s and the six-stair handrail at 9",
    },
  });
}

// --- print ------------------------------------------------------------------

const pct = (a, b) => (b === 0 ? "—" : `${((100 * a) / b).toFixed(1)}%`);
console.log("");
for (const s of sections) {
  if (s.exits) {
    console.log(`${s.name}\n  ${s.note}`);
    for (const r of s.exits)
      console.log(
        `  ${r.id.padEnd(14)} ${String(r.v).padStart(2)} m/s   ` +
          (r.on ? `on the line, ${r.again} re-catch${r.again === 1 ? "" : "es"} after the pop` : "NEVER GOT ON"),
      );
    console.log("");
    continue;
  }
  if (s.rows) {
    console.log(`${s.name}\n  ${s.note}`);
    for (const id of SIDE_LINES) {
      const up = s.rows.find((r) => r.id === id && !r.slide);
      const held = s.rows.find((r) => r.id === id && r.slide);
      if (!up) continue;
      console.log(
        `  ${id.padEnd(14)} key up ${String(up.hit).padStart(2)}/${up.n}   key held ${String(held.hit).padStart(2)}/${held.n}`,
      );
    }
    console.log("");
    continue;
  }
  const { up, held } = s.cols;
  const word = s.wanted ? "unreachable" : "false catches";
  console.log(`${s.name}\n  ${s.note}`);
  for (const [col, t] of [
    ["up  ", up],
    ["held", held],
  ]) {
    const extra = s.wanted
      ? `window ${pct(t.share, t.n)} of run-ups`
      : `mean travel ${(t.moved / Math.max(1, t.n)).toFixed(1)} m` +
        (t.aside ? `   along a neighbour ${t.aside}` : "");
    console.log(
      `  key ${col} ${word} ${String(t.bad).padStart(4)}/${t.n} (${pct(t.bad, t.n)})   ${extra}   skipped ${t.skipped}`,
    );
  }
  // The offenders, grouped by line — one line's worth of geometry going wrong is
  // a different finding from a rule going wrong everywhere, and the shape of the
  // list is what says which.
  for (const [col, t] of [
    ["up", up],
    ["held", held],
  ]) {
    if (!t.cases.length) continue;
    const byLine = new Map();
    for (const c of t.cases) {
      const id = c.split(" ")[0];
      byLine.set(id, (byLine.get(id) ?? 0) + 1);
    }
    console.log(
      `    key ${col}: ` +
        [...byLine.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => `${id} ${n}`)
          .join(" · "),
    );
    if (VERBOSE) for (const c of t.cases) console.log(`      ${c}`);
  }
  console.log("");
}

// --- the gate ---------------------------------------------------------------
// The numbers above are the reading; these are the claims. Each one names the
// deliberate break it was watched FAILING against — an assertion nobody has
// watched fail is a guess, and this repo has shipped green over a broken feature
// three times.

let red = 0;
console.log("— the claims —\n");
for (const s of sections) {
  if (!s.gate) continue;
  const ok = s.gate.ok(s.cols);
  if (!ok) red++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${s.gate.claim}`);
  console.log(`      ${s.name.split(" ")[0]} — watched failing against: ${s.gate.broke}`);
}
const gated = sections.filter((s) => s.gate).length;
console.log(`\n${gated - red}/${gated} claims hold`);
if (red) process.exitCode = 1;
