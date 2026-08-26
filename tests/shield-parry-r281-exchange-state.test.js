import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SHIELD_PARRY_EXCHANGE_STATE_KEYS,
  createShieldParryExchangeState,
  resetShieldParryExchangeState,
} from '../tools/action-studio/shield-parry-r281/exchange-state.js';

const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const preContactController = await readFile(new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url), 'utf8');
const contactHandoffController = await readFile(new URL('../tools/action-studio/shield-parry-r281/contact-handoff-controller.js', import.meta.url), 'utf8');
const visualOwnershipRuntimeTaps = await readFile(new URL('../tools/action-studio/shield-parry-r281/visual-ownership-runtime-taps.js', import.meta.url), 'utf8');
const debugApi = await readFile(new URL('../tools/action-studio/shield-parry-r281/debug-api.js', import.meta.url), 'utf8');
const exchangeOwnershipSources = `${entry}\n${preContactController}\n${contactHandoffController}\n${visualOwnershipRuntimeTaps}\n${debugApi}`;

const EXPECTED_EXCHANGE_KEYS = [
  'previousShieldLeadSurface',
  'firstContact',
  'latestContact',
  'latestCombatResult',
  'latestCombatUpdate',
  'latestFinePlan',
  'latestFineTracking',
  'latestPredictiveAnalysis',
  'latestReachableInterceptTarget',
  'latestInterceptDriveReport',
  'interceptDriveTrace',
  'latestVisualOwnershipBaseline',
  'visualOwnershipTrace',
  'latestPredictiveReport',
  'latestPredictiveHandoff',
  'latestShieldLeadMotion',
  'latestLeadHandoff',
  'directOldB3Diagnostic',
  'latestParryInput',
  'latestParryOpportunity',
  'latestParryConfirmation',
  'frozenAttackerContactPose',
  'canonicalAttackerOldB3Pose',
  'canonicalAttackerOldB3WorldSilhouette',
  'step3AContactTransfer',
  'latestGripConstraintReport',
  'latestLiveSurfaceAtContact',
  'step3AReleaseBlend',
  'visibleOldB3Peak',
  'latchedDefenderDeflectReleaseGate',
  'latestRootDisplacement',
  'latestAttackerRootDisplacement',
  'latestDefenderRootDisplacement',
  'latestParryWhiff',
  'whiffProbeFrames',
  'closestWhiffApproach',
  'outsideActiveContact',
  'latestInputSignal',
  'parryPromptHold',
  'parryPromptHoldSequence',
];

test('R18M.4 exchange state owns exactly the mutable values reset per exchange', () => {
  assert.deepEqual(SHIELD_PARRY_EXCHANGE_STATE_KEYS, EXPECTED_EXCHANGE_KEYS);
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
