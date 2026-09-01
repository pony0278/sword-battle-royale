import test from 'node:test';
import assert from 'node:assert/strict';
import { MEASURED_LOCOMOTION_CLIPS } from '../src/combat/locomotion-clip-measurements.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';
import { SPRINT_SPEED_MPS, SPRINT_SPEED_OVERRIDE_RANGE_MPS } from '../src/combat/sprint-locomotion.js';

// R22B.1 - what the pack can and cannot give, as arithmetic.
//
// Asked from play: can the whole Running_B clip be used directly, the way the action studio shows
// it? The action studio plays IN PLACE at speed 1 - the character never travels - so nothing can
// slide there. In the game the body crosses real ground, and the gait is distance-driven, so a
// clip's cadence at a given speed is fixed by its stride. That makes this a speed question, not an
// animation one, and these are the numbers that decide it.

const cadence = (clipId, groundSpeedMps) => (groundSpeedMps / Math.abs(MEASURED_LOCOMOTION_CLIPS[clipId].strideMeters)) * 2;
const A_WALKING_PERSON = 2.0; // steps per second

test('R22B.1 the pack holds no jog: every forward run is drawn for 3 m/s or more', () => {
  // If a clip authored for 1.5-2 m/s existed, it would end this whole line of questions. The
  // inventory probe lists what is there: Running_A, Running_B, two weapon-holding runs and two
  // strafes. No jog.
  for (const clipId of ['Running_A', 'Running_B']) {
    assert.ok(Math.abs(MEASURED_LOCOMOTION_CLIPS[clipId].authoredSpeedMps) > 3,
      `${clipId} is drawn for ${MEASURED_LOCOMOTION_CLIPS[clipId].authoredSpeedMps} m/s`);
  }
  assert.ok(Math.abs(MEASURED_LOCOMOTION_CLIPS.Walking_B.authoredSpeedMps) < 1.1, 'and the walk is a walk');
});

test('R22B.1 at the shipped sprint speed a whole run clip is slower than walking', () => {
  // This is the slow motion, and it is arithmetic rather than taste: the stride sets the cadence.
  assert.ok(cadence('Running_A', SPRINT_SPEED_MPS) < A_WALKING_PERSON,
    `Running_A manages ${cadence('Running_A', SPRINT_SPEED_MPS).toFixed(2)} steps/s at the sprint`);
  assert.ok(cadence('Running_B', SPRINT_SPEED_MPS) < cadence('Running_A', SPRINT_SPEED_MPS),
    'and the longer stride is worse, not better');
  // Which is why the legs keep the walk: at the same speed it is a running cadence.
  assert.ok(cadence('Walking_B', SPRINT_SPEED_MPS) > A_WALKING_PERSON * 1.3);
});

test('R22B.1 Running_A becomes honest inside the dial; Running_B does not', () => {
  // The one combination in this pack that is both a real run animation and slide-free.
  const top = SPRINT_SPEED_OVERRIDE_RANGE_MPS.maximum;
  assert.ok(cadence('Running_A', top) > A_WALKING_PERSON,
    `Running_A at the dial's ceiling gives ${cadence('Running_A', top).toFixed(2)} steps/s`);
  assert.ok(cadence('Running_B', top) < A_WALKING_PERSON,
    'Running_B needs a speed no dial here reaches');
  // Its authored speed is 4.8x the sprint's even on the disputed low fit.
  const low = MEASURED_LOCOMOTION_CLIPS.Running_B.disputedSecondFitMps;
  assert.ok(low / SPRINT_SPEED_MPS > 3);
});

test('R22B.1 Running_B authored speed is the one disputed number, and says so', () => {
  // Two independent fits disagree by 52%. Recorded rather than silently resolved, because nothing
  // reads it - the arms are driven by the WALK's phase, not by this stride.
  const b = MEASURED_LOCOMOTION_CLIPS.Running_B;
  assert.equal(b.disputedSecondFitMps, 4.73);
  assert.ok(b.authoredSpeedMps / b.disputedSecondFitMps > 1.4, 'the gap is the point');
  // Running_A has no such dispute, which is what says the method is sound.
  assert.equal(MEASURED_LOCOMOTION_CLIPS.Running_A.disputedSecondFitMps, undefined);
  assert.ok(b.footFitSpreadMps > MEASURED_LOCOMOTION_CLIPS.Running_A.footFitSpreadMps * 100,
    'and its own feet already disagreed far more than any other clip here');
});

test('R22B.1 walking is untouched by any of this', () => {
  assert.ok(Math.abs(cadence('Walking_B', LANE_LOCOMOTION_PROFILE.forwardSpeedMps) - 1.78) < 0.1);
});
