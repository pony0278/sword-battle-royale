export const PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE = 'G4.3B.5R.2.9.2';

export const PHYSICAL_GRIP_WRIST_COMPLIANCE_DEFAULTS = Object.freeze({
  swordMassKg: 1.35,
  swordInertiaKgM2: 0.124,
  handEffectiveMassKg: 2.6,
  handWristInertiaKgM2: 0.055,
  gripStiffnessNPerMeter: 1450,
  gripDampingNsPerMeter: 72,
  maximumGripImpulseNs: 0.95,
  forearmStiffnessNPerMeter: 520,
  forearmDampingNsPerMeter: 42,
  maximumForearmImpulseNs: 0.48,
  wristStiffnessNmPerRad: 24,
  wristDampingNmsPerRad: 2.8,
  maximumWristAngularImpulseNms: 0.085,
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function vec(input = {}) {
  return { x: finite(input.x), y: finite(input.y), z: finite(input.z) };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mul(a, scalar) {
  return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(a) {
  return Math.hypot(a.x, a.y, a.z);
}

function clampMagnitude(value, maximum) {
  const limit = Math.max(0, finite(maximum));
  const magnitude = length(value);
  if (!(magnitude > limit) || magnitude < 1e-12) return value;
  return mul(value, limit / magnitude);
}

function freezeVector(value) {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

export function computeSwordGripPointVelocity(input = {}) {
  const linearVelocity = vec(input.swordLinearVelocity);
  const angularVelocity = vec(input.swordAngularVelocity);
  const radius = sub(vec(input.gripPoint), vec(input.swordCenter));
  return freezeVector(add(linearVelocity, cross(angularVelocity, radius)));
}

export function solveCompliantGripPointImpulse(input = {}) {
  const defaults = PHYSICAL_GRIP_WRIST_COMPLIANCE_DEFAULTS;
  const dt = Math.max(1e-6, finite(input.deltaSeconds, 1 / 240));
  const swordMassKg = Math.max(0.05, finite(input.swordMassKg, defaults.swordMassKg));
  const swordInertiaKgM2 = Math.max(1e-4, finite(input.swordInertiaKgM2, defaults.swordInertiaKgM2));
  const handMassKg = Math.max(0.05, finite(input.handEffectiveMassKg, defaults.handEffectiveMassKg));
  const stiffness = Math.max(0, finite(input.gripStiffnessNPerMeter, defaults.gripStiffnessNPerMeter));
  const damping = Math.max(0, finite(input.gripDampingNsPerMeter, defaults.gripDampingNsPerMeter));
  const maximumImpulseNs = Math.max(0, finite(input.maximumGripImpulseNs, defaults.maximumGripImpulseNs));

  const swordCenter = vec(input.swordCenter);
  const gripPoint = vec(input.gripPoint);
  const handPoint = vec(input.handPoint);
  const swordLinearVelocity = vec(input.swordLinearVelocity);
  const swordAngularVelocity = vec(input.swordAngularVelocity);
  const handLinearVelocity = vec(input.handLinearVelocity);
  const radius = sub(gripPoint, swordCenter);
  const swordGripVelocity = add(swordLinearVelocity, cross(swordAngularVelocity, radius));

  // Positive error means the sword grip should be pulled toward the hand.
  const positionError = sub(handPoint, gripPoint);
  const relativeVelocity = sub(handLinearVelocity, swordGripVelocity);
  const springForce = mul(positionError, stiffness);
  const dampingForce = mul(relativeVelocity, damping);
  const requestedImpulse = mul(add(springForce, dampingForce), dt);
  const impulseOnSword = clampMagnitude(requestedImpulse, maximumImpulseNs);
  const impulseOnHand = mul(impulseOnSword, -1);

  const deltaSwordLinearVelocity = mul(impulseOnSword, 1 / swordMassKg);
  const deltaSwordAngularVelocity = mul(cross(radius, impulseOnSword), 1 / swordInertiaKgM2);
  const deltaHandLinearVelocity = mul(impulseOnHand, 1 / handMassKg);

  return Object.freeze({
    stage: PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE,
    applied: length(impulseOnSword) > 1e-10,
    gripPoint: freezeVector(gripPoint),
    handPoint: freezeVector(handPoint),
    positionError: freezeVector(positionError),
    positionErrorMeters: length(positionError),
    relativeVelocity: freezeVector(relativeVelocity),
    swordGripVelocity: freezeVector(swordGripVelocity),
    impulseOnSword: freezeVector(impulseOnSword),
    impulseOnHand: freezeVector(impulseOnHand),
    impulseMagnitudeNs: length(impulseOnSword),
    deltaSwordLinearVelocity: freezeVector(deltaSwordLinearVelocity),
    deltaSwordAngularVelocity: freezeVector(deltaSwordAngularVelocity),
    deltaHandLinearVelocity: freezeVector(deltaHandLinearVelocity),
    nextSwordLinearVelocity: freezeVector(add(swordLinearVelocity, deltaSwordLinearVelocity)),
    nextSwordAngularVelocity: freezeVector(add(swordAngularVelocity, deltaSwordAngularVelocity)),
    nextHandLinearVelocity: freezeVector(add(handLinearVelocity, deltaHandLinearVelocity)),
    authority: 'physical-grip-point-spring-damper-impulse',
  });
}

export function solveForearmAnchorImpulse(input = {}) {
  const defaults = PHYSICAL_GRIP_WRIST_COMPLIANCE_DEFAULTS;
  const dt = Math.max(1e-6, finite(input.deltaSeconds, 1 / 240));
  const handMassKg = Math.max(0.05, finite(input.handEffectiveMassKg, defaults.handEffectiveMassKg));
  const stiffness = Math.max(0, finite(input.forearmStiffnessNPerMeter, defaults.forearmStiffnessNPerMeter));
  const damping = Math.max(0, finite(input.forearmDampingNsPerMeter, defaults.forearmDampingNsPerMeter));
  const maximumImpulseNs = Math.max(0, finite(input.maximumForearmImpulseNs, defaults.maximumForearmImpulseNs));
  const handPoint = vec(input.handPoint);
  const restHandPoint = vec(input.restHandPoint);
  const handLinearVelocity = vec(input.handLinearVelocity);
  const anchorVelocity = vec(input.anchorVelocity);
  const positionError = sub(restHandPoint, handPoint);
  const relativeVelocity = sub(anchorVelocity, handLinearVelocity);
  const requestedImpulse = mul(add(mul(positionError, stiffness), mul(relativeVelocity, damping)), dt);
  const impulseOnHand = clampMagnitude(requestedImpulse, maximumImpulseNs);
  const deltaHandLinearVelocity = mul(impulseOnHand, 1 / handMassKg);

  return Object.freeze({
    stage: PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE,
    applied: length(impulseOnHand) > 1e-10,
    positionError: freezeVector(positionError),
    positionErrorMeters: length(positionError),
    impulseOnHand: freezeVector(impulseOnHand),
    impulseMagnitudeNs: length(impulseOnHand),
    deltaHandLinearVelocity: freezeVector(deltaHandLinearVelocity),
    nextHandLinearVelocity: freezeVector(add(handLinearVelocity, deltaHandLinearVelocity)),
    authority: 'forearm-anchor-spring-damper-impulse',
  });
}

export function solveWristAngularComplianceImpulse(input = {}) {
  const defaults = PHYSICAL_GRIP_WRIST_COMPLIANCE_DEFAULTS;
  const dt = Math.max(1e-6, finite(input.deltaSeconds, 1 / 240));
  const swordInertia = Math.max(1e-4, finite(input.swordInertiaKgM2, defaults.swordInertiaKgM2));
  const handInertia = Math.max(1e-4, finite(input.handWristInertiaKgM2, defaults.handWristInertiaKgM2));
  const stiffness = Math.max(0, finite(input.wristStiffnessNmPerRad, defaults.wristStiffnessNmPerRad));
  const damping = Math.max(0, finite(input.wristDampingNmsPerRad, defaults.wristDampingNmsPerRad));
  const maximumAngularImpulse = Math.max(0, finite(input.maximumWristAngularImpulseNms, defaults.maximumWristAngularImpulseNms));
  const rotationErrorVector = vec(input.rotationErrorVector);
  const swordAngularVelocity = vec(input.swordAngularVelocity);
  const handAngularVelocity = vec(input.handAngularVelocity);
  const relativeAngularVelocity = sub(handAngularVelocity, swordAngularVelocity);
  const requestedAngularImpulse = mul(
    add(mul(rotationErrorVector, stiffness), mul(relativeAngularVelocity, damping)),
    dt,
  );
  const angularImpulseOnSword = clampMagnitude(requestedAngularImpulse, maximumAngularImpulse);
  const angularImpulseOnHand = mul(angularImpulseOnSword, -1);
  const deltaSwordAngularVelocity = mul(angularImpulseOnSword, 1 / swordInertia);
  const deltaHandAngularVelocity = mul(angularImpulseOnHand, 1 / handInertia);

  return Object.freeze({
    stage: PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE,
    applied: length(angularImpulseOnSword) > 1e-10,
    rotationErrorVector: freezeVector(rotationErrorVector),
    rotationErrorRadians: length(rotationErrorVector),
    relativeAngularVelocity: freezeVector(relativeAngularVelocity),
    angularImpulseOnSword: freezeVector(angularImpulseOnSword),
    angularImpulseOnHand: freezeVector(angularImpulseOnHand),
    angularImpulseMagnitudeNms: length(angularImpulseOnSword),
    deltaSwordAngularVelocity: freezeVector(deltaSwordAngularVelocity),
    deltaHandAngularVelocity: freezeVector(deltaHandAngularVelocity),
    nextSwordAngularVelocity: freezeVector(add(swordAngularVelocity, deltaSwordAngularVelocity)),
    nextHandAngularVelocity: freezeVector(add(handAngularVelocity, deltaHandAngularVelocity)),
    authority: 'wrist-angular-spring-damper-impulse',
  });
}

export function summarizeGripEnergyHandoff(input = {}) {
  const bladeImpulseNs = Math.max(0, finite(input.bladeImpulseNs));
  const accumulatedGripImpulseNs = Math.max(0, finite(input.accumulatedGripImpulseNs));
  const accumulatedForearmImpulseNs = Math.max(0, finite(input.accumulatedForearmImpulseNs));
  const gripTransferRatio = bladeImpulseNs > 1e-8 ? accumulatedGripImpulseNs / bladeImpulseNs : 0;
  const forearmTransferRatio = bladeImpulseNs > 1e-8 ? accumulatedForearmImpulseNs / bladeImpulseNs : 0;
  return Object.freeze({
    stage: PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE,
    bladeImpulseNs,
    accumulatedGripImpulseNs,
    accumulatedForearmImpulseNs,
    gripTransferRatio,
    forearmTransferRatio,
    authority: 'physical-contact-energy-handoff-telemetry',
  });
}
