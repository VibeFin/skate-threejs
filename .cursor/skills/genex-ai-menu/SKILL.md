---
name: genex-ai-menu
description: Generate a cinematic game menu — one looping atmospheric video background plus animated DOM buttons — with `npx genex image` + `npx genex video --frame`. Reach for it when a menu wants generated art or motion: title, victory/defeat, lobby, and credits screens that should feel like the game's opening shot. Plain CSS panels stay right for restrained registers and for utilitarian overlays like pause and settings.
---

# Genex AI · Menu

Turn two commands into a cinematic menu: one looping atmospheric mp4 as the
full-screen background, 3–5 HTML buttons on top. The video sets the mood; the
buttons are ordinary DOM, so the menu stays crisp, localizable, and wired to
real game events.

## When to use this vs. a plain CSS menu

- **Use this skill** when the menu should feel like the game's opening shot —
  a title screen with weather and light, a defeat screen over smoldering
  ruins, a lobby with the arena breathing in the background — or when the
  player asks for an animated title screen. Enqueue the pieces with
  `--no-wait` and keep building.
- **Use plain CSS** (`$genex-threejs-game-ui` alone) when the game's register
  is restrained, and for utilitarian screens — a quick pause overlay or a
  settings list, where a dark translucent panel is usually more readable. A
  title screen composed in type and light is a finished menu. (The loader is
  never a bare bar either: it shows something of the game rather than a black
  screen — see the game-ui loader spec.) You can also get the best of both:
  reuse this skill's menu video under a darker overlay for pause/victory
  variants (see Tips).

## Style brief first

Use the game's ONE shared style brief from `$genex-threejs-game-ui`
(materials, 4–5 named hues, font pair, mood) — the menu, HUD, and loader all
consume the same brief; don't write a second one here. The brief is words,
and words are what the still is prompted from. The style is THIS game's:
don't default to any stock register the examples below might suggest. Two
hard rules for the frame prompt:

- **Full-bleed cinematic 16:9.** The frame is a filmic establishing shot,
  edge to edge. End the prompt with: `Edge-to-edge cinematic composition.
  Full-bleed 16:9 frame. No UI elements, no text, no buttons in the frame.`
- **NO UI in the frame — ever.** No buttons, no title text, no logos, no
  menus baked into the image. All of that is DOM on top. If the image model
  draws UI into the frame, the prompt was wrong — rewrite and regenerate.

This dedicated UI-free **menu still is the ONLY valid `--frame` input** for
the menu video. Any image with interface in it — a HUD sheet, a gameplay
screenshot — ships a menu with widgets floating in the backdrop: an instant
defect, not a shortcut. When an image the menu genuinely should match already
exists (reference art the player supplied, key art the game already ships),
`--edit <url>` anchors the still to it so the two share one palette and
light; otherwise prompt the still straight from the brief. Then animate the
STILL.

## Choose the composition — one archetype per game, chosen on purpose

The single most common menu failure is shipping the same left-rail layout
regardless of genre. Before writing menu markup, pick ONE archetype and have
a reason for it out of the style brief — **defaulting to left-rail without a
reason is the failure mode this section exists to kill:**

- **Left rail** — title upper-left or top, buttons stacked left of center
  (~38%), vista breathing on the right. Fits: exploration, RPG, anything
  whose still has a strong right-side subject. (The worked example below
  implements this one — it is ONE archetype, not the default.)
- **Centered stack** — logotype dominant top-center, buttons in a tight
  column directly under it. Fits: title-driven games, arcade, sports,
  anything with a strong wordmark. Delta: center the title block, buttons
  `left: 50%; transform: translateX(-50%)`.
- **Bottom command bar** — buttons in one horizontal row along the bottom
  edge, title above the fold. Fits: fighting, racing, arcade cabinets.
  Delta: a flex row pinned to `bottom: 8%`, generous letter-spacing.
- **Boxed plate buttons** — buttons carry visible plates (brief-styled CSS
  plates, or sprite chrome from the HUD sheet). Fits: RPG/fantasy,
  crafted/ornate briefs. Delta: `.menu-btn` gets a background plate,
  border, and hover lift instead of bare text.
- **Diegetic corner** — buttons anchored into a calm region OF THE SCENE
  (a doorway, a dashboard, dead sky). Fits: horror, immersive sims; pairs
  with a still prompted to leave negative space ("the lower right third is
  calm open water").
- **Minimal fullbleed** — the vista is the hero; tiny corner links, no
  stack at all. Fits: art games, ambient toys. Delta: 2–3 small text links
  bottom-left, heavy letter-spacing, nothing over the subject.

**Second choice — button treatment,** decided with it: bare text
(cinematic, the example below) / CSS plate (styled FROM the brief —
gradients, borders, chamfers per the game-ui corner rules; default-gray
plates are a defect) / sprite chrome (from a HUD sheet or a dedicated
generation, when the brief is ornate) / real glass
(`npx genex image "<frosted panel>" --glass` — menus love frosted panels,
and the solved RGBA carries TRUE translucency over the moving backdrop;
`$genex-ai-image` documents the lane). The per-genre lean lives
in the style capsules (`$genex-threejs-game-ui`'s
references/style-capsules.md) — a lean, not a rule.

## Single-frame vs two-frame

- **Single-frame (default — use this).** Generate ONE image and pass it as
  `--frame`: the video model receives it as both the first and last frame, so
  frame N equals frame 0 and the loop is mathematically seamless. Constraint:
  the motion prompt must describe **return-to-start** motion — a cycle that
  ends where it began. Good: "ravens circle the spire and return to their
  perches", "fog drifts left then back right", "candle flames flicker".
  Bad: "camera dollies forward into the gate" (one-way motion fights the
  identical endpoints and produces a visible hitch).
  **The seam is YOUR job, not the model's:** in practice the clip lands
  *near* frame 0, not exactly on it, and a bare `video.loop = true` shows a
  visible hitch every cycle. Always wire the video with the DOM crossfade
  below, and watch one full cycle before calling the menu done. (Do not
  reach for `--loop` here: it routes to a different model with a first-class
  loop param but NO frame conditioning — the video won't match your key art —
  and server-side `--frame` overrides `--loop` anyway, so passing both does
  nothing.)
- **Two-frame** (`--first-frame` + `--last-frame`) only when the menu
  genuinely needs a state change (rain starts and persists, a figure walks in
  and stays). The loop will have a visible seam where the last frame snaps
  back to the first — accept that trade deliberately or don't use it.

## Run

```bash
# 1. The frame — a still of the scene the loop returns to (this example is a
# painterly meadow; YOUR prompt comes from YOUR game's style brief, in words).
# If the menu should match an image that already exists, add --edit <url> so
# the two share one palette and light. The still stays UI-free — an image
# with interface in it is never the video frame:
npx genex image "windswept alpine meadow at golden hour, wildflowers leaning in the gusts, painterly light, cinematic wide shot. Edge-to-edge cinematic composition. Full-bleed 16:9 frame. No UI elements, no text, no buttons in the frame." --aspect 16:9 --quality high
# -> https://assets.genex.technology/generations/<id>/image-main

# 2. Animate it into a seamless loop (same image as first AND last frame).
# Enqueue in the background and keep building — video takes minutes:
npx genex video "grass and wildflowers sway and settle back, clouds drift and return, light shimmers" --frame https://assets.genex.technology/generations/<id>/image-main --duration 8 --no-wait
# -> Queued (<gen-id>)

# 3. Later — pick the finished loop up (safe to re-run; never creates a new one):
npx genex wait <gen-id>
# -> https://assets.genex.technology/generations/<gen-id>/video-mp4
```

## Seamless in the DOM — the loop crossfade (how every menu video is wired)

Never wire the clip as a bare `<video loop>` — the residual seam shows every
cycle. Two stacked `<video>` elements with the same src crossfade at the
cycle end; any seam disappears deterministically, no regeneration lottery.

**Phone tiers get the poster, not the videos** (`$genex-threejs-adaptive-quality`):
two preloading HD decoders while the 3D scene boots is a spike at exactly the
moment phones get killed for memory. On a phone tier, show the key-art poster
image (a captured frame of the clip works) and skip `seamlessLoop` entirely —
or defer ONE non-preloading video until after the first gameplay frame:

```ts
/** Deterministic seamless loop: two stacked <video>s crossfade at cycle end. */
export function seamlessLoop(holder: HTMLElement, url: string, fade = 0.6): void {
  const mk = (): HTMLVideoElement => {
    const v = document.createElement("video");
    v.src = url; v.muted = true; v.playsInline = true; v.preload = "auto";
    holder.appendChild(v);
    return v;
  };
  let front = mk(), back = mk();
  front.style.opacity = "1";
  void front.play();
  const tick = (): void => {
    if (front.duration > 0 && front.currentTime >= front.duration - fade && back.paused) {
      back.currentTime = 0;
      void back.play();
      front.style.transition = back.style.transition = `opacity ${fade}s linear`;
      back.style.opacity = "1";
      front.style.opacity = "0";
      const old = front; front = back; back = old;
      window.setTimeout(() => back.pause(), fade * 1000 + 50);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
```

Pause both videos when the menu phase hides (they're decode work), and
resume the front one when it returns. Watch ONE full cycle in the browser
before calling the menu done — that's the seam check, and once the video is
wired it is the menu's capture in the milestone smoke pass: one full loop
cycle watched AS RENDERED. A metadata probe (ffprobe) can't see a seam, a
panel covering the video, or a video that never plays — only watching can.

**Work async — the menu must never block the game.** The still is prompted
from the brief, so it can go out the moment you know the look: enqueue it
`--no-wait` and keep building. **The video is the slow, expensive item** —
generate it once you've decided the menu wants motion, or the player asks for
it, and never while a style objection is open ("change the colors" waits
until the look settles, or you pay for the loop twice). Ship the CSS menu
(buttons + title over the frame IMAGE as a static backdrop) and swap the
`<video>` in when `genex wait` prints the URL. The frame image doubles as the
**loading screen background** — it exists minutes before the video does (see
`$genex-threejs-game-ui`'s loader spec). Both assets live in Genex storage
(R2) — permanent, public, CORS-open; you load them straight from the printed
URLs, nothing is downloaded or committed.

**When the generated art lands, the upgrade is a RE-COMPOSITION — not a
backdrop swap.** DELETE the panel/card that carried the buttons while the art
rendered, the moment the still or video goes in: the still was generated with
negative space precisely so the buttons and logo sit DIRECTLY on the key art.
A card left floating over the finished video is the single most common bad
menu — a near-opaque panel (plus its darkening layers) hides the art you just
paid for, and the menu reads as if it never landed. Allowed over the art: a
thin, low-opacity scrim strictly behind the button rail for legibility, and
at most ONE subtle full-screen grade layer. NEVER a card/panel covering the
art.

**Two failed video attempts = ship the still. Hard stop.** Video is the one
generation that fails server-side with real frequency (render timeouts), and
every attempt costs minutes of waiting. One retry is fair — shorten the clip
(4–6 s) and simplify the motion prompt. After a SECOND failure, stop
generating: keep the key-art still as the menu background and give it life
for free with a slow CSS pan/zoom (`transform: scale(1.06)` over ~20 s,
alternating), tell the user in one plain line ("the animated menu backdrop
kept failing, so your menu uses the key art — looks great, costs nothing"),
and spend those minutes in the game. A third attempt is how half an hour
disappears into chrome — the CLI counts failures and reminds you at the
second one. The still-image menu is a real menu: this rule is the built-in
fallback, not a downgrade to apologize for.

## Wire it as a phase screen

The menu is one `data-phase` screen in the `$genex-threejs-game-ui`
architecture (the `#ui` overlay + `setPhase()` state machine). Complete
worked example — this implements the **left rail** archetype with **bare
text** buttons; adapt the positions and treatment to YOUR chosen archetype
(the wiring — stagger, selection, intents — carries to all of them):

```html
<div id="ui">
  <div id="screen-menu" class="screen" data-phase="menu">
    <!-- seamlessLoop() (above) injects two crossfading <video>s here -->
    <div class="menu-bg" id="menu-bg"></div>
    <div class="menu-title stagger" style="--i: 0">EMBERFALL</div>
    <button class="menu-btn stagger" id="menu-play"    style="--i: 1; left: 38%; top: 52%; width: 24%; height: 8%;">PLAY</button>
    <button class="menu-btn stagger" id="menu-options" style="--i: 2; left: 38%; top: 63%; width: 24%; height: 8%;">OPTIONS</button>
    <button class="menu-btn stagger" id="menu-credits" style="--i: 3; left: 38%; top: 74%; width: 24%; height: 8%;">CREDITS</button>
    <div class="menu-corner stagger" style="--i: 4">v1.0</div>
  </div>
  <!-- other .screen phases (playing HUD, pause, over) live beside it -->
</div>
```

```css
#screen-menu { position: absolute; inset: 0; overflow: hidden; background: #000; }
.menu-bg { position: absolute; inset: 0; }
.menu-bg video { position: absolute; inset: 0; width: 100%; height: 100%;
                 object-fit: cover; opacity: 0; }
.menu-title {
  position: absolute; left: 0; right: 0; top: 14%; text-align: center;
  font-family: "Cinzel", serif; font-size: 9vh; color: #f4e3b8;
  letter-spacing: 0.08em;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.85), 0 8px 32px rgba(0, 0, 0, 0.6);
  pointer-events: none;                    /* the title is decor, NOT a button */
}
.menu-btn {
  position: absolute; border: none; background: transparent; cursor: pointer;
  font-family: "Cinzel", serif; font-size: 4vh; color: rgba(255, 255, 255, 0.92);
  letter-spacing: 0.12em; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9);
  transition: transform 160ms ease, color 160ms ease, text-shadow 160ms ease;
}
/* ONE selected state serves mouse hover, keyboard focus, and gamepad alike. */
.menu-btn.is-selected, .menu-btn:hover, .menu-btn:focus-visible {
  color: #fff; transform: translateX(0.4em) scale(1.04); outline: none;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9), 0 0 22px rgba(255, 220, 150, 0.8);
}
.menu-btn.is-selected::before {
  content: "❯"; position: absolute; left: -1.1em; opacity: 0.9;
}
.menu-btn:active { transform: translateX(0.4em) scale(0.97); }
.menu-corner {
  position: absolute; right: 2%; bottom: 2%; font-size: 1.8vh;
  color: rgba(255, 255, 255, 0.6); pointer-events: none;
}

/* Entrance choreography — title first, buttons stagger in, corner last.
   `.is-on` is toggled by setPhase() (see $genex-threejs-game-ui's Motion
   section); each element stamps its own --i in the HTML above. */
.screen .stagger { opacity: 0; transform: translateY(12px);
                   transition: opacity 320ms ease, transform 320ms ease;
                   transition-delay: calc(var(--i, 0) * 70ms); }
.screen.is-on .stagger { opacity: 1; transform: none; }
```

```ts
// Buttons emit the SAME intents the gameplay input path uses — never a page reload.
// setPhase() carries the camera's lock lifecycle (game-ui's
// `followCam?.setPaused(phase !== "playing")` binding), so PLAY locks inside this
// click and Options/Credits clicks can never lock the pointer — a cursor that
// vanishes while a menu is still up is a shipped defect.
document.getElementById("menu-play")!.addEventListener("click", () => setPhase("playing"));
document.getElementById("menu-options")!.addEventListener("click", () => setPhase("options"));
document.getElementById("menu-credits")!.addEventListener("click", () => setPhase("credits"));

// Menus are keyboard-first: ↑/↓ moves the selection, Enter activates.
// Mouse hover drives the SAME selection, so the chevron never disagrees.
const btns = [...document.querySelectorAll<HTMLButtonElement>("#screen-menu .menu-btn")];
let sel = 0;
function select(i: number): void {
  sel = (i + btns.length) % btns.length;
  btns.forEach((b, j) => b.classList.toggle("is-selected", j === sel));
}
btns.forEach((b, i) => b.addEventListener("mouseenter", () => select(i)));
select(0);
document.addEventListener("keydown", (e) => {
  if (document.getElementById("screen-menu")!.hidden) return;
  if (e.key === "ArrowDown") select(sel + 1);
  else if (e.key === "ArrowUp") select(sel - 1);
  else if (e.key === "Enter") btns[sel].click();
});
```

Layout rules baked into the example:

- **`<video autoplay muted loop playsinline>`** — `muted` is what makes
  autoplay legal before any user gesture (the menu IS the first screen);
  `object-fit: cover` + `inset: 0` fills any viewport without letterboxing.
- **Normalized `%` boxes, kebab-case stable ids.** Buttons are absolutely
  positioned with percentage boxes so the layout scales with the viewport.
- **The big title is NOT a button** — a top-center decorative element with
  `pointer-events: none`. 3–4 action buttons stack below it; a small
  version/handle string sits in a corner. Layered `text-shadow` beats
  `-webkit-text-stroke` for weight (a heavy stroke reads as a browser game).
- **Everything enters choreographed** — nothing may simply appear. Title,
  then buttons, then corner text, ~70 ms apart.
- **One visible selection at all times** (chevron + glow above), driven by
  keyboard AND mouse through the same `select()`.
- Clicks route to `setPhase()` / game events — the menu renders game state,
  it never owns a second copy of it.

## Menu sound

The video is necessarily muted, so an unwired menu is SILENT — that reads as
broken. Three `npx genex sfx` calls (see `$genex-ai-sfx`): a short hover tick
(wire to `select()`, quiet), a confirm on activate, and a low ambient loop
matching the scene (wind, surf, candle room tone) started on the first user
gesture (autoplay policy blocks earlier — a `click`/`keydown` once-listener).

## Pick the fonts

Match the display font to the genre and add its Google Fonts `<link>` to
`index.html` (otherwise the browser silently falls back to sans-serif and the
menu looks broken):

| Genre / mood | Display font | Body / small text |
| --- | --- | --- |
| Fantasy / RPG | Cinzel | EB Garamond |
| Sci-fi / racing | Orbitron or Russo One | Exo 2 |
| Military / action | Black Ops One | Oswald |
| Retro / 8-bit | Press Start 2P | VT323 |
| Sport / bold arcade | Anton | Barlow Condensed |
| Horror / typewriter | Special Elite | Courier Prime |
| Cozy / casual | Baloo 2 | Nunito |
| Painterly / adventure | IM Fell English | Crimson Text |
| Western / rustic | Rye | Bitter |
| Elegant / noir | Cormorant Garamond | Jost |

The table is a starting point, not a taxonomy — pick by the game's OWN
register, and browse Google Fonts' display category when none of these fits.
One display font + one body font per menu. Give text its own contrast against
the moving video — layered text-shadows or a subtle dark plate (avoid heavy
text strokes — they read as a browser game, not a title screen).

**Title treatment — a drawn wordmark, or type set well.** Generate the
logotype when the menu wants drawn lettering: an ornate, crafted, or comic
register, a name that IS the game's identity, a player who asks for one. When
the brief is restrained — minimal fullbleed, a vista a set wordmark would
fight — the title in the display font is a finished title, not a stand-in:

- **Logotype:**
  `npx genex image "the word 'EMBERFALL' as an ornate engraved game logo, <style brief>" --transparent`
  — the wordmark alone on a transparent background, in the brief's display
  register, no extra text or scenery. Then trim with `npx genex ui trim`.
  **`--transparent` already returns a finished cutout — a `--clean` pass is a
  REPAIR for a defect you can see, never routine polish.** Re-clean ONLY if
  the letter counters came out filled: `--bg-mode glyph` for hard flat
  shapes, `--bg-mode matte` for soft metallic, chromed, or glowing edges
  (most ornate wordmarks are soft edges — `glyph` is the wrong cutter for
  them). Then VERIFY over a bright test background, looking for BOTH
  failures: **(1)** an opaque disc or plate behind the mark — that plate
  ships as a hole punched in your key art; **(2)** coloured speckle or a
  rainbow rim along the letter edges — that means the clean pass DAMAGED the
  art, so go back to the `--transparent` original and ship that. Running a
  background remover over an image that was already transparent re-keys every
  edge it should have left alone; `ui trim`/`extract`/`audit` now refuse that
  output outright, and nothing downstream repairs it. Short names (one or two
  words) come out best. Wire it as the menu title AND the loader mark; the
  DOM keeps an accessible text fallback (`aria-label` or visually-hidden
  text).
- **Layered CSS (a finished title on its own, and the stand-in while a
  wordmark renders):** gradient ink via `background-clip: text` + stacked
  shadows (a tight dark one for contrast, a wide soft one for glow).

## Tips

- **Subtle motion beats dramatic.** The clip loops forever — cinematic drift,
  flicker, and weather read as alive; big camera moves and fast subjects make
  the loop obvious and exhausting.
- **One menu = ONE video, generated one-off — not iteratively.** Video
  generation is strictly rate-limited and takes minutes per attempt. Get the
  still frame right first (images are cheap to redo), then animate it once.
  The one exception: a user-driven style change re-opens this rule once —
  re-prompt the still against the new direction (or `--edit` it against the
  new reference) and re-run the video from the new still. Agent-initiated
  polish never does.
- **The menu video renders 1080p by default — leave it alone.** Every video
  path, the frame-conditioned (`--frame`) menu route included, defaults to
  1080p: the menu clip is full-screen key art, and 720p stretched across a
  desktop reads soft. Don't pass a resolution flag at all; `--resolution 720p`
  exists only as a deliberate cost opt-down for clips that are genuinely
  incidental — never the main menu.
- **Pause/victory/defeat variants reuse the same video — as GRADES.** Same
  `<video>` element or URL, different emotion via CSS `filter` on the
  background: pause = a plain dark overlay (`rgba(0,0,0,0.55)`); defeat =
  `filter: saturate(0.25) brightness(0.55)` with a ~600 ms beat before the
  buttons stagger in; victory = `filter: saturate(1.15) brightness(1.05)` with
  the score counting up (tween ~800 ms, never snap). Zero extra generations,
  three distinct moods.
- **Lobby screens:** matchmaking status and countdowns come from
  `$genex-threejs-multiplayer` — render the roster and `players.length /
  minPlayers` count over the same video, and drive the overlay's dismissal
  from `mm.matchmaking.status` exactly as that skill mandates.

## Publish checklist

- The mp4 loads from the **URL** the command printed — permanent and CORS-open,
  identical in local dev, the published game, and remixes. Nothing to commit.
- Don't copy the video into `public/assets/` — generated assets live in R2.
- Keep the `muted` attribute — without it, autoplay is blocked and the menu
  opens on a black rectangle.
- The Google Fonts `<link>` lives in `index.html`, so it ships with the build.

## Options

- `--frame <url>` (video) — one R2 image URL used as both the first and last
  frame: the seamless-loop mode. The URL must be one printed by `npx genex image`.
- `--first-frame <url>` / `--last-frame <url>` (video) — two-frame mode for a
  genuine state change; expect a loop seam.
- `--duration <sec>` (video) — 4, 6, or 8 for frame-conditioned clips;
  default 8.
- `--resolution <720p|1080p>` (video) — every path defaults to **1080p**, the
  `--frame` menu route included. `720p` is the deliberate cost opt-down
  (~half the credits) for incidental clips — not for the menu. Loop clips
  (`--loop`) ignore it (that model has no resolution parameter).
- `--aspect 16:9 --quality high` (image) — the right settings for a menu frame.
- `--no-wait` — enqueue and return immediately with the generation id; pick
  the result up later with `npx genex wait <id>` (safe to re-run — it attaches
  to the SAME generation). It is how a menu video is run — build while it
  renders. Re-running the GENERATE command, by contrast, creates (and bills)
  a new one.

## Troubleshooting

- **"Not authorized"** — run `npx genex init` first (in the project — it resolves this project's own CLI) (it
  writes your `GENEX_TOKEN`).
- **"Prompt rejected"** — the provider's content-safety filter blocked the
  prompt. Non-retryable; rewrite the wording.
- **Video takes minutes** — that's normal for video generation; enqueue with
  `--no-wait` and keep building, then `npx genex wait <id>` for the URL.
  Never re-run the generate command to "check on" a generation — every run
  creates (and bills) a new video; only `genex wait` attaches to an existing
  one.
- **The loop visibly "jumps"** — the motion prompt wasn't return-to-start
  (or you used two-frame mode). Re-generate the video with cyclical motion
  wording; the frame image can be reused as-is.
- **UI/text baked into the frame** — the frame prompt allowed it. Append the
  "No UI elements, no text, no buttons in the frame." sentence and regenerate
  the image.
- **Black screen instead of video** — the `muted` attribute is missing
  (autoplay blocked), or the URL isn't the exact one the command printed.
