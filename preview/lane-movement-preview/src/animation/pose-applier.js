import { normalizePose } from './pose-utils.js';

const DEG_TO_RAD = Math.PI / 180;

function scalar(object3d, value) {
  object3d.scale.set(value, value, value);
}

export function applyPoseToBlockRig(rig, inputPose = {}) {
  const pose = normalizePose(inputPose);
  const { root, pelvis, spine, headPivot, arms, legs, meshes, measurements } = rig;
  const baseY = measurements.baseY;

  root.rotation.set(pose.root_x * DEG_TO_RAD, pose.root_y * DEG_TO_RAD, 0);
  root.position.set(0, baseY, pose.root_pz);
  if (pose.sq >= 0) {
    const sy = 1 - pose.sq;
    const sxz = 1 / Math.sqrt(Math.max(sy, 0.1));
    root.scale.set(sxz, sy, sxz);
  } else {
    const sz = 1 - pose.sq;
    const sxy = 1 / Math.sqrt(Math.max(sz, 0.1));
    root.scale.set(sxy, sxy, sz);
  }
  scalar(meshes.body, pose.body_scale);
  spine.rotation.set(pose.spine_x * DEG_TO_RAD, pose.spine_y * DEG_TO_RAD, 0);
  pelvis.rotation.set(0, pose.pelvis_y * DEG_TO_RAD, 0);
  headPivot.rotation.set(pose.head_x * DEG_TO_RAD, pose.head_y * DEG_TO_RAD, 0);
  headPivot.position.set(0, rig.spec.bodyH, pose.head_pz);

  for (const [sideKey, prefix] of [['L', 'aL'], ['R', 'aR']]) {
    const arm = arms[sideKey];
    const weight = 1 - pose[`${prefix}_idle`];
    arm.shoulder.rotation.set(
      pose[`${prefix}_sx`] * weight * DEG_TO_RAD,
      pose[`${prefix}_sy`] * weight * DEG_TO_RAD,
      pose[`${prefix}_sz`] * weight * arm.side * DEG_TO_RAD,
    );
    arm.elbow.rotation.set(-pose[`${prefix}_ex`] * weight * DEG_TO_RAD, 0, 0);
    arm.wrist.rotation.set(
      pose[`${prefix}_wx`] * weight * DEG_TO_RAD,
      pose[`${prefix}_wy`] * weight * DEG_TO_RAD,
      pose[`${prefix}_wz`] * weight * arm.side * DEG_TO_RAD,
    );
    scalar(arm.shoulder, pose[`${prefix}_stretch`]);
    scalar(arm.forearm, pose[`${prefix}_scale`]);
    scalar(arm.hand, pose[`${prefix}_scale`]);
  }

  const squat = pose.squat;
  for (const [sideKey, prefix] of [['L', 'lL'], ['R', 'lR']]) {
    const leg = legs[sideKey];
    const weight = 1 - pose[`${prefix}_idle`];
    const hipX = pose[`${prefix}_hx`] - squat * 0.7;
    const kneeX = pose[`${prefix}_kx`] + squat;
    leg.hip.rotation.set(
      hipX * weight * DEG_TO_RAD,
      pose[`${prefix}_hy`] * weight * leg.side * DEG_TO_RAD,
      pose[`${prefix}_hz`] * weight * leg.side * DEG_TO_RAD,
    );
    leg.knee.rotation.set(kneeX * weight * DEG_TO_RAD, 0, 0);
    leg.ankle.rotation.set(
      (-(hipX + kneeX) + pose[`${prefix}_ax`]) * weight * DEG_TO_RAD,
      pose[`${prefix}_ty`] * weight * leg.side * DEG_TO_RAD,
      0,
    );
    if (Math.round(pose[`${prefix}_contact`]) === 1) leg.ankle.rotation.x += 55 * weight * DEG_TO_RAD;
    scalar(leg.hip, pose[`${prefix}_stretch`]);
    scalar(leg.shin, pose[`${prefix}_scale`]);
    scalar(leg.foot, pose[`${prefix}_scale`]);
  }

  // Grounding intentionally mirrors the executable Punch Studio behavior:
  // feet marked contact=2 do not anchor the body; if both are airborne, both
  // are used as a stable preview fallback.
  root.updateMatrixWorld(true);
  rig.groundBox.makeEmpty();
  const leftContact = Math.round(pose.lL_contact);
  const rightContact = Math.round(pose.lR_contact);
  let grounded = false;
  if (leftContact !== 2) {
    rig.groundBox.expandByObject(legs.L.foot);
    grounded = true;
  }
  if (rightContact !== 2) {
    rig.groundBox.expandByObject(legs.R.foot);
    grounded = true;
  }
  if (!grounded) {
    rig.groundBox.expandByObject(legs.L.foot);
    rig.groundBox.expandByObject(legs.R.foot);
  }
  root.position.y = Number.isFinite(rig.groundBox.min.y)
    ? baseY - rig.groundBox.min.y + pose.root_py
    : baseY + pose.root_py;
  root.updateMatrixWorld(true);
  return pose;
}

