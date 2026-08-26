import {
  TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_ACTIVATIONS,
  TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE,
  buildTwoActorWholeBodyRecoilBurst,
} from './two-actor-whole-body-recoil-burst.js?v=g43b5r281-slip-release-r18p5';

export const PARRIED_REACTION_DEFINITION_STAGE = 'G4.3B.5R.3.4';

export const PARRIED_REACTION_DEFINITION_IDS = Object.freeze({
  PARRY: 'attacker-parried-old-b3-whole-body',
  PERFECT_PARRY: 'attacker-perfect-parried-old-b3-whole-body',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resolveDefinitionId(outcome) {
  if (outcome === 'parry') return PARRIED_REACTION_DEFINITION_IDS.PARRY;
  if (outcome === 'perfect-parry') return PARRIED_REACTION_DEFINITION_IDS.PERFECT_PARRY;
  return null;
}

export function buildParriedReactionDefinition(input = {}) {
  const basePlan = input.plan;
  const outcome = String(input.outcome || '').toLowerCase();
  const id = resolveDefinitionId(outcome);
  if (!id) {
    return Object.freeze({
      stage: PARRIED_REACTION_DEFINITION_STAGE,
      accepted: false,
      reason: 'non-parry-outcome',
    });
  }
  if (!basePlan?.planned) {
    return Object.freeze({
      stage: PARRIED_REACTION_DEFINITION_STAGE,
      id,
      accepted: false,
      reason: 'missing-base-recoil-plan',
    });
  }

  const burst = buildTwoActorWholeBodyRecoilBurst({
    plan: basePlan,
    outcome,
    momentum: finite(input.momentum, 1),
    weaponMomentum: finite(input.weaponMomentum, 1),
    releaseDirection: input.reactionDirection || basePlan.weapon?.direction,
    activation: TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_ACTIVATIONS.DEFLECT_IMPULSE,
  });
  if (!burst.accepted) {
    return Object.freeze({
      stage: PARRIED_REACTION_DEFINITION_STAGE,
      id,
      accepted: false,
      reason: burst.reason || 'whole-body-reaction-build-failed',
      sourceBurst: burst,
    });
  }

  const reactionMetadata = Object.freeze({
    stage: PARRIED_REACTION_DEFINITION_STAGE,
    id,
    outcome,
    selectionEvent: 'authoritative-parry-impact',
    visibleActivationEvent: 'defender-deflect-impulse-after-contact-release',
    baseRecoilStage: basePlan.stage || null,
    sourceBurstStage: TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE,
  });
  const plan = Object.freeze({
    ...burst.plan,
    parriedReaction: reactionMetadata,
  });
  const impulsePeakMs = finite(burst.profileOverrides?.impulseEndMs);

  return Object.freeze({
    stage: PARRIED_REACTION_DEFINITION_STAGE,
    id,
    accepted: true,
    reason: 'parried-reaction-definition-ready-at-impact',
    outcome,
    basePlan,
    plan,
    initialElapsedMs: 0,
    profileOverrides: burst.profileOverrides,
    timeline: Object.freeze({
      selectedAtImpactMs: 0,
      visibleOldB3EntryMs: 0,
      impulsePeakMs,
      recoilEndMs: finite(burst.profileOverrides?.recoilEndMs),
      settleEndMs: finite(burst.profileOverrides?.settleEndMs),
      releaseRestartsBody: false,
    }),
    channelPolicy: Object.freeze({
      atImpact: 'old-b3-body-runs-from-impact-while-contact-owns-weapon-arm',
      atDeflectImpulse: 'weapon-arm-joins-running-old-b3-at-its-live-elapsed-time',
      atContactRelease: 'continuity-bridge-fades-contact-arm-into-running-old-b3-without-restart',
      contactConstraintRunsBeforeVisibleReaction: false,
      contactCorrectionBones: Object.freeze(['upperarm.r', 'lowerarm.r', 'wrist.r']),
      separateBalanceBreakRuntime: false,
    }),
    silhouette: Object.freeze({
      backwardPitchDegrees: Math.abs(finite(plan.body?.pitchDegrees)),
      minimumChestBackwardDegreesAtPeak: Math.abs(finite(plan.body?.pitchDegrees)) * 0.42,
      rootMotion: true,
    }),
    sourceBurst: burst,
    authority: 'combat-selects-parried-reaction-deflect-impulse-starts-presentation',
  });
}
