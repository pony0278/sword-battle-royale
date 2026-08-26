# G2.3.2 — Real Source Bake Execution Record

## Status

```text
G2.3.1 real decode / source bake: COMPLETE
G2.1 canonical Blockman retarget: COMPLETE
G2.3.2 visual review controls: READY
G2.3.2 visual decision: PENDING
```

The final decision is intentionally not inferred from file structure or numerical seam metrics. The required human-visible Front / 3-quarter / Side / Back playback review remains blocked by the review machine's in-app browser sandbox runtime.

## Real conversion

The local source pair was converted with HavokToolset v1.10.19 using the real animation and matching Skyrim skeleton at 30 fps:

```text
havok_toolset hk_to_gltf \
  --skeleton-path <local skeleton.hkx> \
  --sample-rate 30 \
  --filename-anims <local shd_blockidle.hkx>
```

Output:

```text
file: assets/skyrim/guard/converted/shd_blockidle.source.glb
size: 389352 bytes
sha256: 115a56ce9233bce3ae695e2ded21e0f31441f54eb46235402e23724c7309a0c8
```

The output is a real animated source hierarchy. It is not a skeleton-only GLB, placeholder animation, or synthesized keyframe stream. By explicit project-owner instruction, this validator-approved file is committed as the canonical source asset; raw HKX inputs and other converted probes remain ignored.

## Repository source-GLB validator

```text
npm run validate:skyrim-source-glb -- assets/skyrim/guard/converted/shd_blockidle.source.glb

acceptedForG23Review: true
gltfVersion: 2
selfContained: true
externalUris: []
nodeCount: 122
semanticBoneCount: 19 / 19
animationCount: 1
animation: shd_blockidle
animationChannels: 198
animatedNodes: 99
animatedSemantics: 19
warning: null
```

No validator threshold or semantic requirement was relaxed.

## Actual runtime retarget probe

The source GLB was loaded with the same Three.js generation used by Action Studio and passed through `src/animation/skyrim-animation-retarget.js` onto the canonical Action Studio rig.

```text
source clip: shd_blockidle
source duration: 40 s
source tracks: 198
densest source track: 1202 keys
most common sample delta: 0.033333 s (30 fps)

canonical clip: SKYRIM_GUARD/shd_blockidle
target rig: kaykit_rig_medium
target tracks: 21
retargetFps: 30
```

This proves that the real source animation reaches the existing Skyrim adapter and canonical Blockman animation runtime. It does not by itself approve the pose.

## Loop engineering probe

```text
max major-bone start/end rotation delta: 0.588 deg
root start/end translation delta: 0
pelvis start/end translation delta: 0.00835
classification: GOOD
```

The seam metric is within the existing engineering threshold. A visible loop still requires playback inspection before the visual gate can be scored.

## Guard Source Review readiness

- Front / 3-quarter / Side / Back deterministic camera presets
- Once and Loop playback
- start/end freeze
- timeline scrub
- procedural longsword on the canonical right hand
- explicit review ratings and decision calculation

Back-view coverage and deterministic preset tests were added in this follow-up.

## Required G2.3.2 visual decision

| Visual item | Status |
|---|---|
| Legs / planted weight | PENDING |
| Hips / balance | PENDING |
| Spine / torso combat stance | PENDING |
| Shoulders | PENDING |
| Left hand / shield-arm correction cost | PENDING |
| Right hand / sword grip | PENDING |
| Sword line | PENDING |
| Body opening / Triangle Guard compactness | PENDING |
| Overall Guard silhouette | PENDING |
| Loop / freeze / scrub visible stability | PENDING |

Final G2.3.2 decision:

```text
PENDING — no ADOPT / ADOPT WITH CORRECTIONS / REJECT judgment recorded
```

## Review-machine blocker

After a full desktop application restart, the in-app browser execution core still terminates before browser discovery with:

```text
windows sandbox failed: helper_unknown_error: setup refresh had errors
```

Because the browser never reaches the local review page, screenshots or interactive playback evidence cannot be collected in this run. Per the explicit user instruction, the engineering follow-up may merge while the visual decision remains pending. Once the browser runtime is repaired, reuse the existing local GLB and perform the multi-view review without regenerating or substituting the source motion.
