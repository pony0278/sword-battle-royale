import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import {
  SKYRIM_GUARD_CONVERTED_FILES,
  loadSkyrimConvertedAnimationLibrary,
} from '../../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../../src/animation/skyrim-weapon-bind-calibration.js';
import {
  LONGSWORD_GUARD_AUTHORING_STATE,
  LONGSWORD_TRIANGLE_GUARD_TARGETS,
  evaluateLongswordTriangleGuardTargets,
} from '../../src/combat/longsword-guard-metadata.js';
import {
  applyGuardQuaternionOffsets,
  buildGuardQuaternionOffsets,
  createGuardAuthoringExport,
  validateGuardQuaternionOffsets,
} from '../../src/combat/guard-quaternion-correction.js';
import { GUARD_CORRECTION_SCOPE } from '../../src/combat/guard-correction-scope.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error('G2.5.1 requires Three.js + GLTFLoader');

const CLIP_ID = SKYRIM_GUARD_CONVERTED_FILES[0].clipId;
const SAMPLE_FRACTIONS = Object.freeze([0, 0.25, 0.5, 0.75, 0.998]);
const AUTHORING_BONES = Object.freeze(['chest', 'upperarm.r', 'lowerarm.r', 'wrist.r', 'handslot.r']);
const AXES = Object.freeze(['x', 'y', 'z']);
const SCORE_WEIGHTS = Object.freeze({
  weaponHandHeight: 22,
  offHandHeight: 6,
  weaponHandCenterDistance: 22,
  offHandCenterDistance: 6,
  swordTipHeight: 16,
  swordForwardDot: 10,
  triangleArea: 2,
  torsoYawDegrees: 7,
});

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
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
let sword = null;
let library = null;
let targetClip = null;
let targetBasis = null;
let currentFraction = LONGSWORD_GUARD_AUTHORING_STATE.baseSample;
let lastValidation = null;
let authoringEuler = LONGSWORD_GUARD_AUTHORING_STATE.authored ? canonicalEuler() : blankEuler();

const statusNode = document.getElementById('status');
const metricsNode = document.getElementById('metrics');
const validationNode = document.getElementById('validation');
const exportNode = document.getElementById('exportText');
const controlsNode = document.getElementById('boneControls');

const triangleLine = new THREE.LineSegments(
  new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3)),
  new THREE.LineBasicMaterial({ color:0x65d68b, depthTest:false, transparent:true, opacity:0.95 }),
);
triangleLine.renderOrder = 10;
triangleLine.frustumCulled = false;
scene.add(triangleLine);

const rayLine = new THREE.LineSegments(
  new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3)),
  new THREE.LineBasicMaterial({ color:0x68d8ff, depthTest:false, transparent:true, opacity:0.95 }),
);
rayLine.renderOrder = 11;
rayLine.frustumCulled = false;
scene.add(rayLine);

const targetMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.075, 12, 8),
  new THREE.MeshBasicMaterial({ color:0xf0bd63, depthTest:false }),
);
targetMarker.renderOrder = 12;
scene.add(targetMarker);

function rounded(value, digits = 5) {
  return Number((Number(value) || 0).toFixed(digits));
}

function blankEuler() {
  return Object.fromEntries(AUTHORING_BONES.map((bone) => [bone, { x:0, y:0, z:0 }]));
}

function canonicalEuler() {
  const source = LONGSWORD_GUARD_AUTHORING_STATE.eulerDegrees || {};
  return Object.fromEntries(AUTHORING_BONES.map((bone) => [bone, {
    x:Number(source[bone]?.x) || 0,
    y:Number(source[bone]?.y) || 0,
    z:Number(source[bone]?.z) || 0,
  }]));
}

function cloneEuler(input = authoringEuler) {
  return Object.fromEntries(AUTHORING_BONES.map((bone) => [bone, { ...(input[bone] || { x:0, y:0, z:0 }) }]));
}

function setStatus(message, kind = '') {
  statusNode.textContent = message;
  statusNode.className = `status ${kind}`.trim();
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

function worldBone(id, target = new THREE.Vector3()) {
  return character.rig.bones[id].getWorldPosition(target);
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function fixedLockOnAim(chest, torsoHeight) {
  const forward = new THREE.Vector3().fromArray(targetBasis.forward).normalize();
  return chest.clone()
    .addScaledVector(forward, Math.max(2.5, torsoHeight * 2.8))
    .add(new THREE.Vector3(0, torsoHeight * 0.12, 0));
}

function triangleMetrics() {
  const hips = worldBone('hips');
  const chest = worldBone('chest');
  const head = worldBone('head');
  const leftShoulder = worldBone('upperarm.l');
  const rightShoulder = worldBone('upperarm.r');
  const offHand = worldBone('hand.l');
  const weaponHand = worldBone('hand.r');
  const sweep = sword.getSweepSegment();
  const swordGrip = sweep.start.clone();
  const swordTip = sweep.end.clone();
  const torsoHeight = Math.max(1e-6, head.distanceTo(hips));
  const height = (point) => (point.y - hips.y) / torsoHeight;
  const aim = fixedLockOnAim(chest, torsoHeight);
  const bladeDirection = swordTip.clone().sub(swordGrip).normalize();
  const threatDirection = aim.clone().sub(swordGrip).normalize();
  const triangleCross = new THREE.Vector3().crossVectors(
    weaponHand.clone().sub(offHand),
    swordTip.clone().sub(offHand),
  );

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
    weaponHandHeight: rounded(height(weaponHand)),
    offHandHeight: rounded(height(offHand)),
    weaponHandCenterDistance: rounded(horizontalDistance(weaponHand, chest) / torsoHeight),
    offHandCenterDistance: rounded(horizontalDistance(offHand, chest) / torsoHeight),
    swordTipHeight: rounded(height(swordTip)),
    swordForwardDot: rounded(bladeDirection.dot(threatDirection)),
    triangleArea: rounded((triangleCross.length() * 0.5) / (torsoHeight * torsoHeight)),
    torsoYawDegrees: rounded(torsoYawDegrees),
    debug: { offHand, weaponHand, swordGrip, swordTip, aim, bladeDirection },
  };
}

function writeSegment(attribute, segmentIndex, a, b) {
  const base = segmentIndex * 2;
  attribute.setXYZ(base, a.x, a.y, a.z);
  attribute.setXYZ(base + 1, b.x, b.y, b.z);
}

function updateDebugVisuals(metrics) {
  const { offHand, weaponHand, swordGrip, swordTip, aim, bladeDirection } = metrics.debug;
  const triangle = triangleLine.geometry.attributes.position;
  writeSegment(triangle, 0, offHand, weaponHand);
  writeSegment(triangle, 1, weaponHand, swordTip);
  writeSegment(triangle, 2, swordTip, offHand);
  triangle.needsUpdate = true;

  const rays = rayLine.geometry.attributes.position;
  writeSegment(rays, 0, swordGrip, swordGrip.clone().addScaledVector(bladeDirection, 2.1));
  writeSegment(rays, 1, swordGrip, aim);
  rays.needsUpdate = true;
  targetMarker.position.copy(aim);
}

function currentOffsets(euler = authoringEuler) {
  return buildGuardQuaternionOffsets(euler);
}

function sampleFraction(fraction, euler = authoringEuler, options = {}) {
  if (!targetClip || !sword) throw new Error('Canonical Guard is not loaded');
  currentFraction = Math.max(0, Math.min(0.998, Number(fraction) || 0));
  const time = targetClip.duration * currentFraction;
  character.sampleAnimation(CLIP_ID, time, { loop:false, inPlace:true });
  applyGuardQuaternionOffsets(THREE, character.rig, currentOffsets(euler));
  character.object3d.updateMatrixWorld(true);
  sword.object3d.updateMatrixWorld(true);
  sword.update();
  character.update(0, camera);
  character.object3d.updateMatrixWorld(true);
  sword.update();
  const metrics = triangleMetrics();
  if (options.visual !== false) {
    updateDebugVisuals(metrics);
    renderMetrics(metrics);
  }
  return { fraction:currentFraction, time, metrics, evaluation:evaluateLongswordTriangleGuardTargets(metrics) };
}

function metricText(name, value) {
  if (name === 'torsoYawDegrees') return `${value.toFixed(2)}°`;
  return value.toFixed(4);
}

function renderMetrics(metrics) {
  const evaluation = evaluateLongswordTriangleGuardTargets(metrics);
  metricsNode.innerHTML = '';
  for (const [name, value] of Object.entries(evaluation.metrics)) {
    const label = document.createElement('div');
    label.textContent = name;
    const output = document.createElement('div');
    output.textContent = metricText(name, value);
    output.className = evaluation.gates[name] ? 'pass' : 'fail';
    metricsNode.append(label, output);
  }
  return evaluation;
}

function rangePenalty(value, range) {
  const naturalSpan = Number.isFinite(range.min) && Number.isFinite(range.max)
    ? Math.max(0.05, range.max - range.min)
    : Math.max(0.12, Math.abs(Number(range.min ?? range.max ?? 1)) * 0.35);
  if (Number.isFinite(range.min) && value < range.min) return ((range.min - value) / naturalSpan) ** 2;
  if (Number.isFinite(range.max) && value > range.max) return ((value - range.max) / naturalSpan) ** 2;
  return 0;
}

function scoreEuler(euler) {
  const offsets = currentOffsets(euler);
  const validation = validateGuardQuaternionOffsets(offsets);
  if (!validation.valid) return { score:1e9, validation, samples:[] };

  let sum = 0;
  let worst = 0;
  const samples = [];
  for (const fraction of SAMPLE_FRACTIONS) {
    const sample = sampleFraction(fraction, euler, { visual:false });
    samples.push(sample);
    let samplePenalty = 0;
    for (const [name, range] of Object.entries(LONGSWORD_TRIANGLE_GUARD_TARGETS)) {
      samplePenalty += rangePenalty(sample.metrics[name], range) * (SCORE_WEIGHTS[name] || 1);
    }
    sum += samplePenalty;
    worst = Math.max(worst, samplePenalty);
  }

  let regularization = 0;
  for (const entry of validation.entries) {
    const budget = Math.max(1, entry.budgetDegrees);
    const usage = entry.angleDegrees / budget;
    regularization += 0.015 * usage * usage;
    if (entry.bone === 'chest') regularization += 0.035 * usage * usage;
    if (entry.bone === 'handslot.r') regularization += 0.07 * usage * usage;
  }
  return { score:sum + worst * 2.5 + regularization, validation, samples };
}

function allSamplesPass(result) {
  return result.samples.length === SAMPLE_FRACTIONS.length
    && result.samples.every((sample) => sample.evaluation.status === 'good');
}

function empiricalSeeds() {
  const zero = blankEuler();
  const prior = blankEuler();
  Object.assign(prior['upperarm.r'], { x:-27, y:24, z:24 });
  Object.assign(prior['lowerarm.r'], { x:43, y:24, z:-23 });
  Object.assign(prior['wrist.r'], { x:-41, y:6, z:-49 });
  Object.assign(prior['handslot.r'], { x:0, y:15, z:0 });

  const seeds = [zero, prior];
  for (const axis of AXES) {
    for (const value of [-8, 8]) {
      const candidate = cloneEuler(prior);
      candidate.chest[axis] = value;
      if (validateGuardQuaternionOffsets(currentOffsets(candidate)).valid) seeds.push(candidate);
    }
  }
  return seeds;
}

async function optimizeSeed(seed) {
  let bestEuler = cloneEuler(seed);
  let best = scoreEuler(bestEuler);
  const variables = AUTHORING_BONES.flatMap((bone) => AXES.map((axis) => ({ bone, axis })));
  const steps = [18, 9, 4, 2, 1];

  for (const step of steps) {
    let changed = true;
    let rounds = 0;
    while (changed && rounds < 5 && !allSamplesPass(best)) {
      changed = false;
      rounds += 1;
      for (const { bone, axis } of variables) {
        const budget = GUARD_CORRECTION_SCOPE.maxLocalCorrectionDegrees[bone];
        for (const direction of [-1, 1]) {
          const candidate = cloneEuler(bestEuler);
          candidate[bone][axis] = Math.max(-budget, Math.min(budget, candidate[bone][axis] + direction * Math.min(step, budget)));
          const result = scoreEuler(candidate);
          if (result.score + 1e-8 < best.score) {
            bestEuler = candidate;
            best = result;
            changed = true;
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return { euler:bestEuler, result:best };
}

async function autoFitSeed() {
  setStatus('AUTO-FIT · constrained search with chest ≤ 8° and frozen lower body…', 'warning');
  let winner = null;
  for (const seed of empiricalSeeds()) {
    const candidate = await optimizeSeed(seed);
    if (!winner || candidate.result.score < winner.result.score) winner = candidate;
    if (allSamplesPass(candidate.result)) {
      winner = candidate;
      break;
    }
  }

  authoringEuler = cloneEuler(winner.euler);
  renderBoneControls();
  sampleFraction(0.5);
  const validation = validateFiveSamples(false);
  refreshExport();
  setStatus(
    `AUTO-FIT ${validation.pass ? 'PASS' : 'SEED'} · score ${winner.result.score.toFixed(4)} · ${validation.passCount}/5 samples pass`,
    validation.pass ? 'good' : 'warning',
  );
  return { best:winner.result, sample:sampleFraction(0.5), validation };
}

function validateFiveSamples(updateUi = true) {
  const offsets = currentOffsets();
  const offsetValidation = validateGuardQuaternionOffsets(offsets);
  const samples = SAMPLE_FRACTIONS.map((fraction) => sampleFraction(fraction, authoringEuler, { visual:false }));
  const passCount = samples.filter((sample) => sample.evaluation.status === 'good').length;
  const pass = offsetValidation.valid && passCount === samples.length;
  const result = {
    pass,
    passCount,
    offsetValidation,
    samples:samples.map((sample) => ({
      fraction:sample.fraction,
      metrics:Object.fromEntries(Object.entries(sample.metrics).filter(([name]) => name !== 'debug')),
      status:sample.evaluation.status,
      failures:sample.evaluation.failures,
    })),
  };
  lastValidation = result;
  if (updateUi) {
    validationNode.textContent = JSON.stringify(result, null, 2);
    setStatus(`5-SAMPLE ${pass ? 'PASS' : 'NEEDS CORRECTION'} · ${passCount}/5`, pass ? 'good' : 'warning');
    sampleFraction(0.5);
    refreshExport();
  }
  return result;
}

function renderBoneControls() {
  controlsNode.innerHTML = '';
  for (const bone of AUTHORING_BONES) {
    const budget = GUARD_CORRECTION_SCOPE.maxLocalCorrectionDegrees[bone];
    const wrapper = document.createElement('div');
    wrapper.className = 'bone';
    wrapper.innerHTML = `<div class="bone-head"><b>${bone}</b><span class="budget">≤ ${budget}° quaternion${bone === 'handslot.r' ? ' · fine trim' : bone === 'chest' ? ' · optional silhouette trim' : ''}</span></div>`;
    for (const axis of AXES) {
      const row = document.createElement('label');
      row.className = 'axis';
      row.innerHTML = `<span>${axis.toUpperCase()}</span><input type="range" min="-${budget}" max="${budget}" step="1"><input type="number" min="-${budget}" max="${budget}" step="1">`;
      const range = row.querySelector('input[type=range]');
      const number = row.querySelector('input[type=number]');
      range.value = String(authoringEuler[bone][axis]);
      number.value = String(authoringEuler[bone][axis]);
      const update = (raw) => {
        const next = Math.max(-budget, Math.min(budget, Number(raw) || 0));
        const candidate = cloneEuler();
        candidate[bone][axis] = next;
        const validation = validateGuardQuaternionOffsets(currentOffsets(candidate));
        if (!validation.valid) {
          setStatus(`${bone} would exceed its ${budget}° quaternion budget`, 'bad');
          renderBoneControls();
          return;
        }
        authoringEuler = candidate;
        range.value = String(next);
        number.value = String(next);
        sampleFraction(currentFraction);
        refreshExport();
      };
      range.addEventListener('input', () => update(range.value));
      number.addEventListener('change', () => update(number.value));
      wrapper.appendChild(row);
    }
    controlsNode.appendChild(wrapper);
  }
}

function refreshExport() {
  const diagnostics = {
    stage:'G2.5.1',
    clipId:CLIP_ID,
    fiveSamplePass:lastValidation?.pass ?? false,
    fiveSamplePassCount:lastValidation?.passCount ?? 0,
  };
  exportNode.value = JSON.stringify(createGuardAuthoringExport(authoringEuler, diagnostics), null, 2);
}

async function loadCanonical() {
  setStatus('Loading canonical Skyrim Guard + G2.4.5 calibrated sword…', 'warning');
  library = await loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), { THREE, rig:character.rig, fps:30 });
  targetClip = library.clips.get(CLIP_ID);
  if (!targetClip) throw new Error(`Missing canonical clip ${CLIP_ID}`);
  const bind = targetClip.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error('G2.5.1 requires accepted G2.4.5 weapon bind calibration');
  targetBasis = targetClip.userData?.basisCalibration?.target;
  if (!targetBasis?.forward || !targetBasis?.right) throw new Error('G2.5.1 requires accepted G2.4.2 target basis');
  character.registerAnimations(library);
  sword = createDebugSword(THREE);
  const calibratedMount = composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind);
  mountDebugSword(character, sword, calibratedMount);
  sampleFraction(0.5);
  refreshExport();
  setStatus(`READY · ${CLIP_ID} · 50% authoring frame · low-level retarget frozen`, 'good');
  document.documentElement.dataset.g251Phase = 'ready';
  return targetClip;
}

async function runAutomation() {
  const params = new URLSearchParams(window.location.search);
  const view = ['front','three','side','back'].includes(params.get('view')) ? params.get('view') : 'three';
  const canonicalMode = params.get('canonical') === '1';
  setView(view);
  await loadCanonical();

  let score = null;
  if (canonicalMode) {
    if (!LONGSWORD_GUARD_AUTHORING_STATE.authored) throw new Error('Canonical G2.5.1 metadata has not been authored');
    authoringEuler = canonicalEuler();
    renderBoneControls();
    score = scoreEuler(authoringEuler);
  } else {
    const fit = await autoFitSeed();
    score = fit.best;
  }

  const validation = validateFiveSamples(false);
  sampleFraction(0.5);
  refreshExport();
  const offsets = currentOffsets();
  const result = {
    stage:'G2.5.1',
    mode:canonicalMode ? 'canonical-metadata' : 'auto-fit',
    pass:validation.pass,
    view,
    score:rounded(score?.score, 6),
    eulerDegrees:cloneEuler(),
    quaternionOffsets:offsets,
    validation,
  };
  document.documentElement.dataset.g251 = result.pass ? 'pass' : 'needs-correction';
  document.documentElement.dataset.g251Mode = result.mode;
  document.documentElement.dataset.g251Samples = `${validation.passCount}-of-5`;
  document.documentElement.dataset.g251Authoring = validateGuardQuaternionOffsets(offsets).valid ? 'within-budget' : 'invalid';
  setStatus(`G2.5.1 ${result.pass ? 'PASS' : 'NEEDS CORRECTION'} · ${validation.passCount}/5 · ${result.mode} · ${view}`, result.pass ? 'good' : 'warning');
  validationNode.textContent = JSON.stringify(result, null, 2);
  window.__G251_RESULT__ = result;
  return result;
}

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.getElementById('loadCanonical').addEventListener('click', () => loadCanonical().catch((error) => setStatus(error.message, 'bad')));
document.getElementById('freeze50').addEventListener('click', () => sampleFraction(0.5));
document.getElementById('autoFit').addEventListener('click', () => autoFitSeed().catch((error) => setStatus(error.message, 'bad')));
document.getElementById('validate5').addEventListener('click', () => validateFiveSamples(true));
document.getElementById('resetAll').addEventListener('click', () => {
  authoringEuler = blankEuler();
  lastValidation = null;
  renderBoneControls();
  if (targetClip) sampleFraction(0.5);
  validationNode.textContent = 'Not run yet.';
  refreshExport();
  setStatus('RESET · canonical source pose restored', 'warning');
});
document.getElementById('refreshExport').addEventListener('click', refreshExport);
document.getElementById('copyExport').addEventListener('click', async () => {
  refreshExport();
  try {
    await navigator.clipboard.writeText(exportNode.value);
    setStatus('Canonical authoring export copied.', 'good');
  } catch {
    exportNode.select();
    setStatus('Clipboard unavailable; export text selected.', 'warning');
  }
});

renderBoneControls();
setView('three');
resize();
window.addEventListener('resize', resize);

function frame() {
  if (sword) sword.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const params = new URLSearchParams(window.location.search);
if (params.get('auto') === '1' || params.get('canonical') === '1') {
  runAutomation().catch((error) => {
    document.documentElement.dataset.g251 = 'fail';
    setStatus(`FAIL · ${error?.message || error}`, 'bad');
    validationNode.textContent = error?.stack || String(error);
    window.__G251_RESULT__ = { stage:'G2.5.1', pass:false, error:error?.stack || String(error) };
  });
} else {
  loadCanonical().catch((error) => setStatus(error.message, 'bad'));
}

window.__G251_LAB__ = {
  get eulerDegrees(){ return cloneEuler(); },
  get quaternionOffsets(){ return currentOffsets(); },
  get validation(){ return lastValidation; },
  sampleFraction,
  validateFiveSamples,
  autoFitSeed,
};
