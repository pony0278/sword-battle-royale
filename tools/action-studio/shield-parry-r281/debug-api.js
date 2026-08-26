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
    triggerParryNow: actions.triggerParryNow,
    dispatchParryInput: actions.dispatchParryInput,
    forceOldTwoActorB3: actions.forceOldTwoActorB3,
    get directOldB3Diagnostic() { return getExchangeState().directOldB3Diagnostic; },
    get latestPredictiveReport() { return getExchangeState().latestPredictiveReport; },
    get latestShieldLeadMotion() { return getExchangeState().latestShieldLeadMotion; },
    get latestLeadHandoff() { return getExchangeState().latestLeadHandoff; },
    get latestCombatResult() { return getExchangeState().latestCombatResult; },
    get latestParryInput() { return getExchangeState().latestParryInput; },
    get latestParryOpportunity() { return getExchangeState().latestParryOpportunity; },
    get latestContact() { return getExchangeState().latestContact; },
    get latestParryConfirmation() { return getExchangeState().latestParryConfirmation; },
    get step3AContactTransfer() { return getExchangeState().step3AContactTransfer; },
    get latestGripConstraintReport() { return getExchangeState().latestGripConstraintReport; },
    get latestParryWhiff() { return getExchangeState().latestParryWhiff; },
    get latestInterceptDriveReport() { return getExchangeState().latestInterceptDriveReport; },
    get latestVisualOwnershipBaseline() { return getExchangeState().latestVisualOwnershipBaseline; },
    get visualOwnershipTrace() { return getExchangeState().visualOwnershipTrace; },
    get latestInputSignal() { return getExchangeState().latestInputSignal; },
    get activeParryInterceptDiagnosis() {
      return buildActiveParryInterceptDiagnosis({
        attackSnapshot: runtimes.attackRuntime.snapshot,
        exchangeState: getExchangeState(),
      });
    },
  };
}
