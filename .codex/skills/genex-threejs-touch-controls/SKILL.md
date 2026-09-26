---
name: genex-threejs-touch-controls
description: Make a Genex Three.js game playable on phones — vendored touch primitives via `npx genex controller touch` (floating/static joystick, virtual buttons, drag zone, rotate-device overlay) plus per-genre wiring recipes (movement, camera look, taps, paddles, action buttons, touch pause). Use when wiring default touch controls into a new game, whenever someone asks to make a game playable on mobile/phone/tablet, or before shipping a game whose input is keyboard/mouse-only.
---

# Genex Three.js Touch Controls

Game links get shared in chats, and chats get opened on phones. A game with
keyboard/mouse-only input *renders* there and then does nothing — a dead screen
at the exact moment someone was curious enough to tap the link.

**Wire touch input by default when a recipe below fits** — it's a few lines,
invisible on desktop, and never needs mobile testing. **Skip it with a one-line
reason when it doesn't fit** (typing-driven games, pointer-lock-precision aiming
with no touch equivalent, anything where touch would contort the architecture) —
it is guidance, never a requirement. Mobile *layout/HUD polish* and phone-size
testing stay ask-only either way: the kit's defaults are safe by construction,
so wiring it adds no verification work.

## Get the kit

Games on a bundled physics controller (`genex controller character|car|drone`)
**already have the kit** — those installs ship it. Everything else:

```bash
npx genex controller touch
```

No extra npm install — plain DOM/CSS classes into `src/controllers/touch/`:

| File | Exports | What it is |
| --- | --- | --- |
| `touch/touch-joystick.ts` | `TouchJoystick` | movement stick — static circle, or `floating: true` (appears under the thumb, faint resting hint between touches) |
| `touch/touch-joystick.ts` | `VirtualButton` | thumb-sized action button with a label and press/release edges |
| `touch/drag-zone.ts` | `DragZone` | invisible drag surface — per-frame deltas for camera look, normalized position for paddles |
| `touch/rotate-overlay.ts` | `RotateOverlay` | "rotate your phone" screen, shown only while the device is held the wrong way |

## The three rules that apply to every recipe

1. **Create the widgets always, show them only on touch devices:**

   ```ts
   import { TouchJoystick, VirtualButton } from "./controllers/touch/touch-joystick.ts";
   import { DragZone } from "./controllers/touch/drag-zone.ts";

   const touch = navigator.maxTouchPoints > 0;
   const joy = new TouchJoystick({ floating: true });
   const btnJump = new VirtualButton({ label: "Jump" });
   [joy, btnJump].forEach((w) => w.setVisible(touch));
   ```

   (`maxTouchPoints > 0` is also true on touch-screen laptops, so the controls
   can appear on some desktops — harmless and intended; they cost nothing when
   untouched.)

2. **Give the canvas `touch-action: none`** so drags reach the game instead of
   scrolling/zooming the page:

   ```ts
   renderer.domElement.style.touchAction = "none";
   ```

3. **Touch inputs merge with keyboard/mouse, they never replace them.** Read
   both every frame and let either drive:
   `jump: kb.space || btnJump.pressed`. Same intents, same code path — a touch
   button and its key must run identical game logic.

## Genre recipes

Pick what matches the game; most games need exactly one or two of these.

- **Hand-rolled WASD / character movement → joystick.** Read `joy.x`/`joy.y`
  (both in [-1, 1], up-positive) wherever the key states are read and take
  whichever is nonzero. Use `floating: true` for action games where the thumb
  lives on the stick; the static circle is fine for slower games. On the
  bundled character controller, pass it through instead — see
  `$genex-threejs-character-controller` (`joystick: { x: joy.x, y: joy.y }`).
  Touch axes obey the same screen-direction contract as WASD and the mouse
  (`$genex-threejs-camera-direction`): stick-right must move the player
  screen-right, drag-right must turn the view right — a flipped feel is a sign
  bug in the mapping, never a device quirk.
- **Camera look → drag zone on the right half.** Default `DragZone()` is
  exactly that; per frame `const { dx, dy } = look.consumeDelta()` then apply
  to yaw/pitch with the same sensitivity scale as the mouse path. Games on the
  bundled `FollowCamera` skip this — its drag-orbit already works on touch.
- **Mouse-driven / tap games (click-to-move, tower defense, puzzles, cards) —
  no widgets.** Taps already fire your click/pointer handlers. The recipe is
  hit-target size: anything tappable should be ~44px+ on screen (fatten the
  pick radius or the DOM button, not the art). This is the ~90%-done genre —
  resist the urge to add a joystick it doesn't need.
- **Paddle / pong / slider → drag zone as an absolute axis.** Reshape the zone
  over the paddle's travel area and read `zone.x` (or `.y`), normalized 0..1,
  while `zone.active` — map it straight to the paddle position.
- **Discrete actions (jump / shoot / interact / brake / restart) → virtual
  buttons.** One `VirtualButton` per action; first button parks bottom-right
  by default, position the rest yourself
  (`wrapperStyle: { right: "100px", bottom: "48px" }`). Vehicles: the
  enter/exit prompt must be tappable too — `$genex-threejs-vehicle-controllers`
  has that wiring.
- **Always: a tappable pause.** Escape has no key on a phone — a small pause
  button (top corner, out of thumb arcs) triggering the exact same pause intent.
  `$genex-threejs-game-ui` owns the pause screen itself.

## Orientation

Declare ONE natural orientation per game (pick by genre: landscape for
racing/side-scrolling/most action, portrait for stacking/one-thumb casual) and
use the overlay **only if the wrong orientation genuinely breaks play**:

```ts
import { RotateOverlay } from "./controllers/touch/rotate-overlay.ts";
new RotateOverlay({ orientation: "landscape" }); // optional: onChange: (b) => (physics.paused = b)
```

If the game is merely suboptimal sideways, skip the overlay and just resize.
The web cannot force an orientation (fullscreen-only lock, none on iOS Safari)
— the overlay asks; it never traps.

## Match the game's style

The touch controls are UI like any other — restyle them from the same style
brief `$genex-threejs-game-ui` locked for this game (the neutral translucent
defaults are a placeholder look, not art direction):

```ts
new VirtualButton({
  label: "FIRE",
  capStyle: {
    border: "1.5px solid rgba(255, 120, 40, 0.8)",   // the brief's accent
    color: "rgba(255, 210, 180, 0.95)",
    fontFamily: "'Orbitron', system-ui, sans-serif",  // the brief's font
  },
});
```

Whatever the restyle, keep the floors the defaults guarantee: tappable targets
stay ~44px+, labels stay readable over bright AND dark scenes (keep a text
shadow), controls never cover HUD numbers the player must read, and the
z-order stays: drag zone (5) under joystick/buttons (10) under pause menus.

## Corner cases

- **Multi-touch is already handled** — every widget tracks its own pointer and
  captures it, so stick + look-drag + a button all work simultaneously. Extra
  fingers on one widget are ignored, not misread.
- **No pointer lock on touch.** Mouse-aim games need the drag-zone recipe for
  aiming, or a stated opt-out; the bundled aim mode no-ops on touch by itself
  (`$genex-threejs-camera-direction`).
- **Safe-area insets are built in** — default positions clear notches and the
  home indicator. If you position widgets yourself near screen edges, keep
  `env(safe-area-inset-*)` in the calc.
- **Viewport meta is a prerequisite** — every `env(safe-area-inset-*)` value is
  silently **0** unless the page's viewport meta carries `viewport-fit=cover`.
  Ship `<meta name="viewport" content="width=device-width, initial-scale=1,
  viewport-fit=cover">` in the game's own `index.html`: the platform edge-injects
  a default for published games, but the local dev server doesn't go through
  that edge — without your own meta, widgets hug the notch in local testing
  and look different from production.
- **The drag zone swallows its touches** — taps inside it don't reach the
  canvas. If the game also needs taps there (tap to shoot), read them from the
  zone (`onChange` + a small-movement threshold) or shrink the zone.

## Input is half of phone-playable

This skill is INPUT only. A phone that can steer a game that then runs out of
GPU memory still loses the player — the rendering half (device tiers, DPR and
shadow budgets, the runtime governor, per-tier asset rungs) lives in
`$genex-threejs-adaptive-quality` and is wired at boot for every game.

## When you skip

Say it in one plain line — *"skipped touch controls: the game is
typing-driven"* — instead of silently shipping a dead screen. Never restructure
a game's architecture to force touch in; if it doesn't fit, the one-liner is
the right outcome.
