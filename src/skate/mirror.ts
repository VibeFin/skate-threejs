import * as THREE from "three";

/**
 * A sagittal mirror of a hand-authored clip — and, on this rig, the whole of
 * riding fakie.
 *
 * ## Why a reflection and not a turn
 *
 * The skater is stood ACROSS his deck: the holder yaws him by
 * `SKATER_YAW = -π/2`, call it A, so his own forward (+Z in the rig's frame)
 * points at the board's side, not at its nose. Reflecting a clip applies
 * S = diag(-1, 1, 1) in the rig's OWN frame — his left and right swapped. Push
 * that through the holder and it lands as a reflection in the BOARD's frame:
 *
 *     A · S_x̂ = S_(A x̂) · A,      A x̂ = ẑ
 *
 * — the board's ẑ being the nose. So a mirrored clip is the skater reflected
 * NOSE for TAIL, and that is exactly what a rider does when the wheels start
 * running the other way:
 *
 *   · his feet do not move. The left sole is at the nose before and after,
 *     because the reflection swaps both the ends AND the side names, and the
 *     two cancel.
 *   · he stays on the same side of the deck — the reflection holds the board's
 *     x, so the rail he faces and the rail he pushes past are unchanged.
 *   · his shoulders open the OTHER way. The rolling stance opens ~47° toward
 *     the nose because that is where he is going; reflected, it opens ~47°
 *     toward the tail, which is where he is going now.
 *   · the foot that leaves the deck to push is the other one, off the other
 *     end, stroking the other way — a push in fakie, not a push run backwards.
 *
 * The half-turn in `SkaterAnim.stanceGroup` is a different move and lives
 * beside this one: `R(ŷ, π) · S_ẑ = S_x̂` — turn AND mirror and you get the
 * sagittal reflection, a rider standing goofy with the nose still leading.
 * That composition is right for the one state that means it (turned round on
 * the deck AND the wheels running back the other way) and wrong for either on
 * its own, which is the whole reason the two are separate flags.
 *
 * ## What the transform is
 *
 * Per track: the side names swap, positions negate x, and rotations negate y
 * and z. The last one is the reflection identity S·R(n̂, θ)·S = R(S n̂, −θ)
 * written for quaternions — an axis along x̂ survives, one along ŷ or ẑ comes
 * back the other way round.
 *
 * It assumes the rest pose is symmetric about the rig's x = 0 plane, which is
 * what every generated humanoid this game loads has been. `mirrorClip` reads
 * the side names off the SKELETON rather than assuming a convention, so a rig
 * naming its sides some other way mirrors nothing instead of mirroring half.
 */

/** Turns `LeftFoot` into `RightFoot` and back; anything else is returned as-is. */
export function mirrorBoneName(name: string): string {
  if (name.startsWith("Left")) return `Right${name.slice(4)}`;
  if (name.startsWith("Right")) return `Left${name.slice(5)}`;
  return name;
}

/**
 * A facing correction, measured against the clip's own pose, taken through the
 * mirror. `HandClipRange.yaw` and `.headYaw` stand a take square on the deck by
 * turning it about the vertical — and the vertical lies IN the mirror plane, so
 * the reflection brings that turn back the other way round.
 */
export function mirrorYaw(degrees: number | undefined): number | undefined {
  return degrees === undefined ? undefined : -degrees;
}

/**
 * The reflection of ONE pose, given for each bone the index of its opposite
 * number (−1 for a bone that has none — a spine, a head).
 *
 * The same transform `mirrorClip` does per track, done to a single frame: a
 * bone takes its TWIN's rotation, negated in y and z. It is here rather than in
 * the caller because the identity S·R(n̂, θ)·S = R(S n̂, −θ) is this file's, and
 * a second copy of it somewhere else is a second place for the sign to be wrong.
 *
 * `frame[i]` is bone `i`'s local rotation; the returned array is in the same
 * order, so the sampled take and its reflection index alike.
 */
export function mirrorPose(frame: THREE.Quaternion[], twin: number[]): THREE.Quaternion[] {
  return frame.map((_own, i) => {
    const from = frame[twin[i] >= 0 ? twin[i] : i];
    return new THREE.Quaternion(from.x, -from.y, -from.z, from.w);
  });
}

/**
 * A reflected copy of `clip`, bound to the same skeleton.
 *
 * `boneNames` is the rig's own set of bone names. A track whose mirrored name
 * is not in it keeps its own name: a spine or a head has no opposite number,
 * and a rig that names its sides something else falls through here rather than
 * binding half a body.
 */
export function mirrorClip(clip: THREE.AnimationClip, boneNames: Set<string>): THREE.AnimationClip {
  const tracks = clip.tracks.map((track) => {
    const dot = track.name.indexOf(".");
    const bone = dot < 0 ? track.name : track.name.slice(0, dot);
    const property = dot < 0 ? "" : track.name.slice(dot);
    const twin = mirrorBoneName(bone);
    const name = boneNames.has(twin) ? `${twin}${property}` : track.name;

    const values = Float32Array.from(track.values);
    if (property === ".quaternion") {
      // (x, y, z, w) → (x, −y, −z, w).
      for (let i = 0; i < values.length; i += 4) {
        values[i + 1] = -values[i + 1];
        values[i + 2] = -values[i + 2];
      }
    } else if (property === ".position") {
      for (let i = 0; i < values.length; i += 3) values[i] = -values[i];
    }
    // `.scale` and anything else rides through untouched — a reflection does
    // not change how long a bone is.

    const copy = track.clone();
    copy.name = name;
    copy.values = values;
    return copy;
  });

  return new THREE.AnimationClip(`${clip.name}__fakie`, clip.duration, tracks);
}
