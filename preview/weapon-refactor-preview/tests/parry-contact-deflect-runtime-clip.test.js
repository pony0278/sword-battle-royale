import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G36_POWER_PARRY_TORSO_SAFETY_LIMITS_DEGREES,
  PRODUCTION_PARRY_DEFLECT_CLIP_IDS,
  PRODUCTION_PARRY_DEFLECT_PHASES,
  PRODUCTION_PARRY_DEFLECT_STAGE,
  PRODUCTION_PARRY_DEFLECT_VARIANTS,
  getProductionParryDeflectProfile,
  sampleProductionParryDeflectTimeline,
} from '../src/animation/parry-contact-deflect-runtime-clip.js';

test('G3.6.3 promotes approved D full-recovery Power Bash into production', () => {
  const parry = getProductionParryDeflectProfile(PRODUCTION_PARRY_DEFLECT_VARIANTS.PARRY);
  const perfect = getProductionParryDeflectProfile(PRODUCTION_PARRY_DEFLECT_VARIANTS.PERFECT_PARRY);

  assert.equal(PRODUCTION_PARRY_DEFLECT_STAGE, 'G3.6.3');
  assert.equal(parry.stage, 'G3.6.3');
  assert.equal(perfect.stage, 'G3.6.3');
  assert.equal(parry.productionEnabled, true);
  assert.equal(parry.probeOnly, false);
  assert.equal(parry.contactClipId, 'SKYRIM_GUARD/shd_blockhit');
  assert.equal(parry.deflectClipId, 'SKYRIM_GUARD/shd_blockbashpower');
  assert.equal(parry.sourceDecision, 'G3_6_3_PROMOTE_D_FULL_RECOVERY');
  assert.equal(parry.sharedMotionFamily, 'g363-blockhit-powerbash-full-recovery');
  assert.equal(perfect.sharedMotionFamily, parry.sharedMotionFamily);
  assert.equal(parry.sharedMotionContract, true);
  assert.deepEqual(parry.upperBodySafetyLimitsDegrees, G36_POWER_PARRY_TORSO_SAFETY_LIMITS_DEGREES);
});

test('G3.6.3 Parry Advantage and Perfect Parry share the exact D production timing', () => {
  const parry = getProductionParryDeflectProfile(PRODUCTION_PARRY_DEFLECT_VARIANTS.PARRY);
  const perfect = getProductionParryDeflectProfile(PRODUCTION_PARRY_DEFLECT_VARIANTS.PERFECT_PARRY);

  for (const key of [
    'contactEndSeconds',
    'contactHoldSeconds',
    'holdEndSeconds',
    'blendSeconds',
    'blendEndSeconds',
    'deflectStartSeconds',
    'deflectPowerEndSeconds',
    'deflectRecoveryStartSeconds',
    'deflectEndSeconds',
    'deflectBlendLeadSeconds',
    'deflectRate',
    'deflectRecoveryRate',
    'deflectPowerEndAtSeconds',
    'deflectRecoveryEndAtSeconds',
    'reactionDurationSeconds',
  ]) assert.equal(perfect[key], parry[key], `${key} must be shared`);

  assert.equal(parry.contactEndSeconds, 0.16);
  assert.equal(parry.contactHoldSeconds, 0.05);
  assert.equal(parry.blendSeconds, 0.055);
  assert.equal(parry.deflectStartSeconds, 0.08);
  assert.equal(parry.deflectPowerEndSeconds, 0.55);
  assert.equal(parry.deflectRecoveryStartSeconds, 0.55);
  assert.equal(parry.deflectEndSeconds, 0.70);
  assert.equal(parry.deflectBlendLeadSeconds, 0);
  assert.equal(parry.deflectRate, 0.95);
  assert.equal(parry.deflectRecoveryRate, 1.0);
  assert.equal(parry.reactionDurationSeconds, 0.96);
  assert.deepEqual(parry.presentationMarkers, {
    preContactStartSeconds: 0.205,
    contactPoseSeconds: 0.35,
    deflectImpulseSeconds: 0.35,
    attackerReleaseEligibleSeconds: 0.35,
  });
  assert.deepEqual(perfect.presentationMarkers, parry.presentationMarkers);
  assert.ok(Math.abs(parry.deflectPowerEndAtSeconds - 0.7597368421052632) < 1e-9);
  assert.ok(Math.abs(parry.deflectRecoveryEndAtSeconds - 0.9097368421052632) < 1e-9);
  assert.ok(parry.reactionDurationSeconds - parry.deflectRecoveryEndAtSeconds > 0.05 - 1e-9);
  assert.notEqual(parry.clipId, perfect.clipId, 'runtime keeps variant IDs for compatibility while baking identical motion');
  assert.equal(parry.clipId, PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PARRY);
  assert.equal(perfect.clipId, PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY);
  assert.match(parry.clipId, /g363$/);
  assert.match(perfect.clipId, /g363$/);
});

test('G3.6.3 timeline sequences Block Hit, full D power, authored recovery and settle', () => {
  const variant = PRODUCTION_PARRY_DEFLECT_VARIANTS.PARRY;
  const profile = getProductionParryDeflectProfile(variant);

  const contact = sampleProductionParryDeflectTimeline(variant, 0.12);
  assert.equal(contact.phase, PRODUCTION_PARRY_DEFLECT_PHASES.CONTACT);
  assert.equal(contact.sourceTimeSeconds, 0.12);

  const hold = sampleProductionParryDeflectTimeline(variant, 0.18);
  assert.equal(hold.phase, PRODUCTION_PARRY_DEFLECT_PHASES.CONTACT_HOLD);
  assert.equal(hold.sourceTimeSeconds, 0.16);

  const blendTime = profile.holdEndSeconds + profile.blendSeconds * 0.5;
  const blend = sampleProductionParryDeflectTimeline(variant, blendTime);
  assert.equal(blend.phase, PRODUCTION_PARRY_DEFLECT_PHASES.BLEND);
  assert.equal(blend.toSourceTimeSeconds, 0.08, 'blend must not consume any approved D power frames');

  const power = sampleProductionParryDeflectTimeline(variant, profile.blendEndSeconds + 0.20);
  assert.equal(power.phase, PRODUCTION_PARRY_DEFLECT_PHASES.DEFLECT);
  assert.ok(power.sourceTimeSeconds > 0.08 && power.sourceTimeSeconds < 0.55);

  const powerEnd = sampleProductionParryDeflectTimeline(variant, profile.deflectPowerEndAtSeconds - 1e-6);
  assert.equal(powerEnd.phase, PRODUCTION_PARRY_DEFLECT_PHASES.DEFLECT);
  assert.ok(powerEnd.sourceTimeSeconds > 0.549);

  const recovery = sampleProductionParryDeflectTimeline(variant, profile.deflectPowerEndAtSeconds + 0.075);
  assert.equal(recovery.phase, PRODUCTION_PARRY_DEFLECT_PHASES.RECOVERY);
  assert.ok(Math.abs(recovery.sourceTimeSeconds - 0.625) < 1e-6);

  const settle = sampleProductionParryDeflectTimeline(variant, 0.94);
  assert.equal(settle.phase, PRODUCTION_PARRY_DEFLECT_PHASES.SETTLE);
  assert.equal(settle.sourceTimeSeconds, 0.70);
  assert.equal(settle.completeVisualChain, true);
});

test('G3.6.3 Perfect Parry differs by gameplay reward, not body motion', () => {
  const normal = getProductionParryDeflectProfile(PRODUCTION_PARRY_DEFLECT_VARIANTS.PARRY);
  const perfect = getProductionParryDeflectProfile(PRODUCTION_PARRY_DEFLECT_VARIANTS.PERFECT_PARRY);
  assert.equal(perfect.deflectClipId, normal.deflectClipId);
  assert.equal(perfect.deflectStartSeconds, normal.deflectStartSeconds);
  assert.equal(perfect.deflectPowerEndSeconds, normal.deflectPowerEndSeconds);
  assert.equal(perfect.deflectEndSeconds, normal.deflectEndSeconds);
  assert.equal(perfect.deflectRate, normal.deflectRate);
  assert.equal(perfect.deflectRecoveryRate, normal.deflectRecoveryRate);
  assert.equal(perfect.contactHoldSeconds, normal.contactHoldSeconds);
  assert.equal(perfect.blendSeconds, normal.blendSeconds);
  assert.match(perfect.perfectDifferentiation, /same-motion-as-parry-advantage/);
});
