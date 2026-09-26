// Where is the skater on screen through a look-left and a look-right?
//
//   node tools/orbit-check.mjs
//
// The real module, the real vendored rig, the real pointer-lock aim path. The
// look is driven by dispatching pointermove events at the element the module
// and the rig both listen on, so the sign convention under test is the game's
// own and not one this file re-derived.
//
// Measured: the horizontal screen position of the skater (NDC x, and pixels off
// centre on a 1280x800 frame) after a look of N degrees, at several speeds, on
// a dead-flat straight-line ride with no world (so the boom is unconstrained
// and the only thing that can move him is the rig's own geometry).

import * as THREE from "three";

// ---- the smallest DOM the camera module and the vendored rig will boot on ----
const listeners = new Map();
function add(map, type, fn) {
  if (!map.has(type)) map.set(type, []);
  map.get(type).push(fn);
}
const docListeners = new Map();
const winListeners = new Map();

const dom = {
  clientHeight: 800,
  clientWidth: 1280,
  addEventListener: (t, fn) => add(listeners, t, fn),
  removeEventListener: () => {},
  setPointerCapture: () => {},
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  requestPointerLock: () => {},
  style: {},
};

globalThis.document = {
  pointerLockElement: null,
  addEventListener: (t, fn) => add(docListeners, t, fn),
  removeEventListener: () => {},
  exitPointerLock: () => {},
};
globalThis.window = {
  addEventListener: (t, fn) => add(winListeners, t, fn),
  removeEventListener: () => {},
};
globalThis.matchMedia = () => ({ matches: true });

const fire = (map, type, ev) => (map.get(type) ?? []).forEach((fn) => fn(ev));

// Resolved the way every other harness in this folder does it, rather than off
// an absolute path — this file was written in a scratchpad and the absolute
// import is exactly what stopped it running once it moved in here.
const { register } = await import("node:module");
register(new URL("./ts-resolve.mjs", import.meta.url));
const { createSkateCamera } = await import("../src/camera/skate-camera.ts");

const AIM_SENSITIVITY = 0.0023; // the rig's default; skate-camera never overrides it
const DT = 1 / 60;

/**
 * Run one ride: hold `speed` in a straight line along +Z, then look `deg`
 * degrees (positive = LEFT, i.e. the mouse moved left) and let the rig's own
 * 0.09 s drag damping settle. Returns where he ended up on screen.
 */
function ride(speed, deg) {
  const camera = new THREE.PerspectiveCamera(62, 1280 / 800, 0.1, 600);
  const cam = createSkateCamera(camera, dom);
  document.pointerLockElement = null;

  const subject = {
    position: new THREE.Vector3(0, 0, 0),
    course: 0,
    speed,
    surface: undefined,
  };

  const step = () => {
    subject.position.z += speed * DT;
    cam.update(subject, DT, true);
  };

  for (let i = 0; i < 300; i++) step(); // settle the follow at this speed

  // Take the lock, the way a DROP IN click does.
  document.pointerLockElement = dom;
  fire(docListeners, "pointerlockchange", {});

  const LOOK_FRAMES = 24;
  const theta = (deg * Math.PI) / 180;
  // rotate(-movementX * s) -> a POSITIVE theta (look left) needs movementX < 0.
  const movementX = -theta / (LOOK_FRAMES * AIM_SENSITIVITY);
  for (let i = 0; i < LOOK_FRAMES; i++) {
    fire(listeners, "pointermove", {
      pointerType: "mouse",
      buttons: 0,
      button: -1,
      movementX,
      movementY: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
    });
    step();
  }
  for (let i = 0; i < 24; i++) step(); // the rig's drag damping settles (0.09 s)

  camera.updateMatrixWorld(true);
  const shoulder = subject.position.clone().setY(subject.position.y + 1.45);
  const deck = subject.position.clone();
  const nShoulder = shoulder.clone().project(camera);
  const nDeck = deck.clone().project(camera);
  const dist = camera.position.distanceTo(shoulder);
  const fwd = camera.getWorldDirection(new THREE.Vector3());
  const nHead = subject.position.clone().setY(subject.position.y + 1.75).project(camera);
  const liveFov = camera.fov; // read BEFORE dispose — dispose hands the lens back
  cam.dispose();
  return {
    ndcX: nShoulder.x,
    px: nShoulder.x * 640,
    deckPx: nDeck.x * 640,
    deckY: nDeck.y * 400,
    headY: nHead.y * 400,
    dist,
    camY: camera.position.y - subject.position.y,
    fov: liveFov,
    // Where the optical axis actually points, degrees below horizontal.
    tilt:
      (Math.atan2(
        -fwd.y,
        Math.hypot(fwd.x, fwd.z),
      ) *
        180) /
      Math.PI,
  };
}

/**
 * The contract check: mouse-right turns the view RIGHT, mouse-up looks UP.
 * Read off a fixed world landmark rather than off an angle — the world must
 * slide screen-LEFT when the view turns right, and DOWN when the view looks up.
 */
function convention(movementX, movementY) {
  const camera = new THREE.PerspectiveCamera(62, 1280 / 800, 0.1, 600);
  const cam = createSkateCamera(camera, dom);
  document.pointerLockElement = null;
  const subject = { position: new THREE.Vector3(0, 0, 0), course: 0, speed: 0, surface: undefined };
  for (let i = 0; i < 300; i++) cam.update(subject, DT, true);
  document.pointerLockElement = dom;
  fire(docListeners, "pointerlockchange", {});
  // A landmark straight ahead of him, up at head height, 20 m out.
  const mark = new THREE.Vector3(0, 1.45, 20);
  camera.updateMatrixWorld(true);
  const before = mark.clone().project(camera);
  for (let i = 0; i < 24; i++) {
    fire(listeners, "pointermove", {
      pointerType: "mouse",
      buttons: 0,
      button: -1,
      movementX,
      movementY,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
    });
    cam.update(subject, DT, true);
  }
  for (let i = 0; i < 24; i++) cam.update(subject, DT, true);
  camera.updateMatrixWorld(true);
  const after = mark.clone().project(camera);
  cam.dispose();
  return { dx: (after.x - before.x) * 640, dy: (after.y - before.y) * 400 };
}

console.log("\nINPUT CONVENTION — a landmark 20 m ahead, px it moved in frame\n");
for (const [label, mx, my] of [
  ["mouse RIGHT", 3, 0],
  ["mouse LEFT ", -3, 0],
  ["mouse UP   ", 0, -3],
  ["mouse DOWN ", 0, 3],
]) {
  const r = convention(mx, my);
  const hor = r.dx < -1 ? "world went LEFT  -> view turned RIGHT" : r.dx > 1 ? "world went RIGHT -> view turned LEFT " : "";
  const ver = r.dy < -1 ? "world went DOWN  -> view looked UP  " : r.dy > 1 ? "world went UP    -> view looked DOWN" : "";
  console.log(
    `  ${label}  dx ${r.dx.toFixed(0).padStart(6)} px  dy ${r.dy.toFixed(0).padStart(6)} px   ${hor}${ver}`,
  );
}

const SPEEDS = [0, 3, 6, 10, 13, 17];
const LOOKS = [-90, -45, -20, 0, 20, 45, 90];

console.log(
  "\nSKATER'S HORIZONTAL SCREEN POSITION, px off centre on a 1280-wide frame",
  "\n(negative = screen LEFT.  look +deg = mouse LEFT = view turns LEFT)\n",
);
let head = "  m/s |";
for (const d of LOOKS) head += String(`${d > 0 ? "+" : ""}${d}°`).padStart(9);
console.log(head);
console.log("  ".padEnd(6, "-") + "+" + "-".repeat(9 * LOOKS.length));
for (const v of SPEEDS) {
  let row = String(v).padStart(5) + " |";
  for (const d of LOOKS) row += ride(v, d).px.toFixed(1).padStart(9);
  console.log(row);
}

console.log("\nDISTANCE from the lens to his shoulder, metres\n");
head = "  m/s |";
for (const d of LOOKS) head += String(`${d > 0 ? "+" : ""}${d}°`).padStart(9);
console.log(head);
console.log("  ".padEnd(6, "-") + "+" + "-".repeat(9 * LOOKS.length));
for (const v of SPEEDS) {
  let row = String(v).padStart(5) + " |";
  for (const d of LOOKS) row += ride(v, d).dist.toFixed(2).padStart(9);
  console.log(row);
}

console.log("\nTHE LENS TABLE — frame height at the skater, and how much of it he fills\n");
console.log("  m/s   km/h     FOV     h-FOV   dist   frame height   rider % of height   lens y   tilt");
for (const v of [0, 4, 8, 13, 17]) {
  const r = ride(v, 0);
  const fov = r.fov;
  const hFov = (2 * Math.atan(1.6 * Math.tan((fov * Math.PI) / 360)) * 180) / Math.PI;
  const h = 2 * r.dist * Math.tan((fov * Math.PI) / 360);
  console.log(
    `${String(v).padStart(5)}${String(Math.round(v * 3.6)).padStart(7)}` +
      `${fov.toFixed(2).padStart(9)}°${hFov.toFixed(2).padStart(9)}°` +
      `${r.dist.toFixed(2).padStart(7)}${h.toFixed(2).padStart(13)} m` +
      `${((1.75 / h) * 100).toFixed(1).padStart(16)}%` +
      `${r.camY.toFixed(2).padStart(9)}${r.tilt.toFixed(1).padStart(7)}°`,
  );
}

console.log("\nTHE PARKED SHOT (no look), by speed\n");
console.log("  m/s | lens y over deck | dist |  deck px-y | head px-y  (400 = top edge)");
for (const v of SPEEDS) {
  const r = ride(v, 0);
  console.log(
    String(v).padStart(5) +
      " | " +
      r.camY.toFixed(2).padStart(16) +
      " | " +
      r.dist.toFixed(2).padStart(4) +
      " | " +
      r.deckY.toFixed(0).padStart(10) +
      " | " +
      r.headY.toFixed(0).padStart(9),
  );
}
console.log("");

// ---- the boom against a world -------------------------------------------
//
// The march now starts at the skater rather than at the trailing pivot and runs
// one lag longer. Two shapes, the two the header names: a WALL (nothing to climb
// over -> the lens must come in and stay out of it) and a BANK (a top the lens
// can get over -> the lens must climb, not cut).

const WALL_Z = -2.5;
const wallWorld = {
  blocked: (x, z, y) => z < WALL_Z && y < 12,
  height: () => 0,
};
const bankWorld = {
  // A 1.6 m bank starting 2 m behind him, running back.
  blocked: (x, z, y) => y < bankWorld.height(x, z),
  height: (x, z) => (z < -2 ? Math.min(1.6, (-2 - z) * 0.8) : 0),
};

function worldRide(world, speed, deg, label) {
  const camera = new THREE.PerspectiveCamera(62, 1280 / 800, 0.1, 600);
  const cam = createSkateCamera(camera, dom);
  document.pointerLockElement = null;
  const subject = { position: new THREE.Vector3(0, 0, 0), course: 0, speed, surface: world };
  // Hold him ON THE SPOT so the obstacle stays where it is; the follow still
  // sees `speed`, which is what the lag and the FOV read.
  for (let i = 0; i < 300; i++) cam.update(subject, DT, true);
  document.pointerLockElement = dom;
  fire(docListeners, "pointerlockchange", {});
  const theta = (deg * Math.PI) / 180;
  const movementX = -theta / (24 * AIM_SENSITIVITY);
  for (let i = 0; i < 24; i++) {
    fire(listeners, "pointermove", {
      pointerType: "mouse", buttons: 0, button: -1, movementX, movementY: 0,
      clientX: 0, clientY: 0, pointerId: 1,
    });
    cam.update(subject, DT, true);
  }
  for (let i = 0; i < 40; i++) cam.update(subject, DT, true);
  camera.updateMatrixWorld(true);
  const shoulder = new THREE.Vector3(0, 1.45, 0);
  const px = shoulder.clone().project(camera).x * 640;
  const p = camera.position.clone();
  const inside = world.blocked(p.x, p.z, p.y) || p.y < world.height(p.x, p.z);
  cam.dispose();
  console.log(
    `  ${label.padEnd(6)} look ${String(deg).padStart(4)}°  lens (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})` +
      `  boom ${p.distanceTo(shoulder).toFixed(2)} m  skater ${px.toFixed(1).padStart(6)} px` +
      `  lens inside geometry: ${inside ? "YES  <-- BAD" : "no"}`,
  );
}

console.log("\nTHE BOOM AGAINST A WALL 2.5 m behind him (blocked below 12 m)\n");
for (const d of [0, -45, 45, 180]) worldRide(wallWorld, 0, d, "wall");
for (const d of [0, -45, 45, 180]) worldRide(wallWorld, 10, d, "wall");
console.log("\nTHE BOOM OVER A BANK rising 1.6 m behind him\n");
for (const d of [0, -45, 45, 180]) worldRide(bankWorld, 0, d, "bank");
for (const d of [0, -45, 45, 180]) worldRide(bankWorld, 10, d, "bank");
console.log("");
