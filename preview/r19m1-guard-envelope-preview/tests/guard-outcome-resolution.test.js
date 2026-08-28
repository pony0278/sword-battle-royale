import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUARD_OUTCOME_RESOLUTION_STAGE,
  GUARD_OUTCOMES,
  createGuardOutcomeResolutionGate,
  resolveGuardOutcome,
} from '../src/combat/guard-outcome-resolution.js';

const contact = Object.freeze({
  contact: true,
  geometricContact: true,
  eligible: true,
  point: { x: 0.12, y: 1.04, z: 0.02 },
  incomingVelocity: { x: 2, y: -3, z: 4 },
  radialDistance: 0.11,
  bladeFraction: 0.55,
  sweepAlpha: 0.62,
});

function base(overrides = {}) {
  return {
    attackSequence: 7,
    attackDirection: 'left',
    attackPhase: 'attack_active',
    contact,
    guardSnapshot: {
      state: 'guard_hold',
      guardHeld: true,
      elapsedMs: 240,
    },
    ...overrides,
  };
}

test('G4.3A.4 requires real eligible contact before resolving an outcome', () => {
  const result = resolveGuardOutcome(base({ contact: { ...contact, contact: false } }));
  assert.equal(result.stage, GUARD_OUTCOME_RESOLUTION_STAGE);
  assert.equal(result.resolved, false);
  assert.equal(result.outcome, GUARD_OUTCOMES.NONE);
  assert.equal(result.reason, 'no-authoritative-contact');
  assert.equal(result.attacker.interruptAttack, false);
});

test('G4.3A.4 stable Guard contact resolves to ordinary Block', () => {
  const result = resolveGuardOutcome(base({ guardIntentAgeMs: 620 }));
  assert.equal(result.outcome, GUARD_OUTCOMES.BLOCK);
  assert.equal(result.defender.event, 'block_confirmed');
  assert.equal(result.defender.reactionVariant, 'block-hit');
  assert.equal(result.attacker.interruptAttack, true);
  assert.equal(result.attacker.responseClass, 'blocked-weapon-bounce');
  assert.equal(result.advantage.granted, false);
});

test('G4.3A.4 contact within 180ms Guard intent resolves to Parry', () => {
  const result = resolveGuardOutcome(base({ guardIntentAgeMs: 120 }));
  assert.equal(result.outcome, GUARD_OUTCOMES.PARRY);
  assert.equal(result.defender.event, 'parry_confirmed');
  assert.equal(result.defender.reactionVariant, 'parry');
  assert.equal(result.defender.payload.perfect, false);
  assert.equal(result.attacker.responseClass, 'parry-directional-recoil');
  assert.equal(result.advantage.granted, true);
  assert.equal(result.advantage.grade, 'parry');
});

test('G4.3A.4 contact within 75ms resolves to Perfect Parry', () => {
  const result = resolveGuardOutcome(base({
    guardSnapshot: { state: 'guard_enter', guardHeld: true, elapsedMs: 48 },
  }));
  assert.equal(result.outcome, GUARD_OUTCOMES.PERFECT_PARRY);
  assert.equal(result.defender.event, 'parry_confirmed');
  assert.equal(result.defender.reactionVariant, 'perfect-parry');
  assert.equal(result.defender.payload.perfect, true);
  assert.equal(result.defender.payload.grade, 'perfect-parry');
  assert.equal(result.attacker.responseClass, 'perfect-parry-directional-recoil');
  assert.equal(result.advantage.grade, 'perfect-parry');
});

test('G4.3A.4 missing timing evidence is conservative and resolves as Block', () => {
  const result = resolveGuardOutcome(base());
  assert.equal(result.outcome, GUARD_OUTCOMES.BLOCK);
  assert.equal(result.guard.intentAgeMs, null);
  assert.equal(result.guard.timingGrade, 'block');
});

test('G4.3A.4 rejects contact when Guard is not held or state is already reacting', () => {
  const released = resolveGuardOutcome(base({
    guardSnapshot: { state: 'guard_hold', guardHeld: false, elapsedMs: 100 },
    guardIntentAgeMs: 40,
  }));
  assert.equal(released.resolved, false);
  assert.equal(released.reason, 'guard-not-held');

  const reacting = resolveGuardOutcome(base({
    guardSnapshot: { state: 'guard_parry', guardHeld: true, elapsedMs: 30 },
    guardIntentAgeMs: 30,
  }));
  assert.equal(reacting.resolved, false);
  assert.equal(reacting.reason, 'guard-state-not-resolvable');
});

test('G4.3A.4 preserves physical contact vector for G4.3B recoil planning', () => {
  const result = resolveGuardOutcome(base({ guardIntentAgeMs: 100 }));
  assert.deepEqual(result.contact.point, contact.point);
  assert.deepEqual(result.contact.incomingVelocity, contact.incomingVelocity);
  assert.ok(Math.abs(result.contact.speed - Math.sqrt(29)) < 1e-9);
  assert.ok(Math.abs(result.contact.incomingDirection.x - 2 / Math.sqrt(29)) < 1e-9);
  assert.ok(Math.abs(result.contact.incomingDirection.y + 3 / Math.sqrt(29)) < 1e-9);
  assert.ok(Math.abs(result.contact.incomingDirection.z - 4 / Math.sqrt(29)) < 1e-9);
});

test('G4.3A.4 gate emits only once per attack sequence', () => {
  const gate = createGuardOutcomeResolutionGate();
  const first = gate.resolve(base({ guardIntentAgeMs: 110 }));
  const duplicate = gate.resolve(base({ guardIntentAgeMs: 20 }));

  assert.equal(first.outcome, GUARD_OUTCOMES.PARRY);
  assert.equal(first.emitGuardEvent, true);
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.outcome, GUARD_OUTCOMES.PARRY);
  assert.equal(duplicate.emitGuardEvent, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.reason, 'attack-sequence-already-resolved');
});

test('G4.3A.4 gate allows a new attack sequence and supports explicit reset', () => {
  const gate = createGuardOutcomeResolutionGate();
  const first = gate.resolve(base({ attackSequence: 21, guardIntentAgeMs: 500 }));
  const second = gate.resolve(base({ attackSequence: 22, guardIntentAgeMs: 50 }));
  assert.equal(first.outcome, GUARD_OUTCOMES.BLOCK);
  assert.equal(second.outcome, GUARD_OUTCOMES.PERFECT_PARRY);
  assert.equal(gate.hasResolved(21), true);
  assert.equal(gate.hasResolved(22), true);

  gate.reset(21);
  assert.equal(gate.hasResolved(21), false);
  assert.equal(gate.hasResolved(22), true);
});
