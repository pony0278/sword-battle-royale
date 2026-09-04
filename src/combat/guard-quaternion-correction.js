// @ts-check
// Generic rig maths for a guard correction: normalise a quaternion, build one from Euler degrees,
// scale it toward identity by a weight, and write the result onto named bones.
//
// handoff/39 classified this whole module as category B, and the function signatures are the
// argument. Every one of them takes the offsets as a parameter. Nothing here reads a clip, a
// contact time, or a blade; nothing here can tell a longsword from a greatsword, because nothing
// here is ever told. It was called longsword-guard-correction.js only because the longsword was
// the first thing to need it.
import {
  GUARD_CORRECTION_SCOPE,
  getGuardCorrectionBones,
} from './guard-correction-scope.js';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EPSILON = 1e-12;
const CORRECTION_MATCH_EPSILON = 1e-10;
const CORRECTION_RUNTIME_STATE = new WeakMap();

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

/** @param {readonly number[]} input */
export function normalizeQuaternionArray(input = [0, 0, 0, 1]) {
  const values = Array.from(input || [0, 0, 0, 1], (value) => finite(value));
  while (values.length < 4) values.push(values.length === 3 ? 1 : 0);
  const length = Math.hypot(values[0], values[1], values[2], values[3]);
  if (length <= EPSILON) return Object.freeze([0, 0, 0, 1]);
  return Object.freeze(values.slice(0, 4).map((value) => value / length));
}

/** @param {readonly number[]} input */
export function quaternionAngleDegrees(input = [0, 0, 0, 1]) {
  const quaternion = normalizeQuaternionArray(input);
  const w = Math.min(1, Math.max(-1, Math.abs(quaternion[3])));
  return 2 * Math.acos(w) * RAD_TO_DEG;
}

export function quaternionFromEulerDegrees(input = {}) {
  const x = finite(input.x) * DEG_TO_RAD * 0.5;
  const y = finite(input.y) * DEG_TO_RAD * 0.5;
  const z = finite(input.z) * DEG_TO_RAD * 0.5;
  const c1 = Math.cos(x), c2 = Math.cos(y), c3 = Math.cos(z);
  const s1 = Math.sin(x), s2 = Math.sin(y), s3 = Math.sin(z);
  return normalizeQuaternionArray([
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]);
}

/**
 * @param {readonly number[]} input
 * @param {number} weight
 */
export function scaleQuaternionOffset(input = [0, 0, 0, 1], weight = 1) {
  const t = clamp01(weight);
  let [x, y, z, w] = normalizeQuaternionArray(input);
  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  if (t <= EPSILON) return Object.freeze([0, 0, 0, 1]);
  if (t >= 1 - EPSILON) return normalizeQuaternionArray([x, y, z, w]);

  const halfAngle = Math.acos(Math.max(-1, Math.min(1, w)));
  const sinHalfAngle = Math.sin(halfAngle);
  if (Math.abs(sinHalfAngle) <= EPSILON) return Object.freeze([0, 0, 0, 1]);
  const scaledHalfAngle = halfAngle * t;
  const axisScale = Math.sin(scaledHalfAngle) / sinHalfAngle;
  return normalizeQuaternionArray([
    x * axisScale,
    y * axisScale,
    z * axisScale,
    Math.cos(scaledHalfAngle),
  ]);
}

export function buildGuardQuaternionOffsets(eulerByBone = {}) {
  const allowed = new Set(getGuardCorrectionBones());
  return Object.freeze(Object.fromEntries(
    Object.entries(eulerByBone)
      .filter(([bone]) => allowed.has(bone))
      .map(([bone, euler]) => [bone, quaternionFromEulerDegrees(euler)]),
  ));
}

export function validateGuardQuaternionOffsets(offsets = {}) {
  const allowed = new Set(getGuardCorrectionBones());
  const limits = GUARD_CORRECTION_SCOPE.maxLocalCorrectionDegrees;
  const entries = [];
  const invalidBones = [];
  const overBudget = [];

  for (const [bone, rawQuaternion] of Object.entries(offsets || {})) {
    if (!allowed.has(bone)) {
      invalidBones.push(bone);
      continue;
    }
    const quaternion = normalizeQuaternionArray(rawQuaternion);
    const angleDegrees = quaternionAngleDegrees(quaternion);
    const budgetDegrees = finite(limits[bone], 0);
    const withinBudget = angleDegrees <= budgetDegrees + 1e-6;
    if (!withinBudget) overBudget.push(bone);
    entries.push(Object.freeze({ bone, quaternion, angleDegrees, budgetDegrees, withinBudget }));
  }

  return Object.freeze({
    valid: invalidBones.length === 0 && overBudget.length === 0,
    invalidBones: Object.freeze(invalidBones),
    overBudget: Object.freeze(overBudget),
    entries: Object.freeze(entries),
  });
}

function assertValidGuardOffsets(offsets) {
  const validation = validateGuardQuaternionOffsets(offsets);
  if (!validation.valid) {
    const details = [
      validation.invalidBones.length ? `invalid bones: ${validation.invalidBones.join(', ')}` : '',
      validation.overBudget.length ? `over budget: ${validation.overBudget.join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    throw new Error(`Invalid longsword Guard correction${details ? ` (${details})` : ''}`);
  }
  return validation;
}

function quaternionDot(a, b) {
  return finite(a?.x) * finite(b?.x)
    + finite(a?.y) * finite(b?.y)
    + finite(a?.z) * finite(b?.z)
    + finite(a?.w, 1) * finite(b?.w, 1);
}

function equivalentQuaternion(a, b) {
  if (!a || !b) return false;
  return 1 - Math.min(1, Math.abs(quaternionDot(a, b))) <= CORRECTION_MATCH_EPSILON;
}

function correctionBaseQuaternion(bone) {
  const current = bone.quaternion.clone().normalize();
  const previous = CORRECTION_RUNTIME_STATE.get(bone);
  if (previous?.corrected && previous?.base && equivalentQuaternion(current, previous.corrected)) {
    return previous.base.clone().normalize();
  }
  return current;
}

function rememberCorrectionState(bone, base, corrected) {
  CORRECTION_RUNTIME_STATE.set(bone, Object.freeze({
    base: base.clone().normalize(),
    corrected: corrected.clone().normalize(),
  }));
}

export function resetGuardQuaternionOffsetRuntime(rig, offsets = null) {
  if (!rig?.bones) return 0;
  const boneIds = offsets
    ? Object.keys(offsets)
    : getGuardCorrectionBones();
  let cleared = 0;
  for (const boneId of boneIds) {
    const bone = rig.bones[boneId];
    if (bone && CORRECTION_RUNTIME_STATE.delete(bone)) cleared += 1;
  }
  return cleared;
}

export function applyGuardQuaternionOffsetsWeighted(THREE, rig, offsets = {}, weight = 1) {
  if (!THREE?.Quaternion) throw new Error('Guard correction requires THREE.Quaternion');
  if (!rig?.bones) throw new Error('Guard correction requires a rig with bones');
  const validation = assertValidGuardOffsets(offsets);
  const blendWeight = clamp01(weight);

  for (const entry of validation.entries) {
    const bone = rig.bones[entry.bone];
    if (!bone) throw new Error(`Target rig is missing Guard correction bone: ${entry.bone}`);
    const weighted = scaleQuaternionOffset(entry.quaternion, blendWeight);
    const base = correctionBaseQuaternion(bone);
    const corrected = base.clone()
      .multiply(new THREE.Quaternion().fromArray(weighted))
      .normalize();
    bone.quaternion.copy(corrected);
    rememberCorrectionState(bone, base, corrected);
  }
  return Object.freeze({
    ...validation,
    weight: blendWeight,
    runtimePolicy: 'idempotent-raw-pose-relative',
  });
}

export function applyGuardQuaternionOffsets(THREE, rig, offsets = {}) {
  return applyGuardQuaternionOffsetsWeighted(THREE, rig, offsets, 1);
}

export function createGuardAuthoringExport(eulerByBone = {}, diagnostics = {}) {
  const offsets = buildGuardQuaternionOffsets(eulerByBone);
  const validation = validateGuardQuaternionOffsets(offsets);
  return Object.freeze({
    authored: validation.valid,
    baseSample: 0.5,
    offsets,
    eulerDegrees: Object.freeze(Object.fromEntries(
      Object.entries(eulerByBone).map(([bone, value]) => [bone, Object.freeze({
        x: finite(value?.x), y: finite(value?.y), z: finite(value?.z),
      })]),
    )),
    validation,
    diagnostics: Object.freeze({ ...diagnostics }),
  });
}
