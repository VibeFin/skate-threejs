---
description: Show the current Genex setup — workspace location, installed skills/agents, and whether a token is configured.
---

Report the user's Genex status:

1. Confirm the project's workspace directory (`.claude/` in the game folder)
   exists and list the `skills/`, `agents/`, and `commands/` it contains.
2. Check whether a `GENEX_TOKEN` is present in the project's `.env` (do not
   print the token value — only whether it is set).
3. If anything looks missing, suggest running `npx genex init`.

Keep the summary short and scannable.
