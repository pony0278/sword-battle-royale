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
  // The tag is bumped whenever the page is published, so the legend line and the module query
  // identify the build a tester is actually looking at rather than whatever the browser cached.
  assert.match(labHtml, /camera-lab\.js\?v=camera-lab-r20q1d"/);
  assert.match(labHtml, /v=camera-lab-r20q1d \u00b7/);
  assert.match(labHtml, /third-person-camera\.js/);
  // The out-of-frame check runs the lock band, which is the contact floor to the break range.
  assert.match(labJs, /SWEEP_MIN_METERS = 1\.1/);
  assert.match(labJs, /SWEEP_MAX_METERS = 5/);
});

test('R20Q.1 the page can be driven from the console, which is how sets get compared', () => {
  // Twenty-one sliders is a way to hunt for a number, not a way to compare two candidate sets. So
  // the whole working profile is writable from the console, in every shape a person would have one
  // in: a preset name, an array of keys, or the text the output box just printed.
  assert.match(labJs, /load: loadProfile/);
  assert.match(labJs, /setKey,/);
  assert.match(labJs, /measure: \(profile\) => measureProfile\(profile\)/);
  assert.match(labJs, /help\(\)/);
  const loader = labJs.slice(labJs.indexOf('function loadProfile'), labJs.indexOf('function setKey'));
  assert.match(loader, /PRESETS\[parsed\.trim\(\)\]/, 'a preset name');
  assert.match(loader, /Array\.isArray\(parsed\)/, 'an array of keys');
  assert.match(loader, /new Function\(`return \(\{\$\{parsed\}\}\)`\)/, 'the printed text');
  // A partial key is a tweak, not a pose full of holes.
  assert.match(loader, /const base = sampleCameraKeys\(seed\.locked\.distanceKeys, key\.separationMeters\);/);
  // Rebuilding the controls must not leave the old refreshers behind, or every load doubles the
  // number of sliders writing to the same field.
  assert.ok(/function buildControls\(\) \{\s*refreshers\.length = 0;/.test(labJs), 'buildControls must clear the refreshers it rebuilds');
});

test('R20Q.1 the presets are complete poses, so loading one cannot half-apply', () => {
  const presets = labJs.slice(labJs.indexOf('const PRESETS = Object.freeze({'), labJs.indexOf('const FIELD_SPECS'));
  for (const name of ['seed:', 'yours:', 'propagated:', 'softened:', 'halfBody:', 'opponentFirst:']) {
    assert.ok(presets.includes(name), `missing preset ${name}`);
  }
  // Three keys each, at the separations the profile keys on, and every one of them spread from a
  // named character block rather than typed out twice.
  for (const separation of ['1.4', '2.4', '4']) {
    assert.ok(presets.includes(`separationMeters: ${separation},`), `presets skip the ${separation}m key`);
  }
  assert.match(labJs, /PRESET_MIDDLE = \{ fovDegrees: 59[^}]*azimuthDegrees: 40/);
  assert.ok((presets.match(/\.\.\.PRESET_MIDDLE/g) || []).length >= 5, 'the tuned character is written once and spread, not retyped');
});

test('R20Q.1 the sweep checks every bearing, not just a duel down one axis', () => {
  // A lock follows the pair round, so a framing that only survives them facing off along the lane
  // is not verified. This is the check that would have caught the wrongly oriented body box.
  const measure = labJs.slice(labJs.indexOf('function measureProfile'), labJs.indexOf('function sweepFraming'));
  assert.match(measure, /for \(let bearing = 0; bearing < Math\.PI \* 2/);
  // And both the shape and the asymmetry are the shared module's - the page must not carry its own
  // idea of how wide a body is, nor its own guess at how much of yourself has to stay visible.
  assert.match(measure, /evaluateLockedFraming\(\{ pose, aspectRatio: aspect, player, target \}\)/);
  // And every window shape the game has to survive, because the horizontal field is the half that
  // moves with the aspect: an over-the-shoulder offset fine at 16:9 can push you out the side of a
  // 4:3 one, which is exactly how the first opponent-first candidate failed.
  assert.match(labJs, /VERIFIED_ASPECT_RATIOS = Object\.freeze\(\[4 \/ 3, 16 \/ 9, 19\.5 \/ 9\]\)/);
  assert.match(measure, /for \(const aspect of aspects\)/);
  assert.doesNotMatch(labJs, /SILHOUETTE_HALF_WIDTH_METERS/);
  assert.match(labJs, /PLAYER_READABLE_FLOOR_METERS,/);
  // A deliberate crop is reported, never counted as a failure.
  assert.match(measure, /if \(framing\.croppingPlayerLegs\) legCrops \+= 1;/);
  assert.match(labJs, /worstOpponentMarginNdc/);
  assert.match(labJs, /worstPlayerMarginNdc/);
  assert.match(labJs, /opponentScreenHeight/);
});

test('R20Q.1 the measurement says what a slider cannot: what the camera does on its own', () => {
  // Keys that disagree with each other turn walking into camera work nobody asked for, and that is
  // invisible while you hold the separation still. The rate is measured against the same sidestep
  // speed the lane profile states, so it can be compared with how fast the opponent crosses screen.
  const measure = labJs.slice(labJs.indexOf('function measureProfile'), labJs.indexOf('function sweepFraming'));
  assert.match(measure, /azimuthDegreesPerSecond/);
  assert.match(measure, /LANE_LOCOMOTION_PROFILE\.lateralSpeedMps/);
  assert.match(measure, /screenGap/);
  assert.match(labJs, /swing > 18/, 'the warning threshold is the opponent\'s own on-screen rate at 2.4m');
});
