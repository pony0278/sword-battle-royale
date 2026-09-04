import { createAnimationClip } from '../../src/animation/animation-clip.js';
import { normalizeMotionGuide } from '../../src/animation/motion-guide-schema.js';
import { normalizePose } from '../../src/animation/pose-utils.js';

export const WINDUP_HAND_POSE_KEYS = Object.freeze([
  ['root_pz', -0.32, 0.08, 0.07],
  ['root_x', -25, 12, 5],
  ['spine_x', -30, 18, 5],
  ['squat', 8, 60, 5],
  ['aR_sx', -180, 80, 24],
  ['aR_sy', -140, 140, 24],
  ['aR_sz', -110, 110, 20],
  ['aR_ex', -15, 165, 22],
  ['aR_wx', -120, 120, 18],
  ['aR_wy', -120, 120, 18],
  ['aR_wz', -120, 120, 18],
  ['aR_stretch', 0.72, 1.55, 0.12],
]);

const WINDUP_BODY_POSE_KEYS = new Set(['root_pz', 'root_x', 'spine_x', 'squat']);

export const SECONDARY_GRIP_POSE_KEYS = Object.freeze([
  ['aL_sx', -180, 80, 24],
  ['aL_sy', -140, 140, 24],
  ['aL_sz', -110, 110, 20],
  ['aL_ex', -15, 165, 22],
  ['aL_wx', -120, 120, 18],
  ['aL_wy', -120, 120, 18],
  ['aL_wz', -120, 120, 18],
  ['aL_stretch', 0.72, 1.55, 0.12],
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function refinePose(seedPose, poseKeys, evaluate) {
  const candidate = { ...seedPose };
  poseKeys.forEach(([key, min, max]) => {
    candidate[key] = clamp(candidate[key], min, max);
  });
  let bestError = evaluate(candidate);
  let stepScale = 1;

  for (let pass = 0; pass < 8; pass += 1) {
    for (const [key, min, max, baseStep] of poseKeys) {
      const startValue = candidate[key];
      let axisValue = startValue;
      let axisError = bestError;
      for (const direction of [-1, 1]) {
        candidate[key] = clamp(startValue + direction * baseStep * stepScale, min, max);
        const error = evaluate(candidate);
        if (error < axisError) {
          axisError = error;
          axisValue = candidate[key];
        }
      }
      candidate[key] = axisValue;
      bestError = axisError;
    }
    stepScale *= 0.56;
  }
  return { pose: candidate, error: bestError };
}

function optimizePose(sourcePose, weight, poseKeys, seeds, evaluate, keyWeight = null) {
  const original = normalizePose(sourcePose);
  const beforeError = evaluate(original);
  const fitted = seeds(original)
    .map((seed) => refinePose(seed, poseKeys, evaluate))
    .reduce((best, result) => (result.error < best.error ? result : best));
  const constrained = { ...original };
  poseKeys.forEach(([key]) => {
    const axisWeight = weight * (keyWeight ? keyWeight(key) : 1);
    constrained[key] = original[key] + (fitted.pose[key] - original[key]) * axisWeight;
  });
  const afterError = evaluate(constrained);
  return { pose: normalizePose(constrained), beforeError, afterError };
}

function evaluateGripDistance(character, sword, pose, leftPoint, gripPoint) {
  character.applyPose(pose);
  character.object3d.updateMatrixWorld(true);
  sword.object3d.updateMatrixWorld(true);
  character.rig.bones['handslot.l'].getWorldPosition(leftPoint);
  sword.secondaryGrip.getWorldPosition(gripPoint);
  return leftPoint.distanceTo(gripPoint);
}

function evaluateWindupDistance(character, pose, targetPoint, handPoint) {
  character.applyPose(pose);
  character.object3d.updateMatrixWorld(true);
  character.rig.bones['handslot.r'].getWorldPosition(handPoint);
  return handPoint.distanceTo(targetPoint);
}

function gripSeeds(original) {
  const mirrored = {
    ...original,
    aL_sx: original.aR_sx,
    aL_sy: original.aR_sy + 42,
    aL_sz: -original.aR_sz,
    aL_ex: original.aR_ex + 22,
    aL_wx: original.aR_wx,
    aL_wy: -original.aR_wy,
    aL_wz: -original.aR_wz,
    aL_stretch: 1.08,
  };
  return [
    original,
    mirrored,
    { ...mirrored, aL_sx: mirrored.aL_sx - 48, aL_sy: mirrored.aL_sy + 54, aL_ex: 92 },
  ];
}

function windupSeeds(original) {
  return [
    original,
    { ...original, aR_sx: -164, aR_sy: -12, aR_sz: 10, aR_ex: 62, aR_wx: -26, aR_stretch: 1.08 },
    { ...original, aR_sx: -142, aR_sy: -34, aR_sz: 22, aR_ex: 88, aR_wx: -38, aR_stretch: 1.12 },
  ];
}

function setWindupTarget(character, guide, targetPoint) {
  character.object3d.updateMatrixWorld(true);
  targetPoint.set(
    guide.cutPlaneOffset * 0.008,
    guide.windupHeight,
    -guide.windupPullback,
  );
  character.object3d.localToWorld(targetPoint);
}

export function bakeStudioMotionConstraints(projectInput, { character, sword, guide: guideInput } = {}) {
  const project = JSON.parse(JSON.stringify(projectInput));
  const guide = normalizeMotionGuide(guideInput || project.clip?.metadata?.motionGuide);
  const hasRig = Boolean(character?.rig && project.clip?.poses && project.clip?.timeline);
  const Vector3 = character?.object3d?.position?.constructor;
  const report = {
    windupTarget: false,
    windupOptimizedPoseCount: 0,
    windupBeforeError: 0,
    windupAfterError: 0,
    twoHandGrip: false,
    optimizedPoseCount: 0,
    beforeError: 0,
    afterError: 0,
    maxError: 0,
    poseErrors: [],
  };

  if (hasRig && Vector3 && guide.windupTarget && project.clip.poses.windup) {
    const target = new Vector3();
    const hand = new Vector3();
    setWindupTarget(character, guide, target);
    const evaluate = (pose) => evaluateWindupDistance(character, pose, target, hand);
    const result = optimizePose(
      project.clip.poses.windup,
      1,
      WINDUP_HAND_POSE_KEYS,
      windupSeeds,
      evaluate,
      (key) => (WINDUP_BODY_POSE_KEYS.has(key) ? guide.windupLoad * guide.coupling : 1),
    );
    project.clip.poses.windup = result.pose;
    report.windupTarget = true;
    report.windupOptimizedPoseCount = 1;
    report.windupBeforeError = result.beforeError;
    report.windupAfterError = result.afterError;
  }

  if (hasRig && Vector3 && guide.twoHandGrip && guide.secondaryGripWeight > 0 && sword?.secondaryGrip) {
    const points = { left: new Vector3(), grip: new Vector3() };
    const errors = [];
    for (const key of project.clip.timeline) {
      const evaluate = (pose) => evaluateGripDistance(character, sword, pose, points.left, points.grip);
      const result = optimizePose(
        project.clip.poses[key.name],
        guide.secondaryGripWeight,
        SECONDARY_GRIP_POSE_KEYS,
        gripSeeds,
        evaluate,
      );
      project.clip.poses[key.name] = result.pose;
      errors.push({ name: key.name, beforeError: result.beforeError, afterError: result.afterError });
    }
    const average = (key) => errors.reduce((total, entry) => total + entry[key], 0) / Math.max(1, errors.length);
    report.twoHandGrip = true;
    report.optimizedPoseCount = errors.length;
    report.beforeError = average('beforeError');
    report.afterError = average('afterError');
    report.maxError = Math.max(...errors.map((entry) => entry.afterError));
    report.poseErrors = errors;
  }

  project.clip.metadata = { ...project.clip.metadata, motionGuide: guide, motionGuideBake: report };
  project.clip = createAnimationClip(project.clip);
  return { project, report };
}
