// THE GUY WITH THE CLOCK — the NPC who starts a one-minute run.
//
// He has his OWN generated body, not the player's, because the player asked for
// it in as many words: "you didn't generate a character for the NPC who gives
// the mission. We need to generate those characters too." Before that he wore
// the player's rig, which read as the player standing in the plaza talking to
// himself. WHICH body is his changed once since: the two rigs swapped hands
// later the same day and he is now The Local (`cms0fbiar004o22nuyjqjhzuz`) —
// see `CHARACTER_MANIFEST` for why the filenames did not swap with them.
//
// Same loader, same skeleton family, same neutral-v3 controller pack — the only
// thing that changed is which manifest he reads, so his clips are still the ones
// installed on his exact rig and nothing is retargeted.
//
// He exists in BOTH maps and this file knows about neither. `mountRunNpc` takes
// a scene and a `SurfaceProvider`, plants him near that map's own spawn point,
// and hands back a handle — so a map lane never has to import a person and the
// boot never has to hard-code a coordinate that only exists on one block.
//
// What turns above his head is procedural on purpose — and as of 2026-07-29 it
// is a CASSETTE, built from primitives, at the player's word: *"there's some
// kind of strange thing spinning above the character right now… making a
// cassette would be cool. Let's do a sculpted cassette."* It was a torus and an
// octahedron, which read as an abstract quest pip out of a different game. A
// cassette says skate video without a word of type on it. See `buildMarker` for
// what it is made of. It keeps everything it already did: it turns, it bobs,
// and it goes dark while a run is on, because rolling up to him then does
// nothing and a marker that still says "come here" is a lie.
//
// TALKING TO HIM IS A BUTTON PRESS, and that is new. Rolling into his radius
// used to START THE RUN — the clock was already ticking by the time the player
// worked out what had happened. Now the radius puts a prompt on screen, T opens
// a quest card (`src/ui/dialogue.ts`), and the card is where the minute is
// agreed to. The run callback is unchanged and fires from START RUN.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { loadMeshyCharacter, type MeshyCharacter } from "../controllers/character/meshy/meshy-loader";
import { capRigTextures } from "../controllers/quality/texture-cap";
import { NpcDialogue, type QuestOffer } from "../ui/dialogue";
import type { SurfaceProvider } from "./surface";

/**
 * HIS rig and his clips. The two manifests SWAPPED HANDS on 2026-07-29, at the
 * player's word: *"make the local — act like NPC only, dont able to pick him as
 * playing character for now."* The Local (`meshy-character.json`) was the body
 * you rode and is now the man in the plaza; The Timekeeper (`meshy-npc.json`)
 * was the man in the plaza and is now the body you ride. So this constant reads
 * the file whose name says "character" and that is not a mistake — the names
 * record who each rig was FIRST, and renaming two files to chase a casting
 * change would break every URL already recorded in DESIGN.md.
 *
 * They must never be the same file: the picker and this line pointing at one
 * manifest puts the identical man on the board and on the kerb, which is what
 * this comment exists to stop happening again.
 *
 * Both manifests were written by `genex controller character`, so both carry
 * their own skeleton signature and the loader will refuse a clip that belongs
 * to the other one rather than fold a stranger's bones into this body.
 */
const CHARACTER_MANIFEST = "./assets/meshy-character.json";

/**
 * The line he says when you roll up: *"Yo. One minute on the clock. Stack it up
 * as high as you can — go."* Generated with `genex voice --gruff`.
 *
 * The suffix is `audio-voice`, not `audio-mp3`. Every generation on this CDN is
 * addressed by its KIND, and a voice line is its own kind — `audio-mp3` 404s
 * and the NPC mouthed his line in silence. Probed against the game's own sfx
 * URLs (`audio-sfx`, all 206) before changing it.
 */
export const NPC_VOICE_URL =
  "https://assets.auras.cc/generations/cms535ayw006z22ozuttz934n/audio-voice";

/**
 * The TALKING clip — *"gesture with one hand at chest height as if explaining
 * something, shifting weight from one foot to the other, head nodding"*,
 * generated with `genex character animate` on THIS character id, so it is a
 * take on this exact skeleton and nothing is retargeted.
 *
 * It is a bare URL rather than an entry in `meshy-character.json` on purpose:
 * that manifest is the PLAYER's clip list, and the character loader downloads
 * every clip in it. Putting a gesture nobody but this NPC plays into the
 * manifest would put a 60 kB fetch on the boot path of every session, including
 * the ones where the player never rides over here. The manifest route still
 * works — see `TALK_NAMES` — if a later revision decides it belongs there.
 *
 * Verified against the rig before wiring: all 23 tracks (Hips, Spine 0-2, both
 * arm chains, neck, Head, both legs) name bones this skeleton actually has, and
 * the hip height it keys sits in the same centimetre space as `Idle_3`, so the
 * crossfade between them is a knee bend and not a scale jump.
 */
export const NPC_TALK_CLIP_URL: string | null =
  "https://assets.auras.cc/generations/cms537kys008822ozrleetqn1/character-motion-uthana-mxWyP6etmAQ5-glb";

/**
 * HIS NEW IDLE — the stance he holds the rest of the time, re-generated on
 * 2026-07-29 because the player asked for it in as many words: *"plz regenerate
 * the idle animation for them."* Generated on THIS character id
 * (`cms0fbiar004o22nuyjqjhzuz`, The Local, the man in the plaza), so it is a
 * take on his own skeleton and nothing is retargeted.
 *
 * It is a bare URL for a reason that is NOT the talk clip's reason, and the
 * difference is worth writing down. The talk clip is out of the manifest to
 * keep a gesture nobody else plays off every session's boot path. This one
 * could not go in the manifest at all: `idle.default` is one of six controller
 * pack slots the platform PINS, and generation is refused on them. So the new
 * idle cannot replace `Idle_3` in the pack — it is loaded ALONGSIDE it and
 * played INSTEAD of it, which is the whole of the wiring below.
 *
 * Verified against the rig before wiring, rather than assumed from the two
 * skeletons being siblings: all 24 channels over 23 nodes (Hips, Spine, both
 * arm chains, neck, Head, both legs) name bones this skeleton actually has, and
 * the take keys hips at 82.0 cm against `Idle_3`'s 87.7 — the same centimetre
 * space, so the crossfade between them is a knee bend and not a scale jump. It
 * keys X and Z at a flat zero for all 120 frames, so it cannot walk him off his
 * mark. What it does NOT do is close on itself — see `IDLE_LOOP`.
 */
export const NPC_IDLE_CLIP_URL: string | null =
  "https://assets.auras.cc/generations/cms66ljya004z22obdxh4ksfa/character-motion-uthana-mF82zqYE7Bxu-glb";

/** Clip names / locomotion slots a talking take could arrive under. */
const TALK_NAMES = ["talk.default", "Talking", "Talk", "talking", "talk"];

/**
 * The idle he holds the rest of the time — `Idle_3`, via the manifest slot, and
 * now only until `NPC_IDLE_CLIP_URL` lands on top of it. It stays the fallback:
 * a take that does not bind to this skeleton leaves him standing in the clip
 * that has always worked, never in a T-pose.
 */
const IDLE_SLOT = "idle.default";

/**
 * How the fresh idle is looped, and why it is not a plain repeat.
 *
 * `Idle_3` is an authored loop — its last keyframe matches its first to 0.0° on
 * every one of its 24 rotation tracks, so it repeats invisibly. The generated
 * take does not: measured end-to-start, his right thigh finishes **18.6°** away
 * from where it began, his left 16.8°, and 15 of 23 tracks are over 3°. Played
 * on repeat that is both legs snapping every 3.97 s, in front of a player who
 * asked to be shown this exact animation.
 *
 * Ping-pong is exact at both ends by construction — forward, then the same
 * frames backward — so it invents nothing, which a blend across the seam would.
 * The turnaround is cheap because the take is nearly still where it turns: peak
 * joint speed is 47°/s at the head of the clip and 15°/s at the tail, a slow
 * drift reversing rather than a gesture rewinding. He reads as 7.9 s of weight
 * shift instead of 4 s.
 *
 * The real fix is a take generated to close on itself; this is the one line
 * that would change if one ever lands.
 */
const IDLE_LOOP = THREE.LoopPingPong;

/**
 * How close the board has to be for the talk prompt to stand up, metres.
 *
 * Slightly wider than the 4.2 m the drive-by trigger used, and for a reason the
 * old number did not have to answer: a circle that FIRED on contact only had to
 * be touched, while a circle that asks you to read a line and press a key has
 * to be stood in for long enough to do both. 5.2 m is about two thirds of a
 * second at street speed and as long as you like at a roll.
 *
 * The swept-segment test that used to live here is gone with the drive-by. It
 * existed because a fast pass could slip between two frames and read as a man
 * ignoring you — which cannot happen to a key press, since the press is what
 * asks the question and the answer is read on that frame.
 */
const TALK_RADIUS = 5.2;
/** Height difference past which he is on another storey and cannot be reached. */
const TRIGGER_RISE = 3;

/**
 * WHAT HE SAYS, in the three things the player asked the card to carry: who he
 * is, one line of what he wants, and the offer.
 *
 * The line is the voice take's own words (`NPC_VOICE_URL`) shortened to one
 * sentence, so the card and the mp3 are the same man saying the same thing
 * rather than two scripts talking over each other.
 */
export const TIMEKEEPER_OFFER: QuestOffer = {
  who: "The Timekeeper",
  line: "One minute on the clock. Stack the biggest line you can.",
  accept: "Start run",
  decline: "Not now",
};

/**
 * How long he keeps talking when there is no clip to time it by — the measured
 * length of the voice line, 4.2 s. With the clip bound the gesture's own
 * duration wins (see `talkSeconds`), which is within a quarter-second of it.
 */
const TALK_SECONDS = 4.2;
/** Crossfade between his idle and his talk, seconds. */
const CLIP_FADE = 0.25;
/**
 * Crossfade from the manifest idle to the fresh one when it arrives, seconds.
 *
 * Twice the talk fade on purpose. That one is a cue — he starts speaking as the
 * card opens and the hands have to be up by the time the voice is — so it is as
 * short as it can be without popping. This one is the opposite: nothing asked
 * for it, the player is not looking at it, and both ends of it are the same man
 * standing still. Half a second of two standing poses overlapping is a shift of
 * weight, and there is nothing to be on time for.
 */
const IDLE_SWAP_FADE = 0.5;

/** Where the marker floats, metres above his feet. */
const MARKER_HEIGHT = 2.24;
/**
 * The cassette's shell while he IS offering a run.
 *
 * It used to be the HUD's gold (`0xffd23d`) so the thing over his head and the
 * score read as one colour. The player asked for the opposite on 2026-07-29:
 * *"можешь кассету над челом сделать менее желтой, какой-то олдскульно серой."*
 * A gold cassette is a quest pip wearing a cassette's shape; a real one is
 * moulded plastic. `0xb9b4a8` is warm grey — the colour a beige TDK shell goes
 * after twenty years in a glovebox — which reads as an OBJECT at a distance
 * while still lifting clear of the plaza's own grey concrete.
 *
 * It stays legible as "come here" because availability was never carried by hue
 * alone: `setAvailable` also drives `emissiveIntensity` 1.1 → 0.12, a factor of
 * nine, and that is what the eye actually catches across the block.
 */
const MARKER_COLOR = 0xb9b4a8;

export interface RunNpcOptions {
  /**
   * The player took the quest — START RUN on the card.
   *
   * The name and the shape are unchanged from when a drive-by fired it, so
   * nothing that wires this NPC had to be touched; what moved is only what asks
   * the question. The return value used to decide whether he spoke at all
   * (silence when a run was already on) and no longer has to: the prompt is
   * down whenever he is unavailable, so the card cannot be open to be answered.
   */
  onApproach?: () => boolean;
  /**
   * Play his voice line. The game's audio layer owns every other sound in this
   * game and should own this one too — pass `(url) => audio.voice(url)` and the
   * fallback below is never built. Without it he speaks through an element of
   * his own, which is worse (it ignores the mute and the pause duck) and still
   * better than an NPC who moves his mouth in silence.
   */
  speak?: (url: string) => void;
  /** The boot's decoder-wired loader, so his GLBs take the same rungs the rest
   *  of the game's models do. */
  loader?: GLTFLoader;
}

/**
 * The loaded character, shared by every NPC that ever mounts.
 *
 * It is a promise rather than a value because two maps mounting in one session
 * must not fetch a 10k-face rig and seven clip GLBs twice. Each NPC gets a
 * skeleton-aware CLONE of it, which shares the geometry and the materials — so
 * disposing an NPC frees nothing the next one needs.
 */
let characterJob: Promise<MeshyCharacter | null> | null = null;

function loadCharacter(loader?: GLTFLoader): Promise<MeshyCharacter | null> {
  characterJob ??= loadMeshyCharacter(CHARACTER_MANIFEST, { loader })
    // HIS BODY IS THE SAME 4096x4096 UNCOMPRESSED MAP THE PLAYER'S IS, and
    // until this line nothing capped it: `motion/rigs.js` caps the rig the
    // ride loads, but he does not come through `loadRig` — he comes through
    // `loadMeshyCharacter`, which is vendored `controllers/character/` code
    // that installs without the quality kit and cannot import it. Measured on
    // phone-low at 390x844 DPR 3: 85.33 MB of one texture, 51.5% of everything
    // the phone held, for a man standing on a pavement. Capped HERE and not in
    // `attach` because this promise is the one place his GLB is parsed —
    // every NPC that ever mounts gets a skeleton-aware clone of this scene and
    // shares its materials, so one cap covers all of them — and because it runs
    // before the body is added to any scene, i.e. before the big image has been
    // uploaded rather than after it has already been paid for.
    .then((character) => {
      capRigTextures(character.scene, CHARACTER_MANIFEST);
      return character;
    })
    .catch((e) => {
      console.warn("[npc] character failed to load", e);
      return null;
    });
  return characterJob;
}

export class RunNpc {
  /** Everything this NPC put in the scene, so leaving the map takes all of it. */
  readonly group: THREE.Group;

  private scene: THREE.Scene;
  private opts: RunNpcOptions;
  private marker: THREE.Group;
  /** Gold when he is offering a run, dull when he is not — see `buildMarker`. */
  private paintMarker: (available: boolean) => void;
  /** Frees the cassette's own geometry and its three materials. */
  private dropMarker: () => void;
  /** The prompt and the quest card. He owns them; they draw nothing until he
   *  is standing there and the player is beside him. */
  private dialogue: NpcDialogue;
  private mixer: THREE.AnimationMixer | null = null;
  private idle: THREE.AnimationAction | null = null;
  private talk: THREE.AnimationAction | null = null;
  /** How long one pass of the gesture runs, once a clip is actually bound. */
  private talkSeconds = TALK_SECONDS;
  /** Seconds left of the line he is saying, 0 when he is just standing there. */
  private talking = 0;
  private available = true;
  private age = 0;
  private dead = false;
  /** Has his body been asked for yet? See `update` for why it is not the ctor. */
  private bodyAsked = false;
  /** His own audio element, built only if nothing was passed to speak with. */
  private voice: HTMLAudioElement | null = null;

  constructor(scene: THREE.Scene, surface: SurfaceProvider, opts: RunNpcOptions = {}) {
    this.scene = scene;
    this.opts = opts;

    this.group = new THREE.Group();
    this.group.name = "run-npc";
    // Nothing to look at until the body arrives — a marker hovering over an
    // empty patch of concrete for two seconds reads as a bug, not as a person
    // still loading.
    this.group.visible = false;

    const marker = buildMarker();
    this.marker = marker.markerGroup;
    this.paintMarker = marker.setAvailable;
    this.dropMarker = marker.dispose;
    this.group.add(this.marker);

    // The conversation. `onOpen` is where he starts SPEAKING — the card and the
    // voice line are the same beat, and the take is 4 s of him explaining the
    // minute, which is exactly what is printed on screen while he says it.
    this.dialogue = new NpcDialogue({
      offer: TIMEKEEPER_OFFER,
      onOpen: () => this.startTalking(),
      onAccept: () => {
        // The SAME callback the drive-by trigger used to fire. Nothing about
        // the run moved; only what asks for it did.
        this.opts.onApproach?.();
      },
    });

    place(this.group, surface);
    scene.add(this.group);
  }

  /**
   * Is he offering a run right now? The marker answers it — gold when rolling
   * up to him does something, dark when it does not.
   */
  setAvailable(on: boolean): void {
    if (on === this.available) return;
    this.available = on;
    this.paintMarker(on);
    // A card offering a minute that has already started is a lie the player
    // would act on. It cannot normally happen — the prompt is down whenever he
    // is unavailable — but a run begun any other way (GO AGAIN, ENTER) lands
    // here, and this is the one line that answers it.
    if (!on) this.dialogue.closeCard();
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    if (this.dead) return;

    // His body is asked for on the first frame the game actually PLAYS, not in
    // the constructor. He is a 10k-face rig plus seven clip GLBs off the same
    // CDN host the loader is already pulling the skater, the board and the
    // spot's textures from — starting him at mount put nine more requests into
    // the queue the "LACING UP…" bar is waiting on, and the player watched a
    // progress bar for a person standing behind the title screen. Nothing here
    // is on the critical path: he streams in over the first seconds of the ride
    // with the marker hidden until he lands, which is the state below.
    if (!this.bodyAsked) {
      this.bodyAsked = true;
      void loadCharacter(this.opts.loader).then((character) => {
        if (this.dead || !character) return;
        this.attach(character);
      });
    }

    this.age += dt;
    this.mixer?.update(dt);

    // The marker turns whether or not anyone is watching — it is the thing that
    // says "over here" from the far end of the block.
    this.marker.rotation.y += dt * 1.6;
    this.marker.position.y = MARKER_HEIGHT + Math.sin(this.age * 2.2) * 0.06;

    if (this.talking > 0) {
      this.talking -= dt;
      if (this.talking <= 0) this.stopTalking();
    }

    // Nobody is standing there yet, so there is nobody to roll up to. Without
    // this a player who happens to cross the spot in the first seconds of a
    // session is invited to talk to an empty patch of concrete.
    if (!this.group.visible) {
      this.dialogue.setPromptVisible(false);
      return;
    }

    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    const flat = Math.hypot(dx, dz);
    const rise = Math.abs(playerPos.y - this.group.position.y);

    // THE WHOLE TRIGGER, now: a line on screen. Nothing here starts anything.
    // There is no arming, no edge and no re-arm gap, because none of those were
    // about proximity — they were about a circle that fired on contact, and a
    // key press cannot go off by accident. Standing next to him at the end of a
    // run now shows a prompt, which is a fair thing for it to do.
    //
    // It is a STATE and it is re-read every frame: he stops offering the moment
    // a run is on (`available`), and the prompt goes with him.
    this.dialogue.setPromptVisible(
      this.available && flat <= TALK_RADIUS && rise <= TRIGGER_RISE,
    );
  }

  dispose(): void {
    this.dead = true;
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.scene.remove(this.group);
    // The body is a CLONE — its geometry and materials belong to the shared
    // character and the next map's NPC is about to use them. Only what this
    // file built for itself is freed.
    this.dropMarker();
    this.dialogue.dispose();
    this.voice?.pause();
    this.voice = null;
  }

  /** Give the marker a body: the shared rig, cloned, with its clips bound. */
  private attach(character: MeshyCharacter): void {
    const body = cloneSkinned(character.scene);
    body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    // Meshy rigs rest facing +Z, so this is the explicit yaw AGENTS.md asks for
    // rather than whatever the loader happened to leave: he is turned to look
    // back at the spawn, which is where the player arrives from.
    body.rotation.y = this.group.userData.faceYaw as number;
    this.group.add(body);
    this.group.visible = true;

    this.mixer = new THREE.AnimationMixer(body);
    const slots = character.locomotionProfile.slots;
    const byName = (name: string): THREE.AnimationClip | undefined =>
      character.clips.find((c) => c.name === name);

    const idleClip = byName(slots[IDLE_SLOT] ?? "") ?? character.clips[0];
    if (idleClip) {
      this.idle = this.mixer.clipAction(idleClip);
      this.idle.play();
    }

    // The talking take, wherever it turned up: a manifest slot, a clip key, or
    // the URL constant at the top of this file. The manifest is checked first
    // so a later revision that folds the gesture in there wins without anyone
    // having to delete the URL.
    for (const name of TALK_NAMES) {
      const clip = byName(slots[name] ?? "") ?? byName(name);
      if (!clip) continue;
      this.bindTalk(clip);
      break;
    }
    if (!this.talk && NPC_TALK_CLIP_URL) void this.loadTalkClip(NPC_TALK_CLIP_URL, body);
    // …and the new idle, which cannot come through the pack (see the constant).
    // He is already standing in `Idle_3` by the line above, so this arrives on
    // top of a man who is already there rather than being waited for — a slow
    // fetch costs a crossfade, not an empty patch of concrete.
    if (NPC_IDLE_CLIP_URL) void this.loadIdleClip(NPC_IDLE_CLIP_URL, body);
  }

  /**
   * A clip supplied as a bare GLB — the talk take, the new idle, anything the
   * pinned pack could not carry. Bound the same way the skater's hand-authored
   * clips are: every track has to find a bone of that name on this rig, or the
   * pose comes out half-applied and he twitches — better to keep what he is
   * already playing. The name test is `PropertyBinding.parseTrackName`, the
   * same one the character loader screens its own clips with, rather than a
   * split on the first dot — bone names with dots in them exist and that test
   * called them foreign.
   *
   * `what` is only for the warning line, and the warning line matters: a clip
   * that silently does not bind is a man who mysteriously stopped moving.
   */
  private async fetchClip(
    url: string,
    body: THREE.Object3D,
    what: string,
  ): Promise<THREE.AnimationClip | null> {
    try {
      const loader = this.opts.loader ?? new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      const clip = gltf.animations[0];
      if (!clip || this.dead || !this.mixer) return null;
      const fits = clip.tracks.every((track) => {
        const parsed = THREE.PropertyBinding.parseTrackName(track.name);
        return parsed.nodeName !== undefined && body.getObjectByName(parsed.nodeName) !== undefined;
      });
      if (!fits) {
        console.warn(`[npc] ${what} does not fit this rig — keeping the clip he is already in`);
        return null;
      }
      return clip;
    } catch (e) {
      console.warn(`[npc] ${what} failed to load`, e);
      return null;
    }
  }

  /** The talking take, once it has proved it belongs to this skeleton. */
  private async loadTalkClip(url: string, body: THREE.Object3D): Promise<void> {
    const clip = await this.fetchClip(url, body, "talk clip");
    if (!clip) return;
    this.bindTalk(clip);
    // He can already be mid-line: the body streams in over the first seconds
    // of the ride and the clip lands behind it, so a player who rolls
    // straight at him can beat it here. Pick the gesture up where the line
    // has got to rather than making him finish the sentence standing still.
    if (this.talking > 0) this.playTalk();
  }

  /** The re-generated idle, same test, same fallback. */
  private async loadIdleClip(url: string, body: THREE.Object3D): Promise<void> {
    const clip = await this.fetchClip(url, body, "the new idle");
    if (!clip) return;
    this.bindIdle(clip);
  }

  /**
   * Stand him in a different idle, without a pop and without the rest of this
   * class having to know it happened.
   *
   * `this.idle` is the CURRENT idle and nothing outside here reads which clip
   * that is — `stopTalking` fades back to whatever it points at, so a swap that
   * lands mid-sentence is already accounted for by the time the line ends. That
   * is the one case that must not crossfade: the talk take owns the body right
   * now, and fading a second standing pose in underneath it would be two clips
   * arguing over the same bones for half a second.
   */
  private bindIdle(clip: THREE.AnimationClip): void {
    if (!this.mixer) return;
    const next = this.mixer.clipAction(clip);
    next.setLoop(IDLE_LOOP, Infinity);
    const prev = this.idle;
    this.idle = next;
    if (this.talking > 0) {
      // Mid-line. The outgoing idle is already at zero weight under the
      // gesture; stopping it now takes it off the mixer's active list, and
      // `stopTalking` will bring the new one in on the fade it always used.
      prev?.stop();
      return;
    }
    next.reset().play();
    // The outgoing action is left to fade rather than stopped: cutting it here
    // is the pop this crossfade exists to avoid. Once it reaches zero weight
    // three stops evaluating it, so it costs nothing to leave lying there.
    if (prev) next.crossFadeFrom(prev, IDLE_SWAP_FADE, false);
  }

  /**
   * Make an action of the gesture — ONCE through, holding its last frame.
   *
   * Not a loop: this is a text-to-motion take, and its first and last frames do
   * not meet, so a second pass would start with a visible snap. It runs 3.97 s
   * against a 4.2 s line, which is close enough that his hands are still coming
   * down as the last word lands.
   */
  private bindTalk(clip: THREE.AnimationClip): void {
    if (!this.mixer) return;
    this.talk = this.mixer.clipAction(clip);
    this.talk.setLoop(THREE.LoopOnce, 1);
    this.talk.clampWhenFinished = true;
    if (clip.duration > 0) this.talkSeconds = clip.duration;
  }

  private startTalking(): void {
    this.talking = this.talk ? this.talkSeconds : TALK_SECONDS;
    this.playTalk();
    this.say();
  }

  private playTalk(): void {
    if (!this.talk || !this.idle) return;
    this.talk.reset().play();
    this.talk.crossFadeFrom(this.idle, CLIP_FADE, false);
  }

  private stopTalking(): void {
    this.talking = 0;
    if (this.talk && this.idle) {
      this.idle.reset().play();
      this.idle.crossFadeFrom(this.talk, CLIP_FADE, false);
    }
  }

  private say(): void {
    if (this.opts.speak) {
      this.opts.speak(NPC_VOICE_URL);
      return;
    }
    // The fallback voice. It is built on first use rather than at construction
    // so a game that DOES route his line through the audio layer never creates
    // a second decoder for a file it will not play.
    this.voice ??= new Audio(NPC_VOICE_URL);
    this.voice.currentTime = 0;
    void this.voice.play().catch(() => {});
  }
}

/**
 * Put him somewhere a player will actually find him: near the spot's own spawn,
 * off to one side of the line the player rolls away on.
 *
 * The candidates are tried in order and the first one that is standing on
 * reachable ground wins — `blocked` keeps him out of walls and the height test
 * keeps him off the top of a ledge or down a stair set, since a body floating
 * on a kerb edge is the same bug either way. Every map answers the same
 * contract, so this needs to know nothing about which one it is planting him in.
 */
function place(group: THREE.Group, surface: SurfaceProvider): void {
  const spawn = surface.spawn();
  // The ride's convention: forward is (sin h, cos h), so the player's right
  // hand is (cos h, −sin h).
  const fx = Math.sin(spawn.heading);
  const fz = Math.cos(spawn.heading);
  const rx = Math.cos(spawn.heading);
  const rz = -Math.sin(spawn.heading);
  const base = surface.height(spawn.x, spawn.z);

  /** Ahead-and-to-one-side, in metres. Far enough that dropping in does not
   *  trip a run before the player has taken a push. */
  const offsets: Array<[number, number]> = [
    [7, 4],
    [-7, 4],
    [7, -3],
    [-7, -3],
    [9, 8],
    [-9, 8],
    [4, 9],
    [-4, 9],
  ];

  let x = spawn.x + rx * offsets[0][0] + fx * offsets[0][1];
  let z = spawn.z + rz * offsets[0][0] + fz * offsets[0][1];
  for (const [side, ahead] of offsets) {
    const cx = spawn.x + rx * side + fx * ahead;
    const cz = spawn.z + rz * side + fz * ahead;
    const h = surface.height(cx, cz);
    if (Math.abs(h - base) > 1.2) continue;
    if (surface.blocked(cx, cz, h + 1)) continue;
    x = cx;
    z = cz;
    break;
  }

  group.position.set(x, surface.height(x, z), z);
  // Facing is stored rather than applied: the body it belongs to is still
  // loading, and turning the whole group would take the marker with it.
  group.userData.faceYaw = Math.atan2(spawn.x - x, spawn.z - z);
}

// ---------------------------------------------------------------------------
// THE CASSETTE
// ---------------------------------------------------------------------------
//
// A sculpted audio cassette, built from three.js primitives and nothing else —
// the player asked for primitives in as many words, and this is a thing that
// turns over an NPC's head for the whole session, so it is also the right
// answer on cost.
//
// WHAT MAKES IT READ AS A CASSETTE AT TWENTY METRES, in the order the eye gets
// there:
//   1. **The proportion.** 100.5 x 63.8 x 12 mm is the Philips Compact
//      Cassette, and it is a shape almost nobody has to be told the name of.
//      Kept exactly: 0.62 x 0.394 x 0.076 m is that ratio to within a percent.
//   2. **Two dark discs with a pale ring in each.** The spool windows and their
//      hubs, and they are the single strongest signal — nothing else in a skate
//      game is two eyes in a rounded rectangle. Dark against gold at any
//      distance the chase camera ever sits at.
//   3. **A bone label band across the top half**, with one dark rule across it:
//      the strip you write the track names on.
//   4. **A slot cut through the bottom edge** — the tape-head opening the felt
//      pad sits behind. It is what breaks the bottom silhouette and stops the
//      shape reading as a plain brick.
//   5. **Five screw dimples** — four corners and one at the top centre. Free
//      (they are merged in), invisible past a few metres, and the reason a
//      close pass looks moulded rather than printed.
//
// WHAT IT COSTS: three materials, three draw calls, about 330 triangles.
// Everything sharing a material is merged into ONE geometry before it becomes
// a mesh — twenty-odd little parts would otherwise be twenty-odd draw calls for
// a prop that is on screen every frame of every session.
//
// THE EDGE-ON PROBLEM, and it is the same one the old ring had written up. The
// marker turns about Y, so a flat card goes knife-edge twice a revolution. A
// torus went to a LINE there; a cassette goes to a 0.62 x 0.076 bar, which is
// still a solid object — and the bone spine strip along its top edge and the
// dark slot along its bottom mean even that view has three tones in it. On top
// of that the whole body is tilted inside the spinning node, so what the player
// actually sees is a slow tumble that is never square to anything for long.

/** Philips Compact Cassette, in metres, to a percent. */
const CASSETTE_W = 0.62;
const CASSETTE_H = 0.394;
const CASSETTE_D = 0.076;
/**
 * The paper label and the spool hubs. Was the HUD's bone (`0xeafff2`), which is
 * very slightly GREEN — invisible against gold, obvious against the warm grey
 * shell `MARKER_COLOR` became, where it read as a mint sticker on a beige
 * cassette. `0xe8e2d4` is aged paper: the same value, warm instead of cool, so
 * the label still separates from the shell without introducing a second hue.
 */
const LABEL_COLOR = 0xe8e2d4;
/** …and everything both of them go to while he is not offering a run. */
const MARKER_DULL = 0x6c6a63;
const LABEL_DULL = 0x8d897e;

interface MarkerBuild {
  markerGroup: THREE.Group;
  /** Warm grey and lit, or darker grey and flat — see `MARKER_COLOR`. */
  setAvailable: (available: boolean) => void;
  dispose: () => void;
}

/** The thing turning over his head — a cassette, from primitives, no art. */
function buildMarker(): MarkerBuild {
  const markerGroup = new THREE.Group();
  markerGroup.position.y = MARKER_HEIGHT;

  // Tilted INSIDE the node the update loop spins, so the spin carries the tilt
  // round with it and the cassette nods as it turns instead of rotating like a
  // sign on a post. It is also what keeps it off a perfect knife-edge.
  const body = new THREE.Group();
  body.name = "cassette";
  body.rotation.set(-0.2, 0, 0.1);
  markerGroup.add(body);

  const shellMat = new THREE.MeshStandardMaterial({
    color: MARKER_COLOR,
    emissive: MARKER_COLOR,
    emissiveIntensity: 1.1,
    roughness: 0.42,
    metalness: 0.08,
  });
  const labelMat = new THREE.MeshStandardMaterial({
    color: LABEL_COLOR,
    emissive: LABEL_COLOR,
    emissiveIntensity: 0.55,
    roughness: 0.75,
    metalness: 0,
  });
  // The windows, the slot and the screws. Deliberately NOT driven by
  // availability: the dark is what makes the shape legible, and a dull cassette
  // with black windows still reads as a cassette while a uniformly grey one is
  // a brick.
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x14110b,
    roughness: 0.55,
    metalness: 0.15,
  });

  const half = CASSETTE_D / 2;
  const shell: THREE.BufferGeometry[] = [];
  const label: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];

  /**
   * Put one flat part on BOTH faces. The marker turns all the way round, so the
   * back of the cassette is on screen exactly as often as the front — and both
   * faces of a real cassette carry the same furniture (side A and side B).
   *
   * `out` is how far the part stands proud of the shell face. The −Z copy is
   * turned a half-turn about Y so its front still points out of the shell:
   * `CircleGeometry` and `RingGeometry` are single-sided, and an unturned copy
   * on the back face is a part you can only see from inside the object.
   */
  const bothFaces = (
    make: () => THREE.BufferGeometry,
    x: number,
    y: number,
    out: number,
  ): THREE.BufferGeometry[] => [
    make().translate(x, y, half + out),
    make()
      .rotateY(Math.PI)
      .translate(x, y, -(half + out)),
  ];

  // --- the shell -----------------------------------------------------------
  shell.push(new THREE.BoxGeometry(CASSETTE_W, CASSETTE_H, CASSETTE_D));
  // The stepped bottom lip. It is the one piece of massing that is not flat,
  // and it is what gives the knife-edge view a profile instead of a rectangle.
  shell.push(
    new THREE.BoxGeometry(CASSETTE_W, 0.032, CASSETTE_D + 0.008).translate(
      0,
      -CASSETTE_H / 2 + 0.016,
      0,
    ),
  );

  // --- the label, and the spine strip along the top edge --------------------
  label.push(...bothFaces(() => new THREE.BoxGeometry(0.47, 0.15, 0.006), 0, 0.072, 0.001));
  // The spine — the strip you write on the edge so you can find it in a box of
  // twenty. Here it is doing a second job: it is the bone tone that survives
  // into the edge-on view.
  label.push(
    new THREE.BoxGeometry(0.44, 0.014, CASSETTE_D + 0.004).translate(0, CASSETTE_H / 2 - 0.009, 0),
  );

  // --- the two spool windows, and the hubs inside them ----------------------
  for (const x of [-0.126, 0.126]) {
    dark.push(...bothFaces(() => new THREE.CircleGeometry(0.082, 20), x, -0.052, 0.0012));
    label.push(...bothFaces(() => new THREE.RingGeometry(0.024, 0.042, 14), x, -0.052, 0.0028));
  }

  // --- the tape-head slot through the bottom edge ---------------------------
  dark.push(
    new THREE.BoxGeometry(0.26, 0.058, CASSETTE_D + 0.012).translate(
      0,
      -CASSETTE_H / 2 + 0.029,
      0,
    ),
  );

  // --- the rule across the label, and the five screws -----------------------
  dark.push(...bothFaces(() => new THREE.BoxGeometry(0.4, 0.005, 0.002), 0, 0.072, 0.0055));
  const screws: Array<[number, number]> = [
    [-0.272, 0.168],
    [0.272, 0.168],
    [-0.272, -0.168],
    [0.272, -0.168],
    [0, 0.168],
  ];
  for (const [x, y] of screws) {
    dark.push(...bothFaces(() => new THREE.CircleGeometry(0.013, 8), x, y, 0.0012));
  }

  // One mesh per material. `mergeGeometries` wants a matching attribute set,
  // which every primitive above has (position / normal / uv), and `false` keeps
  // it to a single group rather than one per input.
  const parts: Array<[THREE.BufferGeometry[], THREE.MeshStandardMaterial, string]> = [
    [shell, shellMat, "cassette-shell"],
    [label, labelMat, "cassette-label"],
    [dark, darkMat, "cassette-dark"],
  ];
  const meshes: THREE.Mesh[] = [];
  for (const [geoms, material, name] of parts) {
    const merged = mergeGeometries(geoms, false);
    for (const g of geoms) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    body.add(mesh);
    meshes.push(mesh);
  }

  return {
    markerGroup,
    setAvailable: (available: boolean): void => {
      shellMat.color.set(available ? MARKER_COLOR : MARKER_DULL);
      shellMat.emissive.set(available ? MARKER_COLOR : MARKER_DULL);
      shellMat.emissiveIntensity = available ? 1.1 : 0.12;
      labelMat.color.set(available ? LABEL_COLOR : LABEL_DULL);
      labelMat.emissiveIntensity = available ? 0.55 : 0.06;
    },
    dispose: (): void => {
      for (const mesh of meshes) mesh.geometry.dispose();
      shellMat.dispose();
      labelMat.dispose();
      darkMat.dispose();
    },
  };
}

/** Plant the run-starting NPC in whatever map is mounted right now. */
export function mountRunNpc(
  scene: THREE.Scene,
  surface: SurfaceProvider,
  opts: RunNpcOptions = {},
): RunNpc {
  return new RunNpc(scene, surface, opts);
}
