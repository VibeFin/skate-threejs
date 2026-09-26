# Generating character motion

`npx genex character animate <character-id> "<verb>"` — one clip per verb, on
this character's own rig. Read this before the first run; it is short, and the
first two sections are where the credits go.

```bash
npx genex character animate <id> "overhead slam" --no-wait
npx genex character animate <id> --locomotion --no-wait
npx genex character animate <id> "leap the gap and roll on landing" --duration 6
npx genex character animate <id> "victory pose" --video ./take-3.mp4
npx genex character motions <id>
npx genex creature animate <id> "wind-up ground pound" --no-wait
```

You do not choose how a verb is made. The platform prints a plan first — which
verbs it will reuse, generate, or act out on video, and one total. **Show the
plan to the user.** That is the single stop in this lane; after it, everything
runs in the background while you keep building. Collect it later with
`genex wait --all`.

## Write the verb like a stage direction

The generator turns your words into a body performance, so name the BODY, not
the intent. "Overhead slam" is a motion; "attack" is a category.

| instead of | write |
| --- | --- |
| `attack` | `heavy two-handed overhead slam, ending in a low crouch` |
| `hurt` | `stagger back two steps from a chest impact, arms flailing` |
| `win` | `plant both feet, raise one fist overhead, chest out` |
| `die` | `drop to the knees, then fall forward onto the chest` |

Three things make a verb generate well:

- **Name the beats.** A wind-up, a committed main beat, a recovery. A motion with
  one beat reads as a twitch.
- **Say where the weight goes.** "Sinks into the knees as it lands" is the single
  most useful phrase you can add — without it you tend to get a bow from the
  waist where you wanted a crouch.
- **Keep it one person, standing, on the floor.** No props that define the pose,
  no partner, no furniture.

## What this cannot do

Do not spend on these — pick a different approach instead:

- **Fingers and fine manipulation** — picking a lock, typing, a trigger squeeze,
  threading a needle. Generated rigs have no finger bones, so the hand simply
  will not do it. Fake it with a prop animation or a cut.
- **Two characters interacting** — a handshake, a grapple, a carry. Only one body
  is generated. Animate each side separately and time them in code.
- **Anything a prop defines** — swinging on a rope, climbing a specific ladder,
  sitting in a specific chair. The clip does not know your geometry; drive those
  with `$genex-threejs-procedural-animation` instead.
- **Non-bipeds** — quadrupeds, fliers, blobs. See `$genex-threejs-creatures`;
  those stay static models plus procedural motion.

## Room to land the beats: `--duration`

Some verbs are made by generating a short reference video of a performer and
converting THAT into motion — the plan says which ones ("acted out on video").
The footage is a hard ceiling on the animation, and the default 3 seconds is a
tight fit for anything with more than one beat: a performer given too little
time rushes, and a rushed wind-up-slam-recover comes back as a bow.

`--duration 3|4|5|6` gives those verbs more room. Use it when the verb you wrote
genuinely has three beats — a leap with a landing roll, a stagger that recovers,
a combo. Leave it alone for a single action; longer is not better, it is just
longer, and it costs more.

It only reaches verbs the platform routes to video, and the plan tells you
whether it applied. It cannot change footage you supplied with `--video` —
that clip already has a length.

## Movement: `--locomotion`

Generates the full 8-way walk + run set — 16 clips. This fills the directional
slots the shipped controller already resolves (`walk.forward-left`,
`run.back-right`, and so on) but that the stock pack leaves empty, so strafing
stops being a forward walk played sideways.

Six slots belong to the reviewed controller pack and cannot be replaced:
`idle.default`, `walk.forward`, `run.forward`, `crouch.forward`, `crouch.idle`,
`jump.full`. A generated set fills the other fourteen; the plan says which. A
character built without the pack — every `genex creature` — takes all sixteen.

For an enemy that follows a path, `--lean` generates forward walk + run only.
Enemies have no controller state machine driving a direction picker, so the
other six directions would never play. Ask for the full set when a boss
genuinely circles the player.

## Your own footage: `--video`

`--video ./clip.mp4` converts a real performance instead of a generated one.
The footage is a hard ceiling on the result — nothing can add weight the
performer never committed — so it has to meet the extractor's requirements:

- **Exactly one person**, alone in frame.
- **Whole body visible**, head to feet, for the entire clip. A limb that leaves
  the frame is a gap that cannot be recovered.
- **Locked-off camera.** No pan, no zoom, no handheld drift, no cuts.
- **Plain contrasting background**, and clothing in distinct solid colors — no
  long coat, cape, or skirt over the legs.
- **Even lighting.** Heavy shadows or a silhouette degrade the extraction.
- **2–60 seconds.** `.mp4` or `.mov`.

Phone recordings work. So do screen captures and gameplay clips.

The video is checked against these rules before anything is converted, and a
failure tells you which requirement broke and roughly when — re-shoot against
that note rather than re-running the same file.

## After the clips land

```bash
npx genex controller character --character <character-id>
```

Then play the game and watch the motion on the real character. Numbers and a
completed job prove the clip installed; only your eyes prove it reads right.

A clip that plays as a T-pose or does not play at all means it did not bind —
check `genex character motions <id>` to see what is actually installed. Do not
"fix" it with runtime bone corrections; regenerate it.
