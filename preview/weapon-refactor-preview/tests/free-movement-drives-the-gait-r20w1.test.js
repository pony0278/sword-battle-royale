import test from 'node:test';
import assert from 'node:assert/strict';
import { createShieldParryLaneController } from '../src/game/lane-controller.js';
import { LANE_WALK_CLIPS } from '../src/combat/lane-walk-cycle.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';
import { SPRINT_SPEED_MPS } from '../src/combat/sprint-locomotion.js';

// R20W.1 - the legs the player never had.
//
// R20S.3 moved every player step onto the world-frame verb, and the gait was still being fed the
// lane step, which is zero for the player from that commit onwards. Measured in the lab afterwards:
// holding W moved the defender 0.417m in 0.4s while the gait reported 0.00 m/s and moving false, so
// sampleDefenderWalk returned null every frame and the legs never left the guard pose. Nothing
// caught it - the source tests covered the gait, the golden grid presses no movement key, and the
// walk verb tests assert displacement, which was correct the whole time.
//
// So these assert the join: the ground the ledger actually granted has to arrive at the feet.

function harness(options = {}) {
  const separationMeters = typeof options === 'number' ? options : (options.separationMeters ?? 2.4);
  const labScene = {
    engagementStance: { separationMeters },
    setLanePositions: () => {},
    setDefenderYawOffset: () => {},
    defender: null,
    camera: null,
  };
  const laneController = createShieldParryLaneController({
    labScene,
    walkClips: LANE_WALK_CLIPS,
    services: { captureRigPose: () => null, applyRigPose: () => {} },
    ...(typeof options === 'object' ? options : {}),
  });
  return laneController;
}

// One frame in the order the entry runs it: the player controller moves, then the lane walks.
function frame(laneController, { deltaSeconds = 1 / 60, dx = 0, dz = 0 } = {}) {
  if (dx !== 0 || dz !== 0) laneController.moveDefenderWorld(dx, dz);
  laneController.walk(deltaSeconds, null);
}

test('R20W.1 walking in the world frame turns the legs over', () => {
  const laneController = harness();
  // Facing the attacker down -z is the lab's start, so forward for the defender is -z.
  const step = LANE_LOCOMOTION_PROFILE.forwardSpeedMps / 60;
  for (let i = 0; i < 30; i += 1) frame(laneController, { dz: -step });
  const gait = laneController.defenderGait;
  assert.equal(gait.moving, true, 'the gait must see the travel the ledger granted');
  assert.ok(Math.abs(gait.speedMetersPerSecond - LANE_LOCOMOTION_PROFILE.forwardSpeedMps) < 0.05,
    `gait speed ${gait.speedMetersPerSecond}`);
  assert.equal(gait.clipId, LANE_WALK_CLIPS.forward);
  assert.ok(laneController.defenderGait.phase > 0, 'and the phase has to actually move');
});

test('R20W.1 the clip it plays is the one for the direction the body is travelling', () => {
  const laneController = harness();
  const step = LANE_LOCOMOTION_PROFILE.backwardSpeedMps / 60;
  for (let i = 0; i < 30; i += 1) frame(laneController, { dz: step });
  assert.equal(laneController.defenderGait.clipId, LANE_WALK_CLIPS.backward, 'backing away is its own clip');
  assert.equal(laneController.defenderGait.direction, -1);
});

test('R22G.1 sprinting wears the run, and R21U.1 without it the walk keeps its stride', () => {
  // R21U.1 took the legs off the run because at 1.5 m/s it came back at 1.15 steps per second,
  // fewer than a WALKING person's two. R22G.1 put them back, having moved the speed that made that
  // true: at 3.0 m/s, played at the rate it was drawn at, the run reads as running. Both halves are
  // still here because both are still reachable, and the second is what the first is measured
  // against.
  const running = harness();
  const step = SPRINT_SPEED_MPS / 60;
  for (let i = 0; i < 30; i += 1) frame(running, { dz: -step });
  const sprint = running.defenderGait;
  assert.equal(sprint.clipId, LANE_WALK_CLIPS.run);
  assert.equal(sprint.playbackRate, 1, 'the run plays as drawn - that is what shipping R22F.1 means');
  assert.ok(sprint.footSlideMetersPerSecond > 0, 'and the feet slide, which is the price');

  // ?wholebody=0: the pre-R22E.1 gait, exactly. Fifteen frames, not thirty: at 3.0 m/s thirty
  // would cover 1.5m and run the defender into the 0.9m contact floor, and ground the ledger
  // refuses is ground the feet correctly do not get - which would make this a test of the clamp.
  const walking = harness({ wholeBodyRun: false });
  for (let i = 0; i < 15; i += 1) frame(walking, { dz: -step });
  const gait = walking.defenderGait;
  assert.equal(gait.clipId, LANE_WALK_CLIPS.forward);
  assert.equal(gait.footSlideMetersPerSecond, 0, 'distance-driven, so no slide at any speed');
  // Phase is the ground divided by the stride, which is what "the foot stays put" means.
  const travelled = step * 15;
  assert.ok(Math.abs(gait.phase - travelled / gait.cycleMeters) < 1e-6, 'phase is the ground, divided by the stride');
});

test('R20X.1 a sidestep turns the stride instead of sliding or standing still', () => {
  // Until R20X.1 this asserted the opposite - a sidestep had no gait at all, because the walk was
  // driven by the forward projection and a sidestep has none. KayKit ships no walking strafe, and
  // the running one is authored for 3.04 m/s with 80% of its cycle airborne, so at 0.75 it would
  // play at a quarter speed. Turning the stride at the hip is what is left: the walk clip, driven
  // by the whole distance, with the leg chain yawed to point along travel.
  const laneController = harness();
  frame(laneController, {});
  const facing = laneController.report.defenderFacingRadians;
  // Own the facing so the body cannot turn into the travel - a fighter who keeps turning to face
  // someone while walking a straight line IS partly walking forwards, and that is not the case here.
  laneController.setDefenderFacing(facing);
  for (let i = 0; i < 30; i += 1) frame(laneController, {});
  const step = LANE_LOCOMOTION_PROFILE.lateralSpeedMps / 60;
  const sideX = Math.cos(facing) * step;
  const sideZ = -Math.sin(facing) * step;
  for (let i = 0; i < 30; i += 1) frame(laneController, { dx: sideX, dz: sideZ });

  const gait = laneController.defenderGait;
  assert.equal(gait.moving, true, 'a sidestep is walking, and the legs have to say so');
  assert.equal(gait.clipId, LANE_WALK_CLIPS.forward, 'the forward walk, turned - not the backwards one');
  assert.ok(Math.abs(gait.speedMetersPerSecond - LANE_LOCOMOTION_PROFILE.lateralSpeedMps) < 0.05,
    `the whole distance reaches the gait, got ${gait.speedMetersPerSecond}`);

  const travel = laneController.defenderTravelPlan;
  assert.ok(Math.abs(Math.abs(travel.legYawRadians) - Math.PI / 2) < 0.05,
    `a pure sidestep is a right angle at the hip, got ${(travel.legYawRadians * 180 / Math.PI).toFixed(1)} degrees`);
  assert.equal(travel.backwards, false, 'a sidestep is not a backpedal');
});

test('R20X.1 walking straight leaves the stride where it was', () => {
  const laneController = harness();
  const step = LANE_LOCOMOTION_PROFILE.forwardSpeedMps / 60;
  for (let i = 0; i < 30; i += 1) frame(laneController, { dz: -step });
  assert.ok(Math.abs(laneController.defenderTravelPlan.legYawRadians) < 1e-6,
    'nothing to turn when the legs already point where the body is going');
});

test('R20W.1 ground the ledger refused is ground the feet do not get', () => {
  // Walking into the opponent stops at the contact floor. Feet that counted the request rather
  // than the result would keep striding against it.
  const laneController = harness(0.95);
  const step = LANE_LOCOMOTION_PROFILE.forwardSpeedMps / 60;
  for (let i = 0; i < 60; i += 1) frame(laneController, { dz: -step });
  const stalled = laneController.defenderGait;
  const phaseAtWall = laneController.defenderGait.phase;
  for (let i = 0; i < 30; i += 1) frame(laneController, { dz: -step });
  assert.ok(laneController.report.separationMeters > 0.85, 'the ledger held the line');
  assert.equal(laneController.defenderGait.phase, phaseAtWall, 'and the legs stopped with the body');
  assert.equal(laneController.defenderGait.moving, false);
  assert.ok(stalled, 'gait reported throughout');
});
