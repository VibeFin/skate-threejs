// THE INPUT MATRIX — every order and every release of the keys that argue.
//
// Two of this round's asks are about which key wins when two are down, and
// neither can be checked by pressing them once: the answer depends on which
// arrived SECOND and on which comes up first afterwards, so the only honest
// test is the whole matrix, driven through the REAL `SkateInputSource` with
// real key events and read off the REAL `SkateModel`.
//
//   · **push vs the pop** (`SkateInput.chargeHeld` / `olliePressed`). The
//     player: press W and hold Space and, while W is still down, the push must
//     not fire again — Space wins; but hold Space FIRST and then press push and
//     the jump is called off. Two rules about the same two keys, decided by
//     which one arrived second.
//   · **the slide key** (`SkateInput.slideHeld`), and this half has now been the
//     player's ask in BOTH directions, which is why the checks read the way they
//     do. Milestone 12: *"a separate button to turn sliding on, so he doesn't
//     automatically go along rails — it's my choice, on a button."* Then, having
//     ridden it: *"let's make rail sliding activate when I simply ride onto it,
//     without holding a button. As soon as you ride onto it, the rail slide
//     starts."* So the same 36 approaches that used to prove no rail takes him
//     without the key now prove every rail takes him without it, the key is
//     measured for NOT changing that, and what E still buys is the one entry
//     riding onto a line cannot ask for — the deck square across it. Every rule
//     the catch already had has to still be there either way, which is the block
//     at the bottom.
//
// Run: node --experimental-strip-types tools/input-matrix.mjs
//
// Every case here runs at 30, 60 and 144 fps, because both of these are EDGE
// rules — "the frame the key went down" — and an edge read at three frame rates
// is the cheapest way to catch one that has quietly become a level.

import { register } from "node:module";
import * as THREE from "three";

register(new URL("./ts-resolve.mjs", import.meta.url));
// …and directory specifiers on top of it, because `ts-resolve.mjs` only tries
// `<spec>.ts`: `spot.ts` imports `./procedural`, which is `./procedural/index.ts`,
// and without this every harness in this repo stops at the import. Registered
// as a SECOND hook rather than by editing the shared resolver, which is another
// lane's file — hooks chain, the most recent runs first, and this one falls
// straight through to `ts-resolve` for everything it does not recognise.
register(
  "data:text/javascript," +
    encodeURIComponent(`
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
export async function resolve(spec, ctx, next) {
  if (spec.startsWith(".") && path.extname(spec) === "" && ctx.parentURL) {
    const base = path.dirname(fileURLToPath(ctx.parentURL));
    const index = path.resolve(base, spec, "index.ts");
    if (existsSync(index)) return next(pathToFileURL(index).href, ctx);
  }
  return next(spec, ctx);
}
`),
);

const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { SkateInputSource } = await import("../src/skate/input.ts");
const { STREET_SPOT, RAILS } = await import("../src/world/spot.ts");

const RATES = [30, 60, 144];

const results = [];
const check = (name, pass, detail, proof) => {
  results.push({ name, pass, detail, proof: proof ?? null });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}` +
      (proof ? "" : "   [UNPROVEN — never watched failing]"),
  );
};

/**
 * A pair of hands on a real keyboard, feeding the real input source — the same
 * idiom `tools/integration-check.mjs` uses, and for the same reason: an input
 * object written by hand can hold a combination no hand can produce, and this
 * whole file is about combinations hands produce.
 */
function hands(dt) {
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
  src.consume(dt); // the loop was already running when the hands arrived

  const down = new Set();
  const fire = (type, code) =>
    listeners[type]?.forEach((f) => f({ code, repeat: false, preventDefault() {} }));
  return (hold) => {
    const want = new Set(hold);
    for (const code of [...down])
      if (!want.has(code)) {
        fire("keyup", code);
        down.delete(code);
      }
    for (const code of want)
      if (!down.has(code)) {
        fire("keydown", code);
        down.add(code);
      }
    return src.consume(dt);
  };
}

/**
 * Roll along the flat plaza on the south terrace holding a scripted key
 * pattern, and report what the ride was told.
 *
 * `script(i, t)` returns the codes down on frame `i`. The terrace is chosen
 * because it is the one large piece of dead-flat ground in the spot with
 * nothing on it — a case about two keys must not be able to fail on a kerb.
 */
function drive(fps, seconds, script) {
  const dt = 1 / fps;
  const keys = hands(dt);
  const pushes = [];
  let pops = 0;
  const model = new SkateModel(
    {
      onPush: () => pushes.push(model.position.clone()),
      onPop: () => pops++,
    },
    STREET_SPOT,
  );
  model.position.set(-18, STREET_SPOT.height(-18, -24), -24);
  model.heading = Math.PI / 2;
  const n = Math.round(seconds / dt);
  const charge = [];
  for (let i = 0; i < n; i++) {
    const input = keys(script(i, i * dt));
    charge.push(input.chargeHeld);
    model.update(input, dt);
  }
  return { pushes: pushes.length, pops, speed: model.speed, charging: charge.filter(Boolean).length };
}

/** A script from a list of `[seconds, codes]` spans — easier to read than frames. */
const spans = (list) => (_i, t) => {
  for (const [until, codes] of list) if (t < until) return codes;
  return [];
};

console.log("--- item 8: the push and the pop, both orders, both releases ---\n");

// PUSH_INTERVAL is 0.85 s, so three seconds of an unopposed throttle is three
// or four kicks. Anything that suppresses the repeat shows up as ONE.
{
  const plain = RATES.map((fps) => drive(fps, 3, spans([[3, ["KeyW"]]])));
  check(
    "W on its own keeps kicking",
    plain.every((r) => r.pushes >= 3 && r.pops === 0),
    RATES.map((fps, i) => `${fps}fps ${plain[i].pushes} kicks, ${plain[i].speed.toFixed(1)} m/s`).join(" · "),
    "src/skate/input.ts — latch `pushLocked` on `pushStarted` instead of on Space going down — 0 kicks and 0.0 m/s at every rate: the push key locks itself out",
  );

  // ORDER A — the push is already down and Space arrives on top of it.
  // Space wins: the wind-up survives all the way to the pop, and the kicks stop
  // until the push key comes up.
  const a = RATES.map((fps) =>
    drive(fps, 3, spans([
      [0.2, ["KeyW"]],
      [2.6, ["KeyW", "Space"]],
      [3, ["KeyW"]],
    ])),
  );
  check(
    "W first, then Space: the pop survives",
    a.every((r) => r.pops === 1),
    RATES.map((fps, i) => `${fps}fps ${a[i].pops} pop`).join(" · "),
    "src/skate/input.ts — spend the wind-up whenever the push key is merely DOWN (`(pushDown || flicked) && winding`, the pre-round-5 bug) — 0 pops at every rate",
  );
  check(
    "…and the push holds off while SPACE is down, then comes back when it is up",
    // TWO kicks, and which two is the whole rule. One in the 0.2 s before Space
    // arrived. Then nothing for the 2.4 s Space is held — an unopposed W would
    // have paid out seven intervals in there — and one more in the 0.4 s after
    // Space comes up at 2.6 s.
    //
    // This assertion used to read `pushes === 1`: no kick for the rest of the
    // run, full stop. That was the bug the player reported on 2026-07-29 —
    // "when I'm riding and press push, then jump, without releasing W, after I
    // land the character stops moving and doesn't keep pushing". The latch was
    // waiting on a key he was never going to let go of. The rule is a tie-break
    // between two keys held AT ONCE, so it ends when they are not both held.
    a.every((r) => r.pushes === 2),
    RATES.map((fps, i) => `${fps}fps ${a[i].pushes} kicks in 3 s — one before Space, one after it came up (an unopposed W gives ${plain[i].pushes})`).join(" · "),
    "src/skate/input.ts — end `pushLocked` only on the PUSH key coming up — 1 kick at every rate: the push never returns, which is the reported bug",
  );

  // …and the OTHER release: let W up first, with Space still held. The lock is
  // held until the push key comes up, which is the player's own wording, so
  // this is the case that says when it ends.
  const aRelease = RATES.map((fps) =>
    drive(fps, 3, spans([
      [0.2, ["KeyW"]],
      [1.0, ["KeyW", "Space"]],
      [1.1, ["Space"]],
      [2.8, ["KeyW", "Space"]],
      [3, ["KeyW"]],
    ])),
  );
  check(
    "…and letting W up is what ends the lock — pressing it again kicks",
    // The second W press is a `pushStarted` with Space already held, which is
    // rule (b): it spends the wind-up. So this case kicks AND loses the pop,
    // and that is the whole point of the pair.
    aRelease.every((r) => r.pushes >= 2 && r.pops === 0),
    RATES.map((fps, i) => `${fps}fps ${aRelease[i].pushes} kicks, ${aRelease[i].pops} pops`).join(" · "),
    "src/skate/input.ts — stop spending the wind-up on a push (`if (flicked && windingWas)`) — 1 pop at every rate out of a crouch the second W press had already called off",
  );

  // ORDER B — Space is already down and the push arrives on top of IT. The
  // player's older rule, unchanged: you cannot kick and pop off the same foot,
  // and reaching for speed mid-crouch means the speed.
  const b = RATES.map((fps) =>
    drive(fps, 3, spans([
      [0.2, ["Space"]],
      [2.6, ["Space", "KeyW"]],
      [3, ["KeyW"]],
    ])),
  );
  check(
    "Space first, then W: the jump is called off",
    b.every((r) => r.pops === 0),
    RATES.map((fps, i) => `${fps}fps ${b[i].pops} pops, ${b[i].pushes} kicks, ${b[i].speed.toFixed(1)} m/s`).join(" · "),
    "src/skate/input.ts — stop spending the wind-up on a push (`if (flicked && windingWas)`) — 1 pop at every rate off a crouch the player had already abandoned",
  );
  check(
    "…and it is the PUSH he gets instead",
    b.every((r) => r.pushes >= 2 && r.speed > 4),
    RATES.map((fps, i) => `${fps}fps ${b[i].pushes} kicks → ${b[i].speed.toFixed(1)} m/s`).join(" · "),
    "src/skate/input.ts — read both rules against the keys as they are NOW (`winding && pushDown`) — 0 kicks and 0.0 m/s: the crouch he is standing in locks the key he just reached for",
  );
  // …and the other release for that order too: Space up first, W still down.
  const bRelease = RATES.map((fps) =>
    drive(fps, 3, spans([
      [0.2, ["Space"]],
      [1.0, ["Space", "KeyW"]],
      [3, ["KeyW"]],
    ])),
  );
  check(
    "…and letting Space up first still pops nothing",
    bRelease.every((r) => r.pops === 0 && r.pushes >= 2),
    RATES.map((fps, i) => `${fps}fps ${bRelease[i].pops} pops, ${bRelease[i].pushes} kicks`).join(" · "),
    "src/skate/input.ts — stop spending the wind-up on a push — 1 pop at every rate",
  );

  // BOTH IN ONE FRAME is neither order, and it is left alone: nothing arrived
  // second, so he pushes and he can still pop. Without this the two rules meet
  // in the middle and whichever line runs first silently wins.
  const together = RATES.map((fps) =>
    drive(fps, 3, spans([
      [2.6, ["KeyW", "Space"]],
      [3, []],
    ])),
  );
  check(
    "both keys down on ONE frame is neither rule",
    together.every((r) => r.pops === 1 && r.pushes >= 2),
    RATES.map((fps, i) => `${fps}fps ${together[i].pushes} kicks and ${together[i].pops} pop`).join(" · "),
    "src/skate/input.ts — read both rules against the keys as they are NOW (`winding` / `winding && pushDown`) — 0 kicks and 0 pops at every rate: the two rules fire on each other",
  );

  const alone = RATES.map((fps) => drive(fps, 1.5, spans([[1.2, ["Space"]], [1.5, []]])));
  check(
    "Space on its own still pops",
    alone.every((r) => r.pops === 1 && r.charging > 0),
    RATES.map((fps, i) => `${fps}fps ${alone[i].pops} pop after ${alone[i].charging} frames of wind-up`).join(" · "),
    "src/skate/input.ts — spend the wind-up on the crouch itself (`if (winding) chargeSpent = true`) — 0 pops after 0 frames of wind-up at every rate",
  );
}

console.log("\n--- item 12: the slide key ---\n");

// The approach every case here uses: line up on a rail, ollie at it, and see
// what the ride does. Copied from `integration-check`'s own rail recipe rather
// than invented, so a catch that works there works here.
//
// `opts.across` swings the whole approach 90° round, which is the one entry the
// key still owns — see the block below and `SkateModel.tryCatchGrind`. Aimed at
// the MIDDLE of the line rather than its head, because a square approach to a
// head misses the line by however far back the run-up started.
function atRail(id, v, fps, hold, opts = {}) {
  const dt = 1 / fps;
  const line = RAILS.find((r) => r.id === id);
  const keys = hands(dt);
  const events = [];
  const model = new SkateModel(
    {
      onGrindStart: (kind) => events.push(`grind:${kind}`),
      onGrindEnd: (bailed) => events.push(bailed ? "grind-lost" : "grind-out"),
      onBail: () => events.push("bail"),
    },
    STREET_SPOT,
  );
  const axis = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
  const heading = opts.across ? axis + Math.PI / 2 : axis;
  const back = opts.lead ?? 1.6;
  const from = opts.across ? line.a.clone().lerp(line.b, 0.4) : line.a;
  const x = from.x - Math.sin(heading) * back;
  const z = from.z - Math.cos(heading) * back;
  model.position.set(x, STREET_SPOT.height(x, z), z);
  model.heading = heading;
  model.speed = v;
  const n = Math.round((opts.seconds ?? 1.6) / dt);
  let onLine = 0;
  for (let i = 0; i < n; i++) {
    model.update(keys(hold(i, i * dt)), dt);
    if (model.state === "grind") onLine++;
  }
  return { events, onLine, state: model.state, speed: model.speed };
}

/** Space down for two frames then up — the only ollie a player can make. */
const popThen = (extra) => (i) => (i < 2 ? ["Space", ...extra] : [...extra]);

{
  const speeds = [6, 8, 10, 12];
  const lines = ["flat-bar", "handrail-6", "ledge-long-e"];
  const tally = (extra) => {
    let caught = 0;
    let total = 0;
    let bails = 0;
    for (const fps of RATES)
      for (const id of lines)
        for (const v of speeds) {
          const r = atRail(id, v, fps, popThen(extra));
          total++;
          if (r.events.some((e) => e.startsWith("grind:"))) caught++;
          if (r.events.includes("bail")) bails++;
        }
    return { caught, total, bails };
  };
  const off = tally([]);
  const on = tally(["KeyE"]);
  // THE CONTRACT TURNED OVER ON 2026-07-30, and these two checks turned with it.
  // They read "no rail and no ledge takes him without the slide key" and "…and
  // holding Shift is what takes him" — the milestone-12 rule, and the player has
  // since asked for its opposite in his own words: *"let's make rail sliding
  // activate when I simply ride onto it, without holding a button. As soon as you
  // ride onto it, the rail slide starts."* So the same 36 approaches are measured
  // the other way up, and the second one is now the stronger statement of the
  // two: the key is not a gate at all, so holding it must not change the number.
  check(
    "every rail and every ledge takes him with NOTHING held",
    off.caught === off.total && off.bails === 0,
    `${off.caught}/${off.total} approaches locked on with nothing held, ${off.bails} of them ending on the concrete — three lines, 6/8/10/12 m/s, 30/60/144 fps`,
    "src/skate/skate-model.ts `tryCatchGrind` — the milestone-12 gate put back " +
      "(`if (!this.slideWanted) return false`) — 0/36 lock on",
  );
  check(
    "…and E is not a gate any more — holding it changes nothing about that",
    on.caught === off.caught,
    `${on.caught}/${on.total} with E held against ${off.caught}/${off.total} with nothing`,
    "src/skate/skate-model.ts `tryCatchGrind` — the milestone-12 gate put back — 36/36 held " +
      "against 0/36 with nothing, which is the whole of the player's complaint",
  );
  {
    // Across the bar rather than down it, Shift up: the fence he did not ask to
    // grind is still a fence. Measured as "did he reach the far side", which is
    // the only thing a player can see.
    const crossed = [];
    for (const id of ["flat-bar", "handrail-6", "handrail-3"]) {
      const line = RAILS.find((r) => r.id === id);
      const axis = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
      for (const fps of RATES) {
        for (const v of [8, 14]) {
          const dt = 1 / fps;
          // Square across the middle of the bar, from 5 m out.
          const heading = axis + Math.PI / 2;
          const mx = (line.a.x + line.b.x) / 2;
          const mz = (line.a.z + line.b.z) / 2;
          const sx = mx - Math.sin(heading) * 5;
          const sz = mz - Math.cos(heading) * 5;
          const model = new SkateModel({}, STREET_SPOT);
          model.position.set(sx, STREET_SPOT.height(sx, sz), sz);
          model.heading = heading;
          model.speed = v;
          const keys = hands(dt);
          for (let i = 0; i < Math.round(2.2 / dt); i++) model.update(keys([]), dt);
          // Which side of the bar's line he ended on, signed along the approach.
          const side =
            (model.position.x - mx) * Math.sin(heading) + (model.position.z - mz) * Math.cos(heading);
          if (side > 0) crossed.push(`${id}@${v}m/s ${fps}fps out the far side by ${side.toFixed(2)} m`);
        }
      }
    }
    check(
      "…but the bar he declined is still steel — nobody rides through one",
      crossed.length === 0,
      crossed.length
        ? `${crossed.length}/18 got past: ${crossed.slice(0, 6).join(" · ")}`
        : "0/18 approaches reached the far side — three bars taken square across the middle, 8 and 14 m/s, 30/60/144 fps, nothing held throughout",
      "src/skate/skate-model.ts `advanceStep` — the `steelStep` line removed, which is the game as the player reported it — 18/18 got past: flat-bar@8m/s 30fps out the far side by 3.16 m, handrail-6 by 3.24 m, handrail-3 by 3.15 m, and the same at every speed and rate",
    );
  }
  // WHAT THE KEY IS FOR NOW, and it is the one entry riding onto a line cannot
  // ask for: the deck laid SQUARE across it. Coming at a bar sideways and popping
  // over is how you boardslide in this game (`settleAngle` lays the deck across
  // the line) and it is also how you hop the thing on the way somewhere else —
  // the same approach, the same arc and the same frame, so no geometry separates
  // them and only the player can. Measured on `tools/grind-auto.mjs`: 165 of 1432
  // such hops lock on when nothing refuses them.
  {
    const across = (extra) => {
      let caught = 0;
      let total = 0;
      for (const fps of RATES)
        for (const id of ["flat-bar", "handrail-3"])
          for (const v of [6, 8]) {
            // 0.8 s of run-up: an ollie is 1.57 m over 0.86 s, so a square
            // crossing has to be popped a whole hang time out or it sails over.
            const r = atRail(id, v, fps, popThen(extra), { across: true, lead: v * 0.8, seconds: 2 });
            total++;
            if (r.events.some((e) => e.startsWith("grind:"))) caught++;
          }
      return { caught, total };
    };
    const bare = across([]);
    const asked = across(["KeyE"]);
    check(
      "…but a line taken SQUARE across still waits to be asked, and E is the asking",
      bare.caught === 0 && asked.caught > 0,
      `square across: ${bare.caught}/${bare.total} with nothing held, ${asked.caught}/${asked.total} with E — flat-bar and handrail-3, 6/8 m/s, 30/60/144 fps`,
      "src/skate/skate-model.ts `tryCatchGrind` — the square gate deleted " +
        "(`if (this.grind.squareEntry && !this.slideWanted) return false`) — 12/12 lock on with " +
        "nothing held, i.e. hopping the bar boardslides it",
    );
  }
}

// The three rules the catch already had, all of them measured WITH the key held
// — the stronger reading, since a rule that survives the key surviving is a rule
// that survives the automatic entry too. This is the half of the ask that was
// never "add a button" or "take one away": neither may become a way round the
// rules the earlier rounds put in.
{
  // 1. A rail is a LANDING SURFACE — it takes him on the way down.
  const down = RATES.map((fps) => atRail("flat-bar", 10, fps, popThen(["KeyE"])));
  check(
    "with E held, a rail is still a landing surface",
    down.every((r) => r.events.some((e) => e.startsWith("grind:")) && r.onLine > 3),
    RATES.map((fps, i) => `${fps}fps ${down[i].events.join(",") || "nothing"} (${down[i].onLine} frames on the line)`).join(" · "),
    "src/skate/skate-model.ts `tryCatchGrind` — `return false` unconditionally — nothing at any rate, 0 frames on the line",
  );

  // 2. …and it DECLINES on a rising frame. The handrail sits 1.15 m up at its
  //    top end and is reached by rising to it off the platform, so a catch here
  //    at all is the round-5 rule still working.
  const rising = [4, 8, 12].map((v) =>
    RATES.map((fps) => atRail("handrail-6", v, fps, popThen(["KeyE"]))),
  );
  const risingCaught = rising.flat().filter((r) => r.events.some((e) => e.startsWith("grind:"))).length;
  check(
    "…and an ollie that RISES to a handrail still catches it",
    risingCaught === rising.flat().length,
    `${risingCaught}/${rising.flat().length} — 4/8/12 m/s at 30/60/144 fps`,
    "src/skate/skate-model.ts `flight()` — ask the Grinder only while `vy <= 0` — 3/9, which is the bug round 5 fixed and this button could have re-introduced",
  );

  // 3. …and `flip < 1` still puts him down. A kickflip flicked at the rail with
  //    no room to come round is a bail, key held or not — the button decides
  //    whether a rail may ask, never what it answers.
  // Popped 6 m out so he is on the way DOWN when the trucks arrive — a rising
  // board is refused by the rule above and would never reach this question —
  // and the deck flicked at 0.42 s, so `FLIP_TIME` still has 0.4 s to run when
  // he gets there. Timed in seconds, not frames, or the flick lands in a
  // different part of the arc at each rate.
  const flipped = RATES.map((fps) =>
    atRail("flat-bar", 10, fps, (_i, t) =>
      t < 0.05 ? ["Space", "KeyE"] : t >= 0.42 && t < 0.47 ? ["KeyE", "KeyF"] : ["KeyE"],
    { lead: 6, seconds: 2.2 }),
  );
  check(
    "…and a deck still coming round is still a bail, not a free grind",
    flipped.every((r) => r.events.includes("bail") && !r.events.some((e) => e.startsWith("grind:"))),
    RATES.map((fps, i) => `${fps}fps ${flipped[i].events.join(",") || "nothing"}`).join(" · "),
    "src/skate/skate-model.ts `tryCatchGrind` — delete the `flipWas` test — 3/3 grind clean off a kickflip that never came round",
  );

  // 4. Letting GO of it mid-grind is not a bail. The ask was for a choice about
  //    getting ON, and a key release that threw him off a line he is balanced
  //    on would be a different game.
  const dropped = RATES.map((fps) =>
    atRail("flat-bar", 10, fps, (i) => (i < 2 ? ["Space", "KeyE"] : i < 40 ? ["KeyE"] : []), {
      seconds: 2.2,
    }),
  );
  check(
    "…and letting go of it mid-grind does not throw him off",
    dropped.every((r) => !r.events.includes("grind-lost") && !r.events.includes("bail")),
    RATES.map((fps, i) => `${fps}fps ${dropped[i].events.join(",")} (${dropped[i].onLine} frames on the line)`).join(" · "),
    "src/skate/skate-model.ts `updateGrind` — add `if (!this.slideWanted) { endGrind(true); enterRagdoll(); }` — grind-lost,bail at 60 and 144 fps",
  );
}

void THREE;

const failed = results.filter((r) => !r.pass);
const unproven = results.filter((r) => !r.proof);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log(`FAILED: ${failed.map((f) => f.name).join(" · ")}`);
console.log(
  `${results.length - unproven.length}/${results.length} watched failing against deliberately broken code`,
);
process.exitCode = failed.length ? 1 : 0;
