// R24H.1 - a held shield stays held through your own swing (#38).
//
// Measured, then seen twice in a person's phone captures: with the guard held, the swing clip
// pulled the shield arm to 68cm behind the body, a blocked contact froze it there for 18-41
// frames, and the recovery threw it 0.7m back to the guard in 8 frames. After: the arm rides the
// torso on the guard side (reach from the hips 523mm at its furthest, was 764mm; never behind),
// and the recovery settles instead of whipping. The overlay is inert whenever the guard machine
// was not in HOLD at the swing's first frame - which is every browser gate's case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIELD_ARM_HOLD_BONES, filterPoseToShieldArm } from '../src/combat/shield-arm-hold.js';
import { createAttackerPresentationAdapter } from '../src/game/attacker-presentation.js';

test('R24H.1 the shield arm is the chain from the shoulder out, and nothing of the torso', () => {
  assert.deepEqual([...SHIELD_ARM_HOLD_BONES], ['upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l']);
  const pose = Object.fromEntries([...SHIELD_ARM_HOLD_BONES, 'chest', 'hips', 'upperarm.r'].map((b) => [b, { bone: b }]));
  const arm = filterPoseToShieldArm(pose);
  assert.deepEqual(Object.keys(arm).sort(), [...SHIELD_ARM_HOLD_BONES].sort());
  assert.deepEqual(filterPoseToShieldArm(null), {});
});

function harness({ resumePose } = {}) {
  const calls = [];
  const attacker = {
    rig: { root: { updateMatrixWorld() {} }, bones: {} },
    sampleAnimation(...args) { calls.push(['sampleAnimation', args[0]]); },
    update() { calls.push(['update']); },
  };
  let poseIndex = 0;
  const adapter = createAttackerPresentationAdapter({
    THREE: { Vector3: class { constructor() { this.x = 0; this.y = 0; this.z = 0; } } },
    attacker, camera: {}, exchangeState: {},
    services: {
      captureRigPose() { const pose = { id: `pose-${poseIndex}` }; poseIndex += 1; calls.push(['captureRigPose', pose.id]); return pose; },
      applyRigPose(_rig, pose) { calls.push(['applyRigPose', pose['upperarm.l'] ? 'shield-arm' : pose.id ?? 'pose']); },
      blendRecoveryPose: () => ({ blended: true }),
      sampleLongswordAttackRecovery: () => ({ progress: 0.5, complete: false, profile: { attackRecoveryDurationMs: 180 } }),
      sampleLiveParryOldB3ReleaseBlend: () => ({ progress: 0 }),
      captureResumePose: resumePose === undefined ? undefined : () => { calls.push(['captureResumePose']); return resumePose; },
    },
  });
  return { adapter, calls };
}

const GUARD = { 'upperarm.l': { q: 1 }, 'lowerarm.l': { q: 2 }, 'wrist.l': { q: 3 }, chest: { q: 4 } };
const ACTION_SNAPSHOT = { action: { runtime: { clipId: 'UAL1/Top', durationSeconds: 0.6 } }, elapsedSeconds: 0.2 };

test('R24H.1 the capture paints the guard, keeps only the arm, and puts the visible pose back', () => {
  const { adapter, calls } = harness({ resumePose: GUARD });
  const arm = adapter.captureShieldArmPose();
  assert.deepEqual(Object.keys(arm), ['upperarm.l', 'lowerarm.l', 'wrist.l'], 'the torso stays the swing\'s');
  assert.deepEqual(calls.map((c) => c[0]), ['captureRigPose', 'captureResumePose', 'applyRigPose', 'update'], 'visible captured, guard painted by the service, visible restored');
  assert.equal(harness({ resumePose: null }).adapter.captureShieldArmPose(), null, 'no held guard, no overlay');
  assert.equal(harness({}).adapter.captureShieldArmPose(), null, 'no service, no overlay');
});

test('R24H.1 the swing, the contact hold and the recovery each end with the arm laid back on', () => {
  for (const run of [
    (adapter, pose) => adapter.sampleBase({ snapshot: ACTION_SNAPSHOT, deltaMs: 16, recovery: null, idleClockSeconds: 0, idleDuration: 1, shieldArmPose: pose }),
    (adapter, pose) => adapter.sampleBase({ snapshot: { action: null }, deltaMs: 16, recovery: { direction: 'top', elapsedMs: 0, sourcePose: {}, targetPose: {} }, idleClockSeconds: 0, idleDuration: 1, shieldArmPose: pose }),
    (adapter, pose) => adapter.sampleFrozenContactPose({ clipId: 'x', sourceTimeSeconds: 0.4 }, { shieldArmPose: pose }),
  ]) {
    const armed = harness({ resumePose: GUARD }); run(armed.adapter, filterPoseToShieldArm(GUARD));
    assert.deepEqual(armed.calls.at(-2), ['applyRigPose', 'shield-arm'], 'the arm is the last writer before the repaint');
    assert.deepEqual(armed.calls.at(-1), ['update']);
    const bare = harness({ resumePose: GUARD }); run(bare.adapter, null);
    assert.equal(bare.calls.filter((c) => c[1] === 'shield-arm').length, 0, 'no captured arm, no overlay - the gates\' case');
  }
});

test('R24H.1 the idle never wears the overlay: the guard writers own the arm again', () => {
  const { adapter, calls } = harness({ resumePose: GUARD });
  adapter.sampleBase({ snapshot: { action: null }, deltaMs: 16, recovery: null, idleClockSeconds: 0, idleDuration: 1, shieldArmPose: filterPoseToShieldArm(GUARD) });
  assert.equal(calls.filter((c) => c[1] === 'shield-arm').length, 0);
});
