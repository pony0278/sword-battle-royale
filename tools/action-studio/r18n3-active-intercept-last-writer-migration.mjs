import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`R18N.3 missing marker: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`R18N.3 marker is not unique: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function update(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`R18N.3 produced no change: ${path}`);
  fs.writeFileSync(path, after);
}

update('src/combat/guard-residual-body-reach.js', (source) => {
  let next = replaceOnce(
    source,
    `  const requestedStep = new THREE.Vector3();
  const targetCenter = new THREE.Vector3();
  const effector = new THREE.Vector3();`,
    `  const requestedStep = new THREE.Vector3();
  const targetCenter = new THREE.Vector3();
  const activeTargetOffset = new THREE.Vector3();
  const activeTargetDesired = new THREE.Vector3();
  const activeTargetDelta = new THREE.Vector3();
  const effector = new THREE.Vector3();`,
    'fixed-target support-chain state',
  );

  next = replaceOnce(
    next,
    `  function update(input = {}, deltaSeconds = 1 / 60) {`,
    `  function trackWorldTarget(input = {}, deltaSeconds = 1 / 60) {
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
    activeTargetOffset.set(0, 0, 0);`,
    'fixed-target support-chain runtime',
  );

  next = replaceOnce(
    next,
    `  function reset() { bodyReachOffset.set(0, 0, 0); }
  return Object.freeze({
    update,
    reset,
    get offset() { return bodyReachOffset.clone(); },
  });`,
    `  function reset() {
    bodyReachOffset.set(0, 0, 0);
    activeTargetOffset.set(0, 0, 0);
  }
  return Object.freeze({
    update,
    trackWorldTarget,
    reset,
    get offset() { return bodyReachOffset.clone(); },
    get activeTargetOffset() { return activeTargetOffset.clone(); },
  });`,
    'publish fixed-target support-chain runtime',
  );
  return next;
});

update('tools/action-studio/shield-parry-r281/pre-contact-controller.js', (source) => {
  let next = replaceOnce(
    source,
    `      const trackingSurfaceBefore = cloneSurface(buckler.getWorldParrySurface());
      // Active Intercept owns a persistent shield-arm pose. Re-zero only the runtime
      // carry so update() becomes this-frame bounded travel toward the fixed world target
      // instead of re-applying an absolute offset on top of last frame's moved pose.
      if (activeIntentPlan) fineTrackingRuntime.reset();
      exchangeState.latestFineTracking = fineTrackingRuntime.update(exchangeState.latestFinePlan, deltaSeconds);`,
    `      const trackingSurfaceBefore = cloneSurface(buckler.getWorldParrySurface());
      // R18N.3: Guard/Parry presentation is allowed to rebuild its authored pose every frame.
      // Keep the tracking runtime's bounded carry across frames and apply it after presentation,
      // so currentOffset acts as an absolute additive world-space correction and Active Intercept
      // remains the last writer of the shield-arm pose before real swept contact is evaluated.
      exchangeState.latestFineTracking = fineTrackingRuntime.update(exchangeState.latestFinePlan, deltaSeconds);`,
    'replace persistent-pose reset with last-writer additive carry',
  );

  next = replaceOnce(
    next,
    `      const residualBodyReach = residualBodyReachRuntime.update({
        // The F-latched world target owns chest/spine placement while active. Keep
        // the legacy body-reach solver for non-active Parry, but do not let its
        // separate measured-contact target fight the fixed Active Intercept target.
        mode: activeIntentPlan ? 'off' : 'parry',
        closestApproach: residualAfterArmRefinement,
      }, deltaSeconds);`,
    `      const residualBodyReach = activeIntentPlan
        ? residualBodyReachRuntime.trackWorldTarget({
            targetCenter: activeInterceptIntent?.report?.targetCenter,
          }, deltaSeconds)
        : residualBodyReachRuntime.update({
            mode: 'parry',
            closestApproach: residualAfterArmRefinement,
          }, deltaSeconds);`,
    'fixed-target support-chain residual ownership',
  );

  next = replaceOnce(
    next,
    `      const stancePlaneReductionMeters = residualAfterBodyReach.planeGapMeters
        - residualAfterRefinement.planeGapMeters;
      exchangeState.latestInterceptDriveReport = Object.freeze({`,
    `      const stancePlaneReductionMeters = residualAfterBodyReach.planeGapMeters
        - residualAfterRefinement.planeGapMeters;
      const activeInterceptTargetCenter = activeIntentPlan ? activeInterceptIntent?.report?.targetCenter : null;
      const activeInterceptTargetErrorBeforeMeters = activeInterceptTargetCenter
        ? Math.hypot(
            activeInterceptTargetCenter.x - trackingSurfaceBefore.center.x,
            activeInterceptTargetCenter.y - trackingSurfaceBefore.center.y,
            activeInterceptTargetCenter.z - trackingSurfaceBefore.center.z,
          )
        : null;
      const activeInterceptTargetErrorAfterMeters = activeInterceptTargetCenter
        ? Math.hypot(
            activeInterceptTargetCenter.x - trackingSurfaceAfter.center.x,
            activeInterceptTargetCenter.y - trackingSurfaceAfter.center.y,
            activeInterceptTargetCenter.z - trackingSurfaceAfter.center.z,
          )
        : null;
      exchangeState.latestInterceptDriveReport = Object.freeze({`,
    'add last-writer target error telemetry',
  );

  next = replaceOnce(
    next,
    `        activeInterceptIntent: activeInterceptIntent?.report ?? null,
        fallbackApplied:`,
    `        activeInterceptIntent: activeInterceptIntent?.report ?? null,
        activeInterceptPoseAuthority: activeIntentPlan
          ? 'post-guard-post-predictive-absolute-world-offset-last-writer'
          : null,
        activeInterceptPrimaryCarryMeters: activeIntentPlan
          ? magnitude(exchangeState.latestFineTracking?.requestedOffset)
          : null,
        activeInterceptResidualCarryMeters: activeIntentPlan
          ? (residualRefinement?.carriedResidualDistance ?? 0)
          : null,
        activeInterceptSupportAuthority: activeIntentPlan
          ? residualBodyReach?.authority ?? null
          : null,
        activeInterceptTargetErrorBeforeMeters,
        activeInterceptTargetErrorAfterMeters,
        fallbackApplied:`,
    'publish last-writer telemetry',
  );

  next = replaceOnce(
    next,
    `        authority: 'persistent-arm-carry-then-predicted-or-measured-low-threat-planted-stance-held-to-real-contact-or-reset-diagnostic',`,
    `        authority: activeIntentPlan
          ? 'guard-and-predictive-presentation-then-active-intercept-arm-plus-fixed-target-support-last-writer-held-to-real-contact'
          : 'persistent-arm-carry-then-predicted-or-measured-low-threat-planted-stance-held-to-real-contact-or-reset-diagnostic',`,
    'last-writer authority label',
  );
  return next;
});

update('tests/shield-parry-r281-active-intercept-runtime.test.js', (source) => {
  let next = replaceOnce(
    source,
    `  const planIndex = preContact.indexOf('const activeIntentPlan = activeInterceptIntent?.plan({');
  const resetIndex = preContact.indexOf('if (activeIntentPlan) fineTrackingRuntime.reset();');
  const updateIndex = preContact.indexOf('exchangeState.latestFineTracking = fineTrackingRuntime.update(exchangeState.latestFinePlan, deltaSeconds);', resetIndex);
  assert.ok(planIndex >= 0 && resetIndex > planIndex && updateIndex > resetIndex, 'active intent must clear absolute runtime carry immediately before its persistent-pose tracking step');
  assert.match(preContact.slice(resetIndex, updateIndex), /if \\(activeIntentPlan\\) fineTrackingRuntime\\.reset\\(\\);/);`,
    `  const planIndex = preContact.indexOf('const activeIntentPlan = activeInterceptIntent?.plan({');
  const updateIndex = preContact.indexOf('exchangeState.latestFineTracking = fineTrackingRuntime.update(exchangeState.latestFinePlan, deltaSeconds);', planIndex);
  assert.ok(planIndex >= 0 && updateIndex > planIndex, 'active intent must remain the primary post-presentation tracking step');
  assert.doesNotMatch(
    preContact.slice(planIndex, updateIndex),
    /if \\(activeIntentPlan\\) fineTrackingRuntime\\.reset\\(\\);/,
    'R18N.3 must preserve bounded tracking carry so the absolute additive correction can be reapplied after authored presentation each frame',
  );
  assert.match(preContact, /activeInterceptPoseAuthority:[\\s\\S]*post-guard-post-predictive-absolute-world-offset-last-writer/);`,
    'update active intercept runtime contract from persistent-pose reset to last-writer carry',
  );
  next = replaceOnce(
    next,
    `  assert.match(preContact, /residualBodyReachRuntime\\.update\\(\\{[\\s\\S]*mode: activeIntentPlan \\? 'off' : 'parry'/, 'body reach must not fight the F-latched world target');`,
    `  assert.match(preContact, /activeIntentPlan[\\s\\S]*residualBodyReachRuntime\\.trackWorldTarget\\(\\{[\\s\\S]*targetCenter: activeInterceptIntent\\?\\.report\\?\\.targetCenter/, 'active intercept support chain must follow the same F-latched fixed world target');
  assert.match(preContact, /residualBodyReachRuntime\\.update\\(\\{[\\s\\S]*mode: 'parry'/, 'legacy measured-contact body reach remains available outside active intercept');`,
    'update body-reach ownership contract',
  );
  return next;
});

console.log('R18N.3 Active Intercept last-writer pose authority applied.');
