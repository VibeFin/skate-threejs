// THE BOARD — your best minute, kept on this device.
//
// This game is single-player and runs standalone: there is no online
// identity (the old `@genex-ai/embed-sdk` import redirected the page to a
// Genex sign-in, so it is gone). The board is therefore LOCAL — one row per
// board, your own best, durable in localStorage. The exported shapes are
// unchanged, so every readout prints exactly what it printed before, just
// with your own line on it.

const BEST_KEY = "skate:board:minute:best";

/**
 * The board's name. Named rather than left default so a later mode — a longest
 * single line, a per-map board — can be added beside it without moving these
 * rows into a bucket they were never scored for.
 */
export const RUN_BOARD = "minute";

/** How many leaders the readouts ask for. */
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
  /** Where the player stands. Null when nothing is posted yet. */
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
 *
 * Local rule, keep-best-highest: submitting a worse score changes nothing.
 */
export async function postRunScore(score: number): Promise<PostedScore> {
  const clean = Math.max(0, Math.round(score));
  const prev = readBest();
  if (clean > prev) {
    writeBest(clean);
    return { best: clean, improved: prev > 0 };
  }
  return { best: prev > 0 ? prev : null, improved: false };
}

/**
 * Read the leaders — your own best, or empty when nothing is posted yet.
 * Every caller already prints an empty board, so a fresh device just shows
 * that.
 */
export async function fetchLeaders(limit = BOARD_SIZE): Promise<BoardView> {
  const best = readBest();
  if (best <= 0) return { rows: [], me: null };
  return {
    rows: [{ rank: 1, name: "YOU", score: best, me: true }].slice(0, Math.max(1, limit)),
    me: { rank: 1, score: best },
  };
}

function readBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

function writeBest(score: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* storage blocked — the run still happened, it just is not kept */
  }
}
