// SKATE — boot.
//
// Order matters here: the device tier first (phones enforce a hard
// GPU-memory kill that desktop testing never shows), then the renderer built
// FROM that tier, then the world.
//
// NOTE: this game used to call `initEmbed()` from `@genex-ai/embed-sdk`
// here. That SDK redirects the page to a Genex sign-in when it finds no
// ticket — so the game now runs standalone with no online identity. Scores
// and settings live on this device (see `game/leaderboard.ts` and
// `audio/settings.ts`).

import * as THREE from "three";
import { detectTier, rendererAntialias, getQualitySetting } from "./controllers/quality/tier";
import { QualityGovernor } from "./controllers/quality/governor";
import { createGltfLoader } from "./controllers/quality/gltf-loader";
import { createSkateCamera } from "./camera/skate-camera";
import { getMap, maps, mount, type MapId, type MountedMap } from "./world/maps";
import { SkateModel, EMPTY_INPUT } from "./skate/skate-model";
import type { TrickName } from "./skate/skate-model";
import type { GrindKind, Stance, TrickId } from "./skate/contracts";
import type { GrindLine } from "./world/surface";
import { SkateInputSource } from "./skate/input";
import { SkaterRig } from "./skate/skater-rig";
import { SkaterAnim, type PostureTweak } from "./skate/skater-anim";
import { createRagdoll } from "./skate/ragdoll";
import type { Ragdoll } from "./skate/ragdoll";
import { Hud } from "./ui/hud";
import { Menu } from "./ui/menu";
import { PauseScreen } from "./ui/pause";
import { SettingsScreen } from "./ui/settings";
/**
 * THE PHONE'S HANDS. On a desktop `createTouchControls` returns `null` from one
 * `matchMedia` read before it has touched the DOM, and the widgets themselves
 * live in a chunk a desktop session never fetches — see that file's header for
 * why the no-op is structural and not a guard.
 */
import { createTouchControls, type TouchControls } from "./ui/touch-controls";
/**
 * THE LOOK LAB — TEMPORARY, and it goes out again.
 *
 * The player asked for it in as many words: *"create a temporary in-game panel
 * for post-effects that I can tweak… Then I can copy the settings and share them
 * with you, and we can remove the panel afterward."* So it ships on his terms
 * and on the contract's: **nothing hidden** — no URL flag, no key chord; it
 * opens from a visible row on the settings screen — and **one import, one call
 * site, one file**, so deleting it when he hands the numbers back is three
 * deletions and no archaeology.
 */
import { createLookLab } from "./ui/look-lab";
import { dialogueOpen } from "./ui/dialogue";
import { RunGame } from "./game";
import { GameAudio } from "./audio";
import { createLookStack } from "./render/look";

/**
 * The title still, and the loader's backdrop.
 *
 * Re-shot for the street. The art this pointed at until now was the milestone-1
 * grass field — and the game has not been a field since the spot landed, so the
 * first thing the player saw was a picture of a different game. Same
 * golden-hour register, new subject: brick, graffiti, a handrail, a quarter
 * pipe, downtown behind. UI-free and full-bleed, with open sky for the wordmark
 * to sit in.
 */
const MENU_ART_URL = "https://assets.auras.cc/generations/cms2hv48901lw22lppfy2tr8c/image-main";
/**
 * The LOADER's plate — the SAME picture the title screen stands in, as of
 * 2026-07-29 at the player's word: *"и там тоже давай тот же бг использовать
 * что и в меню."*
 *
 * It was split off earlier the same day on the argument that a loader wearing
 * the shop would "promise a shop" while the game is a street block. He has
 * overruled that, and on reflection the argument was weaker than it read: the
 * loader hands straight over to the title screen, so what the shop actually
 * promises is THE NEXT SCREEN — and the two now dissolve into each other
 * instead of cutting between two unrelated photographs. It is also one fewer
 * image on the boot path: the same URL, already being fetched for the title
 * backdrop, so the browser serves the loader's copy out of cache.
 *
 * AGENTS.md rule 9 is still satisfied — the loader shows something of the game
 * rather than a black screen; it is simply the shop rather than the plaza. The
 * plaza plate (`cms5y3dqu00w722lbeizx8cci`) stays generated and unused.
 */
const LOADER_ART_URL = "https://assets.auras.cc/generations/cms67vjuo007022obezc4pooz/image-main";
/**
 * The animated title backdrop — the still above, brought to life. Generated
 * FROM that frame, so the crossfade lands on the same composition instead of
 * cutting to a second version of the place.
 */
const MENU_VIDEO_URL =
  "https://assets.auras.cc/generations/cms2hxarf01m922lpeknc4cj2/video-mp4";
/**
 * The wordmark, cut out and cropped to the mark itself (1021x484, aspect 2.11).
 *
 * RE-DRAWN TWICE on 2026-07-29, both times from the player's own reference,
 * and the SECOND ref replaced the first rather than competing with it.
 *
 * Round one came from `bar/style/logo-ref.jpg` — an ANGELCORE logotype, hand-
 * inked early-2000s emo-metal, barbed thorn serifs, half marbled bone and half
 * blood red. That is `logotype-angel.png`, still on disk.
 *
 * Round two came from `bar/style/logo2.png`: fat rounded bubble-graffiti letters,
 * pale mint fill, black blob drips. That is `logotype-bubble.png`, also kept.
 *
 * Round three is this one, from `bar/style/logo3.png`: chunky angular throw-up
 * letters leaning right and overlapping, heavy black drop shadow offset
 * down-right, white fill with a thin lilac inner line, blocky pixel edges.
 * 972x461, aspect 2.108 — within a hair of the previous 2.152 and 2.11, so the
 * rail's layout has never had to move across any of the three.
 *
 * **THE LESSON THIS CONSTANT KEEPS RECORDING: a ref is an INPUT, not a brief.**
 * Every round here that landed was `genex image --edit` pointed at the player's
 * OWN file. The one round that did not land was the one where I read his
 * reference and described the style back to the generator in words — he said it
 * plainly, twice: *"нееее! возьми прям реф и его используй как инпут"* and *"we
 * don't need inspiration. Do it exactly as I attached."* Describing a picture is
 * a lossy step nobody asked for.
 *
 * Both were made with `genex image --edit` on HIS file, so the letterforms are
 * anchored to the reference rather than described at it, then background-removed
 * in glyph mode and trimmed to alpha bounds. 1061x493, aspect 2.152 — close
 * enough to the previous 2.11 that the rail's layout does not move.
 *
 * `npx genex ui trim` reported speckleRatio 0.0015 (the angel mark was a clean
 * 0). That is 15 stray pixels in ten thousand, which is the pixel-art edge the
 * style asks for rather than the checkerboard-painted-in-as-pixels damage that
 * made the ORIGINAL 2003 wordmark ship as a white slab across the key art.
 */
/**
 * BACK TO ROUND ONE, 2026-07-29, after all three had been seen on the live
 * title screen: *"return original that we made — like [angel], first version of
 * logo."* The bubble and throw-up marks stay on disk; switching between any of
 * the three is this one line, which is the whole reason each round was trimmed
 * to its own file rather than overwriting the last.
 */
const LOGO_URL = "./ui/logotype-angel.png";
const MOTION_SET_URL = "./motion-sets/skate.json";
/** Yaw that turns the rig sideways on the deck — regular stance. */
const SKATER_YAW = -Math.PI / 2;

/**
 * THE PLAYABLE BODIES, and the one list that says which of them you ride.
 *
 * The title screen picks from this and the boot rides `[0]`. Both are Meshy
 * bipeds and they turn out to be far more interchangeable than their manifests
 * claim: identical bone names, identical hierarchy, identical parents, and every
 * hand-authored clip binds 24/24 on both, with every animated bone landing
 * within a third of a degree. The `skeletonSignature` mismatch between the two
 * manifests never touches the ride at all — that gate lives inside
 * `loadMeshyCharacter`, and the ride loads a bare GLB.
 *
 * `posture` is where they stop being interchangeable, and only the grab does.
 * The Timekeeper has 5.4 cm more leg and 4.3 cm less foot, which lifts the deck
 * that much higher relative to his body under the same tuck — his wrist landed
 * 1.8 cm INSIDE the griptape, planted flat in the middle of the board instead of
 * hooked on the toe-side rail, with his free hand back down at 8.5 cm. That is
 * the two-hands-on-one-board shape the player rejected this morning, arriving
 * again by the back door. `fold: 96, reach: 16` puts his hand 6.1 cm off the
 * deck at x = −10.9 — the rail to within 4 mm. Nothing else in the posture
 * table needed touching: the depth ladder is a fraction of each body's OWN
 * crouch, and the two crouches bottom out 2 mm apart.
 */
interface PlayableBody {
  id: string;
  name: string;
  manifestUrl: string;
  modelUrl: string;
  /** Absent means this body IS what the posture table was swept against. */
  posture?: PostureTweak;
  /**
   * His re-generated idle, played instead of the manifest's PINNED
   * `idle.default` slot — see `StageBody.idleUrl` in `ui/menu-stage.ts`.
   */
  idleUrl?: string;
}

/**
 * THE LOCAL IS NO LONGER PLAYABLE, by the player's own call (2026-07-29):
 * *"make the local — act like NPC only, dont able to pick him as playing
 * character for now."* He is not deleted and nothing about him regressed — his
 * rig is now the body the plaza's mission-giver wears (`world/npc.ts` reads
 * `meshy-character.json`), which is the whole of what "NPC only" means here.
 * Putting him back in the picker is one entry in the list below; that is why
 * this reads as a commented row rather than a deletion. His rig lives at
 * `https://assets.auras.cc/generations/cms0fbiar004o22nuyjqjhzuz/rigged-character.glb`
 * — kept here in prose because `noUnusedLocals` will not tolerate a constant
 * that only a commented row reads.
 */
const CHARACTERS: readonly PlayableBody[] = [
  // { id: "skater", name: "The Local", manifestUrl: "./assets/meshy-character.json",
  //   modelUrl: SKATER_URL },  ← NPC-only until the player asks for him back
  {
    id: "clockman",
    name: "The Timekeeper",
    manifestUrl: "./assets/meshy-npc.json",
    modelUrl: "https://assets.auras.cc/generations/cms5uxuo500ea22lb0sccf64o/rigged-character.glb",
    posture: { Grab: { fold: 96, reach: 16 } },
    idleUrl:
      "https://assets.auras.cc/generations/cms66dbk0004q22obvp6ll8hc/character-motion-uthana-m41JTQ4YgRMG-glb",
  },
  /**
   * THE SECOND BODY, rigged 2026-07-29 after five concept rounds.
   *
   * The four rounds before this one all failed for the same reason, and it was
   * not the generator: every brief had been written as Y2K SPORTSWEAR — platinum
   * dye, technical zip jackets, tearaway track pants — against the player's own
   * reference photos, which are 2003 INDIE SLEAZE: long undyed hair, a velvet
   * corset top, low-rise baggy distressed jeans, studded belts, an earthy
   * brown/olive/plum palette. Two different decades. Re-briefing from the photos
   * fixed it in one round.
   *
   * The round after THAT was the rig, not the look: her first 3D
   * (`cms685c0a…`) is a one-of-one the API will not rig — Meshy failed it with
   * `native motion QA: persistent-leg-crossing`, retries hit an idempotency
   * wall, and re-requesting the preview returns the same id. Feet together plus
   * wide legs fuse into one silhouette the rigger cannot split. Every brief
   * since carries the A-pose leg gap explicitly, which is why this one rigged.
   *
   * SHE IS HELD OUT OF THE PICKER, and it is not a taste call — she would ride
   * FOLDED. This was swept, not skipped (`tools/grab-sweep.mjs`): 320 poses of
   * fold x reach found nothing, so the net was widened to the whole shape —
   * 8 tucks x 18 folds x 16 reaches, 2,304 poses — and ZERO of them put her hand
   * on the toe-side rail with the board brought up to her.
   *
   * The cause is upstream of the posture table and it breaks far more than the
   * grab. The hand-authored clips are played RAW at the rig, and a quaternion
   * track REPLACES a bind rotation rather than composing with it, so a clip only
   * means what it meant on the skeleton it was written on. Her local rest
   * rotations sit **138.6 degrees** from that skeleton (Spine02 138.6, Hips
   * 136.1, both UpLegs over 135) where The Timekeeper's worst bone is 35.4 — and
   * he is the one who works. In her rolling stance Spine02 lands 6.4 cm BELOW her
   * own hips and her shoulder 39 cm lower than the retargeted set puts it, so the
   * deck — which rides her soles in the air — ends up above her shoulder. No
   * fold/reach pair can reach a board that is over your shoulder.
   *
   * Her GLB is not the problem: in bind she measures like her neighbours to the
   * centimetre, and her segment lengths are ordinary. Every hand-authored clip
   * breaks on her — rolling stance, ollie, push, crouch — so this is not a grab
   * bug, and it is NOT a video-to-motion job either: a new clip would be authored
   * on the same rig and break the same way. It needs the clips RETARGETED onto
   * her rest frame, or a re-rig.
   *
   * All three manifests claim `poseMode: a-pose`, `meshy-6`, 1.7 m — and three
   * DIFFERENT `skeletonSignature`s. That gate lives inside `loadMeshyCharacter`
   * while the ride loads a bare GLB, so nothing was ever going to catch this.
   *
   * Uncommenting the row is the whole of putting her back once that is fixed.
   */
  // {
  //   id: "runaway",
  //   name: "The Runaway",
  //   manifestUrl: "./assets/meshy-girl.json",
  //   modelUrl: "https://assets.auras.cc/generations/cms69mf2z00aj22obb71wt0hq/rigged-character.glb",
  //   idleUrl:
  //     "https://assets.auras.cc/generations/cms69uf4e00cc22obqh885k87/character-motion-uthana-mgcXqYoWoz8M-glb",
  // },
];

/**
 * The loader and the last rung it reached — both reachable from the boot's own
 * failure handler at the bottom of this file. See the comment on `boot().catch`
 * there for why a bar frozen at a number, with no message, is the one outcome
 * this game must never produce again.
 */
let bootHud: Hud | null = null;
let bootProgress = 0;

/** One rung of the loading bar. Identical to `hud.setProgress`, except that it
 *  REMEMBERS where the bar got to, so a boot that dies can say so without
 *  either jumping the bar to 100% (which reads as success) or dropping it to 0
 *  (which reads as a restart). */
function bootStep(fraction: number, status: string): void {
  bootProgress = fraction;
  bootHud?.setProgress(fraction, status);
}

async function boot(): Promise<void> {
  const hud = new Hud();
  bootHud = hud;
  hud.setLoaderArt(LOADER_ART_URL);
  hud.setLoaderLogo(LOGO_URL);
  bootStep(0.1, "Waking the block…");

  const tier = detectTier();

  const renderer = new THREE.WebGLRenderer({
    // `true` = a composer WILL run, so the context's own MSAA is switched off:
    // it would multisample a default framebuffer the composer never reads, and
    // pay full memory and fill for it. AA comes from the composer target's
    // `samples` instead — see `src/render/look.ts`.
    antialias: rendererAntialias(tier, true),
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dprCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = tier.shadowMapSize > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Renderer baseline, set deliberately: a warm filmic roll-off with exposure
  // pushed slightly hot is what gives the grass that late-afternoon blown-out
  // PS2 look instead of a flat sRGB dump.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    600 * tier.drawDistanceScale,
  );

  // The game has two spots now, and the menu picks which one gets built. The
  // ride never learns which world it is on — it holds a `SurfaceProvider` and
  // asks it how high the floor is — so a spot change is: unmount the old nodes,
  // mount the new ones, hand the ride the new provider, reset to its spawn.
  let world: MountedMap = mount(getMap("street"), scene, tier);
  let field = world.field;
  /**
   * The mounted map's OWN fog distance, kept so the governor's draw-distance
   * rung has a base to scale against. Re-read on every spot change — the two
   * maps fog at wildly different ranges (a 66 m block against a 450 m channel)
   * and a single constant would blind one of them.
   */
  let fogFar = scene.fog instanceof THREE.Fog ? scene.fog.far : 0;
  bootStep(0.3, "Pouring the concrete…");

  // The whole image lives in one module — see `src/render/look.ts` for why the
  // register is PS2 and not PS1. This is the only seam it has: build it, draw
  // through it, forward resizes.
  const look = createLookStack(renderer, scene, camera, tier);

  // The camera is one module — see src/camera/skate-camera.ts. main.ts builds
  // it, tells it where the skater is, and updates it. Nothing else.
  const followCam = createSkateCamera(camera, renderer.domElement);

  // The tier, so a phone gets half the polyphony — peak simultaneous decoders is
  // what actually kills a mobile tab, not total file size.
  const audio = new GameAudio(tier);
  const rig = new SkaterRig(scene);

  let paused = false;
  let anim: SkaterAnim | null = null;
  let ragdoll: Ragdoll | null = null;

  const skate = new SkateModel(
    {
      onPush: (span: number) => {
        anim?.startPush(span);
        // The rig-level compression only sells the push when no clip does.
        if (!anim || anim.usingGeneratedPush) rig.pulsePush();
      },
      // Space down = sink into the wind-up; Space up = spring out of it, which is
      // the pop below. Holding longer just holds the crouch — the height of the
      // ollie is unchanged.
      onCharge: (winding: boolean) => {
        if (winding) anim?.startCharge();
        else anim?.endCharge();
      },
      onPop: (trick: TrickName, airTime: number) => {
        anim?.playTrick(trick, airTime);
        audio.play("pop", trick === "Kickflip" ? 1 : 0.85);
      },
      // The bank is deferred to this frame's `hud.update()` on purpose: the
      // model announces the LANDING before the trick that landed on it, so a
      // combo closed here would shut one link short and open the next line
      // with the trick that should have finished this one.
      // `slam` is the vertical his legs could not absorb, 0 for every ordinary
      // landing. Height stopped being a hazard this round — you ride away from
      // anything you land square — so this is the whole of what "that was a big
      // one" looks and sounds like: he folds deeper, the slap is louder, and
      // the body itself thumps. The combo SURVIVES, deliberately; the concrete
      // already took its cut out of his roll speed and taxing him twice for
      // landing big is the rule we just removed wearing another hat.
      onLand: (_trick: TrickName | null, streak: number, slam = 0) => {
        audio.play("land", Math.min(1, 0.8 + slam * 0.05));
        anim?.playCushion(slam); // take the landing on bent knees
        if (slam > 0) audio.bodyImpact(slam);
        hud.bankCombo(streak);
      },
      // The same bank, minus everything that belongs to a touchdown: a manual
      // let go of on flat ground ends its line with the wheels already rolling,
      // so there is no thud to play and no cushion to take. Without this the
      // line just sat there — five clean manuals in a row scored nothing until
      // the player happened to take an air.
      onGroundClose: (streak: number) => hud.bankCombo(streak),
      onBail: () => {
        audio.play("bail", 0.9);
        hud.loseCombo();
      },
      // Every trick the book banks, however it was earned — a flip, a grind
      // ending, a manual running out. `name` already carries the spin and the
      // stance ("Switch 360 Heelflip"), so nothing here composes a word.
      onTrick: (_id: TrickId, name: string, score: number) => hud.addLink(name, score),
      onGrindStart: (kind: GrindKind, line: GrindLine) => {
        audio.startGrind(kind, line.surface);
        const name = skate.tricks.def(kind).name;
        // The callout the instant he locks on, not when he steps off it. The
        // HUD replaces this provisional link with the scored one at the bank.
        hud.openLink(name);
        // No badge for a grind: the balance gauge below is already the "still
        // holding it" read, and the rail is the only held trick that has one.
        // The body drops into the grind's own posture — a real hip drop and
        // arm shape per kind, off the crouch clip, since no grind clip exists.
        anim?.holdTrick(name);
      },
      onGrindEnd: (bailed: boolean) => {
        audio.endGrind(bailed);
        anim?.holdTrick(null);
      },
      onSpin: (degrees: number) => hud.addSpin(degrees),
      // The wheels are running the other way, so he turns round on the deck to
      // face his line — the same clip, carried a half-circle round.
      onStance: (stance: Stance) => {
        anim?.setStance(stance);
        hud.setStance(stance);
      },
      // Both manuals come off one crouch, but they are not one trick: E rides
      // the tail and Q rides the nose, the deck rakes the other way for each,
      // and the body puts its weight over the truck that is still down.
      onManual: (on: boolean, nose = false) => {
        const name = nose ? "Nose Manual" : "Manual";
        anim?.holdTrick(on ? name : null);
        hud.setHeld(on ? name : null);
        // …and the manual's actual job: it takes the LINE over from the landing
        // that armed a bank a frame ago. The ride decides a landing while its
        // own state still says `air`, so the frame that touches down cannot be
        // the frame a ground trick starts on — the manual is announced on the
        // NEXT one, by which time the bank had already cashed and a flip landed
        // into a manual paid out and opened a fresh line underneath him.
        // `null` is a no-op: the bank that ends a manual arrives on its own,
        // through `onGroundClose`.
        hud.carryCombo(on ? name : null);
      },
      // The grab is a held trick like the manual, and the flavour IS the
      // callout — one clip, four names, picked off the stick as he reaches.
      // The body has no grab take of its own (the motion vendor ran dry), so
      // what it does is sink and drop the hand toward the deck; honest, and
      // better than Shift moving nothing at all. `openLink` puts the name in
      // the combo line straight away, and the scored link replaces it at the
      // bank the way a grind's does.
      onGrab: (flavour: string | null) => {
        anim?.holdTrick(flavour ? "Grab" : null);
        hud.setHeld(flavour);
        if (flavour) {
          hud.openLink(flavour);
          // No hand-on-griptape sample exists, and the reach is a whoosh-shaped
          // moment — so the flip whoosh covers it rather than nothing at all.
          // Quieter than a flip's: grabbing out of a kickflip fires both, and
          // the reach is the softer of the two.
          audio.flipWhoosh(0.32);
        }
      },
      // He hit something. `into` is the speed that went square into the face,
      // so a kerb clipped at an angle and a wall taken head-on are the same
      // event at two volumes. Sound only, and on purpose: the line SURVIVES a
      // wall — you lose the speed, not the combo — so there is nothing here for
      // the HUD to announce that the speed bar dropping to nothing does not
      // already say. Past `WALL_SLAM` the ride bails him and the clatter and the
      // body land on top of this, which is what a real crash sounds like.
      onWallHit: (into: number) => audio.wallHit(into),
      onRagdoll: (impact: THREE.Vector3) => {
        ragdoll?.start(impact);
        // With no bones for physics to own, no contact is ever reported — so
        // the bail itself is the only body sound there is going to be.
        if (!ragdoll) audio.bodyImpact(impact.length());
      },
    },
    // The street spot, not the grass field: one argument is the whole world
    // swap, because the ride only ever ASKS the surface how high the floor is.
    field.surface,
  );

  const input = new SkateInputSource();
  input.attach();

  // --- streamed content ------------------------------------------------------
  const gltf = createGltfLoader(renderer);

  // The game AROUND the ride: the guy who starts a run, the minute itself, and
  // the board the minute goes on (see src/game/index.ts). It is built here, one
  // frame's worth of plumbing, because free-roam is the default state and this
  // is a layer laid OVER it — nothing below this line knows a run exists, and a
  // player who never rolls up to the NPC still has both maps and every trick.
  // The loader is handed over so his body takes the same quality rungs the rest
  // of the game's models do; it is the same Meshy rig the player wears.
  const runGame = new RunGame({
    scene,
    hud,
    loader: gltf.loader,
    // The NPC's line goes through the game's own mixer rather than an element of
    // his own, so it ducks the music for its length like every other voice.
    speak: (url) => audio.voice(url),
  });
  runGame.setWorld(field.surface);

  bootStep(0.45, "Grip tape and trucks…");
  const boardJob = rig.loadBoard(tier, gltf).catch((e) => console.warn("[board]", e));

  bootStep(0.6, "Lacing up…");
  /**
   * Everything that has to happen to a freshly-loaded body before it can be
   * ridden. Lifted out of the boot's own `.then` so the title screen's
   * character picker can run the identical path — a second rider must not be a
   * second, thinner setup that quietly skips the stance catch-up or the
   * ragdoll.
   */
  const mountSkater = async (a: SkaterAnim): Promise<void> => {
      anim = a;
      rig.setCharacter(a.model, SKATER_YAW);
      // `onStance` is an EDGE — it fires on the frame he turns round and never
      // again — and every listener of it is written `anim?.`, which silently
      // does nothing while the body is still streaming. A character that
      // arrives after a stance change has therefore missed the only
      // announcement there was, and would ride switch with regular clips for
      // the rest of the run. Catching up is one line and it costs nothing when
      // there was nothing to miss.
      a.setStance(skate.stance);
      // Every hand-authored move in one call. Built on this exact skeleton, so
      // they beat anything the compiled set can do; any that doesn't bind falls
      // back silently, which is what the seven trick clips still waiting on the
      // motion vendor do today.
      await a.attachHandClips();
      // Physics only ever gets the bones on a bail, and it is the LAST writer
      // on them when it does — so it is built here, over the same skeleton the
      // animation layer just claimed, and nothing else touches those bones
      // while `ragdoll.running`.
      ragdoll = createRagdoll({
        root: a.model,
        surface: skate.surface,
        // A fall reports 11–17 contacts. The heavy three are the ones you hear
        // land; a hand or a foot slaps, lighter and only if it arrives with
        // something behind it — otherwise a slide-out reads as a drum roll.
        onImpact: (hit) => {
          const heavy = hit.part === "head" || hit.part === "torso" || hit.part === "hips";
          if (!heavy && hit.speed < 4) return;
          audio.bodyImpact(heavy ? hit.speed : hit.speed * 0.5);
        },
      });
      // The model stands him up when the BODY says it has stopped moving; the
      // recover timer is only the ceiling over that. Without this handover it
      // falls back to the flat timer — a tip-over that came to rest in half a
      // second left him lying on the concrete for a second more.
      skate.body = ragdoll;
  };

  const skaterJob = SkaterAnim.create(CHARACTERS[0].modelUrl, MOTION_SET_URL, CHARACTERS[0].posture)
    .then(mountSkater)
    .catch((e) => console.warn("[skater]", e));

  /**
   * The title screen's picker, made to mean something.
   *
   * It runs on the PICK rather than on DROP IN, and that is the whole design:
   * `SkaterAnim.create` measures 3.5–3.6 s, and spending it at DROP IN would be
   * a three-and-a-half second stall between a click and a game. Spent here it is
   * free — the player is standing on the title screen looking at the body he
   * just chose, and the menu's own stage is loading that same rig anyway.
   *
   * `rig.setCharacter` clears the old body, so this cannot stack riders. The
   * boot's own load is `pending` at index 0, so choosing the character who is
   * already on the board costs nothing.
   */
  let ridingIndex = 0;
  let swapJob: Promise<void> = Promise.resolve();
  const swapSkater = (index: number): void => {
    if (index === ridingIndex) return;
    const body = CHARACTERS[index];
    if (!body) return;
    ridingIndex = index;
    // Serialised behind whatever load is already in flight — a player leaning on
    // the arrow keys can outrun a 3.5 s fetch, and two `mountSkater` calls
    // interleaving would build two ragdolls over two skeletons and hand
    // `skate.body` the loser.
    swapJob = swapJob
      .then(async () => {
        if (ridingIndex !== index) return; // he moved on while this loaded
        const a = await SkaterAnim.create(body.modelUrl, MOTION_SET_URL, body.posture);
        if (ridingIndex !== index) return;
        await mountSkater(a);
      })
      .catch((e) => console.warn("[skater] swap", e));
  };

  const dressJob = world.map
    .dress(scene, field, tier, renderer, gltf)
    .catch((e) => console.warn("[spot]", e));

  await Promise.all([boardJob, skaterJob, dressJob]);
  bootStep(0.9, "Dropping in…");

  // --- runtime plumbing ------------------------------------------------------
  /**
   * The frame the loop is PACED to, in fps — `0` would mean uncapped, which no
   * tier asks for. It is a variable rather than `tier.frameCap` read in place
   * because the governor's last rung moves it (down to 30) and its recovery
   * moves it back, and because the loop below is the only thing that may act on
   * it: a cap is a pacing decision, never a picture one.
   *
   * On every desktop tier this is 60 (240 on `desktop-high`), and the skip test
   * in the loop is written so that neither number can ever skip a frame.
   * `phone-low` is the tier that asks for 30 from boot — its own table entry
   * says so, and until now nothing in the game read it.
   */
  let frameCap = tier.frameCap;
  /**
   * The last frame the loop actually RENDERED, in `performance.now()` ms. It is
   * declared up here rather than beside the loop because the visibility handler
   * below re-seats it, and that handler can fire during the awaits between here
   * and there.
   */
  let last = performance.now();
  /** Is the tab in the background? Nothing is drawn and nothing is simulated
   *  while it is — see the `visibilitychange` handler. */
  let hiddenTab = document.visibilityState === "hidden";

  const governor = new QualityGovernor(
    tier,
    {
      // THE LAST RUNG, and until now the only callback this game never passed —
      // so the governor reached the bottom of its ladder, called an undefined
      // optional, and advanced for free. A rung that no-ops is worse than a rung
      // that is missing: the ladder spends it, counts it as applied, and steps
      // UP out of it twenty seconds later as if it had helped.
      setFrameCap: (fps) => {
        frameCap = fps > 0 ? fps : tier.frameCap;
      },
      setDprScale: (m) =>
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dprCap * m)),
      // The governor's LAST-BUT-ONE rung, and the most visible thing in the
      // ladder — the grade, the bloom, the AO and the metering all leave at
      // once. It sits deliberately behind two resolution steps, the shadow map
      // and the draw distance, and it is skipped outright below when the
      // player has picked a preset by hand.
      //
      // It used to be SECOND, which is what the player was reporting when he
      // said the lighting "офается" a few seconds into a run: the old budget
      // (24.67 ms) sat inside the vsync dead zone, so a game pacing at a solid
      // 30 fps reported 33.3 ms on every frame and was over budget on every
      // frame — and the boot's own frames were judged too, so a rung was
      // already spent 2.2 s before he pressed DROP IN.
      setPostEnabled: (on) => look.setPostEnabled(on),
      // Fog is the world's, so the rung that shortens draw distance has to
      // reach into whatever map is currently mounted rather than a constant.
      setDrawDistanceScale: (m) => {
        camera.far = 600 * tier.drawDistanceScale * m;
        camera.updateProjectionMatrix();
        const fog = scene.fog;
        if (fog instanceof THREE.Fog) fog.far = fogFar * m;
      },
      setShadowQuality: (level) => {
        if (!field.sun.castShadow) return;
        // ASK THE FIELD, NOT THE TIER. The field now picks its own map size —
        // 3072 on the two tiers that already pay for GTAO and 4x MSAA, vetoed
        // down on everything phone-class — and `tier.shadowMapSize` is 2048.
        // Reading the tier here would have quietly thrown the sharper map away
        // the first time the governor stepped quality back up.
        const full = field.shadowMapSize ?? tier.shadowMapSize;
        field.sun.shadow.mapSize.setScalar(
          level === "full" ? full : Math.max(256, full / 2),
        );
        if (field.sun.shadow.map) {
          field.sun.shadow.map.dispose();
          field.sun.shadow.map = null;
        }
      },
    },
    renderer,
    {
      // A governor may rescue a machine. It may not silently overrule a choice
      // the player made on the settings screen: if he picked a preset rather
      // than leaving it on Auto, the post chain is his, not the ladder's. Read
      // live, so changing the preset mid-session is honoured immediately.
      //
      // This skips ONE rung, not the ladder — every other step still applies,
      // so a phone pinned to `high` is still rescued. It just never gets
      // silently re-graded behind the player's back.
      postIsPlayerChoice: () => getQualitySetting() !== "auto",
    },
  );

  // Resize storms leak GPU memory on iOS — one trailing setSize per burst.
  let resizeTimer: number | undefined;
  const onResize = (): void => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      look.resize(window.innerWidth, window.innerHeight);
    }, 120);
  };
  window.addEventListener("resize", onResize);

  let contextLost = false;
  renderer.domElement.addEventListener("webglcontextlost", (e: Event) => {
    e.preventDefault();
    contextLost = true;
    hud.showCentre("HOLD ON", "Restoring…", true);
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    hud.hideCentre();
  });

  /**
   * The phone's controls, or `null` on every desktop. Declared up here rather
   * than at the creation site below because `setPaused` is the one place that
   * already knows whether the game is being played, and that is exactly the
   * question the touch layer needs answered — so it gets answered once, for
   * both.
   */
  let touch: TouchControls | null = null;

  const setPaused = (value: boolean): void => {
    paused = value;
    // ONE expression decides who owns the pointer, and it has three claimants:
    // the pause card, the results card, and the NPC's quest card. They overlap —
    // pausing over a results readout and resuming would otherwise re-capture the
    // mouse and leave GO AGAIN and FREE RIDE on screen but unclickable.
    followCam.setPaused(value || hud.wantsCursor || dialogueOpen() || lookLab.isOpen);
    audio.duck(value);
    // …and the same fact for the thumbs. It also DROPS whatever one was holding:
    // hiding a pressed DOM button fires no `pointerup`, so without this a pause
    // card opening under a finger on OLLIE would leave him crouched behind it and
    // pop him on the way out. `null` on desktop, where this is one
    // optional-chain miss and nothing else.
    touch?.setPlaying(!value);
    if (value && !atTitle) pause.open();
    else pause.close();
  };

  // The title screen owns the first moment: the world renders behind it but
  // nothing steps until DROP IN. `paused` is what holds the sim, so the menu
  // simply sets it — there is no second copy of "is the game running".
  /**
   * Build a different spot in place. Everything that reads the world reads it
   * through `field` or through `skate.surface`, so this is the whole swap.
   *
   * The sun offset that used to be captured here is GONE — `field.trackShadow`
   * owns the light's follow now, and it reads the offset off the rig the map
   * itself built, so a spot change needs no second copy of it.
   */
  const goToSpot = (id: MapId): void => {
    if (id === world.map.id) return;
    world.unmount();
    world = mount(getMap(id), scene, tier);
    field = world.field;
    fogFar = scene.fog instanceof THREE.Fog ? scene.fog.far : 0;
    skate.surface = field.surface;
    // The NPC is replanted from the new spot's own spawn, and a run that was
    // live is thrown away — the minute it was being ridden for is on a block
    // that no longer exists.
    runGame.setWorld(field.surface);
    // Map 2 must not sound like a city: its own track, its own canyon air, and
    // a windier speed curve. Without this line both spots play map 1's bed.
    audio.setMap(id);
    ragdoll?.release();
    skate.reset();
    hud.resetRun();
    // The tuning panel holds a reference to the light rig, and the line above
    // just replaced it. Without this its sun sliders would keep driving the
    // OLD map's sun — a light that is no longer in the scene.
    lookLab.setField(field);
    void world.map
      .dress(scene, field, tier, renderer, gltf)
      .catch((e) => console.warn("[spot]", e));
  };

  let atTitle = true;
  const menu = new Menu({
    logoUrl: LOGO_URL,
    stillUrl: MENU_ART_URL,
    spots: maps().map((m) => ({ id: m.id, name: m.name })),
    /**
     * THE BODY THE TITLE SCREEN SHOWS IS THE ONE THE LOADER ALREADY FETCHED.
     *
     * The player's ask: *"перс должен прилоудиться когда идет лоудер главный
     * игры."* The RIDING body always was preloaded — `skaterJob` is inside the
     * `Promise.all` the loader waits on. The one he was watching arrive late is
     * the figure standing in the shop, because `MenuStage` fetched and parsed
     * its own second copy of the same GLB after the loader had already gone.
     *
     * Handing it `object3D` is the whole fix: the stage clones a skeleton it is
     * given instead of going to the network, so the shop is furnished on the
     * first frame the title screen exists. It costs one clone, not one fetch,
     * one parse and one more copy of the same textures in GPU memory — which
     * also happens to be the cheapest thing said all day for the phone budget.
     *
     * Only the ridden entry gets it; the rest still stream on demand, which is
     * correct — a body nobody has arrowed to yet should not be on the boot path.
     *
     * A GETTER, not a value, and that is the whole difference between this and
     * the version that shipped: this object literal is evaluated ONCE, when the
     * menu is constructed, but the stage re-clones on EVERY arrival at the title
     * screen (DROP IN disposes it, MAIN MENU rebuilds it) and `swapSkater`
     * reassigns both `anim` and `ridingIndex` in between. Frozen at boot, the
     * roster would keep handing over the rig from the moment of construction —
     * so after a swap the shop would furnish itself with a body nobody is
     * riding. Reading through the getter means the stage always gets the rig
     * that is live NOW. Today the roster is effectively one body, so the bug
     * could not fire; that is a reason it was easy to miss, not a reason to
     * leave it. `?? undefined` because the menu's contract is "a body or
     * nothing" and `null` is neither.
     */
    characters: CHARACTERS.map((c, i) => ({
      ...c,
      get object3D() {
        return i === ridingIndex ? (anim?.model ?? undefined) : undefined;
      },
    })),
    // The pick IS the rider — see `swapSkater`. Fires once at boot for index 0,
    // which is already the body the boot loaded, and `swapSkater` no-ops on it.
    onCharacter: (_body, index) => swapSkater(index),
    onPlay: (spotId) => {
      goToSpot(spotId as MapId);
      atTitle = false;
      // DROP IN is a click, and a click is the gesture browsers want before
      // any audio may start. Unlocking anywhere else meant a player who never
      // touched the keyboard rolled off the title screen in silence.
      audio.unlock();
      hud.setVisible(true);
      setPaused(false);
    },
  });
  // The picture ladder and the two volume levels. It opens over the pause card
  // and over the title screen, and it puts itself away — the boot's pause flag
  // is untouched, so Escape here closes this and Escape again resumes.
  const lookLab = createLookLab({ renderer, scene, look, field });
  const settings = new SettingsScreen({
    look,
    audio,
    /**
     * THE LAB'S DOOR IS SHUT — 2026-07-29, at the player's word: *"и скроем
     * панель настроек пока"*, sent in the same breath as the two numbers he
     * dialled with it. The lab did its job: `SUN_AZIMUTH` and the key's
     * intensity in `world/field.ts` are his, measured on the live plaza, and
     * the tool that produced them is not something a player should meet.
     *
     * Passing no `onLookLab` is the whole mechanism — `SettingsScreen` only
     * grows the row when the callback exists, so the settings list loses it
     * and nothing else changes. `ui/look-lab.ts` and its wiring stay on disk
     * and stay compiled, because he said *"пока"* and because the next round
     * of tuning should not have to rebuild the panel. Re-open it by handing
     * the callback back:
     *
     *     onLookLab: () => { lookLab.open(); settings.close(); setPaused(false); },
     *
     * That is also why `createLookLab` above still runs: it costs one hidden
     * DOM node, and it keeps the panel honest — code that is never constructed
     * is code that has quietly stopped working by the time you want it.
     */
  });

  const pause = new PauseScreen({
    onResume: () => setPaused(false),
    onSettings: () => settings.open(),
    // Offered only while a minute is genuinely on — the run is asked, never guessed.
    canRestart: () => runGame.run.running,
    onRestart: () => {
      runGame.run.restart();
      ragdoll?.release();
      skate.reset();
      hud.resetRun();
      setPaused(false);
    },
    // `atTitle` first, so the setPaused below CLOSES this card instead of
    // reopening it, and so the teardown under it cannot re-grab the pointer.
    onMainMenu: () => {
      atTitle = true;
      setPaused(true);
      runGame.run.cancel();
      ragdoll?.release();
      skate.reset();
      hud.resetRun();
      hud.setVisible(false);
      menu.setPhase("menu");
    },
  });

  // FREE RIDE — the other half of the results card. GO AGAIN is already wired
  // inside RunGame, through the same gate the NPC's trigger goes through.
  hud.onFreeRide = () => runGame.run.dismiss();
  // The results card wants the mouse back; the follow camera is the one door
  // the pointer lock goes through.
  hud.onResultsCursor = () => setPaused(paused);

  hud.setVisible(false);
  setPaused(true);

  window.addEventListener("keydown", (e: KeyboardEvent) => {
    audio.unlock();
    if (e.code === "Escape" && !atTitle) setPaused(!paused);
  });
  renderer.domElement.addEventListener("pointerdown", () => audio.unlock());

  /**
   * …and Escape's counterpart on a phone, plus the thumbs themselves.
   *
   * AWAITED: on a phone the controls have to exist before the loader comes down,
   * because a game you can see and cannot steer is the whole defect this layer is
   * here to fix. On desktop the call returns `null` from one `matchMedia` read
   * without importing anything, so the await is a microtask and the DOM is
   * untouched.
   *
   * Built AFTER the `setPaused(true)` above, which is why the widgets start
   * hidden by construction and the first thing that shows them is DROP IN.
   */
  touch = await createTouchControls({
    input,
    // The same intent Escape raises, through the same door.
    onPause: () => setPaused(!paused),
    // Held sideways is the only way this game reads (the 62° field of view is
    // VERTICAL, so portrait sees 32° across against landscape's 100°). The
    // overlay asks; this holds the player's minute while it is up. Deliberately
    // NOT symmetric — coming back out through the pause card's own button is the
    // honest way back into a run you were in the middle of.
    onOrientationBlock: (blocked) => {
      if (blocked && !paused) setPaused(true);
    },
  });

  // The animated backdrop is minutes behind the rest of the boot, so the menu
  // opens on the key art and upgrades itself in place when the loop lands.
  // Phone tiers keep the still: two preloading HD decoders while the scene is
  // still booting is the memory spike phones get killed for.
  const bigEnoughForVideo = tier.name !== "phone-low" && tier.name !== "phone";
  if (MENU_VIDEO_URL && bigEnoughForVideo) {
    fetch(MENU_VIDEO_URL, { method: "HEAD" })
      .then((r) => {
        if (r.ok) menu.playBackdrop(MENU_VIDEO_URL);
      })
      .catch(() => {});
  }

  // Switching away silences the game but does NOT throw up the pause modal —
  // the per-frame delta is clamped, so coming back never teleports the skater,
  // and a player who tabbed out to answer a message returns straight to play.
  //
  // It now also STOPS THE LOOP, which is the half that was missing. A
  // backgrounded game that keeps drawing is pure thermal debt on the one device
  // class that cannot afford it — a phone in a pocket, throttling itself for a
  // frame nobody is looking at, so that the game is already hot when the player
  // comes back to it. The governor has held its own `paused` flag off this same
  // event since it was written (`governor.ts`); this is the game's loop learning
  // the same lesson from the same signal.
  //
  // `last` is re-seated on the way back in so the first visible frame measures
  // itself against the moment the tab returned, not against the moment it left.
  document.addEventListener("visibilitychange", () => {
    hiddenTab = document.hidden;
    audio.duck(document.hidden || paused);
    if (!hiddenTab) last = performance.now();
  });

  // SHADERS, BEFORE THE BAR GETS TO THE END — never in front of it. Every
  // material in the mounted block compiles on the frame it is first seen
  // otherwise, which is the frame the player has just been handed the controls
  // on: measured at phone tier, worst frames of 114.8 and 274.0 ms on runs whose
  // MEAN was 2.1 ms, and one 695 ms frame of which only 72.6 ms was inside the
  // game's own callback — the rest was the browser's pipeline compiling and
  // uploading. A CPU profile of a 6.9 s GAMEPLAY sample still had 78.6 ms of
  // `texSubImage2D` in it: textures uploading while he rides.
  //
  // Behind the loader it costs boot time, which is this game's worst number
  // already, so it is the LAST thing before the bar closes and it can never
  // fail the boot: a driver without KHR_parallel_shader_compile just makes this
  // synchronous, and a rejection means the first frames compile the way they
  // always did.
  //
  // ── THE `.catch` ALONE DOES NOT MAKE THAT TRUE, AND THIS IS WHERE A LOADER
  //    WOULD PARK AT 96% FOREVER. ────────────────────────────────────────────
  //
  // `WebGLRenderer.compileAsync` is `return new Promise( ( resolve ) => … )`
  // (three r185, `three.module.js` :17488) and **contains no `reject` at all**.
  // Its only exit is `checkMaterialsReady` finding `program.isReady()` true for
  // every material, re-armed with `setTimeout( …, 10 )` until it does. So a
  // driver that never reports `COMPLETION_STATUS_KHR`, or a context lost while
  // the pipeline is compiling, does not reject — it polls every 10 ms for the
  // rest of the session, and a `.catch` on a promise that never settles catches
  // nothing. The bar sits at 96% with nothing in flight.
  //
  // A deadline restores the property the comment above already claims: this
  // step cannot fail the boot. Timing out costs exactly what a rejection costs
  // — the first frames compile the way they always did — and 20 s is far past
  // any real compile (measured at 5.4 s on the deployed build's whole desktop
  // scene, and this is the shorter phone-tier material set), so a machine that
  // is merely slow is never cut short.
  bootStep(0.96, "Warming the shaders…");
  await Promise.race([
    renderer.compileAsync(scene, camera),
    new Promise((resolve) => setTimeout(resolve, 20_000)),
  ]).catch((e) => {
    console.warn("[quality] precompile", e);
  });

  bootStep(1, "Go");
  hud.hideLoader();

  // --- the loop --------------------------------------------------------------
  //
  // WHO OWNS WHAT, each frame, in this order — three things now change hands
  // mid-run, so the rule is written down rather than remembered:
  //
  //   skate.update      the ride's own state. On a grind it stops integrating
  //                     position and takes it off the line instead; on a bail it
  //                     stops being a skater at all. It also READS the body
  //                     back — `skate.body` is the ragdoll, and its `settled` is
  //                     what stands him up — so this line sees a physics state
  //                     one frame old. That is fine for a thing that takes about
  //                     a second, and it is the only backwards arrow here.
  //   rig.sync          every node down to the deck, from that state. The deck's
  //                     yaw across a grind line is one of them, and since round 2
  //                     it is STEERABLE — the Grinder turns a sideways deck back
  //                     square under A/D — so this reads the Grinder's own number
  //                     every frame rather than a constant set at the lock-on.
  //   anim.update       the SKELETON — the only writer on those bones while he
  //                     is skating, which is the bug that cost this project a
  //                     day (DESIGN.md, 2026-07-26).
  //   rig.followFeet    where the rider stands on the deck, and where the deck
  //                     hangs under him. Reads the skeleton, so it comes after
  //                     the animation, and it stands down entirely on a bail.
  //   ragdoll           takes the skeleton over on a bail and is then the LAST
  //                     writer on it. `observe()` wants the same slot for the
  //                     opposite reason — it is sampling the finished pose — so
  //                     both live here, after everything else has had its say.
  //
  // Nothing between `skate.update` and `ragdoll.update` may move a bone the
  // ragdoll is holding: it writes world-space particle positions back through
  // whatever parent matrices it finds, so a second writer does not fight it,
  // it just gets silently thrown away and the body reads a frame stale.
  //
  // `anim.update` deliberately keeps running while he is down, and that is not
  // a second writer in the sense above — the ragdoll always follows it in the
  // same frame, so the outcome never flip-flops. It has to: `release()` blends
  // the settled pose back into the riding stance, and there is no stance to
  // blend into if the animation layer stopped.
  //
  // Who owns the BOARD, since both of the ways that changes hands are new:
  // while he grinds, the model owns its position (the Grinder places it on the
  // line) and `rig.sync` owns its facing; `followFeet` still stands it on his
  // soles, which is why a boardslide keeps the deck under him. While the ragdoll
  // runs, `followFeet` stands down and the board goes back to fixed geometry
  // under a skater whose position is being read off the tumbling hips below.
  // The boot's own awaits are behind us — start the clock from here, so the
  // first frame is not handed the whole loading screen as its delta.
  last = performance.now();
  /** Watched rather than evented: an ollie flipped LATE fires no `onPop`. */
  let flipping = false;
  /** …and the same for the run's two edges — see the loop below. */
  let runPhaseWas = runGame.run.phase;

  renderer.setAnimationLoop(() => {
    const now = performance.now();

    // Backgrounded: draw nothing, simulate nothing, judge nothing. `last` still
    // moves so that the frame the tab comes back on is one frame long and not
    // one coffee break long.
    if (hiddenTab) {
      last = now;
      return;
    }

    // THE FRAME CAP, and it has to be here — above the delta, above the
    // governor, above everything — because a capped frame is a frame that never
    // happened: measuring it, judging it or simulating it would all be
    // measuring the cap instead of the machine. `frameCap` is 60 or 240 on every
    // desktop tier, and both fail this test outright, so no desktop frame can
    // reach the `return`. `phone-low` asks for 30 (its table entry's own words:
    // a stable 30 beats a stuttery 45), and the governor's last rung asks for it
    // on any tier that has fallen the whole way down the ladder.
    if (frameCap > 0 && frameCap < 60 && now - last < 1000 / frameCap - 1) return;

    const frameMs = now - last;
    const delta = Math.min(frameMs / 1000, 0.1);
    last = now;
    if (contextLost) return;

    // THE RIDE gets the clamped delta — a 400 ms frame must not teleport the
    // skater through a wall. THE GOVERNOR gets the honest one. Feeding it the
    // clamp meant no frame worse than 10 fps was ever reported as worse than 10
    // fps, so the exact machines the ladder exists to rescue were the ones it
    // could not see; the clamp was silently doing a second job it was never
    // written for.
    governor.frame(frameMs);

    if (!paused) {
      // THE QUEST CARD'S INPUT GATE. The source is still READ every frame —
      // `consume()` is what clears its edge-triggered latches, so a flip or a
      // pop pressed while the card was up cannot fire the moment it closes —
      // but while a card is up nothing it read reaches the ride, so he coasts
      // instead of fighting the controls. Rendering, physics, animation, audio
      // and the camera all keep running: the world does not stop, only his
      // input does.
      const talking = dialogueOpen();
      const resetAsked = input.takeReset();
      if (resetAsked && !talking) {
        // Hand the bones back before the model teleports — R mid-fall must not
        // leave physics holding a skeleton that is suddenly on the other side
        // of the plaza.
        ragdoll?.release();
        skate.reset();
        hud.hideCentre();
        hud.resetRun();
      }
      const live = input.consume(delta);
      const intent = talking ? EMPTY_INPUT : live;
      const wasDown = skate.state === "ragdoll";
      skate.update(intent, delta);
      const flips = skate.flip < 1;
      if (flips !== flipping) {
        flipping = flips;
        if (flips) audio.flipWhoosh();
      }
      rig.sync(skate, delta);
      // The body learns it is in the air from the RIDE, not from the pop.
      // `playTrick` and `playCushion` were the only callers of `setAir`, so the
      // only airs that ever reached the skeleton were the ones a trick
      // announced — and the biggest air this spot produces has no trick in it:
      // rolling off the quarter pipe's lip measures 1.6–1.7 s and 5 m up at
      // every speed from 12 to 20 m/s with `onPop` never firing. He flew it in
      // a rolling stance.
      anim?.setAir(skate.airborne);
      anim?.update(delta, skate.spin);
      rig.followFeet(anim, skate, delta, ragdoll?.running ?? false);
      // Bone history while he is riding, the fall itself once he is not. Each
      // is a no-op in the other state, and both must run after the animation
      // layer has posed the skeleton.
      ragdoll?.observe(delta);
      ragdoll?.update(delta);
      if (wasDown && skate.state !== "ragdoll") ragdoll?.release();
      // The model slides a body of its own while he is down and it does not
      // agree with where the bones actually end up — measured at 6.9 m against
      // 9.4 m on a full-speed slam. The bones win: the camera watches the real
      // body, and he stands back up where it came to rest.
      if (skate.state === "ragdoll" && ragdoll?.running) {
        skate.position.x = ragdoll.hips.x;
        skate.position.z = ragdoll.hips.z;
        // Hinted with the hips' own height, so a body lying on a ledge puts the
        // deck on the ledge and not on the pavement half a metre below it.
        skate.position.y = skate.surface.height(
          skate.position.x,
          skate.position.z,
          ragdoll.hips.y,
        );
      }

      // Shadow camera rides along, so texels stay dense around the skater.
      // THE SUN FOLLOWS HIM, AND THE FIELD SNAPS IT. This used to be three
      // lines here that re-seated the light off a boot-captured offset — and
      // that is what made every shadow edge crawl: the map re-rasterised on a
      // different sub-texel alignment each frame. `trackShadow` does the same
      // follow and then quantises the whole rig to whole shadow-map texels
      // before the map is drawn. It is a ROUNDING, not a filter — nothing is
      // damped and nothing lags.
      //
      // It also has to live here rather than beside the old lines: `main.ts`
      // writing `sun.position` every frame would overwrite the tuning panel's
      // sun-angle sliders on the very next frame.
      field.trackShadow?.(skate.position);

      audio.setRolling(skate.speed, !skate.airborne, skate.surfaceKind);
      hud.update(skate.speed, delta, skate.fakie);
      // The meter is only ever up while something is asking him to hold it —
      // and as of 2026-07-29 a manual IS asking, which it was not before: it
      // used to run on a flat four-second clock nobody could argue with, and
      // the player noticed ("during a manual there should be the same balance
      // mechanic as when we grind on a rail, right? Otherwise I could ride
      // forever on it"). `manualBalance` comes out in the same −1…+1 shape the
      // gauge already takes.
      //
      // The deck's own rake is still the primary read — it opens from 5.2° at
      // the wheels-coming-down edge to 29.2° at the tail-scrape edge, so the
      // board tells you where you are without a gauge. This is the second
      // opinion, and it is up for the same reason it is up on a rail: the fight
      // is only fair if you can see which way you are losing it.
      hud.setBalance(skate.grindState ? skate.grindState.balance : skate.manualBalance);
      // The clock, the marker over the NPC's head and the approach trigger, all
      // inside `!paused` deliberately: a minute that keeps spending itself
      // behind the pause screen is the player's minute being taken from them.
      runGame.update(delta, skate.position);
      // The horn and the buzzer, taken off the run's own phase rather than
      // through a callback the run lane would have had to invent: a minute has
      // exactly two edges and watching them here keeps the audio layer out of
      // the game rules entirely.
      const runPhase = runGame.run.phase;
      if (runPhase !== runPhaseWas) {
        if (runPhase === "running") audio.runStart();
        else if (runPhaseWas === "running") audio.runEnd();
        runPhaseWas = runPhase;
      }
    }

    followCam.update(skate, delta, !paused);

    look.render(delta);
  });
}

// ── A BOOT THAT DIES MUST SAY SO. `void boot()` DID NOT. ────────────────────
//
// Everything between `hud.setProgress(0.1, …)` and `hud.setProgress(1, …)` runs
// inside one async function, and `void` on the call discards its rejection. So
// ANY synchronous throw in there — from the renderer, the look stack, a map
// mount — left the loader exactly where the last `setProgress` had put it,
// forever, with no message, nothing in flight, and nothing in the page but a
// console line the player was never going to open.
//
// That is not a hypothetical. On 2026-07-30 the deployed build threw inside
// `createLookStack` on every phone tier (`new WebGLRenderTarget(…, {
// depthTexture: sceneDepth ?? undefined })` — three's `RenderTarget` defaults
// that option to `null` via `Object.assign`, so an explicit `undefined`
// overwrites the default and the setter's `current.renderTarget = this`
// dereferences it). Desktop never reached the line, because its tier is the one
// that builds a real g-buffer depth and the `??` never fires. Every mobile
// player got a bar pinned at 30% "POURING THE CONCRETE…" and no way to tell
// that from the genuinely slow boot they had been living with.
//
// The bar was the whole diagnosis problem: "stuck at 30%" and "still loading"
// looked identical. Now they do not. This costs the game nothing when the boot
// succeeds and is the difference between a bug report and a silent outage when
// it does not.
boot().catch((e: unknown) => {
  console.error("[boot] failed", e);
  const why = e instanceof Error ? e.message : String(e);
  bootHud?.setProgress(bootProgress, `Couldn't start — ${why}`);
});
