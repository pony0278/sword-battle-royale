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

test('R22G.1 ON by default now, and ?wholebody=0 restores the old gait exactly', () => {
  // R22E.1 built this as an experiment switch, default off, and said "nothing ships with this on".
  // The experiment came back and it ships. The switch reversed rather than disappeared, so the
  // gait R21U.1 argued for is still one parameter away and still tested.
  const cycle = createLaneWalkCycle();
  const sprinting = cycle.advance({ travelledMeters: SPRINT_SPEED_MPS * 0.1, deltaSeconds: 0.1 });
  assert.equal(sprinting.clipId, LANE_WALK_CLIPS.run);
  assert.equal(sprinting.wholeBodyOnly, true);
  assert.equal(readLabExperimentParameters(new URLSearchParams('')).wholeBodyRun, true);

  const off = createLaneWalkCycle({ wholeBodyRun: false });
  const walking = off.advance({ travelledMeters: SPRINT_SPEED_MPS * 0.1, deltaSeconds: 0.1 });
  assert.equal(walking.clipId, LANE_WALK_CLIPS.forward);
  assert.equal(walking.wholeBodyOnly, false);

  // Only the exact string turns it OFF, which is the same discipline the other way round: a
  // mistyped parameter must not silently give somebody a different build than they think.
  assert.equal(readLabExperimentParameters(new URLSearchParams('wholebody=0')).wholeBodyRun, false);
  for (const q of ['wholebody=1', 'wholebody', 'wholebody=false', 'wholebody=no']) {
    assert.equal(readLabExperimentParameters(new URLSearchParams(q)).wholeBodyRun, true, q);
  }
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

test('R22E.1 what distance-driving the run costs, which is why the clock drives it instead', () => {
  // The answer to "why not just wear it", as the number the eye saw. Distance-driven, the stride
  // forces the cadence and no code choice can move it - only the ground speed can, and not enough.
  const cycle = createLaneWalkCycle({ wholeBodyRun: true, runPlaybackAuthored: false });
  const sprinting = cycle.advance({ travelledMeters: SPRINT_SPEED_MPS * 0.1, deltaSeconds: 0.1 });
  assert.ok(sprinting.playbackRate < 0.5, `the run would play at ${sprinting.playbackRate.toFixed(2)}x`);
  assert.ok(cadenceAt(LANE_WALK_CLIPS.run, SPRINT_SPEED_MPS) < 1.1, 'barely one step per second');
  // The walk, at the same speed, is well past a running cadence - which is why R21U.1 kept it, and
  // also why keeping it meant a 2.85x stretch once the speed moved.
  assert.ok(cadenceAt(LANE_WALK_CLIPS.forward, SPRINT_SPEED_MPS) > 4);
  // No speed the dial reaches redeems the run under distance-driving. Hence R22F.1.
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

test('R22F.1 walking never takes it, at any speed and in any configuration', () => {
  // The slide is the run's alone. A walk stays distance-driven, so the foot a walking fighter
  // plants stays planted - which every coverage band in this project was measured on.
  for (const opts of [{}, { wholeBodyRun: false }, { wholeBodyRun: true, runPlaybackAuthored: false }]) {
    const cycle = createLaneWalkCycle(opts);
    const walking = cycle.advance({ travelledMeters: LANE_LOCOMOTION_PROFILE.forwardSpeedMps * 0.1, deltaSeconds: 0.1 });
    assert.equal(walking.clipId, LANE_WALK_CLIPS.forward, JSON.stringify(opts));
    assert.equal(walking.footSlideMetersPerSecond, 0, 'a walk is distance-driven at every speed');
    assert.ok(Math.abs(walking.playbackRate - 1) < 0.06, 'and plays about as drawn, since it is at its own speed');
  }

  // R22G.1: the shipped sprint DOES slide, deliberately, and that is asserted rather than left to
  // be discovered - it is the trade the whole stage is.
  const shipped = createLaneWalkCycle();
  const sprinting = shipped.advance({ travelledMeters: SPRINT_SPEED_MPS * 0.1, deltaSeconds: 0.1 });
  assert.ok(sprinting.footSlideMetersPerSecond > 1, `the shipped sprint slides ${sprinting.footSlideMetersPerSecond}`);
  // Turning either switch off takes the slide back to zero.
  for (const opts of [{ wholeBodyRun: false }, { runPlaybackAuthored: false }]) {
    const locked = createLaneWalkCycle(opts);
    assert.equal(locked.advance({ travelledMeters: SPRINT_SPEED_MPS * 0.1, deltaSeconds: 0.1 }).footSlideMetersPerSecond, 0);
  }
});

test('R22G.1 either switch alone locks the feet again, and both directions are exact', () => {
  // Shipped: both on.
  assert.equal(readLabExperimentParameters(new URLSearchParams('')).runPlaybackAuthored, true);
  // ?footslide=0 locks the feet but keeps the run on the legs - the R22E.1 configuration.
  assert.equal(readLabExperimentParameters(new URLSearchParams('footslide=0')).runPlaybackAuthored, false);
  assert.equal(readLabExperimentParameters(new URLSearchParams('footslide=0')).wholeBodyRun, true);
  // ?wholebody=0 takes the run off the legs entirely, so the playback question is moot and false.
  assert.equal(readLabExperimentParameters(new URLSearchParams('wholebody=0')).runPlaybackAuthored, false);
  // Anything that is not exactly '0' leaves the build alone, so a typo cannot hand somebody a
  // different gait than the one they think they are looking at.
  for (const q of ['footslide=1', 'footslide', 'footslide=false', 'footslide=no']) {
    assert.equal(readLabExperimentParameters(new URLSearchParams(q)).runPlaybackAuthored, true, q);
  }
});
