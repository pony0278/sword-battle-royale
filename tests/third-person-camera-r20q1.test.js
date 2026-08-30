import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THIRD_PERSON_CAMERA_PROFILE,
  createThirdPersonCameraRuntime,
  evaluateFraming,
  evaluateLockedFraming,
  fitLockedProfileToAspect,
  LOCK_BAND_METERS,
  fighterSilhouettePoints,
  PLAYER_READABLE_FLOOR_METERS,
  horizontalHalfFovRadians,
  sampleCameraKeys,
  solveFreeCameraPose,
  solveLockedCameraPose,
} from '../src/combat/third-person-camera.js';
import { CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS } from '../src/combat/close-range-guard-hold.js';
import { MINIMUM_SUPPORTED_ASPECT_RATIO } from '../src/combat/supported-viewport.js';

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
  // The honesty label travels with the numbers: what came back from the lab, and what is still a
  // seed nobody has looked at. A downstream reader must never have to guess which is which.
  assert.match(THIRD_PERSON_CAMERA_PROFILE.provenance, /^locked-tuned-in-camera-lab/);
  assert.match(THIRD_PERSON_CAMERA_PROFILE.provenance, /free-and-dynamics-still-seeds$/);
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
  // panX is the player's right. With the axis along +z the camera looks along +z too, and screen
  // right for that is -x - the same formula the framing check has always used, and the one
  // poseFromAxis was missing before R20T.3.
  near(pose.lookAt.x, -key.panX, 1e-9, 'panX to the player right');
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
  const both = [...fighterSilhouettePoints({ x: 0, z: 0 }), ...fighterSilhouettePoints({ x: 0, z: 2.4 })];
  const framed = evaluateFraming({ pose, aspectRatio: 16 / 9, points: both });
  // The shipped framing crops the player's legs on purpose, so the whole-body reading is negative.
  // That is what this function is for: it reports geometry, and something else decides whether the
  // geometry is a decision or a bug.
  assert.ok(framed.marginNdc < 0);
  const opponentOnly = evaluateFraming({ pose, aspectRatio: 16 / 9, points: fighterSilhouettePoints({ x: 0, z: 2.4 }) });
  assert.equal(opponentOnly.inFrame, true, 'the opponent is never the one cropped');
  assert.ok(opponentOnly.marginNdc > 0 && opponentOnly.marginNdc <= 1);

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

test('R20Q.1 a fighter is a cylinder, so the silhouette cannot depend on which way they stand', () => {
  // The bug this exists to prevent: a half-width measured along world x is the correct lateral
  // extent for a duel down the z axis and is body DEPTH once the opponent circles to your side.
  const points = fighterSilhouettePoints({ x: 2, z: -1 });
  const radii = points.map((point) => Math.hypot(point.x - 2, point.z + 1));
  for (const radius of radii) assert.ok(Math.abs(radius - 0.45) < 1e-9, `every corner sits on the 0.45m radius, got ${radius}`);
  // Top and bottom, so a framing check can crop neither the head nor the feet unnoticed.
  const heights = [...new Set(points.map((point) => point.y))].sort((a, b) => a - b);
  assert.deepEqual(heights, [0.02, 1.78]);
  assert.equal(points.length, 8);
});

test('R20R.2 the shipped profile holds the opponent and the guard, in every supported window', () => {
  // The sweep the camera lab runs, as a test: the whole lock band, every bearing, and every aspect
  // the game is played in - starting at the orientation contract's own floor. Judged the way the
  // two fighters are actually read, because the shipped framing crops the player's legs on purpose
  // and a whole-body check would call that a failure.
  for (const aspectRatio of [MINIMUM_SUPPORTED_ASPECT_RATIO, 4 / 3, 16 / 9, 19.5 / 9]) {
    for (let separation = 1.1; separation <= 5.001; separation += 0.1) {
      for (let index = 0; index < 12; index += 1) {
        const bearing = (index / 12) * Math.PI * 2;
        const player = { x: 0, z: 0 };
        const target = { x: Math.sin(bearing) * separation, z: Math.cos(bearing) * separation };
        const framed = evaluateLockedFraming({
          pose: solveLockedCameraPose({ player, target }), aspectRatio, player, target,
        });
        assert.equal(framed.inFrame, true,
          `${aspectRatio.toFixed(2)}:1 at ${separation.toFixed(1)}m, bearing ${(bearing * 180 / Math.PI).toFixed(0)}deg`);
      }
    }
  }
  // And it is the half-body look that was chosen, not an accident of the numbers.
  const player = { x: 0, z: 0 };
  const target = { x: 0, z: 2.4 };
  assert.equal(evaluateLockedFraming({
    pose: solveLockedCameraPose({ player, target }), aspectRatio: 16 / 9, player, target,
  }).croppingPlayerLegs, true, 'the shipped look crops the player, deliberately');
});

test('R20R.2 one pose for the whole band, so walking cannot swing the camera', () => {
  // The fault this profile exists to avoid: keys that disagree turn a closing distance into camera
  // rotation - the first tuning pass had 30 deg/s of it, faster than the opponent crosses screen.
  // Every key identical is the strongest available statement that it cannot happen.
  const keys = THIRD_PERSON_CAMERA_PROFILE.locked.distanceKeys;
  for (const field of ['fovDegrees', 'angleDegrees', 'distanceMeters', 'lookHeightMeters', 'azimuthDegrees', 'panX', 'panZ']) {
    for (const key of keys) assert.equal(key[field], keys[0][field], `${field} must not vary with separation`);
  }
});


test('R20Q.1 the two fighters are framed by what each of them is for', () => {
  // You read an attack off the opponent's whole body; you read your own state off your guard, and
  // every exchange measured in this project is decided at or above the lowest contact floor. So a
  // framing that crops your own legs is a decision and one that crops the opponent's feet is a bug,
  // and one margin cannot tell those apart.
  assert.equal(PLAYER_READABLE_FLOOR_METERS, Math.min(...Object.values(CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS)),
    'the floor is the guard-hold measurement, not a number chosen for the camera');

  const player = { x: 0, z: 0 };
  const target = { x: 0, z: 2.4 };
  // A pose looking well past the player: their knees go, their guard stays.
  const key = { separationMeters: 2.4, fovDegrees: 59, angleDegrees: 12, distanceMeters: 3.4, lookHeightMeters: 0.69, azimuthDegrees: 40, panX: 0.05, panZ: 1.8 };
  const pose = solveLockedCameraPose({ player, target, profile: { locked: { distanceKeys: [key] } } });
  const framed = evaluateLockedFraming({ pose, aspectRatio: 16 / 9, player, target });
  assert.equal(framed.croppingPlayerLegs, true, 'this pose is the deliberate crop');
  assert.ok(framed.playerMarginNdc > 0, 'and the guard survives it');
  assert.ok(framed.playerFullBodyMarginNdc < 0, 'while the full body does not');
  assert.equal(framed.inFrame, true, 'a deliberate crop is not a failure');
  // The overall margin is the worse of the two, so a caller who reads one number still cannot miss
  // the opponent leaving frame.
  assert.equal(framed.marginNdc, Math.min(framed.opponentMarginNdc, framed.playerMarginNdc));
  // Pushed far enough, the guard goes too - and then it IS a failure.
  const tooFar = solveLockedCameraPose({
    player, target, profile: { locked: { distanceKeys: [{ ...key, panZ: 2.3 }] } },
  });
  assert.equal(evaluateLockedFraming({ pose: tooFar, aspectRatio: 16 / 9, player, target }).inFrame, false);
});

// R20Q.1f - fitting a framing to the window it is played in. The character (fov, angle, look
// height, panX) is never touched; only how far the camera is swung off the axis and how far the
// look point is pushed toward the opponent, which are the two things that spend horizontal room.

const HALF_BODY = { fovDegrees: 74, angleDegrees: 19, lookHeightMeters: 0.69, panX: 0.01, azimuthDegrees: 30, distanceMeters: 2.95, panZ: 1.67 };
const halfBodyProfile = () => ({ locked: { distanceKeys: [1.4, 2.4, 4].map((separationMeters) => ({ separationMeters, ...HALF_BODY })) } });
const worstPlayerMargin = (profile, aspectRatio) => {
  let worst = Infinity;
  for (let separation = LOCK_BAND_METERS.min; separation <= LOCK_BAND_METERS.max + 1e-9; separation += 0.1) {
    for (let index = 0; index < 12; index += 1) {
      const bearing = (index / 12) * Math.PI * 2;
      const player = { x: 0, z: 0 };
      const target = { x: Math.sin(bearing) * separation, z: Math.cos(bearing) * separation };
      const framing = evaluateLockedFraming({
        pose: solveLockedCameraPose({ player, target, profile }), aspectRatio, player, target,
      });
      worst = Math.min(worst, framing.playerMarginNdc);
    }
  }
  return worst;
};

test('R20Q.1f how much the shoulder must give up is a function of the window, not of the distance', () => {
  // This is the property the whole mechanism rests on. If the required easing moved with the gap,
  // the fit would be a new source of camera rotation - walking would swing the camera, which is
  // exactly the fault this project already removed from the profile itself. It does not move.
  const maxAzimuthAt = (separation, aspectRatio) => {
    for (let azimuthDegrees = 40; azimuthDegrees >= 0; azimuthDegrees -= 1) {
      const profile = { locked: { distanceKeys: [{ ...HALF_BODY, separationMeters: separation, azimuthDegrees }] } };
      const player = { x: 0, z: 0 };
      const target = { x: 0, z: separation };
      const framing = evaluateLockedFraming({
        pose: solveLockedCameraPose({ player, target, profile }), aspectRatio, player, target,
      });
      if (framing.playerMarginNdc >= 0.12) return azimuthDegrees;
    }
    return null;
  };
  for (const aspectRatio of [4 / 3, 16 / 9]) {
    const atFloor = maxAzimuthAt(LOCK_BAND_METERS.min, aspectRatio);
    for (const separation of [1.4, 2.4, 3.2, LOCK_BAND_METERS.max]) {
      assert.equal(maxAzimuthAt(separation, aspectRatio), atFloor,
        `the cap must not move with separation (${aspectRatio.toFixed(2)}:1 at ${separation}m)`);
    }
  }
  // And it does move with the window, which is the reason to do this at all.
  assert.ok(maxAzimuthAt(2.4, 16 / 9) > maxAzimuthAt(2.4, 4 / 3));
});

test('R20Q.1f a window with room changes nothing at all', () => {
  const fitted = fitLockedProfileToAspect(halfBodyProfile(), 21 / 9);
  assert.equal(fitted.eased, false);
  assert.equal(fitted.azimuthScale, 1);
  assert.equal(fitted.panZScale, 1);
  assert.deepEqual(fitted.appliedAzimuthDegrees, fitted.intendedAzimuthDegrees);
});

test('R20Q.1f a narrow window is eased until it actually passes, and says by how much', () => {
  const intended = halfBodyProfile();
  assert.ok(worstPlayerMargin(intended, 4 / 3) < 0.12, 'the premise: this framing does not fit a 4:3 window');
  const fitted = fitLockedProfileToAspect(intended, 4 / 3);
  assert.equal(fitted.satisfied, true);
  assert.equal(fitted.eased, true);
  // Verified independently of the fit's own sampling, across the whole band.
  assert.ok(worstPlayerMargin(fitted.profile, 4 / 3) >= 0.12);
  // Reported both ways round, so a fit can never quietly stand in for a profile that does not work.
  assert.equal(fitted.intendedAzimuthDegrees[1], 30);
  assert.ok(fitted.appliedAzimuthDegrees[1] < 30);
});

test('R20Q.1f one factor for the whole profile, or walking swings the camera again', () => {
  const fitted = fitLockedProfileToAspect(halfBodyProfile(), 4 / 3);
  const keys = fitted.profile.locked.distanceKeys;
  // Every key eased by the same amount: the azimuth stays constant across the band, so changing
  // distance cannot rotate the camera. A per-key fit would reintroduce exactly that.
  for (const key of keys) assert.equal(key.azimuthDegrees, keys[0].azimuthDegrees);
  // A profile whose keys differ on purpose keeps their relationship - the scale is a ratio, not a
  // flattening.
  const varied = { locked: { distanceKeys: [
    { ...HALF_BODY, separationMeters: 1.4, azimuthDegrees: 40 },
    { ...HALF_BODY, separationMeters: 2.4, azimuthDegrees: 20 },
  ] } };
  const variedFit = fitLockedProfileToAspect(varied, 4 / 3);
  const scales = variedFit.profile.locked.distanceKeys.map((key, index) => key.azimuthDegrees / variedFit.intendedAzimuthDegrees[index]);
  assert.ok(Math.abs(scales[0] - scales[1]) < 1e-9, 'one ratio, applied to every key');
});

test('R20Q.1f the preference decides which half of the look is spent', () => {
  const intended = halfBodyProfile();
  const player = { x: 0, z: 0 };
  const target = { x: 0, z: 2.4 };
  const read = (profile) => {
    const pose = solveLockedCameraPose({ player, target, profile });
    const at = (position, y) => evaluateFraming({ pose, aspectRatio: 4 / 3, points: [{ x: position.x, y, z: position.z }] });
    return {
      screenGap: Math.abs(at(player, 1.6).ndcX - at(target, 1.6).ndcX),
      framing: evaluateLockedFraming({ pose, aspectRatio: 4 / 3, player, target }),
    };
  };
  const crop = fitLockedProfileToAspect(intended, 4 / 3, { prefer: 'crop' });
  const shoulder = fitLockedProfileToAspect(intended, 4 / 3, { prefer: 'shoulder' });
  // Keeping the crop spends the shoulder, and vice versa - neither touches the other's lever while
  // it still has room to give.
  assert.ok(crop.azimuthScale < 1 && crop.panZScale === 1);
  assert.ok(shoulder.panZScale < 1 && shoulder.azimuthScale === 1);
  // And each keeps what it names: the crop stays a crop, the pair stays spread out.
  assert.ok(read(crop.profile).framing.playerFullBodyMarginNdc < 0, 'prefer crop keeps the legs cropped');
  assert.ok(read(shoulder.profile).screenGap > read(crop.profile).screenGap, 'prefer shoulder keeps them apart');
  for (const fitted of [crop, shoulder]) assert.equal(fitted.satisfied, true);
});

test('R20Q.1f the character itself is never touched', () => {
  const fitted = fitLockedProfileToAspect(halfBodyProfile(), 4 / 3);
  for (const key of fitted.profile.locked.distanceKeys) {
    for (const field of ['fovDegrees', 'angleDegrees', 'lookHeightMeters', 'panX', 'distanceMeters']) {
      assert.equal(key[field], HALF_BODY[field], `the fit must not move ${field}`);
    }
  }
});

test('R20Q.1f a portrait phone runs the primary lever out, and the second one follows', () => {
  // About +-11 degrees of world is rendered there; no amount of shoulder easing alone saves it, so
  // the framing degrades to plain and behind rather than pretending.
  const fitted = fitLockedProfileToAspect(halfBodyProfile(), 9 / 19.5);
  assert.equal(fitted.azimuthScale, 0, 'the shoulder is gone');
  assert.ok(fitted.panZScale < 1, 'and the look point had to come back too');
  assert.equal(fitted.satisfied, true);
  assert.ok(worstPlayerMargin(fitted.profile, 9 / 19.5) >= 0.12);
});
