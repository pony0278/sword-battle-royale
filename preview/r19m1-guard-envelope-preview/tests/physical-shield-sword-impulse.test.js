import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHYSICAL_SHIELD_SWORD_IMPULSE_STAGE,
  computeShieldContactPointVelocity,
  solveKinematicShieldSwordImpulse,
} from '../src/combat/physical-shield-sword-impulse.js';

function magnitude(v) {
  return Math.hypot(v.x, v.y, v.z);
}

const BASE = Object.freeze({
  swordMassKg: 1.35,
  swordLengthMeters: 1.05,
  restitution: 0.34,
  friction: 0.62,
  swordCenter: { x: 0, y: 1.1, z: -0.24 },
  shieldCenter: { x: 0.08, y: 1.12, z: 0 },
  contactPoint: { x: 0.08, y: 1.1, z: -0.02 },
  contactNormal: { x: 0.48, y: 0.02, z: -0.88 },
  swordLinearVelocity: { x: 0, y: 0, z: 4.6 },
  swordAngularVelocity: { x: 0, y: 0, z: 0 },
  shieldLinearVelocity: { x: 3.8, y: 0.2, z: 0.2 },
  shieldAngularVelocity: { x: 0.2, y: 7.5, z: 1.2 },
});

test('G4.3B.5R.2.9 shield contact point velocity includes angular sweep velocity', () => {
  const withRotation = computeShieldContactPointVelocity({
    center: { x: 0, y: 0, z: 0 },
    contactPoint: { x: 0.42, y: 0, z: 0 },
    linearVelocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 8 },
  });
  assert.ok(Math.abs(withRotation.y - 3.36) < 1e-9);
  assert.ok(magnitude(withRotation) > 3.3);
});

test('G4.3B.5R.2.9 moving shield collision produces immediate sword linear and angular velocity change', () => {
  const hit = solveKinematicShieldSwordImpulse(BASE);
  assert.equal(hit.stage, PHYSICAL_SHIELD_SWORD_IMPULSE_STAGE);
  assert.equal(hit.applied, true);
  assert.ok(hit.normalImpulseNs > 0);
  assert.ok(magnitude(hit.deltaLinearVelocity) > 0.5);
  assert.ok(hit.angularSpeedGainRadPerSecond > 0.5);
  assert.ok(magnitude(hit.nextSwordAngularVelocity) > magnitude(BASE.swordAngularVelocity));
});

test('G4.3B.5R.2.9 faster shield sweep produces a stronger sword reaction', () => {
  const slow = solveKinematicShieldSwordImpulse({
    ...BASE,
    shieldLinearVelocity: { x: 1.2, y: 0, z: 0.1 },
    shieldAngularVelocity: { x: 0, y: 2.2, z: 0.4 },
  });
  const fast = solveKinematicShieldSwordImpulse({
    ...BASE,
    shieldLinearVelocity: { x: 5.2, y: 0.3, z: 0.3 },
    shieldAngularVelocity: { x: 0.4, y: 10.5, z: 1.8 },
  });
  assert.equal(slow.applied, true);
  assert.equal(fast.applied, true);
  assert.ok(fast.normalImpulseNs > slow.normalImpulseNs);
  assert.ok(fast.angularSpeedGainRadPerSecond > slow.angularSpeedGainRadPerSecond);
});

test('G4.3B.5R.2.9 off-center contact creates more spin than near-center contact', () => {
  const nearCenter = solveKinematicShieldSwordImpulse({
    ...BASE,
    swordCenter: { x: 0, y: 1.1, z: -0.04 },
    contactPoint: { x: 0.01, y: 1.1, z: -0.02 },
  });
  const offCenter = solveKinematicShieldSwordImpulse({
    ...BASE,
    swordCenter: { x: 0, y: 1.1, z: -0.42 },
    contactPoint: { x: 0.08, y: 1.1, z: -0.02 },
  });
  assert.equal(nearCenter.applied, true);
  assert.equal(offCenter.applied, true);
  assert.ok(offCenter.angularSpeedGainRadPerSecond > nearCenter.angularSpeedGainRadPerSecond);
});

test('G4.3B.5R.2.9 separating contacts do not invent a recoil impulse', () => {
  const miss = solveKinematicShieldSwordImpulse({
    ...BASE,
    swordLinearVelocity: { x: -5, y: 0, z: -5 },
    shieldLinearVelocity: { x: 5, y: 0, z: 1 },
  });
  assert.equal(miss.applied, false);
  assert.equal(miss.normalImpulseNs, 0);
  assert.equal(miss.angularSpeedGainRadPerSecond, 0);
});
