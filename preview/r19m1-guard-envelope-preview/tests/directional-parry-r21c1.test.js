import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { defendedSectorFor } from '../src/combat/attack-direction-as-defended.js';

import {
  createCommittedParryContactGate,
  evaluateCommittedParryInput,
} from '../src/combat/committed-parry-contact-gate.js';
import { GUARD_SECTORS } from '../src/combat/guard-sector.js';
import { LONGSWORD_ATTACK_DIRECTIONS } from '../src/combat/longsword-directional-metadata.js';

// R21C.1 - a parry is answered by direction; a block is not.
//
// Step two of directional defence, and deliberately only the parry half. The shield stays
// omnidirectional and still catches the blow, which is what let this ship without re-measuring
// anything: the golden grid is eleven block outcomes and none of them can move.

const attack = (direction, elapsedSeconds = 0.12) => ({
  sequence: 4,
  phase: 'attack_windup',
  elapsedSeconds,
  interrupted: false,
  action: { direction, runtime: { movementStartSeconds: 0.12, contactSeconds: 0.23 } },
});
const press = (direction, aimedSector) => evaluateCommittedParryInput({
  attackSnapshot: attack(direction), aimedSector, manual: true,
});

test('R21C.1 pointing at the swing is what arms the parry', () => {
  for (const direction of LONGSWORD_ATTACK_DIRECTIONS) {
    // R21Q.1: "its own direction" is the sector the attack arrives from, not the name of the clip.
    // The clips are named for the attacker's hand and the sector for the screen, so the lateral
    // pair mirrors between them; this test asserted the raw names until the mirror was measured.
    const answer = defendedSectorFor(direction);
    const matched = press(direction, answer);
    assert.equal(matched.accepted, true, `${direction} answered from where it arrives`);
    assert.equal(matched.gates.directionMatched, true);
    assert.equal(matched.aimedSector, answer);
    assert.equal(matched.attackDirection, direction, 'the clip keeps its own name');

    for (const wrong of GUARD_SECTORS.filter((sector) => sector !== answer)) {
      const missed = press(direction, wrong);
      assert.equal(missed.accepted, false, `${direction} must not be parried by aiming ${wrong}`);
      assert.equal(missed.reason, 'parry-input-wrong-direction');
      // The timing was right - it is only the direction that refused, and the report says so.
      assert.equal(missed.gates.timingInsideWindow, true);
      assert.equal(missed.gates.attackCommitted, true);
    }
  }
});

test('R21C.1 no aim is a mismatch, not a pass', () => {
  const unaimed = press('right', null);
  assert.equal(unaimed.accepted, false);
  assert.equal(unaimed.reason, 'parry-input-unaimed');
  assert.equal(unaimed.gates.directionMatched, false);
  assert.equal(unaimed.gates.timingInsideWindow, true, 'the timing was fine; the answer was missing');
  // Empty strings and nonsense are the same thing as never having pointed.
  assert.equal(press('right', '').reason, 'parry-input-unaimed');
  assert.equal(press('right', 'sideways').reason, 'parry-input-wrong-direction');
  // An attack with no direction cannot be answered by pointing at all, so it refuses rather than
  // matching whatever the player happened to hold.
  assert.equal(evaluateCommittedParryInput({
    attackSnapshot: { ...attack('right'), action: { runtime: { movementStartSeconds: 0.12, contactSeconds: 0.23 } } },
    aimedSector: 'left',
  }).accepted, false);
});

test('R21C.1 a wrong guess still spends the one attempt', () => {
  // The gate has allowed one arm per attack since before this change, so a wrong direction costs
  // what a wrong time costs: this swing is now a plain block. That is the whole stake - the guard
  // is untouched and still blocks, so guessing wrong loses the reward, not the exchange.
  const gate = createCommittedParryContactGate();
  // R21Q.1: a RIGHT attack arrives on the LEFT, so 'right' is now the wrong guess and 'left' the
  // right one - the two swapped roles here when the mirror was fixed.
  const wrong = gate.arm({ attackSnapshot: attack('right'), aimedSector: 'right', manual: true });
  assert.equal(wrong.accepted, false);
  assert.equal(wrong.reason, 'parry-input-wrong-direction');
  const retry = gate.arm({ attackSnapshot: attack('right'), aimedSector: 'left', manual: true });
  assert.equal(retry.accepted, false);
  assert.equal(retry.reason, 'parry-input-already-used-for-attack');
});

test('R21C.1 both doors into the gate carry the aim, and the CI probe points before it presses', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  const armCalls = entry.split('parryGate.arm(').length - 1;
  assert.equal(armCalls, 2, 'the guard-raise edge and the manual input');
  // R23T.1: a third reader - the block gate reads the aim through the engagement's context now.
  assert.equal(entry.split('aimedSector: guardSector.sector').length - 1, 3,
    'a door into the gate that does not carry the aim is a parry without one');

  // The gate that verifies parries in CI drives them through triggerParryNow, which never touched
  // the mouse. It aims the way a player does now - a real pointer event at the canvas - so the
  // input path stays verified rather than bypassed by a test-only setter.
  const probe = readFileSync(new URL('../tools/action-studio/shield-parry-r281/parry-gate-probe.js', import.meta.url), 'utf8');
  assert.match(probe, /dispatchEvent\(new PointerEventCtor\('pointermove'/);
  assert.match(probe, /aimAt\(documentRef, windowRef, direction\)/);
  assert.ok(probe.indexOf('aimAt(documentRef') < probe.indexOf('api.triggerParryNow()'), 'point, then press');
});

test('R21C.1 the prompt is about time, and only the press is about aim', () => {
  // The same evaluation runs every frame with manual:false to answer "is the window open" - it is
  // what lights the parry cue and what the CI driver waits for. Gating THAT on aim made it
  // permanently false, so nothing could ever be pressed and every direction failed with no parry
  // at all. The browser gate caught it; no unit test of this function would have.
  const prompt = evaluateCommittedParryInput({ attackSnapshot: attack('right'), manual: false });
  assert.equal(prompt.accepted, true, 'the window is open regardless of where the player points');
  assert.equal(prompt.gates.directionRequired, false);
  assert.equal(prompt.gates.directionMatched, false, 'and it still reports the aim, honestly');

  const pressed = press('right', null);
  assert.equal(pressed.gates.directionRequired, true);
  assert.equal(pressed.accepted, false);
});
