import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GUARD_FRONTAL_CONE_STAGE,
  MEASURED_GUARD_CONE_TRIALS,
  MEASURED_GUARD_RELIABLE_CONE_DEGREES,
  MEASURED_UNIVERSAL_GUARD_CONE_DEGREES,
  assessGuardFrontalCone,
} from '../src/combat/guard-frontal-cone.js';

test('R19X.1 the cone is asymmetric because the shield is on one arm', () => {
  assert.equal(GUARD_FRONTAL_CONE_STAGE, 'R19X.1');
  for (const direction of ['top', 'right', 'left']) {
    const band = MEASURED_GUARD_RELIABLE_CONE_DEGREES[direction];
    // Toward the shield side every direction tolerates at least a quarter turn; away from it,
    // nobody gets past -90. The asymmetry is the finding, so it is the invariant.
    assert.ok(band.toDegrees >= 90, `${direction} toward-side is generous`);
    assert.ok(band.fromDegrees >= -90, `${direction} away-side is bounded`);
    assert.ok(band.toDegrees > Math.abs(band.fromDegrees),
      `${direction}: rotating toward the shield is always safer than away`);
  }
});

test('R19X.1 each direction dies at its own away-side angle, LEFT first and RIGHT last', () => {
  // LEFT holds full rate to -20 and flickers from -22 (R20C.1 re-measure of the gap R19X never
  // sampled) while TOP is still 6/6 at -45; RIGHT is clean through -90 and dead by -110.
  assert.deepEqual(MEASURED_GUARD_CONE_TRIALS.left['-20'], [4, 4]);
  assert.ok(MEASURED_GUARD_CONE_TRIALS.left['-22'][0] < MEASURED_GUARD_CONE_TRIALS.left['-22'][1]);
  assert.equal(MEASURED_GUARD_CONE_TRIALS.top['-45'][0], 6);
  assert.deepEqual(MEASURED_GUARD_CONE_TRIALS.right['-90'], [2, 2]);
  assert.equal(MEASURED_GUARD_CONE_TRIALS.right['-110'][0], 0);
  assert.ok(MEASURED_GUARD_RELIABLE_CONE_DEGREES.left.fromDegrees
    > MEASURED_GUARD_RELIABLE_CONE_DEGREES.top.fromDegrees);
  assert.ok(MEASURED_GUARD_RELIABLE_CONE_DEGREES.top.fromDegrees
    > MEASURED_GUARD_RELIABLE_CONE_DEGREES.right.fromDegrees);
});

test('R19X.1 the universal cone is the intersection and names its limiters', () => {
  const u = MEASURED_UNIVERSAL_GUARD_CONE_DEGREES;
  for (const direction of ['top', 'right', 'left']) {
    const band = MEASURED_GUARD_RELIABLE_CONE_DEGREES[direction];
    assert.ok(band.fromDegrees <= u.fromDegrees && band.toDegrees >= u.toDegrees,
      `${direction} contains the universal cone`);
  }
  assert.equal(u.fromDegrees, MEASURED_GUARD_RELIABLE_CONE_DEGREES[u.limitedBy.from].fromDegrees);
  assert.equal(u.toDegrees, MEASURED_GUARD_RELIABLE_CONE_DEGREES[u.limitedBy.to].toDegrees);
});

test('R19X.1 past the collapse the numbers flicker, and the record refuses to smooth them', () => {
  // TOP blocked 2/4 at -110 and 3/4 at 180 - a rotated shield re-entering the chop's plane by
  // accident. These stay in the table as rates so nobody mistakes the far side for a gradient,
  // and the assessment declines to interpolate across them.
  assert.equal(MEASURED_GUARD_CONE_TRIALS.top['-110'][0], 2);
  assert.equal(MEASURED_GUARD_CONE_TRIALS.top['180'][0], 3);
  assert.equal(MEASURED_GUARD_CONE_TRIALS.top['-100'][0], 0, 'while -100 right beside them is dead');

  const between = assessGuardFrontalCone({ direction: 'top', facingErrorDegrees: -55 });
  assert.equal(between.known, false);
  assert.equal(between.reason, 'angle-not-sampled');
  assert.equal(between.insideReliableCone, false, 'the band still answers');

  const sampled = assessGuardFrontalCone({ direction: 'right', facingErrorDegrees: -90 });
  assert.equal(sampled.known, true);
  assert.deepEqual(sampled.blockedOfTried, [2, 2]);
  assert.equal(sampled.insideReliableCone, true);

  assert.equal(assessGuardFrontalCone({ direction: 'thrust' }).known, false);
});
