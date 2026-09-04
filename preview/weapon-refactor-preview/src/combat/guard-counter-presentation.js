// @ts-check
import {
  GUARD_ACTION_SEMANTIC_FIT,
  GUARD_ACTION_SEMANTIC_ROLES,
  guardActionSemanticAssessment,
} from './guard-action-semantics.js';

export const GUARD_COUNTER_PROFILE_IDS = Object.freeze({
  LONGSWORD: 'longsword_guard_counter_melee_block_attack_v1',
});

export const GUARD_WEAPON_MOUNT_PROFILE_IDS = Object.freeze({
  SKYRIM_GUARD: 'skyrim-guard-calibrated',
  KAYKIT_DEFAULT: 'kaykit-default',
});

const COUNTER_COMPLETE_EVENT = 'counter_complete';

export const LONGSWORD_COUNTER_TIMING_ANCHORS = Object.freeze([
  Object.freeze({ presentation: 0.00, source: 0.00, phase: 'launch' }),
  Object.freeze({ presentation: 0.18, source: 0.25, phase: 'launch' }),
  Object.freeze({ presentation: 0.30, source: 0.40, phase: 'strike' }),
  Object.freeze({ presentation: 0.38, source: 0.46, phase: 'contact-accent' }),
  Object.freeze({ presentation: 0.50, source: 0.60, phase: 'follow-through' }),
  Object.freeze({ presentation: 0.76, source: 0.85, phase: 'follow-through' }),
  Object.freeze({ presentation: 1.00, source: 1.00, phase: 'settle' }),
]);

export const LONGSWORD_GUARD_COUNTER_PROFILE = Object.freeze({
  id: GUARD_COUNTER_PROFILE_IDS.LONGSWORD,
  state: 'guard_counter',
  sourceFamily: 'kaykit-melee',
  sourceId: 'Melee_Block_Attack',
  clipId: 'Melee_Block_Attack',
  completionEvent: COUNTER_COMPLETE_EVENT,
  correctionWeight: 0,
  weaponMountProfileId: GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT,
  inPlace: true,
  loop: false,
  authored: true,
  authoredStage: 'G3.4',
  timingStage: 'G3.4.2',
  sourceWindow: Object.freeze({ startProgress: 0, endProgress: 1 }),
  timingAnchors: LONGSWORD_COUNTER_TIMING_ANCHORS,
  legacyOnly: true,
  productionEnabled: false,
  retiredByStage: 'G3.5.1',
  visualDecision: 'G3.5.1 LEGACY COMPATIBILITY ONLY — keep the G3.4 Melee_Block_Attack timing for regression labs, but production Parry follow-up now returns control to the existing directional attack system.',
  ...guardActionSemanticAssessment({
    intendedRole: GUARD_ACTION_SEMANTIC_ROLES.LEGACY_COUNTER_PRESENTATION,
    sourceRole: GUARD_ACTION_SEMANTIC_ROLES.BLOCK_ATTACK_PUSH,
    fit: GUARD_ACTION_SEMANTIC_FIT.PROVISIONAL,
    replacementRequired: false,
    note: 'No replacement Counter animation is required. Melee_Block_Attack remains only for G3.4 regression evidence and may later be reused as Shield Bash / Guard Push.',
  }),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function sampleTimingAnchor(progressInput, anchors = LONGSWORD_COUNTER_TIMING_ANCHORS) {
  const progress = clamp(progressInput, 0, 1);
  if (progress <= anchors[0].presentation) {
    return Object.freeze({ sourceProgress: anchors[0].source, phase: anchors[0].phase });
  }

  for (let index = 1; index < anchors.length; index += 1) {
    const right = anchors[index];
    const left = anchors[index - 1];
    if (progress > right.presentation) continue;
    const span = Math.max(1e-6, right.presentation - left.presentation);
    const local = clamp((progress - left.presentation) / span, 0, 1);
    return Object.freeze({
      sourceProgress: left.source + (right.source - left.source) * local,
      phase: local < 0.5 ? left.phase : right.phase,
    });
  }

  const last = anchors[anchors.length - 1];
  return Object.freeze({ sourceProgress: last.source, phase: last.phase });
}

export function sampleGuardCounterProfile(elapsedMs = 0, clipDurationSeconds = 0) {
  const durationSeconds = Math.max(0, Number(clipDurationSeconds) || 0);
  if (!(durationSeconds > 0)) return null;
  const elapsedSeconds = Math.max(0, Number(elapsedMs) || 0) / 1000;
  const presentationProgress = clamp(elapsedSeconds / durationSeconds, 0, 1);
  const timing = sampleTimingAnchor(presentationProgress);
  const sourceProgress = clamp(timing.sourceProgress, 0, 1);
  return Object.freeze({
    profile: LONGSWORD_GUARD_COUNTER_PROFILE,
    progress: presentationProgress,
    presentationProgress,
    sourceProgress,
    phase: timing.phase,
    sourceTimeSeconds: durationSeconds * sourceProgress,
    durationSeconds,
    durationMs: durationSeconds * 1000,
    complete: presentationProgress >= 1,
    completionEvent: LONGSWORD_GUARD_COUNTER_PROFILE.completionEvent,
  });
}
