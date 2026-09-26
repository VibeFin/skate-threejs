# Third-party notices — vegetation

Same convention as `src/controllers/NOTICE.md`: adapted sources carry an SPDX
header, and what was taken is named here rather than left for someone to work
out from a diff.

## ez-tree — MIT License

The procedural tree generator in this directory is an adaptation of **ez-tree**
by **Daniel Greenheck** (https://github.com/dgreenheck/ez-tree), which the
player named himself as the reference for this work. A copy is kept for reading
at `.claude/reference/ez-tree`.

Copyright (c) 2024 Daniel Greenheck

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### What was adapted, and where

| file | from | what |
| --- | --- | --- |
| `grow.ts` (SPDX header) | `src/lib/tree.js` — `#growBranch`, `generateChildBranches`, `generateLeaves` | The growth algorithm: sectioned limbs with a tapering radius, radius-scaled gnarliness, the corrected `(up × target)` growth-force term, stratified child placement with permuted radial slots, and the split between a skeleton that consumes all the randomness and meshing passes that consume none. |
| `mesh.ts` | `src/lib/tree.js` — `#meshBranch`, `#meshLeaf` | The ring-and-segment walk, the duplicated seam vertex, first-and-last ring retention when striding, and the rounded-normal trick for foliage cards. |
| `atlas.ts` | `src/lib/tree.js` — `#createLeafMaterial` | The three-sine wind sway and the `normal_fragment_begin` patch that stops three flipping custom normals on back faces. |
| `species.ts` | `src/lib/options.js`, `src/lib/presets/pine_*.json` | The shape of the parameter space, and which parameters are the ones worth exposing. |

### What was NOT taken

Euler-angle composition (quaternions here), the trellis growth system, the
per-level bark texture plumbing, `THREE.LOD`-based level of detail (this game
instances, and `LOD` switches per object), and the one-quad-per-leaf canopy —
ez-tree's own pine preset emits 4,920 leaf quads per tree, which is roughly six
times this game's entire vegetation budget. Foliage here is a painted branchlet
on an alpha-tested card.

## Nothing here is a generated asset

Every texture in this directory is drawn on a `<canvas>` in code — the same
technique `src/world/procedural/mats.ts` uses and for the same reasons. No
`genex` generation was run for it.
