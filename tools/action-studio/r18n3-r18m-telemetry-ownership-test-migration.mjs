import { readFileSync, writeFileSync } from 'node:fs';

const path = 'tests/shield-sword-hand-contact-coupling-lab.test.js';

function replaceExact(source, oldSource, newSource, label) {
  if (!source.includes(oldSource)) {
    throw new Error(`R18N.3 v6.4 telemetry ownership migration could not locate ${label}`);
  }
  if (source.indexOf(oldSource) !== source.lastIndexOf(oldSource)) {
    throw new Error(`R18N.3 v6.4 telemetry ownership migration expected one ${label}`);
  }
  if (source.includes(newSource)) {
    throw new Error(`R18N.3 v6.4 telemetry ownership migration found ${label} already migrated`);
  }
  return source.replace(oldSource, newSource);
}

let source = readFileSync(path, 'utf8');

const ownershipAnchor = `const verificationReportSource = readFileSync(\n  new URL('../tools/action-studio/shield-parry-r281/verification-report.js', import.meta.url),\n  'utf8',\n);`;
const ownershipReplacement = `${ownershipAnchor}\nconst diagnosticTelemetrySource = readFileSync(\n  new URL('../tools/action-studio/shield-parry-r281/diagnostic-telemetry.js', import.meta.url),\n  'utf8',\n);\nconst reportSerializationSource = readFileSync(\n  new URL('../tools/action-studio/shield-parry-r281/report-serialization.js', import.meta.url),\n  'utf8',\n);`;
source = replaceExact(
  source,
  ownershipAnchor,
  ownershipReplacement,
  'diagnostic telemetry and report serialization ownership sources',
);

const oldTest = `test('R18I keeps Parry review telemetry compact and caps Verification DOM work', () => {\n  const compact = functionBody('compactInterceptDriveTelemetry', 'setInspectionLine');\n  const traceCompact = functionBody('compactInterceptDriveTraceFrame', 'compactPredictiveThreat');\n  assert.match(source, /const MAX_REPORT_DOM_CHARACTERS = 60000/);\n  assert.match(source, /const RECENT_COMPACT_TRACE_FRAMES = 8/);\n  assert.match(source, /interceptDriveTrace\\.push\\(compactInterceptDriveTraceFrame\\(latestInterceptDriveReport\\)\\)/);\n  assert.match(source, /recentFrames: Object\\.freeze\\(interceptDriveTrace\\.slice\\(-RECENT_COMPACT_TRACE_FRAMES\\)\\)/);\n  assert.match(compact, /telemetryDetail: 'compact-scalar-frame'/);\n  assert.match(compact, /compactGap\\(value\\.residualAfterRefinement\\)/);\n  assert.match(compact, /compactBodyReach\\(value\\.residualBodyReach\\)/);\n  assert.match(compact, /compactStanceReach\\(value\\.residualStanceReach\\)/);\n  assert.doesNotMatch(traceCompact, /anticipatedPlan|threatSelection|residualRefinement|residualBodyReach/);\n  assert.match(source, /liveShieldSwordGripContactConstraint: compactLiveContactConstraint\\(latestGripConstraintReport\\)/);\n  assert.match(source, /predictiveAnalysis: compactPredictiveAnalysis\\(latestPredictiveAnalysis\\)/);\n  assert.match(source, /interceptTarget: compactReachableInterceptTarget\\(latestReachableInterceptTarget\\)/);\n  assert.match(source, /reason: 'verification-report-exceeded-dom-budget'/);\n  assert.match(source, /window\\.__G43B5R281_PERF__/);\n  assert.match(html, /Verification report .* 60,000 characters.*compact scalar frames only/);\n});`;

const newTest = `test('R18I keeps Parry review telemetry compact and caps Verification DOM work', () => {\n  const compactStart = diagnosticTelemetrySource.indexOf('export function compactInterceptDriveTelemetry(');\n  const compactEnd = diagnosticTelemetrySource.indexOf('export function compactInterceptDriveTraceFrame(', compactStart);\n  assert.ok(compactStart >= 0 && compactEnd > compactStart);\n  const compact = diagnosticTelemetrySource.slice(compactStart, compactEnd);\n  const traceStart = diagnosticTelemetrySource.indexOf('export function compactInterceptDriveTraceFrame(');\n  const traceEnd = diagnosticTelemetrySource.indexOf('function compactPredictiveThreat(', traceStart);\n  assert.ok(traceStart >= 0 && traceEnd > traceStart);\n  const traceCompact = diagnosticTelemetrySource.slice(traceStart, traceEnd);\n\n  assert.match(source, /const MAX_REPORT_DOM_CHARACTERS = 60000/);\n  assert.match(source, /const RECENT_COMPACT_TRACE_FRAMES = 8/);\n  assert.match(preContactSource, /exchangeState\\.interceptDriveTrace\\.push\\(compactInterceptDriveTraceFrame\\(exchangeState\\.latestInterceptDriveReport\\)\\)/);\n  assert.match(verificationReportSource, /recentFrames: Object\\.freeze\\(exchangeState\\.interceptDriveTrace\\.slice\\(-recentCompactTraceFrames\\)\\)/);\n  assert.match(compact, /telemetryDetail: 'compact-scalar-frame'/);\n  assert.match(compact, /compactGap\\(value\\.residualAfterRefinement\\)/);\n  assert.match(compact, /compactBodyReach\\(value\\.residualBodyReach\\)/);\n  assert.match(compact, /compactStanceReach\\(value\\.residualStanceReach\\)/);\n  assert.doesNotMatch(traceCompact, /anticipatedPlan|threatSelection|residualRefinement|residualBodyReach/);\n  assert.match(verificationReportSource, /compactTelemetryDoesNotRetainSolverGraphs/);\n  assert.match(verificationReportSource, /liveShieldSwordGripContactConstraint: compactLiveContactConstraint\\(exchangeState\\.latestGripConstraintReport\\)/);\n  assert.match(verificationReportSource, /predictiveAnalysis: compactPredictiveAnalysis\\(exchangeState\\.latestPredictiveAnalysis\\)/);\n  assert.match(verificationReportSource, /interceptTarget: compactReachableInterceptTarget\\(exchangeState\\.latestReachableInterceptTarget\\)/);\n  assert.match(reportSerializationSource, /reportText\\.length <= maxCharacters/);\n  assert.match(reportSerializationSource, /reason: 'verification-report-exceeded-dom-budget'/);\n  assert.match(source, /window\\.__G43B5R281_PERF__/);\n  assert.match(html, /Verification report .* 60,000 characters.*compact scalar frames only/);\n});`;

source = replaceExact(
  source,
  oldTest,
  newTest,
  'compact telemetry and Verification DOM budget ownership contract',
);

writeFileSync(path, source);
console.log('R18N.3 v6.4 telemetry ownership contracts migrated.');
