# R20Q — Lock Camera Profile, and the Guard Indicator It Implies

## Status

The camera lab (`tools/action-studio/camera-lab.html`) is built and in use; the profile in
`src/combat/third-person-camera.js` is still seeds. Tuning is in progress and the combat lab is
untouched while it happens. Nothing here is wired into the fight yet.

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

## Also open from this arc

- Wire the tuned profile + lock-on into the combat lab (step 3 of the free-movement plan).
- Derive the steering budget: 45°/s windup tracking against a target strafing at 0.75 m/s
  (17.9°/s angular at 2.4m, 39.1°/s at 1.1m).
- Locked vs unlocked win-rate balance check.
- Mobile portrait: the lock cone floors at 25° there, which is wider than the ~11° the phone
  actually renders — the one place a lock may be taken slightly off screen.
