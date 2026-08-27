export const GUARD_RESIDUAL_BODY_REACH_STAGE = 'G4.3B.5R.3.6';

export const GUARD_RESIDUAL_BODY_REACH_PROFILE = Object.freeze({
  planeActivationMeters: 0.002,
  edgeActivationMeters: 0.010,
  armSaturationRatio: 0.92,
  contactInsetMeters: 0.012,
  maxBodyReachMeters: 0.035,
  bodyReachSpeedMps: 0.72,
  bodyReturnSpeedMps: 0.90,
  wristMaxDegrees: 3.0,
  chestMaxDegrees: 2.4,
  spineMaxDegrees: 1.6,
  iterations: 2,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, finite(value))); }
function vec(value = {}) { return { x: finite(value.x), y: finite(value.y), z: finite(value.z) }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function mul(a, scalar) { return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function length(value) { return Math.hypot(value.x, value.y, value.z); }
function normalize(value, fallback = { x: 0, y: 0, z: 1 }) {
  const magnitude = length(value);
  return magnitude > 1e-9 ? mul(value, 1 / magnitude) : vec(fallback);
}
function freezeVector(value) { return Object.freeze({ x: value.x, y: value.y, z: value.z }); }

function normalizeSurface(surface = {}) {
  return Object.freeze({
    center: freezeVector(vec(surface.center)),
    normal: freezeVector(normalize(vec(surface.normal))),
    radius: Math.max(0, finite(surface.radius)),
    thickness: Math.max(0, finite(surface.thickness)),
  });
}

function closestPointMetrics(point, surface) {
  const fromCenter = sub(point, surface.center);
  const signedDistance = dot(fromCenter, surface.normal);
  const planePoint = sub(point, mul(surface.normal, signedDistance));
  const radialVector = sub(planePoint, surface.center);
  const radialDistance = length(radialVector);
  return Object.freeze({
    signedDistance,
    planePoint: freezeVector(planePoint),
    radialVector: freezeVector(radialVector),
    radialDistance,
    radialGapMeters: Math.max(0, radialDistance - surface.radius),
    planeGapMeters: Math.max(0, Math.abs(signedDistance) - surface.thickness * 0.5),
  });
}

export function measureGuardArmExtension(joints = {}) {
  const shoulder = vec(joints.shoulder);
  const elbow = vec(joints.elbow);
  const wrist = vec(joints.wrist);
  const upperLength = length(sub(elbow, shoulder));
  const lowerLength = length(sub(wrist, elbow));
  const chainLength = upperLength + lowerLength;
  const directReach = length(sub(wrist, shoulder));
  return Object.freeze({
    upperLength,
    lowerLength,
    chainLength,
    directReach,
    ratio: chainLength > 1e-6 ? clamp(directReach / chainLength, 0, 1) : 0,
  });
}

export function planGuardResidualBodyReach(input = {}) {
  const profile = Object.freeze({ ...GUARD_RESIDUAL_BODY_REACH_PROFILE, ...(input.profile || {}) });
  const mode = String(input.mode || 'off').toLowerCase();
  const surface = normalizeSurface(input.bucklerSurface);
  const point = input.closestApproach?.point ? vec(input.closestApproach.point) : null;
  const armExtension = measureGuardArmExtension(input.armJoints);
  if (mode !== 'parry' || !point || !(surface.radius > 0)) {
    return Object.freeze({
      stage: GUARD_RESIDUAL_BODY_REACH_STAGE,
      mode,
      active: false,
      wristActive: false,
      bodyActive: false,
      armExtension,
      surface,
      reason: mode !== 'parry' ? 'parry-only' : 'missing-contact-geometry',
      authority: 'pre-contact-guidance-only-real-swept-contact-required',
    });
  }

  const metrics = closestPointMetrics(point, surface);
  const pointDirection = normalize(sub(point, surface.center), surface.normal);
  const projectedNormal = sub(surface.normal, mul(pointDirection, dot(surface.normal, pointDirection)));
  const targetNormal = normalize(projectedNormal, surface.normal);
  const normalDot = clamp(dot(surface.normal, targetNormal), -1, 1);
  const desiredNormalRotationDegrees = Math.acos(normalDot) * 180 / Math.PI;
  const wristActive = metrics.planeGapMeters > profile.planeActivationMeters
    && desiredNormalRotationDegrees > 1e-4;
  const bodyActive = metrics.radialGapMeters > profile.edgeActivationMeters
    && armExtension.ratio >= profile.armSaturationRatio;
  const requestedBodyDistance = bodyActive
    ? Math.min(
        profile.maxBodyReachMeters,
        metrics.radialGapMeters + Math.max(0, profile.contactInsetMeters),
      )
    : 0;
  const bodyCorrection = requestedBodyDistance > 0
    ? mul(normalize(metrics.radialVector, { x: 0, y: 0, z: 0 }), requestedBodyDistance)
    : { x: 0, y: 0, z: 0 };

  return Object.freeze({
    stage: GUARD_RESIDUAL_BODY_REACH_STAGE,
    mode,
    active: wristActive || bodyActive,
    wristActive,
    bodyActive,
    armExtension,
    metrics,
    targetNormal: freezeVector(targetNormal),
    desiredNormalRotationDegrees,
    requestedBodyDistance,
    bodyCorrection: freezeVector(bodyCorrection),
    surface,
    point: freezeVector(point),
    profile,
    reason: bodyActive
      ? 'arm-saturated-recruit-wrist-chest-spine'
      : wristActive
        ? 'plane-only-recruit-wrist'
        : metrics.radialGapMeters > profile.edgeActivationMeters
          ? 'arm-retains-reach-reserve'
          : 'residual-inside-body-reach-threshold',
    authority: 'pre-contact-guidance-only-real-swept-contact-required',
  });
}

function applyWorldDirectionRotation(THREE, bone, currentDirectionInput, targetDirectionInput, maxDegrees) {
  const currentDirection = new THREE.Vector3(
    currentDirectionInput.x, currentDirectionInput.y, currentDirectionInput.z,
  ).normalize();
  const targetDirection = new THREE.Vector3(
    targetDirectionInput.x, targetDirectionInput.y, targetDirectionInput.z,
  ).normalize();
  if (currentDirection.lengthSq() < 1e-10 || targetDirection.lengthSq() < 1e-10) return 0;
  const desiredWorldDelta = new THREE.Quaternion().setFromUnitVectors(currentDirection, targetDirection);
  const rawAngle = 2 * Math.acos(clamp(desiredWorldDelta.w, -1, 1));
  if (rawAngle < 1e-6) return 0;
  const maxRadians = Math.max(0, finite(maxDegrees)) * Math.PI / 180;
  const appliedAngle = Math.min(rawAngle, maxRadians);
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

function aimEffectorWithBone(THREE, bone, effectorWorld, targetWorld, maxDegrees) {
  const boneWorld = new THREE.Vector3();
  bone.getWorldPosition(boneWorld);
  return applyWorldDirectionRotation(
    THREE,
    bone,
    effectorWorld.clone().sub(boneWorld),
    targetWorld.clone().sub(boneWorld),
    maxDegrees,
  );
}

export function createGuardResidualBodyReachRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) throw new Error('G4.3B.5R.3.6 requires THREE.Vector3 + Quaternion');
  const rig = options.rig;
  const buckler = options.buckler;
  const requiredBones = ['spine', 'chest', 'upperarm.l', 'lowerarm.l', 'wrist.l'];
  if (!requiredBones.every((key) => rig?.bones?.[key])) throw new Error('G4.3B.5R.3.6 requires defender wrist, arm, chest, and spine bones');
  if (!buckler?.getWorldParrySurface) throw new Error('G4.3B.5R.3.6 requires Buckler parry surface');

  const bodyReachOffset = new THREE.Vector3();
  const bodyReachBefore = new THREE.Vector3();
  const requestedStep = new THREE.Vector3();
  const targetCenter = new THREE.Vector3();
  const activeTargetOffset = new THREE.Vector3();
  const activeTargetDesired = new THREE.Vector3();
  const activeTargetDelta = new THREE.Vector3();
  const effector = new THREE.Vector3();
  const jointPoint = new THREE.Vector3();

  function worldPoint(bone) {
    bone.getWorldPosition(jointPoint);
    return { x: jointPoint.x, y: jointPoint.y, z: jointPoint.z };
  }

  function currentArmJoints() {
    return {
      shoulder: worldPoint(rig.bones['upperarm.l']),
      elbow: worldPoint(rig.bones['lowerarm.l']),
      wrist: worldPoint(rig.bones['wrist.l']),
    };
  }

  function trackWorldTarget(input = {}, deltaSeconds = 1 / 60) {
    const profile = Object.freeze({ ...GUARD_RESIDUAL_BODY_REACH_PROFILE, ...(input.profile || {}) });
    const dt = Math.max(1e-5, finite(deltaSeconds, 1 / 60));
    const initialSurface = buckler.getWorldParrySurface();
    const target = input.targetCenter || null;
    if (!target) {
      activeTargetOffset.set(0, 0, 0);
      return Object.freeze({
        stage: GUARD_RESIDUAL_BODY_REACH_STAGE,
        mode: 'active-intercept-world-target',
        active: false,
        reason: 'missing-fixed-world-target',
        supportOffset: freezeVector({ x: 0, y: 0, z: 0 }),
        supportOffsetDistance: 0,
        targetErrorBeforeMeters: null,
        targetErrorAfterMeters: null,
        appliedDegrees: Object.freeze({ chest: 0, spine: 0 }),
        hipsModified: false,
        feetModified: false,
        authority: 'fixed-world-target-support-chain-no-contact-authority',
      });
    }

    // Active Intercept owns a fixed world target. Legacy measured-contact body carry must
    // not mix with this path; chest/spine only reapply a bounded additive residual after
    // the arm solver has already become the post-presentation last writer.
    bodyReachOffset.set(0, 0, 0);
    activeTargetDesired.set(
      finite(target.x) - finite(initialSurface.center?.x),
      finite(target.y) - finite(initialSurface.center?.y),
      finite(target.z) - finite(initialSurface.center?.z),
    );
    if (activeTargetDesired.length() > profile.maxBodyReachMeters && profile.maxBodyReachMeters > 0) {
      activeTargetDesired.setLength(profile.maxBodyReachMeters);
    }
    if (!(profile.maxBodyReachMeters > 0)) activeTargetDesired.set(0, 0, 0);

    activeTargetDelta.copy(activeTargetDesired).sub(activeTargetOffset);
    const maxStep = Math.max(0, profile.bodyReachSpeedMps) * dt;
    if (activeTargetDelta.length() > maxStep && maxStep > 0) activeTargetDelta.setLength(maxStep);
    if (!(maxStep > 0)) activeTargetDelta.set(0, 0, 0);
    activeTargetOffset.add(activeTargetDelta);
    if (activeTargetOffset.length() > profile.maxBodyReachMeters && profile.maxBodyReachMeters > 0) {
      activeTargetOffset.setLength(profile.maxBodyReachMeters);
    }

    targetCenter.set(
      finite(initialSurface.center?.x),
      finite(initialSurface.center?.y),
      finite(initialSurface.center?.z),
    ).add(activeTargetOffset);
    const appliedDegrees = { chest: 0, spine: 0 };
    if (activeTargetOffset.lengthSq() > 1e-10) {
      for (let iteration = 0; iteration < profile.iterations; iteration += 1) {
        const surface = buckler.getWorldParrySurface();
        effector.set(surface.center.x, surface.center.y, surface.center.z);
        const chestRemaining = Math.max(0, profile.chestMaxDegrees - appliedDegrees.chest);
        appliedDegrees.chest += aimEffectorWithBone(
          THREE, rig.bones.chest, effector, targetCenter, chestRemaining,
        );
        rig.root?.updateMatrixWorld?.(true);
        const surfaceAfterChest = buckler.getWorldParrySurface();
        effector.set(surfaceAfterChest.center.x, surfaceAfterChest.center.y, surfaceAfterChest.center.z);
        const spineRemaining = Math.max(0, profile.spineMaxDegrees - appliedDegrees.spine);
        appliedDegrees.spine += aimEffectorWithBone(
          THREE, rig.bones.spine, effector, targetCenter, spineRemaining,
        );
        rig.root?.updateMatrixWorld?.(true);
      }
    }

    const finalSurface = buckler.getWorldParrySurface();
    const achieved = new THREE.Vector3(
      finalSurface.center.x - initialSurface.center.x,
      finalSurface.center.y - initialSurface.center.y,
      finalSurface.center.z - initialSurface.center.z,
    );
    const targetVector = new THREE.Vector3(finite(target.x), finite(target.y), finite(target.z));
    const beforeVector = new THREE.Vector3(
      finite(initialSurface.center?.x), finite(initialSurface.center?.y), finite(initialSurface.center?.z),
    );
    const afterVector = new THREE.Vector3(
      finite(finalSurface.center?.x), finite(finalSurface.center?.y), finite(finalSurface.center?.z),
    );
    const achievedDistance = achieved.length();
    const directionDot = activeTargetOffset.length() > 1e-6 && achievedDistance > 1e-6
      ? activeTargetOffset.dot(achieved) / (activeTargetOffset.length() * achievedDistance)
      : null;
    return Object.freeze({
      stage: GUARD_RESIDUAL_BODY_REACH_STAGE,
      mode: 'active-intercept-world-target',
      active: activeTargetOffset.lengthSq() > 1e-10,
      supportOffset: freezeVector(activeTargetOffset),
      supportOffsetDistance: activeTargetOffset.length(),
      requestedTargetOffset: freezeVector(activeTargetDesired),
      requestedTargetDistance: activeTargetDesired.length(),
      targetErrorBeforeMeters: targetVector.distanceTo(beforeVector),
      targetErrorAfterMeters: targetVector.distanceTo(afterVector),
      achievedOffset: freezeVector(achieved),
      achievedDistance,
      directionDot,
      appliedDegrees: Object.freeze({ ...appliedDegrees }),
      surface: finalSurface,
      hipsModified: false,
      feetModified: false,
      reason: 'fixed-world-target-support-chain-active',
      authority: 'fixed-world-target-support-chain-no-contact-authority',
    });
  }

  function update(input = {}, deltaSeconds = 1 / 60) {
    activeTargetOffset.set(0, 0, 0);
    const mode = String(input.mode || 'off').toLowerCase();
    const profile = Object.freeze({ ...GUARD_RESIDUAL_BODY_REACH_PROFILE, ...(input.profile || {}) });
    const dt = Math.max(1e-5, finite(deltaSeconds, 1 / 60));
    const initialSurface = buckler.getWorldParrySurface();
    const initialPlan = planGuardResidualBodyReach({
      mode,
      closestApproach: input.closestApproach,
      bucklerSurface: initialSurface,
      armJoints: currentArmJoints(),
      profile,
    });

    if (mode !== 'parry') bodyReachOffset.set(0, 0, 0);
    const wristAppliedDegrees = initialPlan.wristActive
      ? applyWorldDirectionRotation(
          THREE,
          rig.bones['wrist.l'],
          initialSurface.normal,
          initialPlan.targetNormal,
          profile.wristMaxDegrees,
        )
      : 0;
    if (wristAppliedDegrees > 0) rig.root?.updateMatrixWorld?.(true);

    const surfaceAfterWrist = buckler.getWorldParrySurface();
    const postWristPlan = planGuardResidualBodyReach({
      mode,
      closestApproach: input.closestApproach,
      bucklerSurface: surfaceAfterWrist,
      armJoints: currentArmJoints(),
      profile,
    });
    bodyReachBefore.copy(bodyReachOffset);
    requestedStep.set(
      finite(postWristPlan.bodyCorrection?.x),
      finite(postWristPlan.bodyCorrection?.y),
      finite(postWristPlan.bodyCorrection?.z),
    );
    const maxStep = (postWristPlan.bodyActive ? profile.bodyReachSpeedMps : profile.bodyReturnSpeedMps) * dt;
    if (postWristPlan.bodyActive) {
      if (requestedStep.length() > maxStep && maxStep > 0) requestedStep.setLength(maxStep);
      bodyReachOffset.add(requestedStep);
    } else if (bodyReachOffset.length() > maxStep && maxStep > 0) {
      bodyReachOffset.setLength(bodyReachOffset.length() - maxStep);
    } else {
      bodyReachOffset.set(0, 0, 0);
    }
    if (bodyReachOffset.length() > profile.maxBodyReachMeters) {
      bodyReachOffset.setLength(profile.maxBodyReachMeters);
    }

    const bodySurfaceBefore = buckler.getWorldParrySurface();
    targetCenter.set(
      bodySurfaceBefore.center.x,
      bodySurfaceBefore.center.y,
      bodySurfaceBefore.center.z,
    ).add(bodyReachOffset);
    const appliedDegrees = { chest: 0, spine: 0 };
    if (bodyReachOffset.lengthSq() > 1e-10) {
      for (let iteration = 0; iteration < profile.iterations; iteration += 1) {
        const surface = buckler.getWorldParrySurface();
        effector.set(surface.center.x, surface.center.y, surface.center.z);
        const chestRemaining = Math.max(0, profile.chestMaxDegrees - appliedDegrees.chest);
        appliedDegrees.chest += aimEffectorWithBone(
          THREE, rig.bones.chest, effector, targetCenter, chestRemaining,
        );
        rig.root?.updateMatrixWorld?.(true);
        const surfaceAfterChest = buckler.getWorldParrySurface();
        effector.set(surfaceAfterChest.center.x, surfaceAfterChest.center.y, surfaceAfterChest.center.z);
        const spineRemaining = Math.max(0, profile.spineMaxDegrees - appliedDegrees.spine);
        appliedDegrees.spine += aimEffectorWithBone(
          THREE, rig.bones.spine, effector, targetCenter, spineRemaining,
        );
        rig.root?.updateMatrixWorld?.(true);
      }
    }

    const finalSurface = buckler.getWorldParrySurface();
    const achieved = new THREE.Vector3(
      finalSurface.center.x - bodySurfaceBefore.center.x,
      finalSurface.center.y - bodySurfaceBefore.center.y,
      finalSurface.center.z - bodySurfaceBefore.center.z,
    );
    const achievedDistance = achieved.length();
    const bodyDirectionDot = bodyReachOffset.length() > 1e-6 && achievedDistance > 1e-6
      ? bodyReachOffset.dot(achieved) / (bodyReachOffset.length() * achievedDistance)
      : null;
    const finalMetrics = input.closestApproach?.point
      ? closestPointMetrics(vec(input.closestApproach.point), normalizeSurface(finalSurface))
      : null;

    return Object.freeze({
      stage: GUARD_RESIDUAL_BODY_REACH_STAGE,
      mode,
      active: initialPlan.active || bodyReachOffset.lengthSq() > 1e-10,
      initialPlan,
      postWristPlan,
      armExtensionRatio: postWristPlan.armExtension?.ratio ?? 0,
      wristAppliedDegrees,
      planeGapBeforeMeters: initialPlan.metrics?.planeGapMeters ?? null,
      planeGapAfterWristMeters: postWristPlan.metrics?.planeGapMeters ?? null,
      bodyReachOffsetBefore: freezeVector(bodyReachBefore),
      bodyReachOffsetAfter: freezeVector(bodyReachOffset),
      bodyReachDistance: bodyReachOffset.length(),
      bodyAchievedOffset: freezeVector(achieved),
      bodyAchievedDistance: achievedDistance,
      bodyDirectionDot,
      appliedDegrees: Object.freeze({ ...appliedDegrees }),
      finalMetrics,
      surface: finalSurface,
      hipsModified: false,
      feetModified: false,
      authority: 'live-residual-wrist-chest-spine-only-no-authored-curve-no-contact-authority',
    });
  }

  function reset() {
    bodyReachOffset.set(0, 0, 0);
    activeTargetOffset.set(0, 0, 0);
  }
  return Object.freeze({
    update,
    trackWorldTarget,
    reset,
    get offset() { return bodyReachOffset.clone(); },
    get activeTargetOffset() { return activeTargetOffset.clone(); },
  });
}
