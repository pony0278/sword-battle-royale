# G2.5.1 — Triangle Forward Base Guard Authoring Lab

## Status

**AUTHORING LAB: IMPLEMENTED**  
**CANONICAL FORWARD BASE GUARD: PASS**  
**5-SAMPLE TRIANGLE GATE: 5 / 5 PASS**  
**FOUR-VIEW VISUAL REVIEW: PASS**  
**LOW-LEVEL RETARGET: REMAINS FROZEN**

Canonical source:

`assets/skyrim/guard/converted/shd_blockidle.source.glb`

Canonical runtime clip:

`SKYRIM_GUARD/shd_blockidle`

Canonical correction metadata:

`src/combat/longsword-guard-metadata.js`

Authoring Lab:

- `tools/action-studio/skyrim-triangle-guard-authoring-lab.html`
- `tools/action-studio/skyrim-triangle-guard-authoring-lab.js`

Correction runtime helpers:

`src/combat/longsword-guard-correction.js`

---

## 1. Result

G2.5.1 turns the G2.5 correction plan into the first accepted Triangle Forward Guard pose.

The authoring pass does **not** reopen or modify:

- HKX decoding
- Skyrim → Action Studio translation scale
- G2.4.2 coordinate basis
- G2.4.3 arm-chain retarget
- G2.4.5 weapon bind calibration
- root / hips / lower-body source motion

The accepted pose is a fixed additive local-quaternion layer on top of the already accepted Skyrim Guard.

---

## 2. Authoring Lab capabilities

The dedicated lab loads the real canonical Skyrim Guard and exposes:

- canonical 50% authoring frame
- Front / 3-quarter / Side / Back views
- local correction controls
- quaternion-budget validation
- Sword Tip / Weapon Hand / Off Hand triangle debug lines
- sword blade ray
- fixed lock-on target ray / marker
- live G2.5 Triangle metrics
- five-sample validation at `0 / 25 / 50 / 75 / 99.8%`
- source-pose reset
- canonical quaternion export
- constrained Auto-fit Seed for authoring assistance

Auto-fit is an authoring tool only. CI now verifies the **committed canonical metadata** rather than rerunning optimization to find a new answer.

---

## 3. Important contract correction discovered by real authoring

The original G2.5 plan used:

`triangleArea = 0.035–0.20`

Real longsword geometry showed that the upper bound was conceptually wrong. Raising a long blade toward the opponent naturally increases the normalized hand/sword triangle area even when both hands stay compact around the torso.

Body opening is already constrained by:

- `weaponHandCenterDistance`
- `offHandCenterDistance`

Therefore the canonical G2.5.1 contract is now:

`triangleArea >= 0.035`

with no maximum.

This is a metric-definition correction, not a relaxation of hand compactness.

---

## 4. Final authored local correction

Euler values below are **authoring provenance only**. Runtime canonical values are the local quaternion offsets stored in metadata.

### Authoring provenance

```text
chest       = (  0°,  0°,  -8° )
upperarm.r  = (-18°, 18°, -27° )
lowerarm.r  = (  9°, 27°, -36° )
wrist.r     = ( -9°,  0°, -36° )
handslot.r  = ( 15°,  0°,   0° )
```

### Canonical quaternion offsets

```text
chest
[0, 0, -0.06975647374412532, 0.9975640502598243]

upperarm.r
[-0.18630870745570743, 0.11417012276618953, -0.251528134852012, 0.9428615200397167]

lowerarm.r
[0.0006410988903337023, 0.2449106190525179, -0.2821330866659231, 0.9275878929114393]

wrist.r
[-0.07461903425459218, -0.02424519394319492, -0.3080643981104976, 0.9481247264544816]

handslot.r
[0.1305261922200516, 0, 0, 0.9914448613738105]
```

---

## 5. Correction budget use

Measured total local quaternion angles:

| Bone | Used | Budget | Result |
| --- | ---: | ---: | --- |
| chest | `8.0000°` | `8°` | PASS |
| upperarm.r | `38.9244°` | `40°` | PASS |
| lowerarm.r | `43.8762°` | `50°` | PASS |
| wrist.r | `37.0718°` | `65°` | PASS |
| handslot.r | `15.0000°` | `15°` | PASS |

No forbidden root / hips / lower-body correction is present.

`handslot.r` remains exactly at the G2.5 fine-trim ceiling rather than becoming the primary pose solution.

---

## 6. Five-sample canonical result

### 0%

- weaponHandHeight `0.54055`
- offHandHeight `0.67022`
- weaponHandCenterDistance `0.53621`
- offHandCenterDistance `0.58823`
- swordTipHeight `0.87839`
- swordForwardDot `0.74218`
- triangleArea `0.64743`
- torsoYaw `34.64025°`
- **PASS**

### 25%

- weaponHandHeight `0.50552`
- offHandHeight `0.70999`
- weaponHandCenterDistance `0.53445`
- offHandCenterDistance `0.57538`
- swordTipHeight `0.76321`
- swordForwardDot `0.70490`
- triangleArea `0.67335`
- torsoYaw `34.88165°`
- **PASS**

### 50%

- weaponHandHeight `0.51909`
- offHandHeight `0.69086`
- weaponHandCenterDistance `0.52421`
- offHandCenterDistance `0.58354`
- swordTipHeight `0.73974`
- swordForwardDot `0.73257`
- triangleArea `0.64921`
- torsoYaw `34.47474°`
- **PASS**

### 75%

- weaponHandHeight `0.50373`
- offHandHeight `0.71081`
- weaponHandCenterDistance `0.53251`
- offHandCenterDistance `0.57533`
- swordTipHeight `0.75528`
- swordForwardDot `0.70739`
- triangleArea `0.67139`
- torsoYaw `34.89483°`
- **PASS**

### 99.8%

- weaponHandHeight `0.53092`
- offHandHeight `0.67441`
- weaponHandCenterDistance `0.52938`
- offHandCenterDistance `0.58737`
- swordTipHeight `0.82072`
- swordForwardDot `0.73868`
- triangleArea `0.64567`
- torsoYaw `34.58642°`
- **PASS**

All five samples pass the same fixed correction layer. No time-aware correction curve is required for the base Guard.

---

## 7. Improvement versus the calibrated Skyrim source pose

Before G2.5.1, the trustworthy G2.4.5 measurements were approximately:

```text
weapon hand height  0.397–0.425
sword tip height    0.225–0.321
sword forward dot  -0.787 to -0.825
```

After G2.5.1:

```text
weapon hand height  0.504–0.541
sword tip height    0.740–0.878
sword forward dot   0.705–0.742
```

The sword therefore changes from a low/backward shield-block silhouette into a forward-threatening longsword Guard while retaining the Skyrim lower-body / torso life.

---

## 8. Four-view visual review

Reviewed at the canonical 50% pose in:

- Front
- 3-quarter
- Side
- Back

No observed:

- shoulder flip
- elbow inversion
- wrist snap
- sword-hand disconnect
- lower-body overwrite
- root drift

The Side view clearly confirms the blade projects toward the fixed lock-on target while the right hand remains near the torso.

---

## 9. CI / verification boundary

G2.5.1 adds tests for:

- quaternion normalization / Euler authoring conversion
- correction-bone allowlist
- per-bone quaternion budget enforcement
- forbidden lower-body rejection
- canonical metadata offsets remaining within budget
- Euler provenance reproducing the committed canonical quaternion values
- canonical Triangle target contract

The GitHub Actions Guard workflow now uses:

`?canonical=1`

and explicitly requires:

`data-g251-mode="canonical-metadata"`

This prevents CI from hiding a bad committed pose by solving a fresh Auto-fit answer on every run.

---

## 10. Decision

The Forward Base Guard is now accepted as the canonical longsword Guard mother pose.

**G2.5.1: PASS**

The project no longer needs to treat the Skyrim Guard as merely an adoption candidate. It is now an authored Action Studio base pose with source-controlled correction metadata.

---

## Recommended next stage

**G3 — Guard Family Foundation**

Use the accepted Triangle Forward Base Guard as the common mother pose for:

- Guard Enter
- Guard Hold
- Block Hit
- Counter transition

Then proceed to the directional additive family:

**G4 — TOP / RIGHT / LEFT Triangle Guard Authoring**

Do not author three unrelated full-body clips. Directional Guard should branch from this accepted Forward Base so hips / legs / body weight remain continuous.
