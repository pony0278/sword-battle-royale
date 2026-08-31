import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  // R21G.1 added thrown/noAnswer; with no swings recorded the denominator falls back to the
  // presses, which is what keeps this pre-R21G.1 reading of the split intact.
  assert.deepEqual(rows.right, { thrown: 3, attempts: 3, armed: 1, wrongDirection: 1, unaimed: 0, mistimed: 1, other: 0, noAnswer: 0 });
  assert.deepEqual(rows.top, { thrown: 1, attempts: 1, armed: 0, wrongDirection: 0, unaimed: 1, mistimed: 0, other: 0, noAnswer: 0 });
  assert.deepEqual(rows.left, { thrown: 0, attempts: 0, armed: 0, wrongDirection: 0, unaimed: 0, mistimed: 0, other: 0, noAnswer: 0 });
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

test('R21G.1 the denominator is the swing, so an unanswered attack is visible', () => {
  const tally = createParryAttemptTally();
  // Three TOP swings; the player answers one and never touches the key for the other two. Before
  // R21G.1 this read "top 1/1" - a perfect record - because the two they could not react to left
  // no trace at all. That is the failure the tally most needs to find.
  for (let i = 0; i < 3; i += 1) tally.recordAttack('top');
  tally.record(report('top', 'parry-input-armed-awaiting-real-contact', 1, true));
  assert.equal(tally.rows.top.thrown, 3);
  assert.equal(tally.rows.top.noAnswer, 2);
  assert.match(tally.summary, /top 1\/3 \(2 沒答\)/);
});

test('R21G.1 every swing lands in exactly one bucket', () => {
  const tally = createParryAttemptTally();
  const reasons = [
    ['parry-input-armed-awaiting-real-contact', true],
    ['parry-input-wrong-direction', false],
    ['parry-input-too-late', false],
    ['parry-input-unaimed', false],
    ['something-else-entirely', false],
  ];
  let sequence = 0;
  for (const direction of ['top', 'right', 'left']) {
    for (const [reason, accepted] of reasons) {
      sequence += 1;
      tally.recordAttack(direction);
      tally.record(report(direction, reason, sequence, accepted));
    }
    tally.recordAttack(direction); // and one nobody answered
  }
  for (const [direction, row] of Object.entries(tally.rows)) {
    const bucketed = row.armed + row.wrongDirection + row.unaimed + row.mistimed + row.other + row.noAnswer;
    assert.equal(bucketed, row.thrown, `${direction}: ${bucketed} bucketed vs ${row.thrown} thrown`);
    assert.equal(row.thrown, 6, direction);
    assert.equal(row.noAnswer, 1, direction);
  }
});

test('R21G.1 switching the opponent on starts a fresh sample, and only the rising edge does', () => {
  const tally = createParryAttemptTally();
  tally.recordAttack('top');
  tally.record(report('top', 'parry-input-too-late', 1));
  assert.equal(tally.rows.top.thrown, 1);

  assert.equal(tally.setSessionActive(true), true);
  assert.equal(tally.rows.top.thrown, 0, 'a run begins on a clean sample');

  tally.recordAttack('left');
  tally.setSessionActive(true); // still on: a held checkbox must not wipe the run every frame
  assert.equal(tally.rows.left.thrown, 1);

  tally.setSessionActive(false); // switched off: the numbers stay readable
  assert.equal(tally.rows.left.thrown, 1);
  assert.equal(tally.sessionActive, false);
  tally.setSessionActive(true);
  assert.equal(tally.rows.left.thrown, 0, 'and the next run is clean again');
});

test('R21G.1 recording is not gated on the session - practising by hand still counts', () => {
  const tally = createParryAttemptTally();
  assert.equal(tally.sessionActive, false);
  tally.recordAttack('right');
  tally.record(report('right', 'parry-input-wrong-direction', 9));
  assert.equal(tally.rows.right.thrown, 1);
  assert.equal(tally.rows.right.wrongDirection, 1);
});

test('R21G.1 the drive tells the tally when a run starts, and the lab counts every swing', () => {
  const controller = readFileSync(new URL('../tools/action-studio/shield-parry-r281/opponent-drive-controller.js', import.meta.url), 'utf8');
  assert.ok(controller.includes('tally?.setSessionActive(enabled());'));
  // Before the early return, or a run would only ever be reset by the frame that also drove it.
  assert.ok(controller.indexOf('tally?.setSessionActive(enabled());') < controller.indexOf('if (!enabled()) return null;'));
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.ok(entry.includes('parryTally.recordAttack(direction);'), 'every swing is counted as it starts');
});

test('R21G.1 pressing before the attacker commits is a timing miss, not an unknown one', () => {
  // The gate answers a press made before movementStartSeconds with 'attack-not-committed'. From
  // the player's side that is pressing too early; a driven run filed 34 of 34 such presses under
  // "other", which is the bucket that means the tally has nothing to tell you.
  const tally = createParryAttemptTally();
  for (const reason of ['parry-input-too-early', 'parry-input-too-late', 'attack-not-committed']) {
    tally.recordAttack('top');
  }
  let sequence = 0;
  for (const reason of ['parry-input-too-early', 'parry-input-too-late', 'attack-not-committed']) {
    tally.record(report('top', reason, sequence += 1));
  }
  assert.equal(tally.rows.top.mistimed, 3);
  assert.equal(tally.rows.top.other, 0);

  // A broken attack timeline is NOT a player mistake and must stay conspicuous.
  const broken = createParryAttemptTally();
  broken.recordAttack('left');
  broken.record(report('left', 'missing-authored-attack-timeline', 1));
  assert.equal(broken.rows.left.other, 1);
  assert.equal(broken.rows.left.mistimed, 0);
});
