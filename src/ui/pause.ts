// THE PAUSE CARD — the screen Escape has been promising since milestone 1.
//
// Until now Escape flipped a boolean in the boot and printed the word PAUSED
// over the middle of the frame. The player said what was missing, and it is the
// obvious thing: *"when I press Pause, I should be able to go to the Main Menu
// or continue driving. That's logical."* A pause with no way out of the game is
// a pause that only knows how to be undone.
//
// So this is three words and nothing else:
//   · RESUME       — keep skating. Escape does the same thing.
//   · RESTART RUN  — only while a minute is actually on. It ASKS the run
//                    (`canRestart`), it never guesses from a score or a clock
//                    it has read off the HUD.
//   · MAIN MENU    — back to the title screen. This file raises the callback;
//                    the boot owns the teardown, because the boot is the only
//                    thing that knows what a title screen needs unwound.
//
// WHAT IT LOOKS LIKE is not decided here. The heading, the choices, the entrance
// and the highlight all come out of `SCREEN_CSS` and `ChoiceList` in `hud.ts`,
// which is the same vocabulary the end-of-run card is built from — one game, one
// interface, and no second art direction for a screen that exists for ten
// seconds at a time. The only thing this file styles is its own veil, and that
// is a WASH (AGENTS.md rule 6): a radial field with the title screen's brick red
// coming in off the left edge, gone before it reaches any corner, with no
// straight edge anywhere in it. Nothing here sits on a plate.
//
// WHAT IS NOT ON IT, at the player's word: no line of small caps over PAUSED, no
// gold hairline under it, and no caption under any choice. He read the card and
// said it plainly — *"remove the extra lines here, and we don't need 'keep
// skating', 'picture', or 'sounds'."* RESUME, RESTART RUN, SETTINGS and MAIN
// MENU are four words a player already knows the meaning of; a three-word gloss
// under each one is the screen explaining itself to somebody who is not
// confused. What the captions were really holding was AIR, so the air comes back
// as the gaps at the bottom of this file's stylesheet and not as text.
//
// The world keeps rendering and stays frozen behind it, exactly as it did — the
// boot's `paused` flag is still the only thing that stops the sim, and this
// screen never touches it. It asks; the boot decides.

import { ChoiceList, claimKeys, installScreenStyles, screenHint, type Choice } from "./hud";

const CSS = `
/* Over the HUD (which has no z-index of its own), under the loader at 20 and
   over the title screen's #ui at 15 — though the two are never up together, and
   Escape is deliberately dead at the title. */
#pausescreen {
  position: fixed; z-index: 18; pointer-events: none;
  background:
    radial-gradient(76% 94% at 50% 50%,
      rgba(6,8,14,.9) 0%, rgba(6,8,14,.7) 44%, rgba(6,8,14,.44) 100%),
    radial-gradient(62% 88% at -8% 50%,
      rgba(138,22,12,.5) 0%, rgba(96,16,9,.22) 44%, rgba(8,10,6,0) 78%);
  backdrop-filter: blur(4px) saturate(.72);
  -webkit-backdrop-filter: blur(4px) saturate(.72);
}
/* The veil only takes the mouse while it is actually up. A full-screen layer
   that eats clicks after it has faded out would swallow the canvas click the
   follow camera re-locks its aim on. */
#pausescreen.is-on { pointer-events: auto; }
/* THE RHYTHM, NOW THAT THE WORDS ARE GONE.
   The card used to hold itself apart with furniture: a line of small caps over
   PAUSED, a hairline under it, and a caption under every choice. All three are
   out, and the hole they leave is real — the shared stylesheet only budgets
   clamp(8px, 1.8vh, 22px) between a heading and a list, which was plenty when a
   fading rule and its own margins sat in between and is not plenty now.
   So the spacing that was a by-product of the text becomes the spacing itself.
   These three lines draw NOTHING (AGENTS.md rule 6) — no plate, no rule, no
   border. They are gaps, which is all the removed text was ever really doing. */
#pausescreen .sk-choices { margin-top: clamp(16px, 3.4vh, 42px); }
#pausescreen .sk-choices.col { gap: clamp(4px, 1.2vh, 15px); }
#pausescreen .sk-hint { margin-top: clamp(13px, 2.8vh, 32px); }
`;

export interface PauseOptions {
  /**
   * Keep skating. RESUME and Escape both run this, and it is the boot's own
   * resume path — it MUST end with `close()` on this screen, because this file
   * deliberately does not put itself away: a card that hid itself while the
   * boot forgot to restart the sim would leave the player looking at a frozen
   * block with nothing on screen to say why.
   */
  onResume: () => void;
  /** Back to the title screen. The boot owns everything that unwinds. */
  onMainMenu: () => void;
  /** Throw this minute away and take a fresh one. Omit it and the row is gone. */
  onRestart?: () => void;
  /**
   * Is a minute actually on? Asked FRESH every time the card opens, never
   * cached — the honest answer lives in `OneMinuteRun.running` and nowhere
   * else, and a RESTART RUN offered over free-roam is a button that restarts
   * nothing.
   */
  canRestart?: () => boolean;
  /** Open the settings card over this one. Omit it and the row is gone. */
  onSettings?: () => void;
}

export class PauseScreen {
  private opts: PauseOptions;
  private root: HTMLDivElement;
  private choices: ChoiceList | null = null;
  private release: (() => void) | null = null;
  private up = false;

  constructor(opts: PauseOptions) {
    this.opts = opts;
    installScreenStyles();
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement("div");
    this.root.id = "pausescreen";
    this.root.className = "sk-screen";
    document.body.appendChild(this.root);
  }

  /** Is the card up? The boot's own pause flag is the authority on the SIM. */
  get isOpen(): boolean {
    return this.up;
  }

  open(): void {
    if (this.up) return;
    this.up = true;
    this.build();
    // Built with the entrance still wound up; the layout flush is what makes it
    // animate in rather than arrive already finished.
    void this.root.offsetWidth;
    this.root.classList.add("is-on");
    // The card owns the arrows, Enter and Escape for as long as it is up — and
    // it takes them off the results card underneath it too, when a run has just
    // ended and the player paused over the readout. Newest claim wins; see
    // `claimKeys`. Everything else (W, Space, R) flows past untouched, which
    // costs nothing while the sim is frozen and keeps this file out of the
    // ride's business.
    this.release = claimKeys((e) => this.onKey(e));
  }

  close(): void {
    if (!this.up) return;
    this.up = false;
    this.root.classList.remove("is-on");
    this.release?.();
    this.release = null;
    this.choices = null;
  }

  dispose(): void {
    this.close();
    this.root.remove();
  }

  /**
   * Escape resumes — the other half of the contract that Escape pauses, and the
   * reason this screen claims the key at all: the boot's own Escape handler
   * toggles the pause, so a card that let the key through would be closed by
   * this handler and re-opened by that one on the same press.
   */
  private onKey(e: KeyboardEvent): boolean {
    if (e.code === "Escape") {
      this.opts.onResume();
      return true;
    }
    return this.choices?.handleKey(e) ?? false;
  }

  /**
   * Rebuilt on every open, and that is the point: the RESTART RUN row exists
   * only while a minute is on, and whether one is on is a question with a
   * different answer every time the card comes up.
   */
  private build(): void {
    // One word, and it is the loudest thing on any screen in the game. No
    // eyebrow over it and no hairline under it — see the note at the top.
    this.root.innerHTML = `<div class="sk-shout sk-in" style="--i:0">Paused</div>`;

    // No `note` on any of these. `ChoiceList` only draws the caption line when
    // one is handed in, so the way to take them off this card is to stop passing
    // them — the component is shared with the end-of-run card and is not this
    // file's to change.
    const list: Choice[] = [{ label: "Resume", act: () => this.opts.onResume() }];
    if (this.opts.onRestart && this.opts.canRestart?.() === true) {
      list.push({ label: "Restart run", act: () => this.opts.onRestart?.() });
    }
    if (this.opts.onSettings) {
      list.push({ label: "Settings", act: () => this.opts.onSettings?.() });
    }
    list.push({ label: "Main menu", act: () => this.opts.onMainMenu() });

    this.choices = new ChoiceList(list, true);
    this.choices.el.classList.add("sk-in");
    this.choices.el.style.setProperty("--i", "1");
    this.root.appendChild(this.choices.el);
    this.root.appendChild(screenHint("2", "↑ ↓ choose · Enter takes it · Esc resumes"));
  }
}
