import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveSkyrimWeaponBindCorrection,
  invertQuaternionArray,
  multiplyQuaternionArrays,
  quaternionAngularErrorDegrees,
} from '../src/animation/skyrim-weapon-bind-calibration.js';

function axisAngle(axis, degrees) {
  const radians = degrees * Math.PI / 180;
  const half = radians / 2;
  const length = Math.hypot(...axis) || 1;
  const scale = Math.sin(half) / length;
  return [axis[0] * scale, axis[1] * scale, axis[2] * scale, Math.cos(half)];
}

test('G2.4.5 derives a bind correction as inverse target rest times converted source rest', () => {
  const targetRest = axisAngle([0, 1, 0], 25);
  const sourceRest = axisAngle([1, 0, 0], 70);
  const correction = deriveSkyrimWeaponBindCorrection(sourceRest, targetRest);
  const reconstructedSource = multiplyQuaternionArrays(targetRest, correction);
  assert.ok(quaternionAngularErrorDegrees(sourceRest, reconstructedSource) < 1e-6);
});

test('G2.4.5 bind correction remains valid under the same animated world delta', () => {
  const targetRest = axisAngle([0, 1, 0], -35);
  const sourceRest = axisAngle([0, 0, 1], 82);
  const correction = deriveSkyrimWeaponBindCorrection(sourceRest, targetRest);
  const animatedDelta = axisAngle([0.4, 0.8, -0.2], 41);

  const targetAnimated = multiplyQuaternionArrays(animatedDelta, targetRest);
  const correctedTargetFrame = multiplyQuaternionArrays(targetAnimated, correction);
  const sourceAnimated = multiplyQuaternionArrays(animatedDelta, sourceRest);

  assert.ok(quaternionAngularErrorDegrees(sourceAnimated, correctedTargetFrame) < 1e-6);
});

test('quaternion helpers preserve inverse and identity contracts', () => {
  const value = axisAngle([1, 2, 3], 123);
  const identity = multiplyQuaternionArrays(value, invertQuaternionArray(value));
  assert.ok(quaternionAngularErrorDegrees(identity, [0, 0, 0, 1]) < 1e-6);
});
