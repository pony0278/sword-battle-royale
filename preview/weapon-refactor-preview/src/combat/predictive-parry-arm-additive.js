export const R18N_BOUNDED_SHIELD_ARM_ADDITIVE_STAGE = 'R18N.4.3-B.1';

export const R18N_BOUNDED_SHIELD_ARM_ADDITIVE_POLICY = Object.freeze({
  stage: R18N_BOUNDED_SHIELD_ARM_ADDITIVE_STAGE,
  bones: Object.freeze({
    'upperarm.l': Object.freeze({ weight: 0.72, maxAngleDegrees: 18, enabled: true }),
    'lowerarm.l': Object.freeze({ weight: 0.72, maxAngleDegrees: 22, enabled: true }),
    'wrist.l': Object.freeze({ weight: 0, maxAngleDegrees: 0, enabled: false, solverOnly: true }),
  }),
  // R24D.1: the bound above is an angle, not a speed - measured, the first frame of a parry wrote the
  // whole 18/22 degrees at once and the shield hand jumped 13-24cm (both fighters, the same code).
  // A caller that passes its clock gets the increment paced at this rate: 360 deg/s is 6 degrees a
  // frame at 60Hz, the cap in three to four frames, inside the seven a parry armed at 0.12s has.
  maxStepDegreesPerSecond: 360,
  writer: 'predictive-shield-arm-bounded-additive',
  finalPoseOwner: 'active-intercept-final-arm-closure',
  authority: 'bounded-authored-increment-before-active-intercept-final-solve-no-contact-authority',
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

export function planBoundedShieldArmAdditive(authoredDelta, policy = R18N_BOUNDED_SHIELD_ARM_ADDITIVE_POLICY) {
  const bones = {};
  for (const [boneId, bonePolicy] of Object.entries(policy.bones || {})) {
    const source = authoredDelta?.deltas?.[boneId] || null;
    const enabled = bonePolicy?.enabled === true && Boolean(source?.quaternion);
    const rawAngleDegrees = enabled ? quaternionAngleDegrees(source.quaternion) : 0;
    const weight = enabled ? clamp(bonePolicy.weight, 0, 1) : 0;
    const maxAngleDegrees = enabled ? Math.max(0, finite(bonePolicy.maxAngleDegrees)) : 0;
    const weightedAngleDegrees = rawAngleDegrees * weight;
    const targetAngleDegrees = Math.min(weightedAngleDegrees, maxAngleDegrees);
    bones[boneId] = Object.freeze({
      enabled,
      solverOnly: bonePolicy?.solverOnly === true,
      rawAngleDegrees,
      weight,
      weightedAngleDegrees,
      maxAngleDegrees,
      targetAngleDegrees,
      capped: enabled && weightedAngleDegrees > maxAngleDegrees + 1e-9,
      quaternion: freezeQuaternion(enabled
        ? scaleQuaternionAngle(source.quaternion, targetAngleDegrees)
        : IDENTITY_QUATERNION),
    });
  }
  return Object.freeze({
    stage: R18N_BOUNDED_SHIELD_ARM_ADDITIVE_STAGE,
    bones: Object.freeze(bones),
    authority: 'bounded-authored-target-planning-no-rig-write-no-contact-authority',
  });
}

function writeQuaternion(target, value) {
  const q = normalizeQuaternion(value);
  if (typeof target?.set === 'function') target.set(q.x, q.y, q.z, q.w);
  else if (target) { target.x = q.x; target.y = q.y; target.z = q.z; target.w = q.w; }
  target?.normalize?.();
}

export function createBoundedShieldArmAdditiveRuntime(options = {}) {
  const policy = options.policy || R18N_BOUNDED_SHIELD_ARM_ADDITIVE_POLICY;
  let sequence = null;
  let previousTargets = {};
  let lastReport = null;

  function reset() {
    sequence = null;
    previousTargets = {};
    lastReport = null;
    return null;
  }

  function update(input = {}) {
    const nextSequence = input.sequence ?? null;
    const enabled = input.enabled === true && Boolean(input.rig?.bones) && Boolean(input.authoredDelta?.deltas);
    if (sequence !== nextSequence) {
      sequence = nextSequence;
      previousTargets = {};
    }
    if (!enabled) {
      previousTargets = {};
      lastReport = Object.freeze({
        stage: R18N_BOUNDED_SHIELD_ARM_ADDITIVE_STAGE,
        sequence,
        active: false,
        applied: false,
        reason: 'bounded-additive-disabled-or-missing-authored-delta',
        appliedBones: Object.freeze([]),
        bones: Object.freeze({}),
        finalPoseOwner: policy.finalPoseOwner,
        authority: policy.authority,
      });
      return lastReport;
    }

    const plan = planBoundedShieldArmAdditive(input.authoredDelta, policy);
    // R24D.1: paced only when the caller says how long the frame was; without a clock the bound
    // alone applies, which is what every measurement before this stage was taken against.
    const deltaSeconds = Number(input.deltaSeconds);
    const stepCapDegrees = Number.isFinite(deltaSeconds) && deltaSeconds > 0
      ? Math.max(0, finite(policy.maxStepDegreesPerSecond)) * deltaSeconds
      : Infinity;
    const boneReports = {};
    const appliedBones = [];
    for (const [boneId, targetPlan] of Object.entries(plan.bones)) {
      const previousTarget = previousTargets[boneId] || IDENTITY_QUATERNION;
      const currentTarget = targetPlan.quaternion || IDENTITY_QUATERNION;
      const increment = multiplyQuaternion(conjugateQuaternion(previousTarget), currentTarget);
      const incrementalAngleDegrees = quaternionAngleDegrees(increment);
      const rateLimited = incrementalAngleDegrees > stepCapDegrees + 1e-9;
      const paced = rateLimited ? scaleQuaternionAngle(increment, stepCapDegrees) : increment;
      const appliedAngleDegrees = rateLimited ? stepCapDegrees : incrementalAngleDegrees;
      const boneQuaternion = input.rig?.bones?.[boneId]?.quaternion;
      const canApply = targetPlan.enabled && Boolean(boneQuaternion) && appliedAngleDegrees > 1e-7;
      if (canApply) {
        writeQuaternion(boneQuaternion, multiplyQuaternion(boneQuaternion, paced));
        appliedBones.push(boneId);
      }
      // The carry is where the bone actually got to, so a paced increment keeps closing next frame.
      previousTargets[boneId] = rateLimited ? multiplyQuaternion(previousTarget, paced) : currentTarget;
      boneReports[boneId] = Object.freeze({
        ...targetPlan,
        incrementalAngleDegrees,
        appliedAngleDegrees,
        rateLimited,
        applied: canApply,
      });
    }

    lastReport = Object.freeze({
      stage: R18N_BOUNDED_SHIELD_ARM_ADDITIVE_STAGE,
      sequence,
      active: true,
      applied: appliedBones.length > 0,
      appliedBones: Object.freeze(appliedBones),
      bones: Object.freeze(boneReports),
      finalPoseOwner: policy.finalPoseOwner,
      authority: policy.authority,
    });
    return lastReport;
  }

  return Object.freeze({
    update,
    reset,
    get report() { return lastReport; },
    get active() { return Boolean(lastReport?.active); },
    policy,
  });
}
