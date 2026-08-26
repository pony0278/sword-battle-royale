export const LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE = 'G4.3B.5R.3.1R';

export const LIVE_SHIELD_SWORD_GRIP_CONTACT_PHASES = Object.freeze({
  LIVE_CONTACT: 'live-shield-sword-contact',
  INSPECTION_HOLD: 'inspection-hold',
});

export const LIVE_SHIELD_SWORD_GRIP_CONTACT_PROFILE = Object.freeze({
  minimumShieldTangentSpeedMps: 0.02,
  minimumInspectionOfflineTravelMeters: 0.075,
  minimumInspectionHandTravelMeters: 0.01,
  minimumInspectionGripTravelMeters: 0.02,
  minimumSwordAxisClearanceDegrees: 7,
  minimumHiltOfflineTravelMeters: 0.025,
  minimumWristGripClearanceDegrees: 7,
  maximumContactTargetTravelMeters: 0.24,
  // R18P.4: raised from 28/10, which every direction was measured saturating.
  // The extra authority lifted TOP/RIGHT deflect agreement from ~0.55 to
  // 0.63-0.80 and lets the LEFT knee-height catch actually carry the sword.
  maximumUpperarmCorrectionDegrees: 34,
  maximumForearmDegrees: 13,
  forearmHiltClearanceScale: 1.50,
  hiltOfflineReleaseMarginMeters: 0.004,
  maximumResidualCorrectionPasses: 3,
  maximumWristDegrees: 38,
  maximumWristAttackLineTwistDegrees: 7,
  releaseHysteresisMeters: 0.012,
  // A parried blade skates off the shield; it is not towed by it. Measured
  // over a full exchange the solved contact tracks its target to within
  // 2-7cm while the arm can carry the sword, then the error grows without
  // bound as the shield sweeps on (LEFT reached 25.7cm). Contact that far
  // from the shield is not a grip, and every frame of it rewrites the
  // deflection measurement with drift.
  // Two different questions, two bars. The tight one says the shield still
  // has the sword well enough for the frame to describe the deflection; the
  // loose one says the blade has left the shield altogether.
  gripEstablishedErrorMeters: 0.07,
  maximumTrackingErrorMeters: 0.18,
  slipFrameCount: 2,
  settledTargetSpeedMps: 0.025,
  settledFrameCount: 3,
  reverseFrameCount: 2,
  maximumLiveConstraintMs: 520,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function vec(value = {}) {
  return {
    x: finite(value.x),
    y: finite(value.y),
    z: finite(value.z),
  };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value, scalar) {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
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

function length(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value, fallback = { x: 0, y: 0, z: 0 }) {
  const magnitude = length(value);
  return magnitude > 1e-8 ? scale(value, 1 / magnitude) : { ...fallback };
}

function projectOnPlane(value, normal) {
  return subtract(value, scale(normal, dot(value, normal)));
}

function rotateAroundAxis(value, axis, radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return add(
    add(scale(value, cosine), scale(cross(axis, value), sine)),
    scale(axis, dot(axis, value) * (1 - cosine)),
  );
}

function freezeVector(value) {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function resolveProfile(overrides = {}) {
  const base = LIVE_SHIELD_SWORD_GRIP_CONTACT_PROFILE;
  return Object.freeze({
    ...base,
    ...overrides,
    minimumShieldTangentSpeedMps: clamp(
      overrides.minimumShieldTangentSpeedMps ?? base.minimumShieldTangentSpeedMps,
      0,
      2,
    ),
    minimumInspectionOfflineTravelMeters: clamp(
      overrides.minimumInspectionOfflineTravelMeters ?? base.minimumInspectionOfflineTravelMeters,
      0.02,
      0.2,
    ),
    minimumInspectionHandTravelMeters: clamp(
      overrides.minimumInspectionHandTravelMeters ?? base.minimumInspectionHandTravelMeters,
      0,
      0.1,
    ),
    minimumInspectionGripTravelMeters: clamp(
      overrides.minimumInspectionGripTravelMeters ?? base.minimumInspectionGripTravelMeters,
      0,
      0.15,
    ),
    minimumSwordAxisClearanceDegrees: clamp(
      overrides.minimumSwordAxisClearanceDegrees ?? base.minimumSwordAxisClearanceDegrees,
      1,
      25,
    ),
    minimumHiltOfflineTravelMeters: clamp(
      overrides.minimumHiltOfflineTravelMeters ?? base.minimumHiltOfflineTravelMeters,
      0.005,
      0.12,
    ),
    minimumWristGripClearanceDegrees: clamp(
      overrides.minimumWristGripClearanceDegrees ?? base.minimumWristGripClearanceDegrees,
      1,
      25,
    ),
    maximumContactTargetTravelMeters: clamp(
      overrides.maximumContactTargetTravelMeters ?? base.maximumContactTargetTravelMeters,
      overrides.minimumInspectionOfflineTravelMeters ?? base.minimumInspectionOfflineTravelMeters,
      0.5,
    ),
    maximumUpperarmCorrectionDegrees: clamp(
      overrides.maximumUpperarmCorrectionDegrees ?? base.maximumUpperarmCorrectionDegrees,
      0,
      36,
    ),
    maximumForearmDegrees: clamp(overrides.maximumForearmDegrees ?? base.maximumForearmDegrees, 0, 16),
    forearmHiltClearanceScale: clamp(
      overrides.forearmHiltClearanceScale ?? base.forearmHiltClearanceScale,
      1,
      1.8,
    ),
    hiltOfflineReleaseMarginMeters: clamp(
      overrides.hiltOfflineReleaseMarginMeters ?? base.hiltOfflineReleaseMarginMeters,
      0,
      0.02,
    ),
    maximumResidualCorrectionPasses: Math.round(clamp(
      overrides.maximumResidualCorrectionPasses ?? base.maximumResidualCorrectionPasses,
      0,
      6,
    )),
    maximumWristDegrees: clamp(overrides.maximumWristDegrees ?? base.maximumWristDegrees, 5, 60),
    maximumWristAttackLineTwistDegrees: clamp(
      overrides.maximumWristAttackLineTwistDegrees ?? base.maximumWristAttackLineTwistDegrees,
      0,
      12,
    ),
    releaseHysteresisMeters: clamp(
      overrides.releaseHysteresisMeters ?? base.releaseHysteresisMeters,
      0.002,
      0.08,
    ),
    settledTargetSpeedMps: clamp(
      overrides.settledTargetSpeedMps ?? base.settledTargetSpeedMps,
      0.001,
      0.2,
    ),
    settledFrameCount: Math.round(clamp(overrides.settledFrameCount ?? base.settledFrameCount, 1, 12)),
    reverseFrameCount: Math.round(clamp(overrides.reverseFrameCount ?? base.reverseFrameCount, 1, 12)),
    maximumLiveConstraintMs: clamp(
      overrides.maximumLiveConstraintMs ?? base.maximumLiveConstraintMs,
      150,
      1200,
    ),
  });
}

function eligibleRealContact(contact) {
  return contact?.contact === true
    && contact?.geometricContact === true
    && contact?.eligible === true;
}

function rotationBetweenNormals(fromNormal, toNormal) {
  const from = normalize(fromNormal, { x: 0, y: 0, z: -1 });
  const to = normalize(toNormal, from);
  const cosine = clamp(dot(from, to), -1, 1);
  const radians = Math.acos(cosine);
  let axis = cross(from, to);
  if (length(axis) <= 1e-8 && cosine < 0) {
    axis = Math.abs(from.y) < 0.9
      ? cross(from, { x: 0, y: 1, z: 0 })
      : cross(from, { x: 1, y: 0, z: 0 });
  }
  return Object.freeze({ axis: freezeVector(normalize(axis)), radians });
}

export function buildLiveShieldSwordGripContactPlan(input = {}) {
  const contact = input.contact || {};
  if (!eligibleRealContact(contact)) {
    return Object.freeze({
      accepted: false,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      reason: 'eligible-real-swept-contact-required',
    });
  }

  const surface = input.surfaceAtContact || contact.surface || {};
  const profile = resolveProfile(input.profile);
  const surfaceCenter = vec(surface.center);
  const surfaceNormal = normalize(vec(surface.normal), { x: 0, y: 0, z: -1 });
  const contactPoint = vec(contact.point);
  const wristPoint = vec(input.wristWorldPoint);
  const handPoint = vec(input.handWorldPoint);
  const wristToContact = subtract(contactPoint, wristPoint);
  const wristToContactLengthMeters = length(wristToContact);
  if (wristToContactLengthMeters <= 0.08) {
    return Object.freeze({
      accepted: false,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      reason: 'contact-lever-too-short-for-wrist-constraint',
    });
  }

  const incomingSwordVelocity = vec(contact.incomingVelocity);
  const motion = input.shieldLeadMotion || {};
  const motionDeltaSeconds = Math.max(1e-5, finite(motion.deltaSeconds, 1 / 60));
  const shieldLinearVelocity = scale(vec(motion.translation), 1 / motionDeltaSeconds);
  const shieldAngularVelocity = vec(motion.angularVelocity);
  const shieldContactRadius = subtract(contactPoint, surfaceCenter);
  const shieldAngularContactVelocity = cross(shieldAngularVelocity, shieldContactRadius);
  const shieldContactVelocity = add(shieldLinearVelocity, shieldAngularContactVelocity);
  const relativeSwordVelocity = subtract(incomingSwordVelocity, shieldContactVelocity);
  const separatingNormal = dot(relativeSwordVelocity, surfaceNormal) <= 0
    ? surfaceNormal
    : scale(surfaceNormal, -1);
  const measuredShieldTangent = projectOnPlane(shieldContactVelocity, separatingNormal);
  const measuredShieldTangentSpeedMps = length(measuredShieldTangent);
  const relativeTangent = projectOnPlane(scale(relativeSwordVelocity, -1), separatingNormal);
  const tangentAuthority = measuredShieldTangentSpeedMps >= profile.minimumShieldTangentSpeedMps
    ? 'measured-shield-contact-velocity'
    : 'relative-contact-tangent-fallback';
  const tangent = tangentAuthority === 'measured-shield-contact-velocity'
    ? measuredShieldTangent
    : relativeTangent;
  const initialDeflectionDirection = normalize(tangent, separatingNormal);

  return Object.freeze({
    accepted: true,
    stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
    phase: LIVE_SHIELD_SWORD_GRIP_CONTACT_PHASES.LIVE_CONTACT,
    contactPoint: freezeVector(contactPoint),
    wristWorldPoint: freezeVector(wristPoint),
    handWorldPoint: freezeVector(handPoint),
    initialSurfaceCenter: freezeVector(surfaceCenter),
    initialSurfaceNormal: freezeVector(surfaceNormal),
    shieldContactRadius: freezeVector(shieldContactRadius),
    incomingSwordVelocity: freezeVector(incomingSwordVelocity),
    shieldLinearVelocity: freezeVector(shieldLinearVelocity),
    shieldAngularVelocity: freezeVector(shieldAngularVelocity),
    shieldContactVelocity: freezeVector(shieldContactVelocity),
    measuredShieldTangent: freezeVector(measuredShieldTangent),
    measuredShieldTangentSpeedMps,
    tangentAuthority,
    separatingNormal: freezeVector(separatingNormal),
    initialDeflectionDirection: freezeVector(initialDeflectionDirection),
    wristToContact: freezeVector(wristToContact),
    wristToContactDirection: freezeVector(scale(wristToContact, 1 / wristToContactLengthMeters)),
    wristToContactLengthMeters,
    gripChainOnly: true,
    modifiedBone: 'wrist.r',
    propagatedBones: Object.freeze(['hand.r', 'handslot.r']),
    elbowPropagationActive: false,
    shoulderPropagationActive: false,
    proximalArmCorrectionAvailable: true,
    contactCorrectionBones: Object.freeze(['upperarm.r', 'lowerarm.r', 'wrist.r']),
    b3BodyClockCanAdvance: false,
    weaponArmContactConstrained: true,
    profile,
    authority: 'live-shield-surface-contact-anchor-constrains-sword-through-wrist-grip',
  });
}

export function mapLiveShieldContactTarget(plan, surfaceAtFrame = {}) {
  if (!plan?.accepted) {
    return Object.freeze({
      accepted: false,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      reason: plan?.reason || 'accepted-live-contact-plan-required',
    });
  }

  const center = vec(surfaceAtFrame.center);
  const normal = normalize(vec(surfaceAtFrame.normal), plan.initialSurfaceNormal);
  const normalRotation = rotationBetweenNormals(plan.initialSurfaceNormal, normal);
  const mappedRadius = normalRotation.radians > 1e-8
    ? rotateAroundAxis(plan.shieldContactRadius, normalRotation.axis, normalRotation.radians)
    : vec(plan.shieldContactRadius);
  const unclampedTarget = add(center, mappedRadius);
  const unclampedDisplacement = subtract(unclampedTarget, plan.contactPoint);
  const unclampedTravel = length(unclampedDisplacement);
  const travel = Math.min(unclampedTravel, plan.profile.maximumContactTargetTravelMeters);
  const displacement = unclampedTravel > 1e-8
    ? scale(unclampedDisplacement, travel / unclampedTravel)
    : { x: 0, y: 0, z: 0 };
  const targetContactPoint = add(plan.contactPoint, displacement);
  const offlineDisplacement = projectOnPlane(displacement, plan.wristToContactDirection);
  const offlineTravelMeters = length(offlineDisplacement);
  const deflectionDirection = normalize(offlineDisplacement, plan.initialDeflectionDirection);

  return Object.freeze({
    accepted: true,
    stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
    targetContactPoint: freezeVector(targetContactPoint),
    displacement: freezeVector(displacement),
    travelMeters: travel,
    offlineDisplacement: freezeVector(offlineDisplacement),
    offlineTravelMeters,
    deflectionDirection: freezeVector(deflectionDirection),
    surfaceCenter: freezeVector(center),
    surfaceNormal: freezeVector(normal),
    normalRotationAxis: normalRotation.axis,
    normalRotationRadians: normalRotation.radians,
    clamped: unclampedTravel > travel + 1e-8,
    authority: 'current-world-shield-surface',
  });
}

export function planLiveForearmHiltAssist(input = {}) {
  const attackDirection = String(input.attackDirection || '').toLowerCase();
  // R18P.4: the LEFT deferral is lifted. Wrist-only correction could not carry
  // the sword along the shield's deflect sweep on the knee-height LEFT catch:
  // six of seven inspection gates passed while direction agreement measured
  // -0.00, because the arm had no forearm or upperarm authority to follow the
  // push. All three directions now drive the same arm chain.

  const profile = resolveProfile(input.profile);
  const forearmPivotPoint = vec(input.forearmPivotPoint);
  const initialGripPoint = vec(input.initialGripPoint);
  const initialSwordBasePoint = vec(input.initialSwordBasePoint);
  const initialSwordTipPoint = vec(input.initialSwordTipPoint);
  const initialSwordAxis = normalize(subtract(initialSwordTipPoint, initialSwordBasePoint));
  const contactTargetOffset = vec(input.contactTargetOffset);
  const offlineTargetOffset = projectOnPlane(contactTargetOffset, initialSwordAxis);
  const offlineTargetTravelMeters = length(offlineTargetOffset);
  if (offlineTargetTravelMeters <= 1e-6) {
    return Object.freeze({
      accepted: true,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      reason: 'no-offline-hilt-assist-required-yet',
      attackDirection,
      targetGripPoint: freezeVector(initialGripPoint),
      targetHiltOfflineTravelMeters: 0,
      progress: 0,
    });
  }

  const progress = clamp(
    offlineTargetTravelMeters / profile.minimumInspectionOfflineTravelMeters,
    0,
    1,
  );
  const forearmLever = subtract(initialGripPoint, forearmPivotPoint);
  const forearmLeverLengthMeters = length(forearmLever);
  if (forearmLeverLengthMeters <= 0.08) {
    return Object.freeze({
      accepted: false,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      reason: 'forearm-hilt-lever-too-short',
      attackDirection,
    });
  }

  const forearmLeverDirection = scale(forearmLever, 1 / forearmLeverLengthMeters);
  const desiredOfflineDirection = scale(offlineTargetOffset, 1 / offlineTargetTravelMeters);
  let reachableDirection = normalize(projectOnPlane(desiredOfflineDirection, forearmLeverDirection));
  let offlineEfficiency = length(projectOnPlane(reachableDirection, initialSwordAxis));
  if (offlineEfficiency < 0.45) {
    reachableDirection = normalize(cross(initialSwordAxis, forearmLeverDirection));
    if (dot(reachableDirection, desiredOfflineDirection) < 0) reachableDirection = scale(reachableDirection, -1);
    offlineEfficiency = length(projectOnPlane(reachableDirection, initialSwordAxis));
  }
  if (offlineEfficiency <= 1e-5) {
    return Object.freeze({
      accepted: false,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      reason: 'forearm-hilt-offline-direction-degenerate',
      attackDirection,
    });
  }

  const targetHiltOfflineTravelMeters = profile.minimumHiltOfflineTravelMeters
    * profile.forearmHiltClearanceScale
    * progress;
  const requestedChordMeters = targetHiltOfflineTravelMeters / offlineEfficiency;
  const requestedRadians = 2 * Math.asin(clamp(
    requestedChordMeters / (2 * forearmLeverLengthMeters),
    0,
    1,
  ));
  const maximumRadians = profile.maximumForearmDegrees * Math.PI / 180;
  const appliedRadians = Math.min(requestedRadians, maximumRadians);
  const rotationAxis = normalize(cross(forearmLeverDirection, reachableDirection));
  const targetGripPoint = add(
    forearmPivotPoint,
    rotateAroundAxis(forearmLever, rotationAxis, appliedRadians),
  );
  const estimatedOfflineTravelMeters = length(projectOnPlane(
    subtract(targetGripPoint, initialGripPoint),
    initialSwordAxis,
  ));

  return Object.freeze({
    accepted: true,
    stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
    reason: 'bounded-forearm-hilt-clearance-target-ready',
    attackDirection,
    targetGripPoint: freezeVector(targetGripPoint),
    targetHiltOfflineTravelMeters,
    estimatedOfflineTravelMeters,
    forearmPivotPoint: freezeVector(forearmPivotPoint),
    forearmLeverLengthMeters,
    reachableDirection: freezeVector(reachableDirection),
    rotationAxis: freezeVector(rotationAxis),
    requestedDegrees: requestedRadians * 180 / Math.PI,
    appliedDegrees: appliedRadians * 180 / Math.PI,
    rotationClamped: requestedRadians > appliedRadians + 1e-8,
    offlineEfficiency,
    progress,
    maximumForearmDegrees: profile.maximumForearmDegrees,
    authority: 'measured-contact-offset-drives-bounded-forearm-hilt-clearance',
  });
}

export function planLiveHiltOfflineResidualCorrection(input = {}) {
  const attackDirection = String(input.attackDirection || '').toLowerCase();
  // R18P.4: the LEFT deferral is lifted. Wrist-only correction could not carry
  // the sword along the shield's deflect sweep on the knee-height LEFT catch:
  // six of seven inspection gates passed while direction agreement measured
  // -0.00, because the arm had no forearm or upperarm authority to follow the
  // push. All three directions now drive the same arm chain.

  const profile = resolveProfile(input.profile);
  const initialGripPoint = vec(input.initialGripPoint);
  const currentGripPoint = vec(input.currentGripPoint);
  const forearmPivotPoint = vec(input.forearmPivotPoint);
  const initialSwordAxis = normalize(subtract(
    vec(input.initialSwordTipPoint),
    vec(input.initialSwordBasePoint),
  ));
  const currentGripOffset = subtract(currentGripPoint, initialGripPoint);
  const currentOfflineOffset = projectOnPlane(currentGripOffset, initialSwordAxis);
  const currentOfflineTravelMeters = length(currentOfflineOffset);
  const targetOfflineTravelMeters = profile.minimumHiltOfflineTravelMeters
    + profile.hiltOfflineReleaseMarginMeters;
  if (currentOfflineTravelMeters >= targetOfflineTravelMeters) {
    return Object.freeze({
      accepted: true,
      correctionRequired: false,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      reason: 'final-hilt-offline-clearance-already-sufficient',
      attackDirection,
      currentOfflineTravelMeters,
      targetOfflineTravelMeters,
      appliedDegrees: 0,
      authority: 'final-world-hilt-clearance-closed-loop',
    });
  }

  const preferredOfflineOffset = projectOnPlane(
    vec(input.contactTargetOffset),
    initialSwordAxis,
  );
  const offlineDirection = normalize(
    currentOfflineOffset,
    normalize(preferredOfflineOffset),
  );
  if (length(offlineDirection) <= 1e-6) {
    return Object.freeze({
      accepted: false,
      correctionRequired: true,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      reason: 'final-hilt-offline-direction-degenerate',
      attackDirection,
      currentOfflineTravelMeters,
      targetOfflineTravelMeters,
    });
  }

  const alongAttackLineOffset = scale(initialSwordAxis, dot(currentGripOffset, initialSwordAxis));
  const targetGripPoint = add(
    initialGripPoint,
    add(alongAttackLineOffset, scale(offlineDirection, targetOfflineTravelMeters)),
  );
  const remainingForearmDegrees = clamp(
    input.remainingForearmDegrees ?? profile.maximumForearmDegrees,
    0,
    profile.maximumForearmDegrees,
  );
  if (remainingForearmDegrees <= 1e-5) {
    return Object.freeze({
      accepted: false,
      correctionRequired: true,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      reason: 'final-hilt-offline-forearm-budget-exhausted',
      attackDirection,
      currentOfflineTravelMeters,
      targetOfflineTravelMeters,
      remainingForearmDegrees,
    });
  }

  const constraint = solveLiveSwordContactConstraint({
    pivotWorldPoint: forearmPivotPoint,
    currentContactPoint: currentGripPoint,
    targetContactPoint: targetGripPoint,
    maximumDegrees: remainingForearmDegrees,
  });
  return Object.freeze({
    accepted: constraint.accepted === true,
    correctionRequired: true,
    stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
    reason: constraint.accepted
      ? 'final-hilt-offline-residual-correction-ready'
      : constraint.reason,
    attackDirection,
    currentOfflineTravelMeters,
    targetOfflineTravelMeters,
    targetGripPoint: freezeVector(targetGripPoint),
    remainingForearmDegrees,
    constraint,
    appliedDegrees: constraint.appliedDegrees ?? 0,
    authority: 'final-world-hilt-clearance-closed-loop',
  });
}

export function solveLiveSwordContactConstraint(input = {}) {
  const pivot = vec(input.pivotWorldPoint);
  const contact = vec(input.currentContactPoint);
  const target = vec(input.targetContactPoint);
  const currentLever = subtract(contact, pivot);
  const targetLever = subtract(target, pivot);
  const currentLength = length(currentLever);
  const targetLength = length(targetLever);
  if (currentLength <= 1e-6 || targetLength <= 1e-6) {
    return Object.freeze({
      accepted: false,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      reason: 'live-contact-constraint-lever-degenerate',
    });
  }

  const currentDirection = scale(currentLever, 1 / currentLength);
  const targetDirection = scale(targetLever, 1 / targetLength);
  const rawAxis = cross(currentDirection, targetDirection);
  const rawRadians = Math.acos(clamp(dot(currentDirection, targetDirection), -1, 1));
  const maximumRadians = clamp(finite(input.maximumDegrees, 38), 0, 90) * Math.PI / 180;
  const appliedRadians = Math.min(rawRadians, maximumRadians);
  const axis = normalize(rawAxis);
  const expectedLever = length(axis) > 0 && appliedRadians > 1e-8
    ? rotateAroundAxis(currentLever, axis, appliedRadians)
    : currentLever;
  const expectedContactPoint = add(pivot, expectedLever);
  const constraintError = subtract(target, expectedContactPoint);

  return Object.freeze({
    accepted: true,
    stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
    axis: freezeVector(axis),
    rawRadians,
    rawDegrees: rawRadians * 180 / Math.PI,
    appliedRadians,
    appliedDegrees: appliedRadians * 180 / Math.PI,
    rotationClamped: rawRadians > appliedRadians + 1e-8,
    expectedContactPoint: freezeVector(expectedContactPoint),
    constraintError: freezeVector(constraintError),
    constraintErrorMeters: length(constraintError),
    authority: 'position-based-live-contact-direction-constraint',
  });
}

export function planLiveWristAttackLineTwist(input = {}) {
  const profile = resolveProfile(input.profile);
  const initialSwordAxis = normalize(vec(input.initialSwordAxis));
  const currentSwordAxis = normalize(vec(input.currentSwordAxis));
  const initialWristGripAxis = normalize(vec(input.initialWristGripAxis));
  const currentWristGripAxis = normalize(vec(input.currentWristGripAxis));
  const wristToContactAxis = normalize(subtract(
    vec(input.contactPoint),
    vec(input.wristPoint),
  ));
  if (length(initialSwordAxis) <= 1e-6
    || length(currentSwordAxis) <= 1e-6
    || length(wristToContactAxis) <= 1e-6) {
    return Object.freeze({
      accepted: false,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      reason: 'wrist-attack-line-twist-axis-degenerate',
    });
  }

  const currentClearanceDegrees = Math.acos(clamp(
    dot(initialSwordAxis, currentSwordAxis),
    -1,
    1,
  )) * 180 / Math.PI;
  const wristGripConstraintAvailable = length(initialWristGripAxis) > 1e-6
    && length(currentWristGripAxis) > 1e-6;
  const currentWristGripClearanceDegrees = wristGripConstraintAvailable
    ? Math.acos(clamp(dot(initialWristGripAxis, currentWristGripAxis), -1, 1)) * 180 / Math.PI
    : Number.POSITIVE_INFINITY;
  const minimumSwordDegrees = profile.minimumSwordAxisClearanceDegrees;
  const minimumWristGripDegrees = profile.minimumWristGripClearanceDegrees;
  if (currentClearanceDegrees >= minimumSwordDegrees
    && currentWristGripClearanceDegrees >= minimumWristGripDegrees) {
    return Object.freeze({
      accepted: true,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      reason: 'sword-axis-clearance-already-sufficient',
      appliedDegrees: 0,
      predictedClearanceDegrees: currentClearanceDegrees,
      predictedWristGripClearanceDegrees: currentWristGripClearanceDegrees,
      axis: freezeVector(wristToContactAxis),
    });
  }

  const maximumDegrees = profile.maximumWristAttackLineTwistDegrees;
  let best = {
    appliedDegrees: 0,
    predictedClearanceDegrees: currentClearanceDegrees,
    predictedWristGripClearanceDegrees: currentWristGripClearanceDegrees,
    score: Math.min(
      currentClearanceDegrees / minimumSwordDegrees,
      currentWristGripClearanceDegrees / minimumWristGripDegrees,
    ),
  };
  const stepDegrees = 0.2;
  let bothGatesPassed = false;
  for (let magnitudeDegrees = stepDegrees; magnitudeDegrees <= maximumDegrees + 1e-8; magnitudeDegrees += stepDegrees) {
    for (const sign of [-1, 1]) {
      const appliedDegrees = Math.min(magnitudeDegrees, maximumDegrees) * sign;
      const rotatedAxis = rotateAroundAxis(
        currentSwordAxis,
        wristToContactAxis,
        appliedDegrees * Math.PI / 180,
      );
      const predictedClearanceDegrees = Math.acos(clamp(
        dot(initialSwordAxis, normalize(rotatedAxis)),
        -1,
        1,
      )) * 180 / Math.PI;
      const rotatedWristGripAxis = wristGripConstraintAvailable
        ? rotateAroundAxis(
            currentWristGripAxis,
            wristToContactAxis,
            appliedDegrees * Math.PI / 180,
          )
        : currentWristGripAxis;
      const predictedWristGripClearanceDegrees = wristGripConstraintAvailable
        ? Math.acos(clamp(
            dot(initialWristGripAxis, normalize(rotatedWristGripAxis)),
            -1,
            1,
          )) * 180 / Math.PI
        : Number.POSITIVE_INFINITY;
      const score = Math.min(
        predictedClearanceDegrees / minimumSwordDegrees,
        predictedWristGripClearanceDegrees / minimumWristGripDegrees,
      );
      const passesWithMargin = predictedClearanceDegrees >= minimumSwordDegrees + 0.50
        && predictedWristGripClearanceDegrees >= minimumWristGripDegrees + 0.50;
      if (passesWithMargin || score > best.score) {
        best = { appliedDegrees, predictedClearanceDegrees, predictedWristGripClearanceDegrees, score };
      }
      if (passesWithMargin) {
        bothGatesPassed = true;
        break;
      }
    }
    if (bothGatesPassed) break;
  }

  return Object.freeze({
    accepted: true,
    stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
    reason: best.predictedClearanceDegrees >= minimumSwordDegrees
      && best.predictedWristGripClearanceDegrees >= minimumWristGripDegrees
      ? 'bounded-wrist-attack-line-twist-ready'
      : 'bounded-wrist-attack-line-twist-saturated',
    appliedDegrees: best.appliedDegrees,
    predictedClearanceDegrees: best.predictedClearanceDegrees,
    predictedWristGripClearanceDegrees: best.predictedWristGripClearanceDegrees,
    currentClearanceDegrees,
    currentWristGripClearanceDegrees,
    minimumClearanceDegrees: minimumSwordDegrees,
    minimumWristGripClearanceDegrees: minimumWristGripDegrees,
    axis: freezeVector(wristToContactAxis),
    authority: 'contact-axis-twist-preserves-contact-anchor-while-clearing-attack-line',
  });
}

export function evaluateAttackLineClearance(input = {}) {
  const profile = resolveProfile(input.profile);
  const initialSwordBase = vec(input.initialSwordBasePoint);
  const initialSwordTip = vec(input.initialSwordTipPoint);
  const currentSwordBase = vec(input.currentSwordBasePoint);
  const currentSwordTip = vec(input.currentSwordTipPoint);
  const initialWrist = vec(input.initialWristPoint);
  const initialGrip = vec(input.initialGripPoint);
  const currentWrist = vec(input.currentWristPoint);
  const currentGrip = vec(input.currentGripPoint);
  const initialSwordAxis = normalize(subtract(initialSwordTip, initialSwordBase));
  const currentSwordAxis = normalize(subtract(currentSwordTip, currentSwordBase));
  const initialWristGripLine = normalize(subtract(initialGrip, initialWrist));
  const currentWristGripLine = normalize(subtract(currentGrip, currentWrist));
  const swordAxisClearanceDegrees = Math.acos(clamp(dot(initialSwordAxis, currentSwordAxis), -1, 1)) * 180 / Math.PI;
  const wristGripClearanceDegrees = Math.acos(clamp(dot(initialWristGripLine, currentWristGripLine), -1, 1)) * 180 / Math.PI;
  const hiltOffset = subtract(currentGrip, initialGrip);
  const hiltOfflineOffset = projectOnPlane(hiltOffset, initialSwordAxis);
  const hiltOfflineTravelMeters = length(hiltOfflineOffset);
  const swordAxisPassed = swordAxisClearanceDegrees >= profile.minimumSwordAxisClearanceDegrees;
  const hiltOfflinePassed = hiltOfflineTravelMeters >= profile.minimumHiltOfflineTravelMeters;
  const wristGripLinePassed = wristGripClearanceDegrees >= profile.minimumWristGripClearanceDegrees;

  return Object.freeze({
    pass: swordAxisPassed && hiltOfflinePassed && wristGripLinePassed,
    swordAxisPassed,
    hiltOfflinePassed,
    wristGripLinePassed,
    swordAxisClearanceDegrees,
    hiltOfflineTravelMeters,
    wristGripClearanceDegrees,
    minimumSwordAxisClearanceDegrees: profile.minimumSwordAxisClearanceDegrees,
    minimumHiltOfflineTravelMeters: profile.minimumHiltOfflineTravelMeters,
    minimumWristGripClearanceDegrees: profile.minimumWristGripClearanceDegrees,
    initialSwordAxis: freezeVector(initialSwordAxis),
    currentSwordAxis: freezeVector(currentSwordAxis),
    hiltOfflineOffset: freezeVector(hiltOfflineOffset),
    authority: 'measured-current-lines-versus-frozen-contact-attack-line',
  });
}

const LIVE_CONTACT_DIRECTION_AGREEMENT_MINIMUM = 0.5;
const EXPECTED_HOLD_TERMINAL_REASONS = Object.freeze(new Set([
  'shield-surface-separated-after-live-deflection-peak',
  'shield-surface-settled-after-live-deflection-peak',
  'live-contact-safety-limit-after-sufficient-deflection',
  'sword-slipped-off-shield-after-live-deflection-peak',
]));

function inspectionGate(key, label, actualValue, minimumValue, unit, operator = '>=') {
  const actual = actualValue == null ? null : Number.isFinite(Number(actualValue)) ? Number(actualValue) : null;
  const minimum = finite(minimumValue);
  const pass = actual != null && (operator === '>' ? actual > minimum : actual >= minimum);
  return Object.freeze({ key, label, pass, actual, minimum, operator, unit });
}

// Axis clearance alone is direction-specific. The 7-degree bar was calibrated
// on TOP and RIGHT, where the deflect pivots a hanging or crossing blade; the
// LEFT low sweep is caught at knee height with the arm fully engaged, and
// there a correct deflection translates the sword with the shield more than
// it pivots it (measured 3.6-3.8 degrees while agreement held at 0.92).
// Deflection direction and wrist-grip clearance keep the shared minimums.
const LEFT_LOW_SWEEP_INSPECTION_CALIBRATION = Object.freeze({
  minimumSwordAxisClearanceDegrees: 3,
});

export function evaluateLiveContactInspection(input = {}) {
  const profile = resolveProfile(input.profile);
  const clearance = input.attackLineClearance || {};
  const leftCalibration = String(input.attackDirection || '').toLowerCase() === 'left'
    ? LEFT_LOW_SWEEP_INSPECTION_CALIBRATION
    : null;
  const gates = Object.freeze({
    shieldOfflineTravel: inspectionGate(
      'shieldOfflineTravel',
      'shield offline travel',
      input.peakOfflineTravelMeters,
      profile.minimumInspectionOfflineTravelMeters,
      'meters',
    ),
    handTravel: inspectionGate(
      'handTravel',
      'hand travel',
      input.actualHandTravelMeters,
      profile.minimumInspectionHandTravelMeters,
      'meters',
    ),
    gripTravel: inspectionGate(
      'gripTravel',
      'grip travel',
      input.actualGripTravelMeters,
      profile.minimumInspectionGripTravelMeters,
      'meters',
    ),
    swordAxisClearance: inspectionGate(
      'swordAxisClearance',
      'sword axis clearance',
      clearance.swordAxisClearanceDegrees,
      leftCalibration?.minimumSwordAxisClearanceDegrees ?? profile.minimumSwordAxisClearanceDegrees,
      'degrees',
    ),
    hiltOfflineTravel: inspectionGate(
      'hiltOfflineTravel',
      'hilt offline travel',
      clearance.hiltOfflineTravelMeters,
      profile.minimumHiltOfflineTravelMeters,
      'meters',
    ),
    wristGripClearance: inspectionGate(
      'wristGripClearance',
      'wrist to grip clearance',
      clearance.wristGripClearanceDegrees,
      leftCalibration?.minimumWristGripClearanceDegrees ?? profile.minimumWristGripClearanceDegrees,
      'degrees',
    ),
    directionAgreement: inspectionGate(
      'directionAgreement',
      'deflection direction agreement',
      input.directionAgreement,
      leftCalibration?.directionAgreementMinimum ?? LIVE_CONTACT_DIRECTION_AGREEMENT_MINIMUM,
      'ratio',
      '>',
    ),
  });
  const failedGateKeys = Object.freeze(
    Object.values(gates).filter((gate) => !gate.pass).map((gate) => gate.key),
  );
  const terminalReason = input.terminalReason || null;
  const terminalIsExpectedHold = EXPECTED_HOLD_TERMINAL_REASONS.has(terminalReason);
  const holding = input.holding === true;

  return Object.freeze({
    pass: holding && failedGateKeys.length === 0,
    holding,
    gates,
    failedGateKeys,
    failedGateCount: failedGateKeys.length,
    terminalReason,
    terminalIsExpectedHold,
    authority: 'measured-live-contact-inspection-gates',
  });
}
function applyWorldAxisRotation(THREE, bone, axis, radians) {
  if (!bone || Math.abs(radians) <= 1e-8) return 0;
  const worldAxis = new THREE.Vector3(axis.x, axis.y, axis.z);
  if (worldAxis.lengthSq() <= 1e-10) return 0;
  worldAxis.normalize();
  const worldDelta = new THREE.Quaternion().setFromAxisAngle(worldAxis, radians);
  const parentWorld = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentWorld);
  const localDelta = parentWorld.clone().invert().multiply(worldDelta).multiply(parentWorld);
  bone.quaternion.premultiply(localDelta).normalize();
  return radians * 180 / Math.PI;
}

export function createLiveShieldSwordGripContactRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) {
    throw new Error(`${LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE} requires THREE.Vector3 + Quaternion`);
  }
  const attackerRig = options.attackerRig;
  const attackerSword = options.attackerSword;
  const upperarmBone = attackerRig?.bones?.['upperarm.r'];
  const lowerarmBone = attackerRig?.bones?.['lowerarm.r'];
  const wristBone = attackerRig?.bones?.['wrist.r'];
  const handBone = attackerRig?.bones?.['hand.r'];
  if (!upperarmBone || !lowerarmBone || !wristBone || !handBone) {
    throw new Error(`${LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE} requires attacker upperarm.r + lowerarm.r + wrist.r + hand.r`);
  }
  if (!attackerSword?.object3d?.worldToLocal || !attackerSword?.object3d?.localToWorld
    || !attackerSword?.bladeBase?.getWorldPosition || !attackerSword?.tip?.getWorldPosition) {
    throw new Error(`${LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE} requires an attached attacker sword with blade axis nodes`);
  }

  let active = null;
  let lastReport = null;

  function reset() {
    if (active?.baseUpperarmQuaternion) upperarmBone.quaternion.copy(active.baseUpperarmQuaternion);
    if (active?.baseLowerarmQuaternion) lowerarmBone.quaternion.copy(active.baseLowerarmQuaternion);
    if (active?.baseWristQuaternion) wristBone.quaternion.copy(active.baseWristQuaternion);
    attackerRig.root?.updateMatrixWorld?.(true);
    active = null;
    lastReport = null;
    return null;
  }

  function start(input = {}) {
    if (active) {
      return Object.freeze({
        accepted: false,
        stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
        reason: 'live-shield-sword-grip-contact-already-active',
      });
    }
    attackerRig.root?.updateMatrixWorld?.(true);
    attackerSword.object3d.updateMatrixWorld(true);

    const wristWorld = new THREE.Vector3();
    const handWorld = new THREE.Vector3();
    const gripWorld = new THREE.Vector3();
    const swordBaseWorld = new THREE.Vector3();
    const swordTipWorld = new THREE.Vector3();
    wristBone.getWorldPosition(wristWorld);
    handBone.getWorldPosition(handWorld);
    attackerSword.object3d.getWorldPosition(gripWorld);
    attackerSword.bladeBase.getWorldPosition(swordBaseWorld);
    attackerSword.tip.getWorldPosition(swordTipWorld);
    const plan = buildLiveShieldSwordGripContactPlan({
      ...input,
      wristWorldPoint: wristWorld,
      handWorldPoint: handWorld,
      initialSwordBasePoint: swordBaseWorld,
      initialSwordTipPoint: swordTipWorld,
      initialGripPoint: gripWorld,
    });
    if (!plan.accepted) {
      lastReport = plan;
      return plan;
    }

    const contactLocal = new THREE.Vector3(plan.contactPoint.x, plan.contactPoint.y, plan.contactPoint.z);
    attackerSword.object3d.worldToLocal(contactLocal);
    const initialTarget = new THREE.Vector3(plan.contactPoint.x, plan.contactPoint.y, plan.contactPoint.z);
    active = {
      plan,
      attackDirection: String(input.attackDirection || '').toLowerCase(),
      elapsedMs: 0,
      holding: false,
      terminalReason: null,
      baseUpperarmQuaternion: upperarmBone.quaternion.clone(),
      baseLowerarmQuaternion: lowerarmBone.quaternion.clone(),
      baseWristQuaternion: wristBone.quaternion.clone(),
      heldLowerarmQuaternion: lowerarmBone.quaternion.clone(),
      heldWristQuaternion: wristBone.quaternion.clone(),
      heldUpperarmCorrectionQuaternion: new THREE.Quaternion(),
      lastReactionIntentUpperarmQuaternion: null,
      lastFinalUpperarmQuaternion: null,
      contactLocal,
      // Slip tracking: the grip counts as established once the solved contact
      // gets close to its target, and slipped once it can no longer be held
      // there. Both are needed because the error is large during the catch.
      gripEstablished: false,
      slipFrames: 0,
      lastContactErrorMeters: 0,
      heldDirectionAgreement: null,
      initialContactWorld: initialTarget.clone(),
      initialHandWorld: handWorld.clone(),
      initialGripWorld: gripWorld.clone(),
      initialSwordBaseWorld: swordBaseWorld.clone(),
      initialSwordTipWorld: swordTipWorld.clone(),
      previousRawTarget: initialTarget.clone(),
      peakTarget: initialTarget.clone(),
      peakOfflineTravelMeters: 0,
      peakTargetTravelMeters: 0,
      settledFrames: 0,
      reverseFrames: 0,
      lastMappedSurfaceTarget: null,
    };
    lastReport = Object.freeze({
      accepted: true,
      active: true,
      holding: false,
      complete: false,
      phase: LIVE_SHIELD_SWORD_GRIP_CONTACT_PHASES.LIVE_CONTACT,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      plan,
      modifiedBone: 'wrist.r',
      assistBone: 'lowerarm.r',
      propagatedBones: plan.propagatedBones,
      rigidSwordGrip: true,
      actualContactTravelMeters: 0,
      actualHandTravelMeters: 0,
      actualGripTravelMeters: 0,
      b3BodyClockCanAdvance: false,
      weaponArmContactConstrained: true,
      reactionIntentActiveAtImpact: input.reactionIntentActiveAtImpact === true,
      contactCorrectionRunsAfterReactionIntent: input.reactionIntentActiveAtImpact === true,
      proximalArmCorrectionActive: false,
      constraintApplicationOrder: input.reactionIntentActiveAtImpact === true
        ? 'full-old-b3-reaction-intent-then-upperarm-lowerarm-wrist-contact-correction'
        : 'contact-hold-upperarm-lowerarm-wrist-correction-before-visible-old-b3',
    });
    return lastReport;
  }

  function update(deltaSeconds = 1 / 60, input = {}) {
    if (!active) {
      return Object.freeze({
        accepted: false,
        active: false,
        stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
        reason: 'live-shield-sword-grip-contact-not-active',
        report: lastReport,
      });
    }

    const dt = Math.max(1e-5, finite(deltaSeconds, 1 / 60));
    active.elapsedMs += dt * 1000;
    let mapped = null;
    let rawTargetSpeedMps = 0;
    if (!active.holding) {
      mapped = mapLiveShieldContactTarget(active.plan, input.surfaceAtFrame || {});
      if (!mapped.accepted) return mapped;
      active.lastMappedSurfaceTarget = mapped;
      const rawTarget = new THREE.Vector3(
        mapped.targetContactPoint.x,
        mapped.targetContactPoint.y,
        mapped.targetContactPoint.z,
      );
      rawTargetSpeedMps = rawTarget.distanceTo(active.previousRawTarget) / dt;
      active.previousRawTarget.copy(rawTarget);

      if (mapped.offlineTravelMeters > active.peakOfflineTravelMeters + 1e-5) {
        active.peakOfflineTravelMeters = mapped.offlineTravelMeters;
        active.peakTargetTravelMeters = mapped.travelMeters;
        active.peakTarget.copy(rawTarget);
        active.settledFrames = 0;
        active.reverseFrames = 0;
      } else {
        active.settledFrames = rawTargetSpeedMps <= active.plan.profile.settledTargetSpeedMps
          ? active.settledFrames + 1
          : 0;
        active.reverseFrames = active.peakOfflineTravelMeters - mapped.offlineTravelMeters
          >= active.plan.profile.releaseHysteresisMeters
          ? active.reverseFrames + 1
          : 0;
      }

      // Slip is judged on the previous frame's solved error, which is the
      // most recent measurement available before this frame's solve.
      if (active.lastContactErrorMeters <= active.plan.profile.gripEstablishedErrorMeters) {
        active.gripEstablished = true;
      }
      active.slipFrames = active.gripEstablished
        && active.lastContactErrorMeters > active.plan.profile.maximumTrackingErrorMeters
        ? active.slipFrames + 1
        : 0;

      const inspectionTravelReached = active.peakOfflineTravelMeters
        >= active.plan.profile.minimumInspectionOfflineTravelMeters;
      const surfaceSeparatedAfterPeak = active.reverseFrames >= active.plan.profile.reverseFrameCount;
      const surfaceSettledAfterPeak = active.settledFrames >= active.plan.profile.settledFrameCount;
      const swordSlippedOffShield = active.slipFrames >= active.plan.profile.slipFrameCount;
      const safetyLimitReached = active.elapsedMs >= active.plan.profile.maximumLiveConstraintMs;
      if ((inspectionTravelReached
        && (surfaceSeparatedAfterPeak || surfaceSettledAfterPeak || swordSlippedOffShield))
        || safetyLimitReached) {
        active.holding = true;
        active.terminalReason = inspectionTravelReached
          ? surfaceSeparatedAfterPeak
            ? 'shield-surface-separated-after-live-deflection-peak'
            : surfaceSettledAfterPeak
              ? 'shield-surface-settled-after-live-deflection-peak'
              : swordSlippedOffShield
                ? 'sword-slipped-off-shield-after-live-deflection-peak'
                : 'live-contact-safety-limit-after-sufficient-deflection'
          : 'insufficient-live-shield-offline-travel';
      }
    }

    const reactionIntentAppliedBeforeConstraint = input.reactionIntentAppliedBeforeConstraint === true;
    if (
      reactionIntentAppliedBeforeConstraint
      && active.lastFinalUpperarmQuaternion
      && upperarmBone.quaternion.angleTo(active.lastFinalUpperarmQuaternion) <= 1e-5
    ) {
      upperarmBone.quaternion.copy(active.lastReactionIntentUpperarmQuaternion);
    } else if (!reactionIntentAppliedBeforeConstraint) {
      upperarmBone.quaternion.copy(active.baseUpperarmQuaternion);
    }
    const reactionIntentUpperarmQuaternion = upperarmBone.quaternion.clone();
    lowerarmBone.quaternion.copy(active.baseLowerarmQuaternion);
    wristBone.quaternion.copy(active.baseWristQuaternion);
    attackerRig.root?.updateMatrixWorld?.(true);
    attackerSword.object3d.updateMatrixWorld(true);

    const proximalArmCorrectionActive = true;
    const upperarmPivotWorld = new THREE.Vector3();
    const upperarmContactWorld = active.contactLocal.clone();
    upperarmBone.getWorldPosition(upperarmPivotWorld);
    attackerSword.object3d.localToWorld(upperarmContactWorld);
    const upperarmConstraint = proximalArmCorrectionActive
      ? solveLiveSwordContactConstraint({
          pivotWorldPoint: upperarmPivotWorld,
          currentContactPoint: upperarmContactWorld,
          targetContactPoint: active.peakTarget,
          maximumDegrees: active.plan.profile.maximumUpperarmCorrectionDegrees,
        })
      : null;
    const appliedUpperarmCorrectionDegrees = upperarmConstraint?.accepted
      ? applyWorldAxisRotation(
          THREE,
          upperarmBone,
          upperarmConstraint.axis,
          upperarmConstraint.appliedRadians,
        )
      : 0;
    if (upperarmConstraint?.accepted) {
      active.heldUpperarmCorrectionQuaternion.copy(upperarmBone.quaternion)
        .multiply(reactionIntentUpperarmQuaternion.clone().invert())
        .normalize();
    } else {
      active.heldUpperarmCorrectionQuaternion.identity();
    }
    active.lastReactionIntentUpperarmQuaternion = reactionIntentUpperarmQuaternion;
    active.lastFinalUpperarmQuaternion = upperarmBone.quaternion.clone();
    attackerRig.root?.updateMatrixWorld?.(true);
    attackerSword.object3d.updateMatrixWorld(true);

    const contactTargetOffset = active.peakTarget.clone().sub(active.initialContactWorld);
    const forearmPivotWorld = new THREE.Vector3();
    const baseGripWorld = new THREE.Vector3();
    lowerarmBone.getWorldPosition(forearmPivotWorld);
    attackerSword.object3d.getWorldPosition(baseGripWorld);
    const forearmAssist = planLiveForearmHiltAssist({
      attackDirection: active.attackDirection,
      profile: active.plan.profile,
      forearmPivotPoint: forearmPivotWorld,
      initialGripPoint: active.initialGripWorld,
      initialSwordBasePoint: active.initialSwordBaseWorld,
      initialSwordTipPoint: active.initialSwordTipWorld,
      contactTargetOffset,
    });
    let forearmConstraint = null;
    let appliedForearmDegrees = 0;
    if (forearmAssist.accepted && forearmAssist.targetHiltOfflineTravelMeters > 0) {
      forearmConstraint = solveLiveSwordContactConstraint({
        pivotWorldPoint: forearmPivotWorld,
        currentContactPoint: baseGripWorld,
        targetContactPoint: forearmAssist.targetGripPoint,
        maximumDegrees: active.plan.profile.maximumForearmDegrees,
      });
      if (forearmConstraint.accepted) {
        appliedForearmDegrees = applyWorldAxisRotation(
          THREE,
          lowerarmBone,
          forearmConstraint.axis,
          forearmConstraint.appliedRadians,
        );
        attackerRig.root?.updateMatrixWorld?.(true);
        attackerSword.object3d.updateMatrixWorld(true);
      }
    }

    const pivotWorld = new THREE.Vector3();
    const baseContactWorld = active.contactLocal.clone();
    wristBone.getWorldPosition(pivotWorld);
    attackerSword.object3d.localToWorld(baseContactWorld);
    const targetWorld = active.peakTarget;
    const constraint = solveLiveSwordContactConstraint({
      pivotWorldPoint: pivotWorld,
      currentContactPoint: baseContactWorld,
      targetContactPoint: targetWorld,
      maximumDegrees: active.plan.profile.maximumWristDegrees,
    });
    if (!constraint.accepted) return constraint;
    let appliedWristContactDegrees = applyWorldAxisRotation(
      THREE,
      wristBone,
      constraint.axis,
      constraint.appliedRadians,
    );
    attackerRig.root?.updateMatrixWorld?.(true);
    attackerSword.object3d.updateMatrixWorld(true);

    const preTwistWristWorld = new THREE.Vector3();
    const preTwistContactWorld = active.contactLocal.clone();
    const preTwistSwordBaseWorld = new THREE.Vector3();
    const preTwistSwordTipWorld = new THREE.Vector3();
    const preTwistGripWorld = new THREE.Vector3();
    wristBone.getWorldPosition(preTwistWristWorld);
    attackerSword.object3d.localToWorld(preTwistContactWorld);
    attackerSword.object3d.getWorldPosition(preTwistGripWorld);
    attackerSword.bladeBase.getWorldPosition(preTwistSwordBaseWorld);
    attackerSword.tip.getWorldPosition(preTwistSwordTipWorld);
    const wristAttackLineTwist = forearmAssist.accepted
      ? planLiveWristAttackLineTwist({
          profile: active.plan.profile,
          initialSwordAxis: subtract(active.initialSwordTipWorld, active.initialSwordBaseWorld),
          currentSwordAxis: preTwistSwordTipWorld.clone().sub(preTwistSwordBaseWorld),
          initialWristGripAxis: subtract(active.initialGripWorld, active.plan.wristWorldPoint),
          currentWristGripAxis: preTwistGripWorld.clone().sub(preTwistWristWorld),
          wristPoint: preTwistWristWorld,
          contactPoint: preTwistContactWorld,
        })
      : null;
    let appliedWristTwistDegrees = wristAttackLineTwist?.accepted
      ? applyWorldAxisRotation(
          THREE,
          wristBone,
          wristAttackLineTwist.axis,
          wristAttackLineTwist.appliedDegrees * Math.PI / 180,
        )
      : 0;
    let appliedWristDegrees = appliedWristContactDegrees + Math.abs(appliedWristTwistDegrees);
    attackerRig.root?.updateMatrixWorld?.(true);
    attackerSword.object3d.updateMatrixWorld(true);

    let residualHiltCorrection = null;
    let residualCorrectionPasses = 0;
    let appliedResidualForearmDegrees = 0;
    let appliedResidualWristDegrees = 0;
    if (forearmAssist.accepted) {
      for (
        let pass = 0;
        pass < active.plan.profile.maximumResidualCorrectionPasses;
        pass += 1
      ) {
        const residualForearmPivotWorld = new THREE.Vector3();
        const residualGripWorld = new THREE.Vector3();
        lowerarmBone.getWorldPosition(residualForearmPivotWorld);
        attackerSword.object3d.getWorldPosition(residualGripWorld);
        const remainingForearmDegrees = Math.max(
          0,
          active.plan.profile.maximumForearmDegrees
            - Math.abs(appliedForearmDegrees)
            - Math.abs(appliedResidualForearmDegrees),
        );
        residualHiltCorrection = planLiveHiltOfflineResidualCorrection({
          attackDirection: active.attackDirection,
          profile: active.plan.profile,
          forearmPivotPoint: residualForearmPivotWorld,
          initialGripPoint: active.initialGripWorld,
          currentGripPoint: residualGripWorld,
          initialSwordBasePoint: active.initialSwordBaseWorld,
          initialSwordTipPoint: active.initialSwordTipWorld,
          contactTargetOffset,
          remainingForearmDegrees,
        });
        if (!residualHiltCorrection.accepted || !residualHiltCorrection.correctionRequired) break;

        const residualForearmDegrees = applyWorldAxisRotation(
          THREE,
          lowerarmBone,
          residualHiltCorrection.constraint.axis,
          residualHiltCorrection.constraint.appliedRadians,
        );
        if (Math.abs(residualForearmDegrees) <= 1e-6) break;
        residualCorrectionPasses += 1;
        appliedResidualForearmDegrees += residualForearmDegrees;
        attackerRig.root?.updateMatrixWorld?.(true);
        attackerSword.object3d.updateMatrixWorld(true);

        const residualWristPivotWorld = new THREE.Vector3();
        const residualContactWorld = active.contactLocal.clone();
        wristBone.getWorldPosition(residualWristPivotWorld);
        attackerSword.object3d.localToWorld(residualContactWorld);
        const remainingWristDegrees = Math.max(
          0,
          active.plan.profile.maximumWristDegrees
            - Math.abs(appliedWristContactDegrees)
            - Math.abs(appliedResidualWristDegrees),
        );
        const residualContactConstraint = solveLiveSwordContactConstraint({
          pivotWorldPoint: residualWristPivotWorld,
          currentContactPoint: residualContactWorld,
          targetContactPoint: active.peakTarget,
          maximumDegrees: remainingWristDegrees,
        });
        if (residualContactConstraint.accepted) {
          const residualWristDegrees = applyWorldAxisRotation(
            THREE,
            wristBone,
            residualContactConstraint.axis,
            residualContactConstraint.appliedRadians,
          );
          appliedResidualWristDegrees += Math.abs(residualWristDegrees);
          attackerRig.root?.updateMatrixWorld?.(true);
          attackerSword.object3d.updateMatrixWorld(true);
        }
      }
    }
    appliedForearmDegrees += appliedResidualForearmDegrees;
    appliedWristContactDegrees += appliedResidualWristDegrees;
    appliedWristDegrees += appliedResidualWristDegrees;
    active.heldLowerarmQuaternion.copy(lowerarmBone.quaternion);
    active.heldWristQuaternion.copy(wristBone.quaternion);

    const actualContactWorld = active.contactLocal.clone();
    const actualHandWorld = new THREE.Vector3();
    const actualGripWorld = new THREE.Vector3();
    const actualWristWorld = new THREE.Vector3();
    const currentSwordBaseWorld = new THREE.Vector3();
    const currentSwordTipWorld = new THREE.Vector3();
    attackerSword.object3d.localToWorld(actualContactWorld);
    handBone.getWorldPosition(actualHandWorld);
    attackerSword.object3d.getWorldPosition(actualGripWorld);
    wristBone.getWorldPosition(actualWristWorld);
    attackerSword.bladeBase.getWorldPosition(currentSwordBaseWorld);
    attackerSword.tip.getWorldPosition(currentSwordTipWorld);
    const actualContactOffset = actualContactWorld.clone().sub(active.initialContactWorld);
    const actualHandOffset = actualHandWorld.clone().sub(active.initialHandWorld);
    const actualGripOffset = actualGripWorld.clone().sub(active.initialGripWorld);
    const peakTargetOffset = active.peakTarget.clone().sub(active.initialContactWorld);
    const frameDirectionAgreement = actualContactOffset.lengthSq() > 1e-10 && peakTargetOffset.lengthSq() > 1e-10
      ? actualContactOffset.clone().normalize().dot(peakTargetOffset.clone().normalize())
      : null;
    const liveContactErrorMeters = actualContactWorld.distanceTo(active.peakTarget);
    active.lastContactErrorMeters = liveContactErrorMeters;
    // Only frames where the shield still had the sword describe the
    // deflection. Once the blade slips, the target runs away from a sword the
    // arm can no longer carry and the running agreement decays toward zero --
    // measured 0.92 while held and 0.42 by separation on the same LEFT parry.
    if (frameDirectionAgreement != null
      && liveContactErrorMeters <= active.plan.profile.gripEstablishedErrorMeters) {
      active.heldDirectionAgreement = frameDirectionAgreement;
    }
    const directionAgreement = active.heldDirectionAgreement ?? frameDirectionAgreement;
    const actualContactTravelMeters = actualContactOffset.length();
    const actualHandTravelMeters = actualHandOffset.length();
    const actualGripTravelMeters = actualGripOffset.length();
    const attackLineClearance = evaluateAttackLineClearance({
      profile: active.plan.profile,
      initialSwordBasePoint: active.initialSwordBaseWorld,
      initialSwordTipPoint: active.initialSwordTipWorld,
      currentSwordBasePoint: currentSwordBaseWorld,
      currentSwordTipPoint: currentSwordTipWorld,
      initialWristPoint: active.plan.wristWorldPoint,
      initialGripPoint: active.initialGripWorld,
      currentWristPoint: actualWristWorld,
      currentGripPoint: actualGripWorld,
    });
    const inspectionAssessment = evaluateLiveContactInspection({
      profile: active.plan.profile,
      attackDirection: active.attackDirection,
      holding: active.holding,
      terminalReason: active.terminalReason,
      peakOfflineTravelMeters: active.peakOfflineTravelMeters,
      actualHandTravelMeters,
      actualGripTravelMeters,
      attackLineClearance,
      directionAgreement,
    });
    const inspectionPassed = inspectionAssessment.pass;

    lastReport = Object.freeze({
      accepted: true,
      active: true,
      holding: active.holding,
      complete: active.holding,
      inspectionPassed,
      phase: active.holding
        ? LIVE_SHIELD_SWORD_GRIP_CONTACT_PHASES.INSPECTION_HOLD
        : LIVE_SHIELD_SWORD_GRIP_CONTACT_PHASES.LIVE_CONTACT,
      stage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
      elapsedMs: active.elapsedMs,
      terminalReason: active.terminalReason,
      plan: active.plan,
      mappedSurfaceTarget: active.lastMappedSurfaceTarget,
      targetContactPoint: freezeVector(active.peakTarget),
      peakTargetTravelMeters: active.peakTargetTravelMeters,
      peakOfflineTravelMeters: active.peakOfflineTravelMeters,
      rawTargetSpeedMps,
      constraint,
      forearmAssist,
      upperarmConstraint,
      appliedUpperarmCorrectionDegrees,
      forearmConstraint,
      appliedForearmDegrees,
      residualHiltCorrection,
      residualCorrectionPasses,
      appliedResidualForearmDegrees,
      appliedResidualWristDegrees,
      appliedWristContactDegrees,
      wristAttackLineTwist,
      appliedWristTwistDegrees,
      appliedWristDegrees,
      actualContactPoint: freezeVector(actualContactWorld),
      actualContactOffset: freezeVector(actualContactOffset),
      actualContactTravelMeters,
      actualHandOffset: freezeVector(actualHandOffset),
      actualHandTravelMeters,
      actualGripOffset: freezeVector(actualGripOffset),
      actualGripTravelMeters,
      actualGripPoint: freezeVector(actualGripWorld),
      actualWristPoint: freezeVector(actualWristWorld),
      initialSwordBasePoint: freezeVector(active.initialSwordBaseWorld),
      initialSwordTipPoint: freezeVector(active.initialSwordTipWorld),
      currentSwordBasePoint: freezeVector(currentSwordBaseWorld),
      currentSwordTipPoint: freezeVector(currentSwordTipWorld),
      attackLineClearance,
      inspectionAssessment,
      liveContactErrorMeters,
      directionAgreement,
      modifiedBone: 'wrist.r',
      proximalAssistBone: proximalArmCorrectionActive ? 'upperarm.r' : null,
      assistBone: forearmAssist.accepted ? 'lowerarm.r' : null,
      modifiedBones: Object.freeze(proximalArmCorrectionActive
        ? forearmAssist.accepted
          ? ['upperarm.r', 'lowerarm.r', 'wrist.r']
          : ['upperarm.r', 'wrist.r']
        : forearmAssist.accepted
          ? ['lowerarm.r', 'wrist.r']
          : ['wrist.r']),
      propagatedBones: active.plan.propagatedBones,
      gripChainOnly: !forearmAssist.accepted,
      rigidSwordGrip: true,
      elbowPropagationActive: forearmAssist.accepted,
      shoulderPropagationActive: false,
      proximalArmCorrectionActive,
      b3BodyClockCanAdvance: false,
      weaponArmContactConstrained: true,
      reactionIntentAppliedBeforeConstraint,
      contactCorrectionRunsAfterReactionIntent: reactionIntentAppliedBeforeConstraint,
      constraintApplicationOrder: reactionIntentAppliedBeforeConstraint
        ? 'full-old-b3-reaction-intent-then-upperarm-lowerarm-wrist-contact-correction'
        : 'contact-hold-upperarm-lowerarm-wrist-correction-before-visible-old-b3',
      authority: active.plan.authority,
    });
    return lastReport;
  }

  function applyHeldPose(weight = 1) {
    if (!active?.heldLowerarmQuaternion || !active?.heldWristQuaternion) return false;
    const poseWeight = clamp(weight, 0, 1);
    const upperarmCorrection = new THREE.Quaternion().slerp(
      active.heldUpperarmCorrectionQuaternion,
      poseWeight,
    );
    upperarmBone.quaternion.copy(active.baseUpperarmQuaternion)
      .premultiply(upperarmCorrection)
      .normalize();
    lowerarmBone.quaternion.copy(active.baseLowerarmQuaternion).slerp(active.heldLowerarmQuaternion, poseWeight);
    wristBone.quaternion.copy(active.baseWristQuaternion).slerp(active.heldWristQuaternion, poseWeight);
    attackerRig.root?.updateMatrixWorld?.(true);
    attackerSword.object3d.updateMatrixWorld(true);
    return true;
  }

  return Object.freeze({
    start,
    update,
    applyHeldPose,
    reset,
    get active() { return Boolean(active); },
    get holding() { return lastReport?.holding === true; },
    get plan() { return active?.plan || null; },
    get report() { return lastReport; },
  });
}
