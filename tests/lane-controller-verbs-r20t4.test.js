import test from 'node:test';
import assert from 'node:assert/strict';
import { createShieldParryLaneController } from '../tools/action-studio/shield-parry-r281/lane-controller.js';
import { LONGSWORD_ATTACK_PHASES } from '../src/combat/longsword-directional-attack-runtime.js';
import { ATTACK_ADVANCE_PROFILES } from '../src/combat/attack-advance.js';
import { DODGE_DURATION_SECONDS } from '../src/combat/dodge-state.js';
import { planGuardFacingTurn } from '../src/combat/guard-facing-turn.js';
import { MINIMUM_ENGAGEMENT_SEPARATION_METERS } from '../src/combat/lane-locomotion.js';

// R20T.4 - the movement net.
//
// Every verb the lane controller composes, driven for real. The pure modules underneath are well
// covered already; what was not covered is whether this file still SPENDS what they return, and
// that is exactly the failure R20T.3 hit - planLateralStep kept working perfectly while the line
// that called it was gone, and node --check, the source tests and the golden grid all passed.
//
// The rule these follow: assert a displacement, a facing or a stamp actually changed. Never assert
// that a call appears in the source, because that is the check that already failed.

function harness(separationMeters = 2.4) {
  const stamped = [];
  const yawOffsets = [];
  const labScene = {
    engagementStance: { separationMeters },
    setLanePositions: (report) => stamped.push(report),
    setDefenderYawOffset: (radians) => yawOffsets.push(radians),
    defender: null,
    camera: null,
  };
  const laneController = createShieldParryLaneController({
    labScene,
    walkClips: { forward: 'Walking_A', backward: 'Walking_Backwards' },
    services: { captureRigPose: () => null, applyRigPose: () => {} },
  });
  return { laneController, stamped, yawOffsets };
}
// One frame, in the order the entry runs them.
function frame(laneController, { deltaSeconds = 1 / 60, elapsedSeconds = null, phase = null, plan = null } = {}) {
  if (elapsedSeconds != null) laneController.update(elapsedSeconds, phase != null, phase);
  laneController.walk(deltaSeconds, plan);
}
function swing(laneController, { direction = 'top', seconds, phase = LONGSWORD_ATTACK_PHASES.WINDUP, plan = null } = {}) {
  const step = 1 / 60;
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += step) {
    frame(laneController, { deltaSeconds: step, elapsedSeconds: elapsed + step, phase, plan });
  }
}

test('R20T.4 the step into the blow is spent into the ledger while the swing travels', () => {
  const { laneController } = harness(2.4);
  laneController.startAttack('top', 0.43);
  swing(laneController, { seconds: 0.43 });
  const closed = 2.4 - laneController.report.separationMeters;
  assert.ok(closed > 0.5, `TOP's authored ${ATTACK_ADVANCE_PROFILES.top.metersByContact}m must reach the ledger, closed ${closed.toFixed(3)}m`);
  assert.ok(closed <= ATTACK_ADVANCE_PROFILES.top.metersByContact + 1e-6, 'and never more than the clip authorises');
});

test('R20T.4 a whiffed swing banks its step instead of snapping the attacker home', () => {
  // R19B.2: the ground a lunge took is kept, which is what makes repeated whiffs a way in.
  const { laneController } = harness(2.4);
  laneController.startAttack('top', 0.43);
  swing(laneController, { seconds: 0.43 });
  const atContact = laneController.report.separationMeters;
  laneController.endExchange();
  frame(laneController, {});
  assert.ok(Math.abs(laneController.report.separationMeters - atContact) < 0.02,
    'the step survives the exchange ending');
  assert.ok(laneController.report.attackerGroundMeters > 0.5, 'and is banked as ground rather than left in the swing');
});

test('R20T.4 the attacker own feet stop while their swing is still travelling', () => {
  // R19B.1: the step owns those frames. Both driving at once doubles every measured band.
  const { laneController } = harness(2.4);
  laneController.setAttackerIntent(-1); // walk forward, into the defender
  laneController.startAttack('top', 0.43);
  // The lock answers "is a swing travelling", and the frame loop is what declares that - starting
  // an attack is not the same instant as the first frame of it.
  assert.equal(laneController.attackerFeetLocked, false, 'not locked before the first frame of the swing');
  swing(laneController, { seconds: 0.2 });
  assert.equal(laneController.attackerFeetLocked, true, 'locked while the step is still being spent');
  const withSwing = laneController.report.attackerGroundMeters;
  assert.equal(withSwing, 0, 'ground is untouched while the swing owns the movement');
  laneController.endExchange();
  for (let i = 0; i < 30; i += 1) frame(laneController, {});
  assert.ok(laneController.report.attackerGroundMeters > 0.4, 'and the feet take over once it is over');
});

test('R20T.4 the guard turn reaches the scene, and stands down when the plan stops arriving', () => {
  const { laneController, yawOffsets } = harness(2.4);
  const before = laneController.defenderFacingYawRadians;
  assert.equal(before, 0);
  // A fresh plan object each frame is what "the guard is working" looks like to this runtime.
  for (let i = 0; i < 30; i += 1) {
    frame(laneController, { plan: planGuardFacingTurn({ direction: 'left', engaged: true, posture: 'chase' }) });
  }
  const turned = laneController.defenderFacingYawRadians;
  assert.ok(Math.abs(turned) > 0.01, `the turn must reach the yaw, got ${turned}`);
  assert.ok(Math.abs(yawOffsets.at(-1) - turned) < 1e-9, 'and be stamped on the scene, not just held');
  // The same plan object twice means the exchange is over: the body stands back up on its own.
  const stale = planGuardFacingTurn({ direction: 'left', engaged: true, posture: 'chase' });
  for (let i = 0; i < 60; i += 1) frame(laneController, { plan: stale });
  assert.ok(Math.abs(laneController.defenderFacingYawRadians) < Math.abs(turned) / 2, 'a repeated plan stands the turn down');
});

test('R20T.4 the attacker facing tracks through the windup and freezes for the active window', () => {
  // R20B.1 track-then-freeze, which is what makes a sidestep mid-swing stepped away from.
  const { laneController } = harness(2.4);
  laneController.setDefenderLateralIntent(1);
  for (let i = 0; i < 60; i += 1) frame(laneController, {}); // open a real bearing first
  laneController.setDefenderLateralIntent(0);
  assert.ok(Math.abs(laneController.report.defenderBearingRadians) > 0.05, 'the test needs an angle to track');

  laneController.startAttack('top', 0.43);
  const beforeWindup = laneController.attackerBaseFacingRadians;
  swing(laneController, { seconds: 0.2, phase: LONGSWORD_ATTACK_PHASES.WINDUP });
  const afterWindup = laneController.attackerBaseFacingRadians;
  assert.ok(Math.abs(afterWindup - beforeWindup) > 1e-4, 'the windup tracks');

  laneController.setDefenderLateralIntent(1); // keep the bearing moving under them
  swing(laneController, { seconds: 0.2, phase: LONGSWORD_ATTACK_PHASES.ACTIVE });
  assert.ok(Math.abs(laneController.attackerBaseFacingRadians - afterWindup) < 1e-9,
    'and the active window does not - the release point is frozen');
});

test('R20T.4 all four dodges travel, in the directions they are named', () => {
  // Screen-relative signs: the defender faces -z, so their right is world +x (R20T.3).
  const cases = [
    ['right', (report) => report.defenderPosition.x > 0.3],
    ['left', (report) => report.defenderPosition.x < -0.3],
    ['forward', (report) => report.separationMeters < 2.4 - 0.1],
    ['back', (report) => report.separationMeters > 2.4 + 0.3],
  ];
  for (const [direction, holds] of cases) {
    const { laneController } = harness(2.4);
    assert.equal(laneController.tryDodge(direction).accepted, true, `${direction} must be accepted from neutral`);
    const step = 1 / 60;
    for (let elapsed = 0; elapsed < DODGE_DURATION_SECONDS + 0.1; elapsed += step) frame(laneController, { deltaSeconds: step });
    assert.ok(holds(laneController.report), `${direction} dodge went nowhere: ${JSON.stringify(laneController.report.defenderPosition)}`);
  }
});

test('R20T.4 the ledger clamp holds through every verb that can close the gap', () => {
  // Nothing may walk, dodge or lunge through an opponent - the swept probes stop meaning anything
  // if a blade can start behind the shield.
  const { laneController } = harness(1.2);
  laneController.setDefenderIntent(-1);
  for (let i = 0; i < 120; i += 1) frame(laneController, {});
  laneController.tryDodge('forward');
  for (let i = 0; i < 60; i += 1) frame(laneController, {});
  laneController.startAttack('top', 0.43);
  swing(laneController, { seconds: 0.43 });
  assert.ok(laneController.report.separationMeters >= MINIMUM_ENGAGEMENT_SEPARATION_METERS - 1e-9,
    `clamped, got ${laneController.report.separationMeters}`);
});

test('R20T.4 resetLane forgets the ground and the turn, and keeps the held keys', () => {
  const { laneController } = harness(2.4);
  laneController.setDefenderLateralIntent(1);
  laneController.setDefenderIntent(1);
  for (let i = 0; i < 60; i += 1) {
    frame(laneController, { plan: planGuardFacingTurn({ direction: 'left', engaged: true, posture: 'chase' }) });
  }
  assert.ok(Math.abs(laneController.report.defenderPosition.x) > 0.1);
  laneController.resetLane();
  assert.ok(Math.abs(laneController.report.defenderPosition.x) < 1e-9, 'lateral ground forgotten');
  assert.equal(laneController.defenderFacingYawRadians, 0, 'the guard turn forgotten');
  assert.equal(laneController.defenderIntent, 1, 'a held walk key survives - the player is still holding it');
});

test('R20T.4 the contact floor lives on the ledger, so a dodge cannot walk through it', () => {
  // The defect this test was written by: walking stopped at the floor only because the walk
  // PLANNER refused to close past it. A forward dodge does not go through that planner, so it
  // carried the defender 25cm inside the floor - and inside it the swept probes stop meaning
  // anything, because a blade can start behind the shield it is resolved against.
  const { laneController } = harness(1.2);
  laneController.setDefenderIntent(-1);
  for (let i = 0; i < 120; i += 1) frame(laneController, {});
  assert.ok(Math.abs(laneController.report.separationMeters - MINIMUM_ENGAGEMENT_SEPARATION_METERS) < 1e-6,
    'walking stops exactly on the floor');
  laneController.setDefenderIntent(0);
  laneController.tryDodge('forward');
  const step = 1 / 60;
  for (let elapsed = 0; elapsed < DODGE_DURATION_SECONDS + 0.1; elapsed += step) frame(laneController, { deltaSeconds: step });
  assert.ok(laneController.report.separationMeters >= MINIMUM_ENGAGEMENT_SEPARATION_METERS - 1e-9,
    `a dodge into the floor must stop at it, got ${laneController.report.separationMeters}`);
  // And the dodge still travels when it has room, so the clamp did not simply disable it.
  const { laneController: roomy } = harness(3.0);
  roomy.tryDodge('forward');
  for (let elapsed = 0; elapsed < DODGE_DURATION_SECONDS + 0.1; elapsed += step) frame(roomy, { deltaSeconds: step });
  assert.ok(roomy.report.separationMeters < 2.9, 'with room, a forward dodge closes the gap');
});
