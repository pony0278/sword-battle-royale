import { createDefaultCharacter } from '../character/default-character.js';
import { createDebugSword, mountDebugSword } from '../character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../character/default-character-mount.js';
import { createProceduralBuckler, mountOffhandBuckler } from '../character/offhand-buckler.js';
import {
  ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423,
  ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423,
} from '../character/offhand-buckler-accepted-calibration.js';
import {
  CALIBRATED_ENGAGEMENT_SEPARATION_METERS,
  planEngagementStance,
} from '../combat/engagement-spacing.js';

const DEFAULT_VIEW = Object.freeze({ x: 4.8, y: 2.4, z: 4.9 });
const CAMERA_TARGET = Object.freeze({ x: 0, y: 1.05, z: 0 });

// R20Z.4: the observation camera is a lab affordance - a free-flying orbit rig for looking at the
// fight from outside it, reached with ?camera=free. The scene used to construct it directly, which
// was the one edge left pointing from the game into the lab. Injected now, with a null object that
// answers the same shape so the scene needs no branches: no controls means the game camera is the
// only camera, which is what a player gets.
const NO_INSPECTION_CAMERA = Object.freeze({
  update() {}, setPose() {}, syncFromCamera() {}, dispose() {},
  snapshot: () => Object.freeze({ authority: 'no-inspection-camera-attached' }),
  target: Object.freeze({ x: 0, y: 0, z: 0 }),
});

// R22I.1 renamed this from createShieldParryLabScene.
//
// "Lab" named the caller, not the thing. This builds a renderer, a scene, a camera, three lights,
// two fighters and the measured stance between them - that is the game's scene by any reading, and
// the only reason it carried "Lab" is that the lab is the only entry that exists yet. Investigated
// before renaming: nothing in src/ imports src/game at all, which is not evidence that this layer
// is lab-only but that it sits on top of combat, character and animation - where a composition
// layer belongs. The lab entry imports twelve modules from it; moving one to tools/ would have
// left the other eleven behind.
//
// R20Z.4 had already removed the one real edge from the game into the lab by injecting the
// inspection camera. This is the name that was left over from before that.
export function createCombatScene({
  THREE,
  documentRef = document,
  windowRef = window,
  separationMeters = CALIBRATED_ENGAGEMENT_SEPARATION_METERS,
  createInspectionCamera = null,
} = {}) {
  if (!THREE?.WebGLRenderer) throw new Error('createCombatScene requires Three.js WebGLRenderer');

  const canvas = documentRef.getElementById('canvas');
  if (!canvas) throw new Error('createCombatScene requires a #canvas element');

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

  const freeCamera = createInspectionCamera
    ? createInspectionCamera(THREE, {
      camera,
      domElement: canvas,
      target: CAMERA_TARGET,
      minimumRadius: 0.65,
      maximumRadius: 18,
    })
    : NO_INSPECTION_CAMERA;

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
  // R18T.1: the stance geometry is the combat module's, so that how far apart the fighters stand
  // is a stated fact rather than two coordinates buried in a scene file.
  let engagementStance = planEngagementStance(separationMeters);
  // R18Y.1 / R18Z.1: how far the fight has carried each fighter off that stance. Kept here because
  // this is the only place actor transforms are written, and both are re-applied absolutely rather
  // than accumulated, so a repeated frame cannot make anyone creep down the lane.
  let attackerAdvanceMeters = 0;
  let defenderAdvanceMeters = 0;
  let defenderYawOffsetRadians = 0; // R19Q.1: the facing turn, applied with every stamp so a lane write cannot erase it
  function applyEngagementStance(stance) {
    engagementStance = stance;
    attacker.object3d.position.set(
      stance.attacker.position.x,
      stance.attacker.position.y,
      // The attacker faces down +z, so the whole step is along it.
      stance.attacker.position.z + attackerAdvanceMeters,
    );
    attacker.object3d.rotation.y = stance.attacker.facingRadians;
    defender.object3d.position.set(
      stance.defender.position.x,
      stance.defender.position.y,
      // The defender is on the far side of the lane, so ground given up is also +z.
      stance.defender.position.z + defenderAdvanceMeters,
    );
    defender.object3d.rotation.y = stance.defender.facingRadians + defenderYawOffsetRadians;
    attacker.object3d.updateMatrixWorld(true);
    defender.object3d.updateMatrixWorld(true);
    return stance;
  }
  applyEngagementStance(engagementStance);
  // Changing separation mid-exchange would move the geometry the swept probe is measuring, so
  // callers are expected to do it between exchanges.
  function setEngagementSeparation(meters) {
    return applyEngagementStance(planEngagementStance(meters));
  }
  function setDefenderYawOffset(radians) {
    defenderYawOffsetRadians = Number.isFinite(Number(radians)) ? Number(radians) : 0;
    return applyEngagementStance(engagementStance);
  }
  // R19S.1 (stage B1): the ledger owns where anybody is, so a ledger report that carries world
  // positions and facing bearings is stamped verbatim - position from the report, base facing
  // from the report's bearing, the guard's yaw offset on top. The scalar path underneath is kept
  // for boot and stance changes, and on the line (x = 0) the two produce identical transforms,
  // which the B1 golden grid holds this scene to.
  function setLanePositions(report = {}) {
    const attackerM = Number(report.attackerMeters);
    const defenderM = Number(report.defenderMeters);
    attackerAdvanceMeters = Number.isFinite(attackerM) ? attackerM : 0;
    defenderAdvanceMeters = Number.isFinite(defenderM) ? defenderM : 0;
    const ap = report.attackerPosition;
    const dp = report.defenderPosition;
    if (!ap || !dp
      || !Number.isFinite(Number(ap.x)) || !Number.isFinite(Number(ap.z))
      || !Number.isFinite(Number(dp.x)) || !Number.isFinite(Number(dp.z))) {
      return applyEngagementStance(engagementStance);
    }
    attacker.object3d.position.set(Number(ap.x), engagementStance.attacker.position.y, Number(ap.z));
    attacker.object3d.rotation.y = Number.isFinite(Number(report.attackerFacingRadians))
      ? Number(report.attackerFacingRadians)
      : engagementStance.attacker.facingRadians;
    defender.object3d.position.set(Number(dp.x), engagementStance.defender.position.y, Number(dp.z));
    defender.object3d.rotation.y = (Number.isFinite(Number(report.defenderFacingRadians))
      ? Number(report.defenderFacingRadians)
      : engagementStance.defender.facingRadians) + defenderYawOffsetRadians;
    attacker.object3d.updateMatrixWorld(true);
    defender.object3d.updateMatrixWorld(true);
    return engagementStance;
  }
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
    setDefenderYawOffset,
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
    setEngagementSeparation,
    setLanePositions,
    get engagementStance() { return engagementStance; },
  });
}
