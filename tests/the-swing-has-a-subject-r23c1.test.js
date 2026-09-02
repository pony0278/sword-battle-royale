import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngagementGround, ENGAGEMENT_GROUND_TRANSFERS } from '../src/combat/engagement-ground.js';
import { createShieldParryLaneController } from '../src/game/lane-controller.js';
import { LONGSWORD_ATTACK_PHASES } from '../src/combat/longsword-directional-attack-runtime.js';

// R23C.1 - the swing gets a subject, and the only test that can prove it.
//
// The three gates cannot. Every cell of the golden grid, the parry gate and the defence matrix
// swings the ATTACKER, so an arithmetic path that only the defender's swing reaches is invisible
// to all of them - they reproduced this stage's every intermediate state to the last bit while a
// sign error sat in the mirror half, unreached. That is the exact shape of "inert by construction"
// looking like "verified", and it is why this file drives the half nobody else does.
//
// The claim under test: with the two fighters mirror images of each other, a blow thrown by the
// defender puts both bodies where a blow thrown by the attacker would have put them, reflected.
//
// TOLERANCE, and why it is not zero. The attacker swinging straight down the lane takes the
// ledger's exact legacy branch: facing zero, cos(0) is exactly 1 and sin(0) exactly 0. The mirror
// of that facing is pi, and Math.sin(Math.PI) is 1.2246e-16 rather than 0 - so the defender's
// straight-down-the-lane swing goes through the general ray-versus-disc solve instead. The two
// agree to within that 1e-16 of leaked lateral, and the branch condition is deliberately NOT
// loosened to catch it: `ux === 0` is the condition the golden replay was measured under and it
// stays exact. So the mirror is exact to floating point, not to the bit, and says so.
const MIRROR_TOLERANCE_METERS = 1e-12;

const STANCE_METERS = 2.4;
const SWING_METERS = 0.7;

function ground() {
  return createEngagementGround({ startSeparationMeters: STANCE_METERS });
}

// The two positions of one report, reflected through the origin - which is what a mirror of this
// stance is: the fighters start at -S/2 and +S/2, so swapping them is negating both coordinates.
function reflect(report) {
  return {
    swinger: { x: -report.defenderPosition.x, z: -report.defenderPosition.z },
    receiver: { x: -report.attackerPosition.x, z: -report.attackerPosition.z },
  };
}
function asRoles(report) {
  return {
    swinger: { x: report.attackerPosition.x, z: report.attackerPosition.z },
    receiver: { x: report.defenderPosition.x, z: report.defenderPosition.z },
  };
}
function assertMirrored(attackerSide, defenderSide, what) {
  for (const role of ['swinger', 'receiver']) {
    for (const axis of ['x', 'z']) {
      const a = attackerSide[role][axis];
      const b = defenderSide[role][axis];
      assert.ok(Math.abs(a - b) <= MIRROR_TOLERANCE_METERS,
        `${what}: the ${role}'s ${axis} is ${b} thrown by the defender and ${a} thrown by the `
        + `attacker, off by ${Math.abs(a - b)}`);
    }
  }
}

test('R23C.1 a swing thrown from either slot lands the same blow, mirrored', () => {
  for (const outcome of ['block', 'parry']) {
    // Attacker swings: facing zero is straight down the lane at the defender.
    const byAttacker = ground();
    byAttacker.setSwing(SWING_METERS, 0);
    const attackerSide = asRoles(byAttacker.settleImpact(outcome));

    // Defender swings: facing pi is straight down the lane at the attacker.
    const byDefender = ground();
    byDefender.setSwing(SWING_METERS, Math.PI, { swinger: 'defender' });
    const defenderSide = reflect(byDefender.settleImpact(outcome, { swinger: 'defender' }));

    assertMirrored(attackerSide, defenderSide, `a settled ${outcome}`);
    // And the swing itself carried the swinger TOWARD the other one rather than away, which is the
    // sign a mirror test can otherwise pass by being symmetrically wrong in both halves.
    assert.ok(attackerSide.swinger.z > -STANCE_METERS / 2,
      `a ${outcome} must leave the attacker having closed some of the gap, not opened it`);
  }
});

test('R23C.1 a defender lunging closes the gap, and stops at the same contact floor', () => {
  const led = ground();
  const before = led.report.separationMeters;
  led.setSwing(SWING_METERS, Math.PI, { swinger: 'defender' });
  assert.ok(led.report.separationMeters < before - 0.5,
    `a defender's lunge must close the gap, got ${led.report.separationMeters} from ${before}`);
  // Nobody swings through anybody, from either side.
  const deep = ground();
  deep.setSwing(99, Math.PI, { swinger: 'defender' });
  assert.ok(deep.report.separationMeters >= deep.minimumSeparationMeters - 1e-12,
    `an over-committed defender lunge stops at the floor, got ${deep.report.separationMeters}`);
  const deepAttacker = ground();
  deepAttacker.setSwing(99, 0);
  assert.ok(Math.abs(deep.report.separationMeters - deepAttacker.report.separationMeters) <= MIRROR_TOLERANCE_METERS,
    'and stops at the same place from either side');
});

test('R23C.1 a whiff banks the swinger\'s own step, whichever slot swung', () => {
  const byAttacker = ground();
  byAttacker.setSwing(SWING_METERS, 0);
  const attackerSide = asRoles(byAttacker.settleWhiff());
  const byDefender = ground();
  byDefender.setSwing(SWING_METERS, Math.PI, { swinger: 'defender' });
  const defenderSide = reflect(byDefender.settleWhiff({ swinger: 'defender' }));
  assertMirrored(attackerSide, defenderSide, 'a whiff');
  // The receiver never moved: a whiff is one fighter's commitment and nobody else's.
  assert.equal(attackerSide.receiver.z, STANCE_METERS / 2);
});

test('R23C.1 the transfer table names roles, and both roles are spent', () => {
  for (const outcome of ['block', 'parry']) {
    const transfer = ENGAGEMENT_GROUND_TRANSFERS[outcome];
    assert.ok(transfer.swingerMeters < 0, `${outcome} throws the swinger back`);
    assert.ok(transfer.receiverMeters > 0, `${outcome} costs the receiver ground`);
  }
  // A parry throws the swinger harder than a block does and costs the one who answered less -
  // the asymmetry the whole defence rests on, now stated in role terms rather than slot terms.
  assert.ok(Math.abs(ENGAGEMENT_GROUND_TRANSFERS.parry.swingerMeters)
    > Math.abs(ENGAGEMENT_GROUND_TRANSFERS.block.swingerMeters));
  assert.ok(ENGAGEMENT_GROUND_TRANSFERS.parry.receiverMeters
    < ENGAGEMENT_GROUND_TRANSFERS.block.receiverMeters);
});

// --- the lane controller's half: whose feet the swing owns -------------------------------------

function laneHarness(separationMeters = STANCE_METERS) {
  const labScene = {
    engagementStance: { separationMeters },
    setLanePositions: () => {},
    setDefenderYawOffset: () => {},
    defender: null,
    camera: null,
  };
  return createShieldParryLaneController({
    labScene,
    walkClips: { forward: 'Walking_A', backward: 'Walking_Backwards' },
    services: { captureRigPose: () => null, applyRigPose: () => {} },
  });
}

test('R23C.1 the swing holds its own feet, whichever fighter committed it', () => {
  const lane = laneHarness();
  lane.setDefenderIntent(-1);
  lane.setAttackerIntent(-1);
  assert.equal(lane.swingingSlot, 'attacker', 'nobody having swung, the attacker is the default');

  lane.startAttack('top', 0.43);
  lane.update(1 / 60, true, LONGSWORD_ATTACK_PHASES.WINDUP);
  const attackerSwinging = lane.walk(1 / 60, null);
  assert.equal(lane.attackerFeetLocked, true, 'the attacker committed, so the attacker is held');
  assert.equal(lane.defenderFeetLocked, false, 'the defender committed nothing and keeps walking');
  assert.notEqual(attackerSwinging.defenderStep.meters, 0);
  lane.endExchange();

  lane.startAttack('top', 0.43, { swinger: 'defender' });
  assert.equal(lane.swingingSlot, 'defender');
  lane.update(1 / 60, true, LONGSWORD_ATTACK_PHASES.WINDUP);
  const defenderSwinging = lane.walk(1 / 60, null);
  assert.equal(lane.defenderFeetLocked, true, 'the defender committed, so the defender is held');
  assert.equal(lane.attackerFeetLocked, false, 'and the attacker is free to walk');
  assert.equal(defenderSwinging.defenderStep.meters, 0, 'held feet take no step');
  assert.notEqual(defenderSwinging.attackerStep, null, 'the free one still walks');
});

test('R23C.1 a defender-thrown swing moves the defender on the ledger, not the attacker', () => {
  const lane = laneHarness();
  const start = lane.report;
  lane.startAttack('top', 0.43, { swinger: 'defender' });
  for (let i = 1; i <= 26; i += 1) {
    lane.update(i / 60, true, LONGSWORD_ATTACK_PHASES.ACTIVE);
    lane.walk(1 / 60, null);
  }
  const mid = lane.report;
  assert.ok(mid.defenderSwingMeters !== 0, 'the swing was banked into the defender\'s slot');
  assert.equal(mid.attackerSwingMeters, 0, 'and not into the attacker\'s');
  assert.ok(mid.defenderPosition.z < start.defenderPosition.z,
    `a defender's lunge carries them toward the attacker, got ${mid.defenderPosition.z}`);
  assert.ok(mid.separationMeters < start.separationMeters, 'so the gap closes');
  // And the exchange settles onto the right pair of shoulders.
  const settled = lane.settle('parry');
  assert.ok(settled.defenderPosition.z > mid.defenderPosition.z,
    'a parried swinger is thrown back the way they came');
  assert.ok(settled.attackerPosition.z < start.attackerPosition.z,
    'and the one who answered gives a little ground of their own');
});

test('R23C.1 the exchange forgets its subject when it ends', () => {
  const lane = laneHarness();
  lane.startAttack('top', 0.43, { swinger: 'defender' });
  lane.endExchange();
  assert.equal(lane.swingingSlot, 'attacker',
    'a finished exchange leaves no owner behind for the next one to inherit');
  lane.startAttack('top', 0.43, { swinger: 'defender' });
  lane.resetLane();
  assert.equal(lane.swingingSlot, 'attacker', 'and a lane reset forgets it too');
});
