# skate

A PS2-era street skating game in [Three.js](https://threejs.org/). One city block
— plaza, quarter pipe, ledges, rails, a bank along the north wall — at golden
hour, with a full trick vocabulary and a physical bail.

**▶ Play: https://genex.games/world/skate**

```
W A S D   ride            SPACE   hold to charge an ollie
F G C     kick / heel / shove-it  X   hold to grab
SHIFT     manual          E       hold to slide across
A D       balance         R       reset      ESC   pause
```

Everything you see was generated — models, textures, the sky, the character, the
animations, the sound — through the [Genex](https://www.npmjs.com/package/@genex-ai/cli-demo)
CLI. The game loads them from asset storage at runtime, so this repository is
code and configuration rather than a pile of art.

## Running it

```bash
npm install
npm run dev
```

The generated assets stream from the CDN, so the first boot pulls a few hundred
megabytes and can take a minute. `npx genex preview` builds and deploys.

## What is worth reading

**[`DESIGN.md`](DESIGN.md)** is the design contract *and* the build log, and it is
the most useful file here. Every decision carries the measurement that settled
it — including the wrong ones, kept next to the evidence that killed them. If you
only open one file, open that one.

**[`src/world/spot.ts`](src/world/spot.ts)** derives the entire skate spot from a
written brief: every angle, radius and transition falls out of stated constraints
rather than being typed in. It argues with itself in prose wherever a number was
hard-won, which is most of them.

**[`src/skate/`](src/skate/)** is the ride — the board model, the trick state
machine, the grind and manual balance, and a ragdoll that takes the bails.

**[`src/controllers/quality/`](src/controllers/quality/)** is the device ladder.
Phones boot conservatively, a governor steps quality from measured frames rather
than from a device name, and generated assets load through downscale rungs. A
phone holds ~86 MB of texture memory against a desktop's ~1.7 GB.

**[`tools/`](tools/)** is the review kit, and it is deliberately outside the game.
These harnesses drive the real build in a real browser through the same DOM a
player uses — clicking the actual button, pressing actual keys, then looking at
the actual pixels. There are no debug hooks, test modes or hidden flags in the
game itself. A critic that reads a builder's summary has verified nothing.

## Layout

```
src/
  main.ts               boot: identity, tier, renderer, the loop
  skate/                the ride — physics, tricks, balance, bails
  world/                the spot, its dressing, the sky, the light rig
  render/               the post chain: AO, bloom, grade, metering
  motion/               rigs, clips, retargeting
  ui/                   menu, HUD, settings, touch controls
  controllers/          vendored Genex kits (quality, character, touch)
tools/                  review harnesses — never shipped
public/                 the KTX2 transcoder and a few static files
```
