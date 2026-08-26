import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`R18N.3 closure missing marker: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`R18N.3 closure marker is not unique: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function update(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`R18N.3 closure produced no change: ${path}`);
  fs.writeFileSync(path, after);
}

update('src/combat/guard-threat-tracking.js', (source) => {
  let next = replaceOnce(
    source,
    `  function refineMeasuredContact(plan, deltaSeconds = 1 / 60, refinementOptions = {}) {`,
    `  function refineWorldTarget(targetInput = {}, refinementOptions = {}) {
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

  function refineMeasuredContact(plan, deltaSeconds = 1 / 60, refinementOptions = {}) {`,
    'insert fixed-world-target arm closure',
  );

  next = replaceOnce(
    next,
    `  return Object.freeze({
    update,
    refineMeasuredContact,
    reset,`,
    `  return Object.freeze({
    update,
    refineWorldTarget,
    refineMeasuredContact,
    reset,`,
    'publish fixed-world-target arm closure',
  );
  return next;
});

update('tools/action-studio/shield-parry-r281/pre-contact-controller.js', (source) => {
  let next = replaceOnce(
    source,
    `      const residualStanceReach = residualStanceReachRuntime.update({
        mode: 'parry',
        profile: debugMode ? debugStanceProfile : null,
        closestApproach: residualAfterBodyReach,
        anticipatedClosestApproach: exchangeState.latestPredictiveAnalysis?.threat?.worldPoint
          ? { point: exchangeState.latestPredictiveAnalysis.threat.worldPoint }
          : null,
        anticipatedLeadSeconds: exchangeState.latestPredictiveAnalysis?.threat?.futureSeconds ?? null,
        armEvidence: {
          extensionRatio: residualBodyReach.armExtensionRatio ?? 0,
          correctionAttemptedMeters: residualTrackingPlan?.appliedDistance ?? 0,
          correctionAchievedMeters: residualRefinement?.achievedDistance ?? 0,
          edgeGapBeforeMeters: residualBeforeRefinement.radialGapMeters,
          edgeGapAfterMeters: residualAfterArmRefinement.radialGapMeters,
        },
      }, deltaSeconds);
      // Rebuild dynamic line geometry once after all pose solvers have finished.`,
    `      const residualStanceReach = residualStanceReachRuntime.update({
        mode: 'parry',
        profile: debugMode ? debugStanceProfile : null,
        closestApproach: residualAfterBodyReach,
        anticipatedClosestApproach: exchangeState.latestPredictiveAnalysis?.threat?.worldPoint
          ? { point: exchangeState.latestPredictiveAnalysis.threat.worldPoint }
          : null,
        anticipatedLeadSeconds: exchangeState.latestPredictiveAnalysis?.threat?.futureSeconds ?? null,
        armEvidence: {
          extensionRatio: residualBodyReach.armExtensionRatio ?? 0,
          correctionAttemptedMeters: residualTrackingPlan?.appliedDistance ?? 0,
          correctionAchievedMeters: residualRefinement?.achievedDistance ?? 0,
          edgeGapBeforeMeters: residualBeforeRefinement.radialGapMeters,
          edgeGapAfterMeters: residualAfterArmRefinement.radialGapMeters,
        },
      }, deltaSeconds);
      const activeInterceptArmClosure = activeIntentPlan
        ? fineTrackingRuntime.refineWorldTarget(activeInterceptIntent?.report?.targetCenter, {
            jointBudgetScale: 0.35,
            iterations: 2,
          })
        : null;
      // Rebuild dynamic line geometry once after all pose solvers have finished.`,
    'apply fixed-target arm closure after support and stance',
  );

  next = replaceOnce(
    next,
    `        activeInterceptSupportAuthority: activeIntentPlan
          ? residualBodyReach?.authority ?? null
          : null,
        activeInterceptTargetErrorBeforeMeters,`,
    `        activeInterceptSupportAuthority: activeIntentPlan
          ? residualBodyReach?.authority ?? null
          : null,
        activeInterceptArmClosure,
        activeInterceptTargetErrorBeforeMeters,`,
    'publish fixed-target arm closure telemetry',
  );
  return next;
});

console.log('R18N.3 fixed-world-target arm closure applied.');
