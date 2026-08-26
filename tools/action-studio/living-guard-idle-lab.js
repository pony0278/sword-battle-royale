import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../../src/animation/skyrim-weapon-bind-calibration.js';
import { LONGSWORD_GUARD_AUTHORING_STATE } from '../../src/combat/longsword-guard-metadata.js';
import { applyRigPose, captureRigPose } from '../../src/combat/guard-recovery-bridge.js';
import {
  LIVING_GUARD_IDLE_CANDIDATE_IDS,
  LIVING_GUARD_IDLE_CANDIDATES,
  LIVING_GUARD_IDLE_GENTLE_WINDOW,
  LIVING_GUARD_IDLE_SOURCE_CLIP_ID,
  LIVING_GUARD_IDLE_STAGE,
  buildLivingGuardIdleProbeReport,
  getLivingGuardIdleBoneWeight,
  sampleLivingGuardIdleCandidate,
} from '../../src/combat/living-guard-idle-probe.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader || !THREE?.Quaternion || !THREE?.OrbitControls) {
  throw new Error(`${LIVING_GUARD_IDLE_STAGE} requires Three.js + GLTFLoader + OrbitControls`);
}

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x09101a);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
const CAMERA_TARGET = new THREE.Vector3(0, 1.0, 0);
const CAMERA_PRESETS = Object.freeze({
  three: Object.freeze([5.6, 2.2, 8.3]),
  front: Object.freeze([0, 1.55, 9.0]),
  side: Object.freeze([9.0, 1.55, 0]),
  back: Object.freeze([0, 1.55, -9.0]),
});
const orbitControls = new THREE.OrbitControls(camera, canvas);
orbitControls.target.copy(CAMERA_TARGET);
orbitControls.enableDamping = false;
orbitControls.enablePan = true;
orbitControls.enableZoom = true;
orbitControls.minDistance = 3.2;
orbitControls.maxDistance = 18;
orbitControls.screenSpacePanning = true;
orbitControls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
orbitControls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
orbitControls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

scene.add(new THREE.HemisphereLight(0xffffff, 0x26344b, 1.35));
const key = new THREE.DirectionalLight(0xffffff, 1.0);
key.position.set(3, 6, 5);
scene.add(key);
scene.add(new THREE.GridHelper(12, 24, 0x34435d, 0x202a3b));

const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const playButton = document.getElementById('play');
const resetButton = document.getElementById('reset');
const resetCameraButton = document.getElementById('resetCamera');
const cards = new Map();

const SLOT_SPACING = 2.65;
const SLOT_CENTER_INDEX = (LIVING_GUARD_IDLE_CANDIDATES.length - 1) / 2;
const slots = LIVING_GUARD_IDLE_CANDIDATES.map((candidate, index) => ({
  candidate,
  character: createDefaultCharacter(THREE),
  sword: null,
  metrics: null,
  x: (index - SLOT_CENTER_INDEX) * SLOT_SPACING,
}));
slots.forEach((slot) => {
  slot.character.object3d.position.x = slot.x;
  scene.add(slot.character.object3d);
});

// A dedicated sampler never receives the corrected/display pose. This keeps
// raw source extraction independent from the G3.5.2 correction runtime cache.
const rawSampler = createDefaultCharacter(THREE);
let library = null;
let sourceClip = null;
let rawCanonicalPose = null;
let correctedCanonicalPose = null;
let autoplay = true;
let playbackStartedAt = performance.now();
let pausedElapsedSeconds = 0;

function setView(view = 'three') {
  const resolvedView = Object.hasOwn(CAMERA_PRESETS, view) ? view : 'three';
  camera.position.fromArray(CAMERA_PRESETS[resolvedView]);
  orbitControls.target.copy(CAMERA_TARGET);
  orbitControls.update();
  camera.updateMatrixWorld(true);
  document.documentElement.dataset.g364CameraView = resolvedView;
  return resolvedView;
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function quaternionAngleDegrees(a, b) {
  const dot = Math.min(1, Math.max(-1, Math.abs(a.dot(b))));
  return THREE.MathUtils.radToDeg(2 * Math.acos(dot));
}

function asQuaternion(value) {
  return new THREE.Quaternion(
    Number(value?.x) || 0,
    Number(value?.y) || 0,
    Number(value?.z) || 0,
    Number.isFinite(Number(value?.w)) ? Number(value.w) : 1,
  ).normalize();
}

function plainQuaternion(value) {
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function cloneTransform(transform) {
  return {
    position: { ...transform.position },
    quaternion: { ...transform.quaternion },
    scale: { ...transform.scale },
  };
}

function boneWorldQuaternion(slot, id) {
  const bone = slot.character.rig?.bones?.[id];
  if (!bone?.getWorldQuaternion) throw new Error(`Missing ${LIVING_GUARD_IDLE_STAGE} bone: ${id}`);
  slot.character.object3d.updateMatrixWorld(true);
  return bone.getWorldQuaternion(new THREE.Quaternion());
}

function swordTipWorldPosition(slot) {
  slot.character.object3d.updateMatrixWorld(true);
  slot.sword.object3d.updateMatrixWorld(true);
  slot.sword.update();
  return slot.sword.getSweepSegment(new THREE.Vector3(), new THREE.Vector3()).end;
}

function sampleRawPose(sourceTimeSeconds) {
  rawSampler.sampleAnimation(LIVING_GUARD_IDLE_SOURCE_CLIP_ID, sourceTimeSeconds, {
    inPlace: true,
    loop: false,
    rootRotationPolicy: 'lock',
  });
  rawSampler.object3d.updateMatrixWorld(true);
  return captureRigPose(rawSampler.rig);
}

function correctedPoseFromRaw(rawPose) {
  const corrected = {};
  for (const [boneId, transform] of Object.entries(rawPose || {})) {
    const next = cloneTransform(transform);
    const offset = LONGSWORD_GUARD_AUTHORING_STATE.offsets[boneId];
    if (offset) {
      const q = asQuaternion(transform.quaternion)
        .multiply(new THREE.Quaternion().fromArray(offset))
        .normalize();
      next.quaternion = plainQuaternion(q);
    }
    corrected[boneId] = next;
  }
  return corrected;
}

function livingTrianglePoseFromRaw(rawLivePose) {
  const output = {};
  for (const [boneId, correctedBase] of Object.entries(correctedCanonicalPose || {})) {
    const next = cloneTransform(correctedBase);
    const weight = getLivingGuardIdleBoneWeight(LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE, boneId);
    const rawBase = rawCanonicalPose?.[boneId];
    const rawLive = rawLivePose?.[boneId];
    if (weight > 0 && rawBase?.quaternion && rawLive?.quaternion) {
      const baseRawQ = asQuaternion(rawBase.quaternion);
      const liveRawQ = asQuaternion(rawLive.quaternion);
      let delta = baseRawQ.clone().invert().multiply(liveRawQ).normalize();
      if (delta.w < 0) delta = new THREE.Quaternion(-delta.x, -delta.y, -delta.z, -delta.w);
      const scaledDelta = new THREE.Quaternion().identity().slerp(delta, weight).normalize();
      const correctedBaseQ = asQuaternion(correctedBase.quaternion);
      next.quaternion = plainQuaternion(correctedBaseQ.multiply(scaledDelta).normalize());
    }
    // Deliberately retain corrected canonical positions/scales. G3.6.4 only
    // restores authored local rotational life, never root/hips drift or bob.
    output[boneId] = next;
  }
  return output;
}

function applyPoseToSlot(slot, pose) {
  applyRigPose(slot.character.rig, pose);
  slot.character.object3d.position.x = slot.x;
  slot.character.object3d.updateMatrixWorld(true);
  slot.sword.update();
}

function sampleCandidate(slot, elapsedSeconds) {
  const sample = sampleLivingGuardIdleCandidate(slot.candidate, elapsedSeconds, sourceClip.duration);
  if (slot.candidate.id === LIVING_GUARD_IDLE_CANDIDATE_IDS.STABLE_G363) {
    applyPoseToSlot(slot, correctedCanonicalPose);
    return sample;
  }

  const rawLive = sampleRawPose(sample.sourceTimeSeconds);
  if (slot.candidate.id === LIVING_GUARD_IDLE_CANDIDATE_IDS.SKYRIM_LIVE) {
    applyPoseToSlot(slot, correctedPoseFromRaw(rawLive));
    return sample;
  }

  applyPoseToSlot(slot, livingTrianglePoseFromRaw(rawLive));
  return sample;
}

function measureCandidate(slot) {
  const durationSeconds = 6;
  const stepSeconds = 1 / 60;
  sampleCandidate(slot, 0);
  const start = Object.freeze({
    root: boneWorldQuaternion(slot, 'root'),
    hips: boneWorldQuaternion(slot, 'hips'),
    chest: boneWorldQuaternion(slot, 'chest'),
    shoulder: boneWorldQuaternion(slot, 'upperarm.r'),
    wrist: boneWorldQuaternion(slot, 'wrist.r'),
    swordTip: swordTipWorldPosition(slot),
  });
  let previousTip = start.swordTip.clone();
  let previousChest = start.chest.clone();
  let maxRootExcursionDegrees = 0;
  let maxHipsExcursionDegrees = 0;
  let maxChestExcursionDegrees = 0;
  let maxShoulderExcursionDegrees = 0;
  let maxWristExcursionDegrees = 0;
  let maxChestStepDegrees = 0;
  let swordTipPathMeters = 0;
  let swordTipMaxDisplacementMeters = 0;
  let samples = 1;

  for (let elapsed = stepSeconds; elapsed <= durationSeconds + 1e-9; elapsed += stepSeconds) {
    sampleCandidate(slot, elapsed);
    const root = boneWorldQuaternion(slot, 'root');
    const hips = boneWorldQuaternion(slot, 'hips');
    const chest = boneWorldQuaternion(slot, 'chest');
    const shoulder = boneWorldQuaternion(slot, 'upperarm.r');
    const wrist = boneWorldQuaternion(slot, 'wrist.r');
    const tip = swordTipWorldPosition(slot);
    maxRootExcursionDegrees = Math.max(maxRootExcursionDegrees, quaternionAngleDegrees(start.root, root));
    maxHipsExcursionDegrees = Math.max(maxHipsExcursionDegrees, quaternionAngleDegrees(start.hips, hips));
    maxChestExcursionDegrees = Math.max(maxChestExcursionDegrees, quaternionAngleDegrees(start.chest, chest));
    maxShoulderExcursionDegrees = Math.max(maxShoulderExcursionDegrees, quaternionAngleDegrees(start.shoulder, shoulder));
    maxWristExcursionDegrees = Math.max(maxWristExcursionDegrees, quaternionAngleDegrees(start.wrist, wrist));
    maxChestStepDegrees = Math.max(maxChestStepDegrees, quaternionAngleDegrees(previousChest, chest));
    swordTipPathMeters += tip.distanceTo(previousTip);
    swordTipMaxDisplacementMeters = Math.max(swordTipMaxDisplacementMeters, tip.distanceTo(start.swordTip));
    previousTip = tip;
    previousChest = chest;
    samples += 1;
  }

  return Object.freeze({
    measurementDurationSeconds: durationSeconds,
    sourceRate: slot.candidate.sourceRate,
    sourceWindow: slot.candidate.sourceWindow,
    maxRootExcursionDegrees: Number(maxRootExcursionDegrees.toFixed(4)),
    maxHipsExcursionDegrees: Number(maxHipsExcursionDegrees.toFixed(4)),
    maxChestExcursionDegrees: Number(maxChestExcursionDegrees.toFixed(4)),
    maxShoulderExcursionDegrees: Number(maxShoulderExcursionDegrees.toFixed(4)),
    maxWristExcursionDegrees: Number(maxWristExcursionDegrees.toFixed(4)),
    maxChestStepDegrees: Number(maxChestStepDegrees.toFixed(4)),
    swordTipPathMeters: Number(swordTipPathMeters.toFixed(4)),
    swordTipMaxDisplacementMeters: Number(swordTipMaxDisplacementMeters.toFixed(4)),
    samples,
  });
}

function renderCards(sourceTimes = new Map()) {
  for (const slot of slots) {
    const card = cards.get(slot.candidate.id);
    if (!card) continue;
    const sourceTime = sourceTimes.get(slot.candidate.id);
    const window = slot.candidate.sourceWindow;
    const windowLabel = window ? ` · loop ${window.startSeconds.toFixed(0)}→${window.endSeconds.toFixed(0)}s` : '';
    card.querySelector('[data-role="source"]').textContent = Number.isFinite(sourceTime)
      ? `${sourceTime.toFixed(3)}s · ${slot.candidate.sourceRate.toFixed(2)}×${windowLabel}`
      : '—';
    card.querySelector('[data-role="chest"]').textContent = `excursion ${slot.metrics.maxChestExcursionDegrees.toFixed(2)}° · max step ${slot.metrics.maxChestStepDegrees.toFixed(3)}°`;
    card.querySelector('[data-role="arm"]').textContent = `shoulder ${slot.metrics.maxShoulderExcursionDegrees.toFixed(2)}° · wrist ${slot.metrics.maxWristExcursionDegrees.toFixed(2)}°`;
    card.querySelector('[data-role="sword"]').textContent = `path ${slot.metrics.swordTipPathMeters.toFixed(3)}m / ${slot.metrics.measurementDurationSeconds}s · max ${slot.metrics.swordTipMaxDisplacementMeters.toFixed(3)}m`;
  }
}

function applyElapsed(elapsedSeconds) {
  const sourceTimes = new Map();
  for (const slot of slots) {
    const sample = sampleCandidate(slot, elapsedSeconds);
    sourceTimes.set(slot.candidate.id, sample.sourceTimeSeconds);
  }
  renderCards(sourceTimes);
}

function buildReport() {
  const contract = buildLivingGuardIdleProbeReport(sourceClip.duration);
  const metrics = Object.fromEntries(slots.map((slot) => [slot.candidate.id, slot.metrics]));
  const stable = metrics[LIVING_GUARD_IDLE_CANDIDATE_IDS.STABLE_G363];
  const skyrim = metrics[LIVING_GUARD_IDLE_CANDIDATE_IDS.SKYRIM_LIVE];
  const living = metrics[LIVING_GUARD_IDLE_CANDIDATE_IDS.LIVING_TRIANGLE];
  const gates = Object.freeze({
    productionUnchanged: contract.productionUnchanged === true,
    sourceClipPresent: Boolean(sourceClip?.tracks?.length),
    selectedGentleWindow: living.sourceWindow?.startSeconds === LIVING_GUARD_IDLE_GENTLE_WINDOW.startSeconds
      && living.sourceWindow?.endSeconds === LIVING_GUARD_IDLE_GENTLE_WINDOW.endSeconds,
    stableRemainsStatic: stable.maxChestExcursionDegrees <= 0.1 && stable.swordTipPathMeters <= 0.01,
    skyrimReferenceHasVisibleMotion: skyrim.maxChestExcursionDegrees > stable.maxChestExcursionDegrees + 0.1
      && skyrim.swordTipPathMeters > stable.swordTipPathMeters + 0.01,
    livingTriangleHasVisibleMotion: living.maxChestExcursionDegrees >= 0.15
      && living.maxShoulderExcursionDegrees >= 0.15
      && living.swordTipPathMeters >= 0.01,
    livingTriangleIsRestrained: living.maxChestExcursionDegrees < Math.min(1.0, skyrim.maxChestExcursionDegrees)
      && living.maxShoulderExcursionDegrees < Math.min(2.0, skyrim.maxShoulderExcursionDegrees)
      && living.maxWristExcursionDegrees < Math.min(2.0, skyrim.maxWristExcursionDegrees)
      && living.swordTipPathMeters < skyrim.swordTipPathMeters,
    livingTriangleLocksFoundation: living.maxRootExcursionDegrees <= 0.1 && living.maxHipsExcursionDegrees <= 0.1,
    livingTriangleLoopContinuous: living.maxChestStepDegrees <= 0.15,
  });
  const failures = Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name);
  const report = Object.freeze({
    stage: LIVING_GUARD_IDLE_STAGE,
    pass: failures.length === 0,
    contract,
    metrics,
    gates,
    failures,
    decision: 'PROBE_ONLY — C uses the source-scanned 29–31s authored gentle loop as a raw local quaternion delta on top of the approved corrected Triangle Guard. Production remains G3.6.3.',
  });
  document.documentElement.dataset.g364 = report.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g364ProductionUnchanged = gates.productionUnchanged ? 'pass' : 'fail';
  document.documentElement.dataset.g364Stable = gates.stableRemainsStatic ? 'pass' : 'fail';
  document.documentElement.dataset.g364SkyrimLive = gates.skyrimReferenceHasVisibleMotion ? 'pass' : 'fail';
  document.documentElement.dataset.g364Living = gates.livingTriangleHasVisibleMotion && gates.livingTriangleIsRestrained ? 'pass' : 'fail';
  document.documentElement.dataset.g364Foundation = gates.livingTriangleLocksFoundation ? 'pass' : 'fail';
  document.documentElement.dataset.g364Loop = gates.livingTriangleLoopContinuous ? 'pass' : 'fail';
  reportNode.textContent = JSON.stringify(report, null, 2);
  window.__G364_LIVING_GUARD_IDLE_RESULT__ = report;
  return report;
}

async function main() {
  status.textContent = `${LIVING_GUARD_IDLE_STAGE} loading Skyrim Guard idle…`;
  library = await loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), {
    THREE,
    rig: rawSampler.rig,
    fps: 30,
  });
  sourceClip = library.clips.get(LIVING_GUARD_IDLE_SOURCE_CLIP_ID);
  if (!sourceClip) throw new Error(`Missing ${LIVING_GUARD_IDLE_SOURCE_CLIP_ID}`);
  if (sourceClip.duration + 1e-6 < LIVING_GUARD_IDLE_GENTLE_WINDOW.endSeconds) {
    throw new Error(`${LIVING_GUARD_IDLE_STAGE} gentle source window exceeds shd_blockidle duration`);
  }
  const bind = sourceClip.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error(`${LIVING_GUARD_IDLE_STAGE} requires accepted Skyrim weapon bind calibration`);
  const mount = composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind);

  rawSampler.registerAnimations(library);
  for (const slot of slots) {
    slot.sword = createDebugSword(THREE);
    mountDebugSword(slot.character, slot.sword, mount);
  }

  const canonicalSeconds = sampleLivingGuardIdleCandidate(
    LIVING_GUARD_IDLE_CANDIDATE_IDS.STABLE_G363,
    0,
    sourceClip.duration,
  ).canonicalSourceTimeSeconds;
  rawCanonicalPose = sampleRawPose(canonicalSeconds);
  correctedCanonicalPose = correctedPoseFromRaw(rawCanonicalPose);

  for (const slot of slots) slot.metrics = measureCandidate(slot);

  const report = buildReport();
  applyElapsed(0);
  status.textContent = `${LIVING_GUARD_IDLE_STAGE} ${report.pass ? 'READY' : 'FAIL'} · C loops authored 29→31s micro-sway · production remains G3.6.3`;
  status.className = report.pass ? 'good' : 'bad';
  playbackStartedAt = performance.now();
}

LIVING_GUARD_IDLE_CANDIDATES.forEach((candidate) => {
  const card = document.querySelector(`[data-candidate="${candidate.id}"]`);
  if (card) cards.set(candidate.id, card);
});

playButton.addEventListener('click', () => {
  autoplay = !autoplay;
  if (autoplay) {
    playbackStartedAt = performance.now() - pausedElapsedSeconds * 1000;
    playButton.textContent = '❚❚ Pause';
  } else {
    playButton.textContent = '▶ Play';
  }
});
resetButton.addEventListener('click', () => {
  pausedElapsedSeconds = 0;
  playbackStartedAt = performance.now();
  applyElapsed(0);
});
resetCameraButton.addEventListener('click', () => setView('three'));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));

setView(new URLSearchParams(location.search).get('view') || 'three');
resize();
addEventListener('resize', resize);

(function frame(now) {
  if (autoplay && sourceClip) {
    pausedElapsedSeconds = Math.max(0, (now - playbackStartedAt) / 1000);
    applyElapsed(pausedElapsedSeconds);
  }
  slots.forEach((slot) => slot.sword?.update());
  orbitControls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
})(performance.now());

main().catch((error) => {
  document.documentElement.dataset.g364 = 'fail';
  status.textContent = `${LIVING_GUARD_IDLE_STAGE} FAIL · ${error?.message || error}`;
  status.className = 'bad';
  reportNode.textContent = error?.stack || String(error);
  window.__G364_LIVING_GUARD_IDLE_RESULT__ = { stage: LIVING_GUARD_IDLE_STAGE, pass: false, error: error?.stack || String(error) };
});
