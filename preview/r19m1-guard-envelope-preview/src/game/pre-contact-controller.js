import { createBoundedShieldArmAdditiveRuntime } from '../combat/predictive-parry-arm-additive.js';
import { GUARD_COVERAGE, planGuardSectorGate } from '../combat/guard-sector-gate.js';
import { createTopPrepReadabilityHoldRuntime } from '../combat/parry-top-prep-readability-hold.js';
import { createGuardCoverageDirector } from '../combat/guard-coverage-director.js';
import { assessSwingThreatRelevance } from '../combat/swing-threat-relevance.js';
import { assessSwingInnerReach } from '../combat/swing-inner-reach.js';
import { planCloseRangeGuardPosture } from '../combat/close-range-guard-hold.js';
import { planGuardFacingTurn } from '../combat/guard-facing-turn.js';
import { planGuardConeGate } from '../combat/guard-cone-gate.js';
import { createParryInterceptDirector } from '../combat/parry-intercept-director.js';

// The tap points, spelled out rather than proxied away: this list IS the set of moments a pose
// writer announces itself, and a reader of this file should be able to see it without opening the
// lab's implementation.
const NO_OP_OWNERSHIP_TAPS = Object.freeze({
  beginFrame() {}, finishFrame() {}, reset() {},
  afterPrimaryArm() {}, afterResidualArm() {}, afterBody() {}, afterStance() {},
  afterPredictive() {}, afterShieldArmAdditive() {}, afterTopPrepReadabilityHold() {},
  afterFinalClosure() {},
});

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
  // R20Z.3: who watches the pose writers. The ownership taps snapshot the rig at the instant each
  // stage of the reach ladder owns it, which is a lab question - it exists to answer "who moved
  // this bone" - and this controller used to construct them itself, making a gameplay module
  // import a diagnostic one. Injected now, and no-op by default: the fight runs identically with
  // nobody watching, which is what a diagnostic is supposed to mean.
  createOwnershipTaps = () => NO_OP_OWNERSHIP_TAPS,
}) {
  const LONGSWORD_ATTACK_PHASES = longswordAttackPhases;
  const PARRY_PROMPT_HOLD_MS = promptHoldMs;
  const visualOwnership = createOwnershipTaps({ rig: defender.rig, exchangeState }) || NO_OP_OWNERSHIP_TAPS;
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

  let closeRangePosture = null;

  let innerReach = null; // R20T.2, cached the same way and for the same reason
  let coneGate = null;
  function updateBlockPreContact(snapshot, currentBlade, deltaSeconds, context) {
    const { previousBlade, defenderSword, separationMeters, defenderFacingErrorRadians, dodgeReport, stanceReport, aimedSector = null, guardCoverage = GUARD_COVERAGE.ONE_SECTOR } = context; // R23Z.1: whose shield
    // R20F.1: a dodge's cost is its guard. Read per frame rather than latched per exchange,
    // because the dodge can begin or end mid-swing and the exposure must follow it exactly.
    // R20G.1 (B6c): and the guard itself is now an input - no held key, no committed defence.
    // Doubt resolves to guarding so a caller that never learned to pass the stance is unchanged.
    const dodgeGuardDown = dodgeReport?.guardSuppressed === true
      || (stanceReport ? stanceReport.guardActive !== true : false);
    exchangeState.latestDodge = dodgeReport ?? null;
    // R19N.1: a swing that cannot reach the defender is nobody's problem. The gate sits on
    // commitment rather than inside the director so that an irrelevant attack is simply never
    // committed to: the latch stays quiet, the anchors never apply, and the arm eases home at its
    // return speed instead of performing coverage for a blow landing metres short.
    const relevance = assessSwingThreatRelevance({ direction: snapshot.direction, separationMeters });
    exchangeState.latestSwingRelevance = relevance;
    // R20T.2: and the mirror question - a swing can also be thrown from too CLOSE. LEFT's sweep
    // passes at a radius, so a defender inside it is behind the blade. Reported only: the geometry
    // already decides the outcome, this just stops it being a mystery.
    //
    // Decided once per exchange from the separation at commitment, like the posture below and for
    // a sharper version of the same reason: the assessment spends the attacker's advance itself,
    // so feeding it a live separation mid-swing subtracts that advance a second time and calls a
    // swing "inside the arc" that is about to land perfectly.
    if (innerReach?.sequence !== snapshot.sequence) {
      innerReach = Object.freeze({
        sequence: snapshot.sequence,
        report: assessSwingInnerReach({ direction: snapshot.direction, separationMeters }),
      });
    }
    exchangeState.latestSwingInnerReach = innerReach.report;
    // R19O.1: and a swing arriving inside the working floor meets a shield that stays in front.
    // Decided once per exchange from the separation at commitment - a per-frame flip between
    // chase and hold would shake the arm at exactly the range that already looks worst.
    if (closeRangePosture?.sequence !== snapshot.sequence) {
      closeRangePosture = Object.freeze({
        sequence: snapshot.sequence,
        plan: planCloseRangeGuardPosture({ direction: snapshot.direction, separationMeters }),
      });
    }
    exchangeState.latestCloseRangePosture = closeRangePosture.plan;
    // R19Z.1: and a swing committed to from outside the measured cone meets no committed
    // response at all. Decided once per exchange like the posture - the error at commitment is
    // the angle the sweep was measured at, and a mid-swing flip would re-arm coverage against
    // an attack the gate already stood down from.
    if (coneGate?.sequence !== snapshot.sequence) {
      coneGate = Object.freeze({
        sequence: snapshot.sequence,
        plan: planGuardConeGate({
          direction: snapshot.direction,
          facingErrorRadians: defenderFacingErrorRadians,
        }),
      });
    }
    exchangeState.latestConeGate = coneGate.plan;
    // R23T.1: the sector gate. Re-planned every frame rather than latched per sequence, because
    // the shield can be moved into the sector mid-swing - that is the whole of the direction game.
    const sectorGate = planGuardSectorGate({ direction: snapshot.direction, aimedSector, coverage: guardCoverage });
    exchangeState.latestSectorGate = sectorGate;
    const baselineSurface = buckler.getWorldParrySurface();
    const engaged = snapshot.phase !== LONGSWORD_ATTACK_PHASES.INTERRUPTED
      && relevance.relevant
      && coneGate.plan.engaged
      && sectorGate.covers
      && !dodgeGuardDown
      && closeRangePosture.plan.posture !== 'hold-at-neutral';
    // R19Q.1: a fresh plan object every frame is the liveness signal the facing integrator keys
    // on, so this write doubles as "the exchange is still running" - do not cache it. The cone
    // gate stands the turn down too: the sweep measured turn and coverage running together, and
    // a turn without its coverage is a configuration nobody measured.
    exchangeState.latestGuardFacingPlan = planGuardFacingTurn({
      direction: snapshot.direction,
      engaged: snapshot.phase !== LONGSWORD_ATTACK_PHASES.INTERRUPTED
        && relevance.relevant && coneGate.plan.engaged && !dodgeGuardDown,
      posture: closeRangePosture.plan.posture,
    });
    const bracePlan = previousBlade && engaged
      ? planArticulatedImpactBracing({
          mode: 'brace-fine', attackDirection: snapshot.direction,
          previousBlade, currentBlade, bucklerSurface: baselineSurface, deltaSeconds,
        })
      : zeroBracePlan();
    bracingRuntime.update(bracePlan, deltaSeconds);
    const coverage = guardCoverageDirector.update({
      sequence: snapshot.sequence,
      direction: snapshot.direction,
      committed: engaged,
      previousBlade,
      currentBlade,
      deltaSeconds,
      // R20J.1 (B6d): a guard that came up after this swing was already live has no windup left to
      // travel in, so it places its cover rather than servoing toward it. A guard held from before
      // the swing (the golden-grid world) keeps the servo untouched.
      snapTravel: context.lateGuardRaise === true,
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
      const shieldArmBoundedAdditive = shieldArmAdditiveRuntime.update({
        rig: defender.rig,
        authoredDelta: exchangeState.latestPredictiveReport?.shieldArmAuthoredDelta,
        sequence: snapshot.sequence,
        enabled: Boolean(activeIntentPlan),
      });
      visualOwnership.afterShieldArmAdditive(shieldArmBoundedAdditive);
      const topPrepReadabilityHold = topPrepReadabilityHoldRuntime.update({
        rig: defender.rig,
        sequence: snapshot.sequence,
        direction: snapshot.direction,
        enabled: Boolean(activeIntentPlan),
        presentationElapsedMs: exchangeState.latestPredictiveReport?.presentationElapsedMs,
        timeToContactSeconds: exchangeState.latestPredictiveAnalysis?.timeToContactSeconds,
      });
      visualOwnership.afterTopPrepReadabilityHold(topPrepReadabilityHold);
      const activeInterceptArmClosure = parryInterceptDirector.finalClosure({ activeIntent });
      if (activeIntentPlan
        && snapshot.direction === 'top'
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
      // R20H.1 (B6c2): an armed Sekiro raise hands the frame to the parry chain - the intercept
      // drive is what turns a raise into a deflect (without it every in-window LEFT raise still
      // lands on the body, measured: the whole LEFT window sits past the B6b conversion cliff).
      // A plain held guard keeps the block chain and its coverage machinery.
      if (context.selectedMode === 'block' && parryGate.armed !== true) updateBlockPreContact(snapshot, currentBlade, deltaSeconds, context);
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
