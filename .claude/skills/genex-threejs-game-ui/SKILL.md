---
name: genex-threejs-game-ui
description: Design the UI HUD interface of a Genex Three.js game — work out the screen set this game actually needs (loader, menu, HUD, pause/win/lose, lobby) under one shared art direction, then build it as an animated DOM overlay. Use whenever the game needs on-screen text, meters, buttons, menus, or screens, or when the interface reads as a generic dashboard, covers the action, or shifts as numbers change.
---

# Genex Three.js Game UI

The interface is part of the game, not chrome around it. A strong UI layer tells
the player what to protect, what to chase, and what just happened — and it moves:
screens fade and stagger in, values tween, defeat feels different from victory.
This skill is the UI director for the 2D layer of a vanilla Three.js game: the
plan, the architecture, the states, motion, and readability rules.

## Work out which screens this game needs

Two minutes before the first UI file prevents the two failure modes no later
polish can fix: a screen set discovered piecemeal, and a menu styled in one
world while the HUD lives in another.

**1. Screen inventory — derived from the game type, not discovered later:**

| Screen | When it exists | Default tier |
| --- | --- | --- |
| Loader | always | 1 — branded (see loader spec below) |
| Main menu | most games; a few genuinely don't want one (an instant-restart arcade toy) — but "it's only a draft" is never the reason | 1 — animated CSS title screen; 2 — cinematic (`$genex-ai-menu`) when the game's style wants it |
| Pause | always — opens on the Escape key | 1 — menu backdrop under a dark overlay |
| Fail / retry | always | 1 — a *graded* variant of the menu screen |
| Win / next | always | 1 — graded variant, warm |
| Settings | always — every game carries the Quality picker (Auto/Low/Medium/High, `$genex-threejs-adaptive-quality`), and any game with generated audio carries **Music + SFX volume sliders** (persisted, applied live; music default 0.30, sfx ~0.7 — `$genex-ai-music`; a paid track with no volume control is a failure mode), plus whatever else it has to set | 1 |
| Lobby / waiting | multiplayer only | 1 over the menu backdrop |
| HUD | whenever the game shows state the player has to read | 1 — a restrained CSS HUD finished to the readability + motion rules below; 2 — generated sprites (`$genex-ai-hud`) when the game's style wants drawn chrome |

The lobby row is bound by `$genex-threejs-multiplayer`'s MANDATORY rule: the
waiting overlay's visibility is re-read from `mm.matchmaking.status` every
frame and closes the instant it flips to `playing` — verified in two browser
windows. Plan the lobby as a styled screen (roster + count over the menu
backdrop), not an afterthought `<div>`. In a game that genuinely has no menu,
every "menu backdrop" row above (pause, fail, win, lobby) grades over the
loader's key art instead.

The table lists screens; **elements are inventoried separately**. Walk the
whole loop in your head — loader → menu → spawn → action → pickup → damage →
death → retry → win — and write down EVERY on-screen element the player will
ever see: the reticle and each of its states, aim/interact cues, toasts,
damage numbers, kill feeds, timers, countdowns, pickup popups. That written
list is the authority on WHAT exists: mechanics come from the agreed game,
never from a picture — a widget that shows up in generated art with no
backing mechanic is cut before anything wires it.

**2. One shared style brief — for the WHOLE game, not just the UI.** Write it
once — 4–5 named hues, materials, one display + one body font, mood — and
store it as a comment block near the UI code. This brief, in WORDS, IS the
game's art direction: it comes out of the game's own concept and premise, and
everything downstream reads its palette, materials, and register from here.
For genre conventions worth borrowing — placement, hierarchy, type treatment,
material language — skim
[references/style-capsules.md](references/style-capsules.md).
`$genex-ai-menu`, `$genex-ai-hud`, the loader, and every plain-CSS screen
consume THIS brief verbatim — and so does the scene: the visual-direction
plan derives its lighting mood, fog, grading, and post-stack choices from the
same block. Two style briefs in one game is a bug; a scene graded in one
world under a UI styled in another is the same bug. The brief's font pair
is LOADED for real — a Google Fonts `<link>` (or `@font-face`) in
`index.html`, per `$genex-ai-menu`'s genre font table; a display font that
ships as a system-stack fallback (`Arial Black`, `Impact`) is the same bug in
type.

**3. Never stall the build on art.** Scaffold, boot wiring, the core loop,
and the gameplay-logic modules keep moving in parallel whatever the UI is
doing — and the core asset set (hero model, ground texture, skybox, sfx) is
prompted from the game IDEA, so it can launch up front behind placeholders.
Nothing ready to build waits on an art answer: decide, say the decision in
one line, keep going.

**4. Ask only when genuinely ambiguous.** If the game's premise pins the mood
(a "gothic horror dungeon crawler" pins it), decide and state it in one line.
Only when the art direction is truly open, ask ONE question with 2–3 concrete
directions, each naming its palette + font pair — using your question tool
when you have one; if you have none, a short numbered list in chat. Never ask
about the screen inventory — it derives from the game type.

**5. Style follows THIS game.** The examples in every Genex skill are
examples, not defaults. Do not default to neon/cyberpunk/synthwave — or any
other single register — unless the game calls for it.

## The tier ladder

- **Tier 1 — the interface you build, zero generations.** Everything in this
  skill: the planned screens, the shared brief, a branded loader, an animated
  CSS menu with keyboard navigation, phase transitions, UI sounds, vignette.
  Finished to this skill's readability, hierarchy, and motion rules, a
  restrained CSS interface is a real, finished HUD — not a placeholder, not a
  step toward something else. Plenty of games — anything spare, modern,
  systems-y, minimal — are done here and better for it.
- **Tier 2 — generated UI art, async, when the style asks for it.** The sprite
  HUD (`$genex-ai-hud`), the cinematic menu video (`$genex-ai-menu`), and the
  generated **logotype** — one `--transparent` wordmark in the brief's display
  register (`$genex-ai-menu`'s logotype step). Reach for this lane when the
  game's own style genuinely wants drawn chrome — ornate, painterly, comic,
  hand-made — or when the player asks for HUD art. It is
  **element-addressable**: generating ONE thing you decided the game needs — a
  frame, a mask, an icon, a wordmark, a menu backdrop, a menu video — is a
  normal, complete use of it, never a half-run pipeline. Enqueue `--no-wait`,
  keep building, pick results up with `npx genex wait <id>`, and swap them in
  as they land; while something is in flight, its id lives in DESIGN.md so a
  compaction can pick it back up. Tier 2 never blocks a playable v0 — and
  never park what landed: run `npx genex wait` on every enqueued ID before any
  publish and before the final handoff of a session. When you show the user a
  generated image, open it and paste the link (`npx genex wait <id> --open`,
  or generate with `--open`) — a bare URL in a terminal is invisible, and "do
  you like it?" with no picture in front of them is how that exchange fails.
  Whatever you do generate gets its quality steps IN FULL — extraction, masks,
  wiring, `npx genex ui audit`; judgment decides whether art is generated, it
  never loosens how well it's done.
- **Tier 3 — offer, don't build.** Video layers over the HUD, 9-slice panel
  sprites, animated menu sprites. Offer in one line
  after the player has seen the interface working; build on request.

## Architecture: DOM overlay by default

Genex games are plain Vite + Three.js apps, so the default UI layer is a DOM
overlay — HTML/CSS on top of the canvas, not text sprites inside the scene:

```html
<div id="ui">          <!-- fixed, full-screen, pointer-events: none -->
  <div id="hud">…</div>
  <!-- data-phase must exactly match a phase name in setPhase() below — that's how
       screens toggle. A phase with no screen (e.g. "playing") just hides them all. -->
  <div id="screen-loading" class="screen" data-phase="loading">…</div>
  <div id="screen-pause" class="screen" data-phase="paused" hidden>…</div>
  <div id="screen-over"  class="screen" data-phase="over" hidden>…</div>
</div>
```

```css
#ui { position: fixed; inset: 0; pointer-events: none; font-variant-numeric: tabular-nums; }
#ui button, #ui .screen { pointer-events: auto; }
```

`pointer-events: none` on the root keeps the canvas playable; re-enable it only
on elements that are actually clickable. Keep ALL layout in CSS — never
position UI by mutating inline pixel styles per frame. In-world (diegetic) UI —
a health bar floating over an enemy, a scoreboard mesh in a stadium — is the
exception for things that belong to the world, not the default.

## The states every game needs

Build these as show/hide layers over one state machine, not as ad-hoc DOM
edits scattered through the code:

1. **Loading** — the branded loader below; players must never stare at a black
   screen or a bare percentage.
2. **Playing HUD** — the minimal always-on layer (see hierarchy below).
3. **Pause** — freeze the loop, dim the scene, show resume/restart. Bound to
   the **Escape key in every game** — Escape pauses, Escape again (or Resume)
   unpauses; on touch, a small pause button. (With the bundled physics pack,
   freezing is built in: `physics.paused = true` plus `anims.setPaused(true)`
   — don't hand-roll a second clock.)
4. **Fail / retry** — what happened, the score, and a ONE-KEY instant restart
   (show which key). Restart must not reload the page.
5. **Win / next** — celebrate, then offer the next thing to do.
6. **Identity moments** — the player's name/guest identity comes from
   `$genex-threejs-embed-auth` (`waitForPlayer()`); leaderboards render from
   `getLeaderboard()`. Never invent your own login UI.
7. **Multiplayer lobby/points** — matchmaking status, countdowns, and match
   HUD state come from `$genex-threejs-multiplayer`; render what the SDK
   reports, don't guess at it.

## Escape must pause the game — not shrink the window

For a game that captures the mouse (first-person or pointer-lock aim — see the
pointer bucket in `$genex-threejs-camera-direction`), pressing Escape does two
**browser-reserved** things you CANNOT stop with `preventDefault`: it exits
fullscreen and releases pointer lock, and the player sees the window "shrink".
The real fix is the **Keyboard Lock API**, which routes Escape to your code
instead — Chromium only, and only in fullscreen. Enter fullscreen on a gesture
(the Deploy/Resume click), capture Escape, and own the pause:

```ts
// call ONLY from a user gesture (the Deploy click, the Resume click) — never at boot
async function enterImmersive(): Promise<void> {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
  } catch { /* sandboxed iframe or no gesture — the pointer-lock path below still pauses */ }
  // Chromium + fullscreen only: deliver Escape to us instead of exiting fullscreen.
  try {
    await (navigator as unknown as { keyboard?: { lock?: (k: string[]) => Promise<void> } })
      .keyboard?.lock?.(["Escape"]);
  } catch { /* Keyboard Lock unsupported — fine */ }
}

document.addEventListener("keydown", (e) => {
  if (e.code !== "Escape") return;
  e.preventDefault();                 // stops any *other* default; the reserved ones the lock handles
  if (phase === "playing") { document.exitPointerLock?.(); setPhase("paused"); } // free cursor for the menu
  else if (phase === "paused") { void enterImmersive(); canvas.requestPointerLock?.(); } // Esc resumes
});
```

- **On the bundled `FollowCamera`, it owns the lock — don't fight it.** Do NOT
  call `document.exitPointerLock()` / `canvas.requestPointerLock()` yourself; that
  desyncs its aim state (the cue flips wrong). Instead pause/resume through it —
  and bind it **on phase transitions, never per frame**: put
  `followCam?.setPaused(phase !== "playing")` inside `setPhase()` (below) and it
  covers everything at once — the BOOT menu parks aim, Escape's
  `setPhase("paused")` frees the cursor, and the Play/Resume click's
  `setPhase("playing")` re-locks inside the gesture. Read `onAimChange` for the
  cue. The raw calls above are only for a hand-rolled camera with no bundled
  controller.
- **Degradation is built in.** Where Keyboard Lock is absent (Safari, Firefox) or
  the game isn't fullscreen, the browser still releases pointer lock on Escape —
  so ALSO keep the pointer-lock-loss → pause path (`pointerlockchange`: if
  unlocked while `playing`, `setPhase("paused")`). Escape then always pauses; it
  only *also* drops fullscreen on browsers without the lock — unavoidable there.
- **Skip Keyboard Lock + fullscreen only when the cursor stays a tool.**
  Cursor-core / top-down / menu-driven games never capture the pointer — skip
  `enterImmersive` and Keyboard Lock entirely. But ANY game that locks the
  pointer during play — aim games AND keyboard-only racers/platformers/runners
  under the lock-or-tool rule (next section) — keeps the Escape → pause path and
  the `pointerlockchange` fallback (if unlocked while `playing`, pause): without
  it, Esc frees the cursor while the game keeps running. Keyboard-only games may
  still skip Keyboard Lock + fullscreen; the lock + pause/resume path is the
  non-negotiable part.
- **Dashboard embed:** no setup needed — the platform's game frame grants keyboard
  lock (and pointer lock + fullscreen), so Escape-to-pause works the same inside
  `/world/` + `/draft/` as it does standalone (`<slug>.genex.technology`).

A mouse-aim game earns its keep with a **look-sensitivity slider** in the pause
menu — trackpads feel slower than mice, so let the player tune it. On the bundled
camera the setter is live: `slider.oninput = () => { followCam.aimSensitivity = +slider.value; };`
(radians per pixel; default `0.0023`, a usable range is ~`0.0008`–`0.005`).

## The cursor during play: locked or a tool

During play the OS cursor is either the gameplay tool (cursor-core: click-to-move,
tower defense, builders, card/board — it stays visible, that's correct) or it is
**locked away — including keyboard-only games** (racer, platformer, runner): an
arrow parked over the action for the whole session is a shipped defect. Games on
the bundled `FollowCamera` get the lock free (on by default). A hand-rolled game
locks with ~6 lines, reusing this section's Escape flow:

```ts
// Once at setup (NOT inside the click handler — a fresh listener on every
// Resume stacks and multi-fires setPhase on a single unlock):
document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && phase === "playing") setPhase("paused");
});
// In the Play/Start/Resume CLICK handler (lock needs a user gesture):
canvas.requestPointerLock?.();          // hides the cursor, focuses the game
// Required (not optional): without Keyboard Lock, the browser consumes Esc to
// exit pointer lock and the keydown never reaches the page — the listener
// above is what pauses. The Resume click re-locks. Keyboard games need nothing
// more — no reticle, no aim code; the lock just parks the cursor.
```

If the lock is genuinely unavailable (a third-party embed without
`allow="pointer-lock"`), fall back to hiding the idle cursor over the canvas:
`canvas.style.cursor = "none"` after ~2s without `pointermove`, restored
instantly on move. Menus and pause screens always keep their cursor.

## The loader

The loader is the first thing every player sees — a bare "Loading… 3/5" over
black reads as a broken page. The branded version costs nothing:

- **Background:** the menu's still frame — when the game has a cinematic menu,
  that image exists BEFORE the video does; show it dimmed
  (`filter: brightness(0.6)`) behind the progress. Otherwise, something
  composed from the brief: an `npx genex image` key-art call in the house
  style, or a CSS backdrop built from the brief's hues (a gradient field, the
  logotype, a sliver of the game's own shapes). Flat black with a percentage
  over it is the thing to avoid.
- **Progress:** a thin bar styled from the brief (its accent hue), driven by
  real asset counts — never an indeterminate spinner alone.
- **Reveal:** when ready, fade the loader out (400–600 ms) into the menu or
  game. No hard cut.

## Motion — screens move or the game feels dead

Phase changes animate. `hidden` alone hard-cuts; pair it with a class so
opacity can transition:

```ts
function setPhase(phase: "loading" | "playing" | "paused" | "over" | "won") {
  for (const s of document.querySelectorAll<HTMLElement>("#ui .screen")) {
    const on = s.dataset.phase === phase;
    s.classList.toggle("is-on", on);
    if (on) s.hidden = false;                       // show immediately, then fade in
    else setTimeout(() => { if (!s.classList.contains("is-on")) s.hidden = true; }, 300);
  }
  // The camera's lock lifecycle rides the SAME transition — never the render loop
  // (optional-chained: the camera may not exist yet at the first "loading" call).
  followCam?.setPaused(phase !== "playing");
  // (Vehicle games combine conditions instead:
  //  followCam.setPaused(phase !== "playing" || activeId !== CHARACTER_ID).)
}
```

```css
#ui .screen { opacity: 0; transition: opacity 280ms ease; }
#ui .screen.is-on { opacity: 1; }

/* Entrance choreography: title first, buttons staggered, corner text last.
   Stamp --i per element: <button class="stagger" style="--i: 1"> … */
.screen .stagger { opacity: 0; transform: translateY(12px);
                   transition: opacity 320ms ease, transform 320ms ease;
                   transition-delay: calc(var(--i, 0) * 70ms); }
.screen.is-on .stagger { opacity: 1; transform: none; }
```

- **Defeat and victory are grades, not new screens.** Same backdrop, different
  emotion via CSS `filter` on the background — defeat
  `saturate(0.25) brightness(0.55)` with a ~600 ms beat before buttons stagger
  in; victory `saturate(1.15) brightness(1.05)` with the score counting up
  (tween the displayed number over ~800 ms; never snap it).
- **Buttons react**: a hover/focus state (scale, glow, or an indicator chevron)
  plus a pressed state. Menus are keyboard-first — ↑/↓ moves focus, Enter
  activates, and the hovered/focused item is visibly selected.
- **A menu action must release focus before gameplay begins.** A clicked
  `<button>` keeps browser focus, so a later gameplay Space/Enter can natively
  activate that same button again and repeat Play, Cancel, Leave, or Requeue.
  Blur inside every action handler before running the action:

  ```ts
  function wireButton(button: HTMLButtonElement, act: () => void) {
    button.addEventListener("click", () => {
      button.blur();
      act();
    });
  }
  ```

  Scope ↑/↓/Enter menu navigation to menu/lobby phases only. When a phase
  transition leaves a menu, also blur any focused button as a backstop:
  `if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();`
- **Values tween.** Score, coins, timers tick to their new value; health bars
  slide. A number that teleports reads as a bug even when it's correct.

## Sound — a silent UI is a bug

Hover tick, confirm click, and a fail/win stinger are three
`npx genex sfx` calls (`$genex-ai-sfx`); a cinematic menu also wants a quiet
ambient loop, because its video is necessarily muted. Wire hover sounds to
`mouseenter`/`focus` (throttled), keep them short and quiet.

## Hierarchy: if everything shouts, nothing reads

Order the HUD by what the player loses the game for ignoring:

1. **Survival/status** — health, time, fuel: biggest, most stable, edge/corner.
2. **Objective** — score, laps, wave: prominent but calmer.
3. **Moment feedback** — "+100" popups, damage flashes: transient, near the
   action, gone in under a second.
4. **Flavor** — combo names, taunts: smallest, skippable.

## Readability rules

- **Never cover the player or incoming threats.** Corners and edges belong to
  UI; the center of the screen belongs to the game.
- **Stable layout.** A score ticking 9 → 10 → 100 must not reflow anything:
  tabular numerals (`font-variant-numeric: tabular-nums`), fixed-width slots,
  meters that change fill — not size.
- **Contrast against the real scene.** Test text over the brightest AND
  darkest areas of actual gameplay; a soft dark plate or text-shadow beats
  restyling per level.
- **Panel and button corners come from `border-radius` or a generated frame
  sprite — never a raw `clip-path`/`mask` chamfer.** A CSS-cut angular corner
  is the recurring "cut corners" defect: the clip shears off borders, shadows,
  and any content that sits near the corner, and it re-breaks the instant the
  padding, font, or value length changes — so it can only be held together by
  a per-build visual check that is easy to skip. It is not worth that fragility.
  For a soft corner use `border-radius` (it keeps its `border`/`box-shadow`
  natively). For a genuinely angular or ornamented "hi-tech" frame, generate it
  as chrome (`$genex-ai-hud`, or a Tier-3 9-slice panel) and lay the DOM over
  it — that reads richer and physically cannot shear. `mask`/`clip-path` stay
  reserved for their ONE established HUD use: the masked-fill progress reveal
  driven by `genex ui` masks. Never for corner shaping.
- **One cohesion layer.** A single full-screen vignette div (a subtle radial
  gradient darkening the corners, optionally faint grain) over canvas + UI is
  the cheapest way to make DOM-over-WebGL read as one composed image instead
  of a web page floating over a game. Keep it `pointer-events: none`. If you add
  grain here, it's a **static** fine-noise tile (a small data-URI at 1:1, not a
  stretched image); grain that belongs to the rendered LOOK goes in the WebGL
  grade instead — see `$genex-threejs-exposure-color-grading` for why per-frame
  `vUv` grain shimmers.
- **Desktop first.** Verify at desktop sizes and survive window resizes
  without clipping; don't design phone layouts or test mobile viewports unless
  the user asks. Two exceptions ship by default precisely BECAUSE you don't
  test on phones: touch *input* when a recipe fits — a bundled controller's
  built-in touch controls, or the touch kit + recipes in
  `$genex-threejs-touch-controls` — behind `navigator.maxTouchPoints > 0`,
  invisible on desktop (skipping needs a one-line reason, not silence); and
  the adaptive-quality tier at boot (`$genex-threejs-adaptive-quality`), which
  keeps the shared link from being a dead OR crashing link on a phone.

## Wire UI to game state, never the reverse

The game state machine is the single source of truth; the UI renders it.
Don't keep a second copy of rules in the UI layer (a timer in the HUD and a
timer in the game WILL drift apart). Buttons and menu keys emit the same
intents the gameplay input path uses — a "Restart" button and the R key must
run identical code.

That holds whichever tier the interface is drawn in. When a game does take the
generated layer — a sprite HUD (`$genex-ai-hud`), a cinematic menu with a
looping video backdrop behind the buttons (`$genex-ai-menu`) — it slots into
this exact `#ui` + `data-phase` architecture and consumes the shared style
brief. Generated chrome changes how a widget LOOKS; it never changes where the
widget gets its numbers.

## Failure modes to catch before the player does

- No screen inventory: screens invented one at a time, menu and HUD styled in
  two different worlds.
- A HUD-bearing image fed to `genex video --frame` — a frame with UI baked
  into it yields a menu backdrop with UI baked into it; the UI-free menu still
  is the ONLY valid frame input (`$genex-ai-menu`).
- The build stalled waiting on art — scaffold, core loop, and logic modules
  keep moving in parallel while anything generated is in flight.
- No pause screen, or a pause that isn't bound to Escape.
- The OS arrow parked over the action for the whole session in a keyboard-driven
  game (the cursor is either a gameplay tool or locked away — see the cursor
  section).
- A style brief whose fonts were never actually loaded (a system-stack display
  font at runtime).
- A micro-element (reticle, cue, toast, damage number) left at browser
  defaults while the panels got the full treatment — one interface, one level
  of finish.
- A generic stat dashboard (rows of labels + numbers) instead of a designed
  HUD — pick the 2–3 numbers that matter and style them by hierarchy.
- Hard-cut phase swaps, a menu whose elements just appear, numbers that
  teleport.
- A silent menu; a bare "Loading…" over black.
- Generated UI art enqueued and then left on the shelf — a landed sprite sheet
  that never got extracted, masked, and wired is worse than never running the
  lane at all.
- A CSS-cut corner (`clip-path`/`mask`) that shears its own content — clipped
  text or padding, a lost focus ring or glow, a jagged aliased edge, or a
  border/frame that stops at the cut instead of following it — the
  technique is fine; the sloppy cut is the defect.
- A plate shaped by `npx genex ui plate` (the frame's traced silhouette as
  the plate's `mask-image`) is the fix for shaped backing — see
  `$genex-ai-hud`'s silhouette-plate rule; a bare rounded rectangle behind
  generated art is the defect below.
- A rectangular semi-transparent plate protruding past an opaque/angular
  widget frame — a dark box floating over the scene. The frame's own art is
  the backing; a plate is only for bare-text/outline widgets and stays inside
  the widget silhouette (`$genex-ai-hud`'s plate rule).
- UI panels covering the player or the thing about to kill them.
- Layout shifting as numbers grow.
- A fail state with no visible restart key, or a restart that reloads the page.
- Buttons that render but don't emit the game's real input intents.
- A clicked menu button remains focused after entering gameplay, so Space/Enter
  natively activates it again; or menu keyboard navigation still runs outside
  the menu/lobby phase.
- UI logic duplicating game rules and drifting out of sync.
- A waiting/lobby overlay that can miss its dismissal — see the multiplayer
  skill's status-driven rule.

Before calling UI done, check it over real gameplay footage at desktop size —
`$genex-threejs-visual-validation` has the capture discipline.
