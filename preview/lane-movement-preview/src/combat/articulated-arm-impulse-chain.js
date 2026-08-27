export const ARTICULATED_ARM_IMPULSE_CHAIN_STAGE = 'G4.3B.5R.2.9.2R1';

export const ARTICULATED_ARM_IMPULSE_DEFAULTS = Object.freeze({
  upperArmLengthMeters: 0.38,
  forearmLengthMeters: 0.31,
  handLengthMeters: 0.10,
  guardOffsetMeters: 0.08,
  swordLengthMeters: 1.05,
  jointInertiaKgM2: Object.freeze({
    shoulder: 0.28,
    elbow: 0.12,
    wrist: 0.055,
  }),
  passiveStiffnessNmPerRad: Object.freeze({
    shoulder: 8.0,
    elbow: 5.5,
    wrist: 2.4,
  }),
  passiveDampingNmsPerRad: Object.freeze({
    shoulder: 1.45,
    elbow: 0.82,
    wrist: 0.34,
  }),
  jointLimitsRad: Object.freeze({
    shoulder: Object.freeze([-0.85, 1.20]),
    elbow: Object.freeze([-1.35, 0.72]),
    wrist: Object.freeze([-0.88, 0.88]),
  }),
  restitution: 0.38,
  friction: 0.58,
  maximumImpulseNs: 12,
});

const JOINT_NAMES = Object.freeze(['shoulder', 'elbow', 'wrist']);
const AXIS = Object.freeze({ x: 0, y: -1, z: 0 });

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value, fallback = { x: 0, y: 0, z: -1 }) {
  const m = length(value);
  return m > 1e-9 ? mul(value, 1 / m) : { ...fallback };
}

function freezeVector(value) {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function freezeJointMap(value) {
  return Object.freeze({
    shoulder: finite(value.shoulder),
    elbow: finite(value.elbow),
    wrist: finite(value.wrist),
  });
}

function directionFromAngle(angle) {
  return { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
}

function resolveGeometry(input = {}) {
  const defaults = ARTICULATED_ARM_IMPULSE_DEFAULTS;
  return Object.freeze({
    upperArmLengthMeters: Math.max(0.05, finite(input.upperArmLengthMeters, defaults.upperArmLengthMeters)),
    forearmLengthMeters: Math.max(0.05, finite(input.forearmLengthMeters, defaults.forearmLengthMeters)),
    handLengthMeters: Math.max(0.02, finite(input.handLengthMeters, defaults.handLengthMeters)),
    guardOffsetMeters: Math.max(0, finite(input.guardOffsetMeters, defaults.guardOffsetMeters)),
    swordLengthMeters: Math.max(0.2, finite(input.swordLengthMeters, defaults.swordLengthMeters)),
  });
}

function resolveJointMap(input = {}, fallback = {}) {
  return {
    shoulder: finite(input.shoulder, fallback.shoulder),
    elbow: finite(input.elbow, fallback.elbow),
    wrist: finite(input.wrist, fallback.wrist),
  };
}

export function forwardArticulatedSwordArm(input = {}) {
  const geometry = resolveGeometry(input.geometry);
  const shoulder = vec(input.shoulderOrigin);
  const q = resolveJointMap(input.anglesRad);
  const upperAngle = q.shoulder;
  const forearmAngle = q.shoulder + q.elbow;
  const handAngle = forearmAngle + q.wrist;
  const upperDirection = directionFromAngle(upperAngle);
  const forearmDirection = directionFromAngle(forearmAngle);
  const handDirection = directionFromAngle(handAngle);

  const elbow = add(shoulder, mul(upperDirection, geometry.upperArmLengthMeters));
  const wrist = add(elbow, mul(forearmDirection, geometry.forearmLengthMeters));
  const grip = add(wrist, mul(handDirection, geometry.handLengthMeters));
  const bladeStart = add(grip, mul(handDirection, geometry.guardOffsetMeters));
  const bladeMid = add(bladeStart, mul(handDirection, geometry.swordLengthMeters * 0.5));
  const bladeTip = add(bladeStart, mul(handDirection, geometry.swordLengthMeters));

  return Object.freeze({
    stage: ARTICULATED_ARM_IMPULSE_CHAIN_STAGE,
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
    anglesRad: freezeJointMap(q),
    cumulativeAnglesRad: Object.freeze({
      upperArm: upperAngle,
      forearm: forearmAngle,
      handSword: handAngle,
    }),
    geometry,
    rigidGrip: true,
    handTranslationDof: false,
  });
}

export function buildBladePolylineFromArticulatedArm(kinematics = {}) {
  return Object.freeze([
    freezeVector(vec(kinematics.bladeStart)),
    freezeVector(vec(kinematics.bladeMid)),
    freezeVector(vec(kinematics.bladeTip)),
  ]);
}

export function computeArticulatedContactJacobian(input = {}) {
  const kinematics = input.kinematics || {};
  const point = vec(input.contactPoint);
  const origins = {
    shoulder: vec(kinematics.shoulder),
    elbow: vec(kinematics.elbow),
    wrist: vec(kinematics.wrist),
  };
  const jacobian = {};
  for (const name of JOINT_NAMES) {
    jacobian[name] = freezeVector(cross(AXIS, sub(point, origins[name])));
  }
  return Object.freeze(jacobian);
}

export function computeArticulatedPointVelocity(input = {}) {
  const jacobian = input.jacobian || computeArticulatedContactJacobian(input);
  const qdot = resolveJointMap(input.jointVelocityRadPerSecond);
  let velocity = { x: 0, y: 0, z: 0 };
  for (const name of JOINT_NAMES) velocity = add(velocity, mul(jacobian[name], qdot[name]));
  return freezeVector(velocity);
}

function effectiveInverseMassAlong(jacobian, direction, inverseInertia) {
  let sum = 0;
  for (const name of JOINT_NAMES) {
    const scalarJacobian = dot(jacobian[name], direction);
    sum += scalarJacobian * scalarJacobian * inverseInertia[name];
  }
  return sum;
}

function applyGeneralizedImpulse(jointVelocity, jacobian, impulse, inverseInertia) {
  const next = { ...jointVelocity };
  const delta = {};
  for (const name of JOINT_NAMES) {
    const generalizedImpulse = dot(jacobian[name], impulse);
    delta[name] = generalizedImpulse * inverseInertia[name];
    next[name] += delta[name];
  }
  return { next, delta };
}

export function solveArticulatedArmContactImpulse(input = {}) {
  const defaults = ARTICULATED_ARM_IMPULSE_DEFAULTS;
  const kinematics = input.kinematics || forwardArticulatedSwordArm(input);
  const point = vec(input.contactPoint);
  const normal = normalize(vec(input.contactNormal));
  const shieldPointVelocity = vec(input.shieldPointVelocity);
  const qdot = resolveJointMap(input.jointVelocityRadPerSecond);
  const inertia = resolveJointMap(input.jointInertiaKgM2, defaults.jointInertiaKgM2);
  const inverseInertia = {
    shoulder: 1 / Math.max(1e-4, inertia.shoulder),
    elbow: 1 / Math.max(1e-4, inertia.elbow),
    wrist: 1 / Math.max(1e-4, inertia.wrist),
  };
  const restitution = clamp(finite(input.restitution, defaults.restitution), 0, 0.9);
  const friction = clamp(finite(input.friction, defaults.friction), 0, 1.5);
  const maximumImpulseNs = Math.max(0.1, finite(input.maximumImpulseNs, defaults.maximumImpulseNs));

  const jacobian = computeArticulatedContactJacobian({ kinematics, contactPoint: point });
  const armPointVelocity = computeArticulatedPointVelocity({
    jacobian,
    jointVelocityRadPerSecond: qdot,
  });
  const relativeVelocity = sub(armPointVelocity, shieldPointVelocity);
  const normalRelativeSpeed = dot(relativeVelocity, normal);

  if (normalRelativeSpeed >= 0) {
    return Object.freeze({
      stage: ARTICULATED_ARM_IMPULSE_CHAIN_STAGE,
      applied: false,
      reason: 'separating-or-not-closing',
      contactPoint: freezeVector(point),
      contactNormal: freezeVector(normal),
      armPointVelocity,
      shieldPointVelocity: freezeVector(shieldPointVelocity),
      relativeVelocity: freezeVector(relativeVelocity),
      normalRelativeSpeed,
      normalImpulseNs: 0,
      frictionImpulseNs: 0,
      impulse: freezeVector({ x: 0, y: 0, z: 0 }),
      deltaJointVelocityRadPerSecond: freezeJointMap({}),
      nextJointVelocityRadPerSecond: freezeJointMap(qdot),
      rigidGrip: true,
      handTranslationDof: false,
    });
  }

  const normalInverseMass = Math.max(1e-6, effectiveInverseMassAlong(jacobian, normal, inverseInertia));
  const normalImpulseNs = clamp(
    -(1 + restitution) * normalRelativeSpeed / normalInverseMass,
    0,
    maximumImpulseNs,
  );
  const normalImpulse = mul(normal, normalImpulseNs);
  const normalApplied = applyGeneralizedImpulse(qdot, jacobian, normalImpulse, inverseInertia);

  const postNormalPointVelocity = computeArticulatedPointVelocity({
    jacobian,
    jointVelocityRadPerSecond: normalApplied.next,
  });
  const postNormalRelative = sub(postNormalPointVelocity, shieldPointVelocity);
  const tangentRaw = sub(postNormalRelative, mul(normal, dot(postNormalRelative, normal)));
  const tangentSpeed = length(tangentRaw);

  let frictionImpulseNs = 0;
  let frictionImpulse = { x: 0, y: 0, z: 0 };
  if (tangentSpeed > 1e-6 && friction > 0) {
    const tangent = mul(tangentRaw, 1 / tangentSpeed);
    const tangentInverseMass = Math.max(1e-6, effectiveInverseMassAlong(jacobian, tangent, inverseInertia));
    frictionImpulseNs = Math.min(tangentSpeed / tangentInverseMass, friction * normalImpulseNs);
    frictionImpulse = mul(tangent, -frictionImpulseNs);
  }

  const totalImpulse = add(normalImpulse, frictionImpulse);
  const applied = applyGeneralizedImpulse(qdot, jacobian, totalImpulse, inverseInertia);

  return Object.freeze({
    stage: ARTICULATED_ARM_IMPULSE_CHAIN_STAGE,
    applied: true,
    reason: 'articulated-contact-impulse-applied',
    contactPoint: freezeVector(point),
    contactNormal: freezeVector(normal),
    armPointVelocity,
    shieldPointVelocity: freezeVector(shieldPointVelocity),
    relativeVelocity: freezeVector(relativeVelocity),
    normalRelativeSpeed,
    normalImpulseNs,
    frictionImpulseNs,
    impulse: freezeVector(totalImpulse),
    jacobian,
    jointInertiaKgM2: freezeJointMap(inertia),
    effectiveInverseMassNormal: normalInverseMass,
    deltaJointVelocityRadPerSecond: freezeJointMap(applied.delta),
    nextJointVelocityRadPerSecond: freezeJointMap(applied.next),
    rigidGrip: true,
    handTranslationDof: false,
    authority: 'blade-contact-jacobian-to-wrist-elbow-shoulder-angular-velocity',
  });
}

export function stepArticulatedArmState(state = {}, deltaSeconds = 1 / 240, profile = {}) {
  const defaults = ARTICULATED_ARM_IMPULSE_DEFAULTS;
  const dt = Math.max(0, finite(deltaSeconds, 1 / 240));
  const angles = resolveJointMap(state.anglesRad);
  const velocity = resolveJointMap(state.jointVelocityRadPerSecond);
  const restAngles = resolveJointMap(profile.restAnglesRad, angles);
  const inertia = resolveJointMap(profile.jointInertiaKgM2, defaults.jointInertiaKgM2);
  const stiffness = resolveJointMap(profile.passiveStiffnessNmPerRad, defaults.passiveStiffnessNmPerRad);
  const damping = resolveJointMap(profile.passiveDampingNmsPerRad, defaults.passiveDampingNmsPerRad);
  const limits = profile.jointLimitsRad || defaults.jointLimitsRad;
  const nextAngles = {};
  const nextVelocity = {};
  const limitHits = {};

  for (const name of JOINT_NAMES) {
    const invInertia = 1 / Math.max(1e-4, inertia[name]);
    const torque = -stiffness[name] * (angles[name] - restAngles[name]) - damping[name] * velocity[name];
    let w = velocity[name] + torque * invInertia * dt;
    let q = angles[name] + w * dt;
    const rawLimits = limits[name] || defaults.jointLimitsRad[name];
    const min = finite(rawLimits[0], -Math.PI);
    const max = finite(rawLimits[1], Math.PI);
    let hit = false;
    if (q < min) {
      q = min;
      if (w < 0) w *= -0.08;
      hit = true;
    } else if (q > max) {
      q = max;
      if (w > 0) w *= -0.08;
      hit = true;
    }
    nextAngles[name] = q;
    nextVelocity[name] = w;
    limitHits[name] = hit;
  }

  return Object.freeze({
    stage: ARTICULATED_ARM_IMPULSE_CHAIN_STAGE,
    anglesRad: freezeJointMap(nextAngles),
    jointVelocityRadPerSecond: freezeJointMap(nextVelocity),
    limitHits: Object.freeze(limitHits),
    rigidGrip: true,
    handTranslationDof: false,
  });
}
