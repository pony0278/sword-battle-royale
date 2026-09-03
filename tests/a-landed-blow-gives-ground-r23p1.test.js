import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENGAGEMENT_GROUND_TRANSFERS, createEngagementGround, resolveGroundTransfer } from '../src/combat/engagement-ground.js';

// R23P.1 - a landed blow gives ground.
//
// Measured before: a blow that reached the body banked the swinger's step and moved the one it
// struck by nothing, so a 2.40m stance was at the 0.90m floor after two blows and stayed there.
// The rule: the struck fighter gives back the step that was taken at them, at least the smallest
// step any swing takes, over 0.35s.

const FACING = 0; // radians: the attacker faces down the lane; the defender faces back up it at Math.PI
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('R23P.1 a hit is a transfer: the swinger keeps the step, the receiver gives it back over time', () => {
  const hit = resolveGroundTransfer('hit');
  assert.equal(hit, ENGAGEMENT_GROUND_TRANSFERS.hit);
  assert.equal(hit.swingerMeters, 0);
  assert.equal(hit.receiverGivesBackTheStep, true);
  assert.equal(hit.minimumReceiverMeters, 0.45, 'the smallest authored-or-code step, LEFT');
  assert.equal(hit.yieldSeconds, 0.35);
  assert.equal(resolveGroundTransfer('HIT'), hit, 'outcomes are case-insensitive like the others');
});

test('R23P.1 the exchange ends where it began: TOP steps in 0.86, the blow lands, the receiver yields 0.86', () => {
  const ground = createEngagementGround({ startSeparationMeters: 2.4 });
  ground.setSwing(0.86, FACING, { swinger: 'attacker' });
  assert.ok(near(ground.separationMeters, 1.54), 'mid-swing the step is live');
  const settled = ground.settleImpact('hit', { swinger: 'attacker' });
  assert.equal(settled.transfer.outcome, 'hit');
  assert.ok(near(ground.separationMeters, 1.54), 'at the blow the step is banked and nothing has been given yet');
  assert.ok(near(ground.report.yieldMeters.defender, 0.86), 'the receiver owes the step');
  ground.advanceYield(0.1);
  const partWay = ground.separationMeters;
  assert.ok(partWay > 1.54 && partWay < 2.4, `part way at 0.1s: ${partWay}`);
  assert.ok(partWay - 1.54 > 0.86 * 0.1 / 0.35, 'and eased out, so the shove is hardest first');
  ground.advanceYield(0.1); ground.advanceYield(0.1); ground.advanceYield(0.1);
  assert.ok(near(ground.separationMeters, 2.4), `back where it began: ${ground.separationMeters}`);
  assert.equal(ground.report.yieldMeters.defender, 0);
  ground.advanceYield(1);
  assert.ok(near(ground.separationMeters, 2.4), 'and nothing more is owed');
  // The swinger did not move at the blow: the step was theirs and they keep it.
  assert.ok(near(ground.report.attackerMeters, 0.86));
});

test('R23P.1 mirrored: the player\'s blow sends the opponent the other way up the same line', () => {
  const ground = createEngagementGround({ startSeparationMeters: 2.4 });
  ground.setSwing(0.45, Math.PI, { swinger: 'defender' });
  assert.ok(near(ground.separationMeters, 1.95));
  ground.settleImpact('hit', { swinger: 'defender' });
  assert.ok(near(ground.report.yieldMeters.attacker, 0.45), 'the attacker is the one who owes');
  assert.equal(ground.report.yieldMeters.defender, 0);
  ground.advanceYield(0.35);
  assert.ok(near(ground.separationMeters, 2.4), `separation ${ground.separationMeters}`);
  assert.ok(near(ground.report.defenderMeters, -0.45), 'the player kept their step');
  assert.ok(near(ground.report.attackerMeters, -0.45), 'and the opponent gave it back, away from them');
});

test('R23P.1 from the floor a blow still moves somebody: the receiver yields at least the smallest step', () => {
  const ground = createEngagementGround({ startSeparationMeters: 0.9 });
  ground.setSwing(0.86, FACING, { swinger: 'attacker' });
  assert.ok(near(ground.separationMeters, 0.9), 'the floor holds the step');
  ground.settleImpact('hit', { swinger: 'attacker' });
  ground.advanceYield(0.35);
  assert.ok(near(ground.separationMeters, 0.9 + 0.45), `off the floor: ${ground.separationMeters}`);
});

test('R23P.1 / R24E.2 a parry and a block give their measured amounts - over the reaction now, both halves', () => {
  for (const [outcome, swinger, receiver] of [['parry', -0.16, 0.05], ['block', -0.07, ENGAGEMENT_GROUND_TRANSFERS.block.receiverMeters]]) {
    const ground = createEngagementGround({ startSeparationMeters: 2.4 });
    ground.setSwing(0.86, FACING, { swinger: 'attacker' });
    ground.settleImpact(outcome, { swinger: 'attacker' });
    // R24E.2 (#34): at contact the step is banked and both throws are still owed - the swinger's
    // too, which R23P.1 had left instant.
    assert.ok(near(ground.report.attackerMeters, 0.86), `${outcome} banks the step at once`);
    assert.ok(near(ground.report.yieldMeters.attacker, swinger), `${outcome} swinger owes ${swinger}`);
    assert.ok(near(ground.report.yieldMeters.defender, receiver), `${outcome} receiver owes ${receiver}`);
    assert.ok(near(ground.report.settledSeparationMeters, 2.4 - 0.86 - swinger + receiver), `${outcome} the ledger already knows where it ends`);
    ground.advanceYield(1);
    assert.equal(ground.report.yieldMeters.attacker, 0, `${outcome} nothing owed once paid`);
    assert.ok(near(ground.report.attackerMeters, 0.86 + swinger), `${outcome} swinger ${ground.report.attackerMeters}`);
    assert.ok(near(ground.report.defenderMeters, receiver), `${outcome} receiver ${ground.report.defenderMeters}`);
    assert.ok(near(ground.report.separationMeters, ground.report.settledSeparationMeters), `${outcome} and it ended there`);
  }
});

test('R23P.1 a reset forgets ground still owed, and a second blow replaces the first debt rather than adding to it', () => {
  const ground = createEngagementGround({ startSeparationMeters: 2.4 });
  ground.setSwing(0.86, FACING, { swinger: 'attacker' });
  ground.settleImpact('hit', { swinger: 'attacker' });
  ground.advanceYield(0.1);
  ground.reset();
  assert.equal(ground.report.yieldMeters.defender, 0);
  assert.ok(near(ground.separationMeters, 2.4));
  ground.advanceYield(1);
  assert.ok(near(ground.separationMeters, 2.4), 'nothing leaks out of a reset');

  ground.setSwing(0.86, FACING, { swinger: 'attacker' });
  ground.settleImpact('hit', { swinger: 'attacker' });
  ground.advanceYield(0.05);
  ground.setSwing(0.66, FACING, { swinger: 'attacker' });
  ground.settleImpact('hit', { swinger: 'attacker' });
  assert.ok(near(ground.report.yieldMeters.defender, 0.66), 'the new blow\'s debt, not a running total');
});

test('R23P.1 the lane pays the debt each frame and both body-struck hooks settle the ground', () => {
  // Composition, read rather than run: the lane is built on a scene and the hooks live in the entry.
  const lane = readFileSync(new URL('../src/game/lane-controller.js', import.meta.url), 'utf8');
  assert.match(lane, /ground\.advanceYield\(deltaSeconds\);[^\n]*\n\s*const dodgeStep = dodge\.advance\(deltaSeconds\);/);
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /duel\.landBlowOn\(defenderFighter\.condition\); laneController\.settle\('hit'\);/);
  assert.match(entry, /duel\.landBlowOn\(attackerFighter\.condition\); laneController\.settle\('hit'\);/);
});
