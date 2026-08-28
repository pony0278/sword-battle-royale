import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  BASE_FACING_STAGE,
  BASE_FACING_TURN_RATE_RADIANS_PER_SECOND,
  createBaseFacingRuntime,
  wrapAngleRadians,
} from '../src/combat/base-facing.js';

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

test('R19T.1 the lane controller integrates both facings and stamps them, attacker frozen by the swing', async () => {
  const lane = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/lane-controller.js', import.meta.url), 'utf8');
  assert.match(lane, /attackerBaseFacing\.update\(bearings\.attackerFacingRadians, deltaSeconds, \{ frozen: swingLive \}\)/);
  assert.match(lane, /defenderBaseFacing\.update\(bearings\.defenderFacingRadians, deltaSeconds\)/);
  // The stamp carries the integrated facings, never the raw bearings - the ledger keeps the
  // bearing as a fact, the scene shows the facing a body actually has.
  assert.match(lane, /attackerFacingRadians: attackerBaseFacing\.facingRadians/);
  assert.match(lane, /defenderFacingRadians: defenderBaseFacing\.facingRadians/);
  // And a lane reset teleports facing with the fighters.
  assert.match(lane, /attackerBaseFacing\.snapTo\(0\)/);
  assert.match(lane, /defenderBaseFacing\.snapTo\(Math\.PI\)/);
});
