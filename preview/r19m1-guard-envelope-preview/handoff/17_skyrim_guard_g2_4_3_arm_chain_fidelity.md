# G2.4.3 — Skyrim Arm Chain / Wrist Fidelity Retarget

## Status

**ARM CHAIN RETARGET: PASS**

This stage fixes the remaining weapon-arm distortion after G2.4 root-motion correctness and G2.4.2 global coordinate-basis calibration.

It does **not** claim that the authored Skyrim pose is already the final Triangle Guard design. The canonical source is still `shd_blockidle`, a shield-oriented Skyrim block idle, so source-pose suitability remains a separate visual/design decision.

## Root cause

The remaining distortion was not explained by a missing global 90-degree axis correction.

The canonical source and target have very different per-bone rest directions. For example, after global basis conversion, the Skyrim right upper-arm rest direction still does not align with the KayKit right upper-arm rest direction. Applying only a world-space quaternion delta therefore preserves rotational change but does not guarantee that:

- shoulder → elbow
- elbow → wrist

point in the same directions as the source animation.

This is why the old target weapon arm could be displaced far to the side even though the global torso basis was already correct.

## Canonical Skyrim arm hierarchy findings

The real GLB contains the expected FK chain:

`R Clavicle → R UpperArm → R Forearm → R Hand → Weapon`

and the left-side equivalent ending at `Shield`.

The source also contains:

- UpperarmTwist1 / UpperarmTwist2
- ForearmTwist1 / ForearmTwist2

These twist bones are sibling deformation helpers. They are **not** ancestors of Skyrim Hand / Weapon. The current Action Studio Blockman appearance is a rigid line/joint rig rather than a skinned mesh, so blindly applying the twist helpers again would double-apply deformation roll without improving the FK endpoint geometry.

G2.4.3 therefore uses the source world-space joint directions for rigid limb alignment and records twist-helper coverage without adding a second twist rotation to the target line limbs.

## Implementation

### 1. Full 23-target KayKit retarget coverage

The Skyrim retarget map now covers all canonical target bones used by the procedural rig:

- root / hips / spine / chest / head
- upperarm / lowerarm / wrist / hand / handslot on both sides
- upperleg / lowerleg / foot / toes on both sides

New fidelity mappings include:

- `NPC L Hand [LHnd]` → `hand.l`
- `NPC R Hand [RHnd]` → `hand.r`
- `Shield` → `handslot.l`
- `Weapon` → `handslot.r`

The previous adapter stopped at Skyrim Hand → target wrist and left target hand / handslot at rest. That meant the actual `HAND_R` sword socket never received the authored Skyrim Weapon-helper rotation.

### 2. Direction-constrained arm FK

For each retarget sample, the normal quaternion-delta transfer is still computed first so rotational/roll information is retained.

Then the rigid limb is minimally corrected so its target child direction matches the actual Skyrim joint direction after global basis conversion:

- target `upperarm.* → lowerarm.*` matches source `UpperArm → Forearm`
- target `lowerarm.* → wrist.*` matches source `Forearm → Hand`

The correction is the shortest quaternion from the predicted target segment direction to the converted source segment direction. This preserves as much of the transferred roll as possible while guaranteeing endpoint-direction fidelity.

### 3. Clavicle policy

The target rig has no separate clavicle bones.

Clavicle motion is folded implicitly through the animated Skyrim world joint positions used by the direction constraints. The canonical block-idle clavicle motion is small, so a separate target clavicle degree of freedom is not required for this rigid Blockman prototype.

### 4. Twist policy

Twist helpers are detected and reported, but not double-applied to the rigid line limbs:

`deformation-only-sibling-helpers-not-double-applied-to-rigid-block-limbs`

If the project later adopts a skinned arm mesh, twist distribution should become a mesh-deformation stage rather than being baked into this rigid FK adapter.

## Canonical verification

A new headless browser gate runs the real canonical GLB through the runtime retargeter:

`tools/action-studio/skyrim-arm-chain-verification.html`

`tools/action-studio/skyrim-arm-chain-verification.js`

The GitHub Actions workflow now requires:

- G2.4.2 global basis gate PASS
- G2.4.3 arm-chain gate PASS
- G2.4.1 full-stream in-place / loop gate PASS
- final timeline and multi-view screenshot capture

### 1201-frame arm-direction result

All four constrained arm segments are effectively exact within floating-point precision:

- left upper arm max error: `0.00000209°`
- left lower arm max error: `0.00001093°`
- right upper arm max error: `0.00000209°`
- right lower arm max error: `0.00000171°`
- overall max direction error: `0.00001093°`

Acceptance limit: `1.0°`.

### Target topology result

At 0 / 25 / 50 / 75 / 99.8%:

- upper-arm length stays `0.24190`
- lower-arm length stays `0.26004`
- wrist → hand length stays `0.07383`
- no arm collapse or stretch occurs

### Hand / equipment helper result

Required target tracks are present:

- `handl.quaternion`
- `handslotl.quaternion`
- `handr.quaternion`
- `handslotr.quaternion`

`Weapon → handslot.r` is active, so the authored Skyrim weapon-helper rotation now reaches the actual KayKit `HAND_R` equipment chain.

## Visual result

Before G2.4.3, the weapon arm and sword were displaced far to the side of the Blockman.

After G2.4.3:

- the shoulder / elbow / wrist chain stays attached to the body silhouette
- the sword follows the right-hand socket rather than appearing as a detached sideward chain
- the pose remains stable through the complete 40-second clip

The remaining low-sword / shield-side silhouette is no longer evidence of an arm-axis retarget failure. It is consistent with the authored shield-oriented `shd_blockidle` source and needs a source-vs-target pose review before an adoption decision.

## Validation

Latest G2.4.3 implementation validation:

- CI: PASS
- Build Action Studio: PASS
- unit / contract tests: PASS
- G2.4.2 coordinate basis: PASS
- G2.4.3 arm chain / wrist gate: PASS
- G2.4.1 runtime stability / loop: PASS
- canonical timeline screenshots: generated successfully

## Remaining boundaries

1. `shd_blockidle` source-pose suitability is still a design question; technical retarget fidelity does not automatically make it the desired Triangle Guard.
2. Source `Weapon` animated translation is not yet transferred to target handslot position. Its canonical magnitude is small after Skyrim→KayKit scale conversion; rotation is the dominant socket correction in this probe.
3. The canonical GLB duplicate `NPC Root [Root]` exporter wrapper should still be disambiguated before locomotion-heavy Skyrim clips are adopted.
4. Finger animation remains intentionally omitted because the current procedural Blockman hand is not a finger-rigged skinned hand.

## Recommended next gate

**G2.4.4 — Canonical Source ↔ Target Pose Equivalence & Guard Adoption Review**

The next review should compare the real Skyrim source joint silhouette and the retargeted Blockman at the same timestamps. The goal is to determine whether any remaining visual concern is:

- a retarget defect that still requires correction, or
- faithfully preserved source animation that simply does not match the desired Triangle Forward Guard.

Only after that separation should `shd_blockidle` be marked ADOPT / ADOPT WITH CORRECTIONS / REJECT for the final Guard family.
