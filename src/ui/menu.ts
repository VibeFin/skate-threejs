// The title screen — the game's opening shot.
//
// Archetype: LEFT RAIL WITH A LIVE STAGE. It was a centred stack until the
// player looked at a Tony Hawk's Underground title screen and said what he
// wanted instead: "I want us to render our character. We can have him standing
// in a pose, with some photo in the background — maybe something like an
// old-school skate shop — and the character should be in 3D, and we CHOOSE the
// character. […] On the left, we'll have the red panel we have now — Drop In,
// Leaderboard, and so on."
//
// So the screen is two halves. The LEFT is the rail: the wordmark and the same
// bare stencil buttons that were centred before, unchanged in treatment. The
// RIGHT is `menu-stage.ts` — the game's own rig, lit, turning slowly, over the
// backdrop — and it is real 3D rather than a captured still, because a picture
// of a character is not a character you are choosing.
//
// THE TAGLINE IS GONE (2026-07-29). ONE BLOCK · ONE BOARD · ONE LINE sat under
// the wordmark from milestone 5 and the player asked for it off the screen in
// as many words. It is deleted rather than hidden — markup and stylesheet
// together — and the air it was holding between the mark and DROP IN moved onto
// the wordmark's own margin, because a rail that closes up behind a deleted
// line reads as one flat list of four things instead of a mark with a menu
// under it. The stagger indices were re-dealt with it: leaving a gap in the
// 70 ms cadence is a beat of silence in the middle of the entrance.
//
// The two halves LOOK AT EACH OTHER, which took the player pointing it out:
// "move a bit left the characters and mirror them, I mean they are looking
// right there". He was standing hard against the shop's doorway on the far
// right, turned out of the frame — the one body on the screen with its back to
// the only thing on the screen worth facing. He now stands at 65% of the width,
// in the open floor between the counter's far end and the door step, angled
// back toward the rail. Both numbers live in `menu-stage.ts` (`STAGE_BODY_X`
// and `BODY_YAW`); the pool and the caption under him follow the first, and the
// second is a SIGN and never a mirrored scale — see rule 10.
//
// THE STYLE DECISIONS ON THIS SCREEN, written down so the HUD lane can match
// them (hud.ts is being built to the same language in parallel):
//   · NO PLATES, anywhere — AGENTS.md rule 6 and this game's own brief. The
//     "red panel" the player asked for is an elliptical WASH anchored to the
//     left edge (`.menu-wash`): brick-red at the edge, gone by mid-screen, with
//     no straight edge anywhere in it. It reads as the panel he means and it is
//     not a rectangle behind text.
//   · Type: Anton for the buttons and the heads (unchanged), Barlow Condensed
//     for small caps (unchanged), and MICHROMA — new this round, loaded in
//     index.html — for the one thing that is a readout rather than a word: the
//     character picker's name, and its 1/2 counter on the rounds where there is
//     more than one body to count. Syne Mono is the game's
//     techno/numeric face now; anything that counts, indexes or measures wears
//     it, and anything that SHOUTS still wears Anton.
//   · Accents, shared with the HUD: gold #ffd23d is selection and anything
//     earned; red #ff5b47 is loss and limit. The wash borrows the red at very
//     low alpha and nothing else on this screen does.
//   · Selection is one state for mouse, keyboard and touch — the gold chevron.

// The trick's callout is imported rather than retyped: the controls screen and
// the HUD have to name the same move the same way, and two hand-kept strings is
// how "pop shove-it" ended up on a screen describing a full 360.
import { SHOVEIT_CALLOUT } from "../skate/tricks";
import { fetchLeaders } from "../game/leaderboard";
import { BOARD_CSS, boardHtml } from "./leaderboard";
import { MenuStage, stageAffordable, STAGE_BODY_X, type StageBody } from "./menu-stage";
import { detectTier, type QualityTier } from "../controllers/quality/tier";
import { pickAsset } from "../controllers/quality/pick-asset";

/** Screens the overlay can be showing. Exactly one is on at a time. */
export type Phase = "menu" | "controls" | "leaders" | "playing";

/**
 * THE SHOP. The title screen's backdrop, and the picture the character is
 * standing in.
 *
 * RE-GENERATED 2026-07-29 as a RENDER rather than a photograph, at the player's
 * word: he sent a THUG trick-list screenshot and said *"I like how it looks with
 * the boards right now… we need the same thing, just in the style of an old
 * console. I attached Station One as a reference."* Station One is the PS1. So
 * the shop is now drawn the way that generation of hardware drew a room —
 * chunky geometry, crunchy low-resolution textures, hard baked lighting, a
 * cool blue-green cast — instead of being a photograph of a real one. Decks
 * racked along the right wall, a long glass counter of wheels and trucks,
 * flyers taped up, fluorescent strips, scuffed tile.
 *
 * **THE MIRROR IS GONE, and that is the interesting part.** The old photograph
 * carried `scaleX(-1)` because its open floor was centre-LEFT while this layout
 * needs open floor on the RIGHT (the rail owns the left), and flipping it was
 * free — there was no text anywhere in that frame to read backwards. This one
 * is full of signage: BAKER, ZERO, VISION, EXIT, Shorty's. Mirroring it would
 * put five backwards words on the title screen. The render does not need the
 * flip anyway: its counter already runs down the right and the tiled floor it
 * leaves open is centre-right, which is where the body stands.
 *
 * Overridable through `setBackdrop` so the boot can swap it without this file
 * being the authority on which picture ships.
 */
const SHOP_URL = "https://assets.auras.cc/generations/cms67vjuo007022obezc4pooz/image-main";

/**
 * The bodies the picker offers, in order.
 *
 * A LIST on purpose: a third character is one more entry here and nothing else
 * in this file or in `menu-stage.ts` changes. Both of these are Meshy rigs on
 * the same neutral-v3 controller pack, so both carry their own idle in their
 * own manifest and neither is retargeted onto the other's bones.
 */
const BODIES: readonly StageBody[] = [
  {
    id: "skater",
    name: "The Local",
    manifestUrl: "./assets/meshy-character.json",
    modelUrl: "https://assets.auras.cc/generations/cms0fbiar004o22nuyjqjhzuz/rigged-character.glb",
  },
  {
    id: "clockman",
    name: "The Timekeeper",
    manifestUrl: "./assets/meshy-npc.json",
    modelUrl: "https://assets.auras.cc/generations/cms5uxuo500ea22lb0sccf64o/rigged-character.glb",
  },
];

/**
 * The figure's place across the stage column, restated for the DOM layers that
 * have to stand under him.
 *
 * `menu-stage.ts` owns the number (`STAGE_BODY_X`, 0 = the column's left edge,
 * 1 = its right) because it is the thing that aims the camera. Two elements
 * here have to agree with it or they come apart the moment it moves: the floor
 * pool he casts no shadow onto, and the nameplate under his boots. Derived
 * rather than typed twice — the last thing this screen needs is a second
 * opinion about where the character is standing.
 *
 * `.stage-pool` is inset 4% either side of the column, so the column's 36% is
 * not the pool's 36%; that is the whole of the arithmetic.
 */
const POOL_X = ((STAGE_BODY_X - 0.04) / 0.92) * 100;
/** Right padding that recentres the caption row's contents on the figure. */
const PICK_PAD = 100 - STAGE_BODY_X * 200;

/**
 * How long one screen takes to dissolve into the next, milliseconds.
 *
 * Shared by the stylesheet below and by `setPhase`, which has three things to
 * do when it lands — drop the held layer, hide what is off, and take the stage
 * down on the way into gameplay. Two numbers that had to agree is how a
 * transition ends up half a frame short of itself.
 */
const FADE_MS = 380;

const CSS = `
/* pointer-events: none on the ROOT, and it is load-bearing rather than tidy.
   This element is fixed, inset 0, z-index 15, and it is display:block for the
   whole of play — so on "auto" it is a transparent lid over the entire game,
   sitting above the HUD (which has no z-index of its own) and above the canvas.
   Desktop hid that for months because during play the pointer is LOCKED, and a
   lock bypasses hit-testing entirely. The moment the game unlocks is exactly the
   moment it matters: hud.wantsCursor frees the cursor for the round-end card,
   and measured on the build before this line, every point on the screen — the
   centre, the canvas, and the spot where GO AGAIN and FREE RIDE sit — hit
   DIV#ui. Those two buttons were very probably unclickable.
   Found by the touch lane, whose widgets were completely dead until it worked
   out why; on a phone there is no pointer lock at all, so the lid is absolute.
   Safe because ".screen" is already pointer-events:none here and
   ".screen.is-on" already turns it back to auto — the menu screens carry their
   own permission and never needed the root's.
   (No backticks in this comment on purpose: the whole block is a template
   literal, and a stray one ends the string. That cost me a compile.) */
#ui { position: fixed; inset: 0; z-index: 15; pointer-events: none; font-family: "Barlow Condensed", system-ui, sans-serif; }
/* THE DISSOLVE, and why it is three classes rather than one.
   Every screen here carries an OPAQUE backing (the dark green below), so
   fading two of them at once dissolves through that backing rather than
   between the pictures: at the half-way frame the arriving screen sits at .5
   over a leaving screen at .5, and the pair sums to three quarters of either
   one. Both backdrops on this menu are dark — the tiled blue-green shop and
   the grainy golden street — so what a quarter of missing light READS as is a
   blink to black in the middle of the change. That blink is the cut.
   So exactly ONE layer ever animates. The arriving screen fades up on top
   (z-index 2) while the screen being left is HELD at full opacity underneath
   it (.is-under, z-index 1) and only dropped once it is completely covered,
   which is a frame nobody can see. Same duration, no dip, and no screen is
   ever composited against a half-faded copy of the other.
   Nothing is held under the title screen on DROP IN — there is no screen
   above it, the game is — so that one genuinely fades away, over the world. */
#ui .screen { position: absolute; inset: 0; opacity: 0; pointer-events: none;
  z-index: 0; transition: opacity ${FADE_MS}ms ease; }
#ui .screen.is-on { opacity: 1; pointer-events: auto; z-index: 2; }
#ui .screen.is-under { opacity: 1; transition: none; z-index: 1; }
#ui .screen[hidden] { display: none; }
#screen-menu, #screen-controls, #screen-leaders { overflow: hidden; background: #0d1108; }
.menu-bg { position: absolute; inset: 0; }
.menu-bg video, .menu-bg .still {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; opacity: 0; transition: opacity .8s ease;
}
.menu-bg .still { background-size: cover; background-position: center; opacity: 1;
  animation: drift 26s ease-in-out infinite alternate; }
@keyframes drift { from { transform: scale(1.02); } to { transform: scale(1.09); } }
/* THE SHOP, over the key art and under everything else. It USED to carry a
   scaleX(-1), and the mirror is GONE as of 2026-07-29 — see SHOP_URL. The
   keyframes below used to repeat the -1 in both stops because a transform
   animation on a mirrored layer that forgets it un-flips the room for the
   length of the animation; with the mirror gone that duty goes with it. */
.menu-shop { position: absolute; inset: 0; background-size: cover;
  background-position: center; opacity: 0; transition: opacity .9s ease;
  animation: shop-drift 34s ease-in-out infinite alternate; }
.menu-shop.is-up { opacity: 1; }
@keyframes shop-drift {
  from { transform: scale(1.03); }
  to   { transform: scale(1.08); }
}
/* One grade layer over the art — never a panel. */
.menu-grade { position: absolute; inset: 0;
  background: radial-gradient(120% 85% at 50% 18%, rgba(6,10,4,0) 38%, rgba(6,10,4,.72) 100%); }
/* A thin scrim strictly behind the button column, for legibility only. */
.menu-scrim { position: absolute; left: 50%; transform: translateX(-50%);
  top: 48%; width: min(560px, 76vw); height: 34%;
  background: radial-gradient(60% 50% at 50% 50%, rgba(4,6,3,.55), rgba(4,6,3,0) 72%); }

/* ---------------------------------------------------------------------------
   THE TITLE SCREEN: left rail, live stage on the right.
   --------------------------------------------------------------------------- */
/* THE "RED PANEL", and it is not a panel. The player pointed at a THUG screen
   with a red slab down the left and asked for "the red panel we have now"; a
   slab is precisely what AGENTS.md rule 6 forbids and what this game's own
   brief has never had. So it is an ellipse anchored off the left edge, brick
   red where the type sits and gone by mid-screen — no straight edge in it
   anywhere, and the shop still reads through it. */
.menu-wash { position: absolute; left: 0; top: 0; bottom: 0; right: 0;
  background:
    radial-gradient(78% 96% at -6% 50%, rgba(138,22,12,.86) 0%, rgba(96,16,9,.62) 38%,
      rgba(24,8,5,.24) 62%, rgba(8,10,6,0) 80%),
    linear-gradient(180deg, rgba(6,8,4,.55) 0%, rgba(6,8,4,0) 26%); }
.menu-rail { position: absolute; left: clamp(14px, 4vw, 68px); top: 50%;
  transform: translateY(-50%); width: min(46vw, 500px);
  padding-left: clamp(24px, 2.4vw, 38px);
  display: flex; flex-direction: column; align-items: flex-start;
  gap: clamp(6px, 1.2vh, 16px); }
/* In the rail the wordmark is a flow element, so it needs no centring
   transform — which is the whole reason the centred version had a comment
   warning that a centring transform is the first thing the stagger throws
   away. Here there is nothing to throw away. */
/* The margin under the wordmark used to be a hairline, because the TAGLINE was
   the thing that stood between it and the buttons. The player asked for the
   tagline gone (2026-07-29: "remove the text OneBlock, OneBoard and OneLine"),
   so the air it was carrying moves here rather than being deleted with it —
   without this line the wordmark and DROP IN close to within the rail's own
   gap and the rail reads as one four-item list instead of a mark with a menu
   under it. Measured against the shipped screen: the tagline's own row was
   about 16 px of type plus its 14 px margin plus the rail's 16 px gap, and the
   30 px below replaces enough of that to hold the composition without leaving
   the hole where the line used to be. */
.menu-rail .menu-logo, .menu-rail .menu-word {
  position: static; margin: 0 0 clamp(10px, 2.2vh, 30px); text-align: left; }
.menu-rail .menu-logo { width: min(30vw, 340px); }
.menu-rail .menu-word { font-size: clamp(46px, 7.4vw, 96px); }
.menu-rail .menu-list { position: static; transform: none; align-items: flex-start;
  gap: clamp(4px, .9vh, 11px); }
/* Buttons keep their own treatment exactly as they were — bare stencil text,
   no plate — but they lean the other way now: a rail item that scaled AWAY
   from its own left edge on hover walked its first letter off the wash. */
.menu-rail .menu-btn { transform-origin: left center; }
.menu-rail .menu-btn.is-selected, .menu-rail .menu-btn:hover,
.menu-rail .menu-btn:focus-visible { transform: scale(1.05) rotate(-1.2deg); }
.menu-rail .menu-btn:active { transform: scale(.97) rotate(-1.2deg); }

/* THE STAGE — the right half, and the only place in this game where a second
   canvas exists. menu-stage.ts appends into .stage-view; everything else
   here is DOM the 3D never has to pay for. */
.menu-stage { position: absolute; right: 0; top: 0; bottom: 0;
  width: min(54vw, 700px); pointer-events: none; }
/* The floor pool: what grounds the figure in the room. A shadow map would cost
   a megabyte of texture for a contact shadow this camera is too level to see —
   this is the same read for nothing, and it doubles as the separation that
   keeps a dark body off a dark shop wall. */
/* RE-AIMED 2026-07-29, when the figure grew and his boots went off the bottom
   of the screen — see FILL and HEADROOM in menu-stage.ts. There is no longer a
   visible point of contact to draw a contact shadow at, so the flattened
   ellipse that used to sit under his soles at 81% would have landed across his
   knees. It becomes a floor-level DARKENING instead, sat on the bottom edge:
   its job now is that the crop reads as a figure walking out of the bottom of
   the frame rather than as a body sawn off by a canvas. The warm separation
   glow is unchanged in kind and only re-centred on his chest, which is where
   he is now. Both x values still come from POOL_X, so they follow him. */
.stage-pool { position: absolute; left: 4%; right: 4%; top: 4%; bottom: 0;
  background:
    radial-gradient(36% 13% at ${POOL_X.toFixed(1)}% 101%, rgba(6,4,2,.62), rgba(6,4,2,0) 78%),
    radial-gradient(42% 40% at ${(POOL_X + 2).toFixed(1)}% 40%, rgba(255,216,150,.15),
      rgba(255,186,86,.04) 48%, rgba(0,0,0,0) 74%); }
/* The canvas runs to the BOTTOM OF THE SCREEN now (it stopped at 85%). That is
   half of the answer to "he looks like he's floating": the other half is the
   camera in menu-stage.ts, but a figure whose feet are meant to leave the frame
   has to have a frame that reaches the edge of the picture to leave. Cropping
   him at 85% of the window would have cut his shins off in mid-air with the
   shop's own floor still visible underneath — the exact thing being fixed.
   The canvas grows about a fifth in area with it, which on the desktop tiers
   this stage is gated to is roughly 24 MB of attachments becoming 29. */
.stage-view { position: absolute; left: 0; right: 0; top: 2%; bottom: 0; }
/* The picker. Its two arrows are NOT .menu-btn — the keyboard nav is built by
   querying .menu-btn inside the live screen, so an arrow in that list would
   put a left-right control into an up-down column. They answer ← and → instead,
   which is also how the reference screen this layout came from did it. And when
   there is only one body they are not RENDERED at all — see the markup.
   Recentred on the figure with PADDING, not by pulling the right inset in —
   and note there are no backticks in this comment, because it lives inside a
   template literal and a stray one ends the stylesheet mid-sentence (TS1005,
   twice in this project's history). The row's
   contents are a fixed ~410 px of name and arrows, and a box narrowed to
   2 x 36% of the column would be narrower than that on a small laptop and spill
   its left arrow out of the frame. Padding leaves the box full width, so the
   overflow — if a narrow window ever produces one — has somewhere to go. */
/* It now reads ACROSS his shins rather than under his boots, because his boots
   are off the bottom of the screen. That is the character-select convention and
   not a compromise — a name laid over the bottom of a figure is what every
   screen this layout came from does — and it stays legible on its own text
   shadow, which is the only thing it is allowed: no plate, ever (rule 6). */
.stage-pick { position: absolute; left: 0; right: 0; bottom: 3.2%;
  padding-right: ${PICK_PAD.toFixed(1)}%;
  display: flex; align-items: center; justify-content: center;
  gap: clamp(8px, 1.4vw, 20px); pointer-events: auto; }
.stage-name {
  min-width: min(44vw, 300px); text-align: center;
  /* The fallback chain is the HUD's, not this file's own. It used to fall back
     to "Barlow Condensed" — a PROPORTIONAL face — so on the one machine where
     Syne Mono fails to load, a readout that is monospaced everywhere else would
     have gone proportional here alone. Falling back to monospace keeps the
     failure mode consistent instead of inventing a third look. */
  font-family: "Syne Mono", ui-monospace, Menlo, monospace;
  font-size: clamp(11px, 1.35vw, 16px); letter-spacing: .12em; text-transform: uppercase;
  color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,.92), 1px 2px 0 rgba(0,0,0,.7); }
/* Syne Mono is the game's readout face as of this round — anything that counts
   or indexes wears it, anything that shouts still wears Anton. The 1/2 under
   the name is the smallest instance of that rule on any screen. */
.stage-name em { display: block; font-style: normal; margin-top: .34em;
  font-size: .74em; letter-spacing: .28em; color: rgba(255,210,61,.9); }
.stage-name.is-loading { color: rgba(255,255,255,.62); }
.pick-arrow { border: 0; background: transparent; cursor: pointer; padding: 0 .25em;
  font-family: Anton, Impact, sans-serif; line-height: 1;
  font-size: clamp(22px, 2.6vw, 34px); color: rgba(255,255,255,.72);
  text-shadow: 2px 3px 0 rgba(0,0,0,.85);
  transition: transform .15s ease, color .15s ease; }
.pick-arrow:hover, .pick-arrow:focus-visible {
  color: #ffd23d; outline: none; transform: scale(1.22); }
.pick-arrow:active { transform: scale(.94); }
/* No stage on this device (a phone tier, or a viewport too narrow to stand a
   body up in): the rail takes the room back rather than leaving a hole where
   the character would have been. */
#screen-menu.no-stage .menu-stage { display: none; }
#screen-menu.no-stage .menu-rail { width: min(86vw, 560px); }
/* …and the legend goes with it. A corner that names ◀ ▶ over a screen with no
   figure on it is promising a control whose whole effect is invisible. */
#screen-menu.no-stage .corner-pick { display: none; }
@media (max-width: 720px) {
  #screen-menu .menu-stage { display: none; }
  #screen-menu .menu-rail { width: min(86vw, 560px); }
  #screen-menu .corner-pick { display: none; }
}
/* Same trick, taller: the key art's brightest region is the skater's shirt, and
   the middle of a thirteen-row list lands square on it. */
.ctl-scrim { top: 14%; height: 74%; width: min(820px, 92vw);
  background: radial-gradient(58% 50% at 50% 50%, rgba(4,6,3,.62), rgba(4,6,3,0) 76%); }

/* The file is trimmed to the mark (814x396), so its box IS the wordmark and
   the tagline below can sit at a fixed offset without guessing at padding. */
/* Centred with auto margins, NOT translateX(-50%) — the entrance stagger
   animates the transform property, so a centring transform is the first thing
   it throws away (it did: the wordmark walked off the right edge). */
.menu-logo { position: absolute; left: 0; right: 0; top: 11%; margin-inline: auto;
  display: block; width: min(54vw, 540px); pointer-events: none;
  filter: drop-shadow(0 10px 22px rgba(0,0,0,.75)); }
.menu-word { position: absolute; left: 0; right: 0; top: 11%; text-align: center;
  font-family: Anton, Impact, sans-serif; font-size: clamp(52px, 11vw, 132px);
  letter-spacing: .04em; color: #fff; pointer-events: none;
  text-shadow: 3px 5px 0 rgba(0,0,0,.85), 0 12px 40px rgba(0,0,0,.55); }
/* .menu-tag is GONE — the ONE BLOCK · ONE BOARD · ONE LINE line under the
   wordmark, removed at the player's word. Both the rule and the element went
   together: a stylesheet that still describes a line no markup produces is the
   next agent's twenty minutes. The air it held is on .menu-rail .menu-logo. */

.menu-list { position: absolute; left: 50%; top: 52%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: clamp(6px, 1.1vh, 14px); }
.menu-btn { position: relative; border: 0; background: transparent; cursor: pointer;
  font-family: Anton, Impact, sans-serif; text-transform: uppercase;
  font-size: clamp(26px, 4.2vw, 52px); line-height: 1.06; letter-spacing: .03em;
  color: rgba(255,255,255,.9); padding: .04em .5em;
  text-shadow: 2px 3px 0 rgba(0,0,0,.85);
  transition: transform .16s ease, color .16s ease, text-shadow .16s ease; }
.menu-btn.is-selected, .menu-btn:hover, .menu-btn:focus-visible {
  color: #fff; outline: none; transform: scale(1.06) rotate(-1.4deg);
  text-shadow: 2px 3px 0 rgba(0,0,0,.85), 0 0 26px rgba(255,210,61,.85); }
.menu-btn.is-selected::before { content: "▸"; position: absolute; left: -.62em; color: #ffd23d; }
.menu-btn:active { transform: scale(.98) rotate(-1.4deg); }
/* Bottom LEFT, under the rail it belongs to — the bottom right is the picker's
   now, and two legends in one corner is neither of them being read. */
.menu-corner { position: absolute; left: clamp(14px, 4vw, 68px); bottom: 2.6vh;
  font-size: clamp(10px, 1.1vw, 13px); letter-spacing: .2em; font-weight: 700;
  color: rgba(255,255,255,.55); pointer-events: none; }

.ctl-wrap { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: clamp(10px, 2vh, 22px);
  overflow-y: auto; padding: 3vh 0; }
.ctl-head { font-family: Anton, Impact, sans-serif; text-transform: uppercase;
  font-size: clamp(30px, 6vw, 62px); color: #fff; letter-spacing: .04em;
  text-shadow: 2px 4px 0 rgba(0,0,0,.85); }
/* The key column is sized to its longest key and the description column takes
   what is left — NOT "auto auto", which sizes both to content and therefore
   sizes the whole grid to the sum of the longest cells. That grid was wider
   than a 1280 laptop, and a centred thing wider than its screen does not
   scroll, it overhangs BOTH edges: HOLD SPACE and ARROW KEYS were printing off
   the left of the screen with their first letters cut in half. It went unseen
   because it depends on which keys land in which of the four columns, and that
   depends on the row COUNT — dropping the two right-mouse rows for one MOUSE
   row (2026-07-29) re-dealt every row after it into the other pair. */
.ctl-rows { display: grid; grid-template-columns: max-content minmax(0, 1fr);
  gap: clamp(4px,.9vh,10px) clamp(14px,2.4vw,34px);
  align-items: baseline; width: min(94vw, 1180px); }
/* Twenty-odd bindings is a tall column on a laptop — anything wider than a phone
   reads them two pairs to a row instead of running the list off the bottom.
   The screen itself clips, so the wrap keeps a scroll of last resort for the
   narrow-and-short case rather than hiding the last few keys. */
@media (min-width: 900px) {
  .ctl-rows { grid-template-columns: max-content minmax(0, 1fr) max-content minmax(0, 1fr); }
}
.ctl-rows b { font-family: Anton, Impact, sans-serif; font-weight: 400; text-align: right;
  font-size: clamp(15px, 2vw, 24px); color: #ffd23d; text-shadow: 1px 2px 0 rgba(0,0,0,.85); }
.ctl-rows span { font-size: clamp(11px, 1.35vw, 16px); letter-spacing: .16em; font-weight: 600;
  color: rgba(255,255,255,.85); text-transform: uppercase; text-shadow: 1px 2px 0 rgba(0,0,0,.85); }
/* The button column is pinned to 52% for the title screen's stack; here it is
   the last item under the list, and the list is now long enough to reach 52%.
   Centring falls to the wrap's align-items, never a transform — the stagger
   would throw a centring transform away on entry. */
.ctl-wrap .menu-list { position: static; transform: none; }
.ctl-wrap .menu-btn { font-size: clamp(22px, 3.4vw, 40px); }

.stagger { opacity: 0; transform: translateY(14px);
  transition: opacity .34s ease, transform .34s ease;
  transition-delay: calc(var(--i, 0) * 70ms); }
.is-on .stagger { opacity: 1; transform: none; }

/* The board screen borrows the controls screen's furniture wholesale — same
   backdrop, same scrim, same head, same Back button — because it is the same
   kind of screen and a second visual language for a list of names would be a
   third title screen nobody asked for. */
.lb-head { font-size: clamp(11px, 1.4vw, 15px); letter-spacing: .34em; font-weight: 700;
  text-transform: uppercase; color: rgba(255,255,255,.6); text-align: center;
  text-shadow: 1px 2px 0 rgba(0,0,0,.85); }
`;

/** The board's own rules, so this screen stands up without the HUD's stylesheet. */
const BOARD_STYLE = BOARD_CSS;

// Milestone 7's layout. The left hand never leaves WASD: the same A/D that
// carves on the ground is the spin in the air, and the same Space that pops is
// what gets you off a rail.
//
// This list is CHECKED against the build, key for key, and against the CODE
// rather than against the previous round's list — a controls screen that
// promises a move the keys do not do is worse than no controls screen. Seven
// have been wrong so far: C spins the deck a whole flat turn, which is a 360
// shove-it and not the 180 a pop shove-it is (see `SHOVEIT_CALLOUT`); the mouse
// and the pump were not listed at all; the grab read as if it did something on the
// ground, when the trick book only offers a grab while he is AIRBORNE; and this
// round —
//   · the pivot said "under 20 km/h" against a `PIVOT_MAX_SPEED` of 6 m/s,
//     which is 21.6. A row that understates the code still lies about it, and
//     this one lied in the direction where a player at 21 km/h stops pressing
//     S+A because the screen told him it would not work. 21 km/h is 5.83 m/s,
//     so the row is now true at every speed the readout can show.
//   · A/D on a rail was listed NOWHERE, and it is the only thing that fights
//     the balance gauge (`Grinder.update`'s `steer * correct`). The meter came
//     up, wandered, and dumped him on the concrete with no screen anywhere
//     naming the key that saves it.
//   · nothing said how you end up riding switch, which is the badge beside the
//     speed and half of the animation lane's work. A landed 180 — in the air or
//     scrubbed on the ground — turns him round on the deck, and another one
//     turns him back.
// …and this round —
//   · the switch row said LAND A 180, and a 180 is not only landed: brake and
//     steer scrubs one on the floor (`endPivot` → `resolveSpin`) and it toggles
//     the stance by the same rule. A player who read the row as air-only never
//     found the cheap way to ride switch.
//   · the manual row said "hold, rolling" and stopped, which describes the key
//     and not the trick. A manual is the only thing in the game that carries a
//     line across flat ground — that is what it is FOR — and it also lets go of
//     you at `MANUAL_MAX_HOLD`, so "hold" on its own was a promise the build
//     does not keep. Both are on the screen now.
//   · The grab said "hold" without saying what ends it, and what ends it badly is
//     a landing: a grab still on at touchdown fails the ride's `clean` test and
//     puts him on the concrete. The one deadline in the trick list was the one
//     thing the screen left out.
//   · F/G/C read as ground-only pops. They are also the LATE FLICK — press one
//     during an ollie and the deck comes round in the air — which is how a flip
//     is landed on a rail at all (the rail refuses a board still coming round).
// …and this round —
//   · the pivot row STILL carried a speed gate, and there is no longer one. The
//     ride counts every degree of a brake-and-steer at any speed
//     (`skate-model.ts`: `scrubbing = input.brake && |steer| > PIVOT_STEER`);
//     `PIVOT_MAX_SPEED` decides only how FAST it comes round — under it the
//     wheels break loose and it whips, above it they still grip and it is a
//     slow scrubbing carve. So the row that read "under 21 km/h" was the same
//     lie as the round before it, one number later: a player at 40 km/h reads
//     it and stops pressing S+A, which is the cheap way into switch and the
//     only ground spin in the game.
//   · the pump row said TRANSITION and the code says slope — `PUMP_MIN_GRADE`
//     is 0.05, about 3°, so every bank, apron and access ramp in the spot pumps
//     too. A skater reads "transition" as the curved wall alone.
//   · nothing said what makes a combo worth more than its parts, and now that
//     the same trick twice running is one link (`Hud.addLink`) that is a rule a
//     player acts on: the chain multiplies by how many DIFFERENT tricks are in
//     it. The readout teaches it — the chain simply stops growing — but the
//     player deserves to be told once rather than to find out at the bank.
//
// The manuals carry their own speed gate too: the book will not start one below
// `MANUAL_MIN_SPEED`, so "rolling" is part of the binding and not flavour. The
// pump is the same key as the wind-up (`chargeHeld` is what `roll()` reads),
// which is why it hangs off the SPACE row instead of claiming one of its own.
//
// Anton has no arrow glyphs, so the key column stays letters-only and the
// arrow keys get one line of their own at the bottom rather than a fallback
// font drawing ↑ at half the weight of the W beside it.
const CONTROLS: [string, string][] = [
  ["V  W", "Push"],
  ["A  D", "Carve · spin in the air"],
  ["S", "Brake · with A/D it scrubs a pivot, at any speed"],
  // One row, not two, as of the camera lane's 2026-07-29 change: the right
  // button is out of it entirely — looking around is plain mouse movement under
  // the lock now, and the view eases itself back behind him after 1.2 s of
  // stillness while he is riding. The two rows that used to be here described a
  // button that does nothing and a click that hands back a camera which now
  // hands itself back, which is the same lie the pivot row told twice.
  ["MOUSE", "Look around · it eases back behind you as you ride on"],
  ["HOLD SPACE", "Load up, release to ollie"],
  ["…ON ANY SLOPE", "Keep it held to pump for speed"],
  ["F", "Kickflip"],
  ["G", "Heelflip"],
  ["C", SHOVEIT_CALLOUT],
  ["…IN THE AIR", "Flick one mid-ollie · land it square"],
  // The four grabs ride on ONE line rather than a continuation row: on a wide
  // screen the list flows two pairs to a row, and a "…+ A D S" of its own
  // landed under whatever happened to be left of it instead of under X.
  ["X", "Grab, airborne — A D S name it · let go to land"],
  ["SHIFT", "Manual — hold while rolling"],
  ["Q", "Nose manual — the same, up front"],
  ["…A MANUAL", "Carries your line across the flat · 4 s"],
  // …AND THE GRIND IS A SITUATION AGAIN, on the player's own instruction:
  // *"let's make rail sliding activate when I simply ride onto it, without
  // holding a button. As soon as you ride onto it, the rail slide starts."* This
  // row has now been all three things the game has been — "LAND ON A RAIL" when
  // rails took you whether you asked or not, "HOLD E" while the key was the
  // whole gate, and a situation again now that the geometry decides.
  //
  // E keeps ONE job, and it is the one thing riding onto a line cannot say: the
  // deck laid SQUARE across it. Coming at a rail sideways and popping is how you
  // boardslide in this game and it is also how you hop a kerb on the way
  // somewhere else — same approach, same arc, and measured on
  // `tools/grind-auto.mjs`, 165 of 1432 of those hops lock on. So that half is
  // the player's to ask for and everything else takes no key at all.
  ["RIDE ONTO A RAIL", "It takes you — no key · rails and ledges alike"],
  ["HOLD E", "…or lay the deck SIDEWAYS across one · a boardslide"],
  ["…ON THE RAIL", "A D fight the balance · square the deck · Space pops out"],
  ["ANY 180", "Ride away switch — landed or pivoted · another puts you back"],
  ["YOUR LINE", "Multiplies by DIFFERENT tricks · a repeat is one link"],
  ["R", "Reset"],
  ["ESC", "Pause"],
  ["ARROW KEYS", "Push, carve and brake too"],
];

export class Menu {
  private root: HTMLDivElement;
  private screens: Record<string, HTMLElement> = {};
  private buttons: HTMLButtonElement[] = [];
  private selected = 0;
  private phase: Phase = "menu";
  private videos: HTMLVideoElement[] = [];
  private onPlay: (spotId: string) => void;
  /** The spots the game offers, and which one DROP IN will build. */
  private spots: readonly { id: string; name: string }[];
  private spotIndex = 0;
  /** Ticket for the board read — see `loadBoard`. */
  private boardJob = 0;
  /** The body on the right of the title screen, or null while there is none up. */
  private stage: MenuStage | null = null;
  /**
   * Whether this device gets a stage at all, and the tier it would be built at.
   *
   * Kept on the instance because the stage is now built MORE THAN ONCE — see
   * `setPhase`. `wantsStage` is also the latch that stops a machine which
   * refused a WebGL context from being asked for one again every time the
   * player walks back to the title screen.
   */
  private tier: QualityTier;
  private wantsStage: boolean;
  /**
   * Ticket for the deferred half of a phase change.
   *
   * Everything that has to happen AFTER the dissolve — dropping the held layer,
   * hiding what is off, taking the stage down — belongs to one call to
   * `setPhase`, and a player who drops in and comes straight back has two of
   * them in flight. The older one must not hide the screen he is looking at,
   * and must not dispose the stage that is standing on it.
   */
  private phaseJob = 0;
  /** Every body the picker offers, whether or not a stage was built for them. */
  private bodies: readonly StageBody[];
  /** Which one is picked — kept HERE and not in the stage, so the answer
   *  survives a device that could not afford to draw one. */
  private bodyIndex = 0;
  private onCharacter?: (body: StageBody, index: number) => void;
  /** Has a backdrop been asked for? See `playBackdrop` for what it turns off. */
  private backdropWanted = false;

  constructor(opts: {
    logoUrl: string;
    stillUrl: string;
    /** Every registered map, in menu order. Never empty. */
    spots?: readonly { id: string; name: string }[];
    onPlay: (spotId: string) => void;
    /**
     * The bodies the picker offers. Defaults to the two rigs this game ships.
     *
     * Pass it to hand over a body the game ALREADY has in memory — a
     * `StageBody` with `object3D` set makes the stage clone that rig instead of
     * downloading and parsing a second 23 MB copy of it, which is the single
     * biggest saving available on this screen. See `menu-stage.ts`.
     */
    characters?: readonly StageBody[];
    /** Whichever body the player has picked, on every change and at boot. */
    onCharacter?: (body: StageBody, index: number) => void;
  }) {
    this.onPlay = opts.onPlay;
    // Defaulted rather than required: this is called from the boot with every
    // registered map, and from `tools/menu-check.html` with nothing at all.
    this.spots = opts.spots?.length ? opts.spots : [{ id: "street", name: "Street" }];
    // `??`, deliberately, and not `?.length ?` — an ABSENT list means "I did not
    // say", which is what the harness does and what the built-in pair is for; an
    // EMPTY list is the caller saying it has no playable bodies, and answering
    // that by standing up two of this file's own would put a character on the
    // title screen the game cannot ride. The roster is the boot's to state.
    this.bodies = opts.characters ?? BODIES;
    this.onCharacter = opts.onCharacter;
    const tier = detectTier();
    const wantsStage = stageAffordable(tier) && this.bodies.length > 0;
    this.tier = tier;
    this.wantsStage = wantsStage;

    const style = document.createElement("style");
    style.textContent = CSS + BOARD_STYLE;
    document.head.appendChild(style);

    this.root = document.createElement("div");
    this.root.id = "ui";
    this.root.innerHTML = `
      <div class="screen${wantsStage ? "" : " no-stage"}" id="screen-menu" data-phase="menu">
        <div class="menu-bg" id="menu-bg">
          <div class="still" style="background-image:url('${opts.stillUrl}')"></div>
        </div>
        <div class="menu-shop" id="menu-shop"></div>
        <div class="menu-grade"></div>
        <div class="menu-wash"></div>
        <div class="menu-stage" id="menu-stage">
          <div class="stage-pool"></div>
          <div class="stage-view" id="stage-view"></div>
          <div class="stage-pick stagger" style="--i:5">
            ${
              // ONE body is a nameplate, not a picker. The arrows are not
              // rendered — not greyed out, not hidden — because an arrow you
              // can see is a promise that there is somebody else behind it, and
              // a title screen whose whole job is to say what you can do must
              // not offer a control with no effect. Dropping them from the
              // markup is also the only safe way to take a row off this screen:
              // the spot button next door is rendered conditionally for exactly
              // that reason (a `display: none` .menu-btn still eats an
              // ArrowDown). These two are not .menu-btn, so nav is untouched
              // either way — but the rule is the rule, and one habit is safer
              // than two.
              this.bodies.length > 1
                ? `<button class="pick-arrow" type="button" data-act="body-prev" aria-label="Previous skater">◀</button>`
                : ""
            }
            <div class="stage-name" id="stage-name"></div>
            ${
              this.bodies.length > 1
                ? `<button class="pick-arrow" type="button" data-act="body-next" aria-label="Next skater">▶</button>`
                : ""
            }
          </div>
        </div>
        <div class="menu-rail">
          <img class="menu-logo stagger" style="--i:0" src="${opts.logoUrl}" alt="SKATE" />
          <div class="menu-list">
            <button class="menu-btn stagger" style="--i:1" data-act="play">Drop In</button>
            ${
              // One spot means no choice to offer, so the row is not RENDERED —
              // not hidden. Keyboard nav is built by querying `.menu-btn` inside
              // the live screen (see `select`), so a display:none button would
              // still eat an ArrowDown and leave a dead stop in the list.
              this.spots.length > 1
                ? `<button class="menu-btn stagger" style="--i:2" data-act="spot" id="menu-spot">Spot · ${this.spots[0]?.name ?? ""}</button>`
                : ""
            }
            <button class="menu-btn stagger" style="--i:3" data-act="controls">Controls</button>
            <button class="menu-btn stagger" style="--i:4" data-act="leaders">Leaders</button>
          </div>
        </div>
        <div class="menu-corner stagger" style="--i:6">↑ ↓ &nbsp;ENTER${
          // The picker's keys are only named where there is a picker to use
          // them on — a phone tier is told about a control it does not have
          // otherwise.
          wantsStage && this.bodies.length > 1
            ? `<span class="corner-pick"> &nbsp;·&nbsp; ◀ ▶ &nbsp;SKATER</span>`
            : ""
        }</div>
      </div>
      <div class="screen" id="screen-controls" data-phase="controls">
        <div class="menu-bg"><div class="still" style="background-image:url('${opts.stillUrl}')"></div></div>
        <div class="menu-grade"></div>
        <div class="menu-scrim ctl-scrim"></div>
        <div class="ctl-wrap">
          <div class="ctl-head stagger" style="--i:0">Controls</div>
          <div class="ctl-rows stagger" style="--i:1">
            ${CONTROLS.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join("")}
          </div>
          <div class="menu-list">
            <button class="menu-btn stagger" style="--i:2" data-act="back">Back</button>
          </div>
        </div>
      </div>
      <div class="screen" id="screen-leaders" data-phase="leaders">
        <div class="menu-bg"><div class="still" style="background-image:url('${opts.stillUrl}')"></div></div>
        <div class="menu-grade"></div>
        <div class="menu-scrim ctl-scrim"></div>
        <div class="ctl-wrap">
          <div class="ctl-head stagger" style="--i:0">Leaders</div>
          <div class="lb-head stagger" style="--i:1">Best score in one minute · worldwide</div>
          <div class="stagger" style="--i:2" id="menu-board"></div>
          <div class="menu-list">
            <button class="menu-btn stagger" style="--i:3" data-act="back">Back</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(this.root);

    for (const s of Array.from(this.root.querySelectorAll<HTMLElement>(".screen"))) {
      this.screens[s.dataset.phase as string] = s;
    }
    // The logotype is art; if it 404s the game still has a title.
    const logo = this.root.querySelector<HTMLImageElement>(".menu-logo");
    logo?.addEventListener("error", () => {
      const word = document.createElement("div");
      word.className = "menu-word stagger";
      word.style.setProperty("--i", "0");
      word.textContent = "SKATE";
      logo.replaceWith(word);
    });

    this.root.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "play") this.setPhase("playing");
      // The spot is picked here and nowhere else — one button, cycled, so the
      // choice reads at a glance instead of hiding behind a submenu.
      else if (act === "spot") this.cycleSpot();
      else if (act === "controls") this.setPhase("controls");
      else if (act === "leaders") this.setPhase("leaders");
      else if (act === "back") this.setPhase("menu");
      // Screen-LEFT takes you back down the list, screen-RIGHT forward — the
      // same convention every other direction in this game keeps.
      else if (act === "body-prev") this.pickBody(-1);
      else if (act === "body-next") this.pickBody(1);
    });

    document.addEventListener("keydown", (e) => {
      if (this.phase === "playing") return;
      if (e.code === "ArrowDown") this.select(this.selected + 1);
      else if (e.code === "ArrowUp") this.select(this.selected - 1);
      else if (e.code === "Enter" || e.code === "Space") this.buttons[this.selected]?.click();
      else if (e.code === "Escape" && this.phase !== "menu") this.setPhase("menu");
      // ← and → are the PICKER, and only on the title screen, and only while
      // there is more than one body to move between. They are deliberately not
      // `.menu-btn`s: the up-down nav is built by querying `.menu-btn` inside
      // the live screen, so a left-right control in that list would be a dead
      // stop in the column.
      //
      // The length test is on the BRANCH rather than inside `pickBody`, so that
      // with a single body the keys are not merely ignored — they are never
      // claimed. Swallowing an arrow key with `preventDefault` to then do
      // nothing with it is how a screen ends up eating a browser's own
      // scrolling and giving nothing back.
      else if (this.canPick() && e.code === "ArrowLeft") this.pickBody(-1);
      else if (this.canPick() && e.code === "ArrowRight") this.pickBody(1);
      else return;
      e.preventDefault();
    });

    // The shop is the backdrop this screen ships with; `setBackdrop` is how the
    // boot replaces it without this file being the authority on which picture
    // that is. Applied through the rung ladder, so a phone loads the 1024-wide
    // sibling of a 2560-wide photograph rather than the photograph.
    this.setBackdrop(pickAsset(SHOP_URL, tier));

    if (wantsStage) this.buildStage(tier);
    else this.paintPicker();

    this.setPhase("menu");
  }

  /**
   * Swaps the still for the generated loop once it has finished rendering.
   *
   * DECLINED while a backdrop is up, and that is the whole of the method now:
   * the loop was generated from the street key art, and the title screen is a
   * shop with a body standing in it. Two HD decoders preloading a video that is
   * covered by an opaque photograph is the exact memory spike this screen is
   * written to avoid — and it would buy motion nobody can see. (The loop is not
   * wasted: it is still the right backdrop for a title screen without the shop,
   * and the boot decides which that is by whether it calls `setBackdrop`.)
   */
  playBackdrop(url: string): void {
    if (this.backdropWanted) return;
    const holder = this.root.querySelector<HTMLElement>("#menu-bg");
    if (!holder) return;
    seamlessLoop(holder, url, 0.6, this.videos);
  }

  /**
   * The picture the title screen stands in — the skate shop, or whatever
   * replaces it.
   *
   * ONE method and one layer, so the art can land at any time without this
   * screen being rebuilt. It sits OVER `.menu-bg`, which means the key-art
   * still (and the loop, if one is playing) is what shows until this resolves
   * and what shows again if the URL 404s — a title screen whose backdrop failed
   * still has a backdrop.
   */
  setBackdrop(url: string): void {
    const shop = this.root.querySelector<HTMLElement>("#menu-shop");
    if (!shop) return;
    // Latched on the REQUEST, not on the load: the boot's HEAD check for the
    // menu loop can land first, and two decoders started under a picture that
    // is about to cover them is the spike either way.
    this.backdropWanted = true;
    // Probed with an Image rather than assigned straight to the layer: a
    // background-image that fails leaves the element transparent with no event
    // to hear about it, and the fade below would have run over nothing.
    const probe = new Image();
    probe.addEventListener("load", () => {
      shop.style.backgroundImage = `url('${url}')`;
      shop.classList.add("is-up");
    });
    probe.addEventListener("error", () =>
      console.warn(`[menu] backdrop ${url} did not load — keeping the key art`),
    );
    probe.src = url;
  }

  /** Which body the player picked — what the boot reads to make the choice stick. */
  get character(): StageBody {
    return this.bodies[this.bodyIndex] ?? this.bodies[0];
  }

  /**
   * Show one screen, and DISSOLVE into it.
   *
   * Two things happen here that used not to, and both are answers to the
   * player watching the shipped build (2026-07-29).
   *
   * **The change of screen was a cut.** Not for the reason it looks like — the
   * .35 s opacity fade was there and it ran — but because both screens carry
   * an opaque backing and both of them animated, so the middle of every
   * transition was a quarter of the light missing. Between two dark pictures
   * (the blue-green shop, the grainy golden street) that reads as a blink. The
   * stylesheet's .is-under is the fix and the comment on it is the working;
   * this method's part is to put the class on the screen being LEFT and take it
   * off once the arriving one has covered it.
   *
   * **The stage did not come back.** DROP IN disposes it and nulls it, which is
   * right — a second WebGL context and a rig resident behind the game is the
   * shape of this project's mobile memory problem. What was missing was the way
   * back. It was never noticed while DROP IN was a one-way door, and then the
   * pause card grew a MAIN MENU that routes straight through here, so from the
   * first time a player paused and walked out, the shop stood empty for the
   * rest of the session. It is REBUILT on arrival at the title screen.
   *
   * The two orders that keep the context count at one, stated because they are
   * the whole of the safety:
   *   · the build is on ARRIVAL and the teardown is on the timer, so a stage is
   *     only ever built where `this.stage` is null — and it is null only after a
   *     `dispose` that has already called `forceContextLoss` and dropped the
   *     canvas. There is no window in which two exist.
   *   · a fast menu → game → menu CANCELS the teardown (the ticket has moved
   *     on), so the old stage is still standing and still not null, and the
   *     rebuild is skipped. The same context carries through — the cycle costs
   *     nothing rather than costing a context each time round.
   */
  setPhase(phase: Phase): void {
    const from = this.phase;
    this.phase = phase;
    const job = ++this.phaseJob;
    const leaving = from === phase ? null : (this.screens[from] ?? null);

    for (const [name, el] of Object.entries(this.screens)) {
      if (name === phase) {
        // Coming back from gameplay this element is display:none. A class added
        // in the same tick as the un-hide has no start value to animate from,
        // so the fade simply does not run — one forced reflow between the two
        // is what buys it, and it is the only one on this path.
        if (el.hidden) {
          el.hidden = false;
          void el.offsetWidth;
        }
        el.classList.remove("is-under");
        el.classList.add("is-on");
      } else {
        el.classList.remove("is-on");
        // Held opaque under the arriving screen — but only where something IS
        // arriving. DROP IN has no screen above it, so the title screen fades
        // away for real and the game comes up through it.
        el.classList.toggle("is-under", el === leaving && phase !== "playing");
      }
    }
    // Decoding two HD videos behind gameplay is pure waste — and on phones it
    // is the spike that gets the tab killed.
    for (const v of this.videos) {
      if (phase === "playing") v.pause();
      else if (v.style.opacity !== "0") void v.play();
    }
    // The stage draws only while the title screen is the one being looked at.
    // It is deliberately NOT stopped on the way into gameplay: it has a fade to
    // live through, and a body that freezes half way through a dissolve is the
    // tell that something was torn down early. The teardown is below.
    if (phase !== "playing") {
      if (phase === "menu" && !this.stage && this.wantsStage) this.buildStage(this.tier);
      this.stage?.setRunning(phase === "menu");
    }
    this.buttons = Array.from(
      (this.screens[phase] ?? this.root).querySelectorAll<HTMLButtonElement>(".menu-btn"),
    );
    this.buttons.forEach((b, i) => b.addEventListener("mouseenter", () => this.select(i)));
    this.select(0);
    // Read on ENTRY rather than at boot: a board is a live thing, and one read
    // when the game started would be stale by the first time anyone looked at
    // it. Nothing waits on it — the screen is up either way.
    if (phase === "leaders") void this.loadBoard();
    if (phase === "playing") this.onPlay(this.spots[this.spotIndex]?.id ?? "street");

    // …and the half of it that belongs to the far end of the dissolve.
    window.setTimeout(() => {
      if (job !== this.phaseJob) return;
      leaving?.classList.remove("is-under");
      if (this.phase !== "playing") return;
      for (const el of Object.values(this.screens)) el.hidden = true;
      this.stage?.dispose();
      this.stage = null;
    }, FADE_MS);
  }

  /**
   * Stand a body up on the right of the screen.
   *
   * Wrapped in a try: a WebGL context can be refused (a machine already holding
   * as many as it will give out, a driver that fell over), and a title screen
   * that throws on the way up is a game that never starts. The screen without a
   * stage is the screen this game had last week, and it is a perfectly good one.
   *
   * A refusal now LATCHES (`wantsStage`), because this is called every time the
   * player walks back to the title screen and not just once at boot. A machine
   * that could not give out a context is not going to change its mind between
   * two visits, and asking it again on each one is a console warning per visit
   * and a rejected allocation per visit for nothing.
   */
  private buildStage(tier: QualityTier): void {
    const host = this.root.querySelector<HTMLElement>("#stage-view");
    if (!host) return;
    try {
      this.stage = new MenuStage({
        host,
        bodies: this.bodies,
        index: this.bodyIndex,
        tier,
        onChange: (body, index) => {
          this.bodyIndex = index;
          this.paintPicker();
          this.onCharacter?.(body, index);
        },
        onState: (state) => this.paintPicker(state === "loading"),
      });
    } catch (e) {
      console.warn("[menu] no stage on this device — keeping the still", e);
      this.stage = null;
      this.wantsStage = false;
      this.screens.menu?.classList.add("no-stage");
      this.paintPicker();
    }
  }

  /**
   * Is there a choice to make on this screen at all?
   *
   * One body — the roster the game shipped when The Local went back to being an
   * NPC — is a portrait, not a picker: no arrows in the markup, no counter under
   * the name, no legend in the corner, and the arrow keys left alone. This is
   * the one test all four read.
   */
  private canPick(): boolean {
    return this.phase === "menu" && this.bodies.length > 1;
  }

  /**
   * Next body, or the previous one. The stage owns the swap when there is one;
   * where there isn't, the CHOICE still moves — a phone that cannot draw the
   * picker can still have picked, and the boot reads `character` either way.
   */
  private pickBody(step: number): void {
    if (this.bodies.length < 2) return;
    if (this.stage) {
      this.stage.select(this.stage.index + step, step);
      return;
    }
    this.bodyIndex = (this.bodyIndex + step + this.bodies.length) % this.bodies.length;
    this.paintPicker();
    this.onCharacter?.(this.bodies[this.bodyIndex], this.bodyIndex);
  }

  /**
   * The caption under the figure: who he is, and — only when there is more than
   * one of him — which of them he is.
   *
   * "1 / 1" is a counter with nothing to count, and printed under a name with no
   * arrows beside it, it reads as the other body having failed to load rather
   * than never having existed. One body gets a nameplate: his name, and nothing
   * else on the line.
   */
  private paintPicker(loading = false): void {
    const el = this.root.querySelector<HTMLElement>("#stage-name");
    if (!el) return;
    const body = this.character;
    const count =
      this.bodies.length > 1 ? `<em>${this.bodyIndex + 1} / ${this.bodies.length}</em>` : "";
    el.className = `stage-name${loading ? " is-loading" : ""}`;
    el.innerHTML = `${esc(body?.name ?? "")}${count}`;
  }

  /**
   * Fill the board screen. Guarded by a ticket so a slow read that lands after
   * the player has walked away and come back cannot overwrite the newer one,
   * and an empty result is printed as an empty board — nobody has posted yet,
   * or this is a local test run where nothing online exists.
   */
  private async loadBoard(): Promise<void> {
    const slot = this.root.querySelector("#menu-board");
    if (!slot) return;
    const id = ++this.boardJob;
    slot.innerHTML = boardHtml({ rows: [], me: null }, "Reading the board…");
    const view = await fetchLeaders();
    if (id !== this.boardJob) return;
    slot.innerHTML = boardHtml(view);
  }

  private cycleSpot(): void {
    if (this.spots.length < 2) return;
    this.spotIndex = (this.spotIndex + 1) % this.spots.length;
    const btn = this.root.querySelector<HTMLElement>("#menu-spot");
    if (btn) btn.textContent = `Spot · ${this.spots[this.spotIndex].name}`;
  }

  private select(i: number): void {
    if (this.buttons.length === 0) return;
    this.selected = (i + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, j) => b.classList.toggle("is-selected", j === this.selected));
  }
}

/** Character names are data, and this screen writes them with innerHTML. */
function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/**
 * Deterministic seamless loop: two stacked videos crossfade at the cycle end.
 * A bare `loop` attribute shows the residual seam every eight seconds — the
 * generated clip lands NEAR its first frame, not exactly on it.
 */
function seamlessLoop(
  holder: HTMLElement,
  url: string,
  fade: number,
  out: HTMLVideoElement[],
): void {
  const mk = (): HTMLVideoElement => {
    const v = document.createElement("video");
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    holder.appendChild(v);
    out.push(v);
    return v;
  };
  let front = mk();
  let back = mk();
  front.style.opacity = "1";
  void front.play();
  const tick = (): void => {
    if (front.duration > 0 && front.currentTime >= front.duration - fade && back.paused) {
      back.currentTime = 0;
      void back.play();
      back.style.opacity = "1";
      front.style.opacity = "0";
      const old = front;
      front = back;
      back = old;
      window.setTimeout(() => back.pause(), fade * 1000 + 50);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
