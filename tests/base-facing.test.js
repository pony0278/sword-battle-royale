import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  BASE_FACING_STAGE,
  BASE_FACING_TURN_RATE_RADIANS_PER_SECOND,
  createBaseFacingRuntime,
  wrapAngleRadians,
} from '../src/combat/base-facing.js';

import { createShieldParryLaneController } from '../src/game/lane-controller.js';
import { LONGSWORD_ATTACK_PHASES } from '../src/combat/longsword-directional-attack-runtime.js';

function laneHarness(separationMeters = 2.4) {
  const stamped = [];
  const labScene = {
    engagementStance: { separationMeters },
    setLanePositions: (report) => stamped.push(report),
    setDefenderYawOffset: () => {},
    defender: null,
    camera: null,
  };
  const laneController = createShieldParryLaneController({
    labScene,
    walkClips: { forward: 'Walking_A', backward: 'Walking_Backwards' },
    services: { captureRigPose: () => null, applyRigPose: () => {} },
  });
  return { laneController, stamped };
}

test('R19T.1 a body spawns facing its opponent and turns at a bounded rate after', () => {
  assert.equal(BASE_FACING_STAGE, 'R19T.1');
  const facing = createBaseFacingRuntime();
  // First bearing snaps - nobody swivels in from world zero at spawn.
  assert.equal(facing.update(Math.PI, 0.016), Math.PI);
  // A moved bearing is chased at the rate, not teleported to.
  const after = facing.update(Math.PI / 2, 0.1);
  const expected = Math.PI - BASE_FACING_TURN_RATE_RADIANS_PER_SECOND * 0.1;
  assert.ok(Math.abs(after - expected) < 1e-12);
  // And it saturates at the target rather than oscillating past it.
  assert.ok(Math.abs(facing.update(Math.PI / 2, 10) - Math.PI / 2) < 1e-12);
});

test('R19T.1 the turn takes the short way around the wrap', () => {
  // A bearing crossing the +/-pi seam is a few degrees away, not a full spin: 170 to -170
  // degrees is 20 degrees through the seam, and the naive difference of 340 would whirl the
  // body the long way around.
  const facing = createBaseFacingRuntime();
  facing.snapTo((170 * Math.PI) / 180);
  const after = facing.update((-170 * Math.PI) / 180, 0.05);
  const movedDeg = (wrapAngleRadians(after - (170 * Math.PI) / 180) * 180) / Math.PI;
  assert.ok(movedDeg > 0 && movedDeg <= 9.1, `moved ${movedDeg} deg toward the seam, not away`);
  assert.ok(Math.abs(facing.update((-170 * Math.PI) / 180, 10) - (-170 * Math.PI) / 180) < 1e-12);
});

test('R19T.1 a frozen facing holds through anything the bearing does', () => {
  // The attacker's swing owns their facing from commitment to resolution: soft tracking at
  // strength zero. B4 replaces the freeze with a measured rate; until then a sidestep mid-swing
  // is stepped away from, never tracked.
  const facing = createBaseFacingRuntime();
  facing.snapTo(0);
  assert.equal(facing.update(1.0, 10, { frozen: true }), 0);
  assert.equal(facing.facingRadians, 0);
  const after = facing.update(1.0, 10, { frozen: false });
  assert.ok(Math.abs(after - 1.0) < 1e-12, 'and it resumes chasing when the freeze lifts');
});

// R23C.1 converted this from six source-text matches to the behaviour they were standing in for.
// They went red for a change that moved nothing: giving the freeze a subject turned one call's
// options object into a variable, and the regex was pinned to the literal. R22J.1's rule says a
// claim about behaviour is asserted by driving it, so this drives it.
test('R19T.1 the lane controller integrates both facings and stamps them, the swinger frozen by the swing', () => {
  const { laneController, stamped } = laneHarness();
  // One neutral frame first: a body spawns facing its opponent, so the integrators snap to the
  // bearing on their first reading and only start integrating from the second.
  laneController.walk(1 / 60, null);
  // Off the line, so there is a bearing to chase and a freeze that can be seen refusing to.
  laneController.moveDefenderWorld(0.9, 0);
  const beforeAttacker = laneController.attackerBaseFacingRadians;
  const beforeDefender = laneController.defenderBaseFacingRadians;
  for (let i = 0; i < 30; i += 1) {
    laneController.update((i + 1) / 60, true, LONGSWORD_ATTACK_PHASES.ACTIVE);
    laneController.walk(1 / 60, null);
  }
  assert.equal(laneController.attackerBaseFacingRadians, beforeAttacker,
    'the attacker committed a swing, so their facing is frozen for the length of it');
  assert.notEqual(laneController.defenderBaseFacingRadians, beforeDefender,
    'the defender committed nothing, so theirs keeps chasing the bearing');
  // The stamp carries the integrated facings, never the raw bearings - the ledger keeps the
  // bearing as a fact, the scene shows the facing a body actually has.
  const last = stamped.at(-1);
  assert.equal(last.attackerFacingRadians, laneController.attackerBaseFacingRadians);
  assert.equal(last.defenderFacingRadians, laneController.defenderBaseFacingRadians);
  assert.notEqual(last.attackerFacingRadians, last.attackerBearingRadians,
    'a frozen facing has come apart from the bearing, which is the whole point of integrating it');
  // And a lane reset teleports facing with the fighters.
  laneController.resetLane();
  assert.equal(laneController.attackerBaseFacingRadians, 0);
  assert.equal(laneController.defenderBaseFacingRadians, Math.PI);
});
