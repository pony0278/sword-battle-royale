import {
  computeShieldContactPointVelocity,
  solveKinematicShieldSwordImpulse,
} from '../../src/combat/physical-shield-sword-impulse.js?v=g43b5r291';
import {
  SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE,
  probeSweptBladeShieldPhysicalContact,
} from '../../src/combat/swept-blade-shield-physical-contact.js?v=g43b5r291';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer) throw new Error(`${SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE} requires Three.js r128`);

const SHIELD_RADIUS = 0.42;
const SHIELD_THICKNESS = 0.065;
const RIM_BAND_METERS = 0.035;
const SWORD_LENGTH = 1.05;
const SWORD_HALF = SWORD_LENGTH * 0.5;
const FIXED_DT = 1 / 240;
const CONTACT_CENTER_SECONDS = 0.18;
const BASE_SWEEP_DURATION_SECONDS = 0.22;
const LOCAL_SHIELD_FACE_NORMAL = new THREE.Vector3(0, -1, 0);
const BLADE_LOCAL_POINTS = Object.freeze([
  Object.freeze({ x: 0, y: 0, z: -SWORD_HALF }),
  Object.freeze({ x: 0, y: 0, z: 0 }),
  Object.freeze({ x: 0, y: 0, z: SWORD_HALF }),
]);

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090e16);
scene.fog = new THREE.Fog(0x090e16, 7, 15);
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
camera.position.set(3.35, 2.18, -4.05);
camera.lookAt(0.06, 1.18, -0.02);
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

const comMarker = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), new THREE.MeshBasicMaterial({ color: 0x8cabff }));
const contactMarker = new THREE.Mesh(new THREE.SphereGeometry(0.052, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffa45f }));
contactMarker.visible = false;
scene.add(comMarker, contactMarker);
const shieldVelocityArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.6, 0x66e7f4, 0.11, 0.055);
const impulseArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.6, 0xff8b4f, 0.11, 0.055);
const normalArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.48, 0xffdf72, 0.10, 0.05);
shieldVelocityArrow.visible = false; impulseArrow.visible = false; normalArrow.visible = false;
scene.add(shieldVelocityArrow, impulseArrow, normalArrow);

const hudPhase = document.getElementById('hudPhase');
const hudTOI = document.getElementById('hudTOI');
const hudBlade = document.getElementById('hudBlade');
const hudFeature = document.getElementById('hudFeature');
const hudShield = document.getElementById('hudShield');
const hudImpulse = document.getElementById('hudImpulse');
const hudSword = document.getElementById('hudSword');
const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const shieldSpeedInput = document.getElementById('shieldSpeed');
const restitutionInput = document.getElementById('restitution');
const frictionInput = document.getElementById('friction');
const bladeHeightInput = document.getElementById('bladeHeight');
const lateralBiasInput = document.getElementById('lateralBias');
const shieldSpeedValue = document.getElementById('shieldSpeedValue');
const restitutionValue = document.getElementById('restitutionValue');
const frictionValue = document.getElementById('frictionValue');
const bladeHeightValue = document.getElementById('bladeHeightValue');
const lateralBiasValue = document.getElementById('lateralBiasValue');
const autoRepeat = document.getElementById('autoRepeat');

let accumulator = 0;
let simTime = 0;
let lastTimestamp = performance.now();
let hit = false;
let paused = false;
let impactSimTime = null;
let latestContact = null;
let latestImpulse = null;
let latestShieldContactSpeed = 0;
let maxTipToComSpeedRatio = 1;
const swordLinearVelocity = new THREE.Vector3();
const swordAngularVelocity = new THREE.Vector3();
const shieldLinearVelocity = new THREE.Vector3();
const shieldAngularVelocity = new THREE.Vector3();
const tipWorld = new THREE.Vector3();

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function smoothstep(t) { const u = clamp01(t); return u * u * (3 - 2 * u); }
function lerp(a, b, t) { return a + (b - a) * t; }
function deg(value) { return value * Math.PI / 180; }
function shieldSpeed() { return Number(shieldSpeedInput.value) || 1; }
function restitution() { return Number(restitutionInput.value) || 0; }
function friction() { return Number(frictionInput.value) || 0; }
function bladeHeight() { return Number(bladeHeightInput.value) || 0; }
function lateralBias() { return Number(lateralBiasInput.value) || 0; }

function refreshControlLabels() {
  shieldSpeedValue.textContent = `${shieldSpeed().toFixed(2)}×`;
  restitutionValue.textContent = restitution().toFixed(2);
  frictionValue.textContent = friction().toFixed(2);
  bladeHeightValue.textContent = `${bladeHeight().toFixed(2)}m`;
  lateralBiasValue.textContent = `${lateralBias().toFixed(2)}m`;
}

function setShieldPose(timeSeconds) {
  const duration = BASE_SWEEP_DURATION_SECONDS / Math.max(0.35, shieldSpeed());
  const start = CONTACT_CENTER_SECONDS - duration * 0.5;
  const p = smoothstep((timeSeconds - start) / duration);
  shield.position.set(
    lateralBias() + lerp(-0.16, 0.16, p),
    1.12 + Math.sin(p * Math.PI) * 0.012,
    lerp(0.022, -0.010, p),
  );
  const parryAngle = deg(lerp(-10, 30, p));
  const desiredNormal = new THREE.Vector3(
    Math.sin(parryAngle),
    0.025 * Math.sin(p * Math.PI),
    -Math.cos(parryAngle),
  ).normalize();
  shield.quaternion.setFromUnitVectors(LOCAL_SHIELD_FACE_NORMAL, desiredNormal);
  shield.updateMatrixWorld(true);
}

function captureShieldPose() {
  return {
    center: { x: shield.position.x, y: shield.position.y, z: shield.position.z },
    quaternion: { x: shield.quaternion.x, y: shield.quaternion.y, z: shield.quaternion.z, w: shield.quaternion.w },
  };
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

function bladePolylineFromPose(position, quaternion) {
  return BLADE_LOCAL_POINTS.map((point) => {
    const world = new THREE.Vector3(point.x, point.y, point.z).applyQuaternion(quaternion).add(position);
    return { x: world.x, y: world.y, z: world.z };
  });
}

function integrateQuaternion(quaternion, angularVelocity, dt) {
  const speed = angularVelocity.length();
  if (speed <= 1e-8 || dt <= 0) return quaternion.clone();
  const axis = angularVelocity.clone().multiplyScalar(1 / speed);
  return new THREE.Quaternion().setFromAxisAngle(axis, speed * dt).multiply(quaternion).normalize();
}

function updateSwordMarkers() {
  sword.updateMatrixWorld(true);
  comMarker.position.copy(sword.position);
  tipWorld.set(0, 0, SWORD_HALF).applyQuaternion(sword.quaternion).add(sword.position);
}

function resetSimulation() {
  simTime = 0;
  accumulator = 0;
  hit = false;
  paused = false;
  impactSimTime = null;
  latestContact = null;
  latestImpulse = null;
  latestShieldContactSpeed = 0;
  maxTipToComSpeedRatio = 1;
  sword.position.set(0, 1.12 + bladeHeight(), -0.80);
  sword.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  swordLinearVelocity.set(0, 0, 4.25);
  swordAngularVelocity.set(0, 0, 0);
  setShieldPose(0);
  contactMarker.visible = false;
  shieldVelocityArrow.visible = false;
  impulseArrow.visible = false;
  normalArrow.visible = false;
  updateSwordMarkers();
  status.textContent = `${SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE} READY · whole blade CCD armed`;
  status.className = 'warn';
  updateHud();
}

function integrateDynamicSword(dt) {
  if (dt <= 0) return;
  sword.position.addScaledVector(swordLinearVelocity, dt);
  sword.quaternion.copy(integrateQuaternion(sword.quaternion, swordAngularVelocity, dt));
  swordLinearVelocity.multiplyScalar(Math.exp(-0.72 * dt));
  swordAngularVelocity.multiplyScalar(Math.exp(-1.05 * dt));
  updateSwordMarkers();
  const r = tipWorld.clone().sub(sword.position);
  const tipVelocity = swordLinearVelocity.clone().add(new THREE.Vector3().crossVectors(swordAngularVelocity, r));
  maxTipToComSpeedRatio = Math.max(maxTipToComSpeedRatio, tipVelocity.length() / Math.max(0.001, swordLinearVelocity.length()));
}

function showContactVectors(contact, impulse, shieldPointVelocity) {
  const point = new THREE.Vector3(contact.point.x, contact.point.y, contact.point.z);
  contactMarker.position.copy(point); contactMarker.visible = true;

  const normal = new THREE.Vector3(contact.normal.x, contact.normal.y, contact.normal.z);
  normalArrow.position.copy(point);
  normalArrow.setDirection(normal.clone().normalize());
  normalArrow.setLength(0.48, 0.10, 0.05);
  normalArrow.visible = true;

  const shieldVelocity = new THREE.Vector3(shieldPointVelocity.x, shieldPointVelocity.y, shieldPointVelocity.z);
  if (shieldVelocity.lengthSq() > 1e-8) {
    shieldVelocityArrow.position.copy(point);
    shieldVelocityArrow.setDirection(shieldVelocity.clone().normalize());
    shieldVelocityArrow.setLength(Math.min(1.2, 0.15 + shieldVelocity.length() * 0.085), 0.11, 0.055);
    shieldVelocityArrow.visible = true;
  }

  const impulseVector = new THREE.Vector3(impulse.impulse.x, impulse.impulse.y, impulse.impulse.z);
  if (impulseVector.lengthSq() > 1e-8) {
    impulseArrow.position.copy(point);
    impulseArrow.setDirection(impulseVector.clone().normalize());
    impulseArrow.setLength(Math.min(1.2, 0.16 + impulseVector.length() * 0.14), 0.11, 0.055);
    impulseArrow.visible = true;
  }
}

function solveSweptContact(previousSwordPosition, previousSwordQuaternion, predictedSwordPosition, predictedSwordQuaternion, previousShieldPose, currentShieldPose, dt) {
  const previousBlade = bladePolylineFromPose(previousSwordPosition, previousSwordQuaternion);
  const currentBlade = bladePolylineFromPose(predictedSwordPosition, predictedSwordQuaternion);
  const contact = probeSweptBladeShieldPhysicalContact({
    previousBlade,
    currentBlade,
    previousShieldPose,
    currentShieldPose,
    shieldRadiusMeters: SHIELD_RADIUS,
    shieldThicknessMeters: SHIELD_THICKNESS,
    rimBandMeters: RIM_BAND_METERS,
    localFaceNormal: { x: 0, y: -1, z: 0 },
    deltaSeconds: dt,
    active: true,
  });
  if (!contact.contact) return false;

  const alpha = contact.sweepAlpha;
  sword.position.lerpVectors(previousSwordPosition, predictedSwordPosition, alpha);
  sword.quaternion.copy(previousSwordQuaternion).slerp(predictedSwordQuaternion, alpha).normalize();
  updateSwordMarkers();

  const impactCenter = contact.impactShieldPose.center;
  const shieldPointVelocity = computeShieldContactPointVelocity({
    center: impactCenter,
    contactPoint: contact.point,
    linearVelocity: shieldLinearVelocity,
    angularVelocity: shieldAngularVelocity,
  });
  latestShieldContactSpeed = Math.hypot(shieldPointVelocity.x, shieldPointVelocity.y, shieldPointVelocity.z);

  const impulse = solveKinematicShieldSwordImpulse({
    swordMassKg: 1.35,
    swordLengthMeters: SWORD_LENGTH,
    restitution: restitution(),
    friction: friction(),
    swordCenter: sword.position,
    shieldCenter: impactCenter,
    contactPoint: contact.point,
    contactNormal: contact.normal,
    swordLinearVelocity,
    swordAngularVelocity,
    shieldLinearVelocity,
    shieldAngularVelocity,
  });

  latestContact = contact;
  latestImpulse = impulse;
  if (!impulse.applied) {
    status.textContent = `${SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE} CCD CONTACT but impulse rejected: ${impulse.reason}`;
    status.className = 'bad';
    sword.position.copy(predictedSwordPosition);
    sword.quaternion.copy(predictedSwordQuaternion);
    return false;
  }

  swordLinearVelocity.set(impulse.nextSwordLinearVelocity.x, impulse.nextSwordLinearVelocity.y, impulse.nextSwordLinearVelocity.z);
  swordAngularVelocity.set(impulse.nextSwordAngularVelocity.x, impulse.nextSwordAngularVelocity.y, impulse.nextSwordAngularVelocity.z);
  hit = true;
  impactSimTime = simTime - dt + contact.timeOfImpactSeconds;
  showContactVectors(contact, impulse, shieldPointVelocity);
  status.textContent = `${SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE} CONTACT · earliest TOI owns impulse`;
  status.className = 'good';

  const remaining = dt * (1 - alpha);
  integrateDynamicSword(remaining);
  buildReport();
  return true;
}

function fixedStep(dt) {
  if (paused) return;

  const previousShieldPosition = shield.position.clone();
  const previousShieldQuaternion = shield.quaternion.clone();
  const previousShieldPose = captureShieldPose();
  const previousSwordPosition = sword.position.clone();
  const previousSwordQuaternion = sword.quaternion.clone();

  simTime += dt;
  setShieldPose(simTime);
  const currentShieldPose = captureShieldPose();
  shieldLinearVelocity.copy(shield.position).sub(previousShieldPosition).multiplyScalar(1 / Math.max(dt, 1e-6));
  shieldAngularVelocity.copy(extractAngularVelocity(previousShieldQuaternion, shield.quaternion, dt));

  if (!hit) {
    const predictedSwordPosition = previousSwordPosition.clone().addScaledVector(swordLinearVelocity, dt);
    const predictedSwordQuaternion = integrateQuaternion(previousSwordQuaternion, swordAngularVelocity, dt);
    const contacted = solveSweptContact(
      previousSwordPosition,
      previousSwordQuaternion,
      predictedSwordPosition,
      predictedSwordQuaternion,
      previousShieldPose,
      currentShieldPose,
      dt,
    );
    if (!contacted) {
      sword.position.copy(predictedSwordPosition);
      sword.quaternion.copy(predictedSwordQuaternion);
      updateSwordMarkers();
    }
  } else {
    integrateDynamicSword(dt);
  }

  if (hit && impactSimTime != null && simTime - impactSimTime > 0.52) {
    if (autoRepeat.checked) resetSimulation();
    else paused = true;
  } else if (!hit && simTime > 0.72) {
    if (autoRepeat.checked) resetSimulation();
    else {
      paused = true;
      status.textContent = `${SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE} NO CONTACT · adjust geometry`;
      status.className = 'bad';
    }
  }
}

function updateHud() {
  hudPhase.textContent = `Phase: ${hit ? 'PHYSICAL REBOUND' : paused ? 'PAUSED' : 'WHOLE-BLADE CCD'} · t ${Math.round(simTime * 1000)}ms`;
  hudTOI.textContent = latestContact
    ? `TOI: ${latestContact.sweepAlpha.toFixed(3)} frame · ${(latestContact.timeOfImpactSeconds * 1000).toFixed(2)}ms inside 4.17ms step`
    : 'TOI: —';
  hudBlade.textContent = latestContact
    ? `Blade fraction: ${latestContact.bladeFraction.toFixed(3)} · ${latestContact.mode}`
    : 'Blade fraction: —';
  hudFeature.textContent = latestContact
    ? `Contact feature: ${latestContact.contactFeature} · radial ${latestContact.radialDistance.toFixed(3)}m · rimWeight ${latestContact.rimWeight.toFixed(2)}`
    : 'Contact feature: —';
  hudShield.textContent = `Shield contact speed: ${latestShieldContactSpeed ? `${latestShieldContactSpeed.toFixed(2)} m/s` : 'waiting'}`;
  hudImpulse.textContent = latestImpulse?.applied
    ? `Impulse: ${latestImpulse.normalImpulseNs.toFixed(2)} N·s normal + ${latestImpulse.frictionImpulseNs.toFixed(2)} N·s tangent · closing ${Math.abs(latestImpulse.normalRelativeSpeed).toFixed(2)} m/s`
    : 'Impulse: —';
  hudSword.textContent = latestImpulse?.applied
    ? `Sword Δω: ${latestImpulse.angularSpeedGainRadPerSecond.toFixed(2)} rad/s · tip/COM speed max ${maxTipToComSpeedRatio.toFixed(2)}×`
    : 'Sword Δω: —';
}

function buildReport() {
  const report = {
    stage: SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE,
    pass: Boolean(latestContact?.contact && latestImpulse?.applied),
    ccd: latestContact ? {
      sweepAlpha: latestContact.sweepAlpha,
      timeOfImpactSeconds: latestContact.timeOfImpactSeconds,
      bladeFraction: latestContact.bladeFraction,
      contactFeature: latestContact.contactFeature,
      radialDistance: latestContact.radialDistance,
      rimWeight: latestContact.rimWeight,
      point: latestContact.point,
      normal: latestContact.normal,
      mode: latestContact.mode,
    } : null,
    impulse: latestImpulse ? {
      applied: latestImpulse.applied,
      normalRelativeSpeed: latestImpulse.normalRelativeSpeed,
      normalImpulseNs: latestImpulse.normalImpulseNs,
      frictionImpulseNs: latestImpulse.frictionImpulseNs,
      angularSpeedGainRadPerSecond: latestImpulse.angularSpeedGainRadPerSecond,
    } : null,
    shieldContactSpeedMps: latestShieldContactSpeed,
    maxTipToComSpeedRatio,
    invariants: {
      wholeBladeSweep: true,
      movingShieldRelativeFrame: true,
      earliestToiBeforeImpulse: true,
      actualCcdPointFeedsImpulse: true,
      actualCcdNormalFeedsImpulse: true,
      noTipOnlyTrigger: true,
      noContactBias: true,
      noIkAuthority: true,
      noPoseTargetAuthority: true,
      fixedStepHz: 240,
    },
  };
  reportNode.textContent = JSON.stringify(report, null, 2);
  document.documentElement.dataset.g43b5r291 = report.pass ? 'pass' : 'pending';
  window.__G43B5R291_RESULT__ = report;
  return report;
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setPreset(values) {
  if (values.shieldSpeed != null) shieldSpeedInput.value = values.shieldSpeed;
  if (values.restitution != null) restitutionInput.value = values.restitution;
  if (values.friction != null) frictionInput.value = values.friction;
  if (values.bladeHeight != null) bladeHeightInput.value = values.bladeHeight;
  if (values.lateralBias != null) lateralBiasInput.value = values.lateralBias;
  refreshControlLabels();
  resetSimulation();
}

document.getElementById('restart').addEventListener('click', resetSimulation);
document.getElementById('strong').addEventListener('click', () => setPreset({ shieldSpeed: 1.85, restitution: 0.46, friction: 0.72, bladeHeight: 0.02, lateralBias: 0.15 }));
document.getElementById('soft').addEventListener('click', () => setPreset({ shieldSpeed: 0.80, restitution: 0.18, friction: 0.40, bladeHeight: 0.02, lateralBias: 0.13 }));
document.getElementById('rim').addEventListener('click', () => setPreset({ shieldSpeed: 1.40, restitution: 0.36, friction: 0.65, bladeHeight: 0.395, lateralBias: 0.13 }));
for (const input of [shieldSpeedInput, restitutionInput, frictionInput, bladeHeightInput, lateralBiasInput]) {
  input.addEventListener('input', refreshControlLabels);
  input.addEventListener('change', resetSimulation);
}

refreshControlLabels();
resize();
addEventListener('resize', resize);
resetSimulation();

function frame(timestamp) {
  const frameSeconds = Math.min(0.05, Math.max(0, (timestamp - lastTimestamp) / 1000));
  lastTimestamp = timestamp;
  accumulator += frameSeconds;
  while (accumulator >= FIXED_DT) {
    fixedStep(FIXED_DT);
    accumulator -= FIXED_DT;
  }
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__G43B5R291_LAB__ = {
  resetSimulation,
  get latestContact() { return latestContact; },
  get latestImpulse() { return latestImpulse; },
  get fixedStepHz() { return 1 / FIXED_DT; },
};
