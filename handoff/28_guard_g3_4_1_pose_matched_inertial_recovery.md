# G3.4.1 — Pose-Matched / Inertialized Guard Recovery

## Problem

G3.4.0 restored the complete Skyrim reaction clips, but the runtime still entered `guard_recover` by immediately sampling `shd_blockidle`. The old 140 ms transition only faded presentation weights; it did not preserve the final pose or velocity of Block Hit / Parry / Perfect Parry / Counter.

Visually this produced a discontinuity:

`source action final pose -> Guard Hold pose -> weight easing`

The source action could therefore finish cleanly and still snap when Recover began.

## Decision

`guard_recover` is now a reusable pose bridge rather than a second authored animation.

At the source action tail the presentation runtime keeps the last two sampled rig poses. When Recover starts it:

1. captures the exact final source pose and current weapon mount;
2. samples the corrected Skyrim Guard Hold pose at time 0 as the deterministic target;
3. keeps the source pose exactly at Recover `t=0`;
4. carries the measured source linear/angular velocity forward with a decaying inertia envelope;
5. quaternion-blends every registered rig bone toward the Guard Hold target;
6. blends the sword mount from the source mount to the Skyrim Guard mount;
7. lands exactly on Guard Hold at Recover `t=1`.

The bridge never changes combat authority. `BLOCK_CONFIRMED`, `PARRY_CONFIRMED`, and `COUNTER_CONFIRMED` remain authoritative-combat events. Recover completion remains presentation-owned.

## Recovery profiles

| Source | Duration | Momentum scale |
| --- | ---: | ---: |
| Normal Parry | 170 ms | 0.30 |
| Block Hit | 210 ms | 0.34 |
| Perfect Parry | 270 ms | 0.42 |
| Counter | 310 ms | 0.38 |
| Fallback | 220 ms | 0.32 |

These values intentionally separate visual recovery from Counter input windows. The existing presentation-only Counter windows are unchanged.

## Momentum safety

Velocity extrapolation is used only when two source pose samples are from the same presentation sequence and are no more than 80 ms apart. Large synthetic/test time jumps disable inertia and fall back to a zero-velocity pose match, preventing unstable overshoot.

## Runtime contract

The recovery report exposes:

- `recoveryProfileId`
- `recoveryProgress`
- `recoveryDurationMs`
- `recoveryMomentumActive`
- `recoverySourceState`

Action Studio displays these while Recover is active.

## Weapon mount continuity

Counter uses the KayKit default sword mount while Skyrim Guard uses the accepted calibrated Skyrim mount. G3.4.1 captures the Counter mount before the profile switch, lets the mount runtime resolve the target Skyrim calibration, and then interpolates the actual weapon Object3D transform through Recover. The mount therefore does not teleport at Counter completion.

## Validation gates

- pure recovery math unit tests: exact endpoints, inertia contribution, stale-sample safety, profile durations;
- full repository CI and Action Studio standalone freshness;
- Action Studio Chromium Guard surface gate;
- Guard Reaction Runtime Visual: Block / Parry / Perfect Parry must enter a pose-matched recovery profile and complete to Hold;
- Guard Counter Runtime Visual: Counter must preserve mount continuity at Recover `t=0`, visibly interpolate mid-Recover, and land in Hold.

## Follow-up

After this recovery baseline is visually accepted, proceed to Counter timing / silhouette tuning. Do not trim the Skyrim source reaction tails to solve a recovery discontinuity; recovery continuity now belongs to this bridge.
