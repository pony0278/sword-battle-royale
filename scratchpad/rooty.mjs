// Is the toe below the floor because the ROOT itself descends (faithfully carried root motion),
// or because the body is driven down through a stationary root?
import { readFile } from 'node:fs/promises';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { retargetConvertedSkyrimGltf } from '../src/animation/skyrim-converted-animation-library.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const V=()=>new THREE.Vector3();
const CLIPS=[['2hm_idle','assets/skyrim/greatsword/converted/2hm_idle.source.glb'],
 ['shd_blockidle','assets/skyrim/guard/converted/shd_blockidle.source.glb'],
 ['shd_blockbash','assets/skyrim/guard/converted/shd_blockbash.source.glb'],
 ['shd_blockhit','assets/skyrim/guard/converted/shd_blockhit.source.glb'],
 ['shd_blockbashpower','assets/skyrim/guard/converted/shd_blockbashpower.source.glb']];
console.log('clip                 root y min/max        toe y min   toe-minus-root min   hips y min');
for (const [name,rel] of CLIPS){
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT,rel)));
  const ch = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, ch.rig, {id:name,file:name,clipId:'S/'+name,role:'m'},{fps:30});
  ch.registerAnimations([clip]);
  const b=ch.rig.bones; const ty=(n)=>b[n].getWorldPosition(V()).y;
  const dur=ch.getAnimationDuration(clip.name);
  let rlo=1e9,rhi=-1e9,tlo=1e9,rello=1e9,hlo=1e9;
  for(let i=0;i<=200;i++){ ch.sampleAnimation(clip.name,dur*i/200); ch.object3d.updateMatrixWorld(true);
    const r=ty('root'); const t=Math.min(ty('toes.l'),ty('toes.r'));
    rlo=Math.min(rlo,r); rhi=Math.max(rhi,r); tlo=Math.min(tlo,t); rello=Math.min(rello,t-r); hlo=Math.min(hlo,ty('hips')); }
  console.log(`${name.padEnd(20)} ${rlo.toFixed(4)} / ${rhi.toFixed(4)}   ${tlo.toFixed(4).padStart(10)}   ${rello.toFixed(4).padStart(18)}   ${hlo.toFixed(4).padStart(9)}`);
}
