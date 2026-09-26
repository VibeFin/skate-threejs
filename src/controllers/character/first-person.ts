// First-person body treatment (Revenant pilot D2): hide the LOCAL player's
// body from its own camera while keeping its shadow on the ground.
//
// Why not `visible = false`? That removes the mesh from the shadow pass too —
// the player loses their own shadow, one of the strongest grounding cues a
// first-person game has. Instead the meshes keep rendering but write no color
// and no depth: the shadow-map pass uses its own depth-material override, so
// the silhouette still lands in the shadow map.
//
// Why CLONED materials? VRM/Meshy loaders share materials across instances
// (the multiplayer clone pool shares one GPU set for every remote) — flipping
// `colorWrite` on a shared material would erase every REMOTE player's body
// too. Cloning localizes the change to this one model; restore disposes the
// clones and puts the originals back.
import * as THREE from "three";

const savedMaterials = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();

/**
 * Hide (or restore) a character model for first-person play. Call with the
 * LOCAL player's model root after it loads — never with a remote player's
 * clone. Idempotent in both directions.
 *
 * ```ts
 * followCam.firstPerson = true;         // camera at the eye anchor
 * setFirstPersonBody(playerModel, true); // body invisible, shadow kept
 * ```
 */
export function setFirstPersonBody(root: THREE.Object3D, hidden: boolean): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (hidden) {
      if (savedMaterials.has(mesh)) return; // already hidden
      savedMaterials.set(mesh, mesh.material);
      const clones = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(
        (material) => {
          const clone = material.clone();
          clone.colorWrite = false; // draws nothing…
          clone.depthWrite = false; // …and never occludes the scene
          return clone;
        },
      );
      mesh.material = Array.isArray(mesh.material) ? clones : clones[0]!;
    } else {
      const original = savedMaterials.get(mesh);
      if (original === undefined) return; // was never hidden
      const clones = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const clone of clones) clone.dispose();
      mesh.material = original;
      savedMaterials.delete(mesh);
    }
  });
}
