export const TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE = 'G4.3B.5R.2.7';

export const TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_ACTIVATIONS = Object.freeze({
  CONTACT_RELEASE: 'contact-release',
  PARRY_IMPACT: 'parry-impact',
  DEFLECT_IMPULSE: 'deflect-impulse',
});

export const TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_PROFILES = Object.freeze({
  parry: Object.freeze({
    outcome: 'parry',
    initialElapsedMs: 68,
    releaseSeparationWindowMs: 0,
    releaseSeparationDistanceMeters: 0,
    weaponStrengthScale: 1.00,
    weaponDeflectScale: 1.00,
    bodyStrengthScale: 1.34,
    yawScale: 1.14,
    rollScale: 1.14,
    minimumPlanBackwardPitchDegrees: 32,
    pitchAmplification: 3.10,
    legStrengthScale: 1.95,
    powerFrameHoldMs: 96,
    impulseEndMs: 112,
    recoilEndMs: 300,
    // The tail is short because the reaction no longer ends on the decay: a
    // stillness and a late collapse accent run between the recoil and the
    // settle, and a long settle after them reads as a second, weaker ending.
    settleEndMs: 470,
    collapseStillnessMs: 34,
    collapseAccentMs: 104,
    collapseAccentScale: 1.22,
  }),
  'perfect-parry': Object.freeze({
    outcome: 'perfect-parry',
    initialElapsedMs: 76,
    releaseSeparationWindowMs: 0,
    releaseSeparationDistanceMeters: 0,
    weaponStrengthScale: 1.04,
    weaponDeflectScale: 1.03,
    bodyStrengthScale: 1.48,
    yawScale: 1.20,
    rollScale: 1.20,
    minimumPlanBackwardPitchDegrees: 42,
    pitchAmplification: 3.35,
    legStrengthScale: 2.05,
    powerFrameHoldMs: 112,
    impulseEndMs: 126,
    recoilEndMs: 355,
    settleEndMs: 520,
    collapseStillnessMs: 40,
    collapseAccentMs: 116,
    collapseAccentScale: 1.30,
  }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function resolveOutcome(value, responseClass = '') {
  const explicit = String(value || '').toLowerCase();
  if (TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_PROFILES[explicit]) return explicit;
  if (responseClass === 'perfect-parry-directional-recoil') return 'perfect-parry';
  if (responseClass === 'parry-directional-recoil') return 'parry';
  return null;
}

export function buildTwoActorWholeBodyRecoilBurst(input = {}) {
  const plan = input.plan;
  const outcome = resolveOutcome(input.outcome, plan?.responseClass);
  const profile = TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_PROFILES[outcome];
  if (!profile || !plan?.planned) {
    return Object.freeze({
      stage: TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE,
      accepted: false,
      reason: !profile ? 'non-parry-outcome' : 'missing-recoil-plan',
    });
  }

  const momentum = clamp(input.momentum, 0.75, 1.5);
  const weaponMomentum = clamp(input.weaponMomentum, 0.90, 1.12);
  const releaseDirection = input.releaseDirection || plan.weapon?.direction;
  const requestedActivation = String(input.activation || '');
  const activation = Object.values(TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_ACTIVATIONS)
    .includes(requestedActivation)
    ? requestedActivation
    : TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_ACTIVATIONS.CONTACT_RELEASE;
  const startsAtParryImpact = activation === TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_ACTIVATIONS.PARRY_IMPACT;
  const startsAtDeflectImpulse = activation
    === TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_ACTIVATIONS.DEFLECT_IMPULSE;
  const startsAtTimelineOrigin = startsAtParryImpact || startsAtDeflectImpulse;
  const initialElapsedMs = startsAtTimelineOrigin ? 0 : profile.initialElapsedMs;
  const sourcePitch = Math.abs(finite(plan.body?.pitchDegrees));
  const backwardPitchDegrees = Math.max(
    profile.minimumPlanBackwardPitchDegrees,
    sourcePitch * profile.pitchAmplification * momentum,
  );

  const weapon = Object.freeze({
    ...(plan.weapon || {}),
    direction: releaseDirection,
    strength: finite(plan.weapon?.strength) * profile.weaponStrengthScale * weaponMomentum,
    deflectDegrees: finite(plan.weapon?.deflectDegrees) * profile.weaponDeflectScale * weaponMomentum,
    continuationSource: startsAtDeflectImpulse
      ? 'deflect-impulse-whole-body-reaction-activation'
      : startsAtParryImpact
        ? 'parry-impact-whole-body-reaction-definition'
        : 'two-actor-whole-body-release-burst',
    separationSource: startsAtDeflectImpulse
      ? 'defender-deflect-impulse-after-contact-release'
      : startsAtParryImpact
        ? 'authoritative-parry-impact'
        : 'shield-contact-release-power-frame',
  });

  const body = Object.freeze({
    ...(plan.body || {}),
    strength: finite(plan.body?.strength) * profile.bodyStrengthScale * momentum,
    yawDegrees: finite(plan.body?.yawDegrees) * profile.yawScale * momentum,
    pitchDegrees: -backwardPitchDegrees,
    rollDegrees: finite(plan.body?.rollDegrees) * profile.rollScale * momentum,
  });

  const transformedPlan = Object.freeze({
    ...plan,
    weapon,
    body,
    postCouplingStage: TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE,
  });

  return Object.freeze({
    stage: TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE,
    accepted: true,
    reason: startsAtDeflectImpulse
      ? 'deflect-impulse-whole-body-recoil-ready'
      : startsAtParryImpact
        ? 'impact-time-whole-body-recoil-ready'
        : 'two-actor-whole-body-recoil-burst-ready',
    outcome,
    activation,
    plan: transformedPlan,
    initialElapsedMs,
    profileOverrides: Object.freeze({
      releaseSeparationWindowMs: profile.releaseSeparationWindowMs,
      releaseSeparationDistanceMeters: profile.releaseSeparationDistanceMeters,
      impulseEndMs: profile.impulseEndMs,
      recoilEndMs: profile.recoilEndMs,
      settleEndMs: profile.settleEndMs,
      legStrengthScale: profile.legStrengthScale,
      powerFrameHoldMs: profile.powerFrameHoldMs,
      collapseStillnessMs: profile.collapseStillnessMs,
      collapseAccentMs: profile.collapseAccentMs,
      collapseAccentScale: profile.collapseAccentScale,
    }),
    // A parried swing does not fail on the impulse alone. The reference
    // motion holds the thrown-open pose, goes completely still for about one
    // 30fps frame, and only then loses the stance -- and that late accent is
    // the largest movement in the whole exchange, larger than the hit that
    // caused it. Decaying straight from the impulse to rest skips it, which
    // is what makes an otherwise larger reaction read as controlled.
    collapse: Object.freeze({
      stillnessMs: profile.collapseStillnessMs,
      accentMs: profile.collapseAccentMs,
      accentScale: profile.collapseAccentScale,
      entryElapsedMs: profile.recoilEndMs + profile.powerFrameHoldMs,
      peakFollowsStillness: true,
      authority: 'stillness-then-late-collapse-outweighs-the-impulse-that-caused-it',
    }),
    powerFrame: Object.freeze({
      entryElapsedMs: initialElapsedMs,
      impulseEndMs: profile.impulseEndMs,
      holdDurationMs: profile.powerFrameHoldMs,
      separationBypassed: true,
      startsAtParryImpact,
      startsAtDeflectImpulse,
      oldTwoActorArmAuthorityRestored: true,
      parentChainFreeArmMotion: true,
      minimumChestBackwardDegreesAtFullTorsoWeight: backwardPitchDegrees * 0.42,
    }),
    rootMotion: true,
    authority: startsAtDeflectImpulse
      ? 'old-two-actor-b3-whole-body-impulse-at-defender-deflect-marker'
      : startsAtParryImpact
        ? 'old-two-actor-b3-whole-body-impulse-at-authoritative-parry-impact'
        : 'old-two-actor-b3-whole-body-impulse-at-shield-contact-release',
  });
}
