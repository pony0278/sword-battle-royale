import { measureSweptSwordBucklerClosestApproach } from './swept-sword-buckler-contact.js';
import { planGuardThreatCorrection } from './guard-threat-tracking.js';
import { selectReachableParryInterceptTarget } from './reachable-parry-intercept-target.js';

export const PARRY_INTERCEPT_DIRECTOR_STAGE = 'R18S.3';

// R18S.3: Parry's reach is a ladder of writers, each one closing what the one before it could not,
// and each one measured against the shield the one before it just moved. The runtimes were always
// modules; the ladder was not. What this owns:
//
//   aim    - pick where to meet the blade. An armed intent wins outright; otherwise a measured
//            contact correction beats a predicted one, and a predicted one beats nothing. The
//            selector deliberately measures against the *previous* frame's post-tracking shield,
//            not this frame's: the presentation rebuilds the authored pose every frame, and a
//            selector that re-baselined on it would keep re-deciding where to meet the same blade.
//   arm    - the primary tracking carry, then a measured residual refinement on top of it.
//   body   - what the arm could not close, the torso reaches for.
//   stance - what the body could not close, and the threat is low enough for, the legs drop into.
//   close  - with an armed intent, the arm makes the last correction toward the latched target,
//            so Active Intercept is the final writer of the shield-arm pose before real swept
//            contact is evaluated. This one does not announce itself: the caller takes a
//            read-only pose capture between the write and the observation of it.
//
// The ladder is split in two on purpose: the lab writes its own authored-arm passes between the
// stance and the final closure, and those are its own, not the ladder's.
//
// Every stage announces itself through `observe` after it has written, because the lab's ownership
// taps snapshot the rig at that instant and cannot be told about it afterwards.
//
// It owns no contact authority. Real swept Sword x Shield contact still decides what was parried.

const RESIDUAL_REFINEMENT = Object.freeze({
  speedScale: 1,
  jointBudgetScale: 0.35,
  maxResidualMeters: 0.06,
  iterations: 2,
});
const FINAL_CLOSURE_REFINEMENT = Object.freeze({
  jointBudgetScale: 0.6,
  iterations: 2,
});
const RESIDUAL_ACTIVATION = Object.freeze({
  gapMeters: 1e-5,
  correctionMeters: 1e-6,
});

function magnitude(vector) {
  return vector ? Math.hypot(vector.x || 0, vector.y || 0, vector.z || 0) : 0;
}

function difference(after, before) {
  return Object.freeze({
    x: after.x - before.x,
    y: after.y - before.y,
    z: after.z - before.z,
  });
}

function distanceTo(target, center) {
  return target
    ? Math.hypot(target.x - center.x, target.y - center.y, target.z - center.z)
    : null;
}

export function createParryInterceptDirector({
  trackingRuntime,
  bodyReachRuntime,
  stanceRuntime,
  readShieldSurface,
  observe = {},
} = {}) {
  function announce(stage, report) {
    observe[stage]?.(report);
    return report;
  }

  function measure(previousBlade, currentBlade, bucklerSurface) {
    return measureSweptSwordBucklerClosestApproach({ previousBlade, currentBlade, bucklerSurface });
  }

  // aim -> arm -> body -> stance. Returns everything the caller needs to describe what happened,
  // measured at the points where it could still be measured.
  function reach({
    previousBlade,
    currentBlade,
    deltaSeconds,
    continuitySurface,
    predictiveAnalysis,
    activeIntent = null,
    stanceProfile = null,
  } = {}) {
    const presentationSurface = readShieldSurface();
    const selectorSurface = continuitySurface || presentationSurface;
    const measuredClosestApproach = measure(previousBlade, currentBlade, selectorSurface);
    const activeIntentPlan = activeIntent?.plan || null;
    const interceptTarget = selectReachableParryInterceptTarget({
      predictedThreat: predictiveAnalysis?.threat,
      predictedTrackingPlan: predictiveAnalysis?.trackingPlan,
      closestApproach: measuredClosestApproach,
      bucklerSurface: selectorSurface,
    });
    // An armed intent wins outright; otherwise a measured contact correction beats a predicted
    // one, and a predicted one beats nothing.
    const plan = activeIntentPlan || (interceptTarget?.fallbackApplied
      ? interceptTarget.trackingPlan
      : interceptTarget?.threat
        ? planGuardThreatCorrection({
            mode: 'parry',
            threat: interceptTarget.threat,
            bucklerSurface: presentationSurface,
          })
        : null);

    const trackingSurfaceBefore = readShieldSurface();
    // The presentation is allowed to rebuild its authored pose every frame. The tracking runtime's
    // bounded carry survives that and is applied after it, so its offset acts as an absolute
    // world-space correction rather than something that stacks frame on frame.
    const tracking = announce('primaryArm', trackingRuntime.update(plan, deltaSeconds));
    const residualCarryBeforeMeters = magnitude(tracking?.carriedResidualOffset);

    const residualBeforeRefinement = measure(previousBlade, currentBlade, readShieldSurface());
    const residualNeeded = residualBeforeRefinement.radialGapMeters > RESIDUAL_ACTIVATION.gapMeters
      || residualBeforeRefinement.planeGapMeters > RESIDUAL_ACTIVATION.gapMeters;
    const residualInterceptTarget = residualNeeded
      ? selectReachableParryInterceptTarget({
          predictedThreat: null,
          predictedTrackingPlan: null,
          closestApproach: residualBeforeRefinement,
          bucklerSurface: readShieldSurface(),
        })
      : null;
    const residualTrackingPlan = residualInterceptTarget?.fallbackApplied
      ? residualInterceptTarget.trackingPlan
      : null;
    const residualRefinement = announce(
      'residualArm',
      residualTrackingPlan?.appliedDistance > RESIDUAL_ACTIVATION.correctionMeters
        ? trackingRuntime.refineMeasuredContact(residualTrackingPlan, deltaSeconds, RESIDUAL_REFINEMENT)
        : null,
    );

    const residualAfterArmRefinement = measure(previousBlade, currentBlade, readShieldSurface());
    // With an armed intent the body reaches for the latched world target rather than for wherever
    // the blade happens to be closest right now - the target is the decision, the blade is not.
    const bodyReach = announce('body', activeIntentPlan
      ? bodyReachRuntime.trackWorldTarget({ targetCenter: activeIntent?.targetCenter }, deltaSeconds)
      : bodyReachRuntime.update({ mode: 'parry', closestApproach: residualAfterArmRefinement }, deltaSeconds));

    const residualAfterBodyReach = measure(previousBlade, currentBlade, readShieldSurface());
    const stanceReach = announce('stance', stanceRuntime.update({
      mode: 'parry',
      profile: stanceProfile,
      closestApproach: residualAfterBodyReach,
      anticipatedClosestApproach: predictiveAnalysis?.threat?.worldPoint
        ? { point: predictiveAnalysis.threat.worldPoint }
        : null,
      anticipatedLeadSeconds: predictiveAnalysis?.threat?.futureSeconds ?? null,
      armEvidence: {
        extensionRatio: bodyReach.armExtensionRatio ?? 0,
        correctionAttemptedMeters: residualTrackingPlan?.appliedDistance ?? 0,
        correctionAchievedMeters: residualRefinement?.achievedDistance ?? 0,
        edgeGapBeforeMeters: residualBeforeRefinement.radialGapMeters,
        edgeGapAfterMeters: residualAfterArmRefinement.radialGapMeters,
      },
    }, deltaSeconds));

    return Object.freeze({
      stage: PARRY_INTERCEPT_DIRECTOR_STAGE,
      activeIntentPlan,
      measuredClosestApproach,
      interceptTarget,
      plan,
      tracking,
      residualCarryBeforeMeters,
      trackingSurfaceBefore,
      residualBeforeRefinement,
      residualInterceptTarget,
      residualTrackingPlan,
      residualRefinement,
      residualAfterArmRefinement,
      bodyReach,
      residualAfterBodyReach,
      stanceReach,
    });
  }

  // Deliberately silent, unlike every other stage: the caller has a read-only capture of its own
  // to take between this write and the observation of it, so it owns when this one is announced.
  function finalClosure({ activeIntent = null } = {}) {
    return activeIntent?.plan
      ? trackingRuntime.refineWorldTarget(activeIntent.targetCenter, FINAL_CLOSURE_REFINEMENT)
      : null;
  }

  // What the ladder actually moved, stage by stage. Measured after every writer has finished,
  // so each reduction is attributable to the stage that produced it.
  function measureOutcome({ previousBlade, currentBlade, reached, activeIntent = null } = {}) {
    const trackingSurfaceAfter = readShieldSurface();
    const residualAfterRefinement = measure(previousBlade, currentBlade, trackingSurfaceAfter);
    const shieldStepVector = difference(trackingSurfaceAfter.center, reached.trackingSurfaceBefore.center);
    const shieldStepTranslationMeters = magnitude(shieldStepVector);
    const plannedCorrectionVector = reached.plan?.correction || null;
    const plannedCorrectionMeters = magnitude(plannedCorrectionVector);
    // Did the shield actually move the way the plan asked it to? A high magnitude with a low dot
    // is a solver fighting the plan, not a plan being carried out.
    const correctionDirectionDot = plannedCorrectionMeters > 1e-6 && shieldStepTranslationMeters > 1e-6
      ? (plannedCorrectionVector.x * shieldStepVector.x
        + plannedCorrectionVector.y * shieldStepVector.y
        + plannedCorrectionVector.z * shieldStepVector.z)
        / (plannedCorrectionMeters * shieldStepTranslationMeters)
      : null;
    const targetCenter = reached.activeIntentPlan ? activeIntent?.targetCenter ?? null : null;
    return Object.freeze({
      trackingSurfaceAfter,
      residualAfterRefinement,
      shieldStepVector,
      shieldStepTranslationMeters,
      plannedCorrectionVector,
      plannedCorrectionMeters,
      correctionDirectionDot,
      residualEdgeReductionMeters:
        reached.residualBeforeRefinement.radialGapMeters - residualAfterRefinement.radialGapMeters,
      residualPlaneReductionMeters:
        reached.residualBeforeRefinement.planeGapMeters - residualAfterRefinement.planeGapMeters,
      bodyEdgeReductionMeters:
        reached.residualAfterArmRefinement.radialGapMeters - reached.residualAfterBodyReach.radialGapMeters,
      bodyPlaneReductionMeters:
        reached.residualAfterArmRefinement.planeGapMeters - reached.residualAfterBodyReach.planeGapMeters,
      stanceEdgeReductionMeters:
        reached.residualAfterBodyReach.radialGapMeters - residualAfterRefinement.radialGapMeters,
      stancePlaneReductionMeters:
        reached.residualAfterBodyReach.planeGapMeters - residualAfterRefinement.planeGapMeters,
      activeInterceptTargetErrorBeforeMeters: distanceTo(targetCenter, reached.trackingSurfaceBefore.center),
      activeInterceptTargetErrorAfterMeters: distanceTo(targetCenter, trackingSurfaceAfter.center),
    });
  }

  // No presentation, no ladder: the reaches let go rather than holding a pose nothing is driving.
  function standDown() {
    bodyReachRuntime.reset();
    stanceRuntime.reset();
  }

  return Object.freeze({
    stage: PARRY_INTERCEPT_DIRECTOR_STAGE,
    reach,
    finalClosure,
    measureOutcome,
    standDown,
    authority: 'reach-guidance-only-real-swept-contact-still-decides',
  });
}
