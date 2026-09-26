// Genex adaptive-quality: device-tier detection (mobile-readiness program).
// Boot-conservative by design — on phones you can recover from ugly, you
// cannot recover from a jetsam kill, and boot is exactly when iOS kills. The
// governor (governor.ts) steps quality UP after smooth seconds, so a
// too-cautious start costs moments of softness, never a crash.
//
// Detection honesty: no single signal is trustworthy. iOS masks the WebGL
// renderer string to "Apple GPU" (screen+DPR+OS-version is the real Apple
// signal); Android exposes detailed renderer strings (Adreno/Mali) worth a
// small lookup; the runtime governor measures actual frame times and corrects
// both directions. All heuristics here only pick the STARTING tier.

export type TierName = 'phone-low' | 'phone' | 'desktop-low' | 'desktop' | 'desktop-high';

export interface QualityTier {
  name: TierName;
  /** Cap for renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap)). */
  dprCap: number;
  /** WebGL context antialias (context-creation-FIXED — cannot change live). */
  antialias: boolean;
  /** Directional/spot shadow map size (0 = shadows off). */
  shadowMapSize: number;
  /** 'off' = tone mapping only; 'light' = +FXAA/vignette; 'full' = the named stack. */
  postLevel: 'off' | 'light' | 'full';
  /** Multiplier for particle counts / scatter density. */
  particleScale: number;
  /** Multiplier for draw distance / fog far. */
  drawDistanceScale: number;
  /** Frame target — phones pace to a STABLE 30 over a stuttery 45. */
  frameCap: number;
  /** Max remote players fully animated/drawn (multiplayer); rest billboard. */
  remoteAvatarCap: number;
  /** MSAA samples for the EffectComposer's render target. Context `antialias`
   *  is ~wasted under a composer (it MSAAs a buffer the composer never reads)
   *  — AA under post comes from `new EffectComposer(renderer, new
   *  THREE.WebGLRenderTarget(w, h, { samples: tier.composerSamples }))`.
   *  See rendererAntialias() for the context flag itself. */
  composerSamples: number;
}

export const TIERS: Record<TierName, QualityTier> = {
  'phone-low': {
    name: 'phone-low',
    dprCap: 1,
    antialias: false,
    shadowMapSize: 512,
    postLevel: 'off',
    particleScale: 0.25,
    drawDistanceScale: 0.5,
    frameCap: 30,
    remoteAvatarCap: 4,
    composerSamples: 0,
  },
  phone: {
    name: 'phone',
    dprCap: 1.5,
    antialias: false,
    shadowMapSize: 1024,
    postLevel: 'light',
    particleScale: 0.5,
    drawDistanceScale: 0.75,
    frameCap: 60,
    remoteAvatarCap: 8,
    composerSamples: 0,
  },
  // Weak desktops (Intel iGPU MacBooks, old integrated AMD): the full desktop
  // path — DPR 2 + 4x MSAA + 2048 PCFSoft shadows + full bloom — is a
  // slideshow there, and the governor can't rescue context-locked MSAA. The
  // Quality picker still overrides (a player can force High).
  'desktop-low': {
    name: 'desktop-low',
    dprCap: 1.5,
    antialias: false,
    shadowMapSize: 1024,
    postLevel: 'light',
    particleScale: 0.75,
    drawDistanceScale: 1,
    frameCap: 60,
    remoteAvatarCap: 64,
    composerSamples: 0,
  },
  desktop: {
    name: 'desktop',
    dprCap: 2,
    antialias: true,
    shadowMapSize: 2048,
    postLevel: 'full',
    particleScale: 1,
    drawDistanceScale: 1,
    frameCap: 60,
    remoteAvatarCap: 64,
    composerSamples: 4,
  },
  'desktop-high': {
    name: 'desktop-high',
    dprCap: 2,
    antialias: true,
    shadowMapSize: 2048,
    postLevel: 'full',
    particleScale: 1,
    drawDistanceScale: 1,
    frameCap: 240,
    remoteAvatarCap: 64,
    composerSamples: 4,
  },
};

/**
 * Is this a PHONE tier — the only class of device the mobile-memory lane is
 * allowed to change?
 *
 * One predicate, in one place, because the alternative is what the tree had:
 * `tier.name === "phone" || tier.name === "phone-low"` repeated by hand in
 * `props.ts`, `field.ts`, `map2/mesh.ts`, `clouds.ts`, `menu-stage.ts`,
 * `main.ts` and this module's own `pick-asset.ts`. Every one of those is a
 * separate chance to write `!==` or to miss `phone-low`, and a gate that fails
 * open on this question does not make a phone slower, it changes a DESKTOP
 * picture that is under a freeze.
 *
 * It deliberately tests the tier NAME rather than a capability field. A tier's
 * numbers move; which side of the desktop/phone line it is on does not, and the
 * three desktop rows must be unreachable from here by construction — not by a
 * threshold that a later edit to `postLevel` or `dprCap` could slide across.
 */
export function isPhoneTier(tier: QualityTier): boolean {
  return tier.name === 'phone' || tier.name === 'phone-low';
}

/**
 * The context `antialias` flag a game should ACTUALLY construct with. Context
 * MSAA only benefits games that render straight to the canvas — under an
 * EffectComposer it multisamples a buffer the composer never reads (pure
 * memory/fill waste, the classic weak-MacBook lag recipe). Post games get
 * their AA from `tier.composerSamples` on the composer's render target
 * instead; a post-waived desktop game keeps real MSAA.
 */
export function rendererAntialias(tier: QualityTier, willRunPost: boolean): boolean {
  return tier.antialias && !willRunPost;
}

/** Quality setting persisted PER DEVICE (localStorage) — quality is a property
 *  of the phone, not the player, so it deliberately does not ride account
 *  state. 'auto' = heuristics + governor. */
const SETTING_KEY = 'genex:quality';
export type QualitySetting = 'auto' | 'low' | 'medium' | 'high';

export function getQualitySetting(): QualitySetting {
  try {
    const v = localStorage.getItem(SETTING_KEY);
    if (v === 'low' || v === 'medium' || v === 'high') return v;
  } catch {
    /* storage blocked */
  }
  return 'auto';
}

export function setQualitySetting(v: QualitySetting): void {
  try {
    localStorage.setItem(SETTING_KEY, v);
  } catch {
    /* storage blocked */
  }
}

function isTouchDevice(): boolean {
  try {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const touch = navigator.maxTouchPoints > 1;
    const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
    const mobileUA = nav.userAgentData
      ? !!nav.userAgentData.mobile
      : /Mobi|Android/i.test(navigator.userAgent);
    return (touch && coarse) || mobileUA;
  } catch {
    return false;
  }
}

/** Weak DESKTOP GPUs (unmasked on desktop, unlike iOS): Intel HD/UHD/pre-Xe
 *  Iris iGPUs and old integrated AMD — the machines the full desktop path
 *  (DPR 2 + MSAA + 2048 shadows + full bloom) turns into a slideshow.
 *  Trademark tokens vary by driver era — "Iris(R) Xe" / "Iris Xe" and
 *  "Radeon(TM)" / "Radeon (TM)" all occur in real renderer strings — so the
 *  Xe exclusion and the AMD prefix both tolerate them. */
const WEAK_DESKTOP_GPU = /Intel(\(R\))? (HD|UHD|Iris(?! ?(\((R|TM)\) ?)?Xe))|GMA |Radeon ?(\(TM\))? (R[2-5]|Vega [23]) Graphics|SwiftShader|llvmpipe|Software/i;

/** One boot-time probe context, freed immediately — never at play time. */
function probeGpuRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return '';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext(); // free the probe context immediately
    return renderer;
  } catch {
    return '';
  }
}


/**
 * Pick the STARTING tier. Manual setting wins; 'auto' uses heuristics:
 * - non-touch → desktop
 * - touch: old OS or small memory signals → phone-low; strong/new → phone
 * The kit may have clamped devicePixelRatio — prefer its pristine stash.
 */
export function detectTier(): QualityTier {
  const setting = getQualitySetting();
  if (setting === 'low') return TIERS['phone-low'];
  if (setting === 'medium') return TIERS.phone;
  if (setting === 'high') {
    // HIGH IS A LOOK, NOT A MEMORY OVERRIDE. This branch used to hand a PHONE
    // the whole desktop row, and that is not one setting being generous — it is
    // every phone-class veto in the codebase disengaging at once, because they
    // are all written against the tier rather than against the device:
    // `samplesFor` stops capping MSAA on the half-float target, `aoFor` builds
    // a full-resolution GTAO pass (a second draw of the scene plus a depth and
    // a normal buffer), `shadowMapSizeFor` jumps to 3072, DPR uncaps to 2, and
    // `isPhoneTier` goes FALSE — so `field.ts` stops asking for the low sky
    // rung and `capForPhone` returns early, and the phone fetches the whole
    // 8192x4096 panorama. That combination is not "sharper", it is the boot
    // allocation iOS kills the page for.
    //
    // A phone that asks for High still GETS the look it asked for: the picker's
    // preset is read separately in `look.ts` (`startingPreset`), so the showcase
    // grade, bloom, lens dirt and shutter all come with it — through the phone
    // tier's own vetoes, which is where the per-pixel and per-megabyte costs get
    // trimmed and nothing else does. What it does not get is the desktop's
    // memory budget.
    //
    // A real desktop with the setting on High returns `TIERS.desktop` exactly,
    // byte for byte as before.
    return isTouchDevice() ? TIERS.phone : TIERS.desktop;
  }

  if (!isTouchDevice()) {
    // Weak-desktop demotion: a 2015 Intel Air and an M3 Max are not the same
    // machine. Desktop renderer strings are unmasked (unlike iOS), so one
    // boot probe separates them; the Quality picker still overrides either way.
    return WEAK_DESKTOP_GPU.test(probeGpuRenderer()) ? TIERS['desktop-low'] : TIERS.desktop;
  }

  // ── AUTO ON A TOUCH DEVICE BOOTS AT phone-low, WHATEVER THE DEVICE LOOKS LIKE ──
  //
  // The player's instruction, after reporting lag on his own phone: *"i think on
  // mobile it should go Low quality by default"*. It is also the skill's own
  // doctrine — "phone tiers START one notch below what the heuristics suggest…
  // the cost of guessing low is moments of softness; the cost of guessing high is
  // a dead page" — and the heuristics below are exactly the guess that doctrine
  // distrusts: an iOS major version and an Android GPU regex, neither of which has
  // ever seen this game's frame.
  //
  // TWO CONSEQUENCES, both deliberate, both worth knowing before this is changed
  // back:
  //
  // · **The governor cannot undo it.** Its ladder moves knobs WITHIN a tier
  //   (DPR, post, shadows, distance, frame cap) and never promotes `phone-low` to
  //   `phone`. So this is not "boot low and recover" — it is the ceiling for every
  //   phone on Auto until the player raises it in the picker himself.
  // · **`phone-low` carries `frameCap: 30`**, and that number became live only
  //   today (it was dead code until `setFrameCap` was wired). So every phone on
  //   Auto now paces at a steady 30. That IS this tier's stated intent — a stable
  //   30 reads smoother than a lurching 45, and halves heat and battery — but it
  //   is the single most visible thing in this change, and if the player wants
  //   60 fps back at low detail, the one-line answer is `frameCap: 60` on the
  //   `phone-low` row, NOT reverting this branch.
  //
  // The iOS-major-version and Android-GPU-string heuristics that used to stand
  // here are DELETED, along with `androidGpuLooksStrong` and the
  // `STRONG_ANDROID_GPU` regex they read — an unreachable branch is a lie about
  // what the code does, and a regex nothing calls is a lie about what the code
  // knows. Neither had ever seen this game's frame; that is the whole reason they
  // were not trusted with the decision.
  //
  // The right way to re-earn the `phone` tier is a promote-on-smooth rung in the
  // governor, reading MEASURED FRAMES. That is the one change that makes this
  // branch adaptive again, and it belongs in `governor.ts`, not here.
  return TIERS['phone-low'];
}
