# G2.4.5 — Skyrim Weapon Helper ↔ KayKit Sword Socket Bind Calibration

## Status

**WEAPON BIND CALIBRATION: PASS**  
**WEAPON FRAME EQUIVALENCE: GOOD**  
**GUARD ADOPTION AFTER TRUSTWORTHY SWORD BIND: ADOPT WITH CORRECTIONS**

Canonical source:

`assets/skyrim/guard/converted/shd_blockidle.source.glb`

Canonical target clip:

`SKYRIM_GUARD/shd_blockidle`

---

## Why G2.4.5 was required

G2.4.4 correctly found that the target sword silhouette could not yet be trusted, but its earlier `~77°` equipment diagnostic was only a **positional-vector proxy**:

- source: `Hand → Weapon` position direction
- target: `wrist → handslot.r` position direction

Those vectors describe socket offsets, not complete equipment orientation frames. They cannot uniquely determine a sword bind quaternion.

G2.4.5 therefore replaces that proxy with real quaternion-frame calibration and comparison.

The old `77.08663°` value must not be treated as the true bind-frame correction angle.

---

## Bind-space model

Let:

- `C` = accepted G2.4.2 source-world → target-world humanoid basis quaternion
- `Q_source_rest` = canonical Skyrim `Weapon` helper rest world quaternion
- `Q_target_rest` = KayKit `handslot.r` rest world quaternion

Convert the absolute source equipment frame into target world basis:

`Q_source_converted = C * Q_source_rest`

Because this is an **absolute world frame**, this step is a left-side basis conversion. It is not the `C * delta * C^-1` conjugation used for rotational deltas.

The constant bind correction is then:

`Q_bind = inverse(Q_target_rest) * Q_source_converted`

The runtime target handslot already carries the retargeted animated delta. Applying `Q_bind` at the equipment mount makes the target equipment frame reproduce the converted Skyrim Weapon frame without altering the body animation.

The existing procedural longsword model-space mount remains after this semantic bind correction.

---

## Canonical measured bind

From the real canonical GLB:

Converted Skyrim Weapon rest frame:

`[0.48833080, 0.52633319, 0.26329551, 0.64434609]`

KayKit `handslot.r` rest frame:

`[0.00000026, 0.70710657, 0.70710699, 0.00000003]`

Derived bind correction quaternion:

`[0.18599574, -0.80092339, -0.11031984, 0.55835189]`

Correction quaternion angle magnitude:

`112.116207°`

This `112.116207°` is the actual quaternion-frame rest mismatch measured by G2.4.5. It supersedes the old positional-vector `~77°` proxy.

The correction is derived from the frames; the angle is evidence, not a hard-coded visual offset.

---

## Frame-equivalence result

G2.4.5 samples the canonical animation at:

- 0%
- 25%
- 50%
- 75%
- 99.8%

### Without bind correction

Maximum quaternion equipment-frame error:

`112.116211°`

### With derived bind correction

Per-sample errors:

- 0%: `0.000008°`
- 25%: `0.000008°`
- 50%: `0.000010°`
- 75%: `0.000008°`
- 99.8%: `0.004103°`

Maximum:

`0.004103°`

Classification:

**GOOD**

Acceptance thresholds:

- GOOD: `≤ 15°`
- WARNING: `≤ 30°`
- BAD: `> 30°`

The remaining error is effectively floating-point / final-sample interpolation noise. The Skyrim Weapon helper and Action Studio equipment frame are now technically equivalent for this clip.

---

## Triangle Guard review after bind calibration

With the sword mount now trustworthy, the sword-dependent Triangle Guard metrics can finally be interpreted as source-pose/design information rather than retarget uncertainty.

Across the five samples:

- weapon-hand height: approximately `0.397–0.425` torso heights
- off-hand height: approximately `0.715–0.753`
- weapon-hand center distance: approximately `0.565–0.591`
- off-hand center distance: approximately `0.570–0.586`
- torso yaw: approximately `35.77–36.11°`
- sword-tip height: approximately `0.225–0.321`
- sword-forward dot: approximately `-0.787 to -0.825`

All five samples classify as **WARNING**, not BAD.

The consistently failing Triangle Guard gates are:

1. `weaponHandHeight` — sword hand is slightly too low.
2. `swordTipHeight` — sword tip is substantially lower than the desired forward Guard region.
3. `swordForwardDot` — sword direction is substantially opposite the intended forward-threat axis.

The off-hand position, hand compactness, body side angle, body weight, loop, and retarget stability remain usable.

---

## Final adoption interpretation

Now that body equivalence and weapon bind equivalence are both trustworthy, the previous G2.4.4 PENDING state can be resolved.

Final result for canonical `shd_blockidle`:

**ADOPT WITH CORRECTIONS**

Reason:

`retarget-is-usable-but-triangle-guard-needs-local-corrections`

This means:

- do not reject the Skyrim animation;
- do not continue changing the low-level retarget math to make the sword look prettier;
- preserve the authored lower-body / torso weight and micro-motion;
- add an Action Studio Guard correction layer for the intended Triangle Forward Guard silhouette.

The sword-down/backward orientation is now a **design/source-pose correction problem**, not evidence of a broken HKX conversion, global basis, arm FK, or equipment bind.

---

## Implementation

New module:

`src/animation/skyrim-weapon-bind-calibration.js`

Provides:

- quaternion multiply / inverse / angular-error helpers
- bind correction derivation
- source Weapon / target handslot rest-frame calibration
- calibrated weapon-mount composition
- runtime source ↔ corrected target frame measurement

Converted Skyrim clips now expose:

`clip.userData.weaponBindCalibration`

The calibration is applied at the equipment mount rather than rewriting the humanoid animation tracks.

Verification pages:

- `tools/action-studio/skyrim-weapon-bind-verification.html`
- `tools/action-studio/skyrim-weapon-bind-verification.js`

GitHub Actions now requires the G2.4.5 canonical bind gate before completing the Skyrim Guard visual workflow.

---

## Validation

Canonical successful execution:

- CI: PASS
- Build Action Studio: PASS
- full unit / contract suite: PASS
- G2.4.2 coordinate basis: PASS
- G2.4.3 arm-chain fidelity: PASS
- G2.4.4 source-target body review: PASS
- G2.4.5 weapon bind frame gate: PASS
- `data-g245-socket="good"`
- `data-g245-decision="adopt-with-corrections"`
- Skyrim Guard Visual Verification Run 40: PASS

Visual evidence includes calibrated front and 3/4 views plus the existing canonical timeline / multi-view captures.

---

## G2.5 follow-up

G2.5 has now frozen this technical verdict and authored the source-controlled Triangle Forward correction contract.

See:

`handoff/20_skyrim_guard_g2_5_adoption_triangle_correction_plan.md`

The low-level retarget pipeline is accepted and frozen. Canonical local quaternion correction offsets remain intentionally unauthored until G2.5.1.

---

## Next stage

**G2.5.1 — Triangle Forward Base Guard Authoring Lab**

Implement the additive upper-body correction layer in Action Studio, tune the real local quaternion offsets against the G2.5 target gates, and preserve the accepted source body motion.
