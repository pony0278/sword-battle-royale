import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHIELD_DRIVEN_CONTACT_COUPLING_STAGE,
  SHIELD_CONTACT_COUPLING_PHASES,
  getShieldContactCouplingProfile,
  sampleShieldContactCoupling,
} from '../src/combat/shield-driven-contact-coupling.js';

const incoming = { x: 0, y: -0.1, z: 6 };

function magnitude(v) {
  return Math.hypot(v.x, v.y, v.z);
}

test('G4.3B.5R.2 keeps Guard contact coupled before recoil release', () => {
  const profile = getShieldContactCouplingProfile('block');
  const hold = sampleShieldContactCoupling({ outcome: 'block', elapsedMs: 10, incomingVelocity: incoming, attackDirection: 'top' });
  const drive = sampleShieldContactCoupling({ outcome: 'block', elapsedMs: 50, incomingVelocity: incoming, attackDirection: 'top' });
  const done = sampleShieldContactCoupling({ outcome: 'block', elapsedMs: profile.durationMs, incomingVelocity: incoming, attackDirection: 'top' });

  assert.equal(hold.stage, SHIELD_DRIVEN_CONTACT_COUPLING_STAGE);
  assert.equal(hold.phase, SHIELD_CONTACT_COUPLING_PHASES.HOLD);
  assert.equal(hold.releaseAttackerRecoil, false);
  assert.equal(drive.phase, SHIELD_CONTACT_COUPLING_PHASES.DRIVE);
  assert.ok(magnitude(drive.shieldOffset) > 0);
  assert.equal(done.complete, true);
  assert.equal(done.releaseAttackerRecoil, true);
});

test('G4.3B.5R.2 Parry shield sweep drives the attacker weapon instead of independent recoil', () => {
  const drive = sampleShieldContactCoupling({
    outcome: 'parry',
    elapsedMs: 70,
    incomingVelocity: incoming,
    attackDirection: 'right',
    contactPoint: { x: 0.1, y: 1.1, z: 0.2 },
  });

  assert.equal(drive.phase, SHIELD_CONTACT_COUPLING_PHASES.DRIVE);
  assert.ok(magnitude(drive.shieldOffset) > 0.08);
  assert.ok(magnitude(drive.attackerWeaponOffset) > 0.06);
  assert.equal(drive.releaseAttackerRecoil, false);
  assert.ok(drive.profile.attackerFollowRatio > 0.8);
});

test('G4.3B.5R.2 LEFT and RIGHT Parry sweep in opposite lateral directions', () => {
  const left = sampleShieldContactCoupling({ outcome: 'parry', elapsedMs: 70, incomingVelocity: incoming, attackDirection: 'left' });
  const right = sampleShieldContactCoupling({ outcome: 'parry', elapsedMs: 70, incomingVelocity: incoming, attackDirection: 'right' });
  const dot = left.shieldTangent.x * right.shieldTangent.x
    + left.shieldTangent.y * right.shieldTangent.y
    + left.shieldTangent.z * right.shieldTangent.z;
  assert.ok(dot < -0.9);
});

test('G4.3B.5R.2 Perfect Parry has stronger shield-driven displacement than normal Parry', () => {
  const parry = sampleShieldContactCoupling({ outcome: 'parry', elapsedMs: 72, incomingVelocity: incoming, attackDirection: 'right' });
  const perfect = sampleShieldContactCoupling({ outcome: 'perfect-parry', elapsedMs: 72, incomingVelocity: incoming, attackDirection: 'right' });
  assert.ok(magnitude(perfect.shieldOffset) > magnitude(parry.shieldOffset));
  assert.ok(perfect.profile.shieldSweepMeters > parry.profile.shieldSweepMeters);
});
