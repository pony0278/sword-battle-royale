import {
  TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE,
  buildTwoActorWholeBodyRecoilBurst,
} from './two-actor-whole-body-recoil-burst.js';

export const POST_COUPLING_RECOIL_STAGGER_BASE_STAGE = 'G4.3B.5R.2.1';
export const COUPLED_MOMENTUM_CONTINUATION_STAGE = 'G4.3B.5R.2.2';
export const CONTACT_RELEASE_SEPARATION_RECOIL_STAGE = 'G4.3B.5R.2.4';
export const LEGACY_TWO_ACTOR_RECOIL_PASSTHROUGH_STAGE = 'G4.3B.5R.2.8';
export const LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE = 'legacy-two-actor-passthrough';
// Compatibility export follows the historical .2.7 post-coupling presentation authority.
export const POST_COUPLING_RECOIL_STAGGER_STAGE = TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE;

export const POST_COUPLING_RECOIL_STAGGER_PROFILES = Object.freeze({
  block: Object.freeze({
    outcome: 'block',
    weaponStrengthScale: 0.55,
    weaponDeflectScale: 0.68,
    torsoScale: 1.0,
    bodyStrengthScale: 1.0,
    legStrengthScale: 1.0,
    referenceDriveMeters: 0.035,
    minimumMomentum: 0.85,
    maximumMomentum: 1.10,
    separationFromCoupling: false,
    b2DirectionWeight: 1,
    couplingRedirectWeight: 0,
  }),
  parry: Object.freeze({
    outcome: 'parry',
    weaponStrengthScale: 1.0,
    weaponDeflectScale: 1.0,
    torsoScale: 1.0,
    bodyStrengthScale: 1.0,
    legStrengthScale: 1.0,
    referenceDriveMeters: 0.105,
    minimumMomentum: 0.95,
    maximumMomentum: 1.30,
    separationFromCoupling: true,
    b2DirectionWeight: 0.72,
    couplingRedirectWeight: 0.28,
    releaseSeparationWindowMs: 0,
  }),
  'perfect-parry': Object.freeze({
    outcome: 'perfect-parry',
    weaponStrengthScale: 1.0,
    weaponDeflectScale: 1.0,
    torsoScale: 1.0,
    bodyStrengthScale: 1.0,
    legStrengthScale: 1.0,
    referenceDriveMeters: 0.125,
    minimumMomentum: 1.05,
    maximumMomentum: 1.42,
    separationFromCoupling: true,
    b2DirectionWeight: 0.76,
    couplingRedirectWeight: 0.24,
    releaseSeparationWindowMs: 0,
  }),
});

const pendingByRig = new WeakMap();

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function vec(input = {}) {
  return { x: finite(input.x), y: finite(input.y), z: finite(input.z) };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a, scalar) {
  return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function magnitude(value = {}) {
  const v = vec(value);
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(value = {}, fallback = { x: 0, y: 0, z: 0 }) {
  const v = vec(value);
  const m = magnitude(v);
  if (m > 1e-8) return Object.freeze({ x: v.x / m, y: v.y / m, z: v.z / m });
  const f = vec(fallback);
  const fm = magnitude(f);
  if (fm > 1e-8) return Object.freeze({ x: f.x / fm, y: f.y / fm, z: f.z / fm });
  return Object.freeze({ x: 0, y: 0, z: 0 });
}

function resolveOutcome(value, responseClass = '') {
  const outcome = String(value || '').toLowerCase();
  if (POST_COUPLING_RECOIL_STAGGER_PROFILES[outcome]) return outcome;
  if (responseClass === 'perfect-parry-directional-recoil') return 'perfect-parry';
  if (responseClass === 'parry-directional-recoil') return 'parry';
  return 'block';
}

function resolveHandoffMode(couplingReport = {}) {
  return couplingReport.recoilHandoffMode
    || couplingReport.profile?.recoilHandoffMode
    || null;
}

export function publishPostCouplingRecoilStaggerHandoff(attackerRig, payload = {}) {
  if (!attackerRig || (typeof attackerRig !== 'object' && typeof attackerRig !== 'function')) return false;
  pendingByRig.set(attackerRig, Object.freeze({
    stage: POST_COUPLING_RECOIL_STAGGER_STAGE,
    previousStage: COUPLED_MOMENTUM_CONTINUATION_STAGE,
    baseStage: POST_COUPLING_RECOIL_STAGGER_BASE_STAGE,
    couplingReport: payload.couplingReport || payload.report || payload,
    surfaceAtContact: payload.surfaceAtContact || null,
    authority: 'shield-coupling-release-to-post-coupling-recoil-authority',
  }));
  return true;
}

export function consumePostCouplingRecoilStaggerHandoff(attackerRig) {
  if (!attackerRig || !pendingByRig.has(attackerRig)) return null;
  const payload = pendingByRig.get(attackerRig);
  pendingByRig.delete(attackerRig);
  return payload;
}

function resolveCouplingDirection(couplingReport, fallback) {
  if (magnitude(couplingReport.attackerWeaponOffset) > 1e-6) {
    return Object.freeze({
      direction: normalize(couplingReport.attackerWeaponOffset, fallback),
      source: 'coupling-attacker-weapon-offset',
    });
  }
  if (magnitude(couplingReport.shieldTangent) > 1e-6) {
    return Object.freeze({
      direction: normalize(couplingReport.shieldTangent, fallback),
      source: 'coupling-shield-tangent',
    });
  }
  return Object.freeze({ direction: normalize(fallback), source: 'b2-fallback-direction' });
}

function resolveContactReleaseSeparationDirection(outcome, couplingReport, plan, profile) {
  const b2Direction = normalize(plan.weapon?.direction);
  if (outcome === 'block' || profile.separationFromCoupling !== true) {
    return Object.freeze({
      direction: b2Direction,
      source: 'b2-block-recoil-direction',
      b2Direction,
      couplingDirection: null,
      couplingSource: null,
      b2Alignment: 1,
      couplingAlignment: null,
    });
  }

  const coupling = resolveCouplingDirection(couplingReport, b2Direction);
  if (coupling.source === 'b2-fallback-direction') {
    return Object.freeze({
      direction: b2Direction,
      source: 'contact-release-b2-fallback',
      b2Direction,
      couplingDirection: null,
      couplingSource: coupling.source,
      b2Alignment: 1,
      couplingAlignment: null,
    });
  }

  const b2Weight = clamp(profile.b2DirectionWeight, 0, 1);
  const couplingWeight = clamp(profile.couplingRedirectWeight, 0, 1);
  const mixed = add(scale(b2Direction, b2Weight), scale(coupling.direction, couplingWeight));
  const direction = normalize(mixed, b2Direction);

  return Object.freeze({
    direction,
    source: 'contact-release-b2-shield-blend',
    b2Direction,
    couplingDirection: coupling.direction,
    couplingSource: coupling.source,
    b2Alignment: dot(direction, b2Direction),
    couplingAlignment: dot(direction, coupling.direction),
  });
}

export function buildPostCouplingRecoilStaggerHandoff(input = {}) {
  const plan = input.plan;
  const couplingReport = input.couplingReport || input.report || {};
  const baseProfile = input.baseProfile || {};
  if (!plan?.planned) {
    return Object.freeze({
      stage: POST_COUPLING_RECOIL_STAGGER_STAGE,
      accepted: false,
      reason: 'missing-recoil-plan',
    });
  }

  const outcome = resolveOutcome(couplingReport.outcome, plan.responseClass);
  const profile = POST_COUPLING_RECOIL_STAGGER_PROFILES[outcome];
  const plannedDriveMeters = magnitude(couplingReport.shieldOffset);
  const weaponFollowMeters = magnitude(couplingReport.attackerWeaponOffset);
  const surfaceAtContact = input.surfaceAtContact?.center || input.surfaceAtContact || null;
  const finalSurface = couplingReport.finalSurface?.center || null;
  const achievedDriveMeters = surfaceAtContact && finalSurface
    ? magnitude(sub(vec(finalSurface), vec(surfaceAtContact)))
    : plannedDriveMeters;
  const driveMeters = Math.max(plannedDriveMeters, achievedDriveMeters);
  const durationSeconds = Math.max(0.001, finite(couplingReport.elapsedMs, couplingReport.profile?.durationMs || 1) / 1000);
  const driveSpeedMps = driveMeters / durationSeconds;
  const weaponFollowSpeedMps = weaponFollowMeters / durationSeconds;
  const referenceDriveMeters = Math.max(0.001, finite(profile.referenceDriveMeters, 0.1));
  const referenceSpeedMps = referenceDriveMeters / durationSeconds;
  const driveRatio = clamp(driveMeters / referenceDriveMeters, 0, 1.8);
  const followRatio = clamp(weaponFollowMeters / referenceDriveMeters, 0, 1.8);
  const speedRatio = clamp(driveSpeedMps / Math.max(0.01, referenceSpeedMps), 0, 1.8);
  const rawMomentum = 0.58 + driveRatio * 0.24 + followRatio * 0.10 + speedRatio * 0.18;
  const momentum = clamp(rawMomentum, profile.minimumMomentum, profile.maximumMomentum);
  const couplingMomentum = Object.freeze({
    plannedDriveMeters,
    achievedDriveMeters,
    driveMeters,
    weaponFollowMeters,
    driveSpeedMps,
    weaponFollowSpeedMps,
    momentum,
  });

  const handoffMode = resolveHandoffMode(couplingReport);
  if (outcome !== 'block' && handoffMode === LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE) {
    const b2Direction = normalize(plan.weapon?.direction);
    return Object.freeze({
      stage: LEGACY_TWO_ACTOR_RECOIL_PASSTHROUGH_STAGE,
      previousStage: COUPLED_MOMENTUM_CONTINUATION_STAGE,
      baseStage: POST_COUPLING_RECOIL_STAGGER_BASE_STAGE,
      accepted: true,
      reason: 'legacy-two-actor-recoil-passthrough-ready',
      outcome,
      initialElapsedMs: 0,
      plan,
      profileOverrides: Object.freeze({}),
      separation: Object.freeze({
        direction: b2Direction,
        source: 'original-b2-recoil-direction',
        b2Direction,
        couplingDirection: null,
        couplingSource: null,
        b2Alignment: 1,
        couplingAlignment: null,
        releaseWindowMs: 0,
        weaponMomentum: 1,
        bypassedForWholeBodyBurst: false,
        bypassedForLegacyPassthrough: true,
      }),
      continuation: Object.freeze({
        direction: b2Direction,
        source: 'original-two-actor-b3-plan',
        weaponMomentum: 1,
      }),
      wholeBodyBurst: null,
      couplingMomentum,
      channelIntent: Object.freeze({
        weapon: 'original-two-actor-b3-arm-deflect',
        shoulder: 'original-two-actor-parent-chain-response',
        torso: 'original-two-actor-b3-yaw-pitch-roll',
        hipsAndLegs: 'original-two-actor-b3-balance-response',
        freeArm: 'parent-chain-motion-no-explicit-flail',
      }),
      timelineIntent: Object.freeze({
        releaseSeparationWindowMs: 0,
        b3EntryElapsedMs: 0,
        contactHoldMs: finite(baseProfile.contactHoldMs),
        impulseEndMs: finite(baseProfile.impulseEndMs),
        recoilEndMs: finite(baseProfile.recoilEndMs),
        settleEndMs: finite(baseProfile.settleEndMs),
      }),
      authority: 'shield-release-to-original-two-actor-b3-plan',
    });
  }

  const separation = resolveContactReleaseSeparationDirection(outcome, couplingReport, plan, profile);
  const weaponMomentum = profile.separationFromCoupling
    ? clamp(0.92 + momentum * 0.10, 0.98, 1.08)
    : 1;

  const wholeBodyBurst = outcome === 'block'
    ? null
    : buildTwoActorWholeBodyRecoilBurst({
        plan,
        outcome,
        momentum,
        weaponMomentum,
        releaseDirection: separation.direction,
      });

  const weapon = wholeBodyBurst?.accepted
    ? wholeBodyBurst.plan.weapon
    : Object.freeze({
        ...(plan.weapon || {}),
        direction: separation.direction,
        strength: finite(plan.weapon?.strength) * profile.weaponStrengthScale * weaponMomentum,
        deflectDegrees: finite(plan.weapon?.deflectDegrees) * profile.weaponDeflectScale * weaponMomentum,
        continuationSource: separation.source,
        separationSource: separation.source,
      });

  const bodyScale = profile.torsoScale * momentum;
  const body = wholeBodyBurst?.accepted
    ? wholeBodyBurst.plan.body
    : Object.freeze({
        ...(plan.body || {}),
        strength: finite(plan.body?.strength) * profile.bodyStrengthScale * momentum,
        yawDegrees: finite(plan.body?.yawDegrees) * bodyScale,
        pitchDegrees: finite(plan.body?.pitchDegrees) * bodyScale,
        rollDegrees: finite(plan.body?.rollDegrees) * bodyScale,
      });

  const transformedPlan = Object.freeze({
    ...plan,
    weapon,
    body,
    postCouplingStage: wholeBodyBurst?.accepted
      ? TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE
      : CONTACT_RELEASE_SEPARATION_RECOIL_STAGE,
  });

  const profileOverrides = wholeBodyBurst?.accepted
    ? Object.freeze({
        ...wholeBodyBurst.profileOverrides,
        // G4.3B.5R.2.7 owns the post-release leg response outright. Do not
        // multiply this by the historical B3 leg scale (0.78 for Parry), or
        // the knee-rescue silhouette becomes too small to read at 30fps.
        legStrengthScale: clamp(
          finite(wholeBodyBurst.profileOverrides.legStrengthScale, 1),
          0,
          2.2,
        ),
      })
    : Object.freeze({
        legStrengthScale: clamp(finite(baseProfile.legStrengthScale, 1) * profile.legStrengthScale, 0, 2.2),
      });

  return Object.freeze({
    stage: wholeBodyBurst?.accepted
      ? TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE
      : CONTACT_RELEASE_SEPARATION_RECOIL_STAGE,
    previousStage: COUPLED_MOMENTUM_CONTINUATION_STAGE,
    baseStage: POST_COUPLING_RECOIL_STAGGER_BASE_STAGE,
    accepted: true,
    reason: wholeBodyBurst?.accepted
      ? wholeBodyBurst.reason
      : 'post-coupling-body-stagger-ready',
    outcome,
    initialElapsedMs: wholeBodyBurst?.accepted
      ? wholeBodyBurst.initialElapsedMs
      : Math.max(0, finite(baseProfile.contactHoldMs)),
    plan: transformedPlan,
    profileOverrides,
    separation: Object.freeze({
      direction: separation.direction,
      source: separation.source,
      b2Direction: separation.b2Direction,
      couplingDirection: separation.couplingDirection,
      couplingSource: separation.couplingSource,
      b2Alignment: separation.b2Alignment,
      couplingAlignment: separation.couplingAlignment,
      releaseWindowMs: wholeBodyBurst?.accepted ? 0 : finite(profile.releaseSeparationWindowMs),
      weaponMomentum,
      bypassedForWholeBodyBurst: wholeBodyBurst?.accepted === true,
    }),
    continuation: Object.freeze({
      direction: separation.direction,
      source: wholeBodyBurst?.accepted ? 'two-actor-whole-body-release-burst' : separation.source,
      weaponMomentum,
    }),
    wholeBodyBurst: wholeBodyBurst?.accepted ? wholeBodyBurst : null,
    couplingMomentum,
    channelIntent: wholeBodyBurst?.accepted
      ? Object.freeze({
          weapon: 'old-two-actor-direct-arm-deflect-at-release-power-frame',
          shoulder: 'weapon-and-shoulders-open-on-same-impulse-clock',
          torso: 'old-two-actor-yaw-roll-plus-backward-bias',
          hipsAndLegs: 'same-clock-almost-fall-then-knee-rescue',
          freeArm: 'parent-chain-motion-no-explicit-flail',
        })
      : Object.freeze({
          weapon: 'short-block-bounce',
          shoulder: 'block-impact-arm-response',
          torso: 'post-coupling-inertia',
          hipsAndLegs: 'stagger-and-balance-recovery',
        }),
    timelineIntent: wholeBodyBurst?.accepted
      ? Object.freeze({
          releaseSeparationWindowMs: 0,
          b3EntryElapsedMs: wholeBodyBurst.initialElapsedMs,
          weaponAndShoulderImpulseEndMs: wholeBodyBurst.profileOverrides.impulseEndMs,
          torsoAndHipsEndMs: wholeBodyBurst.profileOverrides.recoilEndMs,
          fullRecoveryEndMs: wholeBodyBurst.profileOverrides.settleEndMs,
        })
      : null,
    authority: wholeBodyBurst?.accepted
      ? 'shield-release-to-old-two-actor-unified-whole-body-burst'
      : 'post-coupling-block-presentation-handoff',
  });
}
