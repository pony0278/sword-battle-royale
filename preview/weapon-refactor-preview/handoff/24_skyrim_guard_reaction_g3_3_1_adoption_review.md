# G3.3.1 — Skyrim Guard Reaction Pack Final Visual Decision

## Goal

Avoid unnecessary custom reaction authoring by testing the same Skyrim shield-block family that already produced the accepted `shd_blockidle` mother Guard.

The final decision is based on real Blockman playback, not file names alone.

## Evidence Path

The temporary visual probe did **not** merge raw HKX assets into the product branch. It verified the four uploaded candidate hashes, decoded their native Skyrim LE `hkaSplineCompressedAnimation` data, matched all 99 transform tracks to the canonical 99-joint hierarchy from `shd_blockidle.source.glb`, rebuilt source clips, and passed them through the production Skyrim → Blockman retarget path.

The rendered review used:

- actual procedural Blockman rig,
- production `retargetConvertedSkyrimGltf()` / Skyrim retarget logic,
- G2.4.5 calibrated longsword bind,
- committed G2.5.1 Triangle Forward Guard correction,
- in-place playback,
- 25% / 50% / 75% three-quarter screenshots plus 50% side view for each candidate.

Visual evidence:

- GitHub Actions run: `32139901355`
- artifact: `9325459654` (`g3-3-1-reaction-visual-probe`)
- artifact SHA-256: `78cdb1d40f7b04e0fac56a291c23a334f64f52fd9b8671bf0a8c1874846e9b0d`
- engineering gate: **PASS**

## Decode / Retarget Result

All four final candidates decode as:

- Skyrim LE / Havok 2010 family,
- `Normal` blend,
- 30 fps,
- exactly 99 transform tracks,
- canonical root `NPC Root [Root]`,
- production translation scale `0.01031482`, matching the already fixed Skyrim → Blockman scale regime.

| Clip | Duration | Frames | Root max excursion | Hips max excursion | Hips / height | Arm direction max error |
|---|---:|---:|---:|---:|---:|---:|
| `shd_blockhit` | 0.800 s | 25 | ~0 | 0.11415 | 9.20% | 0.000010° |
| `shd_blockbashintro` | 0.300 s | 10 | 0 | 0.06414 | 5.17% | 0.000006° |
| `shd_blockbash` | 0.333 s | 11 | 0 | 0.13291 | 10.71% | 0.000009° |
| `shd_blockbashpower` | 0.700 s | 22 | 0 | 0.18332 | 14.77% | 0.000010° |

All four pass translation-safety and helper-chain coverage. No candidate is rejected for retarget corruption, root fly-away, shoulder flip, elbow inversion, or sword detachment.

---

# Final Decisions

## 1. `shd_blockhit` — **ADOPT WITH CORRECTIONS**

Final role: `guard_block_hit`

### Visual read

The real Blockman playback reads correctly as a **received Guard impact**. The weapon line is visibly knocked away from the stable Triangle Hold, the torso/hips absorb force, and the root remains fixed. This is much more useful than authoring a synthetic upper-body twitch.

### Why not plain ADOPT

The source clip is `0.8 s`, and the later part of the motion keeps the weapon displaced longer than we want for a compact multiplayer Guard reaction. The source recoil itself is good; the correction is primarily **timing/windowing**, not replacement animation.

### Production rule

Keep:

- source recoil,
- source lower-body weight response / foot-scuff feel,
- canonical sword bind,
- canonical Triangle correction.

Then:

- use the useful impact/recoil portion,
- transition the late recovery into G3.2 `guard_recover`,
- do not author a new Block Hit.

**KayKit `Melee_Block_Hit` remains fallback only.**

---

## 2. `shd_blockbashintro` — **REJECT** from the post-confirmation Parry reaction chain

Preserve as optional future source.

### Visual read

The 0.3 s Blockman motion is technically clean but visually reads as **preparation / wind-up**. It does not look like the immediate displacement that should occur when the server/combat authority has already emitted `PARRY_CONFIRMED`.

### Why REJECT here

Current G3.1 semantics are:

```text
incoming contact
      ↓
PARRY_CONFIRMED
      ↓
parry reaction
```

Putting `blockbashintro` after that confirmation introduces a preparatory beat after contact and weakens responsiveness.

### Possible future reuse

It remains useful for a different state if we later add:

- local `Parry Attempt` startup before contact,
- AI defensive telegraph,
- pre-contact bash/deflect wind-up.

So this is a **scoped rejection**, not deletion of the asset.

---

## 3. `shd_blockbash` — **ADOPT**

Final role: `guard_parry_deflect`

### Visual read

This is the strongest result of the review.

The 0.333 s Blockman playback is short, immediate, and visibly moves the longsword through a compact outward deflection. It does not read like the defender simply took damage, and the sword remains a readable part of the action even though the source belongs to Skyrim's shield family.

### Why plain ADOPT

With only the existing family-wide calibration:

- root stays fixed,
- arm-chain error is effectively zero,
- sword remains attached,
- body impulse is compact,
- no reaction-specific pose correction is needed.

Therefore **Parry Reaction does not need to be authored from scratch.**

Production chain:

```text
Triangle Guard Hold
      ↓
PARRY_CONFIRMED
      ↓
shd_blockbash
      ↓
G3.2 Recover / Counter window
```

---

## 4. `shd_blockbashpower` — **ADOPT WITH CORRECTIONS**

Final role: `perfect_parry_strong_deflect`

### Visual read

The power variant is clearly stronger than normal `shd_blockbash`: larger cross-body sword sweep, larger torso/hips commitment, and a stronger displacement silhouette. That difference is exactly what Perfect Parry needs.

It still has zero root locomotion, so the extra commitment comes from body motion rather than the character sliding across the floor.

### Why not plain ADOPT

At `0.7 s`, the late portion becomes broad enough to start reading like the beginning of a counter/follow-through rather than only a defensive deflect.

Production should:

- keep the strong initial displacement,
- trim or weight down the late follow-through,
- hand control to the authoritative `guard_counter` state before the move looks like an autonomous attack.

No new Perfect Parry animation is required.

Production chain:

```text
Triangle Guard Hold
      ↓
PERFECT PARRY CONFIRMED
      ↓
shd_blockbashpower (strong deflect window)
      ↓
Counter Window
      ↓
G3.4 Counter or G3.2 Recover
```

---

## 5. `shd_blockanticipate` — **REJECT** from reactive G3.3

This decision remains unchanged.

Its semantic role is anticipation/brace. Playing anticipation after confirmed defensive contact reverses cause and effect.

Preserve it for possible:

- AI defensive telegraph,
- heavy-guard brace,
- stamina-break anticipation,
- cinematic/pre-contact guard preparation.

---

# Final G3.3.1 Guard Family

The reviewed Skyrim family now gives us the reactions we actually need:

```text
Action Studio Idle
        ↓
G3.2 Guard Enter
        ↓
shd_blockidle + Triangle correction
        │
        ├─ BLOCK_CONFIRMED
        │      ↓
        │   shd_blockhit
        │   [ADOPT WITH CORRECTIONS]
        │      ↓
        │   G3.2 Recover
        │      ↓
        │   Guard Hold
        │
        ├─ PARRY_CONFIRMED
        │      ↓
        │   shd_blockbash
        │   [ADOPT]
        │      ↓
        │   Recover / Counter Window
        │
        └─ PERFECT PARRY CONFIRMED
               ↓
            shd_blockbashpower
            [ADOPT WITH CORRECTIONS]
               ↓
            Counter Window
```

`shd_blockbashintro` is removed from the post-confirmation chain.

## Consequence

**G3.3 does not need a newly authored Block Hit or Parry reaction.**

The remaining work is integration/timing authoring:

1. register the accepted Skyrim reaction clips in the production converted-animation library,
2. define the `shd_blockhit` useful reaction window,
3. bind `shd_blockbash` directly to Parry reaction,
4. define the strong-deflect window for `shd_blockbashpower`,
5. connect their completion events to the existing G3.1 state machine and G3.2 Recover envelope.

That follow-up should be treated as **G3.3.2 — Guard Reaction Runtime Integration**, not custom animation authoring.
