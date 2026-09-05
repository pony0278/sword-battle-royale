// (1) decompose the basis quaternion -> explain the residual analytically
// (2) power control: does the probe's metric detect a deliberately broken retarget?
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { retargetSkyrimClip, SKYRIM_BONE_RETARGETS, resolveSkyrimSourceNodes } from '../src/animation/skyrim-animation-retarget.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const rel='assets/skyrim/guard/converted/shd_blockbashpower.source.glb';
const V=()=>new THREE.Vector3();
const SEL=SKYRIM_BONE_RETARGETS.filter(r=>['root','pelvis','head'].includes(r.id));

function run(opts, tag){
  return (async()=>{
    const gltf=await parseSourceGlb(THREE, await readFile(path.join(ROOT,rel)));
    const character=createDefaultCharacter(THREE);
    const clip=retargetSkyrimClip(THREE,{scene:gltf.scene,animations:[gltf.animations[0]]},character.rig,{fps:30,clipId:'SKY/x',...opts});
    character.registerAnimations([clip]);
    const sroot=gltf.scene, R=resolveSkyrimSourceNodes(sroot,SEL), bones=character.rig.bones;
    const sPos=()=>{sroot.updateMatrixWorld(true);return{root:R.nodes.root.getWorldPosition(V()),pelvis:R.nodes.pelvis.getWorldPosition(V()),head:R.nodes.head.getWorldPosition(V())};};
    const tPos=()=>{character.object3d.updateMatrixWorld(true);return{root:bones.root.getWorldPosition(V()),pelvis:bones.hips.getWorldPosition(V()),head:bones.head.getWorldPosition(V())};};
    const sp0=sPos(),tp0=tPos();
    const dv=sp0.head.clone().sub(sp0.root);
    const axis=['x','y','z'].reduce((a,b)=>Math.abs(dv[b])>Math.abs(dv[a])?b:a,'x');
    const up=Math.sign(dv[axis])||1,sStat=Math.abs(dv[axis]),tStat=tp0.head.y-tp0.root.y;
    const sh=(p,v)=>(up*(v[axis]-p.root[axis]))/sStat, th=(p,v)=>(v.y-p.root.y)/tStat;
    const sR=sh(sp0,sp0.pelvis),tR=th(tp0,tp0.pelvis);
    const dur=character.getAnimationDuration(clip.name),sdur=gltf.animations[0].duration;
    const m=new THREE.AnimationMixer(sroot);const a=m.clipAction(gltf.animations[0]);
    a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();
    let w=0,wf=0;
    for(let i=0;i<=200;i++){const f=i/200;
      m.setTime(sdur*f);const sp=sPos();character.sampleAnimation(clip.name,dur*f);const tp=tPos();
      const dd=(th(tp,tp.pelvis)-tR)-(sh(sp,sp.pelvis)-sR);
      if(Math.abs(dd)>Math.abs(w)){w=dd;wf=f;}}
    console.log(`  ${tag.padEnd(46)} worst vertical disagreement ${(w*100).toFixed(3)} pts @f=${wf.toFixed(3)}   (clip translationScale ${clip.userData.translationScale.toExponential(5)})`);
    return clip;
  })();
}

const base = await run({}, 'shipped config (measured scale)');
const bq=new THREE.Quaternion().fromArray(base.userData.basisCalibration.quaternion);
const M=new THREE.Matrix4().makeRotationFromQuaternion(bq);
const e=M.elements;
console.log('\nbasis quaternion as a 3x3 (columns = images of source x,y,z in target space):');
for(let r=0;r<3;r++) console.log('  [', [0,1,2].map(c=>e[c*4+r].toFixed(6).padStart(10)).join(' '), ']');
console.log(`  angle ${base.userData.basisCalibration.angleDegrees.toFixed(6)} deg`);
console.log(`  target-Y row picks up source x:${e[1].toFixed(6)}  y:${e[5].toFixed(6)}  z:${e[9].toFixed(6)}`);
console.log('  -> the probe compares source-Z against target-Y; the x,y cross terms above ARE the residual.');

console.log('\nPOWER CONTROLS (same probe metric, deliberately broken retargets):');
await run({translationScale: 2*base.userData.measuredTranslationScale}, 'translationScale x2');
await run({translationScale: 0.5*base.userData.measuredTranslationScale}, 'translationScale x0.5');
await run({basisCalibration:false}, 'basisCalibration disabled (identity basis)');
