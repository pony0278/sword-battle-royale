// R18M.2 — pure compact telemetry builders extracted from the R281 browser lab.
// These helpers deliberately retain scalar review data only; they have no combat authority.

function compactVector(value) {
  if (!value) return null;
  return Object.freeze({
    x: Number(value.x) || 0,
    y: Number(value.y) || 0,
    z: Number(value.z) || 0,
  });
}

function compactGap(value) {
  if (!value) return null;
  return Object.freeze({
    planeGapMeters: value.planeGapMeters ?? null,
    radialGapMeters: value.radialGapMeters ?? null,
    combinedGapMeters: value.combinedGapMeters ?? null,
  });
}

function compactThreat(value) {
  if (!value) return null;
  return Object.freeze({
    zone: value.zone ?? null,
    pointY: value.pointY ?? null,
    shieldBottomY: value.shieldBottomY ?? null,
    kneeLeftY: value.kneeLeftY ?? null,
    kneeRightY: value.kneeRightY ?? null,
    verticalGapBelowShieldMeters: value.verticalGapBelowShieldMeters ?? null,
    kneeLineDistanceMeters: value.kneeLineDistanceMeters ?? null,
    planeNear: value.planeNear === true,
    stronglyDownward: value.stronglyDownward === true,
    belowShield: value.belowShield === true,
    aboveFeet: value.aboveFeet === true,
    kneeLineThreat: value.kneeLineThreat === true,
    lowGuardGapThreat: value.lowGuardGapThreat === true,
  });
}

function compactAnticipatedPlan(value) {
  if (!value) return null;
  return Object.freeze({
    threat: compactThreat(value.threat),
    metrics: compactGap(value.metrics),
    arm: value.arm
      ? Object.freeze({
          attempted: value.arm.attempted === true,
          stalled: value.arm.stalled === true,
          saturated: value.arm.saturated === true,
        })
      : null,
  });
}

export function compactThreatSelection(value) {
  if (!value) return null;
  return Object.freeze({
    source: value.source ?? null,
    anticipatedLeadSeconds: value.anticipatedLeadSeconds ?? null,
    anticipatedEligibilityReason: value.anticipatedEligibilityReason ?? null,
    selectedThreat: compactThreat(value.selectedThreat),
  });
}

function compactBodyReach(value) {
  if (!value) return null;
  return Object.freeze({
    active: value.active === true,
    armExtensionRatio: value.armExtensionRatio ?? null,
    wristAppliedDegrees: value.wristAppliedDegrees ?? null,
    planeGapBeforeMeters: value.planeGapBeforeMeters ?? null,
    planeGapAfterWristMeters: value.planeGapAfterWristMeters ?? null,
    appliedDegrees: value.appliedDegrees
      ? Object.freeze({
          chest: value.appliedDegrees.chest ?? 0,
          spine: value.appliedDegrees.spine ?? 0,
        })
      : null,
    bodyReachOffsetBefore: compactVector(value.bodyReachOffsetBefore),
    bodyReachDistance: value.bodyReachDistance ?? null,
    bodyDirectionDot: value.bodyDirectionDot ?? null,
  });
}

function compactStanceReach(value) {
  if (!value) return null;
  return Object.freeze({
    active: value.active === true,
    stanceHeld: value.stanceHeld === true,
    stanceConfirmed: value.stanceConfirmed === true,
    earlyLowThreatRecruitment: value.earlyLowThreatRecruitment === true,
    armStalled: value.armStalled === true,
    activationSource: value.activationSource ?? null,
    anticipatedLeadSeconds: value.anticipatedLeadSeconds ?? null,
    engagedTargetCrouchMeters: value.engagedTargetCrouchMeters ?? null,
    downwardRatio: value.downwardRatio ?? null,
    crouchBeforeMeters: value.crouchBeforeMeters ?? null,
    crouchMeters: value.crouchMeters ?? null,
    hipsAppliedDegrees: value.hipsAppliedDegrees ?? null,
    feetPlanted: value.feetPlanted ?? null,
    footPlant: value.footPlant
      ? Object.freeze({
          l: Object.freeze({ driftMeters: value.footPlant.l?.driftMeters ?? null }),
          r: Object.freeze({ driftMeters: value.footPlant.r?.driftMeters ?? null }),
        })
      : null,
    threat: compactThreat(value.threat),
    threatSelection: compactThreatSelection(value.threatSelection),
    anticipatedPlan: compactAnticipatedPlan(value.anticipatedPlan),
  });
}

export function compactInterceptDriveTelemetry(value) {
  if (!value) return null;
  return Object.freeze({
    telemetryDetail: 'compact-scalar-frame',
    attackPhase: value.attackPhase ?? null,
    elapsedSeconds: value.elapsedSeconds ?? null,
    timeToContactSeconds: value.timeToContactSeconds ?? null,
    presentationActive: value.presentationActive === true,
    selectionSource: value.selectionSource ?? null,
    drivePlanSource: value.drivePlanSource ?? null,
    fallbackApplied: value.fallbackApplied === true,
    predictedReachable: value.predictedReachable ?? null,
    measuredReachable: value.measuredReachable ?? null,
    measuredInsideAcquisitionBand: value.measuredInsideAcquisitionBand ?? null,
    predictedRequiredDistanceMeters: value.predictedRequiredDistanceMeters ?? null,
    measuredRequiredDistanceMeters: value.measuredRequiredDistanceMeters ?? null,
    measuredRadialContactCorrectionMeters: value.measuredRadialContactCorrectionMeters ?? null,
    measuredContactCorrectionMeters: value.measuredContactCorrectionMeters ?? null,
    planRequiredDistanceMeters: value.planRequiredDistanceMeters ?? null,
    planAppliedDistanceMeters: value.planAppliedDistanceMeters ?? null,
    planReachable: value.planReachable ?? null,
    trackingAchievedDistanceMeters: value.trackingAchievedDistanceMeters ?? null,
    residualCarryBeforeMeters: value.residualCarryBeforeMeters ?? null,
    residualCarryAfterMeters: value.residualCarryAfterMeters ?? null,
    residualEdgeReductionMeters: value.residualEdgeReductionMeters ?? null,
    residualPlaneReductionMeters: value.residualPlaneReductionMeters ?? null,
    bodyEdgeReductionMeters: value.bodyEdgeReductionMeters ?? null,
    bodyPlaneReductionMeters: value.bodyPlaneReductionMeters ?? null,
    stanceEdgeReductionMeters: value.stanceEdgeReductionMeters ?? null,
    stancePlaneReductionMeters: value.stancePlaneReductionMeters ?? null,
    plannedCorrectionMeters: value.plannedCorrectionMeters ?? null,
    shieldStepTranslationMeters: value.shieldStepTranslationMeters ?? null,
    correctionDirectionDot: value.correctionDirectionDot ?? null,
    residualBeforeRefinement: compactGap(value.residualBeforeRefinement),
    residualAfterArmRefinement: compactGap(value.residualAfterArmRefinement),
    residualAfterBodyReach: compactGap(value.residualAfterBodyReach),
    residualAfterRefinement: compactGap(value.residualAfterRefinement),
    residualRefinement: value.residualRefinement
      ? Object.freeze({
          achievedDistance: value.residualRefinement.achievedDistance ?? null,
          directionDot: value.residualRefinement.directionDot ?? null,
        })
      : null,
    residualBodyReach: compactBodyReach(value.residualBodyReach),
    residualStanceReach: compactStanceReach(value.residualStanceReach),
    authority: 'compact-parry-review-telemetry-no-solver-object-graph',
  });
}

export function compactInterceptDriveTraceFrame(value) {
  if (!value) return null;
  const stance = value.residualStanceReach;
  return Object.freeze({
    telemetryDetail: 'compact-scalar-frame',
    attackPhase: value.attackPhase ?? null,
    elapsedSeconds: value.elapsedSeconds ?? null,
    timeToContactSeconds: value.timeToContactSeconds ?? null,
    selectionSource: value.selectionSource ?? null,
    drivePlanSource: value.drivePlanSource ?? null,
    fallbackApplied: value.fallbackApplied === true,
    predictedReachable: value.predictedReachable ?? null,
    measuredReachable: value.measuredReachable ?? null,
    measuredInsideAcquisitionBand: value.measuredInsideAcquisitionBand ?? null,
    planAppliedDistanceMeters: value.planAppliedDistanceMeters ?? null,
    residualAfterArmRefinement: compactGap(value.residualAfterArmRefinement),
    residualAfterBodyReach: compactGap(value.residualAfterBodyReach),
    residualAfterRefinement: compactGap(value.residualAfterRefinement),
    stance: stance
      ? Object.freeze({
          active: stance.active === true,
          held: stance.stanceHeld === true,
          activationSource: stance.activationSource ?? null,
          crouchMeters: stance.crouchMeters ?? null,
          feetPlanted: stance.feetPlanted ?? null,
        })
      : null,
  });
}

function compactPredictiveThreat(value) {
  if (!value) return null;
  return Object.freeze({
    worldPoint: compactVector(value.worldPoint),
    signedDistance: value.signedDistance ?? null,
    radialDistance: value.radialDistance ?? null,
    outsideDisc: value.outsideDisc ?? null,
    futureSeconds: value.futureSeconds ?? null,
    bladeFraction: value.bladeFraction ?? null,
    source: value.source ?? null,
  });
}

function compactTrackingPlan(value) {
  if (!value) return null;
  return Object.freeze({
    mode: value.mode ?? null,
    reachable: value.reachable ?? null,
    requiredDistance: value.requiredDistance ?? null,
    appliedDistance: value.appliedDistance ?? null,
    correction: compactVector(value.correction),
    reason: value.reason ?? null,
  });
}

export function compactPredictiveAnalysis(value) {
  if (!value) return null;
  return Object.freeze({
    stage: value.stage ?? null,
    rhythmStage: value.rhythmStage ?? null,
    available: value.available === true,
    reason: value.reason ?? null,
    geometryReason: value.geometryReason ?? null,
    requestedGrade: value.requestedGrade ?? null,
    timingGrade: value.timingGrade ?? null,
    timeToContactSeconds: value.timeToContactSeconds ?? null,
    predictedTimeToContactSeconds: value.predictedTimeToContactSeconds ?? null,
    triggerTtcSeconds: value.triggerTtcSeconds ?? null,
    planeCapturable: value.planeCapturable ?? null,
    interceptable: value.interceptable ?? null,
    shouldTrigger: value.shouldTrigger ?? null,
    threat: compactPredictiveThreat(value.threat),
    trackingPlan: compactTrackingPlan(value.trackingPlan),
    authority: value.authority ?? null,
  });
}

export function compactParryGateAttempt(value) {
  if (!value) return null;
  return Object.freeze({
    stage: value.stage ?? null,
    accepted: value.accepted === true,
    reason: value.reason ?? null,
    sequence: value.sequence ?? null,
    source: value.source ?? value.input?.source ?? null,
    timeToContactSeconds: value.timeToContactSeconds ?? null,
    requiredShieldTravelMeters: value.requiredShieldTravelMeters ?? null,
    predictedPlaneDistanceMeters: value.predictedPlaneDistanceMeters ?? null,
    gates: value.gates
      ? Object.freeze({
          attackCommitted: value.gates.attackCommitted ?? null,
          timingInsideWindow: value.gates.timingInsideWindow ?? null,
          trackingClamped: value.gates.trackingClamped ?? null,
          geometryGuidanceAvailable: value.gates.geometryGuidanceAvailable ?? null,
          geometryGuidanceCanVetoInput: value.gates.geometryGuidanceCanVetoInput ?? null,
          realSweptContact: value.gates.realSweptContact ?? null,
        })
      : null,
  });
}

export function compactReachableInterceptTarget(value) {
  if (!value) return null;
  return Object.freeze({
    stage: value.stage ?? null,
    source: value.source ?? null,
    reason: value.reason ?? null,
    fallbackApplied: value.fallbackApplied === true,
    predictedReachable: value.predictedReachable ?? null,
    measuredReachable: value.measuredReachable ?? null,
    measuredInsideAcquisitionBand: value.measuredInsideAcquisitionBand ?? null,
    predictedRequiredDistanceMeters: value.predictedRequiredDistanceMeters ?? null,
    measuredRequiredDistanceMeters: value.measuredRequiredDistanceMeters ?? null,
    measuredRadialContactCorrectionMeters: value.measuredRadialContactCorrectionMeters ?? null,
    measuredContactCorrectionMeters: value.measuredContactCorrectionMeters ?? null,
    threat: compactPredictiveThreat(value.threat),
    trackingPlan: compactTrackingPlan(value.trackingPlan),
    authority: value.authority ?? null,
  });
}

export function compactLiveContactConstraint(value) {
  if (!value) return null;
  const clearance = value.attackLineClearance;
  const assessment = value.inspectionAssessment;
  return Object.freeze({
    accepted: value.accepted === true,
    active: value.active === true,
    holding: value.holding === true,
    complete: value.complete === true,
    inspectionPassed: value.inspectionPassed === true,
    phase: value.phase ?? null,
    stage: value.stage ?? null,
    elapsedMs: value.elapsedMs ?? null,
    terminalReason: value.terminalReason ?? null,
    targetContactPoint: compactVector(value.targetContactPoint),
    actualContactPoint: compactVector(value.actualContactPoint),
    actualContactOffset: compactVector(value.actualContactOffset),
    actualHandOffset: compactVector(value.actualHandOffset),
    actualGripOffset: compactVector(value.actualGripOffset),
    peakTargetTravelMeters: value.peakTargetTravelMeters ?? null,
    peakOfflineTravelMeters: value.peakOfflineTravelMeters ?? null,
    actualContactTravelMeters: value.actualContactTravelMeters ?? null,
    actualHandTravelMeters: value.actualHandTravelMeters ?? null,
    actualGripTravelMeters: value.actualGripTravelMeters ?? null,
    liveContactErrorMeters: value.liveContactErrorMeters ?? null,
    directionAgreement: value.directionAgreement ?? null,
    appliedUpperarmCorrectionDegrees: value.appliedUpperarmCorrectionDegrees ?? null,
    appliedForearmDegrees: value.appliedForearmDegrees ?? null,
    appliedWristDegrees: value.appliedWristDegrees ?? null,
    residualCorrectionPasses: value.residualCorrectionPasses ?? 0,
    appliedResidualForearmDegrees: value.appliedResidualForearmDegrees ?? 0,
    appliedResidualWristDegrees: value.appliedResidualWristDegrees ?? 0,
    residualHiltCorrection: value.residualHiltCorrection
      ? Object.freeze({
          accepted: value.residualHiltCorrection.accepted === true,
          correctionRequired: value.residualHiltCorrection.correctionRequired === true,
          reason: value.residualHiltCorrection.reason ?? null,
          currentOfflineTravelMeters:
            value.residualHiltCorrection.currentOfflineTravelMeters ?? null,
          targetOfflineTravelMeters:
            value.residualHiltCorrection.targetOfflineTravelMeters ?? null,
          appliedDegrees: value.residualHiltCorrection.appliedDegrees ?? 0,
        })
      : null,
    attackLineClearance: clearance
      ? Object.freeze({
          pass: clearance.pass === true,
          swordAxisClearanceDegrees: clearance.swordAxisClearanceDegrees ?? null,
          hiltOfflineTravelMeters: clearance.hiltOfflineTravelMeters ?? null,
          wristGripClearanceDegrees: clearance.wristGripClearanceDegrees ?? null,
        })
      : null,
    inspectionAssessment: assessment
      ? Object.freeze({
          pass: assessment.pass === true,
          holding: assessment.holding === true,
          gates: assessment.gates,
          failedGateKeys: assessment.failedGateKeys,
          failedGateCount: assessment.failedGateCount,
          terminalReason: assessment.terminalReason,
          terminalIsExpectedHold: assessment.terminalIsExpectedHold,
        })
      : null,
    modifiedBones: value.modifiedBones ?? null,
    propagatedBones: value.propagatedBones ?? null,
    proximalAssistBone: value.proximalAssistBone ?? null,
    assistBone: value.assistBone ?? null,
    proximalArmCorrectionActive: value.proximalArmCorrectionActive === true,
    elbowPropagationActive: value.elbowPropagationActive === true,
    shoulderPropagationActive: value.shoulderPropagationActive === true,
    rigidSwordGrip: value.rigidSwordGrip === true,
    b3BodyClockCanAdvance: value.b3BodyClockCanAdvance === true,
    weaponArmContactConstrained: value.weaponArmContactConstrained === true,
    reactionIntentAppliedBeforeConstraint: value.reactionIntentAppliedBeforeConstraint === true,
    constraintApplicationOrder: value.constraintApplicationOrder ?? null,
    authority: 'compact-live-contact-gate-telemetry',
  });
}
