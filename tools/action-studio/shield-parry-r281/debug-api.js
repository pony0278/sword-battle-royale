import { buildActiveParryInterceptDiagnosis } from './active-parry-intercept-diagnosis.js';

// R18M.C5 — debug facade composition only.
// This module exposes injected actions/runtimes and read-only exchange getters; it owns no gameplay authority.

// R23D.1 - the clips a mirror duel needs, named once. The three swings are the attack runtime's
// own directional table and the guard hold is what a defence is presented from; a fighter missing
// any of them cannot take that half of the duel, and before this stage each fighter was missing
// the other's half entirely.
export const MIRROR_DUEL_REQUIRED_CLIPS = Object.freeze({
  top: 'UAL1/Sword_Attack',
  right: 'UAL2/Sword_Regular_A',
  left: 'UAL2/Sword_Regular_B',
  guardHold: 'SKYRIM_GUARD/shd_blockidle',
});

export function clipInventory(character) {
  if (!character?.hasAnimation) return null;
  return Object.freeze(Object.fromEntries(
    Object.entries(MIRROR_DUEL_REQUIRED_CLIPS)
      .map(([role, clipId]) => [role, character.hasAnimation(clipId) === true]),
  ));
}

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
    // R21U.1: how much of the run's arms the walk is wearing. Exposed because the thing this
    // replaced was a visible switch, and a ramp that cannot be read is a ramp nobody can check.
    get laneDefenderSprintArmWeight() { return runtimes.laneController?.defenderSprintArmWeight ?? null; },
    // R21Y.1: which run those arms came from, and whether it was asked for or is the default.
    get laneDefenderSprintArmClip() { return runtimes.laneController?.defenderSprintArmClip ?? null; },
    // R23B.1: proof from the live page that both fighters assembled. Reads the stage rather than the
    // parts, because what is being checked is that the attacker's rig satisfied every guard runtime
    // - a failure shows up as a load-time throw, and this is how a probe sees the success.
    get fighters() {
      return Object.freeze({
        defender: runtimes.defenderFighter?.stage ?? null,
        attacker: runtimes.attackerFighter?.stage ?? null,
        // R23D.1: and what each of them can actually PLAY, which is a different question from
        // whether their runtimes assembled and was the one nobody had asked. Read off the live
        // characters rather than restated from the loader, so a registration that silently did
        // not happen reads as false here instead of as a throw three steps later.
        canPlay: Object.freeze({
          defender: clipInventory(runtimes.defenderFighter?.character),
          attacker: clipInventory(runtimes.attackerFighter?.character),
        }),
        // R23J.1: what each of them has left, and whether they may act at all.
        condition: Object.freeze({
          defender: runtimes.defenderFighter?.condition?.report ?? null,
          attacker: runtimes.attackerFighter?.condition?.report ?? null,
        }),
        // R23Q.1: whether each is currently reeling from a blow - the frame the reaction owns.
        reacting: Object.freeze({
          defender: runtimes.defenderFighter?.bodyStrikeReaction?.active === true,
          attacker: runtimes.attackerFighter?.bodyStrikeReaction?.active === true,
        }),
        // R23S.1: whether each shield is up, read off the stance the contact stack reads.
        guarding: Object.freeze({
          defender: runtimes.defenderFighter?.stance?.report?.guardActive === true,
          attacker: runtimes.attackerFighter?.stance?.report?.guardActive === true,
        }),
      });
    },
    // R20X.1: which way the body is travelling in its own frame, and how far the stride is turned.
    get laneDefenderTravelPlan() { return runtimes.laneController?.defenderTravelPlan ?? null; },
    // R21A.2: where the player is pointing. Read-only, and nothing consults it to decide anything.
    get guardSector() { return runtimes.guardSector?.report ?? null; },
    // R23E.1: which mount the player's sword is wearing and why. A dial nobody can read the state
    // of is a dial nobody can tell was on.
    get weaponMount() { return runtimes.weaponMount?.report ?? null; },
    get swingLedger() { return runtimes.swingLedger?.report ?? null; }, // R23L.1
    // R23G.1: the player's own swing, from the outside. Whether it is live, where its blade got to
    // and what its exchange concluded - the same three questions the opponent's side already
    // answers, now askable of the half a person is driving.
    get playerAttackRefusal() { return runtimes.playerAttackRefusal?.() ?? null; }, // R23J.1
    get playerSwing() {
      const player = runtimes.playerEngagement?.();
      if (!player) return null;
      const snapshot = player.attackRuntime.snapshot;
      return Object.freeze({
        active: player.attackRuntime.active === true,
        phase: snapshot?.phase ?? null,
        direction: snapshot?.direction ?? null,
        elapsedSeconds: Number(snapshot?.elapsedSeconds ?? 0),
        combatActive: player.combat.active === true,
        recovering: player.hasRecovery,
        firstContact: player.exchangeState.firstContact ?? null,
        latestBodyHit: player.exchangeState.latestBodyHit ?? null,
        outcome: player.exchangeState.latestCombatResult?.resolution?.outcome ?? null,
      });
    },
    // R21C.2: attempts per direction, split by why they missed.
    get parryTally() { return runtimes.parryTally?.rows ?? null; },
    // R21E.1: where the self-driving opponent thinks it is and what it will throw next.
    get opponentDrive() { return runtimes.opponentDriveController?.report ?? null; },
    get opponentGuard() { return runtimes.opponentDriveController?.guardReport ?? null; }, // R23S.1
    setOpponentDrive: (on) => runtimes.opponentDriveController?.setEnabled(on) ?? false,
    setOpponentSeed: (seed) => runtimes.opponentDriveController?.reseed(seed) ?? null,
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
    resetDuel: actions.resetDuel, // R23J.1: both fighters back to full
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
