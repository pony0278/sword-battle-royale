import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  POWER_BASH_READABILITY_CANDIDATE_IDS,
  POWER_BASH_READABILITY_CANDIDATES,
  POWER_BASH_READABILITY_STAGE,
  POWER_BASH_RECOVERY_PROBE_STAGE,
  POWER_BASH_PRODUCTION_PROMOTION_STAGE,
  buildPowerBashReadabilityProbeReport,
  resolvePowerBashReadabilityCandidate,
  samplePowerBashReadabilityCandidate,
  samplePowerBashReadabilityCandidateProgress,
} from '../src/animation/power-bash-readability-probe.js';
import {
  PRODUCTION_PARRY_DEFLECT_VARIANTS,
  getProductionParryDeflectProfile,
} from '../src/animation/parry-contact-deflect-runtime-clip.js';

test('G3.6.3 preserves historical A/B/C/D review while marking D as production candidate', () => {
  assert.equal(POWER_BASH_READABILITY_STAGE, 'G3.6.1');
  assert.equal(POWER_BASH_RECOVERY_PROBE_STAGE, 'G3.6.2');
  assert.equal(POWER_BASH_PRODUCTION_PROMOTION_STAGE, 'G3.6.3');
  assert.deepEqual(POWER_BASH_READABILITY_CANDIDATES.map((entry) => entry.id), [
    POWER_BASH_READABILITY_CANDIDATE_IDS.FULL_SOURCE,
    POWER_BASH_READABILITY_CANDIDATE_IDS.CURRENT_G36,
    POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED,
    POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED_FULL_RECOVERY,
  ]);

  const former = resolvePowerBashReadabilityCandidate(POWER_BASH_READABILITY_CANDIDATE_IDS.CURRENT_G36, 2);
  assert.equal(former.label, 'Former G3.6');
  assert.equal(former.sourceStartSeconds, 0.12);
  assert.equal(former.sourceEndSeconds, 0.28);
  assert.equal(former.playbackRate, 1.1);
  assert.equal(former.historicalProductionReference, true);

  const d = resolvePowerBashReadabilityCandidate(POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED_FULL_RECOVERY, 0.7);
  assert.equal(d.productionCandidate, true);
  assert.equal(d.promotedInStage, 'G3.6.3');
});

test('G3.6.3 production timing exactly promotes D power + recovery contract', () => {
  const production = getProductionParryDeflectProfile(PRODUCTION_PARRY_DEFLECT_VARIANTS.PARRY);
  const d = resolvePowerBashReadabilityCandidate(POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED_FULL_RECOVERY, 0.7);
  const [power, recovery] = d.segments;

  assert.equal(production.deflectStartSeconds, power.sourceStartSeconds);
  assert.equal(production.deflectPowerEndSeconds, power.sourceEndSeconds);
  assert.equal(production.deflectRate, power.playbackRate);
  assert.equal(production.deflectRecoveryStartSeconds, recovery.sourceStartSeconds);
  assert.equal(production.deflectEndSeconds, recovery.sourceEndSeconds);
  assert.equal(production.deflectRecoveryRate, recovery.playbackRate);
  assert.equal(production.deflectBlendLeadSeconds, 0);
  assert.equal(production.sourceDecision, 'G3_6_3_PROMOTE_D_FULL_RECOVERY');
});

test('G3.6.1 historical baseline still quantifies why former G3.6 was hard to read at 30fps', () => {
  const report = buildPowerBashReadabilityProbeReport(0.7);
  const former = report.candidates.find((entry) => entry.id === POWER_BASH_READABILITY_CANDIDATE_IDS.CURRENT_G36);
  const extended = report.candidates.find((entry) => entry.id === POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED);

  assert.ok(Math.abs(former.visualDurationSeconds - (0.16 / 1.1)) < 1e-9);
  assert.ok(former.approximateFrames30 < 5);
  assert.ok(extended.visualDurationSeconds > 0.45);
  assert.ok(extended.approximateFrames30 > 14);
  assert.ok(report.diagnostics.extendedToFormerG36DurationRatio > 3);
  assert.equal(report.historicalBaselinePreserved, true);
  assert.equal(report.productionPromoted, true);
  assert.equal(report.productionCandidateId, POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED_FULL_RECOVERY);
});

test('G3.6.1 Full Source resolves dynamically to the entire clip and samples by normalized progress', () => {
  const full = resolvePowerBashReadabilityCandidate(POWER_BASH_READABILITY_CANDIDATE_IDS.FULL_SOURCE, 1.8);
  assert.equal(full.sourceStartSeconds, 0);
  assert.equal(full.sourceEndSeconds, 1.8);
  assert.equal(full.playbackRate, 0.5);
  assert.equal(full.visualDurationSeconds, 3.6);
  assert.equal(samplePowerBashReadabilityCandidateProgress(full, 0.5, 1.8), 0.9);
});

test('G3.6.2 D preserves C Power exactly then continues through the full authored recovery tail', () => {
  const clipDuration = 0.7;
  const c = resolvePowerBashReadabilityCandidate(POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED, clipDuration);
  const d = resolvePowerBashReadabilityCandidate(POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED_FULL_RECOVERY, clipDuration);
  assert.equal(d.segments.length, 2);
  const [power, recovery] = d.segments;
  assert.equal(power.sourceStartSeconds, c.sourceStartSeconds);
  assert.equal(power.sourceEndSeconds, c.sourceEndSeconds);
  assert.equal(power.playbackRate, c.playbackRate);
  assert.equal(recovery.sourceStartSeconds, 0.55);
  assert.equal(recovery.sourceEndSeconds, clipDuration);
  assert.equal(recovery.playbackRate, 1.0);
  const expectedDuration = (0.55 - 0.08) / 0.95 + (0.7 - 0.55);
  assert.ok(Math.abs(d.visualDurationSeconds - expectedDuration) < 1e-9);
  assert.ok(d.approximateFrames30 > 19);
  assert.equal(samplePowerBashReadabilityCandidate(d, power.visualDurationSeconds, clipDuration), 0.55);
  assert.ok(samplePowerBashReadabilityCandidate(d, power.visualDurationSeconds + 0.05, clipDuration) > 0.55);
  assert.equal(samplePowerBashReadabilityCandidateProgress(d, 1, clipDuration), clipDuration);
  const report = buildPowerBashReadabilityProbeReport(clipDuration);
  assert.equal(report.productionPromoted, true);
  assert.equal(report.diagnostics.recoveryEndsAtClipEnd, true);
  assert.ok(report.diagnostics.recoveryTailMilliseconds >= 149.9);
});

test('G3.6.1.1 Orbit Camera remains available while D is promoted in G3.6.3', async () => {
  const html = await readFile(new URL('../tools/action-studio/power-bash-readability-lab.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../tools/action-studio/power-bash-readability-lab.js', import.meta.url), 'utf8');
  assert.match(html, /OrbitControls\.js/);
  assert.match(html, /data-candidate="extended-full-recovery"/);
  assert.match(app, /new THREE\.OrbitControls\(camera, canvas\)/);
  assert.match(app, /__G3611_ORBIT_CAMERA__/);
  assert.match(app, /POWER_BASH_RECOVERY_PROBE_STAGE/);
  assert.match(app, /__G362_D_RECOVERY_RESULT__/);
});
