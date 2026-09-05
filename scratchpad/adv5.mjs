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

for (const [label, rel] of CLIPS) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, rel)));
  const character = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, character.rig,
    {id:'p',file:path.basename(rel),clipId:'SKYRIM_SOURCE/p',role:'measurement'}, {fps:30});
  character.registerAnimations([clip]);
  const sroot = gltf.scene;
  const R = resolveSkyrimSourceNodes(sroot, SEL);
  const sn = { root:R.nodes.root, pelvis:R.nodes.pelvis, head:R.nodes.head };
  const bones = character.rig.bones;
  const sPos=()=>{sroot.updateMatrixWorld(true);return {root:sn.root.getWorldPosition(V()),pelvis:sn.pelvis.getWorldPosition(V()),head:sn.head.getWorldPosition(V())};};
  const tPos=()=>{character.object3d.updateMatrixWorld(true);return {root:bones.root.getWorldPosition(V()),pelvis:bones.hips.getWorldPosition(V()),head:bones.head.getWorldPosition(V())};};
  const sp0=sPos(); const tp0=tPos();
  const d=sp0.head.clone().sub(sp0.root);
  const axis=['x','y','z'].reduce((a,b)=>Math.abs(d[b])>Math.abs(d[a])?b:a,'x');
  const up=Math.sign(d[axis])||1, sStat=Math.abs(d[axis]);
  const tStat=tp0.head.y-tp0.root.y;
  const sh=(p,v)=>(up*(v[axis]-p.root[axis]))/sStat;
  const th=(p,v)=>(v.y-p.root.y)/tStat;
  const sRestP=sh(sp0,sp0.pelvis), tRestP=th(tp0,tp0.pelvis);
  // full 3-vector rest offsets
  const sRestVec = sp0.pelvis.clone().sub(sp0.root);
  const tRestVec = tp0.pelvis.clone().sub(tp0.root);
  const basisQ = new THREE.Quaternion().fromArray(clip.userData.basisCalibration.quaternion);
  const scale = clip.userData.translationScale;

  const dur=character.getAnimationDuration(clip.name);
  const mixer=new THREE.AnimationMixer(sroot);
  const a=mixer.clipAction(gltf.animations[0]); a.setLoop(THREE.LoopOnce,1); a.clampWhenFinished=true; a.play();
  const sdur=gltf.animations[0].duration;

  const scan=(times, tag)=>{
    let worst={dd:0,f:0}, worst3={m:0,f:0,vec:null};
    for(const f of times){
      mixer.setTime(sdur*f); const sp=sPos();
      character.sampleAnimation(clip.name, dur*f); const tp=tPos();
      const dd=(th(tp,tp.pelvis)-tRestP)-(sh(sp,sp.pelvis)-sRestP);
      if(Math.abs(dd)>Math.abs(worst.dd)) worst={dd,f};
      // FULL 3D: what the retarget PROMISES vs what the target actually shows
      const sDelta = sp.pelvis.clone().sub(sp.root).sub(sRestVec);       // source world delta
      const predicted = sDelta.clone().applyQuaternion(basisQ).multiplyScalar(scale); // target-frame promise
      const actual = tp.pelvis.clone().sub(tp.root).sub(tRestVec);        // target world delta
      // normalise both by target stature so it reads in the same 'pts'
      const err = actual.clone().sub(predicted).divideScalar(tStat);
      if(err.length()>worst3.m) worst3={m:err.length(),f,vec:err.clone(),
        act:actual.clone().divideScalar(tStat), pred:predicted.clone().divideScalar(tStat)};
    }
    return {worst,worst3,tag};
  };
  const grid=[]; for(let i=0;i<=200;i++) grid.push(i/200);
  const keyTimes=[]; { const step=1/30; for(let t=0;t<sdur-step*0.25;t+=step) keyTimes.push(t/sdur); if(!keyTimes.length||Math.abs(keyTimes.at(-1)*sdur-sdur)>1e-5) keyTimes.push(1); }
  const g=scan(grid,'201-grid'); const k=scan(keyTimes,'30fps-keys');
  console.log(`\n=== ${label}  dur ${sdur.toFixed(4)}  basis angle ${clip.userData.basisCalibration.angleDegrees.toFixed(4)} deg  scale ${scale.toExponential(6)}`);
  console.log(`  VERTICAL-only pelvis delta disagreement: 201-grid ${P(g.worst.dd)} pts at f=${g.worst.f.toFixed(3)} | at 30fps keys ${P(k.worst.dd)} pts at f=${k.worst.f.toFixed(3)}`);
  console.log(`  FULL-3D pelvis delta error (|actual-promised|/tStat): 201-grid ${P(g.worst3.m)} pts at f=${g.worst3.f.toFixed(3)}`);
  console.log(`     at that f: actual ${g.worst3.act.toArray().map(v=>P(v)).join(', ')}  promised ${g.worst3.pred.toArray().map(v=>P(v)).join(', ')}`);
  console.log(`  FULL-3D at 30fps keys: ${P(k.worst3.m)} pts at f=${k.worst3.f.toFixed(3)}`);
}
