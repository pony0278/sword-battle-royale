export const PARRY_WHIFF_DIAGNOSTIC_STAGE = 'G4.3B.5R.3.1W';
export const PARRY_WHIFF_GAP_EPSILON_METERS = 0.005;

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function freezePoint(value) {
  if (!value) return null;
  const x = finiteOrNull(value.x);
  const y = finiteOrNull(value.y);
  const z = finiteOrNull(value.z);
  return x == null || y == null || z == null ? null : Object.freeze({ x, y, z });
}

function pointDistance(a, b) {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function classifyClosestApproach(closest, epsilon) {
  if (!closest) return Object.freeze({ category: 'NO_PROBE_DATA', reason: 'no-swept-probe-data' });
  const planeGap = Math.max(0, finiteOrNull(closest.planeGapMeters) ?? Infinity);
  const radialGap = Math.max(0, finiteOrNull(closest.radialGapMeters) ?? Infinity);
  if (planeGap <= epsilon && radialGap > epsilon) {
    return Object.freeze({ category: 'OUTSIDE_SHIELD_EDGE', reason: 'blade-crossed-shield-plane-outside-disc' });
  }
  if (planeGap > epsilon && radialGap <= epsilon) {
    return Object.freeze({ category: 'MISSED_SHIELD_PLANE', reason: 'blade-missed-shield-plane-depth' });
  }
  if (planeGap > epsilon && radialGap > epsilon) {
    return Object.freeze({ category: 'MISSED_PLANE_AND_DISC', reason: 'blade-missed-shield-plane-and-disc' });
  }
  return Object.freeze({ category: 'NO_EXACT_SWEPT_CONTACT', reason: 'sampled-overlap-without-exact-swept-contact' });
}

export function buildParryWhiffDiagnostic(input = {}) {
  const epsilon = Math.max(0, finiteOrNull(input.gapEpsilonMeters) ?? PARRY_WHIFF_GAP_EPSILON_METERS);
  const closest = input.closestApproachRecord || null;
  const outsideActiveContact = input.outsideActiveContact || null;
  const classification = outsideActiveContact
    ? Object.freeze({ category: 'CONTACT_OUTSIDE_ACTIVE_WINDOW', reason: 'geometric-contact-outside-active-window' })
    : classifyClosestApproach(closest, epsilon);
  const trackingPlan = input.finePlan || null;
  const trackingSample = input.fineTracking || null;
  const requiredDistanceMeters = finiteOrNull(
    closest?.trackingRequiredDistanceMeters
      ?? trackingPlan?.requiredDistanceMeters
      ?? trackingPlan?.requiredDistance
      ?? trackingPlan?.requiredShieldTravelMeters
      ?? input.parryInput?.requiredShieldTravelMeters,
  );
  const appliedDistanceMeters = finiteOrNull(
    closest?.trackingAppliedDistanceMeters
      ?? trackingPlan?.appliedDistanceMeters
      ?? trackingPlan?.appliedDistance
      ?? trackingPlan?.appliedShieldTravelMeters
      ?? trackingSample?.appliedDistanceMeters,
  );
  const achievedDistanceMeters = finiteOrNull(
    closest?.trackingAchievedDistanceMeters
      ?? trackingSample?.achievedDistanceMeters
      ?? trackingSample?.achievedDistance
      ?? trackingSample?.correctionDistanceMeters,
  );
  const reachable = closest?.trackingReachable ?? trackingPlan?.reachable ?? null;
  const trackingClamped = reachable === false
    || (requiredDistanceMeters != null && appliedDistanceMeters != null
      && appliedDistanceMeters + 1e-6 < requiredDistanceMeters);
  const predictedPoint = freezePoint(
    input.predictiveAnalysis?.predictedContactPoint
      ?? input.predictiveAnalysis?.interceptPoint
      ?? input.predictiveAnalysis?.point,
  );
  const closestPoint = freezePoint(closest?.point ?? closest?.planePoint);

  return Object.freeze({
    stage: PARRY_WHIFF_DIAGNOSTIC_STAGE,
    accepted: false,
    category: classification.category,
    reason: classification.reason,
    sequence: input.sequence ?? null,
    direction: input.direction ?? null,
    probeFrames: Math.max(0, Math.round(finiteOrNull(input.probeFrames) ?? 0)),
    closestApproachRecord: closest,
    outsideActiveContact,
    gapEpsilonMeters: epsilon,
    tracking: Object.freeze({
      requiredDistanceMeters,
      appliedDistanceMeters,
      achievedDistanceMeters,
      reachable,
      clamped: trackingClamped,
      limitMeters: finiteOrNull(input.trackingLimitMeters) ?? 0.18,
    }),
    prediction: Object.freeze({
      geometryReason: input.predictiveAnalysis?.geometryReason ?? input.predictiveAnalysis?.reason ?? null,
      predictedPoint,
      closestPoint,
      predictedVsClosestErrorMeters: pointDistance(predictedPoint, closestPoint),
    }),
    shieldLeadMotion: input.shieldLeadMotion || null,
    authority: 'presentation-diagnostic-only-no-combat-authority',
  });
}
