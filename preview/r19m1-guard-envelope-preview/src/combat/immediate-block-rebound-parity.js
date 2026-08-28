export const IMMEDIATE_BLOCK_REBOUND_PARITY_STAGE = 'G4.3B.5R.2.4.2';

export const IMMEDIATE_BLOCK_SHIELD_GIVE_PHASES = Object.freeze({
  GIVE: 'shield-give',
  RECOVER: 'shield-recover',
  COMPLETE: 'complete',
});

export const IMMEDIATE_BLOCK_SHIELD_GIVE_PROFILE = Object.freeze({
  durationMs: 150,
  givePeakMs: 68,
  shieldGiveMeters: 0.030,
  defenderUpperArmMaxDegrees: 8,
  defenderLowerArmMaxDegrees: 12,
  attackerRecoilAuthority: 'B2/B3-immediate-parallel',
  attackerWeaponAuthority: 'B2/B3-only-no-shield-follow',
  postCouplingHandoff: false,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function vec(input = {}) {
  return { x: finite(input.x), y: finite(input.y), z: finite(input.z) };
}

function length(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value, fallback = { x: 0, y: 0, z: 1 }) {
  const magnitude = length(value);
  if (magnitude > 1e-8) {
    return { x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude };
  }
  return { ...fallback };
}

function freezeVector(value) {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

export function sampleImmediateBlockShieldGive(input = {}) {
  const profile = Object.freeze({ ...IMMEDIATE_BLOCK_SHIELD_GIVE_PROFILE, ...(input.profile || {}) });
  const rawElapsedMs = Math.max(0, finite(input.elapsedMs));
  const elapsedMs = Math.min(rawElapsedMs, profile.durationMs);
  const complete = rawElapsedMs >= profile.durationMs;
  const incomingDirection = normalize(vec(input.incomingVelocity || input.incomingDirection));

  let phase = IMMEDIATE_BLOCK_SHIELD_GIVE_PHASES.GIVE;
  let giveWeight = 0;
  if (elapsedMs <= profile.givePeakMs) {
    giveWeight = smoothstep(elapsedMs / Math.max(1, profile.givePeakMs));
  } else {
    phase = complete ? IMMEDIATE_BLOCK_SHIELD_GIVE_PHASES.COMPLETE : IMMEDIATE_BLOCK_SHIELD_GIVE_PHASES.RECOVER;
    const recover = smoothstep(
      (elapsedMs - profile.givePeakMs) / Math.max(1, profile.durationMs - profile.givePeakMs),
    );
    giveWeight = 1 - recover;
  }

  const shieldOffset = {
    x: incomingDirection.x * profile.shieldGiveMeters * giveWeight,
    y: incomingDirection.y * profile.shieldGiveMeters * giveWeight,
    z: incomingDirection.z * profile.shieldGiveMeters * giveWeight,
  };

  return Object.freeze({
    stage: IMMEDIATE_BLOCK_REBOUND_PARITY_STAGE,
    outcome: 'block',
    phase,
    elapsedMs: rawElapsedMs,
    complete,
    giveWeight,
    shieldOffset: freezeVector(shieldOffset),
    attackerRecoilFrozen: false,
    attackerWeaponFollow: false,
    postCouplingHandoff: false,
    profile,
    authority: 'defender-shield-give-parallel-to-original-B2-B3-block-bounce',
  });
}

function aimEffectorWithBone(THREE, bone, effectorWorld, targetWorld, maxDegrees) {
  if (!bone || maxDegrees <= 0) return 0;
  const boneWorld = new THREE.Vector3();
  bone.getWorldPosition(boneWorld);
  const current = effectorWorld.clone().sub(boneWorld);
  const target = targetWorld.clone().sub(boneWorld);
  if (current.lengthSq() < 1e-10 || target.lengthSq() < 1e-10) return 0;
  current.normalize();
  target.normalize();
  const desired = new THREE.Quaternion().setFromUnitVectors(current, target);
  const raw = 2 * Math.acos(Math.max(-1, Math.min(1, Math.abs(desired.w))));
  if (raw < 1e-6) return 0;
  const applied = Math.min(raw, maxDegrees * Math.PI / 180);
  const limited = new THREE.Quaternion();
  limited.slerpQuaternions(new THREE.Quaternion(), desired, applied / raw);
  const parentWorld = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentWorld);
  const localDelta = parentWorld.clone().invert().multiply(limited).multiply(parentWorld);
  bone.quaternion.premultiply(localDelta).normalize();
  return applied * 180 / Math.PI;
}

export function createImmediateBlockShieldGiveRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) {
    throw new Error('G4.3B.5R.2.4.2 requires THREE.Vector3 + Quaternion');
  }
  const defenderRig = options.defenderRig;
  const buckler = options.buckler;
  if (!defenderRig?.bones?.['upperarm.l'] || !defenderRig?.bones?.['lowerarm.l']) {
    throw new Error('G4.3B.5R.2.4.2 requires defender left-arm bones');
  }
  if (!buckler?.getWorldParrySurface) {
    throw new Error('G4.3B.5R.2.4.2 requires Buckler parry surface');
  }

  const target = new THREE.Vector3();
  const effector = new THREE.Vector3();
  let active = null;
  let lastReport = null;

  function reset() {
    active = null;
    lastReport = null;
    return null;
  }

  function start(input = {}) {
    if (active) {
      return Object.freeze({ accepted: false, reason: 'immediate-block-give-already-active', report: lastReport });
    }
    const surface = input.surfaceAtContact || buckler.getWorldParrySurface();
    const profile = Object.freeze({ ...IMMEDIATE_BLOCK_SHIELD_GIVE_PROFILE, ...(input.profile || {}) });
    active = {
      profile,
      incomingVelocity: vec(input.incomingVelocity || input.contact?.incomingVelocity),
      surfaceCenter: vec(surface.center),
      elapsedMs: 0,
    };
    lastReport = Object.freeze({
      accepted: true,
      active: true,
      stage: IMMEDIATE_BLOCK_REBOUND_PARITY_STAGE,
      outcome: 'block',
      phase: IMMEDIATE_BLOCK_SHIELD_GIVE_PHASES.GIVE,
      elapsedMs: 0,
      complete: false,
      shieldOffset: Object.freeze({ x: 0, y: 0, z: 0 }),
      attackerRecoilFrozen: false,
      attackerWeaponFollow: false,
      postCouplingHandoff: false,
      profile,
    });
    return lastReport;
  }

  function update(deltaSeconds = 1 / 60) {
    if (!active) {
      return Object.freeze({ active: false, stage: IMMEDIATE_BLOCK_REBOUND_PARITY_STAGE, report: lastReport });
    }
    active.elapsedMs += Math.max(0, finite(deltaSeconds, 1 / 60)) * 1000;
    const sample = sampleImmediateBlockShieldGive({
      elapsedMs: active.elapsedMs,
      incomingVelocity: active.incomingVelocity,
      profile: active.profile,
    });

    target.set(
      active.surfaceCenter.x + sample.shieldOffset.x,
      active.surfaceCenter.y + sample.shieldOffset.y,
      active.surfaceCenter.z + sample.shieldOffset.z,
    );
    const appliedDegrees = { defenderUpperArm: 0, defenderLowerArm: 0 };
    for (let i = 0; i < 2; i += 1) {
      const surface = buckler.getWorldParrySurface();
      effector.set(surface.center.x, surface.center.y, surface.center.z);
      appliedDegrees.defenderLowerArm += aimEffectorWithBone(
        THREE,
        defenderRig.bones['lowerarm.l'],
        effector,
        target,
        Math.max(0, active.profile.defenderLowerArmMaxDegrees - appliedDegrees.defenderLowerArm),
      );
      defenderRig.root?.updateMatrixWorld?.(true);
      const afterLower = buckler.getWorldParrySurface();
      effector.set(afterLower.center.x, afterLower.center.y, afterLower.center.z);
      appliedDegrees.defenderUpperArm += aimEffectorWithBone(
        THREE,
        defenderRig.bones['upperarm.l'],
        effector,
        target,
        Math.max(0, active.profile.defenderUpperArmMaxDegrees - appliedDegrees.defenderUpperArm),
      );
      defenderRig.root?.updateMatrixWorld?.(true);
    }

    const finalSurface = buckler.getWorldParrySurface();
    lastReport = Object.freeze({
      ...sample,
      active: !sample.complete,
      appliedDegrees: Object.freeze(appliedDegrees),
      finalSurface,
    });
    if (sample.complete) active = null;
    return lastReport;
  }

  return Object.freeze({
    start,
    update,
    reset,
    get active() { return Boolean(active); },
    get report() { return lastReport; },
  });
}
