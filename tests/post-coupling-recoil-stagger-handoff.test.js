import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CONTACT_RELEASE_SEPARATION_RECOIL_STAGE,
  COUPLED_MOMENTUM_CONTINUATION_STAGE,
  POST_COUPLING_RECOIL_STAGGER_BASE_STAGE,
  POST_COUPLING_RECOIL_STAGGER_STAGE,
  buildPostCouplingRecoilStaggerHandoff,
  consumePostCouplingRecoilStaggerHandoff,
  publishPostCouplingRecoilStaggerHandoff,
} from '../src/combat/post-coupling-recoil-stagger-handoff.js';
import { TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE } from '../src/combat/two-actor-whole-body-recoil-burst.js';

function recoilPlan(responseClass = 'parry-directional-recoil') {
  return {
    planned: true,
    sequence: 12,
    attackDirection: 'right',
    responseClass,
    weapon: {
      direction: { x: -0.7, y: 0.25, z: -0.65 },
      lateralSign: -1,
      strength: responseClass === 'blocked-weapon-bounce' ? 0.28 : responseClass === 'perfect-parry-directional-recoil' ? 1 : 0.68,
      deflectDegrees: responseClass === 'blocked-weapon-bounce' ? 12 : responseClass === 'perfect-parry-directional-recoil' ? 44 : 30,
    },
    body: {
      strength: responseClass === 'blocked-weapon-bounce' ? 0.12 : responseClass === 'perfect-parry-directional-recoil' ? 0.56 : 0.38,
      yawDegrees: responseClass === 'blocked-weapon-bounce' ? -4 : responseClass === 'perfect-parry-directional-recoil' ? -15 : -10,
      pitchDegrees: responseClass === 'blocked-weapon-bounce' ? -3 : responseClass === 'perfect-parry-directional-recoil' ? -10 : -7,
      rollDegrees: responseClass === 'blocked-weapon-bounce' ? -1.1 : responseClass === 'perfect-parry-directional-recoil' ? -4.2 : -2.8,
    },
  };
}

function couplingReport(outcome = 'parry', drive = 0.105, follow = 0.105) {
  return {
    outcome,
    elapsedMs: outcome === 'perfect-parry' ? 104 : outcome === 'block' ? 105 : 96,
    shieldTangent: { x: 0.96, y: 0, z: 0.28 },
    incomingDirection: { x: 0.05, y: -0.1, z: 0.99 },
    shieldOffset: { x: drive, y: 0.02, z: 0.01 },
    attackerWeaponOffset: { x: follow, y: 0.018, z: 0.01 },
    finalSurface: { center: { x: drive, y: 1.1, z: 0.2 } },
    profile: { durationMs: outcome === 'perfect-parry' ? 104 : outcome === 'block' ? 105 : 96 },
  };
}

function normalize(v) {
  const m = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

test('G4.3B.5R.2.7 is the latest post-coupling presentation authority', () => {
  assert.equal(POST_COUPLING_RECOIL_STAGGER_BASE_STAGE, 'G4.3B.5R.2.1');
  assert.equal(COUPLED_MOMENTUM_CONTINUATION_STAGE, 'G4.3B.5R.2.2');
  assert.equal(CONTACT_RELEASE_SEPARATION_RECOIL_STAGE, 'G4.3B.5R.2.4');
  assert.equal(POST_COUPLING_RECOIL_STAGGER_STAGE, TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE);
});

test('G4.3B.5R.2.7 Parry release bypasses separation and jumps into old Two-Actor impulse', () => {
  const handoff = buildPostCouplingRecoilStaggerHandoff({
    plan: recoilPlan(), couplingReport: couplingReport(),
    surfaceAtContact: { center: { x: 0, y: 1.1, z: 0.2 } },
    baseProfile: { contactHoldMs: 28, impulseEndMs: 105, recoilEndMs: 235, settleEndMs: 390, legStrengthScale: 0.78 },
  });
  assert.equal(handoff.stage, TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE);
  assert.equal(handoff.previousStage, COUPLED_MOMENTUM_CONTINUATION_STAGE);
  assert.equal(handoff.accepted, true);
  assert.equal(handoff.initialElapsedMs, 68);
  assert.equal(handoff.reason, 'two-actor-whole-body-recoil-burst-ready');
  assert.equal(handoff.profileOverrides.releaseSeparationWindowMs, 0);
  assert.equal(handoff.profileOverrides.releaseSeparationDistanceMeters, 0);
  assert.equal(handoff.profileOverrides.impulseEndMs, 112);
  assert.equal(handoff.profileOverrides.recoilEndMs, 300);
  assert.equal(handoff.profileOverrides.settleEndMs, 520);
  assert.equal(handoff.timelineIntent.releaseSeparationWindowMs, 0);
  assert.equal(handoff.timelineIntent.b3EntryElapsedMs, 68);
});

test('G4.3B.5R.2.7 restores full sword-arm authority and old torso yaw/roll while adding backward bias', () => {
  const source = recoilPlan();
  const handoff = buildPostCouplingRecoilStaggerHandoff({
    plan: source, couplingReport: couplingReport(), baseProfile: { contactHoldMs: 28, legStrengthScale: 0.78 },
  });
  assert.ok(handoff.plan.weapon.strength >= source.weapon.strength * 0.98);
  assert.ok(handoff.plan.weapon.deflectDegrees >= source.weapon.deflectDegrees * 0.98);
  assert.ok(Math.abs(handoff.plan.body.yawDegrees) >= Math.abs(source.body.yawDegrees) * 0.95);
  assert.ok(Math.abs(handoff.plan.body.rollDegrees) >= Math.abs(source.body.rollDegrees) * 0.95);
  assert.ok(Math.abs(handoff.plan.body.pitchDegrees) >= 25);
  assert.ok(handoff.profileOverrides.legStrengthScale > 0.78);
  assert.equal(handoff.channelIntent.weapon, 'old-two-actor-direct-arm-deflect-at-release-power-frame');
  assert.equal(handoff.channelIntent.freeArm, 'parent-chain-motion-no-explicit-flail');
});

test('G4.3B.5R.2.7 release direction still blends B2 authority with shield redirect', () => {
  const source = recoilPlan();
  const report = couplingReport('parry');
  const handoff = buildPostCouplingRecoilStaggerHandoff({
    plan: source, couplingReport: report, baseProfile: { contactHoldMs: 28, legStrengthScale: 0.78 },
  });
  const b2 = normalize(source.weapon.direction);
  const coupled = normalize(report.attackerWeaponOffset);
  const actual = handoff.plan.weapon.direction;
  assert.equal(handoff.separation.source, 'contact-release-b2-shield-blend');
  assert.ok(dot(b2, actual) > 0.90);
  assert.ok(dot(coupled, actual) < 0.50);
  assert.equal(handoff.separation.bypassedForWholeBodyBurst, true);
});

test('G4.3B.5R.2.7 stronger coupling still increases inherited whole-body momentum', () => {
  const weak = buildPostCouplingRecoilStaggerHandoff({
    plan: recoilPlan(), couplingReport: couplingReport('parry', 0.055, 0.05),
    surfaceAtContact: { center: { x: 0, y: 1.1, z: 0.2 } }, baseProfile: { contactHoldMs: 28, legStrengthScale: 0.78 },
  });
  const strong = buildPostCouplingRecoilStaggerHandoff({
    plan: recoilPlan(), couplingReport: couplingReport('parry', 0.13, 0.12),
    surfaceAtContact: { center: { x: 0, y: 1.1, z: 0.2 } }, baseProfile: { contactHoldMs: 28, legStrengthScale: 0.78 },
  });
  assert.ok(strong.couplingMomentum.momentum > weak.couplingMomentum.momentum);
  assert.ok(Math.abs(strong.plan.body.yawDegrees) > Math.abs(weak.plan.body.yawDegrees));
  assert.ok(strong.separation.b2Alignment > 0.90);
});

test('G4.3B.5R.2.7 Perfect is stronger and longer than ordinary Parry', () => {
  const parry = buildPostCouplingRecoilStaggerHandoff({
    plan: recoilPlan(), couplingReport: couplingReport('parry'), baseProfile: { contactHoldMs: 28, legStrengthScale: 0.78 },
  });
  const perfect = buildPostCouplingRecoilStaggerHandoff({
    plan: recoilPlan('perfect-parry-directional-recoil'), couplingReport: couplingReport('perfect-parry', 0.125, 0.13),
    baseProfile: { contactHoldMs: 36, legStrengthScale: 1 },
  });
  assert.equal(perfect.initialElapsedMs, 76);
  assert.ok(perfect.plan.weapon.strength > parry.plan.weapon.strength);
  assert.ok(perfect.plan.weapon.deflectDegrees > parry.plan.weapon.deflectDegrees);
  assert.ok(Math.abs(perfect.plan.body.pitchDegrees) > Math.abs(parry.plan.body.pitchDegrees));
  assert.equal(perfect.profileOverrides.settleEndMs, 620);
  assert.equal(perfect.timelineIntent.releaseSeparationWindowMs, 0);
});

test('Block compatibility path remains old B2 direction and does not invent whole-body burst', () => {
  const source = recoilPlan('blocked-weapon-bounce');
  const handoff = buildPostCouplingRecoilStaggerHandoff({
    plan: source, couplingReport: couplingReport('block', 0.035, 0.025), baseProfile: { contactHoldMs: 18, legStrengthScale: 0.42 },
  });
  assert.equal(handoff.reason, 'post-coupling-body-stagger-ready');
  assert.equal(handoff.separation.source, 'b2-block-recoil-direction');
  assert.deepEqual(handoff.plan.weapon.direction, normalize(source.weapon.direction));
  assert.equal(handoff.timelineIntent, null);
  assert.equal(handoff.wholeBodyBurst, null);
});

test('G4.3B.5R.2.7 release signal is one-shot per attacker rig', () => {
  const rig = {};
  assert.equal(publishPostCouplingRecoilStaggerHandoff(rig, { couplingReport: couplingReport() }), true);
  const first = consumePostCouplingRecoilStaggerHandoff(rig);
  const second = consumePostCouplingRecoilStaggerHandoff(rig);
  assert.equal(first.stage, TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE);
  assert.equal(first.previousStage, COUPLED_MOMENTUM_CONTINUATION_STAGE);
  assert.equal(second, null);
});

test('source contract injects .2.7 handoff before the B3 phase clock advances', () => {
  const couplingSource = fs.readFileSync(new URL('../src/combat/shield-driven-contact-coupling.js', import.meta.url), 'utf8');
  const recoilSource = fs.readFileSync(new URL('../src/combat/attacker-recoil-presentation.js', import.meta.url), 'utf8');
  assert.match(couplingSource, /publishPostCouplingRecoilStaggerHandoff\(attackerRig/);
  assert.match(recoilSource, /const handoff = applyPendingPostCouplingHandoff\(\);\s*const phaseClock = advanceAttackerRecoilPresentationClock\(/);
  assert.match(recoilSource, /elapsedMs = Math\.max\(elapsedMs, builtHandoff\.initialElapsedMs\)/);
  assert.match(recoilSource, /activePlan = builtHandoff\.plan/);
  assert.match(recoilSource, /builtHandoff\.separation\?\.releaseWindowMs/);
  assert.match(recoilSource, /planIdentityPreserved: activePlan === planBeforeHandoff/);
  assert.match(recoilSource, /presentationElapsedPreserved: elapsedMs === elapsedBeforeHandoffMs/);
  assert.match(recoilSource, /bodyRestartedAtHandoff: false/);
});
