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

// R22F.1 - the other way to wear a run, and the price on the label.
//
// Everything in this module is distance-driven and R19C.1's header says why: a foot that finishes
// its stride on a clock rather than on the ground skates whenever speed and clip disagree. That is
// the right default. It is NOT a law - it is a choice this project made, and it costs a clip drawn
// for 7.2 m/s being played at a fifth speed. ?footslide=1 takes the other side of the trade: the
// pose, cadence and skeletal motion are exactly the clip's, and the feet slide by the difference.

test('R22F.1 the authored rate is exactly the clip, and the slide is the difference', () => {
  const cycle = createLaneWalkCycle({ wholeBodyRun: true, runPlaybackAuthored: true });
  let report;
  for (let i = 0; i < 10; i += 1) report = cycle.advance({ travelledMeters: SPRINT_SPEED_MPS / 60, deltaSeconds: 1 / 60 });
  assert.equal(report.clipId, LANE_WALK_CLIPS.run);
  assert.equal(report.playbackRate, 1, 'the clip runs as drawn - that is the whole point');
  const authored = Math.abs(MEASURED_LOCOMOTION_CLIPS[LANE_WALK_CLIPS.run].authoredSpeedMps);
  assert.ok(Math.abs(report.footSlideMetersPerSecond - (authored - SPRINT_SPEED_MPS)) < 1e-6,
    `the planted foot travels at the clip's speed and the body at the game's: ${report.footSlideMetersPerSecond}`);

  // Time-driven means the phase no longer answers to the ground: standing still would still
  // advance it, which is exactly what "the feet are not locked" means.
  const before = cycle.phase;
  cycle.advance({ travelledMeters: SPRINT_SPEED_MPS / 60, deltaSeconds: 1 / 60 });
  assert.ok(cycle.phase !== before);
});

test('R22F.1 walking never takes it, and neither does the shipped build', () => {
  const cycle = createLaneWalkCycle({ wholeBodyRun: true, runPlaybackAuthored: true });
  const walking = cycle.advance({ travelledMeters: LANE_LOCOMOTION_PROFILE.forwardSpeedMps * 0.1, deltaSeconds: 0.1 });
  assert.equal(walking.clipId, LANE_WALK_CLIPS.forward);
  assert.equal(walking.footSlideMetersPerSecond, 0, 'a walk is distance-driven at every speed');
  assert.ok(Math.abs(walking.playbackRate - 1.42) > 0.3, 'and keeps its own stretch, not a forced 1.0');

  // Every shipping configuration slides zero, and that is asserted rather than assumed.
  for (const opts of [{}, { wholeBodyRun: true }]) {
    const shipped = createLaneWalkCycle(opts);
    const sprinting = shipped.advance({ travelledMeters: SPRINT_SPEED_MPS * 0.1, deltaSeconds: 0.1 });
    assert.equal(sprinting.footSlideMetersPerSecond, 0);
  }
});

test('R22F.1 it needs BOTH switches, so a stray one cannot quietly unlock the feet', () => {
  // ?footslide= alone means nothing: without ?wholebody=1 the legs are not wearing the run at all.
  assert.equal(readLabExperimentParameters(new URLSearchParams('footslide=1')).runPlaybackAuthored, false);
  assert.equal(readLabExperimentParameters(new URLSearchParams('wholebody=1')).runPlaybackAuthored, false);
  assert.equal(readLabExperimentParameters(new URLSearchParams('wholebody=1&footslide=1')).runPlaybackAuthored, true);
  for (const q of ['wholebody=1&footslide=0', 'wholebody=1&footslide', 'wholebody=1&footslide=true']) {
    assert.equal(readLabExperimentParameters(new URLSearchParams(q)).runPlaybackAuthored, false, q);
  }
});
