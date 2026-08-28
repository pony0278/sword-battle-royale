import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const frameReporting = await readFile(new URL('../tools/action-studio/shield-parry-r281/frame-reporting.js', import.meta.url), 'utf8');
const reportSource = await readFile(new URL('../tools/action-studio/shield-parry-r281/verification-report.js', import.meta.url), 'utf8');
const { buildShieldParryVerificationReport } = await import('../tools/action-studio/shield-parry-r281/verification-report.js');

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function minimalExchangeState() {
  return {
    latestCombatResult: null,
    latestParryOpportunity: null,
    latestParryInput: null,
    latestParryConfirmation: null,
    firstContact: null,
    latestPredictiveAnalysis: null,
    latestPredictiveHandoff: null,
    visibleOldB3Peak: null,
    step3AContactTransfer: null,
    frozenAttackerContactPose: null,
    latestPredictiveReport: null,
    latestShieldLeadMotion: null,
    latestReachableInterceptTarget: null,
    latestInterceptDriveReport: null,
    interceptDriveTrace: [],
    latestGripConstraintReport: null,
    latestInputSignal: null,
    latestParryWhiff: null,
    whiffProbeFrames: 0,
    closestWhiffApproach: null,
    outsideActiveContact: null,
    directOldB3Diagnostic: null,
  };
}

test('R18M.C3 report assembly is delegated and the entry still owns the DOM budget', () => {
  // R18V.3 moved the gathering and publication into frame-reporting.js. What has to stay true is
  // the split it was protecting: the schema is built by the verification-report module, the budget
  // that caps DOM work is a constant the entry owns and hands down, and nobody assembles a report
  // object by hand.
  assert.match(entry, /shield-parry-r281\/verification-report\.js/);
  assert.match(entry, /shield-parry-r281\/frame-reporting\.js/);
  assert.match(entry, /const MAX_REPORT_DOM_CHARACTERS = 60000;/);
  assert.match(entry, /maxReportCharacters: MAX_REPORT_DOM_CHARACTERS/);
  assert.doesNotMatch(entry, /const report = \{\s*stage: LAB_STAGE/);
  assert.doesNotMatch(frameReporting, /const report = \{\s*stage: labStage/);

  assert.match(frameReporting, /buildShieldParryVerificationReport\(\{/);
  assert.match(frameReporting, /serializeVerificationReport\(\{/);
  assert.match(frameReporting, /maxCharacters: maxReportCharacters/);
  assert.match(frameReporting, /reportNode\.textContent = publication\.displayText/);
  assert.match(frameReporting, /windowRef\.__G43B5R281_RESULT__ = report/);
  assert.match(frameReporting, /windowRef\.__G43B5R281_PERF__ = publication\.perf/);
});

test('R18M.C3 builder owns the verification schema without importing runtime authority', () => {
  for (const field of [
    'parryGate:',
    'contactGeometryDiagnostic:',
    'oldB3Continuation:',
    'contactPoseLifecycle:',
    'predictiveShieldLead:',
    'whiffTelemetry:',
    'debugLowStance:',
    'invariants:',
  ]) assert.ok(reportSource.includes(field), `missing report field ${field}`);

  assert.doesNotMatch(reportSource, /combat\.resolveContact\(/);
  assert.doesNotMatch(reportSource, /parryGate\.(?:arm|confirm)\(/);
  assert.doesNotMatch(reportSource, /swordGripConstraint\.(?:start|update)\(/);
  assert.doesNotMatch(reportSource, /guardRuntime\.update\(/);
  assert.doesNotMatch(reportSource, /attackRuntime\.update\(/);
  assert.doesNotMatch(reportSource, /window\./);
  assert.doesNotMatch(reportSource, /document\./);
  assert.doesNotMatch(reportSource, /serializeVerificationReport/);
  assert.doesNotMatch(reportSource, /exchangeState\.[A-Za-z0-9_]+\s*=/);
});

test('R18M.C3 builder is read-only for frozen snapshots and preserves core report semantics', () => {
  const context = deepFreeze({
    combatSnapshot: {},
    exchangeState: minimalExchangeState(),
    labStage: 'test-live-contact-stage',
    recoilStage: 'test-recoil-stage',
    ready: true,
    selectedDirection: 'right',
    selectedMode: 'parry',
    parryProfile: { timingWindow: 'test-profile' },
    defenderReleaseGate: { passed: false, marker: 'deflect-impulse' },
    ownsLiveContact: false,
    inspectionCameraSnapshot: { mode: 'three' },
    debugMode: false,
    debugStanceProfile: {},
    recentCompactTraceFrames: 8,
    liveContactPhaseLatch: 'live-contact',
  });

  let report;
  assert.doesNotThrow(() => {
    report = buildShieldParryVerificationReport(context);
  });
  assert.equal(report.stage, 'test-live-contact-stage');
  assert.equal(report.recoilStage, 'test-recoil-stage');
  assert.equal(report.pass, true);
  assert.equal(report.selectedDirection, 'right');
  assert.equal(report.selectedMode, 'parry');
  assert.equal(report.parryGate.manualInputRequired, true);
  assert.equal(report.parryGate.successAuthority, 'eligible real swept Sword × Shield contact during attack_active');
  assert.equal(report.inspectionCamera.mode, 'three');
  assert.equal(report.invariants.singleParryOnlyInThisLab, true);
  assert.equal(report.invariants.noAutomaticTimingTrigger, true);
  assert.equal(report.invariants.freeInspectionCameraDoesNotMutateCombat, true);
  assert.equal(report.invariants.blockPathPreserved, true);
  assert.equal(report.invariants.noRootTranslation, true);
});

test('R18M.C3 compact trace budget stays at eight recent scalar frames in the builder contract', () => {
  assert.match(reportSource, /recentFrames: Object\.freeze\(exchangeState\.interceptDriveTrace\.slice\(-recentCompactTraceFrames\)\)/);
  assert.match(reportSource, /telemetryDetail: 'compact-scalar-frames-only'/);
  assert.doesNotMatch(reportSource, /60000/);
});
