---
name: genex-ai-video
description: Generate a real video clip (H.264 mp4) from a text prompt with `npx genex video`, then play it in Three.js on any surface via VideoTexture. Use for in-game TVs/screens/monitors, animated billboards, cutscene clips, ambient backdrops, portals, and video decals ("news broadcast on a TV", "swirling portal", "animated arcade attract screen") rather than a static image or shader effect. Pass `--loop` for a seamless loop.
---

# Genex AI · Video

Turn a prompt into a real mp4 clip and play it anywhere in the game — an in-game
TV/screen/monitor, an animated billboard, a cutscene, an ambient backdrop, a portal,
or a video decal.

## When to use this vs. a static image or shader

- **Use `npx genex video`** for moving footage you can describe — "static-y CRT
  news broadcast", "swirling ink in water", "rain running down glass". You get a real
  mp4.
- **Use `$genex-ai-image`** for a single still picture, or
  `$genex-threejs-procedural-vfx` for parametric real-time effects (particles,
  trails, shockwaves) authored in code.

## Run

```bash
npx genex video "<prompt>"
npx genex video "drifting autumn leaves, seamless loop" --loop   # seamless loop for screens/backdrops
```

Video takes a **minute or two** end to end (queue + generation). If you're building
other things meanwhile, add `--no-wait` to enqueue and come back for it. Blocks until
ready, then prints its public URL:

```
https://assets.genex.technology/generations/<id>/video-mp4
```

The clip lives in Genex storage (R2) and loads straight from that URL — you don't
download it and nothing is committed to your repo. The URL is permanent (local dev,
published game, and remixes alike).

> **Cost & length:** the default is a **5-second, 1080p** clip — the right default
> for anything the player looks at directly. Only pass `--duration` when the content
> genuinely needs to be longer (a cutscene), and `--resolution 720p` only when the
> clip is genuinely incidental (a small in-world screen seen from a distance): it
> halves the cost, but 720p stretched across the whole screen reads soft. mp4 has
> **no alpha channel**, so a video is always a full rectangle (there are no
> transparent video decals).

## Play it in Three.js

Video needs an `HTMLVideoElement`, and browsers block autoplay — the first
`video.play()` must run inside a user gesture (any click or keypress). Wrap it in a
`VideoTexture` and put it on any surface:

```ts
import * as THREE from "three";

// the URL `npx genex video` printed (R2 sends CORS headers, so cross-origin works):
const VIDEO_URL = "https://assets.genex.technology/generations/<id>/video-mp4";
const video = document.createElement("video");
video.src = VIDEO_URL;
video.crossOrigin = "anonymous";   // REQUIRED to upload cross-origin video to WebGL (else a tainted-source error)
video.muted = true;                // muted is what lets it play under autoplay policy
video.loop = true;
video.playsInline = true;          // iOS: no fullscreen takeover

const texture = new THREE.VideoTexture(video);   // auto-updates every frame — no per-frame code
texture.colorSpace = THREE.SRGBColorSpace;

// an in-game TV / animated billboard — MeshBasicMaterial so it glows regardless of scene lighting:
const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(3.2, 1.8),             // 16:9
  new THREE.MeshBasicMaterial({ map: texture }),
);
scene.add(screen);

// start playback on a user gesture (never swallow the rejection):
window.addEventListener("keydown", () => {
  video.play().catch((e) => console.warn("video play", e));
}, { once: true });
```

One `VideoTexture` can feed **many** surfaces — a bank of monitors, N sprays. Cost is
per distinct `<video>` element (media decode + one GPU upload per frame), **not** per
surface, so sharing one element for every screen is nearly free (all play in sync).
Pause the element (`video.pause()`) when no video surface is visible; on phones,
prefer the clip's source still as a poster and start the video only where it plays
smoothly.

## Video decals

A video decal is the same `DecalGeometry` projection as an image decal — read the
**Decals & stickers** section of `$genex-ai-image` for the full recipe and gotchas —
with one change: swap the `TextureLoader` map for the `VideoTexture` above, and call
`video.play().catch(...)` inside the spray handler (the keypress is the user gesture).
All decals can share the one `VideoTexture`. Because mp4 has no alpha, a video decal
is a full rectangle (fine for a screen-shaped mark; use `$genex-ai-image --transparent`
for a shaped sticker). **Layering gotcha:** an opaque video decal draws in the opaque
pass — *before* any `transparent: true` image decal — so image decals always land on
top regardless of spray order or `renderOrder`. If you mix both and need strict
newest-on-top, set `transparent: true` on the video decal material too.

## Multiplayer

The asset URL is public, permanent, and CORS-open, so it is safe to broadcast the
string to every player. A placed-at-runtime surface (a video decal included) is static
shared world state — put it on `room.shared`, **not** `objects` (no movement to smooth)
and **not** `send` (late joiners would see a bare wall; `shared` keys replay on connect).

Use a **fixed ring of slots** and overwrite the oldest — **never a fresh key per
placement**. The relay caps game-writable `shared` keys at **256 per room, keys are
permanent and undeletable, and new keys past the cap are silently dropped forever**:

```ts
let next = 0;
const RING = 32;                                   // decal:0 .. decal:31
function placeShared(url: string, hit: { point: THREE.Vector3; normal: THREE.Vector3 }) {
  room.shared.set(`decal:${next % RING}`, { url, p: hit.point.toArray(), n: hit.normal.toArray() });
  next++;
}
room.on("shared", (key, value) => {                // every player (incl. late joiners) rebuilds it
  if (key.startsWith("decal:") && value) spawnVideoDecalFromShared(value);
});
```

See `$genex-threejs-multiplayer` for the `shared` channel rules and the room API.

## Publish checklist

- Load it from the **URL** the command printed — absolute and permanent, so it resolves
  the same in local dev, the published game, and remixes. Nothing to commit.
- Don't copy the mp4 into `public/assets/` — generated assets live in R2, not the repo.

## Options

- `--loop` — a seamless loop (for screens, ambient backdrops, video decals).
- `--duration <sec>` — clip length 1–15; default 5. Only raise it when the content
  genuinely needs more — longer clips cost more and take longer.
- `--resolution 720p|1080p` — output resolution (default **1080p**). `--resolution
  720p` halves the cost — use it only when quality genuinely doesn't matter (a small
  far-away in-world screen). `--loop` clips ignore it (model default).
- `--frame <url>` — one generated image as BOTH first and last frame — the
  seamless-loop mode (motion must return to its start).
- `--first-frame <url>` / `--last-frame <url>` — two-frame motion between two
  stills (a genuine state change; expect a loop seam).
- `--no-wait` — enqueue and return immediately, without the URL. Fire-and-forget
  only: re-running the command creates (and bills) a NEW video.
- `--api-url <url>` — override the API base (local dev).

Menu backdrops belong to `$genex-ai-menu`; a cohesive art-directed HUD sprite
set belongs to `$genex-ai-hud` — both build on `npx genex image`/`video`.

## Troubleshooting

- **"Not authorized"** — run `npx @genex-ai/cli-demo@dev init` first (it writes your `GENEX_TOKEN`).
- **"Prompt rejected"** — the provider's content-safety filter blocked the prompt.
  This is non-retryable; retrying the same wording fails again. Rewrite the prompt.
- **Nothing plays / black surface** — the first `video.play()` must run inside a user
  gesture (click/keydown); confirm it's called and its promise rejection is logged.
- **Tainted-source / security error** — set `video.crossOrigin = "anonymous"` before
  `video.src`.
- **Colors look washed/dark** — ensure `texture.colorSpace = THREE.SRGBColorSpace`.
