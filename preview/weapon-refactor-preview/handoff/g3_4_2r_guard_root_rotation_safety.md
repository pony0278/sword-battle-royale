# G3.4.2R — Guard Root Rotation Safety Fix

## Why the `R` suffix

`main` already contains **G3.4.2 Counter Timing / Silhouette Tuning** from PR #30. This corrective regression fix keeps that history intact and uses `G3.4.2R` to distinguish the root-rotation safety patch requested immediately afterward.

## Regression

`shd_blockhit` began visibly rotating the whole character during Guard Runtime playback after G3.4.0 restored the full Skyrim source window from `0.60 s` to `0.80 s`.

The underlying runtime gap was broader than that one clip:

- Skyrim retarget output can contain `root.quaternion` tracks.
- `inPlace: true` previously removed only `root.position`.
- Therefore an in-place Guard animation could remain translation-stable while still rotating the character root.
- Existing translation-safety tests would not catch this class of failure.

## Runtime fix

### Explicit animation policy

`src/animation/kaykit-animation-library.js` now supports:

```text
rootRotationPolicy: preserve   // default, backwards compatible
rootRotationPolicy: lock       // removes root.quaternion for in-place playback
```

The default remains `preserve`, so UAL/KayKit/non-Guard animation behavior does not change unless the caller opts into the lock.

Prepared animation cache keys and procedural-character playback signatures include the root-rotation policy. Switching from a preserving action to a locked action therefore resets the target rig instead of inheriting stale root orientation.

### Guard policy

Guard Runtime now samples in-place Hold, Enter/Exit, Block/Parry reactions, Counter, and Recover with:

```js
rootRotationPolicy: 'lock'
```

Guard body motion still comes from hips/spine/limb tracks. Only the animation root is prevented from changing the player's facing direction.

## Block Hit safety rollback

`SKYRIM_GUARD/shd_blockhit` remains a `0.80 s` source asset, but production presentation is restored to the previously reviewed range:

```text
0.00–0.60 s
```

The `0.60–0.80 s` tail is not deleted. It is simply no longer exposed by the Block Hit presentation profile until a dedicated late-tail visual review proves it is useful and safe.

Counter availability remains `0.24–0.60 s`; combat authority is unchanged.

## Perfect Parry

`shd_blockbashpower` remains on its full `0.70 s` presentation window. G3.4.2R protects it with the same root-rotation lock rather than trimming it pre-emptively.

## Authority invariants

This patch does not change:

- `BLOCK_CONFIRMED`
- `PARRY_CONFIRMED`
- `COUNTER_CONFIRMED`
- Counter timing remap introduced by the already-merged G3.4.2
- Guard state-machine authority rules

It is presentation/runtime safety only.

## Regression coverage

Tests now verify:

1. in-place playback always strips root translation;
2. root quaternion is preserved by default;
3. `rootRotationPolicy: 'lock'` strips only the root quaternion and leaves hips/limbs untouched;
4. preserve/lock playback signatures are distinct;
5. Guard Hold / Block Hit / Parry / Perfect Parry / Counter request locked root rotation;
6. Block Hit completes at `0.60 s` again;
7. Perfect Parry still uses the full `0.70 s` source window.

## Follow-up visual gate

Before re-opening Block Hit `0.60–0.80 s`, review at minimum:

```text
0.00 / 0.20 / 0.40 / 0.60 / 0.70 / 0.80 s
```

and include 90% / 100% evidence rather than stopping at the old 75% checkpoint.
