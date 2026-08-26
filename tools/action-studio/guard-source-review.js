import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import { loadKayKitAnimationLibrary } from '../../src/animation/kaykit-animation-library.js';
import {
  KAYKIT_GUARD_REVIEW_CLIPS,
  getKayKitGuardReviewClip,
} from '../../src/combat/kaykit-guard-source-review.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error('G1 Guard Source Review requires Three.js + GLTFLoader');

const canvas = document.getElementById('reviewCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
camera.position.set(2.8, 1.75, 3.9);
camera.lookAt(0, 1.05, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x263040, 1.25));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(2.5, 4, 3);
scene.add(keyLight);

const grid = new THREE.GridHelper(8, 16, 0x3b465b, 0x252d3b);
grid.position.y = 0;
scene.add(grid);

const character = createDefaultCharacter(THREE);
const sword = createDebugSword(THREE);
mountDebugSword(character, sword, DEFAULT_KAYKIT_SWORD_MOUNT);
scene.add(character.object3d);

const clipSelect = document.getElementById('reviewClip');
const status = document.getElementById('reviewStatus');
const durationValue = document.getElementById('durationValue');
const roleValue = document.getElementById('roleValue');
const modeValue = document.getElementById('modeValue');
const strategyValue = document.getElementById('strategyValue');
const sampleTime = document.getElementById('sampleTime');
const sampleTimeValue = document.getElementById('sampleTimeValue');
const hudClip = document.getElementById('hudClip');
const hudMode = document.getElementById('hudMode');

let library = null;
let lastTime = performance.now();
let dragging = false;
let lastPointer = null;
let yaw = 0;
let pitch = 0;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function selectedDefinition() {
  return getKayKitGuardReviewClip(clipSelect.value) || KAYKIT_GUARD_REVIEW_CLIPS[0];
}

function selectedClip() {
  return library?.clips.get(selectedDefinition().clipId) || null;
}

function formatSeconds(value) {
  return `${Math.max(0, Number(value) || 0).toFixed(3)}s`;
}

function syncSourceFacts() {
  const definition = selectedDefinition();
  const sourceClip = selectedClip();
  roleValue.textContent = `${definition.label} · ${definition.intent}`;
  durationValue.textContent = sourceClip ? formatSeconds(sourceClip.duration) : 'load source';
  modeValue.textContent = definition.defaultPreviewMode;
  strategyValue.textContent = definition.holdStrategy;
  const duration = Math.max(0, Number(sourceClip?.duration) || 0);
  sampleTime.max = String(duration || 1);
  sampleTime.value = String(Math.min(Number(sampleTime.value) || 0, duration));
  sampleTimeValue.textContent = formatSeconds(sampleTime.value);
}

function populate() {
  clipSelect.innerHTML = '';
  for (const definition of KAYKIT_GUARD_REVIEW_CLIPS) {
    const option = document.createElement('option');
    option.value = definition.clipId;
    option.textContent = `${definition.label} · ${definition.clipId}`;
    clipSelect.appendChild(option);
  }
  clipSelect.value = KAYKIT_GUARD_REVIEW_CLIPS[0].clipId;
  syncSourceFacts();
}

async function loadReviewSource() {
  setStatus('Loading KayKit melee.glb…');
  const loader = new THREE.GLTFLoader();
  library = await loadKayKitAnimationLibrary(loader, {
    baseUrl: '../../assets/kaykit/animations/',
    packIds: ['melee'],
  });
  for (const definition of KAYKIT_GUARD_REVIEW_CLIPS) {
    if (!library.clips.has(definition.clipId)) throw new Error(`Missing ${definition.clipId} in KayKit melee pack`);
  }
  character.registerAnimations(library);
  syncSourceFacts();
  setStatus(`G1 ready · ${library.clips.size} melee clips loaded · review the four guard candidates`);
}

async function ensureLoaded() {
  if (library) return;
  await loadReviewSource();
}

function setHud(mode) {
  hudClip.textContent = selectedDefinition().clipId;
  hudMode.textContent = mode;
}

async function preview(loop) {
  await ensureLoaded();
  const definition = selectedDefinition();
  const sourceClip = selectedClip();
  character.playAnimation(definition.clipId, {
    loop,
    inPlace: true,
    speed: 1,
    fadeSeconds: 0.08,
  });
  setHud(loop ? 'LOOP · natural 1.00×' : 'ONCE · natural 1.00×');
  setStatus(`${loop ? 'loop' : 'once'} · ${definition.clipId} · ${formatSeconds(sourceClip.duration)}`);
}

async function freezeAt(timeSeconds, label = 'FREEZE') {
  await ensureLoaded();
  const definition = selectedDefinition();
  const sourceClip = selectedClip();
  const time = Math.max(0, Math.min(Number(timeSeconds) || 0, Number(sourceClip.duration) || 0));
  character.sampleAnimation(definition.clipId, time, { loop: false, inPlace: true });
  sampleTime.value = String(time);
  sampleTimeValue.textContent = formatSeconds(time);
  setHud(`${label} · ${formatSeconds(time)} / ${formatSeconds(sourceClip.duration)}`);
  setStatus(`inspect · ${definition.clipId} · frozen at ${formatSeconds(time)}`);
}

function restPose() {
  character.stopAnimation();
  hudClip.textContent = 'REST POSE';
  hudMode.textContent = 'G1 source review';
  setStatus('Returned to procedural rest pose');
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function updateCamera() {
  const radius = 4.65;
  const target = new THREE.Vector3(0, 1.05, 0);
  const cp = Math.cos(pitch);
  camera.position.set(
    target.x + Math.sin(yaw + 0.62) * cp * radius,
    target.y + Math.sin(pitch + 0.17) * radius,
    target.z + Math.cos(yaw + 0.62) * cp * radius,
  );
  camera.lookAt(target);
}

function frame(now) {
  resize();
  const delta = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  character.update(delta, camera);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture?.(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging || !lastPointer) return;
  yaw -= (event.clientX - lastPointer.x) * 0.006;
  pitch = Math.max(-0.3, Math.min(0.42, pitch + (event.clientY - lastPointer.y) * 0.004));
  lastPointer = { x: event.clientX, y: event.clientY };
  updateCamera();
});
canvas.addEventListener('pointerup', () => { dragging = false; lastPointer = null; });
canvas.addEventListener('pointercancel', () => { dragging = false; lastPointer = null; });

clipSelect.addEventListener('change', () => {
  character.stopAnimation();
  sampleTime.value = '0';
  syncSourceFacts();
  setHud('selected · ready to preview');
});
document.getElementById('loadReview').addEventListener('click', () => loadReviewSource().catch((error) => setStatus(error.message, true)));
document.getElementById('previewOnce').addEventListener('click', () => preview(false).catch((error) => setStatus(error.message, true)));
document.getElementById('previewLoop').addEventListener('click', () => preview(true).catch((error) => setStatus(error.message, true)));
document.getElementById('holdEnd').addEventListener('click', async () => {
  try {
    await ensureLoaded();
    const sourceClip = selectedClip();
    await freezeAt(Math.max(0, Number(sourceClip.duration) - 1 / 60), 'HOLD END');
  } catch (error) {
    setStatus(error.message, true);
  }
});
document.getElementById('stopReview').addEventListener('click', restPose);
sampleTime.addEventListener('input', () => {
  sampleTimeValue.textContent = formatSeconds(sampleTime.value);
  freezeAt(sampleTime.value).catch((error) => setStatus(error.message, true));
});

populate();
updateCamera();
requestAnimationFrame(frame);
