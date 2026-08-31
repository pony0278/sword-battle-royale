import test from 'node:test';
import assert from 'node:assert/strict';
import { PARRY_LUNGE_TRAVEL_BUDGET_METERS } from '../src/combat/parry-lunge-reach.js';
import {
  COMMITTED_PARRY_CONTACT_GATE_PROFILE,
  confirmCommittedParryContact,
  createCommittedParryContactGate,
  evaluateCommittedParryInput,
} from '../src/combat/committed-parry-contact-gate.js';

function attack(elapsedSeconds, overrides = {}) {
  return {
    sequence: overrides.sequence ?? 7,
    phase: overrides.phase || 'attack_windup',
    elapsedSeconds,
    interrupted: false,
    action: {
      // R21C.1: the gate reads the attack's direction to compare against where the player pointed.
      direction: overrides.direction ?? 'right',
      runtime: {
        movementStartSeconds: overrides.movementStartSeconds ?? 0.12,
        contactSeconds: overrides.contactSeconds ?? 0.23,
      },
    },
  };
}

// R21C.1: these tests are about timing and geometry, so they all point correctly and let the
// direction gate stand aside. The direction gate has its own test file.
const AIMED = 'right';

function predictive(overrides = {}) {
  const requiredDistance = overrides.requiredDistance ?? 0.08;
  return {
    threat: { signedDistance: overrides.signedDistance ?? 0.02 },
    trackingPlan: {
      requiredDistance,
      reachable: overrides.reachable ?? requiredDistance <= COMMITTED_PARRY_CONTACT_GATE_PROFILE.maxShieldTravelMeters,
    },
  };
}

test('manual Parry rejects input before the authored attack commitment marker', () => {
  const report = evaluateCommittedParryInput({
    aimedSector: AIMED,
    attackSnapshot: attack(0.08),
    predictiveAnalysis: predictive(),
  });
  assert.equal(report.accepted, false);
  assert.equal(report.reason, 'attack-not-committed');
  assert.equal(report.gates.attackCommitted, false);
});

test('manual Parry uses a 60–180ms TTC window after commitment', () => {
  const tooEarly = evaluateCommittedParryInput({
    aimedSector: AIMED,
    attackSnapshot: attack(0.20, { movementStartSeconds: 0.10, contactSeconds: 0.50 }),
    predictiveAnalysis: predictive(),
  });
  const valid = evaluateCommittedParryInput({
    aimedSector: AIMED,
    attackSnapshot: attack(0.12),
    predictiveAnalysis: predictive(),
  });
  const tooLate = evaluateCommittedParryInput({
    aimedSector: AIMED,
    attackSnapshot: attack(0.19),
    predictiveAnalysis: predictive(),
  });

  assert.equal(tooEarly.reason, 'parry-input-too-early');
  assert.equal(valid.accepted, true);
  assert.ok(Math.abs(valid.timeToContactSeconds - 0.11) < 1e-9);
  assert.equal(tooLate.reason, 'parry-input-too-late');
});

test('predictive geometry guides clamped shield tracking but cannot veto valid manual Parry timing', () => {
  const outOfReach = evaluateCommittedParryInput({
    aimedSector: AIMED,
    attackSnapshot: attack(0.12),
    predictiveAnalysis: predictive({ requiredDistance: PARRY_LUNGE_TRAVEL_BUDGET_METERS + 0.001 }),
  });
  const outsidePlane = evaluateCommittedParryInput({
    aimedSector: AIMED,
    attackSnapshot: attack(0.12),
    predictiveAnalysis: predictive({ signedDistance: 0.056 }),
  });

  assert.equal(outOfReach.accepted, true);
  assert.equal(outOfReach.reason, 'parry-input-armed-awaiting-real-contact');
  assert.equal(outOfReach.gates.shieldReachable, false);
  assert.equal(outOfReach.gates.trackingClamped, true);
  assert.equal(outsidePlane.accepted, true);
  assert.equal(outsidePlane.reason, 'parry-input-armed-awaiting-real-contact');
  assert.equal(outsidePlane.gates.planeCapturable, false);
  assert.equal(outsidePlane.gates.geometryGuidanceCanVetoInput, false);
});

test('temporarily missing predictive geometry cannot veto valid manual Parry timing', () => {
  const report = evaluateCommittedParryInput({
    aimedSector: AIMED,
    attackSnapshot: attack(0.12),
    predictiveAnalysis: null,
  });
  assert.equal(report.accepted, true);
  assert.equal(report.reason, 'parry-input-armed-awaiting-real-contact');
  assert.equal(report.gates.geometryGuidanceAvailable, false);
  assert.equal(report.gates.geometryGuidanceCanVetoInput, false);
});

test('armed Parry is confirmed only by eligible real swept contact in attack_active', () => {
  const armed = evaluateCommittedParryInput({
    aimedSector: AIMED,
    attackSnapshot: attack(0.12),
    predictiveAnalysis: predictive(),
  });
  const activeAttack = attack(0.20, { phase: 'attack_active' });
  const fake = confirmCommittedParryContact({
    armedReport: armed,
    attackSnapshot: activeAttack,
    contact: { contact: true, geometricContact: false, eligible: true },
  });
  const real = confirmCommittedParryContact({
    armedReport: armed,
    attackSnapshot: activeAttack,
    contact: { contact: true, geometricContact: true, eligible: true },
  });

  assert.equal(fake.accepted, false);
  assert.equal(fake.reason, 'waiting-for-real-swept-contact');
  assert.equal(real.accepted, true);
  assert.equal(real.reason, 'parry-confirmed-by-real-swept-contact');
});

test('one manual Parry attempt is allowed per attack sequence', () => {
  const gate = createCommittedParryContactGate();
  const input = { aimedSector: AIMED, attackSnapshot: attack(0.12), predictiveAnalysis: predictive() };
  assert.equal(gate.arm(input).accepted, true);
  const duplicate = gate.arm(input);
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, 'parry-input-already-used-for-attack');
});
