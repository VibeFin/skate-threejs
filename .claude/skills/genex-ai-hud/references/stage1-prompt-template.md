# Stage 1 prompt template — the full-HUD mockup

Fill the placeholders, then pass the whole text as the prompt to
`npx genex image "<filled prompt>" --size 2560x1440 --quality high`.
ONE mockup — no candidate variants unless the player asks for them. Every
sprite the HUD ships is cut out of this frame, so the scene half deserves the
same care as the HUD half: a HUD read against a flat grey plate looks nothing
like the same HUD read against the game.

Placeholders:

- `[GENRE_BRIEF]` — one-line genre description, anchored in a recognizable
  register ("a dark gothic action RPG", "a sun-bleached rally racing game",
  "a hand-painted storybook platformer").
- `[GAME_SCENE]` — what's behind the HUD, written RICH and from the game
  plan (a thin phrase wastes the frame): the setting, the moment, what the
  player is doing right now (the verb), what threatens them, what they're
  chasing, and the lighting. Only the scene may show 3D depth — never the
  HUD. Examples:
  - "a rain-slick neon alley mid-chase, the player character vaulting a
    barrier toward a glowing extraction gate, two drones closing in from
    behind, magenta signage cutting through blue dusk"
  - "a torchlit dungeon arena mid-duel, the player's knight raising a
    shield against a lunging skeletal champion, a health shrine glowing in
    a far alcove, embers drifting in the dark"
  - "a sun-bleached desert rally stage mid-drift, the player's buggy
    kicking up dust through a canyon gate marked with checkpoint flags, a
    rival truck closing on the left, late-afternoon glare"
- `[STYLE_BRIEF]` — your full 3–5 sentence style brief with the named 4–5 hue
  palette. Do NOT append the per-sprite cutout sentence here — this is a full
  frame, not a cutout. **End the brief with a named register anchor**: "in
  the register of <2–3 real games>" from the table below. Anchors set the
  REGISTER (stroke weight, ornament budget, composure) — never copy their
  assets, and never show their names in-game. Pick 2–3; genres between rows
  blend the neighbors.

  | Genre register | Anchor games (2–3) |
  |---|---|
  | Gothic / soulslike | Bloodborne, Elden Ring |
  | Clean sci-fi / arena shooter | Destiny 2, Titanfall 2 |
  | Arcade racing / rally | Forza Horizon, vintage Baja rally decals |
  | Cozy / farming / life sim | Stardew Valley, Spiritfarer |
  | Analog survival horror | Resident Evil 7, Signalis |
  | Retro pixel | Shovel Knight |
  | Ornate high fantasy RPG | Diablo IV |

- `[N]` — the exact count of elements in `[ELEMENT_LIST]`, spelled out in
  the ONLY-these line. The bans in that line are load-bearing: without them
  the model completes the genre's canonical HUD past your list (invented
  kill feeds, leaderboards, timers, extra slots — measured in 5/7 genres).
- `[ELEMENT_LIST]` — a bullet list of your 4–7 chosen widgets with one-line
  descriptions. List only asset-backed widgets; pure-geometry elements
  (crosshairs, tick rails, plain shapes) are built in code and stay off the
  list. **Name each element as the shaped object it is** — "bare glowing
  digits with a pip row", "an etched line silhouette", "stencil digits held
  by two rivet brackets". Never "panel" or "plate" unless a physical plate
  IS the art (a diegetic device, a pinned note). **State exact counts**
  ("exactly one tool slot", "exactly three gem sockets") — the model honors
  them.

## The template

```
A screenshot of a complete game HUD for [GENRE_BRIEF]. The HUD is composited over a [GAME_SCENE] visible behind it.

Visual style: [STYLE_BRIEF]

The HUD includes ONLY these [N] elements and nothing else — do not add any other UI: no kill feed, no leaderboard, no map, no timer, no chat, no crosshair, no extra slots, no duplicates. Arrange them naturally as a real game would lay them out (you decide the layout — do not force a grid, place each element where it makes the HUD readable and combat-ready):

[ELEMENT_LIST]

Widget construction rules: every widget is a shaped object with its own silhouette — an ornamented frame or emblem drawn directly over the game scene. NO rectangular backing panels behind bars, digits, or icons; no dark filler boxes; the game scene stays visible right up to each widget's frame edge. All ornament and material character lives ON the frame outline itself. Keep the frames detailed and characterful — confident AAA game UI, not a sterile minimal overlay. Size widgets like a shipped game: the HUD hugs the screen edges and no single widget exceeds about one eighth of the frame width. Every meter channel interior reads visibly darker than both its fill and its surrounding frame.

This is a real in-game screenshot. Sharp detail on every UI element. No motion blur on the HUD. The HUD is clear and combat-readable. No watermarks. No external annotations.

CRITICAL — flat HUD framing: draw every HUD element flat and head-on, parallel to the screen plane, like a 2D overlay painted directly onto the display (orthographic / screen-space UI). The HUD must NOT be tilted, angled, skewed, rotated in 3D, shown in perspective, or made to recede into depth — no isometric interface, no vanishing point on the panels, no 3D-extruded or floating-at-an-angle widgets, no curved/wrapped screen. ONLY the game scene behind the HUD may show 3D depth and perspective; the HUD layer itself is a flat 2D plane with square-on, axis-aligned edges, so each widget can be cleanly cut out as a flat sprite.
```

Never delete the flat-framing paragraph — a tilted or perspective mockup does
not deconstruct cleanly (angled panel edges have no clean silhouette, so
Stage 2 produces sliced, skewed cutouts). If the mockup comes back tilted,
regenerate it before proceeding; do not try to salvage it downstream.

**Never delete the widget-construction paragraph either** — it is what keeps
the mockup from coming back as generic rectangles: without it, every genre
grows heavy rectangular backing plates behind its bars and digits, and the
lane's whole value (shaped, characterful chrome) is lost. The channel-contrast
sentence in it is deliberate phrasing: channels read "visibly darker than
both their fill and their frame" — a RELATIVE rule that works on light
palettes too (an absolute "dark" trough fought cozy/pale briefs). Stage 2's
EMPTY-state law (dark empty tracks on the sheet) is separate and stays
absolute.

One more Stage-1 rule that pays off at mask time: **meter channels must be
continuous** — never place a label or ornament in the MIDDLE of a fill
channel (it splits the mask and the fill into fragments); labels sit above or
beside the channel, or on the frame's end caps. If the mockup comes back
with a mid-channel label, keep it only if you'll wire that meter as
segmented (`segments` in the masks JSON) — otherwise regenerate.

The mockup is the **style and layout reference** for everything cut out of
it: save its URL, compare the finished HUD against it, and sample runtime
text colors from it with `npx genex ui text-color`.
