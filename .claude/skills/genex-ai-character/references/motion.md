# Custom animations with `genex motion` — the full procedure

Text → raw motion takes on the platform GPU service → objective verify →
YOUR pick → local compile → a rig-independent set the vendored runtime plays
on any humanoid. The skeleton is a 27-joint humanoid core at 20 fps; takes
arrive as `.npz` files plus a machine verify report. Everything after `gen`
runs locally and free — regenerate compiled sets as often as you like.

**Rig limits (say them to the user before promising a move):** biped,
human-proportioned characters only. Rigs without finger bones (many Meshy
characters) cannot curl fingers around a grip — prefer weapon-carry looks
that read well with flat hands there, or use a rig with fingers for hero
characters. Takes are 2–10 seconds.

## The loop

```bash
# 1. Generate (bills per take, default 4; ALWAYS --no-wait — jobs run minutes)
npx genex motion gen "soldier rifle low-ready idle, fully upright, head held high" --takes 4 --no-wait
npx genex wait <id>                       # prints one URL per take + the report

# 2. Download the takes it printed and RENAME them — filenames drive everything
mkdir -p takes && curl -o takes/rifle-idle.npz "<take-url>"

# 3. Verify locally (same math the service ran; free, reproducible)
npx genex motion verify takes/

# 4. Pick the takes whose MOTION reads right (the report is data, not taste),
#    then compile the set
npx genex motion compile takes/ --out src/motion/rifle.json

# 5. Vendor the runtime once per game (+ the proven rifle starter set)
npx genex motion install --set rifle
```

## Take naming — the routing contract

`verify` and `compile` classify each take by its FILENAME stem. Rename
downloaded takes before running them:

| Stem pattern | Compiles into |
|---|---|
| `<set>-run-forward` / `-back` | `forward` / `back` gait |
| `<set>-strafe-left` / `-strafe-right` | `strafeLeft` / `strafeRight` |
| `<set>-run-fl` / `-fr` / `-bl` / `-br` | the four diagonal gaits |
| `<set>-idle` or `…stance…` | the `idle` loop |
| `…jump…` (`jump-stand`, `jump-run`) | `jumpStand` / `jumpRun` one-shots |
| anything else | a named freeform loop |

A stem containing `aim`, `rifle`, or `pistol` marks the take as a WEAPON
HOLD: verify adds the hold-shape gates, and compile grip-line-normalizes the
idle (the whole body blades as one) and plucks `aim0`/`aim0Up`/`aim0Dn`
upper-body mask poses from the hold takes.

## The prompt wording ladder (hard-won — wrong words cost paid takes)

- **Never ask for "sights" or a "cheek weld"** — you get a hunched
  face-height hold that reads absurd on game rigs. Ask for the third-person
  hold: *"weapon at chest height, arms extended"*, *"low-ready"* as the
  fallback.
- **Always add "fully upright, head held high"** — the model's prior slouches.
- **Describe hand geometry literally** (*"left hand forward on the handguard,
  right hand at the grip"*), not by weapon jargon.
- The model NEVER squares a two-handed hold to the pelvis — real marksmen
  blade, and compile normalizes the heading by the grip line. Do not fight
  it with prompt words; it is not a defect.
- **Gaits need constraints, not prose.** Direction words alone drift; pin
  the trajectory:

```bash
npx genex motion constraints --dir strafe-left --speed 2.5 --duration 5 --out strafe-left.json
npx genex motion gen "soldier strafing with a rifle at low-ready" --constraints strafe-left.json --no-wait
```

The constraint pins the root path AND the heading (facing stays +Z) — that
pin is what makes a strafe a strafe. One direction per request; a full
8-direction set is 8 requests + one idle (run them in parallel with
`--no-wait`, like any batch).

## Verify semantics

`PASS` (≥70) / `WARN` (≥50) / `FAIL`, with a hard-zero cap: a zero on any
load-bearing gate fails the take no matter the average. The reasons column
names the defect in plain words (feet skate, grip line wanders, cheek weld…).
The report is DATA — freeform verbs have no semantic gate, so watch the take
on the rig before shipping it. Tune bands via `--gates gates.json` (partial
JSON, deep-merged: `{"aim": {"hunch": {"bad": 25}}}`).

## Compile semantics + tunables

Compile cuts loop cycles at left-foot strikes (gaits) or the best seam window
(idles), removes the linear trajectory (residual sway + full Y bob stay),
normalizes heading to +Z, phase-aligns gaits (frame 0 = left strike), and for
weapon holds levels the arm assembly, raises the gaze, clamps tall stances,
and yaws mask poses in the SPINE. All rigid whole-body/assembly operations —
no joint ever moves relative to another (the no-bake law; it is why compiled
sets survive retargeting). Every threshold lives in
`src/motion/motion.config.json` after install — pass `--config` to use it.

## Wiring the runtime

`genex motion install` puts the runtime IN YOUR GAME — `src/motion/rigs.js`
(both retarget formulas + the load-time normalizations), `anim-runtime.js`
(ClipSet/Animator/dir8Weights/aimMaskStep), `ik.js`, and the config. They are
yours: read them, tune them, the comments explain every formula. Load order
matters:

```js
import { loadRig, captureRestAnkle, reanchorFeet, groundCalibrate, curlFingers } from "./motion/rigs.js";
import { ClipSet, Animator, dir8Weights, aimMaskStep } from "./motion/anim-runtime.js";

const set = await (await fetch("./motion-sets/rifle.json")).json(); // copy sets where your bundler serves them
const rig = await loadRig("./assets/character.glb", set, modelFrame); // GLB or VRM — auto-detected
rig.computeCorrection();
const restAnkle = captureRestAnkle(rig, scene);   // BIND pose, before any clip
reanchorFeet(rig, set, scene);                    // steep-boot fix — BEFORE ClipSet
const clipSet = new ClipSet(rig, set, set.gaits);
groundCalibrate(rig, clipSet, scene, restAnkle);  // short-leg fix — AFTER ClipSet
curlFingers(rig, scene);                          // grips (no-op on finger-less rigs)
const anim = new Animator(clipSet);

// per frame: your input → blend weights; the mask follows the COMMAND magnitude
anim.setLoops({ idle: 1 - mag, ...dir8Weights(x, z, mag) }, dt);
maskW = aimMaskStep(maskW, { mag, grounded, pitch, dt });
anim.setMask("aim0", maskW, pitch / 0.6);         // ±40° at pitch extremes
anim.update(dt);
```

- Physics owns the world transform: hips play LOCAL values only (residual
  x/z + absolute y); your character root carries position + yaw.
- Jumps: `anim.playOneShot("jumpRun", { yCap: 0.1 })` — cap hips Y when the
  physics capsule owns the jump, and gate the impulse on the clip's own
  takeoff frame. The `--set rifle` install includes the shared jumps set;
  merge it: `Object.assign(clipSet.tracks, new ClipSet(rig, jumps, jumps.gaits).tracks)`.
- The aim mask WINS over one-shots on masked bones — a jump keeps aiming.
- Standing aim = the UNMASKED bladed idle; the spine-yawed mask pose is only
  for moving/airborne/pitched states. `aimMaskStep` already encodes this.

## Cost + discipline

Per-take billing (a 4-take request ≈ one model generation). One regenerate
per verb is a fair budget when takes fail the gates — reword with the ladder
above before spending again, and compare candidates from ONE batch first
(that is what `--takes 4` is for). Never re-run `motion gen` to "pick up" a
result — `genex wait <id>` re-attaches free.
