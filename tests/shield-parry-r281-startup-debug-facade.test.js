import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createShieldParryDebugApi } from '../tools/action-studio/shield-parry-r281/debug-api.js';

const source = readFileSync(
  new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url),
  'utf8',
);
const bootstrapUrl = new URL('../tools/action-studio/shield-parry-r281/lab-bootstrap.js', import.meta.url);
const bootstrapSource = readFileSync(bootstrapUrl, 'utf8');
const debugApiSource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/debug-api.js', import.meta.url),
  'utf8',
);

test('R18M.C5 entry delegates asset bootstrap while retaining ready and initial attack ordering', () => {
  assert.match(source, /bootstrapShieldParryLabAssets\(\{/);
  assert.doesNotMatch(source, /loadUal1AnimationLibrary/);
  assert.doesNotMatch(source, /loadUal2AnimationLibrary/);
  assert.doesNotMatch(source, /loadSkyrimConvertedAnimationLibrary/);

  const mainStart = source.indexOf('async function main()');
  const mainEnd = source.indexOf('\n}\n\nbindShieldParryLabUiEvents', mainStart);
  assert.ok(mainStart >= 0 && mainEnd > mainStart);
  const main = source.slice(mainStart, mainEnd);
  // R19I.1: boot no longer raises a guard or fires a demo attack - the lab opens neutral and the
  // first decision is the player's - so those two steps left the ordering. What remains still has
  // to happen in order: assets, then the shield surface baseline, then ready, then the report.
  const boot = main.indexOf('await bootstrapShieldParryLabAssets({');
  const surface = main.indexOf('exchangeState.previousShieldLeadSurface = cloneSurface', boot);
  const ready = main.indexOf('ready = true;', surface);
  const report = main.indexOf('buildReport();', ready);
  assert.ok(boot >= 0 && surface > boot && ready > surface && report > ready);
  assert.doesNotMatch(main, /enterGuard\(\);/, 'the defender must not be holding a guard nobody asked for');
  assert.doesNotMatch(main, /startAttack\(/, 'the lab must not open by attacking on its own');
});

test('R18M.C5 bootstrap owns only async asset registration and defender weapon bind initialization', () => {
  for (const marker of [
    'loadUal1AnimationLibrary',
    'loadUal2AnimationLibrary',
    'loadSkyrimConvertedAnimationLibrary',
    "attacker.registerAnimations(ual1)",
    "attacker.registerAnimations(ual2)",
    "defender.registerAnimations(skyrim)",
    "SKYRIM_GUARD/shd_blockidle",
    'weaponBindCalibration',
    'composeSkyrimWeaponMountCalibration',
    'mountDebugSword',
  ]) assert.ok(bootstrapSource.includes(marker), marker);
  for (const forbidden of [
    'parryGate',
    'combat.resolveContact',
    'probeSweptSwordBucklerContact',
    'swordGripConstraint',
    'triggerParryNow',
    "startAttack('right')",
    'ready = true',
    'requestAnimationFrame',
  ]) assert.ok(!bootstrapSource.includes(forbidden), forbidden);
});

test('R18M.C5 bootstrap relative imports resolve to real repository files', () => {
  const imports = [...bootstrapSource.matchAll(/from\s+['"](\.\.\/[^'"]+)['"]/g)].map((match) => match[1]);
  // R20Z.1 dropped the count that used to sit here. What it protected was that these resolve; what
  // it actually did was fail this suite - and the thin-entry audit's copy of the same number - every
  // time bootstrap legitimately reached for one more module, which by R20W.1 had happened twice in
  // a fortnight. A count is a poor way to say "do not grow dependencies quietly", and it was not
  // saying it here: bootstrap loading a library is exactly this file's job.
  assert.ok(imports.length > 0, 'bootstrap must load something');
  for (const specifier of imports) {
    const resolved = new URL(specifier, bootstrapUrl);
    assert.ok(existsSync(resolved), `${specifier} must resolve from lab-bootstrap.js`);
  }
});

test('R18M.C5 debug facade preserves the public API shape without owning gameplay execution', () => {
  const noop = () => null;
  const exchangeState = {
    directOldB3Diagnostic: 'direct', latestPredictiveReport: 'predictive', latestShieldLeadMotion: 'lead',
    latestLeadHandoff: 'handoff', latestCombatResult: 'combat-result', latestParryInput: 'input',
    latestParryOpportunity: 'opportunity', latestContact: 'contact', latestBodyHit: 'body-hit', latestParryConfirmation: 'confirmation',
    step3AContactTransfer: 'transfer', latestGripConstraintReport: 'grip',
    latestFinePlan: 'fine-plan', latestFineTracking: 'fine-tracking',
    latestGuardCoverage: 'guard-coverage', latestGuardResidual: 'guard-residual', latestGuardStanceReach: 'guard-stance', latestParryWhiff: 'whiff',
    latestInterceptDriveReport: 'drive', latestVisualOwnershipBaseline: 'visual-baseline',
    visualOwnershipTrace: ['visual-trace'], latestInputSignal: 'signal',
    latestEngagementGround: 'lane-ledger',
    latestRootDisplacement: 'root-plan', latestAttackerRootDisplacement: 'attacker-root',
    latestDefenderRootDisplacement: 'defender-root',
    latestArmFling: 'arm-fling', latestArmFlingReport: 'arm-fling-report',
    latestTorsoLean: 'torso-lean', latestTorsoLeanReport: 'torso-lean-report',
    latestDefenderTorsoLeanReport: 'defender-torso-lean-report', blockReaction: 'block-reaction',
  };
  const runtimes = {
    combat: {}, attackRuntime: {}, guardMachine: {}, predictivePresentation: {}, parryGate: {}, freeCamera: {},
    residualBodyReachRuntime: {}, residualStanceReachRuntime: {}, swordGripConstraint: {},
    labScene: { engagementStance: { separationMeters: 2.3 } },
  };
  const api = createShieldParryDebugApi({
    actions: {
      startAttack: noop, restartAttack: noop, setMode: noop, refreshDebugStanceProfile: noop,
      resetDebugStanceDefaults: noop, triggerParryNow: noop, dispatchParryInput: noop, forceOldTwoActorB3: noop,
      setEngagementSeparation: noop,
    },
    runtimes,
    debugMode: true,
    getDebugStanceProfile: () => ({ hip: 1 }),
    getExchangeState: () => exchangeState,
  });
  // R20Z.1 replaced an exhaustive, ORDER-SENSITIVE list of every key with the contract that is
  // actually depended on. The old list had grown to 90 entries, and because it was a deepEqual on
  // Object.keys, adding one read-only getter anywhere in the facade failed this suite and had to be
  // paid for by editing a list in a file that has nothing to do with the change. It happened twice
  // in one afternoon (R20W.2, R20X.1). What it was protecting - "the facade does not quietly grow
  // gameplay authority" - is not something a key count can say, and the assertions below say it
  // directly: the injected actions are passed through untouched, and the getters are reads.
  //
  // REQUIRED_KEYS is derived rather than curated: every `__G43B5R281_LAB__.x` and `api.x` reached
  // for by the golden grid capture, the parry gate probe and the test suite. Dropping one of these
  // breaks a gate, so they are the shape worth pinning. Adding new keys is free.
  const REQUIRED_KEYS = [
    'startAttack', 'restartAttack', 'setMode', 'setGuardHeld', 'setFixedStepMs', 'resetLane',
    'triggerParryNow', 'dispatchParryInput', 'forceOldTwoActorB3', 'setEngagementSeparation',
    'combat', 'attackRuntime', 'guardMachine', 'predictivePresentation', 'parryGate', 'frameClock',
    'debugMode', 'debugStanceProfile',
    'latestCombatResult', 'latestContact', 'latestParryInput', 'latestParryOpportunity',
    'latestParryConfirmation', 'latestParryWhiff', 'latestShieldLeadMotion', 'latestArmFling',
    'latestInterceptDriveReport', 'latestVisualOwnershipBaseline', 'visualOwnershipTrace',
    'directOldB3Diagnostic', 'latestAttackerRootDisplacement', 'latestDefenderRootDisplacement',
    'latestTorsoLeanReport', 'laneGround', 'lockReport', 'sprintReport', 'toggleLock',
  ];
  const present = new Set(Object.keys(api));
  const missing = REQUIRED_KEYS.filter((key) => !present.has(key));
  assert.deepEqual(missing, [], `the debug facade dropped keys the gates and tests depend on: ${missing}`);
  assert.equal(api.startAttack, noop);
  assert.equal(api.combat, runtimes.combat);
  assert.equal(api.debugMode, true);
  assert.deepEqual(api.debugStanceProfile, { hip: 1 });
  assert.ok(Object.isFrozen(api.debugStanceProfile));
  assert.equal(api.directOldB3Diagnostic, 'direct');
  assert.equal(api.latestAttackerRootDisplacement, 'attacker-root');
  assert.equal(api.latestDefenderRootDisplacement, 'defender-root');
  assert.equal(api.latestArmFling, 'arm-fling');
  assert.equal(api.latestTorsoLeanReport, 'torso-lean-report');
  assert.equal(api.latestContact, 'contact');
  assert.equal(api.latestVisualOwnershipBaseline, 'visual-baseline');
  assert.deepEqual(api.visualOwnershipTrace, ['visual-trace']);
  for (const key of ['latestVisualOwnershipBaseline', 'visualOwnershipTrace']) {
    const descriptor = Object.getOwnPropertyDescriptor(api, key);
    assert.equal(typeof descriptor?.get, 'function', `${key} must remain a getter`);
    assert.equal(descriptor?.set, undefined, `${key} must remain read-only`);
  }
  exchangeState.latestParryInput = 'input-2';
  exchangeState.latestContact = 'contact-2';
  exchangeState.latestVisualOwnershipBaseline = 'visual-baseline-2';
  exchangeState.visualOwnershipTrace = ['visual-trace-2'];
  assert.equal(api.latestParryInput, 'input-2');
  assert.equal(api.latestContact, 'contact-2');
  assert.equal(api.latestVisualOwnershipBaseline, 'visual-baseline-2');
  assert.deepEqual(api.visualOwnershipTrace, ['visual-trace-2']);
});

test('R18M.C5 debug-api module only exposes injected actions, runtimes, and read-only getters', () => {
  for (const forbidden of [
    'parryGate.arm', 'parryGate.confirm', 'combat.resolveContact', 'probeSweptSwordBucklerContact',
    'swordGripConstraint.start', 'requestAnimationFrame', 'attackRuntime.update', 'guardRuntime.update',
  ]) assert.ok(!debugApiSource.includes(forbidden), forbidden);
  assert.match(debugApiSource, /get latestContact\(\) \{ return getExchangeState\(\)\.latestContact; \}/);
  assert.match(debugApiSource, /get latestVisualOwnershipBaseline\(\) \{ return getExchangeState\(\)\.latestVisualOwnershipBaseline; \}/);
  assert.match(debugApiSource, /get visualOwnershipTrace\(\) \{ return getExchangeState\(\)\.visualOwnershipTrace; \}/);
  assert.match(source, /window\.__G43B5R281_LAB__ = createShieldParryDebugApi\(\{/);
  assert.match(source, /function frame\(timestamp\)/);
  assert.match(source, /function triggerParryNow\(source = 'button'\)/);
  assert.match(source, /function startAttack\(direction = selectedDirection\)/);
  assert.match(source, /function restartAttack\(direction = selectedDirection\)/);
  assert.match(source, /function resetExchange\(\)/);
});