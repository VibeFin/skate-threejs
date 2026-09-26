---
name: genex-threejs-shadow-systems
description: Implement stable shadow systems for Genex Three.js games. Use for large worlds, directional cascades, cached clipmaps, terrain shadows, city scenes, moving cameras, targeted invalidation, texel stabilization, and readable contact shadows.
---

# Genex Three.js Shadow Systems

**When NOT to load this:** for a bounded scene (an arena, a room, a small level),
three.js's default `shadowMap` on one directional light with a tight shadow
frustum is enough — skip this skill. Load it when the camera roams a large world
and shadows shimmer, swim, or run out of coverage.

Use a single shadow map only when its receiver region is genuinely bounded. For large moving views, make shadow coverage an explicit spatial hierarchy.

**Phone budgets ride the quality tier** (`$genex-threejs-adaptive-quality`):
shadow maps ≤1024² on phones (512² on the low tier — a 4096² map alone is
~67 MB of the phone's whole GPU budget), at most 2 cascades where desktop runs
4, and `shadowMap.autoUpdate = false` for static scenes (re-render on demand:
a shadow pass is a full extra scene render every frame otherwise).

## Cached clipmap workflow

1. Define concentric light-space square levels.
2. Snap each level center to its own texel grid.
3. Cross-fade adjacent levels in shader space.
4. Refresh near levels continuously.
5. Cache coarse levels and update them under a frame budget.
6. Invalidate intersecting levels when important casters or streamed terrain change.
7. Scale normal bias by world-space texel width.

Read [references/shadow-systems.md](references/shadow-systems.md) before implementing a large-world directional light.

## Failure conditions

- projection centers move by fractions of a texel;
- shader containment does not match the map's committed center;
- all cascades refresh every frame without evidence;
- coarse levels freeze moving casters indefinitely;
- depth texture samples occur in divergent fragment control flow;
- the same normal bias is used across radically different texel sizes;
- level boundaries become visible under camera motion.

## Routing boundary

Use this skill for light-space directional shadow maps. View-dependent ambient
visibility is an AO concern; AO is not a replacement for cast shadows.
