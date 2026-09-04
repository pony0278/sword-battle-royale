import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import { loadKayKitAnimationLibrary } from '../../src/animation/kaykit-animation-library.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../src/animation/skyrim-converted-animation-library.js';
import { PRODUCTION_PARRY_DEFLECT_CLIP_IDS } from '../../src/animation/parry-contact-deflect-runtime-clip.js';
import { composeSkyrimWeaponMountCalibration } from '../../src/animation/skyrim-weapon-bind-calibration.js';
import { GUARD_EVENTS, GUARD_STATES, createGuardStateMachine } from '../../src/combat/guard-state-machine.js';
import { createGuardPresentationRuntime } from '../../src/combat/guard-presentation-runtime.js';
import { GUARD_COUNTER_PROFILE_IDS, GUARD_WEAPON_MOUNT_PROFILE_IDS } from '../../src/combat/guard-counter-presentation.js';
import { createGuardWeaponMountRuntime } from '../../src/combat/guard-weapon-mount-runtime.js';
import { captureRigPose } from '../../src/combat/guard-recovery-bridge.js';
import { quaternionAngleDegrees } from '../../src/combat/guard-world-sword-orientation.js';

const THREE=window.THREE;
if(!THREE?.WebGLRenderer||!THREE?.GLTFLoader) throw new Error('G3.4 requires Three.js + GLTFLoader');
const canvas=document.getElementById('canvas');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2)); renderer.outputEncoding=THREE.sRGBEncoding;
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x0b1018);
const camera=new THREE.PerspectiveCamera(38,1,.05,100);
scene.add(new THREE.HemisphereLight(0xffffff,0x27344a,1.25));
const key=new THREE.DirectionalLight(0xffffff,.95); key.position.set(3,5,4); scene.add(key);
scene.add(new THREE.GridHelper(8,16,0x34435d,0x202a3b));
const character=createDefaultCharacter(THREE); scene.add(character.object3d);
const machine=createGuardStateMachine();
let runtime,sword,mountRuntime,activeVariant='normal',counterDurationMs=750;
let canonicalHoldPose=null,canonicalHoldWorld=null,canonicalHoldMount=null;
const mountHistory=[];
const RIGHT_CHAIN=['upperarm.r','lowerarm.r','wrist.r','hand.r','handslot.r'];
const PRODUCTION_SKYRIM_LIBRARY_CLIPS=[
  'SKYRIM_GUARD/shd_blockidle',
  'SKYRIM_GUARD/shd_blockhit',
  'SKYRIM_GUARD/shd_blockbash',
  'SKYRIM_GUARD/shd_blockbashpower',
  PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PARRY,
  PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY,
];
const status=document.getElementById('status'), reportNode=document.getElementById('report');
const hudState=document.getElementById('hudState'), hudDetail=document.getElementById('hudDetail');
const timeline=document.getElementById('timeline'), timeLabel=document.getElementById('timeLabel');

function setView(v){
  if(v==='front') camera.position.set(0,1.42,5.3); else if(v==='side') camera.position.set(5.2,1.45,0);
  else if(v==='back') camera.position.set(0,1.42,-5.3); else camera.position.set(4,1.58,4.25);
  camera.lookAt(0,1,0); camera.updateMatrixWorld(true);
}
function resize(){ const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight); renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
function applyMount(profileId,snapshot){ const r=mountRuntime?.apply(profileId); if(r?.applied){ mountHistory.push({profileId,state:snapshot?.state||null,sequence:snapshot?.sequence??null}); sword?.update(); } }
function mountSnapshot(){ const o=sword?.object3d; return o?{p:[o.position.x,o.position.y,o.position.z],q:[o.quaternion.x,o.quaternion.y,o.quaternion.z,o.quaternion.w],s:[o.scale.x,o.scale.y,o.scale.z]}:null; }
function mountDelta(a,b){ if(!a||!b)return Infinity; return Math.max(...a.p.map((v,i)=>Math.abs(v-b.p[i])),...a.q.map((v,i)=>Math.abs(v-b.q[i])),...a.s.map((v,i)=>Math.abs(v-b.s[i]))); }
function worldSwordQuaternion(){
  const o=sword?.object3d; if(!o)return null; character.object3d.updateMatrixWorld(true); o.updateWorldMatrix?.(true,false);
  const q=new THREE.Quaternion(); o.getWorldQuaternion(q); return {x:q.x,y:q.y,z:q.z,w:q.w};
}
function monotonicAngles(samples,target){
  const rows=samples.map(sample=>({...sample,angleToGuardDeg:quaternionAngleDegrees(sample.quaternion,target)}));
  const monotonic=rows.every((row,index)=>index===0||row.angleToGuardDeg<=rows[index-1].angleToGuardDeg+0.05);
  return {rows,monotonic};
}
function holdParity(initialPose,finalPose,initialMount,finalMount,initialWorld,finalWorld){
  const rightChain=Object.fromEntries(RIGHT_CHAIN.map(id=>[id,quaternionAngleDegrees(initialPose?.[id]?.quaternion,finalPose?.[id]?.quaternion)]));
  return {
    rightChainDeg:rightChain,
    maxRightChainDeg:Math.max(...Object.values(rightChain)),
    localMountDelta:mountDelta(initialMount,finalMount),
    worldSwordDeltaDeg:quaternionAngleDegrees(initialWorld,finalWorld),
  };
}
function resetToHold(){
  machine.send(GUARD_EVENTS.RESET); runtime.sync(camera); machine.send(GUARD_EVENTS.GUARD_PRESS); runtime.sync(camera);
  const r=runtime.update(180,camera); if(r.snapshot.state!==GUARD_STATES.HOLD) throw new Error(`Guard Enter failed: ${r.snapshot.state}`);
  canonicalHoldPose=captureRigPose(character.rig); canonicalHoldMount=mountSnapshot(); canonicalHoldWorld=worldSwordQuaternion();
  return r;
}
function openCounterWindow(variant){
  resetToHold(); const perfect=variant==='perfect';
  machine.send(GUARD_EVENTS.PARRY_CONFIRMED,{perfect,verification:`g34-${variant}-parry`}); runtime.sync(camera);
  const r=runtime.update(perfect?120:100,camera);
  if(r.snapshot.state!==GUARD_STATES.PARRY||!r.report.counterWindowOpen) throw new Error(`Counter window missing: ${variant}`);
  return r;
}
function confirmCounter(variant){
  const r=machine.send(GUARD_EVENTS.COUNTER_CONFIRMED,{authorityTick:variant==='perfect'?3402:3401,verification:`g34-${variant}-counter`});
  if(!r.accepted||r.snapshot.state!==GUARD_STATES.COUNTER) throw new Error(`COUNTER_CONFIRMED rejected: ${variant}`);
  return {confirmed:r,synced:runtime.sync(camera)};
}
function displayCounter(variant,elapsedMs){
  openCounterWindow(variant); confirmCounter(variant);
  const t=Math.max(0,Math.min(Number(elapsedMs)||0,counterDurationMs)); const r=runtime.update(t,camera); activeVariant=variant;
  timeline.max=String(Math.ceil(counterDurationMs)); timeline.value=String(Math.min(Number(timeline.max),t)); timeLabel.textContent=`${Math.round(t)} ms`;
  hudState.textContent=`${variant.toUpperCase()} · ${r.snapshot.state}`;
  hudDetail.textContent=`${r.report.clipId||'—'} · source ${r.report.sourceTimeSeconds.toFixed(3)}s · mount ${r.report.weaponMountProfileId||'—'}`;
  character.object3d.updateMatrixWorld(true); sword?.update(); return r;
}
function verifyScenario(variant){
  const historyStart=mountHistory.length, window=openCounterWindow(variant);
  const initialHoldPose=canonicalHoldPose,initialHoldMount=canonicalHoldMount,initialHoldWorld=canonicalHoldWorld;
  const noAuto=window.snapshot.state===GUARD_STATES.PARRY&&window.report.counterWindowOpen&&window.snapshot.lastOutcome==='parry';
  const {confirmed,synced:start}=confirmCounter(variant);
  const before=runtime.update(Math.max(0,counterDurationMs-2),camera), sourceMount=mountSnapshot(),sourceWorld=worldSwordQuaternion();
  const ended=runtime.update(3,camera), completion=ended.snapshot.lastTransition, recoverStartMount=mountSnapshot(),recoverStartWorld=worldSwordQuaternion();
  const recoveryDurationMs=Number(ended.report.recoveryDurationMs)||0;
  const recoveryProfileId=ended.report.recoveryProfileId||null;
  const startMountContinuous=mountDelta(sourceMount,recoverStartMount)<1e-5;
  const startWorldDeltaDeg=quaternionAngleDegrees(sourceWorld,recoverStartWorld);
  const startWorldContinuous=startWorldDeltaDeg<1;
  const checkpoints=[0,.05,.10,.25,.50,.75,1],worldSamples=[{progress:0,quaternion:recoverStartWorld,stabilized:Boolean(ended.report.worldSwordOrientationStabilized)}];
  let cursor=0,current=ended,midMount=null;
  for(const progress of checkpoints.slice(1)){
    current=runtime.update((progress-cursor)*recoveryDurationMs,camera); cursor=progress;
    if(Math.abs(progress-.5)<1e-6) midMount=mountSnapshot();
    worldSamples.push({progress,quaternion:worldSwordQuaternion(),stabilized:progress>=1?true:Boolean(current.report.worldSwordOrientationStabilized)});
  }
  const finish=current,targetMount=mountSnapshot(),targetWorld=worldSamples.at(-1).quaternion;
  const finalHoldPose=captureRigPose(character.rig);
  const holdParityReport=holdParity(initialHoldPose,finalHoldPose,initialHoldMount,targetMount,initialHoldWorld,targetWorld);
  const worldTrajectory=monotonicAngles(worldSamples,targetWorld);
  const worldSwordShortestPath=startWorldContinuous&&worldTrajectory.monotonic&&worldTrajectory.rows.slice(0,-1).every(row=>row.stabilized);
  const mountActuallyBlends=mountDelta(recoverStartMount,midMount)>1e-5&&mountDelta(midMount,targetMount)>1e-5;
  const history=mountHistory.slice(historyStart);
  const sawKayKit=history.some(x=>x.profileId===GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT);
  const sawSkyrimRecover=history.some(x=>x.profileId===GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD&&x.state===GUARD_STATES.RECOVER);
  const pass=noAuto&&confirmed.snapshot.lastTransition?.authority==='authoritative-combat'&&start.report.clipId==='Melee_Block_Attack'
    &&start.report.counterProfileId===GUARD_COUNTER_PROFILE_IDS.LONGSWORD&&start.report.weaponMountProfileId===GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT
    &&start.report.correctionWeight===0&&before.snapshot.state===GUARD_STATES.COUNTER&&completion?.event===GUARD_EVENTS.COUNTER_COMPLETE
    &&completion?.authority==='presentation'&&completion?.payload?.counterProfileId===GUARD_COUNTER_PROFILE_IDS.LONGSWORD
    &&ended.snapshot.state===GUARD_STATES.RECOVER&&ended.report.weaponMountProfileId===GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD
    &&Boolean(recoveryProfileId)&&recoveryDurationMs>0&&mountActuallyBlends&&worldSwordShortestPath&&finish.snapshot.state===GUARD_STATES.HOLD
    &&sawKayKit&&sawSkyrimRecover;
  return {variant,noAutoCounter:noAuto,confirmAuthority:confirmed.snapshot.lastTransition?.authority||null,counterClip:start.report.clipId,
    counterProfileId:start.report.counterProfileId,counterMount:start.report.weaponMountProfileId,counterCorrectionWeight:start.report.correctionWeight,
    beforeEndState:before.snapshot.state,completionEvent:completion?.event||null,completionAuthority:completion?.authority||null,
    completionProfileId:completion?.payload?.counterProfileId||null,afterCounterState:ended.snapshot.state,afterCounterMount:ended.report.weaponMountProfileId,
    recoveryProfileId,recoveryDurationMs,startMountContinuous,startWorldDeltaDeg,startWorldContinuous,mountActuallyBlends,worldSwordShortestPath,
    holdParity:holdParityReport,worldTrajectory:worldTrajectory.rows,afterRecoveryState:finish.snapshot.state,sawKayKitMount:sawKayKit,sawSkyrimRecoverMount:sawSkyrimRecover,pass};
}
function runVerification(kaykit,skyrim){
  const clip=kaykit.clips.get('Melee_Block_Attack'); counterDurationMs=Math.max(.001,Number(clip?.duration)||0)*1000;
  const diagnostics=character.animation.getPreparedClipDiagnostics('Melee_Block_Attack',true);
  const normal=verifyScenario('normal'),perfect=verifyScenario('perfect');
  const gates={skyrimGuardFamilyLoaded:PRODUCTION_SKYRIM_LIBRARY_CLIPS.every(id=>skyrim.clips.has(id))&&skyrim.clips.size>=6,kaykitCounterPresent:Boolean(clip),counterDurationPositive:counterDurationMs>1,
    inPlaceRootPositionRemoved:diagnostics.preparedRootPositionTracks===0,normalCounterRuntime:normal.pass,perfectCounterRuntime:perfect.pass,
    poseMatchedMountRecovery:normal.mountActuallyBlends&&perfect.mountActuallyBlends,
    worldSwordStartContinuous:normal.startWorldContinuous&&perfect.startWorldContinuous,
    worldSwordOrientationMonotonic:normal.worldSwordShortestPath&&perfect.worldSwordShortestPath};
  const failures=Object.entries(gates).filter(([,v])=>!v).map(([k])=>k), report={stage:'G3.4.1.1',pass:failures.length===0,
    counterClip:{name:clip?.name||null,durationSeconds:Number(clip?.duration)||0,diagnostics},scenarios:{normal,perfect},mountHistory:[...mountHistory],gates,failures};
  document.documentElement.dataset.g34=report.pass?'pass':'fail'; document.documentElement.dataset.g34Normal=normal.pass?'pass':'fail';
  document.documentElement.dataset.g34Perfect=perfect.pass?'pass':'fail'; document.documentElement.dataset.g34CounterClip=clip?'pass':'fail';
  document.documentElement.dataset.g341Recovery=gates.poseMatchedMountRecovery?'pass':'fail';
  document.documentElement.dataset.g3411WorldSword=gates.worldSwordOrientationMonotonic?'pass':'fail';
  reportNode.textContent=JSON.stringify(report,null,2); window.__G34_RESULT__=report; status.textContent=`G3.4.1.1 ${report.pass?'PASS':'FAIL'} · authoritative Counter + world-space sword recovery`; status.className=report.pass?'good':'bad'; return report;
}
async function main(){
  const loader=new THREE.GLTFLoader();
  const [skyrim,kaykit]=await Promise.all([loadSkyrimConvertedAnimationLibrary(loader,{THREE,rig:character.rig,fps:30}),loadKayKitAnimationLibrary(loader,{packIds:['melee']})]);
  character.registerAnimations(skyrim); character.registerAnimations(kaykit);
  const bind=skyrim.clips.get('SKYRIM_GUARD/shd_blockidle')?.userData?.weaponBindCalibration;
  if(!bind?.correctionQuaternion) throw new Error('G3.4 requires accepted G2.4.5 Skyrim weapon bind calibration');
  const skyrimMount=composeSkyrimWeaponMountCalibration(THREE,DEFAULT_KAYKIT_SWORD_MOUNT,bind);
  sword=createDebugSword(THREE); mountDebugSword(character,sword,skyrimMount);
  mountRuntime=createGuardWeaponMountRuntime({weapon:sword,profiles:{[GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD]:skyrimMount,[GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT]:DEFAULT_KAYKIT_SWORD_MOUNT}});
  runtime=createGuardPresentationRuntime(THREE,{machine,character,weaponObject3d:sword.object3d,applyWeaponMountProfile:applyMount});
  runVerification(kaykit,skyrim);
  const p=new URLSearchParams(location.search),variant=p.get('variant')==='perfect'?'perfect':'normal',elapsed=Number(p.get('elapsed'));
  displayCounter(variant,Number.isFinite(elapsed)?elapsed:counterDurationMs*.5);
}
document.querySelectorAll('[data-variant]').forEach(b=>b.addEventListener('click',()=>displayCounter(b.dataset.variant==='perfect'?'perfect':'normal',counterDurationMs*.5)));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
timeline.addEventListener('input',()=>displayCounter(activeVariant,Number(timeline.value)));
setView(new URLSearchParams(location.search).get('view')||'three'); resize(); addEventListener('resize',resize);
(function frame(){if(sword)sword.update();renderer.render(scene,camera);requestAnimationFrame(frame)})();
main().catch(error=>{document.documentElement.dataset.g34='fail';status.textContent=`G3.4.1.1 FAIL · ${error?.message||error}`;status.className='bad';reportNode.textContent=error?.stack||String(error);window.__G34_RESULT__={stage:'G3.4.1.1',pass:false,error:error?.stack||String(error)}});
window.__G34_LAB__={displayCounter};
