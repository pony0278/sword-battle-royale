import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANATOMICAL_3D_DOF_NAMES,
  buildBladePolylineFromAnatomicalArm3D,
  computeAnatomical3dContactJacobian,
  computeAnatomical3dPointVelocity,
  forwardAnatomicalSwordArm3D,
  solveAnatomical3dContactImpulse,
  stepAnatomical3dJointState,
} from '../src/combat/anatomical-3d-joint-response.js';

const shoulderOrigin = { x: -0.95, y: 1.16, z: -0.70 };
const geometry = {
  upperArmLengthMeters: 0.38,
  forearmLengthMeters: 0.31,
  handLengthMeters: 0.10,
  guardOffsetMeters: 0.08,
  swordLengthMeters: 1.05,
};
const rest = {
  shoulderYaw: 0.24,
  shoulderPitch: -0.10,
  shoulderRoll: 0.08,
  elbowFlex: -0.44,
  forearmRoll: 0.12,
  wristFlex: 0.28,
  wristDeviation: -0.06,
};

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scaleVelocity(qdot, factor) {
  return Object.fromEntries(ANATOMICAL_3D_DOF_NAMES.map((name) => [name, (qdot[name] || 0) * factor]));
}

test('R1.1 FK keeps anatomical segment lengths and rigid Grip', () => {
  const k = forwardAnatomicalSwordArm3D({ shoulderOrigin, geometry, anglesRad: rest });
  assert.ok(Math.abs(distance(k.shoulder, k.elbow) - geometry.upperArmLengthMeters) < 1e-9);
  assert.ok(Math.abs(distance(k.elbow, k.wrist) - geometry.forearmLengthMeters) < 1e-9);
  assert.ok(Math.abs(distance(k.wrist, k.grip) - geometry.handLengthMeters) < 1e-9);
  assert.ok(Math.abs(distance(k.grip, k.bladeStart) - geometry.guardOffsetMeters) < 1e-9);
  assert.equal(k.rigidGrip, true);
  assert.equal(k.handTranslationDof, false);
  assert.equal(k.anatomical3d, true);
  const polyline = buildBladePolylineFromAnatomicalArm3D(k);
  assert.equal(polyline.length, 3);
});

test('R1.1 shoulder pitch and wrist deviation create genuine out-of-plane motion', () => {
  const base = forwardAnatomicalSwordArm3D({ shoulderOrigin, geometry, anglesRad: rest });
  const changed = forwardAnatomicalSwordArm3D({
    shoulderOrigin,
    geometry,
    anglesRad: { ...rest, shoulderPitch: rest.shoulderPitch + 0.22, wristDeviation: rest.wristDeviation + 0.24 },
  });
  assert.ok(Math.abs(changed.elbow.y - base.elbow.y) > 0.02);
  assert.ok(Math.abs(changed.bladeTip.z - base.bladeTip.z) > 0.02);
});

test('R1.1 finite-difference Jacobian matches short-step FK point motion', () => {
  const qdot = {
    shoulderYaw: 0.35,
    shoulderPitch: -0.22,
    shoulderRoll: 0.18,
    elbowFlex: 0.42,
    forearmRoll: -0.28,
    wristFlex: 0.55,
    wristDeviation: 0.31,
  };
  const bladeFraction = 0.58;
  const report = computeAnatomical3dContactJacobian({ shoulderOrigin, geometry, anglesRad: rest, bladeFraction });
  const predictedVelocity = computeAnatomical3dPointVelocity({ jacobian: report.jacobian, jointVelocityRadPerSecond: qdot });
  const dt = 1e-5;
  const k0 = forwardAnatomicalSwordArm3D({ shoulderOrigin, geometry, anglesRad: rest });
  const nextAngles = Object.fromEntries(ANATOMICAL_3D_DOF_NAMES.map((name) => [name, rest[name] + qdot[name] * dt]));
  const k1 = forwardAnatomicalSwordArm3D({ shoulderOrigin, geometry, anglesRad: nextAngles });
  const point = (k) => ({
    x: k.bladeStart.x + (k.bladeTip.x - k.bladeStart.x) * bladeFraction,
    y: k.bladeStart.y + (k.bladeTip.y - k.bladeStart.y) * bladeFraction,
    z: k.bladeStart.z + (k.bladeTip.z - k.bladeStart.z) * bladeFraction,
  });
  const p0 = point(k0);
  const p1 = point(k1);
  const finiteDifference = { x: (p1.x - p0.x) / dt, y: (p1.y - p0.y) / dt, z: (p1.z - p0.z) / dt };
  assert.ok(distance(predictedVelocity, finiteDifference) < 0.002);
});

test('R1.1 contact impulse distributes response across 3D wrist elbow shoulder channels', () => {
  const k = forwardAnatomicalSwordArm3D({ shoulderOrigin, geometry, anglesRad: rest });
  const result = solveAnatomical3dContactImpulse({
    kinematics: k,
    anglesRad: rest,
    bladeFraction: 0.62,
    contactNormal: { x: 0.34, y: 0.10, z: -0.94 },
    shieldPointVelocity: { x: 2.6, y: 0.35, z: -2.2 },
    jointVelocityRadPerSecond: {
      shoulderYaw: 0.9,
      shoulderPitch: 0.18,
      shoulderRoll: 0.06,
      elbowFlex: 0.28,
      forearmRoll: 0.04,
      wristFlex: 0.10,
      wristDeviation: 0.02,
    },
  });
  assert.equal(result.applied, true);
  assert.ok(Math.abs(result.deltaJointVelocityRadPerSecond.wristFlex) + Math.abs(result.deltaJointVelocityRadPerSecond.wristDeviation) > 0.01);
  assert.ok(Math.abs(result.deltaJointVelocityRadPerSecond.elbowFlex) > 0.001);
  assert.ok(
    Math.abs(result.deltaJointVelocityRadPerSecond.shoulderYaw)
    + Math.abs(result.deltaJointVelocityRadPerSecond.shoulderPitch)
    + Math.abs(result.deltaJointVelocityRadPerSecond.shoulderRoll) > 0.001,
  );
});

test('R1.1 faster shield point motion produces stronger generalized recoil', () => {
  const k = forwardAnatomicalSwordArm3D({ shoulderOrigin, geometry, anglesRad: rest });
  const baseInput = {
    kinematics: k,
    anglesRad: rest,
    bladeFraction: 0.60,
    contactNormal: { x: 0.30, y: 0.08, z: -0.95 },
    jointVelocityRadPerSecond: scaleVelocity({}, 0),
    restitution: 0.2,
  };
  const slow = solveAnatomical3dContactImpulse({ ...baseInput, shieldPointVelocity: { x: 0.8, y: 0.1, z: -1.4 } });
  const fast = solveAnatomical3dContactImpulse({ ...baseInput, shieldPointVelocity: { x: 2.8, y: 0.4, z: -3.8 } });
  assert.equal(slow.applied, true);
  assert.equal(fast.applied, true);
  assert.ok(fast.normalImpulseNs > slow.normalImpulseNs);
});

test('R1.1 separating contact creates no invented recoil', () => {
  const k = forwardAnatomicalSwordArm3D({ shoulderOrigin, geometry, anglesRad: rest });
  const result = solveAnatomical3dContactImpulse({
    kinematics: k,
    anglesRad: rest,
    bladeFraction: 0.55,
    contactNormal: { x: 0, y: 0, z: -1 },
    shieldPointVelocity: { x: 0, y: 0, z: 3 },
    jointVelocityRadPerSecond: scaleVelocity({}, 0),
  });
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'separating-or-not-closing');
});

test('R1.1 passive integration respects anatomical limits', () => {
  const state = {
    anglesRad: { ...rest, wristDeviation: 0.47, shoulderRoll: 0.81 },
    jointVelocityRadPerSecond: {
      shoulderYaw: 0,
      shoulderPitch: 0,
      shoulderRoll: 8,
      elbowFlex: 0,
      forearmRoll: 0,
      wristFlex: 0,
      wristDeviation: 8,
    },
  };
  let next = state;
  for (let i = 0; i < 40; i += 1) next = stepAnatomical3dJointState(next, 1 / 240, { restAnglesRad: rest });
  assert.ok(next.anglesRad.wristDeviation <= 0.48 + 1e-9);
  assert.ok(next.anglesRad.shoulderRoll <= 0.82 + 1e-9);
});