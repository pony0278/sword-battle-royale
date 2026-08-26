import {
  buildPostCouplingRecoilStaggerHandoff,
  consumePostCouplingRecoilStaggerHandoff,
} from './post-coupling-recoil-stagger-handoff.js';

export const ATTACKER_RECOIL_PRESENTATION_STAGE = 'G4.3B.3';
export const CONTACT_RELEASE_SEPARATION_MOTION_STAGE = 'G4.3B.5R.2.4.1';

export const ATTACKER_RECOIL_PRESENTATION_PHASES = Object.freeze({
  CONTACT_HOLD: 'contact-hold',
  SEPARATION: 'separation',
  IMPULSE: 'impulse',
  RECOIL: 'recoil',
  SETTLE: 'settle',
  COMPLETE: 'complete',
});

export const ATTACKER_RECOIL_PRESENTATION_PHASE_LATCHES = Object.freeze({
  CONTACT_ORIGIN: 'contact-origin',
  IMPULSE_PEAK: 'impulse-peak',
});

export const ATTACKER_RECOIL_PRESENTATION_CHANNELS = Object.freeze({
  FULL: Object.freeze({
    torso: true,
    torsoYawRoll: true,
    legs: true,
    weaponArm: true,
  }),
  BODY_WITH_CONTACT_ARM: Object.freeze({
    torso: true,
    torsoYawRoll: false,
    legs: true,
    weaponArm: false,
  }),
});

export const ATTACKER_RECOIL_PRESENTATION_PROFILES = Object.freeze({
  'blocked-weapon-bounce': Object.freeze({
    contactHoldMs: 26,
    impulseEndMs: 96,
    recoilEndMs: 178,
    settleEndMs: 280,
    armDeflectScale: 0.72,
    forearmDeflectScale: 0.42,
    legStrengthScale: 0.85,
  }),
  'parry-directional-recoil': Object.freeze({
    contactHoldMs: 28,
    impulseEndMs: 105,
    recoilEndMs: 235,
    settleEndMs: 390,
    armDeflectScale: 0.78,
    forearmDeflectScale: 0.48,
    legStrengthScale: 0.78,
  }),
  'perfect-parry-directional-recoil': Object.freeze({
    contactHoldMs: 36,
    impulseEndMs: 120,
    recoilEndMs: 285,
    settleEndMs: 500,
    armDeflectScale: 0.84,
    forearmDeflectScale: 0.54,
    legStrengthScale: 1,
  }),
});

const RELEASE_SEPARATION_DISTANCE_METERS = Object.freeze({
  'parry-directional-recoil': 0.065,
  'perfect-parry-directional-recoil': 0.095,
});

function finite(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

export function resolveAttackerRecoilPresentationChannels(value = {}) {
  const channels = value?.channels || value;
  return Object.freeze({
    torso: channels?.torso !== false,
    torsoYawRoll: channels?.torsoYawRoll !== false,
    legs: channels?.legs !== false,
    weaponArm: channels?.weaponArm !== false,
  });
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function vec(input = {}) {
  return Object.freeze({
    x: finite(input?.x, 0),
    y: finite(input?.y, 0),
    z: finite(input?.z, 0),
  });
}

function length(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value) {
  const magnitude = length(value);
  if (magnitude <= 1e-8) return Object.freeze({ x: 0, y: 0, z: 0 });
  return Object.freeze({
    x: value.x / magnitude,
    y: value.y / magnitude,
    z: value.z / magnitude,
  });
}

function resolveProfile(plan, overrides = {}) {
  const responseClass = String(plan?.responseClass || '');
  const base = ATTACKER_RECOIL_PRESENTATION_PROFILES[responseClass];
  if (!base) return null;
  const contactHoldMs = clamp(overrides.contactHoldMs ?? base.contactHoldMs, 0, 120);
  const releaseSeparationWindowMs = clamp(overrides.releaseSeparationWindowMs ?? 0, 0, 120);
  const releaseSeparationDistanceMeters = clamp(overrides.releaseSeparationDistanceMeters ?? 0, 0, 0.16);
  const impulseEndMs = clamp(
    overrides.impulseEndMs ?? base.impulseEndMs,
    contactHoldMs + releaseSeparationWindowMs + 1,
    260,
  );
  const recoilEndMs = clamp(
    overrides.recoilEndMs ?? base.recoilEndMs,
    impulseEndMs + 1,
    420,
  );
  const settleEndMs = clamp(
    overrides.settleEndMs ?? base.settleEndMs,
    recoilEndMs + 1,
    800,
  );
  const powerFrameHoldMs = clamp(overrides.powerFrameHoldMs ?? 0, 0, 160);
  return Object.freeze({
    ...base,
    ...overrides,
    contactHoldMs,
    releaseSeparationWindowMs,
    releaseSeparationDistanceMeters,
    impulseEndMs,
    recoilEndMs,
    settleEndMs,
    powerFrameHoldMs,
    powerFrameEndMs: impulseEndMs + powerFrameHoldMs,
    visibleRecoilEndMs: recoilEndMs + powerFrameHoldMs,
    visibleSettleEndMs: settleEndMs + powerFrameHoldMs,
    armDeflectScale: clamp(overrides.armDeflectScale ?? base.armDeflectScale, 0, 1.5),
    forearmDeflectScale: clamp(overrides.forearmDeflectScale ?? base.forearmDeflectScale, 0, 1.5),
    legStrengthScale: clamp(overrides.legStrengthScale ?? base.legStrengthScale, 0, 2.2),
  });
}

export function advanceAttackerRecoilPresentationClock(
  plan,
  currentElapsedMs = 0,
  deltaSeconds = 1 / 60,
  overrides = {},
  context = {},
) {
  const profile = resolveProfile(plan, overrides.profile || overrides);
  if (!profile) return null;
  const previousElapsedMs = Math.max(0, finite(currentElapsedMs));
  const requestedElapsedMs = previousElapsedMs
    + Math.max(0, finite(deltaSeconds, 1 / 60)) * 1000;
  const phaseLatch = String(context.phaseLatch || '');
  const latchPointMs = phaseLatch === ATTACKER_RECOIL_PRESENTATION_PHASE_LATCHES.CONTACT_ORIGIN
    ? 0
    : phaseLatch === ATTACKER_RECOIL_PRESENTATION_PHASE_LATCHES.IMPULSE_PEAK
      ? profile.impulseEndMs
      : null;
  const latchCanStillOwnClock = latchPointMs != null
    && previousElapsedMs <= latchPointMs + 1e-6;
  const latched = latchCanStillOwnClock && requestedElapsedMs >= latchPointMs;
  // Preserve authored power frames even when a slow browser frame would step
  // completely across the impulse peak. This is a presentation-clock rule for
  // every recoil definition, rather than direction-specific animation timing.
  const snappedToImpulsePeak = !latched
    && previousElapsedMs < profile.impulseEndMs
    && requestedElapsedMs > profile.impulseEndMs;
  const elapsedMs = latched
    ? latchPointMs
    : snappedToImpulsePeak
      ? profile.impulseEndMs
      : requestedElapsedMs;
  return Object.freeze({
    previousElapsedMs,
    requestedElapsedMs,
    elapsedMs,
    phaseLatch: phaseLatch || null,
    latchPointMs,
    latched,
    snappedToImpulsePeak,
    presentationClockPausedByContact: latched,
    authority: latched
      ? latchPointMs === 0
        ? 'impact-selects-reaction-while-contact-parks-visible-old-b3-at-origin'
        : 'impact-clock-advances-while-contact-latches-recoil-at-impulse-peak'
      : snappedToImpulsePeak
        ? 'presentation-clock-preserves-authored-impulse-power-frame'
      : 'unlatched-attacker-recoil-presentation-clock',
  });
}

function sampleWeights(profile, elapsedMs) {
  const elapsed = Math.max(0, finite(elapsedMs));
  const powerFrameHoldMs = Math.max(0, finite(profile.powerFrameHoldMs));
  const powerFrameEndMs = profile.impulseEndMs + powerFrameHoldMs;
  const visibleRecoilEndMs = profile.recoilEndMs + powerFrameHoldMs;
  const visibleSettleEndMs = profile.settleEndMs + powerFrameHoldMs;
  if (elapsed >= visibleSettleEndMs) {
    return Object.freeze({
      phase: ATTACKER_RECOIL_PRESENTATION_PHASES.COMPLETE,
      armWeight: 0,
      torsoWeight: 0,
      legWeight: 0,
      separationWeight: 0,
      complete: true,
    });
  }

  if (elapsed <= profile.contactHoldMs) {
    return Object.freeze({
      phase: ATTACKER_RECOIL_PRESENTATION_PHASES.CONTACT_HOLD,
      armWeight: 0,
      torsoWeight: 0,
      legWeight: 0,
      separationWeight: 0,
      complete: false,
    });
  }

  const separationWindowMs = Math.max(0, finite(profile.releaseSeparationWindowMs));
  const separationEndMs = profile.contactHoldMs + separationWindowMs;
  if (separationWindowMs > 0 && elapsed <= separationEndMs) {
    const t = clamp01((elapsed - profile.contactHoldMs) / separationWindowMs);
    const separationWeight = smoothstep01(t);
    return Object.freeze({
      phase: ATTACKER_RECOIL_PRESENTATION_PHASES.SEPARATION,
      armWeight: 0.42 * separationWeight,
      torsoWeight: 0.06 * smoothstep01((t - 0.55) / 0.45),
      legWeight: 0,
      separationWeight,
      complete: false,
    });
  }

  if (elapsed <= profile.impulseEndMs) {
    if (separationWindowMs > 0) {
      const impulseSpan = Math.max(1, profile.impulseEndMs - separationEndMs);
      const t = clamp01((elapsed - separationEndMs) / impulseSpan);
      const eased = smoothstep01(t);
      return Object.freeze({
        phase: ATTACKER_RECOIL_PRESENTATION_PHASES.IMPULSE,
        armWeight: 0.42 + 0.58 * eased,
        torsoWeight: smoothstep01((t - 0.08) / 0.92),
        legWeight: smoothstep01((t - 0.35) / 0.65),
        separationWeight: 1 - eased,
        complete: false,
      });
    }
    const t = clamp01((elapsed - profile.contactHoldMs) / (profile.impulseEndMs - profile.contactHoldMs));
    return Object.freeze({
      phase: ATTACKER_RECOIL_PRESENTATION_PHASES.IMPULSE,
      armWeight: smoothstep01(t),
      torsoWeight: smoothstep01((t - 0.12) / 0.88),
      legWeight: smoothstep01((t - 0.28) / 0.72),
      separationWeight: 0,
      complete: false,
    });
  }

  if (powerFrameHoldMs > 0 && elapsed <= powerFrameEndMs) {
    return Object.freeze({
      phase: ATTACKER_RECOIL_PRESENTATION_PHASES.IMPULSE,
      armWeight: 1,
      torsoWeight: 1,
      legWeight: 1,
      separationWeight: 0,
      powerFrameHeld: true,
      complete: false,
    });
  }

  if (elapsed <= visibleRecoilEndMs) {
    const authoredElapsed = elapsed - powerFrameHoldMs;
    const t = smoothstep01(
      (authoredElapsed - profile.impulseEndMs) / (profile.recoilEndMs - profile.impulseEndMs),
    );
    return Object.freeze({
      phase: ATTACKER_RECOIL_PRESENTATION_PHASES.RECOIL,
      armWeight: 1 - 0.22 * t,
      torsoWeight: 1 - 0.12 * t,
      legWeight: 1 - 0.07 * t,
      separationWeight: 0,
      complete: false,
    });
  }

  const authoredElapsed = elapsed - powerFrameHoldMs;
  const t = smoothstep01(
    (authoredElapsed - profile.recoilEndMs) / (profile.settleEndMs - profile.recoilEndMs),
  );
  return Object.freeze({
    phase: ATTACKER_RECOIL_PRESENTATION_PHASES.SETTLE,
    armWeight: 0.78 * (1 - t),
    torsoWeight: 0.88 * (1 - t),
    legWeight: 0.93 * (1 - t),
    separationWeight: 0,
    complete: false,
  });
}

function zeroPose() {
  return Object.freeze({
    weaponAimOffsetMeters: Object.freeze({ x: 0, y: 0, z: 0 }),
    releaseSeparationOffsetMeters: Object.freeze({ x: 0, y: 0, z: 0 }),
    releaseSeparationDistanceMeters: 0,
    upperArmAimDegrees: 0,
    lowerArmAimDegrees: 0,
    chestYawDegrees: 0,
    chestPitchDegrees: 0,
    chestRollDegrees: 0,
    spineYawDegrees: 0,
    spinePitchDegrees: 0,
    spineRollDegrees: 0,
    hipsYawDegrees: 0,
    hipsPitchDegrees: 0,
    hipsRollDegrees: 0,
    leftThighBendDegrees: 0,
    rightThighBendDegrees: 0,
    leftKneeBendDegrees: 0,
    rightKneeBendDegrees: 0,
  });
}

export function sampleAttackerRecoilPresentation(plan, elapsedMs = 0, overrides = {}) {
  if (!plan?.planned) return null;
  const profile = resolveProfile(plan, overrides.profile || overrides);
  if (!profile) return null;

  const weights = sampleWeights(profile, elapsedMs);
  const weaponDirection = normalize(vec(plan.weapon?.direction));
  const bodyStrength = clamp(finite(plan.body?.strength), 0, 2);
  const weaponStrength = clamp(finite(plan.weapon?.strength), 0, 2);
  const deflectDegrees = clamp(finite(plan.weapon?.deflectDegrees), 0, 90);
  const lateralSign = Math.sign(finite(plan.weapon?.lateralSign));
  const attackDirection = String(plan.attackDirection || '');

  if (weights.complete) {
    return Object.freeze({
      stage: ATTACKER_RECOIL_PRESENTATION_STAGE,
      motionStage: profile.releaseSeparationWindowMs > 0 ? CONTACT_RELEASE_SEPARATION_MOTION_STAGE : null,
      sequence: plan.sequence ?? null,
      responseClass: plan.responseClass || null,
      attackDirection,
      elapsedMs: Math.max(0, finite(elapsedMs)),
      phase: weights.phase,
      weights,
      pose: zeroPose(),
      complete: true,
      readyForAttackHandoff: true,
      profile,
      authority: 'attacker-recoil-presentation-only',
    });
  }

  const baseAimDistance = (0.055 + 0.13 * weaponStrength) * weights.armWeight;
  const separationDistance = profile.releaseSeparationDistanceMeters * (weights.separationWeight || 0);
  const aimDistance = Math.max(baseAimDistance, separationDistance);
  const aimOffset = aimDistance <= 1e-9
    ? Object.freeze({ x: 0, y: 0, z: 0 })
    : Object.freeze({
        x: weaponDirection.x * aimDistance,
        y: weaponDirection.y * aimDistance,
        z: weaponDirection.z * aimDistance,
      });
  const releaseSeparationOffset = separationDistance <= 1e-9
    ? Object.freeze({ x: 0, y: 0, z: 0 })
    : Object.freeze({
        x: weaponDirection.x * separationDistance,
        y: weaponDirection.y * separationDistance,
        z: weaponDirection.z * separationDistance,
      });

  const topSymmetric = attackDirection === 'top';
  const loadedLeft = topSymmetric ? 0.75 : lateralSign >= 0 ? 1 : 0.48;
  const loadedRight = topSymmetric ? 0.75 : lateralSign <= 0 ? 1 : 0.48;
  const legBase = 7.5 * bodyStrength * profile.legStrengthScale * weights.legWeight;
  const kneeBase = 11 * bodyStrength * profile.legStrengthScale * weights.legWeight;

  const pose = Object.freeze({
    weaponAimOffsetMeters: aimOffset,
    releaseSeparationOffsetMeters: releaseSeparationOffset,
    releaseSeparationDistanceMeters: separationDistance,
    upperArmAimDegrees: deflectDegrees * profile.armDeflectScale * weights.armWeight,
    lowerArmAimDegrees: deflectDegrees * profile.forearmDeflectScale * weights.armWeight,
    chestYawDegrees: finite(plan.body?.yawDegrees) * weights.torsoWeight * 0.58,
    chestPitchDegrees: finite(plan.body?.pitchDegrees) * weights.torsoWeight * 0.42,
    chestRollDegrees: finite(plan.body?.rollDegrees) * weights.torsoWeight * 0.72,
    spineYawDegrees: finite(plan.body?.yawDegrees) * weights.torsoWeight * 0.36,
    spinePitchDegrees: finite(plan.body?.pitchDegrees) * weights.torsoWeight * 0.34,
    spineRollDegrees: finite(plan.body?.rollDegrees) * weights.torsoWeight * 0.44,
    hipsYawDegrees: finite(plan.body?.yawDegrees) * weights.torsoWeight * 0.20,
    hipsPitchDegrees: finite(plan.body?.pitchDegrees) * weights.torsoWeight * 0.26,
    hipsRollDegrees: finite(plan.body?.rollDegrees) * weights.torsoWeight * 0.26,
    leftThighBendDegrees: legBase * loadedLeft,
    rightThighBendDegrees: legBase * loadedRight,
    leftKneeBendDegrees: kneeBase * loadedLeft,
    rightKneeBendDegrees: kneeBase * loadedRight,
  });

  return Object.freeze({
    stage: ATTACKER_RECOIL_PRESENTATION_STAGE,
    motionStage: profile.releaseSeparationWindowMs > 0 ? CONTACT_RELEASE_SEPARATION_MOTION_STAGE : null,
    sequence: plan.sequence ?? null,
    responseClass: plan.responseClass || null,
    attackDirection,
    elapsedMs: Math.max(0, finite(elapsedMs)),
    phase: weights.phase,
    weights,
    pose,
    complete: false,
    readyForAttackHandoff: false,
    profile,
    basePoseRequirement: 'sample-frozen-contact-pose-before-each-additive-update',
    authority: profile.releaseSeparationWindowMs > 0
      ? 'contact-release-separation-motion-then-attacker-recoil'
      : 'attacker-recoil-presentation-only',
  });
}

function applyLocalAxisAngle(THREE, bone, axis, degrees) {
  if (!bone || Math.abs(degrees) < 1e-5) return;
  const delta = new THREE.Quaternion();
  delta.setFromAxisAngle(axis, degrees * Math.PI / 180);
  bone.quaternion.multiply(delta).normalize();
}

function aimEffectorWithBone(THREE, bone, effectorWorld, targetWorld, maxDegrees) {
  if (!bone || maxDegrees <= 0) return 0;
  const boneWorld = new THREE.Vector3();
  bone.getWorldPosition(boneWorld);
  const currentDirection = effectorWorld.clone().sub(boneWorld);
  const targetDirection = targetWorld.clone().sub(boneWorld);
  if (currentDirection.lengthSq() < 1e-10 || targetDirection.lengthSq() < 1e-10) return 0;
  currentDirection.normalize();
  targetDirection.normalize();

  const desiredWorldDelta = new THREE.Quaternion().setFromUnitVectors(currentDirection, targetDirection);
  const rawAngle = 2 * Math.acos(clamp(Math.abs(desiredWorldDelta.w), -1, 1));
  if (rawAngle < 1e-6) return 0;
  const appliedAngle = Math.min(rawAngle, maxDegrees * Math.PI / 180);
  const limitedWorldDelta = new THREE.Quaternion();
  limitedWorldDelta.slerpQuaternions(
    new THREE.Quaternion(),
    desiredWorldDelta,
    appliedAngle / rawAngle,
  );

  const parentWorld = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentWorld);
  const localDelta = parentWorld.clone().invert().multiply(limitedWorldDelta).multiply(parentWorld);
  bone.quaternion.premultiply(localDelta).normalize();
  return appliedAngle * 180 / Math.PI;
}

export function createAttackerRecoilPresentationRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) {
    throw new Error('G4.3B.3 requires THREE.Vector3 + Quaternion');
  }

  const rig = options.rig;
  const required = [
    'hips', 'spine', 'chest',
    'upperarm.r', 'lowerarm.r', 'hand.r',
    'upperleg.l', 'upperleg.r',
    'lowerleg.l', 'lowerleg.r',
  ];
  const missing = required.filter((id) => !rig?.bones?.[id]);
  if (missing.length) {
    throw new Error(`G4.3B.3 missing attacker recoil bones: ${missing.join(', ')}`);
  }

  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);
  const handWorld = new THREE.Vector3();
  const targetWorld = new THREE.Vector3();
  const aimOffset = new THREE.Vector3();

  let activePlan = null;
  let activeProfile = { ...(options.profile || {}) };
  let elapsedMs = 0;
  let lastCompleted = null;
  let postCouplingHandoff = null;
  let lastAppliedChannels = ATTACKER_RECOIL_PRESENTATION_CHANNELS.FULL;
  let lastPhaseClock = null;
  let activeReactionDefinition = null;

  function snapshot() {
    const sample = activePlan
      ? sampleAttackerRecoilPresentation(activePlan, elapsedMs, activeProfile)
      : null;
    return Object.freeze({
      stage: ATTACKER_RECOIL_PRESENTATION_STAGE,
      motionStage: sample?.motionStage || null,
      active: Boolean(activePlan),
      elapsedMs,
      plan: activePlan,
      sample,
      appliedChannels: lastAppliedChannels,
      phaseClock: lastPhaseClock,
      reactionDefinition: activeReactionDefinition,
      postCouplingHandoff,
      lastCompleted,
    });
  }

  function start(plan, startOptions = {}) {
    if (activePlan) {
      return Object.freeze({ accepted: false, reason: 'attacker-recoil-already-active', snapshot: snapshot() });
    }
    if (!plan?.planned) {
      return Object.freeze({ accepted: false, reason: 'invalid-recoil-plan', snapshot: snapshot() });
    }
    if (!ATTACKER_RECOIL_PRESENTATION_PROFILES[plan.responseClass]) {
      return Object.freeze({ accepted: false, reason: 'unsupported-response-class', snapshot: snapshot() });
    }
    consumePostCouplingRecoilStaggerHandoff(rig);
    activePlan = plan;
    activeProfile = {
      ...(options.profile || {}),
      ...(startOptions.profileOverrides || {}),
    };
    elapsedMs = Math.max(0, finite(startOptions.initialElapsedMs));
    activeReactionDefinition = startOptions.reactionDefinition || null;
    postCouplingHandoff = null;
    lastAppliedChannels = ATTACKER_RECOIL_PRESENTATION_CHANNELS.FULL;
    lastPhaseClock = null;
    return Object.freeze({ accepted: true, snapshot: snapshot() });
  }

  function applyPendingPostCouplingHandoff() {
    if (!activePlan || postCouplingHandoff) return null;
    const pending = consumePostCouplingRecoilStaggerHandoff(rig);
    if (!pending) return null;
    const baseProfile = resolveProfile(activePlan, activeProfile);
    const planBeforeHandoff = activePlan;
    const elapsedBeforeHandoffMs = elapsedMs;
    const builtHandoff = buildPostCouplingRecoilStaggerHandoff({
      plan: activePlan,
      couplingReport: pending.couplingReport,
      surfaceAtContact: pending.surfaceAtContact,
      baseProfile,
    });
    postCouplingHandoff = builtHandoff;
    if (!builtHandoff.accepted) return builtHandoff;
    activePlan = builtHandoff.plan;
    const releaseSeparationWindowMs = Math.max(0, finite(builtHandoff.separation?.releaseWindowMs));
    const releaseSeparationDistanceMeters = releaseSeparationWindowMs > 0
      ? finite(RELEASE_SEPARATION_DISTANCE_METERS[activePlan.responseClass], 0)
      : 0;
    activeProfile = {
      ...activeProfile,
      ...builtHandoff.profileOverrides,
      releaseSeparationWindowMs,
      releaseSeparationDistanceMeters,
    };
    elapsedMs = Math.max(elapsedMs, builtHandoff.initialElapsedMs);
    const handoff = Object.freeze({
      ...builtHandoff,
      planIdentityPreserved: activePlan === planBeforeHandoff,
      presentationElapsedBeforeHandoffMs: elapsedBeforeHandoffMs,
      presentationElapsedAfterHandoffMs: elapsedMs,
      presentationElapsedPreserved: elapsedMs === elapsedBeforeHandoffMs,
      bodyRestartedAtHandoff: false,
    });
    postCouplingHandoff = handoff;
    return handoff;
  }

  function applyPose(sample, channels = ATTACKER_RECOIL_PRESENTATION_CHANNELS.FULL) {
    const appliedChannels = resolveAttackerRecoilPresentationChannels(channels);
    if (!sample || sample.complete) {
      return Object.freeze({
        upperArmAimDegrees: 0,
        lowerArmAimDegrees: 0,
        channels: appliedChannels,
      });
    }
    const pose = sample.pose;

    if (appliedChannels.torso) {
      if (appliedChannels.torsoYawRoll) {
        applyLocalAxisAngle(THREE, rig.bones.hips, axisY, pose.hipsYawDegrees);
      }
      applyLocalAxisAngle(THREE, rig.bones.hips, axisX, pose.hipsPitchDegrees);
      if (appliedChannels.torsoYawRoll) {
        applyLocalAxisAngle(THREE, rig.bones.hips, axisZ, pose.hipsRollDegrees);
      }

      if (appliedChannels.torsoYawRoll) {
        applyLocalAxisAngle(THREE, rig.bones.spine, axisY, pose.spineYawDegrees);
      }
      applyLocalAxisAngle(THREE, rig.bones.spine, axisX, pose.spinePitchDegrees);
      if (appliedChannels.torsoYawRoll) {
        applyLocalAxisAngle(THREE, rig.bones.spine, axisZ, pose.spineRollDegrees);
      }

      if (appliedChannels.torsoYawRoll) {
        applyLocalAxisAngle(THREE, rig.bones.chest, axisY, pose.chestYawDegrees);
      }
      applyLocalAxisAngle(THREE, rig.bones.chest, axisX, pose.chestPitchDegrees);
      if (appliedChannels.torsoYawRoll) {
        applyLocalAxisAngle(THREE, rig.bones.chest, axisZ, pose.chestRollDegrees);
      }
    }

    if (appliedChannels.legs) {
      applyLocalAxisAngle(THREE, rig.bones['upperleg.l'], axisX, pose.leftThighBendDegrees);
      applyLocalAxisAngle(THREE, rig.bones['upperleg.r'], axisX, pose.rightThighBendDegrees);
      applyLocalAxisAngle(THREE, rig.bones['lowerleg.l'], axisX, -pose.leftKneeBendDegrees);
      applyLocalAxisAngle(THREE, rig.bones['lowerleg.r'], axisX, -pose.rightKneeBendDegrees);
    }

    rig.root?.updateMatrixWorld?.(true);
    if (!appliedChannels.weaponArm) {
      return Object.freeze({
        upperArmAimDegrees: 0,
        lowerArmAimDegrees: 0,
        channels: appliedChannels,
      });
    }
    rig.bones['hand.r'].getWorldPosition(handWorld);
    aimOffset.set(
      pose.weaponAimOffsetMeters.x,
      pose.weaponAimOffsetMeters.y,
      pose.weaponAimOffsetMeters.z,
    );
    targetWorld.copy(handWorld).add(aimOffset);

    const upperArmAimDegrees = aimEffectorWithBone(
      THREE,
      rig.bones['upperarm.r'],
      handWorld,
      targetWorld,
      pose.upperArmAimDegrees,
    );
    rig.root?.updateMatrixWorld?.(true);
    rig.bones['hand.r'].getWorldPosition(handWorld);
    const lowerArmAimDegrees = aimEffectorWithBone(
      THREE,
      rig.bones['lowerarm.r'],
      handWorld,
      targetWorld,
      pose.lowerArmAimDegrees,
    );
    rig.root?.updateMatrixWorld?.(true);

    return Object.freeze({ upperArmAimDegrees, lowerArmAimDegrees, channels: appliedChannels });
  }

  function update(deltaSeconds = 1 / 60, context = {}) {
    if (!activePlan) return snapshot();
    const handoff = applyPendingPostCouplingHandoff();
    const phaseClock = advanceAttackerRecoilPresentationClock(
      activePlan,
      elapsedMs,
      deltaSeconds,
      activeProfile,
      context,
    );
    elapsedMs = phaseClock?.elapsedMs ?? elapsedMs;
    lastPhaseClock = phaseClock;
    const sample = sampleAttackerRecoilPresentation(activePlan, elapsedMs, activeProfile);
    lastAppliedChannels = resolveAttackerRecoilPresentationChannels(context.channels);
    const appliedAim = applyPose(sample, lastAppliedChannels);

    if (sample?.complete) {
      lastCompleted = Object.freeze({
        stage: ATTACKER_RECOIL_PRESENTATION_STAGE,
        motionStage: sample.motionStage || null,
        sequence: activePlan.sequence ?? null,
        responseClass: activePlan.responseClass,
        attackDirection: activePlan.attackDirection,
        durationMs: sample.profile?.visibleSettleEndMs
          ?? sample.profile?.settleEndMs
          ?? ATTACKER_RECOIL_PRESENTATION_PROFILES[activePlan.responseClass].settleEndMs,
        postCouplingStage: postCouplingHandoff?.stage || null,
        couplingMomentum: postCouplingHandoff?.couplingMomentum || null,
        reactionDefinitionId: activeReactionDefinition?.id || null,
        readyForAttackHandoff: true,
      });
      activePlan = null;
      activeProfile = { ...(options.profile || {}) };
      elapsedMs = 0;
      postCouplingHandoff = null;
      activeReactionDefinition = null;
      lastAppliedChannels = ATTACKER_RECOIL_PRESENTATION_CHANNELS.FULL;
      return Object.freeze({
        ...snapshot(),
        justCompleted: true,
        completed: lastCompleted,
        appliedAim,
        postCouplingHandoffApplied: handoff?.accepted === true,
      });
    }

    return Object.freeze({
      ...snapshot(),
      sample,
      appliedAim,
      justCompleted: false,
      postCouplingHandoffApplied: handoff?.accepted === true,
    });
  }

  function reset() {
    activePlan = null;
    activeProfile = { ...(options.profile || {}) };
    elapsedMs = 0;
    postCouplingHandoff = null;
    lastAppliedChannels = ATTACKER_RECOIL_PRESENTATION_CHANNELS.FULL;
    lastPhaseClock = null;
    activeReactionDefinition = null;
    consumePostCouplingRecoilStaggerHandoff(rig);
    return snapshot();
  }

  return Object.freeze({
    get snapshot() { return snapshot(); },
    get active() { return Boolean(activePlan); },
    start,
    update,
    reset,
  });
}
