import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`R18N.1 missing marker: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`R18N.1 marker is not unique: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function update(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`R18N.1 produced no change: ${path}`);
  fs.writeFileSync(path, after);
}

update('package.json', (source) => replaceOnce(
  source,
  'tests/shield-parry-r281-active-parry-intercept-diagnosis.test.js tests/shield-parry-r281-thin-entry-audit.test.js',
  'tests/shield-parry-r281-active-parry-intercept-diagnosis.test.js tests/active-parry-intercept-intent.test.js tests/shield-parry-r281-active-intercept-runtime.test.js tests/shield-parry-r281-thin-entry-audit.test.js',
  'package test registration',
));

update('tools/action-studio/shield-driven-contact-coupling-lab-r281.js', (source) => {
  let next = replaceOnce(
    source,
    "import { sampleActiveShieldLeadMotion } from '../../src/combat/active-shield-lead-parry.js?v=g43b5r281';",
    "import { sampleActiveShieldLeadMotion } from '../../src/combat/active-shield-lead-parry.js?v=g43b5r281';\nimport { createActiveParryInterceptIntent } from '../../src/combat/active-parry-intercept-intent.js?v=r18n1';",
    'entry intent import',
  );
  next = replaceOnce(
    next,
    'const predictivePresentation = createPredictiveInterceptParryPresentationRuntime(THREE, { character: defender });\nconst parryGate = createCommittedParryContactGate();',
    'const predictivePresentation = createPredictiveInterceptParryPresentationRuntime(THREE, { character: defender });\nconst activeParryInterceptIntent = createActiveParryInterceptIntent();\nconst parryGate = createCommittedParryContactGate();',
    'entry intent construction',
  );
  next = replaceOnce(
    next,
    '  predictivePresentation,\n  parryGate,\n  longswordAttackPhases:',
    '  predictivePresentation,\n  activeInterceptIntent: activeParryInterceptIntent,\n  parryGate,\n  longswordAttackPhases:',
    'pre-contact intent injection',
  );
  next = replaceOnce(
    next,
    '  predictivePresentation.reset();\n  resetShieldParryExchangeState(exchangeState, {',
    '  predictivePresentation.reset();\n  preContactController.resetActiveIntercept();\n  resetShieldParryExchangeState(exchangeState, {',
    'reset active intent',
  );
  next = replaceOnce(
    next,
    '    exchangeState.latestInterceptDriveReport = null;\n    exchangeState.interceptDriveTrace = [];\n    predictivePresentation.start({',
    '    exchangeState.latestInterceptDriveReport = null;\n    exchangeState.interceptDriveTrace = [];\n    preContactController.armActiveIntercept(snapshot);\n    predictivePresentation.start({',
    'arm active intent after accepted F',
  );
  return next;
});

update('tools/action-studio/shield-parry-r281/pre-contact-controller.js', (source) => {
  let next = replaceOnce(
    source,
    '  predictivePresentation,\n  parryGate,',
    '  predictivePresentation,\n  activeInterceptIntent,\n  parryGate,',
    'controller intent dependency',
  );
  next = replaceOnce(
    next,
    '        timeToContactSeconds: exchangeState.latestPredictiveAnalysis?.timeToContactSeconds,\n        camera,',
    '        timeToContactSeconds: exchangeState.latestPredictiveAnalysis?.timeToContactSeconds,\n        preserveShieldArm: Boolean(activeInterceptIntent?.active),\n        camera,',
    'external shield-arm ownership during active intercept',
  );
  next = replaceOnce(
    next,
    '      const measuredClosestApproach = measureSweptSwordBucklerClosestApproach({\n        previousBlade,\n        currentBlade,\n        bucklerSurface: continuitySurface,\n      });\n      exchangeState.latestReachableInterceptTarget = selectReachableParryInterceptTarget({',
    '      const measuredClosestApproach = measureSweptSwordBucklerClosestApproach({\n        previousBlade,\n        currentBlade,\n        bucklerSurface: continuitySurface,\n      });\n      const activeIntentPlan = activeInterceptIntent?.plan({\n        sequence: snapshot.sequence,\n        bucklerSurface: predictiveSurface,\n      }) || null;\n      exchangeState.latestReachableInterceptTarget = selectReachableParryInterceptTarget({',
    'active intent plan',
  );
  next = replaceOnce(
    next,
    '      exchangeState.latestFinePlan = exchangeState.latestReachableInterceptTarget?.fallbackApplied\n        ? exchangeState.latestReachableInterceptTarget.trackingPlan',
    '      exchangeState.latestFinePlan = activeIntentPlan || (exchangeState.latestReachableInterceptTarget?.fallbackApplied\n        ? exchangeState.latestReachableInterceptTarget.trackingPlan',
    'active intent primary drive open',
  );
  next = replaceOnce(
    next,
    '          : null;\n      const trackingSurfaceBefore = cloneSurface(buckler.getWorldParrySurface());',
    '          : null);\n      const trackingSurfaceBefore = cloneSurface(buckler.getWorldParrySurface());',
    'active intent primary drive close',
  );
  next = replaceOnce(
    next,
    '      const trackingSurfaceBefore = cloneSurface(buckler.getWorldParrySurface());\n      exchangeState.latestFineTracking = fineTrackingRuntime.update(exchangeState.latestFinePlan, deltaSeconds);',
    '      const trackingSurfaceBefore = cloneSurface(buckler.getWorldParrySurface());\n      // Active Intercept owns a persistent shield-arm pose. Re-zero only the runtime\n      // carry so update() becomes this-frame bounded travel toward the fixed world target\n      // instead of re-applying an absolute offset on top of last frame\'s moved pose.\n      if (activeIntentPlan) fineTrackingRuntime.reset();\n      exchangeState.latestFineTracking = fineTrackingRuntime.update(exchangeState.latestFinePlan, deltaSeconds);',
    'persistent-pose incremental world-target drive',
  );
  next = replaceOnce(
    next,
    "      const residualBodyReach = residualBodyReachRuntime.update({\n        mode: 'parry',\n        closestApproach: residualAfterArmRefinement,\n      }, deltaSeconds);",
    "      const residualBodyReach = residualBodyReachRuntime.update({\n        // The F-latched world target owns chest/spine placement while active. Keep\n        // the legacy body-reach solver for non-active Parry, but do not let its\n        // separate measured-contact target fight the fixed Active Intercept target.\n        mode: activeIntentPlan ? 'off' : 'parry',\n        closestApproach: residualAfterArmRefinement,\n      }, deltaSeconds);",
    'active intent body reach ownership',
  );
  next = replaceOnce(
    next,
    "        drivePlanSource: exchangeState.latestReachableInterceptTarget?.fallbackApplied\n          ? 'surface-relative-measured-contact-correction'\n          : 'current-presentation-linear-contact-correction',",
    "        drivePlanSource: activeIntentPlan\n          ? 'latched-f-active-intercept-intent'\n          : exchangeState.latestReachableInterceptTarget?.fallbackApplied\n            ? 'surface-relative-measured-contact-correction'\n            : 'current-presentation-linear-contact-correction',\n        activeInterceptIntent: activeInterceptIntent?.report ?? null,",
    'drive plan telemetry',
  );
  next = replaceOnce(
    next,
    '  function updatePreContact(snapshot, currentBlade, deltaSeconds) {',
    "  function armActiveIntercept(snapshot) {\n    return activeInterceptIntent?.arm({\n      sequence: snapshot?.sequence,\n      direction: snapshot?.direction,\n      bucklerSurface: cloneSurface(buckler.getWorldParrySurface()),\n      predictiveAnalysis: exchangeState.latestPredictiveAnalysis,\n    }) || Object.freeze({ accepted: false, reason: 'active-intercept-intent-unavailable' });\n  }\n\n  function resetActiveIntercept() { activeInterceptIntent?.reset(); }\n\n  function updatePreContact(snapshot, currentBlade, deltaSeconds) {",
    'controller arm/reset methods',
  );
  next = replaceOnce(
    next,
    '  return Object.freeze({\n    update: updatePreContact,\n    recordWhiffProbe,\n  });',
    '  return Object.freeze({\n    update: updatePreContact,\n    recordWhiffProbe,\n    armActiveIntercept,\n    resetActiveIntercept,\n    get activeInterceptIntentReport() { return activeInterceptIntent?.report ?? null; },\n  });',
    'controller public intent facade',
  );
  return next;
});

update('src/combat/predictive-intercept-parry.js', (source) => {
  let next = replaceOnce(
    source,
    "export const RECOIL_PRESENTATION_AUTHORITY_STAGE = 'G4.3B.5R.2.3';\n",
    "export const RECOIL_PRESENTATION_AUTHORITY_STAGE = 'G4.3B.5R.2.3';\nexport const PREDICTIVE_PARRY_ENTRY_BLEND_SECONDS = 0.055;\nconst PREDICTIVE_PARRY_ENTRY_BLEND_BONES = Object.freeze(['spine', 'chest', 'upperarm.l', 'lowerarm.l', 'wrist.l']);\nconst PREDICTIVE_PARRY_EXTERNAL_SHIELD_ARM_BONES = Object.freeze(['root', 'hips', 'spine', 'chest', 'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l']);\n",
    'presentation bridge constants',
  );
  next = replaceOnce(
    next,
    'function freeze(value) {\n  return Object.freeze(value);\n}\n',
    "function freeze(value) {\n  return Object.freeze(value);\n}\n\nfunction captureBoneQuaternionPose(character, boneIds) {\n  const bones = character?.rig?.bones || {};\n  return Object.freeze(Object.fromEntries(\n    boneIds\n      .filter((boneId) => bones[boneId]?.quaternion?.clone)\n      .map((boneId) => [boneId, bones[boneId].quaternion.clone().normalize()]),\n  ));\n}\n\nfunction capturePresentationEntryPose(character) {\n  return captureBoneQuaternionPose(character, PREDICTIVE_PARRY_ENTRY_BLEND_BONES);\n}\n\nfunction restoreBoneQuaternionPose(character, pose) {\n  const bones = character?.rig?.bones || {};\n  for (const [boneId, saved] of Object.entries(pose || {})) {\n    const bone = bones[boneId];\n    if (!bone?.quaternion?.copy) continue;\n    bone.quaternion.copy(saved).normalize();\n  }\n}\n\nfunction blendPresentationEntryPose(character, entryPose, alpha) {\n  if (alpha >= 1) return;\n  const bones = character?.rig?.bones || {};\n  for (const [boneId, from] of Object.entries(entryPose || {})) {\n    const bone = bones[boneId];\n    if (!bone?.quaternion?.clone) continue;\n    const sampled = bone.quaternion.clone().normalize();\n    bone.quaternion.copy(from).slerp(sampled, alpha).normalize();\n  }\n}\n",
    'presentation bridge and ownership helpers',
  );
  next = replaceOnce(
    next,
    '      elapsedMs: 0,\n      sourceTimeSeconds: PREDICTIVE_INTERCEPT_PARRY_PROFILE.presentationStartSourceSeconds,',
    '      elapsedMs: 0,\n      entryBlendElapsedMs: 0,\n      entryPose: capturePresentationEntryPose(character),\n      sourceTimeSeconds: PREDICTIVE_INTERCEPT_PARRY_PROFILE.presentationStartSourceSeconds,',
    'capture presentation entry pose',
  );
  next = replaceOnce(
    next,
    '      sourceTimeSeconds: active.sourceTimeSeconds,\n      triggerTtcSeconds,',
    '      sourceTimeSeconds: active.sourceTimeSeconds,\n      entryBlendProgress: 0,\n      shieldArmOwnership: \'predictive-presentation\',\n      triggerTtcSeconds,',
    'initial bridge report',
  );
  next = replaceOnce(
    next,
    '    active.elapsedMs += deltaSeconds * 1000;\n    const ttc = Math.max(0, finite(input.timeToContactSeconds, active.triggerTtcSeconds));',
    '    active.elapsedMs += deltaSeconds * 1000;\n    active.entryBlendElapsedMs += Math.min(deltaSeconds * 1000, 20);\n    const entryBlendProgress = clamp(active.entryBlendElapsedMs / (PREDICTIVE_PARRY_ENTRY_BLEND_SECONDS * 1000), 0, 1);\n    const preserveShieldArm = input.preserveShieldArm === true;\n    const shieldArmPose = preserveShieldArm\n      ? captureBoneQuaternionPose(character, PREDICTIVE_PARRY_EXTERNAL_SHIELD_ARM_BONES)\n      : null;\n    const ttc = Math.max(0, finite(input.timeToContactSeconds, active.triggerTtcSeconds));',
    'bridge clock and shield-arm ownership capture',
  );
  next = replaceOnce(
    next,
    '    applyGuardQuaternionOffsetsWeighted(THREE, character.rig, guardOffsets, active.profile.correctionWeight);\n    character.update?.(0, input.camera);',
    '    applyGuardQuaternionOffsetsWeighted(THREE, character.rig, guardOffsets, active.profile.correctionWeight);\n    blendPresentationEntryPose(character, active.entryPose, entryBlendProgress);\n    if (shieldArmPose) restoreBoneQuaternionPose(character, shieldArmPose);\n    character.update?.(0, input.camera);',
    'apply bridge while preserving externally-owned shield arm',
  );
  next = replaceOnce(
    next,
    '      progress,\n      readyForAuthoritativeHandoff:',
    "      progress,\n      entryBlendProgress,\n      shieldArmOwnership: preserveShieldArm ? 'external-active-intercept-tracking' : 'predictive-presentation',\n      readyForAuthoritativeHandoff:",
    'bridge and ownership telemetry',
  );
  return next;
});

console.log('R18N.1 stable active shield intercept integration applied.');
