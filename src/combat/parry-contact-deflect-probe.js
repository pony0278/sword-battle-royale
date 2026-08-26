export const PARRY_CONTACT_DEFLECT_PROBE_STAGE = 'G3.5.1P';
export const PARRY_CONTACT_DEFLECT_TUNING_STAGE = 'G3.5.1P-T1';

export const PARRY_CONTACT_DEFLECT_VARIANTS = Object.freeze({
  PARRY: 'parry',
  PERFECT: 'perfect',
});

export const PARRY_CONTACT_DEFLECT_PHASES = Object.freeze({
  CONTACT: 'contact',
  CONTACT_HOLD: 'contact-hold',
  BLEND: 'blend',
  DEFLECT: 'deflect',
  COMPLETE: 'complete',
});

export const PARRY_CONTACT_DEFLECT_TUNING_PRESETS = Object.freeze({
  BASELINE: 'baseline-p0',
  COMPACT: 'compact-t1',
});

const CONTACT_CLIP_ID = 'SKYRIM_GUARD/shd_blockhit';
const ROOT_ROTATION_POLICY = 'lock';

const PRESETS = Object.freeze({
  [PARRY_CONTACT_DEFLECT_VARIANTS.PARRY]: Object.freeze({
    [PARRY_CONTACT_DEFLECT_TUNING_PRESETS.BASELINE]: Object.freeze({
      id: 'g351p_parry_contact_to_deflect_p0',
      deflectClipId: 'SKYRIM_GUARD/shd_blockbash',
      contactEndSeconds: 0.18,
      contactHoldMs: 65,
      blendMs: 55,
      deflectStartSeconds: 0.04,
      deflectEndSeconds: 0.30,
      blendLeadSeconds: 0.045,
      deflectRate: 1,
      visualHypothesis: 'P0 baseline keeps most of the bash source for comparison.',
    }),
    [PARRY_CONTACT_DEFLECT_TUNING_PRESETS.COMPACT]: Object.freeze({
      id: 'g351p_parry_contact_to_deflect_t1',
      deflectClipId: 'SKYRIM_GUARD/shd_blockbash',
      contactEndSeconds: 0.16,
      contactHoldMs: 85,
      blendMs: 70,
      deflectStartSeconds: 0.09,
      deflectEndSeconds: 0.22,
      blendLeadSeconds: 0.03,
      deflectRate: 1.15,
      visualHypothesis: 'T1 freezes a readable shield contact longer, skips early bash preparation, and removes late forward follow-through so the source reads as a compact redirect.',
    }),
  }),
  [PARRY_CONTACT_DEFLECT_VARIANTS.PERFECT]: Object.freeze({
    [PARRY_CONTACT_DEFLECT_TUNING_PRESETS.BASELINE]: Object.freeze({
      id: 'g351p_perfect_contact_to_power_deflect_p0',
      deflectClipId: 'SKYRIM_GUARD/shd_blockbashpower',
      contactEndSeconds: 0.18,
      contactHoldMs: 75,
      blendMs: 60,
      deflectStartSeconds: 0.08,
      deflectEndSeconds: 0.46,
      blendLeadSeconds: 0.06,
      deflectRate: 1,
      visualHypothesis: 'P0 baseline preserves the longer power-bash displacement for comparison.',
    }),
    [PARRY_CONTACT_DEFLECT_TUNING_PRESETS.COMPACT]: Object.freeze({
      id: 'g351p_perfect_contact_to_power_deflect_t1',
      deflectClipId: 'SKYRIM_GUARD/shd_blockbashpower',
      contactEndSeconds: 0.16,
      contactHoldMs: 95,
      blendMs: 75,
      deflectStartSeconds: 0.12,
      deflectEndSeconds: 0.28,
      blendLeadSeconds: 0.035,
      deflectRate: 1.10,
      visualHypothesis: 'T1 keeps the stronger Perfect Parry accent but trims the power-bash before it develops into a forward body-check / shield strike.',
    }),
  }),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resolveVariant(value) {
  return value === PARRY_CONTACT_DEFLECT_VARIANTS.PERFECT
    ? PARRY_CONTACT_DEFLECT_VARIANTS.PERFECT
    : PARRY_CONTACT_DEFLECT_VARIANTS.PARRY;
}

function resolvePreset(value) {
  return value === PARRY_CONTACT_DEFLECT_TUNING_PRESETS.BASELINE
    ? PARRY_CONTACT_DEFLECT_TUNING_PRESETS.BASELINE
    : PARRY_CONTACT_DEFLECT_TUNING_PRESETS.COMPACT;
}

export function createParryContactDeflectProbeProfile(variant = PARRY_CONTACT_DEFLECT_VARIANTS.PARRY, overrides = {}) {
  const resolvedVariant = resolveVariant(variant);
  const tuningPreset = resolvePreset(overrides.tuningPreset);
  const base = PRESETS[resolvedVariant][tuningPreset];
  const contactEndSeconds = clamp(finiteOr(overrides.contactEndSeconds, base.contactEndSeconds), 0.02, 0.60);
  const contactHoldMs = clamp(finiteOr(overrides.contactHoldMs, base.contactHoldMs), 0, 180);
  const blendMs = clamp(finiteOr(overrides.blendMs, base.blendMs), 0, 180);
  const deflectStartSeconds = Math.max(0, finiteOr(overrides.deflectStartSeconds, base.deflectStartSeconds));
  const deflectEndSeconds = Math.max(deflectStartSeconds + 0.01, finiteOr(overrides.deflectEndSeconds, base.deflectEndSeconds));
  const blendLeadSeconds = clamp(
    finiteOr(overrides.blendLeadSeconds, base.blendLeadSeconds),
    0,
    deflectEndSeconds - deflectStartSeconds,
  );
  const deflectRate = clamp(finiteOr(overrides.deflectRate, base.deflectRate), 0.25, 2.5);
  const deflectPlaybackSeconds = (deflectEndSeconds - deflectStartSeconds - blendLeadSeconds) / deflectRate;
  const durationMs = contactEndSeconds * 1000 + contactHoldMs + blendMs + deflectPlaybackSeconds * 1000;

  return Object.freeze({
    stage: PARRY_CONTACT_DEFLECT_PROBE_STAGE,
    tuningStage: PARRY_CONTACT_DEFLECT_TUNING_STAGE,
    tuningPreset,
    id: base.id,
    variant: resolvedVariant,
    productionEnabled: false,
    probeOnly: true,
    contactClipId: CONTACT_CLIP_ID,
    deflectClipId: base.deflectClipId,
    contactWindow: Object.freeze({ startSeconds: 0, endSeconds: contactEndSeconds }),
    contactHoldMs,
    blendMs,
    deflectWindow: Object.freeze({ startSeconds: deflectStartSeconds, endSeconds: deflectEndSeconds }),
    blendLeadSeconds,
    deflectRate,
    durationMs,
    rootRotationPolicy: ROOT_ROTATION_POLICY,
    inPlace: true,
    semanticIntent: 'incoming attack contacts shield first, then shield redirects the attack line outward',
    visualHypothesis: base.visualHypothesis,
    shieldBashRiskControl: tuningPreset === PARRY_CONTACT_DEFLECT_TUNING_PRESETS.COMPACT
      ? 'compact-middle-segment-trim-plus-longer-contact-read'
      : 'baseline-comparison-only',
    authority: 'presentation-probe-only',
  });
}

export function sampleParryContactDeflectProbe(profile, elapsedMs = 0) {
  if (!profile) return null;
  const elapsed = clamp(elapsedMs, 0, profile.durationMs);
  const contactEndMs = profile.contactWindow.endSeconds * 1000;
  const holdEndMs = contactEndMs + profile.contactHoldMs;
  const blendEndMs = holdEndMs + profile.blendMs;

  if (elapsed < contactEndMs) {
    return Object.freeze({
      phase: PARRY_CONTACT_DEFLECT_PHASES.CONTACT,
      elapsedMs: elapsed,
      clipId: profile.contactClipId,
      sourceTimeSeconds: elapsed / 1000,
      rootRotationPolicy: profile.rootRotationPolicy,
      complete: false,
    });
  }

  if (elapsed < holdEndMs) {
    return Object.freeze({
      phase: PARRY_CONTACT_DEFLECT_PHASES.CONTACT_HOLD,
      elapsedMs: elapsed,
      clipId: profile.contactClipId,
      sourceTimeSeconds: profile.contactWindow.endSeconds,
      rootRotationPolicy: profile.rootRotationPolicy,
      complete: false,
    });
  }

  if (elapsed < blendEndMs && profile.blendMs > 0) {
    const alpha = clamp((elapsed - holdEndMs) / profile.blendMs, 0, 1);
    return Object.freeze({
      phase: PARRY_CONTACT_DEFLECT_PHASES.BLEND,
      elapsedMs: elapsed,
      fromClipId: profile.contactClipId,
      fromSourceTimeSeconds: profile.contactWindow.endSeconds,
      toClipId: profile.deflectClipId,
      toSourceTimeSeconds: profile.deflectWindow.startSeconds + profile.blendLeadSeconds * alpha,
      blendAlpha: alpha,
      rootRotationPolicy: profile.rootRotationPolicy,
      complete: false,
    });
  }

  if (elapsed < profile.durationMs) {
    const afterBlendSeconds = Math.max(0, elapsed - blendEndMs) / 1000;
    const sourceTimeSeconds = Math.min(
      profile.deflectWindow.endSeconds,
      profile.deflectWindow.startSeconds + profile.blendLeadSeconds + afterBlendSeconds * profile.deflectRate,
    );
    return Object.freeze({
      phase: PARRY_CONTACT_DEFLECT_PHASES.DEFLECT,
      elapsedMs: elapsed,
      clipId: profile.deflectClipId,
      sourceTimeSeconds,
      rootRotationPolicy: profile.rootRotationPolicy,
      complete: false,
    });
  }

  return Object.freeze({
    phase: PARRY_CONTACT_DEFLECT_PHASES.COMPLETE,
    elapsedMs: profile.durationMs,
    clipId: profile.deflectClipId,
    sourceTimeSeconds: profile.deflectWindow.endSeconds,
    rootRotationPolicy: profile.rootRotationPolicy,
    complete: true,
  });
}
