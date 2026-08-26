export const GUARD_RESIDUAL_STANCE_REACH_STAGE = 'G4.3B.5R.3.10';

export const GUARD_RESIDUAL_STANCE_REACH_PROFILE = Object.freeze({
  planeSolvedMeters: 0.0025,
  kneeThreatPlaneMeters: 0.012,
  edgeActivationMeters: 0.010,
  downActivationRatio: 0.28,
  kneeThreatDownRatio: 0.75,
  lowGapVerticalActivationMeters: 0.008,
  kneeLineBandMeters: 0.16,
  footFloorToleranceMeters: 0.06,
  anticipatoryLeadMaxSeconds: 0.18,
  armSaturationRatio: 0.92,
  armAttemptActivationMeters: 0.005,
  armStallAchievedMeters: 0.002,
  armStallEdgeReductionMeters: 0.001,
  stallConfirmSeconds: 0.008,
  contactInsetMeters: 0.006,
  maxCrouchMeters: 0.045,
  crouchSpeedMps: 1.05,
  crouchReturnSpeedMps: 0.85,
  hipsAimMaxDegrees: 3.2,
  upperLegPlantMaxDegrees: 38,
  lowerLegPlantMaxDegrees: 62,
  footPlantIterations: 2,
  footPlantToleranceMeters: 0.012,
});
const SKIPPED_FOOT_PLANT = Object.freeze({
  appliedDegrees: Object.freeze({ upper: 0, lower: 0 }),
  driftMeters: 0,
  skipped: true,
});
const SKIPPED_FOOT_PLANT_PAIR = Object.freeze({ l: SKIPPED_FOOT_PLANT, r: SKIPPED_FOOT_PLANT });

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, finite(value))); }
function vec(value = {}) { return { x: finite(value.x), y: finite(value.y), z: finite(value.z) }; }
function optionalVec(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y)) || !Number.isFinite(Number(value.z))) return null;
  return vec(value);
}
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function mul(a, scalar) { return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function length(value) { return Math.hypot(value.x, value.y, value.z); }
function normalize(value, fallback = { x: 0, y: -1, z: 0 }) {
  const magnitude = length(value);
  return magnitude > 1e-9 ? mul(value, 1 / magnitude) : vec(fallback);
}
function freezeVector(value) { return Object.freeze({ x: value.x, y: value.y, z: value.z }); }

function normalizeSurface(surface = {}) {
  return Object.freeze({
    center: freezeVector(vec(surface.center)),
    normal: freezeVector(normalize(vec(surface.normal), { x: 0, y: 0, z: 1 })),
    radius: Math.max(0, finite(surface.radius)),
    thickness: Math.max(0, finite(surface.thickness)),
  });
}

function normalizeBodyReference(input = {}) {
  return Object.freeze({
    knees: Object.freeze({
      l: optionalVec(input.knees?.l),
      r: optionalVec(input.knees?.r),
    }),
    feet: Object.freeze({
      l: optionalVec(input.feet?.l),
      r: optionalVec(input.feet?.r),
    }),
  });
}

function closestPointMetrics(point, surface) {
  const fromCenter = sub(point, surface.center);
  const signedDistance = dot(fromCenter, surface.normal);
  const planePoint = sub(point, mul(surface.normal, signedDistance));
  const radialVector = sub(planePoint, surface.center);
  const radialDistance = length(radialVector);
  return Object.freeze({
    signedDistance,
    planePoint: freezeVector(planePoint),
    radialVector: freezeVector(radialVector),
    radialDirection: freezeVector(normalize(radialVector)),
    radialDistance,
    radialGapMeters: Math.max(0, radialDistance - surface.radius),
    planeGapMeters: Math.max(0, Math.abs(signedDistance) - surface.thickness * 0.5),
  });
}

export function classifyGuardKneeLineThreat(input = {}, profileInput = {}) {
  const profile = Object.freeze({ ...GUARD_RESIDUAL_STANCE_REACH_PROFILE, ...profileInput });
  const surface = normalizeSurface(input.bucklerSurface);
  const point = input.closestApproach?.point ? optionalVec(input.closestApproach.point) : null;
  const bodyReference = normalizeBodyReference(input.bodyReference);
  if (!point || !(surface.radius > 0)) {
    return Object.freeze({
      measured: false,
      zone: 'NO_THREAT_GEOMETRY',
      kneeLineThreat: false,
      lowGuardGapThreat: false,
      bodyReference,
    });
  }

  const metrics = closestPointMetrics(point, surface);
  const downwardRatio = Math.max(0, -metrics.radialDirection.y);
  const verticalDiscRadiusMeters = surface.radius
    * Math.sqrt(Math.max(0, 1 - surface.normal.y * surface.normal.y));
  const verticalThicknessMeters = surface.thickness * 0.5 * Math.abs(surface.normal.y);
  const shieldBottomY = surface.center.y - verticalDiscRadiusMeters - verticalThicknessMeters;
  const verticalGapBelowShieldMeters = Math.max(0, shieldBottomY - point.y);
  const kneePoints = [bodyReference.knees.l, bodyReference.knees.r].filter(Boolean);
  const footPoints = [bodyReference.feet.l, bodyReference.feet.r].filter(Boolean);
  const kneeLineY = kneePoints.length
    ? kneePoints.reduce((sum, knee) => sum + knee.y, 0) / kneePoints.length
    : null;
  const kneeLineDistanceMeters = kneePoints.length
    ? Math.min(...kneePoints.map((knee) => Math.abs(point.y - knee.y)))
    : null;
  const footFloorY = footPoints.length ? Math.min(...footPoints.map((foot) => foot.y)) : null;
  const planeNear = metrics.planeGapMeters <= profile.kneeThreatPlaneMeters;
  const stronglyDownward = downwardRatio >= profile.kneeThreatDownRatio;
  const belowShield = verticalGapBelowShieldMeters >= profile.lowGapVerticalActivationMeters;
  const aboveFeet = footFloorY != null && point.y >= footFloorY - profile.footFloorToleranceMeters;
  const insideKneeBand = kneeLineDistanceMeters != null
    && kneeLineDistanceMeters <= profile.kneeLineBandMeters;
  const measured = kneePoints.length === 2 && footPoints.length === 2;
  const lowGuardGapThreat = measured && planeNear && stronglyDownward && belowShield && aboveFeet;
  const kneeLineThreat = lowGuardGapThreat && insideKneeBand;

  return Object.freeze({
    measured,
    zone: kneeLineThreat ? 'KNEE_LINE_THREAT' : lowGuardGapThreat ? 'LOW_GUARD_GAP' : 'NONE',
    kneeLineThreat,
    lowGuardGapThreat,
    planeNear,
    stronglyDownward,
    belowShield,
    aboveFeet,
    insideKneeBand,
    downwardRatio,
    pointY: point.y,
    shieldCenterY: surface.center.y,
    shieldBottomY,
    verticalDiscRadiusMeters,
    verticalGapBelowShieldMeters,
    kneeLineY,
    kneeLineDistanceMeters,
    kneeLeftY: bodyReference.knees.l?.y ?? null,
    kneeRightY: bodyReference.knees.r?.y ?? null,
    footLeftY: bodyReference.feet.l?.y ?? null,
    footRightY: bodyReference.feet.r?.y ?? null,
    footFloorY,
    metrics,
    bodyReference,
    authority: 'live-sword-point-vs-oriented-shield-bottom-and-defender-knee-foot-world-points',
  });
}

function normalizeArmEvidence(input = {}) {
  const edgeBeforeMeters = Math.max(0, finite(input.edgeGapBeforeMeters));
  const edgeAfterMeters = Math.max(0, finite(input.edgeGapAfterMeters));
  return Object.freeze({
    extensionRatio: clamp(input.extensionRatio, 0, 1),
    correctionAttemptedMeters: Math.max(0, finite(input.correctionAttemptedMeters)),
    correctionAchievedMeters: Math.max(0, finite(input.correctionAchievedMeters)),
    edgeGapBeforeMeters: edgeBeforeMeters,
    edgeGapAfterMeters: edgeAfterMeters,
    edgeReductionMeters: edgeBeforeMeters - edgeAfterMeters,
  });
}

export function classifyGuardArmCorrectionStall(input = {}, profileInput = {}) {
  const profile = Object.freeze({ ...GUARD_RESIDUAL_STANCE_REACH_PROFILE, ...profileInput });
  const evidence = normalizeArmEvidence(input);
  const saturated = evidence.extensionRatio >= profile.armSaturationRatio;
  const attempted = evidence.correctionAttemptedMeters >= profile.armAttemptActivationMeters;
  const lowAchievement = evidence.correctionAchievedMeters <= profile.armStallAchievedMeters;
  const lowEdgeReduction = evidence.edgeReductionMeters <= profile.armStallEdgeReductionMeters;
  return Object.freeze({
    evidence,
    saturated,
    attempted,
    lowAchievement,
    lowEdgeReduction,
    stalled: attempted && (lowAchievement || lowEdgeReduction),
  });
}

export function planGuardResidualStanceReach(input = {}) {
  const profile = Object.freeze({ ...GUARD_RESIDUAL_STANCE_REACH_PROFILE, ...(input.profile || {}) });
  const mode = String(input.mode || 'off').toLowerCase();
  const surface = normalizeSurface(input.bucklerSurface);
  const point = input.closestApproach?.point ? vec(input.closestApproach.point) : null;
  const arm = classifyGuardArmCorrectionStall(input.armEvidence, profile);
  const threat = classifyGuardKneeLineThreat({
    closestApproach: input.closestApproach,
    bucklerSurface: surface,
    bodyReference: input.bodyReference,
  }, profile);
  if (mode !== 'parry' || !point || !(surface.radius > 0)) {
    return Object.freeze({
      stage: GUARD_RESIDUAL_STANCE_REACH_STAGE,
      mode,
      activeCandidate: false,
      arm,
      threat,
      surface,
      reason: mode !== 'parry' ? 'parry-only' : 'missing-contact-geometry',
      authority: 'pre-contact-guidance-only-real-swept-contact-required',
    });
  }

  const metrics = closestPointMetrics(point, surface);
  const downwardRatio = Math.max(0, -metrics.radialDirection.y);
  const planeSolved = metrics.planeGapMeters <= profile.planeSolvedMeters;
  const edgeOutside = metrics.radialGapMeters > profile.edgeActivationMeters;
  const lowResidual = downwardRatio >= profile.downActivationRatio;
  const reachUnavailable = arm.saturated || arm.stalled;
  const earlyKneeRecruitment = threat.kneeLineThreat && arm.attempted;
  const earlyLowThreatRecruitment = threat.lowGuardGapThreat && arm.attempted;
  const activeCandidate = edgeOutside && lowResidual
    && ((planeSolved && reachUnavailable) || earlyLowThreatRecruitment);
  const requestedCrouchMeters = activeCandidate
    ? Math.min(
        profile.maxCrouchMeters,
        (metrics.radialGapMeters + profile.contactInsetMeters)
          / Math.max(downwardRatio, profile.downActivationRatio),
      )
    : 0;

  return Object.freeze({
    stage: GUARD_RESIDUAL_STANCE_REACH_STAGE,
    mode,
    activeCandidate,
    planeSolved,
    edgeOutside,
    lowResidual,
    reachUnavailable,
    earlyKneeRecruitment,
    earlyLowThreatRecruitment,
    arm,
    threat,
    metrics,
    downwardRatio,
    requestedCrouchMeters,
    desiredRadialCorrection: freezeVector(mul(
      metrics.radialDirection,
      Math.min(profile.maxCrouchMeters, metrics.radialGapMeters + profile.contactInsetMeters),
    )),
    surface,
    point: freezeVector(point),
    profile,
    reason: activeCandidate
      ? earlyKneeRecruitment ? 'knee-line-threat-recruit-planted-crouch-early'
        : earlyLowThreatRecruitment ? 'low-guard-gap-recruit-planted-crouch-early'
          : arm.saturated ? 'arm-saturated-recruit-planted-crouch' : 'arm-stalled-recruit-planted-crouch'
      : !planeSolved ? 'shield-plane-not-solved'
        : !edgeOutside ? 'inside-shield-edge'
          : !lowResidual ? 'residual-not-low-enough-for-crouch'
            : 'arm-correction-still-effective',
    authority: 'pre-contact-guidance-only-real-swept-contact-required',
  });
}

export function selectGuardResidualStanceThreatPlan(input = {}) {
  const profile = Object.freeze({ ...GUARD_RESIDUAL_STANCE_REACH_PROFILE, ...(input.profile || {}) });
  const shared = {
    mode: input.mode,
    bucklerSurface: input.bucklerSurface,
    bodyReference: input.bodyReference,
    armEvidence: input.armEvidence,
    profile,
  };
  const measuredPlan = planGuardResidualStanceReach({
    ...shared,
    closestApproach: input.closestApproach,
  });
  const anticipatedPlan = input.anticipatedClosestApproach?.point
    ? planGuardResidualStanceReach({
        ...shared,
        closestApproach: input.anticipatedClosestApproach,
      })
    : null;
  const leadValue = Number(input.anticipatedLeadSeconds);
  const anticipatedLeadSeconds = Number.isFinite(leadValue) && leadValue >= 0 ? leadValue : null;
  const anticipatedWithinLead = anticipatedLeadSeconds != null
    && anticipatedLeadSeconds <= profile.anticipatoryLeadMaxSeconds;
  const anticipatedEligible = anticipatedWithinLead
    && anticipatedPlan?.activeCandidate === true
    && anticipatedPlan?.earlyLowThreatRecruitment === true;
  const anticipatedEligibilityReason = !anticipatedPlan
    ? 'no-predicted-future-sword-point'
    : anticipatedLeadSeconds == null
      ? 'no-predicted-lead-time'
      : !anticipatedWithinLead
        ? 'predicted-lead-exceeds-debug-window'
        : !anticipatedPlan.activeCandidate
          ? anticipatedPlan.reason
          : !anticipatedPlan.earlyLowThreatRecruitment
            ? 'predicted-point-not-low-guard-threat'
            : 'predicted-low-guard-threat-eligible';
  const measuredPreferred = measuredPlan.activeCandidate === true;
  const source = measuredPreferred
    ? 'measured-residual-sword-point'
    : anticipatedEligible ? 'predicted-future-sword-point' : 'none';
  return Object.freeze({
    measuredPlan,
    anticipatedPlan,
    anticipatedLeadSeconds,
    anticipatedWithinLead,
    anticipatedEligible,
    anticipatedEligibilityReason,
    measuredPreferred,
    drivePlan: measuredPreferred ? measuredPlan : anticipatedEligible ? anticipatedPlan : measuredPlan,
    driveClosestApproach: measuredPreferred
      ? input.closestApproach
      : anticipatedEligible ? input.anticipatedClosestApproach : input.closestApproach,
    source,
    authority: 'predictive-point-for-pre-contact-posture-only-real-swept-contact-remains-success-authority',
  });
}

function applyWorldDirectionRotation(THREE, bone, currentDirectionInput, targetDirectionInput, maxDegrees) {
  const currentDirection = currentDirectionInput.clone().normalize();
  const targetDirection = targetDirectionInput.clone().normalize();
  if (currentDirection.lengthSq() < 1e-10 || targetDirection.lengthSq() < 1e-10) return 0;
  const desiredWorldDelta = new THREE.Quaternion().setFromUnitVectors(currentDirection, targetDirection);
  const rawAngle = 2 * Math.acos(clamp(desiredWorldDelta.w, -1, 1));
  if (rawAngle < 1e-6) return 0;
  const maxRadians = Math.max(0, finite(maxDegrees)) * Math.PI / 180;
  const appliedAngle = Math.min(rawAngle, maxRadians);
  const limitedWorldDelta = new THREE.Quaternion();
  limitedWorldDelta.slerpQuaternions(
    new THREE.Quaternion(), desiredWorldDelta, appliedAngle / rawAngle,
  );
  const parentWorld = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentWorld);
  const localDelta = parentWorld.clone().invert().multiply(limitedWorldDelta).multiply(parentWorld);
  bone.quaternion.premultiply(localDelta).normalize();
  bone.updateMatrixWorld(true);
  return appliedAngle * 180 / Math.PI;
}

function aimEffectorWithBone(THREE, bone, effectorWorld, targetWorld, maxDegrees) {
  const boneWorld = new THREE.Vector3();
  bone.getWorldPosition(boneWorld);
  return applyWorldDirectionRotation(
    THREE,
    bone,
    effectorWorld.clone().sub(boneWorld),
    targetWorld.clone().sub(boneWorld),
    maxDegrees,
  );
}

function moveToward(current, target, maxStep) {
  const delta = target - current;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

export function createGuardResidualStanceReachRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) {
    throw new Error('G4.3B.5R.3.10 requires THREE.Vector3 + Quaternion');
  }
  const rig = options.rig;
  const buckler = options.buckler;
  const requiredBones = [
    'hips', 'upperleg.l', 'lowerleg.l', 'foot.l',
    'upperleg.r', 'lowerleg.r', 'foot.r',
  ];
  const missing = requiredBones.filter((key) => !rig?.bones?.[key]);
  if (missing.length) throw new Error(`G4.3B.5R.3.10 missing planted-stance bones: ${missing.join(', ')}`);
  if (!buckler?.getWorldParrySurface) throw new Error('G4.3B.5R.3.10 requires Buckler parry surface');

  let crouchMeters = 0;
  let stallSeconds = 0;
  let stanceEngaged = false;
  let engagedTargetCrouchMeters = 0;
  let engagedClosestApproach = null;
  let engagedThreat = null;
  let engagedThreatSource = 'none';
  let engagedLeadSeconds = null;
  let engagedEarlyKneeRecruitment = false;
  let engagedEarlyLowThreatRecruitment = false;
  const effector = new THREE.Vector3();
  const targetCenter = new THREE.Vector3();
  const scratchPoint = new THREE.Vector3();
  const hipPoint = new THREE.Vector3();
  const kneePoint = new THREE.Vector3();
  const anklePoint = new THREE.Vector3();
  const targetDirection = new THREE.Vector3();
  const kneeDirection = new THREE.Vector3();
  const bendPole = new THREE.Vector3();
  const desiredKnee = new THREE.Vector3();
  const rootWorldQuaternion = new THREE.Quaternion();

  function copyClosestApproach(closestApproach) {
    if (!closestApproach?.point) return null;
    return Object.freeze({ point: freezeVector(vec(closestApproach.point)) });
  }

  function clearEngagement() {
    stanceEngaged = false;
    engagedTargetCrouchMeters = 0;
    engagedClosestApproach = null;
    engagedThreat = null;
    engagedThreatSource = 'none';
    engagedLeadSeconds = null;
    engagedEarlyKneeRecruitment = false;
    engagedEarlyLowThreatRecruitment = false;
  }

  function captureFoot(side) {
    const foot = rig.bones[`foot.${side}`];
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    foot.getWorldPosition(position);
    foot.getWorldQuaternion(quaternion);
    return { position, quaternion };
  }

  function captureBodyReference() {
    function pointFor(boneId) {
      const point = new THREE.Vector3();
      rig.bones[boneId].getWorldPosition(point);
      return freezeVector(point);
    }
    return Object.freeze({
      knees: Object.freeze({ l: pointFor('lowerleg.l'), r: pointFor('lowerleg.r') }),
      feet: Object.freeze({ l: pointFor('foot.l'), r: pointFor('foot.r') }),
    });
  }

  function restoreWorldQuaternion(bone, worldQuaternion) {
    const parentWorld = new THREE.Quaternion();
    bone.parent?.getWorldQuaternion(parentWorld);
    bone.quaternion.copy(parentWorld.invert().multiply(worldQuaternion)).normalize();
    bone.updateMatrixWorld(true);
  }

  function plantFoot(side, captured, profile) {
    const upper = rig.bones[`upperleg.${side}`];
    const lower = rig.bones[`lowerleg.${side}`];
    const foot = rig.bones[`foot.${side}`];
    const appliedDegrees = { upper: 0, lower: 0 };
    for (let iteration = 0; iteration < profile.footPlantIterations; iteration += 1) {
      upper.getWorldPosition(hipPoint);
      lower.getWorldPosition(kneePoint);
      foot.getWorldPosition(anklePoint);
      const upperLength = hipPoint.distanceTo(kneePoint);
      const lowerLength = kneePoint.distanceTo(anklePoint);
      targetDirection.copy(captured.position).sub(hipPoint);
      const targetDistance = clamp(
        targetDirection.length(),
        Math.abs(upperLength - lowerLength) + 1e-5,
        Math.max(1e-5, upperLength + lowerLength - 1e-5),
      );
      targetDirection.normalize();

      kneeDirection.copy(kneePoint).sub(hipPoint);
      bendPole.copy(kneeDirection).addScaledVector(
        targetDirection,
        -kneeDirection.dot(targetDirection),
      );
      if (bendPole.lengthSq() < 1e-8) {
        rig.root?.getWorldQuaternion?.(rootWorldQuaternion);
        bendPole.set(0, 0, 1).applyQuaternion(rootWorldQuaternion);
        bendPole.addScaledVector(targetDirection, -bendPole.dot(targetDirection));
      }
      if (bendPole.lengthSq() < 1e-8) {
        bendPole.set(1, 0, 0).addScaledVector(targetDirection, -targetDirection.x);
      }
      bendPole.normalize();
      const along = clamp(
        (upperLength * upperLength - lowerLength * lowerLength + targetDistance * targetDistance)
          / Math.max(1e-6, 2 * targetDistance),
        0,
        upperLength,
      );
      const poleDistance = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
      desiredKnee.copy(hipPoint)
        .addScaledVector(targetDirection, along)
        .addScaledVector(bendPole, poleDistance);

      const upperRemaining = Math.max(0, profile.upperLegPlantMaxDegrees - appliedDegrees.upper);
      appliedDegrees.upper += applyWorldDirectionRotation(
        THREE,
        upper,
        kneePoint.clone().sub(hipPoint),
        desiredKnee.clone().sub(hipPoint),
        upperRemaining,
      );
      rig.root?.updateMatrixWorld?.(true);
      foot.getWorldPosition(effector);
      const lowerRemaining = Math.max(0, profile.lowerLegPlantMaxDegrees - appliedDegrees.lower);
      appliedDegrees.lower += aimEffectorWithBone(
        THREE, lower, effector, captured.position, lowerRemaining,
      );
      rig.root?.updateMatrixWorld?.(true);
    }
    restoreWorldQuaternion(foot, captured.quaternion);
    rig.root?.updateMatrixWorld?.(true);
    foot.getWorldPosition(effector);
    return Object.freeze({
      appliedDegrees: Object.freeze(appliedDegrees),
      driftMeters: effector.distanceTo(captured.position),
    });
  }

  function update(input = {}, deltaSeconds = 1 / 60) {
    const profile = Object.freeze({ ...GUARD_RESIDUAL_STANCE_REACH_PROFILE, ...(input.profile || {}) });
    const mode = String(input.mode || 'off').toLowerCase();
    const dt = Math.max(1e-5, finite(deltaSeconds, 1 / 60));
    const initialSurface = buckler.getWorldParrySurface();
    const bodyReference = captureBodyReference();
    const threatSelection = selectGuardResidualStanceThreatPlan({
      mode,
      closestApproach: input.closestApproach,
      anticipatedClosestApproach: input.anticipatedClosestApproach,
      anticipatedLeadSeconds: input.anticipatedLeadSeconds,
      bucklerSurface: initialSurface,
      armEvidence: input.armEvidence,
      bodyReference,
      profile,
    });
    const initialPlan = threatSelection.drivePlan;
    const driveClosestApproach = threatSelection.driveClosestApproach;

    if (mode === 'parry' && initialPlan.activeCandidate && initialPlan.arm.stalled) {
      stallSeconds += dt;
    } else if (!initialPlan.arm?.saturated) {
      stallSeconds = 0;
    }
    const candidateConfirmed = initialPlan.activeCandidate
      && (initialPlan.earlyLowThreatRecruitment
        || initialPlan.arm.saturated
        || stallSeconds >= profile.stallConfirmSeconds);
    const wasEngaged = stanceEngaged;
    if (mode !== 'parry') {
      clearEngagement();
    } else if (candidateConfirmed) {
      stanceEngaged = true;
      engagedTargetCrouchMeters = Math.max(
        engagedTargetCrouchMeters,
        initialPlan.requestedCrouchMeters,
      );
      engagedClosestApproach = copyClosestApproach(driveClosestApproach);
      engagedThreat = initialPlan.threat;
      engagedThreatSource = threatSelection.source;
      engagedLeadSeconds = threatSelection.source === 'predicted-future-sword-point'
        ? threatSelection.anticipatedLeadSeconds
        : null;
      engagedEarlyKneeRecruitment = engagedEarlyKneeRecruitment
        || initialPlan.earlyKneeRecruitment === true;
      engagedEarlyLowThreatRecruitment = engagedEarlyLowThreatRecruitment
        || initialPlan.earlyLowThreatRecruitment === true;
    }
    const stanceConfirmed = stanceEngaged;
    const stanceHeld = stanceEngaged && !candidateConfirmed;
    const postureClosestApproach = engagedClosestApproach
      || driveClosestApproach
      || input.closestApproach;
    const targetCrouchMeters = stanceEngaged ? engagedTargetCrouchMeters : 0;
    const crouchBeforeMeters = crouchMeters;
    crouchMeters = moveToward(
      crouchMeters,
      targetCrouchMeters,
      (targetCrouchMeters > crouchMeters ? profile.crouchSpeedMps : profile.crouchReturnSpeedMps) * dt,
    );
    crouchMeters = clamp(crouchMeters, 0, profile.maxCrouchMeters);

    const stanceNeedsPlanting = stanceEngaged || crouchMeters > 1e-6;
    const footBefore = stanceNeedsPlanting
      ? { l: captureFoot('l'), r: captureFoot('r') }
      : null;
    const stanceSurfaceBefore = buckler.getWorldParrySurface();
    if (stanceNeedsPlanting) {
      rig.bones.hips.position.y -= crouchMeters;
      rig.root?.updateMatrixWorld?.(true);
    }

    let hipsAppliedDegrees = 0;
    if (stanceConfirmed && postureClosestApproach?.point) {
      const surfaceAfterDrop = buckler.getWorldParrySurface();
      const postDropPlan = planGuardResidualStanceReach({
        mode,
        closestApproach: postureClosestApproach,
        bucklerSurface: surfaceAfterDrop,
        armEvidence: input.armEvidence,
        bodyReference,
        profile,
      });
      if (postDropPlan.metrics?.radialGapMeters > profile.edgeActivationMeters) {
        effector.set(surfaceAfterDrop.center.x, surfaceAfterDrop.center.y, surfaceAfterDrop.center.z);
        targetCenter.copy(effector).add(scratchPoint.set(
          postDropPlan.desiredRadialCorrection.x,
          postDropPlan.desiredRadialCorrection.y,
          postDropPlan.desiredRadialCorrection.z,
        ));
        hipsAppliedDegrees = aimEffectorWithBone(
          THREE, rig.bones.hips, effector, targetCenter, profile.hipsAimMaxDegrees,
        );
        rig.root?.updateMatrixWorld?.(true);
      }
    }

    const footPlant = stanceNeedsPlanting ? {
      l: plantFoot('l', footBefore.l, profile),
      r: plantFoot('r', footBefore.r, profile),
    } : SKIPPED_FOOT_PLANT_PAIR;
    const finalSurface = stanceNeedsPlanting ? buckler.getWorldParrySurface() : stanceSurfaceBefore;
    const achieved = new THREE.Vector3(
      finalSurface.center.x - stanceSurfaceBefore.center.x,
      finalSurface.center.y - stanceSurfaceBefore.center.y,
      finalSurface.center.z - stanceSurfaceBefore.center.z,
    );
    const finalMetrics = input.closestApproach?.point
      ? closestPointMetrics(vec(input.closestApproach.point), normalizeSurface(finalSurface))
      : null;
    const feetPlanted = footPlant.l.driftMeters <= profile.footPlantToleranceMeters
      && footPlant.r.driftMeters <= profile.footPlantToleranceMeters;

    return Object.freeze({
      stage: GUARD_RESIDUAL_STANCE_REACH_STAGE,
      mode,
      active: crouchMeters > 1e-6 || hipsAppliedDegrees > 1e-5,
      initialPlan,
      measuredPlan: threatSelection.measuredPlan,
      anticipatedPlan: threatSelection.anticipatedPlan,
      threatSelection,
      candidateConfirmed,
      stanceConfirmed,
      stanceEngaged,
      stanceHeld,
      justEngaged: stanceEngaged && !wasEngaged,
      stallSeconds,
      armStalled: initialPlan.arm?.stalled === true,
      armSaturated: initialPlan.arm?.saturated === true,
      earlyKneeRecruitment: engagedEarlyKneeRecruitment,
      earlyLowThreatRecruitment: engagedEarlyLowThreatRecruitment,
      activationSource: engagedThreatSource,
      anticipatedLeadSeconds: engagedLeadSeconds,
      engagedTargetCrouchMeters,
      threat: engagedThreat || initialPlan.threat,
      downwardRatio: initialPlan.downwardRatio ?? 0,
      crouchBeforeMeters,
      crouchMeters,
      hipsAppliedDegrees,
      footPlant: Object.freeze(footPlant),
      footPlantSkipped: !stanceNeedsPlanting,
      feetPlanted,
      achievedOffset: freezeVector(achieved),
      achievedDistance: achieved.length(),
      finalMetrics,
      surface: finalSurface,
      rootTranslated: false,
      feetStepped: false,
      authority: 'predicted-or-measured-low-threat-drives-planted-posture-held-until-contact-or-reset-real-swept-contact-remains-success-authority',
    });
  }

  function reset() {
    crouchMeters = 0;
    stallSeconds = 0;
    clearEngagement();
  }

  return Object.freeze({
    update,
    reset,
    get crouchMeters() { return crouchMeters; },
    get stallSeconds() { return stallSeconds; },
  });
}
