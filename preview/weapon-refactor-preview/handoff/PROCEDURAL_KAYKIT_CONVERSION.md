# Procedural KayKit Default Character

## Outcome

The default character path now creates the KayKit `Rig_Medium` skeleton, v3 line-avatar presentation and stable equipment sockets procedurally. It does not load the source Knight model. KayKit animation GLBs remain the animation source and are bound to the generated bones by their original names.

```text
createDefaultCharacter
  -> createProceduralKayKitCharacter
  -> createProceduralKayKitRig
     -> 23 THREE.Bone nodes from versioned Rest Pose data
     -> generated v3 rig lines, body contours and joint nodes
     -> HAND_L / HAND_R / HEAD / BACK / HIP_L / HIP_R
  -> KayKit AnimationMixer controller
```

## Generated sources

- `src/character/kaykit-rig-definition.js`: 23-bone hierarchy and Rest Pose.
- `assets/kaykit/manifest.json`: four animation packs and 61 clip names.
- `assets/kaykit/animations/*.glb`: animation source packs.

Regenerate them with `npm run extract:kaykit`. The extractor reads the checked-in Combat Lab HTML and validates the GLB headers before writing outputs.

## Runtime boundaries

- Character skeleton, v3 line presentation and sockets are procedural.
- KayKit animation clips are presentation data only.
- Action Definition remains responsible for active, cancel, movement, weapon-trail and parry authoring windows.
- Combat simulation remains responsible for hit, block, parry and counter outcomes.
- The old `createBlockCharacter` path remains available as a fallback/reference but is no longer the Action Studio default.

## Socket mapping

| Game socket | Procedural parent |
| --- | --- |
| `HAND_L` | animated `handslot.l` bone |
| `HAND_R` | animated `handslot.r` bone |
| `HEAD` | `head` bone |
| `BACK` | `chest` bone |
| `HIP_L` | `hips` bone |
| `HIP_R` | `hips` bone |

For two-handed weapons, mount the weapon to `HAND_R` and add a weapon-owned secondary grip target for left-hand IK. Weapon base/tip/trail points belong to the weapon definition rather than the character rig.

## Action Studio

Action Studio continues to support the authored Pose Editor through a KayKit pose adapter. When served over HTTP it can also load and play the four KayKit animation packs directly against the same generated skeleton. Direct `file://` use still supports the Pose Editor, but browsers cannot fetch the external GLB animation packs from that origin.

## V3 line-avatar presentation

The only render style is `v3-rig-line`: 15 animated bone links, 18 gold joint nodes, an octagonal camera-facing head outline, glow duplicates, and procedural chest/pelvis contours. There is no Block or Hybrid Mesh path. Pose-editor grounding samples the generated foot and toe bones directly, while KayKit animations and all six equipment sockets remain unchanged.


## V3 procedural longsword rig

The Action Studio weapon is an 11-node procedural rig attached to the generated `HAND_R` socket. Its white outline is generated from the exact v3 embedded `sword_1handed` topology (358 vertices / 300 triangles) through `EdgesGeometry`, combined with cyan skeleton links, glow and gold nodes. Stable `SECONDARY_GRIP`, `PARRY_POINT`, `TRAIL_BASE` and `TRAIL_TIP` points are part of the weapon contract. The blade root-to-tip segment is authoring data for trail and future sweep previews; combat authority does not use render-line intersections as hit results.
