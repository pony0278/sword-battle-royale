import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { KAYKIT_RIG_MEDIUM_DEFINITION } from '../src/character/kaykit-rig-definition.js';
import {
  UAL2_ANIMATION_FILES,
  UAL2_BONE_RETARGETS,
} from '../src/animation/ual2-animation-library.js';

function parseGlbJson(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      return JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString('utf8').trim());
    }
    offset += 8 + length;
  }
  throw new Error('GLB has no JSON chunk');
}

test('UAL2 retarget map covers valid procedural targets without duplicates', () => {
  const targets = UAL2_BONE_RETARGETS.map((entry) => entry.target);
  const knownTargets = new Set(KAYKIT_RIG_MEDIUM_DEFINITION.bones.map((bone) => bone.id));
  assert.equal(new Set(targets).size, targets.length);
  UAL2_BONE_RETARGETS.forEach(({ target }) => assert.ok(knownTargets.has(target), target));
  assert.deepEqual(
    UAL2_BONE_RETARGETS.filter((entry) => entry.position).map((entry) => entry.target),
    ['root', 'hips'],
  );
});

test('all selected no-root-motion UAL2 clips contain the retarget source hierarchy', async () => {
  assert.equal(UAL2_ANIMATION_FILES.length, 8);
  const base = new URL('../assets/UAL2_Sword_Combat_Package/Animation_Only/No_Root_Motion/', import.meta.url);
  for (const entry of UAL2_ANIMATION_FILES) {
    const glb = parseGlbJson(await readFile(new URL(entry.file, base)));
    const nodeNames = new Set((glb.nodes || []).map((node) => node.name));
    const animationNames = (glb.animations || []).map((animation) => animation.name);
    assert.deepEqual(animationNames, [entry.id]);
    UAL2_BONE_RETARGETS.forEach(({ source }) => {
      assert.ok(nodeNames.has(source), `${entry.id} is missing ${source}`);
    });
  }
});

test('UAL2 package is explicitly distributable as CC0', async () => {
  const license = await readFile(new URL('../assets/UAL2_Sword_Combat_Package/License.txt', import.meta.url), 'utf8');
  assert.match(license, /CC0 1\.0 Universal/);
  assert.match(license, /Public Domain Dedication/);
});
