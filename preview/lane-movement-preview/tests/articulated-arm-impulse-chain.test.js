import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTICULATED_ARM_IMPULSE_CHAIN_STAGE,
  buildBladePolylineFromArticulatedArm,
  computeArticulatedContactJacobian,
  computeArticulatedPointVelocity,
  forwardArticulatedSwordArm,
  solveArticulatedArmContactImpulse,
  stepArticulatedArmState,
} from '../src/combat/articulated-arm-impulse-chain.js';

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function magnitudeJointMap(map) {
  return Math.hypot(map.shoulder, map.elbow, map.wrist);
}

const POSE = Object.freeze({
  shoulderOrigin: Object.freeze({ x: -0.95, y: 1.12, z: -0.70 }),
  anglesRad: Object.freeze({
    shoulder: 15 * Math.PI / 180,
    elbow: -25 * Math.PI / 180,
    wrist: 20 * Math.PI / 180,
  }),
});

const ATTACK_QDOT = Object.freeze({ shoulder: 1.4, elbow: 0.4, wrist: 0.2 });

test('G4.3B.5R.2.9.2R1 forward kinematics keeps rigid segment lengths and a rigid sword grip', () => {
  const k = forwardArticulatedSwordArm(POSE);
  assert.equal(k.stage, ARTICULATED_ARM_IMPULSE_CHAIN_STAGE);
  assert.equal(k.rigidGrip, true);
  assert.equal(k.handTranslationDof, false);
  assert.ok(Math.abs(distance(k.shoulder, k.elbow) - 0.38) < 1e-9);
  assert.ok(Math.abs(distance(k.elbow, k.wrist) - 0.31) < 1e-9);
  assert.ok(Math.abs(distance(k.wrist, k.grip) - 0.10) < 1e-9);
  assert.ok(Math.abs(distance(k.grip, k.bladeStart) - 0.08) < 1e-9);
  assert.ok(Math.abs(distance(k.bladeStart, k.bladeTip) - 1.05) < 1e-9);

  const blade = buildBladePolylineFromArticulatedArm(k);
  assert.equal(blade.length, 3);
  assert.deepEqual(blade[0], k.bladeStart);
  assert.deepEqual(blade[1], k.bladeMid);
  assert.deepEqual(blade[2], k.bladeTip);
});

test('G4.3B.5R.2.9.2R1 contact point velocity comes from shoulder elbow wrist Jacobians, not hand translation', () => {
  const k = forwardArticulatedSwordArm(POSE);
  const jacobian = computeArticulatedContactJacobian({ kinematics: k, contactPoint: k.bladeMid });
  const velocity = computeArticulatedPointVelocity({
    jacobian,
    jointVelocityRadPerSecond: ATTACK_QDOT,
  });

  const dt = 1e-5;
  const advanced = forwardArticulatedSwordArm({
    ...POSE,
    anglesRad: {
      shoulder: POSE.anglesRad.shoulder + ATTACK_QDOT.shoulder * dt,
      elbow: POSE.anglesRad.elbow + ATTACK_QDOT.elbow * dt,
      wrist: POSE.anglesRad.wrist + ATTACK_QDOT.wrist * dt,
    },
  });
  const finiteDifference = {
    x: (advanced.bladeMid.x - k.bladeMid.x) / dt,
    y: (advanced.bladeMid.y - k.bladeMid.y) / dt,
    z: (advanced.bladeMid.z - k.bladeMid.z) / dt,
  };

  assert.ok(Math.abs(velocity.x - finiteDifference.x) < 2e-4);
  assert.ok(Math.abs(velocity.z - finiteDifference.z) < 2e-4);
  assert.equal(velocity.y, 0);
});

test('G4.3B.5R.2.9.2R1 blade impact distributes angular velocity immediately into wrist elbow and shoulder', () => {
  const k = forwardArticulatedSwordArm(POSE);
  const hit = solveArticulatedArmContactImpulse({
    kinematics: k,
    contactPoint: k.bladeMid,
    contactNormal: { x: 0, y: 0, z: -1 },
    shieldPointVelocity: { x: 0, y: 0, z: -2.2 },
    jointVelocityRadPerSecond: ATTACK_QDOT,
    restitution: 0.38,
    friction: 0.58,
  });

  assert.equal(hit.applied, true);
  assert.equal(hit.rigidGrip, true);
  assert.equal(hit.handTranslationDof, false);
  assert.ok(hit.normalImpulseNs > 0);
  assert.ok(magnitudeJointMap(hit.deltaJointVelocityRadPerSecond) > 0.5);
  assert.ok(Math.abs(hit.deltaJointVelocityRadPerSecond.wrist) > Math.abs(hit.deltaJointVelocityRadPerSecond.shoulder));
  assert.ok(Math.abs(hit.deltaJointVelocityRadPerSecond.elbow) > Math.abs(hit.deltaJointVelocityRadPerSecond.shoulder));
  assert.notEqual(hit.nextJointVelocityRadPerSecond.wrist, ATTACK_QDOT.wrist);
  assert.notEqual(hit.nextJointVelocityRadPerSecond.elbow, ATTACK_QDOT.elbow);
  assert.notEqual(hit.nextJointVelocityRadPerSecond.shoulder, ATTACK_QDOT.shoulder);
});

test('G4.3B.5R.2.9.2R1 faster shield motion produces stronger articulated recoil without a free-sword state', () => {
  const k = forwardArticulatedSwordArm(POSE);
  const common = {
    kinematics: k,
    contactPoint: k.bladeMid,
    contactNormal: { x: 0, y: 0, z: -1 },
    jointVelocityRadPerSecond: ATTACK_QDOT,
  };
  const slow = solveArticulatedArmContactImpulse({ ...common, shieldPointVelocity: { x: 0, y: 0, z: -0.4 } });
  const fast = solveArticulatedArmContactImpulse({ ...common, shieldPointVelocity: { x: 0, y: 0, z: -3.2 } });
  assert.equal(slow.applied, true);
  assert.equal(fast.applied, true);
  assert.ok(fast.normalImpulseNs > slow.normalImpulseNs);
  assert.ok(magnitudeJointMap(fast.deltaJointVelocityRadPerSecond) > magnitudeJointMap(slow.deltaJointVelocityRadPerSecond));
});

test('G4.3B.5R.2.9.2R1 separating contact does not invent joint recoil', () => {
  const k = forwardArticulatedSwordArm(POSE);
  const miss = solveArticulatedArmContactImpulse({
    kinematics: k,
    contactPoint: k.bladeMid,
    contactNormal: { x: 0, y: 0, z: 1 },
    shieldPointVelocity: { x: 0, y: 0, z: -3 },
    jointVelocityRadPerSecond: ATTACK_QDOT,
  });
  assert.equal(miss.applied, false);
  assert.equal(miss.normalImpulseNs, 0);
  assert.equal(magnitudeJointMap(miss.deltaJointVelocityRadPerSecond), 0);
});

test('G4.3B.5R.2.9.2R1 passive joint integration preserves rigid topology and enforces angular limits', () => {
  const next = stepArticulatedArmState({
    anglesRad: { shoulder: 1.19, elbow: 0.71, wrist: 0.87 },
    jointVelocityRadPerSecond: { shoulder: 8, elbow: 9, wrist: 12 },
  }, 1 / 60, {
    restAnglesRad: POSE.anglesRad,
  });
  assert.equal(next.rigidGrip, true);
  assert.equal(next.handTranslationDof, false);
  assert.ok(next.anglesRad.shoulder <= 1.20);
  assert.ok(next.anglesRad.elbow <= 0.72);
  assert.ok(next.anglesRad.wrist <= 0.88);
  assert.ok(next.limitHits.shoulder || next.limitHits.elbow || next.limitHits.wrist);
});
