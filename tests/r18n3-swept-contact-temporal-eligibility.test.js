import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY,
  evaluateSweptContactTemporalEligibility,
} from '../src/combat/swept-contact-temporal-eligibility.js';
import {
  confirmCommittedParryContact,
  evaluateCommittedParryInput,
} from '../src/combat/committed-parry-contact-gate.js';
import { createLongswordDirectionalAttackRuntime } from '../src/combat/longsword-directional-attack-runtime.js';

const lifecycleSource = await readFile(new URL('../src/combat/contact-lifecycle-director.js', import.meta.url), 'utf8');
const controllerSource = await readFile(new URL('../src/game/contact-handoff-controller.js', import.meta.url), 'utf8');
const integrationSource = await readFile(new URL('../src/combat/two-actor-combat-integration.js', import.meta.url), 'utf8');

function rightSnapshot({ previousElapsedMs = 248.684, elapsedSeconds = 0.298684, phase = 'attack_recovery' } = {}) {
  return {
    sequence: 9,
    phase,
    elapsedSeconds,
    previousElapsedMs,
    interrupted: false,
    action: {
      runtime: {
        direction: 'right',
        movementStartSeconds: 0.12,
        contactSeconds: 0.23,
        activeStartSeconds: 0.19,
        activeEndSeconds: 0.28,
      },
    },
  };
}

function geometricContact(sweepAlpha) {
  return {
    contact: true,
    geometricContact: true,
    eligible: true,
    reason: 'active-swept-contact',
    sweepAlpha,
    point: { x: 0.1, y: 1.0, z: 0.1 },
    incomingVelocity: { x: 1, y: 0, z: 0 },
  };
}

function armedReport() {
  return evaluateCommittedParryInput({
    attackSnapshot: {
      sequence: 9,
      phase: 'attack_windup',
      elapsedSeconds: 0.12,
      interrupted: false,
      action: { runtime: { movementStartSeconds: 0.12, contactSeconds: 0.23 } },
    },
  });
}

test('R18N.3 v6.4 reconstructs contact time inside ACTIVE even when frame endpoint is RECOVERY', () => {
  const report = evaluateSweptContactTemporalEligibility({
    contactReport: geometricContact(0.1993395802088883),
    attackSnapshot: rightSnapshot(),
    deltaSeconds: 0.05,
    fallbackEligible: false,
  });

  assert.equal(report.contact, true);
  assert.equal(report.eligible, true);
  assert.equal(report.temporalEligibility.authority, SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY);
  assert.equal(report.temporalEligibility.frameEndPhase, 'attack_recovery');
  assert.equal(report.temporalEligibility.frameEndPhaseActive, false);
  assert.ok(Math.abs(report.temporalEligibility.contactElapsedSeconds - 0.25865097901044504) < 1e-9);
  assert.ok(report.temporalEligibility.contactElapsedSeconds < 0.28);
});

test('R18N.3 v6.4 still rejects a true swept intersection whose sub-frame timestamp is after ACTIVE end', () => {
  const report = evaluateSweptContactTemporalEligibility({
    contactReport: geometricContact(0.82),
    attackSnapshot: rightSnapshot(),
    deltaSeconds: 0.05,
    fallbackEligible: true,
  });

  assert.equal(report.contact, false);
  assert.equal(report.eligible, false);
  assert.equal(report.reason, 'contact-outside-active-window');
  assert.ok(report.temporalEligibility.contactElapsedSeconds > 0.28);
});

test('R18N.3 v6.4 committed Parry confirmation consumes sub-frame temporal authority instead of frame-end phase', () => {
  const contact = evaluateSweptContactTemporalEligibility({
    contactReport: geometricContact(0.20),
    attackSnapshot: rightSnapshot(),
    deltaSeconds: 0.05,
    fallbackEligible: false,
  });
  const confirmation = confirmCommittedParryContact({
    armedReport: armedReport(),
    attackSnapshot: rightSnapshot(),
    contact,
  });

  assert.equal(confirmation.accepted, true);
  assert.equal(confirmation.gates.realSweptContact, true);
  assert.equal(confirmation.gates.activeContact, true);
  assert.equal(confirmation.gates.activeContactAuthority, SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY);
});

test('R18N.3 v6.4 attack interruption freezes the authored source at actual sub-frame contact time', () => {
  const runtime = createLongswordDirectionalAttackRuntime();
  const started = runtime.start('right');
  assert.equal(started.accepted, true);
  runtime.update(300);
  assert.equal(runtime.snapshot.phase, 'attack_recovery');

  const temporalEligibility = Object.freeze({
    authority: SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY,
    eligible: true,
    contactElapsedSeconds: 0.25865,
  });
  const interrupted = runtime.interrupt({
    resolution: {
      resolved: true,
      outcome: 'parry',
      attackSequence: runtime.snapshot.sequence,
      attacker: { interruptAttack: true, responseClass: 'parry-directional-recoil' },
      contact: { point: {}, incomingVelocity: {}, temporalEligibility },
    },
    contactTemporalEligibility: temporalEligibility,
  });

  assert.equal(interrupted.accepted, true);
  assert.equal(interrupted.snapshot.interruption.phaseAtInterrupt, 'attack_active');
  assert.ok(Math.abs(interrupted.snapshot.interruption.sourceTimeSeconds - 0.25865) < 1e-9);
  assert.equal(interrupted.snapshot.interruption.contactTemporalAuthority, SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY);
  assert.ok(interrupted.snapshot.interruption.frameEndElapsedMs > 280);
});

test('R18N.3 v6.4 preserves real-contact authority through controller and two-actor orchestration', () => {
  // R18S.4: the authority chain lives in the lifecycle director.
  assert.match(lifecycleSource, /const geometricContact = probeSweptSwordBucklerContact\(\{/);
  assert.match(lifecycleSource, /active: true/);
  assert.match(lifecycleSource, /evaluateSweptContactTemporalEligibility\(\{/);
  assert.match(lifecycleSource, /if \(!contactEvaluation\.contact\)/);
  assert.match(integrationSource, /effectiveAttackPhase = sweptTemporalAuthority && temporalEligibility\.eligible === true/);
  assert.match(integrationSource, /contactTemporalEligibility: sweptTemporalAuthority \? temporalEligibility : null/);
});
