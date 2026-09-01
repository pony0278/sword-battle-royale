import test from 'node:test';
import assert from 'node:assert/strict';

import { LANE_WALK_CLIPS, createLaneWalkCycle } from '../src/combat/lane-walk-cycle.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';
import { SPRINT_SPEED_MPS } from '../src/combat/sprint-locomotion.js';
import { MEASURED_LOCOMOTION_CLIPS } from '../src/combat/locomotion-clip-measurements.js';
import { readLabExperimentParameters } from '../tools/action-studio/shield-parry-r281/lab-experiment-parameters.js';

// R22E.1 - "why can't the run just be worn whole?"
//
// Asked three times, and answered three times with arithmetic in a comment, which is not the same
// as being able to look at it. So the old R20W.2 behaviour goes back behind ?wholebody=1: the legs
// take the run above the measured transition, distance-driven exactly as before, and the cadence
// that buys is put on the HUD next to it.
//
// Nothing ships with it on. These hold both halves of that.

const cadenceAt = (clipId, speed) => (speed / Math.abs(MEASURED_LOCOMOTION_CLIPS[clipId].strideMeters)) * 2;

test('R22E.1 off by default, and off is exactly what shipped', () => {
  const cycle = createLaneWalkCycle();
  const sprinting = cycle.advance({ travelledMeters: SPRINT_SPEED_MPS * 0.1, deltaSeconds: 0.1 });
  assert.equal(sprinting.clipId, LANE_WALK_CLIPS.forward);
  assert.equal(sprinting.wholeBodyOnly, false);
  assert.equal(readLabExperimentParameters(new URLSearchParams('')).wholeBodyRun, false);
  // Only the exact string turns it on - a stray ?wholebody=0 or ?wholebody must not.
  for (const q of ['wholebody=0', 'wholebody', 'wholebody=true', 'wholebody=yes']) {
    assert.equal(readLabExperimentParameters(new URLSearchParams(q)).wholeBodyRun, false, q);
  }
  assert.equal(readLabExperimentParameters(new URLSearchParams('wholebody=1')).wholeBodyRun, true);
});

test('R22E.1 on, the legs take the run above the measured transition and nowhere below it', () => {
  const cycle = createLaneWalkCycle({ wholeBodyRun: true });
  const sprinting = cycle.advance({ travelledMeters: SPRINT_SPEED_MPS * 0.1, deltaSeconds: 0.1 });
  assert.equal(sprinting.clipId, LANE_WALK_CLIPS.run);
  assert.equal(sprinting.cycleMeters, MEASURED_LOCOMOTION_CLIPS[LANE_WALK_CLIPS.run].strideMeters);
  // A whole-body clip cannot be lent to a guarding fighter's legs, and the gait says so itself.
  assert.equal(sprinting.wholeBodyOnly, true);

  // Walking is untouched: the switch is about the far side of the transition, not about the walk.
  const walking = cycle.advance({ travelledMeters: LANE_LOCOMOTION_PROFILE.forwardSpeedMps * 0.1, deltaSeconds: 0.1 });
  assert.equal(walking.clipId, LANE_WALK_CLIPS.forward);
  assert.equal(walking.wholeBodyOnly, false);

  // And backing away has no run at any speed - KayKit ships none.
  assert.equal(cycle.advance({ travelledMeters: -3 * 0.1, deltaSeconds: 0.1 }).clipId, LANE_WALK_CLIPS.backward);
});

test('R22E.1 what the switch actually shows: the cadence it is turned on to look at', () => {
  // The answer to "why not", as the number the eye will see. Distance-driven, so this is forced by
  // the stride and no code choice can move it - only the ground speed can.
  const cycle = createLaneWalkCycle({ wholeBodyRun: true });
  const sprinting = cycle.advance({ travelledMeters: SPRINT_SPEED_MPS * 0.1, deltaSeconds: 0.1 });
  assert.ok(sprinting.playbackRate < 0.25, `the run plays at ${sprinting.playbackRate.toFixed(2)}x at the sprint`);
  assert.ok(cadenceAt(LANE_WALK_CLIPS.run, SPRINT_SPEED_MPS) < 1, 'under one step per second');
  // The walk, at the same speed, is a running cadence. That is the whole reason R21U.1 kept it.
  assert.ok(cadenceAt(LANE_WALK_CLIPS.forward, SPRINT_SPEED_MPS) > 2.5);
  // And there is no speed inside the sprint dial that redeems it.
  assert.ok(cadenceAt(LANE_WALK_CLIPS.run, 3) < 1.1, 'not even at the dial ceiling');
});
