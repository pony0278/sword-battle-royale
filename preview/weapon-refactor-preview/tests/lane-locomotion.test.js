import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LANE_LOCOMOTION_PROFILE,
  LANE_LOCOMOTION_STAGE,
  MINIMUM_ENGAGEMENT_SEPARATION_METERS,
  createLaneLocomotionRuntime,
  normalizeLaneIntent,
  planLaneStep,
} from '../src/combat/lane-locomotion.js';
import { ATTACK_ADVANCE_PROFILES } from '../src/combat/attack-advance.js';
import { ENGAGEMENT_GROUND_TRANSFERS } from '../src/combat/engagement-ground.js';

test('R19A.1 stays under the fastest travel the character was actually authored with', () => {
  assert.equal(LANE_LOCOMOTION_STAGE, 'R19A.1');
  // Dodge_Backward is the only KayKit clip carrying real root motion: 0.650m in 0.40s.
  assert.equal(LANE_LOCOMOTION_PROFILE.authoredBurstCeilingMps, 1.62);
  assert.ok(LANE_LOCOMOTION_PROFILE.forwardSpeedMps < LANE_LOCOMOTION_PROFILE.authoredBurstCeilingMps);
  assert.ok(LANE_LOCOMOTION_PROFILE.backwardSpeedMps < LANE_LOCOMOTION_PROFILE.forwardSpeedMps,
    'backpedalling is slower than walking, and a defender who retreats as fast as an attacker advances cannot be pressured');
});

test('R19A.1 a defender can outpace the ground a blocked exchange costs them', () => {
  // The requirement this speed exists to meet. A blocked exchange closes the gap by the attacker's
  // step minus what the impact gives back; the defender has to find that back with their feet.
  const givenBack = ENGAGEMENT_GROUND_TRANSFERS.block.receiverMeters
    - ENGAGEMENT_GROUND_TRANSFERS.block.swingerMeters;
  const worstDebt = Math.max(...Object.values(ATTACK_ADVANCE_PROFILES).map((p) => p.metersByContact)) - givenBack;
  const recoveredPerSecond = LANE_LOCOMOTION_PROFILE.backwardSpeedMps;
  assert.ok(
    recoveredPerSecond > worstDebt,
    `retreating covers ${recoveredPerSecond}m/s against a worst-case debt of ${worstDebt.toFixed(3)}m per exchange`,
  );
});

test('R19A.1 intent is a direction, not a magnitude', () => {
  for (const [input, expected] of [[1, 1], [0.2, 1], [99, 1], [-1, -1], [-0.01, -1], [0, 0], [null, 0], ['x', 0]]) {
    assert.equal(normalizeLaneIntent(input), expected, String(input));
  }
});

test('R19A.1 travel is speed times time, and the two directions differ', () => {
  const closing = planLaneStep({ intent: -1, deltaSeconds: 0.5, separationMeters: 3 });
  const opening = planLaneStep({ intent: 1, deltaSeconds: 0.5, separationMeters: 3 });
  assert.ok(Math.abs(closing.meters + LANE_LOCOMOTION_PROFILE.forwardSpeedMps * 0.5) < 1e-9);
  assert.ok(Math.abs(opening.meters - LANE_LOCOMOTION_PROFILE.backwardSpeedMps * 0.5) < 1e-9);
  assert.ok(Math.abs(closing.meters) > Math.abs(opening.meters), 'closing is the faster direction');
  assert.equal(planLaneStep({ intent: 0, deltaSeconds: 0.5, separationMeters: 3 }).meters, 0);
  assert.equal(planLaneStep({ intent: -1, deltaSeconds: 0, separationMeters: 3 }).meters, 0);
});

test('R19A.1 nobody walks through their opponent', () => {
  const min = MINIMUM_ENGAGEMENT_SEPARATION_METERS;
  // Half a metre of room, asked for a full second of closing.
  const step = planLaneStep({ intent: -1, deltaSeconds: 1, separationMeters: min + 0.5 });
  assert.ok(Math.abs(step.meters + 0.5) < 1e-9, 'only the room that exists may be spent');
  assert.equal(step.clamped, true);
  assert.ok(Math.abs(step.requestedMeters) > Math.abs(step.meters));

  const pinned = planLaneStep({ intent: -1, deltaSeconds: 1, separationMeters: min });
  assert.equal(pinned.meters, 0);
  assert.equal(pinned.atMinimumSeparation, true);

  // Backing away from the minimum is always allowed -- that is the way out.
  const retreat = planLaneStep({ intent: 1, deltaSeconds: 1, separationMeters: min });
  assert.ok(retreat.meters > 0);
  assert.equal(retreat.clamped, false);
});

test('R19A.1 an unknown separation does not invent a wall', () => {
  const step = planLaneStep({ intent: -1, deltaSeconds: 1 });
  assert.ok(Math.abs(step.meters + LANE_LOCOMOTION_PROFILE.forwardSpeedMps) < 1e-9);
  assert.equal(step.clamped, false);
});

test('R19A.1 the runtime holds intent across frames and gives it up on reset', () => {
  const runtime = createLaneLocomotionRuntime();
  assert.equal(runtime.intent, 0);
  runtime.setIntent(-1);
  assert.equal(runtime.intent, -1);

  const a = runtime.update({ deltaSeconds: 0.1, separationMeters: 3 });
  const b = runtime.update({ deltaSeconds: 0.1, separationMeters: 3 });
  assert.equal(a.meters, b.meters, 'a held key travels the same distance each equal frame');
  assert.ok(a.meters < 0);

  runtime.reset();
  assert.equal(runtime.intent, 0);
  assert.equal(runtime.update({ deltaSeconds: 0.1, separationMeters: 3 }).meters, 0);
});

test('R19A.1 carries no authority over contact', () => {
  assert.match(planLaneStep({ intent: 1, deltaSeconds: 0.1 }).authority, /no-contact-authority/);
  assert.match(LANE_LOCOMOTION_PROFILE.authority, /no-contact-authority/);
});

test('R19B.1 both fighters express travel as a change in the gap, not a direction on the lane', async () => {
  // The one asymmetry in the lane: the defender opens the gap by moving away from the origin and
  // the attacker opens it by moving toward it. Both ledger methods take the change in separation
  // so callers never have to know which way that is, and this pins that they agree.
  const { createEngagementGround } = await import('../src/combat/engagement-ground.js');
  const start = 2.4;
  const closing = planLaneStep({ intent: -1, deltaSeconds: 0.5, separationMeters: start });

  const byDefender = createEngagementGround({ startSeparationMeters: start });
  byDefender.moveDefender(closing.meters);
  const byAttacker = createEngagementGround({ startSeparationMeters: start });
  byAttacker.moveAttacker(closing.meters);

  assert.ok(Math.abs(byDefender.separationMeters - byAttacker.separationMeters) < 1e-9,
    'the same step must close the gap by the same amount whoever takes it');
  assert.ok(byDefender.separationMeters < start);
  // And they move opposite ways down the lane to do it.
  assert.ok(byDefender.defenderMeters < 0);
  assert.ok(byAttacker.attackerMeters > 0);
});
