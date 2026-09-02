import { assessGuardAnchorCoverage } from '../../../src/combat/guard-directional-anchor.js';
import { ATTACK_ADVANCE_PROFILES } from '../../../src/combat/attack-advance.js';
import { effectiveSeparationAtContact } from '../../../src/combat/engagement-spacing.js';

// R18V.3 — everything the frame says about itself: the parry cue, the HUD, and the verification
// report. Gathering only. Each of these reads live state and hands it to a module that already
// exists (lab-ui, verification-report), which is exactly why none of it belongs in the entry: the
// entry's job is what happens and in what order, not how it is described afterwards.
//
// The three of them are one module rather than three because they read the same live state, and
// splitting them would mean threading the same dozen accessors three times.
//
// `read` is a bag of getters, not values. Everything in it is a `let` the entry reassigns while the
// exchange runs, so a snapshot taken at construction would be wrong by the first frame.
export function createShieldParryFrameReporting({
  labUi,
  exchangeState,
  documentRef,
  windowRef,
  reportNode,
  runtimes: {
    combat,
    attackRuntime,
    parryGate,
    freeCamera,
    contactHandoffController,
    labScene,
  },
  services: {
    buildShieldParryVerificationReport,
    serializeVerificationReport,
  },
  constants: {
    labStage,
    recoilStage,
    parryReviewRate,
    maxReportCharacters,
    recentCompactTraceFrames,
    liveContactPhaseLatch,
    debugMode,
  },
  read,
}) {
  function updateParryCue(snapshot = attackRuntime.snapshot) {
    return labUi.updateParryCue({
      snapshot,
      ready: read.ready(),
      lockReport: read.lockReport?.() ?? null, // R20S.3
      sprintReport: read.sprintReport?.() ?? null, // R20U.1
      parryTally: read.parryTally?.() ?? null, // R21C.2
      // R21G.2: both of these were added to the HUD's source list but never forwarded here, so the
      // 對手 line has not updated once since R21E.1 shipped - the drive was only ever verified
      // through the debug API, which reads the runtime rather than the screen.
      opponent: read.opponent?.() ?? null, // R21E.1
      parryTallyReport: read.parryTallyReport?.() ?? null, // R21G.2
      swingInnerReach: exchangeState.latestSwingInnerReach, // R20T.2
      selectedMode: read.selectedMode(),
      step3AContactTransfer: exchangeState.step3AContactTransfer,
      latestGripConstraintReport: exchangeState.latestGripConstraintReport,
      selectedDirection: read.selectedDirection(),
      latestParryConfirmation: exchangeState.latestParryConfirmation,
      latestParryWhiff: exchangeState.latestParryWhiff,
      parryAttempt: parryGate.attempt,
      firstContact: exchangeState.firstContact,
      latestParryOpportunity: exchangeState.latestParryOpportunity,
      parryReviewActive: read.parryReviewActive(snapshot),
      parryReviewRate,
      debugMode,
    });
  }

  function updateHud(snapshot, combatSnapshot) {
    return labUi.updateHud({
      snapshot,
      combatSnapshot,
      latestCombatResult: exchangeState.latestCombatResult,
      latestParryWhiff: exchangeState.latestParryWhiff,
      latestParryConfirmation: exchangeState.latestParryConfirmation,
      latestParryInput: exchangeState.latestParryInput,
      lockReport: read.lockReport?.() ?? null, // R20S.3
      sprintReport: read.sprintReport?.() ?? null, // R20U.1
      parryTally: read.parryTally?.() ?? null, // R21C.2
      // R21G.2: both of these were added to the HUD's source list but never forwarded here, so the
      // 對手 line has not updated once since R21E.1 shipped - the drive was only ever verified
      // through the debug API, which reads the runtime rather than the screen.
      opponent: read.opponent?.() ?? null, // R21E.1
      duel: read.duel?.() ?? null, // R23J.1: health, stagger and who is still standing
      swingLedger: read.swingLedger?.() ?? null, // R23L.1: the player's last swings, in words
      parryTallyReport: read.parryTallyReport?.() ?? null, // R21G.2
      swingInnerReach: exchangeState.latestSwingInnerReach, // R20T.2
      selectedMode: read.selectedMode(),
      requestedOutcome: read.selectedMode(),
      parryReviewActive: read.parryReviewActive(snapshot),
      parryReviewRate,
      parryPromptHeld: Boolean(exchangeState.parryPromptHold),
      firstContact: exchangeState.firstContact,
      latestFinePlan: exchangeState.latestFinePlan,
      latestFineTracking: exchangeState.latestFineTracking,
      latestGuardCoverage: exchangeState.latestGuardCoverage,
      // R18V.1: the anchors and the compensations tuned with them were measured at one separation.
      // Say so on screen whenever the fighters are standing somewhere they were never verified.
      // R18Y.1: against the separation at contact rather than at the start, because that is what
      // the bands are facts about and what the guard's success actually tracks. Reading the start
      // distance here made the HUD call LEFT unverified at the default stance while it was
      // blocking 16 of 16.
      anchorCoverage: assessGuardAnchorCoverage({
        direction: read.selectedDirection(),
        separationMeters: effectiveSeparationAtContact(
          labScene.engagementStance?.separationMeters,
          ATTACK_ADVANCE_PROFILES[read.selectedDirection()]?.metersByContact ?? 0,
        ),
      }),
      latestReachableInterceptTarget: exchangeState.latestReachableInterceptTarget,
      latestGripConstraintReport: exchangeState.latestGripConstraintReport,
      step3AContactTransfer: exchangeState.step3AContactTransfer,
      defenderReleaseGate: contactHandoffController.defenderDeflectReleaseGate(),
      step3AOwnsLiveContact: contactHandoffController.ownsLiveContact(),
      directOldB3Diagnostic: exchangeState.directOldB3Diagnostic,
      debugMode,
    });
  }

  function buildReport(combatSnapshot = combat.snapshot) {
    const report = buildShieldParryVerificationReport({
      combatSnapshot,
      exchangeState,
      labStage,
      recoilStage,
      ready: read.ready(),
      selectedDirection: read.selectedDirection(),
      lockReport: read.lockReport?.() ?? null, // R20S.3
      sprintReport: read.sprintReport?.() ?? null, // R20U.1
      parryTally: read.parryTally?.() ?? null, // R21C.2
      // R21G.2: both of these were added to the HUD's source list but never forwarded here, so the
      // 對手 line has not updated once since R21E.1 shipped - the drive was only ever verified
      // through the debug API, which reads the runtime rather than the screen.
      opponent: read.opponent?.() ?? null, // R21E.1
      parryTallyReport: read.parryTallyReport?.() ?? null, // R21G.2
      swingInnerReach: exchangeState.latestSwingInnerReach, // R20T.2
      selectedMode: read.selectedMode(),
      parryProfile: parryGate.profile,
      defenderReleaseGate: contactHandoffController.defenderDeflectReleaseGate(),
      ownsLiveContact: contactHandoffController.ownsLiveContact(),
      inspectionCameraSnapshot: freeCamera.snapshot(),
      debugMode,
      debugStanceProfile: read.debugStanceProfile(),
      recentCompactTraceFrames,
      liveContactPhaseLatch,
    });
    const publication = serializeVerificationReport({
      report,
      maxCharacters: maxReportCharacters,
      traceFrames: exchangeState.interceptDriveTrace.length,
      recentTraceFrames: Math.min(exchangeState.interceptDriveTrace.length, recentCompactTraceFrames),
    });
    reportNode.textContent = publication.displayText;
    documentRef.documentElement.dataset.g43b5r281 = report.pass ? 'pass' : 'fail';
    windowRef.__G43B5R281_RESULT__ = report;
    windowRef.__G43B5R281_PERF__ = publication.perf;
    return report;
  }

  return Object.freeze({ updateParryCue, updateHud, buildReport });
}
