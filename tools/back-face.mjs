// Is the north wall's face a ramp, or a wall with a ramp drawn on it?
// — `node --experimental-strip-types tools/back-face.mjs`
//
// WHY THIS EXISTS, and it is not "the other two ramp harnesses do not cover it".
// `tools/back-ramp.mjs` and `tools/back-air.mjs` both RIDE this ramp, and both of
// them would go red the day it stops being rideable. What neither can report is
// how much ROOM is left before that happens, and this shape is one where the room
// is the whole design:
//
//   · a grounded step covers `LIP_PROBE` = 0.12 m measured ALONG the surface, so
//     on a 40° panel it reaches 0.12·cos 40° = 9.2 cm of GROUND ahead;
//   · `advance()` probes that whole step at the height it STARTED and refuses
//     anything standing more than `WALL_PROBE` = 0.30 m over it.
//
// Which means a face that gets steep too FAST is a wall: a vertical kick 9 cm
// ahead of a board on the panel is half a metre of climb inside one step, and the
// board stops dead at the bottom of the coping. That is why the kick is a
// circular fillet and not a crease (`BACK_KICK_RUN`), and why the straight lip
// above it is 0.10 m and not 0.20 (`BACK_VERT` — at 0.20 the worst step comes to
// 0.294 m of the 0.300 m budget, which is a ramp that works until anything else
// about it moves by a centimetre).
//
// So this measures the two clearances the shape lives inside, off the real solids
// and in the RIDE's own numbers — `LIP_PROBE` and `WALL_PROBE` are imported, not
// typed here, because a harness carrying its own copy of 0.12 is a harness that
// goes green while the ramp stops the board at the coping:
//
//   PROBE  — the worst climb any single roll step can be asked to swallow,
//            against `WALL_PROBE`. Swept at 0.5 mm over the whole face, square on
//            and off square, because `slopeAlong` reads `tan(face)·cos θ` and a
//            diagonal step reaches further across the ground for the same 0.12 m.
//   TILE   — the face's length against one copy of the `park` image. Read
//            `TILE`'s own note: a transition shorter than its own tile shows one
//            cell of one photograph and reads as one smooth region of nothing,
//            and a face that is ONE FLAT PANEL — one facet, one tone — needs the
//            joints more than a curve did.
//
// It also prints the facets, because the facets are the player's complaint: he
// called this ramp "kind of uneven", which is 20 chord-shaded bands across 74 m
// of concrete, and the fix was to make the bottom three quarters of it one facet.
//
// WHAT EACH CLAIM WAS WATCHED FAILING AGAINST, and one of them was not:
//
//   · the 10% margin — `BACK_VERT` 0.10 → 0.20 m, which measures 0.294 m of the
//     0.300 m probe: 2% clear, a ramp that passes the hard line and stops the
//     board the day anything else about the shape moves. Also 0.25 and 0.40.
//   · one whole tile — `BACK_FACE_ANGLE` 40° → 46°, which is 4.41 m of face and
//     0.98 tiles. That is the reason the panel is 40° and not 45°.
//   · the HARD probe line could NOT be tripped from this shape's own dials, and
//     that is worth saying rather than leaving as an untested branch. `BACK_VERT`
//     saturates: raising it lowers the panel's top by the same amount, so the
//     climb tops out at 0.294 m however tall the vert gets. `BACK_KICK_RUN` 0.42
//     → 0.05 makes it BETTER (0.235 m) for the reason written at that constant.
//     What the line is still there for is everything the sweep reads that is not
//     a dial of this face — it walks the real `SOLIDS`, so a step or a cove added
//     BEHIND the coping, or a return whose foot rises off the lip, lands in this
//     measurement the moment it is declared.

import { register } from "node:module";

register(new URL("./ts-resolve.mjs", import.meta.url));
const { LIP_PROBE, WALL_PROBE } = await import("../src/skate/skate-model.ts");
const { SOLIDS, STREET_SPOT, topOf, topPolyline, arcRun, TILE, normalOf } = await import(
  "../src/world/spot.ts"
);
const THREE = await import("three");

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// --- the face, off its own solid ----------------------------------------------

const FACE = SOLIDS.find((s) => s.id === "back-trans");
if (!FACE) throw new Error("[back-face] no `back-trans` in SOLIDS");
const p = FACE.profile;
const RUN = p.shape === "arc" ? arcRun(p) : 2 * FACE.hz;
const TOE_Z = FACE.cz - FACE.hz;
const LIP_Z = FACE.cz + FACE.hz;
const LIP_Y = topOf(FACE, 0, LIP_Z - 1e-6);

console.log(
  `\nTHE NORTH FACE — "${FACE.id}", ${p.shape}: toe z=${TOE_Z.toFixed(3)}, ` +
    `lip z=${LIP_Z.toFixed(3)} at y=${LIP_Y.toFixed(3)}, run ${RUN.toFixed(3)} m, ` +
    `${(2 * FACE.hx).toFixed(1)} m wide`,
);
if (p.panel)
  console.log(
    `  panel ${((Math.atan(p.panel.grade) * 180) / Math.PI).toFixed(2)}° rising ${p.panel.rise.toFixed(3)} m · ` +
      `curl r=${p.radius.toFixed(4)} · vert ${(p.vert ?? 0).toFixed(3)} m · ` +
      `lip tangent ${((Math.atan(STREET_SPOT.slopeAlong(0, LIP_Z - 0.001, 0, 1, LIP_Y + 0.15)) * 180) / Math.PI).toFixed(2)}°`,
  );

// --- the facets, which are what "uneven" meant --------------------------------

const pts = topPolyline(FACE);
const vAt = (t) => -FACE.hz + t * 2 * FACE.hz;
let faceLen = 0;
let widest = { len: 0, deg: 0 };
for (let i = 0; i < pts.length - 1; i++) {
  const d = Math.hypot(vAt(pts[i + 1].t) - vAt(pts[i].t), pts[i + 1].y - pts[i].y);
  faceLen += d;
  const deg = (Math.atan2(-pts[i].nv, pts[i].ny) * 180) / Math.PI;
  if (d > widest.len) widest = { len: d, deg };
}
console.log(
  `  ${pts.length - 1} facets over ${faceLen.toFixed(3)} m of face; the widest is ` +
    `${widest.len.toFixed(3)} m at ${widest.deg.toFixed(1)}° ` +
    `(${((widest.len / faceLen) * 100).toFixed(0)}% of the face in ONE flat-shaded panel)`,
);

// --- PROBE: the worst climb one roll step can be asked to swallow --------------
//
// `roll()` steps `min(speed·left, LIP_PROBE)` along the SURFACE, so the step's
// ground reach is `LIP_PROBE/hypot(1, grade)` — and off square the grade the ride
// reads is `tan(face)·cos θ`, which reaches further for the same step. Bounded by
// the probe, never by the frame rate: no speed can make the step longer.
const n = new THREE.Vector3();
const groundAt = (x, z) => {
  let best = -Infinity;
  for (const s of SOLIDS) {
    const top = topOf(s, x, z);
    if (top !== null && top > best) best = top;
  }
  return best;
};
let worst = { climb: -1 };
for (const deg of [0, 10, 20, 30, 40, 52]) {
  const th = (deg * Math.PI) / 180;
  const dx = Math.sin(th);
  const dz = Math.cos(th);
  for (let z = TOE_Z; z <= LIP_Z; z += 0.0005) {
    const y = topOf(FACE, 0, z);
    if (y === null) continue;
    normalOf(FACE, 0, z, n);
    // The grade ALONG this heading, which is what `slopeAlong` hands the ride.
    const grade = -(n.x * dx + n.z * dz) / Math.max(1e-4, n.y);
    const reach = LIP_PROBE / Math.hypot(1, grade);
    const climb = groundAt(dx * reach, z + dz * reach) - y;
    if (climb > worst.climb)
      worst = { climb, z, deg, reach, face: (Math.atan(-n.z / n.y) * 180) / Math.PI };
  }
}
console.log(
  `\n  worst single-step climb: ${worst.climb.toFixed(3)} m of the ${WALL_PROBE} m probe, ` +
    `at z=${worst.z.toFixed(3)} (face ${worst.face.toFixed(0)}°, ${worst.deg}° off square, ` +
    `${(worst.reach * 100).toFixed(1)} cm of ground ahead)`,
);
const clear = (WALL_PROBE - worst.climb) / WALL_PROBE;
check(
  "every step up the north face clears the ride's own wall probe",
  worst.climb < WALL_PROBE,
  `${worst.climb.toFixed(3)} m against ${WALL_PROBE} m — ${(clear * 100).toFixed(0)}% clear. ` +
    `Over it, the board is stopped dead where the face steepens and the coping becomes a wall ` +
    `you ride into`,
);
// …and it has to clear it by something, which is a second claim and not the same
// one. The bound above is EXACT — no speed and no frame rate can lengthen a roll
// step — so nothing the player does will ever eat the difference; the only thing
// that can is the next edit to this shape, and 3 cm of headroom is an edit that
// ships broken. `BACK_VERT` at 0.20 m measured 0.294 m here, which is a ramp that
// passes the line above and stops the board the day the panel angle moves.
const PROBE_MARGIN = 0.1;
check(
  "…and it clears it by enough for the shape to be edited again",
  clear >= PROBE_MARGIN,
  `${(clear * 100).toFixed(0)}% clear of the probe against a ${(PROBE_MARGIN * 100).toFixed(0)}% floor ` +
    `(${((WALL_PROBE - worst.climb) * 100).toFixed(1)} cm of headroom). The dials are ` +
    `\`BACK_VERT\` (a centimetre of vert is a centimetre of this) and \`BACK_KICK_RUN\``,
);

// --- TILE: the face has to cross a whole copy of its own material --------------
check(
  "…and the face is longer than one copy of the `park` image",
  faceLen >= TILE.park,
  `${faceLen.toFixed(2)} m of face against a ${TILE.park} m tile = ` +
    `${(faceLen / TILE.park).toFixed(2)} tiles. Under one tile a flat panel is one cell of one ` +
    `photograph at one tone, which is the "one wide swirl and nothing else" TILE was re-cut for`,
);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
