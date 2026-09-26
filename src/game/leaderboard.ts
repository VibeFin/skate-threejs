// THE GLOBAL BOARD — highest score anyone has managed inside one minute.
//
// This game is single-player. The board is the ONLY global thing in it, and it
// is the platform's own: `@genex-ai/embed-sdk` owns identity, the row per
// player and the verified display names, so nothing here hand-rolls a fetch to
// a state endpoint and nothing here trusts a name typed on this machine. The
// SDK helpers are safe to call for guests — a guest's submit queues in memory
// and posts itself if they sign in mid-session — so there is no guest branch
// anywhere below, and deliberately no sign-in prompt of our own (the SDK's
// popover owns that UX).
//
// One board, one mode, forever: `mode` defaults to keep-best-highest, which is
// what "the global leaders by points" means. Submitting a worse score changes
// nothing, so every run submits and the server decides.

import { getLeaderboard, getUser, submitScore } from "@genex-ai/embed-sdk";

/**
 * The board's name. Named rather than left default so a later mode — a longest
 * single line, a per-map board — can be added beside it without moving these
 * rows into a bucket they were never scored for.
 */
export const RUN_BOARD = "minute";

/** How many leaders the readouts ask for. The server caps at 100. */
export const BOARD_SIZE = 10;

/** One row of the board, already ranked and marked. */
export interface BoardRow {
  rank: number;
  name: string;
  score: number;
  /** This player's own row, so the readout can light it. */
  me: boolean;
}

export interface BoardView {
  rows: BoardRow[];
  /** Where the signed-in player stands, even when that is off the bottom of the
   *  top ten. Null for guests and for anyone with no score yet. */
  me: { rank: number; score: number } | null;
}

/** What a submitted run came back as — enough for the results line to read. */
export interface PostedScore {
  /** The player's standing best after the submit, which may be an older run. */
  best: number | null;
  /** True when THIS run beat it. */
  improved: boolean;
}

/**
 * Post a finished run. Fire-and-forget from the caller's point of view: it
 * never throws, because a board that is down must not take the game with it —
 * the run still happened and the player still has their number on screen.
 */
export async function postRunScore(score: number): Promise<PostedScore> {
  try {
    const res = await submitScore(Math.max(0, Math.round(score)), { board: RUN_BOARD, mode: "max" });
    return { best: res.best ?? null, improved: res.improved === true };
  } catch (e) {
    console.warn("[leaderboard] submit failed", e);
    return { best: null, improved: false };
  }
}

/**
 * Read the global leaders. Works for guests and for signed-out visitors (they
 * see the board, they are just not on it), and resolves empty in local test
 * mode, where nothing online exists — so every caller has to be able to print
 * an empty board rather than treating it as a failure.
 */
export async function fetchLeaders(limit = BOARD_SIZE): Promise<BoardView> {
  try {
    const board = await getLeaderboard({ board: RUN_BOARD, limit, order: "desc" });
    const meId = getUser()?.id ?? null;
    return {
      rows: board.items.map((entry, i) => ({
        rank: i + 1,
        name: entry.name,
        score: entry.score,
        me: meId !== null && entry.userId === meId,
      })),
      me: board.me,
    };
  } catch (e) {
    console.warn("[leaderboard] read failed", e);
    return { rows: [], me: null };
  }
}
