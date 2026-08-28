// Humanoid pose schema. This array is the runtime's single source of truth;
// consumers must iterate it instead of relying on a numeric axis count.

export const ROOT_POSE_KEYS = Object.freeze([
  'root_y', 'root_x', 'root_py', 'root_pz', 'sq', 'body_scale', 'squat',
]);

export const TORSO_POSE_KEYS = Object.freeze([
  'spine_x', 'spine_y', 'pelvis_y',
  'head_y', 'head_x', 'head_pz',
]);

export const ARM_POSE_KEYS = Object.freeze([
  'aL_sx', 'aL_sy', 'aL_sz', 'aL_ex', 'aL_idle', 'aL_scale',
  'aR_sx', 'aR_sy', 'aR_sz', 'aR_ex', 'aR_idle', 'aR_scale',
  'aL_wx', 'aL_wy', 'aL_wz',
  'aR_wx', 'aR_wy', 'aR_wz',
  'aL_stretch', 'aR_stretch',
]);

export const LEG_POSE_KEYS = Object.freeze([
  'lL_hx', 'lL_hy', 'lL_hz', 'lL_kx', 'lL_ax', 'lL_idle', 'lL_scale',
  'lR_hx', 'lR_hy', 'lR_hz', 'lR_kx', 'lR_ax', 'lR_idle', 'lR_scale',
  'lL_contact', 'lR_contact',
  'lL_ty', 'lR_ty',
  'lL_stretch', 'lR_stretch',
]);

// Finger axes remain serializable and interpolated, but the MVP block mesh does
// not require a finger rig. They are deliberately optional presentation data.
export const OPTIONAL_FINGER_POSE_KEYS = Object.freeze([
  'aL_fbase', 'aL_fmid', 'aL_ftip', 'aL_fthumb',
  'aR_fbase', 'aR_fmid', 'aR_ftip', 'aR_fthumb',
]);

export const HUMANOID_POSE_KEYS = Object.freeze([
  ...ROOT_POSE_KEYS,
  ...TORSO_POSE_KEYS,
  ...ARM_POSE_KEYS,
  ...LEG_POSE_KEYS,
]);

export const POSE_KEYS = Object.freeze([
  ...HUMANOID_POSE_KEYS,
  ...OPTIONAL_FINGER_POSE_KEYS,
]);

export const LEGACY_NON_HUMANOID_POSE_KEYS = Object.freeze([
  'carry_tilt', 'carry_yaw', 'carry_ox', 'carry_oy', 'carry_oz',
]);

export function defaultPoseValue(key) {
  return key === 'body_scale' || key.endsWith('_scale') || key.endsWith('_stretch') ? 1 : 0;
}

export const ZERO_POSE = Object.freeze(Object.fromEntries(
  POSE_KEYS.map((key) => [key, defaultPoseValue(key)]),
));

