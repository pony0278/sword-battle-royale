// Which term buries the foot: the pelvis POSITION track, or the copied leg ROTATIONS?
// Re-runs the retarget with translationScale forced, and re-measures the toe.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { retargetSkyrimClip } from '../src/animation/skyrim-animation-retarget.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const CLIPS = [
  ['2hm_idle','assets/skyrim/greatsword/converted/2hm_idle.source.glb'],
  ['shd_blockidle','assets/skyrim/guard/converted/shd_blockidle.source.glb'],
  ['shd_blockbash','assets/skyrim/guard/converted/shd_blockbash.source.glb'],
  ['shd_blockhit','assets/skyrim/guard/converted/shd_blockhit.source.glb'],
  ['shd_blockbashpower','assets/skyrim/guard/converted/shd_blockbashpower.source.glb'],
];
const STATURE = 1.2414/120.3436;
// pelvis->foot.l straight span, both rigs, from the rest measurement already taken
const LEG = (0.2514*1.2414)/(0.5350*120.3436);
console.log(`stature-ratio scale ${STATURE.toFixed(6)}   leg-span-ratio scale ${LEG.toFixed(6)}   ratio ${(LEG/STATURE).toFixed(3)}`);
console.log('\nlowest target toe world y (m), 201 samples.  rest toe y = 0.0260, floor y = 0\n');
console.log('clip                  default(stature)   leg-ratio   pelvis-track-off');
for (const [name, rel] of CLIPS) {
  const bytes = await readFile(path.join(ROOT, rel));
  const row = [];
  for (const scale of [undefined, LEG, 1e-9]) {
    const gltf = await parseSourceGlb(THREE, bytes);
    const ch = createDefaultCharacter(THREE);
    const opts = { fps:30, clipId:'S/p' };
    if (scale !== undefined) opts.translationScale = scale;
    const clip = retargetSkyrimClip(THREE, { scene: gltf.scene, animations: gltf.animations }, ch.rig, opts);
    ch.registerAnimations([clip]);
    const dur = ch.getAnimationDuration(clip.name);
    const b = ch.rig.bones; const V=()=>new THREE.Vector3();
    let toeMin = 1e9;
    for (let i=0;i<=200;i++){
      ch.sampleAnimation(clip.name, dur*i/200); ch.object3d.updateMatrixWorld(true);
      toeMin = Math.min(toeMin, b['toes.l'].getWorldPosition(V()).y, b['toes.r'].getWorldPosition(V()).y);
    }
    row.push(toeMin);
  }
  console.log(`${name.padEnd(20)} ${row.map(v=>v.toFixed(4).padStart(14)).join(' ')}`);
}
