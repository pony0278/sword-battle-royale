export const DIRECTIONAL_RECOIL_PLANNER_STAGE = 'G4.3B.2';

export const RECOIL_RESPONSE_CLASSES = Object.freeze({
  BLOCK: 'blocked-weapon-bounce',
  PARRY: 'parry-directional-recoil',
  PERFECT_PARRY: 'perfect-parry-directional-recoil',
});

export const DIRECTIONAL_RECOIL_PROFILES = Object.freeze({
  [RECOIL_RESPONSE_CLASSES.BLOCK]: Object.freeze({
    grade: 'block',
    baseStrength: 0.42,
    redirectBlend: 0.24,
    verticalLift: 0.12,
    bodyStrength: 0.30,
    weaponDeflectDegrees: 22,
    bodyYawDegrees: 7,
    bodyPitchDegrees: 7,
    settleClass: 'short-bounce',
  }),
  [RECOIL_RESPONSE_CLASSES.PARRY]: Object.freeze({
    grade: 'parry',
    baseStrength: 0.68,
    redirectBlend: 0.48,
    verticalLift: 0.16,
    bodyStrength: 0.38,
    weaponDeflectDegrees: 30,
    bodyYawDegrees: 10,
    bodyPitchDegrees: 11,
    settleClass: 'stagger-recoil',
  }),
  [RECOIL_RESPONSE_CLASSES.PERFECT_PARRY]: Object.freeze({
    grade: 'perfect-parry',
    baseStrength: 1,
    redirectBlend: 0.68,
    verticalLift: 0.24,
    bodyStrength: 0.56,
    weaponDeflectDegrees: 44,
    bodyYawDegrees: 15,
    bodyPitchDegrees: 15,
    settleClass: 'strong-stagger-recoil',
  }),
});

const WORLD_UP = Object.freeze({ x: 0, y: 1, z: 0 });
const EPSILON = 1e-8;

function finite(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function vec(input = {}) {
  return Object.freeze({
    x: finite(input?.x, 0),
    y: finite(input?.y, 0),
    z: finite(input?.z, 0),
  });
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v, scalar) {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

function length(v) {
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(v) {
  const magnitude = length(v);
  if (magnitude <= EPSILON) return Object.freeze({ x: 0, y: 0, z: 0 });
  return Object.freeze({ x: v.x / magnitude, y: v.y / magnitude, z: v.z / magnitude });
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function horizontal(v) {
  return { x: v.x, y: 0, z: v.z };
}

function normalizeAttackDirection(value) {
  const direction = String(value || '').toLowerCase();
  return ['top', 'left', 'right'].includes(direction) ? direction : null;
}

function responseProfile(responseClass, overrides = {}) {
  const base = DIRECTIONAL_RECOIL_PROFILES[responseClass] || null;
  if (!base) return null;
  const profileOverrides = overrides.profile || overrides;
  return Object.freeze({
    ...base,
    ...profileOverrides,
    baseStrength: clamp(profileOverrides.baseStrength ?? base.baseStrength, 0, 1.5),
    redirectBlend: clamp(profileOverrides.redirectBlend ?? base.redirectBlend, 0, 1),
    verticalLift: clamp(profileOverrides.verticalLift ?? base.verticalLift, 0, 1),
    bodyStrength: clamp(profileOverrides.bodyStrength ?? base.bodyStrength, 0, 1.5),
    weaponDeflectDegrees: clamp(profileOverrides.weaponDeflectDegrees ?? base.weaponDeflectDegrees, 0, 90),
    bodyYawDegrees: clamp(profileOverrides.bodyYawDegrees ?? base.bodyYawDegrees, 0, 45),
    bodyPitchDegrees: clamp(profileOverrides.bodyPitchDegrees ?? base.bodyPitchDegrees, 0, 35),
  });
}

function lateralSignFor(direction, contactPoint, incomingDirection) {
  if (direction === 'left') return 1;
  if (direction === 'right') return -1;
  if (Math.abs(contactPoint.x) > 0.015) return Math.sign(contactPoint.x);
  if (Math.abs(incomingDirection.x) > 0.05) return -Math.sign(incomingDirection.x);
  return 1;
}

function resolveLateralTangent(incomingDirection, lateralSign) {
  let tangent = normalize(cross(WORLD_UP, incomingDirection));
  if (length(tangent) <= EPSILON) tangent = Object.freeze({ x: 1, y: 0, z: 0 });
  return normalize(scale(tangent, lateralSign));
}

function extractInterruption(input = {}) {
  if (input.interruption) return input.interruption;
  if (input.snapshot?.interruption) return input.snapshot.interruption;
  return input;
}

function emptyPlan(reason, context = {}) {
  return Object.freeze({
    stage: DIRECTIONAL_RECOIL_PLANNER_STAGE,
    planned: false,
    reason,
    sequence: context.sequence ?? null,
    attackDirection: context.attackDirection ?? null,
    responseClass: context.responseClass ?? null,
    authority: 'deterministic-recoil-planning-only',
  });
}

export function planDirectionalRecoil(input = {}, overrides = {}) {
  const interruption = extractInterruption(input);
  const responseClass = String(interruption?.responseClass || input.responseClass || '');
  const profile = responseProfile(responseClass, overrides);
  const attackDirection = normalizeAttackDirection(interruption?.direction || input.attackDirection);
  const sequence = finite(interruption?.sequence ?? interruption?.attackSequence ?? input.attackSequence, null);
  const contactPoint = vec(interruption?.contactPoint || input.contactPoint);
  const incomingVelocity = vec(interruption?.incomingVelocity || input.incomingVelocity);
  const measuredSpeed = length(incomingVelocity);
  const suppliedDirection = normalize(vec(interruption?.incomingDirection || input.incomingDirection));
  const incomingDirection = measuredSpeed > EPSILON ? normalize(incomingVelocity) : suppliedDirection;
  const context = { sequence, attackDirection, responseClass };

  if (!profile) return emptyPlan('unsupported-response-class', context);
  if (!attackDirection) return emptyPlan('unknown-attack-direction', context);
  if (length(incomingDirection) <= EPSILON) return emptyPlan('missing-incoming-direction', context);

  const speedReference = Math.max(0.1, finite(overrides.speedReference, 6));
  const speedFactor = clamp(measuredSpeed > EPSILON ? measuredSpeed / speedReference : 1, 0.45, 1.25);
  const strength = clamp(profile.baseStrength * speedFactor, 0, 1.5);
  const lateralSign = lateralSignFor(attackDirection, contactPoint, incomingDirection);
  const opposedIncoming = normalize(scale(incomingDirection, -1));
  const lateralTangent = resolveLateralTangent(incomingDirection, lateralSign);
  const topLiftScale = attackDirection === 'top' ? 1.35 : 1;
  const redirect = scale(lateralTangent, profile.redirectBlend);
  const retained = scale(opposedIncoming, 1 - profile.redirectBlend * 0.45);
  const lifted = scale(WORLD_UP, profile.verticalLift * topLiftScale);
  const weaponDirection = normalize(add(add(retained, redirect), lifted));

  const horizontalOpposition = normalize(horizontal(opposedIncoming));
  const fallbackBodyBack = normalize({ x: 0, y: 0, z: opposedIncoming.z || 1 });
  const bodyBase = length(horizontalOpposition) > EPSILON ? horizontalOpposition : fallbackBodyBack;
  const bodyLateral = scale(lateralTangent, profile.redirectBlend * 0.22);
  const bodyDirection = normalize(add(bodyBase, bodyLateral));

  const sideFactor = attackDirection === 'top' ? lateralSign * 0.35 : lateralSign;
  const verticalIncoming = Math.abs(incomingDirection.y);
  const bodyYawDegrees = profile.bodyYawDegrees * sideFactor * speedFactor;
  const bodyPitchDegrees = -profile.bodyPitchDegrees * (0.55 + verticalIncoming * 0.45) * speedFactor;
  const bodyRollDegrees = profile.bodyYawDegrees * 0.28 * sideFactor * speedFactor;
  const weaponDeflectDegrees = profile.weaponDeflectDegrees * speedFactor;

  return Object.freeze({
    stage: DIRECTIONAL_RECOIL_PLANNER_STAGE,
    planned: true,
    reason: 'directional-recoil-planned',
    sequence,
    attackDirection,
    responseClass,
    grade: profile.grade,
    sourceTimeSeconds: finite(interruption?.sourceTimeSeconds ?? input.sourceTimeSeconds, null),
    sourceClipId: interruption?.clipId || input.clipId || null,
    sourcePhase: interruption?.phaseAtInterrupt || input.phaseAtInterrupt || null,
    contact: Object.freeze({
      point: contactPoint,
      incomingVelocity,
      incomingDirection,
      speed: measuredSpeed,
      speedFactor,
    }),
    weapon: Object.freeze({
      direction: weaponDirection,
      lateralTangent,
      lateralSign,
      strength,
      deflectDegrees: weaponDeflectDegrees,
      redirectBlend: profile.redirectBlend,
      verticalLift: profile.verticalLift * topLiftScale,
    }),
    body: Object.freeze({
      direction: bodyDirection,
      strength: profile.bodyStrength * speedFactor,
      yawDegrees: bodyYawDegrees,
      pitchDegrees: bodyPitchDegrees,
      rollDegrees: bodyRollDegrees,
    }),
    recovery: Object.freeze({
      settleClass: profile.settleClass,
      preserveFrozenContactPose: true,
      handoffTarget: 'G4.3B.3-attacker-recoil-presentation',
    }),
    profile,
    authority: 'deterministic-recoil-planning-only',
  });
}

export function createDirectionalRecoilPlanner(options = {}) {
  let lastPlan = null;
  return Object.freeze({
    plan(input = {}, overrides = {}) {
      const result = planDirectionalRecoil(input, { ...options, ...overrides });
      if (result.planned) lastPlan = result;
      return result;
    },
    get lastPlan() { return lastPlan; },
    reset() { lastPlan = null; },
  });
}
