import {
  evaluateSweptContactTemporalEligibility,
} from '../../../src/combat/swept-contact-temporal-eligibility.js';

const WEAPON_ARM_RELEASE_BONES = Object.freeze(['upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r', 'handslot.r']);

export function createShieldParryContactHandoffController({
  exchangeState,
  buckler,
  attacker,
  attackerSword,
  camera,
  combat,
  swordGripConstraint,
  guardRuntime,
  predictivePresentation,
  parryGate,
  preContactController,
  fineTrackingRuntime,
  residualBodyReachRuntime,
  residualStanceReachRuntime,
  constants,
  services,
  callbacks,
}) {
  const {
    TIMING_AGE_MS,
    PARRY_ATTACKER_RELEASE_SOURCE_SECONDS,
    LONGSWORD_ATTACK_PHASES,
    GUARD_STATES,
    COMMITTED_PARRY_CONTACT_GATE_STAGE,
    LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
    TWO_ACTOR_PARRY_REACTION_CHANNELS,
    TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES,
  } = constants;
  const {
    probeSweptSwordBucklerContact,
    captureRigPose,
    buildLiveParryOldB3Handoff,
    sampleLiveParryOldB3ReleaseBlend,
    publishPostCouplingRecoilStaggerHandoff,
    measureAttackerRecoilWorldSilhouette,
  } = services;
  const {
    captureCanonicalAttackerOldB3Base,
    captureAttackerWorldSilhouette,
    updateLiveContactMarkers,
    publishStatus,
    formatInspectionFailureSummary,
  } = callbacks;

  function ownsLiveContact() {
    return Boolean(
      exchangeState.step3AContactTransfer?.accepted
      && exchangeState.latestParryConfirmation?.accepted
      && exchangeState.step3AContactTransfer.releasedToOldB3 !== true,
    );
  }

  function currentDefenderDeflectReleaseGate() {
    const report = guardRuntime.report;
    const sourceTimeSeconds = Math.max(0, Number(report?.sourceTimeSeconds) || 0);
    const passed = report?.state === GUARD_STATES.PARRY
      && sourceTimeSeconds + 1e-4 >= PARRY_ATTACKER_RELEASE_SOURCE_SECONDS;
    return Object.freeze({
      passed,
      state: report?.state || null,
      sourceTimeSeconds,
      requiredSourceTimeSeconds: PARRY_ATTACKER_RELEASE_SOURCE_SECONDS,
      marker: 'deflect-impulse',
      latched: false,
      authority: 'defender-reaction-marker-gates-attacker-release',
    });
  }

  function updateDefenderDeflectReleaseGate() {
    if (exchangeState.latchedDefenderDeflectReleaseGate) return exchangeState.latchedDefenderDeflectReleaseGate;
    const current = currentDefenderDeflectReleaseGate();
    if (!current.passed) return current;
    exchangeState.latchedDefenderDeflectReleaseGate = Object.freeze({
      ...current,
      latched: true,
      authority: 'latched-defender-deflect-marker-gates-attacker-release',
    });
    return exchangeState.latchedDefenderDeflectReleaseGate;
  }

  function defenderDeflectReleaseGate() {
    return exchangeState.latchedDefenderDeflectReleaseGate || currentDefenderDeflectReleaseGate();
  }

  function releaseLiveContactToOldB3({ selectedDirection }) {
    if (!ownsLiveContact()) {
      return Object.freeze({ accepted: false, reason: 'live-contact-no-longer-owns-presentation' });
    }
    const defenderReleaseGate = defenderDeflectReleaseGate();
    if (!defenderReleaseGate.passed) {
      return Object.freeze({
        accepted: false,
        reason: 'defender-deflect-marker-not-reached',
        defenderReleaseGate,
      });
    }
    const handoff = buildLiveParryOldB3Handoff({
      attackDirection: selectedDirection,
      contactReport: exchangeState.latestGripConstraintReport,
      surfaceAtContact: exchangeState.latestLiveSurfaceAtContact,
      confirmedParry: exchangeState.latestParryConfirmation?.accepted === true
        && exchangeState.firstContact?.eligible === true,
      allowConfirmedParryFallback: true,
    });
    if (!handoff.accepted) return handoff;
    const visibleReleasePose = captureRigPose(attacker.rig);
    const recoilPoseAtRelease = combat.snapshot.attackerRecoil?.sample?.pose || null;
    const appliedBodyChainPitchAtReleaseDegrees = recoilPoseAtRelease
      ? (Number(recoilPoseAtRelease.chestPitchDegrees) || 0)
        + (Number(recoilPoseAtRelease.spinePitchDegrees) || 0)
        + (Number(recoilPoseAtRelease.hipsPitchDegrees) || 0)
      : null;

    const handoffPublished = publishPostCouplingRecoilStaggerHandoff(attacker.rig, {
      couplingReport: handoff.couplingReport,
      surfaceAtContact: handoff.surfaceAtContact,
    });
    if (!handoffPublished) {
      return Object.freeze({ ...handoff, accepted: false, reason: 'old-b3-handoff-publish-failed' });
    }

    const contactBasePose = exchangeState.frozenAttackerContactPose
      || exchangeState.canonicalAttackerOldB3Pose;
    const releaseSourcePose = { ...contactBasePose };
    for (const armBone of WEAPON_ARM_RELEASE_BONES) {
      if (visibleReleasePose[armBone]) releaseSourcePose[armBone] = visibleReleasePose[armBone];
    }
    exchangeState.step3AReleaseBlend = {
      elapsedMs: 0,
      durationMs: handoff.releaseBlendMs,
      sample: sampleLiveParryOldB3ReleaseBlend(0, handoff.releaseBlendMs),
      sourcePose: Object.freeze(releaseSourcePose),
      targetPose: contactBasePose,
      authority: 'weapon-arm-contact-pose-fades-into-contact-base-while-old-b3-body-keeps-running',
    };
    exchangeState.step3AContactTransfer = Object.freeze({
      ...exchangeState.step3AContactTransfer,
      releasedToOldB3: true,
      releaseHandoff: handoff,
      defenderReleaseGate,
      handoffPublished: true,
      handoffConsumedByOldB3: false,
      b3BodyClockStartedAtImpact: true,
      oldB3ReleaseStartPresentationMs:
        combat.snapshot.attackerRecoil?.phaseClock?.latchPointMs ?? null,
      continuityBridgeMs: handoff.releaseBlendMs,
      visibleOldB3BodyStartedAtImpact: true,
      weaponArmJoinsOldB3AtDeflectImpulse: true,
      oldB3AppliedBodyChainPitchAtReleaseDegrees: appliedBodyChainPitchAtReleaseDegrees,
      continuationStartedAtPresentationMs: null,
      continuationStartedAtImpactClockMs: null,
      bodyRestartedAtRelease: false,
      continuationPlanIdentityPreserved: null,
      continuationElapsedPreserved: null,
      weaponArmContactConstrained: false,
    });
    return Object.freeze({ ...handoff, handoffPublished: true });
  }

  function recordVisibleOldB3Sample(combatUpdate) {
    if (exchangeState.step3AContactTransfer?.releasedToOldB3 !== true) return;
    const recoilUpdate = combatUpdate?.recoilUpdate || null;
    const sample = recoilUpdate?.sample
      || recoilUpdate?.snapshot?.sample
      || combatUpdate?.attackerRecoil?.sample
      || null;
    if (!sample?.pose || sample.phase === 'contact-hold') return;
    const requestedLocalChainPitchDegrees = (Number(sample.pose.chestPitchDegrees) || 0)
      + (Number(sample.pose.spinePitchDegrees) || 0)
      + (Number(sample.pose.hipsPitchDegrees) || 0);
    const measurement = measureAttackerRecoilWorldSilhouette({
      baseline: exchangeState.canonicalAttackerOldB3WorldSilhouette,
      current: captureAttackerWorldSilhouette(),
      backwardDirection: exchangeState.latestCombatResult?.attackerReaction?.plan?.body?.direction,
      requestedLocalChainPitchDegrees,
    });
    if (!measurement.accepted) return;
    const readabilityScore = measurement.worldBackwardLeanDegrees
      + Math.max(0, measurement.headBackwardMeters) * 100
      + Math.max(0, measurement.shouldersBackwardMeters) * 100;
    if (
      exchangeState.visibleOldB3Peak
      && exchangeState.visibleOldB3Peak.readabilityScore >= readabilityScore
    ) return;
    const phaseClock = recoilUpdate?.phaseClock || recoilUpdate?.snapshot?.phaseClock || null;
    exchangeState.visibleOldB3Peak = Object.freeze({
      ...measurement,
      phase: sample.phase,
      presentationElapsedMs: phaseClock?.elapsedMs ?? null,
      readabilityScore,
      armWeight: sample.weights?.armWeight ?? null,
      torsoWeight: sample.weights?.torsoWeight ?? null,
      legWeight: sample.weights?.legWeight ?? null,
    });
  }

  function resolveContact(snapshot, currentBlade, deltaSeconds, context = {}) {
    const { previousBlade, selectedMode, selectedDirection } = context;
    if (!previousBlade || !snapshot.action || exchangeState.firstContact) return;
    const currentShieldSurface = buckler.getWorldParrySurface();
    const geometricContact = probeSweptSwordBucklerContact({
      previousBlade,
      currentBlade,
      bucklerSurface: currentShieldSurface,
      deltaSeconds,
      active: true,
    });
    // R18N.3 v6.4.2 observer-only moving-shield classification. Production contact
    // authority remains geometricContact above. This second solve only removes the
    // measured shield translation from the sword sweep so a hitch miss can be
    // classified without injecting or accepting a synthetic contact.
    const shieldTranslation = exchangeState.latestShieldLeadMotion?.translation || null;
    const relativePreviousBlade = shieldTranslation
      ? previousBlade.map((point) => ({
          x: point.x + (Number(shieldTranslation.x) || 0),
          y: point.y + (Number(shieldTranslation.y) || 0),
          z: point.z + (Number(shieldTranslation.z) || 0),
        }))
      : null;
    const relativeMovingShieldContact = relativePreviousBlade
      ? probeSweptSwordBucklerContact({
          previousBlade: relativePreviousBlade,
          currentBlade,
          bucklerSurface: currentShieldSurface,
          deltaSeconds,
          active: true,
        })
      : null;
    const relativeMovingShieldDiagnostic = relativeMovingShieldContact
      ? Object.freeze({
          contact: relativeMovingShieldContact.contact === true,
          geometricContact: relativeMovingShieldContact.geometricContact === true,
          reason: relativeMovingShieldContact.reason || null,
          sweepAlpha: relativeMovingShieldContact.sweepAlpha ?? null,
          closestApproach: relativeMovingShieldContact.diagnostics?.closestApproach || null,
          shieldTranslation: Object.freeze({
            x: Number(shieldTranslation.x) || 0,
            y: Number(shieldTranslation.y) || 0,
            z: Number(shieldTranslation.z) || 0,
          }),
          shieldTranslationMeters: Math.hypot(
            Number(shieldTranslation.x) || 0,
            Number(shieldTranslation.y) || 0,
            Number(shieldTranslation.z) || 0,
          ),
          shieldAngularRadians: exchangeState.latestShieldLeadMotion?.angularRadians ?? null,
          authority: 'observer-only-relative-translation-sweep',
        })
      : null;
    const geometricContactWithDiagnostic = Object.freeze({
      ...geometricContact,
      diagnostics: Object.freeze({
        ...(geometricContact.diagnostics || {}),
        relativeMovingShieldTranslation: relativeMovingShieldDiagnostic,
      }),
    });
    exchangeState.latestContact = evaluateSweptContactTemporalEligibility({
      contactReport: geometricContactWithDiagnostic,
      attackSnapshot: snapshot,
      deltaSeconds,
      fallbackEligible: snapshot.phase === LONGSWORD_ATTACK_PHASES.ACTIVE,
    });
    preContactController.recordWhiffProbe(snapshot, exchangeState.latestContact);
    if (!exchangeState.latestContact.contact) return;

    exchangeState.firstContact = exchangeState.latestContact;
    const surfaceAtContact = buckler.getWorldParrySurface();
    exchangeState.latestLiveSurfaceAtContact = surfaceAtContact;
    exchangeState.latestPredictiveHandoff = predictivePresentation.active ? predictivePresentation.handoff() : null;
    exchangeState.latestParryConfirmation = selectedMode === 'parry'
      ? parryGate.confirm({ attackSnapshot: snapshot, contact: exchangeState.latestContact })
      : null;
    const parryConfirmed = exchangeState.latestParryConfirmation?.accepted === true;
    const guardIntentAgeMs = parryConfirmed ? TIMING_AGE_MS.parry : TIMING_AGE_MS.block;

    exchangeState.frozenAttackerContactPose = captureRigPose(attacker.rig);
    exchangeState.latestCombatResult = combat.resolveContact({
      contact: exchangeState.latestContact,
      guardIntentAgeMs,
      defenderPresentationOffsetSeconds: exchangeState.latestPredictiveHandoff?.accepted
        ? exchangeState.latestPredictiveHandoff.defenderPresentationOffsetSeconds
        : undefined,
    });
    if (!exchangeState.latestCombatResult.accepted) {
      exchangeState.frozenAttackerContactPose = null;
      return;
    }
    captureCanonicalAttackerOldB3Base();
    guardRuntime.sync(camera);
    const outcome = exchangeState.latestCombatResult.resolution.outcome;

    if (outcome === 'parry' && parryConfirmed) {
      exchangeState.latestCombatUpdate = combat.update(0, { camera });
      attackerSword.update();
      exchangeState.latestGripConstraintReport = swordGripConstraint.start({
        contact: exchangeState.latestContact,
        surfaceAtContact,
        shieldLeadMotion: exchangeState.latestShieldLeadMotion,
        attackDirection: selectedDirection,
        reactionIntentActiveAtImpact: true,
      });
      exchangeState.latestLeadHandoff = Object.freeze({
        stage: COMMITTED_PARRY_CONTACT_GATE_STAGE,
        accepted: exchangeState.latestGripConstraintReport.accepted === true,
        shieldMovingAtContact: exchangeState.latestShieldLeadMotion?.moving === true,
        postContactHoldMs: 0,
        realSweptContact: true,
        shieldSwordGripStage: LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
        modifiedBone: 'wrist.r',
        proximalAssistBone: selectedDirection === 'top' || selectedDirection === 'right' ? 'upperarm.r' : null,
        assistBone: selectedDirection === 'top' || selectedDirection === 'right' ? 'lowerarm.r' : null,
        propagatedBones: Object.freeze(['hand.r', 'handslot.r']),
        elbowPropagationActive: selectedDirection === 'top' || selectedDirection === 'right',
        shoulderPropagationActive: false,
        b3BodyClockStartedAtImpact: true,
        oldB3ReleaseStartPresentationMs: null,
        attackerReactionDefinitionId: exchangeState.latestCombatResult.attackerReaction?.id || null,
        oldB3PlanBackwardPitchDegrees:
          exchangeState.latestCombatResult.attackerReaction?.silhouette?.backwardPitchDegrees ?? null,
        oldB3ImpulsePeakMs: exchangeState.latestCombatResult.attackerReaction?.timeline?.impulsePeakMs ?? null,
        oldB3InitialElapsedMs: exchangeState.latestCombatResult.attackerReaction?.initialElapsedMs ?? null,
        reactionDefinitionSelectedAtImpact: true,
        fullOldB3ReactionIntentActiveAtImpact: false,
        contactConstraintOwnsUntilDeflectImpulse: true,
        handoffConsumedByOldB3: false,
        continuationStartedAtPresentationMs: null,
        continuationStartedAtImpactClockMs: null,
        bodyRestartedAtRelease: false,
        continuationPlanIdentityPreserved: null,
        continuationElapsedPreserved: null,
        weaponArmContactConstrained: true,
        contactBasePoseAuthority: 'authoritative-impact-rig-snapshot',
        noPresetMotionCurve: true,
        authority: 'confirmed-impact-starts-old-b3-body-while-contact-owns-weapon-arm-until-deflect-impulse',
      });
      exchangeState.step3AContactTransfer = Object.freeze({
        accepted: exchangeState.latestGripConstraintReport.accepted === true,
        reason: exchangeState.latestGripConstraintReport.reason || null,
        stage: exchangeState.latestGripConstraintReport.stage || LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
        tangentAuthority: exchangeState.latestGripConstraintReport.plan?.tangentAuthority || null,
        initialDeflectionDirection: exchangeState.latestGripConstraintReport.plan?.initialDeflectionDirection || null,
        modifiedBone: exchangeState.latestGripConstraintReport.modifiedBone || null,
        proximalAssistBone: exchangeState.latestGripConstraintReport.proximalAssistBone || null,
        propagatedBones: exchangeState.latestGripConstraintReport.propagatedBones || null,
        b3BodyClockStartedAtImpact: true,
        attackerReactionDefinitionId: exchangeState.latestCombatResult.attackerReaction?.id || null,
        oldB3PlanBackwardPitchDegrees:
          exchangeState.latestCombatResult.attackerReaction?.silhouette?.backwardPitchDegrees ?? null,
        oldB3ImpulsePeakMs: exchangeState.latestCombatResult.attackerReaction?.timeline?.impulsePeakMs ?? null,
        oldB3InitialElapsedMs: exchangeState.latestCombatResult.attackerReaction?.initialElapsedMs ?? null,
        reactionDefinitionSelectedAtImpact: true,
        fullOldB3ReactionIntentActiveAtImpact: false,
        contactConstraintOwnsUntilDeflectImpulse: true,
        weaponArmContactConstrained: true,
        contactBasePoseAuthority: 'authoritative-impact-rig-snapshot',
        noPresetMotionCurve: true,
        authority: exchangeState.latestLeadHandoff.authority,
      });
      fineTrackingRuntime.reset();
      residualBodyReachRuntime.reset();
      residualStanceReachRuntime.reset();
      publishStatus({
        text: exchangeState.step3AContactTransfer.accepted
          ? 'STEP 3B ACTIVE · OLD B3 body runs from impact · live shield owns the weapon arm until DEFLECT_IMPULSE · then a 28ms bridge joins the arm to the running OLD B3'
          : `STEP 3A FAIL · ${exchangeState.step3AContactTransfer.reason || 'live grip contact constraint rejected'}`,
        className: exchangeState.step3AContactTransfer.accepted ? 'good' : 'bad',
      });
    } else if (selectedMode === 'parry') {
      publishStatus({
        text: `PARRY FAILED → BLOCK · ${exchangeState.latestParryConfirmation?.reason || 'parry gate was not confirmed'}`,
        className: 'warn',
      });
    }
  }

  function updateCombatBeforeGuard({
    deltaSeconds,
    deltaMs,
    selectedDirection,
    hasAttackerRecovery,
    beginAttackRecovery,
  }) {
    const handledCombat = combat.active;
    let liveConstraintNeedsUpdate = false;
    if (!handledCombat) return Object.freeze({ handledCombat: false, liveConstraintNeedsUpdate: false });

    if (ownsLiveContact()) {
      exchangeState.latestCombatUpdate = combat.update(deltaSeconds, {
        camera,
        attackerRecoilChannels: TWO_ACTOR_PARRY_REACTION_CHANNELS.LIVE_CONTACT_BODY,
        attackerRecoilPhaseLatch: TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES.LIVE_CONTACT_IMPULSE_PEAK,
        holdAttackerInterruption: true,
      });
      liveConstraintNeedsUpdate = swordGripConstraint.active;
    } else {
      exchangeState.latestCombatUpdate = combat.update(deltaSeconds, { camera });
      const handoffConsumed = exchangeState.latestCombatUpdate?.recoilUpdate?.postCouplingHandoffApplied === true;
      if (
        handoffConsumed
        && exchangeState.step3AContactTransfer?.releasedToOldB3 === true
        && exchangeState.step3AContactTransfer.handoffConsumedByOldB3 !== true
      ) {
        const phaseClock = exchangeState.latestCombatUpdate.recoilUpdate.phaseClock
          || exchangeState.latestCombatUpdate.recoilUpdate.snapshot?.phaseClock
          || null;
        const appliedHandoff = exchangeState.latestCombatUpdate.recoilUpdate.postCouplingHandoff
          || exchangeState.latestCombatUpdate.recoilUpdate.snapshot?.postCouplingHandoff
          || null;
        exchangeState.step3AContactTransfer = Object.freeze({
          ...exchangeState.step3AContactTransfer,
          handoffConsumedByOldB3: true,
          continuationStartedAtPresentationMs: phaseClock?.previousElapsedMs ?? null,
          continuationStartedAtImpactClockMs:
            exchangeState.latestCombatUpdate.parryReactionClock?.elapsedMs ?? null,
          bodyRestartedAtRelease: false,
          continuationPlanIdentityPreserved: appliedHandoff?.planIdentityPreserved === true,
          continuationElapsedPreserved: appliedHandoff?.presentationElapsedPreserved === true,
          weaponArmJoinedOldB3AtDeflectImpulse: true,
          authority: 'deflect-impulse-continuity-bridge-weapon-arm-joins-running-old-b3',
        });
        publishStatus({
          text: `OLD B3 ARM JOINED · ${selectedDirection.toUpperCase()} DEFLECT_IMPULSE released the weapon arm · ${exchangeState.step3AReleaseBlend?.durationMs ?? 28}ms continuity bridge · running OLD B3 continues from ${phaseClock?.previousElapsedMs?.toFixed(0) ?? '0'}ms`,
          className: 'good',
        });
      }
      if (exchangeState.step3AReleaseBlend) exchangeState.step3AReleaseBlend.elapsedMs += deltaMs;
      if (exchangeState.latestCombatUpdate?.justCompleted && !hasAttackerRecovery) beginAttackRecovery(selectedDirection);
    }
    return Object.freeze({ handledCombat: true, liveConstraintNeedsUpdate });
  }

  function updateLiveConstraintAfterGuard({ deltaSeconds, selectedDirection, needsUpdate }) {
    if (!needsUpdate) return null;
    const wasHolding = exchangeState.latestGripConstraintReport?.holding === true;
    exchangeState.latestGripConstraintReport = swordGripConstraint.update(deltaSeconds, {
      surfaceAtFrame: buckler.getWorldParrySurface(),
      reactionIntentAppliedBeforeConstraint: true,
    });
    updateLiveContactMarkers(exchangeState.latestGripConstraintReport);
    if (!exchangeState.latestGripConstraintReport?.holding) return null;

    const passed = exchangeState.latestGripConstraintReport.inspectionPassed === true;
    const release = ownsLiveContact() ? releaseLiveContactToOldB3({ selectedDirection }) : null;
    if (!wasHolding || release?.accepted) {
      const waitingForDefenderImpulse = release?.reason === 'defender-deflect-marker-not-reached';
      const inspectionFallbackUsed = release?.couplingReport?.inspectionFallbackUsed === true;
      const text = release?.accepted
        ? inspectionFallbackUsed
          ? `PARRY CONFIRMED · ${selectedDirection.toUpperCase()} ${formatInspectionFailureSummary(exchangeState.latestGripConstraintReport)} · DEFLECT_IMPULSE fail-safe release · weapon arm joins the running OLD B3`
          : `LIVE CONTACT VERIFIED · 7/7 PASS · ${selectedDirection.toUpperCase()} DEFLECT_IMPULSE · releasing the weapon arm through the 28ms bridge into the running OLD B3`
        : waitingForDefenderImpulse
          ? `${passed ? 'LIVE CONTACT VERIFIED · 7/7 PASS' : `PARRY CONFIRMED · ${formatInspectionFailureSummary(exchangeState.latestGripConstraintReport)}`} · waiting for defender DEFLECT ${release.defenderReleaseGate.sourceTimeSeconds.toFixed(3)}s / ${release.defenderReleaseGate.requiredSourceTimeSeconds.toFixed(3)}s`
          : passed
            ? `LIVE CONTACT VERIFIED · 7/7 PASS · ${selectedDirection.toUpperCase()} weapon-arm handoff deferred while TOP/RIGHT are calibrated first`
            : `STEP 3A HOLD · ${formatInspectionFailureSummary(exchangeState.latestGripConstraintReport)}`;
      publishStatus({
        text,
        className: release?.accepted || passed ? 'good' : waitingForDefenderImpulse ? 'warn' : 'bad',
      });
    }
    return Object.freeze({ release, passed });
  }

  return Object.freeze({
    ownsLiveContact,
    defenderDeflectReleaseGate,
    updateDefenderDeflectReleaseGate,
    releaseLiveContactToOldB3,
    resolveContact,
    updateCombatBeforeGuard,
    updateLiveConstraintAfterGuard,
    recordVisibleOldB3Sample,
  });
}
