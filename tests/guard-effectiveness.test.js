import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GUARD_EFFECTIVENESS_STAGE,
  GUARD_EFFECTIVENESS_DIRECTIONS,
  GUARD_EFFECTIVENESS_SUMMARY,
  MEASURED_GUARD_EFFECTIVENESS,
  MEASURED_GUARD_PAIRED_TRIALS,
  assessGuardEffectiveness,
} from '../src/combat/guard-effectiveness.js';

test('R19L.1 the guard saves the defender three times out of twenty-seven', () => {
  assert.equal(GUARD_EFFECTIVENESS_STAGE, 'R19L.1');
  assert.equal(GUARD_EFFECTIVENESS_SUMMARY.trialCount, 27);
  assert.equal(GUARD_EFFECTIVENESS_SUMMARY.guardMattersCount, 3);
  // The rest of the blocks are against swings that were missing anyway. Counting those as a
  // working guard is what hid this for so long, so the two are counted separately here.
  assert.equal(GUARD_EFFECTIVENESS_SUMMARY.theatreCount, 7);
  // Twelve pairs where the blade lands and the guard does nothing about it - four times as many
  // as the guard actually answers.
  assert.equal(GUARD_EFFECTIVENESS_SUMMARY.unansweredCount, 12);
  assert.ok(GUARD_EFFECTIVENESS_SUMMARY.unansweredCount > GUARD_EFFECTIVENESS_SUMMARY.guardMattersCount * 3);
  assert.equal(
    GUARD_EFFECTIVENESS_SUMMARY.guardMattersCount
      + GUARD_EFFECTIVENESS_SUMMARY.theatreCount
      + GUARD_EFFECTIVENESS_SUMMARY.unansweredCount
      + MEASURED_GUARD_PAIRED_TRIALS.filter((t) => !t.landsUnguarded && !t.blocked).length,
    27,
    'every trial must fall in exactly one bucket',
  );
});

test('R19L.1 RIGHT has never once been saved by its guard', () => {
  // The starkest row of the table and the reason facing is a prerequisite rather than a polish
  // item: where RIGHT can block, the attack misses anyway; where it lands, the guard never blocks.
  assert.deepEqual([...GUARD_EFFECTIVENESS_SUMMARY.directionsWithNoWorkingGuard], ['right']);
  const right = MEASURED_GUARD_EFFECTIVENESS.right;
  assert.equal(right.guardEverMatters, false);
  assert.deepEqual([...right.guardMattersStancesMeters], []);
  // And the two bands are disjoint, which is the mechanism rather than bad luck.
  const overlap = right.landingStancesMeters.filter((s) => right.blockingStancesMeters.includes(s));
  assert.deepEqual(overlap, [], 'the landing and blocking bands do not touch');
  assert.ok(Math.max(...right.landingStancesMeters) < Math.min(...right.blockingStancesMeters),
    'the guard only works further out than the attack can reach');
});

test('R19L.1 the two abilities run in opposite directions with distance', () => {
  // Attacks land near and the guard works far, in every direction. That opposition is the
  // structural finding; a single retuned constant does not change the shape of it.
  for (const direction of GUARD_EFFECTIVENESS_DIRECTIONS) {
    const bands = MEASURED_GUARD_EFFECTIVENESS[direction];
    assert.ok(bands.landingStancesMeters.length > 0, `${direction} must land somewhere`);
    assert.ok(bands.blockingStancesMeters.length > 0, `${direction} must block somewhere`);
    const nearestLanding = Math.min(...bands.landingStancesMeters);
    const nearestBlock = Math.min(...bands.blockingStancesMeters);
    assert.ok(nearestLanding <= nearestBlock,
      `${direction}: attacks should reach closer in than the guard can cover`);
  }
});

test('R19L.1 the bands are derived from the trials, not written beside them', () => {
  // Editing a trial must move the bands, or the record decays into a stale summary of itself.
  for (const direction of GUARD_EFFECTIVENESS_DIRECTIONS) {
    const bands = MEASURED_GUARD_EFFECTIVENESS[direction];
    const trials = MEASURED_GUARD_PAIRED_TRIALS.filter((t) => t.direction === direction);
    assert.equal(trials.length, 9, `${direction} was sampled at nine stances`);
    assert.deepEqual(
      [...bands.landingStancesMeters],
      trials.filter((t) => t.landsUnguarded).map((t) => t.stanceMeters).sort((a, b) => a - b),
    );
    assert.deepEqual(
      [...bands.guardMattersStancesMeters],
      trials.filter((t) => t.landsUnguarded && t.blocked).map((t) => t.stanceMeters).sort((a, b) => a - b),
    );
  }
  // TOP works only at the calibrated stance and one step beyond it; LEFT only at one stance.
  assert.deepEqual([...MEASURED_GUARD_EFFECTIVENESS.top.guardMattersStancesMeters], [2.4, 2.6]);
  assert.deepEqual([...MEASURED_GUARD_EFFECTIVENESS.left.guardMattersStancesMeters], [1.8]);
});

test('R19L.1 the assessment answers per sampled stance and refuses to invent one', () => {
  const working = assessGuardEffectiveness({ direction: 'top', stanceMeters: 2.4 });
  assert.equal(working.known, true);
  assert.equal(working.guardMatters, true);

  const theatre = assessGuardEffectiveness({ direction: 'right', stanceMeters: 2.4 });
  assert.equal(theatre.blocked, true);
  assert.equal(theatre.landsUnguarded, false);
  assert.equal(theatre.guardMatters, false, 'blocking a miss is not a defence');

  const unanswered = assessGuardEffectiveness({ direction: 'right', stanceMeters: 1.4 });
  assert.equal(unanswered.landsUnguarded, true);
  assert.equal(unanswered.blocked, false);
  assert.equal(unanswered.guardMatters, false);

  // A binary outcome has no meaningful midpoint, so an unsampled stance says so.
  const between = assessGuardEffectiveness({ direction: 'top', stanceMeters: 2.3 });
  assert.equal(between.known, false);
  assert.equal(between.reason, 'stance-not-sampled');
  assert.equal(between.guardMatters, null);
  assert.ok(between.bands, 'the bands are still offered for context');

  assert.equal(assessGuardEffectiveness({ direction: 'thrust' }).known, false);
});
