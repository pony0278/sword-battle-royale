// @ts-check
// The phases a swing passes through, as vocabulary rather than as one weapon's property.
//
// handoff/39 classified this as category B. The evidence is what the readers do with it: the two
// src consumers - contact-lifecycle-director and swing-windup-tracking - compare a snapshot's phase
// against these words and never ask what produced the snapshot. A greatsword's windup is longer
// than a longsword's, but it is still a windup, and the code that waits for one does not need to
// know which weapon it is waiting on.
//
// getAttackPhase belongs here for the same reason: it reads activeStartSeconds, activeEndSeconds
// and durationSeconds off a profile. Those three landmarks are what a directional attack timings
// record produces for any weapon, so the function that turns them into a phase is the vocabulary's,
// not the longsword's.
export const ATTACK_PHASES = Object.freeze({
  IDLE: 'idle',
  WINDUP: 'attack_windup',
  ACTIVE: 'attack_active',
  RECOVERY: 'attack_recovery',
  INTERRUPTED: 'attack_interrupted',
});

export function getAttackPhase(profile, elapsedSeconds) {
  if (!profile) return ATTACK_PHASES.IDLE;
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  if (elapsed < profile.activeStartSeconds) return ATTACK_PHASES.WINDUP;
  if (elapsed <= profile.activeEndSeconds) return ATTACK_PHASES.ACTIVE;
  if (elapsed < profile.durationSeconds) return ATTACK_PHASES.RECOVERY;
  return ATTACK_PHASES.IDLE;
}
