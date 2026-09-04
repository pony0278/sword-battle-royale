import { LONGSWORD_DIRECTIONAL_ATTACK_DEFINITIONS } from './longsword-directional-attack-runtime.js';

export const LONGSWORD_CONTACT_RECOVERY_STAGE = 'G4.2.1';
export const LONGSWORD_PARRY_VISUAL_LEAD_SECONDS = 0.16;

// R21J.2 - a settle is a speed, not a duration.
//
// These were one number per direction regardless of how far the pose had to travel, and the
// distances are not comparable. Measured, blade axis, from the attack's last frame to rest:
//
//   direction   ends this far from idle   the blend travels   over     speed
//   top          4.4 deg                    2.8 deg           83ms      34 deg/s
//   left        46.7 deg                   61.6 deg          167ms     369 deg/s
//   right       43.0 deg                  137.5 deg          167ms     823 deg/s
//
// So the same "155ms" was a gentle drift for one direction and 823 deg/s for another - inside the
// range of a real sword cut (700-1200) and faster than TOP's entire windup (53-325). It read
// exactly as it measures: RIGHT and LEFT snap back, TOP settles. TOP only looks right because its
// clip returns to rest by itself and leaves the blend almost nothing to do.
//
// RIGHT travels 137.5 deg to close a 43 deg gap because the blend interpolates each bone's own
// rotation, so the composed blade path is not the short way round. That is inherent to per-bone
// blending; what is fixable is how long it is given.
//
// So the durations are derived: travel / SETTLE_DEGREES_PER_SECOND, floored so a direction with
// nothing to do still takes a moment. 250 deg/s sits below the slowest deliberate motion any of
// these attacks contains (TOP's windup floor is 53, its ceiling 325) and far below a cut.
export const SETTLE_DEGREES_PER_SECOND = 250;

export const MEASURED_RECOVERY_TRAVEL_DEGREES = Object.freeze({
  top: 2.8,
  right: 137.5,
  left: 61.6,
  method: 'blade-axis-turn-summed-across-the-blend-at-2.40m',
  gapToIdleDegrees: Object.freeze({ top: 4.4, right: 43.0, left: 46.7 }),
  speedBeforeDegreesPerSecond: Object.freeze({ top: 34, right: 823, left: 369 }),
});

const MINIMUM_RECOVERY_MS = 120;

const ATTACK_RECOVERY_DURATION_MS = Object.freeze(Object.fromEntries(
  ['top', 'right', 'left'].map((direction) => [direction, Math.max(
    MINIMUM_RECOVERY_MS,
    Math.round((MEASURED_RECOVERY_TRAVEL_DEGREES[direction] / SETTLE_DEGREES_PER_SECOND) * 1000),
  )]),
));

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
