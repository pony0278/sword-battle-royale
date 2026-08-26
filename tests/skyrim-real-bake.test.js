import test from 'node:test';
import assert from 'node:assert/strict';

import {
  G231_SOURCE_BONES,
  inspectRealBakePair,
} from '../tools/skyrim-hkx-bridge/real-bake-contract.mjs';
import {
  normalizeSourceNodeName,
  validateSkyrimSourceGlb,
} from '../tools/skyrim-hkx-bridge/validate-source-glb.mjs';

function syntheticSkeleton(overrides = {}) {
  const excluded = new Set(overrides.excludeBones || []);
  return Buffer.from([
    'hk_2010.2.0-r1',
    'hkaAnimationContainer',
    'hkaSkeleton',
    ...G231_SOURCE_BONES.filter((bone) => !excluded.has(bone.id)).map((bone) => bone.aliases[0]),
  ].join('\0'), 'ascii');
}

function syntheticAnimation(overrides = {}) {
  return Buffer.from([
    overrides.version || 'hk_2010.2.0-r1',
    'hkaAnimationContainer',
    'hkaSplineCompressedAnimation',
    'hkaAnimationBinding',
    'NPC Root [Root]',
  ].join('\0'), 'ascii');
}

function makeGlb(json) {
  let text = JSON.stringify(json);
  text += ' '.repeat((4 - (Buffer.byteLength(text) % 4)) % 4);
  const jsonBytes = Buffer.from(text, 'utf8');
  const glb = Buffer.alloc(12 + 8 + jsonBytes.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.byteLength, 8);
  glb.writeUInt32LE(jsonBytes.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(glb, 20);
  return glb;
}

function sourceGlbJson(options = {}) {
  const nodes = G231_SOURCE_BONES.map((bone, index) => ({
    name: options.sanitizedNames
      ? bone.aliases[0].replace(/[^A-Za-z0-9]+/g, '_')
      : bone.aliases[0],
    ...(index + 1 < G231_SOURCE_BONES.length ? { children: [index + 1] } : {}),
  }));
  const channels = nodes.map((_node, index) => ({ sampler: 0, target: { node: index, path: 'rotation' } }));
  return {
    asset: { version: '2.0' },
    nodes,
    animations: [{ name: 'shd_blockidle', samplers: [{ input: 0, output: 1 }], channels }],
    buffers: [{ byteLength: 0, ...(options.externalBuffer ? { uri: 'motion.bin' } : {}) }],
  };
}

test('G2.3.1 accepts a Skyrim LE skeleton/animation pair with all 19 source semantics', () => {
  const report = inspectRealBakePair(syntheticSkeleton(), syntheticAnimation());
  assert.equal(report.acceptedForRealBake, true);
  assert.equal(report.sameHavokGeneration, true);
  assert.equal(report.skeleton.semanticBoneCount, 19);
  assert.deepEqual(report.skeleton.missingBones, []);
  assert.equal(report.outputContract.sourceGlb, 'shd_blockidle.source.glb');
  assert.equal(report.outputContract.canonicalClipId, 'SKYRIM_GUARD/shd_blockidle');
});

test('G2.3.1 rejects a pair when a required source semantic is missing', () => {
  const report = inspectRealBakePair(syntheticSkeleton({ excludeBones: ['upperarm.l'] }), syntheticAnimation());
  assert.equal(report.acceptedForRealBake, false);
  assert.deepEqual(report.skeleton.missingBones, ['upperarm.l']);
});

test('source GLB name normalization accepts Blender/glTF sanitized Skyrim node names', () => {
  assert.equal(normalizeSourceNodeName('NPC L UpperArm [LUar]'), normalizeSourceNodeName('NPC_L_UpperArm_LUar_'));
});

test('G2.3.1 accepts a self-contained source GLB with Skyrim hierarchy and animation channels', () => {
  const report = validateSkyrimSourceGlb(makeGlb(sourceGlbJson({ sanitizedNames: true })));
  assert.equal(report.acceptedForG23Review, true);
  assert.equal(report.selfContained, true);
  assert.equal(report.semanticBoneCount, 19);
  assert.equal(report.animationCount, 1);
  assert.equal(report.animations[0].animatedSemanticCount, 19);
});

test('G2.3.1 rejects a source GLB that still depends on an external binary buffer', () => {
  const report = validateSkyrimSourceGlb(makeGlb(sourceGlbJson({ externalBuffer: true })));
  assert.equal(report.acceptedForG23Review, false);
  assert.equal(report.selfContained, false);
  assert.deepEqual(report.externalUris, ['motion.bin']);
});
