import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SHIELD_PARRY_EXCHANGE_STATE_KEYS,
  SHIELD_PARRY_EXCHANGE_STATE_GROUPS,
  createShieldParryExchangeState,
  resetShieldParryExchangeState,
} from '../tools/action-studio/shield-parry-r281/exchange-state.js';

const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const preContactController = await readFile(new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url), 'utf8');
const contactHandoffController = await readFile(new URL('../tools/action-studio/shield-parry-r281/contact-handoff-controller.js', import.meta.url), 'utf8');
const visualOwnershipRuntimeTaps = await readFile(new URL('../tools/action-studio/shield-parry-r281/visual-ownership-runtime-taps.js', import.meta.url), 'utf8');
const debugApi = await readFile(new URL('../tools/action-studio/shield-parry-r281/debug-api.js', import.meta.url), 'utf8');
const frameReporting = await readFile(new URL('../tools/action-studio/shield-parry-r281/frame-reporting.js', import.meta.url), 'utf8');
const exchangeOwnershipSources = `${entry}\n${preContactController}\n${contactHandoffController}\n${visualOwnershipRuntimeTaps}\n${debugApi}\n${frameReporting}`;

// R20D.1: pasted literals, grouped. The groups are the map the eventual multiplayer split
// follows - outcomes and handoffs are simulation, diagnostics and traces are client-side.
const EXPECTED_OUTCOME_KEYS = [
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
];
const EXPECTED_HANDOFF_KEYS = [
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
];
const EXPECTED_DIAGNOSTIC_KEYS = [
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
  'latestDodge',
];
const EXPECTED_TRACE_KEYS = [
  'interceptDriveTrace',
  'visualOwnershipTrace',
  'whiffProbeFrames',
  'closestWhiffApproach',
  'outsideActiveContact',
];
const EXPECTED_EXCHANGE_KEYS = [
  ...EXPECTED_OUTCOME_KEYS,
  ...EXPECTED_HANDOFF_KEYS,
  ...EXPECTED_DIAGNOSTIC_KEYS,
  ...EXPECTED_TRACE_KEYS,
];

test('R20D.1 every key belongs to exactly one group, and the groups are the key list', () => {
  assert.deepEqual(SHIELD_PARRY_EXCHANGE_STATE_GROUPS.outcome, EXPECTED_OUTCOME_KEYS);
  assert.deepEqual(SHIELD_PARRY_EXCHANGE_STATE_GROUPS.handoff, EXPECTED_HANDOFF_KEYS);
  assert.deepEqual(SHIELD_PARRY_EXCHANGE_STATE_GROUPS.diagnostic, EXPECTED_DIAGNOSTIC_KEYS);
  assert.deepEqual(SHIELD_PARRY_EXCHANGE_STATE_GROUPS.trace, EXPECTED_TRACE_KEYS);
  assert.deepEqual(SHIELD_PARRY_EXCHANGE_STATE_KEYS, EXPECTED_EXCHANGE_KEYS);
  assert.equal(new Set(SHIELD_PARRY_EXCHANGE_STATE_KEYS).size, SHIELD_PARRY_EXCHANGE_STATE_KEYS.length,
    'no key sits in two groups');
});

test('R20D.1 rule modules never read the blackboard, and diagnostics never feed a rule', async () => {
  // src/combat must stay pure: no rule module may touch exchangeState at all - the blackboard
  // is the lab's, and the R19Z incident is what a rule quietly keyed to lab state costs.
  const { readdir } = await import('node:fs/promises');
  const combatFiles = (await readdir(new URL('../src/combat', import.meta.url))).filter((f) => f.endsWith('.js'));
  for (const file of combatFiles) {
    const source = await readFile(new URL(`../src/combat/${file}`, import.meta.url), 'utf8');
    assert.ok(!source.includes('exchangeState'), `src/combat/${file} must not touch the exchange blackboard`);
  }
});

test('R18M.4 exchange state owns exactly the mutable values reset per exchange', () => {
  const state = createShieldParryExchangeState();
  assert.deepEqual(Object.keys(state), EXPECTED_EXCHANGE_KEYS);
  assert.equal(state.whiffProbeFrames, 0);
  assert.deepEqual(state.interceptDriveTrace, []);
  assert.deepEqual(state.visualOwnershipTrace, []);
  for (const key of EXPECTED_EXCHANGE_KEYS) {
    if (key === 'whiffProbeFrames' || key === 'interceptDriveTrace' || key === 'visualOwnershipTrace') continue;
    assert.equal(state[key], null, 'default should remain null for ' + key);
  }
});

test('R18M.4 reset preserves state identity and restores the exact exchange defaults', () => {
  const state = createShieldParryExchangeState();
  const originalTrace = state.interceptDriveTrace;
  const originalVisualOwnershipTrace = state.visualOwnershipTrace;
  const surface = Object.freeze({ center: Object.freeze({ x: 1, y: 2, z: 3 }) });
  for (const key of EXPECTED_EXCHANGE_KEYS) state[key] = { dirty: key };
  state.whiffProbeFrames = 17;
  state.interceptDriveTrace = [{ telemetryDetail: 'dirty' }];
  state.visualOwnershipTrace = [{ telemetryDetail: 'dirty-visual-ownership' }];

  const returned = resetShieldParryExchangeState(state, { previousShieldLeadSurface: surface });
  assert.equal(returned, state);
  assert.equal(state.previousShieldLeadSurface, surface);
  assert.equal(state.whiffProbeFrames, 0);
  assert.deepEqual(state.interceptDriveTrace, []);
  assert.deepEqual(state.visualOwnershipTrace, []);
  assert.notEqual(state.interceptDriveTrace, originalTrace);
  assert.notEqual(state.visualOwnershipTrace, originalVisualOwnershipTrace);
  for (const key of EXPECTED_EXCHANGE_KEYS) {
    if (['previousShieldLeadSurface', 'whiffProbeFrames', 'interceptDriveTrace', 'visualOwnershipTrace'].includes(key)) continue;
    assert.equal(state[key], null, 'reset should clear ' + key);
  }
});

test('R18M.4 entry uses one explicit exchange owner while lab/runtime lifetime stays separate', () => {
  assert.match(entry, /shield-parry-r281\/exchange-state\.js/);
  assert.match(entry, /const exchangeState = createShieldParryExchangeState\(\);/);
  assert.match(entry, /resetShieldParryExchangeState\(exchangeState, \{/);
  assert.match(entry, /previousShieldLeadSurface: cloneSurface\(buckler\.getWorldParrySurface\(\)\)/);

  for (const key of EXPECTED_EXCHANGE_KEYS) {
    assert.doesNotMatch(exchangeOwnershipSources, new RegExp('\\blet\\s+' + key + '\\b'), 'loose exchange let remains: ' + key);
    assert.match(exchangeOwnershipSources, new RegExp('exchangeState\\.' + key + '\\b'), 'exchange owner is not used for: ' + key);
  }

  for (const persistentName of [
    'ready',
    'selectedDirection',
    'selectedMode',
    'lastTimestamp',
    'attackerIdleDuration',
    'attackerIdleClockSeconds',
    'attackerRecovery',
    'repeatCooldownMs',
    'previousBlade',
    'hudClockMs',
    'reportClockMs',
  ]) {
    assert.match(entry, new RegExp('\\blet\\s+' + persistentName + '\\b'), 'persistent lab/runtime state should stay outside exchange owner: ' + persistentName);
  }
});

test('R18M.4 state owner contains no combat authority or runtime calls', async () => {
  const source = await readFile(new URL('../tools/action-studio/shield-parry-r281/exchange-state.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /parryGate\.|combat\.|swordGripConstraint\.|guardRuntime\.|attackRuntime\./);
  assert.doesNotMatch(source, /resolveContact|DEFLECT_IMPULSE|OLD B3/);
});
