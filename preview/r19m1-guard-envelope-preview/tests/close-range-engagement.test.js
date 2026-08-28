import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLOSE_RANGE_ENGAGEMENT_STAGE,
  CLOSE_RANGE_FINDINGS,
  MEASURED_CLOSE_RANGE_MISS_GAPS_METERS,
  MEASURED_BODY_STRIKE_BLADE_FRACTION,
  MEASURED_GUARD_WORKING_FLOOR_METERS,
  MEASURED_SHIELD_CATCH_BLADE_FRACTION,
  UNDEFENDED_CLOSE_RANGE_BAND_METERS,
  assessCloseRangeEngagement,
} from '../src/combat/close-range-engagement.js';
import { MINIMUM_ENGAGEMENT_SEPARATION_METERS } from '../src/combat/lane-locomotion.js';
import { MEASURED_FULL_COVERAGE_BAND_METERS } from '../src/combat/engagement-spacing.js';

const DIRECTIONS = ['top', 'right', 'left'];

test('R19J.2 at the pushbox the sword strikes with its base, which is the whole finding', () => {
  assert.equal(CLOSE_RANGE_ENGAGEMENT_STAGE, 'R19J.2');
  // TOP and RIGHT both reach the body at the floor, and both land on fraction 0 - the blade base
  // at the guard. That is the degenerate strike a hilt rule exists to answer.
  for (const direction of ['top', 'right']) {
    const closest = MEASURED_BODY_STRIKE_BLADE_FRACTION[direction][0];
    assert.equal(closest.contactSeparationMeters, MINIMUM_ENGAGEMENT_SEPARATION_METERS,
      `${direction} must be sampled at the floor, since that is the case in question`);
    assert.equal(closest.bladeFraction, 0, `${direction} strikes with the blade base at the floor`);
  }
  // And a proper cutting fraction only appears well out from there.
  const topFar = MEASURED_BODY_STRIKE_BLADE_FRACTION.top.at(-1);
  assert.ok(topFar.bladeFraction > 0.5 && topFar.contactSeparationMeters > 1.5,
    'the blade only bites properly around 1.5m of contact separation');
});

test('R19J.2 LEFT has no close-range strike at all - it passes the standing body by centimetres', () => {
  // A different problem from a weak hit, and it would be solved differently, so it is kept apart
  // from the fraction curve rather than folded into it as a zero.
  const gaps = MEASURED_CLOSE_RANGE_MISS_GAPS_METERS.left;
  assert.ok(gaps.length >= 4);
  assert.ok(Math.max(...gaps) < 0.05, 'every miss is within five centimetres - it is a near thing');
  assert.ok(MEASURED_BODY_STRIKE_BLADE_FRACTION.left[0].contactSeparationMeters
    > MINIMUM_ENGAGEMENT_SEPARATION_METERS,
    'LEFT has no sample at the floor because it never lands there');
});

test('R19J.2 the strike slides toward the tip as the fighters separate, in every direction', () => {
  // Monotonic is the sanity check on the whole sweep: a non-monotonic curve would mean the
  // measurement caught different moments of the swing rather than one comparable event.
  for (const direction of DIRECTIONS) {
    const samples = MEASURED_BODY_STRIKE_BLADE_FRACTION[direction];
    for (let index = 1; index < samples.length; index += 1) {
      assert.ok(samples[index].contactSeparationMeters > samples[index - 1].contactSeparationMeters,
        `${direction} samples must be ordered by separation`);
      assert.ok(samples[index].bladeFraction >= samples[index - 1].bladeFraction,
        `${direction} fraction fell from ${samples[index - 1].bladeFraction} to ${samples[index].bladeFraction}`);
    }
  }
});

test('R19J.2 the shield catch slides the same way, to the blade base, as the attacker closes', () => {
  for (const direction of DIRECTIONS) {
    const samples = MEASURED_SHIELD_CATCH_BLADE_FRACTION[direction];
    assert.ok(samples.length >= 3, `${direction} needs enough samples to show the trend`);
    for (let index = 1; index < samples.length; index += 1) {
      assert.ok(samples[index].bladeFraction >= samples[index - 1].bladeFraction);
    }
    // The nearest sample in every direction is the blade base: the attacker is already inside.
    assert.equal(samples[0].bladeFraction, 0, `${direction} catches at the base when closest`);
  }
});

test('R19J.2 the gap is between the pushbox and the guard, and it is computed from both ends', () => {
  // Not two transcribed numbers: moving either end must move the band, because the band is the
  // finding and a stale copy of it would be worse than not recording it.
  assert.equal(UNDEFENDED_CLOSE_RANGE_BAND_METERS.minimum, MINIMUM_ENGAGEMENT_SEPARATION_METERS);
  assert.equal(UNDEFENDED_CLOSE_RANGE_BAND_METERS.maximum, MEASURED_GUARD_WORKING_FLOOR_METERS);
  assert.ok(Math.abs(UNDEFENDED_CLOSE_RANGE_BAND_METERS.widthMeters - 0.65) < 1e-9);
  assert.ok(UNDEFENDED_CLOSE_RANGE_BAND_METERS.widthMeters > 0,
    'a non-positive width would mean the defence covers everything the attack reaches');
  // And the guard's floor agrees with the coverage band measured from the other direction.
  assert.equal(MEASURED_GUARD_WORKING_FLOOR_METERS, MEASURED_FULL_COVERAGE_BAND_METERS.minimum);
});

test('R19J.2 the findings carry their verdict, their evidence, and the reversal', () => {
  for (const key of ['hiltStrikeRule', 'raisedPushboxFloor']) {
    const entry = CLOSE_RANGE_FINDINGS[key];
    assert.ok(entry.proposal && entry.verdict && entry.evidence, `${key} needs all three`);
  }
  assert.equal(CLOSE_RANGE_FINDINGS.hiltStrikeRule.verdict, 'supported');
  assert.equal(CLOSE_RANGE_FINDINGS.raisedPushboxFloor.verdict, 'still rejected');
  // The reversal stays visible: R19J.1 published the opposite from near-miss data, and hiding
  // that would invite the same read of latestBodyHit again.
  assert.match(CLOSE_RANGE_FINDINGS.hiltStrikeRule.supersedes, /R19J\.1/);
});

test('R19J.2 the assessment reads the measured curves and claims no authority', () => {
  const atFloor = assessCloseRangeEngagement({ direction: 'top', separationMeters: 0.9 });
  assert.equal(atFloor.known, true);
  assert.equal(atFloor.expectedBodyStrikeBladeFraction, 0, 'the blade base, at the floor');
  assert.equal(atFloor.insideGuardWorkingRange, false);
  assert.equal(atFloor.insideUndefendedBand, true);
  assert.match(atFloor.authority, /no-contact-authority/);

  // Between samples it interpolates rather than snapping to one of them.
  const between = assessCloseRangeEngagement({ direction: 'top', separationMeters: 1.34 });
  assert.ok(between.expectedBodyStrikeBladeFraction > 0.20);
  assert.ok(between.expectedBodyStrikeBladeFraction < 0.59);

  // Past the sampled range it holds the nearest observation instead of extrapolating.
  const far = assessCloseRangeEngagement({ direction: 'top', separationMeters: 9 });
  assert.equal(far.expectedBodyStrikeBladeFraction, 0.59);
  assert.equal(far.insideGuardWorkingRange, true);
  assert.equal(far.insideUndefendedBand, false);

  assert.equal(assessCloseRangeEngagement({ direction: 'thrust' }).known, false);
});
