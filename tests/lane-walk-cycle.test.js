import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KAYKIT_LEG_CHAIN_METERS,
  LANE_WALK_CLIPS,
  LANE_WALK_CYCLE_PROFILE,
  LANE_WALK_CYCLE_STAGE,
  createLaneWalkCycle,
  walkClipTimeSeconds,
  wrapCyclePhase,
} from '../src/combat/lane-walk-cycle.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';
import { MEASURED_LOCOMOTION_CLIPS } from '../src/combat/locomotion-clip-measurements.js';
import { SPRINT_SPEED_MPS } from '../src/combat/sprint-locomotion.js';

test('R20W.1 takes its stride from the clip rather than from the skeleton', () => {
  assert.equal(LANE_WALK_CYCLE_STAGE, 'R20W.1');
  // R19C.1 derived the stride from the leg - 0.8 of a leg length per step - because the clips carry
  // no root translation. The leg is still what it was; the stride is not what it implied.
  assert.ok(Math.abs(KAYKIT_LEG_CHAIN_METERS - 0.3765) < 1e-9);
  assert.equal(LANE_WALK_CYCLE_PROFILE.forwardCycleMeters, MEASURED_LOCOMOTION_CLIPS[LANE_WALK_CLIPS.forward].strideMeters);
  assert.equal(LANE_WALK_CYCLE_PROFILE.backwardCycleMeters, MEASURED_LOCOMOTION_CLIPS[LANE_WALK_CLIPS.backward].strideMeters);
  assert.ok(LANE_WALK_CYCLE_PROFILE.forwardCycleMeters > KAYKIT_LEG_CHAIN_METERS * 0.8 * 2,
    'the assumed 0.6016m cycle was shorter than any walk in the pack');
});

test('R20W.1 the walk clip is the one authored for the speed we walk at', () => {
  // The clip that shipped, Walking_A, is authored for 0.643 m/s while both fighters walk at 1.0.
  // Walking_B was in the same pack all along at 1.053, which is the same walk to within 5%.
  const chosen = MEASURED_LOCOMOTION_CLIPS[LANE_WALK_CLIPS.forward];
  const rejected = MEASURED_LOCOMOTION_CLIPS.Walking_A;
  const stretch = (clip) => LANE_LOCOMOTION_PROFILE.forwardSpeedMps / Math.abs(clip.authoredSpeedMps);
  assert.ok(Math.abs(stretch(chosen) - 1) < 0.06, `chosen clip runs at ${stretch(chosen).toFixed(2)}x`);
  assert.ok(stretch(rejected) > 1.5, `the old clip ran at ${stretch(rejected).toFixed(2)}x`);
});

test('R19C.1 a foot on the ground stays there: phase tracks distance, not time', () => {
  // The whole reason this module exists. The same distance must give the same phase however long
  // it took to cover it, or the feet skate whenever speed changes. R20W.2 narrowed the claim to
  // what it can actually mean: within one clip. A walk and a run have different strides by
  // definition, so the invariant is per clip, and the next test covers what crossing between them
  // does instead.
  const slow = createLaneWalkCycle();
  const fast = createLaneWalkCycle();
  for (let i = 0; i < 10; i += 1) slow.advance({ travelledMeters: 0.02, deltaSeconds: 1 / 30 });
  fast.advance({ travelledMeters: 0.2, deltaSeconds: 10 / 30 });
  assert.equal(slow.report.clipId, fast.report.clipId, 'both are walking');
  assert.ok(Math.abs(slow.phase - fast.phase) < 1e-9, 'same ground covered, same point in the stride');
});

test('R20W.2 the run takes over where this body stops walking, not where a key is pressed', () => {
  const cycle = createLaneWalkCycle();
  const threshold = LANE_WALK_CYCLE_PROFILE.runThresholdMetersPerSecond;
  assert.ok(Math.abs(threshold - 1.359) < 0.01, 'Froude 0.5 on this rig, not a chosen number');
  assert.ok(LANE_LOCOMOTION_PROFILE.forwardSpeedMps < threshold, 'walking is below it');
  assert.ok(SPRINT_SPEED_MPS > threshold, 'sprinting is above it');

  const walking = cycle.advance({ travelledMeters: (threshold - 0.1) * 0.1, deltaSeconds: 0.1 });
  assert.equal(walking.clipId, LANE_WALK_CLIPS.forward);
  assert.equal(walking.wholeBodyOnly, false);

  const running = cycle.advance({ travelledMeters: (threshold + 0.1) * 0.1, deltaSeconds: 0.1 });
  assert.equal(running.clipId, LANE_WALK_CLIPS.run);
  assert.equal(running.cycleMeters, MEASURED_LOCOMOTION_CLIPS[LANE_WALK_CLIPS.run].strideMeters);
  // A run is its own gait through the whole body, so it cannot be lent to a guard's legs alone.
  assert.equal(running.wholeBodyOnly, true);

  // Backing away has no run clip at any speed - KayKit ships none, and a locked retreat is a walk.
  const backingHard = cycle.advance({ travelledMeters: -3 * 0.1, deltaSeconds: 0.1 });
  assert.equal(backingHard.clipId, LANE_WALK_CLIPS.backward);
});

test('R19C.1 a full cycle of ground is exactly one cycle of the clip', () => {
  const cycle = createLaneWalkCycle();
  cycle.advance({ travelledMeters: LANE_WALK_CYCLE_PROFILE.forwardCycleMeters, deltaSeconds: 1 });
  assert.ok(Math.abs(cycle.phase) < 1e-9, 'a whole cycle lands back where it started');
  cycle.advance({ travelledMeters: LANE_WALK_CYCLE_PROFILE.forwardCycleMeters / 2, deltaSeconds: 1 });
  assert.ok(Math.abs(cycle.phase - 0.5) < 1e-9);
});

test('R20W.1 the gait names the clip it advanced against, and how hard it is being driven', () => {
  const cycle = createLaneWalkCycle();
  const walking = cycle.advance({ travelledMeters: LANE_LOCOMOTION_PROFILE.forwardSpeedMps * 0.1, deltaSeconds: 0.1 });
  assert.equal(walking.clipId, LANE_WALK_CLIPS.forward);
  assert.ok(Math.abs(walking.playbackRate - 1) < 0.06, `walking should run near as drawn, got ${walking.playbackRate}`);

  // Sprint crosses into the run clip, and the stretch it costs is reported rather than hidden:
  // Running_A is drawn for 3.27 m/s, so at 1.5 it plays at less than half speed.
  const sprinting = cycle.advance({ travelledMeters: SPRINT_SPEED_MPS * 0.1, deltaSeconds: 0.1 });
  assert.equal(sprinting.clipId, LANE_WALK_CLIPS.run);
  assert.ok(sprinting.playbackRate > 0.4 && sprinting.playbackRate < 0.5, `sprint runs at ${sprinting.playbackRate}`);

  const standing = cycle.settle();
  assert.equal(standing.clipId, null, 'standing names no clip, which is the caller cue to idle');
  assert.equal(standing.playbackRate, null);
});

test('R20W.1 walking backwards plays its own clip forwards rather than in reverse', () => {
  // The sign says which clip, not which direction to play it - and until the stride carried a sign
  // the arithmetic said otherwise: negative travel against a positive stride wound the backwards
  // clip backwards, which is a moonwalk with the feet sliding at twice the body's speed.
  const cycle = createLaneWalkCycle();
  const first = cycle.advance({ travelledMeters: -0.1, deltaSeconds: 1 / 10 });
  const firstPhase = cycle.phase;
  assert.equal(first.direction, -1);
  assert.equal(first.clipId, LANE_WALK_CLIPS.backward);
  assert.ok(first.cycleMeters < 0, 'the backwards clip carries the body backwards, and says so');
  cycle.advance({ travelledMeters: -0.1, deltaSeconds: 1 / 10 });
  assert.ok(cycle.phase > firstPhase, 'clip time moves forwards while the body moves backwards');
  assert.ok(cycle.phase >= 0 && cycle.phase < 1, `phase ${cycle.phase} left the clip`);

  for (const [input, expected] of [[0, 0], [0.25, 0.25], [1, 0], [1.25, 0.25], [-0.25, 0.75], [-1.25, 0.75]]) {
    assert.ok(Math.abs(wrapCyclePhase(input) - expected) < 1e-9, `wrap(${input})`);
  }
});

test('R19C.1 the measured walk speeds give a plausible gait rather than a sprint', () => {
  const forwardCycleSeconds = LANE_WALK_CYCLE_PROFILE.forwardCycleMeters / LANE_LOCOMOTION_PROFILE.forwardSpeedMps;
  const backwardCycleSeconds = Math.abs(LANE_WALK_CYCLE_PROFILE.backwardCycleMeters) / LANE_LOCOMOTION_PROFILE.backwardSpeedMps;
  assert.ok(forwardCycleSeconds > 0.6 && forwardCycleSeconds < 1.5, `${forwardCycleSeconds.toFixed(2)}s per stride`);
  assert.ok(backwardCycleSeconds > 0.6 && backwardCycleSeconds < 1.5, `${backwardCycleSeconds.toFixed(2)}s per stride backing off`);
});

test('R20W.1 a clip nobody measured has no stride to guess at', () => {
  assert.throws(() => createLaneWalkCycle({ clips: { forward: 'Some_Unmeasured_Clip', backward: 'Walking_Backwards' } }),
    /measured strides/);
});

test('R19C.1 standing still holds the gait instead of creeping or rewinding it', () => {
  const cycle = createLaneWalkCycle();
  cycle.advance({ travelledMeters: 0.3, deltaSeconds: 0.3 });
  const mid = cycle.phase;
  assert.ok(mid > 0);

  const crawling = cycle.advance({ travelledMeters: 0.0001, deltaSeconds: 0.3 });
  assert.equal(crawling.moving, false);
  assert.equal(crawling.direction, 0);
  assert.equal(cycle.phase, mid, 'below the threshold the legs settle rather than inch along');

  const settled = cycle.settle();
  assert.equal(settled.moving, false);
  assert.equal(cycle.phase, mid);

  cycle.reset();
  assert.equal(cycle.phase, 0);
});

test('R19C.1 clip time is phase against whatever clip is playing', () => {
  assert.ok(Math.abs(walkClipTimeSeconds(0.5, 1.07) - 0.535) < 1e-9);
  assert.equal(walkClipTimeSeconds(0, 1.07), 0);
  assert.ok(Math.abs(walkClipTimeSeconds(0.25, 2) - 0.5) < 1e-9);
  assert.equal(walkClipTimeSeconds(0.5, 0), 0);
  assert.equal(walkClipTimeSeconds(Number.NaN, 1.07), 0);
});

test('R19C.1 carries no authority over contact', () => {
  const cycle = createLaneWalkCycle();
  assert.match(cycle.advance({ travelledMeters: 0.1, deltaSeconds: 0.1 }).authority, /no-contact-authority/);
});
