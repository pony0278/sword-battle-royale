# G4.2.3 — Buckler Calibration Lab

## Goal

Turn the G4.2.2 offhand Buckler review page into an authoring/calibration surface that can produce accepted mount parameters before G4.3A starts swept sword contact work.

The `HAND_L` equipment socket remains the immutable anchor. G4.2.3 only changes the Buckler object's local transform below that socket.

## Stage boundary

- G4.2.2 remains the equipment contract:
  - existing `HAND_L`
  - procedural round Buckler
  - `oriented-disc` Parry Surface
- G4.2.3 adds authoring/calibration capability.
- G4.3A still owns real swept sword × Buckler contact.

No Guard state-machine or combat authority changes are part of this stage.

## Locked socket rule

The lab captures the `HAND_L` socket local position, quaternion and scale before calibration starts.

Every calibration update:
1. applies transform only to `buckler.object3d`;
2. re-checks the `HAND_L` socket against the baseline;
3. fails loudly if the socket moved.

The page also displays a small axes helper attached to the socket as a visual anchor.

## Live calibration controls

The page exposes Buckler-local controls:

### Position (meters)
- X
- Y
- Z

Range: `-0.30m … +0.30m`, step `0.005m`.

### Rotation (degrees)
- X
- Y
- Z

Range: `-180° … +180°`, step `1°`.

The runtime continues to consume radians. Exported JSON includes both degree and radian forms.

### Scale
- X
- Y
- Z

Range: `0.40 … 2.00`, step `0.01`.

## Line Buckler

The Buckler now supports a Sword-style debug line presentation.

The line rig contains:
- front rim;
- rear rim;
- eight front-face spokes;
- four front/back depth connectors;
- center boss ring;
- white outline;
- cyan glow.

The original solid Buckler is retained as an optional underlay. Default calibration mode is:
- line mode ON;
- solid mode OFF.

## Parry Surface preview

`Show G4.3A Parry Surface + normal` displays:
- current oriented-disc surface;
- current surface normal.

The G4.2.2 shape values remain fixed for this calibration pass:
- visual radius `0.24m`;
- visual thickness `0.055m`;
- parry radius `0.26m`;
- parry thickness `0.075m`.

The goal of this stage is mount placement/orientation, not combat-volume tuning.

## Export workflow

The lab outputs JSON containing:

- stage `G4.2.3`;
- equipment stage `G4.2.2`;
- socket id;
- `socketLocked: true`;
- local position;
- local rotation in degrees;
- local rotation in radians;
- local scale;
- Buckler shape contract;
- current display mode.

Controls:
- `Copy JSON`
- `Save Local`
- `Load Local`
- `Reset`

Saved values use browser `localStorage` and do not modify repository defaults.

## Files

- `src/character/offhand-buckler.js`
- `tools/action-studio/offhand-buckler-lab.html`
- `tools/action-studio/offhand-buckler-lab.js`
- `tests/offhand-buckler-equipment.test.js`

## Acceptance

Before promoting mount values into production defaults:

1. inspect Front / Side / Back / 3/4;
2. use Offhand Close view for hand/strap spacing;
3. verify the Buckler does not hide the established Triangle Guard silhouette;
4. show Parry Surface and confirm its normal points toward the attacker's likely approach;
5. copy the JSON and review the numeric result;
6. only then update `DEFAULT_OFFHAND_BUCKLER_MOUNT`.

## Next

G4.3A should consume the accepted mount plus `buckler.getWorldParrySurface()` and implement swept blade contact. Do not go back to scheduled `contactSeconds` as collision truth.
