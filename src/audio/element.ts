// Making, labelling and safely poking HTMLAudioElements.
//
// WHY ELEMENTS AND NOT WEB AUDIO: this game has no positional audio to sell and
// no effects to run. What it needs is a dozen independently-rated streams whose
// volume and rate ride gameplay, which is exactly what an element does, with
// none of the decode-the-whole-file-into-RAM cost of `decodeAudioData` — the
// thing that actually kills phones. The one price is that an element cannot
// amplify above 1.0. That price comes due exactly once, on the canyon ambience;
// see `catalog.ts`.
//
// Every element this module builds is put in the DOM under one container and
// labelled with `data-sound`. That is not instrumentation for our own benefit —
// it costs nothing, it is what devtools' media panel reads, and it means the
// live mix is inspectable in a shipped build by anyone who opens a console. No
// debug mode, no hook, no flag: the audio graph simply is what it says it is.

const CONTAINER_ID = "game-audio";

/**
 * Elements whose media failed to load. A missing sound has to cost nothing:
 * `play()` on a dead element is a no-op rather than a rejected promise and a
 * `currentTime` write into an element that has no media. It is a WeakSet so a
 * released element is still collectable.
 */
export const dead = new WeakSet<HTMLAudioElement>();

/**
 * Rate is a PITCH ramp here, not a time-stretch. Browsers preserve pitch by
 * default, which makes a speeding-up loop sound like the same recording played
 * in a hurry; wheels, trucks and wind are supposed to sing higher as they spin.
 */
type Pitched = HTMLAudioElement & {
  preservesPitch?: boolean;
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

let container: HTMLElement | null = null;

function host(): HTMLElement {
  if (container?.isConnected) return container;
  const found = document.getElementById(CONTAINER_ID);
  if (found) {
    container = found;
    return found;
  }
  const div = document.createElement("div");
  div.id = CONTAINER_ID;
  div.setAttribute("aria-hidden", "true");
  // Boxed at zero size rather than `display:none` or unattached: an element
  // outside the document plays fine but is invisible to `querySelectorAll`,
  // and a stray inline child of <body> can catch a `body > *` rule in the UI.
  div.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  document.body.appendChild(div);
  container = div;
  return div;
}

export function makeAudio(url: string, name: string, pitched = false): HTMLAudioElement {
  const el = new Audio(url);
  el.preload = "auto";
  el.dataset.sound = name;
  el.addEventListener("error", () => dead.add(el), { once: true });
  if (pitched) {
    const p = el as Pitched;
    if ("preservesPitch" in p) p.preservesPitch = false;
    if ("mozPreservesPitch" in p) p.mozPreservesPitch = false;
    if ("webkitPreservesPitch" in p) p.webkitPreservesPitch = false;
  }
  host().appendChild(el);
  return el;
}

/**
 * Move the playhead, tolerating an element whose metadata has not arrived.
 *
 * Setting `currentTime` before the browser knows the duration throws
 * `InvalidStateError` on Safari, and every managed loop seeks the moment it is
 * created — so the seek is queued behind `loadedmetadata` when that happens.
 * Without this the first loop of the session starts at 0 and plays the mp3's
 * encoder padding, which is the gap the windows exist to avoid.
 */
export function seek(el: HTMLAudioElement, t: number): void {
  if (dead.has(el)) return;
  try {
    el.currentTime = t;
  } catch {
    el.addEventListener(
      "loadedmetadata",
      () => {
        try {
          el.currentTime = t;
        } catch {
          /* the media went away between the two attempts */
        }
      },
      { once: true },
    );
  }
}

/** Start it, swallowing the autoplay rejection a locked context returns. */
export function start(el: HTMLAudioElement): void {
  if (dead.has(el)) return;
  void el.play().catch(() => {});
}
