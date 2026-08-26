import { LONGSWORD_DIRECTIONAL_ATTACK_DEFINITIONS } from './longsword-directional-attack-runtime.js';

export const LONGSWORD_CONTACT_RECOVERY_STAGE = 'G4.2.1';
export const LONGSWORD_PARRY_VISUAL_LEAD_SECONDS = 0.16;

const ATTACK_RECOVERY_DURATION_MS = Object.freeze({
  top: 120,
  right: 155,
  left: 155,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function directionKey(direction) {
  const key = String(direction || '').toLowerCase();
  if (!LONGSWORD_DIRECTIONAL_ATTACK_DEFINITIONS[key]) {
    throw new Error(`Unknown longsword contact/recovery direction: ${direction}`);
  }
  return key;
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function getLongswordContactRecoveryProfile(direction) {
  const key = directionKey(direction);
  const attack = LONGSWORD_DIRECTIONAL_ATTACK_DEFINITIONS[key].runtime;
  const parryVisualLeadSeconds = Math.min(
    LONGSWORD_PARRY_VISUAL_LEAD_SECONDS,
    Math.max(0, attack.contactSeconds),
  );
  return Object.freeze({
    stage: LONGSWORD_CONTACT_RECOVERY_STAGE,
    direction: key,
    contactSeconds: attack.contactSeconds,
    parryPreviewStartSeconds: Math.max(0, attack.contactSeconds - parryVisualLeadSeconds),
    parryVisualLeadSeconds,
    parryPresentationOffsetSeconds: parryVisualLeadSeconds,
    attackRecoveryDurationMs: ATTACK_RECOVERY_DURATION_MS[key],
    attackRecoveryTargetClipId: 'UAL1/Sword_Idle',
    attackRecoveryTargetSourceTimeSeconds: 0,
  });
}

export function sampleLongswordParryPreContact(direction, elapsedSeconds = 0) {
  const profile = getLongswordContactRecoveryProfile(direction);
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  const active = elapsed >= profile.parryPreviewStartSeconds
    && elapsed < profile.contactSeconds
    && profile.parryVisualLeadSeconds > 0;
  const sourceTimeSeconds = active
    ? clamp(elapsed - profile.parryPreviewStartSeconds, 0, profile.parryVisualLeadSeconds)
    : 0;
  const progress = profile.parryVisualLeadSeconds > 0
    ? clamp01(sourceTimeSeconds / profile.parryVisualLeadSeconds)
    : 1;
  return Object.freeze({
    stage: LONGSWORD_CONTACT_RECOVERY_STAGE,
    profile,
    active,
    elapsedSeconds: elapsed,
    sourceTimeSeconds,
    progress,
    contactReady: elapsed >= profile.contactSeconds,
  });
}

export function sampleLongswordAttackRecovery(direction, elapsedMs = 0) {
  const profile = getLongswordContactRecoveryProfile(direction);
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const progress = clamp01(elapsed / Math.max(1, profile.attackRecoveryDurationMs));
  return Object.freeze({
    stage: LONGSWORD_CONTACT_RECOVERY_STAGE,
    profile,
    elapsedMs: elapsed,
    progress,
    eased: smoothstep(progress),
    complete: progress >= 1,
  });
}
