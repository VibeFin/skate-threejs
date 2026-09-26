# The gauntlet — how a critic gets real eyes

Read this before you judge anything. A critic that reads a builder's summary
has verified nothing.

## The dev server is already running

`http://localhost:5173/` — started by the director. Do NOT start your own.
Vite hot-reloads, so a file you just edited is live by the time you capture.
If the page 404s or the port is dead, say so in your report rather than
starting a second server.

## Capturing frames

```bash
node tools/shoot.mjs --out shots/<lane>/<what>.png --steps "<steps>"
```

Steps are comma-separated and run in order:

| step | does |
| --- | --- |
| `drop` | clicks DROP IN — **every run needs this first**, the sim is paused at the title |
| `wait <ms>` | let the game run |
| `hold <Code> <ms>` | keydown, wait, keyup |
| `down <Code>` / `up <Code>` | hold a key across other steps |
| `tap <Code>` | press + release (~60 ms) |
| `move <dx> <dy>` | mouse move (free-look) |
| `mdown <btn>` / `mup <btn>` | mouse buttons — `2` is right |
| `touch <x%> <y%> <ms>` / `swipe <x1%> <y1%> <x2%> <y2%> <ms>` | real touch points |
| `shot [label]` | capture a PNG |
| `burst <n> <ms>` | n frames <ms> apart — a filmstrip of one move |

Key codes: `KeyW` push · `Space` ollie (hold to wind up, release to pop) ·
`KeyA`/`KeyD` carve · `KeyS` brake/pivot · `KeyF`/`KeyG`/`KeyC` flips ·
`KeyX` grab · `ShiftLeft`/`KeyQ` manual/nose manual · `KeyR` reset ·
`Escape` pause. **Grinding needs no key** — ride onto a rail or a ledge along
its length and it takes you (2026-07-30, the player's own ask). `KeyE` held is
the one entry that still has to be asked for: the deck laid SQUARE across a
line, i.e. a boardslide taken by riding at the rail sideways.

Flags: `--size 1280x800` · `--mobile` (iPhone viewport + touch + DPR 3) ·
`--cpu 4` (4× CPU throttle — phone-class) · `--fps` (frame timings over the
run) · `--console` (page console + errors).

Worked examples:

```bash
# rolling down the main line
node tools/shoot.mjs --out shots/c1/line.png --steps "drop, hold KeyW 3500, shot"

# a filmstrip of a pop — take-off through landing
node tools/shoot.mjs --out shots/c1/ollie.png \
  --steps "drop, down KeyW, wait 2500, up KeyW, hold Space 400, burst 14 90"

# phone, throttled, with frame timings
node tools/shoot.mjs --mobile --cpu 4 --fps --out shots/c1/phone.png \
  --steps "drop, wait 1500, swipe 20 70 20 40 600, shot"
```

**Then LOOK at the PNG.** Read it with your image tool. A path in your report
that you did not open is not evidence.

## The numeric harnesses

These are the regression gates. Run the ones your lane touches; a red one you
caused is a finding against you.

```bash
node tools/turn-check.mjs          # stance / fakie / which way he rides
node tools/stance-check.mjs
node tools/switch-check.mjs
node tools/hold-check.mjs
node tools/integration-check.mjs   # the whole ride, 30/60/144 fps
node tools/ragdoll-drop.mjs        # the fall
npx tsc --noEmit                   # must stay clean
```

`integration-check` has 7 known-red items recorded in `DESIGN.md` (the wall
event's `undefined` payload, the quarter-pipe lip, the coasting band,
ollie-while-pushing). Several are on this run's work list and should END green.
Anything red beyond those seven is new and is yours.

**A new assertion does not count until it has been watched FAILING** against
deliberately broken code. This project has shipped 43/43 green over a broken
feature three separate times. Say in your report which break you watched each
new assertion fail against.

## The bar

- `bar/map2-speed/` — map 2's **shape and speed logic only**: a concrete flume
  running downhill between forested hillsides, banked transitions on both
  walls, ledges and blocks down the centre channel, obstacles placed to be hit
  while already fast. **Not** the art style, lighting, character, HUD, or level
  of photorealism — those are Skate 3 frames and this game is PS2-styled.
- `bar/UI/` — the interface's feel: all-caps condensed/stencil lettering, the
  combo string spelled out with `+` separators, trick names colour-coded
  (blue, gold) against white, the big score underneath, **no backing plates**.
- Everything else — map 1, the character, the look, the animations — has **no
  image bar deliberately**. Judge it against the written notes in `DESIGN.md`
  and the game's own art direction. **Do not source outside reference photos.**

## The art direction, in one paragraph

**PS2-era, not PS1-era.** Solid silhouettes, readable materials, real specular
and real lighting — then stylised *back* toward the era through
post-processing, not by throwing away geometry or texture resolution. If your
capture reads as PS1 — vertex wobble, 128px mud, empty flat untextured
surfaces — that is a **fail regardless of frame rate**.

## Reporting

Name the SINGLE biggest gap between what you captured and the bar. One gap,
concrete, with the capture that shows it. Do not write a to-do list; do not
prescribe an implementation. If two consecutive rounds on a piece find nothing
new, that piece is dry and you say so.
