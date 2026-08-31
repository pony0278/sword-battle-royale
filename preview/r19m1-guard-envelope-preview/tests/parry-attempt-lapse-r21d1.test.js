import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createCommittedParryContactGate } from '../src/combat/committed-parry-contact-gate.js';
import { createDefenderStanceRuntime } from '../src/combat/defender-stance.js';

// R21D.1 - the stuck block pose.
//
// Reported from play: an answered TOP swing that landed anyway left the fighter standing in the
// block pose with nothing attacking and the key long released. Measured in the browser at 2.1m
// separation with F pressed at 300ms: stance=guard, guardActive=true, heldByCommitment=true,
// parryGate.armed=true, confirmation=null, attackRuntime.active=false, combat.active=false.
//
// The stance was doing exactly what R20H.2 tells it to - hold a raised guard while the defence is
// committed - and `armed` was lying about the commitment: an accepted attempt whose contact never
// arrived stayed armed forever, because nothing but the NEXT attack's arm() could clear it.

const LIVE = (sequence = 7) => ({
  sequence,
  phase: 'attack_windup',
  elapsedSeconds: 0.15,
  interrupted: false,
  action: { direction: 'top', runtime: { movementStartSeconds: 0.12, contactSeconds: 0.28 } },
});
const ENDED = (sequence = 7) => ({ sequence, phase: null, elapsedSeconds: 0.9, action: null });

const armed = (gate, sequence = 7) => gate.arm({
  attackSnapshot: LIVE(sequence), manual: true, aimedSector: 'top',
});

test('R21D.1 an accepted attempt is still armed while its own attack is live', () => {
  const gate = createCommittedParryContactGate();
  assert.equal(armed(gate).accepted, true);
  assert.equal(gate.armed, true);
  assert.equal(gate.lapse({ attackSnapshot: LIVE(), attackActive: true }), null);
  assert.equal(gate.armed, true);
});

test('R21D.1 the attempt lapses when its attack ends without contact', () => {
  const gate = createCommittedParryContactGate();
  armed(gate);
  const lapsed = gate.lapse({ attackSnapshot: ENDED(), attackActive: false });
  assert.equal(lapsed.accepted, false);
  assert.equal(lapsed.reason, 'parry-attempt-lapsed-without-contact');
  assert.equal(lapsed.lapsed, true);
  assert.equal(gate.armed, false, 'a lapsed attempt no longer commits the defence');
});

test('R21D.1 an interrupted attack lapses the attempt even while it holds an action', () => {
  const gate = createCommittedParryContactGate();
  armed(gate);
  // The runtime keeps `action` through an interruption and drops `active`; such an attack can
  // never reach the live active-window contact confirm() needs.
  assert.equal(gate.lapse({ attackSnapshot: LIVE(), attackActive: false }).lapsed, true);
  assert.equal(gate.armed, false);
});

test('R21D.1 a lapsed attempt still refuses a second press on the same swing', () => {
  const gate = createCommittedParryContactGate();
  armed(gate);
  gate.lapse({ attackSnapshot: ENDED(), attackActive: false });
  const second = armed(gate);
  assert.equal(second.accepted, false);
  assert.equal(second.reason, 'parry-input-already-used-for-attack');
});

test('R21D.1 lapse never touches a confirmed parry, and never revives one', () => {
  const gate = createCommittedParryContactGate();
  armed(gate);
  const confirmation = gate.confirm({
    attackSnapshot: { ...LIVE(), phase: 'attack_active', elapsedSeconds: 0.28 },
    contact: { contact: true, geometricContact: true, eligible: true },
  });
  assert.equal(confirmation.accepted, true);
  assert.equal(gate.lapse({ attackSnapshot: ENDED(), attackActive: false }), null);
  assert.equal(gate.attempt.accepted, true, 'the confirmed attempt is left exactly as it was');
});

test('R21D.1 the next attack still arms normally after a lapse', () => {
  const gate = createCommittedParryContactGate();
  armed(gate, 7);
  gate.lapse({ attackSnapshot: ENDED(7), attackActive: false });
  assert.equal(armed(gate, 8).accepted, true);
  assert.equal(gate.armed, true);
});

test('R21D.1 the lapse is what lets the released key lower the guard', () => {
  const gate = createCommittedParryContactGate();
  const stance = createDefenderStanceRuntime();
  const step = () => stance.update({
    guardKeyHeld: false, dodgeRunning: false, defenceCommitted: gate.armed === true,
  });
  stance.update({ guardKeyHeld: true, dodgeRunning: false, defenceCommitted: false });
  armed(gate);
  assert.equal(step().guardActive, true, 'a committed defence outlives the release');
  gate.lapse({ attackSnapshot: ENDED(), attackActive: false });
  assert.equal(step().guardActive, false, 'and the lapse is what ends it');
});

test('R21D.1 the lab lapses the gate every frame, after contact resolution', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  const lapseAt = entry.indexOf('parryGate.lapse(');
  assert.ok(lapseAt > 0, 'the frame loop lapses the gate');
  const resolveAt = entry.indexOf('resolveContact(snapshot, currentBlade, deltaSeconds)');
  assert.ok(resolveAt > 0 && resolveAt < lapseAt, 'a confirmation landing this frame still wins');
  const whiffAt = entry.indexOf('parryWhiffReporter.report(');
  assert.ok(whiffAt > 0 && whiffAt < lapseAt, 'the whiff diagnostic still sees the armed attempt');
});
