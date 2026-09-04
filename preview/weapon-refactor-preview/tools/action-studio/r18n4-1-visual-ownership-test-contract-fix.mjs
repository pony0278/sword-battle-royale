import { readFile, writeFile } from 'node:fs/promises';

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`R18N.4.1-B test-contract fix missing anchor: ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`R18N.4.1-B test-contract fix anchor is not unique: ${label}`);
  }
  return source.replace(needle, replacement);
}

async function patch(path, transform) {
  const source = await readFile(path, 'utf8');
  const next = transform(source);
  if (next !== source) await writeFile(path, next, 'utf8');
}

await patch('tests/shield-parry-r281-exchange-state.test.js', (original) => {
  if (original.includes('const visualOwnershipRuntimeTaps = await readFile')) return original;
  let source = original;
  source = replaceOnce(
    source,
    "const contactHandoffController = await readFile(new URL('../tools/action-studio/shield-parry-r281/contact-handoff-controller.js', import.meta.url), 'utf8');\nconst exchangeOwnershipSources = `${entry}\\n${preContactController}\\n${contactHandoffController}`;",
    "const contactHandoffController = await readFile(new URL('../tools/action-studio/shield-parry-r281/contact-handoff-controller.js', import.meta.url), 'utf8');\nconst visualOwnershipRuntimeTaps = await readFile(new URL('../tools/action-studio/shield-parry-r281/visual-ownership-runtime-taps.js', import.meta.url), 'utf8');\nconst debugApi = await readFile(new URL('../tools/action-studio/shield-parry-r281/debug-api.js', import.meta.url), 'utf8');\nconst exchangeOwnershipSources = `${entry}\\n${preContactController}\\n${contactHandoffController}\\n${visualOwnershipRuntimeTaps}\\n${debugApi}`;",
    'exchange ownership sources include observer modules',
  );
  return source;
});

await patch('tests/shield-parry-r281-visual-ownership-baseline.test.js', (original) => {
  let source = original;
  if (!source.includes('R18N_VISUAL_OWNERSHIP_ORDER,')) {
    source = replaceOnce(
      source,
      '  R18N_VISUAL_OWNERSHIP_BASELINE_STAGE,\n  R18N_VISUAL_OWNERSHIP_WRITERS,',
      '  R18N_VISUAL_OWNERSHIP_BASELINE_STAGE,\n  R18N_VISUAL_OWNERSHIP_ORDER,\n  R18N_VISUAL_OWNERSHIP_WRITERS,',
      'visual ownership order import',
    );
  }

  const oldOrderAssertion = `  const anchors = [
    'visualOwnership.beginFrame(snapshot)',
    'predictivePresentation.update({',
    'visualOwnership.afterPredictive(exchangeState.latestPredictiveReport)',
    'fineTrackingRuntime.update(exchangeState.latestFinePlan, deltaSeconds)',
    'visualOwnership.afterPrimaryArm(exchangeState.latestFineTracking)',
    'fineTrackingRuntime.refineMeasuredContact(',
    'visualOwnership.afterResidualArm(residualRefinement)',
    'visualOwnership.afterBody(residualBodyReach)',
    'visualOwnership.afterStance(residualStanceReach)',
    'fineTrackingRuntime.refineWorldTarget(',
    'visualOwnership.afterFinalClosure(activeInterceptArmClosure)',
    'visualOwnership.finishFrame()',
  ];
  let previousIndex = -1;
  for (const anchor of anchors) {
    const index = preContact.indexOf(anchor);
    assert.ok(index > previousIndex, 'tap/writer order regression near ' + anchor);
    previousIndex = index;
  }`;

  const newOrderAssertion = `  function assertBefore(sourceText, earlier, later, label) {
    const earlierIndex = sourceText.indexOf(earlier);
    const laterIndex = sourceText.indexOf(later);
    assert.ok(earlierIndex >= 0, 'missing writer anchor: ' + earlier);
    assert.ok(laterIndex > earlierIndex, 'tap must follow writer: ' + label);
  }
  const parryStart = preContact.indexOf('function updateParryPreContact');
  const parryEnd = preContact.indexOf('function armActiveIntercept', parryStart);
  const parrySource = preContact.slice(parryStart, parryEnd);
  assertBefore(parrySource, 'predictivePresentation.update({', 'visualOwnership.afterPredictive(exchangeState.latestPredictiveReport)', 'predictive presentation');
  assertBefore(parrySource, 'fineTrackingRuntime.update(exchangeState.latestFinePlan, deltaSeconds)', 'visualOwnership.afterPrimaryArm(exchangeState.latestFineTracking)', 'primary active intercept arm');
  assertBefore(parrySource, 'fineTrackingRuntime.refineMeasuredContact(', 'visualOwnership.afterResidualArm(residualRefinement)', 'residual active intercept arm');
  assertBefore(parrySource, 'const residualBodyReach = activeIntentPlan', 'visualOwnership.afterBody(residualBodyReach)', 'residual body reach');
  assertBefore(parrySource, 'const residualStanceReach = residualStanceReachRuntime.update({', 'visualOwnership.afterStance(residualStanceReach)', 'residual stance reach');
  assertBefore(parrySource, 'fineTrackingRuntime.refineWorldTarget(', 'visualOwnership.afterFinalClosure(activeInterceptArmClosure)', 'final arm closure');

  const updateStart = preContact.indexOf('function updatePreContact');
  const updateEnd = preContact.indexOf('function recordWhiffProbe', updateStart);
  const updateSource = preContact.slice(updateStart, updateEnd);
  assertBefore(updateSource, 'visualOwnership.beginFrame(snapshot)', 'updateParryPreContact(snapshot, currentBlade, deltaSeconds, context)', 'frame begin before parry writers');
  assertBefore(updateSource, 'updateParryPreContact(snapshot, currentBlade, deltaSeconds, context)', 'visualOwnership.finishFrame()', 'frame finish after parry writers');`;

  if (source.includes(oldOrderAssertion)) {
    source = replaceOnce(
      source,
      oldOrderAssertion,
      newOrderAssertion,
      'scope writer-tap ordering assertions to runtime functions',
    );
  } else if (!source.includes("const parryStart = preContact.indexOf('function updateParryPreContact');")) {
    throw new Error('R18N.4.1-B test-contract fix could not find structural ordering assertion');
  }
  return source;
});

console.log('R18N.4.1-B focused telemetry test contracts corrected');
