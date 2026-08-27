import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARRIED_TORSO_LEAN_BONES,
  PARRIED_TORSO_WORLD_LEAN_PROFILES,
  computeParriedTorsoLeanCorrection,
  planParriedTorsoWorldLean,
  sampleParriedTorsoLeanTarget,
} from '../src/combat/parried-torso-world-lean.js';

const BACKWARD = Object.freeze({ x: 0.1, y: -0.3, z: 0.95 });

// The number this module exists for: the frozen TOP contact pose leans +13
// degrees toward the defender, and the additive reaction only reached +5 --
// never behind vertical -- while the same plan from an upright base reached
// -15. The plan must aim in world space, past vertical.
test('R18P.2 plans a world-space target behind vertical from a forward-leaning base', () => {
  const plan = planParriedTorsoWorldLean({ outcome: 'parry', backwardDirection: BACKWARD, baseLeanDegrees: 13 });
  assert.equal(plan.accepted, true);
  assert.equal(plan.baseLeanDegrees, 13);
  assert.equal(plan.targetBackwardLeanDegrees, 16);
  // The lateral axis is horizontal and perpendicular to the travel direction.
  assert.equal(plan.lateralAxis.y, 0);
  assert.ok(Math.abs(plan.lateralAxis.x * plan.backward.x + plan.lateralAxis.z * plan.backward.z) < 1e-9);
  assert.equal(planParriedTorsoWorldLean({ backwardDirection: { x: 0, y: 1, z: 0 } }).accepted, false);
});

test('R18P.2 target eases in, crosses vertical at full weight, and overshoots with the collapse', () => {
  const plan = planParriedTorsoWorldLean({ outcome: 'parry', backwardDirection: BACKWARD, baseLeanDegrees: 13 });
  const atEntry = sampleParriedTorsoLeanTarget(plan, { torsoWeight: 1, elapsedMs: 0 });
  assert.ok(Math.abs(atEntry.targetLeanDegrees - 13) < 1e-9, 'entry starts at the base lean');

  const held = sampleParriedTorsoLeanTarget(plan, { torsoWeight: 1, elapsedMs: plan.entryRiseMs });
  assert.ok(Math.abs(held.targetLeanDegrees - (-16)) < 1e-9);
  assert.equal(held.behindVertical, true);

  const collapse = sampleParriedTorsoLeanTarget(plan, { torsoWeight: 1.03, elapsedMs: 600 });
  assert.ok(collapse.targetLeanDegrees < -16, 'the collapse surge pushes past the nominal target');

  const settling = sampleParriedTorsoLeanTarget(plan, { torsoWeight: 0.2, elapsedMs: 900 });
  assert.ok(settling.targetLeanDegrees > 0, 'the settle walks back toward the base lean');
});

test('R18P.2 correction closes the full remaining gap, bounded', () => {
  const plan = planParriedTorsoWorldLean({ outcome: 'parry', backwardDirection: BACKWARD, baseLeanDegrees: 13 });
  const target = sampleParriedTorsoLeanTarget(plan, { torsoWeight: 1, elapsedMs: plan.entryRiseMs });
  const correction = computeParriedTorsoLeanCorrection(plan, 5, target);
  // +5 now, -16 wanted: rotate 21 degrees toward backward.
  assert.ok(Math.abs(correction.correctionDegrees - 21) < 1e-9);
  const huge = computeParriedTorsoLeanCorrection(plan, 80, target);
  assert.equal(huge.correctionDegrees, plan.profile.maximumCorrectionDegrees);
});

test('R18P.2 distributes the correction across the torso and sums to one', () => {
  for (const profile of Object.values(PARRIED_TORSO_WORLD_LEAN_PROFILES)) {
    const total = PARRIED_TORSO_LEAN_BONES
      .reduce((sum, bone) => sum + profile.distribution[bone], 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `${profile.outcome} shares must sum to 1`);
    assert.ok(profile.distribution.hips <= 0.35, 'most of the bend stays above the pelvis so the feet keep their plant');
  }
  const perfect = PARRIED_TORSO_WORLD_LEAN_PROFILES['perfect-parry'];
  assert.ok(perfect.targetBackwardLeanDegrees > PARRIED_TORSO_WORLD_LEAN_PROFILES.parry.targetBackwardLeanDegrees);
});
