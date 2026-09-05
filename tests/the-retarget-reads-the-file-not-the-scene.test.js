import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { createDefaultCharacter } from '../src/character/default-character.js';
import { retargetConvertedSkyrimGltf } from '../src/animation/skyrim-converted-animation-library.js';
import { captureSkyrimSourceRest, restoreSkyrimSourceRest } from '../src/animation/skyrim-animation-retarget.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';

// retargetSkyrimClip reads the source hierarchy's CURRENT world transforms and calls them
// `sourceRest`. The name says rest; the code said now.
//
// MEASURED: pose the source scene before asking for a retarget and the whole retarget shifts -
// 103.4 degrees on wristl - while the G2.4.5 weapon bind moves 112.1162 -> 87.6950 (posed at t=0)
// or 93.3833 (t=3). Nothing committed tripped it: production loads and retargets immediately, and
// both review pages parse their own source copy. A measurement written during handoff/46 did trip
// it, which is how it was found, and the failure is a plausible-looking animation rather than an
// error - the worst shape a bug can have in a repository whose discipline is measurement.
//
// The hazard is only on the way IN. The function already leaves the scene where it found it.

const dir = new URL('./', import.meta.url);
const GLB = new URL('../assets/skyrim/greatsword/converted/2hm_idle.source.glb', dir);
const THREE = { ...ThreeModule, GLTFLoader };
const ENTRY = Object.freeze({ id: '2hm_idle', file: '2hm_idle.source.glb', clipId: 'X/2hm_idle', role: 'test' });

async function retargetAfter({ poseAt = null, capture = true } = {}) {
  const bytes = await readFile(GLB);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  // Parsed raw here rather than through parseSourceGlb, so `capture: false` can reproduce the
  // unguarded behaviour. A test that cannot reproduce the bug cannot prove the fix.
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
  if (capture) captureSkyrimSourceRest(gltf.scene);
  if (poseAt !== null) {
    const mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(gltf.animations[0]).play();
    mixer.setTime(poseAt);
    gltf.scene.updateMatrixWorld(true);
  }
  const character = createDefaultCharacter(THREE);
  return retargetConvertedSkyrimGltf(THREE, gltf, character.rig, ENTRY, { fps: 30 });
}

function worstTrackDelta(a, b) {
  const byName = Object.fromEntries(a.tracks.map((track) => [track.name, track.values]));
  let worst = 0;
  for (const track of b.tracks) {
    const values = byName[track.name];
    if (!values) return Infinity;
    for (let index = 0; index < values.length; index += 1) {
      worst = Math.max(worst, Math.abs(values[index] - track.values[index]));
    }
  }
  return worst;
}

test('the hazard is real: without the capture, a posed scene changes the whole retarget', async () => {
  const clean = await retargetAfter();
  const dirty = await retargetAfter({ poseAt: 0, capture: false });
  assert.ok(worstTrackDelta(clean, dirty) > 1, 'the unguarded path no longer reproduces the bug');
  assert.ok(Math.abs(dirty.userData.weaponBindCalibration.correctionAngleDegrees - 87.695) < 0.01,
    `unguarded bind ${dirty.userData.weaponBindCalibration.correctionAngleDegrees}`);
});

test('with the capture, the retarget is bit-identical whatever was done to the scene first', async () => {
  const clean = await retargetAfter();
  for (const poseAt of [0, 1.5, 3, 6.6]) {
    const guarded = await retargetAfter({ poseAt });
    assert.equal(worstTrackDelta(clean, guarded), 0, `posed at ${poseAt}s and the tracks moved`);
    assert.equal(guarded.userData.weaponBindCalibration.correctionAngleDegrees,
      clean.userData.weaponBindCalibration.correctionAngleDegrees, `posed at ${poseAt}s and the bind moved`);
  }
});

test('the shipped bind is unchanged, which is what makes the fix safe to make', async () => {
  const clean = await retargetAfter();
  assert.ok(Math.abs(clean.userData.weaponBindCalibration.correctionAngleDegrees - 112.1162) < 0.001,
    `bind ${clean.userData.weaponBindCalibration.correctionAngleDegrees}`);
});

test('capture keeps the first pose it saw and refuses to be overwritten by a later one', async () => {
  // The stash has to be the pose the FILE carries. A second capture after someone posed the scene
  // would quietly replace the rest pose with that pose, which is the bug wearing a helper's name.
  const bytes = await readFile(GLB);
  const gltf = await parseSourceGlb(THREE, bytes);
  assert.equal(captureSkyrimSourceRest(gltf.scene), false, 'parseSourceGlb should have captured already');
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(gltf.animations[0]).play();
  mixer.setTime(3);
  gltf.scene.updateMatrixWorld(true);
  const posed = gltf.scene.getObjectByName('NPC_R_Hand_RHnd').quaternion.clone();
  assert.equal(captureSkyrimSourceRest(gltf.scene), false, 'a second capture must not overwrite the stash');
  assert.equal(restoreSkyrimSourceRest(gltf.scene), true);
  const restored = gltf.scene.getObjectByName('NPC_R_Hand_RHnd').quaternion;
  assert.ok(2 * Math.acos(Math.min(1, Math.abs(posed.dot(restored)))) > 0.01, 'restore did not undo the pose');
});

test('restoring a scene nobody captured says so rather than pretending', async () => {
  const bytes = await readFile(GLB);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
  assert.equal(restoreSkyrimSourceRest(gltf.scene), false);
  assert.equal(captureSkyrimSourceRest(gltf.scene), true);
  assert.equal(restoreSkyrimSourceRest(gltf.scene), true);
});
