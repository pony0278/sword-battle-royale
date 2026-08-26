import { readFileSync, writeFileSync } from 'node:fs';

const path = 'tests/shield-sword-hand-contact-coupling-lab.test.js';

function replaceUnique(block, oldSource, newSource, label) {
  if (!block.includes(oldSource)) {
    throw new Error(`R18N.3 v6.4 pre-contact ownership migration could not locate ${label}`);
  }
  if (block.indexOf(oldSource) !== block.lastIndexOf(oldSource)) {
    throw new Error(`R18N.3 v6.4 pre-contact ownership migration expected one ${label}`);
  }
  if (block.includes(newSource)) {
    throw new Error(`R18N.3 v6.4 pre-contact ownership migration found ${label} already migrated`);
  }
  return block.replace(oldSource, newSource);
}

function migrateTest(source, testName, changes) {
  const marker = `test('${testName}'`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`R18N.3 v6.4 pre-contact ownership migration missing test: ${testName}`);
  const next = source.indexOf('\ntest(', start + marker.length);
  const end = next < 0 ? source.length : next;
  let block = source.slice(start, end);
  for (const [oldSource, newSource, label] of changes) {
    block = replaceUnique(block, oldSource, newSource, `${testName}: ${label}`);
  }
  return source.slice(0, start) + block + source.slice(end);
}

function migrateAssertionOwner(source, testName, assertionPrefix, newOwner, label) {
  const marker = `test('${testName}'`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`R18N.3 v6.4 pre-contact ownership migration missing test: ${testName}`);
  const next = source.indexOf('\ntest(', start + marker.length);
  const end = next < 0 ? source.length : next;
  const block = source.slice(start, end);
  const oldSource = `assert.match(source, /${assertionPrefix}`;
  const newSource = `assert.match(${newOwner}, /${assertionPrefix}`;
  if (!block.includes(oldSource)) {
    throw new Error(`R18N.3 v6.4 pre-contact ownership migration could not locate ${testName}: ${label}`);
  }
  if (block.indexOf(oldSource) !== block.lastIndexOf(oldSource)) {
    throw new Error(`R18N.3 v6.4 pre-contact ownership migration expected one ${testName}: ${label}`);
  }
  const migrated = block.replace(oldSource, newSource);
  return source.slice(0, start) + migrated + source.slice(end);
}

let source = readFileSync(path, 'utf8');

source = migrateTest(source,
  'Step 3A replaces only an unreachable linear target with reachable measured sweep guidance', [
    [
      `  const updateStart = source.indexOf('function updateParryPreContact(');\n  const updateEnd = source.indexOf('function updatePreContact(', updateStart);\n  const update = source.slice(updateStart, updateEnd);`,
      `  const update = preContactFunctionBody('updateParryPreContact', 'updatePreContact');`,
      'pre-contact function ownership',
    ],
    ['assert.match(source, /selectReachableParryInterceptTarget/);', 'assert.match(preContactSource, /selectReachableParryInterceptTarget/);', 'reachable selector ownership'],
    ['assert.match(update, /predictedTrackingPlan: latestPredictiveAnalysis\\?\\.trackingPlan/);', 'assert.match(update, /predictedTrackingPlan: exchangeState\\.latestPredictiveAnalysis\\?\\.trackingPlan/);', 'predictive tracking state ownership'],
    ['assert.match(update, /threat: latestReachableInterceptTarget\\.threat/);', 'assert.match(update, /threat: exchangeState\\.latestReachableInterceptTarget\\.threat/);', 'selected threat state ownership'],
    ['assert.match(source, /measuredSweepFallbackIsGuidanceOnly/);', 'assert.match(verificationReportSource, /measuredSweepFallbackIsGuidanceOnly/);', 'guidance-only invariant ownership'],
    ['assert.match(source, /real contact still required/);', 'assert.match(verificationReportSource, /realSweptContactRequired/);', 'real-contact invariant ownership'],
  ]);

source = migrateTest(source,
  'armed Parry samples a continuous post-tracking shield surface before selecting and driving the next frame', [
    [
      `  const updateStart = source.indexOf('function updateParryPreContact(');\n  const updateEnd = source.indexOf('function updatePreContact(', updateStart);\n  const update = source.slice(updateStart, updateEnd);`,
      `  const update = preContactFunctionBody('updateParryPreContact', 'updatePreContact');`,
      'pre-contact function ownership',
    ],
    ["const continuity = update.indexOf('const continuitySurface = previousShieldLeadSurface');", "const continuity = update.indexOf('const continuitySurface = exchangeState.previousShieldLeadSurface');", 'continuity state ownership'],
    ["assert.match(source, /selectorBaseline: 'previous-frame-post-tracking-world-shield-surface'/);", "assert.match(preContactSource, /selectorBaseline: 'previous-frame-post-tracking-world-shield-surface'/);", 'selector baseline ownership'],
    ['assert.match(update, /latestReachableInterceptTarget\\?\\.fallbackApplied[\\s\\S]*latestReachableInterceptTarget\\.trackingPlan/);', 'assert.match(update, /exchangeState\\.latestReachableInterceptTarget\\?\\.fallbackApplied[\\s\\S]*exchangeState\\.latestReachableInterceptTarget\\.trackingPlan/);', 'fallback tracking state ownership'],
    ['assert.match(source, /drivePlanSource: latestReachableInterceptTarget\\?\\.fallbackApplied/);', 'assert.match(preContactSource, /drivePlanSource: activeIntentPlan[\\s\\S]*exchangeState\\.latestReachableInterceptTarget\\?\\.fallbackApplied/);', 'drive source ownership'],
    ['assert.match(source, /surface-relative-measured-contact-correction/);', 'assert.match(preContactSource, /surface-relative-measured-contact-correction/);', 'surface-relative correction ownership'],
    ['assert.match(source, /correctionDirectionDot/);', 'assert.match(preContactSource, /correctionDirectionDot/);', 'direction telemetry ownership'],
    ['assert.match(source, /measuredRadialContactCorrectionMeters/);', 'assert.match(preContactSource, /measuredRadialContactCorrectionMeters/);', 'radial correction ownership'],
    [
      "assert.match(source, /if \\(selectedMode !== 'parry' \\|\\| !parryGate\\.armed/);",
      "assert.match(source, /if \\(exchangeState\\.latestParryInput\\.accepted\\) \\{[\\s\\S]*predictivePresentation\\.start/);\n  assert.match(update, /if \\(predictivePresentation\\.active\\) \\{/);",
      'accepted-arm predictive-presentation gate',
    ],
    ['assert.match(source, /selector NO ARMED DRIVE FRAME/);', 'assert.match(diagnosticFormattersSource, /selector NO ARMED DRIVE FRAME/);', 'no-drive formatter ownership'],
  ]);

const lowStanceTestName = 'armed Parry recruits predicted or measured low stance, holds it, and preserves contact authority';
source = migrateTest(source, lowStanceTestName, [
  [
    `  const updateStart = source.indexOf('function updateParryPreContact(');\n  const updateEnd = source.indexOf('function updatePreContact(', updateStart);\n  const update = source.slice(updateStart, updateEnd);`,
    `  const update = preContactFunctionBody('updateParryPreContact', 'updatePreContact');`,
    'pre-contact function ownership',
  ],
  ['assert.match(update, /anticipatedClosestApproach: latestPredictiveAnalysis\\?\\.threat\\?\\.worldPoint/);', 'assert.match(update, /anticipatedClosestApproach: exchangeState\\.latestPredictiveAnalysis\\?\\.threat\\?\\.worldPoint/);', 'anticipated closest approach ownership'],
  ['assert.match(update, /point: latestPredictiveAnalysis\\.threat\\.worldPoint/);', 'assert.match(update, /point: exchangeState\\.latestPredictiveAnalysis\\.threat\\.worldPoint/);', 'anticipated point ownership'],
  ['assert.match(update, /anticipatedLeadSeconds: latestPredictiveAnalysis\\?\\.threat\\?\\.futureSeconds/);', 'assert.match(update, /anticipatedLeadSeconds: exchangeState\\.latestPredictiveAnalysis\\?\\.threat\\?\\.futureSeconds/);', 'anticipated lead ownership'],
  ['assert.match(source, /persistent-arm-carry-then-predicted-or-measured-low-threat-planted-stance-held-to-real-contact-or-reset-diagnostic/);', 'assert.match(preContactSource, /persistent-arm-carry-then-predicted-or-measured-low-threat-planted-stance-held-to-real-contact-or-reset-diagnostic/);', 'stance authority telemetry ownership'],
  ['assert.match(source, /sampledThreat\\?\\.kneeLineThreat/);', 'assert.match(diagnosticFormattersSource, /sampledThreat\\?\\.kneeLineThreat/);', 'sampled threat formatter ownership'],
  ['assert.match(source, /y blade\\/rim\\/kneeL\\/kneeR/);', 'assert.match(diagnosticFormattersSource, /y blade\\/rim\\/kneeL\\/kneeR/);', 'height formatter ownership'],
  ['assert.match(source, /earlyLowThreatRecruitment/);', 'assert.match(diagnosticFormattersSource, /earlyLowThreatRecruitment/);', 'early stance formatter ownership'],
  ['assert.match(source, /stance src/);', 'assert.match(diagnosticFormattersSource, /stance src/);', 'stance source formatter ownership'],
  ["assert.match(source, /lead ' \\+ stanceLead/);", "assert.match(diagnosticFormattersSource, /lead ' \\+ stanceLead/);", 'stance lead formatter ownership'],
  ["assert.match(source, /hold ' \\+ stanceHold/);", "assert.match(diagnosticFormattersSource, /hold ' \\+ stanceHold/);", 'stance hold formatter ownership'],
  ["assert.match(source, /target ' \\+ crouchTarget/);", "assert.match(diagnosticFormattersSource, /target ' \\+ crouchTarget/);", 'stance target formatter ownership'],
  ["const block = functionBody('updateBlockPreContact', 'updateParryPreContact');", "const block = preContactFunctionBody('updateBlockPreContact', 'updateParryPreContact');", 'Block negative-path ownership'],
]);

for (const [prefix, label] of [
  ['residual edge ', 'residual edge formatter ownership'],
  ['carry ', 'carry formatter ownership'],
  ['refine ', 'refinement formatter ownership'],
  ['arm ', 'arm formatter ownership'],
  ['torso ', 'torso formatter ownership'],
  ['stance ', 'stance state formatter ownership'],
  ['feet ', 'foot formatter ownership'],
]) {
  source = migrateAssertionOwner(source, lowStanceTestName, prefix, 'diagnosticFormattersSource', label);
}

source = migrateTest(source,
  'F review batches presentation rebuilds and avoids dynamic debug bounds work', [
    ["const update = functionBody('updateParryPreContact', 'updatePreContact');", "const update = preContactFunctionBody('updateParryPreContact', 'updatePreContact');", 'pre-contact function ownership'],
    [
      `  const markerSetter = functionBody('setInspectionLine', 'updateLiveContactMarkers');\n  const markerUpdate = functionBody('updateLiveContactMarkers', 'resize');\n  assert.ok(!markerSetter.includes('computeBoundingSphere'));\n  assert.ok(!markerUpdate.includes('computeBoundingSphere'));\n  assert.ok(source.includes('contactTravelLine.frustumCulled = false'));\n  assert.ok(source.includes('line.frustumCulled = false'));`,
      `  assert.doesNotMatch(inspectionOverlaySource, /computeBoundingSphere/);\n  assert.match(inspectionOverlaySource, /contactTravelLine\\.frustumCulled = false/);\n  assert.match(inspectionOverlaySource, /line\\.frustumCulled = false/);`,
      'inspection-overlay performance ownership',
    ],
    [
      `  const cue = functionBody('showParryCue', 'updateParryCue');\n  assert.ok(cue.includes('state === parryCueState'));\n  assert.ok(cue.includes(') return;'));`,
      `  const cueStart = labUiSource.indexOf('function showParryCue(');\n  const cueEnd = labUiSource.indexOf('function updateParryCue(', cueStart);\n  assert.ok(cueStart >= 0 && cueEnd > cueStart);\n  const cue = labUiSource.slice(cueStart, cueEnd);\n  assert.ok(cue.includes('state === parryCueState'));\n  assert.ok(cue.includes(') return;'));`,
      'cue dedup ownership',
    ],
  ]);

writeFileSync(path, source);
console.log('R18N.3 v6.4 pre-contact ownership contracts migrated.');
