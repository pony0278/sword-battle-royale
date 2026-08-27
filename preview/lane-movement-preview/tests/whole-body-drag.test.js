import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePose } from '../src/animation/pose-utils.js';
import { solveWholeBodyDragPose } from '../src/animation/whole-body-drag-solver.js';

function syntheticHumanoid(poseInput) {
  const pose = normalizePose(poseInput);
  const bodyLift = (30 - pose.squat) * 0.01 + pose.root_py;
  const armReach = (-(pose.aR_sx + 90) / 180) * 0.5 + (pose.aR_stretch - 1) * 0.5;
  return {
    handL: { x: -0.4, y: 1.25 + bodyLift, z: pose.root_pz },
    handR: { x: 0.4, y: 1.25 + bodyLift + armReach, z: pose.root_pz },
    footL: {
      x: -0.18,
      y: (pose.lL_kx - pose.squat) * 0.01 + pose.root_py,
      z: pose.root_pz + pose.lL_hx * 0.004,
    },
    footR: {
      x: 0.18,
      y: (pose.lR_kx - pose.squat) * 0.01 + pose.root_py,
      z: pose.root_pz + pose.lR_hx * 0.004,
    },
    hips: { x: 0, y: 0.82 + bodyLift, z: pose.root_pz },
    chest: { x: 0, y: 1.18 + bodyLift, z: pose.root_pz },
  };
}

function readyPose() {
  return normalizePose({
    squat: 30,
    aR_sx: -90,
    aR_stretch: 1,
    lL_kx: 30,
    lR_kx: 30,
    lL_stretch: 1,
    lR_stretch: 1,
  });
}

test('high hand drag reaches with the arm first, then lifts the supported body', () => {
  const pose = readyPose();
  const initial = syntheticHumanoid(pose);
  const result = solveWholeBodyDragPose({
    pose,
    referencePose: pose,
    evaluatePose: syntheticHumanoid,
    effector: 'handR',
    target: { x: 0.4, y: 1.62, z: 0 },
    pinnedFeet: { footL: initial.footL, footR: initial.footR },
    coupling: 1,
    maxStretch: 1.05,
    passes: 8,
  });

  assert.equal(result.activatedWholeBody, true);
  assert.ok(result.pose.aR_sx < pose.aR_sx, 'the sword arm should reach upward first');
  assert.ok(result.pose.squat < pose.squat, 'the support legs should extend to lift the body');
  assert.ok(result.bodyLift > 0.04, 'the hips should rise after the arm nears its reach limit');
  assert.ok(result.pose.aR_stretch <= 1.05, 'the arm must respect the natural stretch cap');
  assert.ok(Math.max(...Object.values(result.pinErrors)) < 0.1, 'pinned feet should remain close to their anchors');
});

test('zero whole-body coupling keeps the torso and support pose unchanged', () => {
  const pose = readyPose();
  const initial = syntheticHumanoid(pose);
  const result = solveWholeBodyDragPose({
    pose,
    evaluatePose: syntheticHumanoid,
    effector: 'handR',
    target: { x: 0.4, y: 1.8, z: 0 },
    pinnedFeet: { footL: initial.footL, footR: initial.footR },
    coupling: 0,
    passes: 8,
  });

  assert.equal(result.activatedWholeBody, false);
  assert.equal(result.pose.squat, pose.squat);
  assert.equal(result.pose.root_py, pose.root_py);
  assert.equal(result.bodyLift, 0);
  assert.ok(result.targetError > 0.15, 'the unreachable target should remain visibly constrained');
});

test('dragging a foot can recruit the root while the opposite foot remains pinned', () => {
  const pose = readyPose();
  const initial = syntheticHumanoid(pose);
  const result = solveWholeBodyDragPose({
    pose,
    evaluatePose: syntheticHumanoid,
    effector: 'footL',
    target: { ...initial.footL, z: 0.34 },
    pinnedFeet: { footR: initial.footR },
    coupling: 1,
    passes: 8,
  });

  assert.equal(result.activatedWholeBody, true);
  assert.ok(result.pose.lL_hx > pose.lL_hx, 'the dragged leg should advance');
  assert.ok(result.pose.root_pz > pose.root_pz, 'the pelvis should follow a distant foot target');
  assert.ok(result.pinErrors.footR < 0.1, 'the opposite support foot should stay near its pin');
});

function syntheticElbowPole(poseInput) {
  const pose = normalizePose(poseInput);
  const elbowX = pose.aR_sy * 0.005;
  return {
    elbowR: { x: elbowX, y: 1.1, z: 0 },
    handR: { x: elbowX + pose.aR_wy * 0.005, y: 1.35, z: 0 },
    hips: { x: 0, y: 0.82, z: 0 },
  };
}

test('elbow bend handle preserves the hand endpoint while moving the joint', () => {
  const pose = normalizePose({ aR_stretch: 1 });
  const initial = syntheticElbowPole(pose);
  const result = solveWholeBodyDragPose({
    pose,
    evaluatePose: syntheticElbowPole,
    effector: 'elbowR',
    target: { x: 0.24, y: 1.1, z: 0 },
    secondaryTargets: {
      handR: { target: initial.handR, weight: 2 },
    },
    allowWholeBody: false,
    passes: 8,
  });

  assert.equal(result.activatedWholeBody, false);
  assert.ok(result.pose.aR_sy > 20, 'the shoulder should steer the elbow toward the pole target');
  assert.ok(result.pose.aR_wy < -10, 'the wrist chain should compensate to preserve the hand');
  assert.ok(result.targetError < 0.13, 'the elbow should approach the bend handle');
  assert.ok(result.secondaryErrors.handR < 0.1, 'the hand endpoint should remain near its anchor');
});
