// CONTROL: the same procedural rig, driven by ITS OWN native KayKit clips.
// If the rig normally keeps its toe on the floor, "the rigs differ" cannot excuse the Skyrim result.
import { readFile } from 'node:fs/promises';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const V = () => new THREE.Vector3();

const want = new Set(['Idle','Walking_B','Walking_A','Running_A','Running_B','Blocking','Block_Idle',
  'Idle_Combat','Blocking_Idle','Sword_Idle','Crouching_Idle','Dodge_Forward','Crouch_Idle']);
const ch = createDefaultCharacter(THREE);
const bones = ch.rig.bones;
const clips = [];
for (const f of ['general.glb','basic.glb','advanced.glb','melee.glb','simulation.glb','special.glb']) {
  const bytes = await readFile(path.join(ROOT,'assets/kaykit/animations',f));
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength);
  const gltf = await new Promise((res,rej)=> new THREE.GLTFLoader().parse(buf,'',res,rej));
  for (const c of gltf.animations||[]) if (want.has(c.name)) clips.push(c);
}
console.log('native clips found:', clips.map(c=>c.name).join(', '));
ch.registerAnimations(clips);
const ty = (n) => bones[n].getWorldPosition(V()).y;
console.log('\nclip                 toe min y (m)   toe max y   hips min y   frames toe<0 /201');
for (const c of clips) {
  const dur = ch.getAnimationDuration(c.name);
  let lo=1e9, hi=-1e9, hipLo=1e9, below=0;
  for (let i=0;i<=200;i++){
    ch.sampleAnimation(c.name, dur*i/200); ch.object3d.updateMatrixWorld(true);
    const t = Math.min(ty('toes.l'), ty('toes.r'));
    lo=Math.min(lo,t); hi=Math.max(hi,t); hipLo=Math.min(hipLo, ty('hips'));
    if (t<0) below++;
  }
  console.log(`${c.name.padEnd(20)} ${lo.toFixed(4).padStart(13)}   ${hi.toFixed(4).padStart(9)}   ${hipLo.toFixed(4).padStart(10)}   ${String(below).padStart(6)}`);
}
