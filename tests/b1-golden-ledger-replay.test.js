import test from 'node:test';
import assert from 'node:assert/strict';

import { createEngagementGround, resolveGroundTransfer } from '../src/combat/engagement-ground.js';
import { planEngagementStance } from '../src/combat/engagement-spacing.js';
import { planLaneStep } from '../src/combat/lane-locomotion.js';
import { planAttackAdvance, sampleAttackAdvance } from '../src/combat/attack-advance.js';

// B1 golden baseline: the lane's numbers, frozen before the ground state learns about x.
//
// Stage B1 re-founds positions as (x, z) + yaw with x forced to zero, and its acceptance
// criterion is that NOTHING here moves: with both fighters on the line, every ledger value,
// stance coordinate, step clamp, transfer, and advance sample must come out bit-identical to
// the 1D implementation these literals were captured from (ec631a2, suite 850/850). The values
// are pasted as literals on purpose - a golden test that recomputes its own expectations
// verifies nothing.
//
// If a B1 refactor breaks this test, the refactor is wrong, full stop. After B1 lands, this
// file stays: it pins the bearing-zero slice that every pre-B measurement lives in, and stage
// B2's lateral movement must leave the on-line case exactly here.

function close(actual, expected, epsilon = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !== ${expected}`);
}

test('B1 golden: stance geometry is symmetric about the origin along z, facing constants intact', () => {
  for (const [s, az, dz] of [[1.4, -0.7, 0.7], [2.4, -1.2, 1.2], [3.5, -1.75, 1.75]]) {
    const p = planEngagementStance(s);
    assert.deepEqual(p.attacker.position, { x: 0, y: 0, z: az }, `attacker @ ${s}`);
    assert.deepEqual(p.defender.position, { x: 0, y: 0, z: dz }, `defender @ ${s}`);
    assert.equal(p.attacker.facingRadians, 0);
    assert.equal(p.defender.facingRadians, Math.PI);
  }
});

test('B1 golden: a scripted exchange replays the ledger bit-for-bit', () => {
  const g = createEngagementGround({ startSeparationMeters: 2.4 });
  const expect = (label, sep, am, dm) => {
    close(g.report.separationMeters, sep, 0);
    close(g.attackerMeters, am, 0);
    close(g.defenderMeters, dm, 0);
  };
  expect('start', 2.4, 0, 0);
  g.moveDefender(-0.25);
  expect('defender closes', 2.15, 0, -0.25);
  g.moveAttacker(-0.4);
  expect('attacker closes', 1.75, 0.4, -0.25);
  g.setAttackerSwing(0.6);
  expect('swing 0.6', 1.15, 1, -0.25);
  // The pushbox clamps the swing: requested 0.862, room allows 1.25 total attacker travel.
  g.setAttackerSwing(0.862);
  expect('swing clamped at pushbox', 0.8999999999999999, 1.25, -0.25);
  // A block settles the transfers in full: attacker thrown back 0.07, defender gives 0.09.
  g.settleImpact('block');
  expect('block settles', 1.0599999999999996, 1.1800000000000002, -0.16);
  g.moveDefender(0.3);
  expect('defender retreats', 1.3599999999999999, 1.1800000000000002, 0.13999999999999999);
  g.setAttackerSwing(0.9);
  expect('second swing clamped', 0.8999999999999999, 1.6400000000000001, 0.13999999999999999);
  // A whiff banks the swing as ground gained and moves nobody.
  g.settleWhiff();
  expect('whiff settles', 0.8999999999999999, 1.6400000000000001, 0.13999999999999999);
  g.rebase(1.8);
  expect('rebase', 1.8, 0, 0);
});

test('B1 golden: lane steps, clamps, and both ground transfers', () => {
  const a = planLaneStep({ intent: -1, deltaSeconds: 0.1, separationMeters: 2.0 });
  close(a.meters, -0.1, 0); assert.equal(a.clamped, false);
  const b = planLaneStep({ intent: -1, deltaSeconds: 0.5, separationMeters: 1.0 });
  close(b.meters, -0.09999999999999998, 0); assert.equal(b.clamped, true);
  const c = planLaneStep({ intent: 1, deltaSeconds: 0.25, separationMeters: 1.2 });
  close(c.meters, 0.1875, 0); assert.equal(c.clamped, false);

  // R23C.1: the TRANSFER is named by role now (the swinger is thrown, the one who answered gives
  // ground). The ledger's own report keeps attackerMeters/defenderMeters above, because those are
  // POSITIONS - which fighter stands where - and a position does not change hands mid-exchange.
  const block = resolveGroundTransfer('block');
  close(block.swingerMeters, -0.07, 0); close(block.receiverMeters, 0.09, 0);
  const parry = resolveGroundTransfer('parry');
  close(parry.swingerMeters, -0.16, 0); close(parry.receiverMeters, 0.05, 0);
});

test('B1 golden: the authored advance curve samples where it always has', () => {
  const plan = planAttackAdvance({ direction: 'top', contactSeconds: 0.43 });
  close(sampleAttackAdvance(plan, 0).advanceMeters, 0, 0);
  close(sampleAttackAdvance(plan, 0.2).advanceMeters, 0.3859685310727358, 0);
  close(sampleAttackAdvance(plan, 0.43).advanceMeters, 0.862, 0);
  close(sampleAttackAdvance(plan, 0.9).advanceMeters, 0.862, 0);
});
