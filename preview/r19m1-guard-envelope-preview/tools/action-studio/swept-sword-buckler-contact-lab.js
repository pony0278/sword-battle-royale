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
import {
  GUARD_EVENTS,
  GUARD_STATES,
  createGuardStateMachine,
} from '../../src/combat/guard-state-machine.js';
import { createGuardPresentationRuntime } from '../../src/combat/guard-presentation-runtime.js';
import {
  LONGSWORD_DIRECTIONAL_ATTACK_DEFINITIONS,
  createLongswordDirectionalAttackRuntime,
} from '../../src/combat/longsword-directional-attack-runtime.js';
import {
  captureRigPose,
  applyRigPose,
  blendRecoveryPose,
} from '../../src/combat/guard-recovery-bridge.js';
import { sampleLongswordAttackRecovery } from '../../src/combat/longsword-contact-recovery-presentation.js';
import {
  SWEPT_SWORD_BUCKLER_CONTACT_STAGE,
  probeSweptSwordBucklerContact,
} from '../../src/combat/swept-sword-buckler-contact.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error('G4.3A requires Three.js + GLTFLoader');

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
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(4, 7, 3);
key.castShadow = true;
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
let defenderSword = null;
const buckler = createProceduralBuckler(THREE, {
  radius: ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423.radius,
  thickness: ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423.thickness,
  parryRadius: ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423.parryRadius,
  parryThickness: ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423.parryThickness,
  lineMode: true,
  solidVisible: false,
});
mountOffhandBuckler(defender, buckler, ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423);
buckler.setParrySurfaceVisible(true);

const attackRuntime = createLongswordDirectionalAttackRuntime();
const guardMachine = createGuardStateMachine();
const guardRuntime = createGuardPresentationRuntime(THREE, { machine: guardMachine, character: defender });

const hudAttack = document.getElementById('hudAttack');
const hudContact = document.getElementById('hudContact');
const hudMotion = document.getElementById('hudMotion');
const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const autoRepeat = document.getElementById('autoRepeat');
const showSweep = document.getElementById('showSweep');
const showSurface = document.getElementById('showSurface');

let ready = false;
let selectedDirection = 'top';
let lastTimestamp = performance.now();
let attackerIdleDuration = 1;
let attackerIdleClockSeconds = 0;
let attackerRecovery = null;
let repeatCooldownMs = 0;
let guardReport = null;
let previousBlade = null;
let latestProbe = null;
let firstGeometricContact = null;
let firstActiveContact = null;
let contactMarkerLocked = false;

function createDebugLine(name, color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
  const line = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  line.name = name;
  line.frustumCulled = false;
  scene.add(line);
  return line;
}

const previousBladeLine = createDebugLine('G43A_PREVIOUS_BLADE', 0xb46cff);
const currentBladeLine = createDebugLine('G43A_CURRENT_BLADE', 0x55eaff);
const sweepConnectorLine = createDebugLine('G43A_SWEEP_CONNECTORS', 0xffd36b);
const contactMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.065, 14, 10),
  new THREE.MeshBasicMaterial({ color: 0xff625f, transparent: true, opacity: 0.95, depthWrite: false }),
);
contactMarker.visible = false;
scene.add(contactMarker);

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setView(view) {
  if (view === 'side') camera.position.set(5.7, 1.7, 0.2);
  else if (view === 'attacker') camera.position.set(0, 2.05, -5.5);
  else if (view === 'defender') camera.position.set(0, 2.05, 5.5);
  else if (view === 'contact') camera.position.set(2.2, 1.55, 2.4);
  else camera.position.set(4.7, 2.4, 4.9);
  camera.lookAt(0, 1.05, 0);
  camera.updateMatrixWorld(true);
}

function enterProductionGuard() {
  guardMachine.send(GUARD_EVENTS.RESET, { stage: SWEPT_SWORD_BUCKLER_CONTACT_STAGE, reason: 'g43a-init' });
  guardRuntime.sync(camera);
  guardMachine.send(GUARD_EVENTS.GUARD_PRESS, { stage: SWEPT_SWORD_BUCKLER_CONTACT_STAGE });
  guardRuntime.sync(camera);
  guardReport = guardRuntime.update(180, camera);
  if (guardReport.snapshot.state !== GUARD_STATES.HOLD) {
    throw new Error(`G4.3A expected Guard Hold, received ${guardReport.snapshot.state}`);
  }
}

function captureBladePolyline() {
  attackerSword.object3d.updateMatrixWorld(true);
  const root = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const tip = new THREE.Vector3();
  attackerSword.bladeBase.getWorldPosition(root);
  attackerSword.bladeMid.getWorldPosition(mid);
  attackerSword.tip.getWorldPosition(tip);
  return [root, mid, tip].map((point) => ({ x: point.x, y: point.y, z: point.z }));
}

function writeLineSegments(line, segments) {
  const values = line.geometry.attributes.position.array;
  values.fill(0);
  let offset = 0;
  for (const [a, b] of segments.slice(0, 3)) {
    values[offset++] = a.x; values[offset++] = a.y; values[offset++] = a.z;
    values[offset++] = b.x; values[offset++] = b.y; values[offset++] = b.z;
  }
  line.geometry.attributes.position.needsUpdate = true;
}

function updateSweepDebug(previous, current) {
  const visible = showSweep.checked && Boolean(previous && current);
  previousBladeLine.visible = visible;
  currentBladeLine.visible = visible;
  sweepConnectorLine.visible = visible;
  if (!visible) return;
  writeLineSegments(previousBladeLine, [[previous[0], previous[1]], [previous[1], previous[2]]]);
  writeLineSegments(currentBladeLine, [[current[0], current[1]], [current[1], current[2]]]);
  writeLineSegments(sweepConnectorLine, [[previous[0], current[0]], [previous[1], current[1]], [previous[2], current[2]]]);
}

function beginAttackRecovery(direction) {
  const sourcePose = captureRigPose(attacker.rig);
  attacker.sampleAnimation('UAL1/Sword_Idle', 0, { loop: true, inPlace: true, rootRotationPolicy: 'lock' });
  attacker.update(0, camera);
  const targetPose = captureRigPose(attacker.rig);
  applyRigPose(attacker.rig, sourcePose);
  attacker.update(0, camera);
  attackerRecovery = { direction, elapsedMs: 0, sourcePose, targetPose };
  attackerIdleClockSeconds = 0;
}

function sampleAttacker(snapshot, deltaMs) {
  if (snapshot.action) {
    const profile = snapshot.action.runtime;
    const sourceTime = Math.min(profile.durationSeconds, snapshot.elapsedSeconds);
    attacker.sampleAnimation(profile.clipId, sourceTime, { loop: false, inPlace: true, rootRotationPolicy: 'lock' });
    attacker.update(0, camera);
    if (snapshot.completed && !attackerRecovery) beginAttackRecovery(profile.direction);
    hudAttack.textContent = `Attack: ${profile.direction.toUpperCase()} · ${snapshot.phase} · ${sourceTime.toFixed(3)} / ${profile.durationSeconds.toFixed(3)}s`;
    return;
  }
  if (attackerRecovery) {
    attackerRecovery.elapsedMs += deltaMs;
    const recovery = sampleLongswordAttackRecovery(attackerRecovery.direction, attackerRecovery.elapsedMs);
    const pose = blendRecoveryPose(
      attackerRecovery.sourcePose,
      attackerRecovery.sourcePose,
      attackerRecovery.targetPose,
      recovery.progress,
      { durationMs: recovery.profile.attackRecoveryDurationMs, sampleDeltaMs: 0, momentumScale: 0 },
    );
    applyRigPose(attacker.rig, pose);
    attacker.update(0, camera);
    if (recovery.complete) {
      attackerRecovery = null;
      attackerIdleClockSeconds = 0;
    }
    return;
  }
  attackerIdleClockSeconds += deltaMs / 1000;
  attacker.sampleAnimation('UAL1/Sword_Idle', attackerIdleClockSeconds % Math.max(0.001, attackerIdleDuration), {
    loop: true,
    inPlace: true,
    rootRotationPolicy: 'lock',
  });
  attacker.update(0, camera);
  hudAttack.textContent = `Attack: IDLE · selected ${selectedDirection.toUpperCase()}`;
}

function startAttack(direction = selectedDirection) {
  if (!ready || attackRuntime.active || attackerRecovery) return false;
  selectedDirection = direction;
  firstGeometricContact = null;
  firstActiveContact = null;
  latestProbe = null;
  contactMarkerLocked = false;
  contactMarker.visible = false;
  repeatCooldownMs = 0;
  previousBlade = captureBladePolyline();
  const result = attackRuntime.start(direction);
  if (!result.accepted) return false;
  document.querySelectorAll('[data-attack]').forEach((button) => button.classList.toggle('active', button.dataset.attack === direction));
  return true;
}

function updateProbe(snapshot, currentBlade, deltaSeconds) {
  if (!previousBlade || !snapshot.action) {
    latestProbe = null;
    return;
  }
  latestProbe = probeSweptSwordBucklerContact({
    previousBlade,
    currentBlade,
    bucklerSurface: buckler.getWorldParrySurface(),
    deltaSeconds,
    active: snapshot.phase === 'active',
  });

  if (latestProbe.geometricContact && !firstGeometricContact) firstGeometricContact = latestProbe;
  if (latestProbe.contact && !firstActiveContact) {
    firstActiveContact = latestProbe;
    contactMarker.position.set(latestProbe.point.x, latestProbe.point.y, latestProbe.point.z);
    contactMarker.visible = true;
    contactMarkerLocked = true;
  } else if (!contactMarkerLocked && latestProbe.geometricContact) {
    contactMarker.position.set(latestProbe.point.x, latestProbe.point.y, latestProbe.point.z);
    contactMarker.visible = true;
  }

  const activeLabel = latestProbe.contact ? 'ACTIVE CONTACT' : latestProbe.geometricContact ? 'touch outside ACTIVE' : 'no contact';
  hudContact.textContent = `Contact: ${activeLabel} · ${latestProbe.mode || '—'} · radial ${Number(latestProbe.radialDistance || 0).toFixed(3)}m · blade ${(Number(latestProbe.bladeFraction || 0) * 100).toFixed(0)}%`;
  if (latestProbe.incomingVelocity) {
    const v = latestProbe.incomingVelocity;
    hudMotion.textContent = `Velocity: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}) m/s · approachDot ${latestProbe.approachDot.toFixed(3)} · sweepα ${latestProbe.sweepAlpha.toFixed(3)}`;
  } else {
    hudMotion.textContent = 'Motion: —';
  }
}

function buildReport() {
  const directions = Object.fromEntries(Object.entries(LONGSWORD_DIRECTIONAL_ATTACK_DEFINITIONS).map(([direction, action]) => [direction, {
    clipId: action.clipId,
    contactSecondsLegacy: action.runtime.contactSeconds,
    durationSeconds: action.runtime.durationSeconds,
  }]));
  const mount = ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423;
  const surface = buckler.getWorldParrySurface();
  const gates = {
    stage: SWEPT_SWORD_BUCKLER_CONTACT_STAGE === 'G4.3A',
    directions: JSON.stringify(Object.keys(directions).sort()) === JSON.stringify(['left', 'right', 'top']),
    acceptedBucklerY90: Math.abs(mount.rotation.y - Math.PI / 2) < 1e-9,
    bucklerSurface: surface.shape === 'oriented-disc' && Math.abs(surface.radius - 0.26) < 1e-6,
    guardHold: guardReport?.snapshot?.state === GUARD_STATES.HOLD,
    attackerPolyline: Boolean(attackerSword.bladeBase && attackerSword.bladeMid && attackerSword.tip),
  };
  const failures = Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name);
  const report = {
    stage: SWEPT_SWORD_BUCKLER_CONTACT_STAGE,
    pass: failures.length === 0,
    authority: 'geometry probe only; does not emit PARRY_CONFIRMED',
    acceptedBucklerMount: mount,
    acceptedBucklerShape: ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423,
    directions,
    latestProbe,
    firstGeometricContact,
    firstActiveContact,
    gates,
    failures,
    next: 'G4.3B interrupts attack on confirmed Parry contact and computes directional recoil from incoming velocity + Buckler normal',
  };
  reportNode.textContent = JSON.stringify(report, null, 2);
  document.documentElement.dataset.g43a = report.pass ? 'pass' : 'fail';
  window.__G43A_RESULT__ = report;
  return report;
}

async function main() {
  status.textContent = 'Loading UAL attacks + Skyrim Guard + accepted Buckler mount…';
  const [ual1, ual2, skyrim] = await Promise.all([
    loadUal1AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    loadUal2AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: defender.rig, fps: 30 }),
  ]);
  attacker.registerAnimations(ual1);
  attacker.registerAnimations(ual2);
  defender.registerAnimations(skyrim);
  attackerIdleDuration = attacker.getAnimationDuration('UAL1/Sword_Idle') || 1;

  const idle = skyrim.clips.get('SKYRIM_GUARD/shd_blockidle');
  const bind = idle?.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error('G4.3A requires accepted Skyrim Guard weapon bind calibration');
  defenderSword = createDebugSword(THREE);
  mountDebugSword(defender, defenderSword, composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind));

  enterProductionGuard();
  ready = true;
  const report = buildReport();
  status.textContent = report.pass
    ? 'G4.3A PASS · swept blade probe ready · no combat authority emitted'
    : `G4.3A FAIL · ${report.failures.join(', ')}`;
  status.className = report.pass ? 'good' : 'bad';
  startAttack('top');
}

document.querySelectorAll('[data-attack]').forEach((button) => button.addEventListener('click', () => startAttack(button.dataset.attack)));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
showSurface.addEventListener('change', () => buckler.setParrySurfaceVisible(showSurface.checked));
showSweep.addEventListener('change', () => {
  if (!showSweep.checked) updateSweepDebug(null, null);
});

setView('three');
resize();
addEventListener('resize', resize);

function frame(timestamp) {
  const deltaMs = Math.min(50, Math.max(0, timestamp - lastTimestamp));
  const deltaSeconds = Math.max(1e-6, deltaMs / 1000);
  lastTimestamp = timestamp;
  if (ready) {
    const snapshot = attackRuntime.update(deltaMs);
    sampleAttacker(snapshot, deltaMs);
    guardReport = guardRuntime.update(deltaMs, camera);
    defender.update(0, camera);
    attackerSword.update();
    defenderSword?.update();

    const currentBlade = captureBladePolyline();
    updateSweepDebug(previousBlade, currentBlade);
    updateProbe(snapshot, currentBlade, deltaSeconds);
    previousBlade = currentBlade;

    buildReport();
    if (!attackRuntime.active && !snapshot.action && !attackerRecovery && autoRepeat.checked) {
      repeatCooldownMs += deltaMs;
      if (repeatCooldownMs >= 700) startAttack(selectedDirection);
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

main().catch((error) => {
  document.documentElement.dataset.g43a = 'fail';
  status.textContent = `G4.3A FAIL · ${error?.message || error}`;
  status.className = 'bad';
  reportNode.textContent = error?.stack || String(error);
  window.__G43A_RESULT__ = { stage: SWEPT_SWORD_BUCKLER_CONTACT_STAGE, pass: false, error: error?.stack || String(error) };
});

window.__G43A_LAB__ = {
  startAttack,
  attackRuntime,
  guardMachine,
  buckler,
  get latestProbe() { return latestProbe; },
  get firstActiveContact() { return firstActiveContact; },
};
