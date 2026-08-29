// R20D.1 — the exchange blackboard, with its boundaries drawn.
//
// One flat mutable object, reset per exchange, owned here. That much is unchanged. What R20D
// adds is the map: every key now belongs to exactly one of four groups, from a read/write audit
// of every consumer (writers and readers per key, and whether a reader DECIDES on the value or
// only displays it). The groups exist because the eventual multiplayer split needs them - a
// server simulation keeps outcomes and handoffs, a client keeps diagnostics and traces - and
// because the R19Z incident showed what an unmapped boundary costs. The physical split is
// deliberately NOT done here: the lab stays on one object, and the map keeps the split honest
// whenever it happens.
//
// The rule the groups enforce from now on: a new key must land in a group, and a RULE module
// (src/combat) must never read a DIAGNOSTIC key - diagnostics are downstream of decisions,
// never upstream.

// What the exchange concluded. Written at resolution points, legitimate to read anywhere.
export const EXCHANGE_OUTCOME_KEYS = Object.freeze([
  'firstContact',
  'latestContact',
  'latestBodyHit',
  'latestHiltClang',
  'latestCombatResult',
  'latestCombatUpdate',
  'latestParryInput',
  'latestParryOpportunity',
  'latestParryConfirmation',
  'latestParryWhiff',
]);

// Live control flow that happens to travel through the blackboard: one controller writes, and
// a DIFFERENT frame or controller reads it to decide. These are the hidden edges the audit
// named; each is a candidate for explicit injection the day its cost is paid.
//   previousShieldLeadSurface        pre-contact frame N -> N+1 continuity; entry seeds on reset
//   latestPredictiveAnalysis         pre-contact -> entry armActiveIntercept
//   latestPredictiveReport           pre-contact self-feed across frames (authored delta, elapsed)
//   latestPredictiveHandoff          pre-contact -> contact-handoff takePredictiveHandoff
//   latestShieldLeadMotion           pre-contact -> contact-handoff (lead speed at contact)
//   latestCloseRangePosture          pre-contact -> contact-handoff readCloseRangePosture (R19P)
//   latestGuardFacingPlan            pre-contact -> entry -> laneController.walk (R19Q liveness)
//   frozenAttackerContactPose        contact-handoff -> attacker-presentation
//   canonicalAttackerOldB3Pose       attacker-presentation <-> contact-handoff
//   canonicalAttackerOldB3WorldSilhouette  attacker-presentation -> contact-handoff
//   step3AReleaseBlend               contact-handoff -> attacker-presentation
//   latestGripConstraintReport       contact-handoff cross-frame latch
//   visibleOldB3Peak                 contact-handoff cross-frame latch
//   latchedDefenderDeflectReleaseGate  contact-handoff cross-frame latch
//   latestRootDisplacement           contact-handoff cross-frame latch
//   parryPromptHold(+Sequence)       pre-contact <-> entry (slow-review pause)
export const CONTROLLER_HANDOFF_KEYS = Object.freeze([
  'previousShieldLeadSurface',
  'latestPredictiveAnalysis',
  'latestPredictiveReport',
  'latestPredictiveHandoff',
  'latestShieldLeadMotion',
  'latestCloseRangePosture',
  'latestGuardFacingPlan',
  'frozenAttackerContactPose',
  'canonicalAttackerOldB3Pose',
  'canonicalAttackerOldB3WorldSilhouette',
  'step3AReleaseBlend',
  'latestGripConstraintReport',
  'visibleOldB3Peak',
  'latchedDefenderDeflectReleaseGate',
  'latestRootDisplacement',
  'parryPromptHold',
  'parryPromptHoldSequence',
]);

// Published every frame for the HUD, the report, and the debug facade. Nothing decides on
// these - and nothing may start to without moving the key up a group first.
export const FRAME_DIAGNOSTIC_KEYS = Object.freeze([
  'latestFinePlan',
  'latestFineTracking',
  'latestGuardCoverage',
  'latestSwingRelevance',
  'latestConeGate',
  'latestGuardResidual',
  'latestGuardStanceReach',
  'latestReachableInterceptTarget',
  'latestInterceptDriveReport',
  'latestVisualOwnershipBaseline',
  'latestLeadHandoff',
  'directOldB3Diagnostic',
  'step3AContactTransfer',
  'latestLiveSurfaceAtContact',
  'latestEngagementGround',
  'latestAttackerRootDisplacement',
  'latestDefenderRootDisplacement',
  'latestArmFling',
  'latestArmFlingReport',
  'latestTorsoLean',
  'latestTorsoLeanReport',
  'latestDefenderTorsoLeanReport',
  'blockReaction',
  'latestInputSignal',
]);

// Bounded accumulators: ring buffers and best-of records that grow during an exchange.
export const EXCHANGE_TRACE_KEYS = Object.freeze([
  'interceptDriveTrace',
  'visualOwnershipTrace',
  'whiffProbeFrames',
  'closestWhiffApproach',
  'outsideActiveContact',
]);

export const SHIELD_PARRY_EXCHANGE_STATE_GROUPS = Object.freeze({
  outcome: EXCHANGE_OUTCOME_KEYS,
  handoff: CONTROLLER_HANDOFF_KEYS,
  diagnostic: FRAME_DIAGNOSTIC_KEYS,
  trace: EXCHANGE_TRACE_KEYS,
});

export const SHIELD_PARRY_EXCHANGE_STATE_KEYS = Object.freeze([
  ...EXCHANGE_OUTCOME_KEYS,
  ...CONTROLLER_HANDOFF_KEYS,
  ...FRAME_DIAGNOSTIC_KEYS,
  ...EXCHANGE_TRACE_KEYS,
]);

// The three keys that do not reset to null. Fresh instances per reset on purpose - a shared
// array surviving reset would leak one exchange's trace into the next.
function nonNullDefault(key) {
  if (key === 'whiffProbeFrames') return 0;
  if (key === 'interceptDriveTrace' || key === 'visualOwnershipTrace') return [];
  return null;
}

function createResetSnapshot() {
  return Object.fromEntries(SHIELD_PARRY_EXCHANGE_STATE_KEYS.map((key) => [key, nonNullDefault(key)]));
}

export function createShieldParryExchangeState() {
  return createResetSnapshot();
}

export function resetShieldParryExchangeState(state, {
  previousShieldLeadSurface = null,
} = {}) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('resetShieldParryExchangeState requires a mutable state object');
  }
  Object.assign(state, createResetSnapshot());
  state.previousShieldLeadSurface = previousShieldLeadSurface;
  return state;
}
