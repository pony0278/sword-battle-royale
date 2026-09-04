import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import {
  SKYRIM_GUARD_CONVERTED_FILES,
  loadSkyrimConvertedAnimationLibrary,
} from '../../src/animation/skyrim-converted-animation-library.js';
import { resolveSkyrimSourceNodes } from '../../src/animation/skyrim-animation-retarget.js';
import {
  composeSkyrimWeaponMountCalibration,
  measureSkyrimWeaponFrameErrorDegrees,
} from '../../src/animation/skyrim-weapon-bind-calibration.js';
import {
  classifySkyrimWeaponSocketEquivalence,
  classifyTriangleGuardSample,
  decideSkyrimGuardAdoption,
} from '../../src/combat/skyrim-guard-adoption-review.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error('G2.4.5 requires Three.js + GLTFLoader');

const SOURCE_URL = '../../assets/skyrim/guard/converted/shd_blockidle.source.glb';
const CLIP_ID = SKYRIM_GUARD_CONVERTED_FILES[0].clipId;
const FRACTIONS = Object.freeze([0, 0.25, 0.5, 0.75, 0.998]);
const reportNode = document.getElementById('report');
const statusNode = document.getElementById('status');
const canvas = document.getElementById('canvas');

function rounded(value, digits = 6) {
  return Number((Number(value) || 0).toFixed(digits));
}

function loadGltf(loader, url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

function targetBonePosition(character, id, target = new THREE.Vector3()) {
  return character.rig.bones[id].getWorldPosition(target);
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function triangleMetrics(character, sword, targetBasis) {
  const hips = targetBonePosition(character, 'hips');
  const chest = targetBonePosition(character, 'chest');
  const head = targetBonePosition(character, 'head');
  const leftShoulder = targetBonePosition(character, 'upperarm.l');
  const rightShoulder = targetBonePosition(character, 'upperarm.r');
  const offHand = targetBonePosition(character, 'hand.l');
  const weaponHand = targetBonePosition(character, 'hand.r');
  const swordTip = sword.tip.getWorldPosition(new THREE.Vector3());
  const torsoHeight = Math.max(1e-6, head.distanceTo(hips));
  const height = (point) => (point.y - hips.y) / torsoHeight;

  const triangleCross = new THREE.Vector3().crossVectors(
    weaponHand.clone().sub(offHand),
    swordTip.clone().sub(offHand),
  );
  const swordDirection = swordTip.clone().sub(weaponHand).normalize();
  const targetForward = new THREE.Vector3().fromArray(targetBasis.forward).normalize();

  const shoulderSpan = rightShoulder.clone().sub(leftShoulder);
  shoulderSpan.y = 0;
  const rightAxis = new THREE.Vector3().fromArray(targetBasis.right);
  rightAxis.y = 0;
  let torsoYawDegrees = 0;
  if (shoulderSpan.lengthSq() > 1e-10 && rightAxis.lengthSq() > 1e-10) {
    shoulderSpan.normalize();
    rightAxis.normalize();
    const dot = Math.min(1, Math.max(-1, Math.abs(shoulderSpan.dot(rightAxis))));
    torsoYawDegrees = THREE.MathUtils.radToDeg(Math.acos(dot));
  }

  return {
    weaponHandHeight: rounded(height(weaponHand), 5),
    offHandHeight: rounded(height(offHand), 5),
    weaponHandCenterDistance: rounded(horizontalDistance(weaponHand, chest) / torsoHeight, 5),
    offHandCenterDistance: rounded(horizontalDistance(offHand, chest) / torsoHeight, 5),
    swordTipHeight: rounded(height(swordTip), 5),
    swordForwardDot: rounded(swordDirection.dot(targetForward), 5),
    triangleArea: rounded((triangleCross.length() * 0.5) / (torsoHeight * torsoHeight), 5),
    torsoYawDegrees: rounded(torsoYawDegrees, 5),
  };
}

function setView(camera, view) {
  if (view === 'front') camera.position.set(0, 1.42, 5.4);
  else if (view === 'side') camera.position.set(5.2, 1.48, 0);
  else camera.position.set(4.0, 1.58, 4.3);
  camera.lookAt(0, 1.0, 0);
  camera.updateMatrixWorld(true);
}

async function run() {
  const params = new URLSearchParams(window.location.search);
  const requestedFraction = Math.max(0, Math.min(0.998, Number(params.get('sample') ?? 0.5) || 0));
  const requestedView = ['front', 'side', 'three'].includes(params.get('view')) ? params.get('view') : 'three';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1119);
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 100);
  setView(camera, requestedView);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x253049, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(3, 5, 4);
  scene.add(key);
  scene.add(new THREE.GridHelper(8, 16, 0x31405b, 0x202a3b));

  const character = createDefaultCharacter(THREE);
  scene.add(character.object3d);

  const sourceGltf = await loadGltf(new THREE.GLTFLoader(), SOURCE_URL);
  const sourceScene = sourceGltf.scene;
  const sourceClip = sourceGltf.animations?.[0];
  if (!sourceScene || !sourceClip) throw new Error('Canonical Skyrim source is incomplete');
  const sourceReport = resolveSkyrimSourceNodes(sourceScene);
  if (!sourceReport.valid) throw new Error(`Missing Skyrim semantics: ${sourceReport.missing.join(', ')}`);
  const sourceWeapon = sourceReport.nodes['handslot.r'];

  const sourceMixer = new THREE.AnimationMixer(sourceScene);
  const sourceAction = sourceMixer.clipAction(sourceClip).reset();
  sourceAction.setLoop(THREE.LoopOnce, 1);
  sourceAction.clampWhenFinished = true;
  sourceAction.play();

  const library = await loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), {
    THREE,
    rig: character.rig,
    fps: 30,
  });
  const targetClip = library.clips.get(CLIP_ID);
  if (!targetClip) throw new Error(`Missing retarget clip ${CLIP_ID}`);
  const bind = targetClip.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error('Retarget clip has no G2.4.5 weapon bind calibration');

  const sword = createDebugSword(THREE);
  const calibratedMount = composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind);
  mountDebugSword(character, sword, calibratedMount);
  character.registerAnimations(library);

  const basisArray = targetClip.userData.basisCalibration.quaternion;
  const targetBasis = targetClip.userData.basisCalibration.target;
  const frameSamples = [];
  const triangleSamples = [];
  const uncalibratedSamples = [];

  for (const fraction of FRACTIONS) {
    const time = targetClip.duration * fraction;
    sourceMixer.setTime(time);
    sourceScene.updateMatrixWorld(true);
    character.sampleAnimation(CLIP_ID, time, { loop:false, inPlace:true });
    character.object3d.updateMatrixWorld(true);
    sword.object3d.updateMatrixWorld(true);
    sword.update();

    const frameErrorDegrees = measureSkyrimWeaponFrameErrorDegrees(
      THREE,
      sourceWeapon,
      character.sockets.HAND_R,
      basisArray,
      bind,
    );
    const uncalibratedErrorDegrees = measureSkyrimWeaponFrameErrorDegrees(
      THREE,
      sourceWeapon,
      character.sockets.HAND_R,
      basisArray,
      { correctionQuaternion:[0, 0, 0, 1] },
    );
    const triangle = classifyTriangleGuardSample(triangleMetrics(character, sword, targetBasis));
    frameSamples.push({ fraction, time:rounded(time, 4), errorDegrees:rounded(frameErrorDegrees) });
    uncalibratedSamples.push({ fraction, errorDegrees:rounded(uncalibratedErrorDegrees) });
    triangleSamples.push({ fraction, status:triangle.status, metrics:triangle.metrics, failures:triangle.failures });
  }

  const frameMaxDegrees = Math.max(...frameSamples.map((sample) => sample.errorDegrees));
  const uncalibratedMaxDegrees = Math.max(...uncalibratedSamples.map((sample) => sample.errorDegrees));
  const socketEquivalence = classifySkyrimWeaponSocketEquivalence({ maxDegrees:frameMaxDegrees });
  const adoption = decideSkyrimGuardAdoption({
    equivalenceStatus: 'warning',
    weaponSocketStatus: socketEquivalence.status,
    suitabilityStatuses: triangleSamples.map((sample) => sample.status),
  });
  const pass = socketEquivalence.status !== 'bad';

  const requestedTime = targetClip.duration * requestedFraction;
  sourceMixer.setTime(requestedTime);
  sourceScene.updateMatrixWorld(true);
  character.sampleAnimation(CLIP_ID, requestedTime, { loop:false, inPlace:true });
  character.object3d.updateMatrixWorld(true);
  sword.object3d.updateMatrixWorld(true);
  sword.update();
  character.update(0, camera);
  sword.update();
  renderer.render(scene, camera);

  const result = {
    stage:'G2.4.5',
    pass,
    clipId:CLIP_ID,
    bindCalibration:bind,
    calibratedMount,
    frameEquivalence:{
      status:socketEquivalence.status,
      maxDegrees:rounded(frameMaxDegrees),
      samples:frameSamples,
      acceptance:socketEquivalence.thresholds,
    },
    baselineWithoutCorrection:{ maxDegrees:rounded(uncalibratedMaxDegrees), samples:uncalibratedSamples },
    triangleGuardAfterCalibration:triangleSamples,
    rerunAdoptionDecision:adoption,
    note:'Quaternion-frame equivalence replaces the old Hand→Weapon positional-vector proxy. Position offset remains a rig diagnostic, not a blade-axis gate.',
  };

  document.documentElement.dataset.g245 = pass ? 'pass' : 'fail';
  document.documentElement.dataset.g245Socket = socketEquivalence.status;
  document.documentElement.dataset.g245Decision = adoption.decision.toLowerCase().replaceAll(' ', '-');
  statusNode.textContent = `${pass ? 'PASS' : 'FAIL'} · socket ${socketEquivalence.status.toUpperCase()} · ${adoption.decision}`;
  reportNode.textContent = JSON.stringify(result, null, 2);
  window.__G245_RESULT__ = result;
}

run().catch((error) => {
  document.documentElement.dataset.g245 = 'fail';
  statusNode.textContent = 'FAIL';
  const result = { stage:'G2.4.5', pass:false, error:error?.stack || error?.message || String(error) };
  reportNode.textContent = JSON.stringify(result, null, 2);
  window.__G245_RESULT__ = result;
});
