import { getShieldContactCouplingProfile } from './shield-driven-contact-coupling.js';

export const ACTIVE_SHIELD_LEAD_PARRY_STAGE = 'G4.3B.5R.2.8.1';

export const ACTIVE_SHIELD_LEAD_PARRY_PROFILE = Object.freeze({
  minimumTranslationSpeedMps: 0.015,
  minimumAngularSpeedRadPerSecond: 0.35,
  authority: 'predictive-shield-lead-to-moving-contact-coupling',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function vec(input = {}) {
  return { x: finite(input.x), y: finite(input.y), z: finite(input.z) };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function length(a) {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a, fallback = { x: 0, y: 0, z: 1 }) {
  const magnitude = length(a);
  return magnitude > 1e-8
    ? { x: a.x / magnitude, y: a.y / magnitude, z: a.z / magnitude }
    : { ...fallback };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function freezeVector(a) {
  return Object.freeze({ x: a.x, y: a.y, z: a.z });
}

function resolveOutcome(value) {
  const key = String(value || 'parry').toLowerCase();
  return key === 'perfect' || key === 'perfect-parry' ? 'perfect-parry' : 'parry';
}

export function sampleActiveShieldLeadMotion(input = {}) {
  const previousSurface = input.previousSurface || {};
  const currentSurface = input.currentSurface || {};
  const previousCenter = vec(previousSurface.center);
  const currentCenter = vec(currentSurface.center);
  const deltaSeconds = Math.max(1e-5, finite(input.deltaSeconds, 1 / 60));
  const translation = sub(currentCenter, previousCenter);
  const translationMeters = length(translation);
  const translationSpeedMps = translationMeters / deltaSeconds;

  const previousNormal = normalize(vec(previousSurface.normal));
  const currentNormal = normalize(vec(currentSurface.normal));
  const normalDot = clamp(dot(previousNormal, currentNormal), -1, 1);
  const angularRadians = Math.acos(normalDot);
  const angularSpeedRadPerSecond = angularRadians / deltaSeconds;
  const angularAxis = normalize(cross(previousNormal, currentNormal), { x: 0, y: 0, z: 0 });
  const angularVelocity = {
    x: angularAxis.x * angularSpeedRadPerSecond,
    y: angularAxis.y * angularSpeedRadPerSecond,
    z: angularAxis.z * angularSpeedRadPerSecond,
  };

  const minimumTranslationSpeedMps = Math.max(
    0,
    finite(input.minimumTranslationSpeedMps, ACTIVE_SHIELD_LEAD_PARRY_PROFILE.minimumTranslationSpeedMps),
  );
  const minimumAngularSpeedRadPerSecond = Math.max(
    0,
    finite(input.minimumAngularSpeedRadPerSecond, ACTIVE_SHIELD_LEAD_PARRY_PROFILE.minimumAngularSpeedRadPerSecond),
  );
  const moving = translationSpeedMps >= minimumTranslationSpeedMps
    || angularSpeedRadPerSecond >= minimumAngularSpeedRadPerSecond;

  return Object.freeze({
    stage: ACTIVE_SHIELD_LEAD_PARRY_STAGE,
    moving,
    deltaSeconds,
    translation: freezeVector(translation),
    translationMeters,
    translationSpeedMps,
    angularRadians,
    angularAxis: freezeVector(angularAxis),
    angularVelocity: freezeVector(angularVelocity),
    angularSpeedRadPerSecond,
    authority: 'measured-pre-contact-shield-surface-motion',
  });
}

export function buildActiveShieldLeadCouplingStart(input = {}) {
  const outcome = resolveOutcome(input.outcome);
  const couplingProfile = getShieldContactCouplingProfile(outcome);
  const predictiveReport = input.predictiveReport || {};
  const predictiveHandoff = input.predictiveHandoff || {};
  const shieldLeadMotion = input.shieldLeadMotion || null;
  const predictiveProgress = clamp(finite(predictiveReport.progress), 0, 1);
  const predictiveActiveBeforeContact = Boolean(
    predictiveReport.active
    || predictiveHandoff.accepted
    || predictiveProgress > 0,
  );

  // .2.8.1 reinterprets the old post-contact HOLD as time already spent
  // actively leading the shield into contact. Coupling therefore begins in
  // DRIVE immediately, without adding a second pause after impact.
  const consumedContactHoldMs = Math.max(0, finite(couplingProfile.holdMs));
  const initialCouplingElapsedMs = consumedContactHoldMs;
  const couplingProfileOverrides = Object.freeze({ holdMs: 0 });

  return Object.freeze({
    stage: ACTIVE_SHIELD_LEAD_PARRY_STAGE,
    accepted: true,
    outcome,
    predictiveActiveBeforeContact,
    predictiveProgress,
    shieldMovingAtContact: Boolean(shieldLeadMotion?.moving),
    shieldLeadTranslationSpeedMps: finite(shieldLeadMotion?.translationSpeedMps),
    shieldLeadAngularSpeedRadPerSecond: finite(shieldLeadMotion?.angularSpeedRadPerSecond),
    consumedContactHoldMs,
    initialCouplingElapsedMs,
    couplingProfileOverrides,
    postContactHoldMs: 0,
    b3ClockPolicy: 'frozen-until-shield-coupling-complete',
    authority: ACTIVE_SHIELD_LEAD_PARRY_PROFILE.authority,
  });
}
