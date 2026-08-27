import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GUARD_RESIDUAL_BODY_REACH_STAGE,
  measureGuardArmExtension,
  planGuardResidualBodyReach,
} from '../src/combat/guard-residual-body-reach.js';

const surface = Object.freeze({
  center: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  radius: 0.26,
  thickness: 0.075,
});

function arm(elbowY = 0) {
  return {
    shoulder: { x: 0, y: 0, z: 0 },
    elbow: { x: 0.30, y: elbowY, z: 0 },
    wrist: { x: 0.59, y: 0, z: 0 },
  };
}

test('R18A detects a nearly straight shield arm as saturated', () => {
  const extension = measureGuardArmExtension(arm());
  assert.ok(extension.ratio > 0.99);
  const bent = measureGuardArmExtension(arm(0.20));
  assert.ok(bent.ratio < 0.90);
});

test('R18A decomposes the recorded plane plus edge miss into wrist and torso recruitment', () => {
  const plan = planGuardResidualBodyReach({
    mode: 'parry',
    bucklerSurface: surface,
    closestApproach: { point: { x: 0.291, y: 0, z: 0.0465 } },
    armJoints: arm(),
  });
  assert.equal(plan.stage, GUARD_RESIDUAL_BODY_REACH_STAGE);
  assert.equal(plan.wristActive, true);
  assert.equal(plan.bodyActive, true);
  assert.ok(plan.metrics.planeGapMeters > 0.008 && plan.metrics.planeGapMeters < 0.010);
  assert.ok(plan.metrics.radialGapMeters > 0.030 && plan.metrics.radialGapMeters < 0.032);
  assert.equal(plan.requestedBodyDistance, 0.035);
  assert.ok(plan.desiredNormalRotationDegrees > 3);
  assert.ok(plan.bodyCorrection.x > 0.034);
});

test('R18A never recruits torso while arm reach reserve remains', () => {
  const plan = planGuardResidualBodyReach({
    mode: 'parry',
    bucklerSurface: surface,
    closestApproach: { point: { x: 0.291, y: 0, z: 0.0465 } },
    armJoints: arm(0.20),
  });
  assert.equal(plan.wristActive, true);
  assert.equal(plan.bodyActive, false);
  assert.equal(plan.reason, 'plane-only-recruit-wrist');
});

test('R18A is Parry-only and runtime source cannot modify hips or feet', async () => {
  const blockPlan = planGuardResidualBodyReach({
    mode: 'block',
    bucklerSurface: surface,
    closestApproach: { point: { x: 0.291, y: 0, z: 0.0465 } },
    armJoints: arm(),
  });
  assert.equal(blockPlan.active, false);
  assert.equal(blockPlan.reason, 'parry-only');

  const source = await readFile(new URL('../src/combat/guard-residual-body-reach.js', import.meta.url), 'utf8');
  const runtimeStart = source.indexOf('export function createGuardResidualBodyReachRuntime');
  const runtime = source.slice(runtimeStart);
  assert.match(runtime, /rig\.bones\['wrist\.l'\]/);
  assert.match(runtime, /rig\.bones\.chest/);
  assert.match(runtime, /rig\.bones\.spine/);
  assert.doesNotMatch(runtime, /rig\.bones\.hips/);
  assert.doesNotMatch(runtime, /upperleg|lowerleg|foot/);
  assert.match(runtime, /hipsModified: false/);
  assert.match(runtime, /feetModified: false/);
  assert.match(runtime, /no-authored-curve-no-contact-authority/);
});
