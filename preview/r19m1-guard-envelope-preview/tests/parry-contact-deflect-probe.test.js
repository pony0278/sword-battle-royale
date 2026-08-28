import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARRY_CONTACT_DEFLECT_PHASES,
  PARRY_CONTACT_DEFLECT_PROBE_STAGE,
  PARRY_CONTACT_DEFLECT_TUNING_PRESETS,
  PARRY_CONTACT_DEFLECT_TUNING_STAGE,
  PARRY_CONTACT_DEFLECT_VARIANTS,
  createParryContactDeflectProbeProfile,
  sampleParryContactDeflectProbe,
} from '../src/combat/parry-contact-deflect-probe.js';

test('G3.5.1P-T1 sequences shield contact before normal compact deflect', () => {
  const profile = createParryContactDeflectProbeProfile(PARRY_CONTACT_DEFLECT_VARIANTS.PARRY);
  assert.equal(profile.stage, PARRY_CONTACT_DEFLECT_PROBE_STAGE);
  assert.equal(profile.tuningStage, PARRY_CONTACT_DEFLECT_TUNING_STAGE);
  assert.equal(profile.tuningPreset, PARRY_CONTACT_DEFLECT_TUNING_PRESETS.COMPACT);
  assert.equal(profile.probeOnly, true);
  assert.equal(profile.productionEnabled, false);
  assert.equal(profile.contactClipId, 'SKYRIM_GUARD/shd_blockhit');
  assert.equal(profile.deflectClipId, 'SKYRIM_GUARD/shd_blockbash');
  assert.equal(profile.rootRotationPolicy, 'lock');
  assert.equal(profile.inPlace, true);
  assert.equal(profile.contactWindow.endSeconds, 0.16);
  assert.equal(profile.contactHoldMs, 85);
  assert.equal(profile.blendMs, 70);
  assert.deepEqual(profile.deflectWindow, { startSeconds: 0.09, endSeconds: 0.22 });
  assert.equal(profile.blendLeadSeconds, 0.03);
  assert.equal(profile.deflectRate, 1.15);

  const contact = sampleParryContactDeflectProbe(profile, 80);
  assert.equal(contact.phase, PARRY_CONTACT_DEFLECT_PHASES.CONTACT);
  assert.equal(contact.clipId, profile.contactClipId);

  const hold = sampleParryContactDeflectProbe(profile, profile.contactWindow.endSeconds * 1000 + 10);
  assert.equal(hold.phase, PARRY_CONTACT_DEFLECT_PHASES.CONTACT_HOLD);
  assert.equal(hold.sourceTimeSeconds, profile.contactWindow.endSeconds);

  const blend = sampleParryContactDeflectProbe(
    profile,
    profile.contactWindow.endSeconds * 1000 + profile.contactHoldMs + profile.blendMs * 0.5,
  );
  assert.equal(blend.phase, PARRY_CONTACT_DEFLECT_PHASES.BLEND);
  assert.equal(blend.fromClipId, profile.contactClipId);
  assert.equal(blend.toClipId, profile.deflectClipId);
  assert.ok(blend.blendAlpha > 0 && blend.blendAlpha < 1);

  const deflect = sampleParryContactDeflectProbe(
    profile,
    profile.contactWindow.endSeconds * 1000 + profile.contactHoldMs + profile.blendMs + 40,
  );
  assert.equal(deflect.phase, PARRY_CONTACT_DEFLECT_PHASES.DEFLECT);
  assert.equal(deflect.clipId, profile.deflectClipId);
  assert.ok(deflect.sourceTimeSeconds > profile.deflectWindow.startSeconds);
  assert.ok(deflect.sourceTimeSeconds < profile.deflectWindow.endSeconds);
});

test('G3.5.1P-T1 trims Perfect Parry power bash before late forward follow-through', () => {
  const profile = createParryContactDeflectProbeProfile(PARRY_CONTACT_DEFLECT_VARIANTS.PERFECT);
  assert.equal(profile.tuningPreset, PARRY_CONTACT_DEFLECT_TUNING_PRESETS.COMPACT);
  assert.equal(profile.contactClipId, 'SKYRIM_GUARD/shd_blockhit');
  assert.equal(profile.deflectClipId, 'SKYRIM_GUARD/shd_blockbashpower');
  assert.equal(profile.contactWindow.endSeconds, 0.16);
  assert.equal(profile.contactHoldMs, 95);
  assert.equal(profile.blendMs, 75);
  assert.deepEqual(profile.deflectWindow, { startSeconds: 0.12, endSeconds: 0.28 });
  assert.equal(profile.blendLeadSeconds, 0.035);
  assert.equal(profile.deflectRate, 1.1);
  assert.match(profile.shieldBashRiskControl, /compact-middle-segment/);
  const complete = sampleParryContactDeflectProbe(profile, profile.durationMs + 999);
  assert.equal(complete.phase, PARRY_CONTACT_DEFLECT_PHASES.COMPLETE);
  assert.equal(complete.clipId, profile.deflectClipId);
  assert.equal(complete.sourceTimeSeconds, profile.deflectWindow.endSeconds);
  assert.equal(complete.complete, true);
});

test('G3.5.1P Visual Tuning preserves P0 baseline for direct A/B review', () => {
  const normalP0 = createParryContactDeflectProbeProfile(PARRY_CONTACT_DEFLECT_VARIANTS.PARRY, {
    tuningPreset: PARRY_CONTACT_DEFLECT_TUNING_PRESETS.BASELINE,
  });
  const normalT1 = createParryContactDeflectProbeProfile(PARRY_CONTACT_DEFLECT_VARIANTS.PARRY);
  const perfectP0 = createParryContactDeflectProbeProfile(PARRY_CONTACT_DEFLECT_VARIANTS.PERFECT, {
    tuningPreset: PARRY_CONTACT_DEFLECT_TUNING_PRESETS.BASELINE,
  });
  const perfectT1 = createParryContactDeflectProbeProfile(PARRY_CONTACT_DEFLECT_VARIANTS.PERFECT);

  assert.equal(normalP0.contactWindow.endSeconds, 0.18);
  assert.equal(normalP0.contactHoldMs, 65);
  assert.deepEqual(normalP0.deflectWindow, { startSeconds: 0.04, endSeconds: 0.30 });
  assert.equal(perfectP0.contactWindow.endSeconds, 0.18);
  assert.equal(perfectP0.contactHoldMs, 75);
  assert.deepEqual(perfectP0.deflectWindow, { startSeconds: 0.08, endSeconds: 0.46 });

  assert.ok(normalT1.contactHoldMs > normalP0.contactHoldMs);
  assert.ok(perfectT1.contactHoldMs > perfectP0.contactHoldMs);
  assert.ok((normalT1.deflectWindow.endSeconds - normalT1.deflectWindow.startSeconds)
    < (normalP0.deflectWindow.endSeconds - normalP0.deflectWindow.startSeconds));
  assert.ok((perfectT1.deflectWindow.endSeconds - perfectT1.deflectWindow.startSeconds)
    < (perfectP0.deflectWindow.endSeconds - perfectP0.deflectWindow.startSeconds));
  assert.ok(normalT1.deflectWindow.endSeconds < normalP0.deflectWindow.endSeconds);
  assert.ok(perfectT1.deflectWindow.endSeconds < perfectP0.deflectWindow.endSeconds);
});

test('G3.5.1P trimming controls remain bounded and presentation-only', () => {
  const profile = createParryContactDeflectProbeProfile(PARRY_CONTACT_DEFLECT_VARIANTS.PARRY, {
    contactEndSeconds: 99,
    contactHoldMs: -20,
    blendMs: 999,
    deflectStartSeconds: 0.30,
    deflectEndSeconds: 0.20,
    deflectRate: 99,
  });
  assert.equal(profile.contactWindow.endSeconds, 0.60);
  assert.equal(profile.contactHoldMs, 0);
  assert.equal(profile.blendMs, 180);
  assert.equal(profile.deflectWindow.startSeconds, 0.30);
  assert.ok(profile.deflectWindow.endSeconds > profile.deflectWindow.startSeconds);
  assert.equal(profile.deflectRate, 2.5);
  assert.equal(profile.authority, 'presentation-probe-only');
  assert.equal('counterState' in profile, false);
  assert.equal('staggerDurationMs' in profile, false);
});
