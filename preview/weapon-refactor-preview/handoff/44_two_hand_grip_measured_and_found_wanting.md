# 44 — A, measured: the authored two-hand grip does not reach the hilt

Option A was to wire the left-arm profile the repository already owns into a usable place rather
than source two-handed animations. It is now wired, reusable and measured, and **the measurement
says it is not a grip.**

That is the deliverable. A half-working grip shipped quietly would have been worse than a number.

## What A actually was

`whole-body-motion-solver.js` held a private `TWO_HAND_LEFT_ARM`: seven hand-authored left-arm
poses — shoulder, elbow, wrist, and a 3-5% upper-arm stretch — blended into whatever the right arm
was doing, behind a `twoHandGrip` flag. It was reachable only by importing a clip baker.

It is now `src/animation/two-hand-grip.js`, and the baked chop clip is **byte-identical** across the
move (md5 `6d30bdacfa119d81fa5dfe92029a4b59` before and after), which is what makes it a move rather
than a change.

Three things were added on top of the extraction:

- **`twoHandGripLandmarkSeconds(profile)`** — where the seven phases fall on *one weapon's* measured
  swing. Four are anchored to landmarks the timings record already produces (plant = `activeStart`,
  impact = `contactSeconds`, follow = `activeEnd`, recover = `duration`); the two with no landmark,
  windup and commit, keep their authored share of the run-up — 8/16 and 13/16 — read off the
  baker's own frames rather than chosen here. So a slower greatsword stretches the arm motion
  instead of desynchronising from its own blade. Monotonic by construction, not by assumption.
- **`twoHandLeftArmAtSeconds`** — continuous, so the arm is interpolated rather than snapped to five
  combat phases.
- **`applyTwoHandGripToKayKitRig`** — the overlay that writes `upperarm.l`, `lowerarm.l` and
  `wrist.l` on top of a sampled clip, the same shape `guard-quaternion-correction.js` works in.
  Measured: it touches those three bones and no others.

## The measurement, and it is not close

`npm run measure:grip-reach` — headless, no canvas — reports the distance from the character's
`HAND_L` socket to the weapon's own `secondary_grip` node, per phase, with and without the grip.

Read against the character it was measured on: **height 1.4457, hands 0.3571 apart at rest.**

```
greatsword
  phase            one-handed   two-handed   closed    reached
  ready            0.4325       0.3814        0.0512   NO
  windup           0.6636       0.5609        0.1027   NO
  commit           0.5386       0.7076       -0.1690   NO
  plant            0.8929       0.2671        0.6258   NO
  impact           1.5028       0.7817        0.7211   NO
  follow_through   1.5669       1.2562        0.3107   NO
  recover          0.4325       0.3814        0.0512   NO
```

The grip **does** pull the arm toward the weapon — 0.63 closed at plant, 0.72 at impact — and it is
still nowhere near the hilt. The worst residual is **1.2632, or 87% of the character's height.** At
impact the two hands are on opposite sides of the body: `HAND_R` at x −0.394, `HAND_L` at x +0.376.

At `commit` the grip makes it **worse** by 0.17.

So the shape of the failure is: the authored arm leans in hardest around the plant, then the sword
swings on and the arm does not follow it. It was tuned by eye against a *look*, in a preview where
nobody measured the distance, and the `aL_stretch` of 1.03-1.05 — lengthening the upper arm to make
the hand reach — is the tell that it was always nearly-but-not-quite.

## What this settles

**The mesh was never the problem.** The greatsword is marginally *closer* than the longsword at
every phase (its `secondary_grip` sits 0.047 nearer the mount origin), so a bigger weapon does not
make this harder. Measured, asserted.

**A is not enough on its own**, and the earlier hope that it might be — based on those two grips
being only 0.047 apart — was right about the weapon and wrong about the arm. The 0.047 was never
the gap that mattered; the gap that mattered is 0.27 to 1.26 and it comes from the arm not tracking
the swing.

## What it is worth anyway

The module and the measurement are the acceptance test for what comes next.

`TWO_HAND_GRIP_REACH_TOLERANCE` is **0.10** — stated as a *proposed threshold*, not a measurement,
because the rest of this repository's numbers are measurements and the difference should be visible.
It is derived: two hands on one haft sit roughly a fist apart, the greatsword's entire grip from
crossguard to butt is 0.8333, so a hand more than 0.10 from the second grip node is not on the
handle. Tighten it when a real clip gives something better to calibrate against.

`tests/two-hand-grip.test.js` pins the current gaps as a **record of failure**, deliberately. When
a two-handed pack arrives, `npm run measure:grip-reach` is what says whether it holds the sword, and
that record is what it has to beat.

## What to do instead

- **B, the animations being sourced now.** Run them through `measure:grip-reach` before anything
  else. A pack whose `hand_l` is genuinely on the hilt will show gaps under 0.10 and this whole
  question closes. handoff/40's retarget constraint still governs which packs are usable at all:
  bone names matching Quaternius' 19, Skyrim's 23, or a third table.
- **C, an off-hand IK**, if no pack does. The target already exists and is already exposed —
  `weapon.sockets.SECONDARY_GRIP` — and the reach measurement is exactly the error an IK would
  drive to zero. It is the only option that adapts to a weapon it has never seen.

A stays in the tree either way: a partial grip at 0.3-0.5 weight is a reasonable *stylisation* over
a clip that already holds the sword, and the overlay is where that would go. It is just not a grip
by itself, and nothing in the repository should claim it is.

## Gates

1465 tests, typecheck clean, golden grid + parry gate + defence matrix reproducing every committed
number — the thirteenth consecutive reproduction. Nothing here touches the fight: the module is not
wired into the combat path, and deliberately so, because the thing to wire in is whatever wins the
comparison above.
