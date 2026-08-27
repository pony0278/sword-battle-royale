import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifySkyrimPoseEquivalence,
  classifySkyrimWeaponSocketEquivalence,
  classifyTriangleGuardSample,
  decideSkyrimGuardAdoption,
} from '../src/combat/skyrim-guard-adoption-review.js';

test('pose equivalence separates good, warning, and bad retarget fidelity', () => {
  assert.equal(classifySkyrimPoseEquivalence({ meanDegrees: 4, p95Degrees: 8, maxDegrees: 12 }).status, 'good');
  assert.equal(classifySkyrimPoseEquivalence({ meanDegrees: 11, p95Degrees: 20, maxDegrees: 32 }).status, 'warning');
  assert.equal(classifySkyrimPoseEquivalence({ meanDegrees: 18, p95Degrees: 36, maxDegrees: 58 }).status, 'bad');
});

test('weapon socket equivalence blocks large helper-axis mismatch', () => {
  assert.equal(classifySkyrimWeaponSocketEquivalence({ maxDegrees: 8 }).status, 'good');
  assert.equal(classifySkyrimWeaponSocketEquivalence({ maxDegrees: 24 }).status, 'warning');
  assert.equal(classifySkyrimWeaponSocketEquivalence({ maxDegrees: 77 }).status, 'bad');
});

test('triangle guard sample accepts compact forward threatening geometry', () => {
  const result = classifyTriangleGuardSample({
    weaponHandHeight: 0.68,
    offHandHeight: 0.62,
    weaponHandCenterDistance: 0.30,
    offHandCenterDistance: 0.32,
    swordTipHeight: 0.88,
    swordForwardDot: 0.72,
    triangleArea: 0.09,
    torsoYawDegrees: 27,
  });
  assert.equal(result.status, 'good');
  assert.deepEqual(result.failures, []);
});

test('triangle guard sample marks local silhouette fixes as warning', () => {
  const result = classifyTriangleGuardSample({
    weaponHandHeight: 0.40,
    offHandHeight: 0.50,
    weaponHandCenterDistance: 0.52,
    offHandCenterDistance: 0.82,
    swordTipHeight: 0.48,
    swordForwardDot: 0.12,
    triangleArea: 0.05,
    torsoYawDegrees: 5,
  });
  assert.equal(result.status, 'warning');
  assert.ok(result.failures.includes('swordForwardDot'));
  assert.ok(result.failures.includes('torsoYawDegrees'));
});

test('adoption stays pending when technical source-target equivalence is bad', () => {
  const result = decideSkyrimGuardAdoption({
    equivalenceStatus: 'bad',
    suitabilityStatuses: ['good', 'good'],
  });
  assert.equal(result.decision, 'PENDING');
  assert.equal(result.reason, 'technical-equivalence-not-accepted');
});

test('adoption stays pending when weapon helper and sword socket are not equivalent', () => {
  const result = decideSkyrimGuardAdoption({
    equivalenceStatus: 'warning',
    weaponSocketStatus: 'bad',
    suitabilityStatuses: ['bad', 'bad'],
  });
  assert.equal(result.decision, 'PENDING');
  assert.equal(result.reason, 'weapon-socket-equivalence-not-accepted');
});

test('usable equivalent source with local guard corrections becomes ADOPT WITH CORRECTIONS', () => {
  const result = decideSkyrimGuardAdoption({
    equivalenceStatus: 'good',
    weaponSocketStatus: 'good',
    suitabilityStatuses: ['warning', 'warning', 'warning'],
  });
  assert.equal(result.decision, 'ADOPT WITH CORRECTIONS');
});
