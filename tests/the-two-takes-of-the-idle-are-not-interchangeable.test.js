import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { createDefaultCharacter } from '../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../src/character/default-character-mount.js';
import { V3_GREATSWORD_DEFINITION } from '../src/character/v3-greatsword-weapon.js';
import { retargetConvertedSkyrimGltf, SKYRIM_GREATSWORD_CONVERTED_FILES } from '../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../src/animation/skyrim-weapon-bind-calibration.js';
import { applyOffHandGripIk } from '../src/animation/off-hand-grip-ik.js';
import { measureSkyrimGripReach, parseSourceGlb } from '../build/skyrim-grip-reach.mjs';

// Two files arrived carrying the same animation name, 2hm_idle, from different .hkx sources. Same
// skeleton, same 46 retarget curves, same 198 channels - and one holds the greatsword in both hands
// while the other cannot be made to.
//
// Both are committed and both load in Action Studio, because being able to LOOK at the difference
// is the point. What this file prevents is the quiet swap: `2hm_idle_alt` is a clip the studio can
// select, and nothing else in the repository would notice if it became the one the game plays.
//
// The measurement is the shared one, so these numbers are the same numbers
// build/measure-skyrim-grip-reach.mjs prints.
//
// UNEXPLAINED, and deliberately recorded rather than smoothed over: the alt take's wrist-to-wrist
// span survives the retarget almost perfectly (0.99x the source, against the adopted take's 1.20x),
// and its equipment points still spread to 2.84x. Hands in the right places, sockets pointing
// apart. That is hand ORIENTATION, not scale, and nobody has yet worked out why.

const dir = new URL('./', import.meta.url);
const THREE = { ...ThreeModule, GLTFLoader };
const REACHED = 0.1;

async function measure(file, entry) {
  const gltf = await parseSourceGlb(THREE, await readFile(new URL(`../assets/skyrim/greatsword/converted/${file}`, dir)));
  return measureSkyrimGripReach(THREE, {
    gltf,
    definition: V3_GREATSWORD_DEFINITION,
    mount: DEFAULT_KAYKIT_SWORD_MOUNT,
    entry,
    createDefaultCharacter,
    createDebugSword,
    mountDebugSword,
    retargetConvertedSkyrimGltf,
    composeSkyrimWeaponMountCalibration,
    applyOffHandGripIk,
  });
}

const entryFor = (id) => {
  const entry = SKYRIM_GREATSWORD_CONVERTED_FILES.find((candidate) => candidate.id === id);
  assert.ok(entry, `the greatsword pack no longer carries ${id}`);
  return entry;
};

test('both takes are loadable from the greatsword pack', () => {
  // The alt take being selectable is what makes the swap possible, so the swap is what gets tested.
  assert.deepEqual(
    SKYRIM_GREATSWORD_CONVERTED_FILES.map((entry) => entry.id).sort(),
    ['2hm_idle', '2hm_idle_alt'],
  );
});

test('the adopted take puts the off hand on the hilt for the whole clip', async () => {
  const reach = await measure('2hm_idle.source.glb', entryFor('2hm_idle'));
  assert.ok(reach.duration > 6 && reach.duration < 7, `expected the 6.667 s take, got ${reach.duration}`);
  assert.ok(reach.worst <= REACHED, `worst gap ${reach.worst.toFixed(4)} is outside ${REACHED}`);
  assert.equal(reach.offHandGrip.applied, true, `IK refused: ${reach.offHandGrip.refused.join(', ')}`);
});

test('the alt take does not, and the IK refuses rather than forcing the arm', async () => {
  const reach = await measure('2hm_idle_alt.source.glb', entryFor('2hm_idle_alt'));
  assert.ok(reach.duration > 2 && reach.duration < 3, `expected the 2.5 s take, got ${reach.duration}`);

  // The failure, held at the value it was measured at. A change that closes this gap is welcome -
  // it just has to come here and say so, rather than arriving as a silent improvement nobody sees.
  assert.ok(reach.worst > REACHED, `the alt take now reaches (worst ${reach.worst.toFixed(4)}); if that is intended, adopt it`);

  // Refusing is the guard behaving. An IK that "succeeded" here would have bent the arm to a target
  // it cannot reach, which is the failure mode the budget and the refusal exist to prevent.
  assert.equal(reach.offHandGrip.applied, false);
  assert.ok(
    reach.offHandGrip.refused.includes('out-of-reach'),
    `expected an out-of-reach refusal, got ${JSON.stringify(reach.offHandGrip.refused)}`,
  );
  assert.equal(reach.offHandGrip.worstShoulderDegrees, 0, 'a refused solve must leave the arm alone');
  assert.equal(reach.offHandGrip.worstElbowDegrees, 0, 'a refused solve must leave the arm alone');
});

test('the alt take is faithful at the wrists and wrong at the sockets', async () => {
  // The two halves of the anomaly, asserted together because either alone reads as noise.
  const reach = await measure('2hm_idle_alt.source.glb', entryFor('2hm_idle_alt'));
  const wristRatio = reach.wristSpan / reach.source.wristSpan;
  const equipmentRatio = reach.equipmentSpan / reach.source.equipmentSpan;
  assert.ok(
    wristRatio > 0.9 && wristRatio < 1.1,
    `wrist span should survive the retarget, got ${wristRatio.toFixed(2)}x`,
  );
  assert.ok(
    equipmentRatio > 2,
    `the socket spread is the anomaly worth keeping; got ${equipmentRatio.toFixed(2)}x`,
  );
});
