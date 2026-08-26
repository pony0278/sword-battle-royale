import {
  evaluateSweptContactTemporalEligibility,
} from '../../../src/combat/swept-contact-temporal-eligibility.js';
import { createParryRootDisplacementRuntime } from '../../../src/combat/parry-root-displacement.js';
import { createParryArmFlingRuntime } from '../../../src/combat/parry-arm-fling.js';
import { diagnosticIncomingVelocity } from './direct-old-b3-diagnostic.js';
import { createParriedTorsoWorldLeanRuntime } from '../../../src/combat/parried-torso-world-lean.js';

const WEAPON_ARM_RELEASE_BONES = Object.freeze(['upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r', 'handslot.r']);

export function createShieldParryContactHandoffController({
  exchangeState,
  buckler,
  attacker,
  defender,
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
  const attackerRootDisplacement = createParryRootDisplacementRuntime({ rig: attacker?.rig });
  const defenderRootDisplacement = createParryRootDisplacementRuntime({ rig: defender?.rig });
  // THREE is the lab page's classic-script global; these two runtimes write
  // bone quaternions and need its quaternion math.
  const attackerArmFling = createParryArmFlingRuntime(globalThis.THREE, { rig: attacker?.rig });
  const attackerTorsoLean = createParriedTorsoWorldLeanRuntime(globalThis.THREE, { rig: attacker?.rig });
  // Blocking is absorption, so the defender leans too. Its pose is rebuilt
  // from the guard clip every frame, so this servo runs after that rebuild.
  const defenderTorsoLean = createParriedTorsoWorldLeanRuntime(globalThis.THREE, { rig: defender?.rig });
  // Peak shield-surface velocity while the contact is live: the defender's
  // own parry sweep is the excitation the release impulse is built from.
  let lastDeltaMs = 0;
  let previousShieldSurfaceCenter = null;
  let peakShieldSweepVelocity = null;
  let previousHandWorld = null;
  let latestHandVelocity = null;

  // The actor axis both reactions push along.
  function actorBackwardDirection() {
    const THREE_ = globalThis.THREE;
    const attackerHips = attacker?.rig?.bones?.hips;
    const defenderHips = defender?.rig?.bones?.hips;
    if (THREE_?.Vector3 && attackerHips?.getWorldPosition && defenderHips?.getWorldPosition) {
      const a = attackerHips.getWorldPosition(new THREE_.Vector3());
      const d = defenderHips.getWorldPosition(new THREE_.Vector3());
      const x = a.x - d.x;
      const z = a.z - d.z;
      const m = Math.hypot(x, z);
      if (m > 1e-6) return { x: x / m, y: 0, z: z / m };
    }
    return exchangeState.latestCombatResult?.attackerReaction?.plan?.body?.direction || null;
  }

  // Arms the three reaction runtimes for one outcome. Parry calls this at
  // DEFLECT_IMPULSE, once the swept probe has finished owning the geometry;
  // block calls it at impact, because a held shield never takes the blade
  // hostage and there is no release marker to wait for.
  function armContactReaction({ outcome, backwardDirection, contactPoint, surfaceNormal, incomingVelocity,
    shieldSweepVelocity, handOrigin, handReleaseVelocity }) {
    const armFlingPlan = attackerArmFling.start({
      outcome,
      contactPoint,
      surfaceNormal,
      normalSideHint: backwardDirection,
      incomingVelocity,
      shieldSweepVelocity,
      handOrigin,
      handReleaseVelocity,
      momentum: 1,
    });
    const torsoLeanPlan = backwardDirection
      ? attackerTorsoLean.start({ outcome, role: 'attacker', backwardDirection })
      : null;
    const defenderTorsoLeanPlan = backwardDirection
      ? defenderTorsoLean.start({
          outcome,
          role: 'defender',
          backwardDirection: { x: -backwardDirection.x, y: 0, z: -backwardDirection.z },
        })
      : null;
    const attackerDisplacement = attackerRootDisplacement.start({
      role: 'attacker', outcome, backwardDirection, momentum: 1,
    });
    const defenderDisplacement = backwardDirection
      ? defenderRootDisplacement.start({
          role: 'defender',
          outcome,
          backwardDirection: { x: -backwardDirection.x, y: 0, z: -backwardDirection.z },
          momentum: 1,
        })
      : null;

    exchangeState.latestArmFling = armFlingPlan?.accepted === true
      ? Object.freeze({
          outcome,
          impulseMagnitudeNs: armFlingPlan.impulseMagnitudeNs,
          impulse: armFlingPlan.impulse,
          carryDirection: armFlingPlan.carryDirection,
          shoulderAxis: armFlingPlan.joints.shoulder.axis,
          shoulderInitialVelocityRadPerSecond: armFlingPlan.joints.shoulder.initialVelocityRadPerSecond,
          startsAfterDeflectImpulse: outcome !== 'block',
        })
      : Object.freeze({ accepted: false, reason: armFlingPlan?.reason || 'not-planned' });
    exchangeState.latestTorsoLean = torsoLeanPlan?.accepted === true
      ? Object.freeze({
          outcome,
          baseLeanDegrees: torsoLeanPlan.baseLeanDegrees,
          targetBackwardLeanDegrees: torsoLeanPlan.targetBackwardLeanDegrees,
          defenderArmed: defenderTorsoLeanPlan?.accepted === true,
        })
      : Object.freeze({ accepted: false, reason: torsoLeanPlan?.reason || 'not-planned' });
    exchangeState.latestRootDisplacement = Object.freeze({
      outcome,
      attacker: attackerDisplacement?.accepted === true
        ? Object.freeze({ peakMeters: attackerDisplacement.peakMeters, durationMs: attackerDisplacement.durationMs })
        : null,
      defender: defenderDisplacement?.accepted === true
        ? Object.freeze({ peakMeters: defenderDisplacement.peakMeters, durationMs: defenderDisplacement.durationMs })
        : null,
      startsAfterDeflectImpulse: outcome !== 'block',
      reason: attackerDisplacement?.accepted === true ? null : attackerDisplacement?.reason || 'not-planned',
    });
    return { armFlingPlan, attackerDisplacement };
  }

  function trackShieldSweepVelocity(deltaSeconds) {
    const surface = buckler?.getWorldParrySurface?.();
    const center = surface?.center;
    if (!center || !(deltaSeconds > 1e-6)) { previousShieldSurfaceCenter = center || null; return; }
    if (previousShieldSurfaceCenter) {
      const velocity = {
        x: (center.x - previousShieldSurfaceCenter.x) / deltaSeconds,
        y: (center.y - previousShieldSurfaceCenter.y) / deltaSeconds,
        z: (center.z - previousShieldSurfaceCenter.z) / deltaSeconds,
      };
      const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
      const peakSpeed = peakShieldSweepVelocity
        ? Math.hypot(peakShieldSweepVelocity.x, peakShieldSweepVelocity.y, peakShieldSweepVelocity.z)
        : 0;
      if (speed > peakSpeed && speed < 20) peakShieldSweepVelocity = velocity;
    }
    previousShieldSurfaceCenter = center;
    const handBone = attacker?.rig?.bones?.['hand.r'];
    const THREE_ = globalThis.THREE;
    if (handBone?.getWorldPosition && THREE_?.Vector3) {
      const world = handBone.getWorldPosition(new THREE_.Vector3());
      if (previousHandWorld) {
        const velocity = {
          x: (world.x - previousHandWorld.x) / deltaSeconds,
          y: (world.y - previousHandWorld.y) / deltaSeconds,
          z: (world.z - previousHandWorld.z) / deltaSeconds,
        };
        // Peak, not latest: by the release frame the constraint has parked
        // the hand against the shield, so the last-frame velocity is noise.
        // The peak is the shield sweep actually driving the hand.
        const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
        const peak = latestHandVelocity
          ? Math.hypot(latestHandVelocity.x, latestHandVelocity.y, latestHandVelocity.z)
          : 0;
        if (speed > peak && speed < 20) latestHandVelocity = velocity;
      }
      previousHandWorld = { x: world.x, y: world.y, z: world.z };
    }
  }
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
    // guardRuntime rebuilds the defender pose from its clip every frame, so the
    // defender root has to be re-offset after that rebuild, not before it.
    if (defenderTorsoLean.active) {
      defenderTorsoLean.advance(lastDeltaMs);
      exchangeState.latestDefenderTorsoLeanReport = defenderTorsoLean.apply({
        torsoWeight: combat.snapshot.attackerRecoil?.sample?.weights?.torsoWeight ?? 1,
      });
    }
    exchangeState.latestDefenderRootDisplacement = defenderRootDisplacement.apply();
    // Same repaint rule as the attacker: the defender's line avatar was drawn
    // before this root offset landed.
    if (defenderRootDisplacement.active || defenderTorsoLean.active) defender?.update?.(0, camera);
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
    // Displacement and the reaction runtimes are armed here, never earlier:
    // while the swept probe is live it owns parry success, and moving either
    // root would move the geometry it measures.
    const backwardDirection = actorBackwardDirection();
    const saneVelocity = (velocity, capMetersPerSecond) => {
      if (!velocity) return null;
      const speed = Math.hypot(velocity.x || 0, velocity.y || 0, velocity.z || 0);
      return speed > 0.05 && speed <= capMetersPerSecond ? velocity : null;
    };
    const { attackerDisplacement } = armContactReaction({
      outcome: exchangeState.latestCombatResult?.outcome,
      backwardDirection,
      contactPoint: exchangeState.firstContact?.point,
      surfaceNormal: handoff.surfaceAtContact?.normal || buckler?.getWorldParrySurface?.()?.normal,
      incomingVelocity: saneVelocity(exchangeState.firstContact?.incomingVelocity, 12)
        || diagnosticIncomingVelocity(selectedDirection),
      shieldSweepVelocity: saneVelocity(peakShieldSweepVelocity, 6),
      handOrigin: (() => {
        const THREE_ = globalThis.THREE;
        const handBone = attacker?.rig?.bones?.['hand.r'];
        if (!THREE_?.Vector3 || !handBone?.getWorldPosition) return null;
        const world = handBone.getWorldPosition(new THREE_.Vector3());
        return { x: world.x, y: world.y, z: world.z };
      })(),
      handReleaseVelocity: saneVelocity(latestHandVelocity, 6),
    });

    exchangeState.step3AContactTransfer = Object.freeze({
      ...exchangeState.step3AContactTransfer,
      releasedToOldB3: true,
      rootDisplacementArmedAtDeflectImpulse: attackerDisplacement?.accepted === true,
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
        proximalAssistBone: 'upperarm.r',
        assistBone: 'lowerarm.r',
        propagatedBones: Object.freeze(['hand.r', 'handslot.r']),
        elbowPropagationActive: true,
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
    } else if (outcome === 'block') {
      // A held shield never takes the blade hostage, so there is no live grip
      // constraint and no DEFLECT_IMPULSE to wait for: the rebound is the
      // whole reaction and it starts at impact.
      exchangeState.latestCombatUpdate = combat.update(0, { camera });
      attackerSword.update();
      armContactReaction({
        outcome: 'block',
        backwardDirection: actorBackwardDirection(),
        contactPoint: exchangeState.firstContact?.point,
        surfaceNormal: surfaceAtContact?.normal,
        incomingVelocity: diagnosticIncomingVelocity(selectedDirection),
        shieldSweepVelocity: null,
        handOrigin: null,
        handReleaseVelocity: null,
      });
      exchangeState.blockReaction = Object.freeze({
        outcome: 'block',
        startedAtImpact: true,
        liveGripConstraint: false,
        armFlingArmed: exchangeState.latestArmFling?.accepted !== false,
        attackerRootMeters: exchangeState.latestRootDisplacement?.attacker?.peakMeters ?? null,
        defenderRootMeters: exchangeState.latestRootDisplacement?.defender?.peakMeters ?? null,
        authority: 'blocked-rebound-runs-from-impact-with-no-contact-constraint',
      });
      publishStatus({
        text: `BLOCK · ${selectedDirection.toUpperCase()} rebound from impact · no contact constraint · attacker ${((exchangeState.latestRootDisplacement?.attacker?.peakMeters ?? 0) * 100).toFixed(0)}cm back, defender ${((exchangeState.latestRootDisplacement?.defender?.peakMeters ?? 0) * 100).toFixed(0)}cm absorbing`,
        className: 'good',
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
    lastDeltaMs = deltaMs;
    const handledCombat = combat.active;
    let liveConstraintNeedsUpdate = false;
    if (!handledCombat) return Object.freeze({ handledCombat: false, liveConstraintNeedsUpdate: false });

    if (ownsLiveContact()) {
      trackShieldSweepVelocity(deltaSeconds);
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
      // Writers after the presentation, in dependency order: the world-lean
      // servo re-measures and corrects the torso (moving the shoulder), the
      // arm fling then rewrites the arm bones from its own release-time base
      // (replacing, not stacking on, the presentation's arm aim), and the
      // root displacement translates last.
      const recoilWeights = combat.snapshot.attackerRecoil?.sample?.weights || null;
      attackerTorsoLean.advance(deltaMs);
      exchangeState.latestTorsoLeanReport = attackerTorsoLean.apply({
        torsoWeight: recoilWeights?.torsoWeight ?? 1,
      });
      attackerArmFling.advance(deltaMs);
      exchangeState.latestArmFlingReport = attackerArmFling.apply();
      // One clock, two writers: the attacker root is safe to write here because
      // guardRuntime only rebuilds the defender.
      attackerRootDisplacement.advance(deltaMs);
      defenderRootDisplacement.advance(deltaMs);
      exchangeState.latestAttackerRootDisplacement = attackerRootDisplacement.apply();
      // The v3 line avatar (limb connectors, contour, head outline) is only
      // rebuilt inside the character's appearance update, which ran before
      // these last writers rotated the bones. Without a repaint the joint
      // nodes follow the corrected pose while the lines stay one authority
      // behind on every frame.
      if (attackerTorsoLean.active || attackerArmFling.active || attackerRootDisplacement.active) {
        attacker.update(0, camera);
      }
      if (exchangeState.latestCombatUpdate?.justCompleted) {
        // The clock above stops with the exchange, so settle both roots back
        // onto their base rather than leaving a residual offset standing. The
        // arm and torso are different: the recovery blend captures the rig as
        // its source pose, so they release ownership without rewinding and the
        // recovery stands the attacker up from the flung silhouette.
        attackerArmFling.releaseOwnership();
        attackerTorsoLean.releaseOwnership();
        defenderTorsoLean.releaseOwnership();
        resetRootDisplacement();
        exchangeState.latestAttackerRootDisplacement = null;
        exchangeState.latestDefenderRootDisplacement = null;
        if (!hasAttackerRecovery) beginAttackRecovery(selectedDirection);
      }
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

  function resetRootDisplacement() {
    attackerRootDisplacement.reset();
    defenderRootDisplacement.reset();
    attackerArmFling.releaseOwnership();
    attackerTorsoLean.releaseOwnership();
    defenderTorsoLean.releaseOwnership();
    previousShieldSurfaceCenter = null;
    peakShieldSweepVelocity = null;
    previousHandWorld = null;
    latestHandVelocity = null;
    return null;
  }

  return Object.freeze({
    ownsLiveContact,
    resetRootDisplacement,
    defenderDeflectReleaseGate,
    updateDefenderDeflectReleaseGate,
    releaseLiveContactToOldB3,
    resolveContact,
    updateCombatBeforeGuard,
    updateLiveConstraintAfterGuard,
    recordVisibleOldB3Sample,
  });
}
