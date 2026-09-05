// Does the "delta is carried faithfully" metric measure animation quality at all?
// Test: retarget each clip TWICE - once as shipped (translationScale = stature ratio, the
// default), once with a LEG-PROPORTIONAL translation scale - and score both with
//   (a) the claim's metric: rest-normalised pelvis delta agreement
//   (b) an animator's metric: does the toe go through the floor (world y < 0, repo's floor)
import { readFile } from 'node:fs/promises';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { retargetSkyrimClip, SKYRIM_BONE_RETARGETS, resolveSkyrimSourceNodes } from '../src/animation/skyrim-animation-retarget.js';
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
const EXTRA = Object.freeze([
  ...SKYRIM_BONE_RETARGETS.filter(({id})=>['root','pelvis','head'].includes(id)),
  Object.freeze({id:'foot.l',sourceAliases:Object.freeze(['NPC L Foot [Lft ]','NPC L Foot']),target:'foot.l'}),
  Object.freeze({id:'foot.r',sourceAliases:Object.freeze(['NPC R Foot [Rft ]','NPC R Foot']),target:'foot.r'}),
  Object.freeze({id:'toes.l',sourceAliases:Object.freeze(['NPC L Toe0 [LToe]','NPC L Toe0']),target:'toes.l'}),
  Object.freeze({id:'toes.r',sourceAliases:Object.freeze(['NPC R Toe0 [RToe]','NPC R Toe0']),target:'toes.r'}),
]);
const V = () => new THREE.Vector3();
const N = 200;

// --- rig rest, read straight from restTransforms, not from a posed scene -------------------
const c0 = createDefaultCharacter(THREE);
c0.object3d.updateMatrixWorld(true);
const b0 = c0.rig.bones;
const wy = (n) => b0[n].getWorldPosition(V()).y;
const tStat = wy('head') - wy('root');
const tLegRest = b0.hips.getWorldPosition(V()).distanceTo(b0['foot.l'].getWorldPosition(V()));
console.log(`TARGET rest  root y ${wy('root').toFixed(4)}  head ${wy('head').toFixed(4)}  stature ${tStat.toFixed(4)}`);
console.log(`             hips ${wy('hips').toFixed(4)} (${(100*(wy('hips')-wy('root'))/tStat).toFixed(2)}%)  foot.l ${wy('foot.l').toFixed(4)} (${(100*(wy('foot.l')-wy('root'))/tStat).toFixed(2)}%)  toes.l ${wy('toes.l').toFixed(4)} (${(100*(wy('toes.l')-wy('root'))/tStat).toFixed(2)}%)`);
console.log(`             hips->foot.l span ${tLegRest.toFixed(4)} = ${(100*tLegRest/tStat).toFixed(2)}% of stature`);
console.log(`repo ground contact test (locomotion-phase-alignment.js): toe below 0.04 m == on the ground`);
console.log(`  -> at rest the target toe is ${wy('toes.l').toFixed(4)} m: ON the ground by the repo's own test\n`);

const P = (v)=>(v*100).toFixed(2);
const rows = [];
for (const [name, rel] of CLIPS) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, rel)));
  const sroot = gltf.scene;
  const res = resolveSkyrimSourceNodes(sroot, EXTRA);
  if (!res.valid) throw new Error(`${name}: ${res.missing}`);
  sroot.updateMatrixWorld(true);
  const sP = (id) => res.nodes[id].getWorldPosition(V());
  const d = sP('head').clone().sub(sP('root'));
  const ax = ['x','y','z'].reduce((a,b)=>Math.abs(d[b])>Math.abs(d[a])?b:a,'x');
  const up = Math.sign(d[ax])||1, sStat = Math.abs(d[ax]);
  const sRoot0 = sP('root');
  const sh = (v,r)=> (up*(v[ax]-r[ax]))/sStat;
  const sRest = Object.fromEntries(['pelvis','foot.l','foot.r','toes.l','toes.r'].map(k=>[k, sh(sP(k), sRoot0)]));
  const sLegRest = sP('pelvis').distanceTo(sP('foot.l'));

  // two translation scales: shipped (stature ratio) and leg-proportional
  const statureScale = tStat / sStat;
  const legScale = tLegRest / sLegRest;

  const variants = {};
  for (const [label, scale] of [['shipped', undefined], ['leg-proportional', legScale]]) {
    const ch = createDefaultCharacter(THREE);
    const clip = retargetSkyrimClip(THREE, { scene: sroot, animations: [gltf.animations[0]] }, ch.rig,
      { fps: 30, clipId: 'V/'+name, ...(scale ? { translationScale: scale } : {}) });
    ch.registerAnimations([clip]);
    variants[label] = { ch, clip, dur: ch.getAnimationDuration(clip.name), scale: clip.userData.translationScale };
  }

  const mx = new THREE.AnimationMixer(sroot);
  const ac = mx.clipAction(gltf.animations[0]); ac.setLoop(THREE.LoopOnce,1); ac.clampWhenFinished=true; ac.play();
  const sdur = gltf.animations[0].duration;

  const acc = {};
  for (const k of Object.keys(variants)) acc[k] = { toeMin: 1e9, deltaMax: 0, below0: 0, deepFrame: -1, footBelowRest: 0 };
  let sToeMin = 1e9, sFootBelowRest = 0, sPelvSink = 0;

  for (let i=0;i<=N;i++){
    const f = i/N;
    mx.setTime(sdur*f); sroot.updateMatrixWorld(true);
    const r = sP('root');
    const sPelv = sh(sP('pelvis'), r);
    sPelvSink = Math.max(sPelvSink, sRest.pelvis - sPelv);
    sToeMin = Math.min(sToeMin, sh(sP('toes.l'),r), sh(sP('toes.r'),r));
    for (const side of ['l','r']) sFootBelowRest = Math.min(sFootBelowRest, sh(sP(`foot.${side}`),r) - sRest[`foot.${side}`]);
    for (const [k, v] of Object.entries(variants)) {
      v.ch.sampleAnimation(v.clip.name, v.dur*f); v.ch.object3d.updateMatrixWorld(true);
      const bones = v.ch.rig.bones;
      const ty = (n) => bones[n].getWorldPosition(V()).y;
      const rootY = ty('root');
      const toe = Math.min(ty('toes.l'), ty('toes.r'));
      if (toe < acc[k].toeMin) { acc[k].toeMin = toe; acc[k].deepFrame = f; }
      if (toe < 0) acc[k].below0++;
      for (const side of ['l','r']) acc[k].footBelowRest = Math.min(acc[k].footBelowRest, (ty(`foot.${side}`)-rootY)/tStat - (wy(`foot.${side}`)-wy('root'))/tStat);
      const tPelv = (ty('hips')-rootY)/tStat;
      const dd = (tPelv - (wy('hips')-wy('root'))/tStat) - (sPelv - sRest.pelvis);
      if (Math.abs(dd) > Math.abs(acc[k].deltaMax)) acc[k].deltaMax = dd;
    }
  }
  rows.push({ name, statureScale, legScale, sToeMin, sFootBelowRest, sPelvSink, acc,
    sLegPct: 100*sLegRest/sStat, actual: Object.fromEntries(Object.entries(variants).map(([k,v])=>[k, v.scale])) });
  console.log(`--- ${name}`);
  console.log(`    source: pelvis sink ${P(sPelvSink)} pts | toe min ${P(sToeMin)} pts of stature | planted foot never below its own rest by more than ${P(-sFootBelowRest)} pts`);
  console.log(`    source leg (pelvis->foot.l) ${(100*sLegRest/sStat).toFixed(2)}% of stature vs target ${(100*tLegRest/tStat).toFixed(2)}%  -> legScale/statureScale = ${(legScale/statureScale).toFixed(4)}`);
  for (const k of ['shipped','leg-proportional']) {
    const a = acc[k];
    console.log(`    ${k.padEnd(17)} scale ${variants[k].scale.toFixed(6)} | CLAIM'S METRIC pelvis delta disagreement ${P(a.deltaMax).padStart(6)} pts | toe min ${a.toeMin.toFixed(4)} m | frames toe<floor ${String(a.below0).padStart(3)}/201 | foot below own rest ${P(-a.footBelowRest)} pts`);
  }
}
