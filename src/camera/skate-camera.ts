// The camera, as one module.
//
// It was spread across main.ts (the `alignHeading` swing, the height and
// distance constants, the pause handover) and the vendored `FollowCamera`. That
// is two authors for one feel, so it lives here now and main.ts only builds it,
// tells it where the skater is, and updates it.
//
// WHAT THE PLAYER ASKED FOR — verbatim: *"Let's set up the camera: make the
// default camera CLOSER and slightly LOWER, not from above like it is now. Have
// it follow the character more smoothly with a slight delay. And for looking
// around, DON'T use right mouse button — just let the camera rotate when I move
// the mouse."*
//
// AND THIS ROUND, verbatim: *"please adjust the controls. Our camera rotates
// with the mouse; can we make it rotate when holding the right mouse button as
// well? That would be useful for touchpads. And in general, slightly move the
// default camera closer."*
//
// AND STRAIGHT AFTER IT, verbatim: *"maybe we should also work on making the
// camera move smoothly with a slight delay—so when I turn, it follows the
// character with a small lag. Let's also add a slight FOV effect—you know, that
// thing you get when we're moving."*
//
// Two things, and the first one is NOT the position follow he already has: he
// says *when I turn*, so it is the YAW that has to arrive late. See THE TRAIL,
// under THE CARVE, for which constant actually governed it and why the last
// round's slacker rate did not deliver it. The lens is THE LENS, at the bottom.
//
// Read next to the line above it that is an ADD, not a reversal, and the word
// that carries it is *as well*. The button is not coming back as the GATE the
// last round deleted — plain mouse movement still turns the view, with nothing
// held, exactly as it does today. Holding the right button is a SECOND way in,
// for a trackpad where you cannot fling a pointer and where lifting a finger to
// re-stroke used to cost you the shot. See (e). And the boom takes one more
// modest step in, 4.5 → 4.0 — see (d).
//
// The line above replaced the previous round's ticket item 13 — *"Free mode on RIGHT
// MOUSE BUTTON — and if I move the camera myself, it stays where I put it …
// consider sitting it a bit further behind the player"* — which is where the
// button, the 7.0 m boom and the right-click hand-back came from. The two
// rounds agree on exactly one line, and it is the one that never moves:
// FOLLOWS BY DEFAULT. How each ask is answered:
//
// (a) FOLLOWS BY DEFAULT. The rig tracks the skater's position always — while
//     the player is looking around too, because a camera that stops following
//     at 30 km/h loses him in a second and there is no way back — and eases its
//     angle round behind the direction of travel. Not just after the turn,
//     either: see THE CARVE below, which is what "follows" means at speed.
//
// (b) THE MOUSE *IS* THE VIEW. No button REQUIRED, no mode, no free-camera
//     state to be in or out of — (e)'s right button is a second way to do the
//     same thing, never a gate in front of this one: while the game is running
//     the pointer is LOCKED and every
//     movement of it turns the view, which is the third-person-action bucket of
//     the camera skill's pointer-lock rules and what the player asked for in so
//     many words. The lock is not new and is not hand-rolled — the vendored rig
//     has owned it since this module was written (`pointerLockAim`), so this
//     round is a DELETION: the guard listener that used to sit in front of the
//     rig and eat every mouse movement made without button 2 down is gone, and
//     with it the tap-to-give-back click, its 6 px slop and the held-button
//     flag. What is left is the rig's own aim math with its verified signs —
//     mouse-right looks right, mouse-up looks UP, both pinned by its tests.
//     Lock is taken on the DROP IN click and given back by Escape, because
//     main.ts routes both through `setPaused` and `setPaused` is the rig's lock
//     switch: pausing exits the lock and hands the cursor to the pause card,
//     resuming re-locks from inside the keypress that asked for it.
//
// (c) …AND SOMETHING HAS TO HAND THE SHOT BACK. The old right-click did that,
//     and it is gone with the button. It cannot simply become the swing either:
//     a swing that runs while the player is mid-look is a rig fighting a hand
//     on the mouse. So the hand-back is IDLE-DRIVEN — the swing is suspended
//     while the mouse is moving and for LOOK_IDLE after it stops, and then the
//     shot eases back behind him, pitch included. It is deliberately not a key:
//     a key needs a line on the HUD's control strip to be findable, that strip
//     is not this module's to write, and a camera you have to know a keypress
//     to recover is the same defect as one that never comes back. Riding is the
//     gate (see RECENTRE_RATE) — parked, you may look at whatever you like for
//     as long as you like, which is as much of the old "it stays where you put
//     it" as an always-on mouse can honestly keep.
//
//     AND A HELD RIGHT BUTTON IS NOT IDLE. The clock counts stillness, and a
//     hand that is holding the button down is not a hand that has finished — it
//     is most often a hand halfway through re-stroking a trackpad. So the clock
//     is PINNED at zero for as long as the button is down and only starts at the
//     release, with the full LOOK_IDLE still to run. That is the whole of what
//     the button changes for a player whose pointer is locked, and it is the
//     part of (e) he will actually feel.
//
// (d) CLOSER AND LOWER — and read (f) after it, which takes the boom in again
//     and re-frames the shot around a lower AIM point. Every distance in this
//     item is the 4.0 m round's; (f) carries the live ones.
//     7.0 m → 4.5 m of boom two rounds ago and 4.5 → 4.0 in the next,
//     and the rig's pitch 14° → 7.5° over the pivot. The pivot is his
//     shoulder at 1.45 m, so the lens drops
//     from 3.11 m over the deck to 2.03 m — a hand over his head rather than a
//     storey above it, which is the "not from above" half of the ask, and at
//     the game's 62° lens the frame is 5.4 m tall at the skater instead of
//     8.4 m, so he goes from about a fifth of frame height to about a third.
//     Still inside the rig's 2.4–9 m zoom range, so the wheel can taste either
//     side of it.
//
//     …AND ONE STEP MORE, WHICH IS ALL *"SLIGHTLY"* BUYS. 4.5 → 4.0 is 11%,
//     against the 36% the round before it took: the frame at the skater comes
//     from 5.41 m tall to 4.81 m, so a 1.75 m rider goes from 32% of frame
//     height to 36%, and the 265 px he measured standing in that round's 1280 ×
//     800 capture becomes about 298 by the same arithmetic (4.5 ÷ 4.0 — that is
//     a ratio off an existing capture, not a fresh measurement). The pitch is
//     UNCHANGED at 7.5°, and that is a decision rather than an omission: pitch
//     is an angle, so holding it while the boom comes in lowers the lens on its
//     own, 2.03 m over the deck to 1.97 m, which is the direction he asked the
//     shot in last round. Raising the pitch to hold 2.03 would have undone it.
//
//     WHY 4.0 AND NOT 3.5. Two floors decide it and neither is the near plane.
//     The first is what the shot IS: at 3.5 m the standing frame is 4.2 m tall
//     and the rider fills 42% of it, which has stopped being a chase shot and
//     become an over-the-shoulder one, and the deck — the thing he is reading in
//     a manual and a grind — is being pushed toward the bottom edge with it. The
//     second is the run-up, already booked below as the honest cost of 4.5: what
//     is in frame ahead of him is what he has to steer at, and every metre off
//     the boom takes some. He asked for *slightly*; 0.5 m is slightly.
//
//     WHAT MOVED WITH IT: nothing, and that is checkable rather than lucky.
//     · The near plane (0.1 m, main.ts) is not close to binding at either end of
//       the boom. The nearest thing to the lens is the deck's tail in a manual
//       raked 29°, about 3.4 m out at the default, and even jammed into a corner
//       at MIN_BOOM the tail is 1.6 m away — sixteen near planes. A near plane
//       matters to a camera that can end up INSIDE the subject, and MIN_BOOM is
//       what stops that, not the projection.
//     · The lead is an ANGLE (SWING_LEAD, LEAD_MAX, and the rate they are
//       derived against). There is no metre in any of them, so a shorter boom
//       asks for exactly the same lead through exactly the same carve.
//     · LIFT_RATE is an angle too — see its own note. The verdict on every
//       obstacle in the level is unchanged; what changes is the climb a verdict
//       buys, 0.55 × 4.5 = 2.5 m of headroom becoming 0.55 × 4.0 = 2.2 m, which
//       is correct because the lens is nearer the ground it has to clear.
//     · MIN_BOOM (1.2 m) and LENS_SKIN (1.0 m) are absolute clearances measured
//       against the player and the facade trim, not fractions of the boom.
//     · The rig's 2.4–9 m zoom range still brackets it: 1.6 m of wheel in and
//       5 m out.
//     What the shorter boom does move, and it is the same trade as last round:
//     the trailing pivot spends 2.0 m at 10 m/s and 3.0 m flat out, so the shot
//     is 4.0 m off his back parked and about 7.0 m at 60 km/h, against 4.5 and
//     7.5. The closer camera is the one he is looking at when he is looking at
//     the skater; at speed the delay hands most of it back, deliberately.
//
//     4.5 AND NOT 5.5 BECAUSE THE DELAY SPENDS SOME OF IT. The pivot now trails
//     him (below), and a trailing pivot is a lens further from the skater by
//     however far he has run ahead of it: 2.0 m at 10 m/s, 3.0 m at the ride's
//     top speed. So the shot is 4.5 m off his back at a standstill and about
//     7.5 m at 60 km/h, against 7.0 and 9.1 before. Shot side by side at 1280 ×
//     800 on the same spot and the same light, the skater measures 150 px tall
//     standing and 130 px at 59 km/h under the old numbers, against 265 px and
//     156 px under these — 36% closer where the player is looking at him, 17%
//     where he is flat out, and the rest of the standing gain is the pitch, the
//     shot no longer looking DOWN the length of him. Asking for both a closer
//     camera and a laggier one, that split is the honest answer; a 5.5 m boom
//     would have handed the whole ask back to the lag at speed.
//
//     AND WHAT IT COST, measured rather than guessed — two things pulling
//     opposite ways. The boom REACHES LESS: it samples the world 4.5 m behind
//     him instead of 7, and since what a lift may buy is priced per metre of
//     boom (`room` in clearBoom is `probe.y + LIFT_RATE·t`, with no `desired`
//     in it), the verdict on any given obstacle is unchanged and there are
//     simply two and a half fewer metres of them to hit. But the boom also
//     rides LOWER — at the lens the chord is 0.58 m over the pivot where it
//     used to be 1.66 m — so the things it does meet, a bank or a ledge 1–2 m
//     tall, block a chord that used to pass over them, and the answer to that
//     is the LIFT, which pushes the lens back up exactly where the player asked
//     it down. The trade is paid in the currency it was asked in, and it is
//     bounded by LIFT_RATE: on open ground the shot is the low one, and in the
//     tight stuff it climbs toward the old one rather than clipping a bank.
//
//     And the other half of what the old 7.0 m bought: distance was there to
//     see the run-up to what he is about to hit. At 4.5 m there is less of it
//     in frame, and the lower angle takes a little more — a ledge at 15 m sits
//     nearer the horizon now than it did from 3.1 m up. The player asked for
//     the closer shot knowing what a chase camera is; this is the honest cost,
//     and the compensations are the lag above (which gives distance back at
//     exactly the speed the run-up matters) and the lead below (which puts the
//     turn in frame before he is round it).
//
// (e) THE RIGHT BUTTON, AS A SECOND WAY IN — *"can we make it rotate when
//     holding the right mouse button as well? That would be useful for
//     touchpads."* Two look paths, and the reason they never fight is that
//     which one is live is decided by the POINTER LOCK, not by the button:
//
//     · LOCKED — every frame of ordinary play. The vendored rig's aim path
//       already turns the view on raw pointer movement and it does not read
//       `buttons` at all, so holding the right button and dragging ALREADY
//       rotates, at the same sensitivity, through the same math, with the same
//       verified signs. There is nothing to add here and adding it would be the
//       bug: two authors rotating on one event is a doubled turn. So this
//       module's drag path stands down whenever the pointer is locked. That is
//       one `isLocked()` test and not a race — and underneath it there is a
//       second, structural guarantee, which is that `clientX/clientY` are
//       FROZEN by the pointer-lock spec, so the deltas the drag path would
//       compute under a lock are zero even if the test were removed.
//
//     · UNLOCKED — the lock refused (a page embedding the game without
//       `allow="pointer-lock"`), which is the rig's documented drag-orbit
//       fallback. This is where the right button is genuinely dead today: the
//       rig's own pointerdown returns on `e.button !== 0` before it captures
//       anything, so a right-drag there moves nothing at all. That is the case
//       this module's drag path answers, and it answers it in the rig's own
//       terms — the same full-turn-per-element-height gain (DRAG_TURN) and the
//       same signs the rig's left-drag uses.
//
//     ONE CONVENTION, BOTH PATHS, copied rather than reasoned. The rig's aim
//     path is `rotate(−movementX·s, −movementY·s)` and its drag-orbit is
//     `rotate(−2π·dx/h, −2π·dy/h)`: the same sentence twice — the azimuth takes
//     the NEGATIVE horizontal delta and the pitch the negative vertical. On this
//     basis (azimuth 0 at +Z, increasing azimuth right-handed about +Y, the lens
//     placed along it and looking back at the pivot) a decreasing azimuth swings
//     the view toward screen-right, so mouse-right turns right and mouse-up
//     looks up, on both paths, pinned by the rig's own signed-projection test.
//     The drag path takes that pair — sign AND basis together — and derives
//     nothing of its own, which is the camera skill's rule for exactly this.
//
//     THE RELEASE MOVES NO ANGLE. Letting go writes nothing to the rig: it ends
//     the drag and starts the idle clock at zero, and the ordinary swing is
//     still LOOK_IDLE away. There is no latch to unwind and no target to unwind
//     to, so there is nothing that can snap.
//
//     THE CONTEXT MENU is suppressed on the canvas, so a held right button is a
//     camera control and not a browser menu over the top of the game. The
//     vendored rig also preventDefaults it, and this module does not lean on
//     that: the gesture is this module's, so the guarantee lives beside it
//     rather than in a file that is regenerated by a CLI.
//
//     WHAT THE DRAG IS DAMPED BY, stated because it is not what you would pick.
//     The rig damps a player-driven axis on `draggingSmoothTime` (0.09 s) and
//     the automatic follow on `smoothTime` (0.20 s), and `rotate()` CLEARS the
//     drag flag on every call by design — it is how a vehicle heading correction
//     restores the base constant — so an outside caller cannot ask for the
//     quick one. The two honest options were the follow constant or none at all
//     (`transition: false`), and none snaps: it collapses whatever ease is in
//     flight, and a hand-back mid-glide banks as much as 40° of lead the rig has
//     not caught up to yet, which would arrive in a single event. So the drag
//     rides 0.20 s. Writing a smoother of this module's own to split the
//     difference is the one thing that is not on the table — three smoothing
//     passes have been rejected on this game — and the cost is bounded to the
//     fallback path, where the alternative today is a button that does nothing.
//
// (f) CLOSER AGAIN, AND POINTED AT HIM — *"for the initial camera, move it a
//     little closer and tilt it down so it looks at the character."*
//
//     THE BOOM, 4.0 → 3.2. Third time of asking (7.0 → 4.5 → 4.0 → 3.2), so
//     this step is 20% against the last one's 11%. The standing frame comes from
//     4.81 m tall to 3.85 m and a 1.75 m rider from 36.4% of frame height to
//     45.5%; the lens sits 3.20 m off his back parked, and 6.47 m at 61 km/h
//     once the trail is on it (it was 4.00 and 7.25).
//
//     WHY 3.5 WAS REFUSED LAST ROUND AND 3.2 IS NOT REFUSED NOW. That refusal
//     is written a few paragraphs up and it rested on two floors. The first —
//     *"the deck is being pushed toward the bottom edge"* — was never really a
//     fact about the boom; it was a fact about aiming the lens at his SHOULDER,
//     which is 1.45 m up a 1.75 m body, so the whole composition sat low with a
//     third of the frame empty over his head. Measured on the parked shot: the
//     deck was 229 px down a 400 px half-frame — 57% of the way to the bottom
//     edge — with his head only 50 px up. The aim drop below removes that floor
//     outright rather than arguing past it: at 3.2 m the deck is 170 px down and
//     his head is 166 px up, which is a rider CENTRED in frame at a boom 20%
//     shorter. The second floor, the run-up, stands and is paid the same way it
//     was last round — the trail hands the distance back at exactly the speeds
//     the run-up matters, and the lens widens on top of it.
//
//     THE TILT IS THE AIM POINT, NOT THE PITCH, AND NOT THE EYE HEIGHT. Three
//     levers could put the lens on him and only one of them does it without
//     undoing something he has already asked for:
//
//       · PITCH (CAM_PITCH / REST_POLAR) raises the lens as it tilts it — the
//         rig's polar angle places the lens and aims it in one move. Pushing it
//         from 7.5° to the ~16° this shot now has would have put the lens 0.9 m
//         higher over his head, which is the *"not from above"* he corrected two
//         rounds ago. UNCHANGED at 7.5°, deliberately.
//       · EYE HEIGHT (CAM_HEIGHT) moves the whole orbit up or down without
//         tilting anything at all — it would have framed his knees rather than
//         pointed the lens at him. UNCHANGED at 1.45 m.
//       · THE AIM POINT is the one that tilts without lifting. AIM_DROP puts the
//         look-at half a metre under the orbit centre, at his hips, and the
//         optical axis has to come down to meet it.
//
//     WHAT IT MEASURES, parked: the axis was 7.5° below horizontal and is now
//     16.1°, so the tilt is more than DOUBLE — while the lens rides 1.86 m over
//     the deck, which is 11 cm LOWER than the 1.97 m it sat at before, because
//     the boom came in and the pitch did not go up. Closer, lower, and twice as
//     tilted, all three at once, which is only possible because the tilt was
//     bought from the aim point rather than from the angle.
//
//     AND IT STAYS A CHASE SHOT AT SPEED. The trail lengthens the boom, so the
//     lens climbs the same 7.5° over a longer arm and the axis flattens as he
//     winds up: 16.1° parked, 13.3° at 29 km/h, 11.8° flat out. That is the
//     right way round — the tilt is at its strongest where he is looking at the
//     skater and eases off where he needs to see what he is about to hit.
//
// THE ORBIT — *"when I turn the camera left or right, it doesn't rotate around
// the character; instead, the character drifts forward a bit. So if I turn
// left, he ends up slightly to the left, as if he's a bit ahead. How can we fix
// this? Specifically, when I rotate the camera."*
//
// He is describing a real geometric fault and he named its cause in the last
// four words of it: HE IS A BIT AHEAD. Ahead of what, exactly — of the point
// the lens was aimed at.
//
// WHAT IT WAS. The rig follows a SMOOTHED point, not the skater. `moveTo` feeds
// it his shoulder every frame and `smoothTime` (0.20 s) damps it there, so
// against a skater running at a steady `v` the pivot settles exactly `0.20 · v`
// metres behind him along his course — 2.0 m at 10 m/s, 3.4 m flat out. That
// trail is the shot's whole "drifts back as he accelerates" feel and it is
// wanted. What was NOT wanted is that the same point was doing two other jobs
// it has no business doing: it was the point the boom ORBITED around, and it
// was the point the lens LOOKED AT.
//
// Both of those are invisible while the view is parked behind him, because the
// trail then lies exactly along the optical axis: he is further away, and dead
// centre. Rotate the look by θ and the trail stops being along the axis. Its
// component across the frame is `0.20 · v · sin θ`, and that is the metres he
// slides off centre — measured on the real module and the real rig, in pixels
// off centre of a 1280-wide frame, driving the look through the actual
// pointer-lock aim path:
//
//     m/s      look 20°   look 45°   look 90°
//       0          0          0          0
//       3        ±29        ±62        ±96
//       6        ±51       ±111       ±188
//      10        ±72       ±160       ±303
//      13        ±83       ±189       ±383
//      17        ±94       ±218       ±484      (half the frame is 640)
//
// Read the top row first, because it is the diagnosis: PARKED, A LOOK OF ANY
// SIZE HELD HIM AT DEAD CENTRE. Nothing on the yaw path was ever the fault —
// not SWING_LEAD, not the TRAIL_TIME lag added this same day, not the
// composition of the look into the course. All three are offsets on an absolute
// world angle and all three are suspended for the whole of a look anyway
// (`looking` gates the swing). The fault scales with SPEED and with nothing
// else, which is the signature of the pivot's lag and of no other term in this
// file. At 61 km/h a look over his shoulder put him 76% of the way to the frame
// edge.
//
// The second table is the other half of the same fault, and he would have felt
// it as the shot lunging: the lens orbited a point he was standing 3.4 m in
// front of, so the DISTANCE to him changed as the view came round — 7.25 m
// behind him at 17 m/s, 5.16 m at 90° across. He swelled by 40% through a look
// that should not have changed his size at all.
//
// WHAT IT IS NOW. The trail is kept and its two extra jobs are taken away:
//
//   · THE ORBIT CENTRE IS THE SKATER. `focus` is his own x/z, so the boom
//     sweeps a circle centred on him and a look rotation swings the world round
//     him rather than sweeping him across the frame.
//   · THE LENS LOOKS AT HIM. `camera.lookAt` is fed a point on his own vertical
//     axis, so it is fixed under a yaw rotation by construction.
//   · THE TRAIL BECOMES WHAT THE HEADER ALREADY SAID IT WAS — a DISTANCE. (d)
//     has described this feature as "a lens further from the skater by however
//     far he has run ahead of it" since the round that introduced it, and that
//     is now literally the arithmetic: `lag` is measured off the rig's own
//     damped pivot every frame and ADDED to the boom. Same metres, same spring,
//     same 0.20 s — the shot still drops back at exactly the rate it did, and
//     the number is still the rig's rather than a second copy of it kept here.
//
// AND NO SMOOTHER WAS ADDED, which matters on this game. `smoothTime` is
// untouched at 0.20 and is still the only filter on the follow; TRAIL_TIME is
// untouched at 0.09 and is still the only lag on the aim. What changed is the
// FRAME the pivot's lag is spent in, not how fast it arrives.
//
//     THE ONE PLACE THAT NEEDED CARE, because it would have been a second
//     filter by accident. `boom` used to ease toward what the world allowed,
//     instantly inward and at BOOM_RETURN_RATE outward — right for a wall,
//     wrong for a lag that is now part of the length it is easing toward, since
//     accelerating would then have paid the spring's 0.20 s AND the boom's
//     0.29 s one after the other. So the eased quantity is now the DEFICIT: how
//     many metres the world is taking off the shot, which is zero on open
//     ground and does not know how fast he is going. The wall behaviour is
//     bit-for-bit what it was; the speed term passes through unfiltered.
//
// WHAT THE VERTICAL DOES, and why it is deliberately NOT the same answer. Only
// the HORIZONTAL offset is taken off the pivot. A look rotation is a rotation
// about +Y, so a vertical lag can never produce a yaw-dependent slide — it is
// not part of this fault. And it is load-bearing where it is: the pivot's
// damped height is what stops an ollie's 0.6 m of rise arriving in the lens as
// a hitch. So `focus.y` stays the rig's damped height and he goes on bobbing
// against the frame through a pop exactly as he did before this round.
//
// THE CARVE — what a follow camera owes a turn, and what the first two rounds
// of this module did not pay. `alignHeading` is a proportional loop: it reads
// the error at the rendered camera and adds a fraction of it to the rig's
// target angle, so against a course that is ROTATING the whole time it settles
// at a standing error of exactly ride-yaw ÷ swing-rate. Measured on the real
// modules that is 43° at 13 m/s and 82° at 2.8 m/s — the player rides sideways
// across his own frame for the entire turn, with the thing he is about to hit
// outside the lens, and the shot only comes good once he stops carving. It is a
// tracking deficit, not an overshoot, so no amount of rate fixes it without
// turning the rig into a turret.
//
// So the swing aims where the course WILL be rather than where it is: the rate
// the course is turning at, low-passed, times the loop's own time constant. The
// standing error cancels; what is left is the transient at the entry and exit of
// a turn, which is the lag that reads as speed. It is deliberately aimed 3/4 of
// the way (`SWING_LEAD`), leaving a bounded trail behind a hard carve rather
// than a camera welded to his back.
//
// THE TRAIL — *"when I turn, it follows the character with a small lag"*, and
// first: WHICH NUMBER WAS EVER GOING TO DO THAT. Three were candidates and two
// of them are not it.
//
//   · `RECENTRE_RATE` governs the hand-back glide after a MOUSE look and
//     nothing else. It never runs during an ordinary carve. Not it.
//   · `SWING_RATE` sets the transient — the loop's time constant is 1/rate, so
//     entering and leaving a turn already takes 0.71 s. Last round slackened it
//     2.2 → 1.4 for exactly this ask and the player has come back asking again,
//     which is the evidence that the transient was not what was missing.
//   · `SWING_LEAD` is why. The standing error of the loop against a turning
//     course is `courseRate ÷ rate`, and the lead exists to CANCEL three
//     quarters of it. Slackening the rate scales both terms at once, so the net
//     trail barely moved: 10° to 16°, while the time constant went up by half.
//     The lead is the anti-lag term, and it was doing its job.
//
// So the lever is the lead — but NOT by turning `SWING_LEAD` down, and this is
// the part worth writing down. The surviving trail would then be
// `(1 − share) · courseRate ÷ rate`, which carries the ramped `rate` in its
// denominator: just above SWING_MIN_SPEED that rate is near zero and the term
// runs away. Modelled against the real `turnFactor`, dropping the share to 0.5
// adds 5° of trail at 13 m/s and 76° at 1.5 m/s. A camera whose lag depends on
// how close you are to walking pace is not a lag, it is a bug with a dial.
//
// TRAIL_TIME instead: the swing aims where the course WAS, a fixed number of
// SECONDS ago. It is the player's own sentence written as arithmetic —
// `courseRate · TRAIL_TIME` is the first-order form of a pure delay — and it
// has the two properties the share does not. It is bounded by construction (the
// ride's yaw tops out at 2.2 rad/s, so the term tops out at 2.2 · TRAIL_TIME
// whatever the speed, and TRAIL_MAX pins even that), and it SELF-LIMITS WHERE
// IT MATTERS: `turnFactor` washes out above 7 m/s, so the trail is biggest at
// 5–8 m/s where he is carving a 2.5 m circle with nothing to run into, and
// smallest at 13–17 where he is covering ground and needs to see what he is
// about to hit.
//
// Modelled on the real loop — the same proportional step measured at the
// rendered camera, over the rig's own smoothDamp, at 60 fps — with the trail at
// 0.09 s, through a full-lock carve held and then released:
//
//     m/s   ride yaw   trail BEFORE   AFTER   entry peak   exit overshoot
//       3     1.52       16.5°        24.4°      27.6°     −7.9° → −3.2°
//     5.5     2.20       26.0°        30.6°      38.4°    −10.7° → −7.0°
//       8     2.11       22.2°        29.7°      36.9°    −11.6° → −6.6°
//      11     1.83       17.8°        27.0°      32.3°    −10.9° → −5.2°
//      13     1.64       16.0°        24.5°      29.0°     −9.8° → −4.6°
//      17     1.36       13.3°        20.3°      24.1°     −8.1° → −3.8°
//
// Half the frame is 43.9° wide at 62° and 16:10, so the worst steady trail sits
// at 70% of the way to the edge and the worst entry peak at 87% — the direction
// of travel never leaves the lens, which is the line THE CARVE was opened over.
// And the EXIT got better rather than worse: the trail eats part of the lead
// that used to swing the shot past his back when a carve ended, halving the
// overshoot, and it is inside 2° within 0.28–0.33 s of the stick centring.
//
// LEAD_MAX 1.1 → 1.25 rides along, and it is bookkeeping of exactly the kind
// that constant's own note already describes. At 1.1 the cap was biting inside
// the ride's OWN range — the hardest carve asks for 1.179 rad of lead — so the
// tightest turn was being handed extra trail by a clamp rather than by a
// decision, 26.0° where the uncapped loop wanted 22.5°. Now the ride's whole
// range is uncapped and the clamp bounds only genuine spikes (COURSE_JUMP still
// lets the estimate reach 4 rad/s, which asks 2.14 rad and gets 1.25). The
// trail is the only thing setting the trail.
//
// AND WHAT THIS IS NOT: no filter was added to the yaw. The trail is an offset
// on the AIM, computed from the course-rate estimate the lead already runs on
// (`LEAD_RATE`, untouched), and there is exactly one smoother on this axis —
// the rig's, at `smoothTime` — before and after. Slowing LEAD_RATE was the
// other way to buy an entry lag and it was modelled and rejected: it leaves the
// steady state untouched but makes the lead outlive the carve, and at a τ
// comparable to the loop's own 0.71 s the shot swings well past his back on the
// exit. This is a lag the player asked for, once, in the place he asked for it.
//
// THE DELAY — *"follow the character more smoothly with a slight delay"*, and
// the whole of it is in this loop, deliberately. Two numbers moved and they lag
// different things:
//
//   · SWING_RATE 2.2 → 1.4 is the ANGLE arriving late. The loop's error at the
//     rendered camera is exactly `courseRate ÷ rate` no matter what damping sits
//     under it (`alignHeading` measures the camera, not the target, so the
//     smoother below cancels out of the steady state), and the lead cancels 3/4
//     of it — so the trail behind a 1.5 rad/s carve goes from 10° to 16°, and
//     the time constant of entering and leaving a turn from 0.45 s to 0.71 s.
//     That second number is the one you feel: it is the camera taking most of a
//     second to come round after him rather than a third of one.
//   · smoothTime 0.14 → 0.20 is the PIVOT arriving late. It is a critically
//     damped spring, so against a skater running at 10 m/s it settles about
//     2.0 m behind him instead of 1.4 — he rides ahead of the point the lens is
//     aimed at, which pushes him off-centre into the direction of travel and
//     spends 0.6 m of the boom this round just took in. Priced into (d): the
//     shot at speed is what the player is looking at, not the one at rest.
//
// The rig damps the mouse on a SEPARATE constant (`draggingSmoothTime`), which
// is why a slacker follow does not make looking around feel like syrup — the
// hand keeps its own crisp response while the automatic swing crawls.
//
// AND WHAT THIS IS NOT: it is lag on the CAMERA. Nothing here reads a bone,
// touches a clip, or smooths the body — three rounds of animation damping have
// been rejected on this game and every one of them was a fix applied to the
// wrong module. The skater is as sharp as he ever was; the lens is what trails.
//
// THE BOOM AGAINST THE WORLD, which the round before last paid for and this one
// leans on harder. A boom reaches into whatever is standing behind him: rolling
// back switch off the north brick swung the camera round to the travel side and
// straight through the wall — three frames of a player doing 14–16 km/h with his
// own game off screen. Coming in to 4.5 m takes two and a half metres of that
// reach away and the lower chord in (d) gives it straight back as ground, so the
// constraint is doing the same job for a new reason. HOW it is constrained:
//
//   · A boom that only ever SHORTENS is unusable on a real spot. Everything the
//     level is built out of — a wedge bank, a ledge, the quarter-pipe transition
//     — stands taller than a lens riding a metre over the deck, so ordinary
//     riding collapsed the shot from 8.3 m to 0.3–1.4 m and parked it inside the
//     character for a second and a half at a time. Measured over the whole of
//     map 1: 3% of standable ground with the camera inside the shot, and 23% of
//     map 2, whose banked channel walls are the level.
//   · What a camera operator does there is stand ON the bank, not behind it. So
//     the boom LIFTS: the lens climbs until its line to the skater clears the
//     ground, which is the one correction that keeps the shot's distance AND its
//     angle round the player — the two things (c) and (d) are actually about.
//     The seeing-over-a-wall geometry sets the price: clearing `h` at `t` metres
//     out costs `h · D / t` at the lens, so a low thing far behind is free and a
//     tall thing right behind is not affordable at all.
//   · Shortening is what is left for the things a lift cannot clear — the
//     buildings that bound this spot, map 2's fence. `blocked` says a wall is
//     there; `height` says how tall the GROUND is; a lift that the world's own
//     height query cannot buy out is a wall, and a wall is the one thing the
//     lens has to come in for.
//   · …and when it does come in it stops OUTSIDE the player (`MIN_BOOM`). A
//     tight shot of his back is a shot. The inside of his ribcage is not, and
//     0.15 m against a 0.1 m near plane is the inside of his ribcage.
//
// The rig has collision machinery of its own (`colliderMeshes` → a four-corner
// ray pullback) and it is fed by nothing here, deliberately: it wants a flat
// list of static leaf meshes, and this world's geometry is one merged spot mesh
// plus streamed dressing that arrives after boot and changes when the map does —
// a list that would be wrong every time a lane touched the level. The world
// already answers the exact questions a boom needs, analytically, through the
// contract the wheels use: `surface.blocked(x, z, y)` is "is anything here
// standing taller than this probe" and `surface.height(x, z)` is "how high is
// the top here", and both maps implement both (map 1 over its solids, map 2 over
// its channel and bound). The camera asks the ride's own world instead of
// keeping a second copy of the level in mesh form.
//
// AND ONE BUG THIS REPLACES: the old rig passed `headingAlignGain: 0` and then
// called `alignHeading`, which multiplies by exactly that gain — so the swing
// was dead code and the camera NEVER turned to face the direction of travel. It
// held whatever angle it was born with until a mouse moved it. Ask (a) had
// never actually shipped.
//
// THE LENS — *"a slight FOV effect—you know, that thing you get when we're
// moving."* The racing-game speed rush: the lens widens as he winds up and
// eases back as he slows, so the block seems to open out around him.
//
// It is the FIRST thing in this module to touch the projection, so: main.ts
// still owns the base lens. `baseFov` is read off the camera at construction
// rather than typed here, this module only ever ADDS to it, and nothing else in
// the game writes `camera.fov` (the menu stage has a camera of its own). The
// resize handler in main.ts sets `aspect` and calls `updateProjectionMatrix`,
// which composes with this rather than fighting it.
//
// THE BAND, and why these numbers. 62° at rest, 68° flat out — 6°, which is 12%
// more frame height and 6.6° more horizontal field. *Slight* is the whole
// brief: past about 10° the near corners start to bow and a skate block reads
// rubbery, which is a fisheye, not speed. It starts at FOV_MIN_SPEED = 4 m/s so
// that pushing around the plaza does not make the lens breathe, and reaches
// full at 17, which is `MAX_SPEED` in the ride — the fastest he can push
// himself. Gravity can beat that down a bank; the ramp clamps, so a tow-in off
// the quarter pipe does not keep widening.
//
// IT DOES NOT DOUBLE-COUNT WITH THE BOOM, and that is a structural statement
// rather than a tuning one. It used to be written as *"the boom is a fixed 4.0 m
// and nothing speed-driven touches it"*, and THE ORBIT has since made that
// sentence literally false — the boom is now `distance + lag` and the lag is
// speed-driven. The statement it was standing for is unharmed, because the lag
// is the SAME metres the pivot's 0.20 s spring was already spending; all that
// changed is that they are counted along the boom instead of behind it. There
// is still exactly ONE spring feeding the framing and one lens on top of it,
// and the spring is still the larger of the two, which is worth pricing:
//
//     m/s   km/h    FOV     h-FOV   dist   frame height   rider % of height
//       0      0   62.00°   87.74°   3.20      3.85 m          45.5%
//       4     14   62.00°   87.74°   3.97      4.77 m          36.7%
//       8     29   63.85°   89.82°   4.74      5.90 m          29.7%
//      13     47   66.15°   92.36°   5.70      7.42 m          23.6%
//      17     61   68.00°   94.36°   6.47      8.72 m          20.1%
//
// At 17 m/s the lens is responsible for 2.4 of those 25 points and the boom's
// own growth for the other 23. The rider goes from filling most of the standing
// frame to a fifth of it flat out, which is what a chase camera at speed looks
// like.
//
// EASED, NOT STEPPED, and home cleanly. `FOV_RATE` is the module's own
// `approach()` — the same frame-rate-independent curve every other correction
// here uses, and the first and only filter on a brand-new quantity, not a
// second one stacked over something. 95% of the widening arrives in 1.5 s and
// the worst per-frame step is 0.20° at 60 fps. Rest is the target whenever the
// game is not under the player — paused, at the title, ragdolled with the speed
// gone — and a CUT snaps it home outright, which is the same word the boom and
// the lift already use for a respawn. There is no path that leaves the lens
// wide after a bail.
//
// AND IT DOES NOT BREAK THE POST CHAIN, checked in both passes that read the
// camera rather than assumed. `motion-blur.ts` rebuilds `viewProj` from
// `camera.projectionMatrix` every frame and says so in its own header — *"with
// no error at all — including the roll and the fov, because it comes out of the
// real projection matrix"* — so a widening lens is reconstructed exactly, and
// 0.20° of step per frame is far under anything that could smear. `distance-
// blur.ts` reads `camera.near`/`camera.far` and the fog curve and never the
// lens at all. Neither caches a projection at construction.
//
// `course`, not `heading`: roll back down a transition you could not clear and
// the deck still points up it while you go down. The ride turns the RIDER round
// to face where he is going, and a camera fed the deck's facing would swing
// round in front of him and film the player's own chest. The two agree in every
// other state.

import * as THREE from "three";
import { FollowCamera } from "../controllers/character/follow-camera";

/** Above the deck, and behind it — see (d) in the header for all three. */
const CAM_HEIGHT = 1.45;
const CAM_DISTANCE = 3.2;

/**
 * How far BELOW the orbit centre the lens actually points, metres — the whole
 * of *"tilt it down so it looks at the character"*. See (f).
 *
 * The orbit centre is his shoulder (CAM_HEIGHT) because that is the height the
 * shot should swing around; the lens is aimed half a metre under it, at his
 * hips, because that is where the middle of a skater IS once you count the
 * board. Aiming at the shoulder put his deck 57% of the way to the bottom edge
 * with a third of the frame empty over his head — a lens pointed past him
 * rather than at him, which is what he was looking at when he asked.
 *
 * It is a DROP and not more pitch on purpose. Pitch raises the lens as it tilts
 * it, and he has already ruled that out in his own words (*"not from above"*);
 * dropping the aim point tilts the lens without lifting it a millimetre. And it
 * is safe under a look by construction: the point sits on his own vertical
 * axis, and a yaw rotation about that axis cannot move a point on it.
 */
const AIM_DROP = 0.5;

/**
 * How far the rig sits above the pivot, radians of pitch — 7.5°, down from the
 * 14° the "further back" round pushed it to.
 *
 * It is a named constant and not just an option on the rig because the hand-back
 * in (c) has to know where "the default shot" IS: the player can pitch the view
 * anywhere between the rig's polar clamps with the mouse, and something has to
 * put it back. `REST_POLAR` is that number in the rig's own convention (polar is
 * measured from +Y, so a pitch ABOVE the pivot is π/2 minus it).
 */
const CAM_PITCH = 0.13;
const REST_POLAR = Math.PI / 2 - CAM_PITCH;

/**
 * The gate below which the view holds where it is — the same 1.2 m/s the stance
 * itself uses, and not by accident: below it the body holds the way it was
 * standing too, so the two commit together instead of one leading the other.
 */
const SWING_MIN_SPEED = 1.2;

/**
 * How hard the rig wants to sit behind the ride, as a response rate (1/s), and
 * the speed the rate reaches full strength at.
 *
 * The rate is deliberately slack — a skate camera that snaps to every carve
 * reads as a turret — and the ramp above the gate is only there so the swing
 * arrives instead of switching on. It used to reach full strength at 6 m/s, and
 * that was backwards: the ride's own yaw rate PEAKS around 5.5–7 m/s
 * (`turnFactor`) and stays high as a carve bleeds speed, so scaling the camera's
 * closing rate down with speed made the shot worst exactly where the turn is
 * tightest. Full strength by 3.2 m/s, and the standing error is the lead's job
 * rather than the rate's.
 *
 * 1.4, down from 2.2, is *"a slight delay"* — see THE DELAY in the header for
 * what each of the two lagged numbers actually lags. A rate is the right lever
 * for it and a smoothing pass over the SKATER would not be: this is the lens
 * arriving late at an angle the ride already turned to, which is the shot a
 * chase camera is supposed to give, not motion taken off the character.
 */
const SWING_RATE = 1.4;
const SWING_FULL_SPEED = 3.2;

/**
 * How much of the standing carve error the lead cancels. 1 would put the camera
 * exactly behind the course all the way through a turn, which is a turret; 0.75
 * leaves a quarter of it as trail — 16° through an ordinary 1.5 rad/s carve at
 * the slacker rate above, and 27° at the ride's own 2.2 rad/s ceiling, where
 * LEAD_MAX has started to bite. Enough that the turn is legible, little enough
 * that the direction of travel never leaves the lens.
 */
const SWING_LEAD = 0.75;

/**
 * The most the lead may ever be worth, radians, and the response rate of the
 * filter behind it (1/s).
 *
 * The filter is what makes this safe to feed with a differentiated angle: a
 * per-frame difference is noise, and the cap is what a rig actually does with
 * it. The gap between the two is the transient the header calls the lag that
 * reads as speed.
 *
 * 0.7 → 1.1 is bookkeeping on the slacker SWING_RATE, not a second feel change.
 * The lead the loop needs is `courseRate · share ÷ rate`, so slackening the rate
 * by 1.57× makes the same carve ask for 1.57× more lead: at 0.7 the cap would
 * have started binding at 1.3 rad/s — an ordinary carve — and the trail behind
 * the ride's hardest turn would have been 50° rather than 27°, which is riding
 * sideways across your own frame, the exact defect THE CARVE was opened for.
 * 1.1 puts the cap back where it was in course-rate terms: it starts biting at
 * 2.05 rad/s, the same place 0.7 did at the old rate, which is inside the
 * ride's 2.2 ceiling only at the very hardest carve. The spike protection is
 * untouched — COURSE_JUMP lets the estimate reach 4 rad/s, which would ask for
 * 2.14 rad of lead and gets 1.25.
 *
 * …AND 1.1 → 1.25 WHEN THE TRAIL LANDED, for the reason the paragraph above
 * predicted: "inside the ride's 2.2 ceiling only at the very hardest carve" was
 * still a bite, and a clamp that bites during real riding is a second author of
 * the trail. The hardest carve the ride can turn (2.2 rad/s at 5.5 m/s) asks
 * for 1.179 rad, so 1.25 clears the ride's whole range and the cap goes back to
 * bounding only what COURSE_JUMP lets through. Measured on the loop: the
 * tightest carve trailed 26.0° where the uncapped loop wanted 22.5°, and the
 * difference was the clamp. See THE TRAIL.
 */
const LEAD_MAX = 1.25;
const LEAD_RATE = 8;

/**
 * The turn's own lag: the swing aims where the course was this many SECONDS
 * ago, and never more than this far behind (radians).
 *
 * See THE TRAIL for why the lag is expressed in seconds rather than as a
 * smaller `SWING_LEAD` — briefly, a share leaves the ramped `rate` in the
 * denominator and runs away at walking pace, and this does not.
 *
 * 0.09 s buys 20–31° of trail across the ride's whole speed range against
 * 13–26° before it, which is about half again, and it costs nothing at the exit
 * of a carve — it halves the overshoot the lead used to leave. TRAIL_MAX is the
 * hard stop, 9.2°, and it binds from about 1.8 rad/s upward: past that the
 * trail stops growing with the carve, so the ride's tightest turn and its
 * hardest spin-out cost the same and the direction of travel cannot be walked
 * out of the frame by a course rate this module did not predict.
 */
const TRAIL_TIME = 0.09;
const TRAIL_MAX = 0.16;

/**
 * The speed rush — degrees of extra field of view at full tilt, the band it is
 * earned over (m/s), and how fast the lens gets there (1/s). See THE LENS.
 *
 * 6° on top of the game's 62 is 12% more frame height; the dead zone under
 * 4 m/s keeps the lens still while he pushes around, and full effect lands at
 * `MAX_SPEED` (17), the fastest the ride can push itself. FOV_RATE 2 is 95% of
 * the change in 1.5 s — slow enough that a single push does not pump the lens,
 * quick enough to read as acceleration.
 */
const FOV_GAIN = 6;
const FOV_MIN_SPEED = 4;
const FOV_FULL_SPEED = 17;
const FOV_RATE = 2;

/**
 * Degrees of FOV change below which the projection is left alone. The ease is
 * asymptotic, so without this the matrix would be rebuilt every frame for ever
 * over a difference no pixel can show.
 */
const FOV_EPSILON = 0.001;

/**
 * A course that moved faster than this in one frame (rad/s) is not steering —
 * the ride's own yaw tops out at 2.2 (`TURN_RATE · turnFactor`), and what jumps
 * further is the course itself changing meaning: the wheels reverse and it flips
 * by π, a landing hands the deck's heading back. Feeding that to the lead would
 * throw the camera 40° sideways at exactly the moment the shot changes, so the
 * filter is fed a zero and lets the estimate decay instead.
 */
const COURSE_JUMP = 4;

/**
 * The hand-back — see (c). It is quicker than the drift, so a look-behind
 * actually resolves instead of dissolving into the 0.71 s swing, and it is
 * finished once both residuals (angle round him, and pitch) are inside
 * RECENTRE_DONE, at which point the ordinary swing has it. It leads the course
 * in full (share 1): a hand-back aims exactly BEHIND, so it converges mid-carve
 * instead of chasing a standing error it can never close.
 *
 * 2.4 and not the 6 the old right-click used, because NOBODY ASKED FOR THIS
 * ONE. A rate the player requested may arrive; a rate that fires by itself
 * 1.2 s after they stopped moving the mouse must not read as the game snatching
 * the camera. 2.4 walks a full 180° look-behind home in about 1.5 s — visibly
 * deliberate, and slow enough that the mouse can overrule it at any point in
 * the glide simply by moving.
 */
const RECENTRE_RATE = 2.4;
const RECENTRE_DONE = 0.04;

/**
 * How long the mouse must be still before the swing takes the shot back, in
 * seconds — the (c) hand-back's whole trigger.
 *
 * It is a compromise between two ways of being wrong, and both were easy to
 * find: shorter than about a second and the rig starts creeping back between
 * the flicks of a single look-around, which is the fighting-your-hand feel that
 * made a per-frame resume unusable; much longer and a glance you took at 20 km/h
 * leaves you riding blind into the next obstacle for the rest of the second. At
 * 1.2 s a deliberate look holds as long as the hand keeps working, and a glance
 * costs a bit over a second of trailing view.
 *
 * A HELD RIGHT BUTTON STOPS THIS CLOCK OUTRIGHT (see (e)), which is the way out
 * of the compromise for anyone who wants one: a look you hold the button through
 * lasts exactly as long as you hold it, at any speed, and the 1.2 s now only
 * prices the look you took with no button at all.
 */
const LOOK_IDLE = 1.2;

/**
 * Pointer movement (px, |dx| + |dy| in one event) below which an event is not a
 * look. Under pointer lock there is no cursor to drift, so this is only here to
 * eat the zero-delta moves a browser can emit around a lock change — anything a
 * hand actually did clears it on the first event.
 */
const LOOK_MIN = 1;

/**
 * The right mouse button, in the two forms one pointer event reports it in:
 * `button` on a down/up says which button CHANGED, and the `buttons` bitmask on
 * every event says which are held. The mask is what the drag actually trusts —
 * a mouse has one pointerId for all of its buttons, and a mask read off the
 * live event self-heals a release the window never delivered.
 */
const RIGHT_BUTTON = 2;
const RIGHT_HELD = 2;

/**
 * How far a right-drag turns the view: one full turn per element HEIGHT, on
 * both axes.
 *
 * Not a number chosen here — it is the vendored rig's own drag-orbit formula,
 * `2π · azimuthRotateSpeed · dx / clientHeight`, with the two rotate speeds at
 * the default 1 this module never overrides. A right-drag and the rig's own
 * left-drag therefore move the view by exactly the same amount as well as in
 * exactly the same direction; see (e).
 */
const DRAG_TURN = 2 * Math.PI;

/**
 * A position change bigger than this inside one frame is a respawn or a map
 * change, not a ride: cut to it. Damping across half the map is a flying zoom
 * nobody asked for, and the top of a fresh run is the one moment the default
 * shot should be restored. Safe against a hitch because main.ts clamps the
 * frame delta to 0.1 s — 6 m in one frame needs 60 m/s, and the ride tops out
 * around 17.
 */
const TELEPORT_JUMP = 6;

/**
 * The lens's own clearance, metres, measured back along the boom.
 *
 * A metre reads like a lot for a near plane 10 cm across, and it is not about
 * the near plane: THE COLLIDER IS THE BOUNDARY PLANE AND THE DRAWN WALL IS NOT.
 * Every facade in this spot stands on its building's collider face and then
 * puts furniture in FRONT of it — `bandsOf` in props.ts gives the shopfront
 * plinth 0.28 + half of BAND_DEPTH, the cornice 0.42 + the same, and
 * `shopfrontsOf` hangs the fascia boxes 0.22 further out again, so the surface
 * you can SEE reaches about 0.75 m into the plaza from the surface the world
 * query knows about. A lens parked half a metre off the collider is inside the
 * plinth, and the inside of a plinth is a flat dark panel with the game behind
 * it — which is exactly the frame round 2 was opened for. One metre clears the
 * deepest of that furniture with a hand's width to spare.
 */
const LENS_SKIN = 1.0;

/**
 * …except where there is not a metre to be had. The skin never eats more than
 * this fraction of the gap, so a boom with 0.6 m of room takes 0.39 rather than
 * being handed a negative number and clamped back into the wall.
 */
const SKIN_SHARE = 0.35;

/**
 * …and the clearance measured straight DOWN. This is what the LIFT is bought in
 * units of: the lens sits at least this far over whatever it is passing, so a
 * bank the boom crosses reads as ground to fly over rather than a face to stop
 * at, and a low angle stays a low angle instead of becoming a kerb-level shot
 * with his head sticking out of the sidewalk.
 */
const LENS_LIFT = 0.3;

/**
 * How much lift the shot may buy, in metres of climb per metre of boom.
 *
 * It is a rate and not a distance because that is what the geometry is: seeing
 * over something `h` tall at `t` metres out costs `h · D / t` at the lens, so
 * what this really caps is the angle the shot may be pushed up — 0.55 is 29°, on
 * top of the 14° the rig already sits at. Past that a chase camera has become a
 * helicopter, and coming IN is the more honest answer.
 *
 * It is set at the cap the SPOT needs and not at the smallest number that reads
 * as a chase shot, because the two failure modes are not symmetrical. Priced at
 * 19° the wedge bank behind a carve came out as unaffordable — which is the
 * "wall" verdict — and the boom cut 3.4 m in a single frame, twice, in an
 * ordinary run; at 29° the same runs never shorten at all and the lens sits
 * 2.0 m over his shoulder at the 90th percentile against 1.66 m on open floor.
 * A shot a few degrees higher than you would have framed by hand is a shot; a
 * cut is not.
 *
 * Those metres were measured against the 7.0 m boom, and the number survives
 * every shortening since because it is an ANGLE: `room` prices clearance as
 * `LIFT_RATE · t`, with no boom length in it, so every obstacle keeps the same
 * verdict and the shorter boom simply meets fewer of them. What the boom's
 * length does change is the absolute climb a given verdict buys — 0.55 × 3.2 is
 * 1.8 m of headroom parked — which is the correct behaviour: the lens is nearer
 * the ground it has to clear.
 *
 * …AND IT NOW BREATHES WITH SPEED, for the same reason and by the same rule.
 * Since THE ORBIT the boom is `distance + lag`, so at 61 km/h the allowance is
 * 0.55 × 6.5 = 3.6 m. That is not a loosening: it is 29° at every speed, and a
 * lens 6.5 m back genuinely has more between it and him to get over than one
 * 3.2 m back.
 */
const LIFT_RATE = 0.55;

/** The first step of the upward search for clear air, metres. It doubles. */
const LIFT_PROBE = 0.4;

/**
 * The floor under the boom, and a jam is where it earns its keep: this is the
 * shot the player gets when he rides into a corner, so it has to BE a shot.
 * 1.2 m off his shoulder is tight on his back — the frame is the player, which
 * is a legible thing to be looking at. The 0.15 m it replaces was inside his
 * ribcage: the near plane sits 0.1 m out, so the whole screen became the inside
 * of his t-shirt with the game invisible behind it.
 *
 * The cost is honest and bounded: against a wall closer than about 1.9 m the
 * lens keeps less than its full skin, and dead into a corner it can be inside
 * the facade trim. Trim you can see past beats a t-shirt you cannot.
 */
const MIN_BOOM = 1.2;

/**
 * The march down the boom: a coarse step, then bisections onto the face. Four
 * halvings put the lens within 3 cm of the wall it stopped at, which is under
 * the skin above, so the refinement costs nothing visible and the coarse step
 * can stay long enough to be cheap.
 */
const PROBE_STEP = 0.5;
const PROBE_REFINE = 4;

/**
 * How fast each correction moves, 1/s.
 *
 * The BOOM still comes in on the frame it must — a lens inside a wall is not a
 * shot and there is no easing that into place — and goes back out on a curve,
 * because the alternative is the camera snapping 5 m backwards the instant a
 * doorway ends.
 *
 * The LIFT is the one that may not cut, and that is the difference between the
 * two corrections rather than a taste: coming in moves the lens along the line
 * it is already looking down, and climbing moves the whole frame vertically, so
 * a metre taken in one frame reads as a hitch in a way a metre taken in is not.
 * 14/s is most of the climb inside a tenth of a second, which the 0.3 m of
 * LENS_LIFT slack covers — the lens is a few centimetres into a bank for three
 * frames, seen from inside, which is nothing — and it comes back down at 2
 * because that is what stops it dipping into the bank it just cleared.
 */
const BOOM_RETURN_RATE = 3.5;
const LIFT_RISE_RATE = 14;
const LIFT_FALL_RATE = 2;

/**
 * The world, as the CAMERA needs it — two questions, "is this point inside
 * something" and "how high is the top here". Both maps already answer both for
 * the wheels, so the boom reads the level through the ride's own contract rather
 * than a mesh list of its own.
 */
export interface CameraWorld {
  /** true where anything stands taller than `y` — wall, building, kerb, bank. */
  blocked(x: number, z: number, y: number): boolean;
  /** Top surface at or below `yHint`. The height-field maps answer here. */
  height(x: number, z: number, yHint?: number): number;
}

/** What the camera needs to know about the ride. Deliberately not the model. */
export interface CameraSubject {
  position: THREE.Vector3;
  /** The direction he is TRAVELLING, radians. Not the deck's facing. */
  course: number;
  /** Signed along-surface speed, m/s. */
  speed: number;
  /**
   * The world he is riding, for the boom to push off. Optional so a subject
   * that is only a position and a heading still drives the rig — a camera that
   * refuses to run without a level is worse than one that cannot collide.
   */
  surface?: CameraWorld;
}

export interface SkateCamera {
  update(subject: CameraSubject, delta: number, running: boolean): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

/** Shortest signed angle equivalent to `a`, in (−π, π]. */
function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * The fraction of a remaining gap that a response rate closes in `delta`.
 * `1 − e^(−rate·dt)`: 30 fps and 144 fps arrive together, and a hitched frame
 * closes almost all of the gap instead of overshooting past it the way a raw
 * `rate · dt` would.
 */
function approach(rate: number, delta: number): number {
  return 1 - Math.exp(-rate * Math.max(delta, 0));
}

export function createSkateCamera(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
): SkateCamera {
  /** The player's hand is on the view: nothing swings under it — see (c). */
  let looking = false;
  /** Seconds since the mouse last moved. LOOK_IDLE of these ends `looking`. */
  let sinceLook = 0;
  /** Running the hand-back swing — quicker than the drift, and it ends itself. */
  let recentring = false;
  /** False until the first update has placed the rig behind the ride. */
  let placed = false;

  /** The right button is down on the canvas — see (e). */
  let dragging = false;
  /** Where the drag was last sampled, and the lock state it was sampled under. */
  const dragFrom = { x: 0, y: 0 };
  let dragLocked = false;
  /**
   * `running` as of the last update. The drag reads it because a right-drag over
   * the pause card or the title is not a look at the game.
   */
  let live = false;

  /** The window, where there is one — the drag's stuck-button release valve. */
  const view = typeof window !== "undefined" ? window : null;

  const isLocked = (): boolean =>
    typeof document !== "undefined" && document.pointerLockElement === domElement;

  /**
   * End the drag. It writes NO angle — see (e): all a release does is start the
   * idle clock at zero, with the whole of LOOK_IDLE still to run, so the view
   * stays exactly where the hand left it and the swing is a second away.
   */
  const endDrag = (): void => {
    if (!dragging) return;
    dragging = false;
    sinceLook = 0;
  };

  /**
   * The right button goes down: the player is holding the shot.
   *
   * It takes effect from the DOWN and not from the first movement, because that
   * is what the button is FOR on a trackpad — a hand that has stopped to
   * re-stroke has not finished looking. See (c) for the clock it pins and (e)
   * for the rest.
   */
  const onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse" || e.button !== RIGHT_BUTTON) return;
    dragging = true;
    dragFrom.x = e.clientX;
    dragFrom.y = e.clientY;
    dragLocked = isLocked();
    looking = true;
    sinceLook = 0;
    recentring = false; // a hand on the view outranks a hand-back in flight
    // Keep the moves and the release coming if an UNLOCKED drag wanders off the
    // canvas — the rig returns on `button !== 0` before it captures anything, so
    // this pointer is nobody else's. Under a lock there is no cursor to wander.
    if (!dragLocked) domElement.setPointerCapture(e.pointerId);
  };

  /**
   * …and comes up — the pointercancel path too. A mouse reports all of its
   * buttons on ONE pointerId, so which button changed is `button` and which are
   * still down is the `buttons` mask.
   */
  const onPointerUp = (e: PointerEvent): void => {
    if (!dragging) return;
    if (e.pointerType === "mouse" && e.button !== RIGHT_BUTTON && (e.buttons & RIGHT_HELD) !== 0) {
      return; // some other button let go; the right one is still down
    }
    if (domElement.hasPointerCapture(e.pointerId)) domElement.releasePointerCapture(e.pointerId);
    endDrag();
  };

  /**
   * A held right button is a camera control here, not a browser menu over the
   * top of the game — see (e) for why this sits beside the gesture even though
   * the vendored rig preventDefaults it as well.
   */
  const onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  /** Alt-tabbed mid-drag: the release will never arrive, so end it here. */
  const onBlur = (): void => endDrag();

  // TWO JOBS, AND NEITHER IS A GATE. Free movement of the mouse belongs to the
  // vendored rig, whose pointer-lock math turns every movement into an orbit
  // with the verified signs (mouse-right looks right, mouse-up looks UP),
  // button or no button; nothing here intercepts an event or stops one. What
  // this listener adds is the RIGHT-BUTTON DRAG, which rotates only where the
  // rig does not — see (e) — and the WATCH: how the swing knows there is a hand
  // on the view, and the clock the hand-back in (c) runs off.
  //
  // Touch is ignored, deliberately and unchanged: a phone has no pointer lock,
  // its look is the rig's transient drag-orbit, and a finger that lifted has
  // already ended the look — latching the swing off behind it would strand a
  // phone player in a camera they have no way to hand back.
  const onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse") return;
    const locked = isLocked();

    if (dragging) {
      if ((e.buttons & RIGHT_HELD) === 0) {
        // The release never reached this element — let go over a DOM overlay, or
        // eaten by a lock change. The live mask is the truth about the hand.
        endDrag();
      } else if (locked !== dragLocked) {
        // The lock flipped mid-drag. clientX/clientY are FROZEN under a pointer
        // lock and live outside one, so a delta measured across the flip is the
        // distance to wherever the cursor was parked rather than anything a hand
        // did: re-anchor, and spend this one event on nothing.
        dragLocked = locked;
        dragFrom.x = e.clientX;
        dragFrom.y = e.clientY;
      } else {
        const dx = e.clientX - dragFrom.x;
        const dy = e.clientY - dragFrom.y;
        dragFrom.x = e.clientX;
        dragFrom.y = e.clientY;
        // THE ONE PLACE THIS PATH IS THE ONLY AUTHOR. Locked, the rig's aim has
        // already turned the view on this very event and a second turn would
        // double it. Not running, the drag belongs to the pause card. Orbiting,
        // both buttons are down and the rig is already dragging the view.
        if (!locked && live && !follow.isUserOrbiting) {
          const h = domElement.clientHeight || 1;
          follow.rotate((-DRAG_TURN * dx) / h, (-DRAG_TURN * dy) / h, true);
        }
      }
    }

    if (!locked && !dragging && !follow.isUserOrbiting) {
      // Unlocked, no button held, not dragging: an idle cursor over the pause
      // card or the title. (Unlocked AND dragging is the rig's fallback for a
      // refused pointer lock — that IS the player moving the view, so it counts.)
      return;
    }
    if (Math.abs(e.movementX) + Math.abs(e.movementY) < LOOK_MIN) return;
    looking = true;
    sinceLook = 0;
    recentring = false; // a hand on the mouse outranks a hand-back in flight
  };

  const follow = new FollowCamera(camera, {
    domElement,
    initialDistance: CAM_DISTANCE,
    minDistance: 2.4,
    maxDistance: 9,
    // 7.5° above the pivot — see (d) for what the drop from 14° buys and costs,
    // and (f) for why this round tilted the lens without touching this number.
    initialPolarAngle: REST_POLAR,
    // How high the mouse may get. 0.55 is 58° above the deck — a satellite
    // looking down on a skater the size of a coin, and nobody asked to play
    // chess. 0.85 still gives the full three-quarter view (2.1 m over the orbit
    // centre at the parked boom, more as the trail lengthens it) and stops where
    // the shot is still about the ride.
    minPolarAngle: 0.85,
    // …and how low. 0.12 below the horizon was the most the boom could take
    // while it went through the ground rather than stopping on it — `cos(π/2 +
    // 0.34) × 7` is 2.3 m under a pivot that sits over his shoulder. The boom
    // stops on the ground now, so this can be the angle a skate video actually
    // shoots from: 0.30 puts the lens 0.95 m under the orbit centre, which at
    // the parked boom is 0.51 m over the deck plane — a wheel-height shot
    // looking UP at him (the aim point is lower still, so the axis genuinely
    // tips up), with the floor and the lift to catch it, instead of a clamp the
    // player runs into after 16°.
    maxPolarAngle: Math.PI / 2 + 0.3,
    // The pivot's own lag — the second half of THE DELAY. 0.20 s of critically
    // damped spring is roughly 2.0 m of trail at 10 m/s.
    smoothTime: 0.2,
    // …and the constant the rig swaps in while the PLAYER is driving an axis.
    // It is a separate number for exactly this case: the follow wants to crawl
    // and the hand does not, and 0.20 s on a mouse feels like steering a barge.
    // 0.09 is about two frames at 60 fps — enough to take the stair-step off a
    // low-poll mouse, short enough that the view goes where it is pushed.
    draggingSmoothTime: 0.09,
    // Third-person action, and now a free-look one: the cursor is locked away
    // during play and the mouse turns the view with no button at all. The rig
    // OWNS the lock — every pause and resume goes through setPaused below, and
    // nothing here calls requestPointerLock/exitPointerLock behind its back,
    // which is what keeps the rig's aim state and the game's pause in step.
    pointerLockAim: true,
    // Gain 1 means `alignHeading(axis, x)` rotates by exactly `angle * x`, so
    // the caller passes the whole response fraction. That is where the rate
    // belongs here, because the drift and the hand-back run at different ones.
    headingAlignGain: 1,
  });

  // After the rig, and the order no longer matters: these listeners read events,
  // they do not intercept them (the old gate had to be registered first to eat
  // them). Running second is in fact what the drag WANTS — by the time it looks
  // at a move, the rig has already had its turn at it, and the `isLocked()` test
  // in there is the statement that the rig's turn was the whole answer.
  domElement.addEventListener("pointermove", onPointerMove);
  domElement.addEventListener("pointerdown", onPointerDown);
  domElement.addEventListener("pointerup", onPointerUp);
  domElement.addEventListener("pointercancel", onPointerUp);
  domElement.addEventListener("contextmenu", onContextMenu);
  view?.addEventListener("blur", onBlur);

  const bodyZ = new THREE.Vector3();
  const lastPos = new THREE.Vector3();
  /** The course last frame, and how fast it is turning (rad/s) — the lead. */
  let lastCourse = 0;
  let courseRate = 0;

  /** Where the rig sits when it is behind a ride on this course. */
  const behindAzimuth = (course: number): number => course + Math.PI;

  /**
   * How far ahead of the course to aim, radians — see THE CARVE in the header.
   *
   * `alignHeading` settles at a standing error of `courseRate / rate` against a
   * turning course, so that is exactly what one `share` of it buys back. The
   * clamp is what keeps a spike in the estimate from becoming a shot.
   */
  const lead = (rate: number, share: number): number =>
    THREE.MathUtils.clamp((courseRate * share) / rate, -LEAD_MAX, LEAD_MAX);

  /**
   * …and how far BEHIND it to aim — the turn's lag, radians. See THE TRAIL.
   *
   * It rides the same course-rate estimate the lead does, so it inherits that
   * filter's spike protection (COURSE_JUMP) for free and adds no filter of its
   * own. Seconds × rad/s = rad: the swing aims where the course was TRAIL_TIME
   * ago, which is the player's sentence and nothing more.
   *
   * The hand-back does NOT use it, deliberately — a recentre is the player
   * asking for the default shot back, and a trail term inside it would be a
   * glide that converges to "not quite behind him" and stays there.
   */
  const trail = (): number =>
    THREE.MathUtils.clamp(courseRate * TRAIL_TIME, -TRAIL_MAX, TRAIL_MAX);

  /** Ease the rig's angle toward sitting behind `aim`. */
  const swing = (aim: number, rate: number, delta: number): void => {
    bodyZ.set(Math.sin(aim), 0, Math.cos(aim));
    follow.alignHeading(bodyZ, approach(rate, delta));
  };

  /**
   * The other half of the hand-back: ease the PITCH back to the default shot.
   *
   * With the mouse always live, pitch is the axis that quietly stays wrong — a
   * glance up at a rooftop leaves the rig looking down at him from 40° for the
   * rest of the run, and unlike the angle round him nothing else ever corrects
   * it. Same shape as the swing on purpose: measure the residual at the RENDERED
   * polar and add a fraction of it, so the two axes of one hand-back converge
   * together instead of one arriving while the other is still travelling.
   *
   * The user-orbit guard is `alignHeading`'s, copied — during the drag-orbit
   * fallback (a refused lock) the pointer is the only thing moving the view and
   * a correction underneath it would be the rig fighting the hand.
   */
  const levelPitch = (rate: number, delta: number): number => {
    const residual = REST_POLAR - follow.polarAngle;
    if (!follow.isUserOrbiting) follow.rotate(0, residual * approach(rate, delta), true);
    return residual;
  };

  // --- the boom -------------------------------------------------------------
  //
  // The rig owns the ANGLE ROUND the player; this owns how far down the boom the
  // lens sits and how high it rides. Nothing below ever touches the azimuth,
  // which is the whole reason a constraint this late can live with a mouse that
  // is always live: the angle the player is holding the view at is still the
  // angle they get, from a lens that is out of the concrete.

  const dir = new THREE.Vector3();
  const probe = new THREE.Vector3();
  /**
   * The point the shot is built around: HIS OWN x and z, at the rig's damped
   * height. See THE ORBIT for why the horizontal comes off the skater and the
   * vertical off the pivot.
   */
  const focus = new THREE.Vector3();
  /**
   * …and the point the lens is pointed at: `focus`, AIM_DROP lower. See (f).
   *
   * `aimPoint` and not `aim`, because the swing already has a local `aim` that
   * is an ANGLE — one of them shadowing the other in a file where both mean
   * "where the camera is pointed" is a bug waiting for the next reader.
   */
  const aimPoint = new THREE.Vector3();
  /**
   * How many metres of boom the WORLD is taking off the shot this frame — zero
   * on open ground, negative against a wall. Eased rather than the length
   * itself, because the length now carries the speed lag too and easing that
   * would be a second filter on top of the pivot's spring. See THE ORBIT.
   */
  let deficit = 0;
  /** Metres of climb at the end of the boom. */
  let liftNow = 0;
  /** What the world will allow this frame. Reused — the per-frame path allocates nothing. */
  const shot = { len: CAM_DISTANCE, lift: 0 };

  /**
   * Is this point inside the world — or too close under it?
   *
   * `blocked` is the ride's own wall test and it answers for the FLOOR too (a
   * kerb is a solid standing over the probe), which is most of the ground case
   * on the street for free. The height query behind it is not a duplicate: a
   * map whose ground is a height field rather than a list of solids — the grass
   * field is one — answers `blocked` with a flat false and puts the whole floor
   * behind `height`. Both maps the game ships are asked both questions rather
   * than the camera learning which kind of world it is on.
   */
  const solidAt = (world: CameraWorld, x: number, y: number, z: number): boolean =>
    world.blocked(x, z, y - LENS_LIFT) || y - LENS_LIFT < world.height(x, z, y);

  /**
   * A point on the boom: `t` metres out, on a chord whose far end at `span` is
   * `lift` metres above the straight one. The chord is straight — it has to be,
   * because what is being tested is the LINE OF SIGHT to the player, and a
   * curved boom that arched over a ledge would still be looking through it.
   */
  const chordAt = (pivot: THREE.Vector3, t: number, lift: number, span: number): THREE.Vector3 => {
    probe.copy(pivot).addScaledVector(dir, t);
    probe.y += (lift * t) / span;
    return probe;
  };

  /**
   * The lowest height at `(x, z)` with clear air in it, searching up from `y0`
   * and giving up at `ceiling`. Returns `Infinity` when there is no clear air to
   * be had under the ceiling — which is how a WALL is told from GROUND: ground
   * has a top the lens can get over, a building does not.
   *
   * Doubling then bisecting, rather than `height()` read straight: the height
   * query is the ground and only the ground. Map 2's boundary fence stands 2.6 m
   * over a walkway `height` reports at the walkway, and a lift priced off that
   * would clear nothing at all.
   */
  const clearY = (
    world: CameraWorld,
    x: number,
    z: number,
    y0: number,
    ceiling: number,
  ): number => {
    let lo = y0;
    let step = LIFT_PROBE;
    let hi = Math.min(y0 + step, ceiling);
    while (solidAt(world, x, hi, z)) {
      if (hi >= ceiling) return Infinity;
      lo = hi;
      step *= 2;
      hi = Math.min(lo + step, ceiling);
    }
    for (let i = 0; i < PROBE_REFINE; i++) {
      const mid = (lo + hi) / 2;
      if (solidAt(world, x, mid, z)) lo = mid;
      else hi = mid;
    }
    return hi;
  };

  /**
   * What the world will allow: how far down the boom the lens may sit, and how
   * high it has to ride to get there.
   *
   * ONE march, down the straight boom, starting at the pivot. Starting there
   * rather than at some comfortable minimum is deliberate — skipping the near
   * metre is how a rig steps over the wall right behind the player and settles
   * in the clear air on the other side of it. It runs one skin PAST the length
   * the rig wants, so a face just behind the ideal lens position still counts.
   *
   * Every sample that is inside something asks the world the one question that
   * decides the correction: is there clear air over this, inside what the shot
   * may afford? Yes → price the climb and keep the LARGEST price on the boom,
   * because a chord high enough for the dearest sample is high enough for all of
   * them at once. No → that is a wall, and everything past it is behind the
   * wall, so the march ends and the lens comes in.
   *
   * The max is what makes the correction hold still. Pricing off the FIRST
   * sample instead and re-marching gets the same answer eventually, but the
   * answer moves every time which sample is first changes — `h · D / t` is four
   * times dearer at 1 m than at 4 m — and the shot lurched most of a metre
   * sideways in a single frame as the boom swept a bank. A max over the whole
   * chord only moves when the geometry under it does.
   */
  const clearBoom = (
    world: CameraWorld,
    pivot: THREE.Vector3,
    desired: number,
    out: { len: number; lift: number },
  ): void => {
    const reach = desired + LENS_SKIN;
    const steps = Math.max(1, Math.ceil(reach / PROBE_STEP));
    const maxLift = LIFT_RATE * desired;
    let lift = 0;
    let clear = 0;
    let hit = -1;
    for (let i = 1; i <= steps; i++) {
      const t = (reach * i) / steps;
      chordAt(pivot, t, 0, desired);
      if (solidAt(world, probe.x, probe.y, probe.z)) {
        // The ceiling handed to the search is the cap converted to this sample's
        // own scale — a thing 1 m out may only be cleared by a seventh of the
        // climb the lens is allowed, which is the same statement as "a tall thing
        // right behind you cannot be flown over from seven metres back".
        const room = probe.y + (maxLift * t) / desired;
        const over = clearY(world, probe.x, probe.z, probe.y, room);
        if (over === Infinity) {
          hit = t; // a wall: no top to get over inside what the shot may afford
          break;
        }
        lift = Math.max(lift, ((over - probe.y) * desired) / t);
      }
      clear = t;
    }
    if (hit < 0) {
      out.len = desired;
      out.lift = lift;
      return;
    }
    // Coming in, then. `clear` is the last sample the lifted chord passes
    // through open air; bisect onto the face, take the skin off it, and stop
    // outside the player.
    for (let i = 0; i < PROBE_REFINE; i++) {
      const mid = (clear + hit) / 2;
      chordAt(pivot, mid, lift, desired);
      if (solidAt(world, probe.x, probe.y, probe.z)) hit = mid;
      else clear = mid;
    }
    const len = THREE.MathUtils.clamp(
      clear - Math.min(LENS_SKIN, clear * SKIN_SHARE),
      MIN_BOOM,
      desired,
    );
    out.len = len;
    // The lift the chord actually has at the point the lens stopped at — a short
    // boom that kept the full climb would be looking down at him from nowhere.
    out.lift = (lift * len) / desired;
  };

  /**
   * Place the lens for this frame. Runs AFTER the rig has damped its angles and
   * put the camera at the full boom, and it runs in FREE MODE TOO — the parked
   * shot is the one the player has to live with, so a free camera allowed inside
   * a building is a view they cannot see out of and did not ask for.
   */
  const settleBoom = (subject: CameraSubject, delta: number, cut: boolean): void => {
    const world = subject.surface;
    const pivot = follow.target;
    // THE SHOT IS BUILT AROUND HIM, NOT AROUND THE PIVOT — see THE ORBIT. His
    // own x and z, so a look rotation orbits the skater; the rig's damped
    // height, so a pop still arrives through the spring instead of in the lens.
    focus.set(subject.position.x, pivot.y, subject.position.z);
    // …and how far he has run ahead of the point the rig is following, measured
    // flat. This is the trailing pivot, kept exactly as it was and spent as what
    // (d) always called it: metres of extra boom.
    const lag = Math.hypot(focus.x - pivot.x, focus.z - pivot.z);
    const desired = follow.distance + lag;
    // The rig's own orbit direction, rebuilt from its damped angles (THREE's
    // spherical convention — the same three lines it places the lens with).
    // Taken off `camera.position` instead, a frame where the lens sat on the
    // pivot would hand back a zero-length direction and NaN the shot.
    const sinP = Math.sin(follow.polarAngle);
    dir.set(
      sinP * Math.sin(follow.azimuthAngle),
      Math.cos(follow.polarAngle),
      sinP * Math.cos(follow.azimuthAngle),
    );
    if (world) {
      clearBoom(world, focus, desired, shot);
    } else {
      shot.len = desired;
      shot.lift = 0;
    }
    // Each correction is quick in the direction that gets the lens out of the
    // concrete and slow in the direction that gives the shot back — see
    // BOOM_RETURN_RATE. "Out of the concrete" is a DEEPER deficit for the boom
    // and HIGHER for the lift, which is why the two tests point opposite ways.
    // Easing the deficit rather than the length is what keeps the speed lag out
    // of this filter: on open ground it is a flat zero at every speed.
    const want = shot.len - desired;
    if (cut || want < deficit) deficit = want;
    else deficit += (want - deficit) * approach(BOOM_RETURN_RATE, delta);
    if (cut) liftNow = shot.lift;
    else {
      liftNow +=
        (shot.lift - liftNow) *
        approach(shot.lift > liftNow ? LIFT_RISE_RATE : LIFT_FALL_RATE, delta);
    }
    const boom = THREE.MathUtils.clamp(desired + deficit, MIN_BOOM, desired);
    camera.position.copy(focus).addScaledVector(dir, boom);
    camera.position.y += liftNow;
    // The lens points at him, half a metre under the orbit centre — see (f).
    // Fixed under a yaw rotation because it is on his own vertical axis.
    aimPoint.set(focus.x, focus.y - AIM_DROP, focus.z);
    camera.lookAt(aimPoint);
  };

  // --- the lens -------------------------------------------------------------
  //
  // See THE LENS. This is the only thing in the game that writes `camera.fov`,
  // and it only ever adds to the lens main.ts built.

  /** The game's own lens, read once. Never written — only added to. */
  const baseFov = camera.fov;
  /** Degrees of widening currently applied. */
  let fovNow = 0;

  /** Degrees of widening this speed has earned, before the ease. */
  const fovWant = (speed: number): number =>
    FOV_GAIN *
    THREE.MathUtils.clamp(
      (Math.abs(speed) - FOV_MIN_SPEED) / (FOV_FULL_SPEED - FOV_MIN_SPEED),
      0,
      1,
    );

  /**
   * Ease the lens toward what this frame's speed asks for, and write it once.
   *
   * `running` is the whole of the go-home rule: paused, at the title, or on any
   * frame the game is not under the player, the target is rest and the lens
   * eases back to the shot he started with. A CUT takes it there outright —
   * same word, same meaning as the boom's and the lift's, and it is what makes
   * a bail and an R return the default lens rather than a wide one.
   */
  const settleLens = (speed: number, delta: number, cut: boolean, running: boolean): void => {
    const want = running ? fovWant(speed) : 0;
    if (cut) fovNow = want;
    else fovNow += (want - fovNow) * approach(FOV_RATE, delta);
    const fov = baseFov + fovNow;
    if (Math.abs(camera.fov - fov) < FOV_EPSILON) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  };

  /** Put the rig behind the ride NOW — a cut, for a spawn or a respawn. */
  const snapBehind = (course: number): void => {
    // The zero rotate first: it collapses any in-flight damping so the damped
    // angle and the target angle are the same number, which makes the residuals
    // below exact instead of off by whatever was still easing.
    follow.rotate(0, 0, false);
    follow.rotate(
      wrapPi(behindAzimuth(course) - follow.azimuthAngle),
      // Pitch comes home on a cut too. It has to now the mouse owns it with no
      // button: R after a bail is the one input that means "give me the shot I
      // started with", and a rig that put him back behind the skater at the
      // 50° he was last craning at has given back half a camera.
      REST_POLAR - follow.polarAngle,
      false,
    );
  };

  return {
    update(subject, delta, running) {
      // What the drag path reads to know the game is under it — see (e).
      live = running;
      const teleported =
        placed && lastPos.distanceToSquared(subject.position) > TELEPORT_JUMP * TELEPORT_JUMP;
      lastPos.copy(subject.position);
      /** This frame is a cut, not a ride — the boom takes its length at once. */
      const cut = !placed || teleported;

      // How fast the ride is turning, low-passed. Kept up to date on EVERY frame
      // including the ones the swing is held off for, so a shot handed back in
      // the middle of a carve leads it from the first frame instead of spending
      // the filter's own settling time behind.
      if (cut) {
        courseRate = 0;
      } else {
        const raw = delta > 0 ? wrapPi(subject.course - lastCourse) / delta : 0;
        courseRate +=
          ((Math.abs(raw) > COURSE_JUMP ? 0 : raw) - courseRate) * approach(LEAD_RATE, delta);
      }
      lastCourse = subject.course;

      if (cut) {
        placed = true;
        // A cut restores the default shot, but it does not take the view off a
        // hand that is still holding the button: R with the right button down
        // means "put me back behind him AND let me keep looking".
        looking = dragging;
        recentring = false;
        sinceLook = 0;
        follow.moveTo(
          subject.position.x,
          subject.position.y + CAM_HEIGHT,
          subject.position.z,
          false,
        );
        snapBehind(subject.course);
      } else if (running) {
        // The hand-back clock — see (c). It runs only while the game is RUNNING,
        // so a pause freezes the view exactly where the player left it rather
        // than quietly spending the idle window behind the pause card and
        // recentring the moment they come back.
        if (looking) {
          // A held right button is not stillness — see (c). The clock is pinned
          // at zero for as long as it is down and starts at the release, so a
          // trackpad player can lift a finger and re-stroke without the rig
          // taking the shot back out from under the gesture.
          if (dragging) sinceLook = 0;
          else sinceLook += delta;
          // Riding is the gate on the hand-back, and it is the whole of what is
          // left of the old "it stays where you put it": stopped, the shot is
          // the player's for as long as they want it, and the first metres of
          // the next roll-away are what takes it back.
          if (sinceLook >= LOOK_IDLE && Math.abs(subject.speed) > SWING_MIN_SPEED) {
            looking = false;
            recentring = true;
          }
        }
        // The swing, and what stops it is the hand — moving the mouse, or
        // holding the right button, which is the same statement twice: while
        // the hand is on the view (and for LOOK_IDLE after it comes off)
        // nothing below touches an angle the player is holding. A drag always
        // implies `looking`, so this branch cannot run underneath one.
        if (!looking) {
          if (recentring) {
            const aim = subject.course + lead(RECENTRE_RATE, 1);
            const residual = wrapPi(behindAzimuth(aim) - follow.azimuthAngle);
            const pitchLeft = levelPitch(RECENTRE_RATE, delta);
            // BOTH axes, or the hand-back ends with the shot still craned up:
            // the angle round him converges in a second and pitch is usually
            // the longer of the two after a look at a rooftop.
            if (Math.abs(residual) < RECENTRE_DONE && Math.abs(pitchLeft) < RECENTRE_DONE) {
              recentring = false;
            } else {
              swing(aim, RECENTRE_RATE, delta);
            }
          } else if (Math.abs(subject.speed) > SWING_MIN_SPEED) {
            const rate =
              SWING_RATE *
              Math.min(
                1,
                (Math.abs(subject.speed) - SWING_MIN_SPEED) / (SWING_FULL_SPEED - SWING_MIN_SPEED),
              );
            swing(subject.course + lead(rate, SWING_LEAD) - trail(), rate, delta);
          }
        }
      }

      // The skater's shoulder, not the deck — a camera pinned to the board
      // pitches with every pop and reads as a hiccup.
      follow.moveTo(
        subject.position.x,
        subject.position.y + CAM_HEIGHT,
        subject.position.z,
      );
      follow.update(delta);
      // …and the last word on where the lens ends up: the rig has placed it at
      // the full boom, and this is the only thing allowed to move it off that.
      settleBoom(subject, delta, cut);
      // …and the lens, last. It reads the ride's speed and nothing the boom
      // decided, so the two speed effects the frame has stay exactly one.
      settleLens(subject.speed, delta, cut, running);
    },
    setPaused(paused) {
      // THE ONLY DOOR THE LOCK GOES THROUGH. The rig's own call exits the lock
      // and gives the cursor back to the pause card, then re-locks on resume —
      // legally, because main.ts calls this from inside the Escape keydown and
      // the DROP IN click, which is the user gesture a browser wants. Escape is
      // the browser's release valve and cannot be intercepted, so the game's
      // Escape-pauses contract and the lock's release are the same event by
      // construction rather than by two handlers agreeing.
      //
      // A pause does NOT hand the camera back: where the player left the view is
      // where they find it, and the idle clock is stopped for the duration.
      //
      // It DOES end a drag, though, and that is the one stuck-button case worth
      // closing by hand: Escape drops the lock and puts a card over the canvas,
      // so a right button released over that card sends its up to the card and
      // never to this element. Ending here costs the player a re-press after a
      // pause and buys back the guarantee that a held button can never outlive
      // the hand holding it.
      if (paused) endDrag();
      follow.setPaused(paused);
    },
    dispose() {
      domElement.removeEventListener("pointermove", onPointerMove);
      domElement.removeEventListener("pointerdown", onPointerDown);
      domElement.removeEventListener("pointerup", onPointerUp);
      domElement.removeEventListener("pointercancel", onPointerUp);
      domElement.removeEventListener("contextmenu", onContextMenu);
      view?.removeEventListener("blur", onBlur);
      // Hand the projection back the way it was found — this module borrowed
      // the lens, it does not own it, and a scene torn down mid-run must not
      // leave the next one a 68° camera to explain.
      if (camera.fov !== baseFov) {
        camera.fov = baseFov;
        camera.updateProjectionMatrix();
      }
      follow.dispose();
    },
  };
}
