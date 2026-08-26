# G2.4.1 — Canonical GLB Visual Playback Verification

## Status

**Overall visual acceptance: FAIL**

The G2.4 root-motion correction solved the original fly-away / translation instability, but the canonical Skyrim Guard pose is still visually invalid on the Action Studio Blockman rig.

This stage intentionally distinguishes **motion stability** from **pose correctness**. A numerically planted character is not considered visually accepted when the body / weapon orientation is wrong.

## Canonical input

- source: `assets/skyrim/guard/converted/shd_blockidle.source.glb`
- canonical clip: `SKYRIM_GUARD/shd_blockidle`
- duration: ~40.0 s
- retarget review rate: 30 fps
- target: Action Studio procedural Blockman / KayKit-compatible rig

## Automated runtime evidence

GitHub Actions workflow:

- workflow: `Skyrim Guard Visual Verification`
- run: `32089086714`
- artifact: `g2-4-1-skyrim-guard-visual`
- artifact id: `9307734291`

The workflow opens the real review page in headless Chrome, loads the repository canonical GLB, executes the real retarget path, samples the target rig with `inPlace:true`, and captures timeline / multi-view screenshots.

### Full-stream in-place result

1201 target-rig samples were measured across the complete clip.

- root max excursion: `0.0000`
- root limit: `0.0232`
- hips max excursion: `0.0145`
- hips limit: `0.4056`
- hips max frame step: `0.0007`
- hips step limit: `0.0927`
- stability result: **PASS**

This confirms the G2.4 translation fixes work: the character no longer flies away during playback.

### Loop seam result

- maximum major-bone start/end rotation difference: ~`0.59°`
- root translation seam: `0.0000`
- pelvis translation seam: ~`0.0002`
- loop metric: **GOOD**

## Visual review result

Screenshots were captured at approximately:

- 0%
- 25%
- 50%
- 75%
- 99.8%

The 50% sample was also captured from Front / 3-quarter / Side / Back views.

Across these views, the retargeted pose is not a usable standing Guard:

- the upper-body / weapon chain is oriented incorrectly relative to the target rig
- the longsword and weapon arm appear nearly horizontal / displaced relative to the expected standing Blockman silhouette
- the pose remains consistently wrong at multiple clip times, so this is not a one-frame interpolation glitch
- changing camera direction confirms the geometry itself is mis-oriented; this is not a camera-only presentation issue

Therefore G2.4.1 must **not** be recorded as ADOPT or ADOPT WITH CORRECTIONS yet.

## Root cause conclusion

The evidence strongly confirms the previously suspected coordinate-basis problem.

Current `retargetSkyrimClip()` computes source world-space rotation deltas and applies them directly to target world-space rest quaternions. There is no explicit Skyrim-source-basis → Action-Studio-basis conversion.

The canonical source skeleton and the target Blockman rig use materially different anatomical axis conventions. Translation scaling is now correct, but raw world quaternion deltas are still being transferred through incompatible bases.

The next correction must treat basis conversion explicitly rather than adding arbitrary per-bone visual offsets.

## G2.4.2 — Skyrim Coordinate Basis Calibration

Recommended next stage:

1. measure canonical source basis using stable anatomical vectors such as root→head, left↔right hips/arms, and forward-facing reference nodes
2. measure the equivalent target Blockman basis
3. derive one source→target basis quaternion / matrix `C`
4. transform source rotation deltas using basis conjugation:
   - `q_target_delta = C * q_source_delta * inverse(C)`
5. transform root-motion vectors through the same basis before target scaling
6. rerun the canonical 1201-frame stability probe
7. regenerate the 0/25/50/75/99.8% and Front/3-quarter/Side/Back evidence
8. only after the global basis is correct, evaluate local clavicle / twist / hand fidelity

## Acceptance rule after G2.4.2

A passing result requires both categories:

### Motion correctness
- no fly-away
- no frame teleport
- stable loop seam
- in-place root remains planted

### Pose correctness
- standing body orientation remains upright
- pelvis / torso / head chain reads correctly
- weapon arm and sword are oriented as a plausible Guard
- Front / 3-quarter / Side / Back views are anatomically coherent

Until both categories pass, the Skyrim Guard source remains **not adopted**.
