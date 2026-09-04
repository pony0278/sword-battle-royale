import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../../src/animation/skyrim-weapon-bind-calibration.js';
import {
  BUCKLER_CALIBRATION_STAGE,
  DEFAULT_OFFHAND_BUCKLER_MOUNT,
  OFFHAND_BUCKLER_STAGE,
  OFFHAND_SOCKET_ID,
  createProceduralBuckler,
  mountOffhandBuckler,
} from '../../src/character/offhand-buckler.js';
import {
  GUARD_EVENTS,
  GUARD_STATES,
  createGuardStateMachine,
} from '../../src/combat/guard-state-machine.js';
import { createGuardPresentationRuntime } from '../../src/combat/guard-presentation-runtime.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error('G4.2.3 requires Three.js + GLTFLoader');

const STORAGE_KEY = 'blocky-sword-buckler-calibration-g423';
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090e16);
scene.fog = new THREE.Fog(0x090e16, 7, 14);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
scene.add(new THREE.HemisphereLight(0xddeaff, 0x202738, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 1.15);
key.position.set(4, 7, 4);
key.castShadow = true;
scene.add(key);
const rimLight = new THREE.DirectionalLight(0x7fe2cf, 0.45);
rimLight.position.set(-4, 3, -3);
scene.add(rimLight);
scene.add(new THREE.GridHelper(10, 20, 0x33445f, 0x202a3b));

const defender = createDefaultCharacter(THREE);
scene.add(defender.object3d);

const guardMachine = createGuardStateMachine();
const guardRuntime = createGuardPresentationRuntime(THREE, { machine: guardMachine, character: defender });
const buckler = createProceduralBuckler(THREE, { lineMode: true, solidVisible: false });
mountOffhandBuckler(defender, buckler);
let defenderSword = null;
let ready = false;
let lastTimestamp = performance.now();
let guardReport = null;

const hudGuard = document.getElementById('hudGuard');
const hudBuckler = document.getElementById('hudBuckler');
const hudSurface = document.getElementById('hudSurface');
const hudMount = document.getElementById('hudMount');
const status = document.getElementById('status');
const showSurface = document.getElementById('showSurface');
const lineMode = document.getElementById('lineMode');
const solidMode = document.getElementById('solidMode');
const showAnchor = document.getElementById('showAnchor');
const calibrationOutput = document.getElementById('calibrationOutput');
const copyStatus = document.getElementById('copyStatus');
const resetMount = document.getElementById('resetMount');
const copyJson = document.getElementById('copyJson');
const saveLocal = document.getElementById('saveLocal');
const loadLocal = document.getElementById('loadLocal');

const socket = defender.sockets?.[OFFHAND_SOCKET_ID];
if (!socket) throw new Error('G4.2.3 requires existing HAND_L socket');

const socketAnchorSnapshot = Object.freeze({
  position: Object.freeze(socket.position.toArray()),
  quaternion: Object.freeze(socket.quaternion.toArray()),
  scale: Object.freeze(socket.scale.toArray()),
});
const anchorAxes = new THREE.AxesHelper(0.22);
anchorAxes.name = 'HAND_L_LOCKED_ANCHOR_AXES';
socket.add(anchorAxes);

const mountState = {
  position: {
    x: DEFAULT_OFFHAND_BUCKLER_MOUNT.position.x,
    y: DEFAULT_OFFHAND_BUCKLER_MOUNT.position.y,
    z: DEFAULT_OFFHAND_BUCKLER_MOUNT.position.z,
  },
  rotationDegrees: {
    x: DEFAULT_OFFHAND_BUCKLER_MOUNT.rotation.x * RAD_TO_DEG,
    y: DEFAULT_OFFHAND_BUCKLER_MOUNT.rotation.y * RAD_TO_DEG,
    z: DEFAULT_OFFHAND_BUCKLER_MOUNT.rotation.z * RAD_TO_DEG,
  },
  scale: {
    x: DEFAULT_OFFHAND_BUCKLER_MOUNT.scale.x,
    y: DEFAULT_OFFHAND_BUCKLER_MOUNT.scale.y,
    z: DEFAULT_OFFHAND_BUCKLER_MOUNT.scale.z,
  },
};

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setView(view) {
  if (view === 'front') camera.position.set(0, 1.75, 4.3);
  else if (view === 'side') camera.position.set(4.5, 1.7, 0.05);
  else if (view === 'back') camera.position.set(0, 1.75, -4.3);
  else if (view === 'offhand') camera.position.set(1.65, 1.55, 2.15);
  else camera.position.set(3.5, 2.2, 4.15);
  camera.lookAt(view === 'offhand' ? new THREE.Vector3(0.28, 1.18, 0) : new THREE.Vector3(0, 1.0, 0));
  camera.updateMatrixWorld(true);
}

function enterProductionGuard() {
  guardMachine.send(GUARD_EVENTS.RESET, { stage: BUCKLER_CALIBRATION_STAGE, reason: 'buckler-calibration-init' });
  guardRuntime.sync(camera);
  guardMachine.send(GUARD_EVENTS.GUARD_PRESS, { stage: BUCKLER_CALIBRATION_STAGE });
  guardRuntime.sync(camera);
  guardReport = guardRuntime.update(180, camera);
  if (guardReport.snapshot.state !== GUARD_STATES.HOLD) {
    throw new Error(`G4.2.3 expected Guard Hold, received ${guardReport.snapshot.state}`);
  }
}

function socketStillLocked() {
  const same = (a, b) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-10);
  return same(socket.position.toArray(), socketAnchorSnapshot.position)
    && same(socket.quaternion.toArray(), socketAnchorSnapshot.quaternion)
    && same(socket.scale.toArray(), socketAnchorSnapshot.scale);
}

function currentMountRadians() {
  return {
    position: { ...mountState.position },
    rotation: {
      x: mountState.rotationDegrees.x * DEG_TO_RAD,
      y: mountState.rotationDegrees.y * DEG_TO_RAD,
      z: mountState.rotationDegrees.z * DEG_TO_RAD,
    },
    scale: { ...mountState.scale },
  };
}

function applyCalibration() {
  buckler.setMountCalibration(currentMountRadians());
  if (!socketStillLocked()) throw new Error('HAND_L socket moved; calibration must modify Buckler local transform only');
  updateControls();
  renderOutput();
}

function outputPayload() {
  const runtimeExport = buckler.exportCalibration();
  return {
    ...runtimeExport,
    mount: {
      position: { ...mountState.position },
      rotationDegrees: { ...mountState.rotationDegrees },
      rotationRadians: { ...runtimeExport.mount.rotationRadians },
      scale: { ...mountState.scale },
    },
    note: 'HAND_L socket is locked; values are Buckler-local only.',
  };
}

function renderOutput() {
  calibrationOutput.value = JSON.stringify(outputPayload(), null, 2);
}

function setStateFromPayload(payload = {}) {
  const mount = payload.mount || payload;
  const position = mount.position || {};
  const rotationDegrees = mount.rotationDegrees || null;
  const rotationRadians = mount.rotationRadians || mount.rotation || {};
  const scale = mount.scale || {};
  for (const axis of ['x', 'y', 'z']) {
    if (Number.isFinite(Number(position[axis]))) mountState.position[axis] = Number(position[axis]);
    if (rotationDegrees && Number.isFinite(Number(rotationDegrees[axis]))) {
      mountState.rotationDegrees[axis] = Number(rotationDegrees[axis]);
    } else if (Number.isFinite(Number(rotationRadians[axis]))) {
      mountState.rotationDegrees[axis] = Number(rotationRadians[axis]) * RAD_TO_DEG;
    }
    if (Number.isFinite(Number(scale[axis]))) mountState.scale[axis] = Math.max(0.001, Number(scale[axis]));
  }
  applyCalibration();
}

function resetCalibration() {
  setStateFromPayload({
    mount: {
      position: DEFAULT_OFFHAND_BUCKLER_MOUNT.position,
      rotationRadians: DEFAULT_OFFHAND_BUCKLER_MOUNT.rotation,
      scale: DEFAULT_OFFHAND_BUCKLER_MOUNT.scale,
    },
  });
  copyStatus.textContent = 'Reset to G4.2.2 default mount.';
}

function pathValue(path) {
  const [group, axis] = path.split('.');
  if (group === 'rotation') return mountState.rotationDegrees[axis];
  return mountState[group][axis];
}

function setPathValue(path, value) {
  const [group, axis] = path.split('.');
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  if (group === 'rotation') mountState.rotationDegrees[axis] = number;
  else if (group === 'scale') mountState.scale[axis] = Math.max(0.001, number);
  else mountState.position[axis] = number;
  applyCalibration();
}

function updateControls() {
  document.querySelectorAll('[data-path]').forEach((input) => {
    const value = pathValue(input.dataset.path);
    input.value = String(value);
    const numberInput = document.querySelector(`[data-number="${input.dataset.path}"]`);
    if (numberInput) numberInput.value = String(Number(value.toFixed(5)));
  });
}

document.querySelectorAll('[data-path]').forEach((input) => {
  input.addEventListener('input', () => setPathValue(input.dataset.path, input.value));
});
document.querySelectorAll('[data-number]').forEach((input) => {
  input.addEventListener('change', () => setPathValue(input.dataset.number, input.value));
});

showSurface.addEventListener('change', () => buckler.setParrySurfaceVisible(showSurface.checked));
lineMode.addEventListener('change', () => {
  buckler.setLineMode(lineMode.checked);
  renderOutput();
});
solidMode.addEventListener('change', () => {
  buckler.setSolidVisible(solidMode.checked);
  renderOutput();
});
showAnchor.addEventListener('change', () => {
  anchorAxes.visible = showAnchor.checked;
});
document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

copyJson.addEventListener('click', async () => {
  renderOutput();
  try {
    await navigator.clipboard.writeText(calibrationOutput.value);
    copyStatus.textContent = 'Copied calibration JSON.';
  } catch (_error) {
    calibrationOutput.focus();
    calibrationOutput.select();
    document.execCommand?.('copy');
    copyStatus.textContent = 'Copied calibration JSON (fallback).';
  }
});

saveLocal.addEventListener('click', () => {
  localStorage.setItem(STORAGE_KEY, calibrationOutput.value);
  copyStatus.textContent = 'Saved in this browser.';
});

loadLocal.addEventListener('click', () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    copyStatus.textContent = 'No saved calibration found.';
    return;
  }
  try {
    setStateFromPayload(JSON.parse(stored));
    copyStatus.textContent = 'Loaded saved calibration.';
  } catch (error) {
    copyStatus.textContent = `Load failed: ${error?.message || error}`;
  }
});

resetMount.addEventListener('click', resetCalibration);

function verifyLab(skyrim) {
  const parrySurface = buckler.getWorldParrySurface();
  const exported = buckler.exportCalibration();
  const gates = {
    equipmentStagePreserved: buckler.stage === OFFHAND_BUCKLER_STAGE,
    calibrationStage: exported.stage === BUCKLER_CALIBRATION_STAGE,
    handLeftSocketExists: Boolean(socket),
    socketLocked: socketStillLocked(),
    mountedToHandLeft: buckler.object3d.userData.attachedSocket === OFFHAND_SOCKET_ID
      && buckler.object3d.parent === socket,
    lineBuckler: Boolean(buckler.lineRoot && buckler.outline && buckler.glow),
    solidOptional: Boolean(buckler.solidRoot),
    productionGuardHold: defender.hasAnimation('SKYRIM_GUARD/shd_blockidle'),
    productionParrySource: defender.hasAnimation('SKYRIM_GUARD/shd_blockbashpower'),
    swordMounted: Boolean(defenderSword?.object3d),
    surfaceShape: parrySurface.shape === 'oriented-disc',
    surfaceRadius: Math.abs(parrySurface.radius - 0.26) < 1e-6,
    exportSocketLocked: exported.socketLocked === true && exported.socketId === 'HAND_L',
    skyrimLibrary: skyrim.clips.size >= 4,
  };
  const failures = Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name);
  const report = {
    stage: BUCKLER_CALIBRATION_STAGE,
    equipmentStage: OFFHAND_BUCKLER_STAGE,
    pass: failures.length === 0,
    socket: {
      id: OFFHAND_SOCKET_ID,
      locked: true,
      baseline: socketAnchorSnapshot,
    },
    calibration: outputPayload(),
    gates,
    failures,
    next: 'Export the tuned JSON; G4.3A will consume the accepted mount and oriented-disc parry surface.',
  };
  document.documentElement.dataset.g422 = gates.equipmentStagePreserved ? 'pass' : 'fail';
  document.documentElement.dataset.g423 = report.pass ? 'pass' : 'fail';
  status.textContent = report.pass
    ? 'G4.2.3 PASS · locked HAND_L + live Buckler calibration + line visualization'
    : `G4.2.3 FAIL · ${failures.join(', ')}`;
  status.className = report.pass ? 'good' : 'bad';
  window.__G423_RESULT__ = report;
  return report;
}

async function main() {
  status.textContent = 'Loading production Skyrim Guard…';
  const skyrim = await loadSkyrimConvertedAnimationLibrary(
    new THREE.GLTFLoader(),
    { THREE, rig: defender.rig, fps: 30 },
  );
  defender.registerAnimations(skyrim);

  const idle = skyrim.clips.get('SKYRIM_GUARD/shd_blockidle');
  const bind = idle?.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error('G4.2.3 requires accepted Skyrim Guard weapon bind calibration');
  defenderSword = createDebugSword(THREE);
  mountDebugSword(
    defender,
    defenderSword,
    composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind),
  );

  enterProductionGuard();
  applyCalibration();
  buckler.setLineMode(lineMode.checked);
  buckler.setSolidVisible(solidMode.checked);
  buckler.setParrySurfaceVisible(showSurface.checked);
  anchorAxes.visible = showAnchor.checked;
  ready = true;
  verifyLab(skyrim);
}

setView('three');
resize();
updateControls();
renderOutput();
addEventListener('resize', resize);

function frame(timestamp) {
  const deltaMs = Math.min(50, Math.max(0, timestamp - lastTimestamp));
  lastTimestamp = timestamp;
  if (ready) {
    guardReport = guardRuntime.update(deltaMs, camera);
    defender.update(0, camera);
    defenderSword?.update();
    const surface = buckler.getWorldParrySurface();
    const mount = buckler.getMountCalibration();
    hudGuard.textContent = `Guard: ${guardReport.snapshot.state} · ${guardReport.report.clipId || '—'}`;
    hudBuckler.textContent = `Buckler: LINE ${buckler.lineRoot.visible ? 'ON' : 'OFF'} · SOLID ${buckler.solidRoot.visible ? 'ON' : 'OFF'} · ${OFFHAND_SOCKET_ID} LOCKED`;
    hudSurface.textContent = `Parry surface: r=${surface.radius.toFixed(2)}m · N(${surface.normal.x.toFixed(2)}, ${surface.normal.y.toFixed(2)}, ${surface.normal.z.toFixed(2)})`;
    hudMount.textContent = `Mount P(${mount.position.x.toFixed(3)}, ${mount.position.y.toFixed(3)}, ${mount.position.z.toFixed(3)}) · R°(${mountState.rotationDegrees.x.toFixed(0)}, ${mountState.rotationDegrees.y.toFixed(0)}, ${mountState.rotationDegrees.z.toFixed(0)})`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

main().catch((error) => {
  document.documentElement.dataset.g423 = 'fail';
  status.textContent = `G4.2.3 FAIL · ${error?.message || error}`;
  status.className = 'bad';
  calibrationOutput.value = error?.stack || String(error);
  window.__G423_RESULT__ = { stage: BUCKLER_CALIBRATION_STAGE, pass: false, error: error?.stack || String(error) };
});

window.__G423_LAB__ = {
  defender,
  guardMachine,
  guardRuntime,
  buckler,
  socket,
  socketAnchorSnapshot,
  applyCalibration,
  resetCalibration,
  exportCalibration: outputPayload,
  setCalibration: setStateFromPayload,
};
