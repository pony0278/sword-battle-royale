export const ANATOMICAL_3D_JOINT_RESPONSE_STAGE = 'G4.3B.5R.2.9.2R1.1';

export const ANATOMICAL_3D_DOF_NAMES = Object.freeze([
  'shoulderYaw',
  'shoulderPitch',
  'shoulderRoll',
  'elbowFlex',
  'forearmRoll',
  'wristFlex',
  'wristDeviation',
]);

export const ANATOMICAL_3D_JOINT_DEFAULTS = Object.freeze({
  upperArmLengthMeters: 0.38,
  forearmLengthMeters: 0.31,
  handLengthMeters: 0.10,
  guardOffsetMeters: 0.08,
  swordLengthMeters: 1.05,
  restitution: 0.34,
  friction: 0.54,
  maximumImpulseNs: 12,
  jacobianEpsilonRad: 1e-4,
  inertiaKgM2: Object.freeze({
    shoulderYaw: 0.34,
    shoulderPitch: 0.31,
    shoulderRoll: 0.27,
    elbowFlex: 0.12,
    forearmRoll: 0.075,
    wristFlex: 0.052,
    wristDeviation: 0.047,
  }),
  passiveStiffnessNmPerRad: Object.freeze({
    shoulderYaw: 7.8,
    shoulderPitch: 8.4,
    shoulderRoll: 6.8,
    elbowFlex: 5.4,
    forearmRoll: 2.3,
    wristFlex: 2.2,
    wristDeviation: 1.7,
  }),
  passiveDampingNmsPerRad: Object.freeze({
    shoulderYaw: 1.55,
    shoulderPitch: 1.62,
    shoulderRoll: 1.35,
    elbowFlex: 0.86,
    forearmRoll: 0.42,
    wristFlex: 0.35,
    wristDeviation: 0.31,
  }),
  limitsRad: Object.freeze({
    shoulderYaw: Object.freeze([-1.05, 1.30]),
    shoulderPitch: Object.freeze([-0.95, 0.95]),
    shoulderRoll: Object.freeze([-0.72, 0.82]),
    elbowFlex: Object.freeze([-1.42, 0.32]),
    forearmRoll: Object.freeze([-1.15, 1.15]),
    wristFlex: Object.freeze([-0.75, 0.70]),
    wristDeviation: Object.freeze([-0.48, 0.48]),
  }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function vec(value = {}) {
  return { x: finite(value.x), y: finite(value.y), z: finite(value.z) };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mul(a, scalar) {
  return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value, fallback = { x: 1, y: 0, z: 0 }) {
  const magnitude = length(value);
  return magnitude > 1e-10 ? mul(value, 1 / magnitude) : { ...fallback };
}

function freezeVector(value) {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function resolveDofMap(input = {}, fallback = {}) {
  const output = {};
  for (const name of ANATOMICAL_3D_DOF_NAMES) output[name] = finite(input[name], fallback[name]);
  return output;
}

function freezeDofMap(input = {}) {
  return Object.freeze(resolveDofMap(input));
}

function qNormalize(q) {
  const magnitude = Math.hypot(q.x, q.y, q.z, q.w);
  if (magnitude <= 1e-12) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: q.x / magnitude, y: q.y / magnitude, z: q.z / magnitude, w: q.w / magnitude };
}

function qMultiply(a, b) {
  return qNormalize({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}

function qAxisAngle(axisValue, angle) {
  const axis = normalize(vec(axisValue));
  const half = finite(angle) * 0.5;
  const s = Math.sin(half);
  return qNormalize({ x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(half) });
}

function qRotate(q, value) {
  const v = vec(value);
  const qv = { x: q.x, y: q.y, z: q.z };
  const uv = {
    x: qv.y * v.z - qv.z * v.y,
    y: qv.z * v.x - qv.x * v.z,
    z: qv.x * v.y - qv.y * v.x,
  };
  const uuv = {
    x: qv.y * uv.z - qv.z * uv.y,
    y: qv.z * uv.x - qv.x * uv.z,
    z: qv.x * uv.y - qv.y * uv.x,
  };
  return add(v, add(mul(uv, 2 * q.w), mul(uuv, 2)));
}

function composeLocal(parent, axis, angle) {
  return qMultiply(parent, qAxisAngle(axis, angle));
}

function resolveGeometry(input = {}) {
  const defaults = ANATOMICAL_3D_JOINT_DEFAULTS;
  return Object.freeze({
    upperArmLengthMeters: Math.max(0.05, finite(input.upperArmLengthMeters, defaults.upperArmLengthMeters)),
    forearmLengthMeters: Math.max(0.05, finite(input.forearmLengthMeters, defaults.forearmLengthMeters)),
    handLengthMeters: Math.max(0.02, finite(input.handLengthMeters, defaults.handLengthMeters)),
    guardOffsetMeters: Math.max(0, finite(input.guardOffsetMeters, defaults.guardOffsetMeters)),
    swordLengthMeters: Math.max(0.2, finite(input.swordLengthMeters, defaults.swordLengthMeters)),
  });
}

export function forwardAnatomicalSwordArm3D(input = {}) {
  const geometry = resolveGeometry(input.geometry);
  const shoulder = vec(input.shoulderOrigin);
  const q = resolveDofMap(input.anglesRad);
  const identity = { x: 0, y: 0, z: 0, w: 1 };

  let shoulderOrientation = composeLocal(identity, { x: 0, y: 1, z: 0 }, q.shoulderYaw);
  shoulderOrientation = composeLocal(shoulderOrientation, { x: 0, y: 0, z: 1 }, q.shoulderPitch);
  shoulderOrientation = composeLocal(shoulderOrientation, { x: 1, y: 0, z: 0 }, q.shoulderRoll);

  const upperDirection = normalize(qRotate(shoulderOrientation, { x: 1, y: 0, z: 0 }));
  const elbow = add(shoulder, mul(upperDirection, geometry.upperArmLengthMeters));

  let forearmOrientation = composeLocal(shoulderOrientation, { x: 0, y: 0, z: 1 }, q.elbowFlex);
  forearmOrientation = composeLocal(forearmOrientation, { x: 1, y: 0, z: 0 }, q.forearmRoll);
  const forearmDirection = normalize(qRotate(forearmOrientation, { x: 1, y: 0, z: 0 }));
  const wrist = add(elbow, mul(forearmDirection, geometry.forearmLengthMeters));

  let handOrientation = composeLocal(forearmOrientation, { x: 0, y: 0, z: 1 }, q.wristFlex);
  handOrientation = composeLocal(handOrientation, { x: 0, y: 1, z: 0 }, q.wristDeviation);
  const handDirection = normalize(qRotate(handOrientation, { x: 1, y: 0, z: 0 }));
  const handUp = normalize(qRotate(handOrientation, { x: 0, y: 1, z: 0 }), { x: 0, y: 1, z: 0 });
  const grip = add(wrist, mul(handDirection, geometry.handLengthMeters));
  const bladeStart = add(grip, mul(handDirection, geometry.guardOffsetMeters));
  const bladeMid = add(bladeStart, mul(handDirection, geometry.swordLengthMeters * 0.5));
  const bladeTip = add(bladeStart, mul(handDirection, geometry.swordLengthMeters));

  return Object.freeze({
    stage: ANATOMICAL_3D_JOINT_RESPONSE_STAGE,
    shoulder: freezeVector(shoulder),
    elbow: freezeVector(elbow),
    wrist: freezeVector(wrist),
    grip: freezeVector(grip),
    bladeStart: freezeVector(bladeStart),
    bladeMid: freezeVector(bladeMid),
    bladeTip: freezeVector(bladeTip),
    upperDirection: freezeVector(upperDirection),
    forearmDirection: freezeVector(forearmDirection),
    handDirection: freezeVector(handDirection),
    handUp: freezeVector(handUp),
    anglesRad: freezeDofMap(q),
    shoulderOrientation: Object.freeze({ ...shoulderOrientation }),
    forearmOrientation: Object.freeze({ ...forearmOrientation }),
    handOrientation: Object.freeze({ ...handOrientation }),
    geometry,
    rigidGrip: true,
    handTranslationDof: false,
    anatomical3d: true,
  });
}

export function buildBladePolylineFromAnatomicalArm3D(kinematics = {}) {
  return Object.freeze([
    freezeVector(vec(kinematics.bladeStart)),
    freezeVector(vec(kinematics.bladeMid)),
    freezeVector(vec(kinematics.bladeTip)),
  ]);
}

function sampleBladePoint(kinematics, bladeFraction) {
  const fraction = clamp(bladeFraction, 0, 1);
  const start = vec(kinematics.bladeStart);
  const tip = vec(kinematics.bladeTip);
  return add(start, mul(sub(tip, start), fraction));
}

export function computeAnatomical3dContactJacobian(input = {}) {
  const angles = resolveDofMap(input.anglesRad || input.kinematics?.anglesRad);
  const shoulderOrigin = vec(input.shoulderOrigin || input.kinematics?.shoulder);
  const geometry = input.geometry || input.kinematics?.geometry;
  const bladeFraction = clamp(finite(input.bladeFraction, 0.5), 0, 1);
  const epsilon = Math.max(1e-6, finite(input.epsilonRad, ANATOMICAL_3D_JOINT_DEFAULTS.jacobianEpsilonRad));
  const base = forwardAnatomicalSwordArm3D({ shoulderOrigin, anglesRad: angles, geometry });
  const basePoint = sampleBladePoint(base, bladeFraction);
  const jacobian = {};

  for (const name of ANATOMICAL_3D_DOF_NAMES) {
    const plusAngles = { ...angles, [name]: angles[name] + epsilon };
    const minusAngles = { ...angles, [name]: angles[name] - epsilon };
    const plusPoint = sampleBladePoint(
      forwardAnatomicalSwordArm3D({ shoulderOrigin, anglesRad: plusAngles, geometry }),
      bladeFraction,
    );
    const minusPoint = sampleBladePoint(
      forwardAnatomicalSwordArm3D({ shoulderOrigin, anglesRad: minusAngles, geometry }),
      bladeFraction,
    );
    jacobian[name] = freezeVector(mul(sub(plusPoint, minusPoint), 1 / (2 * epsilon)));
  }

  return Object.freeze({
    point: freezeVector(basePoint),
    bladeFraction,
    jacobian: Object.freeze(jacobian),
    authority: 'finite-difference-fk-jacobian-at-actual-blade-fraction',
  });
}

export function computeAnatomical3dPointVelocity(input = {}) {
  const jacobian = input.jacobian || computeAnatomical3dContactJacobian(input).jacobian;
  const velocity = resolveDofMap(input.jointVelocityRadPerSecond);
  let pointVelocity = { x: 0, y: 0, z: 0 };
  for (const name of ANATOMICAL_3D_DOF_NAMES) pointVelocity = add(pointVelocity, mul(jacobian[name], velocity[name]));
  return freezeVector(pointVelocity);
}

function effectiveInverseMass(jacobian, direction, inverseInertia) {
  let total = 0;
  for (const name of ANATOMICAL_3D_DOF_NAMES) {
    const scalar = dot(jacobian[name], direction);
    total += scalar * scalar * inverseInertia[name];
  }
  return total;
}

function applyGeneralizedImpulse(velocity, jacobian, impulse, inverseInertia) {
  const next = { ...velocity };
  const delta = {};
  for (const name of ANATOMICAL_3D_DOF_NAMES) {
    const generalizedImpulse = dot(jacobian[name], impulse);
    delta[name] = generalizedImpulse * inverseInertia[name];
    next[name] += delta[name];
  }
  return { next, delta };
}

export function solveAnatomical3dContactImpulse(input = {}) {
  const defaults = ANATOMICAL_3D_JOINT_DEFAULTS;
  const kinematics = input.kinematics || forwardAnatomicalSwordArm3D(input);
  const angles = resolveDofMap(input.anglesRad || kinematics.anglesRad);
  const velocity = resolveDofMap(input.jointVelocityRadPerSecond);
  const inertia = resolveDofMap(input.inertiaKgM2, defaults.inertiaKgM2);
  const inverseInertia = {};
  for (const name of ANATOMICAL_3D_DOF_NAMES) inverseInertia[name] = 1 / Math.max(1e-4, inertia[name]);

  const normal = normalize(vec(input.contactNormal), { x: 0, y: 0, z: -1 });
  const shieldPointVelocity = vec(input.shieldPointVelocity);
  const bladeFraction = clamp(finite(input.bladeFraction, 0.5), 0, 1);
  const jacobianReport = computeAnatomical3dContactJacobian({
    shoulderOrigin: kinematics.shoulder,
    geometry: kinematics.geometry,
    anglesRad: angles,
    bladeFraction,
    epsilonRad: input.jacobianEpsilonRad,
  });
  const jacobian = jacobianReport.jacobian;
  const armPointVelocity = computeAnatomical3dPointVelocity({ jacobian, jointVelocityRadPerSecond: velocity });
  const relativeVelocity = sub(armPointVelocity, shieldPointVelocity);
  const normalRelativeSpeed = dot(relativeVelocity, normal);

  if (normalRelativeSpeed >= 0) {
    return Object.freeze({
      stage: ANATOMICAL_3D_JOINT_RESPONSE_STAGE,
      applied: false,
      reason: 'separating-or-not-closing',
      normalRelativeSpeed,
      bladeFraction,
      armPointVelocity,
      shieldPointVelocity: freezeVector(shieldPointVelocity),
      deltaJointVelocityRadPerSecond: freezeDofMap({}),
      nextJointVelocityRadPerSecond: freezeDofMap(velocity),
      rigidGrip: true,
      anatomical3d: true,
    });
  }

  const restitution = clamp(finite(input.restitution, defaults.restitution), 0, 0.9);
  const friction = clamp(finite(input.friction, defaults.friction), 0, 1.5);
  const maximumImpulseNs = Math.max(0.1, finite(input.maximumImpulseNs, defaults.maximumImpulseNs));
  const normalInvMass = Math.max(1e-6, effectiveInverseMass(jacobian, normal, inverseInertia));
  const normalImpulseNs = clamp(-(1 + restitution) * normalRelativeSpeed / normalInvMass, 0, maximumImpulseNs);
  const normalImpulse = mul(normal, normalImpulseNs);
  const normalApplied = applyGeneralizedImpulse(velocity, jacobian, normalImpulse, inverseInertia);
  const postNormalVelocity = computeAnatomical3dPointVelocity({ jacobian, jointVelocityRadPerSecond: normalApplied.next });
  const postNormalRelative = sub(postNormalVelocity, shieldPointVelocity);
  const tangentRaw = sub(postNormalRelative, mul(normal, dot(postNormalRelative, normal)));
  const tangentSpeed = length(tangentRaw);

  let frictionImpulseNs = 0;
  let frictionImpulse = { x: 0, y: 0, z: 0 };
  if (tangentSpeed > 1e-6 && friction > 0) {
    const tangent = mul(tangentRaw, 1 / tangentSpeed);
    const tangentInvMass = Math.max(1e-6, effectiveInverseMass(jacobian, tangent, inverseInertia));
    frictionImpulseNs = Math.min(tangentSpeed / tangentInvMass, friction * normalImpulseNs);
    frictionImpulse = mul(tangent, -frictionImpulseNs);
  }

  const impulse = add(normalImpulse, frictionImpulse);
  const applied = applyGeneralizedImpulse(velocity, jacobian, impulse, inverseInertia);

  return Object.freeze({
    stage: ANATOMICAL_3D_JOINT_RESPONSE_STAGE,
    applied: true,
    reason: 'anatomical-3d-contact-impulse-applied',
    bladeFraction,
    contactNormal: freezeVector(normal),
    armPointVelocity,
    shieldPointVelocity: freezeVector(shieldPointVelocity),
    relativeVelocity: freezeVector(relativeVelocity),
    normalRelativeSpeed,
    normalImpulseNs,
    frictionImpulseNs,
    impulse: freezeVector(impulse),
    effectiveInverseMassNormal: normalInvMass,
    jacobian,
    deltaJointVelocityRadPerSecond: freezeDofMap(applied.delta),
    nextJointVelocityRadPerSecond: freezeDofMap(applied.next),
    inertiaKgM2: freezeDofMap(inertia),
    rigidGrip: true,
    handTranslationDof: false,
    anatomical3d: true,
    authority: 'blade-contact-to-anatomical-3d-generalized-angular-velocity',
  });
}

export function stepAnatomical3dJointState(state = {}, deltaSeconds = 1 / 240, profile = {}) {
  const defaults = ANATOMICAL_3D_JOINT_DEFAULTS;
  const dt = Math.max(0, finite(deltaSeconds, 1 / 240));
  const angles = resolveDofMap(state.anglesRad);
  const velocity = resolveDofMap(state.jointVelocityRadPerSecond);
  const restAngles = resolveDofMap(profile.restAnglesRad, angles);
  const inertia = resolveDofMap(profile.inertiaKgM2, defaults.inertiaKgM2);
  const stiffness = resolveDofMap(profile.passiveStiffnessNmPerRad, defaults.passiveStiffnessNmPerRad);
  const damping = resolveDofMap(profile.passiveDampingNmsPerRad, defaults.passiveDampingNmsPerRad);
  const limits = profile.limitsRad || defaults.limitsRad;
  const nextAngles = {};
  const nextVelocity = {};
  const limitHits = {};

  for (const name of ANATOMICAL_3D_DOF_NAMES) {
    const inverseInertia = 1 / Math.max(1e-4, inertia[name]);
    const torque = -stiffness[name] * (angles[name] - restAngles[name]) - damping[name] * velocity[name];
    let w = velocity[name] + torque * inverseInertia * dt;
    let q = angles[name] + w * dt;
    const rawLimit = limits[name] || defaults.limitsRad[name];
    const min = finite(rawLimit[0], -Math.PI);
    const max = finite(rawLimit[1], Math.PI);
    let hit = false;
    if (q < min) {
      q = min;
      if (w < 0) w *= -0.06;
      hit = true;
    } else if (q > max) {
      q = max;
      if (w > 0) w *= -0.06;
      hit = true;
    }
    nextAngles[name] = q;
    nextVelocity[name] = w;
    limitHits[name] = hit;
  }

  return Object.freeze({
    stage: ANATOMICAL_3D_JOINT_RESPONSE_STAGE,
    anglesRad: freezeDofMap(nextAngles),
    jointVelocityRadPerSecond: freezeDofMap(nextVelocity),
    limitHits: Object.freeze(limitHits),
    rigidGrip: true,
    handTranslationDof: false,
    anatomical3d: true,
  });
}