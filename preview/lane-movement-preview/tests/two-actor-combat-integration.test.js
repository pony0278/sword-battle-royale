import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSynchronizedDefenderPayload,
  createTwoActorCombatIntegration,
  getAttackerRecoilDelayMs,
  TWO_ACTOR_COMBAT_PHASES,
  TWO_ACTOR_PARRY_IMPACT_REACTION_STAGE,
  TWO_ACTOR_PARRY_REACTION_CHANNELS,
  TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES,
  TWO_ACTOR_PARRY_SYNC_PROFILE,
  TWO_ACTOR_PARRY_SYNC_STAGE,
} from '../src/combat/two-actor-combat-integration.js';
import {
  createLongswordDirectionalAttackRuntime,
  LONGSWORD_ATTACK_PHASES,
} from '../src/combat/longsword-directional-attack-runtime.js';
import {
  createGuardStateMachine,
  GUARD_EVENTS,
  GUARD_STATES,
} from '../src/combat/guard-state-machine.js';
import { PARRIED_REACTION_DEFINITION_STAGE } from '../src/combat/parried-reaction-definition.js';

function createFakeAttackerRecoil({ completeAfter = 2 } = {}) {
  let activePlan = null;
  let updates = 0;
  let starts = 0;
  let lastStartOptions = null;
  const updateContexts = [];
  return {
    get active() { return Boolean(activePlan); },
    get starts() { return starts; },
    get updates() { return updates; },
    get updateContexts() { return updateContexts; },
    get lastStartOptions() { return lastStartOptions; },
    get snapshot() {
      return Object.freeze({ active: Boolean(activePlan), plan: activePlan, updates, starts });
    },
    start(plan, startOptions = {}) {
      if (activePlan) return Object.freeze({ accepted: false, reason: 'already-active', snapshot: this.snapshot });
      if (!plan?.planned) return Object.freeze({ accepted: false, reason: 'invalid-plan', snapshot: this.snapshot });
      activePlan = plan;
      updates = 0;
      starts += 1;
      lastStartOptions = startOptions;
      return Object.freeze({ accepted: true, snapshot: this.snapshot });
    },
    update(_deltaSeconds, context = {}) {
      if (!activePlan) return Object.freeze({ justCompleted: false, snapshot: this.snapshot });
      updateContexts.push(context);
      updates += 1;
      if (updates < completeAfter) {
        return Object.freeze({ justCompleted: false, sample: { phase: 'recoil' }, snapshot: this.snapshot });
      }
      const completedPlan = activePlan;
      activePlan = null;
      return Object.freeze({
        justCompleted: true,
        completed: Object.freeze({
          sequence: completedPlan.sequence,
          readyForAttackHandoff: true,
        }),
        snapshot: this.snapshot,
      });
    },
    reset() {
      activePlan = null;
      updates = 0;
      lastStartOptions = null;
      return this.snapshot;
    },
  };
}

function authoritativeContact(velocity = { x: 4.5, y: -0.4, z: 2.2 }) {
  return Object.freeze({
    contact: true,
    geometricContact: true,
    eligible: true,
    point: Object.freeze({ x: 0.11, y: 1.14, z: 0.22 }),
    incomingVelocity: Object.freeze({ ...velocity }),
    radialDistance: 0.08,
    bladeFraction: 0.62,
    sweepAlpha: 0.44,
  });
}

function createHarness({ enterOnly = false, completeAfter = 2 } = {}) {
  const attackRuntime = createLongswordDirectionalAttackRuntime();
  const guardMachine = createGuardStateMachine();
  guardMachine.send(GUARD_EVENTS.GUARD_PRESS);
  if (!enterOnly) guardMachine.send(GUARD_EVENTS.ENTER_COMPLETE);
  const attackerRecoil = createFakeAttackerRecoil({ completeAfter });
  const sampled = [];
  const integration = createTwoActorCombatIntegration({
    attackRuntime,
    guardMachine,
    attackerRecoil,
    sampleFrozenContactPose(interruption, exchange) {
      sampled.push(Object.freeze({
        sequence: interruption.sequence,
        clipId: interruption.clipId,
        sourceTimeSeconds: interruption.sourceTimeSeconds,
        outcome: exchange?.outcome || null,
      }));
    },
  });
  return { integration, attackRuntime, guardMachine, attackerRecoil, sampled };
}

function startIntoActive(harness, direction = 'right') {
  const started = harness.integration.startAttack(direction);
  assert.equal(started.accepted, true);
  const profile = harness.attackRuntime.snapshot.action.runtime;
  harness.attackRuntime.update(profile.activeStartSeconds * 1000 + 1);
  assert.equal(harness.attackRuntime.snapshot.phase, LONGSWORD_ATTACK_PHASES.ACTIVE);
  return harness.attackRuntime.snapshot;
}

test('R18I resolves Parry by selecting OLD B3 while live contact owns the frozen attacker pose', () => {
  const harness = createHarness();
  const active = startIntoActive(harness, 'right');
  const result = harness.integration.resolveContact({
    contact: authoritativeContact(),
    guardIntentAgeMs: 120,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.resolution.outcome, 'parry');
  assert.equal(result.resolution.attackSequence, active.sequence);
  assert.equal(result.recoilPlan.responseClass, 'parry-directional-recoil');
  assert.equal(result.attackerReaction.stage, PARRIED_REACTION_DEFINITION_STAGE);
  assert.equal(result.attackerReaction.initialElapsedMs, 0);
  assert.ok(Math.abs(result.baseRecoilPlan.body.pitchDegrees) < 10);
  assert.ok(Math.abs(result.recoilPlan.body.pitchDegrees) >= 25);
  assert.equal(result.attackerReaction.timeline.impulsePeakMs, 112);
  assert.equal(result.attackerReaction.channelPolicy.separateBalanceBreakRuntime, false);
  assert.equal(harness.attackerRecoil.lastStartOptions.initialElapsedMs, 0);
  assert.equal(harness.attackerRecoil.lastStartOptions.profileOverrides.impulseEndMs, 112);
  assert.equal(harness.attackerRecoil.lastStartOptions.profileOverrides.legStrengthScale, 1.95);
  assert.equal(harness.attackRuntime.interrupted, true);
  assert.equal(harness.attackRuntime.snapshot.phase, LONGSWORD_ATTACK_PHASES.INTERRUPTED);
  assert.equal(harness.guardMachine.state, GUARD_STATES.PARRY);
  assert.equal(harness.guardMachine.snapshot.lastTransition.authority, 'authoritative-combat');
  assert.equal(harness.attackerRecoil.starts, 1);
  assert.equal(harness.integration.snapshot.phase, TWO_ACTOR_COMBAT_PHASES.RECOIL);
  assert.equal(result.parryImpactEvent.stage, TWO_ACTOR_PARRY_IMPACT_REACTION_STAGE);
  assert.equal(result.parryImpactEvent.impactId, `parry-impact:${active.sequence}`);
  assert.equal(result.parryImpactEvent.attacker.reactionDefinitionSelectedAtImpact, true);
  assert.equal(result.parryImpactEvent.attacker.bodyReactionStartsAtImpact, true);
  assert.equal(result.parryImpactEvent.attacker.weaponArmReactionIntentStartsAtImpact, false);
  assert.equal(result.parryImpactEvent.attacker.visibleOldB3StartsAtDeflectImpulse, false);
  assert.equal(result.parryImpactEvent.attacker.visibleOldB3BodyStartsAtImpact, true);
  assert.equal(result.parryImpactEvent.attacker.weaponArmJoinsOldB3AtDeflectImpulse, true);
  assert.equal(
    result.parryImpactEvent.attacker.weaponArmOwnershipAtImpact,
    'live-contact-constraint-while-old-b3-body-runs',
  );
  assert.equal(result.parryImpactEvent.attacker.reactionDefinitionId, result.attackerReaction.id);
  assert.ok(result.parryImpactEvent.attacker.reactionPlanBackwardPitchDegrees >= 25);
  assert.equal(result.parryImpactEvent.attacker.reactionImpulsePeakMs, 112);
  assert.deepEqual(
    result.parryImpactEvent.channelOwnership.reactionIntentAtImpact,
    TWO_ACTOR_PARRY_REACTION_CHANNELS.LIVE_CONTACT_HOLD,
  );
  assert.equal(
    result.parryImpactEvent.channelOwnership.finalContactCorrectionAtImpact.appliesAfterReactionIntent,
    false,
  );
  assert.deepEqual(
    result.parryImpactEvent.channelOwnership.finalContactCorrectionAtImpact.bones,
    ['upperarm.r', 'lowerarm.r', 'wrist.r'],
  );
  assert.equal(result.parryImpactEvent.phaseGraph.impactCapturesContactPoseAndSelectsReaction, true);
  assert.equal(result.parryImpactEvent.phaseGraph.impactStartsFullReactionIntent, false);
  assert.equal(result.parryImpactEvent.phaseGraph.contactConstraintOwnsPreDeflectPose, true);
  assert.equal(result.parryImpactEvent.phaseGraph.deflectImpulseStartsCanonicalOldB3, true);
  assert.equal(result.parryImpactEvent.phaseGraph.releaseStartsSelectedPlanAtZero, true);
  assert.equal(
    result.parryImpactEvent.inspectionPolicy,
    'contact-qa-preferred-with-confirmed-real-parry-fail-safe-before-visible-old-b3',
  );
  assert.equal(result.snapshot.parryReactionClock.elapsedMs, 0);
});

test('G4.3B.5 pre-rolls defender Parry presentation without moving gameplay timing', () => {
  const harness = createHarness();
  startIntoActive(harness, 'right');
  const result = harness.integration.resolveContact({
    contact: authoritativeContact(),
    guardIntentAgeMs: 120,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.resolution.outcome, 'parry');
  assert.equal(result.defenderPayload.presentationSyncStage, TWO_ACTOR_PARRY_SYNC_STAGE);
  assert.equal(
    result.defenderPayload.presentationOffsetSeconds,
    TWO_ACTOR_PARRY_SYNC_PROFILE.presentationOffsetSeconds,
  );
  assert.equal(
    harness.guardMachine.snapshot.lastTransition.payload.presentationOffsetSeconds,
    TWO_ACTOR_PARRY_SYNC_PROFILE.presentationOffsetSeconds,
  );
  assert.equal(result.snapshot.activeExchange.defenderPresentationOffsetSeconds, 0.205);
});

test('G4.3B.5 authoritative contact continues predictive Parry presentation without rewinding', () => {
  const harness = createHarness();
  startIntoActive(harness, 'right');
  const result = harness.integration.resolveContact({
    contact: authoritativeContact(),
    guardIntentAgeMs: 120,
    defenderPresentationOffsetSeconds: 0.35,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.defenderPayload.presentationOffsetSeconds, 0.35);
  assert.equal(result.defenderPayload.predictivePresentationOffsetSeconds, 0.35);
  assert.equal(result.defenderPayload.presentationContinuitySource, 'predictive-contact-handoff-no-rewind');
  assert.equal(harness.guardMachine.snapshot.lastTransition.payload.presentationOffsetSeconds, 0.35);
  assert.equal(result.snapshot.activeExchange.defenderPresentationOffsetSeconds, 0.35);
});

test('G4.3B.5 predictive handoff cannot move defender behind configured Parry pre-roll', () => {
  const payload = buildSynchronizedDefenderPayload({
    outcome: 'parry',
    defender: { payload: { outcome: 'parry', grade: 'parry' } },
  }, {
    presentationOffsetSeconds: 0.205,
    defenderPresentationOffsetSeconds: 0.18,
  });

  assert.equal(payload.presentationOffsetSeconds, 0.205);
  assert.equal(payload.predictivePresentationOffsetSeconds, 0.18);
  assert.equal(payload.presentationContinuitySource, 'predictive-contact-handoff-no-rewind');
});

test('R18I selects the reaction at impact but parks visible OLD B3 until deflect release', () => {
  assert.equal(getAttackerRecoilDelayMs('block'), 0);
  assert.equal(getAttackerRecoilDelayMs('parry'), 0);
  assert.equal(getAttackerRecoilDelayMs('perfect-parry'), 0);

  const harness = createHarness({ completeAfter: 2 });
  startIntoActive(harness, 'right');
  const resolved = harness.integration.resolveContact({
    contact: authoritativeContact(),
    guardIntentAgeMs: 120,
  });
  assert.equal(resolved.snapshot.activeExchange.attackerRecoilDelayMs, 0);
  assert.equal(resolved.snapshot.parryReactionClock.defenderReactionStarted, true);
  assert.equal(resolved.snapshot.parryReactionClock.attackerReactionDefinitionSelected, true);
  assert.equal(resolved.snapshot.parryReactionClock.attackerVisibleOldB3StartsAtDeflectImpulse, true);
  assert.equal(resolved.parryImpactEvent.phaseGraph.impactStartsBodyImmediately, false);
  assert.equal(
    resolved.parryImpactEvent.phaseGraph.liveWeaponContactLatch,
    TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES.LIVE_CONTACT,
  );
  assert.equal(resolved.parryImpactEvent.phaseGraph.deflectImpulseStartsCanonicalOldB3, true);
  assert.equal(resolved.parryImpactEvent.phaseGraph.releaseStartsSelectedPlanAtZero, true);
  assert.equal(resolved.parryImpactEvent.phaseGraph.bodyRestartAtWeaponRelease, false);

  const firstFrame = harness.integration.update(0.01, {
    attackerRecoilChannels: TWO_ACTOR_PARRY_REACTION_CHANNELS.LIVE_CONTACT_HOLD,
    attackerRecoilPhaseLatch: TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES.LIVE_CONTACT,
  });
  assert.equal(firstFrame.recoilUpdate.delayedByContactSync, undefined);
  assert.equal(firstFrame.parryReactionClock.elapsedMs, 10);
  assert.equal(harness.attackerRecoil.updates, 1);
  assert.deepEqual(
    harness.attackerRecoil.updateContexts[0].channels,
    TWO_ACTOR_PARRY_REACTION_CHANNELS.LIVE_CONTACT_HOLD,
  );
  assert.equal(
    harness.attackerRecoil.updateContexts[0].phaseLatch,
    TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES.LIVE_CONTACT,
  );
  assert.equal(harness.attackRuntime.interrupted, true);

  const secondFrame = harness.integration.update(0.011);
  assert.equal(secondFrame.justCompleted, true);
  assert.equal(harness.attackerRecoil.updates, 2);
});

test('G4.3B.5 lets body recoil finish without releasing the contact-owned attack pose', () => {
  const harness = createHarness({ completeAfter: 1 });
  startIntoActive(harness, 'right');
  harness.integration.resolveContact({
    contact: authoritativeContact(),
    guardIntentAgeMs: 120,
  });

  const bodyComplete = harness.integration.update(0.39, {
    attackerRecoilChannels: TWO_ACTOR_PARRY_REACTION_CHANNELS.LIVE_CONTACT_REACTION_INTENT,
    holdAttackerInterruption: true,
  });
  assert.equal(bodyComplete.attackerReactionComplete, true);
  assert.equal(bodyComplete.attackerInterruptionHeldForContact, true);
  assert.equal(harness.integration.active, true);
  assert.equal(harness.attackRuntime.interrupted, true);

  const heldContactFrame = harness.integration.update(0.05, {
    attackerRecoilChannels: TWO_ACTOR_PARRY_REACTION_CHANNELS.LIVE_CONTACT_REACTION_INTENT,
    holdAttackerInterruption: true,
  });
  assert.equal(heldContactFrame.recoilUpdate.reactionAlreadyComplete, true);
  assert.equal(harness.attackerRecoil.updates, 1);
  assert.equal(heldContactFrame.parryReactionClock.elapsedMs, 440);
  assert.equal(harness.attackRuntime.interrupted, true);

  const released = harness.integration.update(0);
  assert.equal(released.justCompleted, true);
  assert.equal(harness.integration.active, false);
  assert.equal(harness.attackRuntime.interrupted, false);
  assert.equal(harness.integration.snapshot.lastExchange.attackerReactionCompletedAtMs, 390);
});

test('G4.3B.5 does not pre-roll ordinary Block presentation', () => {
  const payload = buildSynchronizedDefenderPayload({
    outcome: 'block',
    defender: { payload: { outcome: 'block', grade: 'block' } },
  });
  assert.equal(payload.presentationOffsetSeconds, undefined);
  assert.equal(payload.presentationSyncStage, undefined);
});

test('G4.3B.4 bridges guard_enter so an early Perfect Parry reaches the defender Parry state', () => {
  const harness = createHarness({ enterOnly: true });
  startIntoActive(harness, 'left');
  assert.equal(harness.guardMachine.state, GUARD_STATES.ENTER);

  const result = harness.integration.resolveContact({
    contact: authoritativeContact({ x: -5.2, y: 0.1, z: 1.4 }),
    guardIntentAgeMs: 50,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.resolution.outcome, 'perfect-parry');
  assert.equal(result.snapshot.activeExchange.enterBridgeApplied, true);
  assert.equal(result.enterBridge.accepted, true);
  assert.equal(harness.guardMachine.state, GUARD_STATES.PARRY);
  assert.equal(harness.guardMachine.snapshot.lastTransition.payload.perfect, true);
  assert.equal(harness.guardMachine.snapshot.presentation.reactionVariant, 'perfect-parry');
  assert.equal(
    harness.guardMachine.snapshot.lastTransition.payload.presentationOffsetSeconds,
    TWO_ACTOR_PARRY_SYNC_PROFILE.presentationOffsetSeconds,
  );
});

test('G4.3B.4 ordinary Block uses the same exchange path but selects block-hit and short bounce', () => {
  const harness = createHarness();
  startIntoActive(harness, 'top');

  const result = harness.integration.resolveContact({
    contact: authoritativeContact({ x: 0.2, y: -6.4, z: 0.6 }),
    guardIntentAgeMs: 260,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.resolution.outcome, 'block');
  assert.equal(result.recoilPlan.responseClass, 'blocked-weapon-bounce');
  assert.equal(result.resolution.advantage.granted, false);
  assert.equal(harness.guardMachine.state, GUARD_STATES.BLOCK_HIT);
  assert.equal(harness.attackRuntime.interrupted, true);
});

test('G4.3B.4 suppresses duplicate contact frames for the same attack sequence', () => {
  const harness = createHarness();
  startIntoActive(harness, 'right');
  const first = harness.integration.resolveContact({
    contact: authoritativeContact(),
    guardIntentAgeMs: 110,
  });
  const guardSequenceAfterFirst = harness.guardMachine.snapshot.sequence;
  const second = harness.integration.resolveContact({
    contact: authoritativeContact(),
    guardIntentAgeMs: 112,
  });

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.equal(second.reason, 'attack-sequence-already-resolved');
  assert.equal(second.resolution.duplicate, true);
  assert.equal(harness.attackerRecoil.starts, 1);
  assert.equal(harness.guardMachine.snapshot.sequence, guardSequenceAfterFirst);
});

test('G4.3B.4 samples the exact contact base pose before every shared-clock additive recoil update', () => {
  const harness = createHarness({ completeAfter: 3 });
  startIntoActive(harness, 'left');
  const resolved = harness.integration.resolveContact({
    contact: authoritativeContact({ x: -4.8, y: 0.25, z: 1.9 }),
    guardIntentAgeMs: 130,
  });
  const frozenTime = harness.attackRuntime.snapshot.sourceTimeSeconds;

  const firstUpdate = harness.integration.update(1 / 60);
  assert.equal(firstUpdate.updated, true);
  assert.equal(firstUpdate.sampledFrozenPose, true);
  assert.equal(firstUpdate.recoilUpdate.delayedByContactSync, undefined);
  assert.equal(harness.sampled.length, 1);
  assert.equal(harness.sampled[0].sourceTimeSeconds, frozenTime);
  assert.equal(harness.attackRuntime.interrupted, true);

  const secondUpdate = harness.integration.update(1 / 60);
  assert.equal(secondUpdate.updated, true);
  assert.equal(secondUpdate.justCompleted, undefined);
  assert.equal(harness.sampled.length, 2);
  assert.equal(harness.sampled[1].sourceTimeSeconds, frozenTime);
  assert.equal(harness.attackRuntime.interrupted, true);

  const thirdUpdate = harness.integration.update(1 / 60);
  assert.equal(thirdUpdate.justCompleted, true);
  assert.equal(harness.sampled.length, 3);
  assert.equal(harness.sampled[2].sourceTimeSeconds, frozenTime);
  assert.equal(harness.attackRuntime.interrupted, false);
  assert.equal(harness.attackRuntime.snapshot.phase, LONGSWORD_ATTACK_PHASES.IDLE);
  assert.equal(harness.integration.active, false);
  assert.equal(harness.integration.snapshot.lastExchange.sequence, resolved.resolution.attackSequence);
  assert.equal(harness.integration.snapshot.lastExchange.attackerHandoffReleased, true);
});

test('G4.3B.4 ignores non-authoritative contact without mutating either actor', () => {
  const harness = createHarness();
  startIntoActive(harness, 'right');
  const guardSequence = harness.guardMachine.snapshot.sequence;

  const result = harness.integration.resolveContact({
    contact: {
      contact: false,
      geometricContact: false,
      eligible: true,
    },
    guardIntentAgeMs: 90,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'no-authoritative-contact');
  assert.equal(harness.attackRuntime.interrupted, false);
  assert.equal(harness.attackRuntime.snapshot.phase, LONGSWORD_ATTACK_PHASES.ACTIVE);
  assert.equal(harness.guardMachine.snapshot.sequence, guardSequence);
  assert.equal(harness.attackerRecoil.starts, 0);
});
