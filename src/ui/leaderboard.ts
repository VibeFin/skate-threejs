// The global board, as pixels.
//
// One renderer for two places — the end of a run and the title screen — because
// they show the same rows and a second copy is how two lists end up disagreeing
// about what a rank looks like. It draws TEXT and hairlines and nothing else:
// no panel, no card, no backing plate behind the digits (AGENTS.md), so the
// board sits over the game the way the combo readout does.
//
// Display names arrive from the server, which is what makes them worth showing
// — but they are still somebody else's typing, so every one of them is escaped
// on the way in.

import type { BoardRow, BoardView } from "../game/leaderboard";

export const BOARD_CSS = `
.lb {
  display: flex; flex-direction: column; gap: 0;
  width: min(560px, 84vw); margin-inline: auto;
  font-family: "Barlow Condensed", system-ui, sans-serif;
}
.lb-row {
  display: grid; grid-template-columns: 2.4em 1fr auto; align-items: baseline;
  gap: .8em; padding: .28em 0;
  border-bottom: 1px solid rgba(255,255,255,.14);
}
.lb-row:last-child { border-bottom: 0; }
/* THE RANK. Syne Mono as of 2026-07-29, with the rest of the game's numbers —
   the player asked for one font language and named the clock and the streak;
   this is the same species and it sits DIRECTLY under the results card's own
   Syne Mono total, which is where a third face was most obvious. Weight drops
   700 → 400 because Syne Mono has one weight and 700 was faux-bolding it. */
.lb-row b {
  font-family: "Syne Mono", ui-monospace, Menlo, monospace; font-weight: 400;
  font-size: clamp(15px, 1.9vw, 22px); color: rgba(255,255,255,.5);
  text-align: right; letter-spacing: .02em;
}
/* Left, against the screens' own centring — a column of names reads down its
   own left edge, and centred names turn a board into a poem. */
.lb-row span {
  font-size: clamp(12px, 1.5vw, 17px); letter-spacing: .12em; font-weight: 600;
  text-transform: uppercase; color: rgba(255,255,255,.88); text-align: left;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* …and the SCORE beside it, same reason, same face. See the rank above for why
   the weight comes down with it. */
.lb-row em {
  font-family: "Syne Mono", ui-monospace, Menlo, monospace; font-style: normal;
  font-weight: 400; font-size: clamp(16px, 2.1vw, 25px); color: #fff;
  letter-spacing: .01em;
}
/* The player's own row is the one thing on the board they are looking for. */
.lb-row.me b, .lb-row.me em { color: #ffd23d; }
.lb-row.me span { color: #ffd23d; }
/* …and the top three, which is what a board is for. */
.lb-row.top b { color: #ffd23d; }
.lb-empty {
  font-size: clamp(12px, 1.5vw, 16px); letter-spacing: .22em; font-weight: 700;
  text-transform: uppercase; color: rgba(255,255,255,.5); text-align: center;
  padding: .8em 0;
}
/* Where the player stands when that is off the bottom of the top ten. It is a
   row like any other, set apart by a gap rather than by a box. */
.lb-mine { margin-top: .5em; border-top: 1px solid rgba(255,255,255,.24); }
`;

/** `146,176` — the board and the score readout print numbers the same way. */
function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

function row(entry: BoardRow, extra = ""): string {
  const cls = `lb-row${entry.me ? " me" : ""}${entry.rank <= 3 ? " top" : ""}${extra ? ` ${extra}` : ""}`;
  return `<div class="${cls}"><b>${entry.rank}</b><span>${esc(entry.name)}</span><em>${fmt(entry.score)}</em></div>`;
}

/**
 * The whole board as one block of HTML.
 *
 * An empty board is a NORMAL result, not an error: nobody has posted yet on
 * this device. It says so plainly.
 */
export function boardHtml(view: BoardView, empty = "No scores posted yet"): string {
  if (view.rows.length === 0) return `<div class="lb"><div class="lb-empty">${esc(empty)}</div></div>`;
  const rows = view.rows.map((r) => row(r)).join("");
  // The player's own standing, printed under the leaders when it is not already
  // among them — a player in 41st place still wants to see 41st place.
  const mine =
    view.me && !view.rows.some((r) => r.me)
      ? row({ rank: view.me.rank, name: "You", score: view.me.score, me: true }, "lb-mine")
      : "";
  return `<div class="lb">${rows}${mine}</div>`;
}
