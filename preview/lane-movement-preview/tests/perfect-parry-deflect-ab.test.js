import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERFECT_PARRY_DEFLECT_AB_STAGE,
  PERFECT_PARRY_DEFLECT_CANDIDATES,
  comparePerfectParryDeflectAbContracts,
  createPerfectParryDeflectAbProfile,
  samplePerfectParryDeflectAbProfile,
} from '../src/combat/perfect-parry-deflect-ab.js';
import { PARRY_CONTACT_DEFLECT_PHASES } from '../src/combat/parry-contact-deflect-probe.js';

test('G3.5.1P-T2 compares Perfect candidates with identical contact timing', () => {
  const comparison = comparePerfectParryDeflectAbContracts();
  assert.equal(comparison.stage, PERFECT_PARRY_DEFLECT_AB_STAGE);
  assert.equal(comparison.sameContactTiming, true);
  assert.equal(comparison.productionEnabled, false);
  assert.equal(comparison.authority, 'presentation-probe-only');
  assert.equal(comparison.shared.contactWindow.endSeconds, 0.16);
  assert.equal(comparison.shared.contactHoldMs, 95);
  assert.equal(comparison.shared.blendMs, 75);
  assert.equal(comparison.power.contactWindow.endSeconds, 0.16);
  assert.equal(comparison.power.contactHoldMs, 95);
  assert.equal(comparison.power.blendMs, 75);
});

test('G3.5.1P-T2 Shared candidate reuses the accepted Normal T1 compact deflect', () => {
  const profile = createPerfectParryDeflectAbProfile(PERFECT_PARRY_DEFLECT_CANDIDATES.SHARED);
  assert.equal(profile.t2Candidate, PERFECT_PARRY_DEFLECT_CANDIDATES.SHARED);
  assert.equal(profile.deflectClipId, 'SKYRIM_GUARD/shd_blockbash');
  assert.deepEqual(profile.deflectWindow, { startSeconds: 0.09, endSeconds: 0.22 });
  assert.equal(profile.blendLeadSeconds, 0.03);
  assert.equal(profile.deflectRate, 1.15);
  assert.equal(profile.contactHoldMs, 95);
  assert.equal(profile.probeOnly, true);
  assert.equal(profile.productionEnabled, false);
  assert.match(profile.shieldBashRiskControl, /remove-power-bash/);
});

test('G3.5.1P-T2 Power candidate preserves Perfect T1 power deflect for direct A/B', () => {
  const profile = createPerfectParryDeflectAbProfile(PERFECT_PARRY_DEFLECT_CANDIDATES.POWER);
  assert.equal(profile.t2Candidate, PERFECT_PARRY_DEFLECT_CANDIDATES.POWER);
  assert.equal(profile.deflectClipId, 'SKYRIM_GUARD/shd_blockbashpower');
  assert.deepEqual(profile.deflectWindow, { startSeconds: 0.12, endSeconds: 0.28 });
  assert.equal(profile.blendLeadSeconds, 0.035);
  assert.equal(profile.deflectRate, 1.1);
  assert.equal(profile.contactHoldMs, 95);
  assert.equal(profile.probeOnly, true);
  assert.equal(profile.productionEnabled, false);
});

test('G3.5.1P-T2 both candidates retain contact → blend → deflect ordering', () => {
  for (const candidate of Object.values(PERFECT_PARRY_DEFLECT_CANDIDATES)) {
    const profile = createPerfectParryDeflectAbProfile(candidate);
    const blendAt = profile.contactWindow.endSeconds * 1000 + profile.contactHoldMs + profile.blendMs * 0.5;
    const blend = samplePerfectParryDeflectAbProfile(profile, blendAt);
    assert.equal(blend.phase, PARRY_CONTACT_DEFLECT_PHASES.BLEND);
    assert.equal(blend.fromClipId, 'SKYRIM_GUARD/shd_blockhit');
    assert.equal(blend.toClipId, profile.deflectClipId);
    const complete = samplePerfectParryDeflectAbProfile(profile, profile.durationMs + 1);
    assert.equal(complete.phase, PARRY_CONTACT_DEFLECT_PHASES.COMPLETE);
    assert.equal(complete.clipId, profile.deflectClipId);
    assert.equal(complete.complete, true);
  }
});
