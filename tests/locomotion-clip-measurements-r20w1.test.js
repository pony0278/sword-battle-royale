import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCOMOTION_CLIP_MEASUREMENT_METHOD,
  LOCOMOTION_CLIP_MEASUREMENT_STAGE,
  MEASURED_LOCOMOTION_CLIPS,
  REPLACED_STRIDE_ASSUMPTION,
  WALK_TO_RUN_TRANSITION,
  clipPlaybackRate,
  locomotionClipMeasurement,
  strideMetersFor,
} from '../src/combat/locomotion-clip-measurements.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';
import { SPRINT_SPEED_MPS } from '../src/combat/sprint-locomotion.js';

test('R20W.1 every clip carries a stride its own authored speed accounts for', () => {
  assert.equal(LOCOMOTION_CLIP_MEASUREMENT_STAGE, 'R20W.1');
  for (const [clipId, clip] of Object.entries(MEASURED_LOCOMOTION_CLIPS)) {
    // stride = authored speed x cycle length. If a hand edit ever breaks that, the phase this
    // module drives stops meaning distance and every foot in the lab starts sliding again.
    const implied = clip.authoredSpeedMps * clip.durationSeconds;
    assert.ok(Math.abs(implied - clip.strideMeters) < 0.01,
      `${clipId}: ${implied.toFixed(3)}m implied vs ${clip.strideMeters}m recorded`);
    assert.equal(Math.sign(clip.strideMeters), Math.sign(clip.authoredSpeedMps), `${clipId} sign`);
    assert.ok(clip.footFitSpreadMps < 0.15, `${clipId}: the two feet must agree about the speed`);
  }
  assert.match(LOCOMOTION_CLIP_MEASUREMENT_METHOD.method, /foot-contact/);
});

test('R20W.1 a run is airborne and a walk is not, which is what makes them different clips', () => {
  for (const id of ['Walking_A', 'Walking_B', 'Walking_C', 'Walking_Backwards']) {
    assert.ok(MEASURED_LOCOMOTION_CLIPS[id].airborneFraction < 0.3, `${id} keeps a foot down`);
  }
  for (const id of ['Running_A', 'Running_B']) {
    assert.ok(MEASURED_LOCOMOTION_CLIPS[id].airborneFraction > 0.5, `${id} spends its cycle in the air`);
  }
});

test('R20W.1 the assumption it replaced is kept as the size of the error', () => {
  assert.ok(REPLACED_STRIDE_ASSUMPTION.assumedCycleMeters < REPLACED_STRIDE_ASSUMPTION.measuredCycleMetersWalkingA);
  const shortfall = 1 - REPLACED_STRIDE_ASSUMPTION.assumedCycleMeters / REPLACED_STRIDE_ASSUMPTION.measuredCycleMetersWalkingA;
  assert.ok(shortfall > 0.1 && shortfall < 0.15, `the shipped walk slid ${(shortfall * 100).toFixed(0)}%`);
  // And the walk we should have been playing is nowhere near 0.8 of a leg per step.
  assert.ok(REPLACED_STRIDE_ASSUMPTION.measuredStepPerLegLengthWalkingB > 1.4);
});

test('R20W.1 sprint sits above the walk-to-run transition and below the clip crossover', () => {
  // Both numbers are derived, not chosen. The first is where this body stops walking (Froude 0.5
  // on its own leg); the second is where the run clip becomes less stretched than the walk clip.
  assert.ok(Math.abs(WALK_TO_RUN_TRANSITION.biomechanicalTransitionMps - 1.359) < 0.01);
  assert.ok(Math.abs(WALK_TO_RUN_TRANSITION.leastStretchCrossoverMps - 1.855) < 0.01);
  assert.ok(SPRINT_SPEED_MPS > WALK_TO_RUN_TRANSITION.biomechanicalTransitionMps,
    'at sprint speed this body is running');
  assert.ok(SPRINT_SPEED_MPS < WALK_TO_RUN_TRANSITION.leastStretchCrossoverMps,
    'and the run clip is still the worse of the two to play');
  assert.equal(WALK_TO_RUN_TRANSITION.sprintSpeedMps, SPRINT_SPEED_MPS);
});

test('R20W.1 what each speed costs the clip that plays it', () => {
  const walk = clipPlaybackRate('Walking_B', LANE_LOCOMOTION_PROFILE.forwardSpeedMps);
  const sprintOnWalk = clipPlaybackRate('Walking_B', SPRINT_SPEED_MPS);
  const sprintOnRun = clipPlaybackRate('Running_A', SPRINT_SPEED_MPS);
  assert.ok(Math.abs(walk - 1) < 0.06, `walking runs at ${walk.toFixed(2)}x`);
  assert.ok(sprintOnWalk > 1.4 && sprintOnWalk < 1.45, `sprint on the walk clip runs at ${sprintOnWalk.toFixed(2)}x`);
  assert.ok(sprintOnRun < 0.5, `sprint on the run clip would run at ${sprintOnRun.toFixed(2)}x`);
  // The choice, stated as the comparison that made it: the walk is stretched less than the run.
  assert.ok(Math.abs(sprintOnWalk - 1) < Math.abs(sprintOnRun - 1));
});

test('R20W.1 the sidestep has no clip at any speed, and the numbers say why', () => {
  // KayKit ships a running strafe and no walking one. At the 0.75 m/s this lab actually sidesteps
  // at, it would play at a quarter rate - which is why the legs stay planted instead.
  const strafe = clipPlaybackRate('Running_Strafe_Left', LANE_LOCOMOTION_PROFILE.lateralSpeedMps);
  assert.ok(strafe < 0.3, `a walking sidestep on the running strafe would run at ${strafe.toFixed(2)}x`);
  assert.equal(MEASURED_LOCOMOTION_CLIPS.Running_Strafe_Left.axis, 'lateral');
});

test('R20W.1 an unmeasured clip has no stride and no rate', () => {
  assert.equal(locomotionClipMeasurement('Not_A_Clip'), null);
  assert.equal(strideMetersFor('Not_A_Clip'), null);
  assert.equal(clipPlaybackRate('Not_A_Clip', 1), null);
  assert.equal(clipPlaybackRate('Walking_B', Number.NaN), null);
  assert.equal(strideMetersFor('Walking_Backwards'), -0.665);
});
