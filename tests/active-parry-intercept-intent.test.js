import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_PARRY_INTERCEPT_INTENT_STAGE,
  createActiveParryInterceptIntent,
} from '../src/combat/active-parry-intercept-intent.js';

const surface = Object.freeze({
  center: Object.freeze({ x: 0, y: 1, z: 0 }),
  normal: Object.freeze({ x: 0, y: 0, z: -1 }),
  radius: 0.26,
  thickness: 0.075,
});

function predictive(requiredDistance = 1.44, point = { x: 1, y: 1.5, z: 0 }) {
  return Object.freeze({
    threat: Object.freeze({ point: Object.freeze({ ...point }) }),
    trackingPlan: Object.freeze({ requiredDistance }),
  });
}

function magnitude(value) {
  return Math.hypot(value.x, value.y, value.z);
}

test('R18N.1 clamps the F-latched intercept to a reachable visible lead instead of preserving the raw prediction', () => {
  const intent = createActiveParryInterceptIntent();
  const armed = intent.arm({
    sequence: 2,
    direction: 'top',
    bucklerSurface: surface,
    predictiveAnalysis: predictive(1.44),
  });
  assert.equal(armed.accepted, true);
  assert.equal(armed.intent.stage, ACTIVE_PARRY_INTERCEPT_INTENT_STAGE);
  assert.equal(armed.intent.rawRequiredDistanceMeters, 1.44);
  assert.equal(armed.intent.leadMeters, 0.18);
  assert.ok(Math.abs(magnitude({
    x: armed.intent.targetCenter.x - armed.intent.originCenter.x,
    y: armed.intent.targetCenter.y - armed.intent.originCenter.y,
    z: armed.intent.targetCenter.z - armed.intent.originCenter.z,
  }) - 0.18) < 1e-9);

  const plan = intent.plan({ sequence: 2, bucklerSurface: surface });
  assert.equal(plan.reason, 'latched-active-shield-intercept');
  assert.equal(plan.reachable, true);
  assert.ok(Math.abs(plan.requiredDistance - 0.18) < 1e-9);
  assert.ok(Math.abs(plan.appliedDistance - 0.18) < 1e-9);
});

test('R18N.1 preserves one fixed world-space target while remaining correction shrinks as the shield advances', () => {
  const intent = createActiveParryInterceptIntent();
  intent.arm({
    sequence: 3,
    direction: 'right',
    bucklerSurface: surface,
    predictiveAnalysis: predictive(0.95, { x: 0.8, y: 0.6, z: 0 }),
  });
  const first = intent.plan({ sequence: 3, bucklerSurface: surface });
  const movedSurface = {
    ...surface,
    center: {
      x: surface.center.x + first.correction.x * 0.4,
      y: surface.center.y + first.correction.y * 0.4,
      z: surface.center.z + first.correction.z * 0.4,
    },
  };
  const second = intent.plan({ sequence: 3, bucklerSurface: movedSurface });
  assert.deepEqual(second.targetCenter, first.targetCenter);
  assert.ok(second.requiredDistance < first.requiredDistance);
  assert.ok(Math.abs(second.requiredDistance - first.requiredDistance * 0.6) < 1e-9);
  assert.equal(intent.report.stableAcrossFrames, true);
});

test('R18N.1 still creates a distinct active lead when the existing guard already covers the predicted threat', () => {
  const intent = createActiveParryInterceptIntent();
  const armed = intent.arm({
    sequence: 4,
    direction: 'right',
    bucklerSurface: surface,
    predictiveAnalysis: predictive(0, { x: 0.4, y: 1, z: 0 }),
  });
  assert.equal(armed.accepted, true);
  assert.equal(armed.intent.leadMeters, 0.09);
  const plan = intent.plan({ sequence: 4, bucklerSurface: surface });
  assert.ok(magnitude(plan.correction) >= 0.09 - 1e-9);
});

test('R18N.1 keeps LEFT deferred and never creates contact authority', () => {
  const intent = createActiveParryInterceptIntent();
  const result = intent.arm({
    sequence: 5,
    direction: 'left',
    bucklerSurface: surface,
    predictiveAnalysis: predictive(),
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'direction-deferred');
  assert.equal(intent.active, false);
  assert.equal(intent.plan({ sequence: 5, bucklerSurface: surface }), null);
});
