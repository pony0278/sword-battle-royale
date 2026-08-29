import { measureSweptSwordBucklerClosestApproach } from './swept-sword-buckler-contact.js';
import { planFineGuardTracking } from './directional-guard-bracing.js';
import {
  getGuardThreatTrackingProfile,
  planGuardThreatCorrection,
  predictGuardThreat,
} from './guard-threat-tracking.js';
import { createGuardCoverageTargetTracker, selectGuardCoverageTarget } from './guard-coverage-target.js';
import { createGuardCoverageLatch } from './guard-coverage-latch.js';
import { GUARD_MODE_STANCE_REACH_PROFILE } from './guard-residual-stance-reach.js';

export const GUARD_COVERAGE_DIRECTOR_STAGE = 'R18S.2';

// R18S.2: Covering a direction is four passes, and the parts were never the hard bit - which pass
// runs when, and what each one is allowed to look at, was. What this owns is the sequence:
//
//   1. aim   - measure the sweep against the neutral shield, then pick a target off the coverage
//              ladder (direction anchor -> predicted threat once credible -> measured sweep once
//              close) and plan a correction for it. The latch decides whether that correction is
//              tracked, held, or suppressed because the guard has not finished reacting yet.
//   2. track - the shield arm moves. This is the only pass with a real travel budget.
//   3. close - re-measure against the shield *as it now stands*. The primary plan was authored
//              against the neutral surface, so once the arm has moved, which blade point is
//              nearest has changed with it, and the last centimetres are a different correction.
//   4. drop  - offer the stance the same target the arm is tracking, plus what the arm attempted
//              and achieved, and let it decide whether the threat is low enough to crouch for.
//
// Every pass re-reads the shield, because every pass before it moved the shield. That is the piece
// that cannot be carried by moving the modules, and it is why this exists.
//
// It owns no contact authority. Real swept Sword x Shield contact still decides what was blocked.

const RESIDUAL_REFINEMENT = Object.freeze({
  speedScale: 1,
  jointBudgetScale: 0.35,
  maxResidualMeters: 0.08,
  iterations: 2,
  minimumGapMeters: 1e-4,
  minimumCorrectionMeters: 1e-6,
});

export function createGuardCoverageDirector({
  trackingRuntime,
  stanceRuntime,
  readShieldSurface,
} = {}) {
  const targetTracker = createGuardCoverageTargetTracker();
  const coverageLatch = createGuardCoverageLatch();

  function measure(previousBlade, currentBlade, bucklerSurface) {
    return measureSweptSwordBucklerClosestApproach({ previousBlade, currentBlade, bucklerSurface });
  }

  // 1. Aim. The ladder picks the target; the latch decides what the arm is allowed to do with it.
  function aim({ sequence, direction, committed, previousBlade, currentBlade, deltaSeconds, surface }) {
    const profile = getGuardThreatTrackingProfile('guard');
    const approach = measure(previousBlade, currentBlade, surface);
    const target = targetTracker.select({
      sequence,
      deltaSeconds,
      direction,
      predictedThreat: predictGuardThreat({
        previousBlade,
        currentBlade,
        bucklerSurface: surface,
        deltaSeconds,
        horizonSeconds: profile.horizonSeconds,
        selection: profile.threatSelection,
        extrapolation: profile.threatExtrapolation,
      }),
      approach,
      bucklerSurface: surface,
    });
    const plan = target?.threat
      ? planGuardThreatCorrection({ mode: 'guard', threat: target.threat, bucklerSurface: surface })
      : planFineGuardTracking({ threat: null, bucklerSurface: surface, maxCorrectionMeters: 0 });
    return {
      approach,
      target,
      plan: coverageLatch.update({
        plan,
        sequence,
        committed,
        deltaMs: deltaSeconds * 1000,
        currentOffset: trackingRuntime.offset,
        approach,
        engaged: Boolean(target?.engaged),
      }),
    };
  }

  // 3. Close. Measured only - a prediction has nothing left to add at this range, and the
  // correction is an increment on a shield that has already moved.
  function close({ direction, previousBlade, currentBlade, deltaSeconds, surface }) {
    const approach = measure(previousBlade, currentBlade, surface);
    if (!(approach.combinedGapMeters > RESIDUAL_REFINEMENT.minimumGapMeters)) return null;
    const target = selectGuardCoverageTarget({
      direction,
      predictedThreat: null,
      approach,
      bucklerSurface: surface,
    });
    if (!target?.engaged) return null;
    const plan = planGuardThreatCorrection({ mode: 'guard', threat: target.threat, bucklerSurface: surface });
    if (!(plan?.appliedDistance > RESIDUAL_REFINEMENT.minimumCorrectionMeters)) return null;
    return trackingRuntime.refineMeasuredContact(plan, deltaSeconds, RESIDUAL_REFINEMENT);
  }

  // 4. Drop. Crouching cannot be started inside the two frames where the blade is measurable, so
  // the stance is offered the same target the arm is tracking - early in a swing that is the
  // direction anchor, which is exactly the read a defender makes when they drop into a low guard
  // before the sword is anywhere near them.
  function drop({ tracking, previousBlade, currentBlade, deltaSeconds, surface, plan, trackingReport, aimApproach }) {
    const approach = tracking ? measure(previousBlade, currentBlade, surface) : null;
    return stanceRuntime.update({
      mode: tracking ? 'guard' : 'off',
      profile: GUARD_MODE_STANCE_REACH_PROFILE,
      closestApproach: approach,
      anticipatedClosestApproach: plan?.worldPoint ? { point: plan.worldPoint } : null,
      anticipatedLeadSeconds: plan?.futureSeconds ?? null,
      // What the arm is attempting and achieving this frame, so the stance can tell the difference
      // between "the arm is still closing this" and "the arm has done all it can".
      armEvidence: {
        extensionRatio: 0,
        correctionAttemptedMeters: trackingReport?.attempted ?? 0,
        correctionAchievedMeters: trackingReport?.achieved ?? 0,
        edgeGapBeforeMeters: aimApproach?.radialGapMeters ?? 0,
        edgeGapAfterMeters: approach?.radialGapMeters ?? 0,
      },
    }, deltaSeconds);
  }

  // snapTravel is the caller's answer to one question: did this guard come up before the swing, or
  // into it? R20J.1 - a guard thrown up mid-swing places its cover (see the tracking runtime).
  function update({ sequence, direction, committed, previousBlade, currentBlade, deltaSeconds, snapTravel = false } = {}) {
    const tracking = Boolean(previousBlade) && committed === true;
    const neutralSurface = readShieldSurface();

    const aimed = tracking
      ? aim({ sequence, direction, committed, previousBlade, currentBlade, deltaSeconds, surface: neutralSurface })
      : {
          approach: null,
          target: null,
          plan: coverageLatch.update({
            plan: planFineGuardTracking({ threat: null, bucklerSurface: neutralSurface, maxCorrectionMeters: 0 }),
            sequence,
            committed,
            deltaMs: deltaSeconds * 1000,
            currentOffset: trackingRuntime.offset,
            approach: null,
            engaged: false,
          }),
        };

    // 2. Track.
    const trackingReport = trackingRuntime.update(aimed.plan, deltaSeconds, { snapTravel: snapTravel === true });

    const residual = tracking
      ? close({ direction, previousBlade, currentBlade, deltaSeconds, surface: readShieldSurface() })
      : null;

    const stanceReach = drop({
      tracking,
      previousBlade,
      currentBlade,
      deltaSeconds,
      surface: readShieldSurface(),
      plan: aimed.target?.threat,
      trackingReport: {
        attempted: aimed.plan?.appliedDistance ?? 0,
        achieved: trackingReport?.achievedDistance ?? 0,
      },
      aimApproach: aimed.approach,
    });

    // The latch's own gap was measured against the neutral surface, before any of this frame's
    // passes moved the shield. This one is measured after all of them, so it reports whether the
    // guard closed the line rather than whether it wanted to.
    const tracked = tracking ? measure(previousBlade, currentBlade, readShieldSurface()) : null;

    return Object.freeze({
      stage: GUARD_COVERAGE_DIRECTOR_STAGE,
      plan: aimed.plan,
      tracking: trackingReport,
      residual,
      stanceReach,
      coverage: Object.freeze({
        ...coverageLatch.report,
        trackedGapMeters: tracked?.combinedGapMeters ?? null,
        trackedPlaneGapMeters: tracked?.planeGapMeters ?? null,
        trackedRadialGapMeters: tracked?.radialGapMeters ?? null,
      }),
      authority: 'coverage-guidance-only-real-swept-contact-still-decides',
    });
  }

  function reset() {
    coverageLatch.reset();
    targetTracker.reset();
  }

  return Object.freeze({
    stage: GUARD_COVERAGE_DIRECTOR_STAGE,
    update,
    reset,
    get coverage() { return coverageLatch.report; },
  });
}
