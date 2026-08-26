export const ACTIVE_PARRY_INTERCEPT_DIAGNOSIS_STAGE = 'R18N.0';

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function centimeters(value) {
  const number = finite(value);
  return number == null ? null : number * 100;
}

function degreesPerSecond(value) {
  const number = finite(value);
  return number == null ? null : number * 180 / Math.PI;
}

function classify({ input, plan, motion }) {
  if (input?.accepted !== true) return input ? `input-${input.reason || 'rejected'}` : 'awaiting-manual-input';
  if (!plan) return 'accepted-input-awaiting-tracking-plan';
  if (plan.reason === 'already-covered' && (finite(plan.appliedDistance, 0) <= 1e-5)) {
    return 'guard-already-covers-threat-no-active-translation-requested';
  }
  if (finite(plan.appliedDistance, 0) <= 1e-5) return 'no-distinct-active-translation-requested';
  if (motion?.moving === true) return 'active-intercept-motion-observed';
  return 'active-intercept-requested-motion-not-yet-observed';
}

export function buildActiveParryInterceptDiagnosis({ attackSnapshot = {}, exchangeState = {} } = {}) {
  const input = exchangeState.latestParryInput || null;
  const plan = exchangeState.latestFinePlan || null;
  const tracking = exchangeState.latestFineTracking || null;
  const target = exchangeState.latestReachableInterceptTarget || null;
  const motion = exchangeState.latestShieldLeadMotion || null;
  const contact = exchangeState.firstContact || null;
  const confirmation = exchangeState.latestParryConfirmation || null;
  const plannerReason = plan?.reason || null;
  const alreadyCovered = plannerReason === 'already-covered';

  return Object.freeze({
    stage: ACTIVE_PARRY_INTERCEPT_DIAGNOSIS_STAGE,
    direction: attackSnapshot.direction || contact?.direction || null,
    input: Object.freeze({
      accepted: input?.accepted ?? null,
      reason: input?.reason || null,
      timeToContactMs: input?.timeToContactSeconds == null ? null : input.timeToContactSeconds * 1000,
      attackCommitted: input?.gates?.attackCommitted ?? null,
      timingInsideWindow: input?.gates?.timingInsideWindow ?? null,
    }),
    planner: Object.freeze({
      reason: plannerReason,
      reachable: plan?.reachable ?? null,
      requiredTravelCm: centimeters(plan?.requiredDistance ?? input?.requiredShieldTravelMeters),
      appliedTravelCm: centimeters(plan?.appliedDistance),
      achievedTravelCm: centimeters(tracking?.achievedDistance),
      targetSource: target?.source || null,
      fallbackApplied: target?.fallbackApplied ?? null,
      measuredInsideAcquisitionBand: target?.measuredInsideAcquisitionBand ?? null,
      predictedRequiredTravelCm: centimeters(target?.predictedRequiredDistanceMeters),
      measuredRequiredTravelCm: centimeters(target?.measuredRequiredDistanceMeters),
    }),
    shieldMotion: Object.freeze({
      moving: motion?.moving ?? null,
      translationCm: centimeters(motion?.translationMeters),
      translationSpeedMps: finite(motion?.translationSpeedMps),
      angularSpeedDegPerSecond: degreesPerSecond(motion?.angularSpeedRadPerSecond),
    }),
    contact: Object.freeze({
      realSweptContact: confirmation?.gates?.realSweptContact ?? null,
      confirmed: confirmation?.accepted ?? null,
      geometricContact: contact?.geometricContact ?? null,
      eligible: contact?.eligible ?? null,
    }),
    hypothesis: Object.freeze({
      guardAlreadyCoveredThreat: alreadyCovered,
      zeroActiveTranslationRequested: plan ? finite(plan.appliedDistance, 0) <= 1e-5 : null,
      activeShieldMotionObserved: motion?.moving ?? null,
    }),
    conclusion: classify({ input, plan, motion }),
    authority: 'read-only-diagnostic-derived-from-existing-r281-telemetry-no-gameplay-authority',
  });
}
