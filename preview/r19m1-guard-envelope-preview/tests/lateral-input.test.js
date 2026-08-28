import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { LANE_LOCOMOTION_PROFILE, planLateralStep } from '../src/combat/lane-locomotion.js';

test('R19V.1 the sidestep reuses the not-straight-at-them speed and needs no clamp', () => {
  // 0.75 is backwardSpeedMps reused, not a new number: "movement that is not straight at your
  // opponent is slower" was already this profile's judgement.
  assert.equal(LANE_LOCOMOTION_PROFILE.lateralSpeedMps, LANE_LOCOMOTION_PROFILE.backwardSpeedMps);
  const step = planLateralStep({ intent: 1, deltaSeconds: 0.1 });
  assert.ok(Math.abs(step.meters - 0.075) < 1e-12);
  assert.ok(Math.abs(planLateralStep({ intent: -1, deltaSeconds: 0.1 }).meters + 0.075) < 1e-12);
  assert.equal(planLateralStep({ intent: 0, deltaSeconds: 0.1 }).meters, 0);
  // Deliberately no clamp fields: a sidestep is perpendicular to the line between the fighters
  // and can only open the gap, so a clamp would be guarding against geometry that cannot happen.
  assert.equal('clamped' in step, false);
});

test('R19V.1 arrows own the sidestep because WASD belongs to the camera', async () => {
  const ui = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /LATERAL_KEYS = Object\.freeze\(\{ ArrowLeft: -1, ArrowRight: 1 \}\)/);
  assert.doesNotMatch(ui, /KeyA: -1/, 'A/D must stay with the free camera');
  // Shift zeroes the sidestep instead of redirecting it - the attacker has no lateral verb yet.
  assert.match(ui, /if \(attackerModifier\) return 0;/);

  const lane = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/lane-controller.js', import.meta.url), 'utf8');
  // Body-relative sign: positive intent is the defender's own right, which while square on the
  // lane (facing -z) is world -x - hence the negation into the ledger's +x-is-their-left frame.
  assert.match(lane, /ground\.moveDefenderLateral\(-lateralStep\.meters\)/);
  assert.match(lane, /defenderLateralIntent = 0/, 'a lane reset clears the held sidestep');
});
