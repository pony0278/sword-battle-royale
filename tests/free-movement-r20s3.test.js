import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFreeMovementController } from '../tools/action-studio/shield-parry-r281/free-movement-controller.js';
import { createEngagementGround } from '../src/combat/engagement-ground.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';

// R20S.3 - free movement and lock-on, wired into the combat lab. The controller is driven here
// against a real ledger rather than a stub, so every clamp the ground enforces is in play.

function harness(separationMeters = 2.4) {
  const ground = createEngagementGround({ startSeparationMeters: separationMeters });
  const laneController = {
    get report() { return ground.report; },
    moveDefenderWorld: (dx, dz) => ground.moveDefenderWorld(dx, dz),
    setDefenderFacing: (radians) => ground.setDefenderFacing(radians),
  };
  return { ground, laneController, movement: createFreeMovementController({ laneController }) };
}
const hold = (movement, seconds, intent, step = 1 / 60) => {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += step) { movement.update(); movement.move(step, intent); }
};

test('R20S.3 locked, the strafe orbits: the gap is held while the ground moves', () => {
  const { ground, movement } = harness(2.4);
  assert.equal(movement.requestToggle({ fovDegrees: 74, aspectRatio: 16 / 9 }).locked, true);
  const before = ground.report;
  hold(movement, 1, { forward: 0, lateral: 1 });
  const after = ground.report;
  // A second of sidestep at the measured speed, spent going round rather than away.
  assert.ok(Math.abs(after.defenderPosition.x - before.defenderPosition.x) > 0.6);
  assert.ok(Math.abs(after.separationMeters - before.separationMeters) < 0.02,
    `orbit must hold the gap, moved ${before.separationMeters} -> ${after.separationMeters}`);
  // Locked, facing belongs to the geometry - which is what keeps the lane's measured world intact.
  assert.equal(after.defenderFacingSource, 'derived-from-bearing');
});

test('R20S.3 locked, forward is the line to the target', () => {
  const { ground, movement } = harness(2.4);
  movement.requestToggle();
  hold(movement, 0.5, { forward: 1, lateral: 0 });
  const closed = 2.4 - ground.report.separationMeters;
  assert.ok(Math.abs(closed - LANE_LOCOMOTION_PROFILE.forwardSpeedMps * 0.5) < 0.05, `closed ${closed}`);
  // Backing off is the slower verb, so half a second does not undo half a second of closing.
  const closedGap = ground.report.separationMeters;
  hold(movement, 0.5, { forward: -1, lateral: 0 });
  const opened = ground.report.separationMeters - closedGap;
  assert.ok(Math.abs(opened - LANE_LOCOMOTION_PROFILE.backwardSpeedMps * 0.5) < 0.05, `opened ${opened}`);
  assert.ok(opened < LANE_LOCOMOTION_PROFILE.forwardSpeedMps * 0.5, 'a retreat can never out-pace an advance');
});

test('R20S.3 unlocked, the frame you move in is not the thing your movement steers', () => {
  // The bug this test exists for: the first version used the fighter's own facing as the movement
  // frame while movement set that facing, so "right" turned as you walked and a held strafe curved
  // into a circle - 1.2cm of travel in a second. Free look is separate state for that reason.
  const { ground, movement } = harness(2.4);
  const start = ground.report.defenderPosition;
  hold(movement, 1, { forward: 0, lateral: 1 });
  const end = ground.report.defenderPosition;
  const travelled = Math.hypot(end.x - start.x, end.z - start.z);
  assert.ok(travelled > LANE_LOCOMOTION_PROFILE.lateralSpeedMps * 0.9,
    `a second of strafe must cover a second of ground, got ${travelled.toFixed(3)}m`);
  // Straight, too: every step in the same world direction rather than an arc.
  const heading = Math.atan2(end.x - start.x, end.z - start.z);
  const { ground: g2, movement: m2 } = harness(2.4);
  hold(m2, 0.5, { forward: 0, lateral: 1 });
  const half = g2.report.defenderPosition;
  assert.ok(Math.abs(Math.atan2(half.x, half.z - 1.2) - heading) < 0.05, 'the strafe holds one heading');
  // And unlocked, the fighter owns their facing.
  assert.equal(ground.report.defenderFacingSource, 'owned');
});

test('R20S.3 free look turns the camera, and a lock refuses to let it', () => {
  const { movement } = harness(2.4);
  const before = movement.freeYawRadians;
  movement.look(100);
  assert.ok(Math.abs(movement.freeYawRadians - before) > 1e-6, 'a drag turns the free camera');
  movement.requestToggle();
  const locked = movement.freeYawRadians;
  movement.look(400);
  assert.equal(movement.freeYawRadians, locked, 'locked, the camera is following the person you chose');
});

test('R20S.3 releasing a lock is not also a camera cut', () => {
  const { ground, movement } = harness(2.4);
  movement.requestToggle();
  hold(movement, 1, { forward: 0, lateral: 1 });
  const bearing = ground.report.defenderBearingRadians;
  movement.requestToggle();
  assert.equal(movement.locked, false);
  // You are handed the view pointed where you were already looking.
  assert.ok(Math.abs(movement.freeYawRadians - bearing) < 1e-9);
});

test('R20S.3 the lock is manual, breaks on distance, and refuses a target behind you', () => {
  const { ground, movement } = harness(2.4);
  hold(movement, 0.5, { forward: 0, lateral: 0 });
  assert.equal(movement.locked, false, 'standing near somebody must not lock onto them');
  movement.requestToggle();
  assert.equal(movement.locked, true);
  // Walk out past the break range.
  hold(movement, 5, { forward: -1, lateral: 0 });
  assert.ok(ground.report.separationMeters > 5);
  assert.equal(movement.locked, false);
  assert.equal(movement.lockReport.reason, 'broke-by-distance');
  // Turned away, a fresh lock is refused - which is the whole point of aiming with the camera.
  movement.look(-4000);
  assert.equal(movement.requestToggle({ fovDegrees: 74, aspectRatio: 16 / 9 }).locked, false);
});

test('R20S.3 the wiring keeps the lock, the feet and the camera in that order', () => {
  const player = readFileSync(new URL('../tools/action-studio/shield-parry-r281/player-controller.js', import.meta.url), 'utf8');
  const frame = player.slice(player.indexOf('frame(deltaSeconds)'));
  const update = frame.indexOf('movement.update()');
  const move = frame.indexOf('movement.move(');
  const camera = frame.indexOf('cameraController.update(');
  assert.ok(update >= 0 && update < move && move < camera, 'lock, then feet, then the camera');
  // The entry drives it in one call, before the lane stamps positions for the frame.
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.ok(entry.indexOf('playerController.frame(rawDeltaMs / 1000)') < entry.indexOf('laneController.walk(rawDeltaMs / 1000'));
  // Defence when unlocked is not special-cased: the measured cone is what decides coverage, and a
  // second rule saying "you cannot block behind you" would be a weaker copy of geometry.
  const movementSource = readFileSync(new URL('../tools/action-studio/shield-parry-r281/free-movement-controller.js', import.meta.url), 'utf8');
  assert.doesNotMatch(movementSource, /guardMachine|parryGate|GUARD_/, 'free movement holds no defence authority');
});
