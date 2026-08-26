// R18M.2 — pure report serialization and DOM-budget accounting.
// The caller owns publication to DOM/window; this module only shapes text + perf telemetry.

export function serializeVerificationReport({
  report,
  maxCharacters,
  traceFrames,
  recentTraceFrames,
}) {
  const reportText = JSON.stringify(report, null, 2);
  const reportWithinDomBudget = reportText.length <= maxCharacters;
  const oversizedSectionCharacters = reportWithinDomBudget
    ? null
    : Object.freeze(Object.fromEntries(
        Object.entries(report).map(([key, value]) => [key, JSON.stringify(value)?.length ?? 0]),
      ));
  const displayText = reportWithinDomBudget
    ? reportText
    : JSON.stringify({
        stage: report.stage,
        pass: false,
        reason: 'verification-report-exceeded-dom-budget',
        reportCharacters: reportText.length,
        maximumCharacters: maxCharacters,
        traceFrames,
        oversizedSectionCharacters,
      }, null, 2);
  const perf = Object.freeze({
    reportCharacters: reportText.length,
    maximumCharacters: maxCharacters,
    reportWithinDomBudget,
    traceFrames,
    recentTraceFrames,
    telemetryDetail: 'compact-scalar-frames-only',
  });
  return Object.freeze({
    reportText,
    displayText,
    reportWithinDomBudget,
    oversizedSectionCharacters,
    perf,
  });
}
