import { PARRY_LUNGE_TRAVEL_BUDGET_METERS } from './parry-lunge-reach.js';

export const REACHABLE_PARRY_INTERCEPT_TARGET_STAGE = 'G4.3B.5R.3.3';

export const REACHABLE_PARRY_INTERCEPT_PROFILE = Object.freeze({
  // R19F.1: shares the lunge-reach travel budget with the rest of the parry chain.
  maxCorrectionMeters: PARRY_LUNGE_TRAVEL_BUDGET_METERS,
  comfortRadiusRatio: 0.60,
  // Aim the threat 4cm inside the rim, not 1.2cm. Measured on LEFT's
  // knee-height sweep, a 1.2cm inset spent the whole travel budget arriving
  // exactly on the rim: the exact swept test then failed by 0.5-3mm on
  // two of three attempts. Aiming at the face turns rim-grazes into hits
  // without touching the contact authority.
  contactInsetMeters: 0.04,
  maxClosestCombinedGapMeters: 0.18,
  maxClosestPlaneGapMeters: 0.08,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vec(value = {}) {
  return Object.freeze({ x: finite(value.x), y: finite(value.y), z: finite(value.z) });
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function mul(a, scalar) {
  return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar };
}

function length(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value) {
  const magnitude = length(value);
  return magnitude > 1e-9 ? mul(value, 1 / magnitude) : { x: 0, y: 0, z: 0 };
}

function requiredDistanceForPoint(point, surface, comfortRadiusRatio) {
  if (!point) return Infinity;
  const comfortRadius = surface.radius * comfortRadiusRatio;
  return Math.max(0, distance(point, surface.center) - comfortRadius);
}

function closestApproachThreat(closestApproach, surface) {
  if (!closestApproach?.planePoint || !closestApproach?.point) return null;
  return Object.freeze({
    stage: REACHABLE_PARRY_INTERCEPT_TARGET_STAGE,
    point: vec(closestApproach.planePoint),
    worldPoint: vec(closestApproach.point),
    signedDistance: finite(closestApproach.signedDistance),
    radialDistance: Math.max(0, finite(closestApproach.radialDistanceMeters)),
    outsideDisc: Math.max(0, finite(closestApproach.radialGapMeters)),
    futureSeconds: 0,
    timeAlpha: finite(closestApproach.sweepAlpha),
    bladeFraction: finite(closestApproach.bladeFraction, 0.5),
    score: Math.max(0, finite(closestApproach.combinedGapMeters)),
    surface,
    source: 'measured-current-sweep-closest-approach',
    authority: 'geometry-guidance-only-real-contact-still-required',
  });
}

function measuredContactTrackingPlan(surface, profile, threat) {
  if (!threat?.point) return null;
  const radialVector = sub(threat.point, surface.center);
  const radialDistance = length(radialVector);
  const contactInsetMeters = Math.min(
    surface.radius,
    Math.max(0, finite(profile.contactInsetMeters)),
  );
  const targetCoverageRadius = Math.max(0, surface.radius - contactInsetMeters);
  const requiredDistance = Math.max(0, radialDistance - targetCoverageRadius);
  const appliedDistance = Math.min(requiredDistance, profile.maxCorrectionMeters);
  const correction = mul(normalize(radialVector), appliedDistance);
  const reachable = requiredDistance <= profile.maxCorrectionMeters + 1e-6;
  return Object.freeze({
    stage: REACHABLE_PARRY_INTERCEPT_TARGET_STAGE,
    mode: 'parry',
    threat,
    reachable,
    contactInsetMeters,
    targetCoverageRadius,
    requiredDistance,
    appliedDistance,
    correction: vec(correction),
    targetCenter: vec(add(surface.center, correction)),
    reason: requiredDistance <= 1e-6
      ? 'measured-sweep-already-covered'
      : reachable
        ? 'measured-sweep-relative-contact-correction'
        : 'measured-sweep-relative-contact-out-of-reach',
    authority: 'surface-relative-guidance-only-real-contact-still-required',
  });
}

export function selectReachableParryInterceptTarget(input = {}) {
  const profile = Object.freeze({ ...REACHABLE_PARRY_INTERCEPT_PROFILE, ...(input.profile || {}) });
  const surface = Object.freeze({
    center: vec(input.bucklerSurface?.center),
    normal: vec(input.bucklerSurface?.normal),
    radius: Math.max(0, finite(input.bucklerSurface?.radius)),
    thickness: Math.max(0, finite(input.bucklerSurface?.thickness)),
  });
  if (!(surface.radius > 0)) throw new Error('G4.3B.5R.3.3 requires a positive shield radius');

  const predictedThreat = input.predictedThreat || null;
  const closestApproach = input.closestApproach || null;
  const measuredThreat = closestApproachThreat(closestApproach, surface);
  const measuredTrackingPlan = measuredContactTrackingPlan(surface, profile, measuredThreat);
  const predictedRequiredDistanceMeters = input.predictedTrackingPlan?.requiredDistance == null
    ? requiredDistanceForPoint(predictedThreat?.point, surface, profile.comfortRadiusRatio)
    : Math.max(0, finite(input.predictedTrackingPlan.requiredDistance));
  const measuredRequiredDistanceMeters = requiredDistanceForPoint(
    measuredThreat?.point,
    surface,
    profile.comfortRadiusRatio,
  );
  const measuredRadialContactCorrectionMeters = Math.max(
    0,
    finite(closestApproach?.radialGapMeters, Infinity),
  );
  const measuredContactCorrectionMeters = Math.hypot(
    measuredRadialContactCorrectionMeters,
    Math.max(0, finite(closestApproach?.planeGapMeters, Infinity)),
  );
  const predictedReachable = Boolean(predictedThreat)
    && predictedRequiredDistanceMeters <= profile.maxCorrectionMeters + 1e-6;
  const measuredReachable = measuredTrackingPlan?.reachable === true;
  const measuredInsideAcquisitionBand = Boolean(measuredThreat)
    && finite(closestApproach.combinedGapMeters, Infinity) <= profile.maxClosestCombinedGapMeters
    && finite(closestApproach.planeGapMeters, Infinity) <= profile.maxClosestPlaneGapMeters;
  const fallbackApplied = !predictedReachable && measuredReachable && measuredInsideAcquisitionBand;
  const threat = fallbackApplied ? measuredThreat : predictedThreat;

  return Object.freeze({
    stage: REACHABLE_PARRY_INTERCEPT_TARGET_STAGE,
    threat,
    source: fallbackApplied
      ? 'measured-current-sweep-closest-approach'
      : predictedThreat
        ? 'linear-predicted-threat'
        : 'none',
    fallbackApplied,
    predictedReachable,
    measuredReachable,
    measuredInsideAcquisitionBand,
    predictedRequiredDistanceMeters: Number.isFinite(predictedRequiredDistanceMeters)
      ? predictedRequiredDistanceMeters
      : null,
    measuredRequiredDistanceMeters: Number.isFinite(measuredRequiredDistanceMeters)
      ? measuredRequiredDistanceMeters
      : null,
    measuredRadialContactCorrectionMeters: Number.isFinite(measuredRadialContactCorrectionMeters)
      ? measuredRadialContactCorrectionMeters
      : null,
    measuredContactCorrectionMeters: Number.isFinite(measuredContactCorrectionMeters)
      ? measuredContactCorrectionMeters
      : null,
    trackingPlan: fallbackApplied
      ? measuredTrackingPlan
      : input.predictedTrackingPlan || null,
    measuredTrackingPlan,
    closestApproach,
    reason: fallbackApplied
      ? 'unreachable-linear-prediction-replaced-by-surface-relative-measured-sweep'
      : predictedThreat
        ? 'linear-prediction-kept'
        : 'no-reachable-intercept-guidance',
    maxCorrectionMeters: profile.maxCorrectionMeters,
    authority: 'guidance-only-real-swept-contact-remains-success-authority',
  });
}