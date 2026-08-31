import test from 'node:test';
import assert from 'node:assert/strict';

import { createParryAttemptTally, PARRY_ATTEMPT_TALLY_STAGE } from '../tools/action-studio/shield-parry-r281/parry-attempt-tally.js';

const report = (attackDirection, reason, sequence, accepted = false) => ({
  attackDirection, reason, sequence, accepted,
});

test('R21C.2 counts attempts per direction and why they missed', () => {
  assert.equal(PARRY_ATTEMPT_TALLY_STAGE, 'R21C.2');
  const tally = createParryAttemptTally();
  tally.record(report('right', 'parry-input-armed-awaiting-real-contact', 1, true));
  tally.record(report('right', 'parry-input-wrong-direction', 2));
  tally.record(report('right', 'parry-input-too-late', 3));
  tally.record(report('top', 'parry-input-unaimed', 4));

  const rows = tally.rows;
  assert.deepEqual(rows.right, { attempts: 3, armed: 1, wrongDirection: 1, unaimed: 0, mistimed: 1, other: 0 });
  assert.deepEqual(rows.top, { attempts: 1, armed: 0, wrongDirection: 0, unaimed: 1, mistimed: 0, other: 0 });
  assert.deepEqual(rows.left, { attempts: 0, armed: 0, wrongDirection: 0, unaimed: 0, mistimed: 0, other: 0 });
  // The split is what makes the number actionable: wrong direction wants a more legible windup,
  // wrong moment wants a wider window, and a bare failure rate says only that it is hard.
  assert.match(tally.summary, /right 1\/3 \(1 方向\/1 時機\)/);
  assert.match(tally.summary, /left —/);
});

test('R21C.2 a refused duplicate is not a second attempt', () => {
  // One arm per attack is the gate's own rule, so the refusal it returns is that rule speaking,
  // not a player trying again. Counting it would inflate every failure rate.
  const tally = createParryAttemptTally();
  tally.record(report('left', 'parry-input-wrong-direction', 7));
  tally.record(report('left', 'parry-input-already-used-for-attack', 7));
  tally.record(report('left', 'parry-input-wrong-direction', 7));
  assert.equal(tally.rows.left.attempts, 1);
  // A new sequence is a new attempt.
  tally.record(report('left', 'parry-input-wrong-direction', 8));
  assert.equal(tally.rows.left.attempts, 2);
});

test('R21C.2 ignores what it cannot attribute, and resets', () => {
  const tally = createParryAttemptTally();
  assert.equal(tally.record(null), null);
  assert.equal(tally.record(report('', 'parry-input-unaimed', 1)), null, 'no direction, nothing to count');
  assert.equal(tally.record(report('sideways', 'parry-input-unaimed', 2)), null);
  assert.equal(tally.rows.top.attempts, 0);
  tally.record(report('top', 'parry-input-armed-awaiting-real-contact', 3, true));
  assert.equal(tally.rows.top.armed, 1);
  tally.reset();
  assert.equal(tally.rows.top.attempts, 0);
});
