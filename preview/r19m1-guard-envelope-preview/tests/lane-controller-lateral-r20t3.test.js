import test from 'node:test';
import assert from 'node:assert/strict';
import { createShieldParryLaneController } from '../src/game/lane-controller.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';

// R20T.3 - the lane controller's feet, driven for real rather than grepped for.
//
// This exists because of a near miss. Correcting the sidestep's sign, an edit deleted the line
// that plans the step at all, and nothing caught it: node --check only reads syntax, the source
// tests were matching on the line that survived, and the golden grid never presses a movement key.
// A browser probe found it. Cheap behavioural coverage of the verbs themselves closes that hole.

function harness(separationMeters = 2.4) {
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
const walk = (laneController, seconds, step = 1 / 60) => {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += step) laneController.walk(step, null);
};

test('R20T.3 a held sidestep actually moves the defender, at the measured speed', () => {
  const { laneController } = harness();
  const before = laneController.report.defenderPosition.x;
  laneController.setDefenderLateralIntent(1);
  walk(laneController, 1);
  const travelled = laneController.report.defenderPosition.x - before;
  assert.ok(Math.abs(travelled) > 0, 'the step must be planned and spent, not just intended');
  assert.ok(Math.abs(Math.abs(travelled) - LANE_LOCOMOTION_PROFILE.lateralSpeedMps) < 0.02,
    `a second of sidestep is a second of ground, got ${travelled.toFixed(3)}m`);
});

test('R20T.3 positive intent is the defender own right, which is world +x', () => {
  // The defender stands facing -z, which is the direction the default camera faces, and its screen
  // right is +x. So a right sidestep raises x. Reasoning the other way is the bug this corrects.
  const { laneController } = harness();
  laneController.setDefenderLateralIntent(1);
  walk(laneController, 0.5);
  assert.ok(laneController.report.defenderPosition.x > 0.3, 'right goes +x');
  laneController.setDefenderLateralIntent(-1);
  walk(laneController, 1);
  assert.ok(laneController.report.defenderPosition.x < -0.3, 'and left goes -x');
});

test('R20T.3 the forward and back verbs still spend into the gap', () => {
  const { laneController } = harness(2.4);
  laneController.setDefenderIntent(1); // backing off opens the separation
  walk(laneController, 0.5);
  const opened = laneController.report.separationMeters;
  assert.ok(opened > 2.4, `backing off opens the gap, got ${opened}`);
  laneController.setDefenderIntent(-1);
  walk(laneController, 0.5);
  assert.ok(laneController.report.separationMeters < opened);
});

test('R20T.3 every frame stamps a position, so a dropped verb cannot hide behind a stale stamp', () => {
  const { laneController, stamped } = harness();
  walk(laneController, 0.1);
  assert.equal(stamped.length, 6);
  for (const report of stamped) {
    assert.equal(typeof report.defenderPosition.x, 'number');
    assert.equal(typeof report.attackerFacingRadians, 'number');
  }
});
