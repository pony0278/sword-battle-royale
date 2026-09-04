# G2.5 — Skyrim Guard Adoption Decision & Triangle Correction Plan

## Status

**LOW-LEVEL RETARGET PIPELINE: ACCEPTED / FROZEN**  
**CANONICAL GUARD SOURCE: ADOPT WITH CORRECTIONS**  
**TRIANGLE CORRECTION CONTRACT: DEFINED**  
**G2.5.1 FOLLOW-UP: COMPLETED / CANONICAL OFFSETS AUTHORED**

Canonical source:

`assets/skyrim/guard/converted/shd_blockidle.source.glb`

Canonical runtime clip:

`SKYRIM_GUARD/shd_blockidle`

Correction contract:

`src/combat/longsword-guard-metadata.js`

> Historical note: G2.5 intentionally defined the correction boundary before any quaternion values were authored. G2.5.1 has now completed that authoring step; see `21_skyrim_guard_g2_5_1_triangle_forward_authoring.md` for the accepted offsets and five-sample/four-view evidence.

---

## 1. Final adoption decision

G2.4 through G2.4.5 established that the remaining Guard silhouette problem is not a technical retarget failure.

Accepted technical evidence:

- root / pelvis translation correctness: PASS
- canonical 40 s GLB playback stability: PASS
- Skyrim → Action Studio coordinate basis: PASS
- complete KayKit arm-chain / wrist retarget fidelity: PASS
- weapon helper ↔ KayKit sword socket bind calibration: GOOD
- calibrated weapon-frame max error: `0.004103°`
- full Guard visual workflow: PASS

Therefore `shd_blockidle` is frozen as:

**ADOPT WITH CORRECTIONS**

Reason:

`retarget-is-usable-but-triangle-guard-needs-local-corrections`

G2.5 explicitly forbids reopening the HKX decoder, translation scale, humanoid basis, arm FK, or G2.4.5 weapon bind merely to make the Guard look prettier.

---

## 2. What is good in the Skyrim source and must be preserved

The calibrated G2.4.5 review shows that these authored properties are already useful:

- hips / legs weight and planted stance
- body micro-motion
- torso side angle around `35.77–36.11°`
- off-hand height around `0.715–0.753` torso heights
- compact weapon/off-hand center distances around `0.565–0.591`
- a usable hand triangle rather than an open-chest pose
- stable loop / no fly-away

G2.5 treats these as **source assets to preserve**, not values to redesign from zero.

---

## 3. The three actual correction targets

After G2.4.5, the trustworthy canonical samples consistently fail only these Triangle Forward requirements:

1. `weaponHandHeight`
   - measured roughly `0.397–0.425`
   - sword hand is slightly too low
2. `swordTipHeight`
   - measured roughly `0.225–0.321`
   - blade tip is much too low
3. `swordForwardDot`
   - measured roughly `-0.787 to -0.825`
   - blade points substantially away from the intended lock-on threat direction

This is the exact correction scope. G2.5 must not turn a three-variable silhouette correction into a full-body re-authoring project.

---

## 4. Canonical Triangle Forward target contract

All normalized values use the same torso-height convention as the Guard review.

| Metric | G2.5 target | Intent |
| --- | ---: | --- |
| weapon-hand height | `0.50–0.75` | sternum / upper-chest combat position |
| off-hand height | `0.55–0.85` | preserve active free hand near centerline |
| weapon-hand center distance | `≤ 0.58` | keep right elbow / armpit compact |
| off-hand center distance | `≤ 0.62` | avoid opening the left side |
| sword-tip height | `0.70–1.10` | upper-chest to face threat region |
| sword-forward dot | `≥ 0.65` | blade clearly threatens lock-on target |
| triangle area | `≥ 0.035` | visible wedge; no maximum because blade length naturally enlarges area |
| torso yaw | `20–38°` | preserve useful side-on body language |

G2.5.1 real authoring corrected one metric definition from the original planning draft: `triangleArea` has no production maximum. A long blade aimed upward/forward can create a large geometric triangle even while both hands remain compact. Chest openness is constrained by the two hand-center-distance gates, not by a triangle-area ceiling.

---

## 5. Correction layer architecture

The G2.5 correction is an **additive local quaternion layer applied after Skyrim humanoid retargeting**.

```text
canonical Skyrim shd_blockidle
        ↓
G2.4 accepted humanoid retarget
        ↓
G2.5 local upper-body Guard correction
        ↓
right-hand / sword-tip target geometry
        ↓
G2.4.5 weapon bind calibration
        ↓
optional tiny handslot.r equipment trim
        ↓
procedural longsword model-space mount
        ↓
Triangle Guard validation
```

The correction must not be baked back into the raw source GLB and must not modify the canonical retarget math.

---

## 6. Bone scope

Required correction bones:

```text
upperarm.r
lowerarm.r
wrist.r
```

Optional bones:

```text
chest
upperarm.l
lowerarm.l
wrist.l
handslot.r
```

Forbidden bones:

```text
root
hips
upperleg.l / upperleg.r
lowerleg.l / lowerleg.r
foot.l / foot.r
toes.l / toes.r
```

`handslot.r` remains fine trim only after the arm/wrist pose is physically believable.

---

## 7. Correction magnitude budget

| Bone | Max local correction budget |
| --- | ---: |
| chest | `8°` |
| upperarm.r | `40°` |
| lowerarm.r | `50°` |
| wrist.r | `65°` |
| upperarm.l | `20°` |
| lowerarm.l | `25°` |
| wrist.l | `30°` |
| handslot.r | `15°` |

A large equipment-only rotation is not allowed to hide an implausible wrist/arm pose.

---

## 8. Lock-on sword threat definition

```text
bladeDirection = normalize(swordTipWorld - swordGripWorld)
threatDirection = normalize(lockOnTargetAimWorld - swordGripWorld)
swordForwardDot = dot(bladeDirection, threatDirection)
```

The authoring gate is target-relative, not camera-relative.

---

## 9. G2.5.1 completion

G2.5.1 has now authored and accepted the Forward Base Guard.

Canonical correction bones used:

```text
chest
upperarm.r
lowerarm.r
wrist.r
handslot.r
```

No left-arm or lower-body correction was needed.

The same fixed offsets pass all five canonical samples and the four-view visual review. Canonical values are stored in `LONGSWORD_GUARD_AUTHORING_STATE` with:

```text
authored = true
authoredStage = G2.5.1
```

See handoff 21 for exact quaternion values and measurements.

---

## 10. G2.5 conclusion

The engineering and authoring questions are now both closed for the Forward Base:

> Can Skyrim `shd_blockidle` serve as the Action Studio longsword Guard mother pose?

**Yes.**

The source is adopted with a source-controlled additive correction layer, while Skyrim body weight / lower-body motion remain preserved.

---

## Next stage

**G3 — Guard Family Foundation**

Build Guard Enter / Hold / Block Hit / Counter presentation around the accepted Forward Base, then proceed to:

**G4 — TOP / RIGHT / LEFT Triangle Guard Authoring**
