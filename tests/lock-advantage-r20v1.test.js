import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONE_BANDS_DO_NOT_TRANSFER,
  LOCK_ADVANTAGE_VERDICT,
  MEASURED_LOCKED_DEFENCE,
  MEASURED_UNLOCKED_DEFENCE_DECAY,
  UNLOCKED_FACING_DECAY_DEGREES_PER_SECOND,
} from '../src/combat/lock-advantage.js';
import { MEASURED_GUARD_RELIABLE_CONE_DEGREES } from '../src/combat/guard-frontal-cone.js';

test('R20V.1 locking is worth a block at every distance the fight travels', () => {
  assert.equal(MEASURED_LOCKED_DEFENCE.facingErrorDegrees, 0);
  assert.equal(MEASURED_LOCKED_DEFENCE.outcomesAllDirections, 'blocked');
  assert.ok(MEASURED_LOCKED_DEFENCE.moveSecondsSampled.length >= 5);
});

test('R20V.1 unlocked, it is movement that costs the block, not the missing lock', () => {
  const table = MEASURED_UNLOCKED_DEFENCE_DECAY.byMoveSeconds;
  // Standing still unlocked defends perfectly - which is what makes "you cannot move and defend"
  // the honest description rather than "unlocked cannot defend".
  for (const direction of ['top', 'right', 'left']) assert.equal(table[0][direction], 'blocked');
  assert.equal(table[0].facingErrorDegrees, 0);
  // And a quarter second of it is already gone.
  assert.equal(table[0.25].top, 'body');
  assert.equal(table[0.25].left, 'body');
  assert.equal(LOCK_ADVANTAGE_VERDICT.secondsOfMovementBeforeFirstFailure, 0.25);
  // The error only grows.
  const seconds = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (let index = 1; index < seconds.length; index += 1) {
    assert.ok(table[seconds[index]].facingErrorDegrees >= table[seconds[index - 1]].facingErrorDegrees);
  }
});

test('R20V.1 the decay rate is the body turn, not a number of its own', () => {
  // A sidestep asks the body for 90 degrees and the integrator delivers at its own rate, so the
  // first sample should land near it rather than anywhere else.
  const quarterSecond = MEASURED_UNLOCKED_DEFENCE_DECAY.byMoveSeconds[0.25].facingErrorDegrees;
  assert.ok(quarterSecond < 90, 'a sidestep asks for 90 degrees and cannot overshoot it while turning');
  assert.ok(quarterSecond > UNLOCKED_FACING_DECAY_DEGREES_PER_SECOND * 0.25 * 0.5,
    'and it should be within reach of a quarter second at the measured turn rate');
});

test('R20V.1 the cone bands are recorded as NOT answering this, which is why they are cited', () => {
  // Every measured error above sits inside all three reliable bands and the blocks failed anyway.
  // The bands were taken under injected rotation at a fixed stance; these cells rotate and displace
  // together, because in free mode that is one input.
  assert.equal(CONE_BANDS_DO_NOT_TRANSFER.measuredUnder, 'injected-rotation-at-a-fixed-stance');
  assert.equal(CONE_BANDS_DO_NOT_TRANSFER.bands, MEASURED_GUARD_RELIABLE_CONE_DEGREES);
  const error = MEASURED_UNLOCKED_DEFENCE_DECAY.byMoveSeconds[0.25].facingErrorDegrees;
  for (const [direction, band] of Object.entries(MEASURED_GUARD_RELIABLE_CONE_DEGREES)) {
    assert.ok(error > band.fromDegrees && error < band.toDegrees,
      `${direction}'s band contains ${error} degrees, and the block still failed - the bands do not transfer`);
  }
});

test('R20V.1 the verdict stays a question, not a change', () => {
  assert.equal(LOCK_ADVANTAGE_VERDICT.status, 'measured-design-decision-open');
  assert.equal(LOCK_ADVANTAGE_VERDICT.lockedBlocksAtEveryMoveDuration, true);
  assert.equal(LOCK_ADVANTAGE_VERDICT.unlockedBlocksOnlyWhileStandingStill, true);
});
