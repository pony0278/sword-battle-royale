import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { solveTwoBoneIk } from '../src/animation/two-bone-ik.js';

// The solver on its own, against a chain whose right answers can be worked out by hand.
//
// Tested apart from the rig on purpose: an IK that "looks better" on a character is not evidence of
// anything, and the failure this guards against is a solver that moves the hand a long way toward
// the target and reports success. So the assertions are on the residual, on what it refuses, and on
// what it leaves alone.

// Shoulder at the origin, elbow 1 along +X, hand 1 further along +X: a straight arm of span 2.
function makeArm(bend = 0) {
  const root = new THREE.Object3D();
  const upper = new THREE.Object3D();
  const lower = new THREE.Object3D();
  const hand = new THREE.Object3D();
  root.add(upper);
  upper.add(lower);
  lower.add(hand);
  lower.position.set(1, 0, 0);
  hand.position.set(1, 0, 0);
  // A starting bend so the arm has a plane to keep; a perfectly straight arm is the degenerate case
  // and gets its own test.
  lower.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), bend);
  root.updateMatrixWorld(true);
  return { root, upper, lower, hand };
}

const solve = (arm, target, options = {}) => solveTwoBoneIk(THREE, {
  root: arm.upper, mid: arm.lower, effector: arm.hand, target, updateRoot: arm.root, ...options,
});

test('the hand lands on a reachable target, to within a rounding error', () => {
  const arm = makeArm(0.4);
  const target = new THREE.Vector3(0.9, 1.1, 0.3);
  const result = solve(arm, target);
  assert.equal(result.applied, true, result.reason || '');
  assert.ok(result.gapAfter < 1e-6, `residual ${result.gapAfter}`);
  // And it really moved: the arm was not already there.
  assert.ok(result.gapBefore > 1, `it started ${result.gapBefore} away, which is too easy a test`);
});

test('the segment lengths are unchanged, because only rotations were written', () => {
  const arm = makeArm(0.4);
  solve(arm, new THREE.Vector3(0.4, 1.3, -0.6));
  arm.root.updateMatrixWorld(true);
  const at = (o) => o.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(at(arm.upper).distanceTo(at(arm.lower)) - 1) < 1e-9);
  assert.ok(Math.abs(at(arm.lower).distanceTo(at(arm.hand)) - 1) < 1e-9);
});

test('a target further away than the arm is long is refused, not stretched toward', () => {
  const arm = makeArm(0.4);
  const before = arm.upper.quaternion.clone();
  const result = solve(arm, new THREE.Vector3(5, 0, 0));
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'out-of-reach');
  // Refused means unchanged. A solver that half-reaches is worse than one that declines.
  assert.ok(arm.upper.quaternion.equals(before));
});

test('a correction over budget is refused and the pose is put back exactly', () => {
  const arm = makeArm(0.4);
  const rootBefore = arm.upper.quaternion.clone();
  const midBefore = arm.lower.quaternion.clone();
  const target = new THREE.Vector3(-0.5, -1.2, 0.4);
  const generous = solve(makeArm(0.4), target);
  assert.equal(generous.applied, true, 'the target has to be reachable for this to test the budget');

  const result = solve(arm, target, { maxCorrectionDegrees: 5 });
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'over-budget');
  assert.ok(result.rootDegrees > 5 || result.midDegrees > 5);
  assert.ok(arm.upper.quaternion.equals(rootBefore));
  assert.ok(arm.lower.quaternion.equals(midBefore));
});

test('the elbow keeps the plane the animation put it in', () => {
  // The degree of freedom this solver does not have evidence for. Two arms bent in different planes
  // toward the same target must keep their own elbows, or the solver is silently choosing a pose.
  const target = new THREE.Vector3(0.8, 0.9, 0.4);
  const elbowFor = (axis) => {
    const arm = makeArm(0);
    arm.lower.quaternion.setFromAxisAngle(axis, 0.6);
    arm.root.updateMatrixWorld(true);
    const result = solve(arm, target);
    assert.equal(result.applied, true, result.reason || '');
    return arm.lower.getWorldPosition(new THREE.Vector3());
  };
  const inZ = elbowFor(new THREE.Vector3(0, 0, 1));
  const inY = elbowFor(new THREE.Vector3(0, 1, 0));
  assert.ok(inZ.distanceTo(inY) > 0.3, `the two elbows landed ${inZ.distanceTo(inY)} apart - the plane was not kept`);
});

test('a straight arm still solves, by bending toward the target', () => {
  // The degenerate case: with no bend there is no plane to keep, so the target picks one.
  const arm = makeArm(0);
  const result = solve(arm, new THREE.Vector3(1.2, 0.9, 0));
  assert.equal(result.applied, true, result.reason || '');
  assert.ok(result.gapAfter < 1e-6, `residual ${result.gapAfter}`);
});

test('a target the arm is already on is a no-op, not a jitter', () => {
  const arm = makeArm(0.4);
  const here = arm.hand.getWorldPosition(new THREE.Vector3());
  const result = solve(arm, here);
  assert.equal(result.applied, true);
  assert.ok(result.gapAfter < 1e-6);
  assert.ok(result.rootDegrees < 1e-3, `the shoulder moved ${result.rootDegrees} degrees for nothing`);
  assert.ok(result.midDegrees < 1e-3, `the elbow moved ${result.midDegrees} degrees for nothing`);
});
