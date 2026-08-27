import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  UAL1_ANIMATION_FILES,
  UAL1_BONE_RETARGETS,
} from '../src/animation/ual1-animation-library.js';
import { UAL2_BONE_RETARGETS } from '../src/animation/ual2-animation-library.js';

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

test('UAL1 reuses the Quaternius humanoid retarget contract used by UAL2', () => {
  assert.deepEqual(UAL1_BONE_RETARGETS, UAL2_BONE_RETARGETS);
  assert.deepEqual(UAL1_ANIMATION_FILES.map((entry) => entry.id), ['Sword_Attack', 'Sword_Idle']);
});

test('all available no-root-motion UAL1 clips contain the retarget source hierarchy', async () => {
  const base = new URL('../assets/UAL1_Animation_Split_Package/Animation_Only/No_Root_Motion/', import.meta.url);
  for (const entry of UAL1_ANIMATION_FILES) {
    const glb = parseGlbJson(await readFile(new URL(entry.file, base)));
    const nodeNames = new Set((glb.nodes || []).map((node) => node.name));
    assert.deepEqual((glb.animations || []).map((animation) => animation.name), [entry.id]);
    UAL1_BONE_RETARGETS.forEach(({ source }) => {
      assert.ok(nodeNames.has(source), `${entry.id} is missing ${source}`);
    });
  }
});

test('UAL1 manifest matches the two split GLBs shipped in this checkout', async () => {
  const manifest = JSON.parse(await readFile(
    new URL('../assets/UAL1_Animation_Split_Package/manifest.json', import.meta.url),
    'utf8',
  ));
  const availableIds = UAL1_ANIMATION_FILES.map((entry) => entry.id);
  assert.equal(manifest.animation_count, 2);
  assert.equal(manifest.animations.length, 2);
  assert.deepEqual(manifest.animations.map((entry) => entry.name), availableIds);
  assert.deepEqual(availableIds, ['Sword_Attack', 'Sword_Idle']);
  const license = await readFile(new URL('../assets/UAL1_Animation_Split_Package/License.txt', import.meta.url), 'utf8');
  assert.match(license, /CC0 1\.0 Universal/);
  assert.match(license, /Public Domain Dedication/);
});
