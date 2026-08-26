import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { buildActiveParryInterceptDiagnosis } from '../tools/action-studio/shield-parry-r281/active-parry-intercept-diagnosis.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

test('R18N.0 identifies already-covered plans without inventing active shield travel', () => {
  const input = deepFreeze({
    attackSnapshot: { direction: 'top' },
    exchangeState: {
      latestParryInput: { accepted: true, reason: 'parry-input-armed-awaiting-real-contact', timeToContactSeconds: 0.12, gates: { attackCommitted: true, timingInsideWindow: true } },
      latestFinePlan: { reason: 'already-covered', reachable: true, requiredDistance: 0, appliedDistance: 0 },
      latestFineTracking: { achievedDistance: 0 },
      latestShieldLeadMotion: { moving: false, translationMeters: 0, translationSpeedMps: 0, angularSpeedRadPerSecond: 0 },
    },
  });
  const result = buildActiveParryInterceptDiagnosis(input);
  assert.equal(result.direction, 'top');
  assert.equal(result.input.timeToContactMs, 120);
  assert.equal(result.planner.requiredTravelCm, 0);
  assert.equal(result.planner.appliedTravelCm, 0);
  assert.equal(result.hypothesis.guardAlreadyCoveredThreat, true);
  assert.equal(result.hypothesis.zeroActiveTranslationRequested, true);
  assert.equal(result.conclusion, 'guard-already-covers-threat-no-active-translation-requested');
});

test('R18N.0 reports active intercept motion when an existing plan actually requests travel', () => {
  const result = buildActiveParryInterceptDiagnosis({
    attackSnapshot: { direction: 'right' },
    exchangeState: {
      latestParryInput: { accepted: true, timeToContactSeconds: 0.1, gates: { attackCommitted: true, timingInsideWindow: true } },
      latestFinePlan: { reason: 'within-tracking-reach', reachable: true, requiredDistance: 0.08, appliedDistance: 0.08 },
      latestFineTracking: { achievedDistance: 0.02 },
      latestReachableInterceptTarget: { source: 'predicted', fallbackApplied: false, predictedRequiredDistanceMeters: 0.08 },
      latestShieldLeadMotion: { moving: true, translationMeters: 0.012, translationSpeedMps: 0.72, angularSpeedRadPerSecond: Math.PI },
    },
  });
  assert.equal(result.planner.requiredTravelCm, 8);
  assert.equal(result.planner.appliedTravelCm, 8);
  assert.equal(result.planner.achievedTravelCm, 2);
  assert.equal(result.shieldMotion.translationCm, 1.2);
  assert.equal(Math.round(result.shieldMotion.angularSpeedDegPerSecond), 180);
  assert.equal(result.conclusion, 'active-intercept-motion-observed');
});

test('R18N.0 stays diagnostic for rejected or not-yet-armed input', () => {
  assert.equal(buildActiveParryInterceptDiagnosis().conclusion, 'awaiting-manual-input');
  assert.equal(buildActiveParryInterceptDiagnosis({
    exchangeState: { latestParryInput: { accepted: false, reason: 'parry-input-too-late' } },
  }).conclusion, 'input-parry-input-too-late');
});

test('R18N.0 helper is read-only and imports no gameplay/runtime authority', () => {
  const source = fs.readFileSync('tools/action-studio/shield-parry-r281/active-parry-intercept-diagnosis.js', 'utf8');
  for (const forbidden of [
    'combat.resolveContact', 'parryGate.arm', 'parryGate.confirm', 'guardRuntime.update',
    'attackRuntime.update', 'swordGripConstraint', 'probeSweptSwordBucklerContact',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.equal(source.includes('exchangeState.'), true);
});

test('R18N.0 integrates through debug-api without increasing the R281 entry surface', () => {
  const debugApi = fs.readFileSync('tools/action-studio/shield-parry-r281/debug-api.js', 'utf8');
  const entry = fs.readFileSync('tools/action-studio/shield-driven-contact-coupling-lab-r281.js', 'utf8');
  assert.match(debugApi, /active-parry-intercept-diagnosis\.js/);
  assert.match(debugApi, /get activeParryInterceptDiagnosis\(\)/);
  assert.doesNotMatch(entry, /active-parry-intercept-diagnosis/);
});
