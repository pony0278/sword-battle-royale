import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIVING_GUARD_IDLE_BONE_WEIGHTS,
  LIVING_GUARD_IDLE_CANONICAL_SAMPLE,
  LIVING_GUARD_IDLE_CANDIDATE_IDS,
  LIVING_GUARD_IDLE_CANDIDATES,
  LIVING_GUARD_IDLE_GENTLE_WINDOW,
  LIVING_GUARD_IDLE_STAGE,
  buildLivingGuardIdleProbeReport,
  getLivingGuardIdleBoneWeight,
  livingGuardCanonicalSourceTime,
  sampleLivingGuardIdleCandidate,
} from '../src/combat/living-guard-idle-probe.js';

test('G3.6.4 exposes Stable, full Skyrim reference, and Living Triangle without changing production', () => {
  assert.equal(LIVING_GUARD_IDLE_STAGE, 'G3.6.4');
  assert.deepEqual(LIVING_GUARD_IDLE_CANDIDATES.map((candidate) => candidate.id), [
    LIVING_GUARD_IDLE_CANDIDATE_IDS.STABLE_G363,
    LIVING_GUARD_IDLE_CANDIDATE_IDS.SKYRIM_LIVE,
    LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE,
  ]);
  const report = buildLivingGuardIdleProbeReport(40);
  assert.equal(report.productionUnchanged, true);
  assert.equal(report.productionStage, 'G3.6.3');
  assert.equal(report.canonicalSample, 0.5);
  assert.deepEqual(report.gentleSourceWindow, LIVING_GUARD_IDLE_GENTLE_WINDOW);
});

test('Stable G3.6.3 always samples the canonical 50 percent Guard pose', () => {
  assert.equal(LIVING_GUARD_IDLE_CANONICAL_SAMPLE, 0.5);
  assert.equal(livingGuardCanonicalSourceTime(40), 20);
  for (const elapsed of [0, 0.1, 0.9, 4.2]) {
    const sample = sampleLivingGuardIdleCandidate(LIVING_GUARD_IDLE_CANDIDATE_IDS.STABLE_G363, elapsed, 40);
    assert.equal(sample.sourceTimeSeconds, 20);
    assert.equal(sample.live, false);
    assert.equal(sample.productionReference, true);
  }
});

test('Skyrim Full Source remains a full 40s authored reference from the canonical phase', () => {
  const start = sampleLivingGuardIdleCandidate(LIVING_GUARD_IDLE_CANDIDATE_IDS.SKYRIM_LIVE, 0, 40);
  const later = sampleLivingGuardIdleCandidate(LIVING_GUARD_IDLE_CANDIDATE_IDS.SKYRIM_LIVE, 21, 40);
  assert.equal(start.sourceTimeSeconds, 20);
  assert.equal(later.sourceTimeSeconds, 1);
  assert.equal(later.sourceRate, 1);
  assert.equal(getLivingGuardIdleBoneWeight(LIVING_GUARD_IDLE_CANDIDATE_IDS.SKYRIM_LIVE, 'hips'), 1);
});

test('Living Triangle loops only the source-scanned 29-31s gentle idle window', () => {
  assert.deepEqual(LIVING_GUARD_IDLE_GENTLE_WINDOW, {
    startSeconds: 29,
    endSeconds: 31,
    source: 'G3.6.4 source scan: lowest-seam gentle non-static 2s window',
  });
  const start = sampleLivingGuardIdleCandidate(LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE, 0, 40);
  const middle = sampleLivingGuardIdleCandidate(LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE, 1, 40);
  const wrapped = sampleLivingGuardIdleCandidate(LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE, 2.25, 40);
  assert.equal(start.sourceTimeSeconds, 29);
  assert.equal(middle.sourceTimeSeconds, 30);
  assert.equal(wrapped.sourceTimeSeconds, 29.25);
  assert.equal(start.sourceWindow, LIVING_GUARD_IDLE_GENTLE_WINDOW);
});

test('Living Triangle keeps root and hips frozen while blending restrained upper-body motion', () => {
  const sample = sampleLivingGuardIdleCandidate(LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE, 1, 40);
  assert.equal(sample.sourceRate, 1);
  assert.equal(getLivingGuardIdleBoneWeight(LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE, 'root'), 0);
  assert.equal(getLivingGuardIdleBoneWeight(LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE, 'hips'), 0);
  assert.equal(getLivingGuardIdleBoneWeight(LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE, 'chest'), LIVING_GUARD_IDLE_BONE_WEIGHTS.chest);
  assert.ok(getLivingGuardIdleBoneWeight(LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE, 'chest') > 0.25);
  assert.ok(getLivingGuardIdleBoneWeight(LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE, 'chest') < 0.4);
  assert.ok(getLivingGuardIdleBoneWeight(LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE, 'wrist.r') < 0.35);
  assert.equal(sample.live, true);
});
