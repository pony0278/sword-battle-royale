// R24E.2 — the ground a block or parry moves is given over the reaction (#34).
//
// Measured on the contact frame of a blocked RIGHT swing, both ways round, at 60Hz: both
// fighters' lane positions stepped at once - 70mm for the swinger, 90mm for the one who blocked -
// and the root-bone recoil then rose by the same amounts over the next four frames. The whole body
// jumped, then travelled the same distance again. A hit's ground has been paid over time since
// R23P.1; the block's and the parry's were still handed over in one frame, the swinger's throw
// included.
//
// Now every transfer with a yield pays BOTH halves over it, and the yield runs as long as the
// recoil profile whose peak it mirrors, so the feet move while the body is visibly reacting and
// are done before the swinger's action drops (18 frames after contact). The ledger knows where the
// exchange ends the moment the blow lands, and that - not wherever the yield has got to when a
// line is written - is what the swing log reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENGAGEMENT_GROUND_TRANSFERS, createEngagementGround } from '../src/combat/engagement-ground.js';
import { BLOCK_ROOT_DISPLACEMENT_PROFILES, PARRY_ROOT_DISPLACEMENT_PROFILES } from '../src/combat/parry-root-displacement.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const reaction = (p) => (p.riseMs + p.holdMs + p.recoverMs) / 1000;

test('R24E.2 a block and a parry yield for as long as the recoil they mirror, and both halves are owed', () => {
  assert.ok(near(ENGAGEMENT_GROUND_TRANSFERS.block.yieldSeconds, reaction(BLOCK_ROOT_DISPLACEMENT_PROFILES.attacker)));
  assert.ok(near(ENGAGEMENT_GROUND_TRANSFERS.parry.yieldSeconds, reaction(PARRY_ROOT_DISPLACEMENT_PROFILES.attacker)));
  assert.ok(ENGAGEMENT_GROUND_TRANSFERS.block.yieldSeconds < 18 / 60, 'paid before the swinger\'s action drops');
  assert.ok(ENGAGEMENT_GROUND_TRANSFERS.parry.yieldSeconds < 18 / 60);
  for (const outcome of ['block', 'parry']) {
    const g = createEngagementGround({ startSeparationMeters: 2.4 });
    g.setAttackerSwing(0.66);
    const atContact = g.settleImpact(outcome);
    const t = ENGAGEMENT_GROUND_TRANSFERS[outcome];
    assert.ok(near(atContact.separationMeters, 2.4 - 0.66), `${outcome}: nobody has moved on the contact frame itself`);
    assert.ok(near(atContact.yieldMeters.attacker, t.swingerMeters), `${outcome}: the swinger's throw is owed`);
    assert.ok(near(atContact.yieldMeters.defender, t.receiverMeters), `${outcome}: and the receiver's ground`);
  }
});

test('R24E.2 the yield is eased out and finishes exactly, so no frame is a step and the sum is the total', () => {
  const g = createEngagementGround({ startSeparationMeters: 2.4 });
  g.setAttackerSwing(0.66);
  g.settleImpact('block');
  const total = 0.07 + 0.09;
  let previous = g.report.separationMeters;
  let largest = 0;
  for (let i = 0; i < 20; i += 1) {
    g.advanceYield(1 / 60);
    const step = g.report.separationMeters - previous;
    assert.ok(step >= -1e-12, 'the gap only opens');
    largest = Math.max(largest, step);
    previous = g.report.separationMeters;
  }
  assert.ok(largest < 0.03, `the largest single-frame step should be a few centimetres, got ${largest}`);
  assert.ok(largest > 0.01, 'and the first frames carry the most, because the shove is hardest at the blow');
  assert.ok(near(g.report.separationMeters, 2.4 - 0.66 + total), 'paid in full');
  assert.equal(g.report.yieldMeters.attacker, 0);
  assert.equal(g.report.yieldMeters.defender, 0);
});

test('R24E.2 the ledger knows where the exchange ends at contact, and that is what the log line reads', () => {
  const g = createEngagementGround({ startSeparationMeters: 2.4 });
  g.setAttackerSwing(0.66);
  const atContact = g.settleImpact('block');
  const end = 2.4 - 0.66 + 0.16;
  assert.ok(near(atContact.settledSeparationMeters, end));
  g.advanceYield(0.05);
  assert.ok(g.report.separationMeters < end - 0.01, 'the feet are still on their way');
  assert.ok(near(g.report.settledSeparationMeters, end), 'the ledger is not');
  g.advanceYield(1);
  assert.ok(near(g.report.separationMeters, end));
  // The mirror: a defender-thrown blow settles the other way up the same line, to the same gap.
  const m = createEngagementGround({ startSeparationMeters: 2.4 });
  m.setSwing(0.66, Math.PI, { swinger: 'defender' });
  assert.ok(near(m.settleImpact('block', { swinger: 'defender' }).settledSeparationMeters, end));
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.equal((entry.match(/separationMeters: laneController\.settledSeparationMeters, receiverStaggered/g) || []).length, 2, 'both swing-log lines read the settled gap');
});
