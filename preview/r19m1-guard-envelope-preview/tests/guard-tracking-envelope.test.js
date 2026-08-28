import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  GUARD_TRACKING_ENVELOPE_STAGE,
  GUARD_TRACKING_TRAVEL_BUDGET_METERS,
  GUARD_TRACKING_SPEED_MPS,
  GUARD_EXCEEDS_PARRY_REACH_RATIONALE,
} from '../src/combat/guard-tracking-envelope.js';
import {
  PARRY_LUNGE_TRAVEL_BUDGET_METERS,
  PARRY_LUNGE_TRACKING_SPEED_MPS,
} from '../src/combat/parry-lunge-reach.js';
import { getGuardThreatTrackingProfile } from '../src/combat/guard-threat-tracking.js';

test('R19M.1 the guard profile reads its travel envelope from the named module', () => {
  assert.equal(GUARD_TRACKING_ENVELOPE_STAGE, 'R19M.1');
  const guard = getGuardThreatTrackingProfile('guard');
  assert.equal(guard.maxCorrectionMeters, GUARD_TRACKING_TRAVEL_BUDGET_METERS);
  assert.equal(guard.maxTrackingSpeedMps, GUARD_TRACKING_SPEED_MPS);
  // The joint limits were measured not to bind, so R19M.1 left them where R18R.1 put them.
  // Widening them (34/42 -> 70/85) scored no better than the stock pair in the same conditions.
  assert.equal(guard.upperArmMaxDegrees, 34);
  assert.equal(guard.lowerArmMaxDegrees, 42);
});

test('R19M.1 guard travels further than parry but never faster', () => {
  // Both halves matter and they pull in opposite directions, so both are asserted. The speed rule
  // is the one the guard profile states in prose; the reach ordering is the one R19M.1 reversed,
  // and it is pinned in its new direction so that quietly restoring the old bands fails loudly.
  assert.ok(GUARD_TRACKING_TRAVEL_BUDGET_METERS > PARRY_LUNGE_TRAVEL_BUDGET_METERS);
  assert.ok(GUARD_TRACKING_SPEED_MPS < PARRY_LUNGE_TRACKING_SPEED_MPS);
  assert.match(GUARD_EXCEEDS_PARRY_REACH_RATIONALE.supersedes, /R19F\.1/);
  assert.match(GUARD_EXCEEDS_PARRY_REACH_RATIONALE.authority, /no-contact-authority/);
});

test('R19M.1 the budget sits at the measured saturation point, not above it', () => {
  // 0.55 scored 8/12 and 0.75 scored 12/12 at the stance that discriminates; 0.90 matched 0.75
  // without beating it. Pinning the value against the sweep keeps a later "round it up" from
  // passing silently - a bigger number is not a better one here, it is an untested one.
  assert.equal(GUARD_TRACKING_TRAVEL_BUDGET_METERS, 0.75);
  assert.equal(GUARD_TRACKING_SPEED_MPS, 2.5);
});

test('R19M.1 records that this is a floor change, not a close-range fix', async () => {
  // The honest bound on the claim. At the 0.90m pushbox the blade base arrives past the shield
  // plane - the attacker is inside the guard - and no envelope reaches behind itself. If this
  // paragraph goes, so does the reason nobody should expect close range to work now.
  const source = await readFile(new URL('../src/combat/guard-tracking-envelope.js', import.meta.url), 'utf8');
  assert.match(source, /PAST the shield plane/);
  assert.match(source, /hilt-strike/);
  assert.match(source, /not a close-range fix/);
});
