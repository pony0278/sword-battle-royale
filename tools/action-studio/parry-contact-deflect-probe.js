import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../../src/animation/skyrim-weapon-bind-calibration.js';
import {
  PARRY_CONTACT_DEFLECT_PHASES,
  PARRY_CONTACT_DEFLECT_TUNING_PRESETS,
  PARRY_CONTACT_DEFLECT_VARIANTS,
  createParryContactDeflectProbeProfile,
  sampleParryContactDeflectProbe,
} from '../../src/combat/parry-contact-deflect-probe.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error('G3.5.1P requires Three.js + GLTFLoader');

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
let activeVariant = PARRY_CONTACT_DEFLECT_VARIANTS.PARRY;
let activePreset = PARRY_CONTACT_DEFLECT_TUNING_PRESETS.COMPACT;
let profile = null;
let elapsedMs = 0;
let playing = false;
let lastFrameAt = performance.now();

function createDebugShieldMarker(opacity) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color:0x8fc7ff,
    wireframe:true,
    transparent:true,
    opacity,
    depthTest:false,
  });
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
  'hudState','hudDetail','timeline','timeLabel','contactEnd','contactEndValue','holdMs','holdValue','blendMs','blendValue',
  'deflectStart','deflectStartValue','deflectEnd','deflectEndValue','blendLead','blendLeadValue','deflectRate','deflectRateValue',
  'playToggle','restart','status','report',
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
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone(),
    scale: bone.scale.clone(),
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

function computeContactShieldReference() {
  if (!profile || !library) return;
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
  shieldVector.visible = Boolean(profile);
  contactShieldGhost.visible = Boolean(profile);
  liveShieldMarker.visible = Boolean(profile);
}

function applyBlendedPose(sample) {
  const from = captureBonePose(sample.fromClipId, sample.fromSourceTimeSeconds);
  const to = captureBonePose(sample.toClipId, sample.toSourceTimeSeconds);
  const alpha = sample.blendAlpha;
  const blended = {};
  for (const name of Object.keys(from)) {
    if (!to[name]) continue;
    blended[name] = {
      position: from[name].position.clone().lerp(to[name].position, alpha),
      quaternion: from[name].quaternion.clone().slerp(to[name].quaternion, alpha),
      scale: from[name].scale.clone().lerp(to[name].scale, alpha),
    };
  }
  applyBonePose(blended);
}

function applySample(sample) {
  if (!sample) return;
  if (sample.phase === PARRY_CONTACT_DEFLECT_PHASES.BLEND) applyBlendedPose(sample);
  else character.sampleAnimation(sample.clipId, sample.sourceTimeSeconds, playbackOptions());
  character.object3d.updateMatrixWorld(true);
  character.update(0, camera);
  sword?.update();
  updateShieldMarkers();
}

function readOverrides() {
  return {
    tuningPreset:activePreset,
    contactEndSeconds:Number(ui.contactEnd.value),
    contactHoldMs:Number(ui.holdMs.value),
    blendMs:Number(ui.blendMs.value),
    deflectStartSeconds:Number(ui.deflectStart.value),
    deflectEndSeconds:Number(ui.deflectEnd.value),
    blendLeadSeconds:Number(ui.blendLead.value),
    deflectRate:Number(ui.deflectRate.value),
  };
}

function writeProfileToControls(candidate) {
  ui.contactEnd.value = String(candidate.contactWindow.endSeconds);
  ui.holdMs.value = String(candidate.contactHoldMs);
  ui.blendMs.value = String(candidate.blendMs);
  ui.deflectStart.value = String(candidate.deflectWindow.startSeconds);
  ui.deflectEnd.value = String(candidate.deflectWindow.endSeconds);
  ui.blendLead.value = String(candidate.blendLeadSeconds);
  ui.deflectRate.value = String(candidate.deflectRate);
}

function refreshLabels() {
  ui.contactEndValue.textContent = `${Number(ui.contactEnd.value).toFixed(3)}s`;
  ui.holdValue.textContent = `${Math.round(Number(ui.holdMs.value))}ms`;
  ui.blendValue.textContent = `${Math.round(Number(ui.blendMs.value))}ms`;
  ui.deflectStartValue.textContent = `${Number(ui.deflectStart.value).toFixed(3)}s`;
  ui.deflectEndValue.textContent = `${Number(ui.deflectEnd.value).toFixed(3)}s`;
  ui.blendLeadValue.textContent = `${Number(ui.blendLead.value).toFixed(3)}s`;
  ui.deflectRateValue.textContent = `${Number(ui.deflectRate.value).toFixed(2)}×`;
}

function rebuildProfile({ preserveElapsed = true } = {}) {
  refreshLabels();
  profile = createParryContactDeflectProbeProfile(activeVariant, readOverrides());
  ui.timeline.max = String(Math.ceil(profile.durationMs));
  if (!preserveElapsed) elapsedMs = 0;
  elapsedMs = Math.max(0, Math.min(elapsedMs, profile.durationMs));
  ui.timeline.value = String(Math.round(elapsedMs));
  if (library) computeContactShieldReference();
  displayAt(elapsedMs);
}

function displayAt(nextElapsedMs) {
  if (!profile || !library) return null;
  elapsedMs = Math.max(0, Math.min(Number(nextElapsedMs) || 0, profile.durationMs));
  const sample = sampleParryContactDeflectProbe(profile, elapsedMs);
  applySample(sample);
  ui.timeline.value = String(Math.round(elapsedMs));
  ui.timeLabel.textContent = `${Math.round(elapsedMs)} ms`;
  const source = sample.phase === PARRY_CONTACT_DEFLECT_PHASES.BLEND
    ? `${sample.fromClipId.replace('SKYRIM_GUARD/','')} → ${sample.toClipId.replace('SKYRIM_GUARD/','')} · blend ${Math.round(sample.blendAlpha * 100)}%`
    : `${sample.clipId.replace('SKYRIM_GUARD/','')} @ ${Number(sample.sourceTimeSeconds).toFixed(3)}s`;
  const shieldDelta = shieldCurrentWorld.distanceTo(shieldContactWorld);
  ui.hudState.textContent = `${activeVariant.toUpperCase()} · ${activePreset.toUpperCase()} · ${sample.phase.toUpperCase()}`;
  ui.hudDetail.textContent = `${source} · shield Δ ${shieldDelta.toFixed(3)}m · root rotation LOCK`;
  return sample;
}

function setVariant(variant) {
  activeVariant = variant === PARRY_CONTACT_DEFLECT_VARIANTS.PERFECT
    ? PARRY_CONTACT_DEFLECT_VARIANTS.PERFECT
    : PARRY_CONTACT_DEFLECT_VARIANTS.PARRY;
  document.querySelectorAll('[data-variant]').forEach((button) => button.classList.toggle('on', button.dataset.variant === activeVariant));
  const candidate = createParryContactDeflectProbeProfile(activeVariant, { tuningPreset:activePreset });
  writeProfileToControls(candidate);
  rebuildProfile({ preserveElapsed:false });
}

function setPreset(preset) {
  activePreset = preset === PARRY_CONTACT_DEFLECT_TUNING_PRESETS.BASELINE
    ? PARRY_CONTACT_DEFLECT_TUNING_PRESETS.BASELINE
    : PARRY_CONTACT_DEFLECT_TUNING_PRESETS.COMPACT;
  document.querySelectorAll('[data-preset]').forEach((button) => button.classList.toggle('on', button.dataset.preset === activePreset));
  const candidate = createParryContactDeflectProbeProfile(activeVariant, { tuningPreset:activePreset });
  writeProfileToControls(candidate);
  rebuildProfile({ preserveElapsed:false });
}

function clipDuration(clipId) {
  return Number(library.clips.get(clipId)?.duration || 0);
}

function scenarioFor(variant, tuningPreset) {
  const candidate = createParryContactDeflectProbeProfile(variant, { tuningPreset });
  const contactDuration = clipDuration(candidate.contactClipId);
  const deflectDuration = clipDuration(candidate.deflectClipId);
  const midBlend = candidate.contactWindow.endSeconds * 1000 + candidate.contactHoldMs + candidate.blendMs * 0.5;
  const blend = sampleParryContactDeflectProbe(candidate, midBlend);
  return {
    tuningPreset,
    contactClipId:candidate.contactClipId,
    deflectClipId:candidate.deflectClipId,
    contactDuration,
    deflectDuration,
    contactHoldMs:candidate.contactHoldMs,
    deflectSpanSeconds:candidate.deflectWindow.endSeconds - candidate.deflectWindow.startSeconds,
    sourceWindowsValid:candidate.contactWindow.endSeconds <= contactDuration + 1e-6
      && candidate.deflectWindow.endSeconds <= deflectDuration + 1e-6,
    contactBeforeDeflect:blend.phase === PARRY_CONTACT_DEFLECT_PHASES.BLEND
      && blend.fromClipId === candidate.contactClipId
      && blend.toClipId === candidate.deflectClipId,
    rootRotationLocked:candidate.rootRotationPolicy === 'lock',
    probeOnly:candidate.probeOnly === true && candidate.productionEnabled === false,
  };
}

function runVerification() {
  const variants = [PARRY_CONTACT_DEFLECT_VARIANTS.PARRY, PARRY_CONTACT_DEFLECT_VARIANTS.PERFECT];
  const scenarios = Object.fromEntries(variants.map((variant) => [variant, {
    baseline:scenarioFor(variant, PARRY_CONTACT_DEFLECT_TUNING_PRESETS.BASELINE),
    compact:scenarioFor(variant, PARRY_CONTACT_DEFLECT_TUNING_PRESETS.COMPACT),
  }]));
  const flat = Object.values(scenarios).flatMap((entry) => [entry.baseline, entry.compact]);
  const gates = {
    allThreeSourcesPresent:[
      'SKYRIM_GUARD/shd_blockhit','SKYRIM_GUARD/shd_blockbash','SKYRIM_GUARD/shd_blockbashpower',
    ].every((id) => library.clips.has(id)),
    handLAvailable:Boolean(character.sockets?.HAND_L),
    sourceWindowsValid:flat.every((entry) => entry.sourceWindowsValid),
    contactBeforeDeflect:flat.every((entry) => entry.contactBeforeDeflect),
    rootRotationLocked:flat.every((entry) => entry.rootRotationLocked),
    productionUnaffected:flat.every((entry) => entry.probeOnly),
    compactHoldsContactLonger:Object.values(scenarios).every((entry) => entry.compact.contactHoldMs > entry.baseline.contactHoldMs),
    compactTrimsDeflect:Object.values(scenarios).every((entry) => entry.compact.deflectSpanSeconds < entry.baseline.deflectSpanSeconds),
  };
  const failures = Object.entries(gates).filter(([,pass]) => !pass).map(([name]) => name);
  const report = { stage:'G3.5.1P-T1', pass:failures.length === 0, scenarios, gates, failures };
  document.documentElement.dataset.g351p = report.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g351pNormal = scenarios.parry.compact.contactBeforeDeflect ? 'pass' : 'fail';
  document.documentElement.dataset.g351pPerfect = scenarios.perfect.compact.contactBeforeDeflect ? 'pass' : 'fail';
  document.documentElement.dataset.g351pTuning = gates.compactHoldsContactLonger && gates.compactTrimsDeflect ? 'pass' : 'fail';
  document.documentElement.dataset.g351pShield = gates.handLAvailable ? 'pass' : 'fail';
  ui.status.textContent = `G3.5.1P-T1 ${report.pass ? 'PASS' : 'FAIL'} · P0 ↔ compact redirect A/B + HAND_L shield marker`;
  ui.status.className = report.pass ? 'good' : 'bad';
  ui.report.textContent = JSON.stringify(report,null,2);
  window.__G351P_RESULT__ = report;
  return report;
}

async function main() {
  ui.status.textContent = 'Loading Skyrim Block Hit + Bash + Power Bash…';
  library = await loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), { THREE, rig:character.rig, fps:30 });
  character.registerAnimations(library);
  const idle = library.clips.get('SKYRIM_GUARD/shd_blockidle');
  const bind = idle?.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error('G3.5.1P requires accepted Skyrim weapon bind calibration');
  sword = createDebugSword(THREE);
  mountDebugSword(character, sword, composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind));
  runVerification();
  const params = new URLSearchParams(location.search);
  activePreset = params.get('preset') === PARRY_CONTACT_DEFLECT_TUNING_PRESETS.BASELINE
    ? PARRY_CONTACT_DEFLECT_TUNING_PRESETS.BASELINE
    : PARRY_CONTACT_DEFLECT_TUNING_PRESETS.COMPACT;
  document.querySelectorAll('[data-preset]').forEach((button) => button.classList.toggle('on', button.dataset.preset === activePreset));
  setVariant(params.get('variant') === 'perfect' ? 'perfect' : 'parry');
  const requestedElapsed = Number(params.get('elapsed'));
  if (Number.isFinite(requestedElapsed)) displayAt(requestedElapsed);
}

for (const id of ['contactEnd','holdMs','blendMs','deflectStart','deflectEnd','blendLead','deflectRate']) ui[id].addEventListener('input', () => rebuildProfile());
ui.timeline.addEventListener('input', () => { playing = false; displayAt(Number(ui.timeline.value)); });
ui.playToggle.addEventListener('click', () => { playing = !playing; ui.playToggle.textContent = playing ? '❚❚ Pause' : '▶ Play chain'; if (playing && elapsedMs >= profile.durationMs) elapsedMs = 0; });
ui.restart.addEventListener('click', () => { playing = false; elapsedMs = 0; ui.playToggle.textContent = '▶ Play chain'; displayAt(0); });
document.querySelectorAll('[data-variant]').forEach((button) => button.addEventListener('click', () => setVariant(button.dataset.variant)));
document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => setPreset(button.dataset.preset)));
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
  document.documentElement.dataset.g351p = 'fail';
  ui.status.textContent = `G3.5.1P FAIL · ${error?.message || error}`;
  ui.status.className = 'bad';
  ui.report.textContent = error?.stack || String(error);
  window.__G351P_RESULT__ = { stage:'G3.5.1P-T1', pass:false, error:error?.stack || String(error) };
});

window.__G351P_LAB__ = { setVariant, setPreset, displayAt, runVerification, get profile(){ return profile; } };
