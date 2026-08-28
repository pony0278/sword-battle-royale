import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  compactInterceptDriveTelemetry,
  compactInterceptDriveTraceFrame,
} from '../tools/action-studio/shield-parry-r281/diagnostic-telemetry.js';
import {
  describeContactGeometry,
  formatInspectionFailureSummary,
  formatWhiffDiagnostic,
} from '../tools/action-studio/shield-parry-r281/diagnostic-formatters.js';
import { serializeVerificationReport } from '../tools/action-studio/shield-parry-r281/report-serialization.js';

const source = await readFile(
  new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url),
  'utf8',
);

test('R18M.2 R281 imports diagnostics modules instead of defining compact/formatter blocks inline', () => {
  assert.match(source, /shield-parry-r281\/diagnostic-telemetry\.js/);
  assert.match(source, /shield-parry-r281\/diagnostic-formatters\.js/);
  assert.match(source, /shield-parry-r281\/report-serialization\.js/);
  assert.doesNotMatch(source, /function compactVector\(/);
  assert.doesNotMatch(source, /const INSPECTION_GATE_ORDER = Object\.freeze/);
  assert.doesNotMatch(source, /const reportText = JSON\.stringify\(report, null, 2\)/);
  assert.ok(source.split('\n').length < 2200, 'R281 entry should be materially smaller after diagnostics extraction');
});

test('R18M.2 compact telemetry keeps scalar review evidence and drops solver-only object graphs', () => {
  const compact = compactInterceptDriveTelemetry({
    attackPhase: 'attack_active',
    elapsedSeconds: 0.4,
    timeToContactSeconds: 0.08,
    selectionSource: 'measured-current-sweep-closest-approach',
    residualAfterRefinement: { planeGapMeters: 0.01, radialGapMeters: 0.02, combinedGapMeters: 0.03, solverGraph: { huge: true } },
    residualStanceReach: {
      active: true,
      stanceHeld: true,
      threat: { zone: 'knee-line', kneeLineThreat: true },
      internalSolverGraph: { huge: true },
    },
    solverGraph: { huge: true },
  });
  assert.equal(compact.telemetryDetail, 'compact-scalar-frame');
  assert.equal(compact.residualAfterRefinement.radialGapMeters, 0.02);
  assert.equal(compact.residualStanceReach.threat.zone, 'knee-line');
  assert.equal('solverGraph' in compact, false);
  assert.equal('internalSolverGraph' in compact.residualStanceReach, false);

  const trace = compactInterceptDriveTraceFrame({
    attackPhase: 'attack_active',
    residualStanceReach: { active: true, stanceHeld: true, crouchMeters: 0.04, feetPlanted: true },
  });
  assert.deepEqual(trace.stance, { active: true, held: true, activationSource: null, crouchMeters: 0.04, feetPlanted: true });
});

test('R18M.2 formatter helpers preserve contact and inspection semantics without combat authority', () => {
  const contact = describeContactGeometry({
    geometricContact: true,
    bladeFraction: 0.6,
    radialDistance: 0.08,
    surface: { radius: 0.12 },
  });
  assert.equal(contact.bladeRegion, 'MID');
  assert.equal(contact.shieldRegion, 'FACE OUTER');

  const failure = formatInspectionFailureSummary({
    inspectionAssessment: {
      failedGateCount: 1,
      failedGateKeys: ['swordAxisClearance'],
      terminalReason: 'insufficient-live-shield-offline-travel',
      gates: {
        swordAxisClearance: { key: 'swordAxisClearance', unit: 'degrees', actual: 4, minimum: 7, operator: '>=' },
      },
    },
  });
  assert.match(failure, /FAIL 1\/7/);
  assert.match(failure, /4\.0°/);

  const whiff = formatWhiffDiagnostic({ category: 'NO_PROBE_DATA', reason: 'no-probe' });
  assert.equal(whiff.label, 'NO PROBE DATA');
  assert.match(whiff.detail, /no sweep sample recorded/);
});

test('R18M.2 report serializer preserves the 60k-style budget fallback and compact perf telemetry', () => {
  const normal = serializeVerificationReport({
    report: { stage: 'R18', pass: true, value: 1 },
    maxCharacters: 60000,
    traceFrames: 12,
    recentTraceFrames: 8,
  });
  assert.equal(normal.reportWithinDomBudget, true);
  assert.equal(normal.displayText, normal.reportText);
  assert.equal(normal.perf.telemetryDetail, 'compact-scalar-frames-only');
  assert.equal(normal.perf.recentTraceFrames, 8);

  const oversized = serializeVerificationReport({
    report: { stage: 'R18', pass: true, payload: 'x'.repeat(200) },
    maxCharacters: 20,
    traceFrames: 96,
    recentTraceFrames: 8,
  });
  assert.equal(oversized.reportWithinDomBudget, false);
  assert.match(oversized.displayText, /verification-report-exceeded-dom-budget/);
  assert.equal(oversized.perf.maximumCharacters, 20);
});
