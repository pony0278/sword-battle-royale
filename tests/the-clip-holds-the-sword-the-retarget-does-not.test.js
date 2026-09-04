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
import { TWO_HAND_GRIP_REACH_TOLERANCE } from '../build/grip-reach.mjs';
import { measureSkyrimGripReach, measureSourceProportions, parseSourceGlb } from '../build/skyrim-grip-reach.mjs';

// handoff/44 pinned the authored two-hand pose failing to reach the hilt - gaps of 0.27 to 1.26 -
// and said a real clip was what it wanted. The real clip arrived. It holds the sword. The retarget
// does not.
//
// That distinction is the whole point of this file. "The off hand is 0.42 from the hilt" would send
// the next person to look for a better animation, and there is nothing wrong with the animation:
// in the source hierarchy the hands are 13.6% of head-to-root height apart, which is two hands on
// one haft. After retargeting they are 30.0% apart. The reach is lost in the bridge, and it is lost
// because a rotation-only retarget does not preserve reach across skeletons with different limb
// proportions - matching every joint angle on a different arm does not put the hand in the same
// place.
//
// So these numbers are a record of failure, kept so a fix has something to beat, exactly as
// handoff/44's were.

const dir = new URL('./', import.meta.url);
const THREE = { ...ThreeModule, GLTFLoader };
const GREATSWORD_IDLE = new URL('../assets/skyrim/greatsword/converted/2hm_idle.source.glb', dir);
const GUARD_HOLD = new URL('../assets/skyrim/guard/converted/shd_blockidle.source.glb', dir);

function entryFor(id) {
  return { id, file: `${id}.source.glb`, clipId: `SKYRIM_SOURCE/${id}`, role: 'measurement' };
}

async function measure(url, id, definition) {
  return measureSkyrimGripReach(THREE, {
    gltf: await parseSourceGlb(THREE, await readFile(url)),
    definition,
    mount: DEFAULT_KAYKIT_SWORD_MOUNT,
    entry: entryFor(id),
    createDefaultCharacter,
    createDebugSword,
    mountDebugSword,
    retargetConvertedSkyrimGltf,
  });
}

test('the source clip really is a two-handed hold, and the shield clip really is not', async () => {
  const greatsword = measureSourceProportions(THREE, await parseSourceGlb(THREE, await readFile(GREATSWORD_IDLE)));
  const guard = measureSourceProportions(THREE, await parseSourceGlb(THREE, await readFile(GUARD_HOLD)));
  // Both read off the untouched source hierarchy, as a fraction of each skeleton's own height, so
  // the two are comparable without anyone choosing a scale.
  assert.ok(greatsword.handsApart < 0.20, `2hm_idle hands ${(greatsword.handsApart * 100).toFixed(1)}% apart`);
  assert.ok(guard.handsApart > 0.45, `shd_blockidle hands ${(guard.handsApart * 100).toFixed(1)}% apart`);
  // The control matters: without it, "the hands are close" could be a property of the measurement
  // rather than of the clip.
  assert.ok(guard.handsApart > greatsword.handsApart * 3);
});

test('the retarget loses the hold: the hands come out more than twice as far apart', async () => {
  const report = await measure(GREATSWORD_IDLE, '2hm_idle', V3_GREATSWORD_DEFINITION);
  assert.ok(report.source.handsApart < 0.15, 'the source is a two-handed hold');
  assert.ok(report.handsApart > 0.28, `retargeted hands ${(report.handsApart * 100).toFixed(1)}% apart`);
  assert.ok(report.handsApart / report.source.handsApart > 2,
    `the retarget inflated the hand separation ${(report.handsApart / report.source.handsApart).toFixed(2)}x`);
});

test('and so the off hand does not reach the hilt - the record a fix has to beat', async () => {
  const report = await measure(GREATSWORD_IDLE, '2hm_idle', V3_GREATSWORD_DEFINITION);
  assert.ok(report.worst > TWO_HAND_GRIP_REACH_TOLERANCE, 'this would be the good news, and it is not true yet');
  // Steady across the whole 6.667 s: the gap varies by under 2% of itself, which is what says this
  // is a fixed offset rather than a pose that swings past the hilt and misses.
  assert.ok(report.worst - report.best < 0.01, `gap varied by ${(report.worst - report.best).toFixed(4)}`);
  assert.ok(report.worst > 0.40 && report.worst < 0.45, `worst gap ${report.worst.toFixed(4)}`);
  // Better than the authored pose's 1.26 all the same, and worse than its best of 0.27.
  assert.ok(report.worst < 1.26);
});

test('the weapon is where the hand is, so the mount is not what is wrong', async () => {
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

test('SECONDARY_GRIP is closer to the primary than a Skyrim two-hand grip actually is', async () => {
  // The second, smaller finding, and it is independent of the retarget. The greatsword's second
  // grip node was placed proportionally from the longsword's; the source clip says how far apart a
  // real two-handed hold puts the hands, and since the main hand sits exactly on PRIMARY_GRIP
  // (asserted above), that separation is where SECONDARY_GRIP belongs.
  const report = await measure(GREATSWORD_IDLE, '2hm_idle', V3_GREATSWORD_DEFINITION);
  const authoredSeparation = report.source.handsApart * report.stature;
  assert.ok(authoredSeparation > 0.18, `the source separates the hands by ${authoredSeparation.toFixed(4)}`);
  assert.ok(report.secondaryGripFromMainHand < authoredSeparation * 0.75,
    `SECONDARY_GRIP sits ${report.secondaryGripFromMainHand.toFixed(4)} from the main hand, against ${authoredSeparation.toFixed(4)} authored`);
});

test('the one-handed guard hold measures as one-handed, which is the control', async () => {
  const report = await measure(GUARD_HOLD, 'shd_blockidle', V3_LONGSWORD_DEFINITION);
  assert.ok(report.source.handsApart > 0.45);
  assert.ok(report.worst > 1.0, `worst gap ${report.worst.toFixed(4)}`);
  // The inflation is systematic rather than a greatsword problem: this clip is stretched too.
  assert.ok(report.handsApart > report.source.handsApart * 1.3);
});
