import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFENDER_STANCE_STAGE, createDefenderStanceRuntime } from '../src/combat/defender-stance.js';

test('R20G.1 the guard is held, not toggled, and the rising edge is reported exactly once', () => {
  assert.equal(DEFENDER_STANCE_STAGE, 'R20G.1');
  const stanceRuntime = createDefenderStanceRuntime();
  assert.equal(stanceRuntime.report.stance, 'neutral');

  const raised = stanceRuntime.update({ guardKeyHeld: true });
  assert.equal(raised.stance, 'guard');
  assert.equal(raised.justRaisedGuard, true, 'the press edge is the Sekiro parry attempt');
  const held = stanceRuntime.update({ guardKeyHeld: true });
  assert.equal(held.stance, 'guard');
  assert.equal(held.justRaisedGuard, false, 'holding is not pressing');

  const released = stanceRuntime.update({ guardKeyHeld: false });
  assert.equal(released.stance, 'neutral');
  assert.equal(stanceRuntime.update({ guardKeyHeld: true }).justRaisedGuard, true,
    're-press raises again');
});

test('R20G.1 guard refuses the dodge, and the dodge drops the guard press', () => {
  const stanceRuntime = createDefenderStanceRuntime();
  // Guard held: the dodge may not be entered - raising the shield commits the exchange.
  stanceRuntime.update({ guardKeyHeld: true });
  assert.equal(stanceRuntime.mayDodge(), false);
  // Neutral: the dodge may.
  stanceRuntime.update({ guardKeyHeld: false });
  assert.equal(stanceRuntime.mayDodge(), true);

  // Mid-dodge, a guard press does not interrupt: the stance stays dodge and no edge fires.
  stanceRuntime.update({ guardKeyHeld: false, dodgeRunning: true });
  assert.equal(stanceRuntime.report.stance, 'dodge');
  assert.equal(stanceRuntime.mayDodge(), false, 'no dodge from a dodge');
  const pressedMidDodge = stanceRuntime.update({ guardKeyHeld: true, dodgeRunning: true });
  assert.equal(pressedMidDodge.stance, 'dodge');
  assert.equal(pressedMidDodge.justRaisedGuard, false);
  // Dodge ends with the key still down: the guard RISES (holding block is intent enough) but
  // the edge is dropped - a buffered press must never be a free wake-up parry attempt.
  const afterDodge = stanceRuntime.update({ guardKeyHeld: true, dodgeRunning: false });
  assert.equal(afterDodge.stance, 'guard');
  assert.equal(afterDodge.justRaisedGuard, false, 'guard yes, parry edge no');
  // Release and a fresh press from neutral: the edge is the player's own timing again.
  stanceRuntime.update({ guardKeyHeld: false });
  assert.equal(stanceRuntime.update({ guardKeyHeld: true }).justRaisedGuard, true);
});

test('R20G.1 reset returns to neutral with no stale edge', () => {
  const stanceRuntime = createDefenderStanceRuntime();
  stanceRuntime.update({ guardKeyHeld: true });
  stanceRuntime.reset();
  assert.equal(stanceRuntime.report.stance, 'neutral');
  assert.equal(stanceRuntime.report.justRaisedGuard, false);
  assert.equal(stanceRuntime.mayDodge(), true);
});
