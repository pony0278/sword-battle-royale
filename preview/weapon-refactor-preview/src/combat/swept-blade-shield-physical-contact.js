import { probeSweptSwordBucklerContact } from './swept-sword-buckler-contact.js';

export const SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE = 'G4.3B.5R.2.9.1';

export const SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_DEFAULTS = Object.freeze({
  shieldRadiusMeters: 0.42,
  shieldThicknessMeters: 0.065,
  rimBandMeters: 0.035,
  localFaceNormal: Object.freeze({ x: 0, y: -1, z: 0 }),
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

function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function mul(a, scalar) { return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function length(a) { return Math.hypot(a.x, a.y, a.z); }
function normalize(a, fallback = { x: 0, y: -1, z: 0 }) {
  const m = length(a);
  return m > 1e-10 ? mul(a, 1 / m) : { ...fallback };
}
function lerpVec(a, b, t) { return add(a, mul(sub(b, a), t)); }
function freezeVector(a) { return Object.freeze({ x: a.x, y: a.y, z: a.z }); }

function quat(input = {}) {
  const q = {
    x: finite(input.x),
    y: finite(input.y),
    z: finite(input.z),
    w: finite(input.w, 1),
  };
  const m = Math.hypot(q.x, q.y, q.z, q.w);
  if (m <= 1e-10) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: q.x / m, y: q.y / m, z: q.z / m, w: q.w / m };
}

function freezeQuat(q) {
  return Object.freeze({ x: q.x, y: q.y, z: q.z, w: q.w });
}

function conjugateQuat(q) {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function rotateVectorByQuat(v, qInput) {
  const q = quat(qInput);
  const u = { x: q.x, y: q.y, z: q.z };
  const uv = cross(u, v);
  const uuv = cross(u, uv);
  return add(v, add(mul(uv, 2 * q.w), mul(uuv, 2)));
}

function slerpQuat(aInput, bInput, tInput) {
  const t = clamp(tInput, 0, 1);
  const a = quat(aInput);
  let b = quat(bInput);
  let cosine = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  if (cosine < 0) {
    cosine = -cosine;
    b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
  }
  if (cosine > 0.9995) {
    return quat({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      w: a.w + (b.w - a.w) * t,
    });
  }
  const theta = Math.acos(clamp(cosine, -1, 1));
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return quat({
    x: a.x * wa + b.x * wb,
    y: a.y * wa + b.y * wb,
    z: a.z * wa + b.z * wb,
    w: a.w * wa + b.w * wb,
  });
}

function normalizePose(input = {}) {
  return Object.freeze({
    center: freezeVector(vec(input.center || input.position)),
    quaternion: freezeQuat(quat(input.quaternion)),
  });
}

function inverseTransformPoint(pointInput, pose) {
  const point = vec(pointInput);
  return rotateVectorByQuat(sub(point, pose.center), conjugateQuat(pose.quaternion));
}

function transformPoint(pointInput, pose) {
  return add(rotateVectorByQuat(vec(pointInput), pose.quaternion), pose.center);
}

function transformDirection(directionInput, pose) {
  return normalize(rotateVectorByQuat(vec(directionInput), pose.quaternion));
}

function samplePolylineAtFraction(polyline, fractionInput) {
  const fraction = clamp(fractionInput, 0, 1);
  const sectionCount = polyline.length - 1;
  const scaled = fraction * sectionCount;
  const index = Math.min(sectionCount - 1, Math.floor(scaled));
  const local = scaled - index;
  return lerpVec(vec(polyline[index]), vec(polyline[index + 1]), local);
}

function interpolatePose(previousPose, currentPose, alpha) {
  return Object.freeze({
    center: freezeVector(lerpVec(previousPose.center, currentPose.center, alpha)),
    quaternion: freezeQuat(slerpQuat(previousPose.quaternion, currentPose.quaternion, alpha)),
  });
}

function makeNoContact(relativeProbe, previousPose, currentPose, options) {
  return Object.freeze({
    stage: SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE,
    contact: false,
    geometricContact: false,
    reason: relativeProbe?.reason || 'no-relative-swept-contact',
    relativeProbe: relativeProbe || null,
    previousShieldPose: previousPose,
    currentShieldPose: currentPose,
    shieldRadiusMeters: options.radius,
    shieldThicknessMeters: options.thickness,
    authority: 'relative-frame-swept-blade-shield-ccd',
  });
}

export function probeSweptBladeShieldPhysicalContact(input = {}) {
  const previousBlade = Array.isArray(input.previousBlade) ? input.previousBlade.map(vec) : [];
  const currentBlade = Array.isArray(input.currentBlade) ? input.currentBlade.map(vec) : [];
  if (previousBlade.length < 2 || previousBlade.length !== currentBlade.length) {
    throw new Error(`${SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE} requires matching previous/current blade polylines`);
  }

  const previousPose = normalizePose(input.previousShieldPose || input.previousShield);
  const currentPose = normalizePose(input.currentShieldPose || input.currentShield);
  const deltaSeconds = Math.max(1e-6, finite(input.deltaSeconds, 1 / 240));
  const radius = Math.max(0.01, finite(input.shieldRadiusMeters, SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_DEFAULTS.shieldRadiusMeters));
  const thickness = Math.max(0, finite(input.shieldThicknessMeters, SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_DEFAULTS.shieldThicknessMeters));
  const rimBand = clamp(
    finite(input.rimBandMeters, SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_DEFAULTS.rimBandMeters),
    0.001,
    radius * 0.45,
  );
  const localFaceNormal = normalize(
    vec(input.localFaceNormal || SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_DEFAULTS.localFaceNormal),
    SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_DEFAULTS.localFaceNormal,
  );

  // Convert each endpoint into the shield frame that existed at that endpoint in time.
  // At a 240 Hz fixed step the resulting relative strip is a first-order CCD approximation
  // of simultaneous blade translation/rotation and shield translation/rotation.
  const previousRelativeBlade = previousBlade.map((point) => inverseTransformPoint(point, previousPose));
  const currentRelativeBlade = currentBlade.map((point) => inverseTransformPoint(point, currentPose));

  const relativeProbe = probeSweptSwordBucklerContact({
    previousBlade: previousRelativeBlade,
    currentBlade: currentRelativeBlade,
    bucklerSurface: {
      center: { x: 0, y: 0, z: 0 },
      normal: localFaceNormal,
      radius,
      thickness,
    },
    deltaSeconds,
    active: input.active !== false,
  });

  if (!relativeProbe.geometricContact) {
    return makeNoContact(relativeProbe, previousPose, currentPose, { radius, thickness });
  }

  const alpha = clamp(relativeProbe.sweepAlpha, 0, 1);
  const bladeFraction = clamp(relativeProbe.bladeFraction, 0, 1);
  const impactPose = interpolatePose(previousPose, currentPose, alpha);
  const centerPlanePointLocal = vec(relativeProbe.point);
  const contactPointLocal = add(centerPlanePointLocal, mul(localFaceNormal, finite(relativeProbe.signedDistance)));
  const contactPointWorld = transformPoint(contactPointLocal, impactPose);

  const radialLocal = sub(contactPointLocal, mul(localFaceNormal, dot(contactPointLocal, localFaceNormal)));
  const radialDistance = length(radialLocal);
  const rimStart = Math.max(0, radius - rimBand);
  const rimWeight = clamp((radialDistance - rimStart) / rimBand, 0, 1);
  const contactFeature = rimWeight > 0.001 ? 'RIM' : 'FACE';
  const radialOut = normalize(radialLocal, { x: 1, y: 0, z: 0 });
  const contactNormalLocal = contactFeature === 'RIM'
    ? normalize(add(mul(localFaceNormal, 1 - 0.55 * rimWeight), mul(radialOut, 0.85 * rimWeight)), localFaceNormal)
    : localFaceNormal;
  const contactNormalWorld = transformDirection(contactNormalLocal, impactPose);

  const previousBladePointLocal = samplePolylineAtFraction(previousRelativeBlade, bladeFraction);
  const currentBladePointLocal = samplePolylineAtFraction(currentRelativeBlade, bladeFraction);
  const relativePointMotion = sub(currentBladePointLocal, previousBladePointLocal);
  const relativePointVelocity = mul(relativePointMotion, 1 / deltaSeconds);

  return Object.freeze({
    stage: SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE,
    contact: input.active !== false,
    geometricContact: true,
    reason: input.active === false ? 'relative-swept-contact-outside-active-window' : 'earliest-relative-swept-contact',
    mode: relativeProbe.mode,
    sweepAlpha: alpha,
    timeOfImpactSeconds: alpha * deltaSeconds,
    bladeFraction,
    contactFeature,
    rimWeight,
    point: freezeVector(contactPointWorld),
    localPoint: freezeVector(contactPointLocal),
    normal: freezeVector(contactNormalWorld),
    localNormal: freezeVector(contactNormalLocal),
    radialDistance,
    surfaceSignedDistanceMeters: finite(relativeProbe.signedDistance),
    relativePointVelocity: freezeVector(relativePointVelocity),
    impactShieldPose: impactPose,
    previousShieldPose: previousPose,
    currentShieldPose: currentPose,
    relativeProbe,
    diagnostics: Object.freeze({
      fixedStepSeconds: deltaSeconds,
      relativeFrame: true,
      previousRelativeBladePoint: freezeVector(previousBladePointLocal),
      currentRelativeBladePoint: freezeVector(currentBladePointLocal),
      faceNormalLocal: freezeVector(localFaceNormal),
      rimBandMeters: rimBand,
      authority: 'earliest-toi-before-impulse-solve',
    }),
    authority: 'relative-frame-swept-blade-shield-ccd',
  });
}
