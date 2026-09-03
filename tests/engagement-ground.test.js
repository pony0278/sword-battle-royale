import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENGAGEMENT_GROUND_STAGE,
  ENGAGEMENT_GROUND_TRANSFERS,
  createEngagementGround,
  resolveGroundTransfer,
} from '../src/combat/engagement-ground.js';
import {
  BLOCK_ROOT_DISPLACEMENT_PROFILES,
  PARRY_ROOT_DISPLACEMENT_PROFILES,
} from '../src/combat/parry-root-displacement.js';
import { ATTACK_ADVANCE_PROFILES } from '../src/combat/attack-advance.js';

const START = 2.4;
const ground = () => createEngagementGround({ startSeparationMeters: START });

test('R18Z.1 takes the ground each blow moves straight from the recoil profiles', () => {
  assert.equal(ENGAGEMENT_GROUND_STAGE, 'R19U.1');
  // Not transcribed: if the recoil is retuned, the ground it transfers moves with it, because they
  // are the same event described once.
  assert.equal(ENGAGEMENT_GROUND_TRANSFERS.block.receiverMeters, BLOCK_ROOT_DISPLACEMENT_PROFILES.defender.peakMeters);
  assert.equal(ENGAGEMENT_GROUND_TRANSFERS.block.swingerMeters, -BLOCK_ROOT_DISPLACEMENT_PROFILES.attacker.peakMeters);
  assert.equal(ENGAGEMENT_GROUND_TRANSFERS.parry.receiverMeters, PARRY_ROOT_DISPLACEMENT_PROFILES.defender.peakMeters);
  assert.equal(ENGAGEMENT_GROUND_TRANSFERS.parry.swingerMeters, -PARRY_ROOT_DISPLACEMENT_PROFILES.attacker.peakMeters);

  // The two outcomes have to disagree about who loses ground or the parry is not a reward.
  assert.ok(
    ENGAGEMENT_GROUND_TRANSFERS.block.receiverMeters > -ENGAGEMENT_GROUND_TRANSFERS.block.swingerMeters,
    'blocking should cost the defender more ground than it costs the attacker',
  );
  assert.ok(
    -ENGAGEMENT_GROUND_TRANSFERS.parry.swingerMeters > ENGAGEMENT_GROUND_TRANSFERS.parry.receiverMeters,
    'parrying should cost the attacker more ground than it costs the defender',
  );
  assert.equal(resolveGroundTransfer('perfect-parry'), ENGAGEMENT_GROUND_TRANSFERS.parry);
  assert.equal(resolveGroundTransfer('nonsense'), null);
});

test('R18Z.1 a swing in progress moves the attacker without banking anything', () => {
  const lane = ground();
  assert.equal(lane.separationMeters, START);

  lane.setAttackerSwing(0.3);
  assert.ok(Math.abs(lane.separationMeters - (START - 0.3)) < 1e-9, 'closing the gap is the point of a step');
  // Absolute, so the same frame twice is the same position.
  lane.setAttackerSwing(0.3);
  assert.ok(Math.abs(lane.separationMeters - (START - 0.3)) < 1e-9);
  assert.equal(lane.report.attackerGroundMeters, 0, 'nothing is banked until the blow lands');
  assert.equal(lane.report.attackerSwingMeters, 0.3);
});

test('R18Z.1 a landed blow banks the step and moves both fighters for good', () => {
  const lane = ground();
  const step = ATTACK_ADVANCE_PROFILES.left.metersByContact;
  lane.setAttackerSwing(step);
  const atContact = lane.settleImpact('block');
  lane.advanceYield(1); // R24E.2: a block's throw is given over its reaction now, like a hit's
  const settled = { ...lane.report, transfer: atContact.transfer };

  const { swingerMeters, receiverMeters } = ENGAGEMENT_GROUND_TRANSFERS.block;
  assert.ok(Math.abs(settled.attackerGroundMeters - (step + swingerMeters)) < 1e-9);
  assert.ok(Math.abs(settled.defenderMeters - receiverMeters) < 1e-9);
  assert.equal(settled.attackerSwingMeters, 0, 'the step is spent once it is banked');
  assert.equal(settled.transfer, ENGAGEMENT_GROUND_TRANSFERS.block);

  // And it survives the end of the exchange, which is the whole point: ground changes hands.
  // Before this the fighters returned to their starting marks after every blow.
  lane.settleWhiff();
  assert.ok(Math.abs(lane.separationMeters - settled.separationMeters) < 1e-9);
});

test('R19B.2 a whiffed swing leaves the attacker where their own momentum carried them', () => {
  // This asserted the opposite until R19B.2: a whiff used to hand the step back and return the
  // attacker to their mark. Being caught deep and out of position is the price of a whiff, and
  // undoing it was the system sparing a player a commitment they had made.
  const lane = ground();
  const step = ATTACK_ADVANCE_PROFILES.top.metersByContact;
  lane.setAttackerSwing(step);
  const mid = lane.separationMeters;
  lane.settleWhiff();
  assert.ok(Math.abs(lane.separationMeters - mid) < 1e-9, 'the lunge is kept, not rewound');
  assert.ok(Math.abs(lane.report.attackerGroundMeters - step) < 1e-9);
  assert.equal(lane.report.attackerSwingMeters, 0);

  // And crucially there is no rebound: a landed blow would have pushed the attacker back off the
  // shield, so whiffing leaves them closer than blocking would have.
  const blocked = createEngagementGround({ startSeparationMeters: START });
  blocked.setAttackerSwing(step);
  blocked.settleImpact('block');
  blocked.advanceYield(1);
  assert.ok(lane.separationMeters < blocked.separationMeters, 'a whiff should end closer than a block');
  assert.equal(lane.settleImpact('nonsense'), null);
});

test('R19B.2 no sequence of lunges walks the attacker through the defender', () => {
  const lane = ground();
  const min = lane.minimumSeparationMeters;
  for (let i = 0; i < 12; i += 1) {
    lane.setAttackerSwing(ATTACK_ADVANCE_PROFILES.top.metersByContact);
    lane.settleWhiff();
    assert.ok(
      lane.separationMeters >= min - 1e-9,
      `lunge ${i + 1} put them ${lane.separationMeters.toFixed(3)}m apart, inside the ${min}m floor`,
    );
  }
  assert.ok(Math.abs(lane.separationMeters - min) < 1e-9, 'and they end pinned against it');

  // The floor holds through a landed blow too, not just whiffs.
  lane.setAttackerSwing(ATTACK_ADVANCE_PROFILES.top.metersByContact);
  lane.settleImpact('block');
  assert.ok(lane.separationMeters >= min - 1e-9);
});

test('R18Z.1 the ledger is what the ground actually adds up to over an exchange', () => {
  // The measured arithmetic, stated once so it cannot drift: a blocked exchange closes the gap by
  // the attacker's step minus what the impact gives back. The step dwarfs the push, so pressure
  // accumulates and the defender has to spend their own movement to hold station. That is the
  // design, not an oversight -- attacking buys ground.
  const lane = ground();
  const step = ATTACK_ADVANCE_PROFILES.top.metersByContact;
  const givenBack = ENGAGEMENT_GROUND_TRANSFERS.block.receiverMeters
    - ENGAGEMENT_GROUND_TRANSFERS.block.swingerMeters;
  lane.setAttackerSwing(step);
  const atContact = lane.settleImpact('block');
  // R24E.2: the number is the same, and the ledger already knows it at contact - the yield only
  // decides when the feet get there.
  assert.ok(Math.abs(atContact.settledSeparationMeters - (START - step + givenBack)) < 1e-9);
  lane.advanceYield(1);
  const after = lane.report;
  assert.ok(Math.abs(after.separationMeters - (START - step + givenBack)) < 1e-9);
  assert.ok(after.separationMeters < START, 'a blocked attack still gains the attacker ground');
  assert.ok(givenBack < step, 'and the impact alone cannot pay that back');
});

test('R18Z.1 a parry hands ground back to the defender', () => {
  const lane = ground();
  const step = ATTACK_ADVANCE_PROFILES.right.metersByContact;
  lane.setAttackerSwing(step);
  const blocked = createEngagementGround({ startSeparationMeters: START });
  blocked.setAttackerSwing(step);
  blocked.settleImpact('block');
  blocked.advanceYield(1);
  lane.settleImpact('parry');
  lane.advanceYield(1);
  const parried = lane.report;
  assert.ok(
    parried.separationMeters > blocked.separationMeters,
    'the same attack parried must leave the attacker further away than blocked',
  );
});

test('R18Z.1 reset returns the lane to its stance and carries no contact authority', () => {
  const lane = ground();
  lane.setAttackerSwing(0.4);
  lane.settleImpact('block');
  assert.notEqual(lane.separationMeters, START);
  lane.reset();
  assert.equal(lane.separationMeters, START);
  assert.equal(lane.attackerMeters, 0);
  assert.equal(lane.defenderMeters, 0);
  assert.match(lane.report.authority, /no-contact-authority/);
});

test('R19B.2 a lunge in progress cannot carry the attacker inside the defender either', () => {
  // The floor used to be checked only when a step was banked, so an over-committed swing put the
  // attacker visibly inside the defender for its whole length and only snapped out at settle.
  const lane = ground();
  const min = lane.minimumSeparationMeters;
  lane.setAttackerSwing(START);
  assert.ok(Math.abs(lane.separationMeters - min) < 1e-9, 'the live swing is clamped, not just the banked one');
  assert.ok(Math.abs(lane.report.attackerSwingMeters - (START - min)) < 1e-9, 'and only the room that existed was spent');

  // Room is recomputed against where the defender is now, not where they started.
  lane.moveDefender(0.5);
  lane.setAttackerSwing(START);
  assert.ok(Math.abs(lane.separationMeters - min) < 1e-9);
  assert.ok(lane.report.attackerSwingMeters > START - min, 'backing away gives the lunge more room');
});

test('R19D.1 rebase adopts a new stance and forgets the fight that happened on the old one', () => {
  const lane = ground();
  lane.setAttackerSwing(0.5);
  lane.settleImpact('block');
  lane.moveDefender(0.3);
  assert.notEqual(lane.separationMeters, START);

  const rebased = lane.rebase(3.1);
  assert.equal(rebased.separationMeters, 3.1);
  assert.equal(rebased.startSeparationMeters, 3.1);
  assert.equal(lane.attackerMeters, 0);
  assert.equal(lane.defenderMeters, 0);

  // A junk stance keeps the current base rather than inventing one.
  lane.setAttackerSwing(0.2);
  lane.rebase('nonsense');
  assert.equal(lane.report.startSeparationMeters, 3.1);
  assert.equal(lane.separationMeters, 3.1, 'rebase still clears the fight even when the base stands');
});
