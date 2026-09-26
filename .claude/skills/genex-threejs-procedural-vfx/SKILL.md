---
name: genex-threejs-procedural-vfx
description: Author procedural real-time VFX for Genex Three.js games, and decide WHERE effects belong — walk the game's moments one by one, the way the visual-direction gate walks its surfaces. Use for particles, trails, plasma, sparks, shockwaves, impacts, dissolving debris, ability effects, reentry wakes, event-timed visuals, effect pools, HDR emission hierarchy, and gameplay-readable spectacle.
---

# Genex Three.js Procedural VFX

Build effects from an event envelope, motion field, geometry representation, and shading response. Avoid independent particle emitters that happen to share a color.

## The moment gate — run this BEFORE writing any effect code

The visual-direction gate walks **surfaces** and asks "texture or shader?" for
each. It cannot see effects, because effects don't live on surfaces — they live
on **moments**. So walk the moments the same way, and decide each one.

List every moment the game's own rules fire. Take them from the game's controls
and contract, not from imagination — a bomb detonates, a crate breaks, a pickup
is collected, a player dies, a round starts, a shot lands. Then judge each:

> **Does the world change here in a way the player should SEE, and does the
> existing feedback already say it?**

Three answers, all legitimate, one forbidden:

- **Effect earns it** — the moment has a cause the player made and a consequence
  they must read, and nothing else is carrying it. Build it.
- **Already covered** — a flash, a sound, hitstop, a decal, or an animation
  already lands the beat. Adding particles buys nothing but fill rate. **Say so
  in one line and move on.**
- **Deliberately bare** — the look wants restraint. Valid. **Say so in one line.**
- **Not deciding** — the only wrong answer. A game where bombs detonate and the
  world does not react is not a style choice, it's an unfinished list.

Then check the inverse, because the failure runs both ways: **an effect on a
moment the player didn't cause and can't read is noise.** Ambient particles are
the usual offender — they sell mood, not information. Budget **one** ambient
layer for the whole scene, and only if the scene is visibly dead at rest.

**Shape is part of this gate.** For a moment made of energy — fire, a blast, a
shockwave — the question is never "what texture goes on this box?" It is "what
is this energy shaped like?" A shipped game reasoned "the flame is deliberately
untextured — it is pure emissive energy" and left a **cube** standing in for
fire. That sentence answers the surface gate correctly and the moment gate not at
all. If a primitive is standing in for an effect, it is a placeholder, whatever
the comment says.

## Particles do not render round by default

`new THREE.PointsMaterial({ size, color })` draws every point as a **hard-edged
camera-facing square**. There is no soft falloff, no roundness, no fade — those
are things you add. Shipping the default is the "square flying things" look, and
it is the single most common particle defect in real builds.

The fix costs eight lines and no generation call:

```ts
/** A soft round dot drawn into a canvas — no network, no asset, works offline. */
function dotTexture(size = 64): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.Texture(c);
  t.needsUpdate = true;
  return t;
}

const material = new THREE.PointsMaterial({
  map: dotTexture(),            // ← without this every mote is a square
  color: 0xffb98a,
  size: 0.06,
  sizeAttenuation: true,        // near motes bigger than far ones
  transparent: true,
  depthWrite: false,            // motes must not occlude each other
  blending: THREE.AdditiveBlending,
});
```

For a mote with real art (embers with structure, snowflakes, leaves), generate the
sprite instead — `npx genex image --transparent "single soft round ember, black
background"` — and use it as `map`. The canvas dot is the right default for
anything that is just light.

`depthWrite: false` turns off the depth **write**, not the depth **test**: a
particle still gets rejected by geometry in front of it. That's what you want —
but it also means a mote sitting fractionally below the floor vanishes. Spawn
above the surface, not on it.

## Bursts are pooled, never allocated

A burst that runs `new Points(...)` per explosion allocates during the exact
frame the player is watching. Pre-build one pool at load, take from it, return on
death — the same shape the rest of the scene uses for bombs and flames.

```ts
const N = 240;
const pos = new Float32Array(N * 3);
const vel = new Float32Array(N * 3);
const life = new Float32Array(N);          // seconds remaining; 0 = free
const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
const points = new THREE.Points(geo, material);
points.frustumCulled = false;              // positions move; the bounds don't follow

function burst(x: number, y: number, z: number, n = 24, speed = 3): void {
  let spawned = 0;
  for (let i = 0; i < N && spawned < n; i++) {
    if (life[i] > 0) continue;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const s = speed * (0.5 + Math.random() * 0.5);
    vel[i * 3] = Math.sin(ph) * Math.cos(th) * s;
    vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * s;   // bias up — debris arcs
    vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * s;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    life[i] = 0.5 + Math.random() * 0.4;
    spawned++;
  }
}

function step(dt: number): void {
  for (let i = 0; i < N; i++) {
    if (life[i] <= 0) continue;
    life[i] -= dt;
    if (life[i] <= 0) { pos[i * 3 + 1] = -1000; continue; }  // park it offscreen
    vel[i * 3 + 1] -= 9.8 * dt;                              // gravity
    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
  }
  geo.attributes.position.needsUpdate = true;
}
```

Call `burst()` from the same place the game already plays the explosion sound —
that call site IS the moment, and it is the proof the effect is event-driven
rather than ambient decoration.

## Rules

- Every layer must have a role in silhouette, motion, illumination, or residue.
- Use normalized lifetime curves instead of scattered time constants.
- Derive secondary motion from the same flow or event direction.
- Keep bloom as a response to HDR emission, not as the effect's only shape.
- Pool instances and trails; do not allocate per burst.
- Expose spawn, simulation, overdraw, and luminance debug views.
- Include a non-bloom baseline that remains legible.
- Never ship a `PointsMaterial` without a `map` or `alphaMap` — see above.

## Routing boundary

Keep accumulated screen frost, persistent weather/surface state, and ground
material changes in the request's owning scene system. Impact **residue** on a
surface (scorch, bullet holes) is a decal — `$genex-ai-image` owns that; the
spark that throws the residue is this skill, and a hit usually wants both.
Keep ship-space plasma, generated wakes, sparks, and pooled debris in this
skill.
