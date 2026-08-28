import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KAYKIT_LEG_CHAIN_METERS,
  LANE_WALK_CYCLE_PROFILE,
  LANE_WALK_CYCLE_STAGE,
  WALK_STEP_PER_LEG_LENGTH,
  createLaneWalkCycle,
  walkClipTimeSeconds,
  wrapCyclePhase,
} from '../src/combat/lane-walk-cycle.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';

test('R19C.1 takes its stride from the rig rather than from the clip', () => {
  assert.equal(LANE_WALK_CYCLE_STAGE, 'R19C.1');
  // kaykit-rig-definition.js: upperleg -> lowerleg 0.227m plus lowerleg -> foot 0.149m.
  assert.ok(Math.abs(KAYKIT_LEG_CHAIN_METERS - (0.227 + 0.149)) < 1e-9);
  assert.ok(Math.abs(LANE_WALK_CYCLE_PROFILE.stepMeters - KAYKIT_LEG_CHAIN_METERS * WALK_STEP_PER_LEG_LENGTH) < 1e-9);
  assert.ok(Math.abs(LANE_WALK_CYCLE_PROFILE.cycleMeters - LANE_WALK_CYCLE_PROFILE.stepMeters * 2) < 1e-9);
  assert.ok(WALK_STEP_PER_LEG_LENGTH < 1, 'a walking step is shorter than the leg taking it');
});

test('R19C.1 a foot on the ground stays there: phase tracks distance, not time', () => {
  // The whole reason this module exists. The same distance must give the same phase however long
  // it took to cover it, or the feet skate whenever speed changes.
  const slow = createLaneWalkCycle();
  const fast = createLaneWalkCycle();
  for (let i = 0; i < 10; i += 1) slow.advance({ travelledMeters: 0.03, deltaSeconds: 1 / 30 });
  fast.advance({ travelledMeters: 0.3, deltaSeconds: 1 / 30 });
  assert.ok(Math.abs(slow.phase - fast.phase) < 1e-9, 'same ground covered, same point in the stride');
});

test('R19C.1 a full cycle of ground is exactly one cycle of the clip', () => {
  const cycle = createLaneWalkCycle();
  cycle.advance({ travelledMeters: LANE_WALK_CYCLE_PROFILE.cycleMeters, deltaSeconds: 1 });
  assert.ok(Math.abs(cycle.phase) < 1e-9, 'a whole cycle lands back where it started');
  cycle.advance({ travelledMeters: LANE_WALK_CYCLE_PROFILE.cycleMeters / 2, deltaSeconds: 1 });
  assert.ok(Math.abs(cycle.phase - 0.5) < 1e-9);
});

test('R19C.1 the measured walk speeds give a plausible gait rather than a sprint', () => {
  // Cross-check against the speeds locomotion actually uses: a 0.6m cycle at 1.0 m/s is a stride
  // every 0.6s, which is a brisk walk. If either number drifts into nonsense this catches it.
  const forwardCycleSeconds = LANE_WALK_CYCLE_PROFILE.cycleMeters / LANE_LOCOMOTION_PROFILE.forwardSpeedMps;
  const backwardCycleSeconds = LANE_WALK_CYCLE_PROFILE.cycleMeters / LANE_LOCOMOTION_PROFILE.backwardSpeedMps;
  assert.ok(forwardCycleSeconds > 0.4 && forwardCycleSeconds < 1.2, `${forwardCycleSeconds.toFixed(2)}s per stride`);
  assert.ok(backwardCycleSeconds > forwardCycleSeconds, 'backing off is the slower gait');
});

test('R19C.1 walking backwards runs the cycle in reverse without sampling off the clip', () => {
  const cycle = createLaneWalkCycle();
  const back = cycle.advance({ travelledMeters: -0.1, deltaSeconds: 1 / 30 });
  assert.ok(cycle.phase >= 0 && cycle.phase < 1, `phase ${cycle.phase} left the clip`);
  assert.equal(back.direction, -1);
  assert.equal(back.moving, true);
  for (const [input, expected] of [[0, 0], [0.25, 0.25], [1, 0], [1.25, 0.25], [-0.25, 0.75], [-1.25, 0.75]]) {
    assert.ok(Math.abs(wrapCyclePhase(input) - expected) < 1e-9, `wrap(${input})`);
  }
});

test('R19C.1 standing still holds the gait instead of creeping or rewinding it', () => {
  const cycle = createLaneWalkCycle();
  cycle.advance({ travelledMeters: 0.3, deltaSeconds: 0.3 });
  const mid = cycle.phase;
  assert.ok(mid > 0);

  // A drift far slower than a walk is standing, not walking.
  const crawling = cycle.advance({ travelledMeters: 0.0001, deltaSeconds: 0.3 });
  assert.equal(crawling.moving, false);
  assert.equal(crawling.direction, 0);
  assert.equal(cycle.phase, mid, 'below the threshold the legs settle rather than inch along');

  // And stopping keeps the foot you were on, so tapping a key does not stutter the gait.
  const settled = cycle.settle();
  assert.equal(settled.moving, false);
  assert.equal(cycle.phase, mid);

  cycle.reset();
  assert.equal(cycle.phase, 0);
});

test('R19C.1 clip time is phase against whatever clip is playing', () => {
  assert.ok(Math.abs(walkClipTimeSeconds(0.5, 1.07) - 0.535) < 1e-9);
  assert.equal(walkClipTimeSeconds(0, 1.07), 0);
  // Forwards and backwards clips differ in length, and the same phase means the same point in each.
  assert.ok(Math.abs(walkClipTimeSeconds(0.25, 2) - 0.5) < 1e-9);
  assert.equal(walkClipTimeSeconds(0.5, 0), 0);
  assert.equal(walkClipTimeSeconds(Number.NaN, 1.07), 0);
});

test('R19C.1 carries no authority over contact', () => {
  const cycle = createLaneWalkCycle();
  assert.match(cycle.advance({ travelledMeters: 0.1, deltaSeconds: 0.1 }).authority, /no-contact-authority/);
});
