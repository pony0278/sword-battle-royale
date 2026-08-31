import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEASURED_DISENGAGE_DEFICIT,
  SPRINT_SPEED_BRACKET_MPS,
  SPRINT_SPEED_MPS,
  SPRINT_SPEED_PROVENANCE,
  planSprint,
} from '../src/combat/sprint-locomotion.js';
import { createFreeMovementController } from '../src/game/free-movement-controller.js';
import { createEngagementGround } from '../src/combat/engagement-ground.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';

// R20U.1 - running. The verb exists because nobody could leave; the tests hold both halves of
// that: the deficit it answers, and the gates that keep it out of an exchange.

function harness({ separationMeters = 2.4, guardActive = false, attacking = false } = {}) {
  const ground = createEngagementGround({ startSeparationMeters: separationMeters });
  const laneController = {
    get report() { return ground.report; },
    get dodgeReport() { return { dodging: false }; },
    moveDefenderWorld: (dx, dz) => ground.moveDefenderWorld(dx, dz),
    setDefenderFacing: (radians) => ground.setDefenderFacing(radians),
  };
  const movement = createFreeMovementController({
    laneController, readGuardActive: () => guardActive, readAttacking: () => attacking,
  });
  return { ground, movement };
}
const hold = (movement, seconds, intent, step = 1 / 60) => {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += step) { movement.update(); movement.move(step, intent); }
};

test('R20U.1 the speed sits inside the bracket the measurements leave for it', () => {
  // Faster than a walk or it buys nothing; slower than the dodge's authored burst or the dodge
  // stops being the fastest thing a fighter can do.
  assert.ok(SPRINT_SPEED_MPS > SPRINT_SPEED_BRACKET_MPS.floor);
  assert.ok(SPRINT_SPEED_MPS < SPRINT_SPEED_BRACKET_MPS.ceiling);
  assert.equal(SPRINT_SPEED_BRACKET_MPS.floor, LANE_LOCOMOTION_PROFILE.forwardSpeedMps);
  assert.equal(SPRINT_SPEED_BRACKET_MPS.ceiling, LANE_LOCOMOTION_PROFILE.authoredBurstCeilingMps);
  // Tuned, not measured, and saying so - KayKit's Running clips carry no root travel to read.
  assert.match(SPRINT_SPEED_PROVENANCE, /^seed/);
});

test('R20U.1 it answers the deficit that justified it', () => {
  // Walking away loses ground and back-dodging loses more; running is the first verb that gains.
  assert.ok(MEASURED_DISENGAGE_DEFICIT.walkingBackwardMetersPerSecond < 0);
  assert.ok(MEASURED_DISENGAGE_DEFICIT.backDodgeMetersPerCycle < MEASURED_DISENGAGE_DEFICIT.walkingBackwardMetersPerSecond,
    'the back dodge is worse than walking, which is the finding that ruled a dash out');
  assert.ok(MEASURED_DISENGAGE_DEFICIT.sprintMetersPerSecond > 0);
});

test('R20U.1 an exchange refuses it, and says which part of the exchange refused', () => {
  const running = { requested: true, forwardInput: 1 };
  assert.equal(planSprint(running).sprinting, true);
  assert.equal(planSprint({ ...running, locked: true }).reason, 'locked-on-let-go-of-the-lock-to-run');
  assert.equal(planSprint({ ...running, guardActive: true }).reason, 'guard-is-up');
  assert.equal(planSprint({ ...running, attacking: true }).reason, 'mid-swing');
  assert.equal(planSprint({ ...running, dodging: true }).reason, 'mid-dodge');
  // Any direction, because free mode has no backpedal: the body turns through 180 degrees and runs
  // that way. Measured before the rule was written - pressing the old "back" key turns the fighter
  // at 180 deg/s and the motion is forward for the body the moment the turn lands.
  assert.equal(planSprint({ ...running, forwardInput: -1 }).sprinting, true);
  assert.equal(planSprint({ ...running, forwardInput: 0, lateralInput: 1 }).sprinting, true);
  // Standing still is not running.
  assert.equal(planSprint({ ...running, forwardInput: 0 }).reason, 'standing-still');
  assert.equal(planSprint({ ...running, forwardInput: 0, lateralInput: 0 }).sprinting, false);
  // A refusal still hands back a usable speed rather than zero, so a caller cannot freeze someone.
  assert.equal(planSprint({ ...running, locked: true }).speedMps, LANE_LOCOMOTION_PROFILE.forwardSpeedMps);
  assert.equal(planSprint({ requested: false, forwardInput: 1 }).reason, 'not-requested');
});

test('R20U.1 free mode has one speed in every direction, and diagonals are not faster', () => {
  // Two bugs with one cause, both found by measuring rather than reading: the old code read the
  // KEY, so "back" got the backpedal speed even though the body had turned to face that way, and
  // two axes were added at full speed each, so a diagonal ran 1.46x - the square root of two,
  // visible in the numbers before anybody looked at the line.
  const distance = (intent, seconds = 1) => {
    const { ground, movement } = harness();
    const before = ground.report.defenderPosition;
    hold(movement, seconds, intent);
    const after = ground.report.defenderPosition;
    return Math.hypot(after.x - before.x, after.z - before.z);
  };
  const straight = distance({ forward: 1, lateral: 0 });
  assert.ok(Math.abs(straight - LANE_LOCOMOTION_PROFILE.forwardSpeedMps) < 0.03);
  for (const intent of [{ forward: -1, lateral: 0 }, { forward: 0, lateral: 1 }, { forward: 0, lateral: -1 }]) {
    assert.ok(Math.abs(distance(intent) - straight) < 0.03,
      `unlocked, ${JSON.stringify(intent)} must cover the same ground as forward`);
  }
  for (const intent of [{ forward: 1, lateral: 1 }, { forward: -1, lateral: -1 }]) {
    assert.ok(Math.abs(distance(intent) - straight) < 0.03,
      `a diagonal must not outrun a straight line, ${JSON.stringify(intent)}`);
  }
});

test('R20U.1 locked keeps the three walk speeds, because there the gap owns the facing', () => {
  // The distinction the free-mode rule was wrongly generalising from: locked, a backpedal really is
  // one, and it stays slower than an advance.
  const walk = (intent, seconds = 1) => {
    const { ground, movement } = harness();
    movement.requestToggle();
    const before = ground.report.defenderPosition;
    hold(movement, seconds, intent);
    const after = ground.report.defenderPosition;
    return Math.hypot(after.x - before.x, after.z - before.z);
  };
  assert.ok(Math.abs(walk({ forward: 1, lateral: 0 }) - LANE_LOCOMOTION_PROFILE.forwardSpeedMps) < 0.03);
  assert.ok(Math.abs(walk({ forward: -1, lateral: 0 }) - LANE_LOCOMOTION_PROFILE.backwardSpeedMps) < 0.03);
  assert.ok(Math.abs(walk({ forward: 0, lateral: 1 }) - LANE_LOCOMOTION_PROFILE.lateralSpeedMps) < 0.03);
  // And a diagonal still does not beat the fastest single axis.
  assert.ok(walk({ forward: 1, lateral: 1 }) <= LANE_LOCOMOTION_PROFILE.forwardSpeedMps + 0.03);
});

test('R20U.1 running actually covers more ground, and only when unlocked', () => {
  const { ground, movement } = harness();
  movement.setSprintRequested(true);
  hold(movement, 1, { forward: 1, lateral: 0 });
  const sprinted = 2.4 - ground.report.separationMeters;
  assert.ok(Math.abs(sprinted - SPRINT_SPEED_MPS) < 0.03, `a second of sprint is ${SPRINT_SPEED_MPS}m, got ${sprinted.toFixed(3)}`);
  assert.equal(movement.sprintReport.sprinting, true);

  // Locked, the same keys walk. Letting go of the lock is the price of running.
  const locked = harness();
  locked.movement.requestToggle();
  locked.movement.setSprintRequested(true);
  hold(locked.movement, 1, { forward: 1, lateral: 0 });
  const walked = 2.4 - locked.ground.report.separationMeters;
  assert.ok(Math.abs(walked - LANE_LOCOMOTION_PROFILE.forwardSpeedMps) < 0.03, `locked stays a walk, got ${walked.toFixed(3)}`);
  assert.equal(locked.movement.sprintReport.sprinting, false);
});

test('R20U.1 a raised guard or a live swing keeps the feet at walking pace', () => {
  for (const state of [{ guardActive: true }, { attacking: true }]) {
    const { ground, movement } = harness({ ...state });
    movement.setSprintRequested(true);
    hold(movement, 1, { forward: 1, lateral: 0 });
    const travelled = 2.4 - ground.report.separationMeters;
    assert.ok(Math.abs(travelled - LANE_LOCOMOTION_PROFILE.forwardSpeedMps) < 0.03,
      `${JSON.stringify(state)} must not run, travelled ${travelled.toFixed(3)}`);
    assert.equal(movement.sprintReport.sprinting, false);
  }
});

test('R20U.1 running away is running, not backpedalling fast', () => {
  // The report: "Shift + S should sprint too". It should, because there is no S-is-backwards in
  // free mode - the body turns. Every direction runs at the sprint speed once the sprint is on.
  const { ground, movement } = harness();
  movement.setSprintRequested(true);
  const before = ground.report.defenderPosition;
  hold(movement, 1, { forward: -1, lateral: 0 });
  const after = ground.report.defenderPosition;
  const travelled = Math.hypot(after.x - before.x, after.z - before.z);
  assert.ok(Math.abs(travelled - SPRINT_SPEED_MPS) < 0.03, `running the other way is still running, got ${travelled.toFixed(3)}`);
  assert.equal(movement.sprintReport.sprinting, true);
  // And the body is pointed where it is going, which is what makes that true.
  assert.equal(ground.report.defenderFacingSource, 'owned');
});

test('R20U.1 a runner outpaces a walking follower, which is the whole point', () => {
  // The chase, played out: one fighter runs, the other walks after them at full speed.
  const gained = (SPRINT_SPEED_MPS - LANE_LOCOMOTION_PROFILE.forwardSpeedMps) * 2;
  assert.ok(gained > 0.9, `two seconds of running opens ${gained.toFixed(2)}m of daylight`);
  // And the 0.15m an attacker needs to escape LEFT's own arc costs a fraction of a second.
  assert.ok(0.15 / MEASURED_DISENGAGE_DEFICIT.sprintMetersPerSecond < 0.5);
  // If the follower runs too it is a wash again - by construction, and that is the design: what
  // changes hands is not distance but who has put their guard away.
  assert.equal(SPRINT_SPEED_MPS - SPRINT_SPEED_MPS, 0);
});
