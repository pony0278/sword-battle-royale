import { ATTACK_ADVANCE_PROFILES } from './attack-advance.js';
import { MINIMUM_ENGAGEMENT_SEPARATION_METERS } from './lane-locomotion.js';
import { effectiveSeparationAtContact } from './engagement-spacing.js';

export const CLOSE_RANGE_GUARD_HOLD_STAGE = 'R20E.1';

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
// it. The base floor is the boundary R19M.1 measured: the chase first converts a landing swing
// into a block at 1.14m of contact separation (12/12), and below 1.1m it converts nothing (0/6
// at every nearer stance). Holding costs those stances no blocks, because there were none to
// cost.
//
// R19R.1 made the floor per-direction, for RIGHT's knife-edge (the 1.8m stance, contact at
// 1.137m - three centimetres into chase territory). That cell was dissected before it was moved:
// no static body angle blocks it (0/15/20/25 degrees scored 0-2 in 6; the shipped 40 pooled
// 14/24), because what connects there is a shield still in rotational MOTION when the arc
// arrives - and that timing belonged to frame jitter, not to design. Slowing the turn so the
// sweep crosses the window deliberately (120-200 deg/s) stayed a coin flip; the phase is jitter
// all the way down. Raising RIGHT's floor to 1.2 hands the cell to the clang instead: 8/8, no
// body hits, deterministic. The other floors do not move, and must not move casually - TOP at
// 2.0m (contact 1.138m) and LEFT at 1.6m (contact 1.15m) sit centimetres from these boundaries
// and both are 8/8 under their measured turns; a global raise would trade that certainty for
// unmeasured clang corridors.
// R20E.1 lifted RIGHT's floor again, to 1.35, for the band the first lift exposed: the 1.9m
// and 2.0m stances (contact 1.24-1.34m) sat in the crack between the mechanisms - past the
// clang's corridor, short of where the chase settles true - and blocked 1/4 and 5/8, decided
// by frame phase. The autopsy, passive-probed: the servo spends the windup dragged low-left
// after the flourish (contact at [-0.39, 0.49] when it does connect), the arc's real crossing
// appears at the centre-line ([-0.03, 0.68]) with ~30ms left and 0.67m of demand, and the
// sweep misses by six centimetres. Held, the resting shield IS on the arc's path: 8/8 at both
// stances, no clang involved (contact arrives well past the 0.95m zone) and no guard turn
// (hold keeps the turn at zero, and was measured without it). 2.1m (contact 1.44m) chases at
// 4/4 and stays chase-side of the floor; 1.8m keeps its measured clang answer.
export const CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS = Object.freeze({
  top: 1.1,
  right: 1.35,
  left: 1.1,
});

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
  const contactFloorMeters = finite(
    CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS[direction],
    Math.min(...Object.values(CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS)),
  );
  const hold = predictedContactSeparationMeters < contactFloorMeters;
  return Object.freeze({
    stage: CLOSE_RANGE_GUARD_HOLD_STAGE,
    direction,
    posture: hold ? 'hold-at-neutral' : 'chase',
    separationMeters,
    predictedContactSeparationMeters,
    contactFloorMeters,
    reason: hold
      ? 'blade-arrives-behind-the-shield-plane-so-the-shield-stays-in-front'
      : 'chase-converts-blocks-at-this-range',
    authority: 'close-range-posture-only-no-contact-authority',
  });
}
