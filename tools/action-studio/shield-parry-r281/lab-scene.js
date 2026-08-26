import { createDefaultCharacter } from '../../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../../src/character/default-character-mount.js';
import { createProceduralBuckler, mountOffhandBuckler } from '../../../src/character/offhand-buckler.js';
import {
  ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423,
  ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423,
} from '../../../src/character/offhand-buckler-accepted-calibration.js';
import { createFreeInspectionCameraControls } from '../free-inspection-camera-controls.js?v=g43b5r281-residual-body-reach-r18';

const DEFAULT_VIEW = Object.freeze({ x: 4.8, y: 2.4, z: 4.9 });
const CAMERA_TARGET = Object.freeze({ x: 0, y: 1.05, z: 0 });

export function createShieldParryLabScene({ THREE, documentRef = document, windowRef = window } = {}) {
  if (!THREE?.WebGLRenderer) throw new Error('createShieldParryLabScene requires Three.js WebGLRenderer');

  const canvas = documentRef.getElementById('canvas');
  if (!canvas) throw new Error('Shield Parry Lab requires #canvas');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(windowRef.devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090e16);
  scene.fog = new THREE.Fog(0x090e16, 8, 18);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  camera.position.set(DEFAULT_VIEW.x, DEFAULT_VIEW.y, DEFAULT_VIEW.z);
  camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
  camera.updateMatrixWorld(true);

  const freeCamera = createFreeInspectionCameraControls(THREE, {
    camera,
    domElement: canvas,
    target: CAMERA_TARGET,
    minimumRadius: 0.65,
    maximumRadius: 18,
  });

  scene.add(new THREE.HemisphereLight(0xddeaff, 0x202738, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(4, 7, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fe2cf, 0.55);
  rim.position.set(-4, 3, -4);
  scene.add(rim);
  scene.add(new THREE.GridHelper(12, 24, 0x33445f, 0x202a3b));

  const attacker = createDefaultCharacter(THREE);
  const defender = createDefaultCharacter(THREE);
  attacker.object3d.position.set(0, 0, -1.15);
  defender.object3d.position.set(0, 0, 1.15);
  defender.object3d.rotation.y = Math.PI;
  scene.add(attacker.object3d, defender.object3d);

  const attackerSword = createDebugSword(THREE);
  mountDebugSword(attacker, attackerSword, DEFAULT_KAYKIT_SWORD_MOUNT);

  const buckler = createProceduralBuckler(THREE, {
    ...ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423,
    lineMode: true,
    solidVisible: false,
  });
  mountOffhandBuckler(defender, buckler, ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423);
  buckler.setParrySurfaceVisible(true);

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function setView(view) {
    const position = view === 'side'
      ? { x: 5.8, y: 1.7, z: 0.1 }
      : view === 'contact'
        ? { x: 2.25, y: 1.5, z: 2.2 }
        : DEFAULT_VIEW;
    freeCamera.setPose(position, CAMERA_TARGET);
  }

  return Object.freeze({
    canvas,
    renderer,
    scene,
    camera,
    freeCamera,
    attacker,
    defender,
    attackerSword,
    buckler,
    resize,
    setView,
  });
}
