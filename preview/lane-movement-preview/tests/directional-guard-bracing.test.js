import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTICULATED_IMPACT_BRACING_PROFILE,
  ARTICULATED_IMPACT_BRACING_STAGE,
  planArticulatedImpactBracing,
  sampleImpactCompression,
} from '../src/combat/articulated-impact-bracing.js';
import { planFineGuardTracking } from '../src/combat/directional-guard-bracing.js';

const surface = {
  center: { x: 0, y: 1, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  radius: 0.26,
  thickness: 0.075,
};

function blade(z, y, xOffset = 0) {
  return [
    { x: -0.24 + xOffset, y, z },
    { x: xOffset, y, z },
    { x: 0.24 + xOffset, y, z },
  ];
}

test('G4.3A.3 low LEFT uses small pelvis travel and asymmetric joint loading', () => {
  const plan = planArticulatedImpactBracing({
    mode: 'brace-fine',
    attackDirection: 'left',
    previousBlade: blade(-0.12, 0.82),
    currentBlade: blade(-0.02, 0.80),
    bucklerSurface: surface,
    deltaSeconds: 0.05,
    threat: { point: { x: -0.08, y: 0.78, z: 0 }, bladeFraction: 0.55 },
  });
  assert.equal(ARTICULATED_IMPACT_BRACING_STAGE, 'G4.3A.3');
  assert.equal(plan.strategy, 'low-articulated-brace');
  assert.ok(plan.body.pelvisDropMeters > 0.01);
  assert.ok(plan.body.pelvisDropMeters <= ARTICULATED_IMPACT_BRACING_PROFILE.maxPelvisDropMeters);
  assert.ok(plan.body.leftKneeBendDegrees > plan.body.rightKneeBendDegrees + 2);
  assert.ok(plan.body.leftThighBendDegrees > plan.body.rightThighBendDegrees + 1);
  assert.ok(plan.body.spinePitchDegrees > 1);
  assert.equal(plan.fineTrackMaxMeters, 0.07);
});

test('G4.3A.3 lateral RIGHT mirrors the loaded leg and rotates the torso', () => {
  const plan = planArticulatedImpactBracing({
    mode: 'brace',
    attackDirection: 'right',
    previousBlade: blade(-0.12, 1.02, 0.12),
    currentBlade: blade(-0.02, 1.02, 0.14),
    bucklerSurface: surface,
    deltaSeconds: 0.05,
    threat: { point: { x: 0.22, y: 1.02, z: 0 }, bladeFraction: 0.5 },
  });
  assert.equal(plan.strategy, 'lateral-articulated-brace');
  assert.ok(plan.body.rightKneeBendDegrees > plan.body.leftKneeBendDegrees + 2);
  assert.ok(plan.body.chestYawDegrees > 2);
  assert.ok(plan.body.pelvisDropMeters < 0.01);
  assert.equal(plan.fineTrackMaxMeters, 0);
});

test('G4.3A.3 TOP spreads load through spine and both knees instead of dropping the whole body', () => {
  const plan = planArticulatedImpactBracing({
    mode: 'brace-fine',
    attackDirection: 'top',
    previousBlade: blade(-0.1, 1.22),
    currentBlade: blade(-0.02, 1.10),
    bucklerSurface: surface,
    deltaSeconds: 0.05,
    threat: { point: { x: 0, y: 1.08, z: 0 }, bladeFraction: 0.5 },
  });
  assert.equal(plan.strategy, 'overhead-articulated-brace');
  assert.ok(plan.body.spinePitchDegrees > 3);
  assert.ok(plan.body.leftKneeBendDegrees > 4);
  assert.ok(Math.abs(plan.body.leftKneeBendDegrees - plan.body.rightKneeBendDegrees) < 1e-9);
  assert.ok(plan.body.pelvisDropMeters < 0.018);
  assert.ok(plan.body.shoulderLiftMeters > 0.03);
});

test('G4.3A.3 OFF preserves authored Guard with zero body overlay', () => {
  const plan = planArticulatedImpactBracing({ mode: 'off' });
  assert.equal(plan.strategy, 'authored-guard');
  assert.equal(plan.body.pelvisDropMeters, 0);
  assert.equal(plan.body.leftKneeBendDegrees, 0);
  assert.equal(plan.body.rightKneeBendDegrees, 0);
  assert.equal(plan.body.spinePitchDegrees, 0);
  assert.equal(plan.fineTrackMaxMeters, 0);
});

test('G4.3A.3 impact envelope compresses, rebounds, then settles', () => {
  const peak = sampleImpactCompression(45);
  const rebound = sampleImpactCompression(105);
  const settling = sampleImpactCompression(150);
  const done = sampleImpactCompression(190);
  assert.equal(peak.phase, 'compression');
  assert.ok(Math.abs(peak.scale - 1) < 1e-9);
  assert.equal(rebound.phase, 'rebound');
  assert.ok(rebound.scale < 0);
  assert.equal(settling.phase, 'settle');
  assert.ok(settling.scale < 0);
  assert.equal(done.phase, 'idle');
  assert.equal(done.scale, 0);
  assert.equal(done.complete, true);
});

test('G4.3A.3 retains the existing 7cm fine tracking cap', () => {
  const fine = planFineGuardTracking({
    threat: { point: { x: 0, y: 1.45, z: 0 } },
    bucklerSurface: surface,
    maxCorrectionMeters: 0.07,
  });
  assert.equal(fine.mode, 'guard');
  assert.equal(fine.reachable, false);
  assert.ok(Math.abs(fine.appliedDistance - 0.07) < 1e-9);
  assert.equal(fine.reason, 'fine-track-clamped');
});
