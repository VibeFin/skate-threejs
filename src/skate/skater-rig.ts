// Everything you can SEE of the ride: the board, the skater on it, and the
// blob of shadow they leave on the grass.
//
// Hierarchy (each node owns exactly one rotation, so nothing fights):
//
//   root              position = wheel contact point, rotation.y = heading
//    └ tilt           lays the whole rig onto the ground's normal
//       └ grindYaw    rotation.y = the deck turned across the line it grinds
//          └ bank     rotation.z = lean into the carve, and the grind's balance
//             ├ boardPitch  rotation.x = nose lifting off the pop, or the
//             │  │          manual's rake — and a POSITION that moves the pivot
//             │  │          onto the wheels still touching the road, so the
//             │  │          lifted end goes up instead of the low end going under
//             │  └ boardFlip  the deck coming round — .z for a flip, .y for a
//             │     │         shove-it, whichever axis the trick is on
//             │     └ deck GLB
//             └ stand    rotation.x = the manual's rake again — and it is his
//                │       LEGS, not his lean: it is the only thing holding his
//                │       soles in the plane of a plank at 17°. He does not lean
//                │       with it; the waist takes the torso back to vertical
//                │       (`POSTURES.Manual`), which is the player's own note —
//                │       "he stands completely vertical, it's just his legs"
//                └ character   the skater
//
// `grindYaw` carries the RIDER as well as the board, because a boardslide is
// the whole assembly turned across the rail — the travel direction stays on
// `root`, where the camera and the ride model already read it. It sits ABOVE
// the bank rather than below it so that `bank.rotation.z` stays a roll about
// the DECK's own long axis: the rider stands across his board, so what he
// tips over is always the plank, and on a boardslide the plank is across the
// rail. While he is not grinding this node is zero and the chain is the one
// milestones 1–6 shipped.
//
// Neither way of riding the other way round is HERE. The half-turn is a group
// inside `SkaterAnim`, below the yaw this file sets, and the fakie reflection is
// in the clip data below that — so everything measured against `character` (the
// soles `followFeet` stands the board on, the head the push lean-cancel watches)
// keeps reading in the board's own frame whichever way round he is.
//
// One consequence worth stating, because it decides a sign below: the
// reflection is nose-for-tail and holds the board's x, so it moves the pushing
// foot to the other END of the deck and leaves it over the same RAIL. The
// half-turn is what swaps rails. That is why `PUSH_SIDE_SHIFT` rides on the
// stance alone and not on both.

import * as THREE from "three";
import type { QualityTier } from "../controllers/quality/tier";
import { loadModelWithFallback } from "../controllers/quality/pick-asset";
import type { GenexGltfLoader } from "../controllers/quality/gltf-loader";
import type { SkateModel } from "./skate-model";
import type { SkaterAnim, FootAnchor } from "./skater-anim";

// Deck v2. The first generation moulded wheels onto BOTH faces of the deck
// (visible from directly above) — verified in a three-view render and thrown
// out. This one has grip tape on top and four wheels underneath, as checked.
export const BOARD_MODEL_URL =
  "https://assets.auras.cc/generations/cms0fd757004s22nupq71hp7f/model-glb";

// Deck length, metres. A real street deck under a 1.7 m rider is ~0.82; this
// one is deliberately oversized, the way a PS2 skate game draws them — the
// skater's chunky shoes need a plank they don't hang off.
const DECK_LENGTH = 0.96;
/** Height of the deck's top face above the ground. */
const DECK_TOP = 0.115;
/** Wheel-axle height — where the board node sits. */
const AXLE_HEIGHT = 0.055;
/**
 * How far each truck sits from the middle of the deck, metres — so a wheel's
 * contact patch is at (0, −AXLE_HEIGHT, ±WHEEL_Z) in the board node's own frame.
 *
 * It is the placeholder deck's own wheel spacing below, and the number every
 * harness already quotes the rider's stance against ("the back truck is at
 * −26 cm", `tools/anim-check.mjs`). A wheelie turns about the contact patch, so
 * this is the geometry that decides where the manual's pivot goes.
 */
const WHEEL_Z = 0.26;
/** Deck top face measured from the axle node — the surface the soles stand on. */
const DECK_SURFACE = DECK_TOP - AXLE_HEIGHT;
/**
 * Gap held between the soles and the deck's top face while rolling. The shoe
 * meshes are chunky and their bones sit inside them, so standing the skeleton
 * flat on the deck buries the shoes in it.
 */
const SOLE_CLEARANCE = 0.05;
/** …and in the air, where the board hangs a touch further below the feet. */
const AIR_SOLE_CLEARANCE = 0.1;
/** How far the skater sinks on a push, metres, and over how long. */
const PUSH_DIP = 0.11;
const PUSH_DIP_TIME = 0.42;
/**
 * Sideways nudge held through a push, metres, positive = toward his pushing
 * side. The anchor is frozen at the mid-point of BOTH feet, but only the front
 * one stays on the deck, so the hold sits offset toward the leg that is leaving
 * and he reads a touch off-centre. This puts him back over the board.
 */
const PUSH_SIDE_SHIFT = 0.125;
/** Seconds spent handing the feet back after a push, so the release is not a step. */
const PUSH_RELEASE = 0.28;
/**
 * How much of the push clip's forward pitch is taken back out of where he
 * STANDS, 0 = none, 1 = his head holds station over the deck.
 *
 * The foot anchor pins his hips, but everything above them swings 10 cm toward
 * the nose in the first fifth of a second and drifts back over the rest of the
 * stroke — measured in `tools/move-film.html`, and the reason a push reads as
 * "he slides forward a bit and comes back". Cancelling it outright would just
 * move the swing to his hips instead, so this splits the difference: the same
 * counter-shift is spread across the whole body rather than piled on one end.
 */
const PUSH_LEAN_CANCEL = 0.5;
/**
 * How fast the deck comes back square after a grind, 1/s. The way IN is not
 * filtered at all — the Grinder eases the deck onto the line itself over
 * 0.13 s and this node copies that number — but the way OUT has no such easing
 * behind it: `endGrind` hands back a board that can still be 90° across the
 * rail, and snapping it flat in one frame is the glitch a boardslide pop-out
 * would otherwise read as.
 */
const GRIND_UNWIND = 14;

export class SkaterRig {
  readonly root = new THREE.Group();
  readonly tilt = new THREE.Group();
  readonly bank = new THREE.Group();
  readonly grindYaw = new THREE.Group();
  readonly boardPitch = new THREE.Group();
  readonly boardFlip = new THREE.Group();
  readonly stand = new THREE.Group();
  readonly character = new THREE.Group();

  private placeholderBoard: THREE.Group | null = null;
  /**
   * The animation layer, kept from `followFeet` so that `sync` — which is the
   * node that actually applies the heading — can tell it what the ride just
   * did. It is the same object every frame and it arrives long before any
   * stance can change; until it does, the anim layer's own default (ease the
   * turn) is the safe half of the answer.
   */
  private rider: SkaterAnim | null = null;
  /**
   * Which way round he was standing the last frame the deck was square — +1
   * regular, −1 switch. It is what the flip's roll is drawn against, because a
   * kickflip is a kickflip from the moment it is popped. See `sync`.
   */
  private flipHand = 1;
  /** Counts down through one push compression, seconds. */
  private pushPulse = 0;
  /** Metres the push compression is sinking the skater right now. */
  private pushDip = 0;
  private tmpQuat = new THREE.Quaternion();
  private yawQuat = new THREE.Quaternion();
  private yawInvQuat = new THREE.Quaternion();
  private tmpNormal = new THREE.Vector3(0, 1, 0);
  private up = new THREE.Vector3(0, 1, 0);

  // --- board-under-the-soles ------------------------------------------------
  private foot: FootAnchor = { mid: new THREE.Vector3(), planted: new THREE.Vector3(), pitch: 0 };
  /** Where he stood on the deck when the current push began — held until it ends. */
  private pushAnchor = new THREE.Vector3();
  private heldAnchor = new THREE.Vector3();
  /**
   * …and where he stood the last frame BOTH soles were on the deck with nothing
   * still settling under them. See the freeze in `followFeet`: a push that
   * begins inside a landing cushion has no settled foot to read live, and the
   * last one it had is a better answer than a moving one held for 0.4 s.
   */
  private settledAnchor = new THREE.Vector3();
  private settled = false;
  /**
   * Where the deck's rake is turning ABOUT, as an offset on the board node —
   * the contact patch of whichever truck is still down. Zero whenever the deck
   * is flat or he is in the air. See the wheelie pivot in `followFeet`.
   */
  private pivot = new THREE.Vector3();
  /** Where his head sat over the deck when the push began, and where it is now. */
  private leanRef = new THREE.Vector3();
  private leanNow = new THREE.Vector3();
  private leaning = false;
  private holdingPush = false;
  /** 1 while a push holds him in place, easing to 0 as the feet are handed back. */
  private pushHold = 0;
  /** Ankle height above the sole, learned from the rig on its first frame. */
  private ankleRest = -1;
  /** 0 = wheels down, 1 = fully airborne. */
  private airBlend = 0;
  private charTarget = new THREE.Vector3();
  /**
   * Where the feet want him, before the push lean-cancel is laid on top. Kept
   * apart from `character.position` so the eased anchor and the direct lean
   * correction don't feed back into each other frame after frame.
   */
  private charBase = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.root.add(this.tilt);
    this.tilt.add(this.grindYaw);
    this.grindYaw.add(this.bank);
    this.bank.add(this.boardPitch);
    this.boardPitch.add(this.boardFlip);
    this.bank.add(this.stand);
    this.stand.add(this.character);

    this.boardPitch.position.y = AXLE_HEIGHT;
    this.character.position.y = DECK_TOP;
    this.charBase.copy(this.character.position);

    // A stand-in deck so the game is rideable the instant it boots — replaced
    // by the generated board the moment it finishes downloading.
    this.placeholderBoard = buildPlaceholderDeck();
    this.boardFlip.add(this.placeholderBoard);

    // No painted blob under the board — the low sun already casts a real
    // shadow off the deck and the skater, and two shadows read as a bug.
    scene.add(this.root);
  }

  /** Swaps the placeholder deck for the generated one. */
  async loadBoard(tier: QualityTier, gltf: GenexGltfLoader): Promise<void> {
    const asset = await loadModelWithFallback(
      BOARD_MODEL_URL,
      tier,
      (u) => gltf.loader.loadAsync(u),
      { ktx2: gltf.ktx2 },
    );
    const model = asset.scene as THREE.Group;

    normaliseDeck(model);
    model.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
      }
    });

    if (this.placeholderBoard) {
      this.boardFlip.remove(this.placeholderBoard);
      disposeTree(this.placeholderBoard);
      this.placeholderBoard = null;
    }
    this.boardFlip.add(model);
  }

  /** Attaches the skater model (VRM scene or Meshy GLB) above the deck. */
  setCharacter(model: THREE.Object3D, yawOffset: number): void {
    // SET, not add — and it did not used to be. This only ever ran once, at
    // boot, so `add` was indistinguishable from `set` and read fine. The title
    // screen's character picker made it a real difference: choosing the other
    // body a second time stacked TWO skinned rigs on the same board, both
    // animating, and the GPU kept the first one's 4096² page for the session.
    // A body is not additive; there is one rider.
    for (const old of [...this.character.children]) {
      this.character.remove(old);
      old.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material;
        // Textures are NOT disposed here on purpose: two Meshy rigs can share
        // an image through the loader's cache, and freeing one body's page out
        // from under the other is a black skater. The geometry is the big win
        // and it is unshared.
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
    }
    model.rotation.y = yawOffset;
    model.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh || (child as THREE.SkinnedMesh).isSkinnedMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // skinned bounds lie during big trick poses
      }
    });
    this.character.add(model);
  }

  /**
   * Fired on each kick. Text-to-motion could not produce a real skateboard
   * push — every prompt came back as a shuffle or a forward step — so the push
   * is sold as a whole-body compression instead: the skater sinks and springs
   * back over the stroke. It is a rig-level transform, not a joint edit, so it
   * composes with whatever stance clip is playing.
   */
  pulsePush(): void {
    this.pushPulse = PUSH_DIP_TIME;
  }

  /** Called every frame, after the skate model has stepped. */
  sync(skate: SkateModel, dt: number): void {
    this.root.position.copy(skate.position);
    // How far the ride swung the whole assembly this frame, measured off the
    // node itself before it is overwritten. The animation layer needs it to
    // know whether a stance change it was just handed is a body coming round or
    // a landing relabelling the deck under a body that already came round — see
    // `SkaterAnim.planStanceTurn`. The short way round, because what it stands
    // for is how far the skater actually turned.
    this.rider?.rideTurned(shortWay(skate.heading - this.root.rotation.y));
    // …and whether the wheels are running against the way he stands, which is
    // what puts his head over his shoulder rather than back down his own line.
    this.rider?.setFakie(skate.fakie);
    this.root.rotation.y = skate.heading;

    // Lay the rig onto the surface it is over. Airborne, drift back to level.
    //
    // The normal comes off the MODEL, not off a world function: the model is
    // the one holding a `yHint`, so it is the only reader that can tell a
    // ledge's top face from the pavement under it, and it already follows the
    // surface at its own rate. Reading the terrain here instead is why the deck
    // ignored the banks, the stairs and the quarter pipe.
    if (skate.airborne) {
      this.tmpNormal.lerp(this.up, 1 - Math.exp(-6 * dt));
    } else {
      this.tmpNormal.copy(skate.surfaceNormal);
    }
    // The tilt lives INSIDE the heading rotation, so the world-space "align to
    // the ground normal" has to be conjugated back through the heading:
    //   tilt = yaw(-h) * alignToNormal * yaw(h)
    this.tmpQuat.setFromUnitVectors(this.up, this.tmpNormal);
    this.yawQuat.setFromAxisAngle(this.up, skate.heading);
    this.yawInvQuat.setFromAxisAngle(this.up, -skate.heading);
    this.tilt.quaternion.copy(this.tmpQuat).premultiply(this.yawInvQuat).multiply(this.yawQuat);

    // Bank INTO the carve. Local +Z is the deck's NOSE, and a positive roll
    // about it drops the rig toward local −X.
    //
    // Which way that is on SCREEN is not this node's question and must not
    // become one. The camera sits behind the `course`, not behind the nose, so
    // deck −X is screen-right only while the wheels are running nose-first;
    // riding the other way round the camera is on the other side of the board
    // and deck −X is screen-LEFT. The model already answers that — the carve's
    // lean carries the signed speed, so `lean` arrives here as a roll that
    // leans him into the arc whichever way he is rolling (`SkateModel.update`,
    // the lean block) — and `bank` sits ABOVE the stance half-turn precisely so
    // that this line stays a roll about the plank and nothing else.
    //
    // So: one number in, one rotation out. No stance, no course, no sign.
    this.bank.rotation.z = skate.lean;

    // Push compression: down fast on the kick, springing back as it ends.
    if (this.pushPulse > 0) {
      this.pushPulse = Math.max(0, this.pushPulse - dt);
      const t = 1 - this.pushPulse / PUSH_DIP_TIME; // 0 → 1 across the stroke
      const dip = Math.sin(t * Math.PI); // 0 → 1 → 0
      this.pushDip = dip * PUSH_DIP;
      this.character.rotation.x = dip * 0.16; // lean into the kick
    } else if (this.pushDip !== 0) {
      this.pushDip = 0;
      this.character.rotation.x = 0;
    }

    // The flip only spins while it is coming round; caught boards sit flat.
    //
    // Which AXIS is the trick: a kickflip and a heelflip roll the deck about
    // its own length in opposite directions, a shove-it spins it flat. That is
    // the whole visual difference between the three — the body is an ollie in
    // all of them (DESIGN.md, 2026-07-27). A full turn either way, because the
    // model snaps the deck back to square the moment `flip` reaches 1, and a
    // board that ends anywhere but where it started would jump on that frame.
    //
    // The whole turn is also why the trick book calls it out as a **360
    // Shove-it** (`SHOVEIT_CALLOUT`) rather than a pop shove: the deck really
    // does go all the way round here, and the callout is not allowed to
    // describe a board this node is not drawing. Change the turn and that
    // string changes with it.
    // …and WHICH RAIL goes down is this file's to answer, not the model's.
    // `flipSign` is a bare ±1 for "which way round"; the rider's own sides only
    // exist here, because this is where `SKATER_YAW` stands him on the plank.
    //
    // Derived once, so nobody re-guesses it (`tools/switch-check.mjs` measures
    // every step of this on the real rig):
    //  · forward is local +Z and the camera sits behind it, so screen-right is
    //    forward × up = (0,0,1) × (0,1,0) = (−1,0,0): deck −X.
    //  · a regular rider's LEFT foot is toward the nose, which puts travel 90°
    //    to his left and so puts his own facing 90° to the RIGHT of travel —
    //    deck −X, which is the same −π/2 `SKATER_YAW` applies. He faces over his
    //    toes, so the toe-side rail is deck −X regular and deck +X switch.
    //  · a kickflip flicks off the TOE-side edge of the nose and a heelflip off
    //    the heel-side edge, and a foot flicking off an edge drives that edge
    //    DOWN. So a kickflip drops his toe rail, whichever way round he stands.
    //  · a positive roll about +Z lowers the point at −X. So a kickflip is a
    //    POSITIVE roll regular and a negative one switch, and `flipSign` is −1
    //    for the kickflip — hence the minus, and hence the stance factor.
    // Measured before the minus existed: both stances drew F as a heelflip and G
    // as a kickflip. The pair were opposites and the stance did flip them, which
    // is why every check that only asked those two questions passed.
    //
    // The yaw does NOT change hand, and the difference is not a preference. A
    // shove-it is a flat spin, and which way round it goes is all a flat spin
    // has — the deck comes back to square, so no end of it leads. The half-turn
    // that puts him switch leaves the vertical alone, so that direction is the
    // same one relative to his body in both stances and there is nothing to
    // correct.
    //
    // The stance is LATCHED at the pop rather than read live, because which
    // trick it is was decided at the pop. It used to be read live on the grounds
    // that nothing can change the stance under a deck that is still coming round
    // — true of a landing, which bails outright below `flip` 1, and not true of
    // the ground pivot, which resolves whenever the scrub runs out. Measured on
    // a pivot landing mid-kickflip: the deck jumped 135° in one frame.
    const spun = skate.flip < 1 ? skate.flip * Math.PI * 2 * skate.flipSign : 0;
    if (skate.flip >= 1) this.flipHand = skate.stance === "switch" ? -1 : 1;
    this.boardFlip.rotation.z = skate.flipAxis === "roll" ? -spun * this.flipHand : 0;
    this.boardFlip.rotation.y = skate.flipAxis === "yaw" ? spun : 0;

    // The deck across the line it is grinding. `root` already points down the
    // direction of travel, so this node carries only the difference — 0 for a
    // 50-50, a right angle for a boardslide.
    this.grindYaw.rotation.y = skate.grindState
      ? skate.grind.boardHeading(skate.grindState) - skate.heading
      : THREE.MathUtils.damp(this.grindYaw.rotation.y, 0, GRIND_UNWIND, dt);
  }

  /**
   * Stands the board on the skater's soles. Call AFTER the animation has posed
   * the skeleton for this frame — it reads the foot bones.
   *
   * On the ground the board is the thing rolling, so it stays on the wheel
   * contact point and the SKATER slides to meet it: that is what keeps the
   * deck centred under his feet however the stance shifts. In the air there is
   * no contact point, so it flips round and the board rides with the legs —
   * which is what makes a tuck read as one motion instead of a body and a
   * plank on separate clocks.
   *
   * While the ragdoll owns the skeleton this stands down entirely: physics is
   * the last writer on those bones and standing a board on them would be a
   * second one.
   *
   * `bonesHeld` is that handover, and it is NOT the same as `state ===
   * "ragdoll"` — the model stands him up on a timer while the ragdoll is still
   * blending the pose back for another 0.28 s, and a board solved against a
   * body that is mid-collapse drags the skater a metre sideways over those
   * frames. It stays down until physics has genuinely let go.
   */
  followFeet(anim: SkaterAnim | null, skate: SkateModel, dt: number, bonesHeld = false): void {
    if (anim) this.rider = anim;
    const bailing = skate.state === "ragdoll" || bonesHeld;
    const air = skate.airborne ? 1 : 0;
    // Coming down snaps back faster than going up: the wheels have to be on
    // the ground the frame they touch, but the pop can lift away smoothly.
    const blendRate = skate.airborne ? 10 : 24;
    this.airBlend += (air - this.airBlend) * (1 - Math.exp(-blendRate * dt));

    // The manual's rake, given to the RIDER as well as to the deck — and what
    // that buys is his FEET, not a lean.
    //
    // The player overruled the lean outright: "when he does a manual he himself
    // shouldn't lean, the character stays facing forward, only the board tilts…
    // he stands completely vertical, it's just his legs." So the torso is taken
    // back off this angle above the waist, in `POSTURES.Manual` — flip the sign
    // there and he stands up, which is the shape he asked for.
    //
    // This line still has to turn him, because his soles are the surface the
    // board is stood on and they have to lie in the DECK's plane: his feet are
    // ~35 cm apart along the deck (`tools/anim-check.mjs`), so at MANUAL_PITCH's
    // 17.2° the two ends of that line are 5.2 cm apart in height. Level his
    // whole body and the front shoe goes through the griptape while the back one
    // floats a hand's width over the tail. Rake the legs and cancel the lean at
    // the waist and both are true at once — which is also what a skater does.
    //
    // Grounded `boardPitch` is the manual and nothing else — in the air it is
    // the pop, which the clip's own tuck already sells — so the rig's existing
    // ground/air ownership blend is what hands it over, rather than a second
    // filter over the same number.
    const ground = 1 - this.airBlend;
    this.stand.rotation.x = skate.boardPitch * ground;

    // --- the wheelie pivot ---------------------------------------------------
    // A manual pitches the deck about the wheels that are STILL DOWN. This node
    // sits on the axle line through the MIDDLE of the board, so turning it here
    // swings the loaded end under the road: measured at MANUAL_PITCH's 17.2°,
    // the rear contact patch sat **7.4 cm below the tarmac** and the tail's own
    // underside 5.3 cm below it, with the front wheels only 7.9 cm up — the
    // board sinking into the ground the player is looking at.
    //
    // Turning about a point p rather than about the origin is the SAME rotation
    // plus one translation, t = p − R·p, so the whole fix is two numbers on this
    // node's position and nobody's rotation changes. p is the contact patch of
    // whichever truck is loaded: the REAR one in a manual (nose up, so pitch is
    // negative — see `SkateModel.manualPitch`) and the FRONT one in a nose
    // manual. The grounded end then holds station and the lifted end goes up,
    // which is what a wheelie is: measured after, the rear contact patch is at
    // 0.0 cm — on the road, to the millimetre — the tail's underside 2.1 cm
    // clear of it, and the front wheels 15.4 cm up instead of 7.9.
    //
    // It fades out with the ground, because airborne there is no contact patch
    // to turn about — up there the board rides the soles instead (the k blend
    // below), and `boardPitch` is the pop rather than a rake.
    let riseY = 0;
    this.pivot.set(0, 0, 0);
    if (ground > 1e-3 && Math.abs(skate.boardPitch) > 1e-4) {
      const s = Math.sin(skate.boardPitch);
      const c = Math.cos(skate.boardPitch);
      const pz = skate.boardPitch < 0 ? -WHEEL_Z : WHEEL_Z;
      const py = -AXLE_HEIGHT;
      this.pivot.set(0, ground * (py - (py * c - pz * s)), ground * (pz - (py * s + pz * c)));
      // …and how far that lifted the deck's top face out from under his soles.
      // He rides the plank, so he goes up with it: 7.7 cm at 17.2°, which is a
      // rider standing over the middle of a board with its tail on the floor.
      //
      // Solved rather than guessed, and it is exact while `stand` carries the
      // same angle the deck does (the line above): his sole plane is then
      // parallel to the deck, and the perpendicular gap between them comes to
      // SOLE_CLEARANCE for exactly this rise. Without it the solve below buries
      // his soles 7.7 cm INSIDE the deck, because it is written against a board
      // whose top face is at DECK_TOP and this node has just moved it.
      riseY = this.pivot.y * c + this.pivot.z * s - AXLE_HEIGHT * (1 - c) * ground;
    }

    this.root.updateMatrixWorld(true);
    // Read the soles in the CHARACTER's own frame, so the answer doesn't
    // depend on the offset we are about to compute from it.
    const known = anim?.readFeet(this.character, this.foot) ?? false;

    if (known && !bailing) {
      if (this.ankleRest < 0) this.ankleRest = this.foot.mid.y;
      // Both feet on the deck → centre the board between them. Mid-push, one
      // foot is sweeping the GROUND, so the board belongs under the other one
      // alone; the mid-point would park it beside the swinging leg.
      const onBoard = anim?.feetOnBoard ?? true;
      // Where he stands on the deck when nothing else is moving his feet for
      // him: wheels down, both soles riding, no landing still settling.
      //
      // This is the value a push freezes on, and it is read HERE rather than at
      // the freeze itself because of what a landing does. `playCushion` fires a
      // crouch that is still crossfading back into the rolling stance 0.34 s
      // later, so a push begun inside that window used to freeze a foot that was
      // still travelling and then hold that wrong answer for the whole stroke:
      // measured at 15.21 cm off the deck's centre-line against 12.26 cm for the
      // same push begun settled, and the side it went flipped with `stanceSide`,
      // which is the player's "it depends which way he's facing".
      //
      // `skate.airborne` is this file's half of the question and it is not
      // optional: the anim layer's clock cannot see an air nobody announced, and
      // an ollie's tuck puts the foot mid **30.5 cm** off the deck's centre line
      // — latch that and a push off a landing is worse than what it replaced,
      // which is exactly what the first cut of this measured (18.05 cm).
      //
      // Latching the last SETTLED frame is the same one-shot freeze it always
      // was, taken off a source that is not mid-move. Damping the anchor instead
      // would have spread the offset over the stroke rather than removed it.
      if (onBoard && !skate.airborne && (anim?.feetSettled ?? true)) {
        this.settledAnchor.copy(this.foot.mid);
        this.settled = true;
      }
      if (!onBoard) {
        if (!this.holdingPush) {
          // A push has just begun. Freeze where he stands on the deck for the
          // whole stroke: the clip slides its own standing foot ~12 cm, and
          // tracking that live is what walked him forward-left off the board.
          this.pushAnchor.copy(this.settled ? this.settledAnchor : this.foot.mid);
          this.holdingPush = true;
          this.leaning = anim?.readUpperBody(this.character, this.leanRef) ?? false;
        }
        this.pushHold = 1;
      } else {
        // Hand the feet back over PUSH_RELEASE rather than the frame the clip
        // ends — dropping it in one step read as him darting back left while
        // the leg was still coming home.
        this.holdingPush = false;
        this.pushHold = Math.max(0, this.pushHold - dt / PUSH_RELEASE);
      }
      const hold = this.pushHold;
      const anchor = this.heldAnchor.copy(this.foot.mid).lerp(this.pushAnchor, hold);
      const soleY = anchor.y - this.ankleRest;

      // Grounded: slide the skater until his soles ride just over the deck —
      // wherever the wheelie pivot has just put the deck's top face.
      this.charTarget.set(
        -anchor.x,
        DECK_TOP + riseY + SOLE_CLEARANCE - soleY - this.pushDip,
        -anchor.z,
      );
      // Screen-right is -X here: forward is +Z along the nose, so right is
      // forward × up = (0,0,1) × (0,1,0) = (-1,0,0). Fades out with the hold.
      //
      // …and it changes hand with the stance, because what it corrects for does:
      // the anchor sits offset toward the leg that is LEAVING the deck, and once
      // he has turned round on the board that leg is over the other rail. Taken
      // off the anim layer's eased turn rather than the model's word, so a push
      // begun mid-turn is nudged by however far round he actually is.
      this.charTarget.x -= PUSH_SIDE_SHIFT * hold * (this.rider?.stanceSide ?? 1);
      // Held through a push, so the rate only matters on the way back: when
      // both feet return to the deck it eases from the frozen spot to the live
      // one rather than snapping.
      const settleRate = onBoard ? 16 : 7;
      this.charBase.lerp(this.charTarget, skate.airborne ? 0 : 1 - Math.exp(-settleRate * dt));
      this.character.position.copy(this.charBase);

      // …then step him back along the deck by a share of however far the clip
      // has pitched him over the nose, so the stroke stops reading as a slide
      // up the board. This one is applied straight, not eased: the easing above
      // exists to hide the anchor changing hands, and running the lean through
      // it as well just let the swing get out in front of the correction.
      if (this.leaning && hold > 1e-3 && anim?.readUpperBody(this.character, this.leanNow)) {
        this.character.position.z -= PUSH_LEAN_CANCEL * hold * (this.leanNow.z - this.leanRef.z);
      }

      // Airborne: bring the board up under the soles, hanging a little lower.
      // `p` is measured in `stand` and this is measured in `bank`, one node
      // up — which is only the same frame while `stand` is level. It is: the
      // rake above fades out on this very blend, so wherever k matters the two
      // frames coincide.
      const k = this.airBlend;
      const p = this.character.position;
      const soleBank = p.y + soleY;
      this.boardPitch.position.set(
        k * (p.x + anchor.x),
        AXLE_HEIGHT + this.pivot.y + k * (soleBank - AIR_SOLE_CLEARANCE - DECK_SURFACE - AXLE_HEIGHT),
        this.pivot.z + k * (p.z + anchor.z),
      );
      // Let the foot line set the deck angle in the air, keeping a little of
      // the physics pop so the nose still lifts off the ground.
      this.boardPitch.rotation.x = THREE.MathUtils.lerp(
        skate.boardPitch,
        -this.foot.pitch + skate.boardPitch * 0.3,
        k,
      );
    } else {
      // No rig loaded yet, or a bail in progress — back to fixed geometry, with
      // the wheelie pivot still on it: a manual held into a bail should not put
      // the deck through the floor for the frame the bones change hands.
      this.boardPitch.position.set(0, AXLE_HEIGHT + this.pivot.y, this.pivot.z);
      this.boardPitch.rotation.x = skate.boardPitch;
      if (!known) {
        this.character.position.set(0, DECK_TOP - this.pushDip, 0);
        this.charBase.copy(this.character.position);
      }
    }

    if (bailing) this.boardPitch.rotation.x = Math.min(1, skate.bailT / 0.35) * 0.5;
  }
}

/** An angle folded into (−π, π] — the short way round to the same facing. */
function shortWay(radians: number): number {
  const turn = Math.PI * 2;
  return radians - turn * Math.floor((radians + Math.PI) / turn);
}

/**
 * Generated models arrive at an arbitrary scale, orientation and origin. Pin
 * the deck to a real skateboard: long axis along +Z, 0.82 m end to end, wheels
 * resting on y = -AXLE_HEIGHT so the axle node carries it.
 */
function normaliseDeck(model: THREE.Object3D): void {
  model.updateWorldMatrix(true, true);
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  // Longest horizontal axis becomes the direction of travel.
  if (size.x > size.z) {
    model.rotation.y = Math.PI / 2;
    model.updateWorldMatrix(true, true);
    box = new THREE.Box3().setFromObject(model);
    box.getSize(size);
  }

  const scale = DECK_LENGTH / Math.max(size.z, 1e-4);
  model.scale.multiplyScalar(scale);
  model.updateWorldMatrix(true, true);

  box = new THREE.Box3().setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.x -= centre.x;
  model.position.z -= centre.z;
  model.position.y -= box.min.y + AXLE_HEIGHT;
}

/** A blocky stand-in deck — good enough to ride while the real one loads. */
function buildPlaceholderDeck(): THREE.Group {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(0.21, 0.025, DECK_LENGTH),
    new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.8 }),
  );
  deck.position.y = 0.06;
  deck.castShadow = true;
  g.add(deck);

  const wheelGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.045, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.5 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(sx * 0.09, 0.006, sz * WHEEL_Z);
      w.castShadow = true;
      g.add(w);
    }
  }
  return g;
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    }
  });
}
