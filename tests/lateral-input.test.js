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

test('R20S.3 WASD moves the fighter, the arrows keep the lane scalars', async () => {
  const ui = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url), 'utf8');
  // R19V.1 gave the sidestep to the arrows because WASD flew the inspection camera. R20S.3 reversed
  // the premise rather than the reasoning: the inspection camera is opt-in (?camera=free) now that
  // the game's own camera renders the lab, so the movement layout every player knows is free to
  // take. The arrows keep driving the lane scalars unchanged - same ledger, nothing that depended
  // on them moves.
  assert.match(ui, /LATERAL_KEYS = Object\.freeze\(\{ ArrowLeft: -1, ArrowRight: 1 \}\)/);
  assert.match(ui, /MOVE_FORWARD_KEYS = Object\.freeze\(\{ KeyW: 1, KeyS: -1 \}\)/);
  assert.match(ui, /MOVE_LATERAL_KEYS = Object\.freeze\(\{ KeyD: 1, KeyA: -1 \}\)/);
  // Locking is a decision, so it has a key rather than happening to you - and Tab's default is to
  // take the keyboard out of the fight, which has to be refused.
  assert.match(ui, /const LOCK_KEY = 'Tab';/);
  assert.match(ui, /if \(event\.code === LOCK_KEY\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*onLockToggle/);
  // A movement key held into a lost window never reports its keyup.
  assert.match(ui, /heldMoveKeys\.clear\(\);\s*\n\s*publishMoveIntent\(\);/);
  // Shift zeroes the sidestep instead of redirecting it - the attacker has no lateral verb yet.
  assert.match(ui, /if \(attackerModifier\) return 0;/);

  const lane = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/lane-controller.js', import.meta.url), 'utf8');
  // Body-relative sign: positive intent is the defender's own right, which while square on the
  // lane (facing -z) is world -x - hence the negation into the ledger's +x-is-their-left frame.
  assert.match(lane, /ground\.moveDefenderLateral\(-lateralStep\.meters\)/);
  assert.match(lane, /defenderLateralIntent = 0/, 'a lane reset clears the held sidestep');
});

test('R19W.1 the touch pad is virtual arrow keys sharing the keyboard held-sets', async () => {
  const html = await readFile(
    new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');
  for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    assert.match(html, new RegExp(`data-move="${code}"`), code);
  }
  const ui = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url), 'utf8');
  // One pipeline: the pad adds and removes key codes from the SAME held-sets the keyboard uses,
  // so the Shift rules and intents cannot drift between input methods.
  assert.match(ui, /LANE_KEYS\[code\] !== undefined \? heldLaneKeys : heldLateralKeys/);
  assert.match(ui, /button\.addEventListener\('pointerdown', press\)/);
  assert.match(ui, /button\.addEventListener\('pointercancel', release\)/);
});
