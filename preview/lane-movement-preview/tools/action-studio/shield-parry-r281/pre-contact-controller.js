import { createVisualOwnershipRuntimeTaps } from './visual-ownership-runtime-taps.js';
import { createBoundedShieldArmAdditiveRuntime } from '../../../src/combat/predictive-parry-arm-additive.js';
import {
  analyzeTopDirectionCompatibilityProbe,
  normalizeTopDirectionCompatibilityVariant,
  shouldRetainTopDirectionAdditive,
} from '../../../src/combat/parry-top-direction-compatibility-probe.js';
import { createTopPrepReadabilityHoldRuntime } from '../../../src/combat/parry-top-prep-readability-hold.js';
import { createGuardCoverageDirector } from '../../../src/combat/guard-coverage-director.js';
import { createParryInterceptDirector } from '../../../src/combat/parry-intercept-director.js';

const TOP_DIRECTION_PROBE_ARM_BONES = Object.freeze(['upperarm.l', 'lowerarm.l']);

function captureTopDirectionProbeArmPose(rig) {
  const bones = rig?.bones || {};
  return Object.freeze(Object.fromEntries(
    TOP_DIRECTION_PROBE_ARM_BONES
      .filter((boneId) => bones[boneId]?.quaternion?.clone)
      .map((boneId) => [boneId, bones[boneId].quaternion.clone().normalize()]),
  ));
}

function restoreTopDirectionProbeArmPose(rig, pose) {
  const bones = rig?.bones || {};
  for (const [boneId, saved] of Object.entries(pose || {})) {
    const quaternion = bones[boneId]?.quaternion;
    if (!quaternion?.copy) continue;
    quaternion.copy(saved).normalize();
  }
}

export function createShieldParryPreContactController({
  exchangeState,
  buckler,
  defender,
  camera,
  bracingRuntime,
  fineTrackingRuntime,
  residualBodyReachRuntime,
  residualStanceReachRuntime,
  predictivePresentation,
  activeInterceptIntent,
  parryGate,
  longswordAttackPhases,
  promptHoldMs,
  debugMode,
  readContext,
  services,
}) {
  const LONGSWORD_ATTACK_PHASES = longswordAttackPhases;
  const PARRY_PROMPT_HOLD_MS = promptHoldMs;
  const visualOwnership = createVisualOwnershipRuntimeTaps({ rig: defender.rig, exchangeState });
  const shieldArmAdditiveRuntime = createBoundedShieldArmAdditiveRuntime();
  const topPrepReadabilityHoldRuntime = createTopPrepReadabilityHoldRuntime();
  // Everything about which coverage pass runs when, and what each one may look at, lives in the
  // director. This controller supplies the lab's live shield and publishes what came back.
  // The reach ladder - aim, arm, body, stance, and the final closure - is the director's. Each
  // stage announces itself as it writes, so the lab's ownership taps can snapshot the rig at the
  // instant that stage owned it.
  const parryInterceptDirector = createParryInterceptDirector({
    trackingRuntime: fineTrackingRuntime,
    bodyReachRuntime: residualBodyReachRuntime,
    stanceRuntime: residualStanceReachRuntime,
    readShieldSurface: () => buckler.getWorldParrySurface(),
    observe: {
      primaryArm: (report) => visualOwnership.afterPrimaryArm(report),
      residualArm: (report) => visualOwnership.afterResidualArm(report),
      body: (report) => visualOwnership.afterBody(report),
      stance: (report) => visualOwnership.afterStance(report),
    },
  });
  const guardCoverageDirector = createGuardCoverageDirector({
    trackingRuntime: fineTrackingRuntime,
    stanceRuntime: residualStanceReachRuntime,
    readShieldSurface: () => buckler.getWorldParrySurface(),
  });
  const topDirectionProbeQuery = typeof globalThis.location?.search === 'string'
    ? new URLSearchParams(globalThis.location.search).get('topProbe')
    : null;
  const topDirectionProbeVariant = normalizeTopDirectionCompatibilityVariant(topDirectionProbeQuery);
  const {
    cloneSurface,
    magnitude,
    planArticulatedImpactBracing,
    planFineGuardTracking,
    analyzePredictiveInterceptParry,
    evaluateCommittedParryInput,
    measureSweptSwordBucklerClosestApproach,
    planGuardThreatCorrection,
    sampleActiveShieldLeadMotion,
    compactInterceptDriveTraceFrame,
    compactInterceptDriveTelemetry,
  } = services;

  function zeroBracePlan() { return planArticulatedImpactBracing({ mode: 'off' }); }

  function updateBlockPreContact(snapshot, currentBlade, deltaSeconds, context) {
    const { previousBlade, defenderSword } = context;
    const baselineSurface = buckler.getWorldParrySurface();
    const bracePlan = previousBlade && snapshot.phase !== LONGSWORD_ATTACK_PHASES.INTERRUPTED
      ? planArticulatedImpactBracing({
          mode: 'brace-fine', attackDirection: snapshot.direction,
          previousBlade, currentBlade, bucklerSurface: baselineSurface, deltaSeconds,
        })
      : zeroBracePlan();
    bracingRuntime.update(bracePlan, deltaSeconds);
    const coverage = guardCoverageDirector.update({
      sequence: snapshot.sequence,
      direction: snapshot.direction,
      committed: snapshot.phase !== LONGSWORD_ATTACK_PHASES.INTERRUPTED,
      previousBlade,
      currentBlade,
      deltaSeconds,
    });
    exchangeState.latestFinePlan = coverage.plan;
    exchangeState.latestFineTracking = coverage.tracking;
    exchangeState.latestGuardResidual = coverage.residual;
    exchangeState.latestGuardStanceReach = coverage.stanceReach;
    exchangeState.latestGuardCoverage = coverage.coverage;
    defender.update(0, camera); defenderSword?.update();
    exchangeState.previousShieldLeadSurface = cloneSurface(buckler.getWorldParrySurface());
  }

  function updateParryPreContact(snapshot, currentBlade, deltaSeconds, context) {
    const {
      selectedMode,
      slowReviewChecked,
      previousBlade,
      defenderSword,
      debugStanceProfile,
    } = context;
    if (exchangeState.parryPromptHold?.sequence === snapshot.sequence && !parryGate.attempt) {
      exchangeState.latestPredictiveAnalysis = exchangeState.parryPromptHold.predictiveAnalysis;
      exchangeState.latestParryOpportunity = exchangeState.parryPromptHold.opportunity;
      exchangeState.previousShieldLeadSurface = cloneSurface(buckler.getWorldParrySurface());
      return;
    }
    const beforeSurface = cloneSurface(buckler.getWorldParrySurface());
    exchangeState.latestPredictiveAnalysis = analyzePredictiveInterceptParry({
      attackSnapshot: snapshot,
      previousBlade,
      currentBlade,
      bucklerSurface: beforeSurface,
      deltaSeconds,
      requestedGrade: selectedMode,
    });
    exchangeState.latestParryOpportunity = evaluateCommittedParryInput({
      attackSnapshot: snapshot,
      predictiveAnalysis: exchangeState.latestPredictiveAnalysis,
      manual: false,
      profile: parryGate.profile,
    });
    if (slowReviewChecked
      && exchangeState.latestParryOpportunity.accepted
      && exchangeState.parryPromptHoldSequence !== snapshot.sequence) {
      exchangeState.parryPromptHoldSequence = snapshot.sequence;
      exchangeState.parryPromptHold = {
        sequence: snapshot.sequence,
        remainingRealMs: PARRY_PROMPT_HOLD_MS,
        opportunity: exchangeState.latestParryOpportunity,
        predictiveAnalysis: exchangeState.latestPredictiveAnalysis,
      };
    }

    if (predictivePresentation.active) {
      exchangeState.latestPredictiveReport = predictivePresentation.update({
        deltaSeconds,
        timeToContactSeconds: exchangeState.latestPredictiveAnalysis?.timeToContactSeconds,
        preserveShieldArm: Boolean(activeInterceptIntent?.active),
        camera,
      });
      visualOwnership.afterPredictive(exchangeState.latestPredictiveReport);
      const predictiveSurface = cloneSurface(buckler.getWorldParrySurface());
      const activeIntentPlan = activeInterceptIntent?.plan({
        sequence: snapshot.sequence,
        bucklerSurface: predictiveSurface,
      }) || null;
      const activeIntent = activeIntentPlan
        ? { plan: activeIntentPlan, targetCenter: activeInterceptIntent?.report?.targetCenter }
        : null;
      const reached = parryInterceptDirector.reach({
        previousBlade,
        currentBlade,
        deltaSeconds,
        continuitySurface: exchangeState.previousShieldLeadSurface
          ? cloneSurface(exchangeState.previousShieldLeadSurface)
          : predictiveSurface,
        predictiveAnalysis: exchangeState.latestPredictiveAnalysis,
        activeIntent,
        stanceProfile: debugMode ? debugStanceProfile : null,
      });
      const measuredClosestApproach = reached.measuredClosestApproach;
      exchangeState.latestReachableInterceptTarget = reached.interceptTarget;
      exchangeState.latestFinePlan = reached.plan;
      exchangeState.latestFineTracking = reached.tracking;
      const {
        residualCarryBeforeMeters, residualBeforeRefinement,
        residualInterceptTarget, residualTrackingPlan, residualRefinement,
        residualAfterArmRefinement, bodyReach: residualBodyReach,
        residualAfterBodyReach, stanceReach: residualStanceReach,
      } = reached;
      const topDirectionProbeActive = Boolean(topDirectionProbeVariant)
        && snapshot.direction === 'top'
        && Boolean(activeIntentPlan);
      const topDirectionProbeBeforeSurface = topDirectionProbeActive
        ? cloneSurface(buckler.getWorldParrySurface())
        : null;
      const topDirectionProbeArmPose = topDirectionProbeActive && topDirectionProbeVariant === 'C'
        ? captureTopDirectionProbeArmPose(defender.rig)
        : null;
      const shieldArmBoundedAdditive = shieldArmAdditiveRuntime.update({
        rig: defender.rig,
        authoredDelta: exchangeState.latestPredictiveReport?.shieldArmAuthoredDelta,
        sequence: snapshot.sequence,
        enabled: Boolean(activeIntentPlan)
          && !(topDirectionProbeActive && topDirectionProbeVariant === 'A'),
      });
      let topDirectionCompatibilityProbe = null;
      if (topDirectionProbeActive) {
        // getWorldParrySurface() updates the parry anchor and its parents, so the probe can
        // measure the authored arm displacement without an extra full defender presentation rebuild.
        const probeAfterAdditiveSurface = cloneSurface(buckler.getWorldParrySurface());
        const baseProbe = analyzeTopDirectionCompatibilityProbe({
          direction: snapshot.direction,
          variant: topDirectionProbeVariant,
          beforeCenter: topDirectionProbeBeforeSurface.center,
          afterCenter: probeAfterAdditiveSurface.center,
          targetCenter: activeInterceptIntent?.report?.targetCenter || null,
          additiveApplied: shieldArmBoundedAdditive?.applied === true,
        });
        let retained = true;
        let appliedBehavior = topDirectionProbeVariant === 'A'
          ? 'solver-only-baseline'
          : 'generic-bounded-additive';
        if (topDirectionProbeVariant === 'C' && !shouldRetainTopDirectionAdditive(baseProbe)) {
          restoreTopDirectionProbeArmPose(defender.rig, topDirectionProbeArmPose);
          retained = false;
          appliedBehavior = 'direction-incompatible-additive-rejected';
        } else if (topDirectionProbeVariant === 'C') {
          appliedBehavior = 'direction-compatible-additive-retained';
        }
        topDirectionCompatibilityProbe = Object.freeze({
          ...baseProbe,
          retained,
          appliedBehavior,
          finalProbeCenter: Object.freeze(cloneSurface(buckler.getWorldParrySurface()).center),
        });
      }
      visualOwnership.afterShieldArmAdditive(shieldArmBoundedAdditive);
      const topPrepReadabilityHold = topPrepReadabilityHoldRuntime.update({
        rig: defender.rig,
        sequence: snapshot.sequence,
        direction: snapshot.direction,
        enabled: Boolean(activeIntentPlan) && !topDirectionProbeActive,
        presentationElapsedMs: exchangeState.latestPredictiveReport?.presentationElapsedMs,
        timeToContactSeconds: exchangeState.latestPredictiveAnalysis?.timeToContactSeconds,
      });
      visualOwnership.afterTopPrepReadabilityHold(topPrepReadabilityHold);
      const activeInterceptArmClosure = parryInterceptDirector.finalClosure({ activeIntent });
      if (activeIntentPlan
        && snapshot.direction === 'top'
        && !topDirectionProbeActive
        && !topPrepReadabilityHoldRuntime.armed) {
        topPrepReadabilityHoldRuntime.arm({
          rig: defender.rig,
          sequence: snapshot.sequence,
          direction: snapshot.direction,
        });
      }
      visualOwnership.afterFinalClosure(activeInterceptArmClosure);
      // Rebuild dynamic line geometry once after all pose solvers have finished.
      defender.update(0, camera);
      defenderSword?.update();
      const outcome = parryInterceptDirector.measureOutcome({
        previousBlade, currentBlade, reached, activeIntent,
      });
      const {
        residualAfterRefinement, shieldStepVector, shieldStepTranslationMeters,
        plannedCorrectionVector, plannedCorrectionMeters, correctionDirectionDot,
        residualEdgeReductionMeters, residualPlaneReductionMeters,
        bodyEdgeReductionMeters, bodyPlaneReductionMeters,
        stanceEdgeReductionMeters, stancePlaneReductionMeters,
        activeInterceptTargetErrorBeforeMeters, activeInterceptTargetErrorAfterMeters,
      } = outcome;
      exchangeState.latestInterceptDriveReport = Object.freeze({
        attackPhase: snapshot.phase,
        elapsedSeconds: snapshot.elapsedSeconds,
        timeToContactSeconds: exchangeState.latestPredictiveAnalysis?.timeToContactSeconds ?? null,
        presentationActive: true,
        selectorBaseline: 'previous-frame-post-tracking-world-shield-surface',
        selectionSource: exchangeState.latestReachableInterceptTarget?.source ?? 'none',
        drivePlanSource: activeIntentPlan
          ? 'latched-f-active-intercept-intent'
          : exchangeState.latestReachableInterceptTarget?.fallbackApplied
            ? 'surface-relative-measured-contact-correction'
            : 'current-presentation-linear-contact-correction',
        activeInterceptIntent: activeInterceptIntent?.report ?? null,
        activeInterceptPoseAuthority: activeIntentPlan
          ? 'post-guard-post-predictive-absolute-world-offset-last-writer'
          : null,
        activeInterceptPrimaryCarryMeters: activeIntentPlan
          ? magnitude(exchangeState.latestFineTracking?.requestedOffset)
          : null,
        activeInterceptResidualCarryMeters: activeIntentPlan
          ? (residualRefinement?.carriedResidualDistance ?? 0)
          : null,
        activeInterceptSupportAuthority: activeIntentPlan
          ? residualBodyReach?.authority ?? null
          : null,
        activeInterceptArmClosure,
        shieldArmBoundedAdditive,
        topDirectionCompatibilityProbe,
        topPrepReadabilityHold,
        activeInterceptTargetErrorBeforeMeters,
        activeInterceptTargetErrorAfterMeters,
        fallbackApplied: exchangeState.latestReachableInterceptTarget?.fallbackApplied === true,
        predictedReachable: exchangeState.latestReachableInterceptTarget?.predictedReachable ?? null,
        measuredReachable: exchangeState.latestReachableInterceptTarget?.measuredReachable ?? null,
        measuredInsideAcquisitionBand: exchangeState.latestReachableInterceptTarget?.measuredInsideAcquisitionBand ?? null,
        predictedRequiredDistanceMeters: exchangeState.latestReachableInterceptTarget?.predictedRequiredDistanceMeters ?? null,
        measuredRequiredDistanceMeters: exchangeState.latestReachableInterceptTarget?.measuredRequiredDistanceMeters ?? null,
        measuredRadialContactCorrectionMeters: exchangeState.latestReachableInterceptTarget?.measuredRadialContactCorrectionMeters ?? null,
        measuredContactCorrectionMeters: exchangeState.latestReachableInterceptTarget?.measuredContactCorrectionMeters ?? null,
        measuredClosestApproach,
        planRequiredDistanceMeters: exchangeState.latestFinePlan?.requiredDistance ?? null,
        planAppliedDistanceMeters: exchangeState.latestFinePlan?.appliedDistance ?? null,
        planReachable: exchangeState.latestFinePlan?.reachable ?? null,
        trackingAchievedDistanceMeters: exchangeState.latestFineTracking?.achievedDistance ?? null,
        residualBeforeRefinement,
        residualInterceptTarget,
        residualTrackingPlan,
        residualRefinement,
        residualCarryBeforeMeters,
        residualCarryAfterMeters: residualRefinement?.carriedResidualDistance ?? residualCarryBeforeMeters,
        residualAfterArmRefinement,
        residualBodyReach,
        residualAfterBodyReach,
        residualStanceReach,
        residualAfterRefinement,
        residualEdgeReductionMeters,
        residualPlaneReductionMeters,
        bodyEdgeReductionMeters,
        bodyPlaneReductionMeters,
        stanceEdgeReductionMeters,
        stancePlaneReductionMeters,
        plannedCorrectionVector,
        plannedCorrectionMeters,
        shieldStepVector,
        shieldStepTranslationMeters,
        correctionDirectionDot,
        authority: activeIntentPlan
          ? 'guard-and-predictive-presentation-then-active-intercept-arm-plus-fixed-target-support-last-writer-held-to-real-contact'
          : 'persistent-arm-carry-then-predicted-or-measured-low-threat-planted-stance-held-to-real-contact-or-reset-diagnostic',
      });
      exchangeState.interceptDriveTrace.push(compactInterceptDriveTraceFrame(exchangeState.latestInterceptDriveReport));
      if (exchangeState.interceptDriveTrace.length > 96) exchangeState.interceptDriveTrace.shift();
    } else {
      shieldArmAdditiveRuntime.reset();
      topPrepReadabilityHoldRuntime.reset();
      parryInterceptDirector.standDown();
      exchangeState.latestReachableInterceptTarget = null;
      exchangeState.latestFinePlan = null;
      exchangeState.latestFineTracking = null;
      exchangeState.latestInterceptDriveReport = null;
    }

    const afterSurface = cloneSurface(buckler.getWorldParrySurface());
    exchangeState.latestShieldLeadMotion = sampleActiveShieldLeadMotion({
      previousSurface: exchangeState.previousShieldLeadSurface || beforeSurface,
      currentSurface: afterSurface,
      deltaSeconds,
    });
    exchangeState.previousShieldLeadSurface = afterSurface;
  }
  function armActiveIntercept(snapshot) {
    topPrepReadabilityHoldRuntime.reset();
    return activeInterceptIntent?.arm({
      sequence: snapshot?.sequence,
      direction: snapshot?.direction,
      bucklerSurface: cloneSurface(buckler.getWorldParrySurface()),
      predictiveAnalysis: exchangeState.latestPredictiveAnalysis,
    }) || Object.freeze({ accepted: false, reason: 'active-intercept-intent-unavailable' });
  }

  function resetActiveIntercept() {
    activeInterceptIntent?.reset();
    shieldArmAdditiveRuntime.reset();
    topPrepReadabilityHoldRuntime.reset();
    guardCoverageDirector.reset();
    visualOwnership.reset();
  }

  function updatePreContact(snapshot, currentBlade, deltaSeconds) {
    const context = readContext();
    if (!snapshot.action || exchangeState.firstContact) return;
    const observeVisualOwnership = context.selectedMode === 'parry';
    if (observeVisualOwnership) visualOwnership.beginFrame(snapshot);
    try {
      if (context.selectedMode === 'block') updateBlockPreContact(snapshot, currentBlade, deltaSeconds, context);
      else updateParryPreContact(snapshot, currentBlade, deltaSeconds, context);
    } finally {
      if (observeVisualOwnership) visualOwnership.finishFrame();
    }
  }

  function recordWhiffProbe(snapshot, probe) {
    const { selectedMode } = readContext();
    if (selectedMode !== 'parry' || !parryGate.armed || !snapshot?.action || !probe) return;
    exchangeState.whiffProbeFrames += 1;
    const approach = probe.diagnostics?.closestApproach || null;
    if (!approach) return;
    const contactSeconds = Number(snapshot.action.runtime?.contactSeconds);
    const elapsedSeconds = Number(snapshot.elapsedSeconds);
    const timeToContactSeconds = Number.isFinite(contactSeconds) && Number.isFinite(elapsedSeconds)
      ? contactSeconds - elapsedSeconds
      : null;
    const record = Object.freeze({
      ...approach,
      attackPhase: snapshot.phase,
      attackDirection: snapshot.direction,
      elapsedSeconds: Number.isFinite(elapsedSeconds) ? elapsedSeconds : null,
      timeToContactSeconds,
      probeReason: probe.reason,
      probeDeltaSeconds: Number.isFinite(Number(probe.diagnostics?.deltaSeconds))
        ? Number(probe.diagnostics.deltaSeconds)
        : null,
      geometricContact: probe.geometricContact === true,
      eligible: probe.eligible === true,
      shieldRadiusMeters: probe.surface?.radius ?? null,
      shieldThicknessMeters: probe.surface?.thickness ?? null,
      predictedGeometryReason: exchangeState.latestPredictiveAnalysis?.geometryReason ?? exchangeState.latestPredictiveAnalysis?.reason ?? null,
      trackingRequiredDistanceMeters: exchangeState.latestFinePlan?.requiredDistance ?? exchangeState.latestParryInput?.requiredShieldTravelMeters ?? null,
      trackingAppliedDistanceMeters: exchangeState.latestFinePlan?.appliedDistance ?? null,
      trackingAchievedDistanceMeters: exchangeState.latestFineTracking?.achievedDistance ?? null,
      trackingReachable: exchangeState.latestFinePlan?.reachable ?? null,
      interceptTargetSource: exchangeState.latestReachableInterceptTarget?.source ?? null,
      interceptFallbackApplied: exchangeState.latestReachableInterceptTarget?.fallbackApplied === true,
      predictedRequiredDistanceMeters: exchangeState.latestReachableInterceptTarget?.predictedRequiredDistanceMeters ?? null,
      measuredRequiredDistanceMeters: exchangeState.latestReachableInterceptTarget?.measuredRequiredDistanceMeters ?? null,
      interceptDriveReport: compactInterceptDriveTelemetry(exchangeState.latestInterceptDriveReport),
    });
    if (!exchangeState.closestWhiffApproach
      || record.combinedGapMeters < exchangeState.closestWhiffApproach.combinedGapMeters
      || (record.combinedGapMeters === exchangeState.closestWhiffApproach.combinedGapMeters
        && Math.abs(record.timeToContactSeconds ?? Infinity) < Math.abs(exchangeState.closestWhiffApproach.timeToContactSeconds ?? Infinity))) {
      exchangeState.closestWhiffApproach = record;
    }
    if (probe.geometricContact === true && probe.contact !== true
      && (!exchangeState.outsideActiveContact
        || Math.abs(record.timeToContactSeconds ?? Infinity) < Math.abs(exchangeState.outsideActiveContact.timeToContactSeconds ?? Infinity))) {
      exchangeState.outsideActiveContact = record;
    }
  }

  return Object.freeze({
    update: updatePreContact,
    recordWhiffProbe,
    armActiveIntercept,
    resetActiveIntercept,
    get activeInterceptIntentReport() { return activeInterceptIntent?.report ?? null; },
  });
}
