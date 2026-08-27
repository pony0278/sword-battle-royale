# G3.4 — Guard Counter Runtime / Animation Integration

## Status

Implemented on top of G3.1 Guard FSM, G3.2 Enter/Recover/Exit, and G3.3.2 Block/Parry runtime integration.

G3.4 promotes `guard_counter` from a presentation placeholder to an authored runtime state while preserving the existing combat-authority boundary.

## Counter animation decision

The original Triangle Guard specification already named KayKit `Melee_Block_Attack` as the Guard Counter candidate. G3.4 adopts that clip as the first Longsword Counter presentation:

```text
COUNTER_CONFIRMED (authoritative combat)
        ↓
guard_counter
        ↓
KayKit Melee_Block_Attack
        ↓
COUNTER_COMPLETE (presentation)
        ↓
G3.2 Recover
```

The Counter runtime uses the clip's registered native duration instead of freezing a guessed timing constant. Playback is one-shot and in-place.

## Authority invariant

The counter window exposed by G3.3.2 remains presentation-only.

```text
PARRY_CONFIRMED / BLOCK_CONFIRMED / COUNTER_CONFIRMED
    = authoritative-combat

REACTION_COMPLETE / COUNTER_COMPLETE / RECOVER_COMPLETE
    = presentation
```

A visible counter window never changes the FSM to `guard_counter`. Only an accepted `COUNTER_CONFIRMED` event can do that. Delayed authoritative Counter confirmation is still accepted from G3.2 Recover when the previous confirmed outcome was Block or Parry.

## Counter presentation profile

`src/combat/guard-counter-presentation.js` owns the G3.4 Counter metadata:

- profile: `longsword_guard_counter_melee_block_attack_v1`
- clip: `Melee_Block_Attack`
- source family: KayKit melee
- in-place: true
- loop: false
- Triangle Guard correction weight: `0`
- completion event: `counter_complete`
- authored stage: `G3.4`

G3.4 intentionally does not apply the Skyrim Triangle correction on top of the native KayKit Counter. The Counter motion is allowed to leave the stable Guard silhouette and read as an attack.

## Weapon mount handoff

The Guard family now crosses two authored animation coordinate families:

```text
Skyrim Hold / Block / Parry
    → skyrim-guard-calibrated mount

KayKit Melee_Block_Attack Counter
    → kaykit-default mount

G3.2 Recover / Hold
    → skyrim-guard-calibrated mount
```

`src/combat/guard-weapon-mount-runtime.js` provides a reusable profile applier. It changes calibration only when the requested mount profile changes. `createGuardPresentationRuntime()` exposes `applyWeaponMountProfile(profileId, snapshot)` so the real game runtime and browser verification can use the same boundary.

This prevents the accepted G2.4.5 Skyrim bind correction from being incorrectly carried into the native KayKit Counter pose.

## Runtime completion

`guard-presentation-runtime.js` now samples `guard_counter` instead of stopping animation in that state. It:

1. requires `Melee_Block_Attack` to be registered,
2. samples its full native duration deterministically,
3. forces one-shot in-place playback,
4. applies Counter correction weight `0`,
5. emits presentation-owned `COUNTER_COMPLETE`,
6. immediately hands presentation to the existing G3.2 Recover envelope.

If the Counter clip is missing, runtime fails loudly instead of silently showing Neutral/Rest pose.

## Verification

Unit coverage now verifies:

- G3.4 Counter presentation metadata,
- full native-duration deterministic sampling,
- authoritative Counter confirmation only,
- counter window cannot self-confirm,
- delayed Counter confirmation from Recover,
- Counter completion payload and authority,
- Guard release remains latched through Counter/Recover,
- Skyrim ↔ KayKit weapon mount profile switching,
- missing Counter animation fails loudly.

The dedicated browser lab is:

```text
tools/action-studio/guard-counter-runtime-lab.html
```

It loads the committed Skyrim Guard family and the real KayKit melee GLB into the production procedural Blockman, verifies normal Parry and Perfect Parry Counter chains, confirms in-place preparation removes root-position motion, switches weapon mount profiles, and captures real Counter playback.

GitHub Actions workflow:

```text
.github/workflows/guard-counter-runtime-visual.yml
```

The workflow publishes screenshots and DOM verification as the `g3-4-guard-counter-runtime-visual` artifact.

## Scope boundary

G3.4 integrates the first authoritative Guard Counter presentation. It does not yet define direction-specific Counter selection, damage/hitbox frame data, stamina cost, or multiplayer Counter damage resolution. Those remain combat-system stages rather than presentation-owned behavior.
