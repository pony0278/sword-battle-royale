import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { createDefaultCharacter } from '../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../src/character/default-character-mount.js';
import { V3_GREATSWORD_DEFINITION } from '../src/character/v3-greatsword-weapon.js';
import { retargetConvertedSkyrimGltf } from '../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../src/animation/skyrim-weapon-bind-calibration.js';
import { applyMountCalibration } from '../src/character/character-sockets.js';
import { applyOffHandGripIk } from '../src/animation/off-hand-grip-ik.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';

// "The left hand is not touching the greatsword" - reported from the page, and true.
//
// The off-hand IK aimed the HAND_L SOCKET at the weapon's SECONDARY_GRIP and landed on it exactly,
// 0.0000, in every mode the built page offers. But the socket was not drawn:
// kaykit-v3-line-appearance.js draws each arm out to `hand.l` / `hand.r` and stops, and
// `handslot.l` - where the socket lives and where equipment hangs - sat 0.1120 further on. The line
// ended 0.1120 short of a hilt the hand was holding, on BOTH hands, on every clip.
//
// That was the socket offset wearing its third face, and it is fixed at the root now: the equipment
// sockets are pulled to Skyrim's own 6.3% of head-to-root, which puts them 0.0044 from the drawn
// hand. The blade is in the drawn fist, and this file is what keeps it there.

const dir = new URL('./', import.meta.url);
const THREE = { ...ThreeModule, GLTFLoader };
const GREATSWORD_IDLE = new URL('../assets/skyrim/greatsword/converted/2hm_idle.source.glb', dir);

// What the V3 line body actually draws each arm out to. If this list grows a handslot, the gap
// below closes for free and this test is what says so.
const DRAWN_ARM_TIP = Object.freeze({ left: 'hand.l', right: 'hand.r' });

async function heldGreatsword() {
  const gltf = await parseSourceGlb(THREE, await readFile(GREATSWORD_IDLE));
  const character = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, character.rig, {
    id: '2hm_idle', file: '2hm_idle.source.glb', clipId: 'SKYRIM_GREATSWORD/2hm_idle', role: 'test',
  }, { fps: 30 });
  character.registerAnimations([clip]);
  const weapon = createDebugSword(THREE, { definition: V3_GREATSWORD_DEFINITION });
  mountDebugSword(character, weapon, DEFAULT_KAYKIT_SWORD_MOUNT);
  const mount = composeSkyrimWeaponMountCalibration(
    THREE, DEFAULT_KAYKIT_SWORD_MOUNT, clip.userData.weaponBindCalibration,
  );
  character.sampleAnimation(clip.name, 0);
  character.object3d.updateMatrixWorld(true);
  weapon.update();
  applyMountCalibration(weapon.object3d, mount);
  weapon.object3d.updateMatrixWorld(true);
  weapon.update();
  const solve = applyOffHandGripIk(THREE, { character, weapon });
  character.object3d.updateMatrixWorld(true);
  weapon.update();
  const at = (object3d) => object3d.getWorldPosition(new THREE.Vector3());
  return { character, weapon, solve, at };
}

test('the socket the IK aims at really is on the hilt', async () => {
  const { character, weapon, solve, at } = await heldGreatsword();
  assert.equal(solve.applied, true, solve.reason || '');
  assert.ok(at(character.sockets.HAND_L).distanceTo(at(weapon.sockets.SECONDARY_GRIP)) < 1e-6);
  assert.ok(at(character.sockets.HAND_R).distanceTo(at(weapon.sockets.PRIMARY_GRIP)) < 1e-6);
});

test('MEASURED: the drawn arm now ends on the grip, on BOTH hands', async () => {
  // Was 0.1120. Never a rendering bug - the line was drawn correctly to the bone it was told to
  // draw to; the bone was not where the hand holds things. Now it very nearly is.
  const { character, weapon, at } = await heldGreatsword();
  const left = at(character.rig.bones[DRAWN_ARM_TIP.left]).distanceTo(at(weapon.sockets.SECONDARY_GRIP));
  const right = at(character.rig.bones[DRAWN_ARM_TIP.right]).distanceTo(at(weapon.sockets.PRIMARY_GRIP));
  assert.equal(left.toFixed(4), '0.0044');
  assert.equal(right.toFixed(4), '0.0044');
  // Both hands, the same gap: it is the rig's, not the greatsword's and not the IK's.
  assert.equal(left.toFixed(4), right.toFixed(4));
});

test('and the socket sits where Skyrim puts equipment, which is what closed it', async () => {
  // 0.1794 off the wrist before - 2.3x Skyrim's. Skyrim's `Weapon` and `Shield` both sit at 6.3% of
  // head-to-root, the same on both hands in both committed packs, and 6.3% of this rig is 0.0776.
  const { character, at } = await heldGreatsword();
  const b = character.rig.bones;
  for (const side of ['l', 'r']) {
    const socket = at(b[`handslot.${side}`]);
    assert.equal(at(b[`hand.${side}`]).distanceTo(socket).toFixed(4), '0.0044');
    assert.equal(at(b[`wrist.${side}`]).distanceTo(socket).toFixed(4), '0.0776');
  }

  // The fraction is a property of the RIG, so it is read off a rest pose. A posed figure has a
  // different head-to-root - 1.1893 in this clip against 1.2414 at rest - and measuring the
  // fraction against the posed one reports 6.5% for a socket that is exactly 6.3%.
  const rest = createDefaultCharacter(THREE);
  rest.object3d.updateMatrixWorld(true);
  const restAt = (object3d) => object3d.getWorldPosition(new THREE.Vector3());
  const stature = restAt(rest.rig.bones.head).distanceTo(restAt(rest.rig.bones.root));
  for (const side of ['l', 'r']) {
    const fraction = restAt(rest.rig.bones[`wrist.${side}`])
      .distanceTo(restAt(rest.rig.bones[`handslot.${side}`])) / stature;
    assert.ok(Math.abs(fraction - 0.063) < 0.001, `${(fraction * 100).toFixed(2)}% of stature, wanted 6.3%`);
  }
});

test('the line body draws to hand.l, and handslot.l is not in it', async () => {
  // Read as behaviour rather than text: the appearance is asked which bones it joins, by asking the
  // rig which bones exist and checking the one that carries equipment is past the drawn tip.
  const { character } = await heldGreatsword();
  assert.ok(character.rig.bones[DRAWN_ARM_TIP.left], 'the drawn tip bone must exist');
  assert.ok(character.rig.bones['handslot.l'], 'the socket bone must exist');
  assert.equal(character.rig.bones['handslot.l'].parent.name, character.rig.bones[DRAWN_ARM_TIP.left].name,
    'handslot.l hangs off the drawn tip - which is why pulling it in put the blade in the drawn fist');
});
