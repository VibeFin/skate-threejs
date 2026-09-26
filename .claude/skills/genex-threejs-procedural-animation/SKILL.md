---
name: genex-threejs-procedural-animation
description: Build procedural animation systems for Genex Three.js games. Use for analytic timelines, launch arcs, loops, staging, docking, springs, vehicle lag, rotating frames, debris motion, transform phases, quaternion alignment, and frame-rate-independent motion.
---

# Genex Three.js Procedural Animation

Animate semantic state, not unrelated transform curves. Define phases,
coordinate frames, velocities, and ownership before writing per-frame updates.

Boundary: procedural animation owns held-object and analytic motion (arcs,
springs, docking, debris). WHOLE-BODY character verbs (a gait, a weapon
hold, a signature move) belong to the character lane — the catalog first,
then `genex character animate <id> "<verb>"` for verbs it lacks; see the
motion section of `$genex-ai-character`.

## Build order

1. Define the timeline phases and event boundaries.
2. Choose the frame for each motion: world, subject local, orbital radial,
   docking axis, or camera shot.
3. Derive target position/orientation from that frame.
4. Use analytic kinematics for authored travel and springs for responsive
   convergence.
5. Preserve world transforms when detaching children from a hierarchy.
6. Separate translation, alignment, spin, and secondary debris state.
7. Clamp integration delta and reset every state variable on replay/disposal.

Read [references/procedural-motion.md](references/procedural-motion.md)
for the launch, staging, docking, debris, spring, quaternion, and
frame-rate-independent response implementations.

## Non-negotiable rules

- Use elapsed seconds and `deltaSeconds`; do not make motion frame-count based.
- Derive orientation from direction/frame, then apply roll or spin as a
  separate quaternion.
- Decompose docking error into axial and radial components.
- Switch from spring convergence to an exact terminal pose at the end of a
  sequence.
- When reparenting an animated object, capture world position, quaternion, and
  scale before removal.
- Use seeded randomness when motion must be reproducible.
- Keep visual shake in a bounded envelope and separate it from trajectory.

## Routing boundary

Use `$genex-threejs-camera-direction` for shot composition and camera handoffs.
Use `$genex-threejs-procedural-vfx` when the deliverable is primarily plasma, sparks,
or effect pooling rather than object transform motion.
