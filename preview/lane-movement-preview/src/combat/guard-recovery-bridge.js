const EPSILON = 1e-8;
const COUNTER_CONTINUITY_HOLD_MS = 1000 / 60;

export const GUARD_RECOVERY_PROFILE_IDS = Object.freeze({
  BLOCK: 'guard_recovery_block_v1',
  PARRY: 'guard_recovery_parry_v1',
  PERFECT_PARRY: 'guard_recovery_perfect_parry_v1',
  COUNTER: 'guard_recovery_counter_v1',
  DEFAULT: 'guard_recovery_default_v1',
});

export const GUARD_RECOVERY_PROFILES = Object.freeze({
  block: Object.freeze({ id: GUARD_RECOVERY_PROFILE_IDS.BLOCK, durationMs: 210, momentumScale: 0.34 }),
  parry: Object.freeze({ id: GUARD_RECOVERY_PROFILE_IDS.PARRY, durationMs: 170, momentumScale: 0.30 }),
  'perfect-parry': Object.freeze({ id: GUARD_RECOVERY_PROFILE_IDS.PERFECT_PARRY, durationMs: 270, momentumScale: 0.42 }),
  counter: Object.freeze({
    id: GUARD_RECOVERY_PROFILE_IDS.COUNTER,
    durationMs: 310,
    momentumScale: 0.38,
    continuityHoldMs: COUNTER_CONTINUITY_HOLD_MS,
    inertiaEnvelope: 'soft-start',
  }),
  default: Object.freeze({ id: GUARD_RECOVERY_PROFILE_IDS.DEFAULT, durationMs: 220, momentumScale: 0.32 }),
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vec3(value, fallback = 0) {
  return {
    x: finite(value?.x, fallback),
    y: finite(value?.y, fallback),
    z: finite(value?.z, fallback),
  };
}

function quat(value) {
  const out = {
    x: finite(value?.x),
    y: finite(value?.y),
    z: finite(value?.z),
    w: finite(value?.w, 1),
  };
  return normalizeQuat(out);
}

function normalizeQuat(value) {
  const length = Math.hypot(value.x, value.y, value.z, value.w) || 1;
  return { x: value.x / length, y: value.y / length, z: value.z / length, w: value.w / length };
}

function multiplyQuat(a, b) {
  return normalizeQuat({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}

function inverseQuat(value) {
  return { x: -value.x, y: -value.y, z: -value.z, w: value.w };
}

function slerpQuat(fromInput, toInput, tInput) {
  const t = clamp01(tInput);
  const from = quat(fromInput);
  let to = quat(toInput);
  let dot = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w;
  if (dot < 0) {
    dot = -dot;
    to = { x: -to.x, y: -to.y, z: -to.z, w: -to.w };
  }
  if (dot > 0.9995) {
    return normalizeQuat({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t,
      w: from.w + (to.w - from.w) * t,
    });
  }
  const theta = Math.acos(Math.max(-1, Math.min(1, dot)));
  const sinTheta = Math.sin(theta);
  const a = Math.sin((1 - t) * theta) / sinTheta;
  const b = Math.sin(t * theta) / sinTheta;
  return normalizeQuat({
    x: from.x * a + to.x * b,
    y: from.y * a + to.y * b,
    z: from.z * a + to.z * b,
    w: from.w * a + to.w * b,
  });
}

function angularVelocity(previousInput, sourceInput, deltaSeconds) {
  if (!(deltaSeconds > EPSILON)) return { axis: { x: 0, y: 0, z: 0 }, radiansPerSecond: 0 };
  const previous = quat(previousInput);
  const source = quat(sourceInput);
  let delta = multiplyQuat(inverseQuat(previous), source);
  if (delta.w < 0) delta = { x: -delta.x, y: -delta.y, z: -delta.z, w: -delta.w };
  const w = Math.max(-1, Math.min(1, delta.w));
  const angle = 2 * Math.acos(w);
  const sinHalf = Math.sqrt(Math.max(0, 1 - w * w));
  if (sinHalf < 1e-5 || angle < 1e-5) return { axis: { x: 0, y: 0, z: 0 }, radiansPerSecond: 0 };
  return {
    axis: { x: delta.x / sinHalf, y: delta.y / sinHalf, z: delta.z / sinHalf },
    radiansPerSecond: angle / deltaSeconds,
  };
}

function axisAngleQuat(axis, angle) {
  if (Math.abs(angle) < EPSILON) return { x: 0, y: 0, z: 0, w: 1 };
  const half = angle * 0.5;
  const sin = Math.sin(half);
  return normalizeQuat({ x: axis.x * sin, y: axis.y * sin, z: axis.z * sin, w: Math.cos(half) });
}

function smoothstep(t) {
  const value = clamp01(t);
  return value * value * (3 - 2 * value);
}

function inertiaEnvelope(t, mode = 'default') {
  const value = clamp01(t);
  if (mode === 'soft-start') return smoothstep(value) * ((1 - value) ** 2);
  return value * ((1 - value) ** 2);
}

function captureTransform(object3d) {
  if (!object3d) return null;
  return Object.freeze({
    position: Object.freeze(vec3(object3d.position)),
    quaternion: Object.freeze(quat(object3d.quaternion)),
    scale: Object.freeze(vec3(object3d.scale, 1)),
  });
}

function applyVector(target, value) {
  if (!target) return;
  if (typeof target.set === 'function') target.set(value.x, value.y, value.z);
  else Object.assign(target, value);
}

function applyQuaternion(target, value) {
  if (!target) return;
  if (typeof target.set === 'function') target.set(value.x, value.y, value.z, value.w);
  else Object.assign(target, value);
}

export function captureRigPose(rig) {
  const bones = rig?.bones || {};
  const entries = {};
  for (const [name, bone] of Object.entries(bones)) {
    if (!bone?.quaternion) continue;
    entries[name] = captureTransform(bone);
  }
  return Object.freeze(entries);
}

export function applyRigPose(rig, pose) {
  const bones = rig?.bones || {};
  for (const [name, transform] of Object.entries(pose || {})) {
    const bone = bones[name];
    if (!bone || !transform) continue;
    applyVector(bone.position, transform.position);
    applyQuaternion(bone.quaternion, transform.quaternion);
    applyVector(bone.scale, transform.scale);
  }
  rig?.root?.updateMatrixWorld?.(true);
}

export function captureObjectTransform(object3d) {
  return captureTransform(object3d);
}

export function applyObjectTransform(object3d, transform) {
  if (!object3d || !transform) return;
  applyVector(object3d.position, transform.position);
  applyQuaternion(object3d.quaternion, transform.quaternion);
  applyVector(object3d.scale, transform.scale);
  object3d.updateMatrixWorld?.(true);
}

function blendVector(previous, source, target, progress, durationSeconds, sampleDeltaSeconds, momentumScale, envelopeMode) {
  const eased = smoothstep(progress);
  const envelope = inertiaEnvelope(progress, envelopeMode);
  const velocityScale = sampleDeltaSeconds > EPSILON && sampleDeltaSeconds <= 0.08 ? 1 : 0;
  const vx = velocityScale ? (source.x - previous.x) / sampleDeltaSeconds : 0;
  const vy = velocityScale ? (source.y - previous.y) / sampleDeltaSeconds : 0;
  const vz = velocityScale ? (source.z - previous.z) / sampleDeltaSeconds : 0;
  return {
    x: source.x + (target.x - source.x) * eased + vx * durationSeconds * envelope * momentumScale,
    y: source.y + (target.y - source.y) * eased + vy * durationSeconds * envelope * momentumScale,
    z: source.z + (target.z - source.z) * eased + vz * durationSeconds * envelope * momentumScale,
  };
}

function blendQuaternion(previous, source, target, progress, durationSeconds, sampleDeltaSeconds, momentumScale, envelopeMode) {
  const eased = smoothstep(progress);
  const base = slerpQuat(source, target, eased);
  const envelope = inertiaEnvelope(progress, envelopeMode);
  const velocity = sampleDeltaSeconds > EPSILON && sampleDeltaSeconds <= 0.08
    ? angularVelocity(previous, source, sampleDeltaSeconds)
    : { axis: { x: 0, y: 0, z: 0 }, radiansPerSecond: 0 };
  const extraAngle = velocity.radiansPerSecond * durationSeconds * envelope * momentumScale;
  return multiplyQuat(base, axisAngleQuat(velocity.axis, extraAngle));
}

export function blendRecoveryTransform(previousInput, sourceInput, targetInput, progress, options = {}) {
  const source = sourceInput || targetInput;
  const previous = previousInput || source;
  const target = targetInput || source;
  if (!source || !target) return target || source || null;
  const durationSeconds = Math.max(0.001, finite(options.durationMs, 220) / 1000);
  const sampleDeltaSeconds = Math.max(0, finite(options.sampleDeltaMs, 0) / 1000);
  const momentumScale = Math.max(0, finite(options.momentumScale, 0.32));
  const envelopeMode = options.inertiaEnvelope || 'default';
  return Object.freeze({
    position: Object.freeze(blendVector(previous.position, source.position, target.position, progress, durationSeconds, sampleDeltaSeconds, momentumScale, envelopeMode)),
    quaternion: Object.freeze(blendQuaternion(previous.quaternion, source.quaternion, target.quaternion, progress, durationSeconds, sampleDeltaSeconds, momentumScale, envelopeMode)),
    scale: Object.freeze({
      x: source.scale.x + (target.scale.x - source.scale.x) * smoothstep(progress),
      y: source.scale.y + (target.scale.y - source.scale.y) * smoothstep(progress),
      z: source.scale.z + (target.scale.z - source.scale.z) * smoothstep(progress),
    }),
  });
}

export function blendRecoveryPose(previousPose, sourcePose, targetPose, progress, options = {}) {
  const output = {};
  const names = new Set([...Object.keys(sourcePose || {}), ...Object.keys(targetPose || {})]);
  for (const name of names) {
    const source = sourcePose?.[name] || targetPose?.[name];
    const previous = previousPose?.[name] || source;
    const target = targetPose?.[name] || source;
    if (!source || !target) continue;
    output[name] = blendRecoveryTransform(previous, source, target, progress, options);
  }
  return Object.freeze(output);
}

export function resolveGuardRecoveryProfile(snapshot = {}) {
  const payload = snapshot?.lastTransition?.payload || {};
  if (snapshot?.lastOutcome === 'counter' || payload.counterProfileId) return GUARD_RECOVERY_PROFILES.counter;
  if (payload.reactionVariant === 'perfect-parry') return GUARD_RECOVERY_PROFILES['perfect-parry'];
  if (snapshot?.lastOutcome === 'block' || payload.reactionVariant === 'block-hit') return GUARD_RECOVERY_PROFILES.block;
  if (snapshot?.lastOutcome === 'parry' || payload.reactionVariant === 'parry') return GUARD_RECOVERY_PROFILES.parry;
  return GUARD_RECOVERY_PROFILES.default;
}

export function samplePoseMatchedRecovery(snapshot, sourceSample, previousSample, targetPose, elapsedMs, options = {}) {
  const profile = options.profile || resolveGuardRecoveryProfile(snapshot);
  const durationMs = Math.max(1, finite(profile.durationMs, 220));
  const elapsed = Math.max(0, finite(elapsedMs));
  const continuityHoldMs = Math.min(Math.max(0, finite(profile.continuityHoldMs, 0)), Math.max(0, durationMs - 1));
  const activeDurationMs = Math.max(1, durationMs - continuityHoldMs);
  const activeElapsedMs = Math.max(0, elapsed - continuityHoldMs);
  const progress = elapsed >= durationMs ? 1 : clamp01(activeElapsedMs / activeDurationMs);
  const sampleDeltaMs = sourceSample && previousSample && sourceSample.sequence === previousSample.sequence
    ? Math.max(0, finite(sourceSample.elapsedMs) - finite(previousSample.elapsedMs))
    : 0;
  const pose = blendRecoveryPose(previousSample?.pose, sourceSample?.pose, targetPose, progress, {
    durationMs: activeDurationMs,
    sampleDeltaMs,
    momentumScale: profile.momentumScale,
    inertiaEnvelope: profile.inertiaEnvelope,
  });
  return Object.freeze({
    profile,
    durationMs,
    continuityHoldMs,
    continuityLatched: continuityHoldMs > 0 && elapsed <= continuityHoldMs + EPSILON,
    progress,
    eased: smoothstep(progress),
    complete: elapsed >= durationMs,
    sampleDeltaMs,
    momentumActive: progress > 0 && sampleDeltaMs > 0 && sampleDeltaMs <= 80,
    pose,
  });
}
