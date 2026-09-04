import { createDefaultCharacter } from '../../src/character/default-character.js';
import { applyPoseToProceduralKayKitRig } from '../../src/animation/kaykit-pose-adapter.js';
import { IDLE_POSE } from '../../src/animation/action-templates.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import {
  SKYRIM_GUARD_CONVERTED_FILES,
  loadSkyrimConvertedAnimationLibrary,
} from '../../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../../src/animation/skyrim-weapon-bind-calibration.js';
import { LONGSWORD_GUARD_AUTHORING_STATE } from '../../src/combat/longsword-guard-metadata.js';
import { applyGuardQuaternionOffsetsWeighted } from '../../src/combat/guard-quaternion-correction.js';
import {
  getGuardTransitionProfile,
  sampleGuardPresentationWeights,
} from '../../src/combat/guard-transition-presentation.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error('G3.2 requires Three.js + GLTFLoader');

const CLIP_ID = SKYRIM_GUARD_CONVERTED_FILES[0].clipId;
const BASE_FRACTION = LONGSWORD_GUARD_AUTHORING_STATE.baseSample;
const NEUTRAL_SOURCE = 'ACTION_STUDIO/IDLE_POSE';
const POSE_COMPARE_BONES = Object.freeze([
  'hips', 'spine', 'chest',
  'upperarm.l', 'lowerarm.l', 'wrist.l',
  'upperarm.r', 'lowerarm.r', 'wrist.r',
  'upperleg.l', 'lowerleg.l', 'foot.l',
  'upperleg.r', 'lowerleg.r', 'foot.r',
]);

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1018);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x27344a, 1.25));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
keyLight.position.set(3, 5, 4);
scene.add(keyLight);
scene.add(new THREE.GridHelper(8, 16, 0x34435d, 0x202a3b));

const character = createDefaultCharacter(THREE);
scene.add(character.object3d);
const idleReferenceCharacter = createDefaultCharacter(THREE);
applyPoseToProceduralKayKitRig(idleReferenceCharacter.rig, IDLE_POSE);
idleReferenceCharacter.rig.motionRoot.position.set(0, 0, 0);
idleReferenceCharacter.rig.motionRoot.rotation.set(0, 0, 0);
idleReferenceCharacter.rig.motionRoot.scale.set(1, 1, 1);
idleReferenceCharacter.object3d.updateMatrixWorld(true);

let targetClip = null;
let sword = null;
let guardAction = null;
let currentState = 'guard_enter';
let currentElapsedMs = 90;
let cycling = false;
let cycleStartedAt = 0;

const statusNode = document.getElementById('status');
const reportNode = document.getElementById('report');
const hudState = document.getElementById('hudState');
const hudWeights = document.getElementById('hudWeights');
const timeline = document.getElementById('timeline');
const timeLabel = document.getElementById('timeLabel');

function setStatus(text, kind = '') {
  statusNode.textContent = text;
  statusNode.className = kind;
}

function setView(view) {
  if (view === 'front') camera.position.set(0, 1.42, 5.3);
  else if (view === 'side') camera.position.set(5.2, 1.45, 0);
  else if (view === 'back') camera.position.set(0, 1.42, -5.3);
  else camera.position.set(4.0, 1.58, 4.25);
  camera.lookAt(0, 1.0, 0);
  camera.updateMatrixWorld(true);
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function vectorArray(value) {
  return value.toArray().map((entry) => Number(entry.toFixed(8)));
}

function captureRootPose() {
  character.object3d.updateMatrixWorld(true);
  return {
    motionRoot: vectorArray(character.rig.motionRoot.position),
    root: vectorArray(character.rig.bones.root.position),
    hips: vectorArray(character.rig.bones.hips.position),
  };
}

function captureBoneQuaternions(rig) {
  return Object.fromEntries(POSE_COMPARE_BONES.map((boneId) => [
    boneId,
    rig.bones[boneId].quaternion.toArray(),
  ]));
}

const idleReferenceQuaternions = captureBoneQuaternions(idleReferenceCharacter.rig);

function quaternionAngleDifferenceDegrees(a, b) {
  const dot = Math.min(1, Math.max(-1, Math.abs(
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  )));
  return THREE.MathUtils.radToDeg(2 * Math.acos(dot));
}

function maxQuaternionDifferenceDegrees(a, b) {
  return Math.max(...POSE_COMPARE_BONES.map((boneId) => quaternionAngleDifferenceDegrees(a[boneId], b[boneId])));
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function resetRigForBlend() {
  // This is intentionally the exact authored Action Studio neutral pose, not rig rest/T-pose.
  // Use the low-level adapter so we do not stop the active Skyrim AnimationMixer action.
  applyPoseToProceduralKayKitRig(character.rig, IDLE_POSE);
  character.rig.motionRoot.position.set(0, 0, 0);
  character.rig.motionRoot.rotation.set(0, 0, 0);
  character.rig.motionRoot.scale.set(1, 1, 1);
  character.object3d.updateMatrixWorld(true);
}

function ensureGuardAction() {
  if (!guardAction) {
    // AnimationAction.play() captures PropertyMixer original state immediately.
    // Seed the exact Action Studio Idle first so weight=0 / Exit completion restores Idle,
    // rather than the procedural rig rest/T-pose used by character.playAnimation().
    resetRigForBlend();
    guardAction = character.animation.play(CLIP_ID, { loop:true, inPlace:true, fadeSeconds:0 });
    guardAction.setEffectiveTimeScale(0);
  }
  return guardAction;
}

function applyPresentation(state, elapsedMs = 0) {
  if (!targetClip || !sword) throw new Error('Canonical Guard not loaded');
  currentState = state;
  currentElapsedMs = Math.max(0, Number(elapsedMs) || 0);
  const weights = sampleGuardPresentationWeights(state, currentElapsedMs);
  const action = ensureGuardAction();

  resetRigForBlend();
  action.enabled = true;
  action.paused = false;
  action.time = targetClip.duration * BASE_FRACTION;
  action.setEffectiveWeight(weights.holdWeight);
  action.setEffectiveTimeScale(0);
  character.animation.mixer.update(0);
  action.paused = true;

  applyGuardQuaternionOffsetsWeighted(
    THREE,
    character.rig,
    LONGSWORD_GUARD_AUTHORING_STATE.offsets,
    weights.correctionWeight,
  );
  character.object3d.updateMatrixWorld(true);
  sword.object3d.updateMatrixWorld(true);
  sword.update();
  character.rig.updateAppearance(camera);
  character.object3d.updateMatrixWorld(true);
  sword.update();

  const profile = getGuardTransitionProfile(state);
  const duration = profile?.durationMs || 0;
  timeline.max = String(Math.max(1, duration || 180));
  timeline.value = String(Math.min(Number(timeline.max), currentElapsedMs));
  timeLabel.textContent = `${Math.round(currentElapsedMs)} ms`;
  hudState.textContent = `${state}${profile ? ` · ${profile.durationMs}ms ${profile.curve}` : ''}`;
  hudWeights.textContent = `Hold ${(weights.holdWeight * 100).toFixed(1)}% · Correction ${(weights.correctionWeight * 100).toFixed(1)}% · Reaction ${(weights.reactionOverlayWeight * 100).toFixed(1)}%`;
  return {
    state,
    elapsedMs:currentElapsedMs,
    profile,
    weights,
    root:captureRootPose(),
    boneQuaternions:captureBoneQuaternions(character.rig),
  };
}

function runVerification() {
  const neutral = applyPresentation('neutral', 0);
  const enter0 = applyPresentation('guard_enter', 0);
  const enterMid = applyPresentation('guard_enter', 90);
  const enterEnd = applyPresentation('guard_enter', 180);
  const recover0 = applyPresentation('guard_recover', 0);
  const recoverEnd = applyPresentation('guard_recover', 140);
  const exit0 = applyPresentation('guard_exit', 0);
  const exitMid = applyPresentation('guard_exit', 80);
  const exitEnd = applyPresentation('guard_exit', 160);

  const targetHeight = Math.max(1e-6, Number(targetClip.userData?.targetHeight) || 1);
  const rootSamples = [enter0, enterMid, enterEnd, recover0, recoverEnd, exit0, exitMid, exitEnd];
  const rootMax = Math.max(...rootSamples.map((sample) => distance(sample.root.root, neutral.root.root)));
  const motionRootMax = Math.max(...rootSamples.map((sample) => distance(sample.root.motionRoot, neutral.root.motionRoot)));
  const neutralIdleErrorDegrees = maxQuaternionDifferenceDegrees(neutral.boneQuaternions, idleReferenceQuaternions);
  const enterStartNeutralErrorDegrees = maxQuaternionDifferenceDegrees(enter0.boneQuaternions, neutral.boneQuaternions);
  const exitEndNeutralErrorDegrees = maxQuaternionDifferenceDegrees(exitEnd.boneQuaternions, neutral.boneQuaternions);
  const gates = {
    canonicalClip: CLIP_ID === 'SKYRIM_GUARD/shd_blockidle',
    neutralUsesActionStudioIdle: neutralIdleErrorDegrees <= 0.05,
    enterStartsAtNeutral: enterStartNeutralErrorDegrees <= 0.05,
    exitEndsAtNeutral: exitEndNeutralErrorDegrees <= 0.05,
    enterEndpoints: enter0.weights.holdWeight === 0 && enterEnd.weights.holdWeight === 1
      && enter0.weights.correctionWeight === 0 && enterEnd.weights.correctionWeight === 1,
    recoverContract: recover0.weights.holdWeight === 1 && recoverEnd.weights.holdWeight === 1
      && recover0.weights.reactionOverlayWeight === 1 && recoverEnd.weights.reactionOverlayWeight === 0,
    exitEndpoints: exit0.weights.holdWeight === 1 && exitEnd.weights.holdWeight === 0
      && exit0.weights.correctionWeight === 1 && exitEnd.weights.correctionWeight === 0,
    rootStable: rootMax / targetHeight <= 0.05,
    motionRootStable: motionRootMax / targetHeight <= 0.02,
  };
  const failures = Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name);
  const report = {
    stage:'G3.2',
    pass:failures.length === 0,
    clipId:CLIP_ID,
    neutralSource:NEUTRAL_SOURCE,
    profiles:{ enterMs:180, recoverMs:140, exitMs:160 },
    targetHeight,
    neutralIdleErrorDegrees,
    enterStartNeutralErrorDegrees,
    exitEndNeutralErrorDegrees,
    rootMax,
    motionRootMax,
    gates,
    failures,
  };
  document.documentElement.dataset.g32 = report.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g32Neutral = 'action-studio-idle';
  document.documentElement.dataset.g32Enter = '180ms';
  document.documentElement.dataset.g32Recover = '140ms';
  document.documentElement.dataset.g32Exit = '160ms';
  document.documentElement.dataset.g32Clip = CLIP_ID;
  reportNode.textContent = JSON.stringify(report, null, 2);
  window.__G32_RESULT__ = report;
  setStatus(`G3.2 ${report.pass ? 'PASS' : 'FAIL'} · Action Studio Idle → Skyrim Guard`, report.pass ? 'good' : 'bad');
  return report;
}

async function loadCanonical() {
  setStatus('Loading Action Studio Idle + canonical Skyrim Guard…', 'warn');
  const library = await loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), {
    THREE,
    rig:character.rig,
    fps:30,
  });
  targetClip = library.clips.get(CLIP_ID);
  if (!targetClip) throw new Error(`Missing ${CLIP_ID}`);
  const bind = targetClip.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error('G3.2 requires G2.4.5 weapon bind calibration');
  character.registerAnimations(library);
  sword = createDebugSword(THREE);
  const calibratedMount = composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind);
  mountDebugSword(character, sword, calibratedMount);
  ensureGuardAction();
  const report = runVerification();

  const params = new URLSearchParams(location.search);
  const requestedState = params.get('state');
  const requestedProgress = Math.max(0, Math.min(1, Number(params.get('progress') ?? 0.5)));
  const profile = getGuardTransitionProfile(requestedState);
  if (requestedState) {
    applyPresentation(requestedState, profile ? profile.durationMs * requestedProgress : 0);
  } else {
    applyPresentation('guard_enter', 90);
  }
  return report;
}

function playCycle(timestamp) {
  if (!cycling) return;
  if (!cycleStartedAt) cycleStartedAt = timestamp;
  const elapsed = (timestamp - cycleStartedAt) % 1240;
  if (elapsed < 180) applyPresentation('guard_enter', elapsed);
  else if (elapsed < 880) applyPresentation('guard_hold', 0);
  else if (elapsed < 1040) applyPresentation('guard_exit', elapsed - 880);
  else applyPresentation('neutral', 0);
  requestAnimationFrame(playCycle);
}

document.querySelectorAll('[data-state]').forEach((button) => button.addEventListener('click', () => {
  cycling = false;
  const state = button.dataset.state;
  const profile = getGuardTransitionProfile(state);
  applyPresentation(state, profile ? profile.durationMs * 0.5 : 0);
}));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
timeline.addEventListener('input', () => applyPresentation(currentState, Number(timeline.value)));
document.getElementById('playCycle').addEventListener('click', () => {
  cycling = true;
  cycleStartedAt = 0;
  requestAnimationFrame(playCycle);
});
document.getElementById('stopCycle').addEventListener('click', () => { cycling = false; });

setView(new URLSearchParams(location.search).get('view') || 'three');
resize();
window.addEventListener('resize', resize);
function render() {
  if (sword) sword.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

loadCanonical().catch((error) => {
  document.documentElement.dataset.g32 = 'fail';
  setStatus(`G3.2 FAIL · ${error?.message || error}`, 'bad');
  reportNode.textContent = error?.stack || String(error);
  window.__G32_RESULT__ = { stage:'G3.2', pass:false, error:error?.stack || String(error) };
});

window.__G32_LAB__ = { applyPresentation, runVerification };
