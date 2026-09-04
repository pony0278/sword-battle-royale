import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { KAYKIT_RIG_MEDIUM_DEFINITION } from '../src/character/kaykit-rig-definition.js';
import {
  ROOT_ROTATION_POLICIES,
  filterAnimationTracksForInPlace,
  normalizeRootRotationPolicy,
} from '../src/animation/kaykit-animation-library.js';

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

test('all extracted KayKit animation channels target generated bones', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/kaykit/manifest.json', import.meta.url), 'utf8'));
  const boneIds = new Set(KAYKIT_RIG_MEDIUM_DEFINITION.bones.map((bone) => bone.id));
  for (const pack of manifest.packs) {
    const glb = parseGlbJson(await readFile(new URL(`../assets/kaykit/${pack.file}`, import.meta.url)));
    for (const animation of glb.animations || []) {
      for (const channel of animation.channels || []) {
        const targetName = glb.nodes[channel.target.node]?.name;
        assert.ok(boneIds.has(targetName), `${pack.id}/${animation.name} targets ${targetName}`);
        assert.ok(['translation', 'rotation', 'scale'].includes(channel.target.path));
      }
    }
  }
});

test('G3.4.2R in-place policy always removes root translation and only locks root quaternion on demand', () => {
  const tracks = [
    { name: 'root.position' },
    { name: 'root.quaternion' },
    { name: 'hips.position' },
    { name: 'hips.quaternion' },
    { name: 'upperarmr.quaternion' },
  ];

  const preserved = filterAnimationTracksForInPlace(tracks);
  assert.deepEqual(preserved.map((track) => track.name), [
    'root.quaternion',
    'hips.position',
    'hips.quaternion',
    'upperarmr.quaternion',
  ]);

  const locked = filterAnimationTracksForInPlace(tracks, {
    rootRotationPolicy: ROOT_ROTATION_POLICIES.LOCK,
  });
  assert.deepEqual(locked.map((track) => track.name), [
    'hips.position',
    'hips.quaternion',
    'upperarmr.quaternion',
  ]);
  assert.equal(normalizeRootRotationPolicy('lock'), ROOT_ROTATION_POLICIES.LOCK);
  assert.equal(normalizeRootRotationPolicy('unexpected'), ROOT_ROTATION_POLICIES.PRESERVE);
});
