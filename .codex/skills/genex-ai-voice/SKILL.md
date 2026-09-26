---
name: genex-ai-voice
description: Generate a short spoken voice line (mp3) from text with `npx genex voice` — NPC barks, narrator beats, tutorial VO, announcer calls — picking a voice from the curated cast (`--voice narrator|heroine|gruff|elder|robot|imp`) or any raw ElevenLabs voice id (`--voice-id`). Billed per character, hard-capped at 1000 chars per line. Voice lines are content — keep them short, subtitled, and skippable.
---

# Genex AI · Voice

Turn a line of text into a real spoken **mp3** and play it in the game. A
guard that actually says "Halt! Who goes there?", a narrator that opens the
run, a tutorial voice over the first jump — one or two spoken lines move a
game from "asset flip" to "authored" faster than almost any other audio spend.

## When to use this vs. music / sfx

- **Use `npx genex voice`** for SPEECH: NPC barks, narrator lines, tutorial
  VO, announcer calls, boss taunts. The text you pass IS what gets spoken —
  write the line, not a description of it.
- **Use `$genex-ai-music`** for the continuous instrumental bed and
  **`$genex-ai-sfx`** for event sounds — impacts, pickups, UI ticks. A
  scream, grunt, or monster roar is an SFX (describe it), not a voice line.

**Voice lines are content, not chrome: keep them SHORT, show a SUBTITLE for
every line, and let the player skip or interrupt.** A game that talks over
itself un-skippably reads worse than a silent one.

## Run

```bash
npx genex voice "Halt! Who goes there?" --voice gruff
npx genex voice "Level up! New ability unlocked." --voice robot --no-wait
```

Prints:

```
https://assets.genex.technology/generations/<id>/audio-voice
```

The mp3 lives in Genex storage (R2) and loads straight from that URL — you
don't download it and nothing is committed to your repo. The URL is permanent
(local dev, published game, and remixes alike).

## The cast

Six curated archetypes — pick by gameplay role, not by auditioning ids:

| `--voice` | Reads as | Use for |
| --- | --- | --- |
| `narrator` (default) | warm storyteller | intros, quest text, tutorials |
| `heroine` | confident young female lead | player character, guide |
| `gruff` | fierce warrior | guards, bosses, drill sergeants |
| `elder` | wise old mentor | sages, shopkeepers, lore |
| `robot` | calm neutral synthetic | AI companions, announcers, computers |
| `imp` | husky trickster | goblins, sidekicks, comic relief |

**Escape hatch:** `--voice-id <ElevenLabsVoiceId>` uses any raw ElevenLabs
voice id (overrides `--voice`) — for when the user has a specific voice in
mind. The cast covers the normal cases; don't browse ids speculatively.

Pick ONE voice per character and stay with it — a guard who changes voice
between barks breaks the character. The model is multilingual: text in the
game's language comes back spoken in that language.

## Cost honesty

Voice is billed **per character of the submitted text**, hard-capped at
**1000 characters** per line (longer text is clamped, and the clamp is what
bills). A one-sentence bark costs a fraction of a credit-priced generation —
but 30 speculative barks are 30 paid calls. Write the script first, generate
once per line, and reuse lines (the same "Halt!" serves every guard).

## Wire it in Three.js

Same machinery as sfx — one `AudioListener` on the camera serves everything.
Non-positional (`THREE.Audio`) for narrator/announcer voices; positional
(`THREE.PositionalAudio`) when a CHARACTER in the world speaks:

```ts
import * as THREE from "three";

const listener = new THREE.AudioListener();
camera.add(listener); // ONE listener serves music, sfx, and voice

const VOICE_URL = "https://assets.genex.technology/generations/<id>/audio-voice";
const line = new THREE.Audio(listener); // PositionalAudio(listener) at the speaker's mesh for world speech
const subtitles = document.getElementById("subtitles")!;

new THREE.AudioLoader().loadAsync(VOICE_URL).then((buffer) => {
  line.setBuffer(buffer);
  line.setVolume(0.9);
});

function sayLine(text: string): void {
  if (line.isPlaying) line.stop(); // a new line interrupts the old — never overlap voices
  line.play();
  subtitles.textContent = text;    // SUBTITLE every voice line, always
  subtitles.classList.add("visible");
  line.onEnded = () => subtitles.classList.remove("visible");
}
```

- **Subtitles are mandatory** — the same text you generated from, shown while
  the line plays. Muted players and streamers still get the content.
- **Route voice volume through the SFX slider** (or its own Voice slider in a
  dialogue-heavy game) — `$genex-threejs-game-ui`'s settings rule; an
  uncontrollable voice is worse than none.
- **Duck the music** while a line plays (`music.setVolume(0.15)`, restore on
  `onEnded`) so speech never fights the bed.
- Browsers block autoplay: no voice before the first user gesture (the menu's
  PLAY click).

## Publish checklist

- Load from the **URL** the command printed — permanent, nothing to commit.
- Every generated line is WIRED and subtitled — an unwired paid line is
  flagged at preview/publish (the wiring audit).
- Lines are skippable/interruptible and respect the volume sliders.

## Options

- `--voice <cast>` — `narrator|heroine|gruff|elder|robot|imp` (default
  `narrator`).
- `--voice-id <id>` — any raw ElevenLabs voice id (overrides `--voice`).
- `--no-wait` — enqueue and return immediately with the generation id; pick
  it up later with `npx genex wait <id>` (safe to re-run — it attaches to the
  SAME generation).
- `--api-url <url>` — override the API base (local dev).

## Troubleshooting

- **"Not authorized"** — run `npx genex init` first (in the project — it resolves this project's own CLI) (it writes your `GENEX_TOKEN`).
- **"Out of credits" (`insufficient_credits`)** — the account has no credits
  left for this voice generation. Tell the user the facts the CLI printed:
  their balance, this generation's cost, and when their credits refill. Then
  continue the build with the subtitle alone (the game must read fine silent
  anyway) and mark the spot with `// TODO(genex): regenerate when credits refill`
  so the real line is one command away later. Do not stop the session
  over this.
- **"Email not verified" (`email_verification_required`)** — generation
  credits unlock after the account's email is verified. Give the user the
  verify link the CLI printed, wait for them to confirm, then re-run the
  command.
- **The line got cut off** — text past 1000 characters is clamped (the CLI
  warns). Split long copy into separate lines — narration beats work better
  as short lines anyway.
- **Wrong language/accent** — the model speaks the language of the TEXT; for
  an accent, pick a different cast voice (or a specific `--voice-id`) rather
  than describing the accent in the text.
- **No sound** — the `AudioContext` is suspended until a user gesture; confirm
  the camera has an `AudioListener` and the first play comes from a
  click/keydown.
