import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import { createProceduralBuckler, mountOffhandBuckler } from '../../src/character/offhand-buckler.js';
import {
  ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423,
  ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423,
} from '../../src/character/offhand-buckler-accepted-calibration.js';
import { loadUal1AnimationLibrary } from '../../src/animation/ual1-animation-library.js';
import { loadUal2AnimationLibrary } from '../../src/animation/ual2-animation-library.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../../src/animation/skyrim-weapon-bind-calibration.js';
import { GUARD_EVENTS, GUARD_STATES, createGuardStateMachine } from '../../src/combat/guard-state-machine.js';
import { createGuardPresentationRuntime } from '../../src/combat/guard-presentation-runtime.js';
import { createLongswordDirectionalAttackRuntime } from '../../src/combat/longsword-directional-attack-runtime.js';
import { captureRigPose, applyRigPose, blendRecoveryPose } from '../../src/combat/guard-recovery-bridge.js';
import { sampleLongswordAttackRecovery } from '../../src/combat/longsword-contact-recovery-presentation.js';
import { probeSweptSwordBucklerContact } from '../../src/combat/swept-sword-buckler-contact.js';
import {
  GUARD_THREAT_TRACKING_STAGE,
  createGuardThreatTrackingRuntime,
  planGuardThreatCorrection,
} from '../../src/combat/guard-threat-tracking.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error('G4.3A.1 requires Three.js + GLTFLoader');

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090e16);
scene.fog = new THREE.Fog(0x090e16, 8, 18);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
scene.add(new THREE.HemisphereLight(0xddeaff, 0x202738, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(4, 7, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0x7fe2cf, 0.55); rim.position.set(-4, 3, -4); scene.add(rim);
scene.add(new THREE.GridHelper(12, 24, 0x33445f, 0x202a3b));

const attacker = createDefaultCharacter(THREE);
const defender = createDefaultCharacter(THREE);
attacker.object3d.position.set(0, 0, -1.15);
defender.object3d.position.set(0, 0, 1.15);
defender.object3d.rotation.y = Math.PI;
scene.add(attacker.object3d, defender.object3d);
const attackerSword = createDebugSword(THREE);
mountDebugSword(attacker, attackerSword, DEFAULT_KAYKIT_SWORD_MOUNT);
let defenderSword = null;
const buckler = createProceduralBuckler(THREE, {
  ...ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423,
  lineMode: true,
  solidVisible: false,
});
mountOffhandBuckler(defender, buckler, ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423);
buckler.setParrySurfaceVisible(true);

const attackRuntime = createLongswordDirectionalAttackRuntime();
const guardMachine = createGuardStateMachine();
const guardRuntime = createGuardPresentationRuntime(THREE, { machine: guardMachine, character: defender });
const trackingRuntime = createGuardThreatTrackingRuntime(THREE, { rig: defender.rig, buckler });

const hudAttack = document.getElementById('hudAttack');
const hudThreat = document.getElementById('hudThreat');
const hudTracking = document.getElementById('hudTracking');
const hudContact = document.getElementById('hudContact');
const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const autoRepeat = document.getElementById('autoRepeat');
const showTracking = document.getElementById('showTracking');
const showSurface = document.getElementById('showSurface');

let ready = false;
let selectedDirection = 'left';
let trackingMode = 'guard';
let lastTimestamp = performance.now();
let attackerIdleDuration = 1;
let attackerIdleClockSeconds = 0;
let attackerRecovery = null;
let repeatCooldownMs = 0;
let previousBlade = null;
let latestPlan = null;
let latestTracking = null;
let latestContact = null;
let firstContact = null;
let guardReport = null;

function marker(name, color, radius = 0.055) {
  const node = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshBasicMaterial({ color, depthWrite: false }));
  node.name = name; node.visible = false; scene.add(node); return node;
}
const threatMarker = marker('G43A1_THREAT', 0x6cff86);
const targetMarker = marker('G43A1_TARGET', 0x4ca8ff);
const contactMarker = marker('G43A1_CONTACT', 0xff625f, 0.065);
const correctionGeometry = new THREE.BufferGeometry();
correctionGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
const correctionLine = new THREE.LineSegments(correctionGeometry, new THREE.LineBasicMaterial({ color: 0x6cff86, depthWrite: false }));
correctionLine.visible = false; scene.add(correctionLine);

function resize() {
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
function setView(view) {
  if (view === 'side') camera.position.set(5.7, 1.7, 0.2);
  else if (view === 'defender') camera.position.set(0, 2.05, 5.5);
  else if (view === 'contact') camera.position.set(2.2, 1.45, 2.25);
  else camera.position.set(4.7, 2.4, 4.9);
  camera.lookAt(0, 1.05, 0); camera.updateMatrixWorld(true);
}
function captureBladePolyline() {
  attackerSword.object3d.updateMatrixWorld(true);
  return [attackerSword.bladeBase, attackerSword.bladeMid, attackerSword.tip].map((node) => {
    const p = new THREE.Vector3(); node.getWorldPosition(p); return { x: p.x, y: p.y, z: p.z };
  });
}
function enterProductionGuard() {
  guardMachine.send(GUARD_EVENTS.RESET, { stage: GUARD_THREAT_TRACKING_STAGE });
  guardRuntime.sync(camera);
  guardMachine.send(GUARD_EVENTS.GUARD_PRESS, { stage: GUARD_THREAT_TRACKING_STAGE });
  guardRuntime.sync(camera);
  guardReport = guardRuntime.update(180, camera);
  if (guardReport.snapshot.state !== GUARD_STATES.HOLD) throw new Error(`Expected Guard Hold, got ${guardReport.snapshot.state}`);
}
function beginAttackRecovery(direction) {
  const sourcePose = captureRigPose(attacker.rig);
  attacker.sampleAnimation('UAL1/Sword_Idle', 0, { loop: true, inPlace: true, rootRotationPolicy: 'lock' });
  attacker.update(0, camera);
  const targetPose = captureRigPose(attacker.rig);
  applyRigPose(attacker.rig, sourcePose); attacker.update(0, camera);
  attackerRecovery = { direction, elapsedMs: 0, sourcePose, targetPose };
  attackerIdleClockSeconds = 0;
}
function sampleAttacker(snapshot, deltaMs) {
  if (snapshot.action) {
    const profile = snapshot.action.runtime;
    const t = Math.min(profile.durationSeconds, snapshot.elapsedSeconds);
    attacker.sampleAnimation(profile.clipId, t, { loop: false, inPlace: true, rootRotationPolicy: 'lock' });
    attacker.update(0, camera);
    if (snapshot.completed && !attackerRecovery) beginAttackRecovery(profile.direction);
    hudAttack.textContent = `Attack: ${profile.direction.toUpperCase()} · ${snapshot.phase} · ${t.toFixed(3)}s`;
    return;
  }
  if (attackerRecovery) {
    attackerRecovery.elapsedMs += deltaMs;
    const recovery = sampleLongswordAttackRecovery(attackerRecovery.direction, attackerRecovery.elapsedMs);
    applyRigPose(attacker.rig, blendRecoveryPose(
      attackerRecovery.sourcePose, attackerRecovery.sourcePose, attackerRecovery.targetPose, recovery.progress,
      { durationMs: recovery.profile.attackRecoveryDurationMs, sampleDeltaMs: 0, momentumScale: 0 },
    ));
    attacker.update(0, camera);
    if (recovery.complete) attackerRecovery = null;
    return;
  }
  attackerIdleClockSeconds += deltaMs / 1000;
  attacker.sampleAnimation('UAL1/Sword_Idle', attackerIdleClockSeconds % Math.max(0.001, attackerIdleDuration), { loop: true, inPlace: true, rootRotationPolicy: 'lock' });
  attacker.update(0, camera);
  hudAttack.textContent = `Attack: IDLE · selected ${selectedDirection.toUpperCase()}`;
}
function startAttack(direction = selectedDirection) {
  if (!ready || attackRuntime.active || attackerRecovery) return false;
  selectedDirection = direction; firstContact = null; latestContact = null; contactMarker.visible = false; repeatCooldownMs = 0;
  previousBlade = captureBladePolyline();
  const result = attackRuntime.start(direction);
  if (!result.accepted) return false;
  document.querySelectorAll('[data-attack]').forEach((b) => b.classList.toggle('active', b.dataset.attack === direction));
  return true;
}
function setTrackingMode(mode) {
  trackingMode = mode;
  document.querySelectorAll('[data-tracking]').forEach((b) => b.classList.toggle('active', b.dataset.tracking === mode));
}
function updateTrackingDebug(baselineSurface) {
  const visible = showTracking.checked && latestPlan?.threat;
  threatMarker.visible = visible; targetMarker.visible = visible; correctionLine.visible = visible;
  if (!visible) return;
  const p = latestPlan.threat.point, t = latestPlan.targetCenter;
  threatMarker.position.set(p.x, p.y, p.z); targetMarker.position.set(t.x, t.y, t.z);
  const values = correctionGeometry.attributes.position.array;
  values[0] = baselineSurface.center.x; values[1] = baselineSurface.center.y; values[2] = baselineSurface.center.z;
  values[3] = t.x; values[4] = t.y; values[5] = t.z;
  correctionGeometry.attributes.position.needsUpdate = true;
}
function updateContact(snapshot, currentBlade, deltaSeconds) {
  if (!previousBlade || !snapshot.action) { latestContact = null; return; }
  latestContact = probeSweptSwordBucklerContact({
    previousBlade, currentBlade, bucklerSurface: buckler.getWorldParrySurface(), deltaSeconds, active: snapshot.phase === 'active',
  });
  if (latestContact.contact && !firstContact) {
    firstContact = latestContact;
    contactMarker.position.set(latestContact.point.x, latestContact.point.y, latestContact.point.z);
    contactMarker.visible = true;
  }
  hudContact.textContent = latestContact.contact
    ? `Contact: ACTIVE · radial ${latestContact.radialDistance.toFixed(3)}m`
    : `Contact: ${latestContact.geometricContact ? 'touch outside ACTIVE' : 'none'}`;
}
function buildReport() {
  const report = {
    stage: GUARD_THREAT_TRACKING_STAGE,
    pass: guardReport?.snapshot?.state === GUARD_STATES.HOLD && Math.abs(ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423.rotation.y - Math.PI / 2) < 1e-9,
    authority: 'presentation/probe only; does not emit PARRY_CONFIRMED',
    selectedDirection, trackingMode, latestPlan, latestTracking, latestContact, firstContact,
    socketRule: 'HAND_L and accepted Buckler mount remain immutable; only upperarm.l/lowerarm.l are corrected after authored Guard sampling',
    next: 'Validate LEFT correction distance and contact visually before G4.3B recoil.',
  };
  reportNode.textContent = JSON.stringify(report, null, 2);
  document.documentElement.dataset.g43a1 = report.pass ? 'pass' : 'fail';
  window.__G43A1_RESULT__ = report;
  return report;
}

async function main() {
  status.textContent = 'Loading UAL attacks + Skyrim Guard + G4.3A contact…';
  const [ual1, ual2, skyrim] = await Promise.all([
    loadUal1AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    loadUal2AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: defender.rig, fps: 30 }),
  ]);
  attacker.registerAnimations(ual1); attacker.registerAnimations(ual2); defender.registerAnimations(skyrim);
  attackerIdleDuration = attacker.getAnimationDuration('UAL1/Sword_Idle') || 1;
  const idle = skyrim.clips.get('SKYRIM_GUARD/shd_blockidle');
  const bind = idle?.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error('G4.3A.1 requires Skyrim Guard weapon bind calibration');
  defenderSword = createDebugSword(THREE);
  mountDebugSword(defender, defenderSword, composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind));
  enterProductionGuard(); ready = true;
  const report = buildReport();
  status.textContent = report.pass ? 'G4.3A.1 PASS · threat tracking probe ready' : 'G4.3A.1 FAIL';
  status.className = report.pass ? 'good' : 'bad';
  startAttack('left');
}

document.querySelectorAll('[data-attack]').forEach((b) => b.addEventListener('click', () => startAttack(b.dataset.attack)));
document.querySelectorAll('[data-tracking]').forEach((b) => b.addEventListener('click', () => setTrackingMode(b.dataset.tracking)));
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
showSurface.addEventListener('change', () => buckler.setParrySurfaceVisible(showSurface.checked));
setView('three'); resize(); addEventListener('resize', resize);

function frame(timestamp) {
  const deltaMs = Math.min(50, Math.max(0, timestamp - lastTimestamp));
  const deltaSeconds = Math.max(1e-5, deltaMs / 1000); lastTimestamp = timestamp;
  if (ready) {
    const snapshot = attackRuntime.update(deltaMs);
    sampleAttacker(snapshot, deltaMs);
    guardReport = guardRuntime.update(deltaMs, camera);
    defender.update(0, camera);
    attackerSword.update(); defenderSword?.update();
    const currentBlade = captureBladePolyline();
    const baselineSurface = buckler.getWorldParrySurface();
    latestPlan = previousBlade && snapshot.action
      ? planGuardThreatCorrection({ mode: trackingMode, previousBlade, currentBlade, bucklerSurface: baselineSurface, deltaSeconds })
      : trackingMode === 'off'
        ? planGuardThreatCorrection({ mode: 'off', bucklerSurface: baselineSurface })
        : { mode: trackingMode, correction: { x: 0, y: 0, z: 0 }, threat: null, reachable: true, requiredDistance: 0, appliedDistance: 0, reason: 'return-to-authored-guard' };
    latestTracking = trackingRuntime.update(latestPlan, deltaSeconds);
    defender.update(0, camera); defenderSword?.update();
    updateTrackingDebug(baselineSurface);
    if (latestPlan?.threat) {
      hudThreat.textContent = `Threat: +${Math.round(latestPlan.threat.futureSeconds * 1000)}ms · radial ${latestPlan.threat.radialDistance.toFixed(3)}m · blade ${(latestPlan.threat.bladeFraction * 100).toFixed(0)}%`;
      hudTracking.textContent = `Tracking: ${trackingMode.toUpperCase()} · required ${(latestPlan.requiredDistance * 100).toFixed(1)}cm · cap ${(latestPlan.appliedDistance * 100).toFixed(1)}cm · ${latestPlan.reachable ? 'REACHABLE' : 'OUT_OF_REACH'} · achieved ${(latestTracking.achievedDistance * 100).toFixed(1)}cm`;
    } else {
      hudThreat.textContent = 'Threat: —';
      hudTracking.textContent = `Tracking: ${trackingMode.toUpperCase()} · returning to authored Guard`;
    }
    updateContact(snapshot, currentBlade, deltaSeconds);
    previousBlade = currentBlade;
    buildReport();
    if (!attackRuntime.active && !snapshot.action && !attackerRecovery && autoRepeat.checked) {
      repeatCooldownMs += deltaMs; if (repeatCooldownMs >= 700) startAttack(selectedDirection);
    }
  }
  renderer.render(scene, camera); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

main().catch((error) => {
  document.documentElement.dataset.g43a1 = 'fail'; status.textContent = `G4.3A.1 FAIL · ${error?.message || error}`; status.className = 'bad';
  reportNode.textContent = error?.stack || String(error); window.__G43A1_RESULT__ = { stage: GUARD_THREAT_TRACKING_STAGE, pass: false, error: String(error) };
});
window.__G43A1_LAB__ = { startAttack, setTrackingMode, trackingRuntime, get latestPlan() { return latestPlan; }, get firstContact() { return firstContact; } };
