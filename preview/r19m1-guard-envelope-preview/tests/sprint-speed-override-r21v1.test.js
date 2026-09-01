import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPRINT_SPEED_BRACKET_MPS,
  SPRINT_SPEED_MPS,
  SPRINT_SPEED_OVERRIDE_RANGE_MPS,
  planSprint,
  resolveSprintSpeed,
} from '../src/combat/sprint-locomotion.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';
import { readLabExperimentParameters } from '../tools/action-studio/shield-parry-r281/lab-experiment-parameters.js';
import { createParryAttemptTally } from '../tools/action-studio/shield-parry-r281/parry-attempt-tally.js';
import { createFreeMovementController } from '../src/game/free-movement-controller.js';
import { createShieldParryPlayerController } from '../src/game/player-controller.js';
import { createEngagementGround } from '../src/combat/engagement-ground.js';

// R21V.1 - sprint speed as a dial.
//
// The seed was called too slow by hand. Measured first: after R21U.1 nothing is in slow motion -
// the arms play at 1.07x and the legs at 1.42x - so what reads as slow is the ground speed, and
// 1.5 m/s is 5.4 km/h. Both ways out are blocked by something measured (the bracket ceiling is 8%
// away; past it the walk clip is driven at 1.9x), so the answer is a playtest dial rather than a
// new number, and these hold it to the two promises that makes it safe: a plain URL is unchanged,
// and a run taken under an override says so.

test('R21V.1 no override at all is the shipped seed, and absent is not zero', () => {
  // The bug this pins: `Number(null)` and `Number('')` are 0, which is finite. Clamped into the
  // range that becomes 1.0 m/s, so every plain URL would have quietly walked its sprint.
  for (const absent of [undefined, null, '', '   ', 'fast', Number.NaN]) {
    const resolved = resolveSprintSpeed(absent);
    assert.equal(resolved.speedMps, SPRINT_SPEED_MPS, `${JSON.stringify(absent)} must resolve to the seed`);
    assert.equal(resolved.reason, 'seed');
    // R22G.1: and the bracket verdict is computed from the value rather than assumed true, which
    // it was until the shipped speed moved past the ceiling.
    assert.equal(resolved.insideBracket, SPRINT_SPEED_MPS <= SPRINT_SPEED_BRACKET_MPS.ceiling);
  }
  assert.equal(readLabExperimentParameters(new URLSearchParams('')).sprintSpeedMps, SPRINT_SPEED_MPS);
  assert.equal(readLabExperimentParameters(new URLSearchParams('sprint=')).sprintSpeedMps, SPRINT_SPEED_MPS);
});

test('R21V.1 an override is taken, clamped, and judged against the measured bracket', () => {
  const inside = resolveSprintSpeed('1.62');
  assert.ok(Math.abs(inside.speedMps - SPRINT_SPEED_BRACKET_MPS.ceiling) < 1e-9);
  assert.equal(inside.insideBracket, true, 'the ceiling itself is inside');
  assert.equal(inside.reason, 'inside-the-measured-bracket');

  const past = resolveSprintSpeed('2.0');
  assert.equal(past.speedMps, 2);
  assert.equal(past.insideBracket, false);
  // Named rather than silently allowed: past the ceiling a sustained sprint out-travels the dodge's
  // own authored burst, which is the thing the bracket exists to prevent.
  assert.equal(past.reason, 'past-the-dodge-burst-ceiling');

  // The range is a guard against a typo becoming a teleport, not a design statement.
  assert.equal(resolveSprintSpeed('99').speedMps, SPRINT_SPEED_OVERRIDE_RANGE_MPS.maximum);
  assert.equal(resolveSprintSpeed('-4').speedMps, SPRINT_SPEED_OVERRIDE_RANGE_MPS.minimum);
});

test('R21V.1 the dial reaches the plan, and a refused sprint is still a walk', () => {
  const running = planSprint({ requested: true, forwardInput: 1, lateralInput: 0, speedMps: 2.2 });
  assert.equal(running.sprinting, true);
  assert.equal(running.speedMps, 2.2);

  const seeded = planSprint({ requested: true, forwardInput: 1, lateralInput: 0 });
  assert.equal(seeded.speedMps, SPRINT_SPEED_MPS, 'no dial, no change');

  // Every refusal keeps the walk speed whatever the dial says - the override moves the sprint, and
  // there is no path where it moves a walk.
  for (const state of [{ locked: true }, { guardActive: true }, { attacking: true }, { dodging: true }]) {
    const refused = planSprint({ requested: true, forwardInput: 1, lateralInput: 0, speedMps: 3, ...state });
    assert.equal(refused.sprinting, false);
    assert.equal(refused.speedMps, LANE_LOCOMOTION_PROFILE.forwardSpeedMps);
  }
});

test('R21V.1 the entry reads both dials from one module, and neither defaults to an experiment', () => {
  const plain = readLabExperimentParameters(new URLSearchParams(''));
  assert.equal(plain.tempoScale, 1, 'a plain URL is the exchange the golden grid recorded');
  assert.equal(plain.sprintSpeedMps, SPRINT_SPEED_MPS);
  // R22G.1: a plain URL is the build, and the build's sprint is deliberately past the bracket's
  // ceiling now - so "inside the bracket" is no longer the same statement as "not an experiment".
  assert.equal(plain.sprintInsideBracket, SPRINT_SPEED_MPS <= SPRINT_SPEED_BRACKET_MPS.ceiling);
  assert.equal(plain.sprintReason, 'seed', 'THIS is what says it is not an experiment');
  assert.match(plain.authority, /no-contact-authority/);

  const experiment = readLabExperimentParameters(new URLSearchParams('tempo=2&sprint=2.4'));
  assert.equal(experiment.tempoScale, 2);
  assert.equal(experiment.sprintSpeedMps, 2.4);
  assert.equal(experiment.sprintInsideBracket, false);

  // A caller with no query at all must not crash the lab into an experiment either.
  assert.equal(readLabExperimentParameters(null).sprintSpeedMps, SPRINT_SPEED_MPS);
});

test('R21V.1 a tally taken under an override says so in its own header', () => {
  const seed = createParryAttemptTally({
    conditions: () => ({ tempoScale: 1, slowReview: false, sprint: readLabExperimentParameters(new URLSearchParams('')) }),
  });
  seed.record('top', { armed: true, directionMatched: true, withinWindow: true, sequence: 1 });
  assert.match(seed.reportText, new RegExp(`^條件: 攻擊節奏 1\\.0× · 無慢動作輔助 · 衝刺 ${SPRINT_SPEED_MPS.toFixed(2)} m/s$`, 'm'));
  assert.ok(!seed.reportText.includes('非預設'), 'the seed is not an override');

  const overridden = createParryAttemptTally({
    conditions: () => ({ tempoScale: 2, slowReview: false, sprint: readLabExperimentParameters(new URLSearchParams('sprint=2.4')) }),
  });
  overridden.record('top', { armed: true, directionMatched: true, withinWindow: true, sequence: 1 });
  assert.match(overridden.reportText, /衝刺 2\.40 m\/s（非預設）/);
});

// The same harness R20U.1 runs its sprint against, so this measures ground covered rather than a
// field being copied from one object to another.
function harness(sprintSpeedMps) {
  const ground = createEngagementGround({ startSeparationMeters: 2.4 });
  const laneController = {
    get report() { return ground.report; },
    get dodgeReport() { return { dodging: false }; },
    moveDefenderWorld: (dx, dz) => ground.moveDefenderWorld(dx, dz),
    setDefenderFacing: (radians) => ground.setDefenderFacing(radians),
  };
  const movement = createFreeMovementController({
    laneController, readGuardActive: () => false, readAttacking: () => false, sprintSpeedMps,
  });
  return { ground, movement };
}

// Measured running AWAY, as R20U.1's own away-test does: advancing into the opponent meets the
// 0.9m contact floor inside the second at anything past the seed, and a clamped metre is not a
// measurement of the speed.
function metresInOneSecond(sprintSpeedMps) {
  const { ground, movement } = harness(sprintSpeedMps);
  movement.setSprintRequested(true);
  const before = ground.report.defenderPosition;
  for (let elapsed = 0; elapsed < 1 - 1e-9; elapsed += 1 / 60) { movement.update(); movement.move(1 / 60, { forward: -1, lateral: 0 }); }
  const after = ground.report.defenderPosition;
  return Math.hypot(after.x - before.x, after.z - before.z);
}

test('R21V.1 the dial moves the actual ground covered, not just a report', () => {
  assert.ok(Math.abs(metresInOneSecond(undefined) - SPRINT_SPEED_MPS) < 0.03, 'no dial, the seed');
  assert.ok(Math.abs(metresInOneSecond(2.4) - 2.4) < 0.03, 'a second at 2.4 m/s covers 2.4m');
  assert.ok(Math.abs(metresInOneSecond(1.62) - 1.62) < 0.03, 'and the bracket ceiling covers 1.62m');
});

test('R21V.1 the player controller forwards the dial without interpreting it', () => {
  // The entry hands the speed to the player controller, which composes the movement - so the join
  // that would silently drop it is this one, and it is the one the entry actually uses.
  const ground = createEngagementGround({ startSeparationMeters: 2.4 });
  const laneController = {
    get report() { return ground.report; },
    get dodgeReport() { return { dodging: false }; },
    moveDefenderWorld: (dx, dz) => ground.moveDefenderWorld(dx, dz),
    setDefenderFacing: (radians) => ground.setDefenderFacing(radians),
  };
  // inspectionCamera keeps the frame call off the THREE camera; what is under test is the feet.
  const player = createShieldParryPlayerController({
    camera: { aspect: 16 / 9 }, laneController, freeCamera: null, inspectionCamera: true, sprintSpeedMps: 2.4,
    // The defaults refuse the sprint on purpose - a caller that forgets to wire the guard gets a
    // fighter who cannot run rather than one who runs through their own guard.
    readGuardActive: () => false, readAttacking: () => false,
  });
  player.setSprintRequested(true);
  player.setMoveIntent({ forward: 1, lateral: 0 });
  player.frame(1 / 60);
  assert.equal(player.sprintReport.sprinting, true);
  assert.equal(player.sprintReport.speedMps, 2.4);
});
