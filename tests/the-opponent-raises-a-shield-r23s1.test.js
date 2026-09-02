import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPPONENT_GUARD_PROFILE, OPPONENT_GUARD_REASONS, planOpponentGuard } from '../src/combat/opponent-guard.js';
import { MEASURED_CONTACT_SECONDS } from '../src/combat/fighter-condition.js';

// R23S.1 - the opponent raises a shield (step 6a), as R23T.1 (step 6b) reshaped it.
//
// R23S.1 raised and lowered the shield per swing. A person noticed the opponent's stance did not
// match the player's, who stands in guard the whole time in parry mode, and step 6b made the
// shield permanent and gave it a sector instead. What survives from 6a and is pinned here: the
// reaction beats the blade, the opponent never holds a shield while their own swing owns the
// body, and the lab reads the opponent's stance rather than writing it in.


test('R23S.1 the reaction beats the blade', () => {
  assert.ok(OPPONENT_GUARD_PROFILE.reactionSeconds < MEASURED_CONTACT_SECONDS,
    `reaction ${OPPONENT_GUARD_PROFILE.reactionSeconds} vs contact ${MEASURED_CONTACT_SECONDS}`);
});

test('R23S.1 a body that swings reads nothing: the shield stays where it was', () => {
  // R23U.1 reshaped 6a's rule: the guard is held through the swing (the machine stays HOLD, as
  // the player's does) and only the READ is forbidden - the shield does not move mid-swing.
  const plan = planOpponentGuard({ threat: { active: true, sequence: 1, elapsedSeconds: 0.4, direction: 'top' }, decision: { willCover: true, reactionSeconds: 0 }, currentSector: 'left', ownSwinging: true });
  assert.equal(plan.hold, true);
  assert.equal(plan.sector, 'left');
  assert.equal(plan.reason, OPPONENT_GUARD_REASONS.SWINGING);
});

test('R23S.1 the lab reads the opponent\'s stance instead of writing it in', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /stanceReport: attackerFighter\.stance\.report, lateGuardRaise: false,/);
  assert.match(entry, /readGuardActive: \(\) => attackerFighter\.stance\.report\.guardActive === true && !attackRuntime\.active,/); // R23U.1 widened it
  // R23U.1: the shield is no longer dropped to swing - see the-opponent-keeps-guard-r23u1.test.js.
  assert.doesNotMatch(entry, /syncOpponentGuard\(false\)/);
  assert.doesNotMatch(entry, /stanceReport: \{ guardActive: false \}/);
});
