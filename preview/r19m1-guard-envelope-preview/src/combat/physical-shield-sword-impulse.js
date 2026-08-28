export const PHYSICAL_SHIELD_SWORD_IMPULSE_STAGE = 'G4.3B.5R.2.9';

export const PHYSICAL_SHIELD_SWORD_IMPULSE_DEFAULTS = Object.freeze({
  swordMassKg: 1.35,
  swordLengthMeters: 1.05,
  restitution: 0.34,
  friction: 0.62,
  linearDampingPerSecond: 0.8,
  angularDampingPerSecond: 1.4,
  maximumImpulseNs: 18,
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function vec(input = {}) {
  return { x: finite(input.x), y: finite(input.y), z: finite(input.z) };
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

function length(a) {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a, fallback = { x: 0, y: 0, z: 1 }) {
  const m = length(a);
  return m > 1e-9 ? mul(a, 1 / m) : { ...fallback };
}

function freezeVector(a) {
  return Object.freeze({ x: a.x, y: a.y, z: a.z });
}

export function computeRigidPointVelocity(input = {}) {
  const linearVelocity = vec(input.linearVelocity);
  const angularVelocity = vec(input.angularVelocity);
  const radius = vec(input.radius);
  return freezeVector(add(linearVelocity, cross(angularVelocity, radius)));
}

export function computeShieldContactPointVelocity(input = {}) {
  return computeRigidPointVelocity({
    linearVelocity: input.linearVelocity,
    angularVelocity: input.angularVelocity,
    radius: sub(vec(input.contactPoint), vec(input.center)),
  });
}

export function estimateSwordPrincipalInertia(input = {}) {
  const massKg = Math.max(0.05, finite(input.massKg, PHYSICAL_SHIELD_SWORD_IMPULSE_DEFAULTS.swordMassKg));
  const lengthMeters = Math.max(0.1, finite(input.lengthMeters, PHYSICAL_SHIELD_SWORD_IMPULSE_DEFAULTS.swordLengthMeters));
  const transverse = Math.max(1e-4, massKg * lengthMeters * lengthMeters / 12);
  const axial = Math.max(1e-4, transverse * 0.08);
  return Object.freeze({
    x: transverse,
    y: transverse,
    z: axial,
    scalarForContact: transverse,
  });
}

export function solveKinematicShieldSwordImpulse(input = {}) {
  const defaults = PHYSICAL_SHIELD_SWORD_IMPULSE_DEFAULTS;
  const swordMassKg = Math.max(0.05, finite(input.swordMassKg, defaults.swordMassKg));
  const inverseMass = 1 / swordMassKg;
  const inertia = Math.max(
    1e-4,
    finite(
      input.swordInertiaKgM2,
      estimateSwordPrincipalInertia({ massKg: swordMassKg, lengthMeters: input.swordLengthMeters }).scalarForContact,
    ),
  );
  const inverseInertia = 1 / inertia;
  const restitution = clamp(finite(input.restitution, defaults.restitution), 0, 0.95);
  const friction = clamp(finite(input.friction, defaults.friction), 0, 1.5);
  const maximumImpulseNs = Math.max(0.1, finite(input.maximumImpulseNs, defaults.maximumImpulseNs));

  const contactPoint = vec(input.contactPoint);
  const swordCenter = vec(input.swordCenter);
  const shieldCenter = vec(input.shieldCenter);
  const normal = normalize(vec(input.contactNormal), { x: 0, y: 0, z: -1 });
  const swordRadius = sub(contactPoint, swordCenter);
  const shieldRadius = sub(contactPoint, shieldCenter);

  const swordLinearVelocity = vec(input.swordLinearVelocity);
  const swordAngularVelocity = vec(input.swordAngularVelocity);
  const shieldLinearVelocity = vec(input.shieldLinearVelocity);
  const shieldAngularVelocity = vec(input.shieldAngularVelocity);

  const swordPointVelocity = add(swordLinearVelocity, cross(swordAngularVelocity, swordRadius));
  const shieldPointVelocity = add(shieldLinearVelocity, cross(shieldAngularVelocity, shieldRadius));
  const relativeVelocity = sub(swordPointVelocity, shieldPointVelocity);
  const normalRelativeSpeed = dot(relativeVelocity, normal);

  if (normalRelativeSpeed >= 0) {
    return Object.freeze({
      stage: PHYSICAL_SHIELD_SWORD_IMPULSE_STAGE,
      applied: false,
      reason: 'separating-or-not-closing',
      normal: freezeVector(normal),
      contactPoint: freezeVector(contactPoint),
      swordPointVelocity: freezeVector(swordPointVelocity),
      shieldPointVelocity: freezeVector(shieldPointVelocity),
      relativeVelocity: freezeVector(relativeVelocity),
      normalRelativeSpeed,
      normalImpulseNs: 0,
      frictionImpulseNs: 0,
      impulse: freezeVector({ x: 0, y: 0, z: 0 }),
      deltaLinearVelocity: freezeVector({ x: 0, y: 0, z: 0 }),
      deltaAngularVelocity: freezeVector({ x: 0, y: 0, z: 0 }),
      nextSwordLinearVelocity: freezeVector(swordLinearVelocity),
      nextSwordAngularVelocity: freezeVector(swordAngularVelocity),
      angularSpeedGainRadPerSecond: 0,
    });
  }

  const rCrossN = cross(swordRadius, normal);
  const angularDenominator = inverseInertia * dot(rCrossN, rCrossN);
  const denominator = Math.max(1e-6, inverseMass + angularDenominator);
  const unclampedNormalImpulse = -(1 + restitution) * normalRelativeSpeed / denominator;
  const normalImpulseNs = clamp(unclampedNormalImpulse, 0, maximumImpulseNs);
  const normalImpulse = mul(normal, normalImpulseNs);

  const postNormalRelativeVelocity = add(relativeVelocity, mul(normalImpulse, inverseMass));
  const tangentRaw = sub(postNormalRelativeVelocity, mul(normal, dot(postNormalRelativeVelocity, normal)));
  const tangentSpeed = length(tangentRaw);
  let frictionImpulseNs = 0;
  let frictionImpulse = { x: 0, y: 0, z: 0 };
  if (tangentSpeed > 1e-6 && friction > 0) {
    const tangent = mul(tangentRaw, 1 / tangentSpeed);
    const rCrossT = cross(swordRadius, tangent);
    const tangentDenominator = Math.max(1e-6, inverseMass + inverseInertia * dot(rCrossT, rCrossT));
    const desired = tangentSpeed / tangentDenominator;
    frictionImpulseNs = Math.min(desired, friction * normalImpulseNs);
    frictionImpulse = mul(tangent, -frictionImpulseNs);
  }

  const impulse = add(normalImpulse, frictionImpulse);
  const deltaLinearVelocity = mul(impulse, inverseMass);
  const deltaAngularVelocity = mul(cross(swordRadius, impulse), inverseInertia);
  const nextSwordLinearVelocity = add(swordLinearVelocity, deltaLinearVelocity);
  const nextSwordAngularVelocity = add(swordAngularVelocity, deltaAngularVelocity);

  return Object.freeze({
    stage: PHYSICAL_SHIELD_SWORD_IMPULSE_STAGE,
    applied: true,
    reason: 'kinematic-shield-impulse-applied',
    normal: freezeVector(normal),
    contactPoint: freezeVector(contactPoint),
    swordRadius: freezeVector(swordRadius),
    shieldRadius: freezeVector(shieldRadius),
    swordPointVelocity: freezeVector(swordPointVelocity),
    shieldPointVelocity: freezeVector(shieldPointVelocity),
    relativeVelocity: freezeVector(relativeVelocity),
    normalRelativeSpeed,
    normalImpulseNs,
    frictionImpulseNs,
    impulse: freezeVector(impulse),
    deltaLinearVelocity: freezeVector(deltaLinearVelocity),
    deltaAngularVelocity: freezeVector(deltaAngularVelocity),
    nextSwordLinearVelocity: freezeVector(nextSwordLinearVelocity),
    nextSwordAngularVelocity: freezeVector(nextSwordAngularVelocity),
    angularSpeedGainRadPerSecond: length(deltaAngularVelocity),
    swordMassKg,
    swordInertiaKgM2: inertia,
    restitution,
    friction,
    authority: 'contact-relative-velocity-to-physical-sword-impulse',
  });
}

export function stepSwordRigidBodyState(state = {}, deltaSeconds = 1 / 60, overrides = {}) {
  const dt = Math.max(0, finite(deltaSeconds, 1 / 60));
  const linearDamping = Math.max(0, finite(overrides.linearDampingPerSecond, PHYSICAL_SHIELD_SWORD_IMPULSE_DEFAULTS.linearDampingPerSecond));
  const angularDamping = Math.max(0, finite(overrides.angularDampingPerSecond, PHYSICAL_SHIELD_SWORD_IMPULSE_DEFAULTS.angularDampingPerSecond));
  const linearDecay = Math.exp(-linearDamping * dt);
  const angularDecay = Math.exp(-angularDamping * dt);
  const position = add(vec(state.position), mul(vec(state.linearVelocity), dt));
  const linearVelocity = mul(vec(state.linearVelocity), linearDecay);
  const angularVelocity = mul(vec(state.angularVelocity), angularDecay);
  return Object.freeze({
    position: freezeVector(position),
    linearVelocity: freezeVector(linearVelocity),
    angularVelocity: freezeVector(angularVelocity),
  });
}
