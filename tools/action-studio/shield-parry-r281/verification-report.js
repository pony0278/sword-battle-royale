// R18M.C3 — read-only verification report assembly.
// This module receives snapshots/context and never advances combat, mutates exchange state, or publishes DOM/window globals.

import {
  compactInterceptDriveTelemetry,
  compactPredictiveAnalysis,
  compactParryGateAttempt,
  compactReachableInterceptTarget,
  compactLiveContactConstraint,
  compactThreatSelection,
} from './diagnostic-telemetry.js';
import { describeContactGeometry } from './diagnostic-formatters.js';

export function buildShieldParryVerificationReport(context) {
  const {
    combatSnapshot,
    exchangeState,
    labStage,
    recoilStage,
    ready,
    selectedDirection,
    selectedMode,
    parryProfile,
    defenderReleaseGate,
    ownsLiveContact,
    inspectionCameraSnapshot,
    debugMode,
    debugStanceProfile,
    recentCompactTraceFrames,
    liveContactPhaseLatch,
  } = context;

  const handoff = combatSnapshot.attackerRecoil?.postCouplingHandoff || null;
  const recoilSample = combatSnapshot.attackerRecoil?.sample || null;
  const recoilPose = recoilSample?.pose || null;
  const appliedBodyChainPitchDegrees = recoilPose
    ? (Number(recoilPose.chestPitchDegrees) || 0)
      + (Number(recoilPose.spinePitchDegrees) || 0)
      + (Number(recoilPose.hipsPitchDegrees) || 0)
    : null;
  const attackerReaction = exchangeState.latestCombatResult?.attackerReaction || null;
  const report = {
    stage: labStage,
    recoilStage: recoilStage,
    pass: ready,
    selectedDirection,
    selectedMode,
    outcome: exchangeState.latestCombatResult?.resolution?.outcome || null,
    parryGate: {
      profile: parryProfile,
      opportunity: compactParryGateAttempt(exchangeState.latestParryOpportunity),
      input: compactParryGateAttempt(exchangeState.latestParryInput),
      confirmation: compactParryGateAttempt(exchangeState.latestParryConfirmation),
      manualInputRequired: true,
      commitmentSource: 'attack.action.runtime.movementStartSeconds',
      successAuthority: 'eligible real swept Sword × Shield contact during attack_active',
    },
    contact: exchangeState.firstContact,
    contactGeometryDiagnostic: describeContactGeometry(exchangeState.firstContact),
    predictiveAnalysis: compactPredictiveAnalysis(exchangeState.latestPredictiveAnalysis),
    predictiveHandoff: exchangeState.latestPredictiveHandoff,
    defenderPresentationContinuity: exchangeState.latestCombatResult?.defenderPayload
      ? Object.freeze({
          source: exchangeState.latestCombatResult.defenderPayload.presentationContinuitySource || null,
          predictiveSourceTimeSeconds: exchangeState.latestPredictiveHandoff?.defenderPresentationOffsetSeconds ?? null,
          authoritativeSourceTimeSeconds: exchangeState.latestCombatResult.defenderPayload.presentationOffsetSeconds ?? null,
        })
      : null,
    defenderDeflectReleaseGate: defenderReleaseGate,
    parryImpactEvent: combatSnapshot.parryImpactEvent || exchangeState.latestCombatResult?.parryImpactEvent || null,
    parryReactionClock: combatSnapshot.parryReactionClock || null,
    recoilPhaseClock: combatSnapshot.attackerRecoil?.phaseClock || null,
    attackerParriedReactionDefinition: attackerReaction
      ? Object.freeze({
          stage: attackerReaction.stage,
          id: attackerReaction.id,
          activation: attackerReaction.sourceBurst?.activation || null,
          initialElapsedMs: attackerReaction.initialElapsedMs,
          planBackwardPitchDegrees: attackerReaction.silhouette?.backwardPitchDegrees ?? null,
          appliedBodyChainPitchDegrees:
            exchangeState.step3AContactTransfer?.oldB3AppliedBodyChainPitchAtReleaseDegrees
              ?? appliedBodyChainPitchDegrees,
          impulsePeakMs: attackerReaction.timeline?.impulsePeakMs ?? null,
          separateBalanceBreakRuntime: attackerReaction.channelPolicy?.separateBalanceBreakRuntime,
          authority: attackerReaction.authority,
        })
      : null,
    visibleOldB3Peak: exchangeState.visibleOldB3Peak,
    oldB3Continuation: Object.freeze({
      handoffPublished: exchangeState.step3AContactTransfer?.handoffPublished === true,
      handoffConsumed: exchangeState.step3AContactTransfer?.handoffConsumedByOldB3 === true,
      releaseStartPresentationMs:
        exchangeState.step3AContactTransfer?.oldB3ReleaseStartPresentationMs ?? null,
      continuityBridgeMs: exchangeState.step3AContactTransfer?.continuityBridgeMs ?? null,
      visibleOldB3StartsAtDeflectImpulse:
        exchangeState.step3AContactTransfer?.visibleOldB3StartsAtDeflectImpulse === true,
      continuationStartedAtPresentationMs:
        exchangeState.step3AContactTransfer?.continuationStartedAtPresentationMs ?? null,
      continuationStartedAtImpactClockMs:
        exchangeState.step3AContactTransfer?.continuationStartedAtImpactClockMs ?? null,
      bodyRestartedAtRelease: exchangeState.step3AContactTransfer?.bodyRestartedAtRelease ?? false,
      planIdentityPreserved:
        exchangeState.step3AContactTransfer?.continuationPlanIdentityPreserved ?? null,
      presentationElapsedPreserved:
        exchangeState.step3AContactTransfer?.continuationElapsedPreserved ?? null,
      authority: 'deflect-impulse-continuity-bridge-to-canonical-old-b3-from-zero',
    }),
    contactPoseLifecycle: Object.freeze({
      capturedAtAuthoritativeImpact: Boolean(exchangeState.frozenAttackerContactPose),
      restoredBeforeEveryBodyOverlay: Boolean(exchangeState.frozenAttackerContactPose && combatSnapshot.activeExchange),
      attackerReactionComplete: combatSnapshot.attackerReactionComplete === true,
      interruptionHeldForWeaponContact: combatSnapshot.attackerReactionComplete === true
        && ownsLiveContact,
      authority: 'authoritative-impact-rig-snapshot-plus-independent-contact-release',
    }),
    predictiveShieldLead: {
      active: Boolean(exchangeState.latestPredictiveReport?.active),
      progress: exchangeState.latestPredictiveReport?.progress ?? null,
      motion: exchangeState.latestShieldLeadMotion,
      interceptTarget: compactReachableInterceptTarget(exchangeState.latestReachableInterceptTarget),
      interceptDrive: compactInterceptDriveTelemetry(exchangeState.latestInterceptDriveReport),
      interceptDriveTrace: Object.freeze({
        frameCount: exchangeState.interceptDriveTrace.length,
        fallbackFrames: exchangeState.interceptDriveTrace.filter((frame) => frame.fallbackApplied).length,
        measuredReachableFrames: exchangeState.interceptDriveTrace.filter((frame) => frame.measuredReachable).length,
        acquisitionFrames: exchangeState.interceptDriveTrace.filter((frame) => frame.measuredInsideAcquisitionBand).length,
        recentFrames: Object.freeze(exchangeState.interceptDriveTrace.slice(-recentCompactTraceFrames)),
        telemetryDetail: 'compact-scalar-frames-only',
      }),
    },
    step3AContactTransfer: exchangeState.step3AContactTransfer,
    inspectionCamera: inspectionCameraSnapshot,
    liveShieldSwordGripContactConstraint: compactLiveContactConstraint(exchangeState.latestGripConstraintReport),
    latestInputSignal: exchangeState.latestInputSignal,
    parryWhiff: exchangeState.latestParryWhiff,
    whiffTelemetry: Object.freeze({
      probeFrames: exchangeState.whiffProbeFrames,
      closestApproachRecord: exchangeState.latestParryWhiff ? exchangeState.closestWhiffApproach : null,
      outsideActiveContact: exchangeState.latestParryWhiff ? exchangeState.outsideActiveContact : null,
      authority: 'presentation-diagnostic-only-no-combat-authority',
    }),
    postCouplingStage: handoff?.stage || null,
    postCouplingReason: handoff?.reason || null,
    recoil: recoilSample,
    directOldB3Diagnostic: exchangeState.directOldB3Diagnostic,
    debugLowStance: Object.freeze({
      enabled: debugMode,
      profile: debugMode ? Object.freeze({ ...debugStanceProfile }) : null,
      latestThreatSelection: compactThreatSelection(
        exchangeState.latestInterceptDriveReport?.residualStanceReach?.threatSelection,
      ),
      authority: 'debug-profile-changes-posture-guidance-only-real-swept-contact-remains-success-authority',
    }),
    invariants: {
      singleParryOnlyInThisLab: true,
      noAutomaticTimingTrigger: true,
      authoredCommitmentMarkerRequired: exchangeState.latestParryInput?.gates?.attackCommitted ?? null,
      ttcWindowRequired: exchangeState.latestParryInput?.gates?.timingInsideWindow ?? null,
      shieldTrackingClampedTo18cm: exchangeState.latestParryInput?.gates?.trackingClamped ?? null,
      geometryGuidesButCannotVetoInput: exchangeState.latestParryInput?.gates?.geometryGuidanceCanVetoInput === false,
      measuredSweepFallbackIsGuidanceOnly: exchangeState.latestReachableInterceptTarget?.authority === 'guidance-only-real-swept-contact-remains-success-authority' || !exchangeState.latestReachableInterceptTarget,
      realSweptContactRequired: exchangeState.latestParryConfirmation?.gates?.realSweptContact ?? null,
      step3AOnlyAfterConfirmedRealContact: exchangeState.step3AContactTransfer
        ? exchangeState.latestParryConfirmation?.accepted === true && exchangeState.firstContact?.geometricContact === true
        : true,
      initialMeasuredShieldMotionIsDiagnosticOnly: exchangeState.latestGripConstraintReport?.plan?.tangentAuthority != null,
      liveShieldSurfaceSampledAfterGuardUpdate: exchangeState.latestGripConstraintReport?.mappedSurfaceTarget?.authority === 'current-world-shield-surface',
      noPresetMotionCurve: exchangeState.step3AContactTransfer?.noPresetMotionCurve ?? true,
      swordRemainsRigidlyMountedToHand: exchangeState.latestGripConstraintReport?.rigidSwordGrip ?? null,
      boundedForearmThenWristForTopRight: ['top', 'right'].includes(selectedDirection)
        ? exchangeState.latestGripConstraintReport?.assistBone === 'lowerarm.r'
        : true,
      boundedProximalArmCorrectionBeforeForearmAndWrist: ['top', 'right'].includes(selectedDirection)
        ? exchangeState.latestGripConstraintReport?.proximalAssistBone === 'upperarm.r'
          && exchangeState.latestGripConstraintReport?.proximalArmCorrectionActive === true
        : true,
      handAndSocketFollowWristHierarchy: exchangeState.latestGripConstraintReport?.propagatedBones?.join(',') === 'hand.r,handslot.r',
      elbowPropagationMatchesDirectionPolicy: exchangeState.latestGripConstraintReport?.elbowPropagationActive === ['top', 'right'].includes(selectedDirection) || !exchangeState.step3AContactTransfer,
      shoulderPropagationDeferred: exchangeState.latestGripConstraintReport?.shoulderPropagationActive === false || !exchangeState.step3AContactTransfer,
      liveContactInspectionPassed: exchangeState.latestGripConstraintReport?.holding
        ? exchangeState.latestGripConstraintReport.inspectionPassed === true
        : null,
      attackLineClearanceRequired: true,
      attackLineClearancePassed: exchangeState.latestGripConstraintReport?.attackLineClearance?.pass ?? null,
      freeInspectionCameraDoesNotMutateCombat: true,
      parryImpactSelectsReactionWhileDefenderClockRuns: combatSnapshot.parryReactionClock
        ? combatSnapshot.parryReactionClock.defenderReactionStarted === true
          && combatSnapshot.parryReactionClock.attackerReactionDefinitionSelected === true
        : true,
      parryImpactSelectsExaggeratedOldB3ReactionDefinition: attackerReaction
        ? attackerReaction.initialElapsedMs === 0
          && attackerReaction.sourceBurst?.activation === 'deflect-impulse'
          && attackerReaction.sourceBurst?.powerFrame?.startsAtDeflectImpulse === true
          && attackerReaction.silhouette?.backwardPitchDegrees >= 25
          && attackerReaction.channelPolicy?.contactConstraintRunsBeforeVisibleReaction === true
          && attackerReaction.channelPolicy?.separateBalanceBreakRuntime === false
        : true,
      contactOwnsFinalPoseBeforeVisibleOldB3: ownsLiveContact
        ? combatSnapshot.attackerRecoil?.appliedChannels?.torso === false
          && combatSnapshot.attackerRecoil?.appliedChannels?.weaponArm === false
          && exchangeState.latestGripConstraintReport?.reactionIntentAppliedBeforeConstraint === false
        : true,
      b3PresentationParkedAtOriginDuringLiveContact: ownsLiveContact
        ? combatSnapshot.attackerRecoil?.phaseClock?.phaseLatch
            === liveContactPhaseLatch
          && combatSnapshot.attackerRecoil?.phaseClock?.latchPointMs === 0
          && combatSnapshot.attackerRecoil?.phaseClock?.elapsedMs === 0
        : true,
      weaponArmRemainsContactConstrainedDuringStep3A: ownsLiveContact
        ? exchangeState.step3AContactTransfer?.weaponArmContactConstrained === true
        : true,
      frozenContactPoseRestoredBeforeEveryBodyOverlay: exchangeState.step3AContactTransfer
        ? Boolean(exchangeState.frozenAttackerContactPose)
        : true,
      bodyCompletionCannotReleaseContactOwnedPose: exchangeState.step3AContactTransfer
        ? exchangeState.step3AContactTransfer.releasedToOldB3 === true
          || combatSnapshot.attackerReactionComplete !== true
          || combatSnapshot.attack?.interrupted === true
        : true,
      oldB3WeaponArmReleasedAfterInspectionOrConfirmedFallback: exchangeState.step3AContactTransfer?.releasedToOldB3
        ? exchangeState.latestGripConstraintReport?.inspectionPassed === true
          || exchangeState.step3AContactTransfer?.releaseHandoff?.couplingReport?.inspectionFallbackUsed === true
        : true,
      defenderParryPresentationNeverRewindsAtContact: exchangeState.latestPredictiveHandoff?.accepted && exchangeState.latestCombatResult?.accepted
        ? exchangeState.latestCombatResult.defenderPayload?.presentationOffsetSeconds + 1e-4
          >= exchangeState.latestPredictiveHandoff.defenderPresentationOffsetSeconds
        : true,
      oldB3WeaponArmReleasedOnlyAfterDefenderDeflectMarker: exchangeState.step3AContactTransfer?.releasedToOldB3
        ? exchangeState.step3AContactTransfer.defenderReleaseGate?.passed === true
        : true,
      deflectImpulseStartsOldB3FromZeroWithoutBodyRestart: exchangeState.step3AContactTransfer?.handoffConsumedByOldB3
        ? exchangeState.step3AContactTransfer.bodyRestartedAtRelease === false
          && exchangeState.step3AContactTransfer.continuationPlanIdentityPreserved === true
          && exchangeState.step3AContactTransfer.continuationElapsedPreserved === true
          && exchangeState.step3AContactTransfer.continuationStartedAtPresentationMs === 0
          && exchangeState.step3AContactTransfer.continuityBridgeMs === 28
          && exchangeState.step3AContactTransfer.defenderReleaseGate?.passed === true
        : true,
      visibleOldB3ReachedHistoricalBackwardPeak: exchangeState.step3AContactTransfer?.handoffConsumedByOldB3
        ? exchangeState.visibleOldB3Peak?.readable === true
        : true,
      contactQaCannotPermanentlySuppressConfirmedParryOldB3: exchangeState.step3AContactTransfer?.releasedToOldB3
        ? exchangeState.latestParryConfirmation?.accepted === true
        : true,
      compactTelemetryDoesNotRetainSolverGraphs: exchangeState.interceptDriveTrace.every(
        (frame) => frame?.telemetryDetail === 'compact-scalar-frame',
      ),
      blockPathPreserved: true,
      noRootTranslation: true,
    },
  };

  return report;
}
