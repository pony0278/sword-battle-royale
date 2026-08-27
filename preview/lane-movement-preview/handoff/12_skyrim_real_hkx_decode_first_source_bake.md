# G2.3.1 — Real HKX Decode / First Source Bake

## Goal

Produce the first **truthful** Skyrim source animation asset for Action Studio:

```text
skeleton.hkx + shd_blockidle.hkx
        ↓ Skyrim LE Havok decoder / authoring tool
Skyrim source armature + shd_blockidle action
        ↓ glTF 2.0 Binary export
shd_blockidle.source.glb
        ↓ G2.1/G2.2 runtime retarget
SKYRIM_GUARD/shd_blockidle
        ↓
G2.3 Visual Guard Review Lab
```

The Blender/converter step must preserve the **Skyrim source hierarchy and source animation**. Do **not** retarget to the Action Studio Blockman rig in Blender; G2.1 owns that transformation.

---

## Real input evidence

The current user-supplied pair has passed the repository-side G2.3.1 input gate.

### Skeleton

```text
file: skeleton.hkx
size: 74048 bytes
sha256: 16a91abddbdcf4760e922a30f62ac5b1ee053e8ff904fc13470f7b5d52e5b04d
Havok: hk_2010.2.0-r1
class: hkaSkeleton
required semantic bones: 19 / 19 present
```

### Animation

```text
file: shd_blockidle.hkx
size: 25136 bytes
sha256: 52cfff4846a0f43fe4246e5e6afcb38b0c1ef54ca5e944dce6167404630e22f2
Havok: hk_2010.2.0-r1
animation: hkaSplineCompressedAnimation
binding: hkaAnimationBinding
```

The reproducible record is stored at:

```text
tools/skyrim-hkx-bridge/g2-3-1-input-manifest.json
```

Validate a local pair with:

```bash
npm run validate:skyrim-bake-pair -- path/to/skeleton.hkx path/to/shd_blockidle.hkx
```

A successful result must report:

```text
acceptedForRealBake: true
sameHavokGeneration: true
semanticBoneCount: 19
semanticBoneTotal: 19
```

This proves the pair is a strong compatible Skyrim LE source candidate. The final track-order/rest-pose match is proven only when a real Havok decoder successfully binds the animation to this skeleton.

---

## Preferred real decode workflow — Blender + PyNifly

PyNifly's Skyrim animation workflow requires the matching skeleton to exist before the animation is imported because the animation HKX stores an anonymous bone list and relies on skeleton bone order/reference pose.

1. Open a Blender version supported by the installed PyNifly build.
2. Set the scene to **30 fps**.
3. Use **File → Import → HKX Skeleton** and load the supplied `skeleton.hkx`.
4. Select/activate the imported Skyrim armature.
5. Use **File → Import → HKX Animation** and load `shd_blockidle.hkx`.
6. Verify the source NPC bones visibly animate and the importer reports no binding/skeleton mismatch.
7. Keep the Skyrim source armature selected and export **glTF 2.0 Binary (.glb)** with animation enabled.
8. Export one self-contained binary file named:

```text
shd_blockidle.source.glb
```

9. Preserve source bone names whenever possible. Blender/glTF punctuation sanitization is acceptable because G2.1 handles normalized aliases.
10. Do not bake the Action Studio Blockman rig inside Blender.

Unreviewed GLBs should stay local during the probe. The validated `shd_blockidle.source.glb` is the single tracked exception to `assets/skyrim/guard/converted/*.glb`.

---

## hkxcmd fallback

`hkxcmd` supports Skyrim-era Havok and can export animation data to Gamebryo KF. A fallback flow can begin with an equivalent of:

```text
hkxcmd exportkf shd_blockidle.hkx <output-directory>
```

with the matching `skeleton.hkx` supplied through hkxcmd's skeleton option when required.

This is only a fallback because KF still needs a reliable import/export step before the repository receives the source GLB. Do not bypass the source hierarchy/rest-pose requirement.

---

## Source GLB gate

Before Action Studio visual review, validate the actual exported file:

```bash
npm run validate:skyrim-source-glb -- path/to/shd_blockidle.source.glb
```

The validator checks:

- binary glTF 2.0 container
- self-contained asset; no external `.bin` or image dependency
- all 19 required Skyrim source semantics resolve after glTF name sanitization
- at least one animation contains real channels
- animation channels reach the expected source skeleton

A successful result must report:

```text
acceptedForG23Review: true
selfContained: true
semanticBoneCount: 19
semanticBoneTotal: 19
animationCount >= 1
```

The validator deliberately does **not** decide whether the motion looks correct. That is G2.3 Visual Review Lab's job.

---

## First visual load

Serve the repo over local HTTP, open:

```text
tools/action-studio/skyrim-guard-visual-review.html
```

Then load the real `shd_blockidle.source.glb`.

The review page retargets the Skyrim source animation through G2.1 onto the canonical Action Studio Blockman rig and mounts the real procedural longsword. Review:

- pelvis / foot weight
- torso combat stance
- sword-arm usability
- shield-oriented off-hand correction cost
- loop seam / popping

Decision remains:

```text
ADOPT
ADOPT WITH CORRECTIONS
REJECT
```

---

## Current execution boundary

G2.3.1 is complete. HavokToolset `hk_to_gltf` decoded the real local `skeleton.hkx` + `shd_blockidle.hkx` pair at 30 fps into a self-contained `shd_blockidle.source.glb`; the repository validator accepted it and a Three.js runtime probe retargeted it through G2.1 to `SKYRIM_GUARD/shd_blockidle` on the canonical Blockman rig.

No keyframes were synthesized and no skeleton-only placeholder GLB was used. The validated output is committed as the explicit canonical exception; raw HKX inputs and other converted probes remain excluded.


The remaining boundary is G2.3.2 visual judgment, not decode or adapter engineering. See `13_skyrim_guard_g2_3_2_execution_record.md`.

---

## Asset / licensing boundary

- Do not commit raw `skeleton.hkx`.
- Do not commit raw `shd_blockidle.hkx`.
- Commit only the validator-approved canonical `shd_blockidle.source.glb`; keep other converted probes local.
- Keep creator attribution in the release checklist.
- Commercial redistribution remains a separate final license review before shipping the converted motion in a CrazyGames build.

---

## Next gate

### G2.3.2 — First Real Visual Decision

Begins only after the real source GLB exists and passes the source-GLB validator.
