// anim-runtime.js — compiled-clip playback for the AG-803 scenario pages.
// Precomputes rig-corrected local quats for every clip (same precompute as
// loco.html), then layers at runtime:
//   - a LOOP layer: weighted progressive-slerp blend of looping clips, one
//     shared phase for the directional gaits (they're phase-aligned at compile
//     time) + an independent phase per free-running loop (idle/stance/push);
//   - a ONE-SHOT layer: a non-looping clip crossfaded over the loop pose with
//     a smooth envelope; its hips-Y can be capped when the physics capsule owns
//     the jump (otherwise capsule + clip would both rise).
// The page owns world transform: hips are driven with the clip's LOCAL values
// only (residual x/z + absolute y), and the character root carries position/yaw.
import * as THREE from "three";

export class ClipSet {
  /** data = compiled json; clips = data.gaits or data.clips */
  constructor(rig, data, clips) {
    this.rig = rig;
    this.base = { joints: data.joints, parents: data.parents,
                  restPositions: data.restPositions, hipsRestY: data.hipsRestY };
    this.tracks = {};
    for (const [name, c] of Object.entries(clips)) {
      const F = c.frames;
      const t = { F, fps: c.fps, dur: F / c.fps, speed: c.speed, dir: c.dir,
                  loop: c.loop !== false, quat: {}, hips: new Float32Array(F * 3),
                  contacts: c.contacts };
      for (const j of rig.mapped) t.quat[j] = new Float32Array(F * 4);
      for (let f = 0; f < F; f++) {
        rig.retargetFrame((k, out) => out.fromArray(c.localQuat[f][k]), true,
                          (j, q) => q.toArray(t.quat[j], f * 4));
        for (let k = 0; k < 3; k++) t.hips[f * 3 + k] = c.hipsPos[f][k];
      }
      this.tracks[name] = t;
    }
  }
}

// Upper-body mask (layered blend per bone): feathered weights up the spine so
// the locomotion's weight-shift still leaks into the lower torso while the aim
// pose owns the chest, arms and head. Hips + legs stay 0 — the gait owns them.
const MASK_FEATHER = { Spine: 0.3, Spine1: 0.55, Spine2: 0.8, Spine3: 1, Neck: 1, Head: 0.85 };
function maskFeather(name) {
  if (name in MASK_FEATHER) return MASK_FEATHER[name];
  return /^(Right|Left)(Shoulder|Arm|ForeArm|Hand)/.test(name) ? 1 : 0;
}

const _s0 = new THREE.Quaternion(), _s1 = new THREE.Quaternion();

function sampleQuat(t, j, ph, out) {
  const f = ph * t.F;
  let i0 = Math.floor(f), u = f - i0;
  let i1;
  if (t.loop) { i0 %= t.F; i1 = (i0 + 1) % t.F; }
  else { i0 = Math.min(i0, t.F - 1); i1 = Math.min(i0 + 1, t.F - 1); }
  _s0.fromArray(t.quat[j], i0 * 4);
  _s1.fromArray(t.quat[j], i1 * 4);
  return out.copy(_s0).slerp(_s1, u);
}

function sampleHips(t, ph, out3) {
  const f = ph * t.F;
  let i0 = Math.floor(f), u = f - i0;
  let i1;
  if (t.loop) { i0 %= t.F; i1 = (i0 + 1) % t.F; }
  else { i0 = Math.min(i0, t.F - 1); i1 = Math.min(i0 + 1, t.F - 1); }
  for (let k = 0; k < 3; k++) out3[k] = t.hips[i0 * 3 + k] * (1 - u) + t.hips[i1 * 3 + k] * u;
}

export function sampleContact(t, ph, foot) {
  const i = Math.min(Math.floor(ph * t.F), t.F - 1);
  return t.contacts[t.loop ? i % t.F : i][foot];
}

export class Animator {
  constructor(clipSet) {
    this.set = clipSet;
    this.rig = clipSet.rig;
    this.parts = [];            // rebuilt each frame: [track, phase, weight]
    this.phase = 0;             // shared phase of the directional gaits
    this.freePhase = {};        // name -> independent phase (idle/stance/…)
    this.shot = null;           // { t: track, time, fade, yCap, onDone }
    this.mask = null;           // { t: track (1-frame pose), w } — upper-body override
    this.maskFeather = clipSet.base.joints.map(maskFeather);
    this._acc = new THREE.Quaternion();
    this._qT = new THREE.Quaternion();
    this._hp = [0, 0, 0];
    this._hA = [0, 0, 0];
    this._shotQ = new THREE.Quaternion();
    this._qV = new THREE.Quaternion();
    this._shotH = [0, 0, 0];
  }

  /** weights: {clipName: w}. Directional gaits share this.phase (advanced by
   *  the weight-blended duration); every loop listed in `free` runs its own. */
  setLoops(weights, dt, free = ["idle", "stance", "push"]) {
    const tr = this.set.tracks;
    let dur = 0, wDir = 0;
    // `for...in` rather than `Object.entries`, twice: this runs every frame, and
    // each `Object.entries` allocated an array plus one two-element array per
    // key for a loop that only ever reads them. Equivalent here rather than
    // merely similar — `weights` is a plain `{}` literal built at its one call
    // site (`skate/skater-anim.ts:1900`), so it has no enumerable inherited
    // properties and `for...in` visits exactly the same keys in the same order.
    for (const n in weights) {
      const w = weights[n];
      if (w <= 1e-3 || free.includes(n)) continue;
      dur += (w * tr[n].dur);
      wDir += w;
    }
    if (wDir > 1e-4) this.phase = (this.phase + dt / (dur / wDir)) % 1;
    this.parts.length = 0;
    for (const n in weights) {
      const w = weights[n];
      if (w <= 1e-3) continue;
      let ph;
      if (free.includes(n)) {
        this.freePhase[n] = ((this.freePhase[n] ?? 0) + dt / tr[n].dur) % 1;
        ph = this.freePhase[n];
      } else ph = this.phase;
      this.parts.push([tr[n], ph, w]);
    }
  }

  playOneShot(name, { fadeIn = 0.1, fadeOut = 0.18, yCap = null, rate = 1, onDone = null } = {}) {
    const t = this.set.tracks[name];
    if (!t || this.shot) return false;
    this.shot = { t, time: 0, fadeIn, fadeOut, yCap, rate, onDone, name };
    return true;
  }

  get oneShotActive() { return this.shot !== null; }

  /** Upper-body mask layer: override joints above the hips with a pose track
   *  (typically 1 frame), feathered up the spine. weight 0..1; ≤0 clears.
   *  pitch01 ∈ [-1, 1] slerps toward the compiled `${name}Up` / `${name}Dn`
   *  aim-offset variants (aim up = positive) when they exist. */
  setMask(name, weight, pitch01 = 0) {
    const t = this.set.tracks[name];
    this.mask = t && weight > 1e-3
      ? { t, w: Math.min(weight, 1),
          up: this.set.tracks[name + "Up"], dn: this.set.tracks[name + "Dn"],
          k: Math.max(-1, Math.min(1, pitch01)) }
      : null;
  }

  /** Compute + apply the frame to the rig. Call scene.updateMatrixWorld after. */
  update(dt) {
    const rig = this.rig;
    let shotW = 0, shotPh = 0;
    if (this.shot) {
      const s = this.shot;
      s.time += dt * s.rate;
      const remain = s.t.dur - s.time;
      if (remain <= 0) {
        const done = s.onDone;
        this.shot = null;
        done?.();
      } else {
        shotW = Math.min(1, s.time / s.fadeIn, Math.max(0, remain / s.fadeOut));
        shotW = shotW * shotW * (3 - 2 * shotW); // smoothstep
        shotPh = Math.min(s.time / s.t.dur, 0.9999);
      }
    }

    if (this.parts.length === 0 && shotW === 0 && !this.mask) {
      rig.update(dt); // nothing to blend this frame — hold the last pose
      return { shotW: 0 };
    }

    for (const j of rig.mapped) {
      let accW = 0;
      for (const [t, ph, wt] of this.parts) {
        sampleQuat(t, j, ph, this._qT);
        if (accW === 0) this._acc.copy(this._qT);
        else this._acc.slerp(this._qT, wt / (accW + wt));
        accW += wt;
      }
      // one-shot over the locomotion, then the aim mask WINS on masked
      // bones: a jump drives the legs/hips/spine while the arms + chest
      // KEEP AIMING (a weapon game must not drop the aim mid-jump)
      if (shotW > 0 && this.shot) {
        sampleQuat(this.shot.t, j, shotPh, this._shotQ);
        if (accW === 0) { this._acc.copy(this._shotQ); accW = 1; }
        else this._acc.slerp(this._shotQ, shotW);
      }
      if (this.mask) {
        const mw = this.maskFeather[j] * this.mask.w;
        if (mw > 1e-3) {
          sampleQuat(this.mask.t, j, 0, this._qT);
          const variant = this.mask.k > 0 ? this.mask.up : this.mask.dn;
          if (variant && Math.abs(this.mask.k) > 1e-3) {
            sampleQuat(variant, j, 0, this._qV);
            this._qT.slerp(this._qV, Math.abs(this.mask.k));
          }
          if (accW === 0) { this._acc.copy(this._qT); accW = 1; }
          else this._acc.slerp(this._qT, mw);
        }
      }
      rig.animNode(j).quaternion.copy(this._acc);
    }

    const hA = this._hA;
    hA[0] = hA[1] = hA[2] = 0;
    let accW = 0;
    for (const [t, ph, wt] of this.parts) {
      sampleHips(t, ph, this._hp);
      for (let k = 0; k < 3; k++) hA[k] += this._hp[k] * wt;
      accW += wt;
    }
    for (let k = 0; k < 3; k++) hA[k] /= accW || 1;
    if (shotW > 0 && this.shot) {
      sampleHips(this.shot.t, shotPh, this._shotH);
      let y = this._shotH[1];
      if (this.shot.yCap !== null) y = Math.min(y, this.set.base.hipsRestY + this.shot.yCap);
      for (let k = 0; k < 3; k++) {
        const v = k === 1 ? y : this._shotH[k];
        hA[k] = hA[k] * (1 - shotW) + v * shotW;
      }
    }
    rig.setHipsFromArdy(hA[0], hA[1], hA[2]);
    rig.update(dt);
    return { shotW };
  }
}

/**
 * Directional blend weights from a character-local command (ARDY frame:
 * +z forward, +x LEFT), magnitude 0..1. Weights are split between the two
 * angularly-nearest AVAILABLE directions (pass `available` to restrict to the
 * gaits a data set actually has — e.g. the 4-cardinal sword fallback), so a
 * missing diagonal folds onto its neighbors instead of dropping the command.
 */
const DIR8 = [
  ["forward", 0], ["forwardLeft", Math.PI / 4], ["strafeLeft", Math.PI / 2],
  ["backLeft", (3 * Math.PI) / 4], ["back", Math.PI], ["backRight", -(3 * Math.PI) / 4],
  ["strafeRight", -Math.PI / 2], ["forwardRight", -Math.PI / 4],
];
export function dir8Weights(x, z, mag, available = null) {
  const w = {};
  if (mag < 1e-3) return w;
  const dirs = available ? DIR8.filter(([n]) => available.includes(n)) : DIR8;
  if (dirs.length === 0) return w;
  const a = Math.atan2(x, z);
  const ds = dirs.map(([n, da]) => {
    let d = a - da;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return [n, Math.abs(d)];
  }).sort((p, q) => p[1] - q[1]);
  const [n0, d0] = ds[0];
  if (ds.length === 1 || d0 < 1e-4) { w[n0] = mag; return w; }
  const [n1, d1] = ds[1];
  const span = d0 + d1;
  w[n0] = (d1 / span) * mag;
  w[n1] = (d0 / span) * mag;
  return w;
}

/**
 * PROPORTIONAL AIM-MASK HAND-OFF (AG-823 §7.3 #4). The mask target follows
 * the smoothed COMMAND MAGNITUDE (`mag`) instead of a binary threshold+lag:
 * the chest's spine-twist leaves exactly as the bladed idle's root yaw
 * arrives, so a stop never visibly twists right then settles back (the old
 * binary fade did, on every stop). Airborne or pitched aim keeps the mask
 * fully on (the standing idle can't carry a pitched hold).
 *
 *   maskW = aimMaskStep(maskW, { mag, grounded, pitch, dt });
 *   anim.setMask(pose, maskW, pitch / 0.6);
 */
export function aimMaskStep(maskW, { mag, grounded, pitch, dt, aiming = true, tau = 0.06 }) {
  const airOrPitch = !grounded || Math.abs(pitch) > 0.12 ? 1 : 0;
  const target = aiming ? Math.max(Math.min(mag, 1), airOrPitch) : 0;
  return maskW + (target - maskW) * (1 - Math.exp(-dt / tau));
}
