// Every sound this game owns, with the level it was actually MEASURED at.
//
// `rms` and `peak` are not taste. They are `ffmpeg astats` run over the real
// files on the CDN, in dBFS, and every gain in the mixer is derived from them
// rather than dialled by ear — which matters here more than usual, because
// nobody who wired this mix can hear it. A clip mastered 8 dB hotter than
// another gets 8 dB less gain and the two land in the same place; that is the
// whole method, and it is why `mixer.ts` reads like arithmetic.
//
// The generator does not master to a target: `horn` came back at −11.2 dBFS
// RMS with its peaks clipped +0.7 dB over full scale, while `canyon` came back
// at −53.9. That is a 43 dB spread across sounds that are meant to share one
// mix, and it is the single reason this table exists.
//
// `start`/`end` on a loop are the window that actually REPEATS, and they are
// never the whole file. Two things live outside them:
//
//   1. The mp3 encoder's own delay and padding — roughly 20–30 ms of inserted
//      silence at the head and a partial frame at the tail. `<audio loop>`
//      does not trim either, which is the classic "gap every cycle". Starting
//      at 0.05 and rewinding before the last frame steps around both.
//   2. Whatever the GENERATOR faded. Map 2's track fades to silence over its
//      last 3–4 seconds despite being prompted for a seamless loop, and the
//      grass roll clip swells up from −44 dBFS and back down to −64 across its
//      six seconds — looping either one whole means hearing it end. Map 1's
//      lofi track is the exception, and the only clip in this file that came
//      back genuinely loop-ready: full level at 0.03 s and still full at 89.97.
//      What its window trims is the encoder's silence and one whole bar, for a
//      reason that is musical rather than a fade — see the entry.
//
// HOW THE WINDOWS WERE CHOSEN, and it is a search rather than a guess. For
// every candidate pair the level of the 120 ms BEFORE the out-point is compared
// with the 120 ms AFTER the in-point, and then again over 30 ms. The two
// horizons hear different faults: the 30 ms pair is the CLICK at the splice,
// the 120 ms pair is the SWELL across it, and a window can be clean on one and
// awful on the other — the wind's old window measured 3.0 dB long and 5.0 dB
// short. The pair that minimised both, at the longest length that stayed inside
// the clip's own flat part, won. The two figures are written next to each clip,
// old and new, because "seamless" is a measurement here and not an opinion.
//
// MUSIC ANSWERS TO A SECOND TEST, and it was added when map 1's track became a
// 6.000 s groove. Levels can match perfectly and the loop can still stumble,
// because a bar that arrives early is a fault no level meter can see. So a
// music window is chosen by WAVEFORM CORRELATION across the splice first — the
// distance between the two playheads has to come out a whole number of bars —
// and the level step is checked afterwards rather than the other way round.
//
// (Measured on a mono downmix, which reads about 3 dB hotter than the stereo
// `rms` above it. A STEP is a difference, so that offset cancels; a BODY level
// quoted against the whole file is a difference too. Nothing below mixes the
// two conventions.)

/** A one-shot sample. */
export interface Clip {
  url: string;
  /** Whole-file RMS, dBFS. */
  rms: number;
  /** True peak, dBFS. Above 0 means the generator clipped it on the way out. */
  peak: number;
  /**
   * Seconds of dead air before the sound actually starts. A one-shot is played
   * FROM here, so the hit lands on the frame that asked for it rather than a
   * third of a second later.
   */
  onset?: number;
}

/** A bed. Same numbers plus the window that repeats. */
export interface LoopClip extends Clip {
  start: number;
  end: number;
}

const CDN = "https://assets.auras.cc/generations";
const sfx = (id: string): string => `${CDN}/${id}/audio-sfx`;
const music = (id: string): string => `${CDN}/${id}/audio-music`;
const voice = (id: string): string => `${CDN}/${id}/audio-voice`;

/**
 * The two music tracks, one per map. Map 1 is urban emo pop-punk over hip hop
 * drums, map 2 is the skate-punk track that has always been there — so the pair
 * is a FAMILY again, two speeds of the same world, where the drill bed it
 * replaced made them two different worlds. That is the player's call and worth
 * recording as one, because it reads as a coincidence in the diff.
 *
 * They are mastered 1.34 dB apart (−15.01 / −13.67) where the original pair were
 * within 0.2, and that is exactly what the PER-TRACK trim in `mixer.ts` is for:
 * each is normalised off its own measured level to the same −24.1 dBFS, so a
 * map change is still a level-matched crossfade and not a jump, even now that
 * the two files no longer happen to match each other. Neither trim clamps —
 * they come out at 0.59 and 0.50 of the way to the element's ceiling, so both
 * tracks reach the target with room to spare.
 */
const tracks = {
  /**
   * Map 1, the downtown block at golden hour. URBAN EMO POP-PUNK OVER HIP HOP
   * DRUMS, chosen by the player from a night of candidates that ran through lofi,
   * boom bap, scratch hip hop, early Chicago drill, trap, psychedelic rock and
   * psychedelic folk. It replaces the drill bed that held this slot for a few
   * hours, which replaced the lofi one, which replaced the skate-punk of
   * milestone 4.
   *
   * `loops.ts` starts the follower at `start` while the leader is still 300 ms
   * short of `end`, so the two playheads run side by side for that whole 300 ms,
   * a fixed `end − 0.3 − start` apart. That distance IS the loop: 66.088 s here.
   *
   * THIS TRACK'S LOOP IS A DIFFERENT KIND OF THING FROM THE DRILL BED'S, and a
   * reader who does not know that will think it is broken. The drill loop was a
   * WAVEFORM repeat: 0.625 correlation across the join, the same bar coming round
   * again. This one has a join correlation of **−0.04** — statistically nothing —
   * and yet it is the best-measured splice of any window in any of the forty-six
   * candidates: 0.38 dB mean deviation from the natural continuation, worst case
   * 0.93 dB, against the track's own 5.77 dB swing across 20 ms. The music either
   * side of the join is not the same music; the LEVEL and the character are, and
   * that is what makes a crossfade inaudible on a guitar track with no repeating
   * sample under it.
   *
   * The evidence that correlation is the weaker guide is direct, not theoretical.
   * Its top-ranked window, L = 60.069 s, renders at **3.15 dB mean with an 8.70 dB
   * worst case — above the groove's own 5.77 dB swing**, i.e. an audible seam. The
   * window below correlates at nothing and renders eight times cleaner. Two
   * independent tracks now, ranked opposite ways by the two metrics, and the
   * render won both times. Rank by the render.
   *
   * WHAT IS NOT MEASURED, and it is the one thing a listener might still hear: the
   * envelope diff knows about level and nothing about harmony. 0.38 dB says there
   * is no click, no hole and no bump at the join. It does not say the chord
   * landing on the other side makes musical sense, and on a track whose
   * periodicity is only 0.18 there may be no window where it does. If the loop
   * point ever sounds like a jump rather than a seam, that is why, and the fix is
   * a different window or a different track — not a different crossfade.
   *
   * The bar is reported as 1.4367 s (167 BPM) by the comb fit in
   * `tools/loop-window.mjs`, but that fit is WEAK — 0.56, explaining four of the
   * ten strongest peaks — and a comb at half the true bar always fits at least as
   * many peaks as the true one, so treat it as unconfirmed. It does not matter
   * here: the window was chosen by the rendered splice, which measures the audio
   * directly and needs no tempo to be right.
   *
   * The in-point clears the encoder's inserted silence (first audible sample at
   * 0.032) and the out-point leaves the file's last 20.6 s unused.
   *
   * Three harnesses, so the next track is not argued about from prose:
   *   · `tools/loop-fit.mjs <file>` — does this track repeat at all, and roughly
   *     where. Triage. Its tempo line is an onset autocorrelation and lands on an
   *     octave of the real tempo as often as on it.
   *   · `tools/loop-window.mjs <file>` — the whole decision: pins the bar off the
   *     peak comb rather than the ACF, then ranks bar-aligned windows by the
   *     rendered splice. Start here.
   *   · `tools/loop-splice.mjs <file>` — the same render for a hand-picked
   *     shortlist, when you already know which windows you are choosing between.
   */
  street: {
    url: music("cms6mkm08001422nsjimpzg4s"),
    rms: -15.01,
    peak: -0.63,
    start: 2.955,
    // 2.955 + 66.088 + 0.3 of overlap. Trim comes out at 0.586 of the element's
    // ceiling — it does not clamp, so the track reaches −24.1 dBFS with room to
    // spare, and it is the quietest bed this slot has held.
    end: 69.343,
  },
  /**
   * Map 2, the flood channel — the FAST track, because map 2 is the fast map:
   * a concrete flume running downhill with obstacles hit while already up to
   * speed. It is PARKED: the 2026-07-29 music change was map 1's alone and
   * nothing here moved. The pairing reads better for it — map 1 is now a chilled
   * lofi groove under a downtown block at golden hour and map 2 keeps the
   * skate-punk, so the two maps sound as different as they ride.
   *
   * Flat to 95.5 s, then the generator's outro. The out-point was 96.8, which
   * is 2.5 dB into that fade — and since a track crossfades on EVERY tier, the
   * 300 ms of overlap was landing on the dip. Pulled back to 95.9.
   */
  spillway: {
    url: music("cms59ulv7000022lb8rnj1y46"),
    rms: -13.7,
    peak: -0.29,
    start: 0.05,
    end: 95.9, // level at the out is 0.8 dB under the body, against 2.5 at 96.8
  },
} satisfies Record<string, LoopClip>;

/** The looping beds — one surface bed at a time, plus wind and the map's air. */
const loops = {
  /**
   * Wheels on grass. The clip is a six-second SWELL — −44 dBFS at the head,
   * −22 in the middle, −64 at the tail — so looping it whole (which is what
   * shipped) washes in and out every six seconds. The window is the plateau.
   */
  grass: {
    url: sfx("cms0efx3r000s22nu5ebee9q9"),
    rms: -27.9,
    peak: -6.34,
    start: 2.26,
    end: 4.41, // step 0.10 dB long / 0.07 short, from 1.88 / 3.08
  },
  /**
   * Wheels on concrete. THE bed — it is up whenever the wheels are turning,
   * which on both maps is nearly always, and on the phone tier it splices
   * rather than crossfades. So this is the one window where a 2 dB step was a
   * step you heard every second and a half for the length of the session, and
   * it is the seam the last round measured and left in.
   *
   * The file is not actually flat: there is a 4 dB bulge through its middle
   * second that no window removes, because it is the recording. What the window
   * fixes is the JOIN, and the join is now inaudible on both horizons.
   */
  street: {
    url: sfx("cms2dqex301hs22lppezgy02e"),
    rms: -22.35,
    peak: -9.14,
    start: 0.31,
    end: 1.95, // step 0.09 / 0.15, from 1.38 / 2.03
  },
  /**
   * Trucks on a steel handrail. Not a steady bed at all — it is a one-second
   * grind PASS that rises to −8.5 dBFS by 0.16 s and rings down to −20 by 0.7,
   * so it swells whatever window it is given and the 120 ms figure below is
   * that swell rather than the join. What moved is the click: the old
   * out-point sat on the tail's own rise, 4.5 dB above the in-point.
   */
  metal: {
    url: sfx("cms2djx2601f022lpivc9qnr3"),
    rms: -16.09,
    peak: -1.28,
    start: 0.03,
    end: 0.978, // step 2.80 / 0.28, from 1.44 / 4.53
  },
  /**
   * Deck across a waxed concrete ledge. Same shape as the rail — one pass,
   * peaking at 0.52 s — so the window is that pass with the near-silent head
   * and tail trimmed off. That leaves it 1.3 dB hotter than the whole file,
   * which is why `CURVES.ledge.gain` came down by the same 1.3 dB; see
   * `mixer.ts`. The bed's level on screen is unchanged.
   */
  ledge: {
    url: sfx("cms2djxnt01f322lpfn6aut06"),
    rms: -22.39,
    peak: -1.23,
    start: 0.226,
    end: 0.93, // step 0.04 / 0.05, from 2.18 / 1.42
  },
  /**
   * Wind at speed — the worst join in the game until this round, on the bed
   * that is up whenever he is fast. TWO faults, one at each end: the clip opens
   * three dB hot and its last quarter-second is a −9.4 dBFS gust six dB over
   * the body of it, so the old window ran the gust straight into the loud
   * opening. The new one starts after the opening and stops before the gust.
   */
  wind: {
    url: sfx("cms59umwj000322lbp7krp1hm"),
    rms: -17.55,
    peak: -0.38,
    start: 0.63,
    end: 7.43, // step 0.03 / 0.36, from 2.98 / 5.04
  },
  /**
   * Map 2's air — a wide concrete channel between wooded hillsides.
   *
   * MEASURED AT −53.9 dBFS RMS, −31.8 dBFS PEAK. That is 30-odd dB below every
   * other sound in this game, and an HTMLAudioElement cannot amplify — 1.0 is
   * the ceiling. It is wired at that ceiling and it is still only just there:
   * the peaks (distant birds, a gust) will read on headphones, the continuous
   * wash will not. See the handoff — this clip needs regenerating hotter, and
   * until it is, map 2's identity is carried by its own track and its own wind
   * curve rather than by this.
   */
  canyon: {
    url: sfx("cms59unyg000622lbcsvqersz"),
    rms: -53.89,
    peak: -31.82,
    start: 0.05,
    end: 11.9, // step 0.60 / 0.79 — the best of the candidates; left alone
  },
} satisfies Record<string, LoopClip>;

/** The one-shots. */
const shots = {
  /** Ollie pop. The quietest thing in the game — it is a tail slap, not a bang. */
  pop: { url: sfx("cms0efxn8000v22nu512232m7"), rms: -31.01, peak: -0.28 },
  /** Wheels back on the floor. Also serves the wall hit, pitched down. */
  land: { url: sfx("cms0efy9n001222nu8hzh3web"), rms: -26.14, peak: -0.4 },
  /** The board going away without you… */
  bail: { url: sfx("cms0efytc001522nus1dxl7vz"), rms: -24.5, peak: -0.25 },
  /** …and you going down with it. */
  body: { url: sfx("cms2dqe9f01hn22lpntob6qpi"), rms: -24.82, peak: -0.34 },
  /** The clack of finding the line, and the chirp of leaving it. */
  lock: { url: sfx("cms2dqdky01hk22lp98gg7nxf"), rms: -21.23, peak: -0.11 },
  /** The board coming round on a flip. */
  whoosh: { url: sfx("cms2dqfmx01hv22lpe845jmyq"), rms: -29.41, peak: -0.26 },
  /** The minute starts. Clipped +0.7 dB by the generator, so it never plays
   *  above 0.9 — anything more and the attenuated peak is still at full scale. */
  horn: { url: sfx("cms59upf2000922lb6o9gwb2x"), rms: -11.21, peak: 0.72 },
  /**
   * …and stops. A MALLET CHIME as of 2026-07-29, at the player's word — *"also
   * another sound more pleasent when the timer goes off"* — in place of the
   * short flat electronic blat that was here.
   *
   * THE THIRD TAKE, and the first usable one. The player asked for *"another
   * sound more pleasent when the timer goes off"* and the blat this replaces was
   * described in this very file as a short flat electronic blat, so the ask was
   * fair. Getting it took three generations and the lesson is worth keeping:
   *
   *   · take 1, "a warm gentle chime… mellow, no harshness" → **−34.6 dBFS**
   *   · take 2, the same idea with "loud… at full level… present and forward"
   *     bolted onto the front → **−39.5 dBFS**, five dB WORSE
   *   · take 3, this one, which asks for a different SOUND rather than a louder
   *     one — a bell struck hard — → **−21.3 dBFS**
   *
   * Adjectives about level do nothing; the generator masters a gentle sound
   * gently, and "loud" in the prompt is a word about the picture, not the
   * master. What moves the number is the physics being described. Ask for a
   * struck bell and you get a transient.
   *
   * Why 18 dB mattered enough to burn two generations on: `runEnd` fires this at
   * element volume 1, the sfx master is 0.85, and an HTMLAudioElement CANNOT
   * amplify — `el.volume` clamps at 1 (`audio.ts`). So a clip's file level IS
   * its ceiling. Take 1 landed at −36.0 dBFS against a concrete roll bed of
   * about −27.9, i.e. **8 dB under the wheels it is supposed to interrupt**, and
   * every minute ends while rolling. This take lands at −22.7 — **5 dB above the
   * bed** — which is the whole difference between a sound and a rumour of one.
   *
   * Measured with ffmpeg astats, the same convention as every other row here:
   * −21.33 RMS, −0.99 true peak, 1.045 s. It reaches a tenth of peak within
   * **0.1 ms**, so no `onset` — the minute ends on the frame that ended it — and
   * it is down to −66.6 dB by the last 20 ms, so it never gets cut off.
   */
  buzzer: { url: sfx("cms6amz7g00ct22obmtiqpi82"), rms: -21.33, peak: -0.99 },
  /** Trucks onto the lip of a transition. 90 ms of room tone first — skipped. */
  coping: { url: sfx("cms59urkn000l22lbncxro19p"), rms: -20.14, peak: 0.8, onset: 0.09 },
  /**
   * A traffic cone sent skittering. THREE HUNDRED MILLISECONDS of silence
   * before the first contact — played from the top, a cone you clipped at
   * 12 m/s would sound four metres behind you. Started from `onset` instead.
   */
  cone: { url: sfx("cms59usn9000q22lb16qfmp1w"), rms: -35.0, peak: -9.95, onset: 0.3 },
  /** A bin going over. Heavy, hollow, and serves every prop that is not light
   *  plastic. */
  bin: { url: sfx("cms59utp8000v22lbubaobkeq"), rms: -19.59, peak: 1.19 },
} satisfies Record<string, Clip>;

export type LoopName = keyof typeof loops;
export type ShotName = keyof typeof shots;
export type TrackName = keyof typeof tracks;

// Re-declared through the interfaces rather than exported straight, so that
// `SHOTS[name].onset` is a `number | undefined` on every member instead of a
// compile error on the eight clips that happen not to have one. The literal
// key sets above are what the three `type` lines keep.
export const TRACKS: Record<TrackName, LoopClip> = tracks;
export const LOOPS: Record<LoopName, LoopClip> = loops;
export const SHOTS: Record<ShotName, Clip> = shots;

/**
 * The NPC's line, measured so the music can get out of its way by the right
 * amount rather than a guessed one. 4.21 s at −24.5 dBFS RMS — within a dB of
 * the body slam, which is to say quiet enough that music at −24 would bury it.
 */
export const VOICE_LINE = {
  url: voice("cms535ayw006z22ozuttz934n"),
  rms: -24.54,
  peak: -8.05,
  seconds: 4.21,
} as const;
