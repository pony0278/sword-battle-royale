import { PARRY_LUNGE_TRAVEL_BUDGET_METERS } from './parry-lunge-reach.js';

export const ACTIVE_PARRY_INTERCEPT_INTENT_STAGE = 'R18N.1';

export const ACTIVE_PARRY_INTERCEPT_INTENT_PROFILE = Object.freeze({
  minimumLeadMeters: 0.09,
  // R19F.1: the latched lead shares the lunge-reach travel budget - the F-press aims at a blade
  // whose path the attack advance moved, so the lead has the same journey to cover.
  maximumLeadMeters: PARRY_LUNGE_TRAVEL_BUDGET_METERS,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vec(value = {}) {
  return Object.freeze({ x: finite(value.x), y: finite(value.y), z: finite(value.z) });
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
  return magnitude > 1e-9 ? mul(value, 1 / magnitude) : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

export function createActiveParryInterceptIntent(overrides = {}) {
  const profile = Object.freeze({ ...ACTIVE_PARRY_INTERCEPT_INTENT_PROFILE, ...overrides });
  let active = null;
  let lastReport = null;

  function reset() {
    active = null;
    lastReport = null;
  }

  function arm(input = {}) {
    const direction = String(input.direction || '').toLowerCase();
    if (direction !== 'top' && direction !== 'right') {
      reset();
      return Object.freeze({ accepted: false, reason: 'direction-deferred', direction });
    }

    const surfaceCenter = vec(input.bucklerSurface?.center);
    const threat = input.predictiveAnalysis?.threat || null;
    const threatPoint = threat?.point || threat?.worldPoint || null;
    const leadDirection = threatPoint ? normalize(sub(vec(threatPoint), surfaceCenter)) : null;
    if (!leadDirection) {
      reset();
      return Object.freeze({ accepted: false, reason: 'missing-stable-lead-direction', direction });
    }

    const rawRequiredDistanceMeters = Math.max(
      0,
      finite(input.predictiveAnalysis?.trackingPlan?.requiredDistance),
    );
    const leadMeters = clamp(
      rawRequiredDistanceMeters,
      profile.minimumLeadMeters,
      profile.maximumLeadMeters,
    );
    const initialCorrection = vec(mul(leadDirection, leadMeters));
    const targetCenter = vec(add(surfaceCenter, initialCorrection));

    active = Object.freeze({
      stage: ACTIVE_PARRY_INTERCEPT_INTENT_STAGE,
      sequence: finite(input.sequence),
      direction,
      source: 'manual-f-latched-world-target',
      originCenter: surfaceCenter,
      targetCenter,
      leadDirection: vec(leadDirection),
      rawRequiredDistanceMeters,
      leadMeters,
      authority: 'bounded-guidance-only-real-swept-contact-still-required',
    });
    lastReport = active;
    return Object.freeze({ accepted: true, intent: active });
  }

  function plan(input = {}) {
    if (!active || finite(input.sequence, -1) !== active.sequence) return null;
    const surfaceCenter = vec(input.bucklerSurface?.center);
    const correction = vec(sub(active.targetCenter, surfaceCenter));
    const requiredDistance = length(correction);
    lastReport = Object.freeze({
      ...active,
      currentCenter: surfaceCenter,
      correction,
      remainingDistanceMeters: requiredDistance,
      stableAcrossFrames: true,
    });
    return Object.freeze({
      stage: ACTIVE_PARRY_INTERCEPT_INTENT_STAGE,
      mode: 'parry',
      threat: null,
      reachable: requiredDistance <= profile.maximumLeadMeters + 1e-6,
      requiredDistance,
      appliedDistance: requiredDistance,
      correction,
      targetCenter: active.targetCenter,
      reason: 'latched-active-shield-intercept',
      authority: 'bounded-guidance-only-real-swept-contact-still-required',
    });
  }

  return Object.freeze({
    arm,
    plan,
    reset,
    get active() { return Boolean(active); },
    get report() { return lastReport; },
  });
}
