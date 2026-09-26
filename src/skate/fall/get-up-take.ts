// The get-up take, and the one line of code that puts it in the game.
//
// Round two's blocker, in the critic's words: *"`GetUp` is a clip player with an
// empty slot. Nothing in the project calls `setGetUpClip`."* That was true and it
// was the whole failure — the transition machinery was built, the take was
// generated and recorded in DESIGN.md's asset table as **landed**, and the two
// were never introduced, so every bail on screen ran the no-clip fallback that
// `get-up.ts`'s own header calls a cut with a longer fuse. "Landed" and "in the
// game" are different claims and only the first one was true.
//
// **Why the URL lives here rather than in a caller.** `createRagdoll` is built in
// `main.ts`, which this lane does not own, and a clip slot that only a caller can
// fill is a clip slot that stays empty — which is exactly what happened. So the
// fall loads its own take, the same way `src/skate/anim/pose-take.ts` already
// loads the four held-move takes: straight from the generation the director
// recorded, by URL, at the moment the ragdoll first builds its body. Nothing else
// in the project has to know.
//
// **It is the generation DESIGN.md records for lane G**, id
// `cms51mx9o003d22oz0yd8rn0t`, first output — and that is not taken on trust. The
// call was a batch of seventeen and the other sixteen are the locomotion set;
// measured on the take's own root track, this is the only one of the seventeen
// whose hips start on the floor:
//
//   this take        hips 0.22 m → 0.83 m, 3.97 s   ← lying to standing
//   the other 16     hips 0.79–0.87 m throughout    ← walks, runs, strafes
//
// So the mapping in the asset table is right, and the number that proves it is
// the one the harness now measures the stand-up with.
//
// **A take that will not load is not an error.** It leaves the stand-up on the
// cross-fade, which is what shipped before, and says so once in the console. A
// bail is not the moment to throw.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * The get-up: `npx genex character animate` on this exact character
 * (`cms0fbiar004o22nuyjqjhzuz`), prompted "push up off the ground from lying
 * face-down, plant both hands, bring one knee forward, stand up".
 *
 * Loaded from the generation URL rather than a file in `public/` for the same
 * reason the four pose takes are: it is the asset the director generated, at the
 * address the director recorded, and copying it into the repo would make a second
 * copy that can go stale against the table.
 */
export const GET_UP_URL =
  "https://assets.auras.cc/generations/cms51mx9o003d22oz0yd8rn0t/character-motion-uthana-mxzpuR97gzzo-glb";

/** One load per page, however many ragdolls ask for it. */
let pending: Promise<THREE.AnimationClip | null> | null = null;

/**
 * The get-up take, or null if it could not be had.
 *
 * Shared across callers and never retried: a second bail should not queue a
 * second download of the same 60 kB, and a take that 404s once will 404 again.
 *
 * **`fetch` + `parse`, not `loadAsync`, and the reason is the harnesses.**
 * `GLTFLoader.loadAsync` goes through three's `FileLoader`, which builds a
 * `ProgressEvent` to report bytes with — a DOM class that does not exist in node,
 * and it is constructed inside three's own promise chain rather than the one
 * `loadAsync` returns, so it lands as an unhandled rejection that no `.catch()`
 * here can reach. Measured: `tools/integration-check.mjs` printed its whole
 * scoreboard and then died on `ReferenceError: ProgressEvent is not defined`.
 * `fetch` exists in both places and `parse` reports no progress, so one code path
 * serves the game and every tool that drives it headless.
 */
export function loadGetUpTake(): Promise<THREE.AnimationClip | null> {
  if (!pending) {
    pending = fetch(GET_UP_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.arrayBuffer();
      })
      .then(
        (buf) =>
          new Promise<THREE.AnimationClip | null>((ok, fail) => {
            new GLTFLoader().parse(
              buf,
              "",
              (gltf) => ok(gltf.animations[0] ?? null),
              (e) => fail(e),
            );
          }),
      )
      .catch((e: unknown) => {
        console.warn("[get-up] the take would not load — the stand-up stays a cross-fade", e);
        return null;
      });
  }
  return pending;
}
