// Where the two volume levels live between sessions.
//
// ONE STORE: the device (localStorage), read SYNCHRONOUSLY at construction,
// so there is never a frame where the game is loud because a save had not
// arrived yet. It is the right home for the choice anyway — volume is a
// property of the speakers you are sitting in front of, the same argument
// `controllers/quality/tier.ts` makes for the quality picker.
//
// There used to be a second store, the account copy via the embed SDK. That
// SDK is gone (it redirected the page to a Genex sign-in), so the account
// functions below are local no-ops kept for their signatures — `audio.ts`
// calls them, and the device copy holds everything.

export interface AudioLevels {
  music: number;
  sfx: number;
}

const DEVICE_KEY = "skate:audio";

function clamp01(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;
}

function readLevels(raw: unknown): Partial<AudioLevels> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const music = clamp01(o.music);
  const sfx = clamp01(o.sfx);
  if (music === undefined && sfx === undefined) return null;
  return { ...(music !== undefined && { music }), ...(sfx !== undefined && { sfx }) };
}

/** This device's stored levels, or null if it has never been told any. */
export function readDevice(): Partial<AudioLevels> | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    return raw ? readLevels(JSON.parse(raw)) : null;
  } catch {
    // Storage blocked (private mode, third-party iframe) or corrupt JSON.
    return null;
  }
}

function writeDevice(levels: AudioLevels): void {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(levels));
  } catch {
    /* storage blocked — levels last for the session only */
  }
}

/**
 * The account's copy — none, standalone game. Resolves null so the device
 * copy (read at construction) stands unchallenged.
 */
export async function loadAccount(): Promise<Partial<AudioLevels> | null> {
  return null;
}

/** No shared blob any more; the version is always 0. */
const lastVersion = 0;

/**
 * Make these levels durable. The device copy lands now — it is the only
 * store, so there is nothing to debounce for.
 */
export function persist(levels: AudioLevels): void {
  writeDevice(levels);
}

/** Nothing pending, nothing to push — kept for the call sites. */
export function flushNow(): void {}

/** The blob version last seen, for anything else that grows into this slot. */
export function playerStateVersion(): number {
  return lastVersion;
}
