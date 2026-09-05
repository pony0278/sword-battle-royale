// Adversarial probe. Rebuilds the sink numbers AND asks the question the claim does not:
// what happens to the TARGET's feet while the pelvis is dragged down.
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
  'assets/skyrim/greatsword/converted/2hm_idle_alt.source.glb',
  'assets/skyrim/greatsword/converted/2hm_idle.source.glb',
  'assets/skyrim/guard/converted/shd_blockidle.source.glb',
  'assets/skyrim/guard/converted/shd_blockbash.source.glb',
  'assets/skyrim/guard/converted/shd_blockhit.source.glb',
  'assets/skyrim/guard/converted/shd_blockbashpower.source.glb',
];

const EXTRA = Object.freeze([
  ...SKYRIM_BONE_RETARGETS.filter(({ id }) => ['root','pelvis','head'].includes(id)),
  Object.freeze({ id:'foot.l', sourceAliases:Object.freeze(['NPC L Foot [Lft ]','NPC L Foot','L Foot']), target:'foot.l' }),
  Object.freeze({ id:'foot.r', sourceAliases:Object.freeze(['NPC R Foot [Rft ]','NPC R Foot','R Foot']), target:'foot.r' }),
  Object.freeze({ id:'toes.l', sourceAliases:Object.freeze(['NPC L Toe0 [LToe]','NPC L Toe0','L Toe0']), target:'toes.l' }),
  Object.freeze({ id:'toes.r', sourceAliases:Object.freeze(['NPC R Toe0 [RToe]','NPC R Toe0','R Toe0']), target:'toes.r' }),
  Object.freeze({ id:'upperleg.l', sourceAliases:Object.freeze(['NPC L Thigh [LThg]','NPC L Thigh','L Thigh']), target:'upperleg.l' }),
  Object.freeze({ id:'lowerleg.l', sourceAliases:Object.freeze(['NPC L Calf [LClf]','NPC L Calf','L Calf']), target:'lowerleg.l' }),
]);
const TB = { root:'root', pelvis:'hips', head:'head', footL:'foot.l', footR:'foot.r', toeL:'toes.l', toeR:'toes.r', thighL:'upperleg.l', calfL:'lowerleg.l' };
const SK = { root:'root', pelvis:'pelvis', head:'head', footL:'foot.l', footR:'foot.r', toeL:'toes.l', toeR:'toes.r', thighL:'upperleg.l', calfL:'lowerleg.l' };

const N = 200;
const out = [];
for (const rel of CLIPS) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, rel)));
  const character = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, character.rig, {
    id:'p', file:path.basename(rel), clipId:'SKYRIM_SOURCE/p', role:'measurement' }, { fps: 30 });
  character.registerAnimations([clip]);

  const sroot = gltf.scene;
  const res = resolveSkyrimSourceNodes(sroot, EXTRA);
  if (!res.valid) throw new Error(`${rel}: missing ${res.missing.join(',')}`);
  const sn = Object.fromEntries(Object.entries(SK).map(([k,v]) => [k, res.nodes[v]]));
  const bones = character.rig.bones;

  const V = () => new THREE.Vector3();
  function sPos() { sroot.updateMatrixWorld(true);
    return Object.fromEntries(Object.entries(sn).map(([k,n]) => [k, n.getWorldPosition(V())])); }
  function tPos() { character.object3d.updateMatrixWorld(true);
    return Object.fromEntries(Object.entries(TB).map(([k,n]) => [k, bones[n].getWorldPosition(V())])); }

  const sp0 = sPos();
  const d = sp0.head.clone().sub(sp0.root);
  const axis = ['x','y','z'].reduce((a,b)=>Math.abs(d[b])>Math.abs(d[a])?b:a,'x');
  const up = Math.sign(d[axis])||1; const sStat = Math.abs(d[axis]);
  const sh = (p,v) => (up*(v[axis]-p.root[axis]))/sStat;
  const tp0 = tPos();
  const tStat = tp0.head.y - tp0.root.y;
  const th = (p,v) => (v.y - p.root.y)/tStat;

  const sRest = Object.fromEntries(Object.entries(sp0).map(([k,v])=>[k, sh(sp0,v)]));
  const tRest = Object.fromEntries(Object.entries(tp0).map(([k,v])=>[k, th(tp0,v)]));

  const dur = character.getAnimationDuration(clip.name);
  const mixer = new THREE.AnimationMixer(sroot);
  const action = mixer.clipAction(gltf.animations[0]);
  action.setLoop(THREE.LoopOnce,1); action.clampWhenFinished = true; action.play();
  const sdur = gltf.animations[0].duration;

  const acc = { headMin:1e9, sPelvMin:1e9, tPelvMin:1e9, tFootMin:1e9, sFootMin:1e9,
    tToeMin:1e9, deltaDiffMax:0, liveDiffMax:0, tFootMax:-1e9, sFootMax:-1e9, tLegMin:1e9, sLegMin:1e9 };
  for (let i=0;i<=N;i++){
    const f=i/N;
    mixer.setTime(sdur*f); const sp=sPos();
    character.sampleAnimation(clip.name, dur*f); const tp=tPos();
    const sH = { }; for (const k of Object.keys(sp)) sH[k]=sh(sp,sp[k]);
    const tH = { }; for (const k of Object.keys(tp)) tH[k]=th(tp,tp[k]);
    acc.headMin = Math.min(acc.headMin, sH.head);
    acc.sPelvMin = Math.min(acc.sPelvMin, sH.pelvis);
    acc.tPelvMin = Math.min(acc.tPelvMin, tH.pelvis);
    const tFoot = Math.min(tH.footL,tH.footR), sFoot = Math.min(sH.footL,sH.footR);
    acc.tFootMin = Math.min(acc.tFootMin, tFoot); acc.sFootMin = Math.min(acc.sFootMin, sFoot);
    acc.tFootMax = Math.max(acc.tFootMax, Math.max(tH.footL,tH.footR));
    acc.sFootMax = Math.max(acc.sFootMax, Math.max(sH.footL,sH.footR));
    acc.tToeMin = Math.min(acc.tToeMin, Math.min(tH.toeL,tH.toeR));
    // rest-normalised delta agreement (the honest normaliser)
    const dd = (tH.pelvis - tRest.pelvis) - (sH.pelvis - sRest.pelvis);
    if (Math.abs(dd) > Math.abs(acc.deltaDiffMax)) acc.deltaDiffMax = dd;
    // live-normaliser artefact: divide by each rig's CURRENT head-to-root
    const sLive = (up*(sp.pelvis[axis]-sp.root[axis]))/(up*(sp.head[axis]-sp.root[axis]));
    const tLive = (tp.pelvis.y-tp.root.y)/(tp.head.y-tp.root.y);
    const ld = (tLive - tRest.pelvis) - (sLive - sRest.pelvis);
    if (Math.abs(ld) > Math.abs(acc.liveDiffMax)) acc.liveDiffMax = ld;
    // straight-line pelvis->foot span, as a check on how compressed the legs get
    acc.tLegMin = Math.min(acc.tLegMin, tp.pelvis.distanceTo(tp.footL)/tStat);
    acc.sLegMin = Math.min(acc.sLegMin, sp.pelvis.distanceTo(sp.footL)/sStat);
  }
  const P = (v)=> (v*100).toFixed(2);
  out.push({ rel:path.basename(rel), sRest, tRest, acc, sStat, tStat,
    sLegRest: sp0.pelvis.distanceTo(sp0.footL)/sStat, tLegRest: tp0.pelvis.distanceTo(tp0.footL)/tStat });
  console.log(`\n=== ${path.basename(rel)}  (src stature ${sStat.toFixed(3)} / tgt ${tStat.toFixed(4)})`);
  console.log(`  rest      pelvis src ${P(sRest.pelvis)} tgt ${P(tRest.pelvis)} | foot src ${P(sRest.footL)} tgt ${P(tRest.footL)} | toe tgt ${P(tRest.toeL)}`);
  console.log(`  rest legspan(pelvis->foot.l straight)  src ${P(sp0.pelvis.distanceTo(sp0.footL)/sStat)}  tgt ${P(tp0.pelvis.distanceTo(tp0.footL)/tStat)}`);
  console.log(`  deepest source head    ${P(acc.headMin)}  -> head SINK ${P(1-acc.headMin)} pts`);
  console.log(`  deepest source pelvis  ${P(acc.sPelvMin)}  sink ${P(sRest.pelvis-acc.sPelvMin)} pts`);
  console.log(`  deepest target pelvis  ${P(acc.tPelvMin)}  sink ${P(tRest.pelvis-acc.tPelvMin)} pts`);
  console.log(`  rest-normalised pelvis delta disagreement (max |.|)  ${P(acc.deltaDiffMax)} pts`);
  console.log(`  LIVE-normalised pelvis disagreement       (max |.|)  ${P(acc.liveDiffMax)} pts`);
  console.log(`  source foot min ${P(acc.sFootMin)}  max ${P(acc.sFootMax)}   (rest ${P(sRest.footL)})`);
  console.log(`  TARGET foot min ${P(acc.tFootMin)}  max ${P(acc.tFootMax)}   (rest ${P(tRest.footL)})`);
  console.log(`  TARGET toe  min ${P(acc.tToeMin)}                        (rest ${P(tRest.toeL)})`);
  console.log(`  min pelvis->foot straight span  src ${P(acc.sLegMin)}  tgt ${P(acc.tLegMin)}`);
}
