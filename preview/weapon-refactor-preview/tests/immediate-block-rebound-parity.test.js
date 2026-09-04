import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMMEDIATE_BLOCK_REBOUND_PARITY_STAGE,
  IMMEDIATE_BLOCK_SHIELD_GIVE_PHASES,
  IMMEDIATE_BLOCK_SHIELD_GIVE_PROFILE,
  sampleImmediateBlockShieldGive,
} from '../src/combat/immediate-block-rebound-parity.js';
import { DIRECTIONAL_RECOIL_PROFILES, RECOIL_RESPONSE_CLASSES } from '../src/combat/directional-recoil-planner.js';
import { ATTACKER_RECOIL_PRESENTATION_PROFILES } from '../src/combat/attacker-recoil-presentation.js';

const incoming = { x: 0.2, y: -0.1, z: 5.8 };

function magnitude(v) {
  return Math.hypot(v.x, v.y, v.z);
}

test('G4.3B.5R.2.4.2 Block shield give never owns attacker recoil or weapon motion', () => {
  const sample = sampleImmediateBlockShieldGive({ elapsedMs: 50, incomingVelocity: incoming });
  assert.equal(sample.stage, IMMEDIATE_BLOCK_REBOUND_PARITY_STAGE);
  assert.equal(sample.outcome, 'block');
  assert.equal(sample.attackerRecoilFrozen, false);
  assert.equal(sample.attackerWeaponFollow, false);
  assert.equal(sample.postCouplingHandoff, false);
  assert.equal(sample.profile.attackerRecoilAuthority, 'B2/B3-immediate-parallel');
  assert.equal(sample.profile.attackerWeaponAuthority, 'B2/B3-only-no-shield-follow');
});

test('G4.3B.5R.2.4.2 shield give peaks near 3cm and recovers without lateral Parry sweep', () => {
  const peak = sampleImmediateBlockShieldGive({
    elapsedMs: IMMEDIATE_BLOCK_SHIELD_GIVE_PROFILE.givePeakMs,
    incomingVelocity: incoming,
  });
  const done = sampleImmediateBlockShieldGive({
    elapsedMs: IMMEDIATE_BLOCK_SHIELD_GIVE_PROFILE.durationMs,
    incomingVelocity: incoming,
  });
  assert.equal(peak.phase, IMMEDIATE_BLOCK_SHIELD_GIVE_PHASES.GIVE);
  assert.ok(Math.abs(magnitude(peak.shieldOffset) - 0.03) < 1e-6);
  assert.equal(done.phase, IMMEDIATE_BLOCK_SHIELD_GIVE_PHASES.COMPLETE);
  assert.equal(done.complete, true);
  assert.ok(magnitude(done.shieldOffset) < 1e-8);
});

test('G4.3B.5R.2.4.2 preserves predictive-lab Block B2/B3 rebound baseline', () => {
  const b2 = DIRECTIONAL_RECOIL_PROFILES[RECOIL_RESPONSE_CLASSES.BLOCK];
  const b3 = ATTACKER_RECOIL_PRESENTATION_PROFILES['blocked-weapon-bounce'];
  assert.equal(b2.baseStrength, 0.42);
  assert.equal(b2.weaponDeflectDegrees, 22);
  assert.equal(b3.contactHoldMs, 26);
  assert.equal(b3.impulseEndMs, 96);
  assert.equal(b3.recoilEndMs, 178);
  assert.equal(b3.settleEndMs, 280);
});
