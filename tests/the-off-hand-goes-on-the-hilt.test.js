import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { createDefaultCharacter } from '../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../src/character/debug-sword.js';
import { createProceduralBuckler, mountOffhandBuckler } from '../src/character/offhand-buckler.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../src/character/default-character-mount.js';
import { V3_GREATSWORD_DEFINITION } from '../src/character/v3-greatsword-weapon.js';
import { retargetConvertedSkyrimGltf } from '../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../src/animation/skyrim-weapon-bind-calibration.js';
import { OFF_HAND_GRIP_SCOPE, applyOffHandGripIk } from '../src/animation/off-hand-grip-ik.js';
import { SHIELD_ARM_HOLD_BONES } from '../src/combat/shield-arm-hold.js';
import { TWO_HAND_GRIP_REACH_TOLERANCE } from '../build/grip-reach.mjs';
import { measureSkyrimGripReach, parseSourceGlb } from '../build/skyrim-grip-reach.mjs';

// The record handoff/44 pinned, beaten.
//
// The authored seven-pose grip left gaps of 0.27 to 1.26. The real Skyrim clip, retargeted, left
// 0.39 - and handoff/46 established that the reach is lost in the equipment sockets rather than in
// the arms, which is a rig change that would move every weapon and every shield on every clip.
// This is the smaller fix: two bones, aimed at the weapon's own second grip node.

const dir = new URL('./', import.meta.url);
const THREE = { ...ThreeModule, GLTFLoader };
const GREATSWORD_IDLE = new URL('../assets/skyrim/greatsword/converted/2hm_idle.source.glb', dir);

async function posedFighter() {
  const gltf = await parseSourceGlb(THREE, await readFile(GREATSWORD_IDLE));
  const character = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, character.rig, {
    id: '2hm_idle', file: '2hm_idle.source.glb', clipId: 'SKYRIM_GREATSWORD/2hm_idle', role: 'test',
  }, { fps: 30 });
  character.registerAnimations([clip]);
  const weapon = createDebugSword(THREE, { definition: V3_GREATSWORD_DEFINITION });
  mountDebugSword(character, weapon, composeSkyrimWeaponMountCalibration(
    THREE, DEFAULT_KAYKIT_SWORD_MOUNT, clip.userData.weaponBindCalibration,
  ));
  const pose = (seconds) => {
    character.sampleAnimation(clip.name, seconds);
    character.object3d.updateMatrixWorld(true);
    weapon.update();
  };
  return { character, weapon, clip, pose };
}

async function measure(options = {}) {
  return measureSkyrimGripReach(THREE, {
    gltf: await parseSourceGlb(THREE, await readFile(GREATSWORD_IDLE)),
    definition: V3_GREATSWORD_DEFINITION,
    mount: DEFAULT_KAYKIT_SWORD_MOUNT,
    entry: { id: '2hm_idle', file: '2hm_idle.source.glb', clipId: 'SKYRIM_GREATSWORD/2hm_idle', role: 'test' },
    createDefaultCharacter,
    createDebugSword,
    mountDebugSword,
    retargetConvertedSkyrimGltf,
    composeSkyrimWeaponMountCalibration,
    ...options,
  });
}

test('MEASURED: the off hand reaches the hilt, on every frame of the clip', async () => {
  const report = await measure({ applyOffHandGripIk });
  assert.ok(report.worst <= TWO_HAND_GRIP_REACH_TOLERANCE,
    `worst gap ${report.worst.toFixed(4)} against a tolerance of ${TWO_HAND_GRIP_REACH_TOLERANCE}`);
  // Not "within tolerance" - exact. Analytic two-bone IK lands on the target or refuses.
  assert.ok(report.worst < 1e-6, `worst gap ${report.worst}`);
  assert.equal(report.offHandGrip.applied, true, `refused: ${report.offHandGrip.refused.join(', ')}`);
});

test('what it had to overcome, and what it cost', async () => {
  const report = await measure({ applyOffHandGripIk });
  // The before, kept next to the after so the pair cannot drift apart.
  // 0.3928 when this was written, 0.2484 once the equipment sockets were pulled to Skyrim's 6.3%.
  assert.ok(report.offHandGrip.worstBefore > 0.23 && report.offHandGrip.worstBefore < 0.27,
    `without the IK the gap is ${report.offHandGrip.worstBefore.toFixed(4)}`);
  // The cost, and how much the socket fix bought: the shoulder went 47.7 -> 29.4, the elbow
  // 20.1 -> 6.4. The 60 degree budget stays - it was measured against the worse case and a clip
  // held a little differently should not be refused for the sake of a tighter number.
  assert.ok(report.offHandGrip.worstShoulderDegrees < 35, 'the socket fix should have shrunk this');
  assert.ok(report.offHandGrip.worstShoulderDegrees < OFF_HAND_GRIP_SCOPE.maxCorrectionDegrees);
  assert.ok(report.offHandGrip.worstElbowDegrees < 10);
});

test('and the grip span comes out the width the clip holds it', async () => {
  // The gap closing is the goal; this is the evidence that it closed for the right reason. Both
  // hands now sit on the haft the way the animator put them, rather than the hand merely arriving
  // at a point.
  const report = await measure({ applyOffHandGripIk });
  const ratio = report.equipmentSpan / report.source.equipmentSpan;
  assert.ok(ratio > 0.9 && ratio < 1.15, `equipment span came out ${ratio.toFixed(2)}x the source's`);
});

test('a shield in the off hand refuses the grip, because two writers on one arm is a bug', async () => {
  // src/combat/shield-arm-hold.js owns this exact chain whenever a shield is up.
  for (const bone of OFF_HAND_GRIP_SCOPE.bones) {
    assert.ok(SHIELD_ARM_HOLD_BONES.includes(bone), `${bone} is not in the shield arm's set - has the overlap moved?`);
  }
  const { character, weapon, pose } = await posedFighter();
  pose(0);
  assert.equal(applyOffHandGripIk(THREE, { character, weapon }).applied, true);

  mountOffhandBuckler(character, createProceduralBuckler(THREE));
  pose(0);
  const refused = applyOffHandGripIk(THREE, { character, weapon });
  assert.equal(refused.applied, false);
  assert.equal(refused.reason, 'off-hand-occupied');
  assert.ok(refused.occupants.length > 0);
});

test('nothing outside the two named bones is written', async () => {
  const { character, weapon, pose } = await posedFighter();
  pose(0);
  const before = Object.fromEntries(Object.entries(character.rig.bones)
    .map(([id, bone]) => [id, bone.quaternion.toArray().join(',')]));
  assert.equal(applyOffHandGripIk(THREE, { character, weapon }).applied, true);
  const after = Object.fromEntries(Object.entries(character.rig.bones)
    .map(([id, bone]) => [id, bone.quaternion.toArray().join(',')]));

  const moved = Object.keys(before).filter((id) => before[id] !== after[id]).sort();
  assert.deepEqual(moved, [...OFF_HAND_GRIP_SCOPE.bones].sort());
  // Said from the other side too, because the forbidden list is the claim a reader checks.
  for (const bone of OFF_HAND_GRIP_SCOPE.forbiddenBones) {
    assert.equal(before[bone], after[bone], `${bone} was written and is on the forbidden list`);
  }
});

test('the off hand does not stretch: the arm keeps its own bone lengths', async () => {
  const { character, weapon, pose } = await posedFighter();
  pose(0);
  const at = (id) => character.rig.bones[id].getWorldPosition(new THREE.Vector3());
  const scaleOf = (id) => character.rig.bones[id].scale.toArray().join(',');
  const upperBefore = at('upperarm.l').distanceTo(at('lowerarm.l'));
  const foreBefore = at('lowerarm.l').distanceTo(at('wrist.l'));
  const scalesBefore = OFF_HAND_GRIP_SCOPE.bones.map(scaleOf);

  applyOffHandGripIk(THREE, { character, weapon });

  // The exact claim: only quaternions were written, so the scales are untouched byte for byte.
  assert.deepEqual(OFF_HAND_GRIP_SCOPE.bones.map(scaleOf), scalesBefore);
  // And the measured consequence. The tolerance is 1e-6 rather than 1e-9 because these bones
  // already carry a scale of 0.9999993 before anything here runs, so a world distance recomputed
  // through a changed rotation drifts by a few parts in a billion. Measured at 6e-9; a threshold
  // tight enough to catch that is measuring float noise, not stretch.
  assert.ok(Math.abs(at('upperarm.l').distanceTo(at('lowerarm.l')) - upperBefore) < 1e-6);
  assert.ok(Math.abs(at('lowerarm.l').distanceTo(at('wrist.l')) - foreBefore) < 1e-6);
});
