import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ATTACKER_RECOIL_PRESENTATION_PHASES,
  CONTACT_RELEASE_SEPARATION_MOTION_STAGE,
  sampleAttackerRecoilPresentation,
} from '../src/combat/attacker-recoil-presentation.js';
import { buildPostCouplingRecoilStaggerHandoff } from '../src/combat/post-coupling-recoil-stagger-handoff.js';

function recoilPlan(responseClass = 'parry-directional-recoil') {
  return {
    planned: true,
    sequence: 21,
    attackDirection: 'right',
    responseClass,
    weapon: {
      direction: responseClass === 'perfect-parry-directional-recoil' ? { x: -0.78, y: 0.31, z: -0.54 } : { x: -0.7, y: 0.25, z: -0.65 },
      lateralSign: -1,
      strength: responseClass === 'perfect-parry-directional-recoil' ? 1 : 0.68,
      deflectDegrees: responseClass === 'perfect-parry-directional-recoil' ? 44 : 30,
    },
    body: {
      strength: responseClass === 'perfect-parry-directional-recoil' ? 0.56 : 0.38,
      yawDegrees: -10,
      pitchDegrees: -7,
      rollDegrees: -2.8,
    },
  };
}

function couplingReport(outcome = 'parry') {
  const perfect = outcome === 'perfect-parry';
  return {
    outcome,
    elapsedMs: perfect ? 104 : 96,
    shieldTangent: { x: 0.96, y: 0, z: 0.28 },
    incomingDirection: { x: 0.05, y: -0.1, z: 0.99 },
    shieldOffset: { x: perfect ? 0.125 : 0.105, y: 0.02, z: 0.01 },
    attackerWeaponOffset: { x: perfect ? 0.13 : 0.105, y: 0.018, z: 0.01 },
    finalSurface: { center: { x: perfect ? 0.125 : 0.105, y: 1.1, z: 0.2 } },
    profile: { durationMs: perfect ? 104 : 96 },
  };
}

test('G4.3B.5R.2.4.1 historical explicit SEPARATION sampler remains available', () => {
  const sample = sampleAttackerRecoilPresentation(recoilPlan(), 28 + 39, {
    contactHoldMs: 28,
    releaseSeparationWindowMs: 78,
    releaseSeparationDistanceMeters: 0.065,
    impulseEndMs: 132,
    recoilEndMs: 275,
    settleEndMs: 445,
  });
  assert.equal(sample.motionStage, CONTACT_RELEASE_SEPARATION_MOTION_STAGE);
  assert.equal(sample.phase, ATTACKER_RECOIL_PRESENTATION_PHASES.SEPARATION);
  assert.ok(sample.weights.separationWeight > 0 && sample.weights.separationWeight < 1);
  assert.equal(sample.weights.legWeight, 0);
});

test('G4.3B.5R.2.7 Parry handoff bypasses separation and enters B3 impulse directly', () => {
  const handoff = buildPostCouplingRecoilStaggerHandoff({
    plan: recoilPlan(), couplingReport: couplingReport(), baseProfile: { contactHoldMs: 28, legStrengthScale: 0.78 },
  });
  const sample = sampleAttackerRecoilPresentation(handoff.plan, handoff.initialElapsedMs, handoff.profileOverrides);
  assert.equal(handoff.separation.releaseWindowMs, 0);
  assert.equal(handoff.separation.bypassedForWholeBodyBurst, true);
  assert.equal(handoff.profileOverrides.legStrengthScale, 1.95);
  assert.equal(sample.phase, ATTACKER_RECOIL_PRESENTATION_PHASES.IMPULSE);
  assert.equal(sample.pose.releaseSeparationDistanceMeters, 0);
  assert.ok(sample.weights.armWeight > 0.35);
  assert.ok(sample.weights.torsoWeight > 0.1);
});

test('G4.3B.5R.2.7 first 30fps frame after release is near whole-body impulse peak with visible knee rescue', () => {
  const handoff = buildPostCouplingRecoilStaggerHandoff({
    plan: recoilPlan(), couplingReport: couplingReport(), baseProfile: { contactHoldMs: 28, legStrengthScale: 0.78 },
  });
  const sample = sampleAttackerRecoilPresentation(handoff.plan, handoff.initialElapsedMs + 1000 / 30, handoff.profileOverrides);
  assert.equal(sample.phase, ATTACKER_RECOIL_PRESENTATION_PHASES.IMPULSE);
  assert.ok(sample.weights.armWeight > 0.9);
  assert.ok(sample.weights.torsoWeight > 0.8);
  assert.ok(sample.weights.legWeight > 0.5);
  assert.ok(Math.max(sample.pose.leftKneeBendDegrees, sample.pose.rightKneeBendDegrees) > 6.5);
  assert.ok(Math.abs(sample.pose.chestYawDegrees) > 5, 'parent-chain shoulder opening must be visible');
  assert.ok(Math.abs(sample.pose.chestPitchDegrees) > 10, 'backward almost-fall bias must remain dominant');
  assert.equal(sample.pose.releaseSeparationDistanceMeters, 0);
});

test('G4.3B.5R.2.7 Perfect also bypasses separation and preserves a stronger direct burst', () => {
  const parry = buildPostCouplingRecoilStaggerHandoff({
    plan: recoilPlan(), couplingReport: couplingReport(), baseProfile: { contactHoldMs: 28, legStrengthScale: 0.78 },
  });
  const perfect = buildPostCouplingRecoilStaggerHandoff({
    plan: recoilPlan('perfect-parry-directional-recoil'), couplingReport: couplingReport('perfect-parry'), baseProfile: { contactHoldMs: 36, legStrengthScale: 1 },
  });
  assert.equal(parry.separation.releaseWindowMs, 0);
  assert.equal(perfect.separation.releaseWindowMs, 0);
  assert.equal(perfect.profileOverrides.legStrengthScale, 2.05);
  assert.ok(perfect.plan.weapon.deflectDegrees > parry.plan.weapon.deflectDegrees);
  assert.ok(Math.abs(perfect.plan.body.pitchDegrees) > Math.abs(parry.plan.body.pitchDegrees));
  assert.ok(perfect.profileOverrides.settleEndMs > parry.profileOverrides.settleEndMs);
});

test('G4.3B.5R.2.4.1 historical separation IK path remains in runtime for compatibility', () => {
  const source = fs.readFileSync(new URL('../src/combat/attacker-recoil-presentation.js', import.meta.url), 'utf8');
  assert.match(source, /SEPARATION: 'separation'/);
  assert.match(source, /releaseSeparationDistanceMeters/);
  assert.match(source, /targetWorld\.copy\(handWorld\)\.add\(aimOffset\)/);
  assert.match(source, /aimEffectorWithBone\([\s\S]*rig\.bones\['upperarm\.r'\]/);
  assert.match(source, /aimEffectorWithBone\([\s\S]*rig\.bones\['lowerarm\.r'\]/);
});
