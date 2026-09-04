import { analyzeDirectionalGuardThreat } from './directional-guard-bracing.js';

export const ARTICULATED_IMPACT_BRACING_STAGE = 'G4.3A.3';
export const ARTICULATED_IMPACT_BRACING_MODES = Object.freeze(['off', 'brace', 'brace-fine']);

export const ARTICULATED_IMPACT_BRACING_PROFILE = Object.freeze({
  maxPelvisDropMeters: 0.022,
  overheadPelvisDropMeters: 0.012,
  lateralPelvisDropMeters: 0.006,
  maxHipsPitchDegrees: 8,
  maxHipsRollDegrees: 4.5,
  maxSpinePitchDegrees: 6.5,
  maxSpineRollDegrees: 4,
  maxChestYawDegrees: 7,
  maxChestPitchDegrees: 4.5,
  maxShoulderLiftMeters: 0.05,
  maxShoulderBraceDegrees: 9,
  maxForearmBraceDegrees: 7,
  maxThighBendDegrees: 14,
  maxKneeBendDegrees: 18,
  fineTrackMaxMeters: 0.07,
  responsePerSecond: 13,
  contactCompressionMs: 45,
  reboundEndMs: 105,
  settleEndMs: 190,
  reboundOvershoot: -0.14,
  impactPelvisDropMeters: 0.008,
  impactHipsPitchDegrees: 4,
  impactSpinePitchDegrees: 4.5,
  impactChestPitchDegrees: 2.5,
  impactRollDegrees: 2.2,
  impactLoadedKneeDegrees: 5,
  impactSupportKneeDegrees: 2.5,
  impactLoadedThighDegrees: 3.5,
  impactSupportThighDegrees: 1.8,
  impactArmCompressionDegrees: 4,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, finite(value))); }
function clamp01(value) { return clamp(value, 0, 1); }
function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
function mapStrategy(strategy) {
  if (strategy === 'low-crouch') return 'low-articulated-brace';
  if (strategy === 'overhead-brace') return 'overhead-articulated-brace';
  return 'lateral-articulated-brace';
}
function zeroBody() {
  return Object.freeze({
    pelvisDropMeters: 0,
    hipsPitchDegrees: 0,
    hipsRollDegrees: 0,
    spinePitchDegrees: 0,
    spineRollDegrees: 0,
    chestYawDegrees: 0,
    chestPitchDegrees: 0,
    shoulderLiftMeters: 0,
    shoulderBraceDegrees: 0,
    forearmBraceDegrees: 0,
    leftThighBendDegrees: 0,
    rightThighBendDegrees: 0,
    leftKneeBendDegrees: 0,
    rightKneeBendDegrees: 0,
  });
}

export function planArticulatedImpactBracing(input = {}) {
  const mode = String(input.mode || 'brace-fine').toLowerCase();
  if (!ARTICULATED_IMPACT_BRACING_MODES.includes(mode)) {
    throw new Error(`Unknown G4.3A.3 bracing mode: ${mode}`);
  }
  if (mode === 'off') {
    return Object.freeze({
      stage: ARTICULATED_IMPACT_BRACING_STAGE,
      mode,
      strategy: 'authored-guard',
      analysis: null,
      body: zeroBody(),
      fineTrackMaxMeters: 0,
      authority: 'presentation-probe-only',
    });
  }

  const analysis = input.analysis || analyzeDirectionalGuardThreat(input);
  if (!analysis) return null;

  const profile = ARTICULATED_IMPACT_BRACING_PROFILE;
  const low = clamp01(analysis.lowWeight);
  const overhead = clamp01(analysis.overheadWeight);
  const lateral = clamp01(analysis.lateralWeight);
  const side = Math.sign(finite(analysis.lateralSign));

  const baseThigh = 5.5 * low + 4.8 * overhead + 1.8 * lateral;
  const baseKnee = 8.5 * low + 7.5 * overhead + 2.8 * lateral;
  const asymThigh = side ? (4.5 * lateral + 3 * low) : 0;
  const asymKnee = side ? (6.5 * lateral + 4 * low) : 0;
  const leftLoad = side < 0 ? 1 : side > 0 ? -0.35 : 0;
  const rightLoad = side > 0 ? 1 : side < 0 ? -0.35 : 0;

  const body = Object.freeze({
    pelvisDropMeters: clamp(
      low * profile.maxPelvisDropMeters
        + overhead * profile.overheadPelvisDropMeters
        + lateral * profile.lateralPelvisDropMeters,
      0,
      profile.maxPelvisDropMeters,
    ),
    hipsPitchDegrees: clamp(
      5.5 * low + 4 * overhead,
      -profile.maxHipsPitchDegrees,
      profile.maxHipsPitchDegrees,
    ),
    hipsRollDegrees: clamp(
      side * profile.maxHipsRollDegrees * lateral,
      -profile.maxHipsRollDegrees,
      profile.maxHipsRollDegrees,
    ),
    spinePitchDegrees: clamp(
      2.8 * low + 5.8 * overhead + 1.3 * lateral,
      -profile.maxSpinePitchDegrees,
      profile.maxSpinePitchDegrees,
    ),
    spineRollDegrees: clamp(
      -side * profile.maxSpineRollDegrees * lateral * 0.9,
      -profile.maxSpineRollDegrees,
      profile.maxSpineRollDegrees,
    ),
    chestYawDegrees: clamp(
      side * profile.maxChestYawDegrees * lateral,
      -profile.maxChestYawDegrees,
      profile.maxChestYawDegrees,
    ),
    chestPitchDegrees: clamp(
      profile.maxChestPitchDegrees * (overhead * 0.8 + low * 0.2),
      -profile.maxChestPitchDegrees,
      profile.maxChestPitchDegrees,
    ),
    shoulderLiftMeters: clamp(
      profile.maxShoulderLiftMeters * (overhead + lateral * 0.18) * (1 - low * 0.55),
      0,
      profile.maxShoulderLiftMeters,
    ),
    shoulderBraceDegrees: clamp(
      profile.maxShoulderBraceDegrees * Math.max(overhead, lateral * 0.65, low * 0.25),
      0,
      profile.maxShoulderBraceDegrees,
    ),
    forearmBraceDegrees: clamp(
      profile.maxForearmBraceDegrees * Math.max(overhead * 0.8, lateral * 0.55, low * 0.2),
      0,
      profile.maxForearmBraceDegrees,
    ),
    leftThighBendDegrees: clamp(
      baseThigh + asymThigh * leftLoad,
      0,
      profile.maxThighBendDegrees,
    ),
    rightThighBendDegrees: clamp(
      baseThigh + asymThigh * rightLoad,
      0,
      profile.maxThighBendDegrees,
    ),
    leftKneeBendDegrees: clamp(
      baseKnee + asymKnee * leftLoad,
      0,
      profile.maxKneeBendDegrees,
    ),
    rightKneeBendDegrees: clamp(
      baseKnee + asymKnee * rightLoad,
      0,
      profile.maxKneeBendDegrees,
    ),
  });

  return Object.freeze({
    stage: ARTICULATED_IMPACT_BRACING_STAGE,
    mode,
    strategy: mapStrategy(analysis.strategy),
    analysis,
    body,
    fineTrackMaxMeters: mode === 'brace-fine' ? profile.fineTrackMaxMeters : 0,
    authority: 'presentation-probe-only',
  });
}

export function sampleImpactCompression(elapsedMs, profile = ARTICULATED_IMPACT_BRACING_PROFILE) {
  const elapsed = Math.max(0, finite(elapsedMs));
  const compressionEnd = Math.max(1, finite(profile.contactCompressionMs, 45));
  const reboundEnd = Math.max(compressionEnd + 1, finite(profile.reboundEndMs, 105));
  const settleEnd = Math.max(reboundEnd + 1, finite(profile.settleEndMs, 190));
  const overshoot = clamp(finite(profile.reboundOvershoot, -0.14), -0.35, 0);

  if (elapsed >= settleEnd) {
    return Object.freeze({ phase: 'idle', scale: 0, complete: true, elapsedMs: elapsed });
  }
  if (elapsed <= compressionEnd) {
    return Object.freeze({
      phase: 'compression',
      scale: smoothstep01(elapsed / compressionEnd),
      complete: false,
      elapsedMs: elapsed,
    });
  }
  if (elapsed <= reboundEnd) {
    const t = smoothstep01((elapsed - compressionEnd) / (reboundEnd - compressionEnd));
    return Object.freeze({
      phase: 'rebound',
      scale: 1 + (overshoot - 1) * t,
      complete: false,
      elapsedMs: elapsed,
    });
  }
  const t = smoothstep01((elapsed - reboundEnd) / (settleEnd - reboundEnd));
  return Object.freeze({
    phase: 'settle',
    scale: overshoot * (1 - t),
    complete: false,
    elapsedMs: elapsed,
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

export function createArticulatedImpactBracingRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) {
    throw new Error('G4.3A.3 requires THREE.Vector3 + Quaternion');
  }
  const rig = options.rig;
  const buckler = options.buckler;
  const required = [
    'hips', 'spine', 'chest',
    'upperarm.l', 'lowerarm.l',
    'upperleg.l', 'upperleg.r',
    'lowerleg.l', 'lowerleg.r',
  ];
  const missing = required.filter((id) => !rig?.bones?.[id]);
  if (missing.length) throw new Error(`G4.3A.3 missing articulated bones: ${missing.join(', ')}`);
  if (!buckler?.getWorldParrySurface) throw new Error('G4.3A.3 requires Buckler parry surface');

  const profile = ARTICULATED_IMPACT_BRACING_PROFILE;
  const current = { ...zeroBody() };
  let impact = null;

  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);
  const effector = new THREE.Vector3();
  const target = new THREE.Vector3();
  const upShift = new THREE.Vector3();

  function triggerImpact(input = {}) {
    const direction = String(input.direction || 'top').toLowerCase();
    impact = {
      elapsedMs: 0,
      direction,
      strength: clamp(finite(input.strength, 1), 0.35, 1.25),
    };
    return Object.freeze({ stage: ARTICULATED_IMPACT_BRACING_STAGE, ...impact });
  }

  function resetImpact() { impact = null; }

  function update(plan, deltaSeconds = 1 / 60) {
    const desired = plan?.body || zeroBody();
    const dt = Math.max(1e-5, finite(deltaSeconds, 1 / 60));
    const alpha = 1 - Math.exp(-profile.responsePerSecond * dt);
    for (const key of Object.keys(current)) {
      current[key] += (finite(desired[key]) - current[key]) * alpha;
    }

    let impactSample = Object.freeze({ phase: 'idle', scale: 0, complete: true, elapsedMs: 0 });
    let impactDirection = '';
    let impactStrength = 0;
    if (impact) {
      impact.elapsedMs += dt * 1000;
      impactSample = sampleImpactCompression(impact.elapsedMs, profile);
      impactDirection = impact.direction;
      impactStrength = impact.strength;
      if (impactSample.complete) impact = null;
    }

    const impactScale = impactSample.scale * impactStrength;
    const compression = Math.max(0, impactScale);
    const side = impactDirection === 'left' ? -1 : impactDirection === 'right' ? 1 : 0;
    const loadedLeft = side < 0 ? 1 : side > 0 ? 0 : 0.5;
    const loadedRight = side > 0 ? 1 : side < 0 ? 0 : 0.5;

    const pose = {
      pelvisDropMeters: clamp(
        current.pelvisDropMeters + compression * profile.impactPelvisDropMeters,
        0,
        profile.maxPelvisDropMeters + profile.impactPelvisDropMeters,
      ),
      hipsPitchDegrees: current.hipsPitchDegrees + impactScale * profile.impactHipsPitchDegrees,
      hipsRollDegrees: current.hipsRollDegrees + side * impactScale * profile.impactRollDegrees,
      spinePitchDegrees: current.spinePitchDegrees + impactScale * profile.impactSpinePitchDegrees,
      spineRollDegrees: current.spineRollDegrees - side * impactScale * profile.impactRollDegrees,
      chestYawDegrees: current.chestYawDegrees + side * impactScale * 1.6,
      chestPitchDegrees: current.chestPitchDegrees + impactScale * profile.impactChestPitchDegrees,
      shoulderLiftMeters: Math.max(0, current.shoulderLiftMeters - compression * 0.006),
      shoulderBraceDegrees: current.shoulderBraceDegrees,
      forearmBraceDegrees: current.forearmBraceDegrees,
      leftThighBendDegrees: current.leftThighBendDegrees + impactScale * (
        loadedLeft * profile.impactLoadedThighDegrees
        + (1 - loadedLeft) * profile.impactSupportThighDegrees
      ),
      rightThighBendDegrees: current.rightThighBendDegrees + impactScale * (
        loadedRight * profile.impactLoadedThighDegrees
        + (1 - loadedRight) * profile.impactSupportThighDegrees
      ),
      leftKneeBendDegrees: current.leftKneeBendDegrees + impactScale * (
        loadedLeft * profile.impactLoadedKneeDegrees
        + (1 - loadedLeft) * profile.impactSupportKneeDegrees
      ),
      rightKneeBendDegrees: current.rightKneeBendDegrees + impactScale * (
        loadedRight * profile.impactLoadedKneeDegrees
        + (1 - loadedRight) * profile.impactSupportKneeDegrees
      ),
      armCompressionDegrees: impactScale * profile.impactArmCompressionDegrees,
    };

    rig.bones.hips.position.y -= pose.pelvisDropMeters;
    applyLocalAxisAngle(THREE, rig.bones.hips, axisX, pose.hipsPitchDegrees);
    applyLocalAxisAngle(THREE, rig.bones.hips, axisZ, pose.hipsRollDegrees);
    applyLocalAxisAngle(THREE, rig.bones.spine, axisX, pose.spinePitchDegrees);
    applyLocalAxisAngle(THREE, rig.bones.spine, axisZ, pose.spineRollDegrees);
    applyLocalAxisAngle(THREE, rig.bones.chest, axisY, pose.chestYawDegrees);
    applyLocalAxisAngle(THREE, rig.bones.chest, axisX, pose.chestPitchDegrees);
    applyLocalAxisAngle(THREE, rig.bones['upperleg.l'], axisX, pose.leftThighBendDegrees);
    applyLocalAxisAngle(THREE, rig.bones['upperleg.r'], axisX, pose.rightThighBendDegrees);
    applyLocalAxisAngle(THREE, rig.bones['lowerleg.l'], axisX, -pose.leftKneeBendDegrees);
    applyLocalAxisAngle(THREE, rig.bones['lowerleg.r'], axisX, -pose.rightKneeBendDegrees);
    rig.root?.updateMatrixWorld?.(true);

    let shoulderAppliedDegrees = 0;
    let forearmAppliedDegrees = 0;
    if (pose.shoulderLiftMeters > 1e-5) {
      let surface = buckler.getWorldParrySurface();
      effector.set(surface.center.x, surface.center.y, surface.center.z);
      upShift.set(0, pose.shoulderLiftMeters, 0);
      target.copy(effector).add(upShift);
      shoulderAppliedDegrees = aimEffectorWithBone(
        THREE,
        rig.bones['upperarm.l'],
        effector,
        target,
        Math.min(pose.shoulderBraceDegrees, profile.maxShoulderBraceDegrees),
      );
      rig.root?.updateMatrixWorld?.(true);

      surface = buckler.getWorldParrySurface();
      effector.set(surface.center.x, surface.center.y, surface.center.z);
      upShift.set(0, pose.shoulderLiftMeters * 0.45, 0);
      target.copy(effector).add(upShift);
      forearmAppliedDegrees = aimEffectorWithBone(
        THREE,
        rig.bones['lowerarm.l'],
        effector,
        target,
        Math.min(pose.forearmBraceDegrees, profile.maxForearmBraceDegrees),
      );
      rig.root?.updateMatrixWorld?.(true);
    }

    applyLocalAxisAngle(THREE, rig.bones['upperarm.l'], axisX, pose.armCompressionDegrees * 0.45);
    applyLocalAxisAngle(THREE, rig.bones['lowerarm.l'], axisX, -pose.armCompressionDegrees);
    rig.root?.updateMatrixWorld?.(true);

    return Object.freeze({
      stage: ARTICULATED_IMPACT_BRACING_STAGE,
      strategy: plan?.strategy || 'authored-guard',
      current: Object.freeze({ ...current }),
      pose: Object.freeze({ ...pose }),
      impact: Object.freeze({
        phase: impactSample.phase,
        scale: impactSample.scale,
        strength: impactStrength,
        direction: impactDirection,
        elapsedMs: impactSample.elapsedMs,
      }),
      shoulderAppliedDegrees,
      forearmAppliedDegrees,
      surface: buckler.getWorldParrySurface(),
      authority: 'presentation-probe-only',
    });
  }

  function reset() {
    Object.keys(current).forEach((key) => { current[key] = 0; });
    impact = null;
  }

  return Object.freeze({
    update,
    reset,
    triggerImpact,
    resetImpact,
    get current() { return Object.freeze({ ...current }); },
    get impactActive() { return Boolean(impact); },
  });
}
