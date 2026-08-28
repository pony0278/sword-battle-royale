import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REACHABLE_PARRY_INTERCEPT_TARGET_STAGE,
  selectReachableParryInterceptTarget,
} from '../src/combat/reachable-parry-intercept-target.js';

const surface = Object.freeze({
  center: Object.freeze({ x: 0, y: 0, z: 0 }),
  normal: Object.freeze({ x: 0, y: 0, z: 1 }),
  radius: 0.26,
  thickness: 0.075,
});

function threatAt(x) {
  return Object.freeze({
    point: Object.freeze({ x, y: 0, z: 0 }),
    worldPoint: Object.freeze({ x, y: 0, z: 0.04 }),
    signedDistance: 0.04,
    radialDistance: Math.abs(x),
    outsideDisc: Math.max(0, Math.abs(x) - surface.radius),
    bladeFraction: 0.5,
  });
}

function leftClosest(overrides = {}) {
  return Object.freeze({
    point: Object.freeze({ x: 0.294, y: 0, z: 0.0475 }),
    planePoint: Object.freeze({ x: 0.294, y: 0, z: 0 }),
    signedDistance: 0.0475,
    planeGapMeters: 0.01,
    radialDistanceMeters: 0.294,
    radialGapMeters: 0.034,
    combinedGapMeters: Math.hypot(0.01, 0.034),
    bladeFraction: 0.5,
    sweepAlpha: 0.8,
    ...overrides,
  });
}

test('LEFT-like unreachable prediction falls back to reachable measured sweep geometry', () => {
  const selected = selectReachableParryInterceptTarget({
    predictedThreat: threatAt(1.105),
    predictedTrackingPlan: Object.freeze({ requiredDistance: 0.949, reachable: false }),
    closestApproach: leftClosest(),
    bucklerSurface: surface,
  });
  assert.equal(selected.stage, REACHABLE_PARRY_INTERCEPT_TARGET_STAGE);
  assert.equal(selected.fallbackApplied, true);
  assert.equal(selected.source, 'measured-current-sweep-closest-approach');
  assert.equal(selected.predictedRequiredDistanceMeters, 0.949);
  assert.ok(selected.measuredRequiredDistanceMeters > 0.13 && selected.measuredRequiredDistanceMeters < 0.15);
  assert.equal(selected.authority, 'guidance-only-real-swept-contact-remains-success-authority');

  assert.equal(selected.trackingPlan, selected.measuredTrackingPlan);
  assert.equal(selected.trackingPlan.reachable, true);
  assert.equal(selected.trackingPlan.reason, 'measured-sweep-relative-contact-correction');
  assert.ok(Math.abs(selected.trackingPlan.requiredDistance - 0.074) < 1e-9);
  assert.ok(Math.abs(selected.trackingPlan.appliedDistance - 0.074) < 1e-9);
  assert.ok(Math.abs(selected.trackingPlan.correction.x - 0.074) < 1e-9);
  assert.equal(selected.trackingPlan.correction.y, 0);
  assert.equal(selected.trackingPlan.correction.z, 0);
});

test('reachable linear prediction is preserved for existing TOP and RIGHT paths', () => {
  const predictedThreat = threatAt(0.28);
  const selected = selectReachableParryInterceptTarget({
    predictedThreat,
    predictedTrackingPlan: Object.freeze({ requiredDistance: 0.124, reachable: true }),
    closestApproach: leftClosest(),
    bucklerSurface: surface,
  });
  assert.equal(selected.fallbackApplied, false);
  assert.equal(selected.source, 'linear-predicted-threat');
  assert.equal(selected.threat, predictedThreat);
});

test('a distant measured sweep cannot override an unreachable prediction', () => {
  const selected = selectReachableParryInterceptTarget({
    predictedThreat: threatAt(1.105),
    predictedTrackingPlan: Object.freeze({ requiredDistance: 0.949, reachable: false }),
    closestApproach: leftClosest({ planeGapMeters: 0.22, combinedGapMeters: 0.223 }),
    bucklerSurface: surface,
  });
  assert.equal(selected.fallbackApplied, false);
  assert.equal(selected.measuredInsideAcquisitionBand, false);
  assert.equal(selected.source, 'linear-predicted-threat');
});

test('edge-contact reach stays eligible even when the comfort-radius plan will clamp', () => {
  const selected = selectReachableParryInterceptTarget({
    predictedThreat: threatAt(1.105),
    predictedTrackingPlan: Object.freeze({ requiredDistance: 0.949, reachable: false }),
    closestApproach: leftClosest({
      point: Object.freeze({ x: 0.38, y: 0, z: 0.0475 }),
      planePoint: Object.freeze({ x: 0.38, y: 0, z: 0 }),
      radialDistanceMeters: 0.38,
      radialGapMeters: 0.12,
      combinedGapMeters: Math.hypot(0.01, 0.12),
    }),
    bucklerSurface: surface,
  });
  assert.equal(selected.measuredReachable, true);
  assert.equal(selected.measuredInsideAcquisitionBand, true);
  assert.equal(selected.fallbackApplied, true);
  assert.equal(selected.measuredRadialContactCorrectionMeters, 0.12);
  assert.ok(selected.measuredRequiredDistanceMeters > 0.18);
  assert.ok(Math.abs(selected.measuredTrackingPlan.requiredDistance - 0.16) < 1e-9);
  assert.ok(Math.abs(selected.measuredTrackingPlan.correction.x - 0.16) < 1e-9);
});

test('measured fallback preserves the surface-relative world direction instead of chasing the far predicted point', () => {
  const selected = selectReachableParryInterceptTarget({
    predictedThreat: threatAt(1.105),
    predictedTrackingPlan: Object.freeze({ requiredDistance: 0.949, reachable: false }),
    closestApproach: leftClosest({
      point: Object.freeze({ x: 0, y: 0.294, z: 0.0475 }),
      planePoint: Object.freeze({ x: 0, y: 0.294, z: 0 }),
      radialDistanceMeters: 0.294,
    }),
    bucklerSurface: surface,
  });
  assert.equal(selected.fallbackApplied, true);
  assert.ok(Math.abs(selected.trackingPlan.correction.x) < 1e-12);
  assert.ok(Math.abs(selected.trackingPlan.correction.y - 0.074) < 1e-9);
  assert.ok(Math.abs(selected.trackingPlan.requiredDistance - 0.074) < 1e-9);
  assert.notEqual(selected.trackingPlan.requiredDistance, selected.predictedRequiredDistanceMeters);
});