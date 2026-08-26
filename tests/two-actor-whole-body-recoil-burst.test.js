import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_ACTIVATIONS,
  TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE,
  TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_PROFILES,
  buildTwoActorWholeBodyRecoilBurst,
} from '../src/combat/two-actor-whole-body-recoil-burst.js';
import { buildPostCouplingRecoilStaggerHandoff } from '../src/combat/post-coupling-recoil-stagger-handoff.js';
import {
  PARRIED_REACTION_DEFINITION_IDS,
  PARRIED_REACTION_DEFINITION_STAGE,
  buildParriedReactionDefinition,
} from '../src/combat/parried-reaction-definition.js';
import { sampleAttackerRecoilPresentation } from '../src/combat/attacker-recoil-presentation.js';

function parryPlan(responseClass = 'parry-directional-recoil') {
  return Object.freeze({
    planned: true,
    sequence: 1,
    attackDirection: 'right',
    responseClass,
    weapon: Object.freeze({
      direction: Object.freeze({ x: 0.7, y: 0.15, z: -0.7 }),
      lateralSign: -1,
      strength: responseClass.startsWith('perfect') ? 1 : 0.68,
      deflectDegrees: responseClass.startsWith('perfect') ? 44 : 30,
    }),
    body: Object.freeze({
      strength: responseClass.startsWith('perfect') ? 0.56 : 0.38,
      yawDegrees: responseClass.startsWith('perfect') ? -15 : -10,
      pitchDegrees: responseClass.startsWith('perfect') ? -10 : -7,
      rollDegrees: responseClass.startsWith('perfect') ? -4.2 : -2.8,
    }),
  });
}

test('G4.3B.5R.2.7 enters old Two-Actor late impulse immediately after Parry release', () => {
  const result = buildTwoActorWholeBodyRecoilBurst({
    plan: parryPlan(),
    outcome: 'parry',
    momentum: 1,
    weaponMomentum: 1,
    releaseDirection: { x: 1, y: 0, z: 0 },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.stage, TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE);
  assert.equal(result.initialElapsedMs, 68);
  assert.equal(result.profileOverrides.releaseSeparationWindowMs, 0);
  assert.equal(result.profileOverrides.releaseSeparationDistanceMeters, 0);
  assert.equal(result.powerFrame.separationBypassed, true);
  assert.equal(result.profileOverrides.powerFrameHoldMs, 96);
  assert.equal(result.powerFrame.holdDurationMs, 96);
  assert.equal(result.powerFrame.oldTwoActorArmAuthorityRestored, true);
  assert.equal(result.plan.weapon.deflectDegrees, 30);
  assert.ok(result.plan.body.pitchDegrees <= -32);
  assert.ok(Math.abs(result.plan.body.yawDegrees) >= 10.7, 'open-shoulder yaw channel should be slightly stronger than old Two-Actor');
  assert.ok(Math.abs(result.plan.body.rollDegrees) >= 3.0, 'roll channel should help widen the two-shoulder silhouette');
  const next30FpsFrameMs = result.initialElapsedMs + 1000 / 30;
  assert.ok(next30FpsFrameMs > 95 && next30FpsFrameMs < result.profileOverrides.impulseEndMs);
});

test('G4.3B.5R.2.7 preserves backward almost-fall bias and owns the release legs outright', () => {
  const result = buildTwoActorWholeBodyRecoilBurst({
    plan: parryPlan(), outcome: 'parry', momentum: 1.05, weaponMomentum: 1,
  });
  assert.ok(Math.abs(result.plan.body.pitchDegrees) * 0.42 >= 13.4);
  assert.equal(result.profileOverrides.legStrengthScale, 1.95);
  assert.equal(result.powerFrame.parentChainFreeArmMotion, true);
  assert.equal(result.rootMotion, false);
});

test('G4.3B.5R.2.7 Perfect is stronger and longer than normal Parry', () => {
  const normal = TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_PROFILES.parry;
  const perfect = TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_PROFILES['perfect-parry'];
  assert.ok(perfect.minimumPlanBackwardPitchDegrees > normal.minimumPlanBackwardPitchDegrees);
  assert.ok(perfect.legStrengthScale > normal.legStrengthScale);
  assert.ok(perfect.yawScale > normal.yawScale);
  assert.ok(perfect.rollScale > normal.rollScale);
  assert.ok(perfect.settleEndMs > normal.settleEndMs);
  assert.ok(perfect.initialElapsedMs > normal.initialElapsedMs);
});

test('G4.3B.5R.2.7 does not apply to Block', () => {
  const result = buildTwoActorWholeBodyRecoilBurst({
    plan: { ...parryPlan(), responseClass: 'blocked-weapon-bounce' },
    outcome: 'block',
    momentum: 1,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'non-parry-outcome');
});

test('post-coupling Parry handoff bypasses explicit separation and keeps absolute .2.7 leg authority', () => {
  const handoff = buildPostCouplingRecoilStaggerHandoff({
    plan: parryPlan(),
    couplingReport: {
      outcome: 'parry', elapsedMs: 96,
      shieldOffset: { x: 0.105, y: 0.02, z: 0.01 },
      attackerWeaponOffset: { x: 0.09, y: 0.018, z: 0.01 },
      shieldTangent: { x: 1, y: 0, z: 0 },
      finalSurface: { center: { x: 0.105, y: 1, z: 0 } },
    },
    surfaceAtContact: { center: { x: 0, y: 1, z: 0 } },
    baseProfile: { contactHoldMs: 28, legStrengthScale: 0.78 },
  });
  assert.equal(handoff.accepted, true);
  assert.equal(handoff.stage, TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE);
  assert.equal(handoff.initialElapsedMs, 68);
  assert.equal(handoff.separation.releaseWindowMs, 0);
  assert.equal(handoff.separation.bypassedForWholeBodyBurst, true);
  assert.equal(handoff.profileOverrides.legStrengthScale, 1.95, 'historical 0.78 leg scale must not attenuate .2.7');
  assert.equal(handoff.wholeBodyBurst.powerFrame.oldTwoActorArmAuthorityRestored, true);
  assert.equal(handoff.channelIntent.freeArm, 'parent-chain-motion-no-explicit-flail');
});

test('R18I selects the exaggerated OLD B3 plan at impact for deflect activation from zero', () => {
  const source = parryPlan();
  const reaction = buildParriedReactionDefinition({ plan: source, outcome: 'parry' });

  assert.equal(reaction.accepted, true);
  assert.equal(reaction.stage, PARRIED_REACTION_DEFINITION_STAGE);
  assert.equal(reaction.id, PARRIED_REACTION_DEFINITION_IDS.PARRY);
  assert.strictEqual(reaction.basePlan, source);
  assert.equal(reaction.initialElapsedMs, 0);
  assert.equal(
    reaction.sourceBurst.activation,
    TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_ACTIVATIONS.DEFLECT_IMPULSE,
  );
  assert.equal(reaction.sourceBurst.powerFrame.entryElapsedMs, 0);
  assert.equal(reaction.sourceBurst.powerFrame.startsAtParryImpact, false);
  assert.equal(reaction.sourceBurst.powerFrame.startsAtDeflectImpulse, true);
  assert.ok(reaction.plan.body.pitchDegrees <= -32);
  assert.equal(reaction.profileOverrides.impulseEndMs, 112);
  assert.equal(reaction.profileOverrides.recoilEndMs, 300);
  assert.equal(reaction.profileOverrides.settleEndMs, 520);
  assert.equal(reaction.profileOverrides.powerFrameHoldMs, 96);
  assert.equal(reaction.profileOverrides.legStrengthScale, 1.95);
  assert.equal(reaction.timeline.releaseRestartsBody, false);
  assert.equal(
    reaction.channelPolicy.atImpact,
    'contact-pose-held-while-reaction-definition-is-selected',
  );
  assert.equal(
    reaction.channelPolicy.atDeflectImpulse,
    'canonical-full-body-old-b3-from-elapsed-zero',
  );
  assert.equal(reaction.channelPolicy.contactConstraintRunsBeforeVisibleReaction, true);
  assert.deepEqual(reaction.channelPolicy.contactCorrectionBones, ['upperarm.r', 'lowerarm.r', 'wrist.r']);
  assert.equal(reaction.channelPolicy.separateBalanceBreakRuntime, false);
});

test('R18I reaches the historical exaggerated silhouette on the deflect-started impulse peak', () => {
  const reaction = buildParriedReactionDefinition({ plan: parryPlan(), outcome: 'parry' });
  const peak = sampleAttackerRecoilPresentation(
    reaction.plan,
    reaction.timeline.impulsePeakMs,
    reaction.profileOverrides,
  );
  const chainPitchDegrees = peak.pose.chestPitchDegrees
    + peak.pose.spinePitchDegrees
    + peak.pose.hipsPitchDegrees;

  assert.equal(peak.phase, 'impulse');
  assert.ok(chainPitchDegrees <= -24.4);
  assert.ok(peak.pose.rightKneeBendDegrees >= 7);
  assert.ok(peak.pose.leftKneeBendDegrees > 3);
});

test('R18I keeps Block outside the Parried ReactionDefinition', () => {
  const reaction = buildParriedReactionDefinition({
    plan: parryPlan('blocked-weapon-bounce'),
    outcome: 'block',
  });
  assert.equal(reaction.accepted, false);
  assert.equal(reaction.reason, 'non-parry-outcome');
});
