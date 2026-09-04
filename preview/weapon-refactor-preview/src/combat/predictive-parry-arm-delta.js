export const R18N_SHIELD_ARM_DELTA_EXTRACTION_STAGE = 'R18N.4.3-A';

export const R18N_SHIELD_ARM_DELTA_BONES = Object.freeze([
  'upperarm.l',
  'lowerarm.l',
  'wrist.l',
]);

const RADIANS_TO_DEGREES = 180 / Math.PI;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function normalizeQuaternion(value) {
  const x = finite(value?.x);
  const y = finite(value?.y);
  const z = finite(value?.z);
  const w = finite(value?.w, 1);
  const length = Math.hypot(x, y, z, w) || 1;
  return Object.freeze({
    x: x / length,
    y: y / length,
    z: z / length,
    w: w / length,
  });
}

function dotQuaternion(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

function conjugateQuaternion(value) {
  return {
    x: -value.x,
    y: -value.y,
    z: -value.z,
    w: value.w,
  };
}

function multiplyQuaternion(a, b) {
  return normalizeQuaternion({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}

function shortestEquivalent(reference, authored) {
  if (dotQuaternion(reference, authored) >= 0) return authored;
  return Object.freeze({
    x: -authored.x,
    y: -authored.y,
    z: -authored.z,
    w: -authored.w,
  });
}

function deltaAngleDegrees(delta) {
  return 2 * Math.acos(clamp(Math.abs(delta.w), -1, 1)) * RADIANS_TO_DEGREES;
}

export function extractShieldArmAuthoredDelta({
  referencePose,
  authoredPose,
  boneIds = R18N_SHIELD_ARM_DELTA_BONES,
} = {}) {
  const deltas = {};
  let maxAngleDegrees = 0;

  for (const boneId of boneIds) {
    const referenceValue = referencePose?.[boneId];
    const authoredValue = authoredPose?.[boneId];
    if (!referenceValue || !authoredValue) continue;

    const reference = normalizeQuaternion(referenceValue);
    const authored = shortestEquivalent(reference, normalizeQuaternion(authoredValue));
    const quaternion = multiplyQuaternion(conjugateQuaternion(reference), authored);
    const angleDegrees = deltaAngleDegrees(quaternion);
    maxAngleDegrees = Math.max(maxAngleDegrees, angleDegrees);
    deltas[boneId] = Object.freeze({ quaternion, angleDegrees });
  }

  return Object.freeze({
    stage: R18N_SHIELD_ARM_DELTA_EXTRACTION_STAGE,
    bones: Object.freeze([...boneIds]),
    deltas: Object.freeze(deltas),
    maxAngleDegrees,
    authority: 'observer-only-authored-arm-delta-no-rig-write-no-contact-authority',
  });
}
