# G2.2 — Skyrim HKX Decoder Bridge + First `shd_blockidle` Import

## 1. Goal

G2.2 connects a real Skyrim animation source to the G2.1 Action Studio retarget adapter without making the browser runtime understand Havok.

```text
shd_blockidle.hkx
        ↓
Raw HKX probe
        ↓
External Skyrim LE decoder / Blender importer
        ↓
self-contained source GLB
(named Skyrim hierarchy + one animation)
        ↓
Skyrim converted-source bridge
        ↓
G2.1 retargetSkyrimClip(...)
        ↓
SKYRIM_GUARD/shd_blockidle
        ↓
Action Studio procedural Blockman rig
```

The Action Studio rig remains the canonical target skeleton.

---

## 2. Current real-source probe

The uploaded `shd_blockidle.hkx` used for this G2 probe was inspected without redistributing it.

```text
filename     shd_blockidle.hkx
byte length  25136
sha256       52cfff4846a0f43fe4246e5e6afcb38b0c1ef54ca5e944dce6167404630e22f2
```

Required marker offsets found in this exact file:

```text
hk_2010.2.0-r1                 40
hkaAnimationContainer          309
hkaSplineCompressedAnimation   336
hkaAnimationBinding            370
NPC Root [Root]                24944
```

This passes the G2.2 raw-source gate: it is the expected Skyrim-era Havok skeletal animation container family, not a behavior graph or arbitrary binary.

The repository now includes:

```text
npm run probe:skyrim-hkx -- <path-to-animation.hkx>
```

The probe intentionally does **not** claim to decompress spline animation data. It only rejects incompatible raw inputs early.

---

## 3. Why the HKX decoder is an external bridge

`hkaSplineCompressedAnimation` is compressed Havok animation data. The current browser/CI environment has no licensed/native Havok 2010.2 decoder, Blender runtime, or `hkxcmd` installation.

Therefore G2.2 uses a clean dependency boundary:

```text
HKX decoding / source skeleton interpretation
= offline authoring dependency

Action Studio retarget / playback
= repository-owned runtime code
```

This keeps the game independent from Havok tooling.

---

## 4. Recommended source conversion routes

### Route A — PyNifly / Blender

Preferred when available on the Windows authoring machine.

The conversion stage should:

1. Import the matching Skyrim human `skeleton.hkx`.
2. Import `shd_blockidle.hkx` onto that source skeleton.
3. Preserve the Skyrim source armature/rest pose.
4. Export a self-contained GLB with the source hierarchy and one animation.

Do **not** manually retarget to the Action Studio rig in Blender for this probe. G2.1 owns the retarget math so we can compare all source packs consistently.

### Route B — blender-hkx

Also valid for original 32-bit Skyrim HKX, provided its Havok converter dependency is available.

### Route C — hkxcmd / KF intermediary

Fallback only. It can be useful to get a visual source animation out, but it is not the preferred canonical path because intermediary conversion may lose or alter animation metadata. G2 only needs pose/motion for the visual probe, so it can still be used if needed.

---

## 5. Converted GLB contract

The G2.2 bridge expects a **source** GLB, not a target-baked Action Studio GLB.

Required:

- self-contained `.glb` for local import;
- source Skyrim hierarchy included;
- one animation clip;
- source rest pose preserved;
- source bone names preserved as closely as possible;
- 30 fps source/bake cadence preferred;
- no mesh is required;
- shield mesh is not required;
- no Action Studio target bone renaming is required before import.

Expected semantic source bones include:

```text
NPC Root [Root]
NPC Pelvis [Pelv]
NPC Spine [Spn0]
NPC Spine2 [Spn2]
NPC Head [Head]
NPC L UpperArm [LUar]
NPC L Forearm [LLar]
NPC L Hand [LHnd]
NPC R UpperArm [RUar]
NPC R Forearm [RLar]
NPC R Hand [RHnd]
NPC L/R Thigh
NPC L/R Calf
NPC L/R Foot
NPC L/R Toe0
```

The resolver also accepts common simplified aliases and GLB-sanitized names such as:

```text
NPC_L_UpperArm_LUar
```

---

## 6. Canonical bridge asset name

For server/path-based loading:

```text
assets/skyrim/guard/converted/shd_blockidle.source.glb
```

Runtime clip after retarget:

```text
SKYRIM_GUARD/shd_blockidle
```

The `.source.glb` suffix is intentional: it tells us this file still contains the Skyrim source hierarchy and must pass through G2.1 retargeting.

---

## 7. Action Studio import workflow

G2.2 adds a `Skyrim Guard Probe` source to the External Motion Library.

Two ways to feed the probe:

### Local experimental import

```text
Import converted Skyrim GLB
→ choose shd_blockidle.source.glb
→ GLTFLoader.parse(...)
→ retarget to procedural Blockman
→ register SKYRIM_GUARD/shd_blockidle
```

This is preferred during G2 because the experimental converted asset does not need to be committed.

### Repository path loading

If the source GLB is deliberately placed under the canonical asset path:

```text
Skyrim Guard Probe
→ Load selected pack
```

The normal External Motion Library controls then work:

- Preview source
- Preview + Impact
- Bind source
- Fit + bind clip
- Return to Action

`shd_blockidle` is treated as a looping Guard Hold candidate.

---

## 8. Error boundaries

The bridge must fail loudly for:

- unsupported raw HKX marker family;
- source GLB with no hierarchy;
- source GLB with no animation;
- missing semantic Skyrim bones;
- missing canonical Action Studio target bones;
- local `.gltf` files that depend on external `.bin` files;
- duplicate runtime clip IDs.

Error messages should name semantic bones (`lowerarm.r`) rather than decoder-specific track numbers.

---

## 9. G2.2 completion definition

Engineering completion:

- [x] raw HKX probe exists;
- [x] real `shd_blockidle.hkx` passes the marker gate;
- [x] converted-source GLB loader exists;
- [x] local GLB import exists;
- [x] source GLB is retargeted through G2.1;
- [x] canonical runtime clip ID is fixed;
- [x] Action Studio External Motion Library recognizes `skyrim`;
- [x] GLB-sanitized source bone names are supported;
- [ ] real `shd_blockidle.source.glb` produced by an offline decoder;
- [ ] first visual Blockman Guard Hold review recorded.

The last two unchecked items require the actual offline HKX decompression/import step. They are not simulated in CI.

---

## 10. Next gate

Once `shd_blockidle.source.glb` exists:

```text
G2.3 — First Real Bake + Visual Guard Review
```

Review questions:

- Does pelvis/foot weight survive retargeting?
- Does the torso read as a combat stance?
- Is the sword arm usable as a Longsword Guard base?
- Is the shield-oriented off-hand cheap to correct?
- Does the loop pop at the boundary?

Decision remains:

```text
ADOPT
ADOPT WITH CORRECTIONS
REJECT
```
