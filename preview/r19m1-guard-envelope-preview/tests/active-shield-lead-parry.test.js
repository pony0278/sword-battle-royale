import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_SHIELD_LEAD_PARRY_STAGE,
  buildActiveShieldLeadCouplingStart,
  sampleActiveShieldLeadMotion,
} from '../src/combat/active-shield-lead-parry.js';
import {
  SHIELD_CONTACT_COUPLING_PHASES,
  getShieldContactCouplingProfile,
  sampleShieldContactCoupling,
} from '../src/combat/shield-driven-contact-coupling.js';

const incoming = { x: 0.05, y: -0.1, z: 6 };

function magnitude(v) {
  return Math.hypot(v.x, v.y, v.z);
}

test('G4.3B.5R.2.8.1 measures translational or angular shield lead before contact', () => {
  const motion = sampleActiveShieldLeadMotion({
    previousSurface: {
      center: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: -1 },
    },
    currentSurface: {
      center: { x: 0.012, y: 1, z: 0 },
      normal: { x: 0.12, y: 0, z: -0.9928 },
    },
    deltaSeconds: 1 / 60,
  });

  assert.equal(motion.stage, ACTIVE_SHIELD_LEAD_PARRY_STAGE);
  assert.equal(motion.moving, true);
  assert.ok(motion.translationSpeedMps > 0.5);
  assert.ok(motion.angularSpeedRadPerSecond > 1);
});

test('G4.3B.5R.2.8.1 consumes the old Parry contact hold before contact instead of pausing after impact', () => {
  const baseProfile = getShieldContactCouplingProfile('parry');
  const handoff = buildActiveShieldLeadCouplingStart({
    outcome: 'parry',
    predictiveReport: { active: true, progress: 0.88 },
    predictiveHandoff: { accepted: true },
    shieldLeadMotion: { moving: true, translationSpeedMps: 0.42, angularSpeedRadPerSecond: 1.1 },
  });

  assert.equal(handoff.stage, ACTIVE_SHIELD_LEAD_PARRY_STAGE);
  assert.equal(handoff.predictiveActiveBeforeContact, true);
  assert.equal(handoff.shieldMovingAtContact, true);
  assert.equal(handoff.consumedContactHoldMs, baseProfile.holdMs);
  assert.equal(handoff.initialCouplingElapsedMs, baseProfile.holdMs);
  assert.equal(handoff.couplingProfileOverrides.holdMs, 0);
  assert.equal(handoff.postContactHoldMs, 0);
  assert.equal(handoff.b3ClockPolicy, 'frozen-until-shield-coupling-complete');
});

test('G4.3B.5R.2.8.1 first contact sample is already DRIVE and already pushes the attacker arm', () => {
  const handoff = buildActiveShieldLeadCouplingStart({
    outcome: 'parry',
    predictiveReport: { active: true, progress: 0.9 },
    predictiveHandoff: { accepted: true },
    shieldLeadMotion: { moving: true, translationSpeedMps: 0.35, angularSpeedRadPerSecond: 0.8 },
  });
  const sample = sampleShieldContactCoupling({
    outcome: 'parry',
    elapsedMs: handoff.initialCouplingElapsedMs,
    profile: handoff.couplingProfileOverrides,
    incomingVelocity: incoming,
    attackDirection: 'right',
    contactPoint: { x: 0.1, y: 1.1, z: 0.2 },
  });

  assert.equal(sample.phase, SHIELD_CONTACT_COUPLING_PHASES.DRIVE);
  assert.ok(sample.driveProgress > 0);
  assert.ok(magnitude(sample.shieldOffset) > 0);
  assert.ok(magnitude(sample.attackerWeaponOffset) > 0);
  assert.equal(sample.releaseAttackerRecoil, false);
});

test('G4.3B.5R.2.8.1 Perfect also removes post-contact dead hold while keeping its own coupling duration', () => {
  const baseProfile = getShieldContactCouplingProfile('perfect-parry');
  const handoff = buildActiveShieldLeadCouplingStart({
    outcome: 'perfect-parry',
    predictiveReport: { active: true, progress: 1 },
    predictiveHandoff: { accepted: true },
    shieldLeadMotion: { moving: true, translationSpeedMps: 0.5, angularSpeedRadPerSecond: 1.5 },
  });

  assert.equal(handoff.initialCouplingElapsedMs, baseProfile.holdMs);
  assert.equal(handoff.couplingProfileOverrides.holdMs, 0);
  assert.equal(handoff.postContactHoldMs, 0);
  assert.ok(baseProfile.durationMs > handoff.initialCouplingElapsedMs);
});
