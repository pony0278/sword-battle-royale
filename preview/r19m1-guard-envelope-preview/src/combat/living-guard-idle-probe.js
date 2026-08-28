export const LIVING_GUARD_IDLE_STAGE = 'G3.6.4';
export const LIVING_GUARD_IDLE_SOURCE_CLIP_ID = 'SKYRIM_GUARD/shd_blockidle';
export const LIVING_GUARD_IDLE_CANONICAL_SAMPLE = 0.50;
export const LIVING_GUARD_IDLE_GENTLE_WINDOW = Object.freeze({
  startSeconds: 29.0,
  endSeconds: 31.0,
  source: 'G3.6.4 source scan: lowest-seam gentle non-static 2s window',
});

export const LIVING_GUARD_IDLE_CANDIDATE_IDS = Object.freeze({
  STABLE_G363: 'stable-g363',
  SKYRIM_LIVE: 'skyrim-live',
  LIVING_TRIANGLE: 'living-triangle',
});

export const LIVING_GUARD_IDLE_BONE_WEIGHTS = Object.freeze({
  spine: 0.24,
  chest: 0.32,
  'upperarm.r': 0.30,
  'lowerarm.r': 0.30,
  'wrist.r': 0.28,
  'handslot.r': 0.25,
  'upperarm.l': 0.22,
  'lowerarm.l': 0.22,
  'wrist.l': 0.18,
});

export const LIVING_GUARD_IDLE_CANDIDATES = Object.freeze([
  Object.freeze({
    id: LIVING_GUARD_IDLE_CANDIDATE_IDS.STABLE_G363,
    slot: 'A',
    label: 'Stable G3.6.3',
    strategy: 'canonical-static',
    sourceRate: 0,
    sourceWindow: null,
    productionReference: true,
    probeOnly: true,
    note: 'Current production Hold: corrected Skyrim guard sampled at the canonical 50% pose and held perfectly still.',
  }),
  Object.freeze({
    id: LIVING_GUARD_IDLE_CANDIDATE_IDS.SKYRIM_LIVE,
    slot: 'B',
    label: 'Skyrim Full Source',
    strategy: 'live-source',
    sourceRate: 1.0,
    sourceWindow: null,
    productionReference: false,
    probeOnly: true,
    note: 'Full 40s Skyrim shd_blockidle reference. It intentionally includes larger authored fidgets and is not a production recommendation.',
  }),
  Object.freeze({
    id: LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE,
    slot: 'C',
    label: 'Living Triangle',
    strategy: 'canonical-plus-live-delta',
    sourceRate: 1.0,
    sourceWindow: LIVING_GUARD_IDLE_GENTLE_WINDOW,
    productionReference: false,
    probeOnly: true,
    note: 'Preserve the approved corrected Triangle Guard silhouette while adding a restrained quaternion delta from the authored 29–31s gentle idle window.',
  }),
]);

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function resolveLivingGuardIdleCandidate(value) {
  if (typeof value === 'object' && value?.id) {
    return LIVING_GUARD_IDLE_CANDIDATES.find((candidate) => candidate.id === value.id)
      || LIVING_GUARD_IDLE_CANDIDATES[0];
  }
  return LIVING_GUARD_IDLE_CANDIDATES.find((candidate) => candidate.id === value)
    || LIVING_GUARD_IDLE_CANDIDATES[0];
}

export function livingGuardCanonicalSourceTime(durationSeconds) {
  const duration = Math.max(0, Number(durationSeconds) || 0);
  return duration * LIVING_GUARD_IDLE_CANONICAL_SAMPLE;
}

function sampleWindow(window, elapsedSeconds, sourceRate, durationSeconds) {
  const sourceStart = Math.max(0, Math.min(durationSeconds, Number(window?.startSeconds) || 0));
  const sourceEnd = Math.max(sourceStart, Math.min(durationSeconds, Number(window?.endSeconds) || durationSeconds));
  const windowDuration = Math.max(1e-6, sourceEnd - sourceStart);
  return sourceStart + ((elapsedSeconds * sourceRate) % windowDuration);
}

export function sampleLivingGuardIdleCandidate(candidateInput, elapsedSeconds = 0, durationSeconds = 0) {
  const candidate = resolveLivingGuardIdleCandidate(candidateInput);
  const duration = Math.max(1e-6, Number(durationSeconds) || 0);
  const canonical = livingGuardCanonicalSourceTime(duration);
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  const sourceRate = Math.max(0, Number(candidate.sourceRate) || 0);
  let sourceTimeSeconds = canonical;
  if (candidate.strategy !== 'canonical-static') {
    sourceTimeSeconds = candidate.sourceWindow
      ? sampleWindow(candidate.sourceWindow, elapsed, sourceRate, duration)
      : (canonical + elapsed * sourceRate) % duration;
  }
  return Object.freeze({
    stage: LIVING_GUARD_IDLE_STAGE,
    candidateId: candidate.id,
    strategy: candidate.strategy,
    sourceTimeSeconds,
    canonicalSourceTimeSeconds: canonical,
    sourceRate,
    sourceWindow: candidate.sourceWindow,
    live: candidate.strategy !== 'canonical-static',
    probeOnly: candidate.probeOnly === true,
    productionReference: candidate.productionReference === true,
  });
}

export function getLivingGuardIdleBoneWeight(candidateInput, boneId) {
  const candidate = resolveLivingGuardIdleCandidate(candidateInput);
  if (candidate.strategy === 'canonical-static') return 0;
  if (candidate.strategy === 'live-source') return 1;
  return clamp01(LIVING_GUARD_IDLE_BONE_WEIGHTS[boneId]);
}

export function buildLivingGuardIdleProbeReport(durationSeconds) {
  const duration = Math.max(0, Number(durationSeconds) || 0);
  return Object.freeze({
    stage: LIVING_GUARD_IDLE_STAGE,
    sourceClipId: LIVING_GUARD_IDLE_SOURCE_CLIP_ID,
    sourceDurationSeconds: duration,
    canonicalSample: LIVING_GUARD_IDLE_CANONICAL_SAMPLE,
    canonicalSourceTimeSeconds: livingGuardCanonicalSourceTime(duration),
    gentleSourceWindow: LIVING_GUARD_IDLE_GENTLE_WINDOW,
    productionUnchanged: true,
    productionStage: 'G3.6.3',
    candidates: LIVING_GUARD_IDLE_CANDIDATES,
    livingTriangleBoneWeights: LIVING_GUARD_IDLE_BONE_WEIGHTS,
    decision: 'PROBE_ONLY — C loops the source-scanned 29–31s authored micro-sway and applies only its restrained local quaternion delta on top of the current Triangle Guard.',
  });
}
