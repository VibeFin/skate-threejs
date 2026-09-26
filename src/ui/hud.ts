// The on-screen layer.
//
// ============================================================================
// THE SHARED STYLE CONTRACT — HUD **and** MENU read this block.
// ============================================================================
// One game, one interface. `menu.ts` is a separate file and a separate agent,
// so the agreement lives here in words rather than in a stylesheet neither of
// us owns. Everything below is a decision, not a suggestion.
//
// TYPE — four faces, four jobs, all four LOADED in index.html. Do not add one.
//   · **Syne Mono** — the INSTRUMENT face. Every number the game counts and
//     every trick it names: the score, the speed, the clock, the trick line,
//     the points a trick paid. It is the wide squarish techno face the player
//     picked off the Tony Hawk's Underground frame, and it is what makes this
//     game's readouts look like that game's readouts. It ships in ONE weight
//     (400) and has no bold, so emphasis comes from SIZE and COLOUR, never
//     from `font-weight`. It is wide — budget roughly twice the width of Big
//     Shoulders for the same string, keep `letter-spacing` at or near 0, and
//     never set it below ~11px.
//     …and as of the player's 2026-07-29 note it takes the READOUT'S OWN
//     CAPTION with it: ON THE CLOCK under the clock, SCORE over the score,
//     KM/H beside the speed, POINTS BANKED and BEST LINE on the results card,
//     the standing line that prints a world rank, and the streak line, which
//     is a count with a word after it. He named the clock and the streak
//     himself and has asked for ONE font language all session — a counter in
//     the instrument face wearing a Barlow caption is exactly the split he
//     keeps pointing at. The tracking comes DOWN when a caption crosses over
//     (.34em Barlow reads as ~.16em here) and the floor is 11px, because a
//     caption is where this face was being set smallest.
//   · **Anton** — heavy display shouting: the loader wordmark, the menu
//     buttons, the held-trick badge, PAUSED.
//   · **Big Shoulders Display 800** — secondary display, where Anton would be
//     too round or too loud: screen headings, the results card's TIME.
//   · **Barlow Condensed 600/700, uppercase, .16–.34em tracking** — every
//     label, legend and micro-string that is NOT sitting on a number: the
//     control rail's skill names, the keycap legends, the loader status, the
//     screens' eyebrows and key hints, HOLDING under the held-trick badge.
//     "Smaller than the thing it describes" used to be the whole test and it
//     is not any more — a caption under a COUNTER follows the counter into
//     Syne Mono (see above). Barlow keeps everything that labels a control or
//     a word.
//
// COLOUR — five, and each one means something:
//   · `#fff` / `--bone #eafff2`  the live, the neutral, the lit
//   · `--gold #ffd23d`           anything the player is EARNING or about to
//                                lose to the clock — the score, the words of a
//                                banked line, the multiplier, the switch badge,
//                                the last fifteen seconds.
//                                NOT the payout digits: "+200" and every
//                                number like it bank in WHITE, on the player's
//                                call. Gold is what the line is WORTH being in
//                                (the score it feeds, the multiplier that grew
//                                it); the payout itself is just the count.
//   · `--rail #59c8ff`           the tricks you have to BALANCE
//   · `--bail #ff5b47`           the line dying, the meter maxed, five seconds
//   · keycap ivory `#f2ecdb→#cec4aa`, legend `#2b2820`, wall `#8b8368`
//
// SURFACE — there are NO PLATES. Nothing in this game gets a rectangle behind
// it (AGENTS.md rule 6). Type sits straight on the world and earns its
// contrast from one shared shadow, `--ink`:
//     text-shadow: 0 2px 7px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.85);
// Where a widget needs a harder edge over bright concrete, `--ink-hard` is the
// stencil variant. Corners come from `border-radius` and never exceed 3px, and
// never from `clip-path`.
//
// THE ONE EXCEPTION, and it is the interface's only piece of furniture: the
// **keycap** (`KEYCAP_CSS`, exported from this file). A key is a physical
// object, so it is drawn as one — a chunky beige cap with a bevel, a side wall
// and a shadow, the way a 1990s mechanical keyboard looks. It is not a backing
// plate: nothing is printed OVER it that would read without it; the cap IS the
// widget. `menu.ts` should `import { KEYCAP_CSS } from "./hud"` and swap its
// controls screen's gold Anton key column for `<b class="keycap">` — same
// object on both screens, sized up there with `--cap`.
//
// ============================================================================
// THE LAYOUT — built to the player's brief off the THUG frame.
// ============================================================================
//   · TOP-LEFT      the overall score in gold, with the speed readout under it
//                   — the reference's score-plus-meter corner. The segmented
//                   speed bar plays the part of its little green meter, and it
//                   is a real meter rather than a drawn one.
//   · TOP-CENTRE    the run clock, unchanged.
//   · BOTTOM-CENTRE the trick, and the points it paid underneath — the
//                   reference's "360 CROSSBONE / 1,320". Ours spells the whole
//                   LINE out with `+` separators (the `bar/UI/` frame) because
//                   the line is what the game is about, and it is
//                   bottom-anchored so a five-trick line grows UP into sky.
//   · RIGHT         the controls, one row per skill: what it does, then the
//                   key as a keycap. Bottom-anchored, one narrow column.
//   · MIDDLE-BOTTOM the balance gauge and the held-trick badge, centred, above
//                   the trick line.
//
// The combo readout is the loudest thing on screen on purpose: in a THPS-shaped
// game the line you are building IS the game, and the moment it banks or dies
// has to land harder than anything else the HUD says. Words for tricks and
// spins come from the trick book and the spine — nothing here names a move.
//
// The run clock and the run's score are the SAME readout, which is why they are
// in this file and not a second one: the score in the corner is the minute's
// score while a minute is on, and the session's the rest of the time. One big
// number, always, whatever is counting it.
//
// This file also OWNS the scoring rule. It is written out in full at
// `commitBank`, which is the code that runs it; every other layer defers to it,
// and the trick book's `COMBO_MAX_MULT` points back here.

import type { Stance } from "../skate/contracts";
// The cap comes from the trick book rather than being retyped here: the rule it
// enforces is written out beside `COMBO_MAX_MULT`, and a second copy of the
// number is how it came to be documented in one file and applied in none.
// `landedSpinName` arrives the same way and for the same reason: the callout
// and the bare-spin link have to say the number the RIDE counted, and one
// function is how they cannot drift apart.
import { comboMultiplier, landedSpinName } from "../skate/tricks";
// `RUN_SECONDS` went with the results card's eyebrow — it had exactly one
// reader, the "One minute · 1:00" line, and that line is gone. `clockText`
// stays: the live clock still needs it.
import { clockText } from "../game/run";
import type { BoardView } from "../game/leaderboard";
import { BOARD_CSS, boardHtml } from "./leaderboard";

/**
 * THE KEYCAP — the interface's only piece of furniture, and the one thing in
 * this game that is drawn as an object rather than as type.
 *
 * The player asked for the control legend's keys to "look like OLD-SCHOOL
 * KEYBOARD KEYS", and that is exactly what earns it: a key is a physical
 * thing you press, so a beige moulded cap with a lit top bevel, a darker side
 * wall and a shadow on the world says "press this" in a way that a letter in a
 * box never does. It is NOT a backing plate (AGENTS.md rule 6) — nothing is
 * printed over it that would read without it. The cap IS the widget, and its
 * silhouette is the ornament.
 *
 * Exported so `menu.ts` can `import { KEYCAP_CSS } from "./hud"` and print the
 * controls screen's key column with the same object instead of a second visual
 * language for the same fact. Size it with `--cap` (the cap's height; the
 * legend and the padding are both derived from it) — the HUD runs it small at
 * ~20px, a full controls screen wants ~34px.
 *
 * `border-radius`, never `clip-path`: a CSS-cut corner shears its own bevel.
 *
 * The other two exports beside it are the same idea one level up: `SCREEN_CSS`
 * and `ChoiceList` are the vocabulary the end-of-run card and `pause.ts` are
 * both built out of, so the two screens cannot drift into two art directions.
 */
export const KEYCAP_CSS = `
.keycap {
  display: inline-flex; align-items: center; justify-content: center;
  box-sizing: border-box; vertical-align: middle;
  min-width: var(--cap, 22px); height: var(--cap, 22px); padding: 0 .40em;
  font-family: "Barlow Condensed", system-ui, sans-serif;
  font-weight: 700; font-style: normal; text-transform: uppercase;
  font-size: calc(var(--cap, 22px) * .56); letter-spacing: .05em; line-height: 1;
  color: #2b2820; border-radius: 3px;
  /* Moulded ABS: a warm ivory face that darkens toward the bottom of the dish. */
  background: linear-gradient(#f6f1e2 0%, #e6ddc7 44%, #cec4aa 100%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.95),      /* the lit top edge */
    inset 1px 0 0 rgba(255,255,255,.5),
    inset -1px 0 0 rgba(120,110,88,.35),
    inset 0 -2px 0 rgba(120,110,88,.45),      /* the dish falling away */
    0 2px 0 #8b8368,                          /* the cap's side wall … */
    0 3px 0 #6b6450,                          /* … and the shadow line under it */
    0 5px 8px rgba(0,0,0,.55);                /* and the cap's shadow on the world */
  text-shadow: 0 1px 0 rgba(255,255,255,.5);
}
`;

/**
 * THE CHOICE SCREENS — one vocabulary, two screens.
 *
 * The end of a run and the pause card are the same kind of object: a wash over
 * the block, a heading, a hairline rule, and a short list of things the player
 * can choose with the keyboard or the mouse. They are built out of these
 * classes rather than out of two private stylesheets, because a pause card
 * styled in one world under a results card styled in another is the exact bug
 * the style contract at the top of this file exists to stop.
 *
 * STILL NO PLATES (AGENTS.md rule 6). What darkens the world behind the type is
 * a radial WASH with no straight edge in it anywhere, the same device the title
 * screen uses for its "red panel". The rules are hairlines that fade out at both
 * ends — they separate two readouts, they do not enclose one.
 *
 * Type follows the contract exactly: Big Shoulders 800 for the results heading,
 * Anton for PAUSED and for the choices themselves, Syne Mono for every number,
 * Barlow Condensed for every label under one.
 *
 * Injected by `installScreenStyles()` rather than pasted into this file's own
 * stylesheet, so `pause.ts` can stand its screen up without the HUD being
 * on screen at all.
 */
export const SCREEN_CSS = `
.sk-screen {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: clamp(2px, .5vh, 7px); text-align: center; padding: 4vh 4vw;
  font-family: "Barlow Condensed", system-ui, sans-serif; color: #fff;
  font-variant-numeric: tabular-nums; user-select: none;
  opacity: 0; transition: opacity .3s ease;
}
.sk-screen.is-on { opacity: 1; }
/* The darkening, and it is a wash and not a panel: a radial field that is gone
   before it reaches any edge of the frame, so nothing on these screens is
   sitting on a rectangle. */
.sk-wash {
  background: radial-gradient(88% 74% at 50% 50%,
    rgba(5,7,12,.86), rgba(5,7,12,.5) 58%, rgba(5,7,12,0) 88%);
}
/* Entrance choreography — stamp --i per element and they arrive in order. A
   screen whose parts all appear at once reads as a dialog box; one that lands
   heading-first reads as the game talking. */
.sk-screen .sk-in {
  opacity: 0; transform: translateY(12px);
  transition: opacity .32s ease, transform .32s ease;
  transition-delay: calc(var(--i, 0) * 70ms);
}
.sk-screen.is-on .sk-in { opacity: 1; transform: none; }
.sk-eyebrow {
  font-size: clamp(9px, 1.05vw, 13px); letter-spacing: .34em; font-weight: 700;
  text-transform: uppercase; color: rgba(255,255,255,.55);
  text-shadow: 1px 2px 0 rgba(0,0,0,.85);
}
/* The results heading. Big Shoulders, because Anton is too round at this size
   over a word the player reads once a minute for the rest of the session. */
.sk-head {
  font-family: "Big Shoulders Display", Anton, Impact, sans-serif; font-weight: 800;
  text-transform: uppercase; font-size: clamp(26px, 5vw, 62px); letter-spacing: .08em;
  line-height: 1; color: #ffd23d; text-shadow: 0 3px 9px rgba(0,0,0,.9), 0 0 1px #000;
}
/* …and the one that SHOUTS. PAUSED is Anton by the contract at the top of this
   file, and it is the loudest thing on any screen in the game. */
.sk-shout {
  font-family: Anton, Impact, sans-serif; text-transform: uppercase;
  font-size: clamp(38px, 7.6vw, 92px); line-height: .96; letter-spacing: .03em;
  color: #fff;
  text-shadow: 0 0 1px #000, 3px 4px 0 rgba(0,0,0,.85), -1px -1px 0 rgba(0,0,0,.6);
}
/* A hairline that fades out at both ends. It has no corners and encloses
   nothing — it is the thing that separates the score from the board without
   drawing a box round either of them. */
.sk-rule {
  width: min(430px, 62vw); height: 1px; flex: none;
  margin: clamp(5px, 1.1vh, 13px) 0;
  background: linear-gradient(90deg,
    rgba(255,210,61,0), rgba(255,210,61,.7), rgba(255,210,61,0));
}
/* THE CHOICES. Bare stencil words, no plate, the title screen's own treatment:
   the selected one grows, leans, glows gold and grows a chevron. One highlight
   is up at all times, and it is the SAME state for the keyboard and the mouse —
   hovering moves the highlight rather than lighting a second one. */
.sk-choices {
  display: flex; align-items: flex-start; justify-content: center; flex-wrap: wrap;
  gap: clamp(16px, 4vw, 58px); margin-top: clamp(8px, 1.8vh, 22px);
}
.sk-choices.col {
  flex-direction: column; align-items: center; gap: clamp(3px, .9vh, 11px);
}
.sk-choice {
  position: relative; border: 0; background: transparent; cursor: pointer;
  padding: .04em .5em; color: rgba(255,255,255,.86);
  font-family: Anton, Impact, sans-serif; text-transform: uppercase;
  font-size: clamp(21px, 3.1vw, 38px); line-height: 1.06; letter-spacing: .03em;
  text-shadow: 2px 3px 0 rgba(0,0,0,.85);
  transition: transform .16s ease, color .16s ease, text-shadow .16s ease;
}
.sk-choice em {
  display: block; font-style: normal; margin-top: .5em;
  font-family: "Barlow Condensed", system-ui, sans-serif; font-weight: 700;
  font-size: .3em; letter-spacing: .26em; color: rgba(255,255,255,.5);
}
.sk-choice.is-on, .sk-choice:hover, .sk-choice:focus-visible {
  color: #fff; outline: none; transform: scale(1.06) rotate(-1.4deg);
  text-shadow: 2px 3px 0 rgba(0,0,0,.85), 0 0 26px rgba(255,210,61,.85);
}
.sk-choice.is-on em { color: rgba(255,210,61,.85); }
.sk-choice.is-on::before {
  content: "\\25B8"; position: absolute; left: -.5em; color: #ffd23d;
}
.sk-choice:active { transform: scale(.98) rotate(-1.4deg); }
/* pointer-events INHERITS, and the HUD's root turns it off so the canvas stays
   playable — so only a SHOWN screen hands it back, and only on the words that
   are actually controls. A faded-out button that still eats clicks over the
   middle of the screen is a control the player cannot see. */
.sk-screen.is-on .sk-choice { pointer-events: auto; }
.sk-hint {
  margin-top: clamp(7px, 1.5vh, 17px);
  font-size: clamp(9px, 1.05vw, 13px); letter-spacing: .26em; font-weight: 700;
  text-transform: uppercase; color: rgba(255,255,255,.5);
  text-shadow: 1px 2px 0 rgba(0,0,0,.85);
}
`;

let screenStyleTag: HTMLStyleElement | null = null;

/** Put `SCREEN_CSS` in the document, once, however many screens ask for it. */
export function installScreenStyles(): void {
  if (screenStyleTag) return;
  screenStyleTag = document.createElement("style");
  screenStyleTag.textContent = SCREEN_CSS;
  document.head.appendChild(screenStyleTag);
}

/**
 * ONE KEYBOARD, ONE OWNER.
 *
 * Two screens in this game take the arrow keys — the results card and the pause
 * card — and the pause card can open ON TOP of the results card. Both of them
 * are taking those keys away from something else that is already listening:
 * `SkateInputSource` steers on window, `RunGame` dismisses the results on
 * document, and the boot pauses on Escape. The only place a screen can win that
 * argument is the WINDOW's capture phase, which runs before every one of them.
 *
 * So a screen CLAIMS the keys it owns. The claim returns true for a key it took
 * — that key is then stopped dead and never reaches the ride — and false for
 * everything else, which flows on untouched. That is what keeps W riding away
 * from the results card while the arrows are choosing on it.
 *
 * The newest claim wins, which is the whole reason this is a stack and not a
 * flag: the pause card opens second and has to take the arrows off a results
 * card that is still up behind it.
 */
type KeyClaim = (e: KeyboardEvent) => boolean;

const keyClaims: KeyClaim[] = [];
let keyClaimsBound = false;

function runTopKeyClaim(e: KeyboardEvent): void {
  const top = keyClaims[keyClaims.length - 1];
  if (!top || !top(e)) return;
  e.preventDefault();
  e.stopPropagation();
}

/** Take the keyboard for as long as a screen is up. Returns the release. */
export function claimKeys(claim: KeyClaim): () => void {
  keyClaims.push(claim);
  if (!keyClaimsBound) {
    keyClaimsBound = true;
    window.addEventListener("keydown", runTopKeyClaim, true);
  }
  return () => {
    const i = keyClaims.indexOf(claim);
    if (i >= 0) keyClaims.splice(i, 1);
  };
}

/** One thing a screen can offer: the word, the line under it, and what it runs. */
export interface Choice {
  label: string;
  /** Three words saying what it does. Optional, and worth it on every screen. */
  note?: string;
  act: () => void;
}

/**
 * A list of choices that answers the keyboard and the mouse with ONE highlight.
 *
 * Both key pairs walk the same list whichever way it is drawn: up and screen-
 * LEFT step back, down and screen-RIGHT step forward, which is the direction
 * convention the rest of this game keeps (AGENTS.md rule 17). Enter takes the
 * highlighted one. Hovering MOVES the highlight rather than lighting a second
 * one, so there is never a moment where the screen is showing two answers.
 *
 * Space is deliberately not a confirm key: it is the ollie, and the player is
 * still rolling underneath the results card.
 */
export class ChoiceList {
  readonly el: HTMLDivElement;
  private buttons: HTMLButtonElement[] = [];
  private acts: (() => void)[] = [];
  private at = 0;

  constructor(choices: readonly Choice[], column = false) {
    this.el = document.createElement("div");
    this.el.className = `sk-choices${column ? " col" : ""}`;
    choices.forEach((choice, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sk-choice";
      b.innerHTML = `${esc(choice.label)}${choice.note ? `<em>${esc(choice.note)}</em>` : ""}`;
      b.addEventListener("mouseenter", () => this.select(i));
      b.addEventListener("click", () => {
        // A clicked button keeps browser focus, so the next gameplay Enter would
        // natively press it a second time. Blur BEFORE the action runs.
        b.blur();
        this.select(i);
        this.acts[i]?.();
      });
      this.buttons.push(b);
      this.acts.push(choice.act);
      this.el.appendChild(b);
    });
    this.select(0);
  }

  /** Move the highlight. One is lit at all times, and it wraps. */
  select(i: number): void {
    if (this.buttons.length === 0) return;
    this.at = (i + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, j) => b.classList.toggle("is-on", j === this.at));
  }

  /** Take the highlighted one. */
  confirm(): void {
    this.buttons[this.at]?.blur();
    this.acts[this.at]?.();
  }

  /** True when the key was this list's — see `claimKeys` for what that means. */
  handleKey(e: KeyboardEvent): boolean {
    switch (e.code) {
      case "ArrowUp":
      case "ArrowLeft":
        this.select(this.at - 1);
        return true;
      case "ArrowDown":
      case "ArrowRight":
        this.select(this.at + 1);
        return true;
      case "Enter":
      case "NumpadEnter":
        this.confirm();
        return true;
      default:
        return false;
    }
  }
}

const CSS = `
#hud {
  position: fixed; inset: 0; pointer-events: none;
  font-family: "Barlow Condensed", system-ui, sans-serif;
  color: #fff; user-select: none; overflow: hidden;
  /* A score ticking 9 → 10 → 100 must not shove the speed bar sideways. */
  font-variant-numeric: tabular-nums;
  --gold: #ffd23d;
  --rail: #59c8ff;
  --bail: #ff5b47;
  --bone: #eafff2;
  --ink: 0 2px 7px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.85);
  --ink-hard: 0 0 1px #000, 2px 3px 0 rgba(0,0,0,.85);
}
#hud .stencil {
  font-family: Anton, Impact, sans-serif; text-transform: uppercase;
  letter-spacing: 0.01em;
  text-shadow: 0 0 1px #000, 2px 3px 0 rgba(0,0,0,0.85), -1px -1px 0 rgba(0,0,0,0.6);
}
/* THE TWO WORKHORSE CLASSES, and between them they cover every string on
   screen. .num is the readout; .cap is the word that tells you what the
   readout beside it IS. Written as classes rather than repeated per widget so
   the pair can be lifted into menu.ts verbatim.

   BOTH ARE SYNE MONO NOW. .cap used to be the Barlow half of the pair, which
   meant every counter on this screen was printed in two faces — the number in
   the instrument face and the word naming it in a condensed one, an inch
   apart. The player has asked for one font language all session and named the
   clock's own caption to make the point, so the caption follows its number.
   What still separates them is what always did the real work: SIZE, opacity
   and tracking.

   Syne Mono has ONE weight, so neither sets one — a 700 here is a browser
   faking a bold that does not exist. And the tracking comes down: .28em was
   drawn for a condensed face, and on a face this wide it turns a four-letter
   caption into a readout of its own. */
#hud .num {
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace;
  font-weight: 400; letter-spacing: .01em; text-shadow: var(--ink);
}
#hud .cap {
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace;
  font-weight: 400; text-transform: uppercase; letter-spacing: .14em;
  text-shadow: 1px 2px 0 rgba(0,0,0,.85);
}
${KEYCAP_CSS}
/* THE TRICK READOUT — bottom centre, and it is the thing the player asked for
   off the Tony Hawk's Underground frame: the trick, and the points it paid
   directly underneath. Theirs says "360 CROSSBONE / 1,320"; ours spells the
   whole LINE out with + separators (the bar/UI/ frame) because in this
   game the line, not the trick, is what you are building.

   It sits ON THE FLOOR of the screen — bottom 4.5vh — for two reasons. The
   player put it there, and the camera came in to 4.5 m on 2026-07-29, which
   put the skater 265 px tall in a 1280x800 frame instead of 150: the old
   26vh slot is now his shoulders. Bottom-anchored, so a five-trick line grows
   UPWARD past him into sky rather than downward off the screen.

   Nothing has a plate behind it — the type lives over the world on its own
   shadow, which is the whole look.

   The padding is what keeps the line out of the control rail on the right.
   Symmetric, so the text stays optically centred; only wide screens pay it,
   because that is the only place the rail is drawn. */
#readout {
  position: absolute; left: 0; right: 0; bottom: 4.5vh;
  display: flex; flex-direction: column; align-items: center;
  text-align: center; padding-inline: 3vw;
}
@media (min-width: 700px) { #readout { padding-inline: clamp(150px, 17vw, 250px); } }
/* THE THUMBS' ROOM — and the one padding in this HUD that is deliberately NOT
   symmetric, because on a phone the frame is not either.

   The keycap rail this padding was sized to clear is display:none on a coarse
   pointer. What is in the right corner instead is the touch layer's trick
   cluster, whose leftmost visible cap edge on an 844 px landscape phone is
   x 656 — 188 px in from the right, where the padding gives 150. So a four-link
   line ran 38 px in behind the FLIP button. 200 px clears it with 12 px of air.

   The left is left alone: the stick's visible base circle ends at x 138 and the
   padding already starts at 150. And the asymmetry is the BETTER centring, not a
   compromise — the free band between the two thumbs runs x 162…648, centre 405,
   and 150/200 puts the line's centre at 397 where symmetric padding would put it
   at 422, on the middle of a screen the player cannot use the edges of. */
@media (pointer: coarse) { #readout { padding-right: 200px; } }
#combo { width: 100%; }
/* Syne Mono — the instrument face, and the whole point of this rebuild: the
   reference's lettering is a wide squarish techno face and Big Shoulders'
   condensed forms read as a different game. It has ONE weight and it is WIDE,
   so the size ladder below starts lower and steps harder than the condensed
   one it replaces: the same fourteen-callout line is close to twice the
   running width it used to be. */
#combo .chain {
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace; font-weight: 400;
  text-transform: uppercase; letter-spacing: 0;
  font-size: clamp(15px, 2.4vw, 32px); line-height: 1.24;
  text-shadow: var(--ink);
  overflow-wrap: break-word;
}
#combo .chain.w3 { font-size: clamp(13px, 2vw, 26px); }
#combo .chain.w4 { font-size: clamp(12px, 1.7vw, 22px); }
/* A line does not stop at four. The multiplier caps at ten and a player who
   knows that will chase ten, so the type has to keep making room: fourteen
   callouts is roughly 170 characters, and in Syne Mono that is five lines at
   w4. Two more steps down and the same line is three lines tall and still
   legible over the skater's shoulder. */
#combo .chain.w6 { font-size: clamp(11px, 1.35vw, 18px); }
#combo .chain.w8 { font-size: clamp(10px, 1.1vw, 14px); line-height: 1.3; }
/* THE COLOUR CODE, and it is the game's own categories rather than decoration:
   blue is everything you have to BALANCE (the grinds and the manuals), gold is
   everything that came out of turning (a spin, and riding away switch), white
   is the flips and the airs. A player learns it without being told, because
   the blue links are the ones with a meter under them. */
#combo .chain b { font-weight: inherit; }
#combo .chain b.t-grind { color: #59c8ff; }
#combo .chain b.t-spin { color: #ffd23d; }
/* The + between two tricks. It sets no weight: this line is Syne Mono, Syne
   Mono has one, and a 700 here was the browser synthesising a fake bold on the
   one glyph in the readout that is supposed to RECEDE. The opacity is what
   sits it back, and it does the job on its own. */
#combo .chain i { font-style: normal; font-weight: 400; color: rgba(255,255,255,.72); padding: 0 .04em; }
#combo .chain.lose { color: #ff5b47; text-decoration: line-through;
  text-decoration-thickness: 0.055em; }
#combo .chain.bank { color: #ffe884; }
/* A banked or lost line is ONE colour — the state of the whole line is the
   thing being said, so the per-trick code stands down for it. */
#combo .chain.bank b, #combo .chain.bank i,
#combo .chain.lose b, #combo .chain.lose i { color: inherit; }
#combo .chain.build { animation: link-pop .26s cubic-bezier(.2,1.5,.4,1); }
#combo .chain.bank { animation: link-bank .8s ease-out forwards; }
#combo .chain.lose { animation: link-lose .8s ease-out forwards; }
@keyframes link-pop {
  0%   { transform: scale(1.14); }
  62%  { transform: scale(0.98); }
  100% { transform: scale(1); }
}
@keyframes link-bank {
  0%   { transform: scale(1); opacity: 1; }
  18%  { transform: scale(1.12); opacity: 1; }
  100% { transform: translateY(-30px) scale(1.02); opacity: 0; }
}
@keyframes link-lose {
  0%   { transform: translateX(0); opacity: 1; }
  14%  { transform: translateX(-9px); }
  30%  { transform: translateX(8px); }
  46%  { transform: translateX(-5px); }
  62%  { transform: translateX(3px); }
  100% { transform: translateY(9px); opacity: 0; }
}
/* THE POINTS THAT CAME OUT — the reference's "1,320", directly under the
   trick that paid it. Same face as the trick name, a size down: it is the
   number, not another word.

   IT IS WHITE, and that is the player's call: *"we don't need that yellow
   colour, let it just be white — specifically the numbers like +200."* The
   gold it used to bank in was decoration and nothing else — a 200-point shuv
   and a 20,000-point line printed in exactly the same yellow, so the colour
   never told him anything the digits were not already saying. White is the
   contract's "the live, the lit", it is brighter than the gold was, and it now
   separates the payout from the pale-gold chain settling above it instead of
   blending into it.

   The ONE gold left in this readout is the MULTIPLIER, and it stays because it
   is the only thing here that is not a payout: it appears only when a line is
   actually multiplying, it sits against the white running sum in the same row,
   and that contrast IS the read — 1,120 in white, x3 in gold. Emphasis where
   it is earned, everything ordinary in white. */
#combo .tally {
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace; font-weight: 400;
  letter-spacing: .02em; font-size: clamp(12px, 1.6vw, 22px); line-height: 1.5;
  text-shadow: var(--ink);
}
#combo .tally .mult { color: var(--gold); margin-left: .45em; font-size: 1.1em; }
#combo .tally.bank { color: #fff; }
#combo .tally.lose { color: var(--bail); }
/* THE STREAK — "3 CLEAN IN A ROW", and the other line the player named. It is
   a COUNT with a word after it, which makes it the instrument face's by the
   rule at the top of this file rather than by exception. Same three
   corrections as the clock's caption: no font-weight, because there is only
   one; tracking down from .28em, because the face is already wide and this
   string is long; and a floor of 11px instead of 10. It is a full-width line
   in a centred column, so nothing moves when the number goes 9 → 10. */
#streak {
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace;
  font-weight: 400;
  font-size: clamp(11px, 1.2vw, 14px); letter-spacing: .14em;
  opacity: 0; transition: opacity .2s; text-shadow: 1px 2px 0 rgba(0,0,0,.85);
  margin: .3em 0 0;
}
#streak.show { opacity: .85; }
/* The results card is the readout for as long as it is up, and the live one
   would print straight through the board underneath it — the run can end with
   a line still on screen, and the two of them land in the same place. The
   control rail goes with it: nobody is reading a legend while they are reading
   their own score. And the corner score goes too, because the card IS that
   number finishing its sentence — two copies of one score fighting for the same
   eye is how a player ends up reading neither. */
#hud.results-up #readout, #hud.results-up #controls, #hud.results-up #left {
  opacity: 0; transition: opacity .3s ease;
}
/* THE LEFT RAIL — the overall score, and the speed under it.
   This is the reference frame's top-left corner: the score in yellow with a
   small segmented meter beneath it. Ours is the SPEED bar, which is a meter
   the game already drives — the reference's second thin bar is a THUG goal
   meter this game has no mechanic for, and a drawn widget with nothing behind
   it is a lie in the shape of a HUD.
   Laid out in flow inside one absolutely-positioned column, so the speed never
   has to be nudged by a magic offset when the score changes size. */
#left {
  position: absolute; left: 3.2vw; top: 3vh;
  display: flex; flex-direction: column; align-items: flex-start;
  gap: clamp(4px, .8vh, 9px);
}
/* SCORE / RUN SCORE. The floor is 11px and not 9: nine is under the size Syne
   Mono stops resolving at, and this caption was the smallest the face is set
   anywhere in the game. The .34em tracking that came with Barlow is left to
   .cap's .14em — the word is above the number, so a wider caption pushes
   nothing (the left rail is align-items: flex-start). */
#score .l {
  display: block; font-size: clamp(11px, 1.05vw, 13px);
  opacity: .72; margin-bottom: .3em;
}
#score .n {
  display: block; font-size: clamp(20px, 3vw, 40px); line-height: 1;
  color: var(--gold);
}
/* THE RUN CLOCK. Digits and nothing else, in the instrument face, one line with
   the score across the top of the frame — the reference's top band. No track,
   no frame, no plate: the one minute is the loudest fact on the screen for as
   long as it is running, and it says so by going gold and then red rather than
   by growing furniture.

   THE FACE IS DECLARED HERE, on the id, and NOT left to the .num class the
   markup carries. setRunClock rewrites this element's entire className every
   time the digits change state, and that silently dropped .num on the very
   first tick — so the clock the player actually looks at spent the whole minute
   in Barlow with no ink shadow under it, while the 1:00 sitting in the static
   markup was correct and nobody could see why. setRunClock keeps .num now, and
   this rule is the belt to that braces: the clock cannot fall out of the
   instrument face again whatever a future class does to it.

   IT CANNOT JUDDER AS IT TICKS. Syne Mono is monospace and clockText always
   prints m:ss, so 0:59 and 0:52 and 1:00 are four glyphs at four identical
   advances — there is no width to change. The tabular-nums the HUD root sets
   is what covers the FALLBACK stack, whose faces are proportional, and the
   element is a full-width absolutely-positioned band centring its own text, so
   even a fallback that did shift would move nothing but the clock's own
   centring by a fraction of a glyph. */
#runclock {
  position: absolute; left: 0; right: 0; top: 3vh; text-align: center;
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace;
  font-weight: 400; letter-spacing: .01em;
  font-size: clamp(24px, 3.8vw, 50px); line-height: 1;
  opacity: 0; transition: opacity .25s;
}
#runclock.on { opacity: 1; }
/* ON THE CLOCK — the caption the player named in the same breath as the digits
   above it. Three things changed with the face. The 700 is gone rather than
   left for the browser to fake, because Syne Mono has one weight. The .34em
   tracking Barlow wanted is down to .16em, because this face is already wide
   and twelve tracked characters were about to out-measure the clock they sit
   under. And the size is its own clamp instead of .26em of the clock: .26em
   bottomed out near 6px on a phone, and Syne Mono stops reading around 11. */
#runclock em {
  display: block; font-style: normal;
  font-size: clamp(11px, 1.15vw, 14px); letter-spacing: .16em;
  opacity: .72; margin-top: .55em;
  text-shadow: 1px 2px 0 rgba(0,0,0,.85);
}
#runclock.warn { color: var(--gold); }
#runclock.last { color: var(--bail); animation: clock-beat .5s steps(2, end) infinite; }
@keyframes clock-beat { from { opacity: 1; } to { opacity: .4; } }
/* THE SPEED, on its own, in the BOTTOM-LEFT corner, and with no bar.
   The player's call: "we don't need speed line, only number, put it at the left
   bottom side and mb even hide on mobiles." So the segmented meter is gone from
   the markup, not hidden — a widget nobody wants should not still be costing
   twenty DOM nodes and a per-frame loop. What is left is the number and its
   unit, as far from the score as the frame allows, which is also what stops the
   two biggest numbers on screen from being read as one readout.
   Hidden under 700px: a phone has the fewest pixels and the least need for it —
   speed is a thing you FEEL, and the SWITCH badge, which is a fact you cannot
   feel, stays up on the left rail where the speed used to be. */
#speed { display: flex; align-items: baseline; gap: 0.3em; }
#speedo {
  position: absolute; left: 3.2vw; bottom: 4.5vh;
  display: flex; align-items: baseline; gap: 0.3em;
}
#speedo .n { font-size: clamp(20px, 2.6vw, 34px); line-height: 1; }
/* KM/H — the unit on a counter, so it wears the counter's face. Same 11px
   floor as SCORE, and the tracking is .cap's. It sits to the RIGHT of a number
   whose digit COUNT changes (9 → 10 → 40), so it already moved with the speed
   before this pass and still does; the whole readout is pinned to the left
   corner and pushes nothing but itself. */
#speedo .u { font-size: clamp(11px, 1.05vw, 13px); opacity: .72; }
@media (max-width: 699px) { #speedo { display: none; } }
/* …and on a phone whatever the width, which is the second half of the player's
   own note about this number ("mb even hide on mobiles"). A landscape phone is
   844 px wide, so the 699 px rule above never catches the orientation this game
   is actually played in — and the touch layer's steering stick is a 152 px square
   in this exact corner, 10 px off both edges, its base circle spanning x 34…138
   and y 252…356. The digits sit at (27, ~360) with the thumb on top of them. */
@media (pointer: coarse) { #speedo { display: none; } }
/* SWITCH keeps its slot beside the speed rather than following the reference
   under the balance meter: it is a fact about how he is ROLLING, and it reads
   where the rest of the rolling is reported. Same face as the numbers, because
   it is a state and not a label. */
#speed .sw {
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace;
  color: var(--gold); font-size: clamp(9px, 1.05vw, 12px); letter-spacing: .1em;
  margin-left: .7em; opacity: 0; transition: opacity .18s;
  text-shadow: var(--ink);
}
#speed .sw.on { opacity: .95; }
/* #speedbar used to live here — the segmented meter under the score, the
   thing this HUD borrowed from the reference's own little green bar. Removed
   2026-07-29 at the player's request; the number alone says it. */
/* Centred with auto margins, never a centring transform — the gauge's own
   transform is the lean, and a translate(-50%) would be the first thing it
   threw away. */
/* Raised from 17vh to 25vh in the 2026-07-29 rebuild: the trick readout came
   down to the floor of the screen, and a four-link line bottom-anchored at
   4.5vh tops out around 22vh. The gauge has to clear it, because the gauge is
   the one thing on screen a player is watching in real time — the line can be
   read late, the needle cannot. This is also what retired the old
   "hide the legend while the gauge is up" hack: the control rail is a narrow
   column on the right edge now and the gauge is centred, so they no longer
   share any pixels and nothing has to be hidden to make room. */
#balance {
  position: absolute; left: 0; right: 0; margin-inline: auto;
  bottom: 25vh; width: clamp(170px, 24vw, 320px);
  opacity: 0; transform: translateY(8px); transition: opacity .16s, transform .16s;
}
#balance.show { opacity: 1; transform: none; }
#balance .gauge {
  position: relative; height: 12px; display: flex; gap: 3px;
  transition: transform .08s linear;
}
#balance .gauge i {
  flex: 1; background: rgba(255,255,255,0.2); transform: skewX(-22deg);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.6);
}
/* Square on the rail is the tick you steer back to, so it stands proud of the
   track even when it is not lit. */
#balance .gauge i.mid { background: rgba(255,255,255,0.55); transform: skewX(-22deg) scaleY(1.4); }
#balance .gauge i.on { background: #eafff2; }
#balance .gauge i.hot { background: #ffd23d; }
#balance .gauge i.max { background: #ff5b47; }
/* The held-trick badge shares the balance meter's slot: a grab is airborne, a
   grind is on a rail and a manual is on the floor, so only one of them is ever
   up. Same auto-margin centring, same reason — no centring transform. */
#held {
  position: absolute; left: 0; right: 0; margin-inline: auto; text-align: center;
  bottom: calc(25vh + 26px); width: max-content; max-width: 60vw;
  font-family: Anton, Impact, sans-serif; text-transform: uppercase;
  font-size: clamp(15px, 2vw, 24px); letter-spacing: .06em; color: #ffd23d;
  text-shadow: 0 0 1px #000, 2px 3px 0 rgba(0,0,0,.85);
  opacity: 0; transform: rotate(-2.4deg) translateY(6px);
  transition: opacity .12s, transform .12s;
}
#held.show { opacity: 1; transform: rotate(-2.4deg); animation: held-breathe .5s ease-in-out infinite alternate; }
/* It is a key being HELD, so it never sits still — the moment it stops moving
   is the moment the player has let go of it. */
@keyframes held-breathe { from { transform: rotate(-2.4deg) scale(1); } to { transform: rotate(-2.4deg) scale(1.06); } }
#held em { font-style: normal; display: block; font-family: "Barlow Condensed", system-ui, sans-serif;
  font-size: .5em; letter-spacing: .3em; color: rgba(255,255,255,.8); font-weight: 700; }
#balance .needle {
  position: absolute; top: -6px; bottom: -6px; width: 5px; margin-left: -2.5px;
  background: #fff; transform: skewX(-22deg);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.75), 0 0 12px rgba(255,255,255,.5);
}
#balance.hot .needle { background: #ffd23d; box-shadow: 0 0 0 1px rgba(0,0,0,.75), 0 0 14px rgba(255,210,61,.8); }
#balance.max .needle { background: #ff5b47; animation: needle-panic .18s steps(2) infinite; }
@keyframes needle-panic { from { opacity: 1; } to { opacity: .45; } }
/* THE CONTROL RAIL — right edge, one row per skill: what it does, then the
   key it does it with, drawn as a keycap.

   It replaces a legend that printed every binding in the game as two wrapped
   rows spanning 56vw of the bottom of the screen — which is most of the play
   area, and which is why it had to be hidden whenever the balance gauge came
   up. This is a narrow column pinned to the right edge instead: it reads as a
   list of skills rather than a paragraph of keys, it never crosses the centre,
   and the trick line's own padding keeps clear of it.

   The full manual is the menu's controls screen. This is the reminder. */
#controls {
  position: absolute; right: 3vw; bottom: 4.5vh;
  display: grid; grid-template-columns: auto auto; align-items: center;
  justify-items: end; column-gap: clamp(8px, 1vw, 16px); row-gap: clamp(3px, .6vh, 7px);
  --cap: clamp(17px, 1.7vw, 22px);
}
#controls .s {
  font-size: clamp(9px, 1.05vw, 12px); letter-spacing: .2em; font-weight: 700;
  text-transform: uppercase; color: rgba(255,255,255,.86);
  text-shadow: 1px 2px 0 rgba(0,0,0,.85);
}
/* HOLD is a property of the binding and not a second skill, so it rides in
   front of the word at half the presence. The GRIND key is why the marker
   exists at all, whichever key that currently is — E as of the second
   2026-07-29 swap: it is the only binding in the game whose ABSENCE is
   invisible. Every other one does nothing until you press it, and this one
   silently decides whether a rail catches you, so a player who never learns it
   rides over every ledge in the level and concludes the grinds are broken.
   The key moves; the reason the marker is there does not, which is why this
   comment no longer spells the letter out twice. */
#controls .s em {
  font-style: normal; opacity: .62; font-size: .88em; margin-right: .5em;
}
#controls .k { display: flex; gap: 3px; align-items: center; }
/* Nothing anywhere else in the game is drawn as an object, so the caps carry
   the whole "these are things you press" idea on their own — see KEYCAP_CSS. */
@media (max-width: 699px) { #controls { display: none; } }
/* A phone has no keyboard, and the game ships touch controls. A keycap legend
   there is a picture of hardware the player is not holding — and it is exactly
   the block that would eat a 390px screen. */
@media (pointer: coarse) { #controls { display: none; } }
#centre {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 0.5em;
  opacity: 0; transition: opacity .18s; text-align: center;
}
#centre.show { opacity: 1; }
#centre .big { font-size: clamp(40px, 8vw, 110px); line-height: 0.9; }
#centre .sub { font-size: clamp(13px, 1.7vw, 20px); letter-spacing: .2em; font-weight: 700; opacity: .9; }
#centre.pause { background: rgba(8,10,20,0.55); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
/* THE END OF A RUN — the minute's score, where it stands in the world, and the
   two things the player can do about it.
   It does NOT stop the game: the sim is still running under it, the player is
   still rolling, and any ride key puts it away and leaves him skating. The
   darkening is the shared radial wash (see SCREEN_CSS) rather than a panel, so
   nothing on this screen is sitting on a plate — the rules are hairlines that
   fade out at both ends and the choices are bare stencil words. */
#results .r-score {
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace; font-weight: 400;
  font-size: clamp(34px, 7.2vw, 96px); line-height: 1.06; letter-spacing: .01em;
  color: var(--gold); text-shadow: 0 4px 14px rgba(0,0,0,.92), 0 0 2px rgba(0,0,0,.85);
  animation: score-land .5s cubic-bezier(.2,1.4,.4,1);
}
@keyframes score-land { 0% { transform: scale(1.22); opacity: .2; } 100% { transform: scale(1); opacity: 1; } }
/* The word under the big number, so the biggest thing on screen is never an
   unlabelled quantity — and therefore the same object as ON THE CLOCK: a
   caption belonging to a counter, in the counter's face. */
#results .r-scorelab {
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace;
  font-weight: 400;
  font-size: clamp(11px, 1.05vw, 13px); letter-spacing: .16em;
  text-transform: uppercase; color: rgba(255,255,255,.6);
  text-shadow: 1px 2px 0 rgba(0,0,0,.85);
}
/* The world's answer — NEW BEST, the standing best, the world rank. It arrives
   a network round trip after the score does and it is empty until it lands, so
   it takes no room at all until it has something true to say. */
/* It prints YOUR BEST 146,176 and WORLD RANK 7 — two numbers and the words
   that index them — so it is a readout and not a caption, and it was the last
   place on this card still setting a score in a different face from the score
   above it. */
#results .r-sub {
  margin-top: .7em;
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace;
  font-weight: 400;
  font-size: clamp(11px, 1.4vw, 16px); letter-spacing: .12em;
  text-transform: uppercase; color: rgba(255,255,255,.78);
  text-shadow: 1px 2px 0 rgba(0,0,0,.85);
}
#results .r-sub:empty { display: none; }
/* NEW BEST carries on COLOUR alone. It used to lean on a 700 as well, and in a
   one-weight face that is a browser drawing a fake bold beside real letters. */
#results .r-sub b { color: var(--gold); font-weight: 400; }
/* THE MINUTE'S BIGGEST LINE, in the words the combo readout printed for it and
   worth exactly what the bank paid — this is the same arithmetic, remembered,
   never a second score computed on a second screen. */
/* The BEST LINE caption. Its two children were already Syne Mono — the trick
   words and the payout — so leaving the label in Barlow set one row of this
   card in two faces with a flex gap between them. It wraps, and the card is
   centred, so the wider face costs nothing but a line on a narrow screen. */
#results .r-best {
  display: flex; align-items: baseline; justify-content: center; flex-wrap: wrap;
  gap: .35em .9em; max-width: min(780px, 90vw); margin-top: .7em;
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace;
  font-weight: 400;
  font-size: clamp(11px, 1.05vw, 13px); letter-spacing: .16em;
  text-transform: uppercase; color: rgba(255,255,255,.5);
  text-shadow: 1px 2px 0 rgba(0,0,0,.85);
}
#results .r-best b, #results .r-best em {
  font-family: "Syne Mono", "Big Shoulders Display", Impact, monospace;
  font-weight: 400; font-style: normal; letter-spacing: .01em;
  font-size: clamp(12px, 1.5vw, 19px); text-shadow: var(--ink);
}
#results .r-best b { color: var(--bone); }
/* The best line's payout. White, not gold, and it is the SAME rule the player
   gave for the chain's tallies: "the numbers like +200 and so on" — this is one
   of those numbers, just on the card instead of in the corner. It reads against
   the bone trick-words beside it on WEIGHT and size, which is what separated
   them before the colour was ever asked to. */
#results .r-best em { color: #fff; }
/* The r-title rule — the GLOBAL TOP FIVE heading over the board — was deleted
   with the rest of the card's subtext. The board still reads without it: it is
   five rows of names and scores, and nothing else on screen looks like that.
   (No backticks in this comment on purpose. A backtick inside a CSS comment
   inside a template literal ends the literal, and it has now broken this exact
   file four times.) */
/* The board wants a little air now that no heading is holding it off the row
   above, and that air used to be the heading's own margin. It is a gap and it
   draws nothing. */
#results .r-board { margin-top: clamp(10px, 2vh, 24px); }
/* A laptop lid at 1280x720 with the browser chrome taken out is under 640 px of
   picture, and the board is the part of this card the player can read on the
   title screen instead. The score, the standing and the two choices never go. */
@media (max-height: 660px) {
  #results .r-board, #results .r-best { display: none; }
}
#loader {
  position: fixed; inset: 0; background: #0d1108;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; z-index: 20; transition: opacity .5s; color: #fff;
  font-family: "Barlow Condensed", system-ui, sans-serif;
  background-size: cover; background-position: center;
}
#loader.gone { opacity: 0; pointer-events: none; }
#loader .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,8,4,.35), rgba(5,8,4,.85)); }
#loader .inner { position: relative; display: flex; flex-direction: column; align-items: center; gap: 16px; }
#loader img { width: min(46vw, 420px); height: auto; filter: drop-shadow(0 6px 14px rgba(0,0,0,.6)); }
#loader .word { font-family: Anton, Impact, sans-serif; font-size: clamp(44px, 9vw, 110px); letter-spacing: .04em;
  text-shadow: 3px 4px 0 rgba(0,0,0,0.85); }
#loader .bar { width: min(52vw, 300px); height: 5px; background: rgba(255,255,255,.16); overflow: hidden; }
#loader .bar span { display: block; height: 100%; width: 0%; background: #ffd23d; transition: width .3s; }
#loader .status { font-size: 13px; letter-spacing: .22em; text-transform: uppercase; opacity: .75; font-weight: 600; }
${BOARD_CSS}
`;

/** Odd, so one tick sits dead centre and reads as "square on the rail". */
const BALANCE_TICKS = 15;
/** Seconds a banked or lost line stays up. Matches the CSS animations. */
const SETTLE = 0.8;
/**
 * How long a landing's bank waits for a MANUAL to take the line over, seconds.
 *
 * It exists because of the order the ride has to announce things in, and that
 * order is not negotiable: a landing is decided while the state still says
 * "air", so the frame that touches down cannot also be the frame a ground trick
 * starts on. The manual is announced on the NEXT frame — which is one frame
 * too late to stop a bank that has already been paid. Landing into a manual
 * therefore closed the line and opened a fresh one under it, which is precisely
 * the one job the manual is documented to have (`HOLD_RATE`, tricks.ts) and the
 * core loop promises (DESIGN.md).
 *
 * A frame, and not a tenth of a second, is what has to be covered — but a frame
 * is 7 ms at 144 fps and the boot clamps its own step at 100 ms, so a window
 * measured in frames is a window that works on the machine it was written on.
 * 0.12 s clears the clamp with a beat to spare at any frame rate.
 *
 * What it COSTS is the flourish: "+2,136" lands an eighth of a second after he
 * rolls away instead of on the frame he does. The chain itself is already on
 * screen and does not move, so what the player sees is the payout arriving with
 * the landing rather than before he has finished reading it — and an eighth of
 * a second is under what reads as a delay at all.
 */
const BANK_GRACE = 0.12;

/**
 * THE CONTROL RAIL, as the player asked for it: the SKILL first, then the key.
 *
 * `[skill, keys, held]`. It is the short form of the menu's controls screen and
 * it has to agree with it — but it is deliberately not the same list. That
 * screen is the manual and runs to twenty-odd bindings; this is the reminder
 * you read out of the corner of your eye while you are moving, so it names ten
 * SKILLS and shows the key each one is on. The second key for a job it already
 * lists (V for push, Q for the nose manual) is on the controls screen, not
 * here — a legend that lists every alias is the wall of text this replaced.
 *
 * Three of these are corrections that shipped wrong before:
 *   · The mouse no longer needs a button held. The right-mouse gate was
 *     deleted on 2026-07-29 — looking around is plain mouse movement, and the
 *     view eases back behind him on its own after a moment of stillness. So
 *     there is no recentre row: nothing recentres it, it recentres itself.
 *   · THERE IS NO GRIND ROW, because grinding has no key: it starts when he
 *     rides onto the line, on the player's own instruction. A key legend that
 *     lists a skill with no key is the same lie as one that lists a key with no
 *     skill, so the row names what E still buys — the deck laid SIDEWAYS across
 *     a line, the one entry riding onto it cannot ask for (see
 *     `SkateModel.tryCatchGrind` and `tools/grind-auto.mjs`). MANUAL keeps
 *     Shift, from the second 2026-07-29 swap: both holds are multi-second
 *     arguments with A/D, and having ridden it the player wanted the pinky's
 *     home key under the manual.
 *   · BALANCE names A/D a second time on purpose. They are the keys that fight
 *     the gauge, and the gauge used to come up with nothing on screen naming
 *     the thing that saves it.
 */
const CONTROL_ROWS: readonly (readonly [string, readonly string[], boolean])[] = [
  ["Ride", ["W", "A", "S", "D"], false],
  ["Ollie", ["Space"], true],
  ["Flip", ["F", "G", "C"], false],
  ["Grab", ["X"], true],
  ["Slide across", ["E"], true],
  ["Manual", ["Shift"], true],
  ["Balance", ["A", "D"], false],
  ["Look around", ["Mouse"], false],
  ["Reset", ["R"], false],
  ["Pause", ["Esc"], false],
];

/**
 * Held tricks that are announced but NOT badged — see `setHeld`.
 *
 * The player's call on the manual: he does not want a MANUAL / HOLDING caption
 * up while he is riding one. It is the one hold that does not need the words —
 * the deck is stood up on its back wheels directly in front of him and the
 * balance gauge is live under the trick line, so the manual has already said
 * itself twice before the badge opens its mouth. The GAUGE is untouched: that
 * is the read he asked for and it stays exactly as it was.
 *
 * The grab keeps its badge. It is a fraction of a second long, the body has no
 * grab take of its own, and the callout is most of what tells him the reach
 * happened at all.
 *
 * Matched here, on the name the ride hands in, rather than by reading the word
 * back out of the DOM — the badge's text is a rendering, not a fact to test.
 * Uppercased, so it is the trick that is matched and not its capitalisation.
 */
const NO_HELD_BADGE = new Set(["MANUAL", "NOSE MANUAL"]);

export class Hud {
  private root: HTMLDivElement;
  private chain: HTMLDivElement;
  private tally: HTMLDivElement;
  private streakEl: HTMLDivElement;
  private totalEl: HTMLSpanElement;
  private speedNum: HTMLSpanElement;
  private stanceEl: HTMLSpanElement;
  private balanceEl: HTMLDivElement;
  private heldEl: HTMLDivElement;
  private gauge: HTMLDivElement;
  private needle: HTMLDivElement;
  private balanceTicks: HTMLElement[] = [];
  private centre: HTMLDivElement;
  private clockEl: HTMLDivElement;
  private clockNum: HTMLSpanElement;
  private resultsEl: HTMLDivElement;
  private loader: HTMLDivElement;
  private loaderBar: HTMLSpanElement;
  private loaderStatus: HTMLDivElement;

  /**
   * Every line that BANKS, in points, the instant it is paid.
   *
   * It is a hook rather than a call into the run because the HUD is not allowed
   * to know a run exists — banking is the game's scoring rule and it happens
   * whether or not a clock is on. The one-minute run subscribes to it and
   * counts what lands inside its minute; nothing else in the game listens.
   */
  onBank: ((points: number) => void) | null = null;
  /** What GO AGAIN is wired to, while the results readout is up. */
  onRepeatRun: (() => void) | null = null;
  /**
   * …and FREE RIDE, the other half of the choice: put the card down and leave
   * him rolling. Wired to the run's own `dismiss`, which is the one place that
   * decides the readout is finished with.
   */
  onFreeRide: (() => void) | null = null;
  /**
   * The results card wants the MOUSE, and while the game is being played the
   * mouse is the camera — it is locked away under the follow camera's pointer
   * lock, so a click on GO AGAIN would land on the canvas and do nothing.
   *
   * Raised when the answer CHANGES. The boot routes it to
   * `followCam.setPaused`, which is the ONE door the lock goes through
   * (skate-camera.ts says so in as many words) — never a raw `exitPointerLock`
   * from here. The camera keeps following him the whole time; only free-look
   * stands down, which is right: while you are reading your own score the mouse
   * is a cursor, not a neck.
   *
   * The boot must combine this with its OWN pause flag rather than pass the
   * argument straight through — `followCam.setPaused(paused || hud.wantsCursor)`
   * — because the two overlap: pausing over the results card and then resuming
   * would otherwise re-capture the mouse and leave the card's two words
   * unclickable while they are still on screen.
   */
  onResultsCursor: ((wanted: boolean) => void) | null = null;

  private links: Link[] = [];
  private pot = 0;
  private settleT = 0;
  /** Streak the pending bank will print, or −1 when nothing is waiting. */
  private pendingStreak = -1;
  /** Seconds left of that bank's grace — see `BANK_GRACE`. */
  private bankT = 0;
  private total = 0;
  /** What the score line is currently showing — it rolls up to `total`. */
  private shownTotal = 0;
  /**
   * The minute's own score while a run is on, and null the rest of the time.
   *
   * The big number is ONE number: during a run it is what this run has banked,
   * and outside one it is the session total. Two big scores fighting for the
   * same eye is how a player ends up reading neither.
   */
  private runScore: number | null = null;
  /** What the clock is currently printing, so it is not rewritten every frame. */
  private clockShown = "";
  /**
   * The last value actually written to each per-frame widget.
   *
   * Same trick, and the same reason, as `clockShown` twenty lines down — that
   * one already says it: *"a textContent write per frame is a layout the clock
   * does not need"*. It was true of the clock and it is just as true of the
   * speed readout (the digits change a few times a second, not sixty) and of the
   * balance gauge, whose `setBalance` is called on EVERY frame and spends most
   * of a run writing `className = ""` to an element that already has it.
   *
   * Safe because each of these nodes has exactly one writer in this file —
   * checked, not assumed — so the cache cannot go stale behind another path.
   * The empty-string seeds can never equal a first real value (`Math.round`
   * always yields at least "0", and the gauge writes always carry a unit).
   */
  private speedShown = "";
  private balanceClassShown = "";
  private gaugeTiltShown = "";
  private needleLeftShown = "";
  private tickClassShown: string[] = [];
  /** Which way round he is standing, as the ride last announced it. */
  private stanceWord: Stance = "regular";
  /** …and the other way to be riding the other way round — see `paintStance`. */
  private fakieNow = false;
  /** What the stance badge is currently saying, so it is not rewritten daily. */
  private badge = "";
  /** Is the results card up? Its hooks fire on the EDGES, not on every call. */
  private resultsUp = false;
  /** GO AGAIN / FREE RIDE, while it is. */
  private resultsChoices: ChoiceList | null = null;
  /** …and its hold on the arrow keys, released the moment it comes down. */
  private releaseResultKeys: (() => void) | null = null;
  /**
   * The biggest single line the CURRENT minute has banked, and the words the
   * combo readout printed for it.
   *
   * Collected here because this is where the payout is computed — the card
   * names a line the game actually paid for, at the number it actually paid,
   * and nothing on the results screen re-scores anything. It is per-minute:
   * cleared whenever the readout comes down, which is also every run start.
   */
  private bestLine: { text: string; points: number } | null = null;

  constructor() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    installScreenStyles();

    this.loader = el("div", "", "loader");
    this.loader.innerHTML = `<div class="shade"></div><div class="inner">
      <div class="word">SKATE</div>
      <div class="bar"><span></span></div>
      <div class="status">Rolling out the field…</div></div>`;
    document.body.appendChild(this.loader);
    this.loaderBar = this.loader.querySelector(".bar span") as HTMLSpanElement;
    this.loaderStatus = this.loader.querySelector(".status") as HTMLDivElement;

    this.root = el("div", "", "hud");
    this.root.innerHTML = `
      <div id="runclock" class="num"><span class="t">1:00</span><em>ON THE CLOCK</em></div>
      <!-- THE LEFT RAIL: the overall score, and the speed under it. One column,
           laid out in flow — the score changes width every time it is paid and
           nothing below it may move when it does. -->
      <div id="left">
        <div id="score"><span class="l cap">SCORE</span><span class="n num">0</span></div>
        <div id="speed"><span class="sw">SWITCH</span></div>
      </div>
      <!-- The speed, on its own, in the far corner — see #speedo. -->
      <div id="speedo"><span class="n num">0</span><span class="u cap">KM/H</span></div>
      <!-- THE TRICK, and the points it paid, on the floor of the screen. -->
      <div id="readout">
        <div id="combo">
          <div class="chain"></div>
          <div class="tally"></div>
          <div id="streak"></div>
        </div>
      </div>
      <div id="held"></div>
      <div id="balance">
        <div class="gauge">${"<i></i>".repeat(BALANCE_TICKS)}<div class="needle"></div></div>
      </div>
      <div id="controls">${CONTROL_ROWS.map(
        ([skill, keys, held]) =>
          `<span class="s">${held ? "<em>Hold</em>" : ""}${esc(skill)}</span>` +
          `<span class="k">${keys.map((k) => `<b class="keycap">${esc(k)}</b>`).join("")}</span>`,
      ).join("")}</div>
      <div id="centre" class="stencil"></div>
      <div id="results" class="sk-screen sk-wash"></div>`;
    document.body.appendChild(this.root);

    this.chain = this.root.querySelector("#combo .chain") as HTMLDivElement;
    this.tally = this.root.querySelector("#combo .tally") as HTMLDivElement;
    this.streakEl = this.root.querySelector("#streak") as HTMLDivElement;
    this.totalEl = this.root.querySelector("#score .n") as HTMLSpanElement;
    this.speedNum = this.root.querySelector("#speedo .n") as HTMLSpanElement;
    this.stanceEl = this.root.querySelector("#speed .sw") as HTMLSpanElement;
    this.balanceEl = this.root.querySelector("#balance") as HTMLDivElement;
    this.heldEl = this.root.querySelector("#held") as HTMLDivElement;
    this.gauge = this.root.querySelector("#balance .gauge") as HTMLDivElement;
    this.needle = this.root.querySelector("#balance .needle") as HTMLDivElement;
    this.balanceTicks = Array.from(this.root.querySelectorAll("#balance .gauge i"));
    this.centre = this.root.querySelector("#centre") as HTMLDivElement;
    this.clockEl = this.root.querySelector("#runclock") as HTMLDivElement;
    this.clockNum = this.root.querySelector("#runclock .t") as HTMLSpanElement;
    this.resultsEl = this.root.querySelector("#results") as HTMLDivElement;

    this.setBalance(null);
  }

  setLoaderArt(url: string): void {
    this.loader.style.backgroundImage = `url("${url}")`;
  }
  setLoaderLogo(url: string): void {
    const word = this.loader.querySelector(".word");
    if (!word) return;
    const img = document.createElement("img");
    img.src = url;
    img.alt = "SKATE";
    word.replaceWith(img);
  }
  setProgress(fraction: number, status?: string): void {
    this.loaderBar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    if (status) this.loaderStatus.textContent = status;
  }
  hideLoader(): void {
    this.loader.classList.add("gone");
    setTimeout(() => this.loader.remove(), 600);
  }

  /**
   * Does the on-screen layer need the mouse back right now?
   *
   * True exactly while the results card is up. Read by the boot alongside its
   * own pause flag so ONE expression decides who owns the pointer — see
   * `onResultsCursor` for why the two have to be combined rather than raced.
   */
  get wantsCursor(): boolean {
    return this.resultsUp;
  }

  /** The HUD belongs to gameplay — the title screen shows none of it. */
  setVisible(on: boolean): void {
    this.root.style.opacity = on ? "1" : "0";
    this.root.style.transition = "opacity .3s ease";
  }

  // ---------------------------------------------------------------------------
  // the combo readout
  // ---------------------------------------------------------------------------

  /**
   * One more trick in the line — a SCORED link, the kind that multiplies.
   * `name` is whatever the trick book called it: "360 Kickflip" arrives as one
   * link, because that is one trick.
   *
   * `points` is the trick's BASE value, exactly as the trick book handed it
   * over. The combo multiplier is applied ONCE, here in the HUD, when the line
   * banks — see `commitBank`. Nothing upstream may pre-multiply it.
   */
  addLink(name: string, points = 0): void {
    if (this.settleT > 0) this.startLine();
    const word = name.toUpperCase();
    // "360" then "360 KICKFLIP" is one trick that got named twice. Only OPEN
    // links can be swallowed, and the search walks back over the whole open run
    // rather than testing the last one: a spin onto a rail opens two of them
    // ("360", then "50-50") and the grind's own bank arrives behind both.
    for (let i = this.links.length - 1; i >= 0 && !this.links[i].scored; i--) {
      if (absorbs(this.links[i].text, word)) {
        this.links.splice(i, 1);
        break;
      }
    }
    this.pot += Math.max(0, points);
    // THE SAME TRICK TWICE RUNNING IS ONE LINK — clause 3a of the rule at
    // `commitBank`, and it is the HUD's half of the manny pad.
    //
    // The multiplier is the number of tricks in the line, and it was payable in
    // the same trick over and over. That is not a hypothetical exploit: the pad
    // does it TO the player. Measured on the real model, holding the manual key
    // up the plaza spine, the pad broke the manual once at 10 m/s, twice at 12
    // and three times at 14 — and the readout answered "MANUAL + MANUAL +
    // MANUAL", a ×3 line, for one key held down once. 3.0 s of manual paid 300
    // in one piece and 5,400 in six. (The key was E when that was measured and
    // is Shift now; the pad has not moved.)
    //
    // So a scored link whose words are the last scored link's words does not
    // open a second link. Its points still land in the pot — the seconds a
    // manual earns are real seconds — and the trick book has already stopped
    // charging a second take-off for a hold the ground interrupted
    // (`resumedBase`), so the two together put a broken manual back on exactly
    // the number a clean one pays.
    //
    // It costs a deliberate repeat its multiplier, and that is the point: a
    // line worth having is one that keeps adding tricks. THPS has always
    // charged for saying the same thing twice.
    const last = this.links[this.links.length - 1];
    if (!last || !last.scored || last.text !== word) {
      this.links.push({ text: word, scored: true });
    }
    this.paint("build");
  }

  /**
   * A held trick that has just STARTED — a grind locking on, a grab reaching
   * down — or a bare rotation with nothing under it yet.
   *
   * It reads the instant he locks on instead of when he leaves it, and it is
   * OPEN: it prints, and it does not score, and it does not multiply. The
   * `addLink` that eventually banks the same trick replaces it. A line whose
   * only links are open ones is a line of nothing, and banks nothing — that is
   * what stopped a bare pivot past the spin threshold from doubling the pot
   * behind it.
   */
  openLink(name: string): void {
    if (this.settleT > 0) this.startLine();
    this.links.push({ text: name.toUpperCase(), scored: false });
    this.paint("build");
  }

  /**
   * A rotation with no trick under it. Held the same loose way: if the next link
   * the trick book hands over already carries this spin ("360 KICKFLIP"), it
   * takes this one's place.
   */
  addSpin(degrees: number): void {
    // `landedSpinName`, never `spinName`: the ride announces a spin from 100°
    // and only calls it a half-turn once it is within `SPIN_SQUARE_DEG` of
    // square, so the raw name printed "180" over a 109° brake-and-steer pivot
    // that left the stance badge dark — the screen naming a trick the model had
    // just refused. Measured on the real model at 109°/95°/82°: "180", "180",
    // "" against a stance that never moved.
    const word = landedSpinName(degrees);
    if (word) this.openLink(word);
  }

  /**
   * He rode away with it: the line banks at this frame's `update`.
   *
   * It is NOT banked here, and it is not conditional on the line having
   * anything in it yet, because the model announces the LANDING before it
   * announces the trick that landed. Refusing an empty line here skipped the
   * bank for every solo trick — the landing found nothing, the trick arrived a
   * moment later, and the link it opened then rode into the next landing as a
   * free second multiplier. `commitBank` is where "is there anything to bank?"
   * is a fair question to ask.
   *
   * A landing is not the only caller. A trick done entirely on the ground —
   * a manual let go of with the wheels already down — has no landing behind it,
   * and the trick book latches that moment instead (`takeGroundClose`). Both
   * arrive here, and both cash in the same `update`.
   */
  bankCombo(streak = 0): void {
    this.pendingStreak = Math.max(0, streak);
    this.bankT = BANK_GRACE;
  }

  /**
   * A trick has taken the line OVER instead of ending it — the manual, which is
   * the whole reason a manual is a trick you can do at all.
   *
   * Called the moment a ground hold starts. It cancels a bank the landing armed
   * a frame ago (`BANK_GRACE` is what leaves one to cancel) and prints the
   * trick as an OPEN link, so the line the player is looking at grows across
   * the touchdown instead of paying out and starting again underneath him. The
   * hold's own scored link replaces the open one when the book banks it, the
   * same way a grind's does.
   *
   * Letting go is deliberately NOT this method's business — every way a hold
   * ends already has a voice, and the one with no landing behind it is the trick
   * book's `takeGroundClose` arriving here as `bankCombo`. So `null` is a
   * no-op, and this cannot be the thing that leaves a line un-banked.
   *
   * GROUND holds only. A grab is let go of in the air with a landing still
   * coming, and a grind hands him back to the air as well: neither has a bank
   * to cancel, and wiring either one here would let a line survive a touchdown
   * it should have been paid for.
   */
  carryCombo(name: string | null): void {
    if (!name) return;
    this.pendingStreak = -1;
    this.bankT = 0;
    // A manual the ground bumped and he picked straight back up is the link
    // that is already on screen, so it does not get a second one printed
    // beside itself while it runs. Without this the chain reads "MANUAL +
    // MANUAL" for the whole of the pick-up and then collapses back to one when
    // the bank arrives, which reads as the HUD losing a trick.
    if (this.links[this.links.length - 1]?.text === name.toUpperCase()) {
      this.paint("build");
      return;
    }
    this.openLink(name);
  }

  /** He didn't. The line dies where it stands and nothing in it counts. */
  loseCombo(): void {
    this.pendingStreak = -1;
    this.bankT = 0;
    // Nothing is held by a body on the floor. The ride does announce it now
    // (`dropHold` fires before `onBail`), so this is a backstop and not the
    // only clear — measured: deleting it changes nothing a harness can see.
    // It stays because the badge is the one piece of HUD state that survives a
    // bail if it is missed, and it lies for the whole rest of the run.
    this.setHeld(null);
    this.paint("lose");
    this.streakEl.classList.remove("show");
    this.endLine();
  }

  /** Clean landings in a row — the run's own rhythm, separate from one line. */
  setStreak(n: number): void {
    if (n > 1) {
      this.streakEl.textContent = `${n} CLEAN IN A ROW`;
      this.streakEl.classList.add("show");
    } else {
      this.streakEl.classList.remove("show");
    }
  }

  /**
   * R: back to nothing. The combo, the streak, the meter and the session total.
   *
   * A one-minute run is deliberately NOT ended by this. R is how a player picks
   * himself up off the concrete, and taking the clock away for it would make
   * the fastest way out of a bail also the way to lose the minute. The clock
   * keeps running and the minute's score keeps standing — which is why the big
   * number rolls back to the RUN's score here and not to zero.
   */
  resetRun(): void {
    this.clearCombo();
    this.total = 0;
    this.shownTotal = this.runScore ?? 0;
    this.totalEl.textContent = fmt(Math.round(this.shownTotal));
    this.streakEl.classList.remove("show");
    this.setBalance(null);
    this.setHeld(null);
    this.setStance("regular");
    // Painted here rather than waiting for the next `update`: R is allowed to
    // land on a frame the game is not stepping, and a SWITCH badge left lit
    // over a fresh run is the kind of lie the player acts on.
    this.paintStance();
  }

  // ---------------------------------------------------------------------------
  // the balance meter
  // ---------------------------------------------------------------------------

  /**
   * −1 → +1 while he is holding something he can LOSE, and `null` the moment he
   * is not, because a meter that lingers reads as still grinding.
   *
   * Two things feed it now. On a rail it is heelside → toeside. In a MANUAL, as
   * of 2026-07-29, it is the pendulum: the manual used to run on a flat
   * four-second clock and this doc used to explain, at length, why a manual
   * therefore had no needle to show. The player found the hole from the other
   * side — "during a manual there should be the same balance mechanic as when
   * we grind on a rail, right? Otherwise I could ride forever on it" — so the
   * RIDE grew a balance and the gauge follows it, exactly as the old comment
   * said it would.
   *
   * The deck's own rake is still the primary read in a manual (5.2° at the
   * wheels-coming-down edge, 29.2° at the tail scrape), so this is the second
   * opinion. A/D is what fights the needle — the controls screen says so.
   */
  setBalance(value: number | null): void {
    // No `balance-up` class any more, and that is a deletion worth naming: the
    // old control legend was two wrapped rows across the bottom of the screen
    // and the gauge was drawn straight through it, so the legend had to be
    // BLANKED for the whole of every grind. The rail is a narrow column on the
    // right edge now and the gauge is centred — they cannot touch, so nothing
    // has to be hidden and the player keeps the legend at the one moment he is
    // most likely to want it.
    if (value === null) {
      if (this.balanceClassShown !== "") {
        this.balanceClassShown = "";
        this.balanceEl.className = "";
      }
      return;
    }
    const b = Math.max(-1, Math.min(1, value));
    const mag = Math.abs(b);
    const cls = `show${mag > 0.8 ? " max" : mag > 0.55 ? " hot" : ""}`;
    if (cls !== this.balanceClassShown) {
      this.balanceClassShown = cls;
      this.balanceEl.className = cls;
    }
    // The whole gauge leans the way he is losing it — the number is the needle,
    // the tilt is what you actually catch out of the corner of your eye.
    const tilt = `rotate(${(b * 8).toFixed(2)}deg)`;
    if (tilt !== this.gaugeTiltShown) {
      this.gaugeTiltShown = tilt;
      this.gauge.style.transform = tilt;
    }
    const left = `${(50 + b * 46).toFixed(2)}%`;
    if (left !== this.needleLeftShown) {
      this.needleLeftShown = left;
      this.needle.style.left = left;
    }
    for (let i = 0; i < this.balanceTicks.length; i++) {
      const p = ((i + 0.5) / BALANCE_TICKS) * 2 - 1;
      const mid = Math.abs(p) < 1 / BALANCE_TICKS;
      const lit = !mid && p * b > 0 && Math.abs(p) <= mag;
      const cls = !lit
        ? mid
          ? "mid"
          : ""
        : mag > 0.8
          ? "max"
          : mag > 0.55
            ? "hot"
            : "on";
      // 15 ticks, and on a steady rail all fifteen resolve to what they already
      // say. The seed array is empty, so the first pass through writes them all.
      if (cls !== this.tickClassShown[i]) {
        this.tickClassShown[i] = cls;
        this.balanceTicks[i].className = cls;
      }
    }
  }

  /**
   * A trick that is ON right now because a key is still down — a grab in the
   * air. `null` the frame it is let go.
   *
   * The combo line already carries the trick's NAME as a provisional link; this
   * is the other half of the read, and it is the half that says "still holding
   * it". A grab used to have neither: no body, no board, no words and no sound
   * for the whole time it was on, which made the grab key feel dead.
   *
   * The manual and the nose manual come through here too and are deliberately
   * not painted — see `NO_HELD_BADGE` for whose call that is and why the gauge
   * is left alone.
   */
  setHeld(name: string | null): void {
    if (!name || NO_HELD_BADGE.has(name.toUpperCase())) {
      this.heldEl.className = "";
      this.heldEl.textContent = "";
      return;
    }
    this.heldEl.className = "show stencil";
    this.heldEl.innerHTML = `${esc(name.toUpperCase())}<em>HOLDING</em>`;
  }

  /**
   * Riding the other way round — the badge beside the speed.
   *
   * Roll the wheels backwards past the ride's own deadband and he turns round
   * on the deck to face where he is going; roll forwards again and he turns
   * back. This badge is how a player knows which of those just happened, and it
   * is the only place the word appears while he is simply riding.
   */
  setStance(stance: Stance): void {
    this.stanceWord = stance;
  }

  /**
   * One word, one slot: SWITCH, whenever he is riding with the other foot in
   * front. Regular is silent, which is what makes the badge worth looking at at
   * all.
   *
   * There are two ways to get there and the badge deliberately does not tell
   * them apart — he turned round on his own deck coming back down a transition,
   * or the board came round under him on a landed 180 and his feet stayed. They
   * are one thing to the player, who calls both of them switch, and both leave
   * him rolling with the other foot leading.
   */
  private paintStance(): void {
    const word = this.stanceWord === "switch" || this.fakieNow ? "SWITCH" : "";
    if (word === this.badge) return;
    this.badge = word;
    // The text is left standing when the badge goes out — it fades on opacity,
    // and blanking it mid-fade would take the word away before the fade does.
    if (word) this.stanceEl.textContent = word;
    this.stanceEl.classList.toggle("on", word !== "");
  }

  showCentre(big: string, sub: string, pause = false): void {
    this.centre.className = `stencil show${pause ? " pause" : ""}`;
    this.centre.innerHTML = `<div class="big">${big}</div><div class="sub">${sub}</div>`;
  }
  hideCentre(): void {
    this.centre.className = "stencil";
  }

  // ---------------------------------------------------------------------------
  // the one-minute run
  // ---------------------------------------------------------------------------

  /**
   * Seconds left on the clock, or null when no run is on.
   *
   * Gold under fifteen and red-and-flashing under five, because the last five
   * seconds are the only ones a player changes their behaviour for: it is when
   * you stop building the line and cash what you have.
   */
  setRunClock(seconds: number | null): void {
    // `num` is re-stated on EVERY write, and that is the whole of the font bug
    // the player screenshotted. This method owns the element's className, so
    // each of these assignments was quietly deleting the class the markup put
    // there — the clock rendered in Syne Mono for exactly as long as it said
    // 1:00 and fell back to the HUD's Barlow, and lost its ink shadow, the
    // instant it first ticked. `#runclock` also names the face itself now, so
    // this is belt and braces rather than the only thing holding it.
    if (seconds === null) {
      if (this.clockShown !== "") {
        this.clockShown = "";
        this.clockEl.className = "num";
      }
      return;
    }
    // Written only when the digits actually change. It is called every frame of
    // a sixty-second run, and a textContent write per frame is a layout the
    // clock does not need — the number moves once a second.
    const text = clockText(seconds);
    if (text === this.clockShown) return;
    this.clockShown = text;
    this.clockNum.textContent = text;
    this.clockEl.className = `num on${seconds <= 5 ? " last" : seconds <= 15 ? " warn" : ""}`;
  }

  /**
   * The minute's score takes the big number over, and hands it back when the
   * run is done with it.
   *
   * The roll-up is SKIPPED across the handover: the score counting down from a
   * session total of 40,000 to a fresh run's zero over half a second is a
   * readout that looks broken. It snaps, and then rolls again from there.
   */
  setRunScore(points: number | null): void {
    const swapping = (this.runScore === null) !== (points === null);
    this.runScore = points;
    if (swapping) {
      this.shownTotal = points ?? this.total;
      this.totalEl.textContent = fmt(Math.round(this.shownTotal));
      const label = this.root.querySelector("#score .l");
      if (label) label.textContent = points === null ? "SCORE" : "RUN SCORE";
    }
  }

  /**
   * The minute is up: what it was worth, and the two things to do about it.
   *
   * It does NOT pause anything. The player is still rolling underneath it, and
   * that is the point — the run was a minute laid over a game that is still
   * there when it ends. GO AGAIN takes another minute, FREE RIDE puts the card
   * down and leaves him on the block, and any ride key does the same thing
   * without him having to answer the screen at all.
   *
   * THERE IS NO AUTO-DISMISS ANY MORE, and that is deliberate. The card used to
   * take itself away after 22 seconds, which was reasonable when its only
   * control was one GO AGAIN button — a readout nobody answered would otherwise
   * have sat over the game for the rest of the session. It is not reasonable
   * now: this is a QUESTION with a highlighted answer, and a screen that
   * answers itself while the player is deciding is not a choice. The four ways
   * out (the two words, any ride key, R) are the player's, and all four of them
   * are his.
   *
   * The score is here on the frame the clock stopped and the BOARD is not: a
   * leaderboard is a network round trip and the number is the thing the player
   * just spent a minute earning. `setRunOutcome` fills the rest in underneath
   * it when it lands, which is also why the two halves are separate methods —
   * re-rendering the whole card would replay the score's landing animation a
   * beat after the player had finished reading it.
   */
  showRunResults(score: number): void {
    // Frozen HERE, on the frame the clock stopped, so a line he banks while
    // reading the card cannot rewrite the minute he is reading about.
    const best = this.bestLine;
    // STRIPPED 2026-07-29, the same pass that emptied the pause and settings
    // cards, and by the player's own rule: *"there's no need to add a lot of
    // unnecessary subtext… everywhere. It should be brief."* Gone from here: the
    // "One minute · 1:00" eyebrow, both gold hairlines, the "Global top five"
    // heading over the board, and the captions under GO AGAIN and FREE RIDE.
    //
    // `Points banked` STAYS, and it is the one line worth arguing for. Every
    // other caption glossed a word that already said itself — GO AGAIN does not
    // need "another minute" under it. This one is the unit on the biggest number
    // on the screen, and a bare six-figure number with nothing naming it is a
    // readout, not a result.
    this.resultsEl.innerHTML =
      `<div class="sk-head sk-in" style="--i:0">Time</div>` +
      `<div class="r-score">${fmt(score)}</div>` +
      `<div class="r-scorelab sk-in" style="--i:1">Points banked</div>` +
      `<div class="r-sub sk-in" style="--i:2"></div>` +
      (best
        ? `<div class="r-best sk-in" style="--i:3">Best line` +
          `<b>${esc(best.text)}</b><em>+${fmt(best.points)}</em></div>`
        : "") +
      `<div class="r-board sk-in" style="--i:4"></div>`;

    this.resultsChoices = new ChoiceList([
      { label: "Go again", act: () => this.onRepeatRun?.() },
      { label: "Free ride", act: () => this.onFreeRide?.() },
    ]);
    this.resultsChoices.el.classList.add("sk-in");
    this.resultsChoices.el.style.setProperty("--i", "5");
    this.resultsEl.appendChild(this.resultsChoices.el);
    this.resultsEl.appendChild(
      screenHint("6", "↑ ↓ ← → choose · Enter takes it · or just ride on"),
    );

    if (!this.resultsUp) {
      this.resultsUp = true;
      // The arrows belong to the card while it is up — they choose on it rather
      // than steering the board and dismissing it, which is what they used to
      // do. WASD still rides away, so nothing the player needs is taken.
      this.releaseResultKeys = claimKeys((e) => this.resultsChoices?.handleKey(e) ?? false);
      this.onResultsCursor?.(true);
    }
    // The card is built with the entrance still wound up; flushing the layout
    // before the class goes on is what makes it actually animate in rather than
    // appear finished.
    this.root.classList.add("results-up");
    void this.resultsEl.offsetWidth;
    this.resultsEl.classList.add("is-on");
  }

  /**
   * …and the world's answer, once it has one: the board, and where this player
   * stands on it.
   *
    * The standing line is only printed when the board actually knows about them.
    * A fresh device and a board that failed to read both come back with
    * nothing, and neither is worth a sentence.
   *
   * Trimmed to five rows here and nowhere else: the card is a beat between two
   * runs and it already carries a score, a standing and two choices. The whole
   * top ten is the title screen's LEADERS screen, which is the screen for
   * reading a board on.
   */
  setRunOutcome(board: BoardView, posted: { best: number | null; improved: boolean }): void {
    const score = this.runScore ?? 0;
    const bits: string[] = [];
    if (posted.improved) bits.push("<b>NEW BEST</b>");
    else if (posted.best !== null && posted.best > score) bits.push(`YOUR BEST ${fmt(posted.best)}`);
    // The board's own copy of the best — only when the two lines above said
    // nothing (a tied best): otherwise it would print the same number twice.
    else if (board.me) bits.push(`BEST ${fmt(board.me.score)}`);
    const sub = this.resultsEl.querySelector(".r-sub");
    if (sub && bits.length > 0) sub.innerHTML = bits.join(" · ");
    const slot = this.resultsEl.querySelector(".r-board");
    if (slot) slot.innerHTML = boardHtml({ rows: board.rows.slice(0, 5), me: board.me });
  }

  hideRunResults(): void {
    this.resultsEl.classList.remove("is-on");
    this.root.classList.remove("results-up");
    // The best line belongs to ONE minute. Every path that puts the card down
    // is also every path a fresh run comes in through — `onStart` calls this
    // before the clock has ticked once — so this is where a run's memory ends.
    this.bestLine = null;
    if (!this.resultsUp) return;
    this.resultsUp = false;
    this.releaseResultKeys?.();
    this.releaseResultKeys = null;
    this.resultsChoices = null;
    this.onResultsCursor?.(false);
  }

  update(speed: number, dt: number, fakie = false): void {
    this.fakieNow = fakie;
    // Riding switch is a negative speed on the model; nobody rides at −12 km/h.
    const v = Math.abs(speed);
    const kmh = String(Math.round(v * 3.6));
    if (kmh !== this.speedShown) {
      this.speedShown = kmh;
      this.speedNum.textContent = kmh;
    }
    this.paintStance();

    if (this.pendingStreak >= 0) {
      this.bankT -= dt;
      if (this.bankT <= 0) this.commitBank();
    }

    if (this.settleT > 0) {
      this.settleT -= dt;
      if (this.settleT <= 0) this.startLine();
    }

    // The big number is the RUN's while a run owns it, and the session's the
    // rest of the time. One target, one roll-up — see `setRunScore`.
    const target = this.runScore ?? this.total;
    if (this.shownTotal !== target) {
      const gap = target - this.shownTotal;
      this.shownTotal += Math.abs(gap) < 40 ? gap : gap * Math.min(1, dt * 9);
      this.totalEl.textContent = fmt(Math.round(this.shownTotal));
    }
  }

  /**
   * THE SCORING RULE, and this is the one place that owns it. Every other layer
   * defers to what is written here.
   *
   *   1. A landed trick is worth the BASE value the trick book handed over —
   *      spin, stance and seconds held already folded in, because only the book
   *      knows what those are worth. Nothing upstream pre-multiplies.
   *   2. The line's pot is those base values added up.
   *   3. The multiplier is how many SCORED links are in the line, capped by
   *      `comboMultiplier` (tricks.ts). Open links — a rail he is still on, a
   *      bare spin nothing attached to — print, and do not count.
   *   3a. The same trick twice RUNNING is one link. Its points still go in the
   *      pot; it does not advance the multiplier. A manual the manny pad bumps
   *      three times is one manual, not a ×3 line, and a player tapping the
   *      manual key on and off across the plaza is not building anything.
   *   4. Rolling away banks `pot × multiplier`, ONCE. Going down banks nothing.
   *   5. …unless a MANUAL catches the line on the way down. A ground hold that
   *      starts inside `BANK_GRACE` of the landing takes the bank over instead
   *      (`carryCombo`), and the line goes on growing across the flat. That is
   *      the manual's entire reason to exist.
   *   6. Banked or lost, the line is over the instant it settles up. The
   *      readout stays on screen for `SETTLE` seconds; the arithmetic does not.
   *
   * Every clause above is a bug that shipped. The multiplier was applied here
   * AND per-link on the way out (a five-link line paid 16,050 for 1,120 of
   * tricks); the cap was documented and enforced nowhere (a fourteen-link line
   * paid ×14); a bare pivot doubled the pot behind it; and the pot was never
   * spent, so a second clean landing inside 0.8 s paid for the same tricks
   * again.
   */
  private commitBank(): void {
    const streak = this.pendingStreak;
    this.pendingStreak = -1;
    this.bankT = 0;
    const scored = this.scored();
    if (scored === 0) {
      // Nothing in the line but open ones — a spin he never put a trick on.
      // Clear it rather than leave it lying about to ride into the next line.
      if (this.links.length > 0) this.startLine();
      return;
    }
    const banked = Math.round(this.pot * comboMultiplier(scored));
    this.total += banked;
    // THE MINUTE'S BIGGEST LINE, for the results card to name. Read off the
    // payout that just happened rather than recomputed — the card quotes this
    // arithmetic, it never runs a second one — and only collected while a
    // minute owns the big number, so free-roam lines never leak into a run's.
    if (this.runScore !== null && banked > (this.bestLine?.points ?? 0)) {
      this.bestLine = { points: banked, text: this.links.map((l) => l.text).join(" + ") };
    }
    this.paint("bank", banked);
    this.setStreak(streak);
    this.endLine();
    // …and the same number, to whoever is counting a minute. It is announced
    // AFTER the payout is complete so a listener that reads the HUD back sees a
    // finished line rather than one mid-bank.
    this.onBank?.(banked);
  }

  /** How many links in the line actually pay — and therefore multiply. */
  private scored(): number {
    let n = 0;
    for (const l of this.links) if (l.scored) n++;
    return n;
  }

  /**
   * The line is settled up. The readout is LEFT alone — it is mid-animation and
   * the player is still reading it — but the pot and the links are gone, so the
   * next landing inside the settle window has nothing of this line to pay for
   * twice. `update` clears the readout when the animation is over.
   */
  private endLine(): void {
    this.links.length = 0;
    this.pot = 0;
    this.settleT = SETTLE;
  }

  private paint(mode: "build" | "bank" | "lose", banked = 0): void {
    const mult = comboMultiplier(this.scored());
    this.chain.innerHTML = this.links.length
      ? // Real spaces around the plus, so a four-link line has somewhere to
        // wrap instead of running off the right edge as one long word. Each
        // trick carries its own colour class — the reference frame's blue and
        // gold against white; see `linkClass`.
        this.links.map((l) => `<b class="${linkClass(l.text)}">${esc(l.text)}</b>`).join(" <i>+</i> ")
      : mode === "lose"
        ? "BAILED"
        : "";
    // Restarting a CSS animation needs the class gone and the layout flushed,
    // or a second trick inside 260 ms pops nothing at all.
    this.chain.className = "chain";
    void this.chain.offsetWidth;
    // Sized off every link on screen, open ones included — the type has to fit
    // what is printed, not what is paid. The ladder is coarse on purpose: it
    // steps down four times over a fourteen-link line, so the readout shrinks
    // in beats the player notices rather than creeping a pixel a trick.
    const n = this.links.length;
    const tier = n >= 10 ? 8 : n >= 6 ? 6 : Math.min(4, n);
    this.chain.className = `chain w${tier} ${mode}`;

    if (mode === "bank") {
      this.tally.className = "tally bank";
      this.tally.textContent = banked > 0 ? `+${fmt(banked)}` : "";
    } else if (mode === "lose") {
      this.tally.className = "tally lose";
      this.tally.textContent = this.links.length ? "LOST" : "";
    } else {
      this.tally.className = "tally";
      // A line with something still RUNNING in it says so, because the build
      // tally and the bank tally are otherwise the same digits in the same
      // place with only a plus sign between them. Worse: a hold banks at the
      // END, so for the whole of a four-second manual the pot is zero and the
      // loudest readout on screen showed a trick name over a blank — walked,
      // and the manual across the plaza sat at chain "MANUAL", tally "" for
      // 3.2 s and then paid 390 in one go. The ellipsis is not a number the
      // trick book has not handed over; it is the honest statement that this
      // line is not finished.
      const open = this.links.some((l) => !l.scored);
      const sum = this.pot > 0 ? `${fmt(this.pot)}${mult > 1 ? `<span class="mult">× ${mult}</span>` : ""}` : "";
      this.tally.innerHTML = open ? `${sum}${sum ? " " : ""}…` : sum;
    }
  }

  /**
   * Wipe the readout and start a fresh line — and DO NOT touch a bank that is
   * waiting to be paid.
   *
   * That distinction is the whole of this method's existence. A trick landed
   * inside the previous line's 0.8 s settle window arrives here (the readout is
   * still animating, so it has to be cleared) one call AFTER the landing that
   * was going to bank it: the ride announces the touchdown, the HUD arms
   * `pendingStreak`, and then the trick that landed comes through `addLink`.
   * Clearing the pending bank at that point cancelled the payment for the whole
   * line — so linking tricks QUICKLY, which is the entire point of a combo
   * system, was the one thing that scored nothing. The pot and the links are
   * already gone by now anyway (`endLine` spent them at the bank); only the
   * pixels are stale.
   */
  private startLine(): void {
    this.links.length = 0;
    this.pot = 0;
    this.settleT = 0;
    this.chain.className = "chain";
    this.chain.textContent = "";
    this.tally.className = "tally";
    this.tally.textContent = "";
  }

  /** …and the run-level version: a pending bank dies with the rest of it. */
  private clearCombo(): void {
    this.startLine();
    this.pendingStreak = -1;
    this.bankT = 0;
  }
}

/**
 * One entry in the line on screen. `scored` is the whole distinction: a trick
 * the book banked pays and multiplies, an OPEN one (a rail still under him, a
 * spin nothing has attached to yet) only prints.
 */
interface Link {
  text: string;
  scored: boolean;
}

/**
 * Every trick you have to BALANCE, by the words the trick book prints for it.
 *
 * Matched on the printed callout rather than on a trick id, because the callout
 * is all the readout is given — a link arrives as "Switch 360 Kickflip to
 * Boardslide", one string, already composed. The words themselves come from
 * `TRICKS` in the trick book and the composition rule in `trickName`, so a new
 * grind lands here by being named; nothing has to be kept in step by hand
 * except this list, and it is the whole grind vocabulary.
 */
const BALANCE_WORDS = ["50-50", "BOARDSLIDE", "NOSEGRIND", "TAILSLIDE", "SMITH", "MANUAL"];

/** …and every way the printed line says the board or the rider came round. */
const TURN_WORDS = ["SWITCH", "180", "360", "540", "720", "900"];

/**
 * The colour a link prints in — the reference frame's blue and gold against
 * white, on the game's own categories rather than on decoration.
 *
 * Blue beats gold on purpose: a "Switch 50-50" is a grind first. The thing the
 * colour is teaching is what kind of trick it was, and a grind's meter is the
 * one on screen underneath it.
 */
function linkClass(text: string): string {
  if (BALANCE_WORDS.some((w) => text.includes(w))) return "t-grind";
  if (TURN_WORDS.some((w) => text.includes(w))) return "t-spin";
  return "";
}

/**
 * Is `word` the same trick `open` was, now fully named? A provisional link is
 * put up the moment a held trick STARTS, under whatever it is called on its own
 * — "50-50", "METHOD" — and the trick book names it properly when it banks. The
 * proper name has words added on BOTH ends ("SWITCH 50-50", "FAKIE 360 METHOD
 * TO BOARDSLIDE"), so a plain prefix test only caught the regular-stance case
 * and printed everything else twice.
 */
function absorbs(open: string, word: string): boolean {
  return word === open || ` ${word} `.includes(` ${open} `);
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * The micro-line under a screen's choices — what the keys do, in one row.
 * Exported because the pause card needs the identical thing, and two hand-typed
 * legends is how one screen ends up naming a key the other one forgot.
 */
export function screenHint(order: string, text: string): HTMLDivElement {
  const e = document.createElement("div");
  e.className = "sk-hint sk-in";
  e.style.setProperty("--i", order);
  e.textContent = text;
  return e;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function el(tag: string, cls: string, id: string): HTMLDivElement {
  const e = document.createElement(tag) as HTMLDivElement;
  if (cls) e.className = cls;
  e.id = id;
  return e;
}
