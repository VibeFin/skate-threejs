// Where the two volume levels live between sessions.
//
// TWO STORES, ON PURPOSE, and which one wins is the whole design:
//
//   THE DEVICE (localStorage) is read SYNCHRONOUSLY at construction, so there
//   is never a frame where the game is loud because a save had not arrived yet.
//   It is also the only store a guest, an offline reload or a blocked session
//   has, and it is the right home for the choice anyway — volume is a property
//   of the speakers you are sitting in front of, the same argument
//   `controllers/quality/tier.ts` makes for the quality picker.
//
//   THE ACCOUNT (`savePlayerState`) is the copy that travels. It is read once,
//   late, and it only APPLIES when this device has never been set — a player
//   who just moved the slider on this laptop means it, and having a phone's
//   old setting arrive two seconds later and override them is the failure mode
//   every cross-device settings sync has.
//
// The account write is a load-merge-save rather than a straight write, because
// the player slot is ONE blob for the whole game. Whatever else ends up saving
// progress there has to survive somebody changing the music volume.

import { loadPlayerState, savePlayerState } from "@genex-ai/embed-sdk";

export interface AudioLevels {
  music: number;
  sfx: number;
}

const DEVICE_KEY = "genex:skate:audio";
/** Our corner of the shared player blob. */
const SLOT_KEY = "audio";

/** Long enough that dragging a slider is one write, short enough to survive a
 *  tab close right after letting go. The server allows 60 a minute; this makes
 *  a 10-second drag cost one. */
const SAVE_DEBOUNCE_MS = 800;

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
    /* storage blocked — the account copy is the only durability left */
  }
}

/**
 * The account's copy, if there is one. Resolves null for guests, for a session
 * with nothing saved, and for any failure — a settings read is never worth
 * failing a boot over.
 */
export async function loadAccount(): Promise<Partial<AudioLevels> | null> {
  try {
    const { data, version } = await loadPlayerState();
    lastVersion = version;
    if (!data || typeof data !== "object") return null;
    return readLevels((data as Record<string, unknown>)[SLOT_KEY]);
  } catch {
    return null;
  }
}

/** Version of the player blob as last seen, so a two-device race is detected
 *  rather than silently winning. */
let lastVersion = 0;
let pending: AudioLevels | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  const levels = pending;
  timer = null;
  pending = null;
  if (!levels) return;
  try {
    // Re-read immediately before writing: this is a shared blob and the read is
    // what keeps somebody else's key from being replaced by an object that only
    // has ours in it.
    const { data, version } = await loadPlayerState();
    const base = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const res = await savePlayerState({ ...base, [SLOT_KEY]: levels }, { ifVersion: version });
    lastVersion = res.version ?? version;
    if (res.conflict) {
      // Somebody wrote between the read and the write. One retry, on the fresh
      // version — and no loop, because the losing value here is two numbers.
      const again = await loadPlayerState();
      const merged = again.data && typeof again.data === "object" ? again.data : {};
      await savePlayerState(
        { ...(merged as Record<string, unknown>), [SLOT_KEY]: levels },
        { ifVersion: again.version },
      );
    }
  } catch {
    /* guest, blocked, offline, or rate-limited — the device copy still holds */
  }
}

/**
 * Make these levels durable. The device copy lands now; the account copy lands
 * after the player has stopped moving the slider.
 */
export function persist(levels: AudioLevels): void {
  writeDevice(levels);
  pending = levels;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
}

/** Push a pending save out now — for a tab that is going away. */
export function flushNow(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  void flush();
}

/** The blob version last seen, for anything else that grows into this slot. */
export function playerStateVersion(): number {
  return lastVersion;
}
