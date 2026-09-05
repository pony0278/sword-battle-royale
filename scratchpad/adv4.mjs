import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';
import { SKYRIM_BONE_RETARGETS, resolveSkyrimSourceNodes } from '../src/animation/skyrim-animation-retarget.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const rel = process.argv[2] || 'assets/skyrim/guard/converted/shd_blockbashpower.source.glb';
const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, rel)));
const s = gltf.scene; s.updateMatrixWorld(true);
const V=()=>new THREE.Vector3();
const R = resolveSkyrimSourceNodes(s, SKYRIM_BONE_RETARGETS.filter(r=>['root','pelvis','head'].includes(r.id)));
const chain=(o)=>{const c=[];let p=o;while(p){c.push(p.name||'<scene>');p=p.parent;}return c.join(' < ');};
for (const k of ['root','pelvis','head']) console.log(`${k}: "${R.nodes[k].name}"  chain: ${chain(R.nodes[k])}`);
const anim = gltf.animations[0];
const driven = new Set(anim.tracks.map(t=>t.name.slice(0,t.name.lastIndexOf('.'))));
console.log('\nresolved root driven by clip?', driven.has(R.nodes.root.name));
console.log('resolved pelvis driven?', driven.has(R.nodes.pelvis.name));
// find the animated root node and see how much it MOVES
const byName=new Map(); s.traverse(o=>{if(!byName.has(o.name))byName.set(o.name,o);});
const animRoot = byName.get('NPC_Root_Root_1');
const mixer=new THREE.AnimationMixer(s);
const a=mixer.clipAction(anim); a.setLoop(THREE.LoopOnce,1); a.clampWhenFinished=true; a.play();
let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
let pmn=1e9,pmx=-1e9;
for(let i=0;i<=200;i++){
  mixer.setTime(anim.duration*i/200); s.updateMatrixWorld(true);
  const w=animRoot.getWorldPosition(V());
  for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],w.getComponent(k));mx[k]=Math.max(mx[k],w.getComponent(k));}
  const q=animRoot.getWorldQuaternion(new THREE.Quaternion());
  const ang=q.angleTo(new THREE.Quaternion())*180/Math.PI;
  pmn=Math.min(pmn,ang);pmx=Math.max(pmx,ang);
}
console.log(`\nANIMATED root NPC_Root_Root_1 world pos range x[${mn[0].toFixed(3)},${mx[0].toFixed(3)}] y[${mn[1].toFixed(3)},${mx[1].toFixed(3)}] z[${mn[2].toFixed(3)},${mx[2].toFixed(3)}]`);
console.log(`ANIMATED root world rotation from identity: ${pmn.toFixed(3)} .. ${pmx.toFixed(3)} deg`);
// static resolved root during the clip
let smn=[1e9,1e9,1e9],smx=[-1e9,-1e9,-1e9], smq=0;
for(let i=0;i<=200;i++){mixer.setTime(anim.duration*i/200);s.updateMatrixWorld(true);
  const w=R.nodes.root.getWorldPosition(V());for(let k=0;k<3;k++){smn[k]=Math.min(smn[k],w.getComponent(k));smx[k]=Math.max(smx[k],w.getComponent(k));}
  smq=Math.max(smq, R.nodes.root.getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion())*180/Math.PI);}
console.log(`RESOLVED root "${R.nodes.root.name}" world pos range x[${smn[0].toFixed(4)},${smx[0].toFixed(4)}] y[${smn[1].toFixed(4)},${smx[1].toFixed(4)}] z[${smn[2].toFixed(4)},${smx[2].toFixed(4)}] maxrot ${smq.toFixed(4)} deg`);
