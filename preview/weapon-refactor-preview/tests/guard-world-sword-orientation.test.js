import test from 'node:test';
import assert from 'node:assert/strict';
import {
  quaternionAngleDegrees,
  sampleWorldSwordRecoveryOrientation,
  solveLocalQuaternionForWorld,
  slerpShortestQuaternion,
} from '../src/combat/guard-world-sword-orientation.js';

const SOURCE = Object.freeze({
  x: -0.6742370619927976,
  y: -0.34691696721000514,
  z: 0.29828615812387166,
  w: 0.5797226515705557,
});

const TARGET = Object.freeze({
  x: 0.5939642159900789,
  y: 0.006431153875420006,
  z: -0.49959525548607797,
  w: 0.6305312217252663,
});

test('G3.4.1.1 world sword recovery follows a monotonic shortest path to Guard Hold', () => {
  const progressValues = [0, 0.05, 0.10, 0.25, 0.50, 0.75, 1];
  const angles = progressValues.map((progress) => quaternionAngleDegrees(
    sampleWorldSwordRecoveryOrientation(SOURCE, TARGET, progress),
    TARGET,
  ));

  assert.ok(angles[0] > 150, 'diagnostic fixture must preserve the large Counter→Guard orientation gap');
  for (let index = 1; index < angles.length; index += 1) {
    assert.ok(
      angles[index] <= angles[index - 1] + 1e-7,
      `world sword orientation moved away from Guard at ${progressValues[index] * 100}%`,
    );
  }
  assert.ok(angles.at(-1) < 1e-6);
});

test('G3.4.1.1 shortest slerp is sign-invariant for equivalent quaternion targets', () => {
  const negatedTarget = {
    x: -TARGET.x,
    y: -TARGET.y,
    z: -TARGET.z,
    w: -TARGET.w,
  };
  const a = slerpShortestQuaternion(SOURCE, TARGET, 0.4);
  const b = slerpShortestQuaternion(SOURCE, negatedTarget, 0.4);
  assert.ok(quaternionAngleDegrees(a, b) < 1e-6);
});

test('G3.4.1.1 solves weapon local quaternion from the current parent world orientation', () => {
  const parentWorld = Object.freeze({ x: 0, y: Math.sin(Math.PI / 8), z: 0, w: Math.cos(Math.PI / 8) });
  const desiredWorld = Object.freeze({ x: Math.sin(Math.PI / 12), y: 0, z: 0, w: Math.cos(Math.PI / 12) });
  const local = solveLocalQuaternionForWorld(parentWorld, desiredWorld);

  // Re-compose parent * local using the exported shortest-slerp helper only for normalization sanity.
  // The exact world result is independently checked through quaternion angle after manual multiply.
  const multiply = (a, b) => ({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
  const recomposed = multiply(parentWorld, local);
  assert.ok(quaternionAngleDegrees(recomposed, desiredWorld) < 1e-6);
});
