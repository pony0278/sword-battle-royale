import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`R18N.3 closure probe missing marker: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`R18N.3 closure probe marker is not unique: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const path = 'tools/action-studio/r18n3-active-intercept-browser-probe.mjs';
let source = fs.readFileSync(path, 'utf8');
source = replaceOnce(
  source,
  `        supportChestDegrees: support?.appliedDegrees?.chest ?? null,
        supportSpineDegrees: support?.appliedDegrees?.spine ?? null,
        achieved:`,
  `        supportChestDegrees: support?.appliedDegrees?.chest ?? null,
        supportSpineDegrees: support?.appliedDegrees?.spine ?? null,
        closureActive: drive.activeInterceptArmClosure?.active === true,
        closureTargetErrorBefore: drive.activeInterceptArmClosure?.targetErrorBeforeMeters ?? null,
        closureTargetErrorAfter: drive.activeInterceptArmClosure?.targetErrorAfterMeters ?? null,
        closureUpperDegrees: drive.activeInterceptArmClosure?.appliedDegrees?.['upperarm.l'] ?? null,
        closureLowerDegrees: drive.activeInterceptArmClosure?.appliedDegrees?.['lowerarm.l'] ?? null,
        closureJointBudgetScale: drive.activeInterceptArmClosure?.jointBudgetScale ?? null,
        closureIterations: drive.activeInterceptArmClosure?.iterations ?? null,
        achieved:`,
  'sample closure telemetry',
);
source = replaceOnce(
  source,
  `  const supportChest = finite(row.samples.map((sample) => sample.supportChestDegrees));
  const supportSpine = finite(row.samples.map((sample) => sample.supportSpineDegrees));
  const remaining =`,
  `  const supportChest = finite(row.samples.map((sample) => sample.supportChestDegrees));
  const supportSpine = finite(row.samples.map((sample) => sample.supportSpineDegrees));
  const closureBefore = finite(row.samples.map((sample) => sample.closureTargetErrorBefore));
  const closureAfter = finite(row.samples.map((sample) => sample.closureTargetErrorAfter));
  const closureUpper = finite(row.samples.map((sample) => sample.closureUpperDegrees));
  const closureLower = finite(row.samples.map((sample) => sample.closureLowerDegrees));
  const closureScale = finite(row.samples.map((sample) => sample.closureJointBudgetScale));
  const closureIterations = finite(row.samples.map((sample) => sample.closureIterations));
  const remaining =`,
  'summarize closure telemetry arrays',
);
source = replaceOnce(
  source,
  `    supportActiveFrames: row.samples.filter((sample) => sample.supportActive).length,
    supportAuthority: row.samples.find((sample) => sample.supportAuthority)?.supportAuthority ?? null,
    firstRemainingCm:`,
  `    supportActiveFrames: row.samples.filter((sample) => sample.supportActive).length,
    supportAuthority: row.samples.find((sample) => sample.supportAuthority)?.supportAuthority ?? null,
    closureActiveFrames: row.samples.filter((sample) => sample.closureActive).length,
    minClosureTargetErrorBeforeCm: closureBefore.length ? Math.min(...closureBefore) * 100 : null,
    minClosureTargetErrorAfterCm: closureAfter.length ? Math.min(...closureAfter) * 100 : null,
    maxClosureUpperDegrees: closureUpper.length ? Math.max(...closureUpper) : null,
    maxClosureLowerDegrees: closureLower.length ? Math.max(...closureLower) : null,
    closureJointBudgetScale: closureScale.length ? Math.max(...closureScale) : null,
    closureIterations: closureIterations.length ? Math.max(...closureIterations) : null,
    firstRemainingCm:`,
  'publish closure summary',
);
fs.writeFileSync(path, source);
console.log('R18N.3 closure probe telemetry applied.');
