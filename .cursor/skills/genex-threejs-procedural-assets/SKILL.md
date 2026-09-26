---
name: genex-threejs-procedural-assets
description: Build editable, parameterized Three.js props from reference images or explicit procedural requests. Use when the user asks for a procedural, parametric, code-built, customizable, seeded, or variation-ready prop, hard-surface object, modular decoration, or simple structure. Do not trigger merely because an image exists.
---

# Genex Three.js Procedural Assets

Build a recognizable asset as local, editable Three.js code when code is the
requested product—not as a fallback for every object.

## Choose the route

- Start directly when the user says procedural, parametric, code-built,
  customizable, seeded, or asks for controlled variations.
- An attached or available image does not activate this skill by itself.
- If “make this image 3D” could honestly mean either route, ask exactly one
  question: **“Do you want a generated textured GLB, or editable procedural
  Three.js code?”**
- Use `$genex-ai-model` when the user chooses a generated textured GLB.
- Use this skill for props, hard-surface objects, modular decorations, and
  simple structures or environment pieces.
- Do not use it for characters, creatures, rigging, skeletal animation, or
  character likeness. Keep those in their existing specialist lanes.

## Keep the reference safe

A user attachment, local file, or private URL is build input only. Inspect it
in place. Do not upload it, place it in `public/`, publish it, or commit a copy
without the user's permission.

When no reference exists and one would materially improve the requested
asset, use the existing `npx genex image` route. Record that image as its own
normal paid generation row in `DESIGN.md`, including its generation ID and
landed URL. Do not create another image pipeline or automatically re-roll a
reference.

State which geometry is visible and which geometry is inferred. A single view
does not prove its hidden sides. Ask for another view only when the requested
fidelity or gameplay behavior genuinely depends on it; otherwise make a
reasonable inference and name it.

## Record the work in `DESIGN.md`

Give the procedural result a separate row in the existing Assets table:

```markdown
| <asset> | procedural-code | building (blockout) | — |
```

Use this status flow:

```text
proposed → planned → building (blockout | detail | material | runtime)
→ landed (<local TypeScript path>) → wired
```

A Genex-generated reference keeps its separate image row and normal paid
generation status. Note that the procedural-code row is derived from that
image. A private user reference is not a paid generation row.

Keep only useful state: intended use, fidelity target, reference provenance,
visible versus inferred regions, any required moving parts or collision
shape, current stage, output path, and comparison evidence. Do not add a
second review ledger.

## Build the asset

1. Identify the silhouette, proportions, part relationships, material zones,
   and the few details that make the subject recognizable.
2. Define meaningful parameters before geometry: dimensions, part counts,
   thicknesses, palette or material choices, and variation ranges. Add an
   optional seed only when controlled variation is useful.
3. Build the smallest blockout that proves massing and scale. Use named child
   objects for semantic parts rather than one anonymous group of primitives.
4. Add only the detail and material behavior required by the user's target.
   Preserve real dimensions and keep randomness inside valid ranges.
5. Render one reference-matched view plus one off-axis or in-game-scale view.
   Fix meaningful silhouette, proportion, attachment, and material mismatches.
6. Stop when the requested acceptance level is reached, then integrate the
   factory and move its `DESIGN.md` row from `landed` to `wired`.

The output is a local TypeScript factory that returns a `THREE.Group`, for
example `createMarketStall(options): THREE.Group`. Give it stable defaults,
intentional parameters, and named parts that gameplay code can address.

Add pivots or sockets only for parts that must move or attach. Expose a
collider description only when gameplay needs collision, and let the game's
existing physics owner create the real collider. Add destruction groups only
for a destructible asset. A static decoration needs none of this ceremony.

## Respect existing owners

Consume the game's existing Three.js scene and runtime. Never replace or
silently configure its renderer, camera, lighting, shadows, post-processing,
physics, animation, adaptive-quality, or mobile systems. If the request grows
from one asset into a general mesh library, building grammar, or world
generator, pause and confirm that expanded deliverable instead of turning this
skill into a catch-all runtime.

Do not replace `$genex-ai-model`, the character or creature lanes, rigging,
animation, or any protected platform pipeline.

## Keep the loop proportional

The user's acceptance target controls the work. A rough background prop may
finish after blockout and material; a hero prop may earn more refinement.
Continue autonomously through unambiguous fixes and keep unrelated game work
moving.

Do not impose mandatory pass counts, numeric fidelity scores, review ledgers,
weapon-specific rules, automatic re-rolls, or user approval after every pass.
Ask only when a real product choice remains.
