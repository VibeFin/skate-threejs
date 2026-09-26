# Genex workspace

These files were installed by `genex init` into THIS project's agent
workspace — Claude Code (`.claude/`), Codex (`.codex/skills/`), and Cursor
(`.cursor/skills/`) inside the game folder, whichever agents it detected.
Nothing is installed globally; delete the folder and every trace is gone.
They give your agent superpowers for making 3D games in the browser.

Genex is built around agent superpowers for browser games: Three.js skills,
one-click publishing, multiplayer-ready architecture, and team workflows.

Files whose names start with `genex-` are managed by Genex: every `genex`
command keeps them in sync with the installed CLI version automatically
(re-running `genex init` does too). Anything you add yourself is never touched.

- `skills/` - reusable Genex skills for 3D game creation.
- `agents/` - example subagent definitions.
- `commands/` - example slash commands.

Start with `skills/genex-game-director/SKILL.md` when asking your agent
to build or improve a 3D browser game.
