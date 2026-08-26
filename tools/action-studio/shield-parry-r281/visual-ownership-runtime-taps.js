import {
  R18N_VISUAL_OWNERSHIP_WRITERS,
  captureVisualOwnershipPose,
  createVisualOwnershipBaselineRecorder,
} from './visual-ownership-baseline.js';

export const R18N_VISUAL_OWNERSHIP_TRACE_LIMIT = 48;

function compactChangedDeltas(sample = {}) {
  const entries = (sample.changedBones || []).map((boneId) => [
    boneId,
    sample.deltasDegrees?.[boneId] ?? null,
  ]);
  return Object.freeze(Object.fromEntries(entries));
}

export function compactVisualOwnershipBaselineReport(report) {
  if (!report) return null;
  return Object.freeze({
    stage: report.stage,
    sequence: report.sequence,
    attackPhase: report.attackPhase,
    elapsedSeconds: report.elapsedSeconds,
    orderValid: report.orderValid,
    orderViolations: report.orderViolations,
    observedOrder: report.observedOrder,
    changedByWriter: report.changedByWriter,
    lastWriterByBone: report.lastWriterByBone,
    samples: Object.freeze((report.samples || []).map((sample) => Object.freeze({
      writer: sample.writer,
      changedBones: sample.changedBones,
      changedDeltasDegrees: compactChangedDeltas(sample),
      metadata: sample.metadata,
    }))),
    authority: report.authority,
  });
}

export function createVisualOwnershipRuntimeTaps({
  rig,
  exchangeState,
  epsilonDegrees = 0.05,
  traceLimit = R18N_VISUAL_OWNERSHIP_TRACE_LIMIT,
} = {}) {
  if (!rig?.bones) throw new Error('R18N.4.1 runtime taps require defender rig bones');
  if (!exchangeState || typeof exchangeState !== 'object') {
    throw new Error('R18N.4.1 runtime taps require exchange state');
  }

  const recorder = createVisualOwnershipBaselineRecorder({ epsilonDegrees });
  const maxTraceFrames = Math.max(1, Math.floor(Number(traceLimit) || R18N_VISUAL_OWNERSHIP_TRACE_LIMIT));
  let previousPreContactFinalPose = null;

  function record(writer, metadata = {}) {
    if (!recorder.active) return null;
    return recorder.record(writer, { rig, metadata });
  }

  function beginFrame(snapshot = {}) {
    if (recorder.active) recorder.reset();
    const postGuardPose = captureVisualOwnershipPose(rig);
    const baselinePose = previousPreContactFinalPose || postGuardPose;
    recorder.beginFrame({
      sequence: snapshot.sequence ?? null,
      attackPhase: snapshot.phase ?? null,
      elapsedSeconds: snapshot.elapsedSeconds ?? null,
      pose: baselinePose,
      metadata: {
        samplePoint: 'previous-frame-pre-contact-final-as-next-frame-start',
        baselineQualified: Boolean(previousPreContactFinalPose),
      },
    });
    return recorder.record(R18N_VISUAL_OWNERSHIP_WRITERS.GUARD_RUNTIME, {
      pose: postGuardPose,
      metadata: {
        samplePoint: 'current-frame-pre-contact-entry-after-guard-runtime',
        baselineQualified: Boolean(previousPreContactFinalPose),
      },
    });
  }

  function afterPredictive(report) {
    return record(R18N_VISUAL_OWNERSHIP_WRITERS.PREDICTIVE_PRESENTATION, {
      active: report?.active ?? null,
      shieldArmOwnership: report?.shieldArmOwnership ?? null,
      upperBodyAnticipationOwnership: report?.upperBodyAnticipationOwnership ?? null,
      sourceTimeSeconds: report?.sourceTimeSeconds ?? null,
      entryBlendProgress: report?.entryBlendProgress ?? null,
    });
  }

  function afterPrimaryArm(report) {
    return record(R18N_VISUAL_OWNERSHIP_WRITERS.ACTIVE_INTERCEPT_PRIMARY, {
      active: report?.active ?? null,
      achievedDistanceMeters: report?.achievedDistance ?? null,
      carriedResidualDistanceMeters: report?.carriedResidualDistance ?? null,
    });
  }

  function afterResidualArm(report) {
    return record(R18N_VISUAL_OWNERSHIP_WRITERS.ACTIVE_INTERCEPT_RESIDUAL_ARM, {
      applied: Boolean(report),
      achievedDistanceMeters: report?.achievedDistance ?? null,
      carriedResidualDistanceMeters: report?.carriedResidualDistance ?? null,
    });
  }

  function afterBody(report) {
    return record(R18N_VISUAL_OWNERSHIP_WRITERS.RESIDUAL_BODY_REACH, {
      active: report?.active ?? null,
      mode: report?.mode ?? null,
      reason: report?.reason ?? null,
      authority: report?.authority ?? null,
    });
  }

  function afterStance(report) {
    return record(R18N_VISUAL_OWNERSHIP_WRITERS.RESIDUAL_STANCE_REACH, {
      active: report?.active ?? report?.activeCandidate ?? null,
      reason: report?.reason ?? null,
      authority: report?.authority ?? null,
    });
  }

  function afterShieldArmAdditive(report) {
    return record(R18N_VISUAL_OWNERSHIP_WRITERS.PREDICTIVE_SHIELD_ARM_ADDITIVE, {
      stage: report?.stage ?? null,
      active: report?.active ?? null,
      applied: report?.applied ?? null,
      appliedBones: report?.appliedBones ?? [],
      upperarmAppliedDegrees: report?.bones?.['upperarm.l']?.incrementalAngleDegrees ?? null,
      lowerarmAppliedDegrees: report?.bones?.['lowerarm.l']?.incrementalAngleDegrees ?? null,
      wristSolverOnly: report?.bones?.['wrist.l']?.solverOnly ?? true,
      finalPoseOwner: report?.finalPoseOwner ?? null,
      authority: report?.authority ?? null,
    });
  }

  function afterTopPrepReadabilityHold(report) {
    return record(R18N_VISUAL_OWNERSHIP_WRITERS.TOP_PREP_READABILITY_HOLD, {
      stage: report?.stage ?? null,
      active: report?.active ?? null,
      applied: report?.applied ?? null,
      envelopeWeight: report?.envelopeWeight ?? null,
      appliedBones: report?.appliedBones ?? [],
      upperarmRetainDegrees: report?.bones?.['upperarm.l']?.targetAngleDegrees ?? null,
      lowerarmRetainDegrees: report?.bones?.['lowerarm.l']?.targetAngleDegrees ?? null,
      wristSolverOnly: report?.bones?.['wrist.l']?.solverOnly ?? true,
      finalPoseOwner: report?.finalPoseOwner ?? null,
      authority: report?.authority ?? null,
    });
  }

  function afterFinalClosure(report) {
    return record(R18N_VISUAL_OWNERSHIP_WRITERS.ACTIVE_INTERCEPT_FINAL_CLOSURE, {
      applied: Boolean(report),
      achievedDistanceMeters: report?.achievedDistance ?? null,
    });
  }

  function finishFrame() {
    if (!recorder.active) return null;
    record(R18N_VISUAL_OWNERSHIP_WRITERS.PRE_CONTACT_FINAL, {
      samplePoint: 'after-all-pre-contact-pose-writers-before-real-contact-probe',
    });
    const report = recorder.finish({ contact: false });
    previousPreContactFinalPose = captureVisualOwnershipPose(rig);
    exchangeState.latestVisualOwnershipBaseline = report;
    if (!Array.isArray(exchangeState.visualOwnershipTrace)) exchangeState.visualOwnershipTrace = [];
    exchangeState.visualOwnershipTrace.push(compactVisualOwnershipBaselineReport(report));
    if (exchangeState.visualOwnershipTrace.length > maxTraceFrames) exchangeState.visualOwnershipTrace.shift();
    return report;
  }

  function reset() {
    recorder.reset();
    previousPreContactFinalPose = null;
    exchangeState.latestVisualOwnershipBaseline = null;
    exchangeState.visualOwnershipTrace = [];
  }

  return Object.freeze({
    beginFrame,
    afterPredictive,
    afterPrimaryArm,
    afterResidualArm,
    afterBody,
    afterStance,
    afterShieldArmAdditive,
    afterTopPrepReadabilityHold,
    afterFinalClosure,
    finishFrame,
    reset,
    get report() { return exchangeState.latestVisualOwnershipBaseline ?? null; },
    get trace() { return Object.freeze([...(exchangeState.visualOwnershipTrace || [])]); },
    get baselineQualified() { return Boolean(previousPreContactFinalPose); },
    authority: 'observer-only-cross-frame-guard-baseline-no-rig-write-no-contact-authority',
  });
}
