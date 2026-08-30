import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THIRD_PERSON_CAMERA_PROFILE,
  createThirdPersonCameraRuntime,
  evaluateFraming,
  horizontalHalfFovRadians,
  sampleCameraKeys,
  solveFreeCameraPose,
  solveLockedCameraPose,
} from '../src/combat/third-person-camera.js';

// R20Q.1 - the shared camera. These lock the geometry and the shape of the profile, NOT the
// numbers in it: the numbers are seeds for camera-lab.html to replace, and a test that pinned them
// would turn tuning into a test failure. What must not drift is that both labs solve one pose from
// one file, that the pose means what its field names say, and that the smoothing does not depend on
// the frame rate.

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

test('R20Q.1 the profile carries every field a pose needs, at every distance key', () => {
  const fields = ['fovDegrees', 'angleDegrees', 'distanceMeters', 'lookHeightMeters', 'azimuthDegrees', 'panX', 'panZ'];
  const keys = THIRD_PERSON_CAMERA_PROFILE.locked.distanceKeys;
  assert.ok(keys.length >= 2, 'one key is a fixed pose, not a framing that follows the fight');
  for (const key of keys) {
    for (const field of [...fields, 'separationMeters']) {
      assert.equal(typeof key[field], 'number', `locked key missing ${field}`);
      assert.ok(Number.isFinite(key[field]));
    }
  }
  // Sorted and spanning the band the lock actually covers: the 1.1m contact floor to the 5m break.
  const separations = keys.map((key) => key.separationMeters);
  assert.deepEqual(separations, [...separations].sort((a, b) => a - b));
  for (const field of fields) assert.equal(typeof THIRD_PERSON_CAMERA_PROFILE.free[field], 'number', `free missing ${field}`);
  for (const field of ['positionLagSeconds', 'rotationLagSeconds', 'transitionSeconds']) {
    assert.ok(THIRD_PERSON_CAMERA_PROFILE.dynamics[field] >= 0);
  }
  // The honesty label travels with the numbers, so nobody downstream mistakes a seed for a measurement.
  assert.equal(THIRD_PERSON_CAMERA_PROFILE.provenance, 'seed-values-awaiting-camera-lab-tuning');
});

test('R20Q.1 horizontal field follows the aspect, which is the whole reason it is computed', () => {
  // A 50 degree vertical lens: what it shows sideways is a different number in every window.
  near(horizontalHalfFovRadians(50, 16 / 9) * 180 / Math.PI, 39.65, 0.1, '16:9');
  near(horizontalHalfFovRadians(50, 4 / 3) * 180 / Math.PI, 31.86, 0.1, '4:3');
  assert.ok(horizontalHalfFovRadians(50, 9 / 16) < horizontalHalfFovRadians(50, 16 / 9), 'portrait sees less');
  // A square window shows exactly the vertical field.
  near(horizontalHalfFovRadians(50, 1), (25 * Math.PI) / 180, 1e-9, 'square');
  assert.ok(Number.isFinite(horizontalHalfFovRadians('wide', null)), 'garbage must not produce a NaN cone');
});

test('R20Q.1 keys interpolate between their neighbours and hold at the ends', () => {
  const keys = [
    { separationMeters: 1, fovDegrees: 40, angleDegrees: 10, distanceMeters: 2, lookHeightMeters: 1, azimuthDegrees: 0, panX: 0, panZ: 0 },
    { separationMeters: 3, fovDegrees: 60, angleDegrees: 30, distanceMeters: 4, lookHeightMeters: 2, azimuthDegrees: 10, panX: 1, panZ: 2 },
  ];
  const middle = sampleCameraKeys(keys, 2);
  near(middle.fovDegrees, 50, 1e-9, 'fov');
  near(middle.distanceMeters, 3, 1e-9, 'distance');
  near(middle.panZ, 1, 1e-9, 'panZ');
  // Outside the tuned band, the nearest key holds: a fight at 6m is framed like the furthest thing
  // anybody looked at, rather than extrapolated into a pose no one has seen.
  assert.equal(sampleCameraKeys(keys, 12).distanceMeters, 4);
  assert.equal(sampleCameraKeys(keys, 0.2).distanceMeters, 2);
  // Order of the keys is the solver's problem, not the tuner's.
  assert.equal(sampleCameraKeys([...keys].reverse(), 2).fovDegrees, 50);
  assert.equal(sampleCameraKeys([], 2), null);
});

test('R20Q.1 the locked camera stands behind the player, on the line to the target', () => {
  const pose = solveLockedCameraPose({ player: { x: 0, z: 0 }, target: { x: 0, z: 2.4 } });
  assert.equal(pose.mode, 'locked');
  near(pose.separationMeters, 2.4, 1e-9, 'separation');
  const key = sampleCameraKeys(THIRD_PERSON_CAMERA_PROFILE.locked.distanceKeys, 2.4);
  // Behind means: further from the target than the player is, on the same axis.
  assert.ok(pose.position.z < 0, 'the camera is on the far side of the player from the target');
  assert.ok(pose.position.y > pose.lookAt.y, 'and above the look point, since it looks down by angleDegrees');
  // panZ slides the look point toward the target - that is what gets both fighters into frame.
  near(pose.lookAt.z, key.panZ, 1e-9, 'panZ toward the target');
  // panX is the player's right, and with the axis along +z that is +x.
  near(pose.lookAt.x, key.panX, 1e-9, 'panX to the right');
  near(pose.lookAt.y, key.lookHeightMeters, 1e-9, 'look height');
  // The pose obeys its own numbers: distance along the ground, height by the pitch.
  const ground = Math.hypot(pose.position.x - pose.lookAt.x, pose.position.z - pose.lookAt.z);
  near(Math.hypot(ground, pose.position.y - pose.lookAt.y), key.distanceMeters, 1e-9, 'distance from the look point');
  near(Math.asin((pose.position.y - pose.lookAt.y) / key.distanceMeters) * 180 / Math.PI, key.angleDegrees, 1e-6, 'pitch');
});

test('R20Q.1 the framing rotates with the pair rather than with the world', () => {
  // Same fight, turned 90 degrees: the camera must end up in the same place relative to the two of
  // them. If this fails the lock is following an axis of the world, which is a camera bug that
  // looks like a movement bug.
  const along = solveLockedCameraPose({ player: { x: 0, z: 0 }, target: { x: 0, z: 2.4 } });
  const across = solveLockedCameraPose({ player: { x: 0, z: 0 }, target: { x: 2.4, z: 0 } });
  near(Math.hypot(across.position.x, across.position.z), Math.hypot(along.position.x, along.position.z), 1e-9, 'ground offset');
  near(across.position.y, along.position.y, 1e-9, 'height');
  // Rotating the along-z pose by +90 degrees about the origin maps (x,z) -> (z,-x).
  near(across.position.x, along.position.z, 1e-9, 'rotated x');
  near(across.position.z, -along.position.x, 1e-9, 'rotated z');
});

test('R20Q.1 nose to nose there is no axis, so the caller keeps the last honest one', () => {
  // Standing inside your opponent: the line between them is undefined and a solver that shrugged
  // would swing the camera to whatever atan2(0,0) happens to be.
  const facing = 1.2;
  const pose = solveLockedCameraPose({ player: { x: 1, z: 1 }, target: { x: 1, z: 1 }, fallbackAxisRadians: facing });
  assert.equal(pose.axisRadians, facing);
  assert.ok(Number.isFinite(pose.position.x) && Number.isFinite(pose.position.z));
});

test('R20Q.1 free mode follows the camera yaw and clamps the pitch to the tuned limits', () => {
  const free = THIRD_PERSON_CAMERA_PROFILE.free;
  const level = solveFreeCameraPose({ player: { x: 0, z: 0 }, yawRadians: 0, pitchDegrees: 20 });
  assert.equal(level.mode, 'free');
  assert.equal(level.pitchDegrees, 20);
  assert.ok(level.position.z < 0, 'facing +z means the camera sits at -z');
  // Yaw is the player-facing axis in this mode, so the whole rig turns with it.
  const turned = solveFreeCameraPose({ player: { x: 0, z: 0 }, yawRadians: Math.PI, pitchDegrees: 20 });
  assert.ok(turned.position.z > 0);
  // Looking straight up or into the floor is what an unclamped pitch buys you.
  assert.equal(solveFreeCameraPose({ yawRadians: 0, pitchDegrees: 900 }).pitchDegrees, free.pitchMaxDegrees);
  assert.equal(solveFreeCameraPose({ yawRadians: 0, pitchDegrees: -900 }).pitchDegrees, free.pitchMinDegrees);
  // Below the horizon the camera is under the look point, which is the low angle being possible at all.
  assert.ok(solveFreeCameraPose({ yawRadians: 0, pitchDegrees: free.pitchMinDegrees }).position.y < free.lookHeightMeters);
});

test('R20Q.1 the runtime snaps once, then lags, and lags the same amount at any frame rate', () => {
  const runtime = createThirdPersonCameraRuntime();
  const start = solveLockedCameraPose({ player: { x: 0, z: 0 }, target: { x: 0, z: 2.4 } });
  const first = runtime.update(start, 1 / 60);
  assert.equal(first.settled, true, 'the first frame must not swoop in from wherever the camera was');
  near(first.position.x, start.position.x, 1e-9, 'snapped');

  const moved = solveLockedCameraPose({ player: { x: 3, z: 0 }, target: { x: 3, z: 2.4 } });
  const stepped = runtime.update(moved, 1 / 60);
  assert.equal(stepped.settled, false);
  assert.ok(Math.abs(stepped.position.x - start.position.x) > 1e-6, 'it does move');
  assert.ok(Math.abs(stepped.position.x - moved.position.x) > 1e-6, 'but it does not arrive in one frame');

  // Same elapsed time, different step sizes: a camera that smoothed by a fixed fraction per frame
  // would be a different camera on every machine. This is the frame-clock lesson, applied here.
  const run = (steps) => {
    const camera = createThirdPersonCameraRuntime();
    camera.update(start, 1 / 60);
    for (let index = 0; index < steps; index += 1) camera.update(moved, 0.5 / steps);
    return camera.update(moved, 0).position.x;
  };
  near(run(30), run(240), 5e-3, 'half a second of catch-up at 60fps vs 480fps');

  // And it converges: a second of chasing a stationary pose ends on it.
  const settling = createThirdPersonCameraRuntime();
  settling.update(start, 1 / 60);
  let last = null;
  for (let index = 0; index < 60; index += 1) last = settling.update(moved, 1 / 60);
  near(last.position.x, moved.position.x, 1e-3, 'converged');
  runtime.reset();
  assert.equal(runtime.update(start, 1 / 60).settled, true, 'reset re-arms the snap');
});

test('R20Q.1 framing is measured against the same projection the renderer performs', () => {
  const pose = solveLockedCameraPose({ player: { x: 0, z: 0 }, target: { x: 0, z: 2.4 } });
  const both = [{ x: 0, y: 1.7, z: 0 }, { x: 0, y: 1.7, z: 2.4 }, { x: 0, y: 0.05, z: 0 }];
  const framed = evaluateFraming({ pose, aspectRatio: 16 / 9, points: both });
  assert.equal(framed.inFrame, true, 'the seed pose must at least hold the two of them at 2.4m');
  assert.ok(framed.marginNdc > 0 && framed.marginNdc <= 1);

  // Somebody a long way off to the side is off screen, and the report says who.
  const wide = evaluateFraming({ pose, aspectRatio: 16 / 9, points: [...both, { x: 9, y: 1.7, z: 1 }] });
  assert.equal(wide.inFrame, false);
  assert.equal(wide.worstPoint.x, 9);

  // Narrower window, same pose: less room sideways, so the margin can only shrink.
  const narrow = evaluateFraming({ pose, aspectRatio: 4 / 3, points: both });
  assert.ok(narrow.marginNdc <= framed.marginNdc);

  // Behind the camera fails outright. A projection that only divided by depth would put this
  // point back on screen mirrored, and the sweep would report a framing that does not exist.
  const behind = evaluateFraming({ pose, aspectRatio: 16 / 9, points: [{ x: 0, y: 1.4, z: -40 }] });
  assert.equal(behind.behindCamera, true);
  assert.equal(behind.marginNdc, -Infinity);
  assert.equal(evaluateFraming({ pose, points: [] }), null);
  assert.equal(evaluateFraming({}), null);
});

test('R20Q.1 the seed profile holds both fighters on screen across the whole lock band', () => {
  // This is the sweep the camera lab runs, as a test: from the 1.1m contact floor to the 5m break,
  // at 16:9. It is not a claim that the seeds look good - only that they are a starting point a
  // person can tune from, rather than one where somebody is already off screen.
  const silhouette = (z) => [
    { x: 0.45, y: 1.75, z }, { x: -0.45, y: 1.75, z }, { x: 0.45, y: 0.05, z }, { x: -0.45, y: 0.05, z },
  ];
  for (let separation = 1.1; separation <= 5.001; separation += 0.1) {
    const pose = solveLockedCameraPose({ player: { x: 0, z: 0 }, target: { x: 0, z: separation } });
    const framed = evaluateFraming({
      pose, aspectRatio: 16 / 9, points: [...silhouette(0), ...silhouette(separation)],
    });
    assert.equal(framed.inFrame, true, `both fighters must be on screen at ${separation.toFixed(1)}m`);
  }
});
