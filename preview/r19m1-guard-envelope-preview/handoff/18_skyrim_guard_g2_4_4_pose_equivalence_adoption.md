# G2.4.4 — Canonical Source ↔ Target Pose Equivalence & Guard Adoption Review

## Status at G2.4.4

**BODY RETARGET EQUIVALENCE: WARNING / ACCEPTABLE FOR REVIEW**  
**WEAPON SOCKET EQUIVALENCE: UNRESOLVED AT THIS STAGE**  
**G2.4.4 GUARD ADOPTION: PENDING**

Historical G2.4.4 reason:

`weapon-socket-equivalence-not-accepted`

> **G2.4.5 follow-up:** the equipment blocker described in this document has now been resolved with real quaternion bind-frame calibration. The earlier `~77°` helper-direction number was a positional-vector proxy, not the true bind-frame angular error. G2.4.5 measured the real uncalibrated quaternion mismatch at about `112.116°`, derived a bind correction, reduced canonical frame error to `0.004103°`, and upgraded the weapon socket to `GOOD`. The final `shd_blockidle` adoption decision is therefore **ADOPT WITH CORRECTIONS**. See `19_skyrim_guard_g2_4_5_weapon_bind_calibration.md`.

This stage deliberately separated two questions that had previously been mixed together:

1. Does the Action Studio Blockman preserve the canonical Skyrim `shd_blockidle` body pose closely enough?
2. If it does, is the authored source pose actually suitable for the intended Triangle Forward Guard?

G2.4.4 answered question 1 for the body and correctly refused to answer question 2 until the sword equipment frame became trustworthy.

---

## Canonical comparison setup

Source:

`assets/skyrim/guard/converted/shd_blockidle.source.glb`

Target:

`SKYRIM_GUARD/shd_blockidle`

Comparison timestamps:

- 0%
- 25%
- 50%
- 75%
- 99.8%

The review page loads the real source GLB and the real runtime-retargeted Blockman simultaneously:

- `tools/action-studio/skyrim-pose-equivalence-review.html`
- `tools/action-studio/skyrim-pose-equivalence-review.js`

The source skeleton is converted through the accepted G2.4.2 humanoid basis and normalized by `source pelvis → head` versus `target hips → head` for side-by-side display. This display scale is intentionally independent from the runtime root-motion translation scale.

---

## Fair semantic equivalence policy

Skyrim and the Action Studio target do not have identical torso segmentation.

Skyrim contains a deeper Spine0 / Spine1 / Spine2 chain, while the target uses a simpler hips / spine / chest chain. Therefore G2.4.4 does **not** compare `Skyrim Pelvis → Spine0` directly against `KayKit hips → spine` as if they were identical semantic segments.

The accepted technical body gate instead compares aggregate semantic directions:

- source pelvis → chest vs target hips → chest
- source pelvis → head vs target hips → head
- source chest → head vs target chest → head
- upper arm / lower arm on both sides
- upper leg / lower leg / foot on both sides

Hand → Weapon and Hand → Shield helper position directions were recorded separately as diagnostics. G2.4.5 later replaced these position-vector diagnostics with real quaternion equipment-frame equivalence.

---

## Body technical equivalence result

Across the five canonical timestamps, the core body direction comparison produced:

- mean direction error: `6.51447°`
- p95 direction error: `15.63755°`
- max direction error: `15.64991°`
- classification: **WARNING**

Thresholds:

- GOOD: mean ≤ `8°`, p95 ≤ `15°`, max ≤ `25°`
- WARNING: mean ≤ `15°`, p95 ≤ `28°`, max ≤ `45°`

The result narrowly misses GOOD on p95, but remains well inside the accepted correction range.

### Worst error per semantic segment

- torso pelvis → chest: `9.84037°`
- torso pelvis → head: `5.00477°`
- torso chest → head: `11.83468°`
- left upper arm: `0.00306°`
- left lower arm: `0.00315°`
- right upper arm: `0.00352°`
- right lower arm: `0.00225°`
- left upper leg: `8.12041°`
- left lower leg: `5.49533°`
- left foot: `15.64991°`
- right upper leg: `8.11827°`
- right lower leg: `5.51395°`
- right foot: `15.63889°`

This confirms the G2.4.3 arm-chain work: the weapon arm itself is no longer the dominant retarget error. The largest remaining body differences are target/source rig segmentation and foot/rest-axis differences.

---

## G2.4.4 equipment blocker and later correction

At G2.4.4, the available helper diagnostics reported:

- helper mean positional-direction error: `75.24312°`
- helper max positional-direction error: `77.08663°`

These numbers correctly showed that the two equipment systems could not yet be assumed equivalent, but they were **not sufficient to derive a bind quaternion**.

G2.4.4 therefore correctly treated sword-tip suitability as unresolved and returned `PENDING`.

G2.4.5 subsequently established the real equipment-frame result:

- true uncalibrated quaternion frame mismatch: about `112.116211°`
- derived correction quaternion: `[0.18599574, -0.80092339, -0.11031984, 0.55835189]`
- corrected canonical max quaternion frame error: `0.004103°`
- weapon socket: `GOOD`

The original G2.4.4 blocker is therefore closed.

---

## Triangle Guard body observations

The target body samples show stable useful qualities:

- off-hand height: approximately `0.715–0.753` torso heights
- weapon-hand horizontal center distance: approximately `0.565–0.591`
- off-hand horizontal center distance: approximately `0.570–0.586`
- torso yaw: approximately `35.77–36.11°`
- weapon-hand height: approximately `0.397–0.425`

The body-only provisional decision at G2.4.4 was already:

**ADOPT WITH CORRECTIONS**

G2.4.5 made the sword-dependent metrics trustworthy and confirmed that same final decision.

---

## Final historical interpretation

G2.4.4 itself remains an important truthful checkpoint:

**PENDING at the time because equipment bind equivalence was not yet accepted.**

It did **not** reject `shd_blockidle`.

The subsequent G2.4.5 result resolves this checkpoint to:

**ADOPT WITH CORRECTIONS**

What is accepted across G2.4.0–G2.4.5:

- HKX → canonical source GLB is coherent.
- root / pelvis motion is stable.
- global Skyrim ↔ Action Studio basis is calibrated.
- upper/lower arm FK fidelity is effectively exact.
- full-body source ↔ target semantic pose fidelity is within a correction-level WARNING range.
- weapon helper ↔ target equipment frame is now GOOD after bind calibration.

The remaining work is an authored Triangle Guard correction layer, not another retarget-system repair.

---

## Validation

G2.4.4 canonical execution was successful, and G2.4.5 later reran the dependent review with the equipment bind fixed.

See:

`19_skyrim_guard_g2_4_5_weapon_bind_calibration.md`
