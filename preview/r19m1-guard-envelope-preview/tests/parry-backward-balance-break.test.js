import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARRY_BACKWARD_BALANCE_BREAK_STAGE,
  PARRY_BACKWARD_BALANCE_BREAK_PROFILES,
  sampleParryBackwardBalanceBreak,
} from '../src/combat/parry-backward-balance-break.js';

function plan(responseClass = 'parry-directional-recoil') {
  return {
    planned: true,
    responseClass,
    attackDirection: 'right',
    weapon: { lateralSign: -1 },
    body: {
      strength: responseClass.startsWith('perfect') ? 0.56 : 0.38,
      yawDegrees: responseClass.startsWith('perfect') ? -15 : -10,
      pitchDegrees: responseClass.startsWith('perfect') ? -10 : -7,
      rollDegrees: responseClass.startsWith('perfect') ? -4.2 : -2.8,
    },
  };
}

test('G4.3B.5R.2.6 ordinary Parry is backward-pitch dominant at peak', () => {
  const sample = sampleParryBackwardBalanceBreak({
    outcome: 'parry',
    plan: plan(),
    elapsedMs: PARRY_BACKWARD_BALANCE_BREAK_PROFILES.parry.riseEndMs,
  });
  assert.equal(sample.stage, PARRY_BACKWARD_BALANCE_BREAK_STAGE);
  assert.equal(sample.phase, 'peak');
  assert.ok(sample.chestBackwardDegrees >= 11.5);
  assert.ok(sample.pose.chestPitchDegrees <= -11.5);
  assert.ok(Math.abs(sample.pose.chestPitchDegrees) > Math.abs(sample.pose.chestYawDegrees) * 2);
  assert.ok(sample.pose.hipsPitchDegrees > 0, 'hips should counter-pitch under the backward chest');
  assert.ok(Math.max(sample.pose.leftKneeBendDegrees, sample.pose.rightKneeBendDegrees) >= 8);
  assert.equal(sample.bodyFirst, true);
  assert.equal(sample.contactConstraintLast, true);
  assert.equal(sample.rootMotion, false);
});

test('G4.3B.5R.2.6 Perfect Parry is a stronger almost-fall than normal Parry', () => {
  const normal = sampleParryBackwardBalanceBreak({ outcome: 'parry', plan: plan(), elapsedMs: 100 });
  const perfect = sampleParryBackwardBalanceBreak({
    outcome: 'perfect-parry',
    plan: plan('perfect-parry-directional-recoil'),
    elapsedMs: 100,
  });
  assert.ok(perfect.chestBackwardDegrees >= 15);
  assert.ok(perfect.chestBackwardDegrees > normal.chestBackwardDegrees);
  assert.ok(Math.max(perfect.pose.leftKneeBendDegrees, perfect.pose.rightKneeBendDegrees)
    > Math.max(normal.pose.leftKneeBendDegrees, normal.pose.rightKneeBendDegrees));
});

test('G4.3B.5R.2.6 never activates for Block', () => {
  const sample = sampleParryBackwardBalanceBreak({
    outcome: 'block',
    plan: { ...plan(), responseClass: 'blocked-weapon-bounce' },
    elapsedMs: 100,
  });
  assert.equal(sample.active, false);
  assert.equal(sample.complete, true);
  assert.equal(sample.reason, 'non-parry-outcome');
});
