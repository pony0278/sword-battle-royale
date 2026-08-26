export const GUARD_THREAT_TRACKING_STAGE = 'G4.3A.1';
export const GUARD_THREAT_RESIDUAL_REFINEMENT_STAGE = 'G4.3B.5R.3.5';
export const GUARD_THREAT_TRACKING_MODES = Object.freeze(['off', 'guard', 'parry']);

export const GUARD_THREAT_TRACKING_PROFILES = Object.freeze({
  off: Object.freeze({
    mode: 'off', horizonSeconds: 0, maxCorrectionMeters: 0, comfortRadiusRatio: 1,
    maxTrackingSpeedMps: 0, returnSpeedMps: 1.2, upperArmMaxDegrees: 0, lowerArmMaxDegrees: 0,
  }),
  guard: Object.freeze({
    mode: 'guard', horizonSeconds: 0.11, maxCorrectionMeters: 0.12, comfortRadiusRatio: 0.82,
    maxTrackingSpeedMps: 0.85, returnSpeedMps: 1.0, upperArmMaxDegrees: 8, lowerArmMaxDegrees: 10,
  }),
  parry: Object.freeze({
    mode: 'parry', horizonSeconds: 0.14, maxCorrectionMeters: 0.18, comfortRadiusRatio: 0.60,
    maxTrackingSpeedMps: 1.6, returnSpeedMps: 1.4, upperArmMaxDegrees: 20, lowerArmMaxDegrees: 26,
  }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, finite(value))); }
function clamp01(value) { return clamp(value, 0, 1); }
function vec(input = {}) { return { x: finite(input.x), y: finite(input.y), z: finite(input.z) }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function length(a) { return Math.hypot(a.x, a.y, a.z); }
function normalize(a) { const m = length(a); return m > 1e-9 ? mul(a, 1 / m) : { x: 0, y: 0, z: 0 }; }
function lerp(a, b, t) { return add(a, mul(sub(b, a), t)); }
function freezeVector(v) { return Object.freeze({ x: v.x, y: v.y, z: v.z }); }

function normalizeSwordSweepPolyline(input = {}) {
  const points = input.points || input;
  if (!Array.isArray(points) || points.length < 2) throw new Error('G4.3A.1 sword polyline requires at least two points');
  return points.map((point) => vec(point));
}
function normalizeBucklerParrySurface(surface = {}) {
  const radius = Math.max(0, finite(surface.radius));
  if (!(radius > 0)) throw new Error('G4.3A.1 Buckler radius must be positive');
  return Object.freeze({
    center: freezeVector(vec(surface.center)),
    normal: freezeVector(normalize(vec(surface.normal))),
    radius,
    thickness: Math.max(0, finite(surface.thickness)),
  });
}

function closestPointOnSegment(point, a, b) {
  const ab = sub(b, a);
  const denom = dot(ab, ab);
  const u = denom > 1e-12 ? clamp01(dot(sub(point, a), ab) / denom) : 0;
  return { point: lerp(a, b, u), u };
}

function projectToPlane(point, center, normal) {
  const signedDistance = dot(sub(point, center), normal);
  return { point: sub(point, mul(normal, signedDistance)), signedDistance };
}

export function getGuardThreatTrackingProfile(mode = 'guard') {
  const key = String(mode || 'guard').toLowerCase();
  const profile = GUARD_THREAT_TRACKING_PROFILES[key];
  if (!profile) throw new Error(`Unknown Guard threat tracking mode: ${mode}`);
  return profile;
}

export function predictGuardThreat(input = {}) {
  const previous = normalizeSwordSweepPolyline(input.previousBlade);
  const current = normalizeSwordSweepPolyline(input.currentBlade);
  if (previous.length !== current.length) throw new Error('G4.3A.1 previous/current blade polylines must match');
  const surface = normalizeBucklerParrySurface(input.bucklerSurface);
  const deltaSeconds = Math.max(1e-5, finite(input.deltaSeconds, 1 / 60));
  const horizonSeconds = Math.max(0, finite(input.horizonSeconds, 0.11));
  const timeSamples = Math.max(2, Math.round(finite(input.timeSamples, 12)));
  const velocities = current.map((point, index) => mul(sub(point, previous[index]), 1 / deltaSeconds));

  let best = null;
  for (let sample = 0; sample <= timeSamples; sample += 1) {
    const timeAlpha = sample / timeSamples;
    const futureSeconds = horizonSeconds * timeAlpha;
    const blade = current.map((point, index) => add(point, mul(velocities[index], futureSeconds)));
    for (let sectionIndex = 0; sectionIndex < blade.length - 1; sectionIndex += 1) {
      const projectedA = projectToPlane(blade[sectionIndex], surface.center, surface.normal).point;
      const projectedB = projectToPlane(blade[sectionIndex + 1], surface.center, surface.normal).point;
      const closestProjected = closestPointOnSegment(surface.center, projectedA, projectedB);
      const worldPoint = lerp(blade[sectionIndex], blade[sectionIndex + 1], closestProjected.u);
      const projection = projectToPlane(worldPoint, surface.center, surface.normal);
      const radial = length(sub(projection.point, surface.center));
      const planeDistance = Math.abs(projection.signedDistance);
      const outsideDisc = Math.max(0, radial - surface.radius);
      const score = planeDistance + outsideDisc * 0.65 + futureSeconds * 0.03;
      const bladeFraction = (sectionIndex + closestProjected.u) / (blade.length - 1);
      const candidate = {
        point: projection.point,
        worldPoint,
        signedDistance: projection.signedDistance,
        radialDistance: radial,
        planeDistance,
        outsideDisc,
        futureSeconds,
        timeAlpha,
        bladeFraction,
        score,
      };
      if (!best || score < best.score) best = candidate;
    }
  }

  if (!best) return null;
  return Object.freeze({
    stage: GUARD_THREAT_TRACKING_STAGE,
    point: freezeVector(best.point),
    worldPoint: freezeVector(best.worldPoint),
    signedDistance: best.signedDistance,
    radialDistance: best.radialDistance,
    outsideDisc: best.outsideDisc,
    futureSeconds: best.futureSeconds,
    timeAlpha: best.timeAlpha,
    bladeFraction: best.bladeFraction,
    score: best.score,
    surface,
  });
}

export function planGuardThreatCorrection(input = {}) {
  const profile = getGuardThreatTrackingProfile(input.mode || 'guard');
  const surface = normalizeBucklerParrySurface(input.bucklerSurface);
  if (profile.mode === 'off') {
    return Object.freeze({
      stage: GUARD_THREAT_TRACKING_STAGE, mode: 'off', profile, threat: null,
      reachable: true, requiredDistance: 0, appliedDistance: 0,
      correction: freezeVector({ x: 0, y: 0, z: 0 }), targetCenter: surface.center,
      reason: 'tracking-disabled',
    });
  }

  const threat = input.threat || predictGuardThreat({
    previousBlade: input.previousBlade,
    currentBlade: input.currentBlade,
    bucklerSurface: surface,
    deltaSeconds: input.deltaSeconds,
    horizonSeconds: profile.horizonSeconds,
    timeSamples: input.timeSamples,
  });
  if (!threat) return null;

  const radialVector = sub(threat.point, surface.center);
  const radialDistance = length(radialVector);
  const comfortRadius = surface.radius * profile.comfortRadiusRatio;
  const requiredDistance = Math.max(0, radialDistance - comfortRadius);
  const correctionDirection = normalize(radialVector);
  const appliedDistance = Math.min(requiredDistance, profile.maxCorrectionMeters);
  const correction = mul(correctionDirection, appliedDistance);
  const reachable = requiredDistance <= profile.maxCorrectionMeters + 1e-6;

  return Object.freeze({
    stage: GUARD_THREAT_TRACKING_STAGE,
    mode: profile.mode,
    profile,
    threat,
    reachable,
    comfortRadius,
    requiredDistance,
    appliedDistance,
    correction: freezeVector(correction),
    targetCenter: freezeVector(add(surface.center, correction)),
    reason: requiredDistance <= 1e-6 ? 'already-covered' : reachable ? 'within-tracking-reach' : 'out-of-tracking-reach',
  });
}

function setWorldDirectionDelta(THREE, bone, effectorWorld, targetWorld, maxDegrees) {
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
  const maxRadians = Math.max(0, finite(maxDegrees)) * Math.PI / 180;
  const appliedAngle = Math.min(rawAngle, maxRadians);
  // Three.js r128 mutates the target Quaternion but does not return `this` here.
  // Keep the instance explicitly so callers never multiply by an undefined chain result.
  const limitedWorldDelta = new THREE.Quaternion();
  limitedWorldDelta.slerpQuaternions(
    new THREE.Quaternion(), desiredWorldDelta, appliedAngle / rawAngle,
  );
  const parentWorld = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentWorld);
  const localDelta = parentWorld.clone().invert().multiply(limitedWorldDelta).multiply(parentWorld);
  bone.quaternion.premultiply(localDelta).normalize();
  bone.updateMatrixWorld(true);
  return appliedAngle * 180 / Math.PI;
}

export function createGuardThreatTrackingRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) throw new Error('G4.3A.1 tracking runtime requires THREE.Vector3 + Quaternion');
  const rig = options.rig;
  const buckler = options.buckler;
  if (!rig?.bones?.['upperarm.l'] || !rig?.bones?.['lowerarm.l']) throw new Error('G4.3A.1 requires left-arm rig bones');
  if (!buckler?.getWorldParrySurface) throw new Error('G4.3A.1 requires Buckler parry surface');
  const currentOffset = new THREE.Vector3();
  const residualOffset = new THREE.Vector3();
  const combinedOffset = new THREE.Vector3();
  const desiredOffset = new THREE.Vector3();
  const deltaOffset = new THREE.Vector3();
  const residualBeforeOffset = new THREE.Vector3();
  const residualDeltaOffset = new THREE.Vector3();
  const targetCenter = new THREE.Vector3();
  const effector = new THREE.Vector3();

  function constrainResidualOffset(profile, maxResidualMeters = 0.06) {
    const residualLimit = Math.min(
      Math.max(0, finite(maxResidualMeters, 0.06)),
      Math.max(0, profile.maxCorrectionMeters),
    );
    if (residualOffset.length() > residualLimit) residualOffset.setLength(residualLimit);
    combinedOffset.copy(currentOffset).add(residualOffset);
    if (combinedOffset.length() > profile.maxCorrectionMeters && profile.maxCorrectionMeters > 0) {
      combinedOffset.setLength(profile.maxCorrectionMeters);
      residualOffset.copy(combinedOffset).sub(currentOffset);
    }
    if (!(profile.maxCorrectionMeters > 0)) {
      residualOffset.set(0, 0, 0);
      combinedOffset.copy(currentOffset);
    }
    return residualLimit;
  }

  function update(plan, deltaSeconds = 1 / 60) {
    const mode = plan?.mode || 'off';
    const profile = getGuardThreatTrackingProfile(mode);
    const dt = Math.max(1e-5, finite(deltaSeconds, 1 / 60));
    desiredOffset.set(
      finite(plan?.correction?.x), finite(plan?.correction?.y), finite(plan?.correction?.z),
    );
    deltaOffset.copy(desiredOffset).sub(currentOffset);
    const speed = desiredOffset.lengthSq() > 1e-10 ? profile.maxTrackingSpeedMps : profile.returnSpeedMps;
    const maxStep = Math.max(0, speed) * dt;
    if (deltaOffset.length() > maxStep && maxStep > 0) deltaOffset.setLength(maxStep);
    currentOffset.add(deltaOffset);
    if (mode !== 'parry') residualOffset.set(0, 0, 0);
    constrainResidualOffset(profile);

    const baselineSurface = buckler.getWorldParrySurface();
    targetCenter.set(baselineSurface.center.x, baselineSurface.center.y, baselineSurface.center.z).add(combinedOffset);
    const appliedDegrees = { 'upperarm.l': 0, 'lowerarm.l': 0 };

    if (combinedOffset.lengthSq() > 1e-10) {
      for (let iteration = 0; iteration < 2; iteration += 1) {
        const surface = buckler.getWorldParrySurface();
        effector.set(surface.center.x, surface.center.y, surface.center.z);
        const lowerRemaining = Math.max(0, profile.lowerArmMaxDegrees - appliedDegrees['lowerarm.l']);
        appliedDegrees['lowerarm.l'] += setWorldDirectionDelta(
          THREE, rig.bones['lowerarm.l'], effector, targetCenter, lowerRemaining,
        );
        rig.root?.updateMatrixWorld?.(true);
        const surfaceAfterLower = buckler.getWorldParrySurface();
        effector.set(surfaceAfterLower.center.x, surfaceAfterLower.center.y, surfaceAfterLower.center.z);
        const upperRemaining = Math.max(0, profile.upperArmMaxDegrees - appliedDegrees['upperarm.l']);
        appliedDegrees['upperarm.l'] += setWorldDirectionDelta(
          THREE, rig.bones['upperarm.l'], effector, targetCenter, upperRemaining,
        );
        rig.root?.updateMatrixWorld?.(true);
      }
    }

    const finalSurface = buckler.getWorldParrySurface();
    const achieved = new THREE.Vector3(
      finalSurface.center.x - baselineSurface.center.x,
      finalSurface.center.y - baselineSurface.center.y,
      finalSurface.center.z - baselineSurface.center.z,
    );
    return Object.freeze({
      stage: GUARD_THREAT_TRACKING_STAGE,
      mode,
      requestedOffset: freezeVector({ x: currentOffset.x, y: currentOffset.y, z: currentOffset.z }),
      carriedResidualOffset: freezeVector({ x: residualOffset.x, y: residualOffset.y, z: residualOffset.z }),
      combinedRequestedOffset: freezeVector({ x: combinedOffset.x, y: combinedOffset.y, z: combinedOffset.z }),
      achievedOffset: freezeVector({ x: achieved.x, y: achieved.y, z: achieved.z }),
      achievedDistance: achieved.length(),
      appliedDegrees: Object.freeze({ ...appliedDegrees }),
      surface: finalSurface,
    });
  }

  function refineWorldTarget(targetInput = {}, refinementOptions = {}) {
    const profile = getGuardThreatTrackingProfile('parry');
    const baselineSurface = buckler.getWorldParrySurface();
    targetCenter.set(
      finite(targetInput?.x, baselineSurface.center.x),
      finite(targetInput?.y, baselineSurface.center.y),
      finite(targetInput?.z, baselineSurface.center.z),
    );
    const jointBudgetScale = clamp(finite(refinementOptions.jointBudgetScale, 0.35), 0, 1);
    const iterations = Math.max(1, Math.min(4, Math.round(finite(refinementOptions.iterations, 2))));
    const appliedDegrees = { 'upperarm.l': 0, 'lowerarm.l': 0 };
    const beforeErrorMeters = Math.hypot(
      targetCenter.x - finite(baselineSurface.center?.x),
      targetCenter.y - finite(baselineSurface.center?.y),
      targetCenter.z - finite(baselineSurface.center?.z),
    );

    if (beforeErrorMeters > 1e-6) {
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        const surface = buckler.getWorldParrySurface();
        effector.set(surface.center.x, surface.center.y, surface.center.z);
        const lowerBudget = profile.lowerArmMaxDegrees * jointBudgetScale;
        const lowerRemaining = Math.max(0, lowerBudget - appliedDegrees['lowerarm.l']);
        appliedDegrees['lowerarm.l'] += setWorldDirectionDelta(
          THREE, rig.bones['lowerarm.l'], effector, targetCenter, lowerRemaining,
        );
        rig.root?.updateMatrixWorld?.(true);
        const surfaceAfterLower = buckler.getWorldParrySurface();
        effector.set(surfaceAfterLower.center.x, surfaceAfterLower.center.y, surfaceAfterLower.center.z);
        const upperBudget = profile.upperArmMaxDegrees * jointBudgetScale;
        const upperRemaining = Math.max(0, upperBudget - appliedDegrees['upperarm.l']);
        appliedDegrees['upperarm.l'] += setWorldDirectionDelta(
          THREE, rig.bones['upperarm.l'], effector, targetCenter, upperRemaining,
        );
        rig.root?.updateMatrixWorld?.(true);
      }
    }

    const finalSurface = buckler.getWorldParrySurface();
    const achieved = new THREE.Vector3(
      finalSurface.center.x - baselineSurface.center.x,
      finalSurface.center.y - baselineSurface.center.y,
      finalSurface.center.z - baselineSurface.center.z,
    );
    const afterErrorMeters = Math.hypot(
      targetCenter.x - finite(finalSurface.center?.x),
      targetCenter.y - finite(finalSurface.center?.y),
      targetCenter.z - finite(finalSurface.center?.z),
    );
    return Object.freeze({
      stage: GUARD_THREAT_RESIDUAL_REFINEMENT_STAGE,
      mode: 'active-intercept-world-target-closure',
      active: beforeErrorMeters > 1e-6,
      targetCenter: freezeVector({ x: targetCenter.x, y: targetCenter.y, z: targetCenter.z }),
      targetErrorBeforeMeters: beforeErrorMeters,
      targetErrorAfterMeters: afterErrorMeters,
      targetErrorReductionMeters: beforeErrorMeters - afterErrorMeters,
      achievedOffset: freezeVector({ x: achieved.x, y: achieved.y, z: achieved.z }),
      achievedDistance: achieved.length(),
      appliedDegrees: Object.freeze({ ...appliedDegrees }),
      jointBudgetScale,
      iterations,
      surface: finalSurface,
      persistentCarryModified: false,
      authority: 'fixed-world-target-arm-closure-no-persistent-carry-no-contact-authority',
    });
  }

  function refineMeasuredContact(plan, deltaSeconds = 1 / 60, refinementOptions = {}) {
    const mode = plan?.mode || 'off';
    const profile = getGuardThreatTrackingProfile(mode);
    const dt = Math.max(1e-5, finite(deltaSeconds, 1 / 60));
    const speedScale = Math.max(0, finite(refinementOptions.speedScale, 1));
    const jointBudgetScale = clamp(finite(refinementOptions.jointBudgetScale, 0.35), 0, 1);
    const iterations = Math.max(1, Math.min(4, Math.round(finite(refinementOptions.iterations, 2))));
    const baselineSurface = buckler.getWorldParrySurface();
    desiredOffset.set(
      finite(plan?.correction?.x), finite(plan?.correction?.y), finite(plan?.correction?.z),
    );
    const requestedResidualDistance = desiredOffset.length();
    const defaultMaxStep = profile.maxTrackingSpeedMps * dt * speedScale;
    const maxStep = Math.max(0, finite(refinementOptions.maxStepMeters, defaultMaxStep));
    if (desiredOffset.length() > maxStep && maxStep > 0) desiredOffset.setLength(maxStep);
    if (!(maxStep > 0)) desiredOffset.set(0, 0, 0);
    residualBeforeOffset.copy(residualOffset);
    residualOffset.add(desiredOffset);
    const residualLimitMeters = constrainResidualOffset(profile, refinementOptions.maxResidualMeters);
    residualDeltaOffset.copy(residualOffset).sub(residualBeforeOffset);
    const appliedResidualDistance = residualDeltaOffset.length();
    targetCenter.set(
      baselineSurface.center.x,
      baselineSurface.center.y,
      baselineSurface.center.z,
    ).add(residualDeltaOffset);
    const appliedDegrees = { 'upperarm.l': 0, 'lowerarm.l': 0 };

    if (residualDeltaOffset.lengthSq() > 1e-10) {
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        const surface = buckler.getWorldParrySurface();
        effector.set(surface.center.x, surface.center.y, surface.center.z);
        const lowerBudget = profile.lowerArmMaxDegrees * jointBudgetScale;
        const lowerRemaining = Math.max(0, lowerBudget - appliedDegrees['lowerarm.l']);
        appliedDegrees['lowerarm.l'] += setWorldDirectionDelta(
          THREE, rig.bones['lowerarm.l'], effector, targetCenter, lowerRemaining,
        );
        rig.root?.updateMatrixWorld?.(true);
        const surfaceAfterLower = buckler.getWorldParrySurface();
        effector.set(surfaceAfterLower.center.x, surfaceAfterLower.center.y, surfaceAfterLower.center.z);
        const upperBudget = profile.upperArmMaxDegrees * jointBudgetScale;
        const upperRemaining = Math.max(0, upperBudget - appliedDegrees['upperarm.l']);
        appliedDegrees['upperarm.l'] += setWorldDirectionDelta(
          THREE, rig.bones['upperarm.l'], effector, targetCenter, upperRemaining,
        );
        rig.root?.updateMatrixWorld?.(true);
      }
    }

    const finalSurface = buckler.getWorldParrySurface();
    const achieved = new THREE.Vector3(
      finalSurface.center.x - baselineSurface.center.x,
      finalSurface.center.y - baselineSurface.center.y,
      finalSurface.center.z - baselineSurface.center.z,
    );
    const achievedDistance = achieved.length();
    const directionDot = appliedResidualDistance > 1e-6 && achievedDistance > 1e-6
      ? residualDeltaOffset.dot(achieved) / (appliedResidualDistance * achievedDistance)
      : null;
    return Object.freeze({
      stage: GUARD_THREAT_RESIDUAL_REFINEMENT_STAGE,
      mode,
      requestedResidual: freezeVector({
        x: finite(plan?.correction?.x),
        y: finite(plan?.correction?.y),
        z: finite(plan?.correction?.z),
      }),
      requestedResidualDistance,
      appliedResidual: freezeVector({
        x: residualDeltaOffset.x, y: residualDeltaOffset.y, z: residualDeltaOffset.z,
      }),
      appliedResidualDistance,
      residualOffsetBefore: freezeVector({
        x: residualBeforeOffset.x, y: residualBeforeOffset.y, z: residualBeforeOffset.z,
      }),
      residualOffsetAfter: freezeVector({ x: residualOffset.x, y: residualOffset.y, z: residualOffset.z }),
      carriedResidualDistance: residualOffset.length(),
      combinedRequestedOffset: freezeVector({ x: combinedOffset.x, y: combinedOffset.y, z: combinedOffset.z }),
      combinedRequestedDistance: combinedOffset.length(),
      residualLimitMeters,
      achievedOffset: freezeVector({ x: achieved.x, y: achieved.y, z: achieved.z }),
      achievedDistance,
      directionDot,
      appliedDegrees: Object.freeze({ ...appliedDegrees }),
      jointBudgetScale,
      surface: finalSurface,
      preservedPrimaryOffset: freezeVector({ x: currentOffset.x, y: currentOffset.y, z: currentOffset.z }),
      authority: 'persistent-bounded-residual-carry-no-contact-authority',
    });
  }

  function reset() {
    currentOffset.set(0, 0, 0);
    residualOffset.set(0, 0, 0);
    combinedOffset.set(0, 0, 0);
  }
  return Object.freeze({
    update,
    refineWorldTarget,
    refineMeasuredContact,
    reset,
    get offset() { return currentOffset.clone(); },
    get residualOffset() { return residualOffset.clone(); },
    get combinedOffset() { return currentOffset.clone().add(residualOffset); },
  });
}
