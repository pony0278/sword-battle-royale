import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SKYRIM_GUARD_CONVERTED_FILES,
  SKYRIM_GUARD_HOLD_CONVERTED_FILE,
  SKYRIM_GUARD_REACTION_CONVERTED_FILES,
  createSkyrimConvertedAnimationLibrary,
  importSkyrimConvertedAnimationFile,
  loadSkyrimConvertedAnimationLibrary,
  retargetConvertedSkyrimGltf,
} from '../src/animation/skyrim-converted-animation-library.js';

const TARGET_RIG = {
  definition: { id: 'test-rig', bones: [] },
  restTransforms: {},
  bones: {},
};

function fakeGltf() {
  return {
    scene: {
      traverse(callback) { callback(this); },
    },
    animations: [{ name: 'source-blockidle', duration: 1.25 }],
  };
}

function retargetStub(_THREE, decoded, _rig, options) {
  assert.ok(decoded.scene);
  assert.equal(decoded.animations[0].name, 'source-blockidle');
  return {
    name: options.clipId,
    duration: decoded.animations[0].duration,
    userData: { source: 'skyrim', retargetFps: options.fps },
  };
}

test('G3.3.2 converted source manifest keeps blockidle first and adds only accepted reaction sources', () => {
  assert.deepEqual(SKYRIM_GUARD_HOLD_CONVERTED_FILE, {
    id: 'shd_blockidle',
    file: 'shd_blockidle.source.glb',
    clipId: 'SKYRIM_GUARD/shd_blockidle',
    role: 'Guard Hold',
  });
  assert.equal(SKYRIM_GUARD_CONVERTED_FILES[0], SKYRIM_GUARD_HOLD_CONVERTED_FILE);
  assert.equal(SKYRIM_GUARD_CONVERTED_FILES.length, 4);
  assert.equal(SKYRIM_GUARD_REACTION_CONVERTED_FILES.length, 3);
  assert.deepEqual(
    SKYRIM_GUARD_REACTION_CONVERTED_FILES.map(({ id, clipId, role, visualDecision }) => ({ id, clipId, role, visualDecision })),
    [
      {
        id: 'shd_blockhit',
        clipId: 'SKYRIM_GUARD/shd_blockhit',
        role: 'Block Hit',
        visualDecision: 'ADOPT WITH CORRECTIONS',
      },
      {
        id: 'shd_blockbash',
        clipId: 'SKYRIM_GUARD/shd_blockbash',
        role: 'Parry Deflect',
        visualDecision: 'ADOPT',
      },
      {
        id: 'shd_blockbashpower',
        clipId: 'SKYRIM_GUARD/shd_blockbashpower',
        role: 'Perfect Parry',
        visualDecision: 'ADOPT WITH CORRECTIONS',
      },
    ],
  );
  assert.equal(SKYRIM_GUARD_CONVERTED_FILES.some(({ id }) => id === 'shd_blockbashintro'), false);
});

test('converted Skyrim GLB is retargeted to the canonical Action Studio clip id', () => {
  const clip = retargetConvertedSkyrimGltf({}, fakeGltf(), TARGET_RIG, SKYRIM_GUARD_CONVERTED_FILES[0], {
    fps: 30,
    retargetClip: retargetStub,
  });
  assert.equal(clip.name, 'SKYRIM_GUARD/shd_blockidle');
  assert.equal(clip.duration, 1.25);
  assert.equal(clip.userData.convertedSource.id, 'shd_blockidle');
});

test('converted Skyrim library loads Hold plus all accepted G3.3.2 reaction bridge assets', async () => {
  const loadedUrls = [];
  const loader = {
    load(url, resolve) {
      loadedUrls.push(url);
      resolve(fakeGltf());
    },
  };
  const library = await loadSkyrimConvertedAnimationLibrary(loader, {
    THREE: {},
    rig: TARGET_RIG,
    baseUrl: '/probe/',
    retargetClip: retargetStub,
  });
  assert.deepEqual(loadedUrls, [
    '/probe/shd_blockidle.source.glb',
    '/probe/shd_blockhit.source.glb',
    '/probe/shd_blockbash.source.glb',
    '/probe/shd_blockbashpower.source.glb',
  ]);
  assert.equal(library.source, 'skyrim');
  assert.equal(library.bridge, 'converted-glb');
  assert.equal(library.retargetFps, 30);
  assert.equal(library.clips.size, 4);
  for (const { clipId } of SKYRIM_GUARD_CONVERTED_FILES) assert.ok(library.clips.has(clipId));
});

test('a local self-contained GLB can be imported without committing the experimental source asset', async () => {
  const loader = {
    parse(_bytes, _basePath, resolve) {
      resolve(fakeGltf());
    },
  };
  const file = {
    name: 'shd_blockidle.source.glb',
    async arrayBuffer() { return new ArrayBuffer(16); },
  };
  const library = await importSkyrimConvertedAnimationFile(loader, file, {
    THREE: {},
    rig: TARGET_RIG,
    retargetClip: retargetStub,
  });
  assert.equal(library.source, 'skyrim');
  assert.equal(library.files[0].localFile, 'shd_blockidle.source.glb');
  assert.ok(library.clips.has('SKYRIM_GUARD/shd_blockidle'));
});

test('local bridge import rejects non-self-contained source formats', async () => {
  const loader = { parse() {} };
  const file = {
    name: 'shd_blockidle.gltf',
    async arrayBuffer() { return new ArrayBuffer(1); },
  };
  await assert.rejects(
    importSkyrimConvertedAnimationFile(loader, file, { THREE: {}, rig: TARGET_RIG }),
    /self-contained \.glb/,
  );
});

test('a retargeted Skyrim clip can be wrapped as the same library shape used by existing external sources', () => {
  const clip = { name: 'SKYRIM_GUARD/shd_blockidle', duration: 1 };
  const library = createSkyrimConvertedAnimationLibrary(clip);
  assert.equal(library.clips.get(clip.name), clip);
  assert.equal(library.duplicates.length, 0);
});
