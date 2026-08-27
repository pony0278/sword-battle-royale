export const GUARD_ACTION_SEMANTIC_FIT = Object.freeze({
  MATCH: 'match',
  PROVISIONAL: 'provisional',
  MISMATCH: 'mismatch',
});

export const GUARD_ACTION_SEMANTIC_ROLES = Object.freeze({
  BLOCK_REACTION: 'block-reaction',
  PARRY_SUCCESS: 'parry-success',
  PERFECT_PARRY_SUCCESS: 'perfect-parry-success',
  PARRY_ADVANTAGE: 'parry-advantage',
  FREE_DIRECTIONAL_ATTACK_FOLLOWUP: 'free-directional-attack-followup',
  LEGACY_COUNTER_PRESENTATION: 'legacy-counter-presentation',
  COUNTER_STRIKE: 'counter-strike',
  SHIELD_BASH: 'shield-bash',
  SHIELD_POWER_BASH: 'shield-power-bash',
  BLOCK_ATTACK_PUSH: 'block-attack-push',
});

export const GUARD_ACTION_SEMANTIC_STAGE = 'G3.5.1';

export function guardActionSemanticAssessment({
  intendedRole,
  sourceRole,
  fit = GUARD_ACTION_SEMANTIC_FIT.MATCH,
  replacementRequired = false,
  acquisitionCriteria = [],
  note = '',
}) {
  return Object.freeze({
    semanticStage: GUARD_ACTION_SEMANTIC_STAGE,
    intendedRole,
    sourceRole,
    semanticFit: fit,
    replacementRequired: Boolean(replacementRequired),
    acquisitionCriteria: Object.freeze([...acquisitionCriteria]),
    semanticNote: note,
  });
}

// Compatibility constant for old G3.5 consumers. G3.5.1 no longer requires a
// dedicated Counter animation; production follow-up uses the existing attack system.
export const COUNTER_MOTION_ACQUISITION_CRITERIA = Object.freeze([]);
