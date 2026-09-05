import { readFile } from 'node:fs/promises';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { retargetConvertedSkyrimGltf } from '../src/animation/skyrim-converted-animation-library.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const G = ['foot.l','toes.l','foot.r','toes.r'];
const CLIPS=['assets/skyrim/greatsword/converted/2hm_idle.source.glb','assets/skyrim/greatsword/converted/2hm_idle_alt.source.glb','assets/skyrim/guard/converted/shd_blockidle.source.glb','assets/skyrim/guard/converted/shd_blockhit.source.glb','assets/skyrim/guard/converted/shd_blockbash.source.glb','assets/skyrim/guard/converted/shd_blockbashpower.source.glb'];
console.log('The character stands with root at y=0. Lowest foot BONE at rest: y=+0.0260. Body 1.4854 tall.');
console.log('clip'.padEnd(20),'lowest foot bone y'.padStart(19),'below y=0'.padStart(11),'% of body'.padStart(10),'frames under'.padStart(13));
for (const S of CLIPS) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT,S)));
  const ch = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE,gltf,ch.rig,{id:'f',file:path.basename(S),clipId:'F/f',role:'m'},{fps:30});
  ch.registerAnimations([clip]);
  let min=Infinity,under=0;
  for(let i=0;i<=200;i+=1){ const t=clip.duration*(i/200)*0.998;
    ch.sampleAnimation(clip.name,t,{loop:false,inPlace:true}); ch.object3d.updateMatrixWorld(true);
    const v=Math.min(...G.map((g)=>ch.rig.bones[g].getWorldPosition(new THREE.Vector3()).y));
    min=Math.min(min,v); if(v<0) under+=1; }
  console.log(path.basename(S,'.source.glb').padEnd(20), min.toFixed(4).padStart(19),
    (min<0?min.toFixed(4):'-').padStart(11), (min<0?(-min/1.4854*100).toFixed(1)+'%':'-').padStart(10),
    `${under}/201`.padStart(13));
}
