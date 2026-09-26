# Third-party notices

The controller code and assets in this directory are vendored into your game
by `npx genex controller`. They bundle the following third-party work:

## ecctrl — MIT License

The character, vehicle, and drone controllers are a vanilla-TypeScript port of
the **ecctrl** character/vehicle controller library (a pmndrs project),
pinned at upstream commit `e2f4eb8`.

Copyright (c) 2023-2026 Erdong Chen

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

Every ported source file carries its own SPDX header
(`SPDX-FileCopyrightText: 2023-2026 Erdong Chen`,
`SPDX-License-Identifier: MIT`).

## Quaternius Universal Animation Library [Pro] — CC0 1.0 Universal

- `assets/animation-library.glb` — the bundled 12-clip core, cut from the
  **Universal Animation Library [Pro]** by **Quaternius** (quaternius.com):
  120 humanoid animation clips on a UE-mannequin-style skeleton.
- `public/assets/anims/*.glb` — additional per-clip cuts from the same
  library, installed on demand by `npx genex controller anims`.

Dedicated to the public domain under the Creative Commons CC0 1.0 Universal
license (SPDX: `CC0-1.0`). No attribution is required by the license; this
notice is provided as a courtesy — supporting Quaternius on Patreon is a nice
way to say thanks.

## Default avatar — CC0 1.0 Universal

The character controller plays as your VRM avatar. When you have not chosen one
(or run offline), the bundled default `assets/default-avatar.vrm` is copied to
`public/assets/avatar.vrm`. It is **Wizzir** from the **100 Avatars** project by
**Polygonal Mind** (polygonalmind.com), dedicated to the public domain under
CC0 1.0 Universal (SPDX: `CC0-1.0`). Attribution is a courtesy, not required.

## @pixiv/three-vrm — MIT License

The VRM support in `character/vrm/` (loader, animation retargeter, foot IK) is
built on the **@pixiv/three-vrm** npm package, MIT-licensed by pixiv Inc.
`vrm-retarget.ts` adapts that package's official humanoid-retarget example (MIT)
to the Quaternius rig. Install it into your game with `npm i @pixiv/three-vrm`.

Copyright (c) 2019-2026 pixiv Inc. — Permission is hereby granted, free of
charge, to any person obtaining a copy of this software and associated
documentation files, to deal in the Software without restriction. THE SOFTWARE
IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. (Full MIT text ships with the
`@pixiv/three-vrm` package's LICENSE file.)

## Basis Universal transcoder (`assets/basis_transcoder.js`, `assets/basis_transcoder.wasm`)

Copyright 2019-2024 Binomial LLC — Licensed under the Apache License, Version
2.0. Vendored from the three.js distribution (examples/jsm/libs/basis) so the
quality kit's KTX2Loader can transcode GPU-compressed `.ktx2` textures; served
from the game's own `public/assets/` per KTX2Loader's `setTranscoderPath`
contract. You may obtain a copy of the License at
www.apache.org/licenses/LICENSE-2.0. Distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND.

## This game's controller subset

SKATE rides on its own skate motion model (`src/skate/`) over the analytic
field heightfield — no Rapier world, nothing to collide with on an open field.
The Rapier-dependent pieces of the character kit (`character-controller.ts`,
`presets.ts`, `motion-actions.ts`, `shared/`) were therefore removed. What this
game DOES use from the kit: `quality/*` (device tier + governor + asset rungs),
`character/follow-camera.ts` (the chase rig) and `touch/*`. Re-run
`npx genex controller character` to restore the full set if physics arrives.
