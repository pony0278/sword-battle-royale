import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { pruneForeignAnimationTracks } from '../build/prune-foreign-animation-tracks.mjs';
import { parseGlb, buildGlb } from '../build/strip-presentation-meshes.mjs';
import { validateSkyrimSourceGlb } from '../tools/skyrim-hkx-bridge/validate-source-glb.mjs';

// A Skyrim animation pack is not necessarily authored against the skeleton you bake it with.
//
// 2hm_idle.hkx carries 210 transform tracks; the skeleton.hkx that the guard pack was frozen
// against declares 99 animation bones. The exporter numbers channels by track index, so the
// surplus tracks came out as 184 channels pointing at nodes 118..209 - which do not exist - plus
// 39 landing on the ragdoll skeleton and on the wrapper node above the bones.
//
// The bake was still usable: bone offsets are the skeleton's own lengths, and all 23 retarget
// bones matched shd_blockidle's to every decimal except the WEAPON node, which is the one a
// two-handed clip is meant to place differently. So the surplus is pruned rather than the pair
// refused - and the two ways that could go wrong are what this file is about. Pruning too little
// leaves a channel on a node that moves the whole character. Pruning too much silently drops a
// bone the fight reads.

const dir = new URL('./', import.meta.url);
const GUARD_BAKES = [
  '../assets/skyrim/guard/converted/shd_blockidle.source.glb',
  '../assets/skyrim/guard/converted/shd_blockhit.source.glb',
  '../assets/skyrim/guard/converted/shd_blockbash.source.glb',
  '../assets/skyrim/guard/converted/shd_blockbashpower.source.glb',
];
const GREATSWORD_IDLE = new URL('../assets/skyrim/greatsword/converted/2hm_idle.source.glb', dir);

// The shape every reviewed source bake has: one channel per bone per animated path, on the bones
// and nothing else.
const REVIEWED_SHAPE = Object.freeze({ channels: 198, animatedNodes: 99, highestNodeIndex: 98 });

// A source bake in miniature: a wrapper scene root named after the root bone it parents, the bone
// chain under it, a separate ragdoll root, and one channel per track.
function syntheticBake({ bones = 4, tracks = 4, wrapperName = 'NPC Root [Root]' } = {}) {
  const nodes = [];
  for (let index = 0; index < bones; index += 1) {
    nodes.push({ name: index === 0 ? 'NPC Root [Root]' : `Bone${index}`, children: index + 1 < bones ? [index + 1] : [] });
  }
  const ragdollRoot = nodes.length;
  nodes.push({ name: 'Ragdoll_NPC COM [COM ]', children: [ragdollRoot + 1] });
  nodes.push({ name: 'Ragdoll_NPC Spine [Spn0]', children: [] });
  const wrapper = nodes.length;
  nodes.push({ name: wrapperName, children: [0] });

  const times = Buffer.alloc(4);
  times.writeFloatLE(0, 0);
  const values = Buffer.alloc(16);
  [0, 0, 0, 1].forEach((value, index) => values.writeFloatLE(value, index * 4));
  const bin = Buffer.concat([times, values]);

  const json = {
    asset: { version: '2.0' },
    scenes: [{ nodes: [wrapper, ragdollRoot] }],
    scene: 0,
    nodes,
    // One track per index, however many the clip claims - which is the failure being modelled:
    // a track index past the end of the node array.
    animations: [{
      name: 'synthetic',
      samplers: [{ input: 0, output: 1 }],
      channels: Array.from({ length: tracks }, (_unused, index) => ({ sampler: 0, target: { node: index, path: 'rotation' } })),
    }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 4 },
      { buffer: 0, byteOffset: 4, byteLength: 16 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, type: 'SCALAR', count: 1 },
      { bufferView: 1, componentType: 5126, type: 'VEC4', count: 1 },
    ],
  };
  return buildGlb(json, bin);
}

function channelTargets(buffer) {
  const { json } = parseGlb(Buffer.from(buffer));
  return json.animations[0].channels.map((channel) => json.nodes[channel.target.node].name);
}

test('a bake whose skeleton matches its clip is returned untouched, byte for byte', async () => {
  for (const relativePath of GUARD_BAKES) {
    const original = await readFile(new URL(relativePath, dir));
    const result = pruneForeignAnimationTracks(original);
    assert.equal(result.removed, 0, relativePath);
    // Not "equivalent": identical. These four are reviewed, committed artifacts, and a pruner that
    // rewrites them - even losslessly - would put a diff in front of a reviewer for no reason.
    assert.ok(original.equals(result.buffer), `${relativePath} was rewritten`);
  }
});

test('tracks numbered past the end of the node array are dropped', () => {
  // Seven nodes exist; the clip claims twelve tracks.
  const result = pruneForeignAnimationTracks(syntheticBake({ bones: 4, tracks: 12 }));
  assert.equal(result.dangling, 5);
  assert.deepEqual(channelTargets(result.buffer), ['NPC Root [Root]', 'Bone1', 'Bone2', 'Bone3']);
});

test('the ragdoll skeleton is not a place an animation track may land', () => {
  const result = pruneForeignAnimationTracks(syntheticBake({ bones: 4, tracks: 6 }));
  assert.equal(result.outsideSkeleton, 2);
  assert.equal(result.dangling, 0);
  assert.ok(!channelTargets(result.buffer).some((name) => name.startsWith('Ragdoll_')));
});

test('the wrapper the exporter puts above the bones is not a bone', () => {
  // This is the one a name test missed. Node 6 is the scene root, it is named "NPC Root [Root]"
  // like the bone it parents, and it carries the entire character: a foreign track there would
  // move the whole body and look like a bug in the retarget.
  const result = pruneForeignAnimationTracks(syntheticBake({ bones: 4, tracks: 7 }));
  assert.equal(result.keptChannels, 4);
  assert.equal(channelTargets(result.buffer).length, 4);
});

test('a scene root that is really the root bone keeps its track', () => {
  // The safety on the rule above. If the exporter did NOT duplicate the name, the outermost node is
  // the root bone itself, and dropping it would throw away root motion.
  const result = pruneForeignAnimationTracks(syntheticBake({ bones: 4, tracks: 7, wrapperName: 'Scene' }));
  assert.equal(result.keptChannels, 5);
  assert.ok(channelTargets(result.buffer).includes('Scene'));
});

test('the review validator refuses a bake with tracks pointing nowhere', () => {
  const overshot = validateSkyrimSourceGlb(syntheticBake({ bones: 4, tracks: 12 }), { filename: 'synthetic.glb' });
  assert.equal(overshot.danglingChannelCount, 5);
  assert.equal(overshot.acceptedForG23Review, false);
});

test('the shipped greatsword idle has the shape the reviewed guard bakes have', async () => {
  const { json } = parseGlb(await readFile(GREATSWORD_IDLE));
  const targets = json.animations[0].channels.map((channel) => channel.target.node);
  assert.equal(json.animations[0].channels.length, REVIEWED_SHAPE.channels);
  assert.equal(new Set(targets).size, REVIEWED_SHAPE.animatedNodes);
  assert.equal(Math.max(...targets), REVIEWED_SHAPE.highestNodeIndex);

  const guard = parseGlb(await readFile(new URL(GUARD_BAKES[0], dir))).json;
  const guardTargets = guard.animations[0].channels.map((channel) => channel.target.node);
  // Same bones, in the same order, animated by both - which is the claim that the greatsword's
  // track numbering survived coming from a clip with more tracks than this skeleton has bones.
  assert.deepEqual([...new Set(targets)].sort((a, b) => a - b), [...new Set(guardTargets)].sort((a, b) => a - b));
});

test('the greatsword idle was pruned, not merely accepted', async () => {
  // Running the pruner again must find nothing: the committed asset is the pruned one.
  const again = pruneForeignAnimationTracks(await readFile(GREATSWORD_IDLE));
  assert.equal(again.removed, 0);
  const validation = validateSkyrimSourceGlb(await readFile(GREATSWORD_IDLE), { filename: '2hm_idle.source.glb' });
  assert.equal(validation.acceptedForG23Review, true);
  assert.equal(validation.danglingChannelCount, 0);
});
