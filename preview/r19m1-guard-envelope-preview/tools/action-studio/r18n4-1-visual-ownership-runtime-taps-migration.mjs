import { readFile, writeFile } from 'node:fs/promises';

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`R18N.4.1-B migration missing anchor: ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`R18N.4.1-B migration anchor is not unique: ${label}`);
  }
  return source.replace(needle, replacement);
}

async function patch(path, transform) {
  const source = await readFile(path, 'utf8');
  const next = transform(source);
  if (next !== source) await writeFile(path, next, 'utf8');
}

await patch('tools/action-studio/shield-parry-r281/pre-contact-controller.js', (original) => {
  if (original.includes("from './visual-ownership-runtime-taps.js'")) return original;
  let source = original;
  source = `import { createVisualOwnershipRuntimeTaps } from './visual-ownership-runtime-taps.js';\n\n${source}`;
  source = replaceOnce(
    source,
    '  const PARRY_PROMPT_HOLD_MS = promptHoldMs;\n',
    '  const PARRY_PROMPT_HOLD_MS = promptHoldMs;\n  const visualOwnership = createVisualOwnershipRuntimeTaps({ rig: defender.rig, exchangeState });\n',
    'create visual ownership runtime taps',
  );
  source = replaceOnce(
    source,
    '        camera,\n      });\n      const predictiveSurface = cloneSurface(buckler.getWorldParrySurface());',
    '        camera,\n      });\n      visualOwnership.afterPredictive(exchangeState.latestPredictiveReport);\n      const predictiveSurface = cloneSurface(buckler.getWorldParrySurface());',
    'predictive presentation tap',
  );
  source = replaceOnce(
    source,
    '      exchangeState.latestFineTracking = fineTrackingRuntime.update(exchangeState.latestFinePlan, deltaSeconds);\n      const residualCarryBeforeMeters',
    '      exchangeState.latestFineTracking = fineTrackingRuntime.update(exchangeState.latestFinePlan, deltaSeconds);\n      visualOwnership.afterPrimaryArm(exchangeState.latestFineTracking);\n      const residualCarryBeforeMeters',
    'primary active intercept tap',
  );
  source = replaceOnce(
    source,
    '          })\n        : null;\n      const residualAfterArmRefinement = measureSweptSwordBucklerClosestApproach({',
    '          })\n        : null;\n      visualOwnership.afterResidualArm(residualRefinement);\n      const residualAfterArmRefinement = measureSweptSwordBucklerClosestApproach({',
    'residual arm tap',
  );
  source = replaceOnce(
    source,
    "            closestApproach: residualAfterArmRefinement,\n          }, deltaSeconds);\n      const residualAfterBodyReach",
    "            closestApproach: residualAfterArmRefinement,\n          }, deltaSeconds);\n      visualOwnership.afterBody(residualBodyReach);\n      const residualAfterBodyReach",
    'body reach tap',
  );
  source = replaceOnce(
    source,
    '        },\n      }, deltaSeconds);\n      const activeInterceptArmClosure = activeIntentPlan',
    '        },\n      }, deltaSeconds);\n      visualOwnership.afterStance(residualStanceReach);\n      const activeInterceptArmClosure = activeIntentPlan',
    'stance reach tap',
  );
  source = replaceOnce(
    source,
    '          })\n        : null;\n      // Rebuild dynamic line geometry once after all pose solvers have finished.',
    '          })\n        : null;\n      visualOwnership.afterFinalClosure(activeInterceptArmClosure);\n      // Rebuild dynamic line geometry once after all pose solvers have finished.',
    'final arm closure tap',
  );
  source = replaceOnce(
    source,
    '  function resetActiveIntercept() { activeInterceptIntent?.reset(); }',
    '  function resetActiveIntercept() { activeInterceptIntent?.reset(); visualOwnership.reset(); }',
    'visual ownership reset',
  );
  source = replaceOnce(
    source,
    "  function updatePreContact(snapshot, currentBlade, deltaSeconds) {\n    const context = readContext();\n    if (!snapshot.action || exchangeState.firstContact) return;\n    if (context.selectedMode === 'block') updateBlockPreContact(snapshot, currentBlade, deltaSeconds, context);\n    else updateParryPreContact(snapshot, currentBlade, deltaSeconds, context);\n  }",
    "  function updatePreContact(snapshot, currentBlade, deltaSeconds) {\n    const context = readContext();\n    if (!snapshot.action || exchangeState.firstContact) return;\n    const observeVisualOwnership = context.selectedMode === 'parry';\n    if (observeVisualOwnership) visualOwnership.beginFrame(snapshot);\n    try {\n      if (context.selectedMode === 'block') updateBlockPreContact(snapshot, currentBlade, deltaSeconds, context);\n      else updateParryPreContact(snapshot, currentBlade, deltaSeconds, context);\n    } finally {\n      if (observeVisualOwnership) visualOwnership.finishFrame();\n    }\n  }",
    'pre-contact frame begin/finalize taps',
  );
  return source;
});

await patch('tools/action-studio/shield-parry-r281/exchange-state.js', (original) => {
  if (original.includes("'latestVisualOwnershipBaseline'")) return original;
  let source = original;
  source = replaceOnce(
    source,
    "  'interceptDriveTrace',\n  'latestPredictiveReport',",
    "  'interceptDriveTrace',\n  'latestVisualOwnershipBaseline',\n  'visualOwnershipTrace',\n  'latestPredictiveReport',",
    'exchange visual ownership keys',
  );
  source = replaceOnce(
    source,
    '    interceptDriveTrace: [],\n    latestPredictiveReport: null,',
    '    interceptDriveTrace: [],\n    latestVisualOwnershipBaseline: null,\n    visualOwnershipTrace: [],\n    latestPredictiveReport: null,',
    'exchange visual ownership defaults',
  );
  return source;
});

await patch('tools/action-studio/shield-parry-r281/debug-api.js', (original) => {
  if (original.includes('latestVisualOwnershipBaseline')) return original;
  return replaceOnce(
    original,
    '    get latestInterceptDriveReport() { return getExchangeState().latestInterceptDriveReport; },\n    get latestInputSignal()',
    '    get latestInterceptDriveReport() { return getExchangeState().latestInterceptDriveReport; },\n    get latestVisualOwnershipBaseline() { return getExchangeState().latestVisualOwnershipBaseline; },\n    get visualOwnershipTrace() { return getExchangeState().visualOwnershipTrace; },\n    get latestInputSignal()',
    'debug visual ownership getters',
  );
});

await patch('tests/shield-parry-r281-exchange-state.test.js', (original) => {
  if (original.includes("'latestVisualOwnershipBaseline'")) return original;
  let source = original;
  source = replaceOnce(
    source,
    "  'interceptDriveTrace',\n  'latestPredictiveReport',",
    "  'interceptDriveTrace',\n  'latestVisualOwnershipBaseline',\n  'visualOwnershipTrace',\n  'latestPredictiveReport',",
    'expected exchange visual ownership keys',
  );
  source = replaceOnce(
    source,
    "  assert.deepEqual(state.interceptDriveTrace, []);\n  for (const key of EXPECTED_EXCHANGE_KEYS) {\n    if (key === 'whiffProbeFrames' || key === 'interceptDriveTrace') continue;",
    "  assert.deepEqual(state.interceptDriveTrace, []);\n  assert.deepEqual(state.visualOwnershipTrace, []);\n  for (const key of EXPECTED_EXCHANGE_KEYS) {\n    if (key === 'whiffProbeFrames' || key === 'interceptDriveTrace' || key === 'visualOwnershipTrace') continue;",
    'exchange default trace assertions',
  );
  source = replaceOnce(
    source,
    '  const originalTrace = state.interceptDriveTrace;\n  const surface',
    '  const originalTrace = state.interceptDriveTrace;\n  const originalVisualOwnershipTrace = state.visualOwnershipTrace;\n  const surface',
    'capture visual ownership trace identity',
  );
  source = replaceOnce(
    source,
    "  state.interceptDriveTrace = [{ telemetryDetail: 'dirty' }];\n\n  const returned",
    "  state.interceptDriveTrace = [{ telemetryDetail: 'dirty' }];\n  state.visualOwnershipTrace = [{ telemetryDetail: 'dirty-visual-ownership' }];\n\n  const returned",
    'dirty visual ownership trace',
  );
  source = replaceOnce(
    source,
    "  assert.deepEqual(state.interceptDriveTrace, []);\n  assert.notEqual(state.interceptDriveTrace, originalTrace);",
    "  assert.deepEqual(state.interceptDriveTrace, []);\n  assert.deepEqual(state.visualOwnershipTrace, []);\n  assert.notEqual(state.interceptDriveTrace, originalTrace);\n  assert.notEqual(state.visualOwnershipTrace, originalVisualOwnershipTrace);",
    'reset visual ownership trace assertions',
  );
  source = replaceOnce(
    source,
    "    if (['previousShieldLeadSurface', 'whiffProbeFrames', 'interceptDriveTrace'].includes(key)) continue;",
    "    if (['previousShieldLeadSurface', 'whiffProbeFrames', 'interceptDriveTrace', 'visualOwnershipTrace'].includes(key)) continue;",
    'skip visual trace null assertion',
  );
  return source;
});

await patch('tests/shield-parry-r281-visual-ownership-baseline.test.js', (original) => {
  if (original.includes('R18N.4.1-B reconstructs the cross-frame Guard writer delta')) return original;
  const addition = `\n\ntest('R18N.4.1-B reconstructs the cross-frame Guard writer delta and ordered pre-contact taps', async () => {\n  const { createVisualOwnershipRuntimeTaps } = await import('../tools/action-studio/shield-parry-r281/visual-ownership-runtime-taps.js');\n  const rig = fakeRig();\n  const exchangeState = { latestVisualOwnershipBaseline: null, visualOwnershipTrace: [] };\n  const taps = createVisualOwnershipRuntimeTaps({ rig, exchangeState, traceLimit: 4 });\n\n  taps.beginFrame({ sequence: 1, phase: 'attack_active', elapsedSeconds: 0.20 });\n  rig.bones.chest.quaternion = yaw(4);\n  taps.afterPredictive({ active: true, shieldArmOwnership: 'external-active-intercept-tracking' });\n  rig.bones['upperarm.l'].quaternion = yaw(7);\n  taps.afterPrimaryArm({ active: true, achievedDistance: 0.01 });\n  rig.bones['lowerarm.l'].quaternion = yaw(5);\n  taps.afterResidualArm({ achievedDistance: 0.002 });\n  rig.bones.chest.quaternion = yaw(6);\n  taps.afterBody({ active: true, authority: 'fixed-world-target-support-chain-no-contact-authority' });\n  taps.afterStance({ activeCandidate: false, authority: 'pre-contact-guidance-only-real-swept-contact-required' });\n  rig.bones['upperarm.l'].quaternion = yaw(8);\n  taps.afterFinalClosure({ achievedDistance: 0.001 });\n  const first = taps.finishFrame();\n  assert.equal(first.orderValid, true);\n  assert.deepEqual(first.observedOrder, R18N_VISUAL_OWNERSHIP_ORDER);\n  assert.equal(exchangeState.visualOwnershipTrace.length, 1);\n\n  rig.bones.head.quaternion = yaw(3);\n  taps.beginFrame({ sequence: 1, phase: 'attack_active', elapsedSeconds: 0.216 });\n  const second = taps.finishFrame();\n  assert.equal(second.orderValid, true);\n  assert.ok(second.changedByWriter[R18N_VISUAL_OWNERSHIP_WRITERS.GUARD_RUNTIME].includes('head'));\n  assert.equal(second.lastWriterByBone.head, R18N_VISUAL_OWNERSHIP_WRITERS.GUARD_RUNTIME);\n  assert.equal(second.samples[0].metadata.baselineQualified, true);\n  assert.equal(exchangeState.visualOwnershipTrace.length, 2);\n  assert.equal(taps.authority, 'observer-only-cross-frame-guard-baseline-no-rig-write-no-contact-authority');\n});\n\ntest('R18N.4.1-B runtime tap adapter remains observer-only', async () => {\n  const source = await readFile(new URL('../tools/action-studio/shield-parry-r281/visual-ownership-runtime-taps.js', import.meta.url), 'utf8');\n  assert.doesNotMatch(source, /\\.quaternion\\.(?:copy|set|premultiply|multiply|slerp)/);\n  assert.doesNotMatch(source, /combat\\.resolveContact|parryGate\\.(?:arm|confirm)|probeSweptSwordBucklerContact/);\n  assert.match(source, /observer-only-cross-frame-guard-baseline-no-rig-write-no-contact-authority/);\n});\n\ntest('R18N.4.1-B wires taps after existing writers and exposes diagnostics without changing contact authority', async () => {\n  const preContact = await readFile(new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url), 'utf8');\n  const exchangeStateSource = await readFile(new URL('../tools/action-studio/shield-parry-r281/exchange-state.js', import.meta.url), 'utf8');\n  const debugApi = await readFile(new URL('../tools/action-studio/shield-parry-r281/debug-api.js', import.meta.url), 'utf8');\n  const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');\n  const anchors = [\n    'visualOwnership.beginFrame(snapshot)',\n    'predictivePresentation.update({',\n    'visualOwnership.afterPredictive(exchangeState.latestPredictiveReport)',\n    'fineTrackingRuntime.update(exchangeState.latestFinePlan, deltaSeconds)',\n    'visualOwnership.afterPrimaryArm(exchangeState.latestFineTracking)',\n    'fineTrackingRuntime.refineMeasuredContact(',\n    'visualOwnership.afterResidualArm(residualRefinement)',\n    'visualOwnership.afterBody(residualBodyReach)',\n    'visualOwnership.afterStance(residualStanceReach)',\n    'fineTrackingRuntime.refineWorldTarget(',\n    'visualOwnership.afterFinalClosure(activeInterceptArmClosure)',\n    'visualOwnership.finishFrame()',\n  ];\n  let previousIndex = -1;\n  for (const anchor of anchors) {\n    const index = preContact.indexOf(anchor);\n    assert.ok(index > previousIndex, 'tap/writer order regression near ' + anchor);\n    previousIndex = index;\n  }\n  assert.match(exchangeStateSource, /latestVisualOwnershipBaseline/);\n  assert.match(exchangeStateSource, /visualOwnershipTrace/);\n  assert.match(debugApi, /get latestVisualOwnershipBaseline\\(\\)/);\n  assert.match(debugApi, /get visualOwnershipTrace\\(\\)/);\n  assert.doesNotMatch(preContact, /parryGate\\.confirm\\(|combat\\.resolveContact\\(|probeSweptSwordBucklerContact\\(/);\n  assert.ok(entry.split('\\n').length <= 725, 'R18N.4.1-B must not expand the thin R281 entry');\n});\n`;
  return `${original}${addition}`;
});

console.log('R18N.4.1-B visual ownership runtime taps migration applied');
