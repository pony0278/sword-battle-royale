# G2.1 — Skyrim → Action Studio Retarget Adapter

## 1. Status

Implemented on the Skyrim guard probe branch.

G2.1 deliberately does **not** decode raw HKX in the browser. It establishes the stable boundary between any offline HKX decoder/converter and the canonical Action Studio procedural humanoid rig.

```text
raw Skyrim HKX
      ↓
HKX decoder / converter (tool-specific)
      ↓
normalized decoded source
{ root/scene, clip/animations }
      ↓
Skyrim retarget adapter (G2.1)
      ↓
THREE.AnimationClip targeting Action Studio bones
      ↓
existing ActionMotionPlayer / AnimationMixer
```

The target skeleton is always the Action Studio Blockman rig.

The Skyrim skeleton is only a source-side dictionary/rest-pose dependency needed by the decoder/converter when the HKX transform tracks do not carry enough semantic bone information by themselves.

---

## 2. Runtime output

The adapter emits a normal Three.js `AnimationClip` whose tracks target the same canonical bone names already used by KayKit/UAL assets.

Example output clip id for G2:

```text
SKYRIM_GUARD/shd_blockidle
```

Expected target tracks include:

```text
root.quaternion
root.position
hips.quaternion
hips.position
spine.quaternion
chest.quaternion
head.quaternion
upperarm.l.quaternion
lowerarm.l.quaternion
wrist.l.quaternion
upperarm.r.quaternion
lowerarm.r.quaternion
wrist.r.quaternion
upperleg.l.quaternion
lowerleg.l.quaternion
foot.l.quaternion
toes.l.quaternion
upperleg.r.quaternion
lowerleg.r.quaternion
foot.r.quaternion
toes.r.quaternion
```

`inPlace` playback remains an Action Studio/runtime concern; the existing animation controller can strip `root.position` when an animation is played in-place.

---

## 3. Canonical target rig

G2.1 maps Skyrim humanoid semantics into the existing Action Studio rig:

```text
Skyrim source                         Action Studio target
-----------------------------------------------------------
NPC Root [Root]                    → root
NPC Pelvis [Pelv]                  → hips
NPC Spine [Spn0]                   → spine
NPC Spine2 [Spn2]                  → chest
NPC Head [Head]                    → head
NPC L UpperArm [LUar]              → upperarm.l
NPC L Forearm [LLar]               → lowerarm.l
NPC L Hand [LHnd]                  → wrist.l
NPC R UpperArm [RUar]              → upperarm.r
NPC R Forearm [RLar]               → lowerarm.r
NPC R Hand [RHnd]                  → wrist.r
NPC L Thigh [LThg]                 → upperleg.l
NPC L Calf [LClf]                  → lowerleg.l
NPC L Foot [Lft ]                  → foot.l
NPC L Toe0 [LToe]                  → toes.l
NPC R Thigh [RThg]                 → upperleg.r
NPC R Calf [RClf]                  → lowerleg.r
NPC R Foot [Rft ]                  → foot.r
NPC R Toe0 [RToe]                  → toes.r
```

The adapter supports multiple aliases for each source semantic bone so different exporters are not required to preserve the exact bracketed Skyrim name.

---

## 4. Deliberate skeleton collapse

The Action Studio Blockman rig is intentionally simpler than a Skyrim actor skeleton.

G2.1 therefore does not require one-to-one mapping for every Skyrim helper bone.

Examples intentionally omitted in the first probe:

- `NPC COM [COM ]`
- `NPC Spine1 [Spn1]`
- neck helper(s)
- clavicle helper(s)
- twist bones
- weapon/shield equipment bones
- finger bones

Their parent-chain motion still contributes to the sampled **world-space transform** of mapped bones. The adapter then converts that world-space motion delta into the simpler Action Studio target hierarchy.

This is the same architectural idea used by the existing Quaternius → Action Studio retarget path: preserve the authored motion result, not the source rig topology.

If the first `shd_blockidle` visual probe shows unacceptable shoulder/chest artifacts, G2.2 may add explicit clavicle/spine collapse rules; the canonical target rig should not be expanded merely to imitate Skyrim.

---

## 5. Retarget math

For each sampled source frame (default 30 fps):

```text
source animated world rotation
× inverse(source rest world rotation)
= source world rotation delta

source world rotation delta
× target rest world rotation
= desired target world rotation

inverse(target parent world rotation)
× desired target world rotation
= baked target local quaternion
```

Root/pelvis translation uses the source rest displacement scaled by source/target character height.

The output is baked into target-local quaternion/position tracks, so the browser does not need the Skyrim skeleton at runtime.

---

## 6. Decoder contract

The next HKX layer may be implemented with hkxcmd, Blender/Havok tooling, or another converter. G2.1 is intentionally independent of that choice.

A decoder bridge only needs to provide one of these equivalent shapes:

```js
{
  root: sourceHierarchyRoot,
  clip: sourceAnimationClip,
}
```

or GLTF-like:

```js
{
  scene: sourceHierarchyRoot,
  animations: [sourceAnimationClip],
}
```

The hierarchy must expose named source nodes and the clip must animate those nodes through a Three.js-compatible animation runtime before G2.1 samples it.

The bridge must not rename nodes directly to Action Studio bone names. Source semantics should remain source semantics; G2.1 owns the mapping.

---

## 7. Asset boundary

Raw `.hkx` files remain outside the repository during the probe.

A converted/decoded intermediate may also remain local if redistribution permission is uncertain.

Only the final retargeted Action Studio animation asset should become a runtime candidate after visual and licensing review.

Attribution to the original animation creator must be preserved according to the supplied modification/conversion permission.

---

## 8. Tests added in G2.1

The test suite verifies:

- Skyrim is a supported external motion source.
- the Guard HKX family maps to stable runtime clip ids.
- 19 semantic Skyrim bones target 19 unique Action Studio bones.
- root and pelvis retain translation while limbs remain rotation-driven.
- canonical bracketed Skyrim names resolve.
- common simplified exporter aliases resolve.
- missing source bones report semantic names rather than exporter-specific strings.
- missing Action Studio target bones fail explicitly.

---

## 9. G2.1 completion criteria

G2.1 is complete when:

- `src/animation/skyrim-animation-retarget.js` exists.
- the target is the canonical Action Studio procedural rig.
- the adapter accepts decoder-independent normalized source input.
- the adapter outputs `THREE.AnimationClip` target tracks.
- alias resolution and rig validation are tested.
- Action Studio build and normal CI tests pass.

G2.1 does **not** require a visually playable HKX yet.

---

## 10. Next step — G2.2 Decoder Bridge + First `shd_blockidle` Bake

Next target:

```text
shd_blockidle.hkx
      ↓
real decoder/converter
      ↓
normalized source hierarchy + clip
      ↓
retargetSkyrimClip(...)
      ↓
SKYRIM_GUARD/shd_blockidle
      ↓
Action Studio Guard visual review
```

The first visual review determines whether Skyrim Guard becomes the authored Guard base or remains reference-only.
