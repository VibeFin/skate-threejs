// The deck, once it is nobody's board any more.
//
// The player's ask, verbatim: "The board must fall with him, not through him."
// Both halves of that sentence are a bug this file exists to close, and they
// are not the same bug:
//
// · **Not falling with him.** While the ragdoll runs, `SkaterRig.followFeet`
//   stands down — it has to, because physics owns the skeleton and standing a
//   board on those bones would be a second writer — and the deck goes back to
//   fixed geometry under a skater whose position is read off the tumbling hips.
//   So it does not fall at all: it slides along the floor, level, exactly under
//   the hips, wherever they end up.
// · **Through him.** That same rigid offset puts the deck's origin about 6 cm
//   above the ground directly beneath the hips — which, once he is lying down,
//   is INSIDE HIM. Captured in `shots/g/`: the deck standing on its wheels with
//   the nose coming out of his pelvis.
//
// So the deck becomes a body of its own for the length of the fall: four
// particles in a rigid tetrahedron (nose, tail, and the two wheel lines), the
// same verlet integration and the same fixed substep the skeleton uses, the
// floor read out of the same `SurfaceProvider` the ride reads, and — the half
// the ask is actually about — the skater's own limbs as things it cannot enter.
//
// Two deliberate asymmetries, both because a deck is 3 kg and a body is 70:
//
// · The body pushes the deck and the deck does not push the body. A plank
//   landing on a shin genuinely does not move the shin much, and one-way
//   coupling means nothing here can feed instability back into the solver that
//   is holding the skeleton together.
// · Coming back is scripted, not simulated. When he stands up the deck has to
//   be under his feet again — that is the game's own rule, he rides away from
//   where he fell — so across the get-up the deck's pose is carried back to
//   wherever the rig is holding it. Simulating a board hopping back into a
//   skater's hands is a different game.
//
// Nothing here is reparented. The deck node stays exactly where it is in the
// rig's graph and this writes its LOCAL transform after `followFeet` has had
// its say, which is the same "last writer, fixed order" rule the ragdoll uses
// on the bones. Anything the rig writes to nodes INSIDE the deck subtree (the
// flip node's roll, mid-trick) is put back to what it was at the bail, so a
// bail taken out of a kickflip cannot leave the deck spinning on an axis the
// fall knows nothing about.

import * as THREE from "three";
import type { SurfaceProvider, SurfaceSample } from "../../world/surface";
import { makeSample } from "../../world/surface";

/** The ride's own gravity — the same number the skeleton falls at. */
const GRAVITY = 17;
/** Air resistance on a tumbling plank, 1/s. It is light and flat and it flutters. */
const AIR_DRAG = 1.1;
/** Passes that hold the deck rigid. Six links, so they are free. */
const SHAPE_PASSES = 8;
/**
 * …and how many times the deck is taken back out of him inside one substep,
 * BEFORE the floor has its say and again after it.
 *
 * It was 4, and 4 was tuned against a deck that spent the fall running away from
 * him. Once the deck stays with the body it meets it constantly, and the worst
 * frame went to 15.5 cm through a limb across the table. 8 brings that back
 * under the bound; 12 was tried and is measurably worse, not better — the one
 * case still short of it (`into the dock face`, where the deck is wedged between
 * him and 1.1 m of concrete) has no separated solution to converge on, so extra
 * passes just move which rate lands worst.
 */
const BODY_PASSES = 8;
/** A deck is stiff wood — the shape does not give at all. */
const SHAPE_STIFFNESS = 1;
/**
 * How much of the rider's speed the deck keeps when he goes down.
 *
 * A board does not stop when its rider does — that is WHY he goes down. It runs
 * on and he trips over nothing.
 *
 * It was 1.15, and that was a fabrication: nothing puts momentum INTO a deck at
 * the moment its rider comes off it. The rider is already the slower of the two
 * by the time this is read — `SkateModel.RAGDOLL_CARRY` hands the body 70% of
 * the ride's speed and hands the deck this — so the board runs on ahead at
 * 1/0.7 of him with this at exactly 1, which is the whole of what the moment
 * needs. What was actually making it cross the plaza was the missing impact
 * friction below, not this number, and raising this was the wrong end of it.
 */
const KICK = 1;
/**
 * …and the tumble it picks up, rad/s per m/s of that speed, about the deck's
 * own long axis.
 *
 * Deterministic on purpose: a fall the harness cannot reproduce twice is a fall
 * nothing can be asserted about. It comes off the speed rather than a random
 * seed, so a slow bail drops the board and a fast one sends it cartwheeling.
 */
const TUMBLE = 0.55;
/** …with a ceiling, so a 20 m/s slam does not put the deck into a blur. */
const TUMBLE_MAX = 9;
/** A deck bounces off concrete more than a body does. Wood on stone. */
const RESTITUTION = 0.22;
/** How fast the floor scrubs a sliding deck, 1/s… */
const FRICTION = 3.2;
/** …and the fixed brake under that, m/s² — the same µ·g shape the body uses. */
const BRAKE = 7;
/**
 * How much of the speed a corner arrives with is taken off it ALONG the floor —
 * Coulomb friction at the impact itself, and the term this file was missing.
 *
 * `FRICTION` and `BRAKE` above only bite while a corner is in contact, and a
 * tumbling plank is barely ever in contact: it is in the air between strikes and
 * each strike lasts one substep. So a deck cartwheeling down the plaza was
 * paying almost nothing per bounce, and the numbers said exactly that — measured
 * over all 39 cases before this line existed, an 8 m/s bail put the BODY 3.9 m
 * down the road and the DECK 10.4 m, from the same velocity, on the same
 * concrete. The board was not falling with him; it was outrunning him three to
 * one and finishing on the far side of the block.
 *
 * A real corner strike is not free. The normal impulse that stops a corner
 * dropping generates a friction impulse along the face of at most µ times it,
 * and that is what turns a board's forward motion into rotation and heat until
 * it lies down. µ = 0.55 is wood-and-trucks on concrete, and it is applied the
 * way Coulomb has it — as a CEILING on what one impact may take, proportional to
 * the speed that impact killed — so a corner that grazes the floor loses almost
 * nothing and one that slams loses most of what it had.
 */
const IMPACT_GRIP = 0.55;
/** Below this the deck has stopped sliding and is held, m/s. */
const STILL = 0.35;
/** …and how long its fastest corner has to stay under that before it is done, s. */
const STILL_HOLD = 0.18;
/** Hard ceiling on a tumbling deck, s — the body's `MAX_SIM`, for the same reason. */
const MAX_ROLL = 4;
/**
 * The fastest a limb may throw the deck by taking it out of itself, m/s.
 *
 * A separation is a correction, not a shove, and the two have to be told apart
 * because in verlet they are written the same way: `pos` moved is `pos - prev`
 * changed is velocity. Everything past this much per substep is carried on
 * `prev` as well, so it moves the deck and adds nothing to it. Half a metre a
 * second is a plank being nudged aside — enough that a deck resting against a
 * shin keeps working its way out from under it, and far short of the metres per
 * second the raw correction reads as at a 180th of a second.
 */
const SEPARATE_GIVE = 0.5;
/** How far one substep may lift a deck particle out of the floor, m. */
const MAX_LIFT = 0.09;
/** …and out of a wall, m. */
const MAX_STEP = 0.07;
/**
 * How high a lip the deck rides OVER instead of stopping dead against, m.
 *
 * The body has had this since round one (`WALL_STEP_UP` in `ragdoll.ts`) and the
 * deck never did, so the two disagreed about what a kerb is. Measured on `onto
 * the manual pad 18 m/s`: the pad's own 15 cm face reads `blocked` to a deck
 * particle, the wall branch below then zeroes the deck's horizontal outright,
 * and the board stopped **at the bail point** — 0.5 m behind where it started —
 * while the body it came off went up onto the pad and slid 11.8 m. The board did
 * not fall with him there either; it just failed in the other direction, and a
 * bound that only looked at how far the DECK travelled would have called that
 * case fixed.
 *
 * 0.18 m is the body's own 0.15 with a deck's wheel height on top: a plank at
 * 18 m/s is not stopped by a kerb, and anything taller than this is a ledge
 * face, which is a thing a board does hit and stop against.
 */
const STEP_UP = 0.18;
/** …and the speed it has to be doing to earn one, m/s. See the guard's comment. */
const STEP_SPEED = 2;
/**
 * How far above the ground it left the world may claim the floor is, m.
 *
 * Same guard, same reason, as the skeleton's `FLOOR_RISE_MAX`: a height query
 * beside a building can answer with the building's ROOF, and a deck that
 * believes it climbs 12 m of brick. The reference only ever falls while the
 * deck is in the air, so no sequence of answers can walk it upward.
 */
const FLOOR_RISE_MAX = 0.3;
/**
 * Seconds the deck takes to come back under his feet.
 *
 * **It is timed off the RIDE resuming, not off the man finishing standing up,
 * and round two had that the other way round.** The reasoning then was that the
 * two are one event — the board should arrive as he stands on it — so the return
 * was stretched to the stand-up's own length. What that missed is that the ride
 * does not wait for the stand-up: `SkateModel` reads `settled`, goes straight
 * back to `rolling`, and the player is pushing again while the take is still
 * playing. Filmed on the shipped build (`shots/g-crit/getup-push-f01/f03/f04`),
 * a return stretched over the whole take is a deck lying FLAT on the concrete a
 * metre in front of him being towed along at his own 11 m/s for a second and a
 * half, because "home" is now moving away at riding speed.
 *
 * So it is a constant again, and short: the moment the ride owns the board the
 * board has to be under his feet, and the man finishing his get-up on top of it
 * is the right way round for those two to disagree.
 */
export const BOARD_RETURN = 0.45;

/**
 * A body part, as the deck sees it: the line a bone draws and the flesh on it.
 * The vectors are LIVE — the ragdoll hands its own particle positions over and
 * this reads them where they are, allocating nothing.
 */
export interface BodySegment {
  readonly a: THREE.Vector3;
  readonly b: THREE.Vector3;
  readonly radius: number;
}

interface Grain {
  /** Where it sits in the deck's own frame, metres. */
  local: THREE.Vector3;
  /** How far it stands off the FLOOR — half the deck's thickness. */
  radius: number;
  /**
   * …and how far it keeps a BODY off, which is a bigger number and a different
   * question. The floor meets the deck's face; a limb can meet its corner. Four
   * spheres strung along the deck's centre line cover its faces exactly and
   * leave the corners of a 21 cm-wide plank sticking 4 cm out of the collision
   * hull — measured, the deck came to rest 5 cm inside his hip on the dock-face
   * bail while its own solver reported no contact at all. This is the deck's
   * cross-section, corner to centre line, so a plank keeps a limb off its edge
   * as well as off its face.
   */
  fat: number;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  /** Where it stood when the substep began — the settle test reads it. */
  was: THREE.Vector3;
  /**
   * How far being taken out of the BODY moved it this substep, summed over every
   * contact — see `SEPARATE_GIVE`. Read once at the end of the body passes and
   * then thrown away.
   */
  kick: THREE.Vector3;
  /** The lowest ground this particle has held — see `FLOOR_RISE_MAX`. */
  floorRef: number;
  touching: boolean;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _r = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _parentQuat = new THREE.Quaternion();
const _home = new THREE.Quaternion();
const _homePos = new THREE.Vector3();
const _scale = new THREE.Vector3();

/**
 * The deck as a falling thing.
 *
 * Built once against a node in the rig's graph — the subtree the deck's meshes
 * hang under — and then armed and disarmed per bail. While it is not `held`
 * this writes nothing at all and the rig owns its board exactly as before.
 */
export class BoardFall {
  /** True while the fall owns the deck's transform — including the return. */
  get held(): boolean {
    return this.state !== "off";
  }

  /**
   * True while the deck is still moving and wants substeps.
   *
   * The body and the board do not stop at the same time and there is no reason
   * they should: he lands and slides to a halt in under a second while the deck
   * is still cartwheeling off a ledge. Driven off the BODY's own settle — which
   * is what the first version did — the deck stopped in mid-air the frame he
   * came to rest, and the harness caught it on the ledge drop: the deck read
   * 39 to 68 cm through the floor, because it was frozen where it happened to
   * be when he stopped and then measured against the ground under it.
   */
  get moving(): boolean {
    return this.state === "falling" && this.calm < STILL_HOLD;
  }

  private state: "off" | "falling" | "returning" = "off";
  private readonly grains: Grain[] = [];
  private readonly links: { a: number; b: number; rest: number }[] = [];
  /** Local transforms of every node inside the deck subtree, as the bail found them. */
  private readonly frozen: {
    node: THREE.Object3D;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scale: THREE.Vector3;
  }[] = [];
  private readonly sample: SurfaceSample = makeSample();
  private readonly worldPos = new THREE.Vector3();
  private readonly worldQuat = new THREE.Quaternion();
  private readonly localScale = new THREE.Vector3(1, 1, 1);
  /**
   * The deck node's roll and yaw as the bail found them — the two axes the RIG
   * owns and never writes. See `unpollute`.
   */
  private readonly restSpin = new THREE.Euler();
  private returnT = 0;
  private shaped = false;
  /** Seconds the deck has been still for — the same "spent, not erased" rule the body uses. */
  private calm = 0;
  private ran = 0;
  /** The floor he bailed over — what an implausible query falls back to. */
  private bailFloor = 0;

  private readonly node: THREE.Object3D;
  private surface: SurfaceProvider;

  constructor(node: THREE.Object3D, surface: SurfaceProvider) {
    this.node = node;
    this.surface = surface;
  }

  setSurface(surface: SurfaceProvider): void {
    this.surface = surface;
  }

  /**
   * Measures the deck once, in its own frame, from the geometry that is
   * actually under the node.
   *
   * Nothing is hard-coded about the board's size: a generated deck arrives at
   * whatever scale the model came in at, `SkaterRig.normaliseDeck` then pins it
   * to its own numbers, and a stand-in deck is a different shape again. So the
   * four particles are placed off the subtree's own bounding box — nose, tail,
   * and the two wheel lines — which is right for all three and cannot drift out
   * of step with a constant in another file.
   */
  private shape(): boolean {
    if (this.shaped) return this.grains.length > 0;
    this.shaped = true;
    this.node.updateWorldMatrix(true, true);
    _mi.copy(this.node.matrixWorld).invert();
    const box = new THREE.Box3();
    const corner = new THREE.Vector3();
    this.node.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox;
      if (!b) return;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
        corner.applyMatrix4(mesh.matrixWorld).applyMatrix4(_mi);
        box.expandByPoint(corner);
      }
    });
    if (box.isEmpty()) return false;

    // Long axis is the nose-tail line: `normaliseDeck` puts it on +Z, and a
    // stand-in deck is built that way too, but measuring it costs one compare
    // and means a deck that arrives the other way round still falls right.
    const size = box.getSize(_v).clone();
    const along = size.z >= size.x ? "z" : "x";
    const half = (along === "z" ? size.z : size.x) / 2;
    const wide = (along === "z" ? size.x : size.z) / 2;
    const centre = box.getCenter(_w).clone();
    /**
     * One radius, and it is half the deck's THICKNESS — not the wheels' and not
     * the grip tape's.
     *
     * A plank has two faces and it can come to rest on either. Measured with
     * the particles set at the top and bottom of the box (nose and tail on the
     * grip tape, the wheel lines underneath), a deck that lands upside down
     * rests on its 2.5 cm nose sphere and puts the whole 12.5 cm of its own
     * depth THROUGH the concrete: the harness read the deck 11 cm under the
     * floor on every plaza bail. Four spheres on the deck's own mid-plane, each
     * as fat as the deck is half-thick, rest right way up and upside down alike.
     */
    const r = Math.max(0.012, size.y / 2);
    const midY = centre.y;

    // Not the full corner-to-centre diagonal: four spheres live on the deck's
    // centre line, so quoting the diagonal turns a flat plank into a fat log and
    // the deck comes to rest perched ON him — measured, 22 to 25 cm over the
    // floor on every ledge bail. A third of the half-width past the face covers
    // most of the corner and still lies down.
    const fat = r + wide * 0.3;
    const put = (x: number, y: number, z: number, radius: number): void => {
      this.grains.push({
        local: new THREE.Vector3(x, y, z),
        radius,
        fat,
        pos: new THREE.Vector3(),
        prev: new THREE.Vector3(),
        was: new THREE.Vector3(),
        kick: new THREE.Vector3(),
        floorRef: 0,
        touching: false,
      });
    };
    // Nose, tail, and the two rails — inset by their own radius, so the four
    // spheres between them cover the deck's real footprint and no more.
    if (along === "z") {
      put(centre.x, midY, centre.z + Math.max(r, half - r), r); // nose
      put(centre.x, midY, centre.z - Math.max(r, half - r), r); // tail
      put(centre.x - Math.max(r * 0.4, wide - r), midY, centre.z, r); // toe rail
      put(centre.x + Math.max(r * 0.4, wide - r), midY, centre.z, r); // heel rail
    } else {
      put(centre.x + Math.max(r, half - r), midY, centre.z, r);
      put(centre.x - Math.max(r, half - r), midY, centre.z, r);
      put(centre.x, midY, centre.z - Math.max(r * 0.4, wide - r), r);
      put(centre.x, midY, centre.z + Math.max(r * 0.4, wide - r), r);
    }
    // Every pair, which is what makes four points a rigid solid rather than a
    // shape that can fold flat through itself.
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) {
        this.links.push({ a, b, rest: this.grains[a].local.distanceTo(this.grains[b].local) });
      }
    }
    return true;
  }

  /**
   * The board leaves his feet.
   *
   * `velocity` is what the ride was carrying, `floor` the ground he bailed over
   * — the one height in the fall that costs no query and cannot be lied about.
   */
  start(velocity: THREE.Vector3, floor: number): void {
    if (!this.shape()) return;
    this.node.updateWorldMatrix(true, false);
    this.node.matrixWorld.decompose(this.worldPos, this.worldQuat, _scale);
    this.localScale.copy(this.node.scale);
    // The rig's own roll and yaw, taken BEFORE anything here has written to the
    // node — so they are the rig's, whatever they are, rather than a constant
    // this file would have to assume. See `unpollute`.
    this.restSpin.copy(this.node.rotation);
    this.bailFloor = floor;

    // Everything under the node is held exactly as the bail found it, so the
    // rig writing a trick's roll into the deck's own flip node mid-fall cannot
    // turn up as a deck spinning about an axis the fall never applied.
    this.frozen.length = 0;
    this.node.traverse((o: THREE.Object3D) => {
      if (o === this.node) return;
      this.frozen.push({
        node: o,
        position: o.position.clone(),
        quaternion: o.quaternion.clone(),
        scale: o.scale.clone(),
      });
    });

    // The board runs on ahead and turns over as it goes. The spin is about the
    // deck's own long axis, applied as a velocity field on the four particles,
    // so the shape stays rigid and the tumble comes out of the integration
    // rather than out of a keyframe.
    const speed = Math.hypot(velocity.x, velocity.z);
    const spin = Math.min(TUMBLE_MAX, TUMBLE * speed);
    _z.set(0, 0, 1).applyQuaternion(this.worldQuat).normalize();
    for (const g of this.grains) {
      g.pos.copy(g.local).applyMatrix4(this.node.matrixWorld);
      g.touching = false;
      g.floorRef = Math.min(g.pos.y - g.radius, floor);
      // v = kick + ω × r, with ω along the deck's nose-tail line.
      _v.copy(velocity).multiplyScalar(KICK);
      _r.subVectors(g.pos, this.worldPos);
      _v.addScaledVector(_w.crossVectors(_z, _r), spin);
      g.prev.copy(g.pos).addScaledVector(_v, -1 / 180);
    }
    this.state = "falling";
    this.returnT = 0;
    this.calm = 0;
    this.ran = 0;
  }

  /** One substep of the same clock the skeleton runs on. */
  step(h: number, body: readonly BodySegment[]): void {
    if (this.state !== "falling" || this.calm >= STILL_HOLD) return;
    const drag = Math.max(0, 1 - AIR_DRAG * h);
    const gravity = GRAVITY * h * h;
    this.ran += h;

    for (const g of this.grains) {
      g.was.copy(g.pos);
      _v.subVectors(g.pos, g.prev).multiplyScalar(drag);
      g.prev.copy(g.pos);
      g.pos.add(_v);
      g.pos.y -= gravity;
    }

    for (let k = 0; k < SHAPE_PASSES; k++) this.solveShape();
    // …and the body BEFORE the floor, so a deck pushed off a limb still gets
    // stood on the concrete in the same substep instead of being left a hand's
    // width under it until the next one. Interleaved with the shape for the
    // same reason the skeleton interleaves its own turn cap: whatever runs last
    // wins, and a rigid plate solved after a separation puts a corner straight
    // back into the limb it was just taken out of.
    for (const g of this.grains) g.kick.set(0, 0, 0);
    for (let k = 0; k < BODY_PASSES; k++) {
      this.solveBody(body);
      this.solveShape();
    }
    this.settleKick(h);
    this.solveFloor(h);
    for (let k = 0; k < SHAPE_PASSES; k++) this.solveShape();
    // …and the LAST word is that it is not inside him, because the floor solve
    // above is a writer too and it pushes UP. A deck trapped between a shin and
    // the concrete was being lifted straight into the shin by the very pass that
    // took it off the floor, and the shape passes after it then held it there:
    // measured across all 195 rows with only the pre-floor block, the worst
    // frame ran 12.1 to 15.5 cm into him — worse than the build this round
    // started from, because a deck that now stays WITH the body meets it far
    // more often than one that left the plaza.
    //
    // The shape runs FIRST here and the body LAST, which is the opposite way
    // round from the block before the floor and it is deliberate: there the
    // point is that the deck stays a rigid plank while it is being taken out of
    // him, here the point is that the last thing anybody says about it is that
    // it is out. Ending on a shape pass instead left the deck at rest 10.7 cm
    // inside him on the 45 fps 540 — a corner put back into a shin by the rigid
    // solve, on the very last pass of the substep, with nothing after it to
    // notice. Eight passes in, the shape is converged to microns and putting it
    // second costs nothing.
    //
    // Bounded the same way as the block before the floor rather than silenced
    // outright: a deck wedged between a limb and the concrete has to be able to
    // work its way out over a few substeps, and with no give at all it simply
    // stays there.
    for (const g of this.grains) g.kick.set(0, 0, 0);
    for (let k = 0; k < BODY_PASSES; k++) {
      this.solveShape();
      this.solveBody(body);
    }
    this.settleKick(h);

    // …and whether it is done. The worst corner, not the average of four, for
    // the same reason the skeleton takes its worst particle: a deck spinning
    // flat on the ground has a still centre and two corners doing 2 m/s.
    let moved = 0;
    for (const g of this.grains) moved = Math.max(moved, g.was.distanceTo(g.pos));
    this.calm = moved / h < STILL ? this.calm + h : Math.max(0, this.calm - h);
    if (this.ran >= MAX_ROLL) this.calm = STILL_HOLD;
  }

  private solveShape(): void {
    for (const link of this.links) {
      const a = this.grains[link.a];
      const b = this.grains[link.b];
      _v.subVectors(b.pos, a.pos);
      const d = _v.length();
      if (d < 1e-6) continue;
      const push = ((d - link.rest) / d) * SHAPE_STIFFNESS * 0.5;
      a.pos.addScaledVector(_v, push);
      b.pos.addScaledVector(_v, -push);
    }
  }

  /**
   * The half the player actually asked for: the deck may not be inside him.
   *
   * Every EDGE of the deck is tested against every bone, not just the four
   * corners — a plank lying across a ribcage has all four of its corners in
   * clear air, which is exactly the frame the shots caught. One-sided: the deck
   * comes out, the body is not touched.
   *
   * **And it is a separation, not a kick.** `prev` is carried with `pos`, so
   * taking the deck out of a limb moves it and does not give it any speed. That
   * is one line and it is the difference between a board dropping at a man's
   * feet and a board leaving the scene: in verlet, position IS velocity, and the
   * deck starts every fall with its four particles already inside the soles it
   * was being ridden on — the shoes are chunky, their bones sit well inside them
   * (`SkaterRig.SOLE_CLEARANCE` says so), and the corners of a 21 cm plank reach
   * further than the centre line does. So the first substep of every bail found
   * an overlap it had to undo, and undoing it at 1/180 s read back as metres per
   * second of launch. Measured on the one case with no speed in it at all —
   * `stand still, dropped 1.2 m`, rider stationary, `KICK` therefore contributing
   * exactly nothing — the deck finished **2.31 m** from where the rig was holding
   * it. There is no force in that scene that could do that; it was this.
   *
   * A limb that genuinely sweeps into the deck now shoves it out of the way
   * without throwing it, which is the right answer for both: a 3 kg plank pushed
   * by a leg slides, and a resting contact is resolved by not overlapping rather
   * than by bouncing.
   *
   * Carried WHOLE it went too far the other way: with the separation made
   * perfectly silent the deck stopped having any reason to leave a limb it was
   * resting against, and the two 540 bails at 45 fps came to rest with the deck
   * 11.4 cm inside him against a 4 cm bound. So the give is a SPEED — see
   * `SEPARATE_GIVE` — rather than all or nothing.
   */
  private solveBody(body: readonly BodySegment[]): void {
    if (body.length === 0) return;
    for (const link of this.links) {
      const a = this.grains[link.a];
      const b = this.grains[link.b];
      for (const seg of body) {
        const hit = closestOnSegments(a.pos, b.pos, seg.a, seg.b);
        const reach = seg.radius + (a.fat + b.fat) * 0.5;
        if (hit.d >= reach) continue;
        if (hit.d > 1e-6) _n.subVectors(_p, _q).divideScalar(hit.d);
        else _n.set(0, 1, 0);
        const push = reach - hit.d;
        // Barycentric, so the contact point on the deck's edge moves by exactly
        // `push` and the deck turns about it instead of being shoved bodily.
        a.pos.addScaledVector(_n, push * (1 - hit.s));
        b.pos.addScaledVector(_n, push * hit.s);
        // …and kept, so the substep can decide how much of the WHOLE separation
        // is allowed to read back as speed. Capping it per contact instead was
        // tried and is not a cap at all: four passes over six edges against
        // twenty-odd bones resolve one overlap many times over, and the standing
        // drop — where nothing else in the scene can move the deck — went from
        // 0.86 m to 2.95 m on that arithmetic alone.
        a.kick.addScaledVector(_n, push * (1 - hit.s));
        b.kick.addScaledVector(_n, push * hit.s);
      }
    }
  }

  /**
   * …and the one place that decides how much of it was a shove. See
   * `SEPARATE_GIVE`: everything past `SEPARATE_GIVE · h` of the substep's whole
   * separation is carried on `prev` too, so it moved the deck and gave it
   * nothing.
   */
  private settleKick(h: number): void {
    const room = SEPARATE_GIVE * h;
    for (const g of this.grains) {
      const d = g.kick.length();
      if (d <= room) continue;
      g.prev.addScaledVector(g.kick, (d - room) / d);
    }
  }

  private solveFloor(h: number): void {
    for (const g of this.grains) {
      // The floor a deck is entitled to: at or below it, or within one step of
      // the lowest ground it has held. See `FLOOR_RISE_MAX`.
      const low = g.pos.y - g.radius;
      const blocked = this.surface.blocked(g.pos.x, g.pos.z, g.pos.y);
      if (g.touching) g.floorRef = low;
      else if (low < g.floorRef && !blocked) g.floorRef = low;
      const ceiling = Math.max(low, Math.min(g.floorRef, this.bailFloor) + FLOOR_RISE_MAX);
      const s = this.surface.sample(g.pos.x, g.pos.z, ceiling + 0.05, this.sample);
      const floorY = (s.height <= ceiling ? s.height : Math.min(ceiling, this.bailFloor)) + g.radius;

      // A wall stops it flat: back out along whichever horizontal it came in on.
      // A LIP does not — see `STEP_UP`. The two are told apart by asking the
      // world the same question a step higher: something whose top is inside
      // that reach is a kerb, a stair nose, a manual pad's face, and a board
      // riding at it goes over it. Only a face that is still solid up there is
      // a wall, and only that stops the deck.
      if (blocked) {
        // …and only at SPEED. A board doing 18 m/s rides a kerb; a board that has
        // nearly stopped rolls up against it and stays there. Without this the
        // step is a ratchet — 0.18 m a substep, and a deck nudged along a ledge's
        // base climbs 0.6 m of it in four — and `LOOK off the ledge` caught it,
        // the deck coming to rest perched 45 cm over the pavement.
        const runX = g.pos.x - g.prev.x;
        const runZ = g.pos.z - g.prev.z;
        const riding = Math.hypot(runX, runZ) / h >= STEP_SPEED;
        const overIt = riding && !this.surface.blocked(g.pos.x, g.pos.z, g.pos.y + STEP_UP);
        const top = overIt
          ? this.surface.sample(g.pos.x, g.pos.z, g.pos.y + STEP_UP, this.sample).height + g.radius
          : 0;
        if (overIt && top > g.pos.y && top <= g.pos.y + STEP_UP) {
          // Up onto it, carrying the horizontal through untouched. `prev` rises
          // with `pos`, so climbing a kerb hands the deck no vertical speed —
          // the same rule the floor's own lift follows, for the same reason.
          const up = top - g.pos.y;
          g.pos.y += up;
          g.prev.y += up;
          g.floorRef = g.pos.y - g.radius;
          g.touching = true;
          continue;
        }
        const dx = g.pos.x - g.prev.x;
        const dz = g.pos.z - g.prev.z;
        const len = Math.hypot(dx, dz);
        if (len > 1e-5) {
          const back = Math.min(len, MAX_STEP);
          g.pos.x -= (dx / len) * back;
          g.pos.z -= (dz / len) * back;
          g.prev.x = g.pos.x;
          g.prev.z = g.pos.z;
        }
      }

      if (g.pos.y > floorY + 1e-4) {
        g.touching = false;
        continue;
      }
      _n.copy(s.normal);
      if (_n.y < 0.12) _n.set(0, 1, 0);
      const lift = Math.min(floorY - g.pos.y, MAX_LIFT);
      if (lift > 0) g.pos.addScaledVector(_n, lift * Math.max(_n.y, 0.25));

      // Velocity rebuilt across the normal, kept along the face — the same
      // shape the skeleton's contacts use, and for the same reason: the lift
      // above is a position edit and reading it back as speed is how a thing
      // launches itself off the floor it just landed on.
      _v.subVectors(g.pos, g.prev).divideScalar(h);
      const arriving = _v.dot(_n);
      _v.addScaledVector(_n, -arriving);
      const was = _v.length();
      if (was > 1e-6) {
        // Two different things take speed off a deck on the ground and this file
        // only ever had one of them. `viscous`/`BRAKE` is the SLIDING loss and it
        // is paid per second of contact; `bite` is the IMPACT loss and it is paid
        // per landing, whether or not the corner stays down. A cartwheeling plank
        // spends its whole run in the air between strikes, so without the second
        // one it slides for as long as it takes to bounce and never pays for the
        // bouncing. See `IMPACT_GRIP`.
        const viscous = was * (1 - Math.exp(-FRICTION * h));
        const bite = arriving < 0 ? IMPACT_GRIP * -arriving : 0;
        _v.setLength(Math.max(0, was - Math.min(viscous, BRAKE * h) - bite));
      }
      if (_v.lengthSq() < STILL * STILL) _v.set(0, 0, 0);
      if (arriving < 0) _v.addScaledVector(_n, -arriving * RESTITUTION);
      g.prev.copy(g.pos).addScaledVector(_v, -h);
      g.touching = true;
    }
  }

  /**
   * Where the four particles put the deck, written into the node's own local
   * transform — so nothing is reparented and the rig's graph is untouched.
   *
   * `home` is 0 while he is down and rides to 1 across the get-up, at which
   * point what this writes is exactly what the rig was writing anyway and
   * handing it back is a no-op rather than a jump.
   */
  pose(dt: number): void {
    if (this.state === "off") return;
    this.unpollute();
    if (this.state === "returning") {
      this.returnT += dt;
      if (this.returnT >= BOARD_RETURN) {
        this.state = "off";
        return; // the rig's own local transform is already what is on the node
      }
    }
    const parent = this.node.parent;
    // The rig writes the deck's home pose into this same local transform every
    // frame before we get here, so it is read BEFORE anything is overwritten.
    _homePos.copy(this.node.position);
    _home.copy(this.node.quaternion);

    // A frame from four points: the nose-tail line, the wheel line, and the up
    // that has to be square to both.
    const [nose, tail, left, right] = this.grains;
    _z.subVectors(nose.pos, tail.pos);
    _x.subVectors(right.pos, left.pos);
    if (_z.lengthSq() < 1e-10 || _x.lengthSq() < 1e-10) return;
    _z.normalize();
    _y.crossVectors(_z, _x);
    if (_y.lengthSq() < 1e-10) return;
    _y.normalize();
    _x.crossVectors(_y, _z).normalize();
    _m.makeBasis(_x, _y, _z);
    _quat.setFromRotationMatrix(_m);
    // …and the origin, from the pair whose midpoint the deck's own frame knows.
    _v.copy(nose.local).add(tail.local).multiplyScalar(0.5).applyQuaternion(_quat);
    _p.copy(nose.pos).add(tail.pos).multiplyScalar(0.5).sub(_v);

    // Into the parent's frame. The deck's scale is left exactly as it was: a
    // fall turns a board over, it does not resize it.
    if (parent) {
      parent.updateWorldMatrix(true, false);
      _mi.copy(parent.matrixWorld).invert();
      _p.applyMatrix4(_mi);
      _quat.premultiply(parent.getWorldQuaternion(_parentQuat).invert());
    }

    const w = this.state === "returning" ? ease(this.returnT / BOARD_RETURN) : 0;
    this.node.position.copy(_p).lerp(_homePos, w);
    this.node.quaternion.copy(_quat).slerp(_home, w);
    this.node.scale.copy(this.localScale);
    for (const f of this.frozen) {
      f.node.position.copy(f.position);
      f.node.quaternion.copy(f.quaternion);
      f.node.scale.copy(f.scale);
    }
    this.node.updateWorldMatrix(false, true);
  }

  /**
   * Takes this file's own leftovers back off the node before its home pose is
   * read — and it is the whole of "the board comes back flat, every time".
   *
   * The node is SHARED, and the two writers do not describe it the same way.
   * `SkaterRig.followFeet` writes its position whole and exactly one axis of its
   * rotation, `boardPitch.rotation.x`, because from the rig's side the other two
   * are constants: a ridden deck rolls and yaws on nodes further down the chain,
   * never on this one. This file writes a QUATERNION — three axes — and three
   * keeps `rotation` and `quaternion` in step, so the frame after a tumble the
   * node's euler reads (pitch, tumble-yaw, tumble-roll), the rig corrects the
   * pitch, and nothing anywhere ever corrects the other two again.
   *
   * That is a feedback loop and not merely a leftover, because `pose` reads its
   * `home` off this same node: the return blends toward the tumble it is
   * supposed to be undoing, converges on it, and hands the rig back a deck stuck
   * in it for the rest of the session. Measured over a 1.2 m drop at four bail
   * speeds and three frame rates, the deck came home 4.7–5.1° off the skater's
   * heading at every speed and **180.0° of roll — wheels up, upside down, and
   * staying that way — at 12 and 16 m/s**, which is the player's report word for
   * word.
   *
   * So the two axes the rig does not write are put back to what the rig had at
   * the bail, first thing, every frame this file runs. What is left on the node
   * after that is exactly the rig's own pose, `home` means it again, and w = 1
   * at the end of the return is a genuine no-op rather than a snap.
   */
  private unpollute(): void {
    this.node.rotation.y = this.restSpin.y;
    this.node.rotation.z = this.restSpin.z;
  }

  /**
   * The ride is taking its board back: carry the deck under his feet.
   *
   * Over `BOARD_RETURN`, always — see that constant for why this stopped being
   * timed off the stand-up.
   */
  release(): void {
    if (this.state === "falling") {
      this.state = "returning";
      this.returnT = 0;
    }
  }

  /** Drop it outright — R, or a body that never had a board to begin with. */
  cancel(): void {
    // Mid-tumble, and this is the one exit that does not run the return, so it
    // is the one place that would otherwise leave a cartwheel on the node.
    if (this.state !== "off") this.unpollute();
    this.state = "off";
  }
}

/** A cosine ease, so the deck slides home instead of starting and stopping hard. */
function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 0.5 - 0.5 * Math.cos(x * Math.PI);
}

/**
 * Closest approach of two segments: the distance, and where along the FIRST one
 * it happens. `_p` and `_q` are left holding the two closest points.
 */
const _hit = { d: 0, s: 0 };
function closestOnSegments(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
): { d: number; s: number } {
  const d1 = _d1.subVectors(q1, p1);
  const d2 = _d2.subVectors(q2, p2);
  const r = _r.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s = 0;
  let t = 0;
  if (a < 1e-9 && e < 1e-9) {
    _p.copy(p1);
    _q.copy(p2);
    _hit.d = _p.distanceTo(_q);
    _hit.s = 0;
    return _hit;
  }
  if (a < 1e-9) {
    t = clamp01(f / e);
  } else {
    const c = d1.dot(r);
    if (e < 1e-9) {
      s = clamp01(-c / a);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > 1e-9 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  _p.copy(p1).addScaledVector(d1, s);
  _q.copy(p2).addScaledVector(d2, t);
  _hit.d = _p.distanceTo(_q);
  _hit.s = s;
  return _hit;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
