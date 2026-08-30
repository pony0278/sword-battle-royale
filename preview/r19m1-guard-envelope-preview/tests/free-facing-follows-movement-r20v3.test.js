import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreeMovementController } from '../tools/action-studio/shield-parry-r281/free-movement-controller.js';
import { createEngagementGround } from '../src/combat/engagement-ground.js';

// R20V.3 - in free mode you face where you are going, guard or no guard.
//
// This test exists because the opposite was built, measured, and rejected. R20V.2 pinned the body
// while the guard was up so a defender could strafe with the shield still pointed at the fight; it
// dropped the facing error an order of magnitude and stopped TOP and RIGHT failing entirely, and
// playtesting threw it out anyway. Holding a shield and pressing right should walk right, the way
// it does with the shield down. Requiring "aim first, then guard" imports locked-mode thinking into
// the mode whose whole premise is that you face where you are going.
//
// So this is a decision, not an oversight, and it is written down as one - including the price,
// which lock-advantage.js measures: unlocked and moving, the guard is worth very little.

function harness() {
  const ground = createEngagementGround({ startSeparationMeters: 2.4 });
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

test('R20V.3 a raised guard does not change how movement steers', () => {
  const withGuard = harness();
  withGuard.raiseGuard(true);
  hold(withGuard.movement, 0.5, { forward: 0, lateral: 1 });

  const without = harness();
  hold(without.movement, 0.5, { forward: 0, lateral: 1 });

  // Same facing, same ground: the shield is something you are holding, not a stance that pins you.
  assert.ok(Math.abs(withGuard.ground.report.defenderFacingRadians - without.ground.report.defenderFacingRadians) < 1e-9);
  assert.ok(Math.abs(withGuard.ground.report.defenderPosition.x - without.ground.report.defenderPosition.x) < 1e-9);
  assert.equal(withGuard.ground.report.defenderFacingSource, 'owned');
});

test('R20V.3 raising the guard while standing still does not quietly own the facing', () => {
  // R20V.2 wrote the facing on the guard-raise edge. With the pin gone that write must go too, or
  // a fighter who never moved would be frozen pointing wherever the ledger last derived - the same
  // hidden state in the other direction.
  const { ground, movement, raiseGuard } = harness();
  raiseGuard(true);
  movement.update();
  movement.move(1 / 60, { forward: 0, lateral: 0 });
  assert.equal(ground.report.defenderFacingSource, 'derived-from-bearing');
});

test('R20V.3 locked still hands facing to the gap, which is what locking buys', () => {
  const { ground, movement, raiseGuard } = harness();
  movement.requestToggle();
  raiseGuard(true);
  hold(movement, 1, { forward: 0, lateral: 1 });
  assert.equal(ground.report.defenderFacingSource, 'derived-from-bearing');
  assert.ok(Math.abs(ground.report.defenderFacingRadians - ground.report.defenderBearingRadians) < 1e-9);
});
