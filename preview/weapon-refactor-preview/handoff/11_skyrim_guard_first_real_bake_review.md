# G2.3 — First Real Bake + Visual Guard Review

## Goal

Produce the first **real** visual result from `shd_blockidle.hkx` and decide whether the authored motion is worth adopting as the Longsword Guard Hold base.

The target remains the Action Studio procedural Blockman rig.

```text
shd_blockidle.hkx
+ Skyrim LE humanoid skeleton.hkx
        ↓
offline HKX import / decode
        ↓
self-contained source GLB
shd_blockidle.source.glb
        ↓
G2.1/G2.2 runtime retarget
        ↓
SKYRIM_GUARD/shd_blockidle
        ↓
G2.3 Visual Review Lab
        ↓
ADOPT / ADOPT WITH CORRECTIONS / REJECT
```

## Why `skeleton.hkx` is still required

The Action Studio rig is the target skeleton, but the source animation still needs its Skyrim skeleton while decoding. The animation pack stores transform tracks by source bone order and does not provide the complete semantic rest skeleton needed for a trustworthy retarget.

Do **not** approximate the source rest pose from the Blockman rig. A guessed source pose would invalidate the visual review.

## Recommended offline bake path

Use a current Blender + PyNifly workflow capable of importing Skyrim LE 32-bit HKX natively.

1. Set Blender scene FPS to `30`.
2. Import the Skyrim LE humanoid `skeleton.hkx` first.
3. Keep bone renaming consistent between skeleton and animation. Either original Skyrim names or PyNifly Blender-friendly names are acceptable; the G2.1 resolver supports exporter aliases and GLB-sanitized names.
4. With the imported armature active, import the supplied `shd_blockidle.hkx`.
5. Do not retarget to Action Studio in Blender. The Blender result is only a **source hierarchy + source action** bridge.
6. Export one self-contained GLB containing the source armature and the `shd_blockidle` action.
7. Name it `shd_blockidle.source.glb`.
8. Keep unreviewed GLBs local during the probe. The validated `shd_blockidle.source.glb` is the single tracked exception to `assets/skyrim/guard/converted/*.glb`.
9. Open `tools/action-studio/skyrim-guard-visual-review.html` over local HTTP and choose **Import shd_blockidle.source.glb**.

## Source GLB contract

Required:

- Skyrim source hierarchy is present.
- At least one animation is present.
- Animation duration is preserved.
- Source bone names remain recoverable through canonical names or aliases.
- No Action Studio / Blockman rebake has happened yet.
- No mesh is required.

Canonical result after the repository bridge:

```text
source: skyrim
clipId: SKYRIM_GUARD/shd_blockidle
retargetFps: 30
```

## Visual Review Lab

Entry:

```text
tools/action-studio/skyrim-guard-visual-review.html
```

Capabilities:

- local converted GLB import
- real-time retarget to the procedural Blockman rig
- real procedural longsword mounted on `HAND_R`
- Once / Loop preview
- timeline scrub and start/end freeze
- Front / 3-quarter / Side / Back camera presets
- mouse orbit
- automatic start/end loop-seam measurement
- five explicit visual gates
- automatic final decision label

## Automatic loop-seam metric

The review samples animation start and the final pre-end sample without in-place stripping.

It compares:

- maximum world rotation delta across major torso/arm/leg target bones
- `root` world translation delta
- `hips` world translation delta

Engineering classification:

```text
GOOD
max major-bone rotation <= 4 deg
max(root, pelvis translation) <= 0.03

WARNING
max major-bone rotation <= 10 deg
max(root, pelvis translation) <= 0.08

BAD
anything larger
```

These thresholds are review aids, not gameplay authority. Visual popping still overrides the metric.

## Five visual gates

### 1. Pelvis / foot weight

PASS when the lower body reads planted, balanced and combat-ready.

CORRECT when only small stance or foot corrections are needed.

FAIL when the authored weight transfer is fundamentally unsuitable for a standing longsword guard.

### 2. Torso combat stance

PASS when hips/chest create a compact guarded fighting silhouette.

CORRECT when small chest/spine offsets can fix openness or lean.

FAIL when the full-body source reads passive, theatrical or structurally wrong for our combat language.

### 3. Sword-arm usability

PASS when the right shoulder/elbow/wrist can carry the procedural longsword naturally.

CORRECT when local arm/wrist offsets are enough.

FAIL when the arm chain requires major full-body reconstruction.

### 4. Off-hand correction cost

The source is expected to be shield-oriented.

PASS when the left arm already sits in a useful compact guard region.

CORRECT when a local upper-arm / forearm / wrist additive layer can turn it into our free-hand Triangle Guard.

FAIL only when fixing the left side would require destroying the authored torso/weight motion.

### 5. Loop seam / popping

PASS when authored looping is clean.

CORRECT when a small blend/freeze/breathing treatment is sufficient.

FAIL when the clip cannot act as a stable persistent Guard Hold without obvious popping or locomotion drift.

## Decision logic

```text
all PASS
→ ADOPT

no FAIL + at least one CORRECT
→ ADOPT WITH CORRECTIONS

any FAIL
→ REJECT

incomplete ratings
→ PENDING
```

## Current completion boundary

The real 30 fps source bake now exists locally, passes the repository validator, and retargets through G2.1 to the canonical Action Studio Blockman rig. See `13_skyrim_guard_g2_3_2_execution_record.md` for the reproducible evidence.

The final visual decision remains `PENDING`: the in-app browser execution runtime fails before browser startup on the review machine, so the required multi-view playback, freeze, loop, and scrub inspection has not been truthfully performed. No visual gate has been inferred from numerical seam metrics alone.
