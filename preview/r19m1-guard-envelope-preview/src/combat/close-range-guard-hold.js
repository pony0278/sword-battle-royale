import { ATTACK_ADVANCE_PROFILES } from './attack-advance.js';
import { MINIMUM_ENGAGEMENT_SEPARATION_METERS } from './lane-locomotion.js';
import { effectiveSeparationAtContact } from './engagement-spacing.js';

export const CLOSE_RANGE_GUARD_HOLD_STAGE = 'R19O.1';

// R19O.1: at close range the guard stops chasing and holds its shield in front.
//
// The chase makes close range worse, and that is measured rather than argued. The tracking servo
// aims at the blade, and inside the working floor the blade is already past the shield plane -
// R19M.1's own record puts the blade base a third of a metre behind it at the pushbox - so the
// servo hauls the shield toward a crossing that no longer exists in front of anybody. Tracked, the
// attacker's hilt crossed the shield plane 0.44-0.74m from the shield centre; with the shield left
// at rest the same crossings came at 0.36m in the active window, and inside the disc's own 0.26m
// radius during recovery. The user's read of the film was exactly this: at that distance the swing
// should meet a shield that is simply THERE, hilt on boss, not a shield that lunged away after a
// blade it cannot catch.
//
// So the posture decision is made once per exchange, from where this swing will actually arrive:
// the separation at commitment minus the direction's authored advance, floored at the pushbox.
// Below the floor the guard holds - coverage is never committed, the latch stays quiet, the arm
// stays home where the hilt path is - and at or above it the chase runs exactly as R19M.1 tuned
// it. The floor is the boundary R19M.1 measured: the chase first converts a landing swing into a
// block at 1.14m of contact separation (12/12), and below 1.1m it converts nothing (0/6 at every
// nearer stance). Holding costs those stances no blocks, because there were none to cost.
export const CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS = 1.1;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Decided at commitment, held for the exchange: a per-frame flip between chase and hold would
// shake the arm at exactly the range where the film already looks worst.
export function planCloseRangeGuardPosture(input = {}) {
  const direction = String(input.direction || '').toLowerCase();
  const advance = ATTACK_ADVANCE_PROFILES[direction]?.metersByContact;
  const separationMeters = finite(input.separationMeters, NaN);
  if (!Number.isFinite(advance) || !Number.isFinite(separationMeters)) {
    return Object.freeze({
      stage: CLOSE_RANGE_GUARD_HOLD_STAGE,
      direction,
      posture: 'chase',
      reason: !Number.isFinite(advance) ? 'unmeasured-direction-chases' : 'unknown-separation-chases',
      authority: 'close-range-posture-only-no-contact-authority',
    });
  }
  const predictedContactSeparationMeters = Math.max(
    MINIMUM_ENGAGEMENT_SEPARATION_METERS,
    effectiveSeparationAtContact(separationMeters, advance),
  );
  const hold = predictedContactSeparationMeters < CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS;
  return Object.freeze({
    stage: CLOSE_RANGE_GUARD_HOLD_STAGE,
    direction,
    posture: hold ? 'hold-at-neutral' : 'chase',
    separationMeters,
    predictedContactSeparationMeters,
    contactFloorMeters: CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS,
    reason: hold
      ? 'blade-arrives-behind-the-shield-plane-so-the-shield-stays-in-front'
      : 'chase-converts-blocks-at-this-range',
    authority: 'close-range-posture-only-no-contact-authority',
  });
}
