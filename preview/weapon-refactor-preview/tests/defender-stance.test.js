import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

test('R20G.1 (B6c) the entry wires the choice: input raises the guard, the stance gates the dodge', async () => {
  const entry = await readFile(
    new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  // Block mode never auto-raises: only parry mode, or the held key, enters guard for an attack.
  assert.match(entry, /if \(\(selectedMode === 'parry' \|\| \(selectedMode === 'block' && guardKeyHeld\)\)/);
  // Every dodge path - keys, touch, facade - walks through one stance-gated request.
  assert.match(entry, /function requestDodge\(direction\) \{\n  if \(!defenderStance\.mayDodge\(\)\)/);
  assert.match(entry, /tryDodge: requestDodge,/);
  // The stance refreshes on the input edge so a same-tick guard press and dodge see each other.
  const setGuard = entry.indexOf('function setGuardHeld(held,'); // R24G.1: the raise says which door it came through
  const edgeRefresh = entry.indexOf('defenderStance.update({ guardKeyHeld, dodgeRunning', setGuard);
  assert.ok(setGuard >= 0 && edgeRefresh > setGuard, 'setGuardHeld refreshes the stance synchronously');
  // An unraised guard has no blocking authority, scoped to block mode - parry mode keeps its
  // armed guard, which is what keeps the parry CI honest.
  assert.match(entry, /readGuardActive: \(\) => selectedMode !== 'block' \|\| defenderStance\.report\.guardActive === true/);
  const director = await readFile(
    new URL('../src/combat/contact-lifecycle-director.js', import.meta.url), 'utf8');
  assert.match(director, /reason: 'shield-not-raised-guards-nothing'/);
  // The golden driver holds the guard: the grid describes the guard-up world.
  const capture = await readFile(
    new URL('../tools/action-studio/b1-golden/capture-golden-grid.mjs', import.meta.url), 'utf8');
  assert.match(capture, /setGuardHeld\(true\)/);
});

test('R20G.1 reset returns to neutral with no stale edge', () => {
  const stanceRuntime = createDefenderStanceRuntime();
  stanceRuntime.update({ guardKeyHeld: true });
  stanceRuntime.reset();
  assert.equal(stanceRuntime.report.stance, 'neutral');
  assert.equal(stanceRuntime.report.justRaisedGuard, false);
  assert.equal(stanceRuntime.mayDodge(), true);
});

test('R20H.2 a committed defence keeps the guard up after the key is released', () => {
  const stanceRuntime = createDefenderStanceRuntime();
  stanceRuntime.update({ guardKeyHeld: true });                       // the tap
  const released = stanceRuntime.update({ guardKeyHeld: false, defenceCommitted: true });
  assert.equal(released.guardActive, true, 'an armed parry may not be yanked out by the key release');
  assert.equal(released.heldByCommitment, true);
  assert.equal(released.justRaisedGuard, false, 'the hold is not a new press');
  const stillCommitted = stanceRuntime.update({ guardKeyHeld: false, defenceCommitted: true });
  assert.equal(stillCommitted.guardActive, true);
  const ended = stanceRuntime.update({ guardKeyHeld: false, defenceCommitted: false });
  assert.equal(ended.guardActive, false, 'the deferred stand-down lands the moment the commitment ends');
  assert.equal(ended.heldByCommitment, false);
});

test('R20H.2 a commitment can hold a raised guard but can never raise one', () => {
  const stanceRuntime = createDefenderStanceRuntime();
  const neutral = stanceRuntime.update({ guardKeyHeld: false, defenceCommitted: true });
  assert.equal(neutral.guardActive, false, 'nothing was committed from neutral - B6c keeps its cost');
  assert.equal(neutral.heldByCommitment, false);
});

test('R20H.2 a dodge still outranks a commitment-held guard', () => {
  const stanceRuntime = createDefenderStanceRuntime();
  stanceRuntime.update({ guardKeyHeld: true });
  const dodging = stanceRuntime.update({ guardKeyHeld: false, defenceCommitted: true, dodgeRunning: true });
  assert.equal(dodging.stance, 'dodge');
  assert.equal(dodging.guardActive, false);
});

test('R20H.2 re-pressing during a commitment hold does not buy a second parry', () => {
  const stanceRuntime = createDefenderStanceRuntime();
  stanceRuntime.update({ guardKeyHeld: true });
  stanceRuntime.update({ guardKeyHeld: false, defenceCommitted: true });
  const repress = stanceRuntime.update({ guardKeyHeld: true, defenceCommitted: true });
  assert.equal(repress.justRaisedGuard, false, 'the guard never fell, so there is no rising edge to parry on');
});
