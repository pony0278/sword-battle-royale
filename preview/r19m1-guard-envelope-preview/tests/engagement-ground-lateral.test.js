import test from 'node:test';
import assert from 'node:assert/strict';

import { createEngagementGround } from '../src/combat/engagement-ground.js';

// R19U.1: the ledger off the axis. The B1 golden replay pins the on-axis case at zero tolerance;
// these pin what the new dimension actually does.

function close(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !== ${expected}`);
}

test('R19U.1 a sidestep is perpendicular: it never closes the gap, it circles', () => {
  const g = createEngagementGround({ startSeparationMeters: 1.8 });
  g.moveDefenderLateral(0.5);
  close(g.report.separationMeters, Math.hypot(1.8, 0.5));
  close(g.report.defenderPosition.x, 0.5);
  // The bearings rotate with the geometry - the attacker now looks off-axis at the defender.
  assert.ok(g.report.attackerFacingRadians > 0);
  close(g.report.attackerFacingRadians, Math.atan2(0.5, 1.8));
  // A second sidestep moves along the NEW perpendicular, so repeated strafing orbits the
  // attacker instead of sliding down a world axis forever.
  const before = g.report.separationMeters;
  g.moveDefenderLateral(0.5);
  assert.ok(Math.abs(g.report.separationMeters - before) < 0.14,
    'circling changes range far less than 0.5m of walking would');
});

test('R19U.1 walking still means closing or opening the line, wherever it points', () => {
  const g = createEngagementGround({ startSeparationMeters: 2.0 });
  g.moveDefenderLateral(0.8);
  const apart = g.report.separationMeters;
  g.moveDefender(-0.4);
  close(g.report.separationMeters, apart - 0.4, 1e-6);
  g.moveAttacker(-0.3);
  close(g.report.separationMeters, apart - 0.7, 1e-6);
});

test('R19U.1 a swing along a frozen facing walks PAST a defender who stepped off its line', () => {
  const g = createEngagementGround({ startSeparationMeters: 1.8 });
  // The defender steps 1.2m off the axis; the attacker's swing stays frozen along the lane.
  g.moveDefenderLateral(1.2);
  const r = g.setAttackerSwing(0.86, 0);
  // No clamp: the ray misses the pushbox disc entirely, so the whole step is spent - the lunge
  // carries past, which is the whiff-punish geometry stage B exists for.
  close(r.attackerSwingMeters, 0.86);
  assert.ok(r.separationMeters > r.minimumSeparationMeters);
});

test('R19U.1 a swing aimed AT the off-axis defender clamps at the pushbox rim', () => {
  const g = createEngagementGround({ startSeparationMeters: 1.8 });
  g.moveDefenderLateral(0.6);
  // Aim the frozen facing straight at where the defender now stands.
  const aim = Math.atan2(0.6, 1.8);
  g.setAttackerSwing(5, aim);
  close(g.report.separationMeters, g.report.minimumSeparationMeters, 1e-6);
});

test('R19U.1 impact throws run down the live line between the fighters', () => {
  const g = createEngagementGround({ startSeparationMeters: 1.4 });
  g.moveDefenderLateral(0.7);
  const before = g.report.separationMeters;
  g.setAttackerSwing(0.2, Math.atan2(0.7, 1.4));
  g.settleImpact('block');
  g.advanceYield(1); // R24E.2: given over the reaction; the line it runs down is the same
  const settled = g.report;
  // Block transfer: attacker -0.07, defender +0.09 along the line = 0.16 net opening, applied to
  // whatever the separation was when the blow landed.
  close(settled.separationMeters, before - 0.2 + 0.16, 1e-6);
  assert.ok(Math.abs(settled.defenderPosition.x - 0.7) > 1e-6,
    'an off-axis throw moves the defender in x too, because the line points that way');
});

test('R19U.1 a whiff banks both components and reset clears them', () => {
  const g = createEngagementGround({ startSeparationMeters: 1.8 });
  g.moveDefenderLateral(1.2);
  g.setAttackerSwing(0.86, 0);
  g.settleWhiff();
  close(g.report.attackerPosition.z, -0.9 + 0.86);
  assert.equal(g.report.attackerSwingMeters, 0);
  g.reset();
  assert.equal(g.report.defenderLateralMeters, 0);
  assert.equal(g.report.separationMeters, 1.8);
});
