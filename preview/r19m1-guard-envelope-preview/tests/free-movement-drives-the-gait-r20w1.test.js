import test from 'node:test';
import assert from 'node:assert/strict';
import { createShieldParryLaneController } from '../tools/action-studio/shield-parry-r281/lane-controller.js';
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

function harness(separationMeters = 2.4) {
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

test('R20W.1 sprinting drives the same clip harder rather than sliding', () => {
  const laneController = harness();
  const step = SPRINT_SPEED_MPS / 60;
  for (let i = 0; i < 30; i += 1) frame(laneController, { dz: -step });
  const gait = laneController.defenderGait;
  assert.equal(gait.clipId, LANE_WALK_CLIPS.forward);
  assert.ok(gait.playbackRate > 1.3 && gait.playbackRate < 1.5, `sprint plays at ${gait.playbackRate}`);
  // Distance-driven, so the stride still lands where the ground did: no slide at any speed.
  const cycles = gait.phase;
  const travelled = (SPRINT_SPEED_MPS / 60) * 30;
  assert.ok(Math.abs(cycles - travelled / gait.cycleMeters) < 1e-6, 'phase is the ground, divided by the stride');
});

test('R20W.1 a sidestep does not pretend to be a walk', () => {
  // Locked, the player circles: body-relative that is pure lateral travel, and KayKit ships no
  // walking strafe. The legs stay planted rather than striding in a direction nobody is going.
  const laneController = harness();
  frame(laneController, {});
  // Own the facing so the body cannot turn into the travel - a fighter who keeps turning to face
  // someone while walking a straight line IS partly walking forwards, and that is not the case here.
  const facing = laneController.report.defenderFacingRadians;
  laneController.setDefenderFacing(facing);
  for (let i = 0; i < 30; i += 1) frame(laneController, {});
  const step = LANE_LOCOMOTION_PROFILE.lateralSpeedMps / 60;
  const sideX = Math.cos(facing) * step;
  const sideZ = -Math.sin(facing) * step;
  for (let i = 0; i < 30; i += 1) frame(laneController, { dx: sideX, dz: sideZ });
  assert.equal(laneController.defenderGait.moving, false, 'a sidestep has no clip, so it has no gait');
  assert.equal(laneController.defenderGait.phase, 0);
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
