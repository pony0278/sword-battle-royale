import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// R20Q.1: the camera lab is a tuning surface, and the thing worth protecting about it is that it
// is not a second camera. What it renders must come from the shared solver, the numbers it prints
// must be the shape the combat lab imports, and none of it may reach into the combat lab.

const labJs = readFileSync(new URL('../tools/action-studio/camera-lab.js', import.meta.url), 'utf8');
const labHtml = readFileSync(new URL('../tools/action-studio/camera-lab.html', import.meta.url), 'utf8');
const cameraModule = readFileSync(new URL('../src/combat/third-person-camera.js', import.meta.url), 'utf8');

test('R20Q.1 the lab solves nothing of its own - pose, smoothing and profile are the shared ones', () => {
  assert.match(labJs, /from '\.\.\/\.\.\/src\/combat\/third-person-camera\.js'/);
  for (const shared of ['solveLockedCameraPose', 'solveFreeCameraPose', 'createThirdPersonCameraRuntime', 'evaluateFraming']) {
    assert.ok(labJs.includes(shared), `the lab must use the shared ${shared}`);
  }
  // No camera of its own, and no second copy of the pose arithmetic: the lab writes the scene
  // camera from a solved pose and nothing else.
  assert.doesNotMatch(labJs, /new THREE\.PerspectiveCamera/);
  assert.doesNotMatch(labJs, /Math\.(sin|cos)\([^)]*angleDegrees/);
  assert.match(labJs, /scene\.camera\.position\.set\(smoothed\.position\.x, smoothed\.position\.y, smoothed\.position\.z\)/);
});

test('R20Q.1 the shared module stays renderer-free, so both labs and the tests can hold it', () => {
  assert.doesNotMatch(cameraModule, /\bimport\b[^\n]*three/i);
  assert.doesNotMatch(cameraModule, /\bTHREE\./);
});

test('R20Q.1 the lab reaches into the combat lab for actors and clips, never for its wiring', () => {
  // Same fighters and same swings, so a framing judgement is made on the real thing.
  assert.match(labJs, /createShieldParryLabScene/);
  assert.match(labJs, /bootstrapShieldParryLabAssets/);
  assert.match(labJs, /createLongswordDirectionalAttackRuntime/);
  // But none of the combat lab's own wiring: the entry stays untouched while tuning happens.
  assert.doesNotMatch(labJs, /shield-driven-contact-coupling-lab/);
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.doesNotMatch(entry, /camera-lab/, 'the combat lab must not depend on the tuning page');
});

test('R20Q.1 what the page prints is what the module reads back', () => {
  // The output is pasted into third-person-camera.js by hand, so its field names have to be the
  // module's field names - a serializer that drifted would produce a profile that silently loses
  // whatever it forgot.
  const fields = ['separationMeters', 'fovDegrees', 'angleDegrees', 'distanceMeters', 'lookHeightMeters', 'azimuthDegrees', 'panX', 'panZ'];
  const serializer = labJs.slice(labJs.indexOf('function serializeProfile'), labJs.indexOf('// --- wiring'));
  for (const field of ['POSE_FIELDS', 'mouseSensitivityRadiansPerPixel', 'pitchMinDegrees', 'pitchMaxDegrees', 'positionLagSeconds', 'rotationLagSeconds', 'transitionSeconds']) {
    assert.ok(serializer.includes(field), `serializer drops ${field}`);
  }
  const poseFields = labJs.slice(labJs.indexOf('const POSE_FIELDS'), labJs.indexOf('\n', labJs.indexOf('const POSE_FIELDS')));
  for (const field of fields.slice(1)) assert.ok(poseFields.includes(field), `POSE_FIELDS drops ${field}`);
  // Every tunable has a slider spec, or it is a number nobody can reach.
  for (const field of fields.slice(1)) assert.ok(labJs.includes(`  ${field}: { label:`), `no control for ${field}`);
});

test('R20Q.1 the page identifies its build and states the sweep it verifies', () => {
  assert.match(labHtml, /camera-lab\.js\?v=camera-lab-r20q1/);
  assert.match(labHtml, /v=camera-lab-r20q1/);
  assert.match(labHtml, /third-person-camera\.js/);
  // The out-of-frame check runs the lock band, which is the contact floor to the break range.
  assert.match(labJs, /SWEEP_MIN_METERS = 1\.1/);
  assert.match(labJs, /SWEEP_MAX_METERS = 5/);
});
