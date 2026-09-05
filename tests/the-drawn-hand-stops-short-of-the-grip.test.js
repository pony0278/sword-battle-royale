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

// "The left hand is not touching the greatsword" - reported from the page, and true, and not what
// any measurement here was measuring.
//
// The off-hand IK aims the HAND_L SOCKET at the weapon's SECONDARY_GRIP and lands on it exactly:
// 0.0000, in every mode the built page offers, bind and preview alike. But the socket is not drawn.
// kaykit-v3-line-appearance.js draws the arm out to `hand.l` and stops, and `handslot.l` - which is
// where the socket lives, and where equipment actually hangs - is 0.1120 further on.
//
// So the line ends 0.1120 short of a hilt the hand is holding. The RIGHT hand has the same gap, and
// reads as fine only because the sword is mounted there anyway; the left one had an IK visibly
// reaching for something, which is what made it obvious.
//
// This is the socket offset (handoff/46) wearing its third face: the same 0.1794 off the wrist that
// makes the grip span 3.66x the source's and drops the main hand 16.5 points below where the clip
// puts it. Pinned rather than fixed, because closing it moves every weapon and shield on every clip.

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

test('MEASURED: the drawn arm stops 0.1120 short of it, on BOTH hands', async () => {
  // The record. Not a rendering bug to chase in the appearance code - the line is drawn correctly
  // to the bone it is told to draw to. The bone is not where the hand holds things.
  const { character, weapon, at } = await heldGreatsword();
  const left = at(character.rig.bones[DRAWN_ARM_TIP.left]).distanceTo(at(weapon.sockets.SECONDARY_GRIP));
  const right = at(character.rig.bones[DRAWN_ARM_TIP.right]).distanceTo(at(weapon.sockets.PRIMARY_GRIP));
  assert.equal(left.toFixed(4), '0.1120');
  assert.equal(right.toFixed(4), '0.1120');
  // Both hands, the same gap: it is the rig's, not the greatsword's and not the IK's.
  assert.equal(left.toFixed(4), right.toFixed(4));
});

test('and the gap is exactly the handslot offset, which is what names the cause', async () => {
  const { character, at } = await heldGreatsword();
  for (const side of ['l', 'r']) {
    const drawn = at(character.rig.bones[`hand.${side}`]);
    const socket = at(character.rig.bones[`handslot.${side}`]);
    assert.equal(drawn.distanceTo(socket).toFixed(4), '0.1120');
    // And the whole offset off the wrist, the number handoff/46 measured at 2.3x Skyrim's.
    assert.equal(at(character.rig.bones[`wrist.${side}`]).distanceTo(socket).toFixed(4), '0.1794');
  }
});

test('the line body draws to hand.l, and handslot.l is not in it', async () => {
  // Read as behaviour rather than text: the appearance is asked which bones it joins, by asking the
  // rig which bones exist and checking the one that carries equipment is past the drawn tip.
  const { character } = await heldGreatsword();
  assert.ok(character.rig.bones[DRAWN_ARM_TIP.left], 'the drawn tip bone must exist');
  assert.ok(character.rig.bones['handslot.l'], 'the socket bone must exist');
  assert.equal(character.rig.bones['handslot.l'].parent.name, character.rig.bones[DRAWN_ARM_TIP.left].name,
    'handslot.l hangs off the drawn tip, so extending the drawn chain by one would close the gap');
});
