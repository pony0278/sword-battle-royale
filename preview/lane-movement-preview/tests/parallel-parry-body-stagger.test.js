import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARALLEL_PARRY_BODY_STAGGER_STAGE,
  PARALLEL_PARRY_BODY_STAGGER_PHASES,
  sampleParallelParryBodyStagger,
} from '../src/combat/parallel-parry-body-stagger.js';

function recoilPlan(responseClass = 'parry-directional-recoil') {
  return {
    planned: true,
    attackDirection: 'right',
    responseClass,
    weapon: {
      direction: { x: -0.7, y: 0.25, z: -0.65 },
      lateralSign: -1,
      strength: responseClass.startsWith('perfect') ? 1 : 0.68,
      deflectDegrees: responseClass.startsWith('perfect') ? 44 : 30,
    },
    body: {
      strength: responseClass.startsWith('perfect') ? 0.56 : 0.38,
      yawDegrees: -10,
      pitchDegrees: -7,
      rollDegrees: -2.8,
    },
  };
}

test('G4.3B.5R.2.5 starts Parry body reaction by the first ~30-40ms visible frame', () => {
  const before = sampleParallelParryBodyStagger({ outcome: 'parry', plan: recoilPlan(), elapsedMs: 20 });
  const firstVisible = sampleParallelParryBodyStagger({ outcome: 'parry', plan: recoilPlan(), elapsedMs: 40 });
  const nearPeak = sampleParallelParryBodyStagger({ outcome: 'parry', plan: recoilPlan(), elapsedMs: 92 });

  assert.equal(before.stage, PARALLEL_PARRY_BODY_STAGGER_STAGE);
  assert.equal(before.phase, PARALLEL_PARRY_BODY_STAGGER_PHASES.WAIT);
  assert.equal(before.weight, 0);
  assert.equal(firstVisible.phase, PARALLEL_PARRY_BODY_STAGGER_PHASES.RISE);
  assert.ok(firstVisible.weight > 0);
  assert.equal(nearPeak.phase, PARALLEL_PARRY_BODY_STAGGER_PHASES.PEAK);
  assert.equal(nearPeak.weight, 1);
});

test('G4.3B.5R.2.5 body stagger never claims weapon, right-arm, or root authority', () => {
  const sample = sampleParallelParryBodyStagger({ outcome: 'parry', plan: recoilPlan(), elapsedMs: 96 });
  assert.equal(sample.weaponChannelsTouched, false);
  assert.equal(sample.rightArmChannelsTouched, false);
  assert.equal(sample.rootMotion, false);
  assert.match(sample.authority, /chest-spine-hips-legs-only/);
  assert.ok(Math.abs(sample.pose.chestYawDegrees) > Math.abs(sample.pose.hipsYawDegrees));
});

test('G4.3B.5R.2.5 Perfect Parry exaggerates body stagger more than normal Parry', () => {
  const parry = sampleParallelParryBodyStagger({ outcome: 'parry', plan: recoilPlan(), elapsedMs: 100 });
  const perfect = sampleParallelParryBodyStagger({ outcome: 'perfect-parry', plan: recoilPlan('perfect-parry-directional-recoil'), elapsedMs: 100 });
  assert.ok(Math.abs(perfect.pose.chestYawDegrees) > Math.abs(parry.pose.chestYawDegrees));
  assert.ok(Math.abs(perfect.pose.hipsYawDegrees) > Math.abs(parry.pose.hipsYawDegrees));
  assert.ok(perfect.pose.rightKneeBendDegrees > parry.pose.rightKneeBendDegrees);
});

test('G4.3B.5R.2.5 fades the early parallel body layer before B3 recovery completes', () => {
  const handoff = sampleParallelParryBodyStagger({ outcome: 'parry', plan: recoilPlan(), elapsedMs: 210 });
  const complete = sampleParallelParryBodyStagger({ outcome: 'parry', plan: recoilPlan(), elapsedMs: 252 });
  assert.equal(handoff.phase, PARALLEL_PARRY_BODY_STAGGER_PHASES.HANDOFF);
  assert.ok(handoff.weight > 0 && handoff.weight < 1);
  assert.equal(complete.phase, PARALLEL_PARRY_BODY_STAGGER_PHASES.COMPLETE);
  assert.equal(complete.weight, 0);
  assert.equal(complete.complete, true);
});

test('G4.3B.5R.2.5 ignores Block outcome', () => {
  const block = sampleParallelParryBodyStagger({ outcome: 'block', plan: recoilPlan('blocked-weapon-bounce'), elapsedMs: 100 });
  assert.equal(block.active, false);
  assert.equal(block.complete, true);
  assert.equal(block.reason, 'non-parry-outcome');
});
