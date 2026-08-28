import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import {
  SKYRIM_GUARD_CONVERTED_FILES,
  loadSkyrimConvertedAnimationLibrary,
} from '../../src/animation/skyrim-converted-animation-library.js';
import { resolveSkyrimSourceNodes } from '../../src/animation/skyrim-animation-retarget.js';
import {
  classifySkyrimPoseEquivalence,
  classifySkyrimWeaponSocketEquivalence,
  classifyTriangleGuardSample,
  decideSkyrimGuardAdoption,
} from '../../src/combat/skyrim-guard-adoption-review.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error('G2.4.4 requires Three.js + GLTFLoader');

const SOURCE_URL = '../../assets/skyrim/guard/converted/shd_blockidle.source.glb';
const CLIP_ID = SKYRIM_GUARD_CONVERTED_FILES[0].clipId;
const FRACTIONS = Object.freeze([0, 0.25, 0.5, 0.75, 0.998]);
const TARGET_OFFSET_X = 1.45;
const SOURCE_OFFSET_X = -1.45;
const SWORD_DEPENDENT_GATES = Object.freeze(new Set(['swordTipHeight', 'swordForwardDot', 'triangleArea']));

const DISPLAY_SEGMENTS = Object.freeze([
  Object.freeze({ source:['pelvis','spine'] }),
  Object.freeze({ source:['spine','chest'] }),
  Object.freeze({ source:['chest','head'] }),
  Object.freeze({ source:['upperarm.l','lowerarm.l'] }),
  Object.freeze({ source:['lowerarm.l','wrist.l'] }),
  Object.freeze({ source:['wrist.l','handslot.l'] }),
  Object.freeze({ source:['upperarm.r','lowerarm.r'] }),
  Object.freeze({ source:['lowerarm.r','wrist.r'] }),
  Object.freeze({ source:['wrist.r','handslot.r'] }),
  Object.freeze({ source:['upperleg.l','lowerleg.l'] }),
  Object.freeze({ source:['lowerleg.l','foot.l'] }),
  Object.freeze({ source:['foot.l','toes.l'] }),
  Object.freeze({ source:['upperleg.r','lowerleg.r'] }),
  Object.freeze({ source:['lowerleg.r','foot.r'] }),
  Object.freeze({ source:['foot.r','toes.r'] }),
]);

const EQUIVALENCE_SEGMENTS = Object.freeze([
  Object.freeze({ id:'torso.pelvis-chest', source:['pelvis','chest'], target:['hips','chest'], core:true }),
  Object.freeze({ id:'torso.pelvis-head', source:['pelvis','head'], target:['hips','head'], core:true }),
  Object.freeze({ id:'torso.chest-head', source:['chest','head'], target:['chest','head'], core:true }),
  Object.freeze({ id:'arm.l.upper', source:['upperarm.l','lowerarm.l'], target:['upperarm.l','lowerarm.l'], core:true }),
  Object.freeze({ id:'arm.l.lower', source:['lowerarm.l','wrist.l'], target:['lowerarm.l','wrist.l'], core:true }),
  Object.freeze({ id:'arm.l.helper', source:['wrist.l','handslot.l'], target:['wrist.l','handslot.l'], core:false }),
  Object.freeze({ id:'arm.r.upper', source:['upperarm.r','lowerarm.r'], target:['upperarm.r','lowerarm.r'], core:true }),
  Object.freeze({ id:'arm.r.lower', source:['lowerarm.r','wrist.r'], target:['lowerarm.r','wrist.r'], core:true }),
  Object.freeze({ id:'arm.r.helper', source:['wrist.r','handslot.r'], target:['wrist.r','handslot.r'], core:false }),
  Object.freeze({ id:'leg.l.upper', source:['upperleg.l','lowerleg.l'], target:['upperleg.l','lowerleg.l'], core:true }),
  Object.freeze({ id:'leg.l.lower', source:['lowerleg.l','foot.l'], target:['lowerleg.l','foot.l'], core:true }),
  Object.freeze({ id:'leg.l.foot', source:['foot.l','toes.l'], target:['foot.l','toes.l'], core:true }),
  Object.freeze({ id:'leg.r.upper', source:['upperleg.r','lowerleg.r'], target:['upperleg.r','lowerleg.r'], core:true }),
  Object.freeze({ id:'leg.r.lower', source:['lowerleg.r','foot.r'], target:['lowerleg.r','foot.r'], core:true }),
  Object.freeze({ id:'leg.r.foot', source:['foot.r','toes.r'], target:['foot.r','toes.r'], core:true }),
]);

const SOURCE_POINT_IDS = Object.freeze([...new Set(DISPLAY_SEGMENTS.flatMap((segment) => segment.source))]);
const reportNode = document.getElementById('report');
const decisionLabel = document.getElementById('decisionLabel');
const equivalenceLabel = document.getElementById('equivalenceLabel');
const sampleLabel = document.getElementById('sampleLabel');
const canvas = document.getElementById('canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1119);
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x253049, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 0.9);
key.position.set(3, 5, 4);
scene.add(key);
scene.add(new THREE.GridHelper(8, 16, 0x31405b, 0x202a3b));

const character = createDefaultCharacter(THREE);
character.object3d.position.x = TARGET_OFFSET_X;
const sword = createDebugSword(THREE);
mountDebugSword(character, sword, DEFAULT_KAYKIT_SWORD_MOUNT);
scene.add(character.object3d);

const sourceGeometry = new THREE.BufferGeometry();
sourceGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DISPLAY_SEGMENTS.length * 2 * 3), 3));
const sourceLine = new THREE.LineSegments(
  sourceGeometry,
  new THREE.LineBasicMaterial({ color:0xffbf69, transparent:true, opacity:0.98 }),
);
sourceLine.frustumCulled = false;
scene.add(sourceLine);

const sourceJointGeometry = new THREE.SphereGeometry(0.038, 8, 6);
const sourceJointMaterial = new THREE.MeshBasicMaterial({ color:0xffd39a });
const sourceJoints = Object.fromEntries(SOURCE_POINT_IDS.map((id) => {
  const mesh = new THREE.Mesh(sourceJointGeometry, sourceJointMaterial);
  mesh.name = `SOURCE_${id}`;
  scene.add(mesh);
  return [id, mesh];
}));

function loadGltf(loader, url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

function rounded(value, digits = 5) {
  return Number((Number(value) || 0).toFixed(digits));
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function angleDegrees(a, b) {
  if (a.lengthSq() <= 1e-10 || b.lengthSq() <= 1e-10) return 180;
  return THREE.MathUtils.radToDeg(a.angleTo(b));
}

function worldPosition(object3d, target = new THREE.Vector3()) {
  return object3d.getWorldPosition(target);
}

function targetBonePosition(id, target = new THREE.Vector3()) {
  return character.rig.bones[id].getWorldPosition(target);
}

function setView(view) {
  const target = new THREE.Vector3(0, 1.0, 0);
  if (view === 'front') camera.position.set(0, 1.45, 5.8);
  else camera.position.set(4.1, 1.65, 4.5);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}

function sourceDisplayPoint(sourceNodes, basisQuaternion, displayScale, id, sourcePelvis, targetY, target = new THREE.Vector3()) {
  sourceNodes[id].getWorldPosition(target);
  return target
    .sub(sourcePelvis)
    .applyQuaternion(basisQuaternion)
    .multiplyScalar(displayScale)
    .add(new THREE.Vector3(SOURCE_OFFSET_X, targetY, 0));
}

function updateSourceVisual(sourceNodes, basisQuaternion) {
  const sourcePelvis = worldPosition(sourceNodes.pelvis, new THREE.Vector3());
  const sourceHead = worldPosition(sourceNodes.head, new THREE.Vector3());
  const targetHips = targetBonePosition('hips', new THREE.Vector3());
  const targetHead = targetBonePosition('head', new THREE.Vector3());
  const sourceTorsoHeight = Math.max(1e-6, sourceHead.distanceTo(sourcePelvis));
  const targetTorsoHeight = Math.max(1e-6, targetHead.distanceTo(targetHips));
  const displayScale = targetTorsoHeight / sourceTorsoHeight;
  const pointCache = new Map();
  const getPoint = (id) => {
    if (!pointCache.has(id)) {
      pointCache.set(id, sourceDisplayPoint(
        sourceNodes,
        basisQuaternion,
        displayScale,
        id,
        sourcePelvis,
        targetHips.y,
        new THREE.Vector3(),
      ));
    }
    return pointCache.get(id);
  };

  const attribute = sourceGeometry.attributes.position;
  DISPLAY_SEGMENTS.forEach((segment, index) => {
    const a = getPoint(segment.source[0]);
    const b = getPoint(segment.source[1]);
    attribute.setXYZ(index * 2, a.x, a.y, a.z);
    attribute.setXYZ(index * 2 + 1, b.x, b.y, b.z);
  });
  attribute.needsUpdate = true;
  Object.entries(sourceJoints).forEach(([id, mesh]) => mesh.position.copy(getPoint(id)));
  return displayScale;
}

function sampleEquivalence(sourceNodes, basisQuaternion) {
  const sourceStart = new THREE.Vector3();
  const sourceEnd = new THREE.Vector3();
  const targetStart = new THREE.Vector3();
  const targetEnd = new THREE.Vector3();
  return EQUIVALENCE_SEGMENTS.map((segment) => {
    sourceNodes[segment.source[0]].getWorldPosition(sourceStart);
    sourceNodes[segment.source[1]].getWorldPosition(sourceEnd);
    character.rig.bones[segment.target[0]].getWorldPosition(targetStart);
    character.rig.bones[segment.target[1]].getWorldPosition(targetEnd);
    const sourceDirection = sourceEnd.clone().sub(sourceStart).applyQuaternion(basisQuaternion).normalize();
    const targetDirection = targetEnd.clone().sub(targetStart).normalize();
    return {
      id: segment.id,
      core: segment.core,
      angleDegrees: rounded(angleDegrees(sourceDirection, targetDirection)),
    };
  });
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function targetTriangleMetrics(targetForward) {
  const hips = targetBonePosition('hips');
  const chest = targetBonePosition('chest');
  const head = targetBonePosition('head');
  const leftShoulder = targetBonePosition('upperarm.l');
  const rightShoulder = targetBonePosition('upperarm.r');
  const offHand = targetBonePosition('hand.l');
  const weaponHand = targetBonePosition('hand.r');
  const swordTip = sword.tip.getWorldPosition(new THREE.Vector3());
  const torsoHeight = Math.max(1e-6, head.distanceTo(hips));
  const height = (point) => (point.y - hips.y) / torsoHeight;
  const triangleCross = new THREE.Vector3().crossVectors(
    weaponHand.clone().sub(offHand),
    swordTip.clone().sub(offHand),
  );
  const swordDirection = swordTip.clone().sub(weaponHand).normalize();

  const shoulderSpan = rightShoulder.clone().sub(leftShoulder);
  shoulderSpan.y = 0;
  const rightAxis = new THREE.Vector3().set(...targetForward.right);
  rightAxis.y = 0;
  let torsoYawDegrees = 0;
  if (shoulderSpan.lengthSq() > 1e-10 && rightAxis.lengthSq() > 1e-10) {
    shoulderSpan.normalize();
    rightAxis.normalize();
    const dot = Math.min(1, Math.max(-1, Math.abs(shoulderSpan.dot(rightAxis))));
    torsoYawDegrees = THREE.MathUtils.radToDeg(Math.acos(dot));
  }

  return {
    weaponHandHeight: rounded(height(weaponHand)),
    offHandHeight: rounded(height(offHand)),
    weaponHandCenterDistance: rounded(horizontalDistance(weaponHand, chest) / torsoHeight),
    offHandCenterDistance: rounded(horizontalDistance(offHand, chest) / torsoHeight),
    swordTipHeight: rounded(height(swordTip)),
    swordForwardDot: rounded(swordDirection.dot(new THREE.Vector3().set(...targetForward.forward).normalize())),
    triangleArea: rounded((triangleCross.length() * 0.5) / (torsoHeight * torsoHeight)),
    torsoYawDegrees: rounded(torsoYawDegrees),
  };
}

function bodySuitabilityStatus(suitability) {
  const bodyFailures = suitability.failures.filter((name) => !SWORD_DEPENDENT_GATES.has(name));
  return bodyFailures.length ? 'warning' : 'good';
}

async function run() {
  const params = new URLSearchParams(window.location.search);
  const requestedFraction = Math.max(0, Math.min(0.998, Number(params.get('sample') ?? 0.5) || 0));
  const view = params.get('view') === 'front' ? 'front' : 'three';
  setView(view);

  const sourceLoader = new THREE.GLTFLoader();
  const sourceGltf = await loadGltf(sourceLoader, SOURCE_URL);
  const sourceScene = sourceGltf.scene;
  const sourceClip = sourceGltf.animations?.[0];
  if (!sourceScene || !sourceClip) throw new Error('Canonical Skyrim GLB is missing its source hierarchy or animation');
  const sourceReport = resolveSkyrimSourceNodes(sourceScene);
  if (!sourceReport.valid) throw new Error(`Canonical source semantics missing: ${sourceReport.missing.join(', ')}`);

  const sourceMixer = new THREE.AnimationMixer(sourceScene);
  const sourceAction = sourceMixer.clipAction(sourceClip).reset();
  sourceAction.setLoop(THREE.LoopOnce, 1);
  sourceAction.clampWhenFinished = true;
  sourceAction.play();

  const targetLoader = new THREE.GLTFLoader();
  const library = await loadSkyrimConvertedAnimationLibrary(targetLoader, {
    THREE,
    rig: character.rig,
    fps: 30,
  });
  const targetClip = library.clips.get(CLIP_ID);
  if (!targetClip) throw new Error(`Missing canonical target clip: ${CLIP_ID}`);
  character.registerAnimations(library);

  const basisQuaternion = new THREE.Quaternion().fromArray(targetClip.userData.basisCalibration.quaternion).normalize();
  const targetForward = {
    right: targetClip.userData.basisCalibration.target.right,
    forward: targetClip.userData.basisCalibration.target.forward,
  };

  const samples = [];
  for (const fraction of FRACTIONS) {
    const time = targetClip.duration * fraction;
    sourceMixer.setTime(time);
    sourceScene.updateMatrixWorld(true);
    character.sampleAnimation(CLIP_ID, time, { loop:false, inPlace:true });
    character.object3d.updateMatrixWorld(true);
    sword.object3d.updateMatrixWorld(true);
    sword.update();

    const segments = sampleEquivalence(sourceReport.nodes, basisQuaternion);
    const suitability = classifyTriangleGuardSample(targetTriangleMetrics(targetForward));
    samples.push({ fraction, time:rounded(time), segments, suitability });
  }

  const coreAngles = samples.flatMap((sample) => sample.segments.filter((segment) => segment.core).map((segment) => segment.angleDegrees));
  const helperAngles = samples.flatMap((sample) => sample.segments.filter((segment) => !segment.core).map((segment) => segment.angleDegrees));
  const weaponHelperAngles = samples.map((sample) => sample.segments.find((segment) => segment.id === 'arm.r.helper')?.angleDegrees || 180);
  const equivalenceMetrics = {
    sampleCount: coreAngles.length,
    meanDegrees: rounded(coreAngles.reduce((sum, value) => sum + value, 0) / Math.max(1, coreAngles.length)),
    p95Degrees: rounded(percentile(coreAngles, 0.95)),
    maxDegrees: rounded(Math.max(0, ...coreAngles)),
  };
  const helperMetrics = {
    sampleCount: helperAngles.length,
    meanDegrees: rounded(helperAngles.reduce((sum, value) => sum + value, 0) / Math.max(1, helperAngles.length)),
    maxDegrees: rounded(Math.max(0, ...helperAngles)),
  };
  const equivalence = classifySkyrimPoseEquivalence(equivalenceMetrics);
  const weaponSocketEquivalence = classifySkyrimWeaponSocketEquivalence({
    maxDegrees: Math.max(...weaponHelperAngles),
  });
  const bodySuitabilityStatuses = samples.map((sample) => bodySuitabilityStatus(sample.suitability));
  const provisionalBodyAdoption = decideSkyrimGuardAdoption({
    equivalenceStatus: equivalence.status,
    weaponSocketStatus: 'good',
    suitabilityStatuses: bodySuitabilityStatuses,
  });
  const adoption = decideSkyrimGuardAdoption({
    equivalenceStatus: equivalence.status,
    weaponSocketStatus: weaponSocketEquivalence.status,
    suitabilityStatuses: samples.map((sample) => sample.suitability.status),
  });

  const requestedTime = targetClip.duration * requestedFraction;
  sourceMixer.setTime(requestedTime);
  sourceScene.updateMatrixWorld(true);
  character.sampleAnimation(CLIP_ID, requestedTime, { loop:false, inPlace:true });
  character.object3d.updateMatrixWorld(true);
  sword.object3d.updateMatrixWorld(true);
  sword.update();
  const displayScale = updateSourceVisual(sourceReport.nodes, basisQuaternion);
  character.update(0, camera);
  sword.update();

  const perSegmentWorst = Object.fromEntries(EQUIVALENCE_SEGMENTS.map((segment) => [
    segment.id,
    rounded(Math.max(...samples.map((sample) => sample.segments.find((item) => item.id === segment.id)?.angleDegrees || 0))),
  ]));

  const result = {
    stage: 'G2.4.4',
    ready: true,
    source: SKYRIM_GUARD_CONVERTED_FILES[0].file,
    clipId: CLIP_ID,
    duration: rounded(targetClip.duration),
    comparisonFractions: FRACTIONS,
    equivalence,
    helperMetrics,
    weaponSocketEquivalence,
    perSegmentWorst,
    adoption,
    provisionalBodyAdoption,
    bodySuitabilityStatuses,
    samples: samples.map((sample) => ({
      fraction: sample.fraction,
      time: sample.time,
      suitability: sample.suitability,
    })),
    reviewPolicy: {
      coreEquivalence: 'aggregate torso + upper/lower arms + legs/feet direction angles after G2.4.2 basis conversion',
      torsoSegmentation: 'Skyrim Spine0/1/2 is compared to KayKit spine/chest using pelvis→chest and pelvis→head aggregate vectors',
      helperEquivalence: 'Hand→Weapon / Hand→Shield is separate from body equivalence because equipment bind axes differ between rigs',
      weaponSocketGate: 'final sword-tip adoption metrics are not trusted while Weapon→handslot.r direction mismatch is bad',
      displayScale: 'source pelvis→head normalized to target hips→head for side-by-side visual review',
      adoption: 'body equivalence and weapon socket equivalence must both be accepted before a final authored source-pose decision',
      triangleGuardReference: 'handoff/07_directional_triangle_guard_spec.md',
    },
    runtimeTranslationScale: rounded(Number(targetClip.userData.translationScale) || 1, 8),
    visualDisplayScale: rounded(displayScale, 8),
    screenshot: { fraction:requestedFraction, time:rounded(requestedTime), view },
  };

  document.documentElement.dataset.g244 = 'ready';
  document.documentElement.dataset.g244Equivalence = equivalence.status;
  document.documentElement.dataset.g244WeaponSocket = weaponSocketEquivalence.status;
  document.documentElement.dataset.g244Decision = adoption.decision.toLowerCase().replaceAll(' ', '-');
  decisionLabel.textContent = adoption.decision;
  equivalenceLabel.textContent = `body ${equivalence.status.toUpperCase()} · weapon socket ${weaponSocketEquivalence.status.toUpperCase()} · mean ${equivalence.meanDegrees.toFixed(2)}° · max ${equivalence.maxDegrees.toFixed(2)}°`;
  sampleLabel.textContent = `${Math.round(requestedFraction * 100)}% · ${requestedTime.toFixed(3)}s · ${view} view`;
  reportNode.textContent = JSON.stringify(result, null, 2);
  window.__G244_RESULT__ = result;
  renderer.render(scene, camera);
}

run().catch((error) => {
  document.documentElement.dataset.g244 = 'error';
  const result = { stage:'G2.4.4', ready:false, error:error?.message || String(error) };
  reportNode.textContent = JSON.stringify(result, null, 2);
  decisionLabel.textContent = 'ERROR';
  equivalenceLabel.textContent = result.error;
  window.__G244_RESULT__ = result;
  renderer.render(scene, camera);
});
