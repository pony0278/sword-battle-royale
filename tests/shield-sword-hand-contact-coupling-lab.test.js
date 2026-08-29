import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url),
  'utf8',
);
const preContactSource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url),
  'utf8',
);
const contactLifecycleDirectorSource = readFileSync(
  new URL('../src/combat/contact-lifecycle-director.js', import.meta.url),
  'utf8',
);
const parryInterceptDirectorSource = readFileSync(
  new URL('../src/combat/parry-intercept-director.js', import.meta.url),
  'utf8',
);
const guardCoverageDirectorSource = readFileSync(
  new URL('../src/combat/guard-coverage-director.js', import.meta.url),
  'utf8',
);
const contactHandoffSource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/contact-handoff-controller.js', import.meta.url),
  'utf8',
);
const labUiSource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url),
  'utf8',
);
const frameReportingSource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/frame-reporting.js', import.meta.url),
  'utf8',
);
const diagnosticFormattersSource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/diagnostic-formatters.js', import.meta.url),
  'utf8',
);
const stanceDebugSource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/stance-debug-controls.js', import.meta.url),
  'utf8',
);
const inspectionOverlaySource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/inspection-overlay.js', import.meta.url),
  'utf8',
);
const liveContactConstraintSource = readFileSync(
  new URL('../src/combat/live-shield-sword-grip-contact-constraint.js', import.meta.url),
  'utf8',
);
const postContactOwnershipSource = `${source}\n${contactHandoffSource}\n${contactLifecycleDirectorSource}`;
const html = readFileSync(
  new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url),
  'utf8',
);
const cameraSource = readFileSync(
  new URL('../tools/action-studio/free-inspection-camera-controls.js', import.meta.url),
  'utf8',
);
const sceneCompositionSource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/lab-scene.js', import.meta.url),
  'utf8',
);
const attackerPresentationSource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/attacker-presentation.js', import.meta.url),
  'utf8',
);
const verificationReportSource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/verification-report.js', import.meta.url),
  'utf8',
);
const diagnosticTelemetrySource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/diagnostic-telemetry.js', import.meta.url),
  'utf8',
);
const reportSerializationSource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/report-serialization.js', import.meta.url),
  'utf8',
);
const directOldB3DiagnosticSource = readFileSync(
  new URL('../tools/action-studio/shield-parry-r281/direct-old-b3-diagnostic.js', import.meta.url),
  'utf8',
);

function functionBody(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist`);
  return source.slice(start, end);
}

function preContactFunctionBody(name, nextName) {
  const start = preContactSource.indexOf(`function ${name}(`);
  const end = preContactSource.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} must exist in pre-contact controller`);
  assert.notEqual(end, -1, `${nextName} must exist in pre-contact controller`);
  return preContactSource.slice(start, end);
}

test('Step 3A exposes an explicit live contact inspection state and markers', () => {
  assert.match(html, /Live Shield → Sword → Wrist-Grip Constraint/);
  assert.match(html, /Cyan = shield target/);
  assert.match(html, /yellow = sword contact/);
  assert.match(html, /confirmed real Parry uses the same bridge as a fail-safe and cannot remain frozen/);
  assert.match(html, /the 7\/7 inspection \(all directions\)/);
  assert.match(labUiSource, /STEP 3A HOLD · LIVE CONTACT VERIFIED/);
  assert.match(labUiSource, /formatInspectionFailureSummary/);
  assert.match(labUiSource, /failedGateCount/);
  assert.match(labUiSource, /formatTerminalState/);
  assert.match(verificationReportSource, /contactGeometryDiagnostic: describeContactGeometry/);
  assert.match(diagnosticFormattersSource, /bladePercent/);
  assert.match(diagnosticFormattersSource, /shieldRegion/);
});

test('Step 3A provides a free inspection camera without changing combat time', () => {
  assert.match(sceneCompositionSource, /createFreeInspectionCameraControls/);
  assert.match(source, /freeCamera\.update\(rawDeltaMs \/ 1000\)/);
  assert.match(frameReportingSource, /inspectionCameraSnapshot: freeCamera\.snapshot\(\)/);
  assert.match(verificationReportSource, /inspectionCamera: inspectionCameraSnapshot/);
  assert.match(html, /Free inspection camera/);
  assert.match(html, /W A S D · Q down · E up/);
  assert.match(cameraSource, /pointerdown/);
  assert.match(cameraSource, /pointermove/);
  assert.match(cameraSource, /wheel/);
  assert.match(cameraSource, /KeyW/);
});

test('R18E exposes URL-gated low-stance tuning without changing real-contact authority', () => {
  assert.match(html, /id="stanceDebugPanel" hidden/);
  assert.match(html, /id="debugLeadMs" type="range"/);
  assert.match(html, /id="debugMaxCrouchCm" type="range"/);
  assert.match(html, /id="debugCrouchSpeed" type="range"/);
  assert.match(html, /id="debugEdgeCm" type="range"/);
  assert.match(html, /id="debugPlaneCm" type="range"/);
  assert.match(html, /id="debugLowGapCm" type="range"/);
  assert.match(html, /id="debugDownRatio" type="range"/);
  assert.match(html, /id="debugKneeBandCm" type="range"/);
  assert.match(html, /id="debugArmAttemptCm" type="range"/);
  assert.match(html, /APPLY \+ RETRY/);
  assert.match(source, /DEBUG_QUERY\.get\('debug'\) === '1'/);
  assert.match(stanceDebugSource, /rawQueryValue == null \|\| rawQueryValue\.trim\(\) === ''/);
  assert.match(stanceDebugSource, /\? Number\.NaN/);
  assert.match(stanceDebugSource, /query: 'leadMs'/);
  assert.match(stanceDebugSource, /query: 'crouchCm'/);
  assert.match(stanceDebugSource, /query: 'crouchSpeed'/);
  assert.match(stanceDebugSource, /query: 'edgeCm'/);
  assert.match(stanceDebugSource, /query: 'planeCm'/);
  assert.match(stanceDebugSource, /query: 'lowGapCm'/);
  assert.match(stanceDebugSource, /query: 'downRatio'/);
  assert.match(stanceDebugSource, /query: 'kneeBandCm'/);
  assert.match(stanceDebugSource, /query: 'armAttemptCm'/);
  assert.match(preContactSource, /stanceProfile: debugMode \? debugStanceProfile : null/);
  assert.match(parryInterceptDirectorSource, /profile: stanceProfile,/);
  assert.match(diagnosticFormattersSource, /DEBUG pred \$\{predictedDecision\}/);
  assert.match(diagnosticFormattersSource, /anticipatedEligibilityReason/);
  assert.match(diagnosticFormattersSource, /pflags \$\{predictedFlags\}/);
  assert.match(verificationReportSource, /latestThreatSelection/);
  assert.match(verificationReportSource, /debug-profile-changes-posture-guidance-only-real-swept-contact-remains-success-authority/);
  assert.match(contactLifecycleDirectorSource, /if \(!contactEvaluation\.contact\)/);
});

test('Step 3A renders and reports all three original-attack-line clearance gates', () => {
  assert.match(inspectionOverlaySource, /originalAttackAxisLine/);
  assert.match(inspectionOverlaySource, /currentSwordAxisLine/);
  assert.match(inspectionOverlaySource, /currentWristGripLine/);
  assert.match(labUiSource, /LINE CLEAR \$\{lineGate\(lineClearance\.pass\)\}/);
  assert.match(html, /sword axis ≥ 7° · hilt offline ≥ 2\.5cm · wrist→grip ≥ 7°/);
  assert.match(html, /red = original attack axis/);
});
test('Step 3A starts only after the manual gate confirms eligible real contact', () => {
  // R18S.4: the gate-then-grip sequence lives in the lifecycle director.
  const resolveStart = contactLifecycleDirectorSource.indexOf('function resolveContact(');
  const resolveEnd = contactLifecycleDirectorSource.indexOf('function advanceCombat(', resolveStart);
  assert.ok(resolveStart >= 0 && resolveEnd > resolveStart);
  const resolve = contactLifecycleDirectorSource.slice(resolveStart, resolveEnd);
  const geometry = resolve.indexOf('const geometricContact = probeSweptSwordBucklerContact({');
  const temporalEligibility = resolve.indexOf('let contactEvaluation = evaluateSweptContactTemporalEligibility({', geometry);
  const reject = resolve.indexOf('if (!contactEvaluation.contact) {', temporalEligibility);
  const confirm = resolve.indexOf('confirmParry({ attackSnapshot, contact: contactEvaluation })', reject);
  const resolveCombat = resolve.indexOf('combatResult = resolveCombat({', confirm);
  const liveConstraint = resolve.indexOf('gripReport = gripConstraint.start({', resolveCombat);

  assert.ok(
    geometry >= 0
      && temporalEligibility > geometry
      && reject > temporalEligibility
      && confirm > reject
      && resolveCombat > confirm
      && liveConstraint > resolveCombat,
  );
  assert.doesNotMatch(resolve, /publishPostCouplingRecoilStaggerHandoff/);
});

test('R18I lets live contact own the final pose while OLD B3 waits at presentation origin', () => {
  const frameStart = source.indexOf('function frame(');
  const frameEnd = source.indexOf('requestAnimationFrame(frame);', frameStart);
  assert.ok(frameStart >= 0 && frameEnd > frameStart);
  const frame = source.slice(frameStart, frameEnd);
  const combatDelegate = frame.indexOf('contactHandoffController.updateCombatBeforeGuard({');
  const guardUpdate = frame.indexOf('guardRuntime.update(deltaMs, camera)', combatDelegate);
  const deflectLatch = frame.indexOf('contactHandoffController.updateDefenderDeflectReleaseGate()', guardUpdate);
  const liveDelegate = frame.indexOf('contactHandoffController.updateLiveConstraintAfterGuard({', deflectLatch);
  const swordUpdate = frame.indexOf('attackerSword.update(); defenderSword?.update();', liveDelegate);
  assert.ok(combatDelegate >= 0 && guardUpdate > combatDelegate && deflectLatch > guardUpdate);
  assert.ok(liveDelegate > deflectLatch && swordUpdate > liveDelegate);

  // R18S.4: the live-hold and post-guard constraint phases live in the lifecycle director.
  const beforeGuardStart = contactLifecycleDirectorSource.indexOf('function advanceCombat(');
  const beforeGuardEnd = contactLifecycleDirectorSource.indexOf('function advanceConstraint(', beforeGuardStart);
  const beforeGuard = contactLifecycleDirectorSource.slice(beforeGuardStart, beforeGuardEnd);
  const afterGuard = contactLifecycleDirectorSource.slice(beforeGuardEnd);
  for (const marker of [
    'if (ownsLiveContact())',
    'TWO_ACTOR_PARRY_REACTION_CHANNELS.LIVE_CONTACT_BODY',
    'TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES.LIVE_CONTACT_IMPULSE_PEAK',
    'holdAttackerInterruption: true',
  ]) assert.ok(beforeGuard.includes(marker), marker);
  for (const marker of [
    'gripConstraint.update(deltaSeconds',
    'surfaceAtFrame: readShieldSurface()',
    'reactionIntentAppliedBeforeConstraint: true',
    'release({',
  ]) assert.ok(afterGuard.includes(marker), marker);

  for (const marker of [
    'publishPostCouplingRecoilStaggerHandoff',
    'releasedToOldB3',
    'b3BodyClockStartedAtImpact: true',
    'fullOldB3ReactionIntentActiveAtImpact: false',
    'contactConstraintOwnsUntilDeflectImpulse: true',
    'proximalAssistBone',
  ]) assert.ok(postContactOwnershipSource.includes(marker), marker);
  assert.ok(verificationReportSource.includes('boundedProximalArmCorrectionBeforeForearmAndWrist'));
  assert.ok(verificationReportSource.includes('weaponArmRemainsContactConstrainedDuringStep3A'));
  assert.ok(contactLifecycleDirectorSource.includes('frozenContactPose = captureRigPose(attackerRig)'));
  assert.ok(attackerPresentationSource.includes('applyRigPose(attacker.rig, exchangeState.frozenAttackerContactPose)'));
  assert.ok(attackerPresentationSource.includes('exchangeState.canonicalAttackerOldB3Pose = captureRigPose(attacker.rig)'));
  assert.ok(attackerPresentationSource.includes('sampleCanonicalInterruptionPose(interruption)'));
  assert.ok(verificationReportSource.includes('frozenContactPoseRestoredBeforeEveryBodyOverlay'));
  assert.ok(verificationReportSource.includes('bodyCompletionCannotReleaseContactOwnedPose'));
  assert.ok(verificationReportSource.includes('contactOwnsWeaponArmWhileOldB3BodyRuns'));
  assert.ok(verificationReportSource.includes('b3BodyClockRunsToImpulsePeakDuringLiveContact'));
});

test('R18I preserves predictive defender time and latches the defender deflect marker', () => {
  const resolveStart = contactLifecycleDirectorSource.indexOf('function resolveContact(');
  const resolveEnd = contactLifecycleDirectorSource.indexOf('function advanceCombat(', resolveStart);
  const releaseStart = contactLifecycleDirectorSource.indexOf('function release(');
  const releaseEnd = contactLifecycleDirectorSource.indexOf('function resolveContact(', releaseStart);
  assert.ok(resolveStart >= 0 && resolveEnd > resolveStart && releaseStart >= 0 && releaseEnd > releaseStart);
  const resolve = contactLifecycleDirectorSource.slice(resolveStart, resolveEnd);
  const release = contactLifecycleDirectorSource.slice(releaseStart, releaseEnd);

  assert.match(resolve, /predictiveHandoff\.defenderPresentationOffsetSeconds/);
  assert.match(resolve, /defenderPresentationOffsetSeconds:/);
  assert.match(contactLifecycleDirectorSource, /function defenderReleaseGate\(\)/);
  assert.match(contactLifecycleDirectorSource, /function advanceDefender\(\)/);
  assert.match(contactHandoffSource, /latchedDefenderDeflectReleaseGate/);
  assert.match(contactLifecycleDirectorSource, /latched-defender-deflect-marker-gates-attacker-release/);
  assert.match(contactLifecycleDirectorSource, /PARRY_ATTACKER_RELEASE_SOURCE_SECONDS/);
  assert.match(release, /if \(!gate\.passed\)/);
  assert.match(release, /defender-deflect-marker-not-reached/);
  assert.match(release, /allowConfirmedParryFallback: true/);
  assert.match(verificationReportSource, /defenderParryPresentationNeverRewindsAtContact/);
  assert.match(verificationReportSource, /oldB3WeaponArmReleasedOnlyAfterDefenderDeflectMarker/);
});

test('R18I releases contact through 28ms continuity and starts canonical OLD B3 from zero', () => {
  const frameStart = source.indexOf('function frame(');
  const frameEnd = source.indexOf('requestAnimationFrame(frame);', frameStart);
  const frame = source.slice(frameStart, frameEnd);
  const combatDelegate = frame.indexOf('contactHandoffController.updateCombatBeforeGuard({');
  const guardUpdate = frame.indexOf('guardRuntime.update(deltaMs, camera)', combatDelegate);
  const deflectLatch = frame.indexOf('contactHandoffController.updateDefenderDeflectReleaseGate()', guardUpdate);
  const liveDelegate = frame.indexOf('contactHandoffController.updateLiveConstraintAfterGuard({', deflectLatch);
  assert.ok(combatDelegate >= 0 && guardUpdate > combatDelegate && deflectLatch > guardUpdate && liveDelegate > deflectLatch);

  const beforeGuardStart = contactLifecycleDirectorSource.indexOf('function advanceCombat(');
  const beforeGuardEnd = contactLifecycleDirectorSource.indexOf('function advanceConstraint(', beforeGuardStart);
  const beforeGuard = contactLifecycleDirectorSource.slice(beforeGuardStart, beforeGuardEnd);
  assert.ok(beforeGuard.includes('postCouplingHandoffApplied === true'));
  assert.ok(beforeGuard.includes('handoffConsumedByOldB3: true'));
  for (const marker of [
    'oldB3ReleaseStartPresentationMs',
    'continuityBridgeMs',
    'continuationStartedAtPresentationMs',
    'bodyRestartedAtRelease: false',
    'continuationPlanIdentityPreserved',
    'continuationElapsedPreserved',
    'attackerReactionDefinitionId',
    'oldB3PlanBackwardPitchDegrees',
    'oldB3AppliedBodyChainPitchAtReleaseDegrees',
    'oldB3InitialElapsedMs',
    'OLD B3 ARM JOINED',
    'weapon-arm-contact-pose-fades-into-contact-base-while-old-b3-body-keeps-running',
  ]) assert.ok(postContactOwnershipSource.includes(marker), marker);
  assert.ok(verificationReportSource.includes('parryImpactSelectsExaggeratedOldB3ReactionDefinition'));
  assert.ok(contactLifecycleDirectorSource.includes('deflect-impulse-continuity-bridge-weapon-arm-joins-running-old-b3'));
  assert.ok(source.includes("from '../../src/combat/post-coupling-recoil-stagger-handoff.js';"));
  assert.ok(!source.includes('post-coupling-recoil-stagger-handoff.js?v='));
  assert.ok(verificationReportSource.includes('deflectImpulseContinuesRunningOldB3WithoutBodyRestart'));
  assert.ok(postContactOwnershipSource.includes('measureAttackerRecoilWorldSilhouette'));
  assert.ok(verificationReportSource.includes('visibleOldB3Peak?.readable === true'));
  assert.ok(!source.includes('visibleOldB3Peak?.backwardChainPitchDegrees'));
  assert.match(html, /OLD B3 torso and legs run from impact and latch at the impulse peak/);
});

test('Step 3A uses bounded lowerarm plus wrist hierarchy travel instead of a scheduled target angle', () => {
  assert.match(liveContactConstraintSource, /modifiedBone: 'wrist\.r'/);
  assert.match(liveContactConstraintSource, /propagatedBones: active\.plan\.propagatedBones/);
  assert.match(liveContactConstraintSource, /assistBone: forearmAssist\.accepted \? 'lowerarm\.r' : null/);
  assert.match(source, /blendRecoveryPose/);
  assert.match(contactLifecycleDirectorSource, /noPresetMotionCurve: true/);
  assert.match(liveContactConstraintSource, /actualHandTravelMeters/);
  assert.match(liveContactConstraintSource, /actualGripTravelMeters/);
  assert.match(liveContactConstraintSource, /residualCorrectionPasses/);
  assert.match(liveContactConstraintSource, /appliedResidualForearmDegrees/);
  assert.match(verificationReportSource, /oldB3WeaponArmReleasedAfterInspectionOrConfirmedFallback/);
  assert.match(verificationReportSource, /contactQaCannotPermanentlySuppressConfirmedParryOldB3/);
  const armOwnershipSource = [source, liveContactConstraintSource, contactHandoffSource].join('\n');
  assert.doesNotMatch(armOwnershipSource, /targetHandDegrees|driveDurationMs|smoothstep/);
});

test('Step 3A does not add the live grip constraint to the original Block pre-contact path', () => {
  const block = preContactFunctionBody('updateBlockPreContact', 'updateParryPreContact');
  assert.match(block, /planArticulatedImpactBracing/);
  assert.match(block, /guardCoverageDirector\.update/);
  assert.doesNotMatch(block, /swordGripConstraint/);
});

test('Step 1 direct OLD B3 remains independent of Step 3A runtime', () => {
  const directB3 = functionBody('forceOldTwoActorB3', 'startAttack');
  assert.match(directB3, /directOldB3DiagnosticController\.run/);
  assert.match(directOldB3DiagnosticSource, /publishPostCouplingRecoilStaggerHandoff/);
  assert.match(directOldB3DiagnosticSource, /combat\.update\(0\.021/);
  assert.doesNotMatch(directOldB3DiagnosticSource, /swordGripConstraint\.start/);
});

test('Step 3A classifies a Parry whiff from measured sweep geometry without changing contact authority', () => {
  assert.match(html, /outside shield edge \/ missed shield plane \/ outside active window/);
  assert.match(html, /final plane\/edge gap · persistent arm tracking/);
  assert.match(source, /buildParryWhiffDiagnostic/);
  assert.match(preContactSource, /function recordWhiffProbe/);
  assert.match(preContactSource, /probe\.diagnostics\?\.closestApproach/);
  assert.match(diagnosticFormattersSource, /CONTACT_OUTSIDE_ACTIVE_WINDOW: 'CONTACT OUTSIDE ACTIVE WINDOW'/);
  assert.match(diagnosticFormattersSource, /OUTSIDE_SHIELD_EDGE: 'OUTSIDE SHIELD EDGE'/);
  assert.match(diagnosticFormattersSource, /MISSED_SHIELD_PLANE: 'MISSED SHIELD PLANE'/);
  assert.match(verificationReportSource, /authority: 'presentation-diagnostic-only-no-combat-authority'/);
  assert.match(contactLifecycleDirectorSource, /if \(!contactEvaluation\.contact\)/);
  assert.doesNotMatch(preContactSource, /parryGate\.confirm|combat\.resolveContact/);
});
test('Step 3A replaces only an unreachable linear target with reachable measured sweep guidance', () => {
  // R18S.3: the fallback decision moved into the director with the ladder it feeds.
  assert.match(parryInterceptDirectorSource, /selectReachableParryInterceptTarget/);
  assert.match(parryInterceptDirectorSource, /measureSweptSwordBucklerClosestApproach/);
  assert.match(parryInterceptDirectorSource, /predictedTrackingPlan: predictiveAnalysis\?\.trackingPlan/);
  assert.match(parryInterceptDirectorSource, /threat: interceptTarget\.threat/);
  assert.match(verificationReportSource, /measuredSweepFallbackIsGuidanceOnly/);
  assert.match(verificationReportSource, /realSweptContactRequired/);
  assert.match(html, /MEASURED SWEEP preserves world direction \+ 1\.2cm inset/);
  assert.match(html, /real contact still required/);
});
test('armed Parry samples a continuous post-tracking shield surface before selecting and driving the next frame', () => {
  const update = preContactFunctionBody('updateParryPreContact', 'updatePreContact');
  // The lab hands the ladder last frame's post-tracking shield as the selector baseline...
  const presentation = update.indexOf('predictivePresentation.update');
  const reach = update.indexOf('parryInterceptDirector.reach({');
  assert.ok(presentation >= 0 && reach > presentation);
  assert.match(
    update.slice(reach),
    /continuitySurface: exchangeState\.previousShieldLeadSurface/,
    'the ladder is handed last frame\'s post-tracking shield, not this frame\'s rebuilt one',
  );
  // ...and the ladder measures against it, selects on it, plans from it, then drives.
  const measure = parryInterceptDirectorSource.indexOf('measure(previousBlade, currentBlade, selectorSurface)');
  const select = parryInterceptDirectorSource.indexOf('selectReachableParryInterceptTarget({');
  const plan = parryInterceptDirectorSource.indexOf('planGuardThreatCorrection({');
  const drive = parryInterceptDirectorSource.indexOf('trackingRuntime.update(plan, deltaSeconds)');
  assert.ok(measure >= 0 && select > measure && plan > select && drive > plan);
  assert.match(preContactSource, /selectorBaseline: 'previous-frame-post-tracking-world-shield-surface'/);
  assert.match(
    parryInterceptDirectorSource,
    /interceptTarget\?\.fallbackApplied\s*\n\s*\? interceptTarget\.trackingPlan/,
    'a measured contact correction is preferred over a predicted one',
  );
  assert.match(preContactSource, /drivePlanSource: activeIntentPlan[\s\S]*exchangeState\.latestReachableInterceptTarget\?\.fallbackApplied/);
  assert.match(preContactSource, /surface-relative-measured-contact-correction/);
  assert.match(preContactSource, /correctionDirectionDot/);
  assert.match(preContactSource, /measuredRadialContactCorrectionMeters/);
  assert.match(source, /function driveAcceptedParry\(snapshot\) \{[\s\S]*predictivePresentation\.start/);
  assert.match(update, /if \(predictivePresentation\.active\) \{/);
  assert.match(diagnosticFormattersSource, /selector NO ARMED DRIVE FRAME/);
  assert.match(html, /BEST PARRY TIMING · R18I/);
});
test('armed Parry recruits predicted or measured low stance, holds it, and preserves contact authority', () => {
  const update = preContactFunctionBody('updateParryPreContact', 'updatePreContact');
  // R18S.3: each rung is measured against the shield the rung before it just moved, so the order
  // is the whole contract - and it is the director's.
  const ladder = parryInterceptDirectorSource;
  const primaryDrive = ladder.indexOf('trackingRuntime.update(plan, deltaSeconds)');
  const residualBefore = ladder.indexOf('const residualBeforeRefinement', primaryDrive);
  const residualSelect = ladder.indexOf('const residualInterceptTarget', residualBefore);
  const refine = ladder.indexOf('trackingRuntime.refineMeasuredContact', residualSelect);
  const residualAfterArm = ladder.indexOf('const residualAfterArmRefinement', refine);
  const bodyReach = ladder.indexOf('bodyReachRuntime.update({', residualAfterArm);
  const residualAfterBody = ladder.indexOf('const residualAfterBodyReach', bodyReach);
  const stanceReach = ladder.indexOf('stanceRuntime.update({', residualAfterBody);
  assert.ok(primaryDrive >= 0 && residualBefore > primaryDrive && residualSelect > residualBefore);
  assert.ok(refine > residualSelect && residualAfterArm > refine && bodyReach > residualAfterArm);
  assert.ok(residualAfterBody > bodyReach && stanceReach > residualAfterBody);
  assert.match(ladder, /jointBudgetScale: 0\.35/);
  assert.match(ladder, /maxResidualMeters: 0\.06/);
  for (const reduction of [
    /residualEdgeReductionMeters/, /residualPlaneReductionMeters/,
    /bodyEdgeReductionMeters/, /bodyPlaneReductionMeters/,
    /stanceEdgeReductionMeters/, /stancePlaneReductionMeters/,
  ]) {
    assert.match(ladder, reduction, 'the director measures it');
    assert.match(update, reduction, 'and the lab still reports it');
  }
  assert.match(source, /createGuardResidualBodyReachRuntime/);
  assert.match(source, /createGuardResidualStanceReachRuntime/);
  assert.match(update, /predictiveAnalysis: exchangeState\.latestPredictiveAnalysis/);
  assert.match(ladder, /anticipatedClosestApproach: predictiveAnalysis\?\.threat\?\.worldPoint/);
  assert.match(ladder, /point: predictiveAnalysis\.threat\.worldPoint/);
  assert.match(ladder, /anticipatedLeadSeconds: predictiveAnalysis\?\.threat\?\.futureSeconds/);  assert.match(preContactSource, /persistent-arm-carry-then-predicted-or-measured-low-threat-planted-stance-held-to-real-contact-or-reset-diagnostic/);
  assert.match(diagnosticFormattersSource, /residual edge \$\{edgeBefore\}→\$\{edgeAfter\}/);
  assert.match(diagnosticFormattersSource, /carry \$\{carryBefore\}→\$\{carryAfter\}/);
  assert.match(diagnosticFormattersSource, /refine \$\{refinementStep\} · rdir \$\{refinementDirection\}/);
  assert.match(diagnosticFormattersSource, /arm \$\{armReach\} · aedge \$\{edgeBefore\}→\$\{armEdgeAfter\} · wrist \$\{wristDegrees\}/);
  assert.match(diagnosticFormattersSource, /torso \$\{torsoDegrees\} · reach \$\{bodyReachBefore\}→\$\{bodyReachAfter\}/);
  assert.match(diagnosticFormattersSource, /sampledThreat\?\.kneeLineThreat/);
  assert.match(diagnosticFormattersSource, /y blade\/rim\/kneeL\/kneeR/);
  assert.match(diagnosticFormattersSource, /earlyLowThreatRecruitment/);
  assert.match(diagnosticFormattersSource, /stance src/);
  assert.match(diagnosticFormattersSource, /lead ' \+ stanceLead/);
  assert.match(diagnosticFormattersSource, /hold ' \+ stanceHold/);
  assert.match(diagnosticFormattersSource, /target ' \+ crouchTarget/);  assert.match(diagnosticFormattersSource, /stance \$\{stanceState\} · down \$\{downwardRatio\} · crouch/);
  assert.match(diagnosticFormattersSource, /feet \$\{footL\}\/\$\{footR\} \$\{planted\}/);
  assert.match(html, /compares the measured sword point with the predicted future sword point/);
  assert.match(html, /defender wrist\.l · chest · spine · hips · upper\/lower legs · foot orientation correction/);
  // The pre-contact no-step guarantee is now stated as the zero-displacement
  // window: nothing may move while the swept probe owns parry success.
  assert.match(html, /zero displacement while the swept probe owns success/);
  // R18S.2: Guard's own reaches moved into its director, so that is where these hold now.
  // R18R.6: Guard may close its own measured residual, but only at Guard's budget - the plan it
  // refines with has to be a guard-mode plan, never Parry's.
  assert.match(guardCoverageDirectorSource, /trackingRuntime\.refineMeasuredContact\(plan, deltaSeconds, RESIDUAL_REFINEMENT\)/);
  assert.match(guardCoverageDirectorSource, /planGuardThreatCorrection\(\{ mode: 'guard', threat: target\.threat/);
  // R18R.10: Guard recruits the planted crouch too, in its own mode and on its own profile.
  assert.match(guardCoverageDirectorSource, /stanceRuntime\.update\(\{\s*\n\s*mode: tracking \? 'guard' : 'off',\s*\n\s*profile: GUARD_MODE_STANCE_REACH_PROFILE,/);
  // The body reach stays Parry-only, in both places: Guard drops, it does not lean.
  const block = preContactFunctionBody('updateBlockPreContact', 'updateParryPreContact');
  assert.doesNotMatch(block, /residualBodyReachRuntime/);
  assert.doesNotMatch(guardCoverageDirectorSource, /residualBodyReach|BodyReachRuntime/);
});

test('F review batches presentation rebuilds and avoids dynamic debug bounds work', () => {
  const update = preContactFunctionBody('updateParryPreContact', 'updatePreContact');
  const defenderUpdateCount = update.split('defender.update(0, camera)').length - 1;
  const swordUpdateCount = update.split('defenderSword?.update()').length - 1;
  const stanceSolve = update.indexOf('parryInterceptDirector.reach({');
  const presentationUpdate = update.indexOf('defender.update(0, camera)', stanceSolve);

  assert.equal(defenderUpdateCount, 1);
  assert.equal(swordUpdateCount, 1);
  assert.ok(stanceSolve >= 0 && presentationUpdate > stanceSolve);

  assert.doesNotMatch(inspectionOverlaySource, /computeBoundingSphere/);
  assert.match(inspectionOverlaySource, /contactTravelLine\.frustumCulled = false/);
  assert.match(inspectionOverlaySource, /line\.frustumCulled = false/);

  const cueStart = labUiSource.indexOf('function showParryCue(');
  const cueEnd = labUiSource.indexOf('function updateParryCue(', cueStart);
  assert.ok(cueStart >= 0 && cueEnd > cueStart);
  const cue = labUiSource.slice(cueStart, cueEnd);
  assert.ok(cue.includes('state === parryCueState'));
  assert.ok(cue.includes(') return;'));
});

test('R18I keeps Parry review telemetry compact and caps Verification DOM work', () => {
  const compactStart = diagnosticTelemetrySource.indexOf('export function compactInterceptDriveTelemetry(');
  const compactEnd = diagnosticTelemetrySource.indexOf('export function compactInterceptDriveTraceFrame(', compactStart);
  assert.ok(compactStart >= 0 && compactEnd > compactStart);
  const compact = diagnosticTelemetrySource.slice(compactStart, compactEnd);
  const traceStart = diagnosticTelemetrySource.indexOf('export function compactInterceptDriveTraceFrame(');
  const traceEnd = diagnosticTelemetrySource.indexOf('function compactPredictiveThreat(', traceStart);
  assert.ok(traceStart >= 0 && traceEnd > traceStart);
  const traceCompact = diagnosticTelemetrySource.slice(traceStart, traceEnd);

  assert.match(source, /const MAX_REPORT_DOM_CHARACTERS = 60000/);
  assert.match(source, /const RECENT_COMPACT_TRACE_FRAMES = 8/);
  assert.match(preContactSource, /exchangeState\.interceptDriveTrace\.push\(compactInterceptDriveTraceFrame\(exchangeState\.latestInterceptDriveReport\)\)/);
  assert.match(verificationReportSource, /recentFrames: Object\.freeze\(exchangeState\.interceptDriveTrace\.slice\(-recentCompactTraceFrames\)\)/);
  assert.match(compact, /telemetryDetail: 'compact-scalar-frame'/);
  assert.match(compact, /compactGap\(value\.residualAfterRefinement\)/);
  assert.match(compact, /compactBodyReach\(value\.residualBodyReach\)/);
  assert.match(compact, /compactStanceReach\(value\.residualStanceReach\)/);
  assert.doesNotMatch(traceCompact, /anticipatedPlan|threatSelection|residualRefinement|residualBodyReach/);
  assert.match(verificationReportSource, /compactTelemetryDoesNotRetainSolverGraphs/);
  assert.match(verificationReportSource, /liveShieldSwordGripContactConstraint: compactLiveContactConstraint\(exchangeState\.latestGripConstraintReport\)/);
  assert.match(verificationReportSource, /predictiveAnalysis: compactPredictiveAnalysis\(exchangeState\.latestPredictiveAnalysis\)/);
  assert.match(verificationReportSource, /interceptTarget: compactReachableInterceptTarget\(exchangeState\.latestReachableInterceptTarget\)/);
  assert.match(reportSerializationSource, /reportText\.length <= maxCharacters/);
  assert.match(reportSerializationSource, /reason: 'verification-report-exceeded-dom-budget'/);
  assert.match(frameReportingSource, /windowRef\.__G43B5R281_PERF__/);
  assert.match(html, /Verification report .* 60,000 characters.*compact scalar frames only/);
});
