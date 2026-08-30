# R20Q — Lock Camera Profile, and the Guard Indicator It Implies

## Status

Locked-mode framing is **decided and written into `src/combat/third-person-camera.js`** (R20R.2):
half-body over the shoulder — FOV 74, angle 19, distance 2.85, look height 0.69, azimuth 20,
panX 0.01, panZ 1.45, the same on all three keys. Free mode and the lag constants have not been
through the lab and are still seeds. The combat lab is still untouched; nothing is wired into the
fight yet.

Two things follow for whoever wires it:

- **Always run `fitLockedProfileToAspect` at startup and on resize.** At the contract floor (1.2:1)
  the tuned profile leaves the guard 3% inside the frame unfitted; the fit eases the shoulder from
  20° to 15° there and restores the margin. Wider windows take it unchanged.
- The azimuth is identical on all three keys on purpose. Anything that makes it vary with
  separation puts camera rotation back into ordinary walking.

## The decision this stage produced

A locked camera that frames the opponent large and lets the player's own body sit low in frame —
cropped at the legs if the framing calls for it. It follows from what each fighter is FOR:

- You read an **attack** off the opponent's whole body. Their windup lives outside the contact
  height and LEFT's sweep starts near the floor, so the opponent is framed head to feet.
- You read **your own state** off your guard. Every exchange measured in this project is decided at
  or above the lowest contact floor: TOP lands at 1.138m, LEFT at 1.15m, RIGHT between 1.24m and
  1.44m (`CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS`). Below that line you are legs, and how far
  away the opponent is comes from the gap between the two of you, not from your own knees.

`evaluateLockedFraming` checks those two separately; cropping the player's legs is reported, not
failed. The sweep runs every separation in the lock band (1.1–5.0m) × 12 bearings × 4:3, 16:9 and
19.5:9, because the horizontal field is the half that moves with the aspect.

## The debt this creates: a guard-direction indicator

For Honor can crop the player's body because guard direction is a HUD element anchored on the
opponent, not something read off your own character. **We have no such indicator.** The only way a
player currently knows which side they are guarding is by seeing their own shield.

So the camera has a hard floor it did not have before, and it is measurable:

- The player's silhouette **above 1.1m must stay in frame** at every separation, bearing and aspect.
- Measured at the 2.4m key, that margin is the binding constraint on how large the opponent can be:
  panZ 1.65 gives 40% opponent screen height with 15% player margin; panZ 1.90 gives 42% with 3%;
  panZ 1.95 puts the guard off screen entirely. Each further 1% of opponent size costs about 4% of
  the player's margin.

**Trigger for building the indicator:** any tuned profile that pushes the player's readable margin
below ~15%, or that crops legs deliberately (panZ above ~1.70 at the middle key). At that point the
indicator stops being polish and becomes the thing the guard read depends on.

Scope when it comes: a direction cue that does not require the player's body to be visible — three
states (TOP / RIGHT / LEFT) matching the three attack directions, showing the guard the defender
currently holds, plus whatever the parry window needs. It is presentation only and must not become
a second source of truth about guard state: the guard state machine stays the authority.

## Window fitting (R20Q.1f)

`fitLockedProfileToAspect(profile, aspectRatio, { prefer })` eases the tuned framing until the
player's guard survives the window it is being played in. It rests on one measurement: how much the
shoulder has to give up is a function of the **aspect alone** — the cap is 12 degrees at 4:3 and 24
at 16:9, and identical at 1.1m and 5.0m, flat across the band. So the fit runs on a window change
and never during play, and is not a new source of camera motion.

One factor, applied globally to every key. Fitting keys individually would make the azimuth a
function of separation again, which is the self-rotation this project already removed.

What it gives up is the tuner's call, because the two halves of a half-body framing compete for the
same horizontal room: `prefer: 'crop'` eases the shoulder and keeps the crop, `prefer: 'shoulder'`
eases the look point and gives the legs back, `'balanced'` splits it. A portrait phone cannot be
satisfied by the primary lever alone, so the secondary follows and the framing degrades to plain and
behind — the honest answer for a frame that renders about ±11 degrees.

The lab reports intent beside every reduction (`方位 30°→12°`) and can render into a simulated
window shape, so a fit can never quietly stand in for a profile that does not work.

## Orientation contract (R20R.1)

**Landscape only, minimum aspect 1.2:1 — as advice, not a gate.** `src/combat/supported-viewport.js`
states it with the measurements behind the number. CrazyGames asks for a prompt about the best
experience rather than a lock-out, and once nothing is blocked the reason to block disappears too:
a rotate gate that freezes input is only needed if freezing is possible. Below the floor the game
still plays, `describeViewport` returns `recommend: true` with the remedy (rotate a phone, widen a
window) and a list of what actually degrades, and nothing lies — the camera's secondary lever holds
the framing and the lock cone stays honestly narrow.

What the number is FOR is verification: the narrowest window a framing must be tuned against, and
the narrowest one the lock rules are guaranteed honest in.

The decision was not made on taste. Portrait is the only aspect where the other rules have to lie:

- The lock cone is derived from what is rendered, and in landscape it always lands inside the frame
  (16:9 renders ±45.2° against a ±40.6° cone; 4:3 ±37.0 against ±33.3). Portrait renders ±14.6°,
  narrower than any usable cone, which is why a 25° floor existed — the only exception clause in the
  lock rules, and it let a player lock somebody they could not see. **That floor is now deleted**:
  the cone is `0.9 × horizontal half-FOV`, with no exception, at every supported viewport.
- The camera's safe-frame fit absorbs the whole cost in the shoulder alone down to 0.74:1, so every
  landscape device including an iPad at 4:3 keeps its framing. Portrait runs that lever out and has
  to spend the look point too, losing the over-the-shoulder framing, the half-body crop and the pair
  reading side by side — all three at once, on the smaller screen.

1.2 is the floor because FOV 50 needs 1.13:1 for the cone to be fully screen-derived; 1.2 keeps a
margin and sits between the widest portrait (9:16 = 0.5625) and the narrowest landscape device
worth supporting (4:3 = 1.333). The camera's secondary lever stays in the solver as a net for
windows outside the contract, and a test asserts it is never needed inside it.

Confirmed with the platform: a prompt about the best experience is what is expected, which is why
the posture is advisory.

## Steering budget (R20T.1) — answered

A walking-speed orbit is not a dodge, at any range this game can be played at. The strafe out-turns
the 45°/s windup tracker only inside 0.95m and the ledger clamps at 0.90m, so the exploitable band
is five centimetres wide. Measured: aim error at the end of the windup is 0.04–0.34° at every stance
and direction, against delivery-cone edges of −8° (LEFT) to ±20°; 24/24 orbited exchanges blocked
with the guard up, and every TOP and RIGHT swing connected with it down. `orbit-steering-budget.js`
carries the model and the browser numbers together.

**Open finding, found while measuring that:** LEFT does not reach an unguarded body inside 1.4m —
0/3 at 1.0–1.3m, 1/3 at 1.4m, 3/3 from 1.5m. The still control misses identically, so movement is
not the cause. Guard up, the same cell blocks (the shield is out in front and intercepts a blade
that passes the body), so the hole is only against a defender who is not defending — exactly the
player a close-range attacker expects to punish. TOP and RIGHT connect 3/3 from 1.0m. Root cause not
established; the golden grid's LEFT cells start at 1.6m, so this band had never been sampled.

## Also open from this arc

- Root-cause LEFT's close-range body whiff (above).
- Locked vs unlocked win-rate balance check.
- Mobile UI proper: touch controls for the landscape layout, and the rotate-to-landscape gate
  (`describeViewport`) wired into whatever hosts the game.
