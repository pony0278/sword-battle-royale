import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { createDefaultCharacter } from '../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../src/character/default-character-mount.js';
import { V3_GREATSWORD_DEFINITION } from '../src/character/v3-greatsword-weapon.js';
import { V3_LONGSWORD_DEFINITION } from '../src/character/procedural-v3-weapon.js';
import { retargetConvertedSkyrimGltf } from '../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../src/animation/skyrim-weapon-bind-calibration.js';
import { TWO_HAND_GRIP_REACH_TOLERANCE } from '../build/grip-reach.mjs';
import { measureSkyrimGripReach, measureSourceProportions, parseSourceGlb } from '../build/skyrim-grip-reach.mjs';

// handoff/44 pinned the authored two-hand pose failing to reach the hilt and said a real clip was
// what it wanted. The real clip arrived. It holds the sword. The off hand still does not reach.
//
// WHY THAT IS, though, took three wrong answers to establish, and the wrong answers are the reason
// this file names its reference points in every assertion:
//
//   "the retarget doubles the hand separation"   compared the source's WRIST bones against this
//                                                rig's hand SOCKETS. Measured like for like the
//                                                wrist span survives at 1.32x, not 2.21x.
//   "the haft is 73 degrees off"                 used the raw KayKit mount. The game composes that
//                                                with the clip's G2.4.5 weapon bind; with the mount
//                                                that ships, the haft is 21 degrees off.
//   "SECONDARY_GRIP is at half the separation"   measured against the source's off WRIST. Against
//                                                the source's off-hand EQUIPMENT point - Skyrim's
//                                                `Shield` node, which is what handslot.l is - it
//                                                was at 72%.
//
// What survived all three corrections was the finding: this rig hung its equipment sockets 2.3x
// further off the wrist than Skyrim does, on both hands, and the retarget could not correct it
// because handslot.l and handslot.r receive rotation only.
//
// THAT IS FIXED NOW. build/extract-kaykit-assets.mjs pulls the sockets to Skyrim's own 6.3% of
// head-to-root, and this file records what is left: the sockets agree with the source to 1.01x, the
// gap the IK still has to close fell 0.3928 -> 0.2484, and the pose error that remains is the
// retarget's own - the wrists still come out 1.32x the source's span.

const dir = new URL('./', import.meta.url);
const THREE = { ...ThreeModule, GLTFLoader };
const GREATSWORD_IDLE = new URL('../assets/skyrim/greatsword/converted/2hm_idle.source.glb', dir);
const GUARD_HOLD = new URL('../assets/skyrim/guard/converted/shd_blockidle.source.glb', dir);

async function measure(url, id, definition) {
  return measureSkyrimGripReach(THREE, {
    gltf: await parseSourceGlb(THREE, await readFile(url)),
    definition,
    mount: DEFAULT_KAYKIT_SWORD_MOUNT,
    entry: { id, file: `${id}.source.glb`, clipId: `SKYRIM_SOURCE/${id}`, role: 'measurement' },
    createDefaultCharacter,
    createDebugSword,
    mountDebugSword,
    retargetConvertedSkyrimGltf,
    composeSkyrimWeaponMountCalibration,
  });
}

test('the source clip really is a two-handed hold, and the shield clip really is not', async () => {
  const greatsword = measureSourceProportions(THREE, await parseSourceGlb(THREE, await readFile(GREATSWORD_IDLE)));
  const guard = measureSourceProportions(THREE, await parseSourceGlb(THREE, await readFile(GUARD_HOLD)));
  // Weapon node to Shield node: the two hands' equipment points. On a two-handed hold they are on
  // the same haft; on a shield hold they are on opposite sides of the body.
  assert.ok(greatsword.equipmentSpan < 0.15, `2hm_idle equipment span ${(greatsword.equipmentSpan * 100).toFixed(1)}%`);
  assert.ok(guard.equipmentSpan > 0.45, `shd_blockidle equipment span ${(guard.equipmentSpan * 100).toFixed(1)}%`);
  // The control matters: without it, "the grip points are close" could be a property of the
  // measurement rather than of the clip.
  assert.ok(guard.equipmentSpan > greatsword.equipmentSpan * 4);
});

test('the retarget keeps the pose - the wrists come out where the clip puts them', async () => {
  // This is the assertion that replaces "the hands come out more than twice as far apart". Wrist to
  // wrist is what a rotation retarget is responsible for, and it largely survives.
  const report = await measure(GREATSWORD_IDLE, '2hm_idle', V3_GREATSWORD_DEFINITION);
  assert.ok(report.source.wristSpan < 0.15, 'the source is a two-handed hold');
  assert.ok(report.wristSpan / report.source.wristSpan < 1.5,
    `the wrist span came out ${(report.wristSpan / report.source.wristSpan).toFixed(2)}x the source's`);
});

test('the sockets now sit where Skyrim puts them', async () => {
  // Was 2.3x. The extractor pulls them to Skyrim's own 6.3% of head-to-root, which is the same
  // fraction on both hands in both committed packs - a constant to aim at, not a number to pick.
  const report = await measure(GREATSWORD_IDLE, '2hm_idle', V3_GREATSWORD_DEFINITION);
  const ratio = report.socketOffset / report.source.offHandSocketOffset;
  assert.ok(ratio > 0.95 && ratio < 1.10, `this rig's socket sits ${ratio.toFixed(3)}x off the wrist`);
});

test('what is left is the retarget\'s own pose error, not the rig\'s', async () => {
  // The equipment span is still wider than the source's, and now it is because the arms come out
  // wider - the wrists at 1.32x - rather than because the sockets are flung out. The off-hand IK
  // closes the remainder; this asserts what it is closing.
  const report = await measure(GREATSWORD_IDLE, '2hm_idle', V3_GREATSWORD_DEFINITION);
  assert.ok(report.wristSpan / report.source.wristSpan > 1.2,
    `wrist span ${(report.wristSpan / report.source.wristSpan).toFixed(2)}x`);
  // No longer the dominant term: before the fix the equipment span was 3.66x against a 1.32x pose.
  assert.ok(report.equipmentSpan / report.source.equipmentSpan < 3);
});

test('and so the off hand does not reach the hilt - the record a fix has to beat', async () => {
  const report = await measure(GREATSWORD_IDLE, '2hm_idle', V3_GREATSWORD_DEFINITION);
  assert.ok(report.worst > TWO_HAND_GRIP_REACH_TOLERANCE, 'this would be the good news, and it is not true yet');
  // Steady across the whole 6.667 s: the gap varies by under 0.01, which is what says this is a
  // fixed offset rather than a pose that swings past the hilt and misses.
  assert.ok(report.worst - report.best < 0.01, `gap varied by ${(report.worst - report.best).toFixed(4)}`);
  // 0.3928 before the sockets were pulled in; 0.2484 after. Still outside the 0.10 tolerance, which
  // is why the off-hand IK stays.
  assert.ok(report.worst > 0.23 && report.worst < 0.27, `worst gap ${report.worst.toFixed(4)}`);
  // Better than the authored pose's 1.26 all the same, and worse than its best of 0.27.
  assert.ok(report.worst < 1.26);
});

test('the measurement uses the mount the game mounts, not the rig default', async () => {
  // The raw DEFAULT_KAYKIT_SWORD_MOUNT is not what a Skyrim-driven fighter carries: bootstrap.js
  // composes it with the clip's own weapon bind correction, and the two differ by 112 degrees.
  // Measuring the wrong one is how the haft came out 73 degrees off instead of 21.
  const report = await measure(GREATSWORD_IDLE, '2hm_idle', V3_GREATSWORD_DEFINITION);
  assert.ok(Math.abs(report.bindCorrectionDegrees - 112.1) < 0.5, `bind correction ${report.bindCorrectionDegrees}`);
  const base = DEFAULT_KAYKIT_SWORD_MOUNT.rotation;
  const used = report.calibratedMount.rotation;
  assert.notDeepEqual([used.x, used.y, used.z], [base.x, base.y, base.z]);
  assert.deepEqual(report.calibratedMount.position, DEFAULT_KAYKIT_SWORD_MOUNT.position);
});

test('the weapon is where the main hand is, so the mount is not what is wrong', async () => {
  // HAND_R sits exactly on PRIMARY_GRIP. Worth asserting, because a constant gap on the OTHER hand
  // is exactly what a bad mount would look like too, and this rules it out.
  const character = createDefaultCharacter(THREE);
  const weapon = createDebugSword(THREE, { definition: V3_GREATSWORD_DEFINITION });
  mountDebugSword(character, weapon, DEFAULT_KAYKIT_SWORD_MOUNT);
  character.object3d.updateMatrixWorld(true);
  weapon.update();
  const hand = new THREE.Vector3();
  const grip = new THREE.Vector3();
  character.sockets.HAND_R.getWorldPosition(hand);
  weapon.sockets.PRIMARY_GRIP.getWorldPosition(grip);
  assert.ok(hand.distanceTo(grip) < 1e-6, `main hand is ${hand.distanceTo(grip)} from the primary grip`);
});

test('SECONDARY_GRIP is now placed from the clip rather than from the longsword', async () => {
  // build/extract-greatsword-geometry.mjs used to derive it as a proportion of the longsword's
  // grip, which put it at 0.0881. The clip says the two equipment points are 0.0983 of a body
  // apart, and this rig's rest head-to-root is 1.2414, so 0.1220.
  const report = await measure(GREATSWORD_IDLE, '2hm_idle', V3_GREATSWORD_DEFINITION);
  const authored = report.source.equipmentSpan * report.stature;
  assert.ok(Math.abs(report.secondaryGripFromMainHand - authored) / authored < 0.10,
    `SECONDARY_GRIP at ${report.secondaryGripFromMainHand.toFixed(4)} against an authored ${authored.toFixed(4)}`);
  assert.ok(report.secondaryGripFromMainHand > 0.11 && report.secondaryGripFromMainHand < 0.13);
});

test('the one-handed guard hold measures as one-handed, which is the control', async () => {
  const report = await measure(GUARD_HOLD, 'shd_blockidle', V3_LONGSWORD_DEFINITION);
  assert.ok(report.source.equipmentSpan > 0.45);
  assert.ok(report.worst > 0.9, `worst gap ${report.worst.toFixed(4)}`);
});
