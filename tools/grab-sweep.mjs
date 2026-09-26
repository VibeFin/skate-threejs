// Where does the grab put the hand, on a body that is not the one it was tuned
// on? — `node tools/grab-sweep.mjs [--grid] [--bodies a,b,c]`
//
// Fourth of the animation lane's harnesses, beside `tools/anim-check.mjs` (the
// air and the takes), `tools/hold-check.mjs` (what a held shape looks like) and
// `tools/stance-check.mjs` (which way round he is). It exists because ONE shape
// in `POSTURES` does not survive a body swap, and only one:
//
//   Every other held move is measured against HIMSELF — how far his hips drop,
//   how wide his hands go — so a taller body just does the same thing at its own
//   scale and the number moves by a millimetre. The GRAB is measured against the
//   BOARD, and the board is stood on his soles: a leg that is 5 cm longer holds
//   the deck 5 cm further from his shoulder under the same angles. `fold` and
//   `reach` are what put it back.
//
// So this file measures the deck, not the man. Three numbers decide a grab and
// the deck's own geometry decides all three:
//
//   ABOVE   — the wrist's height over the griptape, SIGNED. Positive is hooked
//             over the rail; NEGATIVE is a hand planted inside the plank, which
//             is the failure that shipped on rig 2 and which an unsigned
//             distance cannot see (it reads 1.8 cm either way round).
//   X       — how far off the centre line, against rails at ±10.5 cm. A grab is
//             a hand on a RAIL; over the middle of the deck is a man hanging
//             onto his board.
//   Z       — where along the deck, against trucks near ±26 cm. Between his feet
//             is where a hand goes.
//
// …plus the FREE hand, which is the other half of a grab: if it comes up with
// the board it is two hands on one deck, which the player rejected by name.
//
// Everything is measured on the REAL `SkaterAnim` over the REAL rigs, stepped at
// 1/60 with no renderer, in the board's own frame, with `fly()` copied from
// `tools/anim-check.mjs` line for line — so a number here is the same number
// that file prints, and the two can be compared without a translation.

globalThis.self ??= globalThis;
globalThis.URL.createObjectURL ??= () => "blob:grab-sweep";
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
const { SkaterAnim, HAND_CLIPS, POSTURES } = await import("../src/skate/skater-anim.ts");

/**
 * The roster, as `main.ts` carries it, plus the body that is out of the picker.
 *
 * `posture` here is a COPY of what that file ships, not an import — this harness
 * has to be able to say "the shipped tweak measures X" and "no tweak measures Y"
 * about the same rig in one run, and importing the roster would tie it to
 * whatever `main.ts` happens to hold. When the two disagree, the roster is right
 * and this file is stale; the run prints both so the disagreement is visible.
 */
const BODIES = {
  local: {
    name: "The Local",
    url: "https://assets.auras.cc/generations/cms0fbiar004o22nuyjqjhzuz/rigged-character.glb",
    // No entry in the roster: this body IS what `POSTURES` was swept against.
    posture: null,
  },
  clockman: {
    name: "The Timekeeper",
    url: "https://assets.auras.cc/generations/cms5uxuo500ea22lb0sccf64o/rigged-character.glb",
    posture: { Grab: { fold: 96, reach: 16 } },
  },
  runaway: {
    name: "The Runaway",
    url: "https://assets.auras.cc/generations/cms69mf2z00aj22obb71wt0hq/rigged-character.glb",
    // NO entry, and NOT because nobody has swept her — this file swept 2,304
    // poses at her and none of them is a grab. See THE REST FRAME below: the
    // hand-authored clips are played raw at a rig that rests 138° from the one
    // they were written on, so her torso is folded before the posture layer gets
    // a turn, and a `posture` line here would be numbers tuning around it.
    posture: null,
  },
};

const SKATER_YAW = -Math.PI / 2;
const DT = 1 / 60;
/** `SkaterRig`'s `AIR_SOLE_CLEARANCE` — the deck hangs this far below the soles. */
const AIR_DECK_DROP = 10;
/** The deck: rails at ±this across, and this long from the middle to each end. */
const RAIL_X = 10.5;
const DECK_HALF_Z = 48;
/** …and the trucks, which is what "between his feet" means. */
const TRUCK_Z = 26;

const argv = process.argv.slice(2);
const wantGrid = argv.includes("--grid");
const wantTrace = argv.includes("--trace");
const only = (argv.find((a) => a.startsWith("--bodies=")) ?? "").split("=")[1];
const RUN = only ? only.split(",") : Object.keys(BODIES);

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
const CLIP_TABLE = Object.fromEntries(
  Object.entries(HAND_CLIPS).map(([k, v]) => [k, { ...v, url: abs(v.url) }]),
);

/**
 * The rig as the GLB delivers it, before the motion runtime has touched it.
 *
 * This exists to answer ONE question that no number in `POSTURES` can: when a
 * body measures strangely, is that the body or is it the retarget? The clips
 * carry full local quaternion tracks that REPLACE bind rotations, so a rig whose
 * rest offsets point somewhere unusual poses differently under the same clip —
 * and telling that apart from a runtime bug needs the untouched skeleton beside
 * the posed one. Read straight off the loaded GLTF, no `loadRig`, no calibration.
 */
const REST_BONES = [
  "Hips", "Spine02", "Spine01", "Spine", "neck", "Head", "RightShoulder", "RightArm",
  "RightForeArm", "RightHand", "RightUpLeg", "RightLeg", "RightFoot", "LeftUpLeg", "LeftLeg",
  "LeftFoot",
];

async function bindChain(url) {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const bones = new Map();
  gltf.scene.traverse((o) => o.name && bones.set(o.name, o));
  const p = (n) =>
    bones.has(n) ? new THREE.Vector3().setFromMatrixPosition(bones.get(n).matrixWorld) : null;
  const foot = p("RightFoot");
  const toe = p("RightToeBase");
  const ground = foot && toe ? (foot.y + toe.y) / 2 : 0;
  const names = ["Hips", "Spine02", "Spine01", "Spine", "neck", "Neck", "Head", "RightArm"];
  const rows = names.filter((n) => bones.has(n)).map((n) => ({ name: n, y: (p(n).y - ground) * 100 }));
  const parents = names
    .filter((n) => bones.has(n))
    .map((n) => `${n}←${bones.get(n).parent?.name ?? "(root)"}`);
  /**
   * Each bone's LOCAL rest rotation — the one number that decides whether a
   * hand-authored clip can be played at this rig at all.
   *
   * The clips carry full local quaternion tracks that REPLACE the bind rotation
   * rather than composing with it, so what a track means depends entirely on the
   * frame the bone rests in. Two rigs can stand in the same world pose with
   * completely different local rest rotations — the child offsets take up the
   * difference — and the world pose is what everyone looks at, which is why this
   * is invisible until a clip is laid on.
   */
  const rest = new Map();
  for (const n of REST_BONES) if (bones.has(n)) rest.set(n, bones.get(n).quaternion.clone());
  return { rows, parents, rest };
}

/** The worst bone, in degrees, between two rigs' local rest rotations. */
function restGap(a, b) {
  let worst = { name: "-", deg: 0 };
  for (const [name, q] of a) {
    if (!b.has(name)) continue;
    const deg = (q.angleTo(b.get(name)) * 180) / Math.PI;
    if (deg > worst.deg) worst = { name, deg };
  }
  return worst;
}

let pass = 0;
let fail = 0;
function check(label, ok, detail, watched) {
  if (ok) pass++;
  else fail++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}\n        ${detail}\n        ` +
      (watched ? `watched failing: ${watched}` : "UNPROVEN"),
  );
}

/**
 * One loaded body, with every measurement this file takes hanging off it.
 *
 * The takes are NOT attached. The grab has none — `POSE_TAKES.Grab` is
 * deliberately absent, and `anim-check.mjs` asserts it stays absent — so
 * attaching the other three would fetch 3 GLBs to move an arm this file never
 * reads. Its own grab check re-runs with them on and lands on the same number.
 */
async function body(url, tweak, clips = true) {
  const anim = await SkaterAnim.create(url, `${origin}/motion-sets/skate.json`, tweak ?? undefined);
  if (clips) await anim.attachHandClips(CLIP_TABLE, {});

  const board = new THREE.Group();
  anim.model.rotation.y = SKATER_YAW;
  board.add(anim.model);

  const bones = new Map();
  anim.model.traverse((o) => o.name && bones.set(o.name, o));
  const missing = [
    "Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot",
    "LeftToeBase", "RightToeBase", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm",
    "LeftHand", "RightHand",
  ].filter((n) => !bones.has(n));
  if (missing.length) throw new Error(`rig is missing bones this file measures: ${missing}`);
  // `anim-check.mjs` reads the torso off a bone it spells `neck`. Named per rig
  // rather than assumed, the way `skater-anim.ts` names its chest and waist.
  const neck = ["neck", "Neck", "Spine01", "Spine1", "Spine"].find((n) => bones.has(n));
  if (!neck) throw new Error("rig has no neck/spine bone to read a torso angle off");

  const inv = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const step = () => {
    anim.update(DT);
    board.updateMatrixWorld(true);
  };
  /** Where a bone is, in the board's frame: +Z the nose, +X across the deck. */
  const at = (name) => {
    inv.copy(board.matrixWorld).invert();
    return v.setFromMatrixPosition(bones.get(name).matrixWorld).applyMatrix4(inv).clone();
  };
  const sole = (side) => at(`${side}Foot`).add(at(`${side}ToeBase`)).multiplyScalar(0.5);
  const feet = () => sole("Left").add(sole("Right")).multiplyScalar(0.5);
  const cm = (a, b) => (a.y - b.y) * 100;
  const settle = (n = 180) => {
    anim.holdTrick(null);
    anim.endCharge();
    anim.setAir(false);
    for (let i = 0; i < n; i++) step();
  };

  /**
   * One air with a grab called in it — `anim-check.mjs`'s `fly`, minus the
   * landing, which no question in this file asks about.
   */
  const fly = ({ hang = 1.2, seconds = 1.2, grabAt = 0.2 } = {}) => {
    settle();
    const trace = [];
    anim.playTrick("Ollie", hang);
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
      if (grabAt !== null && Math.abs(i * DT - grabAt) < DT / 2) anim.holdTrick("Grab");
      step();
      const f = feet();
      const torso = at(neck).sub(at("Hips"));
      trace.push({
        t: i * DT,
        hand: at("RightHand").clone(),
        free: at("LeftHand").clone(),
        handAbove: cm(at("RightHand"), f),
        freeAbove: cm(at("LeftHand"), f),
        stand: cm(at("Hips"), f),
        span: at("LeftHand").distanceTo(at("RightHand")) * 100,
        // Off vertical ACROSS the deck, which is the axis a rider standing
        // sideways folds over his own board on — where "doubled over into his
        // own knees" lives. Copied from `anim-check.mjs`'s `held`.
        tip: (Math.atan2(torso.x, torso.y) * 180) / Math.PI,
        lean: (Math.atan2(-torso.z, torso.y) * 180) / Math.PI,
      });
    }
    anim.holdTrick(null);
    return trace;
  };

  /**
   * The proportions that decide the grab.
   *
   * Every SEGMENT here is a distance between two joints, which a rigid bone
   * makes pose-independent — so these are the rig's own build and not something
   * the rolling stance is doing to it. The two heights at the end are not, and
   * are labelled as the stance's.
   */
  const shape = () => {
    settle();
    const seg = (a, b) => at(a).distanceTo(at(b)) * 100;
    return {
      thigh: seg("RightUpLeg", "RightLeg"),
      shin: seg("RightLeg", "RightFoot"),
      leg: seg("RightUpLeg", "RightLeg") + seg("RightLeg", "RightFoot"),
      foot: seg("RightFoot", "RightToeBase"),
      upperArm: seg("RightArm", "RightForeArm"),
      foreArm: seg("RightForeArm", "RightHand"),
      arm: seg("RightArm", "RightForeArm") + seg("RightForeArm", "RightHand"),
      /** Hips to the shoulder joint — the bone chain a reaching arm hangs off. */
      torso: seg("Hips", "RightArm"),
      hipWidth: seg("LeftUpLeg", "RightUpLeg"),
      shoulder: cm(at("RightArm"), feet()),
      stand: cm(at("Hips"), feet()),
    };
  };

  /**
   * The spine, joint by joint, in the rolling stance.
   *
   * Here because "her torso is half the length" is a claim about the RIG, and
   * the only honest way to make it is to walk the chain the arm hangs off and
   * print what each link contributes. A short `Hips → RightArm` could be one
   * collapsed link or five short ones, and those are different findings.
   */
  const spine = () => {
    settle();
    const f = feet();
    const chain = ["Hips", "Spine02", "Spine01", "Spine", neck, "Head"].filter(
      (n, i, a) => bones.has(n) && a.indexOf(n) === i,
    );
    const rows = chain.map((n) => ({ name: n, y: cm(at(n), f) }));
    rows.push({ name: "RightArm", y: cm(at("RightArm"), f) });
    rows.push({ name: "RightHand", y: cm(at("RightHand"), f) });
    return rows;
  };

  return { anim, at, feet, cm, step, settle, fly, shape, spine, bones };
}

/**
 * How near a hand ever came to the deck — `anim-check.mjs`'s `toDeck`, so the
 * headline number in this file is the headline number in that one.
 *
 * It is a DISTANCE and therefore unsigned, which is the whole reason `above`
 * below exists beside it: a wrist 1.8 cm under the griptape scores 1.8, the same
 * as a wrist 1.8 cm over it, and those are a planted palm and a grab.
 */
const toDeck = (p, above) =>
  Math.hypot(
    Math.max(0, Math.abs(p.x * 100) - RAIL_X),
    above,
    Math.max(0, Math.abs(p.z * 100) - DECK_HALF_Z),
  );
/** Signed height of a hand over the deck's top face, cm. */
const over = (aboveSoles) => aboveSoles + AIR_DECK_DROP;

/** The frame of a flight where the grabbing hand came nearest the plank. */
function nearestFrame(trace) {
  return trace.reduce((a, b) =>
    toDeck(b.hand, over(b.handAbove)) < toDeck(a.hand, over(a.handAbove)) ? b : a,
  );
}

/**
 * Everything the criteria need, read off one flight.
 *
 * TWO frames, and the difference between them is not a detail. `nearest` is
 * `anim-check.mjs`'s own frame — the closest the hand ever came — and it is what
 * makes a number here comparable with a number there. But it is chosen by an
 * UNSIGNED distance, so on a hand that ends up inside the plank it picks the
 * frame the wrist crossed the surface rather than the pose it settled in, and
 * under-reports the depth. The HELD frame is the pose: the posture fades in over
 * `POSTURES.Grab.fade` = 0.26 s and then parks, so the last frame of a 1.2 s
 * flight is what the player is looking at. Both are printed; the criteria are
 * read off the held one.
 */
function read(trace) {
  const f = nearestFrame(trace);
  const held = trace.at(-1);
  return {
    off: toDeck(f.hand, over(f.handAbove)),
    nearAbove: over(f.handAbove),
    nearX: f.hand.x * 100,
    above: over(held.handAbove),
    x: held.hand.x * 100,
    z: held.hand.z * 100,
    heldOff: toDeck(held.hand, over(held.handAbove)),
    freeOff: toDeck(held.free, over(held.freeAbove)),
    freeAbove: over(held.freeAbove),
    freeX: held.free.x * 100,
    freeZ: held.free.z * 100,
    span: held.span,
    tip: held.tip,
    lean: held.lean,
    stand: held.stand,
  };
}

const line = (r) =>
  `${r.heldOff.toFixed(1)} cm off the griptape · ${r.above >= 0 ? "" : "INSIDE, "}` +
  `${r.above.toFixed(1)} cm over it · x ${r.x.toFixed(1)} (rail ±${RAIL_X}) · ` +
  `z ${r.z.toFixed(1)} (trucks ±${TRUCK_Z}) · free hand ${r.freeAbove.toFixed(1)} cm up` +
  `\n        (nearest approach ${r.off.toFixed(1)} cm at ${r.nearAbove.toFixed(1)} over, ` +
  `x ${r.nearX.toFixed(1)})`;

/** Runs `fn` with some of `POSTURES.Grab` replaced, then puts it back. */
function withGrab(values, fn) {
  const saved = { ...POSTURES.Grab };
  Object.assign(POSTURES.Grab, values);
  try {
    return fn();
  } finally {
    Object.assign(POSTURES.Grab, saved);
  }
}

// =============================================================================
console.log(`\nTHE BODIES  — what the grab is actually being asked to do\n`);
console.log(
  `  the deck: rails ±${RAIL_X} cm, trucks ±${TRUCK_Z} cm, top face ${AIR_DECK_DROP} cm ` +
    `below the soles in the air. The base table is fold ${POSTURES.Grab.fold}, ` +
    `reach ${POSTURES.Grab.reach}, tuck ${POSTURES.Grab.tuck}, elbow ${POSTURES.Grab.elbow}.\n`,
);

const loaded = {};
for (const id of RUN) {
  const spec = BODIES[id];
  if (!spec) throw new Error(`no such body: ${id}`);
  const b = await body(spec.url, null); // no tweak — the shared table, raw
  const s = b.shape();
  loaded[id] = { spec, b, shape: s };
  console.log(
    `  ${spec.name.padEnd(15)} leg ${s.leg.toFixed(1)} cm (thigh ${s.thigh.toFixed(1)} + shin ` +
      `${s.shin.toFixed(1)}) · foot ${s.foot.toFixed(1)} · arm ${s.arm.toFixed(1)} ` +
      `(upper ${s.upperArm.toFixed(1)} + fore ${s.foreArm.toFixed(1)})\n` +
      `${" ".repeat(18)}hips→shoulder ${s.torso.toFixed(1)} cm · hips ${s.hipWidth.toFixed(1)} wide · ` +
      `riding: shoulder ${s.shoulder.toFixed(1)} and hips ${s.stand.toFixed(1)} cm over the soles`,
  );
}

if (argv.includes("--rig")) {
  console.log(`\nTHE SPINE  — every link the reaching arm hangs off, cm over the soles, riding\n`);
  for (const id of RUN) {
    const rows = loaded[id].b.spine();
    console.log(
      `  ${loaded[id].spec.name.padEnd(15)} ` +
        rows.map((r) => `${r.name} ${r.y.toFixed(1)}`).join(" · "),
    );
  }
  console.log(`\n…the same chain on the COMPILED set alone, with no hand-authored clip attached\n`);
  const control = {};
  for (const id of RUN) {
    const b = await body(BODIES[id].url, null, false);
    control[id] = b;
    console.log(
      `  ${BODIES[id].name.padEnd(15)} ` +
        b.spine().map((r) => `${r.name} ${r.y.toFixed(1)}`).join(" · "),
    );
  }

  // THE CONTROL, and it is the whole diagnosis in three lines. The COMPILED set
  // is RETARGETED onto each rig (`loadRig` → `computeCorrection`); the
  // hand-authored clips are played raw at it through a mixer, because they were
  // authored on this skeleton and "there is nothing to retarget"
  // (`attachHandClip`). So the same chain measured both ways separates a body
  // from the clips laid on it: a rig that sits with its neighbours here and
  // nowhere near them above does not have unusual proportions, it has clips that
  // do not fit its rest frame.
  //
  // The grab itself cannot be asked here and the numbers say so plainly: with no
  // crouch clip to sink into, `holdTrick` finds `depth > 0` and no clip and
  // returns false, so the shape never comes on at all and all three read the
  // same untouched air. That equality IS the control — it is the sentence "with
  // the hand-authored clips out of the way these three bodies are the same body".
  console.log(`\n…and one air on each, with the posture unable to come on for want of a crouch\n`);
  for (const id of RUN) {
    const r = read(control[id].fly());
    console.log(
      `  ${BODIES[id].name.padEnd(15)} hand ${r.above.toFixed(1)} cm over the griptape · x ` +
        `${r.x.toFixed(1)} · free hand ${r.freeAbove.toFixed(1)} · hips ${r.stand.toFixed(1)} cm ` +
        `over the soles`,
    );
  }
  console.log(`\n…and in the GLB's OWN bind pose, before anything at all touches it\n`);
  for (const id of RUN) {
    const { rows, parents } = await bindChain(BODIES[id].url);
    console.log(
      `  ${BODIES[id].name.padEnd(15)} ` + rows.map((r) => `${r.name} ${r.y.toFixed(1)}`).join(" · "),
    );
    console.log(`${" ".repeat(18)}${parents.join(" · ")}`);
  }
}

console.log(`\nTHE SHARED TABLE, ON EVERY BODY  — the numbers swept on rig 1, run on all three\n`);
const bare = {};
for (const id of RUN) {
  bare[id] = read(loaded[id].b.fly());
  console.log(`  ${loaded[id].spec.name.padEnd(15)} ${line(bare[id])}`);
}

// The whole pose, not just the one wrist — because the last time this move was
// looked at, the defect was not where the grabbing hand was but what the rest of
// him was doing around it: doubled over face-down into his own knees with both
// hands clamped to the deck. That is a CLIP problem and no number in `POSTURES`
// fixes it, so it has to be visible here or it gets tuned around.
console.log(`\nTHE WHOLE POSE, AT THE HELD FRAME  — both hands, and what his torso is doing\n`);
for (const id of RUN) {
  const r = bare[id];
  console.log(
    `  ${loaded[id].spec.name.padEnd(15)} hips ${r.stand.toFixed(1)} cm over the soles · ` +
      `torso ${r.tip.toFixed(1)}° across the deck, ${r.lean.toFixed(1)}° over the tail\n` +
      `${" ".repeat(18)}grabbing hand  x ${r.x.toFixed(1)}  z ${r.z.toFixed(1)}  ` +
      `${r.above.toFixed(1)} cm over the griptape\n` +
      `${" ".repeat(18)}free hand      x ${r.freeX.toFixed(1)}  z ${r.freeZ.toFixed(1)}  ` +
      `${r.freeAbove.toFixed(1)} cm over it (${r.freeOff.toFixed(1)} cm off the plank) · ` +
      `hands ${r.span.toFixed(1)} cm apart`,
  );
}

// The flight itself, tenth of a second by tenth of a second. A grab is a POSE —
// it fades in over 0.26 s and then parks — so the nearest-approach frame and the
// held frame agreeing is the evidence that it parked at all. Where they
// disagree, this is where you find out which of the two is moving: his hand, or
// the deck riding his soles up past it.
if (wantTrace) {
  for (const id of RUN) {
    console.log(`\nTHE FLIGHT — ${loaded[id].spec.name}\n`);
    const trace = loaded[id].b.fly();
    console.log(`     t     hand x     hand z   over grip   soles vs hips   free hand`);
    for (const f of trace) {
      if (Math.round(f.t * 100) % 10) continue;
      console.log(
        `  ${f.t.toFixed(2)}  ${(f.hand.x * 100).toFixed(1).padStart(8)}  ` +
          `${(f.hand.z * 100).toFixed(1).padStart(8)}  ${over(f.handAbove).toFixed(1).padStart(9)}  ` +
          `${(-f.stand).toFixed(1).padStart(14)}  ${over(f.freeAbove).toFixed(1).padStart(10)}`,
      );
    }
  }
}

// =============================================================================
// THE SWEEP. `fold` brings the knees up under him and the deck rides the soles,
// so it is the height knob; `reach` swings the shoulder out over the board, so
// it is the lateral one. They are not independent — a hand swung further out
// also drops — which is why this is a grid and not two line searches.
//
// `tuck` and `elbow` are held at the table's values and swept separately below,
// because on rig 1 they were found to trade against `fold` and `reach` rather
// than adding anything of their own: the knees are already level with the hips
// at tuck 40 and deeper read as a cannonball.
const FOLD = Array.from({ length: 20 }, (_, i) => 60 + i * 4); // 60 → 136
const REACH = Array.from({ length: 16 }, (_, i) => 4 + i * 4); // 4 → 64

/** What a good grab looks like, in the three numbers that decide it. */
const WANT_ABOVE = 6.0;
const OK_ABOVE = [3.5, 9.0];
const OK_RAIL = 1.5;

function sweep(b, folds = FOLD, reaches = REACH, tucks = [POSTURES.Grab.tuck]) {
  // What the legs do with NO tuck at all, so every row can say how far the shape
  // brought the board up to him. A pose that lands the hand by abolishing the
  // tuck is not a grab — it is a man holding still while his board hangs.
  const flat = withGrab({ tuck: 0, fold: 0 }, () => read(b.fly()));
  const rows = [];
  for (const tuck of tucks) {
    for (const fold of folds) {
      for (const reach of reaches) {
        const r = withGrab({ tuck, fold, reach }, () => read(b.fly()));
        rows.push({
          tuck,
          fold,
          reach,
          ...r,
          rail: Math.abs(Math.abs(r.x) - RAIL_X),
          /** cm the shape brought the soles — and the deck on them — up to his hips. */
          lift: flat.stand - r.stand,
        });
      }
    }
  }
  return rows;
}

/** Inside the shape a grab has to be, then nearest the middle of that shape. */
function pick(rows) {
  const ok = rows.filter(
    (r) =>
      r.above >= OK_ABOVE[0] &&
      r.above <= OK_ABOVE[1] &&
      r.rail <= OK_RAIL &&
      Math.abs(r.z) < TRUCK_Z + 4 &&
      r.freeAbove > 8,
  );
  return ok
    .map((r) => ({
      ...r,
      // Inside the window, prefer the pose nearest the middle of it — and break
      // a tie toward the shipped table, because this is a CORRECTION and the
      // smallest one that measures right is the one to carry.
      cost:
        Math.abs(r.above - WANT_ABOVE) +
        r.rail +
        0.02 * (Math.abs(r.fold - POSTURES.Grab.fold) + Math.abs(r.reach - POSTURES.Grab.reach)),
    }))
    .sort((a, b) => a.cost - b.cost);
}

if (wantGrid) {
  for (const id of RUN) {
    const b = loaded[id].b;
    console.log(
      `\nSWEEP — ${loaded[id].spec.name}: ${FOLD.length} folds × ${REACH.length} reaches = ` +
        `${FOLD.length * REACH.length} poses\n`,
    );
    const t0 = Date.now();
    const rows = sweep(b);
    const ranked = pick(rows);
    console.log(
      `  ${rows.length} poses in ${((Date.now() - t0) / 1000).toFixed(0)} s · ` +
        `${ranked.length} of them land the hand on the rail, a few cm over the griptape`,
    );
    // The two gradients the last sweep recorded, re-measured on THIS body: how
    // far one degree of each knob moves the hand. A body whose response differs
    // is a body the shapes do not transfer to at all, which is worth knowing
    // before any number is picked off the grid.
    const grad = (a, b2, key) => (b2[key] - a[key]) / (b2.fold - a.fold || b2.reach - a.reach || 1);
    const atP = (fold, reach) => rows.find((r) => r.fold === fold && r.reach === reach);
    const base = atP(112, 24);
    if (base && atP(104, 24) && atP(112, 32)) {
      console.log(
        `  gradients at the table's own pose: fold moves the wrist ` +
          `${Math.abs(grad(atP(104, 24), base, "above")).toFixed(2)} cm/° up, reach moves it ` +
          `${Math.abs((atP(112, 32).x - base.x) / 8).toFixed(2)} cm/° across`,
      );
    }
    for (const r of ranked.slice(0, 8)) {
      console.log(
        `    fold ${String(r.fold).padStart(3)}  reach ${String(r.reach).padStart(2)}   ` +
          `${r.above.toFixed(1)} cm over the deck · x ${r.x.toFixed(1)} · z ${r.z.toFixed(1)} · ` +
          `free ${r.freeAbove.toFixed(1)} · board came up ${r.lift.toFixed(1)}`,
      );
    }
    if (!ranked.length) {
      // Nothing in the window is a finding, not a crash: print the nearest
      // misses so the reason is on screen.
      const near = rows
        .map((r) => ({ ...r, cost: Math.abs(r.above - WANT_ABOVE) + r.rail }))
        .sort((a, b2) => a.cost - b2.cost)
        .slice(0, 6);
      for (const r of near) {
        console.log(
          `    (miss) fold ${r.fold} reach ${r.reach} → ${r.above.toFixed(1)} cm over, ` +
            `x ${r.x.toFixed(1)}, free ${r.freeAbove.toFixed(1)}, board up ${r.lift.toFixed(1)}`,
        );
      }
    }

    // A grid that finds nothing has only said something about the grid. So when
    // the sweep the last body needed comes back empty, the net is thrown over
    // the WHOLE space the shape has — the tuck as well — and the answer stops
    // being "not at these numbers" and becomes "not at any".
    if (!ranked.length) {
      const TUCK = Array.from({ length: 8 }, (_, i) => i * 8); // 0 → 56
      const wideFold = Array.from({ length: 18 }, (_, i) => i * 8); // 0 → 136
      const wideReach = Array.from({ length: 16 }, (_, i) => i * 4); // 0 → 60
      const t1 = Date.now();
      const all = sweep(b, wideFold, wideReach, TUCK);
      const won = pick(all);
      // TWO further conditions, and they are what separates a grab from a pose
      // that merely scores: the hand has to be on the TOE-side rail, which is
      // the one the other two bodies hook and the one the arm can reach without
      // crossing the deck; and the board has to have COME UP to him, which is
      // the whole mechanism (`Posture.tuck`) and is what `anim-check.mjs` holds
      // at 20 cm on rig 1.
      const real = won.filter((r) => r.x < 0 && r.lift >= 20);
      console.log(
        `\n  EVERY POSE THE SHAPE HAS: ${TUCK.length} tucks × ${wideFold.length} folds × ` +
          `${wideReach.length} reaches = ${all.length} poses in ${((Date.now() - t1) / 1000).toFixed(0)} s\n` +
          `    ${won.length} land the hand on A rail a few cm over the griptape, of which ` +
          `${real.length} are on the TOE-side rail with the board brought up 20 cm · ` +
          `the wrist's whole range over the deck is ${Math.min(...all.map((r) => r.above)).toFixed(1)} ` +
          `→ ${Math.max(...all.map((r) => r.above)).toFixed(1)} cm`,
      );
      for (const r of won.slice(0, 8)) {
        console.log(
          `    tuck ${String(r.tuck).padStart(2)}  fold ${String(r.fold).padStart(3)}  ` +
            `reach ${String(r.reach).padStart(2)}   ${r.above.toFixed(1)} cm over · x ` +
            `${r.x.toFixed(1)} · free ${r.freeAbove.toFixed(1)} · board came up ${r.lift.toFixed(1)}`,
        );
      }
      // The highest the wrist gets over the deck at all, wherever it is across
      // it — the ceiling this body's grab has, before any question about rails.
      const top = all.reduce((a, b2) => (b2.above > a.above ? b2 : a));
      console.log(
        `    ceiling: tuck ${top.tuck} fold ${top.fold} reach ${top.reach} → ` +
          `${top.above.toFixed(1)} cm over the deck at x ${top.x.toFixed(1)}, free hand ` +
          `${top.freeAbove.toFixed(1)}, board came up ${top.lift.toFixed(1)} cm`,
      );
    }
  }
}

// =============================================================================
// THE REST FRAME, which is upstream of every number above.
//
// `attachHandClip` says it out loud — "the clip must already be built on the
// same skeleton (matching bone names); nothing is retargeted here" — and it
// enforces the half of that it can see: 80% of tracks have to find a bone of
// their name. Names are not the whole of "the same skeleton". A track is a LOCAL
// quaternion that REPLACES the bone's bind rotation, so it only means what it
// meant on the rig it was authored on if this rig rests in the same frame. Two
// Meshy bipeds from the same generator, same `poseMode: a-pose`, same nominal
// 1.7 m, can rest 138° apart on the pelvis and still stand identically in bind,
// because the child offsets take the difference up.
//
// The reference is The Local: the ollie and the push were authored on his rig
// and the rolling stance and the crouch were extracted onto it.
console.log(`\nTHE REST FRAME  — can the hand-authored clips be played at this rig at all\n`);
const REST_BAR = 60;
const refRest = (await bindChain(BODIES.local.url)).rest;
const restWorst = {};
for (const id of RUN) {
  const { rest } = await bindChain(BODIES[id].url);
  const worst = restGap(rest, refRest);
  restWorst[id] = worst;
  console.log(
    `  ${BODIES[id].name.padEnd(15)} worst bone against the clips' own rig: ` +
      `${worst.name} ${worst.deg.toFixed(1)}°`,
  );
  check(
    `${BODIES[id].name}: rests in the frame the hand-authored clips were written in`,
    worst.deg < REST_BAR,
    `${worst.name} is ${worst.deg.toFixed(1)}° from The Local's, against a ${REST_BAR}° bar — ` +
      `a clip track is a local rotation REPLACING this one, so every degree here is a degree ` +
      `of pose the clip did not intend`,
    `The Runaway, measured: Spine02 138.6°, Hips 136.1°, both UpLegs 135°+ — and her rolling ` +
      `stance comes out with Spine02 6.4 cm BELOW her hips and her shoulder 82.4 cm over the ` +
      `soles against 121.2 on the retargeted compiled set`,
  );
}

// =============================================================================
// THE ROSTER, AS SHIPPED. Every body re-loaded through `SkaterAnim.create`'s own
// tweak path — the merge in that constructor is the read path this whole
// mechanism hangs off, and a sweep that only ever mutated the shared table would
// prove nothing about it.
console.log(`\nAS THE ROSTER SHIPS THEM  — every body through its own \`posture\` entry\n`);
const shipped = {};
for (const id of RUN) {
  const spec = BODIES[id];
  const b = await body(spec.url, spec.posture);
  shipped[id] = read(b.fly());
  const tweak = spec.posture
    ? Object.entries(spec.posture.Grab)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")
    : "no tweak — the table itself";
  console.log(`  ${spec.name.padEnd(15)} (${tweak})\n        ${line(shipped[id])}`);
}

console.log("");
for (const id of RUN) {
  const r = shipped[id];
  check(
    `${BODIES[id].name}: the grab hooks the toe-side rail, a few cm over the griptape`,
    r.above >= OK_ABOVE[0] &&
      r.above <= OK_ABOVE[1] &&
      Math.abs(Math.abs(r.x) - RAIL_X) <= OK_RAIL &&
      Math.abs(r.z) < TRUCK_Z + 4 &&
      r.freeAbove > 8,
    line(r),
    restWorst[id] && restWorst[id].deg >= REST_BAR
      ? `not a number this table can reach: the check above fails first, and 2,304 poses of ` +
        `tuck × fold × reach on this body put ZERO of them on the toe-side rail with the ` +
        `board brought up. Run \`--grid\` to watch it. The shared table with no correction ` +
        `measures ${bare[id].above.toFixed(1)} cm over the deck at x ${bare[id].x.toFixed(1)}`
      : `the same body run on the shared table with no correction: ` +
        `${bare[id].above.toFixed(1)} cm over the deck at x ${bare[id].x.toFixed(1)}, free hand ` +
        `${bare[id].freeAbove.toFixed(1)} — ` +
        (BODIES[id].posture
          ? `which is what the entry in \`main.ts\` is FOR`
          : `identical, because this body has no entry and is the table's own`),
  );
}

server.close();
console.log(`\n${pass}/${pass + fail} pass`);
