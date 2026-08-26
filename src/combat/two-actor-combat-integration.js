import { createLongswordDirectionalAttackRuntime } from './longsword-directional-attack-runtime.js';
import { createGuardStateMachine, GUARD_EVENTS, GUARD_STATES } from './guard-state-machine.js';
import { createGuardOutcomeResolutionGate } from './guard-outcome-resolution.js';
import {
  SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY,
} from './swept-contact-temporal-eligibility.js';
import { createDirectionalRecoilPlanner } from './directional-recoil-planner.js';
import {
  ATTACKER_RECOIL_PRESENTATION_PHASE_LATCHES,
  createAttackerRecoilPresentationRuntime,
} from './attacker-recoil-presentation.js?v=g43b5r281-arm-fling-r18p1';
import { buildParriedReactionDefinition } from './parried-reaction-definition.js?v=g43b5r281-step3b-body-fusion-r18o';

export const TWO_ACTOR_COMBAT_INTEGRATION_STAGE = 'G4.3B.4';
export const TWO_ACTOR_PARRY_SYNC_STAGE = 'G4.3B.5';
export const TWO_ACTOR_RECOIL_PRESENTATION_AUTHORITY_STAGE = 'G4.3B.5R.2.3';
export const TWO_ACTOR_PARRY_IMPACT_REACTION_STAGE = 'G4.3B.5R.3.3';

export const TWO_ACTOR_PARRY_REACTION_CHANNELS = Object.freeze({
  FULL_RECOIL: Object.freeze({
    torso: true,
    torsoYawRoll: true,
    legs: true,
    weaponArm: true,
  }),
  LIVE_CONTACT_BODY: Object.freeze({
    torso: true,
    torsoYawRoll: false,
    legs: true,
    weaponArm: false,
  }),
  LIVE_CONTACT_REACTION_INTENT: Object.freeze({
    torso: true,
    torsoYawRoll: true,
    legs: true,
    weaponArm: true,
  }),
  LIVE_CONTACT_HOLD: Object.freeze({
    torso: false,
    torsoYawRoll: false,
    legs: false,
    weaponArm: false,
  }),
});

export const TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES = Object.freeze({
  LIVE_CONTACT: ATTACKER_RECOIL_PRESENTATION_PHASE_LATCHES.CONTACT_ORIGIN,
  // Step 3B fusion: the body clock runs from impact and parks at the authored
  // impulse peak until the defender's DEFLECT_IMPULSE releases the weapon arm.
  LIVE_CONTACT_IMPULSE_PEAK: ATTACKER_RECOIL_PRESENTATION_PHASE_LATCHES.IMPULSE_PEAK,
});

export const TWO_ACTOR_PARRY_SYNC_PROFILE = Object.freeze({
  presentationOffsetSeconds: 0.205,
  parryAttackerRecoilDelayMs: 0,
  perfectParryAttackerRecoilDelayMs: 0,
});

export const TWO_ACTOR_COMBAT_PHASES = Object.freeze({
  IDLE: 'idle',
  ATTACKING: 'attacking',
  RECOIL: 'attacker-recoil',
});

function freeze(value) {
  return Object.freeze(value);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function frozenVector(value = {}) {
  return freeze({
    x: finite(value?.x),
    y: finite(value?.y),
    z: finite(value?.z),
  });
}

export function buildParryImpactReactionEvent(input = {}) {
  const resolution = input.resolution || {};
  const outcome = String(resolution.outcome || '');
  if (outcome !== 'parry' && outcome !== 'perfect-parry') return null;

  const interruption = input.interruption || {};
  const defenderPayload = input.defenderPayload || {};
  const attackerReaction = input.attackerReaction || null;
  const sequence = resolution.attackSequence ?? null;
  const attackDirection = resolution.attackDirection || null;
  return freeze({
    stage: TWO_ACTOR_PARRY_IMPACT_REACTION_STAGE,
    impactId: `parry-impact:${sequence ?? 'unknown'}`,
    sequence,
    attackDirection,
    outcome,
    responseClass: resolution.attacker?.responseClass || null,
    contact: freeze({
      point: frozenVector(resolution.contact?.point),
      incomingVelocity: frozenVector(resolution.contact?.incomingVelocity),
    }),
    sourcePose: freeze({
      clipId: interruption.clipId || null,
      sourceTimeSeconds: Math.max(0, finite(interruption.sourceTimeSeconds)),
    }),
    defender: freeze({
      event: resolution.defender?.event || null,
      reactionVariant: resolution.defender?.reactionVariant || null,
      presentationSourceTimeSeconds: Math.max(0, finite(defenderPayload.presentationOffsetSeconds)),
      semanticMarker: 'deflect-impulse',
    }),
    attacker: freeze({
      reactionDefinitionSelectedAtImpact: true,
      bodyReactionStartsAtImpact: true,
      weaponArmReactionIntentStartsAtImpact: false,
      visibleOldB3StartsAtDeflectImpulse: false,
      visibleOldB3BodyStartsAtImpact: true,
      weaponArmJoinsOldB3AtDeflectImpulse: true,
      weaponArmOwnershipAtImpact: 'live-contact-constraint-while-old-b3-body-runs',
      weaponArmOwnershipAfterRelease: 'old-b3-weapon-arm-joins-running-body-after-continuity-bridge',
      reactionDefinitionId: attackerReaction?.id || null,
      reactionPlanBackwardPitchDegrees: attackerReaction?.silhouette?.backwardPitchDegrees ?? null,
      reactionImpulsePeakMs: attackerReaction?.timeline?.impulsePeakMs ?? null,
    }),
    channelOwnership: freeze({
      atImpact: TWO_ACTOR_PARRY_REACTION_CHANNELS.LIVE_CONTACT_HOLD,
      reactionIntentAtImpact: TWO_ACTOR_PARRY_REACTION_CHANNELS.LIVE_CONTACT_HOLD,
      finalContactCorrectionAtImpact: freeze({
        appliesAfterReactionIntent: false,
        bones: freeze(['upperarm.r', 'lowerarm.r', 'wrist.r']),
        propagatedBones: freeze(['hand.r', 'handslot.r']),
        shoulderPropagationActive: false,
      }),
      atDeflectImpulse: TWO_ACTOR_PARRY_REACTION_CHANNELS.FULL_RECOIL,
      afterWeaponRelease: TWO_ACTOR_PARRY_REACTION_CHANNELS.FULL_RECOIL,
    }),
    phaseGraph: freeze({
      impactCapturesContactPoseAndSelectsReaction: true,
      impactStartsBodyImmediately: false,
      impactStartsFullReactionIntent: false,
      contactConstraintOwnsPreDeflectPose: true,
      deflectImpulseStartsCanonicalOldB3: true,
      continuityBridgeBeforeVisibleImpulse: true,
      liveWeaponContactLatch: TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES.LIVE_CONTACT,
      releaseStartsSelectedPlanAtZero: true,
      bodyRestartAtWeaponRelease: false,
    }),
    clock: freeze({
      origin: 'authoritative-swept-shield-sword-contact',
      elapsedMs: 0,
    }),
    inspectionPolicy: 'contact-qa-preferred-with-confirmed-real-parry-fail-safe-before-visible-old-b3',
    authority: 'impact-selects-reaction-deflect-impulse-starts-visible-old-b3',
  });
}

export function sampleParryImpactReactionClock(event, elapsedMs = 0) {
  if (!event || event.stage !== TWO_ACTOR_PARRY_IMPACT_REACTION_STAGE) return null;
  return freeze({
    stage: TWO_ACTOR_PARRY_IMPACT_REACTION_STAGE,
    impactId: event.impactId,
    elapsedMs: Math.max(0, finite(elapsedMs)),
    defenderReactionStarted: true,
    attackerReactionDefinitionSelected: true,
    attackerVisibleOldB3StartsAtDeflectImpulse: true,
    authority: 'impact-clock-observes-contact-deflect-impulse-starts-old-b3-presentation-clock',
  });
}

export function getAttackerRecoilDelayMs(outcome, overrides = {}) {
  const value = String(outcome || '');
  if (value === 'perfect-parry') {
    return clamp(
      overrides.perfectParryAttackerRecoilDelayMs
        ?? TWO_ACTOR_PARRY_SYNC_PROFILE.perfectParryAttackerRecoilDelayMs,
      0,
      80,
    );
  }
  if (value === 'parry') {
    return clamp(
      overrides.parryAttackerRecoilDelayMs
        ?? TWO_ACTOR_PARRY_SYNC_PROFILE.parryAttackerRecoilDelayMs,
      0,
      80,
    );
  }
  return 0;
}

export function buildSynchronizedDefenderPayload(resolution, overrides = {}) {
  const payload = resolution?.defender?.payload || {};
  const outcome = String(resolution?.outcome || '');
  const parry = outcome === 'parry' || outcome === 'perfect-parry';
  if (!parry) return freeze({ ...payload });
  const configuredPresentationOffsetSeconds = clamp(
    overrides.presentationOffsetSeconds ?? TWO_ACTOR_PARRY_SYNC_PROFILE.presentationOffsetSeconds,
    0,
    0.35,
  );
  const predictivePresentationOffset = Number(overrides.defenderPresentationOffsetSeconds);
  const predictiveHandoffAvailable = Number.isFinite(predictivePresentationOffset)
    && predictivePresentationOffset >= 0;
  const presentationOffsetSeconds = clamp(
    Math.max(
      configuredPresentationOffsetSeconds,
      predictiveHandoffAvailable ? predictivePresentationOffset : 0,
    ),
    0,
    0.35,
  );
  return freeze({
    ...payload,
    presentationOffsetSeconds,
    predictivePresentationOffsetSeconds: predictiveHandoffAvailable
      ? predictivePresentationOffset
      : null,
    presentationContinuitySource: predictiveHandoffAvailable
      ? 'predictive-contact-handoff-no-rewind'
      : 'configured-parry-preroll',
    presentationSyncStage: TWO_ACTOR_PARRY_SYNC_STAGE,
    presentationSyncIntent: 'defender-deflect-motion-leads-attacker-recoil-after-authoritative-contact',
  });
}

function integrationFailure(reason, snapshot, extra = {}) {
  return freeze({
    stage: TWO_ACTOR_COMBAT_INTEGRATION_STAGE,
    accepted: false,
    reason,
    ...extra,
    snapshot,
  });
}

export function createTwoActorCombatIntegration(options = {}) {
  const attackRuntime = options.attackRuntime || createLongswordDirectionalAttackRuntime(options.attackOptions);
  const guardMachine = options.guardMachine || createGuardStateMachine(options.guardOptions);
  const outcomeGate = options.outcomeGate || createGuardOutcomeResolutionGate(options.outcomeOptions);
  const recoilPlanner = options.recoilPlanner || createDirectionalRecoilPlanner(options.recoilOptions);
  const attackerCharacter = options.attackerCharacter || null;
  const parrySync = options.parrySync || {};
  const sampleFrozenContactPose = typeof options.sampleFrozenContactPose === 'function'
    ? options.sampleFrozenContactPose
    : null;
  const attackerRecoil = options.attackerRecoil || (
    options.THREE && attackerCharacter?.rig
      ? createAttackerRecoilPresentationRuntime(options.THREE, {
          rig: attackerCharacter.rig,
          profile: options.attackerRecoilProfile,
        })
      : null
  );

  if (!attackRuntime?.start || !attackRuntime?.interrupt || !attackRuntime?.releaseInterruption) {
    throw new Error('G4.3B.4 requires the G4.3B.1 attack interruption runtime');
  }
  if (!guardMachine?.send || !guardMachine?.can) {
    throw new Error('G4.3B.4 requires a guard state machine');
  }
  if (!outcomeGate?.resolve || !outcomeGate?.reset) {
    throw new Error('G4.3B.4 requires the G4.3A.4 outcome resolution gate');
  }
  if (!recoilPlanner?.plan) {
    throw new Error('G4.3B.4 requires the G4.3B.2 directional recoil planner');
  }
  if (!attackerRecoil?.start || !attackerRecoil?.update || !attackerRecoil?.reset) {
    throw new Error('G4.3B.4 requires the G4.3B.3 attacker recoil presentation runtime');
  }
  if (!sampleFrozenContactPose && !attackerCharacter?.sampleAnimation) {
    throw new Error('G4.3B.4 requires a frozen-contact-pose sampler');
  }

  let activeExchange = null;
  let lastExchange = null;
  let lastFailure = null;
  let exchangeElapsedMs = 0;
  let attackerReactionComplete = false;
  let completedAttackerReaction = null;
  let attackerReactionCompletedAtMs = null;

  function phase() {
    if (activeExchange) return TWO_ACTOR_COMBAT_PHASES.RECOIL;
    if (attackRuntime.active || attackRuntime.interrupted) return TWO_ACTOR_COMBAT_PHASES.ATTACKING;
    return TWO_ACTOR_COMBAT_PHASES.IDLE;
  }

  function snapshot(extra = {}) {
    const parryImpactEvent = activeExchange?.parryImpactEvent || lastExchange?.parryImpactEvent || null;
    const parryReactionElapsedMs = activeExchange
      ? exchangeElapsedMs
      : lastExchange?.exchangeDurationMs ?? 0;
    return freeze({
      stage: TWO_ACTOR_COMBAT_INTEGRATION_STAGE,
      presentationSyncStage: TWO_ACTOR_PARRY_SYNC_STAGE,
      recoilPresentationAuthorityStage: TWO_ACTOR_RECOIL_PRESENTATION_AUTHORITY_STAGE,
      phase: phase(),
      attack: attackRuntime.snapshot,
      defenderGuard: guardMachine.snapshot,
      attackerRecoil: attackerRecoil.snapshot || null,
      activeExchange,
      exchangeElapsedMs,
      attackerReactionComplete,
      attackerReactionCompletedAtMs,
      parryImpactEvent,
      parryReactionClock: sampleParryImpactReactionClock(parryImpactEvent, parryReactionElapsedMs),
      lastExchange,
      lastFailure,
      authority: 'two-actor-combat-orchestration',
      ...extra,
    });
  }

  function rememberFailure(reason, details = {}) {
    lastFailure = freeze({
      stage: TWO_ACTOR_COMBAT_INTEGRATION_STAGE,
      reason,
      ...details,
    });
    return lastFailure;
  }

  function rollbackResolvedSequence(sequence) {
    attackerRecoil.reset();
    if (attackRuntime.interrupted) attackRuntime.releaseInterruption();
    outcomeGate.reset(sequence);
    exchangeElapsedMs = 0;
    attackerReactionComplete = false;
    completedAttackerReaction = null;
    attackerReactionCompletedAtMs = null;
  }

  function startAttack(direction, startOptions = {}) {
    if (activeExchange || attackerRecoil.active || attackRuntime.interrupted) {
      return integrationFailure('combat-exchange-still-active', snapshot());
    }
    const started = attackRuntime.start(direction, startOptions);
    if (!started.accepted) {
      rememberFailure(started.reason || 'attack-start-rejected');
      return integrationFailure(started.reason || 'attack-start-rejected', snapshot(), { attackStart: started });
    }
    lastFailure = null;
    return freeze({
      stage: TWO_ACTOR_COMBAT_INTEGRATION_STAGE,
      accepted: true,
      reason: 'attack-started',
      attackStart: started,
      snapshot: snapshot(),
    });
  }

  function canDispatchDefenderEvent(event) {
    if (guardMachine.can(event)) return true;
    return guardMachine.state === GUARD_STATES.ENTER
      && guardMachine.guardHeld === true
      && guardMachine.can(GUARD_EVENTS.ENTER_COMPLETE)
      && (event === GUARD_EVENTS.BLOCK_CONFIRMED || event === GUARD_EVENTS.PARRY_CONFIRMED);
  }

  function bridgeGuardEnterForCombatOutcome(resolution) {
    if (guardMachine.state !== GUARD_STATES.ENTER) return null;
    const bridged = guardMachine.send(GUARD_EVENTS.ENTER_COMPLETE, {
      stage: TWO_ACTOR_COMBAT_INTEGRATION_STAGE,
      source: 'authoritative-combat-outcome-bridge',
      attackSequence: resolution.attackSequence,
      outcome: resolution.outcome,
    });
    return bridged;
  }

  function resolveContact(input = {}) {
    if (activeExchange) {
      const duplicate = outcomeGate.resolve({
        attackSequence: activeExchange.sequence,
        attackDirection: activeExchange.attackDirection,
        attackPhase: 'attack_active',
        contact: input.contact || input,
        guardSnapshot: guardMachine.snapshot,
        guardIntentAgeMs: input.guardIntentAgeMs,
      });
      return freeze({
        stage: TWO_ACTOR_COMBAT_INTEGRATION_STAGE,
        accepted: false,
        reason: duplicate.duplicate ? 'attack-sequence-already-resolved' : 'combat-exchange-already-active',
        resolution: duplicate,
        snapshot: snapshot(),
      });
    }

    const attackSnapshot = attackRuntime.snapshot;
    const contact = input.contact || input;
    const temporalEligibility = contact?.temporalEligibility || null;
    const sweptTemporalAuthority = temporalEligibility?.authority === SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY;
    const effectiveAttackPhase = sweptTemporalAuthority && temporalEligibility.eligible === true
      ? 'attack_active'
      : attackSnapshot.phase;
    const resolution = outcomeGate.resolve({
      attackSequence: attackSnapshot.sequence,
      attackDirection: attackSnapshot.direction,
      attackPhase: effectiveAttackPhase,
      contact,
      guardSnapshot: input.guardSnapshot || guardMachine.snapshot,
      guardIntentAgeMs: input.guardIntentAgeMs,
    });

    if (!resolution.resolved) {
      return integrationFailure(resolution.reason || 'guard-outcome-not-resolved', snapshot(), { resolution });
    }
    if (resolution.duplicate || !resolution.emitGuardEvent) {
      return integrationFailure('attack-sequence-already-resolved', snapshot(), { resolution });
    }
    if (!canDispatchDefenderEvent(resolution.defender.event)) {
      outcomeGate.reset(resolution.attackSequence);
      rememberFailure('defender-event-not-dispatchable', {
        attackSequence: resolution.attackSequence,
        event: resolution.defender.event,
      });
      return integrationFailure('defender-event-not-dispatchable', snapshot(), { resolution });
    }

    const interrupted = attackRuntime.interrupt({
      resolution,
      contactTemporalEligibility: sweptTemporalAuthority ? temporalEligibility : null,
    });
    if (!interrupted.accepted) {
      outcomeGate.reset(resolution.attackSequence);
      rememberFailure(interrupted.reason || 'attack-interrupt-rejected', {
        attackSequence: resolution.attackSequence,
      });
      return integrationFailure(interrupted.reason || 'attack-interrupt-rejected', snapshot(), {
        resolution,
        interrupted,
      });
    }

    const baseRecoilPlan = recoilPlanner.plan(interrupted.snapshot);
    if (!baseRecoilPlan.planned) {
      rollbackResolvedSequence(resolution.attackSequence);
      rememberFailure(baseRecoilPlan.reason || 'recoil-plan-rejected', {
        attackSequence: resolution.attackSequence,
      });
      return integrationFailure(baseRecoilPlan.reason || 'recoil-plan-rejected', snapshot(), {
        resolution,
        interrupted,
        recoilPlan: baseRecoilPlan,
        baseRecoilPlan,
      });
    }

    const parryOutcome = resolution.outcome === 'parry' || resolution.outcome === 'perfect-parry';
    const attackerReaction = parryOutcome
      ? buildParriedReactionDefinition({
          plan: baseRecoilPlan,
          outcome: resolution.outcome,
        })
      : null;
    if (parryOutcome && !attackerReaction?.accepted) {
      rollbackResolvedSequence(resolution.attackSequence);
      rememberFailure(attackerReaction?.reason || 'attacker-reaction-definition-rejected', {
        attackSequence: resolution.attackSequence,
      });
      return integrationFailure(
        attackerReaction?.reason || 'attacker-reaction-definition-rejected',
        snapshot(),
        { resolution, interrupted, baseRecoilPlan, attackerReaction },
      );
    }

    const recoilPlan = attackerReaction?.accepted ? attackerReaction.plan : baseRecoilPlan;
    const recoilStart = attackerRecoil.start(recoilPlan, attackerReaction?.accepted
      ? {
          initialElapsedMs: attackerReaction.initialElapsedMs,
          profileOverrides: attackerReaction.profileOverrides,
          reactionDefinition: attackerReaction,
        }
      : {});
    if (!recoilStart.accepted) {
      rollbackResolvedSequence(resolution.attackSequence);
      rememberFailure(recoilStart.reason || 'attacker-recoil-start-rejected', {
        attackSequence: resolution.attackSequence,
      });
      return integrationFailure(recoilStart.reason || 'attacker-recoil-start-rejected', snapshot(), {
        resolution,
        interrupted,
        baseRecoilPlan,
        attackerReaction,
        recoilPlan,
        recoilStart,
      });
    }

    const enterBridge = bridgeGuardEnterForCombatOutcome(resolution);
    const defenderPayload = buildSynchronizedDefenderPayload(resolution, {
      ...parrySync,
      defenderPresentationOffsetSeconds: input.defenderPresentationOffsetSeconds,
    });
    const defenderDispatch = guardMachine.send(resolution.defender.event, defenderPayload);
    if (!defenderDispatch.accepted) {
      rollbackResolvedSequence(resolution.attackSequence);
      rememberFailure('defender-event-dispatch-failed', {
        attackSequence: resolution.attackSequence,
        event: resolution.defender.event,
      });
      return integrationFailure('defender-event-dispatch-failed', snapshot(), {
        resolution,
        interrupted,
        baseRecoilPlan,
        attackerReaction,
        recoilPlan,
        recoilStart,
        enterBridge,
        defenderPayload,
        defenderDispatch,
      });
    }

    const attackerRecoilDelayMs = getAttackerRecoilDelayMs(resolution.outcome, parrySync);
    const parryImpactEvent = buildParryImpactReactionEvent({
      resolution,
      interruption: interrupted.snapshot.interruption,
      defenderPayload,
      attackerReaction,
    });
    exchangeElapsedMs = 0;
    attackerReactionComplete = false;
    completedAttackerReaction = null;
    attackerReactionCompletedAtMs = null;
    activeExchange = freeze({
      stage: TWO_ACTOR_COMBAT_INTEGRATION_STAGE,
      presentationSyncStage: TWO_ACTOR_PARRY_SYNC_STAGE,
      recoilPresentationAuthorityStage: TWO_ACTOR_RECOIL_PRESENTATION_AUTHORITY_STAGE,
      sequence: resolution.attackSequence,
      attackDirection: resolution.attackDirection,
      outcome: resolution.outcome,
      responseClass: resolution.attacker.responseClass,
      resolution,
      interruption: interrupted.snapshot.interruption,
      baseRecoilPlan,
      attackerReaction,
      recoilPlan,
      defenderEvent: resolution.defender.event,
      defenderReactionVariant: resolution.defender.reactionVariant,
      defenderPresentationOffsetSeconds: defenderPayload.presentationOffsetSeconds || 0,
      attackerRecoilDelayMs,
      parryImpactEvent,
      enterBridgeApplied: Boolean(enterBridge?.accepted),
    });
    lastFailure = null;

    return freeze({
      stage: TWO_ACTOR_COMBAT_INTEGRATION_STAGE,
      accepted: true,
      reason: 'two-actor-combat-exchange-resolved',
      resolution,
      interrupted,
      baseRecoilPlan,
      attackerReaction,
      recoilPlan,
      recoilStart,
      enterBridge,
      defenderPayload,
      defenderDispatch,
      parryImpactEvent,
      snapshot: snapshot(),
    });
  }

  function sampleFrozenPose(context = {}) {
    const interruption = attackRuntime.snapshot.interruption;
    if (!interruption) return false;

    if (sampleFrozenContactPose) {
      sampleFrozenContactPose(interruption, activeExchange, context);
      return true;
    }

    attackerCharacter.sampleAnimation(interruption.clipId, interruption.sourceTimeSeconds, {
      loop: false,
      inPlace: interruption.inPlace !== false,
      rootRotationPolicy: interruption.rootRotationPolicy,
    });
    attackerCharacter.update?.(0, context.camera || options.camera);
    return true;
  }

  function refreshAttackerPresentationAfterRecoil(recoilDeltaSeconds, context = {}) {
    if (recoilDeltaSeconds <= 0 || typeof attackerCharacter?.update !== 'function') return false;
    attackerCharacter.update(0, context.camera || options.camera);
    return true;
  }

  function update(deltaSeconds = 1 / 60, context = {}) {
    if (!activeExchange) return snapshot({ updated: false });

    const sampledFrozenPose = sampleFrozenPose(context);
    const deltaMs = Math.max(0, finite(deltaSeconds, 1 / 60)) * 1000;
    const previousElapsedMs = exchangeElapsedMs;
    exchangeElapsedMs += deltaMs;
    const delayMs = activeExchange.attackerRecoilDelayMs || 0;
    const previousRecoilMs = Math.max(0, previousElapsedMs - delayMs);
    const currentRecoilMs = Math.max(0, exchangeElapsedMs - delayMs);
    const recoilDeltaSeconds = Math.max(0, currentRecoilMs - previousRecoilMs) / 1000;
    const recoilUpdate = attackerReactionComplete
      ? freeze({
          justCompleted: false,
          reactionAlreadyComplete: true,
          completed: completedAttackerReaction,
          snapshot: attackerRecoil.snapshot || null,
        })
      : recoilDeltaSeconds > 0
        ? attackerRecoil.update(recoilDeltaSeconds, freeze({
            channels: context.attackerRecoilChannels,
            phaseLatch: context.attackerRecoilPhaseLatch,
            parryImpactEvent: activeExchange.parryImpactEvent || null,
          }))
        : freeze({
            justCompleted: false,
            delayedByContactSync: true,
            remainingDelayMs: Math.max(0, delayMs - exchangeElapsedMs),
            snapshot: attackerRecoil.snapshot || null,
          });
    const attackerVisualRefreshApplied = refreshAttackerPresentationAfterRecoil(
      attackerReactionComplete ? 0 : recoilDeltaSeconds,
      context,
    );
    const completedThisFrame = recoilUpdate?.justCompleted === true
      || recoilUpdate?.completed?.readyForAttackHandoff === true;
    if (completedThisFrame && !attackerReactionComplete) {
      attackerReactionComplete = true;
      completedAttackerReaction = recoilUpdate.completed || null;
      attackerReactionCompletedAtMs = exchangeElapsedMs;
    }
    const completed = attackerReactionComplete;

    if (!completed) {
      return snapshot({
        updated: true,
        sampledFrozenPose,
        recoilUpdate,
        attackerVisualRefreshApplied,
      });
    }

    if (context.holdAttackerInterruption === true) {
      return snapshot({
        updated: true,
        sampledFrozenPose,
        recoilUpdate,
        attackerVisualRefreshApplied,
        attackerReactionComplete: true,
        attackerInterruptionHeldForContact: true,
      });
    }

    const completedExchange = activeExchange;
    const released = attackRuntime.releaseInterruption();
    lastExchange = freeze({
      ...completedExchange,
      exchangeDurationMs: exchangeElapsedMs,
      attackerReactionCompletedAtMs,
      completed: released.accepted === true,
      attackerHandoffReleased: released.accepted === true,
      defenderStateAtAttackerHandoff: guardMachine.state,
    });
    activeExchange = null;
    exchangeElapsedMs = 0;
    attackerReactionComplete = false;
    completedAttackerReaction = null;
    attackerReactionCompletedAtMs = null;

    if (!released.accepted) {
      rememberFailure(released.reason || 'attack-interruption-release-failed', {
        attackSequence: completedExchange.sequence,
      });
    }

    return snapshot({
      updated: true,
      sampledFrozenPose,
      recoilUpdate,
      attackerVisualRefreshApplied,
      justCompleted: true,
      released,
    });
  }

  function reset({ resetGuard = false } = {}) {
    attackerRecoil.reset();
    attackRuntime.reset();
    outcomeGate.reset();
    activeExchange = null;
    exchangeElapsedMs = 0;
    attackerReactionComplete = false;
    completedAttackerReaction = null;
    attackerReactionCompletedAtMs = null;
    lastExchange = null;
    lastFailure = null;
    if (resetGuard) guardMachine.send(GUARD_EVENTS.RESET, { stage: TWO_ACTOR_COMBAT_INTEGRATION_STAGE });
    return snapshot();
  }

  return freeze({
    get snapshot() { return snapshot(); },
    get active() { return Boolean(activeExchange); },
    get attackRuntime() { return attackRuntime; },
    get guardMachine() { return guardMachine; },
    get recoilPlanner() { return recoilPlanner; },
    get attackerRecoil() { return attackerRecoil; },
    startAttack,
    resolveContact,
    update,
    reset,
  });
}
