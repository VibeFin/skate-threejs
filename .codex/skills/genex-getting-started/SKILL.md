---
name: genex-getting-started
description: Orient a new Genex user to the installed 3D browser-game workspace, including skills, agents, commands, authorization, and re-running setup. Use when the user asks what Genex is, how to get started, or what `genex init` installed.
---

# Getting started with Genex

`genex init` set up a workspace that helps your coding agent build 3D games in
the browser. Genex focuses on Three.js game skills, publishing, multiplayer
architecture, and team-ready workflows.

## What got installed

`genex init` installs the Genex skills **into this project's folder** for
every coding agent it detects — Claude Code (`.claude/`), Codex (`.codex/`),
and Cursor (`.cursor/`) — so the same skills are available whichever agent you
build with, and nothing is ever installed globally on the machine (only your
auth token lives outside the project, in `~/.genex/env`). After that, every
`genex` command keeps the genex-owned skills in sync with the installed CLI
automatically (re-running `init` does too); your own files are never touched.
If an older Genex version ever installed skills globally into `~/.claude`,
`~/.codex` or `~/.cursor`, any `genex` command now sweeps those legacy copies
out automatically — only `genex-*`-named files are removed, never yours.

- **skills/** - reusable Genex skills for 3D browser-game work (all agents).
- **agents/** - example subagent definitions (Claude Code).
- **commands/** - example slash commands (Claude Code).

Start with `$genex-game-director` for any game or graphics request. It checks
what your environment can do, writes the `DESIGN.md` design contract, and
routes the agent to focused skills for cameras, procedural geometry,
materials, atmosphere, water, weather, VFX, lighting, post-processing, and
visual validation.

## Generating real assets

Beyond procedural code, Genex can generate **real, AI-made assets** from a prompt.
Each command prints a permanent `assets.genex.technology` URL you load directly —
the asset lives in Genex storage (R2), not your repo, so there's nothing to commit:

```bash
npx genex model "weathered wooden barrel"      # a 3D mesh (GLB)
npx genex skybox "golden hour over mountains"  # a 360° sky + lighting
npx genex sfx "punchy laser zap" --duration 2  # a sound effect (mp3)
npx genex texture "mossy cobblestone" --terrain # a tiling surface texture
npx genex image "vintage travel poster"        # a picture (poster/sign/sprite/decal)
npx genex video "waterfall mist drifting" --loop      # a video clip (screen/backdrop)
```

(Run them inside your project — the `@genex-ai/cli-demo` dev dependency makes
`npx genex` resolve to the right CLI.)

Each has a focused skill with the exact loader code — `$genex-ai-model`,
`$genex-ai-skybox`, `$genex-ai-sfx`, `$genex-ai-texture`, `$genex-ai-image`,
`$genex-ai-video`. Two more workflow skills draw UI art on the same commands,
for games whose style wants it: `$genex-ai-menu` (a cinematic menu — looping
video backdrop + DOM buttons) and `$genex-ai-hud` (a HUD sprite set with
masked fills). A restrained interface in clean CSS is a finished UI too —
`$genex-threejs-game-ui` builds that one.

## Identity & saves (every game)

Every Genex game ships with built-in player identity: sign-in, guests, per-player
saves, a shared world slot, and leaderboards — all through `@genex-ai/embed-sdk`.
Load `$genex-threejs-embed-auth` before writing boot code; it wires the one-call
setup (`initEmbed` + `waitForPlayer`) and is also where multiplayer gets its
connection auth. A game without it loses all progress on refresh.

## Loading screens (recommendation)

Generated assets take a moment to fetch at runtime. Show a simple loading
screen or progress hint while models/textures/sounds load, and remove it when
the game is ready — players should never stare at a black screen. This is a
recommendation, not a rule: even a one-line "Loading…" overlay over the dark
page background is enough.

## Remixing an existing game

If the project folder already contains a game (a remix or any existing
project), don't scaffold a new app over it: read the existing code first and
keep its renderer, structure, and conventions — extend, don't rebuild.
Running `genex init` in such a folder only wires identity/publishing and
refreshes the genex-owned skills; the game's own files are never touched.

## Hosting your game's source

By default `genex init` creates a **managed repo** for your source — you push to
it over HTTPS with a token the API mints per push, so it works from any device
with no SSH key, and `preview`/`publish` save the source there automatically.

To keep the source in **your own git repo** instead, pass it at init:

```bash
npx genex init my-game --repo https://git.example.com/you/my-game.git
```

Then `preview`/`publish` push the source to **your** repo using the git
credentials `git push` already uses on this machine (https or ssh). Point it at a
repo dedicated to this game — each publish overwrites its `main` with the current
source. Without push access, publish stops with a clear error and nothing ships.
The playable game is served by Genex either way.

## Publishing

Before your first `genex preview`, the play URL (`https://<slug>.genex.technology/`)
already serves a **standard placeholder world** — the owner's avatar in a small
playground, unrelated to your code. It is NOT in your repo; never treat it as a
starting point or try to modify it. Your first `preview` replaces it automatically.

`npx genex preview` deploys to your unlisted draft URL; `npx genex publish`
lists the game in the public gallery. When publishing, pick 1–3 gallery
categories from what you actually built — `games`, `assets`, `physics`,
`terrain`, `lighting`, `vfx` — and pass them comma-separated:

```bash
npx genex publish --categories games,vfx
```

If unsure, use `games` (also the server's fallback for anything unrecognized).

Your own files were left untouched. `genex init` only adds missing files and
refreshes the genex-owned ones.

## Reconnecting an existing game (`genex link`)

Each game's connection to its live page is folder-local (`.genex/project.json`).
If that folder is gone — deleted, or the game
was built on another machine — **don't run `init` to "recover" it**: that
creates a brand-new game at a new URL. Instead, clone the game's source repo
and re-link the clone to the same live game:

```bash
git clone <the game's repo url> my-game && cd my-game
npm install
npx @genex-ai/cli-demo@dev link <slug>   # slug = the name in the play URL
```

Don't know the slug? **`npx genex list`** prints every game on your account —
slug, status, and page link for each — signing you in first if needed. Find the
game there, then `link` its slug.

`link` never creates a project: it signs in if needed (the browser opens once)
and rewrites the local link (source pushes authorize over HTTPS, so there's no
key to set up — it works from any machine).
After it, `npx genex preview` / `npx genex publish` update the **same live
game** — plays, likes, and comments stay. It also fixes a folder whose
authorization went stale ("Not authorized" from `preview`/`publish`).

## Staying up to date

Genex commands print an update nudge when a newer package exists
(`⬆ Genex … available — run: …`). Follow `$genex-updates`: apply the printed
command at a safe moment (never mid-task), then tell the user what changed.
Skills need no action — they sync automatically on every `genex` command.

## Re-running setup

Safe to run any time — genex-owned skills are refreshed to the latest version,
and your own files are never touched:

```bash
npx @genex-ai/cli-demo@dev init
```

Use `--force` only if you intentionally want your own existing files overwritten
by the bundled templates too.

## Authorization

`genex init` opens the auth site, then saves your token to `~/.genex/env`
(reused across projects). If the browser doesn't open, copy the printed URL into
a browser manually to finish authorizing.
