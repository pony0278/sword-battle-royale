import { readFile } from 'node:fs/promises';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { retargetConvertedSkyrimGltf, SKYRIM_GUARD_CONVERTED_FILES } from '../src/animation/skyrim-converted-animation-library.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
console.log('production guard clips:', SKYRIM_GUARD_CONVERTED_FILES.map(f=>f.id).join(', '));
for (const e of SKYRIM_GUARD_CONVERTED_FILES) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, 'assets/skyrim/guard/converted', e.file)));
  const ch = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, ch.rig, e, { fps: 30 });
  const s = clip.userData.translationSafety;
  console.log(`${e.id.padEnd(20)} safe=${s.safe}  excursionRatio ${s.excursionRatio.toFixed(4)} (limit ${s.maxExcursionRatio})  stepRatio ${s.stepRatio.toFixed(4)} (limit ${s.maxStepRatio})  visualDecision ${clip.userData.convertedSource.visualDecision}`);
}
