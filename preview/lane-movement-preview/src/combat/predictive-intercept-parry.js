import {
  getGuardThreatTrackingProfile,
  planGuardThreatCorrection,
  predictGuardThreat,
} from './guard-threat-tracking.js';
import {
  GUARD_REACTION_VARIANTS,
  getGuardReactionProfile,
} from './guard-reaction-presentation.js';
import { applyGuardQuaternionOffsetsWeighted } from './longsword-guard-correction.js';
import { LONGSWORD_GUARD_AUTHORING_STATE } from './longsword-guard-metadata.js';
import { getProductionParryDeflectProfile } from '../animation/parry-contact-deflect-runtime-clip.js';
import {
  R18N_ACTIVE_INTERCEPT_PRESERVED_BONES,
} from './predictive-parry-ownership-policy.js';
import {
  R18N_SHIELD_ARM_DELTA_BONES,
  extractShieldArmAuthoredDelta,
} from './predictive-parry-arm-delta.js';
import { PARRY_LUNGE_PROMPT_TTC_SECONDS } from './parry-lunge-reach.js';

export const PREDICTIVE_INTERCEPT_PARRY_STAGE = 'G4.3B.5R';
export const RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE = 'G4.3B.5R.1';
export const RECOIL_PRESENTATION_AUTHORITY_STAGE = 'G4.3B.5R.2.3';
export const PREDICTIVE_PARRY_ENTRY_BLEND_SECONDS = 0.055;
const PREDICTIVE_PARRY_ENTRY_BLEND_BONES = Object.freeze(['spine', 'chest', 'upperarm.l', 'lowerarm.l', 'wrist.l']);
const PREDICTIVE_PARRY_EXTERNAL_SHIELD_ARM_BONES = Object.freeze(['root', 'hips', 'spine', 'chest', 'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l']);

export const PREDICTIVE_PARRY_INPUT_GRADES = Object.freeze({
  TOO_EARLY: 'too-early',
  EARLY: 'early-parry',
  PERFECT: 'perfect-parry',
  LATE: 'late-parry',
  TOO_LATE: 'too-late',
});

const PRODUCTION_PARRY_PRESENTATION_MARKERS = getProductionParryDeflectProfile('parry').presentationMarkers
  || Object.freeze({
    preContactStartSeconds: 0.205,
    contactPoseSeconds: 0.35,
  });

export const PREDICTIVE_INTERCEPT_PARRY_PROFILE = Object.freeze({
  detectionHorizonSeconds: 0.30,
  planeCaptureMeters: 0.055,
  // R19F.1: the prompt fires at the committed gate's earliest legal input edge - a lunge-length
  // journey spends every legal frame. The player's input window itself is unchanged.
  normalTriggerTtcSeconds: PARRY_LUNGE_PROMPT_TTC_SECONDS,
  perfectTriggerTtcSeconds: 0.065,
  minimumTriggerTtcSeconds: 0.020,
  earlyWindowEndSeconds: 0.22,
  perfectWindowStartSeconds: 0.045,
  perfectWindowEndSeconds: 0.075,
  lateWindowStartSeconds: 0.020,
  presentationStartSourceSeconds: PRODUCTION_PARRY_PRESENTATION_MARKERS.preContactStartSeconds,
  interceptSourceSeconds: PRODUCTION_PARRY_PRESENTATION_MARKERS.contactPoseSeconds,
  authority: 'rhythm-triggered-presentation-with-geometry-guided-tracking-until-authoritative-contact',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function freeze(value) {
  return Object.freeze(value);
}

function captureBoneQuaternionPose(character, boneIds) {
  const bones = character?.rig?.bones || {};
  return Object.freeze(Object.fromEntries(
    boneIds
      .filter((boneId) => bones[boneId]?.quaternion?.clone)
      .map((boneId) => [boneId, bones[boneId].quaternion.clone().normalize()]),
  ));
}

function capturePresentationEntryPose(character) {
  return captureBoneQuaternionPose(character, PREDICTIVE_PARRY_ENTRY_BLEND_BONES);
}

function restoreBoneQuaternionPose(character, pose) {
  const bones = character?.rig?.bones || {};
  for (const [boneId, saved] of Object.entries(pose || {})) {
    const bone = bones[boneId];
    if (!bone?.quaternion?.copy) continue;
    bone.quaternion.copy(saved).normalize();
  }
}

function blendPresentationEntryPose(character, entryPose, alpha) {
  if (alpha >= 1) return;
  const bones = character?.rig?.bones || {};
  for (const [boneId, from] of Object.entries(entryPose || {})) {
    const bone = bones[boneId];
    if (!bone?.quaternion?.clone) continue;
    const sampled = bone.quaternion.clone().normalize();
    bone.quaternion.copy(from).slerp(sampled, alpha).normalize();
  }
}

export function classifyPredictiveParryTiming(timeToContactSeconds, overrides = {}) {
  const profile = { ...PREDICTIVE_INTERCEPT_PARRY_PROFILE, ...overrides };
  const ttc = Math.max(0, finite(timeToContactSeconds, Infinity));
  if (!Number.isFinite(ttc) || ttc > profile.earlyWindowEndSeconds) {
    return PREDICTIVE_PARRY_INPUT_GRADES.TOO_EARLY;
  }
  if (ttc >= profile.perfectWindowStartSeconds && ttc <= profile.perfectWindowEndSeconds) {
    return PREDICTIVE_PARRY_INPUT_GRADES.PERFECT;
  }
  if (ttc > profile.perfectWindowEndSeconds) return PREDICTIVE_PARRY_INPUT_GRADES.EARLY;
  if (ttc >= profile.lateWindowStartSeconds) return PREDICTIVE_PARRY_INPUT_GRADES.LATE;
  return PREDICTIVE_PARRY_INPUT_GRADES.TOO_LATE;
}

export function getPredictiveParryTriggerTtcSeconds(requestedGrade = 'parry', overrides = {}) {
  const profile = { ...PREDICTIVE_INTERCEPT_PARRY_PROFILE, ...overrides };
  return String(requestedGrade || '').toLowerCase() === 'perfect'
    ? profile.perfectTriggerTtcSeconds
    : profile.normalTriggerTtcSeconds;
}

export function getLockedRhythmGuardIntentAgeMs(requestedGrade = 'parry', overrides = {}) {
  const requested = String(requestedGrade || 'parry').toLowerCase();
  const triggerMs = getPredictiveParryTriggerTtcSeconds(requested, overrides) * 1000;
  return requested === 'perfect'
    ? clamp(triggerMs, 0, 75)
    : clamp(triggerMs, 76, 180);
}

export function getCanonicalAttackTimeToContactSeconds(attackSnapshot = {}) {
  const contactSeconds = finite(attackSnapshot?.contactSeconds, NaN);
  const elapsedSeconds = finite(attackSnapshot?.elapsedSeconds, NaN);
  if (!Number.isFinite(contactSeconds) || !Number.isFinite(elapsedSeconds)) return null;
  return Math.max(0, contactSeconds - elapsedSeconds);
}

export function analyzeRhythmParryTrigger(input = {}) {
  const profile = { ...PREDICTIVE_INTERCEPT_PARRY_PROFILE, ...(input.profile || {}) };
  const requestedGrade = String(input.requestedGrade || 'parry').toLowerCase();
  const triggerTtcSeconds = getPredictiveParryTriggerTtcSeconds(requestedGrade, profile);
  const ttc = input.timeToContactSeconds == null
    ? getCanonicalAttackTimeToContactSeconds(input.attackSnapshot)
    : Math.max(0, finite(input.timeToContactSeconds));

  if (ttc == null) {
    return freeze({
      stage: RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE,
      available: false,
      reason: 'missing-canonical-attack-ttc',
      requestedGrade,
      timeToContactSeconds: null,
      triggerTtcSeconds,
      shouldTrigger: false,
      timingGrade: null,
      authority: 'attack-timeline-rhythm-trigger',
    });
  }

  const tooLate = ttc < profile.minimumTriggerTtcSeconds;
  const shouldTrigger = !tooLate && ttc <= triggerTtcSeconds;
  return freeze({
    stage: RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE,
    available: true,
    reason: tooLate
      ? 'rhythm-window-missed'
      : shouldTrigger
        ? 'rhythm-trigger-window'
        : 'rhythm-waiting',
    requestedGrade,
    timeToContactSeconds: ttc,
    triggerTtcSeconds,
    timingGrade: classifyPredictiveParryTiming(ttc, profile),
    shouldTrigger,
    authority: 'attack-timeline-rhythm-trigger',
  });
}

export function analyzePredictiveInterceptParry(input = {}) {
  const profile = { ...PREDICTIVE_INTERCEPT_PARRY_PROFILE, ...(input.profile || {}) };
  const rhythm = analyzeRhythmParryTrigger({
    attackSnapshot: input.attackSnapshot,
    timeToContactSeconds: input.rhythmTimeToContactSeconds,
    requestedGrade: input.requestedGrade,
    profile,
  });

  const hasGeometry = Boolean(input.previousBlade && input.currentBlade && input.bucklerSurface);
  if (!hasGeometry) {
    return freeze({
      stage: PREDICTIVE_INTERCEPT_PARRY_STAGE,
      rhythmStage: RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE,
      available: rhythm.available,
      reason: rhythm.shouldTrigger ? 'rhythm-trigger-no-predicted-geometry' : rhythm.reason,
      requestedGrade: rhythm.requestedGrade,
      timingGrade: rhythm.timingGrade,
      timeToContactSeconds: rhythm.timeToContactSeconds,
      triggerTtcSeconds: rhythm.triggerTtcSeconds,
      shouldTrigger: rhythm.shouldTrigger,
      threat: null,
      trackingPlan: null,
      planeCapturable: false,
      interceptable: false,
      rhythm,
      parryTrackingProfile: getGuardThreatTrackingProfile('parry'),
      authority: profile.authority,
    });
  }

  const threat = predictGuardThreat({
    previousBlade: input.previousBlade,
    currentBlade: input.currentBlade,
    bucklerSurface: input.bucklerSurface,
    deltaSeconds: input.deltaSeconds,
    horizonSeconds: profile.detectionHorizonSeconds,
    timeSamples: input.timeSamples || 24,
  });

  const trackingPlan = threat ? planGuardThreatCorrection({
    mode: 'parry',
    threat,
    bucklerSurface: input.bucklerSurface,
  }) : null;
  const planeCapturable = Boolean(threat)
    && Math.abs(finite(threat.signedDistance)) <= profile.planeCaptureMeters;
  const interceptable = Boolean(trackingPlan?.reachable) && planeCapturable;

  let geometryReason = 'no-predicted-threat';
  if (threat && !planeCapturable) geometryReason = 'predicted-plane-outside-capture-band';
  else if (threat && !trackingPlan?.reachable) geometryReason = 'predicted-intercept-out-of-parry-reach';
  else if (threat) geometryReason = 'predicted-intercept-trackable';

  return freeze({
    stage: PREDICTIVE_INTERCEPT_PARRY_STAGE,
    rhythmStage: RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE,
    available: rhythm.available || Boolean(threat),
    reason: rhythm.shouldTrigger
      ? (interceptable ? 'rhythm-trigger-trackable-intercept' : 'rhythm-trigger-reach-independent')
      : rhythm.reason,
    geometryReason,
    requestedGrade: rhythm.requestedGrade,
    timingGrade: rhythm.timingGrade,
    timeToContactSeconds: rhythm.timeToContactSeconds,
    predictedTimeToContactSeconds: threat?.futureSeconds ?? null,
    triggerTtcSeconds: rhythm.triggerTtcSeconds,
    planeCapturable,
    interceptable,
    shouldTrigger: rhythm.shouldTrigger,
    threat,
    trackingPlan,
    rhythm,
    parryTrackingProfile: getGuardThreatTrackingProfile('parry'),
    authority: profile.authority,
  });
}

function presentationProfile(variant) {
  const payload = variant === GUARD_REACTION_VARIANTS.PERFECT_PARRY
    ? { perfect: true, variant: GUARD_REACTION_VARIANTS.PERFECT_PARRY }
    : { variant: GUARD_REACTION_VARIANTS.PARRY };
  const profile = getGuardReactionProfile('guard_parry', payload);
  if (!profile) throw new Error('G4.3B.5R requires the production Guard Parry reaction profile');
  return { profile, payload };
}

export function createPredictiveInterceptParryPresentationRuntime(THREE, options = {}) {
  const character = options.character;
  if (!THREE?.Quaternion || !character?.sampleAnimation || !character?.getAnimationDuration) {
    throw new Error('G4.3B.5R predictive presentation requires THREE + animation-capable defender');
  }
  const guardOffsets = options.guardOffsets || LONGSWORD_GUARD_AUTHORING_STATE.offsets;
  let active = null;
  let lastReport = null;

  function reset() {
    active = null;
    lastReport = null;
    return null;
  }

  function start(input = {}) {
    if (active) return freeze({ accepted: false, reason: 'predictive-parry-already-active', report: lastReport });
    const requestedGrade = String(input.requestedGrade || input.variant || 'parry').toLowerCase();
    const variant = String(input.variant || '').toLowerCase() === GUARD_REACTION_VARIANTS.PERFECT_PARRY
      || requestedGrade === 'perfect'
      || requestedGrade === GUARD_REACTION_VARIANTS.PERFECT_PARRY
      ? GUARD_REACTION_VARIANTS.PERFECT_PARRY
      : GUARD_REACTION_VARIANTS.PARRY;
    const { profile, payload } = presentationProfile(variant);
    const triggerTtcSeconds = Math.max(
      PREDICTIVE_INTERCEPT_PARRY_PROFILE.minimumTriggerTtcSeconds,
      finite(input.triggerTtcSeconds, getPredictiveParryTriggerTtcSeconds(requestedGrade || variant)),
    );
    const lockedGuardIntentAgeMs = getLockedRhythmGuardIntentAgeMs(
      variant === GUARD_REACTION_VARIANTS.PERFECT_PARRY ? 'perfect' : 'parry',
      { ...PREDICTIVE_INTERCEPT_PARRY_PROFILE, ...(input.profile || {}),
        perfectTriggerTtcSeconds: variant === GUARD_REACTION_VARIANTS.PERFECT_PARRY ? triggerTtcSeconds : PREDICTIVE_INTERCEPT_PARRY_PROFILE.perfectTriggerTtcSeconds,
        normalTriggerTtcSeconds: variant === GUARD_REACTION_VARIANTS.PARRY ? triggerTtcSeconds : PREDICTIVE_INTERCEPT_PARRY_PROFILE.normalTriggerTtcSeconds,
      },
    );
    active = {
      sequence: finite(input.sequence, 0),
      requestedGrade,
      variant,
      payload,
      profile,
      triggerTtcSeconds,
      lockedGuardIntentAgeMs,
      elapsedMs: 0,
      entryBlendElapsedMs: 0,
      entryPose: capturePresentationEntryPose(character),
      shieldArmDeltaReferencePose: captureBoneQuaternionPose(character, R18N_SHIELD_ARM_DELTA_BONES),
      sourceTimeSeconds: PREDICTIVE_INTERCEPT_PARRY_PROFILE.presentationStartSourceSeconds,
    };
    lastReport = freeze({
      stage: RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE,
      authorityStage: RECOIL_PRESENTATION_AUTHORITY_STAGE,
      baseStage: PREDICTIVE_INTERCEPT_PARRY_STAGE,
      active: true,
      justStarted: true,
      sequence: active.sequence,
      requestedGrade,
      variant,
      elapsedMs: 0,
      presentationElapsedMs: 0,
      sourceTimeSeconds: active.sourceTimeSeconds,
      entryBlendProgress: 0,
      shieldArmOwnership: 'predictive-presentation',
      upperBodyAnticipationOwnership: 'predictive-presentation',
      shieldArmAuthoredDelta: null,
      triggerTtcSeconds,
      guardIntentAgeMs: lockedGuardIntentAgeMs,
      lockedGuardIntentAgeMs,
      readyForAuthoritativeHandoff: false,
      timingAuthority: 'rhythm-trigger-locked-until-authoritative-contact',
      authority: PREDICTIVE_INTERCEPT_PARRY_PROFILE.authority,
    });
    return freeze({ accepted: true, report: lastReport });
  }

  function update(input = {}) {
    if (!active) return freeze({
      stage: RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE,
      authorityStage: RECOIL_PRESENTATION_AUTHORITY_STAGE,
      baseStage: PREDICTIVE_INTERCEPT_PARRY_STAGE,
      active: false,
      reason: 'predictive-parry-not-active',
      authority: PREDICTIVE_INTERCEPT_PARRY_PROFILE.authority,
    });

    const deltaSeconds = Math.max(0, finite(input.deltaSeconds, 1 / 60));
    active.elapsedMs += deltaSeconds * 1000;
    active.entryBlendElapsedMs += Math.min(deltaSeconds * 1000, 20);
    const entryBlendProgress = clamp(active.entryBlendElapsedMs / (PREDICTIVE_PARRY_ENTRY_BLEND_SECONDS * 1000), 0, 1);
    const preserveShieldArm = input.preserveShieldArm === true;
    const shieldArmPose = preserveShieldArm
      ? captureBoneQuaternionPose(character, R18N_ACTIVE_INTERCEPT_PRESERVED_BONES)
      : null;
    const ttc = Math.max(0, finite(input.timeToContactSeconds, active.triggerTtcSeconds));
    const progress = clamp(1 - ttc / active.triggerTtcSeconds, 0, 1);
    const targetSource = PREDICTIVE_INTERCEPT_PARRY_PROFILE.presentationStartSourceSeconds
      + (PREDICTIVE_INTERCEPT_PARRY_PROFILE.interceptSourceSeconds
        - PREDICTIVE_INTERCEPT_PARRY_PROFILE.presentationStartSourceSeconds) * progress;
    active.sourceTimeSeconds = Math.max(active.sourceTimeSeconds, targetSource);

    const registeredDuration = Math.max(
      0.001,
      finite(character.getAnimationDuration(active.profile.clipId), active.profile.sourceDurationSeconds),
    );
    const sourceTimeSeconds = clamp(active.sourceTimeSeconds, 0, registeredDuration);
    character.sampleAnimation(active.profile.clipId, sourceTimeSeconds, {
      loop: false,
      inPlace: true,
      rootRotationPolicy: 'lock',
    });
    applyGuardQuaternionOffsetsWeighted(THREE, character.rig, guardOffsets, active.profile.correctionWeight);
    blendPresentationEntryPose(character, active.entryPose, entryBlendProgress);
    const authoredShieldArmPose = captureBoneQuaternionPose(character, R18N_SHIELD_ARM_DELTA_BONES);
    const shieldArmAuthoredDelta = extractShieldArmAuthoredDelta({
      referencePose: active.shieldArmDeltaReferencePose,
      authoredPose: authoredShieldArmPose,
    });
    if (shieldArmPose) restoreBoneQuaternionPose(character, shieldArmPose);
    character.update?.(0, input.camera);

    lastReport = freeze({
      stage: RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE,
      authorityStage: RECOIL_PRESENTATION_AUTHORITY_STAGE,
      baseStage: PREDICTIVE_INTERCEPT_PARRY_STAGE,
      active: true,
      sequence: active.sequence,
      requestedGrade: active.requestedGrade,
      variant: active.variant,
      elapsedMs: active.elapsedMs,
      presentationElapsedMs: active.elapsedMs,
      sourceTimeSeconds,
      triggerTtcSeconds: active.triggerTtcSeconds,
      timeToContactSeconds: ttc,
      progress,
      entryBlendProgress,
      shieldArmOwnership: preserveShieldArm ? 'external-active-intercept-tracking' : 'predictive-presentation',
      upperBodyAnticipationOwnership: preserveShieldArm
        ? 'predictive-presentation-spine-chest'
        : 'predictive-presentation',
      shieldArmAuthoredDelta,
      readyForAuthoritativeHandoff: ttc <= 0.02 || progress >= 0.9,
      defenderPresentationOffsetSeconds: sourceTimeSeconds,
      guardIntentAgeMs: active.lockedGuardIntentAgeMs,
      lockedGuardIntentAgeMs: active.lockedGuardIntentAgeMs,
      timingAuthority: 'rhythm-trigger-locked-until-authoritative-contact',
      authority: PREDICTIVE_INTERCEPT_PARRY_PROFILE.authority,
    });
    return lastReport;
  }

  function handoff() {
    if (!active || !lastReport) return freeze({ accepted: false, reason: 'predictive-parry-not-active' });
    const report = lastReport;
    active = null;
    return freeze({
      accepted: true,
      stage: RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE,
      authorityStage: RECOIL_PRESENTATION_AUTHORITY_STAGE,
      baseStage: PREDICTIVE_INTERCEPT_PARRY_STAGE,
      sequence: report.sequence,
      requestedGrade: report.requestedGrade,
      variant: report.variant,
      guardIntentAgeMs: report.lockedGuardIntentAgeMs,
      lockedGuardIntentAgeMs: report.lockedGuardIntentAgeMs,
      presentationElapsedMs: report.presentationElapsedMs,
      defenderPresentationOffsetSeconds: report.sourceTimeSeconds,
      timingAuthority: 'rhythm-trigger-locked-until-authoritative-contact',
      authority: 'authoritative-contact-handoff-with-locked-rhythm-grade',
    });
  }

  return freeze({
    start,
    update,
    handoff,
    reset,
    get active() { return Boolean(active); },
    get report() { return lastReport; },
  });
}
