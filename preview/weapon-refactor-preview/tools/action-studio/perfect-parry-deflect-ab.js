import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../../src/animation/skyrim-weapon-bind-calibration.js';
import { PARRY_CONTACT_DEFLECT_PHASES } from '../../src/combat/parry-contact-deflect-probe.js';
import {
  PERFECT_PARRY_DEFLECT_AB_STAGE,
  PERFECT_PARRY_DEFLECT_CANDIDATES,
  comparePerfectParryDeflectAbContracts,
  createPerfectParryDeflectAbProfile,
  samplePerfectParryDeflectAbProfile,
} from '../../src/combat/perfect-parry-deflect-ab.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error('G3.5.1P-T2 requires Three.js + GLTFLoader');

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1018);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x27344a, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 0.95); key.position.set(3,5,4); scene.add(key);
scene.add(new THREE.GridHelper(8, 16, 0x34435d, 0x202a3b));

const character = createDefaultCharacter(THREE);
scene.add(character.object3d);
let sword = null;
let library = null;
let activeCandidate = PERFECT_PARRY_DEFLECT_CANDIDATES.SHARED;
let profile = null;
let elapsedMs = 0;
let playing = false;
let lastFrameAt = performance.now();

function createDebugShieldMarker(opacity) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color:0x8fc7ff, wireframe:true, transparent:true, opacity, depthTest:false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.055, 8, 1, false), material);
  body.rotation.x = Math.PI / 2;
  body.renderOrder = 10;
  group.add(body);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), material.clone());
  boss.position.z = 0.04;
  boss.renderOrder = 11;
  group.add(boss);
  return group;
}

const liveShieldMarker = createDebugShieldMarker(0.92);
const contactShieldGhost = createDebugShieldMarker(0.22);
scene.add(contactShieldGhost, liveShieldMarker);
const shieldContactWorld = new THREE.Vector3();
const shieldCurrentWorld = new THREE.Vector3();
const shieldVectorGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const shieldVector = new THREE.Line(shieldVectorGeometry, new THREE.LineBasicMaterial({ color:0x9fd0ff, transparent:true, opacity:0.75, depthTest:false }));
shieldVector.renderOrder = 12;
scene.add(shieldVector);

const ui = Object.fromEntries([
  'hudState','hudDetail','timeline','timeLabel','playToggle','restart','status','report','contract',
].map((id) => [id, document.getElementById(id)]));

function setView(view) {
  if (view === 'front') camera.position.set(0,1.42,5.3);
  else if (view === 'side') camera.position.set(5.2,1.45,0);
  else if (view === 'back') camera.position.set(0,1.42,-5.3);
  else camera.position.set(4.0,1.58,4.25);
  camera.lookAt(0,1.0,0);
  camera.updateMatrixWorld(true);
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width,height,false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function playbackOptions() {
  return { inPlace:true, rootRotationPolicy:'lock', loop:false };
}

function snapshotBonePose() {
  return Object.fromEntries(Object.entries(character.rig.bones).map(([name,bone]) => [name, {
    position:bone.position.clone(), quaternion:bone.quaternion.clone(), scale:bone.scale.clone(),
  }]));
}

function captureBonePose(clipId, sourceTimeSeconds) {
  character.sampleAnimation(clipId, sourceTimeSeconds, playbackOptions());
  character.object3d.updateMatrixWorld(true);
  return snapshotBonePose();
}

function applyBonePose(snapshot) {
  for (const [name, transform] of Object.entries(snapshot || {})) {
    const bone = character.rig.bones[name];
    if (!bone) continue;
    bone.position.copy(transform.position);
    bone.quaternion.copy(transform.quaternion);
    bone.scale.copy(transform.scale);
  }
  character.object3d.updateMatrixWorld(true);
  character.update(0, camera);
}

function applyBlendedPose(sample) {
  const from = captureBonePose(sample.fromClipId, sample.fromSourceTimeSeconds);
  const to = captureBonePose(sample.toClipId, sample.toSourceTimeSeconds);
  const blended = {};
  for (const name of Object.keys(from)) {
    if (!to[name]) continue;
    blended[name] = {
      position:from[name].position.clone().lerp(to[name].position, sample.blendAlpha),
      quaternion:from[name].quaternion.clone().slerp(to[name].quaternion, sample.blendAlpha),
      scale:from[name].scale.clone().lerp(to[name].scale, sample.blendAlpha),
    };
  }
  applyBonePose(blended);
}

function applySample(sample) {
  if (sample.phase === PARRY_CONTACT_DEFLECT_PHASES.BLEND) applyBlendedPose(sample);
  else character.sampleAnimation(sample.clipId, sample.sourceTimeSeconds, playbackOptions());
  character.object3d.updateMatrixWorld(true);
  character.update(0, camera);
  sword?.update();
  updateShieldMarkers();
}

function computeContactShieldReference() {
  const current = snapshotBonePose();
  character.sampleAnimation(profile.contactClipId, profile.contactWindow.endSeconds, playbackOptions());
  character.object3d.updateMatrixWorld(true);
  character.sockets.HAND_L.getWorldPosition(shieldContactWorld);
  contactShieldGhost.position.copy(shieldContactWorld);
  applyBonePose(current);
}

function updateShieldMarkers() {
  character.sockets.HAND_L.getWorldPosition(shieldCurrentWorld);
  liveShieldMarker.position.copy(shieldCurrentWorld);
  const positions = shieldVector.geometry.attributes.position;
  positions.setXYZ(0, shieldContactWorld.x, shieldContactWorld.y, shieldContactWorld.z);
  positions.setXYZ(1, shieldCurrentWorld.x, shieldCurrentWorld.y, shieldCurrentWorld.z);
  positions.needsUpdate = true;
}

function rebuildProfile() {
  profile = createPerfectParryDeflectAbProfile(activeCandidate);
  ui.timeline.max = String(Math.ceil(profile.durationMs));
  elapsedMs = Math.max(0, Math.min(elapsedMs, profile.durationMs));
  ui.timeline.value = String(Math.round(elapsedMs));
  if (library) computeContactShieldReference();
  ui.contract.textContent = [
    `${profile.t2Candidate}`,
    `contact: blockhit 0–${profile.contactWindow.endSeconds.toFixed(3)}s + ${profile.contactHoldMs}ms hold`,
    `blend: ${profile.blendMs}ms`,
    `deflect: ${profile.deflectClipId.replace('SKYRIM_GUARD/','')} ${profile.deflectWindow.startSeconds.toFixed(3)}–${profile.deflectWindow.endSeconds.toFixed(3)}s @ ${profile.deflectRate.toFixed(2)}×`,
  ].join('\n');
  displayAt(elapsedMs);
}

function displayAt(nextElapsedMs) {
  if (!profile || !library) return null;
  elapsedMs = Math.max(0, Math.min(Number(nextElapsedMs) || 0, profile.durationMs));
  const sample = samplePerfectParryDeflectAbProfile(profile, elapsedMs);
  applySample(sample);
  ui.timeline.value = String(Math.round(elapsedMs));
  ui.timeLabel.textContent = `${Math.round(elapsedMs)} ms`;
  const source = sample.phase === PARRY_CONTACT_DEFLECT_PHASES.BLEND
    ? `${sample.fromClipId.replace('SKYRIM_GUARD/','')} → ${sample.toClipId.replace('SKYRIM_GUARD/','')} · blend ${Math.round(sample.blendAlpha * 100)}%`
    : `${sample.clipId.replace('SKYRIM_GUARD/','')} @ ${Number(sample.sourceTimeSeconds).toFixed(3)}s`;
  const delta = shieldCurrentWorld.clone().sub(shieldContactWorld);
  ui.hudState.textContent = `PERFECT · ${activeCandidate.toUpperCase()} · ${sample.phase.toUpperCase()}`;
  ui.hudDetail.textContent = `${source} · shield Δ (${delta.x.toFixed(3)}, ${delta.y.toFixed(3)}, ${delta.z.toFixed(3)})m · root rotation LOCK`;
  return sample;
}

function setCandidate(candidate) {
  activeCandidate = candidate === PERFECT_PARRY_DEFLECT_CANDIDATES.POWER
    ? PERFECT_PARRY_DEFLECT_CANDIDATES.POWER
    : PERFECT_PARRY_DEFLECT_CANDIDATES.SHARED;
  document.querySelectorAll('[data-candidate]').forEach((button) => button.classList.toggle('on', button.dataset.candidate === activeCandidate));
  elapsedMs = 0;
  rebuildProfile();
}

function clipDuration(clipId) {
  return Number(library.clips.get(clipId)?.duration || 0);
}

function scenarioFor(candidate) {
  const candidateProfile = createPerfectParryDeflectAbProfile(candidate);
  const midBlend = candidateProfile.contactWindow.endSeconds * 1000 + candidateProfile.contactHoldMs + candidateProfile.blendMs * 0.5;
  const blend = samplePerfectParryDeflectAbProfile(candidateProfile, midBlend);
  return {
    candidate,
    contactClipId:candidateProfile.contactClipId,
    deflectClipId:candidateProfile.deflectClipId,
    contactEndSeconds:candidateProfile.contactWindow.endSeconds,
    contactHoldMs:candidateProfile.contactHoldMs,
    blendMs:candidateProfile.blendMs,
    deflectWindow:candidateProfile.deflectWindow,
    durationMs:candidateProfile.durationMs,
    sourceWindowsValid:candidateProfile.contactWindow.endSeconds <= clipDuration(candidateProfile.contactClipId) + 1e-6
      && candidateProfile.deflectWindow.endSeconds <= clipDuration(candidateProfile.deflectClipId) + 1e-6,
    contactBeforeDeflect:blend.phase === PARRY_CONTACT_DEFLECT_PHASES.BLEND
      && blend.fromClipId === candidateProfile.contactClipId
      && blend.toClipId === candidateProfile.deflectClipId,
    rootRotationLocked:candidateProfile.rootRotationPolicy === 'lock',
    probeOnly:candidateProfile.probeOnly === true && candidateProfile.productionEnabled === false,
  };
}

function runVerification() {
  const contract = comparePerfectParryDeflectAbContracts();
  const shared = scenarioFor(PERFECT_PARRY_DEFLECT_CANDIDATES.SHARED);
  const power = scenarioFor(PERFECT_PARRY_DEFLECT_CANDIDATES.POWER);
  const gates = {
    allThreeSourcesPresent:['SKYRIM_GUARD/shd_blockhit','SKYRIM_GUARD/shd_blockbash','SKYRIM_GUARD/shd_blockbashpower'].every((id) => library.clips.has(id)),
    handLAvailable:Boolean(character.sockets?.HAND_L),
    sameContactTiming:contract.sameContactTiming,
    sharedUsesNormalT1:shared.deflectClipId === 'SKYRIM_GUARD/shd_blockbash'
      && shared.deflectWindow.startSeconds === 0.09 && shared.deflectWindow.endSeconds === 0.22,
    powerUsesPerfectT1:power.deflectClipId === 'SKYRIM_GUARD/shd_blockbashpower'
      && power.deflectWindow.startSeconds === 0.12 && power.deflectWindow.endSeconds === 0.28,
    sourceWindowsValid:shared.sourceWindowsValid && power.sourceWindowsValid,
    contactBeforeDeflect:shared.contactBeforeDeflect && power.contactBeforeDeflect,
    rootRotationLocked:shared.rootRotationLocked && power.rootRotationLocked,
    productionUnaffected:shared.probeOnly && power.probeOnly && contract.productionEnabled === false,
  };
  const failures = Object.entries(gates).filter(([,pass]) => !pass).map(([name]) => name);
  const report = { stage:PERFECT_PARRY_DEFLECT_AB_STAGE, pass:failures.length === 0, shared, power, gates, failures };
  document.documentElement.dataset.g351pt2 = report.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g351pt2Shared = gates.sharedUsesNormalT1 ? 'pass' : 'fail';
  document.documentElement.dataset.g351pt2Power = gates.powerUsesPerfectT1 ? 'pass' : 'fail';
  document.documentElement.dataset.g351pt2Contact = gates.sameContactTiming ? 'pass' : 'fail';
  ui.status.textContent = `G3.5.1P-T2 ${report.pass ? 'PASS' : 'FAIL'} · Shared Deflect ↔ Power Deflect A/B`;
  ui.status.className = report.pass ? 'good' : 'bad';
  ui.report.textContent = JSON.stringify(report,null,2);
  window.__G351PT2_RESULT__ = report;
  return report;
}

async function main() {
  ui.status.textContent = 'Loading Perfect Parry T2 A/B sources…';
  library = await loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), { THREE, rig:character.rig, fps:30 });
  character.registerAnimations(library);
  const idle = library.clips.get('SKYRIM_GUARD/shd_blockidle');
  const bind = idle?.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error('G3.5.1P-T2 requires accepted Skyrim weapon bind calibration');
  sword = createDebugSword(THREE);
  mountDebugSword(character, sword, composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind));
  runVerification();
  const params = new URLSearchParams(location.search);
  setCandidate(params.get('candidate') === PERFECT_PARRY_DEFLECT_CANDIDATES.POWER
    ? PERFECT_PARRY_DEFLECT_CANDIDATES.POWER
    : PERFECT_PARRY_DEFLECT_CANDIDATES.SHARED);
  const requestedElapsed = Number(params.get('elapsed'));
  if (Number.isFinite(requestedElapsed)) displayAt(requestedElapsed);
}

ui.timeline.addEventListener('input', () => { playing = false; displayAt(Number(ui.timeline.value)); });
ui.playToggle.addEventListener('click', () => { playing = !playing; ui.playToggle.textContent = playing ? '❚❚ Pause' : '▶ Play chain'; if (playing && elapsedMs >= profile.durationMs) elapsedMs = 0; });
ui.restart.addEventListener('click', () => { playing = false; elapsedMs = 0; ui.playToggle.textContent = '▶ Play chain'; displayAt(0); });
document.querySelectorAll('[data-candidate]').forEach((button) => button.addEventListener('click', () => setCandidate(button.dataset.candidate)));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));

setView(new URLSearchParams(location.search).get('view') || 'three');
resize();
addEventListener('resize', resize);
(function frame(now) {
  const deltaMs = Math.min(50, Math.max(0, now - lastFrameAt));
  lastFrameAt = now;
  if (playing && profile) {
    elapsedMs += deltaMs;
    if (elapsedMs >= profile.durationMs) { elapsedMs = profile.durationMs; playing = false; ui.playToggle.textContent = '▶ Play chain'; }
    displayAt(elapsedMs);
  }
  if (sword) sword.update();
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
})(performance.now());

main().catch((error) => {
  document.documentElement.dataset.g351pt2 = 'fail';
  ui.status.textContent = `G3.5.1P-T2 FAIL · ${error?.message || error}`;
  ui.status.className = 'bad';
  ui.report.textContent = error?.stack || String(error);
  window.__G351PT2_RESULT__ = { stage:PERFECT_PARRY_DEFLECT_AB_STAGE, pass:false, error:error?.stack || String(error) };
});

window.__G351PT2_LAB__ = { setCandidate, displayAt, runVerification, get profile(){ return profile; } };
