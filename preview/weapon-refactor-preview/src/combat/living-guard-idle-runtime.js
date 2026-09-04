export const LIVING_GUARD_PRODUCTION_STAGE = 'G3.6.5';
export const LIVING_GUARD_PRODUCTION_CLIP_ID = 'SKYRIM_GUARD/shd_blockidle';
export const LIVING_GUARD_PRODUCTION_SOURCE_RATE = 1.0;
export const LIVING_GUARD_PRODUCTION_ENTRY_SAMPLE = 0.50;
export const LIVING_GUARD_PRODUCTION_LOOP_POLICY = 'full-source-authored-loop';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function livingGuardEntrySourceTime(durationSeconds) {
  const duration = Math.max(0, Number(durationSeconds) || 0);
  return duration * clamp01(LIVING_GUARD_PRODUCTION_ENTRY_SAMPLE);
}

export function sampleLivingGuardProductionHold(elapsedMs = 0, durationSeconds = 0) {
  const duration = Math.max(1e-6, Number(durationSeconds) || 0);
  const elapsedSeconds = Math.max(0, Number(elapsedMs) || 0) / 1000;
  const entrySourceTimeSeconds = livingGuardEntrySourceTime(duration);
  const unwrappedSourceTimeSeconds = entrySourceTimeSeconds
    + elapsedSeconds * LIVING_GUARD_PRODUCTION_SOURCE_RATE;
  const sourceTimeSeconds = unwrappedSourceTimeSeconds % duration;
  const completedLoops = Math.floor(unwrappedSourceTimeSeconds / duration);

  return Object.freeze({
    stage: LIVING_GUARD_PRODUCTION_STAGE,
    clipId: LIVING_GUARD_PRODUCTION_CLIP_ID,
    sourceRate: LIVING_GUARD_PRODUCTION_SOURCE_RATE,
    entrySample: LIVING_GUARD_PRODUCTION_ENTRY_SAMPLE,
    entrySourceTimeSeconds,
    sourceTimeSeconds,
    unwrappedSourceTimeSeconds,
    completedLoops,
    loopPolicy: LIVING_GUARD_PRODUCTION_LOOP_POLICY,
    inPlace: true,
    rootRotationPolicy: 'lock',
  });
}

export function buildLivingGuardProductionReport(durationSeconds) {
  const duration = Math.max(0, Number(durationSeconds) || 0);
  return Object.freeze({
    stage: LIVING_GUARD_PRODUCTION_STAGE,
    clipId: LIVING_GUARD_PRODUCTION_CLIP_ID,
    sourceDurationSeconds: duration,
    sourceRate: LIVING_GUARD_PRODUCTION_SOURCE_RATE,
    entrySample: LIVING_GUARD_PRODUCTION_ENTRY_SAMPLE,
    entrySourceTimeSeconds: livingGuardEntrySourceTime(duration),
    loopPolicy: LIVING_GUARD_PRODUCTION_LOOP_POLICY,
    preservesTriangleCorrection: true,
    preservesInPlaceRoot: true,
    preservesRootRotationLock: true,
    sourceScope: 'full-authored-skyrim-idle',
  });
}
