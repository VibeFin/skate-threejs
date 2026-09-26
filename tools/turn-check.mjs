// Which way is the BODY pointing? — `node tools/turn-check.mjs`
//
// Everything a player has said was wrong about the stance comes back to two
// numbers nothing else in this project measures: the skater's facing IN THE
// WORLD, and where he is LOOKING relative to the line he is actually moving
// along.
//
// Every other stance harness measures the body in the BOARD's frame
// (`tools/stance-check.mjs`) — the right frame for "did his feet swap ends" and
// exactly the wrong one for either of those. The board's frame turns with the
// spin, so a body that turned 360° while the deck turned 180° reads as a tidy
// swap in it; and "down the line" in that frame quietly assumes the nose leads,
// which is how a stance that faced 155° away from the direction of travel
// passed its own check for two rounds.
//
// So: the REAL model, the REAL rig and the REAL animation layer, stepped in
// main.ts's frame order, with the hips' twist about the world vertical and the
// head's gaze both read every frame. Two scenarios:
//
//   SPIN  — pop, spin a half-turn, land, BOTH ways round. He keeps his line, the
//           board came round under him and his feet did NOT: the other foot is
//           in front now and he stays that way, looking over his shoulder rather
//           than back down his own line.
//   RAMP  — ride at the quarter pipe, run out of speed on the transition, roll
//           back down. The board holds its heading; nothing turned the rider, so
//           the rider turns himself and the same foot goes on leading.
//
// The two are different moves and the harness asserts the difference, because a
// player has now described both in his own words and they disagree about the one
// thing that matters: whether his feet move on the deck.
//
// Run: node tools/turn-check.mjs

globalThis.self ??= globalThis;
globalThis.URL.createObjectURL ??= () => "blob:turn-check";
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
const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { SkaterRig } = await import("../src/skate/skater-rig.ts");
const { STREET_SPOT, QP_TOE_Z } = await import("../src/world/spot.ts");

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
await anim.attachHandClips(
  Object.fromEntries(Object.entries(HAND_CLIPS).map(([k, v]) => [k, { ...v, url: abs(v.url) }])),
);

const scene = new THREE.Scene();
const rig = new SkaterRig(scene);
let model = null;
let hips = null;
const bones = {};
anim.model.traverse((o) => {
  if (o.name === "Hips") hips = o;
  if (
    [
      "Hips",
      "LeftFoot",
      "RightFoot",
      "Head",
      "LeftUpLeg",
      "RightUpLeg",
      "Spine01",
      "Spine02",
    ].includes(o.name)
  ) {
    bones[o.name] = o;
  }
});

// --- the character's own axes, measured here rather than asked for -----------
// Read off the skeleton in the BIND pose, at the origin, before the holder has
// been yawed onto the deck and before any clip has touched a bone — the one
// moment they can be had cleanly. Deliberately re-derived instead of exposed
// from `SkaterAnim`: an instrument that borrows the axes of the thing it is
// measuring cannot catch that thing getting them wrong, which is the trap the
// lead-foot read fell into when it asked the model for its own `course`.
anim.model.updateMatrixWorld(true);
const at = (bone) => new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
const charLeft = at(bones.LeftUpLeg).sub(at(bones.RightUpLeg)).normalize();
const charFwd = new THREE.Vector3()
  .crossVectors(charLeft, at(bones.Spine02).sub(at(hips)).normalize())
  .normalize();
/**
 * Where each bone sat before anything animated it — every facing below is a
 * DELTA off its own entry here, so no reading depends on what the rigger called
 * that bone's axes.
 *
 * Three bones and not one, and that is the whole lesson of the round this was
 * written in. The harness measured the HEAD and nothing else, so a build that
 * cranked 125° of neck over a pelvis still pointed backwards scored 36° off his
 * line and passed every check here — and the player watched the same build and
 * said "you just turned the head, while the body is facing backward even though
 * I'm moving forward." The head is the cheapest thing on a skeleton to turn and
 * the last thing that proves a stance.
 */
const bindInv = Object.fromEntries(
  ["Head", "Spine01", "Hips"].map((name) => [
    name,
    (bones[name] ?? hips).getWorldQuaternion(new THREE.Quaternion()).invert(),
  ]),
);

// …and only NOW is the holder allowed to be stood sideways on the deck.
rig.setCharacter(anim.model, SKATER_YAW);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const DEG = 180 / Math.PI;
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const _q = new THREE.Quaternion();

/**
 * The hips' turn about the WORLD vertical, degrees.
 *
 * A swing-twist twist rather than a projected forward vector: the hips rest
 * pitched over far enough that a projection swings wildly for a few degrees of
 * real turn, which is the same singularity `stance-check.mjs` documents on the
 * head. This is the number the player is describing when he says "he spins all
 * the way round".
 */
const bodyYaw = () => {
  hips.getWorldQuaternion(_q);
  return 2 * Math.atan2(_q.y, _q.w) * DEG;
};

/**
 * Which foot is LEADING — the one further along the direction of travel.
 *
 * Riding regular, one foot is toward the nose and the nose is where he is
 * going. Roll back down the transition and turn round properly and the SAME foot
 * ends up toward the tail — which is now where he is going, so the same foot
 * still leads and he looks like a skater riding the other way. Leave the body
 * alone instead and the other foot leads: that is riding backwards, and it is
 * the thing the player said was missing.
 *
 * It is a necessary read and not a sufficient one, which is the lesson of this
 * round: the feet swapped ends correctly for two rounds while his head faced
 * 158° away from his line. That is what the gaze read below is for.
 *
 * "Where he is going" is taken from the POSITION he actually moved to, and that
 * is not fussiness. The first version asked the model for its `course`, which
 * since this round reads the stance — so a build with the stance wired to
 * nothing scored itself against its own broken answer and passed. Watched
 * failing is the only way that gets caught, and it is why the displacement is
 * measured here instead of asked for.
 */
const _lf = new THREE.Vector3();
const _rf = new THREE.Vector3();
/**
 * …averaged over a whole loop of the riding clip, because a single frame is not
 * an answer. The feet swing past each other inside the stance loop, so a lead
 * read off one frame is a coin toss on the phase — which is how this harness
 * first reported the RIGHT foot leading a regular skater whose left foot is on
 * the nose (`stance-check.mjs`) and nearly had me chasing a bug in the fix.
 */
const _feet = new THREE.Vector3();
const _travel = new THREE.Vector3();
const _at = new THREE.Vector3();
let _gapN = 0;

/**
 * Which way the skater is LOOKING, as a world direction.
 *
 * The head bone's own axes are whatever the rigger left them as, so the gaze is
 * not read off one of them. It is the character's bind-pose forward, carried by
 * however far the head has turned since the bind pose — a delta, so the answer
 * survives any convention. Everything is taken in the holder's frame and put
 * back into the world at the end, which is what folds the deck's heading, the
 * switch half-turn and the clip's own facing into one number.
 *
 * This is the number the player is describing: he is going that way, and his
 * face is pointing this way.
 */
const _qh = new THREE.Quaternion();
const _qm = new THREE.Quaternion();
const _gaze = new THREE.Vector3();
const _face = new THREE.Vector3();
const facingOf = (name, out) => {
  bones[name].getWorldQuaternion(_qh);
  anim.model.getWorldQuaternion(_qm);
  _qh.premultiply(_qm.clone().invert()).multiply(bindInv[name]);
  return out.copy(charFwd).applyQuaternion(_qh).applyQuaternion(_qm).setY(0).normalize();
};
const gazeNow = () => facingOf("Head", _gaze);

const _gazeSum = new THREE.Vector3();
/** The two the head cannot stand in for — the pelvis, and the middle of the back. */
const _hipsSum = new THREE.Vector3();
const _chestSum = new THREE.Vector3();
/**
 * How far each sole ranged ALONG the deck in the window — the push's signature.
 *
 * Not how low it got, which was the first guess and is wrong: the rig slides the
 * skater so the planted sole rides on the deck, so the free leg swings back and
 * UP as the knee folds (measured: the pushing ankle rose to 0.44 in the board's
 * frame against the planted one's steady 0.285, and the two soles' lowest points
 * were 14 mm apart — noise wearing an answer). What the pushing foot does
 * unmistakably is travel: half a metre of deck against the other's thirteen
 * centimetres, and the end it travels TO is the end it pushes off.
 */
const _zL = { min: Infinity, max: -Infinity };
const _zR = { min: Infinity, max: -Infinity };
const _root = new THREE.Vector3();
const _gazeWas = new THREE.Vector3();
let _gazeStep = 0;
let _gazeSeen = false;
/** Zeroes the worst-frame gaze swing, so a window can be judged on its own. */
const gazeStepReset = () => {
  _gazeStep = 0;
};

const sampleLead = () => {
  bones.LeftFoot.getWorldPosition(_lf);
  bones.RightFoot.getWorldPosition(_rf);
  _feet.add(_lf).sub(_rf);
  _travel.add(model.position).sub(_at);
  _at.copy(model.position);
  _gapN++;

  gazeNow();
  if (_gazeSeen) {
    _gazeStep = Math.max(_gazeStep, Math.acos(Math.min(1, _gaze.dot(_gazeWas))) * DEG);
  }
  _gazeWas.copy(_gaze);
  _gazeSeen = true;
  _gazeSum.add(_gaze);
  _hipsSum.add(facingOf("Hips", _face));
  _chestSum.add(facingOf("Spine01", _face));

  // Both soles down the length of the deck, in the BOARD's own frame: +z is the
  // nose, so this survives the skater and the board turning together.
  for (const [foot, span] of [
    [_lf, _zL],
    [_rf, _zR],
  ]) {
    const z = rig.root.worldToLocal(_root.copy(foot)).z;
    span.min = Math.min(span.min, z);
    span.max = Math.max(span.max, z);
  }
};
const readLead = () => {
  const n = Math.max(1, _gapN);
  _feet.divideScalar(n);
  _travel.y = 0;
  const moving = _travel.lengthSq() > 1e-9;
  const gap = moving ? _feet.dot(_travel.normalize()) : 0;
  // Signed, and against the same travel vector the lead foot is read against:
  // 0° is looking straight down the line he is actually moving along, ±180° is
  // looking back the way he came. The sign says which shoulder he is over.
  const line = Math.atan2(_travel.x, _travel.z);
  const off = (sum) => {
    const v = sum.setY(0).normalize();
    return moving ? wrap((Math.atan2(v.x, v.z) - line) * DEG) : 0;
  };
  const gaze = off(_gazeSum);
  const hips = off(_hipsSum);
  const chest = off(_chestSum);
  // Which foot left the deck, how much further it ranged than the other, and
  // which END of the board it went off. A window with no push in it leaves the
  // two swings within a few centimetres of each other — that is a `null`, not a
  // LEFT, because a coin toss that reads as an answer is worse than no answer.
  const swingL = _zL.max - _zL.min;
  const swingR = _zR.max - _zR.min;
  const kick = swingL > swingR ? _zL : _zR;
  const clear = Math.abs(swingL - swingR);
  const push = !Number.isFinite(swingL) || clear < 0.15 ? null : swingL > swingR ? "LEFT" : "RIGHT";
  const reach = Math.abs(kick.min) > Math.abs(kick.max) ? kick.min : kick.max;
  _feet.set(0, 0, 0);
  _travel.set(0, 0, 0);
  _gazeSum.set(0, 0, 0);
  _hipsSum.set(0, 0, 0);
  _chestSum.set(0, 0, 0);
  _zL.min = _zR.min = Infinity;
  _zL.max = _zR.max = -Infinity;
  _gapN = 0;
  return {
    foot: gap > 0 ? "LEFT" : "RIGHT",
    gap,
    gaze,
    hips,
    chest,
    push,
    clear,
    end: push === null ? null : reach > 0 ? "NOSE" : "TAIL",
  };
};

function boot(start) {
  model = new SkateModel(
    {
      onStance: (s) => anim.setStance(s),
      // main.ts's wiring, and it has to be here: without it the kick fires in
      // the ride model and no clip ever plays, so a push probe measures the
      // rolling loop and reports whichever sole the phase happened to leave
      // lower. Watched: 9 mm between the two, which is noise wearing an answer.
      onPush: (span) => anim.startPush(span),
    },
    STREET_SPOT,
  );
  if (start) {
    model.position.x = start.x;
    model.position.z = start.z;
    model.position.y = STREET_SPOT.height(start.x, start.z);
    model.heading = start.heading ?? 0;
    model.speed = start.speed ?? 0;
  }
  anim.setStance(model.stance);
  step({}, 1 / 600); // one tiny frame so the rig's own facing starts settled
  _at.copy(model.position);
  _gazeSeen = false; // a respawn is a teleport, not a head turning
  return { swept: 0, last: bodyYaw() };
}

/** main.ts's frame order, exactly. */
function step(input, dt = DT) {
  model.update({ ...EMPTY_INPUT, ...input }, dt);
  rig.sync(model, dt);
  // The ride's own spin tracker, exactly as main.ts hands it over. This used to
  // pass `rig.spinRate ?? 0` — a property `SkaterRig` does not have — so every
  // frame of every scenario ran with NO tracker, the spin flourish never fired
  // once, and the settle direction (which is read off it) could not be measured
  // at all. A harness that claims main.ts's frame order has to actually be it.
  anim.update(dt, model.spin);
  rig.followFeet(anim, model, dt);
  rig.root.updateMatrixWorld(true);
}

/** Steps `n` frames, accumulating how far the body actually swung. */
function run(track, input, n, watch) {
  for (let i = 0; i < n; i++) {
    step(input);
    const now = bodyYaw();
    track.swept += wrap(now - track.last);
    track.last = now;
    sampleLead();
    watch?.(i);
  }
  return track;
}

// ---------------------------------------------------------------------------
// SPIN — a landed 180, spun BOTH ways round.
//
// Both ways, because the half-turn the body settles through has a direction and
// the two are not the same move: settled against the spin he swings back onto
// his line and his net turn over the trick is zero — a revert. Settled WITH it
// he carries on round and comes to rest facing where he began, having turned a
// full circle for a half-turn of board. That is the thing a player watched and
// called "he rotates 360 degrees with the body again", and running one direction
// only is how a harness passes it: whichever way the fixed direction happened to
// suit, the other 180 in the game is the bug.
// ---------------------------------------------------------------------------
for (const way of [1, -1]) {
// Screen-right is DECREASING heading (skate-model.ts's header note), so a
// positive stick is a spin to the right.
console.log(`\nSPIN — pop, half-turn ${way > 0 ? "screen-right" : "screen-left"}, land`);
{
  const track = boot({ x: 2, z: -24, heading: 0, speed: 9 });
  readLead();
  run(track, { throttle: true }, 30);
  const lead0 = readLead();
  const before = { swept: track.swept, heading: model.heading };
  // Charge, pop, and hold the stick over until the tracker says a half-turn is
  // in the bank — then let it land.
  run(track, { throttle: true, chargeHeld: true }, 18);
  run(track, { olliePressed: true, chargeHeld: false }, 1);
  if (!model.airborne) throw new Error("the pop never fired — the scenario tests nothing");
  // The gaze window opens at the POP, not after the landing. The stance flips on
  // the touchdown frame itself, so a window opened once the wheels are down has
  // already missed the turn — a settle cut to one frame measured 0.2° through it.
  // The air spin's own ~8°/frame of body rides inside this window and is meant
  // to: it is a real turn, and it is nowhere near what a snapped settle looks
  // like (170°).
  gazeStepReset();
  let airFrames = 0;
  let flightX = 0;
  let flightZ = 0;
  const airFrom = model.position.clone();
  while (model.airborne && airFrames < 240) {
    // Ease off before the half-turn is complete: the stick has a dying tail and
    // the landing wants it square, which is the same thing a player does.
    const need = Math.abs(model.spin.degrees) < 168;
    run(track, { steer: need ? way : 0 }, 1);
    flightX = model.position.x - airFrom.x;
    flightZ = model.position.z - airFrom.z;
    airFrames++;
  }
  // Where he is looking the instant the wheels touch, against the line he flew
  // in on — the shoulder check has had no time to ramp, so this is the raw
  // landing. It is the reference the TURN is judged against below.
  const gazeLanded = wrap(
    (Math.atan2(gazeNow().x, gazeNow().z) - Math.atan2(flightX, flightZ)) * DEG,
  );
  const landedSwept = track.swept - before.swept;
  const deckTurn = wrap((model.heading - before.heading) * DEG);
  const kept = model.speed;
  const drift = Math.abs(wrap((Math.atan2(flightX, flightZ) - model.course) * DEG));
  // The settle window — long enough for the whole half-turn (0.45 s) plus the
  // landing cushion under it. The worst gaze step is read ACROSS it, not after
  // it: a snap that has already finished by the time the window opens measures
  // 0.3°, which is how this check first passed against a stance turn cut to a
  // single frame.
  readLead();
  run(track, {}, 40);
  const settleStep = _gazeStep;
  readLead();
  run(track, {}, 60); // …then read the lead foot over a whole loop of the clip
  const settledSwept = track.swept - before.swept;
  const lead1 = readLead();
  console.log(
    `  deck turned ${deckTurn.toFixed(1)}°   body swept ${landedSwept.toFixed(1)}° at touchdown, ` +
      `${settledSwept.toFixed(1)}° once settled   stance ${model.stance}   speed ${model.speed.toFixed(2)}`,
  );
  console.log(
    `  ${lead0.foot} foot led going in (${lead0.gap.toFixed(3)} m), ` +
      `${lead1.foot} leads riding away (${lead1.gap.toFixed(3)} m)`,
  );
  console.log(
    `  looking ${lead0.gaze.toFixed(1)}° off his line going in, ` +
      `${lead1.gaze.toFixed(1)}° riding away   worst frame of the settle ${settleStep.toFixed(1)}°`,
  );
  console.log(
    `  hips ${lead0.hips.toFixed(1)}° → ${lead1.hips.toFixed(1)}°, ` +
      `chest ${lead0.chest.toFixed(1)}° → ${lead1.chest.toFixed(1)}° off his line`,
  );
  check(
    "a landed 180 leaves the OTHER foot in front — the trick has a visible result",
    lead0.foot !== lead1.foot,
    `${lead0.foot} → ${lead1.foot}; the same foot still leading means he was turned back round on the deck ` +
      `and his feet ended up exactly where they started`,
  );
  check(
    "…and he looks over his shoulder rather than back down his own line",
    Math.abs(lead1.gaze) < 75,
    `landed looking ${gazeLanded.toFixed(1)}° off his line, rides away at ${lead1.gaze.toFixed(1)}° ` +
      `— he rides at ~43° off it going forwards, and ±180° is a man skating backwards`,
  );
  // The check the head could not make. A skater riding fakie is a MIRROR of the
  // same skater riding forwards: his shoulders open toward where he is going,
  // over the other shoulder. So the body's two loadbearing joints have to land
  // on the far side of his line from where they rode in, at about the same
  // angle — not merely somewhere ahead of him, which a cranked neck can fake.
  //
  // Watched failing on the build the player rejected: hips −131.8°, chest
  // −118.4°, against a head that had been dragged to 36°. That is the defect in
  // one line, and nothing in this file could see it before.
  for (const [what, was, now] of [
    ["hips", lead0.hips, lead1.hips],
    ["chest", lead0.chest, lead1.chest],
  ]) {
    check(
      `…and his ${what} came round with him, not just his head`,
      Math.abs(now) < 75 && Math.sign(now) === -Math.sign(was),
      `${was.toFixed(1)}° off his line riding in, ${now.toFixed(1)}° riding away — ` +
        `fakie is the mirror of forwards, so it should read about ${(-was).toFixed(1)}°; ` +
        `±180 is a man pointed backwards with his head screwed round`,
    );
  }
  // …and over the LEADING shoulder, which the angle alone cannot tell you.
  // Landing at ~168° off, a 125° turn either way round ends up under 75° off —
  // the wrong way just gets there the long way, through 180° and out the far
  // side, which on screen is him turning AWAY from where he is going first.
  // Watched: the twist negated ends at −73° and passes the bar above.
  check(
    "…over the LEADING shoulder — he turns toward his line, not away from it",
    Math.sign(wrap(lead1.gaze - gazeLanded)) === -Math.sign(gazeLanded),
    `turned ${wrap(lead1.gaze - gazeLanded).toFixed(1)}° from a landing ${gazeLanded.toFixed(1)}° off his line ` +
      `— the short way to nothing is ${(-Math.sign(gazeLanded) * 90).toFixed(0)}°-ish`,
  );
  // 60° sits between the two things this can see. The trick's own body already
  // moves the gaze ~34° on its biggest frame — the pop, where the flourish comes
  // on over one frame — and that is measured, not guessed. A settle with the
  // ease taken out reads 179.9°. Anything in between is worth failing on.
  check(
    "…and comes round to it rather than snapping",
    settleStep < 60,
    `worst single frame ${settleStep.toFixed(1)}° of head from the pop to the end of the settle ` +
      `— the trick's own worst is ~34°, a settle with no ease is 179.9°`,
  );
  check(
    "…and his feet never moved on the deck, so he STAYS that way",
    model.stance === "regular" && model.fakie,
    `stance ${model.stance}, wheels-against-him ${model.fakie}; a stance change here is him being turned back round`,
  );
  console.log(
    `  flew ${Math.hypot(flightX, flightZ).toFixed(1)} m, rides away at ${kept.toFixed(1)} m/s ` +
      `${drift.toFixed(1)}° off the line he flew`,
  );
  // Two signatures, and BOTH are needed, because the off-square of the spin
  // muddies the angle on its own: the wheels can only run along the board, so a
  // 168° spin lands 12° off the line however faithfully the momentum is kept.
  // A REDIRECT is unmistakable in the pair — the course swings the whole way
  // round to the new nose (~180° off the flight path) and the speed comes out
  // POSITIVE, because he is rolling nose-first down a line he never chose.
  check(
    "…and he keeps the line he was travelling, not the one the board now points down",
    drift < 35 && kept < -3,
    `${drift.toFixed(1)}° off his flight path at ${kept.toFixed(1)} m/s — a redirect is ~180° off, at +${Math.abs(kept).toFixed(1)}`,
  );
  // The body goes round with the board and then ONE thing more: his shoulders
  // were open ~47° toward the end he was going to, and riding fakie they are
  // open ~47° toward the other end, so a reflection of the stance is worth about
  // 90° of pelvis on its own. Measured at −85° and −88° for the two spin
  // directions — the same swing both ways, which is what says it is the stance
  // and not the spin leaking into the body.
  //
  // The bar used to be 50° and had to be, because the pose was the plain clip
  // and any disagreement at all was a second turn nobody asked for. What it must
  // still catch is a SECOND HALF-TURN, which lands the disagreement at ~180.
  const extra = wrap(settledSwept - deckTurn);
  check(
    "…and his body turned once with the board, plus the one shoulder swing the stance costs",
    Math.abs(extra) < 130 && Math.abs(Math.abs(settledSwept) - 360) > 60,
    `body ${settledSwept.toFixed(1)}° against a deck of ${deckTurn.toFixed(1)}° — ${extra.toFixed(1)}° of ` +
      `disagreement, where the stance reflection is worth ~90 and a second half-turn is ~180`,
  );
  check(
    "the scenario really spun a half-turn",
    Math.abs(Math.abs(deckTurn) - 180) < 40,
    `deck turned ${deckTurn.toFixed(1)}° — anything else and the checks above are vacuous`,
  );
}
}

// ---------------------------------------------------------------------------
// PUSH — which foot goes to the concrete, riding forwards and riding fakie.
//
// The player put it plainly: "when I'm riding forward … I push off the ground
// with my right foot. When I'm looking to the left — i.e. rotated 180 degrees —
// and still going forward, that's goofy … Then I should be pushing with my left
// foot." It is the one part of a stance no amount of turning the body can fake,
// because the pushing foot is a LEG SWINGING OFF THE DECK: either the clip has
// the other one doing it or it does not.
//
// Both halves run the same probe, so the pair is the assertion — a harness that
// only measured fakie could pass by reporting LEFT for everything.
// ---------------------------------------------------------------------------
console.log("\nPUSH — the foot that goes to the concrete");
{
  /** Rides at `speed`, kicks, and reports which sole went lowest. */
  const probe = (track) => {
    // Long enough for the whole kick cycle: the leg leaves the deck, strokes,
    // and comes home. `throttle` is the push key.
    readLead();
    run(track, { throttle: true }, 70);
    return readLead();
  };

  const fwd = probe(boot({ x: 2, z: -24, heading: 0, speed: 4 }));
  console.log(
    `  riding forwards: ${fwd.push} foot kicks off the ${fwd.end} ` +
      `(${fwd.clear.toFixed(2)} m more deck than the other sole), ${fwd.foot} leads`,
  );

  // …and the same probe on the far side of a landed half-turn.
  const track = boot({ x: 2, z: -24, heading: 0, speed: 9 });
  run(track, { throttle: true }, 30);
  run(track, { throttle: true, chargeHeld: true }, 18);
  run(track, { olliePressed: true, chargeHeld: false }, 1);
  if (!model.airborne) throw new Error("the pop never fired — the scenario tests nothing");
  let air = 0;
  while (model.airborne && air < 240) {
    run(track, { steer: Math.abs(model.spin.degrees) < 168 ? 1 : 0 }, 1);
    air++;
  }
  run(track, {}, 50); // let the reflected take fade all the way in
  if (!model.fakie) throw new Error("the 180 did not leave him fakie — the probe tests nothing");
  const back = probe(track);
  console.log(
    `  riding fakie:    ${back.push} foot kicks off the ${back.end} ` +
      `(${back.clear.toFixed(2)} m more deck than the other sole), ${back.foot} leads`,
  );

  check(
    "riding forwards he pushes with his RIGHT foot",
    fwd.push === "RIGHT",
    `${fwd.push ?? "neither"} foot left the deck (${fwd.clear.toFixed(2)} m of clearance) — ` +
      `the player's own baseline: "when I'm riding forward … I push off the ground with my right foot"`,
  );
  check(
    "…and riding fakie he pushes with the OTHER one",
    back.push !== null && back.push !== fwd.push,
    `${fwd.push} riding forwards, ${back.push ?? "neither"} riding fakie (${back.clear.toFixed(2)} m clear) — ` +
      `the same foot both ways is the forwards take played at a rider going the other way, ` +
      `and no transform above the hips can move it`,
  );
  // Both halves, because "the trailing foot pushes" is the claim and either one
  // alone can be satisfied by a stance that is simply wrong in a consistent way.
  for (const [what, p, trailing] of [
    ["forwards", fwd, "TAIL"],
    ["fakie", back, "NOSE"],
  ]) {
    check(
      `…and riding ${what} he kicks off the end BEHIND him, so the stroke drives him along his line`,
      p.push !== p.foot && p.end === trailing,
      `${p.push} pushes off the ${p.end} while ${p.foot} leads — riding ${what} the trailing end is the ` +
        `${trailing}, and a kick off the leading end is a stroke run backwards`,
    );
  }
}

// ---------------------------------------------------------------------------
// RAMP — up the transition, out of speed, back down. The body must turn round.
// ---------------------------------------------------------------------------
console.log("\nRAMP — roll up the quarter pipe and come back down");
{
  // Enough pace to get up the transition and not enough to clear the lip. Found
  // by sweeping rather than guessed, because a scenario that flies over the
  // coping proves nothing and reads like a pass.
  let approach = 0;
  let track = null;
  for (const v of [7, 6.5, 6, 5.5, 5, 4.5, 4, 7.5, 8]) {
    track = boot({ x: 2, z: QP_TOE_Z - 6, heading: 0, speed: v });
    let climbed = 0;
    let flew = false;
    for (let i = 0; i < 120 && !flew; i++) {
      run(track, {}, 1);
      climbed = Math.max(climbed, model.position.y);
      flew = model.airborne;
    }
    if (!flew && climbed > 0.6) {
      approach = v;
      break;
    }
  }
  if (!approach) throw new Error("no approach speed climbs the transition without clearing it");
  track = boot({ x: 2, z: QP_TOE_Z - 6, heading: 0, speed: approach });
  let peak = model.position.y;
  let reversedAt = -1;
  const mark = { swept: 0 };
  readLead();
  run(track, {}, 60);
  const lead0 = readLead();
  const heading0 = model.heading;
  let worst = 0;
  let minSpeed = 0;
  for (let i = 0; i < 260; i++) {
    const was = bodyYaw();
    run(track, {}, 1);
    peak = Math.max(peak, model.position.y);
    worst = Math.max(worst, Math.abs(wrap(bodyYaw() - was)));
    minSpeed = Math.min(minSpeed, model.speed);
    if (reversedAt < 0 && model.speed < -0.4) {
      reversedAt = i;
      mark.swept = track.swept;
    }
  }
  const afterReverse = track.swept - mark.swept;
  readLead();
  gazeStepReset();
  run(track, {}, 60);
  const lead1 = readLead();
  const deckHeld = Math.abs(wrap((model.heading - heading0) * DEG));
  console.log(
    `  approached at ${approach.toFixed(1)} m/s, climbed to y ${peak.toFixed(2)}, ` +
      `rolled back at frame ${reversedAt}, fastest backwards ${minSpeed.toFixed(2)} m/s   stance ${model.stance}`,
  );
  console.log(
    `  ${lead0.foot} foot led going up (${lead0.gap.toFixed(3)} m), ` +
      `${lead1.foot} leads coming back down (${lead1.gap.toFixed(3)} m)`,
  );
  console.log(
    `  looking ${lead0.gaze.toFixed(1)}° off his line going up, ` +
      `${lead1.gaze.toFixed(1)}° coming back down   worst frame ${_gazeStep.toFixed(1)}°`,
  );
  console.log(
    `  body swept ${afterReverse.toFixed(1)}° in the world · deck held to ${deckHeld.toFixed(1)}° ` +
      `· worst single frame ${worst.toFixed(1)}°`,
  );
  check(
    "he actually rolls back down the transition",
    reversedAt >= 0 && minSpeed < -1.5,
    `fastest backwards ${minSpeed.toFixed(2)} m/s — the scenario has to reverse before it can test the turn`,
  );
  check(
    "rolling backwards turns him round on the deck",
    model.stance === "switch",
    `stance is ${model.stance} — the board keeps its heading, so only a stance change can face him down the hill`,
  );
  check(
    "…so the same foot still leads coming back down",
    lead0.foot === lead1.foot,
    `${lead0.foot} → ${lead1.foot}; the other foot leading means he is riding backwards, not switch`,
  );
  check(
    "…and he is looking down the hill he is rolling down, not back up it",
    Math.abs(lead1.gaze) < 60,
    `looking ${lead1.gaze.toFixed(1)}° off his line — the feet can swap ends and the gaze still face the wrong way`,
  );
  check(
    "the board keeps its own heading through it",
    deckHeld < 12,
    `deck turned ${deckHeld.toFixed(1)}° — the player asked for the skateboard to stay in place`,
  );
  check(
    "and the turn is eased, not a snap",
    worst < 30,
    `worst single frame ${worst.toFixed(1)}° of body`,
  );
}

server.close();
const bad = results.filter((r) => !r.pass);
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
if (bad.length) {
  for (const r of bad) console.log(`  FAILED: ${r.name}`);
  process.exitCode = 1;
}
