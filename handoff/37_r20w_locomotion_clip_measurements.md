# R20W.1 — the legs the player never had, and the stride nobody measured

## What this was meant to be

The sprint verb (R20U.1) moves at 1.5 m/s with no running animation, so the character slid. The
task was to wire the KayKit Running clips the bootstrap already loads. Measuring first killed that
plan and found a worse bug on the way.

## The bug: free movement never reached the feet

R20S.3 moved every player step onto `laneController.moveDefenderWorld(dx, dz)`, which writes
straight to the engagement ledger. `defenderGait.advance()` was still being fed `defenderStep`,
the lane walk planner's output — and that is zero for the player from R20S.3 onwards.

Measured in the lab, holding W:

```
defender 位移 0.417m / 0.4s  (≈1.04 m/s, the correct walk speed)
gait 報告      speed 0.00 m/s · moving false · phase 不動
```

`sampleDefenderWalk` returns null when the gait is not moving, so the leg overlay was never applied
and the player's legs held the guard pose while the body glided — at every speed, not just sprint.
The attacker, still on the lane path, animated normally the whole time, which is why it read as "the
sprint slides" rather than "the player has no legs".

Nothing caught it. The gait module's own tests were fine (it was never fed). The movement verb tests
(R20T.4) assert displacement, which was correct. The golden grid presses no movement key. The test
that exists now asserts the join: ground the ledger actually granted has to arrive at the feet.

## The measurement: strides are drawn, not implied

`lane-walk-cycle.js` derived its stride from the rig — 0.8 of a leg length per step — because the
KayKit locomotion clips carry no root translation. R19C.1 flagged that 0.8 as the module's one
assumption and the first dial to turn if the gait read wrong.

The stride is readable, just not from the root. While a foot is planted it is fixed in the world, so
the body slides past it at exactly the speed the clip was drawn for. Solve FK through the leg chain,
find the frames where the toe is on the floor, fit a line to the ankle's travel across that contact:
the slope is the authored speed. Both feet fitted independently agree to within a few percent on
every clip, which is the check that says the method reads the animation and not noise.

| clip | length | authored speed | stride/cycle | airborne |
|---|---|---|---|---|
| Walking_A (was shipping) | 1.067s | 0.643 m/s | 0.686m | 20% |
| Walking_B (now) | 1.067s | 1.053 m/s | 1.123m | 21% |
| Walking_C | 1.600s | 0.478 m/s | 0.765m | 24% |
| Walking_Backwards | 1.067s | −0.623 m/s | −0.665m | 11% |
| Running_A | 0.800s | 3.268 m/s | 2.614m | 63% |
| Running_B | 0.800s | 7.2 m/s | 5.76m | 83% |
| Running_Strafe_L/R | 0.800s | ±3.0 m/s | ±2.4m | 63% |

Three things fell out of that table:

1. **The assumed cycle (0.6016m) was 12% short of Walking_A's real 0.686m**, so even the attacker's
   walk had been sliding since R19C.1.
2. **Walking_B is authored at 1.053 m/s and both fighters walk at 1.0.** The clip that matches this
   game was in the same pack all along; Walking_A was being played 1.6× fast.
3. **The stride carries a sign, and it has to.** Phase is advanced by `travelled / strideMeters`, so
   a backwards clip with a negative stride runs *forwards* in time while the body moves backwards.
   The old unsigned arithmetic wound Walking_Backwards in reverse — a moonwalk, with the feet
   sliding at twice the body's speed. The module's comment had claimed the opposite for a year.

With a measured per-clip stride the foot slide is zero at any speed. The only thing left that varies
with speed is how fast the clip runs compared to how it was drawn, and the gait now reports that
ratio (`playbackRate`) rather than hiding it.

## Why sprint keeps the walk clip

Two crossovers, both derived rather than chosen:

- **Walk-to-run for this body**: Froude 0.5 on a 0.3765m leg = **1.36 m/s**. Sprint at 1.5 is past
  it, so this body genuinely is running.
- **Least-stretch crossover** between the two clips (geometric mean of 1.053 and 3.268) = **1.85
  m/s**. Below it the walk is the better-behaved clip; above it the run is.

1.5 m/s sits between them. Running_A is drawn for 3.27 m/s and spends 63% of its cycle airborne;
playing it at our speed stretches its 0.8s cycle to 1.74s and holds that airborne pose for over a
second. The walk stretched to 1.42× reads as a hurried walk, which is what 1.5 m/s is for a 1.4m
character. So sprint keeps the walk clip.

The consequence is worth stating plainly, because it is the next decision and not an animation one:
**making sprint look like a run is a speed change, not a clip change.** Running_A earns its place at
roughly 2.0–2.3 m/s. That is above the 1.62 m/s authored burst ceiling the attack advances imply,
and it would make disengaging genuinely possible — which is the chase-terminus question, still open.

## R20W.2 — three things the first playtest found

**The skeleton lines were drawing a stale pose.** Each fighter is rendered as line segments rebuilt
from the bone positions inside `rig.updateAppearance()`, while the joint dots are meshes parented to
the bones and follow on their own. Every pose writer in the frame — the guard runtime, the walk
overlay's `applyRigPose`, the dodge — moves bones without rebuilding those lines, so the lines showed
whichever pose happened to repaint last and the dots showed the truth. Walking legs with a still
skeleton was the visible result. Fixed by repainting both fighters immediately before
`renderer.render`, which is by definition after the last writer of the frame. No behaviour changes:
the line buffers are presentation only, and the golden grid measures bone matrices.

**The walk was worn from the waist down.** R19E.1 made the walk a legs-only overlay because the
guard *is* the upper body — correct while the defender was always guarding. Free movement created a
second case: travelling with the guard down, where keeping the torso in a sword idle while the legs
stride is a fighter walking from the waist down. `planWalkOverlay` now decides scope from whether
the guard actually owns the upper body this frame: guard up, legs only as before; guard down, the
walk takes the whole rig.

**Sprint took the run clip after all.** R20W.1 chose the stretched walk on the measurement, and the
playtest asked for Running_A. It is wired by the measured transition rather than by the sprint key:
a gait is a run at 1.36 m/s for this rig, walking at 1.0 is below it, sprinting at 1.5 is above. The
cost stands exactly as measured — 0.46× playback, a 63%-airborne pose held for over a second — and
it is recorded in the clip table and in the gait's own `playbackRate`. If it reads floaty, the fix
is sprint speed (Running_A is honest from about 2.0 m/s), not another clip.

A run has no legs-only reading, so `planWalkOverlay` refuses to lend one to a raised guard rather
than letting it take the torso. Sprinting already requires the guard down, so the two rules never
actually meet — saying so is what stops the next caller from finding out by accident.

## Still open

- **The sidestep has no clip at any speed.** KayKit ships a running strafe (±3.0 m/s) and no walking
  one; at the 0.75 m/s this lab sidesteps at it would play at a quarter rate. So a locked player
  circling keeps planted legs — unchanged by this work, but now a number in
  `locomotion-clip-measurements.js` rather than a shrug in a comment. This is the most visible
  remaining animation debt, because circling is what locked mode is *for*.
- **Sprinting has no upper body.** The run is a leg overlay under a sword idle, so the arms do not
  pump. Cheap only if a full-body clip is allowed to own an unguarded, unlocked, moving fighter.
- Chase terminus / stamina (a new resource, deferred to a decision).
- Guard-direction indicator (task #3).
