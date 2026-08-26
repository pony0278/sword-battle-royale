import { LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE } from './post-coupling-recoil-stagger-handoff.js';

export const LIVE_PARRY_OLD_B3_HANDOFF_STAGE = 'G4.3B.5R.3.2';
export const LIVE_PARRY_OLD_B3_RELEASE_BLEND_MS = 28;

const ENABLED_ATTACK_DIRECTIONS = Object.freeze(new Set(['top', 'right']));

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function vec(value = {}) {
  return Object.freeze({
    x: finite(value.x),
    y: finite(value.y),
    z: finite(value.z),
  });
}

function subtract(a, b) {
  return vec({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
}

function rejection(reason, attackDirection = null) {
  return Object.freeze({
    accepted: false,
    stage: LIVE_PARRY_OLD_B3_HANDOFF_STAGE,
    reason,
    attackDirection,
  });
}

export function buildLiveParryOldB3Handoff(input = {}) {
  const attackDirection = String(input.attackDirection || '').toLowerCase();
  if (!ENABLED_ATTACK_DIRECTIONS.has(attackDirection)) {
    return rejection('attack-direction-deferred', attackDirection || null);
  }

  const contactReport = input.contactReport || {};
  if (contactReport.accepted !== true || contactReport.holding !== true) {
    return rejection('completed-live-contact-hold-required', attackDirection);
  }
  const inspectionPassed = contactReport.inspectionPassed === true
    && contactReport.inspectionAssessment?.failedGateCount === 0;
  const confirmedParryFallback = input.allowConfirmedParryFallback === true
    && input.confirmedParry === true;
  if (!inspectionPassed && !confirmedParryFallback) {
    return rejection('seven-of-seven-inspection-required', attackDirection);
  }

  const plan = contactReport.plan || {};
  const contactPoint = vec(plan.contactPoint);
  const targetContactPoint = vec(contactReport.targetContactPoint);
  const shieldOffset = subtract(targetContactPoint, contactPoint);
  const attackerWeaponOffset = vec(contactReport.actualContactOffset);
  const attackerArmOffset = vec(contactReport.actualGripOffset);
  const elapsedMs = Math.max(1, finite(contactReport.elapsedMs, 1));
  const surfaceAtContact = input.surfaceAtContact || Object.freeze({
    center: vec(plan.initialSurfaceCenter),
    normal: vec(plan.initialSurfaceNormal),
  });
  const couplingReport = Object.freeze({
    outcome: 'parry',
    attackDirection,
    elapsedMs,
    complete: true,
    releaseAttackerRecoil: true,
    recoilHandoffMode: LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE,
    shieldOffset,
    attackerWeaponOffset,
    attackerArmOffset,
    shieldTangent: vec(contactReport.mappedSurfaceTarget?.deflectionDirection),
    inspectionGateCount: 7,
    inspectionPassed,
    inspectionFallbackUsed: !inspectionPassed,
    failedInspectionGateKeys: Object.freeze([
      ...(contactReport.inspectionAssessment?.failedGateKeys || []),
    ]),
    liveContactErrorMeters: finite(contactReport.liveContactErrorMeters),
    profile: Object.freeze({
      durationMs: elapsedMs,
      recoilHandoffMode: LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE,
    }),
    authority: inspectionPassed
      ? 'verified-live-shield-sword-arm-contact-release-to-old-two-actor-b3'
      : 'confirmed-real-parry-fail-safe-release-to-old-two-actor-b3',
  });

  return Object.freeze({
    accepted: true,
    stage: LIVE_PARRY_OLD_B3_HANDOFF_STAGE,
    reason: inspectionPassed
      ? 'verified-live-contact-ready-for-old-b3'
      : 'confirmed-real-parry-fail-safe-ready-for-old-b3',
    attackDirection,
    couplingReport,
    surfaceAtContact,
    releaseBlendMs: LIVE_PARRY_OLD_B3_RELEASE_BLEND_MS,
    authority: couplingReport.authority,
  });
}

export function sampleLiveParryOldB3ReleaseBlend(
  elapsedMs = 0,
  durationMs = LIVE_PARRY_OLD_B3_RELEASE_BLEND_MS,
) {
  const duration = Math.max(1, finite(durationMs, LIVE_PARRY_OLD_B3_RELEASE_BLEND_MS));
  const progress = clamp(finite(elapsedMs) / duration, 0, 1);
  const easedProgress = progress * progress * (3 - 2 * progress);
  return Object.freeze({
    active: progress < 1,
    progress,
    contactPoseWeight: 1 - easedProgress,
    oldB3Weight: easedProgress,
    durationMs: duration,
    authority: 'old-two-actor-contact-pose-continuity-bridge-before-visible-b3-impulse',
  });
}
