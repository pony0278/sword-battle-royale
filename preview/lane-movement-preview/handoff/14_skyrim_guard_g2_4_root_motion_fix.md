# G2.4 — Skyrim Retarget Correctness & Root Motion Fix

## Status

```text
engineering fix: IMPLEMENTED
unit / CI validation: PASS
visual playback validation: PENDING
19-bone fidelity expansion: OUT OF SCOPE
```

G2.4 exists because G2.3 proved that the real Skyrim GLB could enter Action Studio, but that proof did not establish motion correctness. The canonical `shd_blockidle.source.glb` could pass structural validation and loop start/end metrics while still producing an obvious fly-away during playback.

## Root causes found

### 1. Cross-unit translation scale was clamped incorrectly

The G2.3 retarget code measured source and target skeleton height but forced the resulting translation scale into `0.5 .. 1.5`.

Skyrim/Havok source coordinates are roughly two orders of magnitude larger than the procedural Action Studio rig. A legitimate ratio around `0.01` was therefore promoted to `0.5`, amplifying translated motion by roughly tens of times.

G2.4 removes that narrow clamp and preserves the actual positive source/target height ratio. An explicit `translationScale` override remains available for diagnostics.

### 2. Root translation was re-applied through pelvis world motion

G2.3 sampled both Skyrim root and Skyrim pelvis in world space:

```text
NPC Root   world delta -> target root.position
NPC Pelvis world delta -> target hips.position
```

Pelvis world motion already contains ancestor/root movement, so root motion could be transferred twice.

G2.4 separates the spaces:

```text
NPC Root   -> target root.position  : world-root motion
NPC Pelvis -> target hips.position  : root-relative body motion
```

Pelvis is measured relative to the animated Skyrim root. This keeps COM/pelvis weight shifts while removing duplicated root translation.

### 3. In-place playback depended on root motion being isolated correctly

The shared animation controller intentionally removes `root.position` for `inPlace: true`. That is only correct when locomotion is actually isolated to the root track.

After G2.4:

- `root.position` owns transferable root motion
- `hips.position` contains root-relative body translation
- `inPlace: true` removes scene locomotion while retaining Guard weight shift / body movement

No blanket removal of `hips.position` is used because that would destroy useful authored body motion.

## Motion diagnostics added

Every Skyrim-retargeted clip now records:

```text
translationScale
measuredTranslationScale
targetHeight
translationMetrics.root.maxExcursion
translationMetrics.root.maxStep
translationMetrics.hips.maxExcursion
translationMetrics.hips.maxStep
translationSafety.safe
translationSafety.excursionRatio
translationSafety.stepRatio
positionSpaces
```

The safety probe examines the entire sampled translation stream, not only the first and final frame.

This specifically catches a failure pattern such as:

```text
start: normal
middle: character flies far away
end: returns near start
```

which could previously receive a good loop-seam result.

## Regression coverage

G2.4 adds tests for:

- root and pelvis using distinct translation spaces
- a realistic `120 -> 1.24` cross-unit height ratio remaining around `0.0103`, never being clamped to `0.5`
- a mid-clip 50-unit fly-away being detected even when the final sample returns to the origin
- small Guard body translation remaining classified safe
- all pre-existing Skyrim alias / target-rig tests

## CI result

PR #13 CI run 65:

```text
Build Action Studio: PASS
Run tests: PASS
workflow conclusion: success
```

## What G2.4 does not claim

G2.4 does **not** claim that the visual motion is fully equivalent to Skyrim.

The source GLB contains approximately:

```text
99 animated nodes
198 animation channels
```

while the canonical Action Studio adapter still targets 19 semantic bones and produces a much smaller target track set.

The following fidelity work remains separate:

- clavicle transfer
- upper-arm / forearm twist transfer
- hand / finger pose fidelity
- weapon / shield helper interpretation
- any extra torso helper bones needed for silhouette quality

Those should only be expanded after the root-motion-correct version has passed visual playback.

## G2.4 visual acceptance gate

Use the canonical `shd_blockidle.source.glb` in the Skyrim Guard Visual Review and verify:

1. character remains spatially planted in `inPlace` playback
2. no frame produces a large translation spike or camera-space disappearance
3. pelvis keeps small authored weight shifts instead of being frozen
4. feet do not inherit visible root translation twice
5. Once / Loop / scrub remain stable
6. Front / 3-quarter / Side / Back views stay inside the review framing
7. translation diagnostics report a plausible scale near the real skeleton ratio and no flight-risk classification

Only after this visual gate passes should work continue to the fidelity expansion stage.

## Recommended next stage

```text
G2.4.1 — Canonical GLB Visual Playback Verification
```

If planted motion is confirmed, continue with:

```text
G2.5 — Skyrim Guard Fidelity Expansion
```

focused on clavicle / twist / hand / weapon-line preservation rather than further root-motion changes.
