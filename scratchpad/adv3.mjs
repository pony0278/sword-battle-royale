import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const rel = process.argv[2] || 'assets/skyrim/guard/converted/shd_blockbashpower.source.glb';
const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, rel)));
const s = gltf.scene;
s.updateMatrixWorld(true);
const V=()=>new THREE.Vector3();
const byName = new Map(); s.traverse(o=>{ if(!byName.has(o.name)) byName.set(o.name,o); });
for (const n of ['NPC_Root_Root','NPC_Root_Root_1','NPC_Pelvis_Pelv_','NPC_Head_Head_']) {
  const o = byName.get(n); if(!o){console.log(n,'MISSING');continue;}
  const chain=[]; let p=o; while(p){chain.push(p.name||'<scene>'); p=p.parent;}
  console.log(`${n}: world ${o.getWorldPosition(V()).toArray().map(v=>v.toFixed(4)).join(',')}  local ${o.position.toArray().map(v=>v.toFixed(4)).join(',')}  chain ${chain.join(' < ')}`);
}
console.log('\nscene children:', s.children.map(c=>`${c.name}[${c.type}]`).join(', '));
console.log('scene position/quat/scale', s.position.toArray(), s.quaternion.toArray().map(v=>v.toFixed(4)), s.scale.toArray());
// which of the two roots is an ancestor of the pelvis?
const pel = byName.get('NPC_Pelvis_Pelv_');
let anc=[]; let p=pel; while(p){anc.push(p.name);p=p.parent;}
console.log('pelvis ancestors include NPC_Root_Root?', anc.includes('NPC_Root_Root'), ' _1?', anc.includes('NPC_Root_Root_1'));
// tracks that mention root
const tn = gltf.animations[0].tracks.map(t=>t.name);
console.log('tracks mentioning Root:', tn.filter(n=>/Root/i.test(n)));
console.log('total tracks', tn.length);
// is the as-loaded pose equal to animation frame 0?
const mixer=new THREE.AnimationMixer(s);
const a=mixer.clipAction(gltf.animations[0]); a.setLoop(THREE.LoopOnce,1); a.clampWhenFinished=true; a.play();
const before = { pel: pel.getWorldPosition(V()), head: byName.get('NPC_Head_Head_').getWorldPosition(V()) };
mixer.setTime(0); s.updateMatrixWorld(true);
const at0 = { pel: pel.getWorldPosition(V()), head: byName.get('NPC_Head_Head_').getWorldPosition(V()) };
console.log('as-loaded pelvis', before.pel.toArray().map(v=>v.toFixed(4)).join(','), ' frame0 pelvis', at0.pel.toArray().map(v=>v.toFixed(4)).join(','));
console.log('as-loaded head  ', before.head.toArray().map(v=>v.toFixed(4)).join(','), ' frame0 head  ', at0.head.toArray().map(v=>v.toFixed(4)).join(','));
