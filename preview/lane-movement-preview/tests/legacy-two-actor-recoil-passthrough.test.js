import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACKER_RECOIL_PRESENTATION_PHASES,
  sampleAttackerRecoilPresentation,
} from '../src/combat/attacker-recoil-presentation.js';
import {
  LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE,
  LEGACY_TWO_ACTOR_RECOIL_PASSTHROUGH_STAGE,
  buildPostCouplingRecoilStaggerHandoff,
} from '../src/combat/post-coupling-recoil-stagger-handoff.js';
import {
  getShieldContactCouplingProfile,
  sampleShieldContactCoupling,
} from '../src/combat/shield-driven-contact-coupling.js';
import {
  sampleParryBackwardBalanceBreak,
} from '../src/combat/parry-backward-balance-break.js';

function recoilPlan(responseClass = 'parry-directional-recoil') {
  return {
    planned: true,
    sequence: 28,
    attackDirection: 'right',
    responseClass,
    weapon: {
      direction: responseClass === 'perfect-parry-directional-recoil'
        ? { x: -0.78, y: 0.31, z: -0.54 }
        : { x: -0.7, y: 0.25, z: -0.65 },
      lateralSign: -1,
      strength: responseClass === 'perfect-parry-directional-recoil' ? 1 : 0.68,
      deflectDegrees: responseClass === 'perfect-parry-directional-recoil' ? 44 : 30,
    },
    body: {
      strength: responseClass === 'perfect-parry-directional-recoil' ? 0.56 : 0.38,
      yawDegrees: responseClass === 'perfect-parry-directional-recoil' ? -15 : -10,
      pitchDegrees: responseClass === 'perfect-parry-directional-recoil' ? -10 : -7,
      rollDegrees: responseClass === 'perfect-parry-directional-recoil' ? -4.2 : -2.8,
    },
  };
}

function releaseReport(outcome = 'parry') {
  const profile = getShieldContactCouplingProfile(outcome);
  return sampleShieldContactCoupling({
    outcome,
    elapsedMs: profile.durationMs,
    incomingVelocity: { x: 0.05, y: -0.1, z: 6 },
    attackDirection: 'right',
    contactPoint: { x: 0.1, y: 1.1, z: 0.2 },
  });
}

test('G4.3B.5R.2.8 real shield Parry marks legacy Two-Actor recoil passthrough', () => {
  const report = releaseReport('parry');
  assert.equal(report.complete, true);
  assert.equal(report.recoilHandoffMode, LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE);
  assert.equal(report.profile.recoilHandoffMode, LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE);
});

test('G4.3B.5R.2.8 release preserves the original B2/B3 recoil plan exactly', () => {
  const plan = recoilPlan();
  const handoff = buildPostCouplingRecoilStaggerHandoff({
    plan,
    couplingReport: releaseReport('parry'),
    baseProfile: {
      contactHoldMs: 28,
      impulseEndMs: 105,
      recoilEndMs: 235,
      settleEndMs: 390,
      legStrengthScale: 0.78,
    },
  });

  assert.equal(handoff.stage, LEGACY_TWO_ACTOR_RECOIL_PASSTHROUGH_STAGE);
  assert.equal(handoff.reason, 'legacy-two-actor-recoil-passthrough-ready');
  assert.equal(handoff.initialElapsedMs, 0);
  assert.strictEqual(handoff.plan, plan);
  assert.deepEqual(handoff.profileOverrides, {});
  assert.equal(handoff.wholeBodyBurst, null);
  assert.equal(handoff.separation.bypassedForLegacyPassthrough, true);
  assert.equal(handoff.separation.bypassedForWholeBodyBurst, false);
  assert.equal(handoff.timelineIntent.b3EntryElapsedMs, 0);
});

test('G4.3B.5R.2.8 first 30fps frame no longer jumps near recoil peak', () => {
  const handoff = buildPostCouplingRecoilStaggerHandoff({
    plan: recoilPlan(),
    couplingReport: releaseReport('parry'),
    baseProfile: { contactHoldMs: 28, impulseEndMs: 105, recoilEndMs: 235, settleEndMs: 390 },
  });
  const atRelease = sampleAttackerRecoilPresentation(handoff.plan, handoff.initialElapsedMs, handoff.profileOverrides);
  const firstFrame = sampleAttackerRecoilPresentation(handoff.plan, handoff.initialElapsedMs + 1000 / 30, handoff.profileOverrides);

  assert.equal(atRelease.phase, ATTACKER_RECOIL_PRESENTATION_PHASES.CONTACT_HOLD);
  assert.equal(atRelease.weights.armWeight, 0);
  assert.equal(firstFrame.phase, ATTACKER_RECOIL_PRESENTATION_PHASES.IMPULSE);
  assert.ok(firstFrame.weights.armWeight < 0.1, 'first visible recoil frame must still be early in the impulse');
  assert.ok(firstFrame.weights.torsoWeight < 0.05, 'torso should not appear at peak on the first recoil frame');
});

test('G4.3B.5R.2.8 backward preload relinquishes body authority at shield release', () => {
  for (const [outcome, responseClass] of [
    ['parry', 'parry-directional-recoil'],
    ['perfect-parry', 'perfect-parry-directional-recoil'],
  ]) {
    const releaseMs = getShieldContactCouplingProfile(outcome).durationMs;
    const sample = sampleParryBackwardBalanceBreak({
      outcome,
      plan: recoilPlan(responseClass),
      elapsedMs: releaseMs,
    });
    assert.equal(sample.complete, true);
    assert.equal(sample.active, false);
    assert.equal(sample.weight, 0);
    assert.equal(sample.handoffTarget, LEGACY_TWO_ACTOR_RECOIL_PASSTHROUGH_STAGE);
  }
});

test('G4.3B.5R.2.8 Perfect also preserves its original stronger legacy B3 plan', () => {
  const normalPlan = recoilPlan();
  const perfectPlan = recoilPlan('perfect-parry-directional-recoil');
  const normal = buildPostCouplingRecoilStaggerHandoff({ plan: normalPlan, couplingReport: releaseReport('parry') });
  const perfect = buildPostCouplingRecoilStaggerHandoff({ plan: perfectPlan, couplingReport: releaseReport('perfect-parry') });

  assert.strictEqual(normal.plan, normalPlan);
  assert.strictEqual(perfect.plan, perfectPlan);
  assert.equal(normal.initialElapsedMs, 0);
  assert.equal(perfect.initialElapsedMs, 0);
  assert.ok(perfect.plan.weapon.deflectDegrees > normal.plan.weapon.deflectDegrees);
  assert.ok(Math.abs(perfect.plan.body.pitchDegrees) > Math.abs(normal.plan.body.pitchDegrees));
});
