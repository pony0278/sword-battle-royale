import { buildActiveParryInterceptDiagnosis } from './active-parry-intercept-diagnosis.js';

// R18M.C5 — debug facade composition only.
// This module exposes injected actions/runtimes and read-only exchange getters; it owns no gameplay authority.

export function createShieldParryDebugApi({
  actions,
  runtimes,
  debugMode,
  getDebugStanceProfile,
  getExchangeState,
}) {
  return {
    startAttack: actions.startAttack,
    restartAttack: actions.restartAttack,
    setMode: actions.setMode,
    combat: runtimes.combat,
    attackRuntime: runtimes.attackRuntime,
    guardMachine: runtimes.guardMachine,
    predictivePresentation: runtimes.predictivePresentation,
    parryGate: runtimes.parryGate,
    freeCamera: runtimes.freeCamera,
    residualBodyReachRuntime: runtimes.residualBodyReachRuntime,
    residualStanceReachRuntime: runtimes.residualStanceReachRuntime,
    debugMode,
    get debugStanceProfile() { return Object.freeze({ ...getDebugStanceProfile() }); },
    refreshDebugStanceProfile: actions.refreshDebugStanceProfile,
    resetDebugStanceDefaults: actions.resetDebugStanceDefaults,
    swordGripConstraint: runtimes.swordGripConstraint,
    setEngagementSeparation: actions.setEngagementSeparation,
    resetLane: actions.resetLane,
    // R20E.1 WARNING: invasive mid-exchange. getWorldParrySurface advances anchor matrices
    // outside the frame pipeline and measurably flips outcomes (RIGHT@2.1m: passive polling
    // 3/3 blocked, polling this 3/3 body hits). Call it between exchanges only.
    captureBladeGeometry: actions.captureBladeGeometry,
    // R21A.1: passive, safe mid-swing - see the note beside its action.
    readBladePolyline: actions.readBladePolyline,
    get laneGround() { return runtimes.laneController?.report ?? null; },
    get laneDefenderIntent() { return runtimes.laneController?.defenderIntent ?? 0; },
    get laneDefenderLateralIntent() { return runtimes.laneController?.defenderLateralIntent ?? 0; },
    get laneAttackerIntent() { return runtimes.laneController?.attackerIntent ?? 0; },
    get laneAttackerGait() { return runtimes.laneController?.attackerGait ?? null; },
    get laneDefenderGait() { return runtimes.laneController?.defenderGait ?? null; },
    // R20W.2: how much of the defender the walk took this frame - legs under a raised guard, the
    // whole fighter when there is no guard to hold, none while an exchange owns them.
    get laneDefenderWalkOverlay() { return runtimes.laneController?.defenderWalkOverlay ?? null; },
    // R20X.1: which way the body is travelling in its own frame, and how far the stride is turned.
    get laneDefenderTravelPlan() { return runtimes.laneController?.defenderTravelPlan ?? null; },
    // R21A.2: where the player is pointing. Read-only, and nothing consults it to decide anything.
    get guardSector() { return runtimes.guardSector?.report ?? null; },
    // R21C.2: attempts per direction, split by why they missed.
    get parryTally() { return runtimes.parryTally?.rows ?? null; },
    get laneAttackerWalkSample() { return runtimes.laneController?.attackerWalkSample ?? null; },
    get engagementStance() { return runtimes.labScene?.engagementStance ?? null; },
    setDefenderYawOffset: (radians) => runtimes.labScene?.setDefenderYawOffset?.(radians) ?? null, // R19Q.1 facing seam (tests drive it directly)
    triggerParryNow: actions.triggerParryNow,
    dispatchParryInput: actions.dispatchParryInput,
    setGuardHeld: actions.setGuardHeld, // R20G.1: probes and drivers hold the guard directly
    // R20K.1 (B6e): a harness pins the frame step so a cell's trajectory is reproducible, and
    // counts frames instead of milliseconds. setFixedStepMs(null) hands the clock back to the wall.
    setFixedStepMs: actions.setFixedStepMs,
    // R20S.3: free movement and the lock. Probes drive these directly; the keyboard is one caller.
    playerController: runtimes.playerController,
    toggleLock: () => runtimes.playerController?.toggleLock?.() ?? null,
    setMoveIntent: (intent) => runtimes.playerController?.setMoveIntent?.(intent) ?? null,
    get lockReport() { return runtimes.playerController?.lockReport ?? null; },
    get cameraPose() { return runtimes.playerController?.cameraPose ?? null; },
    setSprintRequested: (held) => runtimes.playerController?.setSprintRequested?.(held) ?? null, // R20U.1
    get sprintReport() { return runtimes.playerController?.sprintReport ?? null; },
    get frameClock() { return runtimes.frameClock?.report ?? null; },
    get defenderStance() { return runtimes.defenderStance?.report ?? null; },
    forceOldTwoActorB3: actions.forceOldTwoActorB3,
    get directOldB3Diagnostic() { return getExchangeState().directOldB3Diagnostic; },
    get latestPredictiveReport() { return getExchangeState().latestPredictiveReport; },
    get latestShieldLeadMotion() { return getExchangeState().latestShieldLeadMotion; },
    get latestLeadHandoff() { return getExchangeState().latestLeadHandoff; },
    get latestCombatResult() { return getExchangeState().latestCombatResult; },
    get latestParryInput() { return getExchangeState().latestParryInput; },
    get latestParryOpportunity() { return getExchangeState().latestParryOpportunity; },
    get latestContact() { return getExchangeState().latestContact; },
    get latestBodyHit() { return getExchangeState().latestBodyHit; },
    get latestParryConfirmation() { return getExchangeState().latestParryConfirmation; },
    get step3AContactTransfer() { return getExchangeState().step3AContactTransfer; },
    get latestGripConstraintReport() { return getExchangeState().latestGripConstraintReport; },
    get latestFinePlan() { return getExchangeState().latestFinePlan; },
    get latestFineTracking() { return getExchangeState().latestFineTracking; },
    get latestGuardCoverage() { return getExchangeState().latestGuardCoverage; },
    get latestSwingRelevance() { return getExchangeState().latestSwingRelevance; },
    get latestSwingInnerReach() { return getExchangeState().latestSwingInnerReach; }, // R20T.2
    get latestCloseRangePosture() { return getExchangeState().latestCloseRangePosture; },
    get latestConeGate() { return getExchangeState().latestConeGate; },
    get latestDodge() { return getExchangeState().latestDodge; },
    tryDodge: (direction) => actions.tryDodge?.(direction) ?? null, // R20G.1: routed through the stance gate
    get latestHiltClang() { return getExchangeState().latestHiltClang; },
    get latestGuardFacingPlan() { return getExchangeState().latestGuardFacingPlan; },
    get defenderFacingYawRadians() { return runtimes.laneController?.defenderFacingYawRadians ?? 0; },
    get attackerBaseFacingRadians() { return runtimes.laneController?.attackerBaseFacingRadians ?? null; }, // R20T.1
    get defenderBaseFacingRadians() { return runtimes.laneController?.defenderBaseFacingRadians ?? null; },
    // R20V.1: how far the defender's body is from square to the opponent. The cone gate reads this
    // to decide whether committing coverage is worth anything, and until now a probe could not see
    // what the gate saw.
    get defenderFacingErrorRadians() { return runtimes.laneController?.defenderFacingErrorRadians ?? null; },
    // R20V.2: the owned-facing seam (R20N.1), for probes that need to hold a fighter pointed
    // somewhere the keys would not hold them - null hands facing back to the geometry.
    setDefenderFacing: (radians) => runtimes.laneController?.setDefenderFacing?.(radians) ?? null,
    get latestGuardResidual() { return getExchangeState().latestGuardResidual; },
    get latestGuardStanceReach() { return getExchangeState().latestGuardStanceReach; },
    get latestParryWhiff() { return getExchangeState().latestParryWhiff; },
    get latestInterceptDriveReport() { return getExchangeState().latestInterceptDriveReport; },
    get latestVisualOwnershipBaseline() { return getExchangeState().latestVisualOwnershipBaseline; },
    get visualOwnershipTrace() { return getExchangeState().visualOwnershipTrace; },
    get latestInputSignal() { return getExchangeState().latestInputSignal; },
    get latestEngagementGround() { return getExchangeState().latestEngagementGround; },
    get latestRootDisplacement() { return getExchangeState().latestRootDisplacement; },
    get latestAttackerRootDisplacement() { return getExchangeState().latestAttackerRootDisplacement; },
    get latestDefenderRootDisplacement() { return getExchangeState().latestDefenderRootDisplacement; },
    get latestArmFling() { return getExchangeState().latestArmFling; },
    get latestArmFlingReport() { return getExchangeState().latestArmFlingReport; },
    get latestTorsoLean() { return getExchangeState().latestTorsoLean; },
    get latestTorsoLeanReport() { return getExchangeState().latestTorsoLeanReport; },
    get latestDefenderTorsoLeanReport() { return getExchangeState().latestDefenderTorsoLeanReport; },
    get blockReaction() { return getExchangeState().blockReaction; },
    get activeParryInterceptDiagnosis() {
      return buildActiveParryInterceptDiagnosis({
        attackSnapshot: runtimes.attackRuntime.snapshot,
        exchangeState: getExchangeState(),
      });
    },
  };
}
