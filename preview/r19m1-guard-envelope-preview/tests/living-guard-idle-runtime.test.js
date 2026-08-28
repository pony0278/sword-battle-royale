import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIVING_GUARD_PRODUCTION_CLIP_ID,
  LIVING_GUARD_PRODUCTION_ENTRY_SAMPLE,
  LIVING_GUARD_PRODUCTION_LOOP_POLICY,
  LIVING_GUARD_PRODUCTION_SOURCE_RATE,
  LIVING_GUARD_PRODUCTION_STAGE,
  buildLivingGuardProductionReport,
  livingGuardEntrySourceTime,
  sampleLivingGuardProductionHold,
} from '../src/combat/living-guard-idle-runtime.js';

test('G3.6.5 production promotes the full Skyrim blockidle source at 1.00x', () => {
  assert.equal(LIVING_GUARD_PRODUCTION_STAGE, 'G3.6.5');
  assert.equal(LIVING_GUARD_PRODUCTION_CLIP_ID, 'SKYRIM_GUARD/shd_blockidle');
  assert.equal(LIVING_GUARD_PRODUCTION_ENTRY_SAMPLE, 0.5);
  assert.equal(LIVING_GUARD_PRODUCTION_SOURCE_RATE, 1);
  assert.equal(LIVING_GUARD_PRODUCTION_LOOP_POLICY, 'full-source-authored-loop');
});

test('G3.6.5 Hold starts at canonical 50% and advances through the full source', () => {
  assert.equal(livingGuardEntrySourceTime(40), 20);
  assert.equal(sampleLivingGuardProductionHold(0, 40).sourceTimeSeconds, 20);
  assert.equal(sampleLivingGuardProductionHold(1000, 40).sourceTimeSeconds, 21);
  assert.equal(sampleLivingGuardProductionHold(19000, 40).sourceTimeSeconds, 39);
});

test('G3.6.5 Hold wraps the authored full source without shortening the 40s source scope', () => {
  const beforeWrap = sampleLivingGuardProductionHold(19999, 40);
  const wrapped = sampleLivingGuardProductionHold(20000, 40);
  const afterWrap = sampleLivingGuardProductionHold(20250, 40);
  assert.ok(beforeWrap.sourceTimeSeconds > 39.99);
  assert.equal(wrapped.sourceTimeSeconds, 0);
  assert.equal(afterWrap.sourceTimeSeconds, 0.25);
  assert.equal(wrapped.completedLoops, 1);
  assert.equal(sampleLivingGuardProductionHold(60000, 40).completedLoops, 2);
});

test('G3.6.5 production report preserves Triangle correction and root safety contracts', () => {
  const report = buildLivingGuardProductionReport(40);
  assert.equal(report.stage, 'G3.6.5');
  assert.equal(report.sourceDurationSeconds, 40);
  assert.equal(report.entrySourceTimeSeconds, 20);
  assert.equal(report.preservesTriangleCorrection, true);
  assert.equal(report.preservesInPlaceRoot, true);
  assert.equal(report.preservesRootRotationLock, true);
  assert.equal(report.sourceScope, 'full-authored-skyrim-idle');
});
