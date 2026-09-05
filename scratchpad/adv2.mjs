// Is the probe's tp0 a true rest? Does resetForAnimation change it?
// And per-sample f trace of the pelvis delta disagreement, plus f=0 and f=1 rows.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { retargetConvertedSkyrimGltf } from '../src/animation/skyrim-converted-animation-library.js';
import { SKYRIM_BONE_RETARGETS, resolveSkyrimSourceNodes } from '../src/animation/skyrim-animation-retarget.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const rel = process.argv[2] || 'assets/skyrim/guard/converted/shd_blockbashpower.source.glb';
const V = () => new THREE.Vector3();

const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, rel)));
const character = createDefaultCharacter(THREE);

const B = { root:'root', hips:'hips', head:'head', footL:'foot.l' };
function tsnap() {
  character.object3d.updateMatrixWorld(true);
  return Object.fromEntries(Object.entries(B).map(([k,n])=>[k, character.rig.bones[n].getWorldPosition(V())]));
}
const asCreated = tsnap();
console.log('as-created  root', asCreated.root.toArray().map(v=>v.toFixed(6)).join(','),
            ' hips', asCreated.hips.toArray().map(v=>v.toFixed(6)).join(','),
            ' head', asCreated.head.toArray().map(v=>v.toFixed(6)).join(','));

const clip = retargetConvertedSkyrimGltf(THREE, gltf, character.rig,
  { id:'p', file:path.basename(rel), clipId:'SKYRIM_SOURCE/p', role:'measurement' }, { fps: 30 });
const afterRetarget = tsnap();
console.log('after retarget of the SAME rig  hips', afterRetarget.hips.toArray().map(v=>v.toFixed(6)).join(','),
            '  moved?', afterRetarget.hips.distanceTo(asCreated.hips).toExponential(3));

character.registerAnimations([clip]);
const afterRegister = tsnap();
console.log('after registerAnimations       hips', afterRegister.hips.toArray().map(v=>v.toFixed(6)).join(','));

// Now force the rig through the exact reset the sampler does, then read rest again.
character.stopAnimation();
const afterReset = tsnap();
console.log('after stopAnimation (reset)    hips', afterReset.hips.toArray().map(v=>v.toFixed(6)).join(','),
            '  vs as-created delta', afterReset.hips.distanceTo(asCreated.hips).toExponential(3));

// what the RETARGET itself considered target rest
console.log('rig.restTransforms.hips.position', JSON.stringify(character.rig.restTransforms.hips.position));
console.log('rig.restTransforms.root.position', JSON.stringify(character.rig.restTransforms.root.position));

// clip userData: translationScale, targetHeight
console.log('clip.userData translationScale', clip.userData.translationScale,
            ' measured', clip.userData.measuredTranslationScale,
            ' targetHeight', clip.userData.targetHeight);
console.log('clip duration', clip.duration, ' source duration', gltf.animations[0].duration,
            ' getAnimationDuration', character.getAnimationDuration(clip.name));
const diag = character.animation.getPreparedClipDiagnostics(clip.name, true);
console.log('prepared clip diagnostics', JSON.stringify(diag));
const prepared = character.animation.mixer && null;
// prepared duration
const act = character.animation.clips.get(clip.name);
console.log('registered clip tracks', act.tracks.length, 'names w/ position:',
  act.tracks.filter(t=>t.name.endsWith('.position')).map(t=>t.name));
