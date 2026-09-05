// (a) prove the mixer.setTime + LoopOnce/clamp freeze; (b) dense scan with a FRESH mixer per scan.
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
const CLIPS = [
  ['shd_blockidle','assets/skyrim/guard/converted/shd_blockidle.source.glb'],
  ['shd_blockhit','assets/skyrim/guard/converted/shd_blockhit.source.glb'],
  ['shd_blockbash','assets/skyrim/guard/converted/shd_blockbash.source.glb'],
  ['shd_blockbashpower','assets/skyrim/guard/converted/shd_blockbashpower.source.glb'],
  ['2hm_idle','assets/skyrim/greatsword/converted/2hm_idle.source.glb'],
  ['2hm_idle_alt','assets/skyrim/greatsword/converted/2hm_idle_alt.source.glb'],
];
const V=()=>new THREE.Vector3();
const SEL = SKYRIM_BONE_RETARGETS.filter(r=>['root','pelvis','head'].includes(r.id));
const P=(v)=>(v*100).toFixed(3);

// (a) freeze demo on one clip
{
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, CLIPS[3][1])));
  const s=gltf.scene; const R=resolveSkyrimSourceNodes(s,SEL);
  const m=new THREE.AnimationMixer(s); const a=m.clipAction(gltf.animations[0]);
  a.setLoop(THREE.LoopOnce,1); a.clampWhenFinished=true; a.play();
  const d=gltf.animations[0].duration;
  const z=(t)=>{m.setTime(t); s.updateMatrixWorld(true); return R.nodes.pelvis.getWorldPosition(V()).z;};
  console.log('FREEZE DEMO (shd_blockbashpower), pelvis world z via mixer.setTime:');
  console.log(`  t=0.35 -> ${z(d*0.5).toFixed(4)}   t=0.70(end) -> ${z(d).toFixed(4)}   THEN t=0.35 again -> ${z(d*0.5).toFixed(4)}  (t=0 value is ${(()=>{const m2=new THREE.AnimationMixer(s);const a2=m2.clipAction(gltf.animations[0]);a2.play();m2.setTime(0);s.updateMatrixWorld(true);return R.nodes.pelvis.getWorldPosition(V()).z;})().toFixed(4)})`);
  console.log(`  action.paused after reaching duration: ${a.paused}`);
}

// (b) dense scan
for (const [label, rel] of CLIPS) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, rel)));
  const character = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, character.rig,
    {id:'p',file:path.basename(rel),clipId:'SKYRIM_SOURCE/p',role:'measurement'}, {fps:30});
  character.registerAnimations([clip]);
  const sroot=gltf.scene; const R=resolveSkyrimSourceNodes(sroot,SEL);
  const bones=character.rig.bones;
  const sPos=()=>{sroot.updateMatrixWorld(true);return {root:R.nodes.root.getWorldPosition(V()),pelvis:R.nodes.pelvis.getWorldPosition(V()),head:R.nodes.head.getWorldPosition(V())};};
  const tPos=()=>{character.object3d.updateMatrixWorld(true);return {root:bones.root.getWorldPosition(V()),pelvis:bones.hips.getWorldPosition(V()),head:bones.head.getWorldPosition(V())};};
  const sp0=sPos(), tp0=tPos();
  const dv=sp0.head.clone().sub(sp0.root);
  const axis=['x','y','z'].reduce((a,b)=>Math.abs(dv[b])>Math.abs(dv[a])?b:a,'x');
  const up=Math.sign(dv[axis])||1, sStat=Math.abs(dv[axis]), tStat=tp0.head.y-tp0.root.y;
  const sh=(p,v)=>(up*(v[axis]-p.root[axis]))/sStat, th=(p,v)=>(v.y-p.root.y)/tStat;
  const sRestP=sh(sp0,sp0.pelvis), tRestP=th(tp0,tp0.pelvis);
  const sRestVec=sp0.pelvis.clone().sub(sp0.root), tRestVec=tp0.pelvis.clone().sub(tp0.root);
  const basisQ=new THREE.Quaternion().fromArray(clip.userData.basisCalibration.quaternion);
  const scale=clip.userData.translationScale;
  const dur=character.getAnimationDuration(clip.name), sdur=gltf.animations[0].duration;

  function scan(n){ // fresh mixer, monotone sweep of n+1 points
    const m=new THREE.AnimationMixer(sroot); const a=m.clipAction(gltf.animations[0]);
    a.setLoop(THREE.LoopOnce,1); a.clampWhenFinished=true; a.play();
    let w={dd:0,f:0}, w3={m:0,f:0};
    for(let i=0;i<=n;i++){ const f=i/n;
      m.setTime(sdur*f); const sp=sPos();
      character.sampleAnimation(clip.name,dur*f); const tp=tPos();
      const dd=(th(tp,tp.pelvis)-tRestP)-(sh(sp,sp.pelvis)-sRestP);
      if(Math.abs(dd)>Math.abs(w.dd)) w={dd,f};
      const sD=sp.pelvis.clone().sub(sp.root).sub(sRestVec);
      const pred=sD.clone().applyQuaternion(basisQ).multiplyScalar(scale);
      const act=tp.pelvis.clone().sub(tp.root).sub(tRestVec);
      const e=act.sub(pred).divideScalar(tStat).length();
      if(e>w3.m) w3={m:e,f};
    }
    a.stop(); m.uncacheAction(gltf.animations[0], sroot);
    return {w,w3};
  }
  const keys = Math.max(200, Math.round(sdur*30));
  const r200=scan(200), rK=scan(keys*4);
  console.log(`\n=== ${label}  dur ${sdur.toFixed(4)}s  ~${Math.round(sdur*30)} baked keys`);
  console.log(`  201 samples  : vertical disagreement ${P(r200.w.dd)} pts @f=${r200.w.f.toFixed(4)}   full-3D err ${P(r200.w3.m)} pts`);
  console.log(`  ${keys*4+1} samples : vertical disagreement ${P(rK.w.dd)} pts @f=${rK.w.f.toFixed(4)}   full-3D err ${P(rK.w3.m)} pts`);
}
