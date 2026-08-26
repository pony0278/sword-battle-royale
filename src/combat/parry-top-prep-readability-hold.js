export const R18N_TOP_PREP_READABILITY_HOLD_STAGE = 'R18N.4.3-B.1.3';

export const R18N_TOP_PREP_READABILITY_HOLD_POLICY = Object.freeze({
  stage: R18N_TOP_PREP_READABILITY_HOLD_STAGE,
  direction: 'top',
  holdMs: 42,
  releaseMs: 38,
  criticalReleaseTtcSeconds: 0.075,
  bones: Object.freeze({
    'upperarm.l': Object.freeze({ weight: 0.65, maxAngleDegrees: 6, enabled: true }),
    'lowerarm.l': Object.freeze({ weight: 0.65, maxAngleDegrees: 8, enabled: true }),
    'wrist.l': Object.freeze({ weight: 0, maxAngleDegrees: 0, enabled: false, solverOnly: true }),
  }),
  writer: 'top-prep-readability-hold',
  finalPoseOwner: 'active-intercept-final-arm-closure',
  authority: 'presentation-readability-local-pose-before-final-closure-no-contact-authority',
});

const IDENTITY_QUATERNION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const RADIANS_TO_DEGREES = 180 / Math.PI;
const DEGREES_TO_RADIANS = Math.PI / 180;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function normalizeQuaternion(value = IDENTITY_QUATERNION) {
  let x = finite(value.x);
  let y = finite(value.y);
  let z = finite(value.z);
  let w = finite(value.w, 1);
  const length = Math.hypot(x, y, z, w) || 1;
  x /= length; y /= length; z /= length; w /= length;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  return { x, y, z, w };
}

function conjugateQuaternion(value) {
  const q = normalizeQuaternion(value);
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function multiplyQuaternion(aValue, bValue) {
  const a = normalizeQuaternion(aValue);
  const b = normalizeQuaternion(bValue);
  return normalizeQuaternion({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}

function quaternionAngleDegrees(value) {
  const q = normalizeQuaternion(value);
  return 2 * Math.acos(clamp(q.w, -1, 1)) * RADIANS_TO_DEGREES;
}

function scaleQuaternionAngle(value, targetAngleDegrees) {
  const q = normalizeQuaternion(value);
  const rawAngleDegrees = quaternionAngleDegrees(q);
  const targetDegrees = clamp(targetAngleDegrees, 0, rawAngleDegrees);
  if (rawAngleDegrees <= 1e-9 || targetDegrees <= 1e-9) return { ...IDENTITY_QUATERNION };
  const sinHalf = Math.hypot(q.x, q.y, q.z);
  if (sinHalf <= 1e-9) return { ...IDENTITY_QUATERNION };
  const targetHalfRadians = targetDegrees * DEGREES_TO_RADIANS / 2;
  const scale = Math.sin(targetHalfRadians) / sinHalf;
  return normalizeQuaternion({
    x: q.x * scale,
    y: q.y * scale,
    z: q.z * scale,
    w: Math.cos(targetHalfRadians),
  });
}

function freezeQuaternion(value) {
  const q = normalizeQuaternion(value);
  return Object.freeze({ x: q.x, y: q.y, z: q.z, w: q.w });
}

function captureAnchorPose(rig, policy) {
  const bones = rig?.bones || {};
  const entries = [];
  for (const [boneId, bonePolicy] of Object.entries(policy.bones || {})) {
    if (bonePolicy?.enabled !== true) continue;
    const quaternion = bones[boneId]?.quaternion;
    if (!quaternion) continue;
    entries.push([boneId, freezeQuaternion(quaternion)]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

function writeQuaternion(target, value) {
  const q = normalizeQuaternion(value);
  if (typeof target?.set === 'function') target.set(q.x, q.y, q.z, q.w);
  else if (target) { target.x = q.x; target.y = q.y; target.z = q.z; target.w = q.w; }
  target?.normalize?.();
}

export function planTopPrepReadabilityHold(input = {}, policy = R18N_TOP_PREP_READABILITY_HOLD_POLICY) {
  const direction = String(input.direction || '').toLowerCase();
  const enabled = input.enabled === true && direction === policy.direction;
  const presentationElapsedMs = Math.max(0, finite(input.presentationElapsedMs));
  const holdMs = Math.max(0, finite(policy.holdMs));
  const releaseMs = Math.max(0, finite(policy.releaseMs));
  const releaseEndMs = holdMs + releaseMs;
  const temporalWeight = !enabled
    ? 0
    : presentationElapsedMs <= holdMs
      ? 1
      : releaseMs <= 1e-9 || presentationElapsedMs >= releaseEndMs
        ? 0
        : 1 - (presentationElapsedMs - holdMs) / releaseMs;

  const rawTtc = Number(input.timeToContactSeconds);
  const timeToContactSeconds = Number.isFinite(rawTtc) ? Math.max(0, rawTtc) : null;
  const criticalReleaseTtcSeconds = Math.max(0.001, finite(policy.criticalReleaseTtcSeconds, 0.075));
  const contactSafetyWeight = !enabled
    ? 0
    : timeToContactSeconds == null || timeToContactSeconds >= criticalReleaseTtcSeconds
      ? 1
      : clamp(timeToContactSeconds / criticalReleaseTtcSeconds, 0, 1);
  const envelopeWeight = clamp(Math.min(temporalWeight, contactSafetyWeight), 0, 1);

  return Object.freeze({
    stage: R18N_TOP_PREP_READABILITY_HOLD_STAGE,
    direction,
    enabled,
    active: enabled && envelopeWeight > 1e-6,
    presentationElapsedMs,
    timeToContactSeconds,
    holdMs,
    releaseMs,
    releaseEndMs,
    criticalReleaseTtcSeconds,
    temporalWeight,
    contactSafetyWeight,
    envelopeWeight,
    reason: !enabled
      ? 'top-prep-readability-disabled-or-non-top'
      : envelopeWeight <= 1e-6
        ? 'top-prep-readability-released-to-active-intercept'
        : presentationElapsedMs <= holdMs
          ? 'top-prep-readability-hold'
          : 'top-prep-readability-release',
    finalPoseOwner: policy.finalPoseOwner,
    authority: 'top-prep-readability-envelope-no-rig-write-no-contact-authority',
  });
}

export function createTopPrepReadabilityHoldRuntime(options = {}) {
  const policy = options.policy || R18N_TOP_PREP_READABILITY_HOLD_POLICY;
  let armedSequence = null;
  let armedDirection = null;
  let anchorPose = null;
  let lastReport = null;

  function reset() {
    armedSequence = null;
    armedDirection = null;
    anchorPose = null;
    lastReport = null;
    return null;
  }

  function arm(input = {}) {
    const direction = String(input.direction || '').toLowerCase();
    const sequence = input.sequence ?? null;
    if (direction !== policy.direction || !input.rig?.bones) {
      reset();
      return Object.freeze({
        stage: R18N_TOP_PREP_READABILITY_HOLD_STAGE,
        accepted: false,
        sequence,
        direction,
        reason: 'top-prep-readability-arm-not-top-or-missing-rig',
        authority: policy.authority,
      });
    }
    armedSequence = sequence;
    armedDirection = direction;
    anchorPose = captureAnchorPose(input.rig, policy);
    return Object.freeze({
      stage: R18N_TOP_PREP_READABILITY_HOLD_STAGE,
      accepted: Object.keys(anchorPose).length > 0,
      sequence: armedSequence,
      direction: armedDirection,
      anchorBones: Object.freeze(Object.keys(anchorPose)),
      reason: 'top-prep-readability-entry-pose-captured',
      authority: policy.authority,
    });
  }

  function update(input = {}) {
    const sequence = input.sequence ?? null;
    const direction = String(input.direction || '').toLowerCase();
    const sequenceMatches = armedSequence != null && sequence === armedSequence;
    const plan = planTopPrepReadabilityHold({
      enabled: input.enabled === true && sequenceMatches && direction === armedDirection && Boolean(anchorPose),
      direction,
      presentationElapsedMs: input.presentationElapsedMs,
      timeToContactSeconds: input.timeToContactSeconds,
    }, policy);

    if (!plan.active || !input.rig?.bones || !anchorPose) {
      lastReport = Object.freeze({
        ...plan,
        sequence,
        armedSequence,
        applied: false,
        appliedBones: Object.freeze([]),
        bones: Object.freeze({}),
        anchorCaptured: Boolean(anchorPose),
        finalPoseOwner: policy.finalPoseOwner,
        authority: policy.authority,
      });
      return lastReport;
    }

    const appliedBones = [];
    const boneReports = {};
    for (const [boneId, bonePolicy] of Object.entries(policy.bones || {})) {
      const currentQuaternion = input.rig?.bones?.[boneId]?.quaternion;
      const anchorQuaternion = anchorPose?.[boneId] || null;
      const canTarget = bonePolicy?.enabled === true && Boolean(currentQuaternion) && Boolean(anchorQuaternion);
      const current = canTarget ? normalizeQuaternion(currentQuaternion) : IDENTITY_QUATERNION;
      const deltaToAnchor = canTarget
        ? multiplyQuaternion(conjugateQuaternion(current), anchorQuaternion)
        : IDENTITY_QUATERNION;
      const rawAngleDegrees = canTarget ? quaternionAngleDegrees(deltaToAnchor) : 0;
      const weight = canTarget ? clamp(bonePolicy.weight, 0, 1) : 0;
      const maxAngleDegrees = canTarget ? Math.max(0, finite(bonePolicy.maxAngleDegrees)) : 0;
      const weightedAngleDegrees = rawAngleDegrees * weight * plan.envelopeWeight;
      const envelopeCapDegrees = maxAngleDegrees * plan.envelopeWeight;
      const targetAngleDegrees = Math.min(weightedAngleDegrees, envelopeCapDegrees);
      const correction = canTarget
        ? scaleQuaternionAngle(deltaToAnchor, targetAngleDegrees)
        : IDENTITY_QUATERNION;
      const applied = canTarget && targetAngleDegrees > 1e-7;
      if (applied) {
        writeQuaternion(currentQuaternion, multiplyQuaternion(current, correction));
        appliedBones.push(boneId);
      }
      boneReports[boneId] = Object.freeze({
        enabled: bonePolicy?.enabled === true,
        solverOnly: bonePolicy?.solverOnly === true,
        rawAngleDegrees,
        weight,
        maxAngleDegrees,
        envelopeWeight: plan.envelopeWeight,
        weightedAngleDegrees,
        envelopeCapDegrees,
        targetAngleDegrees,
        applied,
      });
    }

    lastReport = Object.freeze({
      ...plan,
      sequence,
      armedSequence,
      applied: appliedBones.length > 0,
      appliedBones: Object.freeze(appliedBones),
      bones: Object.freeze(boneReports),
      anchorCaptured: true,
      finalPoseOwner: policy.finalPoseOwner,
      authority: policy.authority,
    });
    return lastReport;
  }

  return Object.freeze({
    arm,
    update,
    reset,
    get report() { return lastReport; },
    get armed() { return Boolean(anchorPose); },
    policy,
  });
}
