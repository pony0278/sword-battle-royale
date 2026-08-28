import {
  PHYSICAL_SHIELD_SWORD_IMPULSE_STAGE,
  computeShieldContactPointVelocity,
  solveKinematicShieldSwordImpulse,
} from '../../src/combat/physical-shield-sword-impulse.js?v=g43b5r29-geometry';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer) throw new Error(`${PHYSICAL_SHIELD_SWORD_IMPULSE_STAGE} requires Three.js r128`);

const SHIELD_RADIUS = 0.42;
const SHIELD_THICKNESS = 0.065;
const SWORD_LENGTH = 1.05;
const SWORD_HALF = SWORD_LENGTH * 0.5;
const FIXED_DT = 1 / 240;
const CONTACT_CENTER_SECONDS = 0.12;
const BASE_SWEEP_DURATION_SECONDS = 0.21;
const LOCAL_SHIELD_FACE_NORMAL = new THREE.Vector3(0, -1, 0);

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090e16);
scene.fog = new THREE.Fog(0x090e16, 6, 13);
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
camera.position.set(3.45, 2.15, -4.25);
camera.lookAt(0, 1.08, -0.08);
scene.add(new THREE.HemisphereLight(0xddeaff, 0x202738, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 1.25); key.position.set(4, 7, -3); scene.add(key);
const rimLight = new THREE.DirectionalLight(0x7fe2cf, 0.6); rimLight.position.set(-4, 3, 2); scene.add(rimLight);
scene.add(new THREE.GridHelper(10, 20, 0x33445f, 0x202a3b));

const shield = new THREE.Mesh(
  new THREE.CylinderGeometry(SHIELD_RADIUS, SHIELD_RADIUS, SHIELD_THICKNESS, 48),
  new THREE.MeshStandardMaterial({ color: 0x39c6d8, metalness: 0.55, roughness: 0.34, transparent: true, opacity: 0.78 }),
);
scene.add(shield);
const shieldRim = new THREE.Mesh(
  new THREE.TorusGeometry(SHIELD_RADIUS, 0.018, 10, 48),
  new THREE.MeshBasicMaterial({ color: 0xb9fbff }),
);
shieldRim.rotation.x = Math.PI / 2;
shieldRim.position.y = -SHIELD_THICKNESS * 0.52;
shield.add(shieldRim);

const sword = new THREE.Group();
const blade = new THREE.Mesh(
  new THREE.BoxGeometry(0.055, 0.026, SWORD_LENGTH),
  new THREE.MeshStandardMaterial({ color: 0xe2e7ef, metalness: 0.78, roughness: 0.22 }),
);
sword.add(blade);
const crossguard = new THREE.Mesh(
  new THREE.BoxGeometry(0.26, 0.035, 0.04),
  new THREE.MeshStandardMaterial({ color: 0xb9a778, metalness: 0.62, roughness: 0.35 }),
);
crossguard.position.z = -SWORD_HALF + 0.02;
sword.add(crossguard);
const grip = new THREE.Mesh(
  new THREE.BoxGeometry(0.06, 0.055, 0.24),
  new THREE.MeshStandardMaterial({ color: 0x46362c, roughness: 0.72 }),
);
grip.position.z = -SWORD_HALF - 0.12;
sword.add(grip);
scene.add(sword);

const comMarker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), new THREE.MeshBasicMaterial({ color: 0x8cabff }));
const tipMarker = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
const contactMarker = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffa45f }));
contactMarker.visible = false;
scene.add(comMarker, tipMarker, contactMarker);
const velocityArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.6, 0x66e7f4, 0.11, 0.055);
const impulseArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.6, 0xffa45f, 0.11, 0.055);
velocityArrow.visible = false; impulseArrow.visible = false; scene.add(velocityArrow, impulseArrow);

const hudPhase = document.getElementById('hudPhase');
const hudShield = document.getElementById('hudShield');
const hudRelative = document.getElementById('hudRelative');
const hudImpulse = document.getElementById('hudImpulse');
const hudSword = document.getElementById('hudSword');
const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const shieldSpeedInput = document.getElementById('shieldSpeed');
const restitutionInput = document.getElementById('restitution');
const frictionInput = document.getElementById('friction');
const contactBiasInput = document.getElementById('contactBias');
const shieldSpeedValue = document.getElementById('shieldSpeedValue');
const restitutionValue = document.getElementById('restitutionValue');
const frictionValue = document.getElementById('frictionValue');
const contactBiasValue = document.getElementById('contactBiasValue');

let accumulator = 0;
let simTime = 0;
let lastTimestamp = performance.now();
let hit = false;
let lastImpulse = null;
let previousSignedDistance = Infinity;
let swordLinearVelocity = new THREE.Vector3();
let swordAngularVelocity = new THREE.Vector3();
let shieldLinearVelocity = new THREE.Vector3();
let shieldAngularVelocity = new THREE.Vector3();
const shieldPreviousPosition = new THREE.Vector3();
const shieldPreviousQuaternion = new THREE.Quaternion();
let shieldPoseInitialized = false;
const tipWorld = new THREE.Vector3();
let latestShieldContactSpeed = 0;
let maxTipToComSpeedRatio = 1;

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function smoothstep(t) { const u = clamp01(t); return u * u * (3 - 2 * u); }
function lerp(a, b, t) { return a + (b - a) * t; }
function deg(value) { return value * Math.PI / 180; }
function speedScale() { return Number(shieldSpeedInput.value) || 1; }
function restitution() { return Number(restitutionInput.value) || 0; }
function friction() { return Number(frictionInput.value) || 0; }
function contactBias() { return Number(contactBiasInput.value) || 0.78; }

function refreshControlLabels() {
  shieldSpeedValue.textContent = `${speedScale().toFixed(2)}×`;
  restitutionValue.textContent = restitution().toFixed(2);
  frictionValue.textContent = friction().toFixed(2);
  contactBiasValue.textContent = contactBias().toFixed(2);
}

function setShieldPose(timeSeconds) {
  const duration = BASE_SWEEP_DURATION_SECONDS / Math.max(0.35, speedScale());
  const start = CONTACT_CENTER_SECONDS - duration * 0.5;
  const p = smoothstep((timeSeconds - start) / duration);
  shield.position.set(
    lerp(-0.25, 0.30, p),
    1.12 + Math.sin(p * Math.PI) * 0.025,
    lerp(0.018, -0.012, p),
  );

  // CylinderGeometry faces are ±local Y. Map the attacker-facing -Y face to a deliberate parry normal.
  const parryAngle = deg(lerp(-7, 27, p));
  const desiredNormal = new THREE.Vector3(Math.sin(parryAngle), 0.035 * Math.sin(p * Math.PI), -Math.cos(parryAngle)).normalize();
  shield.quaternion.setFromUnitVectors(LOCAL_SHIELD_FACE_NORMAL, desiredNormal);
  shield.updateMatrixWorld(true);
}

function extractAngularVelocity(previousQuaternion, currentQuaternion, dt) {
  const delta = currentQuaternion.clone().multiply(previousQuaternion.clone().invert()).normalize();
  if (delta.w < 0) { delta.x *= -1; delta.y *= -1; delta.z *= -1; delta.w *= -1; }
  const w = Math.max(-1, Math.min(1, delta.w));
  const angle = 2 * Math.acos(w);
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  if (angle < 1e-7 || s < 1e-7) return new THREE.Vector3();
  return new THREE.Vector3(delta.x / s, delta.y / s, delta.z / s).multiplyScalar(angle / Math.max(dt, 1e-6));
}

function updateShieldKinematics(timeSeconds, dt) {
  if (!shieldPoseInitialized) {
    setShieldPose(timeSeconds - dt);
    shieldPreviousPosition.copy(shield.position);
    shieldPreviousQuaternion.copy(shield.quaternion);
    shieldPoseInitialized = true;
  }
  setShieldPose(timeSeconds);
  shieldLinearVelocity.copy(shield.position).sub(shieldPreviousPosition).multiplyScalar(1 / Math.max(dt, 1e-6));
  shieldAngularVelocity.copy(extractAngularVelocity(shieldPreviousQuaternion, shield.quaternion, dt));
  shieldPreviousPosition.copy(shield.position);
  shieldPreviousQuaternion.copy(shield.quaternion);
}

function updateSwordMarkers() {
  sword.updateMatrixWorld(true);
  tipWorld.set(0, 0, SWORD_HALF).applyQuaternion(sword.quaternion).add(sword.position);
  comMarker.position.copy(sword.position);
  tipMarker.position.copy(tipWorld);
}

function resetSimulation() {
  simTime = 0; accumulator = 0; hit = false; lastImpulse = null; previousSignedDistance = Infinity; shieldPoseInitialized = false;
  sword.position.set(0.10, 1.10, -1.08);
  sword.quaternion.identity();
  swordLinearVelocity.set(0, 0, 4.6);
  swordAngularVelocity.set(0, 0, 0);
  contactMarker.visible = false; velocityArrow.visible = false; impulseArrow.visible = false;
  latestShieldContactSpeed = 0; maxTipToComSpeedRatio = 1;
  setShieldPose(0); updateSwordMarkers();
  status.textContent = `${PHYSICAL_SHIELD_SWORD_IMPULSE_STAGE} READY · moving shield must own contact`;
  status.className = 'warn';
  updateHud();
}

function shieldSurfaceAtTip() {
  const normal = LOCAL_SHIELD_FACE_NORMAL.clone().applyQuaternion(shield.quaternion).normalize();
  const toTip = tipWorld.clone().sub(shield.position);
  const signedDistance = toTip.dot(normal);
  const planePoint = tipWorld.clone().addScaledVector(normal, -signedDistance);
  const radial = planePoint.clone().sub(shield.position);
  radial.addScaledVector(normal, -radial.dot(normal));
  return { normal, signedDistance, planePoint, radialDistance: radial.length() };
}

function applyPhysicalContact(surface) {
  const actualContact = surface.planePoint.clone();
  const effectiveContact = sword.position.clone().lerp(actualContact, contactBias());
  const shieldPointVelocity = computeShieldContactPointVelocity({
    center: shield.position,
    contactPoint: actualContact,
    linearVelocity: shieldLinearVelocity,
    angularVelocity: shieldAngularVelocity,
  });
  latestShieldContactSpeed = Math.hypot(shieldPointVelocity.x, shieldPointVelocity.y, shieldPointVelocity.z);

  const result = solveKinematicShieldSwordImpulse({
    swordMassKg: 1.35,
    swordLengthMeters: SWORD_LENGTH,
    restitution: restitution(),
    friction: friction(),
    swordCenter: sword.position,
    shieldCenter: shield.position,
    contactPoint: effectiveContact,
    contactNormal: surface.normal,
    swordLinearVelocity,
    swordAngularVelocity,
    shieldLinearVelocity,
    shieldAngularVelocity,
  });
  lastImpulse = result;
  if (!result.applied) return false;

  swordLinearVelocity.set(result.nextSwordLinearVelocity.x, result.nextSwordLinearVelocity.y, result.nextSwordLinearVelocity.z);
  swordAngularVelocity.set(result.nextSwordAngularVelocity.x, result.nextSwordAngularVelocity.y, result.nextSwordAngularVelocity.z);
  contactMarker.position.copy(actualContact); contactMarker.visible = true;

  const contactVelocity = new THREE.Vector3(shieldPointVelocity.x, shieldPointVelocity.y, shieldPointVelocity.z);
  if (contactVelocity.lengthSq() > 1e-8) {
    velocityArrow.position.copy(actualContact); velocityArrow.setDirection(contactVelocity.clone().normalize());
    velocityArrow.setLength(Math.min(1.2, 0.15 + contactVelocity.length() * 0.085), 0.11, 0.055); velocityArrow.visible = true;
  }
  const impulse = new THREE.Vector3(result.impulse.x, result.impulse.y, result.impulse.z);
  if (impulse.lengthSq() > 1e-8) {
    impulseArrow.position.copy(actualContact); impulseArrow.setDirection(impulse.clone().normalize());
    impulseArrow.setLength(Math.min(1.2, 0.16 + impulse.length() * 0.14), 0.11, 0.055); impulseArrow.visible = true;
  }

  hit = true;
  status.textContent = `${PHYSICAL_SHIELD_SWORD_IMPULSE_STAGE} CONTACT · sword now follows velocity, not a target pose`;
  status.className = 'good';
  buildReport();
  return true;
}

function integrateDynamicSword(dt) {
  sword.position.addScaledVector(swordLinearVelocity, dt);
  const angularSpeed = swordAngularVelocity.length();
  if (angularSpeed > 1e-6) {
    const axis = swordAngularVelocity.clone().multiplyScalar(1 / angularSpeed);
    sword.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angularSpeed * dt)).normalize();
  }
  swordLinearVelocity.multiplyScalar(Math.exp(-0.72 * dt));
  swordAngularVelocity.multiplyScalar(Math.exp(-1.05 * dt));
  updateSwordMarkers();

  const r = tipWorld.clone().sub(sword.position);
  const tipVelocity = swordLinearVelocity.clone().add(new THREE.Vector3().crossVectors(swordAngularVelocity, r));
  maxTipToComSpeedRatio = Math.max(maxTipToComSpeedRatio, tipVelocity.length() / Math.max(0.001, swordLinearVelocity.length()));
}

function fixedStep(dt) {
  simTime += dt;
  updateShieldKinematics(simTime, dt);
  if (!hit) {
    sword.position.addScaledVector(swordLinearVelocity, dt);
    updateSwordMarkers();
    const surface = shieldSurfaceAtTip();
    const threshold = SHIELD_THICKNESS * 0.62 + 0.018;
    const crossed = previousSignedDistance > threshold && surface.signedDistance <= threshold;
    const insideDisk = surface.radialDistance <= SHIELD_RADIUS * 0.96;
    previousSignedDistance = surface.signedDistance;
    if (crossed && insideDisk) applyPhysicalContact(surface);
  } else {
    integrateDynamicSword(dt);
  }
  if (simTime > 1.55) resetSimulation();
}

function updateHud() {
  hudPhase.textContent = `Phase: ${hit ? 'PHYSICAL REBOUND' : 'APPROACH / KINEMATIC SWEEP'} · t ${Math.round(simTime * 1000)}ms`;
  hudShield.textContent = `Shield contact speed: ${latestShieldContactSpeed ? `${latestShieldContactSpeed.toFixed(2)} m/s` : 'waiting'}`;
  hudRelative.textContent = `Closing speed: ${lastImpulse ? `${Math.abs(lastImpulse.normalRelativeSpeed).toFixed(2)} m/s` : '—'}`;
  hudImpulse.textContent = `Impulse: ${lastImpulse?.applied ? `${lastImpulse.normalImpulseNs.toFixed(2)} N·s normal + ${lastImpulse.frictionImpulseNs.toFixed(2)} N·s tangent` : '—'}`;
  hudSword.textContent = `Sword Δω: ${lastImpulse?.applied ? `${lastImpulse.angularSpeedGainRadPerSecond.toFixed(2)} rad/s` : '—'} · tip/COM speed max ${maxTipToComSpeedRatio.toFixed(2)}×`;
}

function buildReport() {
  const report = {
    stage: PHYSICAL_SHIELD_SWORD_IMPULSE_STAGE,
    pass: Boolean(lastImpulse?.applied && lastImpulse.angularSpeedGainRadPerSecond > 0),
    contactModel: 'kinematic-shield-dynamic-sword-analytical-impulse',
    geometry: { shieldFaceNormal: 'CylinderGeometry local -Y', contactCenteredSweep: true, fixedStepHz: 240 },
    shieldContactSpeedMps: latestShieldContactSpeed,
    normalRelativeSpeedMps: lastImpulse?.normalRelativeSpeed ?? null,
    normalImpulseNs: lastImpulse?.normalImpulseNs ?? null,
    frictionImpulseNs: lastImpulse?.frictionImpulseNs ?? null,
    swordDeltaLinearVelocity: lastImpulse?.deltaLinearVelocity ?? null,
    swordDeltaAngularVelocity: lastImpulse?.deltaAngularVelocity ?? null,
    swordAngularSpeedGainRadPerSecond: lastImpulse?.angularSpeedGainRadPerSecond ?? null,
    controls: { shieldSpeed: speedScale(), restitution: restitution(), friction: friction(), contactBias: contactBias() },
    invariants: { noIKTarget: true, noPositionFollowRatio: true, movingShieldAtContact: latestShieldContactSpeed > 0.5, physicalSwordVelocityAuthorityAfterContact: true, bodyIntegrationDeferred: true },
  };
  reportNode.textContent = JSON.stringify(report, null, 2);
  document.documentElement.dataset.g43b5r29 = report.pass ? 'pass' : 'pending';
  window.__G43B5R29_RESULT__ = report;
  return report;
}

function resize() {
  const width = Math.max(1, canvas.clientWidth); const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}

function setPreset(kind) {
  if (kind === 'strong') {
    shieldSpeedInput.value = '1.85'; restitutionInput.value = '0.44'; frictionInput.value = '0.82'; contactBiasInput.value = '0.86';
  } else {
    shieldSpeedInput.value = '0.80'; restitutionInput.value = '0.18'; frictionInput.value = '0.42'; contactBiasInput.value = '0.68';
  }
  refreshControlLabels(); resetSimulation();
}

document.getElementById('restart').addEventListener('click', resetSimulation);
document.getElementById('strong').addEventListener('click', () => setPreset('strong'));
document.getElementById('soft').addEventListener('click', () => setPreset('soft'));
for (const input of [shieldSpeedInput, restitutionInput, frictionInput, contactBiasInput]) {
  input.addEventListener('input', refreshControlLabels);
  input.addEventListener('change', resetSimulation);
}

function frame(timestamp) {
  const frameDt = Math.min(0.05, Math.max(0, (timestamp - lastTimestamp) / 1000));
  lastTimestamp = timestamp; accumulator += frameDt;
  let guard = 0;
  while (accumulator >= FIXED_DT && guard < 20) { fixedStep(FIXED_DT); accumulator -= FIXED_DT; guard += 1; }
  updateHud(); renderer.render(scene, camera); requestAnimationFrame(frame);
}

refreshControlLabels(); resize(); addEventListener('resize', resize); resetSimulation(); requestAnimationFrame(frame);
