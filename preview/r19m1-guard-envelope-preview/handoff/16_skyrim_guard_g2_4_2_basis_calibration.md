# G2.4.2 — Skyrim Coordinate Basis Calibration

## Status

**GLOBAL BASIS: PASS**

This stage calibrates the coordinate basis between the real Skyrim source skeleton and the Action Studio procedural KayKit target rig. It does **not** claim that wrist, hand, weapon, twist-bone, or clavicle fidelity is finished.

## Why this stage was required

G2.4 fixed translation scale and root/pelvis motion duplication. G2.4.1 then proved that the character no longer flies away, but the visual review exposed a remaining source/target orientation mismatch.

The old retarget path directly applied a Skyrim world-space rotation delta to the Action Studio target world space:

`q_target = q_source_delta * q_target_rest`

That assumes both skeletons use the same humanoid basis. The canonical source GLB disproves that assumption.

## Canonical source evidence

The validator-approved source remains:

`assets/skyrim/guard/converted/shd_blockidle.source.glb`

Direct GLB inspection confirms:

- glTF 2.0 self-contained binary
- one `shd_blockidle` animation
- 198 animation channels / 99 animated nodes
- coherent Skyrim humanoid hierarchy throughout the 40 second clip
- source anatomical up is approximately **+Z**
- source upper-arm left/right span is primarily along X
- source pose remains a coherent standing humanoid at sampled times 0 / 10 / 20 / 30 seconds

Therefore G2.4.2 keeps the HKX → GLB bake as canonical and fixes the retarget stage instead of reconverting the source.

## Calibration strategy

The retargeter now derives a humanoid basis from each rest skeleton instead of hard-coding a guessed 90 degree axis swap.

For both source and target:

1. **Up** = normalized pelvis → head
2. **Right/lateral** = left upper arm → right upper arm, projected perpendicular to Up
3. **Forward** = Right × Up
4. Re-orthogonalize Up

The source-to-target basis quaternion is then:

`C = Q_target_basis * inverse(Q_source_basis)`

Source rotation deltas are converted by quaternion conjugation:

`q_target_delta = C * q_source_delta * inverse(C)`

Root and pelvis motion vectors use the same basis so rotation and translation do not disagree about axes.

The measured basis is stored in `clip.userData.basisCalibration` for diagnostics, including source/target axes, quaternion, and calibration angle.

## Why the measured angle can be near 180 degrees

The source and target skeletons do not only disagree on which axis is vertical. Their left/right naming versus world-X direction also differs:

- canonical Skyrim source: L upper arm is on negative X, R upper arm on positive X
- Action Studio KayKit target: L upper arm is on positive X, R upper arm on negative X

A proper rotation that aligns both Up and semantic left/right can therefore be close to 180 degrees. This is expected from the actual rest skeletons and is safer than assuming a fixed `Z-up → Y-up` 90 degree conversion.

## Automatic G2.4.2 gate

Added:

- `tools/action-studio/skyrim-basis-verification.html`
- `tools/action-studio/skyrim-basis-verification.js`
- `Verify G2.4.2 coordinate basis` step in `.github/workflows/skyrim-guard-visual.yml`

The canonical GLB is retargeted in headless Chrome and sampled at:

- 0%
- 25%
- 50%
- 75%
- 99.8%

Each sample must preserve a coherent standing topology:

- torso verticality >= 0.85
- head horizontal offset / torso length <= 0.53
- chest above hips by >= 0.25 target units
- both feet below hips by >= 0.12 target units

The new G2.4.2 gate passes on the canonical source.

## Current engineering conclusion

G2.4.2 resolves the **global humanoid coordinate-basis problem**.

Local diagnostic comparison also shows the largest remaining disagreement is concentrated in the lower-arm / wrist / sword chain rather than the torso/head/global skeleton. That matches the known information-loss boundary of projecting a 99-node Skyrim animation onto only 19 semantic target bones.

## Important remaining fidelity boundary

G2.4.2 intentionally does not mark the Guard source as fully adopted yet.

The current mapping still omits or compresses important Skyrim detail such as:

- clavicle contribution
- upper-arm twist
- forearm twist
- hand/finger orientation
- weapon/shield helper nodes
- direct target `hand.l` / `hand.r` animation

The current adapter maps Skyrim Hand directly to target wrist, leaving the target hand chain largely at rest. This is especially visible because the longsword is mounted downstream of that chain.

## Exporter duplicate-root note

The canonical GLB contains two nodes named `NPC Root [Root]`:

- an outer exporter wrapper
- the inner animated Skyrim root

The animation channels target the inner node. Current Guard Hold has negligible root locomotion, so this does not invalidate the G2.4.2 standing-basis result, but resolver disambiguation should be hardened before using Skyrim clips with meaningful root motion.

## Next stage

**G2.4.3 — Skyrim Arm Chain / Wrist Fidelity Retarget**

Recommended scope:

1. clavicle-aware shoulder transfer
2. preserve or fold upper-arm / forearm twist into the Blockman arm chain
3. define deliberate Skyrim Hand → target wrist + hand distribution
4. review HAND_R / sword socket orientation
5. add arm-chain direction metrics beside the existing standing-basis gate
6. rerun Front / 3-quarter / Side / Back screenshots and the full 1201-frame stability probe

Do not merge PR #13 solely because the G2.4.2 global basis gate passes. The next acceptance question is whether the weapon arm and sword silhouette are visually usable as a Guard base.
