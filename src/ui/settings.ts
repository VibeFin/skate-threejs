// THE SETTINGS CARD — the screen that finally reaches the presets.
//
// The whole picture ladder has existed since the gauntlet run and nothing has
// ever called it. `src/render/look.ts` carries three complete rungs (edge
// smoothing, corner shade, glow size, the motion shutter, the far-field
// defocus, the lens grime, the fringe and the definition ring), `tier.ts`
// already persists the player's pick per device and `startingPreset` already
// reads it at boot — but `setQualitySetting` had no caller anywhere in the
// game, so the choice was unreachable and the player rode whatever the boot
// probe decided for him. This file is the missing half: the screen.
//
// WHAT IS ON IT — and it is a SHORT list, because the player read the first
// draft of this screen and said so: *"there's no need to add a lot of
// unnecessary subtext in the settings everywhere. It should be brief."*
//   · Auto / High / Medium / Low, the four the kit defines, as four bare words.
//     No caption under any of them. The gold IN USE tag on one of them is the
//     whole of what the screen has to say about which is which.
//   · MUSIC and EFFECTS — the two levels, which have been persisted and applied
//     since milestone 8 with no control attached to them (`audio/settings.ts`
//     stores them on the device and on the account; `GameAudio` exposes them as
//     two live properties and asks, in its own comment, for a screen to draw
//     them). Both rows are here because the store genuinely supports it.
//   · BACK.
//
// WHAT CAME OFF IT in that same pass: the line of small caps over the heading,
// the gold hairline under it, the PICTURE and SOUND group headings, the caption
// under every rung, the paragraph that explained whatever was highlighted, and
// the small print under the lot. Seven strings of chrome around eleven words of
// actual choice. The two groups still read apart — they do it with air now (see
// `set-step`) instead of with a heading each, which is a thing the eye does for
// free and the player never has to read.
//
// The small print was carrying two TRUE facts the player cannot discover any
// other way, and they did not simply die with it — they are one short tag each,
// in the same slot as IN USE, on the exact row each one is about, and each shows
// only on a machine or in a moment where it is true. See `rungNote`.
//
// WHAT IT LOOKS LIKE is not decided here, exactly as `pause.ts` says of itself:
// the heading, the choices, the entrance and the highlight all come out of
// `SCREEN_CSS` and `ChoiceList` in `hud.ts`. This screen is a SIBLING of the
// pause card, not a second art direction — same wash, same bare stencil words,
// same one-highlight-for-keyboard-and-mouse rule, and the same strip-down.
// Nothing sits on a plate (AGENTS.md rule 6): the darkening is a radial field
// with no straight edge in it, and the two volume meters are the balance gauge's
// own skewed ticks, which are the widget rather than a bar drawn on top of a
// box.
//
// NAVIGATION is the pause card's, unchanged: up and down move the highlight,
// Enter takes it, hovering MOVES the highlight rather than lighting a second
// one, and Escape closes. The one addition is on the two volume rows, and it is
// an addition rather than a contradiction: while the highlight is on Music or
// SFX, left and right move that level (left quieter, right louder — the meter
// fills to the right, so the key matches the label, AGENTS.md rule 17). On
// every other row left and right still walk the list exactly as they do on the
// pause card. The meters are also draggable, because a level is the one thing
// on either screen a mouse is genuinely better at.
//
// UNLIKE THE PAUSE CARD, this one does put itself away. The pause card cannot,
// because the sim is frozen behind it and only the boot knows how to unfreeze;
// nothing at all depends on this card being up, so Escape closes it here and
// tells the boot afterwards.
//
// It opens over the pause card mid-game and over the title screen, and it is
// the same object both times — z-index 19 puts it over the pause card (18) and
// the title screen (15) and under the loader (20). It never touches the pause
// flag: the card underneath is still up when this one closes, so Escape,
// Escape walks back out to the game.

import {
  detectTier,
  getQualitySetting,
  setQualitySetting,
  type QualitySetting,
  type QualityTier,
} from "../controllers/quality/tier";
import type { LookStack } from "../render/look";
import { ChoiceList, claimKeys, installScreenStyles, screenHint, type Choice } from "./hud";

/**
 * What this screen needs off the look stack, and it is two members: write the
 * setting, then ask the stack to re-read it. `refreshFromSetting()` rather than
 * `setPreset()` deliberately — the picker has FOUR options and only three of
 * them name a preset, so a screen that called `setPreset` would have nothing to
 * pass for Auto. The stack is handed in; this file never imports the module's
 * runtime or reaches for a global.
 */
export type SettingsLook = Pick<LookStack, "refreshFromSetting" | "preset">;

/**
 * What this screen needs off the audio layer — `GameAudio` satisfies it as it
 * stands. The two levels are live properties (setting one ticks the mix inside
 * 50 ms and persists it to the device and the account), and `onLevels` fires
 * when the ACCOUNT's stored copy lands after boot, which is the one moment the
 * numbers can change under a screen that is already drawn.
 */
export interface SettingsAudio {
  musicVolume: number;
  sfxVolume: number;
  onLevels: ((levels: { music: number; sfx: number }) => void) | null;
}

export interface SettingsOptions {
  look: SettingsLook;
  /** Omit it and the SOUND group is not drawn at all. */
  audio?: SettingsAudio;
  /** The card has already closed itself by the time this runs. */
  onClose?: () => void;
  /**
   * Open the LOOK LAB — the player's own temporary lighting/post tuning panel.
   *
   * TEMPORARY BY DESIGN, and this row is the whole of its front door. The
   * contract bans debug-only code and hidden test modes; a panel the player
   * asked for out loud is not that, but it only stays honest if there is no
   * secret way in. So there is exactly one visible row and no key chord, and
   * omitting this option removes the row entirely — which is what deleting the
   * panel will do.
   */
  onLookLab?: () => void;
}

const CSS = `
/* Over the pause card at 18 and the title screen at 15, under the loader at 20
   — this is the only screen in the game that can open on top of another one. */
#settingsscreen {
  position: fixed; z-index: 19; pointer-events: none;
  background:
    radial-gradient(80% 96% at 50% 50%,
      rgba(6,8,14,.92) 0%, rgba(6,8,14,.74) 46%, rgba(6,8,14,.46) 100%),
    radial-gradient(58% 86% at 108% 50%,
      rgba(138,22,12,.42) 0%, rgba(96,16,9,.2) 46%, rgba(8,10,6,0) 80%);
  backdrop-filter: blur(5px) saturate(.7);
  -webkit-backdrop-filter: blur(5px) saturate(.7);
}
/* Only a card that is actually up takes the mouse — a faded-out full-screen
   layer that still eats clicks is a control the player cannot see. */
#settingsscreen.is-on { pointer-events: auto; }
/* Seven rows instead of the pause card's three, so the words come down a size.
   Same face, same treatment, same highlight — only the scale moves. */
#settingsscreen .sk-choice {
  font-size: clamp(17px, 2.35vw, 30px);
  padding: .1em .5em;
}
/* THE RHYTHM, NOW THAT THE WORDS ARE GONE. Same job as the block at the bottom
   of pause.ts and the same rule: these are GAPS and they draw nothing. What
   used to hold this screen apart was an eyebrow, a hairline, two group headings
   and a caption on every row; with all of that out at the player's word, the
   spacing has to be spacing. */
#settingsscreen .sk-choices { margin-top: clamp(14px, 3vh, 36px); }
#settingsscreen .sk-choices.col { gap: clamp(3px, 1vh, 12px); }
#settingsscreen .sk-hint { margin-top: clamp(13px, 2.8vh, 32px); }
/* …and the three groups — the four rungs, the two levels, the way out — say so
   with a beat of extra air before each new one. It is what the PICTURE and
   SOUND headings were doing that the eye actually used; the words themselves
   were telling the player something the meters and the rung names already say.
   No line, no box, no heading (AGENTS.md rule 6). */
#settingsscreen .sk-choice.set-step { margin-top: clamp(7px, 1.7vh, 20px); }
/* THE ROW THAT IS IN FORCE. Gold, and it says so in words rather than by being
   the only lit one — the lit one is the CURSOR, and a screen where those two
   states share a treatment is a screen showing two answers. */
.set-state {
  font-family: "Barlow Condensed", system-ui, sans-serif; font-weight: 700;
  font-size: .3em; letter-spacing: .26em; text-transform: uppercase;
  color: #ffd23d; margin-left: .8em; vertical-align: middle;
}
/* THE ONE QUALIFIER A ROW MAY CARRY — three or four words, in the same slot and
   at the same size as the marker above, and deliberately NOT gold. Gold is the
   rung that is in force; a second gold string on the same line would be the
   screen showing two answers, which is the exact thing the marker's own note
   warns about. This one is the quietest text on the screen because it is a
   footnote that happens to be standing on the row it is a footnote to. */
.set-note {
  font-family: "Barlow Condensed", system-ui, sans-serif; font-weight: 700;
  font-size: .3em; letter-spacing: .22em; text-transform: uppercase;
  color: rgba(255,255,255,.46); margin-left: .8em; vertical-align: middle;
}
/* THE TWO LEVELS. The layout is a row rather than a stack because a level is a
   quantity and a quantity reads along a line: name, meter, number. */
.set-row { display: inline-flex; align-items: center; gap: .5em; }
.set-name { min-width: 3.4em; text-align: left; }
/* The meter is the balance gauge's own object — skewed ticks with a hairline
   round each, lit from the left. There is no track behind it and no box round
   it; the unlit ticks ARE the track. */
.set-bar {
  display: flex; gap: 2px; height: 14px;
  width: clamp(110px, 17vw, 210px); cursor: ew-resize;
}
.set-bar i {
  flex: 1; background: rgba(255,255,255,.2); transform: skewX(-22deg);
  box-shadow: 0 0 0 1px rgba(0,0,0,.6);
}
.set-bar i.on { background: #eafff2; }
.sk-choice.is-on .set-bar i.on { background: #ffd23d; }
/* Syne Mono is the instrument face — anything the game counts. One weight, so
   nothing here asks for a bold it does not have. */
.set-pct {
  font-family: "Syne Mono", monospace; font-size: .5em; letter-spacing: 0;
  color: #ffd23d; min-width: 3.2em; text-align: right;
}
.set-pct.off { color: rgba(255,255,255,.45); }
`;

/** How many ticks the level meters are cut into, and therefore the key step. */
const TICKS = 20;
const STEP = 1 / TICKS;

/**
 * THE PICTURE THE RENDERER WAS BUILT WITH, read once at page load.
 *
 * Half of `rungNote` below hangs off it, and it has to be captured out here
 * rather than in the constructor to be worth anything: this file is imported by
 * the boot, so module evaluation IS page load, and the screen itself is the only
 * thing in the game that ever writes the setting. Whatever is stored at this
 * instant is therefore exactly what the renderer went on to build itself from.
 */
const BOOT_SETTING: QualitySetting = getQualitySetting();

/**
 * Does this machine REFUSE part of the rung the player is pointing at?
 *
 * The first of the two true things the deleted small print was carrying, and the
 * reason it is worth keeping in some form: the veto is real, documented in
 * `look.ts`, and completely invisible. The corner shade needs the full post
 * rung, the far-field defocus rides its depth pass, the extra edge smoothing is
 * capped by what the tier says the machine can hold, and the shutter is capped
 * at five steps on the light rung — so a phone handed High quietly declines the
 * parts that are priced in memory. That is the behaviour that keeps it from
 * being killed mid-run rather than merely ugly, and a player who is never told
 * concludes the picker is broken.
 *
 * The two branches are the deleted paragraph's own two branches, unchanged: a
 * machine with no post at all is held on the lightest picture whatever it is
 * handed, and a light-post machine declines only the heaviest parts of High.
 * AUTO is never tagged — Auto asks for whatever this machine can actually hold,
 * so there is nothing for it to be refused.
 */
function cappedHere(setting: QualitySetting): boolean {
  const post = deviceTier().postLevel;
  if (post === "full") return false;
  if (post === "off") return setting === "high" || setting === "medium";
  return setting === "high";
}

/**
 * The machine the DEVICE CHECK sees, with the player's own pick taken out of it.
 *
 * `detectTier()` answers the player's stored setting first — that is its job, it
 * is what boots the renderer — so on a machine where somebody has already chosen
 * Low it reports the phone floor rather than what is actually under the game.
 * The screen has to say what the machine IS, so the probe runs with the setting
 * momentarily out of the way and the player's choice put straight back. It is
 * one localStorage round trip, synchronous, on the first open of a session, and
 * the restore is in a `finally` so an exception cannot leave the wrong value
 * behind. Cached afterwards: a device does not become a different device.
 */
let deviceTierCache: QualityTier | null = null;

function deviceTier(): QualityTier {
  if (deviceTierCache) return deviceTierCache;
  const chosen = getQualitySetting();
  if (chosen === "auto") {
    deviceTierCache = detectTier();
    return deviceTierCache;
  }
  try {
    setQualitySetting("auto");
    deviceTierCache = detectTier();
  } finally {
    setQualitySetting(chosen);
  }
  return deviceTierCache ?? detectTier();
}

type Row =
  | { kind: "quality"; setting: QualitySetting }
  | { kind: "volume"; channel: "music" | "sfx" }
  /**
   * The temporary look-lab door. Its own kind rather than a second `back`, for
   * two reasons: `set-step` gives a beat of air wherever the kind CHANGES, so
   * sharing a kind with BACK would glue the two together; and this row is the
   * one that disappears when the panel is deleted, so it is worth being able to
   * find it by name.
   */
  | { kind: "looklab" }
  | { kind: "back" };

/** Round to a whole tick, so the meter, the number and the stored value agree. */
function quantise(v: number): number {
  const n = Math.round(Math.min(1, Math.max(0, v)) / STEP);
  return Math.round(n * STEP * 100) / 100;
}

export class SettingsScreen {
  private opts: SettingsOptions;
  private root: HTMLDivElement;
  private choices: ChoiceList | null = null;
  private rows: Row[] = [];
  private release: (() => void) | null = null;
  private up = false;
  /** The last level either channel was at before it was muted, so Enter can put
   *  it back where the player had it rather than at somebody's idea of normal. */
  private lastLoud: { music: number; sfx: number } = { music: 0.5, sfx: 0.5 };

  constructor(opts: SettingsOptions) {
    this.opts = opts;
    installScreenStyles();
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement("div");
    this.root.id = "settingsscreen";
    this.root.className = "sk-screen";
    document.body.appendChild(this.root);

    // The account's stored levels land seconds after boot and only on a device
    // that has never been set — if that happens while this screen is up, the
    // meters are stale until somebody touches them. Chained rather than
    // assigned, so whatever else wanted to hear about it still does.
    const audio = opts.audio;
    if (audio) {
      const prev = audio.onLevels;
      audio.onLevels = (levels) => {
        prev?.(levels);
        if (this.up) this.paint();
      };
    }
  }

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
    // Newest claim wins, so this takes the arrows, Enter and Escape off the
    // pause card underneath — and off the title screen's own document listener,
    // which never sees the key at all while this claim is on top.
    this.release = claimKeys((e) => this.onKey(e));
  }

  close(): void {
    if (!this.up) return;
    this.up = false;
    this.root.classList.remove("is-on");
    this.release?.();
    this.release = null;
    this.choices = null;
    this.rows = [];
  }

  dispose(): void {
    this.close();
    this.root.remove();
  }

  /** Close and tell the boot. Escape and the BACK row are the same door. */
  private dismiss(): void {
    this.close();
    this.opts.onClose?.();
  }

  private onKey(e: KeyboardEvent): boolean {
    if (e.code === "Escape") {
      this.dismiss();
      return true;
    }
    // Left and right belong to the row under the highlight when that row holds a
    // level. Everywhere else they walk the list, which is what they do on the
    // pause card — so this is an addition to that contract and never a
    // disagreement with it.
    const row = this.rows[this.at()];
    if (row && row.kind === "volume" && (e.code === "ArrowLeft" || e.code === "ArrowRight")) {
      this.nudge(row.channel, e.code === "ArrowRight" ? STEP : -STEP);
      return true;
    }
    // Nothing on the screen follows the highlight any more — the paragraph that
    // used to be rewritten under it is gone, and the gold marker and the two
    // notes belong to rows rather than to the cursor. So walking the list draws
    // nothing, and the repaint that used to ride along with it went with the
    // paragraph.
    return this.choices?.handleKey(e) ?? false;
  }

  /**
   * Which row the highlight is on, read off the DOM.
   *
   * `ChoiceList` owns the cursor and does not publish its index; the lit button
   * is the same fact, and reading it here keeps one highlight and one owner
   * rather than a second copy of the cursor that could drift out of step with
   * the one the player can see.
   */
  private at(): number {
    if (!this.choices) return -1;
    const buttons = Array.from(this.choices.el.querySelectorAll<HTMLElement>(".sk-choice"));
    return buttons.findIndex((b) => b.classList.contains("is-on"));
  }

  private level(channel: "music" | "sfx"): number {
    const audio = this.opts.audio;
    if (!audio) return 0;
    return channel === "music" ? audio.musicVolume : audio.sfxVolume;
  }

  private setLevel(channel: "music" | "sfx", value: number): void {
    const audio = this.opts.audio;
    if (!audio) return;
    const v = quantise(value);
    if (v > 0) this.lastLoud[channel] = v;
    // The setter is the whole of it: the mix ticks immediately so a drag is
    // audible while it is happening, and the level is written to this device and
    // queued for the account. Nothing here persists anything itself.
    if (channel === "music") audio.musicVolume = v;
    else audio.sfxVolume = v;
    this.paint();
  }

  private nudge(channel: "music" | "sfx", delta: number): void {
    this.setLevel(channel, this.level(channel) + delta);
  }

  /** Enter on a level row silences it, and Enter again puts it back. */
  private toggleMute(channel: "music" | "sfx"): void {
    const now = this.level(channel);
    if (now > 0) this.setLevel(channel, 0);
    else this.setLevel(channel, this.lastLoud[channel]);
  }

  private choose(setting: QualitySetting): void {
    setQualitySetting(setting);
    // The stack re-reads the setting and rebuilds its chain. One call, because
    // Auto has no preset name to pass and the stack is the thing that knows what
    // Auto means on this machine.
    this.opts.look.refreshFromSetting();
    this.paint();
  }

  private build(): void {
    const audio = this.opts.audio;

    // One word. No eyebrow over it, no hairline under it, and no group heading
    // after it — see the note at the top of this file.
    this.root.innerHTML = `<div class="sk-head sk-in" style="--i:0">Settings</div>`;

    this.rows = [
      { kind: "quality", setting: "auto" },
      { kind: "quality", setting: "high" },
      { kind: "quality", setting: "medium" },
      { kind: "quality", setting: "low" },
    ];
    // No `note` on any row. `ChoiceList` only draws the caption line when one is
    // handed in, so the way to take the captions off this screen is to stop
    // passing them — the component is shared with the pause and results cards
    // and is not this file's to change.
    const list: Choice[] = [
      { label: "Auto", act: () => this.choose("auto") },
      { label: "High", act: () => this.choose("high") },
      { label: "Medium", act: () => this.choose("medium") },
      { label: "Low", act: () => this.choose("low") },
    ];
    if (audio) {
      this.rows.push({ kind: "volume", channel: "music" }, { kind: "volume", channel: "sfx" });
      // The label is built below rather than passed in: these two rows are a
      // name, a meter and a number on one line, not a word with a caption.
      list.push(
        { label: "", act: () => this.toggleMute("music") },
        { label: "", act: () => this.toggleMute("sfx") },
      );
    }
    // `this.rows` and `list` are PARALLEL ARRAYS, walked together by index in
    // the loop below — so every push to one needs its twin in the other, in the
    // same order. Adding the look-lab row to `list` alone is exactly the bug
    // that shipped: 8 buttons against 7 rows made `this.rows[7]` undefined, the
    // loop threw on `row.kind` after the heading had already been written, and
    // `open()` never reached its `is-on`. The card rendered its title and
    // nothing else, which read as "settings doesn't press".
    if (this.opts.onLookLab) {
      this.rows.push({ kind: "looklab" });
      list.push({ label: "Look lab", act: () => this.opts.onLookLab?.() });
    }
    this.rows.push({ kind: "back" });
    list.push({ label: "Back", act: () => this.dismiss() });

    const choices = new ChoiceList(list, true);
    choices.el.classList.add("sk-in");
    choices.el.style.setProperty("--i", "1");
    this.choices = choices;

    const buttons = Array.from(choices.el.querySelectorAll<HTMLElement>(".sk-choice"));
    buttons.forEach((button, i) => {
      const row = this.rows[i];
      // Where a new group starts, it gets a beat of air in front of it — the
      // whole of what is left of the PICTURE and SOUND headings. Read off the
      // row list rather than off a hard index, so a screen built without the
      // audio half still steps correctly in front of BACK.
      const first = this.rows[i - 1]?.kind !== row.kind;
      if (i > 0 && first) button.classList.add("set-step");
      if (row.kind === "volume") this.dressLevelRow(button, row.channel);
    });

    this.root.appendChild(choices.el);

    this.root.appendChild(
      screenHint("2", "↑ ↓ choose · ← → set the level · Enter takes it · Esc closes"),
    );

    // Open ON the choice that is in force, not on the top of the list — the
    // first thing the screen should tell the player is where they already are.
    const current = getQualitySetting();
    const startAt = this.rows.findIndex((r) => r.kind === "quality" && r.setting === current);
    choices.select(startAt < 0 ? 0 : startAt);
    this.paint();
  }

  /** Name, meter, number — and the meter is a real control, not a readout. */
  private dressLevelRow(button: HTMLElement, channel: "music" | "sfx"): void {
    button.classList.add("set-row");
    button.innerHTML = "";

    const name = document.createElement("span");
    name.className = "set-name";
    // "Effects" rather than "Sound", which is the heading these two sit under —
    // and rather than "SFX", which is a word the game would be teaching the
    // player instead of using.
    name.textContent = channel === "music" ? "Music" : "Effects";
    button.appendChild(name);

    const bar = document.createElement("div");
    bar.className = "set-bar";
    for (let i = 0; i < TICKS; i++) bar.appendChild(document.createElement("i"));
    button.appendChild(bar);

    const pct = document.createElement("span");
    pct.className = "set-pct";
    button.appendChild(pct);

    const setFromX = (clientX: number): void => {
      const box = bar.getBoundingClientRect();
      this.setLevel(channel, (clientX - box.left) / Math.max(1, box.width));
    };
    let dragging = false;
    bar.addEventListener("pointerdown", (e) => {
      // The meter is inside the button, and the button's own click toggles mute.
      // Stopping both here is what keeps a click on the meter from setting a
      // level and then silencing the channel it just set.
      e.stopPropagation();
      e.preventDefault();
      dragging = true;
      bar.setPointerCapture(e.pointerId);
      setFromX(e.clientX);
    });
    bar.addEventListener("pointermove", (e) => {
      if (dragging) setFromX(e.clientX);
    });
    const stop = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
    };
    bar.addEventListener("pointerup", stop);
    bar.addEventListener("pointercancel", stop);
    bar.addEventListener("click", (e) => e.stopPropagation());
  }

  /** Redraw everything that can change: the marker, the note, the meters. */
  private paint(): void {
    if (!this.choices) return;
    const current = getQualitySetting();
    const buttons = Array.from(this.choices.el.querySelectorAll<HTMLElement>(".sk-choice"));

    buttons.forEach((button, i) => {
      const row = this.rows[i];
      if (!row) return;
      if (row.kind === "quality") {
        // IN USE first, the qualifier after it — the state of the row before
        // the footnote about it.
        this.mark(button, "set-state", row.setting === current ? "In use" : "", "set-note");
        this.mark(button, "set-note", this.rungNote(row.setting, current), "");
      } else if (row.kind === "volume") {
        const level = this.level(row.channel);
        const lit = Math.round(level * TICKS);
        const ticks = button.querySelectorAll<HTMLElement>(".set-bar i");
        ticks.forEach((tick, t) => tick.classList.toggle("on", t < lit));
        const pct = button.querySelector<HTMLElement>(".set-pct");
        if (pct) {
          pct.textContent = level > 0 ? `${Math.round(level * 100)}%` : "off";
          pct.classList.toggle("off", level <= 0);
        }
      }
    });
  }

  /**
   * THE TWO TRUE THINGS THAT SURVIVED THE CUT, at four words apiece.
   *
   * The screen used to end in a paragraph and a line of small print. The player
   * asked for both to go and brevity wins — but two of the facts in them were
   * not decoration, they were things the game does that the player cannot find
   * out any other way, and a fact that fits in four words does not need a
   * paragraph to be told in.
   *
   *   · CAPPED ON THIS MACHINE — the device veto (see `cappedHere`). It rides
   *     the rung it is about, and only on a machine that actually vetoes it, so
   *     a desktop never sees the words at all.
   *   · SHARPNESS SETTLES NEXT LAUNCH — the picture changes under the player's
   *     hand the instant he picks, but the tier chosen at boot still owns the
   *     resolution cap, the shadow map and the frame target, and those are built
   *     into the renderer. So the effects move now and the sharpness moves next
   *     time. It shows on the rung IN FORCE and only once the player has
   *     actually changed the setting this session, which is the one moment the
   *     fact is both true and the thing he is wondering about.
   *
   * One at a time, never both: the veto is the older and larger fact, and a row
   * carrying two footnotes is the small print growing back a word at a time.
   */
  private rungNote(setting: QualitySetting, current: QualitySetting): string {
    if (cappedHere(setting)) return "Capped on this machine";
    if (setting === current && setting !== BOOT_SETTING) return "Sharpness settles next launch";
    return "";
  }

  /**
   * Put one short tag on a row, move it, or take it away.
   *
   * Written once for both tags because the rule they share is the fiddly part:
   * a tag that is created fresh every paint would restart nothing visually but
   * would leak a node per redraw, and one that is simply appended would land in
   * whatever order the two happened to first apply in. `before` names the class
   * this one must sit in front of; missing or absent, it goes on the end.
   */
  private mark(button: HTMLElement, cls: string, text: string, before: string): void {
    let tag = button.querySelector<HTMLElement>(`.${cls}`);
    if (!text) {
      tag?.remove();
      return;
    }
    if (!tag) {
      tag = document.createElement("span");
      tag.className = cls;
      button.insertBefore(tag, before ? button.querySelector(`.${before}`) : null);
    }
    tag.textContent = text;
  }
}
