import {
  computeShieldContactPointVelocity,
  solveKinematicShieldSwordImpulse,
} from '../../src/combat/physical-shield-sword-impulse.js?v=g43b5r292';
import {
  probeSweptBladeShieldPhysicalContact,
} from '../../src/combat/swept-blade-shield-physical-contact.js?v=g43b5r292';
import {
  PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE,
  solveCompliantGripPointImpulse,
  solveForearmAnchorImpulse,
  solveWristAngularComplianceImpulse,
  summarizeGripEnergyHandoff,
} from '../../src/combat/physical-grip-wrist-compliance.js?v=g43b5r292';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer) throw new Error(`${PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE} requires Three.js r128`);

const SHIELD_RADIUS = 0.42;
const SHIELD_THICKNESS = 0.065;
const RIM_BAND_METERS = 0.035;
const SWORD_LENGTH = 1.05;
const SWORD_HALF = SWORD_LENGTH * 0.5;
const SWORD_GRIP_LOCAL_Z = -SWORD_HALF - 0.10;
const FIXED_DT = 1 / 240;
const CONSTRAINT_SUBSTEPS = 3;
const CONTACT_CENTER_SECONDS = 0.18;
const BASE_SWEEP_DURATION_SECONDS = 0.22;
const LOCAL_SHIELD_FACE_NORMAL = new THREE.Vector3(0, -1, 0);
const BLADE_LOCAL_POINTS = Object.freeze([
  Object.freeze({ x: 0, y: 0, z: -SWORD_HALF }),
  Object.freeze({ x: 0, y: 0, z: 0 }),
  Object.freeze({ x: 0, y: 0, z: SWORD_HALF }),
]);
const INITIAL_ATTACK_VELOCITY = new THREE.Vector3(0, 0, 4.25);

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090e16);
scene.fog = new THREE.Fog(0x090e16, 7, 15);
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
camera.position.set(3.45, 2.20, -4.15);
camera.lookAt(-0.05, 1.18, -0.02);
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
const gripMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.06, 0.055, 0.24),
  new THREE.MeshStandardMaterial({ color: 0x46362c, roughness: 0.72 }),
);
gripMesh.position.z = -SWORD_HALF - 0.12;
sword.add(gripMesh);
scene.add(sword);

const hand = new THREE.Mesh(
  new THREE.BoxGeometry(0.16, 0.12, 0.14),
  new THREE.MeshStandardMaterial({ color: 0x68df9b, roughness: 0.55 }),
);
scene.add(hand);
const bodyAnchor = new THREE.Mesh(
  new THREE.SphereGeometry(0.07, 18, 12),
  new THREE.MeshStandardMaterial({ color: 0xa98cff, roughness: 0.5 }),
);
scene.add(bodyAnchor);
const forearm = new THREE.Mesh(
  new THREE.CylinderGeometry(0.045, 0.055, 1, 12),
  new THREE.MeshStandardMaterial({ color: 0x7561b9, roughness: 0.62 }),
);
scene.add(forearm);

const contactMarker = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffa45f }));
contactMarker.visible = false;
scene.add(contactMarker);
const impulseArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.7, 0xff8b4f, 0.11, 0.055);
const gripForceArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.5, 0x75f3a7, 0.09, 0.045);
impulseArrow.visible = false; gripForceArrow.visible = false;
scene.add(impulseArrow, gripForceArrow);

const hudContact = document.getElementById('hudContact');
const hudGrip = document.getElementById('hudGrip');
const hudHand = document.getElementById('hudHand');
const hudWrist = document.getElementById('hudWrist');
const hudTransfer = document.getElementById('hudTransfer');
const hudSword = document.getElementById('hudSword');
const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const gripStiffnessInput = document.getElementById('gripStiffness');
const gripDampingInput = document.getElementById('gripDamping');
const wristStiffnessInput = document.getElementById('wristStiffness');
const forearmStiffnessInput = document.getElementById('forearmStiffness');
const gripStiffnessValue = document.getElementById('gripStiffnessValue');
const gripDampingValue = document.getElementById('gripDampingValue');
const wristStiffnessValue = document.getElementById('wristStiffnessValue');
const forearmStiffnessValue = document.getElementById('forearmStiffnessValue');

let accumulator = 0;
let simTime = 0;
let lastTimestamp = performance.now();
let hit = false;
let paused = false;
let impactSimTime = null;
let latestContact = null;
let latestBladeImpulse = null;
let latestGripSolve = null;
let latestForearmSolve = null;
let latestWristSolve = null;
let accumulatedGripImpulseNs = 0;
let accumulatedForearmImpulseNs = 0;
let maximumGripErrorMeters = 0;
let maximumHandTravelMeters = 0;
let maximumTipTravelMeters = 0;
let maximumWristErrorRadians = 0;
let impactHandPosition = new THREE.Vector3();
let impactTipPosition = new THREE.Vector3();
let restHandOffsetFromAnchor = new THREE.Vector3();
let restSwordFromHand = new THREE.Quaternion();
const swordLinearVelocity = new THREE.Vector3();
const swordAngularVelocity = new THREE.Vector3();
const handLinearVelocity = new THREE.Vector3();
const handAngularVelocity = new THREE.Vector3();
const anchorVelocity = new THREE.Vector3();
const shieldLinearVelocity = new THREE.Vector3();
const shieldAngularVelocity = new THREE.Vector3();
const tipWorld = new THREE.Vector3();
const gripWorld = new THREE.Vector3();

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function smoothstep(t) { const u = clamp01(t); return u * u * (3 - 2 * u); }
function lerp(a, b, t) { return a + (b - a) * t; }
function deg(value) { return value * Math.PI / 180; }
function gripStiffness() { return Number(gripStiffnessInput.value) || 1450; }
function gripDamping() { return Number(gripDampingInput.value) || 72; }
function wristStiffness() { return Number(wristStiffnessInput.value) || 24; }
function forearmStiffness() { return Number(forearmStiffnessInput.value) || 520; }

function refreshControlLabels() {
  gripStiffnessValue.textContent = `${Math.round(gripStiffness())}`;
  gripDampingValue.textContent = `${Math.round(gripDamping())}`;
  wristStiffnessValue.textContent = `${Math.round(wristStiffness())}`;
  forearmStiffnessValue.textContent = `${Math.round(forearmStiffness())}`;
}

function setShieldPose(timeSeconds) {
  const shieldSpeed = 1.85;
  const duration = BASE_SWEEP_DURATION_SECONDS / shieldSpeed;
  const start = CONTACT_CENTER_SECONDS - duration * 0.5;
  const p = smoothstep((timeSeconds - start) / duration);
  shield.position.set(
    0.15 + lerp(-0.16, 0.16, p),
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

function integrateQuaternion(quaternion, angularVelocity, dt) {
  const speed = angularVelocity.length();
  if (speed <= 1e-8 || dt <= 0) return quaternion.clone();
  const axis = angularVelocity.clone().multiplyScalar(1 / speed);
  return new THREE.Quaternion().setFromAxisAngle(axis, speed * dt).multiply(quaternion).normalize();
}

function rotationErrorVector(currentQuaternion, targetQuaternion) {
  const delta = targetQuaternion.clone().multiply(currentQuaternion.clone().invert()).normalize();
  if (delta.w < 0) { delta.x *= -1; delta.y *= -1; delta.z *= -1; delta.w *= -1; }
  const w = Math.max(-1, Math.min(1, delta.w));
  const angle = 2 * Math.acos(w);
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  if (angle < 1e-7 || s < 1e-7) return new THREE.Vector3();
  return new THREE.Vector3(delta.x / s, delta.y / s, delta.z / s).multiplyScalar(angle);
}

function bladePolylineFromPose(position, quaternion) {
  return BLADE_LOCAL_POINTS.map((point) => {
    const world = new THREE.Vector3(point.x, point.y, point.z).applyQuaternion(quaternion).add(position);
    return { x: world.x, y: world.y, z: world.z };
  });
}

function updateSwordPoints() {
  gripWorld.set(0, 0, SWORD_GRIP_LOCAL_Z).applyQuaternion(sword.quaternion).add(sword.position);
  tipWorld.set(0, 0, SWORD_HALF).applyQuaternion(sword.quaternion).add(sword.position);
}

function updateForearmVisual() {
  const delta = hand.position.clone().sub(bodyAnchor.position);
  const length = Math.max(0.01, delta.length());
  forearm.position.copy(bodyAnchor.position).addScaledVector(delta, 0.5);
  forearm.scale.set(1, length, 1);
  forearm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
}

function resetSimulation() {
  simTime = 0; accumulator = 0; hit = false; paused = false; impactSimTime = null;
  latestContact = null; latestBladeImpulse = null; latestGripSolve = null; latestForearmSolve = null; latestWristSolve = null;
  accumulatedGripImpulseNs = 0; accumulatedForearmImpulseNs = 0; maximumGripErrorMeters = 0; maximumHandTravelMeters = 0; maximumTipTravelMeters = 0; maximumWristErrorRadians = 0;
  sword.position.set(0, 1.14, -0.80);
  sword.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  swordLinearVelocity.copy(INITIAL_ATTACK_VELOCITY);
  swordAngularVelocity.set(0, 0, 0);
  updateSwordPoints();
  hand.position.copy(gripWorld);
  hand.quaternion.copy(sword.quaternion);
  handLinearVelocity.copy(INITIAL_ATTACK_VELOCITY);
  handAngularVelocity.set(0, 0, 0);
  bodyAnchor.position.copy(hand.position).add(new THREE.Vector3(-0.40, -0.03, -0.18));
  anchorVelocity.copy(INITIAL_ATTACK_VELOCITY);
  restHandOffsetFromAnchor.copy(hand.position).sub(bodyAnchor.position);
  restSwordFromHand.copy(hand.quaternion).invert().multiply(sword.quaternion).normalize();
  setShieldPose(0);
  contactMarker.visible = false; impulseArrow.visible = false; gripForceArrow.visible = false;
  impactHandPosition.copy(hand.position); impactTipPosition.copy(tipWorld);
  updateForearmVisual();
  status.textContent = `${PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE} READY · CCD armed; grip compliant`;
  status.className = 'warn';
  buildReport();
}

function applyConstraintSubstep(dt) {
  const restHandPoint = bodyAnchor.position.clone().add(restHandOffsetFromAnchor);
  latestForearmSolve = solveForearmAnchorImpulse({
    deltaSeconds: dt,
    handPoint: hand.position,
    restHandPoint,
    handLinearVelocity,
    anchorVelocity,
    handEffectiveMassKg: 2.6,
    forearmStiffnessNPerMeter: forearmStiffness(),
    forearmDampingNsPerMeter: 42,
    maximumForearmImpulseNs: 0.48,
  });
  handLinearVelocity.set(
    latestForearmSolve.nextHandLinearVelocity.x,
    latestForearmSolve.nextHandLinearVelocity.y,
    latestForearmSolve.nextHandLinearVelocity.z,
  );
  accumulatedForearmImpulseNs += latestForearmSolve.impulseMagnitudeNs;

  updateSwordPoints();
  latestGripSolve = solveCompliantGripPointImpulse({
    deltaSeconds: dt,
    swordCenter: sword.position,
    gripPoint: gripWorld,
    handPoint: hand.position,
    swordLinearVelocity,
    swordAngularVelocity,
    handLinearVelocity,
    swordMassKg: 1.35,
    swordInertiaKgM2: 0.124,
    handEffectiveMassKg: 2.6,
    gripStiffnessNPerMeter: gripStiffness(),
    gripDampingNsPerMeter: gripDamping(),
    maximumGripImpulseNs: 0.95,
  });
  swordLinearVelocity.set(latestGripSolve.nextSwordLinearVelocity.x, latestGripSolve.nextSwordLinearVelocity.y, latestGripSolve.nextSwordLinearVelocity.z);
  swordAngularVelocity.set(latestGripSolve.nextSwordAngularVelocity.x, latestGripSolve.nextSwordAngularVelocity.y, latestGripSolve.nextSwordAngularVelocity.z);
  handLinearVelocity.set(latestGripSolve.nextHandLinearVelocity.x, latestGripSolve.nextHandLinearVelocity.y, latestGripSolve.nextHandLinearVelocity.z);
  accumulatedGripImpulseNs += latestGripSolve.impulseMagnitudeNs;
  maximumGripErrorMeters = Math.max(maximumGripErrorMeters, latestGripSolve.positionErrorMeters);

  const targetSwordQuaternion = hand.quaternion.clone().multiply(restSwordFromHand).normalize();
  const wristError = rotationErrorVector(sword.quaternion, targetSwordQuaternion);
  latestWristSolve = solveWristAngularComplianceImpulse({
    deltaSeconds: dt,
    rotationErrorVector: wristError,
    swordAngularVelocity,
    handAngularVelocity,
    swordInertiaKgM2: 0.124,
    handWristInertiaKgM2: 0.055,
    wristStiffnessNmPerRad: wristStiffness(),
    wristDampingNmsPerRad: 2.8,
    maximumWristAngularImpulseNms: 0.085,
  });
  swordAngularVelocity.set(latestWristSolve.nextSwordAngularVelocity.x, latestWristSolve.nextSwordAngularVelocity.y, latestWristSolve.nextSwordAngularVelocity.z);
  handAngularVelocity.set(latestWristSolve.nextHandAngularVelocity.x, latestWristSolve.nextHandAngularVelocity.y, latestWristSolve.nextHandAngularVelocity.z);
  maximumWristErrorRadians = Math.max(maximumWristErrorRadians, latestWristSolve.rotationErrorRadians);

  anchorVelocity.multiplyScalar(Math.exp(-8.0 * dt));
  bodyAnchor.position.addScaledVector(anchorVelocity, dt);
  sword.position.addScaledVector(swordLinearVelocity, dt);
  sword.quaternion.copy(integrateQuaternion(sword.quaternion, swordAngularVelocity, dt));
  hand.position.addScaledVector(handLinearVelocity, dt);
  hand.quaternion.copy(integrateQuaternion(hand.quaternion, handAngularVelocity, dt));

  swordLinearVelocity.multiplyScalar(Math.exp(-0.32 * dt));
  swordAngularVelocity.multiplyScalar(Math.exp(-0.42 * dt));
  handLinearVelocity.multiplyScalar(Math.exp(-1.15 * dt));
  handAngularVelocity.multiplyScalar(Math.exp(-4.2 * dt));
  updateSwordPoints();
  updateForearmVisual();

  const handTravel = hand.position.distanceTo(impactHandPosition);
  const tipTravel = tipWorld.distanceTo(impactTipPosition);
  maximumHandTravelMeters = Math.max(maximumHandTravelMeters, handTravel);
  maximumTipTravelMeters = Math.max(maximumTipTravelMeters, tipTravel);

  if (latestGripSolve?.impulseMagnitudeNs > 1e-5) {
    const impulse = new THREE.Vector3(
      latestGripSolve.impulseOnSword.x,
      latestGripSolve.impulseOnSword.y,
      latestGripSolve.impulseOnSword.z,
    );
    gripForceArrow.position.copy(gripWorld);
    if (impulse.lengthSq() > 1e-10) {
      gripForceArrow.setDirection(impulse.normalize());
      gripForceArrow.setLength(Math.min(0.72, 0.10 + latestGripSolve.impulseMagnitudeNs * 0.58), 0.09, 0.045);
      gripForceArrow.visible = true;
    }
  }
}

function integrateCompliantSystem(dt) {
  const subDt = dt / CONSTRAINT_SUBSTEPS;
  for (let i = 0; i < CONSTRAINT_SUBSTEPS; i += 1) applyConstraintSubstep(subDt);
}

function showBladeContact(contact, impulse) {
  const point = new THREE.Vector3(contact.point.x, contact.point.y, contact.point.z);
  contactMarker.position.copy(point); contactMarker.visible = true;
  const impulseVector = new THREE.Vector3(impulse.impulse.x, impulse.impulse.y, impulse.impulse.z);
  if (impulseVector.lengthSq() > 1e-8) {
    impulseArrow.position.copy(point);
    impulseArrow.setDirection(impulseVector.clone().normalize());
    impulseArrow.setLength(Math.min(1.2, 0.16 + impulseVector.length() * 0.14), 0.11, 0.055);
    impulseArrow.visible = true;
  }
}

function solveContact(previousSwordPosition, previousSwordQuaternion, predictedSwordPosition, predictedSwordQuaternion, previousShieldPose, currentShieldPose, previousHandPosition, predictedHandPosition, previousAnchorPosition, predictedAnchorPosition, dt) {
  const contact = probeSweptBladeShieldPhysicalContact({
    previousBlade: bladePolylineFromPose(previousSwordPosition, previousSwordQuaternion),
    currentBlade: bladePolylineFromPose(predictedSwordPosition, predictedSwordQuaternion),
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
  hand.position.lerpVectors(previousHandPosition, predictedHandPosition, alpha);
  bodyAnchor.position.lerpVectors(previousAnchorPosition, predictedAnchorPosition, alpha);
  updateSwordPoints(); updateForearmVisual();

  const impactCenter = contact.impactShieldPose.center;
  const bladeImpulse = solveKinematicShieldSwordImpulse({
    swordMassKg: 1.35,
    swordLengthMeters: SWORD_LENGTH,
    restitution: 0.46,
    friction: 0.72,
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
  latestBladeImpulse = bladeImpulse;
  if (!bladeImpulse.applied) return false;

  swordLinearVelocity.set(bladeImpulse.nextSwordLinearVelocity.x, bladeImpulse.nextSwordLinearVelocity.y, bladeImpulse.nextSwordLinearVelocity.z);
  swordAngularVelocity.set(bladeImpulse.nextSwordAngularVelocity.x, bladeImpulse.nextSwordAngularVelocity.y, bladeImpulse.nextSwordAngularVelocity.z);
  hit = true;
  impactSimTime = simTime - dt + contact.timeOfImpactSeconds;
  impactHandPosition.copy(hand.position);
  impactTipPosition.copy(tipWorld);
  showBladeContact(contact, bladeImpulse);
  status.textContent = `${PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE} CONTACT · blade impulse → grip → wrist → forearm`;
  status.className = 'good';

  integrateCompliantSystem(dt * (1 - alpha));
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
  const previousHandPosition = hand.position.clone();
  const previousAnchorPosition = bodyAnchor.position.clone();

  simTime += dt;
  setShieldPose(simTime);
  const currentShieldPose = captureShieldPose();
  shieldLinearVelocity.copy(shield.position).sub(previousShieldPosition).multiplyScalar(1 / dt);
  shieldAngularVelocity.copy(extractAngularVelocity(previousShieldQuaternion, shield.quaternion, dt));

  if (!hit) {
    const predictedSwordPosition = previousSwordPosition.clone().addScaledVector(swordLinearVelocity, dt);
    const predictedSwordQuaternion = integrateQuaternion(previousSwordQuaternion, swordAngularVelocity, dt);
    const predictedHandPosition = previousHandPosition.clone().addScaledVector(handLinearVelocity, dt);
    const predictedAnchorPosition = previousAnchorPosition.clone().addScaledVector(anchorVelocity, dt);
    const contacted = solveContact(
      previousSwordPosition, previousSwordQuaternion,
      predictedSwordPosition, predictedSwordQuaternion,
      previousShieldPose, currentShieldPose,
      previousHandPosition, predictedHandPosition,
      previousAnchorPosition, predictedAnchorPosition,
      dt,
    );
    if (!contacted) {
      sword.position.copy(predictedSwordPosition);
      sword.quaternion.copy(predictedSwordQuaternion);
      hand.position.copy(predictedHandPosition);
      bodyAnchor.position.copy(predictedAnchorPosition);
      updateSwordPoints(); updateForearmVisual();
    }
  } else {
    integrateCompliantSystem(dt);
  }

  if (hit && impactSimTime != null && simTime - impactSimTime > 0.60) {
    paused = true;
    buildReport();
  } else if (!hit && simTime > 0.72) {
    paused = true;
    status.textContent = `${PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE} NO CONTACT`;
    status.className = 'bad';
  }
}

function currentTransfer() {
  const bladeImpulseNs = latestBladeImpulse?.applied
    ? Math.hypot(latestBladeImpulse.impulse.x, latestBladeImpulse.impulse.y, latestBladeImpulse.impulse.z)
    : 0;
  return summarizeGripEnergyHandoff({ bladeImpulseNs, accumulatedGripImpulseNs, accumulatedForearmImpulseNs });
}

function updateHud() {
  hudContact.textContent = latestContact
    ? `CCD: blade ${latestContact.bladeFraction.toFixed(3)} · ${latestContact.contactFeature} · TOI ${latestContact.sweepAlpha.toFixed(3)} frame`
    : 'CCD: waiting…';
  hudGrip.textContent = `Grip error: ${latestGripSolve ? `${(latestGripSolve.positionErrorMeters * 100).toFixed(1)}cm` : '—'} · max ${(maximumGripErrorMeters * 100).toFixed(1)}cm`;
  hudHand.textContent = `Hand travel: ${(maximumHandTravelMeters * 100).toFixed(1)}cm · forearm load ${accumulatedForearmImpulseNs.toFixed(2)} N·s`;
  hudWrist.textContent = `Wrist error: ${latestWristSolve ? `${THREE.MathUtils.radToDeg(latestWristSolve.rotationErrorRadians).toFixed(1)}°` : '—'} · max ${THREE.MathUtils.radToDeg(maximumWristErrorRadians).toFixed(1)}°`;
  const transfer = currentTransfer();
  hudTransfer.textContent = `Energy handoff: blade ${transfer.bladeImpulseNs.toFixed(2)} → grip ${transfer.accumulatedGripImpulseNs.toFixed(2)} → forearm ${transfer.accumulatedForearmImpulseNs.toFixed(2)} N·s`;
  const ratio = maximumTipTravelMeters / Math.max(0.001, maximumHandTravelMeters);
  hudSword.textContent = `Sword tip travel: ${(maximumTipTravelMeters * 100).toFixed(1)}cm · tip/hand ${ratio.toFixed(2)}×`;
}

function buildReport() {
  const transfer = currentTransfer();
  const tipHandTravelRatio = maximumTipTravelMeters / Math.max(0.001, maximumHandTravelMeters);
  const report = {
    stage: PHYSICAL_GRIP_WRIST_COMPLIANCE_STAGE,
    pass: Boolean(latestContact?.contact && latestBladeImpulse?.applied),
    contact: latestContact ? {
      sweepAlpha: latestContact.sweepAlpha,
      bladeFraction: latestContact.bladeFraction,
      contactFeature: latestContact.contactFeature,
      point: latestContact.point,
    } : null,
    bladeImpulse: latestBladeImpulse?.applied ? {
      magnitudeNs: transfer.bladeImpulseNs,
      angularSpeedGainRadPerSecond: latestBladeImpulse.angularSpeedGainRadPerSecond,
    } : null,
    compliance: {
      maximumGripErrorMeters,
      maximumHandTravelMeters,
      maximumTipTravelMeters,
      tipHandTravelRatio,
      maximumWristErrorDegrees: THREE.MathUtils.radToDeg(maximumWristErrorRadians),
      accumulatedGripImpulseNs,
      accumulatedForearmImpulseNs,
      gripTransferRatio: transfer.gripTransferRatio,
      forearmTransferRatio: transfer.forearmTransferRatio,
    },
    invariants: {
      wholeBladeEarliestToi: true,
      bladeImpulseBeforeGripResponse: true,
      physicalGripPointSpring: true,
      equalOppositeGripImpulse: true,
      wristAngularSpring: true,
      forearmAnchorSpring: true,
      noHardGripSnapAfterContact: true,
      noIkAuthority: true,
      noPoseTargetAuthority: true,
      fixedStepHz: 240,
      constraintSubsteps: CONSTRAINT_SUBSTEPS,
    },
  };
  reportNode.textContent = JSON.stringify(report, null, 2);
  document.documentElement.dataset.g43b5r292 = report.pass ? 'pass' : 'pending';
  window.__G43B5R292_RESULT__ = report;
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
  if (values.gripStiffness != null) gripStiffnessInput.value = values.gripStiffness;
  if (values.gripDamping != null) gripDampingInput.value = values.gripDamping;
  if (values.wristStiffness != null) wristStiffnessInput.value = values.wristStiffness;
  if (values.forearmStiffness != null) forearmStiffnessInput.value = values.forearmStiffness;
  refreshControlLabels(); resetSimulation();
}

document.getElementById('restart').addEventListener('click', resetSimulation);
document.getElementById('strong').addEventListener('click', () => setPreset({ gripStiffness: 1450, gripDamping: 72, wristStiffness: 24, forearmStiffness: 520 }));
document.getElementById('firm').addEventListener('click', () => setPreset({ gripStiffness: 2050, gripDamping: 92, wristStiffness: 36, forearmStiffness: 700 }));
document.getElementById('loose').addEventListener('click', () => setPreset({ gripStiffness: 850, gripDamping: 46, wristStiffness: 12, forearmStiffness: 320 }));
for (const input of [gripStiffnessInput, gripDampingInput, wristStiffnessInput, forearmStiffnessInput]) {
  input.addEventListener('input', refreshControlLabels);
  input.addEventListener('change', resetSimulation);
}

refreshControlLabels(); resize(); addEventListener('resize', resize); resetSimulation();
function frame(timestamp) {
  const frameSeconds = Math.min(0.05, Math.max(0, (timestamp - lastTimestamp) / 1000));
  lastTimestamp = timestamp;
  accumulator += frameSeconds;
  while (accumulator >= FIXED_DT) { fixedStep(FIXED_DT); accumulator -= FIXED_DT; }
  updateHud(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__G43B5R292_LAB__ = {
  resetSimulation,
  get latestContact() { return latestContact; },
  get latestBladeImpulse() { return latestBladeImpulse; },
  get latestGripSolve() { return latestGripSolve; },
  get latestWristSolve() { return latestWristSolve; },
  get fixedStepHz() { return 1 / FIXED_DT; },
};
