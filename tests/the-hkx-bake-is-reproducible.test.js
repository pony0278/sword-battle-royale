import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { collectRetargetCurves, compareSourceBakes } from '../build/compare-source-bakes.mjs';
import { SKYRIM_BONE_RETARGETS } from '../src/animation/skyrim-animation-retarget.js';

// The reason output from tools/skyrim-hkx-bridge/convert-hkx.mjs can be trusted.
//
// The four committed guard GLBs were baked in 2025 through Blender and reviewed by hand, and
// g2-3-1-input-manifest.json froze the sha256 of the .hkx they came from. That pair - a frozen
// input and a reviewed output - is what makes the new HavokLib path checkable rather than merely
// plausible: re-bake shd_blockidle.hkx and the answer has to be the one already in the repository.
//
// It is. 46 curves across the 23 retarget bones, worst absolute difference 0.0.
//
// That comparison needs the toolset built and the raw .hkx present, and neither is committed - the
// asset policy keeps .hkx out of the repository, and HavokLib is GPLv3 and fetched into /tmp. So
// the re-bake test runs when a re-bake is there and skips when it is not. What does NOT depend on
// any of that, and so runs everywhere, is the rest of this file: that the comparison can tell two
// bakes apart at all, and that both shipped source packs really do carry the 46 curves the
// comparison counts. A comparator that compares nothing also reports zero.

const dir = new URL('./', import.meta.url);
const GUARD_HOLD = new URL('../assets/skyrim/guard/converted/shd_blockidle.source.glb', dir);
const GREATSWORD_IDLE = new URL('../assets/skyrim/greatsword/converted/2hm_idle.source.glb', dir);

// The frozen verdict. If a toolset change moves this off zero, the change is wrong, not the number.
const REPRODUCTION = Object.freeze({ curves: 46, worstAbsoluteDifference: 0 });

function floatBuffer(values) {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return `data:application/octet-stream;base64,${buffer.toString('base64')}`;
}

// A minimal source bake: every retarget's first alias as a node, each with a rotation curve.
function syntheticBake({ times = [0, 1], rotations = null, dropCurveFor = null } = {}) {
  const samples = rotations || times.map((_time, index) => [0, 0, 0, 1 - index * 0.01]).flat();
  const nodes = SKYRIM_BONE_RETARGETS.map((retarget) => ({ name: retarget.sourceAliases[0] }));
  const channels = [];
  nodes.forEach((_node, index) => {
    if (SKYRIM_BONE_RETARGETS[index].id === dropCurveFor) return;
    channels.push({ sampler: 0, target: { node: index, path: 'rotation' } });
  });
  const json = {
    asset: { version: '2.0' },
    nodes,
    animations: [{ name: 'synthetic', samplers: [{ input: 0, output: 1 }], channels }],
    buffers: [
      { byteLength: times.length * 4, uri: floatBuffer(times) },
      { byteLength: samples.length * 4, uri: floatBuffer(samples) },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: times.length * 4 },
      { buffer: 1, byteOffset: 0, byteLength: samples.length * 4 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, type: 'SCALAR', count: times.length },
      { bufferView: 1, componentType: 5126, type: 'VEC4', count: samples.length / 4 },
    ],
  };
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

test('the comparison reports zero only when the bakes really are the same', () => {
  const same = compareSourceBakes(syntheticBake(), syntheticBake());
  assert.equal(same.identical, true);
  assert.equal(same.worst.delta, 0);
  assert.equal(same.comparedCurves, SKYRIM_BONE_RETARGETS.length);
});

test('one moved sample in one bone is enough to fail the comparison', () => {
  // A quarter of a degree on one bone's last key, which is roughly the size of a rounding
  // difference between two decoders and exactly the size of thing a byte comparison of a whole
  // file would drown out.
  const moved = [0, 0, 0, 1, 0, 0, 0.004, 0.99];
  const drifted = compareSourceBakes(syntheticBake(), syntheticBake({ rotations: moved }));
  assert.equal(drifted.identical, false);
  assert.ok(drifted.worst.delta > 0.003, `worst was ${drifted.worst.delta}`);
  assert.equal(drifted.worst.kind, 'values');
  // Every retarget shares the one sampler here, so the first is as good a witness as any - the
  // point is that the comparison names a bone rather than reporting a file-level verdict.
  assert.ok(drifted.worst.key.endsWith('/rotation'), drifted.worst.key);
});

test('a curve that went missing is a failure, not an unnoticed absence', () => {
  const lost = compareSourceBakes(syntheticBake(), syntheticBake({ dropCurveFor: 'wrist.r' }));
  assert.equal(lost.identical, false);
  // Two retargets, one source node: wrist.r and hand.r both read "NPC R Hand [RHnd]", so losing
  // that node's curve loses both. Counting the retarget rather than the node is what makes this
  // visible - a per-node count would have reported one loss and hidden the second reader.
  assert.deepEqual(lost.onlyInReference, ['wrist.r/rotation', 'hand.r/rotation']);
  // And it does not silently pass by comparing only what both happen to have.
  assert.equal(lost.comparedCurves, SKYRIM_BONE_RETARGETS.length - 2);
});

test('a shorter clip is caught even when every sample it does have matches', () => {
  const truncated = compareSourceBakes(
    syntheticBake({ times: [0, 1] }),
    syntheticBake({ times: [0], rotations: [0, 0, 0, 1] }),
  );
  assert.equal(truncated.identical, false);
  assert.ok(truncated.lengthMismatches.length > 0);
});

test('both shipped source packs carry the 46 curves the reproduction counts', async () => {
  for (const asset of [GUARD_HOLD, GREATSWORD_IDLE]) {
    const collected = collectRetargetCurves(await readFile(asset));
    assert.deepEqual(collected.unresolved, [], `${path.basename(asset.pathname)} is missing retarget bones`);
    assert.equal(collected.curves.size, REPRODUCTION.curves, path.basename(asset.pathname));
  }
});

test('the greatsword idle is a source bake of its own clip, on the canonical hierarchy', async () => {
  // 2hm_idle came through the new path; shd_blockidle came through Blender in 2025. The claim
  // being made by putting them in the same directory tree is that a reader cannot tell which is
  // which from the shape of the file, so that is what is asserted.
  const greatsword = collectRetargetCurves(await readFile(GREATSWORD_IDLE));
  const guard = collectRetargetCurves(await readFile(GUARD_HOLD));
  assert.deepEqual(greatsword.animationNames, ['2hm_idle']);
  assert.deepEqual([...greatsword.curves.keys()].sort(), [...guard.curves.keys()].sort());
  // Two hands on a greatsword: the wrist that a one-handed guard barely moves is animated here.
  assert.ok(greatsword.curves.get('wrist.l/rotation').times.length > 100);
});

// The re-bake itself. HKX_REBAKE_DIR should hold the output of
//   node tools/skyrim-hkx-bridge/convert-hkx.mjs <skeleton.hkx> shd_blockidle.hkx "$HKX_REBAKE_DIR"
// after tools/skyrim-hkx-bridge/build-havok-toolset.sh has built the toolset.
test('a re-bake of shd_blockidle reproduces the committed 2025 bake exactly', async (t) => {
  const rebakeDir = process.env.HKX_REBAKE_DIR;
  const candidate = rebakeDir && path.join(rebakeDir, 'shd_blockidle.source.glb');
  if (!candidate || !existsSync(candidate)) {
    t.skip('set HKX_REBAKE_DIR to a directory holding a re-baked shd_blockidle.source.glb');
    return;
  }
  const comparison = compareSourceBakes(await readFile(GUARD_HOLD), await readFile(candidate));
  assert.equal(comparison.comparedCurves, REPRODUCTION.curves);
  assert.deepEqual(comparison.onlyInReference, []);
  assert.deepEqual(comparison.onlyInCandidate, []);
  assert.equal(comparison.worst.delta, REPRODUCTION.worstAbsoluteDifference);
  assert.equal(comparison.identical, true);
});
