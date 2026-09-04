export const PARRY_ADVANTAGE_STAGE = 'G3.5.1';
export const PARRY_ADVANTAGE_FOLLOWUP_MODE = 'normal-directional-attack';
export const PARRY_ADVANTAGE_ENEMY_RESPONSE = 'authoritative-stagger';
export const PARRY_ADVANTAGE_DIRECTIONS = Object.freeze(['top', 'left', 'right']);

function normalizeFollowupWindow(input) {
  if (!Array.isArray(input) || input.length < 2) return null;
  const start = Math.max(0, Number(input[0]) || 0);
  const end = Math.max(start, Number(input[1]) || start);
  return Object.freeze([start, end]);
}

export function createParryAdvantageContract({
  grade = 'parry',
  followupWindowSeconds = null,
} = {}) {
  return Object.freeze({
    stage: PARRY_ADVANTAGE_STAGE,
    grade: String(grade || 'parry'),
    enemyResponse: PARRY_ADVANTAGE_ENEMY_RESPONSE,
    enemyStaggerDurationAuthority: 'authoritative-combat-balance',
    followupMode: PARRY_ADVANTAGE_FOLLOWUP_MODE,
    followupWindowSeconds: normalizeFollowupWindow(followupWindowSeconds),
    allowedDirections: PARRY_ADVANTAGE_DIRECTIONS,
    attackSystem: 'existing-directional-action-system',
    dedicatedCounterState: false,
    dedicatedCounterAnimation: false,
  });
}

export function isFreeAttackFollowupOpen(contract, elapsedSeconds = 0) {
  const window = contract?.followupWindowSeconds;
  if (!window) return false;
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  return elapsed >= window[0] && elapsed <= window[1];
}
