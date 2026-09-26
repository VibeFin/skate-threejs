// WHAT THE WATER LEFT — the channel's own rubbish, built in code.
//
// Map 2 had this coming out of the shared procedural street library
// (`src/world/procedural`) and it does not any more, for two reasons, and the
// second one is the real one:
//
// · **The furniture is wrong.** That catalogue is a DOWNTOWN BLOCK's — parking
//   meters, mailboxes, news boxes, a bus stop. A flood channel behind a town
//   collects oil drums, pallets, a barrier somebody threw over the fence and a
//   supermarket trolley, and the two lists barely overlap.
//
// · **A shared library another lane is rewriting is a shared point of failure.**
//   Map 2 imported `STREET_PROPS` at module scope, so every minute that file
//   spent half-saved was a minute this map would not load at all — watched
//   twice, both times as a black screen with `prop.build is not a function`
//   behind it, both times nothing to do with this map. A lane whose work cannot
//   be reviewed while a neighbour is typing is a lane that has not shipped.
//
// The contract is deliberately the same shape the street library uses, so the
// two remain swappable: the origin is the base centre, `y = 0` is the ground it
// stands on, the prop faces +Z, `build(seed)` is pure, and `block` is the three
// numbers `features.ts` turns into a collider — `null` meaning scenery you
// knock through. Six factories, five materials, and every static part of a prop
// is a handful of boxes and cylinders, so the whole set is a few draw calls.

import * as THREE from "three";

export type ClutterId = "drum" | "pallets" | "barrier" | "trolley" | "tyre" | "sign";

/** A box the ride can be stopped by: half-extents, and the height you land on. */
export interface ClutterBlock {
  hx: number;
  hz: number;
  top: number;
}

export interface ClutterKind {
  /** One line, so a placement pass can choose without opening the factory. */
  what: string;
  /** The HONEST footprint at board height, or null for something you go through. */
  block: ClutterBlock | null;
  build(seed: number, mats: ClutterMaterials): THREE.Group;
}

export interface ClutterMaterials {
  /** Galvanised and bare steel — drums, trolleys, sign posts, barrow frames. */
  steel: THREE.MeshStandardMaterial;
  /** Painted steel, and it is the only saturated colour in this map. */
  enamel: THREE.MeshStandardMaterial;
  /** Sawn softwood — pallets. */
  timber: THREE.MeshStandardMaterial;
  /** Moulded polyethylene — the road barrier. */
  poly: THREE.MeshStandardMaterial;
  /** Perished rubber. */
  rubber: THREE.MeshStandardMaterial;
  dispose(): void;
}

/**
 * Fresh, unshared, per map mount.
 *
 * `maps.ts` disposes every material on every node it removes when a spot is
 * unmounted, so a shared singleton here would take the next map's props down
 * with it on the way out — which is the bug the street library's own
 * `createPropMaterials` exists to let a caller avoid.
 */
export function clutterMaterials(): ClutterMaterials {
  const steel = new THREE.MeshStandardMaterial({ color: 0x8d9298, roughness: 0.62, metalness: 0.55 });
  const enamel = new THREE.MeshStandardMaterial({ color: 0xb4622c, roughness: 0.55, metalness: 0.1 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x9a7c52, roughness: 0.94 });
  const poly = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.72 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.95 });
  return {
    steel,
    enamel,
    timber,
    poly,
    rubber,
    dispose() {
      for (const m of [steel, enamel, timber, poly, rubber]) m.dispose();
    },
  };
}

/** Deterministic — same seed, same object, every boot, so a look can be judged. */
function rand(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function part(
  g: THREE.Group,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// the factories
// ---------------------------------------------------------------------------

/** A 205-litre steel drum, upright or tipped, with two rolling hoops. */
function drum(seed: number, mats: ClutterMaterials): THREE.Group {
  const r = rand(seed);
  const g = new THREE.Group();
  const tipped = r() > 0.55;
  const skin = r() > 0.5 ? mats.steel : mats.enamel;
  const body = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12);
  const hoop = new THREE.CylinderGeometry(0.31, 0.31, 0.07, 12);
  if (tipped) {
    // On its side, and the yaw the placement gives it is the way it rolled.
    part(g, body, skin, 0, 0.29, 0, Math.PI / 2);
    part(g, hoop, mats.steel, 0, 0.29, -0.22, Math.PI / 2);
    part(g, hoop, mats.steel, 0, 0.29, 0.22, Math.PI / 2);
  } else {
    part(g, body, skin, 0, 0.44, 0);
    part(g, hoop, mats.steel, 0, 0.26, 0);
    part(g, hoop, mats.steel, 0, 0.62, 0);
  }
  return g;
}

/** One to four timber pallets, stacked and not quite square to each other. */
function pallets(seed: number, mats: ClutterMaterials): THREE.Group {
  const r = rand(seed);
  const g = new THREE.Group();
  const n = 1 + Math.floor(r() * 4);
  const deck = new THREE.BoxGeometry(1.2, 0.022, 0.11);
  const bearer = new THREE.BoxGeometry(0.1, 0.09, 0.8);
  for (let i = 0; i < n; i++) {
    const y = i * 0.145;
    const lean = (r() - 0.5) * 0.16;
    const skew = (r() - 0.5) * 0.05;
    for (let k = 0; k < 5; k++) {
      part(g, deck, mats.timber, skew, y + 0.135, -0.34 + k * 0.17, 0, lean);
    }
    for (const bx of [-0.5, 0, 0.5]) {
      part(g, bearer, mats.timber, skew + bx * Math.cos(lean), y + 0.06, bx * Math.sin(lean), 0, lean);
    }
  }
  return g;
}

/** A water-filled plastic road barrier, the kind that ends up in a ditch. */
function barrier(seed: number, mats: ClutterMaterials): THREE.Group {
  const r = rand(seed);
  const g = new THREE.Group();
  const body = new THREE.BoxGeometry(1.9, 0.62, 0.42);
  const foot = new THREE.BoxGeometry(2.0, 0.12, 0.58);
  part(g, foot, mats.poly, 0, 0.06, 0);
  part(g, body, mats.poly, 0, 0.43, 0);
  // The reflective bands, and the only place in this map anything is orange.
  const band = new THREE.BoxGeometry(0.3, 0.5, 0.44);
  for (let i = 0; i < 3; i++) part(g, band, mats.enamel, -0.62 + i * 0.62, 0.44, 0);
  if (r() > 0.6) g.rotation.z = (r() - 0.5) * 0.5; // shoved over
  return g;
}

/** A supermarket trolley, on its side. Scenery — you knock through it. */
function trolley(seed: number, mats: ClutterMaterials): THREE.Group {
  const r = rand(seed);
  const g = new THREE.Group();
  const basket = new THREE.Group();
  const wire = new THREE.BoxGeometry(0.012, 0.012, 0.86);
  const rib = new THREE.BoxGeometry(0.52, 0.012, 0.012);
  for (let i = 0; i < 7; i++) {
    const x = -0.24 + i * 0.08;
    part(basket, wire, mats.steel, x, 0.32, 0);
    part(basket, wire, mats.steel, x, 0.62, 0);
  }
  for (let i = 0; i < 8; i++) part(basket, rib, mats.steel, 0, 0.3 + i * 0.045, -0.4 + i * 0.02);
  // Legs and castors, splayed the way they are when the thing is over.
  const leg = new THREE.BoxGeometry(0.02, 0.3, 0.02);
  for (const sx of [-0.22, 0.22]) {
    for (const sz of [-0.36, 0.36]) part(basket, leg, mats.steel, sx, 0.15, sz);
  }
  basket.rotation.z = Math.PI / 2 + (r() - 0.5) * 0.3;
  basket.position.y = 0.28;
  g.add(basket);
  return g;
}

/** A car tyre, half buried in silt. Scenery. */
function tyre(seed: number, mats: ClutterMaterials): THREE.Group {
  const r = rand(seed);
  const g = new THREE.Group();
  const t = new THREE.TorusGeometry(0.3, 0.11, 6, 14);
  part(g, t, mats.rubber, 0, 0.09, 0, Math.PI / 2 + (r() - 0.5) * 0.5, r() * 3);
  return g;
}

/**
 * The sign on the walkway: a U-channel post with a warning blade on it. It is
 * the one thing on the fence line that says what this place is.
 */
function sign(seed: number, mats: ClutterMaterials): THREE.Group {
  const r = rand(seed);
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.07, 2.3, 0.07), mats.steel, 0, 1.15, 0);
  const blade = new THREE.BoxGeometry(0.62, 0.78, 0.025);
  part(g, blade, mats.enamel, 0, 1.9, 0.05);
  if (r() > 0.5) {
    part(g, new THREE.BoxGeometry(0.5, 0.3, 0.025), mats.poly, 0, 1.32, 0.05);
  }
  return g;
}

/**
 * The catalogue.
 *
 * The `block` is the separate, deliberate call — it is what the ride hits, so
 * it is the object's honest footprint AT BOARD HEIGHT and never its full
 * extent. A trolley on its side and a tyre are `null`: a skater goes through
 * both, and a thing you cannot ride through has to look like a thing you cannot
 * ride through. Everything with mass is topped where you would actually land on
 * it, which is what makes a drum lid a surface rather than an invisible stop.
 */
export const CLUTTER: Record<ClutterId, ClutterKind> = {
  drum: { what: "205 l steel drum, upright or rolled over", block: { hx: 0.3, hz: 0.3, top: 0.88 }, build: drum },
  pallets: { what: "one to four timber pallets, stacked", block: { hx: 0.62, hz: 0.42, top: 0.58 }, build: pallets },
  barrier: { what: "plastic water-filled road barrier", block: { hx: 1.0, hz: 0.3, top: 0.68 }, build: barrier },
  trolley: { what: "supermarket trolley on its side — scenery", block: null, build: trolley },
  tyre: { what: "car tyre in the silt — scenery", block: null, build: tyre },
  sign: { what: "warning sign on a U-channel post", block: { hx: 0.1, hz: 0.1, top: 2.3 }, build: sign },
};
