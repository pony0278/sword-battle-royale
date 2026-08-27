import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARRY_WHIFF_DIAGNOSTIC_STAGE,
  buildParryWhiffDiagnostic,
} from '../src/combat/parry-whiff-diagnostic.js';

function closest(overrides = {}) {
  return Object.freeze({
    point: Object.freeze({ x: 0.3, y: 0, z: 0 }),
    planeGapMeters: 0,
    radialGapMeters: 0.04,
    combinedGapMeters: 0.04,
    bladeFraction: 0.68,
    attackPhase: 'attack_active',
    timeToContactSeconds: 0.023,
    ...overrides,
  });
}

test('whiff diagnostic gives exact geometric contact outside ACTIVE highest priority', () => {
  const outsideActiveContact = closest({
    planeGapMeters: 0,
    radialGapMeters: 0,
    combinedGapMeters: 0,
    attackPhase: 'attack_recovery',
  });
  const result = buildParryWhiffDiagnostic({
    sequence: 7,
    direction: 'left',
    closestApproachRecord: closest(),
    outsideActiveContact,
  });
  assert.equal(result.stage, PARRY_WHIFF_DIAGNOSTIC_STAGE);
  assert.equal(result.category, 'CONTACT_OUTSIDE_ACTIVE_WINDOW');
  assert.equal(result.reason, 'geometric-contact-outside-active-window');
  assert.equal(result.outsideActiveContact, outsideActiveContact);
  assert.equal(result.authority, 'presentation-diagnostic-only-no-combat-authority');
});

test('whiff diagnostic distinguishes a shield-plane crossing outside the disc', () => {
  const result = buildParryWhiffDiagnostic({ closestApproachRecord: closest() });
  assert.equal(result.category, 'OUTSIDE_SHIELD_EDGE');
  assert.equal(result.reason, 'blade-crossed-shield-plane-outside-disc');
});

test('whiff diagnostic distinguishes plane-depth miss while inside shield radius', () => {
  const result = buildParryWhiffDiagnostic({
    closestApproachRecord: closest({ planeGapMeters: 0.035, radialGapMeters: 0, combinedGapMeters: 0.035 }),
  });
  assert.equal(result.category, 'MISSED_SHIELD_PLANE');
  assert.equal(result.reason, 'blade-missed-shield-plane-depth');
});

test('tracking clamp is reported without becoming combat authority', () => {
  const result = buildParryWhiffDiagnostic({
    closestApproachRecord: closest(),
    finePlan: Object.freeze({ requiredDistance: 0.22, appliedDistance: 0.18, reachable: false }),
    fineTracking: Object.freeze({ achievedDistance: 0.16 }),
  });
  assert.equal(result.category, 'OUTSIDE_SHIELD_EDGE');
  assert.equal(result.tracking.requiredDistanceMeters, 0.22);
  assert.equal(result.tracking.appliedDistanceMeters, 0.18);
  assert.equal(result.tracking.achievedDistanceMeters, 0.16);
  assert.equal(result.tracking.clamped, true);
  assert.equal(result.authority, 'presentation-diagnostic-only-no-combat-authority');
});

test('closest-approach frame owns tracking telemetry instead of a later animation frame', () => {
  const result = buildParryWhiffDiagnostic({
    closestApproachRecord: closest({
      trackingRequiredDistanceMeters: 0.046,
      trackingAppliedDistanceMeters: 0.046,
      trackingAchievedDistanceMeters: 0.041,
      trackingReachable: true,
    }),
    finePlan: Object.freeze({ requiredDistance: 0.949, appliedDistance: 0.18, reachable: false }),
    fineTracking: Object.freeze({ achievedDistance: 0.061 }),
  });
  assert.equal(result.tracking.requiredDistanceMeters, 0.046);
  assert.equal(result.tracking.appliedDistanceMeters, 0.046);
  assert.equal(result.tracking.achievedDistanceMeters, 0.041);
  assert.equal(result.tracking.reachable, true);
  assert.equal(result.tracking.clamped, false);
});