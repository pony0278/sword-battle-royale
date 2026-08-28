import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTIONAL_RECOIL_PLANNER_STAGE,
  RECOIL_RESPONSE_CLASSES,
  createDirectionalRecoilPlanner,
  planDirectionalRecoil,
} from '../src/combat/directional-recoil-planner.js';

function interruption(overrides = {}) {
  return {
    stage: 'G4.3B.1',
    sequence: 12,
    direction: 'left',
    clipId: 'UAL2/Sword_Regular_B',
    sourceTimeSeconds: 0.302,
    phaseAtInterrupt: 'attack_active',
    responseClass: RECOIL_RESPONSE_CLASSES.PARRY,
    contactPoint: { x: -0.12, y: 1.02, z: 0.03 },
    incomingVelocity: { x: 4, y: -1, z: 3 },
    incomingDirection: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

test('G4.3B.2 consumes G4.3B.1 interruption metadata without mutating source pose data', () => {
  const source = interruption();
  const plan = planDirectionalRecoil(source);
  assert.equal(plan.stage, DIRECTIONAL_RECOIL_PLANNER_STAGE);
  assert.equal(plan.planned, true);
  assert.equal(plan.sequence, 12);
  assert.equal(plan.sourceTimeSeconds, source.sourceTimeSeconds);
  assert.equal(plan.sourceClipId, source.clipId);
  assert.equal(plan.recovery.preserveFrozenContactPose, true);
});

test('G4.3B.2 block is intentionally smaller than parry and perfect parry', () => {
  const block = planDirectionalRecoil(interruption({ responseClass: RECOIL_RESPONSE_CLASSES.BLOCK }));
  const parry = planDirectionalRecoil(interruption({ responseClass: RECOIL_RESPONSE_CLASSES.PARRY }));
  const perfect = planDirectionalRecoil(interruption({ responseClass: RECOIL_RESPONSE_CLASSES.PERFECT_PARRY }));
  assert.ok(block.weapon.strength < parry.weapon.strength);
  assert.ok(parry.weapon.strength < perfect.weapon.strength);
  assert.ok(block.body.strength < parry.body.strength);
  assert.ok(parry.body.strength < perfect.body.strength);
  assert.ok(block.weapon.deflectDegrees < parry.weapon.deflectDegrees);
  assert.ok(parry.weapon.deflectDegrees < perfect.weapon.deflectDegrees);
});

test('G4.3B.2 left and right attacks mirror lateral redirect and body yaw', () => {
  const left = planDirectionalRecoil(interruption({ direction: 'left' }));
  const right = planDirectionalRecoil(interruption({ direction: 'right' }));
  assert.equal(left.weapon.lateralSign, 1);
  assert.equal(right.weapon.lateralSign, -1);
  assert.ok(left.body.yawDegrees > 0);
  assert.ok(right.body.yawDegrees < 0);
  assert.ok(left.weapon.lateralTangent.x * right.weapon.lateralTangent.x <= 0);
  assert.ok(left.weapon.lateralTangent.z * right.weapon.lateralTangent.z <= 0);
});

test('G4.3B.2 top attack adds stronger upward sword lift but keeps body recoil compact', () => {
  const top = planDirectionalRecoil(interruption({
    direction: 'top',
    contactPoint: { x: 0.08, y: 1.15, z: 0 },
    incomingVelocity: { x: 0.2, y: -6, z: 0.5 },
  }));
  const side = planDirectionalRecoil(interruption({
    direction: 'left',
    incomingVelocity: { x: 0.2, y: -6, z: 0.5 },
  }));
  assert.ok(top.weapon.verticalLift > side.weapon.verticalLift);
  assert.ok(Math.abs(top.body.yawDegrees) < Math.abs(side.body.yawDegrees));
  assert.ok(top.weapon.direction.y > 0);
});

test('G4.3B.2 primarily follows measured incoming velocity instead of metadata-only direction', () => {
  const a = planDirectionalRecoil(interruption({
    direction: 'left',
    incomingVelocity: { x: 6, y: 0, z: 0 },
  }));
  const b = planDirectionalRecoil(interruption({
    direction: 'left',
    incomingVelocity: { x: 0, y: 0, z: 6 },
  }));
  assert.ok(a.weapon.direction.x < -0.5);
  assert.ok(b.weapon.direction.z < -0.5);
  assert.notDeepEqual(a.weapon.direction, b.weapon.direction);
});

test('G4.3B.2 rejects unsupported response classes and missing vectors', () => {
  const unsupported = planDirectionalRecoil(interruption({ responseClass: 'none' }));
  assert.equal(unsupported.planned, false);
  assert.equal(unsupported.reason, 'unsupported-response-class');

  const missing = planDirectionalRecoil(interruption({
    incomingVelocity: { x: 0, y: 0, z: 0 },
    incomingDirection: { x: 0, y: 0, z: 0 },
  }));
  assert.equal(missing.planned, false);
  assert.equal(missing.reason, 'missing-incoming-direction');
});

test('G4.3B.2 planner stores only successful last plan and can reset', () => {
  const planner = createDirectionalRecoilPlanner();
  const failed = planner.plan(interruption({ responseClass: 'none' }));
  assert.equal(failed.planned, false);
  assert.equal(planner.lastPlan, null);
  const planned = planner.plan(interruption());
  assert.equal(planner.lastPlan, planned);
  planner.reset();
  assert.equal(planner.lastPlan, null);
});
