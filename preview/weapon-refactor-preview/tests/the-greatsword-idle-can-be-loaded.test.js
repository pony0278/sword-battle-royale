import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  SKYRIM_GREATSWORD_BASE_URL,
  SKYRIM_GREATSWORD_CONVERTED_FILES,
  SKYRIM_GUARD_CONVERTED_FILES,
  loadSkyrimConvertedAnimationLibrary,
} from '../src/animation/skyrim-converted-animation-library.js';
import { createProceduralKayKitRig } from '../src/character/procedural-kaykit-rig.js';
import { installStudioSkyrimBridgeControls } from '../tools/action-studio/studio-skyrim-bridge-controls.js';

// The greatsword idle, loadable. Not yet playable in the fight - nothing in the state machine
// reaches for it - but selectable in Action Studio, which is what lets it be looked at while the
// off-hand reach is still wrong (handoff/46).
//
// The browser gate in build/verify-built-studio.mjs drives the whole path through the built page:
// pick the pack, click load, and find SKYRIM_GREATSWORD/2hm_idle in the clip list. What is here is
// the part that would be expensive to diagnose from a browser failure - which list the clip lives
// in, which directory it is fetched from, and whether the option is added twice.

const THREE = { ...ThreeModule, GLTFLoader };
const dir = new URL('./', import.meta.url);

// The loader interface the library uses is load(url, onLoad, onProgress, onError). Serving it off
// disk is what makes the URL the library builds observable - a base URL that pointed at the guard
// directory would 404 in a browser and pass silently against a stub that ignores its argument.
function diskLoader(requested) {
  return {
    load(url, onLoad, _onProgress, onError) {
      requested.push(url);
      const relative = url.replace('../../', '');
      readFile(new URL(`../${relative}`, dir))
        .then((bytes) => new GLTFLoader().parse(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          '',
          onLoad,
          onError,
        ))
        .catch(onError);
    },
  };
}

test('the greatsword is its own pack, not a fifth Guard entry', () => {
  assert.deepEqual(SKYRIM_GREATSWORD_CONVERTED_FILES.map((entry) => entry.clipId), ['SKYRIM_GREATSWORD/2hm_idle']);
  assert.deepEqual(SKYRIM_GREATSWORD_CONVERTED_FILES.map((entry) => entry.file), ['2hm_idle.source.glb']);
  // The separation is load-bearing rather than tidy: the Guard state machine plays every entry in
  // its own list, and this clip is not a Guard clip.
  const guardFiles = SKYRIM_GUARD_CONVERTED_FILES.map((entry) => entry.file);
  assert.ok(!guardFiles.includes('2hm_idle.source.glb'));
  assert.equal(SKYRIM_GUARD_CONVERTED_FILES.length, 4);
  assert.match(SKYRIM_GREATSWORD_BASE_URL, /assets\/skyrim\/greatsword\/converted\/$/);
});

test('the pack loads from its own directory and retargets onto the Blockman rig', async () => {
  const requested = [];
  const rig = createProceduralKayKitRig(THREE);
  const library = await loadSkyrimConvertedAnimationLibrary(diskLoader(requested), {
    THREE,
    rig,
    files: SKYRIM_GREATSWORD_CONVERTED_FILES,
    baseUrl: SKYRIM_GREATSWORD_BASE_URL,
    fps: 30,
  });
  assert.deepEqual(requested, ['../../assets/skyrim/greatsword/converted/2hm_idle.source.glb']);
  assert.deepEqual([...library.clips.keys()], ['SKYRIM_GREATSWORD/2hm_idle']);
  // No derived parry clips. Those are built from the shd_* family by name, and a pack that quietly
  // grew a virtual Guard clip would put a greatsword pose inside the Guard state machine.
  assert.deepEqual(library.virtualClips, []);
  assert.equal(library.retargetFps, 30);

  const clip = library.clips.get('SKYRIM_GREATSWORD/2hm_idle');
  assert.ok(Math.abs(clip.duration - 6.6667) < 0.01, `clip is ${clip.duration}s`);
  // It really drives the rig: every track names a bone the procedural rig has. Track names carry
  // the SANITIZED bone name - "wrist.l" is created as "wristl" - and the property follows the last
  // dot, so splitting on the first one would compare the wrong half.
  const boneNames = new Set(Object.values(rig.bones).map((bone) => bone.name));
  const targets = new Set(clip.tracks.map((track) => track.name.slice(0, track.name.lastIndexOf('.'))));
  for (const target of targets) assert.ok(boneNames.has(target), `clip drives unknown bone ${target}`);
  assert.ok(targets.has(rig.bones['wrist.l'].name) && targets.has(rig.bones['wrist.r'].name), 'both wrists are driven');
});

test('the studio offers both Skyrim packs, and offers each of them once', () => {
  // A minimal select: the controls only need querySelector, appendChild and createElement.
  const options = [];
  const select = {
    options,
    querySelector: (selector) => options.find((option) => selector === `option[value="${option.value}"]`) || null,
    appendChild: (option) => options.push(option),
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById: (id) => (id === 'animationPackSource' ? select : null),
    createElement: () => ({ value: '', textContent: '' }),
  };
  try {
    installStudioSkyrimBridgeControls();
    installStudioSkyrimBridgeControls();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
  assert.deepEqual(options.map((option) => option.value), ['skyrim', 'greatsword']);
  assert.deepEqual(options.map((option) => option.textContent), ['Skyrim Guard Probe', 'Skyrim Greatsword']);
});
