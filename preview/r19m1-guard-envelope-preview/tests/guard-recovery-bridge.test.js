import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUARD_RECOVERY_PROFILE_IDS,
  GUARD_RECOVERY_PROFILES,
  blendRecoveryPose,
  resolveGuardRecoveryProfile,
  samplePoseMatchedRecovery,
} from '../src/combat/guard-recovery-bridge.js';

function transform(positionX, quaternion = { x: 0, y: 0, z: 0, w: 1 }) {
  return Object.freeze({
    position: Object.freeze({ x: positionX, y: 0, z: 0 }),
    quaternion: Object.freeze(quaternion),
    scale: Object.freeze({ x: 1, y: 1, z: 1 }),
  });
}

function pose(positionX, quaternion) {
  return Object.freeze({ spine: transform(positionX, quaternion) });
}

test('G3.4.1 recovery preserves the exact source pose at t=0 and exact Guard target at t=1', () => {
  const previous = pose(-0.05);
  const source = pose(0);
  const target = pose(1);

  const start = blendRecoveryPose(previous, source, target, 0, {
    durationMs: 210,
    sampleDeltaMs: 16,
    momentumScale: 0.34,
  });
  assert.deepEqual(start.spine.position, source.spine.position);
  assert.deepEqual(start.spine.quaternion, source.spine.quaternion);

  const end = blendRecoveryPose(previous, source, target, 1, {
    durationMs: 210,
    sampleDeltaMs: 16,
    momentumScale: 0.34,
  });
  assert.ok(Math.abs(end.spine.position.x - 1) < 1e-9);
  assert.ok(Math.abs(end.spine.quaternion.w - 1) < 1e-9);
});

test('G3.4.1 recovery carries source velocity forward before settling instead of snapping to a plain blend', () => {
  const previous = pose(-0.1);
  const source = pose(0);
  const target = pose(1);
  const progress = 0.25;
  const result = blendRecoveryPose(previous, source, target, progress, {
    durationMs: 210,
    sampleDeltaMs: 16,
    momentumScale: 0.34,
  });
  const smooth = progress * progress * (3 - 2 * progress);
  assert.ok(result.spine.position.x > smooth, 'inertial continuation should lead the zero-velocity smoothstep blend');
  assert.ok(result.spine.position.x < 1, 'recovery should still converge toward Guard Hold');
});

test('G3.4.1 disables velocity extrapolation when source samples are too far apart', () => {
  const previous = pose(-0.1);
  const source = pose(0);
  const target = pose(1);
  const snapshot = {
    lastOutcome: 'block',
    lastTransition: { payload: { reactionVariant: 'block-hit' } },
  };
  const result = samplePoseMatchedRecovery(
    snapshot,
    { sequence: 7, elapsedMs: 800, pose: source },
    { sequence: 7, elapsedMs: 600, pose: previous },
    target,
    105,
  );
  assert.equal(result.profile.id, GUARD_RECOVERY_PROFILE_IDS.BLOCK);
  assert.equal(result.momentumActive, false);
});

test('G3.4.1 assigns longer recovery to Perfect Parry and Counter than compact normal Parry', () => {
  const parry = resolveGuardRecoveryProfile({
    lastOutcome: 'parry',
    lastTransition: { payload: { reactionVariant: 'parry' } },
  });
  const perfect = resolveGuardRecoveryProfile({
    lastOutcome: 'parry',
    lastTransition: { payload: { reactionVariant: 'perfect-parry' } },
  });
  const counter = resolveGuardRecoveryProfile({
    lastOutcome: 'counter',
    lastTransition: { payload: { counterProfileId: 'counter' } },
  });
  assert.equal(parry.id, GUARD_RECOVERY_PROFILE_IDS.PARRY);
  assert.equal(perfect.id, GUARD_RECOVERY_PROFILE_IDS.PERFECT_PARRY);
  assert.equal(counter.id, GUARD_RECOVERY_PROFILE_IDS.COUNTER);
  assert.ok(parry.durationMs < perfect.durationMs);
  assert.ok(perfect.durationMs < counter.durationMs);
});

test('G3.4.1.2 latches the Counter final pose through the first 60 Hz Recover frame without extending 310 ms total recovery', () => {
  const previous = pose(-0.1);
  const source = pose(0);
  const target = pose(1);
  const snapshot = {
    lastOutcome: 'counter',
    lastTransition: { payload: { counterProfileId: 'longsword_guard_counter_melee_block_attack_v1' } },
  };
  const sourceSample = { sequence: 9, elapsedMs: 1066.6667, pose: source };
  const previousSample = { sequence: 9, elapsedMs: 1050, pose: previous };
  const holdMs = GUARD_RECOVERY_PROFILES.counter.continuityHoldMs;

  const atZero = samplePoseMatchedRecovery(snapshot, sourceSample, previousSample, target, 0);
  const firstFrame = samplePoseMatchedRecovery(snapshot, sourceSample, previousSample, target, holdMs);
  assert.equal(atZero.durationMs, 310);
  assert.equal(firstFrame.durationMs, 310);
  assert.equal(atZero.continuityLatched, true);
  assert.equal(firstFrame.continuityLatched, true);
  assert.equal(firstFrame.progress, 0);
  assert.equal(firstFrame.momentumActive, false);
  assert.deepEqual(firstFrame.pose.spine.position, source.spine.position);
  assert.deepEqual(firstFrame.pose.spine.quaternion, source.spine.quaternion);

  const afterLatch = samplePoseMatchedRecovery(snapshot, sourceSample, previousSample, target, holdMs + (1000 / 60));
  assert.equal(afterLatch.continuityLatched, false);
  assert.ok(afterLatch.progress > 0);
  assert.ok(afterLatch.progress < 0.1);
  assert.equal(afterLatch.momentumActive, true);

  const end = samplePoseMatchedRecovery(snapshot, sourceSample, previousSample, target, 310);
  assert.equal(end.complete, true);
  assert.equal(end.progress, 1);
  assert.ok(Math.abs(end.pose.spine.position.x - 1) < 1e-9);
});

test('G3.4.1.2 keeps non-Counter recovery timing unchanged', () => {
  const source = pose(0);
  const target = pose(1);
  const snapshot = {
    lastOutcome: 'parry',
    lastTransition: { payload: { reactionVariant: 'parry' } },
  };
  const result = samplePoseMatchedRecovery(
    snapshot,
    { sequence: 3, elapsedMs: 333, pose: source },
    null,
    target,
    17,
  );
  assert.equal(result.profile.id, GUARD_RECOVERY_PROFILE_IDS.PARRY);
  assert.equal(result.continuityHoldMs, 0);
  assert.equal(result.continuityLatched, false);
  assert.ok(Math.abs(result.progress - (17 / 170)) < 1e-9);
});
