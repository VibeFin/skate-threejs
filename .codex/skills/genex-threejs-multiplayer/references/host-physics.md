# Networked physics — pushable/ownable objects, contested objects + controllers

Three networking tiers exist for moving things, and picking the right one per object is the
whole trick:

| Object kind | Tier | How |
| --- | --- | --- |
| **Pushable / ownable body** — a ball, a crate you shove, a physics prop, a pickup; one player interacts at a time (even if players take turns) | **claim-on-touch + a Rapier proxy** (Tier 1) | whoever touches it owns + simulates it locally with REAL physics; the soft handoff glides ownership changes |
| **Genuine simultaneous contest** — two players pushing ONE object *against each other*: sumo, tug-of-war, a shared crate nobody should "own" | **host-authoritative** (Tier 2) | one neutral simulation (the host) runs the contest; everyone else sends inputs |
| **Your own controller** — the vendored character / vehicle / drone rig | **publish-and-playback** (Tier 3) | each player simulates their OWN rig; remotes replay the pose |

The old advice was "claim-on-touch breaks down under sustained contact, use host-authoritative for
anything contested." That was true only because an ownership handoff used to **teleport** the object
— the interpolation buffer reset on every claim. **Since `@genex-ai/multiplayer` 0.8.4 the handoff is
a soft handoff: the render glides across the ownership change instead of snapping** — so claim-on-touch
is now the right default for any *ownable* body (a ball, a box, a prop), even when players take turns
bumping it. Reserve host-authoritative (Tier 2) for a genuine *simultaneous* tug-of-war where handing
ownership to "whoever touched last" is itself the wrong model.

## Tier 1 — pushable / ownable body (claim-on-touch + a Rapier proxy)

Install the product helper first:

```bash
genex controller networked-physics
```

`NetworkedPushable` owns the confirmed-claim/retry, dynamic-to-kinematic switch, visible-proxy pose
plus raw-momentum handoff seed,
single-smoothed follower, moved-only publishing, keepalive, release-on-rest, finite pose validation,
and host reset snap. Prefer that helper over copying this explanatory state machine.

The object is a REAL Rapier body on every client, and its body TYPE follows ownership:

- **You own it → a `dynamic` body.** Your (dynamic) character capsule collides with it and Rapier's
  solver resolves the push on the fixed substep — real momentum, spin, friction, bounce, zero latency.
  A *regular pushable object*, not a dribble and not an attachment.
- **You don't own it → a `kinematicPosition` body** you drive each frame to the smoothed
  `objects.get(id).state`. It's solid, so your character physically bumps it — and that bump fires your
  claim.

This is ONE body that IS the render — not a second "prediction" body running alongside the stream
(that would be double-simulation, the sibling of double-smoothing). When you own it you draw the dynamic
body; when you don't you draw the smoothed stream and park the kinematic body on it.

```ts
import RAPIER from "@dimforge/rapier3d-compat";
const r2 = (n: number) => Math.round(n * 100) / 100;
interface BallState { x: number; y: number; z: number; q?: number[]; vx?: number; vy?: number; vz?: number }

// Proxy body: kinematic to start (owned by nobody, or by someone else). `excludeCharacterRay` keeps the
// character's GROUND query from treating it as walkable, so players can't stand on / ride the ball (the
// solver collision that drives claim-by-bump + the shove is unaffected).
const body = physics.createBody({
  type: "kinematicPosition", position: [x, y, z], ccd: true,
  userData: { controller: { excludeCharacterRay: true } },
});
ballCollider(physics.world, body, RADIUS, { friction: 0.5, restitution: 0.35, density: 0.6 });
let touching = false, wasMine = false, pendingClaim: Promise<unknown> | null = null, retryAt = 0;
const MAX_SPEED = 24;

// The host seeds the canonical spawn ONCE so the object exists on `objects` for late joiners.
async function ensureInit() {
  if (room.isHost && room.objects.get("ball") === undefined) {
    const result = await room.objects.claimConfirmed("ball", { authority: "host" });
    if (!result.accepted) return;
    room.objects.snap("ball", { x, y, z, q: [0, 0, 0, 1], vx: 0, vy: 0, vz: 0 });
    await room.objects.releaseConfirmed("ball");
  }
}

// Per-frame, BEFORE physics.step (so the kinematic proxy is in place for the character to hit it):
function updateBall(dt: number) {
  let v = room.objects.get<BallState>("ball");
  let mine = !!v?.isMine;

  // Keep contact validity alive. One rejected collision edge must not consume the attempt forever:
  // retry after the relay hold delay while STILL touching, with at most one request in flight.
  const dx = ballMesh.position.x - feet.x, dz = ballMesh.position.z - feet.z;
  touching = onFoot && Math.hypot(dx, dz) < RADIUS + REACH;
  if (touching && !mine && !pendingClaim && performance.now() >= retryAt) {
    pendingClaim = room.objects.claimConfirmed("ball").then((result) => {
      if (!result.accepted && touching && (result.reason === "held" || result.reason === "rate-limited")) {
        retryAt = performance.now() + (result.retryAfterMs ?? 50); // both carry a server retry delay — honor it
      } else retryAt = 0;
    }).finally(() => { pendingClaim = null; });
  }

  if (mine && !wasMine) {
    // Gained ownership → dynamic. SEED velocity from the wire (NEVER zero, or a rolling ball
    // stalls on the handoff); keep the position where the proxy already renders (no snap).
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    const raw = v?.stateRaw;
    body.setLinvel({ x: raw?.vx ?? 0, y: raw?.vy ?? 0, z: raw?.vz ?? 0 }, true);
  } else if (!mine && wasMine) {
    body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);  // lost → follower
  }
  wasMine = mine;

  if (mine) {
    // Cap the owned body's speed: CCD stops single-step tunnelling, the cap stops runaway speed
    // (a hard shove into a wall) from flinging the ball across the map.
    const lv = body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z);
    if (sp > MAX_SPEED) { const k = MAX_SPEED / sp; body.setLinvel({ x: lv.x * k, y: lv.y * k, z: lv.z * k }, true); }
    ballMesh.position.copy(body.translation());          // draw the dynamic body I simulate
    ballMesh.quaternion.copy(body.rotation());
  } else if (v?.state) {
    ballMesh.position.set(v.state.x, v.state.y, v.state.z); // draw the smoothed stream
    body.setNextKinematicTranslation(ballMesh.position);    // keep the proxy on it → I can bump → claim
    if (Array.isArray(v.state.q)) {
      // Rotate the collider too, or a tumbled cube collides as an axis-aligned box and pops on claim.
      ballMesh.quaternion.set(v.state.q[0], v.state.q[1], v.state.q[2], v.state.q[3]);
      body.setNextKinematicRotation({ x: v.state.q[0], y: v.state.q[1], z: v.state.q[2], w: v.state.q[3] });
    }
  }
}

// Owner-gated publish on your fixed tick (30Hz for a fast ball). Publish MOVED-ONLY + a ~2Hz keepalive —
// NEVER every tick (a resting owned object republished each tick is the #1 budget-blower; it matters the
// moment you own more than one prop). Include VELOCITY so the next owner seeds from it without stalling.
let lastSent = "", lastAt = 0;
function publishBall() {
  if (!room.objects.get<BallState>("ball")?.isMine) return;
  const t = body.translation(), q = body.rotation(), lv = body.linvel();
  const net = { x: r2(t.x), y: r2(t.y), z: r2(t.z),
    q: [r2(q.x), r2(q.y), r2(q.z), r2(q.w)], vx: r2(lv.x), vy: r2(lv.y), vz: r2(lv.z) };
  const json = JSON.stringify(net), nowMs = Date.now();
  if (json === lastSent && nowMs - lastAt < 500) return;   // unchanged + within keepalive window → skip
  lastSent = json; lastAt = nowMs;
  room.objects.set("ball", net);
}
```

Rules that make it correct:

- **Sustained-contact confirmed claim:** keep one request pending; after `held`, retry at
  `retryAfterMs` only while contact still exists. Never spam every frame and never let one rejected
  collision edge permanently disable the interaction.
- **Never zero velocity on claim** — seed `linvel` from the published `vx/vy/vz`, or a rolling ball snaps
  to a dead stop on every handoff.
- **Publish velocity, not just position** — the next owner seeds from it, so the object keeps its motion
  across the handoff.
- **Release-on-rest** (optional): once you own an object that's been at rest + untouched a couple of
  seconds, `await room.objects.releaseConfirmed("ball")` so ownership doesn't pile up on a lone
  wanderer — its last
  state persists on the wire for the next toucher, who re-claims.
- **Distributed by construction:** each client publishes only what it currently owns, so the message
  budget spreads across players instead of funnelling every object through one host's send budget. This
  is why Tier 1 scales to many pushable objects where a host-authoritative fleet (Tier 2) would blow one
  client's rate cap.
- **Publish moved-only + a low-rate keepalive**, never every tick — a resting owned object republished at
  full rate is the classic budget-blower, and it bites the moment one player owns several props.
- **Exclude the proxy from the character's ground query** (`userData.controller.excludeCharacterRay`), or
  players stand on the ball/cube and it squirts out from under them the instant they claim it.
- **Rotate the follower, not just its position** (`setNextKinematicRotation`) — a cube another player
  tumbled otherwise collides as an axis-aligned box (wrong contact) and pops to identity on claim.
- **Cap the owned body's speed** — CCD stops single-step tunnelling; the cap stops runaway speed (a hard
  shove into a wall) from flinging the object across the map.
- **Do NOT `registerBody(proxy, mesh)`** — drive the mesh yourself (from the body when you own it, from
  the stream when you don't). Registering it fights the SDK's smoothing on the stream half.

## Tier 2 — genuine simultaneous contest (host-authoritative)

For a real tug-of-war — two players pushing ONE crate *against each other*, sumo — handing ownership to
"whoever touched last" is the wrong model: a single neutral simulation must own the contest. The **host**
runs the ONE Rapier world for those objects; everyone else sends **inputs**, which the relay routes to
the current host only.

Every client runs this same code — `onHostTick` only fires on the current host, so there is no "am I
host?" bookkeeping and host migration is automatic:

```ts
// ---- inputs: NON-hosts (and the host itself) report intent, ~10-15Hz or on action ----
// Routed by the relay to the CURRENT HOST ONLY — never broadcast, cheap.
if (pushingCrate) room.inputs.send({ obj: "crate", push: dir.toArray() });

// ---- simulation: runs ONLY on the host, survives migration ----
const pending: { obj: string; push: number[] }[] = [];
room.inputs.on((fromId, payload) => {
  const p = payload as { obj?: string; push?: number[] };
  if (p?.obj && Array.isArray(p.push)) pending.push(p as { obj: string; push: number[] });
});

let hostReady: Promise<boolean> | null = null;
function ensureHostReady() {
  if (!room.isHost) return Promise.resolve(false);
  if (hostReady) return hostReady; // single flight: async host ticks never overlap adoption
  hostReady = (async () => {
    for (const id of CONTESTED_IDS) {
      const raw = room.objects.get(id)?.stateRaw; // capture BEFORE claim changes local ownership view
      const result = await room.objects.claimConfirmed(id, { authority: "host" });
      if (!result.accepted) return false;
      seedRapierBody(id, raw); // position/rotation/velocity from the wire, NEVER zero
    }
    pending.length = 0; // discard intent queued for the previous host/timeline
    return true;
  })();
  return hostReady;
}
room.on("host", () => { hostReady = null; void ensureHostReady(); });

room.onHostTick(30, async (dtMs) => {
  // 1) No physics or publishing until the whole host-owned set is adopted and seeded.
  if (!(await ensureHostReady())) return;
  // 2) Apply everyone's inputs to the ONE authoritative Rapier world.
  for (const { obj, push } of pending.splice(0)) applyImpulse(obj, push);
  // 3) Step and publish (flat state: numbers + one [x,y,z,w] quaternion).
  rapierWorld.step();
  for (const id of CONTESTED_IDS) {
    const b = bodyOf(id);
    room.objects.set(id, {
      x: r2(b.translation().x), y: r2(b.translation().y), z: r2(b.translation().z),
      q: quatArray(b.rotation()),
    });
  }
});
const r2 = (v: number) => Math.round(v * 100) / 100; // quantize — floats are JSON bloat

// ---- rendering: host draws its live simulation; followers draw the guarded smooth stream ----
for (const id of CONTESTED_IDS) {
  if (room.isHost) { drawFromBody(meshOf(id), bodyOf(id)); continue; }
  const view = room.objects.get(id);
  if (view && Number.isFinite(view.state.x) && Number.isFinite(view.state.y) && Number.isFinite(view.state.z)) {
    meshOf(id).position.set(view.state.x, view.state.y, view.state.z); // auto-smoothed
  }
}
```

Rules that make it correct:

- `onHostTick` pauses during reconnect and stops on demotion/leave/terminal disconnect. Bound the input
  queue, attribute input from the callback's authenticated `fromId` (never payload `from`), and discard
  stale pre-failover inputs when a new host adopts raw state.
- Host election and object ownership are separate. Adoption is one async flight per host term; never
  issue claims every tick, and never step/publish until every required claim was accepted.

- **Sim internals that must survive migration** (velocities, cooldowns, aggro) either live in
  the published object state or get mirrored at low rate into a dedicated object
  (`objects.set("sim", …)`) the next host reads on adoption. Positions/rotations come free
  via `stateRaw`.
- **Latency honesty:** a non-host's push lands after ~RTT to the relay. At casual scale that
  reads as weight, not lag. The host's own pushes are instant — that asymmetry is the tier's
  price. (Tier 1 has no such asymmetry — the owner IS the simulator — which is another reason to
  prefer it for a plain pushable body.)
- **Rate budget:** the host publishes N contested objects at 20–30 Hz; keep N modest (≤ ~8) and
  state flat + quantized. Inputs are single-receiver and cheap.
- **Do not** run a second Rapier body for a Tier-2 object on non-hosts "for prediction" — that's the
  double-simulation version of double-smoothing. Non-hosts draw `state`. (This is the opposite of the
  Tier-1 proxy, which is a single body that IS the render for the object you OWN — not a shadow sim of
  one the host owns.)

## Tier 3 — networked controllers (the vendored character / vehicle / drone)

The `genex controller` controllers are **local-only physics** — each player simulates their
OWN rig (self-authoritative, zero latency). Networking them is publish-and-playback, never
remote simulation:

The vendored controllers expose their pose as `currPos` (a `THREE.Vector3`) and `currQuat` (a
`THREE.Quaternion`) — **not** `.position` / `.quaternion` — plus boolean state getters. Character
animation is driven by **six booleans**, not a single enum; publish the booleans and let remotes
reconstruct the animation. There is **no** `rig.animState`, no `remoteAnimator.play(...)`, and no
vehicle `wheelSpinPhase` getter.

```ts
// You: after your controller's update(), on the fixed tick (~15Hz).
const p = character.currPos;   // THREE.Vector3   (Vehicle/Drone: same getters)
const q = character.currQuat;  // THREE.Quaternion
room.me.set({
  x: r2(p.x), y: r2(p.y), z: r2(p.z),
  q: [r2(q.x), r2(q.y), r2(q.z), r2(q.w)],   // quaternion array — never a scalar yaw
  // character animation = 6 booleans (the CharacterController exposes each as a getter):
  g: character.isOnGround, f: character.isFalling, m: character.isMoving,
  r: character.runActive,  j: character.jumpActive, c: character.crouchActive,
});

// Remote players: a VISUAL-ONLY body — NO Rapier body, NO controller instance for remotes.
// Build each remote with loadRemotePlayerCharacter({ avatarUrl: pl.avatarUrl }) — in a game
// with its own generated character everyone wears it, and pl.avatarUrl (the verified
// per-player pick the relay replicates; '' = unknown → fall back) is used only when this
// game has no generated character. It clones a shared parsed base, so remotes share GPU
// geometry/textures instead of re-parsing per player, and retargets clips once on that
// base; drive each clone's own AnimationMixer and call remote.dispose() on 'leave'.
// Never reuse your own body OBJECT for a remote (clones, not references).
// Phone tiers animate only the nearest tier.remoteAvatarCap remotes (adaptive-quality skill). Position/rotation from smoothed state; animation from the
// synced flags via the avatar's own update(flags, dt). The character-controller skill's
// animations reference owns the flag set.
const pl = room.players.get(id)!;
remoteAvatar.group.position.set(pl.state.x, pl.state.y, pl.state.z);
remoteAvatar.group.quaternion.fromArray(pl.state.q);
const raw = pl.stateRaw; // discrete flags: read RAW, never smoothed
remoteAvatar.update(
  { isOnGround: !!raw.g, isFalling: !!raw.f, isMoving: !!raw.m, runActive: !!raw.r, jumpActive: !!raw.j, crouchActive: !!raw.c },
  dt,
);
```

What to publish per controller:

- **character**: `currPos` → `x/y/z`, `currQuat` → `q`, and the six booleans above
  (`isOnGround`/`isFalling`/`isMoving`/`runActive`/`jumpActive`/`crouchActive` — the last is
  additive; a peer syncing only five still animates, minus crouch). Remotes rebuild the animation
  with `avatar.update(flags, dt)` — see the `genex-threejs-character-controller` animations
  reference for the flag set (single source of truth; don't invent a `play(anim)` call).
- **vehicle**: body `currPos` → `x/y/z` + `currQuat` → `q`. For visible steering, publish the
  front wheel's `car.wheels.get(frontWheelId)?.steerAngle`; spin the wheels on remotes
  procedurally from the body's speed (position delta) — there is no spin-phase getter, and you
  never sync per-wheel transforms.
- **drone**: `currPos` → `x/y/z`, `currQuat` → `q`, and `drone.hoverThrottle` if the rotor visual
  needs it. Remote rotor spin is procedural, like vehicle wheels.

> Remote **visuals** for vehicle wheels / drone rotors are author-built (a spinning mesh you drive
> from synced speed/throttle) — the controllers build those internally from a live Rapier body,
> which remotes don't have. Only the body pose + the flags/params above come over the wire.

Player-vs-player physical contact (bumping cars) stays approximate at this tier — each
client is authoritative over itself, so contacts are cosmetic. If a game's core loop IS
contested vehicle contact, that's Tier 2 above, with the vehicles as host-simulated objects and
player inputs over `inputs.send`.
