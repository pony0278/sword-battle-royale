export const POWER_BASH_READABILITY_STAGE = 'G3.6.1';
export const POWER_BASH_RECOVERY_PROBE_STAGE = 'G3.6.2';
export const POWER_BASH_PRODUCTION_PROMOTION_STAGE = 'G3.6.3';
export const POWER_BASH_READABILITY_SOURCE_CLIP_ID = 'SKYRIM_GUARD/shd_blockbashpower';

// Historical baseline must stay frozen after G3.6.3 promotes D. Otherwise the
// A/B/C/D decision lab would silently rewrite B to the new production timing.
const FORMER_G36_PROFILE = Object.freeze({
  deflectStartSeconds: 0.12,
  deflectEndSeconds: 0.28,
  deflectRate: 1.10,
});

export const POWER_BASH_READABILITY_CANDIDATE_IDS = Object.freeze({
  FULL_SOURCE: 'full-source',
  CURRENT_G36: 'current-g36',
  EXTENDED: 'extended',
  EXTENDED_FULL_RECOVERY: 'extended-full-recovery',
});

export const POWER_BASH_READABILITY_CANDIDATES = Object.freeze([
  Object.freeze({
    id: POWER_BASH_READABILITY_CANDIDATE_IDS.FULL_SOURCE,
    slot: 'A',
    label: 'Full Source',
    sourceStartSeconds: 0,
    sourceEndSeconds: null,
    playbackRate: 0.5,
    sourceEndPolicy: 'clip-duration',
    intent: 'Show the complete retargeted Power Bash at half speed so no authored body motion is hidden by trimming.',
  }),
  Object.freeze({
    id: POWER_BASH_READABILITY_CANDIDATE_IDS.CURRENT_G36,
    slot: 'B',
    label: 'Former G3.6',
    sourceStartSeconds: FORMER_G36_PROFILE.deflectStartSeconds,
    sourceEndSeconds: FORMER_G36_PROFILE.deflectEndSeconds,
    playbackRate: FORMER_G36_PROFILE.deflectRate,
    sourceEndPolicy: 'fixed',
    historicalProductionReference: true,
    historicalStage: 'G3.6',
    intent: 'Frozen historical production baseline used before D was promoted in G3.6.3.',
  }),
  Object.freeze({
    id: POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED,
    slot: 'C',
    label: 'Extended Candidate',
    sourceStartSeconds: 0.08,
    sourceEndSeconds: 0.55,
    playbackRate: 0.95,
    sourceEndPolicy: 'fixed',
    probeOnly: true,
    intent: 'Readability candidate that exposed the stronger Power Bash body motion but stopped before authored recovery.',
  }),
  Object.freeze({
    id: POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED_FULL_RECOVERY,
    slot: 'D',
    label: 'Extended + Full Recovery',
    productionCandidate: true,
    promotedInStage: POWER_BASH_PRODUCTION_PROMOTION_STAGE,
    composite: true,
    segments: Object.freeze([
      Object.freeze({
        role: 'power',
        sourceStartSeconds: 0.08,
        sourceEndSeconds: 0.55,
        sourceEndPolicy: 'fixed',
        playbackRate: 0.95,
      }),
      Object.freeze({
        role: 'recovery',
        sourceStartSeconds: 0.55,
        sourceEndSeconds: null,
        sourceEndPolicy: 'clip-duration',
        playbackRate: 1.0,
      }),
    ]),
    intent: 'Approved production motion: keep C unchanged through the strong Power Bash beat, then preserve the authored Skyrim recovery tail through clip end for a natural reset.',
  }),
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function resolveSegment(segment, clipDuration) {
  const start = clamp(segment.sourceStartSeconds, 0, clipDuration || Number.POSITIVE_INFINITY);
  const requestedEnd = segment.sourceEndPolicy === 'clip-duration'
    ? clipDuration
    : Number(segment.sourceEndSeconds);
  const end = clipDuration > 0
    ? clamp(requestedEnd, start, clipDuration)
    : Math.max(start, Number(requestedEnd) || start);
  const playbackRate = Math.max(0.001, Number(segment.playbackRate) || 1);
  const sourceDurationSeconds = Math.max(0, end - start);
  const visualDurationSeconds = sourceDurationSeconds / playbackRate;
  return Object.freeze({
    ...segment,
    sourceStartSeconds: start,
    sourceEndSeconds: end,
    playbackRate,
    sourceDurationSeconds,
    visualDurationSeconds,
  });
}

function resolveCandidateSegments(candidate, clipDuration) {
  if (candidate.segments?.length) {
    return Object.freeze(candidate.segments.map((segment) => resolveSegment(segment, clipDuration)));
  }
  return Object.freeze([resolveSegment(candidate, clipDuration)]);
}

export function resolvePowerBashReadabilityCandidate(candidateOrId, clipDurationSeconds) {
  const candidate = typeof candidateOrId === 'string'
    ? POWER_BASH_READABILITY_CANDIDATES.find((entry) => entry.id === candidateOrId)
    : candidateOrId;
  if (!candidate) throw new Error(`Unknown ${POWER_BASH_READABILITY_STAGE} candidate: ${candidateOrId}`);
  const clipDuration = Math.max(0, Number(clipDurationSeconds) || 0);
  const segments = resolveCandidateSegments(candidate, clipDuration);
  const first = segments[0];
  const last = segments[segments.length - 1];
  const sourceDurationSeconds = segments.reduce((sum, segment) => sum + segment.sourceDurationSeconds, 0);
  const visualDurationSeconds = segments.reduce((sum, segment) => sum + segment.visualDurationSeconds, 0);
  const singleRate = segments.every((segment) => segment.playbackRate === first.playbackRate)
    ? first.playbackRate
    : null;
  return Object.freeze({
    ...candidate,
    sourceStartSeconds: first.sourceStartSeconds,
    sourceEndSeconds: last.sourceEndSeconds,
    playbackRate: singleRate,
    sourceDurationSeconds,
    visualDurationSeconds,
    approximateFrames30: visualDurationSeconds * 30,
    approximateFrames60: visualDurationSeconds * 60,
    segments,
  });
}

export function samplePowerBashReadabilityCandidate(candidateOrId, visualElapsedSeconds, clipDurationSeconds) {
  const candidate = resolvePowerBashReadabilityCandidate(candidateOrId, clipDurationSeconds);
  let elapsed = clamp(visualElapsedSeconds, 0, candidate.visualDurationSeconds);
  for (const segment of candidate.segments) {
    if (elapsed <= segment.visualDurationSeconds) {
      return segment.sourceStartSeconds + Math.min(
        segment.sourceDurationSeconds,
        elapsed * segment.playbackRate,
      );
    }
    elapsed -= segment.visualDurationSeconds;
  }
  return candidate.sourceEndSeconds;
}

export function samplePowerBashReadabilityCandidateProgress(candidateOrId, progress, clipDurationSeconds) {
  const candidate = resolvePowerBashReadabilityCandidate(candidateOrId, clipDurationSeconds);
  const alpha = clamp(progress, 0, 1);
  return samplePowerBashReadabilityCandidate(
    candidate,
    candidate.visualDurationSeconds * alpha,
    clipDurationSeconds,
  );
}

export function buildPowerBashReadabilityProbeReport(clipDurationSeconds) {
  const candidates = POWER_BASH_READABILITY_CANDIDATES.map((candidate) => (
    resolvePowerBashReadabilityCandidate(candidate, clipDurationSeconds)
  ));
  const former = candidates.find((entry) => entry.id === POWER_BASH_READABILITY_CANDIDATE_IDS.CURRENT_G36);
  const extended = candidates.find((entry) => entry.id === POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED);
  const recovered = candidates.find((entry) => entry.id === POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED_FULL_RECOVERY);
  return Object.freeze({
    stage: POWER_BASH_READABILITY_STAGE,
    recoveryProbeStage: POWER_BASH_RECOVERY_PROBE_STAGE,
    productionPromotionStage: POWER_BASH_PRODUCTION_PROMOTION_STAGE,
    sourceClipId: POWER_BASH_READABILITY_SOURCE_CLIP_ID,
    clipDurationSeconds: Math.max(0, Number(clipDurationSeconds) || 0),
    productionUnchanged: false,
    productionPromoted: true,
    productionCandidateId: POWER_BASH_READABILITY_CANDIDATE_IDS.EXTENDED_FULL_RECOVERY,
    historicalBaselinePreserved: former.historicalProductionReference === true,
    candidates,
    diagnostics: Object.freeze({
      formerG36PowerSegmentMilliseconds: former.visualDurationSeconds * 1000,
      formerG36ApproximateFrames30: former.approximateFrames30,
      extendedPowerSegmentMilliseconds: extended.visualDurationSeconds * 1000,
      extendedApproximateFrames30: extended.approximateFrames30,
      extendedToFormerG36DurationRatio: former.visualDurationSeconds > 0
        ? extended.visualDurationSeconds / former.visualDurationSeconds
        : 0,
      extendedFullRecoveryMilliseconds: recovered.visualDurationSeconds * 1000,
      extendedFullRecoveryApproximateFrames30: recovered.approximateFrames30,
      recoveryTailMilliseconds: recovered.segments
        .filter((segment) => segment.role === 'recovery')
        .reduce((sum, segment) => sum + segment.visualDurationSeconds * 1000, 0),
      recoveryEndsAtClipEnd: Math.abs(recovered.sourceEndSeconds - Math.max(0, Number(clipDurationSeconds) || 0)) < 1e-9,
    }),
  });
}
