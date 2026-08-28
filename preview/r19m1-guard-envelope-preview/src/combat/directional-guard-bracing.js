import { predictGuardThreat } from './guard-threat-tracking.js';

export const DIRECTIONAL_GUARD_BRACING_STAGE = 'G4.3A.2';
export const DIRECTIONAL_GUARD_BRACING_MODES = Object.freeze(['off', 'brace', 'brace-fine']);

export const DIRECTIONAL_GUARD_BRACING_PROFILE = Object.freeze({
  predictionHorizonSeconds: 0.14,
  threatSamples: 14,
  lowStartMeters: 0.07,
  lowFullMeters: 0.24,
  overheadStartVerticalRatio: 0.24,
  overheadFullVerticalRatio: 0.72,
  maxCrouchMeters: 0.08,
  overheadCrouchMeters: 0.018,
  maxChestYawDegrees: 6,
  maxChestPitchDegrees: 4,
  maxShoulderLiftMeters: 0.055,
  maxShoulderBraceDegrees: 8,
  maxForearmBraceDegrees: 6,
  maxThighBendDegrees: 8,
  maxKneeBendDegrees: 14,
  fineTrackMaxMeters: 0.07,
  fineComfortRadiusRatio: 0.86,
  responsePerSecond: 11,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, finite(value))); }
function clamp01(value) { return clamp(value, 0, 1); }
function smoothstep(edge0, edge1, value) {
  const t = clamp01((finite(value) - edge0) / Math.max(1e-9, edge1 - edge0));
  return t * t * (3 - 2 * t);
}
function vec(input = {}) { return { x: finite(input.x), y: finite(input.y), z: finite(input.z) }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function mul(a, scalar) { return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar }; }
function length(a) { return Math.hypot(a.x, a.y, a.z); }
function normalize(a) {
  const magnitude = length(a);
  return magnitude > 1e-9 ? mul(a, 1 / magnitude) : { x: 0, y: 0, z: 0 };
}
function freezeVector(value) { return Object.freeze({ x: value.x, y: value.y, z: value.z }); }
function normalizePolyline(input = {}) {
  const points = input.points || input;
  if (!Array.isArray(points) || points.length < 2) throw new Error('G4.3A.2 blade polyline requires at least two points');
  return points.map((point) => vec(point));
}
function samplePolyline(polyline, fraction) {
  const clamped = clamp01(fraction);
  const sections = polyline.length - 1;
  const scaled = clamped * sections;
  const index = Math.min(sections - 1, Math.floor(scaled));
  const t = scaled - index;
  return add(polyline[index], mul(sub(polyline[index + 1], polyline[index]), t));
}
function normalizeSurface(surface = {}) {
  return Object.freeze({
    center: freezeVector(vec(surface.center)),
    normal: freezeVector(normalize(vec(surface.normal))),
    radius: Math.max(1e-6, finite(surface.radius)),
    thickness: Math.max(0, finite(surface.thickness)),
  });
}

export function analyzeDirectionalGuardThreat(input = {}) {
  const previous = normalizePolyline(input.previousBlade);
  const current = normalizePolyline(input.currentBlade);
  if (previous.length !== current.length) throw new Error('G4.3A.2 previous/current blade polylines must match');
  const surface = normalizeSurface(input.bucklerSurface);
  const deltaSeconds = Math.max(1e-5, finite(input.deltaSeconds, 1 / 60));
  const threat = input.threat || predictGuardThreat({
    previousBlade: previous,
    currentBlade: current,
    bucklerSurface: surface,
    deltaSeconds,
    horizonSeconds: finite(input.horizonSeconds, DIRECTIONAL_GUARD_BRACING_PROFILE.predictionHorizonSeconds),
    timeSamples: finite(input.timeSamples, DIRECTIONAL_GUARD_BRACING_PROFILE.threatSamples),
  });
  if (!threat) return null;

  const bladeFraction = clamp01(threat.bladeFraction);
  const previousAtThreat = samplePolyline(previous, bladeFraction);
  const currentAtThreat = samplePolyline(current, bladeFraction);
  const incomingVelocity = mul(sub(currentAtThreat, previousAtThreat), 1 / deltaSeconds);
  const speed = length(incomingVelocity);
  const incomingDirection = normalize(incomingVelocity);
  const relativeHeight = threat.point.y - surface.center.y;
  const relativeSide = threat.point.x - surface.center.x;
  const lowWeight = smoothstep(
    DIRECTIONAL_GUARD_BRACING_PROFILE.lowStartMeters,
    DIRECTIONAL_GUARD_BRACING_PROFILE.lowFullMeters,
    Math.max(0, -relativeHeight),
  );
  const downwardRatio = speed > 1e-6 ? Math.max(0, -incomingVelocity.y / speed) : 0;
  const overheadWeight = smoothstep(
    DIRECTIONAL_GUARD_BRACING_PROFILE.overheadStartVerticalRatio,
    DIRECTIONAL_GUARD_BRACING_PROFILE.overheadFullVerticalRatio,
    downwardRatio,
  ) * (1 - lowWeight * 0.8);

  const attackDirection = String(input.attackDirection || '').toLowerCase();
  let lateralSign = 0;
  if (attackDirection === 'left') lateralSign = -1;
  else if (attackDirection === 'right') lateralSign = 1;
  else if (Math.abs(relativeSide) > 0.03) lateralSign = Math.sign(relativeSide);
  const lateralWeight = clamp01(
    Math.max(Math.abs(relativeSide) / Math.max(surface.radius, 1e-6), lateralSign ? 0.35 : 0)
    * (1 - overheadWeight * 0.5),
  );

  const strategy = lowWeight >= 0.42
    ? 'low-crouch'
    : overheadWeight >= 0.38
      ? 'overhead-brace'
      : 'lateral-brace';

  return Object.freeze({
    stage: DIRECTIONAL_GUARD_BRACING_STAGE,
    attackDirection,
    threat,
    surface,
    incomingVelocity: freezeVector(incomingVelocity),
    incomingDirection: freezeVector(incomingDirection),
    speed,
    relativeHeight,
    relativeSide,
    downwardRatio,
    lowWeight,
    overheadWeight,
    lateralWeight,
    lateralSign,
    strategy,
  });
}

export function planDirectionalGuardBracing(input = {}) {
  const mode = String(input.mode || 'brace-fine').toLowerCase();
  if (!DIRECTIONAL_GUARD_BRACING_MODES.includes(mode)) throw new Error(`Unknown G4.3A.2 bracing mode: ${mode}`);
  if (mode === 'off') {
    return Object.freeze({
      stage: DIRECTIONAL_GUARD_BRACING_STAGE,
      mode,
      strategy: 'authored-guard',
      analysis: null,
      body: Object.freeze({
        crouchMeters: 0,
        chestYawDegrees: 0,
        chestPitchDegrees: 0,
        shoulderLiftMeters: 0,
        shoulderBraceDegrees: 0,
        forearmBraceDegrees: 0,
        thighBendDegrees: 0,
        kneeBendDegrees: 0,
      }),
      fineTrackMaxMeters: 0,
      authority: 'presentation-probe-only',
    });
  }

  const analysis = input.analysis || analyzeDirectionalGuardThreat(input);
  if (!analysis) return null;
  const profile = DIRECTIONAL_GUARD_BRACING_PROFILE;
  const low = analysis.lowWeight;
  const overhead = analysis.overheadWeight;
  const lateral = analysis.lateralWeight;
  const side = analysis.lateralSign;

  return Object.freeze({
    stage: DIRECTIONAL_GUARD_BRACING_STAGE,
    mode,
    strategy: analysis.strategy,
    analysis,
    body: Object.freeze({
      crouchMeters: clamp(low * profile.maxCrouchMeters + overhead * profile.overheadCrouchMeters, 0, profile.maxCrouchMeters),
      chestYawDegrees: side * profile.maxChestYawDegrees * lateral,
      chestPitchDegrees: profile.maxChestPitchDegrees * (overhead * 0.75 - low * 0.35),
      shoulderLiftMeters: profile.maxShoulderLiftMeters * overhead * (1 - low * 0.75),
      shoulderBraceDegrees: profile.maxShoulderBraceDegrees * Math.max(overhead, lateral * 0.45),
      forearmBraceDegrees: profile.maxForearmBraceDegrees * Math.max(overhead * 0.75, lateral * 0.35),
      thighBendDegrees: profile.maxThighBendDegrees * low,
      kneeBendDegrees: profile.maxKneeBendDegrees * low,
    }),
    fineTrackMaxMeters: mode === 'brace-fine' ? profile.fineTrackMaxMeters : 0,
    authority: 'presentation-probe-only',
  });
}

export function planFineGuardTracking(input = {}) {
  const surface = normalizeSurface(input.bucklerSurface);
  const threat = input.threat;
  const maxCorrectionMeters = Math.max(0, finite(input.maxCorrectionMeters, DIRECTIONAL_GUARD_BRACING_PROFILE.fineTrackMaxMeters));
  if (!threat || maxCorrectionMeters <= 0) {
    return Object.freeze({
      mode: 'off',
      correction: freezeVector({ x: 0, y: 0, z: 0 }),
      targetCenter: surface.center,
      requiredDistance: 0,
      appliedDistance: 0,
      reachable: true,
      reason: 'fine-tracking-disabled',
    });
  }
  const comfortRadius = surface.radius * clamp(
    finite(input.comfortRadiusRatio, DIRECTIONAL_GUARD_BRACING_PROFILE.fineComfortRadiusRatio),
    0.5,
    1,
  );
  const radial = sub(threat.point, surface.center);
  const requiredDistance = Math.max(0, length(radial) - comfortRadius);
  const appliedDistance = Math.min(requiredDistance, maxCorrectionMeters);
  const correction = mul(normalize(radial), appliedDistance);
  return Object.freeze({
    mode: 'guard',
    threat,
    correction: freezeVector(correction),
    targetCenter: freezeVector(add(surface.center, correction)),
    comfortRadius,
    requiredDistance,
    appliedDistance,
    reachable: requiredDistance <= maxCorrectionMeters + 1e-6,
    reason: requiredDistance <= 1e-6
      ? 'already-covered'
      : requiredDistance <= maxCorrectionMeters + 1e-6
        ? 'fine-track-within-reach'
        : 'fine-track-clamped',
  });
}

function applyLocalAxisAngle(THREE, bone, axis, degrees) {
  if (!bone || Math.abs(degrees) < 1e-5) return;
  const delta = new THREE.Quaternion();
  delta.setFromAxisAngle(axis, degrees * Math.PI / 180);
  bone.quaternion.multiply(delta).normalize();
}

function aimEffectorWithBone(THREE, bone, effectorWorld, targetWorld, maxDegrees) {
  if (!bone || maxDegrees <= 0) return 0;
  const boneWorld = new THREE.Vector3();
  bone.getWorldPosition(boneWorld);
  const currentDirection = effectorWorld.clone().sub(boneWorld);
  const targetDirection = targetWorld.clone().sub(boneWorld);
  if (currentDirection.lengthSq() < 1e-10 || targetDirection.lengthSq() < 1e-10) return 0;
  currentDirection.normalize();
  targetDirection.normalize();
  const desiredWorldDelta = new THREE.Quaternion().setFromUnitVectors(currentDirection, targetDirection);
  const rawAngle = 2 * Math.acos(clamp(Math.abs(desiredWorldDelta.w), -1, 1));
  if (rawAngle < 1e-6) return 0;
  const appliedAngle = Math.min(rawAngle, maxDegrees * Math.PI / 180);
  const limitedWorldDelta = new THREE.Quaternion();
  limitedWorldDelta.slerpQuaternions(new THREE.Quaternion(), desiredWorldDelta, appliedAngle / rawAngle);
  const parentWorld = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentWorld);
  const localDelta = parentWorld.clone().invert().multiply(limitedWorldDelta).multiply(parentWorld);
  bone.quaternion.premultiply(localDelta).normalize();
  return appliedAngle * 180 / Math.PI;
}

export function createDirectionalGuardBracingRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) throw new Error('G4.3A.2 requires THREE.Vector3 + Quaternion');
  const rig = options.rig;
  const buckler = options.buckler;
  const required = ['hips', 'chest', 'upperarm.l', 'lowerarm.l', 'upperleg.l', 'upperleg.r', 'lowerleg.l', 'lowerleg.r'];
  const missing = required.filter((id) => !rig?.bones?.[id]);
  if (missing.length) throw new Error(`G4.3A.2 missing bracing bones: ${missing.join(', ')}`);
  if (!buckler?.getWorldParrySurface) throw new Error('G4.3A.2 requires Buckler parry surface');

  const current = {
    crouchMeters: 0,
    chestYawDegrees: 0,
    chestPitchDegrees: 0,
    shoulderLiftMeters: 0,
    shoulderBraceDegrees: 0,
    forearmBraceDegrees: 0,
    thighBendDegrees: 0,
    kneeBendDegrees: 0,
  };
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);
  const effector = new THREE.Vector3();
  const target = new THREE.Vector3();
  const upShift = new THREE.Vector3();

  function update(plan, deltaSeconds = 1 / 60) {
    const desired = plan?.body || {};
    const dt = Math.max(1e-5, finite(deltaSeconds, 1 / 60));
    const alpha = 1 - Math.exp(-DIRECTIONAL_GUARD_BRACING_PROFILE.responsePerSecond * dt);
    for (const key of Object.keys(current)) current[key] += (finite(desired[key]) - current[key]) * alpha;

    rig.bones.hips.position.y -= current.crouchMeters;
    applyLocalAxisAngle(THREE, rig.bones.chest, axisY, current.chestYawDegrees);
    applyLocalAxisAngle(THREE, rig.bones.chest, axisX, current.chestPitchDegrees);
    applyLocalAxisAngle(THREE, rig.bones['upperleg.l'], axisX, current.thighBendDegrees);
    applyLocalAxisAngle(THREE, rig.bones['upperleg.r'], axisX, current.thighBendDegrees);
    applyLocalAxisAngle(THREE, rig.bones['lowerleg.l'], axisX, -current.kneeBendDegrees);
    applyLocalAxisAngle(THREE, rig.bones['lowerleg.r'], axisX, -current.kneeBendDegrees);
    rig.root?.updateMatrixWorld?.(true);

    let shoulderAppliedDegrees = 0;
    let forearmAppliedDegrees = 0;
    if (current.shoulderLiftMeters > 1e-5) {
      let surface = buckler.getWorldParrySurface();
      effector.set(surface.center.x, surface.center.y, surface.center.z);
      upShift.set(0, current.shoulderLiftMeters, 0);
      target.copy(effector).add(upShift);
      shoulderAppliedDegrees = aimEffectorWithBone(
        THREE,
        rig.bones['upperarm.l'],
        effector,
        target,
        Math.min(current.shoulderBraceDegrees, DIRECTIONAL_GUARD_BRACING_PROFILE.maxShoulderBraceDegrees),
      );
      rig.root?.updateMatrixWorld?.(true);
      surface = buckler.getWorldParrySurface();
      effector.set(surface.center.x, surface.center.y, surface.center.z);
      upShift.set(0, current.shoulderLiftMeters * 0.45, 0);
      target.copy(effector).add(upShift);
      forearmAppliedDegrees = aimEffectorWithBone(
        THREE,
        rig.bones['lowerarm.l'],
        effector,
        target,
        Math.min(current.forearmBraceDegrees, DIRECTIONAL_GUARD_BRACING_PROFILE.maxForearmBraceDegrees),
      );
      rig.root?.updateMatrixWorld?.(true);
    }

    return Object.freeze({
      stage: DIRECTIONAL_GUARD_BRACING_STAGE,
      strategy: plan?.strategy || 'authored-guard',
      current: Object.freeze({ ...current }),
      shoulderAppliedDegrees,
      forearmAppliedDegrees,
      surface: buckler.getWorldParrySurface(),
      authority: 'presentation-probe-only',
    });
  }

  function reset() { Object.keys(current).forEach((key) => { current[key] = 0; }); }
  return Object.freeze({ update, reset, get current() { return Object.freeze({ ...current }); } });
}
