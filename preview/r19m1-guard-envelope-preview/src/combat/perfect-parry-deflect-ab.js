import {
  PARRY_CONTACT_DEFLECT_TUNING_PRESETS,
  PARRY_CONTACT_DEFLECT_VARIANTS,
  createParryContactDeflectProbeProfile,
  sampleParryContactDeflectProbe,
} from './parry-contact-deflect-probe.js';

export const PERFECT_PARRY_DEFLECT_AB_STAGE = 'G3.5.1P-T2';

export const PERFECT_PARRY_DEFLECT_CANDIDATES = Object.freeze({
  SHARED: 'shared-normal-t1',
  POWER: 'power-t1',
});

function resolveCandidate(value) {
  return value === PERFECT_PARRY_DEFLECT_CANDIDATES.POWER
    ? PERFECT_PARRY_DEFLECT_CANDIDATES.POWER
    : PERFECT_PARRY_DEFLECT_CANDIDATES.SHARED;
}

function durationMsFor(profile) {
  const deflectPlaybackSeconds = (
    profile.deflectWindow.endSeconds
    - profile.deflectWindow.startSeconds
    - profile.blendLeadSeconds
  ) / profile.deflectRate;
  return profile.contactWindow.endSeconds * 1000
    + profile.contactHoldMs
    + profile.blendMs
    + deflectPlaybackSeconds * 1000;
}

export function createPerfectParryDeflectAbProfile(candidate = PERFECT_PARRY_DEFLECT_CANDIDATES.SHARED) {
  const resolvedCandidate = resolveCandidate(candidate);
  const normalT1 = createParryContactDeflectProbeProfile(PARRY_CONTACT_DEFLECT_VARIANTS.PARRY, {
    tuningPreset: PARRY_CONTACT_DEFLECT_TUNING_PRESETS.COMPACT,
  });
  const perfectT1 = createParryContactDeflectProbeProfile(PARRY_CONTACT_DEFLECT_VARIANTS.PERFECT, {
    tuningPreset: PARRY_CONTACT_DEFLECT_TUNING_PRESETS.COMPACT,
  });

  if (resolvedCandidate === PERFECT_PARRY_DEFLECT_CANDIDATES.POWER) {
    return Object.freeze({
      ...perfectT1,
      t2Stage: PERFECT_PARRY_DEFLECT_AB_STAGE,
      t2Candidate: resolvedCandidate,
      id: 'g351p_t2_perfect_power_deflect',
      deflectSourcePolicy: 'perfect-power-t1',
      comparisonContactLocked: true,
      visualHypothesis: 'Keep the T1 power-bash trim only if it reads as a stronger redirect without becoming a forward Shield Bash.',
    });
  }

  const shared = {
    ...perfectT1,
    t2Stage: PERFECT_PARRY_DEFLECT_AB_STAGE,
    t2Candidate: resolvedCandidate,
    id: 'g351p_t2_perfect_shared_normal_deflect',
    deflectClipId: normalT1.deflectClipId,
    deflectWindow: normalT1.deflectWindow,
    blendLeadSeconds: normalT1.blendLeadSeconds,
    deflectRate: normalT1.deflectRate,
    deflectSourcePolicy: 'reuse-normal-t1-compact-deflect',
    comparisonContactLocked: true,
    shieldBashRiskControl: 'remove-power-bash-source-from-perfect-parry-presentation',
    visualHypothesis: 'Keep Perfect contact weight, but reuse the cleaner Normal T1 redirect; Perfect strength should come from outcome, hitstop and FX rather than a bash-like motion.',
  };
  shared.durationMs = durationMsFor(shared);
  return Object.freeze(shared);
}

export function samplePerfectParryDeflectAbProfile(profile, elapsedMs = 0) {
  return sampleParryContactDeflectProbe(profile, elapsedMs);
}

export function comparePerfectParryDeflectAbContracts() {
  const shared = createPerfectParryDeflectAbProfile(PERFECT_PARRY_DEFLECT_CANDIDATES.SHARED);
  const power = createPerfectParryDeflectAbProfile(PERFECT_PARRY_DEFLECT_CANDIDATES.POWER);
  return Object.freeze({
    stage: PERFECT_PARRY_DEFLECT_AB_STAGE,
    shared,
    power,
    sameContactTiming: shared.contactWindow.endSeconds === power.contactWindow.endSeconds
      && shared.contactHoldMs === power.contactHoldMs
      && shared.blendMs === power.blendMs,
    productionEnabled: false,
    authority: 'presentation-probe-only',
  });
}
