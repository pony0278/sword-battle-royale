import { normalizePose } from './pose-utils.js';
import { restoreProceduralKayKitRestPose } from '../character/procedural-kaykit-rig.js';

const DEG_TO_RAD = Math.PI / 180;

function rotateDegrees(bone, x = 0, y = 0, z = 0) {
  bone.rotateX(x * DEG_TO_RAD);
  bone.rotateY(y * DEG_TO_RAD);
  bone.rotateZ(z * DEG_TO_RAD);
}

function stretchBone(bone, amount) {
  const value = Math.max(0.2, Number(amount) || 1);
  bone.scale.y *= value;
}

export function applyPoseToProceduralKayKitRig(rig, inputPose = {}) {
  const pose = normalizePose(inputPose);
  const { bones, motionRoot } = restoreProceduralKayKitRestPose(rig);
  motionRoot.position.set(0, 0, pose.root_pz);
  motionRoot.rotation.set(0, 0, 0);
  motionRoot.scale.set(1, 1, 1);

  rotateDegrees(bones.root, pose.root_x, pose.root_y, 0);
  rotateDegrees(bones.hips, 0, pose.pelvis_y, 0);
  rotateDegrees(bones.spine, pose.spine_x, pose.spine_y, 0);
  rotateDegrees(bones.head, pose.head_x, pose.head_y, 0);
  bones.head.position.z += pose.head_pz;

  if (pose.sq >= 0) {
    const sy = Math.max(0.1, 1 - pose.sq);
    const sxz = 1 / Math.sqrt(sy);
    motionRoot.scale.set(sxz, sy, sxz);
  } else {
    const sz = Math.max(0.1, 1 - pose.sq);
    const sxy = 1 / Math.sqrt(sz);
    motionRoot.scale.set(sxy, sxy, sz);
  }

  for (const [side, prefix, sideSign] of [['l', 'aL', -1], ['r', 'aR', 1]]) {
    const weight = 1 - pose[`${prefix}_idle`];
    rotateDegrees(
      bones[`upperarm.${side}`],
      pose[`${prefix}_sx`] * weight,
      pose[`${prefix}_sy`] * weight,
      pose[`${prefix}_sz`] * weight * sideSign,
    );
    rotateDegrees(bones[`lowerarm.${side}`], -pose[`${prefix}_ex`] * weight, 0, 0);
    rotateDegrees(
      bones[`wrist.${side}`],
      pose[`${prefix}_wx`] * weight,
      pose[`${prefix}_wy`] * weight,
      pose[`${prefix}_wz`] * weight * sideSign,
    );
    stretchBone(bones[`upperarm.${side}`], pose[`${prefix}_stretch`]);
  }

  for (const [side, prefix, sideSign] of [['l', 'lL', -1], ['r', 'lR', 1]]) {
    const weight = 1 - pose[`${prefix}_idle`];
    const hipX = pose[`${prefix}_hx`] - pose.squat * 0.7;
    const kneeX = pose[`${prefix}_kx`] + pose.squat;
    rotateDegrees(
      bones[`upperleg.${side}`],
      hipX * weight,
      pose[`${prefix}_hy`] * weight * sideSign,
      pose[`${prefix}_hz`] * weight * sideSign,
    );
    rotateDegrees(bones[`lowerleg.${side}`], kneeX * weight, 0, 0);
    rotateDegrees(
      bones[`foot.${side}`],
      (-(hipX + kneeX) + pose[`${prefix}_ax`]) * weight,
      pose[`${prefix}_ty`] * weight * sideSign,
      0,
    );
    stretchBone(bones[`upperleg.${side}`], pose[`${prefix}_stretch`]);
  }

  rig.root.updateMatrixWorld(true);
  let minGroundY = Infinity;
  rig.groundBoneIds.forEach((boneId, index) => {
    const point = rig.groundPointScratch[index];
    bones[boneId].getWorldPosition(point);
    minGroundY = Math.min(minGroundY, point.y);
  });
  rig.root.getWorldPosition(rig.rootPositionScratch);
  const rootScaleY = Math.max(0.001, Math.abs(rig.root.scale.y));
  const nodeRadius = rig.lineAppearance?.style.jointRadius ?? 0;
  motionRoot.position.y = Number.isFinite(minGroundY)
    ? pose.root_py + (rig.rootPositionScratch.y - minGroundY + nodeRadius * rootScaleY) / rootScaleY
    : pose.root_py;
  rig.root.updateMatrixWorld(true);
  return pose;
}
