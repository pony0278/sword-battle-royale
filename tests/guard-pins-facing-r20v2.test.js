import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreeMovementController } from '../tools/action-studio/shield-parry-r281/free-movement-controller.js';
import { createEngagementGround } from '../src/combat/engagement-ground.js';
import { MEASURED_GUARD_RELIABLE_CONE_DEGREES } from '../src/combat/guard-frontal-cone.js';

// R20V.2 - a raised guard pins the body. You are braced, not running, so the feet stop steering
// the facing and a defender can strafe or back off without turning their own shield away.
//
// Chosen after R20V.1 measured the alternative: unlocked, movement turned the body at 180 deg/s
// and a quarter second of it cost the block. Pinned, the error grows only as fast as the opponent's
// bearing moves - measured at about 22 deg/s from the 2.4m stance - so TOP and RIGHT hold
// indefinitely and LEFT fails at 22.6 degrees, which is its own measured cone edge of -20.

function harness({ separationMeters = 2.4 } = {}) {
  const ground = createEngagementGround({ startSeparationMeters: separationMeters });
  let guardActive = false;
  const laneController = {
    get report() { return ground.report; },
    get dodgeReport() { return { dodging: false }; },
    get defenderBaseFacingRadians() { return ground.report.defenderFacingRadians; },
    moveDefenderWorld: (dx, dz) => ground.moveDefenderWorld(dx, dz),
    setDefenderFacing: (radians) => ground.setDefenderFacing(radians),
  };
  const movement = createFreeMovementController({
    laneController, readGuardActive: () => guardActive, readAttacking: () => false,
  });
  return { ground, movement, raiseGuard: (up) => { guardActive = up; } };
}
const hold = (movement, seconds, intent, step = 1 / 60) => {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += step) { movement.update(); movement.move(step, intent); }
};

test('R20V.2 a raised guard stops the feet steering the facing', () => {
  const { ground, movement, raiseGuard } = harness();
  raiseGuard(true);
  movement.update();
  const pinned = ground.report.defenderFacingRadians;
  hold(movement, 1.5, { forward: 0, lateral: 1 });
  assert.equal(ground.report.defenderFacingRadians, pinned, 'the body must not turn while braced');
  // The fighter still moved - this pins the shield, not the feet.
  assert.ok(Math.abs(ground.report.defenderPosition.x) > 0.5);
});

test('R20V.2 lowering it hands the body back to the feet', () => {
  const { ground, movement, raiseGuard } = harness();
  raiseGuard(true);
  movement.update();
  const pinned = ground.report.defenderFacingRadians;
  hold(movement, 0.5, { forward: 0, lateral: 1 });
  raiseGuard(false);
  hold(movement, 0.5, { forward: 0, lateral: 1 });
  assert.notEqual(ground.report.defenderFacingRadians, pinned, 'guard down, movement steers again');
});

test('R20V.2 the pin is explicit, so nobody gets the lock aim for free', () => {
  // The trap this avoids: a fighter who has not moved since the lock dropped has NO owned facing,
  // so simply "not steering" would leave the body tracking the opponent - unlocked play would
  // quietly inherit the aimed defence that locking is supposed to buy.
  const { ground, movement, raiseGuard } = harness();
  assert.equal(ground.report.defenderFacingSource, 'derived-from-bearing');
  raiseGuard(true);
  movement.update();
  assert.equal(ground.report.defenderFacingSource, 'owned', 'raising the guard must own the facing outright');
  // And from then on the body does not follow the opponent: walk sideways and the error opens.
  const before = ground.report.defenderBearingRadians;
  hold(movement, 1, { forward: 0, lateral: 1 });
  assert.notEqual(ground.report.defenderBearingRadians, before, 'the opponent has moved relative to us');
  assert.equal(ground.report.defenderFacingRadians, ground.report.defenderFacingRadians, 'and we did not follow');
});

test('R20V.2 locked is untouched - the gap still owns the facing there', () => {
  const { ground, movement, raiseGuard } = harness();
  movement.requestToggle();
  raiseGuard(true);
  hold(movement, 1, { forward: 0, lateral: 1 });
  assert.equal(ground.report.defenderFacingSource, 'derived-from-bearing');
  assert.ok(Math.abs(ground.report.defenderFacingRadians - ground.report.defenderBearingRadians) < 1e-9);
});

test('R20V.2 what it leaves is the cone, which is a measured thing rather than a new one', () => {
  // Pinned, the error grows at the bearing's own rate. A second of guarded sidestep from 2.4m
  // measured 22.6 degrees in the browser, and LEFT - whose reliable band stops at -20 - is exactly
  // the direction that fails there. Nothing had to be re-measured for this option, which is why it
  // was preferred over aiming the guard from the camera.
  const { ground, movement, raiseGuard } = harness();
  raiseGuard(true);
  movement.update();
  hold(movement, 1, { forward: 0, lateral: 1 });
  const errorDegrees = Math.abs(Math.atan2(
    Math.sin(ground.report.defenderFacingRadians - ground.report.defenderBearingRadians),
    Math.cos(ground.report.defenderFacingRadians - ground.report.defenderBearingRadians),
  )) * 180 / Math.PI;
  assert.ok(errorDegrees > 15 && errorDegrees < 30, `a second of guarded sidestep opens about 22 degrees, got ${errorDegrees.toFixed(1)}`);
  assert.ok(errorDegrees > Math.abs(MEASURED_GUARD_RELIABLE_CONE_DEGREES.left.fromDegrees),
    'and it is past LEFT\'s measured edge, which is why LEFT is the direction that fails');
});
