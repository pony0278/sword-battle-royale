import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUARD_COVERAGE_TARGET_PROFILE,
  GUARD_COVERAGE_TARGET_STAGE,
  createGuardCoverageTargetTracker,
  selectGuardCoverageTarget,
} from '../src/combat/guard-coverage-target.js';

const bucklerSurface = Object.freeze({
  center: Object.freeze({ x: 0, y: 1, z: 0.5 }),
  normal: Object.freeze({ x: 0, y: 0, z: 1 }),
  radius: 0.26,
  thickness: 0.02,
});

function approach(overrides = {}) {
  return Object.freeze({
    point: Object.freeze({ x: 0.3, y: 0.7, z: 0.44 }),
    planePoint: Object.freeze({ x: 0.3, y: 0.7, z: 0.5 }),
    signedDistance: -0.06,
    planeGapMeters: 0.05,
    radialDistanceMeters: 0.42,
    radialGapMeters: 0.16,
    combinedGapMeters: 0.17,
    ...overrides,
  });
}

function predicted(signedDistance) {
  return Object.freeze({
    selection: 'disc-distance',
    point: Object.freeze({ x: 0.1, y: 1.1, z: 0.5 }),
    worldPoint: Object.freeze({ x: 0.1, y: 1.1, z: 0.5 + signedDistance }),
    signedDistance,
    radialDistance: 0.14,
    surface: bucklerSurface,
  });
}

test('R18R.3 a close blade is measured, not predicted', () => {
  assert.equal(GUARD_COVERAGE_TARGET_STAGE, 'R18R.3');
  const selection = selectGuardCoverageTarget({
    direction: 'left', predictedThreat: predicted(0.02), approach: approach(), bucklerSurface,
  });
  assert.equal(selection.source, 'measured-swept-approach');
  assert.equal(selection.engaged, true);
  assert.equal(selection.threat.selection, 'measured-swept-approach');
});

test('R18R.7 the measured aim keeps the blade depth instead of its shadow on the shield plane', () => {
  const selection = selectGuardCoverageTarget({
    direction: 'left', approach: approach(), bucklerSurface,
  });
  // planePoint sits on the plane at z = 0.5; the blade itself is 6cm in front of it.
  assert.ok(Math.abs(selection.threat.point.z - 0.44) < 1e-9,
    'a correction built from the projected point can never close a depth gap');
  assert.ok(selection.threat.point.x > 0 && selection.threat.point.y < 1);
});

test('R18R.3 a far blade falls back to the direction anchor, and a near-plane prediction beats it', () => {
  const far = approach({ planeGapMeters: 1.7, combinedGapMeters: 1.9 });
  const anchored = selectGuardCoverageTarget({
    direction: 'left', predictedThreat: predicted(1.8), approach: far, bucklerSurface,
  });
  assert.equal(anchored.source, 'directional-anchor');
  assert.equal(anchored.engaged, false);
  assert.equal(anchored.threat.selection, 'directional-anchor');

  const credible = selectGuardCoverageTarget({
    direction: 'left',
    predictedThreat: predicted(GUARD_COVERAGE_TARGET_PROFILE.predictionCredibleePlaneMeters / 2),
    approach: far,
    bucklerSurface,
  });
  assert.equal(credible.source, 'predicted-threat');
  assert.equal(credible.threat.selection, 'disc-distance');
});

test('R18R.3 the tracker smooths a wandering prediction and snaps once measured', () => {
  const tracker = createGuardCoverageTargetTracker();
  const far = approach({ planeGapMeters: 1.7, combinedGapMeters: 1.9 });
  const first = tracker.select({
    sequence: 7, deltaSeconds: 1 / 60, direction: 'left', predictedThreat: predicted(0.1), approach: far, bucklerSurface,
  });
  assert.equal(first.smoothed, false);

  const jumped = tracker.select({
    sequence: 7,
    deltaSeconds: 1 / 60,
    direction: 'left',
    predictedThreat: Object.freeze({ ...predicted(0.1), point: { x: 1.5, y: 1.1, z: 0.5 } }),
    approach: far,
    bucklerSurface,
  });
  assert.equal(jumped.smoothed, true);
  assert.ok(jumped.threat.point.x > first.threat.point.x, 'the aim should move toward the new reading');
  assert.ok(jumped.threat.point.x < 1.5, 'but not jump straight to it');

  const engaged = tracker.select({
    sequence: 7, deltaSeconds: 1 / 60, direction: 'left', predictedThreat: predicted(0.1), approach: approach(), bucklerSurface,
  });
  assert.equal(engaged.smoothed, false);
  assert.equal(engaged.source, 'measured-swept-approach');

  const restarted = tracker.select({
    sequence: 8, deltaSeconds: 1 / 60, direction: 'left', predictedThreat: predicted(0.1), approach: far, bucklerSurface,
  });
  assert.equal(restarted.smoothed, false);
  tracker.reset();
  assert.equal(tracker.point, null);
});
