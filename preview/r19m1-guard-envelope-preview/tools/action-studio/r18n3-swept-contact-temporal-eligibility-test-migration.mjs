import { readFileSync, writeFileSync } from 'node:fs';

function migrateExact(path, oldSource, newSource, label) {
  let source = readFileSync(path, 'utf8');
  if (!source.includes(oldSource)) {
    throw new Error(`R18N.3 v6.4 could not locate ${label}`);
  }
  if (source.indexOf(oldSource) !== source.lastIndexOf(oldSource)) {
    throw new Error(`R18N.3 v6.4 expected one ${label}`);
  }
  if (source.includes(newSource)) {
    throw new Error(`R18N.3 v6.4 ${label} already migrated`);
  }
  source = source.replace(oldSource, newSource);
  writeFileSync(path, source);
}

const contactHandoffTestPath = 'tests/shield-parry-r281-contact-handoff-controller.test.js';
const oldOrder = `  indexOrder(controller, [\n    'exchangeState.latestContact = probeSweptSwordBucklerContact({',\n    'if (!exchangeState.latestContact.contact) return;',\n    'parryGate.confirm({ attackSnapshot: snapshot, contact: exchangeState.latestContact })',\n    'exchangeState.latestCombatResult = combat.resolveContact({',\n    'exchangeState.latestGripConstraintReport = swordGripConstraint.start({',\n  ]);\n  assert.match(controller, /active: snapshot\\.phase === LONGSWORD_ATTACK_PHASES\\.ACTIVE/);`;
const newOrder = `  indexOrder(controller, [\n    'const geometricContact = probeSweptSwordBucklerContact({',\n    'exchangeState.latestContact = evaluateSweptContactTemporalEligibility({',\n    'if (!exchangeState.latestContact.contact) return;',\n    'parryGate.confirm({ attackSnapshot: snapshot, contact: exchangeState.latestContact })',\n    'exchangeState.latestCombatResult = combat.resolveContact({',\n    'exchangeState.latestGripConstraintReport = swordGripConstraint.start({',\n  ]);\n  assert.match(controller, /active: true/);\n  assert.match(controller, /fallbackEligible: snapshot\\.phase === LONGSWORD_ATTACK_PHASES\\.ACTIVE/);`;

migrateExact(
  contactHandoffTestPath,
  oldOrder,
  newOrder,
  'contact authority source contract',
);

const preContactTestPath = 'tests/shield-parry-r281-pre-contact-controller.test.js';
const oldR18M5Order = `  const probeIndex = contactHandoffController.indexOf('exchangeState.latestContact = probeSweptSwordBucklerContact({');\n  const whiffIndex = contactHandoffController.indexOf('preContactController.recordWhiffProbe(snapshot, exchangeState.latestContact);', probeIndex);\n  const confirmIndex = contactHandoffController.indexOf('parryGate.confirm({ attackSnapshot: snapshot, contact: exchangeState.latestContact })', probeIndex);\n  const resolveIndex = contactHandoffController.indexOf('exchangeState.latestCombatResult = combat.resolveContact({', probeIndex);\n  assert.ok(probeIndex >= 0 && whiffIndex > probeIndex && confirmIndex > whiffIndex && resolveIndex > confirmIndex);`;
const newR18M5Order = `  const probeIndex = contactHandoffController.indexOf('const geometricContact = probeSweptSwordBucklerContact({');\n  const temporalEligibilityIndex = contactHandoffController.indexOf('exchangeState.latestContact = evaluateSweptContactTemporalEligibility({', probeIndex);\n  const whiffIndex = contactHandoffController.indexOf('preContactController.recordWhiffProbe(snapshot, exchangeState.latestContact);', temporalEligibilityIndex);\n  const rejectIndex = contactHandoffController.indexOf('if (!exchangeState.latestContact.contact) return;', whiffIndex);\n  const confirmIndex = contactHandoffController.indexOf('parryGate.confirm({ attackSnapshot: snapshot, contact: exchangeState.latestContact })', rejectIndex);\n  const resolveIndex = contactHandoffController.indexOf('exchangeState.latestCombatResult = combat.resolveContact({', confirmIndex);\n  assert.ok(\n    probeIndex >= 0\n      && temporalEligibilityIndex > probeIndex\n      && whiffIndex > temporalEligibilityIndex\n      && rejectIndex > whiffIndex\n      && confirmIndex > rejectIndex\n      && resolveIndex > confirmIndex,\n  );`;

migrateExact(
  preContactTestPath,
  oldR18M5Order,
  newR18M5Order,
  'R18M.5 swept-contact order contract',
);

const step3ATestPath = 'tests/shield-sword-hand-contact-coupling-lab.test.js';
const oldStep3AImports = `const contactHandoffSource = readFileSync(\n  new URL('../tools/action-studio/shield-parry-r281/contact-handoff-controller.js', import.meta.url),\n  'utf8',\n);\nconst postContactOwnershipSource = \`${'${source}'}\\n${'${contactHandoffSource}'}\`;`;
const newStep3AImports = `const contactHandoffSource = readFileSync(\n  new URL('../tools/action-studio/shield-parry-r281/contact-handoff-controller.js', import.meta.url),\n  'utf8',\n);\nconst labUiSource = readFileSync(\n  new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url),\n  'utf8',\n);\nconst diagnosticFormattersSource = readFileSync(\n  new URL('../tools/action-studio/shield-parry-r281/diagnostic-formatters.js', import.meta.url),\n  'utf8',\n);\nconst stanceDebugSource = readFileSync(\n  new URL('../tools/action-studio/shield-parry-r281/stance-debug-controls.js', import.meta.url),\n  'utf8',\n);\nconst inspectionOverlaySource = readFileSync(\n  new URL('../tools/action-studio/shield-parry-r281/inspection-overlay.js', import.meta.url),\n  'utf8',\n);\nconst postContactOwnershipSource = \`${'${source}'}\\n${'${contactHandoffSource}'}\`;`;

migrateExact(
  step3ATestPath,
  oldStep3AImports,
  newStep3AImports,
  'Step 3A extracted presentation ownership imports',
);

const oldStep3AInspection = `  assert.match(source, /STEP 3A HOLD · LIVE CONTACT VERIFIED/);\n  assert.match(source, /formatInspectionFailureSummary/);\n  assert.match(source, /failedGateCount/);\n  assert.match(source, /formatTerminalState/);\n  assert.match(source, /contactGeometryDiagnostic: describeContactGeometry/);\n  assert.match(source, /bladePercent/);\n  assert.match(source, /shieldRegion/);`;
const newStep3AInspection = `  assert.match(labUiSource, /STEP 3A HOLD · LIVE CONTACT VERIFIED/);\n  assert.match(labUiSource, /formatInspectionFailureSummary/);\n  assert.match(labUiSource, /failedGateCount/);\n  assert.match(labUiSource, /formatTerminalState/);\n  assert.match(verificationReportSource, /contactGeometryDiagnostic: describeContactGeometry/);\n  assert.match(diagnosticFormattersSource, /bladePercent/);\n  assert.match(diagnosticFormattersSource, /shieldRegion/);`;

migrateExact(
  step3ATestPath,
  oldStep3AInspection,
  newStep3AInspection,
  'Step 3A live contact inspection ownership contract',
);

for (const [needle, owner, label] of [
  ['assert.match(source, /rawQueryValue', 'assert.match(stanceDebugSource, /rawQueryValue', 'R18E raw query parser ownership'],
  ['assert.match(source, /\\? Number\\.NaN/', 'assert.match(stanceDebugSource, /\\? Number\\.NaN/', 'R18E NaN fallback ownership'],
  ["assert.match(source, /query: 'leadMs'/", "assert.match(stanceDebugSource, /query: 'leadMs'/", 'R18E lead query ownership'],
  ["assert.match(source, /query: 'crouchCm'/", "assert.match(stanceDebugSource, /query: 'crouchCm'/", 'R18E crouch query ownership'],
  ["assert.match(source, /query: 'crouchSpeed'/", "assert.match(stanceDebugSource, /query: 'crouchSpeed'/", 'R18E crouch speed ownership'],
  ["assert.match(source, /query: 'edgeCm'/", "assert.match(stanceDebugSource, /query: 'edgeCm'/", 'R18E edge query ownership'],
  ["assert.match(source, /query: 'planeCm'/", "assert.match(stanceDebugSource, /query: 'planeCm'/", 'R18E plane query ownership'],
  ["assert.match(source, /query: 'lowGapCm'/", "assert.match(stanceDebugSource, /query: 'lowGapCm'/", 'R18E low gap ownership'],
  ["assert.match(source, /query: 'downRatio'/", "assert.match(stanceDebugSource, /query: 'downRatio'/", 'R18E down ratio ownership'],
  ["assert.match(source, /query: 'kneeBandCm'/", "assert.match(stanceDebugSource, /query: 'kneeBandCm'/", 'R18E knee band ownership'],
  ["assert.match(source, /query: 'armAttemptCm'/", "assert.match(stanceDebugSource, /query: 'armAttemptCm'/", 'R18E arm attempt ownership'],
  ['assert.match(source, /profile: DEBUG_MODE \\? debugStanceProfile : null/)', 'assert.match(preContactSource, /profile: debugMode \\? debugStanceProfile : null/)', 'R18E stance profile guidance ownership'],
  ['assert.match(source, /DEBUG pred', 'assert.match(diagnosticFormattersSource, /DEBUG pred', 'R18E debug prediction ownership'],
  ['assert.match(source, /anticipatedEligibilityReason/', 'assert.match(diagnosticFormattersSource, /anticipatedEligibilityReason/', 'R18E eligibility reason ownership'],
  ['assert.match(source, /pflags', 'assert.match(diagnosticFormattersSource, /pflags', 'R18E prediction flags ownership'],
  ['assert.match(source, /originalAttackAxisLine/)', 'assert.match(inspectionOverlaySource, /originalAttackAxisLine/)', 'Step 3A original attack-axis overlay ownership'],
  ['assert.match(source, /currentSwordAxisLine/)', 'assert.match(inspectionOverlaySource, /currentSwordAxisLine/)', 'Step 3A current sword-axis overlay ownership'],
  ['assert.match(source, /currentWristGripLine/)', 'assert.match(inspectionOverlaySource, /currentWristGripLine/)', 'Step 3A wrist-grip overlay ownership'],
  ['assert.match(source, /LINE CLEAR \\$\\{lineGate\\(lineClearance\\.pass\\)\\}/)', 'assert.match(labUiSource, /LINE CLEAR \\$\\{lineGate\\(lineClearance\\.pass\\)\\}/)', 'Step 3A line-clearance HUD ownership'],
]) {
  migrateExact(step3ATestPath, needle, owner, label);
}

const oldR18EAuthorityBlock = `  assert.match(source, /latestThreatSelection/);\n  assert.match(source, /debug-profile-changes-posture-guidance-only-real-swept-contact-remains-success-authority/);\n  assert.match(source, /if \\(!latestContact\\.contact\\) return/);`;
const newR18EAuthorityBlock = `  assert.match(verificationReportSource, /latestThreatSelection/);\n  assert.match(verificationReportSource, /debug-profile-changes-posture-guidance-only-real-swept-contact-remains-success-authority/);\n  assert.match(contactHandoffSource, /if \\(!exchangeState\\.latestContact\\.contact\\) return/);`;

migrateExact(
  step3ATestPath,
  oldR18EAuthorityBlock,
  newR18EAuthorityBlock,
  'R18E report plus real-contact authority ownership block',
);

const oldStep3AContactAuthority = `test('Step 3A starts only after the manual gate confirms eligible real contact', () => {\n  const resolve = functionBody('resolveContact', 'showParryCue');\n  const confirm = resolve.indexOf('parryGate.confirm');\n  const resolveCombat = resolve.indexOf('combat.resolveContact');\n  const liveConstraint = resolve.indexOf('swordGripConstraint.start');\n\n  assert.match(resolve, /probeSweptSwordBucklerContact/);\n  assert.match(resolve, /if \\(!latestContact\\.contact\\) return/);\n  assert.ok(confirm >= 0 && resolveCombat > confirm && liveConstraint > resolveCombat);\n  assert.doesNotMatch(resolve, /publishPostCouplingRecoilStaggerHandoff/);\n});`;
const newStep3AContactAuthority = `test('Step 3A starts only after the manual gate confirms eligible real contact', () => {\n  const resolveStart = contactHandoffSource.indexOf('function resolveContact(');\n  const resolveEnd = contactHandoffSource.indexOf('function updateCombatBeforeGuard(', resolveStart);\n  assert.ok(resolveStart >= 0 && resolveEnd > resolveStart);\n  const resolve = contactHandoffSource.slice(resolveStart, resolveEnd);\n  const geometry = resolve.indexOf('const geometricContact = probeSweptSwordBucklerContact({');\n  const temporalEligibility = resolve.indexOf('exchangeState.latestContact = evaluateSweptContactTemporalEligibility({', geometry);\n  const reject = resolve.indexOf('if (!exchangeState.latestContact.contact) return;', temporalEligibility);\n  const confirm = resolve.indexOf('parryGate.confirm({ attackSnapshot: snapshot, contact: exchangeState.latestContact })', reject);\n  const resolveCombat = resolve.indexOf('exchangeState.latestCombatResult = combat.resolveContact({', confirm);\n  const liveConstraint = resolve.indexOf('exchangeState.latestGripConstraintReport = swordGripConstraint.start({', resolveCombat);\n\n  assert.ok(\n    geometry >= 0\n      && temporalEligibility > geometry\n      && reject > temporalEligibility\n      && confirm > reject\n      && resolveCombat > confirm\n      && liveConstraint > resolveCombat,\n  );\n  assert.doesNotMatch(resolve, /publishPostCouplingRecoilStaggerHandoff/);\n});`;

migrateExact(
  step3ATestPath,
  oldStep3AContactAuthority,
  newStep3AContactAuthority,
  'Step 3A real-contact orchestration ownership contract',
);

const oldR18IPredictiveRelease = `test('R18I preserves predictive defender time and latches the defender deflect marker', () => {\n  const resolve = functionBody('resolveContact', 'showParryCue');\n  const release = functionBody('releaseLiveContactToOldB3', 'forceOldTwoActorB3');\n\n  assert.match(resolve, /latestPredictiveHandoff\\.defenderPresentationOffsetSeconds/);\n  assert.match(resolve, /defenderPresentationOffsetSeconds:/);\n  assert.match(source, /function defenderDeflectReleaseGate\\(\\)/);\n  assert.match(source, /function updateDefenderDeflectReleaseGate\\(\\)/);\n  assert.match(source, /latchedDefenderDeflectReleaseGate/);\n  assert.match(source, /latched-defender-deflect-marker-gates-attacker-release/);\n  assert.match(source, /PARRY_ATTACKER_RELEASE_SOURCE_SECONDS/);\n  assert.match(release, /if \\(!defenderReleaseGate\\.passed\\)/);\n  assert.match(release, /defender-deflect-marker-not-reached/);\n  assert.match(release, /allowConfirmedParryFallback: true/);\n  assert.match(source, /defenderParryPresentationNeverRewindsAtContact/);\n  assert.match(source, /oldB3WeaponArmReleasedOnlyAfterDefenderDeflectMarker/);\n});`;
const newR18IPredictiveRelease = `test('R18I preserves predictive defender time and latches the defender deflect marker', () => {\n  const resolveStart = contactHandoffSource.indexOf('function resolveContact(');\n  const resolveEnd = contactHandoffSource.indexOf('function updateCombatBeforeGuard(', resolveStart);\n  const releaseStart = contactHandoffSource.indexOf('function releaseLiveContactToOldB3(');\n  const releaseEnd = contactHandoffSource.indexOf('function recordVisibleOldB3Sample(', releaseStart);\n  assert.ok(resolveStart >= 0 && resolveEnd > resolveStart && releaseStart >= 0 && releaseEnd > releaseStart);\n  const resolve = contactHandoffSource.slice(resolveStart, resolveEnd);\n  const release = contactHandoffSource.slice(releaseStart, releaseEnd);\n\n  assert.match(resolve, /latestPredictiveHandoff\\.defenderPresentationOffsetSeconds/);\n  assert.match(resolve, /defenderPresentationOffsetSeconds:/);\n  assert.match(contactHandoffSource, /function defenderDeflectReleaseGate\\(\\)/);\n  assert.match(contactHandoffSource, /function updateDefenderDeflectReleaseGate\\(\\)/);\n  assert.match(contactHandoffSource, /latchedDefenderDeflectReleaseGate/);\n  assert.match(contactHandoffSource, /latched-defender-deflect-marker-gates-attacker-release/);\n  assert.match(contactHandoffSource, /PARRY_ATTACKER_RELEASE_SOURCE_SECONDS/);\n  assert.match(release, /if \\(!defenderReleaseGate\\.passed\\)/);\n  assert.match(release, /defender-deflect-marker-not-reached/);\n  assert.match(release, /allowConfirmedParryFallback: true/);\n  assert.match(verificationReportSource, /defenderParryPresentationNeverRewindsAtContact/);\n  assert.match(verificationReportSource, /oldB3WeaponArmReleasedOnlyAfterDefenderDeflectMarker/);\n});`;

migrateExact(
  step3ATestPath,
  oldR18IPredictiveRelease,
  newR18IPredictiveRelease,
  'R18I predictive handoff and deflect release ownership contract',
);

console.log('R18N.3 v6.4 contact authority source contracts migrated.');
