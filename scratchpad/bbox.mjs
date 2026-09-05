// Forget bones. Where is the lowest VISIBLE point of the character, in world metres?
import { readFile } from 'node:fs/promises';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { retargetConvertedSkyrimGltf } from '../src/animation/skyrim-converted-animation-library.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const CLIPS = [
  ['2hm_idle_alt','assets/skyrim/greatsword/converted/2hm_idle_alt.source.glb'],
  ['2hm_idle','assets/skyrim/greatsword/converted/2hm_idle.source.glb'],
  ['shd_blockidle','assets/skyrim/guard/converted/shd_blockidle.source.glb'],
  ['shd_blockbash','assets/skyrim/guard/converted/shd_blockbash.source.glb'],
  ['shd_blockhit','assets/skyrim/guard/converted/shd_blockhit.source.glb'],
  ['shd_blockbashpower','assets/skyrim/guard/converted/shd_blockbashpower.source.glb'],
];
function lowestVisible(THREE, obj) {
  obj.updateMatrixWorld(true);
  let min = Infinity; const box = new THREE.Box3(); let meshes = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.visible === false) return;
    meshes++;
    box.setFromObject(o);
    if (Number.isFinite(box.min.y)) min = Math.min(min, box.min.y);
  });
  return { min, meshes };
}
const rest = createDefaultCharacter(THREE);
const r = lowestVisible(THREE, rest.object3d);
console.log(`rest: ${r.meshes} meshes, lowest visible world y = ${r.min.toFixed(4)} m  (floor = 0)`);
console.log('\nclip                 lowest visible y (m)   penetration below floor (m)   as % of stature(1.2414)');
for (const [name, rel] of CLIPS) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, rel)));
  const ch = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, ch.rig, {id:name,file:name,clipId:'S/'+name,role:'m'}, {fps:30});
  ch.registerAnimations([clip]);
  const dur = ch.getAnimationDuration(clip.name);
  let lo = Infinity;
  for (let i=0;i<=200;i++){ ch.sampleAnimation(clip.name, dur*i/200); lo = Math.min(lo, lowestVisible(THREE, ch.object3d).min); }
  const pen = lo < 0 ? -lo : 0;
  console.log(`${name.padEnd(20)} ${lo.toFixed(4).padStart(18)}   ${pen.toFixed(4).padStart(25)}   ${(100*pen/1.2414).toFixed(2).padStart(20)}`);
}
