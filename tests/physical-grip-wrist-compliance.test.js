import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE,
  computeSwordGripPointVelocity,
  solveCompliantGripPointImpulse,
  solveForearmAnchorImpulse,
  solveWristAngularComplianceImpulse,
  summarizeGripEnergyHandoff,
} from '../src/combat/physical-grip-wrist-compliance.js';

function magnitude(v) {
  return Math.hypot(v.x, v.y, v.z);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

test('G4.3B.5R.2.9.2 sword grip point velocity includes angular whip at the handle', () => {
  const velocity = computeSwordGripPointVelocity({
    swordCenter: { x: 0, y: 0, z: 0 },
    gripPoint: { x: -0.5, y: 0, z: 0 },
    swordLinearVelocity: { x: 0, y: 0, z: 2 },
    swordAngularVelocity: { x: 0, y: 4, z: 0 },
  });
  assert.ok(Math.abs(velocity.z - 4) < 1e-9);
});

test('G4.3B.5R.2.9.2 grip spring applies equal opposite impulses without hard snapping', () => {
  const result = solveCompliantGripPointImpulse({
    deltaSeconds: 1 / 240,
    swordCenter: { x: 0, y: 0, z: 0 },
    gripPoint: { x: -0.48, y: 0, z: 0 },
    handPoint: { x: -0.43, y: 0.03, z: 0 },
    swordLinearVelocity: { x: 0, y: 0, z: 0 },
    swordAngularVelocity: { x: 0, y: 0, z: 0 },
    handLinearVelocity: { x: 0, y: 0, z: 0 },
  });
  assert.equal(result.stage, PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE);
  assert.equal(result.applied, true);
  assert.ok(result.positionErrorMeters > 0.05);
  assert.ok(result.impulseMagnitudeNs > 0);
  assert.ok(result.impulseMagnitudeNs <= 0.95 + 1e-12);
  assert.ok(magnitude({
    x: result.impulseOnSword.x + result.impulseOnHand.x,
    y: result.impulseOnSword.y + result.impulseOnHand.y,
    z: result.impulseOnSword.z + result.impulseOnHand.z,
  }) < 1e-10);
});

test('G4.3B.5R.2.9.2 off-center grip correction changes sword angular velocity and hand velocity together', () => {
  const result = solveCompliantGripPointImpulse({
    deltaSeconds: 1 / 240,
    swordCenter: { x: 0, y: 0, z: 0 },
    gripPoint: { x: -0.50, y: 0, z: 0 },
    handPoint: { x: -0.50, y: 0.08, z: 0 },
    swordLinearVelocity: { x: 0, y: 0, z: 0 },
    swordAngularVelocity: { x: 0, y: 0, z: 0 },
    handLinearVelocity: { x: 0, y: 0, z: 0 },
  });
  assert.ok(magnitude(result.deltaSwordAngularVelocity) > 0.1);
  assert.ok(magnitude(result.deltaHandLinearVelocity) > 0.01);
});

test('G4.3B.5R.2.9.2 forearm anchor resists hand displacement instead of teleporting the hand home', () => {
  const result = solveForearmAnchorImpulse({
    deltaSeconds: 1 / 240,
    handPoint: { x: 0.13, y: -0.04, z: 0.02 },
    restHandPoint: { x: 0, y: 0, z: 0 },
    handLinearVelocity: { x: 0.8, y: 0, z: 0 },
  });
  assert.equal(result.applied, true);
  assert.ok(result.positionErrorMeters > 0.13);
  assert.ok(dot(result.impulseOnHand, { x: -1, y: 0, z: 0 }) > 0);
  assert.ok(result.impulseMagnitudeNs <= 0.48 + 1e-12);
});

test('G4.3B.5R.2.9.2 wrist damping transfers sword angular velocity into the hand while reducing free spin', () => {
  const result = solveWristAngularComplianceImpulse({
    deltaSeconds: 1 / 240,
    rotationErrorVector: { x: 0, y: 0, z: 0.12 },
    swordAngularVelocity: { x: 0, y: 0, z: 10 },
    handAngularVelocity: { x: 0, y: 0, z: 0 },
  });
  assert.equal(result.applied, true);
  assert.ok(result.nextSwordAngularVelocity.z < 10);
  assert.ok(result.nextHandAngularVelocity.z > 0);
  assert.ok(result.angularImpulseMagnitudeNms <= 0.085 + 1e-12);
});

test('G4.3B.5R.2.9.2 physical handoff telemetry measures contact to grip to forearm transfer', () => {
  const report = summarizeGripEnergyHandoff({
    bladeImpulseNs: 4,
    accumulatedGripImpulseNs: 2.4,
    accumulatedForearmImpulseNs: 1.1,
  });
  assert.equal(report.stage, PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE);
  assert.ok(Math.abs(report.gripTransferRatio - 0.6) < 1e-12);
  assert.ok(Math.abs(report.forearmTransferRatio - 0.275) < 1e-12);
});
