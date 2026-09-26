// THE CONVERSATION — the prompt that says a key will start one, and the quest
// card that key opens.
//
// It exists because of one report: *"I need to speak — press the button to
// start talking to him. Or there, take the quest. And during this time, don't
// behave like [the ride does now]."* Rolling through a circle used to BE the
// conversation: the run started, the clock ran, and the player found out by
// reading the HUD. Now the circle only puts a line on screen, the key opens a
// card, and the card is where the run is agreed to.
//
// ============================================================================
// WHAT THIS FILE MAY DRAW — the HUD's style contract, applied
// ============================================================================
// TYPE — **Syne Mono, everything, one weight.** The player's own note ends
// "now the old font — make it a new font, please", and the old font was the
// Anton/Barlow/Big-Shoulders set the rest of the interface has been retiring
// into Syne Mono all round. There is not one `font-family` below outside Syne
// Mono, with ONE deliberate exception: the keycap, which arrives whole from
// `hud.ts` and carries its own Barlow legend because a key's legend is part of
// the moulded object, not of this screen's typography. Syne Mono has one
// weight and no bold, so emphasis here is SIZE and COLOUR — never
// `font-weight`.
//
// COLOUR — the HUD's five, unchanged: gold `#ffd23d` for the thing the player
// is being offered, bone `#eafff2` for what is simply lit, and the shared
// `--ink` shadow for contrast over bright concrete.
//
// SURFACE — **NO PLATE** (AGENTS.md rule 6), and as of the player's note NO
// RULES EITHER: *"remove the lines when you're talking to the guy"*. The card
// used to carry two — a gold bar down its whole left edge and a short one under
// the speaker's name — and both are gone. What is left holding the card
// together is the one thing that never draws an edge: the soft radial wash,
// deepened to take the rules' place. It is the same family the results readout
// uses, it has no straight line in it anywhere, and it fades out before it
// reaches any side of the frame. Nothing here is a box.
//
// So the card's separation is now TYPOGRAPHIC — gold name, bone line, big white
// options, small dim legend, and air between them — which is the same way the
// rest of this interface has always worked. The rules were the one place it
// borrowed an edge instead.
//
// ============================================================================
// THE KEY, and why it is not E
// ============================================================================
// E is the MANUAL and it is HELD (`src/skate/input.ts`, `manualHeld`), so it is
// down for whole seconds at a time in normal riding — the one key that must not
// also mean "talk". Q is the nose manual for the same reason. What is free and
// still under the left hand's reach from WASD is **T**, which is also the only
// free letter that says what it does. It is not in the ride's `HANDLED` set and
// not in the run's `RIDE_KEYS`, so nothing else in the game answers it.

import { KEYCAP_CSS } from "./hud";

/**
 * How stale the NPC's last word on "the player is standing next to me" may be
 * before the key stops answering, milliseconds.
 *
 * This is the game's OWN input gate, reused rather than reinvented: the ride's
 * source runs exactly this rule on its `consume()` (`READ_TIMEOUT_MS`,
 * `src/skate/input.ts`), with exactly this constant, because a keystroke nobody
 * is stepping the world for is not gameplay input. Here the thing that stops
 * ticking is `setPromptVisible`, which the NPC drives from its `update` — and
 * the boot only runs that inside its `!paused` branch. So pausing, the title
 * screen and a hidden tab all take the key away for free, and none of them had
 * to be told about this file.
 *
 * A frame is 16 ms and the boot clamps its own step at 100 ms, so a third of a
 * second means the loop genuinely is not running.
 */
const PROMPT_TIMEOUT_MS = 330;

/** The key that opens the conversation — see the header for why it is T. */
export const TALK_KEY_CODE = "KeyT";
/** …and what to print on the cap. */
export const TALK_KEY_LABEL = "T";

/**
 * What one NPC is offering, in the three things the player asked to see: who
 * is talking, one line of what he wants, and the two ways out of it.
 */
export interface QuestOffer {
  /** The name the card prints at the top. */
  who: string;
  /** One line of what he wants — one sentence, no paragraph. */
  line: string;
  /** The word on the option that takes the quest. */
  accept: string;
  /** …and on the one that walks away. */
  decline: string;
}

export interface NpcDialogueOptions {
  /** The words this card says. Fixed for the life of the widget. */
  offer: QuestOffer;
  /** The card just came up — the NPC starts saying his line here. */
  onOpen?: () => void;
  /** START RUN was chosen. This is the callback the drive-by trigger used to
   *  fire the instant the board swept past. */
  onAccept: () => void;
  /** NOT NOW, Escape, or the talk key again. */
  onDecline?: () => void;
}

// ---------------------------------------------------------------------------
// THE GATE — one fact, read by the boot
// ---------------------------------------------------------------------------
//
// The ride is frozen while a card is up, and the boot is the only place that
// can do it: it owns the frame loop and the input source. So this module holds
// the fact and hands it over two ways — a predicate for the per-frame branch,
// and an EDGE subscription for the things that must only move on a transition.
//
// The camera is the reason the edge exists. The follow rig owns pointer lock
// (`pointerLockAim: true`) and `setPaused` is documented as the only door it
// goes through — and a re-lock is only legal from inside a user gesture. The
// watcher below is called SYNCHRONOUSLY from the keypress or the click that
// closed the card, which is exactly that gesture.

let openCount = 0;
const watchers = new Set<(open: boolean) => void>();

/** Is a quest card up right now? The boot's per-frame input gate reads this. */
export function dialogueOpen(): boolean {
  return openCount > 0;
}

/**
 * Be told when that flips, on the edge and inside the gesture that caused it.
 * Returns the unsubscribe.
 */
export function onDialogueToggle(fn: (open: boolean) => void): () => void {
  watchers.add(fn);
  return () => {
    watchers.delete(fn);
  };
}

function announce(delta: number): void {
  const was = openCount > 0;
  openCount = Math.max(0, openCount + delta);
  const now = openCount > 0;
  if (now === was) return;
  for (const fn of watchers) fn(now);
}

const CSS = `
#npc-talk {
  position: fixed; inset: 0; z-index: 12; pointer-events: none;
  user-select: none;
  /* Syne Mono, and nothing else — see the header. One weight, so no rule
     below sets a font-weight. */
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace;
  font-weight: 400;
  --gold: #ffd23d;
  --bone: #eafff2;
  --ink: 0 2px 7px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.85);
}
/* The keycap arrives whole from hud.ts rather than being drawn again here —
   one object, one visual language, and the control rail on the right of the
   screen is already printing it. Emitted rather than assumed: relying on
   another module having put its stylesheet in the head first is the kind of
   ordering dependency that works until the day it does not. The rules are
   byte-identical to the HUD's, so a second copy changes nothing. */
${KEYCAP_CSS}

/* ---- THE PROMPT ---------------------------------------------------------
   Rolling into his radius does exactly this much: one line, centred, above
   everything the HUD keeps along the floor of the screen. It clears the
   balance gauge (25vh) and the held-trick badge just above it, so a player
   who rolls up mid-manual reads two things rather than one overlapping mess.

   It breathes. A prompt that sits perfectly still is a label; a prompt that
   moves is an invitation, and this one is the only thing on screen asking to
   be pressed. */
#npc-talk .prompt {
  position: absolute; left: 0; right: 0; bottom: 34vh; margin-inline: auto;
  width: max-content;
  display: flex; align-items: center; gap: .7em;
  --cap: clamp(20px, 2vw, 26px);
  opacity: 0; transform: translateY(7px);
  transition: opacity .18s ease, transform .18s ease;
}
/* Tappable as well as pressable. Under pointer lock a desktop click can never
   land on it — the lock element eats every button — so this costs nothing
   there and is the ONLY way in on a touch screen, where there is no T to
   press. */
#npc-talk .prompt.on {
  opacity: 1; transform: none; pointer-events: auto; cursor: pointer;
  animation: talk-breathe 1.5s ease-in-out infinite alternate;
}
#npc-talk .prompt .pw {
  font-size: clamp(12px, 1.35vw, 17px); letter-spacing: .22em;
  text-transform: uppercase; color: var(--bone); text-shadow: var(--ink);
}
@keyframes talk-breathe { from { transform: none; } to { transform: translateY(-3px); } }
/* …and the pixels follow the key. The staleness gate takes T away the moment
   the world stops being stepped, but nothing is ticking to take the LINE off
   the screen — so a paused game would keep an invitation up for a key that has
   stopped answering. #centre.show.pause is the HUD's own modal card (PAUSED,
   and the context-loss notice), read here and never written, and it is exactly
   the state in which this prompt is a lie. Scoped to the prompt on purpose: a
   card that is genuinely open must never be hidden while it still holds the
   ride's input gate. */
body:has(#centre.show.pause) #npc-talk .prompt { display: none; }

/* ---- THE WASH -----------------------------------------------------------
   Not a plate: no box, no edge, no corner. A soft radial darkening centred
   under the card, the same family the results readout already uses, so the
   type earns its contrast off the world instead of off a rectangle.

   DEEPENED when the two gold rules came off. The rules were doing a job as
   well as decorating — they told the eye where the card began over a plaza
   that is mostly bright concrete — so the wash has to carry that on its own
   now. The core is darker and the falloff is pulled in tighter, which is what
   makes the darkening read as belonging to THIS card rather than as the whole
   screen dimming. It is still gone well before any side of the frame, so there
   is no edge anywhere in it. */
#npc-talk .wash {
  position: absolute; inset: 0; opacity: 0;
  transition: opacity .3s ease;
  background:
    radial-gradient(62% 50% at 50% 76%,
      rgba(5,7,12,.93), rgba(5,7,12,.66) 44%, rgba(5,7,12,.26) 70%, rgba(5,7,12,0) 90%),
    linear-gradient(0deg, rgba(5,7,12,.62), rgba(5,7,12,0) 50%);
}
#npc-talk.up .wash { opacity: 1; }

/* ---- THE CARD -----------------------------------------------------------
   Bottom-anchored and centred, so the man you are talking to stays on screen
   above it — a conversation where the other party is behind the interface is
   a menu with a face painted on it.

   Centred with auto margins and NEVER a centring transform: the entrance
   animates the transform property, and a translateX(-50%) is the first thing
   it would throw away. That is the same lesson the menu's wordmark learned the hard
   way, written down here so it is not learned twice.

   NO ornament at all now. The gold rule that used to run down the left edge is
   gone at the player's word, and its indent went with it: a left padding on a
   max-content block centred by auto margins pushes every word half a padding
   right of true centre, so keeping it would have left the card sitting
   off-axis with nothing on the left to explain why. What holds the rows
   together is the alignment they already share and the wash under them. */
#npc-talk .card {
  position: absolute; left: 0; right: 0; bottom: 13vh; margin-inline: auto;
  width: max-content; max-width: min(620px, 78vw);
  display: flex; flex-direction: column; align-items: flex-start;
  gap: clamp(4px, .8vh, 9px);
  opacity: 0; transform: translateY(12px);
  transition: opacity .22s ease, transform .22s ease;
  visibility: hidden;
}
#npc-talk.up .card { opacity: 1; transform: none; visibility: visible; pointer-events: auto; }
/* Entrance choreography — the name, then the line, then the two ways out.
   Stamped with --i per row. */
#npc-talk .card > * {
  opacity: 0; transform: translateY(8px);
  transition: opacity .26s ease, transform .26s ease;
  transition-delay: calc(var(--i, 0) * 60ms);
}
#npc-talk.up .card > * { opacity: 1; transform: none; }

/* The name, and it is still the gold one — the player asked for the LINES to
   go, not for the man he is talking to to stop being named. Gold, uppercase and
   wide-tracked against the bone sentence under it is what makes it read as a
   speaker rather than as the first words of the speech.

   The short gold bar that used to sit under it (a .who::after rule) is gone
   with the left edge. What it was really doing was holding the name apart from
   the line, so that spacing stays as a margin — air, not a mark. */
#npc-talk .who {
  font-size: clamp(15px, 1.9vw, 24px); letter-spacing: .14em;
  text-transform: uppercase; color: var(--gold); text-shadow: var(--ink);
  margin-bottom: clamp(2px, .55vh, 7px);
}
#npc-talk .line {
  font-size: clamp(12px, 1.45vw, 18px); line-height: 1.5; letter-spacing: .02em;
  color: var(--bone); text-shadow: var(--ink);
  margin-bottom: clamp(3px, .7vh, 8px);
}
#npc-talk .opts { display: flex; flex-direction: column; align-items: flex-start; gap: clamp(2px, .5vh, 6px); }
/* Bare type that reacts, in the menu rail's own language — the chevron, the
   lean, the gold glow — but in Syne Mono rather than Anton, because this is
   the interface the player just asked to stop wearing the old face. */
#npc-talk .opt {
  position: relative; border: 0; background: transparent; cursor: pointer;
  font-family: inherit; font-weight: 400;
  font-size: clamp(16px, 2.1vw, 27px); line-height: 1.2; letter-spacing: .06em;
  text-transform: uppercase; color: rgba(255,255,255,.72);
  padding: .08em .1em; text-shadow: var(--ink);
  transition: transform .15s ease, color .15s ease, text-shadow .15s ease;
  transform-origin: left center;
}
#npc-talk .opt.is-on {
  color: #fff; outline: none; transform: scale(1.05) rotate(-1.1deg);
  text-shadow: var(--ink), 0 0 24px rgba(255,210,61,.8);
}
#npc-talk .opt.is-on::before {
  content: "\\25B8"; position: absolute; left: -.66em; color: var(--gold);
}
#npc-talk .opt:active { transform: scale(.98) rotate(-1.1deg); }
/* NOT NOW is the quiet one on purpose: the offer is what the player rolled
   over here for, and the way out should not shout as loud as the way in. */
#npc-talk .opt.quiet { font-size: clamp(12px, 1.5vw, 19px); color: rgba(255,255,255,.55); }
#npc-talk .opt.quiet.is-on { color: rgba(255,255,255,.94); }
#npc-talk .legend {
  display: flex; align-items: center; gap: .45em; flex-wrap: wrap;
  margin-top: clamp(4px, .9vh, 11px);
  --cap: clamp(16px, 1.6vw, 21px);
  font-size: clamp(9px, 1.05vw, 12px); letter-spacing: .24em;
  text-transform: uppercase; color: rgba(255,255,255,.6); text-shadow: var(--ink);
}
#npc-talk .legend span { margin-right: .5em; }
/* A phone has no keyboard, so the key hints stand down — but the widgets do
   not: the prompt becomes a thing you tap and the two options are already
   buttons. A prompt hidden here would leave a touch player with no way into
   the conversation at all. */
@media (pointer: coarse) {
  #npc-talk .prompt .keycap { display: none; }
  #npc-talk .legend { display: none; }
}
`;

/** One stylesheet for the whole game, however many NPCs mount over a session. */
let styled = false;

function inject(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}

export class NpcDialogue {
  private opts: NpcDialogueOptions;
  private root: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private buttons: HTMLButtonElement[];
  /** 0 = accept, 1 = decline. Purely visual — see `select` for why the DOM's
   *  own focus is never used. */
  private picked = 0;
  private open = false;
  private promptOn = false;
  /** When the NPC last said where the player is — see `PROMPT_TIMEOUT_MS`. */
  private lastTick = Number.NEGATIVE_INFINITY;
  private dead = false;

  constructor(opts: NpcDialogueOptions) {
    this.opts = opts;
    inject();

    this.root = document.createElement("div");
    this.root.id = "npc-talk";
    this.root.innerHTML = `
      <div class="wash"></div>
      <div class="prompt"><b class="keycap">${esc(TALK_KEY_LABEL)}</b><span class="pw">Talk</span></div>
      <div class="card">
        <div class="who" style="--i:0">${esc(opts.offer.who)}</div>
        <div class="line" style="--i:1">${esc(opts.offer.line)}</div>
        <div class="opts" style="--i:2">
          <button class="opt" type="button" data-pick="0">${esc(opts.offer.accept)}</button>
          <button class="opt quiet" type="button" data-pick="1">${esc(opts.offer.decline)}</button>
        </div>
        <div class="legend" style="--i:3">
          <b class="keycap">&#8593;</b><b class="keycap">&#8595;</b><span>Choose</span>
          <b class="keycap">Enter</b><span>Pick</span>
          <b class="keycap">Esc</b><span>Leave</span>
        </div>
      </div>`;
    document.body.appendChild(this.root);

    this.promptEl = this.root.querySelector(".prompt") as HTMLDivElement;
    // The card itself is never held: it is shown and hidden by one class on the
    // ROOT (`.up`), which is what lets the wash, the card and its staggered rows
    // all transition off a single toggle instead of four element handles.
    this.buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>(".opt"));

    for (const button of this.buttons) {
      const index = Number(button.dataset.pick ?? 0);
      // Hovering IS selecting, so the keyboard highlight and the mouse never
      // disagree about which option is live — one selection, two ways to move
      // it.
      button.addEventListener("pointerenter", () => this.select(index));
      button.addEventListener("click", () => {
        // Blurred before the action runs: a button that keeps browser focus
        // gets re-activated by the next gameplay Space or Enter, which here
        // would silently start a second run.
        button.blur();
        this.choose(index === 0);
      });
    }

    // The prompt is a control too, not just a label. On a desktop the pointer
    // is locked away by the follow camera so this can never fire — the lock
    // element takes every button — and on a touch screen it is the only way in,
    // because there is no T to press.
    this.promptEl.addEventListener("click", () => {
      if (this.promptOn && this.live()) this.openCard();
    });

    this.paint();
    // CAPTURE, on the window, so the keys this card owns are taken before the
    // ride source, the pause key and the run's ENTER handler ever see them —
    // all three listen further down the same path. `stopPropagation` from the
    // capture phase at the window is what stops the event reaching any of
    // them, and it is deliberately scoped to the four keys below: everything
    // else the player presses still belongs to the game.
    window.addEventListener("keydown", this.onKey, true);
  }

  /** Is the card up right now? */
  get isOpen(): boolean {
    return this.open;
  }

  /**
   * Show or hide the "press T" line. The NPC drives it off distance; this
   * widget only draws it — and it is also the gate on the key, so the prompt
   * and what the key does can never say different things.
   */
  setPromptVisible(on: boolean): void {
    if (this.dead) return;
    // Stamped on EVERY call, before the early-out — this is the clock `live()`
    // runs off, and it has to tick on the frames where nothing changed too.
    this.lastTick = performance.now();
    if (on === this.promptOn) return;
    this.promptOn = on;
    this.promptEl.classList.toggle("on", on && !this.open);
  }

  /** Is the world still being stepped around this prompt? See `PROMPT_TIMEOUT_MS`. */
  private live(): boolean {
    return performance.now() - this.lastTick < PROMPT_TIMEOUT_MS;
  }

  /** Put the card up, from anywhere — the key press, or a caller of its own. */
  openCard(): void {
    if (this.dead || this.open) return;
    this.open = true;
    this.picked = 0;
    this.paint();
    this.promptEl.classList.remove("on");
    this.root.classList.add("up");
    announce(1);
    this.opts.onOpen?.();
  }

  /**
   * Take it down without choosing anything — the NPC calls this when he stops
   * being able to offer a run at all (the map changed under the card, or a run
   * started some other way).
   */
  closeCard(): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove("up");
    this.promptEl.classList.toggle("on", this.promptOn);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    announce(-1);
  }

  dispose(): void {
    this.dead = true;
    window.removeEventListener("keydown", this.onKey, true);
    if (this.open) {
      this.open = false;
      announce(-1);
    }
    this.root.remove();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.dead) return;
    // A browser shortcut is not a game key — Ctrl/Cmd+T is a new tab and this
    // card has no business eating it.
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (!this.open) {
      // The key only works where the prompt says it works. One test, so a
      // player can never press it into silence — plus the staleness gate, which
      // is what stops T opening a card from behind the pause screen.
      if (e.code !== TALK_KEY_CODE || !this.promptOn || !this.live()) return;
      this.take(e);
      this.openCard();
      return;
    }

    switch (e.code) {
      // Up moves the highlight UP the column, which is where the first option
      // is. Labels and directions agree (AGENTS.md rule 17).
      case "ArrowUp":
        this.take(e);
        this.select(this.picked - 1);
        break;
      case "ArrowDown":
        this.take(e);
        this.select(this.picked + 1);
        break;
      case "Enter":
      case "NumpadEnter":
        this.take(e);
        this.choose(this.picked === 0);
        break;
      // Escape closes the card rather than pausing behind it. The game's
      // "Escape pauses" contract is not weakened — the pause is one more
      // Escape away, and a modal that ignores Escape is the older defect.
      case "Escape":
      case TALK_KEY_CODE:
        this.take(e);
        this.choose(false);
        break;
      default:
        break;
    }
  };

  /** Mine, and nobody else's — see the capture listener above. */
  private take(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopPropagation();
  }

  private select(index: number): void {
    const next = Math.max(0, Math.min(this.buttons.length - 1, index));
    if (next === this.picked) return;
    this.picked = next;
    this.paint();
  }

  private paint(): void {
    for (let i = 0; i < this.buttons.length; i++) {
      this.buttons[i].classList.toggle("is-on", i === this.picked);
    }
  }

  private choose(accept: boolean): void {
    if (!this.open) return;
    // Down FIRST, and only then the callback: `onAccept` starts a run, the run
    // moves the HUD, and a card still on screen through all of that is the
    // player watching their own decision arrive late.
    this.closeCard();
    if (accept) this.opts.onAccept();
    else this.opts.onDecline?.();
  }
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
