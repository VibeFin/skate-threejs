---
name: genex-threejs-visual-validation
description: Validate Genex Three.js game visuals in a real browser. Use for fixed-view captures, no-post baselines, diagnostic mosaics, seed sweeps, camera-distance checks, temporal stability, interaction smoke checks, render-target inventories, GPU budgets, and evidence before claiming a 3D scene is done.
---

# Genex Three.js Visual Validation

Evaluate the mechanism that creates the image. A beautiful hero screenshot can hide unstable fields, broken depth, seed failures, or post-processing dependence.

## Validation sequence

1. Freeze deterministic inputs.
2. Capture the no-post baseline.
3. Capture system-specific diagnostic views.
4. Test the intended camera-distance envelope.
5. Sweep representative seeds and parameter extremes.
6. Test motion and temporal stability.
7. Record image, geometry, memory, and timing budgets.
8. Keep a small regression set tied to visual invariants.

## Meshy character approval evidence

Before generating a Meshy character, discuss two or three visual directions.
When the user names a visual reference, inspect references before writing the
concept prompt. Recommend a neutral A-pose for characters that will be rigged.

Generate concept images first and show the actual images to the user. Do not
start Image-to-3D until the user explicitly selects a candidate. Validation
must show all three actual concept images, confirm that every candidate uses a
neutral A-pose, and preserve the user's explicit candidate selection. A task
ID, filename, or agent summary is not visual evidence. Dynamic concept poses
and silent T-pose fallbacks fail this checkpoint. Warn when held, slung, or
overlapping props or straps can fuse into the character or hide a limb.

Meshy Image-to-3D first produces an unremeshed high-detail model. Show its
front, back, left, and right views and report its measured face count. Preserve
that model in R2. Before rigging, ask the user to approve a separate
10,000-face triangle remesh. The 10k remesh—not the high-detail source—is
rigged and animated. (For these approvals, use your question tool when you
have one; if you have none, a short numbered list in chat.)

The selected high-detail model remains in a neutral A-pose before animation.
Record evidence that the user saw its four views and face count before
`--approve-remesh 10000` was used. Historical Meshy characters remain valid;
do not demand a silent regeneration or upgrade.

Meshy limb rotations play unchanged. Never freeze hand tracks or apply
post-mixer arm, hand, leg, or foot corrections. Only horizontal root or hip
translation may be normalized for Rapier.

## Interaction smoke check (the game fast path)

For plain game tasks — nothing from the procedural/visual-system pack loaded —
this is the whole acceptance gate, and it is also the *ceiling*: a smoke check,
not a certification. Run it ONCE per milestone, against that milestone's
`genex preview` build — the player may already be walking around it while
you check. Catch obvious
breakage, fix what's clearly broken, and hand the feel/polish judgment to the
player — don't loop re-testing the same build, don't re-test after cosmetic
tweaks (sounds, colors, tuning values), and don't try to exercise every button
and edge case yourself. This browser check is the only testing a game draft
needs: never add unit tests or a test framework to a game unless the user asks.
The player deciding "does it feel right?" is faster and truer than you clicking
everything twice.

1. Load the page in a real browser; the canvas renders (no black screen, no
   console errors). For an unpublished draft, open the dev server in local
   test mode — `http://localhost:5173/?genex_local_test=1` (the embed-auth
   skill's "Self-testing a draft" section) — so you see the game, not the
   sign-in gate.
2. Press each documented control once (keys, pointer); assert a **visible
   response in its labeled direction** — this is the input-direction pass, and
   it is part of THIS check, not an extra testing loop. Hold `KeyD`/ArrowRight
   ~0.5s and screenshot-diff: the controlled thing moves or turns toward
   screen-RIGHT (for a pan camera the viewport slides right — the terrain
   streams LEFT); `KeyA`/ArrowLeft mirrors it. Keyboard synthesis needs no
   pointer lock, so this works headless. For drag rigs, drag right AND drag up:
   both axes must follow the one stated convention (grab-the-world or
   move-the-camera — never one each). A response in the WRONG direction is a
   fail, not a note: two shipped games passed "controls respond" while D
   steered screen-left. For an animated character, capture idle, walk, run,
   crouch-idle, crouch-move, and jump. Inspect shoulders, elbows, wrists, and hands as well
   as the feet: a fully bound non-T-pose can still be stylistically broken.
   Reject shrugging palms-up poses, permanently raised elbows, or a gait whose
   upper-body style contradicts the requested character. “No T-pose” is not
   an animation-quality check.
   For Meshy characters, crouch passes only when the capsule behavior and a
   visibly crouched pose both respond. If a control calls `playOneShot()`, a
   false result or missing-clip warning is an installation failure even when
   locomotion continues normally.
   During Meshy validation, record the action ID actually bound to every slot.
   A public preview is not evidence when the game is playing a different clip
   or a rig-basic fallback. Meshy limb rotations play unchanged. Never freeze
   hand tracks or apply post-mixer arm, hand, leg, or foot corrections. Only
   horizontal root or hip translation may be normalized for Rapier. If a
   native pose is bad or a required binding is missing, stop and regenerate.
3. Capture one screenshot of live gameplay — of the **game**, not a sign-in
   gate or loading screen. A capture of the SDK's "Sign in to play" overlay is
   NOT gameplay evidence. Evidence captured in local test mode must be labeled
   as such in the handoff ("local test mode — auth, saves, and multiplayer not
   exercised"); presenting it as full validation is an over-claim.
4. In that screenshot, check oriented models: the hero faces its travel
   direction, and NPCs driven by chase/aim code face their target. A model
   rotated 90° reads as broken — `$genex-ai-model` has the one-time facing
   fix. **In any two-character or enemy-encounter capture, the characters
   face their TARGET, not the camera** — Meshy/Mixamo/VRM rigs rest facing
   +Z (straight at a side camera), so an unset yaw ships duelists staring
   at the lens; and a rig "turned" with `scale.x = -1` is a defect even
   when it looks right from one angle (negative scale flips a SkinnedMesh's
   winding and normals — the character-controller skill has the rules).
5. Vehicles get one extra pass: drive forward once and confirm the NOSE
   leads (a 180° body is this bug's favorite disguise), and check the body
   stands ON the road with its wheels inside the silhouette — a body
   floating above detached wheels means the model was box-fit against the
   preset's wheelbase (the vehicle skill's "Custom generated bodies" rules
   fix it).
6. The cursor pass — every game, per the lock-or-tool rule: during play the OS
   cursor is either the gameplay tool (cursor-core — confirm the explicit
   `pointerLockAim: false` opt-out, cursor stays) or it is LOCKED away; a
   non-cursor-core game with the arrow parked over the action is a defect, even
   a keyboard-only racer. Aim games additionally: click the canvas and assert
   the pointer locks (cursor gone, mouse-RIGHT turns the view RIGHT and
   mouse-UP looks UP — name BOTH axes; yaw-only evidence has let inverted pitch
   ship); press Esc and assert the "click to aim/resume" cue appears. The cue
   should be the bundled `createAimCue` helper (or an equivalent
   `onAimChange`-driven overlay) — a MANDATORY-bucket game with no unlocked cue
   fails. Games with a menu additionally: on the main menu, click one item that
   does NOT start play (Settings/Options/Credits) — the cursor must remain
   visible; the lock may only ever engage from the Play/Resume click or a
   gameplay canvas click (the phase binding `setPaused(phase !== "playing")` is
   what guarantees this — check it rides `setPhase`, not the render loop).
   Headless caveat: `requestPointerLock` throws in headless Chromium —
   assert the wiring and the unlocked cue in a screenshot, and say plainly that
   the lock itself needs one manual click (do the both-axes look check there).
7. **Ask the scene the three things the screenshot cannot answer** (below). Run it
   once, in the same browser you already have open.

### The screenshot has three blind spots — query them

A capture of the whole arena is taken from one camera at one distance. Three real
defect classes are invisible in it and all shipped to players:

- **Texture scale on faces you aren't looking at.** A shipped game's wall tops
  were 1:102 — the steel texture read as wooden planks — while the wall *sides*,
  the faces at eye level, were a near-perfect 1.2:1. Nothing in the screenshot
  says which is which; the numbers do.
- **Post-grade grain that shimmers.** A still frame cannot show a temporal
  effect. Animated film grain — a noise term re-seeded by time every frame —
  ripples across the entire screen in motion and reads as a cheap noise sheet
  laid over the game; a screenshot looks fine. It shipped this way in a real game
  (64.5% of a static floor's pixels changed frame-to-frame from grain alone).
- **Coplanar surfaces.** Two boxes overlapping with faces at the same height
  z-fight. It may look stable in a still and flicker the moment the camera
  moves, so a screenshot is the one tool guaranteed to miss it.

Expose the scene in dev (`if (import.meta.env.DEV) (window as any).__scene = scene;`),
then paste this into the browser console once and read the verdict. It needs no
imports — pass it straight to your JS-eval tool.

```js
(() => {
  const S = window.__scene, MIN_M2 = 1.0;   // judge real faces, not GLB slivers
  const out = { stretched: [], zfight: [] };
  const xf = (e,x,y,z) => [e[0]*x+e[4]*y+e[8]*z+e[12], e[1]*x+e[5]*y+e[9]*z+e[13], e[2]*x+e[6]*y+e[10]*z+e[14]];
  const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const len = a => Math.hypot(a[0],a[1],a[2]);
  const comb = (a,s,b,t) => [a[0]*s+b[0]*t, a[1]*s+b[1]*t, a[2]*s+b[2]*t];

  // metres-per-tile along U and V, from each triangle's UV Jacobian. Geometry
  // agnostic — a box, a plane and a GLB all measure the same way — and it reads
  // texture.repeat, so it sees what the GPU will actually draw.
  S.traverse(o => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const g = o.geometry, uv = g.attributes && g.attributes.uv;
    if (!m || !m.map || !uv) return;
    const pos = g.attributes.position, idx = g.index, e = o.matrixWorld.elements;
    const rx = m.map.repeat.x, ry = m.map.repeat.y, faces = new Map();
    for (let t = 0; t < (idx ? idx.count : pos.count) / 3; t++) {
      const ix = [0,1,2].map(k => idx ? idx.getX(t*3+k) : t*3+k);
      const p = ix.map(i => xf(e, pos.getX(i), pos.getY(i), pos.getZ(i)));
      const e1 = sub(p[1],p[0]), e2 = sub(p[2],p[0]);
      const nc = cross(e1,e2), area = len(nc)/2;
      if (area < 1e-6) continue;
      const nn = nc.map(v => v/(area*2));
      const U = ix.map(i => uv.getX(i)*rx), V = ix.map(i => uv.getY(i)*ry);
      const du1 = U[1]-U[0], dv1 = V[1]-V[0], du2 = U[2]-U[0], dv2 = V[2]-V[0];
      const det = du1*dv2 - du2*dv1; if (Math.abs(det) < 1e-12) continue;
      const a = len(comb(e1, dv2/det, e2, -dv1/det));
      const b = len(comb(e2, du1/det, e1, -du2/det));
      const k = nn.map(v => v.toFixed(1)).join(",");
      const f = faces.get(k) || { area:0, u:0, v:0 };
      f.area += area; f.u += a*area; f.v += b*area; faces.set(k, f);
    }
    for (const [k,f] of faces) {
      if (f.area < MIN_M2) continue;
      const mu = f.u/f.area, mv = f.v/f.area, asp = Math.max(mu/mv, mv/mu);
      if (asp > 1.5) out.stretched.push({ mesh:o.name||o.type, face:k, aspect:+asp.toFixed(1),
                                          m2:+f.area.toFixed(1), mPerTile:`${mu.toFixed(2)}x${mv.toFixed(2)}` });
    }
  });
  out.stretched.sort((a,b) => b.m2 - a.m2);   // biggest surfaces first

  // opaque depth-writing meshes that interpenetrate AND share a face plane
  const solid = [];
  S.traverse(o => {
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!o.isMesh || o.isInstancedMesh || !m || m.transparent || m.depthWrite === false) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox, e = o.matrixWorld.elements;
    const lo = [Infinity,Infinity,Infinity], hi = [-Infinity,-Infinity,-Infinity];
    for (const cx of [bb.min.x,bb.max.x]) for (const cy of [bb.min.y,bb.max.y]) for (const cz of [bb.min.z,bb.max.z]) {
      const w = xf(e,cx,cy,cz);
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i],w[i]); hi[i] = Math.max(hi[i],w[i]); }
    }
    solid.push({ o, lo, hi });
  });
  const E = 1e-4;
  for (let i = 0; i < solid.length; i++) for (let j = i+1; j < solid.length; j++) {
    const A = solid[i], B = solid[j];
    if ([0,1,2].some(k => Math.min(A.hi[k],B.hi[k]) - Math.max(A.lo[k],B.lo[k]) <= E)) continue;
    const shared = [];
    for (const k of [0,1,2]) {
      if (Math.abs(A.lo[k]-B.lo[k]) < E) shared.push("min."+"xyz"[k]+"="+A.lo[k].toFixed(2));
      if (Math.abs(A.hi[k]-B.hi[k]) < E) shared.push("max."+"xyz"[k]+"="+A.hi[k].toFixed(2));
    }
    if (shared.length) out.zfight.push({ a:A.o.name||"mesh", b:B.o.name||"mesh", coplanar:shared });
  }
  return out;
})()
```

Read it as: **`stretched` should be empty.** Every entry is a face over a square
metre whose texels aren't square; `mPerTile` gives you the actual numbers, and
`m2` tells you whether it's a kerb or a wall. `MIN_M2` is there because a
generated GLB's authored UVs produce hundreds of tiny-triangle readings that
drown the real finding — raise it if a model still floods the list, and note in
the handoff that you did.

**`zfight` should be empty.** Every entry is two solids that interpenetrate AND
share a face plane, which will fight and flicker the moment the camera moves.

Both are wiring defects, so fix the wiring: `worldUV` (`$genex-ai-texture`) for
the first; for the second, stop the solids overlapping — butt the spans end to
end rather than crossing them at the corners.

Run against the shipped BomberDome build, this printed `aspect: 102, m2: 17,
mPerTile: "0.17x17.00"` for the wall tops and four coplanar pairs at
`max.y=2.40`. Both had been in front of the agent for an hour of screenshots.

**Grain shimmer — inspect the mechanism, not the pixels.** A pixel diff is
confounded by the scene's own ambient motion; the deterministic check is to read
the post stack. Expose the composer in dev alongside the scene
(`if (import.meta.env.DEV) (window as any).__composer = composer`), then:

```js
(() => {
  const passes = (window.__composer && window.__composer.passes) || [];
  const suspect = [];
  for (const p of passes) {
    const fs = p.material && p.material.fragmentShader;
    if (!fs) continue;
    const names = Object.keys(p.material.uniforms || {});
    // a grain/noise term, by shader text OR a uGrain-style uniform
    const hasGrain = /grain|\bnoise\b|fract\s*\(\s*sin|\bhash\s*\(|\bign\s*\(/i.test(fs)
      || names.some(u => /grain|noise/i.test(u));
    // a time-ish uniform actually referenced in the fragment shader
    const timeU = names.find(u => /time|frame|seed|tick/i.test(u) && new RegExp('\\b' + u + '\\b').test(fs));
    if (hasGrain && timeU) suspect.push({ pass: p.constructor.name, timeUniform: timeU });
  }
  return suspect; // ideally empty
})()
```

A non-empty result means the grade has grain AND a per-frame time uniform — very
likely the grain is re-seeded every frame and shimmers. Confirm which the time
term drives; if it's the grain, make it **static** (drop the time term) or reseed
at ≤12 Hz, seeded on `gl_FragCoord.xy` and luminance-weighted —
`$genex-threejs-exposure-color-grading` has the recipe. This is the exact defect
an owner described as "some texture rippling over the whole screen."

Everything deeper (baselines, seed sweeps, mosaics, budgets) belongs to
visual-system work — the sequence above.

## Required evidence

- fixed camera and seed manifest;
- final and no-post captures;
- field/pass diagnostic mosaic;
- near, design, and far camera views;
- at least one stress seed;
- frame-time and render-target inventory;
- written invariants and known compromises.

## Failure conditions

- a MANDATORY-bucket aim game never requests pointer lock, or locks with no
  visible unlocked cue;
- a movement key or look axis whose on-screen direction contradicts its label
  (D turning the vehicle screen-left, mouse-up looking down with no invert
  option);
- drag-pan axes that mix conventions (one axis grab-the-world, the other
  move-the-camera);
- a non-cursor-core game that leaves the OS cursor visible during play;
- a menu or settings click locks the pointer (or the cursor vanishes) while a
  menu screen is still up;
- approval relies on a single frame;
- post-processing cannot be disabled per pass;
- random seeds are not reproducible;
- GPU time is inferred only from CPU frame time;
- temporal artifacts are judged from still images;
- comparison thresholds ignore intentional stochastic pixels without stabilizing them.

## Routing boundary

This skill evaluates an implementation; it does not supply the implementation
mechanism. Load the subject or image-effect skill first, then use this protocol
to decide whether the result is acceptable.
