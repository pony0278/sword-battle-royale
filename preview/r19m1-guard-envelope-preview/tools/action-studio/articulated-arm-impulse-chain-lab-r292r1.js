import {
  computeShieldContactPointVelocity,
} from '../../src/combat/physical-shield-sword-impulse.js?v=g43b5r292r1';
import {
  probeSweptBladeShieldPhysicalContact,
} from '../../src/combat/swept-blade-shield-physical-contact.js?v=g43b5r292r1';
import {
  ARTICULATED_ARM_IMPULSE_CHAIN_STAGE,
  buildBladePolylineFromArticulatedArm,
  forwardArticulatedSwordArm,
  solveArticulatedArmContactImpulse,
  stepArticulatedArmState,
} from '../../src/combat/articulated-arm-impulse-chain.js?v=g43b5r292r1';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer) throw new Error(`${ARTICULATED_ARM_IMPULSE_CHAIN_STAGE} requires Three.js r128`);

const FIXED_DT = 1 / 240;
const SHIELD_RADIUS = 0.42;
const SHIELD_THICKNESS = 0.065;
const RIM_BAND_METERS = 0.035;
const CONTACT_CENTER_SECONDS = 0.15;
const BASE_SWEEP_DURATION_SECONDS = 0.20;
const LOCAL_SHIELD_FACE_NORMAL = new THREE.Vector3(0, -1, 0);
const SHOULDER_ORIGIN = Object.freeze({ x: -0.95, y: 1.12, z: -0.70 });
const REST_ANGLES = Object.freeze({
  shoulder: 15 * Math.PI / 180,
  elbow: -25 * Math.PI / 180,
  wrist: 20 * Math.PI / 180,
});
const ATTACK_QDOT = Object.freeze({ shoulder: 1.40, elbow: 0.40, wrist: 0.20 });
const GEOMETRY = Object.freeze({
  upperArmLengthMeters: 0.38,
  forearmLengthMeters: 0.31,
  handLengthMeters: 0.10,
  guardOffsetMeters: 0.08,
  swordLengthMeters: 1.05,
});
const JOINT_NAMES = Object.freeze(['shoulder', 'elbow', 'wrist']);

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090e16);
scene.fog = new THREE.Fog(0x090e16, 7, 15);
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
camera.position.set(3.35, 2.45, -4.25);
camera.lookAt(-0.05, 1.10, -0.28);
scene.add(new THREE.HemisphereLight(0xddeaff, 0x202738, 1.35));
const key = new THREE.DirectionalLight(0xffffff, 1.25);
key.position.set(4, 7, -3);
scene.add(key);
const rimLight = new THREE.DirectionalLight(0x84e7d3, 0.55);
rimLight.position.set(-4, 3, 2);
scene.add(rimLight);
scene.add(new THREE.GridHelper(10, 20, 0x33445f, 0x202a3b));

const shield = new THREE.Mesh(
  new THREE.CylinderGeometry(SHIELD_RADIUS, SHIELD_RADIUS, SHIELD_THICKNESS, 48),
  new THREE.MeshStandardMaterial({ color: 0x39c6d8, metalness: 0.55, roughness: 0.34, transparent: true, opacity: 0.80 }),
);
scene.add(shield);
const shieldRim = new THREE.Mesh(
  new THREE.TorusGeometry(SHIELD_RADIUS, 0.018, 10, 48),
  new THREE.MeshBasicMaterial({ color: 0xb9fbff }),
);
shieldRim.rotation.x = Math.PI / 2;
shieldRim.position.y = -SHIELD_THICKNESS * 0.52;
shield.add(shieldRim);

const torso = new THREE.Mesh(
  new THREE.BoxGeometry(0.30, 0.52, 0.24),
  new THREE.MeshStandardMaterial({ color: 0x51446f, roughness: 0.62 }),
);
torso.position.set(SHOULDER_ORIGIN.x - 0.13, SHOULDER_ORIGIN.y - 0.13, SHOULDER_ORIGIN.z - 0.02);
scene.add(torso);

function makeBone(color, thickness) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, thickness, thickness),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
  );
  scene.add(mesh);
  return mesh;
}

const upperArmMesh = makeBone(0x7dc99d, 0.095);
const forearmMesh = makeBone(0x73bd94, 0.080);
const handMesh = makeBone(0x8ed8ae, 0.070);
const bladeMesh = makeBone(0xe2e7ef, 0.032);
bladeMesh.material.metalness = 0.78;
bladeMesh.material.roughness = 0.20;
const handleMesh = makeBone(0x5f4737, 0.055);
const crossguardMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.045, 0.045, 0.25),
  new THREE.MeshStandardMaterial({ color: 0xb9a778, metalness: 0.55, roughness: 0.35 }),
);
scene.add(crossguardMesh);

function makeJoint(color, radius = 0.045) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 18, 12),
    new THREE.MeshBasicMaterial({ color }),
  );
  scene.add(mesh);
  return mesh;
}
const shoulderJoint = makeJoint(0xa997e8, 0.052);
const elbowJoint = makeJoint(0xffcb77, 0.045);
const wristJoint = makeJoint(0x7ef0ad, 0.042);

const contactMarker = makeJoint(0xff955f, 0.052);
contactMarker.visible = false;
const impulseArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.6, 0xff8b4f, 0.11, 0.055);
const normalArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 0.48, 0xffdf72, 0.10, 0.05);
const shieldVelocityArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.6, 0x66e7f4, 0.11, 0.055);
impulseArrow.visible = false;
normalArrow.visible = false;
shieldVelocityArrow.visible = false;
scene.add(impulseArrow, normalArrow, shieldVelocityArrow);

const hudContact = document.getElementById('hudContact');
const hudImpulse = document.getElementById('hudImpulse');
const hudJointDelta = document.getElementById('hudJointDelta');
const hudAngles = document.getElementById('hudAngles');
const hudGrip = document.getElementById('hudGrip');
const hudTravel = document.getElementById('hudTravel');
const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const shieldSpeedInput = document.getElementById('shieldSpeed');
const wristStiffnessInput = document.getElementById('wristStiffness');
const elbowStiffnessInput = document.getElementById('elbowStiffness');
const shieldSpeedValue = document.getElementById('shieldSpeedValue');
const wristStiffnessValue = document.getElementById('wristStiffnessValue');
const elbowStiffnessValue = document.getElementById('elbowStiffnessValue');
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
let armState = {
  anglesRad: { ...REST_ANGLES },
  jointVelocityRadPerSecond: { ...ATTACK_QDOT },
};
let latestKinematics = null;
let impactTip = null;
let impactWrist = null;
let maxTipTravel = 0;
let maxWristTravel = 0;
let maxTipToWristRatio = 1;
const shieldLinearVelocity = new THREE.Vector3();
const shieldAngularVelocity = new THREE.Vector3();

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function smoothstep(t) { const u = clamp01(t); return u * u * (3 - 2 * u); }
function lerp(a, b, t) { return a + (b - a) * t; }
function deg(value) { return value * Math.PI / 180; }
function shieldSpeed() { return Number(shieldSpeedInput.value) || 1; }
function wristStiffness() { return Number(wristStiffnessInput.value) || 0; }
function elbowStiffness() { return Number(elbowStiffnessInput.value) || 0; }
function degrees(value) { return value * 180 / Math.PI; }
function v3(value) { return new THREE.Vector3(value.x, value.y, value.z); }

function refreshControlLabels() {
  shieldSpeedValue.textContent = `${shieldSpeed().toFixed(2)}×`;
  wristStiffnessValue.textContent = `${wristStiffness().toFixed(1)}`;
  elbowStiffnessValue.textContent = `${elbowStiffness().toFixed(1)}`;
}

function setShieldPose(timeSeconds) {
  const duration = BASE_SWEEP_DURATION_SECONDS / Math.max(0.35, shieldSpeed());
  const start = CONTACT_CENTER_SECONDS - duration * 0.5;
  const p = smoothstep((timeSeconds - start) / duration);
  shield.position.set(
    lerp(0.28, 0.02, p),
    1.12 + Math.sin(p * Math.PI) * 0.012,
    lerp(-0.12, -0.18, p),
  );
  const parryAngle = deg(lerp(-6, 24, p));
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

function jointMapLerp(a, b, t) {
  return {
    shoulder: lerp(a.shoulder, b.shoulder, t),
    elbow: lerp(a.elbow, b.elbow, t),
    wrist: lerp(a.wrist, b.wrist, t),
  };
}

function predictAngles(angles, qdot, dt) {
  return {
    shoulder: angles.shoulder + qdot.shoulder * dt,
    elbow: angles.elbow + qdot.elbow * dt,
    wrist: angles.wrist + qdot.wrist * dt,
  };
}

function makeKinematics(anglesRad) {
  return forwardArticulatedSwordArm({
    shoulderOrigin: SHOULDER_ORIGIN,
    anglesRad,
    geometry: GEOMETRY,
  });
}

function setSegmentMesh(mesh, aValue, bValue) {
  const a = v3(aValue);
  const b = v3(bValue);
  const direction = b.clone().sub(a);
  const length = direction.length();
  if (length <= 1e-7) return;
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.set(length, 1, 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize());
}

function updateArticulatedVisuals() {
  latestKinematics = makeKinematics(armState.anglesRad);
  const k = latestKinematics;
  setSegmentMesh(upperArmMesh, k.shoulder, k.elbow);
  setSegmentMesh(forearmMesh, k.elbow, k.wrist);
  setSegmentMesh(handMesh, k.wrist, k.grip);
  setSegmentMesh(bladeMesh, k.bladeStart, k.bladeTip);

  const handDir = v3(k.handDirection).normalize();
  const handleBack = v3(k.grip).addScaledVector(handDir, -0.11);
  setSegmentMesh(handleMesh, handleBack, k.bladeStart);
  crossguardMesh.position.copy(v3(k.bladeStart));
  crossguardMesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), handDir);

  shoulderJoint.position.copy(v3(k.shoulder));
  elbowJoint.position.copy(v3(k.elbow));
  wristJoint.position.copy(v3(k.wrist));

  if (impactTip && impactWrist) {
    const tipTravel = v3(k.bladeTip).distanceTo(impactTip);
    const wristTravel = v3(k.wrist).distanceTo(impactWrist);
    maxTipTravel = Math.max(maxTipTravel, tipTravel);
    maxWristTravel = Math.max(maxWristTravel, wristTravel);
    maxTipToWristRatio = Math.max(maxTipToWristRatio, tipTravel / Math.max(0.001, wristTravel));
  }
}

function passiveProfile() {
  return {
    restAnglesRad: REST_ANGLES,
    passiveStiffnessNmPerRad: {
      shoulder: 8.0,
      elbow: elbowStiffness(),
      wrist: wristStiffness(),
    },
    passiveDampingNmsPerRad: {
      shoulder: 1.45,
      elbow: 0.82,
      wrist: 0.34,
    },
  };
}

function stepPassiveArm(dt) {
  const next = stepArticulatedArmState(armState, dt, passiveProfile());
  armState = {
    anglesRad: { ...next.anglesRad },
    jointVelocityRadPerSecond: { ...next.jointVelocityRadPerSecond },
  };
}

function showContact(contact, impulse, shieldPointVelocity) {
  const point = v3(contact.point);
  contactMarker.position.copy(point);
  contactMarker.visible = true;

  const normal = v3(contact.normal).normalize();
  normalArrow.position.copy(point);
  normalArrow.setDirection(normal);
  normalArrow.setLength(0.48, 0.10, 0.05);
  normalArrow.visible = true;

  const shieldVelocity = v3(shieldPointVelocity);
  if (shieldVelocity.lengthSq() > 1e-8) {
    shieldVelocityArrow.position.copy(point);
    shieldVelocityArrow.setDirection(shieldVelocity.clone().normalize());
    shieldVelocityArrow.setLength(Math.min(1.15, 0.15 + shieldVelocity.length() * 0.08), 0.11, 0.055);
    shieldVelocityArrow.visible = true;
  }

  const impulseVector = v3(impulse.impulse);
  if (impulseVector.lengthSq() > 1e-8) {
    impulseArrow.position.copy(point);
    impulseArrow.setDirection(impulseVector.clone().normalize());
    impulseArrow.setLength(Math.min(1.15, 0.16 + impulseVector.length() * 0.18), 0.11, 0.055);
    impulseArrow.visible = true;
  }
}

function resetSimulation() {
  accumulator = 0;
  simTime = 0;
  hit = false;
  paused = false;
  impactSimTime = null;
  latestContact = null;
  latestImpulse = null;
  latestShieldContactSpeed = 0;
  armState = {
    anglesRad: { ...REST_ANGLES },
    jointVelocityRadPerSecond: { ...ATTACK_QDOT },
  };
  impactTip = null;
  impactWrist = null;
  maxTipTravel = 0;
  maxWristTravel = 0;
  maxTipToWristRatio = 1;
  contactMarker.visible = false;
  impulseArrow.visible = false;
  normalArrow.visible = false;
  shieldVelocityArrow.visible = false;
  setShieldPose(0);
  updateArticulatedVisuals();
  status.textContent = `${ARTICULATED_ARM_IMPULSE_CHAIN_STAGE} READY · rigid grip / joint-only recoil`;
  status.className = 'warn';
  buildReport();
}

function solveContact(previousAngles, predictedAngles, previousShieldPose, currentShieldPose, dt) {
  const previousKinematics = makeKinematics(previousAngles);
  const predictedKinematics = makeKinematics(predictedAngles);
  const contact = probeSweptBladeShieldPhysicalContact({
    previousBlade: buildBladePolylineFromArticulatedArm(previousKinematics),
    currentBlade: buildBladePolylineFromArticulatedArm(predictedKinematics),
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

  const impactAngles = jointMapLerp(previousAngles, predictedAngles, contact.sweepAlpha);
  const impactKinematics = makeKinematics(impactAngles);
  const impactCenter = contact.impactShieldPose.center;
  const shieldPointVelocity = computeShieldContactPointVelocity({
    center: impactCenter,
    contactPoint: contact.point,
    linearVelocity: shieldLinearVelocity,
    angularVelocity: shieldAngularVelocity,
  });
  latestShieldContactSpeed = Math.hypot(shieldPointVelocity.x, shieldPointVelocity.y, shieldPointVelocity.z);

  const impulse = solveArticulatedArmContactImpulse({
    kinematics: impactKinematics,
    contactPoint: contact.point,
    contactNormal: contact.normal,
    shieldPointVelocity,
    jointVelocityRadPerSecond: armState.jointVelocityRadPerSecond,
    restitution: 0.38,
    friction: 0.58,
  });

  latestContact = contact;
  latestImpulse = impulse;
  if (!impulse.applied) {
    status.textContent = `${ARTICULATED_ARM_IMPULSE_CHAIN_STAGE} CCD CONTACT but articulated impulse rejected: ${impulse.reason}`;
    status.className = 'bad';
    return false;
  }

  armState = {
    anglesRad: impactAngles,
    jointVelocityRadPerSecond: { ...impulse.nextJointVelocityRadPerSecond },
  };
  hit = true;
  impactSimTime = simTime - dt + contact.timeOfImpactSeconds;
  impactTip = v3(impactKinematics.bladeTip);
  impactWrist = v3(impactKinematics.wrist);
  showContact(contact, impulse, shieldPointVelocity);
  status.textContent = `${ARTICULATED_ARM_IMPULSE_CHAIN_STAGE} CONTACT · blade impulse distributed directly into wrist / elbow / shoulder`;
  status.className = 'good';

  const remaining = dt * (1 - contact.sweepAlpha);
  if (remaining > 0) stepPassiveArm(remaining);
  updateArticulatedVisuals();
  buildReport();
  return true;
}

function fixedStep(dt) {
  if (paused) return;

  const previousShieldPosition = shield.position.clone();
  const previousShieldQuaternion = shield.quaternion.clone();
  const previousShieldPose = captureShieldPose();
  const previousAngles = { ...armState.anglesRad };

  simTime += dt;
  setShieldPose(simTime);
  const currentShieldPose = captureShieldPose();
  shieldLinearVelocity.copy(shield.position).sub(previousShieldPosition).multiplyScalar(1 / Math.max(dt, 1e-6));
  shieldAngularVelocity.copy(extractAngularVelocity(previousShieldQuaternion, shield.quaternion, dt));

  if (!hit) {
    const predictedAngles = predictAngles(previousAngles, armState.jointVelocityRadPerSecond, dt);
    const contacted = solveContact(previousAngles, predictedAngles, previousShieldPose, currentShieldPose, dt);
    if (!contacted) {
      armState.anglesRad = predictedAngles;
      updateArticulatedVisuals();
    }
  } else {
    stepPassiveArm(dt);
    updateArticulatedVisuals();
  }

  if (hit && impactSimTime != null && simTime - impactSimTime > 0.62) {
    if (autoRepeat.checked) resetSimulation();
    else paused = true;
  } else if (!hit && simTime > 0.55) {
    if (autoRepeat.checked) resetSimulation();
    else {
      paused = true;
      status.textContent = `${ARTICULATED_ARM_IMPULSE_CHAIN_STAGE} NO CONTACT · adjust geometry`;
      status.className = 'bad';
    }
  }
}

function updateHud() {
  hudContact.textContent = latestContact
    ? `CCD: blade ${latestContact.bladeFraction.toFixed(3)} · ${latestContact.contactFeature} · TOI ${(latestContact.timeOfImpactSeconds * 1000).toFixed(2)}ms / 4.17ms`
    : 'CCD: waiting…';
  hudImpulse.textContent = latestImpulse?.applied
    ? `Articulated impulse: ${latestImpulse.normalImpulseNs.toFixed(2)} N·s normal + ${latestImpulse.frictionImpulseNs.toFixed(2)} N·s tangent · shield point ${latestShieldContactSpeed.toFixed(2)}m/s`
    : 'Articulated impulse: —';
  hudJointDelta.textContent = latestImpulse?.applied
    ? `Impact Δω: wrist ${degrees(latestImpulse.deltaJointVelocityRadPerSecond.wrist).toFixed(1)}°/s · elbow ${degrees(latestImpulse.deltaJointVelocityRadPerSecond.elbow).toFixed(1)}°/s · shoulder ${degrees(latestImpulse.deltaJointVelocityRadPerSecond.shoulder).toFixed(1)}°/s`
    : 'Impact Δω: —';
  hudAngles.textContent = `Joint angles: W ${degrees(armState.anglesRad.wrist).toFixed(1)}° · E ${degrees(armState.anglesRad.elbow).toFixed(1)}° · S ${degrees(armState.anglesRad.shoulder).toFixed(1)}°`;
  hudGrip.textContent = `Grip separation: 0.0 mm · hand translation DOF: NONE · Sword is rigidly attached to wrist FK`;
  hudTravel.textContent = impactTip
    ? `After impact travel: tip ${maxTipTravel.toFixed(3)}m · wrist ${maxWristTravel.toFixed(3)}m · tip/wrist max ${maxTipToWristRatio.toFixed(2)}×`
    : 'After impact travel: —';
}

function buildReport() {
  const report = {
    stage: ARTICULATED_ARM_IMPULSE_CHAIN_STAGE,
    pass: Boolean(latestContact?.contact && latestImpulse?.applied),
    ccd: latestContact ? {
      bladeFraction: latestContact.bladeFraction,
      sweepAlpha: latestContact.sweepAlpha,
      timeOfImpactSeconds: latestContact.timeOfImpactSeconds,
      contactFeature: latestContact.contactFeature,
      point: latestContact.point,
      normal: latestContact.normal,
    } : null,
    articulatedImpulse: latestImpulse ? {
      applied: latestImpulse.applied,
      normalImpulseNs: latestImpulse.normalImpulseNs,
      frictionImpulseNs: latestImpulse.frictionImpulseNs,
      deltaJointVelocityRadPerSecond: latestImpulse.deltaJointVelocityRadPerSecond,
      nextJointVelocityRadPerSecond: latestImpulse.nextJointVelocityRadPerSecond,
    } : null,
    travel: {
      maxTipTravelMeters: maxTipTravel,
      maxWristTravelMeters: maxWristTravel,
      maxTipToWristRatio,
    },
    invariants: {
      rigidGrip: true,
      handTranslationDof: false,
      wholeBladeCcdFirst: true,
      articulatedImpulseAfterToi: true,
      noFreeSwordState: true,
      noGripSpring: true,
      noHandParticle: true,
      noIkAuthority: true,
      fixedStepHz: 240,
    },
  };
  reportNode.textContent = JSON.stringify(report, null, 2);
  document.documentElement.dataset.g43b5r292r1 = report.pass ? 'pass' : 'pending';
  window.__G43B5R292R1_RESULT__ = report;
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
  if (values.wristStiffness != null) wristStiffnessInput.value = values.wristStiffness;
  if (values.elbowStiffness != null) elbowStiffnessInput.value = values.elbowStiffness;
  refreshControlLabels();
  resetSimulation();
}

document.getElementById('restart').addEventListener('click', resetSimulation);
document.getElementById('strong').addEventListener('click', () => setPreset({ shieldSpeed: 1.65, wristStiffness: 2.4, elbowStiffness: 5.5 }));
document.getElementById('firm').addEventListener('click', () => setPreset({ shieldSpeed: 1.65, wristStiffness: 5.0, elbowStiffness: 8.0 }));
document.getElementById('loose').addEventListener('click', () => setPreset({ shieldSpeed: 1.65, wristStiffness: 1.0, elbowStiffness: 3.2 }));
for (const input of [shieldSpeedInput, wristStiffnessInput, elbowStiffnessInput]) {
  input.addEventListener('input', refreshControlLabels);
  input.addEventListener('change', resetSimulation);
}

refreshControlLabels();
resize();
addEventListener('resize', resize);
setPreset({ shieldSpeed: 1.65, wristStiffness: 2.4, elbowStiffness: 5.5 });

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

window.__G43B5R292R1_LAB__ = {
  resetSimulation,
  get latestContact() { return latestContact; },
  get latestImpulse() { return latestImpulse; },
  get armState() { return armState; },
  get fixedStepHz() { return 1 / FIXED_DT; },
};
